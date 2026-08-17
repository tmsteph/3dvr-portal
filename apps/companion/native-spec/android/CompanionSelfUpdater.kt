package tech.threedvr.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

object CompanionSelfUpdater {
    private const val prefsName = "companion_self_update"
    private const val maxApkBytes = 300L * 1024L * 1024L
    private const val maxReleaseJsonBytes = 1024L * 1024L
    private const val releaseApi = "https://api.github.com/repos/tmsteph/3dvr-portal/releases?per_page=10"
    private const val companionTagPrefix = "companion-build-"
    private const val companionAssetName = "3dvr-companion.apk"
    private const val checkIntervalMs = 6L * 60L * 60L * 1000L
    private const val retrySameVersionMs = 60L * 60L * 1000L
    private const val sourceChannelId = "companion_update_source"
    private const val sourceNotificationId = 38475

    private val updateExecutor = Executors.newSingleThreadExecutor()
    private val checking = AtomicBoolean(false)

    fun status(context: Context): Map<String, Any?> {
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val canRequest = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else true
        val installSource = runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                context.packageManager.getInstallSourceInfo(context.packageName)
            } else null
        }.getOrNull()
        return mapOf(
            "supported" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S),
            "currentVersionCode" to currentVersionCode(context),
            "canRequestPackageInstalls" to canRequest,
            "installingPackage" to installSource?.installingPackageName,
            "initiatingPackage" to installSource?.initiatingPackageName,
            "updateOwnerPackage" to if (Build.VERSION.SDK_INT >= 34) installSource?.updateOwnerPackageName else null,
            "trustedReleaseUpdates" to true,
            "lastCheckAt" to prefs.getLong("lastCheckAt", 0L).takeIf { it > 0 },
            "lastAttemptedVersionCode" to prefs.getLong("lastAttemptedVersionCode", 0L).takeIf { it > 0 },
            "lastSessionId" to prefs.getInt("lastSessionId", -1).takeIf { it >= 0 },
            "lastStatus" to prefs.getInt("lastStatus", Int.MIN_VALUE).takeIf { it != Int.MIN_VALUE },
            "lastStatusMessage" to prefs.getString("lastStatusMessage", null),
            "lastUpdatedAt" to prefs.getLong("lastUpdatedAt", 0L).takeIf { it > 0 },
        )
    }

    fun maybeCheckTrustedRelease(context: Context, force: Boolean = false) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val appContext = context.applicationContext
        val prefs = appContext.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val lastCheck = prefs.getLong("lastCheckAt", 0L)
        if (!force && lastCheck > 0 && now - lastCheck < checkIntervalMs) return
        if (!checking.compareAndSet(false, true)) return
        prefs.edit().putLong("lastCheckAt", now).apply()
        updateExecutor.execute {
            try {
                checkTrustedRelease(appContext)
            } catch (error: Exception) {
                prefs.edit()
                    .putString("lastStatusMessage", "trusted update check failed: ${safeError(error)}")
                    .putLong("lastUpdatedAt", System.currentTimeMillis())
                    .apply()
            } finally {
                checking.set(false)
            }
        }
    }

    private fun checkTrustedRelease(context: Context) {
        val release = fetchLatestCompanionRelease()
        val currentVersion = currentVersionCode(context)
        if (release.versionCode <= currentVersion) return

        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val lastAttemptedVersion = prefs.getLong("lastAttemptedVersionCode", 0L)
        val lastAttemptedAt = prefs.getLong("lastAttemptedAt", 0L)
        if (lastAttemptedVersion == release.versionCode && now - lastAttemptedAt < retrySameVersionMs) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            prefs.edit()
                .putString("lastStatusMessage", "update ready; install-source authorization required")
                .putLong("lastUpdatedAt", now)
                .apply()
            postSourceAuthorizationNotification(context)
            return
        }

        prefs.edit()
            .putLong("lastAttemptedVersionCode", release.versionCode)
            .putLong("lastAttemptedAt", now)
            .apply()

        val apk = downloadTrustedRelease(context, release)
        verifyTrustedCandidate(context, apk, release)
        installVerifiedApk(context, apk, release.sha256, release.versionCode)
    }

    private fun fetchLatestCompanionRelease(): TrustedRelease {
        val connection = (URL(releaseApi).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8000
            readTimeout = 10000
            requestMethod = "GET"
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            setRequestProperty("User-Agent", "3DVR-Companion-Updater")
        }
        try {
            connection.connect()
            require(connection.responseCode in 200..299) { "release API HTTP ${connection.responseCode}" }
            val raw = readBounded(connection, maxReleaseJsonBytes)
            val releases = JSONArray(raw)
            for (index in 0 until releases.length()) {
                val release = releases.optJSONObject(index) ?: continue
                if (release.optBoolean("draft") || release.optBoolean("prerelease")) continue
                val tag = release.optString("tag_name").trim()
                if (!tag.startsWith(companionTagPrefix)) continue
                val tagVersion = tag.removePrefix(companionTagPrefix).toLongOrNull() ?: continue
                val metadata = runCatching { JSONObject(release.optString("body")) }.getOrNull() ?: continue
                val versionCode = metadata.optLong("versionCode", -1L)
                val versionName = metadata.optString("versionName").trim()
                val sha256 = metadata.optString("sha256").trim().lowercase()
                if (versionCode <= 0 || versionCode != tagVersion || versionName.isEmpty()) continue
                if (!sha256.matches(Regex("^[0-9a-f]{64}$"))) continue
                val assets = release.optJSONArray("assets") ?: continue
                for (assetIndex in 0 until assets.length()) {
                    val asset = assets.optJSONObject(assetIndex) ?: continue
                    if (asset.optString("name") != companionAssetName) continue
                    val apkUrl = asset.optString("browser_download_url").trim()
                    if (!isTrustedInitialApkUrl(apkUrl, tag)) continue
                    return TrustedRelease(versionCode, versionName, sha256, apkUrl, tag)
                }
            }
            throw IllegalStateException("no canonical Companion release found")
        } finally {
            connection.disconnect()
        }
    }

    private fun downloadTrustedRelease(context: Context, release: TrustedRelease): File {
        val apk = File(context.cacheDir, "companion-trusted-update.apk")
        runCatching { apk.delete() }
        val connection = openTrustedDownload(release.apkUrl)
        try {
            val declaredLength = connection.contentLengthLong
            require(declaredLength <= maxApkBytes) { "apk exceeds size limit" }
            val digest = MessageDigest.getInstance("SHA-256")
            var total = 0L
            connection.inputStream.use { input ->
                apk.outputStream().use { output ->
                    val buffer = ByteArray(1024 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        require(total <= maxApkBytes) { "apk exceeds size limit" }
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)
                    }
                    output.flush()
                }
            }
            val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
            require(actualHash == release.sha256) { "sha256 mismatch" }
            return apk
        } catch (error: Exception) {
            apk.delete()
            throw error
        } finally {
            connection.disconnect()
        }
    }

    private fun openTrustedDownload(rawUrl: String): HttpURLConnection {
        var current = URL(rawUrl)
        repeat(5) { hop ->
            require(current.protocol == "https") { "update download must use HTTPS" }
            require(isTrustedDownloadHost(current.host, hop == 0)) { "untrusted update host" }
            val connection = (current.openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 60000
                instanceFollowRedirects = false
                requestMethod = "GET"
                setRequestProperty("User-Agent", "3DVR-Companion-Updater")
            }
            connection.connect()
            if (connection.responseCode in 200..299) return connection
            if (connection.responseCode !in setOf(301, 302, 303, 307, 308)) {
                connection.disconnect()
                throw IllegalStateException("update download HTTP ${connection.responseCode}")
            }
            val location = connection.getHeaderField("Location")
            connection.disconnect()
            require(!location.isNullOrBlank()) { "update redirect missing location" }
            current = URL(current, location)
        }
        throw IllegalStateException("too many update redirects")
    }

    private fun isTrustedInitialApkUrl(rawUrl: String, tag: String): Boolean {
        val uri = runCatching { Uri.parse(rawUrl) }.getOrNull() ?: return false
        return uri.scheme == "https" &&
            uri.host?.lowercase() == "github.com" &&
            uri.path == "/tmsteph/3dvr-portal/releases/download/$tag/$companionAssetName"
    }

    private fun isTrustedDownloadHost(host: String, initial: Boolean): Boolean {
        val normalized = host.lowercase()
        if (initial) return normalized == "github.com"
        return normalized == "github.com" || normalized.endsWith(".githubusercontent.com")
    }

    private fun verifyTrustedCandidate(context: Context, apk: File, release: TrustedRelease) {
        val packageManager = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
        val candidate = packageManager.getPackageArchiveInfo(apk.absolutePath, flags)
            ?: throw SecurityException("downloaded APK is not a valid package")
        require(candidate.packageName == context.packageName) { "downloaded APK package mismatch" }
        val candidateVersion = packageVersionCode(candidate)
        require(candidateVersion == release.versionCode) { "downloaded APK version mismatch" }
        require(candidateVersion > currentVersionCode(context)) { "downloaded APK is not an upgrade" }

        val current = packageManager.getPackageInfo(context.packageName, flags)
        val currentSigners = signingDigests(current)
        val candidateSigners = signingDigests(candidate)
        require(currentSigners.isNotEmpty() && currentSigners == candidateSigners) {
            "downloaded APK signing identity mismatch"
        }
    }

    fun installFromLoopback(context: Context, rawUrl: String, expectedSha256: String): Map<String, Any?> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return mapOf("ok" to false, "error" to "Android 12+ required")
        }
        val uri = runCatching { Uri.parse(rawUrl) }.getOrNull()
            ?: return mapOf("ok" to false, "error" to "invalid url")
        val host = uri.host?.lowercase()
        if (uri.scheme != "http" || host !in setOf("127.0.0.1", "localhost")) {
            return mapOf("ok" to false, "error" to "update source must be loopback http")
        }
        val normalizedHash = expectedSha256.trim().lowercase()
        if (!normalizedHash.matches(Regex("^[0-9a-f]{64}$"))) {
            return mapOf("ok" to false, "error" to "valid sha256 required")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            postSourceAuthorizationNotification(context)
            return mapOf(
                "ok" to false,
                "error" to "package install source not authorized",
                "needsSourceAuthorization" to true,
            )
        }

        val apk = File(context.cacheDir, "companion-self-update.apk")
        runCatching { apk.delete() }
        val connection = (URL(rawUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 5000
            readTimeout = 60000
            instanceFollowRedirects = false
            requestMethod = "GET"
        }
        try {
            connection.connect()
            if (connection.responseCode !in 200..299) {
                return mapOf("ok" to false, "error" to "update download failed: ${connection.responseCode}")
            }
            val declaredLength = connection.contentLengthLong
            if (declaredLength > maxApkBytes) {
                return mapOf("ok" to false, "error" to "apk exceeds size limit")
            }
            val digest = MessageDigest.getInstance("SHA-256")
            var total = 0L
            connection.inputStream.use { input ->
                apk.outputStream().use { output ->
                    val buffer = ByteArray(1024 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        if (total > maxApkBytes) {
                            return mapOf("ok" to false, "error" to "apk exceeds size limit")
                        }
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)
                    }
                    output.flush()
                }
            }
            val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
            if (actualHash != normalizedHash) {
                apk.delete()
                return mapOf("ok" to false, "error" to "sha256 mismatch")
            }
            return installVerifiedApk(context, apk, actualHash, null)
        } finally {
            connection.disconnect()
        }
    }

    private fun installVerifiedApk(
        context: Context,
        apk: File,
        sha256: String,
        versionCode: Long?,
    ): Map<String, Any?> {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            setSize(apk.length())
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("base.apk", 0, apk.length()).use { output ->
                apk.inputStream().use { input -> input.copyTo(output, 1024 * 1024) }
                session.fsync(output)
            }
            val callbackIntent = Intent(context, CompanionInstallResultReceiver::class.java).apply {
                action = "tech.threedvr.companion.SELF_UPDATE_RESULT"
                putExtra("sessionId", sessionId)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val callback = PendingIntent.getBroadcast(context, sessionId, callbackIntent, flags)
            session.commit(callback.intentSender)
        }
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).edit()
            .putInt("lastSessionId", sessionId)
            .putString("lastStatusMessage", "update submitted")
            .putLong("lastUpdatedAt", System.currentTimeMillis())
            .apply()
        return mapOf(
            "ok" to true,
            "sessionId" to sessionId,
            "sha256" to sha256,
            "versionCode" to versionCode,
            "bytes" to apk.length(),
            "requestedNoUserAction" to true,
        )
    }

    private fun postSourceAuthorizationNotification(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(
            sourceChannelId,
            "3DVR Companion update setup",
            NotificationManager.IMPORTANCE_HIGH,
        ))
        val settingsIntent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val pending = PendingIntent.getActivity(
            context,
            sourceNotificationId,
            settingsIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(context, sourceChannelId)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Allow automatic 3DVR Companion updates")
            .setContentText("One Android permission lets Companion install future signed releases itself.")
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        manager.notify(sourceNotificationId, notification)
    }

    private fun currentVersionCode(context: Context): Long {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return packageVersionCode(info)
    }

    private fun packageVersionCode(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.longVersionCode
    } else {
        @Suppress("DEPRECATION")
        info.versionCode.toLong()
    }

    private fun signingDigests(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.signingInfo?.apkContentsSigners?.toList().orEmpty()
        } else {
            @Suppress("DEPRECATION")
            info.signatures?.toList().orEmpty()
        }
        return signatures.map { signature ->
            MessageDigest.getInstance("SHA-256")
                .digest(signature.toByteArray())
                .joinToString("") { "%02x".format(it) }
        }.toSet()
    }

    private fun readBounded(connection: HttpURLConnection, maxBytes: Long): String {
        val declared = connection.contentLengthLong
        require(declared <= maxBytes) { "response too large" }
        var total = 0L
        val output = StringBuilder()
        connection.inputStream.bufferedReader().use { reader ->
            val buffer = CharArray(4096)
            while (true) {
                val read = reader.read(buffer)
                if (read < 0) break
                total += read
                require(total <= maxBytes) { "response too large" }
                output.append(buffer, 0, read)
            }
        }
        return output.toString()
    }

    private fun safeError(error: Exception): String =
        (error.message ?: error::class.java.simpleName).take(180)

    private data class TrustedRelease(
        val versionCode: Long,
        val versionName: String,
        val sha256: String,
        val apkUrl: String,
        val tag: String,
    )
}

class CompanionInstallResultReceiver : BroadcastReceiver() {
    companion object {
        private const val prefsName = "companion_self_update"
        private const val channelId = "companion_updates"
        private const val notificationId = 38474
    }

    override fun onReceive(context: Context, intent: Intent?) {
        intent ?: return
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).edit()
            .putInt("lastStatus", status)
            .putString("lastStatusMessage", message)
            .putLong("lastUpdatedAt", System.currentTimeMillis())
            .apply()

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            val confirmation = if (Build.VERSION.SDK_INT >= 33) {
                intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(Intent.EXTRA_INTENT) as? Intent
            } ?: return
            postConfirmationNotification(context, confirmation)
        }
    }

    private fun postConfirmationNotification(context: Context, confirmation: Intent) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(
                channelId,
                "3DVR Companion updates",
                NotificationManager.IMPORTANCE_HIGH,
            ))
        }
        val pending = PendingIntent.getActivity(
            context,
            0,
            confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, channelId)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }
        manager.notify(notificationId, builder
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("3DVR Companion update needs approval")
            .setContentText("Tap once to let Android finish this update. Future self-updates may be silent.")
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build())
    }
}

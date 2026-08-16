package tech.threedvr.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

object CompanionSelfUpdater {
    private const val prefsName = "companion_self_update"
    private const val maxApkBytes = 300L * 1024L * 1024L

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
            "canRequestPackageInstalls" to canRequest,
            "installingPackage" to installSource?.installingPackageName,
            "initiatingPackage" to installSource?.initiatingPackageName,
            "updateOwnerPackage" to if (Build.VERSION.SDK_INT >= 34) installSource?.updateOwnerPackageName else null,
            "lastSessionId" to prefs.getInt("lastSessionId", -1).takeIf { it >= 0 },
            "lastStatus" to prefs.getInt("lastStatus", Int.MIN_VALUE).takeIf { it != Int.MIN_VALUE },
            "lastStatusMessage" to prefs.getString("lastStatusMessage", null),
            "lastUpdatedAt" to prefs.getLong("lastUpdatedAt", 0L).takeIf { it > 0 },
        )
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
                .putLong("lastUpdatedAt", System.currentTimeMillis())
                .apply()
            return mapOf(
                "ok" to true,
                "sessionId" to sessionId,
                "sha256" to actualHash,
                "bytes" to apk.length(),
                "requestedNoUserAction" to true,
            )
        } finally {
            connection.disconnect()
        }
    }
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

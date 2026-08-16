package tech.threedvr.companion

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import rikka.shizuku.Shizuku

object CompanionShizuku {
    private const val requestCode = 34001
    private const val shizukuPackage = "moe.shizuku.privileged.api"
    private const val downloadUrl = "https://shizuku.rikka.app/download/"

    fun status(context: Context): Map<String, Any?> {
        val installed = runCatching {
            context.packageManager.getPackageInfo(shizukuPackage, 0)
            true
        }.getOrDefault(false)
        val binderAlive = runCatching { Shizuku.pingBinder() }.getOrDefault(false)
        val permission = if (binderAlive) {
            runCatching { Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED }
                .getOrDefault(false)
        } else {
            false
        }
        val uid = if (binderAlive) runCatching { Shizuku.getUid() }.getOrNull() else null
        val version = if (binderAlive) runCatching { Shizuku.getVersion() }.getOrNull() else null
        return mapOf(
            "supported" to true,
            "installed" to installed,
            "binderAlive" to binderAlive,
            "permissionGranted" to permission,
            "uid" to uid,
            "identity" to identityForUid(uid),
            "serverVersion" to version,
        )
    }

    fun requestPermission(): Map<String, Any?> {
        if (!runCatching { Shizuku.pingBinder() }.getOrDefault(false)) {
            return mapOf("ok" to false, "error" to "shizuku_not_running")
        }
        if (runCatching { Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED }.getOrDefault(false)) {
            return mapOf("ok" to true, "alreadyGranted" to true)
        }
        if (runCatching { Shizuku.shouldShowRequestPermissionRationale() }.getOrDefault(false)) {
            return mapOf("ok" to false, "error" to "permission_denied_permanently")
        }
        return runCatching {
            Shizuku.requestPermission(requestCode)
            mapOf("ok" to true, "requested" to true)
        }.getOrElse {
            mapOf("ok" to false, "error" to "permission_request_failed")
        }
    }

    fun identityProbe(): Map<String, Any?> {
        val binderAlive = runCatching { Shizuku.pingBinder() }.getOrDefault(false)
        if (!binderAlive) {
            return mapOf("ok" to false, "error" to "shizuku_not_running")
        }
        val permissionGranted = runCatching {
            Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
        }.getOrDefault(false)
        if (!permissionGranted) {
            return mapOf("ok" to false, "error" to "shizuku_permission_required")
        }
        val uid = runCatching { Shizuku.getUid() }.getOrNull()
            ?: return mapOf("ok" to false, "error" to "shizuku_uid_unavailable")
        val identity = identityForUid(uid)
        return mapOf(
            "ok" to true,
            "uid" to uid,
            "shellIdentityConfirmed" to (uid == 2000 || uid == 0),
            "identity" to identity,
        )
    }

    fun openManagerOrDownload(context: Context): Boolean {
        val launch = context.packageManager.getLaunchIntentForPackage(shizukuPackage)
        if (launch != null) {
            context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return true
        }
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        return true
    }

    private fun identityForUid(uid: Int?): String = when (uid) {
        0 -> "root"
        2000 -> "shell"
        null -> "unavailable"
        else -> "uid:$uid"
    }
}

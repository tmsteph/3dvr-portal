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
            "identity" to when (uid) {
                0 -> "root"
                2000 -> "shell"
                null -> "unavailable"
                else -> "uid:$uid"
            },
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

    @Suppress("DEPRECATION")
    fun identityProbe(): Map<String, Any?> {
        val status = statusHolder()
        if (status["binderAlive"] != true) {
            return mapOf("ok" to false, "error" to "shizuku_not_running")
        }
        if (status["permissionGranted"] != true) {
            return mapOf("ok" to false, "error" to "shizuku_permission_required")
        }
        return runCatching {
            val process = Shizuku.newProcess(arrayOf("id"), null, null)
            val stdout = process.inputStream.bufferedReader().use { it.readText().trim() }
            val stderr = process.errorStream.bufferedReader().use { it.readText().trim() }
            val exit = process.waitFor()
            process.destroy()
            mapOf(
                "ok" to (exit == 0),
                "exit" to exit,
                "shellIdentityConfirmed" to stdout.contains("uid=2000") || stdout.contains("uid=0"),
                "identity" to when {
                    stdout.contains("uid=0") -> "root"
                    stdout.contains("uid=2000") -> "shell"
                    else -> "other"
                },
                "stderrPresent" to stderr.isNotEmpty(),
            )
        }.getOrElse {
            mapOf("ok" to false, "error" to "shizuku_probe_failed")
        }
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

    private fun statusHolder(): Map<String, Any?> {
        val binderAlive = runCatching { Shizuku.pingBinder() }.getOrDefault(false)
        val permission = if (binderAlive) {
            runCatching { Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED }
                .getOrDefault(false)
        } else {
            false
        }
        return mapOf("binderAlive" to binderAlive, "permissionGranted" to permission)
    }
}

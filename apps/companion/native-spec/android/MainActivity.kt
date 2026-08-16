package tech.threedvr.companion

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.view.accessibility.AccessibilityManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.security.SecureRandom

class MainActivity : FlutterActivity() {
    private val channelName = "tech.3dvr.companion/platform"
    private val bridgePrefs = "companion_local_bridge"
    private val bridgeTokenKey = "bearer_token_v1"

    private val knownApps = mapOf(
        "chatgpt" to listOf("com.openai.chatgpt"),
        "maps" to listOf("com.google.android.apps.maps"),
        "gmail" to listOf("com.google.android.gm"),
        "chrome" to listOf("com.android.chrome"),
        "termux" to listOf("com.termux"),
        "calendar" to listOf("com.google.android.calendar", "com.samsung.android.calendar"),
        "camera" to listOf("com.sec.android.app.camera", "com.google.android.GoogleCamera"),
    )

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        startKeepAliveService()
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "deviceStatus" -> result.success(deviceStatus())
                    "capabilityStatus" -> result.success(capabilityStatus())
                    "bridgeToken" -> result.success(getOrCreateBridgeToken())
                    "notificationMetadata" -> result.success(NotificationMetadataStore.snapshot())
                    "messageNotifications" -> result.success(MessageNotificationStore.snapshot())
                    "replyMessageNotification" -> {
                        val key = call.argument<String>("key") ?: ""
                        val text = call.argument<String>("text") ?: ""
                        result.success(MessageNotificationStore.reply(this, key, text))
                    }
                    "openUrl" -> {
                        val raw = call.argument<String>("url") ?: ""
                        result.success(openHttpUrl(raw))
                    }
                    "openKnownApp" -> {
                        val alias = call.argument<String>("alias") ?: ""
                        result.success(openKnownApp(alias))
                    }
                    "openAccessibilitySettings" -> {
                        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                        result.success(true)
                    }
                    "openNotificationAccessSettings" -> {
                        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun startKeepAliveService() {
        val intent = Intent(this, CompanionKeepAliveService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun getOrCreateBridgeToken(): String {
        val prefs = getSharedPreferences(bridgePrefs, Context.MODE_PRIVATE)
        val existing = prefs.getString(bridgeTokenKey, null)
        if (!existing.isNullOrBlank()) return existing

        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        val created = Base64.encodeToString(
            bytes,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
        prefs.edit().putString(bridgeTokenKey, created).apply()
        return created
    }

    private fun deviceStatus(): Map<String, Any?> {
        val battery = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        return mapOf(
            "sdk" to Build.VERSION.SDK_INT,
            "manufacturer" to Build.MANUFACTURER,
            "model" to Build.MODEL,
            "batteryPercent" to battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY),
        )
    }

    private fun capabilityStatus(): Map<String, Any> = mapOf(
        "accessibilityEnabled" to isAccessibilityEnabled(),
        "notificationAccessEnabled" to isNotificationAccessEnabled(),
        "messageNotificationReadEnabled" to isNotificationAccessEnabled(),
        "messageNotificationReplyEnabled" to isNotificationAccessEnabled(),
        "backgroundBridgeEnabled" to true,
        "knownAppLaunchEnabled" to true,
        "remoteKnownActionsEnabled" to false,
        "persistentPairingEnabled" to true,
    )

    private fun openHttpUrl(raw: String): Boolean {
        val uri = runCatching { Uri.parse(raw) }.getOrNull() ?: return false
        if (uri.scheme != "https" && uri.scheme != "http") return false
        startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
    }

    private fun openKnownApp(rawAlias: String): Boolean {
        val alias = rawAlias.trim().lowercase()
        if (alias == "settings") {
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return true
        }
        val candidates = knownApps[alias] ?: return false
        for (packageName in candidates) {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: continue
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(launchIntent)
            return true
        }
        return false
    }

    private fun isAccessibilityEnabled(): Boolean {
        val manager = getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
            ?: return false
        return manager.getEnabledAccessibilityServiceList(
            android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK,
        ).any { info ->
            info.resolveInfo.serviceInfo.packageName == packageName &&
                info.resolveInfo.serviceInfo.name.endsWith("CompanionAccessibilityService")
        }
    }

    private fun isNotificationAccessEnabled(): Boolean {
        val enabled = Settings.Secure.getString(
            contentResolver,
            "enabled_notification_listeners",
        ) ?: return false
        return enabled.split(':').any { component -> component.startsWith("$packageName/") }
    }
}

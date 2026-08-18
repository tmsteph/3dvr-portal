package tech.threedvr.companion

import android.Manifest
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.service.voice.VoiceInteractionService
import android.util.Base64
import android.view.accessibility.AccessibilityManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.security.SecureRandom

class MainActivity : FlutterActivity() {
    private val channelName = "tech.3dvr.companion/platform"
    private val relaySecretsChannelName = "tech.threedvr.companion/relay_secrets"
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
        MessageNotificationStore.initialize(this)
        val relaySecretStore = CompanionRelaySecretStore(this)
        val voiceAuthorizationStore = CompanionVoiceAuthorizationStore(this)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, relaySecretsChannelName)
            .setMethodCallHandler { call, result ->
                val key = call.argument<String>("key")?.trim().orEmpty()
                if (key.isEmpty()) {
                    result.error("invalid_key", "Relay secret key is required.", null)
                    return@setMethodCallHandler
                }
                when (call.method) {
                    "read" -> result.success(relaySecretStore.read(key))
                    "write" -> {
                        val value = call.argument<String>("value")
                        if (value == null) result.error("invalid_value", "Relay secret value is required.", null)
                        else {
                            relaySecretStore.write(key, value)
                            result.success(null)
                        }
                    }
                    "delete" -> {
                        relaySecretStore.delete(key)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "deviceStatus" -> result.success(deviceStatus())
                    "capabilityStatus" -> result.success(capabilityStatus())
                    "assistantStatus" -> result.success(assistantStatus())
                    "voiceReceipt" -> result.success(CompanionVoiceReceiptStore.snapshot(this))
                    "requestAssistantRole" -> result.success(requestAssistantRole())
                    "requestMicrophonePermission" -> result.success(requestMicrophonePermission())
                    "beginVoiceAuthorization" -> result.success(beginVoiceAuthorization(voiceAuthorizationStore))
                    "openVoiceInputSettings" -> {
                        startActivity(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS))
                        result.success(true)
                    }
                    "bridgeToken" -> result.success(getOrCreateBridgeToken())
                    "notificationMetadata" -> result.success(NotificationMetadataStore.snapshot())
                    "messageNotifications" -> {
                        MessageNotificationStore.initialize(this)
                        result.success(MessageNotificationStore.snapshot())
                    }
                    "replyMessageNotification" -> {
                        val key = call.argument<String>("key") ?: ""
                        val text = call.argument<String>("text") ?: ""
                        MessageNotificationStore.initialize(this)
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
    }

    private fun getOrCreateBridgeToken(): String {
        val prefs = getSharedPreferences(bridgePrefs, Context.MODE_PRIVATE)
        val existing = prefs.getString(bridgeTokenKey, null)
        if (!existing.isNullOrBlank()) return existing
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        val created = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        prefs.edit().putString(bridgeTokenKey, created).apply()
        return created
    }

    private fun beginVoiceAuthorization(
        store: CompanionVoiceAuthorizationStore,
    ): Map<String, Any?> {
        val deviceId = CompanionRemoteRelayState.deviceId
        if (CompanionRemoteRelayState.status != "connected" || deviceId.isNullOrBlank()) {
            store.clear()
            return mapOf(
                "ok" to false,
                "error" to "direct relay is not connected",
            )
        }
        val authorization = store.issue()
        return mapOf(
            "ok" to true,
            "deviceId" to deviceId,
            "nonce" to authorization.nonce,
            "expiresAt" to authorization.expiresAt,
        )
    }

    private fun assistantStatus(): Map<String, Any?> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return mapOf(
                "roleAvailable" to false,
                "roleHeld" to false,
                "voiceServiceActive" to false,
                "serviceReady" to false,
            )
        }
        val roleManager = getSystemService(RoleManager::class.java)
        val component = ComponentName(this, CompanionVoiceInteractionService::class.java)
        val persistedState = CompanionAssistantStateStore.snapshot(this)
        return mapOf(
            "roleAvailable" to roleManager.isRoleAvailable(RoleManager.ROLE_ASSISTANT),
            "roleHeld" to roleManager.isRoleHeld(RoleManager.ROLE_ASSISTANT),
            "voiceServiceActive" to VoiceInteractionService.isActiveService(this, component),
            "serviceReady" to (persistedState["serviceReady"] == true),
            "serviceUpdatedAt" to persistedState["serviceUpdatedAt"],
            "lastSessionPreparedAt" to persistedState["lastSessionPreparedAt"],
        )
    }

    private fun requestAssistantRole(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        val roleManager = getSystemService(RoleManager::class.java)
        if (!roleManager.isRoleAvailable(RoleManager.ROLE_ASSISTANT)) return false
        if (roleManager.isRoleHeld(RoleManager.ROLE_ASSISTANT)) return true
        startActivityForResult(
            roleManager.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT),
            ASSISTANT_ROLE_REQUEST_CODE,
        )
        return true
    }

    private fun hasMicrophonePermission(): Boolean =
        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun requestMicrophonePermission(): Boolean {
        if (hasMicrophonePermission()) return true
        requestPermissions(
            arrayOf(Manifest.permission.RECORD_AUDIO),
            MICROPHONE_PERMISSION_REQUEST_CODE,
        )
        return true
    }

    private fun deviceStatus(): Map<String, Any?> {
        val battery = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        return mapOf(
            "sdk" to Build.VERSION.SDK_INT,
            "manufacturer" to Build.MANUFACTURER,
            "model" to Build.MODEL,
            "batteryPercent" to battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY),
            "relayStatus" to CompanionRemoteRelayState.status,
            "relayDeviceId" to CompanionRemoteRelayState.deviceId,
            "relayLastSuccessAt" to CompanionRemoteRelayState.lastSuccessAt,
        )
    }

    private fun capabilityStatus(): Map<String, Any> {
        val assistant = assistantStatus()
        return mapOf(
            "accessibilityEnabled" to isAccessibilityEnabled(),
            "notificationAccessEnabled" to isNotificationAccessEnabled(),
            "microphoneGranted" to hasMicrophonePermission(),
            "messageNotificationReadEnabled" to isNotificationAccessEnabled(),
            "messageNotificationReplyEnabled" to isNotificationAccessEnabled(),
            "messageHistoryEncryptedAtRest" to true,
            "backgroundBridgeEnabled" to true,
            "knownAppLaunchEnabled" to true,
            "remoteKnownActionsEnabled" to true,
            "persistentPairingEnabled" to true,
            "relayCredentialsEncryptedAtRest" to true,
            "directRelayEnabled" to true,
            "directRelayReadOnly" to false,
            "voiceProofEnabled" to true,
            "assistantRoleAvailable" to (assistant["roleAvailable"] == true),
            "assistantRoleHeld" to (assistant["roleHeld"] == true),
            "voiceInteractionServiceActive" to (assistant["voiceServiceActive"] == true),
        )
    }

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
        val manager = getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager ?: return false
        return manager.getEnabledAccessibilityServiceList(android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK).any { info ->
            info.resolveInfo.serviceInfo.packageName == packageName && info.resolveInfo.serviceInfo.name.endsWith("CompanionAccessibilityService")
        }
    }

    private fun isNotificationAccessEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        return enabled.split(':').any { component -> component.startsWith("$packageName/") }
    }

    companion object {
        private const val ASSISTANT_ROLE_REQUEST_CODE = 38474
        private const val MICROPHONE_PERMISSION_REQUEST_CODE = 38475
    }
}

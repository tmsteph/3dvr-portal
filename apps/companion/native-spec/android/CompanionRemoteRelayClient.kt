package tech.threedvr.companion

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection

object CompanionRemoteRelayState {
    @Volatile var status: String = "stopped"
    @Volatile var deviceId: String? = null
    @Volatile var credentialExpiresAt: Long? = null
    @Volatile var lastSuccessAt: Long? = null
    @Volatile var lastError: String? = null

    fun snapshot(): Map<String, Any?> = mapOf(
        "status" to status,
        "deviceId" to deviceId,
        "credentialExpiresAt" to credentialExpiresAt,
        "lastSuccessAt" to lastSuccessAt,
        "lastError" to lastError,
        "relay" to CompanionRemoteRelayClient.RELAY_BASE_URL,
    )
}

/**
 * Owns Companion's direct relay from the always-on foreground service.
 *
 * Remote execution is deliberately capability-based rather than a shell. The
 * user-facing admitted set is health, device.status, app.open_known, and
 * url.open. `voice.authorize` is an internal one-time proof-of-possession
 * challenge used only to bootstrap a locally initiated Realtime voice session.
 * Accessibility, messages, arbitrary packages, Shizuku actions, and shell
 * execution remain outside this direct-relay surface.
 */
class CompanionRemoteRelayClient(context: Context) {
    private val appContext = context.applicationContext
    private val secretStore = CompanionRelaySecretStore(appContext)
    private val voiceAuthorizationStore = CompanionVoiceAuthorizationStore(appContext)
    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)

    fun start() {
        if (!running.compareAndSet(false, true)) return
        CompanionRemoteRelayState.status = "connecting"
        executor.execute { runLoop() }
    }

    fun stop() {
        running.set(false)
        executor.shutdownNow()
        CompanionRemoteRelayState.status = "stopped"
    }

    private fun runLoop() {
        var failures = 0
        while (running.get()) {
            try {
                val credential = ensureCredential()
                CompanionRemoteRelayState.deviceId = credential.deviceId
                CompanionRemoteRelayState.credentialExpiresAt = credential.expiresAt
                CompanionRemoteRelayState.status = "connected"

                val response = request(
                    method = "GET",
                    path = "/relay/v1/devices/${credential.deviceId}/commands/next",
                    credential = credential,
                )
                if (response.statusCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
                    clearCredential()
                    failures = 0
                    continue
                }
                require(response.statusCode in 200..299) { "relay HTTP ${response.statusCode}" }

                val decoded = JSONObject(response.body)
                val command = decoded.optJSONObject("command")
                if (command != null) handleCommand(credential, command)

                CompanionRemoteRelayState.lastSuccessAt = System.currentTimeMillis()
                CompanionRemoteRelayState.lastError = null
                failures = 0
                sleepInterruptibly(POLL_INTERVAL_MS)
            } catch (error: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            } catch (error: Exception) {
                CompanionRemoteRelayState.status = "backing-off"
                CompanionRemoteRelayState.lastError = safeError(error)
                failures = (failures + 1).coerceAtMost(8)
                val delay = (BASE_BACKOFF_MS shl (failures - 1)).coerceAtMost(MAX_BACKOFF_MS)
                try {
                    sleepInterruptibly(delay)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }
        }
    }

    private fun ensureCredential(): DeviceCredential {
        val now = System.currentTimeMillis()
        val storedId = secretStore.read(DEVICE_ID_KEY)
        val storedToken = secretStore.read(DEVICE_TOKEN_KEY)
        val storedExpiry = secretStore.read(DEVICE_EXPIRES_KEY)?.toLongOrNull()
        if (
            !storedId.isNullOrBlank() &&
            !storedToken.isNullOrBlank() &&
            storedExpiry != null &&
            storedExpiry > now + CREDENTIAL_REFRESH_MARGIN_MS
        ) {
            return DeviceCredential(storedId, storedToken, storedExpiry)
        }

        clearCredential()
        val response = request(method = "POST", path = "/relay/v1/devices", body = JSONObject().toString())
        require(response.statusCode in 200..299) { "device bootstrap HTTP ${response.statusCode}" }
        val decoded = JSONObject(response.body)
        val deviceId = decoded.optString("deviceId").trim()
        val token = decoded.optString("deviceToken").trim()
        val expiresAt = decoded.optLong("expiresAt", 0L)
        require(deviceId.length in 22..86 && token.length in 32..128 && expiresAt > now) {
            "relay returned invalid device credential"
        }

        secretStore.write(DEVICE_ID_KEY, deviceId)
        secretStore.write(DEVICE_TOKEN_KEY, token)
        secretStore.write(DEVICE_EXPIRES_KEY, expiresAt.toString())
        return DeviceCredential(deviceId, token, expiresAt)
    }

    private fun handleCommand(credential: DeviceCredential, command: JSONObject) {
        val requestId = command.optString("requestId").trim()
        val capabilityId = command.optString("capabilityId").trim()
        val expiresAt = command.optLong("expiresAt", 0L)
        if (requestId.length !in 16..86 || expiresAt <= System.currentTimeMillis()) return
        val arguments = command.optJSONObject("arguments") ?: JSONObject()

        val result = when (capabilityId) {
            "health" -> CommandResult(
                ok = true,
                data = mapOf(
                    "transport" to "direct-relay",
                    "alwaysOn" to true,
                    "sdk" to Build.VERSION.SDK_INT,
                ),
            )
            "device.status" -> CommandResult(ok = true, data = deviceStatus())
            "app.open_known" -> openKnownApp(arguments)
            "url.open" -> openHttpsUrl(arguments)
            "voice.authorize" -> authorizeVoice(arguments)
            else -> CommandResult(ok = false, code = "unsupported_capability")
        }

        val resultJson = JSONObject().apply {
            put("requestId", requestId)
            put("ok", result.ok)
            result.code?.let { put("code", it) }
            put("data", JSONObject(result.data))
        }
        val response = request(
            method = "POST",
            path = "/relay/v1/devices/${credential.deviceId}/results",
            body = resultJson.toString(),
            credential = credential,
        )
        if (response.statusCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
            clearCredential()
            return
        }
        require(response.statusCode in 200..299) { "result HTTP ${response.statusCode}" }
    }

    private fun authorizeVoice(arguments: JSONObject): CommandResult {
        val nonce = arguments.optString("nonce").trim()
        if (!VOICE_NONCE_RE.matches(nonce)) {
            return CommandResult(false, "invalid_voice_nonce")
        }
        val authorized = voiceAuthorizationStore.consume(nonce)
        return if (authorized) {
            CommandResult(true, data = mapOf("authorized" to true))
        } else {
            CommandResult(false, "voice_authorization_rejected")
        }
    }

    private fun openKnownApp(arguments: JSONObject): CommandResult {
        val alias = arguments.optString("alias").trim().lowercase()
        if (alias !in ALLOWED_APP_ALIASES) return CommandResult(false, "unsupported_app_alias")

        if (alias == "settings") {
            appContext.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return CommandResult(true, data = mapOf("opened" to true, "alias" to alias))
        }

        val candidates = KNOWN_APPS[alias] ?: return CommandResult(false, "unsupported_app_alias")
        for (packageName in candidates) {
            val intent = appContext.packageManager.getLaunchIntentForPackage(packageName) ?: continue
            appContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return CommandResult(true, data = mapOf("opened" to true, "alias" to alias))
        }
        return CommandResult(false, "app_not_installed", mapOf("alias" to alias))
    }

    private fun openHttpsUrl(arguments: JSONObject): CommandResult {
        val raw = arguments.optString("url").trim()
        if (raw.isEmpty() || raw.length > 2048) return CommandResult(false, "invalid_url")
        val uri = runCatching { Uri.parse(raw) }.getOrNull() ?: return CommandResult(false, "invalid_url")
        if (uri.scheme != "https" || !uri.userInfo.isNullOrEmpty() || uri.host.isNullOrBlank()) {
            return CommandResult(false, "invalid_url")
        }
        appContext.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return CommandResult(true, data = mapOf("opened" to true))
    }

    private fun deviceStatus(): Map<String, Any?> {
        val battery = appContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        return mapOf(
            "sdk" to Build.VERSION.SDK_INT,
            "manufacturer" to Build.MANUFACTURER,
            "model" to Build.MODEL,
            "batteryPercent" to battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY),
            "bridgeActive" to true,
            "capabilities" to listOf("health", "device.status", "app.open_known", "url.open"),
        )
    }

    private fun request(
        method: String,
        path: String,
        body: String? = null,
        credential: DeviceCredential? = null,
    ): HttpResponse {
        require(path.startsWith('/'))
        val connection = URL(RELAY_BASE_URL + path).openConnection() as HttpsURLConnection
        connection.requestMethod = method
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.useCaches = false
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("User-Agent", "3DVR-Companion-Android")
        credential?.let {
            connection.setRequestProperty("Authorization", "Bearer ${it.token}")
            connection.setRequestProperty("X-3DVR-Device", it.deviceId)
        }
        if (body != null) {
            val bytes = body.toByteArray(StandardCharsets.UTF_8)
            require(bytes.size <= MAX_BODY_BYTES)
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { it.write(bytes) }
        }

        val status = connection.responseCode
        val input = if (status in 200..299) connection.inputStream else connection.errorStream
        val responseBody = readLimited(input)
        connection.disconnect()
        return HttpResponse(status, responseBody)
    }

    private fun readLimited(input: InputStream?): String {
        if (input == null) return ""
        val reader = BufferedReader(InputStreamReader(input, StandardCharsets.UTF_8))
        val result = StringBuilder()
        val buffer = CharArray(2048)
        var total = 0
        reader.use {
            while (true) {
                val count = it.read(buffer)
                if (count < 0) break
                total += count
                require(total <= MAX_RESPONSE_CHARS) { "relay response too large" }
                result.append(buffer, 0, count)
            }
        }
        return result.toString()
    }

    private fun clearCredential() {
        secretStore.delete(DEVICE_ID_KEY)
        secretStore.delete(DEVICE_TOKEN_KEY)
        secretStore.delete(DEVICE_EXPIRES_KEY)
        CompanionRemoteRelayState.deviceId = null
        CompanionRemoteRelayState.credentialExpiresAt = null
    }

    private fun sleepInterruptibly(milliseconds: Long) {
        if (!running.get()) return
        Thread.sleep(milliseconds)
    }

    private fun safeError(error: Exception): String {
        val name = error::class.java.simpleName.ifBlank { "RelayError" }
        val message = error.message.orEmpty()
            .replace(Regex("Bearer\\s+[^\\s]+", RegexOption.IGNORE_CASE), "Bearer <redacted>")
            .take(160)
        return if (message.isBlank()) name else "$name: $message"
    }

    private data class DeviceCredential(val deviceId: String, val token: String, val expiresAt: Long)
    private data class HttpResponse(val statusCode: Int, val body: String)
    private data class CommandResult(
        val ok: Boolean,
        val code: String? = null,
        val data: Map<String, Any?> = emptyMap(),
    )

    companion object {
        const val RELAY_BASE_URL = "https://gun-relay-3dvr.fly.dev"

        private val VOICE_NONCE_RE = Regex("^[A-Za-z0-9_-]{24,128}$")
        private val ALLOWED_APP_ALIASES = setOf(
            "settings", "chatgpt", "maps", "gmail", "chrome", "calendar", "camera", "messages",
        )
        private val KNOWN_APPS = mapOf(
            "chatgpt" to listOf("com.openai.chatgpt"),
            "maps" to listOf("com.google.android.apps.maps"),
            "gmail" to listOf("com.google.android.gm"),
            "chrome" to listOf("com.android.chrome"),
            "calendar" to listOf("com.google.android.calendar", "com.samsung.android.calendar"),
            "camera" to listOf("com.sec.android.app.camera", "com.google.android.GoogleCamera"),
            "messages" to listOf("com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms"),
        "whatsapp" to listOf("com.whatsapp", "com.whatsapp.w4b"),
        )

        private const val DEVICE_ID_KEY = "remote.device_id"
        private const val DEVICE_TOKEN_KEY = "remote.device_token"
        private const val DEVICE_EXPIRES_KEY = "remote.expires_at"
        private const val CREDENTIAL_REFRESH_MARGIN_MS = 60_000L
        private const val POLL_INTERVAL_MS = 2_000L
        private const val BASE_BACKOFF_MS = 1_000L
        private const val MAX_BACKOFF_MS = 30_000L
        private const val CONNECT_TIMEOUT_MS = 10_000
        private const val READ_TIMEOUT_MS = 15_000
        private const val MAX_BODY_BYTES = 32 * 1024
        private const val MAX_RESPONSE_CHARS = 64 * 1024
    }
}

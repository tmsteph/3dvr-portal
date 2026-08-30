package tech.threedvr.companion

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.concurrent.Executors

object CompanionBridgeAuth {
    private const val prefsName = "companion_local_bridge"
    private const val tokenKey = "bearer_token_v1"

    fun getOrCreateToken(context: Context): String {
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val existing = prefs.getString(tokenKey, null)
        if (!existing.isNullOrBlank()) return existing
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        val token = Base64.encodeToString(
            bytes,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
        prefs.edit().putString(tokenKey, token).apply()
        return token
    }
}

object CompanionNativeBridgeServer {
    const val port = 38473
    private val executor = Executors.newCachedThreadPool()
    @Volatile private var serverSocket: ServerSocket? = null
    @Volatile private var appContext: Context? = null

    fun ensureStarted(context: Context) {
        appContext = context.applicationContext
        if (serverSocket?.isClosed == false) return
        synchronized(this) {
            if (serverSocket?.isClosed == false) return
            executor.execute {
                runCatching {
                    val socket = ServerSocket()
                    socket.reuseAddress = true
                    socket.bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), port))
                    serverSocket = socket
                    while (!socket.isClosed) {
                        val client = runCatching { socket.accept() }.getOrNull() ?: break
                        executor.execute { handleClient(client) }
                    }
                }
            }
        }
    }

    fun stop() {
        runCatching { serverSocket?.close() }
        serverSocket = null
    }

    private fun handleClient(socket: Socket) {
        socket.use { client ->
            client.soTimeout = 10000
            val request = runCatching { readRequest(client) }.getOrNull()
            if (request == null) {
                writeJson(client, 400, mapOf("ok" to false, "error" to "bad request"))
                return
            }
            val context = appContext
            if (context == null) {
                writeJson(client, 503, mapOf("ok" to false, "error" to "bridge unavailable"))
                return
            }
            val expected = "Bearer ${CompanionBridgeAuth.getOrCreateToken(context)}"
            if (request.headers["authorization"] != expected) {
                writeJson(client, 401, mapOf("ok" to false, "error" to "unauthorized"))
                return
            }
            val response = runCatching { route(context, request) }.getOrElse {
                HttpResponse(500, mapOf("ok" to false, "error" to "request failed"))
            }
            writeJson(client, response.status, response.body)
        }
    }

    private fun route(context: Context, request: HttpRequest): HttpResponse {
        if (request.method == "GET" && request.path == "/v1/health") {
            return HttpResponse(200, mapOf(
                "ok" to true,
                "transport" to "native-loopback",
                "alwaysOn" to true,
                "capabilities" to listOf(
                    "device.status",
                    "url.open",
                    "app.open_known",
                    "notification.metadata.read",
                    "messages.notification.read",
                    "messages.notification.reply",
                    "messages.notification.status",
                    "messages.notification.settings",
                    "ui.snapshot",
                    "ui.perform",
                    "update.status",
                    "update.install",
                    "shizuku.status",
                    "shizuku.permission",
                    "shizuku.probe",
                ),
            ))
        }
        if (request.method == "GET" && request.path == "/v1/device-status") {
            val battery = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            return HttpResponse(200, mapOf(
                "ok" to true,
                "status" to mapOf(
                    "sdk" to Build.VERSION.SDK_INT,
                    "manufacturer" to Build.MANUFACTURER,
                    "model" to Build.MODEL,
                    "batteryPercent" to battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY),
                ),
            ))
        }
        if (request.method == "GET" && request.path == "/v1/notification-metadata") {
            return HttpResponse(200, mapOf(
                "ok" to true,
                "notifications" to NotificationMetadataStore.snapshot(),
            ))
        }
        if (request.method == "GET" && request.path == "/v1/messages/status") {
            MessageNotificationStore.initialize(context)
            val notificationAccessEnabled = isNotificationAccessEnabled(context)
            return HttpResponse(200, mapOf(
                "ok" to true,
                "notificationAccessEnabled" to notificationAccessEnabled,
                "messageNotificationReadEnabled" to notificationAccessEnabled,
                "messageNotificationReplyEnabled" to notificationAccessEnabled,
                "historyCount" to MessageNotificationStore.snapshot().size,
                "storage" to "encrypted-on-device-history",
            ))
        }
        if (request.method == "POST" && request.path == "/v1/messages/open-settings") {
            return HttpResponse(400, mapOf(
                "ok" to false,
                "foregroundInteractionRequired" to true,
                "intentAction" to Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS,
                "error" to "foreground interaction required to open notification access settings",
            ))
        }
        if (request.method == "GET" && request.path == "/v1/messages/recent") {
            return HttpResponse(200, mapOf(
                "ok" to true,
                "storage" to "encrypted-on-device-history",
                "retention" to mapOf("maxEntries" to 50, "maxAgeDays" to 7),
                "messages" to MessageNotificationStore.snapshot(),
            ))
        }
        if (request.method == "POST" && request.path == "/v1/messages/reply") {
            val body = request.jsonBody()
            val key = body?.optString("key")?.trim().orEmpty()
            val text = body?.optString("text")?.trim().orEmpty()
            if (key.isEmpty() || text.isEmpty() || text.length > 4000) {
                return HttpResponse(400, mapOf("ok" to false, "error" to "key and text are required"))
            }
            return HttpResponse(200, mapOf(
                "ok" to MessageNotificationStore.reply(context, key, text),
                "key" to key,
            ))
        }
        if (request.method == "GET" && request.path == "/v1/ui/snapshot") {
            return HttpResponse(200, mapOf("ok" to true, "snapshot" to CompanionAccessibilityService.snapshot()))
        }
        if (request.method == "POST" && request.path == "/v1/ui/action") {
            val body = request.jsonBody() ?: return HttpResponse(400, mapOf("ok" to false, "error" to "json body required"))
            val action = jsonObjectToMap(body)
            return HttpResponse(200, mapOf("ok" to CompanionAccessibilityService.perform(action)))
        }
        if (request.method == "GET" && request.path == "/v1/shizuku/status") {
            return HttpResponse(200, mapOf(
                "ok" to true,
                "shizuku" to CompanionShizuku.status(context),
            ))
        }
        if (request.method == "POST" && request.path == "/v1/shizuku/request-permission") {
            val result = CompanionShizuku.requestPermission()
            return HttpResponse(if (result["ok"] == true) 200 else 400, result)
        }
        if (request.method == "POST" && request.path == "/v1/shizuku/probe") {
            val result = CompanionShizuku.identityProbe()
            return HttpResponse(if (result["ok"] == true) 200 else 400, result)
        }
        if (request.method == "POST" && request.path == "/v1/open-url") {
            val raw = request.jsonBody()?.optString("url")?.trim().orEmpty()
            val uri = runCatching { Uri.parse(raw) }.getOrNull()
            if (uri == null || (uri.scheme != "https" && uri.scheme != "http")) {
                return HttpResponse(400, mapOf("ok" to false, "error" to "valid http(s) url required"))
            }
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return HttpResponse(200, mapOf("ok" to true))
        }
        if (request.method == "POST" && request.path == "/v1/open-app") {
            val alias = request.jsonBody()?.optString("alias")?.trim()?.lowercase().orEmpty()
            return HttpResponse(200, mapOf("ok" to openKnownApp(context, alias), "alias" to alias))
        }
        if (request.method == "GET" && request.path == "/v1/update/status") {
            return HttpResponse(200, mapOf("ok" to true, "update" to CompanionSelfUpdater.status(context)))
        }
        if (request.method == "POST" && request.path == "/v1/update/install") {
            val body = request.jsonBody()
            val url = body?.optString("url")?.trim().orEmpty()
            val sha256 = body?.optString("sha256")?.trim().orEmpty()
            if (url.isEmpty() || sha256.isEmpty()) {
                return HttpResponse(400, mapOf("ok" to false, "error" to "url and sha256 are required"))
            }
            val result = CompanionSelfUpdater.installFromLoopback(context, url, sha256)
            return HttpResponse(if (result["ok"] == true) 200 else 400, result)
        }
        return HttpResponse(404, mapOf("ok" to false, "error" to "not found"))
    }

    private fun isNotificationAccessEnabled(context: Context): Boolean {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return false
        val component = ComponentName(context, CompanionNotificationListener::class.java)
        return manager.isNotificationListenerAccessGranted(component)
    }

    private fun openKnownApp(context: Context, alias: String): Boolean {
        if (alias == "settings") {
            context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return true
        }
        if (alias == "shizuku") {
            return CompanionShizuku.openManagerOrDownload(context)
        }
        val candidates = mapOf(
            "chatgpt" to listOf("com.openai.chatgpt"),
            "maps" to listOf("com.google.android.apps.maps"),
            "gmail" to listOf("com.google.android.gm"),
            "chrome" to listOf("com.android.chrome"),
            "termux" to listOf("com.termux"),
            "termux_x11" to listOf("com.termux.x11"),
            "calendar" to listOf("com.google.android.calendar", "com.samsung.android.calendar"),
            "camera" to listOf("com.sec.android.app.camera", "com.google.android.GoogleCamera"),
            "messages" to listOf("com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms"),
            "whatsapp" to listOf("com.whatsapp", "com.whatsapp.w4b"),
        )[alias] ?: return false
        for (packageName in candidates) {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: continue
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return true
        }
        return false
    }

    private data class HttpRequest(
        val method: String,
        val path: String,
        val headers: Map<String, String>,
        val body: ByteArray,
    ) {
        fun jsonBody(): JSONObject? = if (body.isEmpty()) null else runCatching {
            JSONObject(String(body, StandardCharsets.UTF_8))
        }.getOrNull()
    }

    private data class HttpResponse(val status: Int, val body: Map<String, Any?>)

    private fun readRequest(socket: Socket): HttpRequest? {
        val input = BufferedInputStream(socket.getInputStream())
        val header = ByteArrayOutputStream()
        var matched = 0
        while (header.size() < 32768) {
            val value = input.read()
            if (value < 0) return null
            header.write(value)
            matched = when {
                matched == 0 && value == 13 -> 1
                matched == 1 && value == 10 -> 2
                matched == 2 && value == 13 -> 3
                matched == 3 && value == 10 -> 4
                value == 13 -> 1
                else -> 0
            }
            if (matched == 4) break
        }
        if (matched != 4) return null
        val headerText = header.toString(StandardCharsets.ISO_8859_1.name())
        val lines = headerText.split("\r\n")
        val first = lines.firstOrNull()?.split(" ") ?: return null
        if (first.size < 2) return null
        val headers = linkedMapOf<String, String>()
        for (line in lines.drop(1)) {
            val index = line.indexOf(':')
            if (index <= 0) continue
            headers[line.substring(0, index).trim().lowercase()] = line.substring(index + 1).trim()
        }
        val length = headers["content-length"]?.toIntOrNull()?.coerceIn(0, 65536) ?: 0
        val body = ByteArray(length)
        var offset = 0
        while (offset < length) {
            val count = input.read(body, offset, length - offset)
            if (count <= 0) break
            offset += count
        }
        if (offset != length) return null
        return HttpRequest(first[0].uppercase(), first[1].substringBefore('?'), headers, body)
    }

    private fun writeJson(socket: Socket, status: Int, body: Map<String, Any?>) {
        val json = toJsonObject(body).toString().toByteArray(StandardCharsets.UTF_8)
        val reason = when (status) {
            200 -> "OK"
            400 -> "Bad Request"
            401 -> "Unauthorized"
            404 -> "Not Found"
            503 -> "Service Unavailable"
            else -> "Internal Server Error"
        }
        val head = buildString {
            append("HTTP/1.1 $status $reason\r\n")
            append("Content-Type: application/json; charset=utf-8\r\n")
            append("Cache-Control: no-store\r\n")
            append("Connection: close\r\n")
            append("Content-Length: ${json.size}\r\n\r\n")
        }.toByteArray(StandardCharsets.ISO_8859_1)
        socket.getOutputStream().apply {
            write(head)
            write(json)
            flush()
        }
    }

    private fun toJsonObject(map: Map<String, Any?>): JSONObject {
        val result = JSONObject()
        map.forEach { (key, value) -> result.put(key, toJsonValue(value)) }
        return result
    }

    private fun toJsonValue(value: Any?): Any? = when (value) {
        null -> JSONObject.NULL
        is Map<*, *> -> {
            val result = JSONObject()
            value.forEach { (k, v) -> if (k != null) result.put(k.toString(), toJsonValue(v)) }
            result
        }
        is Iterable<*> -> JSONArray().apply { value.forEach { put(toJsonValue(it)) } }
        is Array<*> -> JSONArray().apply { value.forEach { put(toJsonValue(it)) } }
        else -> value
    }

    private fun jsonObjectToMap(value: JSONObject): Map<String, Any?> {
        val result = linkedMapOf<String, Any?>()
        val keys = value.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            result[key] = fromJsonValue(value.opt(key))
        }
        return result
    }

    private fun fromJsonValue(value: Any?): Any? = when (value) {
        JSONObject.NULL -> null
        is JSONObject -> jsonObjectToMap(value)
        is JSONArray -> (0 until value.length()).map { fromJsonValue(value.opt(it)) }
        else -> value
    }
}

package tech.threedvr.companion

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.SecureRandom
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection

class CompanionPresenceAudioRecorder(
    private val service: CompanionAccessibilityService,
) {
    private val executor = Executors.newSingleThreadExecutor()
    private val recording = AtomicBoolean(false)

    @Volatile private var recorder: MediaRecorder? = null
    @Volatile private var sessionId: String? = null
    @Volatile private var startedAt: Long? = null
    @Volatile private var localBytes: Long = 0L
    @Volatile private var uploadedBytes: Long = 0L
    @Volatile private var uploadState: String = "idle"
    @Volatile private var lastError: String? = null

    @Synchronized
    fun start(): Map<String, Any?> {
        if (recording.get()) return status() + ("ok" to true)
        val config = readConfig()
            ?: return status() + mapOf("ok" to false, "error" to "Shared Presence is not paired.")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return status() + mapOf("ok" to false, "error" to "Android 10 or newer is required.")
        }
        if (service.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            return status() + mapOf("ok" to false, "error" to "Microphone permission is required.")
        }
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            service.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return status() + mapOf(
                "ok" to false,
                "error" to "Notification permission is required so recording stays visibly announced.",
            )
        }

        val id = newSessionId()
        val directory = File(service.filesDir, "presence-audio").apply { mkdirs() }
        val file = File(directory, "$id.ogg")
        val next = createRecorder(file)
        return try {
            next.prepare()
            next.start()
            recorder = next
            sessionId = id
            startedAt = System.currentTimeMillis()
            localBytes = 0L
            uploadedBytes = 0L
            uploadState = "connecting"
            lastError = null
            recording.set(true)
            showRecordingNotification()
            executor.execute { uploadUntilFinalized(config, id, file) }
            status() + ("ok" to true)
        } catch (error: Exception) {
            runCatching { next.release() }
            file.delete()
            lastError = safeError(error)
            status() + mapOf("ok" to false, "error" to (lastError ?: "Could not start recording."))
        }
    }
    @Synchronized
    fun stop(): Map<String, Any?> {
        if (!recording.get()) return status() + ("ok" to true)
        val active = recorder
        recorder = null
        try {
            active?.stop()
        } catch (error: Exception) {
            lastError = "Recorder stop: ${safeError(error)}"
        } finally {
            runCatching { active?.release() }
            recording.set(false)
            cancelRecordingNotification()
        }
        return status() + ("ok" to true)
    }

    fun shutdown() {
        stop()
        executor.shutdownNow()
    }

    fun status(): Map<String, Any?> {
        val config = readConfig()
        return mapOf(
            "paired" to (config != null),
            "server" to config?.server,
            "viewUrl" to config?.let { "${it.server}/presence-audio/#view=${it.viewToken}" },
            "recording" to recording.get(),
            "sessionId" to sessionId,
            "startedAt" to startedAt,
            "localBytes" to localBytes,
            "uploadedBytes" to uploadedBytes,
            "uploadState" to uploadState,
            "lastError" to lastError,
        )
    }
    @Suppress("DEPRECATION")
    private fun createRecorder(file: File): MediaRecorder {
        val next = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(service)
        } else {
            MediaRecorder()
        }
        next.setAudioSource(MediaRecorder.AudioSource.MIC)
        next.setOutputFormat(MediaRecorder.OutputFormat.OGG)
        next.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
        next.setAudioChannels(1)
        next.setAudioSamplingRate(48_000)
        next.setAudioEncodingBitRate(32_000)
        next.setOutputFile(file.absolutePath)
        return next
    }

    private fun uploadUntilFinalized(config: Config, id: String, file: File) {
        var failures = 0
        while (!Thread.currentThread().isInterrupted) {
            try {
                val offset = remoteOffset(config, id)
                val length = file.length()
                localBytes = length
                require(offset <= length) { "Server offset is ahead of local recording." }
                uploadedBytes = offset
                uploadState = if (offset < length || recording.get()) "streaming" else "finishing"
                streamFromOffset(config, id, file, offset)
                failures = 0

                if (!recording.get()) {
                    val serverBytes = remoteOffset(config, id)
                    localBytes = file.length()
                    uploadedBytes = serverBytes
                    if (serverBytes >= localBytes && finalizeRemote(config, id)) {
                        uploadState = "complete"
                        file.delete()
                        return
                    }
                }
            } catch (error: InterruptedException) {
                Thread.currentThread().interrupt()
                return
            } catch (error: Exception) {
                lastError = safeError(error)
                uploadState = "reconnecting"
                failures = (failures + 1).coerceAtMost(6)
                sleepInterruptibly((1_000L shl (failures - 1)).coerceAtMost(30_000L))
            }
        }
    }
    private fun remoteOffset(config: Config, id: String): Long {
        val connection = openConnection(config, "/api/presence-audio/offset/$id", "GET")
        return try {
            val status = connection.responseCode
            val body = readResponse(connection)
            require(status in 200..299) { "Offset request failed ($status)." }
            JSONObject(body).optLong("offset", 0L)
        } finally {
            connection.disconnect()
        }
    }

    private fun streamFromOffset(config: Config, id: String, file: File, offset: Long) {
        val connection = openConnection(config, "/api/presence-audio/stream", "POST").apply {
            doOutput = true
            setRequestProperty("Content-Type", "audio/ogg")
            setRequestProperty("X-3DVR-Session", id)
            setRequestProperty("X-3DVR-Offset", offset.toString())
            setChunkedStreamingMode(16 * 1024)
            readTimeout = STREAM_READ_TIMEOUT_MS
        }

        RandomAccessFile(file, "r").use { input ->
            input.seek(offset)
            connection.outputStream.use { output ->
                val buffer = ByteArray(16 * 1024)
                while (true) {
                    val length = input.length()
                    localBytes = length
                    val position = input.filePointer
                    if (position < length) {
                        val count = input.read(buffer, 0, minOf(buffer.size.toLong(), length - position).toInt())
                        if (count > 0) {
                            output.write(buffer, 0, count)
                            output.flush()
                            uploadedBytes = input.filePointer
                            uploadState = "streaming"
                            continue
                        }
                    }
                    if (!recording.get()) break
                    sleepInterruptibly(FILE_TAIL_POLL_MS)
                }
            }
        }
        try {
            val status = connection.responseCode
            val body = readResponse(connection)
            require(status in 200..299) { "Audio upload failed ($status)." }
            val reported = JSONObject(body).optLong("offset", uploadedBytes)
            uploadedBytes = maxOf(uploadedBytes, reported)
        } finally {
            connection.disconnect()
        }
    }

    private fun finalizeRemote(config: Config, id: String): Boolean {
        val connection = openConnection(config, "/api/presence-audio/finalize/$id", "POST").apply {
            doOutput = true
            setFixedLengthStreamingMode(0)
        }
        return try {
            connection.outputStream.use { }
            val status = connection.responseCode
            readResponse(connection)
            status in 200..299
        } finally {
            connection.disconnect()
        }
    }

    private fun openConnection(config: Config, path: String, method: String): HttpsURLConnection {
        val connection = URL(config.server + path).openConnection() as HttpsURLConnection
        connection.requestMethod = method
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = REQUEST_READ_TIMEOUT_MS
        connection.useCaches = false
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Authorization", "Bearer ${config.uploadToken}")
        connection.setRequestProperty("User-Agent", "3DVR-Companion-Presence")
        return connection
    }

    private fun readResponse(connection: HttpURLConnection): String {
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        return stream?.bufferedReader()?.use { it.readText().take(32 * 1024) }.orEmpty()
    }
    private fun showRecordingNotification() {
        val manager = service.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(
                    NOTIFICATION_CHANNEL,
                    "Shared Presence recording",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "Always visible while 3DVR Companion is sharing ambient microphone audio."
                    setShowBadge(true)
                },
            )
        }
        val openIntent = service.packageManager.getLaunchIntentForPackage(service.packageName)
        val pending = PendingIntent.getActivity(
            service,
            0,
            openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(service, NOTIFICATION_CHANNEL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(service)
        }
        manager.notify(
            NOTIFICATION_ID,
            builder
                .setContentTitle("Shared audio recording ON")
                .setContentText("3DVR Companion is recording and sharing the ambient microphone.")
                .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pending)
                .build(),
        )
    }

    private fun cancelRecordingNotification() {
        service.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
    }
    private fun readConfig(): Config? = readConfigFrom(service)

    private fun newSessionId(): String {
        val random = ByteArray(9)
        SecureRandom().nextBytes(random)
        val suffix = random.joinToString("") { "%02x".format(it) }
        return "presence_${System.currentTimeMillis().toString(36)}_$suffix"
    }

    private fun sleepInterruptibly(milliseconds: Long) {
        Thread.sleep(milliseconds)
    }

    private fun safeError(error: Exception): String {
        val name = error::class.java.simpleName.ifBlank { "PresenceAudioError" }
        val message = error.message.orEmpty()
            .replace(Regex("Bearer\\s+[^\\s]+", RegexOption.IGNORE_CASE), "Bearer <redacted>")
            .take(180)
        return if (message.isBlank()) name else "$name: $message"
    }

    private data class Config(
        val server: String,
        val uploadToken: String,
        val viewToken: String,
    )

    companion object {
        private const val SERVER_KEY = "presence.server"
        private const val UPLOAD_TOKEN_KEY = "presence.upload_token"
        private const val VIEW_TOKEN_KEY = "presence.view_token"
        private const val NOTIFICATION_CHANNEL = "presence_audio"
        private const val NOTIFICATION_ID = 38479
        private const val FILE_TAIL_POLL_MS = 150L
        private const val CONNECT_TIMEOUT_MS = 10_000
        private const val REQUEST_READ_TIMEOUT_MS = 15_000
        private const val STREAM_READ_TIMEOUT_MS = 60_000

        fun configure(context: Context, serverRaw: String, uploadToken: String, viewToken: String): Boolean {
            val server = normalizeServer(serverRaw) ?: return false
            if (uploadToken.length < 32 || viewToken.length < 32) return false
            val store = CompanionRelaySecretStore(context.applicationContext)
            store.write(SERVER_KEY, server)
            store.write(UPLOAD_TOKEN_KEY, uploadToken)
            store.write(VIEW_TOKEN_KEY, viewToken)
            return true
        }

        fun configurationStatus(context: Context): Map<String, Any?> {
            val config = readConfigFrom(context)
            return mapOf(
                "paired" to (config != null),
                "server" to config?.server,
                "viewUrl" to config?.let { "${it.server}/presence-audio/#view=${it.viewToken}" },
            )
        }

        private fun readConfigFrom(context: Context): Config? {
            val store = CompanionRelaySecretStore(context.applicationContext)
            val server = normalizeServer(store.read(SERVER_KEY).orEmpty()) ?: return null
            val upload = store.read(UPLOAD_TOKEN_KEY).orEmpty()
            val view = store.read(VIEW_TOKEN_KEY).orEmpty()
            if (upload.length < 32 || view.length < 32) return null
            return Config(server, upload, view)
        }

        private fun normalizeServer(raw: String): String? {
            return runCatching {
                val uri = URI(raw.trim())
                if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.rawUserInfo != null) return null
                if (!uri.rawQuery.isNullOrEmpty() || !uri.rawFragment.isNullOrEmpty()) return null
                if (!uri.path.isNullOrEmpty() && uri.path != "/") return null
                "https://${uri.rawAuthority}"
            }.getOrNull()
        }
    }
}

package tech.threedvr.companion

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets

/**
 * Cross-process readiness state for Android's VoiceInteractionService and
 * VoiceInteractionSession. Android runs those components in dedicated
 * processes, so ordinary Kotlin object fields are not shared with MainActivity.
 */
object CompanionAssistantStateStore {
    private const val SERVICE_FILE = "companion_assistant_service.json"
    private const val SESSION_FILE = "companion_assistant_session.json"

    fun setServiceReady(context: Context, ready: Boolean) {
        writeJson(
            atomicFile(context, SERVICE_FILE),
            JSONObject().apply {
                put("serviceReady", ready)
                put("updatedAt", System.currentTimeMillis())
            },
        )
    }

    fun markSessionPrepared(context: Context) {
        writeJson(
            atomicFile(context, SESSION_FILE),
            JSONObject().apply {
                put("lastSessionPreparedAt", System.currentTimeMillis())
            },
        )
    }

    fun snapshot(context: Context): Map<String, Any?> {
        val service = readJson(atomicFile(context, SERVICE_FILE))
        val session = readJson(atomicFile(context, SESSION_FILE))
        return mapOf(
            "serviceReady" to (service?.optBoolean("serviceReady", false) ?: false),
            "serviceUpdatedAt" to service?.optLong("updatedAt", 0L)?.takeIf { it > 0L },
            "lastSessionPreparedAt" to session?.optLong("lastSessionPreparedAt", 0L)?.takeIf { it > 0L },
        )
    }

    private fun atomicFile(context: Context, name: String): AtomicFile =
        AtomicFile(File(context.filesDir, name))

    private fun writeJson(file: AtomicFile, payload: JSONObject) {
        val output = runCatching { file.startWrite() }.getOrNull() ?: return
        try {
            output.write(payload.toString().toByteArray(StandardCharsets.UTF_8))
            output.flush()
            file.finishWrite(output)
        } catch (_: Exception) {
            file.failWrite(output)
        }
    }

    private fun readJson(file: AtomicFile): JSONObject? {
        val bytes = runCatching { file.readFully() }.getOrNull() ?: return null
        return runCatching { JSONObject(String(bytes, StandardCharsets.UTF_8)) }.getOrNull()
    }
}

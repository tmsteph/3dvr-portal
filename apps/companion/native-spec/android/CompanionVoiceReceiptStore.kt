package tech.threedvr.companion

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets

/**
 * Stores only the latest bounded voice action receipt for user-visible audit.
 * No raw audio is stored, and receipts intentionally avoid secrets or tokens.
 *
 * The Assistant session runs in a separate Android process, so this uses an
 * app-private AtomicFile instead of SharedPreferences to keep cross-process
 * reads deterministic.
 */
object CompanionVoiceReceiptStore {
    private const val FILE_NAME = "companion_voice_receipt.json"

    fun record(
        context: Context,
        transcript: String,
        capability: String,
        target: String,
        ok: Boolean,
        code: String,
    ) {
        val payload = JSONObject().apply {
            put("timestamp", System.currentTimeMillis())
            put("transcript", transcript.take(240))
            put("capability", capability.take(80))
            put("target", target.take(120))
            put("ok", ok)
            put("code", code.take(120))
            put("backend", "companion-native")
            put("transport", "android-assistant")
            put("credentialsRedacted", true)
            put("fallbackUsed", false)
        }
        val atomicFile = atomicFile(context)
        val output = runCatching { atomicFile.startWrite() }.getOrNull() ?: return
        try {
            output.write(payload.toString().toByteArray(StandardCharsets.UTF_8))
            output.flush()
            atomicFile.finishWrite(output)
        } catch (_: Exception) {
            atomicFile.failWrite(output)
        }
    }

    fun snapshot(context: Context): Map<String, Any?> {
        val bytes = runCatching { atomicFile(context).readFully() }.getOrNull() ?: return emptyMap()
        val payload = runCatching {
            JSONObject(String(bytes, StandardCharsets.UTF_8))
        }.getOrNull() ?: return emptyMap()
        val timestamp = payload.optLong("timestamp", 0L)
        if (timestamp <= 0L) return emptyMap()
        return mapOf(
            "timestamp" to timestamp,
            "transcript" to payload.optString("transcript"),
            "capability" to payload.optString("capability"),
            "target" to payload.optString("target"),
            "ok" to payload.optBoolean("ok", false),
            "code" to payload.optString("code"),
            "backend" to payload.optString("backend", "companion-native"),
            "transport" to payload.optString("transport", "android-assistant"),
            "credentialsRedacted" to payload.optBoolean("credentialsRedacted", true),
            "fallbackUsed" to payload.optBoolean("fallbackUsed", false),
        )
    }

    private fun atomicFile(context: Context): AtomicFile =
        AtomicFile(File(context.filesDir, FILE_NAME))
}

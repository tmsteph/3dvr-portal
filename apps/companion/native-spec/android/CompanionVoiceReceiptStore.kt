package tech.threedvr.companion

import android.content.Context

/**
 * Stores only the latest bounded voice action receipt for user-visible audit.
 * No raw audio is stored, and receipts intentionally avoid secrets or tokens.
 */
object CompanionVoiceReceiptStore {
    private const val PREFS = "companion_voice_receipt"
    private const val KEY_TIMESTAMP = "timestamp"
    private const val KEY_TRANSCRIPT = "transcript"
    private const val KEY_CAPABILITY = "capability"
    private const val KEY_TARGET = "target"
    private const val KEY_OK = "ok"
    private const val KEY_CODE = "code"

    fun record(
        context: Context,
        transcript: String,
        capability: String,
        target: String,
        ok: Boolean,
        code: String,
    ) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_TIMESTAMP, System.currentTimeMillis())
            .putString(KEY_TRANSCRIPT, transcript.take(240))
            .putString(KEY_CAPABILITY, capability.take(80))
            .putString(KEY_TARGET, target.take(120))
            .putBoolean(KEY_OK, ok)
            .putString(KEY_CODE, code.take(120))
            .apply()
    }

    fun snapshot(context: Context): Map<String, Any?> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val timestamp = prefs.getLong(KEY_TIMESTAMP, 0L)
        if (timestamp <= 0L) return emptyMap()
        return mapOf(
            "timestamp" to timestamp,
            "transcript" to prefs.getString(KEY_TRANSCRIPT, "").orEmpty(),
            "capability" to prefs.getString(KEY_CAPABILITY, "").orEmpty(),
            "target" to prefs.getString(KEY_TARGET, "").orEmpty(),
            "ok" to prefs.getBoolean(KEY_OK, false),
            "code" to prefs.getString(KEY_CODE, "").orEmpty(),
        )
    }
}

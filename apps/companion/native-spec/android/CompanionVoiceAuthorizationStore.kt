package tech.threedvr.companion

import android.content.Context
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * One-use proof that a Realtime voice session was initiated locally on this phone.
 *
 * The opaque nonce may cross the Flutter/Portal boundary, but the relay bearer
 * credential never does. A matching relay challenge consumes the nonce.
 */
class CompanionVoiceAuthorizationStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun issue(now: Long = System.currentTimeMillis()): VoiceAuthorization {
        val bytes = ByteArray(24)
        SecureRandom().nextBytes(bytes)
        val nonce = Base64.encodeToString(
            bytes,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
        val expiresAt = now + TTL_MS
        prefs.edit()
            .putString(KEY_NONCE, nonce)
            .putLong(KEY_EXPIRES_AT, expiresAt)
            .apply()
        return VoiceAuthorization(nonce, expiresAt)
    }

    fun consume(candidate: String, now: Long = System.currentTimeMillis()): Boolean {
        val expected = prefs.getString(KEY_NONCE, null)
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L)
        if (expected.isNullOrBlank() || expiresAt <= now) {
            clear()
            return false
        }
        if (!secureEquals(expected, candidate)) return false
        clear()
        return true
    }

    fun clear() {
        prefs.edit().remove(KEY_NONCE).remove(KEY_EXPIRES_AT).apply()
    }

    private fun secureEquals(left: String, right: String): Boolean {
        val leftBytes = left.toByteArray(Charsets.UTF_8)
        val rightBytes = right.toByteArray(Charsets.UTF_8)
        return MessageDigest.isEqual(leftBytes, rightBytes)
    }

    data class VoiceAuthorization(
        val nonce: String,
        val expiresAt: Long,
    )

    companion object {
        private const val PREFS_NAME = "companion_voice_authorization"
        private const val KEY_NONCE = "pending_nonce"
        private const val KEY_EXPIRES_AT = "pending_expires_at"
        const val TTL_MS = 30_000L
    }
}

package tech.threedvr.companion

import android.app.Notification
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Telephony
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

object NotificationMetadataStore {
    private const val maxEntries = 50
    private val lock = Any()
    private val entries = LinkedHashMap<String, Map<String, Any?>>()

    fun upsert(notification: StatusBarNotification) {
        val metadata = mapOf(
            "packageName" to notification.packageName,
            "postedAt" to notification.postTime,
            "isOngoing" to notification.isOngoing,
            "category" to notification.notification.category,
        )
        synchronized(lock) {
            entries[notification.key] = metadata
            while (entries.size > maxEntries) {
                val firstKey = entries.keys.firstOrNull() ?: break
                entries.remove(firstKey)
            }
        }
    }

    fun remove(notification: StatusBarNotification) {
        synchronized(lock) { entries.remove(notification.key) }
    }

    fun snapshot(): List<Map<String, Any?>> = synchronized(lock) {
        entries.values.toList().asReversed()
    }
}

private data class MessageNotificationEntry(
    val payload: Map<String, Any?>,
    val replyAction: Notification.Action?,
)

object MessageNotificationStore {
    private const val maxEntries = 50
    private const val retentionMs = 7L * 24L * 60L * 60L * 1000L
    private const val prefsName = "companion_message_history"
    private const val prefsKey = "encrypted_history_v1"
    private const val keyAlias = "3dvr_companion_message_history_v1"
    private const val cipherName = "AES/GCM/NoPadding"
    private val lock = Any()
    private val entries = LinkedHashMap<String, MessageNotificationEntry>()
    private var loaded = false
    private val knownMessagingPackages = setOf(
        "com.google.android.apps.messaging",
        "com.samsung.android.messaging",
        "com.android.mms",
        "com.whatsapp",
        "com.whatsapp.w4b",
    )

    fun initialize(context: Context) {
        synchronized(lock) {
            if (loaded) return
            loaded = true
            loadLocked(context.applicationContext)
            pruneLocked()
            persistLocked(context.applicationContext)
        }
    }

    fun upsert(context: Context, notification: StatusBarNotification) {
        initialize(context)
        val defaultSmsPackage = runCatching { Telephony.Sms.getDefaultSmsPackage(context) }.getOrNull()
        val isSupportedMessagingApp = notification.packageName == defaultSmsPackage ||
            notification.packageName in knownMessagingPackages
        if (!isSupportedMessagingApp) return

        val source = notification.notification
        val extras = source.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
        val conversationTitle = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()
        val replyAction = source.actions
            ?.firstOrNull { action -> !action.remoteInputs.isNullOrEmpty() }

        val payload = mapOf(
            "key" to notification.key,
            "packageName" to notification.packageName,
            "postedAt" to notification.postTime,
            "title" to title,
            "text" to (bigText ?: text),
            "conversationTitle" to conversationTitle,
            "hasReplyAction" to (replyAction != null),
            "active" to true,
        )

        synchronized(lock) {
            entries[notification.key] = MessageNotificationEntry(payload, replyAction)
            pruneLocked()
            persistLocked(context.applicationContext)
        }
    }

    fun markRemoved(context: Context, notification: StatusBarNotification) {
        initialize(context)
        synchronized(lock) {
            val existing = entries[notification.key] ?: return
            val retained = existing.payload.toMutableMap().apply {
                put("hasReplyAction", false)
                put("active", false)
            }
            entries[notification.key] = MessageNotificationEntry(retained, null)
            pruneLocked()
            persistLocked(context.applicationContext)
        }
    }

    fun snapshot(): List<Map<String, Any?>> = synchronized(lock) {
        entries.values.map { it.payload }.asReversed()
    }

    fun reply(context: Context, key: String, text: String): Boolean {
        initialize(context)
        val replyText = text.trim()
        if (replyText.isEmpty() || replyText.length > 4000) return false

        val action = synchronized(lock) { entries[key]?.replyAction } ?: return false
        val remoteInput = action.remoteInputs?.firstOrNull() ?: return false
        val fillInIntent = Intent()
        val results = Bundle().apply {
            putCharSequence(remoteInput.resultKey, replyText)
        }
        RemoteInput.addResultsToIntent(arrayOf(remoteInput), fillInIntent, results)

        return runCatching {
            action.actionIntent.send(context, 0, fillInIntent)
            true
        }.getOrDefault(false)
    }

    private fun pruneLocked() {
        val cutoff = System.currentTimeMillis() - retentionMs
        val staleKeys = entries.entries
            .filter { (_, entry) ->
                val postedAt = (entry.payload["postedAt"] as? Number)?.toLong() ?: 0L
                postedAt in 1 until cutoff
            }
            .map { it.key }
        staleKeys.forEach(entries::remove)

        while (entries.size > maxEntries) {
            val oldest = entries.entries.minByOrNull { (_, entry) ->
                (entry.payload["postedAt"] as? Number)?.toLong() ?: Long.MIN_VALUE
            } ?: break
            entries.remove(oldest.key)
        }
    }

    private fun loadLocked(context: Context) {
        val encoded = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .getString(prefsKey, null)
            ?: return
        val plaintext = runCatching { decrypt(encoded) }.getOrNull() ?: return
        val array = runCatching { JSONArray(plaintext) }.getOrNull() ?: return
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val key = item.optString("key", "").trim()
            if (key.isEmpty()) continue
            val payload = mutableMapOf<String, Any?>(
                "key" to key,
                "packageName" to item.optString("packageName", ""),
                "postedAt" to item.optLong("postedAt", 0L),
                "title" to nullableString(item, "title"),
                "text" to nullableString(item, "text"),
                "conversationTitle" to nullableString(item, "conversationTitle"),
                "hasReplyAction" to false,
                "active" to false,
            )
            entries[key] = MessageNotificationEntry(payload, null)
        }
    }

    private fun persistLocked(context: Context) {
        val array = JSONArray()
        entries.values.forEach { entry ->
            val payload = entry.payload
            val item = JSONObject()
            item.put("key", payload["key"] ?: "")
            item.put("packageName", payload["packageName"] ?: "")
            item.put("postedAt", (payload["postedAt"] as? Number)?.toLong() ?: 0L)
            item.put("title", payload["title"] ?: JSONObject.NULL)
            item.put("text", payload["text"] ?: JSONObject.NULL)
            item.put("conversationTitle", payload["conversationTitle"] ?: JSONObject.NULL)
            array.put(item)
        }
        val encrypted = runCatching { encrypt(array.toString()) }.getOrNull() ?: return
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .putString(prefsKey, encrypted)
            .apply()
    }

    private fun nullableString(item: JSONObject, key: String): String? {
        if (!item.has(key) || item.isNull(key)) return null
        return item.optString(key, null)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = keyStore.getKey(keyAlias, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(cipherName)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return JSONObject()
            .put("v", 1)
            .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .put("ct", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .toString()
    }

    private fun decrypt(encoded: String): String {
        val payload = JSONObject(encoded)
        if (payload.optInt("v", 0) != 1) throw IllegalArgumentException("unsupported history version")
        val iv = Base64.decode(payload.getString("iv"), Base64.DEFAULT)
        val ciphertext = Base64.decode(payload.getString("ct"), Base64.DEFAULT)
        val cipher = Cipher.getInstance(cipherName)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }
}

/**
 * Keeps low-sensitivity notification metadata in one store and a separate,
 * encrypted-at-rest history for notifications from the current/default SMS app.
 *
 * Message bodies are never written to plaintext disk or to the metadata store.
 * Dismissed notifications are retained for at most seven days / fifty entries,
 * but their reply actions are removed. Android may redact sensitive notification
 * content before it reaches this listener.
 */
class CompanionNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
        MessageNotificationStore.initialize(this)
        activeNotifications?.forEach { notification ->
            NotificationMetadataStore.upsert(notification)
            MessageNotificationStore.upsert(this, notification)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        NotificationMetadataStore.upsert(sbn)
        MessageNotificationStore.upsert(this, sbn)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        sbn ?: return
        NotificationMetadataStore.remove(sbn)
        MessageNotificationStore.markRemoved(this, sbn)
    }
}

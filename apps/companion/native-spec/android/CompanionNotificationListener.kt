package tech.threedvr.companion

import android.app.Notification
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

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
    private const val maxEntries = 25
    private val lock = Any()
    private val entries = LinkedHashMap<String, MessageNotificationEntry>()
    private val knownSmsPackages = setOf(
        "com.google.android.apps.messaging",
        "com.samsung.android.messaging",
        "com.android.mms",
    )

    fun upsert(context: Context, notification: StatusBarNotification) {
        val defaultSmsPackage = runCatching { Telephony.Sms.getDefaultSmsPackage(context) }.getOrNull()
        val isSmsApp = notification.packageName == defaultSmsPackage ||
            notification.packageName in knownSmsPackages
        if (!isSmsApp) return

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
        )

        synchronized(lock) {
            entries[notification.key] = MessageNotificationEntry(payload, replyAction)
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
        entries.values.map { it.payload }.asReversed()
    }

    fun reply(context: Context, key: String, text: String): Boolean {
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
}

/**
 * Keeps low-sensitivity notification metadata in one store and a separate,
 * memory-only snapshot for notifications from the current/default SMS app.
 *
 * Message bodies are never written to disk or to the metadata store. Android
 * may redact sensitive notification content before it reaches this listener.
 */
class CompanionNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
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
        MessageNotificationStore.remove(sbn)
    }
}

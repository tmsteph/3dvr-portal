package tech.threedvr.companion

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

/**
 * Keeps only low-sensitivity notification metadata in memory.
 * Message bodies, titles, text, tokens, and notification extras are never stored.
 */
class CompanionNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn?.let(NotificationMetadataStore::upsert)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        sbn?.let(NotificationMetadataStore::remove)
    }
}

package tech.threedvr.companion

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Notification listener seed.
 *
 * v0.1 intentionally normalizes only low-sensitivity metadata and does not
 * persist notification body text, message content, or tokens.
 */
class CompanionNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val notification = sbn ?: return
        val metadata = mapOf(
            "packageName" to notification.packageName,
            "postedAt" to notification.postTime,
            "isOngoing" to notification.isOngoing,
            "category" to notification.notification.category,
        )
        // TODO: hand this local metadata to Companion's encrypted local store.
        @Suppress("UNUSED_VARIABLE")
        val normalized = metadata
    }
}

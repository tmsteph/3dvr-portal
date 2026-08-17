package tech.threedvr.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

class CompanionKeepAliveService : Service() {
    companion object {
        private const val channelId = "companion_bridge"
        private const val notificationId = 38473
    }

    private var remoteRelay: CompanionRemoteRelayClient? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startForeground(notificationId, buildNotification())
        CompanionNativeBridgeServer.ensureStarted(this)
        remoteRelay = CompanionRemoteRelayClient(this).also { it.start() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        CompanionNativeBridgeServer.ensureStarted(this)
        if (remoteRelay == null) {
            remoteRelay = CompanionRemoteRelayClient(this).also { it.start() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        remoteRelay?.stop()
        remoteRelay = null
        CompanionNativeBridgeServer.stop()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            channelId,
            "3DVR Companion bridge",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Keeps the local and authenticated remote Companion bridges available while the app is in the background."
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, channelId)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("3DVR Companion active")
            .setContentText("Always-on local + secure relay assistant bridge")
            .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }
}

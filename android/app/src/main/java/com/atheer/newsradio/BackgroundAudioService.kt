package com.atheer.newsradio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class BackgroundAudioService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var mediaSession: MediaSession? = null

    companion object {
        const val CHANNEL_ID = "atheer_live_radio_playback"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.atheer.newsradio.action.START_BACKGROUND_AUDIO"
        const val ACTION_STOP = "com.atheer.newsradio.action.STOP_BACKGROUND_AUDIO"
        const val ACTION_MEDIA_COMMAND = "com.atheer.newsradio.action.MEDIA_COMMAND"
        const val EXTRA_STATION_TEXT = "extra_station_text"
        const val EXTRA_IS_PLAYING = "extra_is_playing"
        const val EXTRA_MEDIA_COMMAND = "extra_media_command"

        fun createStartIntent(
            context: Context,
            stationText: String? = null,
            isPlaying: Boolean = true
        ): Intent {
            return Intent(context, BackgroundAudioService::class.java).apply {
                action = ACTION_START
                if (!stationText.isNullOrBlank()) {
                    putExtra(EXTRA_STATION_TEXT, stationText)
                }
                putExtra(EXTRA_IS_PLAYING, isPlaying)
            }
        }

        fun createStopIntent(context: Context): Intent {
            return Intent(context, BackgroundAudioService::class.java).apply {
                action = ACTION_STOP
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        setupMediaSession()
        acquireWakeLock()
    }

    private fun setupMediaSession() {
        mediaSession = MediaSession(this, "AtheerNewsRadioMediaSession").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = dispatchMediaCommand("play")
                override fun onPause() = dispatchMediaCommand("pause")
                override fun onStop() = dispatchMediaCommand("pause")
                override fun onSkipToNext() = dispatchMediaCommand("next")
                override fun onSkipToPrevious() = dispatchMediaCommand("prev")
            })
            isActive = true
        }
    }

    private fun dispatchMediaCommand(command: String) {
        val intent = Intent(ACTION_MEDIA_COMMAND).apply {
            setPackage(packageName)
            putExtra(EXTRA_MEDIA_COMMAND, command)
        }
        sendBroadcast(intent)
    }

    private fun updateMediaSessionState(stationText: String, isPlaying: Boolean) {
        val session = mediaSession ?: return
        val metadata = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, stationText)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, getString(R.string.app_name))
            .putString(MediaMetadata.METADATA_KEY_ALBUM, "إذاعة صوتية مباشرة")
            .build()
        session.setMetadata(metadata)

        val stateCode = if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
        val actions = PlaybackState.ACTION_PLAY or
            PlaybackState.ACTION_PAUSE or
            PlaybackState.ACTION_PLAY_PAUSE or
            PlaybackState.ACTION_STOP or
            PlaybackState.ACTION_SKIP_TO_NEXT or
            PlaybackState.ACTION_SKIP_TO_PREVIOUS
        val playbackState = PlaybackState.Builder()
            .setActions(actions)
            .setState(stateCode, PlaybackState.PLAYBACK_POSITION_UNKNOWN, if (isPlaying) 1.0f else 0.0f)
            .build()
        session.setPlaybackState(playbackState)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            releaseWakeLock()
            mediaSession?.isActive = false
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        acquireWakeLock()
        val stationText = intent?.getStringExtra(EXTRA_STATION_TEXT)
            ?: getString(R.string.notification_default_text)
        val isPlaying = intent?.getBooleanExtra(EXTRA_IS_PLAYING, true) ?: true

        updateMediaSessionState(stationText, isPlaying)
        val notification = buildNotification(stationText)

        val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        } else {
            0
        }

        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceType)
        return START_STICKY
    }

    private fun buildNotification(contentText: String): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            createStopIntent(this),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val smallIconRes = if (applicationInfo.icon != 0) {
            applicationInfo.icon
        } else {
            android.R.drawable.ic_media_play
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(contentText)
            .setSmallIcon(smallIconRes)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openPendingIntent)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                getString(R.string.notification_action_stop),
                stopPendingIntent
            )
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_channel_desc)
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "AtheerNewsRadio::BackgroundAudioWakeLock"
        ).apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let { lock ->
            if (lock.isHeld) {
                lock.release()
            }
        }
        wakeLock = null
    }

    override fun onDestroy() {
        mediaSession?.let { session ->
            session.isActive = false
            session.release()
        }
        mediaSession = null
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

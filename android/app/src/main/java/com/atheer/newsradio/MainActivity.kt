package com.atheer.newsradio

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: BackgroundWebView
    private lateinit var fullscreenContainer: FrameLayout
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    private val mediaCommandReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val command = intent?.getStringExtra(BackgroundAudioService.EXTRA_MEDIA_COMMAND) ?: return
            val safeCommand = when (command) {
                "play", "pause", "toggle", "next", "prev" -> command
                else -> return
            }
            webView.post {
                webView.evaluateJavascript(
                    "window.__atheerMediaAction && window.__atheerMediaAction('$safeCommand')",
                    null
                )
            }
        }
    }

    companion object {
        private const val LOCAL_DOMAIN = "atheer.appassets.androidplatform.net"
        private const val LOCAL_ENTRY_URL = "https://$LOCAL_DOMAIN/assets/index.html"
        private const val REQUEST_CODE_NOTIFICATIONS = 2001
    }

    private inner class AndroidAudioBridge {
        @JavascriptInterface
        fun updatePlaybackState(stationLabel: String, isPlaying: Boolean) {
            runOnUiThread {
                val text = if (isPlaying) {
                    "يبث الآن: $stationLabel"
                } else {
                    getString(R.string.notification_default_text)
                }
                startBackgroundAudioService(text, isPlaying)
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestNotificationPermissionIfNeeded()
        startBackgroundAudioService(getString(R.string.notification_default_text), false)

        ContextCompat.registerReceiver(
            this,
            mediaCommandReceiver,
            IntentFilter(BackgroundAudioService.ACTION_MEDIA_COMMAND),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(LOCAL_DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0B0E13"))
        }

        webView = BackgroundWebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0E13"))
            keepScreenOn = true
            addJavascriptInterface(AndroidAudioBridge(), "AtheerAndroid")
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                loadsImagesAutomatically = true
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                cacheMode = WebSettings.LOAD_DEFAULT
                useWideViewPort = true
                loadWithOverviewMode = true
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val uri = request?.url ?: return false
                    val host = uri.host ?: return false
                    val remoteHost = Uri.parse(BuildConfig.REMOTE_APP_URL).host
                    if (
                        host == LOCAL_DOMAIN ||
                        host == remoteHost ||
                        host.endsWith("youtube.com") ||
                        host.endsWith("youtube-nocookie.com")
                    ) {
                        return false
                    }
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                    if (customView != null) {
                        callback?.onCustomViewHidden()
                        return
                    }
                    customView = view
                    customViewCallback = callback
                    fullscreenContainer.addView(view)
                    fullscreenContainer.visibility = View.VISIBLE
                    webView.visibility = View.GONE
                }

                override fun onHideCustomView() {
                    customView?.let { fullscreenContainer.removeView(it) }
                    customView = null
                    customViewCallback?.onCustomViewHidden()
                    customViewCallback = null
                    fullscreenContainer.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                }
            }
        }

        fullscreenContainer = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            visibility = View.GONE
        }

        root.addView(webView)
        root.addView(fullscreenContainer)
        setContentView(root)

        // Loads the bundled offline-safe HTTPS app asset so it works immediately with zero 404 errors
        webView.loadUrl(LOCAL_ENTRY_URL)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
                } else if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    // Minimize app to background instead of closing so live radio audio continues
                    moveTaskToBack(true)
                }
            }
        })
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        super.onPause()
        // Intentionally keep WebView and JS timers running for background & lock-screen audio
        webView.resumeTimers()
    }

    override fun onStop() {
        super.onStop()
        // Keep Foreground Service active so the OS does not suspend live audio playback
        webView.resumeTimers()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    REQUEST_CODE_NOTIFICATIONS
                )
            }
        }
    }

    private fun startBackgroundAudioService(stationText: String, isPlaying: Boolean) {
        val intent = BackgroundAudioService.createStartIntent(this, stationText, isPlaying)
        ContextCompat.startForegroundService(this, intent)
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(mediaCommandReceiver)
        } catch (_: IllegalArgumentException) {
            // Receiver was already unregistered
        }
        if (isFinishing) {
            stopService(BackgroundAudioService.createStopIntent(this))
        }
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}

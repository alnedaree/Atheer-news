package com.atheer.newsradio

import android.content.Context
import android.util.AttributeSet
import android.view.View
import android.webkit.WebView

/**
 * WebView subclass designed for continuous background and lock-screen audio playback.
 * Overrides onWindowVisibilityChanged to always report View.VISIBLE and turns onPause()
 * and pauseTimers() into no-ops so Chromium never suspends HTML5/HLS/YouTube audio or JS timers.
 */
class BackgroundWebView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = android.R.attr.webViewStyle
) : WebView(context, attrs, defStyleAttr) {

    override fun onWindowVisibilityChanged(visibility: Int) {
        // Always report VISIBLE so WebView does not pause media or throttle JS when backgrounded/locked
        super.onWindowVisibilityChanged(View.VISIBLE)
    }

    override fun onPause() {
        // Intentionally do NOT call super.onPause() so audio keeps playing in background
    }

    override fun pauseTimers() {
        // Intentionally do NOT call super.pauseTimers() so live streams and JS timers stay active
    }
}

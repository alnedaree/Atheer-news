# Keep WebView JS bridge safe
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

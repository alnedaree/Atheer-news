import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAndroidProjectFiles,
  crc32,
  createZipBuffer,
  sanitizeAppUrl,
} from './androidPackager.ts';

test('sanitizeAppUrl keeps valid http/https URLs and falls back on invalid inputs', () => {
  assert.equal(
    sanitizeAppUrl('https://example.com/radio/'),
    'https://example.com/radio',
  );
  assert.equal(
    sanitizeAppUrl('javascript:alert(1)'),
    'https://ais-pre-hlgzdybqjmsccfgh7yzoxc-70433494319.europe-west2.run.app',
  );
  assert.equal(
    sanitizeAppUrl('not-a-url'),
    'https://ais-pre-hlgzdybqjmsccfgh7yzoxc-70433494319.europe-west2.run.app',
  );
});

test('buildAndroidProjectFiles includes Audio-Only HTML5+hls.js, MediaSession, mediaPlayback Foreground Service, BackgroundWebView, and moveTaskToBack', () => {
  const dummyPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const files = buildAndroidProjectFiles('https://radio.example.com', {
    icon512: dummyPng,
    icon192: dummyPng,
    hlsScript: '/* hls.light.min.js */',
  });
  const paths = files.map((f) => f.path);

  assert.ok(paths.includes('settings.gradle.kts'));
  assert.ok(paths.includes('app/build.gradle.kts'));
  assert.ok(paths.includes('app/src/main/AndroidManifest.xml'));
  assert.ok(paths.includes('app/src/main/java/com/atheer/newsradio/MainActivity.kt'));
  assert.ok(paths.includes('app/src/main/java/com/atheer/newsradio/BackgroundWebView.kt'));
  assert.ok(paths.includes('app/src/main/java/com/atheer/newsradio/BackgroundAudioService.kt'));
  assert.ok(paths.includes('app/src/main/assets/index.html'));
  assert.ok(paths.includes('app/src/main/assets/hls.min.js'));
  assert.ok(paths.includes('.github/workflows/build-apk.yml'));
  assert.ok(paths.includes('app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'));
  assert.ok(paths.includes('app/src/main/res/mipmap-xhdpi/ic_launcher.png'));

  // 1. Verify AndroidManifest.xml permissions & foregroundServiceType="mediaPlayback"
  const manifest = files.find((f) => f.path.endsWith('AndroidManifest.xml'));
  assert.ok(manifest && typeof manifest.content === 'string');
  assert.ok(manifest.content.includes('android.permission.FOREGROUND_SERVICE'));
  assert.ok(manifest.content.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'));
  assert.ok(manifest.content.includes('android.permission.WAKE_LOCK'));
  assert.ok(manifest.content.includes('android.permission.POST_NOTIFICATIONS'));
  assert.ok(manifest.content.includes('android:name=".BackgroundAudioService"'));
  assert.ok(manifest.content.includes('android:foregroundServiceType="mediaPlayback"'));
  assert.ok(manifest.content.includes('@mipmap/ic_launcher'));

  // 2. Verify BackgroundAudioService implements mediaPlayback Foreground Service + ongoing Notification + WakeLock + MediaSession
  const serviceKt = files.find((f) => f.path.endsWith('BackgroundAudioService.kt'));
  assert.ok(serviceKt && typeof serviceKt.content === 'string');
  assert.ok(serviceKt.content.includes('FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK'));
  assert.ok(serviceKt.content.includes('NotificationChannel'));
  assert.ok(serviceKt.content.includes('setOngoing(true)'));
  assert.ok(serviceKt.content.includes('PARTIAL_WAKE_LOCK'));
  assert.ok(serviceKt.content.includes('ServiceCompat.startForeground'));
  assert.ok(serviceKt.content.includes('MediaSession'));
  assert.ok(serviceKt.content.includes('PlaybackState.STATE_PLAYING'));

  // 3. Verify BackgroundWebView overrides onWindowVisibilityChanged, onPause, and pauseTimers
  const webViewKt = files.find((f) => f.path.endsWith('BackgroundWebView.kt'));
  assert.ok(webViewKt && typeof webViewKt.content === 'string');
  assert.ok(webViewKt.content.includes('override fun onWindowVisibilityChanged'));
  assert.ok(webViewKt.content.includes('super.onWindowVisibilityChanged(View.VISIBLE)'));
  assert.ok(webViewKt.content.includes('override fun onPause()'));
  assert.ok(webViewKt.content.includes('override fun pauseTimers()'));
  const webViewCodeOnly = webViewKt.content.replace(/\/\/.*$/gm, '');
  assert.ok(!webViewCodeOnly.includes('super.onPause()'));
  assert.ok(!webViewCodeOnly.includes('super.pauseTimers()'));

  // 4. Verify MainActivity uses BackgroundWebView, starts Foreground Service, requests POST_NOTIFICATIONS,
  //    keeps domStorageEnabled = true, never calls webView.onPause()/pauseTimers(), wires MediaSession commands,
  //    and calls moveTaskToBack(true)
  const mainKt = files.find((f) => f.path.endsWith('MainActivity.kt'));
  assert.ok(mainKt && typeof mainKt.content === 'string');
  assert.ok(mainKt.content.includes('BackgroundWebView(this)'));
  assert.ok(mainKt.content.includes('WebViewAssetLoader'));
  assert.ok(mainKt.content.includes('domStorageEnabled = true'));
  assert.ok(mainKt.content.includes('ContextCompat.startForegroundService'));
  assert.ok(mainKt.content.includes('Manifest.permission.POST_NOTIFICATIONS'));
  assert.ok(mainKt.content.includes('moveTaskToBack(true)'));
  assert.ok(mainKt.content.includes('__atheerMediaAction'));
  assert.ok(!mainKt.content.includes('webView.onPause()'));
  assert.ok(!mainKt.content.includes('webView.pauseTimers()'));

  // 5. Verify standalone bundled asset HTML has Audio-Only HTML5 <audio> + hls.js, badges,
  //    real official logos, Monte Carlo Doualiya, Google s2 fallbacks, 48px white frame,
  //    circular Play/Pause buttons, MediaSession, and dual Audio/YouTube localStorage persistence
  const assetHtml = files.find((f) => f.path === 'app/src/main/assets/index.html');
  assert.ok(assetHtml && typeof assetHtml.content === 'string');
  assert.ok(assetHtml.content.includes('<script src="./hls.min.js"></script>'));
  assert.ok(assetHtml.content.includes('<audio id="radio-audio"'));
  assert.ok(assetHtml.content.includes('صوت فقط • موفّر للنت'));
  assert.ok(assetHtml.content.includes('بث يوتيوب'));
  assert.ok(assetHtml.content.includes('https://live-hls-audio-web-aja.getaj.net/VOICE-AJA/index.m3u8'));
  assert.ok(assetHtml.content.includes('https://live.alarabiya.net/alarabiapublish/alarabiya_audio/playlist.m3u8'));
  assert.ok(assetHtml.content.includes('https://stream.live.vc.bbcmedia.co.uk/bbc_arabic_radio'));
  assert.ok(assetHtml.content.includes('https://montecarlodoualiya128k.ice.infomaniak.ch/mc-doualiya.mp3'));
  assert.ok(assetHtml.content.includes('مونت كارلو الدولية'));
  assert.ok(assetHtml.content.includes('navigator.mediaSession'));
  assert.ok(assetHtml.content.includes('https://www.google.com/s2/favicons?domain=aljazeera.net&sz=128'));
  assert.ok(assetHtml.content.includes('https://www.google.com/s2/favicons?domain=mc-doualiya.com&sz=128'));
  assert.ok(assetHtml.content.includes('object-fit: contain'));
  assert.ok(assetHtml.content.includes('width: 48px'));
  assert.ok(assetHtml.content.includes('btn-play-circle'));
  assert.ok(assetHtml.content.includes('atheer_android_custom_channels_v1'));
  assert.ok(assetHtml.content.includes('i.ytimg.com/vi/'));
  assert.ok(assetHtml.content.includes('https://radio.example.com'));
});

test('createZipBuffer creates a valid ZIP binary with PK local header and EOCD signature', () => {
  const sample = new TextEncoder().encode('hello');
  assert.equal(crc32(sample), 0x3610a686);

  const zip = createZipBuffer(buildAndroidProjectFiles('https://radio.example.com'));
  assert.ok(zip.length > 5000);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
});

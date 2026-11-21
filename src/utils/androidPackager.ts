export interface ZipFileEntry {
  path: string;
  content: string | Uint8Array;
}

export interface AndroidIconAssets {
  icon512?: Uint8Array;
  icon192?: Uint8Array;
  hlsScript?: string;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a standards-compliant ZIP archive (STORE method) with zero external dependencies.
 */
export function createZipBuffer(entries: ZipFileEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path.replace(/^\/+/, ''));
    const dataBytes =
      typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    const checksum = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5821, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5821, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralDirSize + endRecord.length;
  const output = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(endRecord, cursor);
  return output;
}

export function sanitizeAppUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin + parsed.pathname.replace(/\/+$/, '');
    }
  } catch {
    // Fallback below
  }
  return 'https://ais-pre-hlgzdybqjmsccfgh7yzoxc-70433494319.europe-west2.run.app';
}

function buildStandaloneAndroidHtml(remoteServerUrl: string): string {
  const escapedRemoteUrl = remoteServerUrl.replace(/["'<>]/g, '');
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>أثير الإخبارية — إذاعة صوتية موفّرة للنت ونشرات X</title>
  <script src="./hls.min.js"></script>
  <style>
    :root {
      --bg: #0B0E13;
      --surface: #141922;
      --surface2: #1B2230;
      --border: rgba(255,255,255,0.1);
      --text: #F3F4F6;
      --muted: #9CA3AF;
      --accent: #DC2626;
      --accent-hover: #B91C1C;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding-bottom: 84px;
      -webkit-font-smoothing: antialiased;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(11,14,19,0.95);
      border-bottom: 1px solid var(--border);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .dot { width: 10px; height: 10px; border-radius: 999px; background: var(--accent); box-shadow: 0 0 10px rgba(220,38,38,0.8); }
    .brand h1 { font-size: 18px; font-weight: 800; }
    .tabs {
      display: flex;
      gap: 6px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      overflow-x: auto;
    }
    .tab {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    main { padding: 16px; max-width: 720px; margin: 0 auto; }
    .studio {
      background: linear-gradient(180deg, #161C27 0%, #10141C 100%);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 18px;
    }
    .meta {
      font-size: 12px;
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-bottom: 10px;
    }
    .freq { color: #F87171; font-family: monospace; font-weight: 700; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
      line-height: 1.4;
      white-space: nowrap;
    }
    .badge-audio {
      background: rgba(16, 185, 129, 0.14);
      border: 1px solid rgba(16, 185, 129, 0.32);
      color: #6EE7B7;
    }
    .badge-youtube {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #FCD34D;
    }
    .studio-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .logo-box {
      width: 48px;
      height: 48px;
      min-width: 48px;
      border-radius: 12px;
      background: #ffffff;
      padding: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    }
    .logo-box img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .station-name { font-size: 22px; font-weight: 800; line-height: 1.25; }
    .station-desc { font-size: 13px; color: var(--muted); line-height: 1.6; margin-bottom: 12px; }
    .fallback-note {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #FDE68A;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 12px;
      margin-bottom: 12px;
    }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn {
      border: 1px solid var(--border);
      background: var(--surface2);
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-primary { background: var(--accent); border-color: var(--accent); }
    .btn-primary:active { background: var(--accent-hover); }
    .btn-play-circle {
      width: 42px;
      height: 42px;
      min-width: 42px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      background: var(--surface2);
      color: #fff;
      font-size: 15px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.15s ease;
    }
    .btn-play-circle.playing {
      background: var(--accent);
      border-color: var(--accent);
      box-shadow: 0 4px 14px rgba(220,38,38,0.4);
    }
    .btn-del {
      border: 0;
      background: transparent;
      color: #9CA3AF;
      font-size: 15px;
      padding: 6px;
      cursor: pointer;
    }
    .player-wrap {
      margin-top: 14px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: #000;
      aspect-ratio: 16 / 9;
    }
    .player-wrap.audio-only {
      position: fixed;
      width: 2px;
      height: 2px;
      opacity: 0.01;
      pointer-events: none;
      bottom: 0;
      left: 0;
    }
    iframe { width: 100%; height: 100%; border: 0; }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin: 14px 0 10px;
    }
    .section-title { font-size: 15px; font-weight: 800; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .card.active { border-color: rgba(220,38,38,0.65); background: rgba(220,38,38,0.08); }
    .card-right { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
    .card-info { min-width: 0; flex: 1; }
    .card h3 { font-size: 15px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card-sub {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--muted);
    }
    .card-actions { display: flex; align-items: center; gap: 6px; }
    .x-item {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .x-handle { font-family: monospace; color: #F87171; font-size: 12px; direction: ltr; display: inline-block; }
    .input-row { display: flex; gap: 8px; margin-top: 10px; }
    .add-panel {
      background: var(--surface);
      border: 1px solid rgba(220,38,38,0.35);
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    input {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      color: #fff;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
    }
    .hidden { display: none !important; }
    .note {
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      font-size: 12px;
      color: var(--muted);
      line-height: 1.7;
      margin-bottom: 12px;
    }
    .err-msg { color: #FCA5A5; font-size: 12px; }
  </style>
</head>
<body>
  <audio id="radio-audio" playsinline preload="none" style="display:none;"></audio>

  <header>
    <div class="brand">
      <span class="dot"></span>
      <h1>أثير الإخبارية</h1>
    </div>
    <span id="status-label" style="font-size:11px;color:#6EE7B7;font-weight:700;">صوت صرف • تشغيل بالخلفية</span>
  </header>

  <nav class="tabs">
    <button class="tab active" data-tab="radio">الإذاعة المباشرة</button>
    <button class="tab" data-tab="x">مصادر منصة X</button>
    <button class="tab" data-tab="server">وضع الخادم الكامل</button>
  </nav>

  <main>
    <section id="view-radio">
      <div class="studio">
        <div class="meta">
          <span class="freq" id="active-freq">98.5 FM</span>
          <span>·</span>
          <span id="active-city">الدوحة</span>
          <span>·</span>
          <span class="badge badge-audio" id="active-mode-badge">صوت فقط • موفّر للنت</span>
          <span>·</span>
          <span id="play-state">جاهز للبث</span>
        </div>
        <div class="studio-header">
          <div class="logo-box">
            <img id="active-logo" src="" alt="" referrerpolicy="no-referrer" />
          </div>
          <div class="station-name" id="active-name">الجزيرة الإخبارية</div>
        </div>
        <div class="station-desc" id="active-desc">تغطية إخبارية متواصلة للأحداث العربية والعالمية ببث إذاعي صوتي صرف موفّر للإنترنت.</div>
        <div id="fallback-note" class="fallback-note hidden"></div>
        <div class="controls">
          <button class="btn btn-primary" id="btn-play">▶ تشغيل الإذاعة</button>
          <button class="btn" id="btn-video">عرض فيديو (يوتيوب)</button>
          <a class="btn" id="btn-youtube" href="https://www.youtube.com/@aljazeera/live" target="_blank" rel="noreferrer" style="text-decoration:none;">المصدر الرسمي</a>
        </div>
        <div id="player-container" class="player-wrap audio-only hidden"></div>
      </div>

      <div class="section-head">
        <div class="section-title">القنوات الإخبارية المباشرة</div>
        <button class="btn" id="btn-toggle-add" style="padding:7px 12px;font-size:12px;">+ إضافة قناة</button>
      </div>

      <div id="add-channel-panel" class="add-panel hidden">
        <input id="custom-name" placeholder="اسم القناة أو الإذاعة (مثال: إذاعة مونت كارلو أو الإخبارية)" />
        <input id="custom-url" dir="ltr" placeholder="رابط بث صوتي (.mp3 / .aac / .m3u8) أو رابط يوتيوب (watch?v=...)" />
        <div style="font-size:11px;color:#9CA3AF;">يدعم روابط البث الصوتي المباشر (MP3 / AAC / HLS .m3u8) وروابط قنوات وبثوث يوتيوب، ويحفظها تلقائياً في الجهاز.</div>
        <div id="custom-error" class="err-msg hidden"></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" id="btn-save-custom" style="flex:1;">حفظ القناة</button>
          <button class="btn" id="btn-cancel-custom">إلغاء</button>
        </div>
      </div>

      <div class="grid" id="channels-grid"></div>
    </section>

    <section id="view-x" class="hidden">
      <div class="note">
        اضغط على أي حساب لمتابعة آخر الأخبار العاجلة مباشرة من منصة X، أو اربط التطبيق بخادم «أثير» المنشور لتوليد نشرات صوتية مجمّعة بالذكاء الاصطناعي.
      </div>
      <div class="grid" id="x-grid"></div>
    </section>

    <section id="view-server" class="hidden">
      <div class="note">
        يعمل تطبيق أندرويد بنظام البث الصوتي الصرف (Audio-Only) لتوفير الإنترنت مع دعم التشغيل في الخلفية وقفل الشاشة وMediaSession. لفتح النسخة السحابية الكاملة، أدخل رابط النشر هنا:
      </div>
      <div class="input-row">
        <input id="remote-url" dir="ltr" value="${escapedRemoteUrl}" placeholder="https://..." />
        <button class="btn btn-primary" id="btn-open-remote">فتح</button>
      </div>
    </section>
  </main>

  <script>
    const CUSTOM_STORAGE_KEY = 'atheer_android_custom_channels_v1';
    const YOUTUBE_FAVICON = 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128';

    const DEFAULT_CHANNELS = [
      {
        id: 'aljazeera',
        name: 'الجزيرة الإخبارية',
        city: 'الدوحة',
        freq: '98.5 FM',
        audioStreamUrl: 'https://live-hls-audio-web-aja.getaj.net/VOICE-AJA/index.m3u8',
        audioStreamFormat: 'hls',
        sourceKind: 'video',
        videoId: 'FelGGahCbS8',
        url: 'https://www.youtube.com/@aljazeera/live',
        logoUrl: 'https://yt3.googleusercontent.com/76leFi_fmRjs0-azxyhbTCBryfo_WfYg7nlItMPBGM9ZTOUxWCli0F3_y4QYR24ec_KfcO_V7aw=s900-c-k-c0x00ffffff-no-rj',
        fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=aljazeera.net&sz=128',
        desc: 'تغطية إخبارية متواصلة للأحداث العربية والعالمية ببث إذاعي صوتي صرف موفّر للبيانات.'
      },
      {
        id: 'alarabiya',
        name: 'العربية الإخبارية',
        city: 'الرياض',
        freq: '101.3 FM',
        audioStreamUrl: 'https://live.alarabiya.net/alarabiapublish/alarabiya_audio/playlist.m3u8',
        audioStreamFormat: 'hls',
        sourceKind: 'video',
        videoId: 'n7eQejkXbnM',
        url: 'https://www.youtube.com/@AlArabiya/live',
        logoUrl: 'https://yt3.googleusercontent.com/GoZXY6BOD_V0vV3ok3fAzIbNMx3og4z2Jd2Up0BnocvBn35rMB4NG3vMOdzOpQ4-HFBUfDQ-JQ=s900-c-k-c0x00ffffff-no-rj',
        fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=alarabiya.net&sz=128',
        desc: 'نشرات أخبار وتغطيات سياسية واقتصادية مباشرة عبر البث الصوتي الصرف من استوديوهات العربية.'
      },
      {
        id: 'alhadath',
        name: 'الحدث مباشر',
        city: 'الرياض',
        freq: '102.7 FM',
        audioStreamUrl: 'https://live.alarabiya.net/alarabiapublish/alhadath_audio/playlist.m3u8',
        audioStreamFormat: 'hls',
        sourceKind: 'video',
        videoId: 'au8t81S0tag',
        url: 'https://www.youtube.com/@AlHadath/live',
        logoUrl: 'https://yt3.googleusercontent.com/ehhpuQeVHO0g3kIPkmwrw1x0fLqDk7RyWH733oe4wcKb_1jBEMvGt4WVlQEEzcTCL6zq01K5HQ=s900-c-k-c0x00ffffff-no-rj',
        fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=alhadath.net&sz=128',
        desc: 'متابعة ميدانية عاجلة وتطورات لحظية من قلب الأحداث الإقليمية والدولية ببث صوتي مباشر.'
      },
      {
        id: 'skynewsarabia',
        name: 'سكاي نيوز عربية',
        city: 'أبوظبي',
        freq: '104.1 FM',
        audioStreamUrl: 'https://radio.skynewsarabia.com/stream/radio/skynewsarabia',
        audioStreamFormat: 'mp3',
        sourceKind: 'video',
        videoId: 'ppgTP8xQQsM',
        url: 'https://www.youtube.com/@SkyNewsArabia/live',
        logoUrl: 'https://yt3.googleusercontent.com/C_tTYi9T3TlVewh6A5Yon_NOd3XxSjAduqRCqhaUcHkNGt67zyD0Cb6jJePYZTUMw-0VQt9TCA=s900-c-k-c0x00ffffff-no-rj',
        fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=skynewsarabia.com&sz=128',
        desc: 'البث الإذاعي الصوتي المباشر للأخبار العاجلة والتحليلات السياسية وأسواق المال.'
      },
      {
        id: 'bbcarabic',
        name: 'بي بي سي عربي',
        city: 'لندن',
        freq: '94.8 FM',
        audioStreamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_arabic_radio',
        audioStreamFormat: 'mp3',
        sourceKind: 'video',
        videoId: 'O1pGmVtj2Y8',
        url: 'https://www.youtube.com/@BBCNewsArabic/live',
        logoUrl: 'https://yt3.googleusercontent.com/lNnHQPUKQCFpFV2bIMEfexakkowja2RCVOsRRV8eOCFslwk_a4tRR5oNwg_S67J9zyYP_wAw=s900-c-k-c0x00ffffff-no-rj',
        fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=bbc.com&sz=128',
        desc: 'الإذاعة الإخبارية المباشرة ونشرات الأخبار والتحقيقات من استوديوهات بي بي سي في لندن.'
      },
      {
        id: 'montecarlo',
        name: 'مونت كارلو الدولية',
        city: 'باريس',
        freq: '93.5 FM',
        audioStreamUrl: 'https://montecarlodoualiya128k.ice.infomaniak.ch/mc-doualiya.mp3',
        audioStreamFormat: 'mp3',
        sourceKind: 'channel',
        channelId: 'UCzyAonkXMAIi8bp7_05PV-Q',
        url: 'https://www.youtube.com/@mc_doualiya/live',
        logoUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_lmgD36YGN4Chk1XRQe8-Fo5LvGKDgFu_-RtIx7dbNkZ8FA=s900-c-k-c0x00ffffff-no-rj',
        fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=mc-doualiya.com&sz=128',
        desc: 'إذاعة مونت كارلو الدولية الإخبارية باللغة العربية ببث صوتي مباشر نقي وموفّر للإنترنت.'
      },
      {
        id: 'asharq',
        name: 'الشرق للأخبار',
        city: 'الرياض',
        freq: '105.9 FM',
        sourceKind: 'video',
        videoId: 'f6VpkfV7m4Y',
        url: 'https://www.youtube.com/@AsharqNews/live',
        logoUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_kZQjNcecj0_Z8VHxjNt6zKzLtCPpnNRF0rSjyNXm4AZg=s900-c-k-c0x00ffffff-no-rj',
        fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=asharq.com&sz=128',
        desc: 'تغطية معمّقة للأخبار السياسية والاقتصاد والأسواق العالمية بالشراكة مع بلومبرغ.'
      },
      {
        id: 'ajmubasher',
        name: 'الجزيرة مباشر',
        city: 'الدوحة',
        freq: '99.1 FM',
        sourceKind: 'video',
        videoId: 'N8xxOD0nT1Y',
        url: 'https://www.youtube.com/watch?v=N8xxOD0nT1Y',
        logoUrl: 'https://yt3.googleusercontent.com/h0_bBdVgCAXIPJFnQ4hZtE87cDY_qO7rkDAue8qXdmOFxZ5NaO3AFD1uCUcst-EsBcGJ8zl8EQ=s900-c-k-c0x00ffffff-no-rj',
        fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=aljazeeramubasher.net&sz=128',
        desc: 'نقل حي ومباشر للمؤتمرات الصحفية والفعاليات والتغطيات الميدانية المفتوحة.'
      },
      {
        id: 'france24ar',
        name: 'فرانس 24 العربية',
        city: 'باريس',
        freq: '96.2 FM',
        sourceKind: 'video',
        videoId: '93g513Uth98',
        url: 'https://www.youtube.com/channel/UCdTyuXgmJkG_O8_75eqej-w/live',
        logoUrl: 'https://yt3.googleusercontent.com/ttCZI4HzbwlKBLe-hgRNy8N3QyymY4FOqb3Todsh0ic8Ms-8SbZ9cN0IQZhTEiINQMQtIXef=s900-c-k-c0x00ffffff-no-rj',
        fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=france24.com&sz=128',
        desc: 'بث إخباري دولي من باريس يغطي الشؤون الأوروبية والمغاربية والدولية.'
      }
    ];

    const X_SOURCES = [
      { handle: 'AJABreaking', label: 'الجزيرة - عاجل' },
      { handle: 'AlArabiya_Brk', label: 'العربية عاجل' },
      { handle: 'AlHadath_Brk', label: 'الحدث عاجل' },
      { handle: 'SkyNewsArabia_B', label: 'سكاي نيوز عربية - عاجل' },
      { handle: 'AsharqNewsBrk', label: 'الشرق للأخبار - عاجل' },
      { handle: 'ReutersArabic', label: 'رويترز عربي' },
      { handle: 'CNBCArabia', label: 'CNBC عربية' },
      { handle: 'AsharqBusiness', label: 'اقتصاد الشرق' },
      { handle: 'aitnews', label: 'البوابة العربية للأخبار التقنية' }
    ];

    function loadCustomChannels() {
      try {
        const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    function saveCustomChannels(list) {
      try {
        window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(list));
      } catch (_) {}
    }

    let customChannels = loadCustomChannels();
    function getAllChannels() {
      return DEFAULT_CHANNELS.concat(customChannels);
    }

    let active = DEFAULT_CHANNELS[0];
    let playing = false;
    let showVideo = false;
    let hlsInstance = null;
    let currentAudioKey = '';
    const audioFailedMap = {};
    let fallbackNotice = '';

    const audioEl = document.getElementById('radio-audio');

    function hasYouTube(ch) {
      return Boolean(ch.videoId || ch.channelId);
    }

    function isHlsChannel(ch) {
      if (!ch.audioStreamUrl) return false;
      return ch.audioStreamFormat === 'hls' || ch.audioStreamUrl.toLowerCase().includes('.m3u8');
    }

    function getChannelMode(ch) {
      const hasAudio = Boolean(ch.audioStreamUrl);
      if (hasAudio && (!audioFailedMap[ch.id] || !hasYouTube(ch))) {
        return 'audio';
      }
      return 'youtube';
    }

    function getActiveEngineMode() {
      if (showVideo && hasYouTube(active)) return 'youtube';
      return getChannelMode(active);
    }

    function bindLogoFallback(imgEl, primaryUrl, fallbackUrl) {
      const secondary = fallbackUrl || YOUTUBE_FAVICON;
      imgEl.onerror = () => {
        if (imgEl.src !== secondary) {
          imgEl.src = secondary;
        } else if (imgEl.src !== YOUTUBE_FAVICON) {
          imgEl.src = YOUTUBE_FAVICON;
        }
      };
      imgEl.src = primaryUrl || secondary;
    }

    function stopAudioPlayer() {
      if (hlsInstance) {
        try { hlsInstance.destroy(); } catch (_) {}
        hlsInstance = null;
      }
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
      currentAudioKey = '';
    }

    function handleAudioStreamFailure(ch) {
      if (active.id !== ch.id) return;
      stopAudioPlayer();
      if (hasYouTube(ch)) {
        audioFailedMap[ch.id] = true;
        fallbackNotice = 'تعذّر الاتصال بالبث الصوتي المباشر؛ تم التحويل تلقائياً إلى بث يوتيوب الاحتياطي.';
      } else {
        fallbackNotice = 'تعذّر تشغيل رابط البث الصوتي. تحقق من الرابط أو اتصال الإنترنت.';
        playing = false;
      }
      renderStudio();
    }

    function startAudioPlayer(ch) {
      const key = ch.id + '|' + ch.audioStreamUrl;
      if (currentAudioKey === key && !audioEl.paused) return;
      stopAudioPlayer();
      currentAudioKey = key;

      const streamUrl = ch.audioStreamUrl;
      if (isHlsChannel(ch) && typeof window.Hls !== 'undefined' && window.Hls.isSupported()) {
        const hls = new window.Hls({
          lowLatencyMode: true,
          backBufferLength: 30,
          maxBufferLength: 20
        });
        hlsInstance = hls;
        let recovered = false;
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          audioEl.play().catch(() => {});
        });
        hls.on(window.Hls.Events.ERROR, (_evt, data) => {
          if (!data || !data.fatal) return;
          if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
            recovered = true;
            hls.recoverMediaError();
            return;
          }
          handleAudioStreamFailure(ch);
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(audioEl);
      } else {
        audioEl.src = streamUrl;
        audioEl.load();
        audioEl.play().catch(() => {});
      }
    }

    audioEl.addEventListener('error', () => {
      if (playing && getActiveEngineMode() === 'audio') {
        handleAudioStreamFailure(active);
      }
    });

    function syncMediaSession(mode) {
      const modeText = mode === 'audio' ? 'صوت فقط • موفّر للنت' : 'بث يوتيوب';
      try {
        if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: active.name,
            artist: active.city + ' · ' + modeText,
            album: 'أثير الإخبارية — إذاعة البث الحي',
            artwork: [
              { src: active.logoUrl || YOUTUBE_FAVICON, sizes: '192x192', type: 'image/png' }
            ]
          });
          navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
          navigator.mediaSession.setActionHandler('play', () => { playing = true; renderStudio(); });
          navigator.mediaSession.setActionHandler('pause', () => { playing = false; renderStudio(); });
          navigator.mediaSession.setActionHandler('stop', () => { playing = false; renderStudio(); });
          navigator.mediaSession.setActionHandler('nexttrack', () => { switchChannelByOffset(1); });
          navigator.mediaSession.setActionHandler('previoustrack', () => { switchChannelByOffset(-1); });
        }
      } catch (_) {}

      try {
        if (window.AtheerAndroid && typeof window.AtheerAndroid.updatePlaybackState === 'function') {
          window.AtheerAndroid.updatePlaybackState(active.name + ' · ' + modeText, playing);
        }
      } catch (_) {}
    }

    function switchChannelByOffset(delta) {
      const list = getAllChannels();
      if (!list.length) return;
      const idx = list.findIndex((c) => c.id === active.id);
      const next = list[(idx + delta + list.length) % list.length];
      delete audioFailedMap[next.id];
      fallbackNotice = '';
      active = next;
      playing = true;
      renderStudio();
    }

    // Hook invoked by Native Android MediaSession controls (lock screen / Bluetooth)
    window.__atheerMediaAction = function(action) {
      if (action === 'play') { playing = true; renderStudio(); }
      else if (action === 'pause') { playing = false; renderStudio(); }
      else if (action === 'toggle') { playing = !playing; renderStudio(); }
      else if (action === 'next') { switchChannelByOffset(1); }
      else if (action === 'prev') { switchChannelByOffset(-1); }
    };

    function buildEmbedSrc(ch) {
      const origin = encodeURIComponent(window.location.origin);
      if (ch.sourceKind === 'channel' && ch.channelId) {
        return 'https://www.youtube.com/embed/live_stream?channel=' + encodeURIComponent(ch.channelId) + '&autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=' + origin;
      }
      return 'https://www.youtube.com/embed/' + encodeURIComponent(ch.videoId) + '?autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=' + origin;
    }

    function renderStudio() {
      const mode = getActiveEngineMode();
      const canShowVideo = hasYouTube(active);
      if (!canShowVideo) showVideo = false;

      document.getElementById('active-freq').textContent = active.freq;
      document.getElementById('active-city').textContent = active.city;
      document.getElementById('active-name').textContent = active.name;
      document.getElementById('active-desc').textContent = active.desc;

      const badge = document.getElementById('active-mode-badge');
      badge.className = 'badge ' + (mode === 'audio' ? 'badge-audio' : 'badge-youtube');
      badge.textContent = mode === 'audio'
        ? 'صوت فقط • موفّر للنت'
        : (audioFailedMap[active.id] ? 'بث يوتيوب (احتياطي)' : 'بث يوتيوب');

      const ytBtn = document.getElementById('btn-youtube');
      ytBtn.href = active.url || active.audioStreamUrl || '#';
      ytBtn.textContent = canShowVideo ? 'فتح في يوتيوب' : 'رابط البث الصوتي';

      const videoBtn = document.getElementById('btn-video');
      videoBtn.classList.toggle('hidden', !canShowVideo);
      videoBtn.textContent = showVideo
        ? (active.audioStreamUrl ? 'العودة للصوت فقط' : 'إخفاء الفيديو')
        : 'عرض فيديو (يوتيوب)';

      const noteBox = document.getElementById('fallback-note');
      if (fallbackNotice) {
        noteBox.textContent = fallbackNotice;
        noteBox.classList.remove('hidden');
      } else {
        noteBox.classList.add('hidden');
      }

      document.getElementById('play-state').textContent = playing ? 'يبث الآن على الهواء' : 'جاهز للبث';
      document.getElementById('btn-play').textContent = playing ? '⏸ إيقاف مؤقت' : '▶ تشغيل الإذاعة';

      const activeLogo = document.getElementById('active-logo');
      activeLogo.alt = 'شعار ' + active.name;
      bindLogoFallback(activeLogo, active.logoUrl, active.fallbackLogoUrl);

      const container = document.getElementById('player-container');
      if (playing && mode === 'audio' && active.audioStreamUrl) {
        container.classList.add('hidden');
        container.dataset.src = '';
        container.innerHTML = '';
        startAudioPlayer(active);
      } else if (playing && mode === 'youtube' && canShowVideo) {
        stopAudioPlayer();
        container.classList.remove('hidden');
        container.classList.toggle('audio-only', !showVideo);
        const src = buildEmbedSrc(active);
        if (container.dataset.src !== src) {
          container.dataset.src = src;
          container.innerHTML = '<iframe src="' + src + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
        }
      } else {
        stopAudioPlayer();
        container.classList.add('hidden');
        container.dataset.src = '';
        container.innerHTML = '';
      }

      syncMediaSession(mode);
      renderChannels();
    }

    function renderChannels() {
      const grid = document.getElementById('channels-grid');
      grid.innerHTML = '';
      getAllChannels().forEach((ch) => {
        const isCurrentPlaying = ch.id === active.id && playing;
        const chMode = getChannelMode(ch);
        const card = document.createElement('div');
        card.className = 'card' + (ch.id === active.id ? ' active' : '');

        const rightWrap = document.createElement('div');
        rightWrap.className = 'card-right';

        const logoBox = document.createElement('div');
        logoBox.className = 'logo-box';
        const img = document.createElement('img');
        img.alt = 'شعار ' + ch.name;
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        bindLogoFallback(img, ch.logoUrl, ch.fallbackLogoUrl);
        logoBox.appendChild(img);

        const info = document.createElement('div');
        info.className = 'card-info';
        const h3 = document.createElement('h3');
        h3.textContent = ch.name;

        const sub = document.createElement('div');
        sub.className = 'card-sub';
        const metaText = document.createElement('span');
        metaText.textContent = ch.freq + ' · ' + ch.city;
        const modeTag = document.createElement('span');
        modeTag.className = 'badge ' + (chMode === 'audio' ? 'badge-audio' : 'badge-youtube');
        modeTag.textContent = chMode === 'audio'
          ? 'صوت فقط • موفّر للنت'
          : (audioFailedMap[ch.id] ? 'بث يوتيوب (احتياطي)' : 'بث يوتيوب');
        sub.appendChild(modeTag);
        sub.appendChild(metaText);

        info.appendChild(h3);
        info.appendChild(sub);

        rightWrap.appendChild(logoBox);
        rightWrap.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        if (ch.isCustom) {
          const delBtn = document.createElement('button');
          delBtn.className = 'btn-del';
          delBtn.type = 'button';
          delBtn.textContent = '✕';
          delBtn.setAttribute('aria-label', 'حذف ' + ch.name);
          delBtn.onclick = (e) => {
            e.stopPropagation();
            customChannels = customChannels.filter((item) => item.id !== ch.id);
            saveCustomChannels(customChannels);
            if (active.id === ch.id) {
              active = DEFAULT_CHANNELS[0];
              playing = false;
            }
            renderStudio();
          };
          actions.appendChild(delBtn);
        }

        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'btn-play-circle' + (isCurrentPlaying ? ' playing' : '');
        playBtn.textContent = isCurrentPlaying ? '⏸' : '▶';
        playBtn.setAttribute('aria-label', isCurrentPlaying ? 'إيقاف مؤقت' : 'تشغيل ' + ch.name);
        playBtn.onclick = (e) => {
          e.stopPropagation();
          if (isCurrentPlaying) {
            playing = false;
          } else {
            delete audioFailedMap[ch.id];
            fallbackNotice = '';
            active = ch;
            playing = true;
          }
          renderStudio();
        };
        actions.appendChild(playBtn);

        card.appendChild(rightWrap);
        card.appendChild(actions);
        card.onclick = () => {
          if (isCurrentPlaying) {
            playing = false;
          } else {
            delete audioFailedMap[ch.id];
            fallbackNotice = '';
            active = ch;
            playing = true;
          }
          renderStudio();
        };
        grid.appendChild(card);
      });
    }

    function parseChannelInput(raw) {
      const value = raw.trim();
      if (!value) return null;
      if (/^UC[a-zA-Z0-9_-]{20,26}$/.test(value)) {
        return { sourceKind: 'channel', channelId: value, url: 'https://www.youtube.com/channel/' + value + '/live' };
      }
      try {
        const u = new URL(value);
        const host = u.hostname.toLowerCase().replace(/^www\\./, '');
        if (host === 'youtu.be') {
          const vid = u.pathname.replace(/^\\//, '').split('/')[0];
          if (/^[a-zA-Z0-9_-]{11}$/.test(vid)) {
            return { sourceKind: 'video', videoId: vid, url: 'https://www.youtube.com/watch?v=' + vid };
          }
        }
        if (host.endsWith('youtube.com')) {
          const vParam = u.searchParams.get('v');
          if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
            return { sourceKind: 'video', videoId: vParam, url: 'https://www.youtube.com/watch?v=' + vParam };
          }
          const liveMatch = u.pathname.match(/^\\/(?:live|embed)\\/([a-zA-Z0-9_-]{11})/);
          if (liveMatch) {
            return { sourceKind: 'video', videoId: liveMatch[1], url: 'https://www.youtube.com/watch?v=' + liveMatch[1] };
          }
          const chMatch = u.pathname.match(/^\\/channel\\/(UC[a-zA-Z0-9_-]{20,26})/);
          if (chMatch) {
            return { sourceKind: 'channel', channelId: chMatch[1], url: 'https://www.youtube.com/channel/' + chMatch[1] + '/live' };
          }
          return null;
        }
        if ((u.protocol === 'https:' || u.protocol === 'http:') && host.includes('.')) {
          const lower = (u.pathname + u.search).toLowerCase();
          const isHls = lower.includes('.m3u8');
          const isAac = /\\.(?:aac|aacp|m4a)(?:$|[?#&])/.test(lower);
          const isMp3 = /\\.(?:mp3|ogg|opus|wav|pls)(?:$|[?#&])/.test(lower);
          const looksRadio = /(?:^|\\.)(?:stream|radio|ice|live|audio|fm)\\./i.test(host) || /\\/(?:stream|radio|live|listen|audio)/i.test(lower);
          if (isHls || isAac || isMp3 || looksRadio) {
            return {
              sourceKind: 'audio',
              audioStreamUrl: u.toString(),
              audioStreamFormat: isHls ? 'hls' : (isAac ? 'aac' : 'mp3'),
              host: host,
              url: u.toString()
            };
          }
        }
      } catch (_) {}
      return null;
    }

    async function fetchChannelLogo(parsed) {
      if (parsed.sourceKind === 'audio' && parsed.host) {
        return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(parsed.host) + '&sz=128';
      }
      if (parsed.sourceKind === 'video' && parsed.videoId) {
        let thumb = 'https://i.ytimg.com/vi/' + parsed.videoId + '/hqdefault.jpg';
        try {
          const r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(parsed.url) + '&format=json');
          if (r.ok) {
            const j = await r.json();
            if (j && typeof j.thumbnail_url === 'string' && j.thumbnail_url.startsWith('https://')) {
              thumb = j.thumbnail_url;
            }
          }
        } catch (_) {}
        return thumb;
      }
      return YOUTUBE_FAVICON;
    }

    function renderX() {
      const grid = document.getElementById('x-grid');
      grid.innerHTML = '';
      X_SOURCES.forEach((src) => {
        const row = document.createElement('div');
        row.className = 'x-item';
        row.innerHTML = '<div><div style="font-weight:700;font-size:14px;">' + src.label + '</div><span class="x-handle">@' + src.handle + '</span></div><a class="btn" style="text-decoration:none;" href="https://x.com/' + src.handle + '" target="_blank" rel="noreferrer">متابعة</a>';
        grid.appendChild(row);
      });
    }

    document.getElementById('btn-play').onclick = () => {
      if (!playing) {
        delete audioFailedMap[active.id];
        fallbackNotice = '';
      }
      playing = !playing;
      renderStudio();
    };
    document.getElementById('btn-video').onclick = () => {
      showVideo = !showVideo;
      renderStudio();
    };
    document.getElementById('btn-open-remote').onclick = () => {
      const val = document.getElementById('remote-url').value.trim();
      if (val.startsWith('http://') || val.startsWith('https://')) {
        window.location.href = val;
      }
    };

    const addPanel = document.getElementById('add-channel-panel');
    const errBox = document.getElementById('custom-error');
    document.getElementById('btn-toggle-add').onclick = () => {
      addPanel.classList.toggle('hidden');
      errBox.classList.add('hidden');
    };
    document.getElementById('btn-cancel-custom').onclick = () => {
      addPanel.classList.add('hidden');
      errBox.classList.add('hidden');
    };
    document.getElementById('btn-save-custom').onclick = async () => {
      const nameInput = document.getElementById('custom-name');
      const urlInput = document.getElementById('custom-url');
      const chName = nameInput.value.trim();
      const parsed = parseChannelInput(urlInput.value);
      if (!chName) {
        errBox.textContent = 'يرجى إدخال اسم القناة أو الإذاعة.';
        errBox.classList.remove('hidden');
        return;
      }
      if (!parsed) {
        errBox.textContent = 'أدخل رابط بث صوتي مباشر (.mp3 / .aac / .m3u8) أو رابط يوتيوب (watch?v=... أو channel/UC...).';
        errBox.classList.remove('hidden');
        return;
      }
      errBox.classList.add('hidden');
      const logoUrl = await fetchChannelLogo(parsed);
      const newCh = {
        id: 'custom-' + Date.now(),
        name: chName,
        city: parsed.sourceKind === 'audio' ? 'إذاعة مخصّصة' : 'بث مخصّص',
        freq: (88.5 + (customChannels.length % 18)).toFixed(1) + ' FM',
        sourceKind: parsed.sourceKind,
        audioStreamUrl: parsed.audioStreamUrl || '',
        audioStreamFormat: parsed.audioStreamFormat || '',
        videoId: parsed.videoId || '',
        channelId: parsed.channelId || '',
        url: parsed.url,
        logoUrl: logoUrl,
        fallbackLogoUrl: YOUTUBE_FAVICON,
        desc: parsed.sourceKind === 'audio'
          ? 'بث إذاعي صوتي صرف موفّر للإنترنت.'
          : 'قناة بث مباشر مضافة عبر يوتيوب.',
        isCustom: true
      };
      customChannels = [newCh].concat(customChannels);
      saveCustomChannels(customChannels);
      nameInput.value = '';
      urlInput.value = '';
      addPanel.classList.add('hidden');
      fallbackNotice = '';
      active = newCh;
      playing = true;
      renderStudio();
    };

    document.querySelectorAll('.tab').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        document.getElementById('view-radio').classList.toggle('hidden', target !== 'radio');
        document.getElementById('view-x').classList.toggle('hidden', target !== 'x');
        document.getElementById('view-server').classList.toggle('hidden', target !== 'server');
      };
    });

    renderStudio();
    renderX();
  </script>
</body>
</html>
`;
}

export function buildAndroidProjectFiles(
  appUrl: string,
  icons: AndroidIconAssets = {},
): ZipFileEntry[] {
  const safeUrl = sanitizeAppUrl(appUrl);
  const hasIcons = Boolean(icons.icon512 || icons.icon192);

  const files: ZipFileEntry[] = [
    {
      path: 'settings.gradle.kts',
      content: `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "AtheerNewsRadio"
include(":app")
`,
    },
    {
      path: 'build.gradle.kts',
      content: `plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
`,
    },
    {
      path: 'gradle.properties',
      content: `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
    },
    {
      path: 'app/build.gradle.kts',
      content: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.atheer.newsradio"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.atheer.newsradio"
        minSdk = 24
        targetSdk = 35
        versionCode = 4
        versionName = "1.3.0"
        buildConfigField("String", "REMOTE_APP_URL", "\\"${safeUrl}\\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
`,
    },
    {
      path: 'app/proguard-rules.pro',
      content: `# Keep WebView JS bridge safe
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
`,
    },
    {
      path: 'app/src/main/AndroidManifest.xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"${
          hasIcons
            ? `
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"`
            : ''
        }
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.AtheerNewsRadio"
        android:usesCleartextTraffic="true">
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout"
            android:exported="true"
            android:launchMode="singleTask">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".BackgroundAudioService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />
    </application>
</manifest>
`,
    },
    {
      path: 'app/src/main/res/values/strings.xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">أثير الإخبارية</string>
    <string name="notification_channel_name">تشغيل الإذاعة في الخلفية</string>
    <string name="notification_channel_desc">إشعار مستمر لإبقاء البث الإذاعي الصوتي المباشر يعمل في الخلفية وعند قفل الشاشة</string>
    <string name="notification_default_text">البث الإذاعي الصوتي المباشر قيد التشغيل في الخلفية</string>
    <string name="notification_action_stop">إيقاف الخلفية</string>
</resources>
`,
    },
    {
      path: 'app/src/main/res/values/themes.xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.AtheerNewsRadio" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">#0B0E13</item>
        <item name="android:statusBarColor">#0B0E13</item>
        <item name="android:navigationBarColor">#0B0E13</item>
    </style>
</resources>
`,
    },
    {
      path: 'app/src/main/assets/index.html',
      content: buildStandaloneAndroidHtml(safeUrl),
    },
    {
      path: 'app/src/main/java/com/atheer/newsradio/BackgroundWebView.kt',
      content: `package com.atheer.newsradio

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
`,
    },
    {
      path: 'app/src/main/java/com/atheer/newsradio/BackgroundAudioService.kt',
      content: `package com.atheer.newsradio

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
`,
    },
    {
      path: 'app/src/main/java/com/atheer/newsradio/MainActivity.kt',
      content: `package com.atheer.newsradio

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
`,
    },
    {
      path: '.github/workflows/build-apk.yml',
      content: `name: Build Atheer Android APK

on:
  workflow_dispatch:
  push:
    branches: [ main, master ]

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Accept Android SDK Licenses
        run: yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses || true

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: 8.10.2

      - name: Build Debug APK
        run: gradle assembleDebug

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: atheer-news-radio-apk
          path: app/build/outputs/apk/debug/app-debug.apk
`,
    },
    {
      path: 'README-AR.md',
      content: `# تطبيق أندرويد المستقل — أثير الإخبارية (APK)

هذا المشروع مبني بلغة **Kotlin + Gradle** ويعمل بنظام **بث صوتي صرف 100% (Audio-Only)** لتوفير استهلاك الإنترنت عبر HTML5 Audio + \`hls.js\` المدمجة محلياً، مع **تحويل تلقائي احتياطي إلى يوتيوب** ودعم كامل للتشغيل في الخلفية وقفل الشاشة:

- **بث صوتي صرف موفّر للبيانات:** تشغيل مباشر لروابط البث الإذاعي الصوتي (MP3 / AAC / Audio-Only HLS \`.m3u8\`) للجزيرة، العربية، الحدث، سكاي نيوز عربية، بي بي سي عربي، ومونت كارلو الدولية.
- **خدمة أمامية مستمرة (\`BackgroundAudioService\`) + \`MediaSession\`:** من نوع \`mediaPlayback\` مع إشعار مستمر و\`PARTIAL_WAKE_LOCK\` وربط كامل مع أزرار الوسائط وشاشة القفل.
- **\`BackgroundWebView\` مخصّص:** يتجاوز \`onWindowVisibilityChanged\` ويمتنع عن إيقاف الصوت أو مؤقتات JavaScript (\`onPause\` / \`pauseTimers\`) ليبقى البث مستمراً بثبات تام.
- **تصغير ذكي بزر الرجوع:** عند الضغط على زر الرجوع في الصفحة الرئيسية يتم تصغير التطبيق للخلفية عبر \`moveTaskToBack(true)\` دون قطع الصوت.

## الطريقة الأسرع لتوليد ملف APK مجاناً (بدون Android Studio — خلال دقيقتين)
1. أنشئ مستودعاً جديداً على **GitHub** (يمكن أن يكون خاصاً Private أو عاماً Public).
2. فك ضغط هذا الملف وارفع جميع الملفات الموجودة بداخله مباشرة إلى جذر المستودع (بما فيها مجلد \`.github\`).
3. افتح تبويب **Actions** في المستودع، ستجد سير العمل **Build Atheer Android APK** يعمل تلقائياً (أو اضغط **Run workflow**).
4. بعد نحو دقيقتين ستجد ملف **atheer-news-radio-apk** داخل قسم **Artifacts**؛ حمّله وفك ضغطه لتجد ملف **app-debug.apk** جاهزاً للتثبيت مباشرة على هاتفك الأندرويد.

## الطريقة الثانية: عبر Android Studio
1. افتح هذا المجلد مباشرة في **Android Studio**.
2. من القائمة العلوية اختر **Build -> Build Bundle(s) / APK(s) -> Build APK(s)**.
3. ستجد الملف الجاهز في: \`app/build/outputs/apk/debug/app-debug.apk\`.
`,
    },
  ];

  if (icons.hlsScript) {
    files.push({
      path: 'app/src/main/assets/hls.min.js',
      content: icons.hlsScript,
    });
  }

  if (icons.icon512) {
    files.push(
      { path: 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', content: icons.icon512 },
      { path: 'app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', content: icons.icon512 },
    );
  }
  if (icons.icon192) {
    files.push(
      { path: 'app/src/main/res/mipmap-xhdpi/ic_launcher.png', content: icons.icon192 },
      { path: 'app/src/main/res/mipmap-xhdpi/ic_launcher_round.png', content: icons.icon192 },
    );
  }

  return files;
}

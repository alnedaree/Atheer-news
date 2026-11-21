import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  buildSpokenBulletinScript,
  extractLiveVideoIdsFromStreamsHtml,
  normalizeTwitterHandle,
  parseYouTubeSource,
  safeParseBulletinJson,
} from './src/utils/broadcast';
import { buildAndroidProjectFiles, createZipBuffer } from './src/utils/androidPackager';
import type {
  AnchorVoiceName,
  BulletinStyle,
  GroundingSource,
  NewsBulletin,
} from './src/types/broadcast';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح GEMINI_API_KEY غير مهيأ على الخادم. يرجى التأكد من إعداده في لوحة الأسرار.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const VALID_VOICES = new Set<AnchorVoiceName>(['Charon', 'Kore', 'Fenrir', 'Zephyr']);

interface LiveStreamEntry {
  videoId: string;
  title?: string;
}

const liveVideoCache = new Map<string, { expiresAt: number; streams: LiveStreamEntry[] }>();
const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchActiveLiveStreamsForChannel(channelId: string): Promise<LiveStreamEntry[]> {
  const cached = liveVideoCache.get(channelId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.streams;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}/streams`, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'ar,en;q=0.9',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const html = await res.text();
    const videoIds = extractLiveVideoIdsFromStreamsHtml(html, 4);
    if (videoIds.length === 0) return [];

    // Resolve stream titles via oEmbed when multiple simultaneous live streams exist
    let streams: LiveStreamEntry[];
    if (videoIds.length === 1) {
      streams = [{ videoId: videoIds[0] }];
    } else {
      streams = await Promise.all(
        videoIds.map(async (videoId) => {
          try {
            const oembedRes = await fetch(
              `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
            );
            if (!oembedRes.ok) return { videoId };
            const data = (await oembedRes.json()) as { title?: string };
            return { videoId, title: typeof data.title === 'string' ? data.title : undefined };
          } catch {
            return { videoId };
          }
        })
      );
    }

    liveVideoCache.set(channelId, {
      expiresAt: Date.now() + LIVE_CACHE_TTL_MS,
      streams,
    });
    return streams;
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Dynamically resolve active YouTube live video ID(s) for a canonical UC channel ID
  app.get('/api/youtube/live-video', async (req, res) => {
    try {
      const channelId = typeof req.query.channelId === 'string' ? req.query.channelId.trim() : '';
      const hint = typeof req.query.hint === 'string' ? req.query.hint.trim() : '';

      if (!/^UC[a-zA-Z0-9_-]{20,26}$/.test(channelId)) {
        return res.status(400).json({ error: 'معرّف قناة يوتيوب غير صالح.' });
      }

      const streams = await fetchActiveLiveStreamsForChannel(channelId);
      if (streams.length === 0) {
        return res.json({ videoId: null, streams: [] });
      }

      let chosen = streams[0];
      if (hint && streams.length > 1) {
        const matched = streams.find(
          (s) => s.title && s.title.toLowerCase().includes(hint.toLowerCase())
        );
        if (matched) chosen = matched;
      }

      return res.json({
        videoId: chosen.videoId,
        title: chosen.title,
        streams,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر جلب البث المباشر للقناة.';
      return res.status(500).json({ error: message });
    }
  });

  // Resolve YouTube channel handle, channel ID, or video URL along with its real YouTube thumbnail/avatar
  app.post('/api/youtube/resolve', async (req, res) => {
    const youtubeFallbackLogo = 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128';
    try {
      const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
      const parsed = parseYouTubeSource(input);
      if (!parsed) {
        return res.status(400).json({
          error: 'الرابط أو المعرّف غير صالح. أدخل رابط قناة يوتيوب أو رابط بث مباشر أو معرّف قناة يبدأ بـ UC.',
        });
      }

      if (parsed.kind === 'video') {
        let logoUrl = `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg`;
        let resolvedTitle: string | undefined;
        try {
          const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${parsed.id}`)}&format=json`
          );
          if (oembedRes.ok) {
            const oembed = (await oembedRes.json()) as { title?: string; thumbnail_url?: string };
            if (typeof oembed.thumbnail_url === 'string' && oembed.thumbnail_url.startsWith('https://')) {
              logoUrl = oembed.thumbnail_url;
            }
            if (typeof oembed.title === 'string') {
              resolvedTitle = oembed.title;
            }
          }
        } catch {
          // Keep standard YouTube hqdefault thumbnail
        }

        return res.json({
          sourceKind: 'video',
          youtubeId: parsed.id,
          youtubeUrl: parsed.canonicalUrl,
          logoUrl,
          fallbackLogoUrl: youtubeFallbackLogo,
          resolvedTitle,
        });
      }

      const targetUrl =
        parsed.kind === 'channel'
          ? `https://www.youtube.com/channel/${encodeURIComponent(parsed.id)}`
          : `https://www.youtube.com/${encodeURIComponent(parsed.id)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      try {
        const ytResponse = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept-Language': 'ar,en;q=0.9',
          },
        });
        clearTimeout(timeout);

        if (!ytResponse.ok) {
          if (parsed.kind === 'channel') {
            return res.json({
              sourceKind: 'channel',
              youtubeId: parsed.id,
              youtubeUrl: parsed.canonicalUrl,
              logoUrl: youtubeFallbackLogo,
              fallbackLogoUrl: youtubeFallbackLogo,
            });
          }
          return res.status(422).json({
            error: 'تعذّر الوصول إلى صفحة قناة يوتيوب. يرجى لصق معرّف القناة (UC...) أو رابط البث المباشر.',
          });
        }

        const html = await ytResponse.text();
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        const logoUrl =
          ogImageMatch?.[1] && ogImageMatch[1].startsWith('https://')
            ? ogImageMatch[1]
            : youtubeFallbackLogo;

        if (parsed.kind === 'channel') {
          return res.json({
            sourceKind: 'channel',
            youtubeId: parsed.id,
            youtubeUrl: parsed.canonicalUrl,
            logoUrl,
            fallbackLogoUrl: youtubeFallbackLogo,
            resolvedTitle: titleMatch?.[1] ?? undefined,
          });
        }

        const channelIdMatch =
          html.match(/"externalId":"(UC[a-zA-Z0-9_-]{20,26})"/) ||
          html.match(/"channelId":"(UC[a-zA-Z0-9_-]{20,26})"/) ||
          html.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,26})/);

        if (!channelIdMatch?.[1]) {
          return res.status(422).json({
            error: 'لم يتم العثور على معرّف القناة تلقائياً. يرجى إدخال رابط البث المباشر (watch?v=...) أو معرّف القناة UC.',
          });
        }

        return res.json({
          sourceKind: 'channel',
          youtubeId: channelIdMatch[1],
          youtubeUrl: `https://www.youtube.com/channel/${channelIdMatch[1]}/live`,
          logoUrl,
          fallbackLogoUrl: youtubeFallbackLogo,
          resolvedTitle: titleMatch?.[1] ?? undefined,
        });
      } catch {
        clearTimeout(timeout);
        if (parsed.kind === 'channel') {
          return res.json({
            sourceKind: 'channel',
            youtubeId: parsed.id,
            youtubeUrl: parsed.canonicalUrl,
            logoUrl: youtubeFallbackLogo,
            fallbackLogoUrl: youtubeFallbackLogo,
          });
        }
        return res.status(422).json({
          error: 'تعذّر استخراج معرّف القناة من المعرّف النصي. يمكنك لصق رابط البث المباشر مباشرة.',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء فحص قناة يوتيوب.';
      return res.status(500).json({ error: message });
    }
  });

  // Compile a live Arabic radio news bulletin from selected X/Twitter news accounts using Gemini + Google Search Grounding
  app.post('/api/bulletin/generate', async (req, res) => {
    try {
      const rawAccounts = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
      const accounts = rawAccounts
        .slice(0, 15)
        .map((acc: unknown) => {
          const item = (acc && typeof acc === 'object' ? acc : {}) as Record<string, unknown>;
          return {
            handle: normalizeTwitterHandle(String(item.handle ?? '')),
            label: String(item.label ?? '').trim().slice(0, 80),
            topic: String(item.topic ?? '').trim().slice(0, 30),
          };
        })
        .filter((acc: { handle: string }) => /^[A-Za-z0-9_]{1,15}$/.test(acc.handle));

      if (accounts.length === 0) {
        return res.status(400).json({
          error: 'يرجى تفعيل حساب واحد على الأقل من مصادر X (تويتر) قبل توليد النشرة.',
        });
      }

      const channelName =
        typeof req.body?.channelName === 'string' && req.body.channelName.trim()
          ? req.body.channelName.trim().slice(0, 100)
          : 'نشرة مصادر X المختارة';

      const style: BulletinStyle =
        req.body?.style === 'detailed' || req.body?.style === 'urgent' ? req.body.style : 'brief';

      const focusTopic =
        typeof req.body?.focusTopic === 'string' ? req.body.focusTopic.trim().slice(0, 140) : '';

      const itemCount = style === 'detailed' ? 6 : style === 'urgent' ? 4 : 5;
      const styleInstructions =
        style === 'urgent'
          ? 'ركز على الأخبار العاجلة جداً والتطورات الميدانية والسياسية الطارئة بصياغة قصيرة سريعة الإيقاع.'
          : style === 'detailed'
            ? 'قدّم نشرة إذاعية متكاملة بسياق واضح وتفاصيل دقيقة في جملتين إلى ثلاث جمل لكل خبر.'
            : 'قدّم موجزاً إذاعياً رصيناً ومباشراً في جملتين محكمتين لكل خبر.';

      const accountsListText = accounts
        .map((acc: { handle: string; label: string }) => `@${acc.handle} (${acc.label || acc.handle})`)
        .join('، ');

      const todayIso = new Date().toISOString().split('T')[0];

      const prompt = [
        `ابحث الآن عن أحدث الأخبار العاجلة والمنشورات الحديثة (اليوم ${todayIso} وآخر 24 ساعة) الصادرة عن حسابات منصة X (تويتر) والجهات الإخبارية التالية: ${accountsListText}.`,
        focusTopic ? `مع تركيز خاص على موضوع: ${focusTopic}.` : '',
        `أعدّ نشرة أخبار إذاعية عربية فصيحة احترافية تضم ${itemCount} أخبار حقيقية وموثّقة من نتائج البحث الحديثة.`,
        styleInstructions,
        `أعد النتيجة حصراً بصيغة JSON صالحة بدون أي نص خارج كائن JSON، وفق البنية التالية بالضبط:`,
        `{`,
        `  "title": "عنوان النشرة الإخبارية بالعربية",`,
        `  "intro": "مقدمة المذيع الإذاعية (جملتان)",`,
        `  "items": [`,
        `    {`,
        `      "headline": "عنوان الخبر الموجز",`,
        `      "summary": "نص الخبر بأسلوب نشرة أخبار إذاعية فصيحة وواضحة",`,
        `      "sourceHandle": "اسم الحساب بدون @ من القائمة المطلوبة",`,
        `      "sourceName": "اسم الجهة الإخبارية بالعربية",`,
        `      "category": "عاجل أو سياسة أو اقتصاد أو تقنية أو رياضة أو دولي",`,
        `      "timeLabel": "توقيت تقريبي مثل: اليوم أو آخر الساعات"`,
        `    }`,
        `  ],`,
        `  "outro": "خاتمة المذيع الإذاعية (جملة واحدة)"`,
        `}`,
      ]
        .filter(Boolean)
        .join('\n');

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'أنت رئيس تحرير في غرفة أخبار إذاعية عربية رصينة. اعتمد فقط على أحدث الحقائق المسترجعة من البحث المباشر، وحرّر الأخبار بلغة عربية فصحى سلسة صالحة للإلقاء الإذاعي المباشر بدون رموز تعبيرية أو وسوم هاشتاغ. التزم بإخراج JSON صالح فقط.',
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = response.text ?? '';
      const parsed = safeParseBulletinJson(rawText);

      if (!parsed) {
        return res.status(502).json({
          error: 'تعذّر تنسيق النشرة الإخبارية من استجابة الخادم. يرجى المحاولة مرة أخرى.',
        });
      }

      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const groundingSources: GroundingSource[] = [];
      for (const chunk of rawChunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title;
        if (typeof uri === 'string' && uri.startsWith('http') && !seenUris.has(uri)) {
          seenUris.add(uri);
          groundingSources.push({
            uri,
            title: typeof title === 'string' && title.trim() ? title.trim() : uri,
          });
        }
      }

      const items = parsed.items.map((item, idx) => ({
        ...item,
        id: `item-${Date.now()}-${idx}`,
      }));

      const bulletin: NewsBulletin = {
        id: `bulletin-${Date.now()}`,
        title: parsed.title,
        channelName,
        style,
        generatedAt: new Date().toISOString(),
        intro: parsed.intro,
        items,
        outro: parsed.outro,
        spokenScript: buildSpokenBulletinScript({
          intro: parsed.intro,
          items,
          outro: parsed.outro,
        }),
        accountsUsed: accounts.map((a: { handle: string }) => a.handle),
        groundingSources: groundingSources.slice(0, 8),
        isSample: false,
      };

      return res.json({ bulletin });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر توليد النشرة الإخبارية.';
      return res.status(500).json({ error: message });
    }
  });

  // Convert the Arabic news bulletin into a spoken studio radio broadcast WAV via Gemini 3.8 Flash Lite TTS
  app.post('/api/bulletin/audio', async (req, res) => {
    try {
      const rawScript = typeof req.body?.script === 'string' ? req.body.script.trim() : '';
      if (!rawScript) {
        return res.status(400).json({ error: 'لا يوجد نص نشرة لتحويله إلى بث صوتي.' });
      }

      const script = rawScript.slice(0, 3800);
      const voiceName: AnchorVoiceName = VALID_VOICES.has(req.body?.voiceName)
        ? req.body.voiceName
        : 'Charon';

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: script,
                speechMetadata: {
                  style: 'مذيع أخبار عربي فصيح في استوديو إذاعي، نبرة جادة ورصينة وواضحة المخارج',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(502).json({
          error: 'لم يُرجع نموذج الصوت بيانات صوتية صالحة. يرجى إعادة المحاولة.',
        });
      }

      return res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر توليد الصوت الإذاعي للنشرة.';
      return res.status(500).json({ error: message });
    }
  });

  // Download complete standalone Kotlin/Gradle Android project + GitHub Actions APK auto-builder as a ZIP archive
  app.get('/api/android/download-project', (req, res) => {
    try {
      const requestedUrl =
        typeof req.query.appUrl === 'string' && req.query.appUrl.trim()
          ? req.query.appUrl.trim()
          : process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const icon512Path = path.resolve(__dirname, 'public/pwa-512x512.png');
      const icon192Path = path.resolve(__dirname, 'public/pwa-192x192.png');
      const hlsLightPath = path.resolve(__dirname, 'node_modules/hls.js/dist/hls.light.min.js');
      const hlsFullPath = path.resolve(__dirname, 'node_modules/hls.js/dist/hls.min.js');
      const hlsPath = fs.existsSync(hlsLightPath) ? hlsLightPath : hlsFullPath;
      const icons = {
        icon512: fs.existsSync(icon512Path) ? new Uint8Array(fs.readFileSync(icon512Path)) : undefined,
        icon192: fs.existsSync(icon192Path) ? new Uint8Array(fs.readFileSync(icon192Path)) : undefined,
        hlsScript: fs.existsSync(hlsPath) ? fs.readFileSync(hlsPath, 'utf-8') : undefined,
      };
      const files = buildAndroidProjectFiles(requestedUrl, icons);
      const zipBytes = createZipBuffer(files);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="atheer-android-apk-project.zip"');
      res.setHeader('Content-Length', String(zipBytes.length));
      return res.send(Buffer.from(zipBytes));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر تجهيز حزمة مشروع أندرويد.';
      return res.status(500).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    // Vite 8 injects /@vite/client even when hmr: false & ws: false, which tries to open
    // a WebSocket on port 24678 (unreachable behind Cloud Run). Provide the exact CSS & HMR
    // exports without initializing any WebSocket transport.
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay extends HTMLElement {}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atheer News Radio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpokenBulletinScript,
  buildYouTubeEmbedUrl,
  extractLiveVideoIdsFromStreamsHtml,
  filterChannels,
  formatTimeDuration,
  getEffectiveStreamMode,
  isHlsStreamUrl,
  normalizeTwitterHandle,
  parseAudioStreamSource,
  parseChannelSource,
  parseYouTubeSource,
  safeParseBulletinJson,
  validateTwitterHandle,
} from './broadcast';
import type { NewsChannel } from '../types/broadcast';

test('parseYouTubeSource parses channel ID, watch URL, youtu.be, live URL, and handle', () => {
  const ch = parseYouTubeSource('UCfiwzLy-8yKzIbsmZTzxDgw');
  assert.equal(ch?.kind, 'channel');
  assert.equal(ch?.id, 'UCfiwzLy-8yKzIbsmZTzxDgw');

  const chUrl = parseYouTubeSource('https://www.youtube.com/channel/UCahpxixMCwoANAftn6IxkTg/live');
  assert.equal(chUrl?.kind, 'channel');
  assert.equal(chUrl?.id, 'UCahpxixMCwoANAftn6IxkTg');

  const vid = parseYouTubeSource('https://www.youtube.com/watch?v=bNyUyrR0PHo');
  assert.equal(vid?.kind, 'video');
  assert.equal(vid?.id, 'bNyUyrR0PHo');

  const shortVid = parseYouTubeSource('https://youtu.be/bNyUyrR0PHo');
  assert.equal(shortVid?.kind, 'video');
  assert.equal(shortVid?.id, 'bNyUyrR0PHo');

  const handle = parseYouTubeSource('https://www.youtube.com/@AlJazeera/live');
  assert.equal(handle?.kind, 'handle');
  assert.equal(handle?.id, '@AlJazeera');

  assert.equal(parseYouTubeSource('https://example.com/not-youtube'), null);
  assert.equal(parseYouTubeSource('   '), null);
});

test('parseAudioStreamSource & parseChannelSource parse MP3, AAC, HLS .m3u8, Icecast radio streams, and YouTube links', () => {
  const mp3 = parseAudioStreamSource('https://montecarlodoualiya128k.ice.infomaniak.ch/mc-doualiya.mp3');
  assert.equal(mp3?.kind, 'audio');
  assert.equal(mp3?.format, 'mp3');
  assert.equal(mp3?.host, 'montecarlodoualiya128k.ice.infomaniak.ch');

  const aac = parseAudioStreamSource('https://radio.example.org/news-live.aac?token=abc');
  assert.equal(aac?.kind, 'audio');
  assert.equal(aac?.format, 'aac');

  const hls = parseAudioStreamSource('https://live-hls-audio-web-aja.getaj.net/VOICE-AJA/index.m3u8');
  assert.equal(hls?.kind, 'audio');
  assert.equal(hls?.format, 'hls');
  assert.equal(isHlsStreamUrl(hls?.streamUrl, hls?.format), true);
  assert.equal(isHlsStreamUrl(mp3?.streamUrl, mp3?.format), false);

  const icecastNoExt = parseAudioStreamSource('https://stream.live.vc.bbcmedia.co.uk/bbc_arabic_radio');
  assert.equal(icecastNoExt?.kind, 'audio');
  assert.equal(icecastNoExt?.format, 'mp3');

  // YouTube links must never be misclassified as raw audio streams
  assert.equal(parseAudioStreamSource('https://www.youtube.com/watch?v=FelGGahCbS8'), null);
  assert.equal(parseChannelSource('https://www.youtube.com/watch?v=FelGGahCbS8')?.kind, 'video');
  assert.equal(
    parseChannelSource('https://live.alarabiya.net/alarabiapublish/alarabiya_audio/playlist.m3u8')?.kind,
    'audio'
  );
  assert.equal(parseChannelSource('https://example.com/regular-article.html'), null);
});

test('getEffectiveStreamMode prefers Audio-Only and automatically falls back to YouTube when audio fails', () => {
  const hybridChannel = {
    sourceKind: 'channel' as const,
    audioStreamUrl: 'https://live-hls-audio-web-aja.getaj.net/VOICE-AJA/index.m3u8',
    youtubeId: 'UCfiwzLy-8yKzIbsmZTzxDgw',
  };
  assert.equal(getEffectiveStreamMode(hybridChannel, false), 'audio');
  assert.equal(getEffectiveStreamMode(hybridChannel, true), 'youtube');

  const youtubeOnly = {
    sourceKind: 'channel' as const,
    youtubeId: 'UCdTyuXgmJkG_O8_75eqej-w',
  };
  assert.equal(getEffectiveStreamMode(youtubeOnly, false), 'youtube');

  const audioOnlyCustom = {
    sourceKind: 'audio' as const,
    audioStreamUrl: 'https://montecarlodoualiya128k.ice.infomaniak.ch/mc-doualiya.mp3',
  };
  assert.equal(getEffectiveStreamMode(audioOnlyCustom, false), 'audio');
  assert.equal(getEffectiveStreamMode(audioOnlyCustom, true), 'audio');
});

test('buildYouTubeEmbedUrl prefers resolvedVideoId/fallbackVideoId and falls back to live_stream', () => {
  const directUrl = buildYouTubeEmbedUrl(
    { sourceKind: 'channel', youtubeId: 'UCfiwzLy-8yKzIbsmZTzxDgw', fallbackVideoId: 'FelGGahCbS8' },
    { autoplay: true, muted: false, origin: 'http://localhost:3000' }
  );
  assert.ok(directUrl.startsWith('https://www.youtube.com/embed/FelGGahCbS8?'));
  assert.ok(directUrl.includes('autoplay=1'));
  assert.ok(directUrl.includes('origin=http%3A%2F%2Flocalhost%3A3000'));

  const resolvedOverride = buildYouTubeEmbedUrl(
    { sourceKind: 'channel', youtubeId: 'UCfiwzLy-8yKzIbsmZTzxDgw', fallbackVideoId: 'FelGGahCbS8' },
    { resolvedVideoId: 'N8xxOD0nT1Y' }
  );
  assert.ok(resolvedOverride.startsWith('https://www.youtube.com/embed/N8xxOD0nT1Y?'));

  const liveStreamFallback = buildYouTubeEmbedUrl(
    { sourceKind: 'channel', youtubeId: 'UCfiwzLy-8yKzIbsmZTzxDgw' },
    { autoplay: true, muted: false }
  );
  assert.ok(liveStreamFallback.startsWith('https://www.youtube.com/embed/live_stream?'));
  assert.ok(liveStreamFallback.includes('channel=UCfiwzLy-8yKzIbsmZTzxDgw'));

  const videoUrl = buildYouTubeEmbedUrl(
    { sourceKind: 'video', youtubeId: 'bNyUyrR0PHo' },
    { autoplay: false, muted: true }
  );
  assert.ok(videoUrl.startsWith('https://www.youtube.com/embed/bNyUyrR0PHo?'));
  assert.ok(videoUrl.includes('mute=1'));
});

test('extractLiveVideoIdsFromStreamsHtml parses modern lockupViewModel and legacy LIVE badges', () => {
  const modernHtml =
    '{"badgeStyle":"THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE","animationActivationTargetId":"FelGGahCbS8"} ... {"badgeStyle":"THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE","animationActivationTargetId":"N8xxOD0nT1Y"}';
  assert.deepEqual(extractLiveVideoIdsFromStreamsHtml(modernHtml), ['FelGGahCbS8', 'N8xxOD0nT1Y']);

  const legacyHtml = '{"videoId":"au8t81S0tag","badges":[{"style":"LIVE"}]}';
  assert.deepEqual(extractLiveVideoIdsFromStreamsHtml(legacyHtml), ['au8t81S0tag']);

  assert.deepEqual(extractLiveVideoIdsFromStreamsHtml('<html>no live</html>'), []);
});

test('Twitter/X handle normalization and validation handles URLs, @ prefixes, and invalid input', () => {
  assert.equal(normalizeTwitterHandle('@AJABreaking'), 'AJABreaking');
  assert.equal(normalizeTwitterHandle('https://x.com/AlArabiya_Brk?s=20'), 'AlArabiya_Brk');
  assert.equal(normalizeTwitterHandle('https://twitter.com/BBCArabic/status/123'), 'BBCArabic');

  assert.equal(validateTwitterHandle('@AJABreaking'), null);
  assert.equal(validateTwitterHandle('https://x.com/SkyNewsArabia_B'), null);
  assert.ok(validateTwitterHandle('') !== null);
  assert.ok(validateTwitterHandle('invalid handle!') !== null);
  assert.ok(validateTwitterHandle('this_handle_is_way_too_long_123') !== null);
});

test('buildSpokenBulletinScript formats intro, attributed items, and outro cleanly', () => {
  const script = buildSpokenBulletinScript({
    intro: 'أهلاً بكم.',
    items: [
      {
        id: '1',
        headline: 'تطورات اقتصادية جديدة',
        summary: 'ارتفعت المؤشرات الإقليمية في تداولات الصباح.',
        sourceHandle: 'CNBCArabia',
        sourceName: 'سي إن بي سي عربية',
        category: 'اقتصاد',
        timeLabel: 'منذ 10 دقائق',
      },
    ],
    outro: 'إلى اللقاء.',
  });

  assert.ok(script.includes('أهلاً بكم.'));
  assert.ok(script.includes('في خبرنا الأول: تطورات اقتصادية جديدة.'));
  assert.ok(script.includes('سي إن بي سي عربية'));
  assert.ok(script.includes('إلى اللقاء.'));
});

test('filterChannels filters by category, favorites, and Arabic search query', () => {
  const sample: NewsChannel[] = [
    {
      id: 'aj',
      name: 'الجزيرة',
      englishName: 'Al Jazeera',
      city: 'الدوحة',
      frequency: '98.5 FM',
      category: 'arabic',
      description: 'قناة إخبارية عربية',
      sourceKind: 'channel',
      youtubeId: 'UCfiwzLy-8yKzIbsmZTzxDgw',
      youtubeUrl: 'https://www.youtube.com/channel/UCfiwzLy-8yKzIbsmZTzxDgw/live',
      logoUrl: 'https://www.google.com/s2/favicons?domain=aljazeera.net&sz=128',
      fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=aljazeera.net&sz=128',
      monogram: 'جز',
    },
    {
      id: 'f24',
      name: 'فرانس 24 العربية',
      englishName: 'France 24 Arabic',
      city: 'باريس',
      frequency: '96.2 FM',
      category: 'international',
      description: 'تغطية دولية',
      sourceKind: 'channel',
      youtubeId: 'UCdTyuXgmJkG_O8_75eqej-w',
      youtubeUrl: 'https://www.youtube.com/channel/UCdTyuXgmJkG_O8_75eqej-w/live',
      logoUrl: 'https://www.google.com/s2/favicons?domain=france24.com&sz=128',
      fallbackLogoUrl: 'https://www.google.com/s2/favicons?domain=france24.com&sz=128',
      monogram: 'F24',
    },
  ];

  assert.equal(filterChannels(sample, 'arabic', '', []).length, 1);
  assert.equal(filterChannels(sample, 'favorites', '', ['f24'])[0]?.id, 'f24');
  assert.equal(filterChannels(sample, 'all', 'باريس', []).length, 1);
  assert.equal(filterChannels(sample, 'all', 'غير موجود', []).length, 0);
});

test('formatTimeDuration formats seconds into tabular mm:ss', () => {
  assert.equal(formatTimeDuration(0), '00:00');
  assert.equal(formatTimeDuration(65), '01:05');
  assert.equal(formatTimeDuration(605), '10:05');
  assert.equal(formatTimeDuration(-4), '00:00');
});

test('safeParseBulletinJson extracts valid bulletin payload from fenced or plain JSON', () => {
  const raw = '```json\n{"title":"نشرة المساء","intro":"مرحباً","outro":"شكراً","items":[{"headline":"خبر مهم","summary":"تفاصيل الخبر","sourceHandle":"@AJABreaking","sourceName":"الجزيرة عاجل","category":"عاجل","timeLabel":"الآن"}]}\n```';
  const parsed = safeParseBulletinJson(raw);
  assert.ok(parsed !== null);
  assert.equal(parsed.title, 'نشرة المساء');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].sourceHandle, 'AJABreaking');

  assert.equal(safeParseBulletinJson('not valid json'), null);
});

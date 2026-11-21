import type {
  AudioStreamFormat,
  BulletinItem,
  ChannelCategory,
  EffectiveStreamMode,
  NewsBulletin,
  NewsChannel,
} from '../types/broadcast';

export interface ParsedYouTubeSource {
  kind: 'channel' | 'video' | 'handle';
  id: string;
  canonicalUrl: string;
}

export interface ParsedAudioStreamSource {
  kind: 'audio';
  format: AudioStreamFormat;
  streamUrl: string;
  host: string;
}

export type ParsedChannelSource = ParsedYouTubeSource | ParsedAudioStreamSource;

const YOUTUBE_CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{20,26}$/;
const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const TWITTER_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export function parseYouTubeSource(rawInput: string): ParsedYouTubeSource | null {
  const input = rawInput.trim();
  if (!input) return null;

  if (YOUTUBE_CHANNEL_ID_RE.test(input)) {
    return {
      kind: 'channel',
      id: input,
      canonicalUrl: `https://www.youtube.com/channel/${input}/live`,
    };
  }

  if (input.startsWith('@') && /^@[a-zA-Z0-9._-]{2,40}$/.test(input)) {
    return {
      kind: 'handle',
      id: input,
      canonicalUrl: `https://www.youtube.com/${input}/live`,
    };
  }

  let url: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'youtu.be') {
    const videoId = url.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
    if (YOUTUBE_VIDEO_ID_RE.test(videoId)) {
      return {
        kind: 'video',
        id: videoId,
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }
    return null;
  }

  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') {
    return null;
  }

  const watchParam = url.searchParams.get('v');
  if (watchParam && YOUTUBE_VIDEO_ID_RE.test(watchParam)) {
    return {
      kind: 'video',
      id: watchParam,
      canonicalUrl: `https://www.youtube.com/watch?v=${watchParam}`,
    };
  }

  const channelParam = url.searchParams.get('channel');
  if (channelParam && YOUTUBE_CHANNEL_ID_RE.test(channelParam)) {
    return {
      kind: 'channel',
      id: channelParam,
      canonicalUrl: `https://www.youtube.com/channel/${channelParam}/live`,
    };
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length >= 2 && segments[0] === 'channel' && YOUTUBE_CHANNEL_ID_RE.test(segments[1])) {
    return {
      kind: 'channel',
      id: segments[1],
      canonicalUrl: `https://www.youtube.com/channel/${segments[1]}/live`,
    };
  }

  if (
    segments.length >= 2 &&
    (segments[0] === 'live' || segments[0] === 'embed' || segments[0] === 'shorts') &&
    YOUTUBE_VIDEO_ID_RE.test(segments[1])
  ) {
    return {
      kind: 'video',
      id: segments[1],
      canonicalUrl: `https://www.youtube.com/watch?v=${segments[1]}`,
    };
  }

  if (segments.length >= 1 && segments[0].startsWith('@') && /^@[a-zA-Z0-9._-]{2,40}$/.test(segments[0])) {
    return {
      kind: 'handle',
      id: segments[0],
      canonicalUrl: `https://www.youtube.com/${segments[0]}/live`,
    };
  }

  return null;
}

export function parseAudioStreamSource(rawInput: string): ParsedAudioStreamSource | null {
  const input = rawInput.trim();
  if (!input || !/^https?:\/\//i.test(input)) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const bareHost = host.replace(/^www\./, '').replace(/^m\./, '');
  if (
    !host.includes('.') ||
    bareHost === 'youtube.com' ||
    bareHost === 'youtu.be' ||
    bareHost === 'youtube-nocookie.com'
  ) {
    return null;
  }

  const lowerPath = url.pathname.toLowerCase();
  const lowerFull = `${lowerPath}${url.search.toLowerCase()}`;

  if (/\.m3u8(?:$|[?#&])/.test(lowerFull) || lowerPath.endsWith('.m3u8')) {
    return {
      kind: 'audio',
      format: 'hls',
      streamUrl: url.toString(),
      host: bareHost,
    };
  }

  if (/\.(?:aac|aacp|m4a)(?:$|[?#&])/.test(lowerFull)) {
    return {
      kind: 'audio',
      format: 'aac',
      streamUrl: url.toString(),
      host: bareHost,
    };
  }

  if (/\.(?:mp3|ogg|opus|wav|pls|m3u)(?:$|[?#&])/.test(lowerFull)) {
    return {
      kind: 'audio',
      format: 'mp3',
      streamUrl: url.toString(),
      host: bareHost,
    };
  }

  const looksLikeRadioEndpoint =
    /(?:^|\.)(?:stream|radio|ice|live|audio|broadcast|fm|shoutcast|icecast)\./i.test(host) ||
    /\/(?:stream|radio|live|listen|audio|mount|broadcast|icecast)/i.test(lowerPath) ||
    Boolean(url.port && url.port !== '80' && url.port !== '443');

  if (looksLikeRadioEndpoint) {
    return {
      kind: 'audio',
      format: 'mp3',
      streamUrl: url.toString(),
      host: bareHost,
    };
  }

  return null;
}

export function parseChannelSource(rawInput: string): ParsedChannelSource | null {
  const youtube = parseYouTubeSource(rawInput);
  if (youtube) return youtube;
  return parseAudioStreamSource(rawInput);
}

export function isHlsStreamUrl(streamUrl?: string, format?: AudioStreamFormat): boolean {
  if (!streamUrl) return false;
  if (format === 'hls') return true;
  try {
    const parsed = new URL(streamUrl);
    return parsed.pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return streamUrl.toLowerCase().includes('.m3u8');
  }
}

export function hasYouTubeFallback(
  channel: Pick<NewsChannel, 'sourceKind' | 'youtubeId' | 'fallbackVideoId'>
): boolean {
  return Boolean(channel.youtubeId || channel.fallbackVideoId);
}

export function getEffectiveStreamMode(
  channel: Pick<NewsChannel, 'audioStreamUrl' | 'sourceKind' | 'youtubeId' | 'fallbackVideoId'>,
  audioFailed = false
): EffectiveStreamMode {
  const hasAudio = Boolean(channel.audioStreamUrl?.trim());
  const hasYt = hasYouTubeFallback(channel);
  if (hasAudio && (!audioFailed || !hasYt)) {
    return 'audio';
  }
  return 'youtube';
}

export function buildYouTubeEmbedUrl(
  channel: Pick<NewsChannel, 'sourceKind' | 'youtubeId' | 'fallbackVideoId'>,
  options: {
    autoplay?: boolean;
    muted?: boolean;
    resolvedVideoId?: string;
    origin?: string;
  } = {}
): string {
  const params = new URLSearchParams({
    autoplay: options.autoplay ? '1' : '0',
    mute: options.muted ? '1' : '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    enablejsapi: '1',
  });

  if (options.origin) {
    params.set('origin', options.origin);
  }

  if (channel.sourceKind === 'video' && channel.youtubeId) {
    return `https://www.youtube.com/embed/${encodeURIComponent(channel.youtubeId)}?${params.toString()}`;
  }

  const directVideoId = options.resolvedVideoId || channel.fallbackVideoId;
  if (directVideoId && YOUTUBE_VIDEO_ID_RE.test(directVideoId)) {
    return `https://www.youtube.com/embed/${encodeURIComponent(directVideoId)}?${params.toString()}`;
  }

  if (channel.youtubeId) {
    params.set('channel', channel.youtubeId);
    return `https://www.youtube.com/embed/live_stream?${params.toString()}`;
  }

  return '';
}

export function extractLiveVideoIdsFromStreamsHtml(html: string, limit = 5): string[] {
  const found: string[] = [];
  if (!html) return found;

  // Modern YouTube lockupViewModel live badge pattern
  const lockupRe =
    /"badgeStyle":"THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE"[^]{0,260}?"animationActivationTargetId":"([a-zA-Z0-9_-]{11})"/g;
  let match: RegExpExecArray | null;
  while ((match = lockupRe.exec(html)) !== null && found.length < limit) {
    if (!found.includes(match[1])) found.push(match[1]);
  }

  // Fallback legacy videoRenderer pattern
  if (found.length === 0) {
    const legacyRe = /"videoId":"([a-zA-Z0-9_-]{11})"[^]{0,1800}?"style":"LIVE"/g;
    while ((match = legacyRe.exec(html)) !== null && found.length < limit) {
      if (!found.includes(match[1])) found.push(match[1]);
    }
  }

  return found;
}

export function normalizeTwitterHandle(rawInput: string): string {
  let value = rawInput.trim();
  if (!value) return '';

  // Support pasting full x.com or twitter.com profile URLs
  const urlMatch = value.match(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)/i);
  if (urlMatch && urlMatch[1]) {
    value = urlMatch[1];
  }

  value = value.replace(/^@+/, '').trim();
  return value;
}

export function validateTwitterHandle(rawInput: string): string | null {
  const normalized = normalizeTwitterHandle(rawInput);
  if (!normalized) {
    return 'يرجى إدخال اسم حساب X أو رابط الصفحة.';
  }
  if (!TWITTER_HANDLE_RE.test(normalized)) {
    return 'اسم الحساب غير صالح. استخدم حروفاً إنجليزية وأرقاماً وشرطة سفلية فقط (حتى 15 حرفاً).';
  }
  return null;
}

export function buildSpokenBulletinScript(
  bulletin: Pick<NewsBulletin, 'intro' | 'items' | 'outro'>
): string {
  const segments: string[] = [];
  if (bulletin.intro.trim()) {
    segments.push(bulletin.intro.trim());
  }

  bulletin.items.forEach((item, index) => {
    const prefix = index === 0 ? 'في خبرنا الأول:' : `وفي خبر آخر،`;
    const attribution = item.sourceName ? `وفقاً لما أورده حساب ${item.sourceName}،` : '';
    segments.push(`${prefix} ${item.headline}. ${attribution} ${item.summary}`.replace(/\s+/g, ' ').trim());
  });

  if (bulletin.outro.trim()) {
    segments.push(bulletin.outro.trim());
  }

  return segments.join('\n\n');
}

export function filterChannels(
  channels: NewsChannel[],
  category: ChannelCategory | 'all' | 'favorites',
  searchQuery: string,
  favoriteIds: string[]
): NewsChannel[] {
  const query = searchQuery.trim().toLowerCase();
  const favSet = new Set(favoriteIds);

  return channels.filter((channel) => {
    if (category === 'favorites' && !favSet.has(channel.id)) {
      return false;
    }
    if (category !== 'all' && category !== 'favorites' && channel.category !== category) {
      return false;
    }
    if (!query) return true;
    return (
      channel.name.toLowerCase().includes(query) ||
      channel.englishName.toLowerCase().includes(query) ||
      channel.city.toLowerCase().includes(query) ||
      channel.description.toLowerCase().includes(query) ||
      channel.frequency.toLowerCase().includes(query)
    );
  });
}

export function formatTimeDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const secs = Math.floor(totalSeconds);
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export interface ParsedBulletinPayload {
  title: string;
  intro: string;
  outro: string;
  items: Omit<BulletinItem, 'id'>[];
}

export function safeParseBulletinJson(rawText: string): ParsedBulletinPayload | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // Strip optional markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items: Omit<BulletinItem, 'id'>[] = rawItems
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => ({
        headline: String(entry.headline ?? '').trim(),
        summary: String(entry.summary ?? '').trim(),
        sourceHandle: normalizeTwitterHandle(String(entry.sourceHandle ?? '')),
        sourceName: String(entry.sourceName ?? '').trim() || 'مصادر إخبارية',
        category: String(entry.category ?? 'أخبار').trim(),
        timeLabel: String(entry.timeLabel ?? 'حديث').trim(),
      }))
      .filter((item) => item.headline.length > 0 && item.summary.length > 0);

    if (items.length === 0) return null;

    return {
      title: String(parsed.title ?? 'نشرة أثير الإخبارية').trim(),
      intro: String(parsed.intro ?? 'أهلاً بكم إلى نشرة أثير الإخبارية المباشرة.').trim(),
      outro: String(parsed.outro ?? 'كانت هذه أبرز الأخبار من مصادرنا على منصة X. إلى اللقاء.').trim(),
      items,
    };
  } catch {
    return null;
  }
}

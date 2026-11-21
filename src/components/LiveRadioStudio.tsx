import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ExternalLink,
  Headphones,
  Monitor,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Star,
  Timer,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ChannelCategory, NewsChannel } from '../types/broadcast';
import {
  buildYouTubeEmbedUrl,
  filterChannels,
  formatTimeDuration,
  getEffectiveStreamMode,
  hasYouTubeFallback,
  isHlsStreamUrl,
} from '../utils/broadcast';
import { ChannelLogo } from './ChannelLogo';

interface LiveRadioStudioProps {
  channels: NewsChannel[];
  activeChannel: NewsChannel;
  favoriteIds: string[];
  onSelectChannel: (channel: NewsChannel) => void;
  onToggleFavorite: (channelId: string) => void;
  onOpenAddModal: () => void;
  onDeleteCustomChannel: (channelId: string) => void;
  onJumpToBulletin: () => void;
  activeTwitterCount: number;
}

const STUDIO_BACKDROP_SRC = '/src/assets/images/studio_radio_backdrop_1795265728441.jpg';
const ACOUSTIC_TEXTURE_SRC = '/src/assets/images/acoustic_panel_texture_1795265710878.jpg';

function getDialPercent(frequency: string): number {
  const num = Number.parseFloat(frequency);
  if (!Number.isFinite(num)) return 50;
  return Math.max(6, Math.min(94, ((num - 88) / (108 - 88)) * 100));
}

const CATEGORY_TABS: { id: ChannelCategory | 'all' | 'favorites'; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'arabic', label: 'إخبارية عربية' },
  { id: 'field', label: 'مباشر وميداني' },
  { id: 'international', label: 'دولية' },
  { id: 'custom', label: 'مخصصة' },
  { id: 'favorites', label: 'المفضلة' },
];

const SLEEP_OPTIONS = [
  { minutes: 0, label: 'بلا مؤقت' },
  { minutes: 15, label: '15 دقيقة' },
  { minutes: 30, label: '30 دقيقة' },
  { minutes: 60, label: '60 دقيقة' },
];

export function LiveRadioStudio({
  channels,
  activeChannel,
  favoriteIds,
  onSelectChannel,
  onToggleFavorite,
  onOpenAddModal,
  onDeleteCustomChannel,
  onJumpToBulletin,
  activeTwitterCount,
}: LiveRadioStudioProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showVideoMonitor, setShowVideoMonitor] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ChannelCategory | 'all' | 'favorites'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState<number>(0);
  const [sleepChoice, setSleepChoice] = useState<number>(0);
  const [backdropError, setBackdropError] = useState(false);
  const [audioFailedIds, setAudioFailedIds] = useState<Record<string, boolean>>({});
  const [audioErrorMsg, setAudioErrorMsg] = useState<string | null>(null);
  const [resolvedVideos, setResolvedVideos] = useState<Record<string, { videoId: string; title?: string }>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const canFallbackToYouTube = hasYouTubeFallback(activeChannel);
  const hasFailedAudio = Boolean(audioFailedIds[activeChannel.id]);
  const baseStreamMode = getEffectiveStreamMode(activeChannel, hasFailedAudio);
  const activeEngineMode: 'audio' | 'youtube' =
    showVideoMonitor && canFallbackToYouTube ? 'youtube' : baseStreamMode;

  const stopAudioEngine = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const audioEl = audioRef.current;
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
    }
    setIsBuffering(false);
  }, []);

  const triggerAudioFallback = useCallback(
    (channel: NewsChannel) => {
      stopAudioEngine();
      if (hasYouTubeFallback(channel)) {
        setAudioFailedIds((prev) => ({ ...prev, [channel.id]: true }));
        setAudioErrorMsg('تعذّر الاتصال بالبث الصوتي المباشر؛ تم التحويل تلقائياً إلى بث يوتيوب الاحتياطي.');
      } else {
        setAudioErrorMsg('تعذّر الاتصال برابط البث الصوتي المباشر. تحقق من الرابط أو أعد المحاولة.');
        setIsPlaying(false);
      }
    },
    [stopAudioEngine]
  );

  // Reset error & video monitor when switching to a channel without YouTube fallback
  useEffect(() => {
    setAudioErrorMsg(null);
    if (!hasYouTubeFallback(activeChannel)) {
      setShowVideoMonitor(false);
    }
  }, [activeChannel]);

  // Resolve live YouTube video ID only when channel actually needs YouTube playback or monitor
  useEffect(() => {
    if (activeEngineMode !== 'youtube') return;
    if (activeChannel.sourceKind !== 'channel' || !activeChannel.youtubeId) return;
    let cancelled = false;
    const params = new URLSearchParams({ channelId: activeChannel.youtubeId });
    if (activeChannel.streamHint) {
      params.set('hint', activeChannel.streamHint);
    }

    fetch(`/api/youtube/live-video?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { videoId?: string | null; title?: string } | null) => {
        if (cancelled || !data?.videoId) return;
        setResolvedVideos((prev) => ({
          ...prev,
          [activeChannel.id]: { videoId: data.videoId as string, title: data.title },
        }));
      })
      .catch(() => {
        // Fallback video ID on channel remains active
      });

    return () => {
      cancelled = true;
    };
  }, [activeEngineMode, activeChannel.id, activeChannel.sourceKind, activeChannel.youtubeId, activeChannel.streamHint]);

  // 100% Audio-Only HTML5 Audio + hls.js engine
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (!isPlaying || activeEngineMode !== 'audio' || !activeChannel.audioStreamUrl) {
      stopAudioEngine();
      return;
    }

    let cancelled = false;
    let fallbackTriggered = false;
    let mediaRecoveryUsed = false;
    const streamUrl = activeChannel.audioStreamUrl;
    const useHls = isHlsStreamUrl(streamUrl, activeChannel.audioStreamFormat);

    const failOnce = () => {
      if (cancelled || fallbackTriggered) return;
      fallbackTriggered = true;
      triggerAudioFallback(activeChannel);
    };

    setAudioErrorMsg(null);
    setIsBuffering(true);
    audioEl.muted = isMuted;

    const handlePlaying = () => {
      if (!cancelled) {
        setIsBuffering(false);
        setAudioErrorMsg(null);
      }
    };
    const handleWaiting = () => {
      if (!cancelled) setIsBuffering(true);
    };
    const handleError = () => {
      failOnce();
    };

    audioEl.addEventListener('playing', handlePlaying);
    audioEl.addEventListener('waiting', handleWaiting);
    audioEl.addEventListener('error', handleError);

    const stallTimeout = window.setTimeout(() => {
      if (!cancelled && audioEl.readyState < 2 && audioEl.paused) {
        failOnce();
      }
    }, 14000);

    if (useHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 20,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        audioEl.play().catch(() => {
          if (!cancelled) setIsBuffering(false);
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecoveryUsed) {
          mediaRecoveryUsed = true;
          hls.recoverMediaError();
          return;
        }
        failOnce();
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(audioEl);
    } else {
      audioEl.src = streamUrl;
      audioEl.load();
      audioEl.play().catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        // Ignore browser autoplay policy error; trigger fallback only on unsupported/broken media
        if (name === 'NotSupportedError') {
          failOnce();
        } else {
          setIsBuffering(false);
        }
      });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(stallTimeout);
      audioEl.removeEventListener('playing', handlePlaying);
      audioEl.removeEventListener('waiting', handleWaiting);
      audioEl.removeEventListener('error', handleError);
      stopAudioEngine();
    };
  }, [
    isPlaying,
    activeEngineMode,
    activeChannel,
    stopAudioEngine,
    triggerAudioFallback,
  ]);

  // Sync mute state cleanly without restarting audio stream
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const sendYouTubeCommand = (func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  };

  // Media Session API integration (lock screen, Bluetooth, notification controls)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') {
      return;
    }
    const modeLabel =
      activeEngineMode === 'audio' ? 'صوت فقط • موفّر للنت' : 'بث يوتيوب';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: activeChannel.name,
      artist: `${activeChannel.city} · ${modeLabel}`,
      album: 'أثير الإخبارية — إذاعة البث الحي',
      artwork: [
        { src: activeChannel.logoUrl || '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: activeChannel.fallbackLogoUrl || '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    const switchOffset = (delta: number) => {
      if (channels.length === 0) return;
      const idx = channels.findIndex((c) => c.id === activeChannel.id);
      const nextIdx = (idx + delta + channels.length) % channels.length;
      onSelectChannel(channels[nextIdx]);
      setIsPlaying(true);
    };

    try {
      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('stop', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('nexttrack', () => switchOffset(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => switchOffset(-1));
    } catch {
      // Some browsers restrict specific MediaSession actions
    }
  }, [
    activeChannel.id,
    activeChannel.name,
    activeChannel.city,
    activeChannel.logoUrl,
    activeChannel.fallbackLogoUrl,
    activeEngineMode,
    isPlaying,
    channels,
    onSelectChannel,
  ]);

  useEffect(() => {
    if (sleepSecondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSleepSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsPlaying(false);
          setSleepChoice(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepSecondsLeft]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      if (activeEngineMode === 'youtube') {
        sendYouTubeCommand('pauseVideo');
      }
      setIsPlaying(false);
    } else {
      // Allow retrying direct audio stream if it previously failed
      if (audioFailedIds[activeChannel.id]) {
        setAudioFailedIds((prev) => {
          const next = { ...prev };
          delete next[activeChannel.id];
          return next;
        });
      }
      setIsPlaying(true);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (isPlaying && activeEngineMode === 'youtube') {
      sendYouTubeCommand(nextMuted ? 'mute' : 'unMute');
    }
  };

  const handleChannelPlayToggle = (channel: NewsChannel) => {
    if (channel.id === activeChannel.id && isPlaying) {
      if (activeEngineMode === 'youtube') {
        sendYouTubeCommand('pauseVideo');
      }
      setIsPlaying(false);
      return;
    }
    // Clear previous failure on explicit re-selection so direct audio is tried first
    if (audioFailedIds[channel.id]) {
      setAudioFailedIds((prev) => {
        const next = { ...prev };
        delete next[channel.id];
        return next;
      });
    }
    onSelectChannel(channel);
    setIsPlaying(true);
  };

  const handleSleepChange = (minutes: number) => {
    setSleepChoice(minutes);
    setSleepSecondsLeft(minutes * 60);
  };

  const activeResolved = resolvedVideos[activeChannel.id];

  const embedUrl = useMemo(
    () =>
      activeEngineMode === 'youtube' && canFallbackToYouTube
        ? buildYouTubeEmbedUrl(activeChannel, {
            autoplay: isPlaying,
            muted: isMuted,
            resolvedVideoId: activeResolved?.videoId,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          })
        : '',
    [activeEngineMode, canFallbackToYouTube, activeChannel, isPlaying, isMuted, activeResolved?.videoId]
  );

  const directWatchUrl = useMemo(() => {
    const vid =
      activeChannel.sourceKind === 'video'
        ? activeChannel.youtubeId
        : activeResolved?.videoId || activeChannel.fallbackVideoId;
    if (vid) return `https://www.youtube.com/watch?v=${vid}`;
    return activeChannel.youtubeUrl || activeChannel.audioStreamUrl || '';
  }, [activeChannel, activeResolved?.videoId]);

  const filteredChannels = useMemo(
    () => filterChannels(channels, selectedCategory, searchQuery, favoriteIds),
    [channels, selectedCategory, searchQuery, favoriteIds]
  );

  const isFavorite = favoriteIds.includes(activeChannel.id);

  return (
    <div className="space-y-10">
      {/* Persistent 100% Audio-Only HTML5 Audio Element */}
      <audio
        ref={audioRef}
        playsInline
        preload="none"
        data-testid="live-audio-element"
        data-stream-mode={activeEngineMode}
        className="sr-only"
      />

      {/* Focal Anchor: Main Broadcast Studio Tuner */}
      <section
        aria-label="جهاز البث الإذاعي المباشر"
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#131820]"
      >
        {/* Subtle studio backdrop photography with measured dark scrim */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {!backdropError ? (
            <img
              src={STUDIO_BACKDROP_SRC}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setBackdropError(true)}
              className="h-full w-full object-cover opacity-25"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#1C2330] via-[#131820] to-[#0B0E13]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-l from-[#0E131B]/95 via-[#0E131B]/88 to-[#0E131B]/75" />
        </div>

        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Station Info & Radio Transport Controls */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                  <span dir="ltr" className="font-mono tabular-nums text-[#E5E7EB]">
                    {activeChannel.frequency}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeChannel.city}</span>
                  <span aria-hidden="true">·</span>
                  {activeEngineMode === 'audio' ? (
                    <span
                      data-testid="active-stream-badge"
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"
                    >
                      <Headphones className="h-3 w-3" />
                      <span>صوت فقط • موفّر للنت</span>
                    </span>
                  ) : (
                    <span
                      data-testid="active-stream-badge"
                      className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300"
                    >
                      <Tv className="h-3 w-3" />
                      <span>{hasFailedAudio ? 'بث يوتيوب (احتياطي)' : 'بث يوتيوب'}</span>
                    </span>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className={isPlaying ? 'text-[#F87171] font-semibold' : 'text-[#9CA3AF]'}>
                    {isPlaying ? (isBuffering ? 'جارٍ الاتصال بالبث...' : 'على الهواء الآن') : 'جاهز للبث'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ChannelLogo
                      name={activeChannel.name}
                      logoUrl={activeChannel.logoUrl}
                      fallbackLogoUrl={activeChannel.fallbackLogoUrl}
                      sizeClass="h-12 w-12 sm:h-14 sm:w-14"
                    />
                    <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.65rem] font-extrabold leading-tight text-white [text-wrap:balance] truncate">
                      {activeChannel.name}
                    </h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(activeChannel.id)}
                    aria-label={
                      isFavorite
                        ? `إزالة ${activeChannel.name} من المفضلة`
                        : `إضافة ${activeChannel.name} إلى المفضلة`
                    }
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      isFavorite
                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                        : 'border-white/10 bg-white/5 text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <p className="max-w-2xl text-sm sm:text-base leading-relaxed text-[#D1D5DB]">
                  {activeChannel.description}
                </p>

                {audioErrorMsg && (
                  <p
                    role="status"
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                  >
                    {audioErrorMsg}
                  </p>
                )}
              </div>

              {/* Radio Control Deck */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="inline-flex items-center gap-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] px-6 py-3 text-sm font-bold text-white transition-colors duration-150 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="h-4 w-4 fill-current" />
                        <span>إيقاف البث</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-current" />
                        <span>تشغيل الإذاعة المباشرة</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleMute}
                    aria-label={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors whitespace-nowrap"
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    <span>{isMuted ? 'الصوت مكتوم' : 'كتم'}</span>
                  </button>

                  {canFallbackToYouTube && (
                    <button
                      type="button"
                      onClick={() => setShowVideoMonitor((v) => !v)}
                      aria-pressed={showVideoMonitor}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                        showVideoMonitor
                          ? 'border-white/30 bg-white/15 text-white'
                          : 'border-white/15 bg-white/5 text-[#D1D5DB] hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {showVideoMonitor ? (
                        <>
                          <Radio className="h-4 w-4" />
                          <span>
                            {activeChannel.audioStreamUrl ? 'العودة لوضع الصوت فقط' : 'العودة لوضع الإذاعة'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Monitor className="h-4 w-4" />
                          <span>عرض البث المرئي (يوتيوب)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Operational Controls Strip: Sleep Timer & Direct Source Link */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 border-t border-white/10 text-xs text-[#9CA3AF]">
                  <div className="flex items-center gap-2">
                    <Timer className="h-3.5 w-3.5 text-[#9CA3AF]" />
                    <label htmlFor="sleep-timer-select" className="sr-only">
                      مؤقت إيقاف البث
                    </label>
                    <select
                      id="sleep-timer-select"
                      value={sleepChoice}
                      onChange={(e) => handleSleepChange(Number(e.target.value))}
                      className="rounded-md border border-white/10 bg-[#0B0E13] px-2.5 py-1 text-xs text-[#E5E7EB] focus:border-[#DC2626] focus:outline-none"
                    >
                      {SLEEP_OPTIONS.map((opt) => (
                        <option key={opt.minutes} value={opt.minutes}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {sleepSecondsLeft > 0 && (
                      <span className="font-mono tabular-nums text-[#F87171]">
                        {formatTimeDuration(sleepSecondsLeft)}
                      </span>
                    )}
                  </div>

                  {directWatchUrl && (
                    <>
                      <span aria-hidden="true" className="hidden sm:inline">
                        ·
                      </span>
                      <a
                        href={directWatchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[#D1D5DB] hover:text-white transition-colors"
                      >
                        <span>
                          {canFallbackToYouTube ? 'فتح المصدر على يوتيوب' : 'رابط البث الصوتي'}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </>
                  )}

                  <span aria-hidden="true" className="hidden sm:inline">
                    ·
                  </span>

                  <button
                    type="button"
                    onClick={onJumpToBulletin}
                    className="text-[#D1D5DB] hover:text-white underline underline-offset-4 transition-colors"
                  >
                    الانتقال إلى نشرة مصادر X ({activeTwitterCount} حساباً نشطاً)
                  </button>
                </div>
              </div>
            </div>

            {/* Broadcast Audio Tuner Surface / Optional Live YouTube Monitor */}
            <div className="lg:col-span-5 flex flex-col justify-center">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[#090C10]">
                {/* Mount YouTube iframe ONLY when effective mode is YouTube (never mounted during Audio-Only playback!) */}
                {activeEngineMode === 'youtube' && (isPlaying || showVideoMonitor) && embedUrl && (
                  <iframe
                    key={`${activeChannel.id}-${activeResolved?.videoId ?? activeChannel.fallbackVideoId ?? activeChannel.youtubeId}-${isPlaying ? 'play' : 'idle'}`}
                    ref={iframeRef}
                    src={embedUrl}
                    title={`بث قناة ${activeChannel.name} المباشر`}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className={`h-full w-full transition-opacity duration-200 ${
                      showVideoMonitor ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  />
                )}

                {/* Radio-First Acoustic Studio Console Overlay when in Audio Radio Mode */}
                {!showVideoMonitor && (
                  <div className="absolute inset-0 flex flex-col justify-between p-5 overflow-hidden">
                    <img
                      src={ACOUSTIC_TEXTURE_SRC}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover opacity-20 pointer-events-none"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-b from-[#0E131B]/85 via-[#0C1017]/90 to-[#090C10]/95 pointer-events-none"
                    />

                    <div className="relative flex items-center justify-between text-xs text-[#9CA3AF]">
                      <span dir="ltr" className="font-mono tabular-nums tracking-wider text-[#F3F4F6] font-semibold">
                        {activeChannel.frequency}
                      </span>
                      <span className={activeEngineMode === 'audio' ? 'text-emerald-300 font-medium' : 'text-[#9CA3AF]'}>
                        {activeEngineMode === 'audio'
                          ? activeChannel.audioStreamFormat === 'hls'
                            ? 'بث صوتي صرف (HLS Audio)'
                            : 'بث إذاعي صوتي صرف (MP3/AAC)'
                          : 'استقبال عبر يوتيوب'}
                      </span>
                    </div>

                    {/* Tactile Spectrum Equalizer Bars + Analog FM Tuner Ruler */}
                    <div className="relative my-2 space-y-4">
                      <div
                        className="flex items-end justify-center gap-1.5 h-12"
                        aria-hidden="true"
                      >
                        {[
                          { anim: 'animate-eq-1', idle: 'scale-y-[0.28]' },
                          { anim: 'animate-eq-3', idle: 'scale-y-[0.45]' },
                          { anim: 'animate-eq-2', idle: 'scale-y-[0.34]' },
                          { anim: 'animate-eq-4', idle: 'scale-y-[0.62]' },
                          { anim: 'animate-eq-5', idle: 'scale-y-[0.48]' },
                          { anim: 'animate-eq-2', idle: 'scale-y-[0.72]' },
                          { anim: 'animate-eq-1', idle: 'scale-y-[0.55]' },
                          { anim: 'animate-eq-4', idle: 'scale-y-[0.42]' },
                          { anim: 'animate-eq-3', idle: 'scale-y-[0.64]' },
                          { anim: 'animate-eq-5', idle: 'scale-y-[0.36]' },
                          { anim: 'animate-eq-2', idle: 'scale-y-[0.48]' },
                          { anim: 'animate-eq-1', idle: 'scale-y-[0.25]' },
                        ].map((bar, idx) => (
                          <span
                            key={idx}
                            className={`w-1.5 h-12 rounded-full origin-bottom transition-transform duration-200 ${
                              isPlaying && !isMuted
                                ? `bg-[#DC2626] ${bar.anim}`
                                : `bg-white/20 ${bar.idle}`
                            }`}
                          />
                        ))}
                      </div>

                      {/* Proportional FM Frequency Scale */}
                      <div className="space-y-1.5" dir="ltr" aria-hidden="true">
                        <div className="relative h-2 w-full rounded-full bg-white/10">
                          <div className="absolute inset-y-0 inset-x-2 flex items-center justify-between">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((tick) => (
                              <span key={tick} className="h-1.5 w-px bg-white/25" />
                            ))}
                          </div>
                          <span
                            style={{ left: `${getDialPercent(activeChannel.frequency)}%` }}
                            className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-[#DC2626] transition-[left] duration-300"
                          />
                        </div>
                        <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-[#6B7280]">
                          <span>88</span>
                          <span>93</span>
                          <span>98</span>
                          <span>103</span>
                          <span>108 MHz</span>
                        </div>
                      </div>
                    </div>

                    <div className="relative flex items-center justify-between border-t border-white/10 pt-3 text-xs">
                      <span className="font-medium text-[#E5E7EB] truncate">
                        {activeChannel.name}
                      </span>
                      <span className="text-[#9CA3AF] shrink-0">
                        {isPlaying
                          ? isMuted
                            ? 'صوت مكتوم'
                            : isBuffering
                              ? 'جارٍ التحميل...'
                              : 'جاري البث'
                          : 'اضغط تشغيل للاستماع'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Station Directory Controls */}
      <section aria-label="دليل القنوات الإخبارية المباشرة" className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              قنوات البث الإخباري المباشر
            </h2>
            <p className="mt-1 text-sm text-[#9CA3AF]">
              تعمل القنوات الإذاعية ببث صوتي صرف 100% لتوفير الإنترنت، مع تحويل تلقائي ليوتيوب عند الحاجة.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة قناة</span>
          </button>
        </div>

        {/* Category Filter & Search Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div
            role="tablist"
            aria-label="تصنيف القنوات"
            className="flex flex-wrap items-center gap-1 rounded-lg bg-[#141922] p-1 border border-white/10"
          >
            {CATEGORY_TABS.map((tab) => {
              const selected = selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-[#DC2626] text-white'
                      : 'text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-72">
            <label htmlFor="channel-search" className="sr-only">
              البحث في القنوات
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]"
            />
            <input
              id="channel-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم القناة أو المدينة..."
              className="w-full rounded-lg border border-white/10 bg-[#141922] pr-10 pl-3.5 py-2 text-sm text-white placeholder:text-[#6B7280] focus:border-[#DC2626] focus:outline-none"
            />
          </div>
        </div>

        {/* Stations Grid */}
        {filteredChannels.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#131820] px-6 py-12 text-center">
            <p className="text-base font-medium text-white">
              لا توجد قنوات مطابقة لخيارات البحث الحالية
            </p>
            <p className="mt-1.5 text-sm text-[#9CA3AF]">
              جرّب تغيير التصنيف أو مسح عبارة البحث أو إضافة قناة صوتية أو يوتيوب جديدة.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="mt-4 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-medium text-white transition-colors"
            >
              عرض جميع القنوات
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredChannels.map((channel) => {
              const isCurrent = channel.id === activeChannel.id;
              const isFav = favoriteIds.includes(channel.id);
              const channelAudioFailed = Boolean(audioFailedIds[channel.id]);
              const channelMode = getEffectiveStreamMode(channel, channelAudioFailed);

              return (
                <div
                  key={channel.id}
                  className={`group flex flex-col justify-between rounded-xl border p-5 transition-colors duration-150 ${
                    isCurrent
                      ? 'border-[#DC2626]/70 bg-[#191E29]'
                      : 'border-white/10 bg-[#131820] hover:border-white/25 hover:bg-[#171D27]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-[#9CA3AF]">
                      <span dir="ltr" className="font-mono tabular-nums text-[#D1D5DB]">
                        {channel.frequency}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(channel.id)}
                          aria-label={
                            isFav
                              ? `إزالة ${channel.name} من المفضلة`
                              : `إضافة ${channel.name} إلى المفضلة`
                          }
                          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                            isFav
                              ? 'text-amber-400'
                              : 'text-[#6B7280] hover:text-white'
                          }`}
                        >
                          <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                        {channel.isCustom && (
                          <button
                            type="button"
                            onClick={() => onDeleteCustomChannel(channel.id)}
                            aria-label={`حذف قناة ${channel.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-[#6B7280] hover:text-[#F87171] transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleChannelPlayToggle(channel)}
                      className="mt-3 block w-full text-right focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#EF4444]"
                    >
                      <div className="flex items-center gap-3">
                        <ChannelLogo
                          name={channel.name}
                          logoUrl={channel.logoUrl}
                          fallbackLogoUrl={channel.fallbackLogoUrl}
                          sizeClass="h-12 w-12"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display text-base font-bold text-white group-hover:text-white truncate">
                            {channel.name}
                          </h3>
                          <p className="mt-0.5 text-xs text-[#9CA3AF] truncate">
                            {channel.city} · {channel.englishName}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[#9CA3AF]">
                        {channel.description}
                      </p>
                    </button>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                    {channelMode === 'audio' ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
                        <Headphones className="h-3 w-3 shrink-0" />
                        <span>صوت فقط • موفّر للنت</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-medium text-[#D1D5DB]">
                        <Tv className="h-3 w-3 shrink-0 text-amber-400" />
                        <span>{channelAudioFailed ? 'بث يوتيوب (احتياطي)' : 'بث يوتيوب'}</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleChannelPlayToggle(channel)}
                      aria-label={
                        isCurrent && isPlaying
                          ? `إيقاف مؤقت لقناة ${channel.name}`
                          : `تشغيل قناة ${channel.name}`
                      }
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                        isCurrent && isPlaying
                          ? 'bg-[#DC2626] text-white shadow-md shadow-[#DC2626]/30 hover:bg-[#B91C1C]'
                          : 'border border-white/15 bg-white/10 text-white hover:bg-[#DC2626] hover:border-[#DC2626]'
                      }`}
                    >
                      {isCurrent && isPlaying ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4 fill-current -mr-0.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

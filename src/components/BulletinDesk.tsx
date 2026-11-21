import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Headphones,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import type {
  AnchorVoiceName,
  BulletinStyle,
  NewsBulletin,
  TwitterChannelPreset,
  TwitterSource,
} from '../types/broadcast';
import { formatTimeDuration } from '../utils/broadcast';

interface BulletinDeskProps {
  bulletin: NewsBulletin;
  sources: TwitterSource[];
  presets: TwitterChannelPreset[];
  selectedPresetId: string;
  onSelectPreset: (presetId: string) => void;
  onBulletinGenerated: (bulletin: NewsBulletin) => void;
  onManageSources: () => void;
}

const DESK_COVER_SRC = '/src/assets/images/bulletin_desk_cover_1795265729918.jpg';

const VOICE_OPTIONS: { id: AnchorVoiceName; label: string }[] = [
  { id: 'Charon', label: 'مذيع إخباري رصين' },
  { id: 'Kore', label: 'مذيعة نشرة رئيسية' },
  { id: 'Fenrir', label: 'نبرة عاجلة حازمة' },
  { id: 'Zephyr', label: 'موجز هادئ وسلس' },
];

const STYLE_OPTIONS: { id: BulletinStyle; label: string }[] = [
  { id: 'brief', label: 'موجز إذاعي' },
  { id: 'urgent', label: 'تغطية عاجلة' },
  { id: 'detailed', label: 'نشرة تفصيلية' },
];

export function BulletinDesk({
  bulletin,
  sources,
  presets,
  selectedPresetId,
  onSelectPreset,
  onBulletinGenerated,
  onManageSources,
}: BulletinDeskProps) {
  const [style, setStyle] = useState<BulletinStyle>('brief');
  const [focusTopic, setFocusTopic] = useState('');
  const [voiceName, setVoiceName] = useState<AnchorVoiceName>('Charon');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Audio Broadcast Player state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioForBulletinId, setAudioForBulletinId] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [copied, setCopied] = useState(false);
  const [coverError, setCoverError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activePreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? presets[0],
    [presets, selectedPresetId]
  );

  const targetAccounts = useMemo(() => {
    const activeOnes = sources.filter((s) => s.active);
    if (!activePreset || activePreset.topic === 'all') {
      return activeOnes;
    }
    const topicMatches = activeOnes.filter((s) => s.topic === activePreset.topic);
    return topicMatches.length > 0
      ? topicMatches
      : sources.filter((s) => s.topic === activePreset.topic);
  }, [sources, activePreset]);

  // Clean up object URL when bulletin changes or unmounts
  useEffect(() => {
    if (audioForBulletinId && audioForBulletinId !== bulletin.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsAudioPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setAudioUrl(null);
      setAudioForBulletinId(null);
      setAudioError(null);
    }
  }, [bulletin.id, audioForBulletinId]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handleGenerateBulletin = async () => {
    setGenerateError(null);
    if (targetAccounts.length === 0) {
      setGenerateError('لا توجد حسابات X مفعّلة لهذه القناة. أضف أو فعّل حساباً من تبويب «مصادر X».');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/bulletin/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accounts: targetAccounts.map((a) => ({
            handle: a.handle,
            label: a.label,
            topic: a.topic,
          })),
          channelName: activePreset?.name ?? 'نشرة مصادر X',
          style,
          focusTopic: focusTopic.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { bulletin?: NewsBulletin; error?: string };
      if (!response.ok || !data.bulletin) {
        setGenerateError(data.error || 'تعذّر توليد النشرة الإخبارية حالياً.');
        return;
      }
      onBulletinGenerated(data.bulletin);
    } catch {
      setGenerateError('تعذّر الاتصال بالخادم لتجميع الأخبار. تحقق من الاتصال وأعد المحاولة.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAudio = async () => {
    setAudioError(null);
    if (!bulletin.spokenScript.trim()) {
      setAudioError('لا يوجد نص متاح للقراءة الصوتية.');
      return;
    }

    setIsGeneratingAudio(true);
    try {
      const response = await fetch('/api/bulletin/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: bulletin.spokenScript,
          voiceName,
        }),
      });
      const data = (await response.json()) as {
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      };
      if (!response.ok || !data.audioBase64) {
        setAudioError(data.error || 'تعذّر تحويل النشرة إلى بث صوتي.');
        return;
      }

      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
      const nextUrl = URL.createObjectURL(blob);

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioUrl(nextUrl);
      setAudioForBulletinId(bulletin.id);
      setCurrentTime(0);
      window.setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.playbackRate = playbackRate;
          audioRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setAudioError('تعذّر الاتصال بخدمة البث الصوتي.');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleToggleAudioPlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const handleRateChange = (nextRate: number) => {
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(bulletin.spokenScript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const formattedDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(bulletin.generatedAt));
    } catch {
      return '';
    }
  }, [bulletin.generatedAt]);

  return (
    <div className="space-y-8">
      {/* Newsroom Bulletin Control Header */}
      <section
        aria-label="إعداد نشرة أخبار تويتر"
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#131820]"
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {!coverError ? (
            <img
              src={DESK_COVER_SRC}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setCoverError(true)}
              className="h-full w-full object-cover opacity-20"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#1C2330] to-[#0B0E13]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#11161F] via-[#11161F]/90 to-[#11161F]/70" />
        </div>

        <div className="relative p-6 sm:p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs text-[#9CA3AF]">
                غرفة تحرير أثير · تجميع فوري من حسابات منصة X (تويتر)
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white [text-wrap:balance]">
                صانع النشرة الإخبارية من قنوات تويتر
              </h1>
              <p className="max-w-2xl text-sm text-[#D1D5DB]">
                اختر قناة تويتر الإخبارية أو الحسابات المفضلة لديك لتجميع أحدث المستجدات وتحريرها في نشرة إذاعية مقروءة ومسموعة بصوت المذيع.
              </p>
            </div>

            <button
              type="button"
              onClick={onManageSources}
              className="inline-flex items-center gap-2 self-start lg:self-auto rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-white transition-colors whitespace-nowrap"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>إدارة حسابات X ({sources.filter((s) => s.active).length} نشط)</span>
            </button>
          </div>

          {/* Preset X Channels Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {presets.map((preset) => {
              const isSelected = preset.id === activePreset?.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset.id)}
                  aria-pressed={isSelected}
                  className={`text-right rounded-xl border p-4 transition-colors ${
                    isSelected
                      ? 'border-[#DC2626] bg-[#1B212D]'
                      : 'border-white/10 bg-[#0E1219]/80 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-[#9CA3AF]">
                    <span dir="ltr" className="font-mono tabular-nums">{preset.frequency}</span>
                    {isSelected && <span className="text-[#F87171] font-medium">القناة المختارة</span>}
                  </div>
                  <div className="mt-1.5 font-display text-sm font-bold text-white">
                    {preset.name}
                  </div>
                  <p className="mt-1 text-xs text-[#9CA3AF] line-clamp-1">
                    {preset.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Generation Parameters & Primary Trigger */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end pt-4 border-t border-white/10">
            <div className="lg:col-span-4">
              <span className="block text-xs font-medium text-[#9CA3AF] mb-2">
                نمط تحرير النشرة
              </span>
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B0E13] p-1">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStyle(opt.id)}
                    className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      style === opt.id
                        ? 'bg-[#DC2626] text-white'
                        : 'text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5">
              <label htmlFor="bulletin-focus-topic" className="block text-xs font-medium text-[#9CA3AF] mb-2">
                تركيز خاص (اختياري)
              </label>
              <input
                id="bulletin-focus-topic"
                type="text"
                value={focusTopic}
                onChange={(e) => setFocusTopic(e.target.value)}
                placeholder="مثال: أسواق النفط، الذكاء الاصطناعي، التطورات الإقليمية..."
                className="w-full rounded-lg border border-white/10 bg-[#0B0E13] px-3.5 py-2 text-sm text-white placeholder:text-[#6B7280] focus:border-[#DC2626] focus:outline-none"
              />
            </div>

            <div className="lg:col-span-3">
              <button
                type="button"
                onClick={handleGenerateBulletin}
                disabled={isGenerating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 px-5 py-2.5 text-sm font-bold text-white transition-colors whitespace-nowrap"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جارٍ تجميع الأخبار...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    <span>توليد نشرة حية الآن</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active Handles Text Line (Zero-pill discipline) */}
          <div className="text-xs text-[#9CA3AF] flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[#D1D5DB] font-medium">الحسابات المشمولة:</span>
            {targetAccounts.length > 0 ? (
              targetAccounts.map((acc, idx) => (
                <span key={acc.id} className="inline-flex items-center gap-2">
                  <span dir="ltr" className="font-mono text-[#E5E7EB]">
                    @{acc.handle}
                  </span>
                  {idx < targetAccounts.length - 1 && <span aria-hidden="true">·</span>}
                </span>
              ))
            ) : (
              <span className="text-[#F87171]">لا توجد حسابات نشطة في هذا التصنيف</span>
            )}
          </div>

          {generateError && (
            <div
              role="alert"
              className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-sm text-[#FCA5A5]"
            >
              {generateError}
            </div>
          )}
        </div>
      </section>

      {/* Main Editorial Bulletin Output + Audio Anchor Studio */}
      {isGenerating ? (
        <section
          aria-busy="true"
          aria-label="جارٍ إعداد النشرة"
          className="rounded-2xl border border-white/10 bg-[#131820] p-8 space-y-6"
        >
          <div className="h-7 w-2/3 rounded bg-white/10 animate-pulse" />
          <div className="h-4 w-1/3 rounded bg-white/5 animate-pulse" />
          <div className="space-y-4 pt-4 border-t border-white/10">
            {[1, 2, 3].map((n) => (
              <div key={n} className="space-y-2 py-3 border-b border-white/5">
                <div className="h-5 w-3/4 rounded bg-white/10 animate-pulse" />
                <div className="h-4 w-full rounded bg-white/5 animate-pulse" />
                <div className="h-4 w-5/6 rounded bg-white/5 animate-pulse" />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Editorial Reading Column (70%) */}
          <article className="lg:col-span-8 rounded-2xl border border-white/10 bg-[#131820] p-6 sm:p-8 space-y-7">
            <header className="space-y-3 border-b border-white/10 pb-6">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                <span>{bulletin.channelName}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{formattedDate}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{bulletin.items.length} أخبار</span>
                {bulletin.isSample && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-400">نشرة نموذجية تمهيدية</span>
                  </>
                )}
              </div>

              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white leading-snug [text-wrap:balance]">
                {bulletin.title}
              </h2>

              <p className="text-sm sm:text-base leading-relaxed text-[#E5E7EB]">
                {bulletin.intro}
              </p>
            </header>

            {/* Numbered Editorial News Segments */}
            <ol className="divide-y divide-white/10">
              {bulletin.items.map((item, idx) => (
                <li key={item.id} className="py-6 first:pt-0 last:pb-0 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                    <span className="font-mono tabular-nums text-[#F87171] font-semibold">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span aria-hidden="true">/</span>
                    <span className="text-[#E5E7EB] font-medium">{item.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.sourceName}</span>
                    {item.sourceHandle && (
                      <>
                        <span aria-hidden="true">·</span>
                        <a
                          href={`https://x.com/${encodeURIComponent(item.sourceHandle)}`}
                          target="_blank"
                          rel="noreferrer"
                          dir="ltr"
                          className="font-mono text-[#9CA3AF] hover:text-white transition-colors"
                        >
                          @{item.sourceHandle}
                        </a>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{item.timeLabel}</span>
                  </div>

                  <h3 className="font-display text-lg sm:text-xl font-bold text-white leading-snug">
                    {item.headline}
                  </h3>

                  <p className="max-w-prose text-sm sm:text-[15px] leading-[1.85] text-[#D1D5DB]">
                    {item.summary}
                  </p>
                </li>
              ))}
            </ol>

            {/* Anchor Outro & Script Actions */}
            <footer className="pt-6 border-t border-white/10 space-y-4">
              <p className="text-sm leading-relaxed text-[#D1D5DB]">{bulletin.outro}</p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'تم نسخ نص النشرة' : 'نسخ نص المذيع'}</span>
                </button>
              </div>
            </footer>
          </article>

          {/* Margin Sidebar (30%): Audio Anchor Broadcast Player & Verified Grounding Sources */}
          <aside className="lg:col-span-4 space-y-6">
            <section
              aria-label="المذيع الصوتي للنشرة"
              className="rounded-2xl border border-white/10 bg-[#131820] p-6 space-y-5"
            >
              <div className="flex items-center gap-2.5">
                <Headphones className="h-5 w-5 text-[#F87171]" />
                <h3 className="font-display text-lg font-bold text-white">
                  بث النشرة بصوت المذيع
                </h3>
              </div>

              <p className="text-xs leading-relaxed text-[#9CA3AF]">
                حوّل هذه النشرة الإخبارية إلى بث إذاعي مسموع بجودة استوديو للاستماع إليها مباشرة.
              </p>

              <div>
                <label htmlFor="anchor-voice-select" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                  صوت المذيع
                </label>
                <select
                  id="anchor-voice-select"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value as AnchorVoiceName)}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0E13] px-3 py-2 text-sm text-white focus:border-[#DC2626] focus:outline-none"
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleGenerateAudio}
                disabled={isGeneratingAudio}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap"
              >
                {isGeneratingAudio ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جارٍ تسجيل البث الصوتي...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="h-4 w-4" />
                    <span>{audioUrl ? 'إعادة تسجيل النشرة بالصوت المختار' : 'استماع للنشرة بصوت المذيع'}</span>
                  </>
                )}
              </button>

              {audioError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-3.5 py-2.5 text-xs leading-relaxed text-[#FCA5A5]"
                >
                  {audioError}
                </div>
              )}

              {audioUrl && (
                <div className="space-y-4 pt-4 border-t border-white/10">
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    onPlay={() => setIsAudioPlaying(true)}
                    onPause={() => setIsAudioPlaying(false)}
                    onEnded={() => setIsAudioPlaying(false)}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
                  />

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleToggleAudioPlay}
                      aria-label={isAudioPlaying ? 'إيقاف تشغيل النشرة الصوتية' : 'تشغيل النشرة الصوتية'}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#0B0E13] hover:bg-[#E5E7EB] transition-colors"
                    >
                      {isAudioPlaying ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4 fill-current" />
                      )}
                    </button>

                    <div className="flex-1 space-y-1.5">
                      <label htmlFor="bulletin-audio-seek" className="sr-only">
                        موضع تشغيل النشرة الصوتية
                      </label>
                      <input
                        id="bulletin-audio-seek"
                        type="range"
                        min={0}
                        max={duration || 1}
                        step={0.5}
                        value={Math.min(currentTime, duration || 1)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setCurrentTime(val);
                          if (audioRef.current) audioRef.current.currentTime = val;
                        }}
                        className="w-full accent-[#DC2626] cursor-pointer"
                      />
                      <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-[#9CA3AF]">
                        <span>{formatTimeDuration(currentTime)}</span>
                        <span>{formatTimeDuration(duration)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1">
                      {[1, 1.25, 1.5].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => handleRateChange(rate)}
                          className={`rounded px-2 py-1 font-mono text-xs tabular-nums transition-colors ${
                            playbackRate === rate
                              ? 'bg-white/15 text-white'
                              : 'text-[#9CA3AF] hover:text-white'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>

                    <a
                      href={audioUrl}
                      download={`atheer-bulletin-${bulletin.id}.wav`}
                      className="inline-flex items-center gap-1.5 text-xs text-[#D1D5DB] hover:text-white transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>تنزيل WAV</span>
                    </a>
                  </div>
                </div>
              )}
            </section>

            {/* Verified Grounding Sources */}
            <section
              aria-label="المصادر والروابط المرجعية"
              className="rounded-2xl border border-white/10 bg-[#131820] p-6 space-y-4"
            >
              <h3 className="font-display text-base font-bold text-white">
                مصادر التغطية والروابط الموثّقة
              </h3>

              {bulletin.groundingSources.length > 0 ? (
                <ul className="divide-y divide-white/10">
                  {bulletin.groundingSources.map((src) => (
                    <li key={src.uri} className="py-2.5 first:pt-0 last:pb-0">
                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start justify-between gap-2 text-xs leading-relaxed text-[#D1D5DB] hover:text-white transition-colors"
                      >
                        <span className="line-clamp-2">{src.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#6B7280] group-hover:text-white" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs leading-relaxed text-[#9CA3AF]">
                  عند الضغط على «توليد نشرة حية الآن» ستظهر هنا روابط المصادر والتغطيات المباشرة التي استندت إليها النشرة.
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

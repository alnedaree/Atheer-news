import { useMemo, useState, type FormEvent } from 'react';
import { Headphones, Loader2, Tv, X } from 'lucide-react';
import type { ChannelCategory, NewsChannel } from '../types/broadcast';
import { parseChannelSource } from '../utils/broadcast';

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddChannel: (channel: NewsChannel) => void;
}

export function AddChannelModal({ isOpen, onClose, onAddChannel }: AddChannelModalProps) {
  const [name, setName] = useState('');
  const [sourceInput, setSourceInput] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState<ChannelCategory>('custom');
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const detectedSource = useMemo(() => parseChannelSource(sourceInput), [sourceInput]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setError(null);
    setName('');
    setSourceInput('');
    setCity('');
    setCategory('custom');
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedSource = sourceInput.trim();

    if (!trimmedName) {
      setError('يرجى إدخال اسم القناة أو الإذاعة.');
      return;
    }

    const parsed = parseChannelSource(trimmedSource);
    if (!parsed) {
      setError(
        'الرابط غير صالح. أدخل رابط بث صوتي مباشر (.mp3 / .aac / .m3u8) أو رابط قناة/بث يوتيوب (watch?v=... أو @handle أو UC...).'
      );
      return;
    }

    const randomFreq = (88.1 + (Math.abs(trimmedName.length * 7 + trimmedSource.length * 3) % 190) * 0.1).toFixed(1);

    if (parsed.kind === 'audio') {
      const hostLogo = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.host)}&sz=128`;
      const newAudioChannel: NewsChannel = {
        id: `custom-audio-${Date.now()}`,
        name: trimmedName,
        englishName: parsed.host,
        city: city.trim() || 'إذاعة مخصّصة',
        frequency: `${randomFreq} FM`,
        category,
        description:
          parsed.format === 'hls'
            ? 'بث إذاعي صوتي صرف (HLS .m3u8) موفّر للإنترنت.'
            : 'بث إذاعي صوتي مباشر (MP3 / AAC) موفّر للإنترنت.',
        sourceKind: 'audio',
        audioStreamUrl: parsed.streamUrl,
        audioStreamFormat: parsed.format,
        logoUrl: hostLogo,
        fallbackLogoUrl: '/pwa-192x192.png',
        monogram: trimmedName.slice(0, 5),
        isCustom: true,
      };
      onAddChannel(newAudioChannel);
      resetAndClose();
      return;
    }

    const defaultYoutubeFallback = 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128';
    let sourceKind: 'channel' | 'video' = parsed.kind === 'video' ? 'video' : 'channel';
    let youtubeId = parsed.id;
    let youtubeUrl = parsed.canonicalUrl;
    let logoUrl =
      parsed.kind === 'video'
        ? `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg`
        : defaultYoutubeFallback;
    let fallbackLogoUrl = defaultYoutubeFallback;

    setIsResolving(true);
    try {
      const res = await fetch('/api/youtube/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: trimmedSource }),
      });
      const data = (await res.json()) as {
        sourceKind?: 'channel' | 'video';
        youtubeId?: string;
        youtubeUrl?: string;
        logoUrl?: string;
        fallbackLogoUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.youtubeId || !data.sourceKind) {
        if (parsed.kind === 'handle') {
          setError(data.error || 'تعذّر استخراج معرّف قناة يوتيوب.');
          setIsResolving(false);
          return;
        }
      } else {
        sourceKind = data.sourceKind;
        youtubeId = data.youtubeId;
        youtubeUrl = data.youtubeUrl || parsed.canonicalUrl;
        if (data.logoUrl) logoUrl = data.logoUrl;
        if (data.fallbackLogoUrl) fallbackLogoUrl = data.fallbackLogoUrl;
      }
    } catch {
      if (parsed.kind === 'handle') {
        setError('تعذّر الاتصال بالخادم لفحص رابط القناة. جرّب لصق رابط البث المباشر (watch?v=...).');
        setIsResolving(false);
        return;
      }
    }
    setIsResolving(false);

    const newChannel: NewsChannel = {
      id: `custom-${Date.now()}`,
      name: trimmedName,
      englishName: trimmedName,
      city: city.trim() || 'بث مخصّص',
      frequency: `${randomFreq} FM`,
      category,
      description: 'قناة بث مباشر مضافة عبر يوتيوب.',
      sourceKind,
      youtubeId,
      youtubeUrl,
      logoUrl,
      fallbackLogoUrl,
      monogram: trimmedName.slice(0, 5),
      isCustom: true,
    };

    onAddChannel(newChannel);
    resetAndClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-channel-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#141922] p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <h2 id="add-channel-title" className="font-display text-lg font-bold text-white">
            إضافة قناة إذاعية أو بث يوتيوب
          </h2>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="إغلاق نافذة إضافة القناة"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <div>
            <label htmlFor="custom-channel-name" className="block text-sm font-medium text-[#E5E7EB] mb-1.5">
              اسم القناة أو الإذاعة
            </label>
            <input
              id="custom-channel-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: إذاعة مونت كارلو أو الإخبارية السعودية"
              className="w-full rounded-lg border border-white/15 bg-[#0B0E13] px-3.5 py-2.5 text-sm text-white placeholder:text-[#6B7280] focus:border-[#DC2626] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="custom-channel-url" className="block text-sm font-medium text-[#E5E7EB] mb-1.5">
              رابط البث الصوتي المباشر (.mp3 / .aac / .m3u8) أو رابط يوتيوب
            </label>
            <input
              id="custom-channel-url"
              type="text"
              dir="ltr"
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              placeholder="https://.../live.mp3 أو .../audio.m3u8 أو youtube.com/watch?v=..."
              className="w-full rounded-lg border border-white/15 bg-[#0B0E13] px-3.5 py-2.5 text-left font-mono text-sm text-white placeholder:text-[#6B7280] focus:border-[#DC2626] focus:outline-none"
            />
            {detectedSource ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {detectedSource.kind === 'audio' ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">
                    <Headphones className="h-3.5 w-3.5" />
                    <span>
                      صوت فقط • موفّر للنت ({detectedSource.format.toUpperCase()})
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">
                    <Tv className="h-3.5 w-3.5" />
                    <span>بث يوتيوب مباشر</span>
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-[#9CA3AF]">
                يدعم روابط البث الصوتي المباشر (.mp3، .aac، .m3u8) أو روابط قنوات وبثوث يوتيوب المباشرة.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="custom-channel-city" className="block text-sm font-medium text-[#E5E7EB] mb-1.5">
                المدينة / المقر (اختياري)
              </label>
              <input
                id="custom-channel-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="مثال: الرياض، الدوحة، باريس"
                className="w-full rounded-lg border border-white/15 bg-[#0B0E13] px-3.5 py-2.5 text-sm text-white placeholder:text-[#6B7280] focus:border-[#DC2626] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="custom-channel-category" className="block text-sm font-medium text-[#E5E7EB] mb-1.5">
                التصنيف
              </label>
              <select
                id="custom-channel-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ChannelCategory)}
                className="w-full rounded-lg border border-white/15 bg-[#0B0E13] px-3.5 py-2.5 text-sm text-white focus:border-[#DC2626] focus:outline-none"
              >
                <option value="custom">مخصصة</option>
                <option value="arabic">إخبارية عربية</option>
                <option value="field">ميداني ومباشر</option>
                <option value="international">دولية</option>
              </select>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-3.5 py-2.5 text-xs leading-relaxed text-[#FCA5A5]"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2 text-sm font-medium text-[#D1D5DB] hover:text-white rounded-lg border border-white/10 hover:bg-white/5 transition-colors whitespace-nowrap"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isResolving}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {isResolving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{isResolving ? 'جارٍ فحص القناة...' : 'حفظ القناة'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { BookOpen, Check, Copy, Trash2 } from 'lucide-react';
import type { NewsBulletin } from '../types/broadcast';

interface ArchiveViewProps {
  bulletins: NewsBulletin[];
  activeBulletinId: string;
  onOpenBulletin: (bulletin: NewsBulletin) => void;
  onDeleteBulletin: (bulletinId: string) => void;
  onCreateNew: () => void;
}

export function ArchiveView({
  bulletins,
  activeBulletinId,
  onOpenBulletin,
  onDeleteBulletin,
  onCreateNew,
}: ArchiveViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (bulletin: NewsBulletin) => {
    try {
      await navigator.clipboard.writeText(bulletin.spokenScript);
      setCopiedId(bulletin.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-1.5">
          <p className="text-xs text-[#9CA3AF]">
            أرشيف النشرات المحفوظة محلياً ·{' '}
            <span className="tabular-nums text-[#E5E7EB] font-medium">
              {bulletins.length} نشرة
            </span>
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
            أرشيف نشرات تويتر الإخبارية
          </h1>
          <p className="text-sm text-[#9CA3AF]">
            تصفّح النشرات التي قمت بتوليدها سابقاً أو أعد فتح أي نشرة للاستماع إليها بصوت المذيع.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="self-start sm:self-auto rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap"
        >
          توليد نشرة جديدة
        </button>
      </header>

      {bulletins.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#131820] px-6 py-14 text-center space-y-3">
          <p className="font-display text-lg font-bold text-white">
            الأرشيف فارغ حالياً
          </p>
          <p className="text-sm text-[#9CA3AF] max-w-md mx-auto">
            تُحفظ كل نشرة إخبارية تقوم بتوليدها من حسابات X هنا تلقائياً لتتمكن من العودة إليها في أي وقت.
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="mt-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            إعداد أول نشرة الآن
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#131820]">
          <ul className="divide-y divide-white/10">
            {bulletins.map((b) => {
              const isCurrent = b.id === activeBulletinId;
              return (
                <li
                  key={b.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-5 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                      <span className="tabular-nums">{formatDate(b.generatedAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{b.channelName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{b.items.length} أخبار</span>
                      {b.isSample && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-400">نموذج تمهيدي</span>
                        </>
                      )}
                      {isCurrent && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#F87171] font-medium">معروضة حالياً</span>
                        </>
                      )}
                    </div>

                    <h2 className="font-display text-lg font-bold text-white">
                      {b.title}
                    </h2>

                    <p className="text-xs text-[#9CA3AF] line-clamp-1">
                      {b.intro}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenBulletin(b)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>فتح واستماع</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopy(b)}
                      aria-label={`نسخ نص نشرة ${b.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[#9CA3AF] hover:text-white transition-colors"
                    >
                      {copiedId === b.id ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteBulletin(b.id)}
                      aria-label={`حذف نشرة ${b.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[#9CA3AF] hover:border-[#DC2626]/40 hover:text-[#F87171] transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

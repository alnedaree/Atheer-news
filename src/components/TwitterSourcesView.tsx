import { useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { TwitterSource, TwitterTopic } from '../types/broadcast';
import { normalizeTwitterHandle, validateTwitterHandle } from '../utils/broadcast';

interface TwitterSourcesViewProps {
  sources: TwitterSource[];
  onAddSource: (source: TwitterSource) => void;
  onToggleSource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onResetDefaults: () => void;
  onGoToBulletin: () => void;
}

const TOPIC_LABELS: Record<TwitterTopic, string> = {
  breaking: 'أخبار عاجلة',
  economy: 'اقتصاد وأسواق',
  tech: 'تقنية',
  world: 'شؤون دولية',
  sports: 'رياضة',
};

const TOPIC_FILTERS: { id: TwitterTopic | 'all'; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'breaking', label: 'أخبار عاجلة' },
  { id: 'economy', label: 'اقتصاد وأسواق' },
  { id: 'world', label: 'شؤون دولية' },
  { id: 'tech', label: 'تقنية' },
  { id: 'sports', label: 'رياضة' },
];

export function TwitterSourcesView({
  sources,
  onAddSource,
  onToggleSource,
  onDeleteSource,
  onResetDefaults,
  onGoToBulletin,
}: TwitterSourcesViewProps) {
  const [handleInput, setHandleInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [topicInput, setTopicInput] = useState<TwitterTopic>('breaking');
  const [formError, setFormError] = useState<string | null>(null);

  const [topicFilter, setTopicFilter] = useState<TwitterTopic | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const activeCount = useMemo(() => sources.filter((s) => s.active).length, [sources]);

  const filteredSources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sources.filter((src) => {
      if (topicFilter !== 'all' && src.topic !== topicFilter) return false;
      if (!q) return true;
      return (
        src.handle.toLowerCase().includes(q) ||
        src.label.toLowerCase().includes(q) ||
        TOPIC_LABELS[src.topic].includes(q)
      );
    });
  }, [sources, topicFilter, searchQuery]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validationError = validateTwitterHandle(handleInput);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalized = normalizeTwitterHandle(handleInput);
    const alreadyExists = sources.some(
      (s) => s.handle.toLowerCase() === normalized.toLowerCase()
    );
    if (alreadyExists) {
      setFormError(`الحساب @${normalized} مضاف بالفعل إلى قائمة المصادر.`);
      return;
    }

    const newSource: TwitterSource = {
      id: `x-custom-${Date.now()}`,
      handle: normalized,
      label: labelInput.trim() || `@${normalized}`,
      topic: topicInput,
      active: true,
      isCustom: true,
    };

    onAddSource(newSource);
    setHandleInput('');
    setLabelInput('');
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-1.5">
          <p className="text-xs text-[#9CA3AF]">
            مصادر الأخبار من منصة X (تويتر) ·{' '}
            <span className="tabular-nums text-[#E5E7EB] font-medium">
              {activeCount} من {sources.length} حساباً نشطاً
            </span>
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
            صفحات وحسابات تويتر الإخبارية
          </h1>
          <p className="max-w-2xl text-sm text-[#9CA3AF]">
            أضف أي حساب إخباري أو صحفي من منصة X وحدّد الصفحات النشطة التي يعتمد عليها المحرر في إعداد نشرتك الإخبارية.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-medium text-[#D1D5DB] hover:text-white transition-colors whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={onGoToBulletin}
            className="inline-flex items-center gap-2 rounded-lg bg-white hover:bg-[#E5E7EB] px-4 py-2 text-xs sm:text-sm font-semibold text-[#0B0E13] transition-colors whitespace-nowrap"
          >
            <span>إعداد نشرة بهذه المصادر</span>
          </button>
        </div>
      </header>

      {/* Add New X/Twitter Account Form */}
      <section
        aria-label="إضافة صفحة تويتر جديدة"
        className="rounded-2xl border border-white/10 bg-[#131820] p-6"
      >
        <h2 className="font-display text-base font-bold text-white mb-4">
          إضافة صفحة أو حساب X جديد
        </h2>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end" noValidate>
          <div className="md:col-span-4">
            <label htmlFor="x-handle-input" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
              اسم الحساب أو رابط الصفحة على X
            </label>
            <input
              id="x-handle-input"
              type="text"
              dir="ltr"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              placeholder="@AlEkhbariya_BRK أو https://x.com/..."
              className="w-full rounded-lg border border-white/15 bg-[#0B0E13] px-3.5 py-2.5 text-left font-mono text-sm text-white placeholder:text-[#6B7280] focus:border-[#DC2626] focus:outline-none"
            />
          </div>

          <div className="md:col-span-4">
            <label htmlFor="x-label-input" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
              الاسم التعريفي (اختياري)
            </label>
            <input
              id="x-label-input"
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="مثال: الإخبارية - عاجل"
              className="w-full rounded-lg border border-white/15 bg-[#0B0E13] px-3.5 py-2.5 text-sm text-white placeholder:text-[#6B7280] focus:border-[#DC2626] focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="x-topic-select" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
              التصنيف
            </label>
            <select
              id="x-topic-select"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value as TwitterTopic)}
              className="w-full rounded-lg border border-white/15 bg-[#0B0E13] px-3 py-2.5 text-sm text-white focus:border-[#DC2626] focus:outline-none"
            >
              {Object.entries(TOPIC_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>إضافة حساب</span>
            </button>
          </div>
        </form>

        {formError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-3.5 py-2.5 text-xs text-[#FCA5A5]"
          >
            {formError}
          </div>
        )}
      </section>

      {/* Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="تصفية حسابات X حسب التصنيف"
          className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-[#141922] p-1"
        >
          {TOPIC_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={topicFilter === f.id}
              onClick={() => setTopicFilter(f.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                topicFilter === f.id
                  ? 'bg-[#DC2626] text-white'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <label htmlFor="x-source-search" className="sr-only">
            البحث في حسابات X
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]"
          />
          <input
            id="x-source-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم الحساب أو @handle..."
            className="w-full rounded-lg border border-white/10 bg-[#141922] pr-10 pl-3.5 py-2 text-sm text-white placeholder:text-[#6B7280] focus:border-[#DC2626] focus:outline-none"
          />
        </div>
      </div>

      {/* Accounts Table-Like Clean List */}
      {filteredSources.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#131820] px-6 py-12 text-center">
          <p className="text-base font-medium text-white">لا توجد حسابات مطابقة للبحث</p>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            غيّر التصنيف أو أضف حساب X جديد من النموذج أعلاه.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#131820]">
          <ul className="divide-y divide-white/10">
            {filteredSources.map((src) => (
              <li
                key={src.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold text-white">
                      {src.label}
                    </span>
                    <span aria-hidden="true" className="text-[#4B5563]">
                      ·
                    </span>
                    <a
                      href={`https://x.com/${encodeURIComponent(src.handle)}`}
                      target="_blank"
                      rel="noreferrer"
                      dir="ltr"
                      className="inline-flex items-center gap-1 font-mono text-xs text-[#9CA3AF] hover:text-white transition-colors"
                    >
                      <span>@{src.handle}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="text-xs text-[#9CA3AF]">
                    <span>{TOPIC_LABELS[src.topic]}</span>
                    <span aria-hidden="true"> · </span>
                    <span className={src.active ? 'text-emerald-400' : 'text-[#6B7280]'}>
                      {src.active ? 'مضمّن في النشرة القادمة' : 'متوقف مؤقتاً'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={src.active}
                    aria-label={
                      src.active
                        ? `تعطيل حساب ${src.label}`
                        : `تفعيل حساب ${src.label}`
                    }
                    onClick={() => onToggleSource(src.id)}
                    className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      src.active
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        : 'border-white/15 bg-white/5 text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    {src.active ? 'مفعّل' : 'غير مفعّل'}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteSource(src.id)}
                    aria-label={`حذف حساب ${src.label}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[#9CA3AF] hover:border-[#DC2626]/40 hover:text-[#F87171] transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

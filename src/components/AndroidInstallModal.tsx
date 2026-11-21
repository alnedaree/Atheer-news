import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderArchive,
  Loader2,
  Smartphone,
  X,
} from 'lucide-react';

interface AndroidInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onTriggerInstall: () => Promise<boolean>;
}

const SHARED_PUBLIC_URL =
  'https://ais-pre-hlgzdybqjmsccfgh7yzoxc-70433494319.europe-west2.run.app';

export function AndroidInstallModal({
  isOpen,
  onClose,
  isInstallable,
  isInstalled,
  isIOS,
  onTriggerInstall,
}: AndroidInstallModalProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [zipFeedback, setZipFeedback] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState(SHARED_PUBLIC_URL);

  if (!isOpen) return null;

  const trimmedUrl = publishedUrl.trim() || SHARED_PUBLIC_URL;

  const handleDirectInstall = async () => {
    setInstalling(true);
    try {
      const accepted = await onTriggerInstall();
      if (accepted) onClose();
    } finally {
      setInstalling(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(trimmedUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      setCopiedUrl(false);
    }
  };

  const handleDownloadAndroidZip = async () => {
    setDownloadingZip(true);
    setZipFeedback(null);
    try {
      const endpoint = `/api/android/download-project?appUrl=${encodeURIComponent(trimmedUrl)}`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'atheer-android-apk-project.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      setZipFeedback('تم تنزيل حزمة مشروع أندرويد المستقل (atheer-android-apk-project.zip) بنجاح.');
    } catch {
      setZipFeedback('تعذّر التنزيل التلقائي؛ يرجى المحاولة مجدداً.');
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="android-install-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto"
    >
      <div className="my-auto w-full max-w-xl rounded-2xl border border-white/10 bg-[#141922] p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Smartphone className="h-5 w-5 text-[#F87171]" />
            <h2 id="android-install-title" className="font-display text-lg font-bold text-white">
              بناء وتثبيت تطبيق «أثير الإخبارية» للأندرويد (APK)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة التثبيت"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isInstalled ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            التطبيق مثبّت بالفعل ويعمل الآن بوضع التطبيق المستقل على جهازك.
          </div>
        ) : (
          <div className="space-y-5">
            {isInstallable && (
              <div className="rounded-xl border border-[#DC2626]/40 bg-[#DC2626]/10 p-4 space-y-3">
                <p className="text-sm font-medium text-white">
                  جهازك يدعم التثبيت المباشر الآن بضغطة واحدة:
                </p>
                <button
                  type="button"
                  onClick={handleDirectInstall}
                  disabled={installing}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 px-4 py-2.5 text-sm font-bold text-white transition-colors"
                >
                  <Download className="h-4 w-4" />
                  <span>{installing ? 'جارٍ التثبيت...' : 'تثبيت التطبيق الآن'}</span>
                </button>
              </div>
            )}

            {/* Option 1 (Primary): Standalone Offline-Safe Android Kotlin + Gradle APK Project */}
            <div className="rounded-xl border border-[#DC2626]/35 bg-[#0F131B] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-white">
                  1. مشروع أندرويد المستقل لبناء ملف APK (موصى به — يعمل بلا خادم)
                </h3>
                <span className="text-[11px] font-mono text-[#F87171]">Kotlin + Gradle</span>
              </div>
              <p className="text-xs leading-relaxed text-[#D1D5DB]">
                مشروع أندرويد كامل يضم جميع القنوات المباشرة الثمانية ومصادر X وأيقونة التطبيق مدمجة محلياً عبر{' '}
                <span dir="ltr" className="font-mono text-white">WebViewAssetLoader</span>{' '}
                مع <strong>دعم كامل لتشغيل الصوت في الخلفية وعند قفل الشاشة</strong> (خدمة <span dir="ltr" className="font-mono text-white">mediaPlayback</span> أمامية، إشعار مستمر، عدم إيقاف الـ WebView، وتصغير التطبيق للخلفية عند زر الرجوع).
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed text-[#9CA3AF]">
                <li>اضغط الزر أدناه لتنزيل حزمة <span dir="ltr" className="font-mono text-[#E5E7EB]">atheer-android-apk-project.zip</span>.</li>
                <li>افتح المجلد في <strong>Android Studio</strong> واختر Build APK، أو ارفع ملفاته إلى <strong>GitHub</strong> ليتم بناء <span dir="ltr" className="font-mono text-[#E5E7EB]">app-debug.apk</span> تلقائياً خلال دقيقتين عبر GitHub Actions.</li>
              </ol>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadAndroidZip}
                  disabled={downloadingZip}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 px-4 py-2.5 text-xs font-bold text-white transition-colors whitespace-nowrap"
                >
                  {downloadingZip ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FolderArchive className="h-4 w-4" />
                  )}
                  <span>
                    {downloadingZip
                      ? 'جارٍ تجهيز حزمة أندرويد...'
                      : 'تحميل مشروع أندرويد الجاهز (.zip)'}
                  </span>
                </button>
              </div>
              {zipFeedback && (
                <p className="text-xs text-emerald-300 leading-relaxed" role="status">
                  {zipFeedback}
                </p>
              )}
            </div>

            {/* Option 2: Published URL for Direct Phone PWA Install & PWABuilder */}
            <div className="border-t border-white/10 pt-4 space-y-2.5">
              <h3 className="font-display text-sm font-bold text-white">
                {isIOS
                  ? '2. التثبيت على iPhone / iPad أو عبر رابط منشور'
                  : '2. التثبيت المباشر على أندرويد (PWA) أو توليد APK عبر PWABuilder'}
              </h3>
              <p className="text-xs leading-relaxed text-[#9CA3AF]">
                لتشغيل التطبيق عبر المتصفح على هاتفك أو عبر PWABuilder، اضغط أولاً على زر{' '}
                <strong className="text-white">Share / Deploy</strong> في الأعلى لنشر الرابط العام، ثم انسخ الرابط أو افتح PWABuilder:
              </p>

              <div className="flex items-center gap-2 pt-1">
                <label htmlFor="pwa-share-url" className="sr-only">
                  رابط التطبيق المنشور لفتحه على أندرويد
                </label>
                <input
                  id="pwa-share-url"
                  type="url"
                  dir="ltr"
                  value={publishedUrl}
                  onChange={(e) => setPublishedUrl(e.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-[#0B0E13] px-3 py-2 font-mono text-xs text-[#D1D5DB] focus:border-[#DC2626] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>نسخ الرابط</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={`https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(trimmedUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                >
                  <span>فتح الرابط في PWABuilder لتوليد APK</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-medium text-white transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

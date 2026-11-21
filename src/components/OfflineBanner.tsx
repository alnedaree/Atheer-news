import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-center text-xs font-medium text-amber-200 flex items-center justify-center gap-2"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>أنت غير متصل بالإنترنت — يمكنك تصفح الأرشيف والمصادر المحفوظة لحين عودة الاتصال.</span>
    </div>
  );
}

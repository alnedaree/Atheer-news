import type { ActiveView } from '../types/broadcast';

interface TopBarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  onQuickBulletin: () => void;
  showInstallAction: boolean;
  onOpenInstall: () => void;
}

const NAV_ITEMS: { id: ActiveView; label: string }[] = [
  { id: 'radio', label: 'الإذاعة المباشرة' },
  { id: 'bulletin', label: 'نشرة تويتر' },
  { id: 'sources', label: 'مصادر X' },
  { id: 'archive', label: 'الأرشيف' },
];

export function TopBar({
  activeView,
  onSelectView,
  onQuickBulletin,
  showInstallAction,
  onOpenInstall,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0E13]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 lg:px-8 h-14 sm:h-16">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectView('radio')}
          className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#EF4444]"
        >
          أثير الإخبارية
        </button>

        {/* Zone 2: 4-5 concise single-line navigation links */}
        <nav
          aria-label="التنقل الرئيسي"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-2 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#EF4444] ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-[#9CA3AF] hover:text-white'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[17px] h-[2px] bg-[#DC2626]"
                  />
                )}
              </button>
            );
          })}
          {showInstallAction && (
            <button
              type="button"
              onClick={onOpenInstall}
              className="py-2 whitespace-nowrap shrink-0 text-[#F87171] hover:text-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#EF4444]"
            >
              تطبيق أندرويد
            </button>
          )}
        </nav>

        {/* Zone 3: Single primary CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onQuickBulletin}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            إعداد نشرة فورية
          </button>
        </div>
      </div>

      {/* Compact single-row mobile navigation */}
      <nav
        aria-label="التنقل على الجوال"
        className="flex md:hidden items-center justify-between border-t border-white/5 px-2 overflow-x-auto"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 min-w-fit px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? 'text-white border-[#DC2626]'
                  : 'text-[#9CA3AF] border-transparent hover:text-white'
              }`}
            >
              {item.label}
            </button>
          );
        })}
        {showInstallAction && (
          <button
            type="button"
            onClick={onOpenInstall}
            className="flex-1 min-w-fit px-3 py-2.5 text-xs font-medium whitespace-nowrap text-[#F87171] border-b-2 border-transparent hover:text-white transition-colors"
          >
            تثبيت أندرويد
          </button>
        )}
      </nav>
    </header>
  );
}

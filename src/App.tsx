import { useEffect, useMemo, useState } from 'react';
import { TopBar } from './components/TopBar';
import { LiveRadioStudio } from './components/LiveRadioStudio';
import { AddChannelModal } from './components/AddChannelModal';
import { BulletinDesk } from './components/BulletinDesk';
import { TwitterSourcesView } from './components/TwitterSourcesView';
import { ArchiveView } from './components/ArchiveView';
import { AndroidInstallModal } from './components/AndroidInstallModal';
import { OfflineBanner } from './components/OfflineBanner';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  DEFAULT_NEWS_CHANNELS,
  DEFAULT_TWITTER_SOURCES,
  SAMPLE_INITIAL_BULLETIN,
  TWITTER_CHANNEL_PRESETS,
} from './data/defaults';
import type {
  ActiveView,
  NewsBulletin,
  NewsChannel,
  TwitterSource,
} from './types/broadcast';

const STORAGE_KEYS = {
  customChannels: 'atheer_custom_channels_v1',
  favorites: 'atheer_favorite_channels_v1',
  twitterSources: 'atheer_twitter_sources_v1',
  bulletins: 'atheer_saved_bulletins_v1',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('radio');

  const [customChannels, setCustomChannels] = useState<NewsChannel[]>(() =>
    readStorage<NewsChannel[]>(STORAGE_KEYS.customChannels, []).map((ch) => ({
      ...ch,
      logoUrl:
        ch.logoUrl ||
        (ch.sourceKind === 'video' && ch.youtubeId
          ? `https://i.ytimg.com/vi/${ch.youtubeId}/hqdefault.jpg`
          : ch.sourceKind === 'audio'
            ? '/pwa-192x192.png'
            : 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128'),
      fallbackLogoUrl:
        ch.fallbackLogoUrl ||
        (ch.sourceKind === 'audio'
          ? '/pwa-192x192.png'
          : 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128'),
    }))
  );
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.favorites, ['aljazeera', 'alarabiya'])
  );
  const [twitterSources, setTwitterSources] = useState<TwitterSource[]>(() =>
    readStorage<TwitterSource[]>(STORAGE_KEYS.twitterSources, DEFAULT_TWITTER_SOURCES)
  );
  const [bulletins, setBulletins] = useState<NewsBulletin[]>(() => {
    const saved = readStorage<NewsBulletin[]>(STORAGE_KEYS.bulletins, []);
    return saved.length > 0 ? saved : [SAMPLE_INITIAL_BULLETIN];
  });

  const allChannels = useMemo(
    () => [...DEFAULT_NEWS_CHANNELS, ...customChannels],
    [customChannels]
  );

  const [activeChannelId, setActiveChannelId] = useState<string>(DEFAULT_NEWS_CHANNELS[0].id);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(TWITTER_CHANNEL_PRESETS[0].id);
  const [activeBulletinId, setActiveBulletinId] = useState<string>(
    () => bulletins[0]?.id ?? SAMPLE_INITIAL_BULLETIN.id
  );
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const activeChannel = useMemo(
    () => allChannels.find((c) => c.id === activeChannelId) ?? allChannels[0],
    [allChannels, activeChannelId]
  );

  const activeBulletin = useMemo(
    () => bulletins.find((b) => b.id === activeBulletinId) ?? bulletins[0] ?? SAMPLE_INITIAL_BULLETIN,
    [bulletins, activeBulletinId]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.customChannels, JSON.stringify(customChannels));
    } catch {
      // Ignore storage quota issues
    }
  }, [customChannels]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favoriteIds));
    } catch {
      // Ignore
    }
  }, [favoriteIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.twitterSources, JSON.stringify(twitterSources));
    } catch {
      // Ignore
    }
  }, [twitterSources]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.bulletins, JSON.stringify(bulletins));
    } catch {
      // Ignore
    }
  }, [bulletins]);

  const handleToggleFavorite = (channelId: string) => {
    setFavoriteIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    );
  };

  const handleAddCustomChannel = (channel: NewsChannel) => {
    setCustomChannels((prev) => [channel, ...prev]);
    setActiveChannelId(channel.id);
  };

  const handleDeleteCustomChannel = (channelId: string) => {
    setCustomChannels((prev) => prev.filter((c) => c.id !== channelId));
    setFavoriteIds((prev) => prev.filter((id) => id !== channelId));
    if (activeChannelId === channelId) {
      setActiveChannelId(DEFAULT_NEWS_CHANNELS[0].id);
    }
  };

  const handleAddTwitterSource = (source: TwitterSource) => {
    setTwitterSources((prev) => [source, ...prev]);
  };

  const handleToggleTwitterSource = (sourceId: string) => {
    setTwitterSources((prev) =>
      prev.map((s) => (s.id === sourceId ? { ...s, active: !s.active } : s))
    );
  };

  const handleDeleteTwitterSource = (sourceId: string) => {
    setTwitterSources((prev) => prev.filter((s) => s.id !== sourceId));
  };

  const handleResetTwitterDefaults = () => {
    setTwitterSources(DEFAULT_TWITTER_SOURCES);
  };

  const handleBulletinGenerated = (newBulletin: NewsBulletin) => {
    setBulletins((prev) => {
      const withoutSample = prev.filter((b) => !b.isSample);
      return [newBulletin, ...withoutSample].slice(0, 25);
    });
    setActiveBulletinId(newBulletin.id);
  };

  const handleOpenBulletin = (bulletin: NewsBulletin) => {
    setActiveBulletinId(bulletin.id);
    setActiveView('bulletin');
  };

  const handleDeleteBulletin = (bulletinId: string) => {
    setBulletins((prev) => {
      const next = prev.filter((b) => b.id !== bulletinId);
      if (activeBulletinId === bulletinId) {
        setActiveBulletinId(next[0]?.id ?? SAMPLE_INITIAL_BULLETIN.id);
      }
      return next;
    });
  };

  const activeTwitterCount = useMemo(
    () => twitterSources.filter((s) => s.active).length,
    [twitterSources]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E13] text-[#F3F4F6]">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onQuickBulletin={() => setActiveView('bulletin')}
        showInstallAction={!isInstalled}
        onOpenInstall={() => {
          if (isInstallable) {
            void install();
          } else {
            setIsInstallModalOpen(true);
          }
        }}
      />

      <OfflineBanner />

      <main className="flex-1 mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {activeView === 'radio' && (
          <LiveRadioStudio
            channels={allChannels}
            activeChannel={activeChannel}
            favoriteIds={favoriteIds}
            onSelectChannel={(ch) => setActiveChannelId(ch.id)}
            onToggleFavorite={handleToggleFavorite}
            onOpenAddModal={() => setIsAddChannelOpen(true)}
            onDeleteCustomChannel={handleDeleteCustomChannel}
            onJumpToBulletin={() => setActiveView('bulletin')}
            activeTwitterCount={activeTwitterCount}
          />
        )}

        {activeView === 'bulletin' && (
          <BulletinDesk
            bulletin={activeBulletin}
            sources={twitterSources}
            presets={TWITTER_CHANNEL_PRESETS}
            selectedPresetId={selectedPresetId}
            onSelectPreset={setSelectedPresetId}
            onBulletinGenerated={handleBulletinGenerated}
            onManageSources={() => setActiveView('sources')}
          />
        )}

        {activeView === 'sources' && (
          <TwitterSourcesView
            sources={twitterSources}
            onAddSource={handleAddTwitterSource}
            onToggleSource={handleToggleTwitterSource}
            onDeleteSource={handleDeleteTwitterSource}
            onResetDefaults={handleResetTwitterDefaults}
            onGoToBulletin={() => setActiveView('bulletin')}
          />
        )}

        {activeView === 'archive' && (
          <ArchiveView
            bulletins={bulletins}
            activeBulletinId={activeBulletin.id}
            onOpenBulletin={handleOpenBulletin}
            onDeleteBulletin={handleDeleteBulletin}
            onCreateNew={() => setActiveView('bulletin')}
          />
        )}
      </main>

      <footer className="border-t border-white/10 mt-12">
        <div className="mx-auto flex max-w-[1320px] flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-6 text-xs text-[#6B7280]">
          <span>أثير الإخبارية — إذاعة البث الحي ونشرات منصة X</span>
          <div className="flex flex-wrap items-center gap-4">
            {!isInstalled && (
              <button
                type="button"
                onClick={() => setIsInstallModalOpen(true)}
                className="text-[#D1D5DB] hover:text-white underline underline-offset-4 transition-colors"
              >
                تثبيت التطبيق على أندرويد (PWA / APK)
              </button>
            )}
            <span>بث إذاعي صوتي صرف موفّر للإنترنت مع دعم احتياطي لبث يوتيوب الرسمي</span>
          </div>
        </div>
      </footer>

      <AddChannelModal
        isOpen={isAddChannelOpen}
        onClose={() => setIsAddChannelOpen(false)}
        onAddChannel={handleAddCustomChannel}
      />

      <AndroidInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isIOS={isIOS}
        onTriggerInstall={install}
      />
    </div>
  );
}

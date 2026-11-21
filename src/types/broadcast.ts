export type ChannelCategory = 'arabic' | 'field' | 'international' | 'custom';

export type YouTubeSourceKind = 'channel' | 'video' | 'audio';

export type AudioStreamFormat = 'mp3' | 'aac' | 'hls';

export type EffectiveStreamMode = 'audio' | 'youtube';

export interface NewsChannel {
  id: string;
  name: string;
  englishName: string;
  city: string;
  frequency: string;
  category: ChannelCategory;
  description: string;
  sourceKind: YouTubeSourceKind;
  audioStreamUrl?: string;
  audioStreamFormat?: AudioStreamFormat;
  youtubeId?: string;
  fallbackVideoId?: string;
  streamHint?: string;
  youtubeUrl?: string;
  logoUrl: string;
  fallbackLogoUrl: string;
  monogram: string;
  isCustom?: boolean;
}

export type TwitterTopic = 'breaking' | 'economy' | 'tech' | 'sports' | 'world';

export interface TwitterSource {
  id: string;
  handle: string;
  label: string;
  topic: TwitterTopic;
  active: boolean;
  isCustom?: boolean;
}

export interface TwitterChannelPreset {
  id: string;
  name: string;
  description: string;
  topic: TwitterTopic | 'all';
  frequency: string;
}

export type BulletinStyle = 'brief' | 'detailed' | 'urgent';

export type AnchorVoiceName = 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface BulletinItem {
  id: string;
  headline: string;
  summary: string;
  sourceHandle: string;
  sourceName: string;
  category: string;
  timeLabel: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface NewsBulletin {
  id: string;
  title: string;
  channelName: string;
  style: BulletinStyle;
  generatedAt: string;
  intro: string;
  items: BulletinItem[];
  outro: string;
  spokenScript: string;
  accountsUsed: string[];
  groundingSources: GroundingSource[];
  isSample?: boolean;
}

export type ActiveView = 'radio' | 'bulletin' | 'sources' | 'archive';

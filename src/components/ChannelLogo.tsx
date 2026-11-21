import { useEffect, useState } from 'react';

interface ChannelLogoProps {
  name: string;
  logoUrl?: string;
  fallbackLogoUrl?: string;
  sizeClass?: string;
}

const DEFAULT_YOUTUBE_FAVICON = 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128';

export function ChannelLogo({
  name,
  logoUrl,
  fallbackLogoUrl,
  sizeClass = 'h-12 w-12',
}: ChannelLogoProps) {
  const primary = logoUrl?.trim() || fallbackLogoUrl?.trim() || DEFAULT_YOUTUBE_FAVICON;
  const secondary = fallbackLogoUrl?.trim() || DEFAULT_YOUTUBE_FAVICON;
  const [src, setSrc] = useState(primary);

  useEffect(() => {
    setSrc(primary);
  }, [primary]);

  const handleError = () => {
    if (src !== secondary) {
      setSrc(secondary);
    } else if (src !== DEFAULT_YOUTUBE_FAVICON) {
      setSrc(DEFAULT_YOUTUBE_FAVICON);
    }
  };

  return (
    <div
      className={`${sizeClass} shrink-0 overflow-hidden rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-black/10 flex items-center justify-center`}
    >
      <img
        src={src}
        alt={`شعار ${name}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={handleError}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

export const formatTime = (seconds: number): string => {
  if (typeof seconds !== 'number' || isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/**
 * Provides subtle tactile haptic feedback for mobile devices (Vibration API)
 * @param type 'light' for play / scrub release, 'medium' for pause / skip, 'selection' for seek slider scrub ticks
 */
export const triggerHaptic = (type: 'light' | 'medium' | 'selection' = 'light') => {
  try {
    if (typeof window !== 'undefined' && 'navigator' in window && typeof window.navigator.vibrate === 'function') {
      if (type === 'selection') {
        window.navigator.vibrate(8); // micro-tick during slider scrubbing
      } else if (type === 'medium') {
        window.navigator.vibrate(18); // soft bump for pause / skip forward/backward
      } else {
        window.navigator.vibrate(10); // crisp light tap for play / resume
      }
    }
  } catch (e) {
    // Ignore environments where navigator.vibrate is disabled or unsupported
  }
};

export const convertSrtToVtt = (srtContent: string): string => {
  if (srtContent.trim().startsWith('WEBVTT')) {
    return srtContent;
  }
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);
  let vtt = 'WEBVTT\n\n';
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    const convertedLines = lines.map(line => {
      const l = line.trim();
      if (l.includes('-->')) {
        return l.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2').replace(/,/g, '.');
      }
      return l;
    });
    vtt += convertedLines.join('\n') + '\n\n';
  }
  return vtt;
};

const vttBlobCache = new Map<string, string>();

export const convertSrtUrlToVttBlob = async (srtUrl: string): Promise<string> => {
  if (vttBlobCache.has(srtUrl)) {
    return vttBlobCache.get(srtUrl)!;
  }
  try {
    let response: Response | undefined;
    try {
      response = await fetch(srtUrl);
    } catch (e) {
      try {
        response = await fetch(`/api/subtitle?url=${encodeURIComponent(srtUrl)}&format=raw`);
      } catch (err) {}
    }
    if (!response || !response.ok) {
      try {
        response = await fetch(`/api/subtitle?url=${encodeURIComponent(srtUrl)}&format=raw`);
      } catch (err) {}
    }
    if (!response || !response.ok) {
      return `/api/subtitle?url=${encodeURIComponent(srtUrl)}`;
    }
    const srtContent = await response.text();
    if (!srtContent.includes('-->') && !srtContent.includes('WEBVTT')) {
      return `/api/subtitle?url=${encodeURIComponent(srtUrl)}`;
    }
    const vttContent = convertSrtToVtt(srtContent);
    const blob = new Blob([vttContent], { type: 'text/vtt' });
    const blobUrl = URL.createObjectURL(blob);
    vttBlobCache.set(srtUrl, blobUrl);
    return blobUrl;
  } catch (error) {
    return `/api/subtitle?url=${encodeURIComponent(srtUrl)}`;
  }
};

export const getYoutubeId = (url: string): string | null => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

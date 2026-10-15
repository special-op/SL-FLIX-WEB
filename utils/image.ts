export const getOptimizedImageUrl = (url: string, width?: number) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  // Proxy image requests to avoid CORS or optimize
  return `/api/image?url=${encodeURIComponent(url)}${width ? `&w=${width}` : ''}`;
};

export const DEFAULT_FAVICON_FALLBACK = 'https://cdn.pixabay.com/photo/2012/04/13/21/07/play-33654_1280.png';

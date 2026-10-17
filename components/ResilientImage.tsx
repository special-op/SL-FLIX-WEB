import React, { useEffect, useState } from 'react';

interface ResilientImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc: string;
  skeletonClassName?: string;
  retryDelayMs?: number;
}

/** An image with a stable box, loading skeleton, one cache-busting retry, and a final fallback. */
const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  fallbackSrc,
  skeletonClassName = 'bg-white/10 animate-pulse',
  retryDelayMs = 0,
  className = '',
  onError,
  onLoad,
  ...props
}) => {
  const [imageSrc, setImageSrc] = useState<string | undefined>(src as string | undefined);
  const [isLoading, setIsLoading] = useState(Boolean(src));
  const [hasRetried, setHasRetried] = useState(false);

  useEffect(() => {
    setImageSrc(src as string | undefined);
    setIsLoading(Boolean(src));
    setHasRetried(false);
  }, [src]);

  const handleError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (!hasRetried && src) {
      setHasRetried(true);
      const retry = () => setImageSrc(`${String(src)}${String(src).includes('?') ? '&' : '?'}slflix_retry=1`);
      if (retryDelayMs > 0) window.setTimeout(retry, retryDelayMs);
      else retry();
      return;
    }
    setIsLoading(false);
    if (target.src !== fallbackSrc) setImageSrc(fallbackSrc);
    onError?.(event);
  };

  return (
    <span className="relative block w-full h-full overflow-hidden">
      {isLoading && <span aria-hidden="true" className={`absolute inset-0 ${skeletonClassName}`} />}
      <img
        {...props}
        src={imageSrc || fallbackSrc}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onLoad={(event) => {
          setIsLoading(false);
          onLoad?.(event);
        }}
        onError={handleError}
      />
    </span>
  );
};

export default ResilientImage;

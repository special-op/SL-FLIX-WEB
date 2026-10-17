import { useState, useEffect, useRef, useCallback } from 'react';
interface RetryOptions {
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  maxRetries?: number;
}
interface UseInfiniteRetryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  isRetrying: boolean;
}
interface FetchState<T> {
  data: T | null;
  loading: boolean;
  retryCount: number;
  lastError: Error | null;
}
export function useInfiniteRetryFetch<T>(
  fetcher: () => Promise<T>,
  options: RetryOptions = {}
): UseInfiniteRetryResult<T> {
  const {
    initialDelay = 4000,
    maxDelay = 30000,
    backoffMultiplier = 1.5,
    maxRetries = 5
  } = options;
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    retryCount: 0,
    lastError: null
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  const executeFetch = useCallback(async (retryCount: number = 0) => {
    if (!mountedRef.current) return;
    try {
      const result = await fetcherRef.current();
      if (!mountedRef.current) return;
      setState({
        data: result,
        loading: false,
        retryCount,
        lastError: null
      });
    } catch (error) {
      if (!mountedRef.current) return;
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setState(prev => ({ ...prev, loading: false, lastError: normalizedError }));
        return;
      }
      if (retryCount >= maxRetries) {
        setState(prev => ({ ...prev, loading: false, retryCount, lastError: normalizedError }));
        return;
      }
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, retryCount),
        maxDelay
      ) * (0.8 + Math.random() * 0.4);
      console.log(`[InfiniteRetry] Attempt ${retryCount + 1} failed. Retrying in ${delay}ms...`, error);
      setState(prev => ({
        ...prev,
        retryCount: retryCount + 1,
        lastError: normalizedError
      }));
      timeoutRef.current = setTimeout(() => {
        executeFetch(retryCount + 1);
      }, delay);
    }
  }, [initialDelay, maxDelay, backoffMultiplier, maxRetries]);
  useEffect(() => {
    executeFetch(0);
  }, []);
  const retry = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setState(prev => ({
      ...prev,
      loading: true,
      retryCount: 0
    }));
    executeFetch(0);
  }, [executeFetch]);
  return {
    data: state.data,
    loading: state.loading,
    error: state.lastError,
    retry,
    isRetrying: state.loading && state.retryCount > 0
  };
}
export async function fetchWithInfiniteRetry<T>(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  const {
    initialDelay = 4000,
    maxDelay = 30000,
    backoffMultiplier = 1.5,
    maxRetries = 5
  } = retryOptions;
  let retryCount = 0;
  while (retryCount <= maxRetries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.status === 304 || response.status === 204) {
        throw new Error('No content');
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data as T;
    } catch (error) {
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, retryCount),
        maxDelay
      );
      if (retryCount >= maxRetries) throw error;
      console.log(`[fetchWithInfiniteRetry] Attempt ${retryCount + 1} failed. Retrying in ${delay}ms...`, error);
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry limit exceeded');
}
export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineBanner(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineBanner(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!navigator.onLine) {
      setShowOfflineBanner(true);
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return { isOnline, showOfflineBanner };
}
export const OfflineBanner: React.FC = () => {
  const { showOfflineBanner } = useOfflineStatus();
  if (!showOfflineBanner) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-yellow-600/90 text-white text-center py-1 text-sm font-medium animate-fade-in">
      <span className="mr-2">📡</span>
      Offline — Reconnecting...
    </div>
  );
};
export default useInfiniteRetryFetch;

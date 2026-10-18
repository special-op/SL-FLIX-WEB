import { useState, useEffect, useRef } from 'react';
import { ApiService } from '../services/api';
import { CategoryData, MovieResult } from '../types';
interface HomeData {
  categories: CategoryData[];
  hero: MovieResult[];
}
export const useHomeData = () => {
  const [data, setData] = useState<HomeData>({ categories: [], hero: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    const loadHomeData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await ApiService.getHomeData();
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (mountedRef.current) {
          console.error('Home data loading failed:', err);
          setError('Failed to load home data');
          setLoading(false);
        }
      }
    };
    loadHomeData();
    return () => {
      mountedRef.current = false;
    };
  }, [retryKey]);
  return { data, loading, error, retry: () => setRetryKey(value => value + 1) };
};

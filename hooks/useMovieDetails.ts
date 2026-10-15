import { useState, useEffect, useRef } from 'react';
import { ApiService } from '../services/api';
import { MovieResult } from '../types';
export const useMovieDetails = (initialMovie: MovieResult) => {
  const [movie, setMovie] = useState<MovieResult>(initialMovie);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const prefetchTimeoutRef = useRef<NodeJS.Timeout>();
  useEffect(() => {
    mountedRef.current = true;
    if (!initialMovie.subjectId && !initialMovie.detailPath) {
      setError('Invalid movie ID');
      return;
    }
    const loadMovieDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        const fullDetails = await ApiService.getDetails(initialMovie);
        if (mountedRef.current) {
          setMovie(fullDetails);
          if (fullDetails.recommendations?.length === 0) {
            prefetchTimeoutRef.current = setTimeout(() => {
              ApiService.getDetails(fullDetails).catch(() => {});
            }, 1000);
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          console.error('Movie details loading failed:', err);
          setError('Failed to load movie details');
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };
    loadMovieDetails();
    return () => {
      mountedRef.current = false;
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current);
      }
    };
  }, [initialMovie.subjectId, initialMovie.detailPath]);
  const prefetchSources = () => {
    if (movie.subjectId && movie.hasResource !== false) {
      ApiService.getSources(
        movie.subjectId,
        movie.type,
        1,
        1,
        movie.detailPath
      ).catch(() => {
      });
    }
  };
  return { movie, loading, error, prefetchSources };
};
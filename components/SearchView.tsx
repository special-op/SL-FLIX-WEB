import React, { useState, useEffect, useRef } from 'react';
import { MovieResult, ImdbSuggestion } from '../types';
import MovieCard from './MovieCard';
import Loader from './Loader';
import { ApiService } from '../services/api';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { getOptimizedImageUrl, DEFAULT_FAVICON_FALLBACK } from '../utils/image';
import { Search, Clock, X, Sparkles, Film, ArrowRight, Trash2, BookOpen, Star, Eye } from 'lucide-react';

interface NovelSearchResult {
  novelId: string;
  title: string;
  author: string;
  cover: string;
  summary: string;
  score: string;
  totalViews: string;
  totalChapters: number;
}

interface SearchViewProps {
  query: string;
  results: MovieResult[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  recentSearches: string[];
  onSearch: (q: string) => void;
  onClearRecentSearches: () => void;
  onRemoveRecentSearch?: (term: string) => void;
  onMovieClick: (m: MovieResult) => void;
  onNovelClick?: (novelId: string) => void;
  loadMoreRef: React.RefObject<HTMLDivElement>;
}

const SEARCH_PRESETS = [
  'Deadpool',
  'Avengers',
  'Spider-Man',
  'Interstellar',
  'Solo Leveling',
  'Batman',
  'Stranger Things',
  'Shadow Slave'
];

export const SearchView: React.FC<SearchViewProps> = ({
  query,
  results,
  loading,
  loadingMore,
  hasMore,
  recentSearches,
  onSearch,
  onClearRecentSearches,
  onRemoveRecentSearch,
  onMovieClick,
  onNovelClick,
  loadMoreRef
}) => {
  const [inputVal, setInputVal] = useState(query);
  const [suggestions, setSuggestions] = useState<ImdbSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'movies' | 'novels'>('all');
  const [novelResults, setNovelResults] = useState<NovelSearchResult[]>([]);
  const [loadingNovels, setLoadingNovels] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync input value when query prop changes
  useEffect(() => {
    setInputVal(query);
  }, [query]);

  // Search novels whenever query changes
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setNovelResults([]);
      return;
    }
    let isMounted = true;
    const fetchNovels = async () => {
      setLoadingNovels(true);
      try {
        const nRes = await ApiService.getNovels('search', query.trim());
        if (isMounted) {
          setNovelResults(nRes.results || []);
        }
      } catch (err) {
        if (isMounted) setNovelResults([]);
      } finally {
        if (isMounted) setLoadingNovels(false);
      }
    };
    fetchNovels();
    return () => { isMounted = false; };
  }, [query]);

  // Live suggestions debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (inputVal.trim().length > 2) {
        try {
          const suggs = await ApiService.getImdbSuggestions(inputVal.trim());
          setSuggestions(suggs || []);
          setShowSuggestions(true);
        } catch (e) {
          setSuggestions([]);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [inputVal]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setShowSuggestions(false);
    onSearch(inputVal.trim());
  };

  const handleSelectQuery = (q: string) => {
    setInputVal(q);
    setShowSuggestions(false);
    onSearch(q);
  };

  const totalHits = results.length + novelResults.length;

  return (
    <div className="pt-6 md:pt-10 px-[4%] pb-28 max-w-7xl mx-auto">
      {/* Search Bar Container */}
      <div ref={wrapperRef} className="relative mb-8">
        <form onSubmit={handleFormSubmit} className="relative flex items-center">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            placeholder="Search movies, TV series, novels, actors or anime..."
            className="w-full bg-[#111224] hover:bg-[#16172e] focus:bg-[#16172e] border-2 border-white/10 focus:border-primary rounded-2xl py-4 pl-12 pr-28 text-white placeholder-gray-400 outline-none transition-all shadow-2xl text-sm md:text-base font-medium"
          />
          <Search className="absolute left-4 text-primary" size={20} />
          {inputVal && (
            <button
              type="button"
              onClick={() => { setInputVal(''); setSuggestions([]); }}
              className="absolute right-24 text-gray-400 hover:text-white p-1"
            >
              <X size={18} />
            </button>
          )}
          <button
            type="submit"
            className="absolute right-2.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-white text-black font-extrabold text-xs transition-all shadow-[0_0_15px_rgba(0,229,255,0.4)] cursor-pointer"
          >
            Search
          </button>
        </form>

        {/* Live Auto-Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#121326] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto animate-fade-in backdrop-blur-xl">
            <div className="p-2 border-b border-white/10 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={12} className="text-primary" />
              <span>Suggested Matches</span>
            </div>
            {suggestions.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelectQuery(s.l)}
                className="flex items-center gap-3 p-3 hover:bg-white/10 cursor-pointer transition-colors group border-b border-white/5 last:border-0"
              >
                <div className="w-10 h-14 rounded-lg bg-white/5 overflow-hidden flex-shrink-0">
                  {s.i?.imageUrl ? (
                    <LazyLoadImage
                      src={getOptimizedImageUrl(s.i.imageUrl, 100)}
                      alt={s.l}
                      effect="blur"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_FAVICON_FALLBACK; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      <Film size={16} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm truncate group-hover:text-primary transition-colors">
                    {s.l}
                  </div>
                  <div className="text-gray-400 text-xs mt-0.5">
                    {s.q || 'Movie'} {s.y ? `• ${s.y}` : ''}
                  </div>
                </div>
                <ArrowRight size={14} className="text-gray-500 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Searches */}
      {recentSearches.length > 0 && (
        <div className="mb-6 bg-white/[0.03] border border-white/10 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-300 uppercase tracking-wider">
              <Clock size={14} className="text-primary" />
              <span>Recent Searches ({recentSearches.length})</span>
            </div>
            <button
              type="button"
              onClick={onClearRecentSearches}
              className="text-[11px] font-bold text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 size={12} />
              <span>Clear History</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {recentSearches.map((term, idx) => (
              <button
                key={`${term}-${idx}`}
                type="button"
                onClick={() => handleSelectQuery(term)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                  term.toLowerCase() === query.toLowerCase()
                    ? 'bg-primary text-black border-primary shadow-lg shadow-primary/25 font-extrabold'
                    : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/15 hover:text-white hover:border-white/25'
                }`}
                title={`Search for "${term}"`}
              >
                <Search size={12} className={term.toLowerCase() === query.toLowerCase() ? 'text-black' : 'text-primary'} />
                <span>{term}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Popular Keywords */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 mb-8">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex-shrink-0">
          Trending:
        </span>
        {SEARCH_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => handleSelectQuery(preset)}
            className="px-3 py-1 rounded-lg bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-xs font-semibold text-gray-300 hover:text-primary whitespace-nowrap transition-all flex-shrink-0 cursor-pointer"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Filter Tabs */}
      {query && (
        <div className="flex items-center gap-3 mb-8 overflow-x-auto pb-2 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-5 py-2.5 rounded-2xl font-extrabold text-xs transition-all border flex items-center gap-2 cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.4)]'
                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
            }`}
          >
            <span>All Results</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/30 text-white font-mono">
              {totalHits}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('movies')}
            className={`px-5 py-2.5 rounded-2xl font-extrabold text-xs transition-all border flex items-center gap-2 cursor-pointer ${
              activeFilter === 'movies'
                ? 'bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.4)]'
                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
            }`}
          >
            <Film size={14} />
            <span>Movies & TV Shows</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/30 text-white font-mono">
              {results.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('novels')}
            className={`px-5 py-2.5 rounded-2xl font-extrabold text-xs transition-all border flex items-center gap-2 cursor-pointer ${
              activeFilter === 'novels'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
            }`}
          >
            <BookOpen size={14} />
            <span>Web Novels</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/30 text-white font-mono">
              {novelResults.length}
            </span>
          </button>
        </div>
      )}

      {/* Search Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Results for</span>
            <span className="text-primary">"{query}"</span>
          </h2>
          <p className="text-gray-400 text-xs md:text-sm mt-1">
            Found {totalHits} titles across cinema and novel libraries
          </p>
        </div>
      </div>

      {/* Results Content */}
      {loading ? (
        <div className="py-24">
          <Loader />
        </div>
      ) : (
        <div className="space-y-12">
          {/* Movies & Shows Section */}
          {(activeFilter === 'all' || activeFilter === 'movies') && (
            <div>
              {activeFilter === 'all' && results.length > 0 && (
                <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                  <Film size={18} className="text-primary" />
                  <span>Movies & TV Series</span>
                </h3>
              )}
              {results.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
                  {results.map((m, i) => (
                    <div
                      key={`${m.subjectId || m.detailPath}-${i}`}
                      className="transform transition-all duration-300 hover:scale-105 hover:z-10"
                    >
                      <MovieCard movie={m} onClick={onMovieClick} />
                    </div>
                  ))}
                </div>
              ) : activeFilter === 'movies' ? (
                <div className="col-span-full text-center py-16 bg-white/5 rounded-3xl border border-white/10 p-8">
                  <Film size={28} className="mx-auto mb-2 text-gray-500" />
                  <p className="text-gray-300 font-bold">No movies or series matching "{query}"</p>
                </div>
              ) : null}
            </div>
          )}

          {/* Web Novels Section */}
          {(activeFilter === 'all' || activeFilter === 'novels') && (
            <div>
              {(activeFilter === 'all' || activeFilter === 'novels') && novelResults.length > 0 && (
                <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                  <BookOpen size={18} className="text-purple-400" />
                  <span>Web Novels Hub ({novelResults.length})</span>
                </h3>
              )}
              {novelResults.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
                  {novelResults.map((novel, idx) => (
                    <div
                      key={novel.novelId || idx}
                      onClick={() => onNovelClick && onNovelClick(novel.novelId)}
                      className="bg-[#12121e] border border-white/10 rounded-2xl p-3 hover:border-purple-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="relative overflow-hidden rounded-xl mb-2.5 aspect-[3/4] bg-white/5">
                          <LazyLoadImage
                            src={novel.cover}
                            alt={novel.title}
                            effect="blur"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400'; }}
                          />
                          <div className="absolute top-2 right-2 bg-black/80 px-2 py-0.5 rounded-lg text-[10px] font-extrabold text-yellow-400 flex items-center gap-1 border border-white/10">
                            <Star size={10} className="fill-yellow-400 text-yellow-400" />
                            <span>{novel.score || '8.2'}</span>
                          </div>
                          <div className="absolute bottom-2 left-2 bg-purple-600/90 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                            Novel
                          </div>
                        </div>
                        <h4 className="text-xs font-bold text-white line-clamp-1 group-hover:text-purple-400 transition-colors">
                          {novel.title}
                        </h4>
                        <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">
                          {novel.author}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-400">
                        <span className="flex items-center gap-1">
                          <Eye size={10} className="text-cyan-400" />
                          <span>{novel.totalViews || '10K'}</span>
                        </span>
                        <span className="text-purple-300 font-bold">
                          {novel.totalChapters ? `${novel.totalChapters} Ch` : 'Full Story'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeFilter === 'novels' ? (
                <div className="text-center py-16 bg-white/5 rounded-3xl border border-white/10 p-8">
                  <BookOpen size={28} className="mx-auto mb-2 text-gray-500" />
                  <p className="text-gray-300 font-bold">No novels matching "{query}"</p>
                </div>
              ) : null}
            </div>
          )}

          {/* No results at all */}
          {totalHits === 0 && !loading && (
            <div className="col-span-full text-center py-24 bg-white/5 rounded-3xl border border-white/10 p-8">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-3xl text-gray-500">
                <Film size={28} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No Results Found</h3>
              <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
                We couldn't find any movies, series, or novels matching "{query}".
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SEARCH_PRESETS.slice(0, 4).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleSelectQuery(item)}
                    className="px-4 py-2 rounded-xl bg-primary/20 hover:bg-primary text-primary hover:text-black border border-primary/30 font-bold text-xs transition-all cursor-pointer"
                  >
                    Search {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Load More Ref for Infinite Scrolling */}
          <div ref={loadMoreRef} className="flex justify-center py-8">
            {loadingMore && <Loader type="circle" inline />}
            {!hasMore && results.length > 0 && (
              <p className="text-gray-500 text-xs uppercase tracking-wider font-bold">
                End of cinema results
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchView;

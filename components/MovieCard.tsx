import React from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { MovieResult } from '../types';
import { getOptimizedImageUrl, DEFAULT_FAVICON_FALLBACK } from '../utils/image';
interface MovieCardProps {
    movie: MovieResult;
    onClick: (m: MovieResult) => void;
    progress?: number;
}
const MovieCard: React.FC<MovieCardProps> = ({ movie, onClick, progress }) => {
    const getTypeColor = (type: string) => {
        const t = (type || '').toLowerCase();
        if (t.includes('movie')) return 'bg-blue-600/90';
        if (t.includes('tv') || t.includes('series')) return 'bg-purple-600/90';
        if (t.includes('music')) return 'bg-pink-600/90';
        if (t.includes('adult') || t.includes('18')) return 'bg-red-600/90';
        return 'bg-gray-700/90';
    };
    const rating = movie.imdbRating && movie.imdbRating !== '0' && movie.imdbRating !== 'null' ? movie.imdbRating : null;
    const ratingNum = rating ? parseFloat(rating) : 0;
    const showRating = ratingNum > 0;
    return (
        <button
            type="button"
            onClick={() => onClick(movie)}
            aria-label={`Open ${movie.title}`}
            className="w-full cursor-pointer relative transition-all duration-300 hover:scale-[1.02] hover:z-10 group flex flex-col h-full text-left bg-transparent border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
        >
            <div className="w-full aspect-[2/3] rounded-xl overflow-hidden border border-white/5 transition-all duration-300 group-hover:border-primary group-hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)] group-hover:shadow-primary/20 relative bg-[#111]">
                <LazyLoadImage 
                    src={getOptimizedImageUrl(movie.cover, 300)} 
                    alt={movie.title}
                    effect="blur"
                    className="w-full h-full object-cover object-center"
                    wrapperClassName="w-full h-full"
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src !== DEFAULT_FAVICON_FALLBACK) {
                            target.src = DEFAULT_FAVICON_FALLBACK;
                        }
                    }}
                />
                <div className={`absolute top-2 right-2 ${getTypeColor(movie.type)} backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider z-10 shadow-lg`}>
                    {movie.type || 'Unknown'}
                </div>
                {showRating && (
                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 shadow-lg">
                        <i className="fa-solid fa-star text-[10px] text-yellow-400"></i>
                        <span className="text-[11px] font-bold text-white">{ratingNum.toFixed(1)}</span>
                    </div>
                )}
                {progress !== undefined && progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60 z-20 backdrop-blur-sm">
                        <div 
                            className="h-full bg-primary shadow-[0_0_10px_rgba(0,229,255,0.8)]" 
                            style={{ width: `${Math.min(100, progress)}%` }}
                        ></div>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 flex flex-col justify-end p-4">
                    <div className="w-12 h-12 rounded-full bg-primary text-black flex items-center justify-center transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-[0_0_20px_rgba(0,229,255,0.4)] mx-auto mb-4">
                        <i className="fa-solid fa-play ml-1 text-lg"></i>
                    </div>
                </div>
            </div>
            <div className="mt-3 px-1 flex-grow flex flex-col">
                 <h3 className="text-sm font-bold text-white line-clamp-2 group-hover:text-primary transition-colors leading-tight mb-1">{movie.title}</h3>
                 <div className="flex items-center gap-2 mt-auto text-xs font-medium text-gray-400">
                     {movie.releaseDate && <span>{movie.releaseDate.substring(0, 4)}</span>}
                     {movie.releaseDate && movie.genre && <span className="w-1 h-1 bg-gray-600 rounded-full"></span>}
                     {movie.genre && <span className="truncate">{movie.genre.split(',')[0]}</span>}
                 </div>
            </div>
        </button>
    );
};
export default MovieCard;
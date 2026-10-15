import React, { useState, useEffect, useRef } from 'react';
import { MovieResult } from '../types';
import MovieCard from './MovieCard';
import Loader from './Loader';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { getOptimizedImageUrl } from '../utils/image';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, User, Film, Star } from 'lucide-react';
export const StaffView: React.FC<{ 
    staffId: string; 
    staffName: string;
    staffAvatar?: string;
    onBack: () => void;
    onMovieClick: (movie: MovieResult) => void;
}> = ({ staffId, staffName, staffAvatar, onBack, onMovieClick }) => {
    const [movies, setMovies] = useState<MovieResult[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const fetchStaff = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/staff/${staffId}?page=1`);
                const data = await res.json();
                if (data && data.results) {
                    setMovies(data.results);
                }
            } catch (err) {
                console.error(err);
            }
            setLoading(false);
        };
        fetchStaff();
    }, [staffId]);
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);
    return (
        <div className="min-h-screen bg-[#050505] relative overflow-hidden">
            {}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] bg-purple-500/10 blur-[100px] rounded-full" />
            </div>
            {}
            <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
                scrolled ? 'bg-black/80 backdrop-blur-xl border-b border-white/5 py-3' : 'bg-transparent py-6'
            }`}>
                <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between">
                    <button 
                        onClick={onBack} 
                        className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/10"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className={`flex items-center gap-4 transition-all duration-500 ${
                        scrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                    }`}>
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/50 shadow-lg shadow-primary/20">
                            <img 
                                src={staffAvatar ? getOptimizedImageUrl(staffAvatar, 80) : `https://ui-avatars.com/api/?name=${encodeURIComponent(staffName)}`} 
                                alt={staffName}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <h2 className="text-lg font-bold text-white truncate max-w-[200px]">{staffName}</h2>
                    </div>
                    <div className="w-10 h-10 invisible" /> {}
                </div>
            </header>
            <main className="relative z-10 pt-32 px-[4%] pb-24 max-w-[1400px] mx-auto">
                {}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center mb-16 text-center"
                >
                    <div className="relative group mb-8">
                        {}
                        <div className="absolute inset-0 bg-primary/30 blur-[40px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        {staffAvatar ? (
                            <div className="relative w-36 h-36 md:w-48 md:h-48 rounded-full overflow-hidden border-4 border-white/10 shadow-2xl group-hover:border-primary/50 transition-all duration-500 scale-100 group-hover:scale-105">
                                <LazyLoadImage 
                                    src={getOptimizedImageUrl(staffAvatar, 300)} 
                                    alt={staffName} 
                                    effect="blur" 
                                    className="w-full h-full object-cover" 
                                    wrapperClassName="w-full h-full" 
                                    onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(staffName)}&background=1a1a2e&color=fff&size=256`; }} 
                                />
                            </div>
                        ) : (
                            <div className="relative w-36 h-36 md:w-48 md:h-48 rounded-full bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center border-4 border-white/10 shadow-2xl group-hover:border-primary/50 transition-all duration-500">
                                <User size={64} className="text-white/20 group-hover:text-primary/40 transition-colors" />
                            </div>
                        )}
                        {}
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-primary/40 border border-white/20">
                            Staff Artist
                        </div>
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black text-white mb-3 tracking-tight">
                        {staffName}
                    </h1>
                    <div className="flex items-center gap-6 text-gray-400 font-medium">
                        <span className="flex items-center gap-2">
                            <Film size={16} className="text-primary" />
                            {movies.length} Productions
                        </span>
                        <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                        <span className="flex items-center gap-2">
                            <Star size={16} className="text-yellow-500" />
                            Filmography
                        </span>
                    </div>
                </motion.div>
                {}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader />
                        <p className="text-white/40 text-sm font-medium animate-pulse">Scanning Archive...</p>
                    </div>
                ) : (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8"
                    >
                        {movies.map((m, i) => (
                            <motion.div 
                                key={m.subjectId || i}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 * i }}
                                className="group"
                            >
                                <div className="relative transform transition-all duration-500 group-hover:-translate-y-2">
                                    {}
                                    <div className="absolute inset-x-4 bottom-0 h-4 bg-primary/0 group-hover:bg-primary/20 blur-xl transition-all duration-500" />
                                    <MovieCard movie={m} onClick={onMovieClick} />
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
                {}
                {!loading && movies.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                            <Film size={32} className="text-white/20" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">No records found</h3>
                        <p className="text-gray-500 max-w-xs">We couldn't locate any filmography records for this staff member.</p>
                    </div>
                )}
            </main>
        </div>
    );
};
export default StaffView;
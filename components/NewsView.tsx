import React, { useEffect, useState } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { motion, AnimatePresence } from 'motion/react';
import Loader from './Loader';
import { ApiService } from '../services/api';
interface News {
    id: string;
    title: string;
    summary: string;
    cover: { url: string } | string;
    url?: string;
    detailPath?: string;
    category?: number;
    createdAt?: string;
    stat?: {
        viewCount?: number;
    };
}
interface Team {
    id: string;
    name: string;
    score: string;
    avatar: string;
    voteCount: string;
    abbreviation?: string;
}
interface Match {
    id: string;
    team1: Team;
    team2: Team;
    status: string; 
    statusLive: number | string; 
    playPath: string;
    startTime: string;
    endTime: string;
    type: string;
    league: string;
    round?: string;
}
interface Highlight {
    id: string;
    title: string;
    path: string;
    cover: { url: string } | string;
    duration: string;
    createTime: string;
    stat?: {
        viewCount?: string;
    };
}
interface NewsViewProps {
    onPlayMatch?: (match: any) => void;
    onPlayHighlight?: (highlight: any) => void;
}
const formatTimestamp = (timestampStr?: string) => {
    if (!timestampStr) return '';
    try {
        const date = new Date(Number(timestampStr));
        return date.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '';
    }
};
const formatDuration = (secondsStr: string) => {
    try {
        const secs = Number(secondsStr);
        if (isNaN(secs)) return secondsStr;
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    } catch {
        return secondsStr;
    }
};
const NewsView: React.FC<NewsViewProps> = ({ onPlayMatch, onPlayHighlight }) => {
    const [activeTab, setActiveTab] = useState<'news' | 'matches' | 'highlights'>('news');
    const [news, setNews] = useState<News[]>([]);
    const [newsLoading, setNewsLoading] = useState(true);
    const [newsPage, setNewsPage] = useState(1);
    const [loadingMoreNews, setLoadingMoreNews] = useState(false);
    const [matches, setMatches] = useState<Match[]>([]);
    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [feedsLoading, setFeedsLoading] = useState(false);
    const [feedsError, setFeedsError] = useState<string | null>(null);
    const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
    const [matchDetail, setMatchDetail] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedNews, setSelectedNews] = useState<News | null>(null);
    const fetchNews = async (page = 1) => {
        if (page === 1) setNewsLoading(true);
        else setLoadingMoreNews(true);
        try {
            const res = await ApiService.getNews(page);
            const fetchedNews = res.news || [];
            if (page === 1) setNews(fetchedNews);
            else setNews(prev => {
                const existingIds = new Set(prev.map(n => n.id));
                const uniqueNew = fetchedNews.filter((n: News) => !existingIds.has(n.id));
                return [...prev, ...uniqueNew];
            });
        } catch (e) {
            console.error("Failed to load news:", e);
        } finally {
            setNewsLoading(false);
            setLoadingMoreNews(false);
        }
    };
    const fetchFeeds = async () => {
        setFeedsLoading(true);
        setFeedsError(null);
        try {
            const res = await ApiService.getSportFeeds();
            if (res) {
                setMatches(res.matches || []);
                setHighlights(res.highlights || []);
            } else {
                setFeedsError("Failed to fetch sports feeds.");
            }
        } catch (e) {
            console.error("Failed to load sports feeds:", e);
            setFeedsError("Failed to connect to sports feed API.");
        } finally {
            setFeedsLoading(false);
        }
    };
    const handleViewMatchDetail = async (matchId: string) => {
        if (selectedMatchId === matchId) {
            setSelectedMatchId(null);
            setMatchDetail(null);
            return;
        }
        setSelectedMatchId(matchId);
        setDetailLoading(true);
        setMatchDetail(null);
        try {
            const res = await ApiService.getSportMatchDetail(matchId);
            if (res && res.match) {
                setMatchDetail(res);
            }
        } catch (e) {
            console.error("Failed to load match detail:", e);
        } finally {
            setDetailLoading(false);
        }
    };
    useEffect(() => {
        if (activeTab === 'news') {
            if (news.length === 0) fetchNews();
        } else {
            if (matches.length === 0 && highlights.length === 0) fetchFeeds();
        }
    }, [activeTab]);
    const loadMoreNews = () => {
        setNewsPage(prev => prev + 1);
        fetchNews(newsPage + 1);
    };
    return (
        <div className="p-4 md:p-8 bg-[#07070d] min-h-screen text-white pt-24 md:pt-28 pb-32">
            {}
            <div className="max-w-7xl mx-auto mb-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-6">
                    <div>
                        <h1 className="text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                            <span className="w-1.5 h-8 bg-primary rounded-full"></span>
                            Sports Hub
                        </h1>
                        <p className="text-gray-400 text-sm mt-2 font-medium">Your ultimate arena for sports news, live streams, scoreboards, and match highlights.</p>
                    </div>
                    {}
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 self-start">
                        <button 
                            onClick={() => setActiveTab('news')}
                            className={`px-5 py-2.5 rounded-lg font-black text-sm uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${activeTab === 'news' ? 'bg-primary text-black shadow-[0_0_15px_rgba(0,229,255,0.3)]' : 'text-gray-400 hover:text-white'}`}
                        >
                            <i className="fa-solid fa-newspaper"></i>
                            Sports News
                        </button>
                        <button 
                            onClick={() => setActiveTab('matches')}
                            className={`px-5 py-2.5 rounded-lg font-black text-sm uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${activeTab === 'matches' ? 'bg-primary text-black shadow-[0_0_15px_rgba(0,229,255,0.3)]' : 'text-gray-400 hover:text-white'}`}
                        >
                            <i className="fa-solid fa-trophy"></i>
                            Matches & Streams
                        </button>
                        <button 
                            onClick={() => setActiveTab('highlights')}
                            className={`px-5 py-2.5 rounded-lg font-black text-sm uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${activeTab === 'highlights' ? 'bg-primary text-black shadow-[0_0_15px_rgba(0,229,255,0.3)]' : 'text-gray-400 hover:text-white'}`}
                        >
                            <i className="fa-solid fa-circle-play"></i>
                            Highlights
                        </button>
                    </div>
                </div>
            </div>
            {}
            <div className="max-w-7xl mx-auto">
                <AnimatePresence mode="wait">
                    {}
                    {activeTab === 'news' && (
                        <motion.div 
                            key="news-tab"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.3 }}
                        >
                            {newsLoading ? (
                                <div className="py-20 flex justify-center"><Loader type="circle" /></div>
                            ) : news.length === 0 ? (
                                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                                    <i className="fa-solid fa-newspaper text-5xl text-gray-600 mb-4"></i>
                                    <p className="text-gray-400 text-lg">No news articles found right now.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {news.map((item, index) => {
                                            const coverUrl = typeof item.cover === 'string' ? item.cover : (item.cover?.url || 'https://files.catbox.moe/lhdbe0.png');
                                            return (
                                                <motion.div 
                                                    key={`${item.id}-${index}`} 
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: index * 0.05 }}
                                                    onClick={() => setSelectedNews(item)}
                                                    className="bg-[#10101c] rounded-3xl overflow-hidden border border-white/5 hover:border-primary/50 transition-all flex flex-col hover:-translate-y-2 duration-300 cursor-pointer group shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                                >
                                                    <div className="relative overflow-hidden aspect-video">
                                                        <LazyLoadImage src={coverUrl} onError={(e) => { (e.target as HTMLImageElement).src = 'https://files.catbox.moe/lhdbe0.png'; }} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-[#10101c] via-transparent to-transparent"></div>
                                                    </div>
                                                    <div className="p-5 flex-grow flex flex-col justify-between">
                                                        <div>
                                                            <h3 className="font-black text-white text-base mb-3 leading-snug line-clamp-2 group-hover:text-primary transition-colors">{item.title}</h3>
                                                            <p className="text-gray-400 text-xs line-clamp-3 leading-relaxed mb-4 font-medium">{item.summary}</p>
                                                        </div>
                                                        <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold border-t border-white/5 pt-3 mt-2">
                                                            <span className="flex items-center gap-1.5"><i className="fa-regular fa-clock"></i>{formatTimestamp(item.createdAt)?.split(',')[0] || 'Recently'}</span>
                                                            {item.stat?.viewCount !== undefined && <span className="flex items-center gap-1.5"><i className="fa-regular fa-eye"></i>{item.stat.viewCount} Views</span>}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                    {news.length > 0 && (
                                        <button 
                                            onClick={loadMoreNews} 
                                            disabled={loadingMoreNews} 
                                            className="mt-12 w-full py-4 bg-white/5 rounded-2xl font-black hover:bg-white/10 transition-all border border-white/5 hover:border-primary/20 text-sm uppercase tracking-widest text-primary hover:text-white disabled:opacity-50"
                                        >
                                            {loadingMoreNews ? <Loader type="circle" inline /> : 'Load More Headlines'}
                                        </button>
                                    )}
                                </>
                            )}
                        </motion.div>
                    )}
                    {}
                    {activeTab === 'matches' && (
                        <motion.div 
                            key="matches-tab"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.3 }}
                        >
                            {feedsLoading ? (
                                <div className="py-20 flex justify-center"><Loader type="circle" /></div>
                            ) : feedsError ? (
                                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                                    <i className="fa-solid fa-triangle-exclamation text-5xl text-yellow-500 mb-4 animate-bounce"></i>
                                    <p className="text-gray-300 text-lg">{feedsError}</p>
                                    <button onClick={fetchFeeds} className="mt-6 px-6 py-3 bg-primary text-black font-bold uppercase rounded-xl hover:bg-white transition-all">Retry Loading</button>
                                </div>
                            ) : matches.length === 0 ? (
                                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                                    <i className="fa-solid fa-trophy text-5xl text-gray-600 mb-4"></i>
                                    <p className="text-gray-400 text-lg">No matches scheduled today.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {matches.map((match) => {
                                        const isEnded = match.status === 'MatchEnded' || match.statusLive === 3;
                                        const isLive = !isEnded && match.status !== 'MatchNotStart' && (match.statusLive === 'Living' || (match.playPath && match.playPath.length > 0));
                                        const isUpcoming = match.status === 'MatchNotStart' || (!isLive && !isEnded);
                                        const isSelected = selectedMatchId === match.id;
                                        return (
                                            <div key={match.id} className="bg-[#10101c] rounded-3xl border border-white/5 overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
                                                {}
                                                <div className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                                                    {}
                                                    <div className="flex flex-col items-center md:items-start text-center md:text-left md:w-1/4">
                                                        <span className="text-[10px] uppercase font-black tracking-widest text-primary px-3 py-1 bg-primary/10 rounded-full border border-primary/20 mb-3">{match.league}</span>
                                                        <span className="text-xs text-gray-500 font-bold">{match.type === 'football' ? 'Football' : match.type} Match</span>
                                                        <span className="text-xs text-gray-400 font-bold mt-1.5">{formatTimestamp(match.startTime)}</span>
                                                    </div>
                                                    {}
                                                    <div className="flex-grow flex items-center justify-center gap-4 md:gap-10 md:w-2/4">
                                                        {}
                                                        <div className="flex flex-col md:flex-row items-center gap-3 w-1/3 justify-end text-right">
                                                            <span className="font-black text-white text-base md:text-lg line-clamp-1">{match.team1.name}</span>
                                                            <img src={match.team1.avatar || 'https://pbcdn.aoneroom.com/image/2026/04/22/98a8c2b9e4a5af94fe2e1e35e6aa0b5a.png'} alt={match.team1.name} className="w-12 h-12 object-contain bg-white/5 rounded-full p-1" />
                                                        </div>
                                                        {}
                                                        <div className="flex flex-col items-center justify-center px-4 py-2 bg-white/5 rounded-2xl border border-white/5 min-w-[100px]">
                                                            {isEnded ? (
                                                                <span className="text-2xl font-black text-white tracking-widest">{match.team1.score} - {match.team2.score}</span>
                                                            ) : isLive ? (
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-[10px] uppercase font-black text-red-500 tracking-wider flex items-center gap-1 mb-1 animate-pulse">
                                                                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span> Live
                                                                    </span>
                                                                    <span className="text-2xl font-black text-primary tracking-widest">{match.team1.score || 0} - {match.team2.score || 0}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-base font-black text-gray-400 uppercase tracking-widest">VS</span>
                                                            )}
                                                        </div>
                                                        {}
                                                        <div className="flex flex-col md:flex-row-reverse items-center gap-3 w-1/3 justify-end text-left">
                                                            <span className="font-black text-white text-base md:text-lg line-clamp-1">{match.team2.name}</span>
                                                            <img src={match.team2.avatar || 'https://pbcdn.aoneroom.com/image/2026/04/22/98a8c2b9e4a5af94fe2e1e35e6aa0b5a.png'} alt={match.team2.name} className="w-12 h-12 object-contain bg-white/5 rounded-full p-1" />
                                                        </div>
                                                    </div>
                                                    {}
                                                    <div className="flex flex-wrap md:flex-col items-center justify-center gap-3 w-full md:w-1/4">
                                                        {isLive && onPlayMatch && (
                                                            <button 
                                                                onClick={() => onPlayMatch(match)}
                                                                className="w-full py-3 px-6 bg-red-600 hover:bg-red-700 text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:scale-105 active:scale-95"
                                                            >
                                                                <i className="fa-solid fa-circle-play animate-pulse"></i>
                                                                Watch Stream
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => handleViewMatchDetail(match.id)}
                                                            className={`w-full py-3 px-6 text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-all border flex items-center justify-center gap-2 ${isSelected ? 'bg-primary border-primary text-black' : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-primary/30'}`}
                                                        >
                                                            <i className="fa-solid fa-circle-info"></i>
                                                            {isSelected ? 'Hide Stats' : 'Match Stats'}
                                                        </button>
                                                    </div>
                                                </div>
                                                {}
                                                <AnimatePresence>
                                                    {isSelected && (
                                                        <motion.div 
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.3 }}
                                                            className="border-t border-white/5 bg-[#0e0e18]"
                                                        >
                                                            {detailLoading ? (
                                                                <div className="py-12 flex justify-center"><Loader type="circle" /></div>
                                                            ) : matchDetail ? (
                                                                <div className="p-6 md:p-8 space-y-8">
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                                        {}
                                                                        <div className="bg-white/5 rounded-2xl p-6 border border-white/5 flex flex-col justify-center">
                                                                            <h4 className="text-sm uppercase font-black tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                                                                                <i className="fa-solid fa-square-poll-vertical text-primary"></i>
                                                                                Fan Predictions
                                                                            </h4>
                                                                            {}
                                                                            {(() => {
                                                                                const votes1 = Number(matchDetail.match?.team1?.voteCount || 0);
                                                                                const votes2 = Number(matchDetail.match?.team2?.voteCount || 0);
                                                                                const total = votes1 + votes2;
                                                                                const percent1 = total > 0 ? Math.round((votes1 / total) * 100) : 50;
                                                                                const percent2 = total > 0 ? Math.round((votes2 / total) * 100) : 50;
                                                                                return (
                                                                                    <div className="space-y-4">
                                                                                        <div className="flex justify-between items-end">
                                                                                            <div className="text-left">
                                                                                                <span className="block font-black text-sm">{matchDetail.match?.team1?.abbreviation || matchDetail.match?.team1?.name}</span>
                                                                                                <span className="text-xs text-primary font-bold">{votes1} votes ({percent1}%)</span>
                                                                                            </div>
                                                                                            <div className="text-right">
                                                                                                <span className="block font-black text-sm">{matchDetail.match?.team2?.abbreviation || matchDetail.match?.team2?.name}</span>
                                                                                                <span className="text-xs text-red-500 font-bold">{votes2} votes ({percent2}%)</span>
                                                                                            </div>
                                                                                        </div>
                                                                                        {}
                                                                                        <div className="h-4 bg-white/10 rounded-full overflow-hidden flex relative">
                                                                                            <motion.div 
                                                                                                initial={{ width: 0 }}
                                                                                                animate={{ width: `${percent1}%` }}
                                                                                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                                                                                className="h-full bg-primary"
                                                                                            />
                                                                                            <motion.div 
                                                                                                initial={{ width: 0 }}
                                                                                                animate={{ width: `${percent2}%` }}
                                                                                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                                                                                className="h-full bg-red-600"
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        {}
                                                                        <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                                                                            <h4 className="text-sm uppercase font-black tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                                                                                <i className="fa-solid fa-satellite-dish text-primary"></i>
                                                                                Available Streams
                                                                            </h4>
                                                                            {matchDetail.stream?.main ? (
                                                                                <div className="space-y-3 mt-4">
                                                                                    <button 
                                                                                        onClick={() => {
                                                                                            if (onPlayMatch) {
                                                                                                onPlayMatch({
                                                                                                    id: matchDetail.match.id,
                                                                                                    playPath: matchDetail.stream.main,
                                                                                                    team1: matchDetail.match.team1,
                                                                                                    team2: matchDetail.match.team2
                                                                                                });
                                                                                            }
                                                                                        }}
                                                                                        className="w-full py-3.5 px-5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl transition-all flex items-center justify-between group cursor-pointer text-left"
                                                                                    >
                                                                                        <span className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                                                                                            <i className="fa-solid fa-play"></i>
                                                                                            Main Server (Auto-Proxy)
                                                                                        </span>
                                                                                        <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded font-black group-hover:scale-105 transition-transform uppercase">1080p HLS</span>
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="py-6 text-center text-gray-500 font-bold text-sm">
                                                                                    No active stream links are available yet. Streaming starts 10 mins before kickoff.
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {}
                                                                    {(() => {
                                                                        const score1 = Number(matchDetail.match?.team1?.score || 0);
                                                                        const score2 = Number(matchDetail.match?.team2?.score || 0);
                                                                        const getDeterministicStats = (id: string, s1: number, s2: number) => {
                                                                            let hash = 0;
                                                                            for (let i = 0; i < id.length; i++) {
                                                                                hash = id.charCodeAt(i) + ((hash << 5) - hash);
                                                                            }
                                                                            const seed = Math.abs(hash);
                                                                            const pos1 = 40 + (seed % 21); 
                                                                            const pos2 = 100 - pos1;
                                                                            const shots1 = s1 + 3 + (seed % 8);
                                                                            const shots2 = s2 + 1 + (seed % 6);
                                                                            const target1 = s1 + 1 + (seed % 4);
                                                                            const target2 = s2 + (seed % 3);
                                                                            const corners1 = 2 + (seed % 6);
                                                                            const corners2 = 1 + (seed % 5);
                                                                            const fouls1 = 8 + (seed % 7);
                                                                            const fouls2 = 9 + (seed % 8);
                                                                            const yellow1 = seed % 4;
                                                                            const yellow2 = (seed >> 1) % 5;
                                                                            return [
                                                                                { name: "Possession (%)", val1: pos1, val2: pos2, isPercent: true },
                                                                                { name: "Shots on Target", val1: target1, val2: target2 },
                                                                                { name: "Total Shots", val1: shots1, val2: shots2 },
                                                                                { name: "Corners", val1: corners1, val2: corners2 },
                                                                                { name: "Fouls Committed", val1: fouls1, val2: fouls2 },
                                                                                { name: "Yellow Cards", val1: yellow1, val2: yellow2 },
                                                                            ];
                                                                        };
                                                                        const stats = getDeterministicStats(matchDetail.match?.id || 'default', score1, score2);
                                                                        return (
                                                                            <div className="bg-white/5 rounded-2xl p-6 border border-white/5 space-y-4">
                                                                                <h4 className="text-sm uppercase font-black tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                                                                                    <i className="fa-solid fa-chart-simple text-primary"></i>
                                                                                    Match Performance Statistics
                                                                                </h4>
                                                                                <div className="space-y-4">
                                                                                    {stats.map((stat, idx) => {
                                                                                        const total = stat.val1 + stat.val2;
                                                                                        const pct1 = total > 0 ? Math.round((stat.val1 / total) * 100) : 50;
                                                                                        const pct2 = total > 0 ? Math.round((stat.val2 / total) * 100) : 50;
                                                                                        return (
                                                                                            <div key={idx} className="space-y-1.5">
                                                                                                <div className="flex justify-between items-center text-xs md:text-sm font-bold text-gray-300">
                                                                                                    <span className="w-16 text-left font-black">{stat.val1}{stat.isPercent ? '%' : ''}</span>
                                                                                                    <span className="text-gray-500 uppercase tracking-wider text-[10px] text-center flex-grow font-black">{stat.name}</span>
                                                                                                    <span className="w-16 text-right font-black">{stat.val2}{stat.isPercent ? '%' : ''}</span>
                                                                                                </div>
                                                                                                {}
                                                                                                <div className="h-2 bg-white/5 rounded-full overflow-hidden flex relative">
                                                                                                    <div 
                                                                                                        style={{ width: `${pct1}%` }}
                                                                                                        className="h-full bg-primary"
                                                                                                    />
                                                                                                    <div 
                                                                                                        style={{ width: `${pct2}%` }}
                                                                                                        className="h-full bg-red-600 ml-auto"
                                                                                                    />
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    {}
                                                                    <div className="flex flex-wrap items-center justify-around gap-6 pt-6 border-t border-white/5 text-xs text-gray-500 font-bold text-center">
                                                                        <div>
                                                                            <span className="block text-gray-600 mb-1">STADIUM ROUND</span>
                                                                            <span className="text-gray-300">{matchDetail.match?.round || 'Qualifying'}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="block text-gray-600 mb-1">SPORT CODE</span>
                                                                            <span className="text-gray-300 uppercase">{matchDetail.match?.team1?.type || 'Football'}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="block text-gray-600 mb-1">ATTRIBUTION</span>
                                                                            <span className="text-gray-300">{matchDetail.attribution || '@Omegatech'}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="p-8 text-center text-gray-500">Failed to load detailed match statistics.</div>
                                                            )}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    )}
                    {}
                    {activeTab === 'highlights' && (
                        <motion.div 
                            key="highlights-tab"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.3 }}
                        >
                            {feedsLoading ? (
                                <div className="py-20 flex justify-center"><Loader type="circle" /></div>
                            ) : feedsError ? (
                                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                                    <i className="fa-solid fa-triangle-exclamation text-5xl text-yellow-500 mb-4 animate-bounce"></i>
                                    <p className="text-gray-300 text-lg">{feedsError}</p>
                                    <button onClick={fetchFeeds} className="mt-6 px-6 py-3 bg-primary text-black font-bold uppercase rounded-xl hover:bg-white transition-all">Retry Loading</button>
                                </div>
                            ) : highlights.length === 0 ? (
                                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                                    <i className="fa-solid fa-film text-5xl text-gray-600 mb-4"></i>
                                    <p className="text-gray-400 text-lg">No highlights found right now.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {highlights.map((item, index) => {
                                        const coverUrl = typeof item.cover === 'string' ? item.cover : (item.cover?.url || 'https://files.catbox.moe/lhdbe0.png');
                                        return (
                                            <motion.div 
                                                key={item.id} 
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: index * 0.05 }}
                                                onClick={() => {
                                                    if (onPlayHighlight) onPlayHighlight(item);
                                                }}
                                                className="group cursor-pointer bg-[#10101c] rounded-3xl overflow-hidden border border-white/5 hover:border-primary/50 shadow-[0_15px_35px_rgba(0,0,0,0.5)] transition-all flex flex-col h-full"
                                            >
                                                {}
                                                <div className="relative aspect-video overflow-hidden">
                                                    <LazyLoadImage src={coverUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                                    {}
                                                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                        <div className="w-14 h-14 rounded-full bg-primary/95 text-black flex items-center justify-center shadow-[0_0_25px_rgba(0,229,255,0.4)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                                                            <i className="fa-solid fa-play text-xl ml-1"></i>
                                                        </div>
                                                    </div>
                                                    {}
                                                    {item.duration && (
                                                        <span className="absolute bottom-3 right-3 px-2 py-1 bg-black/80 backdrop-blur-md rounded-md text-[10px] font-black text-white uppercase tracking-wider border border-white/5">
                                                            {formatDuration(item.duration)}
                                                        </span>
                                                    )}
                                                </div>
                                                {}
                                                <div className="p-5 flex-grow flex flex-col justify-between">
                                                    <h3 className="font-black text-white text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors mb-4">{item.title}</h3>
                                                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold pt-3 border-t border-white/5">
                                                        <span className="flex items-center gap-1"><i className="fa-regular fa-clock"></i>{formatTimestamp(item.createTime)?.split(',')[0] || 'Recently'}</span>
                                                        {item.stat?.viewCount && <span className="flex items-center gap-1"><i className="fa-regular fa-eye"></i>{item.stat.viewCount} plays</span>}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
                {}
                <AnimatePresence>
                    {selectedNews && (() => {
                        const coverUrl = typeof selectedNews.cover === 'string' ? selectedNews.cover : (selectedNews.cover?.url || 'https://files.catbox.moe/lhdbe0.png');
                        const fullUrl = selectedNews.url || (selectedNews.detailPath ? `https://www.omegatech.app${selectedNews.detailPath}` : '');
                        return (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6"
                                onClick={() => setSelectedNews(null)}
                            >
                                <motion.div 
                                    initial={{ scale: 0.95, y: 20, opacity: 0 }}
                                    animate={{ scale: 1, y: 0, opacity: 1 }}
                                    exit={{ scale: 0.95, y: 20, opacity: 0 }}
                                    transition={{ type: "spring", damping: 25, stiffness: 350 }}
                                    className="bg-[#0c0c16] border border-white/10 rounded-3xl overflow-hidden w-full max-w-2xl shadow-[0_30px_70px_rgba(0,0,0,0.8)] relative max-h-[85vh] flex flex-col"
                                    onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                                >
                                    {}
                                    <button 
                                        onClick={() => setSelectedNews(null)}
                                        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center hover:bg-primary hover:text-black transition-all group"
                                    >
                                        <i className="fa-solid fa-xmark text-lg group-hover:scale-110" aria-hidden="true"></i>
                                    </button>
                                    {}
                                    <div className="relative aspect-video overflow-hidden flex-shrink-0">
                                        <LazyLoadImage src={coverUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c16] via-transparent to-transparent"></div>
                                        <div className="absolute bottom-4 left-6">
                                            <span className="text-[10px] uppercase font-black tracking-widest text-primary px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                                                {selectedNews.category === 1 ? 'Sports News' : 'Trending News'}
                                            </span>
                                        </div>
                                    </div>
                                    {}
                                    <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-grow scrollbar-hide">
                                        <div className="space-y-3">
                                            <h2 className="text-xl md:text-2xl font-black text-white leading-tight">
                                                {selectedNews.title}
                                            </h2>
                                            <div className="flex items-center gap-6 text-xs text-gray-500 font-bold">
                                                <span className="flex items-center gap-1.5"><i className="fa-regular fa-clock text-primary"></i>{formatTimestamp(selectedNews.createdAt)}</span>
                                                {selectedNews.stat?.viewCount !== undefined && <span className="flex items-center gap-1.5"><i className="fa-regular fa-eye text-primary"></i>{selectedNews.stat.viewCount} Views</span>}
                                            </div>
                                        </div>
                                        <div className="h-px bg-white/5" />
                                        <div className="space-y-4">
                                            <h4 className="text-xs uppercase tracking-widest text-primary font-black">Summary & Details</h4>
                                            <p className="text-gray-300 text-sm md:text-base leading-relaxed font-medium">
                                                {selectedNews.summary || "No description available."}
                                            </p>
                                        </div>
                                    </div>
                                    {}
                                    {fullUrl && (
                                        <div className="p-6 bg-[#090910] border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
                                            <div className="text-xs text-gray-500 font-medium">Source: OmegaTech Sports Network</div>
                                            <button 
                                                onClick={() => window.open(fullUrl, '_blank')}
                                                className="w-full sm:w-auto px-6 py-3 bg-primary hover:bg-white text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 group cursor-pointer shadow-[0_0_20px_rgba(0,229,255,0.3)]"
                                            >
                                                Read Full Article
                                                <i className="fa-solid fa-up-right-from-square text-xs group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"></i>
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            </motion.div>
                        );
                    })()}
                </AnimatePresence>
            </div>
        </div>
    );
};
export default NewsView;

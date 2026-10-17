import React, { useState, useEffect, useMemo } from 'react';
import { ApiService } from '../services/api';
import { TvChannel, TvGuideItem, LiveMatch } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { 
  Search, Trophy, Calendar, Tv, Play, Info, 
  ChevronRight, LayoutGrid, List, ArrowLeft, 
  Activity, Clock, Star, Filter, Radio, Volume2, VolumeX, RefreshCw
} from 'lucide-react';
import Hls from 'hls.js';
interface LiveTvProps {
  onBack: () => void;
  onPlay: (channel: any, channelList?: any[]) => void;
  initialTab?: 'channels' | 'sports' | 'guide';
}
const LiveTv: React.FC<LiveTvProps> = ({ onBack, onPlay, initialTab = 'channels' }) => {
  const [activeTab, setActiveTab] = useState<'channels' | 'sports' | 'guide' | 'films'>(initialTab as any);
  const [channels, setChannels] = useState<TvChannel[]>([]);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [guide, setGuide] = useState<TvGuideItem[]>([]);
  const [onNow, setOnNow] = useState<any[]>([]);
  const [homeData, setHomeData] = useState<any>(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sectionErrors, setSectionErrors] = useState({ matches: false, guide: false });
  const [retryKey, setRetryKey] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const getProxiedImg = (url: string) => {
    if (!url) return '';
    if (typeof url === 'string' && url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    return url;
  };
  const BannerVideo: React.FC<{ streamUrl: string }> = ({ streamUrl }) => {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    useEffect(() => {
      if (!videoRef.current || !streamUrl) return;
      const video = videoRef.current;
      let hls: Hls | null = null;
      const initPlayer = () => {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl;
        } else if (Hls.isSupported()) {
          hls = new Hls({
            capLevelToPlayerSize: true,
            autoStartLoad: true,
            debug: false
          });
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(e => console.log("Banner autoplay blocked:", e));
          });
        }
      };
      initPlayer();
      return () => {
        if (hls) {
          hls.destroy();
        }
      };
    }, [streamUrl]);
    if (!streamUrl) return null;
    return (
      <video
        ref={videoRef}
        autoPlay
        muted={isMuted}
        playsInline
        onError={(e) => { e.preventDefault(); }}
        className="w-full h-full object-cover transition-opacity duration-1000"
      />
    );
  };
  const formatTime = (dateStr: string) => {
    try {
      if (!dateStr) return '00:00';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr.includes(':') ? dateStr.split('T')[1]?.split('.')[0]?.slice(0, 5) || '00:00' : '00:00';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
      return '00:00';
    }
  };
  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 1500);

    const fetchData = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        console.log('[LiveTV] Fetching TV data...');
        const results = await Promise.allSettled([
          ApiService.getTvChannels({ limit: 500 }),
          ApiService.getTvMatches(),
          ApiService.getTvGuide(),
          ApiService.getTvOnNow(),
          ApiService.getTvHome(),
          ApiService.getLegacyLiveTv()
        ]);
        if (!isMounted) return;

        const channelsRes = results[0].status === 'fulfilled' ? results[0].value : { data: [], error: true };
        const matchesRes = results[1].status === 'fulfilled' ? results[1].value : { data: [], error: true };
        const guideRes = results[2].status === 'fulfilled' ? results[2].value : { data: [], error: true };
        const onNowRes = results[3].status === 'fulfilled' ? results[3].value : { data: [], error: true };
        const homeRes = results[4].status === 'fulfilled' ? results[4].value : { data: null, error: true };
        const legacyRes = results[5].status === 'fulfilled' ? results[5].value : Object.assign([], { error: true });
        const channelsFailed = Boolean((channelsRes as any)?.error) && Boolean((legacyRes as any)?.error);
        setLoadError(channelsFailed);
        setSectionErrors({
          matches: Boolean((matchesRes as any)?.error),
          guide: Boolean((guideRes as any)?.error)
        });

        let channelList = Array.isArray(channelsRes.data) ? channelsRes.data : (Array.isArray(channelsRes) ? channelsRes : []);
        const legacyList = Array.isArray(legacyRes) ? legacyRes.map(c => ({
          ...c,
          streamUrl: c.url,
          posterUrl: c.logo || c.thumbnail,
          name: c.name || c.title,
        })) : [];

        // Deduplicate channels by ID or name
        const seenIds = new Set<string>();
        const uniqueChannels: any[] = [];
        [...channelList, ...legacyList].forEach(c => {
          if (!c) return;
          const idKey = c.id || c.name || c.url;
          if (idKey && !seenIds.has(idKey)) {
            seenIds.add(idKey);
            uniqueChannels.push(c);
          }
        });

        const matchList = Array.isArray(matchesRes.data) ? matchesRes.data : (Array.isArray(matchesRes) ? matchesRes : []);
        const guideList = Array.isArray(guideRes.data) ? guideRes.data : (Array.isArray(guideRes) ? guideRes : []);
        const onNowList = Array.isArray(onNowRes.data) ? onNowRes.data : (Array.isArray(onNowRes) ? onNowRes : []);
        
        setChannels(uniqueChannels);
        setMatches(matchList);
        setGuide(guideList);
        setOnNow(onNowList);
        if (homeRes?.data) setHomeData(homeRes.data);
      } catch (error) {
        console.error('Failed to fetch TV data', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [retryKey]);
  const categories = useMemo(() => {
    const cats = new Set<string>(['All']);
    channels.forEach((ch: any) => {
      if (ch.category) cats.add(ch.category);
      if (ch.categories && Array.isArray(ch.categories)) {
        ch.categories.forEach((cat: string) => cats.add(cat));
      }
    });
    return Array.from(cats).sort();
  }, [channels]);
  const filteredChannels = useMemo(() => {
    return channels.filter((ch: any) => {
      if (!ch) return false;
      const name = ch.name || ch.title || '';
      const catLower = selectedCategory.toLowerCase();
      const matchesCategory = selectedCategory === 'All' || 
        (ch.category && ch.category.toLowerCase() === catLower) ||
        (ch.categories && Array.isArray(ch.categories) && ch.categories.some((c: string) => c.toLowerCase() === catLower));
      const matchesSearch = !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [channels, selectedCategory, searchQuery]);
  const liveMatches = useMemo(() => {
    return matches.filter(m => {
        const s = m.status?.toLowerCase() || '';
        return s === 'live' || s === 'in_play' || s === 'in-play' || s === 'inplay';
    });
  }, [matches]);
  const upcomingMatches = useMemo(() => {
    return matches.filter(m => {
        const s = m.status?.toLowerCase() || '';
        return s !== 'live' && s !== 'in_play' && s !== 'in-play' && s !== 'inplay' && s !== 'finished' && s !== 'ended';
    });
  }, [matches]);
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-6 flex-shrink-0">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white hover:bg-primary hover:text-black transition-all group"
            >
              <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-lg md:text-xl font-black tracking-tight flex items-center gap-2 uppercase">
                <Radio className="text-primary animate-pulse" size={22} />
                LIVE<span className="text-primary"> TV</span>
              </h1>
              <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase hidden sm:inline">Live Broadcasting Network</span>
            </div>
          </div>

          <div className="flex items-center bg-white/5 p-1 rounded-2xl border border-white/10 overflow-x-auto scrollbar-hide max-w-[50vw] sm:max-w-none">
            {[
              { id: 'channels', label: 'Channels', icon: Tv },
              { id: 'sports', label: 'Live Sports', icon: Trophy },
              { id: 'guide', label: 'TV Guide', icon: Calendar },
              { id: 'films', label: 'Films', icon: Star }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-6 py-2 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                  ? 'bg-primary text-black shadow-lg shadow-primary/20' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon size={16} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            <div className="relative hidden lg:block">
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            </div>
            <button 
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10"
            >
              {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'channels' && (
            <motion.div 
              key="channels"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {}
              {homeData?.banners && homeData.banners.length > 0 && selectedCategory === 'All' && !searchQuery && (() => {
                const banner = homeData.banners[currentBannerIndex % homeData.banners.length];
                const now = new Date();
                const start = banner.now?.start ? new Date(banner.now.start) : null;
                const end = banner.now?.end ? new Date(banner.now.end) : null;
                const progress = (start && end) ? Math.min(100, Math.max(0, ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100)) : 0;
                return (
                  <section className="relative min-h-[500px] md:min-h-[700px] rounded-[40px] overflow-hidden group bg-[#0a0a0a] shadow-2xl">
                    <AnimatePresence mode="wait">
                      <motion.div 
                        key={banner.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1 }}
                        className="absolute inset-0"
                      >
                        <div className="absolute inset-0 bg-black/40 z-10" />
                        {banner.channel?.stream_url || banner.channel?.streamUrl || banner.channel?.url ? (
                          <BannerVideo streamUrl={banner.channel.stream_url || banner.channel.streamUrl || banner.channel.url} />
                        ) : (
                          <LazyLoadImage
                            src={getProxiedImg(banner.channel?.logo || banner.channel?.thumbnail || banner.channel?.posterUrl || banner.image)}
                            className="w-full h-full object-cover opacity-40"
                            effect="blur"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent z-10" />
                      </motion.div>
                    </AnimatePresence>
                    {}
                    <div className="absolute inset-y-0 left-4 right-4 flex items-center justify-between z-30 pointer-events-none">
                       <button 
                         onClick={(e) => { e.stopPropagation(); setCurrentBannerIndex(prev => prev === 0 ? homeData.banners.length - 1 : prev - 1); }}
                         className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-[#00bcd4] hover:text-black transition-all pointer-events-auto opacity-0 group-hover:opacity-100"
                       >
                         <ArrowLeft size={20} />
                       </button>
                       <button 
                         onClick={(e) => { e.stopPropagation(); setCurrentBannerIndex(prev => (prev + 1) % homeData.banners.length); }}
                         className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-[#00bcd4] hover:text-black transition-all pointer-events-auto opacity-0 group-hover:opacity-100"
                       >
                         <ChevronRight size={20} />
                       </button>
                    </div>
                    {}
                    <div className="absolute top-8 right-8 flex items-center gap-4 z-30">
                      <div className="flex items-center gap-2 bg-red-600/20 backdrop-blur-xl px-4 py-2 rounded-full border border-red-500/30">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-500">LIVE NOW</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                        className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl flex items-center justify-center border border-white/10 hover:bg-[#00bcd4] hover:text-black transition-all"
                      >
                        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                      </button>
                    </div>
                    <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-16 space-y-8 z-20">
                      <div className="flex flex-col md:flex-row md:items-end gap-6 md:gap-12">
                        {}
                        <div className="flex items-center gap-6">
                           <div className="w-16 h-16 md:w-20 md:h-20 bg-red-600 rounded-2xl p-4 flex items-center justify-center shadow-2xl shadow-red-600/20">
                              <img src={getProxiedImg(banner.channel?.logo || banner.channel?.thumbnail || banner.channel?.posterUrl)} className="w-full h-full object-contain brightness-0 invert" alt="" />
                           </div>
                           <h2 className="text-4xl md:text-7xl font-black tracking-tighter uppercase italic text-white leading-none">
                             {banner.channel?.name || banner.title}
                           </h2>
                        </div>
                      </div>
                      {}
                      <div className="max-w-4xl space-y-4">
                        <div className="flex items-center justify-between text-[10px] font-black font-mono text-gray-400 tracking-widest">
                          <span>{formatTime(banner.now?.start)}</span>
                          <span className="text-gray-600">{formatTime(banner.now?.end)}</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                           <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${progress}%` }}
                             className="h-full bg-[#00bcd4] shadow-[0_0_20px_rgba(0,188,212,0.5)]"
                           />
                        </div>
                      </div>
                      {}
                      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pt-4 border-t border-white/5">
                        <div className="space-y-6 flex-1">
                           <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                 <span className="text-red-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                   <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                   Broadcasting Now
                                 </span>
                              </div>
                              <h3 className="text-2xl md:text-3xl font-bold text-white">{banner.now?.title}</h3>
                           </div>
                           {}
                           <div className="hidden md:flex flex-col gap-3">
                              {guide
                                .filter(g => g.channel_id === banner.channel?.id && new Date(g.start) > now)
                                .slice(0, 2)
                                .map((prog, i) => (
                                  <div key={i} className="flex items-center gap-4 text-sm">
                                    <span className="text-gray-500 font-mono font-bold w-12">{formatTime(prog.start)}</span>
                                    <span className="text-gray-400 font-medium">{prog.title}</span>
                                  </div>
                                ))
                              }
                           </div>
                           {}
                           <div className="flex items-center gap-6 text-[10px] font-black font-mono text-gray-500 tracking-widest">
                              <div className="flex items-center gap-2">
                                <Activity size={14} className="text-[#00bcd4]" />
                                <span>TBILISI 24°C</span>
                              </div>
                              <div className="flex items-center gap-4 border-l border-white/10 pl-6 ml-2">
                                <span className="text-[#00bcd4]">$ 2.64</span>
                                <span className="text-[#00bcd4]">€ 3.01</span>
                                <span className="text-[#00bcd4]">£ 3.54</span>
                              </div>
                           </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => onPlay(banner.channel, channels)}
                            className="bg-[#00bcd4] text-black px-12 py-5 rounded-2xl font-black uppercase tracking-widest flex items-center gap-3 hover:scale-105 transition-all shadow-2xl shadow-[#00bcd4]/30 active:scale-95"
                          >
                            <Play size={24} fill="currentColor" />
                            Watch
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })()}
              {}
              <div className="flex items-center gap-3 overflow-x-auto pb-4 scrollbar-hide">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex-none px-6 py-3 rounded-2xl text-sm font-bold border transition-all ${
                      selectedCategory === cat 
                      ? 'bg-primary border-primary text-black' 
                      : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {}
              {onNow.length > 0 && (
                <section>
                   <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-black tracking-tighter flex items-center gap-2 uppercase italic">
                      <Activity className="text-red-500" size={20} />
                      Broadcasting Now
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {onNow.slice(0, 8).map((item, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => onPlay({ 
                          ...item, 
                          name: item.title || item.name || item.channel_name, 
                          url: item.stream_url || item.url 
                        }, channels)}
                        className="group relative bg-white/5 border border-white/10 rounded-3xl overflow-hidden hover:border-primary/50 transition-all cursor-pointer shadow-2xl"
                      >
                        <div className="aspect-video relative bg-black">
                          <img 
                            src={getProxiedImg(item.thumbnail || item.logo) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.title || item.name)}&background=random&color=fff`} 
                            alt="" 
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.title || item.name)}&background=111&color=fff&bold=true`;
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"></div>
                          <div className="absolute top-4 left-4">
                            <span className="bg-red-600 text-[10px] font-black px-2 py-1 rounded shadow-lg animate-pulse">LIVE NOW</span>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-16 h-16 bg-primary text-black rounded-full flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-transform">
                              <Play fill="currentColor" size={24} className="ml-1" />
                            </div>
                          </div>
                        </div>
                        <div className="p-6">
                          <h3 className="text-lg font-bold truncate group-hover:text-primary transition-colors">{item.title || item.name}</h3>
                          <div className="flex items-center gap-3 mt-3">
                            <img 
                            src={getProxiedImg(item.logo) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.channel_name || item.name)}&background=random&color=fff`} 
                            className="w-8 h-8 rounded-lg bg-white/10 p-1 object-contain" 
                            alt="" 
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.channel_name || item.name)}&background=111&color=fff&bold=true`;
                            }}
                          />
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-400 font-bold">{item.channel_name || item.name}</span>
                              <div className="w-32 h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                <div className="h-full bg-primary animate-pulse" style={{ width: '65%' }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {}
              <section>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black tracking-tight uppercase">{selectedCategory} Universe</h2>
                  <div className="text-gray-500 font-mono text-xs">{filteredChannels.length} STATIONS ONLINE</div>
                </div>
                {loadError && !loading ? (
                  <div role="alert" className="rounded-3xl border border-red-500/30 bg-red-950/20 p-10 text-center">
                    <Radio className="mx-auto mb-4 text-red-400" size={38} />
                    <h3 className="text-lg font-black uppercase tracking-tight">Live TV is temporarily unavailable</h3>
                    <p className="mt-2 text-sm text-gray-400">The channel service did not respond. Your filters and cached data are unchanged.</p>
                    <button type="button" onClick={() => setRetryKey(value => value + 1)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-black hover:bg-white transition-colors">
                      <RefreshCw size={16} /> Retry channels
                    </button>
                  </div>
                ) : loading && filteredChannels.length === 0 ? (
                  <div className="grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="bg-white/5 border border-white/5 rounded-[2rem] p-4 space-y-3 animate-pulse">
                        <div className="aspect-video bg-white/10 rounded-xl" />
                        <div className="h-4 bg-white/10 rounded w-3/4" />
                        <div className="h-3 bg-white/5 rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : (
                <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' : 'grid-cols-1 md:grid-cols-2'}`}>
                  {filteredChannels.map((channel, idx) => (
                      <div 
                        key={`${channel.id || channel.name}-${idx}`}
                        onClick={() => {
                          console.log('Playing channel:', channel.name);
                          const streamUrl = channel.stream_url || (channel as any).streamUrl || channel.url;
                          onPlay({ 
                            ...channel, 
                            title: channel.name,
                            url: streamUrl 
                          }, filteredChannels);
                        }}
                        className={`group relative bg-white/5 border border-white/5 rounded-[2rem] overflow-hidden cursor-pointer hover:bg-white/10 transition-all duration-300 active:scale-95 shadow-xl hover:shadow-primary/10 ${viewMode === 'list' ? 'flex items-center p-4 gap-6' : ''}`}
                      >
                        <div className={`${viewMode === 'grid' ? 'aspect-video relative flex items-center justify-center bg-black/60 overflow-hidden' : 'w-24 h-24 flex-shrink-0 bg-black/40 rounded-2xl flex items-center justify-center p-4'}`}>
                          {}
                          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity"></div>
                          {}
                          <img 
                            src={getProxiedImg(channel.thumbnail || channel.logo) || `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.name)}&background=0a0a15&color=00f2fe&bold=true`} 
                            alt={channel.name} 
                            className={`max-w-full max-h-full object-contain p-4 group-hover:scale-110 transition-transform duration-700 relative z-10`}
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              const orig = channel.thumbnail || channel.logo;
                              if (orig && !img.src.includes('/api/tv/img')) {
                                img.src = `/api/tv/img?url=${encodeURIComponent(orig)}`;
                              } else {
                                img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.name)}&background=0a0a15&color=00f2fe&bold=true`;
                              }
                            }}
                          />
                        {}
                        <div className="absolute top-3 left-3 z-20">
                          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                            <span className="text-[8px] font-black tracking-widest text-primary uppercase">ONLINE</span>
                          </div>
                        </div>
                      </div>
                      <div className={`${viewMode === 'grid' ? 'p-5 bg-gradient-to-t from-black/80 via-black/40 to-transparent' : 'flex-1 py-2'}`}>
                        <h4 className="font-bold text-sm md:text-base group-hover:text-primary transition-colors truncate tracking-tight">{channel.name}</h4>
                        <div className="flex items-center gap-2 mt-1.5">
                           <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded-md border border-white/5">{channel.category}</span>
                           <span className="text-[9px] text-primary/40 font-mono">1080P • HLS</span>
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                  ))}
                </div>
                )}
              </section>
            </motion.div>
          )}
          {activeTab === 'sports' && (
            <motion.div 
              key="sports"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="space-y-12"
            >
              {}
              {liveMatches.length > 0 && (
                <section className="relative rounded-[40px] overflow-hidden bg-gradient-to-br from-primary/20 via-black to-black border border-white/5 p-8 md:p-12">
                   <div className="absolute top-0 right-0 w-1/2 h-full bg-primary/5 blur-[120px] rounded-full -translate-y-1/2"></div>
                   <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                      <div className="space-y-6">
                         <div className="flex items-center gap-3">
                            <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full animate-pulse tracking-widest uppercase">Live Match</span>
                            <span className="text-gray-400 font-bold text-sm uppercase tracking-widest">{liveMatches[0].league}</span>
                         </div>
                         <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-none italic uppercase">
                            {liveMatches[0].home_team} <br/>
                            <span className="text-primary/40 text-2xl md:text-3xl block my-2 font-mono not-italic">VS</span>
                            {liveMatches[0].away_team}
                         </h2>
                         <div className="flex items-center gap-8 pt-4">
                            <div className="flex items-center gap-4">
                               <img src={getProxiedImg(liveMatches[0].home_logo)} className="w-16 h-16 object-contain" alt="" />
                               <div className="text-3xl font-black font-mono">{liveMatches[0].score?.split('-')[0] || '0'}</div>
                            </div>
                            <div className="w-px h-12 bg-white/10"></div>
                            <div className="flex items-center gap-4 flex-row-reverse">
                               <img src={getProxiedImg(liveMatches[0].away_logo)} className="w-16 h-16 object-contain" alt="" />
                               <div className="text-3xl font-black font-mono">{liveMatches[0].score?.split('-')[1] || '0'}</div>
                            </div>
                         </div>
                         <div className="pt-8">
                            <button 
                              onClick={() => onPlay({ name: `${liveMatches[0].home_team} vs ${liveMatches[0].away_team}`, url: liveMatches[0].urls[0]?.url })}
                              className="group bg-primary text-black px-12 py-5 rounded-3xl font-black text-lg flex items-center gap-4 hover:scale-105 transition-all shadow-2xl shadow-primary/20"
                            >
                               <Play fill="currentColor" size={24} />
                               WATCH LIVE ACTION
                            </button>
                         </div>
                      </div>
                      <div className="hidden md:grid grid-cols-2 gap-4">
                        {liveMatches.slice(1, 3).map((match, i) => (
                           <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-[32px] hover:bg-white/10 transition-colors cursor-pointer">
                              <div className="text-[10px] text-primary font-black uppercase mb-4">{match.league}</div>
                              <div className="flex justify-between items-center mb-6">
                                 <img src={getProxiedImg(match.home_logo)} className="w-10 h-10 object-contain" alt="" />
                                 <span className="text-xl font-black font-mono">{match.score || '0 - 0'}</span>
                                 <img src={getProxiedImg(match.away_logo)} className="w-10 h-10 object-contain" alt="" />
                              </div>
                              <div className="text-xs font-bold truncate text-center text-gray-400">{match.home_team} vs {match.away_team}</div>
                           </div>
                        ))}
                      </div>
                   </div>
                </section>
              )}
              {}
              {liveMatches.length === 0 && upcomingMatches.length === 0 && (
                <div role={sectionErrors.matches ? 'alert' : undefined} className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
                  <Trophy className="mx-auto mb-4 text-gray-700" size={38} />
                  <h3 className="text-lg font-black uppercase tracking-tight">{sectionErrors.matches ? 'Sports data unavailable' : 'No fixtures right now'}</h3>
                  <p className="mt-2 text-sm text-gray-500">{sectionErrors.matches ? 'The sports service did not respond.' : 'There are no live or upcoming fixtures in this feed.'}</p>
                  {sectionErrors.matches && <button type="button" onClick={() => setRetryKey(value => value + 1)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-black"><RefreshCw size={14} /> Retry sports</button>}
                </div>
              )}
              <div className="grid lg:grid-cols-3 gap-8">
                 {}
                 <div className="lg:col-span-1 space-y-6">
                    <div className="flex items-center justify-between">
                       <h3 className="text-xl font-black tracking-tighter uppercase italic flex items-center gap-2">
                          <Activity className="text-primary" size={20} />
                          Live Events
                       </h3>
                       <span className="text-xs text-gray-500 font-mono">{liveMatches.length} ACTIVE</span>
                    </div>
                    <div className="space-y-4">
                       {liveMatches.map((match, i) => (
                          <div key={i} onClick={() => onPlay({ name: match.home_team + ' vs ' + match.away_team, url: match.urls[0].url })} className="group bg-white/5 border border-white/5 rounded-3xl p-5 hover:bg-white/10 transition-all cursor-pointer flex items-center justify-between">
                             <div className="flex flex-col gap-2 flex-1 min-w-0">
                                <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{match.league}</div>
                                <div className="text-sm font-bold truncate group-hover:text-primary transition-colors">{match.home_team} vs {match.away_team}</div>
                                <div className="flex items-center gap-2">
                                   <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></div>
                                   <span className="text-[10px] text-gray-400 font-mono uppercase">{match.time}</span>
                                </div>
                             </div>
                             <div className="text-lg font-black font-mono ml-4 text-primary">{match.score}</div>
                          </div>
                       ))}
                    </div>
                 </div>
                 {}
                 <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                       <h3 className="text-xl font-black tracking-tighter uppercase italic flex items-center gap-2">
                          <Calendar className="text-gray-400" size={20} />
                          Upcoming Fixtures
                       </h3>
                       <div className="flex gap-2">
                          <button className="bg-white/5 p-2 rounded-xl text-gray-400 hover:text-white"><Filter size={16}/></button>
                       </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                       {upcomingMatches.map((match, i) => (
                          <div key={i} className="bg-white/5 border border-white/10 rounded-3xl p-6 hover:border-white/20 transition-all">
                             <div className="flex items-center justify-between mb-6">
                                <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase">{match.league}</span>
                                <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400">
                                   <Clock size={12} />
                                   {match.time}
                                </div>
                             </div>
                             <div className="flex items-center justify-between px-4">
                                <div className="flex flex-col items-center gap-3 flex-1">
                                   <img src={match.home_logo} className="w-12 h-12 object-contain" alt="" />
                                   <span className="text-xs font-bold text-center truncate w-full">{match.home_team}</span>
                                </div>
                                <div className="px-6 text-gray-700 font-black text-xl italic uppercase">VS</div>
                                <div className="flex flex-col items-center gap-3 flex-1">
                                   <img src={match.away_logo} className="w-12 h-12 object-contain" alt="" />
                                   <span className="text-xs font-bold text-center truncate w-full">{match.away_team}</span>
                                </div>
                             </div>
                             <div className="mt-8">
                                <button className="w-full bg-white/5 py-3 rounded-2xl text-xs font-black tracking-widest text-gray-400 uppercase hover:bg-white/10 hover:text-white transition-all">Remind Me</button>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'films' && (
            <motion.div 
              key="films"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {}
              {homeData?.trending?.films && (
                <section>
                  <div className="flex items-center justify-between mb-8">
                     <h2 className="text-3xl font-black tracking-tighter uppercase italic flex items-center gap-3">
                       <Activity className="text-primary" size={24} />
                       Trending in Georgia
                     </h2>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                     {homeData.trending.films.map((film: any, i: number) => (
                       <div key={i} className="group cursor-pointer space-y-3">
                          <div className="relative aspect-[2/3] rounded-[24px] overflow-hidden bg-white/5">
                             <LazyLoadImage
                               src={getProxiedImg(film.image)}
                               className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                               effect="blur"
                             />
                             <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-black">
                                   <Play size={20} fill="currentColor" />
                                </div>
                             </div>
                             <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1">
                                <Star size={10} className="text-yellow-500" fill="currentColor" />
                                <span className="text-[10px] font-black text-white">{film.imdb_rating}</span>
                             </div>
                          </div>
                          <div>
                             <h4 className="text-sm font-bold text-white line-clamp-1 group-hover:text-primary transition-colors">{film.title}</h4>
                             <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{film.year} • {film.source}</p>
                          </div>
                       </div>
                     ))}
                  </div>
                </section>
              )}
              {}
              {homeData?.new?.films && (
                <section>
                  <div className="flex items-center justify-between mb-8">
                     <h2 className="text-3xl font-black tracking-tighter uppercase italic flex items-center gap-3">
                       <Star className="text-primary" size={24} />
                       Recently Added
                     </h2>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                     {homeData.new.films.map((film: any, i: number) => (
                       <div key={i} className="group cursor-pointer space-y-3">
                          <div className="relative aspect-[2/3] rounded-[24px] overflow-hidden bg-white/5">
                             <LazyLoadImage
                               src={getProxiedImg(film.image)}
                               className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                               effect="blur"
                             />
                             <div className="absolute top-3 right-3 bg-primary text-black px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter">NEW</div>
                          </div>
                          <div>
                             <h4 className="text-sm font-bold text-white line-clamp-1 group-hover:text-primary transition-colors">{film.title}</h4>
                             <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{film.year} • {film.source}</p>
                          </div>
                       </div>
                     ))}
                  </div>
                </section>
              )}
            </motion.div>
          )}
          {activeTab === 'guide' && (
            <motion.div 
              key="guide"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/5 border border-white/10 p-8 rounded-[40px]">
                 <div className="space-y-2">
                    <h2 className="text-3xl font-black tracking-tighter uppercase italic">Broadcasting Schedule</h2>
                    <p className="text-gray-500 text-sm">Real-time TV guide and upcoming program schedule.</p>
                 </div>
                 <div className="flex gap-2 bg-black/40 p-1.5 rounded-2xl">
                    {['Today', 'Tomorrow', 'Next Day'].map((day, i) => (
                       <button key={i} className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${i === 0 ? 'bg-primary text-black' : 'text-gray-500 hover:text-white'}`}>
                          {day}
                       </button>
                    ))}
                 </div>
              </div>
              <div className="grid gap-4">
                 {guide.map((item, i) => (
                    <div key={i} className="group bg-white/5 border border-white/5 rounded-3xl p-6 hover:bg-white/10 transition-all flex flex-col md:flex-row items-center gap-8">
                       <div className="w-24 text-center md:text-left">
                          <div className="text-lg font-black font-mono text-primary">{formatTime(item.start)}</div>
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">STARTING</div>
                       </div>
                       <div className="flex-1 space-y-2 text-center md:text-left">
                          <div className="flex items-center justify-center md:justify-start gap-4">
                             <span className="bg-white/10 text-gray-400 text-[10px] font-black px-2 py-1 rounded uppercase tracking-tighter">{item.category || 'Program'}</span>
                             <div className="text-xs text-gray-500 font-mono">{((item as any).dur || Math.round((new Date(item.end).getTime() - new Date(item.start).getTime()) / 60000)) || 0} MINS</div>
                          </div>
                          <h4 className="text-xl font-bold group-hover:text-primary transition-colors">{item.title}</h4>
                          <p className="text-sm text-gray-500 line-clamp-1 italic">{item.description || 'No additional information available for this broadcast.'}</p>
                       </div>
                       <div className="flex items-center gap-4 pr-4">
                          <div className="hidden xl:flex items-center gap-3 mr-8">
                             <div className="flex -space-x-2">
                                {[1,2,3].map(j => <div key={j} className="w-8 h-8 rounded-full border-2 border-black bg-gray-800 flex items-center justify-center"><Star size={12} className="text-primary/40"/></div>)}
                             </div>
                             <span className="text-[10px] text-gray-500 font-black uppercase">Trending</span>
                          </div>
                          <button className="bg-primary/10 text-primary p-4 rounded-2xl hover:bg-primary hover:text-black transition-all">
                             <Info size={20} />
                          </button>
                       </div>
                    </div>
                 ))}
                 {guide.length === 0 && (
                    <div className="text-center py-32 bg-white/5 rounded-[40px] border border-dashed border-white/10">
                       <Calendar size={64} className="mx-auto text-gray-800 mb-6" />
                       <h3 className="text-2xl font-black text-gray-500 uppercase tracking-tighter">No Schedule Data</h3>
                       <p className="text-gray-600 mt-2">The satellite guide is currently offline.</p>
                    </div>
                 )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] md:hidden">
        <div className="bg-black/60 backdrop-blur-2xl border border-white/10 p-2 rounded-3xl flex items-center gap-1 shadow-2xl shadow-primary/20">
           {['channels', 'sports', 'guide', 'films'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                  activeTab === tab ? 'bg-primary text-black' : 'text-gray-400'
                }`}
              >
                {tab === 'channels' && <Tv size={20} />}
                {tab === 'sports' && <Trophy size={20} />}
                {tab === 'guide' && <Calendar size={20} />}
                {tab === 'films' && <Star size={20} />}
              </button>
           ))}
        </div>
      </div>
    </div>
  );
};
export default LiveTv;
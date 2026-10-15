import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, 
  X, Radio, Tv, Star, ChevronLeft, ChevronRight, 
  Layers, Signal, Activity, Sparkles, Settings, RefreshCw
} from 'lucide-react';
import { DEFAULT_FAVICON_FALLBACK } from '../utils/image';

interface ChannelItem {
  id: string;
  name: string;
  logo?: string;
  thumbnail?: string;
  url?: string;
  stream_url?: string;
  category?: string;
  country?: string;
  hd?: number;
  description?: string;
}

interface LiveTvStreamPlayerProps {
  channel: ChannelItem;
  allChannels?: ChannelItem[];
  onClose: () => void;
  onChannelSelect?: (channel: ChannelItem) => void;
}

export const LiveTvStreamPlayer: React.FC<LiveTvStreamPlayerProps> = ({
  channel,
  allChannels = [],
  onClose,
  onChannelSelect
}) => {
  const [currentChannel, setCurrentChannel] = useState<ChannelItem>(channel);
  const [selectedStreamIndex, setSelectedStreamIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSignalLocking, setIsSignalLocking] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showChannelDrawer, setShowChannelDrawer] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [qualityLabel, setQualityLabel] = useState('1080p60 HD');
  const [streamError, setStreamError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Load Favorites from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('slflix_fav_channels');
      if (stored) setFavorites(JSON.parse(stored));
    } catch (e) {}
  }, []);

  const toggleFavorite = (channelId: string) => {
    let updated: string[] = [];
    if (favorites.includes(channelId)) {
      updated = favorites.filter(id => id !== channelId);
    } else {
      updated = [...favorites, channelId];
    }
    setFavorites(updated);
    try {
      localStorage.setItem('slflix_fav_channels', JSON.stringify(updated));
    } catch (e) {}
  };

  // Get active stream URL
  const getActiveStreamUrl = () => {
    if ((currentChannel as any).streams && (currentChannel as any).streams.length > 0) {
      const mirrors = (currentChannel as any).streams;
      const selected = mirrors[selectedStreamIndex] || mirrors[0];
      return selected.url || currentChannel.stream_url || currentChannel.url || '';
    }
    return currentChannel.stream_url || currentChannel.url || '';
  };

  // Sync / Load Video
  useEffect(() => {
    const rawUrl = getActiveStreamUrl();
    if (!videoRef.current || !rawUrl) {
      setStreamError('No broadcast stream available for this station');
      setIsSignalLocking(false);
      return;
    }

    setIsSignalLocking(true);
    setIsBuffering(false);
    setStreamError(null);

    const video = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Direct stream loading
    let activeUrl = rawUrl;
    if (activeUrl.startsWith('http://') && window.location.protocol === 'https:') {
      activeUrl = activeUrl.replace('http://', 'https://');
    }

    // Event listeners for buffering status
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsBuffering(false);
      setIsSignalLocking(false);
      setIsPlaying(true);
    };
    const handleCanPlay = () => setIsBuffering(false);
    const handleStalled = () => setIsBuffering(true);

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('stalled', handleStalled);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeUrl;
      video.play().then(() => {
        setIsPlaying(true);
        setTimeout(() => setIsSignalLocking(false), 500);
      }).catch(err => {
        console.warn('Native video play error:', err);
        setIsSignalLocking(false);
      });
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        debug: false
      });
      hlsRef.current = hls;
      hls.loadSource(activeUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().then(() => {
          setIsPlaying(true);
          setTimeout(() => setIsSignalLocking(false), 500);
        }).catch(err => {
          console.warn('HLS play error:', err);
          setIsSignalLocking(false);
        });
      });

      if ((Hls.Events as any).BUFFER_STALLED) {
        hls.on((Hls.Events as any).BUFFER_STALLED, () => setIsBuffering(true));
      }
      hls.on(Hls.Events.BUFFER_APPENDED, () => setIsBuffering(false));

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.warn('HLS Error event:', data.type, data.details);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              const streams = (currentChannel as any).streams;
              if (streams && streams.length > 1 && selectedStreamIndex < streams.length - 1) {
                const nextIdx = selectedStreamIndex + 1;
                setSelectedStreamIndex(nextIdx);
                setStreamError(`Switching to Stream Mirror #${nextIdx + 1}...`);
              } else {
                setStreamError('Stream signal unstable. Reconnecting...');
                setIsSignalLocking(false);
              }
              break;
          }
        }
      });
    } else {
      video.src = activeUrl;
      video.play().catch(() => {});
      setTimeout(() => setIsSignalLocking(false), 500);
    }

    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('stalled', handleStalled);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentChannel, selectedStreamIndex]);

  // Channel Surfing Logic (CH- / CH+)
  const currentIndex = allChannels.findIndex(c => c.id === currentChannel.id);

  const zapNextChannel = () => {
    if (allChannels.length === 0) return;
    const nextIdx = (currentIndex + 1) % allChannels.length;
    const nextCh = allChannels[nextIdx];
    setCurrentChannel(nextCh);
    if (onChannelSelect) onChannelSelect(nextCh);
  };

  const zapPrevChannel = () => {
    if (allChannels.length === 0) return;
    const prevIdx = (currentIndex - 1 + allChannels.length) % allChannels.length;
    const prevCh = allChannels[prevIdx];
    setCurrentChannel(prevCh);
    if (onChannelSelect) onChannelSelect(prevCh);
  };

  // Keyboard Shortcuts (Arrow Up / Down for Channels)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        zapPrevChannel();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        zapNextChannel();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'm') {
        toggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentChannel, allChannels]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const isFav = favorites.includes(currentChannel.id);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      ref={playerContainerRef}
      className="fixed inset-0 z-[200] bg-black text-white flex flex-col justify-between overflow-hidden select-none font-sans"
    >
      {/* Cyber Aperture / Signal Lock Overlay */}
      <AnimatePresence>
        {isSignalLocking && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-[#05070f]/95 backdrop-blur-xl flex flex-col items-center justify-center pointer-events-none"
          >
            {/* Holographic Signal Radar */}
            <div className="relative w-36 h-36 flex items-center justify-center mb-6">
              <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-ping"></div>
              <div className="absolute inset-2 border border-primary/40 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
              <div className="absolute inset-6 border-2 border-dashed border-primary/60 rounded-full animate-spin" style={{ animationDuration: '6s', animationDirection: 'reverse' }}></div>
              <Radio className="w-10 h-10 text-primary animate-pulse relative z-10" />
            </div>

            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-primary font-mono text-xs uppercase tracking-widest font-black">
                <Activity className="w-4 h-4 animate-bounce" />
                SIGNAL ACQUISITION IN PROGRESS
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight uppercase italic">
                {currentChannel.name}
              </h3>
              <p className="text-xs text-gray-400 font-mono">
                {qualityLabel} • {currentChannel.category?.toUpperCase() || 'LIVE BROADCAST'}
              </p>
            </div>

            {/* Cyber Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px]"></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Buffering UI Indicator */}
      <AnimatePresence>
        {isBuffering && !isSignalLocking && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute z-40 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/85 border border-primary/40 backdrop-blur-2xl px-6 py-5 rounded-3xl shadow-[0_0_50px_rgba(0,242,254,0.3)] flex flex-col items-center justify-center gap-3 pointer-events-none"
          >
            <div className="relative w-12 h-12 flex items-center justify-center">
              <div className="absolute inset-0 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <div className="absolute inset-2 border-2 border-primary/40 border-b-primary rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
              <Activity className="w-5 h-5 text-primary animate-pulse" />
            </div>
            <div className="text-center font-mono">
              <span className="text-xs font-black text-white tracking-widest uppercase block">
                BUFFERING BROADCAST...
              </span>
              <span className="text-[10px] text-primary/80 block mt-0.5">
                OPTIMIZING HLS STREAM CHUNKS
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Video Viewport */}
      <div className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <video 
          ref={videoRef}
          autoPlay
          playsInline
          onClick={togglePlay}
          onError={(e) => {
            e.preventDefault();
            setStreamError('Stream source unavailable or format unsupported');
            setIsSignalLocking(false);
          }}
          className="w-full h-full object-contain cursor-pointer"
        />

        {/* Cyber Stream Error Banner */}
        {streamError && (
          <div className="absolute top-20 bg-red-950/80 border border-red-500/50 backdrop-blur-md px-4 py-2 rounded-xl text-red-200 text-xs font-mono flex items-center gap-2 shadow-2xl">
            <RefreshCw className="w-4 h-4 animate-spin text-red-400" />
            {streamError}
          </div>
        )}

        {/* Animated Cyber Audio Visualizer Overlay */}
        <div className="absolute bottom-24 right-8 pointer-events-none flex items-end gap-1 opacity-40 hover:opacity-100 transition-opacity">
          {[40, 70, 30, 90, 50, 80, 60, 100, 45, 75].map((h, idx) => (
            <motion.div 
              key={idx}
              animate={{ height: isPlaying ? [`${h * 0.3}%`, `${h}%`, `${h * 0.5}%`] : '10%' }}
              transition={{ repeat: Infinity, duration: 0.8 + idx * 0.1, ease: 'easeInOut' }}
              className="w-1 bg-gradient-to-t from-blue-600 to-primary rounded-t-sm"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      {/* TOP BROADCAST HUD BAR */}
      <div className="absolute top-0 inset-x-0 z-40 bg-gradient-to-b from-black/90 via-black/50 to-transparent p-4 md:p-6 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition-all border border-white/10 shadow-lg group cursor-pointer"
          >
            <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
          </button>

          <div className="flex items-center gap-3 bg-black/60 backdrop-blur-xl border border-white/10 p-1.5 pr-4 rounded-2xl">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 flex items-center justify-center p-1 border border-white/10">
              <img 
                src={currentChannel.logo || currentChannel.thumbnail || DEFAULT_FAVICON_FALLBACK} 
                alt={currentChannel.name}
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_FAVICON_FALLBACK; }}
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-white text-sm md:text-base leading-tight">
                  {currentChannel.name}
                </h2>
                {currentChannel.country && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-gray-300 uppercase">
                    {currentChannel.country}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono mt-0.5">
                <span className="text-primary font-bold">SLFLIX LIVE</span>
                <span>•</span>
                <span>{currentChannel.category?.toUpperCase() || 'GENERAL'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right HUD Controls */}
        <div className="flex items-center gap-3">
          {/* Live Badge */}
          <div className="flex items-center gap-2 bg-red-600/90 text-white px-3 py-1.5 rounded-xl font-mono text-xs font-black tracking-widest uppercase shadow-[0_0_15px_rgba(239,68,68,0.5)]">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            LIVE
          </div>

          {/* Quality Pill */}
          <div className="hidden md:flex items-center gap-1.5 bg-black/60 border border-primary/30 px-3 py-1.5 rounded-xl text-xs font-mono text-primary shadow-[0_0_10px_rgba(0,229,255,0.2)]">
            <Signal className="w-3.5 h-3.5 animate-pulse" />
            {qualityLabel}
          </div>

          {/* Favorite Pin */}
          <button 
            onClick={() => toggleFavorite(currentChannel.id)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${isFav ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-black/60 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'}`}
          >
            <Star className={`w-5 h-5 ${isFav ? 'fill-black' : ''}`} />
          </button>

          {/* Channel Surfer Toggle */}
          <button 
            onClick={() => setShowChannelDrawer(!showChannelDrawer)}
            className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/50 text-primary flex items-center justify-center hover:bg-primary hover:text-black transition-all cursor-pointer shadow-[0_0_15px_rgba(0,229,255,0.3)]"
            title="Channels Drawer"
          >
            <Layers className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* BOTTOM CYBER CONTROL BAR */}
      <div className="absolute bottom-0 inset-x-0 z-40 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-md">
        
        {/* Left Controls: Play / Mute / Volume */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
          <button 
            onClick={togglePlay}
            className="w-12 h-12 rounded-2xl bg-primary text-black flex items-center justify-center hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,229,255,0.6)] cursor-pointer"
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-0.5" />}
          </button>

          <div className="flex items-center gap-2 bg-black/60 border border-white/10 px-3 py-2 rounded-2xl">
            <button onClick={toggleMute} className="text-gray-300 hover:text-primary transition-colors cursor-pointer">
              {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 md:w-28 accent-primary cursor-pointer h-1.5 bg-white/20 rounded-lg"
            />
          </div>
        </div>

        {/* Center: Zapping Buttons (CH- / CH+) */}
        <div className="flex items-center gap-3 bg-black/80 border border-white/10 p-1.5 rounded-2xl shadow-2xl">
          <button 
            onClick={zapPrevChannel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-primary/20 hover:text-primary transition-all text-xs font-mono font-bold cursor-pointer border border-white/5"
            title="Previous Channel (Up Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>CH-</span>
          </button>

          <div className="text-center px-3">
            <div className="text-[10px] text-gray-500 font-mono">CHANNEL</div>
            <div className="text-xs font-bold text-primary font-mono">{currentIndex + 1} / {allChannels.length || 1}</div>
          </div>

          <button 
            onClick={zapNextChannel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-primary/20 hover:text-primary transition-all text-xs font-mono font-bold cursor-pointer border border-white/5"
            title="Next Channel (Down Arrow)"
          >
            <span>CH+</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right Controls: Fullscreen */}
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleFullscreen}
            className="w-10 h-10 rounded-xl bg-black/60 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* CHANNEL SURFER SIDE DRAWER */}
      <AnimatePresence>
        {showChannelDrawer && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute top-0 right-0 bottom-0 z-50 w-80 md:w-96 bg-[#080b14]/95 backdrop-blur-2xl border-l border-white/10 p-6 flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary animate-pulse" />
                <h3 className="font-extrabold text-white text-base">Channel Guide</h3>
              </div>
              <button 
                onClick={() => setShowChannelDrawer(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Channels List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {allChannels.map((ch, idx) => {
                const isActive = ch.id === currentChannel.id;
                return (
                  <div 
                    key={`${ch.id}-${idx}`}
                    onClick={() => {
                      setCurrentChannel(ch);
                      if (onChannelSelect) onChannelSelect(ch);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isActive ? 'bg-primary/20 border-primary text-white shadow-[0_0_15px_rgba(0,229,255,0.3)]' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 text-gray-300'}`}
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-black/40 border border-white/10 p-1 flex-none flex items-center justify-center">
                      <img 
                        src={ch.logo || ch.thumbnail || DEFAULT_FAVICON_FALLBACK} 
                        alt={ch.name}
                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_FAVICON_FALLBACK; }}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs truncate leading-snug">{ch.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5 uppercase">
                        {ch.category || 'LIVE'} {ch.country ? `• ${ch.country}` : ''}
                      </div>
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-primary animate-ping"></div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default LiveTvStreamPlayer;

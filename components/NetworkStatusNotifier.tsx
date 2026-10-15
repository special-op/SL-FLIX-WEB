import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff, Wifi, X, RefreshCw } from 'lucide-react';

export const NetworkStatusNotifier: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' 
      ? navigator.onLine 
      : true;
  });
  const [showRestored, setShowRestored] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      setIsDismissed(false);

      timer = setTimeout(() => {
        setShowRestored(false);
      }, 3500);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsDismissed(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Don't render anything if online and restored banner has completed
  if (isOnline && !showRestored) return null;
  // Don't render offline banner if user manually dismissed it
  if (!isOnline && isDismissed) return null;

  return (
    <AnimatePresence>
      {!isOnline && !isDismissed && (
        <motion.div
          key="offline-toast"
          initial={{ opacity: 0, y: -30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[92%] sm:w-auto pointer-events-auto"
        >
          <div className="bg-[#120709]/90 border border-red-500/40 text-red-200 px-4 py-3 rounded-2xl backdrop-blur-xl shadow-[0_10px_30px_rgba(239,68,68,0.25)] flex items-center justify-between gap-3 text-xs md:text-sm font-sans">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <span className="absolute w-3 h-3 rounded-full bg-red-500/50 animate-ping"></span>
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
              </div>
              <WifiOff className="w-4 h-4 text-red-400 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-bold text-white leading-tight">No Internet Connection</span>
                <span className="text-[11px] text-red-300/80 font-medium">Browsing offline • Check your network</span>
              </div>
            </div>

            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 rounded-lg hover:bg-white/10 text-red-300 hover:text-white transition-colors flex-shrink-0 cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {isOnline && showRestored && (
        <motion.div
          key="online-toast"
          initial={{ opacity: 0, y: -30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[92%] sm:w-auto pointer-events-auto"
        >
          <div className="bg-[#041a12]/90 border border-emerald-500/40 text-emerald-200 px-4 py-3 rounded-2xl backdrop-blur-xl shadow-[0_10px_30px_rgba(16,185,129,0.25)] flex items-center justify-between gap-3 text-xs md:text-sm font-sans">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              </div>
              <Wifi className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-bold text-white leading-tight">Back Online</span>
                <span className="text-[11px] text-emerald-300/80 font-medium">Internet connection restored</span>
              </div>
            </div>

            <button
              onClick={() => setShowRestored(false)}
              className="p-1 rounded-lg hover:bg-white/10 text-emerald-300 hover:text-white transition-colors flex-shrink-0 cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NetworkStatusNotifier;

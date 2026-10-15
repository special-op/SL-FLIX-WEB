import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall';
import { Download, Share, X } from 'lucide-react';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={className || "flex items-center gap-2 rounded-xl bg-primary text-black px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-primary/80 transition-all shadow-lg shadow-primary/20 cursor-pointer"}
      >
        <Download size={14} />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={className || "flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition cursor-pointer"}
        >
          <Download size={14} />
          Install on iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#12131a] p-6 shadow-2xl text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black italic tracking-tight uppercase">Install SLFLIX on iOS</h3>
                <button onClick={() => setShowIOSGuide(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <X size={20} />
                </button>
              </div>
              <div className="text-xs text-gray-300 leading-relaxed space-y-2">
                <p>1. Tap the <strong className="text-primary">Share <Share size={12} className="inline ml-1" /></strong> icon in Safari's toolbar.</p>
                <p>2. Scroll down and tap <strong className="text-primary">Add to Home Screen</strong>.</p>
                <p>3. Open SLFLIX anytime directly from your Home Screen with full offline access!</p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-primary text-black py-2.5 text-xs font-black uppercase tracking-wider hover:bg-primary/80 cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export default PWAInstallButton;

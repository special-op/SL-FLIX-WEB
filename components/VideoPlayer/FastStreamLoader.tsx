import React from 'react';

export const FastStreamLoader: React.FC<{ buffered?: number }> = ({ buffered }) => {
  // Strictly validate buffered number to prevent NaN or 0 leaking into React DOM text
  const isNumber = typeof buffered === 'number' && !isNaN(buffered) && isFinite(buffered);
  const bufferPercent = isNumber && buffered > 0 ? Math.min(Math.max(Math.round(buffered * 100), 0), 100) : null;
  const hasProgress = bufferPercent !== null && bufferPercent > 2;

  return (
    <div className="flex flex-col items-center justify-center p-6 select-none pointer-events-none animate-fade-in">
      {/* Modern Cinema Dual-Ring Spinner with Ambient Glow */}
      <div className="relative flex items-center justify-center w-16 h-16 md:w-20 md:h-20">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping opacity-25"></div>
        <div className="absolute inset-0 rounded-full border-[3px] border-white/10"></div>
        <div className="absolute inset-0 rounded-full border-[3px] border-t-primary border-r-primary/50 border-b-transparent border-l-transparent animate-spin"></div>
        <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_12px_rgba(0,229,255,0.8)] animate-pulse"></div>
      </div>

      {/* Clean Status & Buffered Progress */}
      <div className="mt-5 flex flex-col items-center text-center max-w-xs">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-semibold tracking-wide">Loading stream</span>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"></span>
          </div>
        </div>

        {hasProgress ? (
          <div className="mt-3 flex flex-col items-center w-40">
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-cyan-300 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(0,229,255,0.6)]"
                style={{ width: `${bufferPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-bold text-primary/90 mt-1.5">
              {bufferPercent}% buffered
            </span>
          </div>
        ) : (
          <span className="text-gray-400 text-xs mt-1">Connecting to server...</span>
        )}
      </div>
    </div>
  );
};

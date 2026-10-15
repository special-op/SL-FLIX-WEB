import React from 'react';
import { VideoSource } from '../../types';
import { getYoutubeId } from './utils';

interface TrailerPlayerProps {
  title: string;
  sources: VideoSource[];
  onClose: () => void;
  coverImage?: string;
}

export const TrailerPlayer: React.FC<TrailerPlayerProps> = ({ title, sources, onClose, coverImage }) => {
  const trailerUrl = sources[0]?.stream || sources[0]?.direct || "";
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center animate-fade-in">
      {coverImage && (
        <div 
          className="absolute inset-0 bg-cover bg-center blur-3xl opacity-40" 
          style={{ backgroundImage: `url(${coverImage})` }} 
        />
      )}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md"></div>
      <button 
        onClick={onClose} 
        className="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
      >
        <i className="fa-solid fa-times"></i>
      </button>
      <div className="relative z-10 w-full max-w-4xl mx-4">
        <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
          {getYoutubeId(trailerUrl) ? (
            <iframe 
              src={`https://www.youtube.com/embed/${getYoutubeId(trailerUrl)}?rel=0`} 
              className="w-full h-full" 
              allowFullScreen 
              title={title} 
            />
          ) : (
            <video 
              src={trailerUrl} 
              controls 
              className="w-full h-full object-contain" 
            />
          )}
        </div>
        <div className="mt-4 text-center">
          <h2 className="text-white font-bold text-lg">{title}</h2>
        </div>
      </div>
    </div>
  );
};

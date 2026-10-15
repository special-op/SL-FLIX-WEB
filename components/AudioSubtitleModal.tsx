import React, { useState, useEffect } from 'react';
import { Subtitle } from '../types';
import { getLanguageName } from './SubtitleManager';
import { 
  CaptionSettings, 
  DEFAULT_CAPTION_SETTINGS, 
  getStoredCaptionSettings, 
  saveStoredCaptionSettings,
  getCaptionFontFamilyCss,
  getCaptionBgCss,
  getCaptionTextShadowCss
} from '../utils/captionSettings';

export interface AudioTrackItem {
  id: number;
  name: string;
  lang?: string;
}

interface AudioSubtitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitles: Subtitle[];
  activeSubtitle: number;
  onSubtitleChange: (index: number) => void;
  subtitleOffset: number;
  onSubtitleOffsetChange: (offset: number) => void;
  subtitleFontSize: 'small' | 'medium' | 'large';
  onSubtitleFontSizeChange: (size: 'small' | 'medium' | 'large') => void;
  audioTracks: AudioTrackItem[];
  activeAudioTrack: number;
  onAudioTrackChange: (index: number) => void;
}

export const AudioSubtitleModal: React.FC<AudioSubtitleModalProps> = ({
  isOpen,
  onClose,
  subtitles,
  activeSubtitle,
  onSubtitleChange,
  subtitleOffset,
  onSubtitleOffsetChange,
  subtitleFontSize,
  onSubtitleFontSizeChange,
  audioTracks,
  activeAudioTrack,
  onAudioTrackChange
}) => {
  const [activeTab, setActiveTab] = useState<'subtitles' | 'style' | 'audio'>('subtitles');
  const [searchQuery, setSearchQuery] = useState('');
  const [captionConfig, setCaptionConfig] = useState<CaptionSettings>(getStoredCaptionSettings());

  useEffect(() => {
    if (isOpen) {
      setCaptionConfig(getStoredCaptionSettings());
    }
  }, [isOpen]);

  const updateCaption = (patch: Partial<CaptionSettings>) => {
    const updated = { ...captionConfig, ...patch };
    setCaptionConfig(updated);
    saveStoredCaptionSettings(updated);
    if (patch.fontSize && patch.fontSize !== 'xlarge') {
      onSubtitleFontSizeChange(patch.fontSize as 'small' | 'medium' | 'large');
    }
  };

  if (!isOpen) return null;

  const filteredSubtitles = subtitles.map((sub, index) => ({ sub, index })).filter(({ sub }) => {
    if (!searchQuery.trim()) return true;
    const name = (sub.name || getLanguageName(sub.lang || sub.language || '')).toLowerCase();
    const lang = (sub.lang || sub.languageCode || '').toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    return name.includes(q) || lang.includes(q);
  });

  return (
    <div 
      className="fixed inset-0 z-[2500] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-[#12121a] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[88vh] transition-all transform scale-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <i className="fa-solid fa-sliders text-sm"></i>
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-tight">Audio & Subtitles</h3>
              <p className="text-gray-400 text-[11px]">Stream preferences, fonts & customization</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <i className="fa-solid fa-times text-sm"></i>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 bg-black/20 p-1.5 gap-1.5 mx-4 mt-4 rounded-xl">
          <button
            onClick={() => setActiveTab('subtitles')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'subtitles' 
                ? 'bg-primary text-black shadow-lg shadow-primary/20' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-closed-captioning"></i>
            <span>Subtitles</span>
            {activeSubtitle >= 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
          </button>
          <button
            onClick={() => setActiveTab('style')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'style' 
                ? 'bg-primary text-black shadow-lg shadow-primary/20' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-font"></i>
            <span>Refine Caption</span>
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'audio' 
                ? 'bg-primary text-black shadow-lg shadow-primary/20' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-volume-high"></i>
            <span>Audio</span>
            {audioTracks.length > 0 && <span className="text-[10px] opacity-70">({audioTracks.length})</span>}
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'subtitles' ? (
            <>
              {/* Quick Enable/Disable Toggle */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Subtitles Display</h4>
                  <p className="text-gray-400 text-[11px]">
                    {activeSubtitle >= 0 ? `Active: ${subtitles[activeSubtitle]?.name || 'Enabled'}` : 'Turned Off'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (activeSubtitle >= 0) {
                      onSubtitleChange(-1);
                    } else if (subtitles.length > 0) {
                      onSubtitleChange(0);
                    }
                  }}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeSubtitle >= 0 
                      ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30' 
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {activeSubtitle >= 0 ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Timing Sync */}
              {activeSubtitle >= 0 && (
                <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Sync Timing Offset</p>
                    <button 
                      onClick={() => onSubtitleOffsetChange(0)}
                      className="text-[10px] text-primary hover:underline font-bold"
                    >
                      Reset to 0s
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button 
                      onClick={() => onSubtitleOffsetChange(Math.round((subtitleOffset - 0.5) * 10) / 10)}
                      className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
                    >
                      -0.5s Earlier
                    </button>
                    <span className="text-xs font-mono text-primary font-bold px-3 py-1 bg-black/40 rounded-lg border border-primary/30">
                      {subtitleOffset > 0 ? `+${subtitleOffset}s` : `${subtitleOffset}s`}
                    </span>
                    <button 
                      onClick={() => onSubtitleOffsetChange(Math.round((subtitleOffset + 0.5) * 10) / 10)}
                      className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
                    >
                      +0.5s Later
                    </button>
                  </div>
                </div>
              )}

              {/* Language Search */}
              {subtitles.length > 5 && (
                <div className="relative">
                  <i className="fa-solid fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs"></i>
                  <input
                    type="text"
                    placeholder="Search language..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {/* Subtitle List */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {/* Off Option */}
                <button
                  onClick={() => {
                    onSubtitleChange(-1);
                    onClose();
                  }}
                  className={`w-full p-3 rounded-xl text-left flex items-center justify-between text-xs font-bold transition-all border cursor-pointer ${
                    activeSubtitle === -1 
                      ? 'bg-primary/20 border-primary text-primary' 
                      : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <i className="fa-solid fa-ban text-xs"></i> Off
                  </span>
                  {activeSubtitle === -1 && <i className="fa-solid fa-check text-primary"></i>}
                </button>

                {filteredSubtitles.map(({ sub, index }) => {
                  const isSelected = activeSubtitle === index;
                  const langName = sub.name || getLanguageName(sub.lang || sub.language || 'en');
                  const code = sub.languageCode || sub.lang || '';
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        onSubtitleChange(index);
                        onClose();
                      }}
                      className={`w-full p-3 rounded-xl text-left flex items-center justify-between text-xs font-bold transition-all border cursor-pointer ${
                        isSelected 
                          ? 'bg-primary text-black border-primary shadow-lg shadow-primary/20' 
                          : 'bg-white/5 border-white/5 text-white hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {code && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                            isSelected ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-400'
                          }`}>
                            {code}
                          </span>
                        )}
                        <span>{langName}</span>
                      </div>
                      {isSelected && <i className="fa-solid fa-check text-xs"></i>}
                    </button>
                  );
                })}

                {subtitles.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-xs">
                    <i className="fa-solid fa-closed-captioning text-2xl mb-2 block opacity-30"></i>
                    No external subtitles available for this stream
                  </div>
                )}
              </div>
            </>
          ) : activeTab === 'style' ? (
            /* Refine Caption Tab */
            <div className="space-y-4">
              {/* Live Preview Box */}
              <div className="bg-gradient-to-b from-[#0c0d1b] to-black rounded-2xl border border-white/15 p-4 shadow-xl text-center relative overflow-hidden">
                <div className="absolute top-2 left-3 text-[10px] uppercase font-mono tracking-widest text-gray-500 font-bold">
                  Live Subtitle Preview
                </div>
                <div className="py-7 px-2">
                  <div 
                    className="inline-block px-4 py-2 rounded-xl transition-all select-none max-w-full"
                    style={{
                      fontFamily: getCaptionFontFamilyCss(captionConfig.fontFamily),
                      backgroundColor: getCaptionBgCss(captionConfig.bgColor, captionConfig.bgOpacity),
                      color: captionConfig.fontColor,
                      textShadow: getCaptionTextShadowCss(captionConfig.textShadow, captionConfig.textOutline, captionConfig.fontColor),
                      fontSize: captionConfig.fontSize === 'small' ? '13px' : captionConfig.fontSize === 'large' ? '20px' : captionConfig.fontSize === 'xlarge' ? '24px' : '16px',
                      fontWeight: captionConfig.fontWeight === 'bold' ? 700 : captionConfig.fontWeight === 'black' ? 900 : 600
                    }}
                  >
                    The cinematic journey begins here.
                  </div>
                </div>
              </div>

              {/* Letter Font Family */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
                  <i className="fa-solid fa-font text-primary"></i>
                  <span>Letter Font Family</span>
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'sans', label: 'Manrope (Sans)', sample: 'Sans' },
                    { id: 'roboto', label: 'Roboto', sample: 'Modern' },
                    { id: 'serif', label: 'Georgia', sample: 'Serif' },
                    { id: 'mono', label: 'Monospace', sample: 'Mono' },
                    { id: 'impact', label: 'Impact', sample: 'Impact' },
                    { id: 'comic', label: 'Casual', sample: 'Casual' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => updateCaption({ fontFamily: f.id })}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all text-center ${
                        captionConfig.fontFamily === f.id
                          ? 'bg-primary text-black border-primary shadow-md shadow-primary/20'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className="truncate">{f.sample}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Letter Color & Size */}
              <div className="grid grid-cols-2 gap-2">
                {/* Font Color */}
                <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
                  <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-2">Letter Color</p>
                  <div className="flex items-center gap-2">
                    {[
                      { color: '#ffffff', title: 'White' },
                      { color: '#ffe838', title: 'Yellow' },
                      { color: '#00e5ff', title: 'Cyan' },
                      { color: '#a7f3d0', title: 'Mint' },
                      { color: '#fbbf24', title: 'Amber' }
                    ].map(c => (
                      <button
                        key={c.color}
                        onClick={() => updateCaption({ fontColor: c.color })}
                        title={c.title}
                        className={`w-7 h-7 rounded-full transition-all border-2 ${
                          captionConfig.fontColor === c.color 
                            ? 'border-white scale-110 shadow-lg' 
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
                  <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-2">Text Size</p>
                  <div className="flex items-center gap-1">
                    {(['small', 'medium', 'large', 'xlarge'] as const).map(size => (
                      <button
                        key={size}
                        onClick={() => updateCaption({ fontSize: size })}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          captionConfig.fontSize === size
                            ? 'bg-primary text-black font-extrabold'
                            : 'bg-white/10 text-gray-300 hover:bg-white/20'
                        }`}
                      >
                        {size === 'xlarge' ? 'XL' : size[0].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Background Color & Opacity */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3 space-y-2.5">
                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Background Box & Opacity</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'transparent', label: 'Transparent' },
                    { id: 'black-semi', label: 'Semi-Dark' },
                    { id: 'black-solid', label: 'Solid Black' },
                    { id: 'charcoal', label: 'Charcoal' },
                    { id: 'neon', label: 'Cyber Dark' }
                  ].map(bg => (
                    <button
                      key={bg.id}
                      onClick={() => updateCaption({ bgColor: bg.id })}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all truncate ${
                        captionConfig.bgColor === bg.id
                          ? 'bg-primary text-black border-primary'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>

                {captionConfig.bgColor !== 'transparent' && (
                  <div className="pt-2 flex items-center gap-3">
                    <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">Opacity: {captionConfig.bgOpacity}%</span>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      step="5"
                      value={captionConfig.bgOpacity}
                      onChange={e => updateCaption({ bgOpacity: Number(e.target.value) })}
                      className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Text Outline & Effects */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold text-white">Text Stroke Outline</h5>
                  <p className="text-gray-400 text-[10px]">Sharp dark edge outline for contrast on bright scenes</p>
                </div>
                <button
                  onClick={() => updateCaption({ textOutline: !captionConfig.textOutline })}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    captionConfig.textOutline 
                      ? 'bg-primary text-black' 
                      : 'bg-white/10 text-gray-400 hover:bg-white/20'
                  }`}
                >
                  {captionConfig.textOutline ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Reset to Default Button */}
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => {
                    setCaptionConfig(DEFAULT_CAPTION_SETTINGS);
                    saveStoredCaptionSettings(DEFAULT_CAPTION_SETTINGS);
                    onSubtitleFontSizeChange('medium');
                  }}
                  className="text-xs text-gray-400 hover:text-white underline font-bold"
                >
                  Reset subtitle styles to default
                </button>
              </div>
            </div>
          ) : (
            /* Audio Tab */
            <div className="space-y-3">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
                <h4 className="text-sm font-bold text-white mb-1">Audio Output</h4>
                <p className="text-gray-400 text-[11px]">
                  High-fidelity stereo playback with automatic dynamic range leveling
                </p>
              </div>

              <div className="space-y-1.5">
                {audioTracks.length > 0 ? (
                  audioTracks.map((track, i) => {
                    const isSelected = activeAudioTrack === track.id || (activeAudioTrack === -1 && i === 0);
                    return (
                      <button
                        key={track.id}
                        onClick={() => {
                          onAudioTrackChange(track.id);
                          onClose();
                        }}
                        className={`w-full p-3 rounded-xl text-left flex items-center justify-between text-xs font-bold transition-all border ${
                          isSelected 
                            ? 'bg-primary text-black border-primary shadow-lg shadow-primary/20' 
                            : 'bg-white/5 border-white/5 text-white hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <i className="fa-solid fa-music text-xs opacity-70"></i>
                          <span>{track.name || `Audio Track ${i + 1}`}</span>
                          {track.lang && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${
                              isSelected ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-400'
                            }`}>
                              {track.lang}
                            </span>
                          )}
                        </div>
                        {isSelected && <i className="fa-solid fa-check text-xs"></i>}
                      </button>
                    );
                  })
                ) : (
                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-white font-bold">
                      <i className="fa-solid fa-volume-high text-primary"></i>
                      <span>Default Stream Audio (Original Stereo)</span>
                    </div>
                    <i className="fa-solid fa-check text-primary"></i>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-white/5 bg-black/40 text-center">
          <p className="text-[10px] text-gray-500">
            Custom subtitle styles persist automatically across all movies and episodes
          </p>
        </div>
      </div>
    </div>
  );
};

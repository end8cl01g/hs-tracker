import React, { useState, useEffect } from 'react';
import { Compass, Volume2, VolumeX, Settings, Shield, Wand2, Moon } from 'lucide-react';
import { Quest } from '../types';
import { skyrimAudio } from '../services/audioService';

interface SkyrimCompassProps {
  activeQuests: Quest[];
  onOpenStats: () => void;
  onOpenSaves: () => void;
  onOpenSettings: () => void;
  perkPoints: number;
}

export const SkyrimCompass: React.FC<SkyrimCompassProps> = ({
  activeQuests,
  onOpenStats,
  onOpenSaves,
  onOpenSettings,
  perkPoints,
}) => {
  const [heading, setHeading] = useState<number>(90); // default pointing East
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Gentle compass sway for atmospheric feel
  useEffect(() => {
    const interval = setInterval(() => {
      setHeading((prev) => (prev + (Math.random() - 0.5) * 4 + 360) % 360);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const toggleAudio = () => {
    skyrimAudio.isMuted = !skyrimAudio.isMuted;
    setIsMuted(skyrimAudio.isMuted);
    if (!skyrimAudio.isMuted) {
      skyrimAudio.playTabSwitch();
    }
  };

  // Compass directions array
  const directions = [
    { label: 'N', deg: 0 },
    { label: 'NE', deg: 45 },
    { label: 'E', deg: 90 },
    { label: 'SE', deg: 135 },
    { label: 'S', deg: 180 },
    { label: 'SW', deg: 225 },
    { label: 'W', deg: 270 },
    { label: 'NW', deg: 315 },
  ];

  return (
    <header className="relative w-full flex-none bg-[#000]/60 border-b border-[#333] backdrop-blur-md pt-2 pb-1.5 px-4 z-30 select-none">
      {/* Top action row */}
      <div className="flex items-center justify-between max-w-5xl mx-auto mb-1.5 text-xs text-[#e0e0e0]">
        {/* Left: Quick Save & Stats access */}
        <div className="flex items-center gap-2">
          <button
            id="btn-compass-saves"
            onClick={onOpenSaves}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#111]/80 hover:bg-[#1f1f1f] border border-[#333] text-[#e0e0e0] text-[10px] tracking-[0.15em] uppercase transition-colors"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#72ffff] animate-pulse shadow-[0_0_6px_#72ffff]"></div>
            <span>SAVES</span>
          </button>

          <button
            id="btn-compass-settings"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#111]/80 hover:bg-[#1f1f1f] border border-[#333] text-[#e0e0e0] text-[10px] tracking-[0.15em] transition-colors"
            title="設定（雲端同步／課表開始日期／備份）"
          >
            <Settings className="w-3.5 h-3.5 text-[#c4a000]" />
            <span>SET</span>
          </button>

          <button
            id="btn-compass-stats"
            onClick={onOpenStats}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#111]/80 hover:bg-[#1f1f1f] border border-[#333] text-[#e0e0e0] text-[10px] tracking-[0.15em] transition-colors"
          >
            <Compass className="w-3.5 h-3.5 text-[#c4a000]" />
            <span>SYSTEM</span>
            {perkPoints > 0 && (
              <span className="px-1.5 py-0.2 bg-[#c4a000] text-black font-bold rounded-full text-[9px] shadow-[0_0_6px_#c4a000]">
                +{perkPoints}
              </span>
            )}
          </button>
        </div>

        {/* Center: Skyrim Nordic Title Sigil */}
        <div className="flex items-center gap-2 text-[#c4a000] tracking-[0.25em] font-light text-xs">
          <span className="text-[9px] opacity-40">❖</span>
          <span className="font-serif">倒立之殿 · PRESS TO HANDSTAND</span>
          <span className="text-[9px] opacity-40">❖</span>
        </div>

        {/* Right: Sound toggle and offline status */}
        <div className="flex items-center gap-3">
          <div className="hidden xs:flex items-center gap-2 text-[10px] tracking-widest text-[#72ffff] opacity-80 font-sans">
            <div className="w-1.5 h-1.5 bg-[#72ffff] rounded-full animate-pulse shadow-[0_0_8px_#72ffff]"></div>
            <span>STORAGE ACTIVE</span>
          </div>

          <button
            id="btn-toggle-sound"
            onClick={toggleAudio}
            className="p-1.5 rounded bg-[#111]/80 hover:bg-[#1f1f1f] border border-[#333] text-[#e0e0e0] transition-colors"
            title={isMuted ? '開啟音效' : '靜音'}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-[#c4a000]" />
            )}
          </button>
        </div>
      </div>

      {/* Skyrim Iconic Compass Horizon Bar */}
      <div className="relative max-w-xl mx-auto h-7 bg-[#0a0a0a]/90 rounded-sm border-y border-[#333] overflow-hidden flex items-center justify-center shadow-inner">
        {/* Center Marker Diamond Bracket */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-8 flex flex-col items-center justify-between pointer-events-none z-10">
          <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#c4a000]"></div>
          <div className="w-0.5 h-full bg-[#c4a000]/40"></div>
          <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-l-transparent border-r-transparent border-b-[#c4a000]"></div>
        </div>

        {/* Ticking Ruler & Direction Markers */}
        <div
          className="absolute flex items-center h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${-((heading / 360) * 800 - 400)}px)` }}
        >
          {[-1, 0, 1].map((offset) => (
            <div key={offset} className="flex items-center w-[800px] justify-between px-4 relative">
              {directions.map((d) => (
                <div key={d.label + offset} className="flex flex-col items-center">
                  <span
                    className={`text-[10px] font-bold tracking-widest ${
                      d.label === 'N'
                        ? 'text-red-400'
                        : d.label.length === 1
                        ? 'text-[#e0e0e0]'
                        : 'text-[#666]'
                    }`}
                  >
                    {d.label}
                  </span>
                  <div
                    className={`w-0.5 ${
                      d.label.length === 1 ? 'h-2 bg-[#888]' : 'h-1 bg-[#444]'
                    }`}
                  ></div>
                </div>
              ))}

              {/* Active Quest Marker Icons on Compass */}
              {activeQuests.slice(0, 3).map((q, qIdx) => {
                const questOffset = 180 + qIdx * 120;
                return (
                  <div
                    key={q.id + offset}
                    className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer group"
                    style={{ left: `${questOffset}px` }}
                    title={q.title}
                  >
                    <div className="w-3.5 h-3.5 rotate-45 border border-[#72ffff] bg-[#051c24]/90 flex items-center justify-center shadow-[0_0_8px_#72ffff] animate-pulse">
                      <div className="w-1.5 h-1.5 bg-[#72ffff]"></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Subtle Vignette Gradient on edges */}
        <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#000] to-transparent pointer-events-none"></div>
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#000] to-transparent pointer-events-none"></div>
      </div>
    </header>
  );
};

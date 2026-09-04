import React from 'react';
import { Sparkles, ScrollText, User, Save } from 'lucide-react';
import { CharacterStats } from '../types';
import { skyrimAudio } from '../services/audioService';

interface SkyrimStatusBarProps {
  character: CharacterStats;
  currentTab: 'perks' | 'quests' | 'character' | 'saves';
  onTabChange: (tab: 'perks' | 'quests' | 'character' | 'saves') => void;
}

export const SkyrimStatusBar: React.FC<SkyrimStatusBarProps> = ({
  character,
  currentTab,
  onTabChange,
}) => {
  const handleSelectTab = (tab: 'perks' | 'quests' | 'character' | 'saves') => {
    if (tab !== currentTab) {
      skyrimAudio.playTabSwitch();
      onTabChange(tab);
    }
  };

  const healthPct = Math.min(100, Math.max(0, (character.health / character.maxHealth) * 100));
  const magickaPct = Math.min(100, Math.max(0, (character.magicka / character.maxMagicka) * 100));
  const staminaPct = Math.min(100, Math.max(0, (character.stamina / character.maxStamina) * 100));

  return (
    <footer className="relative w-full flex-none bg-[#000]/95 border-t border-[#333] pb-safe z-30 select-none backdrop-blur-md">
      {/* Attribute Triple Bars (Health, Magicka, Stamina) with inset shadows */}
      <div className="max-w-xl mx-auto px-4 pt-2 pb-1 grid grid-cols-3 gap-3 text-[11px]">
        {/* Magicka Bar */}
        <div className="flex flex-col">
          <div className="flex justify-between items-center text-[9px] tracking-widest text-[#72ffff] opacity-80 uppercase px-0.5 mb-1 font-sans">
            <span>MAGICKA</span>
            <span className="font-mono text-[9px]">
              {character.magicka}/{character.maxMagicka}
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#181818] rounded-full overflow-hidden relative">
            <div
              className="h-full bg-blue-600/70 shadow-[inset_0_0_8px_rgba(0,160,255,0.8)] transition-all duration-300"
              style={{ width: `${magickaPct}%` }}
            ></div>
          </div>
        </div>

        {/* Health Bar */}
        <div className="flex flex-col">
          <div className="flex justify-between items-center text-[9px] tracking-widest text-[#f87171] opacity-80 uppercase px-0.5 mb-1 font-sans">
            <span>HEALTH</span>
            <span className="font-mono text-[9px]">
              {character.health}/{character.maxHealth}
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#181818] rounded-full overflow-hidden relative">
            <div
              className="h-full bg-red-600/70 shadow-[inset_0_0_8px_rgba(255,50,50,0.8)] transition-all duration-300"
              style={{ width: `${healthPct}%` }}
            ></div>
          </div>
        </div>

        {/* Stamina Bar */}
        <div className="flex flex-col">
          <div className="flex justify-between items-center text-[9px] tracking-widest text-[#4ade80] opacity-80 uppercase px-0.5 mb-1 font-sans">
            <span>STAMINA</span>
            <span className="font-mono text-[9px]">
              {character.stamina}/{character.maxStamina}
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#181818] rounded-full overflow-hidden relative">
            <div
              className="h-full bg-green-600/70 shadow-[inset_0_0_8px_rgba(50,255,100,0.8)] transition-all duration-300"
              style={{ width: `${staminaPct}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Main Tab Bar Navigation */}
      <nav className="max-w-lg mx-auto flex items-center justify-around px-2 py-1">
        {/* Perks Tab */}
        <button
          id="tab-perks"
          onClick={() => handleSelectTab('perks')}
          className={`flex flex-col items-center justify-center py-1 px-3 transition-all min-h-[44px] ${
            currentTab === 'perks'
              ? 'border-b-2 border-[#c4a000] text-[#c4a000]'
              : 'text-[#e0e0e0] opacity-50 hover:opacity-100 hover:text-white'
          }`}
        >
          <div className="relative">
            <Sparkles className="w-4 h-4" />
            {character.perkPoints > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 py-0.2 bg-[#c4a000] text-black font-bold text-[9px] rounded-full animate-pulse shadow-[0_0_6px_#c4a000]">
                {character.perkPoints}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-[0.15em] uppercase font-serif mt-0.5 whitespace-nowrap">
            SKILLS
          </span>
        </button>

        {/* Quests Tab */}
        <button
          id="tab-quests"
          onClick={() => handleSelectTab('quests')}
          className={`flex flex-col items-center justify-center py-1 px-3 transition-all min-h-[44px] ${
            currentTab === 'quests'
              ? 'border-b-2 border-[#c4a000] text-[#c4a000]'
              : 'text-[#e0e0e0] opacity-50 hover:opacity-100 hover:text-white'
          }`}
        >
          <ScrollText className="w-4 h-4" />
          <span className="text-[10px] tracking-[0.15em] uppercase font-serif mt-0.5 whitespace-nowrap">
            QUESTS
          </span>
        </button>

        {/* Character Stats Tab */}
        <button
          id="tab-character"
          onClick={() => handleSelectTab('character')}
          className={`flex flex-col items-center justify-center py-1 px-3 transition-all min-h-[44px] ${
            currentTab === 'character'
              ? 'border-b-2 border-[#c4a000] text-[#c4a000]'
              : 'text-[#e0e0e0] opacity-50 hover:opacity-100 hover:text-white'
          }`}
        >
          <User className="w-4 h-4" />
          <span className="text-[10px] tracking-[0.15em] uppercase font-serif mt-0.5 whitespace-nowrap">
            SYSTEM
          </span>
        </button>

        {/* Saves Tab */}
        <button
          id="tab-saves"
          onClick={() => handleSelectTab('saves')}
          className={`flex flex-col items-center justify-center py-1 px-3 transition-all min-h-[44px] ${
            currentTab === 'saves'
              ? 'border-b-2 border-[#c4a000] text-[#c4a000]'
              : 'text-[#e0e0e0] opacity-50 hover:opacity-100 hover:text-white'
          }`}
        >
          <Save className="w-4 h-4" />
          <span className="text-[10px] tracking-[0.15em] uppercase font-serif mt-0.5 whitespace-nowrap">
            SAVES
          </span>
        </button>
      </nav>
    </footer>
  );
};

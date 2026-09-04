import React, { useState } from 'react';
import { Flame, Zap, Wind, Hourglass, ShieldAlert, Sparkles, Volume2, Play } from 'lucide-react';
import { DRAGON_SHOUTS, DragonShout, DragonWord } from '../data/skyrimData';
import { skyrimAudio } from '../utils/audio';

export const DragonWordWall: React.FC = () => {
  const [selectedShoutId, setSelectedShoutId] = useState<string>('unrelenting-force');
  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);
  const [isShouting, setIsShouting] = useState<boolean>(false);
  const [comboLevel, setComboLevel] = useState<number>(1);
  const [customWordInput, setCustomWordInput] = useState<string>('DOVAHKIIN');
  const [customEffect, setCustomEffect] = useState<'fire' | 'frost' | 'arcane' | 'gold'>('fire');
  const [hoveredWord, setHoveredWord] = useState<DragonWord | null>(null);

  const activeShout: DragonShout = DRAGON_SHOUTS.find(s => s.id === selectedShoutId) || DRAGON_SHOUTS[0];

  const handleSelectShout = (shout: DragonShout) => {
    setSelectedShoutId(shout.id);
    setActiveWordIndex(0);
    setComboLevel(1);
    skyrimAudio.playMenuClick();
  };

  const handleTriggerShout = (level: number = 3) => {
    setIsShouting(true);
    setComboLevel(level);
    skyrimAudio.playDragonShout(level);

    // Reset shouting state after shockwave animation
    setTimeout(() => {
      setIsShouting(false);
    }, 1200);
  };

  const handleWordClick = (word: DragonWord, index: number) => {
    setActiveWordIndex(index);
    setComboLevel(index + 1);
    skyrimAudio.playDragonShout(index + 1);
  };

  // Custom Typography dynamic style generator
  const getCustomTypographyStyle = () => {
    switch (customEffect) {
      case 'fire':
        return 'text-amber-200 drop-shadow-[0_0_20px_rgba(234,88,12,0.9)] animate-pulse';
      case 'frost':
        return 'text-cyan-100 drop-shadow-[0_0_20px_rgba(56,189,248,0.9)] animate-pulse';
      case 'arcane':
        return 'text-purple-200 drop-shadow-[0_0_25px_rgba(168,85,247,0.9)] animate-pulse';
      case 'gold':
        return 'text-yellow-100 drop-shadow-[0_0_22px_rgba(250,204,21,0.95)] animate-pulse';
    }
  };

  return (
    <section className={`relative w-full py-8 px-3 sm:px-6 md:px-8 max-w-6xl mx-auto flex flex-col items-center transition-all ${
      isShouting ? 'scale-[1.008] duration-75' : 'duration-300'
    }`}>
      {/* Top Title & Lore */}
      <div className="w-full flex flex-col items-center text-center mb-6">
        <div className="flex items-center gap-3 text-amber-500/80 mb-1">
          <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-amber-500/60" />
          <span className="font-cinzel text-xs tracking-widest uppercase">The Ancient Word Wall of Skyrim</span>
          <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-amber-500/60" />
        </div>
        <h2 className="font-cinzel-dec text-2xl sm:text-3xl md:text-4xl text-amber-100 tracking-wider font-bold drop-shadow-[0_2px_12px_rgba(245,158,11,0.3)]">
          龍語壁文 · 龍吼動態字體
        </h2>
        <p className="font-marcellus text-stone-400 text-xs sm:text-sm mt-1.5 max-w-2xl">
          古代諾德人在世界之喉刻下的神聖符文。觸碰詞彙即可激發龍吼共鳴與符文流光動態。
        </p>
      </div>

      {/* Dragon Shouts Tabs Selection */}
      <div className="w-full flex flex-wrap items-center justify-center gap-2 mb-6">
        {DRAGON_SHOUTS.map(shout => {
          const isSelected = selectedShoutId === shout.id;
          return (
            <button
              key={shout.id}
              id={`select-shout-${shout.id}`}
              onClick={() => handleSelectShout(shout)}
              className={`px-3.5 py-2 rounded border font-cinzel text-xs tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                isSelected
                  ? 'bg-stone-900 border-amber-500/80 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.3)] font-bold'
                  : 'bg-stone-950/80 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700'
              }`}
            >
              <span 
                className="w-2 h-2 rotate-45"
                style={{ backgroundColor: shout.elementColor }}
              />
              <span>{shout.words.map(w => w.dovah).join(' ')}</span>
              <span className="text-stone-500 text-[11px] font-serif-tc">({shout.name})</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* THE ANCIENT STONE WORD WALL MONOLITH */}
      {/* ========================================================= */}
      <div className="relative w-full max-w-4xl rounded-2xl p-6 sm:p-10 border-2 border-stone-800 bg-gradient-to-b from-[#1c1815] via-[#120f0d] to-[#0d0a08] shadow-[0_25px_60px_rgba(0,0,0,0.95)] overflow-hidden">
        {/* Carved stone masonry texture & cracks */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none opacity-40" />
        
        {/* Dynamic Shockwave Ring (When Shouting) */}
        {isShouting && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="w-40 h-40 rounded-full border-4 border-amber-400 animate-ping opacity-75 shadow-[0_0_50px_rgba(245,158,11,1)]" />
            <div className="w-80 h-80 rounded-full border-2 border-orange-500 animate-ping opacity-40" />
          </div>
        )}

        {/* Word Wall Nordic Relief Dragons Header */}
        <div className="relative w-full flex items-center justify-between mb-8 pb-4 border-b border-stone-800/80">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rotate-45 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <div>
              <h3 className="font-cinzel text-lg sm:text-xl font-bold text-stone-200">
                {activeShout.name} <span className="text-stone-500 text-sm font-normal">({activeShout.englishName})</span>
              </h3>
              <p className="font-serif-tc text-xs text-stone-400 mt-0.5">{activeShout.description}</p>
            </div>
          </div>

          {/* Trigger Full 3-Word Shout Button */}
          <button
            id="trigger-full-shout-btn"
            onClick={() => handleTriggerShout(3)}
            disabled={isShouting}
            className="flex items-center gap-2 px-4 py-2 rounded bg-gradient-to-r from-amber-900/60 to-orange-950/80 border border-amber-500/70 hover:border-amber-400 text-amber-200 hover:text-white transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] cursor-pointer disabled:opacity-50"
          >
            <Flame className={`w-4 h-4 text-amber-400 ${isShouting ? 'animate-bounce' : ''}`} />
            <span className="font-cinzel text-xs tracking-wider font-bold">施放完整龍吼 (THU'UM)</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* THE 3 WORDS OF POWER: DYNAMIC RUNIC TYPOGRAPHY CARDS */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 my-6 relative z-10">
          {activeShout.words.map((word, idx) => {
            const isWordActive = idx <= activeWordIndex;
            return (
              <div
                key={idx}
                id={`word-card-${idx}`}
                onClick={() => handleWordClick(word, idx)}
                onMouseEnter={() => setHoveredWord(word)}
                onMouseLeave={() => setHoveredWord(null)}
                className={`group relative rounded-xl p-5 border-2 transition-all duration-300 flex flex-col items-center text-center cursor-pointer select-none ${
                  isWordActive
                    ? 'bg-stone-900/90 border-amber-500/80 shadow-[0_0_25px_rgba(245,158,11,0.35)] scale-[1.02]'
                    : 'bg-stone-950/60 border-stone-800/80 hover:border-stone-700 hover:bg-stone-900/40'
                }`}
              >
                {/* Level indicator */}
                <div className="absolute top-2 right-2 text-[10px] font-cinzel text-stone-500 px-1.5 py-0.5 rounded bg-stone-950 border border-stone-800">
                  WORD #{idx + 1}
                </div>

                {/* DOVAHZUL RUNIC GLYPH (CLAW INSCRIPTION) */}
                <div className="my-2 h-16 flex items-center justify-center">
                  <span 
                    className={`font-uncial text-4xl sm:text-5xl transition-all duration-300 select-none ${
                      isWordActive
                        ? 'text-amber-200 drop-shadow-[0_0_16px_rgba(251,191,36,0.9)] animate-runic-glow scale-110'
                        : 'text-stone-600 group-hover:text-stone-400'
                    }`}
                  >
                    {word.runicGlyph}
                  </span>
                </div>

                {/* DRAGON WORD (LATIN TRANSLITERATION) */}
                <h4 className={`font-cinzel-dec text-2xl font-black tracking-widest my-1 transition-all ${
                  isWordActive ? 'text-amber-100 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'text-stone-400 group-hover:text-stone-200'
                }`}>
                  {word.dovah}
                </h4>

                {/* PHONETIC PRONUNCIATION */}
                <span className="text-[11px] font-marcellus text-amber-500/80 italic mb-2">
                  /{word.phonetic}/
                </span>

                {/* MEANING / TRANSLATION */}
                <div className="w-full pt-2 border-t border-stone-800/80 flex flex-col items-center">
                  <span className="font-serif-tc text-xs font-semibold text-stone-300">
                    {word.meaning}
                  </span>
                </div>

                {/* Interactive Click Tip */}
                <div className="mt-3 text-[10px] font-cinzel text-stone-500 group-hover:text-amber-400 flex items-center gap-1 transition-colors">
                  <Volume2 className="w-3 h-3" />
                  <span>點擊吟誦發聲</span>
                </div>

                {/* Active word glow underline */}
                {isWordActive && (
                  <div className="absolute -bottom-1 left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
                )}
              </div>
            );
          })}
        </div>

        {/* Word Wall Progression & Thu'um Effect Breakdown */}
        <div className="mt-6 p-4 rounded-lg bg-stone-950/80 border border-stone-800/80 text-xs">
          <div className="flex items-center gap-2 mb-2 text-amber-400 font-cinzel font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>當前龍吼階層效果 (THU'UM POWER STAGES)：</span>
          </div>
          <div className="space-y-1.5 font-serif-tc text-stone-300">
            {activeShout.shoutLevelEffect.map((effect, idx) => (
              <div 
                key={idx} 
                className={`p-2 rounded transition-colors ${
                  idx === activeWordIndex 
                    ? 'bg-amber-950/40 border-l-2 border-amber-500 text-amber-200 font-medium' 
                    : 'text-stone-400'
                }`}
              >
                {effect}
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================= */}
        {/* INTERACTIVE DRAGON SCRIBE & DYNAMIC FONT EXPERIMENT LAB */}
        {/* ========================================================= */}
        <div className="mt-8 pt-6 border-t border-stone-800/80">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h4 className="font-cinzel text-sm text-stone-200 font-bold uppercase tracking-wider">
                龍語動態字體渲染實驗室 (Thu'um Font Sandbox)
              </h4>
            </div>

            {/* Aura Effect Selector */}
            <div className="flex items-center gap-1.5 text-xs font-cinzel">
              <span className="text-stone-500 text-[11px]">符文靈光：</span>
              {(['fire', 'frost', 'arcane', 'gold'] as const).map(eff => (
                <button
                  key={eff}
                  id={`effect-btn-${eff}`}
                  onClick={() => {
                    setCustomEffect(eff);
                    skyrimAudio.playMenuClick();
                  }}
                  className={`px-2 py-0.5 rounded capitalize transition-all cursor-pointer ${
                    customEffect === eff
                      ? 'bg-stone-800 text-amber-300 border border-amber-500/60 font-bold'
                      : 'bg-stone-950 text-stone-500 border border-stone-800 hover:text-stone-300'
                  }`}
                >
                  {eff === 'fire' ? '烈焰 (Fire)' : eff === 'frost' ? '寒霜 (Frost)' : eff === 'arcane' ? '奧術 (Arcane)' : '聖金 (Aedric)'}
                </button>
              ))}
            </div>
          </div>

          {/* User Word Input */}
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
            <input
              id="custom-word-input"
              type="text"
              value={customWordInput}
              onChange={(e) => setCustomWordInput(e.target.value)}
              placeholder="輸入英文字母或中文，如 DRAGON, SKYRIM, 龍裔..."
              className="w-full sm:flex-1 px-3 py-2 rounded bg-stone-900 border border-stone-800 text-amber-100 font-cinzel text-sm focus:outline-none focus:border-amber-500"
            />
            <button
              id="test-shout-echo-btn"
              onClick={() => handleTriggerShout(2)}
              className="w-full sm:w-auto px-4 py-2 rounded bg-stone-800 border border-amber-600/50 hover:bg-stone-700 text-amber-200 font-cinzel text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Play className="w-3.5 h-3.5 text-amber-400" />
              <span>激發字體震盪</span>
            </button>
          </div>

          {/* Dynamic Typography Canvas Rendering Box */}
          <div className="relative w-full py-10 px-4 rounded-lg bg-stone-950 border border-stone-800 flex flex-col items-center justify-center overflow-hidden min-h-[140px]">
            {/* Background glowing runes watermark */}
            <div className="absolute inset-0 flex items-center justify-around opacity-5 select-none pointer-events-none font-uncial text-6xl">
              <span>ᚠ</span><span>ᛋ</span><span>ᚱ</span><span>ᛟ</span><span>ᛞ</span><span>ᚨ</span>
            </div>

            {/* Rendered Dynamic Text with Selected Aura */}
            <div className="text-center relative z-10">
              <span className={`font-cinzel-dec text-3xl sm:text-4xl md:text-5xl font-black tracking-widest transition-all duration-500 inline-block ${getCustomTypographyStyle()}`}>
                {customWordInput || 'DOVAHKIIN'}
              </span>
              <div className="mt-2 text-stone-500 font-serif-tc text-xs">
                「巨龍之喉低語著古老的名字，風雪為之止息。」
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

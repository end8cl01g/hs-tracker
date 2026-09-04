import React, { useState, useEffect } from 'react';
import { Sparkles, Heart, Zap, RefreshCw, ZoomIn, ZoomOut, ChevronDown, ChevronUp, Maximize2, Minimize2, Sliders } from 'lucide-react';
import { skyrimAudio } from '../utils/audio';

export interface HudStats { magicka?: number; maxMagicka?: number; health?: number; maxHealth?: number; stamina?: number; maxStamina?: number }

// 合併註記：三條槽不再是虛構的 380/520/340，而是這個 App 真的在量的東西
//   藍＝升到下一級所需的 XP 進度、紅＝已點亮的星 / 全部星、綠＝連續訓練日（上限 7）
export const SkyrimHUD: React.FC<{ stats?: HudStats }> = ({ stats = {} }) => {
  const [magicka, setMagicka] = useState<number>(stats.magicka ?? 380);
  const [maxMagicka] = useState<number>(stats.maxMagicka ?? 380);

  const [health, setHealth] = useState<number>(stats.health ?? 520);
  const [maxHealth] = useState<number>(stats.maxHealth ?? 520);

  const [stamina, setStamina] = useState<number>(stats.stamina ?? 340);
  const [maxStamina] = useState<number>(stats.maxStamina ?? 340);

  // HUD Scale & Layout States
  const [hudScale, setHudScale] = useState<number>(1.0); // 0.65 to 1.35
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [barWidthMode, setBarWidthMode] = useState<'compact' | 'standard' | 'wide' | 'fluid'>('standard');
  const [showScalePanel, setShowScalePanel] = useState<boolean>(false);

  // Keyboard shortcut listener (H: toggle collapse, + / -: zoom HUD)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        setIsCollapsed(prev => !prev);
        skyrimAudio.playMenuClick();
      } else if (e.key === '+' || e.key === '=') {
        setHudScale(prev => Math.min(1.35, +(prev + 0.05).toFixed(2)));
      } else if (e.key === '-' || e.key === '_') {
        setHudScale(prev => Math.max(0.65, +(prev - 0.05).toFixed(2)));
      } else if (e.key === '0') {
        setHudScale(1.0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Quick action to demonstrate dynamic bar changes
  const handleDrainTest = () => {
    skyrimAudio.playMenuClick();
    setMagicka(prev => Math.max(80, prev - 120));
    setHealth(prev => Math.max(160, prev - 140));
    setStamina(prev => Math.max(60, prev - 110));
  };

  const handleRestore = () => {
    skyrimAudio.playArcaneChime();
    setMagicka(maxMagicka);
    setHealth(maxHealth);
    setStamina(maxStamina);
  };

  const magickaPercent = (magicka / maxMagicka) * 100;
  const healthPercent = (health / maxHealth) * 100;
  const staminaPercent = (stamina / maxStamina) * 100;

  // Compute bar width CSS class based on barWidthMode
  const getBarWidthClass = () => {
    switch (barWidthMode) {
      case 'compact':
        return 'w-full md:w-[190px]';
      case 'wide':
        return 'w-full md:w-[320px]';
      case 'fluid':
        return 'w-full md:w-[380px] lg:w-[420px]';
      case 'standard':
      default:
        return 'w-full md:w-[240px]';
    }
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-30 pointer-events-auto select-none transition-all duration-300">
      {/* Collapsed Mode Floating Bar */}
      {isCollapsed ? (
        <div className="w-full flex justify-center pb-2 px-4">
          <div className="bg-stone-950/90 border border-stone-800/80 rounded-full px-4 py-1.5 shadow-[0_10px_25px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-4 text-xs font-cinzel">
            {/* Level badge */}
            <span className="text-amber-400 font-bold">LV 81</span>
            
            {/* Micro gauges */}
            <div className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-sky-400" />
              <div className="w-12 h-1.5 bg-stone-900 border border-stone-800 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500" style={{ width: `${magickaPercent}%` }} />
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Heart className="w-3 h-3 text-red-400" />
              <div className="w-12 h-1.5 bg-stone-900 border border-stone-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-600" style={{ width: `${healthPercent}%` }} />
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" />
              <div className="w-12 h-1.5 bg-stone-900 border border-stone-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-600" style={{ width: `${staminaPercent}%` }} />
              </div>
            </div>

            {/* Expand button */}
            <button
              id="expand-hud-btn"
              onClick={() => {
                setIsCollapsed(false);
                skyrimAudio.playMenuClick();
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-600/50 hover:border-amber-400 text-amber-200 cursor-pointer transition-colors"
              title="展開狀態欄 (快速鍵: H)"
            >
              <ChevronUp className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-[11px]">展開狀態欄 [H]</span>
            </button>
          </div>
        </div>
      ) : (
        /* Full Expanded HUD with dynamic zoom scale */
        <div className="bg-gradient-to-t from-black via-stone-950/95 to-transparent pt-3 pb-3 px-3 sm:px-8 md:px-12 backdrop-blur-xs border-t border-stone-800/30">
          {/* Top Mini Control Toolbar: Scale, Bar Width, Minimize */}
          <div className="max-w-6xl mx-auto flex items-center justify-between text-[11px] font-cinzel text-stone-400 mb-1 px-1">
            {/* Scale Adjuster Tools */}
            <div className="flex items-center gap-2">
              <span className="text-stone-500 hidden sm:inline">HUD 縮放比例：</span>
              <div className="flex items-center gap-1 bg-stone-900/80 border border-stone-800 rounded px-1 py-0.5">
                <button
                  id="hud-zoom-out-btn"
                  onClick={() => setHudScale(prev => Math.max(0.65, +(prev - 0.05).toFixed(2)))}
                  className="p-1 hover:text-amber-300 transition-colors cursor-pointer"
                  title="縮小 HUD 狀態欄 (-)"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>

                <span className="w-10 text-center font-bold text-amber-200 text-[10px]">
                  {Math.round(hudScale * 100)}%
                </span>

                <button
                  id="hud-zoom-in-btn"
                  onClick={() => setHudScale(prev => Math.min(1.35, +(prev + 0.05).toFixed(2)))}
                  className="p-1 hover:text-amber-300 transition-colors cursor-pointer"
                  title="放大 HUD 狀態欄 (+)"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="hidden sm:flex items-center gap-1">
                {[
                  { label: '75%', value: 0.75 },
                  { label: '100%', value: 1.0 },
                  { label: '120%', value: 1.2 }
                ].map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setHudScale(preset.value);
                      skyrimAudio.playMenuClick();
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                      hudScale === preset.value
                        ? 'bg-amber-950/70 text-amber-300 border-amber-600/60 font-bold'
                        : 'bg-stone-900/60 text-stone-500 border-stone-800 hover:text-stone-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Width Scaling Mode Toggle */}
              <div className="hidden md:flex items-center gap-1 ml-2 border-l border-stone-800 pl-2">
                <span className="text-stone-500 text-[10px]">寬度自適應:</span>
                {(['compact', 'standard', 'wide', 'fluid'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => {
                      setBarWidthMode(mode);
                      skyrimAudio.playMenuClick();
                    }}
                    className={`px-1.5 py-0.5 rounded text-[9px] uppercase border transition-colors cursor-pointer ${
                      barWidthMode === mode
                        ? 'bg-amber-950/70 text-amber-300 border-amber-600/60'
                        : 'bg-stone-900/60 text-stone-500 border-stone-800 hover:text-stone-300'
                    }`}
                  >
                    {mode === 'compact' ? '緊湊' : mode === 'standard' ? '標準' : mode === 'wide' ? '加寬' : '延展'}
                  </button>
                ))}
              </div>
            </div>

            {/* Collapse HUD & Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                id="collapse-hud-btn"
                onClick={() => {
                  setIsCollapsed(true);
                  skyrimAudio.playMenuClick();
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-amber-200 cursor-pointer transition-colors text-[10px]"
                title="收起狀態欄 (快速鍵: H)"
              >
                <ChevronDown className="w-3 h-3" />
                <span>收起狀態欄 [H]</span>
              </button>
            </div>
          </div>

          {/* Scalable Container */}
          <div 
            className="max-w-6xl mx-auto flex flex-col items-center transition-transform duration-200 ease-out origin-bottom"
            style={{ transform: `scale(${hudScale})` }}
          >
            {/* Immersive UI Triad Layout: Magicka (Left), Level (Center), Health & Stamina (Right) */}
            <div className="w-full flex flex-col md:flex-row justify-between items-center md:items-end gap-3 md:gap-6 pb-2">
              {/* Left: MAGICKA (Skyrim Azure Blue) */}
              <div className={`flex flex-col items-start ${getBarWidthClass()}`}>
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="hud-label skyrim-font !text-sky-300 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-sky-400" />
                    <span>經驗</span>
                  </span>
                  <span className="text-[10px] font-cinzel text-sky-300/80 font-medium">
                    {magicka} / {maxMagicka}
                  </span>
                </div>
                <div className="hud-bar-container w-full">
                  <div 
                    className="h-full bg-[#3d5a9c] transition-all duration-500" 
                    style={{ 
                      width: `${magickaPercent}%`, 
                      boxShadow: '0 0 10px rgba(61, 90, 156, 0.5)' 
                    }} 
                  />
                </div>
              </div>

              {/* Center: LEVEL BADGE (Gold #d4af37 with accent line) */}
              <div className="flex flex-col items-center my-1 md:my-0 md:mb-1 shrink-0">
                <span className="skyrim-font text-lg sm:text-xl text-[#d4af37] font-bold tracking-widest drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]">
                  LEVEL 81
                </span>
                <div className="w-32 h-[1px] bg-[#d4af37] mt-1 opacity-50 shadow-[0_0_4px_rgba(212,175,55,0.5)]" />
                <span className="text-[10px] font-serif-tc text-stone-400 mt-0.5 tracking-wider">
                  末代龍裔 · DOVAHKIIN
                </span>
              </div>

              {/* Right: HEALTH & STAMINA (Stacked) */}
              <div className={`flex flex-col items-end gap-2 ${getBarWidthClass()}`}>
                {/* HEALTH (Crimson Red #8b0000) */}
                <div className="flex flex-col items-end w-full">
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-[10px] font-cinzel text-red-300/80 font-medium">
                      {health} / {maxHealth}
                    </span>
                    <span className="hud-label skyrim-font !text-red-300 font-semibold flex items-center gap-1">
                      <Heart className={`w-3 h-3 text-red-400 ${healthPercent < 40 ? 'animate-ping' : ''}`} />
                      <span>星圖</span>
                    </span>
                  </div>
                  <div className="hud-bar-container w-full">
                    <div 
                      className="h-full bg-[#8b0000] transition-all duration-500" 
                      style={{ 
                        width: `${healthPercent}%`, 
                        boxShadow: '0 0 10px rgba(139, 0, 0, 0.5)' 
                      }} 
                    />
                  </div>
                </div>

                {/* STAMINA (Forest Green #2e5a2e) */}
                <div className="flex flex-col items-end w-full">
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-[10px] font-cinzel text-emerald-300/80 font-medium">
                      {stamina} / {maxStamina}
                    </span>
                    <span className="hud-label skyrim-font !text-emerald-300 font-semibold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      <span>連續</span>
                    </span>
                  </div>
                  <div className="hud-bar-container w-full">
                    <div 
                      className="h-full bg-[#2e5a2e] transition-all duration-500" 
                      style={{ 
                        width: `${staminaPercent}%`, 
                        boxShadow: '0 0 10px rgba(46, 90, 46, 0.5)' 
                      }} 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom micro controls: Status Test & Hotkeys */}
            <div className="w-full flex flex-wrap items-center justify-between text-[10px] text-stone-500 mt-1 px-1 border-t border-stone-800/40 pt-1.5">
              <div className="hidden sm:flex items-center gap-2 font-cinzel">
                <span className="text-stone-400">SKYRIM HOTKEYS:</span>
                <span className="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-800 text-stone-400">[1-5] 介面切換</span>
                <span className="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-800 text-stone-400">[H] 收起/展開狀態欄</span>
                <span className="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-800 text-stone-400">[+/-] 縮放 HUD</span>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  id="test-drain-status-btn"
                  onClick={handleDrainTest}
                  className="text-[10px] font-cinzel px-2.5 py-1 rounded bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-800 cursor-pointer transition-colors"
                >
                  模擬戰鬥消耗
                </button>
                <button
                  id="test-restore-status-btn"
                  onClick={handleRestore}
                  className="text-[10px] font-cinzel px-2.5 py-1 rounded bg-[#2e1d15] hover:bg-[#3d261b] text-amber-200 border border-[#634d31] cursor-pointer transition-colors flex items-center gap-1 shadow-sm"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>全數充盈</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};

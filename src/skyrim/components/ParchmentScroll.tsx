import React, { useState } from 'react';
import { 
  Feather, 
  Sparkles, 
  BookOpen, 
  Flame, 
  RotateCcw, 
  Eye, 
  Sliders, 
  Copy, 
  Check, 
  Award,
  Scroll as ScrollIcon
} from 'lucide-react';
import { ANCIENT_SCROLLS, ScrollItem } from '../data/skyrimData';
import { skyrimAudio } from '../utils/audio';

export const ParchmentScroll: React.FC = () => {
  const [selectedScrollId, setSelectedScrollId] = useState<string>('prophecy');
  const [fontFamily, setFontFamily] = useState<'medieval' | 'cinzel' | 'uncial' | 'serif'>('medieval');
  const [paperAging, setPaperAging] = useState<'fresh' | 'aged' | 'ancient'>('aged');
  const [isRadiantMode, setIsRadiantMode] = useState<boolean>(true);
  const [isSealBroken, setIsSealBroken] = useState<boolean>(false);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customText, setCustomText] = useState<string>(
    '吾以龍裔之名立誓：守護天際省之冰原，驅逐黑暗湮滅之暴政。\n凡聞此號令者，皆當肅立，聆聽無上咆哮（Thu\'um）破曉之音！'
  );
  const [customTitle, setCustomTitle] = useState<string>('《龍裔誓言聖諭》');
  const [hoveredRune, setHoveredRune] = useState<{ rune: string; dovah: string; translation: string } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [replayKey, setReplayKey] = useState<number>(0);

  const activeScroll: ScrollItem = ANCIENT_SCROLLS.find(s => s.id === selectedScrollId) || ANCIENT_SCROLLS[0];

  const handleSelectScroll = (id: string) => {
    skyrimAudio.playParchmentRustle();
    setSelectedScrollId(id);
    setIsCustomMode(false);
    setReplayKey(prev => prev + 1);
  };

  const handleToggleSeal = () => {
    skyrimAudio.playMenuClick();
    setIsSealBroken(!isSealBroken);
  };

  const handleCopyText = () => {
    const textToCopy = isCustomMode 
      ? `${customTitle}\n\n${customText}`
      : `${activeScroll.title}\n${activeScroll.subtitle}\n\n${activeScroll.contentLines.join('\n')}\n\n[${activeScroll.notes}]`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    skyrimAudio.playEquip();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReplayAnimation = () => {
    skyrimAudio.playParchmentRustle();
    setReplayKey(prev => prev + 1);
  };

  // Font family class resolver
  const getFontClass = () => {
    switch (fontFamily) {
      case 'medieval': return 'font-medieval';
      case 'cinzel': return 'font-cinzel';
      case 'uncial': return 'font-uncial';
      case 'serif': return 'font-serif-tc';
      default: return 'font-serif-tc';
    }
  };

  // Aging paper styling resolver
  const getPaperClasses = () => {
    if (paperAging === 'fresh') {
      return 'bg-[#f7f2e5] text-[#2c1d11] shadow-[inset_0_0_40px_rgba(160,120,60,0.25)] border-[#8c673d]';
    }
    if (paperAging === 'ancient') {
      return 'bg-[#ded0b1] text-[#1c1109] shadow-[inset_0_0_90px_rgba(60,30,10,0.65),inset_0_0_20px_rgba(30,15,5,0.7)] border-[#4a2e16]';
    }
    // standard aged
    return 'parchment-texture text-[#24160c] border-[#6b4724]';
  };

  return (
    <section className="relative w-full py-8 px-3 sm:px-6 md:px-8 max-w-6xl mx-auto flex flex-col items-center">
      {/* Top Banner / Breadcrumb */}
      <div className="w-full flex flex-col items-center text-center mb-6">
        <div className="flex items-center gap-3 text-amber-500/80 mb-1">
          <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-amber-500/60" />
          <span className="font-cinzel text-xs tracking-widest uppercase">Tamriel Historical Manuscripts</span>
          <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-amber-500/60" />
        </div>
        <h2 className="font-cinzel-dec text-2xl sm:text-3xl md:text-4xl text-amber-100 tracking-wider font-bold drop-shadow-[0_2px_12px_rgba(245,158,11,0.3)]">
          仿古皮質遠古羊皮紙捲軸
        </h2>
        <p className="font-marcellus text-stone-400 text-xs sm:text-sm mt-1.5 max-w-2xl">
          典藏帝國歷史殘篇、屠龍賞金令與奧術典籍，蘊含動態水墨滲透渲染與諾德古龍語符文光輝。
        </p>
      </div>

      {/* Control Strip: Manuscripts & Scribe Switcher */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 mb-6 p-2.5 rounded-lg bg-stone-950/80 border border-stone-800 backdrop-blur-md">
        {/* Scroll picker buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {ANCIENT_SCROLLS.map(scroll => {
            const isSelected = !isCustomMode && selectedScrollId === scroll.id;
            return (
              <button
                key={scroll.id}
                id={`select-scroll-${scroll.id}`}
                onClick={() => handleSelectScroll(scroll.id)}
                className={`px-3 py-1.5 rounded text-xs font-cinzel tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-amber-950/90 text-amber-200 border border-amber-600/70 shadow-[0_0_10px_rgba(245,158,11,0.25)] font-bold'
                    : 'bg-stone-900/60 text-stone-400 border border-stone-800 hover:text-stone-200 hover:border-stone-700'
                }`}
              >
                <ScrollIcon className="w-3.5 h-3.5 text-amber-500/70" />
                <span>{scroll.title.split('·')[0].replace(/[《》]/g, '')}</span>
              </button>
            );
          })}

          {/* Custom Scribe Mode button */}
          <button
            id="scribe-mode-btn"
            onClick={() => {
              setIsCustomMode(true);
              skyrimAudio.playParchmentRustle();
              setReplayKey(prev => prev + 1);
            }}
            className={`px-3 py-1.5 rounded text-xs font-cinzel tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              isCustomMode
                ? 'bg-amber-950/90 text-amber-200 border border-amber-600/70 shadow-[0_0_10px_rgba(245,158,11,0.25)] font-bold'
                : 'bg-stone-900/60 text-stone-400 border border-stone-800 hover:text-stone-200 hover:border-stone-700'
            }`}
          >
            <Feather className="w-3.5 h-3.5 text-amber-400" />
            <span>自訂古墨撰寫</span>
          </button>
        </div>

        {/* Quick Action Tools: Font Selector, Aging, Radiance */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Font Type Selection */}
          <div className="flex items-center gap-1 px-2 py-1 bg-stone-900 rounded border border-stone-800 text-xs">
            <span className="text-stone-500 font-cinzel text-[10px]">字體:</span>
            <select
              id="font-select"
              value={fontFamily}
              onChange={(e) => {
                setFontFamily(e.target.value as 'medieval' | 'cinzel' | 'uncial' | 'serif');
                skyrimAudio.playMenuClick();
              }}
              aria-label="選擇字體風格"
              className="bg-transparent text-amber-200 text-xs font-cinzel focus:outline-none cursor-pointer"
            >
              <option value="medieval" className="bg-stone-900 text-stone-200">中世紀手抄 Medieval</option>
              <option value="cinzel" className="bg-stone-900 text-stone-200">帝國古典 Cinzel</option>
              <option value="uncial" className="bg-stone-900 text-stone-200">遠古安色爾 Uncial</option>
              <option value="serif" className="bg-stone-900 text-stone-200">諾德碑銘體 Noto Serif</option>
            </select>
          </div>

          {/* Aging Selector */}
          <div className="flex items-center gap-1 px-2 py-1 bg-stone-900 rounded border border-stone-800 text-xs">
            <Sliders className="w-3 h-3 text-stone-500" />
            <span className="text-stone-500 font-cinzel text-[10px]">年代:</span>
            <select
              id="aging-select"
              value={paperAging}
              onChange={(e) => {
                setPaperAging(e.target.value as 'fresh' | 'aged' | 'ancient');
                skyrimAudio.playMenuClick();
              }}
              aria-label="選擇羊皮紙年代"
              className="bg-transparent text-amber-200 text-xs font-cinzel focus:outline-none cursor-pointer"
            >
              <option value="fresh" className="bg-stone-900 text-stone-200">近世羊皮 (Fresh)</option>
              <option value="aged" className="bg-stone-900 text-stone-200">百年典籍 (Aged)</option>
              <option value="ancient" className="bg-stone-900 text-stone-200">千年古卷 (Ancient)</option>
            </select>
          </div>

          {/* Radiance / Rune Glow Toggle */}
          <button
            id="toggle-radiance-btn"
            onClick={() => {
              setIsRadiantMode(!isRadiantMode);
              skyrimAudio.playArcaneChime();
            }}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 border transition-colors cursor-pointer ${
              isRadiantMode
                ? 'bg-amber-900/40 text-amber-300 border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-300'
            }`}
            title="開啟/關閉古文字動態符文金光效果"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span className="font-cinzel text-[11px]">符文靈光</span>
          </button>

          {/* Replay ink animation */}
          <button
            id="replay-ink-btn"
            onClick={handleReplayAnimation}
            className="p-1.5 rounded bg-stone-900 text-stone-400 border border-stone-800 hover:text-amber-300 hover:border-amber-600 transition-colors cursor-pointer"
            title="重新渲染手書水墨滲透動態"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Copy decree */}
          <button
            id="copy-decree-btn"
            onClick={handleCopyText}
            className="p-1.5 rounded bg-stone-900 text-stone-400 border border-stone-800 hover:text-amber-300 hover:border-amber-600 transition-colors cursor-pointer"
            title="複製卷軸文本"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Scribe's Desk Input Area (When Custom Mode is Active) */}
      {isCustomMode && (
        <div className="w-full mb-6 p-4 rounded-lg bg-stone-950/90 border border-amber-800/40 backdrop-blur-md">
          <div className="flex items-center gap-2 mb-3">
            <Feather className="w-4 h-4 text-amber-400" />
            <h3 className="font-cinzel text-sm text-amber-200 tracking-wider font-semibold">天際宮廷抄寫員書案 · 自由敕令撰寫</h3>
            <span className="text-xs text-stone-500 font-marcellus">(輸入任意文字即可即時轉化為古法羊皮紙墨筆動態)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label htmlFor="custom-title-input" className="block text-xs font-cinzel text-stone-400 mb-1">卷軸題名：</label>
              <input
                id="custom-title-input"
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="例如：《至高王赦免令》"
                className="w-full px-3 py-2 rounded bg-stone-900 border border-stone-800 text-amber-100 font-cinzel text-sm focus:outline-none focus:border-amber-500/80"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="custom-content-input" className="block text-xs font-cinzel text-stone-400 mb-1">正文敕令 (支援換行)：</label>
              <textarea
                id="custom-content-input"
                rows={3}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="書寫你的天際誓言、公會委託或龍吼箴言..."
                className="w-full px-3 py-2 rounded bg-stone-900 border border-stone-800 text-amber-100 font-serif-tc text-sm focus:outline-none focus:border-amber-500/80 resize-y"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* THE VINTAGE LEATHER PARCHMENT SCROLL ARTIFACT CONTAINER */}
      {/* ========================================================= */}
      <div className="relative w-full max-w-4xl transition-all duration-500 select-text">
        {/* Left Vertical Scroll Roller from Immersive UI Theme */}
        <div className="hidden sm:block scroll-roller" style={{ left: '-16px' }}>
          <div className="scroll-roller-top" />
          <div className="scroll-roller-bottom" />
        </div>

        {/* Right Vertical Scroll Roller from Immersive UI Theme */}
        <div className="hidden sm:block scroll-roller" style={{ right: '-16px' }}>
          <div className="scroll-roller-top" />
          <div className="scroll-roller-bottom" />
        </div>

        {/* External Leather Wrap Casing Outer Shadow & Knotwork */}
        <div className="relative rounded-2xl p-3 sm:p-5 md:p-7 leather-bound-texture border-2 border-[#54301d] shadow-[0_25px_60px_rgba(0,0,0,0.95)]">
          {/* Leather perimeter stitching lines */}
          <div className="absolute inset-1.5 sm:inset-2.5 rounded-xl border border-dashed border-[#8d5e38]/40 pointer-events-none" />
          <div className="absolute inset-2 sm:inset-3 rounded-lg border border-amber-900/30 pointer-events-none" />

          {/* 4 Corner Antique Brass Brackets / Rivets */}
          <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-amber-500/70 rounded-tl pointer-events-none flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-600/90 shadow-[0_0_4px_rgba(245,158,11,0.8)]" />
          </div>
          <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-amber-500/70 rounded-tr pointer-events-none flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-600/90 shadow-[0_0_4px_rgba(245,158,11,0.8)]" />
          </div>
          <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-amber-500/70 rounded-bl pointer-events-none flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-600/90 shadow-[0_0_4px_rgba(245,158,11,0.8)]" />
          </div>
          <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-amber-500/70 rounded-br pointer-events-none flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-600/90 shadow-[0_0_4px_rgba(245,158,11,0.8)]" />
          </div>

          {/* TOP WOODEN SCROLL SPINDLE / ROLLER */}
          <div className="relative w-full h-8 sm:h-10 mb-2 flex items-center justify-between px-2 sm:px-6">
            {/* Left Turned Brass Finial Knob */}
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-amber-300 via-amber-700 to-amber-950 border border-amber-400 shadow-[0_3px_8px_rgba(0,0,0,0.8)] flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-200/60" />
            </div>

            {/* Wooden Dowel Shaft with Grain & Brass Rings */}
            <div className="flex-1 mx-2 h-4 sm:h-5 rounded-full bg-gradient-to-r from-amber-950 via-[#3d2112] to-amber-950 border-y border-amber-600/40 relative shadow-inner overflow-hidden flex items-center justify-around">
              {/* Decorative brass bands on rod */}
              <div className="w-1 h-full bg-amber-400/70" />
              <div className="w-1 h-full bg-amber-400/70" />
              <div className="w-1 h-full bg-amber-400/70" />
              <div className="w-1 h-full bg-amber-400/70" />
              {/* Highlight gleam */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
            </div>

            {/* Right Turned Brass Finial Knob */}
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-amber-300 via-amber-700 to-amber-950 border border-amber-400 shadow-[0_3px_8px_rgba(0,0,0,0.8)] flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-200/60" />
            </div>
          </div>

          {/* ======================================== */}
          {/* THE PARCHMENT PAPER SHEET CORE */}
          {/* ======================================== */}
          <div 
            key={replayKey}
            className={`parchment-container relative w-full rounded-sm py-6 sm:py-10 px-4 sm:px-10 md:px-14 border transition-all duration-700 parchment-burnt-edge ${getPaperClasses()}`}
          >
            {/* Torn / Burnt edges visual accents (SVG filters & masks) */}
            <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-amber-950/20 to-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-amber-950/30 to-transparent pointer-events-none" />

            {/* Faint Background Nordic Watermark Dragon & Celtic Knotwork */}
            <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none overflow-hidden">
              <svg viewBox="0 0 200 200" className="w-96 h-96 fill-current text-stone-900">
                <path d="M100 10 C60 10, 20 40, 20 90 C20 130, 60 170, 100 190 C140 170, 180 130, 180 90 C180 40, 140 10, 100 10 Z M100 30 C130 30, 160 55, 160 95 C160 125, 130 155, 100 170 C70 155, 40 125, 40 95 C40 55, 70 30, 100 30 Z" />
                <polygon points="100,50 120,90 100,140 80,90" />
              </svg>
            </div>

            {/* Runic Margin Calligraphy on Left & Right Margins */}
            <div className="hidden lg:flex absolute left-3 top-16 bottom-16 flex-col items-center justify-between text-amber-900/30 font-uncial text-xs select-none pointer-events-none">
              <span>ᚠ</span><span>ᚢ</span><span>ᚦ</span><span>ᚨ</span><span>ᚱ</span><span>ᚲ</span><span>ᚷ</span><span>ᚹ</span>
            </div>
            <div className="hidden lg:flex absolute right-3 top-16 bottom-16 flex-col items-center justify-between text-amber-900/30 font-uncial text-xs select-none pointer-events-none">
              <span>ᚺ</span><span>ᚾ</span><span>ᛁ</span><span>ᛃ</span><span>ᛇ</span><span>ᛈ</span><span>ᛉ</span><span>ᛋ</span>
            </div>

            {/* Scroll Header: Dovahzul Ancient Runic Inscription Banner */}
            <div className="w-full flex flex-col items-center mb-6 text-center">
              <div className="flex items-center gap-3 w-full max-w-lg mb-2">
                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-amber-900/60 to-transparent" />
                <span className="text-xs sm:text-sm font-uncial tracking-widest text-amber-900/80 px-2 select-none">
                  {isCustomMode ? 'ᛞᛟᚹᚨᚺᚲᛁᛁᚾ · ᛏᚺᚢᚢᛗ' : (activeScroll.runicHeader)}
                </span>
                <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-amber-900/60 to-transparent" />
              </div>

              {/* Title with dynamic medieval typography & Immersive UI header styling */}
              <h1 
                className={`text-center text-2xl sm:text-3xl md:text-4xl font-serif text-[#4a3b2a] mb-3 border-b-2 border-[#4a3b2a] pb-3 font-bold ${getFontClass()} ${isRadiantMode ? 'drop-shadow-[0_1px_3px_rgba(180,83,9,0.3)]' : ''}`}
                style={{ letterSpacing: '2px' }}
              >
                {isCustomMode ? customTitle : activeScroll.title}
              </h1>

              {/* Subtitle / Imperial Cataloging */}
              <p className="font-cinzel text-xs sm:text-sm tracking-wider text-[#5a4a3a] font-medium">
                {isCustomMode ? '第四紀元 · 龍裔親筆御筆手卷' : activeScroll.subtitle}
              </p>

              {/* Date & Scribe Attribution */}
              <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] font-marcellus text-amber-950/70 mt-1 italic">
                <span>{isCustomMode ? '紀元 201 年 · 天際風暴前夕' : activeScroll.date}</span>
                <span>•</span>
                <span>{isCustomMode ? '撰者：末代龍裔 (Last Dragonborn)' : activeScroll.author}</span>
              </div>
            </div>

            {/* Thin Decorative Divider */}
            <div className="w-full flex items-center justify-center gap-3 my-4 opacity-70">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-amber-900/50" />
              <div className="w-2 h-2 rotate-45 border border-amber-900/70 bg-amber-800/20" />
              <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-amber-900/50" />
            </div>

            {/* ==================================================== */}
            {/* MANUSCRIPT BODY CONTENT WITH DYNAMIC INKING ANIMATION */}
            {/* ==================================================== */}
            <div className="relative my-6 space-y-4">
              {/* Custom Mode Body */}
              {isCustomMode ? (
                <div className="animate-ink-bleed">
                  <div className="float-left mr-3 mb-1 w-12 h-12 rounded border-2 border-amber-900/60 bg-amber-900/10 flex items-center justify-center text-amber-950 font-cinzel-dec text-3xl font-bold shadow-inner">
                    {customText.trim().charAt(0) || '吾'}
                  </div>
                  <p className={`text-base sm:text-lg leading-relaxed whitespace-pre-line ${getFontClass()}`}>
                    {customText.trim().slice(1) || '在此書寫你的敕令...'}
                  </p>
                </div>
              ) : (
                /* Historical Scroll Body */
                <div className="space-y-3.5">
                  {/* First paragraph with illuminated drop-cap */}
                  {activeScroll.contentLines.length > 0 && (
                    <div className="animate-ink-bleed">
                      {/* Illuminated Drop Cap */}
                      <div className="float-left mr-3.5 mb-1 w-12 h-12 sm:w-14 sm:h-14 rounded border-2 border-amber-800/80 bg-gradient-to-br from-amber-800/15 via-amber-900/25 to-amber-950/20 flex items-center justify-center text-amber-950 font-cinzel-dec text-3xl sm:text-4xl font-black shadow-[inset_0_1px_3px_rgba(255,255,255,0.4),0_2px_5px_rgba(0,0,0,0.2)]">
                        <span className="drop-shadow-[0_1px_2px_rgba(245,158,11,0.5)]">
                          {activeScroll.illuminatedLetter}
                        </span>
                      </div>
                      <p className={`text-base sm:text-lg leading-relaxed text-[#2a170c] ${getFontClass()}`}>
                        {activeScroll.contentLines[0].slice(activeScroll.illuminatedLetter.length)}
                      </p>
                    </div>
                  )}

                  {/* Remaining lines with staggered ink bleed */}
                  {activeScroll.contentLines.slice(1).map((line, idx) => (
                    line === '' ? (
                      <div key={idx} className="h-2" />
                    ) : (
                      <p 
                        key={idx}
                        className={`text-base sm:text-lg leading-relaxed text-[#2a170c] animate-ink-bleed ${getFontClass()} ${
                          line.startsWith('「') || line.startsWith('【') ? 'font-semibold text-amber-950' : ''
                        }`}
                        style={{ animationDelay: `${(idx + 1) * 0.12}s` }}
                      >
                        {line}
                      </p>
                    )
                  ))}
                </div>
              )}
            </div>

            {/* Translation & Annotations Tag Cloud (If Available) */}
            {!isCustomMode && activeScroll.translationNotes && (
              <div className="mt-8 pt-4 border-t border-amber-900/30">
                <div className="flex items-center gap-2 mb-2 text-xs font-cinzel text-amber-950/80 font-bold uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                  <span>卷軸符文邊註考證 (Dovahzul Glosses - 點擊或懸停探索字義)：</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeScroll.translationNotes.map((note, i) => (
                    <div
                      key={i}
                      onMouseEnter={() => {
                        setHoveredRune(note);
                        skyrimAudio.playMenuClick();
                      }}
                      onMouseLeave={() => setHoveredRune(null)}
                      className="group relative flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-900/10 border border-amber-900/30 hover:bg-amber-900/20 hover:border-amber-700 transition-all cursor-pointer"
                    >
                      <span className="font-uncial text-amber-900 text-sm font-bold">{note.rune}</span>
                      <span className="font-cinzel text-xs font-semibold text-amber-950">{note.dovah}</span>
                      <span className="text-[11px] font-serif-tc text-stone-700 group-hover:text-stone-900">
                        ({note.translation})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hovered Rune Dynamic Floating Insight Card */}
            {hoveredRune && (
              <div className="mt-3 p-3 rounded bg-stone-950/90 text-amber-100 border border-amber-500/70 shadow-2xl flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-amber-950/80 border border-amber-500/80 flex items-center justify-center font-uncial text-xl text-amber-300">
                    {hoveredRune.rune}
                  </div>
                  <div>
                    <div className="font-cinzel text-sm font-bold text-amber-300">
                      諾德古龍語：{hoveredRune.dovah}
                    </div>
                    <div className="font-serif-tc text-xs text-stone-300">
                      天際省通譯：{hoveredRune.translation}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-cinzel text-amber-400/80 uppercase px-2 py-0.5 rounded bg-amber-950/60 border border-amber-700/50">
                  Dovah Word
                </span>
              </div>
            )}

            {/* Bottom Seal & Historical Footnote */}
            <div className="mt-8 pt-4 border-t border-amber-900/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs font-marcellus text-amber-950/70 italic max-w-md text-center sm:text-left">
                {isCustomMode ? '＊此卷軸以古法羊皮與雪漫城鐵膽墨水鐫刻，永久收錄於天際檔案庫。' : `＊典籍附註：${activeScroll.notes}`}
              </p>

              {/* ========================================= */}
              {/* INTERACTIVE IMPERIAL / DRAGON WAX SEAL */}
              {/* ========================================= */}
              <button
                id="interactive-wax-seal"
                onClick={handleToggleSeal}
                className="group relative flex items-center gap-2 cursor-pointer focus:outline-none"
                title="點擊印鑑驗證其完整性"
              >
                {/* Wax Stamp Seal Graphic */}
                <div 
                  className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.6),inset_0_2px_4px_rgba(255,255,255,0.3)] transition-transform duration-300 group-hover:scale-105 ${
                    isSealBroken
                      ? 'bg-[#5c1c14] border-2 border-dashed border-[#8a2a1e]'
                      : 'bg-gradient-to-br from-[#a32215] via-[#85190e] to-[#4f0c05] border-2 border-[#b82e1e]'
                  }`}
                >
                  {/* Wax drip edges */}
                  <div className="absolute -inset-1 rounded-full border border-amber-900/30 opacity-60 pointer-events-none" />

                  {/* Stamp Emblem: Skyrim Dragonborn Crest */}
                  <div className="text-amber-200/90 flex flex-col items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-8 h-8 fill-current drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {/* Skyrim Imperial Dragon Silhouette */}
                      <path d="M50 15 L56 32 L75 32 L60 45 L65 65 L50 52 L35 65 L40 45 L25 32 L44 32 Z" />
                      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="6 3" />
                    </svg>
                  </div>

                  {/* Broken seal slash if broke */}
                  {isSealBroken && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-full h-1 bg-amber-950 rotate-45 shadow" />
                    </div>
                  )}
                </div>

                <div className="flex flex-col text-left">
                  <span className="font-cinzel text-xs font-bold text-amber-950">
                    {isSealBroken ? '【印信已啟】' : '【龍裔封蠟禦印】'}
                  </span>
                  <span className="text-[10px] font-marcellus text-amber-900/80">
                    {isSealBroken ? 'Seal Broken' : 'Intact Imperial Seal'}
                  </span>
                </div>
              </button>
            </div>

            {/* Immersive UI Parchment Footer Note */}
            <div className="mt-6 pt-4 border-t border-black/10 text-[#5a4a3a] italic text-center font-serif text-xs sm:text-sm">
              Select a quest or manuscript to view objective details · 天際古籍銘刻錄
            </div>
          </div>

          {/* BOTTOM WOODEN SCROLL SPINDLE / ROLLER */}
          <div className="relative w-full h-8 sm:h-10 mt-2 flex items-center justify-between px-2 sm:px-6">
            {/* Left Turned Brass Finial Knob */}
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-amber-300 via-amber-700 to-amber-950 border border-amber-400 shadow-[0_3px_8px_rgba(0,0,0,0.8)] flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-200/60" />
            </div>

            {/* Wooden Dowel Shaft with Grain & Brass Rings */}
            <div className="flex-1 mx-2 h-4 sm:h-5 rounded-full bg-gradient-to-r from-amber-950 via-[#3d2112] to-amber-950 border-y border-amber-600/40 relative shadow-inner overflow-hidden flex items-center justify-around">
              <div className="w-1 h-full bg-amber-400/70" />
              <div className="w-1 h-full bg-amber-400/70" />
              <div className="w-1 h-full bg-amber-400/70" />
              <div className="w-1 h-full bg-amber-400/70" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
            </div>

            {/* Right Turned Brass Finial Knob */}
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-amber-300 via-amber-700 to-amber-950 border border-amber-400 shadow-[0_3px_8px_rgba(0,0,0,0.8)] flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-200/60" />
            </div>
          </div>

          {/* Leather hanging tie ribbons hanging below */}
          <div className="w-full flex justify-around px-12 -mb-2 pointer-events-none">
            <div className="w-3 h-8 bg-gradient-to-b from-[#2b1810] to-[#1a0e09] border-x border-[#4d2c1c] rounded-b shadow" />
            <div className="w-3 h-10 bg-gradient-to-b from-[#2b1810] to-[#1a0e09] border-x border-[#4d2c1c] rounded-b shadow" />
          </div>
        </div>
      </div>
    </section>
  );
};

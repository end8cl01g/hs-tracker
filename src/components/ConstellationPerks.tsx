import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Award,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Zap,
  Info,
  CheckCircle2,
  Lock,
  Plus,
  Minus,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { SkillDefinition, PerkNode, CharacterStats } from '../types';
import { INITIAL_SKILLS } from '../data/skyrimData';
import { rustEngine } from '../services/rustBridge';
import { skyrimAudio } from '../services/audioService';

interface ConstellationPerksProps {
  character: CharacterStats;
  onUpdateCharacter: (updater: (prev: CharacterStats) => CharacterStats) => void;
  onShowNotification: (title: string, subtitle: string) => void;
}

export const ConstellationPerks: React.FC<ConstellationPerksProps> = ({
  character,
  onUpdateCharacter,
  onShowNotification,
}) => {
  const [selectedSkillIndex, setSelectedSkillIndex] = useState<number>(0);
  const [selectedPerk, setSelectedPerk] = useState<PerkNode | null>(null);
  const [schoolFilter, setSchoolFilter] = useState<'all' | 'combat' | 'magic' | 'stealth'>('all');
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const skills = INITIAL_SKILLS.filter(
    (s) => schoolFilter === 'all' || s.school === schoolFilter
  );

  const currentSkill: SkillDefinition = skills[selectedSkillIndex] || skills[0] || INITIAL_SKILLS[0];
  const currentSkillLevel = character.skills[currentSkill.id] || 15;
  const isLegendary = (character.legendarySkills[currentSkill.id] || 0) > 0;
  const legendaryCount = character.legendarySkills[currentSkill.id] || 0;

  // Change selected skill
  const handlePrevSkill = () => {
    skyrimAudio.playTabSwitch();
    setSelectedPerk(null);
    setSelectedSkillIndex((prev) => (prev > 0 ? prev - 1 : skills.length - 1));
  };

  const handleNextSkill = () => {
    skyrimAudio.playTabSwitch();
    setSelectedPerk(null);
    setSelectedSkillIndex((prev) => (prev < skills.length - 1 ? prev + 1 : 0));
  };

  // Adjust skill level
  const handleAdjustSkillLevel = (delta: number) => {
    const newLvl = Math.max(15, Math.min(100, currentSkillLevel + delta));
    if (newLvl === currentSkillLevel) return;

    skyrimAudio.playCheckbox();
    onUpdateCharacter((prev) => {
      const updatedSkills = { ...prev.skills, [currentSkill.id]: newLvl };
      // Recalculate character level from all skills via Rust Wasm
      const levelCalc = rustEngine.calculateCharacterLevel(updatedSkills);
      const levelGained = levelCalc.level > prev.level;

      if (levelGained) {
        skyrimAudio.playLevelUp();
        onShowNotification('LEVEL UP!', `角色已晉升至等級 ${levelCalc.level}！獲得天賦點數！`);
      }

      return {
        ...prev,
        skills: updatedSkills,
        level: levelCalc.level,
        currentXp: levelCalc.currentXp,
        requiredXp: levelCalc.requiredXp,
        perkPoints: levelGained ? prev.perkPoints + (levelCalc.level - prev.level) : prev.perkPoints,
      };
    });
  };

  // Trigger Legendary reset
  const handleMakeLegendary = () => {
    if (currentSkillLevel < 100) return;

    // Count unlocked perks in this skill
    const skillPerkIds = currentSkill.perks.map((p) => p.id);
    const investedPerks = character.unlockedPerks.filter((id) => skillPerkIds.includes(id));
    const refundedPoints = rustEngine.calculateLegendaryRefund(investedPerks.length);

    skyrimAudio.playLevelUp();
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#d4af37', '#60a5fa', '#f59e0b'],
    });

    onUpdateCharacter((prev) => ({
      ...prev,
      skills: {
        ...prev.skills,
        [currentSkill.id]: 15,
      },
      legendarySkills: {
        ...prev.legendarySkills,
        [currentSkill.id]: (prev.legendarySkills[currentSkill.id] || 0) + 1,
      },
      perkPoints: prev.perkPoints + refundedPoints,
      unlockedPerks: prev.unlockedPerks.filter((id) => !skillPerkIds.includes(id)),
    }));

    onShowNotification(
      'SKILL LEGENDARY!',
      `${currentSkill.name} 已晉升傳奇！重置為 15 級並返還 ${refundedPoints} 點天賦！`
    );
  };

  // Unlock Perk action
  const handleUnlockPerk = (perk: PerkNode) => {
    // Validate prerequisites
    const prereqsMet =
      perk.prerequisites.length === 0 ||
      perk.prerequisites.every((pid) => character.unlockedPerks.includes(pid));

    // Rust Wasm validation
    const canUnlock = rustEngine.validatePerkFast(
      currentSkillLevel,
      perk.requiredSkillLevel,
      prereqsMet,
      character.perkPoints
    );

    if (!canUnlock) {
      skyrimAudio.playCheckbox();
      return;
    }

    // Sound & particles
    skyrimAudio.playPerkUnlock();
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.5 },
      colors: ['#67e8f9', '#38bdf8', '#fbbf24'],
    });

    onUpdateCharacter((prev) => ({
      ...prev,
      perkPoints: prev.perkPoints - 1,
      unlockedPerks: [...prev.unlockedPerks, perk.id],
    }));

    onShowNotification('PERK UNLOCKED', `星位點亮：${perk.name} (${perk.nameEn})`);
  };

  // Touch & Mouse Drag handlers for celestial navigation
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="relative w-full h-[calc(100vh-130px)] flex flex-col bg-[#050505] overflow-hidden select-none">
      {/* Top Skill Category & Switcher Bar */}
      <div className="flex-none bg-[#000]/60 border-b border-[#333] px-3 py-2 z-20 backdrop-blur-md">
        {/* School Filters */}
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto mb-2">
          <div className="flex items-center gap-1 bg-[#111] p-0.5 rounded border border-[#333] text-xs">
            {(['all', 'combat', 'magic', 'stealth'] as const).map((school) => (
              <button
                key={school}
                onClick={() => {
                  skyrimAudio.playCheckbox();
                  setSchoolFilter(school);
                  setSelectedSkillIndex(0);
                  setSelectedPerk(null);
                }}
                className={`px-2.5 py-1 rounded transition-colors uppercase font-medium text-[10px] tracking-[0.1em] min-h-[34px] ${
                  schoolFilter === school
                    ? 'bg-[#c4a000] text-black font-bold shadow-[0_0_8px_rgba(196,160,0,0.5)]'
                    : 'text-[#e0e0e0] opacity-60 hover:opacity-100'
                }`}
              >
                {school === 'all'
                  ? 'ALL'
                  : school === 'combat'
                  ? 'WARRIOR'
                  : school === 'magic'
                  ? 'MAGE'
                  : 'THIEF'}
              </button>
            ))}
          </div>

          {/* Reset Zoom Button */}
          <button
            onClick={resetView}
            className="p-1.5 rounded bg-[#111] border border-[#333] text-[#e0e0e0] opacity-80 hover:opacity-100 text-xs flex items-center gap-1"
            title="重設星盤視角"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#c4a000]" />
            <span className="hidden sm:inline text-[10px] tracking-wider uppercase">RESET VIEW</span>
          </button>
        </div>

        {/* Current Skill Header with Arrows */}
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button
            id="btn-prev-skill"
            onClick={handlePrevSkill}
            className="p-2 rounded-full hover:bg-[#1a1a1a] text-[#888] hover:text-[#fff] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-serif font-medium tracking-[0.15em] text-[#fff]">
                {currentSkill.name}
              </span>
              <span className="text-[11px] text-[#c4a000] tracking-[0.2em] uppercase font-light">
                {currentSkill.nameEn}
              </span>
              {isLegendary && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-[#c4a000]/10 border border-[#c4a000]/60 text-[#c4a000] text-[9px] font-bold">
                  <Award className="w-3 h-3 text-[#c4a000]" />
                  <span>LEGENDARY {legendaryCount > 1 ? `x${legendaryCount}` : ''}</span>
                </span>
              )}
            </div>

            {/* Skill Level and Quick +/- Adjuster */}
            <div className="flex items-center gap-2.5 mt-1">
              <button
                onClick={() => handleAdjustSkillLevel(-1)}
                disabled={currentSkillLevel <= 15}
                className="w-6 h-6 rounded bg-[#111] border border-[#333] text-[#888] hover:text-white flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
              >
                <Minus className="w-3 h-3" />
              </button>

              <div className="flex items-center gap-1.5 font-serif">
                <span className="text-xs text-[#888] tracking-widest uppercase">LEVEL</span>
                <span className="text-sm font-bold text-[#c4a000]">{currentSkillLevel}</span>
                <span className="text-xs text-[#555]">/ 100</span>
              </div>

              <button
                onClick={() => handleAdjustSkillLevel(1)}
                disabled={currentSkillLevel >= 100}
                className="w-6 h-6 rounded bg-[#111] border border-[#333] text-[#888] hover:text-white flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
              >
                <Plus className="w-3 h-3" />
              </button>

              {/* Legendary Button when skill is 100 */}
              {currentSkillLevel >= 100 && (
                <button
                  onClick={handleMakeLegendary}
                  className="px-2.5 py-0.5 ml-2 bg-[#c4a000] hover:bg-[#d4af37] text-black font-bold text-[9px] tracking-wider uppercase rounded shadow-[0_0_8px_#c4a000] animate-pulse"
                >
                  MAKE LEGENDARY
                </button>
              )}
            </div>
          </div>

          <button
            id="btn-next-skill"
            onClick={handleNextSkill}
            className="p-2 rounded-full hover:bg-[#1a1a1a] text-[#888] hover:text-[#fff] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Interactive Constellation Star Sky Canvas */}
      <div
        className="relative flex-1 w-full overflow-hidden cursor-grab active:cursor-grabbing skyrim-smoke-bg"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Subtle Watermark Skill Name & Level */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 select-none">
          <div className="text-center">
            <h2 className="text-5xl sm:text-7xl font-light tracking-[0.5em] text-white opacity-10 uppercase font-serif">
              {currentSkill.nameEn}
            </h2>
            <p className="text-xs tracking-[0.8em] text-[#c4a000] opacity-40 mt-4 uppercase font-serif">
              LEVEL {currentSkillLevel}
            </p>
          </div>
        </div>

        {/* Ambient Starlight Background Dots */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#72ffff_1px,transparent_1px)] [background-size:32px_32px]"></div>

        {/* Constellation SVG Viewport */}
        <svg
          className="w-full h-full relative z-10"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Glow filter for constellation lines */}
            <filter id="starGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <radialGradient id="unlockedStarGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#72ffff" />
              <stop offset="100%" stopColor="#00b4d8" />
            </radialGradient>
            <radialGradient id="availableStarGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#c4a000" />
              <stop offset="100%" stopColor="#856b00" />
            </radialGradient>
          </defs>

          {/* 1. Constellation Connection Lines */}
          {currentSkill.perks.map((perk) =>
            perk.prerequisites.map((prereqId) => {
              const parentPerk = currentSkill.perks.find((p) => p.id === prereqId);
              if (!parentPerk) return null;

              const isParentUnlocked = character.unlockedPerks.includes(parentPerk.id);
              const isChildUnlocked = character.unlockedPerks.includes(perk.id);
              const isChildAvailable =
                isParentUnlocked &&
                currentSkillLevel >= perk.requiredSkillLevel &&
                !isChildUnlocked;

              const lineStroke =
                isParentUnlocked && isChildUnlocked
                  ? '#72ffff'
                  : isChildAvailable
                  ? '#c4a000'
                  : '#333333';

              const strokeWidth = isParentUnlocked && isChildUnlocked ? '0.9' : '0.5';

              return (
                <g key={`${parentPerk.id}-${perk.id}`}>
                  <line
                    x1={parentPerk.x}
                    y1={parentPerk.y}
                    x2={perk.x}
                    y2={perk.y}
                    stroke={lineStroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={
                      isParentUnlocked && isChildUnlocked
                        ? '4 2'
                        : isChildAvailable
                        ? '3 2'
                        : 'none'
                    }
                    filter={isParentUnlocked && isChildUnlocked ? 'url(#starGlow)' : 'none'}
                    opacity={isParentUnlocked && isChildUnlocked ? 0.95 : isChildAvailable ? 0.8 : 0.4}
                  />
                  {/* Flowing starlight energy particles on unlocked lines */}
                  {isParentUnlocked && isChildUnlocked && (
                    <circle
                      r="0.7"
                      fill="#72ffff"
                      opacity="0.9"
                    >
                      <animateMotion
                        path={`M ${parentPerk.x} ${parentPerk.y} L ${perk.x} ${perk.y}`}
                        dur="2.8s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                </g>
              );
            })
          )}

          {/* 2. Constellation Star Nodes */}
          {currentSkill.perks.map((perk) => {
            const isUnlocked = character.unlockedPerks.includes(perk.id);
            const prereqsMet =
              perk.prerequisites.length === 0 ||
              perk.prerequisites.every((pid) => character.unlockedPerks.includes(pid));
            const isAvailable =
              !isUnlocked && prereqsMet && currentSkillLevel >= perk.requiredSkillLevel;
            const isSelected = selectedPerk?.id === perk.id;

            return (
              <g
                key={perk.id}
                transform={`translate(${perk.x}, ${perk.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  skyrimAudio.playCheckbox();
                  setSelectedPerk(perk);
                }}
                className="cursor-pointer"
              >
                {/* Selected Halo ring */}
                {isSelected && (
                  <circle
                    r="4.5"
                    fill="none"
                    stroke="#c4a000"
                    strokeWidth="0.5"
                    strokeDasharray="1, 1"
                    className="animate-spin"
                  />
                )}

                {/* Star Outer Glow */}
                {isUnlocked ? (
                  <circle
                    r="3.5"
                    fill="#72ffff"
                    opacity="0.35"
                    className="animate-pulse"
                  />
                ) : isAvailable ? (
                  <circle
                    r="3"
                    fill="#c4a000"
                    opacity="0.35"
                    className="animate-pulse"
                  />
                ) : null}

                {/* Core Star Body */}
                <circle
                  r={isUnlocked ? '2.1' : isAvailable ? '1.8' : '1.3'}
                  fill={
                    isUnlocked
                      ? 'url(#unlockedStarGrad)'
                      : isAvailable
                      ? 'url(#availableStarGrad)'
                      : '#333333'
                  }
                  stroke={isUnlocked ? '#72ffff' : isAvailable ? '#c4a000' : '#444444'}
                  strokeWidth="0.4"
                />

                {/* Perk Title Label in Constellation */}
                <text
                  x="0"
                  y={perk.y > 80 ? '-3' : '3.8'}
                  textAnchor="middle"
                  fontSize="2.1"
                  fill={isUnlocked ? '#72ffff' : isAvailable ? '#c4a000' : '#666666'}
                  fontWeight={isUnlocked || isAvailable ? 'bold' : 'normal'}
                  className="pointer-events-none tracking-wider select-none font-serif"
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}
                >
                  {perk.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Constellation Hint overlay */}
        <div className="absolute top-3 left-3 pointer-events-none text-[9px] tracking-widest text-[#72ffff] opacity-80 bg-black/60 px-2.5 py-1 rounded border border-[#333] font-sans">
          TOUCH NODE TO VIEW PERK • DRAG TO EXPLORE
        </div>
      </div>

      {/* Selected Perk Detail Sheet (Professional Polish Card) */}
      {selectedPerk && (
        <div className="flex-none bg-[#0a0a0a]/95 border-t sm:border border-[#333] p-4 z-20 backdrop-blur-xl sm:rounded-lg sm:max-w-md sm:fixed sm:bottom-20 sm:right-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
          <div className="max-w-lg mx-auto">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#c4a000] font-serif">
                  SKILL PERK DETAILS
                </h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-base font-bold text-white tracking-wider font-serif">
                    {selectedPerk.name}
                  </h3>
                  <span className="text-xs text-[#888] uppercase font-light">
                    ({selectedPerk.nameEn})
                  </span>
                  {character.unlockedPerks.includes(selectedPerk.id) ? (
                    <span className="flex items-center gap-1 text-[9px] text-[#72ffff] bg-[#72ffff]/10 px-1.5 py-0.2 rounded border border-[#72ffff]/40 font-mono">
                      <CheckCircle2 className="w-3 h-3" />
                      UNLOCKED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] text-[#c4a000] bg-[#c4a000]/10 px-1.5 py-0.2 rounded border border-[#c4a000]/40 font-mono">
                      <Lock className="w-3 h-3" />
                      LOCKED
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedPerk(null)}
                className="text-[#888] hover:text-white text-[11px] px-2 py-1 rounded bg-[#111] border border-[#333]"
              >
                ✕
              </button>
            </div>

            {/* Lore and Effect */}
            <p className="text-xs text-[#e0e0e0] font-serif italic opacity-85 leading-relaxed mb-3 bg-[#111]/60 p-2.5 rounded border border-[#222]">
              {selectedPerk.description}
            </p>

            {/* Prerequisites requirement indicator */}
            {selectedPerk.prerequisites.length > 0 && (
              <div className="text-[10px] tracking-wider text-[#888] mb-3 flex items-center gap-1.5 flex-wrap">
                <span className="uppercase opacity-60">PREREQUISITE:</span>
                {selectedPerk.prerequisites.map((pid) => {
                  const parent = currentSkill.perks.find((p) => p.id === pid);
                  const isParentUnlocked = character.unlockedPerks.includes(pid);
                  return (
                    <span
                      key={pid}
                      className={`px-1.5 py-0.2 rounded text-[9px] border font-mono ${
                        isParentUnlocked
                          ? 'bg-[#72ffff]/10 text-[#72ffff] border-[#72ffff]/40'
                          : 'bg-red-950/40 text-red-400 border-red-800/40'
                      }`}
                    >
                      {parent?.name || pid} {isParentUnlocked ? '✓' : '✗'}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Requirement Row */}
            <div className="flex justify-between items-center text-[10px] tracking-widest pt-2 border-t border-[#222] mb-3">
              <span className="opacity-40 uppercase">REQUIREMENT</span>
              <span className="text-[#72ffff] font-mono">
                {currentSkill.nameEn.toUpperCase()} {selectedPerk.requiredSkillLevel}
              </span>
            </div>

            {/* Action Unlock Button */}
            {!character.unlockedPerks.includes(selectedPerk.id) && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-[10px] text-[#888] tracking-wider uppercase">
                  PERK POINTS: <strong className="text-[#c4a000]">{character.perkPoints}</strong>
                </div>

                <button
                  id="btn-unlock-perk"
                  onClick={() => handleUnlockPerk(selectedPerk)}
                  disabled={
                    character.perkPoints < 1 ||
                    currentSkillLevel < selectedPerk.requiredSkillLevel ||
                    (selectedPerk.prerequisites.length > 0 &&
                      !selectedPerk.prerequisites.every((pid) =>
                        character.unlockedPerks.includes(pid)
                      ))
                  }
                  className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#c4a000] hover:bg-[#d4af37] text-black font-bold text-xs tracking-widest uppercase shadow-[0_0_12px_rgba(196,160,0,0.4)] disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>UNLOCK PERK (1 PT)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { Sparkles, Star, Shield, Flame, Wand2, Swords, Hammer, Target, EyeOff, Check, Lock, RefreshCw, Info, Search, AlertCircle, ChevronRight, Zap } from 'lucide-react';
import { skyrimAudio } from '../utils/audio';
import { SKYRIM_SKILL_TREES as DATA_TREES, SkyrimSkillTree, SkyrimPerk, GuardianStone } from '../data/skyrimPerksData';

export const SkyrimSkills: React.FC<{ trees?: SkyrimSkillTree[]; perkPoints?: number; initialUnlocked?: Record<string, boolean> }> = ({
  trees, perkPoints: initialPoints, initialUnlocked,
}) => {
  // prop 覆蓋常數：星圖內容與「哪些星已亮」由 App（本機 DB）決定，元件不再自帶一套真值
  const SKYRIM_SKILL_TREES = trees || DATA_TREES;
  // Available perk points
  const [perkPoints, setPerkPoints] = useState<number>(initialPoints ?? 6);
  
  // Selected Guardian Archetype
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianStone>('warrior');

  // Selected Skill Tree
  const [selectedSkillId, setSelectedSkillId] = useState<string>('one_handed');

  // Unlocked perks state: Map perkId -> boolean
  const [unlockedPerks, setUnlockedPerks] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    SKYRIM_SKILL_TREES.forEach(skill => {
      skill.perks.forEach(perk => {
        initial[perk.id] = perk.isUnlockedDefault ?? false;
      });
    });
    return initial;
  });

  // Selected Perk Node for detail card
  const activeSkillTree = SKYRIM_SKILL_TREES.find(s => s.id === selectedSkillId) || SKYRIM_SKILL_TREES[0];
  const [selectedPerkId, setSelectedPerkId] = useState<string>(activeSkillTree.perks[0].id);

  // Search keyword filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Interactive feedback banner state
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'warning' | 'info' } | null>({
    text: '歡迎來到天際天賦星盤。點擊星宿可查看說明，點擊「投入天賦點數」即可點亮以太群星。',
    type: 'info'
  });

  // Temporarily highlighted perk node (e.g. for prerequisite warning)
  const [highlightedPerkId, setHighlightedPerkId] = useState<string | null>(null);

  // Find currently selected perk object
  const selectedPerk = activeSkillTree.perks.find(p => p.id === selectedPerkId) || activeSkillTree.perks[0];

  // Switch skill
  const handleSelectSkill = (skill: SkyrimSkillTree) => {
    setSelectedSkillId(skill.id);
    setSelectedGuardian(skill.category);
    setSelectedPerkId(skill.perks[0].id);
    setFeedbackMessage({
      text: `已切換至【${skill.name}】（${skill.nameEn}）天賦星盤。`,
      type: 'info'
    });
    skyrimAudio.playMenuClick();
  };

  // Switch Guardian Stone Archetype
  const handleSelectGuardian = (guardian: GuardianStone) => {
    setSelectedGuardian(guardian);
    const firstOfGuardian = SKYRIM_SKILL_TREES.find(s => s.category === guardian);
    if (firstOfGuardian) {
      setSelectedSkillId(firstOfGuardian.id);
      setSelectedPerkId(firstOfGuardian.perks[0].id);
    }
    skyrimAudio.playMenuClick();
  };

  // Helper to find prerequisite perk object
  const getPrerequisitePerk = (perk: SkyrimPerk): SkyrimPerk | undefined => {
    if (!perk.prerequisite) return undefined;
    return activeSkillTree.perks.find(p => p.id === perk.prerequisite);
  };

  // Helper: check if perk can be directly unlocked
  const canUnlockDirectly = (perk: SkyrimPerk): boolean => {
    if (unlockedPerks[perk.id]) return false;
    if (!perk.prerequisite) return true;
    return !!unlockedPerks[perk.prerequisite];
  };

  // Helper: find all missing prerequisites in chain
  const getMissingPrereqChain = (perk: SkyrimPerk): SkyrimPerk[] => {
    const missing: SkyrimPerk[] = [];
    let currPrereqId = perk.prerequisite;
    while (currPrereqId) {
      const prereq = activeSkillTree.perks.find(p => p.id === currPrereqId);
      if (!prereq) break;
      if (!unlockedPerks[prereq.id]) {
        missing.unshift(prereq); // add to front so roots come first
        currPrereqId = prereq.prerequisite;
      } else {
        break;
      }
    }
    return missing;
  };

  // Select Perk Star
  const handleSelectPerk = (perk: SkyrimPerk) => {
    if (selectedPerkId === perk.id) {
      // If already selected, double clicking or clicking again triggers invest/refund!
      handleInvestPerk(perk);
    } else {
      setSelectedPerkId(perk.id);
      skyrimAudio.playArcaneChime();
    }
  };

  // Primary Action: Invest Perk Point
  const handleInvestPerk = (perk: SkyrimPerk) => {
    const isCurrentlyUnlocked = !!unlockedPerks[perk.id];

    if (isCurrentlyUnlocked) {
      setFeedbackMessage({
        text: `【${perk.name}】已完全點亮。若想重新分配點數，請點擊「收回天賦點數」。`,
        type: 'info'
      });
      skyrimAudio.playMenuClick();
      return;
    }

    // Check if player has points
    if (perkPoints <= 0) {
      setFeedbackMessage({
        text: `天賦點數不足！請點擊右上角「+1」天賦點數按鈕，或點擊「洗點重置」重新分配。`,
        type: 'warning'
      });
      skyrimAudio.playMenuClick();
      return;
    }

    // Check prerequisite
    if (perk.prerequisite && !unlockedPerks[perk.prerequisite]) {
      const prereq = getPrerequisitePerk(perk);
      const prereqName = prereq ? prereq.name : perk.prerequisite;
      
      // Flash the prerequisite node in amber
      setHighlightedPerkId(perk.prerequisite);
      setTimeout(() => setHighlightedPerkId(null), 2500);

      setFeedbackMessage({
        text: `無法直接解鎖【${perk.name}】：必須先點亮前置天賦星宿【${prereqName}】！`,
        type: 'warning'
      });
      skyrimAudio.playMenuClick();
      return;
    }

    // Successful unlock!
    setUnlockedPerks(prev => ({ ...prev, [perk.id]: true }));
    setPerkPoints(prev => prev - 1);
    setFeedbackMessage({
      text: `★ 璀璨星辰點亮！成功習得天賦：【${perk.name}】（${perk.ranks}）！`,
      type: 'success'
    });
    skyrimAudio.playArcaneChime();
  };

  // Chain Unlock: Unlock perk and all missing prerequisites
  const handleChainUnlock = (perk: SkyrimPerk) => {
    const missingChain = getMissingPrereqChain(perk);
    const totalNeeded = missingChain.length + 1; // missing chain + this perk

    if (perkPoints < totalNeeded) {
      setFeedbackMessage({
        text: `天賦點數不足以連鎖點亮！需要 ${totalNeeded} 點天賦點數，目前僅有 ${perkPoints} 點。`,
        type: 'warning'
      });
      skyrimAudio.playMenuClick();
      return;
    }

    const updated = { ...unlockedPerks };
    missingChain.forEach(p => {
      updated[p.id] = true;
    });
    updated[perk.id] = true;

    setUnlockedPerks(updated);
    setPerkPoints(prev => prev - totalNeeded);
    setFeedbackMessage({
      text: `★ 奧術共鳴！連鎖點亮了 ${missingChain.map(p => p.name).join(' ➔ ')} ➔ 【${perk.name}】！`,
      type: 'success'
    });
    skyrimAudio.playArcaneChime();
  };

  // Refund Single Perk Point
  const handleRefundPerk = (perk: SkyrimPerk) => {
    // Check if any other unlocked perk depends on this one
    const dependentPerk = activeSkillTree.perks.find(
      p => p.prerequisite === perk.id && unlockedPerks[p.id]
    );

    if (dependentPerk) {
      setFeedbackMessage({
        text: `無法收回點數：後續已點亮天賦【${dependentPerk.name}】依賴此星宿，請先收回後續天賦！`,
        type: 'warning'
      });
      skyrimAudio.playMenuClick();
      return;
    }

    setUnlockedPerks(prev => ({ ...prev, [perk.id]: false }));
    setPerkPoints(prev => prev + 1);
    setFeedbackMessage({
      text: `已收回天賦點數：【${perk.name}】歸還 1 點天賦點數。`,
      type: 'info'
    });
    skyrimAudio.playMenuClick();
  };

  // Reset entire active skill tree
  const handleResetTree = () => {
    let refundedCount = 0;
    const updated = { ...unlockedPerks };
    activeSkillTree.perks.forEach(perk => {
      if (updated[perk.id]) {
        refundedCount++;
        updated[perk.id] = false;
      }
    });

    if (refundedCount === 0) {
      setFeedbackMessage({
        text: `此技能樹尚未投入任何天賦點數。`,
        type: 'info'
      });
      return;
    }

    setUnlockedPerks(updated);
    setPerkPoints(prev => prev + refundedCount);
    setFeedbackMessage({
      text: `【${activeSkillTree.name}】天賦樹已全數洗點重置，共收回 ${refundedCount} 點天賦點數！`,
      type: 'success'
    });
    skyrimAudio.playEquip();
  };

  // Helper to get skill icon
  const getSkillIcon = (iconName: string) => {
    switch (iconName) {
      case 'Flame': return <Flame className="w-4 h-4" />;
      case 'EyeOff': return <EyeOff className="w-4 h-4" />;
      case 'Hammer': return <Hammer className="w-4 h-4" />;
      case 'Wand2': return <Wand2 className="w-4 h-4" />;
      case 'Target': return <Target className="w-4 h-4" />;
      case 'Sword':
      default: return <Swords className="w-4 h-4" />;
    }
  };

  // Filter skills matching search query
  const matchingPerks = searchQuery.trim() === '' ? [] : 
    SKYRIM_SKILL_TREES.flatMap(tree => 
      tree.perks.filter(p => 
        p.name.includes(searchQuery) || 
        p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.description.includes(searchQuery)
      ).map(p => ({ perk: p, tree }))
    );

  // Selected perk status calculation
  const isSelectedUnlocked = !!unlockedPerks[selectedPerk.id];
  const prereqPerk = getPrerequisitePerk(selectedPerk);
  const isPrereqMet = !selectedPerk.prerequisite || !!unlockedPerks[selectedPerk.prerequisite];
  const missingChain = getMissingPrereqChain(selectedPerk);
  const chainCost = missingChain.length + 1;

  return (
    <section className="relative w-full py-6 px-3 sm:px-6 md:px-8 max-w-6xl mx-auto flex flex-col items-center">
      {/* Title & Lore Banner */}
      <div className="w-full flex flex-col items-center text-center mb-5">
        <div className="flex items-center gap-3 text-amber-500/80 mb-1">
          <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-amber-500/60" />
          <span className="font-cinzel text-xs tracking-widest uppercase">The Elder Scrolls V · Skills & Perks</span>
          <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-amber-500/60" />
        </div>
        <h2 className="font-cinzel-dec text-2xl sm:text-3xl md:text-4xl text-amber-100 tracking-wider font-bold drop-shadow-[0_2px_12px_rgba(245,158,11,0.3)]">
          以太蒼穹 · 技能天賦星盤
        </h2>
        <p className="font-marcellus text-stone-400 text-xs sm:text-sm mt-1 max-w-2xl">
          參考《上古卷軸 V：天際》官方技能天賦星盤。仰望以太群星守護座，每一顆點亮的天賦星宿皆能賦予龍裔超凡之能。
        </p>
      </div>

      {/* Control Bar: Guardian Stone Tabs & Available Perk Points */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 mb-4 p-2.5 rounded-xl bg-stone-950/80 border border-stone-800 backdrop-blur-md shadow-lg">
        {/* Guardian Archetype Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {[
            { id: 'warrior', labelZh: '戰士座', labelEn: 'Warrior', color: 'text-amber-400', border: 'border-amber-500/60' },
            { id: 'mage', labelZh: '法師座', labelEn: 'Mage', color: 'text-sky-400', border: 'border-sky-500/60' },
            { id: 'thief', labelZh: '盜賊座', labelEn: 'Thief', color: 'text-emerald-400', border: 'border-emerald-500/60' }
          ].map(guardian => (
            <button
              key={guardian.id}
              id={`guardian-tab-${guardian.id}`}
              onClick={() => handleSelectGuardian(guardian.id as GuardianStone)}
              className={`px-3 py-1.5 rounded-lg text-xs font-cinzel transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedGuardian === guardian.id
                  ? `bg-stone-900 ${guardian.color} font-bold border ${guardian.border} shadow-[0_0_10px_rgba(0,0,0,0.8)]`
                  : 'text-stone-400 hover:text-stone-200 border border-transparent'
              }`}
            >
              <Star className="w-3 h-3" />
              <span>{guardian.labelZh} ({guardian.labelEn})</span>
            </button>
          ))}
        </div>

        {/* Available Perk Points Status Badge & Quick Add */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-500/60 text-amber-200 text-xs font-cinzel shadow-sm">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="font-semibold">可用天賦點數：</span>
            <span className="font-bold text-amber-300 text-base">{perkPoints}</span>
            <div className="flex items-center gap-1 ml-1">
              <button
                id="add-perk-point-btn"
                onClick={() => {
                  setPerkPoints(prev => prev + 1);
                  setFeedbackMessage({ text: '天賦點數 +1！請選擇想點亮的星宿。', type: 'success' });
                  skyrimAudio.playArcaneChime();
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-amber-800/80 hover:bg-amber-700 text-white font-bold cursor-pointer transition-colors shadow-sm"
                title="增加 1 點天賦點數"
              >
                +1 點
              </button>
              <button
                onClick={() => {
                  setPerkPoints(prev => prev + 5);
                  setFeedbackMessage({ text: '天賦點數 +5！隨心所欲構築龍裔天賦流派。', type: 'success' });
                  skyrimAudio.playArcaneChime();
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-200 border border-amber-500/40 font-bold cursor-pointer transition-colors"
                title="增加 5 點天賦點數"
              >
                +5 點
              </button>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="搜尋天賦 (斬首、15倍、衝擊)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 sm:w-48 px-2 py-1.5 pl-7 rounded-lg bg-stone-900 border border-stone-700 text-stone-200 text-xs placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-all font-cinzel"
            />
            <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Search results dropdown if searching */}
      {matchingPerks.length > 0 && (
        <div className="w-full mb-4 p-3 rounded-xl bg-stone-950/95 border border-amber-500/40 shadow-2xl z-30 max-h-52 overflow-y-auto">
          <span className="text-[11px] font-cinzel text-amber-400/90 font-bold block mb-1">
            搜尋結果 ({matchingPerks.length} 項匹配)：
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {matchingPerks.map(({ perk, tree }) => (
              <button
                key={perk.id}
                onClick={() => {
                  handleSelectSkill(tree);
                  setSelectedPerkId(perk.id);
                  setSearchQuery('');
                }}
                className="text-left p-2 rounded-lg bg-stone-900/80 hover:bg-stone-800 border border-stone-800 hover:border-amber-500/50 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-cinzel text-amber-200 font-bold">{perk.name}</span>
                  <span className="text-[10px] text-stone-400">{tree.name}</span>
                </div>
                <p className="text-[10px] text-stone-400 line-clamp-1 mt-0.5">{perk.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Skill Tabs Selector in Selected Archetype */}
      <div className="w-full flex items-center gap-2 overflow-x-auto pb-2 mb-3 scrollbar-thin">
        {SKYRIM_SKILL_TREES.filter(s => s.category === selectedGuardian).map(skill => {
          const isSelected = skill.id === selectedSkillId;
          const unlockedCount = skill.perks.filter(p => unlockedPerks[p.id]).length;
          return (
            <button
              key={skill.id}
              id={`skill-tab-${skill.id}`}
              onClick={() => handleSelectSkill(skill)}
              className={`px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2.5 whitespace-nowrap shrink-0 border ${
                isSelected
                  ? 'bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 border-amber-500/80 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                  : 'bg-stone-950/60 border-stone-800/80 text-stone-400 hover:text-stone-200 hover:bg-stone-900/60'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-amber-950/80 text-amber-300' : 'bg-stone-900 text-stone-500'}`}>
                {getSkillIcon(skill.iconName)}
              </div>
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-2">
                  <span className="font-cinzel text-xs font-bold">{skill.name}</span>
                  <span className="text-[10px] font-cinzel text-amber-400">LV {skill.level}</span>
                </div>
                <span className="text-[10px] font-marcellus text-stone-500">
                  已點亮 {unlockedCount} / {skill.perks.length} 天賦
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Dynamic Feedback / Alert Notification Bar */}
      {feedbackMessage && (
        <div 
          className={`w-full mb-3 px-4 py-2.5 rounded-xl border flex items-center justify-between text-xs font-cinzel shadow-md transition-all duration-300 ${
            feedbackMessage.type === 'success'
              ? 'bg-amber-950/70 border-amber-500/60 text-amber-200'
              : feedbackMessage.type === 'warning'
              ? 'bg-red-950/70 border-red-500/60 text-red-200 animate-shake'
              : 'bg-stone-950/70 border-stone-800 text-stone-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            ) : feedbackMessage.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-stone-400 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>

          <span className="text-[10px] text-stone-500 uppercase tracking-widest hidden sm:inline-block">
            {activeSkillTree.nameEn} · AETHERIUS
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Authentic Skyrim Constellation Canvas Stage (Unobstructed View) */}
      {/* ========================================================================= */}
      <div className="relative w-full h-[460px] sm:h-[500px] md:h-[520px] rounded-2xl border-2 border-stone-800 bg-gradient-to-b from-[#05060d] via-[#090b16] to-[#030408] shadow-[0_25px_60px_rgba(0,0,0,0.95)] overflow-hidden select-none mb-4">
        {/* Starfield nebula backdrop & Aetherius cosmic clouds */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff20_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-60" />
        <div 
          className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-25 transition-all duration-700" 
          style={{ backgroundColor: activeSkillTree.constellationColor }}
        />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-900/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Floating Constellation Meta & Reset Controls */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 pointer-events-none">
          <div className="flex items-center gap-2.5 bg-stone-950/85 border border-stone-800/90 rounded-xl px-3.5 py-1.5 backdrop-blur-md shadow-md pointer-events-auto">
            <span className="text-xs font-cinzel font-bold tracking-wider text-amber-300">
              {activeSkillTree.nameEn.toUpperCase()} CONSTELLATION
            </span>
            <span className="text-stone-600">|</span>
            <span className="text-[11px] font-cinzel text-stone-300">
              技能等級: <strong className="text-amber-300">{activeSkillTree.level}</strong> / {activeSkillTree.maxLevel}
            </span>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={handleResetTree}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-950/85 hover:bg-stone-900 border border-stone-800 hover:border-amber-600/60 text-stone-300 hover:text-amber-200 text-xs font-cinzel transition-all cursor-pointer backdrop-blur-md shadow-sm"
              title="洗點重置此天賦樹所有點數"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>洗點重置 (Reset Tree)</span>
            </button>
          </div>
        </div>

        {/* Constellation Guide Hint Badge */}
        <div className="absolute top-14 left-4 z-20 pointer-events-none opacity-75">
          <span className="text-[10px] font-cinzel text-stone-400 px-2 py-0.5 rounded bg-stone-950/70 border border-stone-800">
            ★ 點選星辰查看說明 · 再次點擊或下方按鈕投入點數
          </span>
        </div>

        {/* SVG Constellation Interstellar Connecting Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            {/* Glowing filter */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {activeSkillTree.connections.map(([fromId, toId], idx) => {
            const fromNode = activeSkillTree.perks.find(p => p.id === fromId);
            const toNode = activeSkillTree.perks.find(p => p.id === toId);
            if (!fromNode || !toNode) return null;

            const isBothUnlocked = !!unlockedPerks[fromId] && !!unlockedPerks[toId];
            const isPathAvailable = !!unlockedPerks[fromId] && !unlockedPerks[toId];

            return (
              <g key={`conn-${idx}`}>
                {/* Outer halo line for unlocked path */}
                {isBothUnlocked && (
                  <line
                    x1={`${fromNode.x}%`}
                    y1={`${fromNode.y}%`}
                    x2={`${toNode.x}%`}
                    y2={`${toNode.y}%`}
                    stroke={activeSkillTree.constellationColor}
                    strokeWidth="4"
                    strokeOpacity="0.45"
                    filter="url(#glow)"
                  />
                )}

                {/* Core line */}
                <line
                  x1={`${fromNode.x}%`}
                  y1={`${fromNode.y}%`}
                  x2={`${toNode.x}%`}
                  y2={`${toNode.y}%`}
                  stroke={
                    isBothUnlocked 
                      ? activeSkillTree.constellationColor 
                      : isPathAvailable 
                      ? '#f59e0b' 
                      : 'rgba(255, 255, 255, 0.25)'
                  }
                  strokeWidth={isBothUnlocked ? '2.5' : isPathAvailable ? '1.5' : '1'}
                  strokeDasharray={isBothUnlocked ? undefined : isPathAvailable ? '5 4' : '4 4'}
                  strokeOpacity={isBothUnlocked ? 0.95 : isPathAvailable ? 0.65 : 0.3}
                />
              </g>
            );
          })}
        </svg>

        {/* Constellation Perk Star Nodes */}
        {activeSkillTree.perks.map(perk => {
          const isSelected = selectedPerkId === perk.id;
          const isUnlocked = !!unlockedPerks[perk.id];
          const hasPrereq = !perk.prerequisite || !!unlockedPerks[perk.prerequisite];
          const canUnlock = !isUnlocked && hasPrereq && perkPoints > 0;
          const isHighlighted = highlightedPerkId === perk.id;

          return (
            <div
              key={perk.id}
              id={`perk-star-${perk.id}`}
              onClick={() => handleSelectPerk(perk)}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group flex flex-col items-center z-10 transition-transform duration-200 hover:scale-115"
              style={{ left: `${perk.x}%`, top: `${perk.y}%` }}
              title={`${perk.name} (${perk.ranks})${isUnlocked ? ' - 已點亮' : canUnlock ? ' - 可點擊投入點數' : ''}`}
            >
              {/* Star Node Core with layered glow */}
              <div className="relative flex items-center justify-center">
                {/* Outer halo ripple if selected */}
                {isSelected && (
                  <div 
                    className="absolute w-12 h-12 rounded-full animate-ping opacity-50 pointer-events-none"
                    style={{ backgroundColor: activeSkillTree.constellationColor }}
                  />
                )}

                {/* Warning pulse if highlighted */}
                {isHighlighted && (
                  <div className="absolute w-14 h-14 rounded-full bg-amber-500 animate-ping opacity-80 pointer-events-none" />
                )}

                {/* Secondary halo if unlocked */}
                {isUnlocked && (
                  <div 
                    className="absolute w-10 h-10 rounded-full opacity-60 blur-[3px] pointer-events-none"
                    style={{ backgroundColor: activeSkillTree.constellationColor }}
                  />
                )}

                {/* Main Star Disk */}
                <div 
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-300 border ${
                    isSelected
                      ? 'bg-white text-black border-white shadow-[0_0_22px_rgba(255,255,255,0.95)] scale-120'
                      : isUnlocked
                      ? 'border-white/90 shadow-[0_0_14px_rgba(245,158,11,0.85)] text-black'
                      : canUnlock
                      ? 'bg-stone-900 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.6)] animate-pulse'
                      : 'bg-stone-950 border-stone-800 text-stone-600 hover:border-stone-600'
                  }`}
                  style={isUnlocked ? { backgroundColor: activeSkillTree.constellationColor } : {}}
                >
                  {isUnlocked ? (
                    <Check className="w-4 h-4 stroke-[3]" />
                  ) : canUnlock ? (
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  ) : (
                    <Lock className="w-3 h-3" />
                  )}
                </div>
              </div>

              {/* Star Label */}
              <span className={`mt-1 text-[10px] sm:text-[11px] font-cinzel tracking-wider px-2 py-0.5 rounded backdrop-blur-md transition-all whitespace-nowrap shadow-sm border ${
                isSelected
                  ? 'bg-stone-900/95 text-white border-white/80 font-bold scale-105'
                  : isUnlocked
                  ? 'bg-stone-950/85 text-amber-200 border-amber-500/50'
                  : canUnlock
                  ? 'bg-stone-950/85 text-amber-300/90 border-amber-500/40'
                  : 'bg-stone-950/70 text-stone-500 border-stone-800 group-hover:text-stone-300'
              }`}>
                {perk.name} ({perk.ranks})
              </span>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* Selected Perk Details & Altar Action Panel (Directly Below Canvas) */}
      {/* ========================================================================= */}
      <div 
        id="perk-inspector-panel"
        className="w-full p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950 border-2 border-stone-800 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
      >
        {/* Left Side: Lore, Badges, & Descriptions */}
        <div className="flex-1 text-left">
          {/* Metadata Badges Row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {/* Skill Req Badge */}
            <span className={`text-[10px] font-cinzel px-2.5 py-0.5 rounded-full border font-bold ${
              activeSkillTree.level >= selectedPerk.skillReq
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600/50'
                : 'bg-red-950/70 text-red-300 border-red-600/50'
            }`}>
              技能需求 (REQ)：{selectedPerk.skillReq}
            </span>

            {/* Ranks Badge */}
            <span className="text-[10px] font-cinzel px-2.5 py-0.5 rounded-full bg-stone-900 border border-stone-700 text-stone-300">
              階級階層：{selectedPerk.ranks}
            </span>

            {/* Prerequisite Check Badge */}
            {selectedPerk.prerequisite && (
              <button
                onClick={() => {
                  if (prereqPerk) {
                    setSelectedPerkId(prereqPerk.id);
                    setHighlightedPerkId(prereqPerk.id);
                    setTimeout(() => setHighlightedPerkId(null), 2000);
                  }
                }}
                className={`text-[10px] font-cinzel px-2.5 py-0.5 rounded-full border cursor-pointer transition-colors flex items-center gap-1 ${
                  isPrereqMet
                    ? 'bg-stone-900 text-stone-300 border-stone-700 hover:border-amber-500/50'
                    : 'bg-amber-950/70 text-amber-300 border-amber-600/60 hover:bg-amber-900/80 animate-pulse'
                }`}
                title="點擊前往前置天賦"
              >
                <span>前置天賦：{prereqPerk?.name || selectedPerk.prerequisite}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}

            {/* Status Pill */}
            {isSelectedUnlocked ? (
              <span className="text-[10px] font-cinzel text-amber-300 px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/60 font-bold flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>★ 已完全點亮 (UNLOCKED)</span>
              </span>
            ) : canUnlockDirectly(selectedPerk) ? (
              <span className="text-[10px] font-cinzel text-emerald-300 px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/50 font-bold flex items-center gap-1 animate-pulse">
                <Star className="w-3 h-3 fill-emerald-400" />
                <span>可直接點亮 (READY)</span>
              </span>
            ) : (
              <span className="text-[10px] font-cinzel text-stone-400 px-2.5 py-0.5 rounded-full bg-stone-900 border border-stone-800 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>未達前置條件 (LOCKED)</span>
              </span>
            )}
          </div>

          {/* Perk Name & Original English Title */}
          <div className="flex items-baseline gap-2.5">
            <h3 className="font-cinzel text-xl sm:text-2xl text-amber-100 font-bold tracking-wide">
              {selectedPerk.name}
            </h3>
            <span className="font-cinzel text-xs sm:text-sm text-stone-400 italic">
              {selectedPerk.nameEn}
            </span>
          </div>

          {/* Lore & Mechanism Description */}
          <p className="font-serif-tc text-xs sm:text-sm text-stone-200 mt-1.5 leading-relaxed max-w-3xl">
            {selectedPerk.description}
          </p>
          <p className="font-marcellus text-xs text-stone-400 mt-1 italic">
            "{selectedPerk.descriptionEn}"
          </p>
        </div>

        {/* Right Side: Action Buttons Station */}
        <div className="shrink-0 flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2.5 w-full md:w-auto">
          {/* Main Invest / Refund Button */}
          {isSelectedUnlocked ? (
            <button
              id="refund-perk-btn"
              onClick={() => handleRefundPerk(selectedPerk)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-cinzel text-xs font-bold transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-amber-200 border border-amber-600/60 shadow-[0_0_12px_rgba(245,158,11,0.2)] hover:border-amber-400"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>收回天賦點數 (Refund +1)</span>
            </button>
          ) : (
            <button
              id="toggle-perk-btn"
              onClick={() => handleInvestPerk(selectedPerk)}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl font-cinzel text-xs font-bold transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 ${
                canUnlockDirectly(selectedPerk) && perkPoints > 0
                  ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-400 hover:to-amber-500 text-stone-950 border border-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.5)] scale-102 font-extrabold'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-700 hover:border-amber-500/60'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>投入天賦點數 (Invest Perk Point)</span>
            </button>
          )}

          {/* Secondary Action: Chain Unlock if missing prerequisites */}
          {!isSelectedUnlocked && !isPrereqMet && (
            <button
              onClick={() => handleChainUnlock(selectedPerk)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg font-cinzel text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1.5 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-500/50 shadow-sm"
              title={`同時點亮前置星宿與本天賦，共需 ${chainCost} 點天賦`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>連鎖點亮前置天賦 (消耗 {chainCost} 點)</span>
            </button>
          )}

          {/* If 0 perk points, quick shortcut */}
          {perkPoints <= 0 && !isSelectedUnlocked && (
            <button
              onClick={() => {
                setPerkPoints(prev => prev + 1);
                skyrimAudio.playArcaneChime();
              }}
              className="text-[10px] font-cinzel text-amber-400 underline hover:text-amber-300 cursor-pointer self-center md:self-end"
            >
              點數不足？點此立即 +1 天賦點數
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

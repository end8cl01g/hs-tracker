import React, { useState } from 'react';
import {
  ScrollText,
  CheckCircle,
  Circle,
  Plus,
  Compass,
  MapPin,
  Coins,
  Sparkles,
  Flame,
  Search,
  Filter,
  CheckCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Quest, QuestCategory, CharacterStats } from '../types';
import { skyrimAudio } from '../services/audioService';

interface QuestJournalProps {
  quests: Quest[];
  character: CharacterStats;
  onUpdateQuests: (updater: (prev: Quest[]) => Quest[]) => void;
  onUpdateCharacter: (updater: (prev: CharacterStats) => CharacterStats) => void;
  onShowNotification: (title: string, subtitle: string) => void;
}

export const QuestJournal: React.FC<QuestJournalProps> = ({
  quests,
  character,
  onUpdateQuests,
  onUpdateCharacter,
  onShowNotification,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedQuestId, setSelectedQuestId] = useState<string>(quests[0]?.id || '');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // New custom quest form state
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<QuestCategory>('custom');
  const [newLocation, setNewLocation] = useState('天際省 (Skyrim)');
  const [newDescription, setNewDescription] = useState('');
  const [newObjectives, setNewObjectives] = useState<string[]>(['']);
  const [newXp, setNewXp] = useState(300);
  const [newGold, setNewGold] = useState(150);

  // Filtered quests
  const filteredQuests = quests.filter((q) => {
    const matchesCategory =
      activeCategory === 'all'
        ? true
        : activeCategory === 'completed'
        ? q.completed
        : activeCategory === 'active'
        ? !q.completed && q.active
        : q.category === activeCategory;

    const matchesSearch =
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.location.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  const currentQuest = quests.find((q) => q.id === selectedQuestId) || filteredQuests[0];

  // Toggle Quest Objective Completed
  const handleToggleObjective = (questId: string, objectiveId: string) => {
    skyrimAudio.playCheckbox();

    onUpdateQuests((prev) =>
      prev.map((q) => {
        if (q.id !== questId) return q;

        const updatedObjectives = q.objectives.map((obj) =>
          obj.id === objectiveId ? { ...obj, completed: !obj.completed } : obj
        );

        // Check if all non-optional objectives are now complete
        const allCompleted = updatedObjectives
          .filter((obj) => !obj.optional)
          .every((obj) => obj.completed);

        const newlyCompleted = !q.completed && allCompleted;

        if (newlyCompleted) {
          skyrimAudio.playQuestComplete();
          confetti({
            particleCount: 70,
            spread: 80,
            origin: { y: 0.5 },
            colors: ['#d4af37', '#f59e0b', '#38bdf8'],
          });

          // Reward character XP, gold, dragon souls
          onUpdateCharacter((char) => ({
            ...char,
            gold: char.gold + (q.rewardGold || 0),
            dragonSouls: char.dragonSouls + (q.rewardDragonSouls || 0),
          }));

          onShowNotification(
            'QUEST COMPLETED',
            `任務完成：${q.title}！獲得 ${q.rewardGold || 0} 金幣！`
          );
        }

        return {
          ...q,
          objectives: updatedObjectives,
          completed: allCompleted,
        };
      })
    );
  };

  // Toggle Tracking on Compass
  const handleToggleActiveCompass = (questId: string) => {
    skyrimAudio.playCheckbox();
    onUpdateQuests((prev) =>
      prev.map((q) => (q.id === questId ? { ...q, active: !q.active } : q))
    );
  };

  // Add Custom Quest Submit
  const handleCreateCustomQuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const validObjs = newObjectives
      .filter((o) => o.trim().length > 0)
      .map((text, idx) => ({
        id: `custom_obj_${Date.now()}_${idx}`,
        text: text.trim(),
        completed: false,
      }));

    if (validObjs.length === 0) {
      validObjs.push({
        id: `custom_obj_${Date.now()}_0`,
        text: '完成任務目標',
        completed: false,
      });
    }

    const createdQuest: Quest = {
      id: `custom_quest_${Date.now()}`,
      title: newTitle.trim(),
      titleEn: 'Custom Quest',
      category: newCategory,
      location: newLocation.trim() || '天際省',
      description: newDescription.trim() || '龍裔立下的冒險誓言與目標。',
      active: true,
      completed: false,
      rewardXp: newXp,
      rewardGold: newGold,
      rewardDragonSouls: 0,
      custom: true,
      objectives: validObjs,
    };

    skyrimAudio.playLevelUp();
    onUpdateQuests((prev) => [createdQuest, ...prev]);
    setSelectedQuestId(createdQuest.id);
    setShowAddModal(false);
    onShowNotification('QUEST STARTED', `已加入新任務：${createdQuest.title}`);

    // Reset fields
    setNewTitle('');
    setNewDescription('');
    setNewObjectives(['']);
  };

  return (
    <div className="relative w-full h-[calc(100vh-130px)] flex flex-col bg-[#050505] overflow-hidden select-none">
      {/* Category Pills & Search */}
      <div className="flex-none bg-[#000]/60 border-b border-[#333] p-3 backdrop-blur-md z-10">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search quests, holds, dungeons..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#111] border border-[#333] rounded text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#c4a000] font-serif"
            />
          </div>

          {/* Add custom quest button */}
          <button
            id="btn-add-custom-quest"
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[#c4a000] hover:bg-[#d4af37] text-black font-bold text-xs uppercase tracking-widest shadow-[0_0_10px_rgba(196,160,0,0.3)] min-h-[36px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>NEW QUEST</span>
          </button>
        </div>

        {/* Categories scrollable row */}
        <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-none max-w-4xl mx-auto">
          {[
            { id: 'all', label: 'ALL QUESTS' },
            { id: 'main', label: 'MAIN' },
            { id: 'faction', label: 'FACTIONS' },
            { id: 'side', label: 'SIDE' },
            { id: 'misc', label: 'MISCELLANEOUS' },
            { id: 'custom', label: 'CUSTOM' },
            { id: 'completed', label: 'COMPLETED' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                skyrimAudio.playCheckbox();
                setActiveCategory(cat.id);
              }}
              className={`px-3 py-1 rounded text-[10px] tracking-widest uppercase font-medium whitespace-nowrap transition-colors min-h-[32px] ${
                activeCategory === cat.id
                  ? 'bg-[#c4a000] text-black font-bold shadow-[0_0_8px_rgba(196,160,0,0.4)]'
                  : 'bg-[#111] text-[#888] hover:text-white border border-[#333]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Journal Content: Split / responsive layout */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 max-w-5xl mx-auto w-full">
        {/* Left column: Quest list */}
        <div className="md:col-span-5 border-r border-[#222] overflow-y-auto p-3 space-y-2">
          {filteredQuests.length === 0 ? (
            <div className="text-center py-10 text-[#666] text-xs font-serif italic">
              No quests found matching your criteria.
            </div>
          ) : (
            filteredQuests.map((q) => {
              const isSelected = currentQuest?.id === q.id;
              const completedCount = q.objectives.filter((o) => o.completed).length;

              return (
                <div
                  key={q.id}
                  onClick={() => {
                    skyrimAudio.playTabSwitch();
                    setSelectedQuestId(q.id);
                  }}
                  className={`p-3 rounded border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#111] border-[#c4a000] shadow-[0_0_12px_rgba(196,160,0,0.15)]'
                      : 'bg-[#0a0a0a] border-[#222] hover:border-[#333]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      {/* Compass tracking diamond button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActiveCompass(q.id);
                        }}
                        className="mt-0.5 p-1 rounded hover:bg-[#1a1a1a]"
                        title={q.active ? 'Untrack on Compass' : 'Track on Compass'}
                      >
                        <div
                          className={`w-3.5 h-3.5 rotate-45 border flex items-center justify-center transition-all ${
                            q.active
                              ? 'border-[#72ffff] bg-[#72ffff]/20 shadow-[0_0_8px_#72ffff]'
                              : 'border-[#444] bg-transparent'
                          }`}
                        >
                          {q.active && <div className="w-1.5 h-1.5 bg-[#72ffff]"></div>}
                        </div>
                      </button>

                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4
                            className={`text-xs font-serif font-bold tracking-wide ${
                              q.completed
                                ? 'line-through text-[#555]'
                                : isSelected
                                ? 'text-white'
                                : 'text-[#d0d0d0]'
                            }`}
                          >
                            {q.title}
                          </h4>
                        </div>
                        <div className="text-[10px] text-[#777] mt-0.5 flex items-center gap-1 font-serif">
                          <MapPin className="w-2.5 h-2.5 text-[#c4a000]" />
                          <span>{q.location}</span>
                        </div>
                      </div>
                    </div>

                    {/* Completion progress pill */}
                    <div className="flex flex-col items-end">
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                          q.completed
                            ? 'bg-[#72ffff]/10 text-[#72ffff] border border-[#72ffff]/40'
                            : 'bg-[#161616] text-[#888]'
                        }`}
                      >
                        {completedCount}/{q.objectives.length}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right column: Selected Quest Detail view */}
        <div className="md:col-span-7 overflow-y-auto p-4 bg-[#080808] flex flex-col">
          {currentQuest ? (
            <div className="space-y-4">
              {/* Quest Header */}
              <div className="border-b border-[#222] pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base sm:text-lg font-serif font-bold text-white tracking-wider">
                      {currentQuest.title}
                    </h2>
                    <span className="text-[11px] text-[#c4a000] tracking-[0.2em] uppercase font-light">
                      {currentQuest.titleEn}
                    </span>
                  </div>

                  <button
                    onClick={() => handleToggleActiveCompass(currentQuest.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] uppercase tracking-wider font-medium border ${
                      currentQuest.active
                        ? 'bg-[#72ffff]/10 border-[#72ffff]/50 text-[#72ffff] shadow-[0_0_8px_rgba(114,255,255,0.3)]'
                        : 'bg-[#111] border-[#333] text-[#888] hover:text-white'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>{currentQuest.active ? 'TRACKED' : 'TRACK ON COMPASS'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-3 mt-2 text-xs text-[#888] font-serif">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#c4a000]" />
                    <span>{currentQuest.location}</span>
                  </div>
                  {currentQuest.completed && (
                    <span className="text-[#72ffff] font-bold flex items-center gap-1 font-mono text-[10px]">
                      <CheckCheck className="w-3.5 h-3.5" />
                      COMPLETED
                    </span>
                  )}
                </div>
              </div>

              {/* Skyrim Lore Parchment Description */}
              <div className="bg-[#0c0c0c] p-4 rounded border border-[#222] text-xs text-[#e0e0e0] font-serif italic leading-relaxed relative">
                <div className="absolute top-2 right-3 text-[#c4a000] text-xs opacity-30 select-none">
                  ✦ ❖ ✦
                </div>
                <p>{currentQuest.description}</p>
              </div>

              {/* Objectives Checklist */}
              <div>
                <h3 className="text-[10px] font-serif uppercase tracking-[0.2em] text-[#c4a000] mb-2.5 flex items-center gap-1.5">
                  <ScrollText className="w-3.5 h-3.5 text-[#c4a000]" />
                  <span>OBJECTIVES</span>
                </h3>

                <div className="space-y-2">
                  {currentQuest.objectives.map((obj) => (
                    <div
                      key={obj.id}
                      onClick={() => handleToggleObjective(currentQuest.id, obj.id)}
                      className={`p-2.5 rounded border flex items-start gap-2.5 cursor-pointer transition-all ${
                        obj.completed
                          ? 'bg-black/50 border-[#222] text-[#666]'
                          : 'bg-[#111] border-[#333] text-[#fff] hover:border-[#72ffff]'
                      }`}
                    >
                      <button className="mt-0.5 flex-none">
                        {obj.completed ? (
                          <CheckCircle className="w-4 h-4 text-[#72ffff]" />
                        ) : (
                          <Circle className="w-4 h-4 text-[#555]" />
                        )}
                      </button>

                      <span
                        className={`text-xs font-serif leading-snug ${
                          obj.completed ? 'line-through text-[#666]' : 'text-[#f0f0f0]'
                        }`}
                      >
                        {obj.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rewards Box */}
              <div className="bg-[#0c0c0c] p-3 rounded border border-[#222] flex items-center justify-between text-xs font-serif">
                <span className="text-[#888] tracking-wider uppercase text-[10px]">REWARDS:</span>
                <div className="flex items-center gap-3">
                  {currentQuest.rewardGold && (
                    <span className="flex items-center gap-1 text-[#c4a000] font-bold">
                      <Coins className="w-3.5 h-3.5" />
                      <span>{currentQuest.rewardGold} GOLD</span>
                    </span>
                  )}
                  {currentQuest.rewardDragonSouls ? (
                    <span className="flex items-center gap-1 text-[#72ffff] font-bold">
                      <Flame className="w-3.5 h-3.5" />
                      <span>{currentQuest.rewardDragonSouls} DRAGON SOULS</span>
                    </span>
                  ) : null}
                  {currentQuest.rewardXp && (
                    <span className="flex items-center gap-1 text-[#d4af37]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{currentQuest.rewardXp} XP</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#666] text-xs font-serif italic">
              Select a quest from the journal to view objectives
            </div>
          )}
        </div>
      </div>

      {/* Add Custom Quest Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3">
          <div className="bg-[#0c0c0c] border border-[#333] rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#222] pb-2.5 mb-3">
              <h3 className="text-sm sm:text-base font-serif font-bold text-white flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-[#c4a000]" />
                <span>NEW QUEST ENTRY</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#888] hover:text-white text-xs px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomQuest} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#888] mb-1 font-serif uppercase tracking-wider text-[10px]">
                  Quest Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Pilgrimage to the High Hrothgar..."
                  className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:border-[#c4a000] font-serif"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#888] mb-1 font-serif uppercase tracking-wider text-[10px]">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as QuestCategory)}
                    className="w-full px-2 py-2 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:border-[#c4a000]"
                  >
                    <option value="custom">Custom Quest</option>
                    <option value="main">Main Quest</option>
                    <option value="faction">Faction</option>
                    <option value="side">Side Quest</option>
                    <option value="misc">Miscellaneous</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#888] mb-1 font-serif uppercase tracking-wider text-[10px]">
                    Location
                  </label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Whiterun, Riften..."
                    className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:border-[#c4a000] font-serif"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#888] mb-1 font-serif uppercase tracking-wider text-[10px]">
                  Quest Lore / Description
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="The oath sworn by the Dragonborn..."
                  className="w-full px-3 py-2 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:border-[#c4a000] font-serif"
                />
              </div>

              {/* Dynamic objectives list */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#888] font-serif uppercase tracking-wider text-[10px]">
                    Objectives
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewObjectives((prev) => [...prev, ''])}
                    className="text-[#c4a000] text-[10px] uppercase tracking-wider hover:underline"
                  >
                    + ADD OBJECTIVE
                  </button>
                </div>
                <div className="space-y-1.5">
                  {newObjectives.map((obj, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={obj}
                        onChange={(e) => {
                          const updated = [...newObjectives];
                          updated[i] = e.target.value;
                          setNewObjectives(updated);
                        }}
                        placeholder={`Objective ${i + 1}`}
                        className="flex-1 px-2.5 py-1.5 bg-[#111] border border-[#333] rounded text-white text-xs focus:outline-none focus:border-[#c4a000] font-serif"
                      />
                      {newObjectives.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setNewObjectives(newObjectives.filter((_, idx) => idx !== i))
                          }
                          className="px-2 py-1 text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rewards */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[#888] mb-1 font-serif uppercase tracking-wider text-[10px]">
                    Reward Gold
                  </label>
                  <input
                    type="number"
                    value={newGold}
                    onChange={(e) => setNewGold(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:border-[#c4a000]"
                  />
                </div>
                <div>
                  <label className="block text-[#888] mb-1 font-serif uppercase tracking-wider text-[10px]">
                    Reward XP
                  </label>
                  <input
                    type="number"
                    value={newXp}
                    onChange={(e) => setNewXp(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#111] border border-[#333] rounded text-white focus:outline-none focus:border-[#c4a000]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#222]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded bg-[#111] border border-[#333] text-[#888] hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#c4a000] hover:bg-[#d4af37] text-black font-bold uppercase tracking-widest text-xs shadow-[0_0_10px_rgba(196,160,0,0.3)]"
                >
                  COMMENCE QUEST
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

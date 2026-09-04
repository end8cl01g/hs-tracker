/**
 * App.tsx — Press to Handstand × Skyrim UI（Test3 元件庫）
 *
 * 合併架構：
 * - 單一真相 = HSEmbedded（倒立訓練領域狀態：history / gateDone / unlockedSkills / badges / customQuests）
 * - Test3 的 Skyrim UI（羅盤、狀態列、任務手札、星座專長樹、角色、存檔）全部吃「推導快照」
 * - 任務勾勾 → applyQuestUpdate diff 回領域狀態 → XP／等級／點數／徽章全部重算
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import type { CharacterStats, Quest, SaveSlot } from './types';
import { storageService } from './services/storageService';
import { skyrimAudio } from './services/audioService';
import { SkyrimCompass } from './components/SkyrimCompass';
import { SkyrimStatusBar } from './components/SkyrimStatusBar';
import { ConstellationPerks } from './components/ConstellationPerks';
import { QuestJournal } from './components/QuestJournal';
import { CharacterStatsView } from './components/CharacterStatsView';
import { SaveManagerView } from './components/SaveManagerView';
import { SkyrimNotification } from './components/SkyrimNotification';
import { normalizeHS, newHSState } from './domain/state';
import { deriveSnapshot, applyQuestUpdate, applyProfileUpdate } from './domain/adapters';
import { badgeDefs } from './domain/data';
import { earnedBadges } from './domain/rules';
import type { HSEmbedded } from './types';

type Tab = 'perks' | 'quests' | 'character' | 'saves';

export default function App() {
  const [initialHS] = useState<HSEmbedded>(() => {
    const loaded = storageService.loadState();
    return normalizeHS(loaded.character?.hs);
  });
  const [hs, setHS] = useState<HSEmbedded>(initialHS);
  const [currentTab, setCurrentTab] = useState<Tab>('quests');
  const [slots, setSlots] = useState<SaveSlot[]>(() => storageService.loadSlots());
  const [notification, setNotification] = useState<{ title: string; subtitle: string } | null>(null);

  const snap = useMemo(() => deriveSnapshot(hs), [hs]);
  const prevLevelRef = useRef<number>(snap.stats.level);
  const firstRunRef = useRef<boolean>(true);

  // 首次進入：自動把「今日課表」與第一道階段關卡放上羅盤
  useEffect(() => {
    if (!firstRunRef.current) return;
    firstRunRef.current = false;
    if (hs.activeIds.length === 0) {
      const todayQuest = snap.quests.find((q) => q.id.startsWith(`hs|`) && !q.id.startsWith('hs|gate|') && q.title.startsWith('今日'));
      const firstGate = snap.quests.find((q) => q.id === 'hs|gate|0');
      const ids = [todayQuest?.id, firstGate?.id].filter(Boolean) as string[];
      if (ids.length) setHS((prev) => ({ ...prev, activeIds: ids }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自動存檔
  useEffect(() => {
    storageService.saveCurrentState(snap.character, snap.quests);
  }, [hs, snap.character, snap.quests]);

  // 升級／降級通知（載入舊存檔時靜默同步 ref）
  useEffect(() => {
    const prev = prevLevelRef.current;
    if (snap.stats.level > prev) {
      skyrimAudio.playLevelUp();
      confetti({
        particleCount: 90,
        spread: 90,
        origin: { y: 0.4 },
        colors: ['#d4af37', '#72ffff', '#f59e0b'],
      });
      setNotification({
        title: 'LEVEL UP!',
        subtitle: `等級提升：Lv.${prev} → Lv.${snap.stats.level}（獲得 1 技能點）`,
      });
    }
    prevLevelRef.current = snap.stats.level;
  }, [snap.stats.level]);

  // 徽章判定：達成新徽章 → 發通知 + 寫回領域狀態
  useEffect(() => {
    const statsMap = {
      total_xp: snap.stats.totalXP,
      total_sessions: snap.stats.totalSessions,
      total_syncs: 0, // GAS 同步已隨舊環境捨棄；保留指標讓舊定義不壞
      skills_unlocked: snap.stats.skillsUnlocked,
      level: snap.stats.level,
      streak_current: snap.stats.streak,
    };
    const newly = earnedBadges(badgeDefs, statsMap, hs.badges);
    if (newly.length) {
      const defs = badgeDefs.filter((b) => newly.includes(b.id));
      skyrimAudio.playQuestComplete();
      confetti({
        particleCount: 60,
        spread: 75,
        origin: { y: 0.55 },
        colors: ['#d4af37', '#fff7cc'],
      });
      setNotification({
        title: 'ACHIEVEMENT UNLOCKED',
        subtitle: `徽章達成：${defs.map((b) => `${b.icon} ${b.name}`).join('、')}`,
      });
      setHS((prev) => {
        const merged = [...new Set([...prev.badges, ...newly])];
        if (merged.length === prev.badges.length) return prev;
        return { ...prev, badges: merged };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.stats.totalXP, snap.stats.totalSessions, snap.stats.skillsUnlocked, snap.stats.level, snap.stats.streak]);

  const handleShowNotification = useCallback((title: string, subtitle: string) => {
    setNotification({ title, subtitle });
  }, []);

  /** 任務手札的變更 → diff 回領域狀態（XP 等一律重算，不接受 UI 直寫） */
  const handleUpdateQuests = useCallback((updater: (prev: Quest[]) => Quest[]) => {
    setHS((prev) => applyQuestUpdate(prev, updater));
  }, []);

  /** 角色頁的個人檔／屬性調整（只採納 profile 欄位） */
  const handleUpdateCharacter = useCallback((updater: (prev: CharacterStats) => CharacterStats) => {
    setHS((prev) => applyProfileUpdate(prev, updater));
  }, []);

  /** 載入存檔：存檔內的 character.hs 就是完整領域狀態 */
  const handleLoadSave = useCallback((loadedCharacter: CharacterStats, _loadedQuests: Quest[]) => {
    const hsFromSave = normalizeHS(loadedCharacter?.hs);
    setHS(hsFromSave);
    prevLevelRef.current = deriveSnapshot(hsFromSave).stats.level;
  }, []);

  const handleRefreshSlots = useCallback(() => {
    setSlots(storageService.loadSlots());
  }, []);

  const activeQuests = snap.quests.filter((q) => q.active && !q.completed);

  return (
    <div className="relative min-h-screen w-full bg-[#05070a] text-[#e2e8f0] flex flex-col justify-between overflow-hidden skyrim-smoke-bg">
      {/* Top Skyrim Compass & Navigation Header */}
      <SkyrimCompass
        activeQuests={activeQuests}
        perkPoints={snap.character.perkPoints}
        onOpenStats={() => setCurrentTab('character')}
        onOpenSaves={() => setCurrentTab('saves')}
      />

      {/* Main Tab Viewport with smooth Skyrim fade transitions */}
      <main className="flex-1 w-full relative overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="flex-1 flex flex-col"
          >
            {currentTab === 'perks' && (
              <ConstellationPerks
                character={snap.character}
                onUpdateCharacter={handleUpdateCharacter}
                onShowNotification={handleShowNotification}
                onUnlockSkill={(nodeId) => setHS((prev) => ({ ...prev, unlockedSkills: [...prev.unlockedSkills, nodeId] }))}
              />
            )}
            {currentTab === 'quests' && (
              <QuestJournal
                quests={snap.quests}
                character={snap.character}
                onUpdateQuests={handleUpdateQuests}
                onUpdateCharacter={handleUpdateCharacter}
                onShowNotification={handleShowNotification}
              />
            )}
            {currentTab === 'character' && (
              <CharacterStatsView
                character={snap.character}
                onUpdateCharacter={handleUpdateCharacter}
                onShowNotification={handleShowNotification}
              />
            )}
            {currentTab === 'saves' && (
              <SaveManagerView
                character={snap.character}
                quests={snap.quests}
                slots={slots}
                onLoadSave={handleLoadSave}
                onRefreshSlots={handleRefreshSlots}
                onShowNotification={handleShowNotification}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Skyrim Status Bar (HP / MP / Stamina + Tab Switch) */}
      <SkyrimStatusBar character={snap.character} currentTab={currentTab} onTabChange={setCurrentTab} />

      {/* Skyrim Announcement Banner */}
      {notification && (
        <SkyrimNotification
          title={notification.title}
          subtitle={notification.subtitle}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
}

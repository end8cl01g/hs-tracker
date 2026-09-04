/**
 * Skyrim Quest & Constellation Perks Tracker
 * Powered by Rust WebAssembly + TypeScript with Offline Persistence
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CharacterStats, Quest, SaveSlot } from './types';
import { storageService } from './services/storageService';
import { SkyrimCompass } from './components/SkyrimCompass';
import { SkyrimStatusBar } from './components/SkyrimStatusBar';
import { ConstellationPerks } from './components/ConstellationPerks';
import { QuestJournal } from './components/QuestJournal';
import { CharacterStatsView } from './components/CharacterStatsView';
import { SaveManagerView } from './components/SaveManagerView';
import { SkyrimNotification } from './components/SkyrimNotification';

export default function App() {
  const [initialData] = useState(() => storageService.loadState());
  const [character, setCharacter] = useState<CharacterStats>(initialData.character);
  const [quests, setQuests] = useState<Quest[]>(initialData.quests);
  const [slots, setSlots] = useState<SaveSlot[]>(initialData.slots);
  const [currentTab, setCurrentTab] = useState<'perks' | 'quests' | 'character' | 'saves'>('perks');
  const [notification, setNotification] = useState<{ title: string; subtitle: string } | null>(null);

  // Auto-save to LocalStorage whenever character or quests change
  useEffect(() => {
    storageService.saveCurrentState(character, quests);
  }, [character, quests]);

  // Refresh slots list
  const handleRefreshSlots = useCallback(() => {
    setSlots(storageService.loadSlots());
  }, []);

  // Show Skyrim announcement banner
  const handleShowNotification = useCallback((title: string, subtitle: string) => {
    setNotification({ title, subtitle });
  }, []);

  // Load game save
  const handleLoadSave = useCallback((loadedCharacter: CharacterStats, loadedQuests: Quest[]) => {
    setCharacter(loadedCharacter);
    setQuests(loadedQuests);
  }, []);

  const activeQuests = quests.filter((q) => q.active && !q.completed);

  return (
    <div className="relative min-h-screen w-full bg-[#05070a] text-[#e2e8f0] flex flex-col justify-between overflow-hidden skyrim-smoke-bg">
      {/* Top Skyrim Compass & Navigation Header */}
      <SkyrimCompass
        activeQuests={activeQuests}
        perkPoints={character.perkPoints}
        onOpenStats={() => setCurrentTab('character')}
        onOpenSaves={() => setCurrentTab('saves')}
      />

      {/* Main Tab Viewport with smooth Skyrim fade transitions */}
      <main className="flex-1 w-full relative overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {currentTab === 'perks' && (
            <motion.div
              key="perks"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.2 }}
              className="flex-1 w-full flex flex-col"
            >
              <ConstellationPerks
                character={character}
                onUpdateCharacter={setCharacter}
                onShowNotification={handleShowNotification}
              />
            </motion.div>
          )}

          {currentTab === 'quests' && (
            <motion.div
              key="quests"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 w-full flex flex-col"
            >
              <QuestJournal
                quests={quests}
                character={character}
                onUpdateQuests={setQuests}
                onUpdateCharacter={setCharacter}
                onShowNotification={handleShowNotification}
              />
            </motion.div>
          )}

          {currentTab === 'character' && (
            <motion.div
              key="character"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 w-full flex flex-col"
            >
              <CharacterStatsView
                character={character}
                onUpdateCharacter={setCharacter}
                onShowNotification={handleShowNotification}
              />
            </motion.div>
          )}

          {currentTab === 'saves' && (
            <motion.div
              key="saves"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 w-full flex flex-col"
            >
              <SaveManagerView
                character={character}
                quests={quests}
                slots={slots}
                onLoadSave={handleLoadSave}
                onRefreshSlots={handleRefreshSlots}
                onShowNotification={handleShowNotification}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Level Up / Quest Completed Notification Banner */}
      {notification && (
        <SkyrimNotification
          title={notification.title}
          subtitle={notification.subtitle}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Bottom Health/Magicka/Stamina Bar and Navigation */}
      <SkyrimStatusBar
        character={character}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
      />
    </div>
  );
}

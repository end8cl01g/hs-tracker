import React, { useState, useRef } from 'react';
import {
  Save,
  Download,
  Upload,
  Clock,
  CheckCircle2,
  Trash2,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  FileCheck,
  AlertTriangle,
} from 'lucide-react';
import { SaveSlot, CharacterStats, Quest } from '../types';
import { storageService } from '../services/storageService';
import { skyrimAudio } from '../services/audioService';
import { INITIAL_CHARACTER, INITIAL_QUESTS } from '../data/skyrimData';

interface SaveManagerViewProps {
  character: CharacterStats;
  quests: Quest[];
  slots: SaveSlot[];
  onLoadSave: (character: CharacterStats, quests: Quest[]) => void;
  onRefreshSlots: () => void;
  onShowNotification: (title: string, subtitle: string) => void;
}

export const SaveManagerView: React.FC<SaveManagerViewProps> = ({
  character,
  quests,
  slots,
  onLoadSave,
  onRefreshSlots,
  onShowNotification,
}) => {
  const [newSlotName, setNewSlotName] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick Save
  const handleQuickSave = () => {
    skyrimAudio.playLevelUp();
    storageService.quickSave(character, quests);
    onRefreshSlots();
    onShowNotification('QUICKSAVE SUCCESS', '快速存檔已記錄！');
  };

  // Manual Save
  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotName.trim()) return;

    skyrimAudio.playLevelUp();
    storageService.manualSave(newSlotName.trim(), character, quests);
    setNewSlotName('');
    onRefreshSlots();
    onShowNotification('MANUAL SAVE CREATED', `新存檔「${newSlotName.trim()}」已寫入！`);
  };

  // Load selected save
  const handleLoadSlot = (slot: SaveSlot) => {
    skyrimAudio.playTabSwitch();
    onLoadSave(slot.character, slot.quests);
    onShowNotification('GAME LOADED', `已載入檔案：${slot.name}`);
  };

  // Delete slot
  const handleDeleteSlot = (slotId: string, slotName: string) => {
    if (window.confirm(`確定要刪除「${slotName}」嗎？此操作無法還原。`)) {
      skyrimAudio.playCheckbox();
      storageService.deleteSlot(slotId);
      onRefreshSlots();
      onShowNotification('SAVE DELETED', `已刪除檔案：${slotName}`);
    }
  };

  // Export .skyrimsave
  const handleExport = () => {
    skyrimAudio.playCheckbox();
    storageService.exportSaveFile(character, quests);
    onShowNotification('SAVE EXPORTED', '天際省存檔檔案已下載至本機！');
  };

  // Import file handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImportFile(file);
  };

  const processImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const restored = storageService.importSaveFile(text);
        onLoadSave(restored.character, restored.quests);
        onRefreshSlots();
        skyrimAudio.playLevelUp();
        onShowNotification('IMPORT COMPLETE', '已成功自檔案還原角色與任務進度！');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '存檔檔案損壞或格式不符';
        alert('匯入失敗：' + message);
      }
    };
    reader.readAsText(file);
  };

  // Reset to initial
  const handleResetToDefault = () => {
    if (window.confirm('確定要將所有角色技能與任務進度重置為初始狀態嗎？')) {
      skyrimAudio.playCheckbox();
      onLoadSave(INITIAL_CHARACTER, INITIAL_QUESTS);
      storageService.saveCurrentState(INITIAL_CHARACTER, INITIAL_QUESTS);
      onRefreshSlots();
      onShowNotification('RESET COMPLETE', '已重置為初入天際之新手狀態！');
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-130px)] overflow-y-auto bg-[#050505] p-3 pb-12 select-none">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Offline Status & Top Bar */}
        <div className="bg-[#0a0a0a] border border-[#333] rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#72ffff]/10 border border-[#72ffff]/40 flex items-center justify-center text-[#72ffff] flex-none">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-white tracking-wider font-serif">
                  SKYRIM OFFLINE VAULT
                </h3>
                <span className="px-2 py-0.5 bg-[#72ffff]/10 text-[#72ffff] border border-[#72ffff]/40 text-[9px] rounded font-mono font-bold tracking-wider">
                  OFFLINE READY
                </span>
              </div>
              <p className="text-[11px] text-[#888] mt-0.5 font-serif">
                Progress is stored in local browser cache. Fully supports offline play and custom save file backup.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleQuickSave}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded bg-[#c4a000] hover:bg-[#d4af37] text-black font-bold text-xs uppercase tracking-widest shadow-[0_0_10px_rgba(196,160,0,0.3)] min-h-[38px]"
            >
              <Save className="w-3.5 h-3.5" />
              <span>QUICKSAVE</span>
            </button>
          </div>
        </div>

        {/* Create Manual Save Slot & File Import/Export Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Create Manual Save Form */}
          <div className="bg-[#0a0a0a] border border-[#222] p-3.5 rounded-lg text-xs">
            <h4 className="font-bold text-white mb-2 flex items-center gap-1.5 font-serif uppercase tracking-wider text-[10px]">
              <Save className="w-3.5 h-3.5 text-[#c4a000]" />
              <span>CREATE MANUAL SAVE</span>
            </h4>
            <form onSubmit={handleManualSave} className="flex gap-2">
              <input
                type="text"
                value={newSlotName}
                onChange={(e) => setNewSlotName(e.target.value)}
                placeholder="e.g. Before Bleak Falls Barrow..."
                className="flex-1 px-3 py-1.5 bg-[#111] border border-[#333] rounded text-white text-xs focus:outline-none focus:border-[#c4a000] font-serif"
              />
              <button
                type="submit"
                disabled={!newSlotName.trim()}
                className="px-3 py-1.5 bg-[#161616] hover:bg-[#222] border border-[#333] text-[#c4a000] font-bold rounded uppercase tracking-wider text-xs disabled:opacity-30"
              >
                SAVE
              </button>
            </form>
          </div>

          {/* Export / Import File Buttons */}
          <div className="bg-[#0a0a0a] border border-[#222] p-3.5 rounded-lg text-xs flex flex-col justify-between">
            <h4 className="font-bold text-white mb-2 flex items-center gap-1.5 font-serif uppercase tracking-wider text-[10px]">
              <FileCheck className="w-3.5 h-3.5 text-[#72ffff]" />
              <span>FILE EXPORT & RESTORE (.skyrimsave)</span>
            </h4>

            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] text-[#e0e0e0] rounded font-serif text-[11px] tracking-wider uppercase"
              >
                <Download className="w-3.5 h-3.5 text-[#72ffff]" />
                <span>EXPORT SAVE</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] text-[#e0e0e0] rounded font-serif text-[11px] tracking-wider uppercase"
              >
                <Upload className="w-3.5 h-3.5 text-[#c4a000]" />
                <span>RESTORE FILE</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".skyrimsave,.json"
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* Save Slots List */}
        <div className="bg-[#0a0a0a] border border-[#222] p-3.5 rounded-lg">
          <div className="flex items-center justify-between mb-3 border-b border-[#222] pb-2">
            <h3 className="text-[10px] font-serif uppercase tracking-[0.2em] text-[#c4a000] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#c4a000]" />
              <span>SAVED ARCHIVES ({slots.length})</span>
            </h3>

            <button
              onClick={handleResetToDefault}
              className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 tracking-wider uppercase font-serif"
            >
              <RotateCcw className="w-3 h-3" />
              <span>RESET TO DEFAULT</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {slots.map((slot) => {
              const dateStr = new Date(slot.timestamp).toLocaleString();
              const questsDone = slot.quests.filter((q) => q.completed).length;

              return (
                <div
                  key={slot.id}
                  className="bg-[#080808] border border-[#222] hover:border-[#333] rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 transition-all text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-white text-sm">{slot.name}</span>
                      {slot.isAutoSave && (
                        <span className="px-1.5 py-0.2 bg-[#72ffff]/10 text-[#72ffff] border border-[#72ffff]/40 text-[9px] font-mono rounded">
                          AUTOSAVE
                        </span>
                      )}
                      {slot.isQuickSave && (
                        <span className="px-1.5 py-0.2 bg-[#c4a000]/10 text-[#c4a000] border border-[#c4a000]/40 text-[9px] font-mono rounded">
                          QUICKSAVE
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#888] mt-1 font-serif">
                      <span>{dateStr}</span>
                      <span>
                        LEVEL <strong className="text-[#c4a000]">{slot.character.level}</strong>
                      </span>
                      <span>
                        PERKS:{' '}
                        <strong className="text-white font-mono">{slot.character.unlockedPerks.length}</strong>
                      </span>
                      <span>
                        QUESTS:{' '}
                        <strong className="text-white font-mono">
                          {questsDone}/{slot.quests.length}
                        </strong>
                      </span>
                      <span className="text-[#555] font-mono text-[10px]">
                        CRC: 0x{slot.checksum?.toString(16).toUpperCase() || 'OK'}
                      </span>
                    </div>
                  </div>

                  {/* Slot Actions */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => handleLoadSlot(slot)}
                      className="px-3 py-1.5 rounded bg-[#161616] hover:bg-[#222] border border-[#333] text-[#72ffff] font-serif text-[10px] tracking-wider uppercase font-bold"
                    >
                      LOAD ARCHIVE
                    </button>

                    {!slot.isAutoSave && (
                      <button
                        onClick={() => handleDeleteSlot(slot.id, slot.name)}
                        className="p-1.5 rounded hover:bg-red-950/40 text-[#666] hover:text-red-400"
                        title="Delete Save"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

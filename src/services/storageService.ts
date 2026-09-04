/**
 * src/services/storageService.ts — 離線存檔服務（localStorage）。
 * API 面與原 Test3 版完全相容（SaveManagerView 不用改），
 * 但唯一真相是 character.hs（Press-to-Handstand 領域狀態）；
 * quests 只是推導結果，載入時一律由領域狀態重建。
 */
import { CharacterStats, Quest, SaveSlot, HSEmbedded } from '../types';
import { deriveSnapshot, applyProfileUpdate } from '../domain/adapters';
import { normalizeHS, newHSState } from '../domain/state';
import { rustEngine } from './rustBridge';

const STORAGE_KEY = 'HS_SKYRIM_SLOTS_V1';
const CURRENT_STATE_KEY = 'HS_SKYRIM_CURRENT_V1';

export class HsStorageService {
  /** 載入目前狀態；沒有就回初始（全新 52 週計畫） */
  public loadState(): { character: CharacterStats; quests: Quest[]; slots: SaveSlot[] } {
    try {
      const savedState = localStorage.getItem(CURRENT_STATE_KEY);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        const hs = normalizeHS(parsed?.character?.hs);
        const snap = deriveSnapshot(hs);
        const savedSlots = localStorage.getItem(STORAGE_KEY);
        const slots: SaveSlot[] = savedSlots ? JSON.parse(savedSlots) : [];
        return {
          character: snap.character,
          quests: snap.quests,
          slots: slots.length > 0 ? slots : this.createInitialSlots(snap.character, snap.quests),
        };
      }
    } catch (e) {
      console.error('Failed to load from local storage:', e);
    }
    const snap = deriveSnapshot(newHSState());
    return {
      character: snap.character,
      quests: snap.quests,
      slots: this.createInitialSlots(snap.character, snap.quests),
    };
  }

  /** 自動存檔：把 character.hs（領域真相）寫回 localStorage */
  public saveCurrentState(character: CharacterStats, _quests: Quest[]) {
    try {
      const hs = normalizeHS(character?.hs);
      const json = JSON.stringify({ hs, savedAt: Date.now() });
      localStorage.setItem(CURRENT_STATE_KEY, json);
      this.updateAutoSaveSlot(hs);
    } catch (e) {
      console.error('AutoSave failed:', e);
    }
  }

  /** 直接讀原始領域狀態（同步服務用：不經 derive，帶 savedAt 供 LWW） */
  public readHSRaw(): { hs: HSEmbedded; savedAt: number } {
    try {
      const raw = localStorage.getItem(CURRENT_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { hs: normalizeHS(parsed?.hs ?? parsed?.character?.hs), savedAt: Number(parsed?.savedAt) || 0 };
      }
    } catch (e) {
      console.error('readHSRaw failed:', e);
    }
    return { hs: newHSState(), savedAt: 0 };
  }

  /** 直接寫原始領域狀態（同步服務用：雲端合併結果採用進本機，不等 React re-render） */
  public writeHSRaw(hs: HSEmbedded) {
    try {
      const clean = normalizeHS(hs);
      localStorage.setItem(CURRENT_STATE_KEY, JSON.stringify({ hs: clean, savedAt: Date.now() }));
    } catch (e) {
      console.error('writeHSRaw failed:', e);
    }
  }

  private updateAutoSaveSlot(hs: ReturnType<typeof normalizeHS>) {
    const slots = this.loadSlots();
    const snap = deriveSnapshot(hs);
    const jsonStr = JSON.stringify({ character: snap.character, quests: snap.quests });
    const checksum = rustEngine.computeSaveChecksum(jsonStr);

    const autoSaveIndex = slots.findIndex((s) => s.isAutoSave);
    const newSlot: SaveSlot = {
      id: 'autosave',
      name: '自動存檔 (AutoSave)',
      timestamp: Date.now(),
      character: snap.character,
      quests: snap.quests,
      checksum,
      isAutoSave: true,
    };

    if (autoSaveIndex >= 0) slots[autoSaveIndex] = newSlot;
    else slots.unshift(newSlot);

    this.saveSlots(slots);
  }

  public quickSave(character: CharacterStats, _quests: Quest[]): SaveSlot {
    const slots = this.loadSlots();
    const hs = normalizeHS(character?.hs);
    const snap = deriveSnapshot(hs);
    const jsonStr = JSON.stringify({ character: snap.character, quests: snap.quests });
    const checksum = rustEngine.computeSaveChecksum(jsonStr);

    const quickSaveIndex = slots.findIndex((s) => s.isQuickSave);
    const newSlot: SaveSlot = {
      id: 'quicksave',
      name: '快速存檔 (QuickSave)',
      timestamp: Date.now(),
      character: snap.character,
      quests: snap.quests,
      checksum,
      isQuickSave: true,
    };

    if (quickSaveIndex >= 0) slots[quickSaveIndex] = newSlot;
    else slots.splice(1, 0, newSlot);

    this.saveSlots(slots);
    return newSlot;
  }

  public manualSave(name: string, character: CharacterStats, _quests: Quest[]): SaveSlot {
    const slots = this.loadSlots();
    const hs = normalizeHS(character?.hs);
    const snap = deriveSnapshot(hs);
    const jsonStr = JSON.stringify({ character: snap.character, quests: snap.quests });
    const checksum = rustEngine.computeSaveChecksum(jsonStr);

    const newSlot: SaveSlot = {
      id: 'slot_' + Date.now(),
      name: name || `檔案 ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      character: snap.character,
      quests: snap.quests,
      checksum,
    };

    slots.push(newSlot);
    this.saveSlots(slots);
    return newSlot;
  }

  public deleteSlot(slotId: string) {
    const slots = this.loadSlots().filter((s) => s.id !== slotId);
    this.saveSlots(slots);
    return slots;
  }

  public loadSlots(): SaveSlot[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveSlots(slots: SaveSlot[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
    } catch (e) {
      console.error('Failed to save slots:', e);
    }
  }

  private createInitialSlots(character: CharacterStats, quests: Quest[]): SaveSlot[] {
    const jsonStr = JSON.stringify({ character, quests });
    const checksum = rustEngine.computeSaveChecksum(jsonStr);
    const initial: SaveSlot = {
      id: 'autosave',
      name: '自動存檔 (AutoSave)',
      timestamp: Date.now(),
      character,
      quests,
      checksum,
      isAutoSave: true,
    };
    this.saveSlots([initial]);
    return [initial];
  }

  /** 匯出 .skyrimsave 檔（其實是 Press-to-Handstand 進度，保留副檔名相容 UI） */
  public exportSaveFile(character: CharacterStats, _quests: Quest[]) {
    const hs = normalizeHS(character?.hs);
    const snap = deriveSnapshot(hs);
    const savePayload = {
      format: 'HS_SKYRIM_SAVE',
      version: '1.0.0',
      engine: 'Rust+TypeScript WebAssembly',
      exportedAt: new Date().toISOString(),
      character: snap.character,
      quests: snap.quests,
    };

    const json = JSON.stringify(savePayload, null, 2);
    const checksum = rustEngine.computeSaveChecksum(json);
    const finalPayload = { ...savePayload, checksum };

    const blob = new Blob([JSON.stringify(finalPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HandstandSave_${snap.character.name.replace(/\s+/g, '_')}_Lvl${snap.character.level}.skyrimsave`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** 匯入存檔（接受新格式 HS_SKYRIM_SAVE 與舊版 SKYRIM_OFFLINE_SAVE 的 character.hs） */
  public importSaveFile(jsonString: string): { character: CharacterStats; quests: Quest[] } {
    const parsed = JSON.parse(jsonString);
    if (!parsed.character || (!parsed.character.hs && !parsed.hs)) {
      throw new Error('無效的存檔格式 (Invalid save format)');
    }
    const hs = normalizeHS(parsed.hs || parsed.character.hs);
    const snap = deriveSnapshot(hs);
    this.saveCurrentState(snap.character, snap.quests);
    return { character: snap.character, quests: snap.quests };
  }

  /** 重置（SaveManagerView 的 handleResetToDefault 會帶初始角色呼叫） */
  public resetToDefault(): { character: CharacterStats; quests: Quest[] } {
    const snap = deriveSnapshot(newHSState());
    this.saveCurrentState(snap.character, snap.quests);
    return snap;
  }
}

export const storageService = new HsStorageService();

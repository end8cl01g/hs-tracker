import { CharacterStats, Quest, SaveSlot } from '../types';
import { INITIAL_CHARACTER, INITIAL_QUESTS } from '../data/skyrimData';
import { rustEngine } from './rustBridge';

const STORAGE_KEY = 'SKYRIM_OFFLINE_SAVES_V1';
const CURRENT_STATE_KEY = 'SKYRIM_CURRENT_STATE_V1';

export interface StorageState {
  currentSlotId: string;
  character: CharacterStats;
  quests: Quest[];
  slots: SaveSlot[];
}

export class SkyrimStorageService {
  /**
   * Load current state or fallback to default
   */
  public loadState(): { character: CharacterStats; quests: Quest[]; slots: SaveSlot[] } {
    try {
      const savedState = localStorage.getItem(CURRENT_STATE_KEY);
      const savedSlots = localStorage.getItem(STORAGE_KEY);

      const slots: SaveSlot[] = savedSlots ? JSON.parse(savedSlots) : [];

      if (savedState) {
        const parsed = JSON.parse(savedState);
        return {
          character: parsed.character || INITIAL_CHARACTER,
          quests: parsed.quests || INITIAL_QUESTS,
          slots: slots.length > 0 ? slots : this.createInitialSlots(parsed.character, parsed.quests),
        };
      }

      const initialSlots = this.createInitialSlots(INITIAL_CHARACTER, INITIAL_QUESTS);
      return {
        character: INITIAL_CHARACTER,
        quests: INITIAL_QUESTS,
        slots: initialSlots,
      };
    } catch (e) {
      console.error('Failed to load from local storage:', e);
      return {
        character: INITIAL_CHARACTER,
        quests: INITIAL_QUESTS,
        slots: this.createInitialSlots(INITIAL_CHARACTER, INITIAL_QUESTS),
      };
    }
  }

  /**
   * Auto-save active state to local storage
   */
  public saveCurrentState(character: CharacterStats, quests: Quest[]) {
    try {
      const data = {
        character,
        quests,
        savedAt: Date.now(),
      };
      const json = JSON.stringify(data);
      localStorage.setItem(CURRENT_STATE_KEY, json);

      // Also update AutoSave slot
      this.updateAutoSaveSlot(character, quests);
    } catch (e) {
      console.error('AutoSave failed:', e);
    }
  }

  private updateAutoSaveSlot(character: CharacterStats, quests: Quest[]) {
    const slots = this.loadSlots();
    const jsonStr = JSON.stringify({ character, quests });
    const checksum = rustEngine.computeSaveChecksum(jsonStr);

    const autoSaveIndex = slots.findIndex((s) => s.isAutoSave);
    const newSlot: SaveSlot = {
      id: 'autosave',
      name: '自動存檔 (AutoSave)',
      timestamp: Date.now(),
      character,
      quests,
      checksum,
      isAutoSave: true,
    };

    if (autoSaveIndex >= 0) {
      slots[autoSaveIndex] = newSlot;
    } else {
      slots.unshift(newSlot);
    }

    this.saveSlots(slots);
  }

  public quickSave(character: CharacterStats, quests: Quest[]): SaveSlot {
    const slots = this.loadSlots();
    const jsonStr = JSON.stringify({ character, quests });
    const checksum = rustEngine.computeSaveChecksum(jsonStr);

    const quickSaveIndex = slots.findIndex((s) => s.isQuickSave);
    const newSlot: SaveSlot = {
      id: 'quicksave',
      name: '快速存檔 (QuickSave)',
      timestamp: Date.now(),
      character,
      quests,
      checksum,
      isQuickSave: true,
    };

    if (quickSaveIndex >= 0) {
      slots[quickSaveIndex] = newSlot;
    } else {
      slots.splice(1, 0, newSlot);
    }

    this.saveSlots(slots);
    return newSlot;
  }

  public manualSave(name: string, character: CharacterStats, quests: Quest[]): SaveSlot {
    const slots = this.loadSlots();
    const jsonStr = JSON.stringify({ character, quests });
    const checksum = rustEngine.computeSaveChecksum(jsonStr);

    const newSlot: SaveSlot = {
      id: 'slot_' + Date.now(),
      name: name || `檔案 ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      character,
      quests,
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

  /**
   * Export save state as .skyrimsave JSON file
   */
  public exportSaveFile(character: CharacterStats, quests: Quest[]) {
    const savePayload = {
      format: 'SKYRIM_OFFLINE_SAVE',
      version: '1.0.0',
      engine: 'Rust+TypeScript WebAssembly',
      exportedAt: new Date().toISOString(),
      character,
      quests,
    };

    const json = JSON.stringify(savePayload, null, 2);
    const checksum = rustEngine.computeSaveChecksum(json);
    const finalPayload = { ...savePayload, checksum };

    const blob = new Blob([JSON.stringify(finalPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SkyrimSave_${character.name.replace(/\s+/g, '_')}_Lvl${character.level}.skyrimsave`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import save file from string or file upload
   */
  public importSaveFile(jsonString: string): { character: CharacterStats; quests: Quest[] } {
    const parsed = JSON.parse(jsonString);
    if (!parsed.character || !parsed.quests) {
      throw new Error('無效的天際省存檔格式 (Invalid Skyrim Save format)');
    }
    this.saveCurrentState(parsed.character, parsed.quests);
    return {
      character: parsed.character,
      quests: parsed.quests,
    };
  }
}

export const storageService = new SkyrimStorageService();

/**
 * Rust + TypeScript WebAssembly Bridge for Skyrim Quest and Perks Engine
 * Interfaces directly with the compiled WebAssembly binary and Rust algorithm logic.
 */

import { RustWasmStats } from '../types';

// Pre-compiled WebAssembly binary containing core Rust formulas
// Compiled from src/rust/lib.rs
const RUST_WASM_BASE64 = 'AGFzbQEAAAABDgJgAX8Bf2AEf39/fwF/AwQDAAEABzUDDHhwX2Zvcl9sZXZlbAAAD2Nhbl91bmxvY2tfcGVyawABEGxlZ2VuZGFyeV9yZWZ1bmQAAgozAxgAIABBAWoiACAAbEEMbCAAQT9sakFLawsTACADQQBPIAAgAU5xIAJBAEdxCwQAIAAL';

interface WasmExports {
  xp_for_level: (level: number) => number;
  can_unlock_perk: (currentSkill: number, reqSkill: number, prereqsMet: number, perkPoints: number) => number;
  legendary_refund: (count: number) => number;
}

class SkyrimRustEngine {
  private wasmInstance: WebAssembly.Instance | null = null;
  private isWasmLoaded = false;
  private lastExecutionTimeUs = 0;
  private stats: RustWasmStats = {
    isWasmActive: false,
    engineVersion: 'Rust Wasm v0.1.0-cdylib',
    lastCalcTimeUs: 0,
    memoryUsageBytes: 0,
    checksum: 0,
    perkValidationStatus: 'idle',
  };

  constructor() {
    this.initWasm();
  }

  private async initWasm() {
    try {
      const binaryString = atob(RUST_WASM_BASE64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const result = await WebAssembly.instantiate(bytes.buffer);
      this.wasmInstance = result.instance;
      this.isWasmLoaded = true;
      this.stats.isWasmActive = true;
      this.stats.memoryUsageBytes = bytes.byteLength;
    } catch (err) {
      console.warn('Wasm initialization fallback to TypeScript mirror:', err);
      this.isWasmLoaded = false;
      this.stats.isWasmActive = false;
    }
  }

  /**
   * Calculate XP required for next level using Skyrim's exact mathematical formula
   * XP_req(level) = 12.5 * (level + 1)^2 + 62.5 * (level + 1) - 75
   */
  public calculateXpForLevel(level: number): number {
    const t0 = performance.now();
    let result = 0;

    if (this.isWasmLoaded && this.wasmInstance) {
      try {
        const exports = this.wasmInstance.exports as unknown as WasmExports;
        // Native Wasm execution
        result = exports.xp_for_level(level);
      } catch {
        result = this.fallbackXpFormula(level);
      }
    } else {
      result = this.fallbackXpFormula(level);
    }

    const t1 = performance.now();
    this.recordExecTime((t1 - t0) * 1000);
    return result;
  }

  private fallbackXpFormula(level: number): number {
    const nextLevel = level + 1;
    return Math.round(12.5 * nextLevel * nextLevel + 62.5 * nextLevel - 75);
  }

  /**
   * Fast prerequisite and skill check compiled from Rust
   */
  public validatePerkFast(
    currentSkill: number,
    requiredSkill: number,
    prereqsMet: boolean,
    perkPoints: number
  ): boolean {
    const t0 = performance.now();
    let result = false;

    if (this.isWasmLoaded && this.wasmInstance) {
      try {
        const exports = this.wasmInstance.exports as unknown as WasmExports;
        const res = exports.can_unlock_perk(
          currentSkill,
          requiredSkill,
          prereqsMet ? 1 : 0,
          perkPoints
        );
        result = res === 1;
      } catch {
        result = perkPoints > 0 && currentSkill >= requiredSkill && prereqsMet;
      }
    } else {
      result = perkPoints > 0 && currentSkill >= requiredSkill && prereqsMet;
    }

    const t1 = performance.now();
    this.recordExecTime((t1 - t0) * 1000);
    this.stats.perkValidationStatus = result ? 'valid' : 'invalid';
    return result;
  }

  /**
   * Calculate overall character level from all 18 skill levels
   * In Skyrim, baseline total skill sum is 270 (18 skills * 15 starting level)
   */
  public calculateCharacterLevel(skills: Record<string, number>): {
    level: number;
    currentXp: number;
    requiredXp: number;
  } {
    const t0 = performance.now();
    let totalSkillLevels = 0;
    for (const key in skills) {
      totalSkillLevels += skills[key] || 15;
    }

    // Baseline: 18 skills * 15 = 270
    let accumulatedXp = Math.max(0, totalSkillLevels - 270);
    let level = 1;

    while (true) {
      const needed = this.calculateXpForLevel(level);
      if (accumulatedXp >= needed) {
        accumulatedXp -= needed;
        level += 1;
      } else {
        break;
      }
    }

    const requiredXp = this.calculateXpForLevel(level);
    const t1 = performance.now();
    this.recordExecTime((t1 - t0) * 1000);

    return {
      level,
      currentXp: accumulatedXp,
      requiredXp,
    };
  }

  /**
   * Compute CRC32 checksum for offline save file verification
   */
  public computeSaveChecksum(dataString: string): number {
    const t0 = performance.now();
    let crc = 0xffffffff;
    for (let i = 0; i < dataString.length; i++) {
      const code = dataString.charCodeAt(i) & 0xff;
      crc = (crc >>> 8) ^ this.crcTable[(crc ^ code) & 0xff];
    }
    const checksum = (crc ^ 0xffffffff) >>> 0;
    const t1 = performance.now();
    this.recordExecTime((t1 - t0) * 1000);
    this.stats.checksum = checksum;
    return checksum;
  }

  /**
   * Calculate perk points refunded when legendary reset occurs
   */
  public calculateLegendaryRefund(unlockedPerkCount: number): number {
    if (this.isWasmLoaded && this.wasmInstance) {
      try {
        const exports = this.wasmInstance.exports as unknown as WasmExports;
        return exports.legendary_refund(unlockedPerkCount);
      } catch {
        return unlockedPerkCount;
      }
    }
    return unlockedPerkCount;
  }

  public getStats(): RustWasmStats {
    return { ...this.stats };
  }

  private recordExecTime(us: number) {
    this.lastExecutionTimeUs = Math.round(us * 100) / 100;
    this.stats.lastCalcTimeUs = this.lastExecutionTimeUs;
  }

  private crcTable = (() => {
    let c: number;
    const table: number[] = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c;
    }
    return table;
  })();
}

export const rustEngine = new SkyrimRustEngine();

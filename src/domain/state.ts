/**
 * src/domain/state.ts — Press-to-Handstand 領域狀態（單一真相來源）。
 * 進度只有兩個入口：quest objective 勾選（history/gateDone）與技能樹解鎖（unlockedSkills）。
 * 點數、等級、徽章全部「推導」出來，不另存可變狀態（舊專案被「兩種真值」咬過的教訓）。
 */
import type { HSEmbedded } from '../types';
import { todayISO } from './rules';

export function newHSState(today = todayISO()): HSEmbedded {
  return {
    v: 1,
    startedAt: today,
    history: {},
    gateDone: [],
    unlockedSkills: [],
    badges: [],
    customQuests: [],
    activeIds: [],
    profile: {},
  };
}

/** logXP 防禦：只收「日期 → 非負整數」的合法條目 */
function sanitizeLogXP(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      out[k] = Math.round(n);
    }
  }
  return out;
}

/** 防禦性修補：缺欄位補預設（載入舊存檔／部分損壞資料時不白屏） */
export function normalizeHS(input: Partial<HSEmbedded> | null | undefined, today = todayISO()): HSEmbedded {
  const base = newHSState(today);
  if (!input) return base;
  return {
    v: 1,
    startedAt: typeof input.startedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.startedAt) ? input.startedAt : base.startedAt,
    history: input.history && typeof input.history === 'object' ? input.history : {},
    logXP: sanitizeLogXP(input.logXP),
    gateDone: Array.isArray(input.gateDone) ? input.gateDone : [],
    unlockedSkills: Array.isArray(input.unlockedSkills) ? input.unlockedSkills : [],
    badges: Array.isArray(input.badges) ? input.badges : [],
    customQuests: Array.isArray(input.customQuests) ? input.customQuests : [],
    activeIds: Array.isArray(input.activeIds) ? input.activeIds : [],
    profile: input.profile && typeof input.profile === 'object' ? input.profile : {},
  };
}

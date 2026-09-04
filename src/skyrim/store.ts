/**
 * store.ts —— Skyrim 前端 ↔ hs-tracker 引擎的唯一接縫。
 * 引擎（game-core / data-layer / game-engine）是 IIFE 掛在 globalThis 的舊模組，
 * 這裡只負責：載入、取快照、失敗降溫（拿不到本機 DB 時也要能看課表，不能白屏）。
 */
import '../game-core';
import '../db';
import '../data-layer';
import '../game-engine';
import skillsJson from '../../data/skills.json';
import workoutJson from '../../data/workout.json';

export type Stats = {
  totalXP: number; level: number; levelTitle: string; progress: number;
  streak: number; longestStreak: number;
  points: { total: number; spent: number; available: number };
  unlocked: Record<string, boolean>;
  unlockedCount: number;
  ready: boolean; error?: string;
};

export const EMPTY_STATS: Stats = {
  totalXP: 0, level: 1, levelTitle: '灰燼學徒', progress: 0, streak: 0, longestStreak: 0,
  points: { total: 0, spent: 0, available: 0 }, unlocked: {}, unlockedCount: 0, ready: false,
};

const g = () => globalThis as any;

export const skillNodes: any[] = (skillsJson as any).nodes || [];
export const workoutData: any = workoutJson;

/** 升級給 1 點、花點解節點、不可 respec —— 規則本體仍在 GameCore.skillPoints，這裡只是接過去 */
export function pointsFor(level: number, spent: number) {
  const Core = g().GameCore;
  if (Core?.skillPoints) return Core.skillPoints(level, spent, 1);
  const total = Math.max(0, (level || 1) - 1);
  return { total, spent, available: Math.max(0, total - spent) };
}

/** 一次把本機 DB 讀成前端要的快照；任何一步失敗都退回「只有計劃、沒有進度」的狀態 */
export async function loadStats(): Promise<Stats> {
  try {
    const DL = g().DataLayer; const GE = g().GameEngine; const Core = g().GameCore;
    if (!DL || !Core) throw new Error('本機引擎尚未載入');
    if (GE?.init) { try { await GE.init(); } catch { /* 已初始化過就跳過 */ } }
    const totalXP = await DL.getTotalXP();
    const level = Core.levelFor(totalXP);
    const streak = await DL.getWorkoutStreak(new Date().toISOString().slice(0, 10));
    const statuses = await DL.getAllSkillStatuses();
    const unlocked: Record<string, boolean> = {};
    for (const [id, s] of Object.entries(statuses as any)) unlocked[id] = !!(s as any)?.unlocked;
    const unlockedCount = Object.values(unlocked).filter(Boolean).length;
    return {
      totalXP, level: level.level, levelTitle: level.title || '', progress: level.progress || 0,
      streak: streak?.current || 0, longestStreak: streak?.longest || 0,
      points: pointsFor(level.level, unlockedCount), unlocked, unlockedCount, ready: true,
    };
  } catch (e: any) {
    return { ...EMPTY_STATS, error: e?.message || String(e) };
  }
}

/** 打卡：走同一條 DataLayer 路徑（不另寫一套本地存檔，否則兩份真值會打架） */
export async function logExerciseToday(entry: any) {
  const DL = g().DataLayer;
  if (!DL?.logExercise) throw new Error('本機資料庫尚未就緒');
  return DL.logExercise(entry);
}

export async function unlockSkillNode(id: string) {
  const GE = g().GameEngine;
  if (!GE?.tryUnlockSkill) throw new Error('本機資料庫尚未就緒');
  return GE.tryUnlockSkill(id);
}

/* ══════════════════════════════════════════════════════════════════════
   設定卷軸用的接縫（同步／備份／診斷）
   原則：本機 DB、GAS 佇列、匯出匯入的實作全在引擎（data-layer / sync-manager /
   backup / gas-proxy），這裡只做「取用＋降溫」，不在前端另寫一套真值。
   ══════════════════════════════════════════════════════════════════════ */
import '../gas-proxy';
import '../sync-manager';
import '../backup';

export type SyncState = {
  status: 'init' | 'disabled' | 'syncing' | 'retrying' | 'ok' | 'partial' | 'error';
  lastSyncAt: string | null; lastError: string | null;
  pending: number; conflicts: number; disabled: boolean;
};
export const EMPTY_SYNC: SyncState = {
  status: 'init', lastSyncAt: null, lastError: null, pending: 0, conflicts: 0, disabled: false,
};

/** 介面不出現 emoji（使用者的硬要求）；引擎內部的 toast 字串沿用舊文案，在這裡剝除 */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F]/gu;
const strip = (t: any) => String(t ?? '').replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();

export type Toast = { text: string; error?: boolean };
let toastCb: ((t: Toast) => void) | null = null;
export function onToast(cb: (t: Toast) => void) { toastCb = cb; return () => { toastCb = null; }; }
export function toast(text: string, error = false) { toastCb?.({ text: strip(text), error }); }

type ConfirmCb = (message: string) => Promise<boolean>;
let confirmCb: ConfirmCb | null = null;
export function onConfirm(cb: ConfirmCb | null) { confirmCb = cb; }

/**
 * 引擎（backup.ts 等）沿用舊前端的 global.UI。旧前端已刪，所以 shim 一定要裝：
 * 沒裝的話「匯出成功後那句 toast」會在 Chrome（走 showSaveFilePicker 那條路）直接 TypeError。
 */
export function installUiShim() {
  const anyG = g() as any;
  anyG.UI = {
    toast: (msg: any, isError?: any) => toast(String(msg ?? ''), !!isError),
    // 匯入後不再 location.reload()：改叫 React 自己重抓，避免整個 SPA 重載把 SW 更新週期拖長
    softReload: true,
    refresh: async () => { await anyG.App?.refresh?.(); },
    confirm: async (message: string) => (confirmCb ? confirmCb(message) : window.confirm(message)),
  };
  return anyG.UI;
}

/** 訂閱同步狀態：SyncManager 只有單一回調位，所以由這裡統一收發（卸載時還原成 no-op） */
export function subscribeSync(cb: (s: SyncState) => void): () => void {
  const SM = g().SyncManager as any;
  if (!SM) { cb(EMPTY_SYNC); return () => {}; }
  SM.onStateChange = (s: any) => cb({ ...EMPTY_SYNC, ...s });
  cb({ ...EMPTY_SYNC, ...SM.state });
  SM.refreshPending?.().catch(() => {});
  SM.startAuto?.();
  return () => { SM.onStateChange = null; };
}

export async function getSetting(key: string): Promise<string> {
  try { return (await g().DataLayer?.getSetting?.(key)) ?? ''; } catch { return ''; }
}
export async function setSetting(key: string, value: string) {
  const DL = g().DataLayer as any;
  if (!DL?.setSetting) throw new Error('本機資料庫尚未就緒');
  await DL.setSetting(key, value);
}

/** URL 校驗交給 GASProxy（規則只有一份：哪些 URL 收了也同步不了，當場擋，別讓使用者事後猜） */
export function checkGasUrl(raw: string): { clean: string; problem: string | null } {
  const P = g().GASProxy as any;
  const clean = P?.cleanUrl ? P.cleanUrl(raw) : String(raw || '').trim();
  const problem = P?.urlProblem ? P.urlProblem(clean) : null;
  return { clean, problem: problem || null };
}

export async function testConnection(): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await (g().GASProxy as any).ping();
    return { ok: true, detail: `連通：${JSON.stringify(r).slice(0, 120)}` };
  } catch (e: any) {
    return { ok: false, detail: `${e?.kind || 'error'}：${e?.message || e}` };
  }
}

/** 立即同步：skip 的原因要講出來（純離線 ≠ 已同步，這是當初 P0 的一條） */
export async function syncNow(): Promise<{ ok: boolean; summary: string }> {
  const anyG = g() as any;
  try { await anyG.DBManager?.flushNow?.(); } catch { /* 落盤失敗讓 fullSync 去撞，不要在這裡吞 */ }
  const SM = anyG.SyncManager as any;
  if (!SM?.fullSync) return { ok: false, summary: '同步模組尚未載入' };
  try {
    const r = await SM.fullSync();
    if (r?.skipped === 'no-url') return { ok: false, summary: '尚未設定雲端 URL——目前是純離線模式' };
    if (r?.skipped) return { ok: false, summary: `略過：${r.skipped}` };
    return {
      ok: true,
      summary: `下載 ${r.pulled ?? 0} 列・上傳 ${r.pushed ?? 0} 列${r.conflicts ? `・衝突 ${r.conflicts}` : ''}${r.truncated ? '・佇列未清空（再按一次）' : ''}`,
    };
  } catch (e: any) {
    return { ok: false, summary: `同步失敗：${e?.kind || ''} ${e?.message || e}`.trim() };
  }
}

export async function exportBackup() {
  const B = g().BackupManager as any;
  if (!B?.exportJSON) throw new Error('備份模組尚未載入');
  return B.exportJSON();
}
export async function pushBackupToCloud() {
  const B = g().BackupManager as any;
  if (!B?.pushBackupToCloud) throw new Error('備份模組尚未載入');
  return B.pushBackupToCloud();
}
export async function importBackup(file: File) {
  const B = g().BackupManager as any;
  if (!B?.importFromFile) throw new Error('備份模組尚未載入');
  return B.importFromFile(file);
}
/** 清空本機：只刪本機落盤（雲端已同步的列不會被刪）——這句話必須讓使用者看到再按 */
export async function resetLocal() {
  const anyG = g() as any;
  if (!anyG.IDBManager?.delete || !anyG.DBManager?.IDB_KEY) throw new Error('落盤模組尚未提供刪除介面');
  await anyG.IDBManager.delete(anyG.DBManager.IDB_KEY);
  try { await anyG.DBManager.db?.close?.(); } catch { /* 已關就忽略 */ }
  return true;
}

/** 診斷包：我們查不到的東西（UA、SW 是否接管、實際存到的 URL、ping 原文）一次打包，貼回來就能定位 */
export async function diagnostics() {
  const anyG = g() as any;
  const info: Record<string, any> = {
    t: new Date().toISOString(),
    build: buildTag(),
    ua: navigator?.userAgent || '?',
    origin: location?.origin || '?',
    path: location?.pathname || '?',
    sw_controlled: !!navigator?.serviceWorker?.controller,
    gas_url: (await getSetting('gas_url')) || '(未設定)',
    secret_len: String((await getSetting('gas_secret')) || '').length,
    pending: anyG.SyncManager?.state?.pending ?? '?',
    status: anyG.SyncManager?.state?.status ?? 'n/a',
    last_error: anyG.SyncManager?.state?.lastError ?? null,
    persisted: navigator?.storage?.persisted ? await navigator.storage.persisted() : 'n/a',
  };
  try { info.device_id = await anyG.GASProxy?.deviceId?.(); } catch (e: any) { info.device_id_error = String(e?.message || e); }
  try { info.ping = await anyG.GASProxy?.ping(); } catch (e: any) { info.ping_error = `${e?.kind || 'err'}: ${e?.message || e}`; }
  return { info, text: JSON.stringify(info, null, 1) };
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** 版號：build 時由 scripts/web-post.mjs 戳進 <meta name="hs:build">；看不到 sha 就老實說 dev */
export function buildTag(): string {
  const m = document?.querySelector?.('meta[name="hs:build"]')?.getAttribute('content') || '';
  return m || 'dev';
}

export async function reloadConfig() {
  const GE = g().GameEngine as any;
  if (!GE?.loadConfig) throw new Error('引擎尚未載入');
  await GE.loadConfig();
}

export const SYNC_LABEL: Record<SyncState['status'], string> = {
  init: '就緒中', disabled: '純離線（未啟用雲端）', syncing: '同步中', retrying: '重試中',
  ok: '已同步', partial: '部分同步（佇列未清空）', error: '同步失敗',
};

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

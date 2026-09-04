/**
 * src/domain/rules.ts — 純邏輯：等級 / XP / streak / 今日菜單 / 徽章 / 技能解鎖
 * 自舊版 hs-tracker 的 game-core.ts（IIFE 掛 global）移植為 ES module。
 * 規則語意完全不變：
 * - 「今天練什麼」唯一真相 = 本機星期（weekday），不用 daysSinceStart % 7（todo 1.6/1.7 的裁定）
 * - 技能點：每升 1 級給 1 點，花掉不退（不能 respec），available = total - spent
 * - 技能解鎖：依賴全解鎖 + min_xp + 有點數 + min_streak
 * 本檔案沒有 DOM、沒有儲存層，全部是純函式。
 */
import type { WorkoutPlan, SkillNode, BadgeDef } from './data-types';

/* ---------------------------------- 日期工具 ---------------------------------- */

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 'YYYY-MM-DD' → 本機時區的 Date（午夜） */
export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtISO(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function todayISO(): string {
  return fmtISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const dt = parseISO(iso);
  dt.setDate(dt.getDate() + n);
  return fmtISO(dt);
}

/** b - a 的整數天數 */
export function dayDiff(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

/** 週日=0 … 週六=6；非 ISO 回 null */
export function weekdayOf(iso: string): number | null {
  if (!isValidISODate(iso)) return null;
  return parseISO(iso).getDay();
}

/* ---------------------------------- 等級 / XP ---------------------------------- */

export interface LevelDef {
  level: number;
  title: string;
  xpRequired: number;
}

export const LEVELS: LevelDef[] = [
  { level: 1, title: '新手 Novice', xpRequired: 0 },
  { level: 2, title: '學徒 Apprentice', xpRequired: 500 },
  { level: 3, title: '初心者 Beginner', xpRequired: 1500 },
  { level: 4, title: '鍛鍊者 Trainee', xpRequired: 3000 },
  { level: 5, title: '戰士 Warrior', xpRequired: 5000 },
  { level: 6, title: '精銳 Elite', xpRequired: 8000 },
  { level: 7, title: '倒立者 Handstander', xpRequired: 12000 },
  { level: 8, title: '壓者 Presser', xpRequired: 17000 },
  { level: 9, title: '大師 Master', xpRequired: 23000 },
  { level: 10, title: '傳奇 Legend', xpRequired: 30000 },
];

/** 依總 XP 回傳當前等級（取符合的最高者），含進度與距離下一級 */
export function levelFor(totalXP: number) {
  const xp = Number(totalXP) || 0;
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xpRequired) cur = l;
  const next = LEVELS.find((l) => l.xpRequired > xp) || null;
  const span = next ? next.xpRequired - cur.xpRequired : 1;
  const got = next ? xp - cur.xpRequired : 1;
  return {
    ...cur,
    next,
    progress: next ? Math.min(1, got / span) : 1,
    toNext: next ? next.xpRequired - xp : 0,
  };
}

/** 一組動作的 XP 加總（只算 completed） */
export function xpForExercises(exercises: Array<{ completed?: boolean; xp?: number }>): number {
  return (exercises || []).reduce((s, e) => s + (e.completed ? Number(e.xp || 0) : 0), 0);
}

/** streak：連續訓練「日曆日」數；dates = 'YYYY-MM-DD' 且已完成 */
export function streaks(dates: string[], todayISOStr?: string): { current: number; longest: number } {
  const today = todayISOStr || todayISO();
  const set = new Set((dates || []).filter((d) => isValidISODate(d)));
  if (!set.size) return { current: 0, longest: 0 };
  const sorted = [...set].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = dayDiff(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  let current = 0;
  let cursor = today;
  if (!set.has(cursor) && set.has(addDays(cursor, -1))) cursor = addDays(cursor, -1); // 今天還沒練不處罰
  if (!set.has(cursor)) return { current: 0, longest };
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

/* ---------------------------------- 今日菜單 ---------------------------------- */

export interface Exercise {
  name: string;
  xp: number;
  kind: string;
  detail?: string;
  note?: string;
  regression?: string;
}

export interface TodayPlanResult {
  isRestDay: boolean;
  reason?: string;
  today: string;
  weekKey?: string;
  dayKey?: string;
  workout?: Exercise[];
  phaseData?: WorkoutPlan['phases'][string];
  mapped?: boolean;
}

/**
 * 今天該練什麼。單一真相：週日=0 … 週六=6 對應 plan.restDays 或 dayKey。
 * 該 phase 沒定義這個星期幾時，用「本機日曆日」對 start_anchor 做穩定輪替對映。
 */
export function todayPlan(
  workout: WorkoutPlan,
  phase: number,
  opts: { todayISO?: string; restDays?: number[]; startDate?: string } = {}
): TodayPlanResult {
  const restDays = (opts.restDays == null ? [0, 6] : opts.restDays).map(Number);
  const today = opts.todayISO || todayISO();
  const wd = weekdayOf(today);
  if (wd === null || !workout || !workout.phases) return { isRestDay: true, reason: 'no-data', today };
  const weekKeys = workout.days_in_week || ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  if (restDays.includes(wd)) return { isRestDay: true, reason: 'rest', today, weekKey: weekKeys[wd] };

  const phaseData = workout.phases[`phase${phase}`] || null;
  if (!phaseData || !phaseData.days) return { isRestDay: true, reason: 'no-phase', today };

  const days = phaseData.days;
  const weekKey = weekKeys[wd];
  if (days[weekKey]) return { isRestDay: false, dayKey: weekKey, workout: days[weekKey], phaseData, today };

  const keys = Object.keys(days);
  if (!keys.length) return { isRestDay: true, reason: 'empty-phase', today };
  const anchor = phaseData.start_anchor || opts.startDate || today;
  const n = Math.abs(dayDiff(anchor, today) || 0);
  const dayKey = keys[n % keys.length];
  return { isRestDay: false, dayKey, workout: days[dayKey], phaseData, today, mapped: true };
}

/** 由日期推導所屬訓練階段（依 startedAt 起算的週數，落在哪個 phases[].weeks_range） */
export function phaseForDate(workout: WorkoutPlan, dateISO: string, startedAt: string): number {
  const week = Math.max(0, Math.floor(dayDiff(startedAt, dateISO) / 7));
  return phaseForWeek(workout, week);
}

export function phaseForWeek(workout: WorkoutPlan, week: number): number {
  const keys = Object.keys(workout.phases).sort();
  let out = 0;
  for (const k of keys) {
    const p = workout.phases[k];
    const range = p.weeks_range || [0, 0];
    if (week >= range[0]) out = Number(k.replace('phase', '')) || 0;
  }
  return out;
}

/* ---------------------------------- 技能點 / 解鎖 ---------------------------------- */

/**
 * Skyrim 式技能點：每升一級給 1 點（perLevel 可調），點數要「花」在節點上才算解鎖。
 * 不能 respec：總點數由等級推出、已花的由已解鎖節點數推出，不另存可變狀態。
 */
export function skillPoints(level: number, spent: number, perLevel = 1) {
  const lv = Math.max(1, Number(level) || 1);
  const total = (lv - 1) * (Number(perLevel) || 1);
  const used = Math.max(0, Number(spent) || 0);
  return { level: lv, total, spent: used, available: Math.max(0, total - used) };
}

export interface UnlockCtx {
  totalXP?: number;
  streak?: number;
  points?: number;
  unlockedPerks?: string[];
}

export type UnlockWhy = 'no-node' | 'already' | 'deps' | 'xp' | 'no-points' | 'streak';

/** 技能可否解鎖：dependencies 全解鎖 + min_xp + 有點數 + min_streak */
export function canUnlockSkill(
  node: SkillNode | null | undefined,
  statuses: Record<string, { unlocked: boolean }> | null,
  opts: UnlockCtx = {}
): { ok: boolean; why?: UnlockWhy; missing?: string[]; need?: number } {
  if (!node) return { ok: false, why: 'no-node' };
  if (statuses && statuses[node.id] && statuses[node.id].unlocked) return { ok: false, why: 'already' };
  const deps = node.requires || [];
  const missing = deps.filter((d) => !(statuses && statuses[d] && statuses[d].unlocked));
  if (missing.length) return { ok: false, why: 'deps', missing };
  if (node.min_xp != null && (opts.totalXP || 0) < node.min_xp) return { ok: false, why: 'xp', need: node.min_xp };
  if (opts.points != null && Number(opts.points) <= 0) return { ok: false, why: 'no-points', need: 1 };
  if (node.min_streak != null && (opts.streak || 0) < node.min_streak)
    return { ok: false, why: 'streak', need: node.min_streak };
  return { ok: true };
}

/** 供 ConstellationPerks 用的快速閘門（以 id 清單表示已解鎖） */
export function canUnlockSkillNode(
  node: { id: string; requires?: string[]; min_xp?: number; min_streak?: number } | null | undefined,
  ctx: { totalXP?: number; streak?: number; points?: number; unlockedPerks?: string[] }
): { ok: boolean; why?: UnlockWhy; need?: number; missing?: string[] } {
  if (!node) return { ok: false, why: 'no-node' };
  const unlocked = new Set(ctx.unlockedPerks || []);
  if (unlocked.has(node.id)) return { ok: false, why: 'already' };
  const missing = (node.requires || []).filter((d) => !unlocked.has(d));
  if (missing.length) return { ok: false, why: 'deps', missing };
  if (node.min_xp != null && (ctx.totalXP || 0) < node.min_xp) return { ok: false, why: 'xp', need: node.min_xp };
  if (ctx.points == null || Number(ctx.points) <= 0) return { ok: false, why: 'no-points', need: 1 };
  if (node.min_streak != null && (ctx.streak || 0) < node.min_streak)
    return { ok: false, why: 'streak', need: node.min_streak };
  return { ok: true };
}

/* ---------------------------------- 徽章 ---------------------------------- */

export function testCriterion(b: BadgeDef, s: Record<string, number>): boolean {
  const v = Number(s[b.metric] || 0);
  const need = Number(b.value || 0);
  switch (b.op || '>=') {
    case '>=':
      return v >= need;
    case '>':
      return v > need;
    case '<=':
      return v <= need;
    case '==':
      return v === need;
    default:
      return false;
  }
}

/** 徽章判定（純函式，badge defs + 統計 -> 新拿到的 id 清單） */
export function earnedBadges(
  defs: BadgeDef[],
  stats: Record<string, number>,
  already: Record<string, boolean> | string[]
): string[] {
  const has = Array.isArray(already) ? new Set(already) : new Set(Object.keys(already).filter((k) => already[k]));
  const out: string[] = [];
  for (const b of defs || []) {
    if (has.has(b.id)) continue;
    if (testCriterion(b, stats)) out.push(b.id);
  }
  return out;
}

/* ---------------------------------- 週統計 ---------------------------------- */

export function weeklyStats(
  logs: Array<{ log_date: string; completed?: boolean; xp_earned?: number }>,
  weekCount = 8,
  todayISOStr?: string
) {
  const today = todayISOStr || todayISO();
  const buckets = [];
  for (let w = 0; w < weekCount; w++) {
    const end = addDays(today, -7 * w);
    const start = addDays(end, -6);
    const inRange = (logs || []).filter((l) => l.log_date && l.log_date >= start && l.log_date <= end);
    buckets.push({
      start,
      end,
      sessions: inRange.filter((l) => l.completed).length,
      xp: inRange.reduce((s, l) => s + (Number(l.xp_earned) || 0), 0),
    });
  }
  return buckets;
}

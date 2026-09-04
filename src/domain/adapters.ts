/**
 * src/domain/adapters.ts — 「Press-to-Handstand 領域狀態」↔「Test3 Skyrim UI 形狀」的雙向適配層。
 *
 * 設計：
 * - deriveSnapshot(hs)：由領域狀態純推導出 character（CharacterStats）+ quests（Quest[]）+ stats。
 *   XP、等級、點數、徽章、金幣（=streak）、龍魂（=徽章數）全部推導，不存在可漂移的可變狀態。
 * - applyQuestUpdate(hs, updater)：QuestJournal 勾勾 → diff 回 history / gateDone / customQuests / activeIds。
 * - applyProfileUpdate(hs, updater)：角色頁改名／屬性調整 → profile。
 * - unlockSkill(hs, nodeId)：技能樹解鎖 → unlockedSkills（+50 XP 由 derive 統一計）。
 */
import type { CharacterStats, HSEmbedded, Quest, QuestObjective, SkillDefinition } from '../types';
import {
  levelFor,
  skillPoints,
  streaks,
  todayISO,
  addDays,
  weekdayOf,
  phaseForDate,
  phaseForWeek,
  xpForExercises,
} from './rules';
import type { Exercise } from './rules';
import { workoutData, HS_SKILLS } from './data';
import { normalizeHS } from './state';

export interface DerivedStats {
  totalXP: number;
  level: number;
  levelTitle: string;
  levelProgress: number;
  streak: number;
  longestStreak: number;
  totalSessions: number;
  skillsUnlocked: number;
  currentPhase: number;
  weekNumber: number;
}

export interface Snapshot {
  character: CharacterStats;
  quests: Quest[];
  stats: DerivedStats;
  skills: SkillDefinition[];
}

const SKILL_UNLOCK_XP = 50; // 舊 game-engine：解鎖技能節點獎勵 50 XP

/** 由 history 解出每個日期完成的動作（帶當日所屬 phase 的 xp） */
function exercisesForDate(hs: HSEmbedded, date: string): Array<{ ex: Exercise; objId: string } | null> {
  const ids = hs.history[date] || [];
  if (!ids.length) return [];
  const phase = phaseForDate(workoutData, date, hs.startedAt);
  const phaseData = workoutData.phases[`phase${phase}`];
  if (!phaseData) return [];
  const out: Array<{ ex: Exercise; objId: string } | null> = [];
  for (const objId of ids) {
    // id 格式：hs|<date>|<dayKey>|<idx>
    const parts = objId.split('|');
    const dayKey = parts[2];
    const idx = Number(parts[3]);
    const ex = phaseData.days?.[dayKey]?.[idx];
    out.push(ex ? { ex, objId } : null);
  }
  return out;
}

export function computeStats(hs: HSEmbedded, today = todayISO()): DerivedStats {
  const dates = Object.keys(hs.history).filter((d) => (hs.history[d] || []).length > 0);
  let sessionXP = 0;
  for (const d of dates) {
    for (const item of exercisesForDate(hs, d)) {
      if (item) sessionXP += Number(item.ex.xp || 0);
    }
  }
  const totalXP = sessionXP + hs.unlockedSkills.length * SKILL_UNLOCK_XP;
  const lvl = levelFor(totalXP);
  const streak = streaks(dates, today);
  const weekNumber = Math.max(0, Math.floor((Date.parse(today) - Date.parse(hs.startedAt)) / 604800000));
  return {
    totalXP,
    level: lvl.level,
    levelTitle: lvl.title,
    levelProgress: lvl.progress,
    streak: streak.current,
    longestStreak: streak.longest,
    totalSessions: dates.length,
    skillsUnlocked: hs.unlockedSkills.length,
    currentPhase: phaseForWeek(workoutData, weekNumber),
    weekNumber,
  };
}

function branchMastery(skillId: string, unlocked: string[]): number {
  const skill = HS_SKILLS.find((s) => s.id === skillId);
  if (!skill || !skill.perks.length) return 15;
  const got = skill.perks.filter((p) => unlocked.includes(p.id)).length;
  return 15 + Math.round((got / skill.perks.length) * 85);
}

function objectivesFromExercises(date: string, dayKey: string, exercises: Exercise[], doneIds: string[]): QuestObjective[] {
  const done = new Set(doneIds);
  return exercises.map((ex, i) => {
    const id = `hs|${date}|${dayKey}|${i}`;
    return {
      id,
      text: `${ex.name}（+${ex.xp} XP）${ex.detail ? ` · ${ex.detail}` : ''}`,
      completed: done.has(id),
    };
  });
}

/** 產生本週＋上週的訓練日任務（與舊 todayPlan 相同的 weekday 真相與 mapped 規則） */
function buildWorkoutQuests(hs: HSEmbedded, today: string): Quest[] {
  const quests: Quest[] = [];
  const restDays = (workoutData.rest_days ?? [0, 6]).map(Number);
  const weekKeys = workoutData.days_in_week || ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const wdToday = weekdayOf(today) ?? 0;
  const thisSunday = addDays(today, -wdToday); // 週日為一週之首（與 days_in_week 對齊）

  const weekStarts = [0, -7]; // 本週、上週
  for (const offset of weekStarts) {
    const sunday = addDays(thisSunday, offset);
    for (let wd = 0; wd < 7; wd++) {
      const date = addDays(sunday, wd);
      if (restDays.includes(wd)) continue;
      const phase = phaseForDate(workoutData, date, hs.startedAt);
      const phaseData = workoutData.phases[`phase${phase}`];
      if (!phaseData || !phaseData.days) continue;
      const weekKey = weekKeys[wd];
      let dayKey = weekKey;
      let exercises = phaseData.days[weekKey];
      let mapped = false;
      if (!exercises) {
        const keys = Object.keys(phaseData.days);
        if (!keys.length) continue;
        const anchor = phaseData.start_anchor || hs.startedAt;
        const n = Math.abs(Math.round((Date.parse(date) - Date.parse(anchor)) / 86400000));
        dayKey = keys[n % keys.length];
        exercises = phaseData.days[dayKey];
        mapped = true;
      }
      if (!exercises || !exercises.length) continue;

      const meta = phaseData.day_meta?.[dayKey];
      const doneIds = hs.history[date] || [];
      const sessionXp = xpForExercises(exercises.map((ex) => ({ completed: true, xp: ex.xp })));
      quests.push({
        id: `hs|${date}|${dayKey}`,
        title: `${date === today ? '今日' : ''}${meta?.label || weekKey} · ${date}`,
        titleEn: `${phaseData.title} · W${phaseData.weeks_range?.[0] ?? '?'}${mapped ? ' (mapped)' : ''}`,
        category: 'faction',
        description: [
          `階段：${phaseData.title}（第 ${phaseData.weeks_range?.[0]}–${phaseData.weeks_range?.[1]} 週）`,
          phaseData.focus ? `聚焦：${phaseData.focus}` : '',
          meta?.minutes ? `時長：約 ${meta.minutes} 分鐘` : '',
          mapped ? '（此日由課表輪替對映）' : '',
        ]
          .filter(Boolean)
          .join('\n'),
        location: meta?.place || '訓練場',
        objectives: objectivesFromExercises(date, dayKey, exercises, doneIds),
        completed: doneIds.length > 0 && doneIds.length >= (exercises.length || 1),
        active: hs.activeIds.includes(`hs|${date}|${dayKey}`),
        rewardXp: sessionXp,
        rewardGold: 0,
        rewardDragonSouls: 0,
      });
    }
  }
  return quests.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** 主線：各階段的畢業關卡（gate checklist，手動勾選） */
function buildGateQuests(hs: HSEmbedded): Quest[] {
  const out: Quest[] = [];
  const keys = Object.keys(workoutData.phases).sort();
  for (const k of keys) {
    const phaseData = workoutData.phases[k];
    const phaseNum = Number(k.replace('phase', '')) || 0;
    if (!phaseData.gate || !phaseData.gate.length) continue;
    const done = new Set(hs.gateDone);
    out.push({
      id: `hs|gate|${phaseNum}`,
      title: `階段畢業關卡：${phaseData.title}`,
      titleEn: `Phase ${phaseNum} Gate`,
      category: 'main',
      description: [phaseData.gate_note || '通過全部項目才算進入下一階段。', phaseData.focus ? `階段聚焦：${phaseData.focus}` : '']
        .filter(Boolean)
        .join('\n'),
      location: '評估日',
      objectives: phaseData.gate.map((text, i) => {
        const id = `hs|gate|${phaseNum}|${i}`;
        return { id, text, completed: done.has(id) };
      }),
      completed: phaseData.gate.every((_, i) => done.has(`hs|gate|${phaseNum}|${i}`)),
      active: hs.activeIds.includes(`hs|gate|${phaseNum}`),
      rewardXp: 0,
      rewardGold: 0,
      rewardDragonSouls: 1,
    });
  }
  return out;
}

function buildCustomQuests(hs: HSEmbedded): Quest[] {
  return (hs.customQuests || []).map((q) => ({ ...q, active: hs.activeIds.includes(q.id) }));
}

export function deriveSnapshot(
  input: HSEmbedded | Partial<HSEmbedded> | null | undefined,
  today = todayISO()
): Snapshot {
  const hs = normalizeHS(input, today);
  const stats = computeStats(hs, today);
  const lvl = levelFor(stats.totalXP);
  const pts = skillPoints(stats.level, hs.unlockedSkills.length, 1);

  const quests: Quest[] = [...buildWorkoutQuests(hs, today), ...buildGateQuests(hs), ...buildCustomQuests(hs)];

  const character: CharacterStats = {
    name: hs.profile.name || '龍裔訓練者',
    title: lvl.title,
    race: hs.profile.race || 'Press to Handstand · 52 週計畫',
    level: stats.level,
    currentXp: Math.round(stats.totalXP - lvl.xpRequired),
    requiredXp: lvl.next ? lvl.next.xpRequired - lvl.xpRequired : 1,
    perkPoints: pts.available,
    dragonSouls: hs.badges.length,
    gold: stats.streak,
    health: hs.profile.health ?? 100,
    maxHealth: hs.profile.maxHealth ?? 100,
    magicka: hs.profile.magicka ?? 100,
    maxMagicka: hs.profile.maxMagicka ?? 100,
    stamina: hs.profile.stamina ?? 100,
    maxStamina: hs.profile.maxStamina ?? 100,
    skills: Object.fromEntries(HS_SKILLS.map((s) => [s.id, branchMastery(s.id, hs.unlockedSkills)])),
    legendarySkills: {},
    unlockedPerks: [...hs.unlockedSkills],
    hs: { ...hs, derived: { totalXP: stats.totalXP, streak: stats.streak, longestStreak: stats.longestStreak, totalSessions: stats.totalSessions, currentPhase: stats.currentPhase, weekNumber: stats.weekNumber } },
  };

  return { character, quests, stats, skills: HS_SKILLS };
}

/* ------------------------- 反向：UI 事件 → 領域狀態 ------------------------- */

function sameObjectives(a: QuestObjective[], b: QuestObjective[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].completed !== b[i].completed) return false;
  }
  return true;
}

/**
 * QuestJournal 的 onUpdateQuests(updater) → diff 回領域狀態。
 * 只接受三種寫入：workout objectives、gate objectives、custom quests 內容；active 追蹤旗標。
 * （XP／金幣／龍魂由 derive 統一計算，忽略 UI 端直接寫進 character 的值。）
 */
export function applyQuestUpdate(hs: HSEmbedded, updater: (prev: Quest[]) => Quest[], today = todayISO()): HSEmbedded {
  const snap = deriveSnapshot(hs, today);
  const prevQuests = snap.quests;
  const nextQuests = updater(prevQuests);

  const next: HSEmbedded = {
    ...hs,
    history: { ...hs.history },
    gateDone: [...hs.gateDone],
    customQuests: hs.customQuests.map((q) => ({ ...q })),
    activeIds: [],
  };

  const customPrev = new Map(hs.customQuests.map((q) => [q.id, q]));

  for (const q of nextQuests) {
    if (q.active) next.activeIds.push(q.id);

    if (q.custom) {
      const prevCustom = customPrev.get(q.id);
      if (!prevCustom || JSON.stringify(prevCustom) !== JSON.stringify(q)) {
        const exists = next.customQuests.findIndex((c) => c.id === q.id);
        if (exists >= 0) next.customQuests[exists] = { ...q };
        else next.customQuests.push({ ...q });
      }
      continue;
    }

    if (q.id.startsWith('hs|gate|')) {
      const prevGate = prevQuests.find((p) => p.id === q.id);
      if (!prevGate || !sameObjectives(prevGate.objectives, q.objectives)) {
        const doneSet = new Set(next.gateDone);
        for (const o of q.objectives) {
          if (o.completed) doneSet.add(o.id);
          else doneSet.delete(o.id);
        }
        next.gateDone = [...doneSet];
      }
      continue;
    }

    if (q.id.startsWith('hs|')) {
      const parts = q.id.split('|');
      const date = parts[1];
      const prevDay = prevQuests.find((p) => p.id === q.id);
      if (!prevDay || !sameObjectives(prevDay.objectives, q.objectives)) {
        const doneIds = q.objectives.filter((o) => o.completed).map((o) => o.id);
        if (doneIds.length) next.history[date] = doneIds;
        else delete next.history[date];
      }
      continue;
    }
  }

  return next;
}

/** 角色頁的個人檔／屬性調整：只接受 profile 欄位，其餘（等級、XP、金幣…）一律以推導為準 */
export function applyProfileUpdate(hs: HSEmbedded, updater: (prev: CharacterStats) => CharacterStats): HSEmbedded {
  const snap = deriveSnapshot(hs);
  const updated = updater(snap.character);
  const p = hs.profile || {};
  return {
    ...hs,
    profile: {
      ...p,
      name: updated.name !== snap.character.name ? updated.name : p.name,
      race: updated.race !== snap.character.race ? updated.race : p.race,
      health: updated.health !== snap.character.health ? updated.health : p.health,
      maxHealth: updated.maxHealth !== snap.character.maxHealth ? updated.maxHealth : p.maxHealth,
      magicka: updated.magicka !== snap.character.magicka ? updated.magicka : p.magicka,
      maxMagicka: updated.maxMagicka !== snap.character.maxMagicka ? updated.maxMagicka : p.maxMagicka,
      stamina: updated.stamina !== snap.character.stamina ? updated.stamina : p.stamina,
      maxStamina: updated.maxStamina !== snap.character.maxStamina ? updated.maxStamina : p.maxStamina,
    },
  };
}

/** 技能樹解鎖（ConstellationPerks）：規則已在元件端用 canUnlockSkillNode 驗證過 */
export function unlockSkill(hs: HSEmbedded, nodeId: string): HSEmbedded {
  if (hs.unlockedSkills.includes(nodeId)) return hs;
  return { ...hs, unlockedSkills: [...hs.unlockedSkills, nodeId] };
}

/** 今日是否為休息日（週日/週六，或無課表） */
export function isRestDayToday(hs: HSEmbedded, today = todayISO()): boolean {
  const wd = weekdayOf(today);
  if (wd === null) return true;
  return (workoutData.rest_days ?? [0, 6]).map(Number).includes(wd);
}

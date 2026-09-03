// src/game-core.ts — 純邏輯：等級 / XP / streak / 今日菜單 / 徽章 / 技能解鎖
// 沒有 DOM、沒有 SQL，可在 node 單測。規格缺陷 todo 1.6、1.7 在此落地：
// 「今天練什麼」只有一個真相來源 = 本機星期（weekday），不再用 daysSinceStart % 7。
(function (global) {
  'use strict';
  const D = global.DateUtils;

  const LEVELS = [
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

  /** 依總 XP 回傳當前等級（取符合的最高者） */
  function levelFor(totalXP) {
    const xp = Number(totalXP) || 0;
    let cur = LEVELS[0];
    for (const l of LEVELS) if (xp >= l.xpRequired) cur = l;
    const next = LEVELS.find((l) => l.xpRequired > xp) || null;
    const span = next ? next.xpRequired - cur.xpRequired : 1;
    const got = next ? xp - cur.xpRequired : 1;
    return {
      ...cur, next,
      progress: next ? Math.min(1, got / span) : 1,
      toNext: next ? next.xpRequired - xp : 0,
    };
  }

  /** 一組動作的 XP 加總（只算 completed） */
  function xpForExercises(exercises) {
    return (exercises || []).reduce((s, e) => s + (e.completed ? Number(e.xp || 0) : 0), 0);
  }

  /** streak：連續訓練「日曆日」數；dates = 'YYYY-MM-DD' 且已完成 */
  function streaks(dates, todayISO) {
    const set = new Set((dates || []).filter((d) => D.isValidISODate(d)));
    if (!set.size) return { current: 0, longest: 0 };
    const sorted = [...set].sort();
    let longest = 1, run = 1;
    for (let i = 1; i < sorted.length; i++) {
      run = D.dayDiff(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
      if (run > longest) longest = run;
    }
    let current = 0;
    let cursor = todayISO;
    if (!set.has(cursor) && set.has(D.addDays(cursor, -1))) cursor = D.addDays(cursor, -1); // 今天還沒練不處罰
    if (!set.has(cursor)) return { current: 0, longest };
    while (set.has(cursor)) { current++; cursor = D.addDays(cursor, -1); }
    return { current, longest };
  }

  /**
   * 今天該練什麼。單一真相：週日=0 … 週六=6 對應 plan.restDays 或 dayKey。
   * @param workout  data/workout.tson
   * @param phase    0..4
   * @param opts     {todayISO, restDays:[0,6], dayOrder:['mon',...]}
   */
  function todayPlan(workout, phase, opts: any = {}) {
    const restDays = (opts.restDays == null ? [0, 6] : opts.restDays).map(Number);
    const today = opts.todayISO || D.todayISO();
    const wd = D.weekdayOf(today);
    if (wd === null || !workout || !workout.phases) return { isRestDay: true, reason: 'no-data', today };
    const weekKeys = workout.days_in_week || ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    if (restDays.includes(wd)) return { isRestDay: true, reason: 'rest', today, weekKey: weekKeys[wd] };

    const phaseData = workout.phases[`phase${phase}`] || null;
    if (!phaseData || !phaseData.days) return { isRestDay: true, reason: 'no-phase', today };

    const days = phaseData.days;
    const weekKey = weekKeys[wd];
    if (days[weekKey]) return { isRestDay: false, dayKey: weekKey, workout: days[weekKey], phaseData, today };

    // 該 phase 沒有「這個星期幾」的課表（例如只定義 mon..fri 而今天是六）：
    // 用本機日曆日做穩定對映 —— 同一天必然得到同一結果，不再隨 Date.now() 漂移（todo 1.7）
    const keys = Object.keys(days);
    if (!keys.length) return { isRestDay: true, reason: 'empty-phase', today };
    const anchor = phaseData.start_anchor || opts.startDate || today;
    const n = Math.abs(D.dayDiff(anchor, today) || 0);
    const dayKey = keys[n % keys.length];
    return { isRestDay: false, dayKey, workout: days[dayKey], phaseData, today, mapped: true };
  }

  /**
   * Skyrim 式技能點：每升一級給 1 點（`perLevel` 可调），點數要「花」在節點上才算解鎖。
   * 像 Skyrim 一樣不能 respec：花掉的點不退，所以 available = total - 已花。
   * 為什麼不另開一張帳：總點數完全由等級推出、已花的由「已解鎖節點數」推出 ——
   * 多存一份可變狀態就會出現「點數對不上」的 bug（本專案已被兩個枚舉/兩種真值咬過兩次）。
   */
  function skillPoints(level, spent, perLevel: number = 1) {
    const lv = Math.max(1, Number(level) || 1);
    const total = (lv - 1) * (Number(perLevel) || 1);
    const used = Math.max(0, Number(spent) || 0);
    return { level: lv, total, spent: used, available: Math.max(0, total - used) };
  }

  /** 技能可否解鎖：需 dependencies 全解鎖 + 前一段 phase 完成度 + 還有點數可花 */
  function canUnlock(node, statuses, opts: any = {}) {
    if (!node) return { ok: false, why: 'no-node' };
    if (statuses && statuses[node.id] && statuses[node.id].unlocked) return { ok: false, why: 'already' };
    const deps = node.requires || [];
    const missing = deps.filter((d) => !(statuses && statuses[d] && statuses[d].unlocked));
    if (missing.length) return { ok: false, why: 'deps', missing };
    if (node.min_xp != null && (opts.totalXP || 0) < node.min_xp) return { ok: false, why: 'xp', need: node.min_xp };
    if (opts.points != null && Number(opts.points) <= 0) return { ok: false, why: 'no-points', need: 1 };
    if (node.min_streak != null && (opts.streak || 0) < node.min_streak) return { ok: false, why: 'streak', need: node.min_streak };
    return { ok: true };
  }

  /** 徽章判定（純函式，badge defs + 統計 -> 拿到的 id 清單） */
  function earnedBadges(defs, stats, already: any = {}) {
    const out = [];
    for (const b of defs || []) {
      if (already[b.id]) continue;
      if (testCriterion(b, stats)) out.push(b.id);
    }
    return out;
  }

  function testCriterion(b, s) {
    const v = Number(s[b.metric] || 0), need = Number(b.value || 0);
    switch (b.op || '>=') {
      case '>=': return v >= need;
      case '>': return v > need;
      case '<=': return v <= need;
      case '==': return v === need;
      default: return false;
    }
  }

  /** 週統計：按 ISO 週（本機日曆）分組 */
  function weeklyStats(logs, weekCount = 8, todayISO) {
    const today = todayISO || D.todayISO();
    const buckets = [];
    for (let w = 0; w < weekCount; w++) {
      const end = D.addDays(today, -7 * w);
      const start = D.addDays(end, -6);
      const inRange = (logs || []).filter((l) => {
        const d = l.log_date;
        return d && d >= start && d <= end;
      });
      buckets.push({
        start, end,
        sessions: inRange.filter((l) => l.completed).length,
        xp: inRange.reduce((s, l) => s + (Number(l.xp_earned) || 0), 0),
      });
    }
    return buckets;
  }

  const GameCore = {
    LEVELS, levelFor, xpForExercises, streaks, todayPlan, canUnlock, skillPoints, earnedBadges, weeklyStats,
  };
  global.GameCore = GameCore;
})(typeof window !== 'undefined' ? window : globalThis);

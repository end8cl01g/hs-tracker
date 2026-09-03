// src/game-engine.ts — 載設定檔（data/*.tson）＋把 DB 狀態攪成 UI 要的視圖模型
// 規格缺陷 todo 1.2：config 一律用**相對路徑**，由 SW 做 network-first；
// 不使用任何 CDN。Part 1 缺件的語意在此重寫為單一實作來源。
(function (global) {
  'use strict';
  const D = global.DateUtils, Core = global.GameCore, DL = () => global.DataLayer;

  const GameEngine = {
    workoutData: null, skillTreeData: null, badgesData: null,
    configMeta: {},

    /** @param {Function} [fetchImpl] 單測可注入 */
    async loadConfig(fetchImpl) {
      const f: any = fetchImpl || ((...a: any[]) => (fetch as any)(...a));
      const files = { workout: 'data/workout.json', skills: 'data/skills.json', badges: 'data/badges.json' };
      const out: any = {};
      const results = await Promise.all(Object.entries(files).map(async ([k, url]) => {
        try {
          const r = await f(url, { cache: 'no-store' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return [k, await r.json(), null];
        } catch (e) { return [k, null, e]; }
      }));
      for (const [k, json, err] of results) {
        if (err) { out[k] = { ok: false, error: err.message }; continue; }
        out[k] = { ok: true, version: json.version, updated_at: json.updated_at };
        if (k === 'workout') this.workoutData = json;
        if (k === 'skills') this.skillTreeData = json;
        if (k === 'badges') this.badgesData = json;
      }
      this.configMeta = out;
      const failed = Object.entries(out).filter(([, v]) => !(v as any).ok);
      if (failed.length) throw new Error(`設定檔載入失敗：${failed.map(([k]) => k).join(', ')}（檢查 data/ 是否部署）`);
      return out;
    },

    /** 依起始日與 phase 天數推目前 phase */
    currentPhaseFor(startDateISO, startPhase = 0) {
      const wd = this.workoutData;
      if (!startDateISO || !wd) return Number(startPhase) || 0;
      const weeks = ['phase0', 'phase1', 'phase2', 'phase3', 'phase4'].map((p) => (wd.phases[p] && wd.phases[p].weeks) || 0);
      const weeksSince = Math.max(0, Math.floor((D.dayDiff(startDateISO, D.todayISO()) || 0) / 7));
      let acc = 0, idx = Number(startPhase) || 0;
      for (let i = 0; i < weeks.length; i++) {
        acc += weeks[i];
        if (weeksSince < acc) { idx = i; break; }
        idx = i;
      }
      return idx;
    },

    /** 產生整份視圖模型給 UI */
    async buildViewModel(todayISO) {
      const today = todayISO || D.todayISO();
      const settings = await DL().getAllSettings();
      const phase = this.currentPhaseFor(settings.startDate, Number(settings.currentPhase || 0));
      const plan = Core.todayPlan(this.workoutData, phase, {
        todayISO: today,
        restDays: (this.workoutData && this.workoutData.rest_days) || [0, 6],
        startDate: settings.startDate,
      });
      const logs = await DL().getRecentWorkouts(60);
      const todayLog = logs.find((l) => l.log_date === today) || null;
      const exercises = todayLog ? await DL().getExerciseLogs(today) : [];
      const totalXP = await DL().getTotalXP();
      const level = Core.levelFor(totalXP);
      const streak = await DL().getWorkoutStreak(today);
      const skillStatuses = await DL().getAllSkillStatuses();
      const badgeStatuses = await DL().getAllBadgeStatuses();
      const unlocked = await DL().getUnlockedCount();
      const weekly = await DL().getWeeklyStats(8);

      return {
        today, settings, phase, plan, todayLog, exercises,
        totalXP, level, streak, skillStatuses, badgeStatuses, unlockedCount: unlocked, weekly,
        points: Core.skillPoints(level.level, unlocked),
        skillNodes: (this.skillTreeData && this.skillTreeData.nodes) || [],
        badges: (this.badgesData && this.badgesData.badges) || [],
        kindLabels: (this.workoutData && this.workoutData.kind_labels) || {},
        configMeta: this.configMeta,
      };
    },

    /** 打卡：寫入今日 → 判定徽章 → 回傳本次新增（給動畫用） */
    async submitToday(vm, { completed, notes, exercises }) {
      const res = await DL().logWorkout({
        date: vm.today, phase: vm.phase, dayType: vm.plan.dayKey || 'rest',
        completed, notes, exercises,
      });
      const newBadges = await this.evaluateBadges();
      return { row: res, newBadges };
    },

    /** 依目前統計重算徽章；只「新增」，不回收（append-only，避免兩機互蓋） */
    async evaluateBadges() {
      const stats = await this.badgeStats();
      const have = await DL().getAllBadgeStatuses();
      const defs = (this.badgesData && this.badgesData.badges) || [];
      const earned = Core.earnedBadges(defs, stats, have);
      const fresh = [];
      for (const id of earned) { if (await DL().earnBadge(id)) fresh.push(id); }
      return fresh;
    },

    async badgeStats() {
      const total_sessions = await DL().getTotalWorkoutsCompleted();
      const total_xp = await DL().getTotalXP();
      const streak = await DL().getWorkoutStreak();
      const skills_unlocked = await DL().getUnlockedCount();
      return {
        total_sessions, total_xp,
        streak_current: streak.current, streak_longest: streak.longest,
        skills_unlocked,
        level: Core.levelFor(total_xp).level,
        total_syncs: Number((await DL().getSetting('total_syncs')) || 0),
      };
    },

    /** 手動解鎖技能（含依賴檢查） */
    async tryUnlockSkill(nodeId) {
      const node = ((this.skillTreeData && this.skillTreeData.nodes) || []).find((n) => n.id === nodeId);
      const statuses = await DL().getAllSkillStatuses();
      const stats = await this.badgeStats();
      const spent = await DL().getUnlockedCount();
      const pts = Core.skillPoints(Core.levelFor(stats.total_xp).level, spent);
      const check = Core.canUnlock(node, statuses, { totalXP: stats.total_xp, streak: stats.streak_current, points: pts.available });
      if (!check.ok) return { ...check, points: pts };
      await DL().unlockSkill(nodeId);
      await DL().addXP(50, `skill ${nodeId}`, nodeId);
      return { ok: true, node, points: pts };
    },
  };
  global.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);

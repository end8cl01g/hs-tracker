// src/data-layer.ts — 對 DBManager 的唯一資料存取面（規格 Part 1 缺件，語意在此重寫並寫明）
// 全部寫入都帶本機時間戳 updated_at（todo 1.6），衝突解決採 LWW + 記錄（見 upsertWithConflictResolution）。
(function (global) {
  'use strict';
  const DB = global.DBManager;
  const D = global.DateUtils;

  const TABLES = {
    workout_logs: { pk: 'id', cols: ['id', 'log_date', 'phase', 'day_type', 'location', 'completed', 'notes', 'xp_earned', 'created_at', 'updated_at', 'synced', 'deleted'] },
    exercise_logs: { pk: 'id', cols: ['id', 'log_date', 'exercise_index', 'exercise_name', 'completed', 'xp', 'workout_log_id', 'phase', 'created_at', 'updated_at', 'synced'] },
    skill_progress: { pk: 'skill_id', cols: ['skill_id', 'unlocked', 'date_unlocked', 'video_url', 'notes', 'created_at', 'updated_at', 'synced'] },
    badges: { pk: 'badge_id', cols: ['badge_id', 'earned', 'date_earned', 'created_at', 'updated_at', 'synced'] },
    xp_log: { pk: 'id', cols: ['id', 'amount', 'reason', 'related_id', 'created_at', 'updated_at', 'synced'] },
  };

  const bool = (v) => (v ? 1 : 0);
  // 一律 UTC（...Z）：GAS 端 nowISO_() 也是 toISOString()，兩邊不同枚舉就不能比大小。
  // 以前這裡用 DateUtils.nowStamp()（本機時區 +08:00），實測與雲端的 Z 混存後，
  // 字串比較會選錯勝者（07:00+08:00 比 00:30Z「小」，其實是較晚），LWW 與 since 游標一起錯。
  const stamp = () => new Date().toISOString();

  /** 解析成 epoch ms；解析不了＝0（最舊）。缺時間戳的列一律輸給有時間戳的。 */
  function tsMs(v: any): number {
    const t = Date.parse(String((v && (v as any).updated_at) || ''));
    return Number.isNaN(t) ? 0 : t;
  }
  /** 把任何 ISO 變形（+08:00、缺毫秒）歸一成 UTC Z；解析不了就原樣留著，別把資料弄丟 */
  function toZ(v: any): string {
    const raw = String(v == null ? '' : v);
    if (!raw) return '';
    const t = Date.parse(raw);
    return Number.isNaN(t) ? raw : new Date(t).toISOString();
  }

  /** 較新的 updated_at 勝（數值比較，容得下舊資料殘留的 +08:00 格式） */
  function newer(a, b) {
    const x = tsMs(a), y = tsMs(b);
    if (!x && !y) return 0;
    if (!x) return -1;
    if (!y) return 1;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  /** 刪除語意：workout_logs 用 deleted 旗標；雲端也把 op=delete 當墓碑 */
  function isTombstone(r: any): boolean {
    return !!(r && (r.deleted || r._deleted || r.op === 'delete'));
  }

  function insertRow(table, obj) {
    const spec = TABLES[table];
    const cols = spec.cols.filter((c) => obj[c] !== undefined);
    const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
    DB.run(sql, cols.map((c) => obj[c]));
  }

  const DataLayer = {
    TABLES,

    // ---------- settings ----------
    getSetting(key) {
      const r = DB.getRow('SELECT value FROM settings WHERE key = ?', [key]);
      return Promise.resolve(r ? r.value : null);
    },
    setSetting(key, value) {
      DB.run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,?)', [key, value == null ? null : String(value), stamp()]);
      return Promise.resolve();
    },
    async getAllSettings() {
      const rows = DB.query('SELECT key, value FROM settings');
      return rows.reduce((m, r) => ((m[r.key] = r.value), m), {});
    },

    // ---------- workout log ----------
    /** 同一天同一 phase 只留一列（覆寫式），回傳該列 */
    logWorkout({ date, phase, dayType, completed, notes = '', location = null, exercises = [] }) {
      const iso = date || D.todayISO();
      return DB.tx(() => {
        const existing = DB.getRow('SELECT * FROM workout_logs WHERE log_date = ? ORDER BY updated_at DESC LIMIT 1', [iso]);
        const now = stamp();
        const xp = exercises.reduce((s, e) => s + (e.completed ? Number(e.xp || 0) : 0), 0);
        const row = {
          id: existing ? existing.id : DB.newId(),
          log_date: iso, phase: Number(phase) || 0, day_type: dayType || '', location,
          completed: bool(completed), notes, xp_earned: xp,
          created_at: existing ? existing.created_at : now, updated_at: now, synced: 0, deleted: 0,
        };
        insertRow('workout_logs', row);
        DB.run('DELETE FROM exercise_logs WHERE workout_log_id = ?', [row.id]);
        exercises.forEach((e, i) => insertRow('exercise_logs', {
          id: DB.newId(), log_date: iso, exercise_index: i, exercise_name: e.name || `#${i + 1}`,
          completed: bool(e.completed), xp: Number(e.xp || 0), workout_log_id: row.id,
          phase: row.phase, created_at: now, updated_at: now, synced: 0,
        }));
        if (xp > 0) DataLayer._addXPRow(xp, `workout ${iso}`, row.id);
        return row;
      });
    },
    getWorkoutLog(iso) { return Promise.resolve(DB.getRow('SELECT * FROM workout_logs WHERE log_date = ?', [iso])); },
    getRecentWorkouts(n = 14) { return Promise.resolve(DB.query('SELECT * FROM workout_logs WHERE deleted = 0 ORDER BY log_date DESC LIMIT ?', [Number(n)])); },
    getTotalWorkoutsCompleted() {
      // deleted = 0：軟刪除的日誌不能還算進「完成天數」（曾與 getWorkoutStreak 不一致）
      return Promise.resolve(Number(DB.getRow('SELECT COUNT(*) AS c FROM workout_logs WHERE completed = 1 AND deleted = 0')?.c || 0));
    },
    /** streak 只吃 completed=1 且未刪除的 log_date */
    async getWorkoutStreak(todayISO) {
      const rows = DB.query('SELECT DISTINCT log_date FROM workout_logs WHERE completed = 1 AND deleted = 0');
      return D ? global.GameCore.streaks(rows.map((r) => r.log_date), todayISO || D.todayISO()) : { current: 0, longest: 0 };
    },
    async deleteWorkoutLog(iso) {
      DB.tx(() => {
        const r = DB.getRow('SELECT id FROM workout_logs WHERE log_date = ?', [iso]);
        if (r) { DB.run('UPDATE workout_logs SET deleted = 1, synced = 0, updated_at = ? WHERE id = ?', [stamp(), r.id]); }
        DB.run('DELETE FROM exercise_logs WHERE log_date = ?', [iso]);
      });
      return Promise.resolve();
    },

    // ---------- exercise ----------
    logExercise(p) { return Promise.resolve(insertRow('exercise_logs', { id: p.id || DB.newId(), created_at: stamp(), updated_at: stamp(), synced: 0, ...p })); },
    getExerciseLogs(iso) { return Promise.resolve(DB.query('SELECT * FROM exercise_logs WHERE log_date = ? ORDER BY exercise_index', [iso])); },
    updateExercise(id, patch) {
      const cols = Object.keys(patch).filter((k) => TABLES.exercise_logs.cols.includes(k) && k !== 'id');
      if (!cols.length) return Promise.resolve(false);
      const set = cols.map((c) => `${c} = ?`).join(', ');
      DB.run(`UPDATE exercise_logs SET ${set}, updated_at = ?, synced = 0 WHERE id = ?`,
        [...cols.map((c) => patch[c]), stamp(), id]);
      return Promise.resolve(true);
    },

    // ---------- skills ----------
    unlockSkill(skillId, { videoUrl = '', notes = '' } = {}) {
      const now = stamp();
      const cur = DB.getRow('SELECT * FROM skill_progress WHERE skill_id = ?', [skillId]);
      insertRow('skill_progress', {
        skill_id: skillId, unlocked: 1, date_unlocked: cur?.date_unlocked || (D ? D.todayISO() : now.slice(0, 10)),
        video_url: videoUrl || cur?.video_url || '', notes: notes || cur?.notes || '',
        created_at: cur?.created_at || now, updated_at: now, synced: 0,
      });
      return Promise.resolve(true);
    },
    setSkillMeta(skillId, { videoUrl = '', notes = '' } = {}) {
      const now = stamp();
      const cur = DB.getRow('SELECT * FROM skill_progress WHERE skill_id = ?', [skillId]);
      insertRow('skill_progress', {
        skill_id: skillId, unlocked: cur?.unlocked ? 1 : 0,
        date_unlocked: cur?.date_unlocked || null, video_url: videoUrl, notes: notes,
        created_at: cur?.created_at || now, updated_at: now, synced: 0,
      });
      return Promise.resolve(true);
    },
    getSkillStatus(skillId) { return Promise.resolve(DB.getRow('SELECT * FROM skill_progress WHERE skill_id = ?', [skillId])); },
    getAllSkillStatuses() {
      return Promise.resolve(DB.query('SELECT * FROM skill_progress').reduce((m, r) => ((m[r.skill_id] = r), m), {}));
    },
    getUnlockedCount() { return Promise.resolve(Number(DB.getRow('SELECT COUNT(*) AS c FROM skill_progress WHERE unlocked = 1')?.c || 0)); },

    // ---------- badges（附 updated_at，讓 LWW 對徽章有意義：todo 1.5）----------
    earnBadge(badgeId) {
      const now = stamp();
      const cur = DB.getRow('SELECT * FROM badges WHERE badge_id = ?', [badgeId]);
      if (cur && cur.earned) return Promise.resolve(false);
      insertRow('badges', {
        badge_id: badgeId, earned: 1, date_earned: D ? D.todayISO() : now.slice(0, 10),
        created_at: cur?.created_at || now, updated_at: now, synced: 0,
      });
      return Promise.resolve(true);
    },
    getAllBadgeStatuses() { return Promise.resolve(DB.query('SELECT * FROM badges WHERE earned = 1').reduce((m, r) => ((m[r.badge_id] = r), m), {})); },

    // ---------- XP ----------
    _addXPRow(amount, reason, relatedId) {
      const now = stamp();
      insertRow('xp_log', { id: DB.newId(), amount: Number(amount) || 0, reason: String(reason || ''), related_id: relatedId || null, created_at: now, updated_at: now, synced: 0 });
    },
    addXP(amount, reason, relatedId) { DataLayer._addXPRow(amount, reason, relatedId); return Promise.resolve(); },
    getTotalXP() { return Promise.resolve(Number(DB.getRow('SELECT COALESCE(SUM(amount),0) AS t FROM xp_log')?.t || 0)); },

    // ---------- 同步 ----------
    /** 一次回傳所有表待同步的列；badges/xp_log 也含進來（原規格漏了 badges 的索引） */
    getUnsyncedRows() {
      const out: any = {};
      for (const [t, spec] of Object.entries(TABLES)) {
        out[t] = DB.query(`SELECT * FROM ${t} WHERE synced = 0`);
        out[t].forEach((r) => { if (!r.updated_at) r.updated_at = r.created_at || ''; });
        void spec;
      }
      return Promise.resolve(out);
    },
    markSynced(table, ids) {
      const list = (ids || []).filter(Boolean);
      if (!list.length) return Promise.resolve(0);
      const pk = TABLES[table].pk;
      const ph = list.map(() => '?').join(',');
      DB.run(`UPDATE ${table} SET synced = 1 WHERE ${pk} IN (${ph})`, list);
      return Promise.resolve(list.length);
    },

    /**
     * LWW：遠端與本地比 updated_at。
     *  - 遠端較新 -> 覆蓋本地、標記 synced=1（它已在雲端）
     *  - 本地較新或相同 -> 保留本地；若內容不同，寫進 conflicts 供事後檢視
     * @returns {{action:'applied'|'kept', conflict:boolean}}
     */
    upsertWithConflictResolution(table, remote) {
      const spec = TABLES[table];
      if (!spec) throw new Error(`unknown table ${table}`);
      const pk = spec.pk;
      const local = DB.getRow(`SELECT * FROM ${table} WHERE ${pk} = ?`, [remote[pk]]);
      // 墓碑：本機沒有就直接無視（不然「雲端刪掉的列」會被當成新增列复活——實測踩過：
      // CLI 留的 verify-* 測試列軟刪後被 App pull 回去，變成使用者今天的訓練紀錄）
      if (!local) {
        if (isTombstone(remote)) return Promise.resolve({ action: 'ignored-tombstone', conflict: false });
        insertRow(table, { ...remote, updated_at: toZ(remote.updated_at) || stamp(), synced: 1 });
        return Promise.resolve({ action: 'applied', conflict: false });
      }
      const c = newer(remote, local);
      const diff = spec.cols.some((k) => String(local[k] ?? '') !== String(remote[k] ?? ''));
      if (c > 0 && isTombstone(remote)) {          // 較新的刪除 ⇒ 本機跟著刪（並清掉待同步佇列，別再推回去）
        DB.run(`DELETE FROM ${table} WHERE ${pk} = ?`, [remote[pk]]);
        return Promise.resolve({ action: 'deleted', conflict: diff });
      }
      if (c > 0) {
        insertRow(table, { ...local, ...remote, updated_at: toZ(remote.updated_at) || local.updated_at, synced: 1 });
        if (diff) DataLayer._logConflict(table, local, remote, 'remote');
        return Promise.resolve({ action: 'applied', conflict: diff });
      }
      if (diff) DataLayer._logConflict(table, local, remote, 'local');
      return Promise.resolve({ action: 'kept', conflict: diff });
    },
    _logConflict(table, local, remote, winner) {
      DB.run('INSERT OR REPLACE INTO conflicts (id, tbl, row_id, winner, local_json, remote_json, detected_at) VALUES (?,?,?,?,?,?,?)',
        [DB.newId(), table, String(local[TABLES[table].pk] ?? ''), winner, JSON.stringify(local), JSON.stringify(remote), stamp()]);
    },
    getConflictCount() { return Promise.resolve(Number(DB.getRow('SELECT COUNT(*) AS c FROM conflicts')?.c || 0)); },

    // ---------- 統計 ----------
    async getWeeklyStats(weeks = 8) {
      const logs = DB.query('SELECT log_date, completed, xp_earned FROM workout_logs WHERE deleted = 0');
      return global.GameCore.weeklyStats(logs, weeks, D ? D.todayISO() : undefined);
    },
    /** 匯出全庫（BackupManager / 雲端備份用） */
    exportAll() {
      const out: any = { exported_at: stamp(), app_version: global.APP_VERSION || 'dev', tables: {} };
      for (const t of Object.keys(TABLES)) out.tables[t] = DB.query(`SELECT * FROM ${t}`);
      out.tables.settings = DB.query('SELECT * FROM settings WHERE key != ?', ['gas_secret']);
      return Promise.resolve(out);
    },
    /** 匯入：整庫取代（使用者明確要求的動作，不做 LWW） */
    importAll(payload) {
      return DB.tx(() => {
        for (const [t, rows] of Object.entries<any>(payload.tables || {})) {
          if (!TABLES[t]) continue;
          DB.run(`DELETE FROM ${t}`);
          for (const r of rows) insertRow(t, r);
        }
      });
    },
  };
  global.DataLayer = DataLayer;
})(typeof window !== 'undefined' ? window : globalThis);

// js/db.js — sql.js(WASM) + IndexedDB 二進位持久化
// 對規格（gists/handstand-prompt/Prompt.md L721-900）的四個修正：
//  1. todo 1.2  sql.js 自架於 vendor/（原規格打 cdnjs 1.10.2 → 首次離線必然白卡；npm latest 1.14.2）
//  2. todo 1.3  PRAGMA user_version 遷移（原規格只在「無舊資料庫」時建表 → 新增欄位會讓老使用者直接開不起來）
//  3. todo 1.4  flushNow() 綁 pagehide / visibilitychange（原規格只有 500ms debounce，鎖屏最後幾筆會不見）
//  4. todo 1.5  badges 補 updated_at、exercise_logs 補 workout_log_id/phase；id 用 crypto.randomUUID
// 時間基準（todo 1.6）：所有時間戳由 JS 以本機時間寫入，schema 不再用 datetime('now')（那是 UTC）。
(function (global) {
  'use strict';
  const D = global.DateUtils;

  const DB_VERSION = 2;          // ← user_version，對應 MIGRATIONS 的 key
  const IDB_NAME = 'hs_tracker_idb';
  const IDB_STORE = 'kv';
  const IDB_KEY = 'sqlite_binary';

  const IDBManager = {
    db: null,
    supported() { return typeof indexedDB !== 'undefined'; },

    open() {
      if (!this.supported()) return Promise.resolve(null);   // node 單測環境
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => { if (!e.target.result.objectStoreNames.contains(IDB_STORE)) e.target.result.createObjectStore(IDB_STORE); };
        req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
        req.onerror = (e) => reject(e.target.error);
      });
    },
    _tx(mode) { return this.db.transaction(IDB_STORE, mode).objectStore(IDB_STORE); },
    get(key) {
      if (!this.db) return Promise.resolve(undefined);
      return new Promise((res, rej) => { const r = this._tx('readonly').get(key); r.onsuccess = () => res(r.result); r.onerror = (e) => rej(e.target.error); });
    },
    set(key, value) {
      if (!this.db) return Promise.resolve();
      return new Promise((res, rej) => { const r = this._tx('readwrite').put(value, key); r.onsuccess = () => res(); r.onerror = (e) => rej(e.target.error); });
    },
    delete(key) {
      if (!this.db) return Promise.resolve();
      return new Promise((res, rej) => { const r = this._tx('readwrite').delete(key); r.onsuccess = () => res(); r.onerror = (e) => rej(e.target.error); });
    },
  };

  // ---------- schema ----------
  const MIGRATIONS = {
    1: `
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS workout_logs (
        id TEXT PRIMARY KEY, log_date TEXT NOT NULL, phase INTEGER NOT NULL, day_type TEXT NOT NULL,
        location TEXT, completed INTEGER DEFAULT 0, notes TEXT DEFAULT '', xp_earned INTEGER DEFAULT 0,
        created_at TEXT, updated_at TEXT, synced INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS exercise_logs (
        id TEXT PRIMARY KEY, log_date TEXT NOT NULL, exercise_index INTEGER NOT NULL, exercise_name TEXT NOT NULL,
        completed INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, synced INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS skill_progress (
        skill_id TEXT PRIMARY KEY, unlocked INTEGER DEFAULT 0, date_unlocked TEXT, video_url TEXT DEFAULT '',
        notes TEXT DEFAULT '', created_at TEXT, updated_at TEXT, synced INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS badges (
        badge_id TEXT PRIMARY KEY, earned INTEGER DEFAULT 0, date_earned TEXT, created_at TEXT,
        updated_at TEXT, synced INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS xp_log (
        id TEXT PRIMARY KEY, amount INTEGER NOT NULL, reason TEXT NOT NULL, related_id TEXT,
        created_at TEXT, updated_at TEXT, synced INTEGER DEFAULT 0);
    `,
    2: `
      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY, tbl TEXT NOT NULL, row_id TEXT NOT NULL,
        winner TEXT NOT NULL, local_json TEXT, remote_json TEXT, detected_at TEXT);
      ALTER TABLE exercise_logs ADD COLUMN workout_log_id TEXT;
      ALTER TABLE exercise_logs ADD COLUMN phase INTEGER;
      ALTER TABLE exercise_logs ADD COLUMN xp INTEGER DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_exercise_wid ON exercise_logs(workout_log_id);
    `,
  };

  const DBManager = {
    IDB_KEY, DB_VERSION, MIGRATIONS,      // 暴露給單測/除錯用
    closed: false,
    db: null, SQL: null, saveTimer: null, dirty: false, version: 0,

    /** @param {{SQL?:object}} [inject] node 測試可注入 sql.js；瀏覽器走 vendor/ 自架 */
    async init(inject = {}) {
      await IDBManager.open();
      this.SQL = inject.SQL || await loadSqlJs();
      let binary = null;
      try { binary = await IDBManager.get(IDB_KEY); } catch (e) { console.warn('[db] IDB 讀取失敗，改為新建：', e); }
      this.db = binary ? new this.SQL.Database(binary) : new this.SQL.Database();
      this.migrate();
      if (!binary) this.save();
    },

    migrate() {
      const cur = Number(this.query('PRAGMA user_version')[0]?.user_version || 0);
      this.version = cur;
      if (cur === 0) {
        // 全新資料庫：一次建到最新版本，同時補上 v2 的欄位
        this.db.run(MIGRATIONS[1] + MIGRATIONS[2]);
        this.setVersion(DB_VERSION);
      } else {
        for (let v = cur + 1; v <= DB_VERSION; v++) {
          if (!MIGRATIONS[v]) continue;
          try { this.db.run(MIGRATIONS[v]); } catch (e) { console.warn(`[db] migration v${v} 略過：`, e.message); }
        }
        this.setVersion(Math.max(cur, DB_VERSION));
      }
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_workout_date ON workout_logs(log_date);
        CREATE INDEX IF NOT EXISTS idx_exercise_date ON exercise_logs(log_date);
        CREATE INDEX IF NOT EXISTS idx_unsynced_wl ON workout_logs(synced) WHERE synced = 0;
        CREATE INDEX IF NOT EXISTS idx_unsynced_el ON exercise_logs(synced) WHERE synced = 0;
        CREATE INDEX IF NOT EXISTS idx_unsynced_sp ON skill_progress(synced) WHERE synced = 0;
        CREATE INDEX IF NOT EXISTS idx_unsynced_bd ON badges(synced) WHERE synced = 0;
        CREATE INDEX IF NOT EXISTS idx_unsynced_xp ON xp_log(synced) WHERE synced = 0;
      `);
      this.version = DB_VERSION;
      this.save();
    },

    setVersion(v) { this.db.run(`PRAGMA user_version = ${Number(v) || 0}`); },

    save() { // debounce 500ms，但有 flushNow 兜底
      this.dirty = true;
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => { this.saveTimer = null; this.flushNow(); }, 500);
    },

    /** 立刻把整庫寫進 IDB；回傳 Promise 讓 pagehide/測試可以等待 */
    flushNow() {
      if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
      if (!this.db || !IDBManager.db || this.closed) return Promise.resolve(false);
      if (!this.dirty) return Promise.resolve(false);
      try {
        const uint8 = new Uint8Array(this.db.export());
        this.dirty = false;
        return IDBManager.set(IDB_KEY, uint8).then(() => true);
      } catch (e) { console.error('[db] flushNow 失敗：', e); return Promise.resolve(false); }
    },

    query(sql, params = []) {
      const stmt = this.db.prepare(sql);
      const out = [];
      try {
        if (params && params.length) stmt.bind(params);
        while (stmt.step()) out.push(stmt.getAsObject());
      } finally { stmt.free(); }
      return out;
    },
    getRow(sql, params = []) { const r = this.query(sql, params); return r[0] || null; },
    run(sql, params = []) { this.db.run(sql, params); this.save(); },
    /** 多條寫入包成一次交易 + 一次落盤 */
    tx(fn) {
      this.db.run('BEGIN');
      let out;
      try { out = fn(this); this.db.run('COMMIT'); }
      catch (e) { this.db.run('ROLLBACK'); throw e; }
      finally { this.save(); }
      return out;
    },

    newId() {
      if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
    },
    now() { return D ? D.nowStamp() : new Date().toISOString(); },

    /** 只給單測/除錯 */
    async reloadFromIdb() {
      const bin = await IDBManager.get(IDB_KEY);
      if (!bin) return false;
      this.db.close(); this.db = new this.SQL.Database(bin);
      return true;
    },
    /** 關閉前刷掉待寫資料；之後 flushNow 直接 no-op（避免 debounce 打到已關閉的 DB） */
    async close() {
      this.closed = true;
      await this.flushNow();
      try { this.db && this.db.close(); } catch (e) { /* 已關過 */ }
    },
    exportBytes() { return this.db.export().length; },
  };

  async function loadSqlJs() {
    if (typeof global.initSqlJs === 'function') {
      return global.initSqlJs({ locateFile: (f) => `vendor/${f}` });  // ← 自架，不走 CDN
    }
    throw new Error('sql.js 未載入：index.html 需要 <script src="vendor/sql-wasm.js">');
  }

  // todo 1.4：頁面被隱藏/關閉前強制落盤（原規格完全沒有這個鉤子）
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { DBManager.flushNow(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') DBManager.flushNow(); });
  }
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then((p) => { if (!p) console.info('[db] 未取得持久化儲存授權（iOS 7 天清除風險）'); });
  }

  const DbExports = { DBManager, IDBManager, DB_VERSION, IDB_KEY, MIGRATIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = DbExports;
  global.DBManager = DBManager;
  global.IDBManager = IDBManager;
})(typeof window !== 'undefined' ? window : globalThis);

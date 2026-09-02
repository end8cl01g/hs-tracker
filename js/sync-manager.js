// js/sync-manager.js — 本地 ↔ 雲端（GAS）雙向同步
// 與原規格最大的差別：錯誤不再被吞掉（todo 1.9）。
// 「未設定 URL」= disabled（介面顯示「未啟用雲端」），不是「已同步」。
(function (global) {
  'use strict';

  const BATCH_ROWS = 200;              // GAS 單次執行上限 6 分鐘，批次要小
  const RETRY_DELAYS = [1000, 4000, 16000];

  const SyncManager = {
    state: { status: 'init', lastSyncAt: null, lastError: null, pending: 0, conflicts: 0, disabled: false },
    _timer: null, _running: false,

    onStateChange: null, // app.js 掛 UI 回調

    _set(patch) {
      Object.assign(this.state, patch);
      if (typeof this.onStateChange === 'function') { try { this.onStateChange(this.state); } catch (e) { console.warn('[sync] 狀態回調失敗', e); } }
    },

    async refreshPending() {
      const rows = await global.DataLayer.getUnsyncedRows();
      const pending = Object.values(rows).reduce((n, r) => n + r.length, 0);
      this._set({ pending });
      return pending;
    },

    /** 一輪完整同步：先 pull（遠端較新者覆蓋本地）再 push。回傳彙報。 */
    async fullSync(opts = {}) {
      if (this._running) return { skipped: 'already-running' };
      if (!(await global.GASProxy.isEnabled())) {
        this._set({ status: 'disabled', disabled: true, lastError: null });
        return { skipped: 'no-url' };
      }
      this._running = true;
      this._set({ status: 'syncing', disabled: false, lastError: null });
      const report = { pulled: 0, pushed: 0, conflicts: 0, tables: {}, attempts: 0 };
      try {
        // ---- pull ----
        const since = await global.DataLayer.getSetting('last_pull_at');
        const remote = await global.GASProxy.call('pull', { since: since || null });
        if (remote && remote.rows) {
          for (const [tbl, rows] of Object.entries(remote.rows)) {
            for (const r of rows || []) {
              if (!global.DataLayer.TABLES[tbl]) continue;
              const res = await global.DataLayer.upsertWithConflictResolution(tbl, r);
              report.pulled++;
              if (res.conflict) report.conflicts++;
              report.tables[tbl] = (report.tables[tbl] || 0) + 1;
            }
          }
          if (remote.server_ts) await global.DataLayer.setSetting('last_pull_at', remote.server_ts);
        }

        // ---- push（含退避重試）----
        for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
          report.attempts = attempt + 1;
          const unsynced = await global.DataLayer.getUnsyncedRows();
          const batch = {};
          let total = 0;
          for (const [tbl, rows] of Object.entries(unsynced)) {
            if (rows.length) { batch[tbl] = rows.slice(0, BATCH_ROWS); total += batch[tbl].length; }
          }
          if (!total) break;
          try {
            const ack = await global.GASProxy.call('push', { tables: batch });
            for (const [tbl, res] of Object.entries((ack && ack.acked) || {})) {
              const ids = (res && res.ids) || batch[tbl].map((r) => r[global.DataLayer.TABLES[tbl].pk]);
              await global.DataLayer.markSynced(tbl, ids);
              report.pushed += ids.length;
            }
            if (ack && ack.rejected && ack.rejected.length) {
              console.warn('[sync] 雲端拒收：', ack.rejected);
              this._set({ lastError: `雲端拒收 ${ack.rejected.length} 列（格式/權限）` });
            }
            break;
          } catch (e) {
            if (attempt === RETRY_DELAYS.length) throw e;
            const wait = RETRY_DELAYS[attempt];
            console.warn(`[sync] push 第 ${attempt + 1} 次失敗（${e.message}），${wait}ms 後重試`);
            this._set({ status: 'retrying', lastError: e.message });
            await new Promise((r) => setTimeout(r, wait));
          }
        }

        await global.DataLayer.setSetting('last_sync_at', new Date().toISOString());
        // 「首次雲端同步」徽章計數源：用 setting 計數，不發 XP（避免用同步刷等級）
        const n = Number((await global.DataLayer.getSetting('total_syncs')) || 0) + 1;
        await global.DataLayer.setSetting('total_syncs', String(n));
        this._set({ status: 'ok', lastSyncAt: new Date().toISOString(), lastError: null, conflicts: report.conflicts });
        await this.refreshPending();
        this._notify();
        return report;
      } catch (e) {
        // 這裡不再 catch 後假裝成功：狀態明確為 error，讓介面紅燈＋待同步計數可見
        this._set({ status: 'error', lastError: `${e.kind || 'error'}: ${e.message}` });
        await this.refreshPending().catch(() => {});
        this._notify();
        throw e;
      } finally {
        this._running = false;
      }
    },

    /** 自動觸發鉤子：上線、回到前景、每 10 分鐘 */
    startAuto() {
      this.stopAuto();
      this._timer = setInterval(() => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        this.fullSync().catch(() => {});
      }, 10 * 60 * 1000);
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => this.fullSync().catch(() => {}));
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') this.fullSync().catch(() => {});
        });
      }
    },
    stopAuto() { if (this._timer) { clearInterval(this._timer); this._timer = null; } },

    async _notify() {
      if (!global.DBManager || !global.DataLayer) return;
      await global.DBManager.flushNow();
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { SyncManager, BATCH_ROWS, RETRY_DELAYS };
  global.SyncManager = SyncManager;
})(typeof window !== 'undefined' ? window : globalThis);

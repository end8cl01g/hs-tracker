// src/sync-manager.ts — 本地 ↔ 雲端（GAS）雙向同步
// 與原規格最大的差別：錯誤不再被吞掉（todo 1.9）。
// 「未設定 URL」= disabled（介面顯示「未啟用雲端」），不是「已同步」。
(function (global) {
  'use strict';

  const BATCH_ROWS = 200;              // GAS 單次執行上限 6 分鐘，批次要小
  const RETRY_DELAYS = [1000, 4000, 16000];
  const PUSH_ROUNDS = 5;               // 一次 fullSync 最多連續推幾輪（雲端單次 ≤500 列）

  const SyncManager = {
    state: { status: 'init', lastSyncAt: null, lastError: null, pending: 0, conflicts: 0, disabled: false },
    _timer: null, _running: false,

    onStateChange: null, // app.js 掛 UI 回調

    _set(patch) {
      Object.assign(this.state, patch);
      if (typeof this.onStateChange === 'function') { try { this.onStateChange(this.state); } catch (e) { console.warn('[sync] 狀態回調失敗', e); } }
    },

    async refreshPending() {
      const rows: any = await global.DataLayer.getUnsyncedRows();
      const pending = Object.values<any>(rows).reduce((n: number, r) => n + r.length, 0);
      this._set({ pending });
      return pending;
    },

    /** 連續推幾輪把佇列清掉；到上限或零進度就回報 partial，不要顯示「已同步」騙人 */
    async _pushRounds(report) {
      for (let round = 0; round < PUSH_ROUNDS; round++) {
        const before = report.pushed;
        if (!await this._pushOnce(report)) return;
        if (report.pushed === before) { report.truncated = true; return; }   // 零進度：別在原地打轉
      }
      report.truncated = true;
    },

    /** 推一批；回傳「是否還有得推」。整批被拒（零進度）時也停，別在原地打轉。 */
    async _pushOnce(report) {
      const unsynced = await global.DataLayer.getUnsyncedRows();
      const batch: any = {};
      let total = 0, remaining = 0;
      for (const [tbl, rows] of Object.entries<any>(unsynced)) {
        if (!rows.length) continue;
        batch[tbl] = rows.slice(0, BATCH_ROWS);
        total += batch[tbl].length;
        remaining += Math.max(0, rows.length - BATCH_ROWS);
      }
      if (!total) return false;
      let marked = 0;
      let lastErr = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        report.attempts = Math.max(report.attempts || 0, attempt + 1);
        try {
          const ack: any = await global.GASProxy.call('push', { tables: batch });
          for (const [tbl, res] of Object.entries<any>((ack && ack.acked) || {})) {
            const ids = (res && res.ids) || batch[tbl].map((r) => r[global.DataLayer.TABLES[tbl].pk]);
            await global.DataLayer.markSynced(tbl, ids);
            report.pushed += ids.length;
            marked += ids.length;
          }
          if (ack && ack.rejected && ack.rejected.length) {
            report.rejected = (report.rejected || 0) + ack.rejected.length;
            this._set({ lastError: `雲端拒收 ${ack.rejected.length} 列（格式/權限）` });
          }
          if (ack && ack.truncated) report.truncated = true;
          // 「還得再推」= 本批之後還有量，或雲端沒 ack 完這一批（ack 漏列不能當成推完了）
          return remaining > 0 || marked < total;
        } catch (e) {
          lastErr = e;
          if (attempt === RETRY_DELAYS.length) break;
          const wait = RETRY_DELAYS[attempt];
          this._set({ status: 'retrying', lastError: e.message });
          await new Promise<any>((r) => setTimeout(r, wait));
        }
      }
      throw lastErr;
    },

    /** 一輪完整同步：先 pull（遠端較新者覆蓋本地）再 push。回傳彙報。 */
    async fullSync(opts: any = {}) {
      if (this._running) return { skipped: 'already-running' };
      if (!(await global.GASProxy.isEnabled())) {
        this._set({ status: 'disabled', disabled: true, lastError: null });
        return { skipped: 'no-url' };
      }
      this._running = true;
      this._set({ status: 'syncing', disabled: false, lastError: null });
      const report: any = { pulled: 0, pushed: 0, conflicts: 0, tables: {}, attempts: 0 };
      try {
        // ---- pull ----
        const since = await global.DataLayer.getSetting('last_pull_at');
        const remote: any = await global.GASProxy.call('pull', { since: since || null });
        if (remote && remote.rows) {
          for (const [tbl, rows] of Object.entries<any>(remote.rows)) {
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
        await this._pushRounds(report);

        await global.DataLayer.setSetting('last_sync_at', new Date().toISOString());
        // 「首次雲端同步」徽章計數源：用 setting 計數，不發 XP（避免用同步刷等級）
        const n = Number((await global.DataLayer.getSetting('total_syncs')) || 0) + 1;
        await global.DataLayer.setSetting('total_syncs', String(n));
        this._set({
          status: report.rejected ? 'error' : report.truncated ? 'partial' : 'ok',
          lastSyncAt: new Date().toISOString(),
          lastError: report.rejected ? `雲端拒收 ${report.rejected} 列，仍留在待同步佇列`
            : report.truncated ? `還有些列沒推完（單次上限 ${PUSH_ROUNDS} 輪 × ${BATCH_ROWS} 列），再按一次同步即可` : null,
          conflicts: report.conflicts,
        });
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
  global.SyncManager = SyncManager;
})(typeof window !== 'undefined' ? window : globalThis);

// src/app.ts — 啟動與事件綁線
// todo 1.1（最關鍵的一條修正）：原規格寫了 sw.js 卻從沒 register()（Prompt.md 全文 grep serviceWorker = 0）
// → SW 不會安裝、離線能力與 PWA 安裝性全部失效。下面的 registerServiceWorker() 補上這條。
(function (global) {
  'use strict';
  const $ = (id: string): El => document.getElementById(id) as unknown as El;
  const D = () => global.DateUtils;

  const App = {
    vm: null, prevLevel: null,

    async registerServiceWorker() {
      const out = { supported: false, registered: false, controller: false, error: null };
      if (!('serviceWorker' in navigator)) {
        out.error = '此瀏覽器不支援 Service Worker（離線功能不可用）';
        return out;
      }
      out.supported = true;
      try {
        const reg = await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
        out.registered = true;
        out.controller = !!navigator.serviceWorker.controller;
        await reg.update().catch(() => {});
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'activated' && navigator.serviceWorker.controller) {
              global.UI?.toast?.('已更新到最新版本');
            }
          });
        });
        // SW 接管後重新整理一次，讓 shell 立刻進快取（只在首次 controller 出現時）
        navigator.serviceWorker.ready.then(() => {
          if (!sessionStorage.getItem('sw-reloaded') && !navigator.serviceWorker.controller) {
            sessionStorage.setItem('sw-reloaded', '1'); location.reload();
          }
        });
      } catch (e) {
        out.error = `${e.name}: ${e.message}`;
        console.error('[app] SW 註冊失敗：', e);
      }
      return out;
    },

    async init() {
      const sw = await App.registerServiceWorker();
      try {
        await global.IDBManager.open();
        await global.DBManager.init();
        await global.GameEngine.loadConfig();          // 相對路徑 fetch，由 SW 決定 network-first
        global.SyncManager.onStateChange = (s) => global.UI.renderSync(s);
        await App.wire();
        App.vm = await App.computeVM();
        const onboarded = await global.DataLayer.getSetting('startDate');
        if (!onboarded) { global.UI.showOnboarding(); }
        global.UI.renderAll(App.vm);
        global.UI.hideLoading(); global.UI.showApp();
        global.UI.renderSync(global.SyncManager.state);
        if (!sw.registered) console.warn('[app] SW 未註冊：', sw.error);
        await global.SyncManager.refreshPending().catch(() => {});
        global.SyncManager.startAuto();
        await global.GameEngine.evaluateBadges().then((b) => { if (b?.length) global.UI.toast(`🏅 新徽章 ×${b.length}`); });
      } catch (e) {
        console.error('[app] 啟動失敗：', e);
        global.UI.hideLoading(`${e.name || 'Error'}: ${e.message}`);
      }
      // 儲存持久化狀態（iOS 7 天清除風險的可視化，todo 3.2）
      try {
        const el2 = $('persist-state');
        if (el2 && navigator.storage && navigator.storage.persisted) {
          const p = await navigator.storage.persisted();
          el2.textContent = p ? '✅ 已獲持久化（不易被清）' : '⚠️ 未獲持久化：請「添加到主畫面」並常開';
          if (!p && navigator.storage.persist) {
            const got = await navigator.storage.persist();
            if (got && el2) el2.textContent = '✅ 已獲持久化（本次要求成功）';
          }
        } else if (el2) el2.textContent = '此瀏覽器不支援';
      } catch (e) { /* 不影響啟動 */ }

      const el = $('about-sw');
      if (el) el.textContent = sw.registered
        ? `Service Worker：已註冊${sw.controller ? '・已接管（離線可用）' : '・首次載入中'}`
        : `Service Worker：未註冊 — ${sw.error}`;
    },

    async computeVM() {
      const vm = await global.GameEngine.buildViewModel();
      vm.workoutData = global.GameEngine.workoutData;
      vm.badgeStats = await global.GameEngine.badgeStats();
      vm.conflicts = await global.DataLayer.getConflictCount();
      return vm;
    },

    async refresh() {
      App.vm = await App.computeVM();
      global.UI.renderAll(App.vm);
      const now = App.vm.level.level;
      if (App.prevLevel != null && now > App.prevLevel) global.Animations.levelUp(App.vm.level);
      App.prevLevel = now;
      await global.DBManager.flushNow();
    },

    /** 取得今日勾選狀態（UI 上的即时狀態優先於已存資料） */
    todayExercises() {
      const plan = App.vm?.plan?.workout || [];
      return plan.map((e) => ({ ...e, completed: !!global.UI.checks.get(e.name) }));
    },

    async wire() {
      global.UI.boot();

      // ---- Onboarding ----
      $('onboard-start')?.addEventListener('click', async () => {
        const date = $('onboard-start-date').value;
        if (!date) { global.Animations.shake($('onboard-start-date')); return global.UI.toast('請選起始日期', true); }
        await global.DataLayer.setSetting('startDate', date);
        await global.DataLayer.setSetting('currentPhase', $('onboard-phase').value);
        const om = $('onboarding-modal'); if (om) om.hidden = true;
        await App.refresh();
      });

      // ---- 鍵盤：Esc 關 modal（無 focus trap 至少能退出去）----
      document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        if (!$('skill-modal')?.hidden) { global.UI.closeSkillAndRefresh(); return; }
        if (!$('onboarding-modal')?.hidden) return;   // onboarding 未完成時不給關
      });

      // ---- Today ----
      $('save-note')?.addEventListener('click', async () => {
        const exercises = App.todayExercises();
        await global.DataLayer.logWorkout({
          phase: App.vm.phase, dayType: App.vm.plan.dayKey, completed: App.vm.todayLog?.completed || 0,
          notes: $('quick-note-input').value, exercises,
        });
        global.Animations.pulse($('save-note'));
        global.UI.toast('筆記已儲存（待同步 ' + (await global.SyncManager.refreshPending()) + ' 筆）');
        await App.refresh();
      });

      $('btn-complete')?.addEventListener('click', async () => {
        const exercises = App.todayExercises();
        const done = exercises.filter((e) => e.completed).length;
        if (!done) { global.UI.toast('至少勾一項才算完成', true); global.Animations.shake($('workout-card')); return; }
        const before = App.vm.level.level;
        await global.DataLayer.logWorkout({
          phase: App.vm.phase, dayType: App.vm.plan.dayKey, completed: 1,
          notes: $('quick-note-input').value, exercises,
        });
        const gained = exercises.reduce((s, e) => s + (e.completed ? Number(e.xp || 0) : 0), 0);
        global.Animations.xpFloat(gained, $('btn-complete'));
        const newBadges = await global.GameEngine.evaluateBadges();
        if (newBadges.length) global.Animations.confetti();
        await App.refresh();
        App.prevLevel = before;
        if (App.vm.level.level > before) global.Animations.levelUp(App.vm.level);
        global.UI.toast(newBadges.length ? `🏅 新徽章：${newBadges.length} 個` : `+${gained} XP`);
      });

      $('btn-skip-day')?.addEventListener('click', async () => {
        await global.DataLayer.logWorkout({
          phase: App.vm.phase, dayType: App.vm.plan.dayKey || 'rest', completed: 0,
          notes: $('quick-note-input').value, exercises: [],
        });
        await App.refresh(); global.UI.toast('已標記休息日');
      });

      // ---- Settings ----
      $('setting-start-date')?.addEventListener('change', async (e) => {
        await global.DataLayer.setSetting('startDate', ((e.target) as unknown as El).value); await App.refresh();
      });
      $('setting-phase')?.addEventListener('change', async (e) => {
        await global.DataLayer.setSetting('currentPhase', ((e.target) as unknown as El).value);
        await global.DataLayer.setSetting('phase_manual', '1');
        await App.refresh();
      });
      $('setting-gas-url')?.addEventListener('change', async (e) => {
        const v = ((e.target) as unknown as El).value.trim();
        if (v && !/^https:\/\/script\.google\.com\/macros\/s\//.test(v)) {
          global.UI.toast('URL 看起來不是 GAS Web App（應為 https://script.google.com/macros/s/…/exec）', true);
        }
        await global.DataLayer.setSetting('gas_url', v); await App.refresh();
      });
      $('setting-gas-secret')?.addEventListener('change', async (e) => {
        await global.DataLayer.setSetting('gas_secret', ((e.target) as unknown as El).value.trim());
        global.UI.toast('密鑰已更新（只存本機）');
      });

      $('btn-test-conn')?.addEventListener('click', async () => {
        global.UI.toast('測試連線中…');
        try { const r = await global.GASProxy.ping(); global.UI.toast(`✅ 連通：${JSON.stringify(r).slice(0, 90)}`); }
        catch (e) { global.UI.toast(`❌ ${e.kind || 'error'}：${e.message}`, true); }
      });
      $('btn-sync-now')?.addEventListener('click', () => App.doSync());
      $('btn-sync-now-top')?.addEventListener('click', () => App.doSync());

      $('btn-reload-config')?.addEventListener('click', async () => {
        try { await global.GameEngine.loadConfig(); await App.refresh(); global.UI.toast('設定檔已重抓'); }
        catch (e) { global.UI.toast(`重抓失敗：${e.message}`, true); }
      });

      $('btn-export')?.addEventListener('click', () => global.BackupManager.exportJSON());
      $('btn-import')?.addEventListener('click', () => $('import-file-input')?.click());
      $('import-file-input')?.addEventListener('change', (e) => {
        const f = ((e.target) as unknown as El).files?.[0];
        if (f) global.BackupManager.importFromFile(f).catch((err) => global.UI.toast(`匯入失敗：${err.message}`, true));
        ((e.target) as unknown as El).value = '';
      });
      $('btn-reset')?.addEventListener('click', async () => {
        if (!confirm('確定要清空本機所有訓練資料？（雲端已同步的列不會被刪）')) return;
        await global.IDBManager.delete(global.DBManager.IDB_KEY);
        await global.DBManager.db?.close?.();
        location.reload();
      });

      // ---- 落盤兜底（todo 1.4 已綁在 db.js，這裡補一次同步前 flush）----
      window.addEventListener('pagehide', () => global.DBManager.flushNow());
    },

    async doSync() {
      global.UI.toast('同步中…');
      await global.DBManager.flushNow();
      try {
        const r = await global.SyncManager.fullSync();
        if (r?.skipped === 'no-url') global.UI.toast('尚未設定 GAS URL —— 目前是純離線模式', true);
        else if (r?.skipped) global.UI.toast(`略過：${r.skipped}`);
        else global.UI.toast(`✅ 下載 ${r.pulled} 列・上傳 ${r.pushed} 列${r.conflicts ? `・衝突 ${r.conflicts}` : ''}`);
        await App.refresh();
      } catch (e) {
        global.UI.toast(`同步失敗：${e.kind || ''} ${e.message}`, true);
        await App.refresh().catch(() => {});
      }
    },
  };

  global.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})(typeof window !== 'undefined' ? window : globalThis);

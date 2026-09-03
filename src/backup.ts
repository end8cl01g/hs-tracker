// src/backup.ts — 匯出 / 匯入 JSON（含 iOS 7 天踢資料的自救通道：自動備檔到 GAS 端）
(function (global) {
  'use strict';
  const D = () => global.DateUtils;

  const BackupManager = {
    async exportJSON() {
      const payload = await global.DataLayer.exportAll();
      const name = `hs-tracker-backup-${D().todayISO()}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      // 優先 File System Access（可重選位置、可存回本機檔）；不支援就退回下載
      if (global.showSaveFilePicker) {
        try {
          const h = await global.showSaveFilePicker({ suggestedName: name, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
          const w = await h.createWritable(); await w.write(blob); await w.close();
          global.UI.toast('已存檔 ✅'); return { saved: true, name };
        } catch (e) { if (e.name === 'AbortError') return { saved: false, cancelled: true }; }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return { saved: true, name };
    },

    async importFromFile(file) {
      const text = await file.text();
      let payload;
      try { payload = JSON.parse(text); } catch (e) { global.UI.toast(`JSON 解析失敗：${e.message}`, true); return { ok: false }; }
      if (!payload?.tables) { global.UI.toast('不是本 App 的備份檔（缺 tables）', true); return { ok: false }; }
      const counts = Object.entries<any>(payload.tables).map(([t, r]) => `${t}:${r.length}`).join(' ');
      const yes = confirm(`匯入會「整庫取代」目前資料。\n備份內容：${counts}\n確定繼續？`);
      if (!yes) return { ok: false, cancelled: true };
      await global.DataLayer.importAll(payload);
      await global.DBManager.flushNow();
      await global.UI.refresh();
      global.UI.toast('匯入完成，重新整理中…');
      setTimeout(() => location.reload(), 600);
      return { ok: true, counts };
    },

    /** 把備檔推到 GAS（雲端多留一份，7 天清除時可取回） */
    async pushBackupToCloud() {
      const payload = await global.DataLayer.exportAll();
      const res = await global.GASProxy.call('backup', { payload });
      return res;
    },
  };
  global.BackupManager = BackupManager;
})(typeof window !== 'undefined' ? window : globalThis);

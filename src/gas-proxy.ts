// src/gas-proxy.ts — GAS Web App HTTP 客戶端（語意在 Part 1 缺件下重寫）
// 三個必須遵守的 GAS 事實（本輪查證）：
//  1. ContentService 會 302 到 script.googleusercontent.com → redirect 必須 follow
//  2. Content-Type: application/json 會觸發 preflight，GAS 不處理 OPTIONS → 一律用 text/plain;charset=utf-8
//  3. 「任何人」部署下用 subpath（/exec/push）會被導向登入頁 → 只准用 ?action= 或 body 內欄位
// 另外：不再「無條件 silently return」——未設定 URL 回傳 kind:'no-url'，由 SyncManager 決定要顯示「未啟用」而非「已同步」。
(function (global) {
  'use strict';

  const ACTIONS = { PUSH: 'push', PULL: 'pull', PING: 'ping', CONFIG: 'config' };

  /** 使用者常從聊天室／文件裡複製，前後會帶反引號、尖括號、句點或換行。先剝垃圾再判斷。 */
  function cleanUrl(raw: any): string {
    let u = String(raw == null ? '' : raw)
      .replace(/[\s\u3000]+/g, '')
      .replace(/^[`'<([="'“]+/, '');
    // 從 markdown／聊天室複製時尾巴會掛 `）,。 等垃圾：GAS 端點必定以 /exec 結尾，直接切在那兒最穩
    const i = u.indexOf('/exec');
    if (i >= 0 && /^https:\/\/script\.google\.com\/macros\/s\//.test(u)) u = u.slice(0, i + 5);
    else u = u.replace(/[`'>)\]】，,;；.。）」』]+$/, '');
    return u;
  }

  /**
   * 回傳 null＝可用；字串＝一句可直接顯示給使用者的原因。
   * 為什麼要在客戶端攔：貼錯 URL 時 GAS 會回 405/HTML（實測），前端只看到「不能同步」，
   * 看不出是自己貼了「一次性 echo 快照」。這三個誤用在實務上佔絕大多數。
   */
  function urlProblem(url: string): string | null {
    if (!url) return null;                                   // 空＝純離線，交給呼叫端
    if (/googleusercontent\.com\/macros\/echo/i.test(url)) {
      return '那是 GAS 回應的一次性快照（echo 連結，POST 會回 405），不是端點。請貼 https://script.google.com/macros/s/…/exec';
    }
    if (/\/dev\/?$/.test(url)) return '結尾是 /dev（預覽版，需要 Google 登入）。要發佈後貼 /exec 那條';
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
      return '格式不對：必須是 https://script.google.com/macros/s/<deploymentId>/exec（結尾 /exec 不能少）';
    }
    return null;
  }

  function looksLikeHtml(t: string): boolean { return /^\s*<(?:!doctype|html|body)/i.test(t || ''); }

  class GasError extends Error {
    kind: string;
    constructor(kind: string, message: string, extra: any = {}) { super(message); this.name = 'GasError'; this.kind = kind; Object.assign(this, extra); }
  }

  const GASProxy = {
    ACTIONS,
    cleanUrl,
    urlProblem,
    timeoutMs: 15000,

    /** @param {{url?:string, secret?:string, fetchImpl?:Function}} cfg 預設從 DataLayer 讀 */
    async _cfg() {
      const dl = global.DataLayer;
      const url = dl ? await dl.getSetting('gas_url') : null;
      const secret = dl ? await dl.getSetting('gas_secret') : null;
      return { url: (url || '').trim(), secret: (secret || '').trim() };
    },

    isEnabled() { return GASProxy._cfg().then((c) => !!c.url); },

    async call(action, payload: any = {}, opts: any = {}) {
      const { url, secret } = opts.cfg || await GASProxy._cfg();
      if (!url) throw new GasError('no-url', '尚未設定 GAS Web App URL');
      const badUrl = urlProblem(url);
      if (badUrl) throw new GasError('bad-url', 'GAS URL 不可用：' + badUrl, { url_tail: url.slice(-48) });

      const body = JSON.stringify({
        action,
        secret,
        device_id: await GASProxy.deviceId(),
        sent_at: new Date().toISOString(),
        ...payload,
      });

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || GASProxy.timeoutMs);
      const doFetch = opts.fetchImpl || ((...a: any[]) => (fetch as any)(...a));
      let res;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // ← 規避 preflight
          body,
          redirect: 'follow',           // ← 跟隨 googleusercontent 302
          credentials: 'omit',
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        throw new GasError(e && e.name === 'AbortError' ? 'timeout' : 'network',
          e && e.name === 'AbortError' ? `GAS 逾時（${GASProxy.timeoutMs}ms）` : `網路不通：${e && e.message}`, { cause: e });
      }
      clearTimeout(timer);

      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) { /* 多半是被導到登入頁的 HTML */ }
      // 訊息裡要帶「看到的第一手證據」：只有 kind 的話，使用者回報時我們這邊什麼都得重新猜
      const peek = looksLikeHtml(text) ? '｜拿到的是 HTML 頁（登入頁/攔截頁），不是 JSON' : `｜${(text || '').slice(0, 90)}`;
      if (!res.ok) throw new GasError('http', `GAS 回 ${res.status}${peek}`, { status: res.status, body: text.slice(0, 400) });
      if (!json) throw new GasError('parse', `GAS 回應不是 JSON${peek}`, { body: text.slice(0, 400) });
      if (json.ok === false) throw new GasError('server', json.error || 'GAS 端回報失敗', { detail: json });
      return json;
    },

    ping() { return GASProxy.call(ACTIONS.PING, {}); },
    push(tables) { return GASProxy.call(ACTIONS.PUSH, { tables }); },
    pull(since) { return GASProxy.call(ACTIONS.PULL, { since }); },
    /** 讀遠端設定檔版本（GAS 內部已有 6h 上限的 CacheService + PropertiesService，見 todo 2.4） */
    config(keys = ['workout', 'skills', 'badges']) { return GASProxy.call(ACTIONS.CONFIG, { keys }); },

    async deviceId() {
      const dl = global.DataLayer;
      let id = dl ? await dl.getSetting('device_id') : null;
      if (!id) {
        id = (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        if (dl) await dl.setSetting('device_id', id);
      }
      return id;
    },
  };
  global.GASProxy = GASProxy;
  global.GasError = GasError;
})(typeof window !== 'undefined' ? window : globalThis);

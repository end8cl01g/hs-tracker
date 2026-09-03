/** Utils.gs — 共通工具。全-plan 禁用 eval()（規格實作註記 4），只准 JSON.parse。 */

function nowISO_() { return new Date().toISOString(); }

function log_(msg) {
  try { Logger.log('[' + nowISO_() + '] ' + msg); } catch (e) { /* 沒開 Logs 權限時也不炸 */ }
}

/** 把任何 ISO 變形歸一成 UTC（...Z）；解析不了就原樣回傳——寧可難看也不能變成空字串 */
function toZ_(v) {
  const raw = String(v == null ? '' : v);
  if (!raw) return '';
  const t = Date.parse(raw);
  return Number.isNaN(t) ? raw : new Date(t).toISOString();
}

/** 常數時間比對（密鑰比對不用 ===） */
function safeEqual_(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** 每裝置每小時計數。用 PropertiesService，不用 CacheService（後者 6 小時上限＋FIFO 逐出，節流會失效） */
function allowRate_(device, maxPerHour) {
  const props = PropertiesService.getScriptProperties();
  const hour = Math.floor(Date.now() / 3600000);
  const key = 'RATE_' + device + '_' + hour;
  const n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  if (n === 1) {
    for (let back = 3; back <= 5; back++) props.deleteProperty('RATE_' + device + '_' + (hour - back));
  }
  return n <= maxPerHour;
}

/** FNV-1a：只用来判「內容有沒有變」，非資安用途 */
function hashStr_(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(16);
}

function jsonSize_(x) { return String(typeof x === 'string' ? x : JSON.stringify(x)).length; }

function chunk_(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 在 GAS 編輯器跑一次：產生密鑰並寫入 Project Properties，輸出貼到 App 的「同步密鑰」欄位 */
function bootstrapSecret_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHARED_SECRET')) {
    return 'SHARED_SECRET 已存在（不覆寫）。要換新值請先手動刪除該 property。';
  }
  // 用 Utilities.getUuid 兩次 + 時間攪拌，避免 Math.random
  const raw = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '') + Date.now().toString(36);
  const secret = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw))
    .replace(/=+$/, '');
  props.setProperty('SHARED_SECRET', secret);
  ensureSheets_();
  Logger.log('SHARED_SECRET=' + secret);
  return '已產生密鑰並建好工作表。請在 Logger 輸出複製 SHARED_SECRET，貼進 App 設定。';
}

/** 部署前檢查：一次看完權限/設定是否齊備 */
function doctor_() {
  const props = PropertiesService.getScriptProperties();
  const report: Record<string, any> = {
    secret_configured: !!props.getProperty('SHARED_SECRET'),
    sheet_id: props.getProperty('SHEET_ID') ? 'ok' : '將自動建立',
    config_base: configBaseUrl_(),   // 遷移到 TS 時抓到的真 bug：原本寫 CONFIG_BASE_URL（不存在）→ doctor_ 一定 ReferenceError
    sheets: Object.keys(HEADERS),
    now: nowISO_(),
  };
  try {
    const r = UrlFetchApp.fetch(report.config_base.replace(/\/$/, '') + '/workout.json', { muteHttpExceptions: true });
    report.config_fetch = r.getResponseCode();
  } catch (e) { report.config_fetch = 'failed: ' + e.message; }
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

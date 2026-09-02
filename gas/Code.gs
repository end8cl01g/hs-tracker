/**
 * Code.gs — GAS Web App 入口
 * dispatch 只走 body / query，**不用 subpath**：「任何人」部署下 /exec/push 會被導向登入頁而踩 CORS（todo 2.2）
 * 部署：執行身份「我」+ 訪問權限「任何人」，但每個請求都要帶 SHARED_SECRET；未通過一律 {ok:false} 且不寫表（todo 2.1 / D7）
 * 本檔刻意 **不回傳 spreadsheet URL**（todo 2.5：原規格的「查看表格」按鈕已移除）
 */
const APP_NAME = 'HS Tracker Backend';
const APP_VERSION = '2.0.0';

function doGet(e) { return handle_(e); }
function doPost(e) { return handle_(e); }

function handle_(e) {
  const t0 = Date.now();
  let req;
  try {
    req = parseRequest_(e);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'bad-request', detail: String((err && err.message) || err) });
  }

  const action = String(req.action || 'ping');
  const props = PropertiesService.getScriptProperties();

  const secret = props.getProperty('SHARED_SECRET') || '';

  // 「首次設定」通道：只有還沒密鑰時開放，比對的是 gas/Bootstrap.gs 裡的一次性 SETUP_TOKEN
  // （scripts/deploy-gas.mjs 會寫入、用畢即刪並重新 push，把這條路關掉）
  if (action === 'bootstrap') {
    const out = secret
      ? { ok: false, error: 'already-initialized', hint: '密鑰已設定；要重設請先刪 Project Properties 的 SHARED_SECRET' }
      : bootstrapWithToken_(req.setup_token);
    out.server_ts = nowISO_();
    out.ms = Date.now() - t0;
    return jsonOut_(out);
  }

  if (!secret) {
    // 讓「測試連線」在還沒初始化時也能拿到明確答案，而不是被同一句 reject 嗆住
    if (action === 'ping') {
      return jsonOut_({ ok: false, error: 'secret-not-configured', secret_configured: false, app: APP_NAME, server_ts: nowISO_(), ms: Date.now() - t0 });
    }
    return jsonOut_({ ok: false, error: 'secret-not-configured', hint: '在 File > Project Properties 設 SHARED_SECRET 後再同步' });
  }
  if (action !== 'ping' && !safeEqual_(req.secret, secret)) {
    log_('reject action=' + action + ' device=' + (req.device_id || '?') + ' reason=bad-secret');
    return jsonOut_({ ok: false, error: 'unauthorized' });
  }

  const device = String(req.device_id || 'unknown').slice(0, 64);
  const maxPerHour = Number(props.getProperty('MAX_REQ_PER_HOUR') || 120);
  if (action !== 'ping' && !allowRate_(device, maxPerHour)) {
    return jsonOut_({ ok: false, error: 'rate-limited', retry_after_s: 900 });
  }

  try {
    let out;
    if (action === 'ping') out = { ok: true, app: APP_NAME, version: APP_VERSION, secret_configured: true };
    else if (action === 'push') out = pushRows_(device, req.tables || {});
    else if (action === 'pull') out = pullRows_(req.since || null);
    else if (action === 'config') out = getConfigs_(device, req.keys || []);
    else if (action === 'backup') out = saveBackup_(device, req.payload);
    else if (action === 'restore') out = latestBackup_();
    else if (action === 'setup') out = ensureSheets_();
    else out = { ok: false, error: 'unknown-action: ' + action };
    out.server_ts = nowISO_();
    out.ms = Date.now() - t0;
    return jsonOut_(out);
  } catch (err) {
    log_('error action=' + action + ': ' + ((err && err.stack) || err));
    return jsonOut_({ ok: false, error: 'server-error', detail: String((err && err.message) || err), ms: Date.now() - t0 });
  }
}

/** POST body 是 text/plain 的 JSON（前端用它規避 preflight）；GET 只收 query 參數 */
function parseRequest_(e) {
  if (e && e.postData && e.postData.contents) {
    const raw = String(e.postData.contents);
    let parsed;
    try { parsed = JSON.parse(raw) || {}; } catch (err) { throw new Error('body 不是 JSON：' + raw.slice(0, 80)); }
    return parsed;
  }
  const p = (e && e.parameter) || {};
  return { action: p.action || 'ping', device_id: p.device, secret: p.secret, since: p.since };
}

function jsonOut_(obj) {
  // 注意：ContentService 的回應實際由 script.googleusercontent.com 送出（302），
  // 前端必須 redirect:'follow'，且不要用 mode:'no-cors'（會拿到 opaque、讀不到 body）
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 一次性初始化（由 scripts/deploy-gas.mjs 自動呼叫；該腳本用畢即刪 gas/Bootstrap.gs 並重新 push）
 * 條件：本專案內有一份只存在於**你的 private script**（且已 gitignore、不會進 public repo）的
 * SETUP_TOKEN，比對成功才產生並寫入 SHARED_SECRET；第二次呼叫就必須帶密鑰了。
 */
function bootstrapWithToken_(token) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHARED_SECRET')) {
    return { ok: false, error: 'already-initialized', hint: '密鑰已設定；要重設請先手動刪除 SHARED_SECRET' };
  }
  const expected = (typeof SETUP_TOKEN === 'undefined') ? '' : String(SETUP_TOKEN);
  if (!expected) return { ok: false, error: 'no-setup-token', hint: '跑 node scripts/deploy-gas.mjs --yes（它會暫存 gas/Bootstrap.gs 再 push）' };
  if (!safeEqual_(token, expected)) return { ok: false, error: 'bad-setup-token' };
  const secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props.setProperty('SHARED_SECRET', secret);
  ensureSheets_();
  return { ok: true, secret: secret, sheets_ready: true };
}

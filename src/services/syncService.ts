/**
 * src/services/syncService.ts — GAS（Google Apps Script）雲端同步，自舊版 hs-tracker 的
 * gas-proxy.ts + sync-manager.ts 移植為 ES module，對接「同一顆已部署的 GAS Web App」。
 *
 * 與舊版的差異：
 * - 舊版是 sql.js 多表列級同步（workout_logs / exercise_logs / …）；
 *   新架構單一真相 = HSEmbedded 一份 JSON 文件 → 存進雲端 `hs_state` 表（row_id='current'）。
 *   舊版 GAS 後端 pushRows_ 對未知表用 PK_||'id'、無白名單 → **後端零改動、同一個 Sheet 共存**。
 * - 合併語意：課表勾勾（history）/ 過關（gateDone）/ 技能（unlockedSkills）/ 徽章（badges）/
 *   自訂任務（customQuests）取「聯集」——進度是單調累積的，同步永不丟資料；
 *   profile 與 startedAt（自訂開始日期）取「較新者勝」（整份文件時間戳 LWW）。
 * - 錯誤不吞掉（todo 1.9 精神）：未設定 URL = disabled，不是「已同步」。
 * - GAS 三個事實照舊遵守：302 要 follow、Content-Type 一律 text/plain 規避 preflight、
 *   只用 ?action=/body 不用 subpath。
 */
import type { HSEmbedded } from '../types';
import { normalizeHS } from '../domain/state';

/* ------------------------------ 錯誤型別 ------------------------------ */

export class GasError extends Error {
  kind: string;
  constructor(kind: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'GasError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

/* --------------------------- URL 清洗／校驗 --------------------------- */

/** 使用者常從聊天室／文件複製，前後帶反引號、尖括號、句點或換行：先剝垃圾再判斷（舊版語意照搬） */
export function cleanUrl(raw: unknown): string {
  let u = String(raw == null ? '' : raw)
    .replace(/[\s\u3000]+/g, '')
    .replace(/^[`'<([="'“]+/, '');
  const i = u.indexOf('/exec');
  if (i >= 0 && /^https:\/\/script\.google\.com\/macros\/s\//.test(u)) u = u.slice(0, i + 5);
  else u = u.replace(/[`'>)\]】，,;；.。）」』]+$/, '');
  return u;
}

/** 回傳 null＝可用；字串＝一句可直接顯示給使用者的原因（攔截三大誤用，舊版語意照搬） */
export function urlProblem(url: string): string | null {
  if (!url) return null; // 空＝純離線
  if (/googleusercontent\.com\/macros\/echo/i.test(url)) {
    return '那是 GAS 回應的一次性快照（echo 連結，POST 會回 405），不是端點。請貼 https://script.google.com/macros/s/…/exec';
  }
  if (/\/dev\/?$/.test(url)) return '結尾是 /dev（預覽版，需要 Google 登入）。要發佈後貼 /exec 那條';
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
    return '格式不對：必須是 https://script.google.com/macros/s/<deploymentId>/exec（結尾 /exec 不能少）';
  }
  return null;
}

/* ------------------------------ 設定存取 ------------------------------ */

const CFG_KEY = 'HS_SYNC_CFG_V1';
const DEVICE_KEY = 'HS_SYNC_DEVICE_V1';

export interface SyncConfig {
  url: string;
  secret: string;
  auto: boolean; // 自動同步（上線／回前景／每 10 分鐘）
  lastPullAt: string | null; // pull 游標（server_ts）
  lastSyncAt: string | null;
  totalSyncs: number;
}

const DEFAULT_CFG: SyncConfig = {
  url: '',
  secret: '',
  auto: true,
  lastPullAt: null,
  lastSyncAt: null,
  totalSyncs: 0,
};

export function loadConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return { ...DEFAULT_CFG };
    const p = JSON.parse(raw);
    return {
      url: typeof p.url === 'string' ? p.url : '',
      secret: typeof p.secret === 'string' ? p.secret : '',
      auto: p.auto !== false,
      lastPullAt: typeof p.lastPullAt === 'string' ? p.lastPullAt : null,
      lastSyncAt: typeof p.lastSyncAt === 'string' ? p.lastSyncAt : null,
      totalSyncs: Number(p.totalSyncs) || 0,
    };
  } catch {
    return { ...DEFAULT_CFG };
  }
}

export function saveConfig(patch: Partial<SyncConfig>): SyncConfig {
  const next = { ...loadConfig(), ...patch };
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('[sync] saveConfig failed:', e);
  }
  return next;
}

export function clearConfig() {
  try {
    localStorage.removeItem(CFG_KEY);
  } catch {
    /* ignore */
  }
}

/** 裝置代號（雲端 Changes 表可看出哪台裝置推的） */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown-device';
  }
}

/* ------------------------------ 狀態訂閱 ------------------------------ */

export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'ok' | 'partial' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  lastDetail: string | null; // 上次同步結果摘要（pulled/pushed…）
}

export const EMPTY_SYNC_STATE: SyncState = { status: 'idle', lastSyncAt: null, lastError: null, lastDetail: null };

export const SYNC_LABEL: Record<SyncStatus, string> = {
  disabled: '未啟用雲端（純離線）',
  idle: '待機',
  syncing: '同步中…',
  ok: '已同步',
  partial: '部分完成',
  error: '同步失敗',
};

let syncState: SyncState = { ...EMPTY_SYNC_STATE, ...{ lastSyncAt: loadConfig().lastSyncAt } };
const listeners = new Set<(s: SyncState) => void>();

function setState(patch: Partial<SyncState>) {
  syncState = { ...syncState, ...patch };
  listeners.forEach((fn) => {
    try {
      fn(syncState);
    } catch (e) {
      console.warn('[sync] listener failed:', e);
    }
  });
}

export function getSyncState(): SyncState {
  return syncState;
}

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  fn(syncState);
  return () => listeners.delete(fn);
}

/* ----------------------------- HTTP 客戶端 ----------------------------- */

const ACTIONS = { PUSH: 'push', PULL: 'pull', PING: 'ping', BACKUP: 'backup', RESTORE: 'restore' };
const TIMEOUT_MS = 15000;
const RETRY_DELAYS = [1000, 4000, 16000];

function looksLikeHtml(t: string): boolean {
  return /^\s*<(?:!doctype|html|body)/i.test(t || '');
}

async function call(action: string, payload: Record<string, unknown> = {}, opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<any> {
  const cfg = loadConfig();
  const url = (cfg.url || '').trim();
  if (!url) throw new GasError('no-url', '尚未設定 GAS Web App URL');
  const badUrl = urlProblem(url);
  if (badUrl) throw new GasError('bad-url', 'GAS URL 不可用：' + badUrl);

  const body = JSON.stringify({
    action,
    secret: (cfg.secret || '').trim(),
    device_id: deviceId(),
    sent_at: new Date().toISOString(),
    ...payload,
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || TIMEOUT_MS);
  const doFetch = opts.fetchImpl || fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 規避 preflight（GAS 不處理 OPTIONS）
      body,
      redirect: 'follow', // ContentService 會 302 到 script.googleusercontent.com
      credentials: 'omit',
      signal: ctrl.signal,
    } as RequestInit);
  } catch (e: any) {
    clearTimeout(timer);
    throw new GasError(
      e && e.name === 'AbortError' ? 'timeout' : 'network',
      e && e.name === 'AbortError' ? `GAS 逾時（${TIMEOUT_MS}ms）` : `網路不通：${e && e.message}`,
      { cause: e }
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 多半是被導到登入頁的 HTML */
  }
  const peek = looksLikeHtml(text) ? '｜拿到的是 HTML 頁（登入頁/攔截頁），不是 JSON' : `｜${(text || '').slice(0, 90)}`;
  if (!res.ok) throw new GasError('http', `GAS 回 ${res.status}${peek}`, { status: res.status });
  if (!json) throw new GasError('parse', `GAS 回應不是 JSON${peek}`);
  if (json.ok === false) {
    if (/unauthorized/i.test(String(json.error || ''))) {
      // 白話直指病因：密鑰不對（最常見：把 Script ID 當密鑰貼）
      throw new GasError('auth', '密鑰不對（unauthorized）——SHARED_SECRET 在 GAS「專案設定 → 指令碼屬性」裡，不是指令碼 ID', { detail: json });
    }
    throw new GasError('server', json.error || 'GAS 端回報失敗', { detail: json });
  }
  return json;
}

export async function ping(opts: { fetchImpl?: typeof fetch } = {}): Promise<{ ok: boolean; detail: string }> {
  // 第一段：ping 在後端不驗密鑰，只證明「端點活著、公開可達」
  const base = await call('ping', {}, opts)
    .then((r: any) => ({
      ok: !!r.ok,
      app: String(r.app || 'GAS'),
      version: String(r.version || '?'),
      serverTs: String(r.server_ts || '-'),
      secretConfigured: r.secret_configured,
      err: '',
    }))
    .catch((e: any) => ({
      ok: false,
      app: '',
      version: '',
      serverTs: '',
      secretConfigured: undefined as unknown,
      err: `${e?.kind ? e.kind + '：' : ''}${e?.message || e}`,
    }));
  if (!base.ok) {
    return {
      ok: false,
      detail: `✗ ${base.err}${base.secretConfigured === false ? '（後端尚未設定 SHARED_SECRET）' : ''}`,
    };
  }
  // 第二段：用需要密鑰的 pull 實測——否則密鑰貼錯（例如貼成 Script ID）測試也會假綠
  const cfg = loadConfig();
  if (!(cfg.secret || '').trim()) {
    return {
      ok: false,
      detail: `△ 端點正常 · ${base.app} v${base.version}，但本機尚未填密鑰——同步前請先填 SHARED_SECRET`,
    };
  }
  try {
    await call('pull', { since: null }, opts);
    return {
      ok: true,
      detail: `連線與密鑰都正常 · ${base.app} v${base.version} · 伺服器時間 ${base.serverTs}`,
    };
  } catch (e: any) {
    const kind = String(e?.kind || ''), msg = String(e?.message || e);
    if (kind === 'auth') return { ok: false, detail: `✗ ${msg}` };
    return { ok: false, detail: `△ 端點正常（ping ok），但密鑰實測失敗：${kind ? kind + '：' : ''}${msg}` };
  }
}

/* --------------------------- 文件同步（核心） --------------------------- */

const STATE_TABLE = 'hs_state';
const STATE_ROW_ID = 'current';

export interface RemoteDoc {
  id: string;
  kind: string;
  hs: HSEmbedded;
  updated_at: string; // ISO（UTC Z）
  device: string;
}

/**
 * 增量（additive）合併：本地與遠端「都不會丟」。
 * - history / gateDone / unlockedSkills / badges / activeIds：聯集
 * - logXP：聯集，同日衝突取 max（與勾勾聯集語意一致：寧多勿少）
 * - customQuests：依 id 聯集；同 id 內容不同時取較新一側
 * - profile / startedAt：整體 LWW（localStamp >= remoteStamp 時留本地）
 */
export function mergeDocs(
  local: HSEmbedded,
  remote: HSEmbedded,
  stamps: { localStamp: number; remoteStamp: number }
): { merged: HSEmbedded; changed: boolean } {
  const a = normalizeHS(local);
  const b = normalizeHS(remote);
  const localWins = stamps.localStamp >= stamps.remoteStamp;

  const history: Record<string, string[]> = { ...b.history };
  for (const [d, ids] of Object.entries(a.history)) {
    history[d] = [...new Set([...(history[d] || []), ...ids])].sort();
  }

  const logXP: Record<string, number> = { ...(b.logXP || {}) };
  for (const [d, xp] of Object.entries(a.logXP || {})) {
    logXP[d] = Math.max(logXP[d] ?? 0, xp);
  }

  const gateDone = [...new Set([...a.gateDone, ...b.gateDone])];
  const unlockedSkills = [...new Set([...a.unlockedSkills, ...b.unlockedSkills])];
  const badges = [...new Set([...a.badges, ...b.badges])];
  const activeIds = [...new Set([...a.activeIds, ...b.activeIds])];

  // customQuests：id 聯集；同 id 不同內容取較新一側（單一時間戳 LWW，誤差可接受）
  const cqMap = new Map<string, (typeof a.customQuests)[number]>();
  for (const q of b.customQuests) cqMap.set(q.id, q);
  for (const q of a.customQuests) {
    const prev = cqMap.get(q.id);
    if (!prev) cqMap.set(q.id, q);
    else if (!localWins) cqMap.set(q.id, q); // 遠端較新 → 遠端版本勝（b 先放，a 蓋掉即本地勝）
  }
  const customQuests = [...cqMap.values()];

  const merged: HSEmbedded = {
    ...a,
    startedAt: localWins ? a.startedAt : b.startedAt,
    history,
    logXP,
    gateDone,
    unlockedSkills,
    badges,
    customQuests,
    activeIds,
    profile: localWins ? a.profile : b.profile,
  };

  const changed = JSON.stringify(merged) !== JSON.stringify(a);
  return { merged, changed };
}

export interface SyncReport {
  ok: boolean;
  summary: string;
  pulled: number;
  pushed: number;
  mergedLocal: boolean;
}

/**
 * 一輪完整同步：pull → 合併 → （有變）寫回本地 → push 合併結果。
 *
 * @param getLocal   取目前本地狀態（含 savedAt 時間戳，供 LWW）
 * @param adopt      把合併結果寫回應用（App.setHS + 直接落盤）
 */
export async function fullSync(
  getLocal: () => { hs: HSEmbedded; savedAt: number },
  adopt: (hs: HSEmbedded) => void
): Promise<SyncReport> {
  const cfg = loadConfig();
  if (!(cfg.url || '').trim()) {
    setState({ status: 'disabled', lastError: null });
    return { ok: false, summary: '未啟用雲端', pulled: 0, pushed: 0, mergedLocal: false };
  }

  setState({ status: 'syncing', lastError: null });
  const report: SyncReport = { ok: true, summary: '', pulled: 0, pushed: 0, mergedLocal: false };

  try {
    // ---- pull ----
    let remoteDoc: RemoteDoc | null = null;
    let remoteStamps: { localStamp: number; remoteStamp: number } = { localStamp: 0, remoteStamp: 0 };
    const local = getLocal();
    const localStamp = local.savedAt || 0;

    const ack: any = await call('pull', { since: cfg.lastPullAt });
    if (ack && ack.rows && Array.isArray(ack.rows[STATE_TABLE])) {
      for (const row of ack.rows[STATE_TABLE]) {
        if (String(row?.id) !== STATE_ROW_ID) continue;
        const cand = row as RemoteDoc;
        if (!cand.hs || !cand.updated_at) continue;
        if (!remoteDoc || Date.parse(cand.updated_at) > Date.parse(remoteDoc.updated_at)) remoteDoc = cand;
      }
    }
    if (ack && ack.server_ts) saveConfig({ lastPullAt: ack.server_ts });

    // ---- merge（雲端有文件時）----
    let hsNow = normalizeHS(local.hs);
    if (remoteDoc) {
      remoteStamps = { localStamp, remoteStamp: Date.parse(remoteDoc.updated_at) || 0 };
      const { merged, changed } = mergeDocs(hsNow, remoteDoc.hs, remoteStamps);
      report.pulled = 1;
      if (changed) {
        hsNow = normalizeHS(merged);
        adopt(hsNow); // 寫回 App state + 直接落盤
        report.mergedLocal = true;
      }
    }

    // ---- push（合併結果與雲端不同才推；推前帶退避重試）----
    let pushedDoc: RemoteDoc | null = null;
    const sameAsRemote = remoteDoc && JSON.stringify(hsNow) === JSON.stringify(normalizeHS(remoteDoc.hs));
    if (!sameAsRemote) {
      pushedDoc = {
        id: STATE_ROW_ID,
        kind: 'hs_state_v1',
        hs: hsNow,
        updated_at: new Date().toISOString(),
        device: deviceId(),
      };
      let lastErr: unknown = null;
      let done = false;
      for (let attempt = 0; attempt <= RETRY_DELAYS.length && !done; attempt++) {
        try {
          const pushAck: any = await call('push', { tables: { [STATE_TABLE]: [pushedDoc] } });
          const acked = pushAck && pushAck.acked && pushAck.acked[STATE_TABLE];
          if (acked && acked.ids && acked.ids.length) {
            report.pushed = acked.ids.length;
            done = true;
          } else if (pushAck && Array.isArray(pushAck.rejected) && pushAck.rejected.length) {
            throw new GasError('server', `雲端拒收（${pushAck.rejected[0]?.reason || 'unknown'}）`);
          } else {
            throw new GasError('server', '雲端未 ack 這批資料');
          }
        } catch (e) {
          lastErr = e;
          if (attempt === RETRY_DELAYS.length) break;
          setState({ lastError: (e as Error).message });
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        }
      }
      if (!done) throw lastErr;
    }

    const cfgNow = saveConfig({ lastSyncAt: new Date().toISOString(), totalSyncs: (loadConfig().totalSyncs || 0) + 1 });
    const detail = `拉入 ${report.pulled} 份 · 推上 ${report.pushed} 份${report.mergedLocal ? ' · 已把雲端進度合併進本機' : ''}`;
    setState({ status: 'ok', lastSyncAt: cfgNow.lastSyncAt, lastError: null, lastDetail: detail });
    return { ...report, summary: `同步完成：${detail}` };
  } catch (e: any) {
    const msg = `${e.kind ? e.kind + '：' : ''}${e.message || e}`;
    setState({ status: 'error', lastError: msg });
    return { ok: false, summary: msg, pulled: report.pulled, pushed: report.pushed, mergedLocal: report.mergedLocal };
  }
}

/* ------------------------------ 雲端備檔 ------------------------------ */

/** 把整份狀態推到 GAS 的 Backups 表（iOS 7 天清 storage 的自救通道） */
export async function pushCloudBackup(hs: HSEmbedded): Promise<string> {
  const payload = {
    format: 'HS_TRACKER_BACKUP',
    hs,
    exportedAt: new Date().toISOString(),
    device: deviceId(),
  };
  const r = await call('backup', { payload });
  return r && r.saved ? `雲端備檔完成（${r.saved}）` : '雲端備檔完成';
}

/** 讀雲端最近一份備檔（自救用：本機資料被清掉時） */
export async function pullCloudRestore(): Promise<HSEmbedded> {
  const r = await call('restore', {});
  const hs = r && r.payload && r.payload.hs;
  if (!hs) throw new GasError('server', '雲端沒有可還原的備檔');
  return normalizeHS(hs);
}

/* ------------------------------ 自動同步 ------------------------------ */

let autoTimer: ReturnType<typeof setInterval> | null = null;
let autoBound = false;
let running = false;

/** 供 App 掛自動同步：上線、回到前景、每 10 分鐘（未啟用 URL 時 no-op） */
export function startAutoSync(
  getLocal: () => { hs: HSEmbedded; savedAt: number },
  adopt: (hs: HSEmbedded) => void
) {
  stopAutoSync();
  const run = () => {
    if (running) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (!(loadConfig().url || '').trim()) return;
    if (loadConfig().auto === false) return;
    running = true;
    fullSync(getLocal, adopt)
      .catch(() => {})
      .finally(() => {
        running = false;
      });
  };

  autoTimer = setInterval(run, 10 * 60 * 1000);
  if (typeof window !== 'undefined' && !autoBound) {
    autoBound = true;
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') run();
    });
  }
  run(); // 掛上時先跑一輪
}

export function stopAutoSync() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}

/** 供手動「立即同步」呼叫（避開 auto 開關） */
export async function syncNow(
  getLocal: () => { hs: HSEmbedded; savedAt: number },
  adopt: (hs: HSEmbedded) => void
): Promise<SyncReport> {
  return fullSync(getLocal, adopt);
}

/* ------------------------------ 診斷 ------------------------------ */

export async function diagnostics(): Promise<{ text: string }> {
  const cfg = loadConfig();
  const lines: string[] = [];
  lines.push(`--- hs-tracker 同步診斷 ${new Date().toISOString()} ---`);
  lines.push(`UA: ${typeof navigator !== 'undefined' ? navigator.userAgent : '?'}`);
  lines.push(`online: ${typeof navigator !== 'undefined' ? navigator.onLine : '?'}`);
  lines.push(`url: ${cfg.url ? cfg.url.slice(0, 60) + '…' + cfg.url.slice(-12) : '（未設定）'}`);
  lines.push(`secret: ${cfg.secret ? `已存 ${cfg.secret.length} 字元` : '未設定'}`);
  lines.push(`auto: ${cfg.auto ? 'on' : 'off'}`);
  lines.push(`device: ${deviceId()}`);
  lines.push(`lastPullAt: ${cfg.lastPullAt || '-'}`);
  lines.push(`lastSyncAt: ${cfg.lastSyncAt || '-'}（第 ${cfg.totalSyncs} 次）`);
  try {
    const p = await ping();
    lines.push(`ping: ${p.detail}`);
  } catch (e: any) {
    lines.push(`ping: 失敗 ${e.message || e}`);
  }
  lines.push('（密鑰本體不會出現在診斷裡）');
  return { text: lines.join('\n') };
}

// 同步鏈路：GASProxy/SyncManager 的真實碼 + 假 fetch（記錄每次請求），
// 驗的是「規格错在哪」那幾條：preflight、redirect、批次、錯誤可見、未配 URL 不自動成功。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './harness.mjs';

function recorder(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return handler ? handler(url, init, calls.length) : { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  return { calls, fetchImpl };
}
const plain = (o) => JSON.parse(JSON.stringify(o));
const json = (obj, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj) });

const boot = async (handler, extra) => {
  const rec = recorder(handler);
  const app = await makeApp({ fetchImpl: rec.fetchImpl, ...extra });
  await app.ctx.DataLayer.setSetting('gas_url', 'https://script.google.com/macros/s/DEPLOY/exec');
  await app.ctx.DataLayer.setSetting('gas_secret', 'sekret-1');
  return { ...app, ...rec };
};

test('POST 用 text/plain 簡單請求 + redirect:follow（避免 preflight、跟隨 googleusercontent 302）', async () => {
  const { ctx, calls, cleanup } = await boot(() => json({ ok: true, acked: {} }));
  try {
    await ctx.GASProxy.ping();
    const c = calls[0];
    assert.equal(c.init.method, 'POST');
    assert.equal(c.init.headers['Content-Type'], 'text/plain;charset=utf-8', 'application/json 會觸發 preflight，GAS 不處理 OPTIONS');
    assert.equal(c.init.redirect, 'follow');
    assert.equal(c.init.credentials, 'omit');
    assert.ok(!('Access-Control-Request-Method' in (c.init.headers || {})));
    const body = JSON.parse(c.init.body);
    assert.equal(body.action, 'ping');
    assert.equal(body.secret, 'sekret-1', '密鑰走 body，不用自訂 header');
    assert.ok(body.device_id, '要帶 device_id 讓雲端能節流');
    assert.ok(!/\/exec\/\w+$/.test(c.url), '不准用 subpath（會被導向登入頁）');
    assert.ok(!/\?/.test(c.url), '也不用 query');
  } finally { cleanup(); }
});

test('未設定 URL 時：標記 disabled，不是「已同步」（todo 1.9）', async () => {
  const { ctx, calls, cleanup } = await boot(() => json({ ok: true }));
  try {
    await ctx.DataLayer.setSetting('gas_url', '');
    const seen = [];
    ctx.SyncManager.onStateChange = (s) => seen.push(s.status);
    const r = await ctx.SyncManager.fullSync();
    assert.deepEqual(plain(r), { skipped: 'no-url' });
    assert.equal(ctx.SyncManager.state.status, 'disabled');
    assert.notEqual(ctx.SyncManager.state.status, 'ok');
    assert.equal(calls.length, 0, '不該發網路請求');
    assert.ok(seen.includes('disabled'));
  } finally { cleanup(); }
});

test('雲端回 401/HTML（被導向登入頁）→ 狀態必須是 error 且 lastError 有原因', async () => {
  const { ctx, cleanup } = await boot(() => ({ ok: false, status: 401, text: async () => '<html><head><title>Sign in</title></html>' }));
  try {
    await assert.rejects(() => ctx.GASProxy.ping(), (e) => e.kind === 'http');
    await assert.rejects(() => ctx.SyncManager.fullSync());
    assert.equal(ctx.SyncManager.state.status, 'error');
    assert.match(ctx.SyncManager.state.lastError, /http: GAS 回 401/);
  } finally { cleanup(); }
});

test('GAS 回 {ok:false}（密鑰不對）→ 丟 server 錯，不會被當成同步成功', async () => {
  const { ctx, cleanup } = await boot(() => json({ ok: false, error: 'unauthorized' }));
  try {
    await assert.rejects(() => ctx.SyncManager.fullSync(), (e) => e.kind === 'server');
    assert.equal(ctx.SyncManager.state.status, 'error');
    assert.match(ctx.SyncManager.state.lastError, /unauthorized|GAS 端回報失敗/);
  } finally { cleanup(); }
});

test('逾時 → kind:timeout（不會永久卡在 syncing）', async () => {
  // 模擬真實 fetch：收到 abort 就 reject（不然測不到我們自己的 AbortController 計時器）
  const { ctx, cleanup } = await boot((url, init) => new Promise((_res, rej) => {
    const t = setTimeout(() => _res(json({ ok: true })), 500);
    init.signal?.addEventListener('abort', () => {
      clearTimeout(t);
      const e = new Error('The user aborted a request.'); e.name = 'AbortError'; rej(e);
    });
  }));
  try {
    ctx.GASProxy.timeoutMs = 5;
    await assert.rejects(() => ctx.GASProxy.ping(), (e) => e.kind === 'timeout');
    assert.equal(ctx.GASProxy.timeoutMs, 5, '逾時上限保持不變');
    await assert.rejects(() => ctx.SyncManager.fullSync());
    assert.notEqual(ctx.SyncManager.state.status, 'syncing', '失敗後不能永遠卡在 syncing');
    assert.equal(ctx.SyncManager.state.status, 'error');
  } finally { cleanup(); }
});

test('push：單次 ≤200 列、雲端 ack 後才 markSynced；被拒的列留在佇列', async () => {
  const seen = [];
  const { ctx, calls, cleanup } = await boot((url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    if (body.action !== 'push') return json({ ok: true, rows: {} });
    const acked = {};
    for (const [t, rows] of Object.entries(body.tables)) {
      // 只 ack 前 150 列，模擬雲端截斷
      const ids = rows.slice(0, 150).map((r) => r.id || r.skill_id || r.badge_id);
      acked[t] = { ids };
    }
    return json({ ok: true, acked, rejected: [] });
  });
  try {
    for (let i = 0; i < 5; i++) {
      await ctx.DataLayer.logWorkout({ date: `2026-09-0${i + 1}`, phase: 0, dayType: 'mon', completed: 1, exercises: Array.from({ length: 60 }, (_, j) => ({ name: `E${j}`, xp: 1, completed: true })) });
    }
    const before = await ctx.DataLayer.getUnsyncedRows();
    assert.ok(before.exercise_logs.length > 200, '先製造超過一批的待同步量');
    const res = await ctx.SyncManager.fullSync();
    const pushBody = seen.find((b) => b.action === 'push');
    assert.ok(pushBody.tables.exercise_logs.length <= 200, '單次不得超過 BATCH_ROWS=200');
    assert.ok(res.pushed > 0);
    // 雲端每輪只 ack 150 → 必須連續推好幾輪直到清空，不能推一輪就說「已同步」
    assert.ok(seen.filter((b) => b.action === 'push').length >= 2, '大佇列要連續推多輪：' + JSON.stringify(res));
    const after = await ctx.DataLayer.getUnsyncedRows();
    assert.equal(after.workout_logs.length, 0, '全部 ack → 清空');
    assert.equal(after.exercise_logs.length, 0, '連續推到清空（只 ack 150/輪也要排乾）');
    assert.equal(ctx.SyncManager.state.status, 'ok');
  } finally { cleanup(); }
});

test('pull：雲端較新的列覆蓋本機，本機較新的保留（雙端不遺失）', async () => {
  const { ctx, cleanup } = await boot((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'pull') {
      return json({
        ok: true,
        rows: {
          workout_logs: [
            { id: 'remote-newer', log_date: '2026-09-01', phase: 0, day_type: 'mon', completed: 1, notes: '來自另一台', xp_earned: 30, updated_at: '2099-01-01T00:00:00+08:00' },
            { id: 'local-keep', log_date: '2026-09-02', phase: 0, day_type: 'tue', completed: 0, notes: '雲端舊值', xp_earned: 0, updated_at: '2000-01-01T00:00:00+08:00' },
          ],
        },
        server_ts: '2026-09-03T10:00:00Z',
      });
    }
    return json({ ok: true, acked: {} });
  });
  try {
    ctx.DBManager.run('INSERT INTO workout_logs (id, log_date, phase, day_type, completed, notes, xp_earned, created_at, updated_at, synced) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ['local-keep', '2026-09-02', 0, 'tue', 1, '本機新值', 40, '2026-09-02T08:00:00+08:00', '2026-09-02T20:00:00+08:00', 1]);
    const res = await ctx.SyncManager.fullSync();
    assert.ok(res.pulled >= 2);
    const rows = ctx.DBManager.query('SELECT * FROM workout_logs ORDER BY log_date');
    assert.equal(rows[0].notes, '來自另一台', 'remote 較新 → 採 remote');
    assert.equal(rows[1].notes, '本機新值', 'local 較新 → 保留 local');
    assert.equal(await ctx.DataLayer.getSetting('last_pull_at'), '2026-09-03T10:00:00Z', '要存游標，下次 pull 只拿增量');
  } finally { cleanup(); }
});

test('離線時 SyncManager 不自動狂試：網路錯誤後保留待同步計數', async () => {
  const { ctx, cleanup } = await boot(async () => { const e = new Error('Failed to fetch'); e.name = 'TypeError'; throw e; });
  try {
    await ctx.DataLayer.logWorkout({ date: '2026-09-03', phase: 0, dayType: 'thu', completed: 1, exercises: [{ name: 'A', xp: 5, completed: true }] });
    await assert.rejects(() => ctx.SyncManager.fullSync());
    assert.equal(ctx.SyncManager.state.status, 'error');
    const pending = await ctx.SyncManager.refreshPending();
    assert.ok(pending >= 2, `資料仍queued（待同步 ${pending}）`);
  } finally { cleanup(); }
});

test('GASProxy 回傳的 config 走 data/ 相對路徑（非 CDN）', async () => {
  const { ctx, cleanup } = await boot(() => json({ ok: true, configs: {} }));
  try {
    await ctx.GASProxy.config(['workout']);
    assert.ok(ctx.GameEngine.workoutData.days_in_week, 'config 失敗也不能打斷本地功能');
    assert.ok(!/cdnjs|jsdelivr|unpkg/.test(JSON.stringify(ctx.GameEngine.configMeta)), '設定檔來源不得是外部 CDN');
  } finally { cleanup(); }
});

// ---- 本輪補：push 佇列要排乾，不能推一輪就宣稱成功 ----
const seed = async (ctx, days = 2, ex = 3) => {
  for (let i = 0; i < days; i++) {
    await ctx.DataLayer.logWorkout({
      date: `2026-09-0${i + 1}`, phase: 0, dayType: 'mon', completed: 1,
      exercises: Array.from({ length: ex }, (_, j) => ({ name: `E${j}`, xp: 1, completed: true })),
    });
  }
};

test('雲端整批拒收 → status=error、lastError 說清楚、佇列不得被清', async () => {
  const seen = [];
  const { ctx, cleanup } = await boot((url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    if (body.action !== 'push') return json({ ok: true, rows: {} });
    return json({ ok: true, acked: {}, rejected: [{ table: 'exercise_logs', reason: 'row-too-large' }] });
  });
  try {
    await seed(ctx, 2, 2);
    const before = await ctx.DataLayer.getUnsyncedRows();
    assert.ok(before.exercise_logs.length > 0);
    const res = await ctx.SyncManager.fullSync();
    assert.equal(res.rejected, 1, '拒收數要進回報');
    assert.equal(ctx.SyncManager.state.status, 'error');
    assert.match(ctx.SyncManager.state.lastError, /拒收/);
    const after = await ctx.DataLayer.getUnsyncedRows();
    assert.equal(after.exercise_logs.length, before.exercise_logs.length, '被拒的列必須還原封不動留在佇列');
    assert.equal(seen.filter((b) => b.action === 'push').length, 1, '零進度時要停，不要在原地打轉');
  } finally { cleanup(); }
});

test('雲端收了但沒 ack 任何 id → status=partial（不是 ok）', async () => {
  const { ctx, cleanup } = await boot((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action !== 'push') return json({ ok: true, rows: {} });
    return json({ ok: true, acked: {}, rejected: [] });
  });
  try {
    await seed(ctx, 1, 2);
    const res = await ctx.SyncManager.fullSync();
    assert.equal(res.pushed, 0);
    assert.equal(res.truncated, true, '沒推完要標 truncated');
    assert.equal(ctx.SyncManager.state.status, 'partial');
    assert.match(ctx.SyncManager.state.lastError, /沒推完|再按一次同步/);
    assert.ok((await ctx.DataLayer.getUnsyncedRows()).exercise_logs.length > 0, '佇列要還在');
  } finally { cleanup(); }
});

test('雲端回 truncated（單次 500 列上限）→ 也要留下可见痕跡', async () => {
  const { ctx, cleanup } = await boot((url, init) => {
    const body = JSON.parse(init.body);
    if (body.action !== 'push') return json({ ok: true, rows: {} });
    const acked = {};
    for (const [t, rows] of Object.entries(body.tables)) acked[t] = { ids: rows.map((r) => r.id || r.skill_id) };
    return json({ ok: true, acked, rejected: [], truncated: true });
  });
  try {
    await seed(ctx, 1, 2);
    const res = await ctx.SyncManager.fullSync();
    assert.ok(res.pushed > 0, 'ack 到的要標記成已同步');
    assert.equal(res.truncated, true, '雲端說截斷了就要傳到回報');
    assert.equal(ctx.SyncManager.state.status, 'partial');
  } finally { cleanup(); }
});

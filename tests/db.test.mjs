// 用真實 sql.js + 真實 db.js/data-layer.js（vm 內跑），驗證：schema 遷移、落盤重載、
// 時間戳基準、徽章 LWW、id 唯一性。這是對 todo 1.3/1.4/1.5/1.6 的驗收，不是對照稿。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './harness.mjs';

const fresh = async () => {
  const app = await makeApp();
  return app;
};

test('PRAGMA user_version 落在最新版本，且索引都在', async () => {
  const { ctx, cleanup } = await fresh();
  try {
    const v = Number(ctx.DBManager.query('PRAGMA user_version')[0].user_version);
    assert.equal(v, ctx.DBManager.DB_VERSION || 2, 'user_version 應等於 DB_VERSION');
    const idx = ctx.DBManager.query("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").map((r) => r.name);
    for (const need of ['idx_workout_date', 'idx_exercise_date', 'idx_unsynced_wl', 'idx_unsynced_el', 'idx_unsynced_sp', 'idx_unsynced_bd', 'idx_unsynced_xp']) {
      assert.ok(idx.includes(need), `缺索引 ${need}`);
    }
    const cols = ctx.DBManager.query('PRAGMA table_info(badges)').map((c) => c.name);
    assert.ok(cols.includes('updated_at'), 'badges 必須有 updated_at（原規格漏掉 → LWW 無依據）');
    const exCols = ctx.DBManager.query('PRAGMA table_info(exercise_logs)').map((c) => c.name);
    assert.ok(exCols.includes('workout_log_id') && exCols.includes('phase'), 'exercise_logs 需要 workout_log_id/phase 才能歸屬與重播');
  } finally { cleanup(); }
});

test('舊版 DB（無 v2 欄）可以被遷移起來，不會開不起來', async () => {
  const { ctx, SQL, cleanup } = await fresh();
  try {
    // 模擬 v1 老資料庫：另建一個只跑 MIGRATIONS[1]、user_version=1 的 DB，餵回 DBManager
    const old = new SQL.Database();
    old.run(ctx.DBManager.MIGRATIONS[1]);
    old.run('PRAGMA user_version = 1');
    old.run("INSERT INTO badges (badge_id, earned, date_earned, created_at, synced) VALUES ('first_log',1,'2026-09-01','2026-09-01T10:00:00+08:00',1)");
    ctx.DBManager.db.close();
    ctx.DBManager.db = old;
    ctx.DBManager.migrate();
    const cols = ctx.DBManager.query('PRAGMA table_info(badges)').map((c) => c.name);
    assert.ok(cols.includes('updated_at'), '遷移後 badges 要有 updated_at');
    const rows = ctx.DBManager.query('SELECT * FROM badges');
    assert.equal(rows.length, 1, '遷移不能弄掉既有列');
    assert.equal(Number(ctx.DBManager.query('PRAGMA user_version')[0].user_version), ctx.DBManager.DB_VERSION || 2);
    const ex = ctx.DBManager.query('PRAGMA table_info(exercise_logs)').map((c) => c.name);
    assert.ok(ex.includes('workout_log_id'), 'v2 欄位要補上');
  } finally { cleanup(); }
});

test('打卡 → 落盤 → 重開 App：資料與 XP 完全還在（500ms debounce 之外還有 flushNow）', async () => {
  const { ctx, cleanup } = await fresh();
  try {
    const exercises = [{ name: '靠牆倒立', xp: 30, completed: true }, { name: '肩推', xp: 20, completed: false }, { name: '手腕熱身', xp: 10, completed: true }];
    await ctx.DataLayer.logWorkout({ date: '2026-09-03', phase: 1, dayType: 'thu', completed: 1, notes: '左手抖', exercises });
    const flushed = await ctx.DBManager.flushNow();
    assert.equal(flushed, true, 'flushNow 應真的寫進 IDB');

    const reopened = await ctx.DBManager.reloadFromIdb();
    assert.equal(reopened, true, 'reloadFromIdb 應讀到二進位');
    const log = await ctx.DataLayer.getWorkoutLog('2026-09-03');
    assert.equal(log.completed, 1);
    assert.equal(log.xp_earned, 40, '只計 completed 的 XP');
    assert.equal(log.notes, '左手抖');
    const ex = await ctx.DataLayer.getExerciseLogs('2026-09-03');
    assert.equal(ex.length, 3);
    assert.ok(ex.every((e) => e.workout_log_id === log.id), 'exercise 要掛得住 workout');
    assert.equal(await ctx.DataLayer.getTotalXP(), 40);
    assert.deepEqual((await ctx.DataLayer.getWorkoutStreak('2026-09-03')).current, 1);
  } finally { cleanup(); }
});

test('同一天重複打卡是覆寫（不產生重複列、不重複計 XP）', async () => {
  const { ctx, cleanup } = await fresh();
  try {
    await ctx.DataLayer.logWorkout({ date: '2026-09-03', phase: 0, dayType: 'thu', completed: 0, exercises: [{ name: 'A', xp: 10, completed: true }] });
    await ctx.DataLayer.logWorkout({ date: '2026-09-03', phase: 0, dayType: 'thu', completed: 1, exercises: [{ name: 'A', xp: 10, completed: true }, { name: 'B', xp: 5, completed: true }] });
    const rows = ctx.DBManager.query('SELECT * FROM workout_logs WHERE log_date="2026-09-03"');
    assert.equal(rows.length, 1);
    assert.equal(ctx.DBManager.query('SELECT * FROM exercise_logs').length, 2, '覆寫時舊 exercise 必須先清掉');
    assert.equal(Number(rows[0].xp_earned), 15);
  } finally { cleanup(); }
});

test('待同步佇列：寫入進隊、markSynced 出隊、多表各自計數', async () => {
  const { ctx, cleanup } = await fresh();
  try {
    await ctx.DataLayer.logWorkout({ date: '2026-09-03', phase: 0, dayType: 'thu', completed: 1, exercises: [{ name: 'A', xp: 10, completed: true }] });
    let unsynced = await ctx.DataLayer.getUnsyncedRows();
    assert.equal(unsynced.workout_logs.length, 1);
    assert.equal(unsynced.exercise_logs.length, 1);
    assert.equal(unsynced.xp_log.length, 1);
    assert.ok(unsynced.workout_logs[0].updated_at, '每列都要有 updated_at，雲端才能 LWW');

    await ctx.DataLayer.markSynced('workout_logs', unsynced.workout_logs.map((r) => r.id));
    unsynced = await ctx.DataLayer.getUnsyncedRows();
    assert.equal(unsynced.workout_logs.length, 0, 'markSynced 後不该再出現在佇列');
    assert.equal(unsynced.exercise_logs.length, 1, '其他表不受影響');
  } finally { cleanup(); }
});

test('upsertWithConflictResolution：雲端較新才覆蓋；本地較新保留並記衝突', async () => {
  const { ctx, cleanup } = await fresh();
  try {
    const id = 'w-1';
    ctx.DataLayer.TABLES; // 結構檢查用
    ctx.DBManager.run('INSERT INTO workout_logs (id, log_date, phase, day_type, completed, notes, xp_earned, created_at, updated_at, synced) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, '2026-09-03', 0, 'thu', 1, '本機筆記', 40, '2026-09-03T08:00:00+08:00', '2026-09-03T08:00:00+08:00', 1]);

    // 遠端較舊 + 內容不同 → 保留本地、記衝突
    const stale = { id, log_date: '2026-09-03', phase: 0, day_type: 'thu', completed: 0, notes: '雲端舊筆記', xp_earned: 0, updated_at: '2026-09-03T07:00:00+08:00' };
    let r = await ctx.DataLayer.upsertWithConflictResolution('workout_logs', stale);
    assert.equal(r.action, 'kept'); assert.equal(r.conflict, true);
    let row = ctx.DBManager.getRow('SELECT * FROM workout_logs WHERE id=?', [id]);
    assert.equal(row.notes, '本機筆記', '較旧的遠端不能蓋掉本機');
    assert.equal(await ctx.DataLayer.getConflictCount(), 1);

    // 遠端較新 → 覆蓋且標記 synced
    const fresher = { ...stale, notes: '雲端新筆記', updated_at: '2026-09-03T09:30:00+08:00' };
    r = await ctx.DataLayer.upsertWithConflictResolution('workout_logs', fresher);
    assert.equal(r.action, 'applied');
    row = ctx.DBManager.getRow('SELECT * FROM workout_logs WHERE id=?', [id]);
    assert.equal(row.notes, '雲端新筆記');
    assert.equal(row.synced, 1, '套用雲端值後不應再回推（否則會振盪）');
    assert.equal((await ctx.DataLayer.getUnsyncedRows()).workout_logs.length, 0);

    // 新列（本機沒有）→ 直接套用
    r = await ctx.DataLayer.upsertWithConflictResolution('badges', { badge_id: 'streak7', earned: 1, date_earned: '2026-09-03', updated_at: '2026-09-03T09:00:00+08:00' });
    assert.equal(r.action, 'applied');
    assert.ok((await ctx.DataLayer.getAllBadgeStatuses()).streak7, '徽章要能被另一台裝置同步過來');
  } finally { cleanup(); }
});

test('徽章只在真的達成時新增一次（append-only，不會被另一台蓋掉）', async () => {
  const { ctx, cleanup } = await fresh();
  try {
    assert.equal(await ctx.DataLayer.earnBadge('first_log'), true);
    assert.equal(await ctx.DataLayer.earnBadge('first_log'), false, '已拿過不應重複發');
    const rows = ctx.DBManager.query("SELECT * FROM badges WHERE badge_id='first_log'");
    assert.equal(rows.length, 1);
    assert.ok(rows[0].updated_at);
    await ctx.DataLayer.earnBadge('streak7');
    assert.equal(Object.keys(await ctx.DataLayer.getAllBadgeStatuses()).length, 2);
  } finally { cleanup(); }
});

test('newId 用 crypto.randomUUID（跨裝置不撞 PK）', async () => {
  const { ctx, cleanup } = await fresh();
  try {
    const ids = new Set(Array.from({ length: 500 }, () => ctx.DBManager.newId()));
    assert.equal(ids.size, 500);
    assert.ok([...ids][0].length >= 32, '應為 UUID 長度而非 Date.now+5 字元');
  } finally { cleanup(); }
});

test('settings 不被雲端覆寫（gas_url 等本機設定不入同步）', async () => {
  const { ctx, cleanup } = await fresh();
  try {
    await ctx.DataLayer.setSetting('gas_url', 'https://script.google.com/macros/s/x/exec');
    await ctx.DataLayer.setSetting('gas_secret', 'top-secret');
    const unsynced = await ctx.DataLayer.getUnsyncedRows();
    assert.equal(unsynced.settings, undefined, 'settings 不在同步表清單裡');
    const dump = await ctx.DataLayer.exportAll();
    const gas = dump.tables.settings.find((r) => r.key === 'gas_secret');
    assert.ok(!gas, '匯出不得含 gas_secret');
    assert.ok(dump.tables.settings.some((r) => r.key === 'gas_url'), 'URL 可匯出（不是密鑰）');
  } finally { cleanup(); }
});

test('匯出/匯入 round-trip 保資料', async () => {
  const a = await fresh();
  try {
    await a.ctx.DataLayer.logWorkout({ date: '2026-09-01', phase: 0, dayType: 'mon', completed: 1, exercises: [{ name: 'A', xp: 10, completed: true }] });
    await a.ctx.DataLayer.logWorkout({ date: '2026-09-02', phase: 0, dayType: 'tue', completed: 0, exercises: [] });
    const dump = JSON.parse(JSON.stringify(await a.ctx.DataLayer.exportAll()));
    assert.equal(dump.tables.workout_logs.length, 2);
    const b = await fresh();
    try {
      await b.ctx.DataLayer.importAll(dump);
      assert.equal(b.ctx.DBManager.query('SELECT * FROM workout_logs').length, 2);
      assert.equal(await b.ctx.DataLayer.getTotalXP(), 10);
    } finally { b.cleanup(); }
  } finally { a.cleanup(); }
});

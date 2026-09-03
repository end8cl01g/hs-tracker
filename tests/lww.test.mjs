// tests/lww.test.mjs — 最後寫入勝利（LWW）與「刪除」語意的真實碼測試（sql.js ＋ 真 DataLayer）。
// 起因是 2026-09-03 從真機覆核時抓到的兩個缺陷：
//  (A) 客戶端寫 +08:00、雲端寫 Z，兩者在同一欄裡被當字串比大小 → 選錯勝者、since 游標跳列；
//  (B) 雲端已軟刪的列被 pull 回本機當成「新增列」复活（我們的 verify-* 探針列就這樣變成使用者的訓練紀錄）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './harness.mjs';

const Z = '2026-09-03T00:30:00.000Z';   // = 08:30 +08:00

async function withApp(fn) {
  const app = await makeApp({ seedDeviceId: 'lww-test' });
  try { await fn(app.ctx); } finally { app.cleanup(); }
}

test('跨時區枚舉的 LWW：遠端真的較新時必須覆蓋本機（舊的字串比對會留錯的）', async () => {
  await withApp(async (ctx) => {
    const DL = ctx.DataLayer;
    await DL.logWorkout({ date: '2026-09-03', phase: 0, dayType: 'thu', completed: 0 });
    const row = ctx.DBManager.getRow('SELECT * FROM workout_logs WHERE log_date = ?', ['2026-09-03']);
    assert.ok(row, '先要有一筆本機紀錄');
    // 把本機時間戳改寫成舊格式：07:00+08:00 ＝ 2026-09-02T23:00Z（其實比 Z 那條舊）
    ctx.DBManager.run('UPDATE workout_logs SET updated_at = ? WHERE id = ?', ['2026-09-03T07:00:00+08:00', row.id]);
    const res = await DL.upsertWithConflictResolution('workout_logs', { ...row, id: row.id, completed: 1, notes: 'from-cloud', updated_at: Z });
    assert.equal(res.action, 'applied', '遠端較新 → 必須採用（比字串時 07:00 > 00:30 會誤留本機）');
    const after = ctx.DBManager.getRow('SELECT * FROM workout_logs WHERE id = ?', [row.id]);
    assert.equal(after.notes, 'from-cloud');
    assert.match(String(after.updated_at), /Z$/, '套用的是遠端時間戳');
  });
});

test('墓碑不能复活：本機沒這列時，deleted 列只准被忽略', async () => {
  await withApp(async (ctx) => {
    const res = await ctx.DataLayer.upsertWithConflictResolution('workout_logs', {
      id: 'verify-deadbeef', log_date: '2026-09-03', phase: 0, dayType: 'verify', completed: 0,
      deleted: 1, updated_at: new Date().toISOString(),
    });
    assert.equal(res.action, 'ignored-tombstone');
    assert.equal(ctx.DBManager.getRow('SELECT id FROM workout_logs WHERE id = ?', ['verify-deadbeef']), null, '不該被當成新增列插回來');
  });
});

test('較新的刪除要落到本機：pull 到 tombstone 就把列刪掉', async () => {
  await withApp(async (ctx) => {
    const DL = ctx.DataLayer;
    await DL.logWorkout({ date: '2026-09-04', phase: 1, dayType: 'fri', completed: 1 });
    const row = ctx.DBManager.getRow('SELECT * FROM workout_logs WHERE log_date = ?', ['2026-09-04']);
    const res = await DL.upsertWithConflictResolution('workout_logs', { ...row, deleted: 1, updated_at: new Date(Date.now() + 60000).toISOString() });
    assert.equal(res.action, 'deleted');
    assert.equal(ctx.DBManager.getRow('SELECT id FROM workout_logs WHERE id = ?', [row.id]), null, '本機要跟著消失');
  });
});

test('沒有 deleted 欄的表靠 op=delete 认墓碑（雲端 pullRows_ 會附 op）', async () => {
  await withApp(async (ctx) => {
    await ctx.DataLayer.importAll({ tables: { badges: [{ badge_id: 'first_sync', earned: 1, date_earned: '2026-09-03', updated_at: '2026-09-02T00:00:00.000Z' }] } });
    assert.ok(ctx.DBManager.getRow('SELECT badge_id FROM badges WHERE badge_id = ?', ['first_sync']));
    const res = await ctx.DataLayer.upsertWithConflictResolution('badges', {
      badge_id: 'first_sync', earned: 1, date_earned: '2026-09-03', op: 'delete', updated_at: new Date(Date.now() + 60000).toISOString(),
    });
    assert.equal(res.action, 'deleted', 'op=delete 也是墓碑');
    assert.equal(ctx.DBManager.getRow('SELECT badge_id FROM badges WHERE badge_id = ?', ['first_sync']), null);
  });
});

test('本機寫入的時間戳一律 UTC Z（跟雲端同一枚舉，比大小才不會錯）', async () => {
  await withApp(async (ctx) => {
    await ctx.DataLayer.logWorkout({ date: '2026-09-05', phase: 0, dayType: 'sat', completed: 1 });
    const row = ctx.DBManager.getRow('SELECT * FROM workout_logs WHERE log_date = ?', ['2026-09-05']);
    assert.match(String(row.updated_at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, `實際拿到 ${row.updated_at}`);
    assert.match(String(row.created_at), /Z$/, 'created_at 也要同一枚舉');
  });
});

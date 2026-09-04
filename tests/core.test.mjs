// 純邏輯單測：日期 / 關卡 / streak / 徽章 / 技能樹（這些是最容易在跨時區炸掉的部分）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { console, JSON, Date, Math, Number, String, Object, Array, Set, Map, parseInt, Infinity, NaN };
vm.createContext(ctx);
for (const f of ['dates.js', 'game-core.js']) {
  vm.runInContext(readFileSync(join(ROOT, 'build', 'ts', f), 'utf8'), ctx, { filename: f });
}
const D = ctx.DateUtils, G = ctx.GameCore;
// vm context 的物件屬於另一個 realm，原型與 host 不同 → assert/strict 會誤判，先拍平再比
const plain = (o) => JSON.parse(JSON.stringify(o));

test('toISODate / fromISODate 以本機日曆日為準，不吃 UTC', () => {
  const d = new Date(2026, 8, 3, 23, 30, 0);          // 本機 23:30
  assert.equal(D.toISODate(d), '2026-09-03');
  assert.equal(D.fromISODate('2026-09-03').getHours(), 0);
  assert.equal(D.fromISODate('2026-09-03').getDate(), 3);   // ← 原規格 new Date('2026-09-03') 會變 UTC 午夜，HK 變早上 8 點
});

test('dayDiff 跨月/跨閏年正確，且不受時分影響', () => {
  assert.equal(D.dayDiff('2026-02-27', '2026-03-02'), 3);
  assert.equal(D.dayDiff('2024-02-28', '2024-02-29'), 1);   // 閏年
  assert.equal(D.dayDiff('2026-12-31', '2027-01-01'), 1);
  assert.ok(Number.isNaN(D.dayDiff('garbage', '2026-01-01')));
});

test('weekend 判定：0=日、6=六', () => {
  assert.equal(D.weekdayOf('2026-09-06'), 0);   // 週日
  assert.equal(D.weekdayOf('2026-09-05'), 6);   // 週六
  assert.equal(D.weekdayKey('2026-09-07'), 'mon');
});

test('levelFor 取最高符合等級，並給進度與下一级', () => {
  assert.equal(G.levelFor(0).level, 1);
  assert.equal(G.levelFor(499).level, 1);
  assert.equal(G.levelFor(500).level, 2);
  assert.equal(G.levelFor(29999).level, 9);
  const top = G.levelFor(99999);
  assert.equal(top.level, 10); assert.equal(top.next, null); assert.equal(top.progress, 1);
  const mid = G.levelFor(1000);
  assert.equal(mid.next.xpRequired, 1500);
  assert.ok(mid.progress > 0 && mid.progress < 1);
});

test('streaks：今天沒練不斷串；缺口則歸 0；最長另計', () => {
  const s1 = G.streaks(['2026-09-01', '2026-09-02', '2026-09-03'], '2026-09-04');
  assert.deepEqual([s1.current, s1.longest], [3, 3]);
  const s2 = G.streaks(['2026-09-01', '2026-09-03'], '2026-09-03');
  assert.deepEqual([s2.current, s2.longest], [1, 1]);
  const s3 = G.streaks(['2026-08-20', '2026-08-21', '2026-09-03'], '2026-09-03');
  assert.deepEqual([s3.current, s3.longest], [1, 2]);
  assert.deepEqual(plain(G.streaks([], '2026-09-03')), { current: 0, longest: 0 });
});

test('streaks 不受時區影響（同一份日期字串，換時區結果相同）', () => {
  const run = (tz) => {
    const prev = process.env.TZ; process.env.TZ = tz;
    try {
      return G.streaks(['2026-09-01', '2026-09-02', '2026-09-03'], '2026-09-03').current;
    } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
  };
  assert.equal(run('Asia/Hong_Kong'), run('UTC'));
  assert.equal(run('Pacific/Kiritimati'), run('UTC-10'));
});

test('todayPlan：休息日取 rest_days；訓練日回對應課表', () => {
  const workout = { days_in_week: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], rest_days: [0, 6],
    phases: { phase0: { weeks: 4, days: { mon: [{ name: 'A', xp: 10 }], wed: [{ name: 'C', xp: 10 }] } } } };
  const mon = G.todayPlan(workout, 0, { todayISO: '2026-09-07', restDays: workout.rest_days });   // 星期一
  assert.equal(mon.isRestDay, false); assert.equal(mon.dayKey, 'mon');
  const sat = G.todayPlan(workout, 0, { todayISO: '2026-09-05', restDays: workout.rest_days });   // 星期六
  assert.equal(sat.isRestDay, true);
  const sun = G.todayPlan(workout, 0, { todayISO: '2026-09-06', restDays: [0, 6] });
  assert.equal(sun.isRestDay, true);
  const empty = G.todayPlan(null, 0, { todayISO: '2026-09-07' });
  assert.equal(empty.isRestDay, true); assert.equal(empty.reason, 'no-data');
});

test('todayPlan：phase 沒定義該星期時用穩定對映（同一天必得同一結果）', () => {
  const workout = { days_in_week: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], rest_days: [0, 6],
    phases: { phase0: { weeks: 4, start_anchor: '2026-09-01', days: { mon: [{ name: 'A' }], tue: [{ name: 'B' }], wed: [{ name: 'C' }] } } } };
  const thursday = G.todayPlan(workout, 0, { todayISO: '2026-09-10', restDays: [0, 6] });   // 週四不在課表 → mapped
  assert.equal(thursday.isRestDay, false); assert.equal(thursday.mapped, true);
  const again = G.todayPlan(workout, 0, { todayISO: '2026-09-10', restDays: [0, 6] });
  assert.equal(again.dayKey, thursday.dayKey);        // 冪等（原規格用 Date.now() 會漂）
});

test('canUnlock：前置未解 / XP 不足 / 已解鎖 各自回報', () => {
  const node = { id: 'core3', requires: ['core2'], min_xp: 900, min_streak: 0 };
  assert.deepEqual(plain(G.canUnlock(node, {})), { ok: false, why: 'deps', missing: ['core2'] });
  assert.deepEqual(plain(G.canUnlock(node, { core2: { unlocked: 1 } }, { totalXP: 100 })), { ok: false, why: 'xp', need: 900 });
  assert.equal(G.canUnlock(node, { core2: { unlocked: 1 } }, { totalXP: 1000 }).ok, true);
  assert.deepEqual(plain(G.canUnlock(node, { core3: { unlocked: 1 } }, { totalXP: 1e6 })), { ok: false, why: 'already' });
});

test('earnedBadges：>= 判斷、只回未拿過的', () => {
  const defs = [{ id: 'a', metric: 'total_sessions', op: '>=', value: 1 }, { id: 'b', metric: 'streak_current', op: '>=', value: 7 }, { id: 'c', metric: 'total_xp', op: '>', value: 100 }];
  const got = G.earnedBadges(defs, { total_sessions: 1, streak_current: 6, total_xp: 101 }, { a: { earned: 1 } });
  assert.deepEqual(plain(got), ['c']);          // a 已拿過 → 不重發；b 沒到 7
});

test('weeklyStats 以本機週為界回 8 桶', () => {
  const logs = [{ log_date: '2026-09-03', completed: 1, xp_earned: 100 }, { log_date: '2026-08-30', completed: 1, xp_earned: 50 }, { log_date: '2025-01-01', completed: 1, xp_earned: 999 }];
  const w = G.weeklyStats(logs, 8, '2026-09-06');
  assert.equal(w.length, 8);
  assert.equal(w[0].sessions, 1);
  assert.ok(w.some((b) => b.xp === 50));
  assert.equal(w.reduce((s, b) => s + b.xp, 0), 150);   // 超出 8 週的 999 不计
});

test('技能樹總數不准寫死在前端（資料是唯一真值）', () => {
  const files = ['index.html', 'src/App.tsx', 'src/skyrim/data/skyrimPerksData.ts'];
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /\b(33|36)\s*(顆|個節點|\/ 33)/, `${f} 把節點總數寫死了`);
  }
  const n = JSON.parse(readFileSync(join(ROOT, 'data/skills.json'), 'utf8')).nodes.length;
  assert.ok(n >= 30, '星圖至少要有 30 顆星');
});

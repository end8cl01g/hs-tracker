// tests/plan.test.mjs — PLAN.md（規範）與 data/*.json（編譯結果）必須同步。
// 由 scripts/gen-plan.mjs 單一來源產生；這條測試就是那個「漂移警報器」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const W = JSON.parse(read('data/workout.json'));

test('data/*.json 必須能由 scripts/gen-plan.mjs 重現（手改資料檔＝漂移）', () => {
  const out = execFileSync('node', ['scripts/gen-plan.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /一致/);
});

test('PLAN.md 的階段表必須與 data/workout.json 逐項一致（規範 ↔ 編譯結果）', () => {
  const md = read('PLAN.md');
  const rows = [...md.matchAll(/\|\s*\*\*Phase\s*(\d)\*\*\s*\|\s*第\s*(\d+)-(\d+)\s*週\s*\|\s*([^|]*?)\s*\|/g)];
  assert.equal(rows.length, 5, `PLAN.md 應有 5 列階段表，實得 ${rows.length}`);
  for (const m of rows) {
    const i = Number(m[1]);
    const ph = W.phases['phase' + i];
    assert.ok(ph, `資料檔沒有 phase${i}`);
    const [a, b] = [Number(m[2]), Number(m[3])];
    assert.deepEqual(ph.weeks_range, [a, b], `phase${i} 週區間不同步：PLAN ${a}-${b} / 資料 ${ph.weeks_range}`);
    assert.equal(b - a + 1, ph.weeks, `phase${i} 區間長度與 weeks 不符`);
    assert.ok(m[4].includes(ph.title), `phase${i} 標題不同步：PLAN「${m[4]}」沒有含「${ph.title}」`);
  }
  const total = [0, 1, 2, 3, 4].reduce((acc, i) => acc + W.phases['phase' + i].weeks, 0);
  assert.equal(total, 52, '52 週是計劃骨架');
  for (const t of ['必達', '挑戰', '延伸', '退階版', '不要第一天就踢上去']) assert.ok(md.includes(t), `PLAN.md 少了關鍵條目：${t}`);
});

test('Phase 0 逐日課表與計劃一致（除鏽期是这次修正的核心）', () => {
  const p0 = W.phases.phase0;
  assert.equal(p0.weeks, 6);
  assert.equal(Object.keys(p0.days).length, 5, 'mon..fri 五天（六日休息）');
  assert.deepEqual(Object.entries(p0.days).map(([k, v]) => [k, v.length]), [['mon', 7], ['tue', 6], ['wed', 7], ['thu', 7], ['fri', 4]]);
  const names = (d) => p0.days[d].map((x) => x.name).join('、');
  assert.match(names('mon'), /跪姿 Pike Push-up/, 'Day 1 的 Pike PU 必須是跪姿退階版（不是完整版）');
  assert.match(names('mon'), /手腕強化/, 'Day 1 要有手腕強化（预防手腕傷害是黑帽的重點）');
  assert.match(names('tue'), /面牆倒立（胸朝牆）/);
  assert.match(names('tue'), /烏鴉式/);
  assert.match(names('tue'), /L-sit（屈膝）/);
  assert.match(names('thu'), /雙槓/, 'Day 4 要用公園雙槓');
  assert.match(names('fri'), /隨意嘗試/, 'Day 5 是 Play，不是量產');
  assert.equal(p0.day_meta.fri.optional, true, 'Day 5 必須標記可選');
  assert.equal(p0.day_meta.mon.place, 'chocoZAP');
  assert.equal(p0.day_meta.tue.place, '九龍公園');
});

test('安全提示與退階版要寫進資料（不是靠使用者自己記得）', () => {
  const p0 = W.phases.phase0;
  const wall = p0.days.tue.find((x) => /面牆/.test(x.name));
  assert.match(wall.note, /不要第一天就踢上去/, '⚠️ 舊運動記憶會誘使人踢上牆——這句必須在畫面上');
  assert.match(wall.regression, /45°/, '面牆倒立要從 45° 傾斜開始');
  const crow = p0.days.tue.find((x) => /烏鴉/.test(x.name));
  assert.match(crow.note, /背包|安全墊/, '烏鴉式要有防撞說明');
  let reg = 0, tot = 0;
  for (const ph of Object.values(W.phases)) for (const list of Object.values(ph.days)) for (const x of list) { tot++; if (x.regression) reg++; }
  assert.ok(reg / tot >= 0.3, `退階版覆蓋率 ${(reg / tot * 100).toFixed(0)}% 太低：計劃要求「每個動作都有退階」`);
});

test('每個 Phase 都有進階標準（gate）與分層目標；里程碑徽章齊備', () => {
  for (const [k, p] of Object.entries(W.phases)) {
    assert.ok(Array.isArray(p.gate) && p.gate.length >= 3, `${k} 缺 gate`);
    assert.ok(p.gate_note, `${k} 缺 gate_note（規則沒有解釋就容易被忽略）`);
    assert.ok(p.focus, `${k} 缺 focus`);
  }
  assert.deepEqual(W.goals.must, ['自由倒立 30 秒', 'Headstand Press', 'Straddle Press Negative 全程控制']);
  assert.equal(W.goals.stretch.length, 1);
  assert.equal(W.goals.bonus.length, 1);
  const ids = JSON.parse(read('data/badges.json')).badges.map((b) => b.id);
  for (const need of ['crow_return', 'wall_return', 'rust_cleared', 'first_log', 'first_sync']) assert.ok(ids.includes(need), '缺徽章 ' + need);
});



test('技能樹是 PLAN.md 那棵「動作解鎖樹」：頂端是 Full Pike Press，起點是手腕與伏地挺身', () => {
  const s = JSON.parse(read('data/skills.json'));
  const by = new Map(s.nodes.map((n) => [n.id, n]));
  assert.ok(by.has('full_pike'), '樹頂（Full Pike Press to Handstand）要在');
  assert.ok(by.has('wrist1') && by.get('wrist1').requires.length === 0, '起點線要從手腕熱身開始');
  assert.ok(by.has('strad_press') && by.has('strad_neg') && by.has('pike_neg'));
  const maxTier = Math.max(...s.nodes.map((n) => n.tier));
  assert.equal(by.get('full_pike').tier, maxTier, '樹頂必須是最深層');
  const branchTop = Object.entries(s.nodes.reduce((m, n) => { m[n.branch] = Math.max(m[n.branch] || 0, n.tier); return m; }, {}));
  assert.ok(branchTop.length >= 6, '分支太少，不像一棵樹');
});

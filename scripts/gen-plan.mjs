#!/usr/bin/env node
// scripts/gen-plan.mjs — 訓練計劃的唯一來源（PLAN.md 的機器可讀版），產生 data/workout.json、skills.json、badges.json。
// 為什麼要產生而不是手改 JSON：計劃是「規範」，資料檔是它的編譯結果；手改兩邊一定漂移。
// 用法：
//   node scripts/gen-plan.mjs            # 寫入 data/*.json
//   node scripts/gen-plan.mjs --check    # 只比對，不一致就 exit 1（測試用）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'data');
const KIND_LABELS = {
  warmup: '熱身', hold: '支撐', strength: '力量', core: '核心', mobility: '柔韌',
  play: '自由練習', assess: '評估', skill: '技巧',
};

// ---- Phase 0（第 1-6 週）除鏽重建：逐條照 PLAN.md 抄，改這裡等於改規範，必須同步 PLAN.md ----
const PHASE0 = {
  title: '除鏽重建', weeks: 6, weeks_range: [1, 6],
  focus: '不追求強度，追求「重新連結」：每個動作都從退階版開始，讓神經系統重新記起動作模式。',
  day_meta: {
    mon: { label: '力量（推+核心）', place: 'chocoZAP', minutes: '35-45' },
    tue: { label: '動作重建 A', place: '九龍公園', minutes: '35-45' },
    wed: { label: '力量（拉+核心）', place: 'chocoZAP', minutes: '35-45' },
    thu: { label: '動作重建 B', place: '九龍公園', minutes: '35-45' },
    fri: { label: '柔韌＋輕度練習（可選）', place: '九龍公園草地', minutes: '30', optional: true },
  },
  days: {
    mon: [
      { name: '健身單車熱身', xp: 10, kind: 'warmup', detail: '5 分鐘 · 中等', note: '全身升溫' },
      { name: '肩推機', xp: 20, kind: 'strength', detail: '3 × 12-15（輕重量）· 2 秒上 / 3 秒下', note: '⚠️ 前 2 週用你覺得「太輕」的重量：目的是讓肩關節重新適應軌道，不是衝重量' },
      { name: '胸推機', xp: 20, kind: 'strength', detail: '3 × 12-15（輕重量）· 2 秒上 / 3 秒下', note: '同上，先把軌道走穩' },
      { name: '跪姿 Pike Push-up', xp: 25, kind: 'strength', detail: '3 × 8-10 · 慢速', regression: '雙膝跪地、臀部後坐高抬起做俯身推（比完整版容易約 50%）', note: '能做 3×12 後升級為完整版' },
      { name: '平板支撐', xp: 15, kind: 'core', detail: '3 × 30 秒', regression: '手撐在長椅／矮槓上（提高手位）', note: '夾臀、收肋、推離地面' },
      { name: 'Dead Bug', xp: 15, kind: 'core', detail: '3 × 8 每側 · 慢速', note: '對側手腳伸出時呼氣、腰椎貼地' },
      { name: '手腕強化：手指撐桌推', xp: 10, kind: 'strength', detail: '2 × 15', note: '雙手撐器材座椅邊緣，用手指力量推起 — 預防手腕傷害' },
    ],
    tue: [
      { name: '手腕熱身', xp: 10, kind: 'warmup', detail: '5 分鐘', note: '繞環、撐地前後搖擺、祈禱式伸展' },
      { name: '面牆倒立（胸朝牆）', xp: 30, kind: 'hold', detail: '5 × 15-30 秒 · 休息 90 秒', regression: '腳在牆上、身體傾斜 45°，每次訓練讓手走近牆一點', note: '⚠️ 不要第一天就踢上去！慢慢走上去' },
      { name: '烏鴉式', xp: 25, kind: 'hold', detail: '5 × 嘗試 · 休息 60 秒', regression: '雙腳先貼地、重心前移到指尖；再單腳離地；最後雙腳', note: '前方放背包當安全墊（防止臉摔地）' },
      { name: 'L-sit（屈膝）', xp: 20, kind: 'hold', detail: '4 × 10-15 秒 · 休息 60 秒', regression: '屈膝提起 → 伸直一條腿 → 兩條腿', note: '能做 4×20 秒屈膝版後再升級' },
      { name: '伏地挺身', xp: 15, kind: 'strength', detail: '3 × 10-15', regression: '手上長椅（降低坡度）' },
      { name: '柔韌性訓練', xp: 15, kind: 'mobility', detail: '10-12 分鐘', note: 'Pike 前彎 + Pancake + 肩部過頭 + 手腕' },
    ],
    wed: [
      { name: '跑步機快走熱身', xp: 10, kind: 'warmup', detail: '5 分鐘' },
      { name: '高拉背機', xp: 20, kind: 'strength', detail: '3 × 12-15（輕重量）· 2 秒拉 / 3 秒回', note: '前 2 週輕重量，專注「肩胛骨先下沉再拉」' },
      { name: '高拉背機（窄握／反握）', xp: 20, kind: 'strength', detail: '3 × 12-15 · 2 秒拉 / 3 秒回', note: '不同握法強化二頭與中背' },
      { name: '腿推機', xp: 15, kind: 'strength', detail: '3 × 15 · 2 秒推 / 3 秒回', note: '輕重量，維持下肢基礎' },
      { name: 'Hollow Body Hold', xp: 20, kind: 'core', detail: '4 × 15-20 秒 · 休息 45 秒', regression: '屈膝版：雙膝拉向胸口、肩膀離地、腰椎壓地；能做 4×30 秒後伸直雙腿' },
      { name: 'Superman Hold', xp: 15, kind: 'core', detail: '3 × 15-20 秒', note: '俯臥手腳同時離地，強化下背以平衡 Hollow Body' },
      { name: '手腕伸展', xp: 10, kind: 'mobility', detail: '3 分鐘', note: '四方向各 30 秒' },
    ],
    thu: [
      { name: '手腕熱身', xp: 10, kind: 'warmup', detail: '5 分鐘' },
      { name: '面牆倒立', xp: 25, kind: 'hold', detail: '4 × 15-30 秒', note: '比 Day 2 略少量，保留體力' },
      { name: '雙槓支撐 Hold', xp: 25, kind: 'hold', detail: '4 × 15-20 秒 · 休息 60 秒', regression: '腳撐地減少負擔', note: '🔩 公園雙槓。肩膀下壓、鎖肘 — 之後 L-sit on bars 的基礎' },
      { name: '雙槓屈膝提腿', xp: 20, kind: 'core', detail: '3 × 8 · 休息 60 秒', note: '🔩 支撐位提膝到胸口，壓縮力量啟蒙' },
      { name: '引體向上', xp: 25, kind: 'strength', detail: '4 × 最大次數 · 休息 120 秒', regression: '跳上去再慢放 5 秒（離心引體）', note: '🔩 引體架' },
      { name: '站姿壓縮提腿', xp: 15, kind: 'core', detail: '3 × 5 · 休息 60 秒', regression: '一手扶欄杆保持平衡', note: '雙腿伸直用髖屈肌抬起，能抬多高抬多高' },
      { name: '柔韌性訓練', xp: 15, kind: 'mobility', detail: '10-12 分鐘', note: '加重 Pancake 比例' },
    ],
    fri: [
      { name: '快走暖身', xp: 5, kind: 'warmup', detail: '5 分鐘' },
      { name: '全套柔韌性（加長版）', xp: 20, kind: 'mobility', detail: '20 分鐘' },
      { name: '烏鴉式隨意嘗試', xp: 10, kind: 'play', detail: '5 分鐘', note: '不計時、不計組 — 心態是 Play' },
      { name: '面牆倒立隨意嘗試', xp: 10, kind: 'play', detail: '5 分鐘', note: '讓身體在草地上自由探索' },
    ],
  },
  gate: [
    '面牆倒立（胸朝牆）60 秒 × 2 組',
    '烏鴉式 30 秒穩定',
    'L-sit（直腿）15 秒',
    'Pike Push-up 3 × 10（完整版）',
    '伏地挺身 3 × 20',
    '引體向上 3 × 5',
    'Hollow Body Hold（直腿）30 秒',
    '站姿前彎手指至少觸腳踝',
  ],
  gate_note: '全部達標才進入 Phase 1 —— 看能力，不看日曆。',
};

const e = (name, kind, xp, detail, extra = {}) => ({ name, kind, xp, detail, ...extra });
// Phase 1-4：結構沿用上版，依第三次審議加長週數、每個動作補退階版（計劃硬要求：「做不了」時要有替代方案）
const PHASES_REST = {
  phase1: {
    title: '地基工程', weeks: 12, weeks_range: [7, 18],
    focus: '建立自由倒立 5-10 秒與基礎力量；所有支撐都以「質量優先」為準。',
    day_meta: {
      mon: { label: '力量＋支撐', place: 'chocoZAP', minutes: '45-55' },
      tue: { label: '倒立技巧 A', place: '九龍公園', minutes: '45' },
      wed: { label: '力量（拉＋核心）', place: 'chocoZAP', minutes: '45-55' },
      thu: { label: '倒立技巧 B', place: '九龍公園', minutes: '45' },
      fri: { label: '柔韌＋嘗試（可選）', place: '九龍公園草地', minutes: '30', optional: true },
    },
    days: {
      mon: [e('肩推', 'strength', 25, '4 × 8 · 2/3 拍', { regression: '器械肩推先穩再加重' }),
        e('胸推機', 'strength', 20, '4 × 10'), e('伏地挺身', 'strength', 20, '4 × 12-15', { regression: '手上長椅' }),
        e('Pike Push-up', 'strength', 25, '4 × 8', { regression: '跪姿或手上矮槓' }),
        e('空心體', 'core', 15, '4 × 30 秒', { regression: '屈膝 Hollow' })],
      tue: [e('手腕熱身', 'warmup', 10, '5 分鐘'), e('面牆倒立', 'hold', 30, '6 × 20-30 秒'),
        e('離牆平衡嘗試（背牆）', 'hold', 30, '6 × 3-8 秒', { note: '⚠️ 腳跟碰牆就好；塌肩就停', regression: '只離牆 5 公分、手邊放瑜伽磚' }),
        e('烏鴉式', 'hold', 20, '4 × 20-30 秒'), e('L-sit（屈膝）', 'hold', 20, '4 × 15 秒'),
        e('柔韌性訓練', 'mobility', 15, '12 分鐘')],
      wed: [e('引體向上', 'strength', 25, '5 × 最大', { regression: '離心 5 秒慢放' }), e('高拉背', 'strength', 20, '4 × 10'),
        e('腿推機', 'strength', 15, '4 × 12'), e('懸掛提腿', 'core', 20, '4 × 8', { regression: '屈膝提腿' }),
        e('Superman Hold', 'core', 10, '3 × 20 秒')],
      thu: [e('手腕熱身', 'warmup', 10, '5 分鐘'), e('背牆倒立', 'hold', 30, '5 × 30-45 秒'),
        e('踢上牆練習', 'skill', 25, '6 × 嘗試', { regression: '先練「一只腳蹬地＋另一腳輕點」的節奏' }),
        e('雙槓支撐', 'hold', 20, '5 × 20-30 秒'), e('站姿壓縮提腿', 'core', 15, '4 × 6'),
        e('柔韌性訓練', 'mobility', 15, '12 分鐘')],
      fri: [e('全套柔韌性', 'mobility', 20, '20 分鐘'), e('自由練習', 'play', 10, '10 分鐘', { note: '只玩已熟練的動作，不試新風險' })],
    },
    gate: ['自由倒立 5-10 秒 × 3 次', '靠牆倒立 90 秒', 'Pike Push-up 4 × 12', '伏地挺身 4 × 20', '引體向上 4 × 6', 'L-sit（直腿）20 秒'],
    gate_note: '至少三次連續訓練都達標才進 Phase 2。',
  },
  phase2: {
    title: '結構建設', weeks: 12, weeks_range: [19, 30],
    focus: '自由倒立 20-30 秒與 Headstand Press 的力量結構。',
    day_meta: {
      mon: { label: '力量＋過頭支撐', place: 'chocoZAP', minutes: '50' },
      tue: { label: '倒立控制 A', place: '九龍公園', minutes: '45-50' },
      wed: { label: '力量（推）', place: 'chocoZAP', minutes: '50' },
      thu: { label: 'Headstand Press', place: '九龍公園', minutes: '45-50' },
      fri: { label: '柔韌＋Volume（可選）', place: '九龍公園草地', minutes: '30', optional: true },
    },
    days: {
      mon: [e('肩推', 'strength', 25, '5 × 6-8'), e('Dip（雙槓）', 'strength', 25, '4 × 8', { regression: '彈帶輔助，或腳撐地分擔' }),
        e('HSPU 预备（Pike 抬高腳）', 'strength', 25, '4 × 6', { regression: '腳不抬高版' }), e('空心體', 'core', 15, '4 × 45 秒')],
      tue: [e('手腕熱身', 'warmup', 10, '5 分鐘'), e('自由倒立', 'hold', 35, '8 × 10-15 秒'), e('控制回落練習', 'skill', 25, '5 × 3', { note: '⚠️ 練「安全落地」比練更久更重要' }),
        e('L-sit on bars', 'hold', 20, '5 × 15 秒', { regression: '屈膝' }), e('柔韌性訓練', 'mobility', 15, '12 分鐘')],
      wed: [e('引體向上（加重或體重）', 'strength', 25, '5 × 5'), e('高拉背', 'strength', 20, '4 × 10'),
        e('懸掛舉腿（直腿）', 'core', 25, '4 × 8', { regression: '屈膝' }), e('侧槓（Side Plank）', 'core', 15, '3 × 30 秒/側')],
      thu: [e('手腕熱身', 'warmup', 10, '5 分鐘'), e('Headstand（三點）', 'hold', 25, '5 × 45-60 秒'),
        e('頭倒立單腳提起', 'skill', 25, '5 × 3'), e('Headstand Press 嘗試', 'skill', 35, '6 × 嘗試', { note: '⚠️ 收緊核心、腳跟贴臀；失敗就側翻落地' }),
        e('柔韌性訓練', 'mobility', 15, '12 分鐘')],
      fri: [e('輕量倒立 volume', 'play', 20, '8 × 5 秒'), e('全套柔韌性', 'mobility', 20, '20 分鐘')],
    },
    gate: ['自由倒立 20-30 秒 × 2', 'Headstand 60 秒穩定', 'Headstand Press 成功 3 次', 'L-sit 30 秒', 'Pike PU 4 × 15 或 HSPU 4 × 6'],
    gate_note: '心理關卡（怕摔）也算 gate：能在無人扶持下從容落地再進。',
  },
  phase3: {
    title: '進階工程', weeks: 14, weeks_range: [31, 44],
    focus: 'Straddle Press 的離心控制與抬高面練習；品質優先於次數。',
    day_meta: {
      mon: { label: '壓力量', place: 'chocoZAP', minutes: '50' },
      tue: { label: 'Press 專項 A', place: '九龍公園', minutes: '50' },
      wed: { label: '力量＋壓縮', place: 'chocoZAP', minutes: '50' },
      thu: { label: 'Press 專項 B', place: '九龍公園', minutes: '50' },
      fri: { label: '技術與恢復（可選）', place: '九龍公園草地', minutes: '30', optional: true },
    },
    days: {
      mon: [e('站姿槓鈴／器械肩推', 'strength', 30, '5 × 5'), e('Dip 加重', 'strength', 25, '4 × 6', { regression: '體重 4 × 10' }),
        e('Rack HSPU', 'strength', 30, '5 × 3-5', { regression: '仍用 Pike 抬高版' }), e('Handstand 靠牆負重支撐', 'hold', 20, '4 × 40 秒')],
      tue: [e('手腕熱身', 'warmup', 10, '5 分鐘'), e('Straddle Press 離心（Negative）', 'assess', 35, '6 × 5 秒慢放', { note: '⚠️ 全程控制，塌肩立即中止' }),
        e('抬高面 Straddle Press', 'skill', 30, '6 × 嘗試', { regression: '面再高一點（更陡＝更容易）' }), e('自由倒立', 'hold', 25, '5 × 15-25 秒'),
        e('柔韌性訓練（Pancake 加重）', 'mobility', 20, '15 分鐘')],
      wed: [e('引體向上', 'strength', 25, '5 × 5'), e('單臂懸掛（輪替）', 'strength', 20, '4 × 20 秒/側', { regression: '雙手懸掛＋收肩' }),
        e('地面 L-sit', 'hold', 25, '5 × 25 秒'), e(' Compression 系列', 'core', 20, '3 × 10')],
      thu: [e('手腕熱身', 'warmup', 10, '5 分鐘'), e('Tuck-to-Handstand 壓上', 'skill', 35, '6 × 嘗試'),
        e('Straddle 靜態壓縮', 'hold', 25, '5 × 20 秒'), e('倒立控制（自由）', 'hold', 30, '6 × 15 秒'),
        e('落地安全練習（側翻／頭前）', 'assess', 15, '4 × 3')],
      fri: [e('輕量技術', 'play', 20, '10 分鐘'), e('恢復与拉伸', 'mobility', 15, '15 分鐘')],
    },
    gate: ['Straddle Negative 全程 5 秒 × 3', '抬高面 Straddle Press 3 種高度成功', '自由倒立 45 秒', 'L-sit 40 秒', 'Compression：腳尖能舉過頭高度 3 次'],
    gate_note: '任何一個關節出現刺痛 ⇒ 本週退回前一階，不算失敗。',
  },
  phase4: {
    title: '目標衝刺', weeks: 8, weeks_range: [45, 52],
    focus: '首次完整 Straddle Press ＋把成果鞏固成可重複的能力。',
    day_meta: {
      mon: { label: '力量維持', place: 'chocoZAP', minutes: '45' },
      tue: { label: 'Press 衝刺 A', place: '九龍公園', minutes: '50' },
      wed: { label: '恢復＋柔韌', place: 'chocoZAP', minutes: '40' },
      thu: { label: 'Press 衝刺 B', place: '九龍公園', minutes: '50' },
      fri: { label: '自由練習（可選）', place: '九龍公園草地', minutes: '30', optional: true },
    },
    days: {
      mon: [e('肩推（維持量）', 'strength', 25, '4 × 5'), e('Dip', 'strength', 20, '4 × 6'), e('空心體', 'core', 15, '4 × 60 秒')],
      tue: [e('手腕熱身', 'warmup', 10, '5 分鐘'), e('Straddle Press（完整嘗試）', 'skill', 40, '8 × 嘗試', { note: '⚠️ 精神狀態不佳就只做離心；強行嘗試是這個階段最大的受傷來源' }),
        e('抬高面逐步降高度', 'skill', 30, '5 × 嘗試'), e('自由倒立', 'hold', 25, '4 × 25 秒')],
      wed: [e('輕重量全身維持', 'strength', 20, '3 × 12'), e('柔韌與手腕', 'mobility', 20, '20 分鐘')],
      thu: [e('手腕熱身', 'warmup', 10, '5 分鐘'), e('Straddle Press（完整嘗試）', 'skill', 40, '8 × 嘗試'),
        e('Pike Press 嘗試', 'skill', 35, '5 × 嘗試'), e('倒立穩定度', 'hold', 25, '5 × 20 秒')],
      fri: [e('Play：把會的東西練漂亮', 'play', 25, '15 分鐘')],
    },
    gate: ['必達：自由倒立 30 秒 ＋ Headstand Press ＋ Straddle Negative 全程控制', '挑戰：首次完整 Straddle Press', '延伸：Straddle Press 連續 3 次'],
    gate_note: '分層目標：必達沒有的話，挑戰與延伸都不該優先——先補必達。',
  },
};

// ---- 動作解鎖樹（綠先生提案：每解鎖一個節點就打勾，讓他看得到全局）----
// tier 由 DAG 最長路徑算出，min_xp 依 tier 遞增；requires 必鬚指向已存在的 id（測試會驗無環）。
const TREE = [
  ['wrist', '手腕', [
    ['wrist1', '手腕熱身與強化', []], ['wrist2', '手指撐桌推 2×15', ['wrist1']], ['wrist3', '撐地前後搖擺 60 秒', ['wrist2']]]],
  ['base', '地基', [
    ['pushup1', '伏地挺身 15', ['wrist1']], ['plank1', '平板支撐 30 秒', ['wrist1']], ['hollow1', 'Hollow Body 30 秒', ['plank1']],
    ['pullup1', '引體向上 3×5', ['hollow1']], ['pikepu1', '跪姿 Pike PU 3×10', ['pushup1']], ['pikepu2', 'Pike PU 3×15', ['pikepu1']]]],
  ['crow', '烏鴉', [
    ['crow1', '烏鴉 10 秒', ['wrist2']], ['crow2', '烏鴉 30 秒', ['crow1']], ['crow3', '烏鴉 60 秒', ['crow2']]]],
  ['lsit', 'L-sit／壓縮', [
    ['lsit1', '屈膝 L-sit', ['hollow1']], ['lsit2', 'L-sit 15 秒', ['lsit1']], ['lsit3', 'L-sit 30 秒', ['lsit2']]]],
  ['wall', '牆面倒立', [
    ['wall1', '面牆倒立 30 秒', ['wrist2', 'pikepu1']], ['wall2', '面牆倒立 60 秒', ['wall1']], ['kick1', '背牆踢上', ['wall2']],
    ['wallfree1', '離牆平衡 5 秒', ['kick1']]]],
  ['balance', '自由倒立', [
    ['hs10', '自由倒立 10 秒', ['wallfree1', 'crow2']], ['hs30', '自由倒立 30 秒', ['hs10']], ['hs60', '自由倒立 60 秒', ['hs30']]]],
  ['press', '壓上（Press）', [
    ['head1', 'Headstand 30 秒', ['wall2', 'hollow1']], ['headpress', 'Headstand Press', ['head1', 'hs30']],
    ['elev1', '抬高面 Straddle Press', ['headpress', 'lsit3']], ['tuck1', 'Tuck Press to Handstand', ['elev1']],
    ['strad_neg', 'Straddle Negative 5 秒', ['elev1']], ['pike_neg', 'Pike Negative 5 秒', ['hs60']],
    ['strad_press', 'Straddle Press to Handstand', ['strad_neg', 'tuck1']], ['full_pike', 'Full Pike Press to Handstand', ['pike_neg', 'strad_press']]]],
  ['fear', '心理與安全', [
    ['safe1', '從容側翻落地', ['crow1']], ['safe2', '無人扶持下穩定落地', ['safe1', 'hs10']], ['safe3', '疲憊時主動收工', ['safe2']]]],
];
const XP_BY_TIER = [0, 150, 350, 600, 900, 1250, 1600, 2000, 2400, 2800];

function buildSkills() {
  const nodes = [];
  const byId = new Map();
  for (const [branch, branchLabel, list] of TREE) {
    for (const [id, name, requires] of list) {
      const n = { id, branch, branch_label: branchLabel, tier: 1, name, requires, min_xp: 0, min_streak: 0, desc: `${branchLabel}：${name}。` };
      byId.set(id, n); nodes.push(n);
    }
  }
  const tierOf = (id, seen = new Set()) => {
    const n = byId.get(id);
    if (!n || seen.has(id)) return 1;
    seen.add(id);
    if (!n.requires.length) return 1;
    return 1 + Math.max(...n.requires.map((r) => tierOf(r, new Set(seen))));
  };
  for (const n of nodes) { n.tier = tierOf(n.id); n.min_xp = XP_BY_TIER[Math.min(n.tier - 1, XP_BY_TIER.length - 1)]; }
  return nodes;
}

const BADGES = [
  { id: 'first_log', name: '第一次訓練', icon: '🌱', metric: 'total_sessions', op: '>=', value: 1, desc: '完成第一次打卡' },
  { id: 'crow_return', name: '烏鴉回歸', icon: '🔓', metric: 'total_sessions', op: '>=', value: 8, desc: '第 2 週自查：烏鴉式穩定 10 秒（Phase 0 里程碑）' },
  { id: 'wall_return', name: '牆面回歸', icon: '🧱', metric: 'total_sessions', op: '>=', value: 16, desc: '第 4 週自查：面牆倒立 45 秒 × 2 組（Phase 0 里程碑）' },
  { id: 'rust_cleared', name: '除鏽完成', icon: '🔧', metric: 'total_sessions', op: '>=', value: 24, desc: '第 6 週：烏鴉 30 秒 + 靠牆 60 秒 + L-sit 15 秒 + Pike PU 3×10' },
  { id: 'streak7', name: '一週不輟', icon: '🔥', metric: 'streak_current', op: '>=', value: 7, desc: '連續 7 天' },
  { id: 'streak30', name: '月度鐵人', icon: '🏆', metric: 'streak_current', op: '>=', value: 30, desc: '連續 30 天' },
  { id: 'sessions30', name: '三十次集滿', icon: '📚', metric: 'total_sessions', op: '>=', value: 30, desc: '累計 30 次' },
  { id: 'sessions150', name: '半年功課', icon: '📅', metric: 'total_sessions', op: '>=', value: 150, desc: '累計 150 次（52 週 × 約 4 天的量）' },
  { id: 'xp1000', name: '破千點', icon: '⚡', metric: 'total_xp', op: '>=', value: 1000, desc: '累計 1000 XP' },
  { id: 'xp5000', name: '五千點', icon: '💥', metric: 'total_xp', op: '>=', value: 5000, desc: '累計 5000 XP' },
  { id: 'xp12000', name: '萬二俱樂', icon: '🌋', metric: 'total_xp', op: '>=', value: 12000, desc: '累計 12000 XP' },
  { id: 'tree12', name: '技能樹初開', icon: '🌿', metric: 'skills_unlocked', op: '>=', value: 12, desc: '解鎖 12 個節點' },
  { id: 'tree24', name: '半棵樹', icon: '🌳', metric: 'skills_unlocked', op: '>=', value: 24, desc: '解鎖 24 個節點' },
  { id: 'level5', name: '戰士階', icon: '🎖', metric: 'level', op: '>=', value: 5, desc: '等級 5' },
  { id: 'first_sync', name: '上雲一次', icon: '☁️', metric: 'total_syncs', op: '>=', value: 1, desc: '完成第一次雲端同步' },
];

/** 計劃要求「每個動作都增設退階版」，所以這是最後一道保底：沒手寫退階的，按 kind 補一個不會害人的版本。
 *  自動補的也比留白好——留白的時候，「今天做不了」就會變成「今天不練」。 */
const DEF_REG = {
  warmup: '坐姿或靠牆做，減少手腕承重',
  hold: '時間減半、組數減 1（寧短不塌）',
  strength: '減 1/3 次數，或改用退階體式',
  core: '縮小幅度；腰椎一有感覺就停',
  mobility: '只到微微張力，不追深度',
  play: '只玩已熟練的動作，不試新風險',
  skill: '降一階變體，或只做離心半程',
  assess: '照前一階的標準自查，這次不算失敗',
};
export function build() {
  const stamp = new Date().toISOString();
  const workout = {
    version: 3, updated_at: stamp, plan_source: 'PLAN.md（第三次審議：Phase 0 除鏽重建 ＋ 分層目標）',
    kind_labels: KIND_LABELS, rest_days: [0, 6],
    days_in_week: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    goals: {
      must: ['自由倒立 30 秒', 'Headstand Press', 'Straddle Press Negative 全程控制'],
      stretch: ['首次完整 Straddle Press to Handstand'],
      bonus: ['Straddle Press 連續 3 次'],
      note: '1 年分層目標（第三次審議裁定）：必達沒穩之前，挑戰與延伸都不優先。',
    },
    phases: { phase0: PHASE0, ...PHASES_REST },
  };
  for (const ph of Object.values(workout.phases)) {
    for (const list of Object.values(ph.days)) {
      for (const x of list) if (!x.regression && DEF_REG[x.kind]) x.regression = DEF_REG[x.kind];
    }
  }

  const skills = { version: 3, updated_at: stamp, nodes: buildSkills() };
  const badges = { version: 3, updated_at: stamp, badges: BADGES };
  return { workout, skills, badges };
}

const files = { 'workout.json': 'workout', 'skills.json': 'skills', 'badges.json': 'badges' };
if (process.argv.includes('--check')) {
  const want = build();
  let drift = [];
  for (const [f, key] of Object.entries(files)) {
    const p = join(OUT, f);
    if (!existsSync(p)) { drift.push(`${f}：不存在`); continue; }
    const cur = JSON.parse(readFileSync(p, 'utf8'));
    const mine = want[key];
    // 只比內容不比時間戳（updated_at 每次產生都不同）
    const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.updated_at; if (c.phases) for (const p2 of Object.values(c.phases)) delete p2.updated_at; return JSON.stringify(c); };
    if (strip(cur) !== strip(mine)) drift.push(`${f}：與 gen-plan.mjs 不一致（有人手改了資料檔？）`);
  }
  if (drift.length) { console.log('✗ ' + drift.join('\n  ✗ ')); console.log('  → 改完 scripts/gen-plan.mjs 後跑：node scripts/gen-plan.mjs'); process.exit(1); }
  console.log('✓ data/*.json 與 gen-plan.mjs 一致'); process.exit(0);
}
const built = build();
for (const [f, key] of Object.entries(files)) writeFileSync(join(OUT, f), JSON.stringify(built[key], null, 2) + '\n');
console.log(`✓ 已產生 data/：workout ${Object.keys(built.workout.phases).length} phases、skills ${built.skills.nodes.length} 節點、badges ${built.badges.badges.length} 面`);

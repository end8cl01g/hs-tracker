/**
 * 卷軸（課表）、龍語牆（徽章）、行囊（器材與組數）全部由 data/*.json 生成。
 * 介面欄位沿用 Skyrim-html5 元件的契約；這裡不做任何訓練內容的決策（決策在 PLAN.md）。
 */
import skillsJson from '../../../data/skills.json';
import workoutJson from '../../../data/workout.json';
import badgesJson from '../../../data/badges.json';

export interface ScrollItem {
  id: string; title: string; subtitle: string; date: string; author: string;
  sealType: 'imperial' | 'dragonborn' | 'dwemer' | 'college'; sealColor: string;
  paperTone: 'aged' | 'scorched' | 'golden' | 'dark';
  contentLines: string[]; runicHeader: string; illuminatedLetter: string; notes: string;
  translationNotes?: { rune: string; dovah: string; translation: string }[];
}
export interface DragonWord { dovah: string; runicGlyph: string; meaning: string; phonetic: string; element: 'force' | 'fire' | 'frost' | 'time' | 'spirit' | 'storm' }
export interface DragonShout { id: string; name: string; englishName: string; description: string; words: DragonWord[]; cooldown: number; shoutLevelEffect: string[]; elementColor: string }
export interface InventoryItem {
  id: string; name: string; category: 'weapons' | 'apparel' | 'scrolls' | 'potions' | 'misc';
  type: string; damage?: number; armor?: number; weight: number; value: number;
  description: string; enchantment?: string; iconType: string; isEquipped?: boolean;
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F]/gu;
/** 介面不顯示 emoji（使用者的硬要求）。資料檔保持原樣：要清就清產生器，不在渲染層改寫內容語意。 */
const noEmoji = (t: any) => String(t ?? '').replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();

const W: any = workoutJson as any;
const S: any = skillsJson as any;
const B: any = badgesJson as any;
const KIND: Record<string, string> = W.kind_labels || {};
const SEALS = ['imperial', 'dragonborn', 'dwemer', 'college', 'imperial'] as const;
const TONES = ['aged', 'scorched', 'golden', 'dark', 'aged'] as const;
const DAY_ZH: Record<string, string> = { mon: '周一', tue: '周二', wed: '周三', thu: '周四', fri: '周五', sat: '周六', sun: '周日', rest: '休' };

/** 一份卷軸 = 一個階段的一天課表（5 階段 × 5 日 = 25 卷）；內容含處方、退階與 ⚠ 備註 */
export const ANCIENT_SCROLLS: ScrollItem[] = (W.phases ? Object.entries<any>(W.phases) : []).flatMap(
  ([pid, p]: [string, any], pi: number) => Object.entries<any>(p.days || {}).map(([dayKey, day]: [string, any], di: number) => {
    const meta = (p.day_meta && p.day_meta[dayKey]) || {};
    const lines = (day.exercises || day.items || []).map((e: any) => {
      const dose = [e.sets && `${e.sets} 組`, e.reps && `× ${e.reps}`, e.seconds && `${e.seconds} 秒`].filter(Boolean).join(' ');
      const bits = [`〔${KIND[e.kind] || e.kind || '動作'}〕${e.name}${dose ? ` — ${dose}` : ''}`];
      if (e.note) bits.push(`[!] ${e.note}`);
      if (e.regression) bits.push(`退階：${e.regression}`);
      return noEmoji(bits.join('  '));
    });
    return {
      id: `${pid}-${dayKey}`,
      title: noEmoji(`${p.name || pid} · ${DAY_ZH[dayKey] || dayKey}`),
      subtitle: noEmoji(meta.label || p.focus || ''),
      date: `第 ${p.weeks_range ? `${p.weeks_range[0]}–${p.weeks_range[1]} 週` : `${pi + 1} 段`} · 週 ${di + 1}`,
      author: 'PLAN.md（訓練計劃 v3）',
      sealType: SEALS[pi % SEALS.length], sealColor: '#8b6b3d', paperTone: TONES[pi % TONES.length],
      contentLines: lines.length ? lines : ['本日休養：讓結締組織追回來（這不是偷懶，是計劃的一條）'],
      runicHeader: noEmoji((p.focus || meta.label || p.name || pid).toString()).slice(0, 22),
      illuminatedLetter: (meta.label || p.name || 'P').toString().slice(0, 1),
      notes: noEmoji([meta.place && `地點：${meta.place}`, meta.minutes && `時間：約 ${meta.minutes} 分`,
        meta.optional ? '這一天可選（不做不算破功）' : '', p.gate_note || ''].filter(Boolean).join('　')),
      translationNotes: (p.gate || []).slice(0, 4).map((g: any, i: number) => ({
        rune: ['ᚨ', 'ᛁ', '', ''][i % 4], dovah: `ZIi ${i + 1}`, translation: typeof g === 'string' ? g : (g?.label || g?.id || ''),
      })),
    };
  }),
);

/** 一面龍語牆 = 一輪能力證明：徽章是代理指標，標準寫在 desc（自查用，不是自誇用） */
export const DRAGON_SHOUTS: DragonShout[] = (B.badges || []).map((b: any, i: number) => ({
  id: b.id, name: noEmoji(b.name || b.id), englishName: b.id,
  description: noEmoji(b.desc || ''),
  words: [{ dovah: String(b.id).toUpperCase(), runicGlyph: ['ᚱ', 'ᛗ', '', ''][i % 4], meaning: noEmoji(b.name || b.id),
    phonetic: b.metric ? `${b.metric}${b.threshold != null ? ` ≥ ${b.threshold}` : ''}` : '自查',
    element: (['force', 'fire', 'frost', 'time', 'spirit', 'storm'] as const)[i % 6] }],
  cooldown: b.threshold ?? 1,
  shoutLevelEffect: [b.desc || '达成條件見 PLAN.md', b.reward_xp ? `獎勵 ${b.reward_xp} XP` : ''].filter(Boolean),
  elementColor: '#d8c8a0',
}));

/** 行囊 = 訓練要用到的東西與本週總量（由課表加總，不另外維護一份數字） */
export const SKYRIM_INVENTORY: InventoryItem[] = (() => {
  const tally: Record<string, { sets: number; items: Set<string>; kind: string }> = {};
  for (const p of Object.values<any>(W.phases || {})) for (const day of Object.values<any>(p.days || {})) for (const e of day.exercises || day.items || []) {
    const k = e.kind || 'misc';
    tally[k] = tally[k] || { sets: 0, items: new Set(), kind: k };
    tally[k].sets += Number(e.sets) || 0; tally[k].items.add(e.name || e.id);
  }
  const CAT: Record<string, InventoryItem['category']> = { strength: 'weapons', core: 'weapons', hold: 'apparel', mobility: 'potions', play: 'misc', skill: 'scrolls', warmup: 'apparel', assess: 'scrolls' };
  return Object.entries(tally).map(([k, v]) => ({
    id: k, name: `${KIND[k] || k}`, category: CAT[k] || 'misc', type: `${v.items.size} 個動作`,
    weight: v.sets, value: v.sets * 10,
    description: `全計劃共 ${v.sets} 組；包含 ${[...v.items].slice(0, 4).join('、')}${v.items.size > 4 ? '…' : ''}`,
    enchantment: k === 'mobility' ? '退階版優先（受傷防控最高優先級）' : undefined,
    iconType: k === 'strength' ? 'Swords' : k === 'core' ? 'Zap' : k === 'mobility' ? 'Wand2' : 'Star',
  }));
})();

/** 天賦點：1 級 1 點、花掉不退（Skyrim 的 respec 我們刻意不做） */
export const PERK_POINT_RULE = '每升一級 1 點，點亮節點要花的掉，不能 respec';
export const SKILL_NODE_COUNT = (S.nodes || []).length;

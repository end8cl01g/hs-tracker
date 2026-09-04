/**
 * 天賦星圖 = 我們的 33 節點動作解鎖樹（data/skills.json，PLAN.md 的編譯結果）。
 * 這個檔是「介面包裝層」：欄位名稱沿用 Skyrim-html5 的元件契約（SkyrimSkills.tsx 讀 tree.perks /
 * perk.x / perk.y / perk.prerequisite），資料本體一律從 JSON 來，不在此處寫死任何訓練內容。
 * 座標用與舊 UI 相同的放射公式（分支=向度、支線內深度=半徑），再折算成 0-100 百分比。
 */
import skillsJson from '../../../data/skills.json';

export type GuardianStone = 'warrior' | 'mage' | 'thief';

export interface SkyrimPerk {
  id: string; name: string; nameEn: string; skillReq: number; ranks: string;
  prerequisite?: string; description: string; descriptionEn: string;
  x: number; y: number; isUnlockedDefault?: boolean;
}

export interface SkyrimSkillTree {
  id: string; name: string; nameEn: string; category: GuardianStone; categoryName: string;
  iconName: string; level: number; maxLevel: number; perksCount: number; description: string;
  constellationColor: string; accentGlow: string;
  perks: SkyrimPerk[]; connections: [string, string][];
}

type Node = {
  id: string; name: string; desc?: string; branch: string; tier: number;
  min_xp?: number; min_streak?: number; requires?: string[]; regression?: string;
};

const BRANCH: Record<string, { zh: string; en: string; icon: string; stone: GuardianStone; color: string; glow: string }> = {
  wrist:   { zh: '手腕鍛造', en: 'Wrist Forge',        icon: 'Shield',  stone: 'warrior', color: '#8fd3ff', glow: 'rgba(143,211,255,.35)' },
  base:    { zh: '推撑根基', en: 'Pressing Base',      icon: 'Swords',  stone: 'warrior', color: '#ffd166', glow: 'rgba(255,209,102,.32)' },
  crow:    { zh: '烏鴉式',   en: 'Crow Pose',          icon: 'Sparkles',stone: 'mage',    color: '#c3a6ff', glow: 'rgba(195,166,255,.32)' },
  lsit:    { zh: 'L-Sit',    en: 'L-Sit Core',         icon: 'Zap',     stone: 'mage',    color: '#9dffc4', glow: 'rgba(157,255,196,.30)' },
  wall:    { zh: '靠牆倒立', en: 'Wall Handstand',     icon: 'Hammer',  stone: 'warrior', color: '#ff9e7a', glow: 'rgba(255,158,122,.32)' },
  balance: { zh: '自由平衡', en: 'Free Balance',       icon: 'Star',    stone: 'thief',   color: '#fff3c4', glow: 'rgba(255,243,196,.34)' },
  press:   { zh: '倒立推举', en: 'Press to Handstand', icon: 'Flame',   stone: 'warrior', color: '#ff6b6b', glow: 'rgba(255,107,107,.34)' },
  fear:    { zh: '恐懼管理', en: 'Fear Control',       icon: 'EyeOff',  stone: 'thief',   color: '#a0aec0', glow: 'rgba(160,174,192,.28)' },
};
const STONE_NAME: Record<GuardianStone, string> = { warrior: '戰士', mage: '法師', thief: '竊賊' };
const R0 = 132, STEP = 74, W = 1000, H = 700;   // 與放射公式同步；改這裡等於改星圖骨架

function layout(nodes: Node[]) {
  const order: string[] = [];
  for (const n of nodes) if (!order.includes(n.branch)) order.push(n.branch);
  const pos: Record<string, { x: number; y: number; depth: number }> = {};
  order.forEach((b, bi) => {
    const list = nodes.filter((n) => n.branch === b).sort((x, y) => x.tier - y.tier || (x.id < y.id ? -1 : 1));
    const byDepth = new Map<number, Node[]>();
    list.forEach((n, i) => { if (!byDepth.has(i)) byDepth.set(i, []); byDepth.get(i)!.push(n); });
    const base = -90 + (bi * 360) / Math.max(1, order.length);
    byDepth.forEach((sibs, d) => {
      const r = R0 + d * STEP;
      const fan = sibs.length > 1 ? Math.max(9, (62 * 1.5 * 180) / (Math.PI * r)) : 0;
      sibs.forEach((n, si) => {
        const a = ((base + (si - (sibs.length - 1) / 2) * fan) * Math.PI) / 180;
        pos[n.id] = { x: 500 + r * Math.cos(a), y: 350 + r * Math.sin(a) * 0.88, depth: d };
      });
    });
  });
  return { pos, order };
}

export function buildSkillTrees(unlocked: Record<string, boolean> = {}): SkyrimSkillTree[] {
  const nodes = ((skillsJson as any).nodes || []) as Node[];
  const { pos, order } = layout(nodes);
  return order.map((branch) => {
    const meta = BRANCH[branch] || { zh: branch, en: branch, icon: 'Star', stone: 'thief' as GuardianStone, color: '#e8e8ff', glow: 'rgba(232,232,255,.3)' };
    const list = nodes.filter((n) => n.branch === branch).sort((a, b) => a.tier - b.tier);
    const inTree = new Set(list.map((n) => n.id));
    const perks: SkyrimPerk[] = list.map((n) => {
      const p = pos[n.id] || { x: 500, y: 350, depth: 0 };
      const pre = (n.requires || []).find((r) => inTree.has(r));
      const cross = (n.requires || []).filter((r) => !inTree.has(r));
      return {
        id: n.id, name: n.name, nameEn: n.id, skillReq: n.min_xp || 0, ranks: '1/1',
        prerequisite: pre, description: [n.desc, n.regression ? `退階：${n.regression}` : '', cross.length ? `需先点亮其他分支：${cross.join('、')}` : '']
          .filter(Boolean).join('｜'),
        descriptionEn: `${STONE_NAME[meta.stone]} · 第 ${p.depth + 1} 環`,
        x: +((p.x / W) * 100).toFixed(2), y: +((p.y / H) * 100).toFixed(2),
        isUnlockedDefault: !!unlocked[n.id],
      };
    });
    const connections = list.flatMap((n) => (n.requires || []).filter((r) => inTree.has(r)).map((r) => [r, n.id] as [string, string]));
    const depth = Math.max(0, ...perks.map((_, i) => pos[list[i].id]?.depth ?? 0));
    return {
      id: branch, name: meta.zh, nameEn: meta.en, category: meta.stone, categoryName: STONE_NAME[meta.stone],
      iconName: meta.icon, level: depth + 1, maxLevel: 8, perksCount: list.length,
      description: `${meta.zh}：${list.length} 個動作，依 PLAN.md 的解鎖順序由內而外。`,
      constellationColor: meta.color, accentGlow: meta.glow, perks, connections,
    };
  });
}

export const SKYRIM_SKILL_TREES: SkyrimSkillTree[] = buildSkillTrees();

/**
 * src/domain/data.ts — 載入 Press-to-Handstand 三份領域資料（原封取自舊 repo 的 data/），
 * 並把 skills.json 的 8 個分支（手腕／地基／烏鴉／L-sit／牆面倒立／自由倒立／壓上／心理安全）
 * 組裝成 Test3 Skyrim UI 的 SkillDefinition[]（星座樹座標在這裡決定）。
 */
import workoutJson from '../data/handstand/workout.json';
import skillsJson from '../data/handstand/skills.json';
import badgesJson from '../data/handstand/badges.json';
import type { SkillDefinition, PerkNode, SkillSchool } from '../types';
import type { WorkoutPlan, SkillsFile, BadgesFile, SkillNode } from './data-types';

export const workoutData = workoutJson as unknown as WorkoutPlan;
export const skillsFile = skillsJson as unknown as SkillsFile;
export const badgeDefs = (badgesJson as unknown as BadgesFile).badges;

export const skillNodes: SkillNode[] = skillsFile.nodes || [];

/** 依 branch 分組（維持 skills.json 的出現順序） */
const branchOrder: string[] = [];
const branchMap: Record<string, { label: string; nodes: SkillNode[] }> = {};
for (const n of skillNodes) {
  if (!branchMap[n.branch]) {
    branchMap[n.branch] = { label: n.branch_label, nodes: [] };
    branchOrder.push(n.branch);
  }
  branchMap[n.branch].nodes.push(n);
}

const BRANCH_EN: Record<string, string> = {
  wrist: 'Wrist Conditioning',
  base: 'Foundation',
  crow: 'Crow Pose',
  lsit: 'L-Sit & Compression',
  wall: 'Wall Handstand',
  balance: 'Freestanding Balance',
  press: 'Press to Handstand',
  fear: 'Mind & Safety',
};

const BRANCH_DESC: Record<string, string> = {
  wrist: '手腕熱身、撐推與耐受力——所有支撐動作的地基。',
  base: '推撐力量、核心與直體排列，倒立體系的結構工程。',
  crow: '烏鴉式家族：第一個「重心在手上方」的經驗。',
  lsit: 'L-sit 與壓縮力：壓上（Press）的引擎。',
  wall: '面牆／背牆倒立：建立倒立姿態與耐力。',
  balance: '自由倒立：重心、手腕平衡與長時間控倒。',
  press: '壓上（Press to Handstand）：本計畫的終極目標。',
  fear: '心理建設與安全跌出：怕，就不會自由。',
};

const SCHOOLS: SkillSchool[] = ['combat', 'magic', 'stealth'];
const PALETTES: Array<{ color: string; secondaryColor: string }> = [
  { color: '#c4a000', secondaryColor: '#72ffff' },
  { color: '#7c5cff', secondaryColor: '#c4b5fd' },
  { color: '#38bdf8', secondaryColor: '#67e8f9' },
  { color: '#f59e0b', secondaryColor: '#fde68a' },
  { color: '#10b981', secondaryColor: '#6ee7b7' },
  { color: '#ef4444', secondaryColor: '#fca5a5' },
  { color: '#d4af37', secondaryColor: '#fff7cc' },
  { color: '#8b5cf6', secondaryColor: '#ddd6fe' },
];

/** 穩定的偽隨機（由 id 決定，同樣資料每次渲染相同星座） */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function buildSkill(branch: string, index: number): SkillDefinition {
  const info = branchMap[branch];
  const nodes = [...info.nodes].sort((a, b) => a.tier - b.tier);
  const maxTier = Math.max(...nodes.map((n) => n.tier), 1);
  const school = SCHOOLS[index % SCHOOLS.length];
  const palette = PALETTES[index % PALETTES.length];

  const perks: PerkNode[] = nodes.map((n, j) => {
    // y：依 tier 由上往下鋪；x：鏈狀左右交錯＋由 id 決定的穩定抖動
    const y = maxTier > 1 ? 88 - ((n.tier - 1) / (maxTier - 1)) * 76 : 60;
    const sway = (j % 2 === 0 ? 1 : -1) * (10 + (j * 5) % 18);
    const x = Math.min(90, Math.max(10, 50 + sway + (hash01(n.id) - 0.5) * 10));
    return {
      id: n.id,
      name: n.name,
      nameEn: `${BRANCH_EN[branch] || branch} T${n.tier}`,
      skillId: branch,
      requiredSkillLevel: 15,
      description: n.desc,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      prerequisites: n.requires || [],
      min_xp: n.min_xp,
      min_streak: n.min_streak,
    };
  });

  return {
    id: branch,
    name: info.label,
    nameEn: BRANCH_EN[branch] || branch,
    school,
    description: BRANCH_DESC[branch] || info.label,
    iconName: 'Star',
    color: palette.color,
    secondaryColor: palette.secondaryColor,
    perks,
  };
}

export const HS_SKILLS: SkillDefinition[] = branchOrder.map((b, i) => buildSkill(b, i));

export function nodeById(id: string): SkillNode | undefined {
  return skillNodes.find((n) => n.id === id);
}

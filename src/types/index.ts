export type SkillSchool = 'combat' | 'magic' | 'stealth';

export interface PerkNode {
  id: string;
  name: string;
  nameEn: string;
  skillId: string;
  requiredSkillLevel: number;
  description: string;
  x: number; // Constellation coordinate percentage (0-100)
  y: number; // Constellation coordinate percentage (0-100)
  prerequisites: string[]; // Parent perk IDs
  rank?: number;
  maxRank?: number;
  // Press-to-Handstand domain gates (merged from hs-tracker skills.json)
  min_xp?: number;
  min_streak?: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  nameEn: string;
  school: SkillSchool;
  description: string;
  iconName: string;
  color: string;
  secondaryColor: string;
  perks: PerkNode[];
}

export type QuestCategory = 'main' | 'faction' | 'side' | 'misc' | 'custom';

export interface QuestObjective {
  id: string;
  text: string;
  completed: boolean;
  optional?: boolean;
}

export interface Quest {
  id: string;
  title: string;
  titleEn: string;
  category: QuestCategory;
  description: string;
  location: string;
  objectives: QuestObjective[];
  completed: boolean;
  active: boolean; // Currently tracked on compass
  rewardXp?: number;
  rewardGold?: number;
  rewardDragonSouls?: number;
  custom?: boolean;
}

export interface CharacterStats {
  name: string;
  title: string;
  race: string;
  level: number;
  currentXp: number;
  requiredXp: number;
  perkPoints: number;
  dragonSouls: number;
  gold: number;
  health: number;
  maxHealth: number;
  magicka: number;
  maxMagicka: number;
  stamina: number;
  maxStamina: number;
  skills: Record<string, number>; // skillId -> level (15-100)
  legendarySkills: Record<string, number>; // skillId -> count of legendary resets
  unlockedPerks: string[]; // List of perk IDs
  hs?: HSEmbedded; // Press-to-Handstand domain state (single source of truth)
}

/**
 * Press-to-Handstand domain state，嵌入在角色檔內一起存檔。
 * history[date] = 該日已完成 objective id 清單（id 格式 `hs|<date>|<dayKey>|<idx>`）。
 */
export interface HSEmbedded {
  v: number;
  startedAt: string; // 'YYYY-MM-DD'，用於階段推導
  history: Record<string, string[]>;
  gateDone: string[]; // 階段關卡已完成 objective id
  unlockedSkills: string[]; // 技能樹節點 id
  badges: string[]; // 已獲得徽章 id
  customQuests: Quest[];
  activeIds: string[]; // 羅盤追蹤中的 quest id
  profile: {
    name?: string;
    race?: string;
    health?: number;
    maxHealth?: number;
    magicka?: number;
    maxMagicka?: number;
    stamina?: number;
    maxStamina?: number;
  };
  derived?: HSDerived;
}

export interface HSDerived {
  totalXP: number;
  streak: number;
  longestStreak: number;
  totalSessions: number;
  currentPhase: number;
  weekNumber: number;
}

export interface SaveSlot {
  id: string;
  name: string;
  timestamp: number;
  character: CharacterStats;
  quests: Quest[];
  checksum: number;
  isAutoSave?: boolean;
  isQuickSave?: boolean;
}

export interface RustWasmStats {
  isWasmActive: boolean;
  engineVersion: string;
  lastCalcTimeUs: number;
  memoryUsageBytes: number;
  checksum: number;
  perkValidationStatus: 'valid' | 'invalid' | 'idle';
}

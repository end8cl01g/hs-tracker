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
  xp?: number; // 課表動作的 XP（打卡快照用）
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
  startedAt: string; // 'YYYY-MM-DD'，用於階段推導（設定卷軸可自訂）
  history: Record<string, string[]>;
  /**
   * logXP[date] = 該日打卡當下快照的 XP 總額。
   * 有了自訂開始日期後，同一個歷史日期可能因錨點改變而對映到不同 phase／菜單；
   * XP 以打卡當下為準（logXP 優先），舊存檔缺 logXP 時退回「由目前課表重推導」。
   */
  logXP?: Record<string, number>;
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

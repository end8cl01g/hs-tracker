/**
 * src/domain/data-types.ts — 舊 hs-tracker 三份 JSON（workout / skills / badges）的型別描述。
 * 資料本體原封不動取自舊專案 data/（version 3）。
 */
import type { Exercise } from './rules';

export interface PhaseDayMeta {
  label: string;
  place?: string;
  minutes?: string;
}

export interface PhaseData {
  title: string;
  weeks: number;
  weeks_range: [number, number];
  focus: string;
  day_meta: Record<string, PhaseDayMeta>;
  days: Record<string, Exercise[]>;
  gate?: string[];
  gate_note?: string;
  start_anchor?: string;
}

export interface WorkoutPlan {
  version: number;
  updated_at?: string;
  plan_source?: string;
  kind_labels?: Record<string, string>;
  rest_days: number[];
  days_in_week: string[];
  goals?: {
    must: string[];
    stretch: string[];
    bonus: string[];
    note?: string;
  };
  phases: Record<string, PhaseData>;
}

export interface SkillNode {
  id: string;
  branch: string;
  branch_label: string;
  tier: number;
  name: string;
  requires: string[];
  min_xp: number;
  min_streak: number;
  desc: string;
}

export interface SkillsFile {
  version: number;
  updated_at?: string;
  nodes: SkillNode[];
}

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  metric: string;
  op?: string;
  value: number;
  desc?: string;
}

export interface BadgesFile {
  version: number;
  updated_at?: string;
  badges: BadgeDef[];
}

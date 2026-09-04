/**
 * src/data/skyrimData.ts — 相容層。
 * 原本放 Skyrim Quest Tracker 的初始角色／任務／技能；
 * 合併後領域資料來自 Press-to-Handstand（data/handstand/*.json），
 * 這裡只是把新的初始值用舊名稱 re-export，讓元件 import 不用大改。
 */
import type { CharacterStats, Quest, SkillDefinition } from '../types';
import { HS_SKILLS } from '../domain/data';
import { deriveSnapshot } from '../domain/adapters';
import { newHSState } from '../domain/state';

export const INITIAL_SKILLS: SkillDefinition[] = HS_SKILLS;

const initialSnap = deriveSnapshot(newHSState());

export const INITIAL_CHARACTER: CharacterStats = initialSnap.character;

/** 初始任務清單（由領域狀態推導：本週課表 + 階段關卡） */
export const INITIAL_QUESTS: Quest[] = initialSnap.quests;

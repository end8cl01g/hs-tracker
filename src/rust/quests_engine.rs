//! Skyrim Quest State Machine and Progression Engine

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum QuestCategory {
    Main,
    Faction,
    Side,
    Misc,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectiveItem {
    pub id: String,
    pub text: String,
    pub completed: bool,
    pub optional: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestRecord {
    pub id: String,
    pub title: String,
    pub category: QuestCategory,
    pub objectives: Vec<ObjectiveItem>,
    pub completed: bool,
    pub active: bool,
    pub reward_xp: u32,
    pub reward_gold: u32,
    pub reward_dragon_souls: u32,
}

pub struct QuestProgressionResult {
    pub all_required_completed: bool,
    pub total_objectives: usize,
    pub completed_objectives: usize,
    pub completion_percentage: f32,
}

/// Evaluates completion status and rewards for a quest
pub fn evaluate_quest_progression(quest: &QuestRecord) -> QuestProgressionResult {
    let mut total_required = 0;
    let mut completed_required = 0;

    for obj in &quest.objectives {
        if !obj.optional {
            total_required += 1;
            if obj.completed {
                completed_required += 1;
            }
        }
    }

    let percentage = if total_required > 0 {
        (completed_required as f32) / (total_required as f32) * 100.0
    } else {
        100.0
    };

    QuestProgressionResult {
        all_required_completed: total_required > 0 && completed_required == total_required,
        total_objectives: total_required,
        completed_objectives: completed_required,
        completion_percentage: percentage,
    }
}

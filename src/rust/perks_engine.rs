//! Skyrim Constellation Perk Graph Validation and Tree Traversal Engine

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerkRequirement {
    pub perk_id: String,
    pub skill_id: String,
    pub required_skill_level: u32,
    pub prerequisites: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub can_unlock: bool,
    pub reason: String,
    pub missing_skill_level: i32,
    pub missing_prerequisites: Vec<String>,
}

/// Evaluates if a Dragonborn character can unlock a specific perk based on skill levels,
/// prerequisite constellation star connections, and available perk points.
pub fn validate_perk_unlock(
    req: &PerkRequirement,
    current_skill_level: u32,
    unlocked_perk_ids: &[String],
    available_perk_points: u32,
) -> ValidationResult {
    if available_perk_points == 0 {
        return ValidationResult {
            can_unlock: false,
            reason: "Insufficient perk points (技能點數不足)".to_string(),
            missing_skill_level: 0,
            missing_prerequisites: vec![],
        };
    }

    let mut missing_prereqs = Vec::new();
    for prereq in &req.prerequisites {
        if !unlocked_perk_ids.contains(prereq) {
            missing_prereqs.push(prereq.clone());
        }
    }

    let level_diff = (req.required_skill_level as i32) - (current_skill_level as i32);

    if level_diff > 0 {
        return ValidationResult {
            can_unlock: false,
            reason: format!(
                "Skill level too low. Requires {} (當前技能等級不足，需要 {})",
                req.required_skill_level, req.required_skill_level
            ),
            missing_skill_level: level_diff,
            missing_prerequisites: missing_prereqs,
        };
    }

    if !missing_prereqs.is_empty() {
        return ValidationResult {
            can_unlock: false,
            reason: "Constellation link broken. Missing prerequisite perks (缺少前置星位天賦)".to_string(),
            missing_skill_level: 0,
            missing_prerequisites: missing_prereqs,
        };
    }

    ValidationResult {
        can_unlock: true,
        reason: "Perk requirements satisfied. Ready to illuminate constellation star! (條件滿足，可點亮星位)".to_string(),
        missing_skill_level: 0,
        missing_prerequisites: vec![],
    }
}

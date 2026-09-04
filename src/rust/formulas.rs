//! Exact Skyrim mathematical formulas and validation utilities

/// Calculates the XP required to reach the next character level in Skyrim:
/// Skyrim Formula: XP_req(level) = 12.5 * (level + 1)^2 + 62.5 * (level + 1) - 75
pub fn xp_required_for_level(level: u32) -> u32 {
    let next_level = (level + 1) as f32;
    let xp = 12.5 * next_level * next_level + 62.5 * next_level - 75.0;
    xp.round() as u32
}

/// Calculate total skill levels needed to increase overall character level.
/// In Skyrim, leveling a skill gives skill_level points towards character level XP.
pub fn calculate_level_from_skills(total_skill_levels: u32) -> u32 {
    let mut current_level = 1u32;
    let mut accumulated_xp = total_skill_levels;
    
    // Starting baseline across 18 skills with minimum 15 = 270 base skill level
    if accumulated_xp <= 270 {
        return 1;
    }
    accumulated_xp -= 270;

    loop {
        let req = xp_required_for_level(current_level);
        if accumulated_xp >= req {
            accumulated_xp -= req;
            current_level += 1;
        } else {
            break;
        }
    }
    current_level
}

/// Computes CRC32 checksum for offline save file verification and anti-tampering
pub fn compute_checksum(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1) != 0;
            crc >>= 1;
            if mask {
                crc ^= 0xEDB8_8320;
            }
        }
    }
    !crc
}

/// Calculate legendary skill reset perk point refund
pub fn calculate_legendary_refund(unlocked_perk_count: u32) -> u32 {
    // When making a skill Legendary, skill resets to 15 and all invested perks are returned
    unlocked_perk_count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xp_formula() {
        assert_eq!(xp_required_for_level(1), 100);
    }

    #[test]
    fn test_checksum() {
        let data = b"Dragonborn Skyrim Save";
        let c = compute_checksum(data);
        assert_ne!(c, 0);
    }
}

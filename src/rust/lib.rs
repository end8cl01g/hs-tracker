//! Skyrim Core Logic Library for WebAssembly & Native compilation

pub mod formulas;
pub mod perks_engine;
pub mod quests_engine;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SkyrimWasmEngine {
    version: String,
}

#[wasm_bindgen]
impl SkyrimWasmEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> SkyrimWasmEngine {
        SkyrimWasmEngine {
            version: "0.1.0-rust-wasm".to_string(),
        }
    }

    pub fn get_version(&self) -> String {
        self.version.clone()
    }

    /// Calculate XP required to reach next level based on Skyrim formulas
    pub fn xp_for_level(&self, level: u32) -> u32 {
        formulas::xp_required_for_level(level)
    }

    /// Calculate overall character level from aggregate skill levels
    pub fn character_level_from_skills(&self, total_skills: u32) -> u32 {
        formulas::calculate_level_from_skills(total_skills)
    }

    /// Fast perk unlock check: returns 1 if satisfied, 0 if requirements not met
    pub fn can_unlock_perk_fast(
        &self,
        current_skill: u32,
        required_skill: u32,
        prereqs_met: bool,
        perk_points: u32,
    ) -> bool {
        perk_points > 0 && current_skill >= required_skill && prereqs_met
    }

    /// Compute CRC32 checksum of save data buffer
    pub fn calculate_checksum(&self, buffer: &[u8]) -> u32 {
        formulas::compute_checksum(buffer)
    }

    /// Calculate legendary skill perk points refund
    pub fn legendary_refund(&self, perk_count: u32) -> u32 {
        formulas::calculate_legendary_refund(perk_count)
    }
}

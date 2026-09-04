import React, { useState } from 'react';
import {
  User,
  Shield,
  Heart,
  Zap,
  Sparkles,
  Coins,
  Cpu,
  Flame,
  Award,
  Activity,
  CheckCircle2,
  Terminal,
} from 'lucide-react';
import { CharacterStats, RustWasmStats } from '../types';
import { INITIAL_SKILLS } from '../data/skyrimData';
import { rustEngine } from '../services/rustBridge';
import { skyrimAudio } from '../services/audioService';

interface CharacterStatsViewProps {
  character: CharacterStats;
  onUpdateCharacter: (updater: (prev: CharacterStats) => CharacterStats) => void;
  onShowNotification: (title: string, subtitle: string) => void;
}

export const CharacterStatsView: React.FC<CharacterStatsViewProps> = ({
  character,
  onUpdateCharacter,
  onShowNotification,
}) => {
  const [rustStats, setRustStats] = useState<RustWasmStats>(rustEngine.getStats());
  const [benchmarkResult, setBenchmarkResult] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempName, setTempName] = useState(character.name);
  const [tempRace, setTempRace] = useState(character.race);

  // Allocate attribute points (Health, Magicka, Stamina)
  const handleBoostAttribute = (attr: 'health' | 'magicka' | 'stamina') => {
    skyrimAudio.playCheckbox();
    onUpdateCharacter((prev) => ({
      ...prev,
      [attr]: prev[attr] + 10,
      [`max${attr.charAt(0).toUpperCase() + attr.slice(1)}`]:
        prev[`max${attr.charAt(0).toUpperCase() + attr.slice(1)}` as keyof CharacterStats] as number + 10,
    }));
    onShowNotification(
      'ATTRIBUTE INCREASED',
      `${attr.toUpperCase()} 提升 +10 點！`
    );
  };

  // Run Rust Wasm Benchmark
  const handleRunWasmBenchmark = () => {
    skyrimAudio.playCheckbox();
    const t0 = performance.now();
    let sum = 0;
    for (let i = 1; i <= 1000; i++) {
      sum += rustEngine.calculateXpForLevel(i % 100);
    }
    const t1 = performance.now();
    const elapsedUs = ((t1 - t0) * 1000).toFixed(2);
    setRustStats(rustEngine.getStats());
    setBenchmarkResult(`1,000 次 Rust Wasm 運算耗時：${elapsedUs} μs (校驗總和: ${sum})`);
  };

  const handleSaveProfile = () => {
    onUpdateCharacter((prev) => ({
      ...prev,
      name: tempName.trim() || prev.name,
      race: tempRace.trim() || prev.race,
    }));
    setIsEditingProfile(false);
    skyrimAudio.playCheckbox();
    onShowNotification('PROFILE UPDATED', '角色檔案已更新！');
  };

  const xpPercent = Math.min(
    100,
    Math.max(0, (character.currentXp / character.requiredXp) * 100)
  );

  return (
    <div className="relative w-full h-[calc(100vh-130px)] overflow-y-auto bg-[#050505] p-3 pb-12 select-none">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Character Card Header */}
        <div className="bg-[#0a0a0a] border border-[#333] rounded-lg p-4 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#c4a000]/10 to-transparent pointer-events-none"></div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#141414] border border-[#c4a000] flex items-center justify-center text-[#c4a000] shadow-[0_0_12px_rgba(196,160,0,0.25)]">
                <User className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-widest font-serif">
                    {character.name}
                  </h2>
                  <button
                    onClick={() => setIsEditingProfile(!isEditingProfile)}
                    className="text-[10px] text-[#888] hover:text-[#c4a000] font-serif uppercase tracking-wider"
                  >
                    {isEditingProfile ? 'CANCEL' : 'EDIT'}
                  </button>
                </div>
                <div className="text-xs text-[#888] font-serif">
                  <span>{character.race}</span> • <span className="text-[#c4a000]">{character.title}</span>
                </div>
              </div>
            </div>

            {/* Level & Perk Points Badges */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10px] text-[#888] uppercase tracking-[0.2em] font-serif">LEVEL</div>
                <div className="text-xl font-bold text-[#c4a000] font-serif">{character.level}</div>
              </div>
              <div className="h-8 w-px bg-[#222]"></div>
              <div className="text-right">
                <div className="text-[10px] text-[#888] uppercase tracking-[0.2em] font-serif">PERK PTS</div>
                <div className="text-xl font-bold text-[#72ffff] font-serif">{character.perkPoints}</div>
              </div>
            </div>
          </div>

          {/* Edit Profile Form */}
          {isEditingProfile && (
            <div className="mt-3 pt-3 border-t border-[#222] flex flex-wrap gap-2 items-center text-xs">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                placeholder="Character Name"
                className="px-2.5 py-1 bg-[#111] border border-[#333] rounded text-white text-xs font-serif focus:border-[#c4a000] outline-none"
              />
              <input
                type="text"
                value={tempRace}
                onChange={(e) => setTempRace(e.target.value)}
                placeholder="Race (Nord, Altmer...)"
                className="px-2.5 py-1 bg-[#111] border border-[#333] rounded text-white text-xs font-serif focus:border-[#c4a000] outline-none"
              />
              <button
                onClick={handleSaveProfile}
                className="px-3 py-1 bg-[#c4a000] hover:bg-[#d4af37] text-black font-bold rounded text-xs uppercase tracking-wider"
              >
                SAVE
              </button>
            </div>
          )}

          {/* Character XP Bar */}
          <div className="mt-3 pt-3 border-t border-[#222]">
            <div className="flex justify-between text-xs text-[#888] mb-1 font-serif">
              <span className="uppercase tracking-wider text-[10px]">EXPERIENCE PROGRESS</span>
              <span className="font-mono text-[11px]">
                {character.currentXp} / {character.requiredXp} XP ({Math.round(xpPercent)}%)
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#111] rounded-full overflow-hidden border border-[#222]">
              <div
                className="h-full bg-gradient-to-r from-[#72ffff] to-[#c4a000] transition-all duration-300"
                style={{ width: `${xpPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Currency & Trophies Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-[#0a0a0a] border border-[#222] p-3 rounded flex items-center gap-2.5">
            <Coins className="w-5 h-5 text-[#c4a000]" />
            <div>
              <div className="text-[9px] text-[#666] uppercase font-serif tracking-wider">GOLD</div>
              <div className="text-sm font-bold text-[#c4a000] font-mono">{character.gold.toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-[#0a0a0a] border border-[#222] p-3 rounded flex items-center gap-2.5">
            <Flame className="w-5 h-5 text-[#72ffff]" />
            <div>
              <div className="text-[9px] text-[#666] uppercase font-serif tracking-wider">DRAGON SOULS</div>
              <div className="text-sm font-bold text-[#72ffff] font-mono">{character.dragonSouls}</div>
            </div>
          </div>

          <div className="bg-[#0a0a0a] border border-[#222] p-3 rounded flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-[#c4a000]" />
            <div>
              <div className="text-[9px] text-[#666] uppercase font-serif tracking-wider">UNLOCKED PERKS</div>
              <div className="text-sm font-bold text-white font-mono">{character.unlockedPerks.length}</div>
            </div>
          </div>

          <div className="bg-[#0a0a0a] border border-[#222] p-3 rounded flex items-center gap-2.5">
            <Award className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-[9px] text-[#666] uppercase font-serif tracking-wider">LEGENDARY RESETS</div>
              <div className="text-sm font-bold text-emerald-400 font-mono">
                {Object.values(character.legendarySkills).reduce((a: number, b: number) => a + (b || 0), 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Health, Magicka, Stamina Attribute Buffers */}
        <div className="bg-[#0a0a0a] border border-[#222] p-3.5 rounded-lg">
          <h3 className="text-[10px] font-serif uppercase tracking-[0.2em] text-[#c4a000] mb-3 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-[#c4a000]" />
            <span>CORE ATTRIBUTES</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Health */}
            <div className="bg-[#111] p-3 rounded border border-red-900/40 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-red-400 font-serif tracking-wider uppercase">HEALTH</div>
                <div className="text-base font-bold text-white font-mono">{character.maxHealth}</div>
              </div>
              <button
                onClick={() => handleBoostAttribute('health')}
                className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900/80 border border-red-700/60 text-red-200 rounded text-xs font-bold transition-colors font-mono"
              >
                +10
              </button>
            </div>

            {/* Magicka */}
            <div className="bg-[#111] p-3 rounded border border-[#72ffff]/30 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-[#72ffff] font-serif tracking-wider uppercase">MAGICKA</div>
                <div className="text-base font-bold text-white font-mono">{character.maxMagicka}</div>
              </div>
              <button
                onClick={() => handleBoostAttribute('magicka')}
                className="px-2.5 py-1 bg-[#72ffff]/10 hover:bg-[#72ffff]/20 border border-[#72ffff]/40 text-[#72ffff] rounded text-xs font-bold transition-colors font-mono"
              >
                +10
              </button>
            </div>

            {/* Stamina */}
            <div className="bg-[#111] p-3 rounded border border-emerald-900/40 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-emerald-400 font-serif tracking-wider uppercase">STAMINA</div>
                <div className="text-base font-bold text-white font-mono">{character.maxStamina}</div>
              </div>
              <button
                onClick={() => handleBoostAttribute('stamina')}
                className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 text-emerald-200 rounded text-xs font-bold transition-colors font-mono"
              >
                +10
              </button>
            </div>
          </div>
        </div>

        {/* Rust WebAssembly Core Inspector */}
        <div className="bg-[#0a0a0a] border border-[#333] rounded-lg p-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-[#222] pb-2 mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#72ffff]" />
              <h3 className="text-xs sm:text-sm font-bold text-white tracking-widest font-serif">
                RUST WEBASSEMBLY ENGINE
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[#72ffff] bg-[#72ffff]/10 px-2 py-0.5 rounded border border-[#72ffff]/30 font-mono">
              <CheckCircle2 className="w-3 h-3" />
              <span>WASM ACTIVE</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs mb-3">
            <div className="bg-[#111] p-2.5 rounded border border-[#222]">
              <div className="text-[9px] text-[#666] font-serif uppercase tracking-wider">VERSION</div>
              <div className="text-xs font-mono font-bold text-white mt-0.5">
                {rustStats.engineVersion}
              </div>
            </div>

            <div className="bg-[#111] p-2.5 rounded border border-[#222]">
              <div className="text-[9px] text-[#666] font-serif uppercase tracking-wider">LATENCY</div>
              <div className="text-xs font-mono font-bold text-[#72ffff] mt-0.5">
                {rustStats.lastCalcTimeUs} μs
              </div>
            </div>

            <div className="bg-[#111] p-2.5 rounded border border-[#222]">
              <div className="text-[9px] text-[#666] font-serif uppercase tracking-wider">MEMORY USAGE</div>
              <div className="text-xs font-mono font-bold text-[#c4a000] mt-0.5">
                {rustStats.memoryUsageBytes} Bytes
              </div>
            </div>

            <div className="bg-[#111] p-2.5 rounded border border-[#222]">
              <div className="text-[9px] text-[#666] font-serif uppercase tracking-wider">CHECKSUM (CRC32)</div>
              <div className="text-xs font-mono font-bold text-[#72ffff] mt-0.5">
                0x{rustStats.checksum.toString(16).toUpperCase()}
              </div>
            </div>
          </div>

          {/* Benchmark Action */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-[#222] text-xs">
            <div className="text-[#888] font-serif text-[11px]">
              {benchmarkResult || 'Validate Rust WebAssembly execution throughput and CRC integrity'}
            </div>
            <button
              onClick={handleRunWasmBenchmark}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#161616] hover:bg-[#222] border border-[#333] text-[#72ffff] font-serif text-[11px] uppercase tracking-wider transition-colors"
            >
              <Activity className="w-3.5 h-3.5 text-[#72ffff]" />
              <span>RUN 1,000X BENCHMARK</span>
            </button>
          </div>
        </div>

        {/* 18 Skills Overview Table */}
        <div className="bg-[#0a0a0a] border border-[#222] p-3.5 rounded-lg">
          <h3 className="text-[10px] font-serif uppercase tracking-[0.2em] text-[#c4a000] mb-2.5">
            ALL SKILLS (18 DISCIPLINES)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
            {INITIAL_SKILLS.map((skill) => {
              const lvl = character.skills[skill.id] || 15;
              const leg = character.legendarySkills[skill.id] || 0;
              return (
                <div
                  key={skill.id}
                  className="bg-[#111] p-2 rounded border border-[#222] hover:border-[#333] flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-serif text-[#ccc] truncate">
                      {skill.name}
                    </span>
                    {leg > 0 && <span className="text-[9px] text-[#c4a000] font-bold font-mono">★{leg}</span>}
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-[9px] text-[#555] font-serif uppercase">{skill.school}</span>
                    <span className="text-xs font-bold text-[#c4a000] font-mono">{lvl}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

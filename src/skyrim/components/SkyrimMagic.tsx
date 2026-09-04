import React, { useState } from 'react';
import { Sparkles, Flame, Droplets, Skull, Eye, Shield, Play } from 'lucide-react';
import { skyrimAudio } from '../utils/audio';

interface Spell {
  id: string;
  name: string;
  school: 'Destruction' | 'Restoration' | 'Conjuration' | 'Illusion' | 'Alteration';
  schoolZh: string;
  level: string;
  cost: number;
  description: string;
  effectColor: string;
}

const SPELLS: Spell[] = [
  {
    id: 'fireball',
    name: '熾烈爆裂火球術 (Fireball)',
    school: 'Destruction',
    schoolZh: '毀滅系',
    level: '老手級 (Adept)',
    cost: 133,
    description: '投擲出一枚爆發性火球，對爆炸半徑 15 英尺內的所有目標造成 40 點火焰傷害並將其點燃。',
    effectColor: '#f97316'
  },
  {
    id: 'fast_healing',
    name: '極速神聖自癒術 (Fast Healing)',
    school: 'Restoration',
    schoolZh: '恢復系',
    level: '學徒級 (Apprentice)',
    cost: 73,
    description: '引導聖靈神聖的光輝，瞬間使施法者恢復 50 點生命值。',
    effectColor: '#eab308'
  },
  {
    id: 'summon_dremora',
    name: '魔人領主召喚 (Conjure Dremora Lord)',
    school: 'Conjuration',
    schoolZh: '召喚系',
    level: '專家級 (Expert)',
    cost: 107,
    description: '撕裂湮滅深淵裂隙，召喚一名裝備魔族巨劍的嗜血魔人領主助戰，持續 60 秒。',
    effectColor: '#ef4444'
  },
  {
    id: 'invisibility',
    name: '影遁隱形術 (Invisibility)',
    school: 'Illusion',
    schoolZh: '幻術系',
    level: '專家級 (Expert)',
    cost: 334,
    description: '折射周遭所有光線與氣息，使施法者進入完全隱形狀態，持續 30 秒。',
    effectColor: '#a855f7'
  },
  {
    id: 'ebonyflesh',
    name: '黑檀岩鐵甲術 (Ebonyflesh)',
    school: 'Alteration',
    schoolZh: '變化系',
    level: '專家級 (Expert)',
    cost: 341,
    description: '將全身皮膚分子晶體化硬化為黑檀岩硬度，提升 100 點護甲評級，持續 60 秒。',
    effectColor: '#38bdf8'
  }
];

export const SkyrimMagic: React.FC = () => {
  const [selectedSpellId, setSelectedSpellId] = useState<string>('fireball');
  const [isCasting, setIsCasting] = useState<boolean>(false);

  const selectedSpell = SPELLS.find(s => s.id === selectedSpellId) || SPELLS[0];

  const handleCast = () => {
    setIsCasting(true);
    skyrimAudio.playArcaneChime();
    setTimeout(() => setIsCasting(false), 1200);
  };

  return (
    <section className="relative w-full py-8 px-3 sm:px-6 md:px-8 max-w-6xl mx-auto flex flex-col items-center">
      <div className="w-full flex flex-col items-center text-center mb-6">
        <div className="flex items-center gap-3 text-amber-500/80 mb-1">
          <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-amber-500/60" />
          <span className="font-cinzel text-xs tracking-widest uppercase">College of Winterhold Arcana</span>
          <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-amber-500/60" />
        </div>
        <h2 className="font-cinzel-dec text-2xl sm:text-3xl md:text-4xl text-amber-100 tracking-wider font-bold drop-shadow-[0_2px_12px_rgba(245,158,11,0.3)]">
          魔法奧術聖殿
        </h2>
        <p className="font-marcellus text-stone-400 text-xs sm:text-sm mt-1.5 max-w-2xl">
          冬堡法師學院五大學派秘典，蘊含以太魔能與動態奧術法陣。
        </p>
      </div>

      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Spells List */}
        <div className="lg:col-span-5 rounded-xl border border-stone-800 bg-stone-950/70 p-3 h-[460px] flex flex-col">
          <div className="px-3 py-2 border-b border-stone-800 text-[11px] font-cinzel text-stone-500 flex justify-between">
            <span>學派法術 (SPELL NAME)</span>
            <span>法力消耗</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 pt-2 pr-1">
            {SPELLS.map(spell => {
              const isSelected = selectedSpellId === spell.id;
              return (
                <div
                  key={spell.id}
                  id={`spell-item-${spell.id}`}
                  onClick={() => {
                    setSelectedSpellId(spell.id);
                    skyrimAudio.playMenuClick();
                  }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded transition-all cursor-pointer select-none ${
                    isSelected
                      ? 'bg-stone-900 text-amber-200 border-l-2 border-cyan-400 shadow-sm'
                      : 'text-stone-300 hover:bg-stone-900/50 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rotate-45"
                      style={{ backgroundColor: spell.effectColor }}
                    />
                    <div>
                      <div className="font-cinzel text-xs sm:text-sm font-semibold">{spell.name.split('(')[0]}</div>
                      <div className="text-[10px] font-marcellus text-stone-500">{spell.schoolZh} · {spell.level}</div>
                    </div>
                  </div>
                  <span className="font-cinzel text-xs text-cyan-300">{spell.cost} 魔力</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Spell Visualizer */}
        <div className="lg:col-span-7 rounded-xl border border-stone-800 bg-gradient-to-b from-[#131118] to-[#0a090d] p-6 h-[460px] flex flex-col justify-between shadow-2xl relative overflow-hidden">
          {/* Casting Halo effect */}
          {isCasting && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div 
                className="w-64 h-64 rounded-full border-2 animate-ping opacity-60"
                style={{ borderColor: selectedSpell.effectColor }}
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-xs font-cinzel text-stone-500">
              <span>{selectedSpell.school.toUpperCase()} SCHOOL</span>
              <span>{selectedSpell.level.toUpperCase()}</span>
            </div>
            <h3 className="font-cinzel text-xl sm:text-2xl text-amber-100 font-bold mt-1">
              {selectedSpell.name}
            </h3>
          </div>

          {/* Spell Sigil / Mandala Inscription */}
          <div className="flex-1 flex items-center justify-center relative my-4">
            <div className={`relative w-44 h-44 rounded-full border border-dashed flex items-center justify-center transition-transform duration-700 ${isCasting ? 'scale-115 rotate-180' : 'hover:scale-105'}`} style={{ borderColor: selectedSpell.effectColor }}>
              <div className="absolute inset-3 rounded-full border border-stone-700 opacity-60" />
              <div className="absolute inset-8 rounded-full border border-stone-600 opacity-40" />
              <div className="font-uncial text-5xl select-none" style={{ color: selectedSpell.effectColor }}>
                ᛗᚲᛋ
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-stone-800">
            <p className="font-serif-tc text-xs text-stone-300 leading-relaxed">
              {selectedSpell.description}
            </p>
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs font-cinzel text-cyan-300">
                法力消耗：<span className="font-bold text-sm">{selectedSpell.cost}</span> 點魔力
              </div>
              <button
                id="cast-spell-btn"
                onClick={handleCast}
                className="px-5 py-2 rounded font-cinzel text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                style={{
                  backgroundColor: `${selectedSpell.effectColor}22`,
                  borderColor: selectedSpell.effectColor,
                  borderWidth: 1,
                  color: '#ffffff'
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>施展法術 (Cast Spell)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

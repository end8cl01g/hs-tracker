/**
 * 倒立之殿 —— Skyrim-html5 前端 ＋ hs-tracker 引擎（52 週計劃／本機 DB／GAS 同步）的合併結果。
 * 舊前端（ui.ts + style.css + 手刻疊層 modal）已整個捨棄；資料一律來自 data/*.json（PLAN.md 的編譯結果）。
 */
import { useEffect, useState } from 'react';
import { SkyrimCompass } from './skyrim/components/SkyrimCompass';
import { SkyrimNavbar, SkyrimTab } from './skyrim/components/SkyrimNavbar';
import { ParchmentScroll } from './skyrim/components/ParchmentScroll';
import { DragonWordWall } from './skyrim/components/DragonWordWall';
import { SkyrimInventory } from './skyrim/components/SkyrimInventory';
import { SkyrimSkills } from './skyrim/components/SkyrimSkills';
import { SkyrimHUD } from './skyrim/components/SkyrimHUD';
import { skyrimAudio } from './skyrim/utils/audio';
import { loadStats, type Stats, EMPTY_STATS } from './skyrim/store';
import { SKYRIM_SKILL_TREES, buildSkillTrees } from './skyrim/data/skyrimPerksData';

const TABS: SkyrimTab[] = ['scrolls', 'wordwall', 'inventory', 'perks'];

export default function App() {
  const [activeTab, setActiveTab] = useState<SkyrimTab>('scrolls');
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [trees, setTrees] = useState(SKYRIM_SKILL_TREES);

  // 本機 DB 就緒後才把「已點亮的星」畫上去；載入失敗也要能看課表（降溫，不白屏）
  useEffect(() => {
    let alive = true;
    loadStats().then((s) => { if (!alive) return; setStats(s); if (s.ready) setTrees(buildSkillTrees(s.unlocked)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) { setActiveTab(TABS[i]); skyrimAudio.playMenuClick(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const loc = stats.ready
    ? `已點亮 ${stats.unlockedCount} 顆星 · 等級 ${stats.level} · 技能點 ${stats.points.available}`
    : `訓練計劃 v3 · 星圖尚未點亮`;

  return (
    <div
      className="relative min-h-screen text-stone-200 flex flex-col justify-between overflow-x-hidden"
      style={{ background: 'radial-gradient(circle at center, #1a1b1e 0%, #050505 100%)', fontFamily: '"Cinzel", "Noto Serif TC", "Songti TC", serif' }}
    >
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -inset-[30%] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/10 via-stone-900/20 to-transparent blur-3xl animate-mist" />
        <div className="absolute top-1/2 -left-1/4 w-[150%] h-96 bg-sky-950/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.85)]" />
      </div>

      <div className="relative z-20">
        <SkyrimCompass currentLocation="倒立之殿 · Press to Handstand" subLocation={loc} />
        <SkyrimNavbar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-start pb-36 pt-2">
        {activeTab === 'scrolls' && <div className="w-full animate-fade-in"><ParchmentScroll /></div>}
        {activeTab === 'wordwall' && <div className="w-full animate-fade-in"><DragonWordWall /></div>}
        {activeTab === 'inventory' && <div className="w-full animate-fade-in"><SkyrimInventory onReadScrollClick={() => setActiveTab('scrolls')} /></div>}
        {activeTab === 'perks' && (
          <div className="w-full animate-fade-in">
            <SkyrimSkills trees={trees} perkPoints={stats.ready ? stats.points.available : 3} initialUnlocked={stats.unlocked} />
          </div>
        )}
      </main>

      <SkyrimHUD stats={{
        magicka: Math.round((stats.progress || 0) * 100), maxMagicka: 100,
        health: stats.unlockedCount, maxHealth: Math.max(1, SKYRIM_SKILL_TREES.reduce((a, t) => a + t.perksCount, 0)),
        stamina: stats.streak, maxStamina: 7,
      }} />
    </div>
  );
}

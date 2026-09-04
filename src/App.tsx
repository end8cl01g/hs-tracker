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
import { SkyrimSettings } from './skyrim/components/SkyrimSettings';
import { SkyrimHUD } from './skyrim/components/SkyrimHUD';
import { skyrimAudio } from './skyrim/utils/audio';
import {
  loadStats, subscribeSync, installUiShim, onToast, onConfirm, type Stats, type SyncState,
  EMPTY_STATS, EMPTY_SYNC, SYNC_LABEL,
} from './skyrim/store';
import { SKYRIM_SKILL_TREES, buildSkillTrees } from './skyrim/data/skyrimPerksData';

const TABS: SkyrimTab[] = ['scrolls', 'wordwall', 'inventory', 'perks', 'settings'];

type Toast = { text: string; error?: boolean; id: number };
type Pending = { message: string; resolve: (v: boolean) => void } | null;

export default function App() {
  const [activeTab, setActiveTab] = useState<SkyrimTab>('scrolls');
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [trees, setTrees] = useState(SKYRIM_SKILL_TREES);
  const [sync, setSync] = useState<SyncState>(EMPTY_SYNC);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<Pending>(null);

  // 引擎沿用 global.UI（toast / confirm / refresh）——先裝 shim，才不會在匯出成功後才崩
  useEffect(() => {
    installUiShim();
    let n = 0;
    const off = onToast((t) => {
      const id = ++n;
      setToasts((cur) => [...cur.slice(-2), { ...t, id }]);
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 4200);
    });
    onConfirm((message) => new Promise<boolean>((resolve) => setPending(() => ({ message, resolve }))));
    const offSync = subscribeSync(setSync);
    return () => { off(); offSync(); onConfirm(null); };
  }, []);

  const refresh = () => loadStats().then((s) => { setStats(s); if (s.ready) setTrees(buildSkillTrees(s.unlocked)); });
  // 本機 DB 就緒後才把「已點亮的星」畫上去；載入失敗也要能看課表（降溫，不白屏）
  useEffect(() => {
    let alive = true;
    loadStats().then((s) => { if (!alive) return; setStats(s); if (s.ready) setTrees(buildSkillTrees(s.unlocked)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    (globalThis as any).App = { refresh };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const i = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (i >= 0) { setActiveTab(TABS[i]); skyrimAudio.playMenuClick(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const plan = stats.ready
    ? `已點亮 ${stats.unlockedCount} 顆星 · 等級 ${stats.level} · 技能點 ${stats.points.available}`
    : `訓練計劃 v3 · 星圖尚未點亮`;
  // 同步三態一定要看得見：未設定雲端 ≠ 已同步，部分同步 ≠ 成功
  const syncLine = `${SYNC_LABEL[sync.status]}${sync.pending ? ` · 待同步 ${sync.pending}` : ''}`;

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
        <SkyrimCompass currentLocation="倒立之殿 · Press to Handstand" subLocation={`${plan} · ${syncLine}`} />
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

      <SkyrimSettings open={activeTab === 'settings'} onClose={() => setActiveTab('scrolls')} onChanged={refresh} />

      {/* 提示列：取代舊前端的 toast 區（引擎各處都靠它報結果，沒有就等於靜默失敗） */}
      <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[60] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className={`px-4 py-2 border backdrop-blur-sm font-cinzel text-[11px] sm:text-xs tracking-wide shadow-lg ${
              t.error ? 'border-rose-800/70 bg-rose-950/70 text-rose-200' : 'border-amber-700/50 bg-stone-950/80 text-amber-100'}`}>
            {t.text}
          </div>
        ))}
      </div>

      {pending && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <button aria-label="取消" className="absolute inset-0 bg-black/80" onClick={() => { pending.resolve(false); setPending(null); }} />
          <div role="alertdialog" aria-modal="true" className="relative w-full max-w-md border border-amber-800/50 bg-[#141311] p-5">
            <div className="font-cinzel text-xs tracking-[0.25em] uppercase text-amber-300/90 mb-3">守衛的質問</div>
            <div className="text-[13px] leading-relaxed text-stone-300 whitespace-pre-line">{pending.message}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { pending.resolve(false); setPending(null); }}
                className="px-3.5 py-2 border border-stone-700/70 text-stone-300 font-cinzel text-xs tracking-wider hover:border-stone-500">不</button>
              <button onClick={() => { pending.resolve(true); setPending(null); }}
                className="px-3.5 py-2 border border-amber-600/70 bg-amber-900/25 text-amber-100 font-cinzel text-xs tracking-wider hover:border-amber-400">確定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

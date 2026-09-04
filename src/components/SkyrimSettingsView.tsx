import React, { useEffect, useRef, useState } from 'react';
import {
  X, Cloud, CloudOff, RefreshCw, Plug, Copy, Download, Upload, Trash2,
  ScrollText, Check, AlertTriangle, CalendarDays,
} from 'lucide-react';
import {
  SYNC_LABEL, subscribeSync, getSyncState, loadConfig, saveConfig, cleanUrl, urlProblem,
  syncNow, ping, pushCloudBackup, diagnostics, deviceId, type SyncState,
} from '../services/syncService';
import { planStartInfo, applyPlanStart } from '../domain/adapters';
import { todayISO } from '../domain/rules';
import { storageService } from '../services/storageService';
import type { HSEmbedded } from '../types';
import { skyrimAudio } from '../services/audioService';

/**
 * 設定卷軸 —— 舊版 hs-tracker 設定頁的移植（同步開關／GAS 連線／備份／診斷／重置），
 * 加上新功能：課表自訂開始日期。
 * 同步與存檔邏輯一律在 syncService / storageService，這裡只是它的窗（不養第二份真值）。
 */

const Label: React.FC<{ zh: string; en: string }> = ({ zh, en }) => (
  <div className="flex items-center gap-3 text-amber-500/80 mb-3">
    <span className="h-[1px] w-10 bg-gradient-to-r from-transparent to-amber-500/60" />
    <div className="text-center">
      <div className="font-cinzel text-xs tracking-[0.25em] uppercase">{zh}</div>
      <div className="font-cinzel text-[9px] tracking-[0.3em] uppercase text-stone-500">{en}</div>
    </div>
    <span className="h-[1px] w-10 bg-gradient-to-l from-transparent to-amber-500/60" />
  </div>
);

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }> =
  ({ icon, children, className = '', disabled, ...rest }) => (
    <button
      {...rest}
      disabled={disabled}
      className={`group flex items-center gap-2 px-3.5 py-2 border transition-all duration-300
        border-stone-700/70 bg-stone-900/60 hover:border-amber-500/70 hover:bg-amber-900/20 text-stone-300
        disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {icon && <span className="w-4 h-4 shrink-0 group-hover:text-amber-300">{icon}</span>}
      <span className="font-cinzel text-[11px] sm:text-xs tracking-wider">{children}</span>
    </button>
  );

const field = 'w-full bg-black/50 border border-stone-700/70 px-3 py-2 text-xs sm:text-sm text-stone-200 '
  + 'font-mono focus:outline-none focus:border-amber-500/70 placeholder:text-stone-600';

const STATUS_TONE: Record<SyncState['status'], string> = {
  disabled: 'text-stone-400', idle: 'text-stone-400', syncing: 'text-sky-300',
  ok: 'text-emerald-300', partial: 'text-amber-300', error: 'text-rose-300',
};

export interface SkyrimSettingsViewProps {
  open: boolean;
  onClose: () => void;
  hs: HSEmbedded;
  /** 課表開始日期／匯入等需要落回領域狀態的變更 */
  onApplyHS: (hs: HSEmbedded) => void;
  onShowNotification: (title: string, subtitle: string) => void;
}

export const SkyrimSettingsView: React.FC<SkyrimSettingsViewProps> = ({
  open, onClose, hs, onApplyHS, onShowNotification,
}) => {
  const [sync, setSync] = useState<SyncState>(getSyncState());
  const [cfg, setCfg] = useState(() => loadConfig());
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [urlProblemMsg, setUrlProblemMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pingInfo, setPingInfo] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [armReset, setArmReset] = useState(false);
  // 課表開始日期
  const [startDate, setStartDate] = useState('');
  const [startNote, setStartNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    return subscribeSync(setSync);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const c = loadConfig();
    setCfg(c);
    setUrl(c.url);
    setSecret(c.secret);
    setStartDate(hs.startedAt);
    setStartNote(null);
  }, [open, hs.startedAt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toast = (msg: string, isErr = false) => onShowNotification(isErr ? 'SYNC FAILED' : 'SETTINGS', msg);

  const act = async (name: string, fn: () => Promise<unknown>, okMsg?: (r: unknown) => string) => {
    setBusy(name);
    try {
      const r = await fn();
      if (okMsg) toast(okMsg(r));
    } catch (e: any) {
      toast(`${e?.kind ? e.kind + '：' : ''}${e?.message || e}`, true);
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- 連線憑證 ---------------- */
  const saveUrl = () => act('url', async () => {
    const clean = cleanUrl(url);
    const problem = urlProblem(clean);
    setUrl(clean);
    setUrlProblemMsg(problem);
    if (problem) throw new Error(`URL 不收：${problem}`);
    const c = saveConfig({ url: clean });
    setCfg(c);
    return clean;
  }, (c) => (c ? '雲端 URL 已存，按「測試連線」驗證' : '已清空 → 回到純離線模式（同步等於關）'));

  const disableCloud = () => act('url-off', async () => {
    setUrl('');
    setUrlProblemMsg(null);
    const c = saveConfig({ url: '' });
    setCfg(c);
    return true;
  }, () => '已停用雲端同步');

  const saveSecret = () => act('secret', async () => {
    const c = saveConfig({ secret: secret.trim() });
    setCfg(c);
    return null;
  }, () => '密鑰已更新（只存本機，不進任何網頁請求）');

  /* ---------------- 雲端同步 ---------------- */
  const doSync = () => act('sync', async () => {
    const r = await syncNow(
      () => storageService.readHSRaw(),
      (merged) => { storageService.writeHSRaw(merged); onApplyHS(merged); }
    );
    toast(r.summary, !r.ok);
    return r;
  });

  const doPing = () => act('ping', async () => {
    const r = await ping();
    setPingInfo(`${r.ok ? '' : '✗ '}${r.detail}`);
    return r;
  });

  const doCloudBackup = () => act('cloud-backup', () => pushCloudBackup(hs), () => '已請雲端多留一份備檔（Backups 表）');

  const toggleAuto = () => act('auto', async () => {
    const c = saveConfig({ auto: !cfg.auto });
    setCfg(c);
    return c.auto;
  }, (v) => (v ? '自動同步已開（上線／回前景／每 10 分鐘）' : '自動同步已關（只手動同步）'));

  /* ---------------- 課表自訂開始日期 ---------------- */
  const info = planStartInfo(hs);
  const applyStart = (raw: string, label: string) => act('plan-start', async () => {
    const next = applyPlanStart(hs, raw.trim());
    if (!next) throw new Error('日期不合法：要 YYYY-MM-DD、不能是未來');
    onApplyHS(next);
    setStartDate(next.startedAt);
    setStartNote({ tone: 'ok', text: `開始日期已設為 ${next.startedAt}（${label}）— 週數／階段／課表已重推導` });
    return true;
  }, () => `課表開始日期已更新（${label}）`);

  const resetStartToToday = () => applyStart(todayISO(), '今天');

  /* ---------------- 備份與還原 ---------------- */
  const doExport = () => act('export', async () => {
    const name = `hs-tracker-backup-${todayISO()}.json`;
    const payload = { format: 'HS_TRACKER_BACKUP', exportedAt: new Date().toISOString(), hs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { saved: true, name };
  }, (r: any) => (r?.saved ? `備份檔已下載：${r.name}` : '備份取消'));

  const doImport = (f: File | undefined) => {
    if (!f) return;
    void act('import', async () => {
      const text = await f.text();
      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch (e: any) {
        throw new Error(`JSON 解析失敗：${e.message}`);
      }
      const hsIncoming = payload?.hs || payload?.character?.hs;
      if (!hsIncoming) throw new Error('不是本 App 的備份檔（缺 hs）');
      if (payload?.format === 'HS_SKYRIM_SAVE' || payload?.character) {
        throw new Error('這是 .skyrimsave 存檔——請到 SAVES 頁匯入；這裡只收 hs-tracker-backup-*.json');
      }
      // 匯入 = 整份取代（與舊版語意一致）；落盤由 App 端 onApplyHS 統一處理
      onApplyHS(hsIncoming);
      return true;
    }, () => '匯入完成（整份取代）')
      .then(() => { if (fileRef.current) fileRef.current.value = ''; });
  };

  /* ---------------- 診斷 ---------------- */
  const doDiag = () => act('diag', async () => {
    const { text } = await diagnostics();
    setDiag(text);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      /* 剪貼簿不可用 */
    }
    toast(copied ? '診斷已複製到剪貼簿' : '剪貼簿不可用——下面這段手動複製');
    return text;
  });

  /* ---------------- 危險區 ---------------- */
  const doReset = () => act('reset', async () => {
    try {
      localStorage.removeItem('HS_SKYRIM_CURRENT_V1');
      localStorage.removeItem('HS_SKYRIM_SLOTS_V1');
    } catch {
      /* ignore */
    }
    setTimeout(() => location.reload(), 400);
    return true;
  }, () => '本機已清空，重新載入中…');

  const dot = (
    <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
      sync.status === 'ok' ? 'bg-emerald-400' : sync.status === 'partial' ? 'bg-amber-400'
        : sync.status === 'error' ? 'bg-rose-400' : sync.status === 'disabled' || sync.status === 'idle' ? 'bg-stone-500' : 'bg-sky-400 animate-pulse'
    }`} />
  );

  const preview = (() => {
    if (!startDate) return null;
    const fake = { ...hs, startedAt: startDate };
    const p = planStartInfo(fake);
    if (p.totalWeeks <= 0) return null;
    return `第 ${p.weekNumber} 週 · Phase ${p.phase} ${p.phaseTitle}（${p.phaseRange?.[0]}–${p.phaseRange?.[1]} 週）· 計畫結束 ${p.endDate}`;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center px-2 sm:px-4 py-4 sm:py-8">
      <button aria-label="關閉" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        role="dialog" aria-modal="true" aria-label="設定卷軸"
        className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-amber-800/40 bg-[#141311] shadow-[0_0_60px_rgba(0,0,0,0.9)]"
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-[#1c1a16] to-[#141311] border-b border-amber-900/40">
          <ScrollText className="w-4 h-4 text-amber-400" />
          <div className="font-cinzel text-sm tracking-[0.2em] uppercase text-amber-200/90">見習者之卷 · 設定</div>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => { skyrimAudio.playTabSwitch(); onClose(); }} className="p-1.5 text-stone-400 hover:text-amber-300" aria-label="關閉設定">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-7">
          {/* ── 雲端同步：狀態三態一定要看得見（ok / error），否則問題會被藏起來 ── */}
          <section>
            <Label zh="雲端同步" en="CLOUD SYNC" />
            <div className="border border-stone-700/60 bg-black/30 p-3.5">
              <div className={`text-sm ${STATUS_TONE[sync.status]}`}>{dot}{SYNC_LABEL[sync.status]}</div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px] text-stone-400">
                <div>裝置 <span className="text-stone-200 font-mono">{deviceId().slice(0, 8)}</span></div>
                <div>次數 <span className="text-stone-200 font-mono">{cfg.totalSyncs}</span></div>
                <div className="col-span-2">最後同步 <span className="text-stone-200 font-mono">{sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString() : '尚未'}</span></div>
              </div>
              {sync.lastDetail && <div className="mt-1.5 text-[11px] text-stone-500 font-mono">{sync.lastDetail}</div>}
              {sync.lastError && (
                <div className="mt-2 flex items-start gap-2 text-[11px] text-rose-300/90">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="font-mono break-all">{sync.lastError}</span>
                </div>
              )}
              <div className="mt-3.5 flex flex-wrap gap-2">
                <Btn icon={<RefreshCw className={`w-4 h-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />} onClick={doSync} disabled={!!busy || !cfg.url}>立即同步</Btn>
                <Btn icon={<Plug className="w-4 h-4" />} onClick={doPing} disabled={!!busy}>測試連線</Btn>
                <Btn icon={<Cloud className="w-4 h-4" />} onClick={doCloudBackup} disabled={!!busy || !cfg.url}>雲端備檔</Btn>
                <Btn icon={<RefreshCw className="w-4 h-4" />} onClick={toggleAuto} disabled={!!busy}>{cfg.auto ? '自動同步：開' : '自動同步：關'}</Btn>
              </div>
              {pingInfo && <div className="mt-2.5 text-[11px] font-mono text-stone-400 break-all">{pingInfo}</div>}
            </div>
          </section>

          {/* ── 連線憑證：URL 校驗只有一份規則（在 syncService）── */}
          <section>
            <Label zh="連線憑證" en="ENDPOINT" />
            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-stone-500 mb-1">GAS Web App URL（清空並儲存＝停用雲端，回到純離線）</div>
                <input className={field} value={url} onChange={(e) => { setUrl(e.target.value); setUrlProblemMsg(null); }}
                  placeholder="https://script.google.com/macros/s/…/exec" spellCheck={false} autoComplete="off" />
                {urlProblemMsg && <div className="mt-1.5 text-[11px] text-rose-300">不收：{urlProblemMsg}</div>}
              </div>
              <div>
                <div className="text-[11px] text-stone-500 mb-1">密鑰（SHARED_SECRET，只存本機，不會出現在任何 URL）</div>
                <input className={field} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={`${(secret || '').length ? `已存 ${secret.length} 字元` : '尚未設定'}`} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn icon={<Check className="w-4 h-4" />} onClick={saveUrl} disabled={!!busy}>儲存 URL</Btn>
                <Btn icon={<CloudOff className="w-4 h-4" />} onClick={disableCloud} disabled={!!busy}>停用雲端</Btn>
                <Btn icon={<Check className="w-4 h-4" />} onClick={saveSecret} disabled={!!busy}>儲存密鑰</Btn>
              </div>
            </div>
          </section>

          {/* ── 課表：自訂開始日期 ── */}
          <section>
            <Label zh="課表 · 開始日期" en="PLAN START" />
            <div className="border border-stone-700/60 bg-black/30 p-3.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px] text-stone-400 mb-3">
                <div>目前錨點 <span className="text-stone-200 font-mono">{info.startedAt}</span></div>
                <div>第 <span className="text-stone-200 font-mono">{info.weekNumber}</span> 週</div>
                <div>Phase <span className="text-stone-200 font-mono">{info.phase}</span> {info.phaseTitle}</div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="date" className={field + ' sm:max-w-[200px]'} value={startDate}
                  max={todayISO()} min="2020-01-01"
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Btn icon={<CalendarDays className="w-4 h-4" />} onClick={() => startDate && applyStart(startDate, startDate)} disabled={!!busy || !startDate}>套用開始日期</Btn>
                  <Btn onClick={resetStartToToday} disabled={!!busy}>設為今天</Btn>
                </div>
              </div>
              {preview && (
                <div className="mt-2.5 text-[11px] text-sky-300/80 font-mono">
                  預覽（{startDate}）：{preview}
                </div>
              )}
              <div className="mt-2 text-[11px] leading-relaxed text-stone-500">
                課表不是從你第一次打開 App 那天開始？在這裡校正錨點。週數 → 階段 → 每日菜單會全部重推導；
                已打卡的 XP 有快照保護，不會因為重對映而改變。
              </div>
              {startNote && (
                <div className={`mt-2 text-[11px] ${startNote.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{startNote.text}</div>
              )}
            </div>
          </section>

          {/* ── 備份：離線優先 App 的自救通道 ── */}
          <section>
            <Label zh="備份與還原" en="ARCHIVE" />
            <div className="flex flex-wrap gap-2">
              <Btn icon={<Download className="w-4 h-4" />} onClick={doExport} disabled={!!busy}>匯出 JSON</Btn>
              <Btn icon={<Upload className="w-4 h-4" />} onClick={() => fileRef.current?.click()} disabled={!!busy}>匯入備份檔</Btn>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
                onChange={(e) => doImport(e.target.files?.[0])} />
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-stone-500">
              匯入是「整份取代」，不是合併。App 離線可用，但瀏覽器可能在 7 天後清掉本機資料——手動留一份才回得來。
              已啟用雲端時，每次同步也會把整份狀態留在 GAS 端（Changes 表保留全程歷史）。
            </div>
          </section>

          {/* ── 診斷 ── */}
          <section>
            <Label zh="診斷" en="DIAGNOSTICS" />
            <div className="flex flex-wrap items-center gap-2">
              <Btn icon={<Copy className="w-4 h-4" />} onClick={doDiag} disabled={!!busy}>複製診斷</Btn>
              <span className="text-[11px] text-stone-500">含版號、URL、同步次數、ping 原文（不含密鑰本體）</span>
            </div>
            {diag && (
              <pre className="mt-3 max-h-52 overflow-auto border border-stone-700/60 bg-black/50 p-3 text-[10.5px] leading-relaxed font-mono text-stone-300 whitespace-pre-wrap break-all">{diag}</pre>
            )}
          </section>

          {/* ── 危險動作：兩次點擊才生效 ── */}
          <section>
            <Label zh="危險" en="DANGER" />
            <div className="border border-rose-900/50 bg-rose-950/10 p-3.5">
              <div className="text-[11px] text-stone-400 leading-relaxed">
                清空本機存檔與自動存檔（雲端設定保留）。已同步上雲的進度不會被刪，重新同步可拉回。
              </div>
              <div className="mt-2.5">
                {armReset ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-rose-300">確定？此動作無法復原</span>
                    <Btn icon={<Trash2 className="w-4 h-4" />} onClick={() => { setArmReset(false); void doReset(); }} disabled={!!busy} className="!border-rose-800/70 hover:!border-rose-400">真的清空</Btn>
                    <Btn onClick={() => setArmReset(false)}>算了</Btn>
                  </div>
                ) : (
                  <Btn icon={<Trash2 className="w-4 h-4" />} onClick={() => setArmReset(true)}>清空本機資料</Btn>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

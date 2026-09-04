# 🤸 倒立之殿 · Press to Handstand Tracker

離線優先的 **52 週倒立訓練追蹤器**，以 **Skyrim 風格 UI** 呈現：
星圖技能樹（Constellation Perks）、卷軸課表（Quest Journal）、龍語徽章、羅盤與天空通知。

本 repo 是「Press to Handstand」專案的主倉庫。**Test3（AI Studio 的 Skyrim Quest & Perks Tracker UI）已併入本專案**：
倒立訓練的領域資料與規則（`data/workout.json`、`data/skills.json`、`data/badges.json`、等級／XP／streak／技能點規則）
全部保留，舊的 rollup + sql.js + GAS 環境與舊 UI 已捨棄，改採 Test3 的
**React 19 + Tailwind CSS 4 + Vite 6 + Rust WebAssembly** 技術棧與整套 Skyrim UI 元件。

> 歷史 commit 保留供參考；`main` 分支即為合併後的現行專案。
> 舊版 PWA 的 Service Worker 已部署 kill-switch（`public/sw.js`），舊訪客開頁會自動清快取升級。

---

## 領域模型（承襲舊專案，規則不變）

| 來源 | 內容 |
|---|---|
| `src/data/handstand/workout.json` | 52 週課表：5 個階段（除鏽重建 → 目標衝刺），每週一～五訓練日、週六日休息，每個動作帶 XP |
| `src/data/handstand/skills.json` | 技能樹 8 分支 33 節點：手腕／地基／烏鴉／L-sit／牆面倒立／自由倒立／壓上／心理安全，節點帶 `min_xp`、`min_streak`、前置依賴 |
| `src/data/handstand/badges.json` | 15 枚徽章：`total_xp`、`total_sessions`、`streak`、`level`、`skills_unlocked` 等指標自動判定 |

**規則引擎** `src/domain/rules.ts`（自舊 `game-core.ts` 移植，語意不變）：
- 等級 1–10（新手 Novice → 傳奇 Legend），XP 門檻 0 → 30,000
- 「今天練什麼」唯一真相 = 本機星期（weekday）；週日／週六為休息日
- 技能點：每升 1 級 +1 點，花在星位上不可 respec；解鎖需前置全亮 + XP 門檻 + streak
- 解鎖星位 +50 XP；徽章達成即時判定、捲軸通知

## UI（來自 Test3 的 Skyrim 元件庫）

| 元件 | 用途 |
|---|---|
| `SkyrimCompass` | 頂部羅盤：追蹤中的訓練日、技能點提示 |
| `QuestJournal` | 任務手札：本週＋上週課表（動作=objective，完成即得 XP）、階段畢業關卡、自訂任務 |
| `ConstellationPerks` | 星座技能樹：8 分支 33 星位，解鎖規則由 `data/handstand/skills.json` 驅動 |
| `CharacterStatsView` | 角色頁：等級／XP、streak、徽章牆、52 週里程碑、Rust WASM 引擎監看 |
| `SaveManagerView` | 存檔管理：自動／快速／手動存檔、匯出匯入 `.skyrimsave`、重置 |
| `SkyrimStatusBar` / `SkyrimNotification` | 底部狀態列與捲軸式通知 |

**單一真相架構**：`HSEmbedded`（`src/domain/state.ts`）是唯一可變狀態；
XP／等級／點數／徽章全部由 `src/domain/adapters.ts` 推導，UI 只能透過
勾選 objective、解鎖星位、改個人檔三個入口寫入——杜絕「兩種真值」漂移。

## 開發

```bash
bun install          # 安裝依賴（bun.lock 為準，需 bun ≥ 1.4）
bun run dev          # 開發伺服器 http://localhost:3000
bun run lint         # tsc --noEmit 型別檢查
bun run build        # 產出 dist/（GitHub Pages 部署產物）
bun run preview      # 本地預覽構建結果
```

## 部署

推送至 `main` 即觸發 `.github/workflows/deploy.yml`：
型別檢查 → `vite build` → 上傳 `dist/` → 發佈到 GitHub Pages。
`vite.config.ts` 已設定 `base: './'`，可直接掛在專案子路徑（`/hs-tracker/`）。

線上版本：<https://end8cl01g.github.io/hs-tracker/>

## 已捨棄的舊環境

rollup 多層打包、sql.js(WASM)+IndexedDB 資料層、Google Apps Script 雲端同步（`gas/`）、
node:test 測試基建、自架字型離線殼——相關 commit 留存於歷史，需要的時候可以考古。

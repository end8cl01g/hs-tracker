# ⚔️ Skyrim Quest & Perks Tracker

手機優先（mobile-first）的 Skyrim 風格任務手札與星座樹專長追蹤器。
以 **React 19 + Tailwind CSS 4 + Vite 6** 打造 UI，核心遊戲規則由 **Rust → WebAssembly** 引擎計算，
存檔走瀏覽器本機（離線可用），介面包含羅盤、狀態列、天空捲軸通知與celestial 動效。

> 本代碼庫原為「倒立訓練追蹤 PWA」（Press to Handstand Tracker）。
> 應用程式已整併自 [end8cl01g/Test3](https://github.com/end8cl01g/Test3)，**舊代碼環境與 UI 已全數捨棄**；
> 歷史 commit 僅作存檔參考，`main` 分支現以本專案為唯一內容。

---

## 功能一覽

| 模組 | 說明 |
|---|---|
| `QuestJournal` | 任務手札：主線／支線／完成度追蹤 |
| `ConstellationPerks` | 星座樹專長：技能樹視覺化與解鎖驗證 |
| `CharacterStatsView` | 角色數值：等級、經驗曲線、傳奇重置 |
| `SaveManagerView` | 存檔管理：本機多存檔、離線可用 |
| `SkyrimCompass` / `SkyrimStatusBar` / `SkyrimNotification` | 沉浸式 HUD：羅盤、狀態列、天空風格通知 |
| `src/rust/` | Rust 規則引擎源碼（`xp_for_level`、`can_unlock_perk`、`legendary_refund`），以 base64 內嵌 WASM 載入 |

## 開發

```bash
bun install          # 安裝依賴（bun.lock 為準）
bun run dev          # 開發伺服器 http://localhost:3000
bun run lint         # tsc --noEmit 型別檢查
bun run build        # 產出 dist/（GitHub Pages 部署產物）
bun run preview      # 本地預覽構建結果
```

## 部署

推送至 `main` 即觸發 `.github/workflows/deploy.yml`：
型別檢查 → `vite build` → 上傳 `dist/` → 發佈到 GitHub Pages。
`vite.config.ts` 已設定 `base: './'`，資源以相對路徑載入，可直接掛在專案子路徑（`/hs-tracker/`）。

## 環境變數

複製 `.env.example` 為 `.env` 後填入：

- `GEMINI_API_KEY` — Gemini AI API 金鑰（選用；純靜態部署不影響遊戲功能）
- `APP_URL` — 應用程式對外網址

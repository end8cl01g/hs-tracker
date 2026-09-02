# 🤸 Press to Handstand Tracker

離線優先的倒立訓練追蹤 PWA：**GitHub Pages 放殼**、**sql.js(WASM) + IndexedDB 存本機**、
**Google Apps Script + Sheets 當雲端同步**（可整個關掉，功能不打折）。

本 repo 是把外部規格（`gists/handstand-prompt/Prompt.md`）照「六帽審議委員會」的裁定**修正後**實作的結果，
9 項 P0 缺陷對應到 `todo.md` 的 1.1–1.9，每項都有測試或靜態檢查擋著。

---

## 30 秒跑起來

```bash
npm ci
npm run check && npm test        # 靜態閉環檢查 + 56 項測試
npm run build && npm run serve   # 產生 dist/ 並開 http://localhost:8080
```

瀏覽器開 `http://localhost:8080`，按「開始訓練旅程」即可離線打卡（不需要任何雲端設定）。

---

## 目錄

```
index.html            4 分頁殼（今天 / 技能樹 / 成就 / 設定）
css/style.css         深色 RPG 主題，含 safe-area 與 prefers-reduced-motion
js/
  dates.js            本機日曆日工具（跨時區一致性的唯一來源）
  game-core.js        純邏輯：XP/等級/streak/今日課表/徽章/技能解鎖（可單測）
  db.js               sql.js + IndexedDB：schema 遷移、pagehide 強制落盤
  data-layer.js       21 個 CRUD + LWW 衝突解決 + 匯出/匯入
  gas-proxy.js        GAS HTTP 客戶端（text/plain 避 preflight、跟隨 302）
  sync-manager.js     雙向同步、批次 ≤200、退避重試、失敗顯式可見
  game-engine.js      載 data/*.json、組視圖模型、徽章判定
  ui.js animations.js backup.js app.js   渲染／動畫／備份／啟動（含 SW 註冊）
sw.js                 離線殼 + 設定檔 network-first（版本由 build 注入）
data/                 課表、技能樹(36)、徽章(12) —— 改這裡就能改訓練計畫
vendor/sql-wasm.{js,wasm}   sql.js 1.14.2 自架（不走任何 CDN）
gas/                  Code.gs / Sheets.gs / Config.gs / Utils.gs + appsscript.json
tests/                node:test：core / db / sync / sw / site / gas
scripts/              build.mjs check.mjs serve.mjs ship.sh deploy-gas.sh
```

---

## 上線（前端）

需要一個 **fine-grained PAT**（只給這個 repo：`Contents: Read and write` ＋ `Administration: Read and write`）。

```bash
export GITHUB_TOKEN=github_pat_xxx      # 或寫進 ~/.config/gh-token 後 export GH_TOKEN_FILE=...
REPO_NAME=hs-tracker bash scripts/ship.sh
```

腳本會：跑檢查與測試 → `git init/commit` → 建 public repo → push → 用 API 把 Pages 設成
`build_type: workflow`（**走 Actions 產物，不經 Jekyll**）→ 等部署 → 印出三條驗證指令。

部署流程本身在 `.github/workflows/deploy.yml`：每次 push main 都先 `check + test + build`，全綠才上線。
`sw.js` 的 cache key 由 `BUILD_ID`（= commit sha）注入，所以改版一定換 cache，不會卡舊殼。

## 上線（雲端同步，可選）

```bash
export clasp_config_auth=/usr/local/share/clasp/.clasprc.json   # 或直接 clasp login
cd gas && clasp create-script --title "HS Tracker Backend" --type standalone --rootDir .
clasp push
clasp create-deployment -d "v1"          # 不加 -V 就是 @HEAD
```

然後在編輯器跑一次 `bootstrapSecret_()`：它會建好 `Changes/Backups/Meta` 三個工作表、
產生高強度密鑰寫進 Project Properties，並把密鑰印在「執行記錄」裡。
把 Web App URL 與密鑰貼進 App 的設定頁 → 按「📡 測試連線」→ 再按「🔄 立即同步」。

**部署設定必須是**：執行身份「我」、訪問權限「任何人」，但每個請求都要帶密鑰；
沒設 `SHARED_SECRET` 之前端點直接回 `secret-not-configured` 且**不寫表**（防止裸奔）。

---

## 已修掉的規格缺陷（對應 `todo.md`）

| # | 原規格的問題 | 現在的實作／驗證 |
|---|---|---|
| 1.1 | 寫了 `sw.js` 卻**從來沒 register()**（全文 `grep -c serviceWorker` = 0）→ 離線與安裝性全废 | `js/app.js` 的 `registerServiceWorker()`；`check.mjs` 與 `sw.test.mjs` 各自擋關 |
| 1.2 | sql.js 走 cdnjs `1.10.2`（首載需要網路，且落後 latest `1.14.2`） | `vendor/` 自架，`locateFile: f => 'vendor/'+f`；`site.test.mjs` 驗 `content-type: application/wasm` |
| 1.3 | schema 只在「新使用者」建表，無版本 → 加欄位必炸 | `PRAGMA user_version` + `MIGRATIONS{1,2}`；`db.test.mjs` 用 v1 老庫實測遷移 |
| 1.4 | 落盤只有 500ms debounce，鎖屏會掉最後幾筆 | `flushNow()` 綁 `pagehide`/`visibilitychange`；`close()` 前強制刷；測「寫入→重開→還在」 |
| 1.5 | `badges` 無 `updated_at`、`exercise_logs` 無所屬、`generateId` 只用 5 字元亂數 | 三個欄位補齊；id 改 `crypto.randomUUID()`；500 次不撞 |
| 1.6 | `datetime('now')` 是 UTC、`new Date('YYYY-MM-DD')` 是 UTC 午夜 → HK 跨日差一天 | 一律本機日曆日（`dates.js`）；`core.test.mjs` 跑 UTC±13/UTC-10 對照 |
| 1.7 | 同時存在「起算日 %7」與「設定選星期」兩套今日邏輯 | 單一真相：星期 × 課表（`todayPlan`），缺當日課表時用穩定對映且可測得冪等 |
| 1.8 | `CACHE_NAME='hs-tracker-v2'` 寫死 → 改版無效 | 版本由 build 注入；CI 断言 `dist/sw.js` 含本次 sha；`sw.test.mjs` 驗舊 cache 被清 |
| 1.9 | 未設 URL／離線時「silently return」＋ SW 吞錯 → 會假裝已同步 | `disabled`/`error` 為可見狀態，`lastError` 顯示在同步列；`sync.test.mjs` 4 條擋關 |
| 2.x | GAS：`application/json` 觸發 preflight、subpath 會導向登入頁、CacheService 寫 24h 不可能、回傳表格 URL | text/plain ＋ `redirect:'follow'`；只用 body；快取 6h 上限＋Properties 備援；`gas.test.mjs` 逐條斷言 |
| — | 免費 Pages 只能 public repo → 怕洩憑證 | `.gitignore` 擋 `.clasprc.json`/`.clasp.json`；`exportAll()` 主動剔除 `gas_secret`（有測試） |

## 已知取捨（不是 bug）

* **衝突採 LWW**（新 `updated_at` 勝），並把被覆蓋的一邊寫進 `conflicts` 表供檢視——不是欄位級合併。
* 雲端 `Changes` 表是 **append-only 日誌**，`pull` 只回同一列的最新版本；日誌要压缩需另跑清理（未做）。
* GAS 每次最多寫 500 列（單次執行 6 分鐘上限），大批量會分次推。
* iOS 未加入主畫面時仍有 7 天清除風險 → 啟動時要求 `navigator.storage.persist()` 並在設定頁顯示結果，另有手動匯出。
* 徽章只「新增」不回收，避免兩台裝置互蓋。

## 測試怎麼跑

```bash
npm test                 # core / db / sync / sw / site / gas，共 56 項
npm run check            # 46 項靜態閉環（引用、PRECACHE、GAS 紅線、manifest、CDN 殘留）
npm run build && npm run size
```

`tests/harness.mjs` 用 `vm` 把**瀏覽器同一份 JS** 跑在 node 裡（配一個最小 fake IndexedDB 與真實 sql.js），
所以 `db.js`／`data-layer.js`／`sync-manager.js` 的真實碼被執行，而不是測試另寫一份替代品。

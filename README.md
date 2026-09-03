# 🤸 Press to Handstand Tracker

離線優先的倒立訓練追蹤 PWA：**GitHub Pages 放殼**、**sql.js(WASM) + IndexedDB 存本機**、
**Google Apps Script + Sheets 當雲端同步**（可整個關掉，功能不打折）。

本 repo 是把外部規格（`gists/handstand-prompt/Prompt.md`）照「六帽審議委員會」的裁定**修正後**實作的結果，
9 項 P0 缺陷對應到 `todo.md` 的 1.1–1.9，每項都有測試或靜態檢查擋著。

---

## 部署憑證放哪裡（「焊死」與「蒸发」兩種）

```bash
# A. 焊死在工作區（跨容器重啟不用重貼；本 repo 預設優先讀這裡）
cp ~/.clasprc.json .deploy/.clasprc.json && chmod 600 .deploy/.clasprc.json

# B. 蒸发式（重啟就消失，最安全，但每次部署都要重貼）
mkdir -p /home/user/.cache/clasp && cp ~/.clasprc.json /home/user/.cache/clasp/.clasprc.json
```

`scripts/deploy-gas.mjs` 的搜尋順序是：`$clasp_config_auth` → `$CLASP_AUTH` → `.deploy/.clasprc.json` → `/home/user/.cache/clasp/.clasprc.json` → `/tmp/clasp/.clasprc.json`。
`clasp` 本體已列進 `devDependencies`，`scripts/deps.mjs` 會在缺件時自己 `npm ci`，所以容器重啟後 `npm run gas:push` 一條就夠。

**代價要講明白**：`.deploy/.clasprc.json` 是你的 Google 長期授權（refresh token），檔權限被 `npm run check` 硬性要求 0600、且 `.deploy/` 整體在 `.gitignore` 裡——但它仍然留在工作區快照中，**拿到這個工作區等於拿到你帳號的 Sheets/Drive 寫入權**。要收回：
1. `shred -u .deploy/.clasprc.json`（或 `rm`）；
2. 到 <https://myaccount.google.com/permissions> 把 “Google Apps Script API” / clasp 的授權撤掉（這樣舊 token 連同任何外洩副本一起作廢）。

## 源碼是 TypeScript，雲端/網頁只吃 Rollup 產物

| 什麼 | 源碼 | 打包 | 產物（唯一被部署的東西） |
|---|---|---|---|
| 前端 PWA | `src/*.ts`（12 檔 + `sw.ts`） | `rollup -c` | `build/app.js`、`build/sw.js` → `dist/app.js`、`dist/sw.js` |
| Apps Script 後端 | `gas/src/*.ts`（utils/config/sheets/code） | `rollup -c rollup.gas.config.mjs` | `gas/dist/Code.gs` + `gas/dist/appsscript.json`（clasp `rootDir=dist`） |

```bash
npm run typecheck   # 三個 tsconfig：前端 / sw（WebWorker lib）/ GAS（@types/google-apps-script）
npm run build       # rollup + scripts/build.mjs（注入 build 代號、組 dist/）
npm run gas:build   # tsc 型別閘門 → rollup 打包成一份 Code.gs
npm run gas:push    # gas:build + node scripts/deploy-gas.mjs --yes（會改動你 Google 帳號）
npm run dev         # rollup -w（改 src 即重打包；瀏覽器重新整理即見）
```

三個「不這樣做就會壞」的點（都是踩過的坑，`npm run check` 會擋）：
1. **GAS 各檔必須合併成一份模組再打包**：Apps Script 的舊寫法是「多個 .gs 共用全域函式」。
   若讓 rollup 把 `gas/src/*.ts` 當成個別 ESM 模組，它會把跨檔呼叫的 `allowRate_` 改名成 `allowRate_$1`
   → 雲端直接 ReferenceError（實測）。`rollup.gas.config.mjs` 因此用虛擬模組把各檔串成一份。
2. **GAS 產物不能包 IIFE，也要 `treeshake: false`**：Apps Script 只認 .gs 的「頂層函式」當入口
   （`doGet`/`doPost`/選單函式）；包起來或搖一搖，部署上去就變成 648 bytes 的空殼。
3. **`sw` 不能 minify**：`scripts/build.mjs` 要把 `'__BUILD__'` 換成本次 build 代號（todo 1.8 的快取失效機制），
   壓縮後字串可能被改寫 → SW 永遠抓舊殼。`index.html` 的內嵌版號腳本走同一套注入。

`tsconfig.json` 目前 `strict: false`（遷移當下的務實選擇：先讓 12 檔跑起來，再逐檔收緊）。
**人工入口的名字不能以底線結尾**：Apps Script 把 `foo_()` 當成 private——不會出現在 Run 下拉選單、
也無法被 `google.script.run` 呼叫。本專案內部函式照慣例都帶底線，所以 `gas/src/setup.ts` 專門放了兩隻
public 殼：`setupDatabase()`（建／修三張表，冪等，順手觸發核准）與 `runDoctor()`（診斷）。
`npm run check` 會擋「產物裡沒有任何 public 可 Run 入口」這種狀態。

即使如此，typecheck 已經抓到一個会上線的 bug：`doctor_()` 引用不存在的 `CONFIG_BASE_URL`
（正解是 `configBaseUrl_()`）——那個函式正是「要去編輯器按核准」時要跑的，會在按下 Allow 前先 ReferenceError。

## 訓練計劃本身在哪裡

**`PLAN.md` 是規範**（第三次審議定案：Phase 0 除鏽重建 6 週 ＋ 分層目標 必達/挑戰/延伸）。
`data/workout.json`、`data/skills.json`、`data/badges.json` 是它的編譯結果，**不要手改**：

```bash
npm run plan          # 從 scripts/gen-plan.mjs 重新產生 data/*.json
npm run plan:check    # 比對有沒有人手改過（CI/test 也會跑這條）
```

改計劃 = 改 `gen-plan.mjs` ＋ 同步 `PLAN.md`；兩邊不一致測試會紅（階段週數、標題、退階覆蓋率都被釘住）。

## 30 秒跑起來

```bash
npm ci
npm run check && npm test        # 靜態閉環 58 項 + 81 項測試
npm run build && npm run preview   # 產生 dist/ 並開 http://localhost:8080
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
data/                 課表、技能星圖(33 節點)、徽章(15) —— 由 `npm run plan` 從腳本產生，別手改
vendor/sql-wasm.{js,wasm}   sql.js 1.14.2 自架（不走任何 CDN）
gas/                  Code.gs / Sheets.gs / Config.gs / Utils.gs + appsscript.json
tests/                node:test：db / game-core / sync / sw / site / gas / gas-boot / scripts
scripts/              build.mjs check.mjs serve.mjs preview.mjs ship.sh deploy-gas.mjs
```

---

## 上線（前端）

**現況：已上線 →** <https://end8cl01g.github.io/hs-tracker/>（public repo `end8cl01g/hs-tracker`，
Pages `build_type: workflow`，`https_enforced: true`；線上 `sw.js` 的 `VERSION` = 當前 commit sha）。

需要一個 **fine-grained PAT**（只給這個 repo：`Contents: Read and write` ＋ `Administration: Read and write`）。
用傳統 `ghp_` token 也能推，但那是帳號級全權限（含 `delete_repo`、`admin:org`）⇒ 推完立刻去
<https://github.com/settings/tokens> 撤銷，換發 fine-grained。

```bash
export GITHUB_TOKEN=github_pat_xxx      # 或 GH_TOKEN_FILE=~/.config/gh-token，或落盤 .deploy/github-token（0600、已 gitignore）
REPO=hs-tracker OWNER=end8cl01g bash scripts/ship.sh
GH_TOKEN_NONE=1 bash scripts/ship.sh   # 暫時無視落盤 token（測試用）
```

腳本會：跑檢查與測試 → `git init/commit` → 建 public repo → push → 用 API 把 Pages 設成
`build_type: workflow`（**走 Actions 產物，不經 Jekyll**）→ 等部署 → 印出三條驗證指令。

部署流程本身在 `.github/workflows/deploy.yml`：每次 push main 都先 `check + test + build`，全綠才上線。
`sw.js` 的 cache key 由 `BUILD_ID`（= commit sha）注入，所以改版一定換 cache，不會卡舊殼。

## 同步壞掉時先看這段（實測踩過）

`https://script.google.com/macros/s/…/exec` 在瀏覽器開會被 302 到
`https://script.googleusercontent.com/macros/echo?user_content_key=…`。**第二條是那次回覆的快照，不是端點**
（POST 它會回 405 ＋ HTML）。App 的「GAS Web App URL」只能貼第一條；現在客戶端會先擋下來並直接告訴你原因，
設定頁的 **🧪 複製診斷** 會把 UA／SW 接管與否／實際存到的 URL／ping 原文打包成一行，貼回來就能定位。

## 上線（雲端同步，可選）

```bash
export CLASP_BIN=/tmp/clasp-tools/node_modules/.bin/clasp   # 沙箱內全域 npm 不可寫時用本地安裝處
export CLASP_AUTH=/tmp/clasp/.clasprc.json                   # 憑證別放 repo（/home/user 會被快照留存）
clasp login   # 或把 .clasprc.json 內容放進 $CLASP_AUTH
node scripts/deploy-gas.mjs              # 只預覽，不碰你帳號
node scripts/deploy-gas.mjs --yes        # 建專案 → push → 建部署 → bootstrap 設密鑰＋建表 → 刪 token → 再 push
```

**兩次無法 headless 的一次性核准**（皆已實測，不是推測）：
1. Web App 訪問權限：Apps Script REST 的 `DeploymentConfig` 沒有 access 欄位，`appsscript.json` 的
   `webapp.access` 也只影響編輯器建的部署 → 要在 Deploy ▸ Manage deployments 把 *Who has access* 設成 **Anyone**（已完成）。
2. Scope 首次核准：`appsscript.json` **不要宣告 `oauthScopes`**（宣告了就會蓋掉 Google 的自動推斷，換代碼時必炸；
   `npm run check` 會紅燈擋下），改由 Google 依代碼自動推。但自動推斷出來的 scope 仍要本人核准一次：
   編輯器 ▸ Run ▸ **`setupDatabase`** ▸ Review Permissions ▸ Advanced ▸ Allow。沒核准時 `SpreadsheetApp.create` 回
   `You do not have permission…Required permissions: …/spreadsheets`；`deploy-gas.mjs` 認得這個訊息，會直接印出
   點選路徑而不是空轉重試。`bootstrap` 帶 `force`、密鑰由腳本產生，所以**重跑同一條命令是安全的**。
   （實測也證明 headless 繞不過去：Apps Script Execution API `projects/run` 只回 HTML 權限頁。）

其餘都自動化：腳本臨時寫一份 `gas/Bootstrap.gs`（一次性 `SETUP_TOKEN`，已 gitignore、不進 public repo）
→ push → 用 `action=bootstrap` 換回 64 字元密鑰（**送出前先寫進 `.deploy/gas.json`**，避免雲端已收下、
本機卻弄丟）→ 刪掉 `Bootstrap.gs`、push、**再用 Apps Script content API 覆寫檔案清單**發新版本。
最後一步是必要的：`clasp push` 只新增／更新，**不會刪除本機已移除的雲端檔案**（實測過：只 push 的話
`bootstrap` 仍回 `bad-setup-token`）。通道關掉之後 `bootstrap` 一律回 `no-setup-token`。

**免憑證健診**（沙箱沒 clasp／沒 token 也能跑，CI 或手機上都行）：

```bash
npm run verify:gas          # 端點送達／密鑰可用／表格就緒／通道已關／錯密鑰被拒
npm run verify:gas -- --write   # 再加一次「寫入一列 → 別台裝置讀得回」的真往返
```


把印出來的 Web App URL 與密鑰貼進 App 設定頁 → 按「📡 測試連線」→ 再按「🔄 立即同步」。
（兩者也會存進 `.deploy/gas.json`，該目錄已 gitignore；手動方式仍可用：GAS 編輯器跑 `bootstrapSecret_()`。）

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
| 3.1 | **首開會卡在載入畫面**：markup 用 `hidden` 屬性、JS 卻用 `classList` 切 class，兩套機制互不相干 → `showApp()` 等於沒做事（47 項靜態檢查全綠也照樣放過） | 全站顯隱統一用 `el.hidden = bool`；新增 `tests/dom.test.mjs`：用真實 `index.html` + 真實 `css/style.css` 建迷你 DOM 跑真 `ui.js`/`animations.js`，斷言「按了之後真的看得見」；`check.mjs` 加三條政策守住不得混用。反向驗證：把 `showApp` 改回 classList 版，DOM 測試立刻紅 |
| 3.2 | 軟刪除的日誌還被算進「完成天數」（`getTotalWorkoutsCompleted` 漏 `deleted = 0`，與 `getWorkoutStreak` 不一致） | 補過濾；`check.mjs` 逐個統計函式要求帶 `deleted = 0` |
| 3.3 | push 只推一批（200 列）就回報「已同步」，且雲端 `truncated`（單次 500 列上限）被前端丟掉 → 大佇列永久殘留卻顯示綠燈 | `_pushRounds` 連續推到清空，零進度即停；狀態分級 `ok / partial / error`，UI 有 🟡「未推完」；`sync.test.mjs` 加 3 條（全拒收→error、沒 ack→partial、雲端 truncated→partial） |
| 2.6 | （實作時自己踩到的）`bootstrap` 寫在密鑰閘門**後面** → 還沒密鑰時永遠進不去，初始化死迴圈 | `handle_` 先放行 `bootstrap`（僅限未設定密鑰時），`tests/gas-boot.test.mjs` 跑真實 `handle_` 走完「未初始化→ping 可判讀→錯 token 拒→對 token 設密鑰→通道關閉→舊密鑰才能 push」；`check.mjs` 第 47 項守住順序 |
| — | 免費 Pages 只能 public repo → 怕洩憑證 | `.gitignore` 擋 `.clasprc.json`/`.clasp.json`；`exportAll()` 主動剔除 `gas_secret`（有測試） |

## 還缺什麼（老實清單，按代價排序）

| 缺 | 影響 | 要動多少 |
|---|---|---|
| 真瀏覽器／真機驗證 | 本沙箱無瀏覽器：SW 安裝與更新、iOS 主畫面、7 天 eviction、觸控與動畫流暢度**全未實測** | 0 行代碼，需你上線後按 4 項檢查回報 |
| 刪除鏈路不完整 | `deleteWorkoutLog()` 是死代碼（UI 無入口）；且 `exercise_logs` 用硬 `DELETE`、無 tombstone → 一旦接上刪除，雲端孤兒列會在下次 pull 復活 | migration v3 給各表加 `deleted` + pull 端套 tombstone，約 80 行 |
| `settings` 不跨裝置 | GAS 有 `settings` 的主鍵分支、前端 `TABLES` 卻沒有 settings → `startDate`/`currentPhase` 不同步，換手機從 Phase 0 重來 | 加 settings 白名單同步，約 40 行 |
| 衝突只有計數 | `conflicts` 表有明細，但 UI 只顯示「衝突保留：N 筆」，看不到也一鍵採不回遠端版 | 一個列表 + 兩個按鈕 |
| 雲端備份只能上不能回 | `action=restore`／`latestBackup_()` 已存在，前端沒按鈕 → 換機只能靠手動匯出檔 | 接一個按鈕 + 覆蓋確認 |
| a11y 只到一半 | Esc 已補；仍無 focus trap、`role="tablist"`/`aria-selected`、跳過導航連結 | 約 30 行 |
| `Changes` 表只 append | 長期會變很慢（GAS 單表上限 1,000 萬列），沒有压缩／清理觸發器 | 一個每週 time-driven trigger |
| 沒有 LICENSE | public repo 沒授權條款＝預設「保留所有權利」，別人 fork 法律上不能用 | 加一個檔案 |
| 沒有 E2E／視覺回歸 | `ui.js` 的渲染靠迷你 DOM 測，真實排版、字體溢位、窄屏 320px 沒覆蓋 | 需裝 Playwright＋Chromium（本沙箱無瀏覽器） |
| 尚未上線 | 沒有 PAT（前端沒推）與放行（GAS 沒部署），目前全部結論只適用本地 `dist/` | 你两句話的差別 |

## 已知取捨（不是 bug）

* **衝突採 LWW**（新 `updated_at` 勝），並把被覆蓋的一邊寫進 `conflicts` 表供檢視——不是欄位級合併。
* 雲端 `Changes` 表是 **append-only 日誌**，`pull` 只回同一列的最新版本；日誌要压缩需另跑清理（未做）。
* GAS 每次最多寫 500 列（單次執行 6 分鐘上限），大批量會分次推。
* iOS 未加入主畫面時仍有 7 天清除風險 → 啟動時要求 `navigator.storage.persist()` 並在設定頁顯示結果，另有手動匯出。
* 徽章只「新增」不回收，避免兩台裝置互蓋。

## 測試怎麼跑

```bash
npm test                 # db / game-core / sync / sw / site / gas / gas-boot / dom / scripts，共 81 項
npm run check            # 58 項靜態閉環（引用、PRECACHE、GAS 紅線、顯隱機制、CDN 殘留）
npm run build && npm run size
```

`tests/harness.mjs` 用 `vm` 把**瀏覽器同一份 JS** 跑在 node 裡（配一個最小 fake IndexedDB 與真實 sql.js），
所以 `db.js`／`data-layer.js`／`sync-manager.js` 的真實碼被執行，而不是測試另寫一份替代品。

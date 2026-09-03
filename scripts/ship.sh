#!/usr/bin/env bash
# scripts/ship.sh — 把本 repo 推上 GitHub Pages（全自動，只需要一個 PAT）
# 建議 fine-grained：Contents(RW) + Administration(RW)，且只授權這一個 repo。
# 注意：傳統 ghp_ token 是帳號級全權限（repo/delete_repo/admin:org/…），用完務必撤銷。
# token 搜尋序：$GITHUB_TOKEN → $GH_TOKEN → $GH_TOKEN_FILE → .deploy/github-token（gitignore、0600）。
# 想暫時無視落盤 token（例如測試）：GH_TOKEN_NONE=1 bash scripts/ship.sh
# 用法：
#   GITHUB_TOKEN=github_pat_xxx bash scripts/ship.sh
#   # 或不進 shell history：
#   printf %s github_pat_xxx > ~/.config/gh-token && chmod 600 ~/.config/gh-token
#   GH_TOKEN_FILE=~/.config/gh-token bash scripts/ship.sh
set -euo pipefail

REPO="${REPO:-hs-tracker}"
DESC="${DESC:-Press to Handstand Tracker — 離線優先 PWA（sql.js + Pages + GAS proxy）}"
OWNER="${OWNER:-}"                       # 留空 → 從 token 反查
DRY="${DRY:-0}"

cd "$(dirname "$0")/.."
# 憑證搜尋序：環境變數 → 指定檔 → .deploy/github-token（已 gitignore、0600；「焊死」用法）
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
[[ -z "$TOKEN" && -n "${GH_TOKEN_FILE:-}" ]] && TOKEN="$(tr -d '\n\r \t' < "$GH_TOKEN_FILE")"
[[ -z "$TOKEN" && -f .deploy/github-token ]] && TOKEN="$(tr -d '\n\r \t' < .deploy/github-token)"
if [[ "${GH_TOKEN_NONE:-0}" == "1" ]]; then TOKEN=""; fi   # 測試／臨時別用落盤憑證
if [[ -z "$TOKEN" ]]; then
  echo "✗ 沒有 token。用 GITHUB_TOKEN=…、GH_TOKEN_FILE=~/.config/gh-token，或寫進 .deploy/github-token（0600）。"
  echo "  建 token：https://github.com/settings/personal-access-tokens/new"
  echo "  → Repository access: Only select repositories → 這個 repo；Permissions: Contents(RW), Administration(RW)"
  exit 2
fi

API="https://api.github.com"
hdr=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")

say() { printf '\033[36m▸\033[0m %s\n' "$*"; }
die() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

say "驗證 token（只印 login 與狀態碼，不印 token）"
ME=$(curl -sS "${hdr[@]}" "$API/user" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("login",""))') || true
[[ -z "$ME" ]] && die "token 無效或網路失敗"
[[ -z "$OWNER" ]] && OWNER="$ME"
say "帳號：$OWNER  repo：$OWNER/$REPO"

say "本機檢查（check + test + build）—— 不通就不推"
npm run --silent check | tail -1
npm test 2>&1 | grep -E '^# (tests|pass|fail)'
npm run --silent build | tail -2
# dist/build-info.json 记的是建置時的 HEAD；不一致就是「推了舊 dist」（實測踩過：改完沒重建，線上少一支修正）
BDIST=$(python3 -c 'import json;print(json.load(open("dist/build-info.json")).get("build",""))' 2>/dev/null || echo "")
[[ "$BDIST" == "$(git rev-parse --short HEAD)"* ]] || die "dist 是 $BDIST 建的，但 HEAD 是 $(git rev-parse --short HEAD) → 先 npm run build 再推（ship.sh 已自動重建，這代表 build 沒跑成）"

say "建 repo（已存在就沿用；免費版 Pages 只能 public）"
CODE=$(curl -sS -o /tmp/ship-repo.json -w '%{http_code}' "${hdr[@]}" -X POST "$API/user/repos" \
  -d "{\"name\":\"$REPO\",\"description\":\"$DESC\",\"private\":false,\"has_issues\":false,\"has_wiki\":false,\"auto_init\":false}")
if [[ "$CODE" == "201" ]]; then say "已建立 $OWNER/$REPO"
elif grep -q 'already exists' /tmp/ship-repo.json; then say "repo 已存在，沿用"
else die "建 repo 失敗 HTTP $CODE: $(head -c 300 /tmp/ship-repo.json)"; fi

say "啟用 Pages（build_type=workflow，走 Actions 產物，不經 Jekyll）"
# Pages 必須在 push「之前」就存在，否则 push 觸發的那次 Actions 会在 deploy-pages 步驟上失敗
PC=404
for try in 1 2 3 4 5; do
  PC=$(curl -sS -o /tmp/ship-pages.json -w '%{http_code}' "${hdr[@]}" -X POST "$API/repos/$OWNER/$REPO/pages" \
    -d '{"build_type":"workflow","source":{"branch":"main","endpoint":"gh-pages"}}')
  [[ "$PC" == "201" || "$PC" == "409" ]] && break
  say "Pages 還沒就緒（HTTP $PC）→ 等 5 秒重試（$try/5）"; sleep 5
done
if [[ "$PC" == "201" ]]; then say "Pages 已啟用"
elif [[ "$PC" == "409" ]]; then say "Pages 已在設定中，改發 PUT 更新"
  curl -sS -o /dev/null "${hdr[@]}" -X PUT "$API/repos/$OWNER/$REPO/pages" -d '{"build_type":"workflow","source":{"branch":"main","endpoint":"gh-pages"}}'
else die "Pages 啟用失敗 HTTP $PC: $(head -c 300 /tmp/ship-pages.json)"; fi


say "git 初始化與推送 main"
[[ -d .git ]] || git init -q
git add -A
git -c user.name="${GIT_NAME:-$OWNER}" -c user.email="${GIT_EMAIL:-$OWNER@users.noreply.github.com}" \
  commit -q -m "hs-tracker PWA: 離線殼 + sql.js + GAS proxy（含 9 項 P0 修正）" || say "（無新變更，沿用上次 commit）"
git branch -q -M main
PUSH_URL="https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.git"
git push -q "$PUSH_URL" HEAD:refs/heads/main || die "push 失敗（token 需要 Contents:write）"
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${OWNER}/${REPO}.git"     # 遠端不存 token
FULL=$(git rev-parse HEAD); SHA="${FULL:0:7}"; say "已推送 main @ $SHA"

say "等這次 push 的 Actions 跑完（只認 head_sha=$SHA，最多 8 分鐘）"
# 上一版的 bug：查的是 per_page=1「最新一次」run，push 後 CI 還沒排隊時會讀到上個 commit 的 success
# → 立刻 break 並印「✓ 完事」，其實線上還是舊版（今天實測踩到，花了兩輪才發現）。
ST=in_progress; CC=""; RUN=""
for i in $(seq 1 48); do
  sleep 10
  R=$(curl -sS "${hdr[@]}" "$API/repos/$OWNER/$REPO/actions/runs?head_sha=$FULL&per_page=1" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin).get("workflow_runs", [])
except Exception as e:                      # API 422/403 或 HTML 錯誤頁都要看得見，別靜默當成 queued
    print("api-error", type(e).__name__, "https://github.com"); raise SystemExit(0)
if not d:
    print("queued - https://github.com"); raise SystemExit(0)
r = d[0]
print(r["status"], r.get("conclusion") or "", r["html_url"])' || echo "api-error curl-failed https://github.com")
  [[ "$ST" == api-error ]] && die "讀不到 CI 狀態（R=$R）→ 先修 API 權限/限流，別假裝在等 CI"
  read -r ST CC RUN <<<"$(echo "$R" | tr -d "(),'\"" | sed 's/  */ /g')"
  printf '  [%02d] %s %s\n' "$i" "$ST" "$CC"
  if [[ "$ST" == "completed" && "$CC" == "success" ]]; then break; fi
  if [[ "$ST" == "completed" ]]; then die "Actions 失敗 → $RUN"; fi
done
[[ "$ST" == "completed" && "$CC" == "success" ]] || die "Actions 8 分鐘內沒跑完（目前 $ST/$CC）→ 別信「上線成功」：$RUN"

URL="https://$OWNER.github.io/$REPO/"
say "驗收（三条都該 200／正確 header）"
for u in "manifest.json" "sw.js" "vendor/sql-wasm.wasm" "data/workout.json"; do
  printf '  %-24s %s\n' "$u" "$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$URL$u")"
done
BUILD=$(curl -sS "$URL/sw.js" | grep -oE "VERSION = '[^']+'" | head -1)
say "SW 版本：${BUILD:-<讀不到>}"
[[ "$BUILD" == *"$FULL"* ]] || die "線上 SW 版本不是 $SHA（cache 還沒換或部署失敗）→ 這不算上線成功：$BUILD"
echo
echo "✓ 完事：$URL"
echo "  手機開它 → 加到主畫面 → 設定頁貼 GAS Web App URL（先跑 scripts/deploy-gas.mjs）"
echo "  收尾：撤銷那個 PAT（https://github.com/settings/tokens）"

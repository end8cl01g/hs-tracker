#!/usr/bin/env bash
# scripts/ship.sh — 把本 repo 推上 GitHub Pages（全自動，只需要一個 fine-grained PAT）
# 需要的權限：Contents: Read and write + Administration: Read and write，且**只授權給一個 repo**。
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

TOKEN="${GITHUB_TOKEN:-}"
[[ -z "$TOKEN" && -n "${GH_TOKEN_FILE:-}" ]] && TOKEN="$(tr -d '\n\r \t' < "$GH_TOKEN_FILE")"
if [[ -z "$TOKEN" ]]; then
  echo "✗ 沒有 token。用 GITHUB_TOKEN=… 或 GH_TOKEN_FILE=~/.config/gh-token 提供。"
  echo "  建 token：https://github.com/settings/personal-access-tokens/new"
  echo "  → Repository access: Only select repositories → 這個 repo；Permissions: Contents(RW), Administration(RW)"
  exit 2
fi

cd "$(dirname "$0")/.."
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
[[ "$DRY" == "1" ]] && { say "DRY=1，到此為止"; exit 0; }

say "建 repo（已存在就沿用；免費版 Pages 只能 public）"
CODE=$(curl -sS -o /tmp/ship-repo.json -w '%{http_code}' "${hdr[@]}" -X POST "$API/user/repos" \
  -d "{\"name\":\"$REPO\",\"description\":\"$DESC\",\"private\":false,\"has_issues\":false,\"has_wiki\":false,\"auto_init\":false}")
if [[ "$CODE" == "201" ]]; then say "已建立 $OWNER/$REPO"
elif grep -q 'already exists' /tmp/ship-repo.json; then say "repo 已存在，沿用"
else die "建 repo 失敗 HTTP $CODE: $(head -c 300 /tmp/ship-repo.json)"; fi

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
SHA=$(git rev-parse --short HEAD); say "已推送 main @ $SHA"

say "啟用 Pages（build_type=workflow，走 Actions 產物，不經 Jekyll）"
PC=$(curl -sS -o /tmp/ship-pages.json -w '%{http_code}' "${hdr[@]}" -X POST "$API/repos/$OWNER/$REPO/pages" \
  -d '{"build_type":"workflow","source":{"branch":"main","endpoint":"gh-pages"}}')
if [[ "$PC" == "201" ]]; then say "Pages 已啟用"
elif [[ "$PC" == "409" ]]; then say "Pages 已在設定中，改發 PUT 更新"
  curl -sS -o /dev/null "${hdr[@]}" -X PUT "$API/repos/$OWNER/$REPO/pages" -d '{"build_type":"workflow","source":{"branch":"main","endpoint":"gh-pages"}}'
else die "Pages 啟用失敗 HTTP $PC: $(head -c 300 /tmp/ship-pages.json)"; fi

say "等第一次 Actions 跑完（最多 5 分鐘）"
URL=""
for i in $(seq 1 30); do
  sleep 10
  R=$(curl -sS "${hdr[@]}" "$API/repos/$OWNER/$REPO/actions/runs?per_page=1" | python3 -c '
import sys,json
d=json.load(sys.stdin).get("workflow_runs",[])
print((d[0]["status"], d[0].get("conclusion"), d[0]["html_url"]) if d else ("none","",""))' 2>/dev/null || echo "none  ")
  read -r ST CC RUN <<<"$(echo "$R" | tr -d "(),'\"" | sed 's/  */ /g')"
  printf '  [%02d] %s %s\n' "$i" "$ST" "$CC"
  if [[ "$ST" == "completed" && "$CC" == "success" ]]; then break; fi
  if [[ "$ST" == "completed" ]]; then die "Actions 失敗 → $RUN"; fi
done

URL="https://$OWNER.github.io/$REPO/"
say "驗收（三条都該 200／正確 header）"
for u in "manifest.json" "sw.js" "vendor/sql-wasm.wasm" "data/workout.json"; do
  printf '  %-24s %s\n' "$u" "$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$URL$u")"
done
BUILD=$(curl -sS "$URL/sw.js" | grep -oE "VERSION = '[^']+'" | head -1)
say "SW 版本：${BUILD:-<讀不到>}"
echo
echo "✓ 完事：$URL"
echo "  手機開它 → 加到主畫面 → 設定頁貼 GAS Web App URL（先跑 scripts/deploy-gas.mjs）"
echo "  收尾：撤銷那個 PAT（https://github.com/settings/tokens）"

#!/usr/bin/env bash
# scripts/deploy-gas.sh — 用 clasp 把 gas/ 推上你的 Google 帳號並佈署成 Web App
# ⚠️ 這會真的動到你帳號（建 Apps Script 專案 + 建 Google Sheet + 佈署公網端點）。
#    所以要加 --yes 才執行。密鑰那一步無法自動化（見檔尾說明）。
set -euo pipefail

if [[ "${1:-}" != "--yes" ]]; then
  echo "這是會改動你 Google 帳號的動作（建立 Apps Script 專案與公開端點）。"
  echo "確認要跑就：bash scripts/deploy-gas.sh --yes"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUTH_FILE="${CLASP_AUTH:-/usr/local/share/clasp/.clasprc.json}"
export clasp_config_auth="$AUTH_FILE"
TITLE="${GAS_TITLE:-HS Tracker Backend}"

if ! command -v clasp >/dev/null; then
  echo "✗ 找不到 clasp：sudo npm install -g @google/clasp"; exit 1
fi
if [[ ! -f "$AUTH_FILE" ]]; then
  echo "✗ 找不到授權檔 $AUTH_FILE（clasp login 或把 .clasprc.json 放過去）"; exit 1
fi

cd "$ROOT/gas"
echo "→ 目前授權身分"
clasp show-authorized-user || { echo "✗ clasp 未授權"; exit 1; }

if [[ ! -f .clasp.json ]]; then
  echo "→ 建立 Apps Script 專案：$TITLE"
  clasp create-script --title "$TITLE" --type standalone --rootDir . | sed 's/^/  /'
fi
SCRIPT_ID="$(python3 -c "import json;print(json.load(open('.clasp.json'))['scriptId'])" 2>/dev/null || true)"
[[ -z "$SCRIPT_ID" ]] && { echo "✗ 讀不到 .clasp.json 的 scriptId"; exit 1; }
echo "  scriptId=$SCRIPT_ID"

echo "→ push 四個 .gs + appsscript.json"
clasp push | sed 's/^/  /'

echo "→ 佈署成 Web App（版本 HEAD）"
clasp create-deployment --description "auto $(date -u +%Y%m%dT%H%M%SZ)" 2>&1 | sed 's/^/  /' || true
clasp list-deployments "$SCRIPT_ID" 2>&1 | sed 's/^/  /' || true

DEPLOY_ID="$(clasp list-deployments "$SCRIPT_ID" --json 2>/dev/null | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
rows = d if isinstance(d, list) else d.get('deployments', [])
cands = [x for x in rows if (x.get('deploymentConfig') or {}).get('managedByAppsScript')] or rows
print(cands[-1].get('deploymentId','') if cands else '')" 2>/dev/null || true)"

EXEC_URL="https://script.google.com/macros/s/${DEPLOY_ID:-<deploymentId>}/exec"
echo
echo "✓ 端點：$EXEC_URL"
echo "  前端設定頁貼這個 URL（不要把 gas_url commit 進 repo）"
echo
echo "── 還剩一步無法自動化（30 秒）──────────────────────────"
echo "  1. 打開 https://script.google.com/d/$SCRIPT_ID/edit"
echo "  2. 函式選單選 bootstrapSecret_() → 執行（會自動建 Changes/Backups/Meta 三個表）"
echo "  3. 執行記錄複製 SHARED_SECRET=… → 貼進 App 設定的「同步密鑰」"
echo "  4. 回 App 按「📡 測試連線」→ 應該綠燈"
echo "--------------------------------------------------------"
echo "為什麼這步不能自動化：clasp 3.x 沒有遠端執行函式的命令，"
echo "而「讓公網端點自己設定密鑰」等於沒鉴權，是我不肯寫的設計。"

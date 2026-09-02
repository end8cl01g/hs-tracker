/**
 * Sheets.gs — Google Sheets 當雲端表。設計：**只追加**（append-only event log）。
 * 不覆寫的原因：兩台裝置同時改同一筆時，覆寫會互相蓋掉；
 * 追加 + 前端依 updated_at 做 LWW 合併（js/data-layer.js upsertWithConflictResolution）→ 兩邊都不遺失。
 * 工作表：
 *   Changes  ts | device | table | row_id | updated_at | op | payload_json
 *   Backups  ts | device | bytes | payload_json
 *   Meta     key | value | updated_at
 */
const HEADERS = {
  Changes: ['ts', 'device', 'table', 'row_id', 'updated_at', 'op', 'payload_json'],
  Backups: ['ts', 'device', 'bytes', 'payload_json'],
  Meta: ['key', 'value', 'updated_at'],
};
const PK_ = {
  workout_logs: 'id', exercise_logs: 'id', skill_progress: 'skill_id',
  badges: 'badge_id', xp_log: 'id', settings: 'key',
};
const MAX_ROWS_PER_CALL = 500;   // 單次執行上限 6 分鐘：硬切一刀，剩下的下一輪再推

function ss_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { log_('SHEET_ID 失效，將重建：' + e.message); }
  }
  const created = SpreadsheetApp.create('HS Tracker Data');
  props.setProperty('SHEET_ID', created.getId());
  log_('已建立雲端表格（只存 id 於 Properties，URL 不外傳）');
  return created;
}

/** 取/建工作表並保證表頭正確（冪等） */
function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const header = HEADERS[name];
  const first = sh.getRange(1, 1, 1, header.length).getValues()[0];
  const same = header.every(function (h, i) { return String(first[i]) === h; });
  if (!same) {
    sh.clear();
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureSheets_() {
  Object.keys(HEADERS).forEach(function (k) { sheet_(k); });
  return { ok: true, sheets: Object.keys(HEADERS) };
}

function setMeta_(key, value) {
  const sh = sheet_('Meta');
  const n = sh.getLastRow();
  if (n > 1) {
    const col = sh.getRange(2, 1, n - 1, 1).getValues();
    for (let i = 0; i < col.length; i++) {
      if (String(col[i][0]) === String(key)) {
        sh.getRange(i + 2, 2, 1, 2).setValues([[value, nowISO_()]]);
        return;
      }
    }
  }
  sh.appendRow([key, value, nowISO_()]);
}

function pushRows_(device, tables) {
  const sh = sheet_('Changes');
  const rows = [];
  const acked = {};
  const rejected = [];

  Object.keys(tables).forEach(function (tbl) {
    if (rows.length >= MAX_ROWS_PER_CALL) return;
    const list = Array.isArray(tables[tbl]) ? tables[tbl] : [];
    const pk = PK_[tbl] || 'id';
    const okIds = [];
    list.forEach(function (r) {
      if (rows.length >= MAX_ROWS_PER_CALL) return;
      const json = JSON.stringify(r || {});
      if (json.length > 400000) { rejected.push({ table: tbl, reason: 'row-too-large' }); return; }
      if (r[pk] == null) { rejected.push({ table: tbl, reason: 'missing-pk' }); return; }
      okIds.push(r[pk]);
      rows.push([nowISO_(), device, tbl, String(r[pk]), String(r.updated_at || r.created_at || ''), 'upsert', json]);
    });
    if (okIds.length) acked[tbl] = { ids: okIds, count: okIds.length };
  });

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.Changes.length).setValues(rows);
  }
  setMeta_('last_push_at', nowISO_());
  setMeta_('last_push_rows', String(rows.length));
  return { ok: true, acked: acked, rejected: rejected, written: rows.length, truncated: rows.length >= MAX_ROWS_PER_CALL };
}

/** 同一 row_id 只回最新一條（省流量）；其餘靠 append 史保留在 Changes 表 */
function pullRows_(since) {
  const sh = sheet_('Changes');
  const n = sh.getLastRow();
  if (n < 2) return { ok: true, rows: {}, count: 0, since: since || null };
  const vals = sh.getRange(2, 1, n - 1, HEADERS.Changes.length).getValues();
  const latest = {};
  let count = 0;
  vals.forEach(function (v) {
    const updatedAt = String(v[4] || '');
    if (since && updatedAt <= String(since)) return;
    let payload;
    try { payload = JSON.parse(String(v[6])); } catch (e) { return; }
    const key = String(v[2]) + '|' + String(v[3]);
    if (latest[key] && String(latest[key].updated_at || '') >= updatedAt) return;
    payload.updated_at = payload.updated_at || updatedAt;
    latest[key] = payload;
    count++;
  });
  const rows = {};
  Object.keys(latest).forEach(function (key) {
    const tbl = key.split('|')[0];
    (rows[tbl] = rows[tbl] || []).push(latest[key]);
  });
  return { ok: true, rows: rows, count: count, since: since || null };
}

/** 整庫備份（iOS 7 天踢資料時的取回通道）；保留最近 10 份 */
function saveBackup_(device, payload) {
  if (!payload || !payload.tables) return { ok: false, error: 'payload.tables 缺失' };
  const sh = sheet_('Backups');
  const json = JSON.stringify(payload);
  if (json.length > 1800000) return { ok: false, error: 'backup-too-large', bytes: json.length };
  sh.appendRow([nowISO_(), device, json.length, json]);
  const excess = sh.getLastRow() - 1 - 10;
  if (excess > 0) sh.deleteRows(2, excess);
  setMeta_('last_backup_at', nowISO_());
  return { ok: true, bytes: json.length };
}

/** 給前端「從雲端還原」用：回傳最新一份備份 */
function latestBackup_() {
  const sh = sheet_('Backups');
  const n = sh.getLastRow();
  if (n < 2) return { ok: true, payload: null };
  const row = sh.getRange(n, 1, 1, HEADERS.Backups.length).getValues()[0];
  let payload = null;
  try { payload = JSON.parse(String(row[3])); } catch (e) { return { ok: false, error: 'backup-corrupt' }; }
  return { ok: true, ts: row[0], payload: payload };
}

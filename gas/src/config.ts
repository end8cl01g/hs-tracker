/**
 * Config.gs — GAS 反向讀 GitHub Pages 上的 data/*.json（規格原圖）
 *
 * ⚠️ 規格寫「cache 24h」是錯的：CacheService 上限 **21,600 秒＝6 小時**，
 *    單值 100KB、key ≤250 字元、滿載時 FIFO 批次逐出。
 *    → 這裡用「CacheService 6h（命中省 UrlFetch 配額）＋ PropertiesService 存版本雜湊（可無限久）」；
 *    超過 6 小時的場合退回直接抓 Pages，並用雜湊判斷有沒有變，不變就沿用。
 */
const CONFIG_BASE_URL_DEFAULT = 'https://YOUR_USERNAME.github.io/hs-tracker/data';
/** 可在 Project Properties 設 CONFIG_BASE_URL（例：自訂網域或 repo 改名）*/
function configBaseUrl_() {
  return PropertiesService.getScriptProperties().getProperty('CONFIG_BASE_URL') || CONFIG_BASE_URL_DEFAULT;
}
const CONFIG_FILES = { workout: 'workout.json', skills: 'skills.json', badges: 'badges.json' };
const CACHE_TTL = 21600;                 // CacheService 上限
const CACHE_NS = 'hsconf_';

function getConfig_(device, key) {
  if (!CONFIG_FILES[key]) return { ok: false, error: 'unknown-config: ' + key };
  const base = configBaseUrl_();
  const url = base.replace(/\/$/, '') + '/' + CONFIG_FILES[key];
  const cache = CacheService.getScriptCache();
  const ck = (CACHE_NS + key + '_' + hashStr_(url)).slice(0, 250);
  const hit = cache.get(ck);
  if (hit) return { ok: true, key: key, source: 'cache', ttl_left_s: 0, json: JSON.parse(hit).json, etag: JSON.parse(hit).etag };

  const props = PropertiesService.getScriptProperties();
  const knownHash = props.getProperty('CFG_HASH_' + key) || '';
  let res;
  try {
    res = UrlFetchApp.fetch(url, { method: 'get', headers: knownHash ? { 'If-None-Match': knownHash } : {}, muteHttpExceptions: true, followRedirects: true });
  } catch (e) {
    return { ok: false, error: 'urlfetch-failed', detail: String(e && e.message || e), cached: hit ? JSON.parse(hit).json : null };
  }
  const code = res.getResponseCode();
  if (code === 304) {
    const cachedJson = props.getProperty('CFG_JSON_' + key);
    if (cachedJson) return { ok: true, key: key, source: 'properties-revalidate', json: JSON.parse(cachedJson), etag: knownHash };
  }
  if (code !== 200) return { ok: false, error: 'http-' + code, detail: String(res.getContentText()).slice(0, 200) };

  const text = res.getContentText();
  let json;
  try { json = JSON.parse(text); } catch (e) { return { ok: false, error: 'bad-json-from-pages', detail: String(e && e.message || e) }; }
  const etag = String(res.getHeaders()['ETag'] || res.getHeaders()['etag'] || hashStr_(text));
  try {
    cache.put(ck, JSON.stringify({ json: json, etag: etag }), CACHE_TTL);
  } catch (e) { log_('cache.put 失敗（100KB 上限）：' + e.message); }
  if (jsonSize_(text) < 8000) {   // PropertiesService 單值 9KB 上限：大檔只進 cache
    props.setProperty('CFG_JSON_' + key, text);
    props.setProperty('CFG_HASH_' + key, etag);
  }
  return { ok: true, key: key, source: 'network', json: json, etag: etag, bytes: text.length };
}

/** 批量（前端 config 动作） */
function getConfigs_(device, keys) {
  const list = (keys && keys.length ? keys : Object.keys(CONFIG_FILES));
  const out = {};
  list.forEach(function (k) { out[k] = getConfig_(device, k); });
  return { ok: true, configs: out };
}

/** 手動清快取（改了 Pages 上的 JSON 想立刻生效時，在 GAS 裡跑一次） */
function flushConfigCache_() {
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();
  Object.keys(CONFIG_FILES).forEach(function (k) {
    cache.remove((CACHE_NS + k + '_' + hashStr_(configBaseUrl_())).slice(0, 250));
    props.deleteProperty('CFG_HASH_' + k);
  });
  return { ok: true, flushed: Object.keys(CONFIG_FILES) };
}

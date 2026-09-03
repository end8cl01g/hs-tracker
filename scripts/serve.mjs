#!/usr/bin/env node
// scripts/serve.mjs — 本機靜態伺服器（含 service-worker 需要的 secure context 例外：localhost 允許）
// 用途：改完直接手機同網段開 http://<ip>:8080 測；以及被 smoke.test 拿來驗 content-type。
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const ROOT = process.argv[2] ? new URL(process.argv[2], `file://${process.cwd()}/`).pathname : new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  // wasm 必須是 application/wasm，否則 instantiateStreaming 會退回 arrayBuffer（多一次記憶體峰值）
  '.wasm': 'application/wasm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

export function createStaticServer(root, port = 0, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = buildServer(root);
    srv.listen(port, host, () => resolve({ server: srv, port: srv.address().port, host, close: () => new Promise((r) => srv.close(r)) }));
  });
}

function buildServer(ROOT) {
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = normalize(join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  if (urlPath.endsWith('/')) file = join(file, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`404 ${urlPath}`);
    return;
  }
  const ext = extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    // 開發時不要 304 干擾；上線由 Pages 給 max-age=600
    'cache-control': ext === '.html' || ext === '.js' || ext === '.json' ? 'no-store' : 'public, max-age=600',
  });
  createReadStream(file).pipe(res);
});

  return server;
}

// 直接執行時才啟動（被 import 時不要自動佔 port）
if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) {
  buildServer(ROOT).listen(PORT, HOST, () => {
    console.log(`✓ 靜態伺服器：http://${HOST}:${PORT}  （根目錄 ${ROOT}）`);
    console.log('  手機同網段測試：把上方 HOST 換成區網 IP，並用 http://<ip>:8080/ 開啟');
  });
}

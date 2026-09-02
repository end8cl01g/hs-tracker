#!/usr/bin/env node
// scripts/preview.mjs — 本地預覽（serve dist/，含 wasm MIME 與 no-store）
// 用法：npm run preview  [PORT=8080]
import { createStaticServer } from './serve.mjs';
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
createStaticServer('dist', port, host).then(() => {
  console.log(`🌱 預覽 http://localhost:${port}/  （bind ${host}，root = dist/，與 GitHub Pages 同目錄結構）`);
  console.log('   Ctrl-C 停止');
}).catch((e) => {
  console.error('啟動失敗：' + e.message + '\n（先跑 npm run build 產生 dist/）');
  process.exit(1);
});

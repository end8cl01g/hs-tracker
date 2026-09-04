import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// 合併 Skyrim-html5（Vite + React + Tailwind）到 hs-tracker 的三條硬規則：
// ① base 必須是相對路徑：Pages 掛在 /hs-tracker/ 子路徑，寫死 '/' 會讓所有資產 404（上線實測踩過）
// ② 不得有外部 CDN（字型也要自架）：這是離線 PWA，check.mjs 會掃 URL 擋掉
// ③ 舊前端的 dist 產物（單支 app.js）由 vite 取代；sw/vendor/data 由 scripts/web-post.mjs 補進 dist
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', sourcemap: false },
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
});

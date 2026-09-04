import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// 自架字型（原本是 index.html 的 Google Fonts <link>）：離線 PWA 不能有外部請求
import '@fontsource/cinzel/700.css';
import '@fontsource/medievalsharp/400.css';
import './skyrim/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// SW 註冊：只在 http(s) 下做；dev（vite）用 http://localhost 也算 secure context，但沒 build 出 sw.js 時會 404 → 靜默略過
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !import.meta.env?.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 註冊失敗就退回純網路載入，別擋住開場 */ });
  });
}

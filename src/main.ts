// src/main.ts — 前端唯一入口（rollup 打进 dist/app.js）
// 載入順序＝以前 index.html 的 <script> 順序，一個 IIFE 把自己的命名空間掛到 global，
// 所以這裡只負責「按序觸發副作用」，不重新設計模組介面（改了會動到 12 檔與所有測試）。
import './dates';
import './game-core';
import './db';
import './data-layer';
import './gas-proxy';
import './sync-manager';
import './game-engine';
import './animations';
import './ui';
import './backup';
import './app';

// gas/src/index.ts — Apps Script 唯一入口（rollup 打成 gas/dist/Code.gs）
// Apps Script 只看「全域函式」，所以這裡不匯出任何东西；打包檔尾的 footer 會把各模組的
// 頂層函式（doGet / doPost / setup_ / …）掛回 globalThis，清單由 rollup.gas.config.mjs 掃原始碼產生。
import './utils';
import './config';
import './sheets';
import './code';

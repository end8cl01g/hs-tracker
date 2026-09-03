// 部署期才存在的兩個「外部」巨集（不進 gas/src，所以 TS 看不到定義，只能宣告）：
// · SETUP_TOKEN：由 scripts/deploy-gas.mjs 寫進 gas/dist/Bootstrap.gs（一次性通道，用畢即刪）
//   → 一定是 optional，程式碼用 typeof 守著，缺席時回 no-setup-token。
// · 雲端沒有 DOM，所以這裡也不准引用任何瀏覽器型別。
declare var SETUP_TOKEN: string | undefined;

// rollup.gas.config.mjs — Apps Script 後端：gas/src/*.ts → gas/dist/Code.gs ＋ gas/dist/appsscript.json
//
// 关键点（踩過才寫下來）：
// · GAS 的舊寫法是「多個 .gs 檔共用全域函式」，各檔互相直接呼叫 ensureSheets_() 這種名字。
//   如果把 gas/src/*.ts 當成一般 ESM 模組丟給 rollup，每個檔案會變成獨立模組，
//   rollup 為了避免名字撞車把 `allowRate_` 改名成 `allowRate_$1` → 跨檔呼叫当场失效（實測 ReferenceError）。
//   所以這裡用一個「合併模組」：依 index.ts 的 import 順序把各檔轉譯後串成一份原始碼，
//   對 rollup 來說只有一個模組 → 不改名、不 tree-shake，語意跟以前逐檔 push 完全一致。
// · 輸出用 format:'es' 且不包 IIFE：Apps Script 本來就把每個 .gs 的「頂層 function」當成全域函式，
//   所以產物就是一份plain 腳本（doGet / doPost 都在頂層）。之前包成 IIFE 時，real 呼叫鏈與
//   測試注入的 stub 會分屬兩個作用域，而且檔案在編輯器裡也更難讀。
// · 只推 gas/dist/（.clasp.json 的 rootDir=dist）→ .ts 永遠不會被推到雲端。
import { readFileSync, readdirSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const SRC = 'gas/src';
const DIST = 'gas/dist';
const ENTRY_ID = '\0hs-gas-combined';

/** index.ts 只是「順序清單」：import 的順序＝以前 index.html／GAS 各檔的載入順序 */
function moduleOrder() {
  const idx = readFileSync(join(SRC, 'index.ts'), 'utf8');
  const order = [...idx.matchAll(/import\s+'\.\/([\w-]+)'/g)].map((m) => m[1]);
  if (!order.length) throw new Error('gas/src/index.ts 沒列任何 import → 不知道要打包哪些檔');
  for (const n of order) if (!existsSync(join(SRC, n + '.ts'))) throw new Error(`index.ts 引了 ./${n}，但 gas/src/${n}.ts 不存在`);
  return order;
}

/** 轉譯單檔：去掉 import/export（合併成一份就不需要模組語法），其余原樣 */
function transpile(file) {
  const raw = readFileSync(join(SRC, file + '.ts'), 'utf8');
  const stripped = raw
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(?=(function|const|let|var|class)\b)/gm, '')
    .replace(/^\s*export\s+default\s+/gm, 'const __default__ = ');
  const out = ts.transpileModule(stripped, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, useDefineForClassFields: false },
    fileName: `gas/src/${file}.ts`,
  });
  if (out.diagnostics && out.diagnostics.length) {
    throw new Error(`轉譯 ${file}.ts 有錯：` + out.diagnostics.map((d) => d.messageText).join('; '));
  }
  return `// ——— gas/src/${file}.ts ———\n` + out.outputText;
}

function combinedSource() {
  const parts = moduleOrder().map(transpile);
  const all = parts.join('\n');
  const names = [...new Set([...all.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]))].sort();
  if (!names.length) throw new Error('合併後的原始碼裡沒有任何頂層 function → 入口會全部消失');
  if (!names.includes('doGet') || !names.includes('doPost')) throw new Error('doGet/doPost 沒被掃到：Web App 入口會不見');
  return { code: all + '\n', names };
}

const concat = {
  name: 'gas-combined-modules',
  resolveId(id) { return id.endsWith('gas/src/index.ts') || id === ENTRY_ID ? ENTRY_ID : null; },
  load(id) { if (id !== ENTRY_ID) return null; const { code, names } = combinedSource(); concat.names = names; return code; },
};

const copyManifest = {
  name: 'copy-appsscript-json',
  writeBundle() {
    if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
    copyFileSync(join('gas', 'appsscript.json'), join(DIST, 'appsscript.json'));
  },
};

export default {
  input: 'gas/src/index.ts',
  treeshake: false,   // GAS 各檔只有函式宣告，沒有被 import 的綁定；開 tree-shaking 會被搖成空殼
  plugins: [concat, copyManifest],
  output: {
    file: join(DIST, 'Code.gs'),
    format: 'es',          // 不包 IIFE：頂層函式就是 Apps Script 的全域入口
    sourcemap: false,
    banner: '// gas/dist/Code.gs — 由 rollup 從 gas/src/*.ts 產生，勿手改（改源碼再 npm run gas:build）',
  },
};

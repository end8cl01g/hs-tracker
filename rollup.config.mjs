// rollup.config.mjs — 前端：src/*.ts → build/app.js（一個檔）＋ build/sw.js
// 為什麼用 rollup：12 個 <script> 靠「載入順序」隐式相依（少一行就白卡），
// 打包後相依由 import 表達；另外 sw 的 PRECACHE 只需知道一個檔。
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import nodeResolve from '@rollup/plugin-node-resolve';

const PROD = process.env.NODE_ENV === 'production';
const ts = () => typescript({ tsconfig: './tsconfig.json', exclude: ['src/sw.ts'] });

export default [
  {
    input: 'src/main.ts',
    output: {
      file: 'build/app.js',
      format: 'iife',
      sourcemap: false,
      banner: '/* hs-tracker 前端 bundle：由 rollup 從 src/*.ts 產生，勿手改（改 src/ 再 npm run build） */',
    },
    plugins: [ts(), nodeResolve(), ...(PROD ? [terser({ format: { comments: false } })] : [])],
  },
  {
    // SW 不能 minify：scripts/build.mjs 要把 '__BUILD__' 換成 build 號（todo 1.8 的快取失效機制）
    input: 'src/sw.ts',
    output: { file: 'build/sw.js', format: 'iife', sourcemap: false },
    plugins: [typescript({ tsconfig: './tsconfig.sw.json', include: ['src/sw.ts'] })],
  },
];

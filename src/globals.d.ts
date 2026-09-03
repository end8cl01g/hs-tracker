// 建構期注入的兩個巨集：scripts/build.mjs 把 index.html 內嵌腳本裡的 __BUILD__ 換掉，
// 各模組用 window.BUILD 顯示版號（以前是 js/build-info.js，现在不需要獨立檔案）。
declare var BUILD: string;
declare var APP_VERSION: string;

// 本專案到處是 `$('id').value`／`.checked`／`.files`。DOM lib 的 HTMLElement 沒有這些，
// 用交集型別保留寫法（比 any 好：拼錯屬性名仍會報錯），但不要以為「每個元素都是 input」——
// 真正的修法是把取得元素收成 byId<HTMLInputElement>('x')，等這輪遷移站穩再收緊。
type El = HTMLElement & HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
declare function $(id: string): El;

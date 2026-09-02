# vendor/ — sql.js 自架（todo 1.2）

- 來源：`npm pack sql.js@1.14.2` → 取 `dist/sql-wasm.js`、`dist/sql-wasm.wasm`
- 為什麼放 repo 內而不用 cdnjs：原規格用 `https://cdnjs.cloudflare.com/.../1.10.2/`，
  在**首次離線**載入時 `initSqlJs` 直接 undefined → 卡在 loading 畫面；且 1.10.2 落後 npm latest（1.14.2）12 個小版。
- `js/db.js` 以 `locateFile: f => 'vendor/' + f` 對到这里；升級只要換這兩個檔。

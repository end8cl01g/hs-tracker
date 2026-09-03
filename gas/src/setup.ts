/**
 * setup.ts — 給「人」在 Apps Script 編輯器裡按的入口。
 *
 * 為什麼需要這隻（上一輪我把你帶坑了）：Apps Script 把「名字以底線結尾」的函式當成 private，
 * 它們不會出現在 Run（執行）下拉選單、也無法被 google.script.run 呼叫（官方文件 + 實測皆然）。
 * 本專案的函式清一色是 ensureSheets_ / doctor_ / bootstrapSecret_，所以下拉選單看起來「沒有函式可建表」。
 * ⇒ 人工要按的入口必須是 public 名字（無底線結尾），這個檔案就是那層殼。
 *
 * 兩隻函式都是冪等：可以重複按，第二次只是回報「已經建好了」。
 * 刻意不碰 SHARED_SECRET：輪替密鑰會讓 App 設定頁裡貼的那份立刻失效，那種事只該由部署腳本做。
 */

/** 建／修三張工作表（Changes、Backups、Meta），並顺手觸發 Google 的 scope 核准畫面。 */
function setupDatabase() {
  const props = PropertiesService.getScriptProperties();
  const hadSheet = !!props.getProperty('SHEET_ID');
  const r = ensureSheets_();
  const report = {
    ok: true,
    action: hadSheet ? '已開啟既有表格並覆核表頭' : '新建了雲端表格（SHEET_ID 已記入 Project Properties）',
    sheets: r.sheets,
    secret_configured: !!props.getProperty('SHARED_SECRET'),
    at: nowISO_(),
  };
  Logger.log('setupDatabase → ' + JSON.stringify(report));
  return report;
}

/** 診斷（public 版的 doctor_）：權限／設定／設定檔抓取一次看完，不會改動任何東西。 */
function runDoctor() {
  const report = doctor_();
  Logger.log('runDoctor → ' + JSON.stringify(report));
  return report;
}

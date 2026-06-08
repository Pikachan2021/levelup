/**
 * シート内ボタン式 ワンタップ打刻（Google Apps Script）
 * ------------------------------------------------------------
 * スプレッドシート上に挿入した「図形ボタン」にこのスクリプトの関数を
 * 割り当てて使う。ボタンをクリックすると「Emeli T＆C」シートの
 * 今日の日付の行・該当列に現在時刻が入力される。別ページは開かない。
 *
 * ＜割り当てる関数名＞（図形ボタンに 1 つずつ割り当てる）
 *   punch_emeli_packing     えーめり / パッキング
 *   punch_emeli_company     えーめり / かんぱにワーク
 *   punch_markus_packing    マルクス / パッキング
 *   punch_markus_company    マルクス / かんぱにワーク
 *   punch_tuomas_packing    Tuomas  / パッキング
 *   punch_tuomas_company    Tuomas  / かんぱにワーク
 *   punch_antti_packing     Antti   / パッキング
 *   punch_antti_company     Antti   / かんぱにワーク
 */

// ===================== 設定 =====================
var CONFIG = {
  SHEET_NAME: 'Emeli T＆C', // 書き込む対象タブ名（実タブ名と一致させる）
  DATE_COL: 1,              // 日付(1〜31)が入っている列（A=1）
  TIME_ZONE: 'Europe/Helsinki',
  ON_EXISTING: 'append',    // 既存値があるとき: 'append'（追記） / 'overwrite'（上書き）

  // スタッフ -> 表示名と各項目の列番号（A=1, B=2, ...）
  STAFF: {
    emeli:  { name: 'えーめり', items: { 'パッキング': 2, 'かんぱにワーク': 3 } }, // B, C
    markus: { name: 'マルクス', items: { 'パッキング': 4, 'かんぱにワーク': 5 } }, // D, E
    tuomas: { name: 'Tuomas',   items: { 'パッキング': 6, 'かんぱにワーク': 7 } }, // F, G
    antti:  { name: 'Antti',    items: { 'パッキング': 8, 'かんぱにワーク': 9 } }  // H, I
  }
};
// ================================================

// ---- 図形ボタンに割り当てる関数（引数を取れないので個別に用意）----
function punch_emeli_packing()  { punch_('emeli',  'パッキング'); }
function punch_emeli_company()  { punch_('emeli',  'かんぱにワーク'); }
function punch_markus_packing() { punch_('markus', 'パッキング'); }
function punch_markus_company() { punch_('markus', 'かんぱにワーク'); }
function punch_tuomas_packing() { punch_('tuomas', 'パッキング'); }
function punch_tuomas_company() { punch_('tuomas', 'かんぱにワーク'); }
function punch_antti_packing()  { punch_('antti',  'パッキング'); }
function punch_antti_company()  { punch_('antti',  'かんぱにワーク'); }

/**
 * 打刻本体。今日の行・該当列に現在時刻を書き込み、画面右下にトースト表示。
 * 直前の状態を保存しておき「取り消し」できるようにする。
 */
function punch_(staffKey, item) {
  var lock = LockService.getDocumentLock();
  try { lock.waitLock(10000); } catch (e) {
    toast_('混み合っています。もう一度押してください'); return;
  }
  try {
    var ctx = resolveTarget_(staffKey, item);
    var now = nowHHmm_();
    var cell = ctx.sheet.getRange(ctx.row, ctx.col);
    var prev = cell.getValue();

    var newValue;
    if (prev === '' || prev === null) newValue = now;
    else if (CONFIG.ON_EXISTING === 'overwrite') newValue = now;
    else newValue = String(prev) + ', ' + now;

    cell.setValue(newValue);
    rememberLast_(ctx.row, ctx.col, prev);
    toast_('✓ ' + ctx.staffName + ' ' + item + '  ' + now);
  } catch (err) {
    toast_('エラー: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

/** 直前の打刻を取り消す（メニューから実行）。 */
function undoLast() {
  var props = PropertiesService.getUserProperties();
  var raw = props.getProperty('lastPunch');
  if (!raw) { toast_('取り消す打刻がありません'); return; }
  var last = JSON.parse(raw);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  sheet.getRange(last.row, last.col).setValue(last.prev);
  props.deleteProperty('lastPunch');
  toast_('↩ 直前の打刻を取り消しました');
}

/** スプレッドシートを開いたときにメニューを追加。 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⏱ 打刻')
    .addItem('直前の打刻を取り消す', 'undoLast')
    .addToUi();
}

// ===================== 内部ヘルパー =====================

function resolveTarget_(staffKey, item) {
  var staff = CONFIG.STAFF[staffKey];
  if (!staff) throw new Error('不明なスタッフ: ' + staffKey);
  var col = staff.items[item];
  if (!col) throw new Error('不明な項目: ' + item);

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('シートが見つかりません: ' + CONFIG.SHEET_NAME);

  var row = findTodayRow_(sheet);
  if (!row) throw new Error('今日の日付の行が見つかりません');

  return { sheet: sheet, row: row, col: col, staffName: staff.name };
}

/** 日付列から今日の「日」(1〜31)に一致する行番号を返す。なければ 0。 */
function findTodayRow_(sheet) {
  var today = new Date();
  var todayDay = today.getDate();
  var values = sheet.getRange(1, CONFIG.DATE_COL, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v === '' || v === null) continue;
    var day = null;
    if (v instanceof Date) {
      if (v.getFullYear() === today.getFullYear() && v.getMonth() === today.getMonth()) day = v.getDate();
    } else if (typeof v === 'number') {
      day = v;
    } else {
      var n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n)) day = n;
    }
    if (day === todayDay) return i + 1;
  }
  return 0;
}

function rememberLast_(row, col, prev) {
  PropertiesService.getUserProperties()
    .setProperty('lastPunch', JSON.stringify({ row: row, col: col, prev: prev }));
}

function nowHHmm_() {
  return Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'HH:mm');
}

function toast_(msg) {
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, '打刻', 4);
}

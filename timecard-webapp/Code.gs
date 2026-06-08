/**
 * ワンタップ打刻 Web アプリ（Google Apps Script）
 * ------------------------------------------------------------
 * スタッフは自分専用 URL を開き、項目ボタンをタップするだけで
 * 「Emeli T＆C」シートの当日行・該当列に現在時刻が入力される。
 *
 * URL 例:
 *   https://script.google.com/.../exec?staff=emeli&token=xxxx
 *
 * 設定は下の CONFIG をいじるだけで列・項目・スタッフを変更できる。
 */

// ===================== 設定 =====================
var CONFIG = {
  // 書き込む対象シート名（タブ名）
  SHEET_NAME: 'Emeli T＆C',

  // 日付（1〜31）が入っている列（A 列 = 1）
  DATE_COL: 1,

  // 不正書き込み防止用の合言葉。URL の &token= と一致しないと拒否する。
  // ※必ず推測されにくい文字列に変更すること。
  TOKEN: 'CHANGE_ME_1234',

  // 表示するタイムゾーン（時刻フォーマット用）
  TIME_ZONE: 'Europe/Helsinki',

  // 既存セルに値があるときの動作: 'append'（追記） or 'overwrite'（上書き）
  ON_EXISTING: 'append',

  // スタッフ定義: キー -> 表示名と各項目の列番号（A=1, B=2, ...）
  // 項目名（パッキング / かんぱにワーク）はボタン表示にもそのまま使う。
  STAFF: {
    emeli:  { name: 'えーめり', items: { 'パッキング': 2, 'かんぱにワーク': 3 } }, // B, C
    markus: { name: 'マルクス', items: { 'パッキング': 4, 'かんぱにワーク': 5 } }, // D, E
    tuomas: { name: 'Tuomas',   items: { 'パッキング': 6, 'かんぱにワーク': 7 } }, // F, G
    antti:  { name: 'Antti',    items: { 'パッキング': 8, 'かんぱにワーク': 9 } }  // H, I
  }
};
// ================================================

/**
 * Web アプリ表示。?staff=xxx で対象スタッフを切り替える。
 */
function doGet(e) {
  var staffKey = (e && e.parameter && e.parameter.staff) ? String(e.parameter.staff) : '';
  var token = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  var staff = CONFIG.STAFF[staffKey];

  var t = HtmlService.createTemplateFromFile('Index');
  t.staffKey = staffKey;
  t.token = token;
  t.staffName = staff ? staff.name : '';
  t.items = staff ? Object.keys(staff.items) : [];
  t.valid = !!staff;

  return t.evaluate()
    .setTitle('打刻 - ' + (staff ? staff.name : '未設定'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 打刻を記録する（クライアントから google.script.run で呼ばれる）。
 * @param {string} staffKey  スタッフキー（emeli など）
 * @param {string} item      項目名（パッキング など）
 * @param {string} token     合言葉
 * @return {{ok:boolean, message:string, value:string}}
 */
function recordPunch(staffKey, item, token) {
  return withLock_(function () {
    validateToken_(token);
    var ctx = resolveTarget_(staffKey, item);
    var now = nowHHmm_();

    var cell = ctx.sheet.getRange(ctx.row, ctx.col);
    var existing = cell.getValue();
    var newValue;
    if (existing === '' || existing === null) {
      newValue = now;
    } else if (CONFIG.ON_EXISTING === 'overwrite') {
      newValue = now;
    } else {
      newValue = String(existing) + ', ' + now; // append
    }
    cell.setValue(newValue);

    return {
      ok: true,
      message: '✓ ' + ctx.staffName + ' ' + item + ' ' + now + ' を記録しました',
      value: newValue
    };
  });
}

/**
 * 直前の打刻を1つ取り消す（該当セルの最後の時刻を削除）。
 */
function undoPunch(staffKey, item, token) {
  return withLock_(function () {
    validateToken_(token);
    var ctx = resolveTarget_(staffKey, item);
    var cell = ctx.sheet.getRange(ctx.row, ctx.col);
    var existing = cell.getValue();

    if (existing === '' || existing === null) {
      return { ok: false, message: '取り消す打刻がありません', value: '' };
    }
    var parts = String(existing).split(',').map(function (s) { return s.trim(); }).filter(String);
    var removed = parts.pop();
    var newValue = parts.join(', ');
    cell.setValue(newValue);

    return {
      ok: true,
      message: '↩ ' + ctx.staffName + ' ' + item + ' ' + removed + ' を取り消しました',
      value: newValue
    };
  });
}

// ===================== 内部ヘルパー =====================

function validateToken_(token) {
  if (CONFIG.TOKEN && String(token) !== String(CONFIG.TOKEN)) {
    throw new Error('アクセスが許可されていません（token 不正）');
  }
}

/**
 * staff/item から書き込み先の sheet/row/col を求める。
 */
function resolveTarget_(staffKey, item) {
  var staff = CONFIG.STAFF[staffKey];
  if (!staff) throw new Error('不明なスタッフです: ' + staffKey);
  var col = staff.items[item];
  if (!col) throw new Error('不明な項目です: ' + item);

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('シートが見つかりません: ' + CONFIG.SHEET_NAME);

  var row = findTodayRow_(sheet);
  if (!row) throw new Error('今日の日付の行が見つかりませんでした');

  return { sheet: sheet, row: row, col: col, staffName: staff.name };
}

/**
 * 日付列を上から探索し、今日の「日」(1〜31) に一致する行番号を返す。
 * セルが数値(1〜31)でも Date 型でも一致判定する。見つからなければ 0。
 */
function findTodayRow_(sheet) {
  var today = new Date();
  var todayDay = today.getDate();
  var values = sheet.getRange(1, CONFIG.DATE_COL, sheet.getLastRow(), 1).getValues();

  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v === '' || v === null) continue;
    var day = null;
    if (v instanceof Date) {
      // 同じ月・年のときのみ採用（年跨ぎの誤爆を防ぐ）
      if (v.getFullYear() === today.getFullYear() && v.getMonth() === today.getMonth()) {
        day = v.getDate();
      }
    } else if (typeof v === 'number') {
      day = v;
    } else {
      var n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n)) day = n;
    }
    if (day === todayDay) return i + 1; // 1-indexed
  }
  return 0;
}

function nowHHmm_() {
  return Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'HH:mm');
}

/**
 * 同時書き込みによる取りこぼしを防ぐためのロック付き実行。
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return { ok: false, message: '混み合っています。もう一度押してください', value: '' };
  }
  try {
    return fn();
  } catch (err) {
    return { ok: false, message: 'エラー: ' + err.message, value: '' };
  } finally {
    lock.releaseLock();
  }
}

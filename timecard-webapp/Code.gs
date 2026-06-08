/**
 * ワンタップ作業ログ Web アプリ（Google Apps Script）— スロット方式
 * ------------------------------------------------------------
 * スタッフは自分専用 URL を開き、作業ボタンをクリックするだけで、
 * 対象シートの「今日の行」の次の空きスロット（列）に
 *   ・上段の行 … 作業名
 *   ・下段の行 … 現在時刻
 * が入る（実シートと同じ「1日=2行・左から順に埋める」レイアウト）。
 *
 * URL 例:
 *   https://script.google.com/.../exec?staff=emeli&token=xxxx
 *
 * ※ 行・列の位置はシートに合わせて下の CONFIG で調整する。
 *    まずはテスト用コピーで testToday() を実行して検出結果を確認すること。
 */

// ===================== 設定 =====================
var CONFIG = {
  // 不正書き込み防止用の合言葉。URL の &token= と一致しないと拒否する。必ず変更。
  TOKEN: 'CHANGE_ME_1234',

  TIME_ZONE: 'Europe/Helsinki',
  TIME_FORMAT: 'HH:mm:ss',   // 記録する時刻の書式（例 09:39:32）

  DATE_COL: 1,        // 日付が入っている列（A=1）
  FIRST_SLOT_COL: 3,  // 最初のスロット列（C=3）
  LAST_SLOT_COL: 40,  // スロットを探す右端の列（多めでOK）
  TIME_ROW_OFFSET: 1, // 時刻を書く行 = 作業行 + この値（下の行なら 1）

  // ボタンに出す作業項目（UI 表示・英語）。シートのプルダウン候補と一致させる。
  TASKS: {
    work:  ['morning meeting', 'Order printing', 'Picking', 'Packing', 'Labeling', 'Scanning', 'Company work', 'other work'],
    other: ['Teaching', 'meeting', 'Registering', 'cleaning', 'shelving', 'trash', 'Lounas', 'Tauko']
  },

  // スタッフ -> 表示名と書き込み先シート名（タブ名）
  STAFF: {
    emeli:  { name: 'Eemeli', sheet: 'Emeli'  },
    markus: { name: 'Markus', sheet: 'Markus' },
    tuomas: { name: 'Tuomas', sheet: 'Tuomas' },
    antti:  { name: 'Antti',  sheet: 'Antti'  }
  }
};
// ================================================

/** Web アプリ表示。?staff=xxx で対象スタッフを切り替える。 */
function doGet(e) {
  var staffKey = (e && e.parameter && e.parameter.staff) ? String(e.parameter.staff) : '';
  var token = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  var staff = CONFIG.STAFF[staffKey];

  var t = HtmlService.createTemplateFromFile('Index');
  t.staffKey = staffKey;
  t.token = token;
  t.staffName = staff ? staff.name : '';
  t.workTasks = CONFIG.TASKS.work;
  t.otherTasks = CONFIG.TASKS.other;
  t.valid = !!staff;

  return t.evaluate()
    .setTitle('Time Entry - ' + (staff ? staff.name : 'Not set'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 作業を打刻する。今日の行の次の空きスロットに作業名を、その下に現在時刻を書く。
 * @return {{ok:boolean, message:string, slot:number}}
 */
function recordPunch(staffKey, task, token) {
  return withLock_(function () {
    validateToken_(token);
    var ctx = resolveSheet_(staffKey);
    var taskRow = findTodayRow_(ctx.sheet);
    if (!taskRow) throw new Error("Could not find today's date row");

    var col = findNextEmptySlot_(ctx.sheet, taskRow);
    if (!col) throw new Error('No empty slot left for today');

    var now = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, CONFIG.TIME_FORMAT);
    ctx.sheet.getRange(taskRow, col).setValue(task);
    ctx.sheet.getRange(taskRow + CONFIG.TIME_ROW_OFFSET, col).setValue(now);

    var slotNo = col - CONFIG.FIRST_SLOT_COL + 1;
    return { ok: true, message: '✓ ' + task + ' · ' + now + ' (slot ' + slotNo + ')', slot: slotNo };
  });
}

/** 直前（今日の一番右の埋まったスロット）を取り消す。 */
function undoPunch(staffKey, token) {
  return withLock_(function () {
    validateToken_(token);
    var ctx = resolveSheet_(staffKey);
    var taskRow = findTodayRow_(ctx.sheet);
    if (!taskRow) throw new Error("Could not find today's date row");

    var col = findLastFilledSlot_(ctx.sheet, taskRow);
    if (!col) return { ok: false, message: 'Nothing to undo', slot: 0 };

    var task = ctx.sheet.getRange(taskRow, col).getValue();
    ctx.sheet.getRange(taskRow, col).clearContent();
    ctx.sheet.getRange(taskRow + CONFIG.TIME_ROW_OFFSET, col).clearContent();

    var slotNo = col - CONFIG.FIRST_SLOT_COL + 1;
    return { ok: true, message: '↩ removed ' + task + ' (slot ' + slotNo + ')', slot: slotNo };
  });
}

/**
 * 設定確認用。エディタで実行し、ログで「今日の行/次の空きスロット」を確認する。
 * （対象シートはコード内の staffKey を必要に応じて変更）
 */
function testToday() {
  var ctx = resolveSheet_('emeli');
  var taskRow = findTodayRow_(ctx.sheet);
  var col = taskRow ? findNextEmptySlot_(ctx.sheet, taskRow) : 0;
  Logger.log('sheet=%s todayTaskRow=%s timeRow=%s nextSlotCol=%s',
    ctx.sheet.getName(), taskRow, taskRow ? (taskRow + CONFIG.TIME_ROW_OFFSET) : '-', col);
}

// ===================== 内部ヘルパー =====================

function validateToken_(token) {
  if (CONFIG.TOKEN && String(token) !== String(CONFIG.TOKEN)) {
    throw new Error('Access denied (invalid token)');
  }
}

function resolveSheet_(staffKey) {
  var staff = CONFIG.STAFF[staffKey];
  if (!staff) throw new Error('Unknown staff: ' + staffKey);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(staff.sheet);
  if (!sheet) throw new Error('Sheet not found: ' + staff.sheet);
  return { sheet: sheet, staffName: staff.name };
}

/** 日付列を上から探索し、今日に一致する行番号（=作業行）を返す。なければ 0。 */
function findTodayRow_(sheet) {
  var today = new Date();
  var values = sheet.getRange(1, CONFIG.DATE_COL, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v === '' || v === null) continue;
    if (sameDay_(v, today)) return i + 1;
  }
  return 0;
}

/** セル値（Date / 数値 / "6/8(月)" 等の文字列）が today と同じ月日かどうか。 */
function sameDay_(v, today) {
  if (v instanceof Date) {
    return v.getFullYear() === today.getFullYear() && v.getMonth() === today.getMonth() && v.getDate() === today.getDate();
  }
  var m = String(v).match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/); // "6/8" や "6月8日"
  if (m) {
    return parseInt(m[1], 10) === (today.getMonth() + 1) && parseInt(m[2], 10) === today.getDate();
  }
  return false;
}

/** 作業行で FIRST..LAST のうち最初の空きスロット列を返す。なければ 0。 */
function findNextEmptySlot_(sheet, taskRow) {
  var last = Math.min(CONFIG.LAST_SLOT_COL, sheet.getMaxColumns());
  var n = last - CONFIG.FIRST_SLOT_COL + 1;
  var row = sheet.getRange(taskRow, CONFIG.FIRST_SLOT_COL, 1, n).getValues()[0];
  for (var i = 0; i < row.length; i++) {
    if (row[i] === '' || row[i] === null) return CONFIG.FIRST_SLOT_COL + i;
  }
  return 0;
}

/** 作業行で一番右の埋まったスロット列を返す。なければ 0。 */
function findLastFilledSlot_(sheet, taskRow) {
  var last = Math.min(CONFIG.LAST_SLOT_COL, sheet.getMaxColumns());
  var n = last - CONFIG.FIRST_SLOT_COL + 1;
  var row = sheet.getRange(taskRow, CONFIG.FIRST_SLOT_COL, 1, n).getValues()[0];
  for (var i = row.length - 1; i >= 0; i--) {
    if (row[i] !== '' && row[i] !== null) return CONFIG.FIRST_SLOT_COL + i;
  }
  return 0;
}

function withLock_(fn) {
  var lock = LockService.getDocumentLock();
  try { lock.waitLock(10000); }
  catch (e) { return { ok: false, message: 'Busy, please click again', slot: 0 }; }
  try { return fn(); }
  catch (err) { return { ok: false, message: 'Error: ' + err.message, slot: 0 }; }
  finally { lock.releaseLock(); }
}

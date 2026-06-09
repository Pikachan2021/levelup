/**
 * ワンタップ作業ログ Web アプリ（Google Apps Script）— 名前T＆Cシート方式
 * ------------------------------------------------------------
 * スタッフは自分専用 URL を開き、作業ボタンをクリックするだけで、
 * 「名前T＆C」シートの今日の行に、次の空きスロット（列 C, D, E…）として
 *   ・作業名 → 日付のある行（＝下の行）
 *   ・現在時刻 → その1つ上の行
 * が入る（実シートの構造に合わせた配置）。
 *
 * URL 例:
 *   https://script.google.com/.../exec?staff=markus&token=xxxx
 *
 * まずはテスト用コピーで testWrite() を実行して、MarkusT＆C に
 * 正しく入るか確認すること。
 */

// ===================== 設定 =====================
var CONFIG = {
  // 不正書き込み防止用の合言葉。URL の &token= と一致しないと拒否する。必ず変更。
  TOKEN: 'CHANGE_ME_1234',

  DATE_COL: 1,         // 日付が入っている列（A=1）＝作業名を書く行
  FIRST_SLOT_COL: 3,   // 最初のスロット列（C=3。B列は空き）
  LAST_SLOT_COL: 40,   // スロットを探す右端の列
  TIME_ROW_OFFSET: -1, // 時刻を書く行 = 日付(作業)行 + この値（1つ上なら -1）

  // ボタンに出す作業項目。シートのプルダウン候補に合わせてある。
  TASKS: {
    work:  ['morning meeting', 'Order printing', 'Picking', 'Packing', 'Labeling', 'Scanning', 'Company work', 'other work'],
    other: ['Lounas', 'Tauko', 'Teaching', 'meeting', 'Registering', 'cleaning', 'shelving', 'trash', 'Finish working']
  },

  // スタッフ -> 表示名と書き込み先シート名（実タブ名に厳密一致させること）
  //   ※ ＆ は全角、DeaT&C だけ半角 & なので注意（diagnose のログより）
  STAFF: {
    emeli:  { name: 'Eemeli', sheet: 'Emeli T＆C'  },
    tuomas: { name: 'Tuomas', sheet: 'TuomasT＆C' },
    markus: { name: 'Markus', sheet: 'MarkusT＆C' },
    matti:  { name: 'Matti',  sheet: 'MattiT＆C'  },
    juhani: { name: 'Juhani', sheet: 'JuhaniT＆C' },
    dea:    { name: 'Dea',    sheet: 'DeaT&C'     }
  },

  // true: STAFF 未登録のキーは「そのキー＝シート名」として受け付ける。
  //   新スタッフは ?staff=<その人のT＆Cタブ名> で使える（例 ?staff=MiroT＆C ではなく実タブ名）。
  ALLOW_ANY_SHEET: true
};
// ================================================

/** Web アプリ表示。?staff=xxx で対象スタッフを切り替える。 */
function doGet(e) {
  var staffKey = (e && e.parameter && e.parameter.staff) ? String(e.parameter.staff) : '';
  var token = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  var staff = getStaffInfo_(staffKey);

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
 * 打刻本体（共通）。今日の行の次の空きスロットに、作業名と現在時刻を書く。
 * @return {{ok:boolean, message:string, col:number, name:string}}
 */
function doPunch_(staffKey, task) {
  var info = getStaffInfo_(staffKey);
  if (!info) throw new Error('Unknown staff: ' + staffKey);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(info.sheet);
  if (!sheet) throw new Error('Sheet not found: ' + info.sheet);

  var dateRow = findTodayRow_(sheet);
  if (!dateRow) throw new Error("Could not find today's date row");
  var timeRow = dateRow + CONFIG.TIME_ROW_OFFSET;
  if (timeRow < 1) throw new Error('Time row out of range');

  // 次の空きスロット = 時刻行で最初に空いている列（時刻が貯まっていく行を基準にする）
  var col = findNextEmptySlot_(sheet, timeRow);
  if (!col) throw new Error('No empty slot left for today');

  sheet.getRange(dateRow, col).setValue(task);        // 作業名 → 日付(作業)行
  var timeCell = sheet.getRange(timeRow, col);
  timeCell.setValue(new Date());                       // 現在時刻 → その1つ上の行（実日時）
  // 時刻の表示書式を、同じ行の先頭スロットに合わせる（なければ既定のまま）
  try {
    var refFmt = sheet.getRange(timeRow, CONFIG.FIRST_SLOT_COL).getNumberFormat();
    if (refFmt) timeCell.setNumberFormat(refFmt);
  } catch (e) {}

  return { ok: true, message: '✓ ' + info.name + ' · ' + task + ' (slot ' + columnLetter_(col) + ')', col: col, name: info.name };
}

/** Web から呼ばれる打刻（token チェック＋ロック付き）。 */
function recordPunch(staffKey, task, token) {
  return withLock_(function () {
    validateToken_(token);
    return doPunch_(staffKey, task);
  });
}

/** 直前のスロットを取り消す。col はクライアントが覚えている直近の列。 */
function undoPunch(staffKey, col, token) {
  return withLock_(function () {
    validateToken_(token);
    var info = getStaffInfo_(staffKey);
    if (!info) throw new Error('Unknown staff: ' + staffKey);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(info.sheet);
    if (!sheet) throw new Error('Sheet not found: ' + info.sheet);
    var dateRow = findTodayRow_(sheet);
    if (!dateRow) throw new Error("Could not find today's date row");
    var timeRow = dateRow + CONFIG.TIME_ROW_OFFSET;

    var c = parseInt(col, 10);
    if (!c) c = findLastFilledSlot_(sheet, timeRow); // 指定が無ければ一番右
    if (!c) return { ok: false, message: 'Nothing to undo', col: 0 };

    var task = sheet.getRange(dateRow, c).getValue();
    sheet.getRange(dateRow, c).clearContent();
    sheet.getRange(timeRow, c).clearContent();
    return { ok: true, message: '↩ removed ' + (task || '') + ' (slot ' + columnLetter_(c) + ')', col: c };
  });
}

// ===================== テスト・診断 =====================

/** コピーで実行 → MarkusT＆C に「Packing＋現在時刻」を1件テスト書き込み。 */
function testWrite() {
  var res = doPunch_('markus', 'Packing');
  Logger.log('testWrite -> %s', JSON.stringify(res));
}

/** 今日の行まわりを確認（MarkusT＆C と Markus のヘッダー＋今日付近）。 */
function inspect() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['MarkusT＆C', 'Markus'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { Logger.log('NO SHEET "%s"', name); return; }
    var ncols = Math.min(16, sh.getMaxColumns());
    Logger.log('=== "%s" header rows 1-6 ===', name);
    var head = sh.getRange(1, 1, 6, ncols).getValues();
    for (var i = 0; i < head.length; i++) Logger.log('  h%s: %s', i + 1, JSON.stringify(head[i]));
    var row = findTodayRow_(sh);
    Logger.log('--- "%s" todayRow=%s window ---', name, row);
    if (!row) return;
    var r0 = Math.max(1, row - 3);
    var win = sh.getRange(r0, 1, 6, ncols).getValues();
    for (var j = 0; j < win.length; j++) Logger.log('  r%s: %s', r0 + j, JSON.stringify(win[j]));
  });
}

// ===================== 内部ヘルパー =====================

function validateToken_(token) {
  if (CONFIG.TOKEN && String(token) !== String(CONFIG.TOKEN)) {
    throw new Error('Access denied (invalid token)');
  }
}

function getStaffInfo_(staffKey) {
  if (!staffKey) return null;
  if (CONFIG.STAFF[staffKey]) return CONFIG.STAFF[staffKey];
  if (CONFIG.ALLOW_ANY_SHEET) return { name: staffKey, sheet: staffKey };
  return null;
}

/** 日付列を上から探索し、今日に一致する行番号（=作業名の行）を返す。なければ 0。 */
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

function sameDay_(v, today) {
  if (v instanceof Date) {
    return v.getFullYear() === today.getFullYear() && v.getMonth() === today.getMonth() && v.getDate() === today.getDate();
  }
  var m = String(v).match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if (m) return parseInt(m[1], 10) === (today.getMonth() + 1) && parseInt(m[2], 10) === today.getDate();
  return false;
}

/** 指定行で FIRST..LAST のうち最初の空きスロット列を返す。なければ 0。 */
function findNextEmptySlot_(sheet, row) {
  var last = Math.min(CONFIG.LAST_SLOT_COL, sheet.getMaxColumns());
  var n = last - CONFIG.FIRST_SLOT_COL + 1;
  var vals = sheet.getRange(row, CONFIG.FIRST_SLOT_COL, 1, n).getValues()[0];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i] === '' || vals[i] === null) return CONFIG.FIRST_SLOT_COL + i;
  }
  return 0;
}

/** 指定行で一番右の埋まったスロット列を返す。なければ 0。 */
function findLastFilledSlot_(sheet, row) {
  var last = Math.min(CONFIG.LAST_SLOT_COL, sheet.getMaxColumns());
  var n = last - CONFIG.FIRST_SLOT_COL + 1;
  var vals = sheet.getRange(row, CONFIG.FIRST_SLOT_COL, 1, n).getValues()[0];
  for (var i = vals.length - 1; i >= 0; i--) {
    if (vals[i] !== '' && vals[i] !== null) return CONFIG.FIRST_SLOT_COL + i;
  }
  return 0;
}

function columnLetter_(col) {
  var s = '';
  while (col > 0) { var m = (col - 1) % 26; s = String.fromCharCode(65 + m) + s; col = (col - m - 1) / 26; }
  return s;
}

function withLock_(fn) {
  var lock = LockService.getDocumentLock();
  try { lock.waitLock(10000); }
  catch (e) { return { ok: false, message: 'Busy, please click again', col: 0 }; }
  try { return fn(); }
  catch (err) { return { ok: false, message: 'Error: ' + err.message, col: 0 }; }
  finally { lock.releaseLock(); }
}

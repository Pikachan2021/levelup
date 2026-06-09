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

  DATE_COL: 1,         // 日付が入っている列（A=1）＝作業名を書く行（上の行）
  FIRST_SLOT_COL: 3,   // 最初のスロット列（C=3。B列は空き）
  LAST_SLOT_COL: 40,   // スロットを探す右端の列
  TIME_ROW_OFFSET: 1,  // 時刻を書く行 = 日付(作業)行 + この値（1つ下なら 1）

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

  // true: STAFF 未登録の名前でも、その名前から「名前T＆C」タブを自動で探して使う。
  //   → 新スタッフは ?staff=名前 を渡すだけ（例 ?staff=Liisa → LiisaT＆C を自動で発見）。コード編集不要。
  // false: STAFF に登録した人だけ許可（厳格運用）。
  ALLOW_ANY_SHEET: true
};
// ================================================

/** Web アプリ表示。?staff=xxx で対象スタッフを切り替える。 */
function doGet(e) {
  var staffKey = (e && e.parameter && e.parameter.staff) ? String(e.parameter.staff) : '';
  var token = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  var staff = resolveStaff_(staffKey);

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
  var info = resolveStaff_(staffKey);
  if (!info) throw new Error('Unknown staff / sheet not found: ' + staffKey);
  var sheet = info.sheet;

  var dateRow = findTodayRow_(sheet);
  if (!dateRow) throw new Error("Could not find today's date row");
  var timeRow = dateRow + CONFIG.TIME_ROW_OFFSET; // 時刻はすぐ下の行（隣接）
  if (timeRow < 1) throw new Error('Time row out of range');

  // 次の空きスロット（作業・時刻が両方空く最初の列）。読み込みは下でまとめて1回。
  var col = nextPairedSlot_(sheet, dateRow, timeRow);
  if (!col) throw new Error('No empty slot left for today');

  // 作業名(上)と時刻(下)は隣り合う2行なので、1回の setValues でまとめて書く（高速化）。
  sheet.getRange(Math.min(dateRow, timeRow), col, 2, 1)
       .setValues(dateRow < timeRow ? [[task], [new Date()]] : [[new Date()], [task]]);
  sheet.getRange(timeRow, col).setNumberFormat('H:mm:ss'); // 時刻表示（読み取りなしで固定指定）

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
    var info = resolveStaff_(staffKey);
    if (!info) throw new Error('Unknown staff / sheet not found: ' + staffKey);
    var sheet = info.sheet;
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

/**
 * staffKey から {name, sheet(=Sheetオブジェクト)} を返す。見つからなければ null。
 * - STAFF に登録があればその sheet 名を使う。
 * - 未登録でも ALLOW_ANY_SHEET なら、キーから「名前T＆C」タブを自動で探す
 *   （例 ?staff=Liisa → "LiisaT＆C" / "Liisa T＆C" / "LiisaT&C" などを順に探す）。
 *   → 新スタッフはタブを用意して ?staff=名前 を渡すだけ。コード編集は不要。
 */
function resolveStaff_(staffKey) {
  if (!staffKey) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = CONFIG.STAFF[staffKey];
  if (cfg) {
    var sh = ss.getSheetByName(cfg.sheet);
    return sh ? { name: cfg.name, sheet: sh } : null;
  }
  if (!CONFIG.ALLOW_ANY_SHEET) return null;
  var candidates = [staffKey, staffKey + 'T＆C', staffKey + ' T＆C', staffKey + 'T&C', staffKey + ' T&C'];
  for (var i = 0; i < candidates.length; i++) {
    var s = ss.getSheetByName(candidates[i]);
    if (s) return { name: staffKey, sheet: s };
  }
  return null;
}

/**
 * 日付列を上から探索し、今日に一致する行番号（=作業名の行）を返す。なければ 0。
 * 判定は「スプレッドシートのタイムゾーン」で行う（＝シートに表示されている日付に合わせる）。
 * これをしないと、21:00 等のオフセット付き日付値で1日ずれた行を拾ってしまう。
 */
function findTodayRow_(sheet) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  // キャッシュ：同じシート・同じ日付なら、行スキャンを省いて即返す（高速化）。
  var cache = CacheService.getScriptCache();
  var key = 'row:' + sheet.getName() + ':' + todayStr;
  var hit = cache.get(key);
  if (hit) return parseInt(hit, 10);

  var values = sheet.getRange(1, CONFIG.DATE_COL, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v === '' || v === null) continue;
    var found = 0;
    if (v instanceof Date) {
      if (Utilities.formatDate(v, tz, 'yyyy-MM-dd') === todayStr) found = i + 1;
    } else {
      var m = String(v).match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/); // "6/9(火)" や "6月9日"
      if (m) {
        var md = ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
        if (todayStr.slice(5) === md) found = i + 1;
      }
    }
    if (found) {
      cache.put(key, String(found), 21600); // 6時間キャッシュ（日付が変わればキーも変わる）
      return found;
    }
  }
  return 0;
}

/**
 * 作業行・時刻行の両方が空いている最初の列を返す（既存を上書きしない）。なければ 0。
 * 右端に数式等が入っていても、左から最初の「両方空き」を選ぶので影響を受けない。
 */
function nextPairedSlot_(sheet, taskRow, timeRow) {
  var last = Math.min(CONFIG.LAST_SLOT_COL, sheet.getMaxColumns());
  var n = last - CONFIG.FIRST_SLOT_COL + 1;
  var top = Math.min(taskRow, timeRow);
  var block = sheet.getRange(top, CONFIG.FIRST_SLOT_COL, 2, n).getValues(); // 2行を1回で読む
  var ti = (taskRow === top) ? 0 : 1;
  var mi = (timeRow === top) ? 0 : 1;
  for (var i = 0; i < n; i++) {
    var taskEmpty = (block[ti][i] === '' || block[ti][i] === null);
    var timeEmpty = (block[mi][i] === '' || block[mi][i] === null);
    if (taskEmpty && timeEmpty) return CONFIG.FIRST_SLOT_COL + i;
  }
  return 0;
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

/*******************************************************************
 * โก๋ในซอย HR Hub — 12_AdminApi.gs
 * หลังบ้านของ "แผงควบคุม HR" (admin.html)
 * -----------------------------------------------------------------
 * ★ ทำไมไฟล์นี้ถึงมีอยู่
 *   งานของ HR ทั้ง 28 อย่างในระบบนี้อยู่ในเมนูของ Google Sheets ทั้งหมด
 *   ซึ่งแอป Sheets บนมือถือ "ไม่แสดงเมนูที่เขียนเอง และไม่แสดง getUi() dialog"
 *   แปลว่า HR ทำงานจากโทรศัพท์ไม่ได้เลยแม้แต่อย่างเดียว ต้องกลับไปหน้าคอม
 *   และการตอบเรื่องพนักงานหนึ่งเรื่องต้องเลื่อนผ่านคอลัมน์ lineUserId ทุกครั้ง
 *
 *   อีกเรื่องที่ใหญ่กว่า: ชีตไม่มีระบบสิทธิ์ ใครที่แก้ชีตได้ = ปลดพนักงานได้
 *   อ่านเรื่องร้องเรียนลับได้ และยิงข้อความฉุกเฉินจนโควตาหมดได้
 *   ไฟล์นี้คือทางที่ทำให้ "ถอนสิทธิ์แก้ชีต" เป็นไปได้จริงโดยที่หัวหน้ากะยังทำงานได้
 *
 * ★ กติกาที่ห้ามแตะ
 *   1. ห้ามคืน lineUserId ออกไปทาง API / log / ข้อความ error โดยเด็ดขาด
 *   2. ห้ามใช้ push message (โควตาฟรี 300/เดือน) — แจ้งเตือนด้วยจุดแดงเท่านั้น
 *   3. ห้ามเปลี่ยนชื่อ/ลำดับคอลัมน์เดิม เพิ่มได้เฉพาะต่อท้าย (ดู ensureAdminSheets_)
 *
 * ★ ทางเข้าเดียวของไฟล์นี้คือ handleAdminApi_() ให้ 06_WebApi.js เรียกต่อ
 *   คืน null เมื่อ action ไม่ใช่ของไฟล์นี้ ผู้เรียกจะได้ไปทำงานต่อได้
 *******************************************************************/

/* ---------------- ค่าคงที่ ---------------- */

/** บทบาทที่เปิดแผงควบคุมได้เลย */
var ADMIN_ANY_ROLES = [ROLES.SUPERVISOR, ROLES.HR, ROLES.ADMIN];
/** บทบาทที่เห็นได้ทุกแผนกและทุกระดับความลับ */
var ADMIN_FULL_ROLES = [ROLES.HR, ROLES.ADMIN];

/** อ่านเรื่อง/ใบลาแค่ N แถวล่าสุด — สองแท็บนี้โตขึ้นทุกวันและไม่มีวันเล็กลง */
var ADMIN_TAIL_TICKETS = 300;
var ADMIN_TAIL_LEAVES  = 200;

/** เพดานจำนวนเรื่องเก่า (นอกหน้าต่าง) ที่ยอมดึงกลับมาแสดง — ดู adminTicketRows_ */
var ADMIN_STRAGGLER_MAX = 60;

/** กันกดส่งซ้ำ: จำผลลัพธ์ของ opId เดิมไว้ 10 นาที (wifi ร้านไม่ดี คนจะกดซ้ำแน่นอน) */
var ADMIN_OP_TTL = 600;

/** เพดานจำนวนช่องที่แก้ได้ในคำขอเดียว — กันลูป retry ที่เพี้ยนเขียนทั้งตาราง */
var ADMIN_MAX_ITEMS = 25;

/** เพดานการเขียนต่อคนต่อ 10 นาที */
var ADMIN_WRITE_QUOTA = 60;

/* =================================================================
 *  ทางเข้าเดียว
 * ================================================================= */
/**
 * @param {string} action  ชื่อ api ที่หน้าเว็บส่งมา
 * @param {Object} d       payload ทั้งก้อน
 * @param {Object} emp     แถวพนักงานของผู้เรียก (ผ่านการตรวจ active มาแล้ว)
 * @param {string} userId  lineUserId ของผู้เรียก — ใช้ในบ้านเท่านั้น ห้ามคืนออกไป
 * @return {Object|null}   null = ไม่ใช่คำสั่งของไฟล์นี้
 */
function handleAdminApi_(action, d, emp, userId) {
  if (String(action || '').indexOf('admin_') !== 0) return null;

  /* ด่านเดียวที่ทุกคำสั่งต้องผ่าน — staff เข้าไม่ได้แม้จะรู้ชื่อ api */
  if (!requireRole_(emp, ADMIN_ANY_ROLES)) {
    return { ok: false, code: 'FORBIDDEN', message: 'หน้านี้สงวนไว้สำหรับหัวหน้าแผนกและทีม HR' };
  }

  switch (action) {
    case 'admin_home':          return adminHome_(emp);
    case 'admin_tickets':       return adminTickets_(emp, d);
    case 'admin_ticket':        return adminTicket_(emp, d);
    case 'admin_ticket_reply':  return adminTicketReply_(emp, userId, d);
    case 'admin_leaves':        return adminLeaves_(emp, d);
    case 'admin_leave_decide':  return adminLeaveDecide_(emp, userId, d);
    case 'admin_day':           return adminDay_(emp, d);
    case 'admin_schedule_set':  return adminScheduleSet_(emp, userId, d);
    default:
      return { ok: false, code: 'UNKNOWN_API', message: 'ไม่รู้จักคำสั่ง: ' + action };
  }
}

/* =================================================================
 *  สิทธิ์
 * -----------------------------------------------------------------
 *  แยกออกมาจากตรรกะเดิมที่ฝังอยู่ใน apiSchedule_ (06_WebApi.js)
 *  เพื่อให้ทุก endpoint ใหม่ใช้กติกาเดียวกัน ไม่ต้องเขียนเงื่อนไขซ้ำ
 * ================================================================= */

/** ผู้ใช้คนนี้อยู่ในบทบาทที่กำหนดไหม */
function requireRole_(emp, roles) {
  var role = String((emp && emp.role) || '').trim().toLowerCase();
  if (!role) return false;
  for (var i = 0; i < roles.length; i++) if (String(roles[i]).toLowerCase() === role) return true;
  return false;
}

/**
 * ขอบเขตแผนกที่ผู้ใช้คนนี้มองเห็น
 *
 * ★★ กฎที่ห้ามทำหาย: "แผนกว่างต้องไม่ตรงกับใครเลย ไม่ใช่ตรงกับทุกคน"
 *   หัวหน้าที่ยังไม่ได้กรอกแผนกในทะเบียนพนักงาน ถ้าเทียบด้วย '' === ''
 *   จะเห็นข้อมูลของทุกคนที่แผนกว่างเหมือนกัน และในชีต Schedule จริง
 *   "มีแถวที่แผนกว่างอยู่จริง" จากรูปแบบกะที่ยังจับคู่ชื่อไม่ได้
 *   นี่เคยเป็นบั๊กสิทธิ์ของจริงที่แก้ไปแล้ว — ห้ามพากลับมา
 *
 * @return {{all:boolean, dept:string, role:string}}
 *   all=true          → เห็นทุกแผนก (hr/admin)
 *   all=false, dept='' → ไม่เห็นใครเลย (หัวหน้าที่ยังไม่มีแผนก)
 */
function scopeDept_(emp) {
  var role = String((emp && emp.role) || '').trim().toLowerCase();
  var full = requireRole_(emp, ADMIN_FULL_ROLES);
  return {
    all:  full,
    dept: full ? '' : String((emp && emp.dept) || '').trim(),
    role: role
  };
}

/** แถวที่อยู่แผนกนี้ ผู้ใช้เห็นได้ไหม */
function deptAllowed_(scope, dept) {
  if (scope.all) return true;
  if (!scope.dept) return false;                        /* ★ แผนกว่าง = ไม่ตรงกับใครเลย */
  return String(dept || '').trim() === scope.dept;
}

/** เรื่องที่ความลับระดับนี้ ผู้ใช้เห็นได้ไหม */
function privacyAllowed_(scope, privacy) {
  var p = String(privacy || PRIVACY.NORMAL).trim();
  if (scope.all) return true;                           /* hr/admin เห็นได้ทุกระดับ */
  return p === PRIVACY.NORMAL;                          /* หัวหน้าเห็นได้เฉพาะเรื่องธรรมดา */
}

/** ข้อความปฏิเสธมาตรฐาน — ห้ามใส่รายละเอียดว่าของจริงเป็นของใคร */
function adminDeny_() {
  return { ok: false, code: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงรายการนี้' };
}

/* =================================================================
 *  ตัวช่วยอ่านแบบ "เอาแค่ท้ายตาราง"
 * -----------------------------------------------------------------
 *  แท็บ Tickets / Leave ถูก append ต่อท้ายเรื่อย ๆ ไม่มีการลบ
 *  (กฎหมายแรงงานให้เก็บ 2 ปี) การอ่านทั้งแท็บทุกครั้งจึงช้าขึ้นตลอดไป
 * ================================================================= */

/** แปลงค่าดิบเป็น object โดยใช้หัวคอลัมน์ที่ส่งมา — ตรรกะเดียวกับ readTableRaw_ */
function adminToObjects_(head, values, firstRow) {
  var out = [];
  for (var r = 0; r < values.length; r++) {
    if (countFilled_(values[r]) === 0) continue;
    var o = { _row: firstRow + r };
    for (var c = 0; c < head.length; c++) if (head[c]) o[head[c]] = cellToString_(values[r][c]);
    out.push(o);
  }
  return out;
}

/** อ่าน N แถวสุดท้ายของแท็บ พร้อมบอกว่า "ตัดของเก่าทิ้งไปหรือเปล่า" */
function adminTailRows_(name, limit) {
  var sh   = sheet_(name);
  var idx  = headerIndex_(name);
  var hRow = idx._headRow || 1;
  var nCol = Math.max(1, sh.getLastColumn());
  var last = sh.getLastRow();
  var head = sh.getRange(hRow, 1, 1, nCol).getDisplayValues()[0]
               .map(function (x) { return String(x).trim(); });

  var res = { sheet: sh, head: head, headRow: hRow, nCol: nCol, lastRow: last,
              firstRead: hRow + 1, truncated: false, rows: [] };
  if (last <= hRow) return res;

  var from = Math.max(hRow + 1, last - limit + 1);
  res.firstRead = from;
  res.truncated = from > hRow + 1;
  res.rows = adminToObjects_(head, sh.getRange(from, 1, last - from + 1, nCol).getValues(), from);
  return res;
}

/**
 * อ่านเรื่องถึง HR
 *
 * ★ ทำไมไม่ตัดที่ 300 แถวแล้วจบ
 *   ถ้าตัดดื้อ ๆ เรื่องที่เปิดค้างมาตั้งแต่ 400 แถวก่อนจะ "หายไปจากกล่องเรื่อง
 *   พร้อมกับหายไปจากอีเมลสรุป 09:00" ในวันเดียวกัน แล้วเรื่องที่หายก็คือ
 *   เรื่องที่ค้างนานที่สุด ซึ่งตามธรรมชาติคือเรื่องที่ยากที่สุดเสมอ
 *   ระบบที่ลืมเรื่องยากที่สุดเงียบ ๆ แย่กว่าระบบที่ช้า
 *
 *   ทางออก: อ่านหน้าต่างท้ายเต็ม ๆ + ไล่ "เฉพาะคอลัมน์ status" ของแถวเก่ากว่านั้น
 *   (คอลัมน์เดียว ถูกกว่าอ่าน 18 คอลัมน์มาก) แล้วดึงกลับมาเฉพาะแถวที่ยังค้างจริง
 */
function adminTicketRows_() {
  var t = adminTailRows_(SHEETS.TICKETS, ADMIN_TAIL_TICKETS);
  if (!t.truncated) return t.rows;

  var cStatus = t.head.indexOf('status') + 1;
  var cId     = t.head.indexOf('ticketId') + 1;
  if (!cStatus || !cId) return t.rows;            /* หัวคอลัมน์เพี้ยน — อย่าเดา */

  var n = t.firstRead - (t.headRow + 1);
  if (n < 1) return t.rows;

  var st = t.sheet.getRange(t.headRow + 1, cStatus, n, 1).getValues();
  var id = t.sheet.getRange(t.headRow + 1, cId,     n, 1).getValues();

  var want = [];
  for (var i = 0; i < n; i++) {
    /* ★ ต้องเช็ก ticketId ด้วย: แถวว่างเปล่ามี status ว่าง ซึ่ง normalizeTicketStatus
       ตีความว่า "ใหม่" = ยังค้าง ถ้าไม่กันไว้ แถวว่างจะถูกลากกลับมาทั้งหมด */
    if (!cellToString_(id[i][0])) continue;
    if (isTicketOpen(cellToString_(st[i][0]))) want.push(t.headRow + 1 + i);
  }
  if (!want.length) return t.rows;

  /* เอาเฉพาะที่ใหม่ที่สุด ถ้ามีเยอะผิดปกติ แปลว่าชีตมีปัญหาอยู่แล้ว ไม่ใช่หน้าที่ของหน้านี้ */
  if (want.length > ADMIN_STRAGGLER_MAX) want = want.slice(want.length - ADMIN_STRAGGLER_MAX);

  var lo = want[0], hi = want[want.length - 1];
  var old = [];
  if (hi - lo + 1 <= 400) {
    var block = t.sheet.getRange(lo, 1, hi - lo + 1, t.nCol).getValues();
    var pick = {};
    for (var w = 0; w < want.length; w++) pick[want[w]] = true;
    var objs = adminToObjects_(t.head, block, lo);
    for (var o = 0; o < objs.length; o++) if (pick[objs[o]._row]) old.push(objs[o]);
  } else {
    for (var k = 0; k < want.length; k++) {
      var one = adminToObjects_(t.head, t.sheet.getRange(want[k], 1, 1, t.nCol).getValues(), want[k]);
      if (one[0]) old.push(one[0]);
    }
  }
  return old.concat(t.rows);
}

/**
 * หาแถวเดียวจากคีย์ โดยอ่านคอลัมน์คีย์คอลัมน์เดียวก่อน แล้วค่อยอ่านแถวนั้นเต็ม ๆ
 * ★ ตั้งใจไม่ผ่าน readTable() เพราะตัวนี้ถูกเรียกก่อน "เขียน" เสมอ
 *   ค่าจากแคชที่เก่าไปแค่วินาทีเดียวก็ทำให้เขียนทับคำตอบที่คนอื่นเพิ่งใส่ไปได้
 */
function adminFindRow_(name, keyCol, keyValue) {
  var key = String(keyValue || '').trim().toUpperCase();
  if (!key) return null;
  var sh   = sheet_(name);
  var idx  = headerIndex_(name);
  var hRow = idx._headRow || 1;
  var col  = idx[keyCol];
  var last = sh.getLastRow();
  if (!col || last <= hRow) return null;

  var vals = sh.getRange(hRow + 1, col, last - hRow, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {          /* ไล่จากล่างขึ้นบน แถวใหม่อยู่ล่างสุด */
    if (cellToString_(vals[i][0]).toUpperCase() === key) {
      var row  = hRow + 1 + i;
      var nCol = Math.max(1, sh.getLastColumn());
      var head = sh.getRange(hRow, 1, 1, nCol).getDisplayValues()[0]
                   .map(function (x) { return String(x).trim(); });
      return adminToObjects_(head, sh.getRange(row, 1, 1, nCol).getValues(), row)[0] || null;
    }
  }
  return null;
}

/* =================================================================
 *  กันกดซ้ำ + จำกัดอัตราการเขียน
 * -----------------------------------------------------------------
 *  wifi ในร้านหลุดบ่อย หน้าเว็บค้าง คนกดส่งซ้ำ = ตอบเรื่องเดียวกันสองครั้ง
 *  หรืออนุมัติใบลาซ้ำ วิธีแก้คือให้ฝั่ง client สร้าง opId มาเอง
 *  แล้วฝั่งนี้จำ "ผลลัพธ์" ของ opId นั้นไว้ 10 นาที กดซ้ำจะได้คำตอบเดิมกลับไป
 *  (ไม่ใช่ error) หน้าเว็บจึงแสดงผลถูกโดยไม่ต้องรู้ว่าเกิดอะไรขึ้น
 * ================================================================= */

function adminHash_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s || ''));
  var out = '';
  for (var i = 0; i < 6; i++) out += ('0' + (b[i] & 0xFF).toString(16)).slice(-2);
  return out;
}

function adminOpKey_(userId, opId) { return 'aop_' + adminHash_(userId) + '_' + opId; }

/** ตรวจรูปแบบ opId — กันคีย์แคชที่ผู้ใช้ปั้นเองจนชนกับคีย์อื่นของระบบ */
function adminOpValid_(opId) { return /^[A-Za-z0-9_-]{8,64}$/.test(String(opId || '')); }

function adminOpRecall_(userId, opId) {
  try {
    var v = CacheService.getScriptCache().get(adminOpKey_(userId, opId));
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

function adminOpRemember_(userId, opId, result) {
  try {
    CacheService.getScriptCache().put(adminOpKey_(userId, opId), JSON.stringify(result), ADMIN_OP_TTL);
  } catch (e) {}
}

/** โควตาการเขียนต่อคน — endpoint เขียนทั้งสามตัวไม่เคยมีเพดานมาก่อนเลย */
function adminRateOk_(userId, cost) {
  try {
    var c = CacheService.getScriptCache(), k = 'awq_' + adminHash_(userId);
    var n = Number(c.get(k) || 0) + Number(cost || 1);
    c.put(k, String(n), 600);
    return n <= ADMIN_WRITE_QUOTA;
  } catch (e) { return true; }      /* แคชล่มไม่ควรทำให้ HR ทำงานไม่ได้ */
}

/**
 * ครอบทุก endpoint ที่เขียนข้อมูล
 * ล็อกทั้งสคริปต์เพราะคนใช้แผงนี้มีไม่ถึงสิบคน การรอคิวสั้น ๆ ถูกกว่าการเขียนชนกัน
 * และการเช็ก opId ต้องอยู่ "ในล็อก" ไม่งั้นการกดสองครั้งพร้อมกันจะผ่านทั้งคู่
 */
function adminWrite_(userId, opId, cost, fn) {
  if (!adminOpValid_(opId)) {
    return { ok: false, code: 'INPUT', message: 'คำขอไม่สมบูรณ์ กรุณารีเฟรชหน้าแล้วลองใหม่' };
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { ok: false, code: 'BUSY', message: 'ระบบกำลังบันทึกของคนอื่นอยู่ กรุณากดส่งอีกครั้งในอีกสักครู่' };
  }
  try {
    var seen = adminOpRecall_(userId, opId);
    if (seen) { seen.duplicate = true; return seen; }      /* กดซ้ำ = คืนคำตอบเดิม */

    if (!adminRateOk_(userId, cost)) {
      return { ok: false, code: 'RATE',
               message: 'บันทึกถี่เกินกำหนดในช่วงสั้น ๆ กรุณารอสัก 10 นาทีแล้วลองใหม่' };
    }
    var out = fn();
    if (out && out.ok) adminOpRemember_(userId, opId, out);
    return out;
  } finally {
    lock.releaseLock();
  }
}

/* =================================================================
 *  AuditLog แบบเขียนทีเดียวหลายแถว
 * -----------------------------------------------------------------
 *  ตัวแก้ตารางต้องบันทึก "หนึ่งแถวต่อหนึ่งช่องที่เปลี่ยน" ถ้าเรียก appendRow
 *  ทีละแถวจะกลายเป็นการเขียนชีตหลายสิบครั้งต่อการกดบันทึกหนึ่งครั้ง
 *  ตัวนี้จึงรวบเป็น setValues ครั้งเดียว — แต่ยังผ่าน safeCell_ ทุกช่องเหมือนเดิม
 *  (ค่าที่บันทึกมีข้อความที่พนักงานพิมพ์มาปนอยู่ ถ้าไม่ escape จะกลายเป็นสูตร)
 * ================================================================= */
function adminAuditBatch_(rows) {
  if (!rows || !rows.length) return;
  try {
    var sh   = sheet_(SHEETS.AUDIT);
    var idx  = headerIndex_(SHEETS.AUDIT);
    var hRow = idx._headRow || 1;
    var nCol = Math.max(1, sh.getLastColumn());
    var head = sh.getRange(hRow, 1, 1, nCol).getDisplayValues()[0]
                 .map(function (x) { return String(x).trim(); });
    var ts   = now_();
    var out  = rows.map(function (r) {
      var o = { timestamp: ts, actor: r.actor || '', action: r.action || '',
                target: r.target || '', detail: r.detail || '' };
      return head.map(function (h) { return safeCell_(o[h] === undefined ? '' : o[h]); });
    });
    sh.getRange(sh.getLastRow() + 1, 1, out.length, nCol).setValues(out);
    bumpTableVersion_(SHEETS.AUDIT);
  } catch (e) {
    console.error('adminAuditBatch_ failed: ' + e);
  }
}

/* =================================================================
 *  เพิ่มคอลัมน์ที่แผงควบคุมต้องใช้ (เพิ่มต่อท้ายเท่านั้น)
 * -----------------------------------------------------------------
 *  ★ ไม่เรียก initDatabase() โดยตั้งใจ
 *    initDatabase เขียนหัวคอลัมน์ทับ "แถวที่ 1 เสมอ" แต่ readTable ตรวจหาแถว
 *    หัวคอลัมน์จริงเอง (บางแท็บมีแถวคำอธิบายคั่นอยู่ข้างบน) ผลคือคอลัมน์ใหม่
 *    จะไปโผล่ผิดแถวและ "ตายเงียบ" — โค้ดหาไม่เจอ ไม่มี error ให้เห็นเลยสักบรรทัด
 *
 *  ★ เพิ่ม manualBy / manualAt ไว้ทำอะไร
 *    แถวที่ status='manual' จะรอดจากการสร้างตารางใหม่ทุกครั้งตลอดไป
 *    พอแผงนี้ตั้ง manual ให้อัตโนมัติ แถว manual จะสะสมขึ้นเรื่อย ๆ
 *    จนถึงจุดที่ไม่มีใครแยกออกว่าแถวไหนคือ "ข้อยกเว้นที่ตั้งใจ" และแถวไหนคือ
 *    "การสลับกะครั้งเดียวเมื่อสามเดือนก่อนที่ลืมคืนค่า"
 *    สองคอลัมน์นี้ทำให้แยกออกได้ และทำให้ปุ่ม "คืนค่าอัตโนมัติ" มีความหมาย
 * ================================================================= */
function ensureAdminSheets_() {
  try {
    var c = CacheService.getScriptCache();
    if (c.get('adm_schema_ok')) return;                 /* เช็กครั้งเดียวต่อ 6 ชั่วโมงพอ */

    var sh   = sheet_(SHEETS.SCHEDULE);
    var idx  = headerIndex_(SHEETS.SCHEDULE);
    var hRow = idx._headRow || 1;
    var need = ['manualBy', 'manualAt'].filter(function (h) { return !idx[h]; });

    if (need.length) {
      var at = Math.max(1, sh.getLastColumn()) + 1;
      sh.getRange(hRow, at, 1, need.length).setValues([need])
        .setBackground(CFG.BRAND.primary).setFontColor('#FFFFFF').setFontWeight('bold')
        .setVerticalAlignment('middle');
      delete HEADER_MEMO_[SHEETS.SCHEDULE];
      bumpTableVersion_(SHEETS.SCHEDULE);
      audit('system', 'ADMIN_SCHEMA_ADD', SHEETS.SCHEDULE, need.join(','));
    }
    c.put('adm_schema_ok', '1', 21600);
  } catch (e) {
    /* เพิ่มคอลัมน์ไม่ได้ก็ยังทำงานต่อได้ แค่ไม่มีประวัติว่าใครแก้ */
    console.error('ensureAdminSheets_: ' + e);
  }
}

/* =================================================================
 *  ตัวช่วยที่ใช้ร่วมกันหลาย endpoint
 * ================================================================= */

/** ทะเบียนพนักงานแบบค้นด้วย empCode — ใช้เติมชื่อ/แผนกให้แท็บที่ไม่มีคอลัมน์ dept */
function adminEmpIndex_() {
  var map = {};
  readTable(SHEETS.EMPLOYEES).forEach(function (e) {
    var code = String(e.empCode || '').trim().toUpperCase();
    if (code) map[code] = e;
  });
  return map;
}

/** ชื่อที่เอาไปแสดงได้ — ไม่มีเบอร์ ไม่มี lineUserId */
function adminWho_(e, fallbackName) {
  if (e) return e.nickname || e.fullName || (e.firstName + ' ' + e.lastName).trim() || e.empCode;
  return String(fallbackName || '').trim() || '(ไม่พบในทะเบียน)';
}

function adminValidDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

/** รายชื่อแผนกที่ผู้ใช้เลือกได้ในหน้าแก้ตาราง */
function adminDeptList_(scope) {
  if (!scope.all) return scope.dept ? [scope.dept] : [];
  var seen = {}, out = [];
  readTable(SHEETS.EMPLOYEES).forEach(function (e) {
    if (String(e.status).trim() !== EMP_STATUS.ACTIVE) return;
    var d = String(e.dept || '').trim();
    if (!d || seen[d]) return;
    seen[d] = true; out.push(d);
  });
  return out.sort();
}

/** ชิปกะที่เลือกได้ — OFF/LV มาจากชีต Shifts อยู่แล้ว (dept = '*') */
function adminShiftChips_(dept) {
  var out = [];
  readTable(SHEETS.SHIFTS).forEach(function (s) {
    var code = String(s.shiftCode || '').trim();
    if (!code) return;
    if (String(s.active).toUpperCase() === 'FALSE') return;
    var sd = String(s.dept || '').trim();
    if (dept && sd && sd !== '*' && sd !== dept) return;
    out.push({ shiftCode: code, label: s.label || s.name || code,
               start: s.start || '', end: s.end || '',
               breaks: s.breaks || '', ot: s.ot || '',
               color: s.color || CFG.BRAND.primary });
  });
  return out;
}

/* =================================================================
 *  หน้าแรกของแผงควบคุม — ขอทีเดียวได้ครบ
 *  (wifi ร้านไม่ดี การยิงสี่ครั้งตอนเปิดหน้าแพงกว่าการยิงครั้งเดียว)
 * ================================================================= */
function adminHome_(emp) {
  var scope  = scopeDept_(emp);
  var today  = todayStr_();
  var empIdx = adminEmpIndex_();

  var openTk = 0, overdueTk = 0, allTk = 0;
  adminTicketRows_().forEach(function (t) {
    if (!adminTicketVisible_(scope, t, empIdx)) return;
    allTk++;
    if (!isTicketOpen(t.status)) return;
    openTk++;
    if (String(t.slaDue || '').trim() && String(t.slaDue).trim() < today) overdueTk++;
  });

  var pendingLv = 0;
  adminTailRows_(SHEETS.LEAVE, ADMIN_TAIL_LEAVES).rows.forEach(function (l) {
    if (!String(l.leaveId || '').trim()) return;
    if (!adminLeaveVisible_(scope, l, empIdx)) return;
    if (isLeavePending(l.status)) pendingLv++;
  });

  var depts = adminDeptList_(scope);
  return {
    ok: true,
    role: scope.role,
    scopeAll: scope.all,
    myDept: scope.all ? '' : scope.dept,
    /* หัวหน้าที่ยังไม่ได้กรอกแผนกจะไม่เห็นอะไรเลย ต้องบอกเหตุผลตรง ๆ ไม่ใช่ปล่อยให้หน้าว่าง */
    warning: (!scope.all && !scope.dept)
      ? 'ทะเบียนพนักงานของคุณยังไม่ได้ระบุแผนก ระบบจึงยังไม่แสดงข้อมูลของทีมให้ — กรุณาแจ้ง HR ให้เติมคอลัมน์ dept'
      : '',
    today: today,
    depts: depts,
    counts: { ticketOpen: openTk, ticketOverdue: overdueTk, ticketAll: allTk, leavePending: pendingLv }
  };
}

/* =================================================================
 *  1) กล่องเรื่องถึง HR
 * ================================================================= */

/** เรื่องนี้ผู้ใช้คนนี้เห็นได้ไหม — ใช้ร่วมกันทั้ง list, detail และตอนตอบ */
function adminTicketVisible_(scope, t, empIdx) {
  if (!privacyAllowed_(scope, t.privacy)) return false;
  if (scope.all) return true;
  /* ★ แท็บ Tickets ไม่มีคอลัมน์ dept — ต้องหาแผนกจากทะเบียนพนักงาน
     เรื่องนิรนามไม่มี empCode จึงไม่มีแผนก และตกด่าน deptAllowed_ ไปเองโดยอัตโนมัติ */
  var e = empIdx[String(t.empCode || '').trim().toUpperCase()];
  return deptAllowed_(scope, e ? e.dept : '');
}

function adminTicketDept_(t, empIdx) {
  var e = empIdx[String(t.empCode || '').trim().toUpperCase()];
  return e ? String(e.dept || '').trim() : '';
}

function adminTickets_(emp, d) {
  var scope  = scopeDept_(emp);
  var empIdx = adminEmpIndex_();
  var today  = todayStr_();
  var filter = String(d.filter || 'open');

  var open = 0, overdue = 0, all = 0;
  var list = [];

  adminTicketRows_().forEach(function (t) {
    if (!String(t.ticketId || '').trim()) return;
    if (!adminTicketVisible_(scope, t, empIdx)) return;

    var isOpen = isTicketOpen(t.status);
    var isOver = isOpen && String(t.slaDue || '').trim() && String(t.slaDue).trim() < today;
    all++; if (isOpen) open++; if (isOver) overdue++;

    if (filter === 'open'    && !isOpen) return;
    if (filter === 'overdue' && !isOver) return;

    var anon = String(t.privacy || '').trim() === PRIVACY.ANONYMOUS;
    list.push({
      ticketId:  String(t.ticketId).trim(),
      createdAt: t.createdAt || '',
      category:  t.category || '',
      categoryId:t.categoryId || '',
      subject:   t.subject || '(ไม่มีหัวข้อ)',
      status:    normalizeTicketStatus(t.status) || String(t.status || ''),
      rawStatus: String(t.status || ''),
      slaDue:    t.slaDue || '',
      overdue:   isOver,
      open:      isOpen,
      priority:  t.priority || '',
      privacy:   String(t.privacy || PRIVACY.NORMAL).trim(),
      anonymous: anon,
      dept:      anon ? '' : adminTicketDept_(t, empIdx),
      who:       anon ? 'ไม่ระบุตัวตน' : adminWho_(empIdx[String(t.empCode || '').trim().toUpperCase()], t.name)
      /* ★ ไม่มี detail ไม่มี reply ไม่มี empCode ไม่มี lineUserId ในหน้ารายการ */
    });
  });

  /* ใหม่สุดอยู่บน — เรื่องเกินกำหนดขึ้นก่อนเสมอเพราะนั่นคืองานที่ต้องทำก่อน */
  list.sort(function (a, b) {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  return { ok: true, counts: { open: open, overdue: overdue, all: all },
           filter: filter, items: list };
}

function adminTicket_(emp, d) {
  var scope  = scopeDept_(emp);
  var empIdx = adminEmpIndex_();
  var t = adminFindRow_(SHEETS.TICKETS, 'ticketId', d.ticketId);
  if (!t) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบเรื่องนี้ในระบบ' };
  if (!adminTicketVisible_(scope, t, empIdx)) return adminDeny_();

  var anon   = String(t.privacy || '').trim() === PRIVACY.ANONYMOUS;
  var isOpen = isTicketOpen(t.status);
  var today  = todayStr_();

  return {
    ok: true,
    ticket: {
      ticketId:  String(t.ticketId).trim(),
      createdAt: t.createdAt || '',
      category:  t.category || '',
      categoryId:t.categoryId || '',
      subject:   t.subject || '',
      detail:    t.detail || '',
      attachment:t.attachment || '',
      priority:  t.priority || '',
      privacy:   String(t.privacy || PRIVACY.NORMAL).trim(),
      anonymous: anon,
      status:    normalizeTicketStatus(t.status) || String(t.status || ''),
      slaDue:    t.slaDue || '',
      overdue:   isOpen && String(t.slaDue || '').trim() && String(t.slaDue).trim() < today,
      open:      isOpen,
      assignee:  t.assignee || '',
      reply:     t.reply || '',
      closedAt:  t.closedAt || '',
      dept:      anon ? '' : adminTicketDept_(t, empIdx),
      branch:    anon ? '' : (t.branch || ''),
      who:       anon ? 'ไม่ระบุตัวตน' : adminWho_(empIdx[String(t.empCode || '').trim().toUpperCase()], t.name),
      /* ★ บอกล่วงหน้าว่าส่งคำตอบกลับได้หรือไม่ หน้าเว็บจะได้ไม่สัญญาสิ่งที่ทำไม่ได้
         (ไม่บอกว่าเพราะ lineUserId ว่างหรือเพราะนิรนาม — สองอย่างนี้ผลเหมือนกัน) */
      canNotify: !anon && !!String(t.lineUserId || '').trim()
    }
  };
}

/**
 * ตอบเรื่อง
 *
 * ★ ลำดับของสามอย่างนี้สำคัญกว่าที่เห็น
 *   1. บันทึกข้อความคำตอบก่อน  — ถ้าขั้นถัดไปล้ม คำที่ HR พิมพ์ไว้ต้องไม่หาย
 *   2. ติดจุดแดงให้ผู้แจ้ง     — จุดแดงคือ "ช่องทางเดียว" ที่บอกเขาว่ามีคำตอบ
 *   3. ค่อยเปลี่ยนสถานะเป็นตอบแล้ว
 *   ถ้าสลับ 2 กับ 3 แล้วจุดแดงล้มเหลว เรื่องจะกลายเป็น "ตอบแล้ว" หลุดออกจาก
 *   งานค้างและออกจากอีเมล 09:00 ทั้งที่ไม่มีใครไปบอกผู้แจ้งเลยสักคน
 *   เขาจะนั่งรอคำตอบที่ไม่มีวันมาถึง และไม่มีโค้ดไหนลองใหม่ให้อีก
 */
function adminTicketReply_(emp, userId, d) {
  var reply = String(d.reply || '').trim();
  if (reply.length < 2) return { ok: false, code: 'INPUT', message: 'กรุณาพิมพ์คำตอบก่อนกดส่ง' };
  if (reply.length > 3000) return { ok: false, code: 'INPUT', message: 'คำตอบยาวเกิน 3,000 ตัวอักษร' };

  return adminWrite_(userId, d.opId, 1, function () {
    var scope  = scopeDept_(emp);
    var empIdx = adminEmpIndex_();
    var t = adminFindRow_(SHEETS.TICKETS, 'ticketId', d.ticketId);
    if (!t) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบเรื่องนี้ในระบบ' };
    if (!adminTicketVisible_(scope, t, empIdx)) return adminDeny_();

    var anon   = String(t.privacy || '').trim() === PRIVACY.ANONYMOUS;
    var target = String(t.lineUserId || '').trim();
    var close  = !!d.close;

    /* ① เก็บคำตอบไว้ก่อนเสมอ */
    updateRow(SHEETS.TICKETS, t._row, { reply: reply, assignee: emp.empCode });

    /* กรณีนิรนาม — พูดตรง ๆ ว่าแจ้งกลับไม่ได้ ห้ามแกล้งทำเป็นว่าส่งได้
       (ทำแบบเดียวกับ replyTicketSelected ในเมนูชีต: บันทึกคำตอบแล้วปิดเรื่อง) */
    if (anon || !target) {
      updateRow(SHEETS.TICKETS, t._row, { status: TICKET_STATUS.CLOSED, closedAt: now_() });
      audit(emp.empCode, 'TICKET_REPLY', t.ticketId, anon ? 'นิรนาม — ปิดเรื่องโดยไม่แจ้งกลับ'
                                                          : 'ไม่มีบัญชีไลน์ผูกไว้ — ปิดเรื่องโดยไม่แจ้งกลับ');
      return {
        ok: true, notified: false, notifyReason: 'anonymous',
        status: TICKET_STATUS.CLOSED,
        message: anon
          ? 'บันทึกคำตอบและปิดเรื่องแล้ว — เรื่องนี้ผู้แจ้งเลือก “ไม่ระบุตัวตน” ระบบจึงส่งคำตอบกลับถึงตัวเขาไม่ได้ ถ้าต้องการให้รู้ผล ให้ประกาศผลแบบรวมผ่านเมนูประกาศ'
          : 'บันทึกคำตอบและปิดเรื่องแล้ว — เรื่องนี้ไม่มีบัญชีไลน์ผูกไว้ ระบบจึงแจ้งกลับไม่ได้ กรุณาติดต่อผู้แจ้งโดยตรง'
      };
    }

    /* ② ติดจุดแดง (0 ข้อความ) */
    try {
      setBadge(target, 'hr', true);
    } catch (e) {
      console.error('adminTicketReply badge: ' + e);
      /* ★ ห้ามใส่ lineUserId ลง log/audit — บันทึกแค่รหัสเรื่องกับข้อความ error */
      audit(emp.empCode, 'TICKET_REPLY_BADGE_FAIL', t.ticketId, String(e).slice(0, 200));
      updateRow(SHEETS.TICKETS, t._row, { status: TICKET_STATUS.WIP });
      return {
        ok: true, notified: false, notifyReason: 'badge_failed',
        status: TICKET_STATUS.WIP,
        message: 'บันทึกคำตอบแล้ว แต่ยังแจ้งเตือนผู้แจ้งไม่สำเร็จ จึงยังไม่ปิดเรื่องให้ ' +
                 'สาเหตุที่พบบ่อยคือผู้แจ้งบล็อกหรือลบบัญชี OA ไปแล้ว — กรุณาติดต่อเขาโดยตรง แล้วค่อยกดปิดเรื่อง'
      };
    }

    /* ③ เปลี่ยนสถานะหลังจากแน่ใจว่าเขาจะเห็นจุดแดงแล้วเท่านั้น */
    var st = close ? TICKET_STATUS.CLOSED : TICKET_STATUS.ANSWERED;
    updateRow(SHEETS.TICKETS, t._row, { status: st, closedAt: now_() });
    audit(emp.empCode, 'TICKET_REPLY', t.ticketId, st + ' · badge (0 ข้อความ)');

    return {
      ok: true, notified: true, status: st,
      message: 'ส่งคำตอบแล้ว ติดจุดแดงบนเมนู “ติดต่อ HR” ของผู้แจ้งเรียบร้อย ' +
               'เขาจะเห็นคำตอบเมื่อเปิดเมนูนั้นแล้วกด “เรื่องของฉัน” (ใช้โควตาข้อความ 0)'
    };
  });
}

/* =================================================================
 *  2) คิวอนุมัติลา
 * -----------------------------------------------------------------
 *  ก่อนหน้านี้ flow นี้ไม่มีเครื่องมือเลยสักชิ้น ไม่มีเมนู ไม่มีฟังก์ชัน ไม่มี API
 *  พนักงานยื่นผ่าน leave_create แล้ว HR ต้องพิมพ์สี่คอลัมน์เองในชีต
 *  และผู้ขอจะไม่รู้ผลจนกว่าจะบังเอิญเปิดรายงาน R04
 * ================================================================= */

function adminLeaveVisible_(scope, l, empIdx) {
  if (scope.all) return true;
  var e = empIdx[String(l.empCode || '').trim().toUpperCase()];
  return deptAllowed_(scope, e ? e.dept : '');
}

function adminLeaves_(emp, d) {
  var scope  = scopeDept_(emp);
  var empIdx = adminEmpIndex_();
  var filter = String(d.filter || 'pending');

  var pending = 0, decided = 0, all = 0;
  var list = [];

  adminTailRows_(SHEETS.LEAVE, ADMIN_TAIL_LEAVES).rows.forEach(function (l) {
    if (!String(l.leaveId || '').trim()) return;
    if (!adminLeaveVisible_(scope, l, empIdx)) return;

    var isPending = isLeavePending(l.status);
    all++; if (isPending) pending++; else decided++;

    if (filter === 'pending' && !isPending) return;
    if (filter === 'decided' &&  isPending) return;

    var e = empIdx[String(l.empCode || '').trim().toUpperCase()];
    list.push({
      leaveId:   String(l.leaveId).trim(),
      createdAt: l.createdAt || '',
      who:       adminWho_(e, l.name),
      dept:      e ? String(e.dept || '').trim() : '',
      branch:    l.branch || '',
      type:      l.type || '',
      dateFrom:  l.dateFrom || '',
      dateTo:    l.dateTo || l.dateFrom || '',
      days:      l.days || '',
      reason:    l.reason || '',
      status:    normalizeLeaveStatus(l.status) || String(l.status || ''),
      pending:   isPending,
      approver:  l.approver || '',
      decidedAt: l.decidedAt || '',
      remark:    l.remark || ''
    });
  });

  list.sort(function (a, b) {
    if (a.pending !== b.pending) return a.pending ? -1 : 1;
    return String(a.dateFrom).localeCompare(String(b.dateFrom));   /* ใบที่ถึงวันลาก่อนต้องตัดสินก่อน */
  });

  return { ok: true, counts: { pending: pending, decided: decided, all: all },
           filter: filter, items: list };
}

/**
 * อนุมัติ / ไม่อนุมัติ
 *
 * ★ ตั้งใจไม่เขียนกลับเข้าแท็บ Schedule เป็นกะ LV
 *   ถ้าทำ จะกลายเป็น "ทางเขียนที่สอง" เข้าไปในตารางกะ ซึ่งชนกับทั้ง
 *   generateScheduleFromPattern และตัวแก้ตารางในหน้านี้เอง แล้วไม่มีใครรู้ว่า
 *   แถวนั้นมาจากไหน ให้หัวหน้ากะตั้ง LV เองในตัวแก้ตาราง ซึ่งเห็นภาพรวมทั้งวัน
 */
function adminLeaveDecide_(emp, userId, d) {
  var decision = String(d.decision || '').trim().toLowerCase();
  if (['approve', 'reject'].indexOf(decision) < 0) {
    return { ok: false, code: 'INPUT', message: 'กรุณาเลือกว่าจะอนุมัติหรือไม่อนุมัติ' };
  }
  var remark = String(d.remark || '').trim().slice(0, 500);
  if (decision === 'reject' && remark.length < 2) {
    /* ปฏิเสธโดยไม่บอกเหตุผล = พนักงานมาถาม HR ซ้ำอยู่ดี บังคับให้พิมพ์ */
    return { ok: false, code: 'INPUT', message: 'กรณีไม่อนุมัติ กรุณาระบุเหตุผลสั้น ๆ ให้ผู้ขอด้วย' };
  }

  return adminWrite_(userId, d.opId, 1, function () {
    var scope  = scopeDept_(emp);
    var empIdx = adminEmpIndex_();
    var l = adminFindRow_(SHEETS.LEAVE, 'leaveId', d.leaveId);
    if (!l) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบใบลานี้ในระบบ' };
    if (!adminLeaveVisible_(scope, l, empIdx)) return adminDeny_();

    if (!isLeavePending(l.status)) {
      return { ok: false, code: 'DONE',
               message: 'ใบลานี้ถูกตัดสินไปแล้วเมื่อ ' + (l.decidedAt || '-') +
                        ' (สถานะ: ' + (normalizeLeaveStatus(l.status) || l.status) + ')' };
    }

    var st = decision === 'approve' ? LEAVE_STATUS.APPROVED : LEAVE_STATUS.REJECTED;
    updateRow(SHEETS.LEAVE, l._row, {
      status: st, approver: emp.empCode, decidedAt: now_(), remark: remark
    });

    /* ติดจุดแดงให้ผู้ขอ — เขาจะไปเห็นผลในเมนู "ติดต่อ HR"
       lineUserId ถูกใช้ในบรรทัดเดียวนี้เท่านั้น และไม่ถูกส่งกลับออกไป */
    var notified = false, reason = '';
    var e = empIdx[String(l.empCode || '').trim().toUpperCase()];
    var target = e ? String(e.lineUserId || '').trim() : '';
    if (!target) {
      reason = 'no_line';
    } else {
      try { setBadge(target, 'hr', true); notified = true; }
      catch (err) {
        console.error('adminLeaveDecide badge: ' + err);
        audit(emp.empCode, 'LEAVE_DECIDE_BADGE_FAIL', l.leaveId, String(err).slice(0, 200));
        reason = 'badge_failed';
      }
    }

    audit(emp.empCode, 'LEAVE_DECIDE', l.leaveId,
          st + (remark ? (' · ' + remark.slice(0, 120)) : '') + (notified ? '' : ' · แจ้งเตือนไม่สำเร็จ'));

    return {
      ok: true, notified: notified, notifyReason: reason, status: st,
      message: notified
        ? ('บันทึก “' + st + '” แล้ว และติดจุดแดงแจ้งผู้ขอเรียบร้อย (ใช้โควตาข้อความ 0)')
        : ('บันทึก “' + st + '” แล้ว แต่แจ้งผู้ขอไม่สำเร็จ' +
           (reason === 'no_line' ? ' เพราะยังไม่ได้ผูกบัญชีไลน์ไว้' : ' กรุณาบอกเขาโดยตรง'))
    };
  });
}

/* =================================================================
 *  3) ตัวแก้ตารางรายวัน
 * -----------------------------------------------------------------
 *  ★ ตั้งใจไม่ทำ grid ทั้งเดือนแบบลากวาง นั่นคือ ~1,800 ช่องบนชั้นข้อมูล
 *    ที่อ่านทั้งแท็บทุกครั้ง และมันไม่ใช่งานจริง
 *    งานจริงคือ "คนนี้ลาป่วย ย้ายคนนี้มากะเช้า" — วันเดียว แผนกเดียว จบ
 *    การสร้างตารางทั้งเดือนยังอยู่ที่ generateScheduleFromPattern ในเมนูชีตเหมือนเดิม
 * ================================================================= */

function adminDayScope_(emp, d) {
  var scope = scopeDept_(emp);
  var dept  = String(d.dept || '').trim();
  if (!scope.all) dept = scope.dept;                  /* หัวหน้าถูกล็อกที่แผนกตัวเอง */
  return { scope: scope, dept: dept };
}

function adminDay_(emp, d) {
  ensureAdminSheets_();
  var date = String(d.date || todayStr_()).trim();
  if (!adminValidDate_(date)) return { ok: false, code: 'INPUT', message: 'รูปแบบวันที่ไม่ถูกต้อง' };

  var s = adminDayScope_(emp, d);
  if (!s.scope.all && !s.dept) {
    return { ok: false, code: 'NO_DEPT',
             message: 'ทะเบียนพนักงานของคุณยังไม่ได้ระบุแผนก กรุณาแจ้ง HR ให้เติมคอลัมน์ dept ก่อน' };
  }
  if (s.scope.all && !s.dept) {
    return { ok: false, code: 'INPUT', message: 'กรุณาเลือกแผนกก่อน' };
  }

  var today  = todayStr_();
  var empIdx = adminEmpIndex_();
  var shiftMap = {};
  adminShiftChips_('').forEach(function (x) { shiftMap[x.shiftCode] = x; });

  /* พนักงาน active ในแผนกนี้ — ต้องแสดงคนที่ "ยังไม่มีกะ" ด้วย
     ไม่งั้นคนที่หลุดจากตารางจะมองไม่เห็นเลย ซึ่งเป็นความผิดพลาดที่แพงที่สุดของวัน */
  var people = [];
  readTable(SHEETS.EMPLOYEES).forEach(function (e) {
    if (String(e.status).trim() !== EMP_STATUS.ACTIVE) return;
    if (String(e.dept || '').trim() !== s.dept) return;
    people.push({ empCode: String(e.empCode || '').trim(),
                  name: adminWho_(e, ''), position: e.position || '' });
  });
  people.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'th'); });

  /* แถวตารางของวันนี้ — เก็บทุกแถวที่ empCode อยู่ในแผนก (ใช้แผนกจากทะเบียนพนักงาน
     ไม่ใช่คอลัมน์ dept ในแถว เพราะแถวที่ dept ว่างจะไปโผล่ในทุกแผนก) */
  var rows = [];
  readTable(SHEETS.SCHEDULE).forEach(function (r) {
    if (String(r.date || '').trim() !== date) return;
    var code = String(r.empCode || '').trim();
    var e = empIdx[code.toUpperCase()];
    if (!e || String(e.dept || '').trim() !== s.dept) return;
    var sf = shiftMap[String(r.shiftCode || '').trim()] || {};
    rows.push({
      empCode:   code,
      name:      adminWho_(e, ''),
      position:  e.position || '',
      shiftCode: String(r.shiftCode || '').trim(),
      shiftName: sf.label || String(r.shiftCode || '').trim(),
      color:     sf.color || CFG.BRAND.primary,
      start:     r.startTime || sf.start || '',
      end:       r.endTime   || sf.end   || '',
      note:      r.note || '',
      status:    String(r.status || '').trim(),
      manual:    String(r.status || '').trim().toLowerCase() === 'manual',
      manualBy:  r.manualBy || '',
      manualAt:  r.manualAt || ''
    });
  });

  return {
    ok: true,
    date: date,
    dept: s.dept,
    depts: adminDeptList_(s.scope),
    lockedDept: !s.scope.all,
    /* หัวหน้าแก้ได้เฉพาะวันนี้เป็นต้นไป — ย้อนแก้อดีตคือการแก้ค่าแรงที่จ่ายไปแล้ว */
    canEdit: s.scope.all || date >= today,
    editHint: (!s.scope.all && date < today)
      ? 'หัวหน้าแผนกแก้ย้อนหลังไม่ได้ ถ้าต้องแก้วันที่ผ่านมาแล้ว กรุณาส่งเรื่องถึง HR'
      : '',
    rows: rows,
    people: people,
    shifts: adminShiftChips_(s.dept)
  };
}

/**
 * บันทึกตารางของวันเดียว
 *
 * ★★ บรรทัดที่สำคัญที่สุดของทั้งไฟล์: status = 'manual' เสมอ
 *   generateScheduleFromPattern เก็บแถวเดิมไว้ก็ต่อเมื่อ status เป็นคำว่า
 *   'manual' ตัวพิมพ์เล็กเป๊ะ ๆ เท่านั้น คำนี้ปรากฏในโค้ดหนึ่งที่กับใน dialog
 *   อีกหนึ่งบรรทัด และไม่มีที่ไหนอีกเลยในทั้งระบบ
 *   หัวหน้ากะที่แก้ตารางวันเสาร์แล้วปล่อย status เป็น 'planned' ไว้
 *   จะโดนเขียนทับหายเงียบ ๆ ในการสร้างตารางรอบถัดไป ไม่มี warning ไม่มี undo
 *   การตั้งให้อัตโนมัติตรงนี้ ลบความเสี่ยงทั้งชนิดนี้ทิ้งไปทีเดียว
 */
function adminScheduleSet_(emp, userId, d) {
  ensureAdminSheets_();
  var date  = String(d.date || '').trim();
  var items = (d.items && d.items.length) ? d.items : [];
  if (!adminValidDate_(date)) return { ok: false, code: 'INPUT', message: 'รูปแบบวันที่ไม่ถูกต้อง' };
  if (!items.length)          return { ok: false, code: 'INPUT', message: 'ไม่มีรายการที่จะบันทึก' };
  if (items.length > ADMIN_MAX_ITEMS) {
    return { ok: false, code: 'INPUT',
             message: 'บันทึกได้ครั้งละไม่เกิน ' + ADMIN_MAX_ITEMS + ' คน กรุณาแบ่งบันทึกเป็นรอบ' };
  }

  return adminWrite_(userId, d.opId, items.length, function () {
    var s = adminDayScope_(emp, d);
    if (!s.scope.all && !s.dept) {
      return { ok: false, code: 'NO_DEPT',
               message: 'ทะเบียนพนักงานของคุณยังไม่ได้ระบุแผนก กรุณาแจ้ง HR ก่อน' };
    }
    if (!s.scope.all && date < todayStr_()) {
      return { ok: false, code: 'FORBIDDEN',
               message: 'หัวหน้าแผนกแก้ตารางย้อนหลังไม่ได้ กรุณาส่งเรื่องถึง HR' };
    }

    var empIdx = adminEmpIndex_();
    var shiftMap = {};
    adminShiftChips_('').forEach(function (x) { shiftMap[x.shiftCode] = x; });

    var idx     = adminDayIndex_(date, false);
    var freshed = false;                /* อ่าน index ใหม่ได้ครั้งเดียวต่อคำขอ กันการอ่านทั้งแท็บซ้ำ ๆ */
    var stamp   = now_();
    var results = [], auditRows = [], changed = 0;

    for (var i = 0; i < items.length; i++) {
      var it   = items[i] || {};
      var code = String(it.empCode || '').trim();
      var e    = empIdx[code.toUpperCase()];

      if (!code || !e) { results.push({ empCode: code, ok: false, reason: 'ไม่พบพนักงานคนนี้' }); continue; }
      if (String(e.status).trim() !== EMP_STATUS.ACTIVE) {
        results.push({ empCode: code, ok: false, reason: 'พนักงานคนนี้ไม่ได้อยู่ในสถานะทำงาน' }); continue;
      }
      if (!deptAllowed_(s.scope, e.dept)) {
        results.push({ empCode: code, ok: false, reason: 'อยู่นอกแผนกที่คุณดูแล' }); continue;
      }

      var release = !!it.release;
      var shift   = String(it.shiftCode || '').trim();
      if (!release) {
        if (!shift) { results.push({ empCode: code, ok: false, reason: 'ยังไม่ได้เลือกกะ' }); continue; }
        if (!shiftMap[shift]) {
          results.push({ empCode: code, ok: false, reason: 'ไม่รู้จักรหัสกะ ' + shift }); continue;
        }
      }

      var sf  = shiftMap[shift] || {};
      var row = idx.map[code.toUpperCase()];
      var cur = null;

      /* ★★ ทุกการเขียนต้องยืนยัน (date, empCode) ในแถวเป้าหมายอีกรอบก่อนเสมอ
         index อาจชี้ผิดแถวได้จริง ถ้ามีคนแก้ชีตตรง ๆ หรือรัน
         generateScheduleFromPattern (ซึ่งล้างแล้วเขียนใหม่ทั้งแท็บด้วย setValues
         จึงไม่ผ่าน bumpTableVersion_ และไม่จุดทริกเกอร์ onEdit) ระหว่างนั้น
         เขียนโดยเชื่อเลขแถวเดิม = ไปทับกะของคนอื่น ซึ่งไม่มีทางย้อนกลับได้ */
      if (row) cur = adminVerifyRow_(date, code, row);
      if (!cur && !freshed) {
        /* ทั้งกรณี "ชี้ผิดแถว" และกรณี "index บอกว่าไม่มีแถว" ต้องอ่านใหม่เหมือนกัน
           กรณีหลังอันตรายเงียบกว่า เพราะถ้าเชื่อ index จะกลายเป็นแทรกแถวซ้ำของคนเดิม */
        idx = adminDayIndex_(date, true); freshed = true;
        row = idx.map[code.toUpperCase()];
        cur = row ? adminVerifyRow_(date, code, row) : null;
      }
      if (row && !cur) {
        results.push({ empCode: code, ok: false,
                       reason: 'ตารางถูกแก้จากที่อื่นพร้อมกัน กรุณารีเฟรชแล้วลองใหม่' });
        continue;
      }

      /* ★ "คืนค่าอัตโนมัติ" แตะแค่ status เท่านั้น ห้ามล้างกะที่ตั้งไว้
         มันแปลว่า "ยกแถวนี้กลับให้ตัวสร้างตารางดูแลต่อ" ไม่ใช่ "ลบกะทิ้ง" */
      var want = release ? {
        shiftCode: cur ? String(cur.shiftCode || '') : '',
        startTime: cur ? String(cur.startTime || '') : '',
        endTime:   cur ? String(cur.endTime   || '') : '',
        note:      cur ? String(cur.note      || '') : '',
        status:    'planned', manualBy: '', manualAt: ''
      } : {
        shiftCode: shift,
        startTime: it.startTime !== undefined ? String(it.startTime || '') : String(sf.start || ''),
        endTime:   it.endTime   !== undefined ? String(it.endTime   || '') : String(sf.end   || ''),
        note:      String(it.note || '').slice(0, 200),
        /* ★★ หัวใจของทั้งฟีเจอร์ — ไม่มีทางที่คนจะลืมพิมพ์คำนี้ได้อีก */
        status:    'manual',
        manualBy:  emp.empCode,
        manualAt:  stamp
      };

      var fields = ['shiftCode', 'startTime', 'endTime', 'note', 'status'];
      var patch = {}, hit = 0;

      if (cur) {
        for (var f = 0; f < fields.length; f++) {
          var k = fields[f];
          var before = String(cur[k] === undefined ? '' : cur[k]).trim();
          var after  = String(want[k]).trim();
          if (before === after) continue;
          patch[k] = want[k]; hit++;
          /* หนึ่งแถว AuditLog ต่อหนึ่งช่องที่เปลี่ยน บันทึกค่าก่อน → หลัง */
          auditRows.push({ actor: emp.empCode, action: 'SCHEDULE_EDIT',
                           target: date + ' · ' + code + ' · ' + k,
                           detail: (before || '(ว่าง)') + ' → ' + (after || '(ว่าง)') });
        }
        if (hit) {
          patch.manualBy = want.manualBy;
          patch.manualAt = want.manualAt;
          updateRow(SHEETS.SCHEDULE, row, patch);
          changed++;
          results.push({ empCode: code, ok: true, changed: hit, action: 'update' });
        } else {
          results.push({ empCode: code, ok: true, changed: 0, action: 'same' });
        }
      } else {
        if (release) { results.push({ empCode: code, ok: false, reason: 'ยังไม่มีแถวให้คืนค่า' }); continue; }
        appendRow(SHEETS.SCHEDULE, {
          date: date, empCode: code, dept: String(e.dept || '').trim(),
          shiftCode: want.shiftCode, startTime: want.startTime, endTime: want.endTime,
          breaks: sf.breaks || '', ot: sf.ot || '',
          branch: e.branch || '', note: want.note,
          status: want.status, manualBy: want.manualBy, manualAt: want.manualAt
        });
        changed++;
        auditRows.push({ actor: emp.empCode, action: 'SCHEDULE_ADD',
                         target: date + ' · ' + code + ' · shiftCode',
                         detail: '(ไม่มีแถว) → ' + want.shiftCode });
        results.push({ empCode: code, ok: true, changed: 1, action: 'insert' });
      }
    }

    adminAuditBatch_(auditRows);
    adminDayIndexClear_(date);          /* เขียนเสร็จแล้ว index ชุดเดิมใช้ต่อไม่ได้ */

    var failed = results.filter(function (r) { return !r.ok; });
    return {
      ok: true,
      date: date,
      changed: changed,
      results: results,
      message: changed
        ? ('บันทึกแล้ว ' + changed + ' รายการ · ตั้งเป็น “แก้เอง” ให้อัตโนมัติ ' +
           'การสร้างตารางรอบหน้าจะไม่เขียนทับ' + (failed.length ? (' · ข้าม ' + failed.length + ' รายการ') : ''))
        : (failed.length ? 'ไม่มีรายการไหนบันทึกได้' : 'ไม่มีอะไรเปลี่ยน')
    };
  });
}

/* ---------------- index (date|empCode) -> เลขแถวจริง ---------------- *
 * แคชไว้ 300 วิ โดยผูกคีย์กับเวอร์ชันของตาราง Schedule
 * ดังนั้นทุกการเขียนผ่าน appendRow/updateRow และทุกการแก้ชีตด้วยมือ (ทริกเกอร์ onEdit)
 * จะทำให้ index ชุดเก่าถูกมองข้ามเองโดยอัตโนมัติ
 *
 * ★ แต่ยังเชื่อ index 100% ไม่ได้อยู่ดี — generateScheduleFromPattern เขียนด้วย
 *   setValues() ตรง ๆ ซึ่งไม่ผ่าน bumpTableVersion_ และไม่จุดทริกเกอร์ onEdit
 *   (onEdit ไม่ทำงานกับการเขียนจากสคริปต์) ทุกการเขียนจึงต้องยืนยันแถวซ้ำก่อนเสมอ
 */
function adminDayIndexKey_(date) { return 'aday_' + date + '_' + tableVersion_(SHEETS.SCHEDULE); }

function adminDayIndex_(date, fresh) {
  if (!fresh) {
    try {
      var hit = CacheService.getScriptCache().get(adminDayIndexKey_(date));
      if (hit) return { map: JSON.parse(hit) };
    } catch (e) {}
  }
  var map = {};
  readTable(SHEETS.SCHEDULE, !!fresh).forEach(function (r) {
    if (String(r.date || '').trim() !== date) return;
    var code = String(r.empCode || '').trim().toUpperCase();
    if (!code) return;
    /* ถ้ามีสองแถวของคนเดียวกันในวันเดียว ให้ยึดแถวล่างสุด (แถวที่เขียนทีหลัง)
       การมีแถวซ้ำเป็น "คำเตือน" ที่หน้าเว็บคำนวณเองและแสดงให้เห็น ไม่ใช่ error ที่นี่ */
    if (!map[code] || r._row > map[code]) map[code] = r._row;
  });
  try { CacheService.getScriptCache().put(adminDayIndexKey_(date), JSON.stringify(map), 300); } catch (e) {}
  return { map: map };
}

function adminDayIndexClear_(date) {
  try { CacheService.getScriptCache().remove(adminDayIndexKey_(date)); } catch (e) {}
}

/**
 * ★ ยืนยันว่าแถวที่จะเขียนคือแถวของคนคนนี้ในวันนี้จริง ๆ (อ่านจากชีตสด ๆ ไม่ผ่านแคช)
 * คืน object ของแถวนั้น หรือ null ถ้าไม่ตรง — ผู้เรียกต้องไปอ่าน index ใหม่
 */
function adminVerifyRow_(date, empCode, row) {
  var sh   = sheet_(SHEETS.SCHEDULE);
  var idx  = headerIndex_(SHEETS.SCHEDULE);
  var hRow = idx._headRow || 1;
  if (row <= hRow || row > sh.getLastRow()) return null;

  var nCol = Math.max(1, sh.getLastColumn());
  var head = sh.getRange(hRow, 1, 1, nCol).getDisplayValues()[0]
               .map(function (x) { return String(x).trim(); });
  var obj  = adminToObjects_(head, sh.getRange(row, 1, 1, nCol).getValues(), row)[0];
  if (!obj) return null;
  if (String(obj.date || '').trim() !== date) return null;
  if (String(obj.empCode || '').trim().toUpperCase() !== String(empCode).trim().toUpperCase()) return null;
  return obj;
}

/* =================================================================
 *  ทางเข้า — ปุ่มใน Flex
 * -----------------------------------------------------------------
 *  ★ ไม่เพิ่มช่องที่ 5 ใน rich menu ภาพเมนูใหม่ไม่มีที่ว่างแล้ว
 *    และการเพิ่มช่องแปลว่าต้องแก้ทั้งภาพ ทั้งพิกัดใน 08_RichMenu.js
 *    เพื่อคนแค่ห้าคน ซึ่งไม่คุ้มกับความเสี่ยงที่ปุ่มของพนักงาน 60 คนจะเลื่อน
 *
 *  วิธีที่ใช้แทน: ปุ่มโผล่ท้ายการ์ด "ติดต่อ HR" เฉพาะคนที่มีสิทธิ์
 *  บวกกับ URL liff.line.me ที่ bookmark ไว้บนหน้าโฮมของมือถือได้เลย
 * ================================================================= */

/** LIFF ID ของแผงควบคุม — อ่านจาก Script Property ตรง ๆ จะได้ไม่ต้องแก้ 00_Config.js */
function adminLiffId_() { return cfg('LIFF_ID_ADMIN'); }

/**
 * ปุ่มสำหรับเสียบเข้าไปใน flexHrMenu() (หรือการ์ดอื่น)
 * คืน null ถ้าคนคนนี้ไม่มีสิทธิ์ หรือยังไม่ได้ตั้ง LIFF_ID_ADMIN
 * ★ ต้องคืน null ไม่ใช่ปุ่มที่กดแล้วเด้ง error — พนักงานทั่วไปไม่ควรรู้ว่ามีหน้านี้อยู่
 */
function adminEntryButton_(emp) {
  if (!requireRole_(emp, ADMIN_ANY_ROLES)) return null;
  var id = adminLiffId_();
  if (!id) return null;
  return { type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
           action: fxUri_('🛠️ แผงควบคุม HR', liffUrl(id)) };
}

/** การ์ดเต็มใบ เผื่ออยากผูกกับ postback หรือส่งให้หัวหน้าคนใหม่ตอนเลื่อนตำแหน่ง */
function flexAdminEntry(emp) {
  var id = adminLiffId_();
  if (!requireRole_(emp, ADMIN_ANY_ROLES) || !id) {
    return { type: 'text', text: 'เมนูนี้สงวนไว้สำหรับหัวหน้าแผนกและทีม HR ค่ะ' };
  }
  var isFull = requireRole_(emp, ADMIN_FULL_ROLES);
  return fx_('แผงควบคุม HR', {
    type: 'bubble',
    header: fxHeader_('🛠️ แผงควบคุม HR', isFull ? 'ทำงานได้ครบทุกแผนกจากมือถือ'
                                                : 'เฉพาะแผนก ' + (emp.dept || '(ยังไม่ระบุ)')),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: '#FFFFFF', spacing: 'sm',
      contents: [
        { type: 'text', size: 'sm', color: C.ink, wrap: true,
          text: 'ตอบเรื่องพนักงาน อนุมัติใบลา และแก้ตารางกะรายวัน ทำได้จากโทรศัพท์โดยไม่ต้องเปิด Google Sheets' },
        { type: 'text', size: 'xxs', color: C.sub, wrap: true, margin: 'md',
          text: 'เปิดในคอมก็ได้ ใช้ลิงก์เดียวกัน แนะนำให้บันทึกลิงก์ไว้บนหน้าโฮมมือถือ' }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [fxBtn_('เปิดแผงควบคุม', fxUri_('เปิดแผงควบคุม', liffUrl(id)), 'primary', C.primary)]
    }
  });
}

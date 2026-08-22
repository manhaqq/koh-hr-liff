/*******************************************************************
 * โก๋ในซอย HR Hub — 02_Data.gs
 * ชั้นเข้าถึงข้อมูล Google Sheets (อ่าน/เขียน/ค้นหา)
 *******************************************************************/

var SS_MEMO_    = null;   /* อ็อบเจ็กต์เหล่านี้อยู่แค่ในการทำงานรอบเดียว จึงไม่มีปัญหาข้อมูลเก่าค้าง */
var SHEET_MEMO_ = {};

function ss_() {
  if (!SS_MEMO_) SS_MEMO_ = SpreadsheetApp.openById(CFG.ssId);
  return SS_MEMO_;
}

function sheet_(name) {
  if (SHEET_MEMO_[name]) return SHEET_MEMO_[name];
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต "' + name + '" — กรุณารัน initDatabase() ก่อน');
  SHEET_MEMO_[name] = sh;
  return sh;
}

/* =================================================================
 *  ชั้นแคชของตาราง
 * -----------------------------------------------------------------
 *  เดิม readTable อ่านทั้งแท็บใหม่ทุกครั้งที่ถูกเรียก การเปิดหน้าเดียว
 *  อาจอ่านแท็บเดิมซ้ำหลายรอบ ซึ่งเป็นสาเหตุหลักที่ระบบช้า
 *
 *  แคช 2 ชั้น
 *    1. memo ในหน่วยความจำ  — กันการอ่านซ้ำภายในการทำงานรอบเดียว
 *    2. CacheService        — กันการอ่านซ้ำข้ามคำขอ (นานสุด 5 นาที)
 *
 *  ★ ล้างแคชเมื่อไหร่ — สำคัญมาก
 *    HR แก้ข้อมูลในชีตโดยตรง ซึ่ง "ไม่ผ่านโค้ดนี้" ถ้าอาศัยแค่การล้างตอนเขียน
 *    ข้อมูลที่ HR เพิ่งแก้จะยังไม่ขึ้นให้พนักงานเห็น จึงต้องล้าง 3 ทาง
 *      ก. ตอนโค้ดเขียนข้อมูล        → bumpTableVersion_ ใน appendRow/updateRow
 *      ข. ตอน HR แก้ชีตด้วยมือ      → ทริกเกอร์ onEditInvalidateCache (09_Triggers.js)
 *      ค. อายุแคชหมดเอง             → กันพลาดถ้าสองข้อบนไม่ทำงาน
 * ================================================================= */

var TABLE_MEMO_   = {};
var HEADER_MEMO_  = {};
var TABLE_TTL_    = 300;        /* วินาที */
var CACHE_CHUNK_  = 30000;      /* ตัวอักษร — CacheService รับ 100KB/คีย์
                                   ภาษาไทย 1 ตัว = 3 ไบต์ 30000 ตัวจึงไม่เกิน 90KB */

function tableVersion_(name) {
  try {
    var c = CacheService.getScriptCache(), k = 'ver_' + name;
    var v = c.get(k);
    if (!v) { v = String(new Date().getTime()); c.put(k, v, 21600); }
    return v;
  } catch (e) { return '0'; }
}

/** บอกว่าตารางนี้เปลี่ยนแล้ว — แคชชุดเก่าจะถูกมองข้ามและหมดอายุไปเอง */
function bumpTableVersion_(name) {
  delete TABLE_MEMO_[name];
  delete HEADER_MEMO_[name];
  try { CacheService.getScriptCache().put('ver_' + name, String(new Date().getTime()), 21600); } catch (e) {}
}

/** ล้างแคชทุกตาราง — ใช้ตอนกู้ระบบหรือหลังนำเข้าข้อมูลก้อนใหญ่ */
function clearAllTableCache() {
  TABLE_MEMO_ = {}; HEADER_MEMO_ = {};
  try {
    var keys = [];
    for (var k in SHEETS) keys.push('ver_' + SHEETS[k]);
    CacheService.getScriptCache().removeAll(keys);
  } catch (e) {}
}

function cacheGetBig_(key) {
  try {
    var c = CacheService.getScriptCache();
    var n = parseInt(c.get(key + '_n'), 10);
    if (!n) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + '_' + i);
    var got = c.getAll(keys), s = '';
    for (var j = 0; j < n; j++) {
      if (got[key + '_' + j] == null) return null;   /* ชิ้นใดชิ้นหนึ่งหาย = ใช้ไม่ได้ทั้งชุด */
      s += got[key + '_' + j];
    }
    return JSON.parse(s);
  } catch (e) { return null; }
}

function cachePutBig_(key, obj, ttl) {
  try {
    var s = JSON.stringify(obj);
    var n = Math.ceil(s.length / CACHE_CHUNK_);
    if (n > 20) return;                              /* ใหญ่เกินกว่าจะคุ้มแคช */
    var parts = {};
    for (var i = 0; i < n; i++) parts[key + '_' + i] = s.substr(i * CACHE_CHUNK_, CACHE_CHUNK_);
    parts[key + '_n'] = String(n);
    CacheService.getScriptCache().putAll(parts, ttl);
  } catch (e) {}
}

/**
 * แปลงค่าในเซลล์ให้เป็นข้อความมาตรฐาน
 * สำคัญมาก: Google Sheets มักแปลง "2026-08-25" เป็นวันที่จริงโดยอัตโนมัติ
 * แล้วแสดงผลตามรูปแบบภาษาของไฟล์ (เช่น 25/8/2026) ซึ่งจะทำให้การเปรียบเทียบวันที่พัง
 * ฟังก์ชันนี้จึงบังคับให้ทุกวันที่กลับมาเป็น yyyy-MM-dd และเวลาเป็น HH:mm เสมอ
 */
function cellToString_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    if (v.getFullYear() < 1901) return Utilities.formatDate(v, CFG.TZ, 'HH:mm');  // เซลล์ที่เป็นเวลาล้วน
    var hasTime = v.getHours() || v.getMinutes();
    return Utilities.formatDate(v, CFG.TZ, hasTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).trim();
}

/** อ่านทั้งชีตเป็น array ของ object โดยใช้แถวแรกเป็นหัวคอลัมน์ */
/** แปลงค่าที่อาจเป็น null/undefined ให้เป็นข้อความเสมอ
 *  ★ ห้ามใช้ String(x) ตรงๆ กับค่าที่อาจไม่มี เพราะ String(undefined) = "undefined"
 *    ซึ่งเป็นข้อความที่ "มีค่า" ทำให้การตรวจ if (x) ผ่านไปได้ทั้งที่ข้อมูลหายไปแล้ว
 *    เคยทำให้ผังองค์กรแสดง 61 กล่องเปล่าโดยไม่มี error ให้เห็นเลย */
function str_(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

/** นับจำนวนช่องที่มีข้อความในแถวนั้น */
function countFilled_(row) {
  var n = 0;
  for (var i = 0; i < row.length; i++) if (String(row[i]).trim() !== '') n++;
  return n;
}

/**
 * อ่านทั้งตารางเป็น array ของ object — ผ่านแคช
 * @param {string}  name   ชื่อแท็บ
 * @param {boolean} fresh  true = ข้ามแคช บังคับอ่านจากชีตจริง
 */
function readTable(name, fresh) {
  if (!fresh && TABLE_MEMO_[name]) return TABLE_MEMO_[name];

  var key = 't_' + name + '_' + tableVersion_(name);
  if (!fresh) {
    var hit = cacheGetBig_(key);
    if (hit) { TABLE_MEMO_[name] = hit; return hit; }
  }
  var out = readTableRaw_(name);
  TABLE_MEMO_[name] = out;
  cachePutBig_(key, out, TABLE_TTL_);
  return out;
}

function readTableRaw_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(1, 1, last, Math.max(1, sh.getLastColumn())).getValues();

  /* ★ หาแถวหัวคอลัมน์จริงก่อน อย่าเชื่อว่าเป็นแถวที่ 1 เสมอ
     บางชีตมีแถวคำอธิบายแบบผสานเซลล์อยู่บนสุด ซึ่งมีข้อความอยู่ช่องเดียว
     ถ้าเผลอใช้แถวนั้นเป็นหัวคอลัมน์ ทุกฟิลด์จะกลายเป็นค่าว่างแบบเงียบๆ
     ระบบยังทำงานต่อได้แต่ข้อมูลหายหมด ซึ่งหาสาเหตุยากมาก
     กติกา: แถวหัวคอลัมน์จริงต้องมีข้อความตั้งแต่ 2 ช่องขึ้นไป */
  var h = 0;
  while (h < values.length - 1 && countFilled_(values[h]) < 2) h++;

  var head = values[h].map(function (x) { return String(x).trim(); });
  var out = [];
  for (var r = h + 1; r < values.length; r++) {
    var row = values[r];
    if (countFilled_(row) === 0) continue;
    var o = { _row: r + 1 };          // เลขแถวจริงในชีต (ใช้ตอนเขียนกลับ)
    for (var c = 0; c < head.length; c++) if (head[c]) o[head[c]] = cellToString_(row[c]);
    out.push(o);
  }
  return out;
}

function headerIndex_(name) {
  if (HEADER_MEMO_[name]) return HEADER_MEMO_[name];
  var sh = sheet_(name);
  var rows = Math.min(5, Math.max(1, sh.getLastRow()));
  var vals = sh.getRange(1, 1, rows, Math.max(1, sh.getLastColumn())).getDisplayValues();
  var h = 0;
  while (h < vals.length - 1 && countFilled_(vals[h]) < 2) h++;   // ข้ามแถวคำอธิบาย เหมือน readTable
  var idx = {};
  vals[h].forEach(function (x, i) { if (String(x).trim()) idx[String(x).trim()] = i + 1; });
  idx._headRow = h + 1;
  HEADER_MEMO_[name] = idx;
  return idx;
}

/** เพิ่มแถวใหม่จาก object */
function appendRow(name, obj) {
  var sh   = sheet_(name);
  var idx  = headerIndex_(name);          // หาแถวหัวคอลัมน์จริง (อาจไม่ใช่แถวที่ 1)
  var head = sh.getRange(idx._headRow, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var row  = head.map(function (h) {
    var k = String(h).trim();
    return (obj[k] === undefined || obj[k] === null) ? '' : obj[k];
  });
  sh.appendRow(row);
  bumpTableVersion_(name);
  return sh.getLastRow();
}

/** แก้ค่าบางคอลัมน์ในแถวที่ระบุ */
function updateRow(name, rowNumber, patch) {
  var sh  = sheet_(name);
  var idx = headerIndex_(name);
  /* เขียนทีละเซลล์ตามเดิมโดยตั้งใจ — บางแท็บมีคอลัมน์สรุปที่เป็นสูตร
     ถ้าอ่านทั้งแถวแล้วเขียนกลับด้วย setValues สูตรจะถูกทับด้วยค่าคงที่ */
  Object.keys(patch).forEach(function (k) {
    if (idx[k]) sh.getRange(rowNumber, idx[k]).setValue(patch[k]);
  });
  bumpTableVersion_(name);
}

/* ================= พนักงาน ================= */

function findEmployeeByUserId(userId) {
  if (!userId) return null;
  var cache = CacheService.getScriptCache();
  /* ผูกคีย์กับเวอร์ชันของตาราง Employees ด้วย มิฉะนั้นตอน HR สั่งพักงานหรือตัดสิทธิ์
     คนนั้นจะยังใช้ระบบได้ต่ออีกถึง 3 นาทีจนกว่าแคชแถวเดิมจะหมดอายุ */
  var key   = 'emp_' + userId + '_' + tableVersion_(SHEETS.EMPLOYEES);
  var hit   = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var rows = readTable(SHEETS.EMPLOYEES);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].lineUserId).trim() === userId) {
      cache.put(key, JSON.stringify(rows[i]), 180);   // แคช 3 นาที
      return rows[i];
    }
  }
  return null;
}

function clearEmployeeCache(userId) {
  /* คีย์มีเวอร์ชันของตารางอยู่ด้วย การเด้งเวอร์ชันจึงทิ้งแคชของทุกคนพร้อมกัน
     ซึ่งเป็นสิ่งที่ต้องการอยู่แล้วเวลาทะเบียนพนักงานเปลี่ยน */
  bumpTableVersion_(SHEETS.EMPLOYEES);
  try { CacheService.getScriptCache().remove('emp_' + userId); } catch (e) {}
}

function findEmployeeByCode(empCode) {
  if (!empCode) return null;
  var code = String(empCode).trim().toUpperCase();
  var rows = readTable(SHEETS.EMPLOYEES);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].empCode).trim().toUpperCase() === code) return rows[i];
  }
  return null;
}

/* ============ ค้นหาด้วยชื่อ — ใช้ในการยืนยันตัวตน ============ *
 * ตั้งแต่ฉบับ 2.1 พนักงานยืนยันตัวตนด้วย ชื่อ + นามสกุล + เบอร์ 4 ตัวท้าย
 * ไม่ใช้รหัสพนักงานแล้ว เพราะพนักงานหน้าร้านส่วนใหญ่จำรหัสตัวเองไม่ได้
 * ------------------------------------------------------------------
 * ⚠️ ผลข้างเคียงด้านความปลอดภัย: ชื่อ-นามสกุลเป็นข้อมูลที่เพื่อนร่วมงานรู้กันอยู่แล้ว
 *    ระบบจึงต้องมีมาตรการชดเชย ดูใน apiVerify_() ของ 06_WebApi.gs
 *      · จำกัดจำนวนครั้งทั้งฝั่งผู้กรอกและฝั่งพนักงานที่ถูกกรอกถึง
 *      · 1 พนักงาน = 1 บัญชี LINE เท่านั้น
 *      · เปิดโหมดให้ HR อนุมัติก่อนได้ (ตั้ง VERIFY_REQUIRE_APPROVAL = TRUE)
 */

/** ตัดช่องว่าง อักขระซ่อน วงเล็บ และคำนำหน้าออกจากชื่อ เพื่อให้เทียบกันได้จริง */
function normName_(s) {
  if (s === null || s === undefined) return '';
  var t = String(s);
  t = t.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');   // zero-width + nbsp ที่ติดมาจาก Excel
  if (t.indexOf('(') >= 0) t = t.slice(0, t.indexOf('('));
  t = t.replace(/^(นาย|นางสาว|น\.ส\.|นาง|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|คุณ|Mr\.?|Mrs\.?|Ms\.?)\s*/i, '');
  return t.replace(/\s+/g, '').trim().toLowerCase();
}

function last4_(s) {
  var d = String(s === null || s === undefined ? '' : s).replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : '';
}

/**
 * หาพนักงานจาก ชื่อ + นามสกุล + เบอร์ 4 ตัวท้าย
 * คืน { matches: [...], byName: n }
 *   matches = คนที่ตรงครบทั้งสามอย่าง
 *   byName  = จำนวนคนที่ชื่อ-นามสกุลตรง (ใช้แยกว่า "ไม่มีชื่อนี้" กับ "เบอร์ไม่ตรง")
 * รับชื่อเล่นแทนชื่อจริงได้ด้วย เพราะพนักงานหลายคนใช้ชื่อเล่นเป็นหลัก
 */
function findEmployeeByName(firstName, lastName, phoneLast4) {
  var f = normName_(firstName), l = normName_(lastName), p = last4_(phoneLast4);
  if (!f || !l) return { matches: [], byName: 0, codes: [] };
  var rows = readTable(SHEETS.EMPLOYEES);
  var byName = [], matches = [];
  for (var i = 0; i < rows.length; i++) {
    var e = rows[i];
    /* ★ ไม่นับคนที่พ้นสภาพแล้ว — กันสองปัญหาพร้อมกัน
       1. พนักงานปัจจุบันที่ชื่อ+เบอร์ท้ายซ้ำกับทะเบียนเก่า จะติด AMBIGUOUS ยืนยันไม่ได้ตลอดกาล
       2. ระบบไม่ควรตอบยืนยันว่า "คนนี้เคยทำงานที่นี่" ให้ใครก็ได้ที่เดาถูก */
    if (String(e.status).trim() === EMP_STATUS.RESIGNED) continue;
    if (normName_(e.lastName) !== l) continue;
    var nameHit = (normName_(e.firstName) === f) ||
                  (normName_(e.nickname) && normName_(e.nickname) === f);
    if (!nameHit) continue;
    byName.push(e);
    var stored = last4_(e.phoneLast4) || last4_(e.phone);
    if (stored && p && stored === p) matches.push(e);
  }
  return {
    matches: matches,
    byName: byName.length,
    /* รหัสพนักงานของคนที่ชื่อตรง — ใช้ทำคีย์จำกัดจำนวนครั้ง
       ต้องผูกกับตัวคน ไม่ใช่กับข้อความที่ผู้กรอกพิมพ์มา
       ไม่งั้นคนเดียวจะมีสองคีย์ (ชื่อจริง / ชื่อเล่น) ได้โควตาเดาสองเท่า */
    codes: byName.map(function (e) { return String(e.empCode).trim(); }).sort()
  };
}

/* ============ ผังองค์กร ============ */

/** คืนผังองค์กรพร้อมชื่อ-ตำแหน่งที่ดึงจากชีต Employees ให้แล้ว */
function getOrgChart() {
  var emp = {};
  readTable(SHEETS.EMPLOYEES).forEach(function (e) {
    emp[String(e.empCode).trim()] = e;
  });
  return readTable(SHEETS.ORGCHART).filter(function (n) {
    return str_(n.nodeId);          // ★ ตัดแถวที่ไม่มี nodeId ออกก่อน map
  }).map(function (n) {
    var e = emp[str_(n.empCode)] || {};
    return {
      nodeId:   str_(n.nodeId),
      level:    Number(n.level) || 0,
      titleTh:  n.titleTh || '',
      titleEn:  n.titleEn || '',
      empCode:  str_(n.empCode),
      name:     e.fullName || '',
      nickname: e.nickname || '',
      dept:     n.dept || e.dept || '',
      parentId: str_(n.parentId),
      order:    Number(n.order) || 0,
      group:    n.group || '',
      /* ★ ไม่ส่ง status ออกไป — "ใครถูกพักงาน/รออนุมัติ" เป็นข้อมูลของ HR
         หน้าเว็บต้องการรู้แค่ว่ากล่องนี้ยังใช้งานอยู่ไหม */
      active:   String(e.status || '').trim() !== EMP_STATUS.RESIGNED,
      note:     n.note || ''
    };
  });
}

/** นับกำลังพลรายแผนกจากชีต Employees (ไม่นับคนที่ลาออกแล้ว) */
function deptSummary() {
  var m = {}, order = [];
  readTable(SHEETS.EMPLOYEES).forEach(function (e) {
    if (String(e.status).trim() === EMP_STATUS.RESIGNED) return;
    var d = String(e.dept || 'ไม่ระบุแผนก').trim();
    if (!m[d]) { m[d] = { dept: d, count: 0, heads: [] }; order.push(d); }
    m[d].count++;
    if (String(e.role).trim() === ROLES.SUPERVISOR) m[d].heads.push(e.fullName);
  });
  return order.map(function (d) { return m[d]; })
              .sort(function (a, b) { return b.count - a.count; });
}

/* ============ รายการรายงาน ============ */

function getReports(role) {
  var r = String(role || ROLES.STAFF).trim();
  return readTable(SHEETS.REPORTS).filter(function (x) {
    if (String(x.status).toUpperCase() === 'OFF') return false;
    var allow = REPORT_AUDIENCE[String(x.audience).trim().toUpperCase()] || REPORT_AUDIENCE.HR;
    return allow.indexOf(r) >= 0;
  });
}

function isActive(emp) { return !!emp && String(emp.status).trim() === EMP_STATUS.ACTIVE; }

/** รายชื่อ userId ของพนักงานที่ยัง active (ใช้ส่ง multicast) */
function activeUserIds(filter) {
  return readTable(SHEETS.EMPLOYEES)
    .filter(function (e) { return isActive(e) && String(e.lineUserId).trim(); })
    .filter(function (e) {
      if (!filter) return true;
      if (filter.branch && String(e.branch).trim() !== filter.branch) return false;
      if (filter.dept   && String(e.dept).trim()   !== filter.dept)   return false;
      if (filter.role   && String(e.role).trim()   !== filter.role)   return false;
      return true;
    })
    .map(function (e) { return String(e.lineUserId).trim(); });
}

/** ผูก LINE userId เข้ากับรหัสพนักงาน (ขั้นตอนยืนยันตัวตน) */
function bindEmployee(empCode, userId, displayName, targetStatus) {
  var emp = findEmployeeByCode(empCode);
  if (!emp) return { ok: false, reason: 'NOT_FOUND' };
  if (String(emp.status).trim() === EMP_STATUS.RESIGNED)  return { ok: false, reason: 'RESIGNED' };
  if (String(emp.status).trim() === EMP_STATUS.SUSPENDED) return { ok: false, reason: 'SUSPENDED' };
  var bound = String(emp.lineUserId).trim();
  if (bound && bound !== userId) return { ok: false, reason: 'ALREADY_BOUND' };

  /* ★ สถานะปลายทางต้องตัดสินใจ "ก่อน" เขียน ไม่ใช่เขียน active แล้วค่อยลดเป็น pending
     ไม่งั้นจะมีช่วงที่บัญชีเป็น active จริงและถูกแคชไว้ 3 นาที ทั้งที่ HR ยังไม่อนุมัติ */
  var st = targetStatus || EMP_STATUS.ACTIVE;
  updateRow(SHEETS.EMPLOYEES, emp._row, {
    lineUserId:  userId,
    lineName:    displayName || '',
    status:      st,
    verifiedAt:  now_()
  });
  clearEmployeeCache(userId);
  audit(userId, st === EMP_STATUS.ACTIVE ? 'VERIFY_SUCCESS' : 'VERIFY_PENDING',
        emp.empCode, 'ผูกบัญชี LINE แล้ว · สถานะ ' + st);
  return { ok: true, emp: findEmployeeByCode(empCode) };
}

/* ================= ประกาศ ================= */

function getAnnouncements(emp, limit) {
  var today = todayStr_();
  return readTable(SHEETS.ANNOUNCEMENTS)
    .filter(function (a) {
      if (String(a.status).trim() !== 'published') return false;
      if (a.publishAt && String(a.publishAt).trim() > today) return false;
      if (a.expireAt  && String(a.expireAt).trim()  && String(a.expireAt).trim() < today) return false;
      return matchAudience_(a, emp);
    })
    .sort(function (x, y) {
      var p = (String(y.pinned).toUpperCase() === 'TRUE' ? 1 : 0) - (String(x.pinned).toUpperCase() === 'TRUE' ? 1 : 0);
      if (p !== 0) return p;
      return String(y.date).localeCompare(String(x.date));
    })
    .slice(0, limit || 100);
}

function matchAudience_(item, emp) {
  var aud = String(item.audience || 'all').trim();
  if (!aud || aud === 'all') return true;
  if (!emp) return false;
  var val = String(item.audienceValue || '').split(',').map(function (s) { return s.trim(); });
  if (aud === 'branch') return val.indexOf(String(emp.branch).trim()) >= 0;
  if (aud === 'dept')   return val.indexOf(String(emp.dept).trim())   >= 0;
  if (aud === 'role')   return val.indexOf(String(emp.role).trim())   >= 0;
  if (aud === 'person') return val.indexOf(String(emp.empCode).trim()) >= 0;
  return true;
}

/* ================= คู่มือ ================= */

function getHandbook() {
  return readTable(SHEETS.HANDBOOK)
    .filter(function (h) { return String(h.status).trim() !== 'hidden'; })
    .sort(function (a, b) {
      var c = String(a.category).localeCompare(String(b.category));
      if (c !== 0) return c;
      return (Number(a.order) || 999) - (Number(b.order) || 999);
    });
}

function handbookCategories() {
  var seen = {}, out = [];
  getHandbook().forEach(function (h) {
    var c = String(h.category).trim();
    if (!c || seen[c]) return;
    seen[c] = true;
    out.push(c);
  });
  return out;
}

/* ================= ตารางงาน ================= */

function getScheduleFor(empCode, fromDate, toDate) {
  var code = String(empCode).trim().toUpperCase();
  /* ★ empCode ว่าง = ไม่ตรงกับใครเลย ห้ามปล่อยให้ '' ไปแมตช์กับแถวที่ empCode ว่างเหมือนกัน
     (ในชีต Schedule มีแถวแบบนั้นจริง จากรูปแบบกะที่ยังจับคู่ชื่อไม่ได้) */
  if (!code) return [];
  var shiftMap = {};
  readTable(SHEETS.SHIFTS).forEach(function (s) { shiftMap[String(s.shiftCode).trim()] = s; });
  return readTable(SHEETS.SCHEDULE)
    .filter(function (r) {
      if (String(r.empCode).trim().toUpperCase() !== code) return false;
      var d = String(r.date).trim();
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      return true;
    })
    .map(function (r) {
      var s = shiftMap[String(r.shiftCode).trim()] || {};
      return {
        date:      String(r.date).trim(),
        shiftCode: String(r.shiftCode).trim(),
        shiftName: s.label || s.name || String(r.shiftCode).trim(),
        dept:      r.dept || s.dept || '',
        start:     r.startTime || s.start || '',
        end:       r.endTime   || s.end   || '',
        breaks:    r.breaks    || s.breaks || '',
        ot:        r.ot        || s.ot     || '',
        branch:    r.branch || '',
        color:     s.color || CFG.BRAND.primary,
        note:      r.note || '',
        status:    r.status || ''
      };
    })
    .sort(function (a, b) { return a.date.localeCompare(b.date); });
}

/* ================= FAQ ================= */

function getFaqs() {
  return readTable(SHEETS.FAQ).filter(function (f) {
    return String(f.active).toUpperCase() !== 'FALSE';
  });
}

/* ================= เรื่องถึง HR ================= */

function createTicket(data) {
  var id = 'TK' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMMdd') + '-' +
           String(Math.floor(Math.random() * 9000) + 1000);
  var cat = TICKET_CATEGORIES.filter(function (c) { return c.id === data.category; })[0]
            || { label: data.category, sla: 3 };
  var anon = data.privacy === PRIVACY.ANONYMOUS;
  appendRow(SHEETS.TICKETS, {
    ticketId:   id,
    createdAt:  now_(),
    empCode:    anon ? '' : (data.empCode || ''),
    name:       anon ? '(ไม่ระบุตัวตน)' : (data.name || ''),
    branch:     anon ? '' : (data.branch || ''),
    lineUserId: anon ? '' : (data.lineUserId || ''),
    category:   cat.label,
    categoryId: data.category || 'other',
    privacy:    data.privacy || PRIVACY.NORMAL,
    subject:    data.subject || '',
    detail:     data.detail || '',
    attachment: data.attachment || '',
    priority:   data.priority || 'ปกติ',
    status:     'ใหม่',
    assignee:   '',
    slaDue:     addDaysStr_(cat.sla),
    reply:      '',
    closedAt:   ''
  });
  return { ticketId: id, sla: cat.sla, category: cat.label };
}

function findTicket(ticketId) {
  var rows = readTable(SHEETS.TICKETS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].ticketId).trim().toUpperCase() === String(ticketId).trim().toUpperCase()) return rows[i];
  }
  return null;
}

function myTickets(empCode, lineUserId) {
  return readTable(SHEETS.TICKETS).filter(function (t) {
    return (empCode && String(t.empCode).trim() === String(empCode).trim()) ||
           (lineUserId && String(t.lineUserId).trim() === lineUserId);
  }).reverse();
}

/* ================= ใบลา ================= */

function createLeave(data) {
  var id = 'LV' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMMdd') + '-' +
           String(Math.floor(Math.random() * 9000) + 1000);
  appendRow(SHEETS.LEAVE, {
    leaveId:   id,
    createdAt: now_(),
    empCode:   data.empCode || '',
    name:      data.name || '',
    branch:    data.branch || '',
    type:      data.type || '',
    dateFrom:  data.dateFrom || '',
    dateTo:    data.dateTo || '',
    days:      data.days || '',
    reason:    data.reason || '',
    status:    'รออนุมัติ',
    approver:  '',
    decidedAt: '',
    remark:    ''
  });
  return { leaveId: id };
}

/* ================= Audit Log ================= */

function audit(actor, action, target, detail) {
  try {
    appendRow(SHEETS.AUDIT, {
      timestamp: now_(),
      actor:     actor || '',
      action:    action || '',
      target:    target || '',
      detail:    typeof detail === 'string' ? detail : JSON.stringify(detail || '')
    });
  } catch (e) { console.error('audit failed: ' + e); }
}

/* ================= Settings (key/value) ================= */

function setting(key, fallback) {
  var rows = readTable(SHEETS.SETTINGS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key).trim() === key) return rows[i].value;
  }
  return fallback === undefined ? '' : fallback;
}

/* ================= Helper วันที่ ================= */

function now_()      { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function todayStr_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }
function addDaysStr_(n) {
  var d = new Date(); d.setDate(d.getDate() + Number(n || 0));
  return Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd');
}
function thaiDate_(yyyymmdd) {
  var m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var p = String(yyyymmdd).split('-');
  if (p.length !== 3) return String(yyyymmdd);
  return Number(p[2]) + ' ' + m[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543 - 2500);
}
function thaiDay_(yyyymmdd) {
  var d = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  var dt = new Date(String(yyyymmdd) + 'T00:00:00+07:00');
  return isNaN(dt) ? '' : d[dt.getDay()];
}
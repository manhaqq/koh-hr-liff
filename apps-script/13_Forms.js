/*******************************************************************
 * โก๋ในซอย HR Hub — 13_Forms.gs
 * เอนจินแบบฟอร์ม/ข้อสอบ — "ข้อสอบ" เป็นแค่ค่าหนึ่งในคอลัมน์ type
 * -----------------------------------------------------------------
 * ★ ทำไมเซิร์ฟเวอร์ต้องเป็น state machine ไม่ใช่หน้าเว็บ
 *   ถ้าให้หน้าเว็บถือชุดคำถามทั้งชุดไว้แล้วค่อยส่งกลับมาตรวจตอนจบ
 *   จะเกิดสามปัญหาพร้อมกัน
 *     1. เฉลย (correct/explain) ต้องเดินทางลงไปถึงเครื่องก่อนผู้ใช้ตอบ
 *        เปิด devtools หรือดัก response ครั้งเดียวก็ได้เฉลยทั้งชุด
 *     2. "ห้ามย้อนกลับไปแก้คำตอบ" กลายเป็นแค่การซ่อนปุ่มใน UI
 *        ซึ่งใครก็ตามที่ยิง request เองข้ามได้ทันที
 *     3. โทรศัพท์เข้าหรือแบตหมดกลางคัน = ทำใหม่ตั้งแต่ต้น
 *   การเก็บสถานะไว้ฝั่งเซิร์ฟเวอร์แก้ทั้งสามข้อด้วยโครงสร้างเดียว
 *   และ quiz_answer คืน "ผลการตรวจ + คำถามข้อถัดไป" ในคำตอบเดียว
 *   จึงยังเป็น 1 รอบเครือข่ายต่อ 1 ข้อ ไม่ใช่ 2
 *
 * ★ ทำไมคำตอบทั้งชุดอยู่ในเซลล์เดียวเป็น JSON
 *   {"QP01":"B","QV03":"A,C"} ยาวราว 200 อักขระ จากลิมิตเซลล์ 50,000
 *   จึงไม่ต้องมีแท็บที่สี่ ไม่ต้องเขียนสองรอบต่อข้อ และเซลล์ที่ขึ้นต้นด้วย {
 *   เป็นสูตรไม่ได้อยู่แล้ว จึงไม่เพิ่มพื้นผิว formula injection
 *
 * ★ จุดเชื่อมเดียวกับระบบเดิม: handleFormsApi_() คืน null ถ้าไม่ใช่งานของไฟล์นี้
 *******************************************************************/

var FORM_SHEETS = {
  FORMS: 'Forms',
  ITEMS: 'FormItems',
  RESP:  'FormResponses'
};

var FORM_HEAD_ = ['formId','type','title','description','audience','audienceValue','drawRules',
                  'passMark','retakePolicy','cooldownHours','shuffle','showExplain',
                  'openFrom','dueDate','status','updatedAt'];

var ITEM_HEAD_ = ['qId','formId','pool','order','type','question',
                  'choiceA','choiceB','choiceC','choiceD','choiceE',
                  'correct','explain','sourceTab','sourceId','points','status','updatedAt'];

var RESP_HEAD_ = ['attemptId','formId','empCode','name','dept','branch','attemptNo',
                  'startedAt','submittedAt','status','qIds','answers',
                  'score','total','percent','passed','durationSec'];

var CHOICE_KEYS_ = ['A','B','C','D','E'];

/** สถานะของ 1 ครั้งที่ทำ */
var ATTEMPT_STATUS = { OPEN: 'in_progress', DONE: 'submitted' };

/* =================================================================
 *  จุดเชื่อมเดียวกับ 06_WebApi.js
 *  คืน null = ไม่ใช่คำสั่งของไฟล์นี้ ให้ dispatcher เดิมทำงานต่อ
 * ================================================================= */
function handleFormsApi_(action, d, emp, userId) {
  var a = String(action || '');
  /* รับ userId ไว้ให้ครบตามสัญญาของ dispatcher แต่ไม่ใช้โดยตั้งใจ
     ทุกอย่างในไฟล์นี้อ้างอิงด้วย empCode เท่านั้น เพื่อไม่ให้ lineUserId
     หลุดลง AuditLog หรือข้อความ error ได้เลยแม้แต่ทางเดียว */

  if (a === 'quiz_list')   return apiQuizList_(emp);
  if (a === 'quiz_start')  return apiQuizStart_(emp, d);
  if (a === 'quiz_answer') return apiQuizAnswer_(emp, d);
  if (a === 'quiz_result') return apiQuizResult_(emp, d);

  /* R11/R12 เป็นรายงานของฟีเจอร์นี้ จึงดักไว้ก่อน apiReportData_ เดิม
     ทำแบบนี้เพื่อไม่ต้องแก้ 06_WebApi.js — id อื่นคืน null ให้ของเดิมทำต่อ */
  if (a === 'report_data') {
    var rid = String((d && d.reportId) || '').trim().toUpperCase();
    if (rid === 'R11') return apiQuizTeamReport_(emp);
    if (rid === 'R12') return apiQuizMyReport_(emp);
  }
  return null;
}

/* =================================================================
 *  ตัวช่วยระดับชีต
 * ================================================================= */

function formsSheetExists_(name) {
  try { return !!ss_().getSheetByName(name); } catch (e) { return false; }
}

/** อ่านตารางแบบไม่ระเบิดถ้ายังไม่มีแท็บ — ฟีเจอร์นี้ต้องปิดตัวเองอย่างเงียบ ๆ ได้ */
function formsRead_(name, fresh) {
  if (!formsSheetExists_(name)) return [];
  try { return readTable(name, fresh); } catch (e) { return []; }
}

var FORMS_NOT_READY_ = {
  ok: false, code: 'FORMS_NOT_READY',
  message: 'ระบบแบบทดสอบยังไม่ได้ติดตั้ง — แจ้ง HR ให้รัน “ติดตั้งระบบแบบทดสอบ” ในชีตก่อน'
};

function formsReady_() {
  return formsSheetExists_(FORM_SHEETS.FORMS) &&
         formsSheetExists_(FORM_SHEETS.ITEMS) &&
         formsSheetExists_(FORM_SHEETS.RESP);
}

/* =================================================================
 *  ① ติดตั้งแท็บ — เขียนเองทั้งหมด ไม่ต่อท้าย initDatabase()
 * -----------------------------------------------------------------
 *  ★ ทำไมไม่ใช้ initDatabase()
 *    initDatabase เขียนหัวคอลัมน์ลง "แถวที่ 1 เสมอ" แต่ readTableRaw_
 *    หาแถวหัวคอลัมน์จริงเอง (ข้ามแถวคำอธิบายที่ผสานเซลล์ไว้ด้านบน)
 *    ถ้าแท็บไหนหัวคอลัมน์จริงอยู่แถว 2 คอลัมน์ใหม่จะถูกเขียนลงแถว 1
 *    แล้วโค้ดจะมองไม่เห็นมันเลย — พังแบบเงียบสนิท ไม่มี error ให้จับ
 *    ฟังก์ชันนี้จึงหาแถวหัวคอลัมน์ด้วยกติกาเดียวกับ readTableRaw_ ก่อนเสมอ
 * ================================================================= */
function ensureFormsSheets() {
  var made = [];

  made.push(ensureFormsSheetHead_(FORM_SHEETS.FORMS, FORM_HEAD_));
  made.push(ensureFormsSheetHead_(FORM_SHEETS.ITEMS, ITEM_HEAD_));
  made.push(ensureFormsSheetHead_(FORM_SHEETS.RESP,  RESP_HEAD_));

  /* AppGuide ยังไม่มีคอลัมน์ updatedAt ซึ่งจำเป็นต่อการตั้งธง "นโยบายเปลี่ยนแล้ว"
     เติมต่อท้ายเท่านั้น ห้ามแตะคอลัมน์เดิม และห้ามสร้างแท็บนี้ขึ้นใหม่เอง */
  var addedAppGuide = addColumnIfMissing_(SHEETS.APPGUIDE, 'updatedAt');

  var seeded = seedFormsIfEmpty_();
  var reports = ensureQuizReportRows_();

  var msg = '✅ ติดตั้งระบบแบบทดสอบเรียบร้อย\n\n' +
    '• แท็บ: ' + made.map(function (m) { return m.name + (m.created ? ' (สร้างใหม่)' : (m.added.length ? ' (+' + m.added.length + ' คอลัมน์)' : ' (ครบอยู่แล้ว)')); }).join('\n         ') + '\n' +
    '• AppGuide: ' + (addedAppGuide ? 'เพิ่มคอลัมน์ updatedAt แล้ว' : 'มีคอลัมน์ updatedAt อยู่แล้ว') + '\n' +
    '• คลังข้อสอบ: ' + (seeded ? ('ใส่ตัวอย่าง ' + seeded + ' ข้อให้แล้ว') : 'มีข้อสอบอยู่แล้ว ไม่ทับของเดิม') + '\n' +
    '• แท็บ Reports: ' + (reports ? ('เพิ่ม ' + reports + ' รายการ (R11/R12)') : 'มี R11/R12 อยู่แล้ว') + '\n\n' +
    '★ แบบทดสอบชุดตัวอย่างตั้ง status = off ไว้ ต้องให้ HR อ่านทวนทุกข้อก่อน\n' +
    '  แล้วค่อยเปลี่ยนเป็น on ในแท็บ Forms จึงจะมองเห็นได้';

  try { alert_('ระบบแบบทดสอบ', msg); } catch (e) { Logger.log(msg); }
  return msg;
}

/** หาแถวหัวคอลัมน์จริง แล้วเติมเฉพาะคอลัมน์ที่ขาด — ไม่เคยเขียนทับของเดิม */
function ensureFormsSheetHead_(name, head) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  var created = false;
  if (!sh) { sh = ss.insertSheet(name); created = true; }

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  var cur = (lastCol && lastRow)
    ? sh.getRange(1, 1, Math.min(5, lastRow), lastCol).getDisplayValues()
    : [[]];

  var h = 0;
  while (h < cur.length - 1 && countFilled_(cur[h]) < 2) h++;   // กติกาเดียวกับ readTableRaw_
  var row = (cur[h] || []).map(function (x) { return String(x).trim(); });
  var filled = row.filter(String);

  if (!filled.length) {
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    styleFormsHead_(sh, 1, head.length);
    bumpTableVersion_(name);
    return { name: name, created: true, added: head.slice() };
  }

  var missing = head.filter(function (x) { return row.indexOf(x) < 0; });
  if (missing.length) {
    sh.getRange(h + 1, row.length + 1, 1, missing.length).setValues([missing]);
    styleFormsHead_(sh, h + 1, row.length + missing.length);
    bumpTableVersion_(name);
  }
  return { name: name, created: created, added: missing };
}

function styleFormsHead_(sh, rowNum, nCols) {
  try {
    sh.getRange(rowNum, 1, 1, nCols)
      .setBackground(CFG.BRAND.primary).setFontColor('#FFFFFF').setFontWeight('bold')
      .setVerticalAlignment('middle');
    sh.setFrozenRows(rowNum);
    sh.setRowHeight(rowNum, 34);
  } catch (e) { console.warn('styleFormsHead_: ' + e); }
}

/** เติมคอลัมน์เดียวต่อท้ายแท็บที่มีอยู่แล้ว — ไม่สร้างแท็บใหม่ ไม่แตะคอลัมน์เดิม */
function addColumnIfMissing_(name, col) {
  if (!formsSheetExists_(name)) return false;
  var sh = ss_().getSheetByName(name);
  var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
  if (!lastCol || !lastRow) return false;
  var cur = sh.getRange(1, 1, Math.min(5, lastRow), lastCol).getDisplayValues();
  var h = 0;
  while (h < cur.length - 1 && countFilled_(cur[h]) < 2) h++;
  var row = (cur[h] || []).map(function (x) { return String(x).trim(); });
  if (row.indexOf(col) >= 0) return false;
  sh.getRange(h + 1, row.length + 1).setValue(col);
  styleFormsHead_(sh, h + 1, row.length + 1);
  bumpTableVersion_(name);
  return true;
}

/** เขียนหลายแถวรวดเดียว — เร็วกว่า appendRow ทีละแถว 30 ครั้งมาก */
function formsBulkAppend_(name, objs) {
  if (!objs.length) return 0;
  var sh = sheet_(name);
  var idx = headerIndex_(name);
  var head = sh.getRange(idx._headRow, 1, 1, sh.getLastColumn()).getDisplayValues()[0]
               .map(function (x) { return String(x).trim(); });
  var values = objs.map(function (o) {
    return head.map(function (k) { return k ? safeCell_(o[k] === undefined ? '' : o[k]) : ''; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, values.length, head.length).setValues(values);
  bumpTableVersion_(name);
  return values.length;
}

/* =================================================================
 *  ② คลังข้อสอบตั้งต้น
 * -----------------------------------------------------------------
 *  ★ ทุกข้อเขียนด้วยมือจากเนื้อหาที่มีคนรีวิวแล้วในรีโป
 *    (คู่มือพนักงานฉบับพกพา manual/src/01-staff.html, โครงหมวดคู่มือพนักงาน,
 *     ตาราง SLA ใน 00_Config.js และหน้าคู่มือแอปในระบบ)
 *    ไม่ให้ LLM แต่งข้อสอบเอง เพราะจะกลายเป็นการเอาข้อความนโยบายที่ไม่มีใคร
 *    รีวิววางตรงหน้าพนักงาน 60 คนเหมือนเป็นของจริง
 *
 *  ★ แบบทดสอบชุดนี้เกิดมาพร้อม status = off โดยตั้งใจ
 *    HR ต้องอ่านทวนทุกข้อแล้วเปลี่ยนเป็น on เอง จึงจะมีใครเห็น
 *
 *  รูปแบบ 1 แถว: [pool, คำถาม, [ตัวเลือก A-D], เฉลย, คำอธิบาย, แท็บต้นทาง, [คำค้นหาต้นทาง]]
 *  คำค้นหาต้นทางใช้จับคู่กับแถวจริงในชีตตอนติดตั้ง เรียงจากคำเฉพาะไปคำกว้าง
 *  ถ้าจับคู่ไม่ได้จะปล่อย sourceId ว่าง แล้วรายงานความครอบคลุมจะฟ้องให้ HR เติมเอง
 *  ★ ตั้งใจให้ "ยังไม่ผูก" ดังกว่า "ผูกมั่ว" — ลิงก์ที่ชี้ผิดอันตรายกว่าไม่มีลิงก์
 * ================================================================= */

var FORM_SEED_ID_ = 'F001';

var QUIZ_SEED_ = [
  /* ---------- pool: policy — ระเบียบและกระบวนการที่พนักงานต้องใช้จริง ---------- */
  ['policy', 'การยืนยันตัวตนพนักงานในไลน์ของร้าน ต้องกรอกข้อมูลอะไรบ้าง',
   ['รหัสพนักงาน และรหัสผ่าน',
    'ชื่อจริง นามสกุล และเบอร์โทร 4 ตัวท้าย',
    'เลขบัตรประชาชน 13 หลัก',
    'ชื่อเล่น และวันเกิด'],
   'B',
   'ยืนยันด้วยชื่อจริง นามสกุล และเบอร์โทร 4 ตัวท้ายที่แจ้งไว้กับร้าน ไม่ใช้รหัสพนักงาน เพราะพนักงานหน้าร้านส่วนใหญ่จำรหัสตัวเองไม่ได้',
   'Handbook', ['ยืนยันตัวตน', 'เริ่มต้นใช้งาน']],

  ['policy', 'เปลี่ยนเบอร์โทรศัพท์แล้ว ควรทำอย่างไร',
   ['ไม่ต้องทำอะไร ระบบอัปเดตให้เอง',
    'บอกเพื่อนร่วมงานไว้ก็พอ',
    'ส่งเรื่องแจ้งเปลี่ยนข้อมูลส่วนตัวผ่านเมนูติดต่อ HR',
    'รอให้ HR ถามเอง'],
   'C',
   'ต้องแจ้ง HR เอง ถ้าไม่แจ้ง เมื่อเปลี่ยนโทรศัพท์หรือบัญชีไลน์แล้วจะยืนยันตัวตนใหม่ไม่ได้ เพราะเบอร์ 4 ตัวท้ายในทะเบียนจะไม่ตรง',
   'Handbook', ['เปลี่ยนข้อมูลส่วนตัว', 'ข้อมูลส่วนบุคคล', 'ยืนยันตัวตน']],

  ['policy', 'ตกลงสลับกะกับเพื่อนกันเองแล้ว ถือว่าเปลี่ยนกะเรียบร้อยหรือยัง',
   ['เรียบร้อยแล้ว ถ้าทั้งสองคนตกลงกัน',
    'เรียบร้อยแล้ว ถ้าแจ้งในกลุ่มไลน์',
    'ยังไม่เรียบร้อย ต้องส่งเรื่องขอสลับกะและได้รับอนุมัติก่อน',
    'ยังไม่เรียบร้อย ต้องเขียนใส่กระดานหน้าร้าน'],
   'C',
   'การตกลงกันเองยังไม่ถือว่าเปลี่ยนกะ ต้องใช้เมนูติดต่อ HR หัวข้อ “ตารางงาน / ขอสลับกะ” และได้รับอนุมัติก่อนจึงมีผล',
   'Handbook', ['สลับกะ', 'ตารางงาน', 'การเข้าออกงาน']],

  ['policy', 'ถ้าส่งเรื่องร้องเรียนแบบ “ไม่เปิดเผยชื่อ” จะเกิดอะไรขึ้น',
   ['HR ตอบกลับหาเราได้ตามปกติ',
    'ระบบตอบกลับหาเราไม่ได้ ต้องจดรหัสเรื่องไว้ติดตามเอง',
    'หัวหน้าแผนกยังเห็นชื่อเราอยู่ดี',
    'เรื่องจะถูกปิดอัตโนมัติใน 7 วัน'],
   'B',
   'แบบไม่เปิดเผยชื่อ ระบบไม่บันทึกชื่อเลย จึงตอบกลับหาเราไม่ได้ ให้จดรหัสเรื่องที่ระบบให้มาแล้วใช้ติดตามผลเอง',
   'Handbook', ['ร้องเรียน', 'ความลับ', 'ติดต่อ HR']],

  ['policy', 'อยากได้คำตอบกลับ แต่ไม่อยากให้หัวหน้าแผนกเห็นชื่อ ควรเลือกระดับความเป็นส่วนตัวแบบใด',
   ['ปกติ', 'เฉพาะ HR', 'ไม่เปิดเผยชื่อ', 'ไม่มีแบบไหนทำได้'],
   'B',
   'แบบ “เฉพาะ HR” ฝ่ายบุคคลเห็นชื่อและตอบกลับได้ แต่ไม่ผ่านหัวหน้าแผนก ส่วนแบบไม่เปิดเผยชื่อจะตอบกลับไม่ได้เลย',
   'Handbook', ['ร้องเรียน', 'ความลับ', 'ติดต่อ HR']],

  ['policy', 'เรื่อง “การลา / วันหยุด” และ “ขอสลับกะ” ฝ่ายบุคคลตอบภายในกี่วันทำการ',
   ['ภายในวันเดียวกัน', '1 วันทำการ', '3 วันทำการ', '7 วันทำการ'],
   'B',
   'ตามตารางกำหนดเวลาตอบในคู่มือ เรื่องการลาและเรื่องตารางงาน/ขอสลับกะ ตอบภายใน 1 วันทำการ เพราะกระทบตารางกะทันที',
   'Handbook', ['การลา', 'ติดต่อ HR']],

  ['policy', 'ขอใบรับรองการทำงานหรือใบรับรองเงินเดือน ตอบภายในกี่วันทำการ',
   ['1 วันทำการ', '2 วันทำการ', '3 วันทำการ', '10 วันทำการ'],
   'C',
   'หมวด “ขอเอกสาร / ใบรับรอง” ตอบภายใน 3 วันทำการ เท่ากับหมวดสวัสดิการ/ประกันสังคม',
   'Handbook', ['ขอเอกสาร', 'ใบรับรอง', 'สวัสดิการ']],

  ['policy', 'ระบบไลน์ของร้านเก็บเลขบัตรประชาชนของพนักงานไว้หรือไม่',
   ['เก็บครบ 13 หลัก',
    'เก็บเฉพาะ 4 หลักแรก',
    'ไม่เก็บเลย เก็บแค่เบอร์โทร 4 ตัวท้ายไว้ยืนยันตัวตน',
    'เก็บเฉพาะพนักงานรายวัน'],
   'C',
   'ระบบนี้ไม่เก็บเลขบัตรประชาชนและไม่เก็บเงินเดือน เก็บแค่เบอร์โทร 4 ตัวท้ายไว้ยืนยันตัวตนเท่านั้น',
   'Handbook', ['ข้อมูลส่วนบุคคล', 'ความเป็นส่วนตัว', 'การรักษาข้อมูล']],

  ['policy', 'เพื่อนร่วมงานเห็นข้อมูลอะไรของเราได้บ้างในระบบนี้',
   ['เห็นทุกอย่างรวมถึงเบอร์โทร',
    'เห็นชื่อ ตำแหน่ง แผนก และกะที่ทำงานร่วมกัน แต่ไม่เห็นเบอร์โทรและสถานะการจ้าง',
    'เห็นเฉพาะชื่อเล่น',
    'ไม่เห็นอะไรเลย'],
   'B',
   'เพื่อนร่วมงานเห็นชื่อ ตำแหน่ง แผนก และกะที่ทำงานร่วมกันเท่านั้น เบอร์โทรและสถานะการจ้างเป็นข้อมูลที่ไม่เปิดให้เพื่อนร่วมงานเห็น',
   'Handbook', ['ข้อมูลส่วนบุคคล', 'ความเป็นส่วนตัว', 'การรักษาข้อมูล']],

  ['policy', 'ร้านเก็บทะเบียนพนักงานไว้อย่างน้อยกี่ปีตามที่กฎหมายแรงงานกำหนด',
   ['6 เดือน', '1 ปี', '2 ปี', '10 ปี'],
   'C',
   'กฎหมายแรงงานกำหนดให้เก็บทะเบียนลูกจ้างไว้อย่างน้อย 2 ปี ระบบจึงไม่ลบแถวของพนักงานที่ลาออกแล้ว',
   'Handbook', ['ข้อมูลส่วนบุคคล', 'การรักษาข้อมูล']],

  ['policy', 'ลิงก์ปฏิทินตารางกะที่กดเพิ่มลงมือถือ ส่งต่อให้คนอื่นได้หรือไม่',
   ['ได้ ถ้าเป็นเพื่อนร่วมแผนก',
    'ได้ ถ้าเป็นหัวหน้ากะ',
    'ไม่ได้ เพราะใครที่ได้ลิงก์จะเห็นตารางกะของเราทั้งหมด',
    'ได้ เพราะลิงก์หมดอายุเองทุกวัน'],
   'C',
   'ลิงก์ปฏิทินเป็นของเราคนเดียว ใครได้ลิงก์ไปจะเห็นตารางกะทั้งหมด ถ้าเผลอส่งไปแล้วให้แจ้ง HR เพื่อออกลิงก์ใหม่',
   'Handbook', ['ตารางงาน', 'ข้อมูลส่วนบุคคล']],

  ['policy', 'ตารางกะที่ขึ้นในระบบไม่ตรงกับที่ตกลงไว้ ควรทำอะไรก่อนเป็นอันดับแรก',
   ['ไม่ต้องมาทำงานตามที่ระบบขึ้น',
    'แจ้งหัวหน้ากะก่อน ถ้ายังไม่ได้แก้จึงส่งเรื่องผ่านเมนูติดต่อ HR',
    'โพสต์ถามในกลุ่มไลน์เพื่อน',
    'รอให้ระบบแก้เอง'],
   'B',
   'ให้แจ้งหัวหน้ากะก่อนเสมอ เพราะแก้ได้เร็วที่สุด ถ้ายังไม่ได้แก้จึงส่งเรื่องผ่านเมนูติดต่อ HR หัวข้อตารางงาน',
   'Handbook', ['ตารางงาน', 'การรายงานปัญหา', 'การเข้าออกงาน']],

  /* ---------- pool: vision — รากฐาน อุดมการณ์ และโครงคู่มือพนักงาน ---------- */
  ['vision', 'หมวดหลักหมวดแรกของคู่มือพนักงานร้านโก๋ในซอย คือหมวดใด',
   ['รายได้และสวัสดิภาพของพนักงาน',
    'รากฐานและอุดมการณ์ขององค์กร',
    'ความเป็นมืออาชีพของพนักงาน',
    'แนวทางการปฏิบัติงานของพนักงาน'],
   'B',
   'คู่มือเริ่มจากหมวด “รากฐานและอุดมการณ์ขององค์กร” ซึ่งรวมประวัติความเป็นมา วิสัยทัศน์ ภารกิจหลัก และคุณค่าขององค์กร',
   'Handbook', ['รากฐาน', 'อุดมการณ์', 'วิสัยทัศน์']],

  ['vision', 'หัวข้อ “วิสัยทัศน์” และ “ภารกิจหลัก” อยู่ในหมวดใดของคู่มือพนักงาน',
   ['รากฐานและอุดมการณ์ขององค์กร',
    'รายได้และสวัสดิภาพของพนักงาน',
    'ความเป็นมืออาชีพของพนักงาน',
    'การรักษาภาพลักษณ์และทรัพยากรขององค์กร'],
   'A',
   'วิสัยทัศน์และภารกิจหลักอยู่ในหมวดรากฐานและอุดมการณ์ขององค์กร ร่วมกับประวัติความเป็นมาและคุณค่า',
   'Handbook', ['วิสัยทัศน์', 'ภารกิจ', 'รากฐาน']],

  ['vision', 'หัวข้อ “ศาสนกิจ” และ “การละหมาด” อยู่ในหมวดใดของคู่มือพนักงาน',
   ['รากฐานและอุดมการณ์ขององค์กร',
    'รายได้และสวัสดิภาพของพนักงาน',
    'แนวทางการปฏิบัติงานของพนักงาน',
    'การรักษาภาพลักษณ์และทรัพยากรขององค์กร'],
   'B',
   'ศาสนกิจและการละหมาดอยู่ในหมวดรายได้และสวัสดิภาพของพนักงาน ร่วมกับสวัสดิการและเส้นทางความก้าวหน้า',
   'Handbook', ['ละหมาด', 'ศาสนกิจ', 'สวัสดิการ']],

  ['vision', 'หัวข้อ “การทำงานเป็นทีม” “การช่วยเหลือกัน” และ “การประสานงาน” อยู่ในหมวดใด',
   ['ความเป็นมืออาชีพของพนักงาน',
    'รากฐานและอุดมการณ์ขององค์กร',
    'รายได้และสวัสดิภาพของพนักงาน',
    'แนวทางการปฏิบัติงานของพนักงาน'],
   'A',
   'ทั้งสามหัวข้ออยู่ในหมวดความเป็นมืออาชีพของพนักงาน ซึ่งว่าด้วยการปฏิบัติตน ทัศนคติ บทบาท และการทำงานร่วมกับผู้อื่น',
   'Handbook', ['การทำงานเป็นทีม', 'การช่วยเหลือ', 'ความเป็นมืออาชีพ']],

  ['vision', 'หัวข้อ “การแต่งกาย” และ “ความสะอาดส่วนบุคคล” อยู่ในหมวดใด',
   ['ความเป็นมืออาชีพของพนักงาน',
    'แนวทางการปฏิบัติงานของพนักงาน',
    'การรักษาภาพลักษณ์และทรัพยากรขององค์กร',
    'รากฐานและอุดมการณ์ขององค์กร'],
   'C',
   'อยู่ในหมวดการรักษาภาพลักษณ์และทรัพยากรขององค์กร ร่วมกับสุขอนามัย ความสะอาดและความปลอดภัยของการทำงาน',
   'Handbook', ['การแต่งกาย', 'ความสะอาด', 'ภาพลักษณ์']],

  ['vision', 'หัวข้อ “การเข้าออกงาน” “การพักเบรก” “การลา” และ “การทำงานล่วงเวลา” อยู่ในหมวดใด',
   ['แนวทางการปฏิบัติงานของพนักงาน',
    'รายได้และสวัสดิภาพของพนักงาน',
    'ความเป็นมืออาชีพของพนักงาน',
    'รากฐานและอุดมการณ์ขององค์กร'],
   'A',
   'ทั้งสี่หัวข้ออยู่ในหมวดแนวทางการปฏิบัติงานของพนักงาน ร่วมกับมาตรฐานการทำงานและการรายงานปัญหา',
   'Handbook', ['การเข้าออกงาน', 'การพักเบรก', 'การลา']],

  ['vision', 'หัวข้อ “การตักเตือน” และ “มาตรการทางวินัย” อยู่ในหมวดใด',
   ['ความเป็นมืออาชีพของพนักงาน',
    'แนวทางการปฏิบัติงานของพนักงาน',
    'รากฐานและอุดมการณ์ขององค์กร',
    'รายได้และสวัสดิภาพของพนักงาน'],
   'B',
   'อยู่ในหมวดแนวทางการปฏิบัติงานของพนักงาน ต่อจากมาตรฐานการทำงานและการให้คำแนะนำ',
   'Handbook', ['การตักเตือน', 'วินัย', 'มาตรฐานการทำงาน']],

  ['vision', 'ทำไมร้านจึงใช้จุดแดงบนเมนูแทนการส่งข้อความแจ้งเตือนเข้าแชท',
   ['เพราะพนักงานไม่ชอบอ่านข้อความ',
    'เพราะการส่งข้อความหาพนักงานทุกคนมีค่าใช้จ่าย ส่วนจุดแดงไม่เสียค่าอะไรและแจ้งได้ไม่จำกัด',
    'เพราะไลน์ไม่รองรับการส่งข้อความหมู่',
    'เพราะข้อความเข้าแชทมักส่งไม่ถึง'],
   'B',
   'การส่งข้อความหาพนักงานทุกคนมีค่าใช้จ่ายและมีโควตาจำกัด ร้านจึงใช้จุดแดงบนเมนูซึ่งฟรีและไม่จำกัดจำนวนครั้ง',
   'Handbook', ['จุดแดง', 'ประกาศ', 'แจ้งเตือน']],

  ['vision', 'ร้านจะส่งข้อความเข้าแชทหาพนักงานทุกคนจริง ๆ ในกรณีใด',
   ['ทุกครั้งที่มีประกาศใหม่',
    'ทุกครั้งที่ตารางกะรอบใหม่ออก',
    'เฉพาะเรื่องด่วนมากเท่านั้น เช่น ร้านปิดกะทันหัน',
    'ทุกวันตอนเช้า'],
   'C',
   'โควตาข้อความถูกสงวนไว้ใช้กับเหตุด่วนจริง ๆ เท่านั้น เช่น ร้านปิดกะทันหัน เรื่องทั่วไปใช้จุดแดงบนเมนูแทน',
   'Handbook', ['จุดแดง', 'ประกาศ', 'แจ้งเตือน']],

  ['vision', 'พนักงานควรทำอะไรเป็นกิจวัตร เพื่อไม่ให้พลาดเรื่องสำคัญของร้าน',
   ['เปิดกลุ่มไลน์เพื่อนทุกชั่วโมง',
    'แวะดูเมนูในไลน์ของร้านวันละครั้ง ถ้ามีจุดแดงจึงกดเข้าไปดู',
    'โทรถาม HR ทุกเช้า',
    'รอให้หัวหน้ากะบอกปากเปล่า'],
   'B',
   'แวะดูเมนูวันละครั้งก็พอ ถ้ามีจุดแดงบนปุ่มไหนแปลว่ามีเรื่องใหม่ที่ยังไม่ได้เปิดดู และจุดแดงจะหายเองหลังเปิดอ่าน',
   'Handbook', ['จุดแดง', 'ประกาศ']],

  /* ---------- pool: app — การใช้แอป myHR Cloud และระบบไลน์ของร้าน ---------- */
  ['app', 'คู่มือการใช้แอป myHR Cloud เปิดอ่านได้จากเมนูไหนในไลน์ของร้าน',
   ['เมนูประกาศและข่าวสาร',
    'เมนูคู่มือ & สวัสดิการ',
    'เมนูตารางงาน',
    'เมนูติดต่อ HR'],
   'B',
   'คู่มือแอป myHR Cloud อยู่ในหน้า “คู่มือ & สวัสดิการ” มีภาพประกอบครบทุกขั้นตอนตั้งแต่เข้าระบบครั้งแรกจนถึงกรณีลืมรหัสผ่าน',
   'AppGuide', ['เริ่มต้น', 'เข้าระบบ', 'ครั้งแรก']],

  ['app', 'ชั่วโมงทำงานที่แสดงในรายงานของไลน์ คือตัวเลขแบบใด',
   ['เวลาที่สแกนเข้า-ออกจริงในแอป myHR Cloud',
    'ชั่วโมงตามตารางกะที่จัดไว้ หักเวลาพักแล้ว',
    'ชั่วโมงตามตารางกะ ยังไม่หักเวลาพัก',
    'ชั่วโมงที่ HR คีย์เข้าระบบเงินเดือน'],
   'B',
   'เป็นชั่วโมงตามตารางกะที่จัดไว้และหักเวลาพักแล้ว ไม่ใช่เวลาที่สแกนจริง จึงอาจไม่ตรงกับสลิปเงินเดือน',
   'AppGuide', ['ลงเวลา', 'สแกน', 'เข้างาน']],

  ['app', 'ถ้าชั่วโมงในรายงานของไลน์ไม่ตรงกับที่สแกนจริง ควรยึดข้อมูลจากที่ไหน',
   ['ยึดตัวเลขในไลน์',
    'ยึดข้อมูลในแอป myHR Cloud เป็นหลัก แล้วแจ้ง HR ผ่านเมนูติดต่อ HR',
    'ยึดตามที่หัวหน้ากะจำได้',
    'ยึดตามตารางกะที่ติดหน้าร้าน'],
   'B',
   'ให้ยึดข้อมูลในแอป myHR Cloud เป็นหลักเสมอ เพราะเป็นเวลาที่สแกนจริง แล้วแจ้ง HR ถ้าตัวเลขไม่ตรงกัน',
   'AppGuide', ['ลงเวลา', 'สแกน', 'เข้างาน']],

  ['app', 'ใบลาที่ยื่นไว้ในแอป myHR Cloud จะขึ้นในรายงาน “ประวัติการลา” ของไลน์หรือไม่',
   ['ขึ้นทั้งหมด',
    'ขึ้นเฉพาะใบที่อนุมัติแล้ว',
    'ไม่ขึ้น รายงานนั้นแสดงเฉพาะใบลาที่ยื่นผ่านไลน์',
    'ขึ้นหลังจากผ่านไป 30 วัน'],
   'C',
   'รายงานประวัติการลาในไลน์แสดงเฉพาะใบลาที่ยื่นผ่านไลน์ ใบที่ยื่นในแอป myHR Cloud หรือแบบกระดาษจะไม่แสดงที่นี่',
   'AppGuide', ['ลา', 'ใบลา']],

  ['app', 'เจอปัญหาในแอป myHR Cloud ควรทำอะไรก่อนส่งเรื่องให้ HR',
   ['ถอนการติดตั้งแล้วลงใหม่ทันที',
    'แคปหน้าจอที่มีปัญหาเก็บไว้เป็นหลักฐาน',
    'เปลี่ยนรหัสผ่านก่อน',
    'รอดูอีก 3 วัน'],
   'B',
   'ภาพหน้าจอคือหลักฐานสำคัญที่ทำให้ HR แก้เวลาให้ได้ ให้แคปหน้าจอไว้ก่อนแล้วค่อยส่งเรื่อง',
   'AppGuide', ['ปัญหา', 'แก้ปัญหา']],

  ['app', 'แจ้งปัญหาการใช้แอป ควรเลือกหัวข้อใดในเมนูติดต่อ HR',
   ['เงินเดือน / OT / สลิป',
    'ขอคำปรึกษา',
    'รายงานปัญหาในที่ทำงาน',
    'ร้องเรียน (เป็นความลับ)'],
   'C',
   'ปุ่มแจ้งปัญหาการใช้แอปในหน้าคู่มือแอปจะพาไปที่หัวข้อ “รายงานปัญหาในที่ทำงาน” ซึ่งตอบภายใน 1 วันทำการ',
   'AppGuide', ['ปัญหา', 'แก้ปัญหา']],

  ['app', 'ลืมรหัสผ่านแอป myHR Cloud ควรทำอย่างไรเป็นอันดับแรก',
   ['สมัครบัญชีใหม่',
    'ทำตามขั้นตอน “ลืมรหัสผ่าน” ในคู่มือแอป',
    'ยืมบัญชีเพื่อนลงเวลาไปก่อน',
    'หยุดลงเวลาจนกว่าจะแก้ได้'],
   'B',
   'คู่มือแอปมีขั้นตอนลืมรหัสผ่านพร้อมภาพประกอบ ให้ทำตามก่อน ถ้ายังไม่ได้จึงแจ้ง HR — ห้ามใช้บัญชีของคนอื่นลงเวลาเด็ดขาด',
   'AppGuide', ['ลืมรหัสผ่าน', 'รหัสผ่าน']],

  ['app', 'ภาพประกอบในคู่มือแอป ดูขนาดเต็มได้อย่างไร',
   ['ต้องดาวน์โหลดก่อน',
    'แตะที่ภาพ',
    'หมุนโทรศัพท์เป็นแนวนอน',
    'ดูขนาดเต็มไม่ได้'],
   'B',
   'แตะที่ภาพเพื่อดูขนาดเต็ม แล้วแตะพื้นหลังหรือปุ่มปิดเพื่อกลับมา',
   'AppGuide', ['เริ่มต้น', 'เข้าระบบ']],

  ['app', 'เปลี่ยนโทรศัพท์เครื่องใหม่ ต้องยืนยันตัวตนกับไลน์ของร้านใหม่หรือไม่',
   ['ต้องยืนยันใหม่ทุกครั้ง',
    'ไม่ต้อง ล็อกอินไลน์บัญชีเดิมได้เลย ระบบจำได้อยู่แล้ว',
    'ต้องให้ HR ผูกบัญชีให้ใหม่',
    'ต้องลบแอปไลน์แล้วติดตั้งใหม่'],
   'B',
   'ระบบผูกไว้กับบัญชีไลน์ ไม่ใช่กับเครื่อง ถ้าล็อกอินไลน์บัญชีเดิมก็ใช้ได้ทันทีโดยไม่ต้องยืนยันตัวตนใหม่',
   'AppGuide', ['เข้าระบบ', 'ครั้งแรก']],

  ['app', 'เปลี่ยนไปใช้บัญชีไลน์ใหม่ ต้องทำอย่างไร',
   ['ยืนยันตัวตนด้วยบัญชีใหม่ได้เลย',
    'แจ้ง HR ให้ยกเลิกการผูกบัญชีเดิมก่อน แล้วจึงยืนยันตัวตนใหม่ได้',
    'ใช้ทั้งสองบัญชีพร้อมกันได้',
    'ไม่ต้องทำอะไร ระบบย้ายให้เอง'],
   'B',
   'พนักงาน 1 คนผูกได้กับบัญชีไลน์เดียวเท่านั้น ต้องให้ HR ยกเลิกการผูกบัญชีเดิมก่อนจึงยืนยันด้วยบัญชีใหม่ได้',
   'AppGuide', ['เข้าระบบ', 'ครั้งแรก']]
];

var POOL_LABEL_ = { policy: 'ระเบียบและกระบวนการ', vision: 'รากฐานและอุดมการณ์', app: 'การใช้แอปและระบบ' };
var POOL_PREFIX_ = { policy: 'P', vision: 'V', app: 'A' };

/** ใส่ข้อสอบตั้งต้น "เฉพาะตอนคลังยังว่าง" — ไม่เคยทับของที่ HR เขียนเอง */
function seedFormsIfEmpty_() {
  if (formsRead_(FORM_SHEETS.ITEMS, true).length) return 0;

  var today = todayStr_();
  var n = { policy: 0, vision: 0, app: 0 };
  var items = QUIZ_SEED_.map(function (s) {
    var pool = s[0];
    n[pool]++;
    var qId = 'Q' + POOL_PREFIX_[pool] + (n[pool] < 10 ? '0' : '') + n[pool];
    var o = {
      qId: qId, formId: FORM_SEED_ID_, pool: pool, order: n[pool],
      type: 'single', question: s[1],
      correct: s[3], explain: s[4],
      sourceTab: s[5], sourceId: resolveSourceId_(s[5], s[6]),
      points: 1, status: 'on', updatedAt: today
    };
    CHOICE_KEYS_.forEach(function (k, i) { o['choice' + k] = s[2][i] || ''; });
    return o;
  });
  formsBulkAppend_(FORM_SHEETS.ITEMS, items);

  /* แบบทดสอบชุดตัวอย่าง — status = off จนกว่า HR จะอ่านทวนแล้วเปิดเอง */
  if (!formsRead_(FORM_SHEETS.FORMS, true).length) {
    formsBulkAppend_(FORM_SHEETS.FORMS, [{
      formId: FORM_SEED_ID_, type: 'quiz',
      title: 'แบบทดสอบความเข้าใจพนักงาน ชุดที่ 1',
      description: 'ทบทวนระเบียบ รากฐานขององค์กร และการใช้แอป อย่างละไม่กี่ข้อ ใช้เวลาราว 5 นาที',
      audience: 'all', audienceValue: '',
      drawRules: 'policy:4,vision:3,app:3',
      passMark: 70, retakePolicy: 'until_pass', cooldownHours: 0,
      shuffle: 'FALSE', showExplain: 'TRUE',
      openFrom: '', dueDate: '', status: 'off', updatedAt: today
    }]);
  }
  return items.length;
}

/**
 * หา id ของแถวต้นทางจริงจากคำค้นหา
 * ★ จับคู่ไม่ได้ให้คืนค่าว่าง อย่าเดา — ลิงก์ที่ชี้ผิดหลอกคนอ่านหนักกว่าไม่มีลิงก์
 *   รายงานความครอบคลุมจะฟ้องข้อที่ยังไม่ผูกให้ HR เติมภายหลัง
 */
function resolveSourceId_(tab, keys) {
  if (!tab || !keys || !keys.length) return '';
  var rows = formsRead_(tab);
  for (var k = 0; k < keys.length; k++) {
    for (var i = 0; i < rows.length; i++) {
      var hay = [rows[i].title, rows[i].category, rows[i].group, rows[i].tags].join(' ');
      if (hay.indexOf(keys[k]) >= 0 && str_(rows[i].id)) return str_(rows[i].id);
    }
  }
  return '';
}

/** เพิ่มแถว R11/R12 ในแท็บ Reports ถ้ายังไม่มี — ต่อท้ายอย่างเดียว ไม่แตะหัวคอลัมน์ */
function ensureQuizReportRows_() {
  if (!formsSheetExists_(SHEETS.REPORTS)) return 0;
  var have = {};
  formsRead_(SHEETS.REPORTS, true).forEach(function (r) {
    have[String(r.reportId).trim().toUpperCase()] = true;
  });
  var add = [];
  if (!have.R11) add.push({
    reportId: 'R11', title: 'ความคืบหน้าแบบทดสอบของทีม', category: 'ทีม', kind: 'DEPT',
    audience: 'HEAD',
    description: 'ดูว่าลูกทีมในแผนกของคุณทำแบบทดสอบไปแล้วกี่คน ใครยังไม่ผ่าน และหัวข้อไหนที่ทีมพลาดบ่อย',
    howto: '', sheetFn: '', status: 'on', updatedAt: todayStr_()
  });
  if (!have.R12) add.push({
    reportId: 'R12', title: 'ผลแบบทดสอบของฉัน', category: 'ส่วนตัว', kind: 'SELF',
    audience: 'ALL',
    description: 'เริ่มทำแบบทดสอบที่เปิดอยู่ และดูคะแนนของตัวเองย้อนหลัง',
    howto: '', sheetFn: '', status: 'on', updatedAt: todayStr_()
  });
  if (add.length) formsBulkAppend_(SHEETS.REPORTS, add);
  return add.length;
}

/* =================================================================
 *  ③ อ่านนิยามแบบฟอร์ม
 * ================================================================= */

function findForm_(formId) {
  var id = String(formId || '').trim();
  if (!id) return null;
  var rows = formsRead_(FORM_SHEETS.FORMS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].formId).trim() === id) return rows[i];
  }
  return null;
}

function boolCell_(v, dflt) {
  var s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  if (!s) return !!dflt;
  return ['TRUE', 'YES', 'ON', '1', 'ใช่', 'เปิด'].indexOf(s) >= 0;
}

/** แบบฟอร์มนี้เปิดให้คนนี้ทำได้ไหม — คืนเหตุผลเป็นข้อความไทยถ้าไม่ได้ */
function formOpenFor_(form, emp) {
  if (!form) return 'ไม่พบแบบทดสอบนี้';
  if (String(form.status).trim().toLowerCase() === 'off') return 'แบบทดสอบนี้ปิดอยู่';
  if (!matchAudience_(form, emp)) return 'แบบทดสอบนี้ไม่ได้เปิดให้ตำแหน่งหรือแผนกของคุณ';
  var today = todayStr_();
  var from = String(form.openFrom || '').trim().slice(0, 10);
  var due  = String(form.dueDate  || '').trim().slice(0, 10);
  if (from && today < from) return 'แบบทดสอบนี้จะเปิดวันที่ ' + thaiDate_(from);
  if (due  && today > due)  return 'หมดเขตทำแบบทดสอบนี้แล้ว (' + thaiDate_(due) + ')';
  return '';
}

function itemsOfForm_(formId) {
  var id = String(formId || '').trim();
  return formsRead_(FORM_SHEETS.ITEMS).filter(function (q) {
    return String(q.formId).trim() === id &&
           String(q.status).trim().toLowerCase() !== 'off' &&
           str_(q.qId) && str_(q.question);
  });
}

function itemMap_(formId) {
  var m = {};
  itemsOfForm_(formId).forEach(function (q) { m[String(q.qId).trim()] = q; });
  return m;
}

/* =================================================================
 *  ④ สุ่มชุดข้อสอบตาม drawRules
 * ================================================================= */

/** "policy:3,vision:3,app:4" → [{pool:'policy',n:3}, ...] */
function parseDrawRules_(txt) {
  var out = [];
  String(txt || '').split(',').forEach(function (part) {
    var p = part.split(':');
    var pool = String(p[0] || '').trim();
    var n = Number(String(p[1] || '').trim());
    if (pool && n > 0) out.push({ pool: pool, n: n });
  });
  return out;
}

function shuffleArr_(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function drawQuestions_(form) {
  var all = itemsOfForm_(form.formId);
  var rules = parseDrawRules_(form.drawRules);

  if (!rules.length) {
    var sorted = all.slice().sort(function (a, b) { return (Number(a.order) || 999) - (Number(b.order) || 999); });
    return sorted.map(function (q) { return String(q.qId).trim(); });
  }

  var out = [];
  rules.forEach(function (r) {
    var pool = all.filter(function (q) { return String(q.pool).trim() === r.pool; });
    /* สุ่มในกลุ่ม แต่ไม่สลับลำดับกลุ่ม — ผู้ทำจะได้เจอเรื่องเดียวกันติดกัน อ่านง่ายกว่า */
    shuffleArr_(pool).slice(0, r.n).forEach(function (q) { out.push(String(q.qId).trim()); });
  });
  if (boolCell_(form.shuffle, false)) shuffleArr_(out);
  return out;
}

/* =================================================================
 *  ⑤ สถานะการทำ (attempt)
 * -----------------------------------------------------------------
 *  ★ ทำไมต้องแคชสถานะรายครั้งไว้ต่างหาก
 *    ทุกครั้งที่ตอบ ระบบต้องเขียนแถวใน FormResponses ซึ่ง updateRow
 *    จะเด้งเวอร์ชันแคชของทั้งแท็บทิ้ง ถ้าข้อถัดไปต้องอ่านทั้งแท็บใหม่
 *    เพื่อหาแถวของตัวเอง ต้นทุนต่อข้อจะโตขึ้นเรื่อย ๆ ตามจำนวนแถวสะสม
 *    (60 คน × 10 ข้อ × ทำซ้ำ = หลายร้อยแถวต่อรอบ) ฟีเจอร์จะดีในสัปดาห์แรก
 *    แล้วใช้ไม่ได้ในปีที่สอง — แคชรายครั้งตัดปัญหานี้ทิ้งทั้งก้อน
 * ================================================================= */

function attemptCacheKey_(attemptId) { return 'atq_' + String(attemptId).trim(); }

function attemptCacheGet_(attemptId) {
  try {
    var s = CacheService.getScriptCache().get(attemptCacheKey_(attemptId));
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

function attemptCachePut_(st) {
  try {
    CacheService.getScriptCache().put(attemptCacheKey_(st.attemptId), JSON.stringify(st), 21600);
  } catch (e) {}
}

function attemptCacheDrop_(attemptId) {
  try { CacheService.getScriptCache().remove(attemptCacheKey_(attemptId)); } catch (e) {}
}

function parseAnswers_(txt) {
  var s = String(txt || '').trim();
  if (!s) return {};
  try {
    var o = JSON.parse(s);
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}

function rowToState_(r) {
  return {
    attemptId: str_(r.attemptId),
    row:       r._row,
    formId:    str_(r.formId),
    empCode:   str_(r.empCode).toUpperCase(),
    qIds:      str_(r.qIds).split(',').map(function (x) { return x.trim(); }).filter(String),
    answers:   parseAnswers_(r.answers),
    startedAt: str_(r.startedAt),
    status:    str_(r.status) || ATTEMPT_STATUS.OPEN
  };
}

/** หาสถานะการทำ — แคชก่อน ถ้าพลาดจึงอ่านชีต */
function loadAttempt_(attemptId) {
  var id = String(attemptId || '').trim();
  if (!id) return null;
  var st = attemptCacheGet_(id);
  if (st && st.row) return st;

  var rows = formsRead_(FORM_SHEETS.RESP);
  for (var i = rows.length - 1; i >= 0; i--) {          // ครั้งล่าสุดมักอยู่ท้ายตาราง
    if (str_(rows[i].attemptId) === id) {
      var s = rowToState_(rows[i]);
      attemptCachePut_(s);
      return s;
    }
  }
  return null;
}

function myAttempts_(empCode, formId) {
  var code = String(empCode || '').trim().toUpperCase();
  if (!code) return [];
  var fid = formId ? String(formId).trim() : '';
  return formsRead_(FORM_SHEETS.RESP).filter(function (r) {
    if (str_(r.empCode).toUpperCase() !== code) return false;
    return !fid || str_(r.formId) === fid;
  });
}

/* =================================================================
 *  ⑥ ส่งคำถามออกไปโดยตัดเฉลยทิ้ง
 *  ★ จุดนี้คือหัวใจความปลอดภัยของฟีเจอร์ทั้งหมด
 *    correct / explain / sourceTab / sourceId ห้ามออกจากเซิร์ฟเวอร์
 *    ก่อนผู้ใช้ commit คำตอบของข้อนั้นแล้วเท่านั้น
 * ================================================================= */
function publicItem_(q, index, total) {
  var choices = [];
  CHOICE_KEYS_.forEach(function (k) {
    var t = str_(q['choice' + k]);
    if (t) choices.push({ key: k, text: t });
  });
  return {
    qId:      str_(q.qId),
    type:     str_(q.type) || 'single',
    poolLabel: POOL_LABEL_[str_(q.pool)] || str_(q.pool),
    question: str_(q.question),
    choices:  choices,
    index:    index,
    total:    total
    // ไม่ส่ง: correct, explain, sourceTab, sourceId, points
  };
}

/** ลิงก์ไปอ่านนโยบายต้นทางจริง — สร้างฝั่งเซิร์ฟเวอร์เพราะ LIFF ID อยู่ที่นี่ */
function itemSourceLink_(q) {
  var tab = str_(q.sourceTab), id = str_(q.sourceId);
  if (!tab || !id) return null;
  var rows = formsRead_(tab);
  var hit = null;
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i].id) === id) { hit = rows[i]; break; }
  }
  if (!hit) return null;

  if (tab === SHEETS.HANDBOOK) {
    return {
      label: 'อ่านต้นทาง: ' + (str_(hit.title) || id),
      url: liffUrl(CFG.liff.handbook,
                   'cat=' + encodeURIComponent(str_(hit.category)) + '&id=' + encodeURIComponent(id))
    };
  }
  if (tab === SHEETS.APPGUIDE) {
    return {
      label: 'อ่านต้นทาง: ' + (str_(hit.title) || id),
      url: liffUrl(CFG.liff.appguide,
                   'g=' + encodeURIComponent(str_(hit.group)) + '&id=' + encodeURIComponent(id))
    };
  }
  return null;
}

/* =================================================================
 *  ⑦ API — รายการแบบทดสอบที่ทำได้
 * ================================================================= */
function apiQuizList_(emp) {
  if (!formsReady_()) return { ok: true, forms: [] };
  return { ok: true, forms: quizListFor_(emp) };
}

function quizListFor_(emp) {
  var out = [];
  formsRead_(FORM_SHEETS.FORMS).forEach(function (f) {
    if (!str_(f.formId)) return;
    if (formOpenFor_(f, emp)) return;                    // ปิด/ยังไม่ถึงเวลา/ไม่ใช่กลุ่มเป้าหมาย
    var mine = myAttempts_(emp.empCode, f.formId);
    var best = 0, passed = false, open = '';
    mine.forEach(function (a) {
      if (str_(a.status) === ATTEMPT_STATUS.OPEN) open = str_(a.attemptId);
      var p = Number(a.percent) || 0;
      if (p > best) best = p;
      if (boolCell_(a.passed, false)) passed = true;
    });
    var block = retakeBlock_(f, mine);
    out.push({
      formId: str_(f.formId),
      type: str_(f.type) || 'quiz',
      title: str_(f.title),
      description: str_(f.description),
      passMark: Number(f.passMark) || 0,
      dueDate: str_(f.dueDate).slice(0, 10),
      questionCount: plannedCount_(f),
      attempts: mine.length,
      bestPercent: best,
      passed: passed,
      resumeId: open,
      blocked: block
    });
  });
  return out;
}

function plannedCount_(form) {
  var rules = parseDrawRules_(form.drawRules);
  var all = itemsOfForm_(form.formId);
  if (!rules.length) return all.length;
  var n = 0;
  rules.forEach(function (r) {
    var have = all.filter(function (q) { return str_(q.pool) === r.pool; }).length;
    n += Math.min(have, r.n);
  });
  return n;
}

/** กติกาการทำซ้ำ — คืนข้อความไทยถ้ายังทำใหม่ไม่ได้ */
function retakeBlock_(form, mine) {
  var done = mine.filter(function (a) { return str_(a.status) === ATTEMPT_STATUS.DONE; });
  if (!done.length) return '';
  var policy = String(form.retakePolicy || 'always').trim().toLowerCase();

  if (policy === 'once') return 'แบบทดสอบนี้ทำได้ครั้งเดียว และคุณทำไปแล้ว';
  if (policy === 'until_pass' && done.some(function (a) { return boolCell_(a.passed, false); })) {
    return 'คุณผ่านแบบทดสอบนี้แล้ว ไม่ต้องทำซ้ำ';
  }
  var cool = Number(form.cooldownHours) || 0;
  if (cool > 0) {
    var last = 0;
    done.forEach(function (a) {
      var t = parseTs_(a.submittedAt);
      if (t > last) last = t;
    });
    if (last) {
      var waitMs = cool * 3600000 - (new Date().getTime() - last);
      if (waitMs > 0) return 'ทำซ้ำได้อีกครั้งในอีกประมาณ ' + Math.ceil(waitMs / 3600000) + ' ชั่วโมง';
    }
  }
  return '';
}

function parseTs_(s) {
  var t = String(s || '').trim();
  if (!t) return 0;
  var d = new Date(t.replace(' ', 'T') + '+07:00');
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/* =================================================================
 *  ⑧ API — quiz_start
 * ================================================================= */
function apiQuizStart_(emp, d) {
  if (!formsReady_()) return FORMS_NOT_READY_;

  var form = findForm_(d.formId);
  var why = formOpenFor_(form, emp);
  if (why) return { ok: false, code: 'CLOSED', message: why };

  var mine = myAttempts_(emp.empCode, form.formId);

  /* ทำค้างอยู่ = ทำต่อจากข้อที่ยังไม่ตอบ ไม่เริ่มใหม่ ไม่รีเซ็ตคำตอบเดิม */
  for (var i = mine.length - 1; i >= 0; i--) {
    if (str_(mine[i].status) === ATTEMPT_STATUS.OPEN) {
      var st = rowToState_(mine[i]);
      attemptCachePut_(st);
      return startPayload_(form, st, true);
    }
  }

  var block = retakeBlock_(form, mine);
  if (block) return { ok: false, code: 'RETAKE', message: block };

  var qIds = drawQuestions_(form);
  if (!qIds.length) {
    return { ok: false, code: 'NO_ITEMS',
             message: 'แบบทดสอบนี้ยังไม่มีคำถาม — แจ้ง HR ให้เพิ่มข้อในแท็บ FormItems' };
  }

  var attemptId = 'AT' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMMddHHmmss') + '-' +
                  String(Math.floor(Math.random() * 9000) + 1000);
  var startedAt = now_();
  appendRow(FORM_SHEETS.RESP, {
    attemptId: attemptId, formId: str_(form.formId),
    empCode: str_(emp.empCode), name: str_(emp.nickname) || str_(emp.fullName),
    dept: str_(emp.dept), branch: str_(emp.branch),
    attemptNo: mine.length + 1,
    startedAt: startedAt, submittedAt: '', status: ATTEMPT_STATUS.OPEN,
    qIds: qIds.join(','), answers: '{}',
    score: '', total: '', percent: '', passed: '', durationSec: ''
  });

  var fresh = loadAttemptFresh_(attemptId);
  if (!fresh) {
    return { ok: false, code: 'START_FAILED',
             message: 'เริ่มแบบทดสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
  }
  audit(str_(emp.empCode), 'QUIZ_START', str_(form.formId), 'ครั้งที่ ' + (mine.length + 1));
  return startPayload_(form, fresh, false);
}

/** อ่านแถวที่เพิ่งเขียนแบบข้ามแคช — appendRow เด้งเวอร์ชันไปแล้ว จึงอ่านสด */
function loadAttemptFresh_(attemptId) {
  var rows = formsRead_(FORM_SHEETS.RESP, true);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (str_(rows[i].attemptId) === String(attemptId)) {
      var st = rowToState_(rows[i]);
      attemptCachePut_(st);
      return st;
    }
  }
  return null;
}

function nextUnanswered_(st) {
  for (var i = 0; i < st.qIds.length; i++) {
    if (st.answers[st.qIds[i]] === undefined) return i;
  }
  return -1;
}

function startPayload_(form, st, resumed) {
  var map = itemMap_(form.formId);
  var idx = nextUnanswered_(st);

  /* ตอบครบแล้วแต่แถวยังค้างสถานะทำอยู่ (เช่นเน็ตหลุดตอนปิดท้าย) — ปิดให้เลย */
  if (idx < 0) {
    var sum = finalizeAttempt_(form, st, map);
    return { ok: true, attemptId: st.attemptId, formId: str_(form.formId),
             title: str_(form.title), finished: true, summary: sum };
  }

  var q = map[st.qIds[idx]];
  if (!q) {
    /* ข้อถูกลบออกจากคลังกลางคัน — ข้ามไป อย่าให้ทั้งชุดค้าง */
    st.answers[st.qIds[idx]] = '';
    saveAnswers_(st);
    return startPayload_(form, st, resumed);
  }

  return {
    ok: true,
    attemptId: st.attemptId,
    formId: str_(form.formId),
    type: str_(form.type) || 'quiz',
    title: str_(form.title),
    description: str_(form.description),
    passMark: Number(form.passMark) || 0,
    total: st.qIds.length,
    answered: Object.keys(st.answers).length,
    resumed: !!resumed,
    question: publicItem_(q, idx + 1, st.qIds.length)
  };
}

/* =================================================================
 *  ⑨ API — quiz_answer  (1 รอบเครือข่ายต่อ 1 ข้อ)
 * ================================================================= */
function apiQuizAnswer_(emp, d) {
  if (!formsReady_()) return FORMS_NOT_READY_;

  var attemptId = String(d.attemptId || '').trim();
  var qId       = String(d.qId || '').trim();
  var choice    = String(d.choice || '').trim();
  if (!attemptId || !qId) {
    return { ok: false, code: 'INPUT', message: 'ข้อมูลไม่ครบ กรุณาเปิดแบบทดสอบใหม่อีกครั้ง' };
  }

  /* ★ อ่าน-ตรวจ-เขียน ต้องอยู่ในล็อกเดียวกัน
     ไม่งั้นการกดปุ่มรัว ๆ สองครั้งจะอ่าน answers ชุดเดิมได้ทั้งคู่ แล้วเขียนทับกัน
     ผลคือคำตอบข้อหนึ่งหายไปเงียบ ๆ และตัวนับข้อเพี้ยนไปทั้งชุด */
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) {
    return { ok: false, code: 'BUSY', message: 'ระบบกำลังทำงานหนัก กรุณากดอีกครั้งในอีกสักครู่' };
  }
  try {
    return answerLocked_(emp, attemptId, qId, choice);
  } finally {
    lock.releaseLock();
  }
}

function answerLocked_(emp, attemptId, qId, choice) {
  var st = loadAttempt_(attemptId);
  if (!st) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการทำแบบทดสอบนี้' };

  /* ★ เจ้าของต้องตรงเสมอ — client ส่ง attemptId อะไรมาก็ได้ */
  if (st.empCode !== String(emp.empCode).trim().toUpperCase()) {
    return { ok: false, code: 'FORBIDDEN', message: 'รายการนี้ไม่ใช่ของคุณ' };
  }
  if (st.status !== ATTEMPT_STATUS.OPEN) {
    return { ok: false, code: 'FINISHED', message: 'แบบทดสอบชุดนี้ส่งไปแล้ว' };
  }

  var form = findForm_(st.formId);
  if (!form) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบแบบทดสอบนี้แล้ว' };

  var pos = st.qIds.indexOf(qId);
  if (pos < 0) return { ok: false, code: 'BAD_QID', message: 'ข้อนี้ไม่อยู่ในชุดของคุณ' };

  /* ★ ปฏิเสธข้อที่ตอบไปแล้ว — "ห้ามย้อนกลับ" เป็นคุณสมบัติของโครงสร้าง ไม่ใช่ของ UI
     คืนข้อที่ค้างอยู่กลับไปด้วย เพื่อให้หน้าเว็บที่หลุด sync กู้ตัวเองได้ทันที */
  if (st.answers[qId] !== undefined) {
    var map0 = itemMap_(st.formId);
    var i0 = nextUnanswered_(st);
    return {
      ok: false, code: 'ALREADY_ANSWERED',
      message: 'ข้อนี้ตอบไปแล้ว แบบทดสอบนี้ย้อนกลับไปแก้คำตอบไม่ได้',
      next: (i0 >= 0 && map0[st.qIds[i0]]) ? publicItem_(map0[st.qIds[i0]], i0 + 1, st.qIds.length) : null
    };
  }

  var map = itemMap_(st.formId);
  var q = map[qId];
  if (!q) return { ok: false, code: 'BAD_QID', message: 'ข้อนี้ถูกนำออกจากคลังแล้ว' };

  st.answers[qId] = normChoice_(choice);

  var graded = str_(q.correct) !== '' && String(form.type || 'quiz').trim().toLowerCase() !== 'survey';
  var isRight = graded ? isAnswerRight_(q, st.answers[qId]) : null;

  var nextIdx = nextUnanswered_(st);
  var res = {
    ok: true,
    graded: graded,
    correct: isRight,
    index: pos + 1,
    total: st.qIds.length,
    answered: Object.keys(st.answers).length
  };

  /* showExplain = FALSE → บันทึกคำตอบตามปกติ แต่ไม่เปิดเฉลยให้เห็น
     ใช้กับข้อสอบที่ต้องเก็บคะแนนแล้วเฉลยรวมทีหลัง */
  if (graded && boolCell_(form.showExplain, true)) {
    res.correctChoice = str_(q.correct).toUpperCase();
    res.correctText   = choiceText_(q, res.correctChoice);
    res.explain       = str_(q.explain);
    var link = itemSourceLink_(q);
    if (link) res.source = link;
  }

  if (nextIdx < 0) {
    res.next = null;
    res.summary = finalizeAttempt_(form, st, map);   // ปิดท้ายและเขียนคะแนนในจังหวะเดียว
  } else {
    saveAnswers_(st);
    res.next = publicItem_(map[st.qIds[nextIdx]], nextIdx + 1, st.qIds.length);
  }
  return res;
}

function normChoice_(c) {
  return String(c || '').toUpperCase().replace(/[^A-E,]/g, '');
}

/** ข้อความของตัวเลือก รองรับหลายตัวอักษร เช่น "A,C" → "ข้อความ A / ข้อความ C" */
function choiceText_(q, letters) {
  var ls = normChoice_(letters).split(',').filter(String);
  if (!ls.length) return '';
  return ls.map(function (k) { return str_(q['choice' + k]); }).filter(String).join(' / ');
}

function sortLetters_(s) {
  return String(s || '').split(',').filter(String).sort().join(',');
}

function isAnswerRight_(q, got) {
  var want = normChoice_(q.correct);
  if (!want) return null;
  if (String(q.type || 'single').trim().toLowerCase() === 'multi') {
    return sortLetters_(got) === sortLetters_(want);
  }
  return got === want;
}

/** เขียนเฉพาะเซลล์ answers — เขียนน้อยที่สุดต่อ 1 ข้อ */
function saveAnswers_(st) {
  updateRow(FORM_SHEETS.RESP, st.row, { answers: JSON.stringify(st.answers) });
  attemptCachePut_(st);
}

function finalizeAttempt_(form, st, map) {
  var score = 0, total = 0, wrong = [];
  st.qIds.forEach(function (id) {
    var q = map[id];
    if (!q) return;
    var pts = Number(q.points) || 1;
    if (str_(q.correct) === '') return;              // ข้อสำรวจความเห็น ไม่คิดคะแนน
    total += pts;
    if (isAnswerRight_(q, st.answers[id])) score += pts;
    else wrong.push(id);
  });

  var isSurvey = String(form.type || 'quiz').trim().toLowerCase() === 'survey' || total === 0;
  var percent = total ? Math.round(score * 100 / total) : '';
  var passMark = Number(form.passMark) || 0;
  var passed = (isSurvey || !passMark) ? '' : (percent >= passMark ? 'TRUE' : 'FALSE');
  var dur = Math.max(0, Math.round((new Date().getTime() - parseTs_(st.startedAt)) / 1000));

  st.status = ATTEMPT_STATUS.DONE;
  updateRow(FORM_SHEETS.RESP, st.row, {
    answers: JSON.stringify(st.answers),
    submittedAt: now_(),
    status: ATTEMPT_STATUS.DONE,
    score: isSurvey ? '' : score,
    total: isSurvey ? '' : total,
    percent: percent,
    passed: passed,
    durationSec: dur
  });
  attemptCacheDrop_(st.attemptId);

  audit(st.empCode, 'QUIZ_SUBMIT', str_(form.formId),
        isSurvey ? 'ส่งแบบสำรวจแล้ว' : ('ได้ ' + score + '/' + total + ' (' + percent + '%)'));

  return {
    attemptId: st.attemptId,
    survey: isSurvey,
    score: isSurvey ? null : score,
    total: isSurvey ? null : total,
    percent: isSurvey ? null : percent,
    passMark: passMark,
    passed: passed === 'TRUE',
    durationSec: dur,
    wrongCount: wrong.length,
    review: buildReview_(st, map, form)
  };
}

/** สรุปท้ายชุด — เปิดเฉลยได้ต่อเมื่อ commit ครบทุกข้อแล้วเท่านั้น */
function buildReview_(st, map, form) {
  if (!boolCell_(form.showExplain, true)) return [];
  var out = [];
  st.qIds.forEach(function (id, i) {
    var q = map[id];
    if (!q || str_(q.correct) === '') return;
    var right = isAnswerRight_(q, st.answers[id]);
    if (right) return;                                // สรุปเฉพาะข้อที่พลาด อ่านสั้นกว่าและมีประโยชน์กว่า
    var o = {
      index: i + 1,
      question: str_(q.question),
      yourChoice: str_(st.answers[id]),
      yourText: choiceText_(q, st.answers[id]),
      correctChoice: str_(q.correct).toUpperCase(),
      correctText: choiceText_(q, q.correct),
      explain: str_(q.explain)
    };
    var link = itemSourceLink_(q);
    if (link) o.source = link;
    out.push(o);
  });
  return out;
}

/* =================================================================
 *  ⑩ API — quiz_result (เปิดดูผลของครั้งที่ทำไปแล้ว)
 * ================================================================= */
function apiQuizResult_(emp, d) {
  if (!formsReady_()) return FORMS_NOT_READY_;
  var st = loadAttempt_(d.attemptId);
  if (!st) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการนี้' };
  if (st.empCode !== String(emp.empCode).trim().toUpperCase()) {
    return { ok: false, code: 'FORBIDDEN', message: 'รายการนี้ไม่ใช่ของคุณ' };
  }
  var rows = formsRead_(FORM_SHEETS.RESP);
  var row = null;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (str_(rows[i].attemptId) === st.attemptId) { row = rows[i]; break; }
  }
  if (!row) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการนี้' };
  var form = findForm_(st.formId) || {};
  var review = buildReview_(st, itemMap_(st.formId), form);
  return {
    ok: true,
    summary: {
      attemptId: st.attemptId,
      survey: str_(row.total) === '',
      score: Number(row.score) || 0,
      total: Number(row.total) || 0,
      percent: Number(row.percent) || 0,
      passMark: Number(form.passMark) || 0,
      passed: boolCell_(row.passed, false),
      durationSec: Number(row.durationSec) || 0,
      wrongCount: review.length,
      review: review
    },
    title: str_(form.title)
  };
}

/* =================================================================
 *  ⑪ R12 — ผลแบบทดสอบของฉัน  (audience ALL)
 * ================================================================= */
function apiQuizMyReport_(emp) {
  if (!formsReady_()) {
    return { ok: true, kind: 'quiz_me', data: { available: [], history: [], notReady: true } };
  }
  var titles = {};
  formsRead_(FORM_SHEETS.FORMS).forEach(function (f) { titles[str_(f.formId)] = str_(f.title); });

  var history = myAttempts_(emp.empCode).filter(function (a) {
    return str_(a.status) === ATTEMPT_STATUS.DONE;
  }).map(function (a) {
    /* ★ ส่งเฉพาะฟิลด์ที่หน้าจอวาดจริง — คะแนนคือข้อมูลผลงานพนักงาน
       ไม่ส่ง qIds/answers ออกไป เพราะเป็นเฉลยแฝงของชุดที่ยังใช้อยู่ */
    return {
      attemptId: str_(a.attemptId),
      formTitle: titles[str_(a.formId)] || str_(a.formId),
      attemptNo: Number(a.attemptNo) || 1,
      submittedAt: str_(a.submittedAt),
      score: Number(a.score) || 0,
      total: Number(a.total) || 0,
      percent: Number(a.percent) || 0,
      passed: boolCell_(a.passed, false)
    };
  }).sort(function (x, y) { return String(y.submittedAt).localeCompare(String(x.submittedAt)); });

  return { ok: true, kind: 'quiz_me',
           data: { available: quizListFor_(emp), history: history.slice(0, 30) } };
}

/* =================================================================
 *  ⑫ R11 — ความคืบหน้าแบบทดสอบของทีม  (audience HEAD)
 * -----------------------------------------------------------------
 *  ★ ตรวจ role ซ้ำในโค้ด ไม่เชื่อคอลัมน์ audience อย่างเดียว
 *    เพราะ HR แก้ชีต Reports เองได้ ถ้าเผลอตั้งเป็น ALL คะแนนของทั้งแผนก
 *    จะหลุดถึงพนักงาน 60 คนทันที สองบรรทัดนี้ทำให้ความผิดพลาดในชีต
 *    ไม่กลายเป็นช่องโหว่
 * ================================================================= */
function apiQuizTeamReport_(emp) {
  var role = String(emp.role || ROLES.STAFF).trim();
  if ([ROLES.SUPERVISOR, ROLES.HR, ROLES.ADMIN].indexOf(role) < 0) {
    return { ok: false, code: 'FORBIDDEN', message: 'รายงานนี้เปิดได้เฉพาะหัวหน้าแผนกขึ้นไป' };
  }
  if (!formsReady_()) {
    return { ok: true, kind: 'quiz_team', data: { dept: '', rows: [], forms: [], notReady: true } };
  }

  var myDept = String(emp.dept || '').trim();
  /* ★ แผนกว่าง = ไม่ตรงกับใครเลย ห้ามปล่อยให้ '' ไปแมตช์กับทุกคนที่แผนกว่างเหมือนกัน
     หัวหน้าที่ยังไม่ได้กรอกแผนกจะเห็นคะแนนของคนทั้งร้านโดยไม่ตั้งใจ */
  var seeAll = (role === ROLES.HR || role === ROLES.ADMIN);
  if (!seeAll && !myDept) {
    return { ok: true, kind: 'quiz_team',
             data: { dept: '', rows: [], forms: [],
                     warning: 'ยังไม่ได้ระบุแผนกในทะเบียนพนักงานของคุณ กรุณาแจ้ง HR' } };
  }

  /* รายชื่อในขอบเขตที่ดูได้ — สร้างจากทะเบียนพนักงาน ไม่ใช่จากแถวคะแนน
     เพื่อให้ "คนที่ยังไม่ทำเลย" ปรากฏด้วย ซึ่งคือข้อมูลที่หัวหน้าต้องการที่สุด */
  var team = {};
  readTable(SHEETS.EMPLOYEES).forEach(function (e) {
    if (!isActive(e)) return;
    var dept = String(e.dept || '').trim();
    if (!seeAll && dept !== myDept) return;
    var code = String(e.empCode).trim().toUpperCase();
    if (!code) return;
    team[code] = {
      empCode: code,
      name: str_(e.nickname) || str_(e.fullName),
      dept: dept,
      attempts: 0, bestPercent: null, passed: false, lastAt: ''
      // ไม่ส่ง: lineUserId, เบอร์โทร, สถานะการจ้าง
    };
  });

  var openForms = formsRead_(FORM_SHEETS.FORMS).filter(function (f) {
    return str_(f.formId) && String(f.status).trim().toLowerCase() !== 'off';
  });
  var formIds = {};
  openForms.forEach(function (f) { formIds[str_(f.formId)] = true; });

  var missCount = {}, itemQ = {};
  formsRead_(FORM_SHEETS.RESP).forEach(function (a) {
    if (str_(a.status) !== ATTEMPT_STATUS.DONE) return;
    if (!formIds[str_(a.formId)]) return;
    var code = str_(a.empCode).toUpperCase();
    var t = team[code];
    if (!t) return;
    t.attempts++;
    var p = Number(a.percent) || 0;
    if (t.bestPercent === null || p > t.bestPercent) t.bestPercent = p;
    if (boolCell_(a.passed, false)) t.passed = true;
    var sub = str_(a.submittedAt);
    if (sub > t.lastAt) t.lastAt = sub;

    /* หัวข้อที่ทีมพลาดบ่อย — นับจากคำตอบที่ผิด ไม่เปิดเผยว่าใครตอบอะไร */
    var ans = parseAnswers_(a.answers);
    Object.keys(ans).forEach(function (qid) {
      if (!itemQ[qid]) {
        var m = itemMap_(str_(a.formId));
        itemQ[qid] = m[qid] || null;
      }
      var q = itemQ[qid];
      if (!q || str_(q.correct) === '') return;
      if (!isAnswerRight_(q, ans[qid])) missCount[qid] = (missCount[qid] || 0) + 1;
    });
  });

  var rows = Object.keys(team).map(function (k) { return team[k]; })
    .sort(function (a, b) {
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;   // คนที่ยังไม่ทำขึ้นก่อน
      return String(a.name).localeCompare(String(b.name));
    });

  var weak = Object.keys(missCount).map(function (qid) {
    return { qId: qid, misses: missCount[qid],
             question: itemQ[qid] ? str_(itemQ[qid].question) : qid,
             poolLabel: itemQ[qid] ? (POOL_LABEL_[str_(itemQ[qid].pool)] || str_(itemQ[qid].pool)) : '' };
  }).sort(function (a, b) { return b.misses - a.misses; }).slice(0, 5);

  var doneN = rows.filter(function (r) { return r.attempts > 0; }).length;
  var passN = rows.filter(function (r) { return r.passed; }).length;

  /* ★ บันทึกไว้เสมอเมื่อหัวหน้าดึงคะแนนของลูกทีม — ข้อมูลผลงานต้องตรวจย้อนหลังได้ */
  audit(str_(emp.empCode), 'QUIZ_TEAM_VIEW', seeAll ? '(ทุกแผนก)' : myDept,
        'ดูคะแนนแบบทดสอบ ' + rows.length + ' คน');

  return {
    ok: true, kind: 'quiz_team',
    data: {
      dept: seeAll ? 'ทุกแผนก' : myDept,
      headcount: rows.length, doneCount: doneN, passCount: passN,
      forms: openForms.map(function (f) {
        return { formId: str_(f.formId), title: str_(f.title),
                 passMark: Number(f.passMark) || 0, dueDate: str_(f.dueDate).slice(0, 10) };
      }),
      rows: rows,
      weak: weak
    }
  };
}

/* =================================================================
 *  ⑬ ความครอบคลุมและความสดของข้อสอบ
 * -----------------------------------------------------------------
 *  ★ ข้อรับประกันจริงของฟีเจอร์นี้อยู่ตรงนี้
 *    ถ้าแถวต้นทางมี updatedAt ใหม่กว่าของข้อสอบ แปลว่านโยบายถูกแก้หลังจาก
 *    เขียนข้อนี้ ข้อนั้นอาจสอนสิ่งที่ไม่จริงแล้ว ต้องมีคนทวน
 *    ต้นทุนคือการเปรียบเทียบวันที่หนึ่งครั้งต่อข้อ
 *
 *  ★ ผลลัพธ์ออกแบบให้เป็น "ข้อความไม่กี่บรรทัด" เพื่อแปะในอีเมลสรุปรายสัปดาห์
 *    ไม่ใช่เมนูในชีตที่ต้องเปิดคอมพิวเตอร์ถึงจะกดได้ — เมนูที่ต้องเปิดคอมฯ
 *    คือสิ่งที่ถูกกดครั้งเดียวแล้วไม่มีใครกดอีกเลย
 * ================================================================= */
function formsCoverageReport() {
  if (!formsReady_()) return { ready: false, lines: ['ยังไม่ได้ติดตั้งระบบแบบทดสอบ'] };

  var items = formsRead_(FORM_SHEETS.ITEMS).filter(function (q) { return str_(q.qId); });
  var unlinked = [], broken = [], stale = [];
  var covered = { Handbook: {}, AppGuide: {} };

  var cache = {};
  function rowsOf(tab) {
    if (!cache[tab]) {
      var m = {};
      formsRead_(tab).forEach(function (r) { if (str_(r.id)) m[str_(r.id)] = r; });
      cache[tab] = m;
    }
    return cache[tab];
  }

  items.forEach(function (q) {
    var tab = str_(q.sourceTab), id = str_(q.sourceId);
    if (!tab || !id) { unlinked.push(str_(q.qId)); return; }
    var src = rowsOf(tab)[id];
    if (!src) { broken.push(str_(q.qId) + ' → ' + tab + ':' + id); return; }
    if (covered[tab]) covered[tab][id] = true;
    var srcAt = str_(src.updatedAt), qAt = str_(q.updatedAt);
    /* ต้นทางไม่มีวันที่ = เทียบไม่ได้ ให้ถือว่ายังไม่ต้องทวน ดีกว่าฟ้องผิดทุกสัปดาห์
       จนคนเลิกอ่านรายงานฉบับนี้ */
    if (srcAt && qAt && srcAt > qAt) {
      stale.push(str_(q.qId) + ' (' + tab + ':' + id + ' แก้เมื่อ ' + srcAt + ')');
    }
  });

  var uncovered = [];
  [SHEETS.HANDBOOK, SHEETS.APPGUIDE].forEach(function (tab) {
    var m = rowsOf(tab);
    Object.keys(m).forEach(function (id) {
      if (String(m[id].status).trim().toLowerCase() === 'hidden') return;
      if (!covered[tab] || !covered[tab][id]) uncovered.push(tab + ':' + id + ' ' + str_(m[id].title));
    });
  });

  return {
    ready: true,
    itemCount: items.length,
    unlinked: unlinked,
    broken: broken,
    stale: stale,
    uncovered: uncovered,
    lines: formsHealthLines_(items.length, unlinked, broken, stale, uncovered)
  };
}

function formsHealthLines_(itemCount, unlinked, broken, stale, uncovered) {
  var L = [];
  L.push('คลังข้อสอบ ' + itemCount + ' ข้อ');
  if (stale.length)    L.push('⚠️ นโยบายเปลี่ยนแล้ว ต้องทวน ' + stale.length + ' ข้อ: ' + stale.slice(0, 5).join(' · '));
  if (broken.length)   L.push('⚠️ ชี้ไปแถวที่ไม่มีอยู่จริง ' + broken.length + ' ข้อ: ' + broken.slice(0, 5).join(' · '));
  if (unlinked.length) L.push('• ยังไม่ผูกต้นทาง ' + unlinked.length + ' ข้อ: ' + unlinked.slice(0, 8).join(', '));
  if (uncovered.length) L.push('• หัวข้อที่ยังไม่มีข้อสอบ ' + uncovered.length + ' หัวข้อ: ' + uncovered.slice(0, 5).join(' · '));
  if (L.length === 1)  L.push('✅ ข้อสอบทุกข้อผูกกับต้นทางครบและยังตรงกับนโยบายปัจจุบัน');
  return L;
}

/** ข้อความพร้อมแปะในอีเมลสรุปรายสัปดาห์ของ HR */
function formsCoverageDigest() {
  var r = formsCoverageReport();
  return r.lines.join('\n');
}

/**
 * ผูกต้นทางให้ข้อที่ยังว่างอีกครั้ง — ใช้หลัง HR เติมเนื้อหาในแท็บ Handbook/AppGuide แล้ว
 * เดินเฉพาะข้อที่ sourceId ว่าง จึงไม่เคยเขียนทับการผูกที่คนตั้งใจแก้เอง
 */
function formsRelinkSources() {
  if (!formsReady_()) return 0;
  var seedByQ = {};
  var n = { policy: 0, vision: 0, app: 0 };
  QUIZ_SEED_.forEach(function (s) {
    n[s[0]]++;
    seedByQ['Q' + POOL_PREFIX_[s[0]] + (n[s[0]] < 10 ? '0' : '') + n[s[0]]] = { tab: s[5], keys: s[6] };
  });

  var fixed = 0;
  formsRead_(FORM_SHEETS.ITEMS, true).forEach(function (q) {
    if (str_(q.sourceId)) return;
    var seed = seedByQ[str_(q.qId)];
    var tab = str_(q.sourceTab) || (seed ? seed.tab : '');
    var keys = seed ? seed.keys : [str_(q.question).slice(0, 12)];
    var id = resolveSourceId_(tab, keys);
    if (!id) return;
    updateRow(FORM_SHEETS.ITEMS, q._row, { sourceTab: tab, sourceId: id, updatedAt: todayStr_() });
    fixed++;
  });
  var msg = fixed ? ('ผูกต้นทางเพิ่มได้ ' + fixed + ' ข้อ') : 'ไม่มีข้อที่ผูกต้นทางเพิ่มได้ในรอบนี้';
  try { alert_('ผูกข้อสอบกับต้นทาง', msg); } catch (e) { Logger.log(msg); }
  return fixed;
}

/** เรียกจากเมนูชีตได้ ถ้าอยากดูสรุปทันทีโดยไม่รออีเมล */
function showFormsCoverage() {
  var msg = formsCoverageDigest();
  try { alert_('ความครอบคลุมของข้อสอบ', msg); } catch (e) { Logger.log(msg); }
  return msg;
}

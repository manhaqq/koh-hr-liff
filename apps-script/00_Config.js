/*******************************************************************
 * โก๋ในซอย HR Hub — 00_Config.gs
 * ศูนย์รวมค่าตั้งค่าทั้งหมดของระบบ
 * -----------------------------------------------------------------
 * ⚠️ ห้ามใส่ Token ตรงๆ ในไฟล์นี้ ให้ใส่ใน Script Properties แทน
 *    (Apps Script > ⚙️ Project Settings > Script Properties)
 *******************************************************************/

/** ค่าที่ต้องตั้งใน Script Properties (คีย์ต้องสะกดตรงเป๊ะ) */
var REQUIRED_PROPS = [
  'CHANNEL_ACCESS_TOKEN',   // Messaging API > Channel access token (long-lived)
  'CHANNEL_SECRET',         // Messaging API > Channel secret  (ใช้ตรวจลายเซ็น)
  'LOGIN_CHANNEL_ID',       // LINE Login channel ID (ตัวเลข) — ใช้ verify ID token ของ LIFF
  'SPREADSHEET_ID',         // ID ของ Google Sheets ฐานข้อมูล
  'LIFF_ID_VERIFY',         // LIFF ID หน้ายืนยันตัวตน
  'LIFF_ID_NEWS',
  'LIFF_ID_HANDBOOK',
  'LIFF_ID_SCHEDULE',
  'LIFF_ID_HR',
  'LIFF_ID_APPGUIDE',       // คู่มือแอป myHR Cloud
  'LIFF_ID_ORG',            // ผังองค์กร
  'LIFF_ID_REPORTS',        // รายการรายงาน
  'HR_NOTIFY_GROUP_ID',     // groupId ของกลุ่ม LINE ทีม HR (โหมด 0 บาท เว้นว่างได้)
  'WEBAPP_URL'              // URL ของ Web App (ลงท้าย /exec) ใช้สร้างลิงก์ปฏิทิน
];

/** ค่าที่ระบบเติมให้เองหลังรัน setupRichMenus() — ไม่ต้องกรอกเอง */
var AUTO_PROPS = ['RICHMENU_ID_GUEST','RICHMENU_ID_MAIN','RICHMENU_ID_MAIN_N',
                  'RICHMENU_ID_MAIN_H','RICHMENU_ID_MAIN_NH','ICS_SECRET'];

var P = PropertiesService.getScriptProperties();

function cfg(key, fallback) {
  var v = P.getProperty(key);
  return (v === null || v === '') ? (fallback === undefined ? '' : fallback) : v;
}

var CFG = {
  get token()        { return cfg('CHANNEL_ACCESS_TOKEN'); },
  get secret()       { return cfg('CHANNEL_SECRET'); },
  get loginChannelId(){ return cfg('LOGIN_CHANNEL_ID'); },
  get ssId()         { return cfg('SPREADSHEET_ID'); },
  get hrGroupId()    { return cfg('HR_NOTIFY_GROUP_ID'); },
  liff: {
    get verify()   { return cfg('LIFF_ID_VERIFY'); },
    get news()     { return cfg('LIFF_ID_NEWS'); },
    get handbook() { return cfg('LIFF_ID_HANDBOOK'); },
    get schedule() { return cfg('LIFF_ID_SCHEDULE'); },
    get hr()       { return cfg('LIFF_ID_HR'); },
    get appguide() { return cfg('LIFF_ID_APPGUIDE'); },
    get org()      { return cfg('LIFF_ID_ORG'); },
    get reports()  { return cfg('LIFF_ID_REPORTS'); }
  },
  get richMenuMain()  { return cfg('RICHMENU_ID_MAIN'); },
  get richMenuGuest() { return cfg('RICHMENU_ID_GUEST'); },
  get webappUrl()     { return cfg('WEBAPP_URL'); },
  TZ: 'Asia/Bangkok',
  ORG: 'ร้านโก๋ในซอย',
  BRAND: {
    primary:   '#6B4A2B',   // น้ำตาลเข้ม — พื้นหัวเรื่อง/ปุ่ม (ตัวอักษรขาว)
    accent:    '#DBA66B',   // แทน — พื้น/เส้นขอบ
    accentInk: '#9A6B2E',   // แทนเข้ม — ตัวอักษรบนพื้นสว่าง
    ink:       '#312215',
    sub:       '#866B4E',
    bg:        '#F9F1E8',
    danger:    '#B3261E',
    ok:        '#146C43'
  }
};

function liffUrl(liffId, query) {
  if (!liffId) return 'https://line.me';
  return 'https://liff.line.me/' + liffId + (query ? ('?' + query) : '');
}

/** ชื่อชีตทั้งหมด — เปลี่ยนที่นี่ที่เดียว */
var SHEETS = {
  EMPLOYEES:     'Employees',
  ANNOUNCEMENTS: 'Announcements',
  HANDBOOK:      'Handbook',
  APPGUIDE:      'AppGuide',
  ORGCHART:      'OrgChart',
  SCHEDULE:      'Schedule',
  SHIFTS:        'Shifts',
  SHIFTPATTERN:  'ShiftPattern',
  REPORTS:       'Reports',
  FAQ:           'FAQ',
  TICKETS:       'Tickets',
  LEAVE:         'Leave',
  AUDIT:         'AuditLog',
  BROADCAST:     'BroadcastLog',
  SETTINGS:      'Settings'
};

/** สถานะพนักงาน */
var EMP_STATUS = {
  ACTIVE:    'active',      // ทำงานอยู่ — เห็นเมนูเต็ม
  PENDING:   'pending',     // รอ HR อนุมัติ
  SUSPENDED: 'suspended',   // พักงาน/ระงับชั่วคราว
  RESIGNED:  'resigned'     // ลาออก — ตัดสิทธิ์ทั้งหมด
};

/** บทบาท */
var ROLES = { STAFF: 'staff', SUPERVISOR: 'supervisor', HR: 'hr', ADMIN: 'admin' };

/** สิทธิ์ดูรายงาน — audience ในชีต Reports */
var REPORT_AUDIENCE = {
  ALL:  ['staff', 'supervisor', 'hr', 'admin'],
  HEAD: ['supervisor', 'hr', 'admin'],
  HR:   ['hr', 'admin']
};

/** ชื่อวันแบบย่อ ใช้จับคู่กับคอลัมน์ days ในชีต ShiftPattern */
var DOW_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** หมวดเรื่องที่ส่งถึง HR */
var TICKET_CATEGORIES = [
  { id: 'consult',   label: 'ขอคำปรึกษา',            emoji: '💡', sla: 2 },
  { id: 'leave',     label: 'เรื่องการลา/วันหยุด',    emoji: '🌴', sla: 1 },
  { id: 'payroll',   label: 'เงินเดือน/OT/สลิป',      emoji: '💰', sla: 2 },
  { id: 'welfare',   label: 'สวัสดิการ/ประกันสังคม',  emoji: '🏥', sla: 3 },
  { id: 'document',  label: 'ขอเอกสาร/ใบรับรอง',      emoji: '📄', sla: 3 },
  { id: 'schedule',  label: 'ตารางงาน/ขอสลับกะ',      emoji: '🗓️', sla: 1 },
  { id: 'problem',   label: 'รายงานปัญหาในที่ทำงาน',  emoji: '⚠️', sla: 1 },
  { id: 'complaint', label: 'ร้องเรียน (เป็นความลับ)', emoji: '🔒', sla: 1 },
  { id: 'other',     label: 'เรื่องอื่นๆ',            emoji: '✉️', sla: 3 }
];

/** ระดับความเป็นส่วนตัวของเรื่องร้องเรียน */
var PRIVACY = {
  NORMAL:    'normal',     // HR และหัวหน้าเห็นชื่อ
  HR_ONLY:   'hr_only',    // เฉพาะ HR เห็นชื่อ ไม่ผ่านหัวหน้าสาขา
  ANONYMOUS: 'anonymous'   // ไม่บันทึกชื่อเลย ติดตามด้วยรหัสเรื่อง
};

/* ================================================================
 * คำศัพท์สถานะ — ทั้งระบบใช้ชุดนี้ชุดเดียว
 * ----------------------------------------------------------------
 * ★ ทำไมต้องรวมมาไว้ที่เดียว
 *   เดิมแต่ละไฟล์นิยามคำว่า "ปิดแล้ว" กันเอง ฝั่งเขียนลง 'ตอบแล้ว'
 *   ฝั่งอ่านบางที่หา 'เสร็จ' บางที่หา 'closed' ผลคือ
 *     • เรื่องที่ HR ตอบไปแล้วยังถูกนับเป็นงานค้างและ "เกินกำหนด" ตลอดไป
 *       แล้วโผล่ในอีเมล 09:00 ทุกเช้าไม่จบ จน HR เลิกเชื่ออีเมลฉบับนั้น
 *     • รายงาน R09 บอกว่า 100% ยังไม่ปิดตลอดกาล เพราะไม่เคยมีโค้ดไหน
 *       เขียนคำว่า 'closed' ลงชีตเลยสักครั้ง
 *     • รายงาน R10 บอกว่าอนุมัติ 0 ใบ เพราะไปเทียบกับคำอังกฤษ 'approved'
 *       แต่ระบบเขียนคำไทยลงชีต
 *   รายงานที่โกหกอันตรายกว่าไม่มีรายงาน เพราะคนเอาไปใช้ตัดสินใจจริง
 *
 * ★ ทำไมค่าที่เก็บจริงเป็นภาษาไทย
 *   HR อ่านและพิมพ์คอลัมน์ status เองในชีต ถ้าเก็บเป็นภาษาอังกฤษ
 *   สุดท้ายก็จะมีคนพิมพ์ไทยทับอยู่ดี แล้วรายงานก็เพี้ยนซ้ำอีกรอบ
 *
 * ★ กติกา: ห้ามเทียบสถานะด้วยข้อความดิบอีก ให้เรียกผ่าน
 *   isTicketOpen() / isLeavePending() / normalizeXxxStatus() เท่านั้น
 * ================================================================ */

/** สถานะของ "เรื่องถึง HR" (คอลัมน์ status ในชีต Tickets) */
var TICKET_STATUS = {
  NEW:      'ใหม่',              // เข้ามาแล้วยังไม่มีใครแตะ
  WIP:      'กำลังดำเนินการ',    // HR รับเรื่องแล้วแต่ยังตอบไม่ได้
  ANSWERED: 'ตอบแล้ว',           // ส่งคำตอบให้ผู้แจ้งแล้ว (ติดจุดแดงให้เขาแล้ว)
  CLOSED:   'เสร็จสิ้น'          // ปิดเรื่อง ไม่ต้องทำอะไรต่อ
};

/** สถานะใบลา (คอลัมน์ status ในชีต Leave) */
var LEAVE_STATUS = {
  PENDING:  'รออนุมัติ',
  APPROVED: 'อนุมัติ',
  REJECTED: 'ไม่อนุมัติ'
};

/**
 * แปลงค่าสถานะเรื่องที่เคยเขียนไว้หลายแบบ ให้เหลือคำมาตรฐานคำเดียว
 * คืน '' ถ้าเป็นคำที่ระบบไม่รู้จัก — ผู้เรียกต้องตัดสินใจเองว่าจะทำอย่างไรต่อ
 * (ตั้งใจให้ "ไม่รู้จัก" กลายเป็น "ยังค้าง" เพื่อให้ HR เห็น ไม่ใช่หายเงียบ)
 */
function normalizeTicketStatus(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return TICKET_STATUS.NEW;              // ช่องว่าง = เพิ่งเข้ามา
  var low = s.toLowerCase();

  /* ★ ดักคำปฏิเสธก่อนทุกอย่าง — "ยังไม่ตอบ" มีคำว่า "ตอบ" อยู่ในตัวมันเอง
     ถ้าไม่ดักไว้ เรื่องที่ยังไม่ได้ตอบจะถูกนับว่าตอบแล้วและหายออกจากงานค้าง
     ซึ่งเป็นความผิดพลาดที่อันตรายที่สุดของไฟล์นี้ */
  if (s.indexOf('ยังไม่') >= 0 || s.indexOf('ไม่ได้') >= 0) return TICKET_STATUS.WIP;

  /* เช็ก "ปิด/เสร็จ" ก่อน เพราะเป็นสถานะที่จบที่สุด
     ถ้ามีคนพิมพ์ว่า "ตอบแล้วปิดเรื่อง" ต้องนับเป็นปิด ไม่ใช่แค่ตอบแล้ว */
  if (s.indexOf('เสร็จ') >= 0 || s.indexOf('ปิด') >= 0 ||
      ['closed', 'close', 'done', 'resolved', 'complete', 'completed'].indexOf(low) >= 0) {
    return TICKET_STATUS.CLOSED;
  }
  if (s.indexOf('ตอบ') >= 0 || ['answered', 'replied', 'reply'].indexOf(low) >= 0) {
    return TICKET_STATUS.ANSWERED;
  }
  if (s.indexOf('ดำเนินการ') >= 0 || s.indexOf('กำลัง') >= 0 || s.indexOf('รับเรื่อง') >= 0 ||
      ['wip', 'in progress', 'in_progress', 'inprogress', 'processing'].indexOf(low) >= 0) {
    return TICKET_STATUS.WIP;
  }
  if (s.indexOf('ใหม่') >= 0 || ['new', 'open'].indexOf(low) >= 0) {
    return TICKET_STATUS.NEW;
  }
  return '';                                      // ไม่รู้จัก — ห้ามเดาแทน HR
}

/**
 * เรื่องนี้ยังต้องให้ HR ทำอะไรต่ออยู่ไหม
 * ★ จุดเดียวในระบบที่ตัดสินคำว่า "ค้าง" — ทุกที่ต้องเรียกตัวนี้
 *   'ตอบแล้ว' ถือว่าไม่ค้าง เพราะ HR ทำหน้าที่ครบแล้ว เหลือแค่กดปิดเรื่อง
 *   (ถ้านับว่าค้าง อีเมล 09:00 จะกลับไปกวนทุกวันเหมือนเดิม)
 */
function isTicketOpen(status) {
  var n = normalizeTicketStatus(status);
  return n !== TICKET_STATUS.ANSWERED && n !== TICKET_STATUS.CLOSED;
}

/** แปลงค่าสถานะใบลาแบบเดียวกัน — คืน '' ถ้าไม่รู้จัก */
function normalizeLeaveStatus(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return LEAVE_STATUS.PENDING;           // ช่องว่าง = เพิ่งยื่น ยังไม่มีใครตัดสิน
  var low = s.toLowerCase();

  /* ★ ลำดับสำคัญมาก: ทั้ง 'รออนุมัติ' และ 'ไม่อนุมัติ' มีคำว่า 'อนุมัติ' อยู่ข้างใน
     ถ้าเช็ก 'อนุมัติ' ก่อน ใบที่ยังรอและใบที่ถูกปฏิเสธจะถูกนับเป็นอนุมัติทั้งหมด */
  if (s.indexOf('รอ') >= 0 || ['pending', 'waiting', 'wait'].indexOf(low) >= 0) {
    return LEAVE_STATUS.PENDING;
  }
  if (s.indexOf('ไม่อนุมัติ') >= 0 || s.indexOf('ปฏิเสธ') >= 0 ||
      ['rejected', 'reject', 'denied', 'deny'].indexOf(low) >= 0) {
    return LEAVE_STATUS.REJECTED;
  }
  if (s.indexOf('อนุมัติ') >= 0 || ['approved', 'approve'].indexOf(low) >= 0) {
    return LEAVE_STATUS.APPROVED;
  }
  return '';
}

/** ใบลานี้ยังรอ HR ตัดสินอยู่ไหม */
function isLeavePending(status) {
  return normalizeLeaveStatus(status) === LEAVE_STATUS.PENDING;
}

/** ตรวจว่าตั้งค่าครบหรือยัง — เรียกจากเมนู 🔧 */
function checkConfig() {
  var missing = [];
  REQUIRED_PROPS.forEach(function (k) {
    if (k === 'HR_NOTIFY_GROUP_ID') return;   // ไม่บังคับ (โหมด 0 บาทใช้อีเมลแทน)
    if (!cfg(k)) missing.push(k);
  });
  var msg = missing.length
    ? '❌ ยังไม่ได้ตั้งค่า:\n• ' + missing.join('\n• ')
    : '✅ ตั้งค่าครบทุกรายการแล้ว';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('ตรวจสอบการตั้งค่า', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return missing;
}

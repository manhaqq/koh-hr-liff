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

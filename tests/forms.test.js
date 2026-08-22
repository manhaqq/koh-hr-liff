/*******************************************************************
 * tests/forms.test.js — เอนจินแบบทดสอบ (apps-script/13_Forms.js)
 *
 * ★ ทำไมชุดนี้ทดสอบเป็น "คุณสมบัติ" ไม่ใช่ happy path
 *   สิ่งที่ 13_Forms.js สัญญาไว้ไม่ใช่ "ทำข้อสอบได้" แต่คือ
 *     1. เฉลยไม่เคยเดินทางถึงเครื่องผู้ใช้ก่อน commit คำตอบ
 *     2. ย้อนกลับไปแก้คำตอบไม่ได้ แม้ยิง request เอง
 *     3. ทำค้างแล้วกลับมาทำต่อได้ที่ข้อเดิม คำตอบเก่าไม่หาย
 *     4. หัวหน้าเห็นเฉพาะแผนกตัวเอง และไม่เห็นว่าใครตอบข้อไหนว่าอะไร
 *   ทั้งสี่ข้อพังได้แบบ "ยังทำงานได้ปกติ" จึงต้องตรวจด้วยการเดินทุกฟิลด์
 *   ของ response จริง ไม่ใช่ดูแค่ว่า ok === true
 *
 * ★ โหลดไฟล์จริงทั้ง 00_Config.js + 02_Data.js + 13_Forms.js
 *   ไม่ stub ชั้นข้อมูล เพราะบั๊กที่แพงที่สุดของโปรเจ็คนี้อยู่ตรงรอยต่อ
 *   ระหว่างโค้ดกับ API ของ Google พอดี (แถวหัวคอลัมน์จริง, getRange,
 *   เมธอดที่ไม่มีอยู่จริง) — stub ทิ้งเมื่อไหร่ก็เลิกจับบั๊กพวกนั้นทันที
 *******************************************************************/
const fs = require('fs'), vm = require('vm'), path = require('path');
const { makeSpreadsheet } = require('./sheets-mock.js');
const GAS = path.join(__dirname, '..', 'apps-script');

/* ================================================================
 * นาฬิกาปลอม
 * ★ ทำไมต้องเดินหน้าทีละ 1 มิลลิวินาทีทุกครั้งที่เรียก new Date()
 *   บนของจริง ทุกคำสั่งที่แตะชีตคือ RPC ข้ามเครือข่าย เวลาจึงเดินไป
 *   หลายสิบมิลลิวินาทีเสมอระหว่างสองคำสั่ง แต่ใน mock ทุกอย่างเสร็จ
 *   ในมิลลิวินาทีเดียวกัน ซึ่งทำให้ tableVersion_ (ที่ใช้เวลาเป็นเลขเวอร์ชัน)
 *   ได้เลขซ้ำ แล้วเทสต์จะล้มแบบสุ่มด้วยเหตุที่ไม่เกิดบนของจริง
 *   นาฬิกานี้จึงจำลอง "เวลาเดินหน้าเสมอ" ให้ตรงกับของจริง
 * ================================================================ */
let NOW = Date.UTC(2026, 7, 22, 5, 0, 0);      /* 2026-08-22 12:00:00 +07 */
class FakeDate extends Date {
  constructor(...a) { if (a.length === 0) { NOW += 1; super(NOW); } else { super(...a); } }
  static now() { NOW += 1; return NOW; }
}
const CLOCK = { advance(ms) { NOW += ms; }, iso() { return new Date(NOW).toISOString(); } };

/* Utilities.formatDate(date, timeZone, format)
   https://developers.google.com/apps-script/reference/utilities/utilities#formatdatedate,-timezone,-format */
const Utilities = {
  formatDate(d, tz, fmt) {
    const off = (tz === 'Asia/Bangkok') ? 7 * 3600000 : 0;
    const x = new Date(d.getTime() + off);
    const p2 = n => String(n).padStart(2, '0');
    const map = {
      yyyy: String(x.getUTCFullYear()), yy: p2(x.getUTCFullYear() % 100),
      MM: p2(x.getUTCMonth() + 1), dd: p2(x.getUTCDate()),
      HH: p2(x.getUTCHours()), mm: p2(x.getUTCMinutes()), ss: p2(x.getUTCSeconds())
    };
    return String(fmt).replace(/yyyy|yy|MM|dd|HH|mm|ss/g, t => map[t]);
  },
  /* https://developers.google.com/apps-script/reference/utilities/utilities#sleepmilliseconds */
  sleep() {}
};

/* CacheService — เก็บของจริงในหน่วยความจำ ไม่ทำ TTL เพราะเทสต์รันไม่ถึงวินาที
   https://developers.google.com/apps-script/reference/cache/cache-service#getscriptcache */
const CACHE = {};
const scriptCache = {
  get: k => (CACHE[k] === undefined ? null : CACHE[k]),
  put: (k, v) => { CACHE[k] = String(v); },
  getAll: ks => { const o = {}; ks.forEach(k => { if (CACHE[k] !== undefined) o[k] = CACHE[k]; }); return o; },
  putAll: o => { Object.keys(o).forEach(k => { CACHE[k] = String(o[k]); }); },
  remove: k => { delete CACHE[k]; },
  removeAll: ks => { ks.forEach(k => delete CACHE[k]); }
};
const CacheService = { getScriptCache: () => scriptCache, getUserCache: () => scriptCache };

/* LockService — เทสต์เป็น single thread จึงได้ล็อกเสมอ แต่ต้องมี "เมธอดครบ"
   https://developers.google.com/apps-script/reference/lock/lock-service#getscriptlock
   https://developers.google.com/apps-script/reference/lock/lock */
let LOCK_DEPTH = 0, LOCK_MAX = 0;
const LockService = {
  getScriptLock: () => ({
    waitLock(ms) { LOCK_DEPTH++; LOCK_MAX = Math.max(LOCK_MAX, LOCK_DEPTH); },
    tryLock(ms) { LOCK_DEPTH++; return true; },
    releaseLock() { LOCK_DEPTH--; },
    hasLock() { return LOCK_DEPTH > 0; }
  })
};

/* PropertiesService
   https://developers.google.com/apps-script/reference/properties/properties-service#getscriptproperties */
const PROPS = { SPREADSHEET_ID: 'SS_TEST', LIFF_ID_HANDBOOK: 'liffHB', LIFF_ID_APPGUIDE: 'liffAG' };
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (PROPS[k] === undefined ? null : PROPS[k]),
    setProperty(k, v) { PROPS[k] = String(v); return this; },
    deleteProperty(k) { delete PROPS[k]; return this; },
    getProperties: () => Object.assign({}, PROPS)
  })
};

/* https://developers.google.com/apps-script/reference/base/logger#logdata */
const Logger = { log: () => {} };

/* ================================================================
 * ข้อมูลตั้งต้นในชีต — ใช้หัวคอลัมน์จริงจาก SCHEMA ใน 07_Admin.js
 * ★ lineUserId ใส่ค่าที่จำง่ายไว้เป็น "สารตรวจรั่ว" ถ้าสตริงนี้โผล่ใน
 *   response ไหนหรือใน AuditLog แปลว่ากฎเหล็กข้อ lineUserId ถูกละเมิด
 * ================================================================ */
const LEAK = 'Uleaksentinel00000000000000000001';

const EMP_HEAD = ['empCode','prefix','firstName','lastName','fullName','nickname','position','dept','role',
                  'reportsTo','branch','startDate','phone','phoneLast4','lineUserId','lineName','status',
                  'verifiedAt','offboardedAt','note'];
function emp(code, nick, dept, role, status, uid) {
  const o = { empCode: code, firstName: nick, lastName: 'ทดสอบ', fullName: nick + ' ทดสอบ',
              nickname: nick, position: 'พนักงาน', dept: dept, role: role, branch: 'สาขาหลัก',
              phone: '0812345678', phoneLast4: '5678', lineUserId: uid || (LEAK + code),
              status: status || 'active' };
  return EMP_HEAD.map(h => (o[h] === undefined ? '' : o[h]));
}

const SS = makeSpreadsheet('SS_TEST', {
  Employees: [EMP_HEAD,
    emp('E001', 'พี่หนึ่ง', 'ครัว',      'supervisor'),
    emp('E002', 'สอง',      'ครัว',      'staff'),
    emp('E003', 'สาม',      'ครัว',      'staff'),
    emp('E004', 'สี่',       'หน้าร้าน',  'staff'),
    emp('E005', 'ห้า',      'ครัว',      'staff', 'resigned'),
    emp('E006', 'หก',       '',          'supervisor'),
    emp('E007', 'เจ็ด',     'สำนักงาน',  'hr')
  ],
  /* ★ Handbook มี "แถวคำอธิบายผสานเซลล์" อยู่บนสุดโดยตั้งใจ
     เพื่อพิสูจน์ว่า readTableRaw_/headerIndex_ หาแถวหัวคอลัมน์จริงเจอ
     ซึ่งเป็นบั๊กเงียบที่ 13_Forms.js กับ 14_Media.js เตือนไว้ทั้งคู่ */
  Handbook: [
    ['คู่มือพนักงาน — แก้ไขได้เฉพาะ HR'],
    ['id','category','order','title','body','fileUrl','tags','status','updatedAt'],
    ['H01','เริ่มต้นใช้งาน','1','ยืนยันตัวตน','กรอกชื่อจริงและเบอร์ 4 ตัวท้าย','','','on','2026-08-01'],
    ['H02','ข้อมูลส่วนบุคคล','2','เปลี่ยนข้อมูลส่วนตัว','แจ้ง HR ทุกครั้ง','','','on','2026-08-01']
  ],
  AppGuide: [
    ['id','group','groupOrder','order','title','body','image','tip','status'],
    ['A01','เข้าระบบ','1','1','เข้าระบบครั้งแรก','กดยืนยันตัวตนในเมนู','','','on']
  ],
  Reports:  [['reportId','title','category','kind','audience','description','howto','sheetFn','status','updatedAt']],
  AuditLog: [['timestamp','actor','action','target','detail']],
  Settings: [['key','value','note']]
});

const SpreadsheetApp = {
  /* https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openbyidid */
  openById(id) { if (id !== 'SS_TEST') throw new Error('openById: ไม่พบสเปรดชีต ' + id); return SS; },
  /* https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#getactivespreadsheet */
  getActiveSpreadsheet() { return SS; }
};

/* ================================================================ */
const ctx = vm.createContext({
  console, JSON, Math, String, Number, Object, Array, Error, TypeError, RegExp,
  isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  Date: FakeDate,
  SpreadsheetApp, PropertiesService, CacheService, LockService, Utilities, Logger
});

for (const f of ['00_Config.js', '02_Data.js', '13_Forms.js']) {
  vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), ctx, { filename: f });
}

/* alert_ / confirm_ อยู่ใน 07_Admin.js ซึ่งลาก UI ทั้งก้อนมาด้วย จึงต่อสายตรงนี้
   (13_Forms.js เรียกผ่าน try/catch อยู่แล้ว แต่เราอยากเห็นข้อความที่ HR จะได้อ่าน) */
const ALERTS = [];
ctx.alert_ = (title, body) => { ALERTS.push(title + '\n' + body); };
ctx.confirm_ = () => true;

/* ================================================================ */
const results = [];
function check(name, fn) {
  try { fn(); results.push(['✓', name, '']); }
  catch (e) { results.push(['✗', name, e.message]); }
}
function eq(got, want, what) {
  if (got !== want) throw new Error(what + ': ได้ ' + JSON.stringify(got) + ' ควรเป็น ' + JSON.stringify(want));
}
function truthy(v, what) { if (!v) throw new Error(what + ' — ได้ ' + JSON.stringify(v)); }

/** เดินทุกฟิลด์ทุกชั้นของ object/array */
function walk(node, cb, path) {
  path = path || '$';
  if (Array.isArray(node)) { node.forEach((v, i) => walk(v, cb, path + '[' + i + ']')); return; }
  if (node && typeof node === 'object') {
    Object.keys(node).forEach(k => { cb(path + '.' + k, k, node[k]); walk(node[k], cb, path + '.' + k); });
  }
}

/* ★ ฟิลด์ที่ห้ามออกจากเซิร์ฟเวอร์ก่อนผู้ใช้ commit คำตอบของข้อนั้น
   ตรงกับคอมเมนต์ของ publicItem_ ใน 13_Forms.js เป๊ะ ๆ */
const ANSWER_KEY_FIELDS = ['correct', 'correctChoice', 'correctText', 'explain',
                           'sourceTab', 'sourceId', 'points'];
const ATTEMPT_INTERNALS = ['answers', 'qIds'];

function assertNoFields(node, fields, label) {
  const hits = [];
  walk(node, (p, k) => { if (fields.indexOf(k) >= 0) hits.push(p); });
  if (hits.length) throw new Error(label + ' — เจอฟิลด์ต้องห้าม: ' + hits.join(', '));
}
function assertNoLeak(node, label) {
  const s = JSON.stringify(node || '');
  if (s.indexOf(LEAK) >= 0) throw new Error(label + ' — lineUserId หลุดออกไปกับ response');
  if (s.indexOf('0812345678') >= 0) throw new Error(label + ' — เบอร์โทรพนักงานหลุดออกไปกับ response');
}

const EMPS = {
  sup:      { empCode: 'E001', nickname: 'พี่หนึ่ง', fullName: 'พี่หนึ่ง ทดสอบ', dept: 'ครัว', branch: 'สาขาหลัก', role: 'supervisor' },
  staff2:   { empCode: 'E002', nickname: 'สอง', fullName: 'สอง ทดสอบ', dept: 'ครัว', branch: 'สาขาหลัก', role: 'staff' },
  staff3:   { empCode: 'E003', nickname: 'สาม', fullName: 'สาม ทดสอบ', dept: 'ครัว', branch: 'สาขาหลัก', role: 'staff' },
  staff4:   { empCode: 'E004', nickname: 'สี่', fullName: 'สี่ ทดสอบ', dept: 'หน้าร้าน', branch: 'สาขาหลัก', role: 'staff' },
  supNoDept:{ empCode: 'E006', nickname: 'หก', fullName: 'หก ทดสอบ', dept: '', branch: 'สาขาหลัก', role: 'supervisor' },
  hr:       { empCode: 'E007', nickname: 'เจ็ด', fullName: 'เจ็ด ทดสอบ', dept: 'สำนักงาน', branch: 'สาขาหลัก', role: 'hr' }
};

function api(action, d, who) {
  ctx.__a = action; ctx.__d = d || {}; ctx.__e = who; ctx.__u = LEAK;
  return vm.runInContext('handleFormsApi_(__a, __d, __e, __u)', ctx);
}
function tab(name) { return vm.runInContext('readTable(' + JSON.stringify(name) + ', true)', ctx); }
function run(src) { return vm.runInContext(src, ctx); }

console.log('═══ 13_Forms.js — เอนจินแบบทดสอบ ═══\n');

/* ================================================================
 * ① ยังไม่ติดตั้ง = ปิดตัวเองเงียบ ๆ ไม่ระเบิด
 * ================================================================ */
check('ยังไม่มีแท็บ Forms → quiz_list คืนรายการว่าง ไม่ throw', () => {
  const r = api('quiz_list', {}, EMPS.staff2);
  eq(r.ok, true, 'ok');
  eq(r.forms.length, 0, 'จำนวนแบบทดสอบ');
});

check('ยังไม่มีแท็บ Forms → quiz_start บอกให้ไปติดตั้งก่อน', () => {
  const r = api('quiz_start', { formId: 'F001' }, EMPS.staff2);
  eq(r.ok, false, 'ok');
  eq(r.code, 'FORMS_NOT_READY', 'code');
});

/* ================================================================
 * ② ติดตั้ง + seed
 * ================================================================ */
check('ensureFormsSheets() สร้างแท็บ + seed ได้จริง (ไม่พึ่งเมธอดที่ไม่มีอยู่จริง)', () => {
  run('ensureFormsSheets()');
  ['Forms', 'FormItems', 'FormResponses'].forEach(n => {
    truthy(run('formsSheetExists_(' + JSON.stringify(n) + ')'), 'ควรมีแท็บ ' + n);
  });
});

let SEED_N = 0;
check('seedFormsIfEmpty_ เขียนข้อสอบตั้งต้นครบทุกข้อ', () => {
  SEED_N = tab('FormItems').length;
  truthy(SEED_N > 0, 'ควรมีข้อสอบตั้งต้น');
  eq(SEED_N, run('QUIZ_SEED_.length'), 'จำนวนข้อที่เขียนลงชีต');
  const bad = tab('FormItems').filter(q => !String(q.qId).trim() || !String(q.question).trim());
  eq(bad.length, 0, 'ข้อที่ qId หรือคำถามว่าง');
});

check('★ แบบทดสอบตัวอย่างต้องเกิดมาพร้อม status = off', () => {
  const forms = tab('Forms');
  eq(forms.length, 1, 'จำนวนแบบทดสอบ');
  eq(String(forms[0].status).trim(), 'off', 'status ของชุดตัวอย่าง');

  /* ★ ด่านที่สอง: ตัว "ข้อ" ก็ต้องปิดมาด้วย ไม่ใช่ปิดแค่ตัวชุด
     ถ้าข้อเป็น 'on' หมด การเปิดใช้จะเหลือสวิตช์เดียวที่แถว F001
     คนที่ยังไม่ได้อ่านทวนกดครั้งเดียว ข้อสอบที่ไม่มีใครรับรองก็ถึงพนักงาน 60 คนทันที
     ด่านที่ตั้งใจให้มีจะไม่มีอยู่จริง — เทสต์นี้กันไม่ให้ใครเผลอเปลี่ยนกลับ */
  const items = run('formsRead_(FORM_SHEETS.ITEMS, true)');
  const on = items.filter(i => String(i.status).trim().toLowerCase() !== 'off');
  eq(on.length, 0, '★ ข้อสอบตั้งต้นทุกข้อต้องเกิดมาพร้อม status = off (พบที่ยังเปิด ' + on.length + ' ข้อ)');
});

check('★ status = off → พนักงานมองไม่เห็น และเปิดทำไม่ได้', () => {
  const list = api('quiz_list', {}, EMPS.staff2);
  eq(list.forms.length, 0, 'พนักงานเห็นแบบทดสอบที่ยังไม่รีวิว');
  const st = api('quiz_start', { formId: 'F001' }, EMPS.staff2);
  eq(st.ok, false, 'ok');
  eq(st.code, 'CLOSED', 'code');
  assertNoFields(st, ANSWER_KEY_FIELDS, 'quiz_start ของแบบทดสอบที่ปิดอยู่');
});

check('seedFormsIfEmpty_ ไม่เขียนซ้ำเมื่อคลังไม่ว่าง (รันติดตั้งอีกครั้ง)', () => {
  eq(run('seedFormsIfEmpty_()'), 0, 'จำนวนข้อที่เขียนรอบสอง');
  eq(tab('FormItems').length, SEED_N, 'จำนวนข้อหลังรันซ้ำ');
  eq(tab('Forms').length, 1, 'จำนวนแบบทดสอบหลังรันซ้ำ');
});

check('ensureFormsSheets() รันซ้ำได้โดยไม่ทำลายของเดิม และไม่เพิ่ม R11/R12 ซ้ำ', () => {
  run('ensureFormsSheets()');
  eq(tab('FormItems').length, SEED_N, 'จำนวนข้อหลังติดตั้งซ้ำ');
  const rep = tab('Reports').map(r => String(r.reportId).trim());
  eq(rep.filter(x => x === 'R11').length, 1, 'จำนวนแถว R11');
  eq(rep.filter(x => x === 'R12').length, 1, 'จำนวนแถว R12');
});

check('resolveSourceId_ ผูกต้นทางได้จากแท็บที่หัวคอลัมน์อยู่แถว 2', () => {
  const linked = tab('FormItems').filter(q => String(q.sourceId).trim());
  truthy(linked.length > 0, 'ควรผูก sourceId ได้อย่างน้อย 1 ข้อ (headerIndex_ หาแถวหัวจริงไม่เจอ?)');
  const ids = tab('Handbook').map(h => String(h.id)).concat(tab('AppGuide').map(a => String(a.id)));
  linked.forEach(q => {
    if (ids.indexOf(String(q.sourceId).trim()) < 0) {
      throw new Error('ผูกไปที่ id ที่ไม่มีจริง: ' + q.qId + ' → ' + q.sourceId);
    }
  });
});

/* ================================================================
 * ③ ชุดทดสอบที่ควบคุมได้ — ลำดับข้อแน่นอน ตรวจ property ได้ตรงจุด
 * ================================================================ */
const ITEMS = [
  { qId: 'QT01', formId: 'F900', pool: 'policy', order: 1, type: 'single',
    question: 'ข้อ 1 ถามอะไรสักอย่าง',
    choiceA: 'ก', choiceB: 'ข', choiceC: 'ค', choiceD: 'ง',
    correct: 'B', explain: 'เพราะ ข ถูก', sourceTab: 'Handbook', sourceId: 'H01', points: 1, status: 'on' },
  { qId: 'QT02', formId: 'F900', pool: 'policy', order: 2, type: 'single',
    question: 'ข้อ 2 ถามอะไรสักอย่าง',
    choiceA: 'ก', choiceB: 'ข', choiceC: 'ค', choiceD: 'ง',
    correct: 'C', explain: 'เพราะ ค ถูก', sourceTab: '', sourceId: '', points: 1, status: 'on' },
  { qId: 'QT03', formId: 'F900', pool: 'policy', order: 3, type: 'multi',
    question: 'ข้อ 3 เลือกได้หลายข้อ',
    choiceA: 'ก', choiceB: 'ข', choiceC: 'ค', choiceD: 'ง',
    correct: 'A,C', explain: 'เพราะ ก กับ ค ถูก', sourceTab: '', sourceId: '', points: 2, status: 'on' },
  { qId: 'QT04', formId: 'F900', pool: 'policy', order: 4, type: 'single',
    question: 'ข้อ 4 ปิดอยู่ ต้องไม่ถูกหยิบมาใช้',
    choiceA: 'ก', choiceB: 'ข', correct: 'A', explain: 'ไม่ควรเห็นข้อนี้',
    sourceTab: '', sourceId: '', points: 1, status: 'off' },
  { qId: 'QS01', formId: 'F901', pool: 'policy', order: 1, type: 'single',
    question: 'ชุดที่ปิดเฉลย ข้อ 1',
    choiceA: 'ก', choiceB: 'ข', correct: 'A', explain: 'เฉลยชุดนี้ห้ามโผล่',
    sourceTab: '', sourceId: '', points: 1, status: 'on' },
  { qId: 'QS02', formId: 'F901', pool: 'policy', order: 2, type: 'single',
    question: 'ชุดที่ปิดเฉลย ข้อ 2',
    choiceA: 'ก', choiceB: 'ข', correct: 'B', explain: 'เฉลยชุดนี้ห้ามโผล่',
    sourceTab: '', sourceId: '', points: 1, status: 'on' }
];
const FORMS = [
  { formId: 'F900', type: 'quiz', title: 'ชุดควบคุม', description: 'ลำดับข้อแน่นอน',
    audience: 'all', audienceValue: '', drawRules: '', passMark: 70,
    retakePolicy: 'always', cooldownHours: 0, shuffle: 'FALSE', showExplain: 'TRUE',
    openFrom: '', dueDate: '', status: 'on', updatedAt: '2026-08-22' },
  { formId: 'F901', type: 'quiz', title: 'ชุดปิดเฉลย', description: 'showExplain = FALSE',
    audience: 'all', audienceValue: '', drawRules: '', passMark: 50,
    retakePolicy: 'always', cooldownHours: 0, shuffle: 'FALSE', showExplain: 'FALSE',
    openFrom: '', dueDate: '', status: 'on', updatedAt: '2026-08-22' },
  { formId: 'F902', type: 'quiz', title: 'ชุดเฉพาะแผนกบัญชี', description: '',
    audience: 'dept', audienceValue: 'บัญชี', drawRules: '', passMark: 50,
    retakePolicy: 'always', cooldownHours: 0, shuffle: 'FALSE', showExplain: 'TRUE',
    openFrom: '', dueDate: '', status: 'on', updatedAt: '2026-08-22' }
];
run('formsBulkAppend_(FORM_SHEETS.ITEMS, ' + JSON.stringify(ITEMS) + ')');
run('formsBulkAppend_(FORM_SHEETS.FORMS, ' + JSON.stringify(FORMS) + ')');

check('ข้อที่ status = off ไม่ถูกหยิบมาออกข้อสอบ', () => {
  const ids = run('drawQuestions_(findForm_("F900"))');
  eq(ids.length, 3, 'จำนวนข้อที่หยิบมา');
  if (ids.indexOf('QT04') >= 0) throw new Error('หยิบข้อที่ปิดอยู่มาด้วย');
  eq(ids.join(','), 'QT01,QT02,QT03', 'ลำดับข้อ (drawRules ว่าง = เรียงตาม order)');
});

check('แบบทดสอบที่เจาะจงแผนกอื่น ไม่โผล่ให้คนแผนกอื่นเห็น', () => {
  const list = api('quiz_list', {}, EMPS.staff2).forms.map(f => f.formId);
  if (list.indexOf('F902') >= 0) throw new Error('เห็นแบบทดสอบของแผนกบัญชี');
  truthy(list.indexOf('F900') >= 0, 'ควรเห็น F900');
  assertNoFields(api('quiz_list', {}, EMPS.staff2), ANSWER_KEY_FIELDS, 'quiz_list');
});

/* ================================================================
 * ④ ★ คุณสมบัติที่ 1 — เฉลยไม่เคยถึงเครื่องก่อน commit
 * ================================================================ */
const SEEN = [];       /* ทุก response ที่ผ่านตาระหว่างทำข้อสอบครบชุด */

check('★ quiz_start ไม่มีเฉลยติดมาแม้แต่ฟิลด์เดียว (เดินทุกชั้น)', () => {
  const r = api('quiz_start', { formId: 'F900' }, EMPS.staff2);
  SEEN.push(['quiz_start', r]);
  truthy(r.ok, 'ok');
  truthy(!r.finished, 'ไม่ควรจบตั้งแต่เริ่ม');
  eq(r.question.qId, 'QT01', 'ข้อแรก');
  eq(r.question.index, 1, 'index');
  eq(r.question.total, 3, 'total');
  eq(r.total, 3, 'total ของชุด');
  assertNoFields(r, ANSWER_KEY_FIELDS, 'quiz_start');
  assertNoFields(r, ATTEMPT_INTERNALS, 'quiz_start');
  assertNoLeak(r, 'quiz_start');
  /* ตัวเลือกต้องมีแค่ key/text ห้ามมีธงบอกว่าข้อไหนถูก */
  r.question.choices.forEach(c => {
    eq(Object.keys(c).sort().join(','), 'key,text', 'ฟิลด์ของตัวเลือก');
  });
  ctx.__at = r.attemptId;
});

check('★ ผู้เรียก API ล้วน ส่ง choice ว่างเปล่า ก็ยังไม่ได้เฉลยข้อถัดไป', () => {
  /* เคสจริง: คนที่ยิง request เองส่ง choice = "" เพื่อหวังให้ระบบเผยเฉลย
     แล้วค่อยกลับมาตอบใหม่ให้ถูก — ต้องถูกบล็อกด้วยการ commit ทันที */
  const r = api('quiz_answer', { attemptId: ctx.__at, qId: 'QT01', choice: '' }, EMPS.staff2);
  SEEN.push(['quiz_answer(empty)', r]);
  truthy(r.ok, 'ok');
  eq(r.graded, true, 'graded');
  eq(r.correct, false, 'ตอบว่างต้องนับว่าผิด');
  eq(r.answered, 1, 'จำนวนข้อที่ตอบแล้ว');
  truthy(r.next, 'ต้องมีข้อถัดไป');
  eq(r.next.qId, 'QT02', 'ข้อถัดไป');
  /* ★ หัวใจ: เฉลยของข้อที่ "ยังไม่ตอบ" ต้องไม่ติดมากับ next */
  assertNoFields(r.next, ANSWER_KEY_FIELDS, 'quiz_answer.next');
  assertNoFields(r, ATTEMPT_INTERNALS, 'quiz_answer');
  assertNoLeak(r, 'quiz_answer');
  /* เฉลยของข้อที่เพิ่ง commit เปิดได้ เพราะย้อนกลับไปแก้ไม่ได้แล้ว */
  eq(r.correctChoice, 'B', 'เฉลยของข้อที่ commit ไปแล้ว');
});

/* ================================================================
 * ⑤ ★ คุณสมบัติที่ 2 — ตอบซ้ำไม่ได้ และ client ที่หลุด sync กู้ตัวเองได้
 * ================================================================ */
check('★ ตอบข้อเดิมซ้ำ → ถูกปฏิเสธ และได้ข้อที่ควรอยู่จริงกลับไป', () => {
  const r = api('quiz_answer', { attemptId: ctx.__at, qId: 'QT01', choice: 'B' }, EMPS.staff2);
  SEEN.push(['quiz_answer(dup)', r]);
  eq(r.ok, false, 'ok');
  eq(r.code, 'ALREADY_ANSWERED', 'code');
  truthy(r.next, 'ต้องคืนข้อที่ค้างอยู่ให้ client กู้ตัวเอง');
  eq(r.next.qId, 'QT02', 'ข้อที่ควรอยู่');
  eq(r.next.index, 2, 'index ของข้อที่ควรอยู่');
  assertNoFields(r, ANSWER_KEY_FIELDS, 'quiz_answer(ตอบซ้ำ)');
});

check('★ ตอบซ้ำแล้วคำตอบเดิมต้องไม่ถูกทับ (ตอบว่างไปแล้ว = ยังผิดอยู่)', () => {
  const rows = tab('FormResponses').filter(r => String(r.attemptId) === ctx.__at);
  eq(rows.length, 1, 'จำนวนแถวของ attempt นี้');
  const ans = JSON.parse(String(rows[0].answers));
  eq(ans.QT01, '', 'คำตอบเดิมของ QT01');
});

check('attemptId ของคนอื่นใช้ไม่ได้', () => {
  const r = api('quiz_answer', { attemptId: ctx.__at, qId: 'QT02', choice: 'C' }, EMPS.staff3);
  eq(r.ok, false, 'ok');
  eq(r.code, 'FORBIDDEN', 'code');
});

check('qId ที่ไม่อยู่ในชุดของตัวเอง ถูกปฏิเสธ', () => {
  const r = api('quiz_answer', { attemptId: ctx.__at, qId: 'QS01', choice: 'A' }, EMPS.staff2);
  eq(r.ok, false, 'ok');
  eq(r.code, 'BAD_QID', 'code');
});

/* ================================================================
 * ⑥ ★ คุณสมบัติที่ 3 — ทำค้างแล้วกลับมาต่อได้
 * ================================================================ */
check('★ ทำค้างอยู่ → quiz_start ต่อที่ข้อเดิม คำตอบเก่าไม่หาย', () => {
  /* จำลอง "แอปถูกปิดไป" ด้วยการทิ้งแคชรายครั้ง เพื่อบังคับให้ต้องอ่านจากชีตจริง */
  run('attemptCacheDrop_(__at)');
  const r = api('quiz_start', { formId: 'F900' }, EMPS.staff2);
  SEEN.push(['quiz_start(resume)', r]);
  truthy(r.ok, 'ok');
  eq(r.attemptId, ctx.__at, 'ต้องเป็นครั้งเดิม ไม่เริ่มใหม่');
  eq(r.resumed, true, 'resumed');
  eq(r.question.qId, 'QT02', 'ต่อที่ข้อถัดไป');
  eq(r.question.index, 2, 'index');
  eq(r.answered, 1, 'คำตอบเก่าที่ยังอยู่');
  assertNoFields(r, ANSWER_KEY_FIELDS, 'quiz_start(resume)');
  assertNoFields(r, ATTEMPT_INTERNALS, 'quiz_start(resume)');
});

check('★ ทำต่อจนจบ — ทุก response ระหว่างทางไม่มีเฉลยของข้อที่ยังไม่ตอบ', () => {
  const r2 = api('quiz_answer', { attemptId: ctx.__at, qId: 'QT02', choice: 'C' }, EMPS.staff2);
  SEEN.push(['quiz_answer(QT02)', r2]);
  truthy(r2.ok, 'ok'); eq(r2.correct, true, 'QT02 ตอบถูก');
  eq(r2.next.qId, 'QT03', 'ข้อถัดไป');
  assertNoFields(r2.next, ANSWER_KEY_FIELDS, 'quiz_answer(QT02).next');

  const r3 = api('quiz_answer', { attemptId: ctx.__at, qId: 'QT03', choice: 'C,A' }, EMPS.staff2);
  SEEN.push(['quiz_answer(QT03)', r3]);
  truthy(r3.ok, 'ok');
  eq(r3.correct, true, 'multi ต้องไม่สนใจลำดับตัวอักษร');
  eq(r3.next, null, 'ข้อสุดท้ายแล้ว');
  truthy(r3.summary, 'ต้องมีสรุปท้ายชุด');
  /* fixture: QT01=1 + QT02=1 + QT03=2 → คะแนนเต็ม 4 (ค่าเดิมเขียนไว้ 3 ซึ่งบวกผิด) */
  eq(r3.summary.total, 4, 'คะแนนเต็ม = ผลรวม points ของทั้ง 3 ข้อ');
  eq(r3.summary.score, 3, 'คะแนนที่ได้ (ผิดข้อแรก 1 คะแนน)');
  /* ★ ตัวเลขนี้คือหลักฐานว่าคิดเปอร์เซ็นต์จาก "คะแนน" ไม่ใช่ "จำนวนข้อ"
       คิดจากคะแนน : 3 / 4 = 75   ← ค่าที่ถูก
       คิดจากข้อ    : 2 / 3 = 67   ← ถ้าได้เลขนี้แปลว่าไม่ได้ถ่วงน้ำหนัก points */
  eq(r3.summary.percent, 75, 'เปอร์เซ็นต์ต้องคิดจากคะแนน (3/4) ไม่ใช่จำนวนข้อ (2/3)');
});

check('เดินทุกฟิลด์ของทุก response ที่เก็บไว้ อีกรอบแบบรวม', () => {
  SEEN.forEach(([label, r]) => {
    assertNoLeak(r, label);
    if (label.indexOf('quiz_start') === 0) assertNoFields(r, ANSWER_KEY_FIELDS, label);
    if (r && r.next) assertNoFields(r.next, ANSWER_KEY_FIELDS, label + '.next');
  });
});

check('ส่งครบแล้ว ตอบเพิ่มไม่ได้อีก', () => {
  const r = api('quiz_answer', { attemptId: ctx.__at, qId: 'QT01', choice: 'B' }, EMPS.staff2);
  eq(r.ok, false, 'ok');
  eq(r.code, 'FINISHED', 'code');
});

check('quiz_result เปิดได้เฉพาะเจ้าของ', () => {
  const mine = api('quiz_result', { attemptId: ctx.__at }, EMPS.staff2);
  truthy(mine.ok, 'เจ้าของต้องเปิดได้');
  assertNoLeak(mine, 'quiz_result');
  const other = api('quiz_result', { attemptId: ctx.__at }, EMPS.staff3);
  eq(other.ok, false, 'คนอื่นต้องเปิดไม่ได้');
  eq(other.code, 'FORBIDDEN', 'code');
});

/* ================================================================
 * ⑦ showExplain = FALSE → เฉลยห้ามโผล่เลยแม้แต่ข้อที่ commit แล้ว
 * ================================================================ */
check('★ showExplain = FALSE → ไม่มีเฉลยใน response ใดเลย และสรุปท้ายชุดว่าง', () => {
  const s = api('quiz_start', { formId: 'F901' }, EMPS.staff3);
  assertNoFields(s, ANSWER_KEY_FIELDS, 'F901 quiz_start');
  const a1 = api('quiz_answer', { attemptId: s.attemptId, qId: 'QS01', choice: 'B' }, EMPS.staff3);
  ['correctChoice', 'correctText', 'explain', 'source'].forEach(k => {
    if (a1[k] !== undefined) throw new Error('showExplain=FALSE แต่ยังส่ง ' + k + ' ออกไป');
  });
  const a2 = api('quiz_answer', { attemptId: s.attemptId, qId: 'QS02', choice: 'B' }, EMPS.staff3);
  truthy(a2.summary, 'ต้องมีสรุป');
  eq(a2.summary.review.length, 0, 'สรุปต้องไม่มีรายการเฉลย');
  assertNoFields(a2.summary.review, ANSWER_KEY_FIELDS, 'สรุปท้ายชุดของ F901');
});

/* ================================================================
 * ⑧ ★ คุณสมบัติที่ 4 — รายงานทีม
 * ================================================================ */
check('★ หัวหน้าเห็นเฉพาะแผนกตัวเอง และเห็นคนที่ยังไม่ทำด้วย', () => {
  const r = api('report_data', { reportId: 'R11' }, EMPS.sup);
  truthy(r.ok, 'ok');
  eq(r.data.dept, 'ครัว', 'แผนกที่ดูได้');
  const codes = r.data.rows.map(x => x.empCode).sort();
  eq(codes.join(','), 'E001,E002,E003', 'รายชื่อในขอบเขต (ต้องไม่มี E004 คนละแผนก และไม่มี E005 ที่ลาออก)');
  const two = r.data.rows.filter(x => x.empCode === 'E002')[0];
  eq(two.attempts, 1, 'จำนวนครั้งที่ E002 ทำ');
  /* ★ E002 ตอบ QT01 ด้วยค่าว่างไว้ตั้งแต่เทสต์ "ส่ง choice ว่างเปล่า" (บรรทัด ~384)
     ซึ่งถูกบันทึกเป็นคำตอบผิดและทับไม่ได้อีก คะแนนจึงเป็น 3 จาก 4 = 75%
     ★ ถ้าค่านี้กลายเป็น 100 เมื่อไหร่ แปลว่าการกันตอบซ้ำพัง — คำตอบว่างถูกเขียนทับได้
     ซึ่งเป็นบั๊กความปลอดภัยของข้อสอบ ไม่ใช่เรื่องคะแนน */
  eq(two.bestPercent, 75, 'คะแนนดีสุดของ E002 (QT01 ตอบว่าง = ผิด → 3/4)');
  const one = r.data.rows.filter(x => x.empCode === 'E001')[0];
  eq(one.attempts, 0, 'หัวหน้ายังไม่ได้ทำ ต้องขึ้นในรายการด้วย');
});

check('★ รายงานทีมไม่มีเฉลย ไม่มีคำตอบรายคน ไม่มี lineUserId/เบอร์โทร', () => {
  const r = api('report_data', { reportId: 'R11' }, EMPS.sup);
  assertNoFields(r, ANSWER_KEY_FIELDS, 'R11');
  assertNoFields(r, ATTEMPT_INTERNALS, 'R11');
  assertNoLeak(r, 'R11');
  r.data.rows.forEach(row => {
    eq(Object.keys(row).sort().join(','),
       'attempts,bestPercent,dept,empCode,lastAt,name,passed', 'ฟิลด์ต่อคนในรายงานทีม');
  });
  /* หัวข้อที่พลาดบ่อยต้องบอกแค่ "ข้อไหนพลาดกี่ครั้ง" ไม่บอกว่าเฉลยคืออะไร */
  truthy(r.data.weak.length > 0, 'ควรมีหัวข้อที่พลาด (E002 ตอบข้อแรกว่าง)');
  r.data.weak.forEach(w => {
    eq(Object.keys(w).sort().join(','), 'misses,poolLabel,qId,question', 'ฟิลด์ของหัวข้อที่พลาดบ่อย');
  });
});

check('★ หัวหน้าที่ยังไม่ได้ระบุแผนก = ไม่ตรงกับใครเลย (ห้ามเห็นทั้งร้าน)', () => {
  const r = api('report_data', { reportId: 'R11' }, EMPS.supNoDept);
  truthy(r.ok, 'ok');
  eq(r.data.rows.length, 0, 'จำนวนรายชื่อที่เห็น');
  eq(r.data.dept, '', 'แผนก');
  truthy(String(r.data.warning || '').length > 0, 'ต้องมีคำเตือนบอกให้ไปแจ้ง HR');
});

check('พนักงานทั่วไปเปิดรายงานทีมไม่ได้', () => {
  const r = api('report_data', { reportId: 'R11' }, EMPS.staff2);
  eq(r.ok, false, 'ok');
  eq(r.code, 'FORBIDDEN', 'code');
});

check('HR เห็นทุกแผนก', () => {
  const r = api('report_data', { reportId: 'R11' }, EMPS.hr);
  truthy(r.ok, 'ok');
  eq(r.data.dept, 'ทุกแผนก', 'ขอบเขต');
  eq(r.data.rows.length, 6, 'จำนวนพนักงานที่ยัง active ทั้งร้าน');
  assertNoLeak(r, 'R11 (HR)');
});

check('R12 รายงานของตัวเอง — ไม่มี qIds/answers ติดไปด้วย', () => {
  const r = api('report_data', { reportId: 'R12' }, EMPS.staff2);
  truthy(r.ok, 'ok');
  eq(r.data.history.length, 1, 'ประวัติของ E002');
  assertNoFields(r, ATTEMPT_INTERNALS, 'R12');
  assertNoFields(r, ANSWER_KEY_FIELDS, 'R12');
  assertNoLeak(r, 'R12');
});

check('report_data id อื่นคืน null ให้ dispatcher เดิมทำงานต่อ', () => {
  eq(api('report_data', { reportId: 'R01' }, EMPS.hr), null, 'ผลลัพธ์');
  eq(api('ping', {}, EMPS.hr), null, 'ผลลัพธ์ของ action ที่ไม่ใช่ของไฟล์นี้');
});

/* ================================================================
 * ⑨ AuditLog — ต้องบันทึกครบ และต้องไม่มี lineUserId
 * ================================================================ */
check('★ AuditLog บันทึกด้วย empCode เท่านั้น ไม่มี lineUserId', () => {
  const rows = tab('AuditLog');
  truthy(rows.length > 0, 'ควรมีบันทึก');
  const s = JSON.stringify(rows);
  if (s.indexOf(LEAK) >= 0) throw new Error('lineUserId หลุดลง AuditLog');
  const acts = rows.map(r => String(r.action));
  ['QUIZ_START', 'QUIZ_SUBMIT', 'QUIZ_TEAM_VIEW'].forEach(a => {
    truthy(acts.indexOf(a) >= 0, 'ควรมีบันทึก ' + a);
  });
});

check('ล็อกถูกปล่อยคืนทุกครั้ง (ไม่ค้างจนคนถัดไปทำข้อสอบไม่ได้)', () => {
  eq(LOCK_DEPTH, 0, 'ความลึกของล็อกที่ค้างอยู่');
  truthy(LOCK_MAX > 0, 'quiz_answer ต้องเคยจับล็อกจริง');
});

/* ================================================================ */
console.log('');
results.forEach(([s, n, e]) => console.log(`  ${s} ${n}${e ? '\n      → ' + e : ''}`));
const bad = results.filter(r => r[0] === '✗').length;
console.log(bad ? `\n❌ ไม่ผ่าน ${bad} รายการ` : '\n✅ ผ่านทุกรายการ');
process.exit(bad ? 1 : 0);

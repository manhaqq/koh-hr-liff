/*******************************************************************
 * tests/migration.test.js
 * ทดสอบ "การแปลงคำสถานะ" และ "ฟังก์ชันติดตั้ง/ซ่อมหัวคอลัมน์"
 * -----------------------------------------------------------------
 * ★ ทำไมชุดนี้สำคัญกว่าชุดอื่น
 *   ฟังก์ชันในไฟล์นี้ "เขียนทับข้อมูลแรงงานจริง" ไม่ใช่แค่ error แล้วจบ
 *   ถ้าแปลงคำผิดสักคำเดียว ใบลาที่ถูกปฏิเสธจะกลายเป็นอนุมัติ หรือเรื่องที่
 *   ยังไม่มีใครตอบจะหายออกจากรายการงานค้างไปเงียบ ๆ ตลอดกาล
 *   ความเสียหายแบบนี้ไม่มี error ให้จับ และกู้คืนไม่ได้ถ้าไม่มีแท็บสำรอง
 *
 * ★ กติกาเหล็กของ mock ในไฟล์นี้ (เหมือน tests/mock.js)
 *   ใส่ได้เฉพาะเมธอดที่ "ยืนยันกับเอกสารของ Google แล้ว" และต้องมี URL กำกับ
 *   ห้ามเพิ่มเมธอดเพื่อให้เทสต์ผ่านเด็ดขาด — ถ้าโค้ดเรียกเมธอดที่หาในเอกสาร
 *   ไม่เจอ นั่นคือบั๊กที่เทสต์ชุดนี้มีไว้เพื่อจับ ไม่ใช่ช่องที่ต้องอุด
 *
 *   เอกสารอ้างอิงของทุกเมธอดที่ mock ไว้
 *     Sheet        https://developers.google.com/apps-script/reference/spreadsheet/sheet
 *     Range        https://developers.google.com/apps-script/reference/spreadsheet/range
 *     Spreadsheet  https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet
 *     SpreadsheetApp https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app
 *     Ui / Button / ButtonSet  https://developers.google.com/apps-script/reference/base/ui
 *     Cache        https://developers.google.com/apps-script/reference/cache/cache
 *     Utilities    https://developers.google.com/apps-script/reference/utilities/utilities
 *******************************************************************/
const fs = require('fs'), vm = require('vm'), path = require('path');
const GAS = path.join(__dirname, '..', 'apps-script');

/* =================================================================
 *  0) ผลการทดสอบ
 * ================================================================= */
const results = [];
const notes   = [];
function check(name, fn) {
  try { fn(); results.push(['✓', name, '']); }
  catch (e) { results.push(['✗', name, e.message]); }
}
/** ข้อสังเกตที่ยังไม่ฟันธงว่าเป็นบั๊ก — รายงานให้เห็น แต่ไม่ทำให้ชุดเทสต์แดง */
function note(msg) { notes.push(msg); }
function eq(got, want, what) {
  if (got !== want) throw new Error(what + ' — ได้ ' + JSON.stringify(got) + ' ควรเป็น ' + JSON.stringify(want));
}
function ok(cond, what) { if (!cond) throw new Error(what); }

/* =================================================================
 *  1) Mock ของ Spreadsheet ที่มี "กริดจริง"
 * -----------------------------------------------------------------
 *  ต่างจาก tests/mock.js ตรงที่ชุดนี้ต้องอ่าน/เขียนเซลล์จริง ๆ เพื่อพิสูจน์ว่า
 *  แถวที่ถูกเขียนคือแถวที่ตั้งใจ และหัวคอลัมน์เดิมไม่เคยถูกทับ
 * ================================================================= */
const DEFAULT_MAX_ROWS = 1000;
const DEFAULT_MAX_COLS = 26;

function newWorld() {
  const world = { events: [], writes: [], ui: [], logs: [] };

  const at = () => world.events.length;

  class MockRange {
    constructor(sheet, row, col, nRows, nCols) {
      /* Apps Script โยน error ทันทีถ้าพิกัดหลุดขอบชีต — จำลองไว้เพราะบั๊ก
         off-by-one ของการ "ต่อท้ายคอลัมน์" จะโผล่ตรงนี้เป็นที่แรก */
      if (row < 1 || col < 1 || nRows < 1 || nCols < 1)
        throw new Error('The coordinates or dimensions of the range are invalid.');
      if (row + nRows - 1 > sheet._maxRows || col + nCols - 1 > sheet._maxCols)
        throw new Error('The coordinates or dimensions of the range are invalid.');
      this._sh = sheet; this._r = row; this._c = col; this._nr = nRows; this._nc = nCols;
    }
    /* https://developers.google.com/apps-script/reference/spreadsheet/range#getvalues */
    getValues() {
      const out = [];
      for (let i = 0; i < this._nr; i++) {
        const row = [];
        for (let j = 0; j < this._nc; j++) row.push(this._sh._get(this._r + i, this._c + j));
        out.push(row);
      }
      return out;
    }
    /* https://developers.google.com/apps-script/reference/spreadsheet/range#getdisplayvalues */
    getDisplayValues() {
      return this.getValues().map(r => r.map(v => (v === '' || v === null || v === undefined) ? '' : String(v)));
    }
    /* https://developers.google.com/apps-script/reference/spreadsheet/range#setvaluevalue */
    setValue(v) {
      for (let i = 0; i < this._nr; i++)
        for (let j = 0; j < this._nc; j++) this._sh._set(this._r + i, this._c + j, v);
      return this;
    }
    /* https://developers.google.com/apps-script/reference/spreadsheet/range#setvaluesvalues */
    setValues(values) {
      if (!Array.isArray(values) || values.length !== this._nr)
        throw new Error('The number of rows in the data does not match the number of rows in the range.');
      for (let i = 0; i < this._nr; i++) {
        if (!Array.isArray(values[i]) || values[i].length !== this._nc)
          throw new Error('The number of columns in the data does not match the number of columns in the range.');
      }
      for (let i = 0; i < this._nr; i++)
        for (let j = 0; j < this._nc; j++) this._sh._set(this._r + i, this._c + j, values[i][j]);
      return this;
    }
    /* จัดรูปแบบ — ทุกตัวคืน Range เพื่อต่อ chain ได้ ตามเอกสาร
       #setbackgroundcolor · #setfontcolorcolor · #setfontweightfontweight
       #setverticalalignmentalignment · #breakapart */
    setBackground()        { return this; }
    setFontColor()         { return this; }
    setFontWeight()        { return this; }
    setVerticalAlignment() { return this; }
    breakApart()           { return this; }
  }

  class MockSheet {
    constructor(name, parent, rows) {
      this._name = name; this._parent = parent;
      this._cells = {};                       // "r,c" -> value
      this._maxRows = DEFAULT_MAX_ROWS;
      this._maxCols = DEFAULT_MAX_COLS;
      (rows || []).forEach((row, i) => row.forEach((v, j) => {
        if (v !== '' && v !== null && v !== undefined) this._cells[(i + 1) + ',' + (j + 1)] = v;
      }));
      if (rows) this._maxCols = Math.max(this._maxCols, ...rows.map(r => r.length), 1);
    }
    _get(r, c) { const v = this._cells[r + ',' + c]; return v === undefined ? '' : v; }
    _set(r, c, v) {
      const before = this._get(r, c);
      const after  = (v === null || v === undefined) ? '' : v;
      if (after === '' ) delete this._cells[r + ',' + c]; else this._cells[r + ',' + c] = after;
      world.writes.push({ sheet: this._name, row: r, col: c, before: before, after: after, at: at() });
      world.events.push('write:' + this._name + '!r' + r + 'c' + c);
    }
    /* https://developers.google.com/apps-script/reference/spreadsheet/sheet#getname */
    getName() { return this._name; }
    /* #setnamename */
    setName(n) { this._name = n; return this; }
    /* #getlastrow / #getlastcolumn */
    getLastRow() {
      let m = 0;
      for (const k in this._cells) m = Math.max(m, Number(k.split(',')[0]));
      return m;
    }
    getLastColumn() {
      let m = 0;
      for (const k in this._cells) m = Math.max(m, Number(k.split(',')[1]));
      return m;
    }
    /* #getmaxrows / #getmaxcolumns */
    getMaxRows()    { return this._maxRows; }
    getMaxColumns() { return this._maxCols; }
    /* #getrangerow-column-numrows-numcolumns */
    getRange(a, b, c, d) {
      if (typeof a === 'string') throw new Error('mock: ยังไม่รองรับ getRange(a1Notation) — เพิ่มเมื่อมีโค้ดจริงใช้');
      return new MockRange(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    }
    /* #appendrowrowcontents */
    appendRow(rowContents) {
      if (rowContents.length > this._maxCols)
        throw new Error('The number of columns in the data does not match the number of columns in the range.');
      const r = this.getLastRow() + 1;
      rowContents.forEach((v, j) => this._set(r, j + 1, v));
      return this;
    }
    /* #deleterowsrowposition-howmany */
    deleteRows(rowPosition, howMany) {
      const n = howMany === undefined ? 1 : howMany;
      const next = {};
      for (const k in this._cells) {
        const [r, c] = k.split(',').map(Number);
        if (r >= rowPosition && r < rowPosition + n) continue;
        next[(r > rowPosition ? r - n : r) + ',' + c] = this._cells[k];
      }
      this._cells = next;
      world.events.push('deleteRows:' + this._name);
      return this;
    }
    /* #setfrozenrowsrows · #setrowheightrowposition-height */
    setFrozenRows() { return this; }
    setRowHeight()  { return this; }
    /* #copytospreadsheet — สำเนาไปต่อท้ายเป็นแท็บสุดท้ายเสมอ */
    copyTo(dest) {
      if (this._copyThrows) throw new Error('mock: จำลองว่าก๊อบปี้แท็บไม่สำเร็จ');
      if (!(dest instanceof MockSpreadsheet)) throw new TypeError('copyTo ต้องรับ Spreadsheet');
      const c = new MockSheet('Copy of ' + this._name, dest);
      c._cells = Object.assign({}, this._cells);
      c._maxCols = this._maxCols; c._maxRows = this._maxRows;
      dest._sheets.push(c);
      world.events.push('copyTo:' + this._name);
      return c;
    }
  }

  class MockSpreadsheet {
    constructor(id, tabs) {
      this._id = id; this._sheets = [];
      Object.keys(tabs || {}).forEach(n => this._sheets.push(new MockSheet(n, this, tabs[n])));
    }
    getId()   { return this._id; }
    getName() { return 'ss-' + this._id; }
    /* #getsheets · #getsheetbynamename · #insertsheetsheetname */
    getSheets() { return this._sheets.slice(); }
    getSheetByName(n) { return this._sheets.filter(s => s._name === n)[0] || null; }
    insertSheet(n) { const s = new MockSheet(n, this); this._sheets.push(s); return s; }
  }

  world.MockSheet = MockSheet;
  world.MockSpreadsheet = MockSpreadsheet;
  return world;
}

/* =================================================================
 *  2) บริการอื่น ๆ ของ Apps Script
 * ================================================================= */
function makeServices(world, dataSs, activeSs, answers) {
  const store = {};                                  /* Cache */
  const props = { SPREADSHEET_ID: dataSs.getId() };

  /* https://developers.google.com/apps-script/reference/cache/cache */
  const cache = {
    get: k => (store[k] === undefined ? null : store[k]),
    put: (k, v) => { store[k] = String(v); },
    putAll: (o) => { Object.keys(o).forEach(k => { store[k] = String(o[k]); }); },
    getAll: (keys) => { const o = {}; keys.forEach(k => { if (store[k] !== undefined) o[k] = store[k]; }); return o; },
    remove: k => { delete store[k]; },
    removeAll: keys => keys.forEach(k => { delete store[k]; })
  };

  /* https://developers.google.com/apps-script/reference/base/ui#alerttitle-prompt-buttons */
  const Ui = {
    Button:    { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO' },
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO', YES_NO_CANCEL: 'YES_NO_CANCEL' },
    alert(title, prompt, buttons) {
      world.ui.push({ title: title, msg: prompt, buttons: buttons, at: world.events.length });
      world.events.push('ui:' + buttons + ':' + title);
      if (buttons === 'YES_NO') return answers.length ? answers.shift() : 'NO';
      return 'OK';
    }
  };

  const pad = n => String(n).padStart(2, '0');
  return {
    SpreadsheetApp: {
      /* #openbyidid · #getactivespreadsheet · #getui */
      openById(id) {
        if (id === dataSs.getId()) return dataSs;
        if (activeSs && id === activeSs.getId()) return activeSs;
        throw new Error('openById: ไม่พบสเปรดชีต ' + id);
      },
      getActiveSpreadsheet() { return activeSs; },
      getUi() { return Ui; }
    },
    /* https://developers.google.com/apps-script/reference/properties/properties-service */
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (props[k] === undefined ? null : props[k]),
      setProperty: (k, v) => { props[k] = String(v); }
    }) },
    CacheService: { getScriptCache: () => cache },
    /* https://developers.google.com/apps-script/reference/base/session#getactiveuser */
    Session: { getActiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    /* https://developers.google.com/apps-script/reference/utilities/utilities#formatdatedate-timezone-format */
    Utilities: { formatDate: (d, tz, fmt) => String(fmt)
      .replace(/yyyy/g, d.getFullYear())
      .replace(/MM/g, pad(d.getMonth() + 1))
      .replace(/dd/g, pad(d.getDate()))
      .replace(/HH/g, pad(d.getHours()))
      .replace(/mm/g, pad(d.getMinutes()))
      .replace(/ss/g, pad(d.getSeconds())) },
    /* https://developers.google.com/apps-script/reference/base/logger#logdata */
    Logger: { log: m => world.logs.push(String(m)) },
    _ui: Ui
  };
}

const GAS_FILES = ['00_Config.js', '02_Data.js', '07_Admin.js', '12_AdminApi.js', '13_Forms.js', '14_Media.js'];

/** สร้าง context ใหม่พร้อมโหลดไฟล์จริงจากโปรเจ็ค (ไม่แก้อะไรในไฟล์เลย) */
function loadCtx(opts) {
  opts = opts || {};
  const world  = newWorld();
  const dataSs = new world.MockSpreadsheet('DATA_SS', opts.tabs || {});
  const active = opts.activeTabs === undefined ? dataSs
               : new world.MockSpreadsheet('ACTIVE_SS', opts.activeTabs);
  const svc = makeServices(world, dataSs, active, (opts.answers || []).slice());

  const sandbox = Object.assign({
    console: { log(){}, warn(){}, error(){} },
    JSON, Math, Date, String, Number, Boolean, Object, Array, Error, TypeError, RegExp,
    isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
  }, svc);

  const ctx = vm.createContext(sandbox);
  const files = opts.files || GAS_FILES;
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), ctx, { filename: f });
  }
  ctx.__world = world; ctx.__ss = dataSs; ctx.__active = active;
  return ctx;
}
function run(ctx, code) { return vm.runInContext(code, ctx); }

/* =================================================================
 *  ส่วนที่ 1 — normalizeTicketStatus / isTicketOpen  (00_Config.js)
 * ================================================================= */
console.log('═══ ① คำสถานะ "เรื่องถึง HR" — 00_Config.js ═══\n');

const cfgCtx = loadCtx({ files: ['00_Config.js'] });
const TS = run(cfgCtx, 'TICKET_STATUS');
const LS = run(cfgCtx, 'LEAVE_STATUS');
const nT = v => { cfgCtx.__v = v; return run(cfgCtx, 'normalizeTicketStatus(__v)'); };
const oT = v => { cfgCtx.__v = v; return run(cfgCtx, 'isTicketOpen(__v)'); };
const nL = v => { cfgCtx.__v = v; return run(cfgCtx, 'normalizeLeaveStatus(__v)'); };
const pL = v => { cfgCtx.__v = v; return run(cfgCtx, 'isLeavePending(__v)'); };

/* [ค่าที่เจอจริงในชีต, ผลที่ต้องได้, ยังค้างอยู่ไหม] */
const TICKET_CASES = [
  ['ใหม่',            TS.NEW,      true ],
  ['ตอบแล้ว',         TS.ANSWERED, false],
  ['เสร็จสิ้น',        TS.CLOSED,   false],
  ['closed',          TS.CLOSED,   false],
  ['CLOSED',          TS.CLOSED,   false],
  ['ปิดแล้ว',          TS.CLOSED,   false],
  ['กำลังดำเนินการ',   TS.WIP,      true ],
  ['approved',        '',          true ],   /* คำของใบลา ไม่ใช่ของเรื่อง → ไม่รู้จัก */
  ['รออนุมัติ',        '',          true ],
  ['ไม่อนุมัติ',       '',          true ],
  ['',                TS.NEW,      true ],
  ['  ',              TS.NEW,      true ],
  [null,              TS.NEW,      true ],
  [undefined,         TS.NEW,      true ],
  [0,                 '',          true ],
  [42,                '',          true ],
  ['มะรืนค่อยว่ากัน',  '',          true ]    /* คำที่ไม่มีใครรู้จัก */
];

check('normalizeTicketStatus ครบทุกค่าที่เจอจริงในชีต', () => {
  TICKET_CASES.forEach(c => eq(nT(c[0]), c[1], 'normalizeTicketStatus(' + JSON.stringify(c[0]) + ')'));
});

check('isTicketOpen ครบทุกค่า — คำที่ไม่รู้จักต้องยัง "ค้าง" เสมอ', () => {
  TICKET_CASES.forEach(c => eq(oT(c[0]), c[2], 'isTicketOpen(' + JSON.stringify(c[0]) + ')'));
});

check('★ กับดัก 1: "ยังไม่ตอบ" ต้องไม่กลายเป็น "ตอบแล้ว"', () => {
  eq(nT('ยังไม่ตอบ'), TS.WIP, 'normalizeTicketStatus("ยังไม่ตอบ")');
  eq(oT('ยังไม่ตอบ'), true,   'isTicketOpen("ยังไม่ตอบ") — ถ้าเป็น false เรื่องที่ไม่มีใครตอบจะหายจากงานค้าง');
  eq(nT('ไม่ได้ตอบ'), TS.WIP, 'normalizeTicketStatus("ไม่ได้ตอบ")');
  eq(nT('ยังไม่ปิด'), TS.WIP, 'normalizeTicketStatus("ยังไม่ปิด")');
  eq(oT('ยังไม่ปิด'), true,   'isTicketOpen("ยังไม่ปิด")');
});

check('"ตอบแล้วปิดเรื่อง" ต้องนับเป็นปิด ไม่ใช่แค่ตอบแล้ว', () => {
  eq(nT('ตอบแล้วปิดเรื่อง'), TS.CLOSED, 'normalizeTicketStatus("ตอบแล้วปิดเรื่อง")');
});

/* ── ข้อสังเกต: คำที่ขึ้นต้นด้วย "รอ" ยังหลุดตัวดักคำปฏิเสธ ─────────────
   ตัวดักตอนนี้จับเฉพาะ "ยังไม่" กับ "ไม่ได้" คำว่า "รอตอบ" จึงตกไปเข้า
   เงื่อนไข indexOf('ตอบ') และกลายเป็น "ตอบแล้ว" ส่วน "รอปิด" กลายเป็น
   "เสร็จสิ้น" ทั้งสองคำแปลว่ายังไม่เสร็จ แต่ระบบจะถือว่าเสร็จแล้ว
   อันตรายกว่าคำที่ "ไม่รู้จัก" เพราะ migrateStatusVocabulary จะเขียนทับให้ด้วย */
if (nT('รอตอบ') === TS.ANSWERED)
  note('normalizeTicketStatus("รอตอบ") = "' + TS.ANSWERED + '" → isTicketOpen = false ' +
       '(เรื่องที่ยังรอตอบจะหายจากงานค้าง และถูก migrate เขียนทับเป็น "ตอบแล้ว")');
if (nT('รอปิดเรื่อง') === TS.CLOSED)
  note('normalizeTicketStatus("รอปิดเรื่อง") = "' + TS.CLOSED + '" → ถือว่าปิดแล้วทั้งที่ยังไม่ปิด');

/* =================================================================
 *  ส่วนที่ 2 — normalizeLeaveStatus / isLeavePending
 * ================================================================= */
console.log('═══ ② คำสถานะ "ใบลา" — 00_Config.js ═══\n');

const LEAVE_CASES = [
  ['รออนุมัติ',   LS.PENDING,  true ],
  ['อนุมัติ',     LS.APPROVED, false],
  ['ไม่อนุมัติ',  LS.REJECTED, false],
  ['ปฏิเสธ',     LS.REJECTED, false],
  ['approved',   LS.APPROVED, false],
  ['APPROVED',   LS.APPROVED, false],
  ['rejected',   LS.REJECTED, false],
  ['pending',    LS.PENDING,  true ],
  ['',           LS.PENDING,  true ],
  ['  ',         LS.PENDING,  true ],
  [null,         LS.PENDING,  true ],
  [undefined,    LS.PENDING,  true ],
  [0,            '',          true ],
  ['ใหม่',        '',          true ],
  ['ตอบแล้ว',     '',          true ],
  ['เสร็จสิ้น',    '',          true ],
  ['closed',     '',          true ],
  ['ปิดแล้ว',     '',          true ],
  ['ยกเลิก',      '',          true ]
];

check('normalizeLeaveStatus ครบทุกค่าที่เจอจริงในชีต', () => {
  LEAVE_CASES.forEach(c => eq(nL(c[0]), c[1], 'normalizeLeaveStatus(' + JSON.stringify(c[0]) + ')'));
});

check('★ กับดัก 2: "ไม่อนุมัติ" ต้องไม่กลายเป็น "อนุมัติ"', () => {
  eq(nL('ไม่อนุมัติ'),      LS.REJECTED, 'normalizeLeaveStatus("ไม่อนุมัติ")');
  eq(nL('ไม่อนุมัติครับ'),  LS.REJECTED, 'normalizeLeaveStatus("ไม่อนุมัติครับ")');
  eq(pL('ไม่อนุมัติ'),      false,       'isLeavePending("ไม่อนุมัติ")');
  eq(nL('รออนุมัติ'),       LS.PENDING,  'normalizeLeaveStatus("รออนุมัติ") — "รอ" ต้องมาก่อน "อนุมัติ"');
});

check('isLeavePending — ใบลาที่ระบบอ่านคำไม่ออกต้องยัง "ค้าง" ให้ HR เห็น', () => {
  LEAVE_CASES.forEach(c => eq(pL(c[0]), c[2], 'isLeavePending(' + JSON.stringify(c[0]) + ')'));
});

/* =================================================================
 *  ส่วนที่ 3 — migrateStatusVocabulary  (07_Admin.js)
 * ================================================================= */
console.log('═══ ③ migrateStatusVocabulary — 07_Admin.js ═══\n');

const TICKET_HEAD = ['ticketId','createdAt','empCode','name','branch','lineUserId','category','categoryId',
                     'privacy','subject','detail','attachment','priority','status','assignee','slaDue','reply','closedAt'];
const LEAVE_HEAD  = ['leaveId','createdAt','empCode','name','branch','type','dateFrom','dateTo','days','reason',
                     'status','approver','decidedAt','remark'];
const AUDIT_HEAD  = ['timestamp','actor','action','target','detail'];
const SENTINEL_UID = 'Uffffffffffffffffffffffffffffffff';   /* ห้ามหลุดออกไปไหนเด็ดขาด */

function ticketRow(id, status) {
  const r = new Array(TICKET_HEAD.length).fill('');
  r[0] = id; r[1] = '2026-08-01 09:00:00'; r[2] = 'E001'; r[5] = SENTINEL_UID;
  r[9] = 'เรื่องทดสอบ'; r[13] = status;
  return r;
}
function leaveRow(id, status) {
  const r = new Array(LEAVE_HEAD.length).fill('');
  r[0] = id; r[1] = '2026-08-01 09:00:00'; r[2] = 'E001'; r[10] = status;
  return r;
}

/* ★ แท็บ Tickets จงใจมี "แถวคำอธิบายแบบผสานเซลล์" อยู่บนสุด
   หัวคอลัมน์จริงจึงอยู่แถวที่ 2 — ถ้า migrate ยึดแถว 1 เป็นหัว จะเขียนผิดแถวทั้งหมด */
function migrateTabs() {
  return {
    Tickets: [
      ['⚠️ แท็บนี้ระบบเขียนเอง ห้ามลบคอลัมน์'],           /* แถว 1: ช่องเดียว */
      TICKET_HEAD,                                        /* แถว 2: หัวจริง */
      ticketRow('T-01', 'ใหม่'),                          /* แถว 3  ตรงแล้ว */
      ticketRow('T-02', 'closed'),                        /* แถว 4  → เสร็จสิ้น */
      ticketRow('T-03', 'ยังไม่ตอบ'),                      /* แถว 5  → กำลังดำเนินการ ★ */
      ticketRow('T-04', 'ปิดแล้ว'),                        /* แถว 6  → เสร็จสิ้น */
      ticketRow('T-05', 'ตอบแล้ว'),                        /* แถว 7  ตรงแล้ว */
      ticketRow('T-06', 'ค้างอยู่'),                        /* แถว 8  ไม่รู้จัก — ห้ามแตะ */
      ticketRow('T-07', '')                               /* แถว 9  → ใหม่ */
    ],
    Leave: [
      LEAVE_HEAD,                                         /* แถว 1: หัวจริง */
      leaveRow('L-01', 'รออนุมัติ'),                       /* แถว 2  ตรงแล้ว */
      leaveRow('L-02', 'approved'),                       /* แถว 3  → อนุมัติ */
      leaveRow('L-03', 'ไม่อนุมัติ'),                      /* แถว 4  ตรงแล้ว ★ ห้ามกลายเป็นอนุมัติ */
      leaveRow('L-04', 'ยกเลิก')                          /* แถว 5  ไม่รู้จัก — ห้ามแตะ */
    ],
    AuditLog: [AUDIT_HEAD]
  };
}

const statusOf = (ctx, tab, row) => {
  const sh  = ctx.__ss.getSheetByName(tab);
  const col = tab === 'Tickets' ? TICKET_HEAD.indexOf('status') + 1 : LEAVE_HEAD.indexOf('status') + 1;
  return sh._get(row, col);
};
const dataWrites = w => w.writes.filter(x => x.sheet === 'Tickets' || x.sheet === 'Leave');

/* ── 3.1 ปฏิเสธ → ต้องไม่เขียนอะไรเลยสักแถว ───────────────────────── */
check('ถามก่อนเขียนเสมอ และเมื่อกด "ไม่" ต้องไม่แตะชีตเลยสักเซลล์', () => {
  const ctx = loadCtx({ tabs: migrateTabs(), answers: ['NO'] });
  run(ctx, 'migrateStatusVocabulary()');
  const w = ctx.__world;

  const confirm = w.ui.filter(u => u.buttons === 'YES_NO');
  eq(confirm.length, 1, 'ต้องถามยืนยัน 1 ครั้ง');
  ok(/จะแก้ทั้งหมด 5 แถว/.test(confirm[0].msg), 'ต้องบอกยอดรวมที่จะแก้ (5 แถว)\n      ได้: ' + confirm[0].msg);
  ok(/Tickets\s*:\s*4 \/ 7 แถว/.test(confirm[0].msg), 'Tickets ต้องเป็น 4/7 (แถวที่ตรงมาตรฐานแล้วห้ามนับ)');
  ok(/Leave\s*:\s*1 \/ 4 แถว/.test(confirm[0].msg),   'Leave ต้องเป็น 1/4');
  ok(confirm[0].msg.indexOf('ค้างอยู่') >= 0 && confirm[0].msg.indexOf('ยกเลิก') >= 0,
     'ต้องยกคำที่ไม่รู้จักมาโชว์ทั้งสองแท็บ');
  ok(confirm[0].msg.indexOf('L-03') < 0, 'L-03 ("ไม่อนุมัติ") ตรงมาตรฐานแล้ว ต้องไม่โผล่ในรายการที่จะแก้');

  eq(dataWrites(w).length, 0, 'กด "ไม่" แล้วต้องไม่มีการเขียนลง Tickets/Leave');
  eq(w.events.filter(e => e.indexOf('copyTo:') === 0).length, 0, 'กด "ไม่" แล้วต้องไม่สร้างแท็บสำรองทิ้งไว้');
  ok(w.ui.some(u => /ยกเลิก/.test(u.title)), 'ต้องบอกผู้ใช้ว่ายกเลิกแล้ว');
});

/* ── 3.2 ยืนยัน → สำรองก่อน แล้วค่อยเขียน ────────────────────────── */
check('สำรองแท็บก่อนแตะข้อมูล และแก้เฉพาะแถวที่ต้องแก้จริง', () => {
  const ctx = loadCtx({ tabs: migrateTabs(), answers: ['YES'] });
  run(ctx, 'migrateStatusVocabulary()');
  const w = ctx.__world;

  const copies = w.events.map((e, i) => [e, i]).filter(x => x[0].indexOf('copyTo:') === 0);
  eq(copies.length, 2, 'ต้องก๊อบปี้ทั้ง Tickets และ Leave');
  const firstWrite = dataWrites(w)[0];
  ok(firstWrite, 'ต้องมีการเขียนจริง');
  ok(copies[copies.length - 1][1] < firstWrite.at,
     '★ ต้องก๊อบปี้สำรองให้เสร็จ "ก่อน" เขียนทับข้อมูลแถวแรก');

  const backups = ctx.__ss.getSheets().map(s => s.getName()).filter(n => n.indexOf('สำรอง-') === 0);
  eq(backups.length, 2, 'ต้องได้แท็บสำรอง 2 แท็บ');
  ok(backups.every(n => /^สำรอง-(Tickets|Leave)-\d{8}-\d{6}$/.test(n)),
     'ชื่อแท็บสำรองต้องลงวันที่-เวลา ได้: ' + JSON.stringify(backups));

  /* ผลลัพธ์รายแถว — พิสูจน์ว่าเขียนถูก "แถวจริง" ทั้งที่หัวคอลัมน์อยู่แถว 2 */
  eq(statusOf(ctx, 'Tickets', 3), 'ใหม่',            'T-01 ตรงอยู่แล้ว ห้ามเปลี่ยน');
  eq(statusOf(ctx, 'Tickets', 4), TS.CLOSED,        'T-02 closed → เสร็จสิ้น');
  eq(statusOf(ctx, 'Tickets', 5), TS.WIP,           '★ T-03 "ยังไม่ตอบ" ต้องเป็น กำลังดำเนินการ ไม่ใช่ ตอบแล้ว');
  eq(statusOf(ctx, 'Tickets', 6), TS.CLOSED,        'T-04 ปิดแล้ว → เสร็จสิ้น');
  eq(statusOf(ctx, 'Tickets', 7), 'ตอบแล้ว',         'T-05 ตรงอยู่แล้ว ห้ามเปลี่ยน');
  eq(statusOf(ctx, 'Tickets', 8), 'ค้างอยู่',          '★ T-06 คำที่ไม่รู้จัก ห้ามเดาแทน HR');
  eq(statusOf(ctx, 'Tickets', 9), TS.NEW,           'T-07 ช่องว่าง → ใหม่');
  eq(statusOf(ctx, 'Leave', 2),   'รออนุมัติ',        'L-01 ตรงอยู่แล้ว');
  eq(statusOf(ctx, 'Leave', 3),   LS.APPROVED,      'L-02 approved → อนุมัติ');
  eq(statusOf(ctx, 'Leave', 4),   'ไม่อนุมัติ',       '★ L-03 ใบที่ถูกปฏิเสธ ห้ามกลายเป็นอนุมัติเด็ดขาด');
  eq(statusOf(ctx, 'Leave', 5),   'ยกเลิก',           'L-04 คำที่ไม่รู้จัก ห้ามแตะ');

  /* แถวที่ตรงอยู่แล้วต้องไม่ถูก "เขียนซ้ำ" ด้วย ไม่ใช่แค่ค่าเท่าเดิม */
  const touched = dataWrites(w).map(x => x.sheet + '!' + x.row).sort();
  eq(JSON.stringify(touched),
     JSON.stringify(['Leave!3', 'Tickets!4', 'Tickets!5', 'Tickets!6', 'Tickets!9']),
     'ต้องเขียนเฉพาะ 5 แถวที่วางแผนไว้เท่านั้น');

  const done = w.ui[w.ui.length - 1];
  ok(/Tickets\s*:\s*แก้ 4 แถว/.test(done.msg), 'สรุปผล Tickets ต้องเป็น 4 แถว');
  ok(/Leave\s*:\s*แก้ 1 แถว/.test(done.msg),   'สรุปผล Leave ต้องเป็น 1 แถว');

  const audit = ctx.__ss.getSheetByName('AuditLog');
  ok(audit.getLastRow() >= 2, 'ต้องบันทึกลง AuditLog');
});

/* ── 3.3 ห้าม lineUserId หลุดออกไปทางข้อความใด ๆ ─────────────────── */
check('ไม่มี lineUserId หลุดลงกล่องข้อความหรือ AuditLog', () => {
  const ctx = loadCtx({ tabs: migrateTabs(), answers: ['YES'] });
  run(ctx, 'migrateStatusVocabulary()');
  const w = ctx.__world;
  w.ui.forEach(u => {
    ok(String(u.title).indexOf(SENTINEL_UID) < 0 && String(u.msg).indexOf(SENTINEL_UID) < 0,
       'lineUserId หลุดในกล่องข้อความ "' + u.title + '"');
  });
  const audit = ctx.__ss.getSheetByName('AuditLog');
  for (let r = 2; r <= audit.getLastRow(); r++)
    for (let c = 1; c <= AUDIT_HEAD.length; c++)
      ok(String(audit._get(r, c)).indexOf(SENTINEL_UID) < 0, 'lineUserId หลุดลง AuditLog');
});

/* ── 3.4 รันซ้ำต้องไม่เสียหาย ────────────────────────────────────── */
check('รันซ้ำครั้งที่สองต้องไม่เปลี่ยนข้อมูลอีก', () => {
  const ctx = loadCtx({ tabs: migrateTabs(), answers: ['YES', 'YES'] });
  run(ctx, 'migrateStatusVocabulary()');
  const after1 = ['Tickets', 'Leave'].map(t =>
    (t === 'Tickets' ? [3,4,5,6,7,8,9] : [2,3,4,5]).map(r => statusOf(ctx, t, r)).join('|')).join('||');
  const n1 = dataWrites(ctx.__world).length;

  run(ctx, 'migrateStatusVocabulary()');
  const after2 = ['Tickets', 'Leave'].map(t =>
    (t === 'Tickets' ? [3,4,5,6,7,8,9] : [2,3,4,5]).map(r => statusOf(ctx, t, r)).join('|')).join('||');
  const n2 = dataWrites(ctx.__world).length;

  eq(after2, after1, 'ค่าในชีตต้องเหมือนเดิมทุกเซลล์หลังรันรอบสอง');
  eq(n2, n1, 'รอบสองต้องไม่เขียนลง Tickets/Leave เพิ่มอีกเลย');

  const backups = ctx.__ss.getSheets().map(s => s.getName()).filter(n => n.indexOf('สำรอง-') === 0);
  if (backups.length > 2)
    note('รันซ้ำแล้วยังสร้างแท็บสำรองเพิ่มอีก ' + (backups.length - 2) + ' แท็บ ' +
         'ทั้งที่ไม่มีแถวไหนถูกแก้ (ยอด "จะแก้ทั้งหมด 0 แถว" ก็ยังเด้งถามยืนยัน) — ชีตจะรกขึ้นทุกครั้งที่กด');
});

/* ── 3.5 สำรองไม่สำเร็จ = ต้องล้มทั้งงาน ────────────────────────── */
check('ก๊อบปี้แท็บสำรองไม่สำเร็จ → ต้องหยุดทั้งงาน ห้ามเขียนสักแถว', () => {
  const ctx = loadCtx({ tabs: migrateTabs(), answers: ['YES'] });
  ctx.__ss.getSheetByName('Leave')._copyThrows = true;      /* Tickets สำรองผ่าน แต่ Leave พัง */
  let threw = false;
  try { run(ctx, 'migrateStatusVocabulary()'); } catch (e) { threw = true; }
  ok(threw, 'ต้องโยน error ออกมา ไม่ใช่ทำต่อเงียบ ๆ');
  eq(dataWrites(ctx.__world).length, 0, '★ ห้ามมีการเขียนลง Tickets/Leave แม้แต่แถวเดียว');
});

check('★ ชีตข้อมูลไม่ใช่ไฟล์ที่สคริปต์ผูกอยู่ → สำเนาต้องลงไฟล์ฐานข้อมูล ไม่ใช่ไฟล์ที่ผูกอยู่', () => {
  /* SPREADSHEET_ID ชี้ไปอีกไฟล์หนึ่ง (สคริปต์ผูกกับไฟล์เปล่า) ซึ่งเกิดได้จริง
     ถ้าเจ้าของก๊อบปี้ชีตใหม่แล้วเปลี่ยนแค่ค่า SPREADSHEET_ID */
  const ctx = loadCtx({ tabs: migrateTabs(), activeTabs: { Sheet1: [['']] }, answers: ['YES'] });
  let threw = false;
  try { run(ctx, 'migrateStatusVocabulary()'); } catch (e) { threw = true; }
  const wrote = dataWrites(ctx.__world).length;
  const backups = ctx.__ss.getSheets().map(s => s.getName()).filter(n => n.indexOf('สำรอง-') === 0);
  /* พฤติกรรมที่ถูกต้อง: backupSheetCopy_ ต้องใช้ ss_() ซึ่งเปิดไฟล์ตาม SPREADSHEET_ID
     ไม่ใช่ getActiveSpreadsheet() ที่ชี้ไปไฟล์ที่สคริปต์ผูกอยู่
     สำเนาจึงต้องไปอยู่ใน "ไฟล์ฐานข้อมูล" ข้าง ๆ ต้นฉบับ ไม่ใช่ไฟล์เปล่าที่สคริปต์ผูกอยู่
     และเมื่อสำรองสำเร็จแล้ว การเขียนข้อมูลจึงจะถูกต้อง */
  ok(!threw, 'ไม่ควรพัง — ss_() หาแท็บในไฟล์ฐานข้อมูลเจอ ถึงสคริปต์จะผูกกับอีกไฟล์');
  eq(backups.length, 2, 'ต้องมีแท็บสำรองครบ 2 แท็บ "ในไฟล์ฐานข้อมูล" ก่อนเขียน');
  eq(ctx.__active.getSheets().map(s => s.getName()).filter(n => n.indexOf('สำรอง-') === 0).length, 0,
     '★ ห้ามสำรองลงไฟล์ที่สคริปต์ผูกอยู่ — สำเนาต้องอยู่ข้างต้นฉบับเสมอ');
  ok(wrote > 0, 'สำรองสำเร็จแล้วจึงเขียนข้อมูลได้');
});

/* =================================================================
 *  ส่วนที่ 4 — ฟังก์ชันติดตั้ง/เติมคอลัมน์ (ต่อท้ายอย่างเดียว)
 * ================================================================= */
console.log('═══ ④ ฟังก์ชันติดตั้งแท็บ — ต่อท้ายเท่านั้น ห้ามทับของเดิม ═══\n');

const APPGUIDE_HEAD = ['id','group','groupOrder','order','title','body','image','tip','status'];
const REPORTS_HEAD  = ['reportId','title','category','kind','audience','description','howto','sheetFn','status','updatedAt'];
const HANDBOOK_HEAD = ['id','category','order','title','body','fileUrl','tags','status','updatedAt'];
const SCHEDULE_HEAD = ['date','empCode','dept','shiftCode','startTime','endTime','breaks','ot','branch','note','status'];
const ANN_HEAD      = ['id','date','category','title','summary','body','imageUrl','fileUrl','linkUrl',
                       'audience','audienceValue','pinned','publishAt','expireAt','status','autoBroadcast',
                       'broadcastedAt','createdBy'];
const DESC = ['📌 แถวคำอธิบายแบบผสานเซลล์ ห้ามลบ'];      /* 1 ช่อง → ไม่ใช่หัวคอลัมน์ */

/** หัวคอลัมน์เดิมทุกช่องต้องเหมือนเดิมเป๊ะ และของใหม่ต้องอยู่ต่อท้ายเท่านั้น */
function assertHeaderAppendOnly(ctx, tab, headRow, before) {
  const sh = ctx.__ss.getSheetByName(tab);
  before.forEach((h, i) => {
    if (!h) return;
    eq(sh._get(headRow, i + 1), h, tab + ' หัวคอลัมน์ช่องที่ ' + (i + 1) + ' ถูกเขียนทับ');
  });
  ctx.__world.writes.filter(x => x.sheet === tab && x.row === headRow).forEach(x => {
    eq(x.before, '', tab + ' เขียนทับหัวคอลัมน์เดิมที่คอลัมน์ ' + x.col +
       ' ("' + x.before + '" → "' + x.after + '")');
  });
}

function formsTabs(extra) {
  return Object.assign({
    AppGuide:  [DESC, APPGUIDE_HEAD, ['G1','เริ่มต้น',1,1,'เข้าสู่ระบบ','...','','','on']],
    Handbook:  [HANDBOOK_HEAD, ['H1','ระเบียบ',1,'การลา','...','','ลา','on','2026-08-01']],
    Reports:   [DESC, REPORTS_HEAD, ['R09','สรุปเรื่องถึง HR','ทีม','DEPT','HEAD','...','','','on','2026-08-01']],
    AuditLog:  [AUDIT_HEAD]
  }, extra || {});
}

check('ensureFormsSheets: สร้างแท็บใหม่ได้ และเติม updatedAt ต่อท้าย AppGuide', () => {
  const ctx = loadCtx({ tabs: formsTabs() });
  run(ctx, 'ensureFormsSheets()');

  ['Forms', 'FormItems', 'FormResponses'].forEach(t =>
    ok(ctx.__ss.getSheetByName(t), 'ต้องสร้างแท็บ ' + t));

  /* AppGuide หัวจริงอยู่แถว 2 (แถว 1 เป็นคำอธิบาย) — updatedAt ต้องไปอยู่แถว 2 คอลัมน์ 10 */
  const ag = ctx.__ss.getSheetByName('AppGuide');
  eq(ag._get(2, APPGUIDE_HEAD.length + 1), 'updatedAt',
     '★ updatedAt ต้องต่อท้ายหัวคอลัมน์จริง (แถว 2) ไม่ใช่แถว 1');
  eq(ag._get(1, APPGUIDE_HEAD.length + 1), '', 'ห้ามเขียนอะไรลงแถวคำอธิบาย');
  assertHeaderAppendOnly(ctx, 'AppGuide', 2, APPGUIDE_HEAD);

  /* Reports หัวจริงอยู่แถว 2 เหมือนกัน — R11/R12 ต้องต่อท้ายเป็นแถวใหม่ */
  const rp = ctx.__ss.getSheetByName('Reports');
  const ids = [];
  for (let r = 3; r <= rp.getLastRow(); r++) ids.push(String(rp._get(r, 1)));
  ok(ids.indexOf('R11') >= 0 && ids.indexOf('R12') >= 0, 'ต้องเพิ่ม R11/R12 ได้: ' + JSON.stringify(ids));
  eq(String(rp._get(3, 1)), 'R09', 'แถวข้อมูลเดิมของ Reports ต้องอยู่ที่เดิม');
  assertHeaderAppendOnly(ctx, 'Reports', 2, REPORTS_HEAD);
});

check('ensureFormsSheets: แท็บเดิมที่มีคอลัมน์ไม่ครบ ต้องเติมต่อท้าย ไม่ทับของเดิม', () => {
  /* แท็บ Forms เก่าที่มีแค่ 4 คอลัมน์แรก และมีแถวคำอธิบายคั่นอยู่ข้างบน */
  const oldForms = ['formId', 'type', 'title', 'description'];
  const ctx = loadCtx({ tabs: formsTabs({
    Forms: [DESC, oldForms, ['F000', 'quiz', 'ของเดิม', 'อย่าหาย']]
  }) });
  run(ctx, 'ensureFormsSheets()');

  const sh = ctx.__ss.getSheetByName('Forms');
  assertHeaderAppendOnly(ctx, 'Forms', 2, oldForms);
  eq(sh._get(2, 5), 'audience', 'คอลัมน์ที่ขาดต้องเริ่มต่อท้ายที่ช่องที่ 5');
  eq(String(sh._get(3, 1)), 'F000', 'ข้อมูลเดิมต้องอยู่แถวเดิม');
  eq(String(sh._get(3, 3)), 'ของเดิม', 'ข้อมูลเดิมต้องไม่ถูกเลื่อน');
  const head = [];
  for (let c = 1; c <= sh.getLastColumn(); c++) head.push(String(sh._get(2, c)));
  const FORM_HEAD = run(ctx, 'FORM_HEAD_');
  FORM_HEAD.forEach(h => ok(head.indexOf(h) >= 0, 'ยังขาดคอลัมน์ ' + h));
});

check('ensureFormsSheets: รันซ้ำแล้วต้องไม่เขียนหัวคอลัมน์หรือข้อมูลซ้ำ', () => {
  const ctx = loadCtx({ tabs: formsTabs() });
  run(ctx, 'ensureFormsSheets()');
  const snap = ctx.__ss.getSheets().map(s => s.getName() + ':' + JSON.stringify(s._cells)).join('\n');
  const n1 = ctx.__world.writes.length;

  run(ctx, 'ensureFormsSheets()');
  const snap2 = ctx.__ss.getSheets().map(s => s.getName() + ':' + JSON.stringify(s._cells)).join('\n');
  eq(snap2, snap, 'รันรอบสองแล้วเนื้อหาในชีตต้องไม่เปลี่ยนแม้แต่เซลล์เดียว');
  eq(ctx.__world.writes.length, n1, 'รันรอบสองต้องไม่เขียนอะไรลงชีตอีกเลย');
});

check('ensureAdminSheets_: เติม manualBy/manualAt ต่อท้ายหัวคอลัมน์จริงของ Schedule', () => {
  const ctx = loadCtx({ tabs: {
    Schedule: [DESC, SCHEDULE_HEAD, ['2026-08-22','E001','ครัว','A','09:00','18:00','60','0','สาขา1','','auto']],
    AuditLog: [AUDIT_HEAD]
  } });
  run(ctx, 'ensureAdminSheets_()');

  const sh = ctx.__ss.getSheetByName('Schedule');
  eq(sh._get(2, SCHEDULE_HEAD.length + 1), 'manualBy', '★ manualBy ต้องอยู่แถว 2 (หัวจริง) ต่อท้ายคอลัมน์เดิม');
  eq(sh._get(2, SCHEDULE_HEAD.length + 2), 'manualAt', 'manualAt ต้องอยู่ถัดไป');
  eq(sh._get(1, SCHEDULE_HEAD.length + 1), '', 'ห้ามเขียนลงแถวคำอธิบาย');
  assertHeaderAppendOnly(ctx, 'Schedule', 2, SCHEDULE_HEAD);
  eq(String(sh._get(3, 1)), '2026-08-22', 'ข้อมูลกะเดิมต้องไม่ถูกแตะ');

  /* หัวคอลัมน์ที่ระบบเห็นต้องตรงกับที่เขียนไป มิฉะนั้นคอลัมน์ใหม่จะ "ตายเงียบ" */
  const idx = run(ctx, 'headerIndex_(SHEETS.SCHEDULE)');
  eq(idx.manualBy, SCHEDULE_HEAD.length + 1, 'headerIndex_ ต้องมองเห็น manualBy ทันทีหลังเติม');
  eq(idx._headRow, 2, 'headerIndex_ ต้องยังชี้แถวหัวจริงที่แถว 2');
});

check('ensureAdminSheets_: รันซ้ำต้องไม่เติมคอลัมน์เพิ่มอีก', () => {
  const ctx = loadCtx({ tabs: {
    Schedule: [DESC, SCHEDULE_HEAD, ['2026-08-22','E001','ครัว','A','09:00','18:00','60','0','สาขา1','','auto']],
    AuditLog: [AUDIT_HEAD]
  } });
  run(ctx, 'ensureAdminSheets_()');
  const snap = JSON.stringify(ctx.__ss.getSheetByName('Schedule')._cells);
  run(ctx, 'CacheService.getScriptCache().remove("adm_schema_ok")');   /* ข้ามด่านแคช 6 ชม. */
  run(ctx, 'ensureAdminSheets_()');
  eq(JSON.stringify(ctx.__ss.getSheetByName('Schedule')._cells), snap,
     'รันซ้ำ (แม้แคชหมดอายุ) ต้องไม่เปลี่ยนอะไรในชีต');
});

check('ensureAnnouncementImageColumn_: เติม imageFileId ต่อท้ายหัวคอลัมน์จริง', () => {
  const ctx = loadCtx({ tabs: {
    Announcements: [DESC, ANN_HEAD, ['A-01','2026-08-01','ทั่วไป','ประกาศ','','','','','','ALL','','','','','on','','','HR']],
    AuditLog: [AUDIT_HEAD]
  } });
  const col = run(ctx, 'ensureAnnouncementImageColumn_()');
  const sh = ctx.__ss.getSheetByName('Announcements');
  eq(col, ANN_HEAD.length + 1, 'ต้องคืนเลขคอลัมน์ที่ต่อท้าย');
  eq(sh._get(2, ANN_HEAD.length + 1), 'imageFileId', '★ ต้องอยู่แถว 2 (หัวจริง) ไม่ใช่แถว 1');
  eq(sh._get(1, ANN_HEAD.length + 1), '', 'ห้ามเขียนลงแถวคำอธิบาย');
  assertHeaderAppendOnly(ctx, 'Announcements', 2, ANN_HEAD);

  /* รันซ้ำ */
  const before = JSON.stringify(sh._cells);
  const col2 = run(ctx, 'ensureAnnouncementImageColumn_()');
  eq(col2, col, 'รันซ้ำต้องคืนคอลัมน์เดิม');
  eq(JSON.stringify(sh._cells), before, 'รันซ้ำต้องไม่เขียนอะไรเพิ่ม');

  /* คอลัมน์ใหม่ต้องใช้งานได้จริง ไม่ใช่เขียนไว้แล้วระบบมองไม่เห็น */
  run(ctx, 'updateRow(SHEETS.ANNOUNCEMENTS, 3, { imageFileId: "FILE_1" })');
  eq(sh._get(3, ANN_HEAD.length + 1), 'FILE_1', 'updateRow ต้องเขียนลงคอลัมน์ใหม่ได้');
  const rows = run(ctx, 'readTable(SHEETS.ANNOUNCEMENTS, true)');
  eq(rows[0].imageFileId, 'FILE_1', 'readTable ต้องอ่านคอลัมน์ใหม่กลับมาได้');
});

check('ensureAnnouncementImageColumn_: หัวคอลัมน์อยู่แถว 1 ตามปกติก็ต้องถูกต้อง', () => {
  const ctx = loadCtx({ tabs: {
    Announcements: [ANN_HEAD, ['A-01','2026-08-01','ทั่วไป','ประกาศ','','','','','','ALL','','','','','on','','','HR']],
    AuditLog: [AUDIT_HEAD]
  } });
  run(ctx, 'ensureAnnouncementImageColumn_()');
  const sh = ctx.__ss.getSheetByName('Announcements');
  eq(sh._get(1, ANN_HEAD.length + 1), 'imageFileId', 'ต้องต่อท้ายแถว 1');
  assertHeaderAppendOnly(ctx, 'Announcements', 1, ANN_HEAD);
});

/* ── ข้อสังเกต: addColumnIfMissing_ กับแท็บที่ยังว่างเปล่า ────────── */
{
  const ctx = loadCtx({ tabs: formsTabs({ AppGuide: [] }) });
  run(ctx, 'ensureFormsSheets()');
  const ag = ctx.__ss.getSheetByName('AppGuide');
  const msg = ctx.__world.ui.map(u => u.msg).join('\n');
  if (ag && ag.getLastRow() === 0 && /มีคอลัมน์ updatedAt อยู่แล้ว/.test(msg))
    note('ensureFormsSheets: แท็บ AppGuide ที่ยังว่างเปล่า จะไม่ได้คอลัมน์ updatedAt ' +
         'แต่ข้อความสรุปกลับบอกว่า "มีคอลัมน์ updatedAt อยู่แล้ว" (addColumnIfMissing_ คืน false ทั้งสองกรณี)');
}

/* =================================================================
 *  สรุป
 * ================================================================= */
console.log('');
results.forEach(([s, n, e]) => console.log(`  ${s} ${n}${e ? '\n      → ' + e : ''}`));
if (notes.length) {
  console.log('\n  ⚠️  ข้อสังเกต (ไม่ทำให้เทสต์แดง แต่ต้องให้คนตัดสินใจ)');
  notes.forEach(n => console.log('     • ' + n));
}
const bad = results.filter(r => r[0] === '✗').length;
console.log(bad ? `\n❌ ไม่ผ่าน ${bad} รายการ` : '\n✅ ผ่านทุกรายการ');
process.exit(bad ? 1 : 0);

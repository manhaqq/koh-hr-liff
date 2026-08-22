/* Mock ของ Apps Script ที่มี "เฉพาะเมธอดที่ยืนยันจากเอกสารทางการแล้ว" เท่านั้น
   ถ้าโค้ดเรียกเมธอดที่ไม่มีจริง จะพังแบบเดียวกับบนของจริง ซึ่งคือจุดประสงค์ */

let LOG = [];
const log = (...a) => LOG.push(a.join(' '));

class MockSheet {
  constructor(name, parent) { this._name = name; this._parent = parent; }
  getName() { return this._name; }
  setName(n) { this._name = n; return this; }
  getIndex() { return this._parent._sheets.indexOf(this) + 1; }
  activate() { this._parent._active = this; return this; }
  copyTo(dest) {                       // Sheet.copyTo(spreadsheet) -> Sheet
    if (!(dest instanceof MockSpreadsheet)) throw new TypeError('copyTo ต้องรับ Spreadsheet');
    const c = new MockSheet('Copy of ' + this._name, dest);
    dest._sheets.push(c);              // ★ ต่อท้ายเสมอ ตามพฤติกรรมจริง
    return c;
  }
  getLastRow() { return 10; }
  getLastColumn() { return 5; }
  getRange() { return { getValues: () => [[]], getDisplayValues: () => [[]], setValue(){return this}, setValues(){return this} }; }
  setFrozenRows() { return this; }
  setRowHeight() { return this; }
}

class MockSpreadsheet {
  constructor(id, names) {
    this._id = id;
    this._sheets = (names || []).map(n => new MockSheet(n, this));
  }
  getId() { return this._id; }
  getName() { return 'ss-' + this._id; }
  getSheets() { return this._sheets.slice(); }
  deleteSheet(sh) {
    const i = this._sheets.indexOf(sh);
    if (i < 0) throw new Error('deleteSheet: ไม่พบชีตนี้');
    this._sheets.splice(i, 1);
  }
  insertSheet(n) { const s = new MockSheet(n || 'Sheet' + (this._sheets.length+1), this); this._sheets.push(s); return s; }
  copy(name) { const c = new MockSpreadsheet('copy_' + Math.abs(name.length*7919), this._sheets.map(s=>s._name)); FILES_BY_SS[c._id] = c; return c; }
  moveActiveSheet() {}
  setActiveSheet(s) { this._active = s; return s; }
}

const SRC_TABS = ['อ่านก่อนใช้งาน','Employees','OrgChart','Announcements','Handbook','AppGuide',
                  'ShiftPattern','Schedule','Shifts','Reports','FAQ','Settings',
                  'Tickets','Leave','AuditLog','BroadcastLog'];
const FILES_BY_SS = {};
const SRC = new MockSpreadsheet('SRC_SHEET_ID', SRC_TABS);
FILES_BY_SS['SRC_SHEET_ID'] = SRC;

/* ── Drive Advanced Service v3 ── */
let driveSeq = 0;
const DRIVE = {};            // id -> {id,name,mimeType,parents,trashed,createdTime}
const Drive = {
  Files: {
    create(resource, media, opts) {
      const id = '1' + String(++driveSeq).padStart(4,'0') + 'AbCdEfGhIjKlMnOpQrStUvWxYz_-01';
      DRIVE[id] = { id, name: resource.name, mimeType: resource.mimeType,
                    parents: resource.parents || [], trashed: false,
                    createdTime: new Date(2026, 7, 22, 12, driveSeq).toISOString() };
      if (resource.mimeType === 'application/vnd.google-apps.spreadsheet') {
        FILES_BY_SS[id] = new MockSpreadsheet(id, ['Sheet1']);   // ชีตเปล่ามี 1 แท็บตั้งต้น
      }
      log(`  Drive.Files.create → ${id} "${resource.name}" parents=${JSON.stringify(resource.parents||[])}`);
      return { id };
    },
    get(fileId, opts) {
      const f = DRIVE[fileId];
      if (!f) { const e = new Error('File not found: ' + fileId); e.name = 'GoogleJsonResponseException'; throw e; }
      return f;
    },
    list(opts) {
      const m = /'([^']+)' in parents/.exec(opts.q || '');
      const parent = m ? m[1] : null;
      let files = Object.values(DRIVE).filter(f => !f.trashed && (!parent || f.parents.includes(parent)));
      const nm = /name contains '([^']+)'/.exec(opts.q || '');
      if (nm) files = files.filter(f => f.name.includes(nm[1]));
      files.sort((a,b) => b.createdTime.localeCompare(a.createdTime));
      return { files, nextPageToken: null };
    },
    update(resource, fileId, media, opts) {
      const f = Drive.Files.get(fileId);
      if (resource && resource.trashed !== undefined) f.trashed = resource.trashed;
      return f;
    }
  },
  Permissions: { create(resource, fileId) { Drive.Files.get(fileId); return { id: 'perm' }; } }
};

const MimeType = { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet' };
const SpreadsheetApp = { openById(id) {
  if (!FILES_BY_SS[id]) throw new Error('openById: ไม่พบสเปรดชีต ' + id);
  return FILES_BY_SS[id];
}};
const Utilities = { formatDate: (d, tz, fmt) => '2026-08-22_1200' };
const PROPS = { BACKUP_FOLDER_ID: '' };
const P = { getProperty: k => PROPS[k] || null, setProperty: (k,v) => { PROPS[k] = v; } };
const CacheService = { getScriptCache: () => ({ get:()=>null, put(){}, getAll:()=>({}), putAll(){}, remove(){}, removeAll(){} }) };
const ScriptApp = { getOAuthToken: () => 'tok' };
const UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getBlob: () => ({ setContentType(){return this} }) }) };
const console_ = console;

/* ── ตัวช่วยจากไฟล์อื่นในโปรเจ็ค ── */
const CFG = { ssId: 'SRC_SHEET_ID', TZ: 'Asia/Bangkok' };
const cfg = (k, fb) => P.getProperty(k) || (fb === undefined ? '' : fb);
const audit = (...a) => log('  audit: ' + a.slice(1).join(' | '));
const actor_ = () => 'tester@example.com';
const alert_ = (t, b) => log('  ALERT: ' + t + '\n' + b.split('\n').map(x=>'    '+x).join('\n'));

module.exports = { LOG, Drive, MimeType, SpreadsheetApp, Utilities, P, CacheService,
                   ScriptApp, UrlFetchApp, CFG, cfg, audit, actor_, alert_, DRIVE,
                   FILES_BY_SS, SRC_TABS, PROPS, log };

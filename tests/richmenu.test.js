/* ทดสอบ 08_RichMenu.js + 09_Triggers.js — สองขั้นตอนถัดไปที่เจ้าของร้านกำลังจะกด
 *
 * ★ ทำไมชุดนี้ถึงต้องมี
 *   รอบที่แล้วเจ้าของร้านกด "สร้าง/อัปเดต Rich Menu ทั้งหมด" แล้วเจอ
 *   "อ่านไฟล์จาก Drive ไม่สำเร็จ (404)" เพราะโค้ดวิ่งไปทาง Drive ก่อน
 *   ทั้งที่ภาพอยู่บน GitHub Pages เรียบร้อยแล้ว และ Script Property เก่า
 *   RICHMENU_IMG_*_FILEID ยังค้างอยู่จากตอนตั้งระบบครั้งแรก
 *
 *   เรื่องที่แย่กว่า error คือ "พิกัดปุ่มเพี้ยน" — ถ้า bounds ไม่ตรงกับรูป
 *   ระบบจะไม่ error อะไรเลย แต่แตะปุ่มไหนก็ไปผิดหน้าทุกปุ่ม เงียบสนิท
 *   ชุดนี้จึงล็อกพิกัดไว้กับ "ขนาดไฟล์ภาพจริงในโปรเจ็ค" ด้วย
 *
 * ★ mock ในไฟล์นี้มีเฉพาะเมธอดที่ยืนยันกับเอกสารของ Google แล้วเท่านั้น
 *   ทุกตัวมี URL เอกสารกำกับ ห้ามเพิ่มเมธอดเพื่อให้เทสต์ผ่านเด็ดขาด
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const M = require('./mock.js');
const GAS  = path.join(__dirname, '..', 'apps-script');
const ROOT = path.join(__dirname, '..');

/* ═══════════════════════════════════════════════════════════════
 * ส่วนที่ 1 — mock ของ Apps Script (เฉพาะเมธอดที่มีจริง)
 * ═══════════════════════════════════════════════════════════════ */

/* Blob — https://developers.google.com/apps-script/reference/base/blob
   getBytes() ของจริงคืน Byte[] ซึ่งเป็นเลข "มีเครื่องหมาย" (-128..127)
   จำลองให้ตรงจุดนี้ เพราะโค้ดที่อ่าน magic byte จะพลาดถ้าคิดว่าเป็น 0..255 */
function makeBlob(mime, buf, name) {
  const signed = Array.prototype.map.call(buf, b => (b > 127 ? b - 256 : b));
  return {
    getContentType() { return mime; },                                   // .../base/blob#getcontenttype
    setContentType(t) { mime = t; return this; },                        // .../base/blob#setcontenttypecontenttype
    getBytes() { return signed; },                                       // .../base/blob#getbytes
    setBytes(b) { signed.length = 0; Array.prototype.push.apply(signed, b); return this; },
    getName() { return name || null; },                                  // .../base/blob#getname
    setName(n) { name = n; return this; },                               // .../base/blob#setnamename
    getDataAsString() { return buf.toString('utf8'); },                  // .../base/blob#getdataasstring
    copyBlob() { return makeBlob(mime, buf, name); }                     // .../base/blob#copyblob
  };
}

/* HTTPResponse — https://developers.google.com/apps-script/reference/url-fetch/http-response */
function makeResponse(code, blob, text) {
  return {
    getResponseCode() { return code; },                                  // .../http-response#getresponsecode
    getContentText() { return text === undefined ? (blob ? blob.getDataAsString() : '') : text; },
    getBlob() { return blob; },                                          // .../http-response#getblob
    getContent() { return blob ? blob.getBytes() : []; },                // .../http-response#getcontent
    getAllHeaders() { return { 'Content-Type': blob ? blob.getContentType() : 'text/plain' } },
    getHeaders()    { return this.getAllHeaders(); }                     // .../http-response#getheaders
  };
}
const jsonRes = (code, obj) => makeResponse(code, makeBlob('application/json',
  Buffer.from(JSON.stringify(obj), 'utf8')), JSON.stringify(obj));

/* Properties — https://developers.google.com/apps-script/reference/properties/properties */
function makeProps(store) {
  return {
    getProperty: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setProperty(k, v) { store[k] = String(v); return this; },
    setProperties(o) { Object.keys(o).forEach(k => { store[k] = String(o[k]); }); return this; },
    getProperties: () => Object.assign({}, store),                       // .../properties#getproperties
    getKeys: () => Object.keys(store),                                   // .../properties#getkeys
    deleteProperty(k) { delete store[k]; return this; },                 // .../properties#deletepropertykey
    deleteAllProperties() { Object.keys(store).forEach(k => { delete store[k]; }); return this; }
  };
}
const STORE = {};
const SCRIPT_PROPS = makeProps(STORE);
/* PropertiesService — https://developers.google.com/apps-script/reference/properties/properties-service */
const PropertiesService = {
  getScriptProperties:   () => SCRIPT_PROPS,
  getUserProperties:     () => makeProps({}),
  getDocumentProperties: () => makeProps({})
};

/* ── เครือข่ายจำลอง ── ทุกคำขอ HTTP วิ่งผ่านตรงนี้ทางเดียว */
const NET = { webCode: {}, webBody: {}, driveCode: {}, driveBody: {}, calls: [], line: [] };
const LINE_MENUS = [];
let menuSeq = 0, defaultMenuId = null;

function lineRoute(url, opt) {
  const method = String(opt.method || 'get').toLowerCase();
  const body = (typeof opt.payload === 'string') ? JSON.parse(opt.payload) : opt.payload;
  NET.line.push({ method: method, url: url, contentType: opt.contentType || null, payload: body });

  if (method === 'post' && /\/v2\/bot\/richmenu$/.test(url)) {
    const id = 'richmenu-' + String(++menuSeq).padStart(4, '0');
    LINE_MENUS.push({ richMenuId: id, name: body.name, object: body });
    return jsonRes(200, { richMenuId: id });
  }
  if (method === 'post' && /api-data\.line\.me.*\/richmenu\/[^/]+\/content$/.test(url)) {
    if (!body || typeof body.getBytes !== 'function') return jsonRes(400, { message: 'payload ไม่ใช่ไบนารีของรูป' });
    /* LINE รับเฉพาะ image/jpeg กับ image/png — และต้องตรงกับไบต์จริง */
    if (['image/jpeg', 'image/png'].indexOf(String(opt.contentType)) < 0)
      return jsonRes(400, { message: 'Content-Type ไม่รองรับ: ' + opt.contentType });
    const b = body.getBytes(), u = i => (b[i] < 0 ? b[i] + 256 : b[i]);
    const realMime = (u(0) === 0xFF && u(1) === 0xD8) ? 'image/jpeg'
                   : (u(0) === 0x89 && u(1) === 0x50) ? 'image/png' : 'unknown';
    if (realMime !== opt.contentType)
      return jsonRes(400, { message: 'Content-Type (' + opt.contentType + ') ไม่ตรงกับไบต์จริง (' + realMime + ')' });
    if (b.length > 1024 * 1024) return jsonRes(400, { message: 'รูปเกิน 1 MB' });
    return jsonRes(200, {});
  }
  if (method === 'post' && /\/v2\/bot\/user\/all\/richmenu\/([^/]+)$/.test(url)) {
    defaultMenuId = /\/richmenu\/([^/]+)$/.exec(url)[1];
    if (!LINE_MENUS.some(m => m.richMenuId === defaultMenuId)) return jsonRes(404, { message: 'ไม่พบเมนูนี้' });
    return jsonRes(200, {});
  }
  if (method === 'get' && /\/v2\/bot\/richmenu\/list$/.test(url))
    return jsonRes(200, { richmenus: LINE_MENUS.map(m => ({ richMenuId: m.richMenuId, name: m.name })) });
  if (method === 'delete' && /\/v2\/bot\/richmenu\/([^/]+)$/.test(url)) {
    const id = /\/richmenu\/([^/]+)$/.exec(url)[1];
    const i = LINE_MENUS.findIndex(m => m.richMenuId === id);
    if (i >= 0) LINE_MENUS.splice(i, 1);
    return jsonRes(200, {});
  }
  return jsonRes(404, { message: 'ไม่รู้จัก endpoint นี้: ' + method + ' ' + url });
}

/* UrlFetchApp — https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app#fetchurl,-params */
const UrlFetchApp = {
  fetch(url, params) {
    const opt = params || {};
    NET.calls.push({ url: url, method: String(opt.method || 'get').toLowerCase() });

    let m = /github\.io\/[^/]+\/richmenu\/([^/?]+)\.jpg$/.exec(url);
    if (m) {
      const code = NET.webCode[m[1]] === undefined ? 200 : NET.webCode[m[1]];
      if (code === 0) throw new Error('DNS error: ' + url);            // ต่อไม่ติดจริง ๆ
      if (code !== 200) return makeResponse(code, makeBlob('text/html', Buffer.from('<h1>404</h1>')), '404');
      return makeResponse(200, makeBlob('image/jpeg', NET.webBody[m[1]] || jpegOf(300 * 1024)));
    }
    m = /googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media/.exec(url);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const code = NET.driveCode[id] === undefined ? 404 : NET.driveCode[id];
      if (code !== 200) return makeResponse(code, makeBlob('application/json', Buffer.from('{}')), '{}');
      /* Drive คืน Content-Type ตามชนิดไฟล์จริง — ของเรา build.py ออกเป็น .jpg */
      return makeResponse(200, makeBlob('image/jpeg', NET.driveBody[id] || jpegOf(300 * 1024)));
    }
    if (/^https:\/\/api(-data)?\.line\.me\//.test(url)) return lineRoute(url, opt);
    return makeResponse(404, makeBlob('text/plain', Buffer.from('no route')), 'no route');
  }
};
const jpegOf = n => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(Math.max(0, n - 4))]);
const pngOf  = n => Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(Math.max(0, n - 8))]);

/* ── ScriptApp + ทริกเกอร์ ──
   ScriptApp            https://developers.google.com/apps-script/reference/script/script-app
   TriggerBuilder       https://developers.google.com/apps-script/reference/script/trigger-builder
   ClockTriggerBuilder  https://developers.google.com/apps-script/reference/script/clock-trigger-builder
   SpreadsheetTriggerBuilder https://developers.google.com/apps-script/reference/script/spreadsheet-trigger-builder
   Trigger              https://developers.google.com/apps-script/reference/script/trigger
   WeekDay              https://developers.google.com/apps-script/reference/script/week-day            */
let TRIGGERS = [], trgSeq = 0;
function makeTrigger(fn, eventType, source, sourceId, spec) {
  return {
    _spec: spec || {},
    getUniqueId()        { return 'trg-' + String(++trgSeq).padStart(3, '0'); },
    getHandlerFunction() { return fn; },
    getEventType()       { return eventType; },
    getTriggerSource()   { return source; },
    getTriggerSourceId() { return sourceId; }
  };
}
function clockBuilder(fn) {
  const spec = {};
  const b = {
    after(ms)         { spec.after = ms; return b; },
    at(date)          { spec.at = date; return b; },
    atDate(y, mo, d)  { spec.atDate = [y, mo, d]; return b; },
    atHour(h)         { spec.hour = h; return b; },
    everyDays(n)      { spec.everyDays = n; return b; },
    everyHours(n)     { spec.everyHours = n; return b; },
    everyMinutes(n)   { spec.everyMinutes = n; return b; },
    everyWeeks(n)     { spec.everyWeeks = n; return b; },
    inTimezone(tz)    { spec.tz = tz; return b; },
    nearMinute(n)     { spec.nearMinute = n; return b; },
    onMonthDay(d)     { spec.monthDay = d; return b; },
    onWeekDay(d)      { spec.weekDay = d; return b; },
    create() {
      /* ของจริงบังคับให้ระบุความถี่อย่างน้อยหนึ่งอย่าง ไม่งั้นโยน
         "You must specify at least one recurrence" */
      if (!spec.after && !spec.at && !spec.atDate && !spec.everyDays && !spec.everyHours &&
          !spec.everyMinutes && !spec.everyWeeks && !spec.weekDay && !spec.monthDay)
        throw new Error('You must specify at least one recurrence for ' + fn);
      const t = makeTrigger(fn, 'CLOCK', 'CLOCK', null, spec);
      pushTrigger(t); return t;
    }
  };
  return b;
}
function sheetBuilder(fn, key) {
  const mk = ev => ({
    create() {
      /* ของจริงโยน "Cannot find spreadsheet with id: " ถ้า key ว่างหรือผิด */
      if (!key) throw new Error('Cannot find spreadsheet with id: ' + JSON.stringify(key));
      const t = makeTrigger(fn, ev, 'SPREADSHEETS', String(key), {});
      pushTrigger(t); return t;
    }
  });
  return {
    onChange()     { return mk('ON_CHANGE'); },
    onEdit()       { return mk('ON_EDIT'); },
    onFormSubmit() { return mk('ON_FORM_SUBMIT'); },
    onOpen()       { return mk('ON_OPEN'); }
  };
}
function pushTrigger(t) {
  /* โควตาจริงของ Apps Script คือ 20 ทริกเกอร์ต่อสคริปต์ต่อผู้ใช้
     https://developers.google.com/apps-script/guides/services/quotas */
  if (TRIGGERS.length >= 20) throw new Error('เกินโควตา 20 ทริกเกอร์ต่อสคริปต์ — น่าจะติดตั้งซ้ำซ้อน');
  TRIGGERS.push(t);
}
const ScriptApp = {
  getOAuthToken: () => 'tok',
  getProjectTriggers: () => TRIGGERS.slice(),
  deleteTrigger(t) { const i = TRIGGERS.indexOf(t); if (i >= 0) TRIGGERS.splice(i, 1); },
  newTrigger(fn) {
    if (!fn || typeof fn !== 'string') throw new Error('newTrigger ต้องรับชื่อฟังก์ชันเป็นสตริง');
    return {
      timeBased()          { return clockBuilder(fn); },
      forSpreadsheet(key)  { return sheetBuilder(fn, key && key.getId ? key.getId() : key); },
      forDocument(key)     { return sheetBuilder(fn, key); },
      forForm(key)         { return sheetBuilder(fn, key); },
      forUserCalendar(id)  { return clockBuilder(fn); }
    };
  },
  WeekDay: { SUNDAY: 'SUNDAY', MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY',
             THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY' },
  EventType: { CLOCK: 'CLOCK', ON_EDIT: 'ON_EDIT', ON_OPEN: 'ON_OPEN',
               ON_CHANGE: 'ON_CHANGE', ON_FORM_SUBMIT: 'ON_FORM_SUBMIT' },
  TriggerSource: { CLOCK: 'CLOCK', SPREADSHEETS: 'SPREADSHEETS', DOCUMENTS: 'DOCUMENTS',
                   FORMS: 'FORMS', CALENDAR: 'CALENDAR' }
};

/* Utilities — https://developers.google.com/apps-script/reference/utilities/utilities */
let sleepMs = 0;
const Utilities = {
  sleep(ms) { sleepMs += ms; },                                          // .../utilities#sleepmilliseconds
  getUuid: () => 'uuid-0001',
  formatDate: () => '2026-08-22'
};

/* ═══════════════════════════════════════════════════════════════
 * ส่วนที่ 2 — โหลดไฟล์จริงจากโปรเจ็ค (ไม่แก้อะไรเลย)
 * ═══════════════════════════════════════════════════════════════ */
const ALERTS = [], AUDITS = [];
let resetBadgeCalls = 0;

const ctx = vm.createContext({
  console: console, JSON: JSON, Math: Math, Date: Date, String: String, Number: Number,
  Object: Object, Array: Array, Error: Error, TypeError: TypeError, RegExp: RegExp,
  isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent,
  PropertiesService: PropertiesService, UrlFetchApp: UrlFetchApp, ScriptApp: ScriptApp,
  Utilities: Utilities, Drive: M.Drive,
  /* ตัวช่วยจากไฟล์อื่นที่ไม่ได้โหลดในชุดนี้ — ทุกชื่อถูกตรวจว่ามีจริงในโค้ดด้านล่าง */
  alert_:   (t, b) => ALERTS.push({ title: t, body: b }),
  confirm_: () => true,
  audit:    (actor, action, target, detail) => AUDITS.push({ action: action, detail: detail }),
  actor_:   () => 'owner@example.com',
  resetAllBadges: () => { resetBadgeCalls++; return 42; }
});

for (const f of ['00_Config.js', '15_Drive.js', '01_LineApi.js', '08_RichMenu.js', '09_Triggers.js']) {
  vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), ctx, { filename: f });
}

SCRIPT_PROPS.setProperties({
  CHANNEL_ACCESS_TOKEN: 'test-token',
  SPREADSHEET_ID: '1SsIdForTestOnly_AbCdEfGhIjKlMnOpQrStUv',
  LIFF_ID_VERIFY: '1234567890-abcdefgh'
});

/* ═══════════════════════════════════════════════════════════════
 * ส่วนที่ 3 — เครื่องมือตรวจ
 * ═══════════════════════════════════════════════════════════════ */
const results = [];
function check(name, fn) {
  try { fn(); results.push(['✓', name, '']); }
  catch (e) { results.push(['✗', name, e.message]); }
}
function eq(got, want, what) {
  if (String(got) !== String(want)) throw new Error(what + ': ได้ ' + JSON.stringify(got) + ' ควรเป็น ' + JSON.stringify(want));
}
function must(cond, msg) { if (!cond) throw new Error(msg); }

/** ตัดพิกัดเป็นตารางย่อยแบบไม่มีการปัดเศษ แล้วนับว่าแต่ละช่องถูกกี่ area ทับ */
function coverage(size, areas) {
  const xs = new Set([0, size.width]), ys = new Set([0, size.height]);
  areas.forEach(a => {
    xs.add(a.bounds.x); xs.add(a.bounds.x + a.bounds.width);
    ys.add(a.bounds.y); ys.add(a.bounds.y + a.bounds.height);
  });
  const X = [...xs].sort((p, q) => p - q).filter(v => v >= 0 && v <= size.width);
  const Y = [...ys].sort((p, q) => p - q).filter(v => v >= 0 && v <= size.height);
  const cells = [];
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) {
    const x0 = X[i], x1 = X[i + 1], y0 = Y[j], y1 = Y[j + 1];
    let n = 0;
    areas.forEach(a => {
      const b = a.bounds;
      if (x0 >= b.x && x1 <= b.x + b.width && y0 >= b.y && y1 <= b.y + b.height) n++;
    });
    cells.push({ x0, y0, x1, y1, n });
  }
  return cells;
}
const rectArea = r => (r.x1 - r.x0) * (r.y1 - r.y0);
function bbox(cells) {
  return { x0: Math.min(...cells.map(c => c.x0)), y0: Math.min(...cells.map(c => c.y0)),
           x1: Math.max(...cells.map(c => c.x1)), y1: Math.max(...cells.map(c => c.y1)) };
}
/** พื้นที่ที่ไม่มี area ไหนทับ ต้องเป็น "สี่เหลี่ยมผืนเดียว" ตามที่ระบุ ไม่ใช่รูเล็ก ๆ กระจาย */
function assertGapIsExactly(cells, want, label) {
  const gaps = cells.filter(c => c.n === 0);
  if (!want) { must(gaps.length === 0, label + ': มีช่องว่างที่ไม่ได้ตั้งใจ ' + JSON.stringify(gaps.map(g => [g.x0, g.y0, g.x1, g.y1]))); return; }
  must(gaps.length > 0, label + ': คาดว่าจะมีพื้นที่กดไม่ได้ ' + JSON.stringify(want) + ' แต่ทุกจุดกดได้หมด');
  const bb = bbox(gaps);
  const sum = gaps.reduce((s, g) => s + rectArea(g), 0);
  must(sum === rectArea(bb), label + ': พื้นที่กดไม่ได้แตกเป็นหลายชิ้น ' + JSON.stringify(bb) + ' รวม ' + sum);
  eq(JSON.stringify([bb.x0, bb.y0, bb.x1, bb.y1]), JSON.stringify(want), label + ': ขอบเขตพื้นที่กดไม่ได้');
}
const inside = (r, b) => r.x0 >= b.x && r.y0 >= b.y && r.x1 <= b.x + b.width && r.y1 <= b.y + b.height;

/** อ่านขนาดจริงจากไบต์ของ JPEG (มาร์กเกอร์ SOFn) — ผูกพิกัดปุ่มไว้กับรูปจริง */
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const mk = buf[i + 1];
    if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC)
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD9)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/* ดัชนีชื่อฟังก์ชันทั้งหมดที่ "ประกาศไว้จริง" ในโค้ดหลังบ้าน — ใช้จับ handler สะกดผิด */
const DECLARED = new Set();
fs.readdirSync(GAS).filter(f => f.endsWith('.js')).forEach(f => {
  const s = fs.readFileSync(path.join(GAS, f), 'utf8');
  let m;
  const reFn = /^[ \t]*function[ \t]+([A-Za-z0-9_$]+)[ \t]*\(/gm;
  while ((m = reFn.exec(s))) DECLARED.add(m[1]);
  const reVar = /^[ \t]*(?:var|let|const)[ \t]+([A-Za-z0-9_$]+)[ \t]*=[ \t]*function[ \t]*\(/gm;
  while ((m = reVar.exec(s))) DECLARED.add(m[1]);
});

const VARIANTS = vm.runInContext('MENU_VARIANTS', ctx);
const resetNet = () => { NET.calls.length = 0; NET.line.length = 0; NET.webCode = {}; NET.webBody = {}; NET.driveCode = {}; NET.driveBody = {}; };
const driveHits = () => NET.calls.filter(c => /googleapis\.com\/drive/.test(c.url)).length;

console.log('═══ 08_RichMenu.js — ดึงภาพเมนู (richMenuImage_) ═══\n');

/* ── สถานการณ์จริงของเจ้าของร้านตอนนี้ ──────────────────────────── */
check('เว็บโหลดได้ + Script Property เก่าค้างอยู่ → ต้องไม่แตะ Drive เลย', () => {
  resetNet();
  VARIANTS.forEach(v => SCRIPT_PROPS.setProperty(v.img, '1staleFileIdFrom2025_AbCdEfGhIjKlMnOp'));  // ค่าเก่าค้าง
  const blob = vm.runInContext('richMenuImage_(MENU_VARIANTS[1])', ctx);
  eq(blob.getContentType(), 'image/jpeg', 'ชนิดไฟล์');
  eq(driveHits(), 0, 'จำนวนครั้งที่วิ่งไป Drive (ต้องเป็น 0 — นี่คือบั๊กที่เพิ่งแก้)');
  eq(NET.calls.length, 1, 'จำนวนคำขอทั้งหมด');
  must(/github\.io/.test(NET.calls[0].url), 'ควรยิงไปที่เว็บ แต่ยิงไป ' + NET.calls[0].url);
});

check('เว็บ 404 + Drive ค่าเก่าใช้ไม่ได้ → error บอกทั้งสองทาง', () => {
  resetNet();
  NET.webCode['main'] = 404;
  SCRIPT_PROPS.setProperty('RICHMENU_IMG_MAIN_FILEID', '1staleFileIdFrom2025_AbCdEfGhIjKlMnOp');
  let msg = '';
  try { vm.runInContext('richMenuImage_(MENU_VARIANTS[1])', ctx); }
  catch (e) { msg = e.message; }
  must(msg, 'ควรจะ throw แต่ผ่านไปเฉย ๆ');
  must(msg.indexOf('main.jpg') >= 0, 'ข้อความไม่บอก URL ของเว็บ: ' + msg);
  must(msg.indexOf('404') >= 0, 'ข้อความไม่บอกรหัสของเว็บ: ' + msg);
  must(msg.indexOf('RICHMENU_IMG_MAIN_FILEID') >= 0, 'ข้อความไม่บอกชื่อ Script Property ที่ต้องไปลบ: ' + msg);
  must(msg.indexOf('Drive') >= 0, 'ข้อความไม่บอกว่าทาง Drive ก็พัง: ' + msg);
  must(driveHits() === 1, 'ควรลอง Drive หนึ่งครั้งเมื่อเว็บพัง');
});

check('เว็บ 404 + ไม่เคยตั้ง File ID → error บอก URL และวิธีแก้', () => {
  resetNet();
  NET.webCode['main'] = 404;
  SCRIPT_PROPS.deleteProperty('RICHMENU_IMG_MAIN_FILEID');
  let msg = '';
  try { vm.runInContext('richMenuImage_(MENU_VARIANTS[1])', ctx); } catch (e) { msg = e.message; }
  must(msg.indexOf('main.jpg') >= 0 && msg.indexOf('404') >= 0, 'ข้อความไม่ครบ: ' + msg);
  eq(driveHits(), 0, 'ไม่ควรแตะ Drive เมื่อไม่มี File ID');
});

check('เว็บ 404 + Drive ยังใช้ได้ → ทางเก่ายังทำงานได้อยู่', () => {
  resetNet();
  NET.webCode['main'] = 404;
  const fid = '1workingLegacyFileId_AbCdEfGhIjKlMnOp';
  SCRIPT_PROPS.setProperty('RICHMENU_IMG_MAIN_FILEID', fid);
  NET.driveCode[fid] = 200;
  const blob = vm.runInContext('richMenuImage_(MENU_VARIANTS[1])', ctx);
  must(blob && blob.getBytes().length > 0, 'ไม่ได้ blob จาก Drive');
  eq(driveHits(), 1, 'จำนวนครั้งที่วิ่งไป Drive');
});

check('ต่อเน็ตไม่ติดเลย (fetch โยน exception) → ไม่ล้มทั้งฟังก์ชัน', () => {
  resetNet();
  NET.webCode['main'] = 0;                       // จำลอง DNS พัง
  SCRIPT_PROPS.deleteProperty('RICHMENU_IMG_MAIN_FILEID');
  let msg = '';
  try { vm.runInContext('richMenuImage_(MENU_VARIANTS[1])', ctx); } catch (e) { msg = e.message; }
  must(msg.indexOf('ต่อไม่ติด') >= 0, 'ข้อความควรบอกว่าต่อไม่ติด: ' + msg);
});

check('ภาพเกิน 1 MB จากเว็บ → ปฏิเสธตั้งแต่ต้นทาง บอกชื่อไฟล์และขนาด', () => {
  resetNet();
  NET.webBody['main'] = jpegOf(1536 * 1024);     // 1.5 MB
  let msg = '';
  try { vm.runInContext('richMenuImage_(MENU_VARIANTS[1])', ctx); } catch (e) { msg = e.message; }
  must(msg.indexOf('main.jpg') >= 0, 'ไม่บอกว่าไฟล์ไหน: ' + msg);
  must(msg.indexOf('1536') >= 0, 'ไม่บอกว่าใหญ่แค่ไหน: ' + msg);
  must(msg.indexOf('1 MB') >= 0, 'ไม่บอกเพดานของ LINE: ' + msg);
  eq(NET.line.length, 0, 'ห้ามยิงไป LINE เลยเมื่อรูปใหญ่เกิน');
});

check('ภาพพอดี 1 MB → ยังผ่าน (ไม่ off-by-one)', () => {
  resetNet();
  NET.webBody['main'] = jpegOf(1024 * 1024);
  const blob = vm.runInContext('richMenuImage_(MENU_VARIANTS[1])', ctx);
  eq(blob.getBytes().length, 1024 * 1024, 'ขนาด blob');
});

check('ภาพเกิน 1 MB จากทาง Drive → ต้องบอกขนาด ไม่ใช่กลบเป็น "โหลดไม่ได้"', () => {
  resetNet();
  NET.webCode['main'] = 404;
  const fid = '1bigLegacyFileId_AbCdEfGhIjKlMnOpQr';
  SCRIPT_PROPS.setProperty('RICHMENU_IMG_MAIN_FILEID', fid);
  NET.driveCode[fid] = 200; NET.driveBody[fid] = jpegOf(2048 * 1024);
  let msg = '';
  try { vm.runInContext('richMenuImage_(MENU_VARIANTS[1])', ctx); } catch (e) { msg = e.message; }
  must(msg.indexOf('2048') >= 0, 'ข้อความควรยังบอกขนาดที่เกิน: ' + msg);
});

console.log('═══ พิกัดปุ่มเทียบกับภาพจริงในโปรเจ็ค ═══\n');

/* พิกัดอ้างอิงจาก richmenu/build.py — ถ้าแก้ไฟล์นั้นต้องแก้ที่นี่ด้วย */
const ART = {
  LOGO:      { x0: 0,    y0: 0,   x1: 1150, y1: 860 },   // มุมซ้ายบน: โลโก้ ห้ามกดได้
  DOT_NEWS:  { x: 2360,  y: 478 },                        // จุดแดงประกาศ (build.py: DOT_NEWS)
  DOT_HR:    { x: 2352,  y: 934 },                        // จุดแดง HR     (build.py: DOT_HR)
  GUEST_BTN: { x0: 1145, y0: 205, x1: 2435, y1: 620 },    // ปุ่มยืนยันตัวตน (build.py)
  GUEST_HOW: { x0: 1145, y0: 665, x1: 2435, y1: 790 }     // แถบ "? วิธีใช้งาน" (build.py)
};

check('เมนูหลัก: ขนาด 2500x1686 และเป็นขนาดที่ LINE รับ', () => {
  const o = vm.runInContext('richMenuMainObject_("t")', ctx);
  eq(o.size.width, 2500, 'ความกว้าง'); eq(o.size.height, 1686, 'ความสูง');
  const LEGAL = ['2500x1686', '2500x843', '1200x810', '1200x405', '800x540', '800x270'];
  must(LEGAL.indexOf(o.size.width + 'x' + o.size.height) >= 0, 'ขนาดนี้ LINE ไม่รับ');
  eq(o.areas.length, 4, 'จำนวนปุ่ม');
});

check('เมนูหลัก: ปุ่มทุกอันอยู่ในกรอบรูป ไม่ล้นออกไป', () => {
  const o = vm.runInContext('richMenuMainObject_("t")', ctx);
  o.areas.forEach((a, i) => {
    const b = a.bounds;
    must(b.x >= 0 && b.y >= 0, 'ปุ่มที่ ' + i + ' พิกัดติดลบ');
    must(b.width > 0 && b.height > 0, 'ปุ่มที่ ' + i + ' กว้าง/สูงไม่เป็นบวก');
    must(b.x + b.width  <= o.size.width,  'ปุ่มที่ ' + i + ' (' + a.action.label + ') ล้นขอบขวา');
    must(b.y + b.height <= o.size.height, 'ปุ่มที่ ' + i + ' (' + a.action.label + ') ล้นขอบล่าง');
  });
});

check('เมนูหลัก: ปุ่มไม่ทับกันเลย', () => {
  const o = vm.runInContext('richMenuMainObject_("t")', ctx);
  const over = coverage(o.size, o.areas).filter(c => c.n > 1);
  must(over.length === 0, 'พบพื้นที่ที่ปุ่มทับกัน: ' +
    JSON.stringify(over.map(c => [c.x0, c.y0, c.x1, c.y1, c.n + ' ปุ่ม'])));
});

check('เมนูหลัก: ไม่มีรูโหว่ — ที่กดไม่ได้มีแค่ช่องโลโก้มุมซ้ายบนเท่านั้น', () => {
  const o = vm.runInContext('richMenuMainObject_("t")', ctx);
  assertGapIsExactly(coverage(o.size, o.areas), [ART.LOGO.x0, ART.LOGO.y0, ART.LOGO.x1, ART.LOGO.y1], 'เมนูหลัก');
});

check('เมนูหลัก: โลโก้กดไม่ได้จริง (ไม่มีปุ่มไหนกินเข้ามาในช่องโลโก้)', () => {
  const o = vm.runInContext('richMenuMainObject_("t")', ctx);
  o.areas.forEach(a => {
    const b = a.bounds;
    const hit = b.x < ART.LOGO.x1 && b.x + b.width > ART.LOGO.x0 &&
                b.y < ART.LOGO.y1 && b.y + b.height > ART.LOGO.y0;
    must(!hit, 'ปุ่ม "' + a.action.label + '" กินเข้ามาในช่องโลโก้ — แตะโลโก้แล้วจะเด้งไปหน้าอื่น');
  });
});

check('เมนูหลัก: จุดแดงทั้งสองจุดตกอยู่ในปุ่มที่ถูกต้อง (ผูกกับ build.py)', () => {
  const o = vm.runInContext('richMenuMainObject_("t")', ctx);
  const at = p => o.areas.filter(a => p.x >= a.bounds.x && p.x < a.bounds.x + a.bounds.width &&
                                      p.y >= a.bounds.y && p.y < a.bounds.y + a.bounds.height)[0];
  const news = at(ART.DOT_NEWS), hr = at(ART.DOT_HR);
  must(news && news.action.data === 'action=news', 'จุดแดงประกาศไม่ได้อยู่บนปุ่มประกาศ (ได้ ' + (news && news.action.data) + ')');
  must(hr && hr.action.data === 'action=hr_menu', 'จุดแดง HR ไม่ได้อยู่บนปุ่มติดต่อ HR (ได้ ' + (hr && hr.action.data) + ')');
});

check('เมนู guest: ขนาด/ปุ่มไม่ทับกัน และคลุมปุ่มจริงบนรูป', () => {
  const o = vm.runInContext('richMenuGuestObject_()', ctx);
  eq(o.size.width, 2500, 'ความกว้าง'); eq(o.size.height, 843, 'ความสูง');
  eq(o.areas.length, 2, 'จำนวนปุ่ม');
  o.areas.forEach((a, i) => {
    must(a.bounds.x + a.bounds.width  <= o.size.width,  'ปุ่มที่ ' + i + ' ล้นขอบขวา');
    must(a.bounds.y + a.bounds.height <= o.size.height, 'ปุ่มที่ ' + i + ' ล้นขอบล่าง');
  });
  const over = coverage(o.size, o.areas).filter(c => c.n > 1);
  must(over.length === 0, 'ปุ่ม guest ทับกัน: ' + JSON.stringify(over.map(c => [c.x0, c.y0, c.x1, c.y1])));
  must(inside(ART.GUEST_BTN, o.areas[0].bounds), 'ปุ่ม "ยืนยันตัวตนพนักงาน" บนรูปหลุดออกนอกพื้นที่กด');
  must(inside(ART.GUEST_HOW, o.areas[1].bounds), 'แถบ "วิธีใช้งาน" บนรูปหลุดออกนอกพื้นที่กด');
  must(o.areas[0].action.type === 'uri' && /liff\.line\.me/.test(o.areas[0].action.uri),
       'ปุ่มยืนยันตัวตนต้องเป็นลิงก์ LIFF: ' + JSON.stringify(o.areas[0].action));
});

check('เมนู guest: พื้นที่กดไม่ได้เป็นแถบซ้ายล่างชิ้นเดียว', () => {
  const o = vm.runInContext('richMenuGuestObject_()', ctx);
  assertGapIsExactly(coverage(o.size, o.areas), [0, 650, 1100, 843], 'เมนู guest');
});

check('ไฟล์ภาพจริงในโปรเจ็คขนาดตรงกับพิกัด และไม่เกิน 1 MB', () => {
  VARIANTS.forEach(v => {
    const p = path.join(ROOT, 'richmenu', v.file + '.jpg');
    must(fs.existsSync(p), 'ไม่มีไฟล์ richmenu/' + v.file + '.jpg — เมนู "' + v.label + '" จะโหลดไม่ได้');
    const buf = fs.readFileSync(p);
    must(buf.length <= 1024 * 1024, 'richmenu/' + v.file + '.jpg ใหญ่ ' + Math.round(buf.length / 1024) +
         ' KB เกิน 1 MB — ลดค่า QUALITY ใน richmenu/build.py');
    const d = jpegSize(buf);
    must(d, 'อ่านขนาดของ richmenu/' + v.file + '.jpg ไม่ออก');
    const want = vm.runInContext(v.key === 'GUEST' ? 'richMenuGuestObject_()' : 'richMenuMainObject_("t")', ctx).size;
    eq(d.width + 'x' + d.height, want.width + 'x' + want.height,
       'richmenu/' + v.file + '.jpg ขนาดไม่ตรงกับพิกัดปุ่มใน 08_RichMenu.js');
  });
});

check('ข้อจำกัดของ LINE: chatBarText ≤ 14, label ≤ 20, data ≤ 300, areas ≤ 20', () => {
  ['richMenuMainObject_("KohNaiSoi-HR-MAIN_NH-v3")', 'richMenuGuestObject_()'].forEach(expr => {
    const o = vm.runInContext(expr, ctx);
    must(o.name.length <= 300, 'name ยาวเกิน');
    must(o.chatBarText.length <= 14, 'chatBarText "' + o.chatBarText + '" ยาว ' + o.chatBarText.length + ' เกิน 14');
    must(o.areas.length <= 20, 'areas เกิน 20');
    o.areas.forEach(a => {
      must(a.action.label.length <= 20, 'label "' + a.action.label + '" ยาว ' + a.action.label.length + ' เกิน 20');
      if (a.action.data) must(a.action.data.length <= 300, 'data ยาวเกิน 300');
      if (a.action.type === 'postback' && a.action.inputOption)
        must(['closeRichMenu', 'openRichMenu', 'openKeyboard', 'openVoice'].indexOf(a.action.inputOption) >= 0,
             'inputOption ไม่ใช่ค่าที่ LINE รู้จัก: ' + a.action.inputOption);
    });
  });
});

console.log('═══ setupRichMenus() — ตั้งแต่ต้นจนจบ ═══\n');

check('setupRichMenus ครบทั้ง 5 ชุด ตั้ง default เป็น guest และล้างจุดแดง', () => {
  resetNet(); LINE_MENUS.length = 0; menuSeq = 0; defaultMenuId = null;
  ALERTS.length = 0; AUDITS.length = 0; resetBadgeCalls = 0; sleepMs = 0;
  VARIANTS.forEach(v => { SCRIPT_PROPS.deleteProperty(v.prop); SCRIPT_PROPS.deleteProperty(v.img); });
  /* จำลองสถานการณ์จริง: ค่าเก่าจากตอนตั้งระบบครั้งแรกยังค้างอยู่ทุกตัว */
  VARIANTS.forEach(v => SCRIPT_PROPS.setProperty(v.img, '1staleFileIdFrom2025_AbCdEfGhIjKlMnOp'));

  vm.runInContext('setupRichMenus()', ctx);

  eq(LINE_MENUS.length, 5, 'จำนวน Rich Menu ที่สร้างบน LINE');
  eq(driveHits(), 0, 'ต้องไม่แตะ Drive เลยเมื่อเว็บใช้ได้');
  const ids = VARIANTS.map(v => SCRIPT_PROPS.getProperty(v.prop));
  ids.forEach((id, i) => must(id, 'ไม่ได้เก็บ id ของ "' + VARIANTS[i].label + '" ลง ' + VARIANTS[i].prop));
  eq(new Set(ids).size, 5, 'id ทั้ง 5 ต้องไม่ซ้ำกัน');
  eq(defaultMenuId, SCRIPT_PROPS.getProperty('RICHMENU_ID_GUEST'), 'เมนูเริ่มต้นต้องเป็นเมนูยืนยันตัวตน');
  eq(resetBadgeCalls, 1, 'จำนวนครั้งที่เรียก resetAllBadges');
  eq(ALERTS.length, 1, 'จำนวนกล่องแจ้งผล');
  must(AUDITS.some(a => a.action === 'RICHMENU_SETUP'), 'ไม่ได้บันทึก audit RICHMENU_SETUP');
  eq(sleepMs, 1500, 'เวลาหน่วงรวมระหว่างอัปโหลด');
});

check('อัปโหลดรูปครบทุกชุด และ Content-Type ตรงกับไบต์จริง (LINE ตอบ 400 ถ้าไม่ตรง)', () => {
  const ups = NET.line.filter(c => /\/content$/.test(c.url));
  eq(ups.length, 5, 'จำนวนครั้งที่อัปโหลดรูป');
  ups.forEach(u => {
    must(['image/jpeg', 'image/png'].indexOf(u.contentType) >= 0, 'Content-Type ที่ LINE ไม่รับ: ' + u.contentType);
    const b = u.payload.getBytes(), first = b[0] < 0 ? b[0] + 256 : b[0];
    eq(u.contentType, first === 0xFF ? 'image/jpeg' : 'image/png', 'Content-Type ไม่ตรงกับไบต์จริงของรูป');
  });
});

check('เนื้อ JSON ที่ยิงไป LINE จริง ๆ มีพิกัดตรงตามที่ตั้งใจทั้ง 5 ชุด', () => {
  const created = NET.line.filter(c => /\/v2\/bot\/richmenu$/.test(c.url)).map(c => c.payload);
  eq(created.length, 5, 'จำนวน payload ที่สร้างเมนู');
  created.forEach(o => {
    const over = coverage(o.size, o.areas).filter(c => c.n > 1);
    must(over.length === 0, 'เมนู "' + o.name + '" มีปุ่มทับกัน');
    o.areas.forEach(a => {
      must(a.bounds.x + a.bounds.width  <= o.size.width,  'เมนู "' + o.name + '" ปุ่มล้นขอบขวา');
      must(a.bounds.y + a.bounds.height <= o.size.height, 'เมนู "' + o.name + '" ปุ่มล้นขอบล่าง');
    });
  });
  eq(new Set(created.map(o => o.name)).size, 5, 'ชื่อเมนูทั้ง 5 ต้องไม่ซ้ำกัน');
  eq(created.filter(o => o.size.height === 1686).length, 4, 'เมนูหลักต้องมี 4 ชุด');
});

check('กฎ 0 บาท: setupRichMenus ไม่ส่ง push / multicast / broadcast แม้แต่ครั้งเดียว', () => {
  const paid = NET.line.filter(c => /\/message\/(push|multicast|broadcast)/.test(c.url));
  eq(paid.length, 0, 'จำนวนข้อความที่กินโควตา: ' + JSON.stringify(paid.map(p => p.url)));
});

check('ไม่มี lineUserId หลุดออกไปในกล่องแจ้งผลหรือ audit', () => {
  const text = JSON.stringify(ALERTS) + JSON.stringify(AUDITS);
  must(!/\bU[0-9a-f]{32}\b/.test(text), 'พบ lineUserId ในข้อความที่ผู้ใช้เห็น');
});

check('รูปชุดใดชุดหนึ่งหาย → หยุดทันที ไม่ตั้ง default ทับของเดิมด้วยเมนูที่ยังไม่มีรูป', () => {
  resetNet(); LINE_MENUS.length = 0; menuSeq = 0;
  const before = defaultMenuId;
  NET.webCode['main-h'] = 404;                 // ชุดที่ 4 หายไปจาก GitHub Pages
  VARIANTS.forEach(v => SCRIPT_PROPS.deleteProperty(v.img));
  let msg = '';
  try { vm.runInContext('setupRichMenus()', ctx); } catch (e) { msg = e.message; }
  must(msg.indexOf('main-h.jpg') >= 0, 'ควรบอกว่าไฟล์ไหนหาย: ' + msg);
  eq(defaultMenuId, before, 'ห้ามเปลี่ยนเมนูเริ่มต้นเมื่อยังตั้งไม่ครบ');
});

console.log('═══ 09_Triggers.js — installTriggers() ═══\n');

/* ดึงรายชื่อ handler ที่ใช้ "ลบทริกเกอร์เก่า" ออกมาจากซอร์สจริง */
const TRG_SRC = fs.readFileSync(path.join(GAS, '09_Triggers.js'), 'utf8');
const HANDLERS_SRC = (function () {
  const m = /var\s+HANDLERS\s*=\s*\[([\s\S]*?)\]/.exec(TRG_SRC);
  if (!m) return null;
  return (m[1].match(/'([^']+)'|"([^"]+)"/g) || []).map(s => s.slice(1, -1));
})();

check('รายชื่อ handler ที่ใช้ลบทริกเกอร์เก่า อ่านออกและมีครบ', () => {
  must(HANDLERS_SRC && HANDLERS_SRC.length, 'หา var HANDLERS ใน 09_Triggers.js ไม่เจอ');
});

check('ทุกชื่อใน HANDLERS มีฟังก์ชันจริงในโค้ด (สะกดผิด = ทริกเกอร์ตายเงียบ)', () => {
  const bad = (HANDLERS_SRC || []).filter(h => !DECLARED.has(h));
  must(bad.length === 0, 'ไม่พบฟังก์ชันชื่อนี้ในไฟล์ apps-script/*.js: ' + bad.join(', '));
});

check('installTriggers รันได้ และสร้างครบทุกงาน', () => {
  TRIGGERS = []; ALERTS.length = 0;
  vm.runInContext('installTriggers()', ctx);
  must(TRIGGERS.length > 0, 'ไม่ได้สร้างทริกเกอร์เลย');
  eq(ALERTS.length, 1, 'จำนวนกล่องแจ้งผล');
});

check('ทุก handler ที่ถูกตั้งเป็นทริกเกอร์ มีฟังก์ชันจริงในโค้ด', () => {
  const bad = TRIGGERS.map(t => t.getHandlerFunction()).filter(h => !DECLARED.has(h));
  must(bad.length === 0, 'ทริกเกอร์ชี้ไปที่ฟังก์ชันที่ไม่มีอยู่จริง: ' + bad.join(', '));
});

check('ทุก handler ที่สร้าง ต้องอยู่ในรายชื่อที่ใช้ลบด้วย (ไม่งั้นรันซ้ำแล้วซ้อน)', () => {
  const miss = TRIGGERS.map(t => t.getHandlerFunction())
                       .filter(h => (HANDLERS_SRC || []).indexOf(h) < 0);
  must(miss.length === 0, 'สร้างแต่ไม่เคยลบ: ' + [...new Set(miss)].join(', '));
});

check('มีทริกเกอร์ onEdit ผูกกับสเปรดชีตจริง (forSpreadsheet(...).onEdit())', () => {
  const e = TRIGGERS.filter(t => t.getEventType() === 'ON_EDIT');
  eq(e.length, 1, 'จำนวนทริกเกอร์ onEdit');
  eq(e[0].getHandlerFunction(), 'onEditInvalidateCache', 'ชื่อ handler ของ onEdit');
  eq(e[0].getTriggerSource(), 'SPREADSHEETS', 'แหล่งของทริกเกอร์');
  eq(e[0].getTriggerSourceId(), vm.runInContext('CFG.ssId', ctx), 'ผูกกับสเปรดชีตผิดไฟล์');
});

check('ทริกเกอร์ตามเวลาระบุโซนเวลาไทยครบทุกตัว', () => {
  const clocks = TRIGGERS.filter(t => t.getEventType() === 'CLOCK');
  must(clocks.length >= 5, 'ทริกเกอร์ตามเวลาน้อยกว่าที่ควร (' + clocks.length + ')');
  const noTz = clocks.filter(t => t._spec.tz !== 'Asia/Bangkok');
  must(noTz.length === 0, 'ไม่ได้ตั้งโซนเวลา: ' + noTz.map(t => t.getHandlerFunction()).join(', '));
});

check('รันซ้ำครั้งที่สอง ทริกเกอร์ไม่ซ้ำซ้อน', () => {
  const first = TRIGGERS.map(t => t.getHandlerFunction()).sort();
  vm.runInContext('installTriggers()', ctx);
  const second = TRIGGERS.map(t => t.getHandlerFunction()).sort();
  eq(second.length, first.length, 'จำนวนทริกเกอร์หลังรันซ้ำ');
  eq(JSON.stringify(second), JSON.stringify(first), 'รายชื่อทริกเกอร์หลังรันซ้ำ');
  const dup = second.filter((h, i) => second.indexOf(h) !== i);
  must(dup.length === 0, 'มีทริกเกอร์ซ้ำ: ' + [...new Set(dup)].join(', '));
});

check('ทริกเกอร์เก่าของ handler เดิมถูกลบก่อนสร้างใหม่ และของคนอื่นไม่ถูกแตะ', () => {
  TRIGGERS = [];
  (HANDLERS_SRC || []).forEach(h => TRIGGERS.push(makeTrigger(h, 'CLOCK', 'CLOCK', null, { legacy: true })));
  const OUTSIDER = makeTrigger('doGet', 'CLOCK', 'CLOCK', null, { legacy: true });
  TRIGGERS.push(OUTSIDER);
  vm.runInContext('installTriggers()', ctx);
  must(TRIGGERS.indexOf(OUTSIDER) >= 0, 'ไปลบทริกเกอร์ที่ไม่ใช่ของเราด้วย');
  const legacy = TRIGGERS.filter(t => t._spec.legacy && t !== OUTSIDER);
  must(legacy.length === 0, 'ยังเหลือทริกเกอร์เก่า: ' + legacy.map(t => t.getHandlerFunction()).join(', '));
});

check('ไม่ได้ตั้ง SPREADSHEET_ID → ต้องพังพร้อมข้อความที่บอกว่าเป็นเรื่องสเปรดชีต', () => {
  TRIGGERS = [];
  const keep = SCRIPT_PROPS.getProperty('SPREADSHEET_ID');
  SCRIPT_PROPS.deleteProperty('SPREADSHEET_ID');
  let msg = '';
  try { vm.runInContext('installTriggers()', ctx); } catch (e) { msg = e.message; }
  SCRIPT_PROPS.setProperty('SPREADSHEET_ID', keep);
  must(/spreadsheet/i.test(msg), 'ข้อความไม่ได้บอกว่าเป็นเรื่องสเปรดชีต: ' + JSON.stringify(msg));
});

check('กฎ 0 บาท: installTriggers ไม่ยิง LINE API เลย', () => {
  const n = NET.line.length;
  TRIGGERS = [];
  vm.runInContext('installTriggers()', ctx);
  eq(NET.line.length, n, 'installTriggers ไม่ควรเรียก LINE API');
});

/* ═══════════════════════════════════════════════════════════════ */
console.log('');
results.forEach(([s, n, e]) => console.log(`  ${s} ${n}${e ? '\n      → ' + e : ''}`));
const bad = results.filter(r => r[0] === '✗').length;
console.log(bad ? `\n❌ ไม่ผ่าน ${bad} รายการ` : `\n✅ ผ่านทุกรายการ (${results.length} ข้อ)`);
process.exit(bad ? 1 : 0);

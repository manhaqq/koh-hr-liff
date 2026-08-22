/* ทดสอบเส้นทางที่ 14_Media.js แตะ Drive — พื้นที่เดียวกับที่พังมาแล้วสองรอบ */
const fs = require('fs'), vm = require('vm'), path = require('path');
const M = require('./mock.js');
const GAS = path.join(__dirname, '..', 'apps-script');

/* Blob ที่มีเฉพาะเมธอดที่ยืนยันจากเอกสารแล้ว */
function makeBlob(mime, bytes, name) {
  return {
    _mime: mime, _bytes: bytes, _name: name || null,
    getContentType() { return this._mime; },
    setContentType(t) { this._mime = t; return this; },
    getBytes() { return this._bytes; },
    getName() { return this._name; },
    setName(n) { this._name = n; return this; },      // ★ เอกสารยืนยันว่า chainable
    getDataAsString() { return ''; },
    copyBlob() { return makeBlob(this._mime, this._bytes, this._name); }
  };
}

const ctx = vm.createContext(Object.assign({ console, JSON, Math, Date, String, Number,
  Object, Array, Error, TypeError, RegExp, isNaN, parseInt, parseFloat, encodeURIComponent }, M));

ctx.SHEETS = { ANNOUNCEMENTS: 'Announcements' };
ctx.ROLES  = { STAFF:'staff', SUPERVISOR:'supervisor', HR:'hr', ADMIN:'admin' };
ctx.readTable = () => [{ _row: 2, id: 'A-01', title: 'ประกาศทดสอบ', date: '2026-08-22' }];
ctx.updateRow = (t, r, patch) => M.log('  updateRow ' + t + ' แถว ' + r + ' → ' + JSON.stringify(patch));
ctx.appendRow = () => 2;
ctx.todayStr_ = () => '2026-08-22';
ctx.now_ = () => '2026-08-22 12:00:00';
ctx.str_ = v => String(v == null ? '' : v);
ctx.reply = () => {};
ctx.withQuickReply = m => m;
ctx.liffUrl = () => 'https://liff.line.me/x';
ctx.getAnnouncements = () => ctx.readTable();

for (const f of ['15_Drive.js', '14_Media.js']) {
  vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), ctx, { filename: f });
}

const results = [];
function check(name, fn) {
  try { fn(); results.push(['✓', name, '']); }
  catch (e) { results.push(['✗', name, e.message]); }
}

console.log('═══ ทดสอบเส้นทาง Drive ของ 14_Media.js ═══\n');

check('mediaFolderId_() สร้างโฟลเดอร์ได้', () => {
  const id = vm.runInContext('mediaFolderId_()', ctx);
  if (!id) throw new Error('ไม่ได้ id คืนมา');
});

check('driveUpload_ + driveShareAnyoneReader_ (เส้นทางอัปโหลดรูปจริง)', () => {
  ctx.__blob = makeBlob('image/jpeg', new Array(50000).fill(0), null);
  const id = vm.runInContext(
    'var fid = driveUpload_(__blob.setName("ann_test.jpg"), "ann_test.jpg", mediaFolderId_());' +
    'driveShareAnyoneReader_(fid); fid;', ctx);
  if (!id) throw new Error('อัปโหลดไม่คืน id');
  ctx.__uploadedId = id;
});

check('announcementImageUrl_ ออก URL ได้ทั้ง 3 ขนาด', () => {
  const urls = ['MEDIA_W_THUMB','MEDIA_W_HERO','MEDIA_W_FULL'].map(w =>
    vm.runInContext(`announcementImageUrl_("${ctx.__uploadedId}", ${w})`, ctx));
  if (new Set(urls).size !== 3) throw new Error('URL ทั้ง 3 ขนาดไม่ต่างกัน: ' + JSON.stringify(urls));
  if (!urls.every(u => /sz=w\d+/.test(u))) throw new Error('URL ไม่มีพารามิเตอร์ขนาด: ' + urls[0]);
  console.log('    ตัวอย่าง URL:', urls[0]);
});

check('announcementImageUrl_ คืนค่าว่างเมื่อไม่มีรูป', () => {
  const u = vm.runInContext('announcementImageUrl_("", 480)', ctx);
  if (u !== '') throw new Error('ควรคืนค่าว่าง แต่ได้ ' + JSON.stringify(u));
});

check('isOwnedMediaFile_ ยอมรับไฟล์ในโฟลเดอร์ของเรา', () => {
  const ok = vm.runInContext(`isOwnedMediaFile_("${ctx.__uploadedId}", "U_test")`, ctx);
  if (ok !== true) throw new Error('ควรยอมรับไฟล์ของตัวเอง แต่ได้ ' + ok);
});

check('isOwnedMediaFile_ ปฏิเสธไฟล์แปลกปลอมที่ไม่ได้อยู่ในโฟลเดอร์เรา', () => {
  const bad = vm.runInContext('isOwnedMediaFile_("1zzzzAbCdEfGhIjKlMnOpQrStUvWxYz_-99", "U_test")', ctx);
  if (bad !== false) throw new Error('ควรปฏิเสธ แต่ได้ ' + bad);
});

check('driveTrash_ ถอนรูปได้', () => {
  vm.runInContext(`driveTrash_("${ctx.__uploadedId}")`, ctx);
  if (!M.DRIVE[ctx.__uploadedId].trashed) throw new Error('ไม่ได้ถูกทิ้งจริง');
});

check('driveList_ ไม่เห็นไฟล์ที่ถูกทิ้งแล้ว', () => {
  const fid = vm.runInContext('mediaFolderId_()', ctx);
  const list = vm.runInContext(`driveList_("${fid}", "")`, ctx);
  if (list.some(f => f.id === ctx.__uploadedId)) throw new Error('ยังเห็นไฟล์ที่ทิ้งแล้ว');
});

check('driveReady_ ให้ error ที่อ่านรู้เรื่องเมื่อยังไม่เปิด Drive API', () => {
  const c2 = vm.createContext(Object.assign({ console, JSON, String, Object, Error }, M, { Drive: undefined }));
  vm.runInContext(fs.readFileSync(path.join(GAS, '15_Drive.js'), 'utf8'), c2);
  try { vm.runInContext('driveReady_()', c2); throw new Error('ควรจะ throw แต่ไม่ throw'); }
  catch (e) {
    if (!/Drive API/.test(e.message)) throw new Error('ข้อความไม่ชัดเจน: ' + e.message);
  }
});

M.LOG.forEach(l => console.log(l));
console.log('');
results.forEach(([s, n, e]) => console.log(`  ${s} ${n}${e ? '\n      → ' + e : ''}`));
const bad = results.filter(r => r[0] === '✗').length;
console.log(bad ? `\n❌ ไม่ผ่าน ${bad} รายการ` : '\n✅ ผ่านทุกรายการ');
process.exit(bad ? 1 : 0);

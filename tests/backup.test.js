const fs = require('fs'), vm = require('vm'), path = require('path');
const M = require('./mock.js');
const GAS = path.join(__dirname, '..', 'apps-script');

const ctx = vm.createContext(Object.assign({ console, JSON, Math, Date, String, Number,
  Object, Array, Error, TypeError, RegExp, isNaN, parseInt, parseFloat, encodeURIComponent }, M));

// โหลดไฟล์จริงจากโปรเจ็ค ไม่แก้อะไรเลย
for (const f of ['15_Drive.js', '12_Backup.js']) {
  vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), ctx, { filename: f });
}

console.log('═══ รัน backupDatabase() ครั้งที่ 1 ═══');
let r1;
try { r1 = vm.runInContext('backupDatabase()', ctx); }
catch (e) { console.log('❌ FAILED:', e.message); process.exit(1); }
M.LOG.forEach(l => console.log(l)); M.LOG.length = 0;
console.log('  ผลลัพธ์:', JSON.stringify(r1));

const dest = M.FILES_BY_SS[r1.id];
const names = dest.getSheets().map(s => s.getName());
console.log('  แท็บในสำเนา:', names.length, 'แท็บ');
console.log('  ลำดับตรงต้นฉบับไหม:', JSON.stringify(names) === JSON.stringify(M.SRC_TABS) ? '✓ ตรง' : '✗ ไม่ตรง\n    ได้: ' + JSON.stringify(names));
console.log('  แท็บกันชนถูกลบไหม:', names.some(n => n.startsWith('__tmp__')) ? '✗ ยังอยู่' : '✓ ลบแล้ว');
console.log('  ชื่อ "Copy of" หลงเหลือไหม:', names.some(n => n.startsWith('Copy of')) ? '✗ มี' : '✓ ไม่มี');

console.log('\n═══ รันซ้ำอีก 9 ครั้ง เพื่อทดสอบการลบสำเนาเก่า (เก็บ 8) ═══');
for (let i = 0; i < 9; i++) {
  const day = String(10 + i).padStart(2, '0');
  ctx.Utilities.formatDate = () => '2026-08-' + day + '_1200';
  try { vm.runInContext('backupDatabase()', ctx); }
  catch (e) { console.log(`❌ รอบที่ ${i+2} FAILED:`, e.message); process.exit(1); }
}
M.LOG.length = 0;
const folderId = M.PROPS.BACKUP_FOLDER_ID;
const alive = Object.values(M.DRIVE).filter(f => !f.trashed && f.name.startsWith('HRHub_'));
const trashed = Object.values(M.DRIVE).filter(f => f.trashed);
console.log('  สำเนาที่ยังอยู่:', alive.length, alive.length === 8 ? '✓ ตรงตาม BACKUP_KEEP' : '✗ ควรเป็น 8');
console.log('  ถูกทิ้งลงถังขยะ:', trashed.length);
console.log('  โฟลเดอร์ถูกสร้างครั้งเดียว:', Object.values(M.DRIVE).filter(f=>f.mimeType.endsWith('folder')).length === 1 ? '✓' : '✗ สร้างซ้ำ');

console.log('\n═══ โฟลเดอร์ถูกลบไป แล้วรันใหม่ (ต้องสร้างใหม่ ไม่พัง) ═══');
M.DRIVE[folderId].trashed = true; delete M.DRIVE[folderId];
try { const r = vm.runInContext('backupDatabase()', ctx); console.log('  ✓ ผ่าน — สร้างโฟลเดอร์ใหม่', r.folderId); }
catch (e) { console.log('  ❌ FAILED:', e.message); process.exit(1); }

console.log('\n═══ showBackupFolder() ═══');
M.LOG.length = 0;
try { vm.runInContext('showBackupFolder()', ctx); M.LOG.forEach(l => console.log(l)); }
catch (e) { console.log('  ❌ FAILED:', e.message); process.exit(1); }

console.log('\n✅ ผ่านทุกกรณี');

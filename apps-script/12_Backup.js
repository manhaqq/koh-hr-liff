/*******************************************************************
 * โก๋ในซอย HR Hub — 12_Backup.gs
 * สำรองฐานข้อมูลอัตโนมัติ
 *
 * ★ ทำไมถึงจำเป็น
 *   ประวัติเวอร์ชันของ Google Sheets "ไม่ใช่" การสำรองข้อมูล
 *   เพราะมันอยู่ในไฟล์เดียวกันและตายไปพร้อมกับบัญชี ถ้าบัญชีถูกระงับ
 *   ถูกลบ หรือคนที่ถือบัญชีลาออก ข้อมูลหายทั้งหมดพร้อมกัน
 *
 *   กฎหมายแรงงานไทยกำหนดให้เก็บทะเบียนลูกจ้างอย่างน้อย 2 ปี
 *   ระบบจึงต้องมีสำเนาที่แยกออกจากไฟล์ต้นทาง
 *
 * ★ ระดับการสำรอง (ยิ่งหลายชั้นยิ่งปลอดภัย)
 *   ชั้นที่ 1  สำเนารายสัปดาห์ใน Drive     — ตัวนี้ (อัตโนมัติ)
 *   ชั้นที่ 2  ดาวน์โหลดลงเครื่องรายไตรมาส  — ทำมือ ดูขั้นตอนใน docs/
 *   ชั้นที่ 3  เจ้าของไฟล์สำรอง             — ★ ยังไม่ได้ทำ ดูหมายเหตุท้ายไฟล์
 *******************************************************************/

var BACKUP_FOLDER_PROP = 'BACKUP_FOLDER_ID';
var BACKUP_KEEP        = 8;      /* เก็บ 8 สัปดาห์ ≈ 2 เดือน */

function backupFolder_() {
  var id = cfg(BACKUP_FOLDER_PROP);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* ถูกลบไปแล้ว สร้างใหม่ */ }
  }
  var f = DriveApp.createFolder('สำรองฐานข้อมูล HR Hub');
  P.setProperty(BACKUP_FOLDER_PROP, f.getId());
  return f;
}

/**
 * สร้างสำเนาฐานข้อมูลลง Drive แล้วลบสำเนาเก่าที่เกินโควตา
 * เรียกอัตโนมัติทุกสัปดาห์ และเรียกมือได้จากเมนู
 */
function backupDatabase() {
  var folder = backupFolder_();
  var stamp  = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd_HHmm');
  var name   = 'HRHub_' + stamp;

  /* ★ ใช้ SpreadsheetApp.copy ไม่ใช่ DriveApp.makeCopy โดยตั้งใจ
     scope ของสคริปต์คือ drive.file ซึ่งให้สิทธิ์เฉพาะไฟล์ที่สคริปต์สร้างเอง
     จึงเปิดไฟล์ต้นฉบับผ่าน DriveApp ไม่ได้ แต่ SpreadsheetApp เปิดได้
     ด้วย scope spreadsheets ที่มีอยู่แล้ว ส่วนสำเนาที่ได้สคริปต์เป็นคนสร้าง
     จึงย้ายเข้าโฟลเดอร์ด้วย DriveApp ได้ตามปกติ */
  var copy = DriveApp.getFileById(SpreadsheetApp.openById(CFG.ssId).copy(name).getId());
  copy.moveTo(folder);

  /* ลบสำเนาเก่าที่เกิน BACKUP_KEEP — เรียงตามวันที่สร้าง เก่าสุดออกก่อน */
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('HRHub_') === 0) files.push(f);
  }
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  var removed = 0;
  for (var i = BACKUP_KEEP; i < files.length; i++) {
    files[i].setTrashed(true);     /* ทิ้งลงถังขยะ ไม่ลบถาวร กู้ได้ 30 วัน */
    removed++;
  }

  audit(actor_(), 'BACKUP', name, 'เก็บไว้ ' + Math.min(files.length, BACKUP_KEEP) + ' ชุด, ทิ้งเก่า ' + removed + ' ชุด');
  return { name: name, url: copy.getUrl(), kept: Math.min(files.length, BACKUP_KEEP), removed: removed };
}

/** เมนู: สำรองข้อมูลเดี๋ยวนี้ */
function backupDatabaseUi() {
  var r = backupDatabase();
  alert_('สำรองข้อมูลแล้ว ✅',
    'ไฟล์: ' + r.name +
    '\nเก็บสำเนาไว้ ' + r.kept + ' ชุด' + (r.removed ? (' (ทิ้งของเก่า ' + r.removed + ' ชุด)') : '') +
    '\n\nอยู่ในโฟลเดอร์ "สำรองฐานข้อมูล HR Hub" ใน Google Drive' +
    '\n\n⚠️ สำเนานี้ยังอยู่ในบัญชี Google เดียวกันกับต้นฉบับ' +
    '\nทุกไตรมาสควรดาวน์โหลดลงเครื่องด้วย (ไฟล์ > ดาวน์โหลด > .xlsx)' +
    '\nเพราะถ้าบัญชีมีปัญหา สำเนาใน Drive ก็หายไปพร้อมกัน');
}

/** เมนู: เปิดโฟลเดอร์สำรองข้อมูล */
function showBackupFolder() {
  var f = backupFolder_();
  var files = [], it = f.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  alert_('สำเนาที่มีอยู่ (' + files.length + ')',
    files.slice(0, 12).map(function (x) {
      return '• ' + x.getName() + '  (' + Utilities.formatDate(x.getDateCreated(), CFG.TZ, 'd MMM yyyy') + ')';
    }).join('\n') +
    '\n\nโฟลเดอร์: ' + f.getUrl());
}

/*******************************************************************
 * ⚠️ สิ่งที่ระบบสำรองนี้ "ยังแก้ให้ไม่ได้" — ต้องจัดการโดยเจ้าของ
 *
 * ทั้งชีต สคริปต์ ทริกเกอร์ โควตาอีเมล และโฟลเดอร์สำรองข้อมูล
 * อยู่ในบัญชี Gmail ส่วนบุคคลบัญชีเดียวทั้งหมด
 * บัญชีส่วนบุคคลไม่มีผู้ดูแลระดับองค์กร ไม่มีผู้ติดต่อสำรอง
 * และถ้าบัญชีถูกระงับหรือคนที่ถือลาออก ร้านจะไม่มีทางเข้าถึงข้อมูลได้อีกเลย
 *
 * ควรทำอย่างน้อยข้อใดข้อหนึ่ง
 *   1. เพิ่มบัญชีที่สองเป็นเจ้าของร่วมของทั้งชีตและ Apps Script project
 *   2. ย้ายไปใช้ Google Workspace ของร้าน ซึ่งกู้บัญชีได้จากผู้ดูแล
 *   3. ตั้งผู้ติดต่อสำรอง (Recovery contact) ในบัญชี Google
 *******************************************************************/

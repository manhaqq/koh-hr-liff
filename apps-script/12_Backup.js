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
  return driveFolderId_('สำรองฐานข้อมูล HR Hub', BACKUP_FOLDER_PROP);
}

/**
 * สร้างสำเนาฐานข้อมูลลง Drive แล้วลบสำเนาเก่าที่เกินโควตา
 * เรียกอัตโนมัติทุกสัปดาห์ และเรียกมือได้จากเมนู
 */
function backupDatabase() {
  var folderId = backupFolder_();
  var stamp    = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd_HHmm');
  var name     = 'HRHub_' + stamp;

  /* ★ คัดลอกด้วย SpreadsheetApp ไม่ใช่ Drive
     ไฟล์ต้นฉบับ "ไม่ได้" ถูกสร้างโดยสคริปต์นี้ สิทธิ์ drive.file จึงเปิดไฟล์นั้นไม่ได้
     แต่ SpreadsheetApp เปิดได้ด้วยสิทธิ์ spreadsheets ที่มีอยู่แล้ว
     ส่วนสำเนาที่ได้ สคริปต์เป็นคนสร้าง จึงย้ายเข้าโฟลเดอร์ต่อได้ */
  var copyId = SpreadsheetApp.openById(CFG.ssId).copy(name).getId();
  driveMoveTo_(copyId, folderId);

  /* ลบสำเนาเก่าที่เกิน BACKUP_KEEP — driveList_ เรียงจากใหม่ไปเก่าให้แล้ว */
  var files = driveList_(folderId, 'HRHub_');
  var removed = 0;
  for (var i = BACKUP_KEEP; i < files.length; i++) {
    driveTrash_(files[i].id);      /* ทิ้งลงถังขยะ ไม่ลบถาวร กู้ได้ 30 วัน */
    removed++;
  }

  var kept = Math.min(files.length, BACKUP_KEEP);
  audit(actor_(), 'BACKUP', name, 'เก็บไว้ ' + kept + ' ชุด, ทิ้งเก่า ' + removed + ' ชุด');
  return { name: name, id: copyId, folderId: folderId, kept: kept, removed: removed };
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
  var folderId = backupFolder_();
  var files = driveList_(folderId, 'HRHub_');
  alert_('สำเนาที่มีอยู่ (' + files.length + ')',
    (files.length
      ? files.slice(0, 12).map(function (x) {
          return '• ' + x.name + '  (' + String(x.createdTime).slice(0, 10) + ')';
        }).join('\n')
      : 'ยังไม่มีสำเนา — กด "สำรองข้อมูลเดี๋ยวนี้" เพื่อสร้างชุดแรก') +
    '\n\nโฟลเดอร์: https://drive.google.com/drive/folders/' + folderId);
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

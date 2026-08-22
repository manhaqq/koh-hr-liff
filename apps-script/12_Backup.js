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

  /* ★★ ลำดับตรงนี้สำคัญมาก และเคยทำผิดมาแล้ว
   *
   *  สิทธิ์ drive.file ให้ Drive API เห็นเฉพาะไฟล์ที่ "สร้างผ่าน Drive API เอง"
   *  เท่านั้น ไฟล์ที่ SpreadsheetApp.copy() สร้างขึ้นไม่นับอยู่ในชุดนั้น
   *  ต่อให้เพิ่งสร้างเสร็จหมาด ๆ Drive API ก็ยังตอบว่า File not found
   *  ทำให้ย้ายเข้าโฟลเดอร์ไม่ได้ ลบของเก่าไม่ได้ และไล่รายการก็ไม่เห็น
   *
   *  จึงต้องกลับด้าน: ให้ Drive API สร้างไฟล์เปล่าขึ้นมาก่อน (แอปเป็นเจ้าของแน่นอน)
   *  แล้วค่อยคัดลอกแท็บเข้าไปด้วย SpreadsheetApp ซึ่งใช้สิทธิ์ spreadsheets ที่มีอยู่แล้ว
   *  วิธีนี้ได้ทั้งรูปแบบและสูตรครบ และควบคุมวงจรชีวิตไฟล์ได้เต็มที่ */
  var destId = driveReady_().Files.create(
    { name: name, mimeType: MimeType.GOOGLE_SHEETS, parents: [folderId] },
    null, { fields: 'id' }).id;

  var src  = SpreadsheetApp.openById(CFG.ssId);
  var dest = SpreadsheetApp.openById(destId);

  /* ชีตเปล่าที่เพิ่งสร้างมีแท็บตั้งต้นติดมา 1 แท็บ เปลี่ยนชื่อกันชนก่อน
     เผื่อฐานข้อมูลจริงมีแท็บชื่อเดียวกัน แล้วค่อยลบทิ้งตอนท้าย */
  var placeholder = dest.getSheets()[0];
  placeholder.setName('__tmp__' + stamp);

  /* copyTo() ต่อท้ายเสมอ การคัดลอกตามลำดับต้นฉบับจึงได้ลำดับที่ถูกอยู่แล้ว
     หลังลบแท็บกันชนทิ้ง ไม่ต้องสั่งเรียงลำดับเพิ่ม
     ★ Sheet ไม่มีเมธอด setIndex() — การเรียงต้องใช้ activate() คู่กับ
       Spreadsheet.moveActiveSheet() ซึ่งไม่จำเป็นเลยในกรณีนี้ */
  var tabs = src.getSheets(), copied = 0;
  for (var i = 0; i < tabs.length; i++) {
    var c = tabs[i].copyTo(dest);
    c.setName(tabs[i].getName());
    copied++;
  }
  if (copied > 0) dest.deleteSheet(placeholder);

  /* ลบสำเนาเก่าที่เกิน BACKUP_KEEP — driveList_ เรียงจากใหม่ไปเก่าให้แล้ว
     และเห็นเฉพาะไฟล์ที่สคริปต์สร้างเอง จึงไม่มีทางไปแตะไฟล์ของคนอื่น */
  var files = driveList_(folderId, 'HRHub_');
  var removed = 0;
  for (var k = BACKUP_KEEP; k < files.length; k++) {
    driveTrash_(files[k].id);      /* ทิ้งลงถังขยะ ไม่ลบถาวร กู้ได้ 30 วัน */
    removed++;
  }

  var kept = Math.min(files.length, BACKUP_KEEP);
  audit(actor_(), 'BACKUP', name, copied + ' แท็บ, เก็บไว้ ' + kept + ' ชุด, ทิ้งเก่า ' + removed + ' ชุด');
  return { name: name, id: destId, folderId: folderId, tabs: copied, kept: kept, removed: removed };
}

/** เมนู: สำรองข้อมูลเดี๋ยวนี้ */
function backupDatabaseUi() {
  var r = backupDatabase();
  alert_('สำรองข้อมูลแล้ว ✅',
    'ไฟล์: ' + r.name + '  (' + r.tabs + ' แท็บ)' +
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

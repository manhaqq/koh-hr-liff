/*******************************************************************
 * โก๋ในซอย HR Hub — 15_Drive.gs
 * ตัวกลางเรียก Google Drive
 *
 * ★ ทำไมต้องมีไฟล์นี้ ทั้งที่ Apps Script มี DriveApp ให้อยู่แล้ว
 *
 *   DriveApp เป็น API รุ่นเก่าที่หยาบมาก แทบทุกคำสั่งของมัน — แม้แต่
 *   การสร้างโฟลเดอร์ของตัวเอง — บังคับขอสิทธิ์
 *       https://www.googleapis.com/auth/drive
 *   ซึ่งคือ "อ่านและเขียนไฟล์ทุกไฟล์ใน Google Drive ของเจ้าของบัญชี"
 *
 *   เว็บแอปนี้เปิดให้เรียกแบบไม่ระบุตัวตน (ANYONE_ANONYMOUS) และ Drive
 *   ของเจ้าของบัญชีมีทั้งฐานข้อมูลพนักงานและไฟล์ส่วนตัวอื่น ๆ อยู่ด้วย
 *   การให้สิทธิ์กว้างขนาดนั้นกับสคริปต์ที่ใครก็ยิงเข้ามาได้ ไม่คุ้มกันเลย
 *
 *   Drive API v3 (Advanced Service) ทำงานกับสิทธิ์ drive.file ได้
 *   ซึ่งแปลว่า "เข้าถึงได้เฉพาะไฟล์ที่สคริปต์นี้สร้างเอง" — พอดีกับที่ต้องใช้
 *   คือโฟลเดอร์สำรองข้อมูล ไฟล์สำเนา และรูปประกาศ ล้วนเป็นของที่สคริปต์สร้างเอง
 *
 *   ต้องเปิด Advanced Drive Service ใน appsscript.json ด้วย (ทำไว้แล้ว)
 *******************************************************************/

var MIME_FOLDER = 'application/vnd.google-apps.folder';

/** เช็กว่าเปิด Advanced Drive Service แล้วหรือยัง — ให้ error ที่อ่านรู้เรื่องแทนคำว่า Drive is not defined */
function driveReady_() {
  if (typeof Drive === 'undefined' || !Drive || !Drive.Files) {
    throw new Error(
      'ยังไม่ได้เปิด Drive API ใน Apps Script\n\n' +
      'เปิด Apps Script editor → เมนู Services (＋) ด้านซ้าย → เลือก "Drive API"\n' +
      'ตั้ง Identifier เป็น Drive และ Version เป็น v3 → Add\n' +
      'แล้วกดบันทึก จากนั้นลองใหม่');
  }
  return Drive;
}

/**
 * หาโฟลเดอร์จาก id ที่จำไว้ ถ้าไม่มีหรือถูกลบไปแล้วให้สร้างใหม่
 * @param {string} name    ชื่อโฟลเดอร์
 * @param {string} propKey คีย์ใน Script Properties ที่ใช้จำ id
 * @return {string} folderId
 */
function driveFolderId_(name, propKey) {
  driveReady_();
  var id = cfg(propKey);
  if (id) {
    try {
      var f = Drive.Files.get(id, { fields: 'id,trashed' });
      if (f && !f.trashed) return f.id;
    } catch (e) { /* ถูกลบถาวรหรือเข้าถึงไม่ได้แล้ว — สร้างใหม่ */ }
  }
  var created = Drive.Files.create({ name: name, mimeType: MIME_FOLDER }, null, { fields: 'id' });
  P.setProperty(propKey, created.id);
  return created.id;
}

/** อัปโหลด blob เข้าโฟลเดอร์ คืน id */
function driveUpload_(blob, name, folderId) {
  driveReady_();
  var res = Drive.Files.create(
    { name: name, parents: folderId ? [folderId] : undefined },
    blob,
    { fields: 'id' });
  return res.id;
}

/** ย้ายไฟล์เข้าโฟลเดอร์ (ใช้กับไฟล์ที่สคริปต์สร้างเองเท่านั้น) */
function driveMoveTo_(fileId, folderId) {
  driveReady_();
  var cur = Drive.Files.get(fileId, { fields: 'parents' });
  var old = (cur.parents || []).join(',');
  Drive.Files.update({}, fileId, null, {
    addParents: folderId,
    removeParents: old || undefined,
    fields: 'id,parents'
  });
}

/**
 * รายชื่อไฟล์ในโฟลเดอร์ เรียงจากใหม่ไปเก่า
 * ★ ภายใต้สิทธิ์ drive.file รายการนี้จะเห็นเฉพาะไฟล์ที่สคริปต์สร้างเอง
 *   ซึ่งเป็นสิ่งที่ต้องการพอดี — ไฟล์ที่คนอื่นเอามาวางในโฟลเดอร์เดียวกันจะไม่ถูกแตะ
 */
function driveList_(folderId, namePrefix) {
  driveReady_();
  var q = "'" + folderId + "' in parents and trashed = false";
  if (namePrefix) q += " and name contains '" + String(namePrefix).replace(/'/g, "\\'") + "'";
  var out = [], token = null;
  do {
    var res = Drive.Files.list({
      q: q, orderBy: 'createdTime desc', pageSize: 100,
      fields: 'nextPageToken, files(id,name,createdTime)', pageToken: token
    });
    out = out.concat(res.files || []);
    token = res.nextPageToken;
  } while (token && out.length < 500);
  return out;
}

/** ทิ้งลงถังขยะ (ไม่ลบถาวร — กู้ได้อีก 30 วัน) */
function driveTrash_(fileId) {
  driveReady_();
  Drive.Files.update({ trashed: true }, fileId);
}

/**
 * เปิดให้ใครที่มีลิงก์เปิดดูได้
 * ★ จำเป็นสำหรับรูปในประกาศ เพราะเซิร์ฟเวอร์ของ LINE ต้องโหลดรูปเอง
 *   โดยไม่ได้ล็อกอินบัญชีของร้าน ถ้าไม่เปิด รูปจะไม่ขึ้นเลยทั้งระบบ
 *   ข้อแลกเปลี่ยนนี้หลบไม่ได้ จึงต้องมีกฎห้ามแนบเอกสารส่วนบุคคลกำกับไว้ในคู่มือ HR
 */
function driveShareAnyoneReader_(fileId) {
  driveReady_();
  Drive.Permissions.create({ role: 'reader', type: 'anyone' }, fileId, { fields: 'id' });
}

/** ดึงไฟล์เป็น blob (ได้เฉพาะไฟล์ที่สคริปต์สร้างเอง) */
function driveBlob_(fileId, mimeType) {
  driveReady_();
  var token = ScriptApp.getOAuthToken();
  var res = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media',
    { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('อ่านไฟล์จาก Drive ไม่สำเร็จ (' + res.getResponseCode() + ') — ' +
                    'สิทธิ์ drive.file เข้าถึงได้เฉพาะไฟล์ที่สคริปต์นี้สร้างเอง');
  }
  var b = res.getBlob();
  if (mimeType) b = b.setContentType(mimeType);
  return b;
}

/*******************************************************************
 * โก๋ในซอย HR Hub — 08_RichMenu.gs
 * สร้าง / อัปโหลด / ผูก Rich Menu อัตโนมัติ
 *
 * ระบบใช้เมนูทั้งหมด 5 ชุด
 *   guest    ผู้ที่ยังไม่ยืนยันตัวตน — เห็นแค่ปุ่มยืนยันตัวตน
 *   main     พนักงานปกติ ไม่มีอะไรใหม่
 *   main-n   มีประกาศใหม่        (จุดแดงที่ช่อง 1)
 *   main-h   HR ตอบเรื่องแล้ว     (จุดแดงที่ช่อง 4)
 *   main-nh  มีทั้งสองอย่าง
 *
 * ★ การสลับเมนู 4 แบบนี้คือ "ระบบแจ้งเตือน" ของเรา
 *   และไม่ถูกนับในโควตา 300 ข้อความ/เดือนของแพ็กเกจฟรี
 *
 * ก่อนรัน setupRichMenus() ต้องตั้ง Script Properties เพิ่ม 5 ตัว:
 *   RICHMENU_IMG_GUEST_FILEID
 *   RICHMENU_IMG_MAIN_FILEID
 *   RICHMENU_IMG_MAIN_N_FILEID
 *   RICHMENU_IMG_MAIN_H_FILEID
 *   RICHMENU_IMG_MAIN_NH_FILEID
 * (File ID คือส่วนกลางของลิงก์ Drive .../file/d/<FILE_ID>/view)
 *******************************************************************/

/* ---------- โครงเมนูหลัก 4 ช่อง (2500 x 1686) ---------- */
function richMenuMainObject_(name) {
  var halfW = 1250, halfH = 843;
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: name || 'KohNaiSoi-HR-Main',
    chatBarText: 'เมนูพนักงาน',
    areas: [
      { bounds: { x: 0, y: 0, width: halfW, height: halfH },
        action: { type: 'postback', label: 'ประกาศและข่าวสาร',
                  data: 'action=news', displayText: 'ประกาศและข่าวสาร', inputOption: 'closeRichMenu' } },
      { bounds: { x: halfW, y: 0, width: halfW, height: halfH },
        action: { type: 'postback', label: 'คู่มือและสวัสดิการ',
                  data: 'action=handbook', displayText: 'คู่มือและสวัสดิการ', inputOption: 'closeRichMenu' } },
      { bounds: { x: 0, y: halfH, width: halfW, height: halfH },
        action: { type: 'postback', label: 'ตารางงาน',
                  data: 'action=today_shift', displayText: 'ตารางงานของฉัน', inputOption: 'closeRichMenu' } },
      { bounds: { x: halfW, y: halfH, width: halfW, height: halfH },
        action: { type: 'postback', label: 'ติดต่อ HR',
                  data: 'action=hr_menu', displayText: 'ติดต่อ HR', inputOption: 'closeRichMenu' } }
    ]
  };
}

/* ---------- เมนูผู้ที่ยังไม่ยืนยันตัวตน (2500 x 843) ---------- */
function richMenuGuestObject_() {
  return {
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'KohNaiSoi-HR-Guest-v2',
    chatBarText: 'ยืนยันตัวตน',
    areas: [
      { bounds: { x: 0, y: 0, width: 1666, height: 843 },
        action: { type: 'uri', label: 'ยืนยันตัวตนพนักงาน', uri: liffUrl(CFG.liff.verify) } },
      { bounds: { x: 1666, y: 0, width: 834, height: 843 },
        action: { type: 'postback', label: 'วิธีใช้งาน', data: 'action=how_to', displayText: 'วิธีใช้งาน' } }
    ]
  };
}

/* ================================================================
 * รันตัวนี้ตัวเดียวจบ
 * ================================================================ */
var MENU_VARIANTS = [
  { key: 'GUEST',   prop: 'RICHMENU_ID_GUEST',   img: 'RICHMENU_IMG_GUEST_FILEID',   label: 'เมนูยืนยันตัวตน' },
  { key: 'MAIN',    prop: 'RICHMENU_ID_MAIN',    img: 'RICHMENU_IMG_MAIN_FILEID',    label: 'เมนูหลัก (ปกติ)' },
  { key: 'MAIN_N',  prop: 'RICHMENU_ID_MAIN_N',  img: 'RICHMENU_IMG_MAIN_N_FILEID',  label: 'เมนูหลัก + จุดแดงประกาศ' },
  { key: 'MAIN_H',  prop: 'RICHMENU_ID_MAIN_H',  img: 'RICHMENU_IMG_MAIN_H_FILEID',  label: 'เมนูหลัก + จุดแดง HR' },
  { key: 'MAIN_NH', prop: 'RICHMENU_ID_MAIN_NH', img: 'RICHMENU_IMG_MAIN_NH_FILEID', label: 'เมนูหลัก + จุดแดงทั้งสอง' }
];

function setupRichMenus() {
  var missing = MENU_VARIANTS.filter(function (v) { return !cfg(v.img); });
  if (missing.length) {
    alert_('ยังไม่ได้ตั้งค่ารูป',
      'กรุณาอัปโหลดภาพเมนูขึ้น Google Drive แล้วใส่ File ID ใน Script Properties:\n\n' +
      missing.map(function (v) { return '• ' + v.img + '  (' + v.label + ')'; }).join('\n'));
    return;
  }

  var log = [];
  MENU_VARIANTS.forEach(function (v) {
    var obj = (v.key === 'GUEST') ? richMenuGuestObject_()
                                  : richMenuMainObject_('KohNaiSoi-HR-' + v.key + '-v2');
    var id = createRichMenu(obj);
    uploadRichMenuImage(id, DriveApp.getFileById(cfg(v.img)).getBlob(), 'image/png');
    P.setProperty(v.prop, id);
    log.push(v.label + ': ' + id);
    Utilities.sleep(300);
  });

  /* ตั้งเมนูผู้เยี่ยมชมเป็นค่าเริ่มต้น — ด่านกันคนนอก */
  setDefaultRichMenu(cfg('RICHMENU_ID_GUEST'));
  log.push('ตั้งเมนูยืนยันตัวตนเป็นค่าเริ่มต้นแล้ว');

  /* เปิดเมนูเต็มให้พนักงานที่ยืนยันแล้ว (ล้างจุดแดงทั้งหมดไปด้วย) */
  var n = resetAllBadges();
  log.push('เปิดเมนูเต็มให้พนักงาน ' + n + ' คน');

  audit(actor_(), 'RICHMENU_SETUP', '', log.join(' | '));
  alert_('ติดตั้ง Rich Menu สำเร็จ ✅', log.join('\n') +
    '\n\nคนนอกที่แอดเข้ามาใหม่จะเห็นเฉพาะปุ่ม "ยืนยันตัวตนพนักงาน" เท่านั้น' +
    '\nการสลับเมนู 4 แบบใช้แจ้งเตือนแทนการส่งข้อความ — ไม่กินโควตา');
}

function showRichMenus() {
  var list = listRichMenus();
  if (!list.length) { alert_('ยังไม่มี Rich Menu', 'กรุณารัน "สร้าง/อัปเดต Rich Menu ทั้งหมด"'); return; }
  var inUse = {};
  MENU_VARIANTS.forEach(function (v) { if (cfg(v.prop)) inUse[cfg(v.prop)] = v.label; });
  alert_('Rich Menu ทั้งหมด (' + list.length + ')',
    list.map(function (m) {
      return '• ' + m.name + (inUse[m.richMenuId] ? ('  ← ' + inUse[m.richMenuId]) : '  (ไม่ได้ใช้)') +
             '\n  ' + m.richMenuId;
    }).join('\n'));
}

function cleanupRichMenus() {
  var keep = MENU_VARIANTS.map(function (v) { return cfg(v.prop); }).filter(Boolean);
  var list = listRichMenus().filter(function (m) { return keep.indexOf(m.richMenuId) < 0; });
  if (!list.length) { alert_('สะอาดอยู่แล้ว', 'ไม่มีเมนูเก่าค้างอยู่'); return; }
  if (!confirm_('ลบเมนูเก่า', 'จะลบ Rich Menu ที่ไม่ได้ใช้ ' + list.length + ' รายการ\nดำเนินการเลยหรือไม่?')) return;
  list.forEach(function (m) { try { deleteRichMenu(m.richMenuId); } catch (e) { console.error(e); } });
  alert_('ลบแล้ว', 'ลบเมนูเก่า ' + list.length + ' รายการ');
}

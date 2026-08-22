/*******************************************************************
 * โก๋ในซอย HR Hub — 08_RichMenu.gs
 * สร้าง / อัปโหลด / ผูก Rich Menu อัตโนมัติ
 *
 * ระบบใช้เมนูทั้งหมด 5 ชุด
 *   guest    ผู้ที่ยังไม่ยืนยันตัวตน — เห็นแค่ปุ่มยืนยันตัวตน
 *   main     พนักงานปกติ ไม่มีอะไรใหม่
 *   main-n   มีประกาศใหม่        (จุดแดงที่ปุ่มประกาศ)
 *   main-h   HR ตอบเรื่องแล้ว     (จุดแดงที่การ์ดติดต่อ HR)
 *   main-nh  มีทั้งสองอย่าง
 *
 * ★ การสลับเมนู 4 แบบนี้คือ "ระบบแจ้งเตือน" ของเรา
 *   และไม่ถูกนับในโควตา 300 ข้อความ/เดือนของแพ็กเกจฟรี
 *
 * ---------------------------------------------------------------
 * ภาพเมนูดึงจาก GitHub Pages โดยตรง ไม่ต้องตั้ง File ID ทีละไฟล์
 *   https://manhaqq.github.io/koh-hr-liff/richmenu/<ชื่อ>.jpg
 * แก้ภาพ: วางไฟล์ออกแบบใหม่ที่ richmenu/src/base.png ในโปรเจ็ค
 *   แล้วรัน `python3 richmenu/build.py` → commit → push
 *   จากนั้นกดเมนู "สร้าง/อัปเดต Rich Menu ทั้งหมด" ในชีต
 *
 * เปลี่ยนที่เก็บภาพได้ด้วย Script Property (ไม่บังคับ)
 *   RICHMENU_IMG_BASE_URL   ค่าเริ่มต้นคือลิงก์ GitHub Pages ข้างบน
 * หรือถ้าอยากกลับไปใช้ Google Drive ให้ตั้ง File ID รายตัวแบบเดิม
 *   RICHMENU_IMG_GUEST_FILEID / _MAIN_ / _MAIN_N_ / _MAIN_H_ / _MAIN_NH_
 *******************************************************************/

/* ---------- โครงเมนูหลัก 4 ช่อง (2500 x 1686) ---------- */
function richMenuMainObject_(name) {
  /* เลย์เอาต์ของภาพใหม่ (2500 x 1686)
   *   ┌───────────────┬─────────────────┐
   *   │  โลโก้ (ไม่กด) │ ประกาศและข่าวสาร │   y 0 → 860
   *   ├───────┬───────┼─────────────────┤
   *   │ คู่มือ │ ตาราง │    ติดต่อ HR    │   y 860 → 1686
   *   └───────┴───────┴─────────────────┘
   * พิกัดอ่านมาจากภาพจริง อย่าแก้เป็นตาราง 2x2 แบบเดิม
   * ไม่งั้นปุ่มจะไม่ตรงกับรูป */
  var SPLIT_Y = 860;
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: name || 'KohNaiSoi-HR-Main',
    chatBarText: 'เมนูพนักงาน',
    areas: [
      { bounds: { x: 1150, y: 0, width: 1350, height: SPLIT_Y },
        action: { type: 'postback', label: 'ประกาศและข่าวสาร',
                  data: 'action=news', displayText: 'ประกาศและข่าวสาร', inputOption: 'closeRichMenu' } },
      { bounds: { x: 0, y: SPLIT_Y, width: 860, height: 1686 - SPLIT_Y },
        action: { type: 'postback', label: 'คู่มือและสวัสดิการ',
                  data: 'action=handbook', displayText: 'คู่มือและสวัสดิการ', inputOption: 'closeRichMenu' } },
      { bounds: { x: 860, y: SPLIT_Y, width: 810, height: 1686 - SPLIT_Y },
        action: { type: 'postback', label: 'ตารางงาน',
                  data: 'action=today_shift', displayText: 'ตารางงานของฉัน', inputOption: 'closeRichMenu' } },
      { bounds: { x: 1670, y: SPLIT_Y, width: 830, height: 1686 - SPLIT_Y },
        action: { type: 'postback', label: 'ติดต่อ HR',
                  data: 'action=hr_menu', displayText: 'ติดต่อ HR', inputOption: 'closeRichMenu' } }
    ]
  };
}

/* ---------- เมนูผู้ที่ยังไม่ยืนยันตัวตน (2500 x 843) ---------- */
function richMenuGuestObject_() {
  /* ภาพ guest (2500 x 843): ปุ่มใหญ่ "ยืนยันตัวตนพนักงาน" ด้านบน
     และแถบ "วิธีใช้งาน" บาง ๆ ด้านล่างขวา */
  return {
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'KohNaiSoi-HR-Guest-v3',
    chatBarText: 'ยืนยันตัวตน',
    areas: [
      { bounds: { x: 0, y: 0, width: 2500, height: 650 },
        action: { type: 'uri', label: 'ยืนยันตัวตนพนักงาน', uri: liffUrl(CFG.liff.verify) } },
      { bounds: { x: 1100, y: 650, width: 1400, height: 193 },
        action: { type: 'postback', label: 'วิธีใช้งาน', data: 'action=how_to', displayText: 'วิธีใช้งาน' } }
    ]
  };
}

/* ================================================================
 * รันตัวนี้ตัวเดียวจบ
 * ================================================================ */
var RICHMENU_IMG_BASE_DEFAULT = 'https://manhaqq.github.io/koh-hr-liff/richmenu';

var MENU_VARIANTS = [
  { key: 'GUEST',   prop: 'RICHMENU_ID_GUEST',   file: 'guest',   img: 'RICHMENU_IMG_GUEST_FILEID',   label: 'เมนูยืนยันตัวตน' },
  { key: 'MAIN',    prop: 'RICHMENU_ID_MAIN',    file: 'main',    img: 'RICHMENU_IMG_MAIN_FILEID',    label: 'เมนูหลัก (ปกติ)' },
  { key: 'MAIN_N',  prop: 'RICHMENU_ID_MAIN_N',  file: 'main-n',  img: 'RICHMENU_IMG_MAIN_N_FILEID',  label: 'เมนูหลัก + จุดแดงประกาศ' },
  { key: 'MAIN_H',  prop: 'RICHMENU_ID_MAIN_H',  file: 'main-h',  img: 'RICHMENU_IMG_MAIN_H_FILEID',  label: 'เมนูหลัก + จุดแดง HR' },
  { key: 'MAIN_NH', prop: 'RICHMENU_ID_MAIN_NH', file: 'main-nh', img: 'RICHMENU_IMG_MAIN_NH_FILEID', label: 'เมนูหลัก + จุดแดงทั้งสอง' }
];

/**
 * ดึงภาพเมนูมาเป็น Blob
 * ลำดับความสำคัญ: Drive File ID (ถ้าตั้งไว้) → ไฟล์บนเว็บ
 * ที่ยอมให้ Drive มาก่อน เพราะถ้าใครเคยตั้งไว้แล้วจะได้ไม่พังตอนอัปเดตโค้ด
 */
function richMenuImage_(v) {
  var fileId = cfg(v.img);
  if (fileId) return DriveApp.getFileById(fileId).getBlob();

  var base = cfg('RICHMENU_IMG_BASE_URL', RICHMENU_IMG_BASE_DEFAULT).replace(/\/+$/, '');
  var url  = base + '/' + v.file + '.jpg';
  var res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('โหลดภาพเมนูไม่สำเร็จ (' + res.getResponseCode() + ')\n' + url +
                    '\n\nตรวจว่า push ไฟล์ richmenu/*.jpg ขึ้น GitHub แล้ว และ GitHub Pages เผยแพร่เรียบร้อย');
  }
  var blob = res.getBlob();
  /* LINE รับไม่เกิน 1 MB ต่อภาพ — กันพลาดตั้งแต่ต้นทาง จะได้ไม่ไปเจอ error ปลายทางที่อ่านไม่รู้เรื่อง */
  if (blob.getBytes().length > 1024 * 1024) {
    throw new Error('ภาพ ' + v.file + '.jpg ใหญ่เกิน 1 MB ซึ่ง LINE ไม่รับ\n' +
                    'ลดคุณภาพใน richmenu/build.py (ตัวแปร QUALITY) แล้วสร้างใหม่');
  }
  return blob;
}

function setupRichMenus() {
  var log = [];
  MENU_VARIANTS.forEach(function (v) {
    var obj  = (v.key === 'GUEST') ? richMenuGuestObject_()
                                   : richMenuMainObject_('KohNaiSoi-HR-' + v.key + '-v3');
    var blob = richMenuImage_(v);
    var id   = createRichMenu(obj);
    uploadRichMenuImage(id, blob, blob.getContentType() || 'image/jpeg');
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

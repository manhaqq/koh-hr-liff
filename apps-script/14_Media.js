/*******************************************************************
 * โก๋ในซอย HR Hub — 14_Media.gs
 * รูปแนบในประกาศ — HR ส่งรูปเข้าแชท OA แล้วแตะเลือกประกาศ
 *
 * ★ ทำไมต้องเป็น "ส่งรูปเข้าแชท" ไม่ใช่ "วางลิงก์ในชีต"
 *   เดิมคอลัมน์ imageUrl มีอยู่แล้วแต่ไม่มีใครใช้ได้จริง เพราะลิงก์แชร์ของ
 *   Google Drive (/file/d/.../view) คืนหน้า HTML ไม่ใช่ไฟล์รูป LINE จึงไม่
 *   ยอม render เป็น hero ผลคือ HR ต้องหา URL รูปจากที่อื่นเอง ซึ่งไม่มีทางทำได้
 *   จากมือถือ งานนี้จึงตกไปที่ developer ทุกครั้ง = ไม่มีใครแนบรูปเลย
 *
 *   ทางนี้ HR ทำได้เองจบในมือถือ และ ★ ไม่เห็น URL หรือ file id เลยสักครั้ง ★
 *
 * ★ ทำไมใช้ endpoint thumbnail ไม่ใช่ลิงก์แชร์
 *   https://drive.google.com/thumbnail?id=<id>&sz=w<N>
 *   คืน image/jpeg จริง และพารามิเตอร์ sz คือคำตอบของอินเทอร์เน็ตช้าทั้งข้อ
 *   ไฟล์ที่อัปโหลดครั้งเดียวเสิร์ฟได้ 3 ขนาดโดยไม่ต้องเขียนโค้ดย่อรูป
 *   และไม่ต้องเก็บไฟล์เพิ่ม
 *
 * ★★ เพดาน w1590 — กับดักที่วัดมาแล้วด้วยของจริง ★★
 *   ทดสอบกับไฟล์สาธารณะจริง 2 ไฟล์ (ต้นฉบับ 2.7MB และ 2.9MB) ได้ผลตรงกัน
 *       w480  →  83 KB      w1024 → 275 KB      w1280 → 393 KB
 *       w1500 → 507 KB      w1590 → 591 KB
 *       w1600 → 2,772,444 ไบต์  ← เท่ากับ "ไฟล์ต้นฉบับทั้งไฟล์" เป๊ะ ๆ
 *   ตั้งแต่ w1600 ขึ้นไป Drive เลิกย่อแล้วส่งไฟล์เต็มมาแทน
 *   แปลว่า w1600 (ค่าที่สเปกเดิมเขียนไว้) คือค่าที่ "แย่ที่สุด" ในบรรดาที่เลือกได้
 *   หน้ารายละเอียดจึงใช้ w1280 ไม่ใช่ w1600 — ประหยัดกว่า 7 เท่าบนเน็ตร้าน
 *
 *   ผลพลอยได้ด้านความเป็นส่วนตัว: ไฟล์เต็มมี EXIF ครบรวมพิกัด GPS ที่ถ่าย
 *   ส่วนภาพที่ Drive ย่อให้ถูกเข้ารหัสใหม่ การกันไม่ให้เกิน w1590 จึงกัน
 *   ไม่ให้พิกัดบ้าน/ร้านหลุดออกไปพร้อมรูปด้วย
 *
 * ★ ความเป็นส่วนตัว — อ่านก่อนแก้ไฟล์นี้
 *   รูปที่แนบถูกตั้งเป็น "ใครมีลิงก์ก็เปิดได้" เพราะ LINE ต้องโหลดรูปแบบไม่ล็อกอิน
 *   ไม่มีทางทำให้เป็นส่วนตัวได้ถ้ายังอยากให้ขึ้นใน Flex — ดู docs/notes-images.md
 *******************************************************************/

/* โฟลเดอร์ที่สคริปต์สร้างเอง — เก็บ id ไว้ใน Script Properties ไม่ใช่ในโค้ด */
var MEDIA_FOLDER_PROP = 'ANNOUNCEMENT_IMAGE_FOLDER_ID';
var MEDIA_FOLDER_NAME = 'รูปประกาศ HR Hub';

/** ชื่อคอลัมน์ใหม่ในแท็บ Announcements — ต่อท้ายอย่างเดียว ห้ามแตะหัวเดิม */
var MEDIA_COL = 'imageFileId';

/* ★ 10MB ไม่ใช่ 5MB โดยตั้งใจ
   กล้องมือถือรุ่นปัจจุบันถ่ายไฟล์ 3–8MB เป็นเรื่องปกติ ถ้าตัดที่ 5MB
   รูปจริงจำนวนมากจะถูกปฏิเสธ และคนที่โดนปฏิเสธคือคนที่ไม่รู้ว่าต้องย่อรูปยังไง
   10MB คือเพดานของ LINE เองอยู่แล้ว ใช้ค่าเดียวกันจึงไม่มีเคสที่ LINE ยอมแต่เราไม่ยอม */
var MEDIA_MAX_BYTES = 10 * 1024 * 1024;
var MEDIA_OK_MIME   = ['image/jpeg', 'image/png'];

/* สามขนาดที่ใช้จริง — ห้ามเกิน MEDIA_W_MAX (ดูหมายเหตุเพดานด้านบน) */
var MEDIA_W_THUMB = 480;    /* รายการในหน้าเว็บ */
var MEDIA_W_HERO  = 1024;   /* hero ของการ์ด Flex ในแชท */
var MEDIA_W_FULL  = 1280;   /* หน้ารายละเอียด */
var MEDIA_W_MAX   = 1590;

/* อายุของ "รูปที่เพิ่งส่งมาแต่ยังไม่ได้เลือกประกาศ" */
var MEDIA_PENDING_TTL = 900;   /* 15 นาที */

/* ================================================================
 * 1) สร้าง URL รูป — จุดเดียวในระบบที่ประกอบ URL นี้
 *    ถ้าวันหนึ่ง endpoint เปลี่ยน แก้ที่ฟังก์ชันนี้ฟังก์ชันเดียว
 *    แล้วสั่ง "ออก URL รูปใหม่ทั้งหมด" ก็กลับมาใช้ได้ทั้งระบบ
 * ================================================================ */
function announcementImageUrl_(fileId, width) {
  var id = String(fileId || '').trim();
  /* id ของ Drive เป็น base64url ล้วน — กันค่าขยะจากชีตไม่ให้กลายเป็น URL พิการ */
  if (!id || !/^[A-Za-z0-9_-]{20,}$/.test(id)) return '';

  var w = Math.floor(Number(width) || MEDIA_W_HERO);
  if (!(w > 0)) w = MEDIA_W_HERO;
  /* ★ เกินเพดานเมื่อไหร่ Drive ส่งไฟล์ต้นฉบับเต็ม ๆ มาแทนภาพย่อ จึงบีบลงเสมอ */
  if (w > MEDIA_W_MAX) w = MEDIA_W_MAX;

  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + w;
}

/* ================================================================
 * 2) โฟลเดอร์ปลายทาง
 * ================================================================ */
function mediaFolderId_() {
  /* DriveApp ใช้ไม่ได้กับ scope drive.file — มันบังคับขอสิทธิ์ Drive ทั้งบัญชี
     ทุกอย่างจึงผ่าน 15_Drive.gs ซึ่งเรียก Drive API v3 แทน */
  return driveFolderId_(MEDIA_FOLDER_NAME, MEDIA_FOLDER_PROP);
}

/* ================================================================
 * 3) ดึงไฟล์ binary จาก LINE
 *
 * ★ ห้ามใช้ lineFetch_ เดิมกับ endpoint นี้เด็ดขาด
 *   lineFetch_ เรียก getContentText() แล้ว JSON.parse ซึ่งแปลงไบต์ของรูป
 *   เป็นสตริง UTF-8 ไบต์ที่ไม่ใช่อักขระที่ถูกต้องจะถูกแทนด้วย U+FFFD
 *   ผลคือได้ "รูป" ที่เปิดไม่ขึ้นโดยไม่มี error ใด ๆ ให้เห็น
 *   ต้องแยกเป็นตัวดึง blob ต่างหากเสมอ
 * ================================================================ */
function lineFetchBlob_(url) {
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + CFG.token },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 300) {
    /* ★ ห้าม log body ของ endpoint นี้ — ถ้าสำเร็จมันคือไบต์ของรูป
       ตัดมาแค่ 200 ตัวพอให้รู้ว่า LINE บ่นอะไร */
    console.error('LINE content ' + code + ' → ' + String(res.getContentText()).slice(0, 200));
    throw new Error('LINE content ' + code);
  }
  return res.getBlob();
}

/** โหลดไฟล์ที่แนบมากับข้อความ (รูป/ไฟล์/เสียง) */
function getMessageContent_(messageId) {
  return lineFetchBlob_(LINE_DATA_API + '/message/' + encodeURIComponent(messageId) + '/content');
}

/* ================================================================
 * 4) เติมคอลัมน์ใหม่แบบไม่ทำลายของเดิม
 *
 * ★ ทำไมไม่ใช้ initDatabase
 *   initDatabase เขียนหัวคอลัมน์ที่ "แถวที่ 1 เสมอ" แต่ readTableRaw_ กับ
 *   headerIndex_ มองหาแถวหัวจริง (ข้ามแถวคำอธิบายแบบผสานเซลล์ที่อยู่บนสุด)
 *   ถ้าแท็บนี้หัวจริงอยู่แถว 2 initDatabase จะเขียน imageFileId ลงแถว 1
 *   แล้วโค้ดทั้งระบบจะมองไม่เห็นคอลัมน์นี้เลย — รูปจะแนบแล้ว "เงียบหาย"
 *   โดยไม่มี error ที่ไหนเลย ซึ่งเป็นบั๊กที่หาสาเหตุยากที่สุดแบบหนึ่ง
 *   ที่นี่จึงถามหาแถวหัวจริงจาก headerIndex_ แล้วต่อท้ายแถวนั้น
 * ================================================================ */
function ensureAnnouncementImageColumn_() {
  var idx = headerIndex_(SHEETS.ANNOUNCEMENTS);
  if (idx[MEDIA_COL]) return idx[MEDIA_COL];          /* มีแล้ว ไม่ต้องทำอะไร */

  var sh   = sheet_(SHEETS.ANNOUNCEMENTS);
  var col  = sh.getLastColumn() + 1;                   /* ต่อท้ายเท่านั้น */
  var head = idx._headRow || 1;

  var cell = sh.getRange(head, col);
  cell.setValue(MEDIA_COL);
  /* ให้หน้าตาเหมือนหัวคอลัมน์เดิม ไม่งั้น HR จะนึกว่ามีคนพิมพ์มั่วไว้ */
  cell.setBackground(CFG.BRAND.primary).setFontColor('#FFFFFF')
      .setFontWeight('bold').setVerticalAlignment('middle');

  bumpTableVersion_(SHEETS.ANNOUNCEMENTS);             /* ล้างทั้ง HEADER_MEMO_ และแคชตาราง */
  return col;
}

/* ================================================================
 * 5) รับรูปที่ HR ส่งเข้ามา
 *
 *   คืน true  = จัดการเรียบร้อยแล้ว (ตอบกลับไปแล้ว) ผู้เรียกต้อง return ทันที
 *   คืน false = ไม่ใช่เคสของเรา ให้ผู้เรียกทำงานเดิมต่อ
 *
 * ★ การคืน false คือหัวใจของความปลอดภัยตรงนี้
 *   คนที่ไม่ใช่ hr/admin ต้องตกไปเจอข้อความปฏิเสธ non-text เดิม
 *   พร้อมคำเตือน PDPA เหมือนเดิมเป๊ะ ๆ ฟังก์ชันนี้จึงไม่ตอบอะไรเลย
 *   ก่อนที่จะรู้ว่าผู้ส่งเป็น hr/admin จริง
 * ================================================================ */
function handleImageMessage_(ev, emp) {
  if (!ev || !ev.message || ev.message.type !== 'image') return false;
  if (!isHrOrAdmin_(emp)) return false;               /* ← พนักงานทั่วไปไปทางเดิม */

  var rt  = ev.replyToken;
  var mid = String(ev.message.id || '');
  if (!mid) return false;

  /* ★ กันงานซ้ำจากการที่ LINE ส่ง event เดิมมาใหม่
     ขั้นตอนนี้ยาว (ดาวน์โหลดหลายเมกะไบต์ + เขียน Drive 2 รอบ) ถ้าตอบช้าเกิน
     LINE จะถือว่าส่งไม่สำเร็จแล้วยิงซ้ำ ผลคือได้ไฟล์ซ้ำใน Drive และ HR
     เห็นรายการให้เลือกโผล่ซ้อนกันสองครั้ง จึงจองคีย์ "ก่อน" เริ่มทำงาน
     ยอมแลกว่าถ้ารอบแรกล้มจริง ๆ HR ต้องส่งรูปใหม่ ซึ่งดีกว่าไฟล์ซ้ำ */
  var cache = CacheService.getScriptCache();
  var dedup = 'mimg_' + mid;
  if (cache.get(dedup)) return true;
  try { cache.put(dedup, '1', 600); } catch (e) {}

  try {
    var blob = getMessageContent_(mid);
    var mime = String(blob.getContentType() || '').toLowerCase().split(';')[0].trim();
    var size = blob.getBytes().length;

    if (MEDIA_OK_MIME.indexOf(mime) < 0) {
      reply(rt, withQuickReply({ type: 'text',
        text: 'ไฟล์นี้ไม่ใช่รูปภาพที่ระบบรองรับค่ะ 🙏\nรองรับเฉพาะ JPG และ PNG เท่านั้น' }));
      return true;
    }
    if (size > MEDIA_MAX_BYTES) {
      reply(rt, withQuickReply({ type: 'text',
        text: 'รูปนี้ใหญ่เกินไปค่ะ (' + Math.round(size / 1048576) + ' MB)\n' +
              'กรุณาส่งรูปที่ไม่เกิน 10 MB\n\n' +
              'วิธีง่ายที่สุด: เปิดรูปในแอปรูปภาพ → แก้ไข → ครอบตัด → บันทึก แล้วส่งใหม่' }));
      return true;
    }

    /* บันทึกลงโฟลเดอร์ของสคริปต์ แล้วเปิดให้ "ใครมีลิงก์ก็เปิดได้"
       จำเป็น เพราะเซิร์ฟเวอร์ของ LINE โหลดรูปแบบไม่ได้ล็อกอินบัญชีเรา */
    var ext  = (mime === 'image/png') ? '.png' : '.jpg';
    var name = 'ann_' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd_HHmmss') + ext;
    var fileId = driveUpload_(blob.setName(name), name, mediaFolderId_());
    driveShareAnyoneReader_(fileId);

    /* จำไว้ว่า HR คนนี้เพิ่งอัปโหลดอะไร ใช้ตรวจตอน postback กลับมา
       (ห้ามเชื่อ file id ที่ลอยมากับ postback เพียว ๆ ดู handleMediaPostback_) */
    try { cache.put('mpend_' + ev.source.userId, fileId, MEDIA_PENDING_TTL); } catch (e2) {}

    audit(emp.empCode, 'IMAGE_UPLOAD', '', 'รับรูปเข้าคลัง ' + Math.round(size / 1024) + ' KB');

    var list = recentAnnouncementsForPicker_(5);
    if (!list.length) {
      reply(rt, withQuickReply({ type: 'text',
        text: 'รับรูปแล้วค่ะ ✅ แต่ตอนนี้ยังไม่มีประกาศให้แนบ\n\n' +
              'กรุณาสร้างแถวประกาศในชีต Announcements ก่อน แล้วส่งรูปนี้เข้ามาอีกครั้งค่ะ' }));
      return true;
    }
    reply(rt, flexImagePicker_(list, fileId));
    return true;

  } catch (err) {
    console.error('handleImageMessage_: ' + err + '\n' + (err.stack || ''));
    /* ★ ห้ามปล่อยให้ throw ทะลุขึ้นไป ไม่งั้น HR จะส่งรูปแล้วเงียบสนิท
       ซึ่งเป็นความล้มเหลวที่สับสนที่สุดสำหรับคนที่ไม่ใช่สายเทคนิค
       และเราส่งซ้ำทีหลังไม่ได้ด้วย เพราะนั่นคือ push ที่กินโควตา */
    try {
      reply(rt, withQuickReply({ type: 'text',
        text: 'ขออภัยค่ะ ระบบบันทึกรูปไม่สำเร็จ 🙏\nกรุณาลองส่งใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ' }));
    } catch (e3) {}
    return true;
  }
}

/** hr และ admin เท่านั้น — supervisor ยังแนบรูปประกาศไม่ได้ */
function isHrOrAdmin_(emp) {
  if (!emp) return false;
  var r = String(emp.role || '').trim().toLowerCase();
  return r === ROLES.HR || r === ROLES.ADMIN;
}

/* ประกาศ 5 อันล่าสุดสำหรับให้เลือก
   ★ ไม่ใช้ getAnnouncements เพราะตัวนั้นกรองเฉพาะที่ published แล้วและตรงกลุ่ม
   เป้าหมายของ "ผู้อ่าน" แต่ HR มักแนบรูปตอนที่ประกาศยังเป็นฉบับร่างอยู่ */
function recentAnnouncementsForPicker_(n) {
  return readTable(SHEETS.ANNOUNCEMENTS)
    .filter(function (a) { return String(a.title || '').trim(); })
    .sort(function (x, y) {
      var d = String(y.date || '').localeCompare(String(x.date || ''));
      return d !== 0 ? d : (y._row - x._row);      /* วันที่เท่ากัน เอาแถวล่างสุด (ใหม่สุด) ก่อน */
    })
    .slice(0, n || 5);
}

/* ================================================================
 * 6) การ์ดให้ HR เลือกว่าจะแนบรูปเข้าประกาศไหน
 *    ★ ทั้งใบต้องไม่มี URL และไม่มี file id โผล่ให้เห็น
 *      file id เดินทางอยู่ใน postback data ซึ่ง LINE ไม่แสดงบนหน้าจอ
 * ================================================================ */
function flexImagePicker_(list, fileId) {
  var rows = list.map(function (a, i) {
    return {
      type: 'box', layout: 'vertical', spacing: 'xs',
      paddingTop: i === 0 ? 'none' : 'md',
      contents: [
        { type: 'box', layout: 'baseline', contents: [
          { type: 'text', text: String(a.category || 'ทั่วไป'), size: 'xxs',
            color: C.accentInk, weight: 'bold', flex: 0 },
          { type: 'text', text: '  •  ' + thaiDate_(a.date), size: 'xxs', color: C.sub }
        ]},
        { type: 'text', text: String(a.title || '(ไม่มีหัวข้อ)'), size: 'sm',
          color: C.ink, weight: 'bold', wrap: true, maxLines: 2 },
        { type: 'button', style: 'primary', height: 'sm', color: C.primary, margin: 'sm',
          action: fxPost_('แนบรูปเข้าประกาศนี้',
                          'action=ann_img&id=' + encodeURIComponent(a.id) + '&f=' + encodeURIComponent(fileId),
                          'แนบรูปเข้า: ' + String(a.title || '').slice(0, 30)) },
        (i === list.length - 1) ? null : fxDivider_()
      ].filter(Boolean)
    };
  });

  return fx_('เลือกประกาศที่จะแนบรูป', {
    type: 'bubble',
    header: fxHeader_('📷 รับรูปแล้ว', 'เลือกประกาศที่จะแนบรูปนี้'),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [{
        type: 'text', size: 'xs', color: C.sub, wrap: true, margin: 'none',
        text: 'แตะประกาศที่ต้องการ รูปจะขึ้นทั้งในแชทและในหน้าประกาศทันที'
      }].concat(rows)
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [{
        type: 'text', size: 'xxs', color: C.sub, wrap: true,
        text: '⚠️ รูปที่แนบจะเปิดดูได้โดยไม่ต้องล็อกอิน กรุณาอย่าแนบรูปเอกสารที่มีข้อมูลส่วนบุคคล'
      }]
    }
  });
}

/* ================================================================
 * 7) HR แตะเลือกประกาศแล้ว — เขียนลงชีต
 *
 *   คืน true  = จัดการแล้ว
 *   คืน false = ไม่ใช่ postback ของเรา
 * ================================================================ */
function handleMediaPostback_(data, ev, emp) {
  if (!data || data.action !== 'ann_img') return false;
  var rt = ev.replyToken;

  /* ★ ต้องเช็กสิทธิ์ซ้ำตรงนี้ ห้ามคิดว่า "ก็ต้องเป็น HR อยู่แล้วเพราะการ์ดส่งให้ HR"
     postback data เป็นสตริงที่ client ส่งอะไรมาก็ได้ ใครก็ประดิษฐ์
     action=ann_img ขึ้นมาเองได้ ถ้าไม่เช็ก พนักงานทั่วไปจะแก้ประกาศได้ */
  if (!isHrOrAdmin_(emp)) {
    reply(rt, withQuickReply({ type: 'text', text: 'เมนูนี้สงวนไว้สำหรับทีม HR ค่ะ 🙏' }));
    return true;
  }

  try {
    /* parseQuery_ ไม่ได้ถอดรหัสให้ ต้องถอดเอง และต้องถอดแบบไม่ระเบิด
       เพราะสตริงที่มี % เดี่ยว ๆ ทำให้ decodeURIComponent โยน error */
    var annId  = qsDecode_(data.id);
    var fileId = qsDecode_(data.f);

    /* ★ ห้ามเชื่อ file id ที่ลอยมากับ postback ตรง ๆ
       ถ้าเชื่อ จะมีคนยัด id ของไฟล์อื่นเข้ามาแล้วทำให้ประกาศของร้าน
       ไปแสดงรูปอะไรก็ได้จากที่ไหนก็ได้
       ด่านที่ 1  ต้องเป็นไฟล์ที่ "HR คนนี้" เพิ่งอัปโหลดในรอบนี้
       ด่านที่ 2  หรืออย่างน้อยต้องเป็นไฟล์ที่อยู่ในโฟลเดอร์ของระบบเรา
                  (scope drive.file เปิดไฟล์ที่สคริปต์ไม่ได้สร้างไม่ได้อยู่แล้ว
                   getFileById จึง throw เอง ซึ่งเป็นด่านสุดท้ายที่แน่นหนาที่สุด) */
    if (!isOwnedMediaFile_(fileId, ev.source.userId)) {
      reply(rt, withQuickReply({ type: 'text',
        text: 'รูปนี้หมดอายุแล้วหรือไม่พบในระบบค่ะ 🙏\nกรุณาส่งรูปเข้ามาใหม่อีกครั้ง' }));
      return true;
    }

    var ann = readTable(SHEETS.ANNOUNCEMENTS).filter(function (a) {
      return String(a.id) === annId;
    })[0];
    if (!ann) {
      reply(rt, withQuickReply({ type: 'text', text: 'ไม่พบประกาศฉบับนี้แล้วค่ะ อาจถูกลบไปก่อนหน้านี้' }));
      return true;
    }

    ensureAnnouncementImageColumn_();       /* ★ ต้องมาก่อน updateRow เสมอ — ดูเหตุผลที่ข้อ 4 */
    updateRow(SHEETS.ANNOUNCEMENTS, ann._row, {
      imageFileId: fileId,
      imageUrl:    announcementImageUrl_(fileId, MEDIA_W_HERO)
    });
    audit(emp.empCode, 'IMAGE_ATTACH', String(ann.id), String(ann.title || ''));

    reply(rt, withQuickReply({ type: 'text',
      text: 'แนบรูปเรียบร้อยแล้วค่ะ ✅\n\n📢 ' + String(ann.title || '') + '\n\n' +
            (String(ann.status).trim() === 'published'
              ? 'พนักงานจะเห็นรูปนี้ในหน้าประกาศทันที'
              : 'ประกาศนี้ยังไม่ได้เผยแพร่ — เผยแพร่ได้จากเมนู 🏪 HR Hub → 📢 ประกาศ') }));
    return true;

  } catch (err) {
    console.error('handleMediaPostback_: ' + err + '\n' + (err.stack || ''));
    try {
      reply(rt, withQuickReply({ type: 'text',
        text: 'ขออภัยค่ะ บันทึกรูปเข้าประกาศไม่สำเร็จ 🙏 กรุณาลองใหม่อีกครั้ง' }));
    } catch (e) {}
    return true;
  }
}

/** ถอดรหัสค่าจาก postback data แบบไม่โยน error */
function qsDecode_(v) {
  var s = String(v || '');
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

/** ไฟล์นี้เป็นของระบบเราจริงไหม (ดู 2 ด่านที่อธิบายไว้ใน handleMediaPostback_) */
function isOwnedMediaFile_(fileId, userId) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(String(fileId || ''))) return false;
  try {
    var pending = CacheService.getScriptCache().get('mpend_' + userId);
    if (pending && pending === fileId) return true;
  } catch (e) {}
  try {
    var folderId = cfg(MEDIA_FOLDER_PROP);
    if (!folderId) return false;
    /* throw ถ้าไม่ใช่ไฟล์ที่สคริปต์นี้สร้าง — ซึ่งเป็นการกันที่ต้องการพอดี */
    var f = driveReady_().Files.get(fileId, { fields: 'parents' });
    return (f.parents || []).indexOf(folderId) >= 0;
  } catch (e2) { return false; }
}

/* ================================================================
 * 8) ★ ปุ่มถอยของฟีเจอร์นี้ — ออก URL รูปใหม่ทั้งหมดจาก file id ที่เก็บไว้
 *
 *   endpoint thumbnail ของ Drive ไม่ใช่ API ที่มีเอกสารรับรอง ถ้าวันหนึ่ง
 *   Google เปลี่ยนรูปแบบ URL ประกาศทุกฉบับจะรูปหายพร้อมกัน
 *   เพราะเราเก็บ file id ไว้ต่างหาก จึงแก้ announcementImageUrl_ ที่เดียว
 *   แล้วกดปุ่มนี้ ก็ได้ URL ชุดใหม่ทั้งระบบโดยไม่ต้องอัปโหลดรูปซ้ำสักไฟล์
 * ================================================================ */
function regenerateAllAnnouncementImageUrls() {
  ensureAnnouncementImageColumn_();
  var rows = readTable(SHEETS.ANNOUNCEMENTS, true).filter(function (a) {
    return String(a[MEDIA_COL] || '').trim();
  });
  if (!rows.length) {
    alert_('ไม่มีอะไรให้ทำ', 'ยังไม่มีประกาศฉบับไหนที่แนบรูปผ่านระบบนี้');
    return;
  }
  var n = 0;
  rows.forEach(function (a) {
    var url = announcementImageUrl_(a[MEDIA_COL], MEDIA_W_HERO);
    if (url && url !== String(a.imageUrl || '')) {
      updateRow(SHEETS.ANNOUNCEMENTS, a._row, { imageUrl: url });
      n++;
    }
  });
  audit(actor_(), 'IMAGE_REGEN', '', 'ออก URL ใหม่ ' + n + ' ฉบับ');
  alert_('เรียบร้อย ✅', 'ออก URL รูปใหม่ให้ประกาศ ' + n + ' ฉบับ (จากทั้งหมด ' + rows.length + ' ฉบับที่มีรูป)');
}

/* ================================================================
 * 9) ถอนรูปออกจากประกาศ (แถวที่เลือกในชีต)
 *    จำเป็นตามหลัก PDPA — ต้องมีขั้นตอนที่ "ลบของจริง" ไม่ใช่แค่ซ่อน
 *    เพราะลิงก์เดิมเป็นลิงก์สาธารณะ ใครเคยคัดลอกไว้ก็ยังเปิดได้จนกว่าไฟล์จะหาย
 * ================================================================ */
function removeSelectedAnnouncementImage() {
  /* ★ ต้องมาก่อน pickAnnouncementRow_ ไม่ใช่หลัง
     ถ้าคอลัมน์ยังไม่มี แถวที่อ่านได้จะไม่มีฟิลด์ imageFileId ติดมาด้วย
     แล้วเราจะถอนลิงก์ออกจากชีตแต่ทิ้งไฟล์จริงไว้ใน Drive แบบสาธารณะต่อไป
     ซึ่งคือความล้มเหลวที่ร้ายที่สุดของปุ่มที่ชื่อว่า "ถอนรูป" */
  ensureAnnouncementImageColumn_();
  var a = pickAnnouncementRow_();
  if (!a) return;
  var fileId = String(a[MEDIA_COL] || '').trim();
  if (!fileId && !String(a.imageUrl || '').trim()) {
    alert_('ไม่มีรูป', 'ประกาศฉบับนี้ไม่ได้แนบรูปไว้');
    return;
  }
  if (!confirm_('ยืนยันการถอนรูป',
      '📢 ' + a.title + '\n\nจะถอนรูปออกจากประกาศ และย้ายไฟล์ลงถังขยะ\n' +
      '(กู้คืนได้ภายใน 30 วัน)\n\nดำเนินการเลยหรือไม่?')) return;

  var trashed = false;
  if (fileId) {
    try { driveTrash_(fileId); trashed = true; }
    catch (e) { console.error('removeSelectedAnnouncementImage: ' + e); }
  }
  updateRow(SHEETS.ANNOUNCEMENTS, a._row, { imageUrl: '', imageFileId: '' });
  audit(actor_(), 'IMAGE_REMOVE', String(a.id), String(a.title || ''));

  alert_('ถอนรูปแล้ว ✅',
    'ถอนรูปออกจากประกาศเรียบร้อย' +
    (trashed ? '\nไฟล์ถูกย้ายลงถังขยะของ Drive แล้ว'
             : '\n⚠️ ลบไฟล์ใน Drive ไม่สำเร็จ — กรุณาลบด้วยมือจากโฟลเดอร์ "' + MEDIA_FOLDER_NAME + '"'));
}

/* ================================================================
 * 10) ตรวจว่า URL รูปใช้งานได้จริงก่อนเผยแพร่
 *
 * ★ ห้ามเช็กแค่ "ได้ 2xx"
 *   ทดสอบแล้วพบว่า id ที่ไม่มีอยู่จริงบางแบบคืน HTTP 200 พร้อมหน้า HTML
 *   ถ้าเช็กแค่รหัสสถานะจะผ่านฉลุยแล้วไปพังตอนขึ้นจอพนักงาน
 *   ตัวชี้ขาดคือ Content-Type ต้องขึ้นต้นด้วย image/
 *
 *   คืนค่า '' ถ้าใช้ได้ หรือข้อความบอกสาเหตุถ้าใช้ไม่ได้
 * ================================================================ */
function announcementImageProblem_(a) {
  var url = String((a && a.imageUrl) || '').trim();
  if (!url) return '';                                   /* ไม่มีรูป = ไม่ผิด การ์ดมีหัวแบรนด์สำรองอยู่แล้ว */
  if (url.indexOf('https://') !== 0) return 'ลิงก์รูปต้องขึ้นต้นด้วย https:// เท่านั้น';
  try {
    /* ลอง HEAD ก่อนเพราะไม่ต้องโหลดไบต์ของรูปเลย ประหยัดเวลาตอน HR กดเผยแพร่
       แต่บาง CDN ไม่รับ HEAD จึงถอยไปใช้ GET ให้ผลลัพธ์เชื่อถือได้เสมอ */
    var res  = UrlFetchApp.fetch(url, { method: 'head', muteHttpExceptions: true, followRedirects: true });
    var code = res.getResponseCode();
    if (code >= 300 || code === 405) {
      res  = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: true });
      code = res.getResponseCode();
    }
    if (code >= 300) return 'เปิดลิงก์รูปไม่ได้ (สถานะ ' + code + ')';
    var h  = res.getHeaders() || {};
    var ct = String(h['Content-Type'] || h['content-type'] || '');
    if (ct.toLowerCase().indexOf('image/') !== 0) {
      return 'ลิงก์นี้ไม่ใช่ไฟล์รูป (ระบบได้ ' + (ct || 'ไม่ทราบชนิด') + ')\n' +
             'ลิงก์แชร์ของ Google Drive ใช้เป็นรูปในแชทไม่ได้ — ให้ส่งรูปเข้าแชท OA แทน';
    }
    return '';
  } catch (e) {
    return 'ตรวจลิงก์รูปไม่สำเร็จ: ' + e;
  }
}

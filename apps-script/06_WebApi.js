/*******************************************************************
 * โก๋ในซอย HR Hub — 06_WebApi.gs
 * API ที่หน้า LIFF เรียกใช้
 * ทุก endpoint ต้องแนบ idToken เสมอ → ตรวจกับ LINE ก่อนคืนข้อมูล
 *******************************************************************/

function handleApi_(d) {
  var api = String(d.api || '');

  /* ---- ตรวจตัวตนจาก ID Token (ห้ามข้าม) ---- */
  var v = verifyIdToken(d.idToken);
  if (!v) return { ok: false, code: 'AUTH', message: 'ยืนยันตัวตนไม่สำเร็จ กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง' };
  var userId = v.userId;

  /* ---- ยืนยันตัวตนครั้งแรก (ยังไม่ต้องเป็นพนักงานในระบบ) ---- */
  if (api === 'verify') return apiVerify_(d, userId, v.name);

  /* ---- ที่เหลือต้องเป็นพนักงาน active เท่านั้น ---- */
  var emp = findEmployeeByUserId(userId);
  if (!emp)          return { ok: false, code: 'NOT_VERIFIED', message: 'กรุณายืนยันตัวตนก่อนใช้งาน' };
  if (!isActive(emp)) {
    revokeAccess_(userId);
    return { ok: false, code: String(emp.status).toUpperCase(), message: 'บัญชีนี้ถูกปิดการใช้งานแล้ว' };
  }

  /* ---- ฟีเจอร์เสริมที่แยกไฟล์ไว้ ----
     ต้องดักตรงนี้ "หลัง" ตรวจตัวตนและสถานะพนักงานแล้ว และ "ก่อน" switch เสมอ
     ถ้าเผลอย้ายไปไว้ใน doPost คำสั่งที่ต้องใช้สิทธิ์จะเรียกได้โดยไม่ผ่าน ID token
     ทั้งสองตัวคืน null เมื่อไม่ใช่คำสั่งของตัวเอง คำสั่งเดิมจึงไหลลง switch ตามปกติ
     ★ forms ต้องมาก่อน switch เพราะต้องแย่ง report_data ของ R11/R12
       ไปจัดการเอง ส่วน reportId อื่นจะคืน null แล้วตกไปที่ apiReportData_ เดิม */
  if (typeof handleAdminApi_ === 'function') {
    var adm = handleAdminApi_(api, d, emp, userId);
    if (adm) return adm;
  }
  if (typeof handleFormsApi_ === 'function') {
    var frm = handleFormsApi_(api, d, emp, userId);
    if (frm) return frm;
  }

  switch (api) {
    case 'me':            return { ok: true, me: publicEmp_(emp), badges: getBadges_(userId) };
    case 'news':          clearBadge(userId, 'news'); return apiNews_(emp, d);
    case 'handbook':      return apiHandbook_(emp);
    case 'appguide':      return apiAppGuide_();
    case 'schedule':      return apiSchedule_(emp, d);
    case 'faq':           return apiFaq_();
    case 'ticket_create': return apiTicketCreate_(emp, userId, d);
    case 'my_tickets':    clearBadge(userId, 'hr');
                          return { ok: true, tickets: myTickets(emp.empCode, userId).slice(0, 30).map(publicTicket_) };
    case 'leave_create':  return apiLeaveCreate_(emp, userId, d);
    case 'org':           return { ok: true, orgChartUrl: setting('ORG_CHART_URL', ''), handbookPdfUrl: setting('HANDBOOK_PDF_URL', '') };
    case 'org_chart':     return apiOrgChart_(emp);
    case 'reports':       return apiReports_(emp);
    case 'report_data':   return apiReportData_(emp, d);
    case 'ics':           return { ok: true, url: icsUrl(emp.empCode) };
    default:              return { ok: false, code: 'UNKNOWN_API', message: 'ไม่รู้จักคำสั่ง: ' + api };
  }
}

/* ---------- ตัวช่วย ---------- */
function escHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function data_cat(d) { return String((d && d.category) || 'other'); }

/* ---------- ตัดข้อมูลอ่อนไหวก่อนส่งออก (Data Minimisation ตาม PDPA) ---------- */
function publicEmp_(e) {
  return {
    empCode:   e.empCode,
    firstName: e.firstName,
    lastName:  e.lastName,
    fullName:  e.fullName,
    nickname:  e.nickname,
    position:  e.position,
    dept:      e.dept,
    reportsTo: e.reportsTo,
    branch:    e.branch,
    startDate: e.startDate,
    role:      e.role
    // ไม่ส่ง: เลขบัตรประชาชน, เบอร์โทร, เงินเดือน, lineUserId
  };
}

function publicTicket_(t) {
  return {
    ticketId: t.ticketId, createdAt: t.createdAt, category: t.category,
    subject: t.subject, status: t.status, reply: t.reply, slaDue: t.slaDue
  };
}

/* ================================================================
 * ยืนยันตัวตน
 * ================================================================ */
function apiVerify_(d, userId, lineName) {
  /* --------------------------------------------------------------
   * ยืนยันตัวตนด้วย ชื่อ + นามสกุล + เบอร์โทร 4 ตัวท้าย
   * --------------------------------------------------------------
   * ทำไมถึงเปลี่ยนจากรหัสพนักงาน: พนักงานหน้าร้านจำรหัสตัวเองไม่ได้
   * ทำให้ต้องถาม HR ทีละคน เปิดระบบไม่ทัน
   *
   * ⚠️ สิ่งที่ต้องยอมรับ: ชื่อและนามสกุลเป็นข้อมูลที่เพื่อนร่วมงานรู้กันอยู่แล้ว
   *    ความปลอดภัยจึงเหลืออยู่ที่เบอร์ 4 ตัวท้ายเพียงอย่างเดียว (1 ใน 10,000)
   *    ระบบจึงใส่มาตรการชดเชยไว้ 5 ชั้น:
   *      1. จำกัด 5 ครั้ง/ชั่วโมง ต่อ 1 บัญชี LINE
   *      2. จำกัด 8 ครั้ง/วัน ต่อ 1 "พนักงานที่ถูกกรอกถึง"
   *         (กันคนไล่เดาเบอร์ของคนคนเดียวโดยเปลี่ยนบัญชี LINE ไปเรื่อยๆ)
   *      3. 1 พนักงาน = 1 บัญชี LINE — ผูกซ้ำไม่ได้ ต้องให้ HR รีเซ็ต
   *      4. อีเมลแจ้ง HR ทันทีเมื่อเจอพฤติกรรมน่าสงสัย
   *      5. เปิดโหมด "รอ HR อนุมัติ" ได้ ตั้ง VERIFY_REQUIRE_APPROVAL = TRUE ในชีต Settings
   */
  var first = String(d.firstName || '').trim();
  var last  = String(d.lastName  || '').trim();
  var last4 = String(d.phoneLast4 || '').trim();

  if (!first || !last || !/^[0-9]{4}$/.test(last4)) {
    return { ok: false, code: 'INPUT',
             message: 'กรุณากรอกชื่อ นามสกุล และเบอร์โทร 4 ตัวท้ายให้ครบ' };
  }

  /* ★ ทุกอย่างตั้งแต่การนับครั้งจนถึงการผูกบัญชี ต้องอยู่ในล็อกเดียวกัน
     ถ้าอ่าน-เช็ก-เขียนตัวนับแบบไม่ล็อก ผู้ไม่หวังดียิงพร้อมกัน 30 request
     จะอ่านค่าตัวนับได้ 0 ทั้งหมด ผ่านด่านทั้งหมด และเดาได้ 30 ครั้งโดยนับเป็นครั้งเดียว
     ซึ่งทำให้ด่านที่ 1 และ 2 ไร้ผลพร้อมกัน */
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) {
    return { ok: false, code: 'BUSY', message: 'ระบบกำลังทำงานหนัก กรุณาลองใหม่ในอีกสักครู่' };
  }
  try {
    return verifyLocked_(first, last, last4, userId, lineName);
  } finally {
    lock.releaseLock();
  }
}

/** ข้อความเดียวกันหมดไม่ว่าจะพลาดเพราะอะไร — กันการใช้หน้ายืนยันไล่เช็กว่าใครทำงานที่นี่บ้าง
 *  เหตุผลจริงถูกบันทึกใน AuditLog ให้ HR ดูได้ */
var VERIFY_GENERIC_FAIL = 'ข้อมูลไม่ตรงกับทะเบียนพนักงาน กรุณาตรวจการสะกดชื่อ-นามสกุล ' +
                          'และเบอร์โทร 4 ตัวท้ายอีกครั้ง';

function verifyLocked_(first, last, last4, userId, lineName) {
  var cache = CacheService.getScriptCache();
  var kTry  = 'try_' + userId;
  var tries = Number(cache.get(kTry) || 0);
  if (tries >= 5) {
    audit(userId, 'VERIFY_LOCKED', first + ' ' + last, 'พยายามเกิน 5 ครั้ง');
    return { ok: false, code: 'LOCKED',
             message: 'พยายามยืนยันเกินกำหนด กรุณารอ 1 ชั่วโมง หรือติดต่อ HR โดยตรง' };
  }

  var found = findEmployeeByName(first, last, last4);

  /* ด่านที่ 2 — จำกัดจำนวนครั้งต่อ "ตัวพนักงาน" ไม่ใช่ต่อข้อความที่พิมพ์เข้ามา
     ต้องผูกกับ empCode เพราะคนหนึ่งคนมีทั้งชื่อจริงและชื่อเล่นที่ใช้ยืนยันได้
     ถ้าทำคีย์จากข้อความ จะได้โควตาเดาเป็นสองเท่า */
  var kName = found.codes.length ? ('trg_' + found.codes.join(',')) : '';
  var hits  = kName ? Number(cache.get(kName) || 0) : 0;
  if (kName && hits >= 8) {
    audit(userId, 'VERIFY_TARGET_LOCKED', found.codes.join(','),
          'มีคนพยายามยืนยันเป็นพนักงานคนนี้เกิน 8 ครั้ง');
    notifyHrEmail('⚠️ มีการพยายามยืนยันตัวตนผิดปกติ',
      emailTemplate_('มีคนพยายามยืนยันตัวตนเป็นพนักงานคนเดิมซ้ำๆ', [
        ['ชื่อที่ถูกกรอก', escHtml_(first + ' ' + last)],
        ['รหัสพนักงานที่ตรงกับชื่อนี้', escHtml_(found.codes.join(', '))],
        ['จำนวนครั้งในช่วง 6 ชั่วโมง', String(hits)],
        ['เวลา', now_()]
      ], 'หากไม่ใช่พนักงานคนนั้นเองที่กรอกผิด ควรตรวจสอบว่ามีคนพยายามสวมตัวตนหรือไม่ ' +
         'และพิจารณาเปิดโหมด VERIFY_REQUIRE_APPROVAL = TRUE ในชีต Settings'));
    return { ok: false, code: 'LOCKED',
             message: 'ระบบระงับการยืนยันชื่อนี้ชั่วคราวเพื่อความปลอดภัย กรุณาติดต่อ HR โดยตรง' };
  }

  /* ชื่อ-นามสกุลซ้ำกันหลายคน → ไม่เดา ให้ HR ผูกให้ */
  if (found.matches.length > 1) {
    audit(userId, 'VERIFY_AMBIGUOUS', first + ' ' + last, 'ชื่อ-นามสกุล-เบอร์ตรงกันมากกว่า 1 คน');
    notifyHrEmail('ต้องผูกบัญชี LINE ให้พนักงานด้วยมือ',
      emailTemplate_('มีพนักงานชื่อซ้ำกัน ระบบไม่ยืนยันอัตโนมัติ', [
        ['ชื่อที่กรอก', escHtml_(first + ' ' + last)],
        ['จำนวนที่ตรงกัน', String(found.matches.length)],
        ['เวลา', now_()]
      ], 'กรุณาเปิด Google Sheets แล้วใช้เมนู 🏪 HR Hub → ผูกบัญชี LINE ให้พนักงาน'));
    return { ok: false, code: 'AMBIGUOUS',
             message: 'มีพนักงานชื่อ-นามสกุลซ้ำกันในระบบ เพื่อความถูกต้อง กรุณาให้ HR ผูกบัญชีให้ (ระบบแจ้ง HR แล้ว)' };
  }

  if (found.matches.length === 0) {
    cache.put(kTry, String(tries + 1), 3600);
    if (kName) cache.put(kName, String(hits + 1), 21600);
    audit(userId, 'VERIFY_FAIL', first + ' ' + last,
          (found.byName > 0 ? 'ชื่อตรงแต่เบอร์ 4 ตัวท้ายไม่ตรง' : 'ไม่พบชื่อนี้ในทะเบียน') +
          ' (ครั้งที่ ' + (tries + 1) + ')');
    return { ok: false, code: 'MISMATCH',
             message: VERIFY_GENERIC_FAIL + ' (เหลือ ' + (4 - tries) + ' ครั้ง)' };
  }

  var emp = found.matches[0];

  /* ★ ตัดสินใจสถานะปลายทางก่อนเขียน ไม่ใช่เขียน active แล้วค่อยลดเป็น pending
     ถ้าเขียนสองรอบ จะมีช่วงที่บัญชีเป็น active จริงและถูกแคชไว้ 3 นาที
     และถ้ารอบสองพลาด บัญชีจะค้างเป็น active ทั้งที่ HR ยังไม่อนุมัติ */
  var needApproval = String(setting('VERIFY_REQUIRE_APPROVAL', 'FALSE')).toUpperCase() === 'TRUE';
  var r = bindEmployee(emp.empCode, userId, lineName,
                       needApproval ? EMP_STATUS.PENDING : EMP_STATUS.ACTIVE);

  if (!r.ok) {
    audit(userId, 'VERIFY_REJECT', emp.empCode, r.reason);
    if (r.reason === 'ALREADY_BOUND') {
      /* อาจเป็นคนอื่นพยายามสวมตัวตน — แจ้ง HR ทันที (อีเมลฟรี ไม่กินโควตา) */
      notifyHrEmail('⚠️ มีคนพยายามยืนยันตัวตนซ้ำ',
        emailTemplate_('มีการพยายามผูกบัญชี LINE ใหม่กับพนักงานที่ผูกไว้แล้ว', [
          ['พนักงาน', escHtml_(emp.fullName)],
          ['รหัสพนักงาน', escHtml_(emp.empCode)],
          ['ชื่อ LINE ที่พยายามผูก', escHtml_(lineName || '-')],
          ['เวลา', now_()]
        ], 'ถ้าพนักงานเปลี่ยนเครื่องจริง ให้ใช้เมนู 🏪 HR Hub → รีเซ็ตการผูกบัญชี LINE ' +
           'ถ้าไม่ใช่ แปลว่ามีคนพยายามสวมตัวตน ควรตรวจสอบทันที'));
      return { ok: false, code: 'ALREADY_BOUND',
               message: 'ชื่อนี้ผูกกับบัญชี LINE อื่นอยู่แล้ว หากคุณเปลี่ยนเครื่องหรือเปลี่ยนบัญชีไลน์ ' +
                        'กรุณาแจ้ง HR เพื่อรีเซ็ต (ระบบแจ้ง HR แล้ว)' };
    }
    /* RESIGNED / SUSPENDED / NOT_FOUND — ตอบเหมือนกรอกผิด ไม่ยืนยันสถานะการจ้างงานให้ใครรู้ */
    cache.put(kTry, String(tries + 1), 3600);
    if (kName) cache.put(kName, String(hits + 1), 21600);
    return { ok: false, code: 'MISMATCH',
             message: VERIFY_GENERIC_FAIL + ' หากแน่ใจว่ากรอกถูกต้องแล้ว กรุณาติดต่อ HR โดยตรง' };
  }

  cache.remove(kTry);
  if (kName) cache.remove(kName);

  if (needApproval) {
    notifyHrEmail('มีพนักงานรอการอนุมัติเข้าใช้งาน',
      emailTemplate_('รออนุมัติเข้าใช้ LINE HR Hub', [
        ['พนักงาน', escHtml_(emp.fullName)],
        ['รหัสพนักงาน', escHtml_(emp.empCode)],
        ['แผนก', escHtml_(emp.dept || '-')],
        ['ชื่อ LINE', escHtml_(lineName || '-')],
        ['เวลา', now_()]
      ], 'เปิด Google Sheets → ชีต Employees → เปลี่ยน status เป็น active → เมนู 🏪 HR Hub → ซิงก์เมนูทุกคน'));
    return { ok: false, code: 'PENDING',
             message: 'ยืนยันข้อมูลถูกต้องแล้ว รอ HR อนุมัติอีกขั้นหนึ่ง จะเปิดใช้งานให้ภายในวันทำการถัดไป' };
  }

  grantAccess_(userId);
  /* ไม่ส่ง push ต้อนรับ เพื่อประหยัดโควตา — หน้า LIFF แสดงข้อความต้อนรับให้แล้ว */
  return { ok: true, me: publicEmp_(r.emp) };
}

/* ================================================================
 * ประกาศ
 * ================================================================ */
function apiNews_(emp, d) {
  var list = getAnnouncements(emp, 200).map(function (a) {
    /* ★ ส่งรูป 3 ขนาดจากไฟล์เดียว โดยใช้พารามิเตอร์ความกว้างของ Google
       ถ้าส่งแต่ imageUrl ขนาดเดียว รูปย่อขนาด 72x72 ในรายการจะต้องโหลดไฟล์
       ความกว้าง 1024 (~275 KB) ทุกใบ ประกาศที่มีรูป 20 ใบ = โหลด ~5.5 MB
       เพื่อวาดสี่เหลี่ยมเล็ก ๆ ซึ่งหนักกว่าตอนยังไม่มีรูปเสียอีก */
    var thumb = '', large = '';
    if (typeof announcementImageUrl_ === 'function') {
      thumb = announcementImageUrl_(a.imageFileId, MEDIA_W_THUMB);
      large = announcementImageUrl_(a.imageFileId, MEDIA_W_FULL);
    }
    return {
      id: a.id, date: a.date, category: a.category, title: a.title,
      summary: a.summary, body: a.body,
      imageUrl: a.imageUrl,
      thumbUrl: thumb || a.imageUrl || '',
      imageUrlLarge: large || a.imageUrl || '',
      hasImage: !!(a.imageFileId || a.imageUrl),
      linkUrl: a.linkUrl, fileUrl: a.fileUrl,
      pinned: String(a.pinned).toUpperCase() === 'TRUE'
    };
  });
  if (d && d.id) list = list.filter(function (a) { return String(a.id) === String(d.id); });
  return { ok: true, items: list };
}

/* ================================================================
 * คู่มือ
 * ================================================================ */
function apiHandbook_(emp) {
  return {
    ok: true,
    items: getHandbook().map(function (h) {
      return { id: h.id, category: h.category, order: h.order, title: h.title,
               body: h.body, fileUrl: h.fileUrl, tags: h.tags };
    }),
    pdfUrl: setting('HANDBOOK_PDF_URL', ''),
    orgChartUrl: setting('ORG_CHART_URL', '')
  };
}

/* ================================================================
 * คู่มือแอป myHR Cloud
 * ================================================================ */
function apiAppGuide_() {
  return {
    ok: true,
    items: readTable(SHEETS.APPGUIDE)
      .filter(function (g) { return String(g.status).trim() !== 'hidden'; })
      .sort(function (a, b) {
        var c = (Number(a.groupOrder) || 99) - (Number(b.groupOrder) || 99);
        if (c !== 0) return c;
        return (Number(a.order) || 99) - (Number(b.order) || 99);
      })
      .map(function (g) {
        return { id: g.id, group: g.group, groupOrder: g.groupOrder, order: g.order,
                 title: g.title, body: g.body, image: g.image, tip: g.tip };
      })
  };
}

/* ================================================================
 * ตารางงาน
 * ================================================================ */

/** ทำ map จากรหัสกะ → แถวในชีต Shifts (แยกออกมาเพื่อให้สร้างครั้งเดียวแล้วใช้ร่วมกัน) */
function shiftMapOf_(shiftRows) {
  var m = {};
  (shiftRows || []).forEach(function (s) { m[String(s.shiftCode).trim()] = s; });
  return m;
}

/**
 * ตารางกะของพนักงานหนึ่งคน — แกนกลางของ getScheduleFor
 *
 * ★ ทำไมต้องรับตารางที่อ่านมาแล้วเข้ามาด้วย
 *   หน้าตารางงานต้องใช้ทั้งกะของตัวเองและกะของทีมในคำขอเดียว
 *   ถ้าแต่ละส่วนอ่านแท็บเอง จะอ่าน Schedule 2 รอบ Shifts 3 รอบต่อการเปิดหนึ่งครั้ง
 *   ส่งอาเรย์ที่อ่านมาแล้วต่อลงมาแทน = อ่านแท็บละครั้งเดียวจบ
 *
 * @param {Array=} schedRows  แถวจากแท็บ Schedule (ไม่ส่งมา = อ่านเอง)
 * @param {Object=} shiftMap  map จาก shiftMapOf_ (ไม่ส่งมา = สร้างเอง)
 */
function scheduleFor_(empCode, fromDate, toDate, schedRows, shiftMap) {
  var code = String(empCode).trim().toUpperCase();
  /* ★ empCode ว่าง = ไม่ตรงกับใครเลย ห้ามปล่อยให้ '' ไปแมตช์กับแถวที่ empCode ว่างเหมือนกัน
     (ในชีต Schedule มีแถวแบบนั้นจริง จากรูปแบบกะที่ยังจับคู่ชื่อไม่ได้) */
  if (!code) return [];
  var rows = schedRows || readTable(SHEETS.SCHEDULE);
  var map  = shiftMap  || shiftMapOf_(readTable(SHEETS.SHIFTS));

  return rows
    .filter(function (r) {
      if (String(r.empCode).trim().toUpperCase() !== code) return false;
      var d = String(r.date).trim();
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      return true;
    })
    .map(function (r) {
      var s = map[String(r.shiftCode).trim()] || {};
      return {
        date:      String(r.date).trim(),
        shiftCode: String(r.shiftCode).trim(),
        shiftName: s.label || s.name || String(r.shiftCode).trim(),
        dept:      r.dept || s.dept || '',
        start:     r.startTime || s.start || '',
        end:       r.endTime   || s.end   || '',
        breaks:    r.breaks    || s.breaks || '',
        ot:        r.ot        || s.ot     || '',
        branch:    r.branch || '',
        color:     s.color || CFG.BRAND.primary,
        note:      r.note || '',
        status:    r.status || ''
      };
    })
    .sort(function (a, b) { return a.date.localeCompare(b.date); });
}

/**
 * ตัดชีต Shifts ให้เหลือเฉพาะที่หน้าเว็บวาดจริง (คำอธิบายสีใต้ปฏิทิน)
 * ★ เดิมส่งทั้งแถวดิบออกไป ซึ่งพ่วง _row (เลขแถวจริงในชีต) และคอลัมน์ที่
 *   ไม่เคยมีใครตรวจว่าเหมาะจะออกนอกระบบไหม ติดไปด้วยทุกคอลัมน์
 *   ฟิลด์เดียวในทั้ง API ที่ยังส่งข้อมูลดิบจากชีตออกไปตรง ๆ
 */
function publicShift_(s) {
  return {
    shiftCode: String(s.shiftCode).trim(),
    label:     s.label || s.name || String(s.shiftCode).trim(),
    color:     s.color || CFG.BRAND.primary
  };
}

function apiSchedule_(emp, d) {
  var from = d.from || addDaysStr_(-7);
  var to   = d.to   || addDaysStr_(45);

  /* ★ อ่านแต่ละแท็บ "ครั้งเดียว" แล้วส่งอาเรย์ต่อลงไปให้ทุกส่วนใช้ร่วมกัน
     หน้านี้คือหน้าที่ช้าที่สุดในแอป เพราะเดิมอ่าน Schedule 2 รอบ และ Shifts 3 รอบ
     ในคำขอเดียว แม้จะมีแคชคั่นอยู่ก็ไม่ช่วยในจังหวะที่สำคัญที่สุด คือทันทีที่ HR
     แก้ตารางเสร็จ — แคชถูกล้าง แล้วพนักงานทั้งร้านเปิดดูพร้อมกันพอดี */
  var schedRows = readTable(SHEETS.SCHEDULE);
  var shiftRows = readTable(SHEETS.SHIFTS);
  var shiftMap  = shiftMapOf_(shiftRows);

  var mine = scheduleFor_(emp.empCode, from, to, schedRows, shiftMap);

  /* ถ้าเป็นหัวหน้า/HR ให้เห็นของทั้งสาขาด้วย */
  var team = [];
  var role = String(emp.role || '').trim();
  if (role === ROLES.SUPERVISOR || role === ROLES.HR || role === ROLES.ADMIN) {
    var nameMap = {};
    readTable(SHEETS.EMPLOYEES).forEach(function (e) {
      nameMap[String(e.empCode).trim().toUpperCase()] = {
        name: e.nickname || e.fullName, branch: e.branch, dept: e.dept,
        pos: e.position, status: e.status
      };
    });
    team = schedRows.filter(function (r) {
      var dt = String(r.date).trim();
      if (dt < from || dt > to) return false;
      var info = nameMap[String(r.empCode).trim().toUpperCase()];
      if (!info || info.status !== EMP_STATUS.ACTIVE) return false;
      /* หัวหน้าแผนกเห็นเฉพาะแผนกตัวเอง — HR/admin เห็นทุกแผนก
         ถ้าแผนกของหัวหน้าว่าง ต้องไม่เห็นใครเลย ไม่ใช่เห็นทุกคนที่แผนกว่าง */
      if (role === ROLES.SUPERVISOR) {
        var myDept = String(emp.dept || '').trim();
        if (!myDept || String(info.dept).trim() !== myDept) return false;
      }
      return true;
    }).map(function (r) {
      var info = nameMap[String(r.empCode).trim().toUpperCase()] || {};
      var s = shiftMap[String(r.shiftCode).trim()] || {};
      return { date: String(r.date).trim(), empCode: r.empCode, name: info.name || r.empCode,
               shiftCode: r.shiftCode, shiftName: s.label || s.name || r.shiftCode,
               dept: r.dept || s.dept || '', breaks: r.breaks || s.breaks || '', ot: r.ot || s.ot || '',
               start: r.startTime || s.start || '', end: r.endTime || s.end || '',
               branch: r.branch || info.branch || '', color: s.color || CFG.BRAND.primary };
    });
  }

  return { ok: true, mine: mine, team: team, canSeeTeam: team.length > 0 || role !== ROLES.STAFF,
           shifts: shiftRows.filter(function (s) { return String(s.shiftCode).trim(); })
                            .map(publicShift_) };
}

/* ================================================================
 * ผังองค์กร
 * ================================================================ */
function apiOrgChart_(emp) {
  var nodes = getOrgChart().filter(function (n) {
    /* ไม่แสดงคนที่พ้นสภาพแล้ว แต่ยังคงกล่องที่ยังไม่ได้ผูกกับใครไว้ (ตำแหน่งว่าง) */
    return n.active;
  }).map(function (n) {
    delete n.active;      /* ไม่ต้องส่งออกไป หน้าเว็บไม่ได้ใช้ */
    return n;
  });
  /* ★ ตรวจว่าข้อมูลที่อ่านมาสมเหตุสมผลไหม ก่อนส่งให้หน้าเว็บ
     เคยมีเคสที่อ่านได้ 61 กล่องแต่ไม่มีชื่อเลยสักกล่อง เพราะชีตมีแถวคำอธิบายคั่นอยู่
     หน้าเว็บแสดงกล่องเปล่าเรียงกันโดยไม่มีอะไรบอกว่าผิด — ต้องไม่ให้เกิดแบบนั้นอีก */
  var named = nodes.filter(function (n) { return n.name; }).length;
  var warning = '';
  if (!nodes.length) {
    warning = 'ยังไม่มีข้อมูลในชีต OrgChart — แจ้ง HR ให้นำเข้าผังองค์กร';
  } else if (named === 0) {
    warning = 'ระบบอ่านชีต OrgChart ไม่ถูกต้อง — แจ้ง HR ให้กดเมนู "🔧 ซ่อมหัวคอลัมน์ทุกชีต" ใน Google Sheets';
  } else if (named < nodes.length * 0.5) {
    warning = 'ข้อมูลผังองค์กรไม่ครบ (' + named + ' จาก ' + nodes.length + ' ตำแหน่งที่มีชื่อ) — แจ้ง HR ตรวจสอบ';
  }

  return {
    ok: true,
    nodes: nodes,
    depts: deptSummary(),
    warning: warning,
    total: named,
    myEmpCode: emp.empCode,
    myDept: emp.dept || '',
    pdfUrl: setting('ORG_CHART_URL', ''),
    updatedAt: setting('ORG_CHART_UPDATED', '')
  };
}

/* ================================================================
 * รายการรายงาน
 * ================================================================ */
function apiReports_(emp) {
  var role = String(emp.role || ROLES.STAFF).trim();
  return {
    ok: true,
    role: role,
    items: getReports(role).map(function (r) {
      return { reportId: r.reportId, title: r.title, category: r.category,
               kind: r.kind, audience: r.audience, description: r.description,
               howto: r.howto, openable: String(r.kind).toUpperCase() !== 'ORG' };
    })
  };
}

/** ข้อมูลจริงของรายงานที่เปิดดูในมือถือได้ (SELF และ DEPT เท่านั้น) */
function apiReportData_(emp, d) {
  var id = String(d.reportId || '').trim().toUpperCase();
  var role = String(emp.role || ROLES.STAFF).trim();
  var allowed = {};
  getReports(role).forEach(function (r) { allowed[String(r.reportId).toUpperCase()] = r; });
  var meta = allowed[id];
  if (!meta) return { ok: false, code: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เปิดรายงานนี้' };
  if (String(meta.kind).toUpperCase() === 'ORG') {
    return { ok: false, code: 'SHEET_ONLY',
             message: 'รายงานชุดนี้เปิดได้ใน Google Sheets เท่านั้น เพราะมีข้อมูลของทั้งองค์กร' };
  }

  if (id === 'R01') return { ok: true, kind: 'shift_next7', data: reportMyNext7_(emp) };
  if (id === 'R02') return { ok: true, kind: 'hours_month', data: reportMyHours_(emp) };
  if (id === 'R03') return { ok: true, kind: 'my_tickets',
                             data: myTickets(emp.empCode, emp.lineUserId).map(publicTicket_) };
  if (id === 'R04') return { ok: true, kind: 'my_leave', data: reportMyLeave_(emp) };
  /* ★ ป้องกันซ้ำอีกชั้น: สิทธิ์รายงานมาจากชีต Reports ซึ่ง HR แก้เองได้
     ถ้าเผลอตั้ง audience = ALL ข้อมูลทั้งแผนกจะหลุดถึงพนักงาน 60 คนทันที
     สองบรรทัดนี้ทำให้ความผิดพลาดในชีตไม่กลายเป็นช่องโหว่ */
  if (id === 'R05' || id === 'R06') {
    if ([ROLES.SUPERVISOR, ROLES.HR, ROLES.ADMIN].indexOf(role) < 0) {
      return { ok: false, code: 'FORBIDDEN', message: 'รายงานนี้เปิดได้เฉพาะหัวหน้าแผนกขึ้นไป' };
    }
  }
  if (id === 'R05') return { ok: true, kind: 'dept_week', data: reportDeptWeek_(emp) };
  if (id === 'R06') return { ok: true, kind: 'coverage', data: reportDeptCoverage_(emp) };
  return { ok: false, code: 'NOT_IMPLEMENTED', message: 'ยังไม่รองรับรายงานนี้บนมือถือ' };
}

function reportMyNext7_(emp) {
  return getScheduleFor(emp.empCode, todayStr_(), addDaysStr_(7));
}

function reportMyHours_(emp) {
  /* ★ ต้องปิดที่ "วันสุดท้ายของเดือนนี้" จริงๆ
     เดิมใช้ +40 วัน ทำให้กินไปเกือบทั้งเดือนหน้า ตัวเลขจึงพองเป็นเกือบสองเท่า
     ทั้งที่การ์ดเขียนว่า "เดือนนี้" — พนักงานจะเอาไปเทียบกับสลิปแล้วไม่ตรง */
  var today = todayStr_();
  var first = today.slice(0, 8) + '01';
  var d = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0);  // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้
  var last = Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd');

  var rows = getScheduleFor(emp.empCode, first, last);
  var days = 0, mins = 0, otMins = 0, offDays = 0, breakMins = 0;
  rows.forEach(function (r) {
    if (r.shiftCode === 'OFF') { offDays++; return; }
    if (r.shiftCode === 'LV')  { return; }
    if (!r.start || !r.end) return;
    days++;
    var gross = minsBetween_(r.start, r.end);
    var br = breakMinutes_(r.breaks);
    breakMins += br;
    mins += Math.max(0, gross - br);          /* ★ หักเวลาพัก ไม่งั้นสูงเกินจริงราว 12% */
    otMins += otMinutesFor_(r.ot, r.date);
  });
  return {
    month: first.slice(0, 7),
    from: first, to: last,
    days: days, offDays: offDays,
    hours: Math.round(mins / 6) / 10,
    breakHours: Math.round(breakMins / 6) / 10,
    otHours: Math.round(otMins / 6) / 10,
    note: 'เป็นชั่วโมงตามตารางที่จัดไว้ หักเวลาพักแล้ว ไม่ใช่เวลาที่สแกนจริงในแอป myHR Cloud'
  };
}

/** รวมนาทีจากข้อความเวลาพัก เช่น "07:00-07:15, 12:30-13:15" → 60 */
function breakMinutes_(txt) {
  var t = String(txt || ''), total = 0;
  var re = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g, m;
  while ((m = re.exec(t)) !== null) total += minsBetween_(m[1], m[2]);
  return total;
}

/**
 * นาที OT ของกะนั้นในวันนั้น
 * ★ คอลัมน์ ot เป็นข้อความไทยที่มีเงื่อนไขวันติดมาด้วย เช่น
 *     "OT 20:00-21:00 ทุกวันทำงาน"        → นับทุกวันที่เข้ากะ
 *     "OT 11:00-12:30 เฉพาะเสาร์-อาทิตย์"  → นับเฉพาะเสาร์-อาทิตย์
 *   ถ้าดึงแค่ช่วงเวลาโดยไม่ดูเงื่อนไข จะนับ OT ของแคชเชียร์เกินจริง 3 เท่า
 */
function otMinutesFor_(txt, dateStr) {
  var t = String(txt || '');
  if (!t) return 0;
  var re = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g, m, total = 0;
  while ((m = re.exec(t)) !== null) total += minsBetween_(m[1], m[2]);
  if (!total) return 0;

  var dow = -1;
  try { dow = new Date(String(dateStr).slice(0, 10) + 'T00:00:00+07:00').getDay(); } catch (e) {}
  var TH_DOW = { 'อาทิตย์': 0, 'จันทร์': 1, 'อังคาร': 2, 'พุธ': 3, 'พฤหัส': 4, 'ศุกร์': 5, 'เสาร์': 6 };

  /* มีคำว่า "เฉพาะ" = จำกัดเฉพาะวันที่ระบุไว้ */
  if (t.indexOf('เฉพาะ') >= 0) {
    var allow = {};
    Object.keys(TH_DOW).forEach(function (k) {
      if (t.indexOf(k) >= 0) allow[TH_DOW[k]] = true;
    });
    /* ระบุเป็นช่วง เช่น "เสาร์-อาทิตย์" ก็ยังจับได้ เพราะเจอทั้งสองคำในข้อความ */
    if (Object.keys(allow).length && !allow[dow]) return 0;
  }
  return total;
}

function minsBetween_(a, b) {
  var p = String(a).split(':'), q = String(b).split(':');
  var s = Number(p[0]) * 60 + Number(p[1]), e = Number(q[0]) * 60 + Number(q[1]);
  if (isNaN(s) || isNaN(e)) return 0;
  if (e < s) e += 24 * 60;            // กะข้ามเที่ยงคืน
  return e - s;
}

function reportMyLeave_(emp) {
  var code = String(emp.empCode).trim().toUpperCase();
  if (!code) return [];
  return readTable(SHEETS.LEAVE).filter(function (l) {
    return String(l.empCode).trim().toUpperCase() === code;
  }).map(function (l) {
    /* ★ ส่ง approved ออกไปเป็น true/false ให้หน้าเว็บใช้แทนการเทียบข้อความเอง
       เดิม reports.html เทียบ status === 'approved' (อังกฤษ) แต่ระบบเขียนคำไทย
       ยอดรวม "วันลาที่อนุมัติแล้ว" จึงเป็น 0 ตลอดกาล
       status ยังส่งคำไทยตามเดิมไว้แสดงผล — ไม่เปลี่ยนรูปร่างคำตอบเดิม */
    return { leaveId: l.leaveId, type: l.type, dateFrom: l.dateFrom, dateTo: l.dateTo,
             days: l.days, status: l.status, decidedAt: l.decidedAt, remark: l.remark,
             approved: normalizeLeaveStatus(l.status) === LEAVE_STATUS.APPROVED };
  }).sort(function (a, b) { return String(b.dateFrom).localeCompare(String(a.dateFrom)); });
}

function reportDeptWeek_(emp) {
  var dept = String(emp.dept || '').trim();
  /* ★ แผนกว่าง = ไม่ตรงกับใครเลย ห้ามปล่อยให้ '' ไปแมตช์กับทุกคนที่แผนกว่างเหมือนกัน
     หัวหน้าที่ยังไม่ได้กรอกแผนกจะเห็นตารางของคนอื่นทั้งหมดโดยไม่ตั้งใจ */
  if (!dept) return { dept: '', from: todayStr_(), to: addDaysStr_(7), rows: [],
                      warning: 'ยังไม่ได้ระบุแผนกในทะเบียนพนักงานของคุณ กรุณาแจ้ง HR' };
  var from = todayStr_(), to = addDaysStr_(7);
  var name = {};
  readTable(SHEETS.EMPLOYEES).forEach(function (e) {
    if (String(e.status).trim() === EMP_STATUS.RESIGNED) return;
    name[String(e.empCode).trim().toUpperCase()] = e;
  });
  var shiftMap = shiftMapOf_(readTable(SHEETS.SHIFTS));

  var out = [];
  readTable(SHEETS.SCHEDULE).forEach(function (r) {
    var dt = String(r.date).trim();
    if (dt < from || dt > to) return;
    var e = name[String(r.empCode).trim().toUpperCase()];
    if (!e) return;
    if (String(e.dept).trim() !== dept) return;
    var sf = shiftMap[String(r.shiftCode).trim()] || {};
    out.push({ date: dt, empCode: r.empCode, name: e.nickname || e.fullName,
               shiftCode: r.shiftCode, shiftName: sf.label || r.shiftCode,
               start: r.startTime || sf.start || '', end: r.endTime || sf.end || '',
               color: sf.color || CFG.BRAND.primary });
  });
  return { dept: dept, from: from, to: to,
           rows: out.sort(function (a, b) {
             return a.date === b.date ? String(a.start).localeCompare(String(b.start))
                                      : a.date.localeCompare(b.date);
           }) };
}

function reportDeptCoverage_(emp) {
  var w = reportDeptWeek_(emp);
  var byDay = {}, order = [];
  w.rows.forEach(function (r) {
    if (r.shiftCode === 'OFF' || r.shiftCode === 'LV') return;
    if (!byDay[r.date]) { byDay[r.date] = { date: r.date, shifts: {}, total: 0 }; order.push(r.date); }
    byDay[r.date].total++;
    byDay[r.date].shifts[r.shiftCode] = (byDay[r.date].shifts[r.shiftCode] || 0) + 1;
  });
  var days = order.sort().map(function (d) {
    var x = byDay[d];
    return { date: d, total: x.total,
             detail: Object.keys(x.shifts).sort().map(function (k) {
               return k + ' × ' + x.shifts[k];
             }).join('  ·  ') };
  });
  var avg = days.length ? days.reduce(function (a, b) { return a + b.total; }, 0) / days.length : 0;
  days.forEach(function (d) { d.low = avg > 0 && d.total < Math.max(1, Math.floor(avg * 0.7)); });
  return { dept: w.dept, avg: Math.round(avg * 10) / 10, days: days };
}

/* ================================================================
 * FAQ
 * ================================================================ */
function apiFaq_() {
  return { ok: true, items: getFaqs().map(function (f) {
    return { id: f.id, category: f.category, question: f.question, answer: f.answer,
             linkLabel: f.linkLabel, linkUrl: f.linkUrl,
             top: String(f.top).toUpperCase() === 'TRUE' };
  })};
}

/* ================================================================
 * ส่งเรื่องถึง HR
 * ================================================================ */
function apiTicketCreate_(emp, userId, d) {
  var subject = String(d.subject || '').trim();
  var detail  = String(d.detail || '').trim();
  if (!subject) return { ok: false, code: 'INPUT', message: 'กรุณากรอกหัวข้อเรื่อง' };
  if (detail.length < 5) return { ok: false, code: 'INPUT', message: 'กรุณาอธิบายรายละเอียดอย่างน้อย 5 ตัวอักษร' };

  /* กันสแปม: 5 เรื่อง/ชั่วโมง */
  var cache = CacheService.getScriptCache();
  var k = 'tk_' + userId;
  var n = Number(cache.get(k) || 0);
  if (n >= 5) return { ok: false, code: 'RATE', message: 'ส่งเรื่องบ่อยเกินไป กรุณารอสักครู่' };
  cache.put(k, String(n + 1), 3600);

  var privacy = d.privacy || PRIVACY.NORMAL;
  var res = createTicket({
    empCode: emp.empCode, name: emp.fullName, branch: emp.branch, lineUserId: userId,
    category: d.category || 'other', privacy: privacy,
    subject: subject, detail: detail, priority: d.priority || 'ปกติ'
  });

  /* (เดิมมี findTicket(res.ticketId) ตรงนี้ ซึ่งอ่านแท็บ Tickets ทั้งแท็บ
     แล้วไม่ได้ถูกใช้ที่ไหนเลย — แท็บนี้โตขึ้นทุกวันและไม่มีวันเล็กลง) */

  /* ---- แจ้งทีม HR ทางอีเมล (โหมด 0 บาท — ไม่ใช้โควตาข้อความ) ---- */
  try {
    var anon = (privacy === PRIVACY.ANONYMOUS);
    var urgent = (data_cat(d) === 'complaint' || data_cat(d) === 'problem');
    notifyHrEmail((urgent ? '🔴 ด่วน — ' : '') + 'เรื่องใหม่ ' + res.ticketId + ' · ' + res.category,
      emailTemplate_('มีเรื่องใหม่เข้ามา', [
        ['รหัสเรื่อง', res.ticketId],
        ['ประเภท', res.category],
        ['ผู้แจ้ง', anon ? '🔒 ไม่ระบุตัวตน' : (emp.fullName + ' (' + emp.empCode + ')')],
        ['สาขา', anon ? '-' : (emp.branch || '-')],
        ['ครบกำหนดตอบ', 'ภายใน ' + res.sla + ' วันทำการ'],
        ['หัวข้อ', escHtml_(subject)]
      ], '<b>รายละเอียด</b><br>' + escHtml_(detail).replace(/\n/g, '<br>') +
         (urgent ? '<br><br><b style="color:#B3261E">เรื่องประเภทนี้ต้องตอบภายใน 1 วันทำการ</b>' : '')));
  } catch (e) { console.error('notify HR failed: ' + e); }

  /* ไม่ push ยืนยันกลับผู้ส่ง — หน้า LIFF แสดงรหัสเรื่องให้แล้ว และประหยัดโควตา
     เมื่อ HR ตอบ ระบบจะติดจุดแดงบนเมนู "ติดต่อ HR" ให้แทน (ดู replyTicketSelected) */

  audit(privacy === PRIVACY.ANONYMOUS ? '(anonymous)' : emp.empCode,
        'TICKET_CREATE', res.ticketId, d.category + ' / ' + privacy);

  return { ok: true, ticketId: res.ticketId, sla: res.sla, privacy: privacy };
}

/* ================================================================
 * ยื่นใบลา
 * ================================================================ */
function apiLeaveCreate_(emp, userId, d) {
  if (!d.type || !d.dateFrom) return { ok: false, code: 'INPUT', message: 'กรุณาเลือกประเภทการลาและวันที่' };
  var r = createLeave({
    empCode: emp.empCode, name: emp.fullName, branch: emp.branch,
    type: d.type, dateFrom: d.dateFrom, dateTo: d.dateTo || d.dateFrom,
    days: d.days || 1, reason: d.reason || ''
  });
  try {
    notifyHrEmail('ใบลาใหม่ ' + r.leaveId + ' · ' + emp.fullName,
      emailTemplate_('มีใบลาใหม่รออนุมัติ', [
        ['รหัสใบลา', r.leaveId],
        ['พนักงาน', emp.fullName + ' (' + emp.empCode + ')'],
        ['สาขา', emp.branch || '-'],
        ['ประเภท', escHtml_(String(d.type))],
        ['วันที่', String(d.dateFrom) + (d.dateTo && d.dateTo !== d.dateFrom ? (' ถึง ' + d.dateTo) : '')],
        ['จำนวน', String(d.days || 1) + ' วัน']
      ], '<b>เหตุผล</b><br>' + escHtml_(String(d.reason || '-'))));
  } catch (e) { console.error('notify leave failed: ' + e); }
  audit(emp.empCode, 'LEAVE_CREATE', r.leaveId, d.type + ' ' + d.dateFrom);
  return { ok: true, leaveId: r.leaveId };
}
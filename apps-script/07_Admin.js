/*******************************************************************
 * โก๋ในซอย HR Hub — 07_Admin.gs
 * เมนูสำหรับแอดมินใน Google Sheets + งานดูแลระบบทั้งหมด
 *******************************************************************/

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏪 HR Hub')
    .addItem('① สร้าง/ซ่อมฐานข้อมูล', 'initDatabase')
    .addItem('② ตรวจสอบการตั้งค่า', 'checkConfig')
    .addItem('③ 🩺 ตรวจ Webhook URL (แก้ error 302)', 'testWebhookUrl')
    .addItem('④ 📡 LINE ส่งข้อมูลเข้ามาจริงไหม', 'checkWebhookTraffic')
    .addItem('⑤ 🔧 ซ่อมหัวคอลัมน์ทุกชีต', 'repairSheetHeaders')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('📢 ประกาศ')
      .addItem('🟢 เผยแพร่ประกาศที่เลือก (ฟรี — ติดจุดแดงบนเมนู)', 'publishSelectedAnnouncement')
      .addItem('🟢 เผยแพร่ประกาศที่ค้างทั้งหมด (ฟรี)', 'publishPendingAnnouncements')
      .addSeparator()
      .addItem('🔴 ส่งด่วนเข้าแชททุกคน (ใช้โควตา!)', 'emergencyBroadcast')
      .addSeparator()
      .addItem('🗑️ ถอนรูปออกจากประกาศ (แถวปัจจุบัน)', 'removeSelectedAnnouncementImage')
      .addItem('🔁 ออก URL รูปใหม่ทั้งหมด', 'regenerateAllAnnouncementImageUrls'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('👥 พนักงาน')
      .addItem('เปิดสิทธิ์ผู้ที่ active ทั้งหมด (ซิงก์เมนู)', 'syncAllRichMenus')
      .addItem('🚪 ตัดสิทธิ์พนักงานลาออก (แถวปัจจุบัน)', 'offboardSelectedEmployee')
      .addItem('🔄 รีเซ็ตการผูก LINE (แถวปัจจุบัน)', 'resetLineBinding')
      .addItem('🔗 ผูกบัญชี LINE ให้พนักงาน (แถวปัจจุบัน)', 'bindLineManually')
      .addItem('📋 ตรวจสอบสุขภาพข้อมูลพนักงาน', 'auditEmployees'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('💬 เรื่องถึง HR')
      .addItem('ส่งคำตอบให้ผู้แจ้ง (แถวปัจจุบัน)', 'replyTicketSelected')
      .addItem('✅ ปิดเรื่อง (แถวปัจจุบัน)', 'closeTicketSelected')
      .addItem('ดูเรื่องที่เกินกำหนด', 'showOverdueTickets')
      .addSeparator()
      .addItem('🔁 แปลงคำสถานะเดิมให้ตรงกัน (ทำครั้งเดียว)', 'migrateStatusVocabulary'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('🗓️ ตารางงาน')
      .addItem('🟢 แจ้งว่าตารางใหม่ออกแล้ว (ฟรี)', 'refreshNewsBadge')
      .addItem('🗓️ สร้างตารางกะจากรูปแบบ (ShiftPattern)', 'generateScheduleFromPattern')
      .addItem('📅 ดูลิงก์ปฏิทินของพนักงาน (แถวปัจจุบัน)', 'showIcsLink'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('📊 รายงาน')
      .addItem('กำลังพลรายแผนก', 'reportHeadcount')
      .addItem('ความครอบคลุมกะ', 'reportShiftCoverage')
      .addItem('สถานะการยืนยันตัวตน', 'reportVerification')
      .addItem('สรุปเรื่องถึง HR (SLA)', 'reportTickets')
      .addItem('สรุปการลา', 'reportLeave')
      .addSeparator()
      .addItem('⚠️ รายชื่อที่ต้องยืนยัน (ตารางกะ ↔ ทะเบียน)', 'reportRosterGaps')
      .addItem('🩺 สุขภาพระบบ', 'reportSystemHealth'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('📝 แบบทดสอบ')
      .addItem('① ติดตั้งระบบแบบทดสอบ (สร้างแท็บ)', 'ensureFormsSheets')
      .addItem('② ใส่ชุดข้อสอบตั้งต้น (เฉพาะตอนยังว่าง)', 'seedFormsIfEmpty_')
      .addItem('ตรวจความครอบคลุมของข้อสอบ', 'showFormsCoverage'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('🎛️ Rich Menu')
      .addItem('สร้าง/อัปเดต Rich Menu ทั้งหมด', 'setupRichMenus')
      .addItem('ดูรายการ Rich Menu ปัจจุบัน', 'showRichMenus')
      .addItem('ลบ Rich Menu ที่ไม่ใช้แล้ว', 'cleanupRichMenus'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('💾 สำรองข้อมูล')
      .addItem('สำรองข้อมูลเดี๋ยวนี้', 'backupDatabaseUi')
      .addItem('ดูสำเนาที่มีอยู่', 'showBackupFolder'))
    .addSeparator()
    .addItem('📊 สรุปการใช้งาน / โควตาข้อความ', 'showDashboard')
    .addItem('🔄 ล้างจุดแดงทุกคน (ซ่อมระบบ)', 'resetAllBadgesUi')
    .addItem('⏰ ติดตั้งงานอัตโนมัติ (Triggers)', 'installTriggers')
    .addToUi();
}

function ui_() { return SpreadsheetApp.getUi(); }
function alert_(title, msg) { ui_().alert(title, msg, ui_().ButtonSet.OK); }
function confirm_(title, msg) { return ui_().alert(title, msg, ui_().ButtonSet.YES_NO) === ui_().Button.YES; }

/* ================================================================
 * ① สร้างฐานข้อมูล
 * ================================================================ */
var SCHEMA = {
  Employees: ['empCode','prefix','firstName','lastName','fullName','nickname','position','dept','role',
              'reportsTo','branch','startDate','phone','phoneLast4','lineUserId','lineName','status',
              'verifiedAt','offboardedAt','note'],
  OrgChart: ['nodeId','level','titleTh','titleEn','empCode','dept','parentId','order','group','note'],
  Announcements: ['id','date','category','title','summary','body','imageUrl','fileUrl','linkUrl',
                  'audience','audienceValue','pinned','publishAt','expireAt','status','autoBroadcast',
                  'broadcastedAt','createdBy'],
  Handbook: ['id','category','order','title','body','fileUrl','tags','status','updatedAt'],
  AppGuide: ['id','group','groupOrder','order','title','body','image','tip','status'],
  Schedule: ['date','empCode','dept','shiftCode','startTime','endTime','breaks','ot','branch','note','status'],
  Shifts: ['shiftCode','dept','label','start','end','breaks','ot','color','active'],
  ShiftPattern: ['rosterName','empCode','dept','shiftCode','days','effectiveFrom','effectiveTo','match','note'],
  Reports: ['reportId','title','category','kind','audience','description','howto','sheetFn','status','updatedAt'],
  FAQ: ['id','category','keywords','question','answer','linkLabel','linkUrl','top','active'],
  Tickets: ['ticketId','createdAt','empCode','name','branch','lineUserId','category','categoryId','privacy',
            'subject','detail','attachment','priority','status','assignee','slaDue','reply','closedAt'],
  Leave: ['leaveId','createdAt','empCode','name','branch','type','dateFrom','dateTo','days','reason',
          'status','approver','decidedAt','remark'],
  AuditLog: ['timestamp','actor','action','target','detail'],
  BroadcastLog: ['timestamp','type','title','audience','recipients','by'],
  Settings: ['key','value','note']
};

function initDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = SCHEMA[name];
    var cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
    // เติมคอลัมน์ที่ขาด โดยไม่ลบของเดิม
    var missing = head.filter(function (h) { return cur.indexOf(h) < 0; });
    if (cur.filter(String).length === 0) {
      sh.getRange(1, 1, 1, head.length).setValues([head]);
    } else if (missing.length) {
      sh.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]);
    }
    var n = Math.max(sh.getLastColumn(), head.length);
    sh.getRange(1, 1, 1, n)
      .setBackground(CFG.BRAND.primary).setFontColor('#FFFFFF').setFontWeight('bold')
      .setVerticalAlignment('middle');
    sh.setFrozenRows(1);
    sh.setRowHeight(1, 34);
  });

  seedIfEmpty_();
  protectSensitive_();
  alert_('เสร็จเรียบร้อย', '✅ สร้าง/ซ่อมฐานข้อมูลครบ ' + Object.keys(SCHEMA).length + ' ชีตแล้ว\n\nขั้นต่อไป: ใส่รายชื่อพนักงานในชีต Employees แล้วรัน "② ตรวจสอบการตั้งค่า"');
}

function seedIfEmpty_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  /* Shifts — ใส่เฉพาะรหัสสถานะพื้นฐาน กะจริงของแต่ละแผนกให้นำเข้าจากไฟล์ xlsx */
  var shShift = ss.getSheetByName('Shifts');
  if (shShift.getLastRow() < 2) {
    shShift.getRange(2, 1, 3, 9).setValues([
      ['OFF','*','วันหยุดประจำสัปดาห์','','','','','#9E8B76','TRUE'],
      ['LV', '*','ลา (ตามใบลาที่อนุมัติ)','','','','','#C89A52','TRUE'],
      ['TR', '*','อบรม/ประชุม','','','','','#3D6EB4','TRUE']
    ]);
  }

  var shSet = ss.getSheetByName('Settings');
  if (shSet.getLastRow() < 2) {
    shSet.getRange(2, 1, 14, 3).setValues([
      ['HANDBOOK_PDF_URL',    '', 'ลิงก์ Google Drive ของคู่มือพนักงาน (ตั้งเป็น "ทุกคนที่มีลิงก์ = ผู้อ่าน")'],
      ['ORG_CHART_URL',       '', 'ลิงก์ผังองค์กร PDF'],
      ['HR_PHONE',            '', 'เบอร์ HR สำหรับเรื่องด่วน'],
      ['HR_OFFICE_HOURS',     'จันทร์–เสาร์ 09:00–18:00', 'เวลาทำการของ HR'],
      ['HR_EMAIL',            'futurexkohnaisoi@gmail.com', '★ อีเมลทีม HR — ระบบใช้แทนการ push เข้าไลน์ (ใส่หลายอันคั่นด้วยจุลภาค)'],
      ['HR_EMAIL_ENABLED',    'TRUE',  'ส่งอีเมลสรุปงานค้างให้ HR ทุกวัน 09:00'],
      ['BADGE_ENABLED',       'TRUE',  'ใช้จุดแดงบนเมนูแจ้งเตือนแทนการส่งข้อความ (ฟรี)'],
      ['PAID_MODE',           'FALSE', '★ FALSE = โหมด 0 บาท ไม่ส่ง push เลย / TRUE = เปิดใช้เมื่ออัปเกรดแพ็กเกจแล้ว'],
      ['QUOTA_RESERVE',       '100',   'จำนวนข้อความที่สงวนไว้ห้ามแตะ เผื่อเหตุฉุกเฉิน'],
      ['PDPA_NOTICE_URL',     '', 'ลิงก์ประกาศความเป็นส่วนตัวสำหรับพนักงาน'],
      ['WELCOME_NOTE',        'ยินดีต้อนรับสู่ครอบครัวโก๋ในซอย', 'ข้อความต้อนรับ'],
      ['VERIFY_REQUIRE_APPROVAL','FALSE','★ TRUE = พนักงานยืนยันแล้วต้องรอ HR เปลี่ยนสถานะเป็น active ก่อนจึงใช้ได้ (ปลอดภัยกว่า)'],
      ['SCHEDULE_WEEKS_AHEAD','6','สร้างตารางกะล่วงหน้ากี่สัปดาห์เมื่อกดเมนู "สร้างตารางกะจากรูปแบบ"'],
      ['ORG_CHART_UPDATED',   '', 'วันที่ปรับผังองค์กรครั้งล่าสุด แสดงในหน้าผังองค์กร']
    ]);
  }
}

/** ล็อกคอลัมน์อ่อนไหวไม่ให้คนทั่วไปแก้ */
function protectSensitive_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ['AuditLog', 'BroadcastLog'].forEach(function (n) {
      var sh = ss.getSheetByName(n);
      if (!sh) return;
      var ps = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      if (!ps.length) {
        sh.protect().setDescription('ห้ามแก้ไข — บันทึกอัตโนมัติเพื่อการตรวจสอบ').setWarningOnly(true);
      }
    });
  } catch (e) { console.warn(e); }
}

/* ================================================================
 * 📢 ประกาศ — โหมด 0 บาท
 * "เผยแพร่" = ทำให้ประกาศโผล่ในเว็บแอป + ติดจุดแดงบนเมนู (0 ข้อความ)
 * "ส่งด่วน" = ยิงเข้าแชทจริง ใช้โควตา ใช้เฉพาะเหตุฉุกเฉิน
 * ================================================================ */
function publishSelectedAnnouncement() {
  var a = pickAnnouncementRow_();
  if (!a) return;
  /* ตรวจว่าลิงก์รูปยังเปิดได้จริงก่อนส่งถึงพนักงาน 60 คน
     ถ้าไฟล์ถูกลบหรือสิทธิ์ถูกเปลี่ยน การ์ด Flex จะขึ้นรูปแตกและแก้ย้อนหลังไม่ได้ */
  if (typeof announcementImageProblem_ === 'function') {
    var imgWarn = announcementImageProblem_(a);
    if (imgWarn && !confirm_('รูปในประกาศมีปัญหา', imgWarn + '\n\nเผยแพร่ต่อโดยไม่มีรูปหรือไม่?')) return;
  }
  var n = notifyAnnouncement_(a, true);
  alert_('เผยแพร่แล้ว ✅',
    '📢 ' + a.title + '\n\n' +
    'พนักงาน ' + n + ' คนจะเห็นจุดแดงบนเมนู “ประกาศและข่าวสาร” เมื่อเปิดแชทครั้งถัดไป\n\n' +
    '💰 ใช้โควตาข้อความ: 0');
}

function publishPendingAnnouncements() {
  var list = readTable(SHEETS.ANNOUNCEMENTS).filter(function (a) {
    return String(a.status).trim() === 'published' && !String(a.broadcastedAt).trim();
  });
  if (!list.length) { alert_('ไม่มีอะไรค้าง', 'ประกาศที่เผยแพร่แล้วถูกแจ้งครบทุกฉบับ'); return; }
  if (!confirm_('ยืนยัน', 'จะเผยแพร่ประกาศ ' + list.length + ' ฉบับ\nใช้โควตาข้อความ 0 — ดำเนินการเลยหรือไม่?')) return;

  /* ★ ต้องบวกสะสม ไม่ใช่ทับค่าเดิม
     เดิมเขียน n = notify(...) ในลูป ตัวเลขที่ขึ้นในกล่องสรุปจึงเป็นจำนวนผู้รับ
     ของ "ประกาศฉบับสุดท้าย" ฉบับเดียว ประกาศเจาะกลุ่มคนเดียวที่อยู่ท้ายคิว
     ทำให้ขึ้นว่า "แจ้ง 1 คน" ทั้งที่เพิ่งแจ้งไปทั้งร้าน */
  var n = 0, failed = 0;
  list.forEach(function (a) {
    /* ประกาศฉบับหนึ่งพังต้องไม่ทำให้ฉบับที่เหลือไม่ถูกเผยแพร่ */
    try { n += notifyAnnouncement_(a, false); }
    catch (e) { failed++; console.error('publishPending: ' + a.id + ' ' + e); }
  });
  alert_('เผยแพร่เสร็จแล้ว ✅',
    'ประกาศ ' + (list.length - failed) + ' ฉบับ · แจ้งเตือนรวม ' + n + ' ครั้ง · ใช้โควตา 0\n' +
    '(นับซ้ำได้ ถ้าพนักงานคนเดียวอยู่ในกลุ่มเป้าหมายของหลายฉบับ)' +
    (failed ? ('\n\n⚠️ มี ' + failed + ' ฉบับที่แจ้งไม่สำเร็จ — ดูรายละเอียดที่ Apps Script > Executions') : ''));
}

/**
 * ★ หัวใจของโหมด 0 บาท
 * ไม่ส่งข้อความ แต่ติดจุดแดงบนเมนูของพนักงานที่อยู่ในกลุ่มเป้าหมาย
 */
function notifyAnnouncement_(a, showAlert) {
  var ids = audienceUserIds_(a);
  if (!ids.length) {
    if (showAlert) alert_('ไม่มีผู้รับ', 'ไม่พบพนักงานที่ตรงเงื่อนไข หรือยังไม่มีใครยืนยันตัวตน');
    return 0;
  }
  var n = broadcastBadge(ids, 'news');
  updateRow(SHEETS.ANNOUNCEMENTS, a._row, { broadcastedAt: now_() });
  appendRow(SHEETS.BROADCAST, {
    timestamp: now_(), type: 'badge_news', title: a.title,
    audience: String(a.audience || 'all'), recipients: n, by: actor_()
  });
  audit(actor_(), 'PUBLISH', a.id, a.title + ' → ' + n + ' คน (0 ข้อความ)');
  return n;
}

/** หา userId ของกลุ่มเป้าหมายตามคอลัมน์ audience */
function audienceUserIds_(a) {
  var aud = String(a.audience || 'all').trim();
  var val = String(a.audienceValue || '').trim();
  if (aud === 'person' && val) {
    var codes = val.split(',').map(function (s) { return s.trim().toUpperCase(); });
    return readTable(SHEETS.EMPLOYEES)
      .filter(function (e) { return isActive(e) && codes.indexOf(String(e.empCode).trim().toUpperCase()) >= 0 && e.lineUserId; })
      .map(function (e) { return String(e.lineUserId).trim(); });
  }
  var filter = {};
  if (aud === 'branch' && val) filter.branch = val;
  if (aud === 'dept'   && val) filter.dept   = val;
  if (aud === 'role'   && val) filter.role   = val;
  return activeUserIds(Object.keys(filter).length ? filter : null);
}

/**
 * 🔴 ส่งด่วนเข้าแชทจริง — ใช้โควตา
 * ใช้เฉพาะเรื่องที่รอให้พนักงานเปิดแอปเองไม่ได้ เช่น ร้านปิดฉุกเฉิน น้ำท่วม
 */
function emergencyBroadcast() {
  var a = pickAnnouncementRow_();
  if (!a) return;
  var ids = audienceUserIds_(a);
  if (!ids.length) { alert_('ไม่มีผู้รับ', 'ไม่พบพนักงานที่ตรงเงื่อนไข'); return; }

  var q = quotaLeft_();
  if (!confirm_('⚠️ ยืนยันการส่งด่วน',
      '📢 ' + a.title + '\n\n' +
      'ผู้รับ: ' + ids.length + ' คน\n' +
      'จะใช้โควตา: ' + ids.length + ' ข้อความ\n' +
      'โควตาคงเหลือขณะนี้: ' + q.left + ' / ' + (q.limit || 'ไม่จำกัด') + '\n\n' +
      'โหมดปกติควรใช้ “เผยแพร่ (ฟรี)” แทน\n' +
      'ใช้ปุ่มนี้เฉพาะเรื่องด่วนที่รอไม่ได้จริงๆ เท่านั้น\n\nยืนยันส่งเลยหรือไม่?')) return;

  var ok = safePush(ids, flexAnnouncement(a), true);
  if (!ok) { alert_('ส่งไม่สำเร็จ', 'โควตาไม่พอ หรือเกิดข้อผิดพลาด — ตรวจสอบที่ Executions'); return; }

  updateRow(SHEETS.ANNOUNCEMENTS, a._row, { broadcastedAt: now_() });
  appendRow(SHEETS.BROADCAST, { timestamp: now_(), type: 'emergency', title: a.title,
    audience: String(a.audience || 'all'), recipients: ids.length, by: actor_() });
  audit(actor_(), 'EMERGENCY_BROADCAST', a.id, a.title + ' → ' + ids.length + ' คน');
  alert_('ส่งด่วนสำเร็จ ✅', 'ส่งถึงพนักงาน ' + ids.length + ' คนแล้ว\nโควตาคงเหลือประมาณ ' + Math.max(0, q.left - ids.length));
}

function pickAnnouncementRow_() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.ANNOUNCEMENTS) { alert_('ผิดชีต', 'กรุณาไปที่ชีต Announcements แล้วคลิกแถวประกาศที่ต้องการ'); return null; }
  var row = sh.getActiveRange().getRow();
  if (row < 2) { alert_('เลือกแถว', 'กรุณาคลิกที่แถวของประกาศก่อน'); return null; }
  var a = readTable(SHEETS.ANNOUNCEMENTS).filter(function (x) { return x._row === row; })[0];
  if (!a) { alert_('ไม่พบข้อมูล', 'แถวนี้ว่าง'); return null; }
  return a;
}

function actor_() {
  try { return Session.getActiveUser().getEmail() || 'admin'; } catch (e) { return 'admin'; }
}

function resetAllBadgesUi() {
  if (!confirm_('ล้างจุดแดงทุกคน', 'จะล้างจุดแดงบนเมนูของพนักงานทุกคน และตั้งเมนูกลับเป็นแบบปกติ\nดำเนินการเลยหรือไม่?')) return;
  var n = resetAllBadges();
  alert_('เรียบร้อย', 'ล้างจุดแดงและซิงก์เมนูให้พนักงาน ' + n + ' คนแล้ว');
}

/** แสดงลิงก์ปฏิทินกะงานของพนักงาน (ไว้ช่วยพนักงานตั้งค่า) */
function showIcsLink() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.EMPLOYEES) { alert_('ผิดชีต', 'กรุณาไปที่ชีต Employees แล้วคลิกแถวของพนักงาน'); return; }
  var emp = readTable(SHEETS.EMPLOYEES).filter(function (x) { return x._row === sh.getActiveRange().getRow(); })[0];
  if (!emp) return;
  var url = icsUrl(emp.empCode);
  alert_('ลิงก์ปฏิทินของ ' + emp.fullName,
    url ? (url + '\n\nพนักงานกดปุ่ม “เพิ่มลงปฏิทินมือถือ” ในหน้าตารางงานได้เอง\nลิงก์นี้ใช้เมื่อต้องช่วยตั้งค่าให้เท่านั้น')
        : 'ยังไม่ได้ตั้งค่า WEBAPP_URL ใน Script Properties');
}

/* ================================================================
 * 👥 จัดการพนักงาน
 * ================================================================ */
function syncAllRichMenus() {
  if (!CFG.richMenuMain) { alert_('ยังไม่มี Rich Menu', 'กรุณารัน "สร้าง/อัปเดต Rich Menu ทั้งหมด" ก่อน'); return; }
  var rows = readTable(SHEETS.EMPLOYEES).filter(function (e) { return String(e.lineUserId).trim(); });
  var on  = rows.filter(isActive).map(function (e) { return String(e.lineUserId).trim(); });
  var off = rows.filter(function (e) { return !isActive(e); }).map(function (e) { return String(e.lineUserId).trim(); });

  var okOn = 0, okOff = 0;
  /* ผูกเมนูตามสถานะจุดแดงของแต่ละคน ไม่ให้จุดแดงหายโดยไม่ตั้งใจ */
  try {
    var groups = {};
    on.forEach(function (uid) {
      var m = menuIdFor_(getBadges_(uid));
      (groups[m] = groups[m] || []).push(uid);
    });
    Object.keys(groups).forEach(function (m) { if (m) okOn += bulkLinkRichMenu(groups[m], m); });
  } catch (e) { console.error(e); }
  if (CFG.richMenuGuest) { try { okOff = bulkLinkRichMenu(off, CFG.richMenuGuest); } catch (e) { console.error(e); } }
  else { try { okOff = bulkUnlinkRichMenu(off); } catch (e) { console.error(e); } }

  audit(Session.getActiveUser().getEmail(), 'SYNC_MENU', '', 'เปิด ' + okOn + ' / ปิด ' + okOff);
  alert_('ซิงก์เสร็จ', '✅ เปิดสิทธิ์ ' + okOn + ' คน\n🚫 ปิดสิทธิ์ ' + okOff + ' คน');
}

/** ขั้นตอนมาตรฐานเมื่อพนักงานลาออก */
function offboardSelectedEmployee() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.EMPLOYEES) { alert_('ผิดชีต', 'กรุณาไปที่ชีต Employees แล้วคลิกแถวของพนักงานที่ลาออก'); return; }
  var row = sh.getActiveRange().getRow();
  if (row < 2) { alert_('เลือกแถว', 'กรุณาคลิกที่แถวของพนักงานก่อน'); return; }
  var emp = readTable(SHEETS.EMPLOYEES).filter(function (x) { return x._row === row; })[0];
  if (!emp) { alert_('ไม่พบข้อมูล', 'แถวนี้ว่าง'); return; }

  if (!confirm_('ยืนยันการตัดสิทธิ์',
      'พนักงาน: ' + emp.fullName + ' (' + emp.empCode + ')\n\n' +
      'ระบบจะทำสิ่งต่อไปนี้ทันที:\n' +
      '1. เปลี่ยนสถานะเป็น resigned\n' +
      '2. ปิด Rich Menu (เหลือหน้ายืนยันตัวตน)\n' +
      '3. ล้างการผูกบัญชี LINE\n' +
      '4. ส่งข้อความแจ้งและขอบคุณ\n' +
      '5. บันทึกลง AuditLog\n\n' +
      '⚠️ ห้ามลบแถวนี้ทิ้ง — กฎหมายแรงงาน ม.115 กำหนดให้เก็บทะเบียนลูกจ้างอย่างน้อย 2 ปี\n\nดำเนินการเลยหรือไม่?')) return;

  var uid = String(emp.lineUserId).trim();
  if (uid) {
    try { P.deleteProperty('badge_' + uid); } catch (e) {}
    try { revokeAccess_(uid); } catch (e) {}   // ถอดเมนูทันที (0 ข้อความ)
    clearEmployeeCache(uid);
  }

  updateRow(SHEETS.EMPLOYEES, row, {
    status: EMP_STATUS.RESIGNED,
    lineUserId: '',                 // ตัดการเชื่อมโยง ไม่ให้เข้าถึงข้อมูลได้อีก
    offboardedAt: now_(),
    note: (emp.note ? emp.note + ' | ' : '') + 'ตัดสิทธิ์ระบบเมื่อ ' + now_()
  });

  audit(Session.getActiveUser().getEmail(), 'OFFBOARD', emp.empCode, emp.fullName);
  alert_('ตัดสิทธิ์เรียบร้อย ✅',
    'ระบบตัดสิทธิ์ ' + emp.fullName + ' แล้ว\n\n' +
    '📋 เช็กลิสต์ที่ต้องทำต่อ (นอกระบบ):\n' +
    '□ ลบออกจากกลุ่ม LINE ของร้าน/สาขา\n' +
    '□ เก็บคืนบัตรพนักงาน / ชุดยูนิฟอร์ม / กุญแจ\n' +
    '□ ถอนสิทธิ์ POS และระบบอื่น\n' +
    '□ เปลี่ยนรหัสร่วมที่เขาเคยรู้\n' +
    '□ ถ้าเป็นแอดมิน: ถอดสิทธิ์ใน LINE OA Manager และ Google Sheets\n' +
    '□ จ่ายค่าจ้างค้างภายใน 3 วัน (ม.70)\n' +
    '□ ออกใบรับรองการทำงานเมื่อร้องขอ');
}

/** พนักงานเปลี่ยนเครื่อง/เปลี่ยนบัญชี LINE */
function resetLineBinding() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.EMPLOYEES) { alert_('ผิดชีต', 'กรุณาไปที่ชีต Employees'); return; }
  var row = sh.getActiveRange().getRow();
  var emp = readTable(SHEETS.EMPLOYEES).filter(function (x) { return x._row === row; })[0];
  if (!emp) return;
  if (!confirm_('รีเซ็ตการผูกบัญชี', emp.fullName + ' (' + emp.empCode + ')\n\nล้างการผูก LINE เพื่อให้ยืนยันตัวตนใหม่ได้?')) return;
  var uid = String(emp.lineUserId).trim();
  if (uid) { try { revokeAccess_(uid); } catch (e) {} clearEmployeeCache(uid); }
  updateRow(SHEETS.EMPLOYEES, row, { lineUserId: '', lineName: '', verifiedAt: '' });
  audit(Session.getActiveUser().getEmail(), 'RESET_BINDING', emp.empCode, '');
  alert_('เรียบร้อย', 'ให้พนักงานกดเมนู "ยืนยันตัวตน" ในไลน์อีกครั้งได้เลย');
}

function auditEmployees() {
  var rows = readTable(SHEETS.EMPLOYEES);
  var problems = [], warns = [];
  var codes = {}, names = {};
  rows.forEach(function (e) {
    var c = String(e.empCode).trim().toUpperCase();
    if (!c) { problems.push('แถว ' + e._row + ': ไม่มีรหัสพนักงาน'); return; }
    if (codes[c]) problems.push('แถว ' + e._row + ': รหัส ' + c + ' ซ้ำกับแถว ' + codes[c]);
    codes[c] = e._row;

    if (!String(e.firstName).trim() || !String(e.lastName).trim())
      problems.push('แถว ' + e._row + ' (' + c + '): ต้องมีทั้งชื่อและนามสกุล — ใช้ยืนยันตัวตน');

    /* ★ ชื่อ+นามสกุลซ้ำ = ยืนยันตัวตนอัตโนมัติไม่ได้ ต้องให้ HR ผูกบัญชีให้เอง */
    var nk = normName_(e.firstName) + '|' + normName_(e.lastName);
    if (nk !== '|') {
      if (names[nk]) problems.push('⚠️ แถว ' + e._row + ' (' + c + '): ชื่อ-นามสกุลซ้ำกับแถว ' + names[nk] +
                                   ' — ทั้งสองคนจะยืนยันตัวตนเองไม่ได้ ต้องใช้เมนู "ผูกบัญชี LINE ให้พนักงาน"');
      else names[nk] = e._row;
    }

    if (!/^[0-9]{4}$/.test(String(e.phoneLast4).trim()))
      problems.push('แถว ' + e._row + ' (' + c + '): เบอร์โทร 4 ตัวท้ายต้องเป็นตัวเลข 4 หลัก — ถ้าว่าง พนักงานคนนี้ยืนยันตัวตนไม่ได้');

    if ([EMP_STATUS.ACTIVE, EMP_STATUS.PENDING, EMP_STATUS.SUSPENDED, EMP_STATUS.RESIGNED].indexOf(String(e.status).trim()) < 0)
      problems.push('แถว ' + e._row + ' (' + c + '): สถานะ "' + e.status + '" ไม่ถูกต้อง');

    if ([ROLES.STAFF, ROLES.SUPERVISOR, ROLES.HR, ROLES.ADMIN].indexOf(String(e.role).trim()) < 0)
      problems.push('แถว ' + e._row + ' (' + c + '): บทบาท "' + e.role + '" ไม่ถูกต้อง');

    if (String(e.status).trim() === EMP_STATUS.RESIGNED && String(e.lineUserId).trim())
      problems.push('⚠️ แถว ' + e._row + ' (' + c + '): ลาออกแล้วแต่ยังผูก LINE อยู่ — ต้องตัดสิทธิ์!');

    if (c.indexOf('TMP-') === 0)
      warns.push('แถว ' + e._row + ': ' + e.fullName + ' ยังใช้รหัสชั่วคราว ' + c + ' — ควรใส่รหัสพนักงานจริง');

    var rt = String(e.reportsTo).trim();
    if (rt && !codes[rt.toUpperCase()] && rows.filter(function (x) {
      return String(x.empCode).trim().toUpperCase() === rt.toUpperCase(); }).length === 0)
      warns.push('แถว ' + e._row + ' (' + c + '): reportsTo = ' + rt + ' ไม่มีอยู่ในทะเบียน');
  });

  var active = rows.filter(isActive).length;
  var verified = rows.filter(function (e) { return isActive(e) && String(e.lineUserId).trim(); }).length;
  var noPhone = rows.filter(function (e) {
    return isActive(e) && !/^[0-9]{4}$/.test(String(e.phoneLast4).trim()); }).length;

  alert_('สุขภาพข้อมูลพนักงาน',
    'ทั้งหมด ' + rows.length + ' คน · ทำงานอยู่ ' + active + ' คน\n' +
    'ยืนยันตัวตนแล้ว ' + verified + '/' + active + ' คน\n' +
    'ยังไม่มีเบอร์โทร ' + noPhone + ' คน (ยืนยันตัวตนไม่ได้)\n\n' +
    (problems.length ? ('❌ ต้องแก้ ' + problems.length + ' จุด:\n• ' + problems.slice(0, 15).join('\n• ') + '\n\n') : '✅ ไม่พบปัญหาที่ต้องแก้\n\n') +
    (warns.length ? ('⚠️ ควรตรวจ ' + warns.length + ' จุด:\n• ' + warns.slice(0, 10).join('\n• ')) : ''));
}

/* ================================================================
 * ผูกบัญชี LINE ให้พนักงานด้วยมือ
 * ใช้เมื่อ: ชื่อ-นามสกุลซ้ำกัน / พนักงานเปลี่ยนเครื่อง / ยืนยันเองไม่ได้
 * ================================================================ */
function bindLineManually() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.EMPLOYEES) { alert_('ผิดชีต', 'กรุณาไปที่ชีต Employees แล้วคลิกแถวของพนักงาน'); return; }
  var row = sh.getActiveRange().getRow();
  if (row < 2) { alert_('เลือกแถว', 'กรุณาคลิกที่แถวของพนักงานก่อน'); return; }
  var emp = readTable(SHEETS.EMPLOYEES).filter(function (x) { return x._row === row; })[0];
  if (!emp) { alert_('ไม่พบข้อมูล', 'แถวนี้ว่าง'); return; }

  var res = ui_().prompt('ผูกบัญชี LINE ให้ ' + emp.fullName,
    'วิธีหา LINE userId:\n' +
    '1. ให้พนักงานทักอะไรก็ได้เข้ามาในแชท OA\n' +
    '2. เปิดชีต AuditLog จะเห็นบรรทัดล่าสุดที่คอลัมน์ actor เป็นรหัสขึ้นต้น U ยาว 33 ตัว\n' +
    '3. คัดลอกมาวางที่นี่\n\n' +
    'วาง LINE userId:', ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;

  var uid = String(res.getResponseText() || '').trim();
  if (!/^U[0-9a-f]{32}$/.test(uid)) { alert_('รูปแบบไม่ถูกต้อง', 'LINE userId ต้องขึ้นต้นด้วย U และยาว 33 ตัวอักษร'); return; }

  var dup = readTable(SHEETS.EMPLOYEES).filter(function (x) {
    return String(x.lineUserId).trim() === uid && x._row !== row; })[0];
  if (dup) { alert_('ผูกไม่ได้', 'บัญชี LINE นี้ผูกกับ ' + dup.fullName + ' (' + dup.empCode + ') อยู่แล้ว\nกรุณารีเซ็ตของคนนั้นก่อน'); return; }

  updateRow(SHEETS.EMPLOYEES, row, {
    lineUserId: uid, lineName: '(ผูกโดย HR)',
    status: EMP_STATUS.ACTIVE, verifiedAt: now_()
  });
  clearEmployeeCache(uid);
  try { grantAccess_(uid); } catch (e) {}
  audit(actor_(), 'BIND_MANUAL', emp.empCode, 'HR ผูกบัญชี LINE ให้ด้วยมือ');
  alert_('ผูกเรียบร้อย ✅', emp.fullName + ' ใช้งานเมนูได้แล้ว\n\nให้พนักงานปิดแล้วเปิดหน้าแชทใหม่อีกครั้ง');
}

/* ================================================================
 * สร้างตารางกะรายวันจากชีต ShiftPattern
 * ================================================================ */
function trim_(x) { return String(x).trim(); }

/** รูปแบบกะนี้ใช้ได้กับวันที่นี้หรือไม่ (ตามช่วง effectiveFrom/To) */
function inRange_(ds, p) {
  var eff = String(p.effectiveFrom).trim(), til = String(p.effectiveTo).trim();
  if (eff && ds < eff) return false;
  if (til && ds > til) return false;
  return true;
}

function generateScheduleFromPattern() {
  var pats = readTable(SHEETS.SHIFTPATTERN);
  if (!pats.length) { alert_('ไม่มีข้อมูล', 'ชีต ShiftPattern ยังว่างอยู่'); return; }

  var ready  = pats.filter(function (p) { return String(p.empCode).trim(); });
  var gaps   = pats.length - ready.length;
  var weeks  = Number(setting('SCHEDULE_WEEKS_AHEAD', '6')) || 6;

  if (!confirm_('สร้างตารางกะ',
      'ระบบจะสร้างตารางกะล่วงหน้า ' + weeks + ' สัปดาห์ จากรูปแบบ ' + ready.length + ' แถว\n\n' +
      (gaps ? ('⚠️ มี ' + gaps + ' แถวที่ยังไม่มี empCode จะถูกข้าม\n' +
               '   (ดูได้จากเมนู 📊 รายงาน > รายชื่อที่ต้องยืนยัน)\n\n') : '') +
      '⚠️ ตารางเดิมในช่วงวันเดียวกันจะถูกเขียนทับ\n' +
      '   แถวที่ HR แก้เองไว้ (status = manual) จะไม่ถูกแตะ\n\nดำเนินการหรือไม่?')) return;

  var shiftMap = {};
  readTable(SHEETS.SHIFTS).forEach(function (x) { shiftMap[String(x.shiftCode).trim()] = x; });

  var from = todayStr_();
  var to   = addDaysStr_(weeks * 7);

  /* เก็บแถวที่ HR แก้เองไว้ ไม่เขียนทับ */
  var keep = readTable(SHEETS.SCHEDULE).filter(function (r) {
    var d = String(r.date).trim();
    if (d < from || d > to) return true;                          // นอกช่วง = เก็บไว้
    return String(r.status).trim().toLowerCase() === 'manual';    // ในช่วงแต่ล็อกไว้
  });
  var locked = {};
  keep.forEach(function (r) { locked[String(r.date).trim() + '|' + String(r.empCode).trim()] = true; });

  var out = [], seenOff = {};
  var day = new Date(from + 'T00:00:00'), endD = new Date(to + 'T00:00:00');
  while (day <= endD) {
    var ds = Utilities.formatDate(day, CFG.TZ, 'yyyy-MM-dd');
    var dow = DOW_KEYS[day.getDay()];

    /* รอบแรก: หาว่าวันนี้ใครเข้ากะบ้าง — ต้องรู้ก่อน ไม่งั้นคนที่มีหลายรูปแบบกะ
       จะได้ทั้งกะและวันหยุดในวันเดียวกัน */
    var working = {};
    for (var a = 0; a < ready.length; a++) {
      var pa = ready[a];
      if (!inRange_(ds, pa)) continue;
      if (String(pa.days || '').split(',').map(trim_).indexOf(dow) >= 0) {
        working[String(pa.empCode).trim()] = true;
      }
    }

    for (var i = 0; i < ready.length; i++) {
      var p = ready[i], code = String(p.empCode).trim();
      var k = ds + '|' + code;
      if (locked[k]) continue;
      if (!inRange_(ds, p)) continue;
      if (String(p.days || '').split(',').map(trim_).indexOf(dow) >= 0) {
        var sf = shiftMap[String(p.shiftCode).trim()] || {};
        out.push({ date: ds, empCode: code, dept: p.dept || sf.dept || '',
                   shiftCode: p.shiftCode, startTime: sf.start || '', endTime: sf.end || '',
                   breaks: sf.breaks || '', ot: sf.ot || '', branch: 'สาขาหลัก',
                   note: '', status: 'planned' });
      } else if (!working[code] && !seenOff[k]) {
        seenOff[k] = true;
        out.push({ date: ds, empCode: code, dept: p.dept || '', shiftCode: 'OFF',
                   startTime: '', endTime: '', breaks: '', ot: '', branch: 'สาขาหลัก',
                   note: 'วันหยุดประจำสัปดาห์', status: 'planned' });
      }
    }
    day.setDate(day.getDate() + 1);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.SCHEDULE);

  /* ★ อ่านหัวคอลัมน์จากชีตจริง ไม่ใช่จาก SCHEMA
     เพราะถ้ามีคนสลับหรือแทรกคอลัมน์ การเขียนตามลำดับ SCHEMA จะทำให้ข้อมูลเพี้ยนทั้งชีต */
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
               .map(function (h) { return String(h).trim(); })
               .filter(function (h) { return h; });
  if (!head.length) head = SCHEMA.Schedule.slice();

  var rowOf = function (o) {
    return head.map(function (h) { return o[h] === undefined ? '' : o[h]; });
  };
  var all = keep.map(rowOf).concat(out.map(rowOf));

  /* ★ ขยายจำนวนแถวให้พอ "ก่อน" ล้างข้อมูล
     ถ้าล้างก่อนแล้วเขียนไม่ลง (แถวไม่พอ / หมดเวลารัน) ตารางทั้งชีตจะหายถาวร */
  var need = 1 + all.length + 5;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    alert_('มีคนกำลังแก้อยู่', 'มีการสร้างตารางกะค้างอยู่ กรุณารอสักครู่แล้วลองใหม่'); return;
  }
  try {
    sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), head.length).clearContent();
    if (all.length) sh.getRange(2, 1, all.length, head.length).setValues(all);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }

  audit(actor_(), 'SCHEDULE_GENERATE', from + '→' + to, out.length + ' แถว');
  alert_('สร้างตารางเรียบร้อย ✅',
    'สร้าง ' + out.length + ' แถว (' + from + ' ถึง ' + to + ')\n' +
    'คงแถวเดิมไว้ ' + keep.length + ' แถว\n\n' +
    (gaps ? ('⚠️ ข้าม ' + gaps + ' รูปแบบที่ยังไม่มี empCode\n\n') : '') +
    'ขั้นต่อไป: เมนู 🗓️ ตารางงาน > "แจ้งว่าตารางใหม่ออกแล้ว (ฟรี)" เพื่อติดจุดแดงให้พนักงาน');
}

function replyTicketSelected() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.TICKETS) { alert_('ผิดชีต', 'กรุณาไปที่ชีต Tickets แล้วคลิกแถวที่ต้องการตอบ'); return; }
  var row = sh.getActiveRange().getRow();
  var t = readTable(SHEETS.TICKETS).filter(function (x) { return x._row === row; })[0];
  if (!t) { alert_('ไม่พบข้อมูล', 'แถวนี้ว่าง'); return; }
  if (!String(t.reply).trim()) { alert_('ยังไม่มีคำตอบ', 'กรุณาพิมพ์คำตอบในคอลัมน์ reply ก่อน แล้วค่อยกดส่ง'); return; }
  if (String(t.privacy).trim() === PRIVACY.ANONYMOUS || !String(t.lineUserId).trim()) {
    updateRow(SHEETS.TICKETS, row, { status: TICKET_STATUS.CLOSED, closedAt: now_() });
    alert_('เรื่องไม่ระบุตัวตน', 'เรื่องนี้ผู้แจ้งเลือก "ไม่ระบุตัวตน" ระบบจึงส่งคำตอบกลับไม่ได้\nกรุณาประกาศผลการดำเนินการแบบรวมผ่านเมนูประกาศแทน\n\nปิดเรื่องให้แล้ว');
    return;
  }
  if (!confirm_('ยืนยันการตอบ', 'ตอบเรื่อง ' + t.ticketId + ' ถึง ' + t.name + '?\n\n' +
      'ระบบจะติดจุดแดงบนเมนู “ติดต่อ HR” ของเขา (ไม่ใช้โควตาข้อความ)\n' +
      'เขาจะเห็นคำตอบเมื่อเปิดเมนูนั้น')) return;

  /* ★ ติดจุดแดงให้สำเร็จ "ก่อน" เปลี่ยนสถานะเป็นตอบแล้ว
     จุดแดงคือช่องทางเดียวที่บอกผู้แจ้งว่ามีคำตอบ (โหมด 0 บาท ไม่มี push)
     ถ้าสลับลำดับ แล้ว LINE พลาด เรื่องจะกลายเป็น "ตอบแล้ว" หลุดออกจากงานค้าง
     ทั้งที่ไม่มีใครไปบอกผู้แจ้งเลยสักคน — เขาจะรอคำตอบที่ไม่มีวันมาถึง */
  var notified = false;
  try {
    notified = setBadge(String(t.lineUserId).trim(), 'hr', true);
  } catch (e) {
    console.error('replyTicket badge: ' + e);
    audit(actor_(), 'TICKET_REPLY_BADGE_FAIL', t.ticketId, String(e).slice(0, 200));
    alert_('⚠️ ติดจุดแดงไม่สำเร็จ',
      'ระบบยังไม่ได้เปลี่ยนสถานะเรื่อง ' + t.ticketId + ' เพราะแจ้งเตือนผู้แจ้งไม่สำเร็จ\n\n' +
      'สาเหตุที่พบบ่อย: ผู้แจ้งบล็อกหรือลบบัญชี OA ไปแล้ว หรือยังไม่ได้สร้าง Rich Menu\n\n' +
      'สิ่งที่ทำได้\n' +
      '• ตรวจเมนู 🎛️ Rich Menu > ดูรายการ Rich Menu ปัจจุบัน\n' +
      '• ถ้าผู้แจ้งบล็อก OA แล้ว ให้ติดต่อเขาโดยตรง แล้วกดเมนู "✅ ปิดเรื่อง"');
    return;
  }

  updateRow(SHEETS.TICKETS, row, { status: TICKET_STATUS.ANSWERED, closedAt: now_() });
  audit(actor_(), 'TICKET_REPLY', t.ticketId, 'badge (0 ข้อความ)');
  alert_('ตอบเรียบร้อย ✅',
    (notified ? 'ติดจุดแดงบนเมนูของผู้แจ้งแล้ว\n'
              : 'ผู้แจ้งมีจุดแดงค้างอยู่แล้ว จึงไม่ต้องสลับเมนูซ้ำ\n') +
    'เขาจะเห็นคำตอบเมื่อกดเมนู “ติดต่อ HR” แล้วเปิด “เรื่องของฉัน”\n\n' +
    'สถานะเรื่องนี้เป็น “' + TICKET_STATUS.ANSWERED + '” แล้ว\n' +
    'เมื่อจบเรื่องจริง ให้กดเมนู “✅ ปิดเรื่อง” เพื่อเปลี่ยนเป็น “' + TICKET_STATUS.CLOSED + '”\n\n' +
    '💰 ใช้โควตาข้อความ: 0');
}

/**
 * ปิดเรื่อง — เดิมไม่มีวิธีปิดเลยนอกจากพิมพ์คำว่า "เสร็จสิ้น" ลงช่อง status เอง
 * ซึ่งไม่มีเอกสารที่ไหนบอกไว้ และถ้าพิมพ์คำอื่นระบบจะยังนับว่าค้างต่อไปเรื่อย ๆ
 */
function closeTicketSelected() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.TICKETS) { alert_('ผิดชีต', 'กรุณาไปที่ชีต Tickets แล้วคลิกแถวที่ต้องการปิด'); return; }
  var row = sh.getActiveRange().getRow();
  if (row < 2) { alert_('เลือกแถว', 'กรุณาคลิกที่แถวของเรื่องก่อน'); return; }
  var t = readTable(SHEETS.TICKETS).filter(function (x) { return x._row === row; })[0];
  if (!t) { alert_('ไม่พบข้อมูล', 'แถวนี้ว่าง'); return; }

  if (normalizeTicketStatus(t.status) === TICKET_STATUS.CLOSED) {
    alert_('ปิดอยู่แล้ว', 'เรื่อง ' + t.ticketId + ' ปิดไปแล้วเมื่อ ' + (t.closedAt || '-'));
    return;
  }

  var noReply = !String(t.reply).trim();
  if (!confirm_('ยืนยันการปิดเรื่อง',
      'เรื่อง ' + t.ticketId + '\n' +
      'หัวข้อ: ' + String(t.subject || '-').slice(0, 60) + '\n' +
      'สถานะปัจจุบัน: ' + (t.status || '(ว่าง)') + '\n\n' +
      (noReply ? '⚠️ เรื่องนี้ยังไม่มีคำตอบในคอลัมน์ reply\n' +
                 '   ถ้าคุยกันจบนอกระบบแล้วก็ปิดได้ แต่ผู้แจ้งจะไม่เห็นคำตอบในแอป\n\n' : '') +
      'ปิดแล้วเรื่องนี้จะไม่ถูกนับเป็นงานค้างและไม่โผล่ในอีเมล 09:00 อีก\nดำเนินการหรือไม่?')) return;

  updateRow(SHEETS.TICKETS, row, { status: TICKET_STATUS.CLOSED, closedAt: now_() });
  audit(actor_(), 'TICKET_CLOSE', t.ticketId, noReply ? 'ปิดโดยไม่มีคำตอบในระบบ' : 'ปิดหลังตอบแล้ว');
  alert_('ปิดเรื่องแล้ว ✅', 'เรื่อง ' + t.ticketId + ' เปลี่ยนเป็น “' + TICKET_STATUS.CLOSED + '” แล้ว');
}

function showOverdueTickets() {
  var today = todayStr_();
  var list = readTable(SHEETS.TICKETS).filter(function (t) {
    return isTicketOpen(t.status) && String(t.slaDue).trim() && String(t.slaDue).trim() < today;
  });
  if (!list.length) { alert_('ยอดเยี่ยม 🎉', 'ไม่มีเรื่องค้างเกินกำหนด'); return; }
  alert_('⚠️ เรื่องเกินกำหนด ' + list.length + ' รายการ',
    list.slice(0, 15).map(function (t) {
      return '• ' + t.ticketId + ' (' + t.slaDue + ') ' + String(t.subject).slice(0, 30);
    }).join('\n'));
}

/* ================================================================
 * 📊 แดชบอร์ด
 * ================================================================ */
function showDashboard() {
  var emps = readTable(SHEETS.EMPLOYEES);
  var active = emps.filter(isActive);
  var verified = active.filter(function (e) { return String(e.lineUserId).trim(); });
  var tk = readTable(SHEETS.TICKETS);
  var openTk = tk.filter(function (t) { return isTicketOpen(t.status); });
  var q = { limit: 0, used: 0 };
  try { q = getQuota(); } catch (e) {}
  var miss = readTable(SHEETS.AUDIT).filter(function (a) { return a.action === 'FAQ_MISS'; });
  var bl = readTable(SHEETS.BROADCAST);
  var badges = bl.filter(function (b) { return String(b.type).indexOf('badge') === 0; }).length;
  var paid = String(setting('PAID_MODE', 'FALSE')).toUpperCase() === 'TRUE';

  alert_('📊 สรุประบบ ' + CFG.ORG + ' HR Hub',
    '👥 พนักงาน\n' +
    '   ทำงานอยู่ ' + active.length + ' คน\n' +
    '   ยืนยันตัวตนแล้ว ' + verified.length + ' คน (' +
      (active.length ? Math.round(verified.length / active.length * 100) : 0) + '%)\n\n' +
    '💬 เรื่องถึง HR\n' +
    '   ทั้งหมด ' + tk.length + ' เรื่อง / ค้างอยู่ ' + openTk.length + ' เรื่อง\n\n' +
    '📨 โควตาข้อความเดือนนี้\n' +
    '   ใช้ไป ' + q.used + ' / ' + (q.limit || 'ไม่จำกัด') +
      '  (สงวนไว้ ' + quotaReserve_() + ')\n' +
    '   โหมด: ' + (paid ? 'เสียเงิน (ส่ง push ได้)' : '0 บาท (ไม่ส่ง push)') + '\n' +
    '   แจ้งเตือนด้วยจุดแดงไปแล้ว ' + badges + ' ครั้ง (ฟรี)\n\n' +
    '🔎 คำถามที่ระบบตอบไม่ได้: ' + miss.length + ' ครั้ง\n' +
    '   (ดูที่ชีต AuditLog กรอง action = FAQ_MISS แล้วเอาไปเพิ่มใน FAQ)');
}

/* ================================================================
 * 🩺 ตรวจ Webhook URL — ใช้เมื่อ LINE ขึ้น error "302 Found"
 * ----------------------------------------------------------------
 * ยิง request ปลอมแบบเดียวกับปุ่ม Verify ของ LINE ไปที่ URL ของตัวเอง
 * แล้วบอกตรงๆ ว่าติดตรงไหน ไม่ต้องเดา
 * ================================================================ */
function testWebhookUrl() {
  var url = cfg('WEBAPP_URL');
  if (!url) {
    alert_('ยังไม่ได้ใส่ WEBAPP_URL',
      'ไปที่ Apps Script > ⚙️ Project Settings > Script Properties\n' +
      'แล้วใส่คีย์ WEBAPP_URL เป็น URL ที่ลงท้ายด้วย /exec');
    return;
  }

  var problems = [], notes = [];

  /* --- ตรวจรูปแบบ URL ก่อน --- */
  url = url.trim();
  if (url.indexOf('/exec') < 0) {
    if (url.indexOf('/dev') >= 0) {
      problems.push('❌ URL ลงท้ายด้วย /dev ซึ่งเป็นลิงก์ทดสอบ เปิดได้เฉพาะเจ้าของบัญชี\n' +
                    '   LINE เข้าไม่ได้แน่นอน → ต้องใช้ลิงก์ที่ลงท้าย /exec');
    } else {
      problems.push('❌ URL ไม่ได้ลงท้ายด้วย /exec');
    }
  }
  if (url.indexOf('script.google.com/macros/s/') < 0) {
    problems.push('❌ URL ไม่ใช่รูปแบบของ Apps Script Web App');
  }

  /* --- ยิงแบบไม่ตามรีไดเรกต์ เพื่อดูว่า /exec ตอบอะไรกลับมาจริงๆ --- */
  var raw = null, rawCode = 0, location = '';
  try {
    raw = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ destination: 'Utest', events: [] }),
      followRedirects: false,
      muteHttpExceptions: true
    });
    rawCode = raw.getResponseCode();
    var h = raw.getAllHeaders();
    location = h['Location'] || h['location'] || '';
  } catch (err) {
    alert_('เรียก URL ไม่สำเร็จ', 'เกิดข้อผิดพลาด: ' + err + '\n\nตรวจว่า URL ถูกต้องและอินเทอร์เน็ตใช้ได้');
    return;
  }

  /* --- ยิงแบบตามรีไดเรกต์ เพื่อดูผลลัพธ์สุดท้ายที่ LINE จะได้ --- */
  var finalCode = 0, finalBody = '';
  try {
    var r2 = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ destination: 'Utest', events: [] }),
      followRedirects: true,
      muteHttpExceptions: true
    });
    finalCode = r2.getResponseCode();
    finalBody = String(r2.getContentText() || '').slice(0, 400);
  } catch (err) {
    finalBody = 'ERROR: ' + err;
  }

  /* --- แปลผล --- */
  var verdict = '';
  if (finalCode === 200 && finalBody.indexOf('"ok"') >= 0) {
    verdict = '✅ Webhook ของคุณทำงานถูกต้องแล้ว\n\n' +
      'ระบบตอบกลับ 200 พร้อมข้อมูลที่ถูกต้อง\n\n' +
      '── เรื่องปุ่ม Verify ที่ขึ้น 302 ──\n' +
      'ถ้ากด Verify แล้วยังขึ้น "302 Found" ให้ข้ามไปได้เลย ไม่ใช่ความผิดพลาด\n\n' +
      'Apps Script ตอบ 302 ก่อนเสมอเป็นปกติ แล้วค่อยชี้ไปที่เนื้อหาจริง\n' +
      'ปุ่ม Verify ของ LINE ดูแค่สถานะแรกที่ได้ จึงขึ้นแดงตลอด\n' +
      'แต่โค้ดของเราถูกรันไปเรียบร้อยแล้วตั้งแต่ request แรก\n' +
      'ระบบจึงตอบข้อความพนักงานได้ตามปกติ\n\n' +
      '── สิ่งที่ต้องทำแทนการกด Verify ──\n' +
      '1. เปิดสวิตช์ "Use webhook" ใน LINE Developers ให้เป็นสีเขียว\n' +
      '   (สวิตช์นี้ต่างหากที่มีผลจริง ไม่ใช่ผลของปุ่ม Verify)\n' +
      '2. ส่งข้อความทดสอบเข้า OA จากมือถือ\n' +
      '3. กลับมาที่เมนู 🏪 HR Hub > ④ LINE ส่งข้อมูลเข้ามาจริงไหม\n' +
      '   ถ้าขึ้นเวลาล่าสุด = เชื่อมต่อสำเร็จ 100%';
  } else if (finalBody.indexOf('accounts.google.com') >= 0 ||
             finalBody.indexOf('ServiceLogin') >= 0 ||
             finalBody.indexOf('signin') >= 0) {
    verdict = '❌ สาเหตุ: สิทธิ์การเข้าถึงของ Deployment ผิด\n\n' +
      'ตอนนี้ตั้งเป็น "ทุกคนที่มีบัญชี Google" ระบบจึงเด้งไปหน้าล็อกอินของ Google\n' +
      'ซึ่ง LINE ล็อกอินไม่ได้ จึงได้ 302 กลับไป\n\n' +
      '── วิธีแก้ ──\n' +
      '1. Apps Script > ปุ่ม Deploy (มุมขวาบน) > Manage deployments\n' +
      '2. กดรูปดินสอ ✏️ ที่ deployment เดิม (ห้ามสร้างใหม่ URL จะเปลี่ยน)\n' +
      '3. Execute as   : ฉัน (Me)\n' +
      '4. Who has access : "ทุกคน" / "Anyone"\n' +
      '   ⚠️ ห้ามเลือก "ทุกคนที่มีบัญชี Google" / "Anyone with Google account"\n' +
      '5. Version : เลือก "New version" เสมอ\n' +
      '6. กด Deploy';
  } else if (finalBody.indexOf('Script function not found') >= 0 ||
             finalBody.indexOf('doPost') >= 0 && finalBody.indexOf('not found') >= 0) {
    verdict = '❌ สาเหตุ: เวอร์ชันที่ deploy อยู่ยังไม่มีโค้ด doPost\n\n' +
      'Apps Script จะ "แช่แข็ง" โค้ดไว้ตามเวอร์ชันที่กด Deploy\n' +
      'การแก้โค้ดในหน้าจอเฉยๆ ไม่ทำให้ URL เดิมได้โค้ดใหม่\n\n' +
      '── วิธีแก้ ──\n' +
      '1. Deploy > Manage deployments > ✏️\n' +
      '2. ช่อง Version เลือก "New version"  ← จุดสำคัญที่สุด\n' +
      '3. กด Deploy แล้วลองใหม่';
  } else if (finalCode === 200) {
    verdict = '⚠️ ตอบ 200 แล้ว แต่เนื้อหาไม่ใช่ที่คาดไว้\n\n' +
      'อาจมีโค้ดบางไฟล์ผิดพลาด ลองดูที่ Apps Script > Executions เพื่อหา error';
  } else {
    verdict = '❌ ยังตอบไม่ถูกต้อง (โค้ด ' + finalCode + ')\n\n' +
      'ทำตามลำดับนี้:\n' +
      '1. Deploy > Manage deployments > ✏️\n' +
      '2. Version = "New version"\n' +
      '3. Execute as = ฉัน (Me)\n' +
      '4. Who has access = "ทุกคน" (Anyone) ไม่ใช่ "ทุกคนที่มีบัญชี Google"\n' +
      '5. Deploy แล้วรันเมนูนี้ซ้ำ';
  }

  notes.push('URL ที่ตรวจ : ' + url.slice(0, 60) + '…');
  notes.push('/exec ตอบกลับ : ' + rawCode + (rawCode === 302 ? '  (302 เป็นเรื่องปกติของ Apps Script)' : ''));
  notes.push('ผลลัพธ์สุดท้ายที่ LINE จะได้ : ' + finalCode);
  notes.push('เนื้อหาที่ได้ : ' + (finalBody.slice(0, 120) || '(ว่าง)'));

  alert_('🩺 ผลตรวจ Webhook',
    verdict + '\n\n' +
    (problems.length ? ('── ปัญหาที่ตรวจพบเพิ่มเติม ──\n' + problems.join('\n') + '\n\n') : '') +
    '── รายละเอียดทางเทคนิค ──\n' + notes.join('\n'));
}

/* ================================================================
 * 📡 ตรวจว่า LINE ยิง webhook เข้ามาถึงโค้ดเราจริงหรือยัง
 * ----------------------------------------------------------------
 * ใช้แทนปุ่ม Verify ของ LINE ซึ่งใช้กับ Apps Script ไม่ได้
 * ================================================================ */
function checkWebhookTraffic() {
  var last = cfg('LAST_WEBHOOK_AT');
  var hits = Number(cfg('WEBHOOK_HITS', '0')) || 0;

  if (!last) {
    alert_('📡 ยังไม่มีข้อมูลเข้ามาเลย',
      'ยังไม่เคยมี request จาก LINE มาถึงระบบ\n\n' +
      '── ทำตามนี้เพื่อทดสอบ ──\n' +
      '1. เปิดแอป LINE ในมือถือ แล้วเข้าห้องแชทของ OA ร้าน\n' +
      '   (ถ้ายังไม่ได้เพิ่มเพื่อน ให้สแกน QR จาก LINE OA Manager ก่อน)\n' +
      '2. พิมพ์อะไรก็ได้ส่งเข้าไป เช่น "ทดสอบ"\n' +
      '3. กลับมากดเมนูนี้ซ้ำ\n\n' +
      '── ถ้ากดซ้ำแล้วยังขึ้นว่าไม่มีข้อมูล ให้ตรวจ 3 อย่างนี้ ──\n' +
      '□ LINE Developers > Messaging API > Use webhook = เปิด\n' +
      '□ LINE OA Manager > การตั้งค่าตอบกลับ > Webhook = เปิด\n' +
      '□ LINE OA Manager > โหมดการตอบกลับ = "แชทบอท"\n' +
      '   (ถ้าเป็นโหมด "แชท" ระบบจะปิด webhook ให้เองอัตโนมัติ)\n\n' +
      '⚠️ ปุ่ม Verify ที่ขึ้น error 302 ไม่เกี่ยวกับปัญหานี้ ให้ข้ามไปได้เลย');
    return;
  }

  var mins = 0;
  try {
    mins = Math.round((new Date().getTime() - new Date(last.replace(' ', 'T') + '+07:00').getTime()) / 60000);
  } catch (e) {}

  alert_('📡 Webhook ทำงานอยู่ ✅',
    'LINE ส่งข้อมูลเข้ามาถึงระบบแล้วจริง\n\n' +
    'ครั้งล่าสุด : ' + last + (mins >= 0 ? ('  (' + fmtAgo_(mins) + ')') : '') + '\n' +
    'รวมทั้งหมด : ' + hits + ' ครั้ง\n\n' +
    'แปลว่าการเชื่อมต่อสมบูรณ์ ใช้งานได้ตามปกติ\n' +
    '**ไม่ต้องสนใจ error 302 ที่ปุ่ม Verify** — เป็นข้อจำกัดของ Apps Script\n' +
    'ที่ตอบ 302 ก่อนเสมอ แต่โค้ดของเราถูกรันไปเรียบร้อยแล้ว\n\n' +
    'สิ่งที่ต้องเปิดไว้คือสวิตช์ "Use webhook" ไม่ใช่ผลของปุ่ม Verify');
}

function fmtAgo_(mins) {
  if (mins < 1) return 'เมื่อครู่นี้';
  if (mins < 60) return mins + ' นาทีที่แล้ว';
  if (mins < 1440) return Math.round(mins / 60) + ' ชั่วโมงที่แล้ว';
  return Math.round(mins / 1440) + ' วันที่แล้ว';
}

/* ================================================================
 * 🔧 ซ่อมหัวคอลัมน์ทุกชีต
 * ----------------------------------------------------------------
 * อาการที่ซ่อมได้: หน้าผังองค์กรขึ้นกล่องเปล่า · รายการรายงานว่าง ·
 *                 ตารางกะสร้างแล้วไม่มีข้อมูล
 * สาเหตุ: มีแถวคำอธิบายอยู่เหนือแถวหัวคอลัมน์ ทำให้โค้ดอ่านชื่อคอลัมน์ผิด
 * ================================================================ */
function repairSheetHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fixed = [], already = [], cannot = [];

  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { cannot.push(name + ' — ไม่พบชีตนี้'); return; }
    if (sh.getLastRow() < 1) return;

    var want = SCHEMA[name];
    var scan = Math.min(6, sh.getLastRow());
    var vals = sh.getRange(1, 1, scan, Math.max(1, sh.getLastColumn())).getValues();

    /* หาแถวที่หน้าตาเหมือนหัวคอลัมน์จริงที่สุด */
    var headRow = -1;
    for (var r = 0; r < vals.length; r++) {
      var row = vals[r].map(function (x) { return String(x).trim(); });
      var hit = 0;
      want.forEach(function (w) { if (row.indexOf(w) >= 0) hit++; });
      if (hit >= Math.max(2, Math.ceil(want.length * 0.6))) { headRow = r; break; }
    }

    if (headRow < 0) { cannot.push(name + ' — หาแถวหัวคอลัมน์ไม่เจอ ต้องตรวจด้วยมือ'); return; }
    if (headRow === 0) { already.push(name); return; }

    /* ต้องปลดผสานเซลล์ก่อน ไม่อย่างนั้นลบแถวไม่ได้ */
    try { sh.getRange(1, 1, headRow, sh.getMaxColumns()).breakApart(); } catch (e) {}
    sh.deleteRows(1, headRow);
    sh.setFrozenRows(1);
    fixed.push(name + ' — ลบแถวคำอธิบายด้านบนออก ' + headRow + ' แถว');
  });

  /* ★ เติมคีย์ Settings ที่เพิ่มเข้ามาทีหลัง
     seedIfEmpty_() จะไม่ทำงานถ้าชีต Settings มีข้อมูลอยู่แล้ว
     ทำให้ไฟล์ที่นำเข้าไปก่อนหน้านี้ขาดคีย์ใหม่ และเปิดฟีเจอร์ไม่ได้ */
  var addedKeys = addMissingSettings_();
  if (addedKeys.length) fixed.push('Settings — เพิ่มค่าตั้งค่าที่ขาด: ' + addedKeys.join(', '));

  audit(actor_(), 'REPAIR_HEADERS', fixed.length + ' ชีต', fixed.join(' | '));

  var msg = '';
  if (fixed.length) {
    msg += '✅ ซ่อมแล้ว ' + fixed.length + ' ชีต\n• ' + fixed.join('\n• ') + '\n\n' +
           '⚠️ สำคัญ: ต้องล้างแคชด้วย มิฉะนั้นพนักงานจะยังเห็นของเก่าอีก 3 นาที\n' +
           '   ให้กดเมนู 🔄 ล้างจุดแดงทุกคน หรือรอ 3 นาทีแล้วลองใหม่\n\n';
  }
  if (already.length) msg += '✓ ปกติดีอยู่แล้ว ' + already.length + ' ชีต\n\n';
  if (cannot.length)  msg += '❌ ซ่อมไม่ได้\n• ' + cannot.join('\n• ') + '\n\n';
  if (!fixed.length && !cannot.length && !addedKeys.length) {
    msg = '✅ ทุกชีตมีหัวคอลัมน์อยู่แถวที่ 1 ถูกต้องแล้ว ไม่มีอะไรต้องซ่อม\n\n' +
          'ถ้าหน้าผังองค์กรยังขึ้นกล่องเปล่าอยู่ ให้กดเมนู\n' +
          '"📋 ตรวจสอบสุขภาพข้อมูลพนักงาน" เพื่อหาสาเหตุอื่นต่อ';
  }
  msg += '── กฎที่ต้องจำ ──\n' +
         'ชีตที่โค้ดอ่าน (Employees, OrgChart, ShiftPattern, Reports, Schedule ฯลฯ)\n' +
         'ต้องมี "ชื่อคอลัมน์อยู่แถวที่ 1" เท่านั้น ห้ามแทรกแถวหัวเรื่องไว้ด้านบน';

  alert_('🔧 ผลการซ่อมหัวคอลัมน์', msg);
}

/** เติมคีย์ในชีต Settings ที่ยังไม่มี โดยไม่แตะค่าที่ HR ตั้งไว้แล้ว */
function addMissingSettings_() {
  var WANT = [
    ['VERIFY_REQUIRE_APPROVAL', 'FALSE',
     '★ TRUE = พนักงานยืนยันแล้วต้องรอ HR เปลี่ยนสถานะเป็น active ก่อนจึงใช้ได้ (ปลอดภัยกว่า แนะนำให้เปิดใน 2 สัปดาห์แรก)'],
    ['SCHEDULE_WEEKS_AHEAD', '6',
     'สร้างตารางกะล่วงหน้ากี่สัปดาห์เมื่อกดเมนู "สร้างตารางกะจากรูปแบบ"'],
    ['ORG_CHART_UPDATED', '',
     'วันที่ปรับผังองค์กรครั้งล่าสุด แสดงในหน้าผังองค์กร']
  ];
  var have = {};
  readTable(SHEETS.SETTINGS).forEach(function (s) { have[String(s.key).trim()] = true; });
  var added = [];
  WANT.forEach(function (w) {
    if (have[w[0]]) return;
    appendRow(SHEETS.SETTINGS, { key: w[0], value: w[1], note: w[2] });
    added.push(w[0]);
  });
  return added;
}

/* ================================================================
 * 🔁 แปลงคำสถานะเดิมให้ตรงกัน — ตั้งใจให้รันครั้งเดียว
 * ----------------------------------------------------------------
 * ก่อนหน้านี้แต่ละจุดในโค้ดเขียนคำสถานะกันคนละแบบ ในชีตจริงจึงมีทั้ง
 * 'ใหม่' 'ตอบแล้ว' 'เสร็จสิ้น' และคำที่ HR พิมพ์เองอีกหลายแบบปนกันอยู่
 * ฟังก์ชันนี้แปลงของเดิมให้เป็นคำมาตรฐานใน TICKET_STATUS / LEAVE_STATUS
 *
 * ★ กติกาความปลอดภัย 3 ข้อ
 *   1. รายงานให้ดูก่อนว่าจะแก้กี่แถว แถวไหน จากอะไรเป็นอะไร แล้วถามยืนยัน
 *   2. ก่อนเขียนจริง ก๊อบปี้แท็บ Tickets และ Leave เป็นแท็บสำรองลงวันที่ไว้
 *   3. คำที่ระบบไม่รู้จัก "ไม่แตะ" เด็ดขาด — ยกมาโชว์ให้ HR ตัดสินใจเอง
 *      เดาแทนคนแล้วเขียนทับข้อมูลแรงงานเป็นความเสี่ยงที่ไม่คุ้มกัน
 *
 * รันซ้ำได้โดยไม่เสียหาย (แถวที่ตรงมาตรฐานแล้วจะไม่ถูกนับและไม่ถูกเขียนซ้ำ)
 * ================================================================ */
function migrateStatusVocabulary() {
  /* อ่านสดจากชีต ไม่เอาของในแคช — นี่คือปฏิบัติการที่เขียนทับข้อมูลจริง */
  var tk = planStatusChanges_(readTable(SHEETS.TICKETS, true), 'ticketId', normalizeTicketStatus);
  var lv = planStatusChanges_(readTable(SHEETS.LEAVE, true),   'leaveId',  normalizeLeaveStatus);

  var total = tk.changes.length + lv.changes.length;
  if (!total && !tk.unknown.length && !lv.unknown.length) {
    alert_('ไม่มีอะไรต้องแปลง ✅',
      'คำสถานะในชีต Tickets (' + tk.scanned + ' แถว) และ Leave (' + lv.scanned + ' แถว)\n' +
      'ตรงกับมาตรฐานอยู่แล้วทุกแถว');
    return;
  }

  var msg =
    '── จะแก้ทั้งหมด ' + total + ' แถว ──\n' +
    'Tickets : ' + tk.changes.length + ' / ' + tk.scanned + ' แถว\n' +
    'Leave   : ' + lv.changes.length + ' / ' + lv.scanned + ' แถว\n\n' +
    migrationSample_('Tickets', tk) + migrationSample_('Leave', lv) +
    (tk.unknown.length || lv.unknown.length
      ? ('⚠️ คำที่ระบบไม่รู้จัก จะไม่ถูกแตะ ต้องแก้เองในชีต\n' +
         tk.unknown.concat(lv.unknown).slice(0, 8).map(function (u) {
           return '   • แถว ' + u.row + ': "' + u.from + '"';
         }).join('\n') + '\n\n')
      : '') +
    'ก่อนเขียน ระบบจะก๊อบปี้แท็บ Tickets และ Leave เป็นแท็บสำรองลงวันที่ให้\n\n' +
    (total > 1200 ? '⚠️ จำนวนแถวเยอะ อาจรันไม่จบใน 6 นาที ถ้าค้างให้กดเมนูนี้ซ้ำ ระบบจะทำต่อจากเดิม\n\n' : '') +
    'ดำเนินการเลยหรือไม่?';

  if (!confirm_('🔁 ตรวจก่อนแปลงคำสถานะ', msg)) {
    alert_('ยกเลิกแล้ว', 'ยังไม่ได้แก้อะไรในชีตเลยสักแถว');
    return;
  }

  var backups = [backupSheetCopy_(SHEETS.TICKETS), backupSheetCopy_(SHEETS.LEAVE)]
                .filter(Boolean);

  var doneTk = applyStatusChanges_(SHEETS.TICKETS, tk.changes);
  var doneLv = applyStatusChanges_(SHEETS.LEAVE,   lv.changes);

  audit(actor_(), 'STATUS_MIGRATE', String(doneTk + doneLv) + ' แถว',
        'Tickets ' + doneTk + ' / Leave ' + doneLv);

  alert_('แปลงคำสถานะเรียบร้อย ✅',
    'Tickets : แก้ ' + doneTk + ' แถว\n' +
    'Leave   : แก้ ' + doneLv + ' แถว\n\n' +
    (backups.length ? ('แท็บสำรอง:\n• ' + backups.join('\n• ') + '\n' +
                       '(ลบทิ้งได้เมื่อมั่นใจแล้ว แต่อย่าเพิ่งลบวันนี้)\n\n') : '') +
    'ลองกดเมนู 📊 รายงาน > "สรุปเรื่องถึง HR (SLA)" และ "สรุปการลา" เพื่อดูว่าตัวเลขตรงแล้ว');
}

/** วางแผนว่าจะแก้แถวไหนบ้าง โดยยังไม่เขียนอะไรลงชีต */
function planStatusChanges_(rows, idField, normalize) {
  var changes = [], unknown = [];
  rows.forEach(function (r) {
    var raw  = String(r.status === null || r.status === undefined ? '' : r.status).trim();
    var want = normalize(raw);
    if (!want) { unknown.push({ row: r._row, id: r[idField], from: raw }); return; }
    if (want === raw) return;                       // ตรงมาตรฐานอยู่แล้ว
    changes.push({ row: r._row, id: r[idField], from: raw || '(ว่าง)', to: want });
  });
  return { scanned: rows.length, changes: changes, unknown: unknown };
}

/** ตัวอย่างการแก้ไม่กี่บรรทัด ให้คนกดตัดสินใจได้จริงก่อนยืนยัน */
function migrationSample_(label, plan) {
  if (!plan.changes.length) return '';
  var lines = plan.changes.slice(0, 6).map(function (c) {
    return '   • ' + (c.id || ('แถว ' + c.row)) + ': "' + c.from + '" → "' + c.to + '"';
  });
  if (plan.changes.length > 6) lines.push('   • … อีก ' + (plan.changes.length - 6) + ' แถว');
  return label + '\n' + lines.join('\n') + '\n\n';
}

function applyStatusChanges_(sheetName, changes) {
  var n = 0;
  changes.forEach(function (c) {
    /* เขียนผ่าน updateRow เสมอ เพื่อให้ผ่าน safeCell_ และล้างแคชของแท็บให้ด้วย */
    updateRow(sheetName, c.row, { status: c.to });
    n++;
  });
  return n;
}

/** ก๊อบปี้ทั้งแท็บเป็นแท็บสำรองลงวันที่ (กู้คืนได้เองโดยไม่ต้องพึ่งประวัติเวอร์ชัน) */
function backupSheetCopy_(sheetName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var src = ss.getSheetByName(sheetName);
    if (!src) return '';
    var name = 'สำรอง-' + sheetName + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd-HHmmss');
    src.copyTo(ss).setName(name);
    return name;
  } catch (e) {
    console.error('backupSheetCopy_ ' + sheetName + ': ' + e);
    /* ★ สำรองไม่สำเร็จ ต้องหยุดทั้งงาน ไม่ใช่ทำต่อแบบไม่มีตาข่ายรอง */
    throw new Error('ก๊อบปี้แท็บ ' + sheetName + ' เป็นแท็บสำรองไม่สำเร็จ จึงยังไม่แก้ข้อมูลใด ๆ: ' + e);
  }
}
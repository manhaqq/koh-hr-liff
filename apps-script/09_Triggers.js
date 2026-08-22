/*******************************************************************
 * โก๋ในซอย HR Hub — 09_Triggers.gs
 * งานอัตโนมัติตามเวลา — โหมด 0 บาท
 *
 * ทุกฟังก์ชันในไฟล์นี้ "ไม่ส่งข้อความ LINE" แม้แต่ข้อความเดียว
 * ใช้ Rich Menu Badge และอีเมลแทนทั้งหมด
 *******************************************************************/

function installTriggers() {
  var HANDLERS = ['refreshNewsBadge', 'dailyHrEmail', 'autoPublishAnnouncements',
                  'weeklyHealthCheck', 'pushWeeklySchedule', 'pushTomorrowReminder', 'dailyHrDigest',
                  'onEditInvalidateCache'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (HANDLERS.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });

  // ทุกวัน 08:00 — เผยแพร่ประกาศที่ตั้งเวลาไว้ แล้วติดจุดแดงบนเมนู
  ScriptApp.newTrigger('autoPublishAnnouncements').timeBased()
    .everyDays(1).atHour(8).inTimezone(CFG.TZ).create();

  // ทุกวัน 09:00 — อีเมลสรุปงานค้างให้ HR
  ScriptApp.newTrigger('dailyHrEmail').timeBased()
    .everyDays(1).atHour(9).inTimezone(CFG.TZ).create();

  // เสาร์ 18:00 — ติดจุดแดง "ตารางสัปดาห์หน้าออกแล้ว"
  ScriptApp.newTrigger('refreshNewsBadge').timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(18).inTimezone(CFG.TZ).create();

  // จันทร์ 07:00 — ตรวจสุขภาพระบบ ส่งอีเมลถ้าเจอปัญหา
  ScriptApp.newTrigger('weeklyHealthCheck').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).inTimezone(CFG.TZ).create();

  // ทุกครั้งที่มีคนแก้ชีต — ล้างแคชของแท็บนั้นทันที
  // ต้องเป็นทริกเกอร์แบบติดตั้ง (ไม่ใช่ onEdit ธรรมดา) เพราะ onEdit ธรรมดา
  // ทำงานในโหมดสิทธิ์จำกัด ซึ่งเรียก CacheService ไม่ได้เสมอไป
  ScriptApp.newTrigger('onEditInvalidateCache')
    .forSpreadsheet(CFG.ssId).onEdit().create();

  alert_('ติดตั้งงานอัตโนมัติแล้ว ✅',
    'ทั้ง 4 งานนี้ไม่ใช้โควตาข้อความ LINE เลย\n\n' +
    '• ทุกวัน 08:00 — เผยแพร่ประกาศตามเวลา + ติดจุดแดงบนเมนู\n' +
    '• ทุกวัน 09:00 — อีเมลสรุปงานค้างถึง HR\n' +
    '• เสาร์ 18:00 — ติดจุดแดงแจ้งตารางสัปดาห์หน้า\n' +
    '• จันทร์ 07:00 — ตรวจสุขภาพระบบ\n' +
    '• ทุกครั้งที่แก้ชีต — ล้างแคชให้ข้อมูลใหม่ขึ้นทันที\n\n' +
    'ปิด/เปิดแต่ละรายการได้ที่ชีต Settings');
}

/* =================================================================
 * ติดจุดแดง "มีของใหม่" ให้พนักงานทุกคน  (0 ข้อความ)
 * ================================================================= */
function refreshNewsBadge() {
  if (String(setting('BADGE_ENABLED', 'TRUE')).toUpperCase() !== 'TRUE') return;
  var ids = activeUserIds();
  if (!ids.length) return;
  var n = broadcastBadge(ids, 'news');
  appendRow(SHEETS.BROADCAST, { timestamp: now_(), type: 'badge_news',
    title: 'ตารางสัปดาห์หน้า/ประกาศใหม่', audience: 'active', recipients: n, by: 'system' });
}

/* =================================================================
 * เผยแพร่ประกาศตามเวลา แล้วติดจุดแดง  (0 ข้อความ)
 * ================================================================= */
function autoPublishAnnouncements() {
  var today = todayStr_();
  var published = [];
  readTable(SHEETS.ANNOUNCEMENTS).forEach(function (a) {
    if (String(a.status).trim() !== 'published') return;
    if (String(a.broadcastedAt).trim()) return;
    var pub = String(a.publishAt).trim();
    if (pub && pub > today) return;
    if (String(a.autoBroadcast).toUpperCase() === 'FALSE') return;
    try {
      notifyAnnouncement_(a, false);
      published.push(a.title);
    } catch (e) { console.error('autoPublish: ' + e); }
  });
  if (published.length) {
    notifyHrEmail('เผยแพร่ประกาศอัตโนมัติ ' + published.length + ' ฉบับ',
      emailTemplate_('ประกาศถูกเผยแพร่แล้ว',
        published.map(function (t, i) { return [String(i + 1), t]; }),
        'พนักงานจะเห็นจุดแดงบนเมนู “ประกาศและข่าวสาร” เมื่อเปิดแชท'));
  }
}

/* =================================================================
 * อีเมลสรุปงานค้างถึง HR  (0 ข้อความ LINE)
 * ================================================================= */
function dailyHrEmail() {
  if (String(setting('HR_EMAIL_ENABLED', 'TRUE')).toUpperCase() !== 'TRUE') return;
  var today = todayStr_();
  var tk = readTable(SHEETS.TICKETS).filter(function (t) { return String(t.status).indexOf('เสร็จ') < 0; });
  var overdue = tk.filter(function (t) { return String(t.slaDue).trim() && String(t.slaDue).trim() < today; });
  var newToday = tk.filter(function (t) { return String(t.createdAt).slice(0, 10) === today; });
  var lv = readTable(SHEETS.LEAVE).filter(function (l) { return String(l.status).indexOf('รอ') >= 0; });
  var emps = readTable(SHEETS.EMPLOYEES);
  var notVerified = emps.filter(function (e) { return isActive(e) && !String(e.lineUserId).trim(); });

  if (!tk.length && !lv.length && !notVerified.length) return;   // ไม่มีอะไรค้าง ไม่ต้องรบกวน

  var rows = [
    ['เรื่องใหม่วันนี้', newToday.length + ' เรื่อง'],
    ['เรื่องค้างทั้งหมด', tk.length + ' เรื่อง'],
    ['⚠️ เกินกำหนดตอบ', overdue.length + ' เรื่อง'],
    ['ใบลารออนุมัติ', lv.length + ' ใบ'],
    ['ยังไม่ยืนยันตัวตน', notVerified.length + ' คน']
  ];
  var detail = '';
  if (overdue.length) {
    detail = '<b>เรื่องที่เกินกำหนด</b><br>' + overdue.slice(0, 10).map(function (t) {
      return '• ' + t.ticketId + ' (' + t.slaDue + ') ' + String(t.subject).slice(0, 40);
    }).join('<br>');
  }
  notifyHrEmail('สรุปงานค้าง ' + thaiDate_(today), emailTemplate_('สรุปงานค้างประจำวัน', rows, detail));
}

/* =================================================================
 * ตรวจสุขภาพระบบรายสัปดาห์
 * ================================================================= */
function weeklyHealthCheck() {
  var problems = [];
  var emps = readTable(SHEETS.EMPLOYEES);

  emps.forEach(function (e) {
    if (String(e.status).trim() === EMP_STATUS.RESIGNED && String(e.lineUserId).trim())
      problems.push('พนักงานลาออกแล้วแต่ยังผูกไลน์อยู่: ' + e.empCode + ' ' + e.fullName);
    if (isActive(e) && !/^[0-9]{4}$/.test(String(e.phoneLast4).trim()))
      problems.push('เบอร์โทร 4 ตัวท้ายไม่ถูกต้อง: ' + e.empCode);
  });

  var q = { limit: 0, used: 0 };
  try { q = getQuota(); } catch (e) {}
  if (q.limit > 0 && (q.limit - q.used) < quotaReserve_())
    problems.push('โควตาข้อความเหลือน้อย: ใช้ไป ' + q.used + '/' + q.limit);

  var today = todayStr_();
  var futureShifts = readTable(SHEETS.SCHEDULE).filter(function (r) { return String(r.date).trim() > today; });
  if (futureShifts.length < 10) problems.push('ตารางกะล่วงหน้ามีน้อยมาก (' + futureShifts.length + ' แถว) — อย่าลืมลงตารางสัปดาห์หน้า');

  var miss = readTable(SHEETS.AUDIT).filter(function (a) {
    return a.action === 'FAQ_MISS' && String(a.timestamp).slice(0, 10) >= addDaysStr_(-7);
  });

  var rows = [
    ['โควตาข้อความ', q.limit ? (q.used + ' / ' + q.limit) : 'ไม่จำกัด'],
    ['พนักงาน active', emps.filter(isActive).length + ' คน'],
    ['คำถามที่ระบบตอบไม่ได้ (7 วัน)', miss.length + ' ครั้ง'],
    ['ปัญหาที่ตรวจพบ', problems.length + ' รายการ']
  ];
  var body = problems.length
    ? '<b style="color:#B3261E">ต้องแก้ไข</b><br>' + problems.map(function (p) { return '• ' + p; }).join('<br>')
    : '<b style="color:#146C43">ระบบปกติดี ไม่พบปัญหา</b>';
  if (miss.length) {
    body += '<br><br><b>คำถามที่ควรเพิ่มลง FAQ</b><br>' +
      miss.slice(0, 12).map(function (m) { return '• ' + m.detail; }).join('<br>');
  }
  notifyHrEmail('ตรวจสุขภาพระบบประจำสัปดาห์', emailTemplate_('ตรวจสุขภาพระบบ', rows, body));
}

/* =================================================================
 * โหมดเสียเงิน (ปิดไว้โดยค่าเริ่มต้น)
 * เปิดใช้เมื่ออัปเกรดเป็นแพ็กเกจเบสิกแล้วเท่านั้น
 * ================================================================= */
function pushTomorrowReminder() {
  if (String(setting('PAID_MODE', 'FALSE')).toUpperCase() !== 'TRUE') {
    console.log('PAID_MODE ปิดอยู่ — ข้ามการส่งเตือนกะ (ใช้ปฏิทิน ICS แทน)');
    return;
  }
  var d = addDaysStr_(1);
  var empMap = {};
  readTable(SHEETS.EMPLOYEES).forEach(function (e) {
    if (isActive(e) && String(e.lineUserId).trim()) empMap[String(e.empCode).trim().toUpperCase()] = e;
  });
  var shiftMap = {};
  readTable(SHEETS.SHIFTS).forEach(function (s) { shiftMap[String(s.shiftCode).trim()] = s; });

  var targets = [], text = null;
  readTable(SHEETS.SCHEDULE).forEach(function (r) {
    if (String(r.date).trim() !== d) return;
    var e = empMap[String(r.empCode).trim().toUpperCase()];
    if (!e) return;
    var s = shiftMap[String(r.shiftCode).trim()] || {};
    if (!s.start && !r.startTime) return;
    targets.push(String(e.lineUserId).trim());
  });
  if (!targets.length) return;
  text = { type: 'text', text: '⏰ พรุ่งนี้ ' + thaiDay_(d) + ' ' + thaiDate_(d) + ' คุณมีกะงาน\n' +
           'เปิดเมนู “ตารางงาน” เพื่อดูเวลาและสาขาของคุณ' };
  safePush(targets, text, false);
}

/** ฟังก์ชันเดิม — คงชื่อไว้เพื่อไม่ให้ trigger เก่าพัง */
function pushWeeklySchedule() { refreshNewsBadge(); }
function dailyHrDigest()      { dailyHrEmail(); }


/**
 * ล้างแคชของแท็บที่เพิ่งถูกแก้
 *
 * HR แก้ข้อมูลในชีตโดยตรงเป็นเรื่องปกติของระบบนี้ ซึ่งไม่ผ่านโค้ดฝั่งเขียนเลย
 * ถ้าไม่มีตัวนี้ ข้อมูลที่ HR เพิ่งแก้จะไม่ขึ้นให้พนักงานเห็นจนกว่าแคชจะหมดอายุ
 * ซึ่งเป็นอาการที่หาสาเหตุยากมาก ("แก้แล้วทำไมยังเป็นของเก่า")
 *
 * ห้ามใส่งานหนักในนี้ — ทริกเกอร์ onEdit ทำงานทุกครั้งที่มีการพิมพ์ในชีต
 */
function onEditInvalidateCache(e) {
  try {
    var name = e && e.range && e.range.getSheet().getName();
    if (name) bumpTableVersion_(name);
  } catch (err) { /* ห้ามปล่อย error ออกไป จะไปรบกวนการแก้ชีตของ HR */ }
}

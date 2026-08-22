/*******************************************************************
 * โก๋ในซอย HR Hub — 10_Notify.gs
 * ★ หัวใจของสถาปัตยกรรม "0 บาท"
 *
 * ปัญหา: แพ็กเกจฟรีของ LINE OA ส่งข้อความได้เพียง 300 ข้อความ/เดือน
 *        (นับเฉพาะ push / multicast / broadcast / narrowcast)
 *        พนักงาน 60 คน ส่ง broadcast แค่ 5 ครั้งก็หมดโควตาแล้ว
 *
 * ทางออก 4 ชั้น — ทั้งหมดไม่กินโควตาข้อความเลย
 *   1. BADGE      เปลี่ยนรูป Rich Menu เป็นแบบมีจุดแดง = แจ้งเตือนฟรี
 *   2. ICS        ปฏิทินกะงาน ให้มือถือพนักงานเตือนเอง
 *   3. EMAIL      แจ้งทีม HR ผ่าน Gmail แทนการ push เข้าไลน์
 *   4. REPLY      ทุกการโต้ตอบในแชทใช้ reply ซึ่งฟรีไม่จำกัด
 *
 * โควตา 300 ถูกสงวนไว้เป็น "กระสุนฉุกเฉิน" เท่านั้น
 *******************************************************************/

/* =================================================================
 * ชั้นที่ 1 — BADGE : แจ้งเตือนด้วยการสลับ Rich Menu
 *
 * การเรียก POST /v2/bot/user/{userId}/richmenu/{richMenuId}
 * ไม่ใช่ API ส่งข้อความ จึงไม่ถูกนับในโควตา 300 ข้อความ
 * (อ้างอิง: เอกสาร LINE ระบุรายการที่นับไว้ 4 แบบ คือ
 *  push / multicast / broadcast / narrowcast เท่านั้น)
 * ================================================================= */

/** แฟล็กแจ้งเตือนของพนักงานแต่ละคน เก็บใน Script Properties */
var BADGE = { NEWS: 'n', HR: 'h' };

function badgeKey_(userId) { return 'badge_' + userId; }

function getBadges_(userId) {
  var v = P.getProperty(badgeKey_(userId)) || '';
  return { news: v.indexOf(BADGE.NEWS) >= 0, hr: v.indexOf(BADGE.HR) >= 0 };
}

function saveBadges_(userId, b) {
  var v = (b.news ? BADGE.NEWS : '') + (b.hr ? BADGE.HR : '');
  if (v) P.setProperty(badgeKey_(userId), v);
  else   P.deleteProperty(badgeKey_(userId));
}

/** เลือกรหัส Rich Menu ที่ตรงกับสถานะแจ้งเตือน */
function menuIdFor_(b) {
  if (b.news && b.hr) return cfg('RICHMENU_ID_MAIN_NH') || cfg('RICHMENU_ID_MAIN');
  if (b.news)         return cfg('RICHMENU_ID_MAIN_N')  || cfg('RICHMENU_ID_MAIN');
  if (b.hr)           return cfg('RICHMENU_ID_MAIN_H')  || cfg('RICHMENU_ID_MAIN');
  return cfg('RICHMENU_ID_MAIN');
}

/**
 * ติดหรือปลดจุดแดงให้พนักงานคนเดียว
 *
 * ★ ลำดับสำคัญกว่าที่คิด: เรียก LINE ให้สำเร็จก่อน แล้วค่อยจดสถานะ
 *   เดิมจด Properties ก่อนแล้วค่อยเรียก LINE ใน try/catch ที่กลืน error ทิ้ง
 *   ถ้า LINE พลาด ระบบจะ "จำว่าทำสำเร็จ" ทั้งที่เมนูจริงไม่เปลี่ยน
 *   ตอนติดจุดแดง = คนนั้นไม่มีวันรู้ว่า HR ตอบแล้ว และไม่มีโค้ดไหนลองซ้ำให้อีก
 *   ตอนปลดจุดแดง = จุดแดงค้างบนเมนูถาวรจนกว่าจะรันเมนูซ่อมระบบ
 *   ทำกลับด้าน: ถ้า LINE พลาด สถานะเดิมยังอยู่ ครั้งหน้าที่ผู้ใช้เปิดหน้านั้น
 *   ระบบจะลองใหม่ให้เอง — ผิดพลาดแล้วซ่อมตัวเองได้ ดีกว่าผิดแล้วเงียบ
 *
 * @throws ถ้าเรียก LINE ไม่สำเร็จ — ตั้งใจให้เด้งขึ้นไป ผู้เรียกจะได้บอกความจริงกับ HR ได้
 * @return {boolean} true = สถานะเปลี่ยนจริง, false = ไม่มีอะไรต้องเปลี่ยน
 */
function setBadge(userId, which, on) {
  if (!userId) return false;
  var cur  = getBadges_(userId);
  var next = { news: cur.news, hr: cur.hr };
  if (which === 'news') next.news = !!on;
  if (which === 'hr')   next.hr   = !!on;

  /* ไม่มีอะไรเปลี่ยน = ไม่ต้องยิง LINE และไม่ต้องเขียน Properties
     เปิดหน้าประกาศ 3 ครั้งเดิมยิง LINE 3 ครั้งเปล่า ๆ ครั้งละ 200–400 ms */
  if (next.news === cur.news && next.hr === cur.hr) return false;

  var menuId = menuIdFor_(next);
  /* ยังไม่ได้สร้าง Rich Menu = ส่งจุดแดงไม่ได้เลย ต้องบอกดัง ๆ ไม่ใช่คืน false เงียบ ๆ
     ถ้าคืนเงียบ ผู้เรียกจะเข้าใจว่า "ไม่มีอะไรต้องเปลี่ยน" แล้วรายงานว่าสำเร็จ */
  if (!menuId) throw new Error('ยังไม่ได้สร้าง Rich Menu (RICHMENU_ID_MAIN ว่าง) — แจ้งเตือนด้วยจุดแดงไม่ได้');
  linkRichMenuToUser(userId, menuId);   /* สำเร็จก่อน */
  saveBadges_(userId, next);            /* ค่อยจด */
  return true;
}

/**
 * ปลดจุดแดง (เรียกตอนพนักงานเปิดหน้าที่มีเนื้อหาจริงแล้วเท่านั้น)
 * ตัวนี้ห้าม throw — ถูกเรียกกลางทางของ API ที่ต้องคืนข้อมูลให้ผู้ใช้
 * ปลดจุดแดงไม่สำเร็จเป็นเรื่องเล็ก แต่หน้าเว็บพังทั้งหน้าเป็นเรื่องใหญ่
 * และถ้าพลาด สถานะยังเป็น "มีจุดแดง" อยู่ ครั้งหน้าจึงลองใหม่ให้เองอัตโนมัติ
 */
function clearBadge(userId, which) {
  try { return setBadge(userId, which, false); }
  catch (e) { console.error('clearBadge ' + which + ': ' + e); return false; }
}

/**
 * ติดจุดแดง "มีประกาศใหม่" ให้พนักงานหลายคนพร้อมกัน
 * ใช้ bulk API — 60 คนใช้เพียง 1 request และไม่กินโควตาข้อความ
 */
function broadcastBadge(userIds, which) {
  var ids = (userIds || []).filter(Boolean);
  if (!ids.length) return 0;

  /* จัดกลุ่มตามสถานะปลายทาง เพื่อให้ยิง bulk ได้เป็นก้อน
     ★ ยังไม่จด Properties ในรอบนี้ — จดหลังจาก LINE ตอบสำเร็จเท่านั้น
       ด้วยเหตุผลเดียวกับ setBadge: ถ้าจดก่อนแล้ว LINE พลาด ระบบจะเชื่อว่า
       ทุกคนได้จุดแดงแล้ว ทั้งที่เมนูของเขาไม่เปลี่ยนเลยสักคน */
  var groups = {}, want = {};
  ids.forEach(function (uid) {
    var b = getBadges_(uid);
    if (which === 'news') b.news = true;
    if (which === 'hr')   b.hr   = true;
    want[uid] = b;
    var m = menuIdFor_(b);
    (groups[m] = groups[m] || []).push(uid);
  });

  var done = 0;
  Object.keys(groups).forEach(function (menuId) {
    if (!menuId) return;
    try {
      done += bulkLinkRichMenu(groups[menuId], menuId);
      groups[menuId].forEach(function (uid) { saveBadges_(uid, want[uid]); });
    } catch (e) {
      /* ไม่จดกลุ่มที่พลาด — คราวหน้าที่ HR กดเผยแพร่ซ้ำ คนกลุ่มนี้จะถูกลองใหม่ */
      console.error('broadcastBadge: ' + e);
    }
  });
  return done;
}

/** ล้างจุดแดงทุกคน (ใช้ตอนซ่อมระบบ) */
function resetAllBadges() {
  var ids = activeUserIds();
  /* ★ สลับเมนูจริงให้สำเร็จก่อน ค่อยลบแฟล็ก — เหตุผลเดียวกับ setBadge
     ถ้าลบแฟล็กก่อนแล้ว LINE พลาด ระบบจะเชื่อว่าไม่มีใครมีจุดแดง
     ทั้งที่จุดแดงยังค้างบนเมนูจริงของทุกคน และจะไม่มีอะไรมาซ่อมให้อีก */
  if (ids.length && CFG.richMenuMain) bulkLinkRichMenu(ids, CFG.richMenuMain);
  var all = P.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf('badge_') === 0) P.deleteProperty(k); });
  return ids.length;
}

/* =================================================================
 * ชั้นที่ 2 — ICS : ปฏิทินกะงาน ให้มือถือเตือนเอง
 *
 * พนักงานกดสมัครรับปฏิทินครั้งเดียว จากนั้นโทรศัพท์ของเขา
 * จะดึงตารางกะใหม่และเตือนเองทุกวัน โดยระบบไม่ต้องส่งข้อความเลย
 * ================================================================= */

/** สร้างโทเคนลับประจำตัวพนักงาน (กันคนอื่นเดา URL ปฏิทินของเรา) */
function icsToken(empCode) {
  var secret = cfg('ICS_SECRET');
  if (!secret) {                       // สร้างครั้งแรกอัตโนมัติ
    secret = Utilities.getUuid();
    P.setProperty('ICS_SECRET', secret);
  }
  var raw = Utilities.computeHmacSha256Signature(String(empCode).toUpperCase(), secret);
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '').slice(0, 24);
}

function icsUrl(empCode) {
  var base = cfg('WEBAPP_URL');
  if (!base) return '';
  return base + '?ics=' + encodeURIComponent(String(empCode).toUpperCase()) +
         '&t=' + icsToken(empCode);
}

/** สร้างไฟล์ปฏิทิน .ics ของพนักงานหนึ่งคน */
function buildIcs_(empCode) {
  var emp = findEmployeeByCode(empCode);
  if (!isActive(emp)) return null;

  var rows = getScheduleFor(empCode, addDaysStr_(-14), addDaysStr_(120));
  var L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Koh Nai Soi//HR Hub//TH',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:ตารางงาน ' + CFG.ORG,
    'X-WR-TIMEZONE:Asia/Bangkok',
    'X-PUBLISHED-TTL:PT6H',            // ให้มือถือรีเฟรชทุก 6 ชั่วโมง
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H'
  ];

  rows.forEach(function (s) {
    if (!s.start || !s.end) return;                       // วันหยุด/ลา ไม่ต้องลงปฏิทิน
    var d = s.date.replace(/-/g, '');
    var st = String(s.start).replace(':', '') + '00';
    var en = String(s.end).replace(':', '') + '00';
    var endDate = d;
    if (Number(String(s.end).split(':')[0]) < Number(String(s.start).split(':')[0])) {
      var nd = new Date(s.date + 'T00:00:00+07:00');      // กะข้ามคืน
      nd.setDate(nd.getDate() + 1);
      endDate = Utilities.formatDate(nd, CFG.TZ, 'yyyyMMdd');
    }
    L.push('BEGIN:VEVENT');
    L.push('UID:' + s.date + '-' + empCode + '@kohnaisoi');
    L.push('DTSTAMP:' + Utilities.formatDate(new Date(), 'GMT', "yyyyMMdd'T'HHmmss'Z'"));
    L.push('DTSTART;TZID=Asia/Bangkok:' + d + 'T' + st);
    L.push('DTEND;TZID=Asia/Bangkok:' + endDate + 'T' + en);
    L.push('SUMMARY:' + icsEsc_(s.shiftName + (s.branch ? ' · ' + s.branch : '')));
    L.push('LOCATION:' + icsEsc_(s.branch || CFG.ORG));
    if (s.note) L.push('DESCRIPTION:' + icsEsc_(s.note));
    /* เตือนล่วงหน้า 12 ชั่วโมง และ 1 ชั่วโมง — โทรศัพท์เตือนเอง ฟรี */
    L.push('BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY',
           'DESCRIPTION:' + icsEsc_('พรุ่งนี้เข้ากะ ' + s.shiftName + ' ' + s.start), 'END:VALARM');
    L.push('BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY',
           'DESCRIPTION:' + icsEsc_('อีก 1 ชั่วโมงเข้ากะ ' + s.shiftName), 'END:VALARM');
    L.push('END:VEVENT');
  });

  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

function icsEsc_(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;')
                        .replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/* =================================================================
 * ชั้นที่ 3 — EMAIL : แจ้งทีม HR โดยไม่กินโควตาไลน์
 * โควตาบัญชี Gmail ฟรี = 100 ฉบับ/วัน ซึ่งเพียงพอมาก
 * ================================================================= */

function hrEmails_() {
  var s = setting('HR_EMAIL', '');
  return String(s).split(/[,;\s]+/).filter(function (e) { return e.indexOf('@') > 0; });
}

function notifyHrEmail(subject, htmlBody) {
  var to = hrEmails_();
  if (!to.length) return false;
  try {
    if (MailApp.getRemainingDailyQuota() < 5) {
      console.warn('โควตาอีเมลใกล้หมด — ข้ามการแจ้งเตือน');
      return false;
    }
    MailApp.sendEmail({
      to: to.join(','),
      subject: '[' + CFG.ORG + ' HR Hub] ' + subject,
      htmlBody: htmlBody,
      name: CFG.ORG + ' HR Hub'
    });
    return true;
  } catch (e) { console.error('notifyHrEmail: ' + e); return false; }
}

function emailTemplate_(title, rows, footer) {
  var tr = rows.map(function (r) {
    return '<tr><td style="padding:8px 12px;color:#866B4E;font-size:13px;white-space:nowrap">' + r[0] +
           '</td><td style="padding:8px 12px;font-size:14px;font-weight:600;color:#312215">' + r[1] + '</td></tr>';
  }).join('');
  return '<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto">' +
    '<div style="background:#6B4A2B;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0">' +
      '<div style="font-size:12px;opacity:.7;letter-spacing:.08em">' + CFG.ORG + ' · HR HUB</div>' +
      '<div style="font-size:19px;font-weight:700;margin-top:4px">' + title + '</div></div>' +
    '<div style="border:1px solid #EADFD0;border-top:0;border-radius:0 0 14px 14px;padding:8px 12px;background:#fff">' +
      '<table style="width:100%;border-collapse:collapse">' + tr + '</table>' +
      (footer ? '<div style="padding:12px;font-size:13px;color:#866B4E;line-height:1.7">' + footer + '</div>' : '') +
      '<div style="padding:12px"><a href="https://docs.google.com/spreadsheets/d/' + CFG.ssId + '/edit" ' +
      'style="display:inline-block;background:#6B4A2B;color:#fff;text-decoration:none;padding:11px 20px;' +
      'border-radius:9px;font-size:14px;font-weight:600">เปิด Google Sheets</a></div>' +
    '</div></div>';
}

/* =================================================================
 * ชั้นที่ 4 — QUOTA GUARD : กันโควตาหมดโดยไม่รู้ตัว
 * ================================================================= */

/** โควตาที่ต้องกันไว้ห้ามแตะ (สำหรับเหตุฉุกเฉินจริงๆ) */
function quotaReserve_() { return Number(setting('QUOTA_RESERVE', '100')) || 100; }

function quotaLeft_() {
  var c = CacheService.getScriptCache().get('quota');
  if (c) { try { return JSON.parse(c); } catch (e) {} }
  try {
    var q = getQuota();
    var r = { limit: q.limit, used: q.used, left: Math.max(0, q.limit - q.used) };
    CacheService.getScriptCache().put('quota', JSON.stringify(r), 600);
    return r;
  } catch (e) { return { limit: 0, used: 0, left: 0 }; }
}

/**
 * ส่ง push อย่างปลอดภัย — ถ้าโควตาเหลือน้อยกว่าที่สงวนไว้ จะไม่ส่ง
 * @param {boolean} isEmergency  true = ยอมให้ใช้โควตาสำรองได้
 */
function safePush(to, messages, isEmergency) {
  var need = [].concat(to).filter(Boolean).length;
  var q = quotaLeft_();
  if (q.limit > 0) {
    var floor = isEmergency ? 0 : quotaReserve_();
    if (q.left - need < floor) {
      audit('system', 'QUOTA_BLOCK', String(need), 'เหลือ ' + q.left + ' สงวน ' + floor);
      console.warn('โควตาไม่พอ — ยกเลิกการส่ง ' + need + ' ข้อความ');
      return false;
    }
  }
  try {
    if (Array.isArray(to)) multicast(to, messages); else push(to, messages);
    CacheService.getScriptCache().remove('quota');
    appendRow(SHEETS.BROADCAST, { timestamp: now_(), type: isEmergency ? 'emergency' : 'push',
      title: '', audience: '', recipients: need, by: 'system' });
    return true;
  } catch (e) { console.error('safePush: ' + e); return false; }
}

/*******************************************************************
 * โก๋ในซอย HR Hub — 05_Webhook.gs
 * ประตูหลักที่ LINE ยิงเข้ามา + API ให้หน้า LIFF เรียก
 *
 * URL เดียวกันทำ 2 หน้าที่:
 *   • LINE Webhook   → body มี { events: [...] }
 *   • LIFF API       → body มี { api: "xxx", idToken: "..." }
 *******************************************************************/

function doPost(e) {
  /* ★ บันทึกว่ามีคำขอเข้ามาแล้ว
     เมนู "④ 📡 LINE ส่งข้อมูลเข้ามาจริงไหม" อ่านสองคีย์นี้ แต่ไม่เคยมีโค้ดไหนเขียนมันเลย
     มันจึงตอบว่า "ยังไม่มีข้อมูลเข้ามา" ตลอดไปแม้ระบบทำงานปกติดี
     ซึ่งแย่กว่าไม่มีเมนูนี้ เพราะทำให้คนไล่หาปัญหาผิดที่ */
  try {
    P.setProperty('LAST_WEBHOOK_AT', now_());
    P.setProperty('WEBHOOK_HITS', String((Number(cfg('WEBHOOK_HITS', '0')) || 0) + 1));
  } catch (e_) { /* ห้ามให้การนับสถิติทำให้ webhook ล่ม */ }

  var out = { ok: false };
  try {
    var body = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(body);

    /* ★ ปุ่ม Verify ของ LINE ยิง body ที่ events เป็นอาเรย์ว่างมา
       ตอบ 200 กลับทันทีโดยไม่แตะ Google Sheets เลย
       สำคัญเพราะตอนกด Verify เรามักยังไม่ได้ใส่ Script Properties ครบ
       ถ้าเผลอไปอ่านชีตแล้ว error ขึ้นมา Apps Script จะตอบเป็นหน้า error (302)
       ทำให้ LINE ขึ้นว่า "The webhook returned an HTTP status code other than 200" */
    if (data && data.events && data.events.length === 0) {
      return json_({ ok: true, verify: true });
    }

    if (data && data.api) {           // ── เรียกจากหน้า LIFF
      out = handleApi_(data);
    } else if (data && data.events) { // ── เรียกจาก LINE
      /*
       * หมายเหตุด้านความปลอดภัย:
       * LINE ส่งลายเซ็นมาใน HTTP header ชื่อ x-line-signature
       * แต่ Google Apps Script ไม่เปิดให้ doPost อ่าน header ได้ จึงตรวจลายเซ็นตรงนี้ไม่ได้
       *
       * การป้องกันจริงของระบบนี้จึงอยู่ที่ 3 ชั้นแทน
       *   1. URL ของ Web App เป็นสตริงสุ่มยาวที่เดาไม่ได้
       *   2. ทุกคำสั่งที่แตะข้อมูลจริง ต้องเจอ lineUserId ในทะเบียนพนักงานที่สถานะ active เท่านั้น
       *   3. หน้าเว็บ LIFF ทุกหน้าถูกบังคับให้ส่ง ID Token ไปให้ LINE ยืนยันก่อนเสมอ (ดู 06_WebApi.gs)
       * ดังนั้นแม้มีคนยิง request ปลอมเข้ามา ก็ทำได้แค่ให้บอทตอบข้อความสาธารณะกลับไปเท่านั้น
       * ไม่สามารถอ่านหรือแก้ไขข้อมูลพนักงานได้
       *
       * ถ้าต้องการตรวจลายเซ็นจริง ให้ย้าย Webhook ไปวางบน Cloudflare Workers หรือ Cloud Functions
       */
      var sig = (e.parameter && e.parameter.sig) ? e.parameter.sig : null;
      if (sig !== null && !verifySignature_(body, sig)) {
        console.warn('ลายเซ็นไม่ถูกต้อง — ปฏิเสธ request');
        return json_({ ok: false });
      }
      data.events.forEach(function (ev) {
        try { handleEvent_(ev); }
        catch (err) { console.error('event error: ' + err + '\n' + (err.stack || '')); }
      });
      out = { ok: true };
    }
  } catch (err) {
    console.error('doPost error: ' + err + '\n' + (err.stack || ''));
    out = { ok: false, error: String(err) };
  }
  return json_(out);
}

function doGet(e) {
  var p = (e && e.parameter) || {};

  /* ---- ปฏิทินกะงาน (.ics) — หัวใจของการเตือนกะแบบ 0 บาท ----
   * พนักงานสมัครรับปฏิทินนี้ครั้งเดียว จากนั้นโทรศัพท์ของเขา
   * จะดึงตารางใหม่และเตือนเองทุกวัน ระบบไม่ต้องส่งข้อความเลย  */
  if (p.ics) {
    var code = String(p.ics).toUpperCase();
    if (String(p.t || '') !== icsToken(code)) {
      return ContentService.createTextOutput('unauthorized').setMimeType(ContentService.MimeType.TEXT);
    }
    var body = buildIcs_(code);
    if (!body) return ContentService.createTextOutput('not found').setMimeType(ContentService.MimeType.TEXT);
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.ICAL);
  }

  // ใช้ทดสอบว่า Web App เผยแพร่แล้ว
  return json_({ ok: true, service: 'Koh Nai Soi HR Hub', time: now_() });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================================================================
 * ตัวจัดการ Event จาก LINE
 * ================================================================ */
function handleEvent_(ev) {
  var userId     = ev.source && ev.source.userId;
  var replyToken = ev.replyToken;

  /* --- เก็บ groupId ไว้ตั้งค่ากลุ่ม HR --- */
  if (ev.type === 'join' || (ev.type === 'message' && ev.source.type === 'group')) {
    if (ev.type === 'message' && ev.message.type === 'text' &&
        String(ev.message.text).trim() === '#groupid') {
      reply(replyToken, { type: 'text', text: 'Group ID:\n' + ev.source.groupId });
      return;
    }
    if (ev.type === 'join') {
      reply(replyToken, { type: 'text',
        text: 'เชื่อมต่อสำเร็จ ✅\nพิมพ์ #groupid เพื่อดู Group ID สำหรับตั้งค่าแจ้งเตือน HR' });
      return;
    }
    return;   // ไม่ยุ่งกับข้อความอื่นในกลุ่ม
  }

  if (!userId) return;

  /* --- เพิ่มเพื่อน --- */
  if (ev.type === 'follow') {
    var e0 = findEmployeeByUserId(userId);
    if (isActive(e0)) {
      grantAccess_(userId);
      reply(replyToken, withQuickReply(flexWelcome(e0)));   // reply = ฟรี ไม่นับโควตา
    } else {
      revokeAccess_(userId);
      reply(replyToken, flexVerifyPrompt());
    }
    audit(userId, 'FOLLOW', e0 ? e0.empCode : '', isActive(e0) ? 'พนักงานเดิมกลับมา' : 'ผู้ใช้ใหม่');
    return;
  }

  /* --- บล็อก/ลบเพื่อน --- */
  if (ev.type === 'unfollow') {
    audit(userId, 'UNFOLLOW', '', 'ผู้ใช้บล็อกหรือลบบัญชี');
    return;
  }

  /* --- ตรวจสิทธิ์ก่อนทำอย่างอื่น --- */
  var emp = findEmployeeByUserId(userId);
  if (!isActive(emp)) {
    // อนุญาตคำสั่งพิเศษสำหรับหาตัว userId ตอนติดตั้ง
    if (ev.type === 'message' && ev.message.type === 'text' &&
        String(ev.message.text).trim() === '#myid') {
      reply(replyToken, { type: 'text', text: 'LINE User ID ของคุณคือ\n' + userId });
      return;
    }
    revokeAccess_(userId);
    reply(replyToken, emp ? flexBlocked(String(emp.status).trim().toUpperCase()) : flexVerifyPrompt());
    return;
  }

  /* --- Postback --- */
  if (ev.type === 'postback') { handlePostback_(ev, emp); return; }

  /* --- ข้อความ --- */
  if (ev.type === 'message') {
    if (ev.message.type === 'text') { handleText_(ev, emp); return; }
    /* ★ ต้องอยู่ "ก่อน" ข้อความปฏิเสธด้านล่าง และรับเฉพาะ hr/admin เท่านั้น
       (ตัวฟังก์ชันเช็ก role เอง คืน false ถ้าไม่ใช่ ซึ่งจะตกไปโดนปฏิเสธตามเดิม)
       คำเตือนเรื่องข้อมูลส่วนบุคคลด้านล่างจึงยังทำงานกับพนักงานทั่วไปครบเหมือนเดิม */
    if (typeof handleImageMessage_ === 'function' && handleImageMessage_(ev, emp)) return;
    reply(replyToken, withQuickReply({ type: 'text',
      text: 'ตอนนี้ระบบรับเฉพาะข้อความตัวอักษรค่ะ 🙏\n\n⚠️ เพื่อความปลอดภัยของข้อมูลส่วนบุคคล กรุณาอย่าส่งรูปบัตรประชาชนหรือใบรับรองแพทย์ผ่านแชทนี้ ให้ยื่นเอกสารตัวจริงที่ร้านแทน' }));
    return;
  }
}

/* ================================================================
 * ข้อความตัวอักษร
 * ================================================================ */
function handleText_(ev, emp) {
  var text = String(ev.message.text || '').trim();
  var rt   = ev.replyToken;

  /* คำสั่งลัด */
  var shortcuts = {
    '#myid':     function () { reply(rt, { type: 'text', text: 'LINE User ID ของคุณคือ\n' + ev.source.userId }); },
    'เมนู':      function () { reply(rt, withQuickReply(flexTopFaq())); },
    'ติดต่อhr':  function () { reply(rt, flexHrMenu(emp)); },
    'ติดต่อ hr': function () { reply(rt, flexHrMenu(emp)); },
    'กะวันนี้':  function () { replyTodayShift_(rt, emp); },
    'ตารางงาน':  function () { replyTodayShift_(rt, emp); },
    'ประกาศ':    function () { replyLatestNews_(rt, emp); },
    'คู่มือ':    function () { reply(rt, flexHandbookMenu()); },
    'สวัสดิการ': function () { reply(rt, flexHandbookMenu()); },
    'แอป':       function () { reply(rt, flexAppGuideMenu()); },
    'hrcloud':   function () { reply(rt, flexAppGuideMenu()); },
    'ลงเวลา':    function () { reply(rt, flexAppGuideMenu()); },
    'แสกน':      function () { reply(rt, flexAppGuideMenu()); },
    'สแกน':      function () { reply(rt, flexAppGuideMenu()); },
    'ปฏิทิน':    function () { reply(rt, flexCalendarHelp(emp)); },
    'ผังองค์กร': function () { reply(rt, flexOrgLink(emp)); },
    'แผนผัง':    function () { reply(rt, flexOrgLink(emp)); },
    'หัวหน้า':   function () { reply(rt, flexOrgLink(emp)); },
    'องค์กร':    function () { reply(rt, flexOrgLink(emp)); },
    'รายงาน':    function () { reply(rt, flexReportsLink(emp)); },
    'สรุป':      function () { reply(rt, flexReportsLink(emp)); }
  };
  var key = text.toLowerCase().replace(/\s+/g, '');
  var alt = text.toLowerCase();
  if (shortcuts[key]) { shortcuts[key](); logQuery_(emp, text, 'shortcut'); return; }
  if (shortcuts[alt]) { shortcuts[alt](); logQuery_(emp, text, 'shortcut'); return; }

  /* ค้นหา FAQ */
  var r = searchFaq(text);
  if (r.best) {
    reply(rt, withQuickReply(flexFaqAnswer(r.best)));
    logQuery_(emp, text, 'faq:' + r.best.id);
    return;
  }
  if (r.suggestions.length) {
    reply(rt, withQuickReply(flexFaqSuggest(r.suggestions, text)));
    logQuery_(emp, text, 'suggest');
    return;
  }
  reply(rt, withQuickReply(flexFaqNotFound(text)));
  logQuery_(emp, text, 'notfound');
}

/** บันทึกคำถามที่ตอบไม่ได้ เพื่อให้ HR เอาไปเพิ่มเป็น FAQ */
function logQuery_(emp, text, result) {
  if (result === 'notfound' || result === 'suggest') {
    audit(emp ? emp.empCode : '', 'FAQ_MISS', result, text);
  }
}

/* ================================================================
 * Postback
 * ================================================================ */
function handlePostback_(ev, emp) {
  var rt = ev.replyToken;
  var p  = parseQuery_(ev.postback.data || '');
  var a  = p.action;

  /* ★ ห้ามล้างจุดแดง 'hr' ตรงนี้
     flexHrMenu() เป็นแค่กระดานปุ่ม ไม่มีคำตอบของ HR อยู่ในนั้นเลย
     ผู้ใช้ต้องกดต่ออีกทีเข้าหน้า "เรื่องของฉัน" ถึงจะได้อ่านคำตอบจริง
     เดิมล้างที่นี่ = จุดแดงหายตั้งแต่ยังไม่เห็นอะไร และไม่มีสัญญาณที่สองอีกเลย
     ทั้งที่จุดแดงคือช่องทางเดียวที่บอกว่า HR ตอบแล้ว (โหมด 0 บาท ไม่มี push)
     จุดล้างที่ถูกต้องคือ API 'my_tickets' ใน 06_WebApi.js ซึ่งคืนคอลัมน์ reply จริง */
  if (a === 'hr_menu')     { reply(rt, flexHrMenu(emp)); return; }
  if (a === 'appguide')    { reply(rt, flexAppGuideMenu()); return; }
  if (a === 'org')         { reply(rt, flexOrgLink(emp)); return; }
  if (a === 'reports')     { reply(rt, flexReportsLink(emp)); return; }
  if (a === 'faq_top')     { reply(rt, withQuickReply(flexTopFaq())); return; }
  if (a === 'handbook')    { reply(rt, flexHandbookMenu()); return; }
  if (a === 'today_shift') { replyTodayShift_(rt, emp); return; }
  if (a === 'news')        { clearBadge(ev.source.userId, 'news'); replyLatestNews_(rt, emp); return; }

  if (a === 'faq') {
    var f = getFaqById(p.id);
    reply(rt, withQuickReply(f ? flexFaqAnswer(f) : flexFaqNotFound('')));
    return;
  }

  if (a === 'faq_rate') {
    audit(emp.empCode, 'FAQ_RATE', p.id, p.v === '1' ? 'ตรงคำถาม' : 'ไม่ตรง');
    reply(rt, { type: 'text', text: 'ขอบคุณสำหรับฟีดแบ็กค่ะ 🙏' });
    return;
  }

  /* อ่านคำตอบของเรื่องหนึ่งเรื่อง — ★ จุดนี้คือที่ที่ผู้ใช้ "ได้อ่านคำตอบจริง"
     จึงเป็นจุดที่ถูกต้องในการล้างจุดแดง ไม่ใช่ตอนเปิดเมนูหรือตอนดูรายการ */
  if (a === 'ticket_reply') {
    var tk = findTicket(String(p.id || ''));
    /* ต้องเป็นเรื่องของคนที่กดเองเท่านั้น ห้ามให้เดารหัสเรื่องของคนอื่นแล้วอ่านได้ */
    if (!tk || String(tk.empCode || '').toUpperCase() !== String(emp.empCode || '').toUpperCase()) {
      reply(rt, withQuickReply({ type: 'text', text: 'ไม่พบเรื่องนี้ในรายการของคุณค่ะ' }));
      return;
    }
    clearBadge(ev.source.userId, 'hr');
    reply(rt, flexTicketUpdate(tk));
    return;
  }

  if (a === 'my_tickets') {
    reply(rt, flexMyTickets(myTickets(emp.empCode, ev.source.userId)));
    return;
  }

  if (a === 'to_hr') {
    var q = p.q ? decodeURIComponent(p.q) : '';
    reply(rt, {
      type: 'text',
      text: 'กดปุ่มด้านล่างเพื่อส่งเรื่องถึง HR ได้เลยค่ะ',
      quickReply: { items: [
        { type: 'action', action: fxUri_('📝 เขียนเรื่องถึง HR', liffUrl(CFG.liff.hr, 'cat=consult' + (q ? '&q=' + encodeURIComponent(q) : ''))) },
        { type: 'action', action: fxPost_('❓ ดูคำถามยอดฮิต', 'action=faq_top') }
      ]}
    });
    return;
  }

  /* postback ของการแนบรูปในประกาศ — ดักก่อนข้อความ "ไม่พบคำสั่งนี้" */
  if (typeof handleMediaPostback_ === 'function' && handleMediaPostback_(p, ev, emp)) return;

  reply(rt, withQuickReply({ type: 'text', text: 'ไม่พบคำสั่งนี้ค่ะ ลองเลือกจากเมนูด้านล่างนะคะ' }));
}

/* ================================================================
 * ตัวช่วยตอบ
 * ================================================================ */
function replyTodayShift_(rt, emp) {
  var shifts = getScheduleFor(emp.empCode, addDaysStr_(-1), addDaysStr_(9));
  reply(rt, withQuickReply(flexTodayShift(emp, shifts)));
}

function replyLatestNews_(rt, emp) {
  var list = getAnnouncements(emp, 5);
  if (!list.length) {
    reply(rt, withQuickReply({ type: 'text', text: 'ยังไม่มีประกาศใหม่ในตอนนี้ค่ะ 📭' }));
    return;
  }
  var bubbles = list.slice(0, 5).map(function (a) { return flexAnnouncement(a).contents; });
  reply(rt, withQuickReply(fx_('ประกาศล่าสุด', { type: 'carousel', contents: bubbles })));
}

function parseQuery_(s) {
  var o = {};
  String(s).split('&').forEach(function (kv) {
    var i = kv.indexOf('=');
    if (i < 0) { o[kv] = ''; return; }
    o[kv.slice(0, i)] = kv.slice(i + 1);
  });
  return o;
}

/* ================================================================
 * เปิด / ปิด สิทธิ์การเห็นเมนู  (หัวใจของการกันคนนอก)
 * ================================================================ */
function grantAccess_(userId) {
  try { if (CFG.richMenuMain) linkRichMenuToUser(userId, CFG.richMenuMain); }
  catch (e) { console.error('grantAccess_ ' + e); }
}

function revokeAccess_(userId) {
  try {
    if (CFG.richMenuGuest) linkRichMenuToUser(userId, CFG.richMenuGuest);
    else unlinkRichMenuFromUser(userId);
  } catch (e) { console.error('revokeAccess_ ' + e); }
}
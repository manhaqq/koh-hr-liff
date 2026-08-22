/*******************************************************************
 * โก๋ในซอย HR Hub — 11_Reports.gs
 * ตัวสร้างรายงาน 7 ชุดสำหรับ HR (ทำงานใน Google Sheets เท่านั้น)
 * -----------------------------------------------------------------
 * หลักการ: ไม่เก็บตัวเลขไว้ในชีต แต่คำนวณสดทุกครั้งที่กด
 *          ผลลัพธ์เขียนลงชีตชื่อขึ้นต้น "รายงาน-" ซึ่งสร้าง/ล้างใหม่ทุกครั้ง
 * ทุกฟังก์ชันในไฟล์นี้ไม่ส่งข้อความ LINE เลย → 0 โควตา
 *******************************************************************/

/** สร้าง (หรือล้าง) ชีตรายงาน แล้วเขียนหัวเรื่อง + ตาราง */
function writeReport_(name, title, headers, rows, widths, footnote) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1).setValue(title + '  ·  ณ ' + now_());
  sh.getRange(1, 1, 1, Math.max(headers.length, 1)).merge()
    .setBackground(CFG.BRAND.primary).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(12).setVerticalAlignment('middle');
  sh.setRowHeight(1, 28);

  sh.getRange(2, 1, 1, headers.length).setValues([headers])
    .setBackground('#EFE4D6').setFontWeight('bold');
  if (rows.length) sh.getRange(3, 1, rows.length, headers.length).setValues(rows);

  (widths || []).forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(2);

  if (footnote) {
    var r = 3 + rows.length + 1;
    sh.getRange(r, 1).setValue(footnote);
    sh.getRange(r, 1, 1, headers.length).merge()
      .setFontSize(9).setFontColor('#866B4E').setWrap(true);
  }
  sh.activate();
  return sh;
}

/* ================================================================
 * R07 — กำลังพลรายแผนก
 * ================================================================ */
function reportHeadcount() {
  var rows = readTable(SHEETS.EMPLOYEES);
  var m = {}, order = [];
  rows.forEach(function (e) {
    var d = String(e.dept || 'ไม่ระบุแผนก').trim();
    if (!m[d]) { m[d] = { active: 0, pending: 0, suspended: 0, resigned: 0, heads: [], linked: 0 }; order.push(d); }
    var st = String(e.status).trim();
    if (m[d][st] !== undefined) m[d][st]++;
    if (String(e.role).trim() === ROLES.SUPERVISOR) m[d].heads.push(e.fullName);
    if (st === EMP_STATUS.ACTIVE && String(e.lineUserId).trim()) m[d].linked++;
  });

  var out = order.sort(function (a, b) { return m[b].active - m[a].active; }).map(function (d) {
    var x = m[d];
    return [d, x.active, x.pending, x.suspended, x.resigned,
            x.linked, x.active ? Math.round(x.linked / x.active * 100) + '%' : '-',
            x.heads.join(', ')];
  });
  var tot = rows.filter(isActive).length;
  var lnk = rows.filter(function (e) { return isActive(e) && String(e.lineUserId).trim(); }).length;
  out.push(['รวมทั้งหมด', tot, '', '', '', lnk, tot ? Math.round(lnk / tot * 100) + '%' : '-', '']);

  writeReport_('รายงาน-กำลังพล', '👥 กำลังพลรายแผนก',
    ['แผนก', 'ทำงานอยู่', 'รออนุมัติ', 'พักงาน', 'ลาออก', 'ผูก LINE แล้ว', 'สัดส่วนที่ผูกแล้ว', 'หัวหน้าแผนก'],
    out, [22, 11, 11, 10, 10, 14, 16, 40],
    'นับจากชีต Employees โดยตรง · "ผูก LINE แล้ว" คือคนที่ยืนยันตัวตนและใช้เมนูได้จริง');
}

/* ================================================================
 * R06 — ความครอบคลุมกะ (หาช่องโหว่กำลังคน)
 * ================================================================ */
function reportShiftCoverage() {
  var from = todayStr_(), to = addDaysStr_(14);
  var emp = {};
  readTable(SHEETS.EMPLOYEES).forEach(function (e) {
    emp[String(e.empCode).trim().toUpperCase()] = e;
  });
  var shiftMap = {};
  readTable(SHEETS.SHIFTS).forEach(function (x) { shiftMap[String(x.shiftCode).trim()] = x; });

  var cell = {}, days = {}, depts = {};
  readTable(SHEETS.SCHEDULE).forEach(function (r) {
    var d = String(r.date).trim();
    if (d < from || d > to) return;
    var code = String(r.shiftCode).trim();
    if (code === 'OFF' || code === 'LV') return;
    var e = emp[String(r.empCode).trim().toUpperCase()];
    if (!e || String(e.status).trim() === EMP_STATUS.RESIGNED) return;
    var dept = String(r.dept || e.dept || 'ไม่ระบุ').trim();
    days[d] = true; depts[dept] = true;
    var k = dept + '|' + d;
    if (!cell[k]) cell[k] = { n: 0, codes: {} };
    cell[k].n++;
    cell[k].codes[code] = (cell[k].codes[code] || 0) + 1;
  });

  var dayList = Object.keys(days).sort();
  var deptList = Object.keys(depts).sort();
  var head = ['แผนก'].concat(dayList.map(function (d) { return thaiDay_(d) + ' ' + d.slice(5); }));
  var out = deptList.map(function (dept) {
    var vals = dayList.map(function (d) {
      var c = cell[dept + '|' + d];
      return c ? c.n : 0;
    });
    var nonzero = vals.filter(function (v) { return v > 0; });
    var avg = nonzero.length ? nonzero.reduce(function (a, b) { return a + b; }, 0) / nonzero.length : 0;
    return { dept: dept, vals: vals, avg: avg };
  });

  var sh = writeReport_('รายงาน-ความครอบคลุมกะ', '🗓️ ความครอบคลุมกะ 14 วันข้างหน้า',
    head, out.map(function (o) { return [o.dept].concat(o.vals); }),
    [20].concat(dayList.map(function () { return 9; })),
    'ตัวเลข = จำนวนคนที่เข้ากะในวันนั้น (ไม่นับ OFF/LV) · ' +
    'พื้นแดง = ไม่มีคนเลย · พื้นเหลือง = น้อยกว่า 70% ของค่าเฉลี่ยแผนกนั้น · ' +
    'คนที่ยังไม่มี empCode ในชีต ShiftPattern จะไม่ถูกนับ');

  /* ระบายสีช่องที่น่ากังวล */
  out.forEach(function (o, i) {
    o.vals.forEach(function (v, j) {
      var c = sh.getRange(3 + i, 2 + j);
      if (v === 0) c.setBackground('#FDECEA').setFontColor('#B3261E').setFontWeight('bold');
      else if (o.avg > 0 && v < Math.max(1, Math.floor(o.avg * 0.7))) c.setBackground('#FDF6E9');
    });
  });
}

/* ================================================================
 * R08 — สถานะการยืนยันตัวตน
 * ================================================================ */
function reportVerification() {
  var rows = readTable(SHEETS.EMPLOYEES);
  var out = rows.map(function (e) {
    var st = String(e.status).trim();
    var linked = String(e.lineUserId).trim() ? 'ผูกแล้ว' : '—';
    var blocker = '';
    if (st === EMP_STATUS.RESIGNED) blocker = 'ลาออกแล้ว';
    else if (!/^[0-9]{4}$/.test(String(e.phoneLast4).trim())) blocker = '❌ ไม่มีเบอร์โทร 4 ตัวท้าย — ยืนยันไม่ได้';
    else if (!String(e.firstName).trim() || !String(e.lastName).trim()) blocker = '❌ ชื่อหรือนามสกุลว่าง';
    else if (!String(e.lineUserId).trim()) blocker = 'ยังไม่ได้ยืนยัน';
    return [e.empCode, e.fullName, e.dept, e.position, st, linked, e.verifiedAt || '', blocker];
  }).sort(function (a, b) { return String(b[7]).localeCompare(String(a[7])); });

  writeReport_('รายงาน-สถานะยืนยันตัวตน', '🔐 สถานะการยืนยันตัวตนใน LINE',
    ['รหัส', 'ชื่อ-นามสกุล', 'แผนก', 'ตำแหน่ง', 'สถานะ', 'บัญชี LINE', 'ยืนยันเมื่อ', 'สิ่งที่ติดอยู่'],
    out, [11, 26, 16, 24, 11, 12, 18, 40],
    'ใช้ตามงานตอนเปิดระบบใหม่ · แถวที่ขึ้น ❌ คือคนที่ยืนยันตัวตนเองไม่ได้จนกว่า HR จะเติมข้อมูลให้ครบ');
}

/* ================================================================
 * R09 — สรุปเรื่องถึง HR
 * ================================================================ */
function reportTickets() {
  var t = readTable(SHEETS.TICKETS);
  var today = todayStr_();
  var m = {}, order = [];
  var overdue = 0, open = 0, answered = 0, closed = 0;
  t.forEach(function (x) {
    var c = String(x.category || 'ไม่ระบุ').trim();
    if (!m[c]) { m[c] = { total: 0, open: 0, answered: 0, closed: 0, late: 0 }; order.push(c); }
    m[c].total++;

    /* ★ ตัดสิน "ค้าง/ไม่ค้าง" ด้วย isTicketOpen ตัวเดียวกับที่อีเมลเช้าและแดชบอร์ดใช้
       เดิมที่นี่เทียบกับ 'closed' และ 'ปิดแล้ว' ซึ่งไม่มีโค้ดไหนเขียนลงชีตเลยสักครั้ง
       รายงานฉบับนี้จึงบอกว่า 100% ของเรื่องยังไม่ปิด ทุกครั้งที่กด ตั้งแต่วันแรก
       แยกคอลัมน์ "ตอบแล้ว" กับ "ปิดแล้ว" ออกจากกัน เพราะสองอย่างนี้ไม่เท่ากัน
       และ HR ต้องเห็นว่ามีกี่เรื่องที่ตอบไปแล้วแต่ยังไม่ได้กดปิด */
    var st = normalizeTicketStatus(x.status);
    if (isTicketOpen(x.status)) { m[c].open++; open++; }
    else if (st === TICKET_STATUS.ANSWERED) { m[c].answered++; answered++; }
    else { m[c].closed++; closed++; }

    if (isTicketOpen(x.status) && String(x.slaDue).trim() && String(x.slaDue).trim() < today) {
      m[c].late++; overdue++;
    }
  });
  var out = order.map(function (c) {
    return [c, m[c].total, m[c].open, m[c].answered, m[c].closed, m[c].late];
  });
  out.push(['รวม', t.length, open, answered, closed, overdue]);

  writeReport_('รายงาน-เรื่องถึง HR', '💬 สรุปเรื่องถึง HR',
    ['หมวด', 'ทั้งหมด', 'ยังค้าง', 'ตอบแล้ว', 'ปิดแล้ว', 'เกินกำหนดตอบ'],
    out, [26, 11, 11, 11, 11, 15],
    'ยังค้าง = ยังไม่ได้ตอบ (สถานะ "' + TICKET_STATUS.NEW + '" หรือ "' + TICKET_STATUS.WIP + '") · ' +
    'ตอบแล้ว = ส่งคำตอบไปแล้วแต่ยังไม่ได้กดปิดเรื่อง · ' +
    'เกินกำหนด = ยังค้าง และเลยวันที่ในคอลัมน์ slaDue แล้ว · ' +
    'สถานะที่ระบบไม่รู้จักจะถูกนับเป็น "ยังค้าง" เพื่อไม่ให้เรื่องหายเงียบ — ' +
    'ถ้าตัวเลขดูแปลก ให้กดเมนู 💬 เรื่องถึง HR > "แปลงคำสถานะเดิมให้ตรงกัน" · ' +
    'กำหนดเวลาตอบของแต่ละหมวดตั้งไว้ใน TICKET_CATEGORIES ของไฟล์ 00_Config.gs');
}

/* ================================================================
 * R10 — สรุปการลา
 * ================================================================ */
function reportLeave() {
  var rows = readTable(SHEETS.LEAVE);
  var emp = {};
  readTable(SHEETS.EMPLOYEES).forEach(function (e) { emp[String(e.empCode).trim().toUpperCase()] = e; });

  var m = {}, keys = [];
  rows.forEach(function (l) {
    var e = emp[String(l.empCode).trim().toUpperCase()] || {};
    var k = (e.dept || 'ไม่ระบุ') + '|' + (l.type || 'ไม่ระบุ');
    if (!m[k]) { m[k] = { dept: e.dept || 'ไม่ระบุ', type: l.type || 'ไม่ระบุ',
                          n: 0, days: 0, approved: 0, pending: 0 }; keys.push(k); }
    m[k].n++;
    m[k].days += Number(l.days) || 0;

    /* ★ เดิมเทียบกับคำอังกฤษ 'approved' แต่ระบบเขียนคำไทยลงชีต
       ช่อง "อนุมัติแล้ว" จึงเป็น 0 ตลอดกาล เว้นแต่ HR จะบังเอิญพิมพ์อังกฤษเอง
       เพิ่มช่อง "รออนุมัติ" ด้วย เพราะนั่นคือตัวเลขที่ HR ต้องลงมือทำอะไรต่อ */
    var st = normalizeLeaveStatus(l.status);
    if (st === LEAVE_STATUS.APPROVED) m[k].approved++;
    else if (st === LEAVE_STATUS.PENDING) m[k].pending++;
  });
  var out = keys.sort().map(function (k) {
    return [m[k].dept, m[k].type, m[k].n, m[k].days, m[k].approved, m[k].pending];
  });

  writeReport_('รายงาน-การลา', '🌴 สรุปการลาทั้งองค์กร',
    ['แผนก', 'ประเภทการลา', 'จำนวนใบลา', 'รวมวันลา', 'อนุมัติแล้ว', 'รออนุมัติ'],
    out, [20, 22, 12, 11, 12, 12],
    'นับเฉพาะใบลาที่ยื่นผ่าน LINE เท่านั้น · ใบลาที่ยื่นในแอป myHR Cloud หรือกระดาษไม่รวมอยู่ในนี้ · ' +
    'สถานะที่นับได้คือ "' + LEAVE_STATUS.PENDING + '" / "' + LEAVE_STATUS.APPROVED + '" / "' +
    LEAVE_STATUS.REJECTED + '" — ถ้าพิมพ์คำอื่นจะไม่ถูกนับในสองช่องขวา');
}

/* ================================================================
 * R11 — รายชื่อที่ต้องยืนยัน (ตารางกะ ↔ ทะเบียนพนักงาน)
 * ================================================================ */
function reportRosterGaps() {
  var pats = readTable(SHEETS.SHIFTPATTERN);
  var emp = readTable(SHEETS.EMPLOYEES);
  var byCode = {};
  emp.forEach(function (e) { byCode[String(e.empCode).trim().toUpperCase()] = e; });

  var out = [];
  pats.forEach(function (p) {
    var code = String(p.empCode).trim();
    var problem = '';
    if (!code) problem = '❌ ยังไม่ได้ระบุว่าเป็นพนักงานคนไหน — คนนี้จะไม่เห็นกะของตัวเอง';
    else if (!byCode[code.toUpperCase()]) problem = '❌ empCode ' + code + ' ไม่มีในทะเบียนพนักงาน';
    else if (String(p.match).trim() !== 'ok') problem = '⚠️ จับคู่แบบคาดเดา — ควรยืนยันกับหัวหน้าแผนก';
    else {
      var e = byCode[code.toUpperCase()];
      if (String(e.dept).trim() && String(p.dept).trim() &&
          String(e.dept).trim() !== String(p.dept).trim())
        problem = '⚠️ แผนกในตารางกะ (' + p.dept + ') ไม่ตรงกับทะเบียน (' + e.dept + ')';
    }
    if (problem) {
      var e2 = byCode[code.toUpperCase()] || {};
      out.push([p.rosterName, p.dept, p.shiftCode, code, e2.fullName || '', problem, p.note || '']);
    }
  });

  /* พนักงานที่ยังไม่มีกะเลย */
  var covered = {};
  pats.forEach(function (p) { if (p.empCode) covered[String(p.empCode).trim().toUpperCase()] = true; });
  emp.forEach(function (e) {
    if (!isActive(e)) return;
    if (covered[String(e.empCode).trim().toUpperCase()]) return;
    out.push(['—', e.dept || '', '—', e.empCode, e.fullName,
              'ℹ️ ยังไม่มีรูปแบบกะ — ถ้าเป็นพนักงานสำนักงานถือว่าปกติ', '']);
  });

  writeReport_('รายงาน-รายชื่อที่ต้องยืนยัน', '⚠️ รายชื่อที่ต้องยืนยัน (ตารางกะ ↔ ทะเบียนพนักงาน)',
    ['ชื่อในตารางกะ', 'แผนก', 'รหัสกะ', 'empCode', 'ชื่อในทะเบียน', 'สิ่งที่ต้องทำ', 'หมายเหตุจากการนำเข้า'],
    out, [18, 16, 11, 11, 26, 52, 58],
    'ตารางกะต้นฉบับใช้ชื่อเล่น/ชื่ออิสลาม ส่วนทะเบียนพนักงานใช้ชื่อจริง ระบบจึงจับคู่ให้ไม่ได้ทุกคน · ' +
    'วิธีแก้: เปิดชีต ShiftPattern เติมคอลัมน์ empCode แล้วเปลี่ยน match เป็น ok ' +
    'จากนั้นกดเมนู 🗓️ ตารางงาน > สร้างตารางกะจากรูปแบบ');
}

/* ================================================================
 * R12 — สุขภาพระบบ
 * ================================================================ */
function reportSystemHealth() {
  var q = null;
  try { q = getQuota(); } catch (e) { q = null; }
  var left = q ? Math.max(0, (Number(q.limit) || 0) - (Number(q.used) || 0)) : 'อ่านไม่ได้';
  var emp = readTable(SHEETS.EMPLOYEES);
  var active = emp.filter(isActive);
  var linked = active.filter(function (e) { return String(e.lineUserId).trim(); });
  var noPhone = active.filter(function (e) { return !/^[0-9]{4}$/.test(String(e.phoneLast4).trim()); });
  var pats = readTable(SHEETS.SHIFTPATTERN);
  var gaps = pats.filter(function (p) { return !String(p.empCode).trim() || String(p.match).trim() !== 'ok'; });
  var sched = readTable(SHEETS.SCHEDULE);
  var future = sched.filter(function (r) { return String(r.date).trim() >= todayStr_(); });
  var trig = 0;
  try { trig = ScriptApp.getProjectTriggers().length; } catch (e) {}

  var missing = [];
  REQUIRED_PROPS.forEach(function (k) { if (k !== 'HR_NOTIFY_GROUP_ID' && !cfg(k)) missing.push(k); });

  var out = [
    ['โควตาข้อความคงเหลือเดือนนี้', left, q ? ((q.limit || 0) + ' (' + (q.type || '') + ')') : '',
     'ใช้ไปแล้ว ' + (q ? q.used : '-') + ' · ระบบสงวนไว้ห้ามแตะ ' + quotaReserve_() + ' ข้อความ'],
    ['พนักงานที่ทำงานอยู่', active.length, '', ''],
    ['ยืนยันตัวตนแล้ว', linked.length, active.length ? Math.round(linked.length / active.length * 100) + '%' : '-', 'เป้าหมาย 100% ภายใน 2 สัปดาห์แรก'],
    ['ยังไม่มีเบอร์โทร 4 ตัวท้าย', noPhone.length, '', noPhone.length ? '❌ คนเหล่านี้ยืนยันตัวตนไม่ได้ — ' + noPhone.slice(0, 5).map(function (e) { return e.fullName; }).join(', ') + (noPhone.length > 5 ? ' …' : '') : '✅ ครบทุกคน'],
    ['รูปแบบกะที่ยังไม่สมบูรณ์', gaps.length, pats.length, gaps.length ? '⚠️ ดูเมนู 📊 รายงาน > รายชื่อที่ต้องยืนยัน' : '✅ ครบ'],
    ['ตารางกะล่วงหน้า', future.length + ' แถว', '', future.length ? 'ถึงวันที่ ' + future.map(function (r) { return String(r.date).trim(); }).sort().pop() : '❌ ยังไม่ได้สร้างตาราง'],
    ['งานอัตโนมัติ (Triggers)', trig, '', trig >= 4 ? '✅ ติดตั้งครบ' : '⚠️ ควรมีอย่างน้อย 4 — กดเมนู "ติดตั้งงานอัตโนมัติ"'],
    ['การตั้งค่าที่ยังขาด', missing.length, '', missing.length ? '❌ ' + missing.join(', ') : '✅ ครบ'],
    ['โหมดรอ HR อนุมัติ', setting('VERIFY_REQUIRE_APPROVAL', 'FALSE'), '', 'ตั้งเป็น TRUE เพื่อให้ HR ตรวจก่อนเปิดสิทธิ์ทุกคน (ปลอดภัยกว่า แต่ช้ากว่า)']
  ];

  writeReport_('รายงาน-สุขภาพระบบ', '🩺 สุขภาพระบบและโควตาข้อความ',
    ['รายการ', 'ค่า', 'จากทั้งหมด', 'หมายเหตุ'], out, [30, 16, 13, 76],
    'รายงานนี้ไม่ส่งข้อความ LINE เลย · เปิดดูได้บ่อยเท่าที่ต้องการ');
}

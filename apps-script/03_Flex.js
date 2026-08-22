/*******************************************************************
 * โก๋ในซอย HR Hub — 03_Flex.gs
 * ตัวสร้างข้อความ Flex ทั้งหมด (หน้าตาของระบบอยู่ที่ไฟล์นี้)
 *******************************************************************/

var C = CFG.BRAND;

/* ---------- ชิ้นส่วนที่ใช้ซ้ำ ---------- */

function fxHeader_(title, subtitle, bg) {
  return {
    type: 'box', layout: 'vertical', backgroundColor: bg || C.primary,
    paddingAll: '18px', paddingBottom: '16px',
    contents: [
      { type: 'text', text: title, color: '#FFFFFF', size: 'lg', weight: 'bold', wrap: true },
      subtitle ? { type: 'text', text: subtitle, color: '#FFFFFFCC', size: 'xs', wrap: true, margin: 'sm' } : null
    ].filter(Boolean)
  };
}

function fxRow_(label, value, valueColor) {
  return {
    type: 'box', layout: 'baseline', spacing: 'sm', margin: 'md',
    contents: [
      { type: 'text', text: label, color: C.sub, size: 'sm', flex: 3 },
      { type: 'text', text: String(value || '-'), color: valueColor || C.ink, size: 'sm', flex: 5, wrap: true, weight: 'bold' }
    ]
  };
}

function fxBtn_(label, action, style, color) {
  return { type: 'button', style: style || 'primary', height: 'sm',
           color: color || C.primary, action: action, margin: 'sm' };
}

function fxUri_(label, url)            { return { type: 'uri', label: label, uri: url }; }
function fxPost_(label, data, display) { return { type: 'postback', label: label, data: data, displayText: display || undefined }; }

function fxDivider_() { return { type: 'separator', margin: 'lg', color: '#EADFD0' }; }

function fx_(altText, bubbleOrCarousel) {
  return { type: 'flex', altText: altText, contents: bubbleOrCarousel };
}

/* ================================================================
 * 1) ยืนยันตัวตน
 * ================================================================ */
function flexVerifyPrompt() {
  return fx_('กรุณายืนยันตัวตนพนักงาน', {
    type: 'bubble',
    header: fxHeader_('ยืนยันตัวตนพนักงาน', CFG.ORG + ' • HR Communication Hub'),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [
        { type: 'text', size: 'sm', color: C.ink, wrap: true,
          text: 'สวัสดีค่ะ 🙏 ช่องทางนี้สงวนไว้สำหรับพนักงาน ' + CFG.ORG + ' เท่านั้น' },
        { type: 'text', size: 'sm', color: C.sub, wrap: true, margin: 'md',
          text: 'กรุณายืนยันตัวตนเพื่อเปิดใช้งานเมนูทั้งหมด ใช้เวลาไม่ถึง 1 นาที' },
        fxDivider_(),
        { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: [
          { type: 'text', text: 'สิ่งที่ต้องเตรียม', size: 'xs', color: C.accent, weight: 'bold' },
          { type: 'text', text: '• ชื่อจริงและนามสกุล ตามที่แจ้งไว้กับ HR', size: 'xs', color: C.sub, wrap: true },
          { type: 'text', text: '• เบอร์โทรศัพท์ของคุณ 4 ตัวท้าย (เบอร์ที่แจ้งไว้กับ HR)', size: 'xs', color: C.sub, wrap: true },
          { type: 'text', text: '• ไม่ต้องใช้รหัสพนักงาน', size: 'xs', color: C.accent, wrap: true }
        ]}
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [
        fxBtn_('เริ่มยืนยันตัวตน', fxUri_('เริ่มยืนยันตัวตน', liffUrl(CFG.liff.verify)), 'primary', C.primary),
        { type: 'text', margin: 'md', size: 'xxs', color: C.sub, align: 'center', wrap: true,
          text: 'ข้อมูลของคุณถูกเก็บตามนโยบาย PDPA ของร้าน' }
      ]
    }
  });
}

/* ================================================================
 * 2) ยินดีต้อนรับหลังยืนยันสำเร็จ
 * ================================================================ */
function flexWelcome(emp) {
  return fx_('ยืนยันตัวตนสำเร็จ', {
    type: 'bubble',
    header: fxHeader_('✅ ยืนยันตัวตนสำเร็จ', 'ยินดีต้อนรับสู่ ' + CFG.ORG + ' HR Hub', C.ok),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [
        { type: 'text', text: 'สวัสดีคุณ ' + (emp.nickname || emp.fullName), weight: 'bold', size: 'md', color: C.ink, wrap: true },
        fxRow_('รหัสพนักงาน', emp.empCode),
        fxRow_('ตำแหน่ง', emp.position),
        fxRow_('สาขา', emp.branch),
        fxDivider_(),
        { type: 'text', margin: 'lg', size: 'xs', color: C.sub, wrap: true,
          text: 'เมนูด้านล่างเปิดใช้งานแล้ว 4 ช่อง — ประกาศ, คู่มือ, ตารางงาน และติดต่อ HR\n\nพิมพ์คำถามเข้ามาได้เลย เช่น "ลาป่วยกี่วัน" "OT คิดยังไง" ระบบตอบทันที\n\n💡 มีจุดแดงบนเมนู = มีของใหม่ กดเข้าไปดูแล้วจุดจะหายเอง' }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [ fxBtn_('ดูประกาศล่าสุด', fxUri_('ดูประกาศล่าสุด', liffUrl(CFG.liff.news)), 'primary', C.primary) ]
    }
  });
}

/* ================================================================
 * 3) เมนูคู่มือและสวัสดิการ (Carousel)
 * ================================================================ */
var HANDBOOK_TILES = [
  { key: 'สวัสดิการ',        icon: '🎁', desc: 'ประกันสังคม เบี้ยขยัน ชุดยูนิฟอร์ม อาหารพนักงาน' },
  { key: 'การลา',            icon: '🌴', desc: 'ลาป่วย ลากิจ ลาพักร้อน ลาคลอด และวิธียื่นใบลา' },
  { key: 'เงินเดือนและ OT',  icon: '💰', desc: 'วันจ่ายเงิน วิธีคิด OT ค่าทำงานวันหยุด สลิปเงินเดือน' },
  { key: 'เวลาทำงาน',        icon: '⏰', desc: 'เวลาเข้า-ออก การตอกบัตร เวลาพัก วันหยุดประจำสัปดาห์' },
  { key: 'กฎระเบียบและวินัย', icon: '📋', desc: 'ข้อบังคับการทำงาน โทษทางวินัย การร้องทุกข์' },
  { key: 'ความปลอดภัยและสุขอนามัย', icon: '🧤', desc: 'ความปลอดภัยในครัว อุบัติเหตุจากการทำงาน' }
];

function flexHandbookMenu() {
  var bubbles = HANDBOOK_TILES.map(function (t) {
    return {
      type: 'bubble', size: 'micro',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF', spacing: 'sm',
        contents: [
          { type: 'text', text: t.icon, size: 'xl' },
          { type: 'text', text: t.key, weight: 'bold', size: 'sm', color: C.primary, wrap: true },
          { type: 'text', text: t.desc, size: 'xxs', color: C.sub, wrap: true, maxLines: 4 }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px', backgroundColor: '#FFFFFF',
        contents: [ fxBtn_('เปิดอ่าน',
          fxUri_('เปิดอ่าน', liffUrl(CFG.liff.handbook, 'cat=' + encodeURIComponent(t.key))),
          'primary', C.primary) ]
      }
    };
  });

  bubbles.unshift({
    type: 'bubble', size: 'micro',
    body: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FBF0DC', spacing: 'sm',
      contents: [
        { type: 'text', text: '📱', size: 'xl' },
        { type: 'text', text: 'คู่มือแอป myHR Cloud', weight: 'bold', size: 'sm', color: '#96631A', wrap: true },
        { type: 'text', text: 'ลงเวลา ลางาน แลกกะ ขอเอกสาร แก้ปัญหา', size: 'xxs', color: '#B98A45', wrap: true, maxLines: 4 }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '10px', backgroundColor: '#FBF0DC',
      contents: [ fxBtn_('เปิดคู่มือแอป', fxPost_('เปิดคู่มือแอป', 'action=appguide', 'คู่มือแอป myHR Cloud'), 'primary', '#96631A') ]
    }
  });

  /* ผังองค์กร — ใครดูแลเรื่องอะไร ใครเป็นหัวหน้าใคร */
  bubbles.splice(1, 0, {
    type: 'bubble', size: 'micro',
    body: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#F6EEE4', spacing: 'sm',
      contents: [
        { type: 'text', text: '🏢', size: 'xl' },
        { type: 'text', text: 'ผังองค์กร', weight: 'bold', size: 'sm', color: C.primary, wrap: true },
        { type: 'text', text: 'ใครเป็นหัวหน้าใคร เรื่องนี้ต้องคุยกับใคร ค้นชื่อได้', size: 'xxs', color: C.sub, wrap: true, maxLines: 4 }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '10px', backgroundColor: '#F6EEE4',
      contents: [ fxBtn_('เปิดผังองค์กร', fxPost_('เปิดผังองค์กร', 'action=org', 'ผังองค์กร'), 'primary', C.primary) ]
    }
  });

  /* รายการรายงาน */
  bubbles.splice(2, 0, {
    type: 'bubble', size: 'micro',
    body: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#ECF1F8', spacing: 'sm',
      contents: [
        { type: 'text', text: '📊', size: 'xl' },
        { type: 'text', text: 'รายการรายงาน', weight: 'bold', size: 'sm', color: '#2F5596', wrap: true },
        { type: 'text', text: 'กะ 7 วันข้างหน้า ชั่วโมงเดือนนี้ เรื่องที่ส่ง HR การลา', size: 'xxs', color: '#5B7099', wrap: true, maxLines: 4 }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '10px', backgroundColor: '#ECF1F8',
      contents: [ fxBtn_('เปิดรายงาน', fxPost_('เปิดรายงาน', 'action=reports', 'รายการรายงาน'), 'primary', '#2F5596') ]
    }
  });

  bubbles.push({
    type: 'bubble', size: 'micro',
    body: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: C.primary, spacing: 'sm',
      contents: [
        { type: 'text', text: '📖', size: 'xl' },
        { type: 'text', text: 'ดูคู่มือทั้งเล่ม', weight: 'bold', size: 'sm', color: '#FFFFFF', wrap: true },
        { type: 'text', text: 'ค้นหาได้ทุกหัวข้อ พร้อมดาวน์โหลด PDF', size: 'xxs', color: '#FFFFFFCC', wrap: true, maxLines: 4 }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '10px', backgroundColor: C.primary,
      contents: [ fxBtn_('เปิดคู่มือ', fxUri_('เปิดคู่มือ', liffUrl(CFG.liff.handbook)), 'secondary') ]
    }
  });

  return fx_('คู่มือและสวัสดิการ', { type: 'carousel', contents: bubbles.slice(0, 12) });
}

/* ================================================================
 * 4) กะวันนี้ / พรุ่งนี้
 * ================================================================ */
function flexTodayShift(emp, shifts) {
  var today = todayStr_(), tomorrow = addDaysStr_(1);
  var t  = shifts.filter(function (s) { return s.date === today; })[0];
  var tm = shifts.filter(function (s) { return s.date === tomorrow; })[0];

  function block(title, s, dateStr) {
    if (!s) {
      return { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
        { type: 'text', text: title + ' • ' + thaiDay_(dateStr) + ' ' + thaiDate_(dateStr), size: 'xxs', color: C.accent, weight: 'bold' },
        { type: 'text', text: '🌙  วันหยุด / ยังไม่มีกะ', size: 'sm', color: C.sub, weight: 'bold' }
      ]};
    }
    return { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
      { type: 'text', text: title + ' • ' + thaiDay_(dateStr) + ' ' + thaiDate_(dateStr), size: 'xxs', color: C.accent, weight: 'bold' },
      { type: 'box', layout: 'horizontal', spacing: 'md', contents: [
        { type: 'box', layout: 'vertical', width: '6px', backgroundColor: s.color || C.primary, cornerRadius: '3px', contents: [{ type: 'filler' }] },
        { type: 'box', layout: 'vertical', contents: [
          { type: 'text', text: s.shiftName, size: 'md', weight: 'bold', color: C.ink, wrap: true },
          { type: 'text', text: (s.start || '--') + ' – ' + (s.end || '--') + (s.branch ? ('  •  ' + s.branch) : ''), size: 'xs', color: C.sub, wrap: true },
          s.note ? { type: 'text', text: '📌 ' + s.note, size: 'xxs', color: C.danger, wrap: true, margin: 'xs' } : null
        ].filter(Boolean)}
      ]}
    ]};
  }

  return fx_('ตารางงานของคุณ', {
    type: 'bubble',
    header: fxHeader_('🗓️ ตารางงานของคุณ', (emp.nickname || emp.fullName) + ' • ' + emp.empCode),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [ block('วันนี้', t, today), fxDivider_(), block('พรุ่งนี้', tm, tomorrow) ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF', spacing: 'sm',
      contents: [
        fxBtn_('ดูตารางทั้งเดือน', fxUri_('ดูตารางทั้งเดือน', liffUrl(CFG.liff.schedule)), 'primary', C.primary),
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          { type: 'button', style: 'secondary', height: 'sm',
            action: fxUri_('ขอสลับกะ', liffUrl(CFG.liff.hr, 'cat=schedule')) },
          { type: 'button', style: 'secondary', height: 'sm',
            action: fxUri_('แจ้งลา', liffUrl(CFG.liff.hr, 'cat=leave')) }
        ]}
      ]
    }
  });
}

/* ================================================================
 * 5) เมนูติดต่อ HR
 * ================================================================ */
/**
 * การ์ด "ติดต่อ HR"
 * @param {object} [emp] พนักงานที่กดเข้ามา — ถ้าเป็นหัวหน้า/HR/แอดมิน
 *        จะมีปุ่มเข้าแผงควบคุมเพิ่มขึ้นมาที่ท้ายการ์ด
 *        ★ ไม่มีช่องว่างใน Rich Menu ให้เพิ่มปุ่มที่ 5 แล้ว การ์ดนี้จึงเป็นทางเข้าหลัก
 *        ถ้าไม่ส่ง emp มา ปุ่มจะไม่ขึ้น (ปลอดภัยโดยค่าเริ่มต้น)
 */
/** คืน [ปุ่ม] ถ้าคนนี้มีสิทธิ์เข้าแผงควบคุม ไม่งั้นคืน [] เพื่อให้ .concat() ไม่เพิ่มอะไร
    ห่อไว้เพราะ 12_AdminApi.gs อาจยังไม่ถูกติดตั้ง การ์ดนี้ต้องไม่พังตามไปด้วย */
function adminEntry_(emp) {
  if (!emp || typeof adminEntryButton_ !== 'function') return [];
  try { var b = adminEntryButton_(emp); return b ? [b] : []; } catch (e) { return []; }
}

function flexHrMenu(emp) {
  return fx_('ติดต่อ HR', {
    type: 'bubble',
    header: fxHeader_('💬 ติดต่อ HR', 'เลือกเรื่องที่ต้องการ — เราตอบทุกเรื่องภายใน 1–3 วันทำการ'),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: '#FFFFFF', spacing: 'none',
      contents: [
        { type: 'text', text: 'ตอบเองได้ทันที', size: 'xxs', color: C.accent, weight: 'bold' },
        { type: 'text', margin: 'sm', size: 'xs', color: C.sub, wrap: true,
          text: 'พิมพ์คำถามเข้ามาในแชทได้เลย เช่น "OT คิดยังไง" "เปลี่ยนโรงพยาบาลประกันสังคม" ระบบมีคำตอบพร้อมกว่า 60 คำถาม' },
        { type: 'box', layout: 'horizontal', margin: 'md', spacing: 'sm', contents: [
          { type: 'button', style: 'secondary', height: 'sm', action: fxPost_('❓ คำถามยอดฮิต', 'action=faq_top', 'คำถามยอดฮิต') }
        ]},
        fxDivider_(),
        { type: 'text', margin: 'lg', text: 'ส่งเรื่องถึง HR', size: 'xxs', color: C.accent, weight: 'bold' },
        { type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs', contents: [
          fxBtn_('💡 ขอคำปรึกษา / สอบถาม', fxUri_('ขอคำปรึกษา', liffUrl(CFG.liff.hr, 'cat=consult')), 'primary', C.primary),
          fxBtn_('📄 ขอเอกสาร / ใบรับรอง',  fxUri_('ขอเอกสาร',   liffUrl(CFG.liff.hr, 'cat=document')), 'secondary'),
          fxBtn_('⚠️ รายงานปัญหาในที่ทำงาน', fxUri_('รายงานปัญหา', liffUrl(CFG.liff.hr, 'cat=problem')), 'secondary')
        ]},
        fxDivider_(),
        { type: 'box', layout: 'vertical', margin: 'lg', paddingAll: '12px', cornerRadius: '8px',
          backgroundColor: '#FDF6E9', spacing: 'xs', contents: [
          { type: 'text', text: '🔒 ร้องเรียนแบบเป็นความลับ', size: 'sm', weight: 'bold', color: '#96631A', wrap: true },
          { type: 'text', size: 'xxs', color: '#96631A', wrap: true,
            text: 'เรื่องคุกคาม กลั่นแกล้ง หรือทุจริต ส่งตรงถึงฝ่ายบริหาร ไม่ผ่านหัวหน้าสาขา และเลือก “ไม่ระบุตัวตน” ได้' },
          { type: 'button', style: 'primary', height: 'sm', color: '#96631A', margin: 'sm',
            action: fxUri_('ส่งเรื่องร้องเรียน', liffUrl(CFG.liff.hr, 'cat=complaint')) }
        ]}
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF', spacing: 'sm',
      contents: [
        { type: 'button', style: 'link', height: 'sm', action: fxPost_('📬 ติดตามเรื่องที่ส่งไปแล้ว', 'action=my_tickets', 'ติดตามเรื่องของฉัน') },
        { type: 'text', size: 'xxs', color: C.sub, align: 'center', wrap: true,
          text: 'เรื่องด่วนที่เป็นอันตราย โทรหัวหน้าโดยตรง หรือสายด่วนกระทรวงแรงงาน 1506' }
      ].concat(adminEntry_(emp))
    }
  });
}

/* ================================================================
 * 6) คำตอบ FAQ
 * ================================================================ */
function flexFaqAnswer(faq) {
  var footer = [];
  if (faq.linkUrl) footer.push(fxBtn_(faq.linkLabel || 'อ่านเพิ่มเติม', fxUri_(faq.linkLabel || 'อ่านเพิ่มเติม', faq.linkUrl), 'primary', C.primary));
  footer.push({ type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm', contents: [
    { type: 'button', style: 'link', height: 'sm', action: fxPost_('👍 ตรงคำถาม', 'action=faq_rate&id=' + faq.id + '&v=1') },
    { type: 'button', style: 'link', height: 'sm', action: fxPost_('🙋 คุยกับ HR', 'action=to_hr&faq=' + faq.id, 'ขอคุยกับ HR') }
  ]});

  return fx_(faq.question, {
    type: 'bubble',
    header: fxHeader_(faq.question, faq.category || 'คำถามที่พบบ่อย'),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [{ type: 'text', text: String(faq.answer || '').slice(0, 1800), size: 'sm', color: C.ink, wrap: true }]
    },
    footer: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF', contents: footer }
  });
}

function flexFaqSuggest(list, query) {
  var items = list.slice(0, 4).map(function (f) {
    return { type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
             action: fxPost_(String(f.question).slice(0, 38), 'action=faq&id=' + f.id, f.question) };
  });
  return fx_('ผลการค้นหา', {
    type: 'bubble',
    header: fxHeader_('🔎 น่าจะหมายถึงข้อนี้หรือเปล่า', 'ค้นจาก: ' + String(query).slice(0, 40)),
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: '#FFFFFF', contents: items },
    footer: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [{ type: 'button', style: 'link', height: 'sm',
        action: fxPost_('ไม่ใช่ทั้งหมด — ส่งถึง HR', 'action=to_hr&q=' + encodeURIComponent(String(query).slice(0, 60))) }] }
  });
}

function flexFaqNotFound(query) {
  return fx_('ไม่พบคำตอบ', {
    type: 'bubble',
    header: fxHeader_('ยังไม่มีคำตอบเรื่องนี้', 'แต่ HR ตอบให้ได้แน่นอน', C.sub),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [
        { type: 'text', size: 'sm', color: C.ink, wrap: true,
          text: 'ระบบยังไม่มีคำตอบสำหรับ “' + String(query).slice(0, 60) + '”' },
        { type: 'text', margin: 'md', size: 'xs', color: C.sub, wrap: true,
          text: 'ลองพิมพ์สั้นๆ เป็นคำสำคัญ เช่น “ลาป่วย” “OT” “ประกันสังคม” “ลาออก” หรือส่งเรื่องให้ HR ตอบโดยตรง' }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF', spacing: 'sm',
      contents: [
        fxBtn_('ส่งคำถามนี้ให้ HR', fxUri_('ส่งคำถามให้ HR', liffUrl(CFG.liff.hr, 'cat=consult&q=' + encodeURIComponent(String(query).slice(0, 80)))), 'primary', C.primary),
        { type: 'button', style: 'link', height: 'sm', action: fxPost_('ดูคำถามยอดฮิต', 'action=faq_top') }
      ]
    }
  });
}

/* ================================================================
 * 7) การ์ดประกาศ (ใช้ broadcast)
 * ================================================================ */
function flexAnnouncement(a) {
  var body = {
    type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
    contents: [
      { type: 'box', layout: 'baseline', contents: [
        { type: 'text', text: String(a.category || 'ประกาศ'), size: 'xxs', color: C.accent, weight: 'bold', flex: 0 },
        { type: 'text', text: '  •  ' + thaiDate_(a.date), size: 'xxs', color: C.sub }
      ]},
      { type: 'text', text: String(a.title || ''), size: 'md', weight: 'bold', color: C.ink, wrap: true, margin: 'sm' },
      { type: 'text', text: String(a.summary || a.body || '').slice(0, 300), size: 'sm', color: C.sub, wrap: true, margin: 'md', maxLines: 6 }
    ]
  };

  var bubble = {
    type: 'bubble',
    body: body,
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [ fxBtn_('อ่านฉบับเต็ม',
        fxUri_('อ่านฉบับเต็ม', a.linkUrl || liffUrl(CFG.liff.news, 'id=' + encodeURIComponent(a.id))),
        'primary', C.primary) ]
    }
  };
  if (a.imageUrl && String(a.imageUrl).indexOf('https://') === 0) {
    bubble.hero = { type: 'image', url: a.imageUrl, size: 'full', aspectRatio: '20:13', aspectMode: 'cover',
                    action: fxUri_('เปิด', a.linkUrl || liffUrl(CFG.liff.news, 'id=' + encodeURIComponent(a.id))) };
  } else {
    bubble.header = fxHeader_('📢 ประกาศจาก HR', CFG.ORG);
  }
  return fx_('📢 ' + String(a.title || 'ประกาศใหม่'), bubble);
}

/* ================================================================
 * 8) ยืนยันรับเรื่อง / อัปเดตสถานะ
 * ================================================================ */
function flexTicketCreated(t) {
  return fx_('รับเรื่องแล้ว ' + t.ticketId, {
    type: 'bubble',
    header: fxHeader_('✅ HR รับเรื่องแล้ว', 'เราจะติดต่อกลับโดยเร็วที่สุด', C.ok),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [
        fxRow_('รหัสเรื่อง', t.ticketId, C.primary),
        fxRow_('ประเภท', t.category),
        fxRow_('กำหนดตอบกลับ', 'ภายใน ' + t.sla + ' วันทำการ'),
        fxDivider_(),
        { type: 'text', margin: 'lg', size: 'xxs', color: C.sub, wrap: true,
          text: 'เก็บรหัสเรื่องไว้เพื่อติดตามผล  •  หากเป็นเรื่องด่วนที่กระทบความปลอดภัย กรุณาโทรแจ้งหัวหน้าโดยตรง' }
      ]
    },
    footer: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [{ type: 'button', style: 'link', height: 'sm',
        action: fxPost_('ติดตามเรื่องของฉัน', 'action=my_tickets', 'ติดตามเรื่องของฉัน') }] }
  });
}

function flexTicketUpdate(t) {
  return fx_('HR ตอบกลับเรื่อง ' + t.ticketId, {
    type: 'bubble',
    header: fxHeader_('📬 HR ตอบกลับแล้ว', 'เรื่อง ' + t.ticketId + ' • ' + t.status),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [
        { type: 'text', text: String(t.subject || ''), weight: 'bold', size: 'sm', color: C.ink, wrap: true },
        fxDivider_(),
        { type: 'text', margin: 'lg', text: String(t.reply || '-'), size: 'sm', color: C.ink, wrap: true }
      ]
    },
    footer: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [{ type: 'button', style: 'secondary', height: 'sm',
        action: fxUri_('สอบถามเพิ่มเติม', liffUrl(CFG.liff.hr, 'cat=consult&ref=' + t.ticketId)) }] }
  });
}

function flexMyTickets(list) {
  if (!list.length) {
    return { type: 'text', text: 'คุณยังไม่เคยส่งเรื่องถึง HR ค่ะ 📭\nกดเมนู “ติดต่อ HR” เพื่อเริ่มส่งเรื่องได้เลย' };
  }
  var rows = list.slice(0, 8).map(function (t) {
    /* ใช้คำศัพท์สถานะชุดกลาง ไม่ดมข้อความดิบ — 'ยังไม่ตอบ' มีคำว่า 'ตอบ' อยู่ในตัวเอง
       การเทียบด้วย indexOf จึงพลาดได้เงียบ ๆ เมื่อมีคำใหม่เพิ่มเข้ามาภายหลัง */
    var st    = (typeof normalizeTicketStatus === 'function') ? normalizeTicketStatus(t.status) : String(t.status || '');
    var color = st === TICKET_STATUS.CLOSED ? C.ok
              : st === TICKET_STATUS.NEW    ? C.accent : C.primary;
    return { type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs', contents: [
      { type: 'box', layout: 'baseline', contents: [
        { type: 'text', text: t.ticketId, size: 'xxs', color: C.sub, flex: 0 },
        { type: 'text', text: '  •  ' + t.status, size: 'xxs', color: color, weight: 'bold' }
      ]},
      { type: 'text', text: String(t.subject || t.category), size: 'sm', color: C.ink, wrap: true, weight: 'bold' },
      { type: 'text', text: String(t.createdAt).slice(0, 10) + (t.reply ? '  •  มีคำตอบแล้ว' : '  •  รอดำเนินการ'), size: 'xxs', color: C.sub }
    ]};
  });
  return fx_('เรื่องที่ส่งถึง HR', {
    type: 'bubble',
    header: fxHeader_('📬 เรื่องที่คุณส่งถึง HR', 'แสดง ' + Math.min(list.length, 8) + ' รายการล่าสุด'),
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: '#FFFFFF', contents: rows }
  });
}

/* ================================================================
 * 9) แจ้งเตือนทีม HR (ในกลุ่ม LINE ของ HR)
 * ================================================================ */
function flexHrAlert(t) {
  var anon = t.privacy === PRIVACY.ANONYMOUS;
  return fx_('🔔 เรื่องใหม่ ' + t.ticketId, {
    type: 'bubble',
    header: fxHeader_('🔔 มีเรื่องใหม่เข้ามา', t.ticketId + ' • ' + t.category,
                      t.categoryId === 'complaint' ? C.danger : C.primary),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [
        fxRow_('ผู้แจ้ง', anon ? '🔒 ไม่ระบุตัวตน' : ((t.name || '-') + ' (' + (t.empCode || '-') + ')')),
        fxRow_('สาขา', anon ? '-' : (t.branch || '-')),
        fxRow_('ครบกำหนด', t.slaDue, C.danger),
        fxDivider_(),
        { type: 'text', margin: 'lg', text: String(t.subject || ''), weight: 'bold', size: 'sm', color: C.ink, wrap: true },
        { type: 'text', margin: 'sm', text: String(t.detail || '').slice(0, 400), size: 'xs', color: C.sub, wrap: true }
      ]
    },
    footer: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [ fxBtn_('เปิดใน Google Sheets',
        fxUri_('เปิดใน Sheets', 'https://docs.google.com/spreadsheets/d/' + CFG.ssId + '/edit'), 'primary', C.primary) ] }
  });
}

/* ================================================================
 * 10) กันคนนอก
 * ================================================================ */
function flexBlocked(reason) {
  var map = {
    RESIGNED:  { t: 'บัญชีนี้ถูกปิดการใช้งาน',  d: 'เนื่องจากคุณพ้นสภาพการเป็นพนักงานแล้ว หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อ HR โดยตรง' },
    SUSPENDED: { t: 'บัญชีถูกระงับชั่วคราว',    d: 'กรุณาติดต่อ HR เพื่อสอบถามรายละเอียด' },
    PENDING:   { t: 'รอ HR อนุมัติ',            d: 'เราได้รับคำขอยืนยันตัวตนของคุณแล้ว กรุณารอ HR ตรวจสอบภายใน 1 วันทำการ' }
  };
  var m = map[reason] || map.PENDING;
  return fx_(m.t, {
    type: 'bubble',
    header: fxHeader_(m.t, CFG.ORG + ' • HR Hub', C.sub),
    body: { type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [{ type: 'text', text: m.d, size: 'sm', color: C.ink, wrap: true }] }
  });
}

/* ================================================================
 * 11) คู่มือแอป myHR Cloud
 * ================================================================ */
var APPGUIDE_TILES = [
  { g: 'เริ่มต้นใช้งาน', icon: '🔑', desc: 'เข้าระบบครั้งแรก ตั้งรหัสผ่าน ดาวน์โหลดแอป' },
  { g: 'ลงเวลาเข้า-ออกงาน', icon: '📍', desc: 'วิธีแสกน จุดที่ต้องยืน และการตรวจสอบเวลา' },
  { g: 'ขอลางาน', icon: '🌴', desc: '5 ขั้นตอน ตั้งแต่เลือกประเภทลาถึงแนบเอกสาร' },
  { g: 'ขอแลก/เปลี่ยนกะ', icon: '🔄', desc: '5 ขั้นตอนขอเปลี่ยนกะและเช็กผลอนุมัติ' },
  { g: 'ขอเอกสารสำคัญ', icon: '📄', desc: 'สลิปเงินเดือน หนังสือรับรอง 4 ขั้นตอน' },
  { g: 'แก้ปัญหาที่พบบ่อย', icon: '🛠️', desc: 'แสกนไม่ได้ เวลาผิดวัน ลืมรหัสผ่าน' }
];

function flexAppGuideMenu() {
  var bubbles = APPGUIDE_TILES.map(function (t) {
    return {
      type: 'bubble', size: 'micro',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF', spacing: 'sm',
        contents: [
          { type: 'text', text: t.icon, size: 'xl' },
          { type: 'text', text: t.g, weight: 'bold', size: 'sm', color: C.primary, wrap: true },
          { type: 'text', text: t.desc, size: 'xxs', color: C.sub, wrap: true, maxLines: 4 }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px', backgroundColor: '#FFFFFF',
        contents: [ fxBtn_('ดูวิธีทำ',
          fxUri_('ดูวิธีทำ', liffUrl(CFG.liff.appguide, 'g=' + encodeURIComponent(t.g))),
          'primary', C.primary) ]
      }
    };
  });
  return fx_('คู่มือแอป myHR Cloud', { type: 'carousel', contents: bubbles });
}

/* ================================================================
 * 12) ตั้งค่าปฏิทินกะงาน (แทนการส่งข้อความเตือนกะ)
 * ================================================================ */
function flexCalendarHelp(emp) {
  return fx_('เพิ่มตารางกะลงปฏิทินมือถือ', {
    type: 'bubble',
    header: fxHeader_('📅 ให้มือถือเตือนกะให้เอง', 'ตั้งครั้งเดียว ใช้ได้ตลอด'),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF',
      contents: [
        { type: 'text', size: 'sm', color: C.ink, wrap: true,
          text: 'เพิ่มตารางกะของคุณเข้าปฏิทินในมือถือ แล้วโทรศัพท์จะเตือนให้เองล่วงหน้า 12 ชั่วโมงและ 1 ชั่วโมงก่อนเข้ากะ' },
        { type: 'text', margin: 'md', size: 'xs', color: C.sub, wrap: true,
          text: 'เมื่อ HR แก้ตารางกะ ปฏิทินของคุณจะอัปเดตตามเองภายในไม่กี่ชั่วโมง ไม่ต้องตั้งใหม่' }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [ fxBtn_('ตั้งค่าปฏิทิน',
        fxUri_('ตั้งค่าปฏิทิน', liffUrl(CFG.liff.schedule, 'tab=cal')), 'primary', C.primary) ]
    }
  });
}

/* ================================================================
 * 13) Quick Reply มาตรฐาน
 * ================================================================ */
function quickReplies_() {
  return { items: [
    { type: 'action', action: fxPost_('🗓️ กะวันนี้', 'action=today_shift', 'กะวันนี้ของฉัน') },
    { type: 'action', action: fxPost_('❓ คำถามยอดฮิต', 'action=faq_top', 'คำถามยอดฮิต') },
    { type: 'action', action: fxPost_('💬 ติดต่อ HR', 'action=hr_menu', 'ติดต่อ HR') },
    { type: 'action', action: fxPost_('📱 คู่มือแอป', 'action=appguide', 'คู่มือแอป myHR Cloud') },
    { type: 'action', action: fxUri_('📢 ประกาศ', liffUrl(CFG.liff.news)) }
  ]};
}

function withQuickReply(msg) {
  if (!msg) return msg;
  msg.quickReply = quickReplies_();
  return msg;
}

/* ---------- ผังองค์กร ---------- */
function flexOrgLink(emp) {
  var d = deptSummary();
  var top = d.slice(0, 5).map(function (x) {
    return { type: 'box', layout: 'horizontal', contents: [
      { type: 'text', text: x.dept, size: 'xs', color: C.sub, flex: 3, wrap: true },
      { type: 'text', text: x.count + ' คน', size: 'xs', color: C.ink, flex: 1, align: 'end', weight: 'bold' }
    ]};
  });
  return fx_('ผังองค์กร ' + CFG.ORG, {
    type: 'bubble',
    header: fxHeader_('ผังองค์กร', CFG.ORG),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF', spacing: 'sm',
      contents: [
        { type: 'text', size: 'sm', color: C.ink, wrap: true,
          text: 'ดูได้ว่าใครเป็นหัวหน้าใคร และเรื่องแต่ละอย่างต้องคุยกับใคร' },
        fxDivider_(),
        { type: 'text', text: 'แผนกที่มีคนมากที่สุด', size: 'xs', color: C.accent, weight: 'bold', margin: 'md' }
      ].concat(top).concat([
        { type: 'text', margin: 'md', size: 'xxs', color: C.sub, wrap: true,
          text: 'ในหน้าผังองค์กรพิมพ์ชื่อเพื่อนร่วมงานเพื่อค้นหาได้ทันที' }
      ])
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [ fxBtn_('เปิดผังองค์กร', fxUri_('เปิดผังองค์กร', liffUrl(CFG.liff.org)), 'primary', C.primary) ]
    }
  });
}

/* ---------- รายการรายงาน ---------- */
function flexReportsLink(emp) {
  var items = getReports(String(emp.role || ROLES.STAFF).trim());
  var lines = items.slice(0, 6).map(function (r) {
    return { type: 'text', text: '• ' + r.title, size: 'xs', color: C.sub, wrap: true };
  });
  return fx_('รายการรายงาน', {
    type: 'bubble',
    header: fxHeader_('รายการรายงาน', 'เปิดดูได้ทุกเมื่อ ข้อมูลคำนวณสด'),
    body: {
      type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#FFFFFF', spacing: 'sm',
      contents: [
        { type: 'text', size: 'sm', color: C.ink, wrap: true,
          text: 'คุณเปิดดูได้ ' + items.length + ' รายงาน' }
      ].concat(lines).concat([
        { type: 'text', margin: 'md', size: 'xxs', color: C.sub, wrap: true,
          text: 'รายงานส่วนตัวแสดงเฉพาะข้อมูลของคุณเท่านั้น เพื่อนร่วมงานไม่เห็น' }
      ])
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [ fxBtn_('เปิดรายการรายงาน', fxUri_('เปิดรายการรายงาน', liffUrl(CFG.liff.reports)), 'primary', '#2F5596') ]
    }
  });
}

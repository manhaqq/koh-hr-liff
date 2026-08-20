/*******************************************************************
 * โก๋ในซอย HR Hub — 04_Faq.gs
 * เครื่องมือจับคู่คำถามภาษาไทย (ไม่ต้องพึ่ง AI ภายนอก)
 *******************************************************************/

/** ตัดช่องว่าง วรรณยุกต์ซ้ำ และแปลงคำที่พนักงานมักพิมพ์ผิด */
var SYNONYMS = [
  [/โอที|โอ\.ที\.|over\s*time|o\.?t\.?/gi, 'ot'],
  [/ปกส|ปกส\.|ประกันสัมคม|ประกันสังคม|sso/gi, 'ประกันสังคม'],
  [/เงินเดือนออก|เงินออก|วันเงินเดือน/gi, 'วันจ่ายเงินเดือน'],
  [/ลาป่วน|ลาป่วย/gi, 'ลาป่วย'],
  [/พักร้อน|ลาพักร้อน|วันหยุดพักผ่อน/gi, 'ลาพักร้อน'],
  [/ลาคลอดบุตร|ลาคลอด/gi, 'ลาคลอด'],
  [/ค่าชดเชย|เงินชดเชย/gi, 'ค่าชดเชย'],
  [/สลิป|สลิปเงินเดือน|payslip/gi, 'สลิปเงินเดือน'],
  [/ตอกบัตร|สแกนนิ้ว|ลงเวลา/gi, 'ลงเวลา'],
  [/ยูนิฟอร์ม|ชุดพนักงาน|เครื่องแบบ/gi, 'ยูนิฟอร์ม'],
  [/รพ\.|โรงพยาบาล/gi, 'โรงพยาบาล']
];

function normalize_(s) {
  var t = String(s || '').toLowerCase().trim();
  SYNONYMS.forEach(function (p) { t = t.replace(p[0], p[1]); });
  return t.replace(/[\s\.\,\?\!\-\_\(\)"'“”‘’]/g, '');
}

/**
 * ให้คะแนนความเข้ากันของคำถาม
 * 100 = คีย์เวิร์ดตรงเป๊ะ, 60-90 = คีย์เวิร์ดอยู่ในประโยค, <40 = เดา
 */
function scoreFaq_(faq, q) {
  var nq = normalize_(q);
  if (!nq) return 0;
  var best = 0;

  var kws = String(faq.keywords || '').split(/[,|]/)
              .map(function (k) { return normalize_(k); })
              .filter(Boolean);
  kws.push(normalize_(faq.question));

  kws.forEach(function (k) {
    if (!k) return;
    if (nq === k) { best = Math.max(best, 100); return; }
    if (nq.indexOf(k) >= 0) { best = Math.max(best, 70 + Math.min(20, k.length)); return; }
    if (k.indexOf(nq) >= 0 && nq.length >= 3) { best = Math.max(best, 60 + Math.min(20, nq.length)); return; }
    // นับตัวอักษรที่ซ้อนกัน (bigram overlap) สำหรับพิมพ์ผิดเล็กน้อย
    var hit = 0;
    for (var i = 0; i < k.length - 1; i++) if (nq.indexOf(k.substr(i, 2)) >= 0) hit++;
    if (k.length > 3) best = Math.max(best, Math.round((hit / (k.length - 1)) * 55));
  });
  return best;
}

/** คืนค่า { best, suggestions } */
function searchFaq(query) {
  var faqs = getFaqs();
  var scored = faqs.map(function (f) { return { faq: f, score: scoreFaq_(f, query) }; })
                   .filter(function (x) { return x.score > 0; })
                   .sort(function (a, b) { return b.score - a.score; });
  return {
    best: (scored[0] && scored[0].score >= 70) ? scored[0].faq : null,
    suggestions: scored.filter(function (x) { return x.score >= 35; }).slice(0, 4)
                       .map(function (x) { return x.faq; })
  };
}

function getFaqById(id) {
  var f = getFaqs().filter(function (x) { return String(x.id).trim() === String(id).trim(); });
  return f[0] || null;
}

/** คำถามยอดฮิต — อ่านจากคอลัมน์ top = TRUE ถ้าไม่มีก็เอา 6 อันแรก */
function topFaqs() {
  var all = getFaqs();
  var top = all.filter(function (f) { return String(f.top).toUpperCase() === 'TRUE'; });
  return (top.length ? top : all).slice(0, 6);
}

function flexTopFaq() {
  var items = topFaqs().map(function (f) {
    return { type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
             action: fxPost_(String(f.question).slice(0, 38), 'action=faq&id=' + f.id, f.question) };
  });
  return fx_('คำถามยอดฮิต', {
    type: 'bubble',
    header: fxHeader_('❓ คำถามที่พนักงานถามบ่อย', 'กดเลือก หรือพิมพ์คำถามของคุณเข้ามาได้เลย'),
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: '#FFFFFF', contents: items },
    footer: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: '#FFFFFF',
      contents: [ fxBtn_('เปิดคู่มือทั้งเล่ม', fxUri_('เปิดคู่มือ', liffUrl(CFG.liff.handbook)), 'primary', C.primary) ] }
  });
}

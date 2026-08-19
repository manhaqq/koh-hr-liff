/* =================================================================
 *  โก๋ในซอย HR Hub — ไฟล์ตั้งค่าเดียวของทุกหน้า
 *  ⚠️ แก้ไฟล์นี้ไฟล์เดียว แล้วทุกหน้าจะใช้ค่าใหม่ทันที
 * ================================================================= */
window.KOH_CONFIG = {

  /* 1) URL ของ Google Apps Script Web App (ลงท้ายด้วย /exec) */
  API_URL: 'https://script.google.com/macros/s/AKfycbzoHFZWMm8csJ8mCGIBuXt417xwp9txBn_ZnbRPVsWOEIQsM99LcpH5-uGWXixx4tBx/exec',

  /* 2) LIFF ID ของแต่ละหน้า (ได้จาก LINE Developers Console) */
  LIFF: {
    verify:   '2011171874-3zkGj0Pg',
    news:     '2011171874-5q1ImBTC',
    handbook: '2011171874-6migHZoC',
    schedule: '2011171874-SQRIXmNt',
    hr:       '2011171874-Be6osOG8',
    appguide: '2011171874-hjC9Rjy3',
    org:      '2011171874-NtBrLnfS',
    reports:  '2011171874-pjnsG056'
  },

  /* 3) ข้อมูลร้าน */
  ORG:        'ร้านโก๋ในซอย',
  ORG_SHORT:  'โก๋ในซอย',
  TAGLINE:    'HR Communication Hub',

  /* 4) สีแบรนด์ — เปลี่ยนที่นี่ได้เลย */
  THEME: {
    primary: '#0F5132',
    accent:  '#C8A24A',
    ink:     '#1B2A24',
    sub:     '#6B7C74',
    bg:      '#F5F3EC',
    danger:  '#B3261E',
    ok:      '#146C43'
  }
};

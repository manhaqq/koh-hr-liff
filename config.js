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
    reports:  '2011171874-pjnsG056',
    /* แผงควบคุม HR (admin.html) — เฉพาะหัวหน้าแผนก/HR/admin
       ★ ค่านี้ต้องตรงกับ Script Property ชื่อ LIFF_ID_ADMIN เสมอ
         หน้าเว็บอ่านจากที่นี่ ส่วนหลังบ้านอ่านจาก Script Property ไปสร้างปุ่มในการ์ด Flex
         ถ้าใส่ไม่ครบทั้งสองที่ หน้าจะเปิดได้แต่ปุ่มทางเข้าจะไม่โผล่ (หรือกลับกัน)
       LIFF นี้อยู่ในช่อง LINE Login ไม่ใช่ Messaging API
         Endpoint URL : https://manhaqq.github.io/koh-hr-liff/admin.html
         Size         : Full   ·   Scopes : profile, openid */
    admin:    '2011171874-ELnISEhz'
  },

  /* 3) ข้อมูลร้าน */
  ORG:        'ร้านโก๋ในซอย',
  ORG_SHORT:  'โก๋ในซอย',
  TAGLINE:    'HR Communication Hub',

  /* 4) สีแบรนด์ของหน้าเว็บ — app.js อ่านค่านี้ไปทับตัวแปรใน app.css ตอนโหลด
     (ค่าใน app.css :root ต้องตรงกัน ไม่งั้นหน้าจะกะพริบตอนเปิด)
     ฝั่งการ์ด Flex ในแชทและอีเมลใช้คนละชุด อยู่ที่ apps-script/00_Config.js */
  THEME: {
    primary: '#6B4A2B',
    accent:  '#DBA66B',   // สีแทน — ใช้เป็นพื้นเท่านั้น
    accentInk: '#9A6B2E', // ตัวอักษรสีแทนบนพื้นสว่าง
    ink:     '#312215',
    sub:     '#866B4E',
    bg:      '#F9F1E8',
    danger:  '#B3261E',
    ok:      '#146C43'
  }
};

/* =================================================================
 *  โก๋ในซอย HR Hub — ไลบรารีกลาง (ใช้ร่วมกันทุกหน้า)
 * ================================================================= */
const CFGX = window.KOH_CONFIG;

/* ---------- Helper DOM ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const qs = k => new URLSearchParams(location.search).get(k) || '';

/* ---------- วันที่แบบไทย ---------- */
const TH_M  = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_MF = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_D  = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const TH_DS = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function thDate(s, full) {
  const p = String(s || '').slice(0, 10).split('-');
  if (p.length !== 3) return String(s || '');
  const be = +p[0] + 543;
  return `${+p[2]} ${full ? TH_MF[+p[1] - 1] : TH_M[+p[1] - 1]} ${full ? be : be - 2500}`;
}
function thDay(s)  { const d = new Date(String(s).slice(0, 10) + 'T00:00:00+07:00'); return isNaN(d) ? '' : TH_D[d.getDay()]; }
function todayISO(){ return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); }

/* ---------- Toast ---------- */
let _toastT;
function toast(msg, ms = 2600) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------- สถานะหน้าจอ ---------- */
function showLoading(target, text = 'กำลังโหลด...') {
  const el = typeof target === 'string' ? $(target) : target;
  if (el) el.innerHTML = `<div class="loading"><div class="spinner"></div><div>${esc(text)}</div></div>`;
}
function showEmpty(target, ico, text, sub) {
  const el = typeof target === 'string' ? $(target) : target;
  if (el) el.innerHTML = `<div class="empty"><div class="ico">${ico}</div>
    <div class="strong">${esc(text)}</div>${sub ? `<div class="tiny" style="margin-top:6px">${esc(sub)}</div>` : ''}</div>`;
}
function showError(target, msg, retry) {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el) return;
  el.innerHTML = `<div class="alert err">${esc(msg)}</div>
    ${retry ? '<button class="btn ghost" onclick="location.reload()">ลองใหม่อีกครั้ง</button>' : ''}`;
}

/* =================================================================
 *  LIFF + API
 * ================================================================= */
let ME = null;          // ข้อมูลพนักงานที่ล็อกอินอยู่
let ID_TOKEN = null;

/**
 * เริ่มต้น LIFF
 * @param {string} which  คีย์ใน CFGX.LIFF เช่น 'news'
 * @param {boolean} needProfile  ต้องดึงข้อมูลพนักงานด้วยหรือไม่
 */
async function initLiff(which, needProfile = true) {
  const liffId = CFGX.LIFF[which];
  if (!liffId || liffId.startsWith('PASTE')) {
    throw new Error('ยังไม่ได้ตั้งค่า LIFF ID ของหน้านี้ในไฟล์ config.js');
  }
  await liff.init({ liffId });

  if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return null; }

  ID_TOKEN = liff.getIDToken();
  if (!ID_TOKEN) {
    throw new Error('ไม่สามารถอ่านข้อมูลยืนยันตัวตนได้ กรุณาปิดหน้านี้แล้วเปิดใหม่จากเมนูในไลน์');
  }

  if (needProfile) {
    const r = await api('me');
    if (!r.ok) {
      if (r.code === 'NOT_VERIFIED') { location.href = `https://liff.line.me/${CFGX.LIFF.verify}`; return null; }
      throw new Error(r.message || 'ไม่มีสิทธิ์เข้าถึงข้อมูล');
    }
    ME = r.me;
  }
  return ME;
}

/**
 * เรียก API ของ Apps Script
 * ⚠️ ใช้ Content-Type: text/plain เพื่อเลี่ยง CORS preflight ที่ Apps Script ไม่รองรับ
 */
async function api(name, payload = {}) {
  if (!CFGX.API_URL || CFGX.API_URL.startsWith('PASTE')) {
    return { ok: false, code: 'CONFIG', message: 'ยังไม่ได้ตั้งค่า API_URL ในไฟล์ config.js' };
  }
  try {
    const res = await fetch(CFGX.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ api: name, idToken: ID_TOKEN, ...payload })
    });
    return await res.json();
  } catch (e) {
    console.error(e);
    return { ok: false, code: 'NETWORK', message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ต' };
  }
}

/* ---------- แถบโปรไฟล์มาตรฐาน ---------- */
function renderMe(sel) {
  const el = $(sel);
  if (!el || !ME) return;
  const initial = (ME.nickname || ME.fullName || '?').trim().charAt(0);
  el.innerHTML = `<div class="me">
    <div class="av">${esc(initial)}</div>
    <div>
      <div class="nm">${esc(ME.nickname || ME.fullName)}</div>
      <div class="sub">${esc(ME.position || '')}${ME.branch ? ' • ' + esc(ME.branch) : ''} • ${esc(ME.empCode)}</div>
    </div>
  </div>`;
}

/* ---------- ปิดหน้าต่าง LIFF ---------- */
function closeLiff(delay = 900) {
  setTimeout(() => { if (liff.isInClient()) liff.closeWindow(); }, delay);
}

/* ---------- จัดการ error รวม ---------- */
function bootFail(err) {
  console.error(err);
  const box = $('#content') || document.body;
  box.innerHTML = `<div class="card"><div class="alert err">${esc(err.message || err)}</div>
    <button class="btn ghost" onclick="location.reload()">ลองใหม่อีกครั้ง</button></div>`;
}

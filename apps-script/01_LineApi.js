/*******************************************************************
 * โก๋ในซอย HR Hub — 01_LineApi.gs
 * ห่อหุ้มการเรียก LINE Messaging API ทั้งหมด
 *******************************************************************/

var LINE_API      = 'https://api.line.me/v2/bot';
var LINE_DATA_API = 'https://api-data.line.me/v2/bot';

function lineFetch_(url, method, payload, contentType) {
  var opt = {
    method: method || 'get',
    headers: { 'Authorization': 'Bearer ' + CFG.token },
    muteHttpExceptions: true
  };
  if (payload !== undefined && payload !== null) {
    if (contentType) {
      opt.contentType = contentType;
      opt.payload = payload;                    // blob / raw
    } else {
      opt.contentType = 'application/json';
      opt.payload = JSON.stringify(payload);
    }
  }
  var res  = UrlFetchApp.fetch(url, opt);
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 300) {
    console.error('LINE API ' + code + ' ' + method + ' ' + url + ' → ' + text);
    throw new Error('LINE API ' + code + ': ' + text);
  }
  try { return text ? JSON.parse(text) : {}; } catch (e) { return { raw: text }; }
}

/* ---------- ส่งข้อความ ---------- */

/** ตอบกลับ (ฟรี ไม่นับโควตา) — ใช้ให้มากที่สุด */
function reply(replyToken, messages) {
  if (!replyToken) return;
  var msgs = [].concat(messages).filter(Boolean).slice(0, 5);
  if (!msgs.length) return;
  return lineFetch_(LINE_API + '/message/reply', 'post', { replyToken: replyToken, messages: msgs });
}

/** ส่งหาคนเดียว (นับโควตา 1 ข้อความ) */
function push(to, messages) {
  if (!to) return;
  var msgs = [].concat(messages).filter(Boolean).slice(0, 5);
  if (!msgs.length) return;
  return lineFetch_(LINE_API + '/message/push', 'post', { to: to, messages: msgs });
}

/** ส่งหาหลายคน (สูงสุด 500 id/ครั้ง — นับตามจำนวนคน) */
function multicast(toArray, messages) {
  var ids  = (toArray || []).filter(Boolean);
  var msgs = [].concat(messages).filter(Boolean).slice(0, 5);
  if (!ids.length || !msgs.length) return { sent: 0 };
  var sent = 0;
  for (var i = 0; i < ids.length; i += 500) {
    var chunk = ids.slice(i, i + 500);
    lineFetch_(LINE_API + '/message/multicast', 'post', { to: chunk, messages: msgs });
    sent += chunk.length;
    Utilities.sleep(300);
  }
  return { sent: sent };
}

/** ส่งหาเพื่อนทุกคน (นับตามจำนวนเพื่อน) — ใช้เท่าที่จำเป็น */
function broadcast(messages) {
  var msgs = [].concat(messages).filter(Boolean).slice(0, 5);
  return lineFetch_(LINE_API + '/message/broadcast', 'post', { messages: msgs });
}

/* ---------- โปรไฟล์ ---------- */

function getProfile(userId) {
  try { return lineFetch_(LINE_API + '/profile/' + userId, 'get'); }
  catch (e) { return null; }
}

/* ---------- โควตาข้อความ ---------- */

function getQuota() {
  var q = lineFetch_(LINE_API + '/message/quota', 'get');
  var c = lineFetch_(LINE_API + '/message/quota/consumption', 'get');
  return { type: q.type, limit: q.value || 0, used: c.totalUsage || 0 };
}

/* ---------- Rich Menu ---------- */

function createRichMenu(obj)                 { return lineFetch_(LINE_API + '/richmenu', 'post', obj).richMenuId; }
function deleteRichMenu(id)                  { return lineFetch_(LINE_API + '/richmenu/' + id, 'delete'); }
function listRichMenus()                     { return lineFetch_(LINE_API + '/richmenu/list', 'get').richmenus || []; }
function uploadRichMenuImage(id, blob, mime) { return lineFetch_(LINE_DATA_API + '/richmenu/' + id + '/content', 'post', blob, mime || 'image/png'); }
function setDefaultRichMenu(id)              { return lineFetch_(LINE_API + '/user/all/richmenu/' + id, 'post'); }
function linkRichMenuToUser(userId, id)      { return lineFetch_(LINE_API + '/user/' + userId + '/richmenu/' + id, 'post'); }
function unlinkRichMenuFromUser(userId)      { return lineFetch_(LINE_API + '/user/' + userId + '/richmenu', 'delete'); }

/** ผูกเมนูให้หลายคนพร้อมกัน (≤500 คน/ครั้ง) */
function bulkLinkRichMenu(userIds, richMenuId) {
  var ids = (userIds || []).filter(Boolean);
  for (var i = 0; i < ids.length; i += 500) {
    lineFetch_(LINE_API + '/richmenu/bulk/link', 'post',
      { richMenuId: richMenuId, userIds: ids.slice(i, i + 500) });
    Utilities.sleep(300);
  }
  return ids.length;
}

function bulkUnlinkRichMenu(userIds) {
  var ids = (userIds || []).filter(Boolean);
  for (var i = 0; i < ids.length; i += 500) {
    lineFetch_(LINE_API + '/richmenu/bulk/unlink', 'post', { userIds: ids.slice(i, i + 500) });
    Utilities.sleep(300);
  }
  return ids.length;
}

/* ---------- ตรวจลายเซ็น Webhook (กัน request ปลอม) ---------- */

function verifySignature_(bodyString, signature) {
  if (!CFG.secret) return true;           // ยังไม่ตั้ง secret → ข้าม (ไม่แนะนำ)
  if (!signature) return false;
  var mac = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(bodyString).getBytes(),
    Utilities.newBlob(CFG.secret).getBytes()
  );
  return Utilities.base64Encode(mac) === signature;
}

/* ---------- ตรวจ ID Token จาก LIFF (หัวใจของความปลอดภัย) ---------- */
/**
 * รับ id_token จากหน้า LIFF แล้วให้ LINE ยืนยันว่าเป็นของจริง
 * คืนค่า { userId, name, picture } หรือ null ถ้าไม่ผ่าน
 * ⚠️ ห้ามเชื่อ userId ที่ส่งมาจากฝั่งเบราว์เซอร์ตรงๆ เด็ดขาด
 */
function verifyIdToken(idToken) {
  if (!idToken || !CFG.loginChannelId) return null;
  var res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: CFG.loginChannelId },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    console.warn('verifyIdToken failed: ' + res.getContentText());
    return null;
  }
  var d = JSON.parse(res.getContentText());
  if (!d.sub) return null;
  // ตรวจวันหมดอายุอีกชั้น (ID token อายุ 1 ชั่วโมง)
  if (d.exp && (d.exp * 1000) < Date.now()) return null;
  return { userId: d.sub, name: d.name || '', picture: d.picture || '' };
}

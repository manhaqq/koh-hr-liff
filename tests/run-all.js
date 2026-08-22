#!/usr/bin/env node
/*
 * รันเทสต์ทั้งหมดของโค้ดหลังบ้าน
 *
 *     node tests/run-all.js
 *
 * ★ ทำไมต้องมีเทสต์ชุดนี้
 *   Apps Script รันบนเซิร์ฟเวอร์ของ Google เท่านั้น จะรู้ว่าโค้ดพังก็ต่อเมื่อ
 *   ปล่อยขึ้นไปแล้วมีคนกดใช้ ซึ่งแปลว่า "คนที่เจอบั๊กคนแรกคือผู้ใช้จริง"
 *   เคยเสียเวลาไปสามรอบกับเมธอดที่ไม่มีอยู่จริง (Sheet.setIndex) และกับ
 *   ข้อจำกัดของสิทธิ์ drive.file ที่มองไม่เห็นไฟล์ซึ่งไม่ได้สร้างผ่าน Drive API
 *
 *   tests/mock.js จำลอง Apps Script โดยมี "เฉพาะเมธอดที่ยืนยันกับเอกสาร
 *   ทางการแล้ว" เท่านั้น การเรียกเมธอดที่ไม่มีจริงจึงพังตรงนี้ ไม่ใช่ตอนผู้ใช้กด
 *
 * ★ เพิ่มเมธอดเข้า mock ได้เมื่อยืนยันจากเอกสารของ Google แล้วเท่านั้น
 *   ห้ามเพิ่มเพื่อให้เทสต์ผ่าน — นั่นคือการลบตาข่ายนิรภัยทิ้ง
 */
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = ['backup.test.js', 'media.test.js'];
let failed = 0;

for (const s of SUITES) {
  process.stdout.write(`\n┌─ ${s}\n`);
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, s)], { encoding: 'utf8' });
    process.stdout.write(out.split('\n').map(l => '│ ' + l).join('\n'));
  } catch (e) {
    failed++;
    process.stdout.write((e.stdout || '').split('\n').map(l => '│ ' + l).join('\n'));
    process.stdout.write('\n│ ' + String(e.stderr || '').split('\n').slice(0, 6).join('\n│ '));
  }
}

console.log(failed ? `\n\n❌ เทสต์ไม่ผ่าน ${failed} ชุด — ห้ามปล่อยเวอร์ชัน` : '\n\n✅ เทสต์ผ่านทั้งหมด');
process.exit(failed ? 1 : 0);

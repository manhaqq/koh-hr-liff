#!/usr/bin/env python3
"""
สร้างคู่มือ PDF ทั้ง 3 เล่มจากไฟล์ HTML ใน manual/src/

    .venv-pdf/bin/python manual/build.py

ทำไมต้องใช้ venv แยก:
  WeasyPrint ต้องโหลดไลบรารีของ Homebrew (pango, gobject) ผ่านตัวแปร DYLD_*
  แต่ระบบความปลอดภัยของ macOS (SIP) จะลบตัวแปรเหล่านั้นทิ้งเมื่อรัน python
  ของระบบ จึงต้องใช้ python ที่ติดตั้งจาก Homebrew เท่านั้น

ติดตั้งครั้งแรก:
    brew install pango gdk-pixbuf libffi python@3.13
    /opt/homebrew/bin/python3.13 -m venv .venv-pdf
    .venv-pdf/bin/pip install weasyprint
"""
import os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, 'src')

BOOKS = [
    ('01-staff.html',     '01-คู่มือพนักงาน.pdf',        'สำหรับพนักงานทุกคน'),
    ('02-hr-manager.html','02-คู่มือ HR และผู้จัดการ.pdf','สำหรับฝ่ายบุคคล ผู้จัดการ และหัวหน้ากะ'),
    ('03-developer.html', '03-คู่มือผู้ดูแลระบบ.pdf',     'สำหรับผู้ดูแลระบบและผู้พัฒนา'),
]

def main():
    try:
        from weasyprint import HTML
    except Exception as e:
        sys.exit(f'โหลด WeasyPrint ไม่ได้: {e}\nต้องรันด้วย .venv-pdf/bin/python เท่านั้น')

    made = 0
    for src, out, who in BOOKS:
        p = os.path.join(SRC, src)
        if not os.path.exists(p):
            print(f'  ข้าม {src} — ยังไม่มีไฟล์')
            continue
        t = time.time()
        dest = os.path.join(HERE, out)
        # ไม่ตั้ง base_url เอง ปล่อยให้อ้างอิงจากตำแหน่งไฟล์ HTML
        # ถ้าตั้งเป็น HERE พาธ ../style.css จะชี้ออกนอกโฟลเดอร์ manual แล้วสไตล์จะหายทั้งเล่ม
        HTML(filename=p).write_pdf(dest)
        kb = os.path.getsize(dest) // 1024
        print(f'  ✓ {out}  ({kb} KB, {time.time()-t:.1f}s)  — {who}')
        made += 1
    print(f'\nสร้างเสร็จ {made} เล่ม อยู่ในโฟลเดอร์ manual/')

if __name__ == '__main__':
    print('สร้างคู่มือ PDF')
    main()

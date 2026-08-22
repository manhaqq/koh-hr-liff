#!/usr/bin/env python3
"""
สร้างภาพ Rich Menu ทั้ง 5 แบบจากไฟล์ออกแบบต้นฉบับไฟล์เดียว

    python3 richmenu/build.py

ต้นฉบับ : richmenu/src/base.png  (2500 x 1686 — ขนาด LINE "large")
ผลลัพธ์ : main / main-n / main-h / main-nh / guest  (.jpg, < 1 MB ตามลิมิตของ LINE)

จุดแดงคือ "ระบบแจ้งเตือนแบบ 0 บาท" — สลับภาพเมนูแทนการส่งข้อความ push
ซึ่งไม่กินโควตา 300 ข้อความ/เดือนของแพ็กเกจฟรี

ต้องติดตั้ง Pillow ก่อน:  pip install Pillow
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

FORCE = '--force' in sys.argv

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, 'src', 'base.png')
FONT = '/System/Library/Fonts/Supplemental/SukhumvitSet.ttc'   # macOS
QUALITY = 92

# โทนสีแบรนด์ (ต้องตรงกับ config.js และ 00_Config.js)
TAN, INK, MUTED, RED, WHITE = (219,166,107), (49,34,21), (134,107,78), (226,61,40), (255,255,255)

# ตำแหน่งจุดแดง — พิกัดบนภาพ 2500x1686
DOT_NEWS = (2360, 478)   # มุมขวาบนของปุ่ม "ประกาศและข่าวสาร"
DOT_HR   = (2352, 934)   # มุมขวาบนของการ์ด "ติดต่อ HR"


def dot(im, cx, cy, r=46, ring=10):
    d = ImageDraw.Draw(im, 'RGBA')
    d.ellipse([cx-r-ring, cy-r-ring+6, cx+r+ring, cy+r+ring+6], fill=(49,34,21,46))
    d.ellipse([cx-r-ring, cy-r-ring, cx+r+ring, cy+r+ring], fill=WHITE)
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=RED)


def save(im, name):
    p = os.path.join(HERE, name + '.jpg')
    # ★ ห้ามเขียนทับภาพที่คนแก้เอง
    #   release.sh เรียกไฟล์นี้ทุกครั้งที่ปล่อยเวอร์ชัน ถ้าเขียนทับทุกรอบ
    #   ภาพที่ใครสักคนแก้เองหรืออัปโหลดทับไว้จะหายเงียบ ๆ โดยไม่มีอะไรฟ้อง
    #   กติกา: สร้างใหม่เฉพาะเมื่อไฟล์ออกแบบต้นทางใหม่กว่าภาพผลลัพธ์
    #   ถ้าอยากบังคับสร้างใหม่ทั้งชุด ให้ใส่ --force
    if not FORCE and os.path.exists(p) and os.path.getmtime(p) >= os.path.getmtime(SRC):
        kb = os.path.getsize(p) // 1024
        print(f'  {name:8s} ข้ามไว้ — ภาพปัจจุบันใหม่กว่าไฟล์ออกแบบ ({kb} KB)')
        return
    im.save(p, quality=QUALITY, optimize=True, progressive=True)
    kb = os.path.getsize(p) // 1024
    flag = '' if kb < 1000 else '  ⚠️ เกิน 1 MB — LINE จะไม่รับ'
    print(f'  {name:8s} {im.size[0]}x{im.size[1]}  {kb:4d} KB{flag}')


def build_main():
    for name, dots in {'main': [], 'main-n': [DOT_NEWS],
                       'main-h': [DOT_HR], 'main-nh': [DOT_NEWS, DOT_HR]}.items():
        im = Image.open(SRC).convert('RGB')
        for cx, cy in dots:
            dot(im, cx, cy)
        save(im, name)


def build_guest():
    """เมนูสำหรับคนที่ยังไม่ยืนยันตัวตน (2500 x 843) — ใช้โลโก้และพื้นกระดาษเดียวกัน"""
    full = Image.open(SRC).convert('RGB')
    im   = full.crop((0, 0, 2500, 843))

    # ปูพื้นกระดาษสะอาดทับครึ่งขวา เพื่อลบปุ่ม CLICK HERE เดิม
    patch = full.crop((600, 20, 1100, 180))
    pw, ph = patch.size
    for y in range(180, 843, ph):
        for x in range(1100, 2500, pw):
            im.paste(patch, (x, y))

    d = ImageDraw.Draw(im)

    def fit(text, box_w, start=120, index=1):
        s = start
        while s > 30:
            f = ImageFont.truetype(FONT, s, index=index)
            l, _, r, _ = d.textbbox((0, 0), text, font=f)
            if r - l <= box_w:
                return f
            s -= 2
        return ImageFont.truetype(FONT, 30, index=index)

    def centre(box, text, font, fill):
        x0, y0, x1, y1 = box
        l, t, r, b = d.textbbox((0, 0), text, font=font)
        d.text((x0 + (x1-x0-(r-l))/2 - l, y0 + (y1-y0-(b-t))/2 - t), text, font=font, fill=fill)

    bx0, by0, bx1, by1 = 1145, 205, 2435, 620
    d.rounded_rectangle([bx0, by0+16, bx1, by1+16], radius=160, fill=(196,146,92))
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=160, fill=TAN, outline=INK, width=9)
    centre((bx0, by0, bx1, by1-60), 'ยืนยันตัวตนพนักงาน', fit('ยืนยันตัวตนพนักงาน', bx1-bx0-180, 110), INK)
    centre((bx0, by1-130, bx1, by1-18), 'แตะเพื่อเริ่มใช้งาน', fit('แตะเพื่อเริ่มใช้งาน', 620, 54), (92,64,38))
    centre((bx0, 665, bx1, 790), '?  วิธีใช้งาน', fit('?  วิธีใช้งาน', 700, 62), MUTED)

    save(im, 'guest')


if __name__ == '__main__':
    if not os.path.exists(SRC):
        raise SystemExit(f'ไม่พบไฟล์ต้นฉบับ: {SRC}')
    print('สร้างภาพ Rich Menu จาก', SRC)
    if FORCE:
        print('  โหมด --force: สร้างใหม่ทุกไฟล์ ทับของเดิมทั้งหมด')
    build_main()
    build_guest()
    print('เสร็จแล้ว — อัปโหลดด้วยเมนู "สร้าง/อัปเดต Rich Menu ทั้งหมด" ใน Google Sheet')
    if not FORCE:
        print('(ภาพที่ข้ามไว้คือภาพที่ใหม่กว่าไฟล์ออกแบบ — ใช้ --force ถ้าต้องการสร้างใหม่ทั้งหมด)')

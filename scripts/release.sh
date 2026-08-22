#!/usr/bin/env bash
# ปล่อยเวอร์ชันใหม่ทั้งระบบ — frontend, backend และ Rich Menu ในคำสั่งเดียว
#
#   ./scripts/release.sh v0.3.0 "เพิ่มระบบข้อสอบ"
#
# โค้ดของโปรเจ็คนี้ไปอยู่ 3 ที่ ซึ่งเวอร์ชันไม่ผูกกันเอง สคริปต์นี้ทำให้ตรงกัน
#   1. GitHub          — ต้นทางของทุกอย่าง (git tag)
#   2. GitHub Pages    — หน้าเว็บ LIFF + ภาพ Rich Menu (deploy เองเมื่อ push)
#   3. Apps Script     — โค้ดหลังบ้าน (ต้อง clasp push แล้วผูก deployment ใหม่)
set -euo pipefail

TAG="${1:-}"; NOTE="${2:-}"
[ -z "$TAG" ] && { echo "ใช้: ./scripts/release.sh <tag> [คำอธิบาย]"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# deployment ที่ให้บริการอยู่จริง — URL นี้ฝังอยู่ใน config.js และ LINE webhook
# ห้ามสร้าง deployment ใหม่ ให้ชี้ตัวเดิมไปยังเวอร์ชันใหม่แทน URL จะได้ไม่เปลี่ยน
LIVE_DEPLOYMENT="AKfycbzoHFZWMm8csJ8mCGIBuXt417xwp9txBn_ZnbRPVsWOEIQsM99LcpH5-uGWXixx4tBx"

[ -n "$(git status --porcelain)" ] && { echo "❌ ยังมีไฟล์ที่ยังไม่ commit — commit ก่อนแล้วค่อยปล่อยเวอร์ชัน"; git status --short; exit 1; }

echo "▸ 1/5 สร้างภาพ Rich Menu ใหม่จากไฟล์ออกแบบ"
python3 richmenu/build.py

if [ -n "$(git status --porcelain)" ]; then
  git add richmenu && git commit -m "Rebuild rich menu images for $TAG"
fi

echo "▸ 2/5 อัปโหลดโค้ดหลังบ้านขึ้น Apps Script"
( cd apps-script && clasp push --force )

echo "▸ 3/5 สร้างเวอร์ชันถาวรของ Apps Script"
( cd apps-script && clasp version "$TAG ${NOTE}" )
VER=$( cd apps-script && clasp versions | tail -1 | awk '{print $1}' )
echo "   เวอร์ชันใหม่คือ $VER"

echo "▸ 4/5 ชี้ URL เดิมไปยังเวอร์ชัน $VER"
( cd apps-script && clasp deploy -i "$LIVE_DEPLOYMENT" -V "$VER" -d "$TAG ${NOTE}" )

echo "▸ 5/5 ติดแท็กแล้ว push ขึ้น GitHub"
git tag -a "$TAG" -m "${NOTE:-$TAG}"
git push origin main --tags

cat <<EOF

✅ ปล่อย $TAG เรียบร้อย
   git tag           $TAG
   Apps Script       เวอร์ชัน $VER (URL เดิมไม่เปลี่ยน)
   GitHub Pages      อัปเดตเองใน 1-2 นาที

ถ้าภาพ Rich Menu เปลี่ยน ต้องเปิดชีตแล้วกดเมนู
"🔧 ตั้งค่าระบบ > สร้าง/อัปเดต Rich Menu ทั้งหมด" อีกครั้ง
EOF

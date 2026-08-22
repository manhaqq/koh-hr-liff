#!/usr/bin/env bash
# ย้อนระบบกลับไปเวอร์ชันก่อนหน้า
#
#   ./scripts/rollback.sh            → ดูรายการเวอร์ชันที่ย้อนได้
#   ./scripts/rollback.sh v0.2.0     → ย้อนกลับไปเวอร์ชันนั้น
#
# ★ ใช้ git revert ไม่ใช่ git checkout + force push
#   force push จาก detached HEAD จะลบทุก commit ที่ทำหลังแท็กนั้นทิ้งถาวร
#   ซึ่งเป็นการทำลายข้อมูล ไม่ใช่การย้อนกลับ
#   revert สร้าง commit ใหม่ที่ย้อนการเปลี่ยนแปลง ประวัติยังอยู่ครบและย้อนซ้ำได้
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
LIVE_DEPLOYMENT="AKfycbzoHFZWMm8csJ8mCGIBuXt417xwp9txBn_ZnbRPVsWOEIQsM99LcpH5-uGWXixx4tBx"
TAG="${1:-}"

if [ -z "$TAG" ]; then
  echo "แท็กใน git:"; git tag -l -n1 | sed 's/^/  /'
  echo; echo "เวอร์ชันใน Apps Script:"; ( cd apps-script && clasp versions | sed 's/^/  /' )
  echo; echo "ใช้: ./scripts/rollback.sh <tag>"
  exit 0
fi

git rev-parse "$TAG" >/dev/null 2>&1 || { echo "❌ ไม่พบแท็ก $TAG"; exit 1; }
[ -n "$(git status --porcelain)" ] && { echo "❌ ยังมีไฟล์ที่ยังไม่ commit — จัดการก่อน"; git status --short; exit 1; }

echo "═══ สิ่งที่จะถูกย้อน (commit หลัง $TAG) ═══"
git log --oneline "$TAG"..HEAD | sed 's/^/  /'
echo
read -rp "ย้อนหน้าเว็บกลับไปสภาพของ $TAG หรือไม่ (y/N)? " YN

if [ "$YN" = "y" ]; then
  # revert ทุก commit หลังแท็ก โดยรวบเป็น commit เดียว ประวัติเดิมไม่หายไปไหน
  git revert --no-commit "$TAG"..HEAD
  git commit -m "Roll back to $TAG

ย้อนการเปลี่ยนแปลงทั้งหมดหลัง $TAG กลับ ประวัติเดิมยังอยู่ครบ
ถ้าจะเอากลับมาใหม่ให้ revert commit นี้อีกที"
  git push origin main
  echo "✅ หน้าเว็บย้อนแล้ว GitHub Pages จะอัปเดตใน 1-2 นาที"
fi

echo; echo "═══ หลังบ้าน ═══"
( cd apps-script && clasp versions )
read -rp "ชี้หลังบ้านกลับไปเวอร์ชันเลขอะไร (Enter = ไม่แตะ): " VER
if [ -n "$VER" ]; then
  ( cd apps-script && clasp deploy -i "$LIVE_DEPLOYMENT" -V "$VER" -d "rollback → $TAG" )
  echo "✅ หลังบ้านย้อนแล้ว URL ไม่เปลี่ยน"
fi

cat <<'EOF'

⚠️ สองอย่างที่สคริปต์นี้ย้อนให้ไม่ได้ ต้องทำเอง
   1. ข้อมูลและโครงสร้างในชีต — ถ้าเวอร์ชันที่แล้วมีการเพิ่ม/ย้ายคอลัมน์
      ให้กู้จาก File > Version history ในชีต หรือจากไฟล์สำรองรายสัปดาห์
   2. ภาพ Rich Menu — ต้องเปิดชีตแล้วกดเมนู
      "🔧 ตั้งค่าระบบ > สร้าง/อัปเดต Rich Menu ทั้งหมด" อีกครั้ง
EOF

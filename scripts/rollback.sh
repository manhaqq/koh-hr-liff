#!/usr/bin/env bash
# ย้อนระบบกลับไปเวอร์ชันก่อนหน้า
#
#   ./scripts/rollback.sh            → ดูรายการเวอร์ชันที่ย้อนได้
#   ./scripts/rollback.sh v0.2.0     → ย้อนกลับไปเวอร์ชันนั้น
#
# ★ หลังบ้านย้อนได้ทันทีโดยไม่ต้องแตะโค้ด เพราะ Apps Script เก็บทุกเวอร์ชันไว้
#   แค่ชี้ deployment เดิมกลับไปเวอร์ชันเก่า URL ไม่เปลี่ยน พนักงานไม่รู้สึกอะไร
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
LIVE_DEPLOYMENT="AKfycbzoHFZWMm8csJ8mCGIBuXt417xwp9txBn_ZnbRPVsWOEIQsM99LcpH5-uGWXixx4tBx"
TAG="${1:-}"

if [ -z "$TAG" ]; then
  echo "แท็กใน git:"; git tag -l -n1 | sed 's/^/  /'
  echo; echo "เวอร์ชันใน Apps Script:"; ( cd apps-script && clasp versions | sed 's/^/  /' )
  echo; echo "ใช้: ./scripts/rollback.sh <tag>   แล้วดูว่าคำอธิบายเวอร์ชันตรงกับแท็กไหน"
  exit 0
fi

git rev-parse "$TAG" >/dev/null 2>&1 || { echo "❌ ไม่พบแท็ก $TAG"; exit 1; }

echo "เวอร์ชันของ Apps Script ที่มี:"; ( cd apps-script && clasp versions )
read -rp "จะย้อนหลังบ้านไปเวอร์ชันเลขอะไร (Enter = ข้าม ไม่แตะหลังบ้าน): " VER

echo "▸ ย้อนโค้ดในเครื่องไปที่ $TAG"
git checkout "$TAG"

if [ -n "$VER" ]; then
  echo "▸ ชี้ URL เดิมกลับไปเวอร์ชัน $VER"
  ( cd apps-script && clasp deploy -i "$LIVE_DEPLOYMENT" -V "$VER" -d "rollback → $TAG" )
fi

cat <<EOF

✅ ย้อนกลับไป $TAG แล้ว

หน้าเว็บ (GitHub Pages) ยังเป็นของใหม่อยู่ ถ้าต้องย้อนด้วยให้สั่ง
   git push origin HEAD:main --force-with-lease

กลับมาทำงานต่อที่เวอร์ชันล่าสุด
   git checkout main
EOF

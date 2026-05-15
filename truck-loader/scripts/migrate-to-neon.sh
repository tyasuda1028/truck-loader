#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# migrate-to-neon.sh
#
# Neon にスキーマを作成し、Supabase からエクスポートしたデータを投入する。
#
# 使い方:
#   DATABASE_URL="postgresql://..." bash scripts/migrate-to-neon.sh
#
# または .env.local に DATABASE_URL を設定してから:
#   bash scripts/migrate-to-neon.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

# .env.local から DATABASE_URL を読み込む（未設定の場合）
if [ -z "$DATABASE_URL" ] && [ -f ".env.local" ]; then
  export $(grep -v '^#' .env.local | grep DATABASE_URL | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL が設定されていません。"
  echo "   .env.local に DATABASE_URL を追加するか、環境変数としてセットしてください。"
  exit 1
fi

echo "📦 接続先: $(echo $DATABASE_URL | sed 's/:\/\/[^@]*@/:\/\/***@/')"
echo ""

# psql の存在確認
if ! command -v psql &> /dev/null; then
  echo "❌ psql が見つかりません。"
  echo "   brew install postgresql でインストールしてください。"
  exit 1
fi

echo "1️⃣  スキーマ作成中..."
psql "$DATABASE_URL" -f neon-schema.sql
echo "✅ スキーマ作成完了"
echo ""

echo "2️⃣  データ投入中（2677行）..."
psql "$DATABASE_URL" -f neon-seed-data.sql
echo "✅ データ投入完了"
echo ""

echo "3️⃣  件数確認..."
psql "$DATABASE_URL" -c "
SELECT 'factories' as table_name, count(*) FROM factories
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'warehouses', count(*) FROM warehouses
UNION ALL SELECT 'truck_types', count(*) FROM truck_types
UNION ALL SELECT 'pallet_types', count(*) FROM pallet_types
UNION ALL SELECT 'production_plan', count(*) FROM production_plan
UNION ALL SELECT 'distribution_ratios', count(*) FROM distribution_ratios
UNION ALL SELECT 'inventory_stock', count(*) FROM inventory_stock
UNION ALL SELECT 'location_stock', count(*) FROM location_stock
UNION ALL SELECT 'weekly_shipping_schedule', count(*) FROM weekly_shipping_schedule
ORDER BY table_name;
"

echo ""
echo "🎉 Neon への移行が完了しました！"
echo ""
echo "次のステップ："
echo "  1. .env.local の DATABASE_URL が正しいことを確認"
echo "  2. npm run dev で動作確認"
echo "  3. Vercel に DATABASE_URL を登録: vercel env add DATABASE_URL"

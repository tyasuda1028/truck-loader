-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_add_product_fields.sql
--
-- products テーブルに後発の 5 カラムを追加する。
--
-- 経緯：
--   初期スキーマでは products テーブルに 6 カラム（code, name,
--   capacity_per_pallet, pallet_type, color, factory_code）しかなく、
--   その後アプリ側に equipment_category / equipment_name / poji /
--   destination / production_method の 5 フィールドが追加された。
--   既存の Supabase プロジェクトはこれらのカラムが未追加のため、
--   CSV インポート時に upsert が失敗していた（エラーは silent に
--   握りつぶされていた）。
--
-- 実行方法：
--   Supabase Dashboard → SQL Editor を開いてこの内容をコピペし「Run」。
--   IF NOT EXISTS 付きなので、既に追加済みの環境でも安全に再実行できる。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS equipment_category text DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS equipment_name     text DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS poji               boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS destination        text DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS production_method  text DEFAULT '';

-- 確認用クエリ（実行は任意）：
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'products'
-- ORDER BY ordinal_position;

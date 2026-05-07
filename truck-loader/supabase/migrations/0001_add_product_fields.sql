-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_add_product_fields.sql
--
-- products テーブルに後発のカラムを追加する。
--
-- 実行方法：
--   Supabase Dashboard → SQL Editor を開いてこの内容をコピペし「Run」。
--   IF NOT EXISTS 付きなので、既に追加済みの環境でも安全に再実行できる。
-- ─────────────────────────────────────────────────────────────────────────────

-- フェーズ1（器具情報・ポジ・仕向け・生産方式）
ALTER TABLE products ADD COLUMN IF NOT EXISTS equipment_category text    DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS equipment_name     text    DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS poji               boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS destination        text    DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS production_method  text    DEFAULT '';

-- フェーズ2（2段積み条件）
ALTER TABLE products ADD COLUMN IF NOT EXISTS stackable          boolean DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_stack_on_top boolean DEFAULT true;

-- フェーズ3: 重複削除 & UNIQUE 制約追加
-- （code カラムに PRIMARY KEY / UNIQUE 制約がない場合に備え、
--   重複行を削除してから UNIQUE 制約を付与する）

-- ① 重複行を削除（各 code につき ctid が最小の1行だけ残す）
DELETE FROM products WHERE ctid NOT IN (
  SELECT min(ctid) FROM products GROUP BY code
);

-- ② code に UNIQUE 制約を追加（既に存在する場合はエラーを無視）
DO $$
BEGIN
  ALTER TABLE products ADD CONSTRAINT products_code_key UNIQUE (code);
EXCEPTION WHEN duplicate_table THEN
  NULL; -- 制約が既に存在する場合はスキップ
END $$;

-- 確認用クエリ（実行は任意）：
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'products'
-- ORDER BY ordinal_position;

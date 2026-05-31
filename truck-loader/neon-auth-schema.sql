-- ─────────────────────────────────────────────────────────────
-- neon-auth-schema.sql
-- マルチテナント対応 移行スクリプト
--
-- 実行前提: neon-schema.sql が適用済みであること
-- 実行後: 既存データはすべてクリアされます（新規テナント向けリセット）
-- ─────────────────────────────────────────────────────────────

-- ① companies / users テーブル作成
CREATE TABLE IF NOT EXISTS companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_company_id_idx ON users(company_id);

-- ② 既存データクリア（パロマ専用データを削除しテナント向けリセット）
TRUNCATE TABLE
  send_qty_manual, non_working_dates, operating_days,
  weekly_shipping_schedule, planned_sales, in_transit_stock,
  location_stock, inventory_stock, distribution_ratios,
  daily_production_plan, production_plan,
  pallet_types, truck_types, warehouses, products, factories
CASCADE;

-- ③ company_id カラム追加（master テーブル）

-- factories: PK を (company_id, code) に変更
ALTER TABLE factories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE factories DROP CONSTRAINT IF EXISTS factories_pkey;
ALTER TABLE factories ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE factories ADD PRIMARY KEY (company_id, code);

-- products: PK を (company_id, code) に変更
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_pkey;
ALTER TABLE products ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE products ADD PRIMARY KEY (company_id, code);

-- warehouses: PK を (company_id, code) に変更
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_pkey;
ALTER TABLE warehouses ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE warehouses ADD PRIMARY KEY (company_id, code);

-- truck_types: PK を (company_id, code) に変更
ALTER TABLE truck_types ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE truck_types DROP CONSTRAINT IF EXISTS truck_types_pkey;
ALTER TABLE truck_types ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE truck_types ADD PRIMARY KEY (company_id, code);

-- pallet_types: PK を (company_id, code) に変更
ALTER TABLE pallet_types ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE pallet_types DROP CONSTRAINT IF EXISTS pallet_types_pkey;
ALTER TABLE pallet_types ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE pallet_types ADD PRIMARY KEY (company_id, code);

-- ④ company_id カラム追加（data テーブル）

-- production_plan: PK を (company_id, product_code) に変更
ALTER TABLE production_plan ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE production_plan DROP CONSTRAINT IF EXISTS production_plan_pkey;
ALTER TABLE production_plan ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE production_plan ADD PRIMARY KEY (company_id, product_code);

-- daily_production_plan: PK を (company_id, product_code, date) に変更
ALTER TABLE daily_production_plan ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE daily_production_plan DROP CONSTRAINT IF EXISTS daily_production_plan_pkey;
ALTER TABLE daily_production_plan ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE daily_production_plan ADD PRIMARY KEY (company_id, product_code, date);

-- distribution_ratios: PK を (company_id, product_code, warehouse_code) に変更
-- （旧・配分比率モデル。現行は baseline_stock を使用。後方互換のため残置）
ALTER TABLE distribution_ratios ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE distribution_ratios DROP CONSTRAINT IF EXISTS distribution_ratios_pkey;
ALTER TABLE distribution_ratios ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE distribution_ratios ADD PRIMARY KEY (company_id, product_code, warehouse_code);

-- baseline_stock: 拠点別 基準在庫数（個）。新規デプロイ用に作成。
CREATE TABLE IF NOT EXISTS baseline_stock (
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_code   TEXT NOT NULL,
  warehouse_code TEXT NOT NULL,
  qty            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, product_code, warehouse_code)
);

-- inventory_stock: PK を (company_id, product_code) に変更
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE inventory_stock DROP CONSTRAINT IF EXISTS inventory_stock_pkey;
ALTER TABLE inventory_stock ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE inventory_stock ADD PRIMARY KEY (company_id, product_code);

-- location_stock: PK を (company_id, product_code, warehouse_code) に変更
ALTER TABLE location_stock ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE location_stock DROP CONSTRAINT IF EXISTS location_stock_pkey;
ALTER TABLE location_stock ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE location_stock ADD PRIMARY KEY (company_id, product_code, warehouse_code);

-- in_transit_stock: PK を (company_id, product_code, warehouse_code) に変更
ALTER TABLE in_transit_stock ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE in_transit_stock DROP CONSTRAINT IF EXISTS in_transit_stock_pkey;
ALTER TABLE in_transit_stock ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE in_transit_stock ADD PRIMARY KEY (company_id, product_code, warehouse_code);

-- planned_sales: PK を (company_id, product_code, warehouse_code) に変更
ALTER TABLE planned_sales ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE planned_sales DROP CONSTRAINT IF EXISTS planned_sales_pkey;
ALTER TABLE planned_sales ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE planned_sales ADD PRIMARY KEY (company_id, product_code, warehouse_code);

-- weekly_shipping_schedule: PK を (company_id, factory_code, warehouse_code) に変更
ALTER TABLE weekly_shipping_schedule ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE weekly_shipping_schedule DROP CONSTRAINT IF EXISTS weekly_shipping_schedule_pkey;
ALTER TABLE weekly_shipping_schedule ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE weekly_shipping_schedule ADD PRIMARY KEY (company_id, factory_code, warehouse_code);

-- operating_days: PK を (company_id, factory_code) に変更
ALTER TABLE operating_days ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE operating_days DROP CONSTRAINT IF EXISTS operating_days_pkey;
ALTER TABLE operating_days ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE operating_days ADD PRIMARY KEY (company_id, factory_code);

-- non_working_dates: PK を (company_id, factory_code, date) に変更
ALTER TABLE non_working_dates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE non_working_dates DROP CONSTRAINT IF EXISTS non_working_dates_pkey;
ALTER TABLE non_working_dates ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE non_working_dates ADD PRIMARY KEY (company_id, factory_code, date);

-- send_qty_manual: PK を (company_id, product_code, warehouse_code) に変更
ALTER TABLE send_qty_manual ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE send_qty_manual DROP CONSTRAINT IF EXISTS send_qty_manual_pkey;
ALTER TABLE send_qty_manual ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE send_qty_manual ADD PRIMARY KEY (company_id, product_code, warehouse_code);

-- ⑤ インデックス
CREATE INDEX IF NOT EXISTS factories_company_id_idx             ON factories(company_id);
CREATE INDEX IF NOT EXISTS products_company_id_idx              ON products(company_id);
CREATE INDEX IF NOT EXISTS warehouses_company_id_idx            ON warehouses(company_id);
CREATE INDEX IF NOT EXISTS truck_types_company_id_idx           ON truck_types(company_id);
CREATE INDEX IF NOT EXISTS pallet_types_company_id_idx          ON pallet_types(company_id);
CREATE INDEX IF NOT EXISTS production_plan_company_id_idx       ON production_plan(company_id);
CREATE INDEX IF NOT EXISTS daily_production_plan_company_id_idx ON daily_production_plan(company_id);
CREATE INDEX IF NOT EXISTS distribution_ratios_company_id_idx   ON distribution_ratios(company_id);
CREATE INDEX IF NOT EXISTS baseline_stock_company_id_idx        ON baseline_stock(company_id);
CREATE INDEX IF NOT EXISTS inventory_stock_company_id_idx       ON inventory_stock(company_id);
CREATE INDEX IF NOT EXISTS location_stock_company_id_idx        ON location_stock(company_id);
CREATE INDEX IF NOT EXISTS in_transit_stock_company_id_idx      ON in_transit_stock(company_id);
CREATE INDEX IF NOT EXISTS planned_sales_company_id_idx         ON planned_sales(company_id);
CREATE INDEX IF NOT EXISTS weekly_shipping_schedule_company_id_idx ON weekly_shipping_schedule(company_id);
CREATE INDEX IF NOT EXISTS operating_days_company_id_idx        ON operating_days(company_id);
CREATE INDEX IF NOT EXISTS non_working_dates_company_id_idx     ON non_working_dates(company_id);
CREATE INDEX IF NOT EXISTS send_qty_manual_company_id_idx       ON send_qty_manual(company_id);

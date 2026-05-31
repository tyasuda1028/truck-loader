#!/usr/bin/env node
/**
 * migrate-baseline-stock.mjs
 *
 * 「配分比率(%)」方式から「拠点別 基準在庫数(個)」方式へ移行するための
 * 追加マイグレーション。既存の distribution_ratios テーブルは残したまま、
 * 新しい baseline_stock テーブルを追加で作成する（後方互換・無停止）。
 *
 * 使い方:  node scripts/migrate-baseline-stock.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dir, '..');

function loadEnv() {
  const envPath = join(projectRoot, '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (t.startsWith('#') || !t.includes('=')) continue;
    const eq = t.indexOf('=');
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const DATABASE_URL = (process.env.DATABASE_URL || '').replace('-pooler.', '.');
if (!DATABASE_URL) { console.error('❌ DATABASE_URL 未設定'); process.exit(1); }

const sql = neon(DATABASE_URL);

async function run() {
  console.log('🛠  baseline_stock テーブルを作成中...');
  await sql`
    CREATE TABLE IF NOT EXISTS baseline_stock (
      company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_code   TEXT NOT NULL,
      warehouse_code TEXT NOT NULL,
      qty            INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, product_code, warehouse_code)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_baseline_stock_company ON baseline_stock(company_id)`;
  console.log('✅ baseline_stock テーブル作成完了');
}

run().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });

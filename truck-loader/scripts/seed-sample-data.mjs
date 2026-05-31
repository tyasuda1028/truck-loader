#!/usr/bin/env node
/**
 * seed-sample-data.mjs
 *
 * 指定した company_id に「架空の中小企業（飲料メーカー）」サンプルデータを投入する。
 *
 * 使い方:
 *   COMPANY_ID=<uuid> node scripts/seed-sample-data.mjs
 *   （COMPANY_ID 省略時は下の DEFAULT_COMPANY_ID を使用）
 */
import { readFileSync, existsSync } from 'fs';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dir, '..');

// .env.local から DATABASE_URL 読み込み
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

// 投入先テナント（テスト物流株式会社）
const COMPANY_ID = process.env.COMPANY_ID || 'ca3cf94f-bf91-4442-aa8a-8851f3b5bf2e';

const sql = neon(DATABASE_URL);

// ─── サンプルデータ定義 ─────────────────────────────────────────────

const factories = [
  { code: 'F001', name: '関東工場' },
  { code: 'F002', name: '関西工場' },
];

// 飲料製品（段ボール寸法・重量込み）
const products = [
  { code: 'D001', name: '緑茶 500ml',         cap: 60, pallet: 'P01', color: '#2ECC71', factory: 'F001', cat: '飲料', equip: 'お茶',     dest: '量販', w: 400, d: 300, h: 250, kg: 13 },
  { code: 'D002', name: '麦茶 600ml',         cap: 60, pallet: 'P01', color: '#B7791F', factory: 'F001', cat: '飲料', equip: 'お茶',     dest: '量販', w: 410, d: 310, h: 280, kg: 15 },
  { code: 'D003', name: '天然水 500ml',       cap: 72, pallet: 'P01', color: '#4A90D9', factory: 'F001', cat: '飲料', equip: '水',       dest: '一般', w: 400, d: 300, h: 230, kg: 12 },
  { code: 'D004', name: '微糖コーヒー 185g',  cap: 100,pallet: 'P02', color: '#8B5A2B', factory: 'F002', cat: '飲料', equip: 'コーヒー', dest: '一般', w: 390, d: 290, h: 130, kg: 6.5 },
  { code: 'D005', name: 'ブラックコーヒー 185g', cap: 100, pallet: 'P02', color: '#2C3E50', factory: 'F002', cat: '飲料', equip: 'コーヒー', dest: '一般', w: 390, d: 290, h: 130, kg: 6.5 },
  { code: 'D006', name: 'オレンジジュース 1L', cap: 48, pallet: 'P01', color: '#E67E22', factory: 'F002', cat: '飲料', equip: 'ジュース', dest: '量販', w: 330, d: 250, h: 250, kg: 13 },
  { code: 'D007', name: 'りんごジュース 1L',  cap: 48, pallet: 'P01', color: '#E74C3C', factory: 'F002', cat: '飲料', equip: 'ジュース', dest: '量販', w: 330, d: 250, h: 250, kg: 13 },
  { code: 'D008', name: 'スポーツドリンク 500ml', cap: 60, pallet: 'P01', color: '#16A085', factory: 'F001', cat: '飲料', equip: '機能性', dest: '一般', w: 400, d: 300, h: 250, kg: 13 },
];

const warehouses = [
  { code: 'W001', name: '札幌物流センター',   truck: 'T06', max: 12 },
  { code: 'W002', name: '仙台営業所',         truck: 'T05', max: 8 },
  { code: 'W003', name: '東京物流センター',   truck: 'T04', max: 16 },
  { code: 'W004', name: '名古屋物流センター', truck: 'T06', max: 12 },
  { code: 'W005', name: '大阪物流センター',   truck: 'T06', max: 12 },
  { code: 'W006', name: '福岡営業所',         truck: 'T05', max: 8 },
];

// 拠点規模シェア（基準在庫数・現在庫・予定出荷を按分するための拠点の規模感）
const shareByWh = { W001: 10, W002: 15, W003: 30, W004: 15, W005: 20, W006: 10 };

// 週間生産数（個）
const productionQty = {
  D001: 4800, D002: 3600, D003: 7200, D004: 5000,
  D005: 4000, D006: 2400, D007: 2400, D008: 3600,
};

// 製品ごとの目標在庫（全拠点合計, 個）＝週間生産の約1.5倍。各拠点へは shareByWh で按分する。
const baselineTotal = {
  D001: 7200, D002: 5400, D003: 10800, D004: 7500,
  D005: 6000, D006: 3600, D007: 3600, D008: 5400,
};

// 稼働日（月〜金）
const operatingDays = [true, true, true, true, true, false, false];

// 出荷スケジュール: F001=月水金, F002=火木
const scheduleF001 = [true, false, true, false, true, false, false];
const scheduleF002 = [false, true, false, true, false, false, false];

// 日別生産: 週(2026-06-01〜06-05 月〜金)に均等配分
const weekDates = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'];

async function run() {
  console.log(`📦 投入先 company_id: ${COMPANY_ID}`);

  // 既存のサンプルデータをクリア（このテナント分のみ）
  console.log('🧹 既存データクリア中...');
  for (const t of ['send_qty_manual','planned_sales','in_transit_stock','location_stock',
                    'inventory_stock','baseline_stock','distribution_ratios','daily_production_plan',
                    'production_plan','weekly_shipping_schedule','operating_days',
                    'non_working_dates','products','warehouses','factories']) {
    await sql.query(`DELETE FROM ${t} WHERE company_id = $1`, [COMPANY_ID]);
  }

  // 工場
  console.log('🏭 工場...');
  for (const f of factories) {
    await sql`INSERT INTO factories (company_id, code, name) VALUES (${COMPANY_ID}, ${f.code}, ${f.name})`;
  }

  // 製品
  console.log('🥤 製品...');
  for (const p of products) {
    await sql`
      INSERT INTO products (company_id, code, name, capacity_per_pallet, pallet_type, color,
        factory_code, equipment_category, equipment_name, poji, destination, production_method,
        stackable, allow_stack_on_top, box_width_mm, box_depth_mm, box_height_mm, box_weight_kg)
      VALUES (${COMPANY_ID}, ${p.code}, ${p.name}, ${p.cap}, ${p.pallet}, ${p.color},
        ${p.factory}, ${p.cat}, ${p.equip}, true, ${p.dest}, 'A',
        true, true, ${p.w}, ${p.d}, ${p.h}, ${p.kg})
    `;
  }

  // 倉庫
  console.log('🏢 倉庫...');
  for (const w of warehouses) {
    await sql`
      INSERT INTO warehouses (company_id, code, name, "group", truck_type, max_pallets)
      VALUES (${COMPANY_ID}, ${w.code}, ${w.name}, '', ${w.truck}, ${w.max})
    `;
  }

  // 稼働日
  console.log('📅 稼働日...');
  for (const f of factories) {
    await sql`INSERT INTO operating_days (company_id, factory_code, days) VALUES (${COMPANY_ID}, ${f.code}, ${operatingDays})`;
  }

  // 週間生産数 + 日別生産
  console.log('📈 生産計画...');
  for (const [code, qty] of Object.entries(productionQty)) {
    await sql`INSERT INTO production_plan (company_id, product_code, qty) VALUES (${COMPANY_ID}, ${code}, ${qty})`;
    const per = Math.round(qty / weekDates.length);
    for (const date of weekDates) {
      await sql`INSERT INTO daily_production_plan (company_id, product_code, date, qty) VALUES (${COMPANY_ID}, ${code}, ${date}, ${per})`;
    }
  }

  // 基準在庫数（拠点別 目標在庫数, 個）＝製品ごとの目標在庫を拠点規模シェアで按分
  console.log('📊 基準在庫数...');
  for (const [code, total] of Object.entries(baselineTotal)) {
    for (const [wh, share] of Object.entries(shareByWh)) {
      const qty = Math.round(total * share / 100);
      await sql`INSERT INTO baseline_stock (company_id, product_code, warehouse_code, qty) VALUES (${COMPANY_ID}, ${code}, ${wh}, ${qty})`;
    }
  }

  // 拠点別現在庫（基準在庫数の約60%＝不足が出る状態にして生産補充をデモ）
  console.log('🗺  拠点別在庫...');
  for (const [code, total] of Object.entries(baselineTotal)) {
    for (const [wh, share] of Object.entries(shareByWh)) {
      const baseline = Math.round(total * share / 100);
      const qty = Math.round(baseline * 0.6);
      await sql`INSERT INTO location_stock (company_id, product_code, warehouse_code, qty) VALUES (${COMPANY_ID}, ${code}, ${wh}, ${qty})`;
    }
  }

  // 今週予定出荷数（週間生産を拠点規模シェアで按分）
  console.log('🚚 予定出荷数...');
  for (const [code, total] of Object.entries(productionQty)) {
    for (const [wh, share] of Object.entries(shareByWh)) {
      const qty = Math.round(total * share / 100);
      await sql`INSERT INTO planned_sales (company_id, product_code, warehouse_code, qty) VALUES (${COMPANY_ID}, ${code}, ${wh}, ${qty})`;
    }
  }

  // 出荷スケジュール（各工場→全倉庫）
  console.log('🗓  出荷スケジュール...');
  for (const w of warehouses) {
    await sql`INSERT INTO weekly_shipping_schedule (company_id, factory_code, warehouse_code, days) VALUES (${COMPANY_ID}, 'F001', ${w.code}, ${scheduleF001})`;
    await sql`INSERT INTO weekly_shipping_schedule (company_id, factory_code, warehouse_code, days) VALUES (${COMPANY_ID}, 'F002', ${w.code}, ${scheduleF002})`;
  }

  // 件数確認
  console.log('\n✅ 投入完了。件数確認:');
  for (const t of ['factories','products','warehouses','production_plan','daily_production_plan',
                   'baseline_stock','location_stock','planned_sales',
                   'weekly_shipping_schedule','operating_days']) {
    const rows = await sql.query(`SELECT COUNT(*)::int AS c FROM ${t} WHERE company_id = $1`, [COMPANY_ID]);
    console.log(`  ${t.padEnd(26)} ${rows[0].c} 件`);
  }
  console.log('\n🎉 サンプルデータ投入完了！');
}

run().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });

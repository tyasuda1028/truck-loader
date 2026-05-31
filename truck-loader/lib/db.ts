'use server';

/**
 * Neon PostgreSQL CRUD operations — Multi-tenant version.
 * All functions are Server Actions (Next.js 14 App Router).
 *
 * company_id は JWT セッションから自動取得します。
 * クライアントからパラメータとして渡す必要はありません。
 */
import { sql } from './neon';
import { neon } from '@neondatabase/serverless';
import { getServerSession } from 'next-auth';
import { authOptions } from './authOptions';
import bcrypt from 'bcryptjs';
import type {
  Factory, Product, Warehouse, TruckType, PalletType,
  ProductionPlan, DailyProductionPlan, BaselineStock,
  InventoryStock, LocationStock, WeeklyShippingSchedule, InTransitStock, PlannedSales,
  OperatingDays, SendQtyManual, NonWorkingDates,
} from './types';

// ─── Auth helper ─────────────────────────────────────────────────────────────

/** セッションから company_id を取得。未ログインなら例外。 */
async function getCompanyId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    throw new Error('認証が必要です。ログインしてください。');
  }
  return session.user.companyId;
}

// ─── Company & User (登録用) ─────────────────────────────────────────────────

/** 会社を作成し、生成された company_id を返す */
export async function createCompany(name: string): Promise<string> {
  const rows = await sql`
    INSERT INTO companies (name) VALUES (${name})
    RETURNING id
  `;
  return rows[0].id as string;
}

/** ユーザーを作成（パスワードはハッシュ化して保存） */
export async function createUser(
  companyId: string,
  email: string,
  name: string,
  password: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);
  await sql`
    INSERT INTO users (company_id, email, name, password_hash)
    VALUES (${companyId}, ${email}, ${name}, ${passwordHash})
  `;
}

/** メールアドレスが既に登録されているか確認 */
export async function emailExists(email: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM users WHERE email = ${email} LIMIT 1`;
  return rows.length > 0;
}

// ─── Factories ────────────────────────────────────────────────────────────────

export async function loadFactories(): Promise<Factory[]> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT code, name FROM factories
    WHERE company_id = ${cid}
    ORDER BY code
  `;
  return rows.map((r) => ({ code: r.code as string, name: r.name as string }));
}

export async function upsertFactory(f: Factory) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO factories (company_id, code, name)
    VALUES (${cid}, ${f.code}, ${f.name})
    ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name
  `;
}

export async function deleteFactory(code: string) {
  const cid = await getCompanyId();
  await sql`DELETE FROM factories WHERE company_id = ${cid} AND code = ${code}`;
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function loadProducts(): Promise<Product[]> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT * FROM products WHERE company_id = ${cid} ORDER BY code
  `;
  const seen = new Set<string>();
  return rows
    .map((r) => ({
      code: r.code as string,
      name: r.name as string,
      capacityPerPallet: r.capacity_per_pallet as number,
      palletType: r.pallet_type as string,
      color: r.color as string,
      factoryCode: (r.factory_code as string | null) ?? '',
      equipmentCategory: (r.equipment_category as string | null) ?? '',
      equipmentName: (r.equipment_name as string | null) ?? '',
      poji: (r.poji as boolean | null) ?? false,
      destination: (r.destination as string | null) ?? '',
      productionMethod: (r.production_method as string | null) ?? '',
      stackable: (r.stackable as boolean | null) ?? true,
      allowStackOnTop: (r.allow_stack_on_top as boolean | null) ?? true,
      boxWidthMM: (r.box_width_mm as number | null) ?? undefined,
      boxDepthMM: (r.box_depth_mm as number | null) ?? undefined,
      boxHeightMM: (r.box_height_mm as number | null) ?? undefined,
      boxWeightKg: (r.box_weight_kg as number | null) ?? undefined,
    }))
    .filter((p) => {
      if (seen.has(p.code)) return false;
      seen.add(p.code);
      return true;
    });
}

export async function upsertProduct(p: Product) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO products (
      company_id, code, name, capacity_per_pallet, pallet_type, color,
      factory_code, equipment_category, equipment_name,
      poji, destination, production_method,
      stackable, allow_stack_on_top,
      box_width_mm, box_depth_mm, box_height_mm, box_weight_kg
    ) VALUES (
      ${cid}, ${p.code}, ${p.name}, ${p.capacityPerPallet}, ${p.palletType}, ${p.color},
      ${p.factoryCode ?? ''}, ${p.equipmentCategory ?? ''}, ${p.equipmentName ?? ''},
      ${p.poji ?? false}, ${p.destination ?? ''}, ${p.productionMethod ?? ''},
      ${p.stackable ?? true}, ${p.allowStackOnTop ?? true},
      ${p.boxWidthMM ?? null}, ${p.boxDepthMM ?? null}, ${p.boxHeightMM ?? null}, ${p.boxWeightKg ?? null}
    )
    ON CONFLICT (company_id, code) DO UPDATE SET
      name                = EXCLUDED.name,
      capacity_per_pallet = EXCLUDED.capacity_per_pallet,
      pallet_type         = EXCLUDED.pallet_type,
      color               = EXCLUDED.color,
      factory_code        = EXCLUDED.factory_code,
      equipment_category  = EXCLUDED.equipment_category,
      equipment_name      = EXCLUDED.equipment_name,
      poji                = EXCLUDED.poji,
      destination         = EXCLUDED.destination,
      production_method   = EXCLUDED.production_method,
      stackable           = EXCLUDED.stackable,
      allow_stack_on_top  = EXCLUDED.allow_stack_on_top,
      box_width_mm        = EXCLUDED.box_width_mm,
      box_depth_mm        = EXCLUDED.box_depth_mm,
      box_height_mm       = EXCLUDED.box_height_mm,
      box_weight_kg       = EXCLUDED.box_weight_kg
  `;
}

export async function upsertProducts(products: Product[]) {
  for (const p of products) {
    await upsertProduct(p);
  }
}

export async function deleteProduct(code: string) {
  const cid = await getCompanyId();
  await sql`DELETE FROM products WHERE company_id = ${cid} AND code = ${code}`;
}

/**
 * DB 上の products テーブルの重複行（同一 code・同一 company_id）を削除する。
 */
export async function deduplicateProducts(): Promise<number> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT * FROM products WHERE company_id = ${cid} ORDER BY code
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keepByCode = new Map<string, any>();
  const duplicatedCodes = new Set<string>();
  for (const row of rows) {
    const code = row.code as string;
    if (keepByCode.has(code)) {
      duplicatedCodes.add(code);
    } else {
      keepByCode.set(code, row);
    }
  }
  if (duplicatedCodes.size === 0) return 0;

  for (const code of duplicatedCodes) {
    await sql`DELETE FROM products WHERE company_id = ${cid} AND code = ${code}`;
    const keep = keepByCode.get(code)!;
    await sql`
      INSERT INTO products (
        company_id, code, name, capacity_per_pallet, pallet_type, color,
        factory_code, equipment_category, equipment_name,
        poji, destination, production_method,
        stackable, allow_stack_on_top,
        box_width_mm, box_depth_mm, box_height_mm, box_weight_kg
      ) VALUES (
        ${cid}, ${keep.code}, ${keep.name}, ${keep.capacity_per_pallet}, ${keep.pallet_type}, ${keep.color},
        ${keep.factory_code ?? ''}, ${keep.equipment_category ?? ''}, ${keep.equipment_name ?? ''},
        ${keep.poji ?? false}, ${keep.destination ?? ''}, ${keep.production_method ?? ''},
        ${keep.stackable ?? true}, ${keep.allow_stack_on_top ?? true},
        ${keep.box_width_mm ?? null}, ${keep.box_depth_mm ?? null},
        ${keep.box_height_mm ?? null}, ${keep.box_weight_kg ?? null}
      )
    `;
  }

  return duplicatedCodes.size;
}

// ─── Warehouses ──────────────────────────────────────────────────────────────

export async function loadWarehouses(): Promise<Warehouse[]> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT code, name, truck_type, max_pallets
    FROM warehouses WHERE company_id = ${cid} ORDER BY code
  `;
  return rows.map((r) => ({
    code: r.code as string,
    name: r.name as string,
    truckType: r.truck_type as string,
    maxPallets: r.max_pallets as number,
  }));
}

export async function upsertWarehouse(w: Warehouse) {
  const cid = await getCompanyId();
  // "group"（旧・東西区分）列は廃止。DB列は NOT NULL のため空文字で互換維持。
  await sql`
    INSERT INTO warehouses (company_id, code, name, "group", truck_type, max_pallets)
    VALUES (${cid}, ${w.code}, ${w.name}, '', ${w.truckType}, ${w.maxPallets})
    ON CONFLICT (company_id, code) DO UPDATE SET
      name        = EXCLUDED.name,
      truck_type  = EXCLUDED.truck_type,
      max_pallets = EXCLUDED.max_pallets
  `;
}

export async function deleteWarehouse(code: string) {
  const cid = await getCompanyId();
  await sql`DELETE FROM warehouses WHERE company_id = ${cid} AND code = ${code}`;
}

// ─── Truck Types ─────────────────────────────────────────────────────────────

export async function loadTruckTypes(): Promise<TruckType[]> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT * FROM truck_types WHERE company_id = ${cid} ORDER BY code
  `;
  return rows.map((r) => ({
    code: r.code as string,
    name: r.name as string,
    maxPallets: r.max_pallets as number,
    cols: r.cols as number,
    rows: r.rows as number,
    widthMM: r.width_mm as number,
    depthMM: r.depth_mm as number,
    heightMM: (r.height_mm as number | null) ?? 2300,
  }));
}

export async function upsertTruckType(t: TruckType) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO truck_types (company_id, code, name, max_pallets, cols, rows, width_mm, depth_mm, height_mm)
    VALUES (${cid}, ${t.code}, ${t.name}, ${t.maxPallets}, ${t.cols}, ${t.rows}, ${t.widthMM}, ${t.depthMM}, ${t.heightMM})
    ON CONFLICT (company_id, code) DO UPDATE SET
      name        = EXCLUDED.name,
      max_pallets = EXCLUDED.max_pallets,
      cols        = EXCLUDED.cols,
      rows        = EXCLUDED.rows,
      width_mm    = EXCLUDED.width_mm,
      depth_mm    = EXCLUDED.depth_mm,
      height_mm   = EXCLUDED.height_mm
  `;
}

export async function deleteTruckType(code: string) {
  const cid = await getCompanyId();
  await sql`DELETE FROM truck_types WHERE company_id = ${cid} AND code = ${code}`;
}

// ─── Pallet Types ────────────────────────────────────────────────────────────

export async function loadPalletTypes(): Promise<PalletType[]> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT * FROM pallet_types WHERE company_id = ${cid} ORDER BY code
  `;
  return rows.map((r) => ({
    code: r.code as string,
    name: r.name as string,
    widthMM: r.width_mm as number,
    depthMM: r.depth_mm as number,
    heightMM: r.height_mm as number,
    maxWeightKg: r.max_weight_kg as number,
    loadedHeightMM: (r.loaded_height_mm as number | null) ?? 1200,
  }));
}

export async function upsertPalletType(pt: PalletType) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO pallet_types (company_id, code, name, width_mm, depth_mm, height_mm, max_weight_kg, loaded_height_mm)
    VALUES (${cid}, ${pt.code}, ${pt.name}, ${pt.widthMM}, ${pt.depthMM}, ${pt.heightMM}, ${pt.maxWeightKg}, ${pt.loadedHeightMM ?? 1200})
    ON CONFLICT (company_id, code) DO UPDATE SET
      name             = EXCLUDED.name,
      width_mm         = EXCLUDED.width_mm,
      depth_mm         = EXCLUDED.depth_mm,
      height_mm        = EXCLUDED.height_mm,
      max_weight_kg    = EXCLUDED.max_weight_kg,
      loaded_height_mm = EXCLUDED.loaded_height_mm
  `;
}

export async function deletePalletType(code: string) {
  const cid = await getCompanyId();
  await sql`DELETE FROM pallet_types WHERE company_id = ${cid} AND code = ${code}`;
}

// ─── Production Plan ─────────────────────────────────────────────────────────

export async function loadProductionPlan(): Promise<ProductionPlan> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT product_code, qty FROM production_plan WHERE company_id = ${cid}
  `;
  const plan: ProductionPlan = {};
  for (const r of rows) plan[r.product_code as string] = r.qty as number;
  return plan;
}

export async function upsertProductionQty(productCode: string, qty: number) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO production_plan (company_id, product_code, qty)
    VALUES (${cid}, ${productCode}, ${qty})
    ON CONFLICT (company_id, product_code) DO UPDATE SET qty = EXCLUDED.qty
  `;
}

// ─── Daily Production Plan ───────────────────────────────────────────────────

export async function loadDailyProductionPlan(): Promise<DailyProductionPlan> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT product_code, date, qty FROM daily_production_plan WHERE company_id = ${cid}
  `;
  const plan: DailyProductionPlan = {};
  for (const r of rows) {
    if (!plan[r.product_code as string]) plan[r.product_code as string] = {};
    plan[r.product_code as string][r.date as string] = r.qty as number;
  }
  return plan;
}

export async function replaceAllDailyProductionPlan(dailyPlan: DailyProductionPlan) {
  const cid = await getCompanyId();
  await sql`DELETE FROM daily_production_plan WHERE company_id = ${cid}`;
  for (const [productCode, dates] of Object.entries(dailyPlan)) {
    for (const [date, qty] of Object.entries(dates)) {
      if (qty > 0) {
        await sql`
          INSERT INTO daily_production_plan (company_id, product_code, date, qty)
          VALUES (${cid}, ${productCode}, ${date}, ${qty})
        `;
      }
    }
  }
}

export async function upsertDailyProductionQty(productCode: string, date: string, qty: number) {
  const cid = await getCompanyId();
  if (qty > 0) {
    await sql`
      INSERT INTO daily_production_plan (company_id, product_code, date, qty)
      VALUES (${cid}, ${productCode}, ${date}, ${qty})
      ON CONFLICT (company_id, product_code, date) DO UPDATE SET qty = EXCLUDED.qty
    `;
  } else {
    await sql`
      DELETE FROM daily_production_plan
      WHERE company_id = ${cid} AND product_code = ${productCode} AND date = ${date}
    `;
  }
}

// ─── Baseline Stock（拠点別 基準在庫数） ───────────────────────────────────────

export async function loadBaselineStock(): Promise<BaselineStock> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT product_code, warehouse_code, qty FROM baseline_stock WHERE company_id = ${cid}
  `;
  const baseline: BaselineStock = {};
  for (const r of rows) {
    if (!baseline[r.product_code as string]) baseline[r.product_code as string] = {};
    baseline[r.product_code as string][r.warehouse_code as string] = r.qty as number;
  }
  return baseline;
}

export async function upsertBaseline(productCode: string, warehouseCode: string, qty: number) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO baseline_stock (company_id, product_code, warehouse_code, qty)
    VALUES (${cid}, ${productCode}, ${warehouseCode}, ${qty})
    ON CONFLICT (company_id, product_code, warehouse_code) DO UPDATE SET qty = EXCLUDED.qty
  `;
}

export async function replaceAllBaselineStock(baseline: BaselineStock) {
  const cid = await getCompanyId();
  await sql`DELETE FROM baseline_stock WHERE company_id = ${cid}`;
  for (const [pc, whs] of Object.entries(baseline)) {
    for (const [wc, qty] of Object.entries(whs)) {
      await sql`
        INSERT INTO baseline_stock (company_id, product_code, warehouse_code, qty)
        VALUES (${cid}, ${pc}, ${wc}, ${qty})
      `;
    }
  }
}

// ─── Inventory Stock ─────────────────────────────────────────────────────────

export async function loadInventoryStock(): Promise<InventoryStock> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT product_code, qty FROM inventory_stock WHERE company_id = ${cid}
  `;
  const stock: InventoryStock = {};
  for (const r of rows) stock[r.product_code as string] = r.qty as number;
  return stock;
}

export async function upsertInventoryStock(productCode: string, qty: number) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO inventory_stock (company_id, product_code, qty)
    VALUES (${cid}, ${productCode}, ${qty})
    ON CONFLICT (company_id, product_code) DO UPDATE SET qty = EXCLUDED.qty
  `;
}

export async function replaceAllInventoryStock(stock: InventoryStock) {
  const cid = await getCompanyId();
  await sql`DELETE FROM inventory_stock WHERE company_id = ${cid}`;
  for (const [product_code, qty] of Object.entries(stock)) {
    await sql`
      INSERT INTO inventory_stock (company_id, product_code, qty)
      VALUES (${cid}, ${product_code}, ${qty})
    `;
  }
}

// ─── Location Stock ──────────────────────────────────────────────────────────

export async function loadLocationStock(): Promise<LocationStock> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT product_code, warehouse_code, qty FROM location_stock WHERE company_id = ${cid}
  `;
  const stock: LocationStock = {};
  for (const r of rows) {
    if (!stock[r.product_code as string]) stock[r.product_code as string] = {};
    stock[r.product_code as string][r.warehouse_code as string] = r.qty as number;
  }
  return stock;
}

export async function upsertLocationStock(productCode: string, warehouseCode: string, qty: number) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO location_stock (company_id, product_code, warehouse_code, qty)
    VALUES (${cid}, ${productCode}, ${warehouseCode}, ${qty})
    ON CONFLICT (company_id, product_code, warehouse_code) DO UPDATE SET qty = EXCLUDED.qty
  `;
}

export async function replaceAllLocationStock(stock: LocationStock) {
  const cid = await getCompanyId();
  await sql`DELETE FROM location_stock WHERE company_id = ${cid}`;
  for (const [pc, whs] of Object.entries(stock)) {
    for (const [wc, qty] of Object.entries(whs)) {
      await sql`
        INSERT INTO location_stock (company_id, product_code, warehouse_code, qty)
        VALUES (${cid}, ${pc}, ${wc}, ${qty})
      `;
    }
  }
}

// ─── In-Transit Stock ────────────────────────────────────────────────────────

export async function loadInTransitStock(): Promise<InTransitStock> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT product_code, warehouse_code, qty FROM in_transit_stock WHERE company_id = ${cid}
  `;
  const stock: InTransitStock = {};
  for (const r of rows) {
    if (!stock[r.product_code as string]) stock[r.product_code as string] = {};
    stock[r.product_code as string][r.warehouse_code as string] = r.qty as number;
  }
  return stock;
}

export async function upsertInTransitStock(productCode: string, warehouseCode: string, qty: number) {
  const cid = await getCompanyId();
  if (qty === 0) {
    await sql`
      DELETE FROM in_transit_stock
      WHERE company_id = ${cid} AND product_code = ${productCode} AND warehouse_code = ${warehouseCode}
    `;
    return;
  }
  await sql`
    INSERT INTO in_transit_stock (company_id, product_code, warehouse_code, qty)
    VALUES (${cid}, ${productCode}, ${warehouseCode}, ${qty})
    ON CONFLICT (company_id, product_code, warehouse_code) DO UPDATE SET qty = EXCLUDED.qty
  `;
}

export async function replaceAllInTransitStock(stock: InTransitStock) {
  const cid = await getCompanyId();
  await sql`DELETE FROM in_transit_stock WHERE company_id = ${cid}`;
  for (const [pc, whs] of Object.entries(stock)) {
    for (const [wc, qty] of Object.entries(whs)) {
      if (qty > 0) {
        await sql`
          INSERT INTO in_transit_stock (company_id, product_code, warehouse_code, qty)
          VALUES (${cid}, ${pc}, ${wc}, ${qty})
        `;
      }
    }
  }
}

// ─── Planned Sales ───────────────────────────────────────────────────────────

export async function loadPlannedSales(): Promise<PlannedSales> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT product_code, warehouse_code, qty FROM planned_sales WHERE company_id = ${cid}
  `;
  const sales: PlannedSales = {};
  for (const r of rows) {
    if (!sales[r.product_code as string]) sales[r.product_code as string] = {};
    sales[r.product_code as string][r.warehouse_code as string] = r.qty as number;
  }
  return sales;
}

export async function upsertPlannedSales(productCode: string, warehouseCode: string, qty: number) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO planned_sales (company_id, product_code, warehouse_code, qty)
    VALUES (${cid}, ${productCode}, ${warehouseCode}, ${qty})
    ON CONFLICT (company_id, product_code, warehouse_code) DO UPDATE SET qty = EXCLUDED.qty
  `;
}

export async function replaceAllPlannedSales(sales: PlannedSales) {
  const cid = await getCompanyId();
  await sql`DELETE FROM planned_sales WHERE company_id = ${cid}`;
  for (const [pc, whs] of Object.entries(sales)) {
    for (const [wc, qty] of Object.entries(whs)) {
      if (qty > 0) {
        await sql`
          INSERT INTO planned_sales (company_id, product_code, warehouse_code, qty)
          VALUES (${cid}, ${pc}, ${wc}, ${qty})
        `;
      }
    }
  }
}

// ─── Weekly Shipping Schedule ────────────────────────────────────────────────

export async function loadWeeklyShippingSchedule(): Promise<WeeklyShippingSchedule> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT factory_code, warehouse_code, days FROM weekly_shipping_schedule WHERE company_id = ${cid}
  `;
  const schedule: WeeklyShippingSchedule = {};
  for (const r of rows) {
    if (!schedule[r.factory_code as string]) schedule[r.factory_code as string] = {};
    schedule[r.factory_code as string][r.warehouse_code as string] = r.days as boolean[];
  }
  return schedule;
}

export async function upsertShippingSchedule(factoryCode: string, warehouseCode: string, days: boolean[]) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO weekly_shipping_schedule (company_id, factory_code, warehouse_code, days)
    VALUES (${cid}, ${factoryCode}, ${warehouseCode}, ${days})
    ON CONFLICT (company_id, factory_code, warehouse_code) DO UPDATE SET days = EXCLUDED.days
  `;
}

// ─── Operating Days ──────────────────────────────────────────────────────────

export async function loadOperatingDays(): Promise<OperatingDays> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT factory_code, days FROM operating_days WHERE company_id = ${cid}
  `;
  const result: OperatingDays = {};
  for (const r of rows) result[r.factory_code as string] = r.days as boolean[];
  return result;
}

export async function upsertOperatingDays(factoryCode: string, days: boolean[]) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO operating_days (company_id, factory_code, days)
    VALUES (${cid}, ${factoryCode}, ${days})
    ON CONFLICT (company_id, factory_code) DO UPDATE SET days = EXCLUDED.days
  `;
}

// ─── Non-Working Dates（祝日・特別休業日） ────────────────────────────────────

export async function loadNonWorkingDates(): Promise<NonWorkingDates> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT factory_code, date FROM non_working_dates WHERE company_id = ${cid} ORDER BY date
  `;
  const result: NonWorkingDates = {};
  for (const r of rows) {
    if (!result[r.factory_code as string]) result[r.factory_code as string] = [];
    result[r.factory_code as string].push(r.date as string);
  }
  return result;
}

export async function addNonWorkingDate(factoryCode: string, date: string) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO non_working_dates (company_id, factory_code, date)
    VALUES (${cid}, ${factoryCode}, ${date})
    ON CONFLICT (company_id, factory_code, date) DO NOTHING
  `;
}

export async function removeNonWorkingDate(factoryCode: string, date: string) {
  const cid = await getCompanyId();
  await sql`
    DELETE FROM non_working_dates
    WHERE company_id = ${cid} AND factory_code = ${factoryCode} AND date = ${date}
  `;
}

// ─── 送り数手動上書き ─────────────────────────────────────────────────────────

export async function loadSendQtyManual(): Promise<SendQtyManual> {
  const cid = await getCompanyId();
  const rows = await sql`
    SELECT product_code, warehouse_code, qty FROM send_qty_manual WHERE company_id = ${cid}
  `;
  const result: SendQtyManual = {};
  for (const r of rows) {
    if (!result[r.product_code as string]) result[r.product_code as string] = {};
    result[r.product_code as string][r.warehouse_code as string] = r.qty as number;
  }
  return result;
}

export async function upsertSendQtyManual(productCode: string, warehouseCode: string, qty: number) {
  const cid = await getCompanyId();
  await sql`
    INSERT INTO send_qty_manual (company_id, product_code, warehouse_code, qty)
    VALUES (${cid}, ${productCode}, ${warehouseCode}, ${qty})
    ON CONFLICT (company_id, product_code, warehouse_code) DO UPDATE SET qty = EXCLUDED.qty
  `;
}

export async function deleteSendQtyManual(productCode: string, warehouseCode: string) {
  const cid = await getCompanyId();
  await sql`
    DELETE FROM send_qty_manual
    WHERE company_id = ${cid} AND product_code = ${productCode} AND warehouse_code = ${warehouseCode}
  `;
}

export async function replaceAllSendQtyManual(data: SendQtyManual) {
  const cid = await getCompanyId();
  await sql`DELETE FROM send_qty_manual WHERE company_id = ${cid}`;
  for (const [pc, whMap] of Object.entries(data)) {
    for (const [wc, qty] of Object.entries(whMap)) {
      if (qty > 0) {
        await sql`
          INSERT INTO send_qty_manual (company_id, product_code, warehouse_code, qty)
          VALUES (${cid}, ${pc}, ${wc}, ${qty})
        `;
      }
    }
  }
}

// ─── 初回デフォルトデータ投入（パレット・トラックタイプのみ） ─────────────────

import {
  DEFAULT_TRUCK_TYPES, DEFAULT_PALLET_TYPES,
} from './defaultData';

/**
 * 新規会社登録後に呼び出す。
 * パレットタイプ・トラックタイプのデフォルトデータのみ投入。
 * 工場・製品・倉庫はテナントが自分で登録する。
 */
export async function seedDefaultsForCompany(companyId: string): Promise<void> {
  const db = neon(process.env.DATABASE_URL!);

  // Truck types
  for (const t of DEFAULT_TRUCK_TYPES) {
    await db`
      INSERT INTO truck_types (company_id, code, name, max_pallets, cols, rows, width_mm, depth_mm, height_mm)
      VALUES (${companyId}, ${t.code}, ${t.name}, ${t.maxPallets}, ${t.cols}, ${t.rows}, ${t.widthMM}, ${t.depthMM}, ${t.heightMM ?? 2300})
      ON CONFLICT (company_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        max_pallets = EXCLUDED.max_pallets,
        cols        = EXCLUDED.cols,
        rows        = EXCLUDED.rows,
        width_mm    = EXCLUDED.width_mm,
        depth_mm    = EXCLUDED.depth_mm,
        height_mm   = EXCLUDED.height_mm
    `;
  }

  // Pallet types
  for (const p of DEFAULT_PALLET_TYPES) {
    await db`
      INSERT INTO pallet_types (company_id, code, name, width_mm, depth_mm, height_mm, max_weight_kg, loaded_height_mm)
      VALUES (${companyId}, ${p.code}, ${p.name}, ${p.widthMM}, ${p.depthMM}, ${p.heightMM}, ${p.maxWeightKg}, ${p.loadedHeightMM ?? 1200})
      ON CONFLICT (company_id, code) DO UPDATE SET
        name             = EXCLUDED.name,
        width_mm         = EXCLUDED.width_mm,
        depth_mm         = EXCLUDED.depth_mm,
        height_mm        = EXCLUDED.height_mm,
        max_weight_kg    = EXCLUDED.max_weight_kg,
        loaded_height_mm = EXCLUDED.loaded_height_mm
    `;
  }
}

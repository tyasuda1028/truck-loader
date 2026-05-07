/**
 * Supabase CRUD operations for all entities.
 * Each write function is fire-and-forget safe (throws on error for caller to handle).
 */
import { supabase } from './supabase';
import type {
  Factory, Product, Warehouse, TruckType, PalletType,
  ProductionPlan, DailyProductionPlan, DistributionRatios,
  InventoryStock, LocationStock, WeeklyShippingSchedule, InTransitStock, PlannedSales,
  OperatingDays, SendQtyManual, NonWorkingDates,
} from './types';

// ─── Factories ────────────────────────────────────────────────────────────────

export async function loadFactories(): Promise<Factory[]> {
  const { data, error } = await supabase.from('factories').select('*');
  if (error) throw error;
  return (data ?? []).map((r) => ({ code: r.code, name: r.name }));
}

export async function upsertFactory(f: Factory) {
  const { error } = await supabase.from('factories').upsert({ code: f.code, name: f.name });
  if (error) throw error;
}

export async function deleteFactory(code: string) {
  const { error } = await supabase.from('factories').delete().eq('code', code);
  if (error) throw error;
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function loadProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('*');
  if (error) throw error;
  // code が重複している場合は最初の出現を優先してフィルタ（DB側で重複が起きた場合の安全策）
  const seen = new Set<string>();
  return (data ?? [])
    .map((r) => ({
      code: r.code as string,
      name: r.name as string,
      capacityPerPallet: r.capacity_per_pallet as number,
      palletType: r.pallet_type as string,
      color: r.color as string,
      factoryCode: (r.factory_code as string | null) ?? 'F001',
      equipmentCategory: (r.equipment_category as string | null) ?? '',
      equipmentName: (r.equipment_name as string | null) ?? '',
      poji: (r.poji as boolean | null) ?? false,
      destination: (r.destination as string | null) ?? '',
      productionMethod: (r.production_method as string | null) ?? '',
      stackable: (r.stackable as boolean | null) ?? true,
      allowStackOnTop: (r.allow_stack_on_top as boolean | null) ?? true,
    }))
    .filter((p) => {
      if (seen.has(p.code)) return false;
      seen.add(p.code);
      return true;
    });
}

/**
 * DB 上の products テーブルの重複行（同一 code）を削除し、各 code 1 行にする。
 * 削除した重複件数（code の種類数）を返す。
 */
export async function deduplicateProducts(): Promise<number> {
  // 全行をロード
  const { data, error } = await supabase.from('products').select('*');
  if (error) throw error;

  const rows = data ?? [];
  // code ごとに最初の行を「残す行」として記録
  const keepByCode = new Map<string, typeof rows[0]>();
  const duplicatedCodes = new Set<string>();
  for (const row of rows) {
    if (keepByCode.has(row.code)) {
      duplicatedCodes.add(row.code);
    } else {
      keepByCode.set(row.code, row);
    }
  }
  if (duplicatedCodes.size === 0) return 0;

  // 重複がある code を1つずつ処理（全削除 → 1行だけ再挿入）
  for (const code of duplicatedCodes) {
    const { error: delErr } = await supabase.from('products').delete().eq('code', code);
    if (delErr) throw delErr;

    const keep = keepByCode.get(code)!;
    const { error: insErr } = await supabase.from('products').insert({
      code: keep.code,
      name: keep.name,
      capacity_per_pallet: keep.capacity_per_pallet,
      pallet_type: keep.pallet_type,
      color: keep.color,
      factory_code: keep.factory_code ?? 'F001',
      equipment_category: keep.equipment_category ?? '',
      equipment_name: keep.equipment_name ?? '',
      poji: keep.poji ?? false,
      destination: keep.destination ?? '',
      production_method: keep.production_method ?? '',
      stackable: keep.stackable ?? true,
      allow_stack_on_top: keep.allow_stack_on_top ?? true,
    });
    if (insErr) throw insErr;
  }

  return duplicatedCodes.size;
}

export async function upsertProduct(p: Product) {
  const { error } = await supabase.from('products').upsert(
    {
      code: p.code,
      name: p.name,
      capacity_per_pallet: p.capacityPerPallet,
      pallet_type: p.palletType,
      color: p.color,
      factory_code: p.factoryCode ?? 'F001',
      equipment_category: p.equipmentCategory ?? '',
      equipment_name: p.equipmentName ?? '',
      poji: p.poji ?? false,
      destination: p.destination ?? '',
      production_method: p.productionMethod ?? '',
      stackable: p.stackable ?? true,
      allow_stack_on_top: p.allowStackOnTop ?? true,
    },
    { onConflict: 'code' },
  );
  if (error) throw error;
}

export async function upsertProducts(products: Product[]) {
  const rows = products.map((p) => ({
    code: p.code,
    name: p.name,
    capacity_per_pallet: p.capacityPerPallet,
    pallet_type: p.palletType,
    color: p.color,
    factory_code: p.factoryCode ?? 'F001',
    equipment_category: p.equipmentCategory ?? '',
    equipment_name: p.equipmentName ?? '',
    poji: p.poji ?? false,
    destination: p.destination ?? '',
    production_method: p.productionMethod ?? '',
    stackable: p.stackable ?? true,
    allow_stack_on_top: p.allowStackOnTop ?? true,
  }));
  const { error } = await supabase.from('products').upsert(rows, { onConflict: 'code' });
  if (error) throw error;
}

export async function deleteProduct(code: string) {
  const { error } = await supabase.from('products').delete().eq('code', code);
  if (error) throw error;
}

// ─── Warehouses ──────────────────────────────────────────────────────────────

export async function loadWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase.from('warehouses').select('*');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    group: r.group as '東' | '西',
    truckType: r.truck_type,
    maxPallets: r.max_pallets,
  }));
}

export async function upsertWarehouse(w: Warehouse) {
  const { error } = await supabase.from('warehouses').upsert({
    code: w.code,
    name: w.name,
    group: w.group,
    truck_type: w.truckType,
    max_pallets: w.maxPallets,
  });
  if (error) throw error;
}

export async function deleteWarehouse(code: string) {
  const { error } = await supabase.from('warehouses').delete().eq('code', code);
  if (error) throw error;
}

// ─── Truck Types ─────────────────────────────────────────────────────────────

export async function loadTruckTypes(): Promise<TruckType[]> {
  const { data, error } = await supabase.from('truck_types').select('*');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    maxPallets: r.max_pallets,
    cols: r.cols,
    rows: r.rows,
    widthMM: r.width_mm,
    depthMM: r.depth_mm,
    heightMM: r.height_mm ?? 2300,
  }));
}

export async function upsertTruckType(t: TruckType) {
  const { error } = await supabase.from('truck_types').upsert({
    code: t.code,
    name: t.name,
    max_pallets: t.maxPallets,
    cols: t.cols,
    rows: t.rows,
    width_mm: t.widthMM,
    depth_mm: t.depthMM,
    height_mm: t.heightMM,
  });
  if (error) throw error;
}

export async function deleteTruckType(code: string) {
  const { error } = await supabase.from('truck_types').delete().eq('code', code);
  if (error) throw error;
}

// ─── Pallet Types ────────────────────────────────────────────────────────────

export async function loadPalletTypes(): Promise<PalletType[]> {
  const { data, error } = await supabase.from('pallet_types').select('*');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    widthMM: r.width_mm,
    depthMM: r.depth_mm,
    heightMM: r.height_mm,
    maxWeightKg: r.max_weight_kg,
    loadedHeightMM: r.loaded_height_mm ?? 1200,
  }));
}

export async function upsertPalletType(pt: PalletType) {
  const { error } = await supabase.from('pallet_types').upsert({
    code: pt.code,
    name: pt.name,
    width_mm: pt.widthMM,
    depth_mm: pt.depthMM,
    height_mm: pt.heightMM,
    max_weight_kg: pt.maxWeightKg,
    loaded_height_mm: pt.loadedHeightMM ?? 1200,
  });
  if (error) throw error;
}

export async function deletePalletType(code: string) {
  const { error } = await supabase.from('pallet_types').delete().eq('code', code);
  if (error) throw error;
}

// ─── Production Plan ─────────────────────────────────────────────────────────

export async function loadProductionPlan(): Promise<ProductionPlan> {
  const { data, error } = await supabase.from('production_plan').select('*');
  if (error) throw error;
  const plan: ProductionPlan = {};
  for (const r of data ?? []) plan[r.product_code] = r.qty;
  return plan;
}

export async function upsertProductionQty(productCode: string, qty: number) {
  const { error } = await supabase
    .from('production_plan')
    .upsert({ product_code: productCode, qty });
  if (error) throw error;
}

// ─── Daily Production Plan ───────────────────────────────────────────────────

export async function loadDailyProductionPlan(): Promise<DailyProductionPlan> {
  const { data, error } = await supabase.from('daily_production_plan').select('*');
  if (error) throw error;
  const plan: DailyProductionPlan = {};
  for (const r of data ?? []) {
    if (!plan[r.product_code]) plan[r.product_code] = {};
    plan[r.product_code][r.date] = r.qty;
  }
  return plan;
}

export async function replaceAllDailyProductionPlan(dailyPlan: DailyProductionPlan) {
  // Delete all then insert
  const { error: delErr } = await supabase
    .from('daily_production_plan')
    .delete()
    .neq('product_code', '___never___'); // delete all rows
  if (delErr) throw delErr;

  const rows: { product_code: string; date: string; qty: number }[] = [];
  for (const [productCode, dates] of Object.entries(dailyPlan)) {
    for (const [date, qty] of Object.entries(dates)) {
      if (qty > 0) rows.push({ product_code: productCode, date, qty });
    }
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('daily_production_plan').insert(rows);
    if (error) throw error;
  }
}

/** 日別生産計画を1件upsert（qty=0なら削除） */
export async function upsertDailyProductionQty(productCode: string, date: string, qty: number) {
  if (qty > 0) {
    const { error } = await supabase
      .from('daily_production_plan')
      .upsert({ product_code: productCode, date, qty });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('daily_production_plan')
      .delete()
      .eq('product_code', productCode)
      .eq('date', date);
    if (error) throw error;
  }
}

// ─── Distribution Ratios ─────────────────────────────────────────────────────

export async function loadDistributionRatios(): Promise<DistributionRatios> {
  const { data, error } = await supabase.from('distribution_ratios').select('*');
  if (error) throw error;
  const ratios: DistributionRatios = {};
  for (const r of data ?? []) {
    if (!ratios[r.product_code]) ratios[r.product_code] = {};
    ratios[r.product_code][r.warehouse_code] = r.ratio;
  }
  return ratios;
}

export async function upsertDistributionRatio(productCode: string, warehouseCode: string, ratio: number) {
  const { error } = await supabase.from('distribution_ratios').upsert({
    product_code: productCode,
    warehouse_code: warehouseCode,
    ratio,
  });
  if (error) throw error;
}

export async function replaceAllDistributionRatios(ratios: DistributionRatios) {
  const { error: delErr } = await supabase
    .from('distribution_ratios')
    .delete()
    .neq('product_code', '___never___');
  if (delErr) throw delErr;

  const rows: { product_code: string; warehouse_code: string; ratio: number }[] = [];
  for (const [pc, whs] of Object.entries(ratios)) {
    for (const [wc, ratio] of Object.entries(whs)) {
      rows.push({ product_code: pc, warehouse_code: wc, ratio });
    }
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('distribution_ratios').insert(rows);
    if (error) throw error;
  }
}

// ─── Inventory Stock ─────────────────────────────────────────────────────────

export async function loadInventoryStock(): Promise<InventoryStock> {
  const { data, error } = await supabase.from('inventory_stock').select('*');
  if (error) throw error;
  const stock: InventoryStock = {};
  for (const r of data ?? []) stock[r.product_code] = r.qty;
  return stock;
}

export async function upsertInventoryStock(productCode: string, qty: number) {
  const { error } = await supabase
    .from('inventory_stock')
    .upsert({ product_code: productCode, qty });
  if (error) throw error;
}

export async function replaceAllInventoryStock(stock: InventoryStock) {
  const { error: delErr } = await supabase
    .from('inventory_stock')
    .delete()
    .neq('product_code', '___never___');
  if (delErr) throw delErr;

  const rows = Object.entries(stock).map(([product_code, qty]) => ({ product_code, qty }));
  if (rows.length > 0) {
    const { error } = await supabase.from('inventory_stock').insert(rows);
    if (error) throw error;
  }
}

// ─── Location Stock ──────────────────────────────────────────────────────────

export async function loadLocationStock(): Promise<LocationStock> {
  const { data, error } = await supabase.from('location_stock').select('*');
  if (error) throw error;
  const stock: LocationStock = {};
  for (const r of data ?? []) {
    if (!stock[r.product_code]) stock[r.product_code] = {};
    stock[r.product_code][r.warehouse_code] = r.qty;
  }
  return stock;
}

export async function upsertLocationStock(productCode: string, warehouseCode: string, qty: number) {
  const { error } = await supabase.from('location_stock').upsert({
    product_code: productCode,
    warehouse_code: warehouseCode,
    qty,
  });
  if (error) throw error;
}

export async function replaceAllLocationStock(stock: LocationStock) {
  const { error: delErr } = await supabase
    .from('location_stock')
    .delete()
    .neq('product_code', '___never___');
  if (delErr) throw delErr;

  const rows: { product_code: string; warehouse_code: string; qty: number }[] = [];
  for (const [pc, whs] of Object.entries(stock)) {
    for (const [wc, qty] of Object.entries(whs)) {
      rows.push({ product_code: pc, warehouse_code: wc, qty });
    }
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('location_stock').insert(rows);
    if (error) throw error;
  }
}

// ─── In-Transit Stock ────────────────────────────────────────────────────────

export async function upsertInTransitStock(productCode: string, warehouseCode: string, qty: number) {
  if (qty === 0) {
    await supabase.from('in_transit_stock')
      .delete()
      .eq('product_code', productCode)
      .eq('warehouse_code', warehouseCode);
    return;
  }
  const { error } = await supabase.from('in_transit_stock').upsert({
    product_code: productCode,
    warehouse_code: warehouseCode,
    qty,
  });
  if (error) throw error;
}

export async function loadInTransitStock(): Promise<InTransitStock> {
  const { data, error } = await supabase.from('in_transit_stock').select('*');
  if (error) throw error;
  const stock: InTransitStock = {};
  for (const r of data ?? []) {
    if (!stock[r.product_code]) stock[r.product_code] = {};
    stock[r.product_code][r.warehouse_code] = r.qty;
  }
  return stock;
}

export async function replaceAllInTransitStock(stock: InTransitStock) {
  const { error: delErr } = await supabase
    .from('in_transit_stock')
    .delete()
    .neq('product_code', '___never___');
  if (delErr) throw delErr;

  const rows: { product_code: string; warehouse_code: string; qty: number }[] = [];
  for (const [pc, whs] of Object.entries(stock)) {
    for (const [wc, qty] of Object.entries(whs)) {
      if (qty > 0) rows.push({ product_code: pc, warehouse_code: wc, qty });
    }
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('in_transit_stock').insert(rows);
    if (error) throw error;
  }
}

// ─── Planned Sales ───────────────────────────────────────────────────────────

export async function loadPlannedSales(): Promise<PlannedSales> {
  const { data, error } = await supabase.from('planned_sales').select('*');
  if (error) throw error;
  const sales: PlannedSales = {};
  for (const r of data ?? []) {
    if (!sales[r.product_code]) sales[r.product_code] = {};
    sales[r.product_code][r.warehouse_code] = r.qty;
  }
  return sales;
}

export async function upsertPlannedSales(productCode: string, warehouseCode: string, qty: number) {
  const { error } = await supabase.from('planned_sales').upsert({
    product_code: productCode,
    warehouse_code: warehouseCode,
    qty,
  });
  if (error) throw error;
}

export async function replaceAllPlannedSales(sales: PlannedSales) {
  const { error: delErr } = await supabase
    .from('planned_sales')
    .delete()
    .neq('product_code', '___never___');
  if (delErr) throw delErr;

  const rows: { product_code: string; warehouse_code: string; qty: number }[] = [];
  for (const [pc, whs] of Object.entries(sales)) {
    for (const [wc, qty] of Object.entries(whs)) {
      if (qty > 0) rows.push({ product_code: pc, warehouse_code: wc, qty });
    }
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('planned_sales').insert(rows);
    if (error) throw error;
  }
}

// ─── Weekly Shipping Schedule ────────────────────────────────────────────────

export async function loadWeeklyShippingSchedule(): Promise<WeeklyShippingSchedule> {
  const { data, error } = await supabase.from('weekly_shipping_schedule').select('*');
  if (error) throw error;
  const schedule: WeeklyShippingSchedule = {};
  for (const r of data ?? []) {
    if (!schedule[r.factory_code]) schedule[r.factory_code] = {};
    schedule[r.factory_code][r.warehouse_code] = r.days as boolean[];
  }
  return schedule;
}

export async function upsertShippingSchedule(factoryCode: string, warehouseCode: string, days: boolean[]) {
  const { error } = await supabase.from('weekly_shipping_schedule').upsert({
    factory_code: factoryCode,
    warehouse_code: warehouseCode,
    days,
  });
  if (error) throw error;
}

// ─── Operating Days ──────────────────────────────────────────────────────────

export async function loadOperatingDays(): Promise<OperatingDays> {
  const { data, error } = await supabase.from('operating_days').select('*');
  if (error) throw error;
  const result: OperatingDays = {};
  for (const r of data ?? []) {
    result[r.factory_code] = r.days as boolean[];
  }
  return result;
}

export async function upsertOperatingDays(factoryCode: string, days: boolean[]) {
  const { error } = await supabase.from('operating_days').upsert({
    factory_code: factoryCode,
    days,
  });
  if (error) throw error;
}

// ─── Non-Working Dates（祝日・特別休業日） ────────────────────────────────────

export async function loadNonWorkingDates(): Promise<NonWorkingDates> {
  const { data, error } = await supabase.from('non_working_dates').select('*');
  if (error) throw error;
  const result: NonWorkingDates = {};
  for (const r of data ?? []) {
    if (!result[r.factory_code]) result[r.factory_code] = [];
    result[r.factory_code].push(r.date);
  }
  return result;
}

export async function addNonWorkingDate(factoryCode: string, date: string) {
  const { error } = await supabase.from('non_working_dates').upsert({
    factory_code: factoryCode,
    date,
  });
  if (error) throw error;
}

export async function removeNonWorkingDate(factoryCode: string, date: string) {
  const { error } = await supabase.from('non_working_dates').delete()
    .eq('factory_code', factoryCode).eq('date', date);
  if (error) throw error;
}

// ─── Seed (初回デフォルトデータ投入) ─────────────────────────────────────────

import {
  DEFAULT_FACTORIES, DEFAULT_PRODUCTS, DEFAULT_WAREHOUSES,
  DEFAULT_TRUCK_TYPES, DEFAULT_PALLET_TYPES,
  DEFAULT_PRODUCTION_PLAN, DEFAULT_DISTRIBUTION_RATIOS,
  DEFAULT_INVENTORY_STOCK,
} from './defaultData';

export async function seedDefaults() {
  // Factories
  await supabase.from('factories').upsert(
    DEFAULT_FACTORIES.map((f) => ({ code: f.code, name: f.name }))
  );

  // Products
  await supabase.from('products').upsert(
    DEFAULT_PRODUCTS.map((p) => ({
      code: p.code, name: p.name,
      capacity_per_pallet: p.capacityPerPallet,
      pallet_type: p.palletType,
      color: p.color,
      factory_code: p.factoryCode ?? 'F001',
    }))
  );

  // Warehouses
  await supabase.from('warehouses').upsert(
    DEFAULT_WAREHOUSES.map((w) => ({
      code: w.code, name: w.name, group: w.group,
      truck_type: w.truckType, max_pallets: w.maxPallets,
    }))
  );

  // Truck types
  await supabase.from('truck_types').upsert(
    DEFAULT_TRUCK_TYPES.map((t) => ({
      code: t.code, name: t.name, max_pallets: t.maxPallets,
      cols: t.cols, rows: t.rows, width_mm: t.widthMM, depth_mm: t.depthMM,
    }))
  );

  // Pallet types
  await supabase.from('pallet_types').upsert(
    DEFAULT_PALLET_TYPES.map((p) => ({
      code: p.code, name: p.name,
      width_mm: p.widthMM, depth_mm: p.depthMM,
      height_mm: p.heightMM, max_weight_kg: p.maxWeightKg,
    }))
  );

  // Production plan
  await supabase.from('production_plan').upsert(
    Object.entries(DEFAULT_PRODUCTION_PLAN).map(([product_code, qty]) => ({ product_code, qty }))
  );

  // Distribution ratios
  const ratioRows: { product_code: string; warehouse_code: string; ratio: number }[] = [];
  for (const [pc, whs] of Object.entries(DEFAULT_DISTRIBUTION_RATIOS)) {
    for (const [wc, ratio] of Object.entries(whs)) {
      ratioRows.push({ product_code: pc, warehouse_code: wc, ratio });
    }
  }
  await supabase.from('distribution_ratios').upsert(ratioRows);

  // Inventory stock
  await supabase.from('inventory_stock').upsert(
    Object.entries(DEFAULT_INVENTORY_STOCK).map(([product_code, qty]) => ({ product_code, qty }))
  );
}

// ─── 送り数手動上書き ─────────────────────────────────────────────────

export async function loadSendQtyManual(): Promise<SendQtyManual> {
  const { data, error } = await supabase.from('send_qty_manual').select('*');
  if (error) throw error;
  const result: SendQtyManual = {};
  for (const r of data ?? []) {
    if (!result[r.product_code]) result[r.product_code] = {};
    result[r.product_code][r.warehouse_code] = r.qty;
  }
  return result;
}

export async function upsertSendQtyManual(
  productCode: string, warehouseCode: string, qty: number,
) {
  const { error } = await supabase.from('send_qty_manual').upsert(
    { product_code: productCode, warehouse_code: warehouseCode, qty },
    { onConflict: 'product_code,warehouse_code' },
  );
  if (error) throw error;
}

export async function deleteSendQtyManual(productCode: string, warehouseCode: string) {
  const { error } = await supabase.from('send_qty_manual').delete()
    .eq('product_code', productCode).eq('warehouse_code', warehouseCode);
  if (error) throw error;
}

export async function replaceAllSendQtyManual(data: SendQtyManual) {
  await supabase.from('send_qty_manual').delete().neq('product_code', '');
  const rows: { product_code: string; warehouse_code: string; qty: number }[] = [];
  for (const [pc, whMap] of Object.entries(data)) {
    for (const [wc, qty] of Object.entries(whMap)) {
      if (qty > 0) rows.push({ product_code: pc, warehouse_code: wc, qty });
    }
  }
  if (rows.length > 0) {
    await supabase.from('send_qty_manual').insert(rows);
  }
}

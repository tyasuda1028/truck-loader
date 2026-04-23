/**
 * Supabase CRUD operations for all entities.
 * Each write function is fire-and-forget safe (throws on error for caller to handle).
 */
import { supabase } from './supabase';
import type {
  Factory, Product, Warehouse, TruckType, PalletType,
  ProductionPlan, DailyProductionPlan, DistributionRatios,
  InventoryStock, LocationStock, WeeklyShippingSchedule, InTransitStock, PlannedSales,
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
  return (data ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    capacityPerPallet: r.capacity_per_pallet,
    palletType: r.pallet_type,
    color: r.color,
    factoryCode: r.factory_code ?? 'F001',
  }));
}

export async function upsertProduct(p: Product) {
  const { error } = await supabase.from('products').upsert({
    code: p.code,
    name: p.name,
    capacity_per_pallet: p.capacityPerPallet,
    pallet_type: p.palletType,
    color: p.color,
    factory_code: p.factoryCode ?? 'F001',
  });
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
  }));
  const { error } = await supabase.from('products').upsert(rows);
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
  }));
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

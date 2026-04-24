import { create } from 'zustand';
import type {
  Factory, Product, Warehouse, TruckType, PalletType,
  ProductionPlan, DailyProductionPlan, DistributionRatios,
  InventoryStock, LocationStock, WeeklyShippingSchedule, InTransitStock, PlannedSales,
} from './types';
import {
  DEFAULT_FACTORIES,
  DEFAULT_PRODUCTS,
  DEFAULT_WAREHOUSES,
  DEFAULT_TRUCK_TYPES,
  DEFAULT_PALLET_TYPES,
  DEFAULT_PRODUCTION_PLAN,
  DEFAULT_DISTRIBUTION_RATIOS,
  DEFAULT_INVENTORY_STOCK,
  DEFAULT_LOCATION_STOCK,
  DEFAULT_SHIPPING_SCHEDULE,
} from './defaultData';
import * as db from './db';

interface AppState {
  // ─── ロード状態 ────────────────────────────────────────────
  isLoaded: boolean;

  // ─── マスタ ────────────────────────────────────────────────
  factories: Factory[];
  products: Product[];
  warehouses: Warehouse[];
  truckTypes: TruckType[];
  palletTypes: PalletType[];

  // ─── 入力データ ───────────────────────────────────────────
  productionPlan: ProductionPlan;
  dailyProductionPlan: DailyProductionPlan;
  distributionRatios: DistributionRatios;
  inventoryStock: InventoryStock;
  locationStock: LocationStock;
  weeklyShippingSchedule: WeeklyShippingSchedule;
  inTransitStock: InTransitStock;
  plannedSales: PlannedSales;

  // ─── アクション ───────────────────────────────────────────
  loadFromSupabase: () => Promise<void>;

  addFactory: (f: Factory) => void;
  updateFactory: (f: Factory) => void;
  removeFactory: (code: string) => void;

  setShippingDay: (factoryCode: string, warehouseCode: string, dayIndex: number, active: boolean) => void;
  setProductionQty: (productCode: string, qty: number) => void;
  setRatio: (productCode: string, warehouseCode: string, ratio: number) => void;
  importDistributionRatiosBulk: (ratios: DistributionRatios) => void;
  setInventoryStock: (productCode: string, qty: number) => void;
  setLocationStock: (productCode: string, warehouseCode: string, qty: number) => void;
  importProductionPlan: (dailyPlan: DailyProductionPlan, plan: ProductionPlan) => void;
  importInventoryStockBulk: (stock: InventoryStock) => void;
  importLocationStockBulk: (stock: LocationStock) => void;
  setPlannedSales: (productCode: string, warehouseCode: string, qty: number) => void;
  importPlannedSalesBulk: (sales: PlannedSales) => void;
  setInTransitStock: (productCode: string, warehouseCode: string, qty: number) => void;
  confirmShipment: (sendQty: Record<string, Record<string, number>>) => void;

  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  removeProduct: (productCode: string) => void;
  upsertProducts: (incoming: Product[]) => void;

  addWarehouse: (warehouse: Warehouse) => void;
  updateWarehouse: (warehouse: Warehouse) => void;
  removeWarehouse: (warehouseCode: string) => void;

  addPalletType: (palletType: PalletType) => void;
  updatePalletType: (palletType: PalletType) => void;
  removePalletType: (code: string) => void;

  resetToDefaults: () => void;
}

const defaultState = {
  isLoaded: false,
  factories: DEFAULT_FACTORIES,
  products: DEFAULT_PRODUCTS,
  warehouses: DEFAULT_WAREHOUSES,
  truckTypes: DEFAULT_TRUCK_TYPES,
  palletTypes: DEFAULT_PALLET_TYPES,
  productionPlan: DEFAULT_PRODUCTION_PLAN,
  dailyProductionPlan: {} as DailyProductionPlan,
  distributionRatios: DEFAULT_DISTRIBUTION_RATIOS,
  inventoryStock: DEFAULT_INVENTORY_STOCK,
  locationStock: DEFAULT_LOCATION_STOCK,
  weeklyShippingSchedule: DEFAULT_SHIPPING_SCHEDULE,
  inTransitStock: {} as InTransitStock,
  plannedSales: {} as PlannedSales,
};

export const useAppStore = create<AppState>()((set, get) => ({
  ...defaultState,

  // ─── Supabase からの初回ロード ──────────────────────────────
  loadFromSupabase: async () => {
    try {
      const [
        factories,
        products,
        warehouses,
        truckTypes,
        palletTypes,
        productionPlan,
        dailyProductionPlan,
        distributionRatios,
        inventoryStock,
        locationStock,
        weeklyShippingSchedule,
        inTransitStock,
        plannedSales,
      ] = await Promise.all([
        db.loadFactories(),
        db.loadProducts(),
        db.loadWarehouses(),
        db.loadTruckTypes(),
        db.loadPalletTypes(),
        db.loadProductionPlan(),
        db.loadDailyProductionPlan(),
        db.loadDistributionRatios(),
        db.loadInventoryStock(),
        db.loadLocationStock(),
        db.loadWeeklyShippingSchedule(),
        db.loadInTransitStock(),
        db.loadPlannedSales(),
      ]);

      // テーブルが空なら初期データを投入
      if (factories.length === 0) {
        await db.seedDefaults();
        set({ ...defaultState, isLoaded: true });
        return;
      }

      set({
        isLoaded: true,
        factories: factories.length > 0 ? factories : DEFAULT_FACTORIES,
        products: products.length > 0 ? products : DEFAULT_PRODUCTS,
        warehouses: warehouses.length > 0 ? warehouses : DEFAULT_WAREHOUSES,
        truckTypes: truckTypes.length > 0 ? truckTypes : DEFAULT_TRUCK_TYPES,
        palletTypes: palletTypes.length > 0 ? palletTypes : DEFAULT_PALLET_TYPES,
        productionPlan: Object.keys(productionPlan).length > 0 ? productionPlan : DEFAULT_PRODUCTION_PLAN,
        dailyProductionPlan,
        distributionRatios: Object.keys(distributionRatios).length > 0 ? distributionRatios : DEFAULT_DISTRIBUTION_RATIOS,
        inventoryStock: Object.keys(inventoryStock).length > 0 ? inventoryStock : DEFAULT_INVENTORY_STOCK,
        locationStock,
        weeklyShippingSchedule,
        inTransitStock,
        plannedSales,
      });
    } catch (err) {
      console.error('[Supabase] loadFromSupabase error:', err);
      // エラー時はデフォルト値で動作継続
      set({ isLoaded: true });
    }
  },

  // ─── 工場 ─────────────────────────────────────────────────
  addFactory: (f) => {
    set((s) => ({ factories: [...s.factories, f] }));
    db.upsertFactory(f).catch(console.error);
  },

  updateFactory: (f) => {
    set((s) => ({ factories: s.factories.map((x) => (x.code === f.code ? f : x)) }));
    db.upsertFactory(f).catch(console.error);
  },

  removeFactory: (code) => {
    set((s) => ({ factories: s.factories.filter((x) => x.code !== code) }));
    db.deleteFactory(code).catch(console.error);
  },

  // ─── 出荷スケジュール ──────────────────────────────────────
  setShippingDay: (factoryCode, warehouseCode, dayIndex, active) => {
    set((s) => {
      const schedule = s.weeklyShippingSchedule;
      const factorySchedule = schedule[factoryCode] ?? {};
      const days = factorySchedule[warehouseCode] ?? [false, false, false, false, false, false, false];
      const newDays = [...days] as boolean[];
      newDays[dayIndex] = active;
      const newSchedule = {
        ...schedule,
        [factoryCode]: { ...factorySchedule, [warehouseCode]: newDays },
      };
      db.upsertShippingSchedule(factoryCode, warehouseCode, newDays).catch(console.error);
      return { weeklyShippingSchedule: newSchedule };
    });
  },

  // ─── 生産計画 ─────────────────────────────────────────────
  setProductionQty: (productCode, qty) => {
    set((s) => ({ productionPlan: { ...s.productionPlan, [productCode]: qty } }));
    db.upsertProductionQty(productCode, qty).catch(console.error);
  },

  importProductionPlan: (dailyPlan, plan) => {
    set(() => ({ dailyProductionPlan: dailyPlan, productionPlan: plan }));
    // DB: 日別計画を全件置換、週間計画を upsert
    db.replaceAllDailyProductionPlan(dailyPlan).catch(console.error);
    Promise.all(
      Object.entries(plan).map(([code, qty]) => db.upsertProductionQty(code, qty))
    ).catch(console.error);
  },

  // ─── 配分比率 ─────────────────────────────────────────────
  setRatio: (productCode, warehouseCode, ratio) => {
    set((s) => ({
      distributionRatios: {
        ...s.distributionRatios,
        [productCode]: { ...s.distributionRatios[productCode], [warehouseCode]: ratio },
      },
    }));
    db.upsertDistributionRatio(productCode, warehouseCode, ratio).catch(console.error);
  },

  importDistributionRatiosBulk: (ratios) => {
    set(() => ({ distributionRatios: ratios }));
    db.replaceAllDistributionRatios(ratios).catch(console.error);
  },

  // ─── 在庫 ─────────────────────────────────────────────────
  setInventoryStock: (productCode, qty) => {
    set((s) => ({ inventoryStock: { ...s.inventoryStock, [productCode]: qty } }));
    db.upsertInventoryStock(productCode, qty).catch(console.error);
  },

  importInventoryStockBulk: (stock) => {
    set(() => ({ inventoryStock: stock }));
    db.replaceAllInventoryStock(stock).catch(console.error);
  },

  importLocationStockBulk: (stock) => {
    set(() => ({ locationStock: stock }));
    db.replaceAllLocationStock(stock).catch(console.error);
  },

  setPlannedSales: (productCode, warehouseCode, qty) => {
    set((s) => ({
      plannedSales: {
        ...s.plannedSales,
        [productCode]: { ...s.plannedSales[productCode], [warehouseCode]: qty },
      },
    }));
    db.upsertPlannedSales(productCode, warehouseCode, qty).catch(console.error);
  },

  importPlannedSalesBulk: (sales) => {
    set(() => ({ plannedSales: sales }));
    db.replaceAllPlannedSales(sales).catch(console.error);
  },

  setInTransitStock: (productCode, warehouseCode, qty) => {
    set((s) => ({
      inTransitStock: {
        ...s.inTransitStock,
        [productCode]: { ...s.inTransitStock[productCode], [warehouseCode]: qty },
      },
    }));
    db.upsertInTransitStock(productCode, warehouseCode, qty).catch(console.error);
  },

  confirmShipment: (sendQty) => {
    set(() => ({ inTransitStock: sendQty }));
    db.replaceAllInTransitStock(sendQty).catch(console.error);
  },

  setLocationStock: (productCode, warehouseCode, qty) => {
    set((s) => ({
      locationStock: {
        ...s.locationStock,
        [productCode]: { ...s.locationStock[productCode], [warehouseCode]: qty },
      },
    }));
    db.upsertLocationStock(productCode, warehouseCode, qty).catch(console.error);
  },

  // ─── 製品 ─────────────────────────────────────────────────
  addProduct: (product) => {
    set((s) => ({ products: [...s.products, product] }));
    db.upsertProduct(product).catch(console.error);
  },

  updateProduct: (product) => {
    set((s) => ({ products: s.products.map((p) => (p.code === product.code ? product : p)) }));
    db.upsertProduct(product).catch(console.error);
  },

  removeProduct: (productCode) => {
    set((s) => ({ products: s.products.filter((p) => p.code !== productCode) }));
    db.deleteProduct(productCode).catch(console.error);
  },

  upsertProducts: (incoming) => {
    set((s) => {
      const map = Object.fromEntries(s.products.map((p) => [p.code, p]));
      for (const p of incoming) map[p.code] = p;
      const existingCodes = new Set(s.products.map((p) => p.code));
      const updated = s.products.map((p) => map[p.code]);
      const added = incoming.filter((p) => !existingCodes.has(p.code));
      return { products: [...updated, ...added] };
    });
    db.upsertProducts(incoming).catch(console.error);
  },

  // ─── 拠点 ─────────────────────────────────────────────────
  addWarehouse: (warehouse) => {
    set((s) => ({ warehouses: [...s.warehouses, warehouse] }));
    db.upsertWarehouse(warehouse).catch(console.error);
  },

  updateWarehouse: (warehouse) => {
    set((s) => ({ warehouses: s.warehouses.map((w) => (w.code === warehouse.code ? warehouse : w)) }));
    db.upsertWarehouse(warehouse).catch(console.error);
  },

  removeWarehouse: (warehouseCode) => {
    set((s) => ({ warehouses: s.warehouses.filter((w) => w.code !== warehouseCode) }));
    db.deleteWarehouse(warehouseCode).catch(console.error);
  },

  // ─── パレット種別 ─────────────────────────────────────────
  addPalletType: (palletType) => {
    set((s) => ({ palletTypes: [...s.palletTypes, palletType] }));
    db.upsertPalletType(palletType).catch(console.error);
  },

  updatePalletType: (palletType) => {
    set((s) => ({ palletTypes: s.palletTypes.map((p) => (p.code === palletType.code ? palletType : p)) }));
    db.upsertPalletType(palletType).catch(console.error);
  },

  removePalletType: (code) => {
    set((s) => ({ palletTypes: s.palletTypes.filter((p) => p.code !== code) }));
    db.deletePalletType(code).catch(console.error);
  },

  // ─── リセット ─────────────────────────────────────────────
  resetToDefaults: () => {
    set({ ...defaultState, isLoaded: true });
    db.seedDefaults().catch(console.error);
  },
}));

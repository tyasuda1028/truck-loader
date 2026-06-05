import { create } from 'zustand';
import type {
  Factory, Product, Warehouse, TruckType, PalletType,
  ProductionPlan, DailyProductionPlan, BaselineStock,
  InventoryStock, LocationStock, WeeklyShippingSchedule, InTransitStock, PlannedSales,
  OperatingDays, SendQtyManual, NonWorkingDates,
} from './types';
import {
  DEFAULT_TRUCK_TYPES,
  DEFAULT_PALLET_TYPES,
  DEFAULT_PRODUCTION_PLAN,
  DEFAULT_BASELINE_STOCK,
  DEFAULT_INVENTORY_STOCK,
  DEFAULT_LOCATION_STOCK,
  DEFAULT_SHIPPING_SCHEDULE,
  DEFAULT_OPERATING_DAYS,
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
  baselineStock: BaselineStock;
  inventoryStock: InventoryStock;
  locationStock: LocationStock;
  weeklyShippingSchedule: WeeklyShippingSchedule;
  operatingDays: OperatingDays;
  nonWorkingDates: NonWorkingDates;
  inTransitStock: InTransitStock;
  plannedSales: PlannedSales;
  sendQtyManual: SendQtyManual;

  // ─── アクション ───────────────────────────────────────────
  loadFromDB: () => Promise<void>;
  loadSampleData: () => Promise<boolean>;

  addFactory: (f: Factory) => void;
  updateFactory: (f: Factory) => void;
  removeFactory: (code: string) => void;

  setShippingDay: (factoryCode: string, warehouseCode: string, dayIndex: number, active: boolean) => void;
  setOperatingDay: (factoryCode: string, dayIndex: number, active: boolean) => void;
  toggleNonWorkingDate: (factoryCode: string, date: string) => void;
  setProductionQty: (productCode: string, qty: number) => void;
  setBaseline: (productCode: string, warehouseCode: string, qty: number) => void;
  importBaselineStockBulk: (baseline: BaselineStock) => void;
  clearBaselineStock: () => void;
  setInventoryStock: (productCode: string, qty: number) => void;
  setLocationStock: (productCode: string, warehouseCode: string, qty: number) => void;
  setProductionDays: (productCode: string, dateQtyMap: Record<string, number>) => void;
  importProductionPlan: (dailyPlan: DailyProductionPlan, plan: ProductionPlan) => void;
  clearProductionPlan: () => void;
  importInventoryStockBulk: (stock: InventoryStock) => void;
  importLocationStockBulk: (stock: LocationStock) => void;
  clearLocationStock: () => void;
  setPlannedSales: (productCode: string, warehouseCode: string, qty: number) => void;
  importPlannedSalesBulk: (sales: PlannedSales) => void;
  clearPlannedSales: () => void;
  setInTransitStock: (productCode: string, warehouseCode: string, qty: number) => void;
  importInTransitStockBulk: (stock: InTransitStock) => void;
  clearInTransitStock: () => void;
  confirmShipment: (sendQty: Record<string, Record<string, number>>) => void;

  setSendQtyManual: (productCode: string, warehouseCode: string, qty: number) => void;
  clearSendQtyManualCell: (productCode: string, warehouseCode: string) => void;
  importSendQtyManualBulk: (data: SendQtyManual) => void;
  clearSendQtyManual: () => void;

  addProduct: (product: Product) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  removeProduct: (productCode: string) => Promise<void>;
  upsertProducts: (incoming: Product[]) => Promise<void>;

  addWarehouse: (warehouse: Warehouse) => void;
  updateWarehouse: (warehouse: Warehouse) => void;
  removeWarehouse: (warehouseCode: string) => void;

  addTruckType: (truckType: TruckType) => void;
  updateTruckType: (truckType: TruckType) => void;
  removeTruckType: (code: string) => void;

  addPalletType: (palletType: PalletType) => void;
  updatePalletType: (palletType: PalletType) => void;
  removePalletType: (code: string) => void;

  resetToDefaults: () => void;
}

const defaultState = {
  isLoaded: false,
  factories: [] as Factory[],
  products: [] as Product[],
  warehouses: [] as Warehouse[],
  truckTypes: DEFAULT_TRUCK_TYPES,
  palletTypes: DEFAULT_PALLET_TYPES,
  productionPlan: DEFAULT_PRODUCTION_PLAN,
  dailyProductionPlan: {} as DailyProductionPlan,
  baselineStock: DEFAULT_BASELINE_STOCK,
  inventoryStock: DEFAULT_INVENTORY_STOCK,
  locationStock: DEFAULT_LOCATION_STOCK,
  weeklyShippingSchedule: DEFAULT_SHIPPING_SCHEDULE,
  operatingDays: DEFAULT_OPERATING_DAYS,
  nonWorkingDates: {} as NonWorkingDates,
  inTransitStock: {} as InTransitStock,
  plannedSales: {} as PlannedSales,
  sendQtyManual: {} as SendQtyManual,
};

export const useAppStore = create<AppState>()((set, get) => ({
  ...defaultState,

  // ─── DB からの初回ロード ──────────────────────────────
  loadFromDB: async () => {
    try {
      const [
        factories,
        products,
        warehouses,
        truckTypes,
        palletTypes,
        productionPlan,
        dailyProductionPlan,
        baselineStock,
        inventoryStock,
        locationStock,
        weeklyShippingSchedule,
        operatingDays,
        nonWorkingDates,
        inTransitStock,
        plannedSales,
        sendQtyManual,
      ] = await Promise.all([
        db.loadFactories(),
        db.loadProducts(),
        db.loadWarehouses(),
        db.loadTruckTypes(),
        db.loadPalletTypes(),
        db.loadProductionPlan(),
        db.loadDailyProductionPlan(),
        db.loadBaselineStock(),
        db.loadInventoryStock(),
        db.loadLocationStock(),
        db.loadWeeklyShippingSchedule(),
        db.loadOperatingDays(),
        db.loadNonWorkingDates().catch(() => ({} as NonWorkingDates)),
        db.loadInTransitStock(),
        db.loadPlannedSales(),
        db.loadSendQtyManual().catch(() => ({} as SendQtyManual)),
      ]);

      // DBから読み込んだ内容をそのまま使う（テナントが自分で登録）
      set({
        isLoaded: true,
        factories,
        products,
        warehouses,
        truckTypes,
        palletTypes,
        productionPlan,
        dailyProductionPlan,
        baselineStock,
        inventoryStock,
        locationStock,
        weeklyShippingSchedule,
        operatingDays,
        nonWorkingDates,
        inTransitStock,
        plannedSales,
        sendQtyManual,
      });
    } catch (err) {
      console.error('[DB] loadFromDB error:', err);
      // エラー時はデフォルト値で動作継続
      set({ isLoaded: true });
    }
  },

  // ─── サンプルデータ投入（オンボーディング）───────────────────
  // 既存データが無い場合のみ投入。投入後に再ロード。戻り値=実際に投入したか
  loadSampleData: async () => {
    const { seeded } = await db.seedSampleDataForCompany();
    if (seeded) await get().loadFromDB();
    return seeded;
  },

  // ─── 稼働日マスター ────────────────────────────────────────
  setOperatingDay: (factoryCode, dayIndex, active) => {
    set((s) => {
      const current = s.operatingDays[factoryCode] ?? [true, true, true, true, true, false, false];
      const newDays = [...current] as boolean[];
      newDays[dayIndex] = active;
      const newOperatingDays = { ...s.operatingDays, [factoryCode]: newDays };
      db.upsertOperatingDays(factoryCode, newDays).catch(console.error);
      return { operatingDays: newOperatingDays };
    });
  },

  toggleNonWorkingDate: (factoryCode, date) => {
    set((s) => {
      const current = s.nonWorkingDates[factoryCode] ?? [];
      const isNonWorking = current.includes(date);
      const updated = isNonWorking
        ? current.filter((d) => d !== date)
        : [...current, date];
      if (isNonWorking) {
        db.removeNonWorkingDate(factoryCode, date).catch(console.error);
      } else {
        db.addNonWorkingDate(factoryCode, date).catch(console.error);
      }
      return { nonWorkingDates: { ...s.nonWorkingDates, [factoryCode]: updated } };
    });
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
  setProductionDays: (productCode, dateQtyMap) => {
    let newTotal = 0;
    set((s) => {
      const productDates = { ...(s.dailyProductionPlan[productCode] ?? {}) };
      for (const [date, qty] of Object.entries(dateQtyMap)) {
        if (qty > 0) productDates[date] = qty;
        else delete productDates[date];
      }
      newTotal = Object.values(productDates).reduce((sum, v) => sum + v, 0);
      return {
        dailyProductionPlan: { ...s.dailyProductionPlan, [productCode]: productDates },
        productionPlan: { ...s.productionPlan, [productCode]: newTotal },
      };
    });
    Promise.all([
      ...Object.entries(dateQtyMap).map(([date, qty]) =>
        db.upsertDailyProductionQty(productCode, date, qty)
      ),
      db.upsertProductionQty(productCode, newTotal),
    ]).catch(console.error);
  },

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

  clearProductionPlan: () => {
    const { products } = get();
    const emptyPlan = Object.fromEntries(products.map((p) => [p.code, 0]));
    set(() => ({ productionPlan: emptyPlan, dailyProductionPlan: {} }));
    db.replaceAllDailyProductionPlan({}).catch(console.error);
    Promise.all(products.map((p) => db.upsertProductionQty(p.code, 0))).catch(console.error);
  },

  // ─── 拠点別 基準在庫数 ────────────────────────────────────
  setBaseline: (productCode, warehouseCode, qty) => {
    set((s) => ({
      baselineStock: {
        ...s.baselineStock,
        [productCode]: { ...s.baselineStock[productCode], [warehouseCode]: qty },
      },
    }));
    db.upsertBaseline(productCode, warehouseCode, qty).catch(console.error);
  },

  importBaselineStockBulk: (baseline) => {
    set(() => ({ baselineStock: baseline }));
    db.replaceAllBaselineStock(baseline).catch(console.error);
  },

  clearBaselineStock: () => {
    set(() => ({ baselineStock: {} }));
    db.replaceAllBaselineStock({}).catch(console.error);
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

  clearLocationStock: () => {
    set(() => ({ locationStock: {} }));
    db.replaceAllLocationStock({}).catch(console.error);
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

  clearPlannedSales: () => {
    set(() => ({ plannedSales: {} }));
    db.replaceAllPlannedSales({}).catch(console.error);
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

  importInTransitStockBulk: (stock) => {
    set(() => ({ inTransitStock: stock }));
    db.replaceAllInTransitStock(stock).catch(console.error);
  },

  clearInTransitStock: () => {
    set(() => ({ inTransitStock: {} }));
    db.replaceAllInTransitStock({}).catch(console.error);
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
  // DBへの書き込みを先に await し、成功した場合のみメモリ state を更新する。
  // 失敗時はエラーを呼び出し側に throw するので、UI で握りつぶさず表示できる。
  addProduct: async (product) => {
    await db.upsertProduct(product);
    set((s) => ({ products: [...s.products, product] }));
  },

  updateProduct: async (product) => {
    await db.upsertProduct(product);
    set((s) => ({ products: s.products.map((p) => (p.code === product.code ? product : p)) }));
  },

  removeProduct: async (productCode) => {
    await db.deleteProduct(productCode);
    set((s) => ({ products: s.products.filter((p) => p.code !== productCode) }));
  },

  upsertProducts: async (incoming) => {
    // DBへの書き込みを先に実行し、成功した場合のみメモリ上の state を更新する。
    // これにより DB エラーが silent に握りつぶされず、呼び出し側が catch して
    // ユーザーに伝えられる。リロード時に in-memory と DB が乖離するのも防げる。
    await db.upsertProducts(incoming);
    set((s) => {
      const map = Object.fromEntries(s.products.map((p) => [p.code, p]));
      for (const p of incoming) map[p.code] = p;
      const existingCodes = new Set(s.products.map((p) => p.code));
      const updated = s.products.map((p) => map[p.code]);
      const added = incoming.filter((p) => !existingCodes.has(p.code));
      return { products: [...updated, ...added] };
    });
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

  // ─── トラック種別 ─────────────────────────────────────────
  addTruckType: (truckType) => {
    set((s) => ({ truckTypes: [...s.truckTypes, truckType] }));
    db.upsertTruckType(truckType).catch(console.error);
  },

  updateTruckType: (truckType) => {
    set((s) => ({ truckTypes: s.truckTypes.map((t) => (t.code === truckType.code ? truckType : t)) }));
    db.upsertTruckType(truckType).catch(console.error);
  },

  removeTruckType: (code) => {
    set((s) => ({ truckTypes: s.truckTypes.filter((t) => t.code !== code) }));
    db.deleteTruckType(code).catch(console.error);
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

  // ─── 送り数手動上書き ─────────────────────────────────────
  setSendQtyManual: (productCode, warehouseCode, qty) => {
    set((s) => ({
      sendQtyManual: {
        ...s.sendQtyManual,
        [productCode]: { ...s.sendQtyManual[productCode], [warehouseCode]: qty },
      },
    }));
    db.upsertSendQtyManual(productCode, warehouseCode, qty).catch(console.error);
  },
  clearSendQtyManualCell: (productCode, warehouseCode) => {
    set((s) => {
      const newMap = { ...s.sendQtyManual };
      if (newMap[productCode]) {
        const newWh = { ...newMap[productCode] };
        delete newWh[warehouseCode];
        newMap[productCode] = newWh;
      }
      return { sendQtyManual: newMap };
    });
    db.deleteSendQtyManual(productCode, warehouseCode).catch(console.error);
  },
  importSendQtyManualBulk: (data) => {
    set(() => ({ sendQtyManual: data }));
    db.replaceAllSendQtyManual(data).catch(console.error);
  },
  clearSendQtyManual: () => {
    set(() => ({ sendQtyManual: {} }));
    db.replaceAllSendQtyManual({}).catch(console.error);
  },

  // ─── リセット ─────────────────────────────────────────────
  resetToDefaults: () => {
    set({ ...defaultState, isLoaded: true });
  },
}));

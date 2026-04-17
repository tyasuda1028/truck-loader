import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, Warehouse, TruckType, PalletType, ProductionPlan, DailyProductionPlan, DistributionRatios, InventoryStock, LocationStock } from './types';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_WAREHOUSES,
  DEFAULT_TRUCK_TYPES,
  DEFAULT_PALLET_TYPES,
  DEFAULT_PRODUCTION_PLAN,
  DEFAULT_DISTRIBUTION_RATIOS,
  DEFAULT_INVENTORY_STOCK,
  DEFAULT_LOCATION_STOCK,
} from './defaultData';

interface AppState {
  products: Product[];
  warehouses: Warehouse[];
  truckTypes: TruckType[];
  palletTypes: PalletType[];
  productionPlan: ProductionPlan;
  dailyProductionPlan: DailyProductionPlan;
  distributionRatios: DistributionRatios;
  inventoryStock: InventoryStock;
  locationStock: LocationStock;

  // actions
  setProductionQty: (productCode: string, qty: number) => void;
  setRatio: (productCode: string, warehouseCode: string, ratio: number) => void;
  setInventoryStock: (productCode: string, qty: number) => void;
  setLocationStock: (productCode: string, warehouseCode: string, qty: number) => void;
  importProductionPlan: (dailyPlan: DailyProductionPlan, plan: ProductionPlan) => void;
  importInventoryStockBulk: (stock: InventoryStock) => void;
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  removeProduct: (productCode: string) => void;
  addWarehouse: (warehouse: Warehouse) => void;
  updateWarehouse: (warehouse: Warehouse) => void;
  removeWarehouse: (warehouseCode: string) => void;
  addPalletType: (palletType: PalletType) => void;
  updatePalletType: (palletType: PalletType) => void;
  removePalletType: (code: string) => void;
  upsertProducts: (incoming: Product[]) => void;
  resetToDefaults: () => void;
}

const defaultState = {
  products: DEFAULT_PRODUCTS,
  warehouses: DEFAULT_WAREHOUSES,
  truckTypes: DEFAULT_TRUCK_TYPES,
  palletTypes: DEFAULT_PALLET_TYPES,
  productionPlan: DEFAULT_PRODUCTION_PLAN,
  dailyProductionPlan: {} as DailyProductionPlan,
  distributionRatios: DEFAULT_DISTRIBUTION_RATIOS,
  inventoryStock: DEFAULT_INVENTORY_STOCK,
  locationStock: DEFAULT_LOCATION_STOCK,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...defaultState,

      setProductionQty: (productCode, qty) =>
        set((s) => ({
          productionPlan: { ...s.productionPlan, [productCode]: qty },
        })),

      setRatio: (productCode, warehouseCode, ratio) =>
        set((s) => ({
          distributionRatios: {
            ...s.distributionRatios,
            [productCode]: {
              ...s.distributionRatios[productCode],
              [warehouseCode]: ratio,
            },
          },
        })),

      setInventoryStock: (productCode, qty) =>
        set((s) => ({
          inventoryStock: { ...s.inventoryStock, [productCode]: qty },
        })),

      setLocationStock: (productCode, warehouseCode, qty) =>
        set((s) => ({
          locationStock: {
            ...s.locationStock,
            [productCode]: {
              ...s.locationStock[productCode],
              [warehouseCode]: qty,
            },
          },
        })),

      importProductionPlan: (dailyPlan, plan) =>
        set(() => ({
          dailyProductionPlan: dailyPlan,
          productionPlan: plan,
        })),

      importInventoryStockBulk: (stock) =>
        set(() => ({ inventoryStock: stock })),

      addProduct: (product) =>
        set((s) => ({ products: [...s.products, product] })),

      updateProduct: (product) =>
        set((s) => ({
          products: s.products.map((p) => (p.code === product.code ? product : p)),
        })),

      removeProduct: (productCode) =>
        set((s) => ({
          products: s.products.filter((p) => p.code !== productCode),
        })),

      addWarehouse: (warehouse) =>
        set((s) => ({ warehouses: [...s.warehouses, warehouse] })),

      updateWarehouse: (warehouse) =>
        set((s) => ({
          warehouses: s.warehouses.map((w) =>
            w.code === warehouse.code ? warehouse : w,
          ),
        })),

      removeWarehouse: (warehouseCode) =>
        set((s) => ({
          warehouses: s.warehouses.filter((w) => w.code !== warehouseCode),
        })),

      addPalletType: (palletType) =>
        set((s) => ({ palletTypes: [...s.palletTypes, palletType] })),

      updatePalletType: (palletType) =>
        set((s) => ({
          palletTypes: s.palletTypes.map((p) =>
            p.code === palletType.code ? palletType : p,
          ),
        })),

      removePalletType: (code) =>
        set((s) => ({
          palletTypes: s.palletTypes.filter((p) => p.code !== code),
        })),

      upsertProducts: (incoming) =>
        set((s) => {
          const map = Object.fromEntries(s.products.map((p) => [p.code, p]));
          for (const p of incoming) map[p.code] = p;
          // 既存の順序を保ちつつ新規を末尾に追加
          const existingCodes = new Set(s.products.map((p) => p.code));
          const updated = s.products.map((p) => map[p.code]);
          const added = incoming.filter((p) => !existingCodes.has(p.code));
          return { products: [...updated, ...added] };
        }),

      resetToDefaults: () => set(defaultState),
    }),
    { name: 'truck-loader-store' },
  ),
);

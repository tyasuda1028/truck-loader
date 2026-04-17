import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, Warehouse, TruckType, ProductionPlan, DistributionRatios, InventoryStock, LocationStock } from './types';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_WAREHOUSES,
  DEFAULT_TRUCK_TYPES,
  DEFAULT_PRODUCTION_PLAN,
  DEFAULT_DISTRIBUTION_RATIOS,
  DEFAULT_INVENTORY_STOCK,
  DEFAULT_LOCATION_STOCK,
} from './defaultData';

interface AppState {
  products: Product[];
  warehouses: Warehouse[];
  truckTypes: TruckType[];
  productionPlan: ProductionPlan;
  distributionRatios: DistributionRatios;
  inventoryStock: InventoryStock;
  locationStock: LocationStock;

  // actions
  setProductionQty: (productCode: string, qty: number) => void;
  setRatio: (productCode: string, warehouseCode: string, ratio: number) => void;
  setInventoryStock: (productCode: string, qty: number) => void;
  setLocationStock: (productCode: string, warehouseCode: string, qty: number) => void;
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  removeProduct: (productCode: string) => void;
  addWarehouse: (warehouse: Warehouse) => void;
  updateWarehouse: (warehouse: Warehouse) => void;
  removeWarehouse: (warehouseCode: string) => void;
  resetToDefaults: () => void;
}

const defaultState = {
  products: DEFAULT_PRODUCTS,
  warehouses: DEFAULT_WAREHOUSES,
  truckTypes: DEFAULT_TRUCK_TYPES,
  productionPlan: DEFAULT_PRODUCTION_PLAN,
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

      resetToDefaults: () => set(defaultState),
    }),
    { name: 'truck-loader-store' },
  ),
);

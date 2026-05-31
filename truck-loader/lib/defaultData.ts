import type { TruckType, PalletType, ProductionPlan, BaselineStock, InventoryStock, LocationStock, WeeklyShippingSchedule, OperatingDays } from './types';

// 工場・製品・倉庫はテナントが自分で登録するため、デフォルトデータなし

export const DEFAULT_PALLET_TYPES: PalletType[] = [
  { code: 'P01', name: '標準パレット(1100)',  widthMM: 1100, depthMM: 1100, heightMM: 144, maxWeightKg: 1000, loadedHeightMM: 1200 },
  { code: 'P02', name: '大型パレット(1200)',  widthMM: 1200, depthMM: 1000, heightMM: 144, maxWeightKg: 1000, loadedHeightMM: 1200 },
  { code: 'P03', name: '軽量パレット(800)',   widthMM:  800, depthMM: 1100, heightMM: 120, maxWeightKg:  500, loadedHeightMM: 1200 },
];

export const DEFAULT_TRUCK_TYPES: TruckType[] = [
  { code: 'T01', name: '2tトラック',        maxPallets: 4,  cols: 1, rows: 4,  widthMM: 1700, depthMM:  3400, heightMM: 2100 },
  { code: 'T02', name: '4tトラック',        maxPallets: 8,  cols: 2, rows: 4,  widthMM: 2100, depthMM:  5200, heightMM: 2200 },
  { code: 'T05', name: 'ウイング車(4t)',    maxPallets: 8,  cols: 2, rows: 4,  widthMM: 2200, depthMM:  5700, heightMM: 2300 },
  { code: 'T06', name: 'ウイング車(10t)',   maxPallets: 12, cols: 2, rows: 6,  widthMM: 2350, depthMM:  9600, heightMM: 2600 },
  { code: 'T04', name: 'トレーラー(20t)',   maxPallets: 16, cols: 2, rows: 8,  widthMM: 2400, depthMM: 13000, heightMM: 2500 },
];

// 今週の生産計画（個）
export const DEFAULT_PRODUCTION_PLAN: ProductionPlan = {};

// 全体在庫数（個）
export const DEFAULT_INVENTORY_STOCK: InventoryStock = {};

// 拠点別現在庫（個）
export const DEFAULT_LOCATION_STOCK: LocationStock = {};

// 拠点別 基準在庫数（個）
export const DEFAULT_BASELINE_STOCK: BaselineStock = {};

export const DEFAULT_SHIPPING_SCHEDULE: WeeklyShippingSchedule = {};

// 稼働日マスター（月〜金 = true, 土日 = false）
export const DEFAULT_OPERATING_DAYS: OperatingDays = {};

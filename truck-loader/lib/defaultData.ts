import type { Factory, Product, Warehouse, TruckType, PalletType, ProductionPlan, DistributionRatios, InventoryStock, LocationStock, WeeklyShippingSchedule } from './types';

export const DEFAULT_FACTORIES: Factory[] = [
  { code: 'F001', name: '本社工場' },
  { code: 'F002', name: '西日本工場' },
];

export const DEFAULT_PRODUCTS: Product[] = [
  { code: '1064521424', name: 'PH-5BN (A色)',     capacityPerPallet: 40, palletType: 'P03', color: '#4A90D9', factoryCode: 'F001' },
  { code: '1064521024', name: 'PH-5BN (B色)',     capacityPerPallet: 40, palletType: 'P03', color: '#2ECC71', factoryCode: 'F001' },
  { code: '1064522024', name: 'PH-5BNK (A色)',    capacityPerPallet: 40, palletType: 'P03', color: '#E67E22', factoryCode: 'F001' },
  { code: '1064522424', name: 'PH-5BNK (B色)',    capacityPerPallet: 40, palletType: 'P03', color: '#9B59B6', factoryCode: 'F001' },
  { code: '1064410024', name: 'PH-2015AW (A色)',  capacityPerPallet: 44, palletType: 'P01', color: '#E74C3C', factoryCode: 'F001' },
  { code: '1064410424', name: 'PH-2015AW (B色)',  capacityPerPallet: 44, palletType: 'P01', color: '#1ABC9C', factoryCode: 'F001' },
  { code: '1053859000', name: 'HCFA-8 450L',      capacityPerPallet: 64, palletType: 'P02', color: '#F39C12', factoryCode: 'F002' },
  { code: '1060017944', name: 'PH-E32EDVL',       capacityPerPallet: 20, palletType: 'P03', color: '#C0392B', factoryCode: 'F002' },
];

export const DEFAULT_PALLET_TYPES: PalletType[] = [
  { code: 'P01', name: '標準パレット(1100)',  widthMM: 1100, depthMM: 1100, heightMM: 144, maxWeightKg: 1000 },
  { code: 'P02', name: '大型パレット(1200)',  widthMM: 1200, depthMM: 1000, heightMM: 144, maxWeightKg: 1000 },
  { code: 'P03', name: '軽量パレット(800)',   widthMM:  800, depthMM: 1100, heightMM: 120, maxWeightKg:  500 },
];

export const DEFAULT_TRUCK_TYPES: TruckType[] = [
  { code: 'T01', name: '2tトラック',        maxPallets: 4,  cols: 1, rows: 4,  widthMM: 1700, depthMM: 3400 },
  { code: 'T02', name: '4tトラック',        maxPallets: 8,  cols: 2, rows: 4,  widthMM: 2100, depthMM: 5200 },
  { code: 'T05', name: 'ウイング車(4t)',    maxPallets: 8,  cols: 2, rows: 4,  widthMM: 2200, depthMM: 5700 },
  { code: 'T06', name: 'ウイング車(10t)',   maxPallets: 12, cols: 2, rows: 6,  widthMM: 2350, depthMM: 9600 },
  { code: 'T04', name: 'トレーラー(20t)',   maxPallets: 16, cols: 2, rows: 8,  widthMM: 2400, depthMM: 13000 },
];

export const DEFAULT_WAREHOUSES: Warehouse[] = [
  { code: 'W002', name: '札幌営業所',               group: '東', truckType: 'T06', maxPallets: 12 },
  { code: 'W0B4', name: 'パロマ本庄工場',           group: '東', truckType: 'T06', maxPallets: 12 },
  { code: 'W0F1', name: 'パロマヤマタネ',           group: '東', truckType: 'T06', maxPallets: 12 },
  { code: 'W0LR', name: '東日本ロジスティクスセンター', group: '東', truckType: 'T06', maxPallets: 12 },
  { code: 'W0Z1', name: '本社工場',                 group: '東', truckType: 'T06', maxPallets: 12 },
  { code: 'W0Z2', name: '第二工場',                 group: '東', truckType: 'T06', maxPallets: 12 },
  { code: 'W015', name: '直方工場',                 group: '西', truckType: 'T06', maxPallets: 12 },
  { code: 'W054', name: '大江配送センター',         group: '西', truckType: 'T06', maxPallets: 12 },
  { code: 'W055', name: '大口工場',                 group: '西', truckType: 'T06', maxPallets: 12 },
  { code: 'W091', name: '笹野工場',                 group: '西', truckType: 'T06', maxPallets: 12 },
  { code: 'W098', name: '恵那工場',                 group: '西', truckType: 'T06', maxPallets: 12 },
  { code: 'W0KB', name: '清洲工場',                 group: '西', truckType: 'T06', maxPallets: 12 },
  { code: 'W0LW', name: '西日本ロジスティクスセンター', group: '西', truckType: 'T06', maxPallets: 12 },
];

// 今週の生産計画（個）
export const DEFAULT_PRODUCTION_PLAN: ProductionPlan = {
  '1064521424': 465,
  '1064521024': 873,
  '1064522024': 400,
  '1064522424': 120,
  '1064410024': 660,
  '1064410424': 132,
  '1053859000': 1280,
  '1060017944': 1000,
};

// 全体在庫数（個）
export const DEFAULT_INVENTORY_STOCK: InventoryStock = {
  '1064521424': 0,
  '1064521024': 0,
  '1064522024': 0,
  '1064522424': 0,
  '1064410024': 0,
  '1064410424': 0,
  '1053859000': 0,
  '1060017944': 0,
};

// 拠点別現在庫（個）
export const DEFAULT_LOCATION_STOCK: LocationStock = {};

// 配分比率（%）— 製品コード → 拠点コード → 比率
export const DEFAULT_DISTRIBUTION_RATIOS: DistributionRatios = {
  '1064521424': { W002: 0,  W0B4: 7,  W0F1: 0,  W0LR: 17, W0Z1: 0, W0Z2: 0, W015: 13, W054: 48, W055: 0, W091: 0, W098: 0, W0KB: 0, W0LW: 14 },
  '1064521024': { W002: 0,  W0B4: 10, W0F1: 0,  W0LR: 17, W0Z1: 0, W0Z2: 0, W015: 21, W054: 36, W055: 0, W091: 0, W098: 0, W0KB: 0, W0LW: 16 },
  '1064522024': { W002: 27, W0B4: 67, W0F1: 0,  W0LR: 3,  W0Z1: 0, W0Z2: 0, W015: 0,  W054: 3,  W055: 0, W091: 0, W098: 0, W0KB: 0, W0LW: 0  },
  '1064522424': { W002: 43, W0B4: 54, W0F1: 0,  W0LR: 3,  W0Z1: 0, W0Z2: 0, W015: 0,  W054: 0,  W055: 0, W091: 0, W098: 0, W0KB: 0, W0LW: 0  },
  '1064410024': { W002: 0,  W0B4: 11, W0F1: 0,  W0LR: 17, W0Z1: 0, W0Z2: 0, W015: 27, W054: 26, W055: 0, W091: 0, W098: 0, W0KB: 0, W0LW: 19 },
  '1064410424': { W002: 0,  W0B4: 8,  W0F1: 0,  W0LR: 17, W0Z1: 0, W0Z2: 0, W015: 18, W054: 36, W055: 0, W091: 0, W098: 0, W0KB: 0, W0LW: 20 },
  '1053859000': { W002: 0,  W0B4: 18, W0F1: 2,  W0LR: 24, W0Z1: 0, W0Z2: 0, W015: 9,  W054: 42, W055: 0, W091: 0, W098: 0, W0KB: 0, W0LW: 5  },
  '1060017944': { W002: 0,  W0B4: 0,  W0F1: 0,  W0LR: 0,  W0Z1: 0, W0Z2: 0, W015: 100,W054: 0,  W055: 0, W091: 0, W098: 0, W0KB: 0, W0LW: 0  },
};

export const DEFAULT_SHIPPING_SCHEDULE: WeeklyShippingSchedule = {};

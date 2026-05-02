import type { Factory, Product, Warehouse, TruckType, PalletType, ProductionPlan, DistributionRatios, InventoryStock, LocationStock, WeeklyShippingSchedule, OperatingDays } from './types';

export const DEFAULT_FACTORIES: Factory[] = [
  { code: 'F001', name: '直方工場' },
];

export const DEFAULT_PRODUCTS: Product[] = [
  { code: '1064526424', name: 'PH-55NK',   capacityPerPallet: 40, palletType: 'P03', color: '#4A90D9', factoryCode: 'F001', equipmentCategory: '101', equipmentName: '元止め湯沸', poji: true, destination: '量販', productionMethod: 'A' },
  { code: '1064521424', name: 'PH-5BN',    capacityPerPallet: 40, palletType: 'P03', color: '#2ECC71', factoryCode: 'F001', equipmentCategory: '101', equipmentName: '元止め湯沸', poji: true, destination: '一般', productionMethod: 'A' },
  { code: '1064410024', name: 'PH-2015N',  capacityPerPallet: 40, palletType: 'P03', color: '#E67E22', factoryCode: 'F001', equipmentCategory: '101', equipmentName: '給湯器ⅠⅠ',  poji: true, destination: '一般', productionMethod: 'A' },
  { code: '1052418000', name: 'HCPH-1E',   capacityPerPallet: 48, palletType: 'P03', color: '#9B59B6', factoryCode: 'F001', equipmentCategory: '142', equipmentName: '業務部品',   poji: true, destination: '一般', productionMethod: 'A' },
  { code: '1064524424', name: 'PH-5FN',    capacityPerPallet: 40, palletType: 'P03', color: '#E74C3C', factoryCode: 'F001', equipmentCategory: '102', equipmentName: '先止め湯沸', poji: true, destination: '一般', productionMethod: 'A' },
];

export const DEFAULT_PALLET_TYPES: PalletType[] = [
  { code: 'P01', name: '標準パレット(1100)',  widthMM: 1100, depthMM: 1100, heightMM: 144, maxWeightKg: 1000 },
  { code: 'P02', name: '大型パレット(1200)',  widthMM: 1200, depthMM: 1000, heightMM: 144, maxWeightKg: 1000 },
  { code: 'P03', name: '軽量パレット(800)',   widthMM:  800, depthMM: 1100, heightMM: 120, maxWeightKg:  500 },
];

export const DEFAULT_TRUCK_TYPES: TruckType[] = [
  { code: 'T01', name: '2tトラック',        maxPallets: 4,  cols: 1, rows: 4,  widthMM: 1700, depthMM:  3400, heightMM: 2100 },
  { code: 'T02', name: '4tトラック',        maxPallets: 8,  cols: 2, rows: 4,  widthMM: 2100, depthMM:  5200, heightMM: 2200 },
  { code: 'T05', name: 'ウイング車(4t)',    maxPallets: 8,  cols: 2, rows: 4,  widthMM: 2200, depthMM:  5700, heightMM: 2300 },
  { code: 'T06', name: 'ウイング車(10t)',   maxPallets: 12, cols: 2, rows: 6,  widthMM: 2350, depthMM:  9600, heightMM: 2400 },
  { code: 'T04', name: 'トレーラー(20t)',   maxPallets: 16, cols: 2, rows: 8,  widthMM: 2400, depthMM: 13000, heightMM: 2500 },
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
  '1064526424': 0,
  '1064521424': 0,
  '1064410024': 0,
  '1052418000': 0,
  '1064524424': 0,
};

// 全体在庫数（個）
export const DEFAULT_INVENTORY_STOCK: InventoryStock = {
  '1064526424': 0,
  '1064521424': 0,
  '1064410024': 0,
  '1052418000': 0,
  '1064524424': 0,
};

// 拠点別現在庫（個）
export const DEFAULT_LOCATION_STOCK: LocationStock = {};

// 配分比率（%）— 製品コード → 拠点コード → 比率
export const DEFAULT_DISTRIBUTION_RATIOS: DistributionRatios = {
  '1064526424': {},
  '1064521424': {},
  '1064410024': {},
  '1052418000': {},
  '1064524424': {},
};

export const DEFAULT_SHIPPING_SCHEDULE: WeeklyShippingSchedule = {};

// 稼働日マスター（月〜金 = true, 土日 = false）
export const DEFAULT_OPERATING_DAYS: OperatingDays = {
  'F001': [true, true, true, true, true, false, false],
};

import type {
  Factory, Location, Product, Warehouse, ProductionPlan,
  BaselineStock, LocationStock, PlannedSales, OperatingDays,
} from './types';

// ─── サンプルデータ（架空の中小・飲料メーカー）──────────────────────────
// 「サンプルで始める」で投入する一式。新規テナントが白紙から入力する手間を省く。

export const SAMPLE_FACTORIES: Factory[] = [
  { code: 'F001', name: '関東工場' },
  { code: 'F002', name: '関西工場' },
];

/** 場所マスター（工場＝role:factory ／ 物流拠点＝role:warehouse） */
export const SAMPLE_LOCATIONS: Location[] = [
  { code: 'F001', name: '関東工場', role: 'factory' },
  { code: 'F002', name: '関西工場', role: 'factory' },
  { code: 'W001', name: '札幌物流センター',   role: 'warehouse', truckType: 'T06' },
  { code: 'W002', name: '仙台営業所',         role: 'warehouse', truckType: 'T05' },
  { code: 'W003', name: '東京物流センター',   role: 'warehouse', truckType: 'T04' },
  { code: 'W004', name: '名古屋物流センター', role: 'warehouse', truckType: 'T06' },
  { code: 'W005', name: '大阪物流センター',   role: 'warehouse', truckType: 'T06' },
  { code: 'W006', name: '福岡営業所',         role: 'warehouse', truckType: 'T05' },
];

export const SAMPLE_PRODUCTS: Product[] = [
  { code: 'D001', name: '緑茶 500ml',           capacityPerPallet: 60,  palletType: 'P01', color: '#2ECC71', factoryCode: 'F001', equipmentName: 'お茶',     allowStackOnTop: true, boxWidthMM: 400, boxDepthMM: 300, boxHeightMM: 250, boxWeightKg: 13 },
  { code: 'D002', name: '麦茶 600ml',           capacityPerPallet: 60,  palletType: 'P01', color: '#B7791F', factoryCode: 'F001', equipmentName: 'お茶',     allowStackOnTop: true, boxWidthMM: 410, boxDepthMM: 310, boxHeightMM: 280, boxWeightKg: 15 },
  { code: 'D003', name: '天然水 500ml',         capacityPerPallet: 72,  palletType: 'P01', color: '#4A90D9', factoryCode: 'F001', equipmentName: '水',       allowStackOnTop: true, boxWidthMM: 400, boxDepthMM: 300, boxHeightMM: 230, boxWeightKg: 12 },
  { code: 'D004', name: '微糖コーヒー 185g',    capacityPerPallet: 100, palletType: 'P02', color: '#8B5A2B', factoryCode: 'F002', equipmentName: 'コーヒー', allowStackOnTop: true, boxWidthMM: 390, boxDepthMM: 290, boxHeightMM: 130, boxWeightKg: 6.5 },
  { code: 'D005', name: 'ブラックコーヒー 185g', capacityPerPallet: 100, palletType: 'P02', color: '#2C3E50', factoryCode: 'F002', equipmentName: 'コーヒー', allowStackOnTop: true, boxWidthMM: 390, boxDepthMM: 290, boxHeightMM: 130, boxWeightKg: 6.5 },
  { code: 'D006', name: 'オレンジジュース 1L',  capacityPerPallet: 48,  palletType: 'P01', color: '#E67E22', factoryCode: 'F002', equipmentName: 'ジュース', allowStackOnTop: true, boxWidthMM: 330, boxDepthMM: 250, boxHeightMM: 250, boxWeightKg: 13 },
  { code: 'D007', name: 'りんごジュース 1L',    capacityPerPallet: 48,  palletType: 'P01', color: '#E74C3C', factoryCode: 'F002', equipmentName: 'ジュース', allowStackOnTop: true, boxWidthMM: 330, boxDepthMM: 250, boxHeightMM: 250, boxWeightKg: 13 },
  { code: 'D008', name: 'スポーツドリンク 500ml', capacityPerPallet: 60, palletType: 'P01', color: '#16A085', factoryCode: 'F001', equipmentName: '機能性', allowStackOnTop: true, boxWidthMM: 400, boxDepthMM: 300, boxHeightMM: 250, boxWeightKg: 13 },
];

export const SAMPLE_WAREHOUSES: Warehouse[] = [
  { code: 'W001', name: '札幌物流センター',   truckType: 'T06' },
  { code: 'W002', name: '仙台営業所',         truckType: 'T05' },
  { code: 'W003', name: '東京物流センター',   truckType: 'T04' },
  { code: 'W004', name: '名古屋物流センター', truckType: 'T06' },
  { code: 'W005', name: '大阪物流センター',   truckType: 'T06' },
  { code: 'W006', name: '福岡営業所',         truckType: 'T05' },
];

/** 拠点規模シェア（%）: 基準在庫・在庫・予定出荷を按分する */
const SHARE_BY_WH: Record<string, number> = { W001: 10, W002: 15, W003: 30, W004: 15, W005: 20, W006: 10 };

/** 週間生産数（個） */
export const SAMPLE_PRODUCTION_PLAN: ProductionPlan = {
  D001: 4800, D002: 3600, D003: 7200, D004: 5000, D005: 4000, D006: 2400, D007: 2400, D008: 3600,
};

/** 製品ごとの目標在庫（全拠点合計, 個）＝週間生産の約1.5倍 */
const BASELINE_TOTAL: Record<string, number> = {
  D001: 7200, D002: 5400, D003: 10800, D004: 7500, D005: 6000, D006: 3600, D007: 3600, D008: 5400,
};

/** 稼働日（月〜金） */
export const SAMPLE_OPERATING_DAYS: OperatingDays = {
  F001: [true, true, true, true, true, false, false],
  F002: [true, true, true, true, true, false, false],
};

/** 出荷スケジュール: F001=月水金, F002=火木（各倉庫共通） */
export const SAMPLE_FACTORY_SCHEDULE: Record<string, boolean[]> = {
  F001: [true, false, true, false, true, false, false],
  F002: [false, true, false, true, false, false, false],
};

// ── 派生マップ（拠点シェアで按分）──────────────────────────────────────
function buildWhMap(totals: Record<string, number>, factor: number): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [code, total] of Object.entries(totals)) {
    out[code] = {};
    for (const [wh, share] of Object.entries(SHARE_BY_WH)) {
      out[code][wh] = Math.round((total * share / 100) * factor);
    }
  }
  return out;
}

/** 拠点別 基準在庫数（個） */
export const SAMPLE_BASELINE_STOCK: BaselineStock = buildWhMap(BASELINE_TOTAL, 1);
/** 拠点別 現在庫（基準の約60%＝不足が出る状態でデモ） */
export const SAMPLE_LOCATION_STOCK: LocationStock = buildWhMap(BASELINE_TOTAL, 0.6);
/** 拠点別 今週予定出荷数（週間生産を按分） */
export const SAMPLE_PLANNED_SALES: PlannedSales = buildWhMap(SAMPLE_PRODUCTION_PLAN, 1);

import type {
  Factory, Location, Product, Warehouse, ProductionPlan,
  BaselineStock, LocationStock, PlannedSales, OperatingDays,
} from './types';

// ─── サンプルデータ（架空の中小・金属/機械部品メーカー）──────────────────
// 「サンプルで始める」で投入する一式。新規テナントが白紙から入力する手間を省く。
// 事例: 板金・切削・鋳造などの部品を製造し、全国の物流拠点へパレット出荷する中小製造業。

export const SAMPLE_FACTORIES: Factory[] = [
  { code: 'F001', name: '本社工場' },
  { code: 'F002', name: '第二工場' },
];

/** 場所マスター（工場＝role:factory ／ 物流拠点＝role:warehouse） */
export const SAMPLE_LOCATIONS: Location[] = [
  { code: 'F001', name: '本社工場', role: 'factory' },
  { code: 'F002', name: '第二工場', role: 'factory' },
  { code: 'W001', name: '札幌物流センター',   role: 'warehouse', truckType: 'T06' },
  { code: 'W002', name: '仙台営業所',         role: 'warehouse', truckType: 'T05' },
  { code: 'W003', name: '東京物流センター',   role: 'warehouse', truckType: 'T04' },
  { code: 'W004', name: '名古屋物流センター', role: 'warehouse', truckType: 'T06' },
  { code: 'W005', name: '大阪物流センター',   role: 'warehouse', truckType: 'T06' },
  { code: 'W006', name: '福岡営業所',         role: 'warehouse', truckType: 'T05' },
];

export const SAMPLE_PRODUCTS: Product[] = [
  { code: 'D001', name: 'ステーブラケット',   capacityPerPallet: 300, palletType: 'P01', color: '#2ECC71', factoryCode: 'F001', equipmentName: '板金部品', allowStackOnTop: true,  boxWidthMM: 350, boxDepthMM: 250, boxHeightMM: 150, boxWeightKg: 2.0 },
  { code: 'D002', name: '取付プレート',       capacityPerPallet: 240, palletType: 'P01', color: '#B7791F', factoryCode: 'F001', equipmentName: '板金部品', allowStackOnTop: true,  boxWidthMM: 400, boxDepthMM: 300, boxHeightMM: 100, boxWeightKg: 3.0 },
  { code: 'D003', name: 'ドライブシャフト',   capacityPerPallet: 150, palletType: 'P02', color: '#4A90D9', factoryCode: 'F001', equipmentName: '切削部品', allowStackOnTop: true,  boxWidthMM: 600, boxDepthMM: 150, boxHeightMM: 150, boxWeightKg: 5.0 },
  { code: 'D004', name: '平歯車（ギア）',     capacityPerPallet: 400, palletType: 'P02', color: '#8B5A2B', factoryCode: 'F002', equipmentName: '切削部品', allowStackOnTop: true,  boxWidthMM: 220, boxDepthMM: 220, boxHeightMM: 120, boxWeightKg: 1.5 },
  { code: 'D005', name: 'ギアハウジング',     capacityPerPallet: 120, palletType: 'P01', color: '#2C3E50', factoryCode: 'F002', equipmentName: '鋳造部品', allowStackOnTop: true,  boxWidthMM: 350, boxDepthMM: 320, boxHeightMM: 300, boxWeightKg: 6.0 },
  { code: 'D006', name: '樹脂カバー',         capacityPerPallet: 400, palletType: 'P03', color: '#E67E22', factoryCode: 'F002', equipmentName: '樹脂部品', allowStackOnTop: false, boxWidthMM: 330, boxDepthMM: 260, boxHeightMM: 220, boxWeightKg: 1.0 },
  { code: 'D007', name: 'フランジ継手',       capacityPerPallet: 300, palletType: 'P02', color: '#E74C3C', factoryCode: 'F002', equipmentName: '切削部品', allowStackOnTop: true,  boxWidthMM: 280, boxDepthMM: 280, boxHeightMM: 120, boxWeightKg: 2.5 },
  { code: 'D008', name: 'ベースフレーム',     capacityPerPallet: 100, palletType: 'P01', color: '#16A085', factoryCode: 'F001', equipmentName: '溶接部品', allowStackOnTop: true,  boxWidthMM: 700, boxDepthMM: 450, boxHeightMM: 120, boxWeightKg: 8.0 },
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

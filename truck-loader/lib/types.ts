// ─── マスタ型定義 ────────────────────────────────────────────────────

export interface Factory {
  code: string;
  name: string;
}

export interface Product {
  code: string;
  name: string;
  capacityPerPallet: number; // パレット（個/枚）
  palletType: string;        // P01, P02, P03
  color: string;             // hex カラー
  factoryCode?: string;      // 製造工場コード（省略時は F001）
  equipmentCategory?: string; // 器具区分
  equipmentName?: string;     // 器具名
  poji?: boolean;             // ポジ（○/×）
  destination?: string;       // 仕向け（量販 / 一般 等）
  productionMethod?: string;  // 生産方式
}

export interface Warehouse {
  code: string;
  name: string;
  group: '東' | '西';
  truckType: string; // T01〜T06
  maxPallets: number;
}

export interface TruckType {
  code: string;
  name: string;
  maxPallets: number;
  cols: number;   // 横列数
  rows: number;   // 縦行数
  widthMM: number;
  depthMM: number;
}

export interface PalletType {
  code: string;    // P01, P02, P03 ...
  name: string;    // 表示名
  widthMM: number; // 幅（mm）
  depthMM: number; // 奥行き（mm）
  heightMM: number; // 高さ（mm）
  maxWeightKg: number; // 最大積載重量（kg）
}

// ─── 入力データ型 ────────────────────────────────────────────────────

/** productCode → 週間生産数 */
export type ProductionPlan = Record<string, number>;

/** productCode → warehouseCode → 配分比率(%) */
export type DistributionRatios = Record<string, Record<string, number>>;

/** productCode → 日付(YYYY-MM-DD) → 日別生産数（個） */
export type DailyProductionPlan = Record<string, Record<string, number>>;

/** productCode → 全体在庫数（個） */
export type InventoryStock = Record<string, number>;

/** productCode → warehouseCode → 現在庫数（個） */
export type LocationStock = Record<string, Record<string, number>>;

/** productCode → warehouseCode → 輸送中数量（個）＝前回出荷数量 */
export type InTransitStock = Record<string, Record<string, number>>;

/** productCode → warehouseCode → 今週予定出荷数（個）＝販売・出荷予定 */
export type PlannedSales = Record<string, Record<string, number>>;

// Weekly shipping schedule: factoryCode → warehouseCode → [Mon,Tue,Wed,Thu,Fri,Sat,Sun] booleans
export type WeeklyShippingSchedule = Record<string, Record<string, boolean[]>>;

/** 稼働日マスター: factoryCode → [Mon,Tue,Wed,Thu,Fri,Sat,Sun] booleans */
export type OperatingDays = Record<string, boolean[]>;

/** 送り数手動上書き: productCode → warehouseCode → 数量（0=上書きなし扱い） */
export type SendQtyManual = Record<string, Record<string, number>>;

// ─── 計算結果型 ──────────────────────────────────────────────────────

export interface PalletItem {
  productCode: string;
  pallets: number;      // パレット枚数
  qty: number;          // 個数
  capacityPerPallet: number;
}

export interface TruckLoad {
  truckIndex: number;   // 1号車〜
  items: PalletItem[];  // 積載アイテム（積み込み順）
  totalPallets: number; // 使用パレット数
  maxPallets: number;   // 最大パレット数
}

export interface WarehousePlan {
  warehouseCode: string;
  trucks: TruckLoad[];
  totalPallets: number;
  totalQty: number;
}

// Per-day warehouse plan (extends WarehousePlan)
export interface DayWarehousePlan extends WarehousePlan {
  factoryCode: string;
  dayOfWeek: number; // 0=月, 1=火, ..., 6=日; -1 = unscheduled (whole week)
}

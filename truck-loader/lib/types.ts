// ─── マスタ型定義 ────────────────────────────────────────────────────

export interface Product {
  code: string;
  name: string;
  capacityPerPallet: number; // 個/枚
  palletType: string;        // P01, P02, P03
  color: string;             // hex カラー
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

// ─── 入力データ型 ────────────────────────────────────────────────────

/** productCode → 週間生産数 */
export type ProductionPlan = Record<string, number>;

/** productCode → warehouseCode → 配分比率(%) */
export type DistributionRatios = Record<string, Record<string, number>>;

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

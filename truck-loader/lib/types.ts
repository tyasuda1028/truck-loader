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
  stackable?: boolean;        // 上段積み可：この製品を2段目に配置できる（省略時は true）
  allowStackOnTop?: boolean;  // 上積み許可：この製品の上に別製品を積める（省略時は true）
  // 段ボール寸法（積付計算用）
  boxWidthMM?: number;        // 段ボール幅 (mm)
  boxDepthMM?: number;        // 段ボール奥行き (mm)
  boxHeightMM?: number;       // 段ボール高さ (mm)
  boxWeightKg?: number;       // 段ボール重量 (kg)
}

export interface Warehouse {
  code: string;
  name: string;
  truckType: string; // T01〜T06
  maxPallets: number;
}

export interface TruckType {
  code: string;
  name: string;
  maxPallets: number;
  cols: number;   // 横列数（荷台幅方向）
  rows: number;   // 縦行数（奥行き方向）
  widthMM: number;
  depthMM: number;
  heightMM: number; // 荷室有効高さ（mm）
}

export interface PalletType {
  code: string;    // P01, P02, P03 ...
  name: string;    // 表示名
  widthMM: number; // 幅（mm）
  depthMM: number; // 奥行き（mm）
  heightMM: number; // パレット板高さ（mm）
  maxWeightKg: number; // 最大積載重量（kg）
  loadedHeightMM?: number; // 製品込み積載総高さ（mm）：2段積み判定に使用
}

// ─── 入力データ型 ────────────────────────────────────────────────────

/** productCode → 週間生産数 */
export type ProductionPlan = Record<string, number>;

/** productCode → warehouseCode → 拠点別 基準在庫数（個）
 *  各拠点で維持したい目標在庫。現在庫がこれを下回った分（不足数）を生産から補充する。 */
export type BaselineStock = Record<string, Record<string, number>>;

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

/** 日付指定の非稼働日（祝日・特別休業日）: factoryCode → YYYY-MM-DD[] */
export type NonWorkingDates = Record<string, string[]>;

/** 送り数手動上書き: productCode → warehouseCode → 数量（0=上書きなし扱い） */
export type SendQtyManual = Record<string, Record<string, number>>;

// ─── 計算結果型 ──────────────────────────────────────────────────────

export interface PalletItem {
  productCode: string;
  pallets: number;      // パレット枚数
  qty: number;          // 個数
  capacityPerPallet: number;
  loadedHeightMM?: number; // パレット積載総高さ（mm）
}

/** 1スロット（行×列×段）の積載情報 */
export interface TruckSlotItem {
  productCode: string;
  qty: number;
  capacityPerPallet: number;
  loadedHeightMM: number;
  orderNum: number;
}

/** ウイング車側面図レイアウト */
export interface TruckLayout {
  cols: number;
  rows: number;
  truckHeightMM: number;
  /** [row][col] → floor pallet (row=0 前方, row=rows-1 後方) */
  floor: (TruckSlotItem | null)[][];
  /** [row][col] → upper pallet (null = 不可または空き) */
  upper: (TruckSlotItem | null)[][];
}

export interface TruckLoad {
  truckIndex: number;   // 1号車〜
  items: PalletItem[];  // 積載アイテム（積み込み順）
  totalPallets: number; // 使用パレット数（床面のみ）
  maxPallets: number;   // 最大パレット数（床面スロット数）
  layout?: TruckLayout; // 2D積載レイアウト（stacking算出後）
  upperPallets?: number; // 2段目に積まれたパレット枚数
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

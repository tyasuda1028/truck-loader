// ─── マスター型定義 ────────────────────────────────────────────────────

/** 場所マスター（工場・拠点を統合）。役割で生産元/出荷先を区別する。
 *  factories / warehouses はこの locations から派生させる（lib/location.ts）。 */
export interface Location {
  code: string;
  name: string;
  role: 'factory' | 'warehouse' | 'both'; // factory=生産元 / warehouse=出荷先 / both=両方
  truckType?: string;     // 出荷先(warehouse/both)のドックトラック種別コード
  priority?: number;      // 配分優先度（小さいほど優先）。出荷先で使用
  leadTimeDays?: number;  // 輸送リードタイム（日）。基準在庫autoモードで使用
}

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
  equipmentName?: string;     // 器具名（色分け・フィルタ用）
  allowStackOnTop?: boolean;  // 上積み可否：この製品の上に別の荷を積めるか（省略時は true）。不可なら最上段専用
  // 段ボール寸法（積付計算用）
  boxWidthMM?: number;        // 段ボール幅 (mm)
  boxDepthMM?: number;        // 段ボール奥行き (mm)
  boxHeightMM?: number;       // 段ボール高さ (mm)
  boxWeightKg?: number;       // 段ボール重量 (kg)
}

/** 出荷先ビュー（Location role∈{warehouse,both} から派生）。計算エンジンが参照する。 */
export interface Warehouse {
  code: string;
  name: string;
  truckType: string; // T01〜T06（ドックトラック）
  priority?: number;      // 配分優先度（小さいほど優先＝先に満たす）。未設定は最後尾扱い。配分モード'priority'で使用
  leadTimeDays?: number;  // 輸送リードタイム（日）。基準在庫'auto'モードで使用
}

export interface TruckType {
  code: string;
  name: string;
  // 荷台内寸のみを設定。床枚数(列×行)・段数・最大P数はパレット寸法と内寸から自動算出する。
  widthMM: number;  // 荷台内寸 幅（mm）
  depthMM: number;  // 荷台内寸 奥行き（mm）
  heightMM: number; // 荷室有効高さ（mm）
  maxWeightKg?: number; // 最大積載重量（kg）。設定時は重量制約を積載計算に適用（0/未設定は重量制約なし）
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

/** 送り数の配分方式: proportional=不足比率で按分 / priority=優先度順に満たす */
export type DistributionMode = 'proportional' | 'priority';
/** 基準在庫の決め方: manual=手入力 / auto=安全在庫＋リードタイムから自動算出 */
export type BaselineMode = 'manual' | 'auto';

/** 計算オプション（全体設定。localStorageに保管し計算へ渡す） */
export interface CalcSettings {
  distributionMode: DistributionMode;
  baselineMode: BaselineMode;
  safetyStockDays: number;       // 安全在庫日数（autoモードで使用）
  shippingDaysPerWeek: number;   // 日平均出荷の算出に使う週の出荷日数（autoモードで使用）
}

export const DEFAULT_CALC_SETTINGS: CalcSettings = {
  distributionMode: 'proportional',
  baselineMode: 'manual',
  safetyStockDays: 3,
  shippingDaysPerWeek: 6,
};

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

/** 荷台レイアウト（N段対応）。layers[tier][row][col]（tier=0 が床面） */
export interface TruckLayout {
  cols: number;
  rows: number;
  truckHeightMM: number;
  tierCount: number; // 使用された最大段数
  /** layers[tier][row][col] → パレット（null=空き）。tier=0 が床面、row=0 が前方 */
  layers: (TruckSlotItem | null)[][][];
}

export interface TruckLoad {
  truckIndex: number;   // 1号車〜
  truckTypeCode: string; // この積載に選定されたトラック種別コード（T01〜）
  items: PalletItem[];  // 積載アイテム（積み込み順）
  totalPallets: number; // 使用パレット数（全段合計）
  maxPallets: number;   // 有効最大パレット数（内寸×パレット寸法×段数から算出した容量）
  layout?: TruckLayout; // N段積載レイアウト（stacking算出後）
  totalWeightKg?: number; // 積載重量合計（kg）。製品の boxWeightKg×個数 を集計（重量データがある場合）
  maxWeightKg?: number;   // この車種の最大積載重量（kg）。未設定は重量制約なし
  overweight?: boolean;   // 重量超過フラグ（totalWeightKg > maxWeightKg）
}

export interface WarehousePlan {
  warehouseCode: string;
  trucks: TruckLoad[];
  totalPallets: number;
  totalQty: number;
  carryover?: number; // 1パレット未満で今回積まれず翌週へ繰越す個数の合計
}

// Per-day warehouse plan (extends WarehousePlan)
export interface DayWarehousePlan extends WarehousePlan {
  factoryCode: string;
  dayOfWeek: number; // 0=月, 1=火, ..., 6=日; -1 = unscheduled (whole week)
}

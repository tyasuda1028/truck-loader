/**
 * DataSource — 永続化層の抽象インターフェース（フェーズ3）
 *
 * これまで store.ts は lib/db.ts（Next.js Server Actions = サーバー必須）を
 * 直接呼んでいた。この継ぎ目を本インターフェースに置き換えることで、
 *   - ServerDataSource … 既存 Server Actions（Neon Postgres）
 *   - LocalDataSource  … 端末ローカル（現状: IndexedDB / 将来: Capacitor SQLite）
 * を実行環境に応じて差し替え可能にする。これがオフライン動作の核となる。
 *
 * メソッドのシグネチャは既存 lib/db.ts の公開関数とそのまま揃えてあり、
 * store 側の呼び出し（db.xxx → ds.xxx）を機械的に置換できる。
 */
import type {
  Location, Product, TruckType, PalletType,
  ProductionPlan, DailyProductionPlan, BaselineStock,
  InventoryStock, LocationStock, WeeklyShippingSchedule, InTransitStock, PlannedSales,
  OperatingDays, SendQtyManual, NonWorkingDates,
} from '../types';

export interface DataSource {
  /** この実装の識別子（デバッグ/同期判定用） */
  readonly kind: 'server' | 'local';

  // ─── 一括ロード ──────────────────────────────────────────
  loadLocations(): Promise<Location[]>;
  loadProducts(): Promise<Product[]>;
  loadTruckTypes(): Promise<TruckType[]>;
  loadPalletTypes(): Promise<PalletType[]>;
  loadProductionPlan(): Promise<ProductionPlan>;
  loadDailyProductionPlan(): Promise<DailyProductionPlan>;
  loadBaselineStock(): Promise<BaselineStock>;
  loadInventoryStock(): Promise<InventoryStock>;
  loadLocationStock(): Promise<LocationStock>;
  loadWeeklyShippingSchedule(): Promise<WeeklyShippingSchedule>;
  loadOperatingDays(): Promise<OperatingDays>;
  loadNonWorkingDates(): Promise<NonWorkingDates>;
  loadInTransitStock(): Promise<InTransitStock>;
  loadPlannedSales(): Promise<PlannedSales>;
  loadSendQtyManual(): Promise<SendQtyManual>;

  // ─── 場所マスター（工場・拠点統合）────────────────────────
  upsertLocation(l: Location): Promise<void>;
  deleteLocation(code: string): Promise<void>;

  // ─── 製品 ────────────────────────────────────────────────
  upsertProduct(p: Product): Promise<void>;
  upsertProducts(products: Product[]): Promise<void>;
  deleteProduct(code: string): Promise<void>;

  // ─── トラック種別 ────────────────────────────────────────
  upsertTruckType(t: TruckType): Promise<void>;
  deleteTruckType(code: string): Promise<void>;

  // ─── パレット種別 ────────────────────────────────────────
  upsertPalletType(pt: PalletType): Promise<void>;
  deletePalletType(code: string): Promise<void>;

  // ─── 生産計画 ────────────────────────────────────────────
  upsertProductionQty(productCode: string, qty: number): Promise<void>;
  upsertDailyProductionQty(productCode: string, date: string, qty: number): Promise<void>;
  replaceAllDailyProductionPlan(dailyPlan: DailyProductionPlan): Promise<void>;

  // ─── 基準在庫 ────────────────────────────────────────────
  upsertBaseline(productCode: string, warehouseCode: string, qty: number): Promise<void>;
  replaceAllBaselineStock(baseline: BaselineStock): Promise<void>;

  // ─── 全体在庫 ────────────────────────────────────────────
  upsertInventoryStock(productCode: string, qty: number): Promise<void>;
  replaceAllInventoryStock(stock: InventoryStock): Promise<void>;

  // ─── 拠点別現在庫 ────────────────────────────────────────
  upsertLocationStock(productCode: string, warehouseCode: string, qty: number): Promise<void>;
  replaceAllLocationStock(stock: LocationStock): Promise<void>;

  // ─── 輸送中在庫 ──────────────────────────────────────────
  upsertInTransitStock(productCode: string, warehouseCode: string, qty: number): Promise<void>;
  replaceAllInTransitStock(stock: InTransitStock): Promise<void>;

  // ─── 予定出荷 ────────────────────────────────────────────
  upsertPlannedSales(productCode: string, warehouseCode: string, qty: number): Promise<void>;
  replaceAllPlannedSales(sales: PlannedSales): Promise<void>;

  // ─── 出荷スケジュール ────────────────────────────────────
  upsertShippingSchedule(factoryCode: string, warehouseCode: string, days: boolean[]): Promise<void>;

  // ─── 稼働日 ──────────────────────────────────────────────
  upsertOperatingDays(factoryCode: string, days: boolean[]): Promise<void>;

  // ─── 非稼働日 ────────────────────────────────────────────
  addNonWorkingDate(factoryCode: string, date: string): Promise<void>;
  removeNonWorkingDate(factoryCode: string, date: string): Promise<void>;

  // ─── 送り数手動上書き ────────────────────────────────────
  upsertSendQtyManual(productCode: string, warehouseCode: string, qty: number): Promise<void>;
  deleteSendQtyManual(productCode: string, warehouseCode: string): Promise<void>;
  replaceAllSendQtyManual(data: SendQtyManual): Promise<void>;

  // ─── シード（オンボーディング） ──────────────────────────
  seedSampleData(): Promise<{ seeded: boolean }>;
}

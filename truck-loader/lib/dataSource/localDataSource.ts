/**
 * LocalDataSource — 端末ローカルで完結するデータソース（オフライン動作の核）。
 *
 * 現状は IndexedDB に「データセット全体を1ドキュメント」として保持する単純な
 * モデル。メモリ上に LocalDB を持ち、各ミューテーションでメモリ更新＋永続化する。
 * load 系はメモリから即返すため、ネット接続が無くても閲覧・入力・再計算が可能。
 *
 * 将来 Capacitor 上では idbKv を @capacitor-community/sqlite に差し替え、
 * ドキュメント保持 → 正規化テーブルへと段階的に発展させる。フェーズ4の
 * 同期エンジンは、ここに updated_at / dirty フラグを足す形で乗せる想定。
 */
import type { DataSource } from './types';
import type { SyncMeta, DatasetSnapshot, LocalSyncApi } from '../sync/types';
import type {
  Factory, Location, Product, Warehouse, TruckType, PalletType,
  ProductionPlan, DailyProductionPlan, BaselineStock,
  InventoryStock, LocationStock, WeeklyShippingSchedule, InTransitStock, PlannedSales,
  OperatingDays, SendQtyManual, NonWorkingDates,
} from '../types';
import {
  DEFAULT_TRUCK_TYPES, DEFAULT_PALLET_TYPES,
} from '../defaultData';
import {
  SAMPLE_LOCATIONS, SAMPLE_PRODUCTS, SAMPLE_WAREHOUSES, SAMPLE_PRODUCTION_PLAN,
  SAMPLE_BASELINE_STOCK, SAMPLE_LOCATION_STOCK, SAMPLE_PLANNED_SALES,
  SAMPLE_OPERATING_DAYS, SAMPLE_FACTORY_SCHEDULE,
} from '../sampleData';
import { migrateToLocations } from '../location';
import { idbGet, idbSet } from './idbKv';
import { assertNotDemo } from '../demo';

const DOC_KEY = 'dataset';

interface LocalDB {
  /** 場所マスター（真実の単一ソース）。旧 factories/warehouses から冪等移行される。 */
  locations?: Location[];
  /** @deprecated 移行元。locations 確定後は参照しない（古いデータの読み込み互換用に残置） */
  factories: Factory[];
  products: Product[];
  /** @deprecated 移行元。locations 確定後は参照しない */
  warehouses: Warehouse[];
  truckTypes: TruckType[];
  palletTypes: PalletType[];
  productionPlan: ProductionPlan;
  dailyProductionPlan: DailyProductionPlan;
  baselineStock: BaselineStock;
  inventoryStock: InventoryStock;
  locationStock: LocationStock;
  weeklyShippingSchedule: WeeklyShippingSchedule;
  operatingDays: OperatingDays;
  nonWorkingDates: NonWorkingDates;
  inTransitStock: InTransitStock;
  plannedSales: PlannedSales;
  sendQtyManual: SendQtyManual;
  /** 同期メタ（フェーズ4）。ミューテーションで更新される。 */
  meta: SyncMeta;
}

function emptyDoc(): LocalDB {
  return {
    locations: [],
    factories: [],
    products: [],
    warehouses: [],
    truckTypes: DEFAULT_TRUCK_TYPES,
    palletTypes: DEFAULT_PALLET_TYPES,
    productionPlan: {},
    dailyProductionPlan: {},
    baselineStock: {},
    inventoryStock: {},
    locationStock: {},
    weeklyShippingSchedule: {},
    operatingDays: {},
    nonWorkingDates: {},
    inTransitStock: {},
    plannedSales: {},
    sendQtyManual: {},
    meta: { updatedAt: 0, dirty: false, lastSyncedAt: null },
  };
}

/** 当週の月曜起点でサンプル日別生産計画を生成（db.ts の同名ロジックを移植） */
function buildSampleDailyPlan(): DailyProductionPlan {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dates = [0, 1, 2, 3, 4].map((n) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + n);
    return iso(d);
  });
  const daily: DailyProductionPlan = {};
  for (const [code, qty] of Object.entries(SAMPLE_PRODUCTION_PLAN)) {
    const per = Math.round(qty / dates.length);
    daily[code] = {};
    for (const dt of dates) daily[code][dt] = per;
  }
  return daily;
}

class LocalDataSource implements DataSource, LocalSyncApi {
  readonly kind = 'local' as const;

  private doc: LocalDB = emptyDoc();
  private loaded: Promise<void> | null = null;
  /** 永続化を直列化するための単純なキュー */
  private writeChain: Promise<unknown> = Promise.resolve();

  private ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      this.loaded = idbGet<LocalDB>(DOC_KEY).then((saved) => {
        if (saved) this.doc = { ...emptyDoc(), ...saved };
      }).catch((err) => {
        console.error('[LocalDataSource] 読込失敗。空データで継続:', err);
      });
    }
    return this.loaded;
  }

  /**
   * ミューテーション用の永続化。変更時刻を更新し dirty を立ててから保存する。
   * （同期で取り込んだ場合は dirty を立てたくないため save() を別途用意）
   */
  private persist(): Promise<void> {
    this.doc.meta = { ...this.doc.meta, updatedAt: Date.now(), dirty: true };
    return this.save();
  }

  /** メタを変更せず doc を永続化（直列化）。同期処理から使う。 */
  private save(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.doc)) as LocalDB;
    this.writeChain = this.writeChain
      .then(() => idbSet(DOC_KEY, snapshot))
      .catch((err) => console.error('[LocalDataSource] 永続化失敗:', err));
    return this.writeChain as Promise<void>;
  }

  // ─── 同期API（LocalSyncApi / フェーズ4）──────────────────────
  /** 現在のデータセットをスナップショットとして書き出す（meta は除く） */
  async exportSnapshot(): Promise<DatasetSnapshot> {
    await this.ensureLoaded();
    const { meta: _meta, ...data } = this.doc;
    return { data: JSON.parse(JSON.stringify(data)), updatedAt: this.doc.meta.updatedAt };
  }

  /** リモートのスナップショットでローカルを置き換える（同期済みとして記録） */
  async importSnapshot(snap: DatasetSnapshot): Promise<void> {
    await this.ensureLoaded();
    this.doc = {
      ...emptyDoc(),
      ...(snap.data as Partial<LocalDB>),
      meta: { updatedAt: snap.updatedAt, dirty: false, lastSyncedAt: Date.now() },
    };
    await this.save();
  }

  async getSyncMeta(): Promise<SyncMeta> {
    await this.ensureLoaded();
    return this.doc.meta;
  }

  /** push 成功後に「同期済み（dirtyを下ろす）」として記録 */
  async markSynced(updatedAt: number): Promise<void> {
    await this.ensureLoaded();
    this.doc.meta = { updatedAt, dirty: false, lastSyncedAt: Date.now() };
    await this.save();
  }

  // ─── 一括ロード ──────────────────────────────────────────
  /** 場所マスターをロード。旧 factories/warehouses しか無い古いデータは冪等移行する。 */
  async loadLocations() {
    await this.ensureLoaded();
    if (!this.doc.locations || this.doc.locations.length === 0) {
      const migrated = migrateToLocations(this.doc.factories ?? [], this.doc.warehouses ?? [], this.doc.locations);
      if (migrated.length > 0) {
        this.doc.locations = migrated;
        await this.save(); // 移行結果を永続化（次回以降は再移行しない）
      } else {
        this.doc.locations = [];
      }
    }
    return this.doc.locations;
  }
  async loadProducts() { await this.ensureLoaded(); return this.doc.products; }
  async loadTruckTypes() { await this.ensureLoaded(); return this.doc.truckTypes; }
  async loadPalletTypes() { await this.ensureLoaded(); return this.doc.palletTypes; }
  async loadProductionPlan() { await this.ensureLoaded(); return this.doc.productionPlan; }
  async loadDailyProductionPlan() { await this.ensureLoaded(); return this.doc.dailyProductionPlan; }
  async loadBaselineStock() { await this.ensureLoaded(); return this.doc.baselineStock; }
  async loadInventoryStock() { await this.ensureLoaded(); return this.doc.inventoryStock; }
  async loadLocationStock() { await this.ensureLoaded(); return this.doc.locationStock; }
  async loadWeeklyShippingSchedule() { await this.ensureLoaded(); return this.doc.weeklyShippingSchedule; }
  async loadOperatingDays() { await this.ensureLoaded(); return this.doc.operatingDays; }
  async loadNonWorkingDates() { await this.ensureLoaded(); return this.doc.nonWorkingDates; }
  async loadInTransitStock() { await this.ensureLoaded(); return this.doc.inTransitStock; }
  async loadPlannedSales() { await this.ensureLoaded(); return this.doc.plannedSales; }
  async loadSendQtyManual() { await this.ensureLoaded(); return this.doc.sendQtyManual; }

  // ─── 場所マスター（工場・拠点統合）────────────────────────
  async upsertLocation(l: Location) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.locations = upsertByCode(this.doc.locations ?? [], l);
    return this.persist();
  }
  async deleteLocation(code: string) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.locations = (this.doc.locations ?? []).filter((x) => x.code !== code);
    return this.persist();
  }

  // ─── 製品 ────────────────────────────────────────────────
  async upsertProduct(p: Product) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.products = upsertByCode(this.doc.products, p);
    return this.persist();
  }
  async upsertProducts(products: Product[]) {
    assertNotDemo();
    await this.ensureLoaded();
    let arr = this.doc.products;
    for (const p of products) arr = upsertByCode(arr, p);
    this.doc.products = arr;
    return this.persist();
  }
  async deleteProduct(code: string) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.products = this.doc.products.filter((p) => p.code !== code);
    return this.persist();
  }

  // ─── トラック種別 ────────────────────────────────────────
  async upsertTruckType(t: TruckType) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.truckTypes = upsertByCode(this.doc.truckTypes, t);
    return this.persist();
  }
  async deleteTruckType(code: string) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.truckTypes = this.doc.truckTypes.filter((t) => t.code !== code);
    return this.persist();
  }

  // ─── パレット種別 ────────────────────────────────────────
  async upsertPalletType(pt: PalletType) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.palletTypes = upsertByCode(this.doc.palletTypes, pt);
    return this.persist();
  }
  async deletePalletType(code: string) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.palletTypes = this.doc.palletTypes.filter((p) => p.code !== code);
    return this.persist();
  }

  // ─── 生産計画 ────────────────────────────────────────────
  async upsertProductionQty(productCode: string, qty: number) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.productionPlan[productCode] = qty;
    return this.persist();
  }
  async upsertDailyProductionQty(productCode: string, date: string, qty: number) {
    assertNotDemo();
    await this.ensureLoaded();
    const m = (this.doc.dailyProductionPlan[productCode] ??= {});
    if (qty > 0) m[date] = qty; else delete m[date];
    return this.persist();
  }
  async replaceAllDailyProductionPlan(dailyPlan: DailyProductionPlan) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.dailyProductionPlan = dailyPlan;
    return this.persist();
  }

  // ─── 基準在庫 ────────────────────────────────────────────
  async upsertBaseline(productCode: string, warehouseCode: string, qty: number) {
    assertNotDemo();
    await this.ensureLoaded();
    setNested(this.doc.baselineStock, productCode, warehouseCode, qty);
    return this.persist();
  }
  async replaceAllBaselineStock(baseline: BaselineStock) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.baselineStock = baseline;
    return this.persist();
  }

  // ─── 全体在庫 ────────────────────────────────────────────
  async upsertInventoryStock(productCode: string, qty: number) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.inventoryStock[productCode] = qty;
    return this.persist();
  }
  async replaceAllInventoryStock(stock: InventoryStock) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.inventoryStock = stock;
    return this.persist();
  }

  // ─── 拠点別現在庫 ────────────────────────────────────────
  async upsertLocationStock(productCode: string, warehouseCode: string, qty: number) {
    assertNotDemo();
    await this.ensureLoaded();
    setNested(this.doc.locationStock, productCode, warehouseCode, qty);
    return this.persist();
  }
  async replaceAllLocationStock(stock: LocationStock) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.locationStock = stock;
    return this.persist();
  }

  // ─── 輸送中在庫 ──────────────────────────────────────────
  async upsertInTransitStock(productCode: string, warehouseCode: string, qty: number) {
    assertNotDemo();
    await this.ensureLoaded();
    setNested(this.doc.inTransitStock, productCode, warehouseCode, qty);
    return this.persist();
  }
  async replaceAllInTransitStock(stock: InTransitStock) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.inTransitStock = stock;
    return this.persist();
  }

  // ─── 予定出荷 ────────────────────────────────────────────
  async upsertPlannedSales(productCode: string, warehouseCode: string, qty: number) {
    assertNotDemo();
    await this.ensureLoaded();
    setNested(this.doc.plannedSales, productCode, warehouseCode, qty);
    return this.persist();
  }
  async replaceAllPlannedSales(sales: PlannedSales) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.plannedSales = sales;
    return this.persist();
  }

  // ─── 出荷スケジュール ────────────────────────────────────
  async upsertShippingSchedule(factoryCode: string, warehouseCode: string, days: boolean[]) {
    assertNotDemo();
    await this.ensureLoaded();
    const f = (this.doc.weeklyShippingSchedule[factoryCode] ??= {});
    f[warehouseCode] = days;
    return this.persist();
  }

  // ─── 稼働日 ──────────────────────────────────────────────
  async upsertOperatingDays(factoryCode: string, days: boolean[]) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.operatingDays[factoryCode] = days;
    return this.persist();
  }

  // ─── 非稼働日 ────────────────────────────────────────────
  async addNonWorkingDate(factoryCode: string, date: string) {
    assertNotDemo();
    await this.ensureLoaded();
    const arr = (this.doc.nonWorkingDates[factoryCode] ??= []);
    if (!arr.includes(date)) arr.push(date);
    return this.persist();
  }
  async removeNonWorkingDate(factoryCode: string, date: string) {
    assertNotDemo();
    await this.ensureLoaded();
    const arr = this.doc.nonWorkingDates[factoryCode];
    if (arr) this.doc.nonWorkingDates[factoryCode] = arr.filter((d) => d !== date);
    return this.persist();
  }

  // ─── 送り数手動上書き ────────────────────────────────────
  async upsertSendQtyManual(productCode: string, warehouseCode: string, qty: number) {
    assertNotDemo();
    await this.ensureLoaded();
    setNested(this.doc.sendQtyManual, productCode, warehouseCode, qty);
    return this.persist();
  }
  async deleteSendQtyManual(productCode: string, warehouseCode: string) {
    assertNotDemo();
    await this.ensureLoaded();
    const wh = this.doc.sendQtyManual[productCode];
    if (wh) delete wh[warehouseCode];
    return this.persist();
  }
  async replaceAllSendQtyManual(data: SendQtyManual) {
    assertNotDemo();
    await this.ensureLoaded();
    this.doc.sendQtyManual = data;
    return this.persist();
  }

  // ─── シード ──────────────────────────────────────────────
  async seedSampleData(): Promise<{ seeded: boolean }> {
    await this.ensureLoaded();
    // 既存データがあればスキップ（サーバー版と同じ「上書き防止」挙動）
    if (this.doc.products.length > 0) return { seeded: false };

    this.doc.locations = [...SAMPLE_LOCATIONS];
    this.doc.products = [...SAMPLE_PRODUCTS];
    this.doc.truckTypes = DEFAULT_TRUCK_TYPES;
    this.doc.palletTypes = DEFAULT_PALLET_TYPES;
    this.doc.operatingDays = { ...SAMPLE_OPERATING_DAYS };
    this.doc.productionPlan = { ...SAMPLE_PRODUCTION_PLAN };
    this.doc.dailyProductionPlan = buildSampleDailyPlan();
    this.doc.baselineStock = SAMPLE_BASELINE_STOCK;
    this.doc.locationStock = SAMPLE_LOCATION_STOCK;
    this.doc.plannedSales = SAMPLE_PLANNED_SALES;

    // 出荷スケジュール（各倉庫 × 各工場）
    const schedule: WeeklyShippingSchedule = {};
    for (const w of SAMPLE_WAREHOUSES) {
      for (const [fc, days] of Object.entries(SAMPLE_FACTORY_SCHEDULE)) {
        (schedule[fc] ??= {})[w.code] = days;
      }
    }
    this.doc.weeklyShippingSchedule = schedule;

    await this.persist();
    return { seeded: true };
  }
}

// ─── ヘルパー ──────────────────────────────────────────────
function upsertByCode<T extends { code: string }>(arr: T[], item: T): T[] {
  const idx = arr.findIndex((x) => x.code === item.code);
  if (idx === -1) return [...arr, item];
  const next = [...arr];
  next[idx] = item;
  return next;
}

function setNested(
  map: Record<string, Record<string, number>>,
  outer: string,
  inner: string,
  qty: number,
): void {
  (map[outer] ??= {})[inner] = qty;
}

export const localDataSource: DataSource & LocalSyncApi = new LocalDataSource();

import type {
  Factory, Product, Warehouse, TruckType, PalletType,
  ProductionPlan, BaselineStock,
  LocationStock, InTransitStock, PlannedSales, SendQtyManual,
  PalletItem, TruckLoad, TruckLayout, TruckSlotItem, WarehousePlan,
  WeeklyShippingSchedule, DayWarehousePlan, CalcSettings,
} from './types';
import { DEFAULT_CALC_SETTINGS } from './types';

/** 切り上げ除算 */
const ceilDiv = (a: number, b: number) => (b > 0 ? Math.ceil(a / b) : 0);

/** 同名倉庫をグループ化する */
export function groupWarehousesByName(warehouses: Warehouse[]): Map<string, Warehouse[]> {
  const map = new Map<string, Warehouse[]>();
  for (const wh of warehouses) {
    if (!map.has(wh.name)) map.set(wh.name, []);
    map.get(wh.name)!.push(wh);
  }
  return map;
}

/** 1行＝1製品×1拠点 の配分内訳（AIコンテキスト・画面表示用） */
export interface DistributionDetailRow {
  productCode: string;
  warehouseCode: string;
  required: number;        // 拠点別 基準在庫数（個）。autoモードでは自動算出値
  currentStock: number;    // 拠点在庫（個）
  inTransit: number;       // 輸送中（個）
  plannedSales: number;    // 予定出荷（個）
  effectiveStock: number;  // max(0, 拠点在庫 + 輸送中 - 予定出荷)
  shortage: number;        // max(0, 必要 - 有効在庫)
  sendQty: number;         // 計算された送り数（個）
  carryover: number;       // 端数（1パレット未満で今回送られず翌週へ繰越す個数）= sendQty mod パレット容量
}

/** baselineMode='auto' のときの基準在庫（個）を算出する。
 *  基準在庫 = ⌈ 日平均出荷 ×（リードタイム日数 ＋ 安全在庫日数）⌉
 *  日平均出荷 = 予定出荷 ÷ 週の出荷日数 */
function autoBaseline(plannedSales: number, leadTimeDays: number, settings: CalcSettings): number {
  const days = settings.shippingDaysPerWeek > 0 ? settings.shippingDaysPerWeek : 6;
  const dailyShip = plannedSales / days;
  return Math.ceil(dailyShip * (leadTimeDays + settings.safetyStockDays));
}

/**
 * 在庫不足に基づく配分内訳を計算する（送り数の根拠を含む）
 * 必要在庫 = 拠点別 基準在庫数（個）
 * 有効在庫 = max(0, 拠点在庫 + 輸送中 - 予定出荷)
 * 不足数 = max(0, 必要 - 有効在庫)
 * 生産数を不足比率で按分して送り数を決定する
 */
export function calcDistributionDetail(
  products: Product[],
  warehouses: Warehouse[],
  productionPlan: ProductionPlan,
  baselineStock: BaselineStock,
  locationStock: LocationStock,
  inTransitStock: InTransitStock = {},
  plannedSales: PlannedSales = {},
  settings: CalcSettings = DEFAULT_CALC_SETTINGS,
): DistributionDetailRow[] {
  const rows: DistributionDetailRow[] = [];

  // 配分の優先順位（priorityモード用）: priority昇順、未設定は最後尾、同値は登録順
  const orderedWarehouses = [...warehouses]
    .map((wh, idx) => ({ wh, idx }))
    .sort((a, b) => {
      const pa = a.wh.priority ?? Number.POSITIVE_INFINITY;
      const pb = b.wh.priority ?? Number.POSITIVE_INFINITY;
      return pa !== pb ? pa - pb : a.idx - b.idx;
    })
    .map((x) => x.wh);

  for (const p of products) {
    const production = productionPlan[p.code] ?? 0;
    const cap = p.capacityPerPallet > 0 ? p.capacityPerPallet : 1;

    // 各拠点の不足数を計算（拠点在庫 + 輸送中 - 予定出荷 を有効在庫とする）
    const stats: Record<string, Omit<DistributionDetailRow, 'productCode' | 'warehouseCode' | 'sendQty' | 'carryover'>> = {};
    let totalShortage = 0;

    for (const wh of warehouses) {
      const sales = plannedSales[p.code]?.[wh.code] ?? 0;
      // 基準在庫: manual=手入力値 / auto=日平均出荷×(リードタイム＋安全在庫日数)
      const required = settings.baselineMode === 'auto'
        ? autoBaseline(sales, wh.leadTimeDays ?? 0, settings)
        : (baselineStock[p.code]?.[wh.code] ?? 0);
      const currentStock = locationStock[p.code]?.[wh.code] ?? 0;
      const inTransit = inTransitStock[p.code]?.[wh.code] ?? 0;
      const effectiveStock = Math.max(0, currentStock + inTransit - sales);
      const shortage = Math.max(0, required - effectiveStock);
      stats[wh.code] = { required, currentStock, inTransit, plannedSales: sales, effectiveStock, shortage };
      totalShortage += shortage;
    }

    // 送り数の決定
    const sendMap: Record<string, number> = {};
    if (totalShortage === 0 || production === 0) {
      for (const wh of warehouses) sendMap[wh.code] = 0;
    } else if (totalShortage <= production) {
      // 生産数が不足を全て賄える：各拠点に不足数をそのまま
      for (const wh of warehouses) sendMap[wh.code] = stats[wh.code].shortage;
    } else if (settings.distributionMode === 'priority') {
      // 優先度順に不足を満たす（生産が尽きたら以降は0）
      let rem = production;
      for (const wh of orderedWarehouses) {
        const give = Math.min(stats[wh.code].shortage, rem);
        sendMap[wh.code] = give;
        rem -= give;
      }
    } else {
      // 不足比率で按分（既定）。丸め残差は不足の大きい拠点から1ずつ補正して合計を生産数に一致させる
      let assigned = 0;
      for (const wh of warehouses) {
        const q = Math.round(production * stats[wh.code].shortage / totalShortage);
        sendMap[wh.code] = q;
        assigned += q;
      }
      let diff = production - assigned; // 余り(>0)or過剰(<0)
      const byShortageDesc = [...warehouses].sort((a, b) => stats[b.code].shortage - stats[a.code].shortage);
      let gi = 0;
      while (diff !== 0 && byShortageDesc.length > 0) {
        const wh = byShortageDesc[gi % byShortageDesc.length];
        if (diff > 0) { sendMap[wh.code] += 1; diff -= 1; }
        else if (sendMap[wh.code] > 0) { sendMap[wh.code] -= 1; diff += 1; }
        gi++;
        if (gi > byShortageDesc.length * 1000) break; // 安全弁
      }
    }

    for (const wh of warehouses) {
      const sendQty = sendMap[wh.code] ?? 0;
      const carryover = sendQty % cap; // 1パレット未満の端数（翌週繰越）
      rows.push({ productCode: p.code, warehouseCode: wh.code, ...stats[wh.code], sendQty, carryover });
    }
  }

  return rows;
}

/**
 * 在庫不足に基づいて各拠点への送り数を計算する
 * （内訳は calcDistributionDetail を共有し、ここでは送り数のみを取り出す）
 */
export function calcSendQty(
  products: Product[],
  warehouses: Warehouse[],
  productionPlan: ProductionPlan,
  baselineStock: BaselineStock,
  locationStock: LocationStock,
  inTransitStock: InTransitStock = {},
  plannedSales: PlannedSales = {},
  settings: CalcSettings = DEFAULT_CALC_SETTINGS,
): Record<string, Record<string, number>> {
  const sendQty: Record<string, Record<string, number>> = {};
  // 製品キーを必ず初期化（拠点ゼロでも空オブジェクトを保持し従来挙動と一致させる）
  for (const p of products) sendQty[p.code] = {};

  const rows = calcDistributionDetail(
    products, warehouses, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales, settings,
  );
  for (const r of rows) {
    sendQty[r.productCode][r.warehouseCode] = r.sendQty;
  }

  return sendQty;
}

/** 選定候補トラック（有効容量つき） */
interface TruckCandidate {
  type: TruckType;
  floorCap: number; // 床面スロット数（ドック制約の判定に使用）
  eff: number;      // 有効容量（2段積み込み）
}

/**
 * フリートから、ドック制約（床面 ≤ dockFloorCap）を満たす候補を作る。
 * 各候補の有効容量は積載予定製品のスタッキング可否で決まる。
 */
function buildTruckCandidates(
  fleet: TruckType[],
  dockFloorCap: number,
  canStackProducts: boolean,
  minLoadedH: number,
): TruckCandidate[] {
  const cands: TruckCandidate[] = [];
  for (const t of fleet) {
    const floorCap = t.cols * t.rows;
    if (floorCap <= 0 || floorCap > dockFloorCap) continue; // ドックに入らない大型は除外
    const truckH = t.heightMM ?? 2300;
    const canStack = canStackProducts && minLoadedH * 2 <= truckH;
    const eff = Math.max(t.maxPallets, canStack ? floorCap * 2 : floorCap);
    cands.push({ type: t, floorCap, eff });
  }
  return cands;
}

/**
 * P枚のパレットを運ぶ最適なトラックの組合せを選定する。
 * 目的: ①廃棄スロット最小（積載率最大）→ ②台数最小 → ③大型優先。
 * DP（被覆問題）で最適化。Pが大きい場合はグリーディにフォールバック。
 * 戻り値は有効容量の降順（大型に先に積む）。
 */
export function selectTrucksForPallets(P: number, candidates: TruckCandidate[]): TruckCandidate[] {
  if (P <= 0 || candidates.length === 0) return [];
  const sortedDesc = [...candidates].sort((a, b) => b.eff - a.eff);
  const maxEff = sortedDesc[0].eff;

  // 大きすぎる P は DP 配列が膨らむためグリーディ（最大車種を満載で並べ、端数を最適車種で）
  if (P > 800) {
    const picks: TruckCandidate[] = [];
    let rem = P;
    const big = sortedDesc[0];
    while (rem > big.eff) { picks.push(big); rem -= big.eff; }
    // 端数 rem を、廃棄最小の単一車種で
    let best = sortedDesc.find((c) => c.eff >= rem) ?? big;
    for (const c of sortedDesc) if (c.eff >= rem && c.eff < best.eff) best = c;
    picks.push(best);
    return picks.sort((a, b) => b.eff - a.eff);
  }

  // dp[k] = 「k枚以上を運ぶ」最良解。比較は (総容量 asc, 台数 asc)
  const INF = Number.POSITIVE_INFINITY;
  const dp: { cap: number; count: number; from: number; cand: number }[] =
    Array.from({ length: P + 1 }, () => ({ cap: INF, count: INF, from: -1, cand: -1 }));
  dp[0] = { cap: 0, count: 0, from: -1, cand: -1 };
  const better = (a: { cap: number; count: number }, b: { cap: number; count: number }) =>
    a.cap !== b.cap ? a.cap < b.cap : a.count < b.count;

  for (let k = 1; k <= P; k++) {
    for (let ci = 0; ci < sortedDesc.length; ci++) {
      const c = sortedDesc[ci];
      const prev = dp[Math.max(0, k - c.eff)];
      if (prev.cap === INF) continue;
      const cand = { cap: prev.cap + c.eff, count: prev.count + 1, from: Math.max(0, k - c.eff), cand: ci };
      if (dp[k].cap === INF || better(cand, dp[k])) dp[k] = cand;
    }
  }

  // 復元（解が無ければ最大車種で被覆するフォールバック）
  if (dp[P].cand < 0) {
    const picks: TruckCandidate[] = [];
    let rem = P;
    while (rem > 0) { picks.push(sortedDesc[0]); rem -= maxEff; }
    return picks;
  }
  const picks: TruckCandidate[] = [];
  let k = P;
  while (k > 0 && dp[k].cand >= 0) {
    picks.push(sortedDesc[dp[k].cand]);
    k = dp[k].from;
  }
  return picks.sort((a, b) => b.eff - a.eff);
}

/**
 * 1拠点分の積載計画を計算する（送り数を外部から受け取る）
 * dockTruck はその拠点が受入可能な最大トラック（ドック制約）。
 * fleet（全車種）から最も積載効率の良いトラックを選定して積み付ける。
 */
export function calcWarehousePlan(
  warehouseCode: string,
  products: Product[],
  dockTruck: TruckType,
  fleet: TruckType[],
  sendQty: Record<string, Record<string, number>>,
  palletTypes: PalletType[] = [],
): WarehousePlan {
  const palletTypeMap = Object.fromEntries(palletTypes.map((pt) => [pt.code, pt]));
  const shippedProds = products.filter((p) => (sendQty[p.code]?.[warehouseCode] ?? 0) > 0);
  const minLoadedH = shippedProds.length > 0
    ? Math.min(...shippedProds.map((p) => palletTypeMap[p.palletType]?.loadedHeightMM ?? 1200))
    : 1200;
  // 2段積み条件: 上段に積める製品が存在 + 上積み許可の製品が存在（高さは車種ごとに判定）
  const hasUpperStackable  = shippedProds.some((p) => p.stackable !== false);
  const hasBottomStackable = shippedProds.some((p) => p.allowStackOnTop !== false);
  const canStackProducts = hasUpperStackable && hasBottomStackable;

  // 製品コード → 1パレットあたり重量(kg)（boxWeightKg×パレット容量。0=重量データなし）
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));
  const palletWeightOf = (code: string): number => {
    const p = productMap[code];
    const w = p?.boxWeightKg ?? 0;
    return w > 0 ? w * (p.capacityPerPallet || 0) : 0;
  };

  // 製品ごとに送り数 → パレット数を計算（端数は切り捨て＝完全パレット単位のみ）
  const items: { productCode: string; pallets: number; qty: number; capacityPerPallet: number }[] = [];
  let carryover = 0; // 1パレット未満で今回送られない端数（翌週繰越）
  for (const p of products) {
    const qty = sendQty[p.code]?.[warehouseCode] ?? 0;
    if (qty <= 0) continue;
    const pallets = Math.floor(qty / p.capacityPerPallet); // 端数切り捨て
    carryover += qty - pallets * p.capacityPerPallet;      // 切り捨てた端数を繰越に積む
    if (pallets <= 0) continue; // 1パレット未満は積載しない
    items.push({
      productCode: p.code,
      pallets,
      qty: pallets * p.capacityPerPallet,
      capacityPerPallet: p.capacityPerPallet,
    });
  }

  if (items.length === 0) {
    return { warehouseCode, trucks: [], totalPallets: 0, totalQty: 0, carryover };
  }

  // 総パレット数 P を最適なトラック構成で運ぶ
  const totalP = items.reduce((s, i) => s + i.pallets, 0);
  const dockFloorCap = dockTruck.cols * dockTruck.rows;
  let candidates = buildTruckCandidates(fleet, dockFloorCap, canStackProducts, minLoadedH);
  if (candidates.length === 0) {
    // フリート未登録などの保険：ドックトラック単体を候補に
    const floorCap = dockTruck.cols * dockTruck.rows;
    const canStack = canStackProducts && minLoadedH * 2 <= (dockTruck.heightMM ?? 2300);
    candidates = [{ type: dockTruck, floorCap, eff: Math.max(dockTruck.maxPallets, canStack ? floorCap * 2 : floorCap) }];
  }
  const selected = selectTrucksForPallets(totalP, candidates);

  // 多パレット順に並び替え（重量・数量の多いものをキャブ側／大型車へ）
  items.sort((a, b) => b.pallets - a.pallets);

  // 選定済みトラック（大型→小型）へ順に満載で積み付ける
  const queue = items.map((i) => ({ ...i, rem: i.pallets, qtyRem: i.qty }));
  let qi = 0;
  const trucks: TruckLoad[] = [];

  /** 1台分を、スロット容量＋（設定時）重量制約の範囲で満載に詰める */
  const fillOneTruck = (slotCap: number, maxWeightKg?: number) => {
    const truckItems: PalletItem[] = [];
    let slots = 0;
    let weight = 0;
    let overweight = false;
    const weightLimited = !!(maxWeightKg && maxWeightKg > 0);
    while (slots < slotCap && qi < queue.length) {
      const it = queue[qi];
      if (it.rem <= 0) { qi++; continue; }
      let place = Math.min(it.rem, slotCap - slots);
      const pw = palletWeightOf(it.productCode);
      if (weightLimited && pw > 0) {
        const byWeight = Math.floor((maxWeightKg! - weight) / pw);
        if (byWeight < place) {
          if (byWeight <= 0) {
            if (slots === 0) { place = 1; overweight = true; } // 空車に1枚すら不可＝1パレットが上限超過。無限ループ回避で1枚積み警告
            else break; // 既積載あり → 重量で打ち切り次の車へ
          } else {
            place = byWeight;
          }
        }
      }
      const qtyHere = Math.min(it.qtyRem, place * it.capacityPerPallet);
      truckItems.push({ productCode: it.productCode, pallets: place, qty: qtyHere, capacityPerPallet: it.capacityPerPallet });
      it.rem -= place; it.qtyRem -= qtyHere; slots += place; weight += place * pw;
      if (it.rem <= 0) qi++;
    }
    return { truckItems, slots, weight, overweight };
  };

  const pushTruck = (cand: TruckCandidate, r: { truckItems: PalletItem[]; slots: number; weight: number; overweight: boolean }) => {
    const maxW = cand.type.maxWeightKg;
    trucks.push({
      truckIndex: trucks.length + 1,
      truckTypeCode: cand.type.code,
      items: r.truckItems,
      totalPallets: r.slots,
      maxPallets: cand.eff,
      totalWeightKg: r.weight > 0 ? Math.round(r.weight) : undefined,
      maxWeightKg: maxW && maxW > 0 ? maxW : undefined,
      overweight: r.overweight || (!!(maxW && maxW > 0) && r.weight > maxW),
    });
  };

  for (let t = 0; t < selected.length; t++) {
    const r = fillOneTruck(selected[t].eff, selected[t].type.maxWeightKg);
    if (r.truckItems.length === 0) continue;
    pushTruck(selected[t], r);
  }

  // 念のため：選定容量が不足して積み残しがあれば最大候補で追加（重量制約で台数が増えた場合もここで吸収）
  const biggest = [...candidates].sort((a, b) => b.eff - a.eff)[0];
  while (qi < queue.length) {
    const r = fillOneTruck(biggest.eff, biggest.type.maxWeightKg);
    if (r.truckItems.length === 0) break;
    pushTruck(biggest, r);
  }

  const totalPallets = trucks.reduce((s, t) => s + t.totalPallets, 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  return { warehouseCode, trucks, totalPallets, totalQty, carryover };
}

/**
 * 全拠点の積載計画を計算する（同名倉庫はマージして1プランにする）
 * Result is keyed by warehouse NAME (not code).
 */
export function calcAllPlans(
  warehouses: Warehouse[],
  products: Product[],
  truckTypes: TruckType[],
  productionPlan: ProductionPlan,
  baselineStock: BaselineStock,
  locationStock: LocationStock,
  inTransitStock: InTransitStock = {},
  plannedSales: PlannedSales = {},
  sendQtyManual: SendQtyManual = {},
  palletTypes: PalletType[] = [],
  settings: CalcSettings = DEFAULT_CALC_SETTINGS,
): Record<string, WarehousePlan> {
  const truckMap = Object.fromEntries(truckTypes.map(t => [t.code, t]));

  // 在庫不足に基づく送り数を計算（輸送中・予定出荷も考慮）
  const sendQty = calcSendQty(
    products, warehouses, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales, settings,
  );

  // 手動上書きを適用
  applyManualOverrides(sendQty, sendQtyManual);

  const result: Record<string, WarehousePlan> = {};
  const nameGroups = groupWarehousesByName(warehouses);

  for (const [name, whGroup] of nameGroups) {
    const firstWh = whGroup[0];
    const dockTruck = truckMap[firstWh.truckType];
    if (!dockTruck) continue;

    // Merge send quantities: sum over all codes in the group, keyed by name
    const mergedSendQty: Record<string, Record<string, number>> = {};
    for (const p of products) {
      const totalQty = whGroup.reduce((s, wh) => s + (sendQty[p.code]?.[wh.code] ?? 0), 0);
      mergedSendQty[p.code] = { [name]: totalQty };
    }

    const plan = calcWarehousePlan(name, products, dockTruck, truckTypes, mergedSendQty, palletTypes);
    result[name] = plan;
  }
  return result;
}

/** 手動上書きを sendQty に適用する（in-place） */
function applyManualOverrides(
  sendQty: Record<string, Record<string, number>>,
  manual: SendQtyManual,
) {
  for (const [pc, whMap] of Object.entries(manual)) {
    for (const [wc, qty] of Object.entries(whMap)) {
      if (qty > 0) {
        if (!sendQty[pc]) sendQty[pc] = {};
        sendQty[pc][wc] = qty;
      }
    }
  }
}

/**
 * 工場・曜日別の積載計画を計算する
 * factoryCode → DayWarehousePlan[] のマップを返す
 */
export function calcWeeklyPlans(
  warehouses: Warehouse[],
  products: Product[],
  truckTypes: TruckType[],
  factories: Factory[],
  productionPlan: ProductionPlan,
  baselineStock: BaselineStock,
  locationStock: LocationStock,
  schedule: WeeklyShippingSchedule,
  inTransitStock: InTransitStock = {},
  plannedSales: PlannedSales = {},
  sendQtyManual: SendQtyManual = {},
  palletTypes: PalletType[] = [],
  settings: CalcSettings = DEFAULT_CALC_SETTINGS,
): Record<string, DayWarehousePlan[]> {
  const truckMap = Object.fromEntries(truckTypes.map(t => [t.code, t]));
  const result: Record<string, DayWarehousePlan[]> = {};

  for (const factory of factories) {
    const factoryProducts = products.filter(
      (p) => (p.factoryCode ?? 'F001') === factory.code,
    );

    if (factoryProducts.length === 0) {
      result[factory.code] = [];
      continue;
    }

    // 週間送り数を計算（工場の製品のみ、輸送中・予定出荷考慮）
    const weeklySendQty = calcSendQty(
      factoryProducts,
      warehouses,
      productionPlan,
      baselineStock,
      locationStock,
      inTransitStock,
      plannedSales,
      settings,
    );

    // 手動上書きを適用（この工場の製品のみ）
    applyManualOverrides(weeklySendQty, sendQtyManual);

    const dayPlans: DayWarehousePlan[] = [];

    const nameGroups = groupWarehousesByName(warehouses);

    for (const [name, whGroup] of nameGroups) {
      const firstWh = whGroup[0];
      const dockTruck = truckMap[firstWh.truckType];
      if (!dockTruck) continue;

      // Union of active days across all codes in the group
      const activeDaysSet = new Set<number>();
      for (const wh of whGroup) {
        const dayFlags = schedule[factory.code]?.[wh.code];
        if (dayFlags) {
          for (let i = 0; i < 7; i++) {
            if (dayFlags[i]) activeDaysSet.add(i);
          }
        }
      }
      const activeDays = Array.from(activeDaysSet).sort((a, b) => a - b);

      // Merge weekly send quantities: sum over all codes in the group
      if (activeDays.length === 0) {
        // スケジュールなし → 週全体として1プランを作る
        const mergedSendQty: Record<string, Record<string, number>> = {};
        for (const p of factoryProducts) {
          const totalQty = whGroup.reduce((s, wh) => s + (weeklySendQty[p.code]?.[wh.code] ?? 0), 0);
          mergedSendQty[p.code] = { [firstWh.code]: totalQty };
        }
        const plan = calcWarehousePlan(firstWh.code, factoryProducts, dockTruck, truckTypes, mergedSendQty, palletTypes);
        if (plan.trucks.length === 0) continue;
        dayPlans.push({ ...plan, factoryCode: factory.code, dayOfWeek: -1 });
      } else {
        // 曜日ごとにパレット単位で均等分割して計算
        // （個数単位で分割するとパレット未満の端数が生じるため、必ずパレット整数単位で配分する）
        const numDays = activeDays.length;

        for (const dayIdx of activeDays) {
          const daySendQty: Record<string, Record<string, number>> = {};
          const dayPosition = activeDays.indexOf(dayIdx);
          for (const p of factoryProducts) {
            const weeklyQty = whGroup.reduce((s, wh) => s + (weeklySendQty[p.code]?.[wh.code] ?? 0), 0);
            if (weeklyQty === 0) {
              daySendQty[p.code] = { [firstWh.code]: 0 };
              continue;
            }
            // ① 週間個数 → パレット数（1枚未満の端数は切り捨て＝翌週繰越。週次計算と方針統一）
            const weeklyPallets = Math.floor(weeklyQty / p.capacityPerPallet);
            // ② パレット数を日数で均等分割。余りは最初の余り分の日に1枚ずつ積む
            const basePallets     = Math.floor(weeklyPallets / numDays);
            const remainderPallets = weeklyPallets % numDays;
            const palletsForDay   = basePallets + (dayPosition < remainderPallets ? 1 : 0);
            // ③ パレット数 → 個数（満載）
            daySendQty[p.code] = { [firstWh.code]: palletsForDay * p.capacityPerPallet };
          }
          const plan = calcWarehousePlan(firstWh.code, factoryProducts, dockTruck, truckTypes, daySendQty, palletTypes);
          if (plan.trucks.length === 0) continue;
          dayPlans.push({ ...plan, factoryCode: factory.code, dayOfWeek: dayIdx });
        }
      }
    }

    result[factory.code] = dayPlans;
  }

  return result;
}

/** 積載率 (%) — 各トラックの有効容量の合計に対する使用パレット比率。
 *  混在車種に対応するため、台数×単一容量ではなく台数別容量を合算する。
 *  第2引数 maxPallets は後方互換のための任意値（plan に積載があれば無視）。 */
export function fillRate(plan: WarehousePlan, maxPallets?: number): number {
  if (plan.trucks.length === 0) return 0;
  const totalCap = plan.trucks.reduce((s, t) => s + (t.maxPallets || 0), 0);
  if (totalCap > 0) return Math.round((plan.totalPallets / totalCap) * 100);
  if (maxPallets && maxPallets > 0) return Math.round(plan.totalPallets / (plan.trucks.length * maxPallets) * 100);
  return 0;
}

/**
 * 2段積みレイアウトを計算する（視覚化用）
 * TruckLoad の items を rows×cols の2D グリッド（床+上段）に配置する
 * - 前方（row=0）から後方（row=rows-1）へ順に床を埋める
 * - 床パレットの高さ + 上段パレットの高さ ≤ 荷室高さ の場合に上段配置
 * - orderNum は床面を先に振り、その後上段に連番
 * - 積載高さはパレット型の loadedHeightMM を優先し、未設定時は 1200mm
 */
export function calcStackingLayout(
  load: TruckLoad,
  truckType: TruckType,
  products: Product[],
  palletTypes: PalletType[] = [],
): TruckLayout {
  const { cols, rows, heightMM: truckH } = truckType;
  const TRUCK_H = truckH ?? 2300;

  // パレット型コード → loadedHeightMM マップ
  const palletTypeMap = Object.fromEntries(palletTypes.map((pt) => [pt.code, pt]));

  // 製品コード → 積載高さ マップ（パレット型の loadedHeightMM を優先）
  const heightMap: Record<string, number> = {};
  for (const p of products) {
    const pt = palletTypeMap[p.palletType];
    heightMap[p.code] = pt?.loadedHeightMM ?? 1200;
  }

  // 製品コード → スタッキングフラグ マップ
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));

  // 展開キュー（パレット1枚ずつ）
  const queue: TruckSlotItem[] = [];
  let orderNum = 1;
  for (const item of load.items) {
    const h = heightMap[item.productCode] ?? 1200;
    const qtyPerPallet = item.capacityPerPallet;
    for (let i = 0; i < item.pallets; i++) {
      queue.push({
        productCode: item.productCode,
        qty: qtyPerPallet,
        capacityPerPallet: qtyPerPallet,
        loadedHeightMM: h,
        orderNum: orderNum++,
      });
    }
  }

  // 初期化: floor[row][col], upper[row][col]
  const floor: (TruckSlotItem | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  const upper: (TruckSlotItem | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));

  // Phase 1: 床面を前→後、左→右の順に埋める
  outer1: for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (queue.length === 0) break outer1;
      floor[row][col] = queue.shift()!;
    }
  }

  // Phase 2: 上段に積めるか確認して埋める（床面と同順）
  outer2: for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (queue.length === 0) break outer2;
      const fp = floor[row][col];
      if (!fp) continue; // 床が空 → 上段も不可
      // 下段製品の「上積み許可」チェック
      const floorProd = productMap[fp.productCode];
      if (floorProd?.allowStackOnTop === false) continue;
      // 上段候補製品の「上段積み可」チェック（スキップして次の候補を探す）
      let placed = false;
      for (let qi = 0; qi < queue.length; qi++) {
        const candidate = queue[qi];
        const candidateProd = productMap[candidate.productCode];
        if (candidateProd?.stackable === false) continue;
        if (fp.loadedHeightMM + candidate.loadedHeightMM > TRUCK_H) continue;
        // 条件を満たす候補を上段に配置
        upper[row][col] = { ...candidate, orderNum: orderNum++ };
        queue.splice(qi, 1);
        placed = true;
        break;
      }
      if (!placed && queue.length === 0) break outer2;
    }
  }

  return { cols, rows, truckHeightMM: TRUCK_H, floor, upper };
}

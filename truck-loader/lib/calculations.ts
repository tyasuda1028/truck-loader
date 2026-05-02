import type {
  Factory, Product, Warehouse, TruckType,
  ProductionPlan, DistributionRatios,
  InventoryStock, LocationStock, InTransitStock, PlannedSales, SendQtyManual,
  PalletItem, TruckLoad, TruckLayout, TruckSlotItem, WarehousePlan,
  WeeklyShippingSchedule, DayWarehousePlan,
} from './types';

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

/**
 * 在庫不足に基づいて各拠点への送り数を計算する
 * 全体在庫 × 配分比率 = 必要在庫
 * 有効在庫 = max(0, 拠点在庫 + 輸送中 - 予定出荷)
 * 不足数 = max(0, 必要 - 有効在庫)
 * 生産数を不足比率で按分して送り数を決定する
 */
export function calcSendQty(
  products: Product[],
  warehouses: Warehouse[],
  productionPlan: ProductionPlan,
  ratios: DistributionRatios,
  inventoryStock: InventoryStock,
  locationStock: LocationStock,
  inTransitStock: InTransitStock = {},
  plannedSales: PlannedSales = {},
): Record<string, Record<string, number>> {
  const sendQty: Record<string, Record<string, number>> = {};

  for (const p of products) {
    const totalInventory = inventoryStock[p.code] ?? 0;
    const production = productionPlan[p.code] ?? 0;
    sendQty[p.code] = {};

    // 各拠点の不足数を計算（拠点在庫 + 輸送中 - 予定出荷 を有効在庫とする）
    const shortages: Record<string, number> = {};
    let totalShortage = 0;

    for (const wh of warehouses) {
      const ratio = ratios[p.code]?.[wh.code] ?? 0;
      const required = Math.round(totalInventory * ratio / 100);
      const currentStock = locationStock[p.code]?.[wh.code] ?? 0;
      const inTransit = inTransitStock[p.code]?.[wh.code] ?? 0;
      const sales = plannedSales[p.code]?.[wh.code] ?? 0;
      const effectiveStock = Math.max(0, currentStock + inTransit - sales);
      const shortage = Math.max(0, required - effectiveStock);
      shortages[wh.code] = shortage;
      totalShortage += shortage;
    }

    // 生産数を不足比率で按分
    for (const wh of warehouses) {
      const shortage = shortages[wh.code] ?? 0;
      if (totalShortage === 0 || production === 0) {
        sendQty[p.code][wh.code] = 0;
      } else if (totalShortage <= production) {
        // 生産数が不足を全て賄える場合：不足数をそのまま送る
        sendQty[p.code][wh.code] = shortage;
      } else {
        // 生産数が不足に満たない場合：比率で按分
        sendQty[p.code][wh.code] = Math.round(production * shortage / totalShortage);
      }
    }
  }

  return sendQty;
}

/**
 * 1拠点分の積載計画を計算する（送り数を外部から受け取る）
 */
export function calcWarehousePlan(
  warehouseCode: string,
  products: Product[],
  truckType: TruckType,
  sendQty: Record<string, Record<string, number>>,
): WarehousePlan {
  const maxPal = truckType.maxPallets;

  // 製品ごとに送り数 → パレット数を計算
  const items: (PalletItem & { originalPallets: number; remaining: number })[] = [];
  for (const p of products) {
    const qty = sendQty[p.code]?.[warehouseCode] ?? 0;
    if (qty <= 0) continue;
    const pallets = ceilDiv(qty, p.capacityPerPallet);
    items.push({
      productCode: p.code,
      pallets,
      qty,
      capacityPerPallet: p.capacityPerPallet,
      originalPallets: pallets,
      remaining: pallets,
    });
  }

  if (items.length === 0) {
    return { warehouseCode, trucks: [], totalPallets: 0, totalQty: 0 };
  }

  // 多パレット順に並び替え（重量・数量の多いものをキャブ側へ）
  items.sort((a, b) => b.pallets - a.pallets);

  // グリーディ bin-pack
  const trucks: TruckLoad[] = [];
  let currentItems: PalletItem[] = [];
  let currentSlots = 0;

  for (const item of items) {
    let rem = item.remaining;
    let qtyRem = item.qty;

    while (rem > 0) {
      if (currentSlots >= maxPal) {
        trucks.push({
          truckIndex: trucks.length + 1,
          items: currentItems,
          totalPallets: currentSlots,
          maxPallets: maxPal,
        });
        currentItems = [];
        currentSlots = 0;
      }
      const canFit = maxPal - currentSlots;
      const place = Math.min(rem, canFit);
      const qtyHere = Math.min(qtyRem, place * item.capacityPerPallet);
      currentItems.push({
        productCode: item.productCode,
        pallets: place,
        qty: qtyHere,
        capacityPerPallet: item.capacityPerPallet,
      });
      currentSlots += place;
      rem -= place;
      qtyRem -= qtyHere;
    }
  }
  if (currentItems.length > 0) {
    trucks.push({
      truckIndex: trucks.length + 1,
      items: currentItems,
      totalPallets: currentSlots,
      maxPallets: maxPal,
    });
  }

  const totalPallets = trucks.reduce((s, t) => s + t.totalPallets, 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  return { warehouseCode, trucks, totalPallets, totalQty };
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
  ratios: DistributionRatios,
  inventoryStock: InventoryStock,
  locationStock: LocationStock,
  inTransitStock: InTransitStock = {},
  plannedSales: PlannedSales = {},
  sendQtyManual: SendQtyManual = {},
): Record<string, WarehousePlan> {
  const truckMap = Object.fromEntries(truckTypes.map(t => [t.code, t]));

  // 在庫不足に基づく送り数を計算（輸送中・予定出荷も考慮）
  const sendQty = calcSendQty(
    products, warehouses, productionPlan, ratios, inventoryStock, locationStock, inTransitStock, plannedSales,
  );

  // 手動上書きを適用
  applyManualOverrides(sendQty, sendQtyManual);

  const result: Record<string, WarehousePlan> = {};
  const nameGroups = groupWarehousesByName(warehouses);

  for (const [name, whGroup] of nameGroups) {
    const firstWh = whGroup[0];
    const truck = truckMap[firstWh.truckType];
    if (!truck) continue;

    // Merge send quantities: sum over all codes in the group, keyed by name
    const mergedSendQty: Record<string, Record<string, number>> = {};
    for (const p of products) {
      const totalQty = whGroup.reduce((s, wh) => s + (sendQty[p.code]?.[wh.code] ?? 0), 0);
      mergedSendQty[p.code] = { [name]: totalQty };
    }

    const plan = calcWarehousePlan(name, products, truck, mergedSendQty);
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
  ratios: DistributionRatios,
  inventoryStock: InventoryStock,
  locationStock: LocationStock,
  schedule: WeeklyShippingSchedule,
  inTransitStock: InTransitStock = {},
  plannedSales: PlannedSales = {},
  sendQtyManual: SendQtyManual = {},
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
      ratios,
      inventoryStock,
      locationStock,
      inTransitStock,
      plannedSales,
    );

    // 手動上書きを適用（この工場の製品のみ）
    applyManualOverrides(weeklySendQty, sendQtyManual);

    const dayPlans: DayWarehousePlan[] = [];

    const nameGroups = groupWarehousesByName(warehouses);

    for (const [name, whGroup] of nameGroups) {
      const firstWh = whGroup[0];
      const truck = truckMap[firstWh.truckType];
      if (!truck) continue;

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
        const plan = calcWarehousePlan(firstWh.code, factoryProducts, truck, mergedSendQty);
        if (plan.trucks.length === 0) continue;
        dayPlans.push({ ...plan, factoryCode: factory.code, dayOfWeek: -1 });
      } else {
        // 曜日ごとに送り数を均等分割して計算
        const numDays = activeDays.length;

        for (const dayIdx of activeDays) {
          const daySendQty: Record<string, Record<string, number>> = {};
          for (const p of factoryProducts) {
            const weeklyQty = whGroup.reduce((s, wh) => s + (weeklySendQty[p.code]?.[wh.code] ?? 0), 0);
            const base = Math.floor(weeklyQty / numDays);
            const remainder = weeklyQty % numDays;
            // 最初のアクティブ日（activeDays[0]）に余りを加算
            const extra = dayIdx === activeDays[0] ? remainder : 0;
            daySendQty[p.code] = { [firstWh.code]: base + extra };
          }
          const plan = calcWarehousePlan(firstWh.code, factoryProducts, truck, daySendQty);
          if (plan.trucks.length === 0) continue;
          dayPlans.push({ ...plan, factoryCode: factory.code, dayOfWeek: dayIdx });
        }
      }
    }

    result[factory.code] = dayPlans;
  }

  return result;
}

/** 積載率 (%) */
export function fillRate(plan: WarehousePlan, maxPallets: number): number {
  if (plan.trucks.length === 0) return 0;
  return Math.round(plan.totalPallets / (plan.trucks.length * maxPallets) * 100);
}

/**
 * 2段積みレイアウトを計算する（視覚化用）
 * TruckLoad の items を rows×cols の2D グリッド（床+上段）に配置する
 * - 前方（row=0）から後方（row=rows-1）へ順に床を埋める
 * - 床パレットの高さ + 上段パレットの高さ ≤ 荷室高さ の場合に上段配置
 * - orderNum は床面を先に振り、その後上段に連番
 */
export function calcStackingLayout(
  load: TruckLoad,
  truckType: TruckType,
  products: Product[],
): TruckLayout {
  const { cols, rows, heightMM: truckH } = truckType;
  const TRUCK_H = truckH ?? 2300;

  // 製品コード → 積載高さ マップ
  const heightMap: Record<string, number> = {};
  for (const p of products) heightMap[p.code] = p.loadedHeightMM ?? 1200;

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
      const nextH = queue[0].loadedHeightMM;
      if (fp.loadedHeightMM + nextH <= TRUCK_H) {
        // 上段に積める → orderNum は後段連番
        upper[row][col] = { ...queue.shift()!, orderNum: orderNum++ };
      }
    }
  }

  return { cols, rows, truckHeightMM: TRUCK_H, floor, upper };
}

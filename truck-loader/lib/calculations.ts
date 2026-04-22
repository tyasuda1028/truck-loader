import type {
  Factory, Product, Warehouse, TruckType,
  ProductionPlan, DistributionRatios,
  InventoryStock, LocationStock, InTransitStock,
  PalletItem, TruckLoad, WarehousePlan,
  WeeklyShippingSchedule, DayWarehousePlan,
} from './types';

/** 切り上げ除算 */
const ceilDiv = (a: number, b: number) => (b > 0 ? Math.ceil(a / b) : 0);

/**
 * 在庫不足に基づいて各拠点への送り数を計算する
 * 全体在庫 × 配分比率 = 必要在庫
 * 有効在庫 = 拠点在庫 + 輸送中数量
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
): Record<string, Record<string, number>> {
  const sendQty: Record<string, Record<string, number>> = {};

  for (const p of products) {
    const totalInventory = inventoryStock[p.code] ?? 0;
    const production = productionPlan[p.code] ?? 0;
    sendQty[p.code] = {};

    // 各拠点の不足数を計算（拠点在庫 + 輸送中を有効在庫とする）
    const shortages: Record<string, number> = {};
    let totalShortage = 0;

    for (const wh of warehouses) {
      const ratio = ratios[p.code]?.[wh.code] ?? 0;
      const required = Math.round(totalInventory * ratio / 100);
      const currentStock = locationStock[p.code]?.[wh.code] ?? 0;
      const inTransit = inTransitStock[p.code]?.[wh.code] ?? 0;
      const effectiveStock = currentStock + inTransit;
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
 * 全拠点の積載計画を計算する
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
): Record<string, WarehousePlan> {
  const truckMap = Object.fromEntries(truckTypes.map(t => [t.code, t]));

  // 在庫不足に基づく送り数を計算（輸送中も考慮）
  const sendQty = calcSendQty(
    products, warehouses, productionPlan, ratios, inventoryStock, locationStock, inTransitStock,
  );

  const result: Record<string, WarehousePlan> = {};
  for (const wh of warehouses) {
    const truck = truckMap[wh.truckType];
    if (!truck) continue;
    result[wh.code] = calcWarehousePlan(wh.code, products, truck, sendQty);
  }
  return result;
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

    // 週間送り数を計算（工場の製品のみ、輸送中考慮）
    const weeklySendQty = calcSendQty(
      factoryProducts,
      warehouses,
      productionPlan,
      ratios,
      inventoryStock,
      locationStock,
      inTransitStock,
    );

    const dayPlans: DayWarehousePlan[] = [];

    for (const wh of warehouses) {
      const truck = truckMap[wh.truckType];
      if (!truck) continue;

      // スケジュール上のアクティブ日を取得
      const dayFlags = schedule[factory.code]?.[wh.code]; // boolean[7] or undefined
      const activeDays: number[] = [];
      if (dayFlags) {
        for (let i = 0; i < 7; i++) {
          if (dayFlags[i]) activeDays.push(i);
        }
      }

      if (activeDays.length === 0) {
        // スケジュールなし → 週全体として1プランを作る
        const plan = calcWarehousePlan(wh.code, factoryProducts, truck, weeklySendQty);
        if (plan.trucks.length === 0) continue;
        dayPlans.push({ ...plan, factoryCode: factory.code, dayOfWeek: -1 });
      } else {
        // 曜日ごとに送り数を均等分割して計算
        const numDays = activeDays.length;

        for (const dayIdx of activeDays) {
          // 各製品・各拠点の送り数を days で均等分割（余りは最初の曜日に加算）
          const daySendQty: Record<string, Record<string, number>> = {};
          for (const p of factoryProducts) {
            daySendQty[p.code] = {};
            const weeklyQty = weeklySendQty[p.code]?.[wh.code] ?? 0;
            const base = Math.floor(weeklyQty / numDays);
            const remainder = weeklyQty % numDays;
            // 最初のアクティブ日（activeDays[0]）に余りを加算
            const extra = dayIdx === activeDays[0] ? remainder : 0;
            daySendQty[p.code][wh.code] = base + extra;
          }
          const plan = calcWarehousePlan(wh.code, factoryProducts, truck, daySendQty);
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

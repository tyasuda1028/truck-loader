import type {
  Product, Warehouse, TruckType,
  ProductionPlan, DistributionRatios,
  InventoryStock, LocationStock,
  PalletItem, TruckLoad, WarehousePlan,
} from './types';

/** 切り上げ除算 */
const ceilDiv = (a: number, b: number) => (b > 0 ? Math.ceil(a / b) : 0);

/**
 * 在庫不足に基づいて各拠点への送り数を計算する
 * 全体在庫 × 配分比率 = 必要在庫 → 不足数 = max(0, 必要 - 現在庫)
 * 生産数を不足比率で按分して送り数を決定する
 */
export function calcSendQty(
  products: Product[],
  warehouses: Warehouse[],
  productionPlan: ProductionPlan,
  ratios: DistributionRatios,
  inventoryStock: InventoryStock,
  locationStock: LocationStock,
): Record<string, Record<string, number>> {
  const sendQty: Record<string, Record<string, number>> = {};

  for (const p of products) {
    const totalInventory = inventoryStock[p.code] ?? 0;
    const production = productionPlan[p.code] ?? 0;
    sendQty[p.code] = {};

    // 各拠点の不足数を計算
    const shortages: Record<string, number> = {};
    let totalShortage = 0;

    for (const wh of warehouses) {
      const ratio = ratios[p.code]?.[wh.code] ?? 0;
      const required = Math.round(totalInventory * ratio / 100);
      const currentStock = locationStock[p.code]?.[wh.code] ?? 0;
      const shortage = Math.max(0, required - currentStock);
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
): Record<string, WarehousePlan> {
  const truckMap = Object.fromEntries(truckTypes.map(t => [t.code, t]));

  // 在庫不足に基づく送り数を計算
  const sendQty = calcSendQty(
    products, warehouses, productionPlan, ratios, inventoryStock, locationStock,
  );

  const result: Record<string, WarehousePlan> = {};
  for (const wh of warehouses) {
    const truck = truckMap[wh.truckType];
    if (!truck) continue;
    result[wh.code] = calcWarehousePlan(wh.code, products, truck, sendQty);
  }
  return result;
}

/** 積載率 (%) */
export function fillRate(plan: WarehousePlan, maxPallets: number): number {
  if (plan.trucks.length === 0) return 0;
  return Math.round(plan.totalPallets / (plan.trucks.length * maxPallets) * 100);
}

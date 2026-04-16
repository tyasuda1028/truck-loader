import type {
  Product, Warehouse, TruckType,
  ProductionPlan, DistributionRatios,
  PalletItem, TruckLoad, WarehousePlan,
} from './types';

/** 切り上げ除算 */
const ceilDiv = (a: number, b: number) => (b > 0 ? Math.ceil(a / b) : 0);

/**
 * 1拠点分の積載計画を計算する
 */
export function calcWarehousePlan(
  warehouseCode: string,
  products: Product[],
  truckType: TruckType,
  productionPlan: ProductionPlan,
  ratios: DistributionRatios,
): WarehousePlan {
  const maxPal = truckType.maxPallets;

  // 製品ごとに送り数 → パレット数を計算
  const items: (PalletItem & { originalPallets: number; remaining: number })[] = [];
  for (const p of products) {
    const weeklyQty = productionPlan[p.code] ?? 0;
    const ratio = ratios[p.code]?.[warehouseCode] ?? 0;
    const qty = Math.round(weeklyQty * ratio / 100);
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
): Record<string, WarehousePlan> {
  const truckMap = Object.fromEntries(truckTypes.map(t => [t.code, t]));
  const result: Record<string, WarehousePlan> = {};

  for (const wh of warehouses) {
    const truck = truckMap[wh.truckType];
    if (!truck) continue;
    result[wh.code] = calcWarehousePlan(
      wh.code, products, truck, productionPlan, ratios,
    );
  }
  return result;
}

/** 積載率 (%) */
export function fillRate(plan: WarehousePlan, maxPallets: number): number {
  if (plan.trucks.length === 0) return 0;
  return Math.round(plan.totalPallets / (plan.trucks.length * maxPallets) * 100);
}

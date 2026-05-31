import { z } from 'zod';
import type {
  Product, Warehouse, TruckType, PalletType,
  ProductionPlan, BaselineStock, LocationStock, InTransitStock,
  PlannedSales, SendQtyManual, WeeklyShippingSchedule,
} from './types';
import {
  calcDistributionDetail, calcAllPlans, fillRate, groupWarehousesByName,
} from './calculations';

// ─── AIに渡すコンテキスト ──────────────────────────────────────────────
// 決定的計算エンジンの結果を「正」として要約し、トークン効率の良い
// JSON ペイロードに整形する。AIはこれを読んで助言（提案・説明）を返す。

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];
/** 配分内訳の最大行数（トークン上限のため不足数の多い順に制限） */
export const MAX_DISTRIBUTION_ROWS = 60;

/** buildAiContext の入力（store のスライスをそのまま渡せる形） */
export interface AiContextInput {
  products: Product[];
  warehouses: Warehouse[];
  truckTypes: TruckType[];
  palletTypes: PalletType[];
  productionPlan: ProductionPlan;
  baselineStock: BaselineStock;
  locationStock: LocationStock;
  inTransitStock: InTransitStock;
  plannedSales: PlannedSales;
  sendQtyManual: SendQtyManual;
  weeklyShippingSchedule: WeeklyShippingSchedule;
}

export interface AiContextPayload {
  trucks: { code: string; name: string; maxPallets: number; cols: number; rows: number }[];
  pallets: { code: string; name: string; maxWeightKg: number; loadedHeightMM?: number }[];
  products: {
    code: string; name: string; capacityPerPallet: number; palletType: string;
    stackable: boolean; allowStackOnTop: boolean; boxWeightKg?: number; factoryCode: string;
  }[];
  warehouses: { code: string; name: string; truckType: string; maxPallets: number }[];
  distribution: {
    product: string; warehouse: string;
    required: number; effectiveStock: number; shortage: number; sendQty: number;
  }[];
  plans: {
    warehouse: string; truckType: string; trucks: number;
    totalPallets: number; totalQty: number; fillRatePct: number;
  }[];
  schedule: { factory: string; warehouse: string; days: string[] }[];
}

/** ルートでの防御的バリデーション用スキーマ（形が壊れていれば 400 を返す） */
export const aiContextPayloadSchema = z.object({
  trucks: z.array(z.object({
    code: z.string(), name: z.string(), maxPallets: z.number(), cols: z.number(), rows: z.number(),
  })),
  pallets: z.array(z.object({
    code: z.string(), name: z.string(), maxWeightKg: z.number(), loadedHeightMM: z.number().optional(),
  })),
  products: z.array(z.object({
    code: z.string(), name: z.string(), capacityPerPallet: z.number(), palletType: z.string(),
    stackable: z.boolean(), allowStackOnTop: z.boolean(), boxWeightKg: z.number().optional(), factoryCode: z.string(),
  })),
  warehouses: z.array(z.object({
    code: z.string(), name: z.string(), truckType: z.string(), maxPallets: z.number(),
  })),
  distribution: z.array(z.object({
    product: z.string(), warehouse: z.string(),
    required: z.number(), effectiveStock: z.number(), shortage: z.number(), sendQty: z.number(),
  })),
  plans: z.array(z.object({
    warehouse: z.string(), truckType: z.string(), trucks: z.number(),
    totalPallets: z.number(), totalQty: z.number(), fillRatePct: z.number(),
  })),
  schedule: z.array(z.object({
    factory: z.string(), warehouse: z.string(), days: z.array(z.string()),
  })),
});

/**
 * store スライス + 計算結果から token-lean なペイロードを生成する。
 * クライアント側で実行し、その結果のみをルートへ送る（生データは送らない）。
 */
export function buildAiContext(input: AiContextInput): AiContextPayload {
  const {
    products, warehouses, truckTypes, palletTypes,
    productionPlan, baselineStock, locationStock, inTransitStock,
    plannedSales, sendQtyManual, weeklyShippingSchedule,
  } = input;

  // ── マスタ（AIが参照しない hex色・段ボール寸法などは落とす）──
  const trucksOut = truckTypes.map((t) => ({
    code: t.code, name: t.name, maxPallets: t.maxPallets, cols: t.cols, rows: t.rows,
  }));
  const palletsOut = palletTypes.map((pt) => ({
    code: pt.code, name: pt.name, maxWeightKg: pt.maxWeightKg, loadedHeightMM: pt.loadedHeightMM,
  }));
  const productsOut = products.map((p) => ({
    code: p.code, name: p.name, capacityPerPallet: p.capacityPerPallet, palletType: p.palletType,
    stackable: p.stackable !== false, allowStackOnTop: p.allowStackOnTop !== false,
    boxWeightKg: p.boxWeightKg, factoryCode: p.factoryCode ?? 'F001',
  }));
  const warehousesOut = warehouses.map((w) => ({
    code: w.code, name: w.name, truckType: w.truckType, maxPallets: w.maxPallets,
  }));

  // ── 配分内訳（手動上書きを current として反映、不足の多い順に上限N件）──
  const detail = calcDistributionDetail(
    products, warehouses, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales,
  );
  const distribution = detail
    .map((r) => {
      const manual = sendQtyManual[r.productCode]?.[r.warehouseCode] ?? 0;
      const sendQty = manual > 0 ? manual : r.sendQty;
      return {
        product: r.productCode, warehouse: r.warehouseCode,
        required: r.required, effectiveStock: r.effectiveStock, shortage: r.shortage, sendQty,
      };
    })
    .filter((r) => r.shortage > 0 || r.sendQty > 0)
    .sort((a, b) => b.shortage - a.shortage || b.sendQty - a.sendQty)
    .slice(0, MAX_DISTRIBUTION_ROWS);

  // ── 積載プラン要約（同名拠点はマージ済み）──
  const allPlans = calcAllPlans(
    warehouses, products, truckTypes, productionPlan, baselineStock, locationStock,
    inTransitStock, plannedSales, sendQtyManual, palletTypes,
  );
  const nameGroups = groupWarehousesByName(warehouses);
  const plans = Object.entries(allPlans)
    .map(([name, plan]) => {
      const firstWh = nameGroups.get(name)?.[0];
      const maxPal = plan.trucks[0]?.maxPallets ?? firstWh?.maxPallets ?? 0;
      return {
        warehouse: name,
        truckType: firstWh?.truckType ?? '',
        trucks: plan.trucks.length,
        totalPallets: plan.totalPallets,
        totalQty: plan.totalQty,
        fillRatePct: fillRate(plan, maxPal),
      };
    })
    .filter((p) => p.trucks > 0);

  // ── 出荷スケジュール（稼働日のある拠点のみ）──
  const schedule: AiContextPayload['schedule'] = [];
  for (const [factory, whMap] of Object.entries(weeklyShippingSchedule)) {
    for (const [warehouse, flags] of Object.entries(whMap)) {
      const days = (flags ?? []).map((on, i) => (on ? DAY_LABELS[i] : null)).filter(Boolean) as string[];
      if (days.length > 0) schedule.push({ factory, warehouse, days });
    }
  }

  return {
    trucks: trucksOut, pallets: palletsOut, products: productsOut,
    warehouses: warehousesOut, distribution, plans, schedule,
  };
}

/** AIへのシステムプロンプト（日本語出力・助言の境界を明示） */
export const SYSTEM_PROMPT_JA = `あなたは中小製造業向けの物流・トラック積載の専門アドバイザーです。
与えられた計算済みデータ（製品・拠点・トラック・パレット・送り数・不足/有効在庫・積載率・出荷スケジュール）を分析し、現場担当者が理解できる実践的な助言を日本語で出力してください。

重要な制約:
- 計算エンジンが算出した数値（送り数・不足数・積載率など）が「正」です。あなたは助言を行うのみで、最終決定はしません。
- 積み付けは「重量物・上積み不可(allowStackOnTop=false)の製品を下段、軽量で積み重ね可(stackable)の製品を上段」を原則とし、その上にあるものは積まないでください。
- トラック選定では、積載率が低い便の統合や、より適切な車種への変更を検討してください。各拠点は warehouse.truckType の車種を使う前提ですが、より良い案があれば理由を添えて提案してください。
- 送り数の調整提案は必ず具体的な理由（過剰在庫・不足・積載効率など）を添え、現実的な範囲（0以上の整数）にしてください。
- すべての文章は日本語で記述し、出力スキーマに厳密に従ってください。提案が無い項目は空配列にしてください。`;

import { z } from 'zod';

// ─── AI提案 構造化出力スキーマ ────────────────────────────────────────
// 助言レイヤーの出力。決定的計算エンジンの数値が「正」であり、
// ここでの提案はあくまでアドバイス（表示専用、反映は任意）。

/** ① トラック選定: どの拠点にどの車種を何台、便の統合提案 */
const truckSelectionSchema = z.object({
  warehouse: z.string().describe('対象の倉庫コードまたは名称'),
  recommendedTruckType: z.string().describe('推奨トラックタイプ（例: T01〜T06）'),
  truckCount: z.number().int().min(0).describe('推奨台数'),
  consolidateWith: z
    .array(z.string())
    .describe('便を統合できる他の倉庫コード/名称。なければ空配列。'),
  reason: z.string().describe('この提案の理由（日本語）'),
});

/** ② 積載方法・順序: 1台分の積み付け指示 */
const loadingSequenceSchema = z.object({
  productCode: z.string().describe('製品コード'),
  position: z.enum(['下段', '上段']).describe('配置段'),
  orderNote: z.string().describe('積み込み順序・重量配置の指示（日本語）'),
});

const loadingPlanSchema = z.object({
  warehouse: z.string().describe('対象の倉庫コードまたは名称'),
  truckIndex: z.number().int().min(1).describe('何号車か（1始まり）'),
  sequence: z
    .array(loadingSequenceSchema)
    .describe('積み付け順序の指示。重量物を下段、stackableを上段に。'),
  note: z.string().describe('この車両の積載に関する補足（日本語）'),
});

/** ③ 配分の最適化: 送り数の調整提案（suggestedQtyはSendQtyManualに直結） */
const distributionAdjustmentSchema = z.object({
  productCode: z.string().describe('製品コード'),
  warehouse: z.string().describe('倉庫コード'),
  currentQty: z.number().int().describe('現在の送り数（個）'),
  suggestedQty: z.number().int().min(0).describe('推奨する送り数（個）'),
  reason: z.string().describe('調整理由（日本語）'),
});

/** ④ 警告 */
const warningSchema = z.object({
  severity: z.enum(['info', 'warning', 'critical']).describe('重要度'),
  message: z.string().describe('警告内容（日本語）'),
  relatedWarehouse: z.string().optional().describe('関連する倉庫（あれば）'),
});

export const recommendationSchema = z.object({
  summary: z.string().describe('全体の要約（日本語、2〜4文）'),
  truckSelection: z
    .array(truckSelectionSchema)
    .describe('トラック選定の提案。なければ空配列。'),
  loadingPlan: z
    .array(loadingPlanSchema)
    .describe('積載方法・順序の提案。なければ空配列。'),
  distributionAdjustments: z
    .array(distributionAdjustmentSchema)
    .describe('送り数の調整提案。問題なければ空配列。'),
  warnings: z
    .array(warningSchema)
    .describe('過不足・積載非効率・コスト高などの警告。なければ空配列。'),
});

export type AiRecommendation = z.infer<typeof recommendationSchema>;
export type TruckSelectionItem = z.infer<typeof truckSelectionSchema>;
export type LoadingPlanItem = z.infer<typeof loadingPlanSchema>;
export type DistributionAdjustment = z.infer<typeof distributionAdjustmentSchema>;
export type AiWarning = z.infer<typeof warningSchema>;

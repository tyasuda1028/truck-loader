'use client';

import { useCallback, useState } from 'react';
import { useAppStore } from './store';
import { buildAiContext } from './aiContext';
import type { AiRecommendation } from './aiSchema';

/**
 * AI提案を取得するクライアントフック。
 * 現在の store 状態から compact ペイロードを生成して /api/ai-recommendation に POST する。
 * in-flight 中は generate() を無視（多重実行・コスト増を防止）。
 */
export function useAiRecommendation() {
  const [data, setData] = useState<AiRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const s = useAppStore.getState();
      const payload = buildAiContext({
        products: s.products,
        warehouses: s.warehouses,
        truckTypes: s.truckTypes,
        palletTypes: s.palletTypes,
        productionPlan: s.productionPlan,
        baselineStock: s.baselineStock,
        locationStock: s.locationStock,
        inTransitStock: s.inTransitStock,
        plannedSales: s.plannedSales,
        sendQtyManual: s.sendQtyManual,
        weeklyShippingSchedule: s.weeklyShippingSchedule,
      });
      const res = await fetch('/api/ai-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message ?? 'AI推奨の生成に失敗しました。');
        return;
      }
      setData((json?.recommendation ?? null) as AiRecommendation | null);
    } catch {
      setError('通信エラーが発生しました。ネットワークを確認してください。');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, generate, reset };
}

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans, fillRate } from '@/lib/calculations';
import clsx from 'clsx';

export default function DashboardPage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock, locationStock,
  } = useAppStore();

  const plans = useMemo(
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock),
    [warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock],
  );

  const truckMap = Object.fromEntries(truckTypes.map((t) => [t.code, t]));
  const factoryMap = Object.fromEntries(factories.map((f) => [f.code, f]));

  // サマリー集計
  const activePlans = Object.values(plans).filter((p) => p.trucks.length > 0);
  const totalTrucks = activePlans.reduce((s, p) => s + p.trucks.length, 0);
  const totalPallets = activePlans.reduce((s, p) => s + p.totalPallets, 0);
  const totalQty = activePlans.reduce((s, p) => s + p.totalQty, 0);
  const totalProductQty = Object.values(productionPlan).reduce((s, v) => s + v, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">ダッシュボード</h1>
        <p className="text-sm text-slate-500 mt-0.5">今週の出荷計画サマリー</p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: '使用台数', value: totalTrucks, unit: '台', icon: '🚛' },
          { label: '総パレット数', value: totalPallets, unit: '枚', icon: '📦' },
          { label: '総出荷個数', value: totalQty.toLocaleString(), unit: '個', icon: '📊' },
          { label: '出荷拠点数', value: activePlans.length, unit: '拠点', icon: '🏭' },
        ].map(({ label, value, unit, icon }) => (
          <div key={label} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-brand-600">{value}</div>
            <div className="text-xs text-slate-400">{unit}</div>
            <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* 今週の生産計画サマリー */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
            今週の生産計画
          </h2>
          <Link href="/production" className="text-xs text-brand-600 hover:underline">
            編集 →
          </Link>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="px-4 py-2 text-left font-semibold">製品コード</th>
                <th className="px-4 py-2 text-left font-semibold">製品名</th>
                <th className="px-4 py-2 text-right font-semibold">週間生産数</th>
                <th className="px-4 py-2 text-right font-semibold">換算パレット</th>
              </tr>
            </thead>
            <tbody>
              {factories.map((factory) => {
                const factoryProducts = products.filter(
                  (p) => (p.factoryCode ?? 'F001') === factory.code,
                );
                if (factoryProducts.length === 0) return null;

                const factoryQty = factoryProducts.reduce(
                  (s, p) => s + (productionPlan[p.code] ?? 0), 0,
                );
                const factoryPals = factoryProducts.reduce((s, p) => {
                  const qty = productionPlan[p.code] ?? 0;
                  return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                }, 0);

                return (
                  <>
                    {/* 工場ヘッダ行 */}
                    <tr key={`factory-${factory.code}`} className="bg-indigo-50 border-t-2 border-indigo-100">
                      <td colSpan={4} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                            {factory.code}
                          </span>
                          <span className="text-sm font-semibold text-indigo-800">{factory.name}</span>
                        </div>
                      </td>
                    </tr>

                    {/* 工場の製品行 */}
                    {factoryProducts.map((p) => {
                      const qty = productionPlan[p.code] ?? 0;
                      const pals = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                      return (
                        <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
                                style={{ background: p.color }}
                              />
                              <span className="font-mono text-xs text-slate-500">{p.code}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 font-medium text-slate-700">{p.name}</td>
                          <td className="px-4 py-2 text-right font-medium">
                            {qty > 0 ? `${qty.toLocaleString()}個` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-500">
                            {pals > 0 ? `${pals}枚` : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}

                    {/* 工場小計行 */}
                    <tr key={`subtotal-${factory.code}`} className="border-t border-indigo-100 bg-indigo-50/60">
                      <td className="px-4 py-1.5 text-xs text-indigo-500 font-semibold" colSpan={2}>
                        {factory.name} 小計
                      </td>
                      <td className="px-4 py-1.5 text-right text-xs font-bold text-indigo-600">
                        {factoryQty.toLocaleString()}個
                      </td>
                      <td className="px-4 py-1.5 text-right text-xs font-bold text-indigo-500">
                        {factoryPals}枚
                      </td>
                    </tr>
                  </>
                );
              })}

              {/* 合計行 */}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-4 py-2 text-slate-600" colSpan={2}>総合計</td>
                <td className="px-4 py-2 text-right text-brand-600">
                  {totalProductQty.toLocaleString()}個
                </td>
                <td className="px-4 py-2 text-right text-slate-500">{totalPallets}枚</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 拠点別出荷サマリー */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
            拠点別 積載計画
          </h2>
          <Link href="/loading-plan" className="text-xs text-brand-600 hover:underline">
            詳細を見る →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {warehouses.map((wh) => {
            const plan = plans[wh.code];
            const truck = truckMap[wh.truckType];
            const hasPlan = plan && plan.trucks.length > 0;
            const fr = hasPlan && truck ? fillRate(plan, truck.maxPallets) : 0;

            return (
              <Link
                key={wh.code}
                href={`/loading-plan?wh=${wh.code}`}
                className={clsx(
                  'bg-white rounded-lg border border-slate-200 p-4 shadow-sm hover:shadow-md',
                  'hover:border-brand-500 transition-all',
                  !hasPlan && 'opacity-50',
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-xs font-bold text-slate-400">{wh.code}</div>
                    <div className="text-sm font-semibold text-slate-800">{wh.name}</div>
                  </div>
                  <span
                    className={clsx(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      wh.group === '東'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-red-100 text-red-700',
                    )}
                  >
                    {wh.group}
                  </span>
                </div>

                {hasPlan ? (
                  <>
                    <div className="flex gap-4 text-xs text-slate-500 mb-2">
                      <span>
                        <strong className="text-slate-800">{plan.trucks.length}</strong> 台
                      </span>
                      <span>
                        <strong className="text-slate-800">{plan.totalPallets}</strong> パレット
                      </span>
                      <span>
                        <strong className="text-slate-800">{plan.totalQty.toLocaleString()}</strong> 個
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full',
                          fr >= 90 ? 'bg-emerald-500' : fr >= 60 ? 'bg-amber-400' : 'bg-red-400',
                        )}
                        style={{ width: `${fr}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 text-right">積載率 {fr}%</div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400 italic">今週の出荷なし</div>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

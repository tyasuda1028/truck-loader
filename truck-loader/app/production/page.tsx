'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans } from '@/lib/calculations';
import clsx from 'clsx';

export default function ProductionPage() {
  const {
    products, warehouses, truckTypes,
    productionPlan, distributionRatios,
    setProductionQty, setRatio,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'production' | 'ratio'>('production');

  const plans = useMemo(
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, distributionRatios),
    [warehouses, products, truckTypes, productionPlan, distributionRatios],
  );

  // 出荷がある拠点のみ表示
  const activeWarehouses = warehouses.filter(
    (wh) => products.some(
      (p) => (distributionRatios[p.code]?.[wh.code] ?? 0) > 0,
    ),
  );

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">生産計画入力</h1>
        <p className="text-sm text-slate-500 mt-0.5">週間の生産数量と拠点への配分比率を設定します</p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {[
          { key: 'production', label: '📋 週間生産数' },
          { key: 'ratio',      label: '📊 拠点別配分比率' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as 'production' | 'ratio')}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── タブ①：週間生産数 ── */}
      {activeTab === 'production' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="px-4 py-2.5 text-left font-semibold w-8">#</th>
                <th className="px-4 py-2.5 text-left font-semibold">製品名</th>
                <th className="px-4 py-2.5 text-left font-semibold">パレット型</th>
                <th className="px-4 py-2.5 text-right font-semibold">個/枚</th>
                <th className="px-4 py-2.5 text-right font-semibold w-40">週間生産数（個）</th>
                <th className="px-4 py-2.5 text-right font-semibold">総パレット数</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const qty = productionPlan[p.code] ?? 0;
                const pals = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                return (
                  <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-sm border border-black/10 shrink-0"
                          style={{ background: p.color }}
                        />
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-slate-400 font-mono">{p.code}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-slate-500">{p.palletType}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{p.capacityPerPallet}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        value={qty === 0 ? '' : qty}
                        onChange={(e) =>
                          setProductionQty(p.code, parseInt(e.target.value, 10) || 0)
                        }
                        placeholder="0"
                        className="w-full text-right border border-slate-200 rounded px-2 py-1
                                   text-sm focus:outline-none focus:border-brand-500 focus:ring-1
                                   focus:ring-brand-500 bg-white"
                      />
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-slate-700">
                      {pals > 0 ? `${pals}枚` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── タブ②：拠点別配分比率 ── */}
      {activeTab === 'ratio' && (
        <div>
          <p className="text-xs text-slate-500 mb-3 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            💡 各製品を各拠点に何%送るかを入力します。横計が100%になるよう設定してください。
          </p>
          <div className="overflow-x-auto">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">
                      製品名
                    </th>
                    {activeWarehouses.map((wh) => (
                      <th key={wh.code} className="px-2 py-2.5 text-center font-semibold text-slate-500 min-w-[70px]">
                        <div className="font-bold text-slate-400">{wh.code}</div>
                        <div className="text-[10px] text-slate-500 leading-tight">{wh.name.slice(0, 5)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-500 min-w-[60px]">合計%</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const rowTotal = activeWarehouses.reduce(
                      (s, wh) => s + (distributionRatios[p.code]?.[wh.code] ?? 0),
                      0,
                    );
                    const isOver = rowTotal > 100;
                    return (
                      <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
                              style={{ background: p.color }}
                            />
                            <span className="font-medium text-slate-700">{p.name}</span>
                          </div>
                        </td>
                        {activeWarehouses.map((wh) => {
                          const ratio = distributionRatios[p.code]?.[wh.code] ?? 0;
                          return (
                            <td key={wh.code} className="px-1 py-1.5 text-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={ratio === 0 ? '' : ratio}
                                onChange={(e) =>
                                  setRatio(p.code, wh.code, parseInt(e.target.value, 10) || 0)
                                }
                                placeholder="0"
                                className="w-14 text-center border border-slate-200 rounded px-1 py-0.5
                                           text-xs focus:outline-none focus:border-brand-500 focus:ring-1
                                           focus:ring-brand-500 bg-white"
                              />
                            </td>
                          );
                        })}
                        <td className={clsx(
                          'px-3 py-1.5 text-right font-bold',
                          isOver ? 'text-red-500' : rowTotal === 100 ? 'text-emerald-600' : 'text-amber-500',
                        )}>
                          {rowTotal}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 拠点別計算結果プレビュー */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-600 mb-3">📦 拠点別パレット数（計算結果）</h2>
            <div className="overflow-x-auto">
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200">
                        製品
                      </th>
                      {activeWarehouses.map((wh) => (
                        <th key={wh.code} className="px-2 py-2 text-center font-semibold text-slate-500 min-w-[64px]">
                          {wh.code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.code} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
                            {p.name}
                          </div>
                        </td>
                        {activeWarehouses.map((wh) => {
                          const ratio = distributionRatios[p.code]?.[wh.code] ?? 0;
                          const qty = productionPlan[p.code] ?? 0;
                          const pallets = ratio > 0 && qty > 0
                            ? Math.ceil((qty * ratio / 100) / p.capacityPerPallet)
                            : 0;
                          return (
                            <td key={wh.code} className="px-2 py-1.5 text-center text-slate-600">
                              {pallets > 0 ? <span className="font-medium">{pallets}枚</span> : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* 拠点別合計行 */}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600">
                        合計パレット
                      </td>
                      {activeWarehouses.map((wh) => {
                        const plan = plans[wh.code];
                        return (
                          <td key={wh.code} className="px-2 py-2 text-center text-brand-600">
                            {plan?.totalPallets > 0 ? `${plan.totalPallets}枚` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                    {/* 必要台数行 */}
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold">
                        必要台数
                      </td>
                      {activeWarehouses.map((wh) => {
                        const plan = plans[wh.code];
                        return (
                          <td key={wh.code} className="px-2 py-2 text-center text-slate-700 font-semibold">
                            {plan?.trucks.length > 0 ? `${plan.trucks.length}台` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

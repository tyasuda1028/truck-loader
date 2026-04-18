'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcWeeklyPlans } from '@/lib/calculations';
import type { DayWarehousePlan } from '@/lib/types';
import clsx from 'clsx';

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

export default function SchedulePage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock, locationStock,
    weeklyShippingSchedule, setShippingDay,
  } = useAppStore();

  const [selectedFactory, setSelectedFactory] = useState<string>(factories[0]?.code ?? '');

  // 選択中の工場
  const factory = factories.find((f) => f.code === selectedFactory);

  // 選択中工場の製品に配分比率のある拠点のみを表示対象にする
  const factoryProducts = products.filter(
    (p) => (p.factoryCode ?? 'F001') === selectedFactory,
  );

  const relevantWarehouses = useMemo(() => {
    if (factoryProducts.length === 0) return [];
    return warehouses.filter((wh) =>
      factoryProducts.some((p) => (distributionRatios[p.code]?.[wh.code] ?? 0) > 0),
    );
  }, [factoryProducts, warehouses, distributionRatios]);

  // 曜日別積載計画プレビュー
  const weeklyPlans = useMemo(
    () =>
      calcWeeklyPlans(
        warehouses,
        products,
        truckTypes,
        factories,
        productionPlan,
        distributionRatios,
        inventoryStock,
        locationStock,
        weeklyShippingSchedule,
      ),
    [warehouses, products, truckTypes, factories, productionPlan, distributionRatios, inventoryStock, locationStock, weeklyShippingSchedule],
  );

  const factoryPlans = weeklyPlans[selectedFactory] ?? [];

  // 各曜日にある拠点のプランをまとめる
  // dayOfWeek -1 はスケジュールなし（週全体）
  const plansByDay: Record<number, typeof factoryPlans> = {};
  for (const plan of factoryPlans) {
    const key = plan.dayOfWeek;
    if (!plansByDay[key]) plansByDay[key] = [];
    plansByDay[key].push(plan);
  }

  const handleToggle = (warehouseCode: string, dayIdx: number) => {
    const current = weeklyShippingSchedule[selectedFactory]?.[warehouseCode]?.[dayIdx] ?? false;
    setShippingDay(selectedFactory, warehouseCode, dayIdx, !current);
  };

  const getDayActive = (warehouseCode: string, dayIdx: number): boolean => {
    return weeklyShippingSchedule[selectedFactory]?.[warehouseCode]?.[dayIdx] ?? false;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">出荷スケジュール</h1>
        <p className="text-sm text-slate-500 mt-0.5">工場ごとに、拠点への曜日別出荷スケジュールを設定します</p>
      </div>

      {/* 工場タブ */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {factories.map((f) => (
          <button
            key={f.code}
            onClick={() => setSelectedFactory(f.code)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
              selectedFactory === f.code
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
              {f.code}
            </span>
            {f.name}
          </button>
        ))}
      </div>

      {!factory ? (
        <div className="text-slate-400 text-sm italic">工場マスタに工場が登録されていません。マスタ設定から追加してください。</div>
      ) : factoryProducts.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
          「{factory.name}」に割り当てられた製品がありません。マスタ設定の製品マスタから出荷工場を設定してください。
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{factory.code}</span>
            <span className="text-sm font-semibold text-slate-700">{factory.name}</span>
            <span className="text-xs text-slate-400 ml-2">
              — 製品 {factoryProducts.length}種、対象拠点 {relevantWarehouses.length}拠点
            </span>
          </div>

          {/* スケジュール設定グリッド */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto mb-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 border-b border-slate-200 sticky left-0 bg-slate-50 z-10 min-w-[180px]">
                    拠点
                  </th>
                  {DAY_LABELS.map((day, i) => (
                    <th
                      key={i}
                      className={clsx(
                        'px-4 py-2.5 text-center text-xs font-semibold border-b border-slate-200 min-w-[60px]',
                        i === 5 ? 'text-blue-600' : i === 6 ? 'text-red-500' : 'text-slate-500',
                      )}
                    >
                      {day}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-400 border-b border-slate-200 min-w-[60px]">
                    設定日数
                  </th>
                </tr>
              </thead>
              <tbody>
                {relevantWarehouses.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-slate-400 text-sm italic">
                      配分比率が設定された拠点がありません
                    </td>
                  </tr>
                ) : (
                  relevantWarehouses.map((wh) => {
                    const activeDayCount = DAY_LABELS.filter((_, i) => getDayActive(wh.code, i)).length;
                    return (
                      <tr key={wh.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              'text-[10px] font-bold px-1 py-0.5 rounded-full shrink-0',
                              wh.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                            )}>
                              {wh.group}
                            </span>
                            <div>
                              <div className="text-xs font-medium text-slate-700 leading-tight">{wh.name}</div>
                              <div className="text-[10px] text-slate-400">{wh.code}</div>
                            </div>
                          </div>
                        </td>
                        {DAY_LABELS.map((_, dayIdx) => {
                          const active = getDayActive(wh.code, dayIdx);
                          return (
                            <td key={dayIdx} className="px-2 py-2 text-center">
                              <button
                                onClick={() => handleToggle(wh.code, dayIdx)}
                                className={clsx(
                                  'w-8 h-8 rounded-md border-2 text-xs font-bold transition-all',
                                  active
                                    ? 'bg-brand-600 border-brand-600 text-white'
                                    : 'bg-white border-slate-200 text-slate-300 hover:border-brand-400 hover:text-brand-400',
                                )}
                                title={`${wh.name} — ${DAY_LABELS[dayIdx]}曜日`}
                              >
                                {active ? '✓' : ''}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 text-center">
                          {activeDayCount > 0 ? (
                            <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                              {activeDayCount}日
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">未設定</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 出荷数量プレビュー */}
          <section>
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
              出荷数量プレビュー（曜日別）
            </h2>

            {factoryPlans.length === 0 ? (
              <div className="text-sm text-slate-400 italic bg-slate-50 rounded-lg p-4 text-center">
                出荷計画がありません。生産計画入力から数量を設定してください。
              </div>
            ) : (
              <div className="space-y-4">
                {/* スケジュールなし (dayOfWeek === -1) */}
                {plansByDay[-1] && plansByDay[-1].length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded">スケジュール未設定（週計）</span>
                    </div>
                    <PreviewTable plans={plansByDay[-1]} />
                  </div>
                )}

                {/* 曜日別プラン */}
                {DAY_LABELS.map((dayLabel, dayIdx) => {
                  const plans = plansByDay[dayIdx];
                  if (!plans || plans.length === 0) return null;
                  return (
                    <div key={dayIdx}>
                      <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-2">
                        <span className={clsx(
                          'px-2 py-0.5 rounded font-bold',
                          dayIdx === 5
                            ? 'bg-blue-100 text-blue-700'
                            : dayIdx === 6
                            ? 'bg-red-100 text-red-600'
                            : 'bg-brand-100 text-brand-700',
                        )}>
                          {dayLabel}曜日
                        </span>
                        <span className="text-slate-400">{plans.length}拠点</span>
                      </div>
                      <PreviewTable plans={plans} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PreviewTable({ plans }: { plans: DayWarehousePlan[] }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs text-slate-500">
            <th className="px-4 py-2 text-left font-semibold">拠点コード</th>
            <th className="px-4 py-2 text-right font-semibold">台数</th>
            <th className="px-4 py-2 text-right font-semibold">パレット</th>
            <th className="px-4 py-2 text-right font-semibold">出荷個数</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => (
            <tr key={plan.warehouseCode} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-2 font-mono text-xs text-slate-500">{plan.warehouseCode}</td>
              <td className="px-4 py-2 text-right">{plan.trucks.length}台</td>
              <td className="px-4 py-2 text-right">{plan.totalPallets}枚</td>
              <td className="px-4 py-2 text-right font-medium">{plan.totalQty.toLocaleString()}個</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-xs">
            <td className="px-4 py-2 text-slate-600">小計</td>
            <td className="px-4 py-2 text-right text-brand-600">
              {plans.reduce((s, p) => s + p.trucks.length, 0)}台
            </td>
            <td className="px-4 py-2 text-right text-slate-600">
              {plans.reduce((s, p) => s + p.totalPallets, 0)}枚
            </td>
            <td className="px-4 py-2 text-right text-brand-600">
              {plans.reduce((s, p) => s + p.totalQty, 0).toLocaleString()}個
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

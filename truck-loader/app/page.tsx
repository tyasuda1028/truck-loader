'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans, calcSendQty, fillRate, calcWeeklyPlans } from '@/lib/calculations';
import type { DayWarehousePlan } from '@/lib/types';
import clsx from 'clsx';

export default function DashboardPage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales,
    weeklyShippingSchedule,
  } = useAppStore();

  const [activeFactoryTab, setActiveFactoryTab] = useState<string>('');

  const plans = useMemo(
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales),
    [warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales],
  );

  const sendQty = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales),
    [products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales],
  );

  const weeklyPlans = useMemo(
    () => calcWeeklyPlans(warehouses, products, truckTypes, factories, productionPlan, distributionRatios, inventoryStock, locationStock, weeklyShippingSchedule, inTransitStock, plannedSales),
    [warehouses, products, truckTypes, factories, productionPlan, distributionRatios, inventoryStock, locationStock, weeklyShippingSchedule, inTransitStock, plannedSales],
  );

  const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];

  const truckMap = Object.fromEntries(truckTypes.map((t) => [t.code, t]));

  // サマリー集計
  const activePlans = Object.values(plans).filter((p) => p.trucks.length > 0);
  const totalTrucks   = activePlans.reduce((s, p) => s + p.trucks.length, 0);
  const totalPallets  = activePlans.reduce((s, p) => s + p.totalPallets, 0);
  const totalQty      = activePlans.reduce((s, p) => s + p.totalQty, 0);
  const totalProductQty = Object.values(productionPlan).reduce((s, v) => s + v, 0);

  // 工場タブ：製品のある工場のみ
  const factoriesWithProducts = factories.filter((f) =>
    products.some((p) => (p.factoryCode ?? 'F001') === f.code),
  );
  const currentFactoryTab = activeFactoryTab || factoriesWithProducts[0]?.code || '';

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">

      {/* ── ページタイトル ── */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">ダッシュボード</h1>
        <p className="text-sm text-slate-500 mt-0.5">今週の出荷計画サマリー</p>
      </div>

      {/* ── 1. KPIカード ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: '使用台数',    value: totalTrucks,               unit: '台',   icon: '🚛' },
          { label: '総パレット数', value: totalPallets,              unit: '枚',   icon: '📦' },
          { label: '総出荷個数',  value: totalQty.toLocaleString(),  unit: '個',   icon: '📊' },
          { label: '出荷拠点数',  value: activePlans.length,         unit: '拠点', icon: '🏭' },
        ].map(({ label, value, unit, icon }) => (
          <div key={label} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-brand-600">{value}</div>
            <div className="text-xs text-slate-400">{unit}</div>
            <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* ── 2. 拠点別 積載計画（カードグリッド）── */}
      <section className="mb-8">
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
            const plan    = plans[wh.code];
            const truck   = truckMap[wh.truckType];
            const hasPlan = plan && plan.trucks.length > 0;
            const fr      = hasPlan && truck ? fillRate(plan, truck.maxPallets) : 0;

            return (
              <Link
                key={wh.code}
                href="/loading-plan"
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
                  <span className={clsx(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    wh.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                  )}>
                    {wh.group}
                  </span>
                </div>

                {hasPlan ? (
                  <>
                    <div className="flex gap-4 text-xs text-slate-500 mb-2">
                      <span><strong className="text-slate-800">{plan.trucks.length}</strong> 台</span>
                      <span><strong className="text-slate-800">{plan.totalPallets}</strong> パレット</span>
                      <span><strong className="text-slate-800">{plan.totalQty.toLocaleString()}</strong> 個</span>
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

      {/* ── 3. 工場→拠点 出荷フロー（曜日×拠点テーブル）── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
            工場 → 拠点 出荷フロー
          </h2>
          <Link href="/inventory" className="text-xs text-brand-600 hover:underline">
            在庫・積載計画を見る →
          </Link>
        </div>

        <div className="flex flex-col gap-6">
          {factories.map((factory) => {
            const factoryPlans: DayWarehousePlan[] = weeklyPlans[factory.code] ?? [];
            if (factoryPlans.length === 0) return null;

            // この工場に出荷がある拠点
            const whCodesWithPlan = [...new Set(
              factoryPlans.filter(p => p.trucks.length > 0).map(p => p.warehouseCode)
            )];
            const activeWarehouses = warehouses.filter(wh => whCodesWithPlan.includes(wh.code));
            if (activeWarehouses.length === 0) return null;

            // 出荷がある曜日
            const daySet = new Set(
              factoryPlans.filter(p => p.trucks.length > 0).map(p => p.dayOfWeek)
            );
            const activeDays = [...daySet].filter(d => d >= 0).sort((a, b) => a - b);
            const hasUnscheduled = daySet.has(-1);
            const allDays = [...activeDays, ...(hasUnscheduled ? [-1] : [])];

            // lookup: warehouseCode → dayOfWeek → DayWarehousePlan
            const planMap: Record<string, Record<number, DayWarehousePlan>> = {};
            for (const plan of factoryPlans) {
              if (plan.trucks.length === 0) continue;
              if (!planMap[plan.warehouseCode]) planMap[plan.warehouseCode] = {};
              planMap[plan.warehouseCode][plan.dayOfWeek] = plan;
            }

            return (
              <div key={factory.code} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                {/* 工場ヘッダ */}
                <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{factory.code}</span>
                  <span className="text-sm font-semibold text-indigo-800">{factory.name}</span>
                </div>

                {/* 曜日×拠点テーブル */}
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-500 min-w-[140px] border-r border-slate-200">
                          拠点
                        </th>
                        {allDays.map((day) => (
                          <th key={day} className="px-3 py-2 text-center font-semibold text-slate-500 min-w-[170px]">
                            {day === -1 ? '週間' : `${DAY_NAMES[day]}曜日`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeWarehouses.map((wh) => (
                        <tr key={wh.code} className="border-t border-slate-100">
                          {/* 拠点名 (sticky) */}
                          <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-slate-200 align-middle">
                            <div className="font-semibold text-slate-700">{wh.name}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={clsx(
                                'text-[9px] font-bold px-1 py-0.5 rounded-full',
                                wh.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                              )}>{wh.group}</span>
                              <span className="text-slate-400 font-mono">{wh.code}</span>
                            </div>
                          </td>

                          {/* 曜日ごとのセル */}
                          {allDays.map((day) => {
                            const plan = planMap[wh.code]?.[day];
                            return (
                              <td key={day} className="px-2 py-2 align-top">
                                {!plan ? (
                                  <span className="block text-center text-slate-200">—</span>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    {/* トラック台数バッジ */}
                                    <div className="text-[10px] font-semibold text-slate-500 mb-0.5">
                                      🚛 {plan.trucks.length}台
                                    </div>
                                    {plan.trucks.map((truck) => (
                                      <div key={truck.truckIndex}
                                        className="bg-slate-50 rounded border border-slate-200 p-1.5">
                                        {/* トラックヘッダ */}
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-bold text-slate-700">{truck.truckIndex}号車</span>
                                          <span className={clsx(
                                            'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                                            truck.totalPallets >= truck.maxPallets
                                              ? 'bg-emerald-100 text-emerald-700'
                                              : truck.totalPallets >= Math.ceil(truck.maxPallets * 0.6)
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-red-50 text-red-500',
                                          )}>
                                            {truck.totalPallets}/{truck.maxPallets}枚
                                          </span>
                                        </div>
                                        {/* 製品明細 */}
                                        {truck.items.map((item) => {
                                          const prod = products.find((p) => p.code === item.productCode);
                                          return (
                                            <div key={item.productCode}
                                              className="flex items-center gap-1 text-[10px] text-slate-600 leading-5">
                                              <span className="w-2 h-2 rounded-sm shrink-0 border border-black/10"
                                                style={{ background: prod?.color ?? '#ccc' }} />
                                              <span className="font-medium truncate max-w-[70px]">
                                                {prod?.name ?? item.productCode}
                                              </span>
                                              <span className="ml-auto text-slate-400 whitespace-nowrap">
                                                {item.qty.toLocaleString()}個&nbsp;/&nbsp;{item.pallets}枚
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. 今週の生産計画（工場別タブ）── */}
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
          {/* 工場タブ */}
          {factoriesWithProducts.length > 1 && (
            <div className="flex border-b border-slate-200 bg-slate-50">
              {factoriesWithProducts.map((f) => {
                const fQty = products
                  .filter((p) => (p.factoryCode ?? 'F001') === f.code)
                  .reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0);
                return (
                  <button
                    key={f.code}
                    onClick={() => setActiveFactoryTab(f.code)}
                    className={clsx(
                      'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                      currentFactoryTab === f.code
                        ? 'border-brand-600 text-brand-600 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100',
                    )}
                  >
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                      {f.code}
                    </span>
                    {f.name}
                    {fQty > 0 && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        {fQty.toLocaleString()}個
                      </span>
                    )}
                  </button>
                );
              })}
              {/* 全工場合計タブ */}
              <button
                onClick={() => setActiveFactoryTab('__all__')}
                className={clsx(
                  'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ml-auto',
                  currentFactoryTab === '__all__'
                    ? 'border-brand-600 text-brand-600 bg-white'
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100',
                )}
              >
                全工場合計
              </button>
            </div>
          )}

          {/* タブコンテンツ */}
          {(() => {
            const showAll = currentFactoryTab === '__all__' || factoriesWithProducts.length <= 1;
            const targetFactories = showAll
              ? factoriesWithProducts
              : factoriesWithProducts.filter((f) => f.code === currentFactoryTab);

            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left font-semibold">製品コード</th>
                    <th className="px-4 py-2.5 text-left font-semibold">製品名</th>
                    <th className="px-4 py-2.5 text-right font-semibold">週間生産数</th>
                    <th className="px-4 py-2.5 text-right font-semibold">換算パレット</th>
                  </tr>
                </thead>
                <tbody>
                  {targetFactories.map((factory) => {
                    const factoryProducts = products.filter(
                      (p) => (p.factoryCode ?? 'F001') === factory.code,
                    );
                    const factoryQty  = factoryProducts.reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0);
                    const factoryPals = factoryProducts.reduce((s, p) => {
                      const qty = productionPlan[p.code] ?? 0;
                      return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                    }, 0);

                    return (
                      <>
                        {/* 工場名ヘッダ（全工場表示時のみ） */}
                        {showAll && factoriesWithProducts.length > 1 && (
                          <tr key={`fhdr-${factory.code}`} className="bg-indigo-50 border-t-2 border-indigo-100">
                            <td colSpan={4} className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                  {factory.code}
                                </span>
                                <span className="text-sm font-semibold text-indigo-800">{factory.name}</span>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* 製品行 */}
                        {factoryProducts.map((p) => {
                          const qty  = productionPlan[p.code] ?? 0;
                          const pals = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                          return (
                            <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
                                    style={{ background: p.color }} />
                                  <span className="font-mono text-xs text-slate-500">{p.code}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 font-medium text-slate-700">{p.name}</td>
                              <td className="px-4 py-2.5 text-right font-medium">
                                {qty > 0
                                  ? <span className="text-slate-800">{qty.toLocaleString()}個</span>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right text-slate-500">
                                {pals > 0 ? `${pals}枚` : <span className="text-slate-300">—</span>}
                              </td>
                            </tr>
                          );
                        })}

                        {/* 工場小計（複数工場の場合） */}
                        {(showAll && factoriesWithProducts.length > 1) && (
                          <tr key={`sub-${factory.code}`} className="border-t border-indigo-100 bg-indigo-50/60">
                            <td colSpan={2} className="px-4 py-1.5 text-xs text-indigo-500 font-semibold">
                              {factory.name} 小計
                            </td>
                            <td className="px-4 py-1.5 text-right text-xs font-bold text-indigo-600">
                              {factoryQty.toLocaleString()}個
                            </td>
                            <td className="px-4 py-1.5 text-right text-xs font-bold text-indigo-500">
                              {factoryPals}枚
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}

                  {/* 合計行 */}
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td colSpan={2} className="px-4 py-2.5 text-slate-600">
                      {showAll && factoriesWithProducts.length > 1 ? '総合計' : (() => {
                        const f = factoriesWithProducts.find((f) => f.code === currentFactoryTab);
                        return f ? `${f.name} 合計` : '合計';
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-brand-600">
                      {(showAll
                        ? totalProductQty
                        : products
                            .filter((p) => (p.factoryCode ?? 'F001') === currentFactoryTab)
                            .reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0)
                      ).toLocaleString()}個
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {(showAll
                        ? products.reduce((s, p) => {
                            const qty = productionPlan[p.code] ?? 0;
                            return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                          }, 0)
                        : products
                            .filter((p) => (p.factoryCode ?? 'F001') === currentFactoryTab)
                            .reduce((s, p) => {
                              const qty = productionPlan[p.code] ?? 0;
                              return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                            }, 0)
                      )}枚
                    </td>
                  </tr>
                </tbody>
              </table>
            );
          })()}
        </div>
      </section>

    </div>
  );
}

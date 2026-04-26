'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans, calcSendQty } from '@/lib/calculations';
import clsx from 'clsx';

export default function InventoryPage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock,
    locationStock, inTransitStock, plannedSales,
    setLocationStock, confirmShipment,
  } = useAppStore();

  const [confirmed, setConfirmed] = useState(false);

  const sendQty = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales),
    [products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales],
  );

  const plans = useMemo(
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales),
    [warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales],
  );

  const activeWarehouses = warehouses.filter((wh) =>
    products.some((p) => (distributionRatios[p.code]?.[wh.code] ?? 0) > 0),
  );

  const hasInTransit = products.some((p) =>
    warehouses.some((wh) => (inTransitStock[p.code]?.[wh.code] ?? 0) > 0),
  );
  const hasPlannedSales = products.some((p) =>
    warehouses.some((wh) => (plannedSales[p.code]?.[wh.code] ?? 0) > 0),
  );

  const activePlans = Object.values(plans).filter((p) => p.trucks.length > 0);

  const handleConfirmShipment = () => {
    confirmShipment(sendQty);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 4000);
  };

  const colsPerWh = 3 + (hasInTransit ? 1 : 0) + (hasPlannedSales ? 1 : 0);

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">拠点別 在庫・積載計画</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            現在庫を直接編集できます。
            <span className="text-slate-400 mx-1">／</span>
            現在庫
            {hasInTransit && <><span className="mx-1 text-slate-300">|</span><span className="text-amber-600 font-medium">輸送中</span></>}
            {hasPlannedSales && <><span className="mx-1 text-slate-300">|</span><span className="text-rose-500 font-medium">予定出荷</span></>}
            <span className="mx-1 text-slate-300">|</span><span className="text-emerald-600 font-medium">積載計画</span>
            <span className="mx-1 text-slate-300">|</span><span className="text-brand-600 font-medium">出荷後在庫</span>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/production" className="text-xs text-brand-600 hover:underline">
            配送計画入力 →
          </Link>
          <button
            onClick={handleConfirmShipment}
            disabled={activePlans.length === 0}
            className={clsx(
              'px-4 py-1.5 text-sm font-semibold rounded-lg transition-all',
              confirmed
                ? 'bg-emerald-100 text-emerald-700 cursor-default'
                : activePlans.length === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-brand-600 text-white hover:bg-brand-700 active:scale-95',
            )}
          >
            {confirmed ? '✓ 出荷確定済み' : '🚚 出荷確定'}
          </button>
        </div>
      </div>

      {confirmed && (
        <div className="mb-4 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
          <span className="text-base">✓</span>
          <span>今週の送り数を<strong>輸送中数量</strong>として保存しました。次回の積載計画に反映されます。</span>
        </div>
      )}

      {activeWarehouses.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400 italic">
          在庫データ・積載計画がありません。配送計画入力で生産計画と在庫数を入力してください。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
          <table
            className="text-xs border-collapse bg-white"
            style={{ minWidth: `${360 + activeWarehouses.length * colsPerWh * 68}px` }}
          >
            <thead>
              <tr className="bg-slate-100">
                <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-100 z-20 border-r border-slate-200 w-28">工場</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-28 bg-slate-100 z-20 border-r border-slate-200 w-32">製品コード</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-60 bg-slate-100 z-20 border-r-2 border-slate-300 w-36">製品名</th>
                {activeWarehouses.map((wh) => (
                  <th key={wh.code} colSpan={colsPerWh}
                    className="px-2 py-2 text-center font-semibold text-slate-600 border-l border-slate-200">
                    <div className="flex items-center justify-center gap-1">
                      <span className={clsx(
                        'text-[9px] font-bold px-1 py-0.5 rounded-full',
                        wh.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                      )}>{wh.group}</span>
                      <span>{wh.name}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 font-normal">{wh.code}</div>
                  </th>
                ))}
              </tr>
              <tr className="bg-slate-50 border-t border-slate-200">
                <th className="sticky left-0 bg-slate-50 z-20 border-r border-slate-200" />
                <th className="sticky left-28 bg-slate-50 z-20 border-r border-slate-200" />
                <th className="sticky left-60 bg-slate-50 z-20 border-r-2 border-slate-300" />
                {activeWarehouses.map((wh) => (
                  <>
                    <th key={`${wh.code}-cur`} className="px-2 py-1.5 text-center text-slate-500 font-medium border-l border-slate-200 w-16 bg-blue-50/40">
                      現在庫<br /><span className="text-[9px] text-slate-400 font-normal">（編集可）</span>
                    </th>
                    {hasInTransit && (
                      <th key={`${wh.code}-transit`} className="px-2 py-1.5 text-center text-amber-500 font-medium w-16">輸送中</th>
                    )}
                    {hasPlannedSales && (
                      <th key={`${wh.code}-sales`} className="px-2 py-1.5 text-center text-rose-500 font-medium w-16">予定出荷</th>
                    )}
                    <th key={`${wh.code}-plan`} className="px-2 py-1.5 text-center text-emerald-600 font-medium w-16">積載計画</th>
                    <th key={`${wh.code}-after`} className="px-2 py-1.5 text-center text-brand-600 font-medium border-r border-slate-200 w-16">出荷後</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {factories.map((factory) => {
                const factoryProducts = products.filter(
                  (p) => (p.factoryCode ?? 'F001') === factory.code,
                );
                if (factoryProducts.length === 0) return null;
                return (
                  <>
                    <tr key={`fhdr-${factory.code}`} className="bg-indigo-50 border-t-2 border-indigo-100">
                      <td colSpan={3 + activeWarehouses.length * colsPerWh}
                        className="px-3 py-1.5 sticky left-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                            {factory.code}
                          </span>
                          <span className="text-xs font-semibold text-indigo-800">{factory.name}</span>
                        </div>
                      </td>
                    </tr>
                    {factoryProducts.map((p, pi) => {
                      const isLast = pi === factoryProducts.length - 1;
                      return (
                        <tr key={p.code}
                          className={clsx('border-t border-slate-100 hover:bg-slate-50/50', isLast && 'border-b border-indigo-100')}>
                          <td className="px-3 py-2 sticky left-0 bg-white border-r border-slate-200" />
                          <td className="px-3 py-2 sticky left-28 bg-white border-r border-slate-200">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
                                style={{ background: p.color }} />
                              <span className="font-mono text-slate-500">{p.code}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 sticky left-60 bg-white border-r-2 border-slate-300 font-medium text-slate-700">
                            {p.name}
                          </td>
                          {activeWarehouses.map((wh) => {
                            const ratio  = distributionRatios[p.code]?.[wh.code] ?? 0;
                            const cur    = locationStock[p.code]?.[wh.code] ?? 0;
                            const transit = inTransitStock[p.code]?.[wh.code] ?? 0;
                            const sales  = plannedSales[p.code]?.[wh.code] ?? 0;
                            const plan   = sendQty[p.code]?.[wh.code] ?? 0;
                            const after  = Math.max(0, cur + transit - sales) + plan;
                            return (
                              <>
                                <td key={`${p.code}-${wh.code}-cur`}
                                  className="px-1 py-1.5 text-center border-l border-slate-200 bg-blue-50/30">
                                  {ratio === 0 ? (
                                    <span className="text-slate-200">—</span>
                                  ) : (
                                    <input
                                      type="number" min={0}
                                      value={cur === 0 ? '' : cur}
                                      onChange={(e) => setLocationStock(p.code, wh.code, parseInt(e.target.value, 10) || 0)}
                                      placeholder="0"
                                      className="w-16 text-center border border-slate-200 rounded px-1 py-0.5 text-xs
                                                 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
                                    />
                                  )}
                                </td>
                                {hasInTransit && (
                                  <td key={`${p.code}-${wh.code}-transit`} className="px-2 py-2 text-right">
                                    {transit > 0
                                      ? <span className="font-bold text-amber-600">{transit.toLocaleString()}</span>
                                      : <span className="text-slate-200">—</span>}
                                  </td>
                                )}
                                {hasPlannedSales && (
                                  <td key={`${p.code}-${wh.code}-sales`} className="px-2 py-2 text-right">
                                    {sales > 0
                                      ? <span className="font-bold text-rose-500">-{sales.toLocaleString()}</span>
                                      : <span className="text-slate-200">—</span>}
                                  </td>
                                )}
                                <td key={`${p.code}-${wh.code}-plan`} className="px-2 py-2 text-right">
                                  {plan > 0
                                    ? <span className="font-bold text-emerald-600">{plan.toLocaleString()}</span>
                                    : <span className="text-slate-200">—</span>}
                                </td>
                                <td key={`${p.code}-${wh.code}-after`}
                                  className="px-2 py-2 text-right border-r border-slate-200">
                                  {after > 0
                                    ? <span className="font-bold text-brand-600">{after.toLocaleString()}</span>
                                    : <span className="text-slate-200">—</span>}
                                </td>
                              </>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

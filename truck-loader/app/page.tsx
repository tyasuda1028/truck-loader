'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans, calcSendQty, fillRate } from '@/lib/calculations';
import clsx from 'clsx';

export default function DashboardPage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock,
  } = useAppStore();

  const plans = useMemo(
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock),
    [warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock],
  );

  // 拠点別在庫テーブル用：送り数を計算（輸送中考慮）
  const sendQty = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock),
    [products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock],
  );

  const truckMap = Object.fromEntries(truckTypes.map((t) => [t.code, t]));

  // サマリー集計
  const activePlans = Object.values(plans).filter((p) => p.trucks.length > 0);
  const totalTrucks = activePlans.reduce((s, p) => s + p.trucks.length, 0);
  const totalPallets = activePlans.reduce((s, p) => s + p.totalPallets, 0);
  const totalQty = activePlans.reduce((s, p) => s + p.totalQty, 0);
  const totalProductQty = Object.values(productionPlan).reduce((s, v) => s + v, 0);

  // 表示対象拠点：在庫 or 輸送中 or 計画 のいずれかがある拠点
  const activeWarehouses = warehouses.filter((wh) =>
    products.some((p) =>
      (sendQty[p.code]?.[wh.code] ?? 0) > 0 ||
      (locationStock[p.code]?.[wh.code] ?? 0) > 0 ||
      (inTransitStock[p.code]?.[wh.code] ?? 0) > 0,
    ),
  );

  // 輸送中データがあるかどうか
  const hasInTransit = products.some((p) =>
    warehouses.some((wh) => (inTransitStock[p.code]?.[wh.code] ?? 0) > 0),
  );

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">ダッシュボード</h1>
        <p className="text-sm text-slate-500 mt-0.5">今週の出荷計画サマリー</p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: '使用台数',    value: totalTrucks,                unit: '台',  icon: '🚛' },
          { label: '総パレット数', value: totalPallets,               unit: '枚',  icon: '📦' },
          { label: '総出荷個数',   value: totalQty.toLocaleString(),  unit: '個',  icon: '📊' },
          { label: '出荷拠点数',   value: activePlans.length,         unit: '拠点', icon: '🏭' },
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
                    {factoryProducts.map((p) => {
                      const qty = productionPlan[p.code] ?? 0;
                      const pals = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                      return (
                        <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
                                style={{ background: p.color }} />
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
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-4 py-2 text-slate-600" colSpan={2}>総合計</td>
                <td className="px-4 py-2 text-right text-brand-600">{totalProductQty.toLocaleString()}個</td>
                <td className="px-4 py-2 text-right text-slate-500">{totalPallets}枚</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 拠点別 在庫・輸送中・積載計画 マトリクス */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
              拠点別 在庫・積載計画
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              現在庫 ／
              {hasInTransit && <><span className="text-amber-600 font-medium"> 輸送中</span> ／</>}
              <span className="text-emerald-600 font-medium"> 積載計画</span> ／
              <span className="text-brand-600 font-medium"> 出荷後在庫</span>（現在庫＋輸送中＋積載計画）
            </p>
          </div>
          <Link href="/production" className="text-xs text-brand-600 hover:underline">
            在庫入力 →
          </Link>
        </div>

        {activeWarehouses.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400 italic">
            在庫データ・積載計画がありません。生産計画と在庫数を入力してください。
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
            <table className="text-xs border-collapse bg-white"
              style={{ minWidth: `${360 + activeWarehouses.length * (hasInTransit ? 256 : 192)}px` }}>
              <thead>
                {/* 拠点名ヘッダ */}
                <tr className="bg-slate-100">
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-100 z-20 border-r border-slate-200 w-28">工場</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-28 bg-slate-100 z-20 border-r border-slate-200 w-32">製品コード</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-60 bg-slate-100 z-20 border-r-2 border-slate-300 w-36">製品名</th>
                  {activeWarehouses.map((wh) => (
                    <th key={wh.code} colSpan={hasInTransit ? 4 : 3}
                      className="px-2 py-2 text-center font-semibold text-slate-600 border-l border-slate-200">
                      <div className="flex items-center justify-center gap-1">
                        <span className={clsx(
                          'text-[9px] font-bold px-1 py-0.5 rounded-full',
                          wh.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                        )}>{wh.group}</span>
                        <span className="text-slate-700">{wh.name}</span>
                      </div>
                      <div className="text-[9px] text-slate-400 font-normal">{wh.code}</div>
                    </th>
                  ))}
                </tr>
                {/* サブヘッダ */}
                <tr className="bg-slate-50 border-t border-slate-200">
                  <th className="sticky left-0 bg-slate-50 z-20 border-r border-slate-200" />
                  <th className="sticky left-28 bg-slate-50 z-20 border-r border-slate-200" />
                  <th className="sticky left-60 bg-slate-50 z-20 border-r-2 border-slate-300" />
                  {activeWarehouses.map((wh) => (
                    <>
                      <th key={`${wh.code}-cur`} className="px-2 py-1.5 text-center text-slate-400 font-medium border-l border-slate-200 w-16">現在庫</th>
                      {hasInTransit && (
                        <th key={`${wh.code}-transit`} className="px-2 py-1.5 text-center text-amber-500 font-medium w-16">輸送中</th>
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
                      {/* 工場ヘッダ行 */}
                      <tr key={`fhdr-${factory.code}`} className="bg-indigo-50 border-t-2 border-indigo-100">
                        <td colSpan={3 + activeWarehouses.length * (hasInTransit ? 4 : 3)}
                          className="px-3 py-1.5 sticky left-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                              {factory.code}
                            </span>
                            <span className="text-xs font-semibold text-indigo-800">{factory.name}</span>
                          </div>
                        </td>
                      </tr>

                      {/* 製品行 */}
                      {factoryProducts.map((p, pi) => {
                        const isLast = pi === factoryProducts.length - 1;
                        return (
                          <tr key={p.code}
                            className={clsx('border-t border-slate-100 hover:bg-slate-50', isLast && 'border-b border-indigo-100')}>
                            {/* 工場列（空） */}
                            <td className="px-3 py-2 sticky left-0 bg-white border-r border-slate-200" />
                            {/* 製品コード */}
                            <td className="px-3 py-2 sticky left-28 bg-white border-r border-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
                                  style={{ background: p.color }} />
                                <span className="font-mono text-slate-500">{p.code}</span>
                              </div>
                            </td>
                            {/* 製品名 */}
                            <td className="px-3 py-2 sticky left-60 bg-white border-r-2 border-slate-300 font-medium text-slate-700">
                              {p.name}
                            </td>
                            {/* 拠点ごとの数値 */}
                            {activeWarehouses.map((wh) => {
                              const cur     = locationStock[p.code]?.[wh.code] ?? 0;
                              const transit = inTransitStock[p.code]?.[wh.code] ?? 0;
                              const plan    = sendQty[p.code]?.[wh.code] ?? 0;
                              const after   = cur + transit + plan;
                              return (
                                <>
                                  <td key={`${p.code}-${wh.code}-cur`}
                                    className="px-2 py-2 text-right border-l border-slate-200 text-slate-500">
                                    {cur > 0 ? cur.toLocaleString() : <span className="text-slate-200">—</span>}
                                  </td>
                                  {hasInTransit && (
                                    <td key={`${p.code}-${wh.code}-transit`}
                                      className="px-2 py-2 text-right">
                                      {transit > 0
                                        ? <span className="font-bold text-amber-600">{transit.toLocaleString()}</span>
                                        : <span className="text-slate-200">—</span>}
                                    </td>
                                  )}
                                  <td key={`${p.code}-${wh.code}-plan`}
                                    className="px-2 py-2 text-right">
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
      </section>

      {/* 拠点別出荷サマリーカード */}
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
                href={`/loading-plan`}
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
    </div>
  );
}

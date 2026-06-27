'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans, calcSendQty } from '@/lib/calculations';
import { useCalcSettings } from '@/lib/useCalcSettings';
import { buildEquipmentColorMap } from '@/lib/productColors';
import { HelpTip } from '@/components/HelpTip';
import clsx from 'clsx';

export default function InventoryPage() {
  const {
    factories, products, warehouses, truckTypes, palletTypes,
    productionPlan, baselineStock,
    locationStock, inTransitStock, plannedSales, sendQtyManual,
    setLocationStock, confirmShipment,
  } = useAppStore();
  const calcSettings = useCalcSettings();

  const [confirmed, setConfirmed] = useState(false);

  // ── フィルター ──────────────────────────────────────────────────────
  const [filterFactory, setFilterFactory] = useState<string | null>(null);
  const [filterEquipmentName, setFilterEquipmentName] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  const sendQty = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales, calcSettings),
    [products, warehouses, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales, calcSettings],
  );

  const plans = useMemo(
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales, sendQtyManual, palletTypes, calcSettings),
    [warehouses, products, truckTypes, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales, sendQtyManual, palletTypes, calcSettings],
  );

  const activeWarehouses = warehouses.filter((wh) =>
    products.some((p) => (baselineStock[p.code]?.[wh.code] ?? 0) > 0),
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

  // ── 器具名フィルター用データ ──────────────────────────────────────
  const equipmentColorMap = useMemo(() => buildEquipmentColorMap(products), [products]);

  const allEquipmentNames = useMemo(
    () => [...new Set(products.map((p) => p.equipmentName?.trim() || '（未設定）'))],
    [products],
  );

  // 「データあり」判定：アクティブ拠点のいずれかに1件以上の数量がある
  const hasAnyData = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const wh of activeWarehouses) {
        if (
          (locationStock[p.code]?.[wh.code] ?? 0) > 0 ||
          (inTransitStock[p.code]?.[wh.code] ?? 0) > 0 ||
          (plannedSales[p.code]?.[wh.code] ?? 0) > 0 ||
          (sendQty[p.code]?.[wh.code] ?? 0) > 0
        ) {
          set.add(p.code);
          break;
        }
      }
    }
    return set;
  }, [products, activeWarehouses, locationStock, inTransitStock, plannedSales, sendQty]);

  // フィルター済み製品リスト（工場 + 器具名 + テキスト + データなし非表示）
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // データなし製品は非表示
      if (!hasAnyData.has(p.code)) return false;
      // 工場フィルター
      if (filterFactory && (p.factoryCode ?? 'F001') !== filterFactory) return false;
      // 器具名フィルター
      const eq = p.equipmentName?.trim() || '（未設定）';
      if (filterEquipmentName && eq !== filterEquipmentName) return false;
      // テキスト検索
      if (filterText) {
        const q = filterText.toLowerCase();
        return (
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          eq.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [products, hasAnyData, filterFactory, filterEquipmentName, filterText]);

  // 工場チップ用カウント（データありの製品のみ）
  const factoryCountMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) {
      if (!hasAnyData.has(p.code)) continue;
      const fc = p.factoryCode ?? 'F001';
      m[fc] = (m[fc] ?? 0) + 1;
    }
    return m;
  }, [products, hasAnyData]);

  // 器具名チップ用カウント（データあり・工場フィルター適用後の製品のみ）
  const eqCountMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) {
      if (!hasAnyData.has(p.code)) continue;
      if (filterFactory && (p.factoryCode ?? 'F001') !== filterFactory) continue;
      const eq = p.equipmentName?.trim() || '（未設定）';
      m[eq] = (m[eq] ?? 0) + 1;
    }
    return m;
  }, [products, hasAnyData, filterFactory]);

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            在庫状況（拠点別）
            <HelpTip
              title="この画面でできること"
              text={'各拠点の現在庫を直接編集できます。\n有効在庫 = 拠点在庫 + 輸送中 − 予定出荷。\n基準在庫数を下回った分が「不足数」として送り数に反映されます。'}
            />
          </h1>
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

      {/* ── フィルターバー ── */}
      <div className="mb-3 flex flex-col gap-2">
        {/* テキスト検索 */}
        <div className="relative w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          <input
            type="text"
            placeholder="製品名・コード・器具名で検索…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-7 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >✕</button>
          )}
        </div>
        {/* 工場チップ */}
        {factories.length > 1 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">工場</span>
            <button
              onClick={() => { setFilterFactory(null); setFilterEquipmentName(null); }}
              className={clsx(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                filterFactory === null
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400',
              )}
            >
              すべて
              <span className="ml-1 opacity-70">{hasAnyData.size}</span>
            </button>
            {factories.map((f) => {
              const count = factoryCountMap[f.code] ?? 0;
              if (count === 0) return null;
              const isActive = filterFactory === f.code;
              return (
                <button
                  key={f.code}
                  onClick={() => {
                    setFilterFactory(isActive ? null : f.code);
                    setFilterEquipmentName(null); // 工場切替時に器具名フィルターをリセット
                  }}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400',
                  )}
                >
                  <span className="font-mono text-[9px] opacity-80">{f.code}</span>
                  {f.name}
                  <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* 器具名チップ */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            onClick={() => setFilterEquipmentName(null)}
            className={clsx(
              'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              filterEquipmentName === null
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-slate-600 border-slate-300 hover:border-brand-400',
            )}
          >
            すべて
            <span className="ml-1 opacity-70">{hasAnyData.size}</span>
          </button>
          {allEquipmentNames
            .filter((eq) => (eqCountMap[eq] ?? 0) > 0)
            .map((eqName) => {
              const color = equipmentColorMap[eqName] ?? '#94a3b8';
              const count = eqCountMap[eqName] ?? 0;
              const isActive = filterEquipmentName === eqName;
              return (
                <button
                  key={eqName}
                  onClick={() => setFilterEquipmentName(isActive ? null : eqName)}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    isActive
                      ? 'text-white border-transparent shadow-sm'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400',
                  )}
                  style={isActive ? { background: color, borderColor: color } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: isActive ? 'rgba(255,255,255,0.7)' : color }}
                  />
                  {eqName}
                  <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          {(filterFactory !== null || filterEquipmentName !== null || filterText) && (
            <span className="text-xs text-slate-500 ml-1">
              {filteredProducts.length}件を表示中
            </span>
          )}
        </div>
      </div>

      {activeWarehouses.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400 italic">
          在庫データ・積載計画がありません。配送計画入力で生産計画と在庫数を入力してください。
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400 italic">
          条件に一致する製品がありません。
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
                const factoryProducts = filteredProducts.filter(
                  (p) => (p.factoryCode ?? 'F001') === factory.code,
                );
                if (factoryProducts.length === 0) return null;

                // 器具名ごとにグループ化
                const eqGroups = new Map<string, typeof factoryProducts>();
                for (const p of factoryProducts) {
                  const key = p.equipmentName?.trim() || '（未設定）';
                  if (!eqGroups.has(key)) eqGroups.set(key, []);
                  eqGroups.get(key)!.push(p);
                }

                return (
                  <>
                    {/* 工場ヘッダー */}
                    <tr key={`fhdr-${factory.code}`} className="bg-indigo-50 border-t-2 border-indigo-100">
                      <td colSpan={3 + activeWarehouses.length * colsPerWh}
                        className="px-3 py-1.5 sticky left-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                            {factory.code}
                          </span>
                          <span className="text-xs font-semibold text-indigo-800">{factory.name}</span>
                          <span className="text-[10px] text-indigo-400">{factoryProducts.length}製品</span>
                        </div>
                      </td>
                    </tr>

                    {Array.from(eqGroups.entries()).map(([eqName, eqProducts]) => {
                      const eqColor = equipmentColorMap[eqName] ?? '#94a3b8';
                      const isUnset = eqName === '（未設定）';
                      return (
                        <>
                          {/* 器具名ヘッダー */}
                          <tr key={`eqhdr-${factory.code}-${eqName}`} className={clsx(
                            'border-t',
                            isUnset ? 'bg-slate-50 border-slate-200' : 'bg-teal-50/60 border-teal-100',
                          )}>
                            <td colSpan={3 + activeWarehouses.length * colsPerWh}
                              className="px-6 py-1.5 sticky left-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                                  style={{ background: eqColor }}
                                />
                                <span className={clsx(
                                  'text-xs font-semibold',
                                  isUnset ? 'text-slate-400 italic' : 'text-teal-700',
                                )}>
                                  {eqName}
                                </span>
                                <span className="text-[10px] text-teal-400">{eqProducts.length}製品</span>
                              </div>
                            </td>
                          </tr>

                          {/* 製品行 */}
                          {eqProducts.map((p, pi) => {
                            const isLast = pi === eqProducts.length - 1;
                            return (
                              <tr key={p.code}
                                className={clsx('border-t border-slate-100 hover:bg-slate-50/50', isLast && 'border-b border-teal-100')}>
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
                                  const baseline = baselineStock[p.code]?.[wh.code] ?? 0;
                                  const cur     = locationStock[p.code]?.[wh.code] ?? 0;
                                  const transit = inTransitStock[p.code]?.[wh.code] ?? 0;
                                  const sales   = plannedSales[p.code]?.[wh.code] ?? 0;
                                  const plan    = sendQty[p.code]?.[wh.code] ?? 0;
                                  const after   = Math.max(0, cur + transit - sales) + plan;
                                  return (
                                    <>
                                      <td key={`${p.code}-${wh.code}-cur`}
                                        className="px-1 py-1.5 text-center border-l border-slate-200 bg-blue-50/30">
                                        {baseline === 0 ? (
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

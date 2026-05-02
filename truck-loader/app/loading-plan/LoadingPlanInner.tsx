'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcWeeklyPlans, calcSendQty, fillRate } from '@/lib/calculations';
import { TruckDiagram } from '@/components/TruckDiagram';
import { LoadingTable } from '@/components/LoadingTable';
import type { DayWarehousePlan } from '@/lib/types';
import clsx from 'clsx';

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

// ── Merged destination interface ──────────────────────────────────────────────
interface MergedDestination {
  name: string;           // display name (shared warehouse name)
  plans: DayWarehousePlan[];  // all plans for warehouses with this name
  totalTrucks: number;
  totalPallets: number;
  totalQty: number;
}

export default function LoadingPlanInner() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock, locationStock,
    weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual,
    confirmShipment, setShippingDay,
  } = useAppStore();

  const productColors = Object.fromEntries(products.map((p) => [p.code, p.color]));
  const productNames  = Object.fromEntries(products.map((p) => [p.code, p.name]));
  const truckMap      = Object.fromEntries(truckTypes.map((t) => [t.code, t]));
  const warehouseMap  = Object.fromEntries(warehouses.map((w) => [w.code, w]));

  // 全製品の週間送り数（出荷確定用）
  const allSendQty = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales),
    [products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales],
  );

  // 工場別・日別計画
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
        inTransitStock,
        plannedSales,
        sendQtyManual,
      ),
    [warehouses, products, truckTypes, factories, productionPlan, distributionRatios, inventoryStock, locationStock, weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual],
  );

  const [confirmed, setConfirmed] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const handleConfirmShipment = () => {
    confirmShipment(allSendQty);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 4000);
  };

  // 出荷計画のある工場のみ
  const activeFactories = factories.filter(
    (f) => (weeklyPlans[f.code] ?? []).length > 0,
  );

  const [selectedFactory, setSelectedFactory] = useState<string>(activeFactories[0]?.code ?? '');
  const [selectedDay, setSelectedDay] = useState<number>(-99); // -99 = unset
  // selectedWH is now the destination NAME (merged warehouse name), not a warehouse code
  const [selectedWH, setSelectedWH] = useState<string>('');
  const [selectedTruck, setSelectedTruck] = useState(0);

  // 選択中工場のプラン
  const factoryPlans = weeklyPlans[selectedFactory] ?? [];

  // 選択中工場で出荷のある曜日(-1含む)を取得
  const availableDays = useMemo(() => {
    const days = new Set<number>();
    for (const p of factoryPlans) days.add(p.dayOfWeek);
    const sorted = Array.from(days).sort((a, b) => {
      if (a === -1) return -1;
      if (b === -1) return 1;
      return a - b;
    });
    return sorted;
  }, [factoryPlans]);

  // 初期化: selectedDay が -99 なら最初の日を設定
  const effectiveDay = selectedDay === -99 ? (availableDays[0] ?? -99) : selectedDay;
  const plansForDay = factoryPlans.filter((p) => p.dayOfWeek === effectiveDay);

  // ── Merge warehouses by name ───────────────────────────────────────────────
  const mergedForDay = useMemo(() => {
    const groups = new Map<string, DayWarehousePlan[]>();
    for (const p of plansForDay) {
      const name = warehouseMap[p.warehouseCode]?.name ?? p.warehouseCode;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(p);
    }
    return Array.from(groups.entries()).map(([name, plans]) => ({
      name,
      plans,
      totalTrucks: plans.reduce((s, p) => s + p.trucks.length, 0),
      totalPallets: plans.reduce((s, p) => s + p.totalPallets, 0),
      totalQty: plans.reduce((s, p) => s + p.totalQty, 0),
    }));
  }, [plansForDay, warehouseMap]);

  // Selected merged destination
  const selectedMerged: MergedDestination | undefined =
    mergedForDay.find((m) => m.name === selectedWH) ?? mergedForDay[0];

  // All trucks across all plans in the selected merged destination
  const allTrucks = selectedMerged?.plans.flatMap((p) => p.trucks) ?? [];

  // Clamp selectedTruck to valid range
  const clampedTruck = allTrucks.length > 0 ? Math.min(selectedTruck, allTrucks.length - 1) : 0;

  // Find which plan a flat truck index belongs to (for truck type lookup)
  const findPlanForTruckIndex = (idx: number): DayWarehousePlan | undefined => {
    if (!selectedMerged) return undefined;
    let offset = 0;
    for (const p of selectedMerged.plans) {
      if (idx < offset + p.trucks.length) return p;
      offset += p.trucks.length;
    }
    return selectedMerged.plans[selectedMerged.plans.length - 1];
  };

  const activePlan = findPlanForTruckIndex(clampedTruck);
  const activeWh = activePlan ? warehouseMap[activePlan.warehouseCode] : undefined;
  const activeTruckType = activeWh ? truckMap[activeWh.truckType] : undefined;
  const load = allTrucks[clampedTruck];

  // Fill rate for the summary bar: per-plan average weighted by trucks
  const computeMergedFillRate = (merged: MergedDestination): number => {
    let totalMaxPallets = 0;
    let totalUsed = 0;
    for (const p of merged.plans) {
      const wh = warehouseMap[p.warehouseCode];
      const tt = wh ? truckMap[wh.truckType] : undefined;
      if (tt) {
        totalMaxPallets += p.trucks.length * tt.maxPallets;
        totalUsed += p.totalPallets;
      }
    }
    return totalMaxPallets > 0 ? Math.round((totalUsed / totalMaxPallets) * 100) : 0;
  };

  const fr = selectedMerged ? computeMergedFillRate(selectedMerged) : 0;

  // Per-merged fill rate for the sidebar bar
  const sidebarFillRate = (merged: MergedDestination): number => {
    return computeMergedFillRate(merged);
  };

  // 工場切り替え時にデフォルト日・拠点を設定
  const handleFactorySelect = (code: string) => {
    setSelectedFactory(code);
    const plans = weeklyPlans[code] ?? [];
    const days = Array.from(new Set(plans.map((p) => p.dayOfWeek))).sort((a, b) => {
      if (a === -1) return -1;
      if (b === -1) return 1;
      return a - b;
    });
    const firstDay = days[0] ?? -99;
    setSelectedDay(firstDay);
    const firstPlan = plans.find((p) => p.dayOfWeek === firstDay);
    const firstName = firstPlan ? (warehouseMap[firstPlan.warehouseCode]?.name ?? firstPlan.warehouseCode) : '';
    setSelectedWH(firstName);
    setSelectedTruck(0);
  };

  // 曜日切り替え
  const handleDaySelect = (day: number) => {
    setSelectedDay(day);
    const dayPlans = factoryPlans.filter((p) => p.dayOfWeek === day);
    const firstName = dayPlans[0]
      ? (warehouseMap[dayPlans[0].warehouseCode]?.name ?? dayPlans[0].warehouseCode)
      : '';
    setSelectedWH(firstName);
    setSelectedTruck(0);
  };

  const handleWhSelect = (name: string) => {
    setSelectedWH(name);
    setSelectedTruck(0);
  };

  const dayLabel = (day: number) => {
    if (day === -1) return '未スケジュール';
    return DAY_LABELS[day] ? `${DAY_LABELS[day]}曜日` : '';
  };

  // ── Schedule editor data ───────────────────────────────────────────────────
  const factoryProducts = products.filter((p) => (p.factoryCode ?? 'F001') === selectedFactory);
  const relevantWarehouses = useMemo(
    () =>
      warehouses.filter((wh) =>
        factoryProducts.some((p) => (distributionRatios[p.code]?.[wh.code] ?? 0) > 0),
      ),
    [warehouses, factoryProducts, distributionRatios],
  );

  // planByDayWh for schedule cell lookup
  const planByDayWh = useMemo(() => {
    const map: Record<string, DayWarehousePlan> = {};
    for (const plan of factoryPlans) {
      map[`${plan.dayOfWeek}_${plan.warehouseCode}`] = plan;
    }
    return map;
  }, [factoryPlans]);

  // ── Truck nav helpers: which plan does flat index belong to, for badge ─────
  const truckPlanLabels = useMemo(() => {
    if (!selectedMerged) return [];
    const labels: Array<{ planIndex: number; plan: DayWarehousePlan; globalIndex: number }> = [];
    let globalIdx = 0;
    selectedMerged.plans.forEach((p, pi) => {
      p.trucks.forEach(() => {
        labels.push({ planIndex: pi, plan: p, globalIndex: globalIdx });
        globalIdx++;
      });
    });
    return labels;
  }, [selectedMerged]);

  return (
    <div className="flex flex-col h-[calc(100vh-68px)] overflow-hidden">

      {/* ── 出荷確定バー ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
        <p className="text-xs text-slate-500">
          出荷が完了したら「出荷確定」を押すと、今週の送り数が<strong className="text-slate-700">輸送中数量</strong>として保存され、次回の計画に反映されます。
        </p>
        <button
          onClick={handleConfirmShipment}
          className={clsx(
            'ml-4 shrink-0 px-4 py-1.5 text-sm font-semibold rounded-lg transition-all',
            confirmed
              ? 'bg-emerald-100 text-emerald-700 cursor-default'
              : 'bg-brand-600 text-white hover:bg-brand-700 active:scale-95',
          )}
        >
          {confirmed ? '✓ 出荷確定済み' : '🚚 出荷確定'}
        </button>
      </div>

      {/* ── 工場タブ ── */}
      {activeFactories.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-4 flex gap-1 shrink-0">
          {activeFactories.map((f) => (
            <button
              key={f.code}
              onClick={() => handleFactorySelect(f.code)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
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
      )}

      {/* ── 曜日タブ + スケジュール設定ボタン ── */}
      {availableDays.length > 0 && (
        <div className="bg-slate-50 border-b border-slate-200 px-4 flex items-center shrink-0">
          <div className="flex gap-1 flex-1">
            {availableDays.map((day) => (
              <button
                key={day}
                onClick={() => handleDaySelect(day)}
                className={clsx(
                  'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                  effectiveDay === day
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600',
                )}
              >
                {day === -1 ? '週全体' : DAY_LABELS[day]}
                {day !== -1 && <span className="ml-1 opacity-60">曜</span>}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowSchedule((v) => !v)}
            className={clsx(
              'ml-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors shrink-0',
              showSchedule
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400',
            )}
          >
            📅 スケジュール設定
          </button>
        </div>
      )}

      {/* ── 出荷スケジュール設定パネル ── */}
      {showSchedule && (
        <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0 overflow-x-auto">
          <div className="text-xs font-bold text-slate-600 mb-2">出荷スケジュール設定</div>
          <table className="border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="text-left pr-3 pb-1 font-medium text-slate-500 min-w-[80px]">倉庫</th>
                {DAY_LABELS.map((label, i) => (
                  <th
                    key={i}
                    className={clsx(
                      'text-center pb-1 font-bold w-12',
                      i === 5 ? 'text-blue-600' : i === 6 ? 'text-red-600' : 'text-slate-600',
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relevantWarehouses.map((wh) => {
                const schedule = weeklyShippingSchedule[selectedFactory]?.[wh.code]
                  ?? [false, false, false, false, false, false, false];
                return (
                  <tr key={wh.code} className="border-t border-slate-100">
                    <td className="pr-3 py-1 text-slate-700 font-medium whitespace-nowrap">
                      <span className="text-[9px] text-slate-400 mr-1">{wh.code}</span>
                      {wh.name}
                      {wh.group && (
                        <span className={clsx(
                          'ml-1 text-[9px] font-bold px-1 py-0.5 rounded-full',
                          wh.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                        )}>
                          {wh.group}
                        </span>
                      )}
                    </td>
                    {DAY_LABELS.map((_, dayIdx) => {
                      const active = schedule[dayIdx] ?? false;
                      const cellPlan = planByDayWh[`${dayIdx}_${wh.code}`];
                      return (
                        <td key={dayIdx} className="text-center py-1 px-0.5">
                          <button
                            onClick={() => setShippingDay(selectedFactory, wh.code, dayIdx, !active)}
                            className={clsx(
                              'w-11 h-10 rounded border text-[9px] flex flex-col items-center justify-center transition-colors',
                              active
                                ? 'border-blue-400 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-300 hover:border-slate-400',
                            )}
                          >
                            <span className="font-bold text-[11px]">{active ? '✓' : '—'}</span>
                            {active && cellPlan && (
                              <span className="leading-none mt-0.5">
                                {cellPlan.trucks.length}台
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── 左パネル: 拠点リスト（merged） ── */}
        <aside className="w-52 shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
            {dayLabel(effectiveDay)} — 配送拠点
          </div>
          {mergedForDay.length === 0 && (
            <p className="text-xs text-slate-400 p-4 italic">
              出荷計画がありません。<br />
              生産計画入力から数量を設定してください。
            </p>
          )}
          {mergedForDay.map((merged) => {
            const isActive = merged.name === (selectedMerged?.name ?? '');
            const sfr = sidebarFillRate(merged);
            // Collect all group badges for sub-warehouses
            const groups = [...new Set(merged.plans.map((p) => warehouseMap[p.warehouseCode]?.group).filter(Boolean))];
            return (
              <button
                key={merged.name}
                onClick={() => handleWhSelect(merged.name)}
                className={clsx(
                  'w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors',
                  isActive
                    ? 'bg-brand-50 border-l-[3px] border-l-brand-600'
                    : 'hover:bg-slate-50 border-l-[3px] border-l-transparent',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold text-slate-400 truncate">
                    {merged.plans.map((p) => p.warehouseCode).join('/')}
                  </span>
                  <div className="flex gap-0.5 shrink-0">
                    {groups.map((g) => (
                      <span
                        key={g}
                        className={clsx(
                          'text-[9px] font-bold px-1 py-0.5 rounded-full',
                          g === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                        )}
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-xs font-medium text-slate-700 mt-0.5 leading-tight">
                  {merged.name}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                  <span>{merged.totalTrucks}台</span>
                  <span>{merged.totalPallets}枚</span>
                </div>
                <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      'h-full rounded-full',
                      sfr >= 90 ? 'bg-emerald-500' : sfr >= 60 ? 'bg-amber-400' : 'bg-red-400',
                    )}
                    style={{ width: `${sfr}%` }}
                  />
                </div>
              </button>
            );
          })}
        </aside>

        {/* ── 中央: トラック図 ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
          {activeFactories.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              出荷計画がありません。生産計画入力から数量を設定してください。
            </div>
          ) : !selectedMerged || allTrucks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              拠点を選択してください
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-lg font-bold text-slate-800">{selectedMerged.name}</h1>
                  {/* Sub-warehouse group badges */}
                  {selectedMerged.plans.map((p) => {
                    const whInfo = warehouseMap[p.warehouseCode];
                    return (
                      <span
                        key={p.warehouseCode}
                        className={clsx(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                          whInfo?.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                        )}
                      >
                        {p.warehouseCode}{whInfo?.group ? ` ${whInfo.group}` : ''}
                      </span>
                    );
                  })}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    {factories.find((f) => f.code === selectedFactory)?.name ?? selectedFactory}
                  </span>
                  {effectiveDay >= 0 && (
                    <span className={clsx(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded',
                      effectiveDay === 5 ? 'bg-blue-100 text-blue-700' :
                      effectiveDay === 6 ? 'bg-red-100 text-red-600' :
                      'bg-slate-100 text-slate-600',
                    )}>
                      {DAY_LABELS[effectiveDay]}曜日
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {activeTruckType?.name ? `${activeTruckType.name}（最大${activeTruckType.maxPallets}パレット）・` : ''}
                  {effectiveDay === -1 ? '週計' : DAY_LABELS[effectiveDay] + '曜日'} {selectedMerged.totalTrucks}台
                  ・総計 {selectedMerged.totalPallets}パレット
                  ・出荷 {selectedMerged.totalQty.toLocaleString()}個
                </p>
              </div>

              {/* サマリーバー */}
              <div className="flex gap-4 mb-4 p-3 bg-white rounded-lg border border-slate-200 shadow-sm text-sm">
                {[
                  { label: '台数', val: `${selectedMerged.totalTrucks}台` },
                  { label: '総パレット', val: `${selectedMerged.totalPallets}枚` },
                  { label: '出荷個数', val: `${selectedMerged.totalQty.toLocaleString()}個` },
                  { label: '積載率', val: `${fr}%` },
                ].map(({ label, val }) => (
                  <div key={label} className="text-center px-3">
                    <div className="font-bold text-brand-600 text-base">{val}</div>
                    <div className="text-[10px] text-slate-400">{label}</div>
                  </div>
                ))}
                <div className="flex-1 flex items-center pl-3">
                  <div className="w-full">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full transition-all',
                          fr >= 90 ? 'bg-emerald-500' : fr >= 60 ? 'bg-amber-400' : 'bg-red-400',
                        )}
                        style={{ width: `${fr}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 号車タブ（全プランのトラックをフラット表示） */}
              <div className="flex gap-2 mb-4 flex-wrap items-center">
                {truckPlanLabels.map(({ plan: tPlan, globalIndex }, i) => {
                  // Insert a separator badge at the start of each new plan group
                  const prevLabel = i > 0 ? truckPlanLabels[i - 1] : null;
                  const isNewGroup = prevLabel && prevLabel.planIndex !== truckPlanLabels[i].planIndex;
                  const whInfo = warehouseMap[tPlan.warehouseCode];
                  return (
                    <span key={globalIndex} className="flex items-center gap-1">
                      {(i === 0 || isNewGroup) && selectedMerged.plans.length > 1 && (
                        <span className={clsx(
                          'text-[9px] font-bold px-1.5 py-0.5 rounded',
                          whInfo?.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                        )}>
                          {tPlan.warehouseCode}{whInfo?.group ? ` ${whInfo.group}` : ''}
                        </span>
                      )}
                      <button
                        onClick={() => setSelectedTruck(globalIndex)}
                        className={clsx(
                          'px-3 py-1.5 rounded-full border text-sm transition-all',
                          clampedTruck === globalIndex
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-brand-400',
                        )}
                      >
                        {globalIndex + 1}号車
                        <span className="ml-1.5 text-[10px] opacity-70">
                          {allTrucks[globalIndex].totalPallets}/{allTrucks[globalIndex].maxPallets}
                        </span>
                      </button>
                    </span>
                  );
                })}
              </div>

              {/* 積み込みのヒント */}
              <div className="text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4 text-amber-800">
                💡 <strong>積み込み手順：</strong>
                ①番から順にキャブ側（前方）から積みます。同一製品はまとめて連続積み。ウイング車は側面ドアから積み込んでください。
              </div>

              {/* トラック図 + 凡例 */}
              {load && activeTruckType && (
                <div className="flex gap-6 items-start flex-wrap">
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                    <div className="text-xs font-semibold text-slate-500 mb-3">
                      積載レイアウト ─ {clampedTruck + 1}号車
                      （床面 {load.totalPallets}/{load.maxPallets}パレット）
                    </div>
                    <TruckDiagram
                      load={load}
                      truckType={activeTruckType}
                      products={products}
                      productColors={productColors}
                      productNames={productNames}
                    />
                    <div className="text-[10px] text-slate-400 mt-2 text-center">
                      荷台 {activeTruckType.widthMM.toLocaleString()} × {activeTruckType.depthMM.toLocaleString()}mm
                      　高さ {activeTruckType.heightMM.toLocaleString()}mm
                    </div>
                  </div>

                  {/* 製品凡例 */}
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 min-w-[200px]">
                    <div className="text-xs font-semibold text-slate-500 mb-3">製品カラー凡例</div>
                    <div className="flex flex-col gap-2">
                      {[...new Set(load.items.map((i) => i.productCode))].map((code) => (
                        <div key={code} className="flex items-center gap-2 text-xs">
                          <span
                            className="w-4 h-4 rounded border border-black/10 shrink-0"
                            style={{ background: productColors[code] ?? '#ccc' }}
                          />
                          <span className="text-slate-700">{productNames[code] ?? code}</span>
                          <span className="text-slate-400 ml-auto">
                            {products.find((p) => p.code === code)?.capacityPerPallet}個/枚
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 右パネル: 積み込み手順 ── */}
        <aside className="w-64 shrink-0 bg-white border-l border-slate-200 overflow-y-auto">
          <div className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
            積み込み手順 {load ? `— ${clampedTruck + 1}号車` : ''}
          </div>
          {load ? (
            <>
              <LoadingTable
                load={load}
                productColors={productColors}
                productNames={productNames}
              />
              <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
                <strong className="text-slate-600">積み込みメモ</strong><br />
                ① 重い製品・多パレット品を先頭（キャブ寄り）に<br />
                ② 同一製品はまとめて連続積み<br />
                ③ ウイング車は側面から積み込む
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400 p-4 italic">拠点・号車を選択してください</p>
          )}
        </aside>
      </div>
    </div>
  );
}

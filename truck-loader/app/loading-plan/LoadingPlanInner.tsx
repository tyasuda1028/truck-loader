'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcWeeklyPlans, calcSendQty } from '@/lib/calculations';
import { buildProductColors } from '@/lib/productColors';
import { TruckDiagram } from '@/components/TruckDiagram';
import { LoadingTable } from '@/components/LoadingTable';
import { AIRecommendationPanel } from '@/components/AIRecommendationPanel';
import { useAiRecommendation } from '@/lib/useAiRecommendation';
import type { DayWarehousePlan, Warehouse } from '@/lib/types';
import clsx from 'clsx';

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

// ── 週計算ユーティリティ ───────────────────────────────────────────────────────
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function formatMD(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.getFullYear()}年 第${getISOWeek(monday)}週（${formatMD(monday)}〜${formatMD(sunday)}）`;
}
/** 名前で重複排除（最初の出現を残す） */
function dedupeByName<T extends { name: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => { if (seen.has(x.name)) return false; seen.add(x.name); return true; });
}

// ── Merged destination interface ──────────────────────────────────────────────
interface MergedDestination {
  name: string;
  plans: DayWarehousePlan[];
  totalTrucks: number;
  totalPallets: number;
  totalQty: number;
}

export default function LoadingPlanInner() {
  const {
    factories, products, warehouses, truckTypes, palletTypes,
    productionPlan, baselineStock, locationStock,
    weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual,
    confirmShipment, setShippingDay, setSendQtyManual,
  } = useAppStore();

  // AI提案ドロワー
  const ai = useAiRecommendation();
  const [aiOpen, setAiOpen] = useState(false);

  const productColors = buildProductColors(products);
  const productNames  = Object.fromEntries(products.map((p) => [p.code, p.name]));
  const truckMap      = Object.fromEntries(truckTypes.map((t) => [t.code, t]));
  const warehouseMap  = Object.fromEntries(warehouses.map((w) => [w.code, w]));

  // 全製品の週間送り数（出荷確定用）
  const allSendQty = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales),
    [products, warehouses, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales],
  );

  // 工場別・日別計画
  const weeklyPlans = useMemo(
    () => calcWeeklyPlans(
      warehouses, products, truckTypes, factories,
      productionPlan, baselineStock, locationStock,
      weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual, palletTypes,
    ),
    [warehouses, products, truckTypes, factories, productionPlan, baselineStock, locationStock, weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual, palletTypes],
  );

  // ── 表示ビュー ─────────────────────────────────────────────────────────────
  type View = 'schedule' | 'plan';
  const [activeView, setActiveView] = useState<View>('schedule');

  // ── 出荷確定 ───────────────────────────────────────────────────────────────
  const [confirmed, setConfirmed] = useState(false);
  const handleConfirmShipment = () => {
    confirmShipment(allSendQty);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 4000);
  };

  // ── 工場選択（全工場表示） ─────────────────────────────────────────────────
  const [selectedFactory, setSelectedFactory] = useState<string>(factories[0]?.code ?? '');

  // ── 積載計画ビュー用 state ─────────────────────────────────────────────────
  const [selectedDay, setSelectedDay]   = useState<number>(-99);
  const [selectedWH,  setSelectedWH]    = useState<string>('');
  const [selectedTruck, setSelectedTruck] = useState(0);

  // ── スケジュール設定ビュー用 state ─────────────────────────────────────────
  const [planMonday, setPlanMonday] = useState<Date>(() => getMondayOf(new Date()));
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(planMonday); d.setDate(planMonday.getDate() + i); return d;
  }), [planMonday]);

  // ── 選択中工場の計画 ────────────────────────────────────────────────────────
  const factoryPlans = weeklyPlans[selectedFactory] ?? [];

  const availableDays = useMemo(() => {
    const days = new Set<number>();
    for (const p of factoryPlans) days.add(p.dayOfWeek);
    return Array.from(days).sort((a, b) => { if (a === -1) return -1; if (b === -1) return 1; return a - b; });
  }, [factoryPlans]);

  const effectiveDay = selectedDay === -99 ? (availableDays[0] ?? -99) : selectedDay;
  const plansForDay  = factoryPlans.filter((p) => p.dayOfWeek === effectiveDay);

  // ── Merge warehouses by name (積載計画ビュー用) ────────────────────────────
  const mergedForDay = useMemo(() => {
    const groups = new Map<string, DayWarehousePlan[]>();
    for (const p of plansForDay) {
      const name = warehouseMap[p.warehouseCode]?.name ?? p.warehouseCode;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(p);
    }
    return Array.from(groups.entries()).map(([name, plans]) => ({
      name, plans,
      totalTrucks:  plans.reduce((s, p) => s + p.trucks.length, 0),
      totalPallets: plans.reduce((s, p) => s + p.totalPallets, 0),
      totalQty:     plans.reduce((s, p) => s + p.totalQty, 0),
    }));
  }, [plansForDay, warehouseMap]);

  const selectedMerged: MergedDestination | undefined =
    mergedForDay.find((m) => m.name === selectedWH) ?? mergedForDay[0];
  const allTrucks   = selectedMerged?.plans.flatMap((p) => p.trucks) ?? [];
  const clampedTruck = allTrucks.length > 0 ? Math.min(selectedTruck, allTrucks.length - 1) : 0;

  const findPlanForTruckIndex = (idx: number): DayWarehousePlan | undefined => {
    if (!selectedMerged) return undefined;
    let offset = 0;
    for (const p of selectedMerged.plans) { if (idx < offset + p.trucks.length) return p; offset += p.trucks.length; }
    return selectedMerged.plans[selectedMerged.plans.length - 1];
  };

  const activePlan     = findPlanForTruckIndex(clampedTruck);
  const activeWh       = activePlan ? warehouseMap[activePlan.warehouseCode] : undefined;
  const activeTruckType = activeWh ? truckMap[activeWh.truckType] : undefined;
  const load           = allTrucks[clampedTruck];

  const computeMergedFillRate = (merged: MergedDestination): number => {
    let totalMax = 0, totalUsed = 0;
    for (const p of merged.plans) {
      // t.maxPallets は bin-pack 時に算出した有効積載数（2段積み対応済み）
      totalMax += p.trucks.reduce((s, t) => s + t.maxPallets, 0);
      totalUsed += p.totalPallets;
    }
    return totalMax > 0 ? Math.round((totalUsed / totalMax) * 100) : 0;
  };
  const fr = selectedMerged ? computeMergedFillRate(selectedMerged) : 0;

  // planByDayWh: warehouseCode × dayOfWeek → plan
  const planByDayWh = useMemo(() => {
    const map: Record<string, DayWarehousePlan> = {};
    for (const plan of factoryPlans) map[`${plan.dayOfWeek}_${plan.warehouseCode}`] = plan;
    return map;
  }, [factoryPlans]);

  // ── スケジュール設定ビュー用: 拠点リスト（重複排除、基準在庫数あり） ──────────
  const factoryProducts = products.filter((p) => (p.factoryCode ?? 'F001') === selectedFactory);
  const scheduleWarehouses = useMemo(() => {
    if (factoryProducts.length === 0) return [];
    const seen = new Set<string>();
    return warehouses.filter((wh) => {
      if (seen.has(wh.name)) return false;
      const allCodes = warehouses.filter((w) => w.name === wh.name);
      const hasBaseline = factoryProducts.some((p) => allCodes.some((w) => (baselineStock[p.code]?.[w.code] ?? 0) > 0));
      if (hasBaseline) { seen.add(wh.name); return true; }
      return false;
    });
  }, [factoryProducts, warehouses, baselineStock]);

  const getDayActive = (wh: Warehouse, dayIdx: number): boolean => {
    const allCodes = warehouses.filter((w) => w.name === wh.name);
    return allCodes.some((w) => weeklyShippingSchedule[selectedFactory]?.[w.code]?.[dayIdx] ?? false);
  };
  const handleToggle = (wh: Warehouse, dayIdx: number) => {
    const current = getDayActive(wh, dayIdx);
    warehouses.filter((w) => w.name === wh.name).forEach((w) => setShippingDay(selectedFactory, w.code, dayIdx, !current));
  };

  // ── Truck nav labels ───────────────────────────────────────────────────────
  const truckPlanLabels = useMemo(() => {
    if (!selectedMerged) return [];
    const labels: Array<{ planIndex: number; plan: DayWarehousePlan; globalIndex: number }> = [];
    let globalIdx = 0;
    selectedMerged.plans.forEach((p, pi) => { p.trucks.forEach(() => { labels.push({ planIndex: pi, plan: p, globalIndex: globalIdx }); globalIdx++; }); });
    return labels;
  }, [selectedMerged]);

  // ── 工場切り替え ───────────────────────────────────────────────────────────
  const handleFactorySelect = (code: string) => {
    setSelectedFactory(code);
    const plans = weeklyPlans[code] ?? [];
    const days = Array.from(new Set(plans.map((p) => p.dayOfWeek))).sort((a, b) => { if (a === -1) return -1; if (b === -1) return 1; return a - b; });
    const firstDay = days[0] ?? -99;
    setSelectedDay(firstDay);
    const firstPlan = plans.find((p) => p.dayOfWeek === firstDay);
    setSelectedWH(firstPlan ? (warehouseMap[firstPlan.warehouseCode]?.name ?? firstPlan.warehouseCode) : '');
    setSelectedTruck(0);
  };

  const handleDaySelect = (day: number) => {
    setSelectedDay(day);
    const dayPlans = factoryPlans.filter((p) => p.dayOfWeek === day);
    setSelectedWH(dayPlans[0] ? (warehouseMap[dayPlans[0].warehouseCode]?.name ?? dayPlans[0].warehouseCode) : '');
    setSelectedTruck(0);
  };

  const dayLabel = (day: number) => day === -1 ? '未スケジュール' : DAY_LABELS[day] ? `${DAY_LABELS[day]}曜日` : '';
  const factory  = factories.find((f) => f.code === selectedFactory);

  // ─────────────────────────────────────────────────────────────────────────────
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
            confirmed ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700 active:scale-95',
          )}
        >
          {confirmed ? '✓ 出荷確定済み' : '🚚 出荷確定'}
        </button>
      </div>

      {/* ── 工場タブ ── */}
      {factories.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-4 flex gap-1 shrink-0">
          {factories.map((f) => {
            const hasPlans = (weeklyPlans[f.code] ?? []).length > 0;
            return (
              <button
                key={f.code}
                onClick={() => handleFactorySelect(f.code)}
                className={clsx(
                  'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                  selectedFactory === f.code ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                  {f.code}
                </span>
                {f.name}
                {hasPlans && activeView === 'plan' && (
                  <span className="text-[9px] px-1 py-0.5 rounded-full bg-emerald-100 text-emerald-700">計画あり</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── ビュー切替タブ ── */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 flex items-center gap-1 shrink-0">
        <button
          onClick={() => setActiveView('schedule')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeView === 'schedule' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700',
          )}
        >
          📅 スケジュール設定
        </button>
        <button
          onClick={() => setActiveView('plan')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeView === 'plan' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700',
          )}
        >
          🚛 積載計画
        </button>
        <button
          onClick={() => { setAiOpen(true); if (!ai.data && !ai.loading) ai.generate(); }}
          className="ml-auto my-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          🤖 AI提案
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ビュー①：スケジュール設定
      ══════════════════════════════════════════════════════════════════════ */}
      {activeView === 'schedule' && (
        <div className="flex-1 overflow-y-auto p-5">

          {/* 計画週セレクター */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm mb-4 px-5 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { const d = new Date(planMonday); d.setDate(d.getDate() - 7); setPlanMonday(d); }}
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-600 font-bold text-lg flex items-center justify-center"
              >‹</button>
              <div>
                <div className="text-sm font-bold text-slate-800">{formatWeekLabel(planMonday)}</div>
                <div className="text-[11px] text-slate-400">出荷スケジュールを設定する計画週</div>
              </div>
              <button
                onClick={() => { const d = new Date(planMonday); d.setDate(d.getDate() + 7); setPlanMonday(d); }}
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-600 font-bold text-lg flex items-center justify-center"
              >›</button>
            </div>
            <button
              onClick={() => setPlanMonday(getMondayOf(new Date()))}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold transition-colors"
            >
              今週
            </button>
          </div>

          {/* 説明バナー */}
          <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-start gap-2">
            <span className="text-base leading-none shrink-0">💡</span>
            <div className="leading-relaxed">
              <strong>スケジュール設定と積載計画の関係：</strong>
              各拠点の<strong>週間送り数（パレット）を出荷日数で均等分割</strong>して、1日あたりの積載量を算出します。<br />
              例：週間送り数 12P・出荷2日 → <span className="font-bold text-blue-700">1日あたり 6P</span>　／　週間送り数 12P・出荷4日 → <span className="font-bold text-blue-700">1日あたり 3P</span><br />
              ✓ をクリックして出荷曜日を設定すると、「🚛 積載計画」タブで各日のトラック積載図を確認できます。
            </div>
          </div>

          {/* 工場が見つからない */}
          {!factory ? (
            <p className="text-sm text-slate-400 italic">工場マスタに工場が登録されていません。</p>
          ) : factoryProducts.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              「{factory.name}」に割り当てられた製品がありません。マスタ設定の製品マスタから出荷工場を設定してください。
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{factory.code}</span>
                <span className="text-sm font-semibold text-slate-700">{factory.name}</span>
                <span className="text-xs text-slate-400">— 製品 {factoryProducts.length}種 / 対象拠点 {scheduleWarehouses.length}拠点</span>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b-2 border-slate-200">
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500 min-w-[160px] sticky left-0 bg-slate-50 border-r border-slate-100">
                        拠点
                      </th>
                      {weekDates.map((date, i) => (
                        <th key={i} className="px-2 py-2.5 text-center font-semibold min-w-[76px]"
                          style={{ color: i === 5 ? '#2563eb' : i === 6 ? '#dc2626' : '#6b7280' }}
                        >
                          <div className="font-bold text-[13px]">{DAY_LABELS[i]}</div>
                          <div className="text-[10px] font-normal" style={{ color: i === 5 ? '#93c5fd' : i === 6 ? '#fca5a5' : '#9ca3af' }}>
                            {formatMD(date)}
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-center font-semibold text-slate-400 min-w-[52px] border-l border-slate-200">日数</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-slate-500 min-w-[72px] border-l border-slate-200">
                        <div>週間計</div>
                        <div className="text-[10px] font-normal text-slate-400">送り数</div>
                      </th>
                      <th className="px-3 py-2.5 text-center font-semibold text-emerald-600 min-w-[80px]">
                        <div>1日あたり</div>
                        <div className="text-[10px] font-normal text-emerald-400">週計 ÷ 日数</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleWarehouses.length === 0 ? (
                      <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400 italic">基準在庫数が設定された拠点がありません</td></tr>
                    ) : (
                      scheduleWarehouses.map((wh, ri) => {
                        const activeDayCount = DAY_LABELS.filter((_, i) => getDayActive(wh, i)).length;
                        // 週間合計パレット数 = 各稼働日の計画パレット数を合算
                        const weeklyPallets = factoryPlans
                          .filter((p) => p.warehouseCode === wh.code)
                          .reduce((s, p) => s + p.totalPallets, 0);
                        const weeklyQty = factoryPlans
                          .filter((p) => p.warehouseCode === wh.code)
                          .reduce((s, p) => s + p.totalQty, 0);
                        // 1日あたり（最初の日は端数を持つため代表値として1日目のプランを使用）
                        const firstDayPlan = DAY_LABELS
                          .map((_, i) => planByDayWh[`${i}_${wh.code}`])
                          .find(Boolean);
                        const perDayPallets = firstDayPlan?.totalPallets ?? (activeDayCount > 0 && weeklyPallets > 0 ? Math.round(weeklyPallets / activeDayCount) : 0);
                        const perDayQty    = firstDayPlan?.totalQty    ?? (activeDayCount > 0 && weeklyQty > 0    ? Math.round(weeklyQty    / activeDayCount) : 0);

                        return (
                          <tr key={wh.name} className={clsx('border-b border-slate-100', ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}>
                            {/* 拠点名 */}
                            <td className="px-4 py-2 sticky left-0 bg-white border-r border-slate-100">
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="font-semibold text-slate-700">{wh.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{wh.code}</div>
                                </div>
                              </div>
                            </td>
                            {/* 曜日セル */}
                            {DAY_LABELS.map((_, dayIdx) => {
                              const active = getDayActive(wh, dayIdx);
                              const cellPlan = planByDayWh[`${dayIdx}_${wh.code}`];
                              const hasQty = active && cellPlan && cellPlan.trucks.length > 0;
                              return (
                                <td key={dayIdx} className="px-1 py-1.5 text-center">
                                  <button
                                    onClick={() => handleToggle(wh, dayIdx)}
                                    title={`${wh.name} — ${DAY_LABELS[dayIdx]}曜日（${formatMD(weekDates[dayIdx])}）`}
                                    className={clsx(
                                      'w-14 rounded-lg border transition-all flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 mx-auto',
                                      active ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-400',
                                    )}
                                    style={{ minHeight: hasQty ? 56 : 34 }}
                                  >
                                    {active ? (
                                      <>
                                        <span className="text-[11px] font-bold text-blue-600">✓</span>
                                        {hasQty ? (
                                          <>
                                            <span className="text-[9px] font-bold text-blue-700">{cellPlan.trucks.length}台</span>
                                            <span className="text-[9px] text-slate-700 font-semibold">{cellPlan.totalQty.toLocaleString()}個</span>
                                            <span className="text-[9px] text-slate-500">{cellPlan.totalPallets}P</span>
                                          </>
                                        ) : (
                                          <span className="text-[9px] text-blue-300">計画なし</span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-[9px] text-slate-300">—</span>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                            {/* 出荷日数 */}
                            <td className="px-3 py-2 text-center border-l border-slate-200">
                              {activeDayCount > 0 ? (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                                  {activeDayCount}日
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-300">未設定</span>
                              )}
                            </td>
                            {/* 週間合計 */}
                            <td className="px-3 py-2 text-center border-l border-slate-200">
                              {weeklyPallets > 0 ? (
                                <div>
                                  <div className="font-bold text-slate-700">{weeklyPallets}P</div>
                                  <div className="text-[10px] text-slate-400">{weeklyQty.toLocaleString()}個</div>
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            {/* 1日あたり */}
                            <td className="px-3 py-2 text-center">
                              {activeDayCount > 0 && weeklyPallets > 0 ? (
                                <div>
                                  <div className="font-bold text-emerald-600 text-sm">{perDayPallets}P</div>
                                  <div className="text-[10px] text-slate-400">{perDayQty.toLocaleString()}個</div>
                                  <div className="text-[9px] text-slate-300 mt-0.5">{weeklyPallets}÷{activeDayCount}日</div>
                                </div>
                              ) : activeDayCount === 0 ? (
                                <span className="text-[10px] text-slate-300">日数を設定</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* 凡例 */}
              <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border border-blue-400 bg-blue-50" /> 出荷あり（クリックで解除）</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border border-slate-200 bg-white" /> 出荷なし（クリックで設定）</span>
                <span className="ml-auto text-slate-400">※ 各セルの数字は <span className="font-semibold text-slate-500">週間送り数 ÷ 出荷日数</span> で算出した1日分の積載量です</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ビュー②：積載計画
      ══════════════════════════════════════════════════════════════════════ */}
      {activeView === 'plan' && (
        <>
          {/* ── 曜日タブ ── */}
          {availableDays.length > 0 && (
            <div className="bg-slate-50 border-b border-slate-200 px-4 flex items-center shrink-0">
              <div className="flex gap-1 flex-1">
                {availableDays.map((day) => (
                  <button
                    key={day}
                    onClick={() => handleDaySelect(day)}
                    className={clsx(
                      'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                      effectiveDay === day ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600',
                    )}
                  >
                    {day === -1 ? '週全体' : DAY_LABELS[day]}
                    {day !== -1 && <span className="ml-1 opacity-60">曜</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-1 overflow-hidden">
            {/* ── 左パネル: 拠点リスト ── */}
            <aside className="w-52 shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
              <div className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                {dayLabel(effectiveDay)} — 配送拠点
              </div>
              {mergedForDay.length === 0 && (
                <p className="text-xs text-slate-400 p-4 italic">
                  出荷計画がありません。<br />
                  スケジュール設定で出荷曜日を設定してください。
                </p>
              )}
              {mergedForDay.map((merged) => {
                const isActive = merged.name === (selectedMerged?.name ?? '');
                const sfr = computeMergedFillRate(merged);
                return (
                  <button
                    key={merged.name}
                    onClick={() => { setSelectedWH(merged.name); setSelectedTruck(0); }}
                    className={clsx(
                      'w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors',
                      isActive ? 'bg-brand-50 border-l-[3px] border-l-brand-600' : 'hover:bg-slate-50 border-l-[3px] border-l-transparent',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-bold text-slate-400 truncate">{merged.plans.map((p) => p.warehouseCode).join('/')}</span>
                    </div>
                    <div className="text-xs font-medium text-slate-700 mt-0.5 leading-tight">{merged.name}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                      <span>{merged.totalTrucks}台</span><span>{merged.totalPallets}枚</span>
                    </div>
                    <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className={clsx('h-full rounded-full', sfr >= 90 ? 'bg-emerald-500' : sfr >= 60 ? 'bg-amber-400' : 'bg-red-400')} style={{ width: `${sfr}%` }} />
                    </div>
                  </button>
                );
              })}
            </aside>

            {/* ── 中央: トラック図 ── */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
              {(weeklyPlans[selectedFactory] ?? []).length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  出荷計画がありません。「📅 スケジュール設定」で出荷曜日を設定してください。
                </div>
              ) : !selectedMerged || allTrucks.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">拠点を選択してください</div>
              ) : (
                <>
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h1 className="text-lg font-bold text-slate-800">{selectedMerged.name}</h1>
                      {selectedMerged.plans.map((p) => (
                        <span key={p.warehouseCode} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {p.warehouseCode}
                        </span>
                      ))}
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                        {factories.find((f) => f.code === selectedFactory)?.name ?? selectedFactory}
                      </span>
                      {effectiveDay >= 0 && (
                        <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded', effectiveDay === 5 ? 'bg-blue-100 text-blue-700' : effectiveDay === 6 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600')}>
                          {DAY_LABELS[effectiveDay]}曜日
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {activeTruckType?.name ? `${activeTruckType.name}（最大${load?.maxPallets ?? activeTruckType.maxPallets}パレット${load && load.maxPallets > activeTruckType.maxPallets ? '・2段積み' : ''}）・` : ''}
                      {effectiveDay === -1 ? '週計' : DAY_LABELS[effectiveDay] + '曜日'} {selectedMerged.totalTrucks}台
                      ・総計 {selectedMerged.totalPallets}パレット・出荷 {selectedMerged.totalQty.toLocaleString()}個
                    </p>
                  </div>

                  {/* サマリーバー */}
                  <div className="flex gap-4 mb-4 p-3 bg-white rounded-lg border border-slate-200 shadow-sm text-sm">
                    {[
                      { label: '台数',    val: `${selectedMerged.totalTrucks}台` },
                      { label: '総パレット', val: `${selectedMerged.totalPallets}枚` },
                      { label: '出荷個数', val: `${selectedMerged.totalQty.toLocaleString()}個` },
                      { label: '積載率',  val: `${fr}%` },
                    ].map(({ label, val }) => (
                      <div key={label} className="text-center px-3">
                        <div className="font-bold text-brand-600 text-base">{val}</div>
                        <div className="text-[10px] text-slate-400">{label}</div>
                      </div>
                    ))}
                    <div className="flex-1 flex items-center pl-3">
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={clsx('h-full rounded-full transition-all', fr >= 90 ? 'bg-emerald-500' : fr >= 60 ? 'bg-amber-400' : 'bg-red-400')} style={{ width: `${fr}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* 号車タブ */}
                  <div className="flex gap-2 mb-4 flex-wrap items-center">
                    {truckPlanLabels.map(({ plan: tPlan, globalIndex }, i) => {
                      const prevLabel = i > 0 ? truckPlanLabels[i - 1] : null;
                      const isNewGroup = prevLabel && prevLabel.planIndex !== truckPlanLabels[i].planIndex;
                      return (
                        <span key={globalIndex} className="flex items-center gap-1">
                          {(i === 0 || isNewGroup) && selectedMerged.plans.length > 1 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {tPlan.warehouseCode}
                            </span>
                          )}
                          <button
                            onClick={() => setSelectedTruck(globalIndex)}
                            className={clsx(
                              'px-3 py-1.5 rounded-full border text-sm transition-all',
                              clampedTruck === globalIndex ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300 hover:border-brand-400',
                            )}
                          >
                            {globalIndex + 1}号車
                            <span className="ml-1.5 text-[10px] opacity-70">{allTrucks[globalIndex].totalPallets}/{allTrucks[globalIndex].maxPallets}</span>
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  {/* 積み込みのヒント */}
                  <div className="text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4 text-amber-800">
                    💡 <strong>積み込み手順：</strong>①番から順にキャブ側（前方）から積みます。同一製品はまとめて連続積み。ウイング車は側面ドアから積み込んでください。
                  </div>

                  {/* トラック図 + 凡例 */}
                  {load && activeTruckType && (
                    <div className="flex gap-6 items-start flex-wrap">
                      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                        <div className="text-xs font-semibold text-slate-500 mb-3">
                          積載レイアウト ─ {clampedTruck + 1}号車（{load.maxPallets > activeTruckType.maxPallets ? '2段込み' : '床面'} {load.totalPallets}/{load.maxPallets}パレット）
                        </div>
                        <TruckDiagram load={load} truckType={activeTruckType} products={products} palletTypes={palletTypes} productColors={productColors} productNames={productNames} />
                        <div className="text-[10px] text-slate-400 mt-2 text-center">
                          荷台 {activeTruckType.widthMM.toLocaleString()} × {activeTruckType.depthMM.toLocaleString()}mm　高さ {activeTruckType.heightMM.toLocaleString()}mm
                        </div>
                      </div>
                      {/* 製品凡例 */}
                      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 min-w-[200px]">
                        <div className="text-xs font-semibold text-slate-500 mb-3">製品カラー凡例</div>
                        <div className="flex flex-col gap-2">
                          {[...new Set(load.items.map((i) => i.productCode))].map((code) => (
                            <div key={code} className="flex items-center gap-2 text-xs">
                              <span className="w-4 h-4 rounded border border-black/10 shrink-0" style={{ background: productColors[code] ?? '#ccc' }} />
                              <span className="text-slate-700">{productNames[code] ?? code}</span>
                              <span className="text-slate-400 ml-auto">{products.find((p) => p.code === code)?.capacityPerPallet}個/枚</span>
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
                  <LoadingTable load={load} productColors={productColors} productNames={productNames} />
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
        </>
      )}

      {/* ── AI提案 スライドオーバー ── */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setAiOpen(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-md h-full bg-slate-50 shadow-2xl overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">🤖 AI提案</h2>
              <button
                onClick={() => setAiOpen(false)}
                className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                閉じる ✕
              </button>
            </div>
            <div className="p-4">
              <AIRecommendationPanel
                data={ai.data}
                loading={ai.loading}
                error={ai.error}
                onGenerate={ai.generate}
                onApplyAdjustment={(pc, wc, qty) => setSendQtyManual(pc, wc, qty)}
                productNames={productNames}
                className="border-0 shadow-none p-0 bg-transparent"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

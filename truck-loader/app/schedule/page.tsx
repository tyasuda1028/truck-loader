'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcWeeklyPlans } from '@/lib/calculations';
import type { DayWarehousePlan, Warehouse, Product } from '@/lib/types';

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

// ─── 週計算ユーティリティ ──────────────────────────────────────────────

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

// ─── ページ本体 ──────────────────────────────────────────────────────

export default function SchedulePage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock, locationStock,
    weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual, setShippingDay,
  } = useAppStore();

  const [selectedFactory, setSelectedFactory] = useState<string>(factories[0]?.code ?? '');
  const [planMonday, setPlanMonday] = useState<Date>(() => getMondayOf(new Date()));

  const factory = factories.find((f) => f.code === selectedFactory);

  const factoryProducts = products.filter(
    (p) => (p.factoryCode ?? 'F001') === selectedFactory,
  );

  const relevantWarehouses = useMemo(() => {
    if (factoryProducts.length === 0) return [];
    const seen = new Set<string>();
    return warehouses.filter((wh) => {
      if (seen.has(wh.name)) return false;
      const allCodes = warehouses.filter((w) => w.name === wh.name);
      const hasRatio = factoryProducts.some((p) => allCodes.some((w) => (distributionRatios[p.code]?.[w.code] ?? 0) > 0));
      if (hasRatio) { seen.add(wh.name); return true; }
      return false;
    });
  }, [factoryProducts, warehouses, distributionRatios]);

  const weeklyPlans = useMemo(
    () =>
      calcWeeklyPlans(
        warehouses, products, truckTypes, factories,
        productionPlan, distributionRatios, inventoryStock, locationStock,
        weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual,
      ),
    [warehouses, products, truckTypes, factories, productionPlan, distributionRatios, inventoryStock, locationStock, weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual],
  );

  const factoryPlans = weeklyPlans[selectedFactory] ?? [];

  // dayOfWeek → DayWarehousePlan[] のマップ
  const plansByDay: Record<number, DayWarehousePlan[]> = {};
  for (const plan of factoryPlans) {
    const key = plan.dayOfWeek;
    if (!plansByDay[key]) plansByDay[key] = [];
    plansByDay[key].push(plan);
  }

  // warehouseCode → DayWarehousePlan のクイックルックアップ（日別）
  const planByDayWh: Record<string, DayWarehousePlan> = {};
  for (const plan of factoryPlans) {
    planByDayWh[`${plan.dayOfWeek}_${plan.warehouseCode}`] = plan;
  }

  const getDayActive = (wh: (typeof relevantWarehouses)[number], dayIdx: number): boolean => {
    const allCodes = warehouses.filter((w) => w.name === wh.name);
    return allCodes.some((w) => weeklyShippingSchedule[selectedFactory]?.[w.code]?.[dayIdx] ?? false);
  };

  const handleToggle = (wh: (typeof relevantWarehouses)[number], dayIdx: number) => {
    const current = getDayActive(wh, dayIdx);
    const allCodes = warehouses.filter((w) => w.name === wh.name);
    allCodes.forEach((w) => setShippingDay(selectedFactory, w.code, dayIdx, !current));
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(planMonday);
    d.setDate(planMonday.getDate() + i);
    return d;
  });

  const prevWeek = () => { const d = new Date(planMonday); d.setDate(d.getDate() - 7); setPlanMonday(d); };
  const nextWeek = () => { const d = new Date(planMonday); d.setDate(d.getDate() + 7); setPlanMonday(d); };
  const toThisWeek = () => setPlanMonday(getMondayOf(new Date()));

  return (
    <div className="sys-page">

      {/* ── ページタイトル ── */}
      <div className="sys-page-title">出荷スケジュール</div>

      {/* ── 計画週セレクター ── */}
      <div className="card mb-5 px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={prevWeek}
            style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 14 }}
          >‹</button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
              {formatWeekLabel(planMonday)}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>出荷スケジュールを設定する計画週</div>
          </div>
          <button
            onClick={nextWeek}
            style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 14 }}
          >›</button>
        </div>
        <button
          onClick={toThisWeek}
          style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', cursor: 'pointer', fontWeight: 600 }}
        >
          今週
        </button>
      </div>

      {/* ── 工場タブ ── */}
      <div className="flex gap-1 mb-5" style={{ borderBottom: '1px solid #e5e7eb' }}>
        {factories.map((f) => (
          <button
            key={f.code}
            onClick={() => setSelectedFactory(f.code)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderBottom: selectedFactory === f.code ? '2px solid #2563eb' : '2px solid transparent',
              color: selectedFactory === f.code ? '#2563eb' : '#6b7280',
              marginBottom: -1,
              background: 'none', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 700, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>
              {f.code}
            </span>
            {f.name}
          </button>
        ))}
      </div>

      {!factory ? (
        <p className="text-sm text-slate-400 italic">工場マスタに工場が登録されていません。</p>
      ) : factoryProducts.length === 0 ? (
        <div className="card p-4 text-sm" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
          「{factory.name}」に割り当てられた製品がありません。マスタ設定の製品マスタから出荷工場を設定してください。
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 700, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>{factory.code}</span>
            <span className="text-sm font-semibold text-slate-700">{factory.name}</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              — 製品 {factoryProducts.length}種 / 対象拠点 {relevantWarehouses.length}拠点
            </span>
          </div>

          {/* ── スケジュール設定グリッド（出荷数量付き） ── */}
          <div className="section-title mb-3">出荷スケジュール設定</div>
          <div className="card overflow-x-auto mb-6">
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', position: 'sticky', left: 0, background: '#f9fafb', zIndex: 10, minWidth: 180, borderRight: '1px solid #f3f4f6' }}>
                    拠点
                  </th>
                  {weekDates.map((date, i) => (
                    <th key={i} style={{
                      padding: '8px 6px', textAlign: 'center', minWidth: 88,
                      color: i === 5 ? '#2563eb' : i === 6 ? '#dc2626' : '#6b7280',
                      fontWeight: 600,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{DAY_LABELS[i]}</div>
                      <div style={{ fontSize: 10, fontWeight: 400, color: i === 5 ? '#93c5fd' : i === 6 ? '#fca5a5' : '#9ca3af' }}>
                        {formatMD(date)}
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#9ca3af', minWidth: 56 }}>
                    日数
                  </th>
                </tr>
              </thead>
              <tbody>
                {relevantWarehouses.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                      配分比率が設定された拠点がありません
                    </td>
                  </tr>
                ) : (
                  relevantWarehouses.map((wh, ri) => {
                    const activeDayCount = DAY_LABELS.filter((_, i) => getDayActive(wh, i)).length;
                    // planByDayWh is keyed by firstWh.code from calcWeeklyPlans — use wh.code (first of name group)
                    return (
                      <tr key={wh.name} style={{ borderBottom: '1px solid #f3f4f6', background: ri % 2 === 0 ? 'white' : '#fafafa' }}>
                        {/* 拠点名 */}
                        <td style={{ padding: '8px 16px', position: 'sticky', left: 0, background: ri % 2 === 0 ? 'white' : '#fafafa', zIndex: 10, borderRight: '1px solid #f3f4f6' }}>
                          <div className="flex items-center gap-2">
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                              background: wh.group === '東' ? '#dbeafe' : '#fee2e2',
                              color: wh.group === '東' ? '#1e40af' : '#b91c1c',
                              border: `1px solid ${wh.group === '東' ? '#bfdbfe' : '#fecaca'}`,
                            }}>{wh.group}</span>
                            <div>
                              <div style={{ fontWeight: 600, color: '#374151' }}>{wh.name}</div>
                              <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{wh.code}</div>
                            </div>
                          </div>
                        </td>

                        {/* 曜日セル：トグル + 出荷数量 */}
                        {DAY_LABELS.map((_, dayIdx) => {
                          const active = getDayActive(wh, dayIdx);
                          const cellPlan = planByDayWh[`${dayIdx}_${wh.code}`];
                          const hasQty = active && cellPlan && cellPlan.trucks.length > 0;
                          return (
                            <td key={dayIdx} style={{ padding: '4px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
                              <button
                                onClick={() => handleToggle(wh, dayIdx)}
                                title={`${wh.name} — ${DAY_LABELS[dayIdx]}曜日（${formatMD(weekDates[dayIdx])}）`}
                                style={{
                                  width: 80,
                                  minHeight: hasQty ? 64 : 36,
                                  borderRadius: 6,
                                  border: active ? '2px solid #2563eb' : '2px solid #e5e7eb',
                                  background: active ? '#eff6ff' : 'white',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 1,
                                  padding: '4px 2px',
                                }}
                              >
                                {active ? (
                                  <>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb' }}>✓</span>
                                    {hasQty ? (
                                      <>
                                        <span style={{ fontSize: 9, color: '#1d4ed8', fontWeight: 700 }}>
                                          {cellPlan.trucks.length}台
                                        </span>
                                        <span style={{ fontSize: 9, color: '#6b7280' }}>
                                          {cellPlan.totalPallets}P
                                        </span>
                                        <span style={{ fontSize: 9, color: '#374151', fontWeight: 600 }}>
                                          {cellPlan.totalQty.toLocaleString()}個
                                        </span>
                                      </>
                                    ) : (
                                      <span style={{ fontSize: 9, color: '#93c5fd' }}>計画なし</span>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ fontSize: 9, color: '#d1d5db' }}>—</span>
                                )}
                              </button>
                            </td>
                          );
                        })}

                        {/* 週間集計列 */}
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {activeDayCount > 0 ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                              {activeDayCount}日
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#d1d5db' }}>未設定</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── 積載計画プレビュー（曜日別・製品内訳付き） ── */}
          <div className="section-title mb-3">積載計画プレビュー（曜日別）</div>

          {factoryPlans.length === 0 ? (
            <div className="card p-4 text-center" style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
              出荷計画がありません。配送計画入力から数量を設定してください。
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* スケジュール未設定分 */}
              {plansByDay[-1] && plansByDay[-1].length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                      スケジュール未設定（週計）
                    </span>
                  </div>
                  <LoadingPlanTable plans={plansByDay[-1]} warehouses={warehouses} products={products} />
                </div>
              )}

              {/* 曜日別 */}
              {DAY_LABELS.map((dayLabel, dayIdx) => {
                const plans = plansByDay[dayIdx];
                if (!plans || plans.length === 0) return null;
                const dateStr = formatMD(weekDates[dayIdx]);
                const totalTrucks = plans.reduce((s, p) => s + p.trucks.length, 0);
                const totalPallets = plans.reduce((s, p) => s + p.totalPallets, 0);
                const totalQty = plans.reduce((s, p) => s + p.totalQty, 0);
                return (
                  <div key={dayIdx}>
                    {/* 曜日ヘッダー */}
                    <div className="flex items-center gap-3 mb-2">
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 10,
                        background: dayIdx === 5 ? '#eff6ff' : dayIdx === 6 ? '#fef2f2' : '#eff6ff',
                        color: dayIdx === 5 ? '#2563eb' : dayIdx === 6 ? '#dc2626' : '#2563eb',
                        border: `1px solid ${dayIdx === 5 ? '#bfdbfe' : dayIdx === 6 ? '#fecaca' : '#bfdbfe'}`,
                      }}>
                        {dayLabel}曜日（{dateStr}）
                      </span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{plans.length}拠点</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                        計 {totalTrucks}台 / {totalPallets}パレット / {totalQty.toLocaleString()}個
                      </span>
                    </div>
                    <LoadingPlanTable plans={plans} warehouses={warehouses} products={products} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── 積載計画テーブル（製品内訳付き） ────────────────────────────────

function LoadingPlanTable({
  plans,
  warehouses,
  products,
}: {
  plans: DayWarehousePlan[];
  warehouses: Warehouse[];
  products: Product[];
}) {
  const whMap = Object.fromEntries(warehouses.map((w) => [w.code, w]));
  const prodMap = Object.fromEntries(products.map((p) => [p.code, p]));

  return (
    <div className="card overflow-hidden">
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', minWidth: 160 }}>拠点</th>
            <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>製品内訳（パレット / 数量）</th>
            <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 600, color: '#6b7280', minWidth: 56 }}>台数</th>
            <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 600, color: '#6b7280', minWidth: 72 }}>パレット</th>
            <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 600, color: '#6b7280', minWidth: 80 }}>出荷個数</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan, ri) => {
            const wh = whMap[plan.warehouseCode];

            // トラックごとの製品集計
            const perTruck = plan.trucks.map((truck) => ({
              truckIndex: truck.truckIndex,
              totalPallets: truck.totalPallets,
              maxPallets: truck.maxPallets,
              items: truck.items,
            }));

            // 製品別合計
            const productSummary: Record<string, { pallets: number; qty: number }> = {};
            for (const truck of plan.trucks) {
              for (const item of truck.items) {
                if (!productSummary[item.productCode]) {
                  productSummary[item.productCode] = { pallets: 0, qty: 0 };
                }
                productSummary[item.productCode].pallets += item.pallets;
                productSummary[item.productCode].qty += item.qty;
              }
            }

            return (
              <tr key={plan.warehouseCode} style={{ borderBottom: '1px solid #f3f4f6', background: ri % 2 === 0 ? 'white' : '#fafafa' }}>
                {/* 拠点名 */}
                <td style={{ padding: '10px 16px' }}>
                  <div className="flex items-center gap-2">
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                      background: wh?.group === '東' ? '#dbeafe' : '#fee2e2',
                      color: wh?.group === '東' ? '#1e40af' : '#b91c1c',
                      border: `1px solid ${wh?.group === '東' ? '#bfdbfe' : '#fecaca'}`,
                    }}>{wh?.group ?? '?'}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: '#374151' }}>{wh?.name ?? plan.warehouseCode}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{plan.warehouseCode}</div>
                    </div>
                  </div>
                </td>

                {/* 製品内訳 */}
                <td style={{ padding: '10px 16px' }}>
                  {/* 製品タグ（全体集計） */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: perTruck.length > 1 ? 6 : 0 }}>
                    {Object.entries(productSummary).map(([code, s]) => {
                      const prod = prodMap[code];
                      const color = prod?.color ?? '#6b7280';
                      return (
                        <span key={code} style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 4,
                          background: `${color}18`,
                          border: `1px solid ${color}55`,
                          color: '#1f2937',
                          fontWeight: 500,
                        }}>
                          <span style={{ fontWeight: 700, color }}>{prod?.name ?? code}</span>
                          {' '}— {s.pallets}P / {s.qty.toLocaleString()}個
                        </span>
                      );
                    })}
                  </div>

                  {/* トラック別内訳（2台以上の場合のみ表示） */}
                  {perTruck.length > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {perTruck.map((truck) => (
                        <div key={truck.truckIndex} style={{
                          fontSize: 10, padding: '3px 8px', borderRadius: 4,
                          border: '1px solid #e5e7eb', background: '#f9fafb',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <span style={{ fontWeight: 700, color: '#374151' }}>{truck.truckIndex}号車</span>
                          <span style={{ color: '#6b7280' }}>
                            {truck.totalPallets}/{truck.maxPallets}P
                          </span>
                          <span style={{ color: '#9ca3af' }}>|</span>
                          {truck.items.map((item, ii) => {
                            const prod = prodMap[item.productCode];
                            return (
                              <span key={ii} style={{ color: prod?.color ?? '#6b7280', fontWeight: 500 }}>
                                {prod?.name ?? item.productCode}:{item.pallets}P
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </td>

                {/* 台数 */}
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#2563eb' }}>
                  {plan.trucks.length}台
                </td>

                {/* パレット */}
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#374151' }}>
                  {plan.totalPallets}枚
                </td>

                {/* 出荷個数 */}
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>
                  {plan.totalQty.toLocaleString()}個
                </td>
              </tr>
            );
          })}

          {/* 合計行 */}
          <tr style={{ background: '#f0f9ff', fontWeight: 700, borderTop: '2px solid #bfdbfe' }}>
            <td style={{ padding: '10px 16px', fontSize: 11, color: '#1d4ed8' }}>合計 {plans.length}拠点</td>
            <td style={{ padding: '10px 16px' }} />
            <td style={{ padding: '10px 16px', textAlign: 'right', color: '#2563eb' }}>
              {plans.reduce((s, p) => s + p.trucks.length, 0)}台
            </td>
            <td style={{ padding: '10px 16px', textAlign: 'right', color: '#374151' }}>
              {plans.reduce((s, p) => s + p.totalPallets, 0)}枚
            </td>
            <td style={{ padding: '10px 16px', textAlign: 'right', color: '#2563eb' }}>
              {plans.reduce((s, p) => s + p.totalQty, 0).toLocaleString()}個
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

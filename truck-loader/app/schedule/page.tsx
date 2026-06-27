'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcWeeklyPlans } from '@/lib/calculations';
import { useCalcSettings } from '@/lib/useCalcSettings';
import type { DayWarehousePlan } from '@/lib/types';

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
    factories, products, warehouses, truckTypes, palletTypes,
    productionPlan, baselineStock, locationStock,
    weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual, setShippingDay,
  } = useAppStore();
  const calcSettings = useCalcSettings();

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
      const hasBaseline = factoryProducts.some((p) => allCodes.some((w) => (baselineStock[p.code]?.[w.code] ?? 0) > 0));
      if (hasBaseline) { seen.add(wh.name); return true; }
      return false;
    });
  }, [factoryProducts, warehouses, baselineStock]);

  const weeklyPlans = useMemo(
    () =>
      calcWeeklyPlans(
        warehouses, products, truckTypes, factories,
        productionPlan, baselineStock, locationStock,
        weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual, palletTypes, calcSettings,
      ),
    [warehouses, products, truckTypes, factories, productionPlan, baselineStock, locationStock, weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual, palletTypes, calcSettings],
  );

  const factoryPlans = weeklyPlans[selectedFactory] ?? [];

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
                      基準在庫数が設定された拠点がありません
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
                                        <span style={{ fontSize: 9, color: '#374151', fontWeight: 600 }}>
                                          {cellPlan.totalQty.toLocaleString()}個
                                        </span>
                                        <span style={{ fontSize: 9, color: '#6b7280' }}>
                                          {cellPlan.totalPallets}P
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

        </>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcWeeklyPlans } from '@/lib/calculations';
import type { DayWarehousePlan } from '@/lib/types';
import clsx from 'clsx';

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

// ─── 週計算ユーティリティ ──────────────────────────────────────────────

/** 指定日を含む週の月曜を返す */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** ISO週番号 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** "M/D" フォーマット */
function formatMD(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** "YYYY年第W週（M/D〜M/D）" フォーマット */
function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const week = getISOWeek(monday);
  return `${monday.getFullYear()}年 第${week}週（${formatMD(monday)}〜${formatMD(sunday)}）`;
}

export default function SchedulePage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock, locationStock,
    weeklyShippingSchedule, setShippingDay,
  } = useAppStore();

  const [selectedFactory, setSelectedFactory] = useState<string>(factories[0]?.code ?? '');
  // 計画週（月曜日）
  const [planMonday, setPlanMonday] = useState<Date>(() => getMondayOf(new Date()));

  const factory = factories.find((f) => f.code === selectedFactory);

  const factoryProducts = products.filter(
    (p) => (p.factoryCode ?? 'F001') === selectedFactory,
  );

  const relevantWarehouses = useMemo(() => {
    if (factoryProducts.length === 0) return [];
    return warehouses.filter((wh) =>
      factoryProducts.some((p) => (distributionRatios[p.code]?.[wh.code] ?? 0) > 0),
    );
  }, [factoryProducts, warehouses, distributionRatios]);

  const weeklyPlans = useMemo(
    () =>
      calcWeeklyPlans(
        warehouses, products, truckTypes, factories,
        productionPlan, distributionRatios, inventoryStock, locationStock,
        weeklyShippingSchedule,
      ),
    [warehouses, products, truckTypes, factories, productionPlan, distributionRatios, inventoryStock, locationStock, weeklyShippingSchedule],
  );

  const factoryPlans = weeklyPlans[selectedFactory] ?? [];

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

  const getDayActive = (warehouseCode: string, dayIdx: number): boolean =>
    weeklyShippingSchedule[selectedFactory]?.[warehouseCode]?.[dayIdx] ?? false;

  // 各曜日の実際の日付
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(planMonday);
    d.setDate(planMonday.getDate() + i);
    return d;
  });

  const prevWeek = () => {
    const d = new Date(planMonday);
    d.setDate(d.getDate() - 7);
    setPlanMonday(d);
  };
  const nextWeek = () => {
    const d = new Date(planMonday);
    d.setDate(d.getDate() + 7);
    setPlanMonday(d);
  };
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
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              出荷スケジュールを設定する計画週
            </div>
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
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 700, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>{factory.code}</span>
            <span className="text-sm font-semibold text-slate-700">{factory.name}</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              — 製品 {factoryProducts.length}種 / 対象拠点 {relevantWarehouses.length}拠点
            </span>
          </div>

          {/* ── スケジュール設定グリッド ── */}
          <div className="card overflow-x-auto mb-6">
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', position: 'sticky', left: 0, background: '#f9fafb', zIndex: 10, minWidth: 180, borderRight: '1px solid #f3f4f6' }}>
                    拠点
                  </th>
                  {weekDates.map((date, i) => (
                    <th key={i} style={{
                      padding: '8px 10px', textAlign: 'center', minWidth: 68,
                      color: i === 5 ? '#2563eb' : i === 6 ? '#dc2626' : '#6b7280',
                      fontWeight: 600,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{DAY_LABELS[i]}</div>
                      <div style={{ fontSize: 10, fontWeight: 400, color: i === 5 ? '#93c5fd' : i === 6 ? '#fca5a5' : '#9ca3af' }}>
                        {formatMD(date)}
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#9ca3af', minWidth: 60 }}>
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
                    const activeDayCount = DAY_LABELS.filter((_, i) => getDayActive(wh.code, i)).length;
                    return (
                      <tr key={wh.code} style={{ borderBottom: '1px solid #f3f4f6', background: ri % 2 === 0 ? 'white' : '#fafafa' }}>
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
                        {DAY_LABELS.map((_, dayIdx) => {
                          const active = getDayActive(wh.code, dayIdx);
                          return (
                            <td key={dayIdx} style={{ padding: '6px 6px', textAlign: 'center' }}>
                              <button
                                onClick={() => handleToggle(wh.code, dayIdx)}
                                style={{
                                  width: 34, height: 34, borderRadius: 6, fontSize: 13, fontWeight: 700,
                                  border: active ? '2px solid #2563eb' : '2px solid #e5e7eb',
                                  background: active ? '#2563eb' : 'white',
                                  color: active ? 'white' : '#d1d5db',
                                  cursor: 'pointer', transition: 'all 0.15s',
                                }}
                                title={`${wh.name} — ${DAY_LABELS[dayIdx]}曜日（${formatMD(weekDates[dayIdx])}）`}
                              >
                                {active ? '✓' : ''}
                              </button>
                            </td>
                          );
                        })}
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
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

          {/* ── 出荷数量プレビュー ── */}
          <section>
            <div className="section-title mb-3">出荷数量プレビュー（曜日別）</div>

            {factoryPlans.length === 0 ? (
              <div className="card p-4 text-center" style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
                出荷計画がありません。配送計画入力から数量を設定してください。
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {plansByDay[-1] && plansByDay[-1].length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                        スケジュール未設定（週計）
                      </span>
                    </div>
                    <PreviewTable plans={plansByDay[-1]} />
                  </div>
                )}
                {DAY_LABELS.map((dayLabel, dayIdx) => {
                  const plans = plansByDay[dayIdx];
                  if (!plans || plans.length === 0) return null;
                  const dateStr = formatMD(weekDates[dayIdx]);
                  return (
                    <div key={dayIdx}>
                      <div className="flex items-center gap-2 mb-2">
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10,
                          background: dayIdx === 5 ? '#eff6ff' : dayIdx === 6 ? '#fef2f2' : '#eff6ff',
                          color: dayIdx === 5 ? '#2563eb' : dayIdx === 6 ? '#dc2626' : '#2563eb',
                          border: `1px solid ${dayIdx === 5 ? '#bfdbfe' : dayIdx === 6 ? '#fecaca' : '#bfdbfe'}`,
                        }}>
                          {dayLabel}曜日（{dateStr}）
                        </span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{plans.length}拠点</span>
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
    <div className="card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th>拠点コード</th>
            <th className="text-right">台数</th>
            <th className="text-right">パレット</th>
            <th className="text-right">出荷個数</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => (
            <tr key={plan.warehouseCode}>
              <td style={{ fontFamily: 'monospace', color: '#6b7280' }}>{plan.warehouseCode}</td>
              <td className="text-right">{plan.trucks.length}台</td>
              <td className="text-right">{plan.totalPallets}枚</td>
              <td className="text-right font-medium">{plan.totalQty.toLocaleString()}個</td>
            </tr>
          ))}
          <tr style={{ background: '#f9fafb', fontWeight: 700, borderTop: '2px solid #e5e7eb' }}>
            <td style={{ fontSize: 11, color: '#6b7280' }}>小計</td>
            <td className="text-right" style={{ color: '#2563eb' }}>{plans.reduce((s, p) => s + p.trucks.length, 0)}台</td>
            <td className="text-right" style={{ color: '#374151' }}>{plans.reduce((s, p) => s + p.totalPallets, 0)}枚</td>
            <td className="text-right" style={{ color: '#2563eb' }}>{plans.reduce((s, p) => s + p.totalQty, 0).toLocaleString()}個</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

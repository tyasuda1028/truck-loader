'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcWeeklyPlans } from '@/lib/calculations';
import { useCalcSettings } from '@/lib/useCalcSettings';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { WeeklyFlowGuide } from '@/components/WeeklyFlowGuide';
import type { DayWarehousePlan } from '@/lib/types';
import clsx from 'clsx';

export default function DashboardPage() {
  const {
    factories, products, warehouses, truckTypes, palletTypes,
    productionPlan, baselineStock, locationStock,
    inTransitStock, plannedSales, weeklyShippingSchedule, sendQtyManual,
  } = useAppStore();

  const [activeFactoryTab, setActiveFactoryTab] = useState<string>('');

  // 出荷スケジュールを反映した週間計画（手動上書き・パレット型も考慮）
  const calcSettings = useCalcSettings();
  const weeklyPlans = useMemo(
    () => calcWeeklyPlans(
      warehouses, products, truckTypes, factories,
      productionPlan, baselineStock, locationStock,
      weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual, palletTypes, calcSettings,
    ),
    [warehouses, products, truckTypes, factories, productionPlan, baselineStock,
     locationStock, weeklyShippingSchedule, inTransitStock, plannedSales,
     sendQtyManual, palletTypes, calcSettings],
  );

  const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];

  const truckMap     = Object.fromEntries(truckTypes.map((t) => [t.code, t]));
  const warehouseMap = Object.fromEntries(warehouses.map((w) => [w.code, w]));

  // ── 全スケジュール済みプランをフラット化 ────────────────────────────────
  const allScheduledPlans: DayWarehousePlan[] = useMemo(
    () => Object.values(weeklyPlans).flat().filter((p) => p.trucks.length > 0),
    [weeklyPlans],
  );

  // ── KPI集計（週間合計） ───────────────────────────────────────────────
  const totalTrucks   = allScheduledPlans.reduce((s, p) => s + p.trucks.length, 0);
  const totalPallets  = allScheduledPlans.reduce((s, p) => s + p.totalPallets, 0);
  const totalQty      = allScheduledPlans.reduce((s, p) => s + p.totalQty, 0);
  const activeWhNames = new Set(allScheduledPlans.map((p) => warehouseMap[p.warehouseCode]?.name ?? p.warehouseCode));
  const totalProductQty = Object.values(productionPlan).reduce((s, v) => s + v, 0);

  // ── 拠点別 週間合計（重複名をマージ） ────────────────────────────────
  // warehouseName → 週間集計
  const whWeeklyMap = useMemo(() => {
    const map: Record<string, { name: string; code: string; totalTrucks: number; totalPallets: number; totalQty: number; totalCap: number; days: number }> = {};
    for (const p of allScheduledPlans) {
      const wh = warehouseMap[p.warehouseCode];
      const name = wh?.name ?? p.warehouseCode;
      if (!map[name]) {
        map[name] = { name, code: p.warehouseCode, totalTrucks: 0, totalPallets: 0, totalQty: 0, totalCap: 0, days: 0 };
      }
      map[name].totalTrucks  += p.trucks.length;
      map[name].totalPallets += p.totalPallets;
      map[name].totalQty     += p.totalQty;
      // 各トラックの有効容量を合算（混在車種に対応）
      map[name].totalCap     += p.trucks.reduce((s, t) => s + (t.maxPallets || 0), 0);
      map[name].days         += 1;
    }
    return map;
  }, [allScheduledPlans, warehouseMap]);

  // 表示用拠点リスト（重複排除・計画なし拠点も含む）
  const displayWarehouses = useMemo(() => {
    const seen = new Set<string>();
    return warehouses.filter((wh) => {
      if (seen.has(wh.name)) return false;
      seen.add(wh.name);
      return true;
    });
  }, [warehouses]);

  // テーブルセルスタイル定数（軽いグリッド線で密な表でも見やすく）
  const thStyle: React.CSSProperties = {
    border: '1px solid #e2e8f0', padding: '7px 10px', fontWeight: 700,
    color: '#475569', whiteSpace: 'nowrap' as const, fontSize: 11,
  };
  const tdStyle: React.CSSProperties = {
    border: '1px solid #eef2f6', padding: '6px 8px', color: '#334155', fontSize: 11,
  };

  // 工場タブ：製品のある工場のみ
  const factoriesWithProducts = factories.filter((f) =>
    products.some((p) => (p.factoryCode ?? 'F001') === f.code),
  );
  const currentFactoryTab = activeFactoryTab || factoriesWithProducts[0]?.code || '';

  return (
    <div className="sys-page">

      {/* ── ページタイトル ── */}
      <div className="sys-page-title">
        ダッシュボード
        <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af' }}>今週の出荷計画サマリー</span>
      </div>

      {/* ── オンボーディング（サンプルで始める／セットアップ進捗） ── */}
      <OnboardingChecklist />

      {/* ── 今週の作業の流れ（セットアップ完了後に表示） ── */}
      <WeeklyFlowGuide plannedTrucks={totalTrucks} />

      {/* ── スケジュール未設定の警告 ── */}
      {totalTrucks === 0 && totalProductQty > 0 && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800 flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <span>
            生産計画はありますが、出荷スケジュールが設定されていません。
            <Link href="/loading-plan" className="ml-1 font-semibold underline hover:text-amber-900">
              スケジュール・積載計画 →
            </Link>
            で出荷曜日を設定してください。
          </span>
        </div>
      )}

      {/* ── 1. KPIカード（週間合計） ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: '使用台数（週計）',    value: totalTrucks,               unit: '台',   accent: '#2563eb', bg: '#eff6ff', icon: '🚚' },
          { label: '総パレット数（週計）', value: totalPallets,              unit: '枚',   accent: '#059669', bg: '#ecfdf5', icon: '📦' },
          { label: '総出荷個数（週計）',  value: totalQty.toLocaleString(),  unit: '個',   accent: '#d97706', bg: '#fffbeb', icon: '🧾' },
          { label: '出荷拠点数',          value: activeWhNames.size,         unit: '拠点', accent: '#7c3aed', bg: '#f5f3ff', icon: '🏢' },
        ].map(({ label, value, unit, accent, bg, icon }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm" style={{ background: bg }}>
                {icon}
              </span>
              <span className="text-[11px] font-medium leading-tight text-slate-500">{label}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-2xl font-extrabold leading-none tabular-nums" style={{ color: accent }}>{value}</span>
              <span className="text-[11px] text-slate-400">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 2. 拠点別 積載計画（カードグリッド）── */}
      <section className="mb-6">
        <div className="sys-panel">
          <div className="sys-section-header justify-between">
            <span>拠点別 積載計画（週間合計）</span>
            <Link href="/loading-plan" className="font-normal text-blue-500 hover:underline" style={{ fontSize: 11 }}>
              詳細を見る →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {displayWarehouses.map((wh) => {
              const weekly  = whWeeklyMap[wh.name];
              const hasPlan = !!weekly;
              // 週間積載率 = 週間パレット / 週間トラック有効容量合計（混在車種対応）
              const fr = hasPlan && weekly.totalCap > 0
                ? Math.round(weekly.totalPallets / weekly.totalCap * 100)
                : 0;
              const frColor = fr >= 90 ? '#16a34a' : fr >= 60 ? '#d97706' : '#dc2626';
              const frBg    = fr >= 90 ? '#dcfce7' : fr >= 60 ? '#fef9c3' : '#fee2e2';

              return (
                <Link
                  key={wh.name}
                  href="/loading-plan"
                  className={clsx(
                    'group block rounded-xl border border-slate-200 bg-white p-4 transition-all',
                    hasPlan ? 'hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md' : 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-slate-400">{wh.code}</div>
                      <div className="truncate text-sm font-bold text-slate-800">{wh.name}</div>
                    </div>
                    {hasPlan && (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: frBg, color: frColor }}>
                        積載 {fr}%
                      </span>
                    )}
                  </div>

                  {hasPlan ? (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          { label: '台数', v: weekly.totalTrucks, u: '台' },
                          { label: 'パレット', v: weekly.totalPallets, u: '枚' },
                          { label: '出荷', v: weekly.totalQty.toLocaleString(), u: '個' },
                        ].map((s) => (
                          <div key={s.label} className="rounded-lg bg-slate-50 py-1.5 text-center">
                            <div className="text-sm font-bold text-slate-800">
                              {s.v}<span className="ml-0.5 text-[10px] font-normal text-slate-400">{s.u}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${fr}%`, background: frColor }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{weekly.days}日出荷 ・ 1日 {Math.round(weekly.totalPallets / weekly.days)}枚 / {Math.round(weekly.totalTrucks / weekly.days * 10) / 10}台</span>
                        <span className="font-semibold text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">詳細 →</span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 text-xs italic text-slate-400">
                      {totalProductQty > 0 ? 'スケジュール未設定' : '今週の出荷なし'}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 3. 工場→拠点 出荷フロー（曜日×拠点テーブル）── */}
      <section className="mb-6">
        <div className="sys-panel">
          <div className="sys-section-header justify-between">
            <span>工場 → 拠点 出荷フロー（曜日別）</span>
            <Link href="/loading-plan" className="font-normal text-blue-500 hover:underline" style={{ fontSize: 11 }}>
              スケジュール・積載計画を見る →
            </Link>
          </div>

          <div className="flex flex-col gap-0 p-3 gap-3">
            {factories.map((factory) => {
              const factoryPlans: DayWarehousePlan[] = weeklyPlans[factory.code] ?? [];
              if (factoryPlans.length === 0) return null;

              const whCodesWithPlan = [...new Set(
                factoryPlans.filter((p) => p.trucks.length > 0).map((p) => p.warehouseCode),
              )];
              const activeWarehouses = warehouses.filter((wh) => whCodesWithPlan.includes(wh.code));
              if (activeWarehouses.length === 0) return null;

              const daySet = new Set(factoryPlans.filter((p) => p.trucks.length > 0).map((p) => p.dayOfWeek));
              const activeDays = [...daySet].filter((d) => d >= 0).sort((a, b) => a - b);
              const hasUnscheduled = daySet.has(-1);
              const allDays = [...activeDays, ...(hasUnscheduled ? [-1] : [])];

              const planMap: Record<string, Record<number, DayWarehousePlan>> = {};
              for (const plan of factoryPlans) {
                if (plan.trucks.length === 0) continue;
                if (!planMap[plan.warehouseCode]) planMap[plan.warehouseCode] = {};
                planMap[plan.warehouseCode][plan.dayOfWeek] = plan;
              }

              return (
                <div key={factory.code} className="overflow-hidden rounded-xl border border-slate-200">
                  {/* 工場ヘッダ */}
                  <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                      {factory.code}
                    </span>
                    <span className="text-[13px] font-bold text-slate-800">{factory.name}</span>
                    <span className="ml-1 text-[10px] text-slate-400">
                      出荷拠点 {activeWarehouses.length} ・ 出荷日 {allDays.filter((d) => d >= 0).length}日
                    </span>
                  </div>

                  {/* 曜日×拠点テーブル */}
                  <div className="overflow-x-auto" style={{ background: 'white' }}>
                    <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ ...thStyle, textAlign: 'left', minWidth: 140, position: 'sticky', left: 0, zIndex: 10, background: '#f1f5f9' }}>
                            拠点
                          </th>
                          {allDays.map((day) => (
                            <th key={day} style={{ ...thStyle, minWidth: 180, textAlign: 'center' }}>
                              {day === -1 ? '週間' : `${DAY_NAMES[day]}曜日`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeWarehouses.map((wh, ri) => (
                          <tr key={wh.code} style={{ background: ri % 2 === 0 ? 'white' : '#f7f9fc' }}>
                            {/* 拠点名 (sticky) */}
                            <td style={{ ...tdStyle, position: 'sticky', left: 0, zIndex: 10,
                              background: ri % 2 === 0 ? 'white' : '#f7f9fc', verticalAlign: 'middle', minWidth: 140 }}>
                              <div className="font-semibold" style={{ color: '#1e3a5f', fontSize: 12 }}>{wh.name}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>{wh.code}</span>
                              </div>
                            </td>
                            {/* 曜日ごとのセル */}
                            {allDays.map((day) => {
                              const plan = planMap[wh.code]?.[day];
                              return (
                                <td key={day} style={{ ...tdStyle, verticalAlign: 'top', padding: '6px' }}>
                                  {!plan ? (
                                    <span style={{ display: 'block', textAlign: 'center', color: '#cbd5e1' }}>—</span>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>
                                        🚛 {plan.trucks.length}台
                                      </div>
                                      {plan.trucks.map((truck) => {
                                        const ratio = truck.maxPallets ? truck.totalPallets / truck.maxPallets : 0;
                                        const accent = ratio >= 1 ? '#16a34a' : ratio >= 0.6 ? '#d97706' : '#dc2626';
                                        const badgeBg = ratio >= 1 ? '#dcfce7' : ratio >= 0.6 ? '#fef9c3' : '#fee2e2';
                                        return (
                                        <div key={truck.truckIndex}
                                          className="rounded-md border border-slate-200 bg-white p-1.5"
                                          style={{ borderLeft: `3px solid ${accent}` }}>
                                          <div className="mb-1 flex items-center justify-between gap-1">
                                            <span style={{ fontWeight: 700, fontSize: 11, color: '#1e3a5f' }}>
                                              {truck.truckIndex}号車
                                              <span style={{ marginLeft: 4, fontWeight: 600, fontSize: 9, color: '#94a3b8' }}>
                                                {truckMap[truck.truckTypeCode]?.name ?? ''}
                                              </span>
                                            </span>
                                            <span className="rounded px-1.5 py-px"
                                              style={{ fontSize: 10, fontWeight: 700, background: badgeBg, color: accent }}>
                                              {truck.totalPallets}/{truck.maxPallets}枚
                                            </span>
                                          </div>
                                          {truck.items.map((item) => {
                                            const prod = products.find((p) => p.code === item.productCode);
                                            return (
                                              <div key={item.productCode}
                                                className="flex items-center gap-1.5"
                                                style={{ fontSize: 10, color: '#475569', lineHeight: '18px' }}>
                                                <span style={{
                                                  width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                                                  background: prod?.color ?? '#ccc', border: '1px solid rgba(0,0,0,0.12)',
                                                }} />
                                                <span style={{ fontWeight: 600, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                  {prod?.name ?? item.productCode}
                                                </span>
                                                <span style={{ marginLeft: 'auto', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                  {item.qty.toLocaleString()}個&nbsp;/&nbsp;{item.pallets}枚
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        );
                                      })}
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
            {allScheduledPlans.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-sm italic">
                出荷スケジュールが設定されていません。
                <Link href="/loading-plan" className="ml-1 text-blue-500 underline">スケジュール・積載計画</Link>で設定してください。
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 4. 今週の生産計画（工場別タブ）── */}
      <section className="mb-6">
        <div className="sys-panel">
          <div className="sys-section-header justify-between">
            <span>今週の生産計画</span>
            <Link href="/production" className="font-normal text-blue-500 hover:underline" style={{ fontSize: 11 }}>
              編集 →
            </Link>
          </div>

          {/* 工場タブ */}
          {factoriesWithProducts.length > 1 && (
            <div className="flex" style={{ borderBottom: '1px solid #c8d4df', background: '#edf2f7' }}>
              {factoriesWithProducts.map((f) => {
                const fQty = products
                  .filter((p) => (p.factoryCode ?? 'F001') === f.code)
                  .reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0);
                return (
                  <button key={f.code} onClick={() => setActiveFactoryTab(f.code)}
                    className="flex items-center gap-2 px-5 transition-colors"
                    style={{
                      height: 34, fontSize: 12, fontWeight: 600,
                      borderBottom: currentFactoryTab === f.code ? '2px solid #1a3a5c' : '2px solid transparent',
                      color: currentFactoryTab === f.code ? '#1a3a5c' : '#64748b',
                      background: currentFactoryTab === f.code ? 'white' : 'transparent', marginBottom: -1,
                    }}
                  >
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 700, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                      {f.code}
                    </span>
                    {f.name}
                    {fQty > 0 && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{fQty.toLocaleString()}個</span>}
                  </button>
                );
              })}
              <button onClick={() => setActiveFactoryTab('__all__')} className="ml-auto px-5 transition-colors"
                style={{
                  height: 34, fontSize: 12, fontWeight: 600,
                  borderBottom: currentFactoryTab === '__all__' ? '2px solid #1a3a5c' : '2px solid transparent',
                  color: currentFactoryTab === '__all__' ? '#1a3a5c' : '#94a3b8',
                  background: currentFactoryTab === '__all__' ? 'white' : 'transparent', marginBottom: -1,
                }}
              >
                全工場合計
              </button>
            </div>
          )}

          {/* タブコンテンツ */}
          {(() => {
            const showAll = currentFactoryTab === '__all__' || factoriesWithProducts.length <= 1;
            const targetFactories = showAll ? factoriesWithProducts : factoriesWithProducts.filter((f) => f.code === currentFactoryTab);

            return (
              <table className="sys-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>製品コード</th>
                    <th style={{ textAlign: 'left' }}>製品名</th>
                    <th style={{ textAlign: 'right' }}>週間生産数</th>
                    <th style={{ textAlign: 'right' }}>換算パレット</th>
                  </tr>
                </thead>
                <tbody>
                  {targetFactories.map((factory) => {
                    const factoryProducts = products.filter((p) => (p.factoryCode ?? 'F001') === factory.code);
                    const factoryQty  = factoryProducts.reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0);
                    const factoryPals = factoryProducts.reduce((s, p) => {
                      const qty = productionPlan[p.code] ?? 0;
                      return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                    }, 0);

                    return (
                      <>
                        {showAll && factoriesWithProducts.length > 1 && (
                          <tr key={`fhdr-${factory.code}`} style={{ background: '#e8eef5' }}>
                            <td colSpan={4} style={{ padding: '6px 12px', border: '1px solid #e2e8f0' }}>
                              <div className="flex items-center gap-2">
                                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 700, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>{factory.code}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#1e3a5f' }}>{factory.name}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {factoryProducts.map((p) => {
                          const qty  = productionPlan[p.code] ?? 0;
                          const pals = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                          return (
                            <tr key={p.code}>
                              <td>
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{p.code}</span>
                                </div>
                              </td>
                              <td style={{ fontWeight: 600, color: '#1e3a5f' }}>{p.name}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                {qty > 0 ? <span style={{ color: '#1e3a5f' }}>{qty.toLocaleString()}個</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                              </td>
                              <td style={{ textAlign: 'right', color: '#475569' }}>
                                {pals > 0 ? `${pals}枚` : <span style={{ color: '#cbd5e1' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                        {(showAll && factoriesWithProducts.length > 1) && (
                          <tr key={`sub-${factory.code}`} style={{ background: '#eef4fb' }}>
                            <td colSpan={2} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#1e40af', border: '1px solid #e2e8f0' }}>{factory.name} 小計</td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#1e40af', border: '1px solid #e2e8f0' }}>{factoryQty.toLocaleString()}個</td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#1e40af', border: '1px solid #e2e8f0' }}>{factoryPals}枚</td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  <tr style={{ background: '#e8eef5', fontWeight: 700 }}>
                    <td colSpan={2} style={{ padding: '7px 12px', fontSize: 12, color: '#1e3a5f', border: '1px solid #cbd5e1' }}>
                      {showAll && factoriesWithProducts.length > 1 ? '総合計' : (() => {
                        const f = factoriesWithProducts.find((f) => f.code === currentFactoryTab);
                        return f ? `${f.name} 合計` : '合計';
                      })()}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#1a3a5c', border: '1px solid #cbd5e1' }}>
                      {(showAll
                        ? totalProductQty
                        : products.filter((p) => (p.factoryCode ?? 'F001') === currentFactoryTab).reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0)
                      ).toLocaleString()}個
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#475569', border: '1px solid #cbd5e1' }}>
                      {(showAll
                        ? products.reduce((s, p) => { const qty = productionPlan[p.code] ?? 0; return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0); }, 0)
                        : products.filter((p) => (p.factoryCode ?? 'F001') === currentFactoryTab).reduce((s, p) => { const qty = productionPlan[p.code] ?? 0; return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0); }, 0)
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

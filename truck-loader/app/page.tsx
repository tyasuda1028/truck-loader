'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcWeeklyPlans } from '@/lib/calculations';
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
  const weeklyPlans = useMemo(
    () => calcWeeklyPlans(
      warehouses, products, truckTypes, factories,
      productionPlan, baselineStock, locationStock,
      weeklyShippingSchedule, inTransitStock, plannedSales, sendQtyManual, palletTypes,
    ),
    [warehouses, products, truckTypes, factories, productionPlan, baselineStock,
     locationStock, weeklyShippingSchedule, inTransitStock, plannedSales,
     sendQtyManual, palletTypes],
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
    const map: Record<string, { name: string; code: string; totalTrucks: number; totalPallets: number; totalQty: number; maxPallets: number; days: number }> = {};
    for (const p of allScheduledPlans) {
      const wh = warehouseMap[p.warehouseCode];
      const name = wh?.name ?? p.warehouseCode;
      if (!map[name]) {
        const tt = wh ? truckMap[wh.truckType] : undefined;
        map[name] = { name, code: p.warehouseCode, totalTrucks: 0, totalPallets: 0, totalQty: 0, maxPallets: tt?.maxPallets ?? 0, days: 0 };
      }
      map[name].totalTrucks  += p.trucks.length;
      map[name].totalPallets += p.totalPallets;
      map[name].totalQty     += p.totalQty;
      map[name].days         += 1;
    }
    return map;
  }, [allScheduledPlans, warehouseMap, truckMap]);

  // 表示用拠点リスト（重複排除・計画なし拠点も含む）
  const displayWarehouses = useMemo(() => {
    const seen = new Set<string>();
    return warehouses.filter((wh) => {
      if (seen.has(wh.name)) return false;
      seen.add(wh.name);
      return true;
    });
  }, [warehouses]);

  // テーブルセルスタイル定数
  const thStyle: React.CSSProperties = {
    border: '1px solid #c0cdd9', padding: '6px 10px', fontWeight: 700,
    color: '#2c4a68', whiteSpace: 'nowrap' as const, fontSize: 11,
  };
  const tdStyle: React.CSSProperties = {
    border: '1px solid #d4dde6', padding: '5px 8px', color: '#334155', fontSize: 11,
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

      {/* ── ワークフロー導線（このアプリの流れ） ── */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="mb-2 text-[11px] font-semibold text-slate-400">
          在庫基準と増減から「どの拠点へ・どのトラックで・どう積むか」をAIが提案します
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { n: '①', label: 'マスタ設定', href: '/settings', desc: '製品・拠点・トラック' },
            { n: '②', label: '基準在庫・在庫', href: '/production', desc: '目標在庫と増減' },
            { n: '③', label: '生産数入力', href: '/production', desc: '週間生産数' },
            { n: '④', label: 'AI提案・積載計画', href: '/loading-plan', desc: 'トラックと積み方' },
          ].map((s, i, arr) => (
            <span key={s.n} className="flex items-center gap-1.5">
              <Link
                href={s.href}
                className="group flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 hover:border-indigo-300 hover:bg-indigo-50"
              >
                <span className="font-bold text-indigo-600">{s.n}</span>
                <span className="font-semibold text-slate-700 group-hover:text-indigo-700">{s.label}</span>
                <span className="hidden text-[10px] text-slate-400 sm:inline">{s.desc}</span>
              </Link>
              {i < arr.length - 1 && <span className="text-slate-300">→</span>}
            </span>
          ))}
        </div>
      </div>

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: '使用台数（週計）',    value: totalTrucks,               unit: '台',   accent: '#2563eb', bg: '#eff6ff' },
          { label: '総パレット数（週計）', value: totalPallets,              unit: '枚',   accent: '#059669', bg: '#ecfdf5' },
          { label: '総出荷個数（週計）',  value: totalQty.toLocaleString(),  unit: '個',   accent: '#d97706', bg: '#fffbeb' },
          { label: '出荷拠点数',          value: activeWhNames.size,         unit: '拠点', accent: '#7c3aed', bg: '#f5f3ff' },
        ].map(({ label, value, unit, accent, bg }) => (
          <div key={label} className="card px-5 py-4 flex items-center gap-4">
            <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 44, height: 44, background: bg }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{unit}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</div>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
            {displayWarehouses.map((wh) => {
              const weekly  = whWeeklyMap[wh.name];
              const hasPlan = !!weekly;
              // 週間積載率 = 週間パレット / (週間台数 × maxPallets)
              const fr = hasPlan && weekly.maxPallets > 0 && weekly.totalTrucks > 0
                ? Math.round(weekly.totalPallets / (weekly.totalTrucks * weekly.maxPallets) * 100)
                : 0;

              return (
                <Link
                  key={wh.name}
                  href="/loading-plan"
                  className={clsx('block bg-white p-3 transition-all', !hasPlan && 'opacity-50')}
                  style={{ border: '1px solid #c8d4df', borderRadius: 3, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-mono" style={{ fontSize: 10, color: '#94a3b8' }}>{wh.code}</div>
                      <div className="font-semibold" style={{ fontSize: 13, color: '#1e3a5f' }}>{wh.name}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {hasPlan && (
                        <span style={{ fontSize: 9, color: '#94a3b8' }}>{weekly.days}日出荷</span>
                      )}
                    </div>
                  </div>

                  {hasPlan ? (
                    <>
                      <div className="flex gap-4 mb-2" style={{ fontSize: 11, color: '#64748b' }}>
                        <span><strong style={{ color: '#1e3a5f' }}>{weekly.totalTrucks}</strong> 台</span>
                        <span><strong style={{ color: '#1e3a5f' }}>{weekly.totalPallets}</strong> 枚</span>
                        <span><strong style={{ color: '#1e3a5f' }}>{weekly.totalQty.toLocaleString()}</strong> 個</span>
                      </div>
                      {/* 1日あたりの目安 */}
                      <div className="mb-2" style={{ fontSize: 10, color: '#94a3b8' }}>
                        1日あたり：
                        <span style={{ color: '#374151', fontWeight: 600 }}>
                          {Math.round(weekly.totalPallets / weekly.days)}枚 / {Math.round(weekly.totalTrucks / weekly.days * 10) / 10}台
                        </span>
                        　×{weekly.days}日
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${fr}%`,
                          background: fr >= 90 ? '#16a34a' : fr >= 60 ? '#d97706' : '#dc2626',
                        }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 2 }}>平均積載率 {fr}%</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
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
                <div key={factory.code} style={{ border: '1px solid #c8d4df', borderRadius: 3, overflow: 'hidden' }}>
                  {/* 工場ヘッダ */}
                  <div className="flex items-center gap-2 px-3 py-2"
                    style={{ background: 'linear-gradient(180deg, #2e74c0 0%, #2563a8 100%)', borderBottom: '1px solid #1a4a7a' }}>
                    <span className="font-bold px-2 py-0.5 rounded"
                      style={{ fontSize: 10, background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                      {factory.code}
                    </span>
                    <span className="font-semibold text-white" style={{ fontSize: 13 }}>{factory.name}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>
                      出荷拠点数: {activeWarehouses.length} / 曜日数: {allDays.filter((d) => d >= 0).length}
                    </span>
                  </div>

                  {/* 曜日×拠点テーブル */}
                  <div className="overflow-x-auto" style={{ background: 'white' }}>
                    <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: 'linear-gradient(180deg, #e8eef5 0%, #dde6ef 100%)' }}>
                          <th style={{ ...thStyle, textAlign: 'left', minWidth: 140, position: 'sticky', left: 0, zIndex: 10, background: '#e0e9f2' }}>
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
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <div style={{ fontSize: 10, fontWeight: 600, color: '#475569' }}>
                                        🚛 {plan.trucks.length}台
                                      </div>
                                      {plan.trucks.map((truck) => (
                                        <div key={truck.truckIndex} style={{
                                          background: '#f0f4f8', border: '1px solid #c8d4df',
                                          borderRadius: 3, padding: '5px 6px',
                                        }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <span style={{ fontWeight: 700, fontSize: 11, color: '#1e3a5f' }}>{truck.truckIndex}号車</span>
                                            <span style={{
                                              fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 2,
                                              background: truck.totalPallets >= truck.maxPallets ? '#dcfce7'
                                                : truck.totalPallets >= Math.ceil(truck.maxPallets * 0.6) ? '#fef9c3' : '#fee2e2',
                                              color: truck.totalPallets >= truck.maxPallets ? '#15803d'
                                                : truck.totalPallets >= Math.ceil(truck.maxPallets * 0.6) ? '#92400e' : '#b91c1c',
                                              border: `1px solid ${truck.totalPallets >= truck.maxPallets ? '#bbf7d0'
                                                : truck.totalPallets >= Math.ceil(truck.maxPallets * 0.6) ? '#fde68a' : '#fecaca'}`,
                                            }}>
                                              {truck.totalPallets}/{truck.maxPallets}枚
                                            </span>
                                          </div>
                                          {truck.items.map((item) => {
                                            const prod = products.find((p) => p.code === item.productCode);
                                            return (
                                              <div key={item.productCode} style={{
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                fontSize: 10, color: '#475569', lineHeight: '18px',
                                              }}>
                                                <span style={{
                                                  width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                                                  background: prod?.color ?? '#ccc', border: '1px solid rgba(0,0,0,0.12)',
                                                }} />
                                                <span style={{ fontWeight: 600, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                  {prod?.name ?? item.productCode}
                                                </span>
                                                <span style={{ marginLeft: 'auto', color: '#94a3b8', whiteSpace: 'nowrap' }}>
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
                            <td colSpan={4} style={{ padding: '6px 12px', border: '1px solid #c0cdd9' }}>
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
                            <td colSpan={2} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#1e40af', border: '1px solid #c0cdd9' }}>{factory.name} 小計</td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#1e40af', border: '1px solid #c0cdd9' }}>{factoryQty.toLocaleString()}個</td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#1e40af', border: '1px solid #c0cdd9' }}>{factoryPals}枚</td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  <tr style={{ background: '#e8eef5', fontWeight: 700 }}>
                    <td colSpan={2} style={{ padding: '7px 12px', fontSize: 12, color: '#1e3a5f', border: '1px solid #b0bec9' }}>
                      {showAll && factoriesWithProducts.length > 1 ? '総合計' : (() => {
                        const f = factoriesWithProducts.find((f) => f.code === currentFactoryTab);
                        return f ? `${f.name} 合計` : '合計';
                      })()}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#1a3a5c', border: '1px solid #b0bec9' }}>
                      {(showAll
                        ? totalProductQty
                        : products.filter((p) => (p.factoryCode ?? 'F001') === currentFactoryTab).reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0)
                      ).toLocaleString()}個
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#475569', border: '1px solid #b0bec9' }}>
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

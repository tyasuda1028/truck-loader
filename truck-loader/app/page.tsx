'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans, calcSendQty, fillRate, calcWeeklyPlans } from '@/lib/calculations';
import type { DayWarehousePlan } from '@/lib/types';
import clsx from 'clsx';

export default function DashboardPage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales,
    weeklyShippingSchedule,
  } = useAppStore();

  const [activeFactoryTab, setActiveFactoryTab] = useState<string>('');

  const plans = useMemo(
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales),
    [warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales],
  );

  const sendQty = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales),
    [products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales],
  );

  const weeklyPlans = useMemo(
    () => calcWeeklyPlans(warehouses, products, truckTypes, factories, productionPlan, distributionRatios, inventoryStock, locationStock, weeklyShippingSchedule, inTransitStock, plannedSales),
    [warehouses, products, truckTypes, factories, productionPlan, distributionRatios, inventoryStock, locationStock, weeklyShippingSchedule, inTransitStock, plannedSales],
  );

  const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];

  // テーブルセルスタイル定数
  const thStyle: React.CSSProperties = {
    border: '1px solid #c0cdd9',
    padding: '6px 10px',
    fontWeight: 700,
    color: '#2c4a68',
    whiteSpace: 'nowrap' as const,
    fontSize: 11,
  };
  const tdStyle: React.CSSProperties = {
    border: '1px solid #d4dde6',
    padding: '5px 8px',
    color: '#334155',
    fontSize: 11,
  };

  const truckMap = Object.fromEntries(truckTypes.map((t) => [t.code, t]));

  // サマリー集計
  const activePlans = Object.values(plans).filter((p) => p.trucks.length > 0);
  const totalTrucks   = activePlans.reduce((s, p) => s + p.trucks.length, 0);
  const totalPallets  = activePlans.reduce((s, p) => s + p.totalPallets, 0);
  const totalQty      = activePlans.reduce((s, p) => s + p.totalQty, 0);
  const totalProductQty = Object.values(productionPlan).reduce((s, v) => s + v, 0);

  // 工場タブ：製品のある工場のみ
  const factoriesWithProducts = factories.filter((f) =>
    products.some((p) => (p.factoryCode ?? 'F001') === f.code),
  );
  const currentFactoryTab = activeFactoryTab || factoriesWithProducts[0]?.code || '';

  return (
    <div className="sys-page">

      {/* ── ページタイトル ── */}
      <div className="sys-page-title flex items-center gap-2 mb-4">
        <span>ダッシュボード</span>
        <span className="text-xs font-normal text-slate-400 ml-2">今週の出荷計画サマリー</span>
      </div>

      {/* ── 1. KPIカード ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: '使用台数',    value: totalTrucks,               unit: '台',   color: '#1a3a5c' },
          { label: '総パレット数', value: totalPallets,              unit: '枚',   color: '#1a6645' },
          { label: '総出荷個数',  value: totalQty.toLocaleString(),  unit: '個',   color: '#7c3a0d' },
          { label: '出荷拠点数',  value: activePlans.length,         unit: '拠点', color: '#4a1c6b' },
        ].map(({ label, value, unit, color }) => (
          <div key={label}
            className="bg-white flex items-center gap-4 px-5 py-3"
            style={{ border: '1px solid #c8d4df', borderLeft: `4px solid ${color}`, borderRadius: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          >
            <div>
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
              <div className="text-xs" style={{ color: '#64748b' }}>{unit}</div>
            </div>
            <div className="text-xs font-semibold" style={{ color: '#475569' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── 2. 拠点別 積載計画（カードグリッド）── */}
      <section className="mb-5">
        <div className="sys-panel">
          <div className="sys-section-header justify-between">
            <span>拠点別 積載計画</span>
            <Link href="/loading-plan" className="font-normal text-brand-500 hover:underline" style={{ fontSize: 11 }}>
              詳細を見る →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
          {warehouses.map((wh) => {
            const plan    = plans[wh.code];
            const truck   = truckMap[wh.truckType];
            const hasPlan = plan && plan.trucks.length > 0;
            const fr      = hasPlan && truck ? fillRate(plan, truck.maxPallets) : 0;

            return (
              <Link
                key={wh.code}
                href="/loading-plan"
                className={clsx(
                  'block bg-white p-3 transition-all',
                  !hasPlan && 'opacity-50',
                )}
                style={{
                  border: '1px solid #c8d4df',
                  borderRadius: 3,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-mono" style={{ fontSize: 10, color: '#94a3b8' }}>{wh.code}</div>
                    <div className="font-semibold" style={{ fontSize: 13, color: '#1e3a5f' }}>{wh.name}</div>
                  </div>
                  <span
                    className="font-bold"
                    style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 2,
                      background: wh.group === '東' ? '#dbeafe' : '#fee2e2',
                      color: wh.group === '東' ? '#1e40af' : '#b91c1c',
                      border: `1px solid ${wh.group === '東' ? '#bfdbfe' : '#fecaca'}`,
                    }}
                  >
                    {wh.group}
                  </span>
                </div>

                {hasPlan ? (
                  <>
                    <div className="flex gap-4 mb-2" style={{ fontSize: 11, color: '#64748b' }}>
                      <span><strong style={{ color: '#1e3a5f' }}>{plan.trucks.length}</strong> 台</span>
                      <span><strong style={{ color: '#1e3a5f' }}>{plan.totalPallets}</strong> 枚</span>
                      <span><strong style={{ color: '#1e3a5f' }}>{plan.totalQty.toLocaleString()}</strong> 個</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${fr}%`,
                          background: fr >= 90 ? '#16a34a' : fr >= 60 ? '#d97706' : '#dc2626',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 2 }}>積載率 {fr}%</div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>今週の出荷なし</div>
                )}
              </Link>
            );
          })}
          </div>
        </div>
      </section>

      {/* ── 3. 工場→拠点 出荷フロー（曜日×拠点テーブル）── */}
      <section className="mb-5">
        <div className="sys-panel">
          <div className="sys-section-header justify-between">
            <span>工場 → 拠点 出荷フロー</span>
            <Link href="/inventory" className="font-normal text-brand-500 hover:underline" style={{ fontSize: 11 }}>
              在庫・積載計画を見る →
            </Link>
          </div>

          <div className="flex flex-col gap-0 p-3 gap-3">
          {factories.map((factory) => {
            const factoryPlans: DayWarehousePlan[] = weeklyPlans[factory.code] ?? [];
            if (factoryPlans.length === 0) return null;

            const whCodesWithPlan = [...new Set(
              factoryPlans.filter(p => p.trucks.length > 0).map(p => p.warehouseCode)
            )];
            const activeWarehouses = warehouses.filter(wh => whCodesWithPlan.includes(wh.code));
            if (activeWarehouses.length === 0) return null;

            const daySet = new Set(
              factoryPlans.filter(p => p.trucks.length > 0).map(p => p.dayOfWeek)
            );
            const activeDays = [...daySet].filter(d => d >= 0).sort((a, b) => a - b);
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
                  style={{ background: 'linear-gradient(180deg, #1e3f60 0%, #17324e 100%)', borderBottom: '1px solid #0c1f35' }}>
                  <span className="font-bold px-2 py-0.5 rounded"
                    style={{ fontSize: 10, background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                    {factory.code}
                  </span>
                  <span className="font-semibold text-white" style={{ fontSize: 13 }}>{factory.name}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>
                    出荷拠点数: {activeWarehouses.length} / 曜日数: {allDays.filter(d => d >= 0).length}
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
                              <span style={{
                                fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 700,
                                background: wh.group === '東' ? '#dbeafe' : '#fee2e2',
                                color: wh.group === '東' ? '#1e40af' : '#b91c1c',
                                border: `1px solid ${wh.group === '東' ? '#bfdbfe' : '#fecaca'}`,
                              }}>{wh.group}</span>
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
          </div>
        </div>
      </section>

      {/* ── 4. 今週の生産計画（工場別タブ）── */}
      <section className="mb-5">
        <div className="sys-panel">
          <div className="sys-section-header justify-between">
            <span>今週の生産計画</span>
            <Link href="/production" className="font-normal text-brand-500 hover:underline" style={{ fontSize: 11 }}>
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
                  <button
                    key={f.code}
                    onClick={() => setActiveFactoryTab(f.code)}
                    className="flex items-center gap-2 px-5 transition-colors"
                    style={{
                      height: 34, fontSize: 12, fontWeight: 600,
                      borderBottom: currentFactoryTab === f.code ? '2px solid #1a3a5c' : '2px solid transparent',
                      color: currentFactoryTab === f.code ? '#1a3a5c' : '#64748b',
                      background: currentFactoryTab === f.code ? 'white' : 'transparent',
                      marginBottom: -1,
                    }}
                  >
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 700,
                      background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe',
                    }}>
                      {f.code}
                    </span>
                    {f.name}
                    {fQty > 0 && (
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>
                        {fQty.toLocaleString()}個
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                onClick={() => setActiveFactoryTab('__all__')}
                className="ml-auto px-5 transition-colors"
                style={{
                  height: 34, fontSize: 12, fontWeight: 600,
                  borderBottom: currentFactoryTab === '__all__' ? '2px solid #1a3a5c' : '2px solid transparent',
                  color: currentFactoryTab === '__all__' ? '#1a3a5c' : '#94a3b8',
                  background: currentFactoryTab === '__all__' ? 'white' : 'transparent',
                  marginBottom: -1,
                }}
              >
                全工場合計
              </button>
            </div>
          )}

          {/* タブコンテンツ */}
          {(() => {
            const showAll = currentFactoryTab === '__all__' || factoriesWithProducts.length <= 1;
            const targetFactories = showAll
              ? factoriesWithProducts
              : factoriesWithProducts.filter((f) => f.code === currentFactoryTab);

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
                    const factoryProducts = products.filter(
                      (p) => (p.factoryCode ?? 'F001') === factory.code,
                    );
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
                                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 700,
                                  background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                                  {factory.code}
                                </span>
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
                                  <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
                                    style={{ background: p.color }} />
                                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{p.code}</span>
                                </div>
                              </td>
                              <td style={{ fontWeight: 600, color: '#1e3a5f' }}>{p.name}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                {qty > 0
                                  ? <span style={{ color: '#1e3a5f' }}>{qty.toLocaleString()}個</span>
                                  : <span style={{ color: '#cbd5e1' }}>—</span>}
                              </td>
                              <td style={{ textAlign: 'right', color: '#475569' }}>
                                {pals > 0 ? `${pals}枚` : <span style={{ color: '#cbd5e1' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}

                        {(showAll && factoriesWithProducts.length > 1) && (
                          <tr key={`sub-${factory.code}`} style={{ background: '#eef4fb' }}>
                            <td colSpan={2} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#1e40af', border: '1px solid #c0cdd9' }}>
                              {factory.name} 小計
                            </td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#1e40af', border: '1px solid #c0cdd9' }}>
                              {factoryQty.toLocaleString()}個
                            </td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#1e40af', border: '1px solid #c0cdd9' }}>
                              {factoryPals}枚
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}

                  {/* 合計行 */}
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
                        : products
                            .filter((p) => (p.factoryCode ?? 'F001') === currentFactoryTab)
                            .reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0)
                      ).toLocaleString()}個
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#475569', border: '1px solid #b0bec9' }}>
                      {(showAll
                        ? products.reduce((s, p) => {
                            const qty = productionPlan[p.code] ?? 0;
                            return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                          }, 0)
                        : products
                            .filter((p) => (p.factoryCode ?? 'F001') === currentFactoryTab)
                            .reduce((s, p) => {
                              const qty = productionPlan[p.code] ?? 0;
                              return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                            }, 0)
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

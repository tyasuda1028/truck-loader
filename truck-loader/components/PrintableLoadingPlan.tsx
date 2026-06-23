'use client';

/**
 * 印刷・PDF用の積載計画ドキュメント（ドライバー渡し用）。
 * 画面外に描画し、html2pdf でA4 PDF化する（lib/exportPdf.ts）。
 *
 *  1) 全体スケジュール（拠点×曜日の台数・パレット・積載率）
 *  2) トラック別 積載シート（毎便）：
 *     - 積載レイアウト図（荷台のどこに何番の何を積むか。前→後、色分け・番号）
 *     - 積み込みチェックリスト（順番ごとに ☐ で完了チェック）
 *     ※ 1台ずつ改ページ。ドライバーが1便分を1枚で受け取れる。
 */
import type { DayWarehousePlan, Warehouse, TruckType, Product, PalletType, TruckSlotItem } from '@/lib/types';
import { calcStackingLayout } from '@/lib/calculations';
import BrandLogo from './BrandLogo';

interface Props {
  factoryName: string;
  weekLabel: string;
  plans: DayWarehousePlan[];
  warehouses: Warehouse[];
  truckTypes: TruckType[];
  products: Product[];
  palletTypes: PalletType[];
  productColors: Record<string, string>;
  productNames: Record<string, string>;
  dayLabels: string[];
}

function dayName(d: number, dayLabels: string[]): string {
  if (d === -1) return '週全体';
  return dayLabels[d] ? `${dayLabels[d]}曜` : '';
}
function shortName(name: string): string {
  return name.replace(/[\s　]*[（(].*?[）)]/g, '').trim().slice(0, 10);
}

const cellTd: React.CSSProperties = { border: '1px solid #cbd5e1', padding: '4px 8px', fontSize: 12 };
const cellTh: React.CSSProperties = { ...cellTd, background: '#f1f5f9', fontWeight: 700, textAlign: 'left' };
const checkBox: React.CSSProperties = { display: 'inline-block', width: 16, height: 16, border: '2px solid #334155', borderRadius: 3 };

/** 1台分の積載レイアウト図（上から見た配置：前=上→後=下、横=列） */
function LayoutGrid({ title, grid, rows, cols, productColors, productNames }: {
  title: string; grid: (TruckSlotItem | null)[][]; rows: number; cols: number;
  productColors: Record<string, string>; productNames: Record<string, string>;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 2 }}>{title}</div>
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, border: '2px solid #475569', borderRadius: 4, padding: 4, background: '#f8fafc' }}>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: cols }, (_, c) => {
              const cell = grid[r]?.[c] ?? null;
              return (
                <div
                  key={c}
                  style={{
                    width: 78, height: 44, borderRadius: 3, position: 'relative',
                    border: cell ? '1px solid rgba(0,0,0,0.15)' : '1px dashed #cbd5e1',
                    background: cell ? (productColors[cell.productCode] ?? '#94a3b8') : '#fff',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                  }}
                >
                  {cell ? (
                    <>
                      <span style={{ position: 'absolute', top: 1, left: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 8, width: 15, height: 15, lineHeight: '15px' }}>{cell.orderNum}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(0,0,0,0.75)', marginTop: 6, padding: '0 2px', lineHeight: 1.1 }}>{shortName(productNames[cell.productCode] ?? cell.productCode)}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 9, color: '#cbd5e1' }}>空</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrintableLoadingPlan({ factoryName, weekLabel, plans, warehouses, truckTypes, products, palletTypes, productColors, productNames, dayLabels }: Props) {
  const whName = (code: string) => warehouses.find((w) => w.code === code)?.name ?? code;
  const ttName = (code: string) => truckTypes.find((t) => t.code === code)?.name ?? code;
  const ttObj = (code: string) => truckTypes.find((t) => t.code === code);
  const ttMax = (code: string) => ttObj(code)?.maxPallets ?? 0;

  const sorted = [...plans]
    .filter((p) => p.trucks.length > 0)
    .sort((a, b) => (a.dayOfWeek - b.dayOfWeek) || a.warehouseCode.localeCompare(b.warehouseCode));

  return (
    <div style={{ width: 760, background: '#fff', color: '#0f172a', fontFamily: '-apple-system, "Hiragino Sans", sans-serif', padding: 16 }}>
      {/* ── 見出し ── */}
      <div style={{ borderBottom: '2px solid #1e293b', paddingBottom: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <BrandLogo size={34} rounded={8} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>積載計画書 — {factoryName}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{weekLabel}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>スマコウバ積載</div>
      </div>

      {/* ── 全体スケジュール ── */}
      <div style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 6px' }}>■ 全体スケジュール</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={cellTh}>曜日</th>
            <th style={cellTh}>拠点</th>
            <th style={{ ...cellTh, textAlign: 'right' }}>台数</th>
            <th style={{ ...cellTh, textAlign: 'right' }}>パレット</th>
            <th style={{ ...cellTh, textAlign: 'right' }}>出荷個数</th>
            <th style={{ ...cellTh, textAlign: 'right' }}>積載率</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const cap = p.trucks.reduce((s, t) => s + (t.maxPallets || ttMax(t.truckTypeCode)), 0);
            const rate = cap > 0 ? Math.round((p.totalPallets / cap) * 100) : 0;
            return (
              <tr key={i}>
                <td style={cellTd}>{dayName(p.dayOfWeek, dayLabels)}</td>
                <td style={cellTd}>{whName(p.warehouseCode)}</td>
                <td style={{ ...cellTd, textAlign: 'right' }}>{p.trucks.length}台</td>
                <td style={{ ...cellTd, textAlign: 'right' }}>{p.totalPallets}枚</td>
                <td style={{ ...cellTd, textAlign: 'right' }}>{p.totalQty.toLocaleString()}個</td>
                <td style={{ ...cellTd, textAlign: 'right' }}>{rate}%</td>
              </tr>
            );
          })}
          {sorted.length === 0 && <tr><td style={cellTd} colSpan={6}>計画がありません。</td></tr>}
        </tbody>
      </table>

      {/* ── トラック別 積載シート（毎便）── */}
      <div style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 6px' }}>■ トラック別 積載シート（積込チェック用）</div>
      {sorted.flatMap((p) =>
        p.trucks.map((load, ti) => {
          const tt = ttObj(load.truckTypeCode);
          const layout = tt ? calcStackingLayout(load, tt, products, palletTypes) : null;
          // 全配置を積込順に列挙（下段→上段、orderNum順）
          const placements: { item: TruckSlotItem; tier: string }[] = [];
          if (layout) {
            layout.floor.forEach((rowArr) => rowArr.forEach((c) => { if (c) placements.push({ item: c, tier: '下段' }); }));
            layout.upper.forEach((rowArr) => rowArr.forEach((c) => { if (c) placements.push({ item: c, tier: '上段' }); }));
            placements.sort((a, b) => a.item.orderNum - b.item.orderNum);
          }
          const hasUpper = layout ? layout.upper.flat().some(Boolean) : false;
          return (
            <div
              key={`${p.warehouseCode}-${p.dayOfWeek}-${ti}`}
              style={{ pageBreakInside: 'avoid', breakInside: 'avoid', border: '1px solid #94a3b8', borderRadius: 6, padding: 10, marginBottom: 14 }}
            >
              {/* シート見出し */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>
                  {load.truckIndex}号車　{whName(p.warehouseCode)}　<span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{dayName(p.dayOfWeek, dayLabels)}</span>
                </div>
                <div style={{ fontSize: 11, color: '#1e293b' }}>
                  {ttName(load.truckTypeCode)} ・ 積載 {load.totalPallets}/{load.maxPallets}枚
                </div>
              </div>

              {/* 積載レイアウト図 + チェックリストを横並び */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* レイアウト図 */}
                {layout && (
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: '#64748b', textAlign: 'center', marginBottom: 2 }}>↑ 前（キャブ側）</div>
                    {hasUpper && <LayoutGrid title="上段" grid={layout.upper} rows={layout.rows} cols={layout.cols} productColors={productColors} productNames={productNames} />}
                    <LayoutGrid title={hasUpper ? '下段（床面）' : '荷台'} grid={layout.floor} rows={layout.rows} cols={layout.cols} productColors={productColors} productNames={productNames} />
                    <div style={{ fontSize: 10, color: '#64748b', textAlign: 'center', marginTop: 2 }}>↓ 後（ウイング扉）</div>
                  </div>
                )}

                {/* 積み込みチェックリスト */}
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3 }}>積み込みチェックリスト（①番から順に）</div>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ ...cellTh, width: 36, textAlign: 'center' }}>✓</th>
                        <th style={{ ...cellTh, width: 36, textAlign: 'center' }}>順</th>
                        <th style={{ ...cellTh, width: 48 }}>段</th>
                        <th style={cellTh}>製品名</th>
                        <th style={{ ...cellTh, textAlign: 'right', width: 80 }}>個数/枚</th>
                      </tr>
                    </thead>
                    <tbody>
                      {placements.map((pl, idx) => (
                        <tr key={idx}>
                          <td style={{ ...cellTd, textAlign: 'center' }}><span style={checkBox} /></td>
                          <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{pl.item.orderNum}</td>
                          <td style={cellTd}>{pl.tier}</td>
                          <td style={cellTd}>{productNames[pl.item.productCode] ?? pl.item.productCode}</td>
                          <td style={{ ...cellTd, textAlign: 'right' }}>{pl.item.qty.toLocaleString()}個</td>
                        </tr>
                      ))}
                      {placements.length === 0 && load.items.map((it, idx) => (
                        <tr key={idx}>
                          <td style={{ ...cellTd, textAlign: 'center' }}><span style={checkBox} /></td>
                          <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                          <td style={cellTd}>—</td>
                          <td style={cellTd}>{productNames[it.productCode] ?? it.productCode}（{it.pallets}枚）</td>
                          <td style={{ ...cellTd, textAlign: 'right' }}>{it.qty.toLocaleString()}個</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11 }}>
                    <span>ドライバー署名：____________________</span>
                    <span>積込完了 ☐</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
                ※ ①番から順にキャブ側（前方）から積み込み。同一製品はまとめて連続積み。ウイング車は側面扉から。
              </div>
            </div>
          );
        }),
      )}
    </div>
  );
}

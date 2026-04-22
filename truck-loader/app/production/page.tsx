'use client';

import { useMemo, useState, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans, calcSendQty } from '@/lib/calculations';
import {
  parseProductionCSV,
  parseInventoryCSV,
  parseLocationStockCSV,
  generateProductionTemplate,
  generateInventoryTemplate,
  generateLocationStockTemplate,
  downloadCSV,
} from '@/lib/csv';
import clsx from 'clsx';

type Tab = 'production' | 'inventory' | 'location' | 'ratio' | 'csv';

export default function ProductionPage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios,
    inventoryStock, locationStock, inTransitStock,
    setProductionQty, setRatio,
    setInventoryStock, setLocationStock,
    importProductionPlan, importInventoryStockBulk, importLocationStockBulk,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<Tab>('production');

  // CSV インポート用ステート
  const prodFileRef = useRef<HTMLInputElement>(null);
  const invFileRef  = useRef<HTMLInputElement>(null);
  const locFileRef  = useRef<HTMLInputElement>(null);
  const now = new Date();
  const [templateYear,  setTemplateYear]  = useState(now.getFullYear());
  const [templateMonth, setTemplateMonth] = useState(now.getMonth() + 1);
  const [prodPreview, setProdPreview] = useState<ReturnType<typeof parseProductionCSV> | null>(null);
  const [invPreview,  setInvPreview]  = useState<ReturnType<typeof parseInventoryCSV>  | null>(null);
  const [locPreview,  setLocPreview]  = useState<ReturnType<typeof parseLocationStockCSV> | null>(null);
  const [prodImported, setProdImported] = useState(false);
  const [invImported,  setInvImported]  = useState(false);
  const [locImported,  setLocImported]  = useState(false);

  const sendQty = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock),
    [products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock],
  );

  const plans = useMemo(
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock),
    [warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock],
  );

  // 出荷がある拠点のみ表示
  const activeWarehouses = warehouses.filter(
    (wh) => products.some(
      (p) => (distributionRatios[p.code]?.[wh.code] ?? 0) > 0,
    ),
  );

  // ─── CSV ハンドラ ────────────────────────────────────────────────────
  const handleProdFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setProdPreview(parseProductionCSV(text, products));
      setProdImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleInvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setInvPreview(parseInventoryCSV(text, products));
      setInvImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleProdImport = () => {
    if (!prodPreview) return;
    importProductionPlan(prodPreview.dailyPlan, prodPreview.productionPlan);
    setProdImported(true);
  };

  const handleInvImport = () => {
    if (!invPreview) return;
    importInventoryStockBulk(invPreview.inventoryStock);
    setInvImported(true);
  };

  const handleLocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setLocPreview(parseLocationStockCSV(text, products, warehouses));
      setLocImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleLocImport = () => {
    if (!locPreview) return;
    importLocationStockBulk(locPreview.locationStock);
    setLocImported(true);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'production', label: '📋 週間生産数' },
    { key: 'inventory',  label: '📦 全体在庫数' },
    { key: 'location',   label: '🏭 拠点別現在庫' },
    { key: 'ratio',      label: '📊 配分比率' },
    { key: 'csv',        label: '📥 CSVインポート' },
  ];

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">生産計画入力</h1>
        <p className="text-sm text-slate-500 mt-0.5">全体在庫・拠点別現在庫・配分比率から不足数を算出し、生産数で補充する送り数を計算します</p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── タブ①：週間生産数 ── */}
      {activeTab === 'production' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="px-4 py-2.5 text-left font-semibold">工場</th>
                <th className="px-4 py-2.5 text-left font-semibold">製品コード</th>
                <th className="px-4 py-2.5 text-left font-semibold">製品名</th>
                <th className="px-4 py-2.5 text-right font-semibold w-44">週間生産数（個）</th>
                <th className="px-4 py-2.5 text-right font-semibold">週パレット数</th>
              </tr>
            </thead>
            <tbody>
              {factories.map((factory) => {
                const factoryProducts = products.filter(
                  (p) => (p.factoryCode ?? 'F001') === factory.code,
                );
                if (factoryProducts.length === 0) return null;

                const subtotalQty = factoryProducts.reduce(
                  (s, p) => s + (productionPlan[p.code] ?? 0), 0,
                );
                const subtotalPals = factoryProducts.reduce((s, p) => {
                  const qty = productionPlan[p.code] ?? 0;
                  return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                }, 0);

                return (
                  <>
                    {/* 工場ヘッダ行 */}
                    <tr key={`hdr-${factory.code}`} className="bg-indigo-50 border-t-2 border-indigo-100">
                      <td colSpan={5} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                            {factory.code}
                          </span>
                          <span className="text-sm font-semibold text-indigo-800">{factory.name}</span>
                        </div>
                      </td>
                    </tr>

                    {/* 製品行 */}
                    {factoryProducts.map((p) => {
                      const qty = productionPlan[p.code] ?? 0;
                      const pals = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                      return (
                        <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-400 text-xs">
                            {/* 工場列は空（ヘッダで表示済み） */}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-sm border border-black/10 shrink-0"
                                style={{ background: p.color }}
                              />
                              <span className="font-mono text-xs text-slate-600">{p.code}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 font-medium text-slate-700">{p.name}</td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min={0}
                              value={qty === 0 ? '' : qty}
                              onChange={(e) =>
                                setProductionQty(p.code, parseInt(e.target.value, 10) || 0)
                              }
                              placeholder="0"
                              className="w-full text-right border border-slate-200 rounded px-2 py-1
                                         text-sm focus:outline-none focus:border-brand-500 focus:ring-1
                                         focus:ring-brand-500 bg-white"
                            />
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-slate-700">
                            {pals > 0 ? `${pals}枚` : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}

                    {/* 工場小計行 */}
                    <tr key={`sub-${factory.code}`} className="border-t border-indigo-100 bg-indigo-50/60">
                      <td colSpan={3} className="px-4 py-1.5 text-xs text-indigo-500 font-semibold">
                        {factory.name} 小計
                      </td>
                      <td className="px-4 py-1.5 text-right text-xs font-bold text-indigo-600">
                        {subtotalQty > 0 ? `${subtotalQty.toLocaleString()}個` : '—'}
                      </td>
                      <td className="px-4 py-1.5 text-right text-xs font-bold text-indigo-500">
                        {subtotalPals > 0 ? `${subtotalPals}枚` : '—'}
                      </td>
                    </tr>
                  </>
                );
              })}

              {/* 総合計行 */}
              {(() => {
                const totalQty = products.reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0);
                const totalPals = products.reduce((s, p) => {
                  const qty = productionPlan[p.code] ?? 0;
                  return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                }, 0);
                return (
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td colSpan={3} className="px-4 py-2 text-slate-600">総合計</td>
                    <td className="px-4 py-2 text-right text-brand-600">
                      {totalQty > 0 ? `${totalQty.toLocaleString()}個` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {totalPals > 0 ? `${totalPals}枚` : '—'}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* ── タブ②：全体在庫数 ── */}
      {activeTab === 'inventory' && (
        <div>
          <p className="text-xs text-slate-500 mb-3 bg-blue-50 border border-blue-200 rounded px-3 py-2">
            💡 各製品の全体在庫数（工場・倉庫合計）を入力します。配分比率と掛け合わせて各拠点の必要在庫数を算出します。
          </p>
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs">
                  <th className="px-4 py-2.5 text-left font-semibold w-8">#</th>
                  <th className="px-4 py-2.5 text-left font-semibold">製品名</th>
                  <th className="px-4 py-2.5 text-left font-semibold">パレット型</th>
                  <th className="px-4 py-2.5 text-right font-semibold">個/枚</th>
                  <th className="px-4 py-2.5 text-right font-semibold w-44">全体在庫数（個）</th>
                  <th className="px-4 py-2.5 text-right font-semibold">在庫パレット数</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => {
                  const qty = inventoryStock[p.code] ?? 0;
                  const pals = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                  return (
                    <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-sm border border-black/10 shrink-0"
                            style={{ background: p.color }}
                          />
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-slate-400 font-mono">{p.code}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-500">{p.palletType}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{p.capacityPerPallet}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          value={qty === 0 ? '' : qty}
                          onChange={(e) =>
                            setInventoryStock(p.code, parseInt(e.target.value, 10) || 0)
                          }
                          placeholder="0"
                          className="w-full text-right border border-slate-200 rounded px-2 py-1
                                     text-sm focus:outline-none focus:border-brand-500 focus:ring-1
                                     focus:ring-brand-500 bg-white"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-slate-700">
                        {pals > 0 ? `${pals}枚` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── タブ③：拠点別現在庫 ── */}
      {activeTab === 'location' && (
        <div>
          <p className="text-xs text-slate-500 mb-3 bg-green-50 border border-green-200 rounded px-3 py-2">
            💡 各拠点の製品別現在庫数を入力します。必要在庫数との差分が不足数（送り数）となります。
          </p>
          <div className="overflow-x-auto">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">
                      製品名
                    </th>
                    {activeWarehouses.map((wh) => (
                      <th key={wh.code} className="px-2 py-2.5 text-center font-semibold text-slate-500 min-w-[80px]">
                        <div className="font-bold text-slate-400">{wh.code}</div>
                        <div className="text-[10px] text-slate-500 leading-tight">{wh.name.slice(0, 5)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    return (
                      <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
                              style={{ background: p.color }}
                            />
                            <span className="font-medium text-slate-700">{p.name}</span>
                          </div>
                        </td>
                        {activeWarehouses.map((wh) => {
                          const ratio = distributionRatios[p.code]?.[wh.code] ?? 0;
                          if (ratio === 0) {
                            return (
                              <td key={wh.code} className="px-1 py-1.5 text-center text-slate-300">—</td>
                            );
                          }
                          const stock = locationStock[p.code]?.[wh.code] ?? 0;
                          return (
                            <td key={wh.code} className="px-1 py-1.5 text-center">
                              <input
                                type="number"
                                min={0}
                                value={stock === 0 ? '' : stock}
                                onChange={(e) =>
                                  setLocationStock(p.code, wh.code, parseInt(e.target.value, 10) || 0)
                                }
                                placeholder="0"
                                className="w-16 text-center border border-slate-200 rounded px-1 py-0.5
                                           text-xs focus:outline-none focus:border-brand-500 focus:ring-1
                                           focus:ring-brand-500 bg-white"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 送り数プレビュー */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-600 mb-3">🚚 算出された送り数（個）</h2>
            <div className="overflow-x-auto">
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200 min-w-[180px]">
                        製品
                      </th>
                      {activeWarehouses.map((wh) => (
                        <th key={wh.code} className="px-2 py-2 text-center font-semibold text-slate-500 min-w-[64px]">
                          {wh.code}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-semibold text-slate-500 min-w-[80px]">合計送り数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const total = activeWarehouses.reduce((s, wh) => s + (sendQty[p.code]?.[wh.code] ?? 0), 0);
                      return (
                        <tr key={p.code} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
                              {p.name}
                            </div>
                          </td>
                          {activeWarehouses.map((wh) => {
                            const qty = sendQty[p.code]?.[wh.code] ?? 0;
                            return (
                              <td key={wh.code} className="px-2 py-1.5 text-center text-slate-600">
                                {qty > 0 ? <span className="font-medium">{qty}個</span> : <span className="text-slate-300">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-right font-semibold text-slate-700">
                            {total > 0 ? `${total}個` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── タブ⑤：CSVインポート ── */}
      {activeTab === 'csv' && (
        <div className="flex flex-col gap-8">

          {/* ── 生産計画インポート ── */}
          <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">生産計画 CSVインポート</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品コードを行、日付を列としたCSVを取り込みます。取り込んだ日付の合計が生産数として反映されます。
            </p>

            {/* テンプレートDL */}
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">テンプレートDL：</span>
              <select
                value={templateYear}
                onChange={(e) => setTemplateYear(Number(e.target.value))}
                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
              <select
                value={templateMonth}
                onChange={(e) => setTemplateMonth(Number(e.target.value))}
                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
              <button
                onClick={() =>
                  downloadCSV(
                    generateProductionTemplate(products, templateYear, templateMonth),
                    `生産計画_${templateYear}-${String(templateMonth).padStart(2,'0')}.csv`,
                  )
                }
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                ダウンロード
              </button>
            </div>

            {/* ファイル選択 */}
            <div className="flex items-center gap-3 mb-4">
              <input
                ref={prodFileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleProdFile}
                className="hidden"
              />
              <button
                onClick={() => { prodFileRef.current?.click(); setProdPreview(null); setProdImported(false); }}
                className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                CSVファイルを選択
              </button>
              {prodPreview && (
                <span className="text-xs text-slate-500">
                  {prodPreview.rows.length}製品 × {prodPreview.dates.length}日分を読み込みました
                </span>
              )}
            </div>

            {/* 警告 */}
            {prodPreview && prodPreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {prodPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}

            {/* プレビューテーブル */}
            {prodPreview && prodPreview.rows.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200 min-w-[180px]">製品</th>
                      {prodPreview.dates.slice(0, 15).map((d) => (
                        <th key={d} className="px-2 py-2 text-center font-semibold text-slate-400 min-w-[52px]">
                          {d.slice(5)} {/* MM-DD */}
                        </th>
                      ))}
                      {prodPreview.dates.length > 15 && (
                        <th className="px-2 py-2 text-center text-slate-400">…+{prodPreview.dates.length - 15}日</th>
                      )}
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 min-w-[80px]">合計（個）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodPreview.rows.map((row) => (
                      <tr key={row.code} className={clsx('border-t border-slate-100', !row.found && 'bg-amber-50')}>
                        <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                          <div className="font-medium text-slate-700">{row.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{row.code}</div>
                        </td>
                        {row.dailyQty.slice(0, 15).map((q, i) => (
                          <td key={i} className="px-2 py-1.5 text-center text-slate-600">
                            {q > 0 ? q : <span className="text-slate-200">—</span>}
                          </td>
                        ))}
                        {prodPreview.dates.length > 15 && <td />}
                        <td className="px-3 py-1.5 text-right font-bold text-slate-800">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {prodPreview && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleProdImport}
                  disabled={prodImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    prodImported
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {prodImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {prodImported && (
                  <span className="text-xs text-emerald-600">生産計画に反映されました</span>
                )}
              </div>
            )}
          </section>

          {/* ── 在庫数インポート ── */}
          <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">在庫数 CSVインポート</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品コードと在庫数の2列（または製品名を含む3列）のCSVを取り込みます。
            </p>

            {/* テンプレートDL */}
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">テンプレートDL：</span>
              <button
                onClick={() =>
                  downloadCSV(
                    generateInventoryTemplate(products),
                    `在庫数_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`,
                  )
                }
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                ダウンロード
              </button>
            </div>

            {/* ファイル選択 */}
            <div className="flex items-center gap-3 mb-4">
              <input
                ref={invFileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleInvFile}
                className="hidden"
              />
              <button
                onClick={() => { invFileRef.current?.click(); setInvPreview(null); setInvImported(false); }}
                className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                CSVファイルを選択
              </button>
              {invPreview && (
                <span className="text-xs text-slate-500">
                  {invPreview.rows.length}製品分を読み込みました
                </span>
              )}
            </div>

            {/* 警告 */}
            {invPreview && invPreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {invPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}

            {/* プレビューテーブル */}
            {invPreview && invPreview.rows.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="text-xs border-collapse w-full max-w-lg">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 border-r border-slate-200">製品コード</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">製品名</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-500">在庫数（個）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invPreview.rows.map((row) => (
                      <tr key={row.code} className={clsx('border-t border-slate-100', !row.found && 'bg-amber-50')}>
                        <td className="px-3 py-1.5 font-mono text-slate-500 border-r border-slate-200">{row.code}</td>
                        <td className="px-3 py-1.5 text-slate-700">{row.name}</td>
                        <td className="px-3 py-1.5 text-right font-bold text-slate-800">{row.qty.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {invPreview && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleInvImport}
                  disabled={invImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    invImported
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {invImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {invImported && (
                  <span className="text-xs text-emerald-600">全体在庫数に反映されました</span>
                )}
              </div>
            )}
          </section>

          {/* ── 拠点別在庫インポート ── */}
          <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">拠点別在庫 CSVインポート</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品×拠点のマトリクス形式（ワイド形式）のCSVを取り込みます。取り込んだ値で全拠点の在庫数を一括更新します。
            </p>

            {/* テンプレートDL */}
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">テンプレートDL：</span>
              <button
                onClick={() =>
                  downloadCSV(
                    generateLocationStockTemplate(products, warehouses, locationStock),
                    `拠点別在庫_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`,
                  )
                }
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                ダウンロード（現在値入り）
              </button>
            </div>

            {/* ファイル選択 */}
            <div className="flex items-center gap-3 mb-4">
              <input
                ref={locFileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleLocFile}
                className="hidden"
              />
              <button
                onClick={() => { locFileRef.current?.click(); setLocPreview(null); setLocImported(false); }}
                className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                CSVファイルを選択
              </button>
              {locPreview && (
                <span className="text-xs text-slate-500">
                  {locPreview.rows.length}製品 × {Object.keys(locPreview.rows[0]?.whQty ?? {}).length}拠点分を読み込みました
                </span>
              )}
            </div>

            {/* 警告 */}
            {locPreview && locPreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {locPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}

            {/* プレビューテーブル */}
            {locPreview && locPreview.rows.length > 0 && (() => {
              const whCodes = Object.keys(locPreview.rows[0]?.whQty ?? {});
              return (
                <div className="overflow-x-auto mb-4">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200 min-w-[160px]">製品</th>
                        {whCodes.map((wc) => (
                          <th key={wc} className="px-2 py-2 text-center font-semibold text-slate-400 min-w-[64px]">
                            <div>{wc}</div>
                            <div className="text-[10px] text-slate-400">{warehouses.find(w => w.code === wc)?.name.slice(0, 4)}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {locPreview.rows.map((row) => (
                        <tr key={row.code} className={clsx('border-t border-slate-100', !row.found && 'bg-amber-50')}>
                          <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                            <div className="font-medium text-slate-700">{row.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{row.code}</div>
                          </td>
                          {whCodes.map((wc) => {
                            const qty = row.whQty[wc] ?? 0;
                            return (
                              <td key={wc} className="px-2 py-1.5 text-center text-slate-600">
                                {qty > 0 ? <span className="font-medium">{qty.toLocaleString()}</span> : <span className="text-slate-300">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {locPreview && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleLocImport}
                  disabled={locImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    locImported
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {locImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {locImported && (
                  <span className="text-xs text-emerald-600">拠点別在庫数に反映されました</span>
                )}
              </div>
            )}
          </section>

          {/* フォーマット説明 */}
          <section className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-xs text-slate-600">
            <h3 className="font-semibold mb-2">CSVフォーマット仕様</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="font-medium mb-1">生産計画CSV</div>
                <pre className="bg-white border border-slate-200 rounded p-2 text-[10px] overflow-x-auto">{`製品コード,製品名,2024-04-01,2024-04-02,...
1064521424,PH-5BN (A色),100,0,...
1064521024,PH-5BN (B色),200,150,...`}</pre>
                <p className="mt-1 text-slate-500">製品名列は省略可。日付は YYYY-MM-DD または M/D 形式。</p>
              </div>
              <div>
                <div className="font-medium mb-1">拠点別在庫CSV</div>
                <pre className="bg-white border border-slate-200 rounded p-2 text-[10px] overflow-x-auto">{`製品コード,製品名,W002,W0B4,...
1064521424,PH-5BN (A色),0,100,...
1064521024,PH-5BN (B色),50,200,...`}</pre>
                <p className="mt-1 text-slate-500">製品名列は省略可。列ヘッダは拠点コード。</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── タブ④：配分比率 ── */}
      {activeTab === 'ratio' && (
        <div>
          <p className="text-xs text-slate-500 mb-3 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            💡 各製品の全体在庫を各拠点に何%配分するかを設定します。横計が100%になるよう設定してください。
          </p>
          <div className="overflow-x-auto">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">
                      製品名
                    </th>
                    {activeWarehouses.map((wh) => (
                      <th key={wh.code} className="px-2 py-2.5 text-center font-semibold text-slate-500 min-w-[70px]">
                        <div className="font-bold text-slate-400">{wh.code}</div>
                        <div className="text-[10px] text-slate-500 leading-tight">{wh.name.slice(0, 5)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-500 min-w-[60px]">合計%</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const rowTotal = activeWarehouses.reduce(
                      (s, wh) => s + (distributionRatios[p.code]?.[wh.code] ?? 0),
                      0,
                    );
                    const isOver = rowTotal > 100;
                    return (
                      <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
                              style={{ background: p.color }}
                            />
                            <span className="font-medium text-slate-700">{p.name}</span>
                          </div>
                        </td>
                        {activeWarehouses.map((wh) => {
                          const ratio = distributionRatios[p.code]?.[wh.code] ?? 0;
                          return (
                            <td key={wh.code} className="px-1 py-1.5 text-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={ratio === 0 ? '' : ratio}
                                onChange={(e) =>
                                  setRatio(p.code, wh.code, parseInt(e.target.value, 10) || 0)
                                }
                                placeholder="0"
                                className="w-14 text-center border border-slate-200 rounded px-1 py-0.5
                                           text-xs focus:outline-none focus:border-brand-500 focus:ring-1
                                           focus:ring-brand-500 bg-white"
                              />
                            </td>
                          );
                        })}
                        <td className={clsx(
                          'px-3 py-1.5 text-right font-bold',
                          isOver ? 'text-red-500' : rowTotal === 100 ? 'text-emerald-600' : 'text-amber-500',
                        )}>
                          {rowTotal}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 拠点別計算結果プレビュー */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-600 mb-3">📦 拠点別パレット数（計算結果）</h2>
            <div className="overflow-x-auto">
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200">
                        製品
                      </th>
                      {activeWarehouses.map((wh) => (
                        <th key={wh.code} className="px-2 py-2 text-center font-semibold text-slate-500 min-w-[64px]">
                          {wh.code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.code} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
                            {p.name}
                          </div>
                        </td>
                        {activeWarehouses.map((wh) => {
                          const qty = sendQty[p.code]?.[wh.code] ?? 0;
                          const pallets = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                          return (
                            <td key={wh.code} className="px-2 py-1.5 text-center text-slate-600">
                              {pallets > 0 ? <span className="font-medium">{pallets}枚</span> : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* 拠点別合計行 */}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600">
                        合計パレット
                      </td>
                      {activeWarehouses.map((wh) => {
                        const plan = plans[wh.code];
                        return (
                          <td key={wh.code} className="px-2 py-2 text-center text-brand-600">
                            {plan?.totalPallets > 0 ? `${plan.totalPallets}枚` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                    {/* 必要台数行 */}
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold">
                        必要台数
                      </td>
                      {activeWarehouses.map((wh) => {
                        const plan = plans[wh.code];
                        return (
                          <td key={wh.code} className="px-2 py-2 text-center text-slate-700 font-semibold">
                            {plan?.trucks.length > 0 ? `${plan.trucks.length}台` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

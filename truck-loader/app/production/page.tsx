'use client';

import { useMemo, useState, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans, calcSendQty } from '@/lib/calculations';
import {
  parseProductionCSV,
  parseLocationStockCSV,
  parsePlannedSalesCSV,
  parseInTransitStockCSV,
  parseDistributionRatiosCSV,
  parseSendQtyCSV,
  generateProductionTemplate,
  generateLocationStockTemplate,
  generatePlannedSalesTemplate,
  generateInTransitStockTemplate,
  generateDistributionRatiosTemplate,
  generateSendQtyCSV,
  downloadCSV,
} from '@/lib/csv';
import clsx from 'clsx';

type Tab = 'production' | 'location' | 'transit' | 'sales' | 'ratio' | 'sendqty';

export default function ProductionPage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, dailyProductionPlan, distributionRatios,
    locationStock, inTransitStock, plannedSales, inventoryStock,
    sendQtyManual,
    setProductionQty, setRatio, setLocationStock, setPlannedSales, setInTransitStock,
    setSendQtyManual, clearSendQtyManualCell, importSendQtyManualBulk, clearSendQtyManual,
    importProductionPlan, importLocationStockBulk, importPlannedSalesBulk, importInTransitStockBulk, importDistributionRatiosBulk,
    clearProductionPlan, clearLocationStock, clearPlannedSales, clearInTransitStock,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<Tab>('production');
  const now = new Date();

  // 生産計画 CSV
  const prodFileRef = useRef<HTMLInputElement>(null);
  const [templateYear,  setTemplateYear]  = useState(now.getFullYear());
  const [templateMonth, setTemplateMonth] = useState(now.getMonth() + 1);
  const [prodPreview,   setProdPreview]   = useState<ReturnType<typeof parseProductionCSV> | null>(null);
  const [prodImported,  setProdImported]  = useState(false);

  // 拠点別現在庫 CSV
  const locFileRef = useRef<HTMLInputElement>(null);
  const [locPreview,  setLocPreview]  = useState<ReturnType<typeof parseLocationStockCSV> | null>(null);
  const [locImported, setLocImported] = useState(false);

  // 予定出荷数 CSV
  const salesFileRef = useRef<HTMLInputElement>(null);
  const [salesPreview,  setSalesPreview]  = useState<ReturnType<typeof parsePlannedSalesCSV> | null>(null);
  const [salesImported, setSalesImported] = useState(false);

  // 輸送中 CSV
  const transitFileRef = useRef<HTMLInputElement>(null);
  const [transitPreview,  setTransitPreview]  = useState<ReturnType<typeof parseInTransitStockCSV> | null>(null);
  const [transitImported, setTransitImported] = useState(false);

  // 配分比率 CSV
  const ratioFileRef = useRef<HTMLInputElement>(null);
  const [ratioPreview,  setRatioPreview]  = useState<ReturnType<typeof parseDistributionRatiosCSV> | null>(null);
  const [ratioImported, setRatioImported] = useState(false);

  // 送り数 CSV
  const sendQtyFileRef = useRef<HTMLInputElement>(null);
  const [sendQtyPreview,  setSendQtyPreview]  = useState<ReturnType<typeof parseSendQtyCSV> | null>(null);
  const [sendQtyImported, setSendQtyImported] = useState(false);

  // 自動計算送り数（手動上書き前）
  const sendQtyCalc = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales),
    [products, warehouses, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales],
  );

  // 有効送り数（手動上書きを反映）
  const sendQty = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const p of products) {
      result[p.code] = {};
      for (const wh of warehouses) {
        const manual = sendQtyManual[p.code]?.[wh.code];
        result[p.code][wh.code] = (manual !== undefined && manual > 0)
          ? manual
          : (sendQtyCalc[p.code]?.[wh.code] ?? 0);
      }
    }
    return result;
  }, [products, warehouses, sendQtyCalc, sendQtyManual]);

  const plans = useMemo(
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales, sendQtyManual),
    [warehouses, products, truckTypes, productionPlan, distributionRatios, inventoryStock, locationStock, inTransitStock, plannedSales, sendQtyManual],
  );

  const activeWarehouses = warehouses.filter((wh) =>
    products.some((p) => (distributionRatios[p.code]?.[wh.code] ?? 0) > 0),
  );

  // ─── 一括クリア ──────────────────────────────────────────────────────
  const handleClear = (tab: Tab) => {
    if (tab === 'production') clearProductionPlan();
    if (tab === 'location')   clearLocationStock();
    if (tab === 'transit')    clearInTransitStock();
    if (tab === 'sales')      clearPlannedSales();
    if (tab === 'sendqty')    clearSendQtyManual();
  };

  // ─── CSV ハンドラ ────────────────────────────────────────────────────
  const handleProdFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProdPreview(parseProductionCSV(ev.target?.result as string, products, dailyProductionPlan, productionPlan));
      setProdImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleLocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLocPreview(parseLocationStockCSV(ev.target?.result as string, products, warehouses, locationStock));
      setLocImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleTransitFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setTransitPreview(parseInTransitStockCSV(ev.target?.result as string, products, warehouses, inTransitStock));
      setTransitImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleRatioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRatioPreview(parseDistributionRatiosCSV(ev.target?.result as string, products, warehouses, distributionRatios));
      setRatioImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSalesFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSalesPreview(parsePlannedSalesCSV(ev.target?.result as string, products, warehouses, plannedSales));
      setSalesImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'production', label: '📋 週間生産数' },
    { key: 'location',   label: '🏭 拠点別現在庫' },
    { key: 'transit',    label: '🚚 輸送中（前回決定分）' },
    { key: 'sales',      label: '🛒 予定出荷数' },
    { key: 'ratio',      label: '📊 配分比率' },
    { key: 'sendqty',    label: '📦 送り数設定' },
  ];

  const handleSendQtyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSendQtyPreview(parseSendQtyCSV(ev.target?.result as string, products, warehouses, sendQtyManual));
      setSendQtyImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">配送計画入力</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          拠点別現在庫・輸送中数量・予定出荷数・配分比率から不足数を算出し、生産数で補充する送り数を計算します
        </p>
      </div>

      {/* タブ */}
      <div className="flex items-end gap-1 mb-4 border-b border-slate-200">
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
        {/* 一括クリアボタン（ratioタブ以外） */}
        {activeTab !== 'ratio' && (
          <div className="ml-auto pb-1">
            <button
              onClick={() => handleClear(activeTab)}
              className="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-500 hover:border-red-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              🗑 一括クリア
            </button>
          </div>
        )}
      </div>

      {/* ── タブ①：週間生産数 ── */}
      {activeTab === 'production' && (
        <div className="flex flex-col gap-6">
          {/* CSV インポート */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">CSVインポート</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品コードを行、日付を列としたCSVを取り込みます。日付の合計が週間生産数として反映されます。
              CSVに含まれない製品行・日付列の既存値は保持されます。
            </p>
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">テンプレートDL：</span>
              <select value={templateYear} onChange={(e) => setTemplateYear(Number(e.target.value))}
                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white">
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
              <select value={templateMonth} onChange={(e) => setTemplateMonth(Number(e.target.value))}
                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
              <button
                onClick={() => downloadCSV(
                  generateProductionTemplate(products, templateYear, templateMonth, dailyProductionPlan),
                  `生産計画_${templateYear}-${String(templateMonth).padStart(2,'0')}.csv`,
                )}
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                ダウンロード
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <input ref={prodFileRef} type="file" accept=".csv,text/csv" onChange={handleProdFile} className="hidden" />
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
            {prodPreview?.warnings && prodPreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {prodPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {prodPreview && prodPreview.rows.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200 min-w-[180px]">製品</th>
                      {prodPreview.dates.slice(0, 15).map((d) => (
                        <th key={d} className="px-2 py-2 text-center font-semibold text-slate-400 min-w-[52px]">{d.slice(5)}</th>
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
                  onClick={() => { importProductionPlan(prodPreview.dailyPlan, prodPreview.productionPlan); setProdImported(true); }}
                  disabled={prodImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    prodImported ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {prodImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {prodImported && <span className="text-xs text-emerald-600">生産計画に反映されました</span>}
              </div>
            )}
          </div>

          {/* 入力テーブル */}
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
                  const subtotalQty  = factoryProducts.reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0);
                  const subtotalPals = factoryProducts.reduce((s, p) => {
                    const qty = productionPlan[p.code] ?? 0;
                    return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                  }, 0);
                  return (
                    <>
                      <tr key={`hdr-${factory.code}`} className="bg-indigo-50 border-t-2 border-indigo-100">
                        <td colSpan={5} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{factory.code}</span>
                            <span className="text-sm font-semibold text-indigo-800">{factory.name}</span>
                          </div>
                        </td>
                      </tr>
                      {factoryProducts.map((p) => {
                        const qty  = productionPlan[p.code] ?? 0;
                        const pals = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                        return (
                          <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-400 text-xs" />
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                                <span className="font-mono text-xs text-slate-600">{p.code}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 font-medium text-slate-700">{p.name}</td>
                            <td className="px-4 py-2">
                              <input
                                type="number" min={0}
                                value={qty === 0 ? '' : qty}
                                onChange={(e) => setProductionQty(p.code, parseInt(e.target.value, 10) || 0)}
                                placeholder="0"
                                className="w-full text-right border border-slate-200 rounded px-2 py-1 text-sm
                                           focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
                              />
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-slate-700">
                              {pals > 0 ? `${pals}枚` : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                      <tr key={`sub-${factory.code}`} className="border-t border-indigo-100 bg-indigo-50/60">
                        <td colSpan={3} className="px-4 py-1.5 text-xs text-indigo-500 font-semibold">{factory.name} 小計</td>
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
                {(() => {
                  const totalQty  = products.reduce((s, p) => s + (productionPlan[p.code] ?? 0), 0);
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

        </div>
      )}

      {/* ── タブ②：拠点別現在庫 ── */}
      {activeTab === 'location' && (
        <div className="flex flex-col gap-6">
          <p className="text-xs text-slate-500 bg-green-50 border border-green-200 rounded px-3 py-2">
            💡 各拠点の製品別現在庫数を入力します。必要在庫数との差分（予定出荷も考慮）が不足数（送り数）となります。
          </p>

          {/* CSV インポート */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">CSVインポート</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品×拠点のマトリクス形式（ワイド形式）のCSVを取り込みます。
              拠点列のヘッダーは<strong>拠点コード（W002 等）または拠点名（札幌営業所 等）</strong>のどちらでも認識します（大文字小文字も無視）。
              列順は問わず、認識できない列は無視されます。CSVに含まれない製品行・拠点列の既存値は保持されます。
            </p>
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">テンプレートDL：</span>
              <button
                onClick={() => downloadCSV(
                  generateLocationStockTemplate(products, warehouses, locationStock),
                  `拠点別在庫_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`,
                )}
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                ダウンロード（現在値入り）
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <input ref={locFileRef} type="file" accept=".csv,text/csv" onChange={handleLocFile} className="hidden" />
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
            {locPreview?.warnings && locPreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {locPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
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
                  onClick={() => { importLocationStockBulk(locPreview.locationStock); setLocImported(true); }}
                  disabled={locImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    locImported ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {locImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {locImported && <span className="text-xs text-emerald-600">拠点別在庫数に反映されました</span>}
              </div>
            )}
          </div>

          {/* インライン編集マトリクス */}
          <div className="overflow-x-auto">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-32">製品コード</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-32 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">製品名</th>
                    {warehouses.map((wh) => (
                      <th key={wh.code} className="px-2 py-2.5 text-center font-semibold text-slate-500 min-w-[80px]">
                        <div className="font-bold text-slate-400">{wh.code}</div>
                        <div className="text-[10px] text-slate-500 leading-tight">{wh.name.slice(0, 5)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                      <td className="px-3 py-1.5 sticky left-32 bg-white z-10 border-r border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                          <span className="font-medium text-slate-700">{p.name}</span>
                        </div>
                      </td>
                      {warehouses.map((wh) => {
                        const stock = locationStock[p.code]?.[wh.code] ?? 0;
                        return (
                          <td key={wh.code} className="px-1 py-1.5 text-center">
                            <input
                              type="number" min={0}
                              value={stock === 0 ? '' : stock}
                              onChange={(e) => setLocationStock(p.code, wh.code, parseInt(e.target.value, 10) || 0)}
                              placeholder="0"
                              className="w-16 text-center border border-slate-200 rounded px-1 py-0.5 text-xs
                                         focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 送り数プレビュー */}
          <div>
            <h2 className="text-sm font-semibold text-slate-600 mb-3">🚚 算出された送り数（個）</h2>
            <div className="overflow-x-auto">
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200 min-w-[180px]">製品</th>
                      {activeWarehouses.map((wh) => (
                        <th key={wh.code} className="px-2 py-2 text-center font-semibold text-slate-500 min-w-[64px]">{wh.code}</th>
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

      {/* ── タブ③：輸送中（前回決定分） ── */}
      {activeTab === 'transit' && (
        <div className="flex flex-col gap-6">
          <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            💡 前回の出荷確定で記録された輸送中数量です。各拠点に届いていない在庫として積載計画に反映されます。手動で修正できます。
          </p>

          {/* CSV インポート */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">CSVインポート / ダウンロード</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品×拠点のマトリクス形式（ワイド形式）で輸送中数量を一括管理できます。
              拠点列のヘッダーは<strong>拠点コードまたは拠点名</strong>のどちらでも認識します（大文字小文字も無視・列順任意）。
              CSVに含まれない製品行・拠点列の既存値は保持されます。
            </p>
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">テンプレートDL：</span>
              <button
                onClick={() => downloadCSV(
                  generateInTransitStockTemplate(products, warehouses, inTransitStock),
                  `輸送中_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`,
                )}
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                ダウンロード（現在値入り）
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <input ref={transitFileRef} type="file" accept=".csv,text/csv" onChange={handleTransitFile} className="hidden" />
              <button
                onClick={() => { transitFileRef.current?.click(); setTransitPreview(null); setTransitImported(false); }}
                className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                CSVファイルを選択
              </button>
              {transitPreview && (
                <span className="text-xs text-slate-500">
                  {transitPreview.rows.length}製品 × {Object.keys(transitPreview.rows[0]?.whQty ?? {}).length}拠点分を読み込みました
                </span>
              )}
            </div>
            {transitPreview?.warnings && transitPreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {transitPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {transitPreview && transitPreview.rows.length > 0 && (() => {
              const whCodes = Object.keys(transitPreview.rows[0]?.whQty ?? {});
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
                      {transitPreview.rows.map((row) => (
                        <tr key={row.code} className={clsx('border-t border-slate-100', !row.found && 'bg-amber-50')}>
                          <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                            <div className="font-medium text-slate-700">{row.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{row.code}</div>
                          </td>
                          {whCodes.map((wc) => {
                            const qty = row.whQty[wc] ?? 0;
                            return (
                              <td key={wc} className="px-2 py-1.5 text-center text-slate-600">
                                {qty > 0 ? <span className="font-medium text-amber-600">{qty.toLocaleString()}</span> : <span className="text-slate-300">—</span>}
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
            {transitPreview && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { importInTransitStockBulk(transitPreview.inTransitStock); setTransitImported(true); }}
                  disabled={transitImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    transitImported ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {transitImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {transitImported && <span className="text-xs text-emerald-600">輸送中数量に反映されました</span>}
              </div>
            )}
          </div>

          {/* インライン編集マトリクス */}
          <div className="overflow-x-auto">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-32">製品コード</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-32 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">製品名</th>
                    {warehouses.map((wh) => (
                      <th key={wh.code} className="px-2 py-2.5 text-center font-semibold text-slate-500 min-w-[80px]">
                        <div className="font-bold text-slate-400">{wh.code}</div>
                        <div className="text-[10px] text-slate-500 leading-tight">{wh.name.slice(0, 5)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-500 min-w-[80px]">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const rowTotal = warehouses.reduce((s, wh) => s + (inTransitStock[p.code]?.[wh.code] ?? 0), 0);
                    return (
                      <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                        <td className="px-3 py-1.5 sticky left-32 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                            <span className="font-medium text-slate-700">{p.name}</span>
                          </div>
                        </td>
                        {warehouses.map((wh) => {
                          const qty = inTransitStock[p.code]?.[wh.code] ?? 0;
                          return (
                            <td key={wh.code} className="px-1 py-1.5 text-center">
                              <input
                                type="number" min={0}
                                value={qty === 0 ? '' : qty}
                                onChange={(e) => setInTransitStock(p.code, wh.code, parseInt(e.target.value, 10) || 0)}
                                placeholder="0"
                                className="w-16 text-center border border-slate-200 rounded px-1 py-0.5 text-xs
                                           focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 bg-white"
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-1.5 text-right font-semibold text-amber-600">
                          {rowTotal > 0 ? `${rowTotal.toLocaleString()}個` : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600">合計</td>
                    {warehouses.map((wh) => {
                      const total = products.reduce((s, p) => s + (inTransitStock[p.code]?.[wh.code] ?? 0), 0);
                      return (
                        <td key={wh.code} className="px-2 py-2 text-center text-amber-600">
                          {total > 0 ? `${total.toLocaleString()}個` : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right text-amber-600">
                      {products.reduce((s, p) => s + warehouses.reduce((ss, wh) => ss + (inTransitStock[p.code]?.[wh.code] ?? 0), 0), 0) > 0
                        ? `${products.reduce((s, p) => s + warehouses.reduce((ss, wh) => ss + (inTransitStock[p.code]?.[wh.code] ?? 0), 0), 0).toLocaleString()}個`
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── タブ③：予定出荷数 ── */}
      {activeTab === 'sales' && (
        <div className="flex flex-col gap-6">
          <p className="text-xs text-slate-500 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            💡 今週、各拠点から出荷（販売）予定の数量を入力します。有効在庫 = 現在庫＋輸送中－予定出荷 として不足数を算出します。
          </p>

          {/* CSV インポート */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">CSVインポート</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品×拠点のマトリクス形式（ワイド形式）のCSVを取り込みます。拠点別在庫CSVと同じフォーマットです。
              拠点列のヘッダーは<strong>拠点コードまたは拠点名</strong>のどちらでも認識します（大文字小文字も無視・列順任意）。
              CSVに含まれない製品行・拠点列の既存値は保持されます。
            </p>
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">テンプレートDL：</span>
              <button
                onClick={() => downloadCSV(
                  generatePlannedSalesTemplate(products, warehouses, plannedSales),
                  `予定出荷数_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`,
                )}
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                ダウンロード（現在値入り）
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <input ref={salesFileRef} type="file" accept=".csv,text/csv" onChange={handleSalesFile} className="hidden" />
              <button
                onClick={() => { salesFileRef.current?.click(); setSalesPreview(null); setSalesImported(false); }}
                className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                CSVファイルを選択
              </button>
              {salesPreview && (
                <span className="text-xs text-slate-500">
                  {salesPreview.rows.length}製品 × {Object.keys(salesPreview.rows[0]?.whQty ?? {}).length}拠点分を読み込みました
                </span>
              )}
            </div>
            {salesPreview?.warnings && salesPreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {salesPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {salesPreview && salesPreview.rows.length > 0 && (() => {
              const whCodes = Object.keys(salesPreview.rows[0]?.whQty ?? {});
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
                      {salesPreview.rows.map((row) => (
                        <tr key={row.code} className={clsx('border-t border-slate-100', !row.found && 'bg-amber-50')}>
                          <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                            <div className="font-medium text-slate-700">{row.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{row.code}</div>
                          </td>
                          {whCodes.map((wc) => {
                            const qty = row.whQty[wc] ?? 0;
                            return (
                              <td key={wc} className="px-2 py-1.5 text-center">
                                {qty > 0
                                  ? <span className="font-medium text-rose-600">{qty.toLocaleString()}</span>
                                  : <span className="text-slate-300">—</span>}
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
            {salesPreview && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { importPlannedSalesBulk(salesPreview.plannedSales); setSalesImported(true); }}
                  disabled={salesImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    salesImported ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {salesImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {salesImported && <span className="text-xs text-emerald-600">予定出荷数に反映されました</span>}
              </div>
            )}
          </div>

          {/* インライン編集マトリクス */}
          <div className="overflow-x-auto">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-32">製品コード</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-32 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">製品名</th>
                    {warehouses.map((wh) => (
                      <th key={wh.code} className="px-2 py-2.5 text-center font-semibold text-slate-500 min-w-[80px]">
                        <div className="font-bold text-slate-400">{wh.code}</div>
                        <div className="text-[10px] text-slate-500 leading-tight">{wh.name.slice(0, 5)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                      <td className="px-3 py-1.5 sticky left-32 bg-white z-10 border-r border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                          <span className="font-medium text-slate-700">{p.name}</span>
                        </div>
                      </td>
                      {warehouses.map((wh) => {
                        const qty = plannedSales[p.code]?.[wh.code] ?? 0;
                        return (
                          <td key={wh.code} className="px-1 py-1.5 text-center">
                            <input
                              type="number" min={0}
                              value={qty === 0 ? '' : qty}
                              onChange={(e) => setPlannedSales(p.code, wh.code, parseInt(e.target.value, 10) || 0)}
                              placeholder="0"
                              className="w-16 text-center border border-slate-200 rounded px-1 py-0.5 text-xs
                                         focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 bg-white"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ── タブ④：配分比率 ── */}
      {activeTab === 'ratio' && (
        <div className="flex flex-col gap-6">
          <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            💡 各製品の全体在庫を各拠点に何%配分するかを設定します。横計が100%になるよう設定してください。
          </p>

          {/* CSV インポート */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">CSVインポート / ダウンロード</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品×拠点のマトリクス形式（ワイド形式）で配分比率を一括管理できます。各セルに0〜100の整数を入力してください。
              拠点列のヘッダーは<strong>拠点コードまたは拠点名</strong>のどちらでも認識します（大文字小文字も無視・列順任意）。
              CSVに含まれない製品行・拠点列の既存値は保持されます。
            </p>
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">テンプレートDL：</span>
              <button
                onClick={() => downloadCSV(
                  generateDistributionRatiosTemplate(products, warehouses, distributionRatios),
                  `配分比率_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`,
                )}
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                ダウンロード（現在値入り）
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <input ref={ratioFileRef} type="file" accept=".csv,text/csv" onChange={handleRatioFile} className="hidden" />
              <button
                onClick={() => { ratioFileRef.current?.click(); setRatioPreview(null); setRatioImported(false); }}
                className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                CSVファイルを選択
              </button>
              {ratioPreview && (
                <span className="text-xs text-slate-500">
                  {ratioPreview.rows.length}製品分を読み込みました
                </span>
              )}
            </div>
            {ratioPreview?.warnings && ratioPreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {ratioPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {ratioPreview && ratioPreview.rows.length > 0 && (() => {
              const whCodes = Object.keys(ratioPreview.rows[0]?.whRatio ?? {});
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
                        <th className="px-3 py-2 text-right font-semibold text-slate-500 min-w-[60px]">合計%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ratioPreview.rows.map((row) => {
                        const total = whCodes.reduce((s, wc) => s + (row.whRatio[wc] ?? 0), 0);
                        return (
                          <tr key={row.code} className={clsx('border-t border-slate-100', !row.found && 'bg-amber-50')}>
                            <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                              <div className="font-medium text-slate-700">{row.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{row.code}</div>
                            </td>
                            {whCodes.map((wc) => {
                              const val = row.whRatio[wc] ?? 0;
                              return (
                                <td key={wc} className="px-2 py-1.5 text-center text-slate-600">
                                  {val > 0 ? <span className="font-medium">{val}%</span> : <span className="text-slate-300">—</span>}
                                </td>
                              );
                            })}
                            <td className={clsx('px-3 py-1.5 text-right font-bold',
                              total > 100 ? 'text-red-500' : total === 100 ? 'text-emerald-600' : 'text-amber-500'
                            )}>
                              {total}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            {ratioPreview && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { importDistributionRatiosBulk(ratioPreview.ratios); setRatioImported(true); }}
                  disabled={ratioImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    ratioImported ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {ratioImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {ratioImported && <span className="text-xs text-emerald-600">配分比率に反映されました</span>}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-32">製品コード</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-32 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">製品名</th>
                    {warehouses.map((wh) => (
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
                    const rowTotal = warehouses.reduce(
                      (s, wh) => s + (distributionRatios[p.code]?.[wh.code] ?? 0), 0,
                    );
                    const isOver = rowTotal > 100;
                    return (
                      <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                        <td className="px-3 py-1.5 sticky left-32 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                            <span className="font-medium text-slate-700">{p.name}</span>
                          </div>
                        </td>
                        {warehouses.map((wh) => {
                          const ratio = distributionRatios[p.code]?.[wh.code] ?? 0;
                          return (
                            <td key={wh.code} className="px-1 py-1.5 text-center">
                              <input
                                type="number" min={0} max={100}
                                value={ratio === 0 ? '' : ratio}
                                onChange={(e) => setRatio(p.code, wh.code, parseInt(e.target.value, 10) || 0)}
                                placeholder="0"
                                className="w-14 text-center border border-slate-200 rounded px-1 py-0.5 text-xs
                                           focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
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
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200">製品</th>
                      {activeWarehouses.map((wh) => (
                        <th key={wh.code} className="px-2 py-2 text-center font-semibold text-slate-500 min-w-[64px]">{wh.code}</th>
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
                          const qty     = sendQty[p.code]?.[wh.code] ?? 0;
                          const pallets = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                          return (
                            <td key={wh.code} className="px-2 py-1.5 text-center text-slate-600">
                              {pallets > 0 ? <span className="font-medium">{pallets}枚</span> : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600">合計パレット</td>
                      {activeWarehouses.map((wh) => {
                        const plan = plans[wh.code];
                        return (
                          <td key={wh.code} className="px-2 py-2 text-center text-brand-600">
                            {plan?.totalPallets > 0 ? `${plan.totalPallets}枚` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold">必要台数</td>
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

      {/* ── タブ⑤：送り数設定 ── */}
      {activeTab === 'sendqty' && (
        <div className="flex flex-col gap-6">
          <div className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded px-3 py-2">
            💡 配分比率・在庫・生産計画から<strong className="text-blue-700">自動計算された送り数</strong>を確認し、必要に応じて直接修正できます。
            手動入力した値は青色で表示され、積載計画・出荷スケジュールに反映されます。空欄にすると自動計算値に戻ります。
          </div>

          {/* CSV インポート / エクスポート */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">CSVインポート / エクスポート</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品×拠点のマトリクス形式（ワイド形式）で送り数を一括管理できます。インポートした値は手動値として上書き保存されます。
            </p>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <button
                onClick={() => downloadCSV(
                  generateSendQtyCSV(products, warehouses, sendQtyCalc, sendQtyManual),
                  `送り数_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`,
                )}
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                📥 現在値をCSVでダウンロード
              </button>
              <input ref={sendQtyFileRef} type="file" accept=".csv,text/csv" onChange={handleSendQtyFile} className="hidden" />
              <button
                onClick={() => { sendQtyFileRef.current?.click(); setSendQtyPreview(null); setSendQtyImported(false); }}
                className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                CSVファイルを選択
              </button>
              {sendQtyPreview && (
                <span className="text-xs text-slate-500">
                  {sendQtyPreview.rows.length}製品 × {Object.keys(sendQtyPreview.rows[0]?.whQty ?? {}).length}拠点分を読み込みました
                </span>
              )}
            </div>
            {sendQtyPreview?.warnings && sendQtyPreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {sendQtyPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {sendQtyPreview && sendQtyPreview.rows.length > 0 && (() => {
              const whCodes = Object.keys(sendQtyPreview.rows[0]?.whQty ?? {});
              return (
                <div className="overflow-x-auto mb-4">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200 min-w-[160px]">製品</th>
                        {whCodes.map((wc) => (
                          <th key={wc} className="px-2 py-2 text-center font-semibold text-slate-400 min-w-[64px]">
                            <div>{wc}</div>
                            <div className="text-[10px]">{warehouses.find(w => w.code === wc)?.name.slice(0, 4)}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sendQtyPreview.rows.map((row) => (
                        <tr key={row.code} className={clsx('border-t border-slate-100', !row.found && 'bg-amber-50')}>
                          <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                            <div className="font-medium text-slate-700">{row.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{row.code}</div>
                          </td>
                          {whCodes.map((wc) => {
                            const qty = row.whQty[wc] ?? 0;
                            return (
                              <td key={wc} className="px-2 py-1.5 text-center text-slate-600">
                                {qty > 0 ? <span className="font-medium text-blue-600">{qty.toLocaleString()}</span> : <span className="text-slate-300">—</span>}
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
            {sendQtyPreview && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { importSendQtyManualBulk(sendQtyPreview.sendQty); setSendQtyImported(true); }}
                  disabled={sendQtyImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    sendQtyImported ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-blue-600 text-white hover:bg-blue-700',
                  )}
                >
                  {sendQtyImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {sendQtyImported && <span className="text-xs text-emerald-600">送り数（手動値）に反映されました</span>}
              </div>
            )}
          </div>

          {/* インライン編集マトリクス */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-600">拠点別 送り数（個）</h2>
              <button
                onClick={() => handleClear('sendqty')}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                手動値をすべてクリア
              </button>
            </div>
            <div className="overflow-x-auto">
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">製品名</th>
                      {warehouses.map((wh) => (
                        <th key={wh.code} className="px-1 py-2.5 text-center font-semibold text-slate-500 min-w-[90px]">
                          <div className="font-bold text-slate-400 text-[10px]">{wh.code}</div>
                          <div className="text-[9px] text-slate-400 leading-tight">{wh.name.slice(0, 5)}</div>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-500 min-w-[72px]">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const rowTotal = warehouses.reduce((s, wh) => s + (sendQty[p.code]?.[wh.code] ?? 0), 0);
                      const hasManual = warehouses.some((wh) => (sendQtyManual[p.code]?.[wh.code] ?? 0) > 0);
                      return (
                        <tr key={p.code} className={clsx('border-t border-slate-100 hover:bg-slate-50', hasManual && 'bg-blue-50/30')}>
                          <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                              <span className="font-medium text-slate-700">{p.name}</span>
                            </div>
                          </td>
                          {warehouses.map((wh) => {
                            const calcVal = sendQtyCalc[p.code]?.[wh.code] ?? 0;
                            const manualVal = sendQtyManual[p.code]?.[wh.code];
                            const isManual = manualVal !== undefined && manualVal > 0;
                            return (
                              <td key={wh.code} className="px-1 py-1 text-center">
                                <div className="flex flex-col gap-0.5 items-center">
                                  {/* 自動計算値（参照表示） */}
                                  <div style={{ fontSize: 9, color: '#9ca3af' }}>
                                    自動: {calcVal > 0 ? calcVal.toLocaleString() : '—'}
                                  </div>
                                  {/* 手動入力フィールド */}
                                  <input
                                    type="number" min={0}
                                    value={isManual ? manualVal : ''}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value, 10);
                                      if (isNaN(v) || e.target.value === '') {
                                        clearSendQtyManualCell(p.code, wh.code);
                                      } else {
                                        setSendQtyManual(p.code, wh.code, v);
                                      }
                                    }}
                                    placeholder={calcVal > 0 ? String(calcVal) : '0'}
                                    className={clsx(
                                      'w-16 text-center border rounded px-1 py-0.5 text-xs focus:outline-none',
                                      isManual
                                        ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold focus:ring-1 focus:ring-blue-400'
                                        : 'border-slate-200 bg-white text-slate-600 focus:border-blue-400 focus:ring-1 focus:ring-blue-300',
                                    )}
                                  />
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-right font-semibold">
                            {rowTotal > 0
                              ? <span className={hasManual ? 'text-blue-600' : 'text-slate-700'}>{rowTotal.toLocaleString()}個</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {/* 合計行 */}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600">合計</td>
                      {warehouses.map((wh) => {
                        const total = products.reduce((s, p) => s + (sendQty[p.code]?.[wh.code] ?? 0), 0);
                        const hasM   = products.some((p) => (sendQtyManual[p.code]?.[wh.code] ?? 0) > 0);
                        return (
                          <td key={wh.code} className={clsx('px-2 py-2 text-center', hasM ? 'text-blue-600' : 'text-slate-600')}>
                            {total > 0 ? `${total.toLocaleString()}個` : '—'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right text-slate-700">
                        {products.reduce((s, p) => s + warehouses.reduce((ss, wh) => ss + (sendQty[p.code]?.[wh.code] ?? 0), 0), 0) > 0
                          ? `${products.reduce((s, p) => s + warehouses.reduce((ss, wh) => ss + (sendQty[p.code]?.[wh.code] ?? 0), 0), 0).toLocaleString()}個`
                          : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              ※ 青色フィールドは手動入力値です。空欄にすると自動計算値に戻ります。手動値は積載計画・出荷スケジュールに即時反映されます。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

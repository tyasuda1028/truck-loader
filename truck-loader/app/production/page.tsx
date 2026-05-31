'use client';

import React from 'react';
import { useMemo, useState, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { calcAllPlans, calcSendQty } from '@/lib/calculations';
import { useAiRecommendation } from '@/lib/useAiRecommendation';
import { AIRecommendationPanel } from '@/components/AIRecommendationPanel';
import {
  parseProductionCSV,
  parseLocationStockCSV,
  parsePlannedSalesCSV,
  parseInTransitStockCSV,
  parseBaselineStockCSV,
  parseSendQtyCSV,
  generateProductionTemplate,
  generateLocationStockTemplate,
  generatePlannedSalesTemplate,
  generateInTransitStockTemplate,
  generateBaselineStockTemplate,
  generateSendQtyCSV,
  downloadCSV,
} from '@/lib/csv';
import type { OperatingDays, Warehouse } from '@/lib/types';
import clsx from 'clsx';

/** 名前で重複排除（最初の出現を残す） */
function dedupeByName<T extends { name: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => {
    if (seen.has(x.name)) return false;
    seen.add(x.name);
    return true;
  });
}

// ─── 週別カレンダー計算ユーティリティ (module level) ──────────────────
function _jsDayToOdIdx(jsDay: number): number { return jsDay === 0 ? 6 : jsDay - 1; }
function _isWorkingDate(
  dateStr: string,
  factoryCode: string,
  od: OperatingDays,
  nwd: import('@/lib/types').NonWorkingDates = {},
): boolean {
  // 日付指定の非稼働日（祝日など）は優先的に非稼働
  if ((nwd[factoryCode] ?? []).includes(dateStr)) return false;
  const d = new Date(dateStr + 'T12:00:00');
  return (od[factoryCode] ?? [true,true,true,true,true,false,false])[_jsDayToOdIdx(d.getDay())] ?? false;
}

/** 指定日を含む週の月曜日を返す */
function _getMonday(base: Date, offset: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + offset * 7);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES_JA = ['月', '火', '水', '木', '金', '土', '日'] as const;

/** YYYY-MM-DD → M/D */
function _fmtMD(dateStr: string): string {
  return `${parseInt(dateStr.slice(5,7))}/${parseInt(dateStr.slice(8,10))}`;
}

/** Monday Date → 7 YYYY-MM-DD strings */
function _weekDates(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** 週ラベル: "2026年5月第2週  5/4(月)〜5/10(日)" */
function _weekLabel(dates: string[]): string {
  const d0 = new Date(dates[0] + 'T12:00:00');
  const weekNum = Math.ceil(d0.getDate() / 7);
  return `${d0.getFullYear()}年${d0.getMonth()+1}月第${weekNum}週　${_fmtMD(dates[0])}(月)〜${_fmtMD(dates[6])}(日)`;
}

// ─── 器具名グループ化ヘルパー ─────────────────────────────────────
interface EquipmentGroup { equipmentName: string; products: import('@/lib/types').Product[] }

function _groupByEquipment(products: import('@/lib/types').Product[]): EquipmentGroup[] {
  const map = new Map<string, import('@/lib/types').Product[]>();
  for (const p of products) {
    const key = p.equipmentName?.trim() || '（未設定）';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return Array.from(map.entries()).map(([equipmentName, products]) => ({ equipmentName, products }));
}

/** 今週CSVを生成 */
function generateWeekCSV(
  products: { code: string; name: string }[],
  weekDates: string[],
  dailyPlan: Record<string, Record<string, number>>,
): string {
  const header = ['製品コード', '製品名', ...weekDates].join(',');
  const rows = products.map((p) =>
    [p.code, `"${p.name}"`, ...weekDates.map((d) => dailyPlan[p.code]?.[d] ?? 0)].join(',')
  );
  return '﻿' + [header, ...rows].join('\r\n');
}

type Tab = 'production' | 'location' | 'transit' | 'sales' | 'baseline' | 'sendqty';

export default function ProductionPage() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, dailyProductionPlan, baselineStock,
    locationStock, inTransitStock, plannedSales,
    operatingDays, nonWorkingDates,
    sendQtyManual,
    setProductionQty, setProductionDays, setBaseline, setLocationStock, setPlannedSales, setInTransitStock,
    setSendQtyManual, clearSendQtyManualCell, importSendQtyManualBulk, clearSendQtyManual,
    importProductionPlan, importLocationStockBulk, importPlannedSalesBulk, importInTransitStockBulk, importBaselineStockBulk,
    clearProductionPlan, clearLocationStock, clearPlannedSales, clearInTransitStock, clearBaselineStock,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<Tab>('production');
  const now = new Date();

  // AI提案（送り数の見直しなど）
  const ai = useAiRecommendation();
  const productNameMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.code, p.name])),
    [products],
  );

  // 生産計画 CSV
  const prodFileRef = useRef<HTMLInputElement>(null);
  const [templateYear,  setTemplateYear]  = useState(now.getFullYear());
  const [templateMonth, setTemplateMonth] = useState(now.getMonth() + 1);
  const [prodPreview,   setProdPreview]   = useState<ReturnType<typeof parseProductionCSV> | null>(null);
  const [prodImported,  setProdImported]  = useState(false);

  // 週ナビゲーション
  const [weekOffset, setWeekOffset] = useState(0);

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

  // 基準在庫数 CSV
  const baselineFileRef = useRef<HTMLInputElement>(null);
  const [baselinePreview,  setBaselinePreview]  = useState<ReturnType<typeof parseBaselineStockCSV> | null>(null);
  const [baselineImported, setBaselineImported] = useState(false);

  // 送り数 CSV
  const sendQtyFileRef = useRef<HTMLInputElement>(null);
  const [sendQtyPreview,  setSendQtyPreview]  = useState<ReturnType<typeof parseSendQtyCSV> | null>(null);
  const [sendQtyImported, setSendQtyImported] = useState(false);

  // ─── フィルター（タブごと） ──────────────────────────────────────────
  type FilterState = { factory: string; equipment: string; code: string; name: string };
  const emptyFilter = (): FilterState => ({ factory: '', equipment: '', code: '', name: '' });
  const [filters, setFilters] = useState<Record<Tab, FilterState>>({
    production: emptyFilter(),
    location:   emptyFilter(),
    transit:    emptyFilter(),
    sales:      emptyFilter(),
    baseline:   emptyFilter(),
    sendqty:    emptyFilter(),
  });
  const setFilter = (partial: Partial<FilterState>) =>
    setFilters((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], ...partial } }));

  const [clearFlash, setClearFlash] = useState<string | null>(null);

  // 自動計算送り数（手動上書き前）
  const sendQtyCalc = useMemo(
    () => calcSendQty(products, warehouses, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales),
    [products, warehouses, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales],
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
    () => calcAllPlans(warehouses, products, truckTypes, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales, sendQtyManual),
    [warehouses, products, truckTypes, productionPlan, baselineStock, locationStock, inTransitStock, plannedSales, sendQtyManual],
  );

  // Map from warehouse name → all warehouse objects with that name
  const warehousesByName = useMemo(() => {
    const map = new Map<string, Warehouse[]>();
    for (const wh of warehouses) {
      if (!map.has(wh.name)) map.set(wh.name, []);
      map.get(wh.name)!.push(wh);
    }
    return map;
  }, [warehouses]);

  const displayWarehouses = useMemo(
    () => dedupeByName(warehouses),
    [warehouses],
  );
  const displayActiveWarehouses = useMemo(
    () => displayWarehouses.filter(wh =>
      products.some(p =>
        (warehousesByName.get(wh.name) ?? [wh]).some(w => (baselineStock[p.code]?.[w.code] ?? 0) > 0)
      )
    ),
    [displayWarehouses, products, baselineStock, warehousesByName],
  );

  // フィルター済み製品リスト
  const allEquipmentNames = useMemo(
    () => [...new Set(products.map((p) => p.equipmentName?.trim() ?? '').filter(Boolean))].sort(),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const f = filters[activeTab];
    return products.filter((p) => {
      if (f.factory && (p.factoryCode ?? 'F001') !== f.factory) return false;
      if (f.equipment && (p.equipmentName?.trim() ?? '') !== f.equipment) return false;
      if (f.code && !p.code.toLowerCase().includes(f.code.toLowerCase())) return false;
      if (f.name && !p.name.toLowerCase().includes(f.name.toLowerCase())) return false;
      return true;
    });
  }, [products, filters, activeTab]);

  const weekMonday = useMemo(() => _getMonday(new Date(), weekOffset), [weekOffset]);
  const weekDays   = useMemo(() => _weekDates(weekMonday), [weekMonday]);

  // ─── 一括クリア ──────────────────────────────────────────────────────
  const CLEAR_LABELS: Record<Tab, string> = {
    production: '週間生産数',
    location:   '拠点別在庫数',
    transit:    '輸送中数量',
    sales:      '予定出荷数',
    baseline:   '基準在庫数',
    sendqty:    '送り数（手動値）',
  };
  const handleClear = (tab: Tab) => {
    const label = CLEAR_LABELS[tab];
    if (!window.confirm(`「${label}」のデータをすべてクリアします。よろしいですか？`)) return;
    if (tab === 'production') clearProductionPlan();
    if (tab === 'location')   clearLocationStock();
    if (tab === 'transit')    clearInTransitStock();
    if (tab === 'sales')      clearPlannedSales();
    if (tab === 'baseline')   clearBaselineStock();
    if (tab === 'sendqty')    clearSendQtyManual();
    setClearFlash(`「${label}」をクリアしました`);
    setTimeout(() => setClearFlash(null), 3000);
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

  const handleBaselineFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBaselinePreview(parseBaselineStockCSV(ev.target?.result as string, products, warehouses, baselineStock));
      setBaselineImported(false);
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
    { key: 'baseline',   label: '📊 基準在庫数' },
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
      {/* クリア完了トースト */}
      {clearFlash && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-emerald-600 text-white text-sm rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
          <span>✓</span>
          <span>{clearFlash}</span>
        </div>
      )}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">配送計画入力</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          拠点別現在庫・輸送中数量・予定出荷数・基準在庫数から不足数を算出し、生産数で補充する送り数を計算します
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
        {/* 一括クリアボタン（全タブ） */}
        <div className="ml-auto pb-1">
            <button
              onClick={() => handleClear(activeTab)}
              className="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-500 hover:border-red-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              🗑 一括クリア
            </button>
          </div>
      </div>

      {/* ─── フィルターバー（全タブ共通） ─── */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <span className="text-xs font-semibold text-slate-500 shrink-0">絞込：</span>
        {/* 配送元（工場） */}
        <select
          value={filters[activeTab].factory}
          onChange={(e) => setFilter({ factory: e.target.value })}
          className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="">配送元：すべて</option>
          {factories.map((f) => (
            <option key={f.code} value={f.code}>{f.code}　{f.name}</option>
          ))}
        </select>
        {/* 器具名 */}
        <select
          value={filters[activeTab].equipment}
          onChange={(e) => setFilter({ equipment: e.target.value })}
          className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="">器具名：すべて</option>
          {allEquipmentNames.map((eq) => (
            <option key={eq} value={eq}>{eq}</option>
          ))}
        </select>
        {/* 製品コード */}
        <input
          type="text"
          value={filters[activeTab].code}
          onChange={(e) => setFilter({ code: e.target.value })}
          placeholder="製品コードで絞込"
          className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 w-36"
        />
        {/* 製品名 */}
        <input
          type="text"
          value={filters[activeTab].name}
          onChange={(e) => setFilter({ name: e.target.value })}
          placeholder="製品名で絞込"
          className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 w-36"
        />
        {(filters[activeTab].factory || filters[activeTab].equipment || filters[activeTab].code || filters[activeTab].name) && (
          <button
            onClick={() => setFilter(emptyFilter())}
            className="text-xs px-2 py-1.5 text-slate-400 hover:text-red-500 transition-colors"
          >
            ✕ クリア
          </button>
        )}
        {filteredProducts.length < products.length && (
          <span className="text-xs text-slate-400">
            {filteredProducts.length} / {products.length} 製品を表示中
          </span>
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
              <button
                onClick={() => downloadCSV(
                  generateWeekCSV(filteredProducts, weekDays, dailyProductionPlan),
                  `今週の生産計画_${weekDays[0]}_${weekDays[6]}.csv`,
                )}
                className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
              >
                今週CSVダウンロード
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

          {/* 週ナビゲーションバー */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              className="text-xs px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              ← 前週
            </button>
            <span className="text-sm font-semibold text-slate-700 flex-1 text-center">
              {_weekLabel(weekDays)}
            </span>
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              className="text-xs px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              次週 →
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs px-3 py-1.5 border border-brand-300 text-brand-600 rounded hover:bg-brand-50 transition-colors"
              >
                今週に戻る
              </button>
            )}
          </div>

          {/* 日別入力テーブル */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs">
                  <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-28">製品コード</th>
                  <th className="px-3 py-2.5 text-left font-semibold sticky left-28 bg-slate-50 z-10 border-r border-slate-200 min-w-[140px]">製品名</th>
                  {weekDays.map((dateStr, di) => (
                    <th key={dateStr} className="px-2 py-2.5 text-center font-semibold min-w-[76px]">
                      <div>{DAY_NAMES_JA[di]}</div>
                      <div className="text-[10px] font-normal text-slate-400">{_fmtMD(dateStr)}</div>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold min-w-[80px]">週計(個)</th>
                  <th className="px-3 py-2.5 text-right font-semibold min-w-[70px]">週パレット</th>
                </tr>
              </thead>
              <tbody>
                {factories.map((factory) => {
                  const factoryProducts = filteredProducts
                    .filter((p) => (p.factoryCode ?? 'F001') === factory.code)
                    .filter((p) => weekDays.some((d) => (dailyProductionPlan[p.code]?.[d] ?? 0) > 0));
                  if (factoryProducts.length === 0) return null;
                  const factoryDayTotals = weekDays.map(d =>
                    factoryProducts.reduce((s, p) => s + (dailyProductionPlan[p.code]?.[d] ?? 0), 0)
                  );
                  const factoryWeekTotal = factoryDayTotals.reduce((s, v) => s + v, 0);
                  const factoryPallets = factoryProducts.reduce((s, p) => {
                    const wTotal = weekDays.reduce((ws, d) => ws + (dailyProductionPlan[p.code]?.[d] ?? 0), 0);
                    return s + (wTotal > 0 ? Math.ceil(wTotal / p.capacityPerPallet) : 0);
                  }, 0);
                  return (
                    <React.Fragment key={`factory-${factory.code}`}>
                      {/* 工場ヘッダー */}
                      <tr className="bg-indigo-50 border-t-2 border-indigo-100">
                        <td colSpan={2 + 7 + 2} className="px-4 py-2 sticky left-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{factory.code}</span>
                            <span className="text-sm font-semibold text-indigo-800">{factory.name}</span>
                          </div>
                        </td>
                      </tr>
                      {/* 器具名グループ */}
                      {_groupByEquipment(factoryProducts).map(({ equipmentName, products: eqProducts }) => {
                        const eqDayTotals = weekDays.map(d =>
                          eqProducts.reduce((s, p) => s + (dailyProductionPlan[p.code]?.[d] ?? 0), 0)
                        );
                        const eqWeekTotal = eqDayTotals.reduce((s, v) => s + v, 0);
                        const eqPalletsCount = eqProducts.reduce((s, p) => {
                          const qty = weekDays.reduce((ss, d) => ss + (dailyProductionPlan[p.code]?.[d] ?? 0), 0);
                          return s + (qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0);
                        }, 0);

                        return (
                          <React.Fragment key={`eq-${factory.code}-${equipmentName}`}>
                            {/* 器具名サブヘッダー */}
                            <tr className="bg-teal-50 border-t border-teal-100">
                              <td colSpan={2 + 7 + 2} className="px-6 py-1.5 sticky left-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">器具名</span>
                                  <span className="text-xs font-semibold text-teal-800">{equipmentName}</span>
                                  <span className="text-[10px] text-teal-400">{eqProducts.length}製品</span>
                                </div>
                              </td>
                            </tr>

                            {/* 製品行 */}
                            {eqProducts.map((p) => {
                              const wTotal = weekDays.reduce((s, d) => s + (dailyProductionPlan[p.code]?.[d] ?? 0), 0);
                              const wPallets = wTotal > 0 ? Math.ceil(wTotal / p.capacityPerPallet) : 0;
                              return (
                                <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                                  <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                                  <td className="px-3 py-1.5 sticky left-28 bg-white z-10 border-r border-slate-200">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                                      <span className="font-medium text-slate-700 text-xs">{p.name}</span>
                                    </div>
                                  </td>
                                  {weekDays.map((dateStr) => {
                                    const isWorking = _isWorkingDate(dateStr, p.factoryCode ?? 'F001', operatingDays, nonWorkingDates);
                                    const qty = dailyProductionPlan[p.code]?.[dateStr] ?? 0;
                                    return (
                                      <td key={dateStr} className="px-1 py-1.5 text-center">
                                        {isWorking ? (
                                          <input
                                            type="number" min={0}
                                            value={qty === 0 ? '' : qty}
                                            onChange={(e) => {
                                              const v = parseInt(e.target.value, 10) || 0;
                                              setProductionDays(p.code, { [dateStr]: v });
                                            }}
                                            placeholder="0"
                                            className="w-14 text-right border border-slate-200 rounded px-1 py-0.5 text-xs
                                                       focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
                                          />
                                        ) : (
                                          <span className="text-slate-300 text-xs">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="px-3 py-1.5 text-right font-medium text-slate-700 text-xs">
                                    {wTotal > 0 ? wTotal.toLocaleString() : <span className="text-slate-300">—</span>}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-medium text-slate-500 text-xs">
                                    {wPallets > 0 ? `${wPallets}枚` : <span className="text-slate-300">—</span>}
                                  </td>
                                </tr>
                              );
                            })}

                            {/* 器具名小計 (製品が2個以上の場合のみ) */}
                            {eqProducts.length > 1 && (
                              <tr className="border-t border-teal-100 bg-teal-50/60">
                                <td colSpan={2} className="px-6 py-1 sticky left-0 bg-teal-50/60 z-10 border-r border-slate-200 text-[10px] text-teal-600 font-semibold">
                                  {equipmentName} 小計
                                </td>
                                {eqDayTotals.map((dt, di) => (
                                  <td key={di} className="px-2 py-1 text-right text-[10px] font-bold text-teal-600">
                                    {dt > 0 ? dt.toLocaleString() : '—'}
                                  </td>
                                ))}
                                <td className="px-3 py-1 text-right text-[10px] font-bold text-teal-600">
                                  {eqWeekTotal > 0 ? eqWeekTotal.toLocaleString() : '—'}
                                </td>
                                <td className="px-3 py-1 text-right text-[10px] font-bold text-teal-500">
                                  {eqPalletsCount > 0 ? `${eqPalletsCount}枚` : '—'}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {/* 工場小計 */}
                      <tr className="border-t border-indigo-100 bg-indigo-50/60">
                        <td colSpan={2} className="px-4 py-1.5 sticky left-0 bg-indigo-50/60 z-10 border-r border-slate-200 text-xs text-indigo-500 font-semibold">{factory.name} 小計</td>
                        {factoryDayTotals.map((dt, di) => (
                          <td key={di} className="px-2 py-1.5 text-right text-xs font-bold text-indigo-600">
                            {dt > 0 ? dt.toLocaleString() : '—'}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right text-xs font-bold text-indigo-600">
                          {factoryWeekTotal > 0 ? factoryWeekTotal.toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs font-bold text-indigo-500">
                          {factoryPallets > 0 ? `${factoryPallets}枚` : '—'}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                {/* 全製品ゼロ時の空表示 */}
                {!factories.some((factory) =>
                  filteredProducts
                    .filter((p) => (p.factoryCode ?? 'F001') === factory.code)
                    .some((p) => weekDays.some((d) => (dailyProductionPlan[p.code]?.[d] ?? 0) > 0))
                ) && (
                  <tr>
                    <td colSpan={2 + 7 + 2} className="px-4 py-8 text-center text-slate-400 text-sm">
                      この週の生産データがありません。CSVからインポートするか、値を入力してください。
                    </td>
                  </tr>
                )}
                {/* 総合計 */}
                {(() => {
                  const grandDayTotals = weekDays.map(d =>
                    filteredProducts.reduce((s, p) => s + (dailyProductionPlan[p.code]?.[d] ?? 0), 0)
                  );
                  const grandTotal = grandDayTotals.reduce((s, v) => s + v, 0);
                  const grandPallets = filteredProducts.reduce((s, p) => {
                    const wt = weekDays.reduce((ws, d) => ws + (dailyProductionPlan[p.code]?.[d] ?? 0), 0);
                    return s + (wt > 0 ? Math.ceil(wt / p.capacityPerPallet) : 0);
                  }, 0);
                  return (
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                      <td colSpan={2} className="px-4 py-2 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 text-slate-600">総合計</td>
                      {grandDayTotals.map((dt, di) => (
                        <td key={di} className="px-2 py-2 text-right text-brand-600">
                          {dt > 0 ? dt.toLocaleString() : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right text-brand-600">
                        {grandTotal > 0 ? grandTotal.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500">
                        {grandPallets > 0 ? `${grandPallets}枚` : '—'}
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
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-32">製品コード</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-32 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">製品名</th>
                    {displayWarehouses.map((wh) => (
                      <th key={wh.name} className="px-2 py-1.5 text-center font-semibold text-slate-500 min-w-[72px]">
                        <div className="font-bold text-slate-500 text-[10px]">{wh.name.slice(0, 6)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = filteredProducts.filter((p) =>
                      warehouses.some((wh) => (locationStock[p.code]?.[wh.code] ?? 0) > 0)
                    );
                    if (rows.length === 0) return (
                      <tr><td colSpan={2 + displayWarehouses.length} className="px-4 py-8 text-center text-slate-400 text-sm">在庫データがありません。CSVからインポートするか、値を入力してください。</td></tr>
                    );
                    return _groupByEquipment(rows).map(({ equipmentName, products: eqProducts }) => (
                      <React.Fragment key={`loc-eq-${equipmentName}`}>
                        <tr className="bg-teal-50 border-t border-teal-100">
                          <td colSpan={2 + displayWarehouses.length} className="px-4 py-1.5 sticky left-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">器具名</span>
                              <span className="text-xs font-semibold text-teal-800">{equipmentName}</span>
                              <span className="text-[10px] text-teal-400">{eqProducts.length}製品</span>
                            </div>
                          </td>
                        </tr>
                        {eqProducts.map((p) => (
                          <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                            <td className="px-3 py-1.5 sticky left-32 bg-white z-10 border-r border-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                                <span className="font-medium text-slate-700">{p.name}</span>
                              </div>
                            </td>
                            {displayWarehouses.map((wh) => {
                              const stock = (warehousesByName.get(wh.name) ?? [wh]).reduce(
                                (s, w) => s + (locationStock[p.code]?.[w.code] ?? 0), 0
                              );
                              const targetCode = (warehousesByName.get(wh.name) ?? [wh])[0].code;
                              return (
                                <td key={wh.name} className="px-1 py-1.5 text-center">
                                  <input
                                    type="number" min={0}
                                    value={stock === 0 ? '' : stock}
                                    onChange={(e) => setLocationStock(p.code, targetCode, parseInt(e.target.value, 10) || 0)}
                                    placeholder="0"
                                    className="w-16 text-center border border-slate-200 rounded px-1 py-0.5 text-xs
                                               focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ));
                  })()}
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
                      {displayActiveWarehouses.map((wh) => (
                        <th key={wh.name} className="px-2 py-2 text-center font-semibold text-slate-500 min-w-[64px]">{wh.name}</th>
                      ))}
                      <th className="px-3 py-2 text-right font-semibold text-slate-500 min-w-[80px]">合計送り数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const total = displayActiveWarehouses.reduce((s, wh) =>
                        s + (warehousesByName.get(wh.name) ?? [wh]).reduce((ss, w) => ss + (sendQty[p.code]?.[w.code] ?? 0), 0), 0);
                      return (
                        <tr key={p.code} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
                              {p.name}
                            </div>
                          </td>
                          {displayActiveWarehouses.map((wh) => {
                            const qty = (warehousesByName.get(wh.name) ?? [wh]).reduce(
                              (s, w) => s + (sendQty[p.code]?.[w.code] ?? 0), 0
                            );
                            return (
                              <td key={wh.name} className="px-2 py-1.5 text-center text-slate-600">
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

          {/* AI提案：送り数の見直し・警告など */}
          <AIRecommendationPanel
            data={ai.data}
            loading={ai.loading}
            error={ai.error}
            onGenerate={ai.generate}
            onApplyAdjustment={(pc, wc, qty) => setSendQtyManual(pc, wc, qty)}
            productNames={productNameMap}
          />

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
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-32">製品コード</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-32 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">製品名</th>
                    {displayWarehouses.map((wh) => (
                      <th key={wh.name} className="px-2 py-1.5 text-center font-semibold text-slate-500 min-w-[72px]">
                        <div className="font-bold text-slate-500 text-[10px]">{wh.name.slice(0, 6)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-slate-500 min-w-[80px] bg-slate-50">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = filteredProducts.filter((p) =>
                      warehouses.some((wh) => (inTransitStock[p.code]?.[wh.code] ?? 0) > 0)
                    );
                    if (rows.length === 0) return (
                      <tr><td colSpan={2 + displayWarehouses.length + 1} className="px-4 py-8 text-center text-slate-400 text-sm">輸送中データがありません。CSVからインポートするか、値を入力してください。</td></tr>
                    );
                    return _groupByEquipment(rows).map(({ equipmentName, products: eqProducts }) => (
                      <React.Fragment key={`transit-eq-${equipmentName}`}>
                        <tr className="bg-teal-50 border-t border-teal-100">
                          <td colSpan={2 + displayWarehouses.length + 1} className="px-4 py-1.5 sticky left-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">器具名</span>
                              <span className="text-xs font-semibold text-teal-800">{equipmentName}</span>
                              <span className="text-[10px] text-teal-400">{eqProducts.length}製品</span>
                            </div>
                          </td>
                        </tr>
                        {eqProducts.map((p) => {
                          const rowTotal = displayWarehouses.reduce((s, wh) =>
                            s + (warehousesByName.get(wh.name) ?? [wh]).reduce((ss, w) => ss + (inTransitStock[p.code]?.[w.code] ?? 0), 0), 0);
                          return (
                            <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                              <td className="px-3 py-1.5 sticky left-32 bg-white z-10 border-r border-slate-200">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                                  <span className="font-medium text-slate-700">{p.name}</span>
                                </div>
                              </td>
                              {displayWarehouses.map((wh) => {
                                const qty = (warehousesByName.get(wh.name) ?? [wh]).reduce(
                                  (s, w) => s + (inTransitStock[p.code]?.[w.code] ?? 0), 0
                                );
                                const targetCode = (warehousesByName.get(wh.name) ?? [wh])[0].code;
                                return (
                                  <td key={wh.name} className="px-1 py-1.5 text-center">
                                    <input
                                      type="number" min={0}
                                      value={qty === 0 ? '' : qty}
                                      onChange={(e) => setInTransitStock(p.code, targetCode, parseInt(e.target.value, 10) || 0)}
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
                      </React.Fragment>
                    ));
                  })()}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600">合計</td>
                    {displayWarehouses.map((wh) => {
                      const total = filteredProducts.reduce((s, p) =>
                        s + (warehousesByName.get(wh.name) ?? [wh]).reduce((ss, w) => ss + (inTransitStock[p.code]?.[w.code] ?? 0), 0), 0);
                      return (
                        <td key={wh.name} className="px-2 py-2 text-center text-amber-600">
                          {total > 0 ? `${total.toLocaleString()}個` : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right text-amber-600">
                      {(() => {
                        const grand = filteredProducts.reduce((s, p) => s + displayWarehouses.reduce((ss, wh) =>
                          ss + (warehousesByName.get(wh.name) ?? [wh]).reduce((sss, w) => sss + (inTransitStock[p.code]?.[w.code] ?? 0), 0), 0), 0);
                        return grand > 0 ? `${grand.toLocaleString()}個` : '—';
                      })()}
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
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-32">製品コード</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-32 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">製品名</th>
                    {displayWarehouses.map((wh) => (
                      <th key={wh.name} className="px-2 py-1.5 text-center font-semibold text-slate-500 min-w-[72px]">
                        <div className="font-bold text-slate-500 text-[10px]">{wh.name.slice(0, 6)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = filteredProducts.filter((p) =>
                      warehouses.some((wh) => (plannedSales[p.code]?.[wh.code] ?? 0) > 0)
                    );
                    if (rows.length === 0) return (
                      <tr><td colSpan={2 + displayWarehouses.length} className="px-4 py-8 text-center text-slate-400 text-sm">予定出荷データがありません。CSVからインポートするか、値を入力してください。</td></tr>
                    );
                    return _groupByEquipment(rows).map(({ equipmentName, products: eqProducts }) => (
                      <React.Fragment key={`sales-eq-${equipmentName}`}>
                        <tr className="bg-teal-50 border-t border-teal-100">
                          <td colSpan={2 + displayWarehouses.length} className="px-4 py-1.5 sticky left-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">器具名</span>
                              <span className="text-xs font-semibold text-teal-800">{equipmentName}</span>
                              <span className="text-[10px] text-teal-400">{eqProducts.length}製品</span>
                            </div>
                          </td>
                        </tr>
                        {eqProducts.map((p) => (
                          <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                            <td className="px-3 py-1.5 sticky left-32 bg-white z-10 border-r border-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                                <span className="font-medium text-slate-700">{p.name}</span>
                              </div>
                            </td>
                            {displayWarehouses.map((wh) => {
                              const qty = (warehousesByName.get(wh.name) ?? [wh]).reduce(
                                (s, w) => s + (plannedSales[p.code]?.[w.code] ?? 0), 0
                              );
                              const targetCode = (warehousesByName.get(wh.name) ?? [wh])[0].code;
                              return (
                                <td key={wh.name} className="px-1 py-1.5 text-center">
                                  <input
                                    type="number" min={0}
                                    value={qty === 0 ? '' : qty}
                                    onChange={(e) => setPlannedSales(p.code, targetCode, parseInt(e.target.value, 10) || 0)}
                                    placeholder="0"
                                    className="w-16 text-center border border-slate-200 rounded px-1 py-0.5 text-xs
                                               focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 bg-white"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ── タブ④：基準在庫数 ── */}
      {activeTab === 'baseline' && (
        <div className="flex flex-col gap-6">
          <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            💡 各製品について、各拠点で維持したい目標在庫数（個）を設定します。現在庫がこの基準を下回った分（不足数）を生産数から補充します。
          </p>

          {/* CSV インポート */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-1">CSVインポート / ダウンロード</h2>
            <p className="text-xs text-slate-500 mb-4">
              製品×拠点のマトリクス形式（ワイド形式）で基準在庫数を一括管理できます。各セルに0以上の整数（個数）を入力してください。
              拠点列のヘッダーは<strong>拠点コードまたは拠点名</strong>のどちらでも認識します（大文字小文字も無視・列順任意）。
              CSVに含まれない製品行・拠点列の既存値は保持されます。
            </p>
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">テンプレートDL：</span>
              <button
                onClick={() => downloadCSV(
                  generateBaselineStockTemplate(products, warehouses, baselineStock),
                  `基準在庫数_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`,
                )}
                className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                ダウンロード（現在値入り）
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <input ref={baselineFileRef} type="file" accept=".csv,text/csv" onChange={handleBaselineFile} className="hidden" />
              <button
                onClick={() => { baselineFileRef.current?.click(); setBaselinePreview(null); setBaselineImported(false); }}
                className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                CSVファイルを選択
              </button>
              {baselinePreview && (
                <span className="text-xs text-slate-500">
                  {baselinePreview.rows.length}製品分を読み込みました
                </span>
              )}
            </div>
            {baselinePreview?.warnings && baselinePreview.warnings.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                {baselinePreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {baselinePreview && baselinePreview.rows.length > 0 && (() => {
              const whCodes = Object.keys(baselinePreview.rows[0]?.whQty ?? {});
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
                        <th className="px-3 py-2 text-right font-semibold text-slate-500 min-w-[60px]">合計(個)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baselinePreview.rows.map((row) => {
                        const total = whCodes.reduce((s, wc) => s + (row.whQty[wc] ?? 0), 0);
                        return (
                          <tr key={row.code} className={clsx('border-t border-slate-100', !row.found && 'bg-amber-50')}>
                            <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                              <div className="font-medium text-slate-700">{row.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{row.code}</div>
                            </td>
                            {whCodes.map((wc) => {
                              const val = row.whQty[wc] ?? 0;
                              return (
                                <td key={wc} className="px-2 py-1.5 text-center text-slate-600">
                                  {val > 0 ? <span className="font-medium">{val.toLocaleString()}</span> : <span className="text-slate-300">—</span>}
                                </td>
                              );
                            })}
                            <td className="px-3 py-1.5 text-right font-bold text-slate-600">
                              {total.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            {baselinePreview && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { importBaselineStockBulk(baselinePreview.baseline); setBaselineImported(true); }}
                  disabled={baselineImported}
                  className={clsx(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    baselineImported ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {baselineImported ? '✓ インポート済み' : 'インポートする'}
                </button>
                {baselineImported && <span className="text-xs text-emerald-600">基準在庫数に反映されました</span>}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-32">製品コード</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-32 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">製品名</th>
                    {displayWarehouses.map((wh) => (
                      <th key={wh.code} className="px-2 py-1.5 text-center font-semibold text-slate-500 min-w-[72px]">
                        <div className="font-bold text-slate-500 text-[10px]">{wh.code}</div>
                        <div className="text-[9px] text-slate-400 leading-tight">{wh.name.slice(0, 4)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-slate-500 min-w-[60px] bg-slate-50">合計(個)</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // 週間生産数に入力がある製品のみ表示
                    const baselineProducts = filteredProducts.filter(
                      (p) => (productionPlan[p.code] ?? 0) > 0,
                    );
                    if (baselineProducts.length === 0) return (
                      <tr><td colSpan={2 + displayWarehouses.length + 1} className="px-4 py-8 text-center text-slate-400 text-sm">
                        週間生産数が入力されている製品がありません。先に週間生産数タブで数量を入力してください。
                      </td></tr>
                    );
                    return baselineProducts.map((p) => {
                    const rowTotal = displayWarehouses.reduce(
                      (s, wh) => s + (baselineStock[p.code]?.[wh.code] ?? 0), 0,
                    );
                    return (
                      <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                        <td className="px-3 py-1.5 sticky left-32 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                            <span className="font-medium text-slate-700">{p.name}</span>
                          </div>
                        </td>
                        {displayWarehouses.map((wh) => {
                          const baseline = baselineStock[p.code]?.[wh.code] ?? 0;
                          return (
                            <td key={wh.code} className="px-1 py-1.5 text-center">
                              <input
                                type="number" min={0}
                                value={baseline === 0 ? '' : baseline}
                                onChange={(e) => setBaseline(p.code, wh.code, parseInt(e.target.value, 10) || 0)}
                                placeholder="0"
                                className="w-16 text-center border border-slate-200 rounded px-1 py-0.5 text-xs
                                           focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-1.5 text-right font-bold text-slate-600">
                          {rowTotal.toLocaleString()}
                        </td>
                      </tr>
                    );
                  });
                  })()}
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
                      {displayActiveWarehouses.map((wh) => (
                        <th key={wh.name} className="px-2 py-2 text-center font-semibold text-slate-500 min-w-[64px]">{wh.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.code} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
                            {p.name}
                          </div>
                        </td>
                        {displayActiveWarehouses.map((wh) => {
                          const qty = (warehousesByName.get(wh.name) ?? [wh]).reduce(
                            (s, w) => s + (sendQty[p.code]?.[w.code] ?? 0), 0
                          );
                          const pallets = qty > 0 ? Math.ceil(qty / p.capacityPerPallet) : 0;
                          return (
                            <td key={wh.name} className="px-2 py-1.5 text-center text-slate-600">
                              {pallets > 0 ? <span className="font-medium">{pallets}枚</span> : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600">合計パレット</td>
                      {displayActiveWarehouses.map((wh) => {
                        const plan = plans[wh.name];
                        return (
                          <td key={wh.name} className="px-2 py-2 text-center text-brand-600">
                            {plan?.totalPallets > 0 ? `${plan.totalPallets}枚` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-3 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold">必要台数</td>
                      {displayActiveWarehouses.map((wh) => {
                        const plan = plans[wh.name];
                        return (
                          <td key={wh.name} className="px-2 py-2 text-center text-slate-700 font-semibold">
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
            💡 基準在庫数・在庫・生産計画から<strong className="text-blue-700">自動計算された送り数</strong>を確認し、必要に応じて直接修正できます。
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

          {/* インライン編集マトリクス（工場別） */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-600">工場別 送り数（個）</h2>
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
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 w-32">製品コード</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-32 bg-slate-50 z-10 border-r border-slate-200 min-w-[160px]">製品名</th>
                    {displayWarehouses.map((wh) => (
                      <th key={wh.name} className="px-2 py-1.5 text-center font-semibold text-slate-500 min-w-[72px]">
                        <div className="font-bold text-slate-500 text-[10px]">{wh.name.slice(0, 6)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-slate-500 min-w-[72px] bg-slate-50">合計</th>
                  </tr>
                </thead>
                  <tbody>
                    {factories.map((factory) => {
                      const factoryProducts = filteredProducts
                        .filter((p) => (p.factoryCode ?? 'F001') === factory.code)
                        .filter((p) =>
                          warehouses.some((wh) => (sendQtyManual[p.code]?.[wh.code] ?? 0) > 0) ||
                          warehouses.some((wh) => (sendQtyCalc[p.code]?.[wh.code] ?? 0) > 0)
                        );
                      if (factoryProducts.length === 0) return null;
                      const factoryTotal = displayWarehouses.reduce(
                        (s, wh) => s + factoryProducts.reduce((ss, p) =>
                          ss + (warehousesByName.get(wh.name) ?? [wh]).reduce((sss, w) => sss + (sendQty[p.code]?.[w.code] ?? 0), 0), 0), 0,
                      );
                      return (
                        <React.Fragment key={factory.code}>
                          {/* 工場ヘッダー行 */}
                          <tr className="bg-indigo-50 border-t-2 border-indigo-100">
                            <td colSpan={2 + displayWarehouses.length + 1} className="px-4 py-2 sticky left-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{factory.code}</span>
                                <span className="text-sm font-semibold text-indigo-800">{factory.name}</span>
                                <span className="text-xs text-indigo-400">配送元</span>
                              </div>
                            </td>
                          </tr>
                          {/* 製品行（器具名グループ） */}
                          {_groupByEquipment(factoryProducts).map(({ equipmentName, products: eqProducts }) => (
                            <React.Fragment key={`sq-eq-${factory.code}-${equipmentName}`}>
                              <tr className="bg-teal-50 border-t border-teal-100">
                                <td colSpan={2 + displayWarehouses.length + 1} className="px-6 py-1.5 sticky left-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">器具名</span>
                                    <span className="text-xs font-semibold text-teal-800">{equipmentName}</span>
                                    <span className="text-[10px] text-teal-400">{eqProducts.length}製品</span>
                                  </div>
                                </td>
                              </tr>
                              {eqProducts.map((p) => {
                                const rowTotal = displayWarehouses.reduce((s, wh) =>
                                  s + (warehousesByName.get(wh.name) ?? [wh]).reduce((ss, w) => ss + (sendQty[p.code]?.[w.code] ?? 0), 0), 0);
                                const hasManual = displayWarehouses.some((wh) =>
                                  (warehousesByName.get(wh.name) ?? [wh]).some(w => (sendQtyManual[p.code]?.[w.code] ?? 0) > 0));
                                return (
                                  <tr key={p.code} className={clsx('border-t border-slate-100 hover:bg-slate-50', hasManual && 'bg-blue-50/30')}>
                                    <td className="px-3 py-1.5 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[11px] text-slate-500">{p.code}</td>
                                    <td className="px-3 py-1.5 sticky left-32 bg-white z-10 border-r border-slate-200">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0" style={{ background: p.color }} />
                                        <span className="font-medium text-slate-700">{p.name}</span>
                                      </div>
                                    </td>
                                    {displayWarehouses.map((wh) => {
                                      const whCodes = warehousesByName.get(wh.name) ?? [wh];
                                      const firstCode = whCodes[0].code;
                                      const calcVal = whCodes.reduce((s, w) => s + (sendQtyCalc[p.code]?.[w.code] ?? 0), 0);
                                      const manualVal = whCodes.map(w => sendQtyManual[p.code]?.[w.code]).find(v => v !== undefined && v > 0);
                                      const isManual = manualVal !== undefined;
                                      return (
                                        <td key={wh.name} className="px-1 py-1 text-center">
                                          <div className="flex flex-col gap-0.5 items-center">
                                            <div style={{ fontSize: 9, color: '#9ca3af' }}>
                                              自動: {calcVal > 0 ? calcVal.toLocaleString() : '—'}
                                            </div>
                                            <input
                                              type="number" min={0}
                                              value={isManual ? manualVal : ''}
                                              onChange={(e) => {
                                                const v = parseInt(e.target.value, 10);
                                                if (isNaN(v) || e.target.value === '') {
                                                  whCodes.forEach(w => clearSendQtyManualCell(p.code, w.code));
                                                } else {
                                                  setSendQtyManual(p.code, firstCode, v);
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
                            </React.Fragment>
                          ))}
                          {/* 工場小計行 */}
                          <tr key={`sub-${factory.code}`} className="border-t border-indigo-100 bg-indigo-50/60">
                            <td colSpan={2} className="px-4 py-1.5 sticky left-0 bg-indigo-50/60 z-10 border-r border-slate-200 text-xs text-indigo-500 font-semibold">
                              {factory.name} 小計
                            </td>
                            {displayWarehouses.map((wh) => {
                              const whCodes = warehousesByName.get(wh.name) ?? [wh];
                              const subtotal = factoryProducts.reduce((s, p) =>
                                s + whCodes.reduce((ss, w) => ss + (sendQty[p.code]?.[w.code] ?? 0), 0), 0);
                              const hasM = factoryProducts.some((p) =>
                                whCodes.some(w => (sendQtyManual[p.code]?.[w.code] ?? 0) > 0));
                              return (
                                <td key={wh.name} className={clsx('px-2 py-1.5 text-center text-xs font-bold', hasM ? 'text-blue-600' : 'text-indigo-600')}>
                                  {subtotal > 0 ? `${subtotal.toLocaleString()}個` : '—'}
                                </td>
                              );
                            })}
                            <td className="px-3 py-1.5 text-right text-xs font-bold text-indigo-600">
                              {factoryTotal > 0 ? `${factoryTotal.toLocaleString()}個` : '—'}
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                    {/* 送り数ゼロ時の空表示 */}
                    {!factories.some((factory) =>
                      filteredProducts
                        .filter((p) => (p.factoryCode ?? 'F001') === factory.code)
                        .some((p) =>
                          warehouses.some((wh) => (sendQtyManual[p.code]?.[wh.code] ?? 0) > 0) ||
                          warehouses.some((wh) => (sendQtyCalc[p.code]?.[wh.code] ?? 0) > 0)
                        )
                    ) && (
                      <tr>
                        <td colSpan={2 + displayWarehouses.length + 1} className="px-4 py-8 text-center text-slate-400 text-sm">
                          送り数データがありません。基準在庫数と生産計画を設定してください。
                        </td>
                      </tr>
                    )}
                    {/* 総合計行 */}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td colSpan={2} className="px-3 py-2 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 text-slate-600">総合計</td>
                      {displayWarehouses.map((wh) => {
                        const whCodes = warehousesByName.get(wh.name) ?? [wh];
                        const total = filteredProducts.reduce((s, p) =>
                          s + whCodes.reduce((ss, w) => ss + (sendQty[p.code]?.[w.code] ?? 0), 0), 0);
                        const hasM = filteredProducts.some((p) =>
                          whCodes.some(w => (sendQtyManual[p.code]?.[w.code] ?? 0) > 0));
                        return (
                          <td key={wh.name} className={clsx('px-2 py-2 text-center', hasM ? 'text-blue-600' : 'text-slate-600')}>
                            {total > 0 ? `${total.toLocaleString()}個` : '—'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right text-slate-700">
                        {(() => {
                          const grand = filteredProducts.reduce((s, p) => s + displayWarehouses.reduce((ss, wh) =>
                            ss + (warehousesByName.get(wh.name) ?? [wh]).reduce((sss, w) => sss + (sendQty[p.code]?.[w.code] ?? 0), 0), 0), 0);
                          return grand > 0 ? `${grand.toLocaleString()}個` : '—';
                        })()}
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

'use client';

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import type { Factory, Location, Product, Warehouse, PalletType, CalcSettings } from '@/lib/types';
import { getCalcSettings, saveCalcSettings } from '@/lib/appSettings';
import { parseProductsCSV, generateProductsTemplate, downloadCSV } from '@/lib/csv';
import { buildEquipmentColorMap, buildProductColors, PRODUCT_PALETTE } from '@/lib/productColors';
import * as db from '@/lib/db';
import { BiometricLockSetting } from '@/components/BiometricLockSetting';
import { toast } from '@/components/Toast';
import { useDemo, notifyDemoBlocked } from '@/lib/demo';
import clsx from 'clsx';

type Tab = 'products' | 'locations' | 'pallets' | 'trucks' | 'operating' | 'calc';

export default function SettingsPage() {
  const {
    locations, factories, products, warehouses, truckTypes, palletTypes,
    operatingDays, setOperatingDay,
    nonWorkingDates, toggleNonWorkingDate,
    addLocation, updateLocation, removeLocation,
    addProduct, updateProduct, removeProduct,
    addTruckType, updateTruckType, removeTruckType,
    addPalletType, updatePalletType, removePalletType,
    upsertProducts,
    resetToDefaults,
  } = useAppStore();

  // デモ（閲覧専用）。プライマリの追加/取込/保存操作を無効化する。
  const demo = useDemo();

  // 器具名ごとの色マップ・製品コードごとの色マップ（描画用）
  const equipmentColorMap = useMemo(() => buildEquipmentColorMap(products), [products]);
  const productColors     = useMemo(() => buildProductColors(products), [products]);

  const [tab, setTab] = useState<Tab>('products');

  // 製品フィルター
  const [filterEquipmentName, setFilterEquipmentName] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // 検索サジェスト候補（入力中に表示）
  const searchSuggestions = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.equipmentName?.toLowerCase() ?? '').includes(q)
      )
      .slice(0, 10);
  }, [filterText, products]);

  // 重複コード検出
  const duplicateCodes = useMemo(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const p of products) {
      if (seen.has(p.code)) dups.add(p.code);
      else seen.add(p.code);
    }
    return dups;
  }, [products]);

  const [deduping, setDeduping] = useState(false);
  const [dedupResult, setDedupResult] = useState<string | null>(null);

  const handleDeduplicateProducts = useCallback(async () => {
    if (notifyDemoBlocked()) return;
    setDeduping(true);
    setDedupResult(null);
    try {
      const removed = await db.deduplicateProducts();
      // ストアを再ロード
      await useAppStore.getState().loadFromDB();
      setDedupResult(removed > 0 ? `${removed} 種類の重複を削除しました。` : '重複なし（変更なし）');
    } catch (err) {
      setDedupResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeduping(false);
    }
  }, []);

  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingPallet, setEditingPallet] = useState<PalletType | null>(null);
  const [editingTruck, setEditingTruck] = useState<import('@/lib/types').TruckType | null>(null);
  const [truckOpError, setTruckOpError] = useState<string | null>(null);

  // 製品CSV インポート用
  const prodCsvRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseProductsCSV> | null>(null);
  const [csvImported, setCsvImported] = useState(false);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [productOpError, setProductOpError] = useState<string | null>(null);

  // 製品の新規追加用空テンプレート
  const newProduct = (): Product => ({
    code: '', name: '', capacityPerPallet: 40, palletType: 'P03', color: PRODUCT_PALETTE[0],
    factoryCode: factories[0]?.code ?? 'F001',
    allowStackOnTop: true,
  });

  // 場所マスターの新規追加用空テンプレート（既定=出荷先）
  const newLocation = (): Location => ({
    code: '', name: '', role: 'warehouse', truckType: 'T06',
  });

  // パレット型の新規追加用空テンプレート
  const newPalletType = (): PalletType => ({
    code: '', name: '', widthMM: 1100, depthMM: 1100, heightMM: 144, maxWeightKg: 1000, loadedHeightMM: 1200,
  });

  // トラック型の新規追加用空テンプレート（荷台内寸のみ）
  const newTruckType = (): import('@/lib/types').TruckType => ({
    code: '', name: '', widthMM: 2100, depthMM: 5200, heightMM: 2300,
  });

  const handleSaveTruck = (truck: import('@/lib/types').TruckType) => {
    setTruckOpError(null);
    const exists = truckTypes.some((t) => t.code === truck.code);
    if (exists) updateTruckType(truck);
    else addTruckType(truck);
    setEditingTruck(null);
  };

  const handleSaveLocation = () => {
    if (!editingLocation || !editingLocation.code.trim() || !editingLocation.name.trim()) return;
    // 出荷先(warehouse/both)はドックトラック必須
    const needsTruck = editingLocation.role === 'warehouse' || editingLocation.role === 'both';
    const loc: Location = needsTruck
      ? editingLocation
      : { ...editingLocation, truckType: undefined, priority: undefined, leadTimeDays: undefined };
    const exists = locations.some((l) => l.code === loc.code);
    if (exists) updateLocation(loc);
    else addLocation(loc);
    setEditingLocation(null);
  };

  const [productSaving, setProductSaving] = useState(false);

  const handleSaveProduct = async () => {
    if (!editingProduct || !editingProduct.code.trim() || !editingProduct.name.trim()) return;
    setProductOpError(null);
    setProductSaving(true);

    // 器具名から色を自動計算（新規器具名はパレット末尾の次の色を割り当て）
    const eqKey = editingProduct.equipmentName?.trim() ?? '';
    const currentEqMap = buildEquipmentColorMap(products);
    let autoColor = eqKey ? (currentEqMap[eqKey] ?? undefined) : undefined;
    if (!autoColor && eqKey) {
      const nextIdx = Object.keys(currentEqMap).length;
      autoColor = PRODUCT_PALETTE[nextIdx % PRODUCT_PALETTE.length];
    }
    const productToSave = { ...editingProduct, color: autoColor ?? '#94a3b8' };

    const exists = products.some((p) => p.code === editingProduct.code);
    try {
      if (exists) await updateProduct(productToSave);
      else await addProduct(productToSave);
      setEditingProduct(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // カラム不足エラーの場合はマイグレーション案内を付加
      const isMissingCol = msg.includes('column') || msg.includes('PGRST204');
      setProductOpError(
        isMissingCol
          ? `保存に失敗しました（DBカラム不足）: ${msg}\n\n` +
            `【対処法】Supabase Dashboard → SQL Editor で supabase/migrations/0001_add_product_fields.sql の内容を実行してください。`
          : `保存に失敗しました: ${msg}`
      );
    } finally {
      setProductSaving(false);
    }
  };

  const handleRemoveProduct = async (code: string) => {
    const target = products.find((p) => p.code === code);
    if (!window.confirm(`製品「${target?.name ?? code}」を削除します。よろしいですか？`)) return;
    setProductOpError(null);
    try {
      await removeProduct(code);
      toast(`製品「${target?.name ?? code}」を削除しました`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProductOpError(`削除に失敗しました: ${msg}`);
    }
  };

  const handleSavePallet = () => {
    if (!editingPallet || !editingPallet.code.trim() || !editingPallet.name.trim()) return;
    const exists = palletTypes.some((p) => p.code === editingPallet.code);
    if (exists) updatePalletType(editingPallet);
    else addPalletType(editingPallet);
    setEditingPallet(null);
  };

  const handleProductCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvPreview(parseProductsCSV(text, palletTypes, products));
      setCsvImported(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleProductCsvImport = async () => {
    if (notifyDemoBlocked()) return;
    if (!csvPreview) return;
    setCsvImportError(null);
    setCsvImporting(true);
    try {
      await upsertProducts(csvPreview.products);
      setCsvImported(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCsvImportError(msg);
      setCsvImported(false);
    } finally {
      setCsvImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">マスター設定</h1>
          <p className="text-sm text-slate-500 mt-0.5">製品・拠点のマスターデータを管理します</p>
        </div>
        {!demo && (
          <button
            onClick={() => {
              if (!window.confirm('画面の表示をデフォルト状態に戻します。よろしいですか？\n（保存済みデータは再読み込みで復元されます）')) return;
              resetToDefaults();
              toast('デフォルトにリセットしました', 'info');
            }}
            className="text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-300
                       px-3 py-1.5 rounded transition-colors"
          >
            デフォルトにリセット
          </button>
        )}
      </div>

      {/* Face ID ロック（ネイティブのみ） */}
      <div className="mb-6">
        <BiometricLockSetting />
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {([
          { key: 'products',   label: '📦 製品マスター' },
          { key: 'locations',  label: '📍 場所マスター' },
          { key: 'pallets',    label: '🪵 パレット型' },
          { key: 'trucks',     label: '🚚 トラックマスター' },
          { key: 'operating',  label: '📅 稼働日マスター' },
          { key: 'calc',       label: '⚖️ 計算設定' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 計算設定 ── */}
      {tab === 'calc' && <CalcSettingsPanel />}

      {/* ── 工場マスター ── */}
      {tab === 'locations' && (
        <div>
          {!demo && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setEditingLocation(newLocation())}
                className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
              >
                + 場所を追加
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-left font-semibold">コード</th>
                  <th className="px-4 py-2.5 text-left font-semibold">名称</th>
                  <th className="px-4 py-2.5 text-left font-semibold">役割</th>
                  <th className="px-4 py-2.5 text-left font-semibold">ドック車種</th>
                  <th className="px-4 py-2.5 text-left font-semibold">製品数</th>
                  <th className="px-4 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => {
                  const isFactory = l.role === 'factory' || l.role === 'both';
                  const isWarehouse = l.role === 'warehouse' || l.role === 'both';
                  const productCount = isFactory
                    ? products.filter((p) => (p.factoryCode ?? 'F001') === l.code).length
                    : 0;
                  const roleLabel = l.role === 'both' ? '生産元＋出荷先' : l.role === 'factory' ? '生産元' : '出荷先';
                  const roleCls = l.role === 'both' ? 'bg-purple-100 text-purple-700' : l.role === 'factory' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700';
                  return (
                    <tr key={l.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{l.code}</span>
                      </td>
                      <td className="px-4 py-2 font-medium">{l.name}</td>
                      <td className="px-4 py-2">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full', roleCls)}>{roleLabel}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-500 text-xs">
                        {isWarehouse ? (truckTypes.find((t) => t.code === l.truckType)?.name ?? l.truckType ?? '—') : '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-500 text-xs">
                        {isFactory ? (productCount > 0 ? `${productCount}製品` : '未割り当て') : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setEditingLocation({ ...l })}
                          className="text-xs text-brand-600 hover:underline mr-3"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => {
                            if (isFactory && productCount > 0) {
                              alert(`「${l.name}」には ${productCount} 製品が割り当てられているため削除できません。`);
                              return;
                            }
                            if (!window.confirm(`場所「${l.name}」を削除します。よろしいですか？`)) return;
                            removeLocation(l.code);
                            toast(`場所「${l.name}」を削除しました`);
                          }}
                          className="text-xs text-red-400 hover:underline"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {locations.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-xs">場所が未登録です。「+ 場所を追加」から登録してください。</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            ※ 工場（生産元）と物流拠点（出荷先）を1つの場所マスターで管理します。役割で生産・出荷を区別し、両方を兼ねる場所は「生産元＋出荷先」を選びます。製品が割り当てられた生産元は削除できません。
          </p>

          {editingLocation && (
            <LocationModal
              location={editingLocation}
              truckTypes={truckTypes}
              onChange={setEditingLocation}
              onSave={handleSaveLocation}
              onCancel={() => setEditingLocation(null)}
              isNew={!locations.some((l) => l.code === editingLocation.code)}
            />
          )}
        </div>
      )}

      {/* ── 製品マスター ── */}
      {tab === 'products' && (
        <div>
          {/* 製品マスター操作のエラー（追加・更新・削除） */}
          {productOpError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <div className="flex items-start gap-2">
                <span className="font-bold shrink-0">❌</span>
                <div className="flex-1">
                  <div className="font-mono break-all">{productOpError}</div>
                  <div className="mt-2 text-red-600">
                    画面の表示は楽観更新ではなく、DB保存が成功した内容のみ反映されます。
                    エラー内容を解消してから再度お試しください。
                  </div>
                </div>
                <button
                  onClick={() => setProductOpError(null)}
                  className="text-red-500 hover:text-red-700 text-xs shrink-0"
                  aria-label="閉じる"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* CSVインポートパネル（デモでは非表示） */}
          {!demo && (
          <details className="mb-4 bg-slate-50 border border-slate-200 rounded-lg">
            <summary className="px-4 py-3 text-sm font-medium text-slate-600 cursor-pointer select-none hover:bg-slate-100 rounded-lg">
              📥 CSVで一括インポート
            </summary>
            <div className="px-4 pb-4 pt-2 border-t border-slate-200">
              {/* テンプレートDL */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-slate-500">テンプレートDL：</span>
                <button
                  onClick={() =>
                    downloadCSV(
                      generateProductsTemplate(products),
                      '製品マスター.csv',
                    )
                  }
                  className="text-xs px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
                >
                  現在の製品をCSVでダウンロード
                </button>
              </div>

              {/* フォーマット説明 */}
              <div className="mb-3 text-xs text-slate-500 bg-white border border-slate-200 rounded p-2">
                <span className="font-medium">認識する列名：</span>
                <code className="ml-1 text-slate-700">製品コード, 製品名, 個/枚, パレット型, カラー(hex), 製造工場, 器具名</code>
                <div className="mt-1 text-slate-400">
                  ※ 1行目のヘッダー名で列を判定します。<strong>列順は問いません</strong>。不要な列は省略可（CSVに含まれない列は既存値が保持されます）。認識できない列（旧フォーマットの器具区分/ポジ/仕向け/生産方式など）は無視されます。
                </div>
              </div>

              {/* ファイル選択 */}
              <div className="flex items-center gap-3 mb-3">
                <input
                  ref={prodCsvRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleProductCsvFile}
                  className="hidden"
                />
                <button
                  onClick={() => { prodCsvRef.current?.click(); setCsvPreview(null); setCsvImported(false); }}
                  className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-white transition-colors"
                >
                  CSVファイルを選択
                </button>
                {csvPreview && (
                  <span className="text-xs text-slate-500">
                    {csvPreview.rows.length}件を読み込みました
                    （新規 {csvPreview.rows.filter((r) => r.isNew).length} 件 ／
                    更新 {csvPreview.rows.filter((r) => !r.isNew).length} 件）
                  </span>
                )}
              </div>

              {/* 警告 */}
              {csvPreview && csvPreview.warnings.length > 0 && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
                  {csvPreview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              {/* プレビューテーブル */}
              {csvPreview && csvPreview.rows.length > 0 && (
                <div className="overflow-x-auto mb-3">
                  <table className="text-xs border-collapse w-full bg-white rounded border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-500 border-r border-slate-200">状態</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500">色</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500">製品コード</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500">製品名</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-500">個/枚</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-500">パレット型</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.rows.map(({ product, isNew, warnings: rw }) => (
                        <tr
                          key={product.code}
                          className={clsx(
                            'border-t border-slate-100',
                            rw.length > 0 ? 'bg-amber-50' : isNew ? 'bg-emerald-50' : '',
                          )}
                        >
                          <td className="px-3 py-1.5 border-r border-slate-200">
                            <span className={clsx(
                              'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                              isNew ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700',
                            )}>
                              {isNew ? '新規' : '更新'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            <span className="w-4 h-4 rounded border border-black/10 block" style={{ background: product.color }} />
                          </td>
                          <td className="px-3 py-1.5 font-mono text-slate-500">{product.code}</td>
                          <td className="px-3 py-1.5 font-medium text-slate-700">{product.name}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{product.capacityPerPallet}</td>
                          <td className="px-3 py-1.5 text-slate-500">{product.palletType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {csvPreview && (
                <>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleProductCsvImport}
                      disabled={csvImported || csvImporting}
                      className={clsx(
                        'px-4 py-2 text-sm rounded-lg transition-colors',
                        csvImported
                          ? 'bg-emerald-100 text-emerald-700 cursor-default'
                          : csvImporting
                            ? 'bg-slate-200 text-slate-500 cursor-wait'
                            : 'bg-brand-600 text-white hover:bg-brand-700',
                      )}
                    >
                      {csvImported ? '✓ インポート済み' : csvImporting ? '保存中…' : 'インポートする'}
                    </button>
                    {csvImported && <span className="text-xs text-emerald-600">製品マスターに反映されました</span>}
                    <span className="text-xs text-slate-400 ml-auto">※既存の製品コードは上書き更新、新規コードは末尾に追加されます</span>
                  </div>
                  {csvImportError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      <div className="font-bold mb-1">❌ DB保存に失敗しました</div>
                      <div className="font-mono break-all">{csvImportError}</div>
                      <div className="mt-2 text-red-600">
                        画面上の表示は楽観的な更新ではなく、保存成功した内容のみ反映されます。
                        ページを更新するとこの取り込みは消えますので、エラー内容を解消してから再度お試しください。
                        Supabaseの<code className="font-mono bg-red-100 px-1">products</code>テーブルにカラムが不足している場合は、
                        リポジトリ同梱の <code className="font-mono bg-red-100 px-1">supabase/migrations/0001_add_product_fields.sql</code> を
                        Supabaseダッシュボードの SQL Editor で実行してください。
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </details>
          )}

          {/* ── 重複警告バナー ── */}
          {duplicateCodes.size > 0 && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-xs">
              <span className="text-amber-600 font-bold shrink-0">⚠️ 重複コードを検出</span>
              <span className="text-amber-700 flex-1">
                同じ商品コードが複数登録されています：
                <span className="font-mono ml-1">{Array.from(duplicateCodes).join(', ')}</span>
              </span>
              <button
                onClick={handleDeduplicateProducts}
                disabled={deduping}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-semibold border transition-colors shrink-0',
                  deduping
                    ? 'bg-slate-100 text-slate-400 cursor-wait border-slate-200'
                    : 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700',
                )}
              >
                {deduping ? '処理中…' : '重複を削除'}
              </button>
              {dedupResult && (
                <span className={clsx(
                  'text-xs font-medium shrink-0',
                  dedupResult.startsWith('エラー') ? 'text-red-600' : 'text-emerald-600',
                )}>
                  {dedupResult}
                </span>
              )}
            </div>
          )}
          {!duplicateCodes.size && dedupResult && (
            <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
              ✓ {dedupResult}
            </div>
          )}

          {/* ── フィルターバー ── */}
          {(() => {
            // 全器具名リスト
            const allEqNames = Array.from(new Set(
              products.map((p) => p.equipmentName?.trim() || '（器具名未設定）')
            ));
            const filteredCount = products.filter((p) => {
              const eq = p.equipmentName?.trim() || '（器具名未設定）';
              if (filterEquipmentName && eq !== filterEquipmentName) return false;
              if (filterText) {
                const q = filterText.toLowerCase();
                return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || eq.toLowerCase().includes(q);
              }
              return true;
            }).length;
            return (
              <div className="mb-3 flex flex-col gap-2">
                {/* テキスト検索 + 追加ボタン */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1" ref={searchRef}>
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
                    <input
                      type="text"
                      placeholder="製品名・コード・器具名で検索…"
                      value={filterText}
                      onChange={(e) => { setFilterText(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      className="w-full pl-7 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    {filterText && (
                      <button
                        onClick={() => { setFilterText(''); setShowSuggestions(false); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >✕</button>
                    )}

                    {/* ── サジェストドロップダウン ── */}
                    {showSuggestions && searchSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                        {searchSuggestions.map((p) => {
                          const q = filterText.toLowerCase();
                          const codeMatch = p.code.toLowerCase().includes(q);
                          const nameMatch = p.name.toLowerCase().includes(q);
                          return (
                            <button
                              key={p.code}
                              onMouseDown={(e) => {
                                e.preventDefault(); // blur を防ぐ
                                setFilterText(p.name);
                                setShowSuggestions(false);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 last:border-0 transition-colors"
                            >
                              <span
                                className="w-3 h-3 rounded border border-black/10 shrink-0"
                                style={{ background: productColors[p.code] ?? '#94a3b8' }}
                              />
                              <span className={clsx(
                                'font-mono text-xs shrink-0',
                                codeMatch ? 'text-brand-700 font-bold' : 'text-slate-400',
                              )}>
                                {p.code}
                              </span>
                              <span className={clsx(
                                'text-sm truncate flex-1',
                                nameMatch ? 'text-slate-900 font-semibold' : 'text-slate-600',
                              )}>
                                {p.name}
                              </span>
                              {p.equipmentName && (
                                <span className="text-xs text-slate-400 shrink-0 hidden sm:block">
                                  {p.equipmentName}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {!demo && (
                    <button
                      onClick={() => setEditingProduct(newProduct())}
                      className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shrink-0"
                    >
                      + 製品を追加
                    </button>
                  )}
                </div>

                {/* 器具名チップ */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <button
                    onClick={() => setFilterEquipmentName(null)}
                    className={clsx(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      filterEquipmentName === null
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-brand-400',
                    )}
                  >
                    すべて
                    <span className="ml-1 opacity-70">{products.length}</span>
                  </button>
                  {allEqNames.map((eqName) => {
                    const color = equipmentColorMap[eqName] ?? '#94a3b8';
                    const count = products.filter(
                      (p) => (p.equipmentName?.trim() || '（器具名未設定）') === eqName,
                    ).length;
                    const isActive = filterEquipmentName === eqName;
                    return (
                      <button
                        key={eqName}
                        onClick={() => setFilterEquipmentName(isActive ? null : eqName)}
                        className={clsx(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          isActive
                            ? 'text-white border-transparent shadow-sm'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400',
                        )}
                        style={isActive ? { background: color, borderColor: color } : {}}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: isActive ? 'rgba(255,255,255,0.7)' : color }}
                        />
                        {eqName}
                        <span className="opacity-70">{count}</span>
                      </button>
                    );
                  })}
                  {(filterEquipmentName || filterText) && (
                    <span className="text-xs text-slate-500 ml-1">
                      {filteredCount}件を表示中
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="px-3 py-2.5 text-left font-semibold">色</th>
                  <th className="px-3 py-2.5 text-left font-semibold">商品コード</th>
                  <th className="px-3 py-2.5 text-left font-semibold">商品名</th>
                  <th className="px-3 py-2.5 text-right font-semibold">個/パレット</th>
                  <th className="px-3 py-2.5 text-left font-semibold">パレット型</th>
                  <th className="px-3 py-2.5 text-center font-semibold" title="この製品の上に荷を積めるか">上積み可否</th>
                  <th className="px-3 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {factories.map((factory) => {
                  // フィルター適用後の製品リスト
                  const fProducts = products.filter((p) => {
                    if ((p.factoryCode ?? 'F001') !== factory.code) return false;
                    const eq = p.equipmentName?.trim() || '（器具名未設定）';
                    if (filterEquipmentName && eq !== filterEquipmentName) return false;
                    if (filterText) {
                      const q = filterText.toLowerCase();
                      return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || eq.toLowerCase().includes(q);
                    }
                    return true;
                  });
                  if (fProducts.length === 0) return null;

                  // 器具名ごとにグループ化
                  const eqMap = new Map<string, Product[]>();
                  for (const p of fProducts) {
                    const key = p.equipmentName?.trim() || '（器具名未設定）';
                    if (!eqMap.has(key)) eqMap.set(key, []);
                    eqMap.get(key)!.push(p);
                  }

                  return (
                    <React.Fragment key={factory.code}>
                      {/* 工場ヘッダー */}
                      <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                        <td colSpan={11} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                              {factory.code}
                            </span>
                            <span className="font-bold text-sm text-indigo-800">{factory.name}</span>
                            <span className="text-xs text-indigo-400">{fProducts.length}製品</span>
                          </div>
                        </td>
                      </tr>

                      {Array.from(eqMap.entries()).map(([eqName, eqProducts]) => {
                        const eqColor = equipmentColorMap[eqName] ?? '#94a3b8';
                        const isUnset = eqName === '（器具名未設定）';
                        return (
                          <React.Fragment key={eqName}>
                            {/* 器具名ヘッダー */}
                            <tr className={clsx(
                              'border-t',
                              isUnset ? 'bg-slate-50 border-slate-200' : 'bg-teal-50/60 border-teal-100',
                            )}>
                              <td colSpan={11} className="px-6 py-1.5">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                                    style={{ background: eqColor }}
                                  />
                                  <span className={clsx(
                                    'text-xs font-semibold',
                                    isUnset ? 'text-slate-400 italic' : 'text-teal-700',
                                  )}>
                                    {eqName}
                                  </span>
                                  <span className="text-[10px] text-teal-400">{eqProducts.length}製品</span>
                                </div>
                              </td>
                            </tr>

                            {/* 製品行 */}
                            {eqProducts.map((p) => (
                              <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-2">
                                  <span
                                    className="w-5 h-5 rounded border border-black/10 block"
                                    style={{ background: productColors[p.code] ?? '#94a3b8' }}
                                  />
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-slate-500">{p.code}</td>
                                <td className="px-3 py-2 font-medium">{p.name}</td>
                                <td className="px-3 py-2 text-right">{p.capacityPerPallet}</td>
                                <td className="px-3 py-2 text-slate-500 text-xs">{p.palletType}</td>
                                <td className="px-3 py-2 text-center">
                                  <StackingBadge allowStackOnTop={p.allowStackOnTop} />
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  <button onClick={() => setEditingProduct({ ...p })} className="text-xs text-brand-600 hover:underline mr-3">編集</button>
                                  <button onClick={() => handleRemoveProduct(p.code)} className="text-xs text-red-400 hover:underline">削除</button>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 製品編集モーダル */}
          {editingProduct && (
            <ProductModal
              product={editingProduct}
              factories={factories}
              palletTypes={palletTypes}
              equipmentColorMap={equipmentColorMap}
              onChange={setEditingProduct}
              onSave={handleSaveProduct}
              onCancel={() => { setEditingProduct(null); setProductOpError(null); }}
              isNew={!products.some((p) => p.code === editingProduct.code)}
              saveError={productOpError}
              isSaving={productSaving}
            />
          )}
        </div>
      )}

      {/* ── 拠点マスター ── */}
      {/* ── パレット型マスター ── */}
      {tab === 'pallets' && (
        <div>
          {!demo && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setEditingPallet(newPalletType())}
                className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
              >
                + パレット型を追加
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-left font-semibold">コード</th>
                  <th className="px-4 py-2.5 text-left font-semibold">名称</th>
                  <th className="px-4 py-2.5 text-right font-semibold">幅（mm）</th>
                  <th className="px-4 py-2.5 text-right font-semibold">奥行き（mm）</th>
                  <th className="px-4 py-2.5 text-right font-semibold">板高さ（mm）</th>
                  <th className="px-4 py-2.5 text-right font-semibold">積載総高さ（mm）</th>
                  <th className="px-4 py-2.5 text-right font-semibold">最大荷重（kg）</th>
                  <th className="px-4 py-2.5 text-left font-semibold">使用製品数</th>
                  <th className="px-4 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {palletTypes.map((pt) => {
                  const usedCount = products.filter((p) => p.palletType === pt.code).length;
                  return (
                    <tr key={pt.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs font-bold text-slate-600">{pt.code}</td>
                      <td className="px-4 py-2 font-medium">{pt.name}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{pt.widthMM.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{pt.depthMM.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{pt.heightMM.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-semibold text-sky-700">
                        {(pt.loadedHeightMM ?? 1200).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">{pt.maxWeightKg.toLocaleString()}</td>
                      <td className="px-4 py-2">
                        {usedCount > 0 ? (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {usedCount}製品
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">未使用</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setEditingPallet({ ...pt })}
                          className="text-xs text-brand-600 hover:underline mr-3"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => {
                            if (usedCount > 0) {
                              alert(`「${pt.name}」は ${usedCount} 製品で使用中のため削除できません。`);
                              return;
                            }
                            if (!window.confirm(`パレット型「${pt.name}」を削除します。よろしいですか？`)) return;
                            removePalletType(pt.code);
                            toast(`パレット型「${pt.name}」を削除しました`);
                          }}
                          className="text-xs text-red-400 hover:underline"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            ※ パレットサイズは積載図の描画に使用されます。使用中のパレット型は削除できません。
          </p>

          {/* パレット型編集モーダル */}
          {editingPallet && (
            <PalletModal
              pallet={editingPallet}
              onChange={setEditingPallet}
              onSave={handleSavePallet}
              onCancel={() => setEditingPallet(null)}
              isNew={!palletTypes.some((p) => p.code === editingPallet.code)}
            />
          )}
        </div>
      )}

      {/* ── トラックマスター ── */}
      {tab === 'trucks' && (
        <div>
          {!demo && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setEditingTruck(newTruckType())}
                className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
              >
                + トラックを追加
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-left font-semibold">コード</th>
                  <th className="px-4 py-2.5 text-left font-semibold">名称</th>
                  <th className="px-4 py-2.5 text-right font-semibold">幅（mm）</th>
                  <th className="px-4 py-2.5 text-right font-semibold">奥行き（mm）</th>
                  <th className="px-4 py-2.5 text-right font-semibold">荷室高さ（mm）</th>
                  <th className="px-4 py-2.5 text-right font-semibold">使用拠点数</th>
                  <th className="px-4 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {truckTypes.map((t) => {
                  const usedCount = warehouses.filter((w) => w.truckType === t.code).length;
                  return (
                    <tr key={t.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {t.code}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium">{t.name}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{t.widthMM.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{t.depthMM.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-semibold text-sky-700">
                        {t.heightMM.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {usedCount > 0 ? (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {usedCount}拠点
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">未使用</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setEditingTruck({ ...t })}
                          className="text-xs text-brand-600 hover:underline mr-3"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => {
                            if (usedCount > 0) {
                              alert(`「${t.name}」は ${usedCount} 拠点で使用中のため削除できません。`);
                              return;
                            }
                            if (!window.confirm(`トラックタイプ「${t.name}」を削除します。よろしいですか？`)) return;
                            removeTruckType(t.code);
                            toast(`トラックタイプ「${t.name}」を削除しました`);
                          }}
                          className="text-xs text-red-400 hover:underline"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            ※ 荷室高さは2段積み判定に使用されます。使用中の拠点があるトラックは削除できません。
          </p>

          {truckOpError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
              <span className="font-bold shrink-0">❌</span>
              <div className="flex-1 font-mono break-all">{truckOpError}</div>
              <button onClick={() => setTruckOpError(null)} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
            </div>
          )}

          {editingTruck && (
            <TruckModal
              truck={editingTruck}
              onSave={handleSaveTruck}
              onCancel={() => setEditingTruck(null)}
              isNew={!truckTypes.some((t) => t.code === editingTruck.code)}
            />
          )}
        </div>
      )}

      {/* 積付計算は製品マスター(製品モーダル)へ統合済み */}

      {/* ── 稼働日マスター ── */}
      {tab === 'operating' && (
        <div className="flex flex-col gap-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 leading-relaxed">
            <strong>稼働日の設定方法：</strong>
            まず「曜日デフォルト」で通常の稼働曜日を設定し、
            カレンダーで祝日や特別休業日をクリックして非稼働日に指定してください。<br />
            <span className="text-amber-600">■ 白 = 稼働日　■ 赤 = 非稼働日（クリックで切替）　■ グレー = 曜日デフォルトで非稼働</span>
          </div>
          {factories.map((f) => {
            const weekDays: boolean[] = operatingDays[f.code] ?? [true, true, true, true, true, false, false];
            const nwd = nonWorkingDates[f.code] ?? [];
            return (
              <div key={f.code} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{f.code}</span>
                  <h3 className="font-bold text-slate-800">{f.name}</h3>
                  <span className="text-xs text-slate-400 ml-auto">非稼働日指定：{nwd.length}件</span>
                </div>
                {/* 曜日デフォルト */}
                <div className="mb-4">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">曜日デフォルト</p>
                  <div className="flex gap-1.5">
                    {['月', '火', '水', '木', '金', '土', '日'].map((label, i) => {
                      const active = weekDays[i] ?? false;
                      return (
                        <button
                          key={i}
                          onClick={() => setOperatingDay(f.code, i, !active)}
                          className={clsx(
                            'w-9 h-9 rounded-lg text-xs font-bold border-2 transition-all',
                            active
                              ? i >= 5 ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-brand-500 bg-brand-600 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-300',
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* カレンダー */}
                <OperatingCalendar
                  factoryCode={f.code}
                  defaultDays={weekDays}
                  nonWorkingDates={nwd}
                  onToggle={(date) => toggleNonWorkingDate(f.code, date)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 稼働日カレンダー ─────────────────────────────────────────────────
const DAY_LABELS_CAL = ['月', '火', '水', '木', '金', '土', '日'];
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function OperatingCalendar({
  factoryCode,
  defaultDays,
  nonWorkingDates,
  onToggle,
}: {
  factoryCode: string;
  defaultDays: boolean[];
  nonWorkingDates: string[];
  onToggle: (date: string) => void;
}) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based

  const todayStr = today.toISOString().slice(0, 10);
  const nwdSet   = useMemo(() => new Set(nonWorkingDates), [nonWorkingDates]);

  // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat → index into defaultDays (0=Mon)
  const jsDayToIdx = (d: number) => (d === 0 ? 6 : d - 1);

  // 月の最初の日が何曜日か（月曜始まりで何列目か）
  const firstDay = new Date(year, month, 1);
  const startCol = jsDayToIdx(firstDay.getDay()); // 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // 月の稼働日数カウント
  const workingCount = useMemo(() => {
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = date.toISOString().slice(0, 10);
      const idx = jsDayToIdx(date.getDay());
      const defaultWorking = defaultDays[idx] ?? false;
      if (defaultWorking && !nwdSet.has(dateStr)) count++;
    }
    return count;
  }, [year, month, daysInMonth, defaultDays, nwdSet]);

  // グリッド（空セル + 日付セル）
  const cells: (number | null)[] = [
    ...Array(startCol).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 7の倍数になるよう末尾を埋める
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50 transition-colors">← 前月</button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">{year}年 {MONTH_NAMES[month]}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-semibold">
            稼働 {workingCount}日
          </span>
          {nwdSet.size > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">
              非稼働指定 {nonWorkingDates.filter(d => d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length}件
            </span>
          )}
        </div>
        <button onClick={nextMonth} className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50 transition-colors">次月 →</button>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS_CAL.map((label, i) => (
          <div key={i} className={clsx(
            'text-center text-[10px] font-bold py-1',
            i === 5 ? 'text-indigo-500' : i === 6 ? 'text-red-500' : 'text-slate-500',
          )}>
            {label}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, ci) => {
          if (day === null) return <div key={`empty-${ci}`} />;

          const date    = new Date(year, month, day);
          const dateStr = date.toISOString().slice(0, 10);
          const dayIdx  = jsDayToIdx(date.getDay());
          const isSat   = date.getDay() === 6;
          const isSun   = date.getDay() === 0;
          const defaultWorking  = defaultDays[dayIdx] ?? false;
          const isNonWorking    = nwdSet.has(dateStr);
          const effectiveWorking = defaultWorking && !isNonWorking;
          const isToday = dateStr === todayStr;
          const isPast  = dateStr < todayStr;

          // 曜日デフォルトで非稼働（土日など）はクリック不可
          const isDefaultOff = !defaultWorking;

          return (
            <button
              key={dateStr}
              disabled={isDefaultOff}
              onClick={() => onToggle(dateStr)}
              title={
                isDefaultOff ? '曜日デフォルトで非稼働' :
                isNonWorking ? 'クリックで稼働日に戻す' :
                'クリックで非稼働日に設定'
              }
              className={clsx(
                'relative flex flex-col items-center justify-center rounded-lg h-10 text-xs font-medium transition-all select-none',
                isDefaultOff
                  ? 'bg-slate-100 text-slate-300 cursor-default'
                  : isNonWorking
                    ? 'bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer border border-red-200'
                    : 'bg-white text-slate-700 hover:bg-emerald-50 cursor-pointer border border-slate-200 hover:border-emerald-300',
                isToday && !isDefaultOff && 'ring-2 ring-brand-400 ring-offset-1',
                isPast && !isDefaultOff && 'opacity-60',
              )}
            >
              <span className={clsx(
                'font-bold text-sm leading-none',
                isSat && !isNonWorking && !isDefaultOff ? 'text-indigo-600' :
                isSun && !isNonWorking && !isDefaultOff ? 'text-red-500' : '',
              )}>
                {day}
              </span>
              {isNonWorking && (
                <span className="text-[8px] leading-none mt-0.5 font-bold text-red-500">休</span>
              )}
              {effectiveWorking && (
                <span className="absolute bottom-0.5 right-1 text-[7px] text-emerald-400">✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 凡例 */}
      <div className="mt-3 flex gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border border-slate-200 bg-white inline-block" />稼働日
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border border-red-200 bg-red-100 inline-block" />非稼働日（休日指定）
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-slate-100 inline-block" />曜日デフォルト非稼働
        </span>
      </div>
    </div>
  );
}

// ─── 2段積みバッジ ────────────────────────────────────────────────────
function StackingBadge({ allowStackOnTop }: { allowStackOnTop?: boolean }) {
  // 上積み可否：この製品の上に荷を積めるか
  if (allowStackOnTop !== false) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
        ✓ 上積み可
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
      ✕ 上積み不可
    </span>
  );
}

// ─── トラックモーダル ────────────────────────────────────────────────────
function TruckModal({
  truck, onSave, onCancel, isNew,
}: {
  truck: import('@/lib/types').TruckType;
  onSave: (t: import('@/lib/types').TruckType) => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  // フィールドをローカル文字列 state で管理（入力中の中間値を安全に保持）
  const [code,       setCode]       = useState(truck.code);
  const [name,       setName]       = useState(truck.name);
  const [heightMM,   setHeightMM]   = useState(String(truck.heightMM));
  const [widthMM,    setWidthMM]    = useState(String(truck.widthMM));
  const [depthMM,    setDepthMM]    = useState(String(truck.depthMM));
  const [maxWeightKg, setMaxWeightKg] = useState(String(truck.maxWeightKg ?? 0));
  const [error,      setError]      = useState<string | null>(null);

  // プレビュー用に現在値を数値化（無効なら元の値）
  const pHeightMM   = parseInt(heightMM, 10)   || 0;
  const pWidthMM    = parseInt(widthMM, 10)     || 0;
  const pDepthMM    = parseInt(depthMM, 10)     || 0;
  const pMaxWeightKg = parseInt(maxWeightKg, 10) || 0;

  const handleSave = () => {
    if (!code.trim() || !name.trim()) { setError('コードと名称は必須です'); return; }
    if (!pWidthMM || !pDepthMM) { setError('荷台内寸（幅・奥行き）を入力してください'); return; }
    if (!pHeightMM)  { setError('荷室高さは100mm以上の値を入力してください'); return; }
    onSave({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      heightMM:   pHeightMM,
      widthMM:    pWidthMM,
      depthMM:    pDepthMM,
      maxWeightKg: pMaxWeightKg > 0 ? pMaxWeightKg : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
        <h3 className="font-bold text-slate-800 mb-4">{isNew ? 'トラックを追加' : 'トラックを編集'}</h3>
        <div className="flex flex-col gap-3 max-h-[75vh] overflow-y-auto pr-1">
          <Field label="コード（例: T07）">
            <input
              className={INPUT_CLASS}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!isNew}
              placeholder="例: T07"
            />
          </Field>
          <Field label="名称">
            <input
              className={INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: ウイング車(4t)"
            />
          </Field>
          <Field label="荷室高さ（mm）" hint="段数の自動算出に使用（高さ÷パレット高）">
            <input
              type="number" min={100} step={50}
              className={INPUT_CLASS}
              value={heightMM}
              onChange={(e) => setHeightMM(e.target.value)}
              placeholder="2300"
            />
          </Field>
          <Field label="最大積載重量（kg）" hint="0=重量制約なし。設定すると容量＋重量で台数を判定し超過を警告">
            <input
              type="number" min={0} step={100}
              className={INPUT_CLASS}
              value={maxWeightKg}
              onChange={(e) => setMaxWeightKg(e.target.value)}
              placeholder="0"
            />
          </Field>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] text-slate-400 mb-2">荷台内寸（mm）※床枚数・段数はパレット寸法から自動算出</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="幅（mm）">
                <input
                  type="number" min={1} step={50}
                  className={INPUT_CLASS}
                  value={widthMM}
                  onChange={(e) => setWidthMM(e.target.value)}
                />
              </Field>
              <Field label="奥行き（mm）">
                <input
                  type="number" min={1} step={100}
                  className={INPUT_CLASS}
                  value={depthMM}
                  onChange={(e) => setDepthMM(e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* プレビュー */}
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
            荷台内寸: {pWidthMM ? pWidthMM.toLocaleString() : '—'} × {pDepthMM ? pDepthMM.toLocaleString() : '—'} mm
            　荷室高: {pHeightMM ? pHeightMM.toLocaleString() : '—'} mm
            <span className="block mt-0.5 text-[10px] text-slate-400">※ 床枚数・段数はパレット寸法と内寸から積載計画時に自動算出</span>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            キャンセル
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 工場モーダル ──────────────────────────────────────────────────────
function LocationModal({
  location, truckTypes, onChange, onSave, onCancel, isNew,
}: {
  location: Location;
  truckTypes: import('@/lib/types').TruckType[];
  onChange: (l: Location) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const isWarehouse = location.role === 'warehouse' || location.role === 'both';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
        <h3 className="font-bold text-slate-800 mb-4">{isNew ? '場所を追加' : '場所を編集'}</h3>
        <div className="flex flex-col gap-3">
          <Field label="コード（例: F001 / W001）">
            <input
              className={INPUT_CLASS}
              value={location.code}
              onChange={(e) => onChange({ ...location, code: e.target.value.toUpperCase() })}
              disabled={!isNew}
              placeholder="例: W001"
            />
          </Field>
          <Field label="名称">
            <input
              className={INPUT_CLASS}
              value={location.name}
              onChange={(e) => onChange({ ...location, name: e.target.value })}
              placeholder="例: 東京物流センター"
            />
          </Field>
          <Field label="役割" hint="生産元=製品を作る工場 / 出荷先=配送する拠点 / 両方を兼ねる場合は「生産元＋出荷先」">
            <select
              className={INPUT_CLASS}
              value={location.role}
              onChange={(e) => onChange({ ...location, role: e.target.value as Location['role'] })}
            >
              <option value="warehouse">出荷先（物流拠点）</option>
              <option value="factory">生産元（工場）</option>
              <option value="both">生産元＋出荷先</option>
            </select>
          </Field>
          {isWarehouse && (
            <>
              <Field label="ドック車種" hint="この拠点へ配送するトラック種別（積載効率は内寸から自動算出）">
                <select
                  className={INPUT_CLASS}
                  value={location.truckType ?? ''}
                  onChange={(e) => onChange({ ...location, truckType: e.target.value })}
                >
                  <option value="">選択してください</option>
                  {truckTypes.map((t) => (
                    <option key={t.code} value={t.code}>{t.code} - {t.name}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="配分優先度" hint="小さいほど優先（配分が「優先度順」のとき先に満たす）。空欄は最後尾">
                  <input
                    type="number" min={1} step={1}
                    className={INPUT_CLASS}
                    value={location.priority ?? ''}
                    onChange={(e) => onChange({ ...location, priority: e.target.value === '' ? undefined : (parseInt(e.target.value, 10) || undefined) })}
                    placeholder="例: 1"
                  />
                </Field>
                <Field label="リードタイム（日）" hint="基準在庫が「自動」のとき使用（到着までの日数）">
                  <input
                    type="number" min={0} step={1}
                    className={INPUT_CLASS}
                    value={location.leadTimeDays ?? ''}
                    onChange={(e) => onChange({ ...location, leadTimeDays: e.target.value === '' ? undefined : (parseInt(e.target.value, 10) || 0) })}
                    placeholder="例: 2"
                  />
                </Field>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            キャンセル
          </button>
          <button onClick={onSave} className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 製品モーダル ──────────────────────────────────────────────────────
function ProductModal({
  product, factories, palletTypes, equipmentColorMap, onChange, onSave, onCancel, isNew,
  saveError, isSaving,
}: {
  product: Product;
  factories: Factory[];
  palletTypes: import('@/lib/types').PalletType[];
  equipmentColorMap: Record<string, string>;
  onChange: (p: Product) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
  saveError?: string | null;
  isSaving?: boolean;
}) {
  // 器具名から自動導出した色（新規器具名は次のパレット色）
  const eqKey = product.equipmentName?.trim() ?? '';
  const derivedColor = eqKey
    ? (equipmentColorMap[eqKey] ?? PRODUCT_PALETTE[Object.keys(equipmentColorMap).length % PRODUCT_PALETTE.length])
    : '#94a3b8';

  // ── 積付計算（段ボール寸法→最適配置→個/パレット）。旧「積付計算タブ」を統合 ──
  const [palletLoadH, setPalletLoadH] = useState(1500); // パレット1枚を組む高さ(mm)
  const selPallet = palletTypes.find((pt) => pt.code === product.palletType);
  const boxW = product.boxWidthMM ?? 0, boxD = product.boxDepthMM ?? 0, boxH = product.boxHeightMM ?? 0;
  const palletLayout = (boxW && boxD && boxH && selPallet)
    ? calcPalletLayout(boxW, boxD, boxH, selPallet.widthMM, selPallet.depthMM, selPallet.heightMM, palletLoadH)
    : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
        <h3 className="font-bold text-slate-800 mb-4">{isNew ? '製品を追加' : '製品を編集'}</h3>
        <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
          <Field label="商品コード">
            <input
              className={INPUT_CLASS}
              value={product.code}
              onChange={(e) => onChange({ ...product, code: e.target.value })}
              disabled={!isNew}
              placeholder="例: 1064521424"
            />
          </Field>
          <Field label="商品名">
            <input
              className={INPUT_CLASS}
              value={product.name}
              onChange={(e) => onChange({ ...product, name: e.target.value })}
              placeholder="例: PH-5BN"
            />
          </Field>
          <Field label="個/パレット">
            <input
              type="number"
              className={INPUT_CLASS}
              value={product.capacityPerPallet}
              onChange={(e) => onChange({ ...product, capacityPerPallet: parseInt(e.target.value, 10) || 1 })}
            />
          </Field>
          <Field label="製造工場コード">
            <select
              className={INPUT_CLASS}
              value={product.factoryCode ?? 'F001'}
              onChange={(e) => onChange({ ...product, factoryCode: e.target.value })}
            >
              {factories.map((f) => (
                <option key={f.code} value={f.code}>{f.name}（{f.code}）</option>
              ))}
            </select>
          </Field>
          <Field label="器具名" hint="同じ器具名の製品は同じ色で表示されます">
            <input
              className={INPUT_CLASS}
              value={product.equipmentName ?? ''}
              onChange={(e) => onChange({ ...product, equipmentName: e.target.value })}
              placeholder="例: 元止め湯沸"
            />
          </Field>
          <Field label="パレット型">
            <select
              className={INPUT_CLASS}
              value={product.palletType}
              onChange={(e) => onChange({ ...product, palletType: e.target.value })}
            >
              {palletTypes.map((pt) => (
                <option key={pt.code} value={pt.code}>{pt.code} — {pt.name}</option>
              ))}
            </select>
          </Field>
          {/* 段ボール寸法（積付計算用） */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-600 mb-2">段ボール梱包サイズ（積付計算用）</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="幅 W (mm)">
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={product.boxWidthMM ?? ''}
                  onChange={(e) => onChange({ ...product, boxWidthMM: parseInt(e.target.value, 10) || undefined })}
                  placeholder="例: 380"
                />
              </Field>
              <Field label="奥行 D (mm)">
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={product.boxDepthMM ?? ''}
                  onChange={(e) => onChange({ ...product, boxDepthMM: parseInt(e.target.value, 10) || undefined })}
                  placeholder="例: 310"
                />
              </Field>
              <Field label="高さ H (mm)">
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={product.boxHeightMM ?? ''}
                  onChange={(e) => onChange({ ...product, boxHeightMM: parseInt(e.target.value, 10) || undefined })}
                  placeholder="例: 280"
                />
              </Field>
              <Field label="重量 (kg)">
                <input
                  type="number"
                  step="0.1"
                  className={INPUT_CLASS}
                  value={product.boxWeightKg ?? ''}
                  onChange={(e) => onChange({ ...product, boxWeightKg: parseFloat(e.target.value) || undefined })}
                  placeholder="例: 5.2"
                />
              </Field>
            </div>
            {/* 積付計算：最適配置→「個/パレット」へ反映 */}
            <div className="mt-2 flex items-center gap-2">
              <label className="text-[11px] text-slate-500">パレット組み高さ(mm)</label>
              <input
                type="number" step={50} min={0}
                className="w-24 border border-slate-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:border-brand-500"
                value={palletLoadH}
                onChange={(e) => setPalletLoadH(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            {palletLayout ? (
              <div className="mt-2 bg-slate-50 rounded-lg p-3 flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[160px] text-xs text-slate-600 leading-relaxed">
                  最適配置：<b>{palletLayout.cols}×{palletLayout.rows}</b> × <b>{palletLayout.layers}段</b>
                  ＝ <b className="text-brand-600">{palletLayout.perPallet} 個/パレット</b>
                  <br />積載総高さ {palletLayout.loadedHeightMM.toLocaleString()}mm{palletLayout.orientated ? '（箱90°回転）' : ''}
                  <button
                    type="button"
                    onClick={() => onChange({ ...product, capacityPerPallet: palletLayout.perPallet })}
                    className="mt-2 block px-3 py-1 text-xs font-semibold rounded bg-brand-600 text-white hover:bg-brand-700"
                  >
                    この値（{palletLayout.perPallet}個）を「個/パレット」に反映
                  </button>
                </div>
                {selPallet && (
                  <PalletDiagram result={palletLayout} boxW={boxW} boxD={boxD} boxH={boxH} pallet={selPallet} />
                )}
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 mt-1.5">
                💡 段ボール寸法とパレット型を入力すると、最適な個/パレットを自動算出して反映できます。
              </p>
            )}
          </div>

          {/* 積み重ね設定 */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-600 mb-2">積み重ね条件</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={product.allowStackOnTop !== false}
                onChange={(e) => onChange({ ...product, allowStackOnTop: e.target.checked })}
                className="w-4 h-4 mt-0.5 accent-brand-600"
              />
              <div>
                <span className="text-sm text-slate-700 font-medium">上積み可否（この製品の上に荷を積める）</span>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                  ONにすると、この製品の上に別の荷を積み重ねられます（高さが許す限り段数無制限）。<br />
                  OFFにすると、この製品は必ず最上段に置かれ、上には何も積みません。
                </p>
              </div>
            </label>
          </div>

          {/* 表示カラー（器具名から自動設定） */}
          <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-xs text-slate-600 flex items-center gap-3">
            <span
              className="w-7 h-7 rounded border border-black/10 shrink-0"
              style={{ background: derivedColor }}
            />
            <div>
              <div className="font-medium text-slate-700 mb-0.5">表示カラー（自動設定）</div>
              <div className="text-[10px] text-slate-400">
                {eqKey
                  ? `器具名「${eqKey}」に割り当てられた色です。同じ器具名の製品はすべて同色で表示されます。`
                  : '器具名を入力すると、その器具名グループの色が自動設定されます。'}
              </div>
            </div>
          </div>
        </div>

        {/* ── 保存エラー（モーダル内に表示） ── */}
        {saveError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <div className="font-bold mb-1">❌ 保存に失敗しました</div>
            <div className="font-mono break-all whitespace-pre-wrap leading-relaxed">
              {saveError}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            キャンセル
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className={clsx(
              'px-4 py-2 text-sm text-white rounded-lg transition-colors',
              isSaving ? 'bg-slate-400 cursor-wait' : 'bg-brand-600 hover:bg-brand-700',
            )}
          >
            {isSaving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 拠点モーダル ──────────────────────────────────────────────────────
// ─── 計算設定パネル ────────────────────────────────────────────────────
function CalcSettingsPanel() {
  const [s, setS] = useState<CalcSettings>(() => getCalcSettings());
  const update = (patch: Partial<CalcSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveCalcSettings(next);
  };
  return (
    <div className="max-w-xl">
      <p className="text-sm text-slate-500 mb-6">
        送り数の配分方法・基準在庫の決め方・重量計算の前提を設定します。変更は各画面の計算に即時反映されます（この端末に保存）。
      </p>

      {/* 配分方式 */}
      <section className="mb-7">
        <h3 className="font-bold text-slate-800 mb-1">送り数の配分方式</h3>
        <p className="text-xs text-slate-400 mb-2.5">生産数が「全拠点の不足合計」に満たないときの配り方</p>
        <div className="flex flex-col gap-2.5">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" name="distMode" className="mt-1" checked={s.distributionMode === 'proportional'} onChange={() => update({ distributionMode: 'proportional' })} />
            <span><b>不足比率で按分</b><br /><span className="text-xs text-slate-500">全拠点へ不足量に比例して薄く配分（既定）</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" name="distMode" className="mt-1" checked={s.distributionMode === 'priority'} onChange={() => update({ distributionMode: 'priority' })} />
            <span><b>優先度順に満たす</b><br /><span className="text-xs text-slate-500">優先度の高い拠点（拠点マスターで設定）から不足を満タンにし、生産が尽きたら以降は0</span></span>
          </label>
        </div>
      </section>

      {/* 基準在庫モード */}
      <section className="mb-2">
        <h3 className="font-bold text-slate-800 mb-1">基準在庫（在庫比較の基準）の決め方</h3>
        <p className="text-xs text-slate-400 mb-2.5">「現在庫＋輸送中−予定出荷」がこの基準を下回った分を不足として補充します</p>
        <div className="flex flex-col gap-2.5">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" name="baseMode" className="mt-1" checked={s.baselineMode === 'manual'} onChange={() => update({ baselineMode: 'manual' })} />
            <span><b>手入力</b><br /><span className="text-xs text-slate-500">拠点別の基準在庫を手入力した値で判定（既定）</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" name="baseMode" className="mt-1" checked={s.baselineMode === 'auto'} onChange={() => update({ baselineMode: 'auto' })} />
            <span><b>自動算出（安全在庫＋リードタイム）</b><br /><span className="text-xs text-slate-500">予定出荷から日平均を求め、リードタイム＋安全在庫日数ぶんを基準在庫とする</span></span>
          </label>
        </div>
        {s.baselineMode === 'auto' && (
          <div className="mt-3 grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3.5">
            <Field label="安全在庫（日数）">
              <input
                type="number" min={0} step={1} className={INPUT_CLASS}
                value={s.safetyStockDays}
                onChange={(e) => update({ safetyStockDays: parseInt(e.target.value, 10) || 0 })}
              />
            </Field>
            <Field label="週の出荷日数" hint="日平均出荷の算出に使用">
              <input
                type="number" min={1} max={7} step={1} className={INPUT_CLASS}
                value={s.shippingDaysPerWeek}
                onChange={(e) => update({ shippingDaysPerWeek: parseInt(e.target.value, 10) || 1 })}
              />
            </Field>
            <p className="col-span-2 text-xs text-slate-500 leading-relaxed">
              基準在庫 = ⌈ (予定出荷 ÷ 週の出荷日数) ×（拠点のリードタイム日数 ＋ 安全在庫日数） ⌉<br />
              ※ リードタイムは拠点マスターで拠点ごとに設定します。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── パレット型モーダル ────────────────────────────────────────────────
function PalletModal({
  pallet, onChange, onSave, onCancel, isNew,
}: {
  pallet: PalletType;
  onChange: (p: PalletType) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
        <h3 className="font-bold text-slate-800 mb-4">{isNew ? 'パレット型を追加' : 'パレット型を編集'}</h3>
        <div className="flex flex-col gap-3">
          <Field label="コード（例: P04）">
            <input
              className={INPUT_CLASS}
              value={pallet.code}
              onChange={(e) => onChange({ ...pallet, code: e.target.value.toUpperCase() })}
              disabled={!isNew}
              placeholder="例: P04"
            />
          </Field>
          <Field label="名称">
            <input
              className={INPUT_CLASS}
              value={pallet.name}
              onChange={(e) => onChange({ ...pallet, name: e.target.value })}
              placeholder="例: 特殊パレット(900)"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="幅（mm）">
              <input
                type="number"
                min={1}
                className={INPUT_CLASS}
                value={pallet.widthMM}
                onChange={(e) => onChange({ ...pallet, widthMM: parseInt(e.target.value, 10) || 0 })}
              />
            </Field>
            <Field label="奥行き（mm）">
              <input
                type="number"
                min={1}
                className={INPUT_CLASS}
                value={pallet.depthMM}
                onChange={(e) => onChange({ ...pallet, depthMM: parseInt(e.target.value, 10) || 0 })}
              />
            </Field>
            <Field label="高さ（mm）">
              <input
                type="number"
                min={1}
                className={INPUT_CLASS}
                value={pallet.heightMM}
                onChange={(e) => onChange({ ...pallet, heightMM: parseInt(e.target.value, 10) || 0 })}
              />
            </Field>
            <Field label="最大荷重（kg）">
              <input
                type="number"
                min={1}
                className={INPUT_CLASS}
                value={pallet.maxWeightKg}
                onChange={(e) => onChange({ ...pallet, maxWeightKg: parseInt(e.target.value, 10) || 0 })}
              />
            </Field>
          </div>
          <Field label="積載総高さ (mm)" hint="製品込みのパレット全体の高さ。2段積み判定に使用します（パレット板＋製品高さの合計）">
            <input
              type="number" min={100} max={3000} step={10}
              className={INPUT_CLASS}
              value={pallet.loadedHeightMM ?? 1200}
              onChange={(e) => onChange({ ...pallet, loadedHeightMM: parseInt(e.target.value, 10) || 1200 })}
              placeholder="1200"
            />
          </Field>
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
            サイズ: {pallet.widthMM} × {pallet.depthMM} mm　板高さ: {pallet.heightMM} mm
            最大荷重: {pallet.maxWeightKg.toLocaleString()} kg　積載総高さ: {(pallet.loadedHeightMM ?? 1200).toLocaleString()} mm
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            キャンセル
          </button>
          <button onClick={onSave} className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {hint && <p className="text-[10px] text-slate-400 mb-1">{hint}</p>}
      {children}
    </div>
  );
}

const INPUT_CLASS =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

// ─── 積付計算コンポーネント ──────────────────────────────────────────────────

/** 段ボール寸法と向きを考慮してパレット上の最適配置を計算する */
function calcPalletLayout(
  boxW: number, boxD: number, boxH: number,
  palletW: number, palletD: number, palletBoardH: number,
  maxLoadHeightMM: number,
) {
  if (boxW <= 0 || boxD <= 0 || boxH <= 0 || palletW <= 0 || palletD <= 0) return null;

  // 向き①: 段ボールをそのまま（W→幅方向, D→奥行き方向）
  const cols1 = Math.floor(palletW / boxW);
  const rows1 = Math.floor(palletD / boxD);
  // 向き②: 段ボールを90°回転（D→幅方向, W→奥行き方向）
  const cols2 = Math.floor(palletW / boxD);
  const rows2 = Math.floor(palletD / boxW);

  // より多くのせできる向きを採用
  const [cols, rows, orientated] = cols1 * rows1 >= cols2 * rows2
    ? [cols1, rows1, false]
    : [cols2, rows2, true];

  if (cols <= 0 || rows <= 0) return null;

  // パレット板を除いた利用可能な高さ内で何段積めるか
  const availableH = maxLoadHeightMM - palletBoardH;
  if (availableH <= 0) return null;
  const layers = Math.max(1, Math.floor(availableH / boxH));

  const perPallet = cols * rows * layers;
  const loadedHeightMM = palletBoardH + layers * boxH;

  return { cols, rows, layers, perPallet, loadedHeightMM, orientated };
}

// ─── パレット配置図コンポーネント ──────────────────────────────────────────

const BOX_COLORS = [
  '#a5b4fc', '#86efac', '#fcd34d', '#f9a8d4', '#a5b4fc',
  '#6ee7b7', '#fdba74', '#e9d5ff', '#99f6e4', '#c7d2fe',
];

function PalletDiagram({
  result, boxW, boxD, boxH, pallet,
}: {
  result: { cols: number; rows: number; layers: number; perPallet: number; loadedHeightMM: number; orientated: boolean };
  boxW: number; boxD: number; boxH: number;
  pallet: PalletType;
}) {
  // orientated = true のとき段ボールが90°回転：幅方向=boxD, 奥行き方向=boxW
  const bx = result.orientated ? boxD : boxW; // パレット幅方向
  const by = result.orientated ? boxW : boxD; // パレット奥行き方向

  // ── 上面図スケール ──
  const TOP_MAX = 220;
  const topScale = TOP_MAX / Math.max(pallet.widthMM, pallet.depthMM);
  const pw = Math.round(pallet.widthMM * topScale);
  const pd = Math.round(pallet.depthMM * topScale);
  const bxs = bx * topScale;
  const bys = by * topScale;
  const usedW = result.cols * bxs;
  const usedD = result.rows * bys;

  // ── 側面図スケール ──
  const SIDE_H = 180;
  const totalH = pallet.heightMM + result.layers * boxH;
  const sideScale = SIDE_H / totalH;
  const palBoardPx = Math.max(4, pallet.heightMM * sideScale);
  const boxHpx = boxH * sideScale;
  const SIDE_W = 110;

  return (
    <div className="flex flex-wrap gap-6 items-start p-4 bg-slate-50 rounded-lg border border-slate-200 mt-2">

      {/* 上面図 */}
      <div className="flex flex-col items-center gap-1">
        <div className="text-[11px] font-bold text-slate-600">上面図（1段目レイアウト）</div>
        <svg width={pw + 6} height={pd + 6} style={{ display: 'block', overflow: 'visible' }}>
          {/* パレット面 */}
          <rect x={3} y={3} width={pw} height={pd}
            fill="#f5efe0" stroke="#a07840" strokeWidth={1.5} rx={2} />
          {/* 使用エリアのガイド */}
          <rect x={3} y={3} width={usedW} height={usedD}
            fill="none" stroke="#c4a47c" strokeWidth={0.5} strokeDasharray="3,2" />
          {/* 段ボール */}
          {Array.from({ length: result.rows }, (_, row) =>
            Array.from({ length: result.cols }, (_, col) => {
              const ci = (row * result.cols + col) % BOX_COLORS.length;
              return (
                <g key={`${row}-${col}`}>
                  <rect
                    x={3 + col * bxs + 0.5}
                    y={3 + row * bys + 0.5}
                    width={bxs - 1}
                    height={bys - 1}
                    fill={BOX_COLORS[ci]}
                    stroke="#475569"
                    strokeWidth={0.5}
                    opacity={0.85}
                    rx={1}
                  />
                  {/* 中央に番号 */}
                  {bxs > 18 && bys > 14 && (
                    <text
                      x={3 + col * bxs + bxs / 2}
                      y={3 + row * bys + bys / 2 + 3}
                      fontSize={Math.min(9, bxs / 3)}
                      fill="#1e293b"
                      textAnchor="middle"
                      fontWeight="600"
                    >
                      {row * result.cols + col + 1}
                    </text>
                  )}
                </g>
              );
            })
          )}
          {/* 幅寸法ラベル */}
          <text x={3 + pw / 2} y={pd + 14} fontSize={8} fill="#64748b" textAnchor="middle">{pallet.widthMM}mm</text>
          {/* 奥行き寸法ラベル（縦） */}
          <text x={-pd / 2 - 3} y={-9} fontSize={8} fill="#64748b" textAnchor="middle"
            transform={`rotate(-90) translate(0,0)`}>{pallet.depthMM}mm</text>
        </svg>
        <div className="text-[9px] text-slate-500 mt-1">
          {result.cols}列 × {result.rows}行 = {result.cols * result.rows}個/段
          {result.orientated && <span className="ml-1.5 text-indigo-500 font-medium">（90°回転配置）</span>}
        </div>
        {/* 余白情報 */}
        <div className="text-[9px] text-slate-400">
          余白: 幅 {pallet.widthMM - result.cols * bx}mm / 奥 {pallet.depthMM - result.rows * by}mm
        </div>
      </div>

      {/* 側面図 */}
      <div className="flex flex-col items-center gap-1">
        <div className="text-[11px] font-bold text-slate-600">側面図（高さ方向）</div>
        <svg width={SIDE_W + 55} height={SIDE_H + 24} style={{ display: 'block' }}>
          {/* パレット板 */}
          <rect x={4} y={SIDE_H - palBoardPx + 2} width={SIDE_W} height={palBoardPx}
            fill="#a07840" stroke="#7c5a3a" strokeWidth={1} rx={1} />
          <text x={4 + SIDE_W / 2} y={SIDE_H + 2} fontSize={7} fill="#7c5a3a" textAnchor="middle">
            板 {pallet.heightMM}mm
          </text>

          {/* 積み段 */}
          {Array.from({ length: result.layers }, (_, layer) => {
            const y = SIDE_H - palBoardPx - (layer + 1) * boxHpx + 2;
            const ci = layer % BOX_COLORS.length;
            return (
              <g key={layer}>
                <rect
                  x={4} y={y} width={SIDE_W} height={boxHpx - 0.5}
                  fill={BOX_COLORS[ci]} stroke="#475569" strokeWidth={0.5} rx={1}
                />
                <text
                  x={4 + SIDE_W / 2} y={y + boxHpx / 2 + 3}
                  fontSize={Math.min(8, boxHpx - 2)} fill="#1e293b"
                  textAnchor="middle" fontWeight="600"
                >
                  {layer + 1}段
                </text>
                {/* 右側に高さラベル */}
                <text x={SIDE_W + 8} y={y + boxHpx / 2 + 3} fontSize={7} fill="#64748b">
                  {boxH}mm
                </text>
              </g>
            );
          })}

          {/* 総高さ矢印 */}
          <line
            x1={SIDE_W + 42} y1={2}
            x2={SIDE_W + 42} y2={SIDE_H + 2}
            stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="2,2"
          />
          <text x={SIDE_W + 46} y={SIDE_H / 2 + 3} fontSize={8} fill="#374151" fontWeight="700">
            {result.loadedHeightMM}mm
          </text>
          <text x={SIDE_W + 46} y={SIDE_H / 2 + 12} fontSize={7} fill="#94a3b8">
            (総高)
          </text>
        </svg>
        <div className="text-[9px] text-slate-500">
          {pallet.heightMM}（板）+ {boxH}×{result.layers}段 = {result.loadedHeightMM}mm
        </div>
      </div>

      {/* サマリー */}
      <div className="flex flex-col gap-2 text-xs min-w-[200px]">
        <div className="font-bold text-slate-700 text-sm">📊 積付サマリー</div>
        <div className="bg-white rounded border border-slate-200 p-3 flex flex-col gap-1.5">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">パレットサイズ</span>
            <span className="font-medium text-slate-700">{pallet.widthMM}×{pallet.depthMM}mm</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">段ボールサイズ</span>
            <span className="font-medium text-slate-700">
              {boxW}×{boxD}×{boxH}mm
              {result.orientated && <span className="ml-1 text-[9px] text-indigo-500">↺</span>}
            </span>
          </div>
          <div className="border-t border-slate-100 my-0.5" />
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">床面配置</span>
            <span className="font-medium text-slate-700">{result.cols}列 × {result.rows}行</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">積み段数</span>
            <span className="font-medium text-slate-700">{result.layers}段</span>
          </div>
          <div className="border-t border-slate-100 my-0.5" />
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">積載高さ</span>
            <span className="font-medium text-slate-700">{result.loadedHeightMM}mm</span>
          </div>
          <div className="flex justify-between gap-4 bg-emerald-50 rounded px-2 py-1">
            <span className="font-semibold text-emerald-700">合計個数/パレット</span>
            <span className="font-bold text-emerald-700 text-base">{result.perPallet}個</span>
          </div>
        </div>
        <div className="text-[9px] text-slate-400 leading-relaxed">
          ※ 上面図の数字は積み込み順の参考番号です。<br />
          ※ 縦横90°回転した場合も計算し、多い方を表示しています。
        </div>
      </div>
    </div>
  );
}


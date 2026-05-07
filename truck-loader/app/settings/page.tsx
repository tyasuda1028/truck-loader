'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import type { Factory, Product, Warehouse, PalletType } from '@/lib/types';
import { parseProductsCSV, generateProductsTemplate, downloadCSV } from '@/lib/csv';
import { buildEquipmentColorMap, buildProductColors, PRODUCT_PALETTE } from '@/lib/productColors';
import * as db from '@/lib/db';
import clsx from 'clsx';

type Tab = 'products' | 'warehouses' | 'pallets' | 'trucks' | 'factories' | 'operating';

export default function SettingsPage() {
  const {
    factories, products, warehouses, truckTypes, palletTypes,
    operatingDays, setOperatingDay,
    nonWorkingDates, toggleNonWorkingDate,
    addFactory, updateFactory, removeFactory,
    addProduct, updateProduct, removeProduct,
    addWarehouse, updateWarehouse, removeWarehouse,
    addTruckType, updateTruckType, removeTruckType,
    addPalletType, updatePalletType, removePalletType,
    upsertProducts,
    resetToDefaults,
  } = useAppStore();

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
    setDeduping(true);
    setDedupResult(null);
    try {
      const removed = await db.deduplicateProducts();
      // ストアを再ロード
      await useAppStore.getState().loadFromSupabase();
      setDedupResult(removed > 0 ? `${removed} 種類の重複を削除しました。` : '重複なし（変更なし）');
    } catch (err) {
      setDedupResult(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeduping(false);
    }
  }, []);

  const [editingFactory, setEditingFactory] = useState<Factory | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
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
    stackable: true,
    allowStackOnTop: true,
  });

  // 工場の新規追加用空テンプレート
  const newFactory = (): Factory => ({ code: '', name: '' });

  // 拠点の新規追加用空テンプレート
  const newWarehouse = (): Warehouse => ({
    code: '', name: '', group: '東', truckType: 'T06', maxPallets: 12,
  });

  // パレット型の新規追加用空テンプレート
  const newPalletType = (): PalletType => ({
    code: '', name: '', widthMM: 1100, depthMM: 1100, heightMM: 144, maxWeightKg: 1000, loadedHeightMM: 1200,
  });

  // トラック型の新規追加用空テンプレート
  const newTruckType = (): import('@/lib/types').TruckType => ({
    code: '', name: '', maxPallets: 8, cols: 2, rows: 4, widthMM: 2100, depthMM: 5200, heightMM: 2300,
  });

  const handleSaveTruck = (truck: import('@/lib/types').TruckType) => {
    setTruckOpError(null);
    const exists = truckTypes.some((t) => t.code === truck.code);
    if (exists) updateTruckType(truck);
    else addTruckType(truck);
    setEditingTruck(null);
  };

  const handleSaveFactory = () => {
    if (!editingFactory || !editingFactory.code.trim() || !editingFactory.name.trim()) return;
    const exists = factories.some((f) => f.code === editingFactory.code);
    if (exists) updateFactory(editingFactory);
    else addFactory(editingFactory);
    setEditingFactory(null);
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
    setProductOpError(null);
    try {
      await removeProduct(code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProductOpError(`削除に失敗しました: ${msg}`);
    }
  };

  const handleSaveWarehouse = () => {
    if (!editingWarehouse || !editingWarehouse.code.trim() || !editingWarehouse.name.trim()) return;
    const exists = warehouses.some((w) => w.code === editingWarehouse.code);
    if (exists) updateWarehouse(editingWarehouse);
    else addWarehouse(editingWarehouse);
    setEditingWarehouse(null);
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
          <h1 className="text-xl font-bold text-slate-800">マスタ設定</h1>
          <p className="text-sm text-slate-500 mt-0.5">製品・拠点のマスタデータを管理します</p>
        </div>
        <button
          onClick={() => resetToDefaults()}
          className="text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-300
                     px-3 py-1.5 rounded transition-colors"
        >
          デフォルトにリセット
        </button>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {([
          { key: 'products',   label: '📦 製品マスタ' },
          { key: 'warehouses', label: '🏭 拠点マスタ' },
          { key: 'pallets',    label: '🪵 パレット型' },
          { key: 'trucks',     label: '🚚 トラックマスタ' },
          { key: 'factories',  label: '🏭 工場マスタ' },
          { key: 'operating',  label: '📅 稼働日マスタ' },
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

      {/* ── 工場マスタ ── */}
      {tab === 'factories' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditingFactory(newFactory())}
              className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              + 工場を追加
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-left font-semibold">工場コード</th>
                  <th className="px-4 py-2.5 text-left font-semibold">工場名</th>
                  <th className="px-4 py-2.5 text-left font-semibold">製品数</th>
                  <th className="px-4 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {factories.map((f) => {
                  const productCount = products.filter(
                    (p) => (p.factoryCode ?? 'F001') === f.code,
                  ).length;
                  return (
                    <tr key={f.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                          {f.code}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium">{f.name}</td>
                      <td className="px-4 py-2 text-slate-500 text-xs">
                        {productCount > 0 ? (
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {productCount}製品
                          </span>
                        ) : (
                          <span className="text-slate-300">未割り当て</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setEditingFactory({ ...f })}
                          className="text-xs text-brand-600 hover:underline mr-3"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => {
                            if (productCount > 0) {
                              alert(`「${f.name}」には ${productCount} 製品が割り当てられているため削除できません。`);
                              return;
                            }
                            removeFactory(f.code);
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
            ※ 工場は出荷スケジュールと積載計画の工場別表示に使用されます。製品が割り当てられている工場は削除できません。
          </p>

          {editingFactory && (
            <FactoryModal
              factory={editingFactory}
              onChange={setEditingFactory}
              onSave={handleSaveFactory}
              onCancel={() => setEditingFactory(null)}
              isNew={!factories.some((f) => f.code === editingFactory.code)}
            />
          )}
        </div>
      )}

      {/* ── 製品マスタ ── */}
      {tab === 'products' && (
        <div>
          {/* 製品マスタ操作のエラー（追加・更新・削除） */}
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

          {/* CSVインポートパネル */}
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
                      '製品マスタ.csv',
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
                <code className="ml-1 text-slate-700">製品コード, 製品名, 個/枚, パレット型, カラー(hex), 製造工場, 器具区分, 器具名, ポジ, 仕向け, 生産方式</code>
                <div className="mt-1 text-slate-400">
                  ※ 1行目のヘッダー名で列を判定します。<strong>列順は問いません</strong>。不要な列は省略可（CSVに含まれない列は既存値が保持されます）。認識できない列は無視されます。
                </div>
                <div className="mt-1 text-slate-400">
                  ※ ポジは <code className="text-slate-600">○</code>（または true / 1 / yes）で true、空欄で false。
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
                              isNew ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700',
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
                    {csvImported && <span className="text-xs text-emerald-600">製品マスタに反映されました</span>}
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
                  <button
                    onClick={() => setEditingProduct(newProduct())}
                    className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shrink-0"
                  >
                    + 製品を追加
                  </button>
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
                  <th className="px-3 py-2.5 text-center font-semibold">器具区分</th>
                  <th className="px-3 py-2.5 text-center font-semibold">ポジ</th>
                  <th className="px-3 py-2.5 text-left font-semibold">仕向け</th>
                  <th className="px-3 py-2.5 text-center font-semibold">生産方式</th>
                  <th className="px-3 py-2.5 text-center font-semibold" title="上段積み可 / 上積み許可">2段積み</th>
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
                                <td className="px-3 py-2 text-center text-slate-600 text-xs">{p.equipmentCategory ?? '—'}</td>
                                <td className="px-3 py-2 text-center">
                                  {p.poji
                                    ? <span className="text-emerald-600 font-bold">○</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-slate-600 text-xs">{p.destination ?? '—'}</td>
                                <td className="px-3 py-2 text-center text-slate-600 text-xs">{p.productionMethod ?? '—'}</td>
                                <td className="px-3 py-2 text-center">
                                  <StackingBadge stackable={p.stackable} allowStackOnTop={p.allowStackOnTop} />
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

      {/* ── 拠点マスタ ── */}
      {tab === 'warehouses' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditingWarehouse(newWarehouse())}
              className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              + 拠点を追加
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-left font-semibold">拠点コード</th>
                  <th className="px-4 py-2.5 text-left font-semibold">拠点名</th>
                  <th className="px-4 py-2.5 text-left font-semibold">区分</th>
                  <th className="px-4 py-2.5 text-left font-semibold">車種</th>
                  <th className="px-4 py-2.5 text-right font-semibold">最大P数</th>
                  <th className="px-4 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => {
                  const truck = truckTypes.find((t) => t.code === w.truckType);
                  return (
                    <tr key={w.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{w.code}</td>
                      <td className="px-4 py-2 font-medium">{w.name}</td>
                      <td className="px-4 py-2">
                        <span className={clsx(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                          w.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                        )}>
                          {w.group}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500 text-xs">
                        {truck?.name ?? w.truckType}
                      </td>
                      <td className="px-4 py-2 text-right">{w.maxPallets}枚</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setEditingWarehouse({ ...w })}
                          className="text-xs text-brand-600 hover:underline mr-3"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => {
                            removeWarehouse(w.code);
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

          {/* 拠点編集モーダル */}
          {editingWarehouse && (
            <WarehouseModal
              warehouse={editingWarehouse}
              truckTypes={truckTypes}
              onChange={setEditingWarehouse}
              onSave={handleSaveWarehouse}
              onCancel={() => setEditingWarehouse(null)}
              isNew={!warehouses.some((w) => w.code === editingWarehouse.code)}
            />
          )}
        </div>
      )}

      {/* ── パレット型マスタ ── */}
      {tab === 'pallets' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditingPallet(newPalletType())}
              className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              + パレット型を追加
            </button>
          </div>

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
                            removePalletType(pt.code);
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

      {/* ── トラックマスタ ── */}
      {tab === 'trucks' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditingTruck(newTruckType())}
              className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              + トラックを追加
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-left font-semibold">コード</th>
                  <th className="px-4 py-2.5 text-left font-semibold">名称</th>
                  <th className="px-4 py-2.5 text-right font-semibold">最大P数</th>
                  <th className="px-4 py-2.5 text-right font-semibold">列×行</th>
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
                      <td className="px-4 py-2 text-right">{t.maxPallets}枚</td>
                      <td className="px-4 py-2 text-right text-slate-500 text-xs">
                        {t.cols}列 × {t.rows}行
                      </td>
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
                            removeTruckType(t.code);
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

      {/* ── 稼働日マスタ ── */}
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
                              ? i >= 5 ? 'border-blue-400 bg-blue-500 text-white' : 'border-brand-500 bg-brand-600 text-white'
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
            i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-slate-500',
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
                isSat && !isNonWorking && !isDefaultOff ? 'text-blue-600' :
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
function StackingBadge({
  stackable,
  allowStackOnTop,
}: {
  stackable?: boolean;
  allowStackOnTop?: boolean;
}) {
  const canUpper = stackable !== false;
  const canBottom = allowStackOnTop !== false;
  if (canUpper && canBottom) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
        ✓ 両可
      </span>
    );
  }
  if (!canUpper && !canBottom) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600">
        ✕ 床面のみ
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 items-center">
      {!canUpper && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
          上段×
        </span>
      )}
      {!canBottom && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
          上積×
        </span>
      )}
    </div>
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
  const [maxPallets, setMaxPallets] = useState(String(truck.maxPallets));
  const [heightMM,   setHeightMM]   = useState(String(truck.heightMM));
  const [cols,       setCols]       = useState(String(truck.cols));
  const [rows,       setRows]       = useState(String(truck.rows));
  const [widthMM,    setWidthMM]    = useState(String(truck.widthMM));
  const [depthMM,    setDepthMM]    = useState(String(truck.depthMM));
  const [error,      setError]      = useState<string | null>(null);

  // プレビュー用に現在値を数値化（無効なら元の値）
  const pMaxPallets = parseInt(maxPallets, 10) || 0;
  const pHeightMM   = parseInt(heightMM, 10)   || 0;
  const pCols       = parseInt(cols, 10)        || 0;
  const pRows       = parseInt(rows, 10)        || 0;
  const pWidthMM    = parseInt(widthMM, 10)     || 0;
  const pDepthMM    = parseInt(depthMM, 10)     || 0;

  const handleSave = () => {
    if (!code.trim() || !name.trim()) { setError('コードと名称は必須です'); return; }
    if (!pMaxPallets || !pCols || !pRows) { setError('最大P数・列数・行数は1以上の整数を入力してください'); return; }
    if (!pHeightMM)  { setError('荷室高さは100mm以上の値を入力してください'); return; }
    if (!pWidthMM || !pDepthMM) { setError('荷台幅・奥行きを入力してください'); return; }
    onSave({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      maxPallets: pMaxPallets,
      heightMM:   pHeightMM,
      cols:       pCols,
      rows:       pRows,
      widthMM:    pWidthMM,
      depthMM:    pDepthMM,
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="最大パレット数">
              <input
                type="number" min={1} max={30}
                className={INPUT_CLASS}
                value={maxPallets}
                onChange={(e) => setMaxPallets(e.target.value)}
              />
            </Field>
            <Field label="荷室高さ（mm）" hint="2段積み判定に使用">
              <input
                type="number" min={100} step={50}
                className={INPUT_CLASS}
                value={heightMM}
                onChange={(e) => setHeightMM(e.target.value)}
                placeholder="2300"
              />
            </Field>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] text-slate-400 mb-2">荷台グリッド（積載レイアウト表示用）</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="横列数（幅方向）">
                <input
                  type="number" min={1} max={4}
                  className={INPUT_CLASS}
                  value={cols}
                  onChange={(e) => setCols(e.target.value)}
                />
              </Field>
              <Field label="縦行数（奥行き方向）">
                <input
                  type="number" min={1} max={20}
                  className={INPUT_CLASS}
                  value={rows}
                  onChange={(e) => setRows(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] text-slate-400 mb-2">荷台サイズ（mm）</p>
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
            最大P数: {pMaxPallets || '—'}枚　グリッド: {pCols || '—'}列 × {pRows || '—'}行
            　荷台: {pWidthMM ? pWidthMM.toLocaleString() : '—'} × {pDepthMM ? pDepthMM.toLocaleString() : '—'} mm
            　荷室高: {pHeightMM ? pHeightMM.toLocaleString() : '—'} mm
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
function FactoryModal({
  factory, onChange, onSave, onCancel, isNew,
}: {
  factory: Factory;
  onChange: (f: Factory) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
        <h3 className="font-bold text-slate-800 mb-4">{isNew ? '工場を追加' : '工場を編集'}</h3>
        <div className="flex flex-col gap-3">
          <Field label="工場コード（例: F001）">
            <input
              className={INPUT_CLASS}
              value={factory.code}
              onChange={(e) => onChange({ ...factory, code: e.target.value.toUpperCase() })}
              disabled={!isNew}
              placeholder="例: F001"
            />
          </Field>
          <Field label="工場名">
            <input
              className={INPUT_CLASS}
              value={factory.name}
              onChange={(e) => onChange({ ...factory, name: e.target.value })}
              placeholder="例: 東京本社工場"
            />
          </Field>
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
          <Field label="器具区分">
            <input
              className={INPUT_CLASS}
              value={product.equipmentCategory ?? ''}
              onChange={(e) => onChange({ ...product, equipmentCategory: e.target.value })}
              placeholder="例: 101"
            />
          </Field>
          <Field label="器具名" hint="同じ器具名の製品は同じ色で表示されます">
            <input
              className={INPUT_CLASS}
              value={product.equipmentName ?? ''}
              onChange={(e) => onChange({ ...product, equipmentName: e.target.value })}
              placeholder="例: 元止め湯沸"
            />
          </Field>
          <Field label="ポジ">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={product.poji ?? false}
                onChange={(e) => onChange({ ...product, poji: e.target.checked })}
                className="w-4 h-4 accent-brand-600"
              />
              <span className="text-sm text-slate-600">{product.poji ? '○' : '—'}</span>
            </label>
          </Field>
          <Field label="仕向け">
            <input
              className={INPUT_CLASS}
              value={product.destination ?? ''}
              onChange={(e) => onChange({ ...product, destination: e.target.value })}
              placeholder="例: 量販 / 一般"
            />
          </Field>
          <Field label="生産方式">
            <input
              className={INPUT_CLASS}
              value={product.productionMethod ?? ''}
              onChange={(e) => onChange({ ...product, productionMethod: e.target.value })}
              placeholder="例: A"
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
          {/* 2段積み設定 */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-600 mb-2">2段積み条件</p>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={product.stackable !== false}
                  onChange={(e) => onChange({ ...product, stackable: e.target.checked })}
                  className="w-4 h-4 mt-0.5 accent-brand-600"
                />
                <div>
                  <span className="text-sm text-slate-700 font-medium">上段積み可</span>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                    この製品を2段目（上段）に積めます。<br />
                    OFFにすると、この製品は常に床面（1段目）のみに配置されます。
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={product.allowStackOnTop !== false}
                  onChange={(e) => onChange({ ...product, allowStackOnTop: e.target.checked })}
                  className="w-4 h-4 mt-0.5 accent-brand-600"
                />
                <div>
                  <span className="text-sm text-slate-700 font-medium">上積み許可</span>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                    この製品の上に別の製品を積めます。<br />
                    OFFにすると、この製品は必ず最上段に置かれ、上には何も積みません。
                  </p>
                </div>
              </label>
            </div>
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
function WarehouseModal({
  warehouse, truckTypes, onChange, onSave, onCancel, isNew,
}: {
  warehouse: Warehouse;
  truckTypes: import('@/lib/types').TruckType[];
  onChange: (w: Warehouse) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
        <h3 className="font-bold text-slate-800 mb-4">{isNew ? '拠点を追加' : '拠点を編集'}</h3>
        <div className="flex flex-col gap-3">
          <Field label="拠点コード">
            <input
              className={INPUT_CLASS}
              value={warehouse.code}
              onChange={(e) => onChange({ ...warehouse, code: e.target.value })}
              disabled={!isNew}
              placeholder="例: W001"
            />
          </Field>
          <Field label="拠点名">
            <input
              className={INPUT_CLASS}
              value={warehouse.name}
              onChange={(e) => onChange({ ...warehouse, name: e.target.value })}
              placeholder="例: 東京営業所"
            />
          </Field>
          <Field label="エリア区分">
            <select
              className={INPUT_CLASS}
              value={warehouse.group}
              onChange={(e) => onChange({ ...warehouse, group: e.target.value as '東' | '西' })}
            >
              <option value="東">東</option>
              <option value="西">西</option>
            </select>
          </Field>
          <Field label="使用車種">
            <select
              className={INPUT_CLASS}
              value={warehouse.truckType}
              onChange={(e) => onChange({ ...warehouse, truckType: e.target.value })}
            >
              {truckTypes.map((t) => (
                <option key={t.code} value={t.code}>{t.code} - {t.name}</option>
              ))}
            </select>
          </Field>
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

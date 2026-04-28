'use client';

import { useState, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import type { Factory, Product, Warehouse, PalletType } from '@/lib/types';
import { parseProductsCSV, generateProductsTemplate, downloadCSV } from '@/lib/csv';
import clsx from 'clsx';

const PRESET_COLORS = [
  '#4A90D9','#2ECC71','#E67E22','#9B59B6',
  '#E74C3C','#1ABC9C','#F39C12','#C0392B',
  '#3498DB','#27AE60','#D35400','#8E44AD',
];

type Tab = 'products' | 'warehouses' | 'pallets' | 'factories' | 'operating';

export default function SettingsPage() {
  const {
    factories, products, warehouses, truckTypes, palletTypes,
    operatingDays, setOperatingDay,
    addFactory, updateFactory, removeFactory,
    addProduct, updateProduct, removeProduct,
    addWarehouse, updateWarehouse, removeWarehouse,
    addPalletType, updatePalletType, removePalletType,
    upsertProducts,
    resetToDefaults,
  } = useAppStore();

  const [tab, setTab] = useState<Tab>('products');
  const [editingFactory, setEditingFactory] = useState<Factory | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [editingPallet, setEditingPallet] = useState<PalletType | null>(null);

  // 製品CSV インポート用
  const prodCsvRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseProductsCSV> | null>(null);
  const [csvImported, setCsvImported] = useState(false);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [productOpError, setProductOpError] = useState<string | null>(null);

  // 製品の新規追加用空テンプレート
  const newProduct = (): Product => ({
    code: '', name: '', capacityPerPallet: 40, palletType: 'P03', color: PRESET_COLORS[0],
    factoryCode: factories[0]?.code ?? 'F001',
  });

  // 工場の新規追加用空テンプレート
  const newFactory = (): Factory => ({ code: '', name: '' });

  // 拠点の新規追加用空テンプレート
  const newWarehouse = (): Warehouse => ({
    code: '', name: '', group: '東', truckType: 'T06', maxPallets: 12,
  });

  // パレット型の新規追加用空テンプレート
  const newPalletType = (): PalletType => ({
    code: '', name: '', widthMM: 1100, depthMM: 1100, heightMM: 144, maxWeightKg: 1000,
  });

  const handleSaveFactory = () => {
    if (!editingFactory || !editingFactory.code.trim() || !editingFactory.name.trim()) return;
    const exists = factories.some((f) => f.code === editingFactory.code);
    if (exists) updateFactory(editingFactory);
    else addFactory(editingFactory);
    setEditingFactory(null);
  };

  const handleSaveProduct = async () => {
    if (!editingProduct || !editingProduct.code.trim() || !editingProduct.name.trim()) return;
    setProductOpError(null);
    const exists = products.some((p) => p.code === editingProduct.code);
    try {
      if (exists) await updateProduct(editingProduct);
      else await addProduct(editingProduct);
      setEditingProduct(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProductOpError(`保存に失敗しました: ${msg}`);
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

          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditingProduct(newProduct())}
              className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              + 製品を追加
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="px-3 py-2.5 text-left font-semibold">色</th>
                  <th className="px-3 py-2.5 text-left font-semibold">商品コード</th>
                  <th className="px-3 py-2.5 text-left font-semibold">商品名</th>
                  <th className="px-3 py-2.5 text-right font-semibold">個/パレット</th>
                  <th className="px-3 py-2.5 text-left font-semibold">パレット型</th>
                  <th className="px-3 py-2.5 text-left font-semibold">製造工場</th>
                  <th className="px-3 py-2.5 text-center font-semibold">器具区分</th>
                  <th className="px-3 py-2.5 text-left font-semibold">器具名</th>
                  <th className="px-3 py-2.5 text-center font-semibold">ポジ</th>
                  <th className="px-3 py-2.5 text-left font-semibold">仕向け</th>
                  <th className="px-3 py-2.5 text-center font-semibold">生産方式</th>
                  <th className="px-3 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const factory = factories.find((f) => f.code === (p.factoryCode ?? 'F001'));
                  return (
                    <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <span className="w-5 h-5 rounded border border-black/10 block" style={{ background: p.color }} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{p.code}</td>
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 text-right">{p.capacityPerPallet}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs">{p.palletType}</td>
                      <td className="px-3 py-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                          {factory?.name ?? p.factoryCode ?? 'F001'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600">{p.equipmentCategory ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{p.equipmentName ?? '—'}</td>
                      <td className="px-3 py-2 text-center">{p.poji ? <span className="text-emerald-600 font-bold">○</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-600">{p.destination ?? '—'}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{p.productionMethod ?? '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => setEditingProduct({ ...p })} className="text-xs text-brand-600 hover:underline mr-3">編集</button>
                        <button onClick={() => handleRemoveProduct(p.code)} className="text-xs text-red-400 hover:underline">削除</button>
                      </td>
                    </tr>
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
              onChange={setEditingProduct}
              onSave={handleSaveProduct}
              onCancel={() => setEditingProduct(null)}
              isNew={!products.some((p) => p.code === editingProduct.code)}
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
                  <th className="px-4 py-2.5 text-right font-semibold">高さ（mm）</th>
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

      {/* ── 稼働日マスタ ── */}
      {tab === 'operating' && (
        <div>
          <p className="text-xs text-slate-500 mb-4">
            工場ごとに稼働する曜日を設定します。チェックした曜日が出荷計画の対象となります。
          </p>
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left" style={{ minWidth: 160 }}>工場</th>
                  {['月', '火', '水', '木', '金', '土', '日'].map((d, i) => (
                    <th key={i} className="text-center" style={{
                      minWidth: 52,
                      color: i === 5 ? '#2563eb' : i === 6 ? '#dc2626' : undefined,
                    }}>{d}</th>
                  ))}
                  <th className="text-center" style={{ minWidth: 60 }}>稼働日数</th>
                </tr>
              </thead>
              <tbody>
                {factories.map((f) => {
                  const days: boolean[] = operatingDays[f.code] ?? [true, true, true, true, true, false, false];
                  const count = days.filter(Boolean).length;
                  return (
                    <tr key={f.code}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 700, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                            {f.code}
                          </span>
                          <span className="font-medium text-slate-700">{f.name}</span>
                        </div>
                      </td>
                      {days.map((active, dayIdx) => (
                        <td key={dayIdx} className="text-center" style={{ padding: '6px 4px' }}>
                          <button
                            onClick={() => setOperatingDay(f.code, dayIdx, !active)}
                            style={{
                              width: 34, height: 34, borderRadius: 6,
                              border: active ? '2px solid #2563eb' : '2px solid #e5e7eb',
                              background: active ? '#2563eb' : 'white',
                              color: active ? 'white' : '#d1d5db',
                              fontSize: 13, fontWeight: 700, cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            {active ? '✓' : ''}
                          </button>
                        </td>
                      ))}
                      <td className="text-center">
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                          background: count > 0 ? '#eff6ff' : '#f9fafb',
                          color: count > 0 ? '#2563eb' : '#9ca3af',
                          border: `1px solid ${count > 0 ? '#bfdbfe' : '#e5e7eb'}`,
                        }}>
                          {count}日
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
  product, factories, palletTypes, onChange, onSave, onCancel, isNew,
}: {
  product: Product;
  factories: Factory[];
  palletTypes: import('@/lib/types').PalletType[];
  onChange: (p: Product) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
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
          <Field label="器具名">
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
          <Field label="表示カラー">
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onChange({ ...product, color: c })}
                  className={clsx(
                    'w-7 h-7 rounded border-2 transition-transform',
                    product.color === c ? 'border-brand-600 scale-110' : 'border-transparent',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
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
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
            サイズ: {pallet.widthMM} × {pallet.depthMM} mm　高さ: {pallet.heightMM} mm
            最大荷重: {pallet.maxWeightKg.toLocaleString()} kg
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const INPUT_CLASS =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

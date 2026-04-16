'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { Product, Warehouse } from '@/lib/types';
import clsx from 'clsx';

const PRESET_COLORS = [
  '#4A90D9','#2ECC71','#E67E22','#9B59B6',
  '#E74C3C','#1ABC9C','#F39C12','#C0392B',
  '#3498DB','#27AE60','#D35400','#8E44AD',
];

type Tab = 'products' | 'warehouses';

export default function SettingsPage() {
  const {
    products, warehouses, truckTypes,
    addProduct, updateProduct, removeProduct,
    addWarehouse, updateWarehouse, removeWarehouse,
    resetToDefaults,
  } = useAppStore();

  const [tab, setTab] = useState<Tab>('products');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // 製品の新規追加用空テンプレート
  const newProduct = (): Product => ({
    code: '', name: '', capacityPerPallet: 40, palletType: 'P03', color: PRESET_COLORS[0],
  });

  // 拠点の新規追加用空テンプレート
  const newWarehouse = (): Warehouse => ({
    code: '', name: '', group: '東', truckType: 'T06', maxPallets: 12,
  });

  const handleSaveProduct = () => {
    if (!editingProduct || !editingProduct.code.trim() || !editingProduct.name.trim()) return;
    const exists = products.some((p) => p.code === editingProduct.code);
    if (exists) updateProduct(editingProduct);
    else addProduct(editingProduct);
    setEditingProduct(null);
  };

  const handleSaveWarehouse = () => {
    if (!editingWarehouse || !editingWarehouse.code.trim() || !editingWarehouse.name.trim()) return;
    const exists = warehouses.some((w) => w.code === editingWarehouse.code);
    if (exists) updateWarehouse(editingWarehouse);
    else addWarehouse(editingWarehouse);
    setEditingWarehouse(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">マスタ設定</h1>
          <p className="text-sm text-slate-500 mt-0.5">製品・拠点のマスタデータを管理します</p>
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          className="text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-300
                     px-3 py-1.5 rounded transition-colors"
        >
          デフォルトにリセット
        </button>
      </div>

      {/* リセット確認ダイアログ */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="font-bold text-slate-800 mb-2">リセットの確認</h3>
            <p className="text-sm text-slate-600 mb-4">
              すべての設定をデフォルト値に戻します。入力したデータはすべて失われます。よろしいですか？
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => { resetToDefaults(); setShowConfirm(false); }}
                className="px-4 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600"
              >
                リセット
              </button>
            </div>
          </div>
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {([
          { key: 'products',   label: '📦 製品マスタ' },
          { key: 'warehouses', label: '🏭 拠点マスタ' },
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

      {/* ── 製品マスタ ── */}
      {tab === 'products' && (
        <div>
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
                  <th className="px-4 py-2.5 text-left font-semibold">色</th>
                  <th className="px-4 py-2.5 text-left font-semibold">製品コード</th>
                  <th className="px-4 py-2.5 text-left font-semibold">製品名</th>
                  <th className="px-4 py-2.5 text-right font-semibold">個/枚</th>
                  <th className="px-4 py-2.5 text-left font-semibold">パレット型</th>
                  <th className="px-4 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <span
                        className="w-5 h-5 rounded border border-black/10 block"
                        style={{ background: p.color }}
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{p.code}</td>
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 text-right">{p.capacityPerPallet}</td>
                    <td className="px-4 py-2 text-slate-500">{p.palletType}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => setEditingProduct({ ...p })}
                        className="text-xs text-brand-600 hover:underline mr-3"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`「${p.name}」を削除しますか？`)) removeProduct(p.code);
                        }}
                        className="text-xs text-red-400 hover:underline"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 製品編集モーダル */}
          {editingProduct && (
            <ProductModal
              product={editingProduct}
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
                            if (confirm(`「${w.name}」を削除しますか？`)) removeWarehouse(w.code);
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
    </div>
  );
}

// ─── 製品モーダル ──────────────────────────────────────────────────────
function ProductModal({
  product, onChange, onSave, onCancel, isNew,
}: {
  product: Product;
  onChange: (p: Product) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
        <h3 className="font-bold text-slate-800 mb-4">{isNew ? '製品を追加' : '製品を編集'}</h3>
        <div className="flex flex-col gap-3">
          <Field label="製品コード">
            <input
              className={INPUT_CLASS}
              value={product.code}
              onChange={(e) => onChange({ ...product, code: e.target.value })}
              disabled={!isNew}
              placeholder="例: 1064521424"
            />
          </Field>
          <Field label="製品名">
            <input
              className={INPUT_CLASS}
              value={product.name}
              onChange={(e) => onChange({ ...product, name: e.target.value })}
              placeholder="例: PH-5BN (A色)"
            />
          </Field>
          <Field label="個/枚（パレット容量）">
            <input
              type="number"
              className={INPUT_CLASS}
              value={product.capacityPerPallet}
              onChange={(e) => onChange({ ...product, capacityPerPallet: parseInt(e.target.value, 10) || 1 })}
            />
          </Field>
          <Field label="パレット型">
            <select
              className={INPUT_CLASS}
              value={product.palletType}
              onChange={(e) => onChange({ ...product, palletType: e.target.value })}
            >
              {['P01', 'P02', 'P03'].map((t) => <option key={t}>{t}</option>)}
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

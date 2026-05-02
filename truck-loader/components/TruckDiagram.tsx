'use client';

import clsx from 'clsx';
import type { TruckLoad, TruckType, TruckSlotItem, Product } from '@/lib/types';
import { calcStackingLayout } from '@/lib/calculations';

interface Props {
  load: TruckLoad;
  truckType: TruckType;
  products: Product[];
  productColors: Record<string, string>;
  productNames: Record<string, string>;
}

const CELL_W = 56;
const FLOOR_H = 50;
const UPPER_H = 42;

function PalletCell({
  item,
  emptyStyle,
  height,
  productColors,
  productNames,
  emptyLabel,
}: {
  item: TruckSlotItem | null;
  emptyStyle: string;
  height: number;
  productColors: Record<string, string>;
  productNames: Record<string, string>;
  emptyLabel: string;
}) {
  const base = 'flex flex-col items-center justify-center rounded border text-center relative overflow-hidden transition-transform';
  if (item) {
    return (
      <div
        className={clsx(base, 'border-black/10 shadow-sm cursor-default hover:scale-105')}
        style={{ background: productColors[item.productCode] ?? '#94a3b8', width: CELL_W, height }}
        title={`${item.orderNum}番 | ${productNames[item.productCode] ?? item.productCode} | 積載高${item.loadedHeightMM}mm`}
      >
        <span className="absolute top-0.5 left-0.5 bg-black/50 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none z-10">
          {item.orderNum}
        </span>
        <span className="text-[8px] font-bold text-black/70 mt-2.5 px-0.5 leading-tight text-center">
          {shortName(productNames[item.productCode] ?? item.productCode)}
        </span>
        <span className="text-[7px] text-black/40">{item.loadedHeightMM}mm</span>
      </div>
    );
  }
  return (
    <div
      className={clsx(base, emptyStyle)}
      style={{ width: CELL_W, height }}
    >
      <span className="text-[8px]">{emptyLabel}</span>
    </div>
  );
}

export function TruckDiagram({ load, truckType, products, productColors, productNames }: Props) {
  const layout = calcStackingLayout(load, truckType, products);
  const { cols, rows, floor, upper, truckHeightMM } = layout;

  const floorCount = floor.flat().filter(Boolean).length;
  const upperCount = upper.flat().filter(Boolean).length;
  const floorMax = rows * cols;
  const floorFillPct = Math.round((floorCount / (floorMax || 1)) * 100);

  // 理論的に上段が使えるか（いずれかの床面パレットが上段を許容するか）
  const minProductH = products.length > 0
    ? Math.min(...products.map((p) => p.loadedHeightMM ?? 1200))
    : 1200;
  const hasStackable = floor.some((rowArr) =>
    rowArr.some((fp) => fp !== null && fp.loadedHeightMM + minProductH <= truckHeightMM)
  );

  // 上段に積める可能性のあるセル判定
  function upperPossible(row: number, col: number): boolean {
    const fp = floor[row][col];
    return fp !== null && fp.loadedHeightMM + minProductH <= truckHeightMM;
  }

  const groupW = cols * CELL_W + (cols - 1) * 2 + 4;

  return (
    <div className="flex flex-col gap-2 select-none">

      {/* Truck direction labels */}
      <div className="flex items-center justify-between text-[10px] px-1">
        <div className="font-semibold text-slate-600 flex items-center gap-1">
          <span className="bg-slate-200 text-slate-600 rounded px-1 py-0.5 text-[9px]">← 前</span>
          <span>キャブ側</span>
        </div>
        <div className="text-slate-400 text-[9px] text-center">
          側面図（ウイング開口方向）<br />
          荷室高 {truckHeightMM.toLocaleString()} mm
        </div>
        <div className="font-semibold text-slate-600 flex items-center gap-1">
          <span>後方</span>
          <span className="bg-slate-200 text-slate-600 rounded px-1 py-0.5 text-[9px]">後 →</span>
        </div>
      </div>

      {/* Truck body */}
      <div className="border-2 border-slate-500 rounded-sm overflow-hidden">

        {/* ── 上段 ── */}
        {hasStackable && (
          <>
            <div className="bg-sky-50 border-b border-sky-200 px-2 py-0.5 flex items-center justify-between">
              <span className="text-[9px] font-bold text-sky-600">2段目（上段）</span>
              <span className="text-[9px] text-sky-400">{upperCount > 0 ? `${upperCount}枚 積載` : '空き'}</span>
            </div>
            <div className="flex gap-0 bg-sky-50/50 px-1.5 py-1">
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex gap-0.5 mr-1">
                  {Array.from({ length: cols }, (_, col) => (
                    <PalletCell
                      key={col}
                      item={upper[row][col]}
                      height={UPPER_H}
                      productColors={productColors}
                      productNames={productNames}
                      emptyStyle={upperPossible(row, col)
                        ? 'border-dashed border-sky-300 bg-sky-50 text-sky-400'
                        : 'border-dashed border-slate-200 bg-white/40 text-slate-200'}
                      emptyLabel={upperPossible(row, col) ? '可' : '—'}
                    />
                  ))}
                </div>
              ))}
            </div>
            {/* Shelf plate */}
            <div className="h-2 bg-gradient-to-b from-amber-200 to-amber-300 border-y border-amber-400" />
          </>
        )}

        {/* ── 下段（床面） ── */}
        <div className={clsx('px-1.5 py-1', hasStackable ? 'bg-slate-100/70' : 'bg-slate-50')}>
          {hasStackable && (
            <div className="text-[9px] font-bold text-slate-500 mb-0.5 ml-0.5">1段目（下段・床面）</div>
          )}
          <div className="flex gap-0">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex gap-0.5 mr-1">
                {Array.from({ length: cols }, (_, col) => (
                  <PalletCell
                    key={col}
                    item={floor[row][col]}
                    height={FLOOR_H}
                    productColors={productColors}
                    productNames={productNames}
                    emptyStyle="border-dashed border-slate-300 bg-slate-50 text-slate-300"
                    emptyLabel="空"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Floor */}
        <div className="h-2 bg-gradient-to-b from-slate-400 to-slate-500 border-t border-slate-500" />
      </div>

      {/* Depth position labels */}
      <div className="flex gap-0 px-1.5">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="text-[9px] text-center text-slate-400 mr-1" style={{ width: groupW }}>
            {row === 0 ? '①前' : row === rows - 1 ? `${row + 1}後` : `${row + 1}`}
          </div>
        ))}
      </div>

      {/* Fill rate */}
      <div className="space-y-1.5">
        <div>
          <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
            <span>床面積載率</span>
            <span className="font-semibold text-slate-700">
              {floorCount}/{floorMax} パレット ({floorFillPct}%)
            </span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all',
                floorFillPct >= 90 ? 'bg-emerald-500' : floorFillPct >= 60 ? 'bg-amber-400' : 'bg-red-400')}
              style={{ width: `${floorFillPct}%` }}
            />
          </div>
        </div>

        {upperCount > 0 && (
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>2段込み総積載</span>
              <span className="font-semibold text-sky-600">
                {floorCount + upperCount} 枚（床 {floorCount} + 上段 {upperCount}）
              </span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-400 transition-all"
                style={{ width: `${Math.min(100, Math.round((floorCount + upperCount) / (floorMax * 2) * 100))}%` }}
              />
            </div>
          </div>
        )}

        {hasStackable && upperCount === 0 && (
          <div className="text-[9px] text-sky-600 bg-sky-50 border border-sky-200 rounded px-2 py-1 leading-relaxed">
            💡 荷室高 {truckHeightMM.toLocaleString()}mm のため2段積みが可能です。
            製品マスターの「積載高さ」を設定すると上段に自動配置されます。
          </div>
        )}
      </div>
    </div>
  );
}

function shortName(name: string): string {
  return name.replace(/[\s　]*[（(].*?[）)]/g, '').trim().slice(0, 8);
}

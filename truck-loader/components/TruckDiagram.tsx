'use client';

import clsx from 'clsx';
import type { TruckLoad, TruckType, TruckSlotItem, Product, PalletType } from '@/lib/types';
import { calcStackingLayout } from '@/lib/calculations';

interface Props {
  load: TruckLoad;
  truckType: TruckType;
  products: Product[];
  palletTypes: PalletType[];
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

export function TruckDiagram({ load, truckType, products, palletTypes, productColors, productNames }: Props) {
  const layout = calcStackingLayout(load, truckType, products, palletTypes);
  const { cols, rows, layers, tierCount, truckHeightMM } = layout;

  const totalPlaced = layers.reduce((s, layer) => s + layer.flat().filter(Boolean).length, 0);
  const floorMax = rows * cols;
  const capacity = load.maxPallets || floorMax * Math.max(1, tierCount);
  const fillPct = Math.round((totalPlaced / (capacity || 1)) * 100);
  const groupW = cols * CELL_W + (cols - 1) * 2 + 4;

  // 上段（最上段）→ 床面(tier0) の順に描画
  const tiersTopDown = Array.from({ length: tierCount }, (_, i) => tierCount - 1 - i);

  return (
    <div className="flex flex-col gap-2 select-none">

      {/* Truck direction labels（モバイルは縦：前=上／後=下、PCは横：前=左／後=右）*/}
      <div className="flex items-center justify-between text-[10px] px-1">
        <div className="font-semibold text-slate-600 flex items-center gap-1">
          <span className="bg-slate-200 text-slate-600 rounded px-1 py-0.5 text-[9px]">
            <span className="sm:hidden">↑ 前</span><span className="hidden sm:inline">← 前</span>
          </span>
          <span>キャブ側</span>
        </div>
        <div className="text-slate-400 text-[9px] text-center">
          側面図（ウイング開口方向）<br />
          荷室高 {truckHeightMM.toLocaleString()} mm ・ {tierCount}段
        </div>
        <div className="font-semibold text-slate-600 flex items-center gap-1">
          <span>後方</span>
          <span className="bg-slate-200 text-slate-600 rounded px-1 py-0.5 text-[9px]">
            <span className="sm:hidden">後 ↓</span><span className="hidden sm:inline">後 →</span>
          </span>
        </div>
      </div>

      {/* Truck body（N段。上段から下段へ） */}
      <div className="border-2 border-slate-500 rounded-sm overflow-hidden">
        {tiersTopDown.map((tier, idx) => {
          const tierCount2 = layers[tier].flat().filter(Boolean).length;
          const isFloor = tier === 0;
          return (
            <div key={tier}>
              <div className={clsx('border-b px-2 py-0.5 flex items-center justify-between', isFloor ? 'bg-slate-100 border-slate-200' : 'bg-sky-50 border-sky-200')}>
                <span className={clsx('text-[9px] font-bold', isFloor ? 'text-slate-500' : 'text-sky-600')}>
                  {tier + 1}段目{isFloor ? '（床面）' : ''}
                </span>
                <span className="text-[9px] text-slate-400">{tierCount2}枚</span>
              </div>
              <div className={clsx('flex flex-col sm:flex-row gap-0 px-1.5 py-1', isFloor ? 'bg-slate-50' : 'bg-sky-50/50')}>
                {Array.from({ length: rows }, (_, row) => (
                  <div key={row} className="flex gap-0.5 mb-0.5 sm:mb-0 sm:mr-1 justify-center sm:justify-start">
                    {Array.from({ length: cols }, (_, col) => (
                      <PalletCell
                        key={col}
                        item={layers[tier][row][col]}
                        height={isFloor ? FLOOR_H : UPPER_H}
                        productColors={productColors}
                        productNames={productNames}
                        emptyStyle="border-dashed border-slate-300 bg-slate-50 text-slate-300"
                        emptyLabel={isFloor ? '空' : '—'}
                      />
                    ))}
                  </div>
                ))}
              </div>
              {/* 段間の棚板（最下段の後には床板を別途描画） */}
              {idx < tiersTopDown.length - 1 && (
                <div className="h-2 bg-gradient-to-b from-amber-200 to-amber-300 border-y border-amber-400" />
              )}
            </div>
          );
        })}
        {/* Floor */}
        <div className="h-2 bg-gradient-to-b from-slate-400 to-slate-500 border-t border-slate-500" />
      </div>

      {/* Depth position labels（横並び時のみ）*/}
      <div className="hidden sm:flex gap-0 px-1.5">
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
            <span>積載率（全{tierCount}段）</span>
            <span className="font-semibold text-slate-700">
              {totalPlaced}/{capacity} パレット ({fillPct}%)
            </span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all',
                fillPct >= 90 ? 'bg-emerald-500' : fillPct >= 60 ? 'bg-amber-400' : 'bg-red-400')}
              style={{ width: `${Math.min(100, fillPct)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function shortName(name: string): string {
  return name.replace(/[\s　]*[（(].*?[）)]/g, '').trim().slice(0, 8);
}

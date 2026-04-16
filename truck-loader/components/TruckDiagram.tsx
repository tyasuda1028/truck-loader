'use client';

import clsx from 'clsx';
import type { TruckLoad } from '@/lib/types';

interface Props {
  load: TruckLoad;
  cols: number;
  rows: number;
  productColors: Record<string, string>;
  productNames: Record<string, string>;
}

export function TruckDiagram({ load, cols, rows, productColors, productNames }: Props) {
  // パレットを1枚ずつ展開
  const slots: Array<{ productCode: string; order: number; qty: number } | null> = [];
  let orderNum = 1;
  for (const item of load.items) {
    for (let i = 0; i < item.pallets; i++) {
      slots.push({ productCode: item.productCode, order: orderNum++, qty: item.capacityPerPallet });
    }
  }
  // 空きスロット
  while (slots.length < load.maxPallets) slots.push(null);

  const fillPct = Math.round((load.totalPallets / load.maxPallets) * 100);

  return (
    <div className="flex flex-col gap-1">
      {/* キャブ側 */}
      <div className="bg-slate-700 text-white text-center text-[10px] font-bold py-1 rounded-t tracking-widest">
        ▲ キャブ側（前方）
      </div>

      {/* グリッド本体 */}
      <div
        className="border-2 border-slate-600 bg-slate-100 p-1.5 rounded-sm"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '4px',
        }}
      >
        {slots.map((slot, i) =>
          slot ? (
            <div
              key={i}
              title={`${slot.order}番目 | ${productNames[slot.productCode] ?? slot.productCode} | ${slot.qty}個/枚`}
              className="relative flex flex-col items-center justify-center rounded border border-black/10 text-center
                         cursor-default hover:scale-105 transition-transform shadow-sm"
              style={{
                background: productColors[slot.productCode] ?? '#94a3b8',
                minHeight: '52px',
                minWidth: '60px',
              }}
            >
              {/* 積み込み順番号 */}
              <span className="absolute top-1 left-1 bg-black/50 text-white text-[9px] font-bold
                               w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {slot.order}
              </span>
              <span className="text-[9px] font-bold text-black/70 leading-tight px-1 mt-2">
                {shortName(productNames[slot.productCode] ?? slot.productCode)}
              </span>
              <span className="text-[8px] text-black/50">{slot.qty}個</span>
            </div>
          ) : (
            <div
              key={i}
              className="border-2 border-dashed border-slate-300 bg-slate-50 rounded flex items-center justify-center"
              style={{ minHeight: '52px', minWidth: '60px' }}
            >
              <span className="text-[9px] text-slate-300">空き</span>
            </div>
          ),
        )}
      </div>

      {/* 後方 */}
      <div className="bg-slate-400 text-white text-center text-[10px] py-1 rounded-b tracking-widest">
        ▼ 後方
      </div>

      {/* 積載率バー */}
      <div className="mt-1">
        <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
          <span>積載率</span>
          <span className="font-semibold text-slate-700">
            {load.totalPallets}/{load.maxPallets} パレット ({fillPct}%)
          </span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              fillPct >= 90 ? 'bg-emerald-500' : fillPct >= 60 ? 'bg-amber-400' : 'bg-red-400',
            )}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function shortName(name: string): string {
  // 括弧内を省略して短縮
  return name.replace(/\s*\(.*?\)/, '').trim().slice(0, 10);
}

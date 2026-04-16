'use client';

import type { TruckLoad } from '@/lib/types';

interface Props {
  load: TruckLoad;
  productColors: Record<string, string>;
  productNames: Record<string, string>;
}

export function LoadingTable({ load, productColors, productNames }: Props) {
  let orderNum = 1;
  const rows = load.items.map((item) => {
    const start = orderNum;
    orderNum += item.pallets;
    return { ...item, start, end: orderNum - 1 };
  });

  const emptySlots = load.maxPallets - load.totalPallets;

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-slate-100 text-slate-500 text-left">
          <th className="px-2 py-1.5 font-semibold">順序</th>
          <th className="px-2 py-1.5 font-semibold">製品名</th>
          <th className="px-2 py-1.5 font-semibold text-right">枚数</th>
          <th className="px-2 py-1.5 font-semibold text-right">個数</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
            <td className="px-2 py-1.5">
              <span className="inline-flex items-center justify-center bg-brand-600 text-white
                               text-[9px] font-bold w-5 h-5 rounded-full">
                {row.start}
              </span>
              {row.pallets > 1 && (
                <span className="text-slate-400 ml-0.5">–{row.end}</span>
              )}
            </td>
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/10"
                  style={{ background: productColors[row.productCode] ?? '#94a3b8' }}
                />
                <span className="text-slate-700">
                  {productNames[row.productCode] ?? row.productCode}
                </span>
              </div>
            </td>
            <td className="px-2 py-1.5 text-right font-medium">{row.pallets}枚</td>
            <td className="px-2 py-1.5 text-right text-slate-500">
              {row.qty.toLocaleString()}個
              <div className="text-[9px] text-slate-400">{row.capacityPerPallet}個/枚</div>
            </td>
          </tr>
        ))}
        {emptySlots > 0 && (
          <tr className="border-t border-slate-100">
            <td className="px-2 py-1.5 text-slate-300">—</td>
            <td className="px-2 py-1.5 text-slate-300 italic" colSpan={3}>
              空きスペース {emptySlots}パレット分
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { calcWeeklyPlans, fillRate } from '@/lib/calculations';
import { TruckDiagram } from '@/components/TruckDiagram';
import { LoadingTable } from '@/components/LoadingTable';
import clsx from 'clsx';

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

export default function LoadingPlanInner() {
  const {
    factories, products, warehouses, truckTypes,
    productionPlan, distributionRatios, inventoryStock, locationStock,
    weeklyShippingSchedule,
  } = useAppStore();

  const productColors = Object.fromEntries(products.map((p) => [p.code, p.color]));
  const productNames  = Object.fromEntries(products.map((p) => [p.code, p.name]));
  const truckMap      = Object.fromEntries(truckTypes.map((t) => [t.code, t]));
  const warehouseMap  = Object.fromEntries(warehouses.map((w) => [w.code, w]));

  // 工場別・日別計画
  const weeklyPlans = useMemo(
    () =>
      calcWeeklyPlans(
        warehouses,
        products,
        truckTypes,
        factories,
        productionPlan,
        distributionRatios,
        inventoryStock,
        locationStock,
        weeklyShippingSchedule,
      ),
    [warehouses, products, truckTypes, factories, productionPlan, distributionRatios, inventoryStock, locationStock, weeklyShippingSchedule],
  );

  // 出荷計画のある工場のみ
  const activeFactories = factories.filter(
    (f) => (weeklyPlans[f.code] ?? []).length > 0,
  );

  const [selectedFactory, setSelectedFactory] = useState<string>(activeFactories[0]?.code ?? '');
  const [selectedDay, setSelectedDay] = useState<number>(-99); // -99 = unset
  const [selectedWH, setSelectedWH] = useState<string>('');
  const [selectedTruck, setSelectedTruck] = useState(0);

  // 選択中工場のプラン
  const factoryPlans = weeklyPlans[selectedFactory] ?? [];

  // 選択中工場で出荷のある曜日(-1含む)を取得
  const availableDays = useMemo(() => {
    const days = new Set<number>();
    for (const p of factoryPlans) days.add(p.dayOfWeek);
    // -1 (unscheduled) first, then Mon-Sun order
    const sorted = Array.from(days).sort((a, b) => {
      if (a === -1) return -1;
      if (b === -1) return 1;
      return a - b;
    });
    return sorted;
  }, [factoryPlans]);

  // 工場切り替え時にデフォルト日・拠点を設定
  const handleFactorySelect = (code: string) => {
    setSelectedFactory(code);
    const plans = weeklyPlans[code] ?? [];
    const days = Array.from(new Set(plans.map((p) => p.dayOfWeek))).sort((a, b) => {
      if (a === -1) return -1;
      if (b === -1) return 1;
      return a - b;
    });
    const firstDay = days[0] ?? -99;
    setSelectedDay(firstDay);
    const firstWH = plans.find((p) => p.dayOfWeek === firstDay)?.warehouseCode ?? '';
    setSelectedWH(firstWH);
    setSelectedTruck(0);
  };

  // 曜日切り替え
  const handleDaySelect = (day: number) => {
    setSelectedDay(day);
    const plansForDay = factoryPlans.filter((p) => p.dayOfWeek === day);
    setSelectedWH(plansForDay[0]?.warehouseCode ?? '');
    setSelectedTruck(0);
  };

  // 初期化: selectedDay が -99 なら最初の日を設定
  const effectiveDay = selectedDay === -99 ? (availableDays[0] ?? -99) : selectedDay;
  const plansForDay = factoryPlans.filter((p) => p.dayOfWeek === effectiveDay);

  // 選択拠点のプラン
  const plan = plansForDay.find((p) => p.warehouseCode === selectedWH)
    ?? plansForDay[0];
  const wh = plan ? warehouseMap[plan.warehouseCode] : undefined;
  const truck = wh ? truckMap[wh.truckType] : undefined;
  const load = plan?.trucks[selectedTruck];
  const fr = plan && truck ? fillRate(plan, truck.maxPallets) : 0;

  const handleWhSelect = (code: string) => {
    setSelectedWH(code);
    setSelectedTruck(0);
  };

  const dayLabel = (day: number) => {
    if (day === -1) return '未スケジュール';
    return DAY_LABELS[day] ? `${DAY_LABELS[day]}曜日` : '';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">

      {/* ── 工場タブ ── */}
      {activeFactories.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-4 flex gap-1 shrink-0">
          {activeFactories.map((f) => (
            <button
              key={f.code}
              onClick={() => handleFactorySelect(f.code)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                selectedFactory === f.code
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                {f.code}
              </span>
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* ── 曜日タブ ── */}
      {availableDays.length > 0 && (
        <div className="bg-slate-50 border-b border-slate-200 px-4 flex gap-1 shrink-0">
          {availableDays.map((day) => (
            <button
              key={day}
              onClick={() => handleDaySelect(day)}
              className={clsx(
                'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                effectiveDay === day
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600',
              )}
            >
              {day === -1 ? '週全体' : DAY_LABELS[day]}
              {day !== -1 && <span className="ml-1 opacity-60">曜</span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── 左パネル: 拠点リスト ── */}
        <aside className="w-52 shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
            {dayLabel(effectiveDay)} — 配送拠点
          </div>
          {plansForDay.length === 0 && (
            <p className="text-xs text-slate-400 p-4 italic">
              出荷計画がありません。<br />
              生産計画入力から数量を設定してください。
            </p>
          )}
          {plansForDay.map((p) => {
            const whInfo = warehouseMap[p.warehouseCode];
            const t = whInfo ? truckMap[whInfo.truckType] : undefined;
            const fr = p && t ? fillRate(p, t.maxPallets) : 0;
            const isActive = p.warehouseCode === (plan?.warehouseCode ?? '');
            return (
              <button
                key={p.warehouseCode}
                onClick={() => handleWhSelect(p.warehouseCode)}
                className={clsx(
                  'w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors',
                  isActive
                    ? 'bg-brand-50 border-l-[3px] border-l-brand-600'
                    : 'hover:bg-slate-50 border-l-[3px] border-l-transparent',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">{p.warehouseCode}</span>
                  {whInfo && (
                    <span className={clsx(
                      'text-[9px] font-bold px-1 py-0.5 rounded-full',
                      whInfo.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                    )}>
                      {whInfo.group}
                    </span>
                  )}
                </div>
                <div className="text-xs font-medium text-slate-700 mt-0.5 leading-tight">
                  {whInfo?.name ?? p.warehouseCode}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                  <span>{p.trucks.length}台</span>
                  <span>{p.totalPallets}枚</span>
                </div>
                <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      'h-full rounded-full',
                      fr >= 90 ? 'bg-emerald-500' : fr >= 60 ? 'bg-amber-400' : 'bg-red-400',
                    )}
                    style={{ width: `${fr}%` }}
                  />
                </div>
              </button>
            );
          })}
        </aside>

        {/* ── 中央: トラック図 ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
          {activeFactories.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              出荷計画がありません。生産計画入力から数量を設定してください。
            </div>
          ) : !plan || plan.trucks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              拠点を選択してください
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-lg font-bold text-slate-800">{wh?.name ?? plan.warehouseCode}</h1>
                  {wh && (
                    <span className={clsx(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      wh.group === '東' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
                    )}>
                      {wh.group}エリア
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    {factories.find((f) => f.code === selectedFactory)?.name ?? selectedFactory}
                  </span>
                  {effectiveDay >= 0 && (
                    <span className={clsx(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded',
                      effectiveDay === 5 ? 'bg-blue-100 text-blue-700' :
                      effectiveDay === 6 ? 'bg-red-100 text-red-600' :
                      'bg-slate-100 text-slate-600',
                    )}>
                      {DAY_LABELS[effectiveDay]}曜日
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {truck?.name}（最大{truck?.maxPallets}パレット）
                  ・{effectiveDay === -1 ? '週計' : DAY_LABELS[effectiveDay] + '曜日'} {plan.trucks.length}台
                  ・総計 {plan.totalPallets}パレット
                  ・出荷 {plan.totalQty.toLocaleString()}個
                </p>
              </div>

              {/* サマリーバー */}
              <div className="flex gap-4 mb-4 p-3 bg-white rounded-lg border border-slate-200 shadow-sm text-sm">
                {[
                  { label: '台数', val: `${plan.trucks.length}台` },
                  { label: '総パレット', val: `${plan.totalPallets}枚` },
                  { label: '出荷個数', val: `${plan.totalQty.toLocaleString()}個` },
                  { label: '積載率', val: `${fr}%` },
                ].map(({ label, val }) => (
                  <div key={label} className="text-center px-3">
                    <div className="font-bold text-brand-600 text-base">{val}</div>
                    <div className="text-[10px] text-slate-400">{label}</div>
                  </div>
                ))}
                <div className="flex-1 flex items-center pl-3">
                  <div className="w-full">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full transition-all',
                          fr >= 90 ? 'bg-emerald-500' : fr >= 60 ? 'bg-amber-400' : 'bg-red-400',
                        )}
                        style={{ width: `${fr}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 号車タブ */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {plan.trucks.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedTruck(i)}
                    className={clsx(
                      'px-3 py-1.5 rounded-full border text-sm transition-all',
                      selectedTruck === i
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-brand-400',
                    )}
                  >
                    {i + 1}号車
                    <span className="ml-1.5 text-[10px] opacity-70">
                      {t.totalPallets}/{t.maxPallets}
                    </span>
                  </button>
                ))}
              </div>

              {/* 積み込みのヒント */}
              <div className="text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4 text-amber-800">
                💡 <strong>積み込み手順：</strong>
                ①番から順にキャブ側（前方）から積みます。同一製品はまとめて連続積み。ウイング車は側面ドアから積み込んでください。
              </div>

              {/* トラック図 + 凡例 */}
              {load && truck && (
                <div className="flex gap-6 items-start flex-wrap">
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                    <div className="text-xs font-semibold text-slate-500 mb-3">
                      荷台上面図 ─ {selectedTruck + 1}号車
                      （{load.totalPallets}/{load.maxPallets}パレット）
                    </div>
                    <TruckDiagram
                      load={load}
                      cols={truck.cols}
                      rows={truck.rows}
                      productColors={productColors}
                      productNames={productNames}
                    />
                    <div className="text-[10px] text-slate-400 mt-2 text-center">
                      荷台 {truck.widthMM.toLocaleString()}mm × {truck.depthMM.toLocaleString()}mm
                    </div>
                  </div>

                  {/* 製品凡例 */}
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 min-w-[200px]">
                    <div className="text-xs font-semibold text-slate-500 mb-3">製品カラー凡例</div>
                    <div className="flex flex-col gap-2">
                      {[...new Set(load.items.map((i) => i.productCode))].map((code) => (
                        <div key={code} className="flex items-center gap-2 text-xs">
                          <span
                            className="w-4 h-4 rounded border border-black/10 shrink-0"
                            style={{ background: productColors[code] ?? '#ccc' }}
                          />
                          <span className="text-slate-700">{productNames[code] ?? code}</span>
                          <span className="text-slate-400 ml-auto">
                            {products.find((p) => p.code === code)?.capacityPerPallet}個/枚
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 右パネル: 積み込み手順 ── */}
        <aside className="w-64 shrink-0 bg-white border-l border-slate-200 overflow-y-auto">
          <div className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
            積み込み手順 {plan ? `— ${selectedTruck + 1}号車` : ''}
          </div>
          {load ? (
            <>
              <LoadingTable
                load={load}
                productColors={productColors}
                productNames={productNames}
              />
              <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
                <strong className="text-slate-600">積み込みメモ</strong><br />
                ① 重い製品・多パレット品を先頭（キャブ寄り）に<br />
                ② 同一製品はまとめて連続積み<br />
                ③ ウイング車は側面から積み込む
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400 p-4 italic">拠点・号車を選択してください</p>
          )}
        </aside>
      </div>
    </div>
  );
}

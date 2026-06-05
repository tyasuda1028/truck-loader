'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useAppStore } from '@/lib/store';

/** product→warehouse→qty に有効値があるか */
function hasWhQty(obj: Record<string, Record<string, number>>): boolean {
  return Object.values(obj).some((m) => Object.values(m).some((v) => v > 0));
}

export function OnboardingChecklist() {
  const {
    factories, products, warehouses,
    baselineStock, locationStock, productionPlan, weeklyShippingSchedule,
    loadSampleData,
  } = useAppStore();

  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmpty = factories.length === 0 && warehouses.length === 0 && products.length === 0;

  const steps = [
    { key: 'masters',    label: '工場・拠点・製品を登録', href: '/settings',     done: factories.length > 0 && warehouses.length > 0 && products.length > 0 },
    { key: 'baseline',   label: '基準在庫数を設定',       href: '/production',    done: hasWhQty(baselineStock) },
    { key: 'stock',      label: '現在庫を入力',           href: '/production',    done: hasWhQty(locationStock) },
    { key: 'production', label: '週間生産数を入力',       href: '/production',    done: Object.values(productionPlan).some((v) => v > 0) },
    { key: 'schedule',   label: '出荷スケジュールを設定', href: '/loading-plan',  done: Object.values(weeklyShippingSchedule).some((whMap) => Object.values(whMap).some((d) => Array.isArray(d) && d.some(Boolean))) },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const nextStep = steps.find((s) => !s.done);

  const handleSeed = async () => {
    if (seeding) return;
    setSeeding(true);
    setError(null);
    try {
      const seeded = await loadSampleData();
      if (!seeded) setError('既にデータが登録されているため、サンプルは投入しませんでした。');
    } catch {
      setError('サンプルデータの投入に失敗しました。時間をおいて再試行してください。');
    } finally {
      setSeeding(false);
    }
  };

  // ── 空テナント：まず「サンプルで始める」を大きく訴求 ──
  if (isEmpty) {
    return (
      <div className="mb-5 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-800">はじめましょう 🚚</h2>
        <p className="mt-1 text-sm text-slate-600">
          このアプリは、在庫基準と増減から「どの拠点へ・どのトラックで・どう積むか」をAIが提案します。
          <br className="hidden sm:block" />
          まずは<strong className="text-indigo-700">サンプルデータ</strong>で全体の流れを体験するのがおすすめです（あとから自社の値に書き換えられます）。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className={clsx(
              'rounded-lg px-4 py-2 text-sm font-semibold transition',
              seeding ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700',
            )}
          >
            {seeding ? 'サンプルを投入中…' : '🍃 サンプルで始める'}
          </button>
          <Link href="/settings" className="text-sm font-semibold text-slate-500 hover:text-slate-700 hover:underline">
            白紙から始める（マスタ設定へ）→
          </Link>
        </div>
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  // ── データあり：セットアップ進捗チェックリスト ──
  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-800">
          セットアップ {allDone ? '完了 ✓' : `${doneCount}/${steps.length}`}
        </h2>
        {!allDone && nextStep && (
          <Link href={nextStep.href} className="text-xs font-semibold text-indigo-600 hover:underline">
            次にやること: {nextStep.label} →
          </Link>
        )}
        {allDone && (
          <Link href="/loading-plan" className="text-xs font-semibold text-emerald-600 hover:underline">
            積載計画・AI提案を見る →
          </Link>
        )}
      </div>

      {/* 進捗バー */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={clsx('h-full rounded-full transition-all', allDone ? 'bg-emerald-500' : 'bg-indigo-500')}
          style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
        />
      </div>

      {/* ステップ */}
      <ol className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <Link
              href={s.href}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition',
                s.done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : s.key === nextStep?.key
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50',
              )}
            >
              <span className="font-bold">{s.done ? '✓' : i + 1}</span>
              <span className="font-semibold">{s.label}</span>
            </Link>
            {i < steps.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        ))}
      </ol>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

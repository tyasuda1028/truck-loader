'use client';

import clsx from 'clsx';
import type { AiRecommendation, AiWarning } from '@/lib/aiSchema';

interface Props {
  data: AiRecommendation | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  /** 配分提案を sendQtyManual へ反映するコールバック（任意） */
  onApplyAdjustment?: (productCode: string, warehouseCode: string, qty: number) => void;
  /** 製品コード→製品名（表示用、任意） */
  productNames?: Record<string, string>;
  className?: string;
}

const SEVERITY_STYLE: Record<AiWarning['severity'], string> = {
  info: 'bg-sky-50 border-sky-200 text-sky-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  critical: 'bg-rose-50 border-rose-200 text-rose-800',
};
const SEVERITY_LABEL: Record<AiWarning['severity'], string> = {
  info: '情報',
  warning: '注意',
  critical: '重大',
};

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-slate-500">{title}（{count}）</h4>
      {children}
    </div>
  );
}

export function AIRecommendationPanel({
  data, loading, error, onGenerate, onApplyAdjustment, productNames = {}, className,
}: Props) {
  const pname = (code: string) => productNames[code] ?? code;

  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>🤖</span>
          <h3 className="text-sm font-bold text-slate-800">AI提案</h3>
          <span className="text-[10px] text-slate-400">トラック選定・積載方法・配分の見直し</span>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            loading
              ? 'cursor-not-allowed bg-slate-100 text-slate-400'
              : 'bg-indigo-600 text-white hover:bg-indigo-700',
          )}
        >
          {loading ? '生成中…' : data ? '再生成' : 'AIに提案してもらう'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
          {/キー|お試し|API/.test(error) && (
            <a href="/settings" className="mt-1 block font-semibold text-rose-800 underline hover:text-rose-900">
              → 設定でGeminiキーを登録する（無料）
            </a>
          )}
        </div>
      )}

      {loading && (
        <p className="mt-3 animate-pulse text-xs text-slate-400">
          AIが計算結果を分析しています（10〜40秒ほどかかる場合があります）…
        </p>
      )}

      {!loading && !error && !data && (
        <p className="mt-3 text-xs text-slate-400">
          現在の生産数・在庫・送り数をもとに、最適なトラックと積載方法、配分の見直しをAIが提案します。
        </p>
      )}

      {data && (
        <div className="mt-4 space-y-4">
          {/* サマリ */}
          {data.summary && (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-relaxed text-indigo-900">
              {data.summary}
            </p>
          )}

          {/* ① トラック選定 */}
          <Section title="📦 トラック選定" count={data.truckSelection.length}>
            <ul className="space-y-2">
              {data.truckSelection.map((t, i) => (
                <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                  <div className="font-semibold text-slate-700">
                    {t.warehouse}：{t.recommendedTruckType} × {t.truckCount}台
                    {t.consolidateWith.length > 0 && (
                      <span className="ml-1 font-normal text-slate-500">
                        （統合候補: {t.consolidateWith.join('・')}）
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-slate-600">{t.reason}</p>
                </li>
              ))}
            </ul>
          </Section>

          {/* ② 積載方法・順序 */}
          <Section title="🔧 積載方法・順序" count={data.loadingPlan.length}>
            <ul className="space-y-2">
              {data.loadingPlan.map((lp, i) => (
                <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                  <div className="font-semibold text-slate-700">{lp.warehouse}：{lp.truckIndex}号車</div>
                  <ul className="mt-1 space-y-0.5">
                    {lp.sequence.map((s, j) => (
                      <li key={j} className="flex items-start gap-1.5 text-slate-600">
                        <span className={clsx(
                          'mt-0.5 shrink-0 rounded px-1 text-[10px] font-bold',
                          s.position === '下段' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-700',
                        )}>
                          {s.position}
                        </span>
                        <span>{pname(s.productCode)}：{s.orderNote}</span>
                      </li>
                    ))}
                  </ul>
                  {lp.note && <p className="mt-1 text-slate-500">{lp.note}</p>}
                </li>
              ))}
            </ul>
          </Section>

          {/* ③ 配分の見直し */}
          <Section title="⚖️ 送り数の見直し" count={data.distributionAdjustments.length}>
            <ul className="space-y-2">
              {data.distributionAdjustments.map((d, i) => (
                <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-700">
                      {pname(d.productCode)} → {d.warehouse}
                    </span>
                    <span className="font-mono text-slate-600">
                      {d.currentQty.toLocaleString()} → <span className="font-bold text-indigo-700">{d.suggestedQty.toLocaleString()}</span> 個
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{d.reason}</p>
                  {onApplyAdjustment && (
                    <button
                      type="button"
                      onClick={() => onApplyAdjustment(d.productCode, d.warehouse, d.suggestedQty)}
                      className="mt-1.5 rounded border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                      この提案を反映
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {/* ④ 警告 */}
          <Section title="⚠️ 警告" count={data.warnings.length}>
            <ul className="space-y-2">
              {data.warnings.map((w, i) => (
                <li key={i} className={clsx('rounded-lg border px-3 py-2 text-xs', SEVERITY_STYLE[w.severity])}>
                  <span className="mr-1.5 rounded bg-white/60 px-1 text-[10px] font-bold">
                    {SEVERITY_LABEL[w.severity]}
                  </span>
                  {w.message}
                  {w.relatedWarehouse && <span className="ml-1 opacity-70">（{w.relatedWarehouse}）</span>}
                </li>
              ))}
            </ul>
          </Section>

          {data.truckSelection.length === 0 &&
            data.loadingPlan.length === 0 &&
            data.distributionAdjustments.length === 0 &&
            data.warnings.length === 0 && (
              <p className="text-xs text-slate-400">特筆すべき提案はありませんでした。現在の計画は概ね妥当です。</p>
            )}
        </div>
      )}
    </section>
  );
}

'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useAppStore } from '@/lib/store';

const WEEK = ['月', '火', '水', '木', '金', '土', '日'];
const COLORS = ['#2ECC71', '#4A90D9', '#E67E22', '#8B5A2B', '#E74C3C', '#16A085', '#9B59B6', '#F1C40F', '#1ABC9C', '#E84393'];
const STEPS = ['開始方法', '工場', '拠点', '製品', '基準在庫数', '週間生産数', '出荷スケジュール', '完了'];

function hasWhQty(obj: Record<string, Record<string, number>>): boolean {
  return Object.values(obj).some((m) => Object.values(m).some((v) => v > 0));
}

export default function SetupWizard() {
  const s = useAppStore();
  const [step, setStep] = useState(0);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  // 各ステップの追加フォームのローカル状態
  const [fac, setFac] = useState({ code: '', name: '' });
  const [wh, setWh] = useState({ code: '', name: '', truckType: '' });
  const [prod, setProd] = useState({ code: '', name: '', cap: 0, palletType: '', factoryCode: '' });

  const isEmpty = s.factories.length === 0 && s.warehouses.length === 0 && s.products.length === 0;

  const go = (n: number) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));

  const handleSeed = async () => {
    if (seeding) return;
    setSeeding(true);
    setSeedError(null);
    try {
      const seeded = await s.loadSampleData();
      if (!seeded) setSeedError('既にデータが登録されているため、サンプルは投入しませんでした。');
      go(STEPS.length - 1); // 完了へ
    } catch {
      setSeedError('サンプル投入に失敗しました。時間をおいて再試行してください。');
    } finally {
      setSeeding(false);
    }
  };

  // ── 各ステップの「完了」判定（ヒント表示用）──
  const doneMap: Record<number, boolean> = {
    1: s.factories.length > 0,
    2: s.warehouses.length > 0,
    3: s.products.length > 0,
    4: hasWhQty(s.baselineStock),
    5: Object.values(s.productionPlan).some((v) => v > 0),
    6: Object.values(s.weeklyShippingSchedule).some((m) => Object.values(m).some((d) => Array.isArray(d) && d.some(Boolean))),
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="text-lg font-bold text-slate-800">初期設定ウィザード</h1>
      <p className="mt-0.5 text-xs text-slate-500">順番に入力するだけで、積載計画まで使える状態になります。</p>

      {/* ステップインジケータ */}
      <ol className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => go(i)}
              className={clsx(
                'rounded-full border px-2.5 py-1 font-semibold transition',
                i === step ? 'border-indigo-600 bg-indigo-600 text-white'
                  : doneMap[i] ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300',
              )}
            >
              {doneMap[i] ? '✓' : i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* ───────── Step 0: 開始方法 ───────── */}
        {step === 0 && (
          <div>
            <h2 className="text-base font-bold text-slate-800">始め方を選んでください</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className={clsx('rounded-lg border p-4', isEmpty ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50 opacity-60')}>
                <div className="text-sm font-bold text-slate-800">🍃 サンプルで始める</div>
                <p className="mt-1 text-xs text-slate-600">架空の飲料メーカーの一式を投入し、全体の流れをすぐ体験。あとから自社の値に書き換えられます。</p>
                <button
                  type="button"
                  onClick={handleSeed}
                  disabled={seeding || !isEmpty}
                  className={clsx('mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold transition',
                    seeding || !isEmpty ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700')}
                >
                  {seeding ? '投入中…' : !isEmpty ? '既にデータがあります' : 'サンプルを投入'}
                </button>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-sm font-bold text-slate-800">✏️ 自分で入力する</div>
                <p className="mt-1 text-xs text-slate-600">工場・拠点・製品から順に入力します。各ステップは数分で完了できます。</p>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900"
                >
                  入力を始める →
                </button>
              </div>
            </div>
            {seedError && <p className="mt-3 text-xs text-rose-600">{seedError}</p>}
          </div>
        )}

        {/* ───────── Step 1: 工場 ───────── */}
        {step === 1 && (
          <StepShell title="工場を登録" hint="製品を製造する工場（出荷元）を登録します。">
            <ItemList
              items={s.factories.map((f) => ({ id: f.code, label: `${f.code}　${f.name}` }))}
              onRemove={(id) => s.removeLocation(id)}
            />
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="工場コード"><input value={fac.code} onChange={(e) => setFac({ ...fac, code: e.target.value })} placeholder="F001" className={inputCls} /></Field>
              <Field label="工場名"><input value={fac.name} onChange={(e) => setFac({ ...fac, name: e.target.value })} placeholder="関東工場" className={inputCls} /></Field>
              <button
                type="button"
                disabled={!fac.code.trim() || !fac.name.trim()}
                onClick={() => { s.addLocation({ code: fac.code.trim(), name: fac.name.trim(), role: 'factory' }); setFac({ code: '', name: '' }); }}
                className={addBtnCls(!fac.code.trim() || !fac.name.trim())}
              >＋ 追加</button>
            </div>
          </StepShell>
        )}

        {/* ───────── Step 2: 拠点 ───────── */}
        {step === 2 && (
          <StepShell title="拠点（物流センター）を登録" hint="製品を届ける配送先。『受入可能な最大トラック』はドック制約として使われ、エンジンはそれ以下で最適な車種を選びます。">
            <ItemList
              items={s.warehouses.map((w) => ({ id: w.code, label: `${w.code}　${w.name}（${s.truckTypes.find((t) => t.code === w.truckType)?.name ?? w.truckType}）` }))}
              onRemove={(id) => s.removeLocation(id)}
            />
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="拠点コード"><input value={wh.code} onChange={(e) => setWh({ ...wh, code: e.target.value })} placeholder="W001" className={inputCls} /></Field>
              <Field label="拠点名"><input value={wh.name} onChange={(e) => setWh({ ...wh, name: e.target.value })} placeholder="東京物流センター" className={clsx(inputCls, 'w-44')} /></Field>
              <Field label="ドック車種">
                <select value={wh.truckType} onChange={(e) => setWh({ ...wh, truckType: e.target.value })} className={inputCls}>
                  <option value="">選択</option>
                  {s.truckTypes.map((t) => <option key={t.code} value={t.code}>{t.name}（{t.widthMM}×{t.depthMM}mm）</option>)}
                </select>
              </Field>
              <button
                type="button"
                disabled={!wh.code.trim() || !wh.name.trim() || !wh.truckType}
                onClick={() => { s.addLocation({ code: wh.code.trim(), name: wh.name.trim(), role: 'warehouse', truckType: wh.truckType }); setWh({ code: '', name: '', truckType: '' }); }}
                className={addBtnCls(!wh.code.trim() || !wh.name.trim() || !wh.truckType)}
              >＋ 追加</button>
            </div>
          </StepShell>
        )}

        {/* ───────── Step 3: 製品 ───────── */}
        {step === 3 && (
          <StepShell title="製品を登録" hint="『入数/パレット』は1パレットに何個積めるか。これが積載計算の基礎になります。">
            <ItemList
              items={s.products.map((p) => ({ id: p.code, color: p.color, label: `${p.code}　${p.name}（${p.capacityPerPallet}個/パレット・${p.palletType}）` }))}
              onRemove={(id) => s.removeProduct(id)}
            />
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="製品コード"><input value={prod.code} onChange={(e) => setProd({ ...prod, code: e.target.value })} placeholder="D001" className={inputCls} /></Field>
              <Field label="製品名"><input value={prod.name} onChange={(e) => setProd({ ...prod, name: e.target.value })} placeholder="緑茶 500ml" className={clsx(inputCls, 'w-40')} /></Field>
              <Field label="入数/パレット"><input type="number" value={prod.cap || ''} onChange={(e) => setProd({ ...prod, cap: Number(e.target.value) || 0 })} placeholder="60" className={clsx(inputCls, 'w-24')} /></Field>
              <Field label="パレット型">
                <select value={prod.palletType} onChange={(e) => setProd({ ...prod, palletType: e.target.value })} className={inputCls}>
                  <option value="">選択</option>
                  {s.palletTypes.map((pt) => <option key={pt.code} value={pt.code}>{pt.code}</option>)}
                </select>
              </Field>
              <Field label="工場">
                <select value={prod.factoryCode} onChange={(e) => setProd({ ...prod, factoryCode: e.target.value })} className={inputCls}>
                  <option value="">{s.factories.length ? '選択' : 'F001'}</option>
                  {s.factories.map((f) => <option key={f.code} value={f.code}>{f.code}</option>)}
                </select>
              </Field>
              <button
                type="button"
                disabled={!prod.code.trim() || !prod.name.trim() || prod.cap <= 0 || !prod.palletType}
                onClick={async () => {
                  await s.addProduct({
                    code: prod.code.trim(), name: prod.name.trim(), capacityPerPallet: prod.cap,
                    palletType: prod.palletType, color: COLORS[s.products.length % COLORS.length],
                    factoryCode: prod.factoryCode || s.factories[0]?.code || 'F001',
                    allowStackOnTop: true,
                  });
                  setProd({ code: '', name: '', cap: 0, palletType: '', factoryCode: '' });
                }}
                className={addBtnCls(!prod.code.trim() || !prod.name.trim() || prod.cap <= 0 || !prod.palletType)}
              >＋ 追加</button>
            </div>
          </StepShell>
        )}

        {/* ───────── Step 4: 基準在庫数 ───────── */}
        {step === 4 && (
          <StepShell title="基準在庫数を設定" hint="各拠点で維持したい目標在庫（個）。現在庫がこれを下回った分を生産から補充します。">
            {s.products.length === 0 || s.warehouses.length === 0 ? (
              <EmptyPrompt back={() => go(s.products.length === 0 ? 3 : 2)} what={s.products.length === 0 ? '製品' : '拠点'} />
            ) : (
              <QtyGrid
                products={s.products}
                warehouses={s.warehouses}
                value={(pc, wc) => s.baselineStock[pc]?.[wc] ?? 0}
                onChange={(pc, wc, v) => s.setBaseline(pc, wc, v)}
              />
            )}
          </StepShell>
        )}

        {/* ───────── Step 5: 週間生産数 ───────── */}
        {step === 5 && (
          <StepShell title="週間生産数を入力" hint="今週、各製品を何個つくるか（個）。この数量を不足のある拠点へ配分します。">
            {s.products.length === 0 ? (
              <EmptyPrompt back={() => go(3)} what="製品" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {s.products.map((p) => (
                  <label key={p.code} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />{p.name}</span>
                    <input type="number" value={s.productionPlan[p.code] || ''} onChange={(e) => s.setProductionQty(p.code, Number(e.target.value) || 0)} placeholder="0" className={clsx(inputCls, 'w-28 text-right')} />
                  </label>
                ))}
              </div>
            )}
          </StepShell>
        )}

        {/* ───────── Step 6: 出荷スケジュール ───────── */}
        {step === 6 && (
          <StepShell title="出荷スケジュールを設定" hint="各工場が出荷する曜日。週間生産はここで指定した曜日に分けて積み込まれます（全拠点共通で設定します）。">
            {s.factories.length === 0 || s.warehouses.length === 0 ? (
              <EmptyPrompt back={() => go(s.factories.length === 0 ? 1 : 2)} what={s.factories.length === 0 ? '工場' : '拠点'} />
            ) : (
              <div className="space-y-3">
                {s.factories.map((f) => {
                  const rep = s.warehouses[0]?.code;
                  const days = (rep && s.weeklyShippingSchedule[f.code]?.[rep]) || [false, false, false, false, false, false, false];
                  return (
                    <div key={f.code} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="mb-2 text-sm font-semibold text-slate-700">{f.code}　{f.name}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEK.map((w, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => s.warehouses.forEach((whx) => s.setShippingDay(f.code, whx.code, i, !days[i]))}
                            className={clsx('h-9 w-9 rounded-full border text-xs font-semibold transition',
                              days[i] ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-500 hover:border-indigo-400')}
                          >{w}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </StepShell>
        )}

        {/* ───────── Step 7: 完了 ───────── */}
        {step === 7 && (
          <div>
            <h2 className="text-base font-bold text-slate-800">設定状況</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {[
                { label: '工場', ok: s.factories.length > 0, detail: `${s.factories.length}件` },
                { label: '拠点', ok: s.warehouses.length > 0, detail: `${s.warehouses.length}件` },
                { label: '製品', ok: s.products.length > 0, detail: `${s.products.length}件` },
                { label: '基準在庫数', ok: hasWhQty(s.baselineStock), detail: hasWhQty(s.baselineStock) ? '設定済み' : '未設定' },
                { label: '週間生産数', ok: Object.values(s.productionPlan).some((v) => v > 0), detail: Object.values(s.productionPlan).some((v) => v > 0) ? '入力済み' : '未入力' },
                { label: '出荷スケジュール', ok: doneMap[6], detail: doneMap[6] ? '設定済み' : '未設定' },
              ].map((r) => (
                <li key={r.label} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className={clsx('text-base', r.ok ? 'text-emerald-500' : 'text-slate-300')}>{r.ok ? '✓' : '○'}</span>
                    {r.label}
                  </span>
                  <span className={clsx('text-xs', r.ok ? 'text-slate-500' : 'text-amber-600')}>{r.detail}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/loading-plan" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">🚛 積載計画を見る</Link>
              <Link href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">ダッシュボードへ</Link>
            </div>
          </div>
        )}

        {/* ── フッターナビ（ステップ1〜7）── */}
        {step >= 1 && (
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
            <button type="button" onClick={() => go(step - 1)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">← 戻る</button>
            <div className="flex items-center gap-2">
              {step >= 1 && step <= 6 && !doneMap[step] && (
                <button type="button" onClick={() => go(step + 1)} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-600">あとで</button>
              )}
              {step <= 6 && (
                <button type="button" onClick={() => go(step + 1)} className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-900">次へ →</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 共通パーツ ──────────────────────────────────────────────────────
const inputCls = 'rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none w-32';
const addBtnCls = (disabled: boolean) => clsx('rounded-lg px-3 py-1.5 text-sm font-semibold transition',
  disabled ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700');

function StepShell({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function ItemList({ items, onRemove }: { items: { id: string; label: string; color?: string }[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return <p className="text-xs italic text-slate-400">まだ登録がありません。下のフォームから追加してください。</p>;
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-sm">
          <span className="flex items-center gap-1.5">
            {it.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />}
            {it.label}
          </span>
          <button
            type="button"
            onClick={() => { if (window.confirm(`「${it.label}」を削除します。よろしいですか？`)) onRemove(it.id); }}
            className="text-xs text-slate-400 hover:text-rose-600"
          >削除</button>
        </li>
      ))}
    </ul>
  );
}

function EmptyPrompt({ back, what }: { back: () => void; what: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
      先に{what}を登録してください。
      <button type="button" onClick={back} className="ml-2 font-semibold underline hover:text-amber-900">{what}の登録へ →</button>
    </div>
  );
}

function QtyGrid({ products, warehouses, value, onChange }: {
  products: { code: string; name: string; color: string }[];
  warehouses: { code: string; name: string }[];
  value: (pc: string, wc: string) => number;
  onChange: (pc: string, wc: string, v: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-2 py-1.5 text-left font-semibold text-slate-500">製品 \ 拠点</th>
            {warehouses.map((w) => (
              <th key={w.code} className="border-b border-slate-200 px-1.5 py-1.5 text-center font-semibold text-slate-500" style={{ minWidth: 72 }}>{w.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.code}>
              <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-2 py-1 font-medium text-slate-700">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.name}</span>
              </td>
              {warehouses.map((w) => (
                <td key={w.code} className="border-b border-slate-100 px-1 py-1 text-center">
                  <input
                    type="number"
                    value={value(p.code, w.code) || ''}
                    onChange={(e) => onChange(p.code, w.code, Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right text-xs focus:border-indigo-400 focus:outline-none"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

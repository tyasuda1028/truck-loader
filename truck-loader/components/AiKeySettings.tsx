'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { getCompanyAiStatus, setCompanyGeminiKey, clearCompanyGeminiKey } from '@/lib/db';

interface AiStatus {
  hasTenantKey: boolean;
  keyLast4: string | null;
  trialUsed: number;
  trialLimit: number;
  ownerKeyAvailable: boolean;
  encryptionConfigured: boolean;
}

export function AiKeySettings() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getCompanyAiStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await setCompanyGeminiKey(keyInput);
      if (res.ok) {
        setMsg({ type: 'ok', text: '自社のGeminiキーを保存しました。以降このキーで無制限に利用できます。' });
        setKeyInput('');
        await refresh();
      } else {
        setMsg({ type: 'err', text: res.message ?? '保存に失敗しました。' });
      }
    } catch {
      setMsg({ type: 'err', text: '保存に失敗しました。時間をおいて再試行してください。' });
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      await clearCompanyGeminiKey();
      setMsg({ type: 'ok', text: '自社キーを削除しました。お試し利用に戻ります。' });
      await refresh();
    } catch {
      setMsg({ type: 'err', text: '削除に失敗しました。' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>🤖</span>
        <h3 className="text-sm font-bold text-slate-800">AI提案の設定（Geminiキー）</h3>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        AI提案は Google Gemini を使います。自社のAPIキーを登録すると<strong>無制限</strong>で利用できます（料金は各社のGoogleアカウントに帰属）。
        未登録の間は<strong>お試し利用</strong>が可能です。
      </p>

      {/* 現在の状態 */}
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
        {status === null ? (
          <span className="text-slate-400">状態を読み込み中…</span>
        ) : status.hasTenantKey ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-emerald-700">
              ✓ 自社キー登録済み（••••{status.keyLast4 ?? '????'}）— 無制限で利用できます
            </span>
            <button onClick={clear} disabled={saving} className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-white">
              キーを削除
            </button>
          </div>
        ) : status.ownerKeyAvailable ? (
          <span className="text-slate-600">
            お試し利用：<strong className={clsx(status.trialUsed >= status.trialLimit ? 'text-rose-600' : 'text-indigo-700')}>{status.trialUsed} / {status.trialLimit}</strong> 回（今月）
            {status.trialUsed >= status.trialLimit && <span className="ml-1 text-rose-600">— 上限到達。自社キーの登録をおすすめします。</span>}
          </span>
        ) : (
          <span className="text-amber-700">お試しキーは利用できません。AIを使うには自社のGeminiキーを登録してください。</span>
        )}
      </div>

      {/* キー登録フォーム */}
      <div className="mt-3">
        <label className="text-[11px] font-semibold text-slate-400">Gemini APIキー</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="AIza..."
            autoComplete="off"
            className="w-72 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <button
            onClick={save}
            disabled={saving || !keyInput.trim()}
            className={clsx('rounded-lg px-3 py-1.5 text-sm font-semibold transition',
              saving || !keyInput.trim() ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700')}
          >
            {saving ? '保存中…' : status?.hasTenantKey ? 'キーを更新' : 'キーを登録'}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          無料キーは{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Google AI Studio</a>
          {' '}で取得できます（クレジットカード不要）。キーは暗号化して保存され、画面には表示されません。
        </p>
        {!status?.encryptionConfigured && (
          <p className="mt-1 text-[11px] text-amber-600">
            ⚠️ サーバーの暗号化設定（AI_KEY_ENCRYPTION_SECRET）が未設定のため、現在キーを保存できません。管理者にご連絡ください。
          </p>
        )}
      </div>

      {msg && (
        <p className={clsx('mt-3 rounded-lg px-3 py-2 text-xs', msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

'use client';

import { useState } from 'react';

/** Standard プランのカード決済ボタン。/api/checkout で Stripe Checkout に遷移する。 */
export default function SubscribeButton({
  plan = 'standard_monthly',
  label = 'カードで申し込む',
  className = 'inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60',
}: { plan?: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
        credentials: 'include',
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const d = await res.json().catch(() => ({}));
      if (d.url) { window.location.href = d.url; return; }
      alert(d.error || 'お申し込みを開始できませんでした');
      setBusy(false);
    } catch {
      alert('通信エラーが発生しました');
      setBusy(false);
    }
  }
  return <button type="button" onClick={go} disabled={busy} className={className}>{busy ? '処理中…' : label}</button>;
}

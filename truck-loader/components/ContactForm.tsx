'use client';

import { useState } from 'react';

export function ContactForm() {
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('お名前・メールアドレス・お問い合わせ内容は必須です。');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, name, email, phone, message }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d?.error === 'email' ? 'メールアドレスの形式が正しくありません。' : '送信に失敗しました。時間をおいて再度お試しください。');
      }
    } catch {
      setError('送信に失敗しました。通信環境をご確認ください。');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="text-3xl">✅</div>
        <h2 className="mt-3 text-lg font-bold text-gray-900">送信しました</h2>
        <p className="mt-2 text-sm text-gray-600">
          お問い合わせありがとうございます。担当者より折り返しご連絡いたします。
        </p>
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-indigo-500';
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-7 shadow-sm flex flex-col gap-4">
      <div>
        <label className={labelCls}>会社名</label>
        <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="○○製作所" />
      </div>
      <div>
        <label className={labelCls}>お名前 <span className="text-red-500">*</span></label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" required />
      </div>
      <div>
        <label className={labelCls}>メールアドレス <span className="text-red-500">*</span></label>
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
      </div>
      <div>
        <label className={labelCls}>電話番号（任意）</label>
        <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03-1234-5678" />
      </div>
      <div>
        <label className={labelCls}>お問い合わせ内容 <span className="text-red-500">*</span></label>
        <textarea className={inputCls + ' min-h-[140px] resize-y'} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="ご相談内容をご記入ください" required />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? '送信中…' : '送信する'}
      </button>
      <p className="text-center text-xs text-gray-400">
        送信により<a href="/privacy" className="text-indigo-600 hover:underline">プライバシーポリシー</a>に同意したものとみなします。
      </p>
    </form>
  );
}

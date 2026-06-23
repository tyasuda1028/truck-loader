'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('パスワードが一致しません。');
      return;
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください。');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, userName, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || '登録に失敗しました。');
        setLoading(false);
        return;
      }

      // 登録成功 → ログインページへ
      router.push('/login?registered=1');
    } catch {
      setError('通信エラーが発生しました。しばらく経ってから再試行してください。');
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f7fa',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          padding: '48px 40px',
          width: '100%',
          maxWidth: 440,
        }}
      >
        {/* ロゴ・タイトル */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <BrandLogo size={56} rounded={14} style={{ marginBottom: 16 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
            スマコウバ積載
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>新規アカウント登録（無料）</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              会社名 <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="株式会社〇〇物流"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              担当者名 <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
              placeholder="山田 太郎"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              メールアドレス <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="example@company.com"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              パスワード <span style={{ color: '#dc2626' }}>*</span>
              <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>（8文字以上）</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="8文字以上のパスワード"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              パスワード（確認） <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              placeholder="もう一度入力"
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: '#dc2626',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px 0',
              background: loading ? '#93c5fd' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? '登録中...' : '無料で登録する'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6b7280' }}>
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
};

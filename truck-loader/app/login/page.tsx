'use client';

import { useState } from 'react';
import { signIn } from '@/lib/authClient';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('メールアドレスまたはパスワードが正しくありません。');
    } else {
      // ログイン成功＝クラウド同期(サーバモード)へ切替。デモCookieは解除。
      // データソースはモジュール読込時に確定するためフルリロードで反映する。
      try {
        localStorage.setItem('truckloader.dataSource', 'server');
        document.cookie = 'truckloader.demo=; path=/; max-age=0';
      } catch (e) { console.warn('dataSource モード保存に失敗:', e); }
      window.location.href = '/';
    }
  }

  // ログインせずにデモ（ローカルモード＋サンプルデータ投入）で全機能を体験
  function startDemo() {
    try {
      // デモCookieでミドルウェアのログインゲートを通過（ローカル＋サンプル）
      document.cookie = 'truckloader.demo=1; path=/; max-age=86400; samesite=lax';
      localStorage.setItem('truckloader.dataSource', 'local');
      localStorage.setItem('truckloader.autoSeedDemo', '1');
    } catch (e) { console.warn('デモ設定の保存に失敗:', e); }
    window.location.href = '/';
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f7fa',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          padding: '48px 40px',
          width: '100%',
          maxWidth: 400,
        }}
      >
        {/* ロゴ・タイトル */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <BrandLogo size={56} rounded={14} style={{ marginBottom: 16 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
            スマコウバ積載
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>アカウントにログイン</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="example@company.com"
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                color: '#111827',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="パスワードを入力"
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                color: '#111827',
                outline: 'none',
                boxSizing: 'border-box',
              }}
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
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6b7280' }}>
          アカウントをお持ちでない方は{' '}
          <Link href="/register" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
            新規登録
          </Link>
        </p>

        {/* ログイン不要のデモ導線 */}
        <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 24, paddingTop: 20 }}>
          <button
            type="button"
            onClick={startDemo}
            style={{
              width: '100%',
              padding: '11px 0',
              background: '#fffbeb',
              color: '#92400e',
              border: '1px solid #fcd34d',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🚚 ログインせずにデモを見る
          </button>
          <p style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
            サンプルデータで全機能を体験できます（登録不要）
          </p>
        </div>
      </div>
    </div>
  );
}

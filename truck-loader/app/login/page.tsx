'use client';

import { useState } from 'react';
import { signIn } from '@/lib/authClient';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import WebOnly from '@/components/WebOnly';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError('メールアドレスまたはパスワードが正しくありません。');
    } else {
      try {
        localStorage.setItem('truckloader.dataSource', 'local');
        document.cookie = 'truckloader.demo=; path=/; max-age=0';
      } catch (e) { console.warn('dataSource モード保存に失敗:', e); }
      window.location.href = '/';
    }
  }

  function startDemo() {
    try {
      document.cookie = 'truckloader.demo=1; path=/; max-age=86400; samesite=lax';
      localStorage.setItem('truckloader.dataSource', 'local');
      localStorage.setItem('truckloader.autoSeedDemo', '1');
    } catch (e) { console.warn('デモ設定の保存に失敗:', e); }
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-4 inline-block">
            <BrandLogo size={64} rounded={16} className="shadow-lg" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">スマコウバ積載</h1>
          <p className="mt-1 text-sm text-gray-500">トラック積載計画を自動計算</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl px-8 py-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">ログイン</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="example@company.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>

          {/* ネイティブ(iOS)では新規登録(アカウント作成)導線を出さない（App Store 3.1.3(a)/3.1.1） */}
          <WebOnly>
            <div className="mt-6 text-center text-sm text-gray-500">
              アカウントをお持ちでない方は{' '}
              <Link href="/register" className="text-indigo-600 hover:underline font-medium">
                新規登録
              </Link>
            </div>
          </WebOnly>

          <div className="mt-5 pt-5 border-t border-gray-100">
            <button
              type="button"
              onClick={startDemo}
              className="flex items-center justify-center gap-2 w-full rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100 transition-colors"
            >
              🚚 ログインせずにデモを見る
            </button>
            <p className="mt-2 text-center text-[11px] text-gray-400">
              サンプルデータで全機能を体験できます（登録不要）
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          拠点間の出荷配車・積載計画を見える化するクラウドツール
        </p>
        <div className="mt-3 flex justify-center gap-4 text-xs text-gray-400">
          {/* ネイティブ(iOS)では料金プラン(外部課金導線)へのリンクを出さない（App Store 3.1.3(a)/3.1.1） */}
          <WebOnly>
            <Link href="/pricing" className="hover:text-gray-600 hover:underline">料金プラン</Link>
          </WebOnly>
          <Link href="/privacy" className="hover:text-gray-600 hover:underline">プライバシーポリシー</Link>
          <Link href="/support" className="hover:text-gray-600 hover:underline">サポート</Link>
        </div>
      </div>
    </div>
  );
}

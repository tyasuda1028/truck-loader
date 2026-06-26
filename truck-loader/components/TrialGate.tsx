'use client';

/**
 * トライアル/契約ゲート（アプリ本体ページに適用）。
 *
 * 判定:
 *  - デモ（無ログインのプレビュー）: ゲートなしで通す。
 *  - Web: middleware でログイン済み。/api/subscription/status を取得し、
 *         active(契約 or トライアル期限内) なら通す。期限切れはロック画面。
 *  - ネイティブ(iOS): 初回はトークンログインが必要（ログイン画面）。ログイン後は
 *         エンタイトルメントを取得＋ローカルにキャッシュし、オフラインでも期間内は利用可。
 *         「ログインせずにデモを見る」も提供。
 */
import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getToken } from '@/lib/auth/token';
import { cloudLogin, syncApiBase, authHeader } from '@/lib/auth/cloudAuth';
import BrandLogo from './BrandLogo';
import SubscribeButton from './SubscribeButton';

type Phase = 'loading' | 'login' | 'locked' | 'ok';
interface Ent { active: boolean; trialEndsAt: string | null; trialDaysLeft: number | null; isPro: boolean }

const ENT_CACHE = 'truckloader.entitlement';

function isDemo(): boolean {
  try {
    if (typeof document !== 'undefined' && document.cookie.includes('truckloader.demo=1')) return true;
    return localStorage.getItem('truckloader.demoNative') === '1';
  } catch {
    return false;
  }
}

async function fetchEnt(): Promise<Ent | null> {
  try {
    const token = await getToken();
    const res = await fetch(`${syncApiBase()}/api/subscription/status`, {
      headers: { ...authHeader(token) },
      credentials: 'include',
    });
    if (!res.ok) return null;
    const d = await res.json();
    const ent: Ent = {
      active: Boolean(d.active), trialEndsAt: d.trialEndsAt ?? null,
      trialDaysLeft: typeof d.trialDaysLeft === 'number' ? d.trialDaysLeft : null, isPro: Boolean(d.isPro),
    };
    try { localStorage.setItem(ENT_CACHE, JSON.stringify({ ...ent, cachedAt: Date.now() })); } catch { /* ignore */ }
    return ent;
  } catch {
    return null;
  }
}

/** キャッシュからエンタイトルメントを復元（期限はローカル時刻で再判定＝オフライン猶予） */
function cachedEnt(): Ent | null {
  try {
    const raw = localStorage.getItem(ENT_CACHE);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const ends = d.trialEndsAt ? new Date(d.trialEndsAt).getTime() : null;
    const active = Boolean(d.isPro) || (ends ? ends > Date.now() : false);
    const trialDaysLeft = ends ? Math.max(0, Math.ceil((ends - Date.now()) / 86_400_000)) : null;
    return { active, trialEndsAt: d.trialEndsAt ?? null, trialDaysLeft, isPro: Boolean(d.isPro) };
  } catch {
    return null;
  }
}

export function TrialGate({ children }: { children: React.ReactNode }) {
  const native = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const [phase, setPhase] = useState<Phase>('loading');
  const [ent, setEnt] = useState<Ent | null>(null);

  const evaluate = useCallback(async () => {
    if (isDemo()) { setPhase('ok'); return; }
    if (native) {
      const token = await getToken();
      if (!token) { setPhase('login'); return; }
      // ネイティブ(iOS)はトライアル/契約でブロックしない（アプリ内課金なし・外部課金導線も出さない＝App Store 3.1.1対応）。
      // エンタイトルメントは残日数バナーの情報表示にのみ使用。取得不能でもログイン済みなら通す。
      const live = (await fetchEnt()) ?? cachedEnt();
      setEnt(live);
      setPhase('ok');
    } else {
      // Web（middlewareでログイン済み）。取得失敗時はフェイルオープン（締め出さない）。
      const live = await fetchEnt();
      if (!live) { setPhase('ok'); return; }
      setEnt(live);
      setPhase(live.active ? 'ok' : 'locked');
    }
  }, [native]);

  useEffect(() => { void evaluate(); }, [evaluate]);

  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400 text-sm gap-2">
        <svg className="animate-spin h-5 w-5 text-brand-600" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
        読み込み中…
      </div>
    );
  }
  if (phase === 'login') return <NativeLoginGate onDone={() => window.location.reload()} />;
  if (phase === 'locked') return <LockScreen ent={ent} native={native} />;

  return (
    <>
      {ent && !ent.isPro && ent.trialDaysLeft != null && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-1.5 px-4">
          無料トライアル中（残り {ent.trialDaysLeft} 日）
          {/* ネイティブでは契約/問い合わせ(外部課金導線)を出さない（App Store 3.1.1） */}
          {!native && (
            <>・継続利用はご契約が必要です{' '}
              <a href="/contact" className="underline font-semibold">お問い合わせ</a>
            </>
          )}
        </div>
      )}
      {children}
    </>
  );
}

/** トライアル終了（または未契約）のロック画面（Webのみ。ネイティブはロックしない方針） */
function LockScreen({ ent, native }: { ent: Ent | null; native: boolean }) {
  void ent;
  // ネイティブ(iOS)では外部課金/契約への導線を一切出さない（App Store 3.1.1）。
  // ※通常ネイティブは evaluate() でロックに到達しないが、防御的に分岐し外部リンクを出さない。
  if (native) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <BrandLogo size={56} rounded={14} className="mb-4" />
        <h1 className="text-xl font-bold text-gray-900">無料トライアル期間が終了しました</h1>
        <p className="mt-3 text-sm text-gray-600 max-w-md leading-relaxed">
          引き続きアプリをご利用いただけます。法人でのご利用に関するご案内は、Web版
          （sumakouba-truck-loader.vercel.app）をご覧ください。
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <BrandLogo size={56} rounded={14} className="mb-4" />
      <h1 className="text-xl font-bold text-gray-900">無料トライアルが終了しました</h1>
      <p className="mt-3 text-sm text-gray-600 max-w-md leading-relaxed">
        引き続きスマコウバ積載をご利用いただくには、ご契約が必要です。
        Standard プランはカード決済ですぐにご利用を再開できます。
      </p>
      <div className="mt-6 flex flex-col gap-2 w-full max-w-xs">
        <SubscribeButton plan="standard_monthly" label="Standard 月額で申し込む（カード）" className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" />
        <SubscribeButton plan="standard_yearly" label="Standard 年額（2ヶ月分お得）" className="rounded-lg border border-blue-600 px-5 py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-60" />
      </div>
      <a href="/pricing" className="mt-4 text-sm text-blue-600 underline">料金プランを見る</a>
      <a href="/contact" className="mt-2 text-xs text-gray-500 underline">上位プラン・お見積りのお問い合わせ</a>
    </div>
  );
}

/** ネイティブ初回のログイン/新規登録画面（トークン認証）＋デモ導線 */
function NativeLoginGate({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [companyName, setCompanyName] = useState('');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const login = async () => {
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください'); return; }
    setBusy(true);
    const res = await cloudLogin(email.trim(), password);
    if (res.ok) {
      try { localStorage.setItem('truckloader.dataSource', 'local'); } catch { /* ignore */ }
      onDone();
    } else {
      setBusy(false);
      setError(res.message ?? 'ログインに失敗しました');
    }
  };

  const register = async () => {
    if (!companyName.trim() || !userName.trim() || !email.trim() || !password) { setError('全ての項目を入力してください'); return; }
    if (password.length < 8) { setError('パスワードは8文字以上にしてください'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${syncApiBase()}/api/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: companyName.trim(), userName: userName.trim(), email: email.trim(), password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setBusy(false); setError(d?.message ?? '登録に失敗しました'); return;
      }
      // 登録成功→そのままログイン（30日トライアル開始）
      const lr = await cloudLogin(email.trim(), password);
      if (lr.ok) { try { localStorage.setItem('truckloader.dataSource', 'local'); } catch { /* ignore */ } onDone(); }
      else { setBusy(false); setError(lr.message ?? 'ログインに失敗しました'); }
    } catch {
      setBusy(false); setError('通信エラーが発生しました');
    }
  };

  const demo = () => {
    try {
      localStorage.setItem('truckloader.demoNative', '1');
      localStorage.setItem('truckloader.dataSource', 'local');
      localStorage.setItem('truckloader.autoSeedDemo', '1');
    } catch { /* ignore */ }
    onDone();
  };

  const inputCls = 'rounded-lg border border-gray-300 px-3 py-2.5 text-sm';

  return (
    <div className="flex items-center justify-center min-h-screen px-5 py-8" style={{ background: '#f5f7fa' }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow">
        <div className="text-center mb-6">
          <BrandLogo size={56} rounded={14} className="mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900">スマコウバ積載</h1>
          <p className="text-xs text-gray-500 mt-1">
            {mode === 'login' ? 'ログインして利用を開始' : '新規登録（30日間 無料トライアル）'}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {mode === 'register' && (
            <>
              <input className={inputCls} placeholder="会社名" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              <input className={inputCls} placeholder="お名前" value={userName} onChange={(e) => setUserName(e.target.value)} />
            </>
          )}
          <input className={inputCls} type="email" inputMode="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={inputCls} type="password" placeholder={mode === 'register' ? 'パスワード（8文字以上）' : 'パスワード'} value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}
          <button onClick={mode === 'login' ? login : register} disabled={busy} className="rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? '処理中…' : mode === 'login' ? 'ログイン' : '無料で始める'}
          </button>
          <button onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }} className="text-xs text-blue-600 hover:underline">
            {mode === 'login' ? 'アカウントをお持ちでない方は新規登録（30日無料）' : 'すでにアカウントをお持ちの方はログイン'}
          </button>
        </div>
        <div className="border-t border-gray-100 mt-5 pt-4">
          <button onClick={demo} className="w-full rounded-lg border border-amber-300 bg-amber-50 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100">
            🚚 ログインせずにデモを見る
          </button>
          <p className="text-center text-[11px] text-gray-400 mt-2">サンプルデータで全機能を体験できます（登録不要）</p>
        </div>
      </div>
    </div>
  );
}

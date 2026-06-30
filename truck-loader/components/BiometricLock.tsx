'use client';

/**
 * 生体認証(Face ID/Touch ID)によるアプリロックのオーバーレイ。
 * - 起動時、設定が有効ならロック→認証要求。
 * - バックグラウンド復帰(visibilitychange)で再ロック。
 * - ネイティブのみ作動。Web では何もしない。
 * layout の最前面(body直下)に配置する。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isBiometricPlatform, isBiometricLockEnabled, authenticateBiometric } from '@/lib/biometric';

export function BiometricLock() {
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const lockedRef = useRef(false);

  const setLockedBoth = useCallback((v: boolean) => {
    lockedRef.current = v;
    setLocked(v);
  }, []);

  const tryUnlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const ok = await authenticateBiometric('スマコウバ積載のロックを解除します');
    setBusy(false);
    if (ok) setLockedBoth(false);
  }, [busy, setLockedBoth]);

  // 起動時のロック判定
  useEffect(() => {
    if (isBiometricPlatform() && isBiometricLockEnabled()) {
      setLockedBoth(true);
      void tryUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // バックグラウンド→復帰で再ロック・再認証
  useEffect(() => {
    if (!isBiometricPlatform()) return;
    const onVis = () => {
      if (!isBiometricLockEnabled()) return;
      if (document.visibilityState === 'hidden') {
        setLockedBoth(true);
      } else if (document.visibilityState === 'visible' && lockedRef.current) {
        void tryUnlock();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [setLockedBoth, tryUnlock]);

  if (!locked) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg,#6366f1 0%,#4f46e5 50%,#06b6d4 100%)' }}
    >
      <span style={{ color: '#fff', fontWeight: 900, fontSize: 88, lineHeight: 1, letterSpacing: -2 }}>ス</span>
      <p className="mt-4 text-white/90 text-sm">ロックされています</p>
      <button
        type="button"
        onClick={() => void tryUnlock()}
        disabled={busy}
        className="mt-6 rounded-xl bg-white/15 border border-white/40 px-6 py-3 text-sm font-bold text-white hover:bg-white/25 disabled:opacity-60"
      >
        {busy ? '認証中…' : 'ロックを解除'}
      </button>
    </div>
  );
}

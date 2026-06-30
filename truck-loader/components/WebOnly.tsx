'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * 既定では fallback（中立表示）を描画し、Web（非ネイティブ）と確定したときだけ children を表示する。
 * SSR・iOSアプリ（Capacitor webview）内では fallback のまま＝価格・カード決済・新規登録などの
 * 外部課金導線を、ビルド出力のHTML（静的export）にもネイティブの画面にも一切載せない
 * （App Store ガイドライン 3.1.3(a)/3.1.1 対策）。
 * 初回レンダリングは常に fallback なので SSR/プリレンダーと一致し、hydration の不整合は起きない。
 *
 * 既存のネイティブ判定（lib/useIsNative.ts / components/NativeRedirect.tsx）と同じ
 * Capacitor.isNativePlatform() を判定に用いる。
 */
export default function WebOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [isWeb, setIsWeb] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) setIsWeb(true);
  }, []);
  return <>{isWeb ? children : fallback}</>;
}

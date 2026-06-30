'use client';

import WebOnly from '@/components/WebOnly';

/**
 * お問い合わせページ下部のリンク群。
 * ネイティブ(iOS)では料金プラン（外部課金導線）へのリンクを出さない（App Store 3.1.3(a)/3.1.1）。
 * 価格ページへのリンク文字列を静的HTML（export）にも載せないため、料金プランリンクは
 * クライアントコンポーネント内の WebOnly で Web 確定時のみ描画する。
 * 利用規約・プライバシーポリシーは従来どおり常時表示。
 */
export default function ContactFooterLinks() {
  return (
    <div className="mt-8 text-center text-xs text-gray-400 space-x-4">
      <WebOnly>
        <a href="/pricing" className="text-indigo-600 hover:underline">料金プラン</a>
      </WebOnly>
      <a href="/terms" className="text-indigo-600 hover:underline">利用規約</a>
      <a href="/privacy" className="text-indigo-600 hover:underline">プライバシーポリシー</a>
    </div>
  );
}

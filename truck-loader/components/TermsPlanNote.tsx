'use client';

import WebOnly from '@/components/WebOnly';

/**
 * 利用規約「料金プラン」項の説明文。
 * Web（非ネイティブ）では従来どおり料金ページへのリンク・お申し込み/カード決済の案内を表示。
 * ネイティブ(iOS)では外部課金導線（料金ページへのリンク・「アプリ外でのお申し込み・クレジットカード決済」
 * の文言）を出さず、Web版での案内に置き換える（App Store ガイドライン 3.1.3(a)/3.1.1）。
 */
export default function TermsPlanNote() {
  return (
    <WebOnly
      fallback={
        <li>
          Pro機能（複数拠点の積載計画、CSVインポート/エクスポート、PDF出力、クラウド同期）は、
          <strong>会社単位の法人契約</strong>でご利用いただけます。料金・条件は Web版（ブラウザ）
          または当方へのお問い合わせにてご案内します。
        </li>
      }
    >
      <li>
        Pro機能（複数拠点の積載計画、CSVインポート/エクスポート、PDF出力、クラウド同期）は、
        <strong>会社単位の法人契約（アプリ外でのお申し込み・クレジットカード決済）</strong>
        でご利用いただけます。料金・条件は
        <a className="text-indigo-600 underline" href="/pricing">料金ページ</a>
        または当方へのお問い合わせにてご案内します。
      </li>
    </WebOnly>
  );
}

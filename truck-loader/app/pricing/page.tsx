import type { Metadata } from 'next';
import NativeRedirect from '@/components/NativeRedirect';
import SubscribeButton from '@/components/SubscribeButton';

export const metadata: Metadata = {
  title: '料金｜スマコウバ積載',
  description: 'スマコウバ積載の料金プラン（法人向け・お問い合わせ）',
};

// 公開料金ページ（外部請求モデル）。
// ※ App Store ガイドライン3.1.1/3.1.3 のため、このページはアプリ内からはリンクしない。
//   案内はWeb/営業/メールのみ。決済ボタンは置かず、お問い合わせ(mailto)に誘導する。
const TIERS = [
  {
    name: 'スタンダード',
    price: '¥19,800',
    unit: '/ 月（税別）',
    yearly: '年額 ¥198,000（2ヶ月分お得）',
    target: '1〜数拠点の中小事業所向け',
    features: ['複数拠点の積載計画', '荷台レイアウト図', 'CSV入出力', 'PDF出力（ドライバー配布）', 'クラウド同期', 'バーコード積込照合'],
    highlight: false,
  },
  {
    name: 'ビジネス',
    price: '¥39,800',
    unit: '/ 月（税別）',
    yearly: '年額 ¥398,000（2ヶ月分お得）',
    target: '複数拠点・多担当の本格運用向け',
    features: ['スタンダードの全機能', '拠点数・担当者数の上限拡大', '優先サポート', '導入時の初期設定サポート'],
    highlight: true,
  },
  {
    name: 'エンタープライズ',
    price: '¥79,800〜',
    unit: '/ 月（税別）',
    yearly: '年額・個別見積',
    target: '大規模・カスタマイズ要望のある企業向け',
    features: ['ビジネスの全機能', '個別要件への対応', '導入コンサルティング', '専任サポート'],
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 text-gray-800 leading-relaxed">
      {/* ネイティブ(iOS)では料金ページを表示しない（App Store 3.1.1：外部課金導線を出さない） */}
      <NativeRedirect to="/login" />
      <h1 className="text-2xl font-bold text-gray-900">料金プラン</h1>
      <p className="mt-1 text-sm text-gray-500">スマコウバ積載（トラック配車・積み付け計算）</p>

      <p className="mt-6">
        アプリは無料でダウンロードでき、基本機能はそのままご利用いただけます。
        現場で毎日使う <strong>Pro機能</strong>（複数拠点の積載計画・CSV入出力・PDF出力・クラウド同期・バーコード積込確認）は、
        <strong>会社単位・人数無制限</strong>の法人プランでご提供します（お支払いはクレジットカード決済）。
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={
              'rounded-2xl border p-5 flex flex-col ' +
              (t.highlight ? 'border-blue-600 ring-2 ring-blue-100' : 'border-gray-200')
            }
          >
            {t.highlight && <div className="text-[11px] font-bold text-blue-600 mb-1">おすすめ</div>}
            <div className="text-lg font-bold text-gray-900">{t.name}</div>
            <div className="mt-1 text-xs text-gray-500">{t.target}</div>
            <div className="mt-3">
              <span className="text-2xl font-extrabold text-gray-900">{t.price}</span>
              <span className="text-xs text-gray-500"> {t.unit}</span>
            </div>
            <div className="text-[11px] text-gray-400">{t.yearly}</div>
            <ul className="mt-4 space-y-1.5 text-sm text-gray-700 flex-1">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2"><span className="text-blue-600">✓</span><span>{f}</span></li>
              ))}
            </ul>
            {t.name === 'スタンダード' ? (
              <div className="mt-4 flex flex-col gap-2">
                <SubscribeButton plan="standard_monthly" label="月額でカード申し込み" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" />
                <SubscribeButton plan="standard_yearly" label="年額（2ヶ月分お得）" className="rounded-lg border border-blue-600 px-4 py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-60" />
                <span className="text-[11px] text-gray-400 text-center">クレジットカード決済・いつでも解約可</span>
              </div>
            ) : (
              <a href="mailto:sophie83101028@gmail.com?subject=スマコウバ積載 料金のお問い合わせ" className="mt-4 inline-block text-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50">お問い合わせ</a>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        ※ 価格は税別。年額は月額の約10ヶ月分（2ヶ月分お得）。お支払いはクレジットカード決済。30日間の無料トライアルをご用意しています。
      </p>

      <div className="mt-8 rounded-2xl bg-blue-50 border border-blue-200 p-6 text-center">
        <div className="text-base font-bold text-gray-900">お見積り・ご契約のお問い合わせ</div>
        <p className="mt-1 text-sm text-gray-600">ご利用人数・拠点数をお知らせください。最適なプランをご案内します。</p>
        <a
          href="mailto:sophie83101028@gmail.com?subject=スマコウバ積載 料金のお問い合わせ"
          className="inline-block mt-3 rounded-lg bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700"
        >
          メールでお問い合わせ
        </a>
        <p className="mt-2 text-xs text-gray-500">スマコウバ運営事務局：sophie83101028@gmail.com</p>
      </div>

      <p className="mt-8 text-[11px] text-gray-400">
        <a href="/terms" className="underline hover:text-gray-600">利用規約</a>
        {' / '}
        <a href="/privacy" className="underline hover:text-gray-600">プライバシーポリシー</a>
        {' / '}
        <a href="/contact" className="underline hover:text-gray-600">お問い合わせ</a>
      </p>
    </div>
  );
}

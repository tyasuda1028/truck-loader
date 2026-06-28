import type { Metadata } from 'next';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import NativeRedirect from '@/components/NativeRedirect';
import SubscribeButton from '@/components/SubscribeButton';

export const metadata: Metadata = {
  title: '料金プラン｜スマコウバ積載',
  description: 'スマコウバ積載の料金プラン（月額／年額）。トラック積載計画を自動計算。30日間無料トライアル。',
};

const FEATURES = [
  '複数拠点の積載計画',
  '荷台レイアウト図',
  'CSV入出力',
  'PDF出力（ドライバー配布）',
  'クラウド同期',
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-800">
      <NativeRedirect to="/login" />
      <div className="max-w-2xl mx-auto px-5 py-10">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <BrandLogo size={52} rounded={14} className="mx-auto mb-3 shadow" />
          <h1 className="text-2xl font-bold text-gray-900">スマコウバ積載 料金プラン</h1>
          <p className="text-sm text-gray-500 mt-2">
            出荷拠点ごとの必要在庫に対して、生産品をどれだけ送ればいいか自動計算。複数拠点の積載計画をまとめて管理できます。
            <br className="hidden sm:block" />
            まずは30日間の無料トライアルでお試しください（お試しにクレジットカードは不要）。
          </p>
          <p className="text-xs text-gray-400 mt-2">価格はすべて税別。年額は月額の約10ヶ月分（2ヶ月分お得）。</p>
        </div>

        {/* 料金カード */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 flex flex-col">
            <div className="text-sm font-bold text-gray-900">月額プラン</div>
            <div className="mt-1 text-3xl font-extrabold text-gray-900">
              ¥19,800<span className="text-sm font-normal text-gray-400"> / 月</span>
            </div>
            <SubscribeButton
              plan="standard_monthly"
              label="月額でカード申し込み"
              className="mt-4 block w-full text-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            />
          </div>
          <div className="rounded-2xl border-2 border-blue-500 bg-white shadow-md ring-1 ring-blue-200 p-6 flex flex-col">
            <div className="text-sm font-bold text-gray-900">
              年額プラン
              <span className="ml-2 align-middle text-[10px] font-bold text-blue-700 bg-blue-100 rounded px-1.5 py-0.5">2ヶ月分お得</span>
            </div>
            <div className="mt-1 text-3xl font-extrabold text-gray-900">
              ¥198,000<span className="text-sm font-normal text-gray-400"> / 年</span>
            </div>
            <SubscribeButton
              plan="standard_yearly"
              label="年額でカード申し込み"
              className="mt-4 block w-full text-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            />
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-gray-400">
          クレジットカード決済（Stripe）・いつでも解約可・30日間の無料トライアル
        </p>

        {/* 含まれる機能 */}
        <h2 className="mt-10 text-lg font-bold text-gray-900">含まれる機能</h2>
        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {/* お支払い・解約 */}
        <div className="mt-8 bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-600 space-y-2">
          <p>・お支払いはクレジットカード決済（Stripe）。いつでも解約できます。</p>
          <p>・サポートは<strong>メール</strong>で承ります（平日日中の電話・訪問でのご対応はいたしかねます。順次ご返信します）。</p>
        </div>

        {/* ご相談 */}
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5 text-center">
          <div className="text-base font-bold text-gray-900">より大規模・多拠点・カスタマイズのご相談</div>
          <p className="mt-1 text-sm text-gray-600">拠点数・ご利用人数が多い場合や個別要件は、お気軽にご相談ください。</p>
          <Link href="/contact" className="inline-block mt-3 rounded-lg bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700">
            お問い合わせフォーム
          </Link>
        </div>

        {/* フッター */}
        <div className="mt-8 text-center text-xs text-gray-400 space-x-4">
          <Link href="/" className="text-blue-600 hover:underline">スマコウバ積載</Link>
          <Link href="/support" className="text-blue-600 hover:underline">サポート</Link>
          <Link href="/privacy" className="text-blue-600 hover:underline">プライバシーポリシー</Link>
          <a href="https://www.sumakouba.com/tokushoho.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">特定商取引法に基づく表記</a>
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-3">運営：スマコウバ運営事務局</p>
      </div>
    </main>
  );
}

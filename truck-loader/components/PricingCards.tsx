'use client';

import SubscribeButton from '@/components/SubscribeButton';
import WebOnly from '@/components/WebOnly';

/**
 * 料金カード（価格＋カード決済ボタン）。クライアントコンポーネントにすることで、
 * 価格やStripe導線がサーバー/プリレンダーの返すHTML（静的export含む）に一切載らず、
 * Web（非ネイティブ）と確定したときだけクライアント側で描画される
 * （App Store ガイドライン 3.1.3(a)/3.1.1）。
 */
export default function PricingCards() {
  return (
    <WebOnly
      fallback={
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 text-center text-sm text-gray-600">
          ご契約・お支払いはWeb版（ブラウザ）からお手続きください。
        </div>
      }
    >
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
            className="mt-4 block w-full text-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          />
        </div>
        <div className="rounded-2xl border-2 border-indigo-500 bg-white shadow-md ring-1 ring-indigo-200 p-6 flex flex-col">
          <div className="text-sm font-bold text-gray-900">
            年額プラン
            <span className="ml-2 align-middle text-[10px] font-bold text-indigo-700 bg-indigo-100 rounded px-1.5 py-0.5">2ヶ月分お得</span>
          </div>
          <div className="mt-1 text-3xl font-extrabold text-gray-900">
            ¥198,000<span className="text-sm font-normal text-gray-400"> / 年</span>
          </div>
          <SubscribeButton
            plan="standard_yearly"
            label="年額でカード申し込み"
            className="mt-4 block w-full text-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          />
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-gray-400">
        クレジットカード決済（Stripe）・いつでも解約可・30日間の無料トライアル
      </p>
    </WebOnly>
  );
}

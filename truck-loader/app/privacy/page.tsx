import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'プライバシーポリシー｜スマコウバ積載',
  description: 'スマコウバ積載のプライバシーポリシー（個人情報・データの取扱いについて）',
};

// App Store 申請の「プライバシーポリシーURL」用に未ログインで閲覧できる公開ページ。
// （middleware.ts の matcher で /privacy を認証対象から除外している）
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 text-gray-800 leading-relaxed">
      <h1 className="text-2xl font-bold text-gray-900">プライバシーポリシー</h1>
      <p className="mt-1 text-sm text-gray-500">スマコウバ積載（トラック配車・積み付け計算）</p>
      <p className="mt-1 text-sm text-gray-500">最終更新日：2026年6月20日</p>

      <p className="mt-6">
        スマコウバ運営事務局（以下「当方」）は、モバイルアプリ「スマコウバ積載」（以下「本アプリ」）における
        利用者の個人情報・データの取扱いについて、以下のとおり定めます。
      </p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">1. 取得する情報と利用目的</h2>
      <p className="mt-2">
        本アプリは<strong>オフラインでも動作</strong>し、入力データは原則として端末内に保存されます。
        クラウド同期を有効にした場合に限り、以下の情報をサーバーで取り扱います。
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="border border-gray-200 px-3 py-2">区分</th>
              <th className="border border-gray-200 px-3 py-2">取得する情報</th>
              <th className="border border-gray-200 px-3 py-2">目的</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-200 px-3 py-2">アカウント情報（クラウド同期利用時）</td>
              <td className="border border-gray-200 px-3 py-2">メールアドレス、パスワード（ハッシュ化して保存）</td>
              <td className="border border-gray-200 px-3 py-2">ログイン認証・本人確認</td>
            </tr>
            <tr>
              <td className="border border-gray-200 px-3 py-2">業務データ（クラウド同期利用時）</td>
              <td className="border border-gray-200 px-3 py-2">製品・拠点・在庫・生産/出荷計画・積載計画などの入力データ</td>
              <td className="border border-gray-200 px-3 py-2">複数端末間でのデータ同期・バックアップ</td>
            </tr>
            <tr>
              <td className="border border-gray-200 px-3 py-2">カメラ</td>
              <td className="border border-gray-200 px-3 py-2">バーコード/QRコードの読取</td>
              <td className="border border-gray-200 px-3 py-2">積込内容の照合（<strong>画像は端末内で処理し、保存・送信しません</strong>）</td>
            </tr>
            <tr>
              <td className="border border-gray-200 px-3 py-2">プッシュ通知（利用時）</td>
              <td className="border border-gray-200 px-3 py-2">デバイストークン</td>
              <td className="border border-gray-200 px-3 py-2">通知の配信</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul className="mt-4 list-disc pl-6 space-y-1">
        <li>当方は、広告目的のトラッキングや、第三者へのデータ販売を行いません。</li>
        <li>オフラインのみで利用する場合、上記アカウント情報・業務データはサーバーに送信されません。</li>
      </ul>

      <h2 className="mt-8 text-lg font-bold text-gray-900">2. 第三者提供</h2>
      <p className="mt-2">当方は、法令に基づく場合を除き、取得した情報を第三者に提供しません。</p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">3. 外部サービス（委託先）</h2>
      <p className="mt-2">本アプリのクラウド機能は、以下のインフラを利用してデータを保管・処理します。</p>
      <ul className="mt-2 list-disc pl-6 space-y-1">
        <li>ホスティング：Vercel Inc.</li>
        <li>データベース：Neon（PostgreSQL）</li>
      </ul>
      <p className="mt-2">これらは当方の管理のもとでデータ処理を行い、各社のセキュリティ基準に従って保護されます。</p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">4. データの保管・削除</h2>
      <ul className="mt-2 list-disc pl-6 space-y-1">
        <li>データはクラウド同期が有効な間、上記サービス上に保管されます。</li>
        <li>
          アカウントとサーバー上の全データは、アプリ内の「設定 → クラウド同期 →
          アカウントとデータを削除する」からいつでも完全に削除できます。下記窓口へのご連絡でも対応します。
        </li>
        <li>端末内のローカルデータは、アプリの削除またはデータのリセットで消去されます。</li>
      </ul>

      <h2 className="mt-8 text-lg font-bold text-gray-900">5. 安全管理</h2>
      <p className="mt-2">通信は暗号化（HTTPS）され、パスワードはハッシュ化して保存します。</p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">6. 子どものプライバシー</h2>
      <p className="mt-2">本アプリは業務用であり、13歳未満の利用を想定していません。</p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">7. 改定</h2>
      <p className="mt-2">本ポリシーは必要に応じて改定します。重要な変更はアプリ内またはWebでお知らせします。</p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">8. お問い合わせ窓口</h2>
      <p className="mt-2">
        運営者：スマコウバ運営事務局
        <br />
        メール：<a className="text-indigo-600 underline" href="mailto:sophie83101028@gmail.com">sophie83101028@gmail.com</a>
      </p>

      <p className="mt-10 text-xs text-gray-400">© 2026 スマコウバ運営事務局</p>
    </div>
  );
}

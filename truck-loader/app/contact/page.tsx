import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'お問い合わせ｜スマコウバ積載',
  description: 'スマコウバ積載のお問い合わせ。導入のご相談・お見積り・ご質問など。',
};

// App Store 申請の「サポートURL」用に未ログインで閲覧できる公開ページ（お問い合わせフォーム）。
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      {/* ロゴ・見出し */}
      <div className="text-center mb-8">
        <div
          className="mx-auto mb-3 flex items-center justify-center"
          style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1 0%,#3b82f6 50%,#06b6d4 100%)' }}
        >
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 34, lineHeight: 1, letterSpacing: -1 }}>ス</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">お問い合わせ</h1>
        <p className="mt-2 text-sm text-gray-500">
          導入のご相談・お見積り・ご質問など、お気軽にお問い合わせください。
        </p>
      </div>

      {/* LINEで相談 */}
      <a
        href="https://line.me/R/ti/p/%40100xjiup"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-full bg-[#06C755] px-6 py-3.5 text-base font-bold text-white shadow-md transition hover:brightness-95"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M12 2.2c-5.52 0-10 3.64-10 8.13 0 4.02 3.55 7.39 8.35 8.03.32.07.77.21.88.49.1.25.07.64.03.9l-.14.86c-.04.25-.2.99.87.54s5.76-3.39 7.86-5.81c1.45-1.59 2.15-3.2 2.15-5.01 0-4.49-4.48-8.13-10-8.13Z" />
        </svg>
        LINEで相談する（友だち追加）
      </a>
      <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" /> または、フォームから <span className="h-px flex-1 bg-gray-200" />
      </div>

      <ContactForm />

      <div className="mt-8 text-center text-xs text-gray-400 space-x-4">
        <a href="/pricing" className="text-blue-600 hover:underline">料金プラン</a>
        <a href="/terms" className="text-blue-600 hover:underline">利用規約</a>
        <a href="/privacy" className="text-blue-600 hover:underline">プライバシーポリシー</a>
      </div>
      <p className="mt-3 text-center text-[11px] text-gray-400">運営：スマコウバ運営事務局</p>
    </div>
  );
}

import { withAuth } from 'next-auth/middleware';

/**
 * Web はログイン必須。ただし「ログインせずにデモを見る」導線のみ無ログインで許可する。
 *   - ログイン済み(token あり) → 許可
 *   - デモCookie(truckloader.demo=1) あり → 許可（/login のデモボタンが付与。ローカル＋サンプル）
 *   - どちらも無い匿名 → /login へリダイレクト
 * 公開ページ(/login,/register,/privacy,/terms,/contact,/pricing)と自前認証APIは matcher から除外。
 * ネイティブ(Capacitor 静的export)では middleware は無効（オフライン動作）。
 */
export default withAuth({
  pages: { signIn: '/login' },
  callbacks: {
    authorized: ({ token, req }) => {
      if (token) return true;
      return req.cookies.get('truckloader.demo')?.value === '1';
    },
  },
});

export const config = {
  matcher: [
    '/((?!login|register|privacy|contact|terms|pricing|api/auth|api/register|api/sync|api/account|api/push|api/contact|api/subscription|api/checkout|api/customer-portal|api/stripe-webhook|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico)).*)',
  ],
};

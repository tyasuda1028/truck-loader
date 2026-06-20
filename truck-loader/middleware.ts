import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    /*
     * /login, /register, /privacy, /api/auth/* 以外の全ルートを保護
     * （/privacy は App Store 申請の公開URLとして未ログインで閲覧可能にする）
     * api/sync・api/account・api/push は自前の Bearer トークン認証(getAuthContext)を行うため
     * next-auth ミドルウェアの Cookie セッション必須から除外する（ネイティブから呼べるように）。
     * next.js の静的ファイル (_next/static, favicon.ico など) は除外
     */
    '/((?!login|register|privacy|api/auth|api/register|api/sync|api/account|api/push|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico)).*)',
  ],
};

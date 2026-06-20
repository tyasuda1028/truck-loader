import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { SupabaseProvider } from '@/components/SupabaseProvider';
import { SessionProvider } from '@/components/SessionProvider';
import { Toaster } from '@/components/Toast';
import { OrientationController } from '@/components/OrientationController';
import { EntitlementProvider } from '@/lib/entitlement';

export const metadata: Metadata = {
  title: 'スマコウバ積載',
  description: '中小製造業向け スマコウバ積載 — 在庫基準から最適なトラックと積み方を自動算出・可視化',
};

// viewport-fit=cover で env(safe-area-inset-*) を有効化（ノッチ/Dynamic Island対応）
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased" style={{ background: '#f5f7fa', color: '#1f2937' }}>
        <SessionProvider>
          <EntitlementProvider>
            <OrientationController />
            <Navbar />
            <SupabaseProvider>
              {/* PCはサイドバー分(200px)右にずらす。モバイルは全幅（ドロワーで遷移） */}
              <main className="min-h-[calc(100vh_-_68px_-_env(safe-area-inset-top))] lg:ml-[200px]">
                {children}
              </main>
            </SupabaseProvider>
            <Toaster />
          </EntitlementProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

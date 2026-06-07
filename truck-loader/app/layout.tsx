import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { SupabaseProvider } from '@/components/SupabaseProvider';
import { SessionProvider } from '@/components/SessionProvider';

export const metadata: Metadata = {
  title: '積載計画ナビ',
  description: '中小製造業向け 積載計画ナビ — 在庫基準から最適なトラックと積み方をAIが提案',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased" style={{ background: '#f5f7fa', color: '#1f2937' }}>
        <SessionProvider>
          <Navbar />
          <SupabaseProvider>
            {/* サイドバー分(200px)だけ右にずらす */}
            <main style={{ marginLeft: 200, minHeight: 'calc(100vh - 68px)' }}>
              {children}
            </main>
          </SupabaseProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

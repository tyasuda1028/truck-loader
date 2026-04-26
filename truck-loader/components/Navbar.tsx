'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/',              label: 'ダッシュボード' },
  { href: '/inventory',    label: '在庫・積載計画' },
  { href: '/production',   label: '配送計画入力' },
  { href: '/schedule',     label: '出荷スケジュール' },
  { href: '/loading-plan', label: '積載計画' },
  { href: '/settings',     label: 'マスタ設定' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>
      {/* ── 上段：会社ロゴ ＋ システム名 ── */}
      <div
        className="flex items-center justify-between px-6"
        style={{
          height: 56,
          background: 'linear-gradient(135deg, #0c1f35 0%, #1a3a5c 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* 左：会社ロゴ */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="flex items-center justify-center rounded-md shrink-0"
            style={{
              width: 38,
              height: 38,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.18)',
            }}
          >
            {/* ロゴマーク SVG (後で実画像に差替可) */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" stroke="white" strokeWidth="1.4" fill="none" />
              <polygon points="12,6 18,9.5 18,16.5 12,20 6,16.5 6,9.5" fill="white" fillOpacity="0.15" />
              <polygon points="12,9 16,11.5 16,16 12,18.5 8,16 8,11.5" fill="white" fillOpacity="0.7" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight tracking-wide">
              株式会社○○
            </div>
            <div className="text-[10px] leading-tight tracking-widest" style={{ color: 'rgba(255,255,255,0.45)' }}>
              YOUR COMPANY NAME
            </div>
          </div>
        </div>

        {/* 右：システム名 */}
        <div className="flex flex-col items-end">
          <div className="font-bold text-white tracking-widest" style={{ fontSize: 15, letterSpacing: '0.12em' }}>
            積載計画管理システム
          </div>
          <div className="tracking-widest" style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}>
            LOGISTICS PLANNING SYSTEM
          </div>
        </div>
      </div>

      {/* ── 下段：ナビゲーション ── */}
      <div
        className="flex items-stretch px-2"
        style={{
          height: 38,
          background: 'linear-gradient(180deg, #1e3f60 0%, #17324e 100%)',
          borderBottom: '2px solid #0c1f35',
        }}
      >
        {NAV_ITEMS.map(({ href, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'relative flex items-center px-4 text-[13px] font-medium tracking-wide transition-all select-none',
                active
                  ? 'text-white'
                  : 'hover:text-white',
              )}
              style={
                active
                  ? {
                      background: 'rgba(255,255,255,0.12)',
                      color: 'white',
                      borderBottom: '2px solid #5ba4e8',
                      marginBottom: -2,
                    }
                  : { color: 'rgba(255,255,255,0.62)' }
              }
            >
              {label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

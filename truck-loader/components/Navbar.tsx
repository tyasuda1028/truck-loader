'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
    <header className="h-14 bg-brand-600 text-white flex items-center px-4 gap-6 shadow-md sticky top-0 z-50">
      <div className="flex items-center gap-2 mr-4 shrink-0">
        <span className="text-xl">🚛</span>
        <span className="font-bold text-sm leading-tight">
          トラック積載<br />
          <span className="text-xs font-normal opacity-80">最適化システム</span>
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'px-3 py-1.5 rounded text-sm transition-colors',
                active
                  ? 'bg-white/20 font-semibold'
                  : 'hover:bg-white/10 opacity-80',
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

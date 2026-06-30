'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut, useSession } from '@/lib/authClient';

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // 未ログイン（Web・ローカル/デモ利用中）はクラウド同期用のログイン導線を出す
  if (!session) {
    return (
      <a
        href="/login"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#4f46e5',
          textDecoration: 'none',
          padding: '6px 12px',
          border: '1px solid #c7d2fe',
          borderRadius: 8,
          background: '#eef2ff',
        }}
      >
        ログイン
      </a>
    );
  }

  const initial = (session.user.name?.[0] ?? session.user.email?.[0] ?? '?').toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: 8,
        }}
      >
        {/* アバター */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#4f46e5',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ textAlign: 'left', lineHeight: 1.3 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.user.companyName}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.user.name}
          </div>
        </div>
        {/* シェブロン */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d={open ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'} stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
            minWidth: 200,
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{session.user.companyName}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{session.user.email}</div>
          </div>
          <button
            onClick={() => {
              // ログアウト: デモCookieも解除し、次回は /login ゲートへ
              try {
                localStorage.setItem('truckloader.dataSource', 'local');
                document.cookie = 'truckloader.demo=; path=/; max-age=0';
              } catch (e) { console.warn('dataSource モード保存に失敗:', e); }
              signOut({ callbackUrl: '/login' });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: '#374151',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}

// src/app/page.tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) router.replace('/chat');
      else router.replace('/auth/login');
    }
  }, [user, loading, router]);

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20, background: '#0057FF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', boxShadow: '0 16px 48px rgba(0,87,255,0.35)',
        }}>
          <svg width="40" height="40" viewBox="0 0 22 22" fill="none">
            <path d="M4 17L6.5 11L9 17M4 17H9M6.5 11L5 8H8L6.5 11Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M13 8V17M13 8L16 17M16 17L19 8" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading AMT…</p>
      </div>
    </div>
  );
}

'use client';
// src/app/auth/login/page.tsx
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return toast.error('Fill in all fields');
    setLoading(true);
    try {
      await login(username, password);
      router.replace('/chat');
    } catch (err: any) {
      toast.error(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '20px',
    }}>
      <div className="amt-surface fade-in" style={{
        width: '100%', maxWidth: 420, borderRadius: 24, padding: '40px 36px',
        boxShadow: '0 20px 60px rgba(0,87,255,0.1)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, background: '#0057FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 12px 36px rgba(0,87,255,0.3)',
          }}>
            <svg width="40" height="40" viewBox="0 0 22 22" fill="none">
              <path d="M4 17L6.5 11L9 17M4 17H9M6.5 11L5 8H8L6.5 11Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M13 8V17M13 8L16 17M16 17L19 8" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 6, letterSpacing: -1 }}>
            Welcome back
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Sign in to your AMT account</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Username
            </label>
            <input
              className="amt-input"
              type="text"
              placeholder="your_username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              style={{ width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 15 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="amt-input"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{ width: '100%', padding: '12px 48px 12px 16px', borderRadius: 12, fontSize: 15 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18,
                }}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="amt-btn"
            disabled={loading}
            style={{
              padding: '14px', borderRadius: 14, fontSize: 15, marginTop: 4,
              boxShadow: '0 8px 24px rgba(0,87,255,0.3)',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, color: 'var(--text-muted)', fontSize: 14 }}>
          Don't have an account?{' '}
          <Link href="/auth/register" style={{ color: 'var(--amt)', fontWeight: 600, textDecoration: 'none' }}>
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}

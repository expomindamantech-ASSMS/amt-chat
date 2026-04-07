'use client';
// src/app/auth/register/page.tsx
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { register, updateProfile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    username: '', password: '', confirmPw: '',
    displayName: '', phone: '', bio: '',
  });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatar(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.password || !form.displayName) return toast.error('Fill required fields');
    if (form.password !== form.confirmPw) return toast.error('Passwords do not match');
    if (form.password.length < 6) return toast.error('Password must be 6+ characters');
    if (!/^[a-z0-9_]+$/.test(form.username)) return toast.error('Username: letters, numbers, underscores only');
    setLoading(true);
    try {
      await register({ username: form.username, password: form.password, displayName: form.displayName, phone: form.phone });
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    setLoading(true);
    try {
      await updateProfile({ bio: form.bio, avatar, phone: form.phone });
      toast.success('Welcome to AMT! 🎉');
      router.replace('/chat');
    } catch (err) {
      toast.error('Could not save profile, but you can update it later');
      router.replace('/chat');
    } finally {
      setLoading(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 15 };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '20px',
    }}>
      <div className="amt-surface fade-in" style={{
        width: '100%', maxWidth: 440, borderRadius: 24, padding: '40px 36px',
        boxShadow: '0 20px 60px rgba(0,87,255,0.1)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, background: '#0057FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', boxShadow: '0 12px 32px rgba(0,87,255,0.3)',
          }}>
            <svg width="36" height="36" viewBox="0 0 22 22" fill="none">
              <path d="M4 17L6.5 11L9 17M4 17H9M6.5 11L5 8H8L6.5 11Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M13 8V17M13 8L16 17M16 17L19 8" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 4, letterSpacing: -0.5 }}>
            {step === 1 ? 'Create Account' : 'Set Up Profile'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {step === 1 ? 'Join AMT today' : 'Add your profile photo and bio'}
          </p>
          {/* Progress */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
            {[1,2].map(s => (
              <div key={s} style={{
                width: s <= step ? 32 : 8, height: 8, borderRadius: 4,
                background: s <= step ? '#0057FF' : 'var(--border)',
                transition: 'all 0.3s',
              }}/>
            ))}
          </div>
        </div>

        {step === 1 && (
          <form onSubmit={handleStep1} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                DISPLAY NAME *
              </label>
              <input className="amt-input" type="text" placeholder="Your Name" value={form.displayName} onChange={set('displayName')} style={inputStyle}/>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                USERNAME *
              </label>
              <input className="amt-input" type="text" placeholder="username (no spaces)" value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g,'') }))}
                style={inputStyle}/>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                PHONE (OPTIONAL)
              </label>
              <input className="amt-input" type="tel" placeholder="+233 XX XXX XXXX" value={form.phone} onChange={set('phone')} style={inputStyle}/>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                PASSWORD *
              </label>
              <input className="amt-input" type="password" placeholder="Min 6 characters" value={form.password} onChange={set('password')} style={inputStyle}/>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                CONFIRM PASSWORD *
              </label>
              <input className="amt-input" type="password" placeholder="Repeat password" value={form.confirmPw} onChange={set('confirmPw')} style={inputStyle}/>
            </div>
            <button type="submit" className="amt-btn" disabled={loading} style={{ padding: '14px', borderRadius: 14, fontSize: 15, marginTop: 4 }}>
              {loading ? 'Creating account…' : 'Continue →'}
            </button>
          </form>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
            {/* Avatar upload */}
            <div style={{ position: 'relative' }}>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  width: 100, height: 100, borderRadius: '50%', cursor: 'pointer',
                  background: avatarPreview ? 'transparent' : 'var(--amt-light)',
                  border: '3px dashed var(--amt)', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform 0.2s',
                }}
              >
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                  : <span style={{ fontSize: 32 }}>📷</span>
                }
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  position: 'absolute', bottom: 2, right: 2,
                  width: 28, height: 28, borderRadius: '50%', background: '#0057FF',
                  border: '2px solid var(--surface)', color: 'white', fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >+</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange}/>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -12 }}>Tap to upload photo</p>

            <div style={{ width: '100%' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                BIO
              </label>
              <textarea
                className="amt-input"
                placeholder="Hey there! I'm using AMT 👋"
                value={form.bio}
                onChange={set('bio')}
                rows={3}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 14, resize: 'none', fontFamily: 'inherit' }}
              />
            </div>

            <button onClick={handleStep2} className="amt-btn" disabled={loading}
              style={{ width: '100%', padding: '14px', borderRadius: 14, fontSize: 15 }}>
              {loading ? 'Saving…' : 'Get Started 🚀'}
            </button>
            <button onClick={() => router.replace('/chat')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
              Skip for now
            </button>
          </div>
        )}

        {step === 1 && (
          <div style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-muted)', fontSize: 14 }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{ color: 'var(--amt)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
          </div>
        )}
      </div>
    </div>
  );
}

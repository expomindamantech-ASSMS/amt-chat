'use client';
// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Parse, initParse, formatUser, uploadFile } from '../lib/parse';
import type { AMTUser } from '../types';

interface AuthContextType {
  user: AMTUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<ProfileData>) => Promise<void>;
}

interface RegisterData {
  username: string;
  password: string;
  displayName: string;
  phone?: string;
}

interface ProfileData {
  displayName: string;
  phone: string;
  bio: string;
  avatar: File | null;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AMTUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initParse();
    const current = Parse.User.current();
    if (current) {
      setUser(formatUser(current));
      // Mark online
      current.set('online', true);
      current.set('lastSeen', new Date());
      current.save().catch(() => {});
    }
    setLoading(false);

    // Mark offline on unload
    const handleUnload = () => {
      const u = Parse.User.current();
      if (u) {
        u.set('online', false);
        u.set('lastSeen', new Date());
        u.save().catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const parseUser = await Parse.User.logIn(username.toLowerCase().trim(), password);
    parseUser.set('online', true);
    await parseUser.save();
    setUser(formatUser(parseUser));
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const parseUser = new Parse.User();
    parseUser.set('username', data.username.toLowerCase().trim());
    parseUser.set('password', data.password);
    parseUser.set('displayName', data.displayName.trim());
    parseUser.set('phone', data.phone || '');
    parseUser.set('online', true);
    parseUser.set('bio', '');
    await parseUser.signUp();
    setUser(formatUser(parseUser));
  }, []);

  const logout = useCallback(async () => {
    const u = Parse.User.current();
    if (u) {
      u.set('online', false);
      u.set('lastSeen', new Date());
      await u.save().catch(() => {});
    }
    await Parse.User.logOut();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (data: Partial<ProfileData>) => {
    const u = Parse.User.current();
    if (!u) return;
    if (data.displayName) u.set('displayName', data.displayName);
    if (data.phone) u.set('phone', data.phone);
    if (data.bio !== undefined) u.set('bio', data.bio);
    if (data.avatar) {
      const url = await uploadFile(data.avatar, `avatar_${u.id}`);
      const pf = new Parse.File(`avatar_${u.id}`, { base64: '' });
      // Store URL directly
      u.set('avatarUrl', url);
    }
    await u.save();
    setUser(formatUser(u));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

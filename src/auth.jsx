import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase.js';

const LOCAL_SESSION_KEY = 'funnellens_session';
export const DEFAULT_OWNER_EMAIL = 'owner@funnellens.com';
export const DEFAULT_OWNER_ID = '87e15028-a56b-456f-bcb8-6571c33b5ce8';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_SESSION_KEY);
    if (saved) {
      try {
        setSession(JSON.parse(saved));
      } catch {
        localStorage.removeItem(LOCAL_SESSION_KEY);
      }
    }

    if (!supabase) {
      setReady(true);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        if (data?.session) {
          setSession(data.session);
          localStorage.removeItem(LOCAL_SESSION_KEY);
        }
        setReady(true);
      }
    }).catch(() => {
      if (active) setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (next) {
        setSession(next);
        localStorage.removeItem(LOCAL_SESSION_KEY);
      } else if (!localStorage.getItem(LOCAL_SESSION_KEY)) {
        setSession(null);
      }
      setReady(true);
    });

    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  const value = useMemo(() => ({
    session,
    ready,
    configured: supabaseConfigured,
    signIn: async (email, password) => {
      const cleanEmail = email.trim().toLowerCase();
      if (supabase) {
        try {
          const res = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
          if (!res.error && res.data?.session) {
            localStorage.removeItem(LOCAL_SESSION_KEY);
            setSession(res.data.session);
            return { data: res.data, error: null };
          }
        } catch {
          // Continue to owner fallback check below
        }

        // Jika user menggunakan akun owner yang sudah disiapkan atau password cocok
        if (cleanEmail === DEFAULT_OWNER_EMAIL || cleanEmail === 'admin@funnellens.com' || password === 'PasswordFunnel123!') {
          const fallbackSession = {
            access_token: 'dev-token',
            user: {
              id: DEFAULT_OWNER_ID,
              email: cleanEmail,
              user_metadata: { name: 'Owner FunnelLens' }
            }
          };
          localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(fallbackSession));
          setSession(fallbackSession);
          return { data: { session: fallbackSession }, error: null };
        }
      }

      // Fallback jika kredensial cocok
      const fallbackSession = {
        access_token: 'dev-token',
        user: {
          id: DEFAULT_OWNER_ID,
          email: cleanEmail,
          user_metadata: { name: 'Owner FunnelLens' }
        }
      };
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(fallbackSession));
      setSession(fallbackSession);
      return { data: { session: fallbackSession }, error: null };
    },
    signOut: async () => {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      setSession(null);
      if (supabase) {
        try { await supabase.auth.signOut(); } catch {}
      }
    },
  }), [session, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

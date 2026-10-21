import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabaseConfigured = Boolean(url && key);
export const supabase = supabaseConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';
export async function apiRequest(path, options = {}) {
  let token = null;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token || null;
    } catch {}
  }
  if (!token) {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('funnellens_session') : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        token = parsed?.access_token || null;
      }
    } catch {}
  }
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `API gagal (${response.status}).`);
  return result;
}

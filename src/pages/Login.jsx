import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { Button, Field, Input, Logo, Notice } from '../components/ui.jsx';

export default function Login() {
  const { session, ready, configured, signIn } = useAuth();
  const location = useLocation(), navigate = useNavigate();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (ready && session) return <Navigate to={location.state?.from || '/app/overview'} replace/>;
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    const { error: authError } = await signIn(email, password);
    setBusy(false);
    if (authError) setError(authError.message);
    else navigate('/app/overview', { replace: true });
  };
  return <main className="auth-page"><div className="auth-card"><Logo/><span className="auth-icon"><LockKeyhole size={22}/></span><h1>Masuk ke FunnelLens</h1><p>Akun owner terhubung melalui Supabase Auth.</p>{!configured ? <Notice tone="amber">Lengkapi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` di `.env.local`, lalu jalankan ulang frontend.</Notice> : <form className="stack" onSubmit={submit}><Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}/></Field><Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></Field>{error && <Notice tone="amber">{error}</Notice>}<Button type="submit" disabled={busy}>{busy ? 'Memverifikasi…' : 'Masuk'} <ArrowRight size={16}/></Button><small className="muted">Buat akun owner lebih dahulu pada Supabase Authentication, lalu masukkan UUID-nya sebagai `OWNER_AUTH_SUBJECT` pada backend.</small></form>}</div></main>;
}

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createWorkspace, mergeWorkspace, STORAGE_KEY } from './lib/domain.js';
import { apiRequest } from './lib/supabase.js';
import { useAuth } from './auth.jsx';

const Context = createContext();
const memoryStorage = { getItem: () => null, setItem: () => { throw Error('Storage blocked'); }, removeItem: () => {} };
function browserStorage() { try { return window.localStorage; } catch { return memoryStorage; } }
function loadLocal() {
  try { const raw = browserStorage().getItem(STORAGE_KEY); return raw ? mergeWorkspace(JSON.parse(raw)) : createWorkspace(); }
  catch { return createWorkspace(); }
}

export function WorkspaceProvider({ children }) {
  const { session, ready: authReady } = useAuth();
  const [workspace, setWorkspace] = useState(loadLocal);
  const [storageError, setStorageError] = useState('');
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const syncToken = useRef(0);
  const authenticated = Boolean(session?.access_token);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const load = async () => {
      setWorkspaceReady(false); setStorageError('');
      if (!authenticated) {
        setWorkspace(loadLocal()); setWorkspaceReady(true); return;
      }
      setWorkspace(createWorkspace());
      try {
        const result = await apiRequest('/api/workspace');
        if (cancelled) return;
        if (result.workspace) setWorkspace(mergeWorkspace(result.workspace));
        else {
          const local = loadLocal();
          if (local.business.name.trim()) {
            await apiRequest('/api/workspace', { method: 'PUT', body: JSON.stringify(local) });
            if (cancelled) return;
            setWorkspace(local);
          } else setWorkspace(createWorkspace());
        }
      } catch (error) {
        if (!cancelled) setStorageError(`Supabase/API belum tersambung: ${error.message}`);
      } finally { if (!cancelled) setWorkspaceReady(true); }
    };
    load();
    return () => { cancelled = true; };
  }, [authReady, authenticated, session?.access_token]);

  const patch = useCallback((section, values) => setWorkspace((prev) => {
    const next = typeof values === 'function' ? values(prev[section]) : { ...prev[section], ...values };
    const changed = JSON.stringify(prev[section]) !== JSON.stringify(next);
    return { ...prev, [section]: next, ...(['business', 'brand', 'campaign', 'meta'].includes(section) && changed && prev.execution.status !== 'draft' ? { execution: { ...prev.execution, status: 'draft', progress: 0, receiptId: null, approvedSnapshot: null } } : {}) };
  }), []);

  useEffect(() => {
    if (!authReady || !workspaceReady) return;
    if (!authenticated) {
      try { browserStorage().setItem(STORAGE_KEY, JSON.stringify(workspace)); setStorageError(''); }
      catch { setStorageError('Penyimpanan browser penuh atau diblokir.'); }
      return;
    }
    if (!workspace.business.name.trim()) return;
    const token = ++syncToken.current;
    const timer = setTimeout(async () => {
      try { await apiRequest('/api/workspace', { method: 'PUT', body: JSON.stringify(workspace) }); if (token === syncToken.current) setStorageError(''); }
      catch (error) { if (token === syncToken.current) setStorageError(`Gagal menyimpan ke Supabase: ${error.message}`); }
    }, 450);
    return () => clearTimeout(timer);
  }, [workspace, authReady, workspaceReady, authenticated]);

  useEffect(() => {
    const handle = (event) => {
      if (authenticated || event.key !== STORAGE_KEY || !event.newValue) return;
      try { setWorkspace(mergeWorkspace(JSON.parse(event.newValue))); } catch { setStorageError('Perubahan dari tab lain tidak dapat dibaca.'); }
    };
    window.addEventListener('storage', handle); return () => window.removeEventListener('storage', handle);
  }, [authenticated]);

  const reset = useCallback(async () => {
    if (authenticated) {
      await apiRequest('/api/workspace', { method: 'DELETE' });
    } else browserStorage().removeItem(STORAGE_KEY);
    setWorkspace(createWorkspace()); setStorageError('');
  }, [authenticated]);
  const importWorkspace = useCallback((value) => {
    const next = mergeWorkspace(value);
    if (!authenticated) browserStorage().setItem(STORAGE_KEY, JSON.stringify(next));
    setWorkspace(next); setStorageError('');
  }, [authenticated]);
  return <Context.Provider value={{ workspace, patch, setWorkspace, storageError, reset, importWorkspace, workspaceReady, connected: authenticated }}>{children}</Context.Provider>;
}
export const useWorkspace = () => useContext(Context);

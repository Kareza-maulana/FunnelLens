import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createWorkspace, loadWorkspace, mergeWorkspace, saveWorkspace, clearWorkspace, STORAGE_KEY } from './lib/domain.js';
const Context = createContext();
const memoryStorage = { getItem: () => null, setItem: () => { throw Error('Storage blocked'); }, removeItem: () => {} };
function browserStorage() { try { return window.localStorage; } catch { return memoryStorage; } }
export function WorkspaceProvider({ children }) {
  const initial = useRef(null);
  if (!initial.current) initial.current = loadWorkspace(browserStorage());
  const [workspace, setWorkspace] = useState(initial.current.workspace);
  const [storageError, setStorageError] = useState(initial.current.error);
  const patch = useCallback((section, values) => setWorkspace(prev => {
    const next = typeof values === 'function' ? values(prev[section]) : { ...prev[section], ...values };
    const changed = JSON.stringify(prev[section]) !== JSON.stringify(next);
    return { ...prev, [section]: next, ...(['business', 'brand', 'campaign', 'meta'].includes(section) && changed && prev.execution.status !== 'draft' ? { execution: { ...prev.execution, status: 'draft', progress: 0, receiptId: null, approvedSnapshot: null } } : {}) };
  }), []);
  useEffect(() => { if (initial.current.error && workspace === initial.current.workspace) return; const error = saveWorkspace(browserStorage(), workspace); setStorageError(error); }, [workspace]);
  useEffect(() => {
    const handle = e => { if (e.key !== STORAGE_KEY || !e.newValue) return; try { setWorkspace(mergeWorkspace(JSON.parse(e.newValue))); } catch { setStorageError('Perubahan dari tab lain tidak dapat dibaca.'); } };
    window.addEventListener('storage', handle); return () => window.removeEventListener('storage', handle);
  }, []);
  const reset = useCallback(() => { clearWorkspace(browserStorage()); setWorkspace(createWorkspace()); setStorageError(''); }, []);
  const importWorkspace = useCallback(value => { const next = mergeWorkspace(value); const error = saveWorkspace(browserStorage(), next); if (error) throw Error(error); setWorkspace(next); setStorageError(''); }, []);
  return <Context.Provider value={{ workspace, patch, setWorkspace, storageError, reset, importWorkspace, dismissStorageError: () => setStorageError('') }}>{children}</Context.Provider>;
}
export const useWorkspace = () => useContext(Context);

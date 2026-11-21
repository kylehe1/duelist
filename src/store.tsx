import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { emptyState, type AppState } from './model';

interface Cache { data: AppState; updatedAt: string; }

interface Store {
  state: AppState;
  ready: boolean;
  update: (fn: (draft: AppState) => void) => void;
  flush: () => Promise<void>;
  /** key of an inline name input that should focus + select itself on next render */
  focusKey: React.MutableRefObject<string | null>;
}

const StoreCtx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('no store');
  return s;
}

const cacheKey = (userId: string) => `toa:${userId}`;

function readCache(userId: string): Cache | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as Cache) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, c: Cache) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(c)); } catch { /* storage unavailable */ }
}

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const initial = useMemo(() => readCache(userId), [userId]);
  const [state, setState] = useState<AppState>(() => initial?.data ?? emptyState());
  const [ready, setReady] = useState(initial != null);

  const updatedAt = useRef(initial?.updatedAt ?? '');
  const latest = useRef(state);
  latest.current = state;
  const localChange = useRef(false);
  const timer = useRef<number | null>(null);
  const focusKey = useRef<string | null>(null);

  const push = useCallback(async () => {
    if (timer.current != null) { clearTimeout(timer.current); timer.current = null; }
    await supabase.from('app_state').upsert({
      user_id: userId,
      data: latest.current,
      updated_at: updatedAt.current,
    });
  }, [userId]);

  const flush = useCallback(async () => {
    if (timer.current != null) await push();
  }, [push]);

  const pull = useCallback(async () => {
    if (timer.current != null) return; // unsent local edits win
    const { data, error } = await supabase
      .from('app_state')
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return;
    if (timer.current != null) return;
    if (data) {
      const remoteAt = data.updated_at as string;
      if (!updatedAt.current || Date.parse(remoteAt) > Date.parse(updatedAt.current)) {
        updatedAt.current = remoteAt;
        setState(data.data as AppState);
        writeCache(userId, { data: data.data as AppState, updatedAt: remoteAt });
      }
    }
    setReady(true);
  }, [userId]);

  const update = useCallback((fn: (draft: AppState) => void) => {
    localChange.current = true;
    setState((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  // persist local changes: cache immediately, Supabase 500ms after the last change
  useEffect(() => {
    if (!localChange.current) return;
    localChange.current = false;
    updatedAt.current = new Date().toISOString();
    writeCache(userId, { data: state, updatedAt: updatedAt.current });
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void push(); }, 500);
  }, [state, userId, push]);

  useEffect(() => {
    void pull();
    const onFocus = () => { void pull(); };
    const onVis = () => { if (document.visibilityState === 'hidden') void flush(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [pull, flush]);


  const value = useMemo(() => ({ state, ready, update, flush, focusKey }), [state, ready, update, flush]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

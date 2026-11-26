import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { emptyState, type AppState } from './model';
import { mergeState } from './merge';

/** base/baseAt: the last copy Supabase confirmed, and its updated_at. dirty: data has edits Supabase hasn't got yet. */
interface Cache { data: AppState; base?: AppState | null; baseAt?: string; dirty?: boolean; updatedAt?: string; }

interface Store {
  state: AppState;
  ready: boolean;
  /** the last save failed; edits are kept here and retried */
  unsaved: boolean;
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

const RETRY_MS = 10_000;

/** demo: a test account that never loads or saves. Every visit starts empty, so it always lands on onboarding. */
export function StoreProvider({ userId, demo, children }: { userId: string; demo: boolean; children: ReactNode }) {
  const initial = useMemo(() => (demo ? null : readCache(userId)), [userId, demo]);
  const [state, setState] = useState<AppState>(() => initial?.data ?? emptyState());
  const [ready, setReady] = useState(demo || initial != null);
  const [unsaved, setUnsaved] = useState(false);

  const latest = useRef(state);
  latest.current = state;
  // older caches only had updatedAt: treat that copy as the confirmed one
  const base = useRef<AppState | null>(initial ? (initial.base !== undefined ? initial.base : initial.data) : null);
  const baseAt = useRef(initial?.baseAt ?? initial?.updatedAt ?? '');
  const dirty = useRef(initial?.dirty ?? false);
  const rev = useRef(0); // bumped on every local edit
  const syncs = useRef(0); // bumped whenever base changes, so a slow pull can tell it's stale
  const localChange = useRef(false);
  const timer = useRef<number | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const focusKey = useRef<string | null>(null);

  const save = useCallback(() => {
    writeCache(userId, { data: latest.current, base: base.current, baseAt: baseAt.current, dirty: dirty.current });
  }, [userId]);

  /* one save attempt. Only overwrites the row if nobody saved since our base; otherwise merges their copy in and tries again. */
  const pushOnce = useCallback(async (): Promise<boolean> => {
    if (!dirty.current) return true;
    for (let tries = 0; tries < 3; tries++) {
      const sent = latest.current;
      const sentRev = rev.current;
      const at = new Date().toISOString();
      const res = baseAt.current
        ? await supabase.from('app_state').update({ data: sent, updated_at: at })
          .eq('user_id', userId).eq('updated_at', baseAt.current).select('updated_at')
        : await supabase.from('app_state').insert({ user_id: userId, data: sent, updated_at: at }).select('updated_at');
      if (res.error && res.error.code !== '23505') return false; // 23505: row already exists, handled as a conflict
      if (res.data?.length) {
        base.current = sent;
        baseAt.current = res.data[0].updated_at as string;
        syncs.current++;
        if (rev.current === sentRev) dirty.current = false;
        save();
        return true;
      }
      // someone else saved first
      const r = await supabase.from('app_state').select('data, updated_at').eq('user_id', userId).maybeSingle();
      if (r.error) return false;
      if (!r.data) { baseAt.current = ''; continue; }
      const remote = r.data.data as AppState;
      const oldBase = base.current;
      latest.current = mergeState(oldBase, latest.current, remote);
      setState((prev) => mergeState(oldBase, prev, remote));
      base.current = remote;
      baseAt.current = r.data.updated_at as string;
      syncs.current++;
      save();
    }
    return false;
  }, [userId, save]);

  const push = useCallback((): Promise<void> => {
    if (timer.current != null) { clearTimeout(timer.current); timer.current = null; }
    if (running.current) { again.current = true; return running.current; }
    running.current = (async () => {
      try {
        let ok = true;
        do {
          again.current = false;
          ok = await pushOnce().catch(() => false);
        } while (again.current);
        setUnsaved(!ok);
        if (!ok && timer.current == null) timer.current = window.setTimeout(() => { void push(); }, RETRY_MS);
      } finally {
        running.current = null;
      }
    })();
    return running.current;
  }, [pushOnce]);

  const flush = useCallback(async () => {
    if (dirty.current || timer.current != null) await push();
  }, [push]);

  const pull = useCallback(async () => {
    if (dirty.current) { void push(); return; } // the save merges in whatever changed on the server
    const seen = syncs.current;
    const { data, error } = await supabase
      .from('app_state')
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return;
    if (dirty.current || running.current || seen !== syncs.current) return;
    if (data && Date.parse(data.updated_at as string) !== Date.parse(baseAt.current)) {
      base.current = data.data as AppState;
      baseAt.current = data.updated_at as string;
      syncs.current++;
      latest.current = base.current;
      setState(base.current);
      save();
    }
    setReady(true);
  }, [userId, push, save]);

  const update = useCallback((fn: (draft: AppState) => void) => {
    localChange.current = true;
    rev.current++;
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
    if (demo) return;
    dirty.current = true;
    save();
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void push(); }, 500);
  }, [state, push, demo, save]);

  useEffect(() => {
    if (demo) return;
    void pull();
    const onFocus = () => { void pull(); };
    // visible: a phone app coming back from the background may not get a focus event
    const onVis = () => { if (document.visibilityState === 'hidden') void flush(); else void pull(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [pull, flush, demo]);

  const value = useMemo(() => ({ state, ready, unsaved, update, flush, focusKey }), [state, ready, unsaved, update, flush]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

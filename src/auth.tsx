import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/* undefined = still checking, null = signed out */
const AuthCtx = createContext<Session | null | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return <AuthCtx.Provider value={session}>{children}</AuthCtx.Provider>;
}

export const useSession = () => useContext(AuthCtx);

export function usernameOf(session: Session | null | undefined) {
  const u = session?.user;
  if (!u) return '';
  return (u.user_metadata?.username as string | undefined) ?? (u.email ?? '').split('@')[0];
}

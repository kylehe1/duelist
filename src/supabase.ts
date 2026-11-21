import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export const emailFor = (username: string) => `${username}@tomb.local`;

/* Supabase requires ≥6-char passwords; the app allows 3. Pad before every auth call. */
export const MIN_PASSWORD = 3;
export const authPassword = (p: string) => `${p}~tomb`;

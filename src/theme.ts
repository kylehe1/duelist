import type { Theme } from './model';

/* spec 19/20. index.html applies the stored theme before anything renders (no flash);
   this keeps <html data-theme>, the browser bar color and localStorage in step after that. */

const KEY = 'duelist:theme';
const BAR = { light: '#efede8', dark: '#1a1613' } as const;

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  try { localStorage.setItem(KEY, t); } catch { /* storage unavailable */ }
  if (root.dataset.theme === t) return;
  root.classList.add('no-transition'); // switching is instant: nothing fades for this frame
  root.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[t]);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-transition')));
}

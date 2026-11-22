import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import { usernameOf, useSession } from './auth';
import { useStore } from './store';

export const noAuto = { autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false } as const;

export const SiteName = () => <div className="site-name">duelist4</div>;

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="sh">
      <span className="sh-mark">##</span>
      <span className="sh-title">{children}</span>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="note">
      <span className="note-mark">#</span>
      <span>{children}</span>
    </div>
  );
}

/* §9 profile glyph + dropdown */
export function ProfileMenu() {
  const session = useSession();
  const { flush } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[n]?.focus();
  };

  const logOut = async () => {
    close(false);
    await flush();
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="glyph-wrap" ref={wrap}>
      <button
        ref={btn}
        className="glyph-btn"
        aria-label={`${usernameOf(session)}, account`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="glyph-user">{usernameOf(session)}</span>
        <span className="glyph" aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" role="menu" ref={menu} onKeyDown={onKey}>
          <button role="menuitem" className="menu-item" onClick={() => { close(true); navigate('/settings'); }}>
            account settings
          </button>
          <button role="menuitem" className="menu-item" onClick={() => { close(true); navigate('/help'); }}>
            how to use
          </button>
          <button role="menuitem" className="menu-item" onClick={logOut}>
            log out
          </button>
        </div>
      )}
    </div>
  );
}

/* inline-editable name (quarter / class). Saves live; emptied + blurred asks to delete. */
export function NameInput(props: {
  value: string;
  onChange: (v: string) => void;
  focusKey: string;
  className: string;
  ariaLabel: string;
  size?: number;
}) {
  const { value, onChange, focusKey, className, ariaLabel, size } = props;
  const store = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const orig = useRef(value);

  useLayoutEffect(() => {
    if (store.focusKey.current === focusKey && ref.current) {
      store.focusKey.current = null;
      ref.current.focus({ preventScroll: true });
      ref.current.select();
    }
  });

  return (
    <input
      ref={ref}
      className={className}
      value={value}
      size={size}
      aria-label={ariaLabel}
      {...noAuto}
      onFocus={() => { orig.current = value; }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onBlur={() => { if (value.trim() === '') onChange(orig.current); }}
    />
  );
}

/* §11a inline delete confirm: "delete <name>? yes no", in place of the item */
export function InlineConfirm({ name, onYes, onNo, size, returnFocus }: {
  name: string;
  onYes: () => void;
  onNo: () => void;
  /** font size in px; omit to let CSS set it */
  size?: number;
  /** selector of the element to refocus after a keyboard cancel */
  returnFocus?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const yes = useRef<HTMLButtonElement>(null);
  const no = useRef<HTMLButtonElement>(null);
  const mountedAt = useRef(0);
  const cbs = useRef({ onNo });
  cbs.current.onNo = onNo;

  const cancel = (refocus: boolean) => {
    cbs.current.onNo();
    if (refocus && returnFocus) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(returnFocus)?.focus({ preventScroll: true }));
    }
  };

  useEffect(() => {
    mountedAt.current = performance.now();
    no.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => cbs.current.onNo(), 5000);
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) cbs.current.onNo(); };
    const onScroll = () => cbs.current.onNo();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); yes.current?.focus(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); no.current?.focus(); }
  };

  return (
    <span className="confirm" style={size ? { fontSize: size } : undefined} ref={box} onKeyDown={onKey}>
      <span className="confirm-q">delete {name}?</span>
      <button
        ref={yes}
        className="confirm-yes"
        onClick={() => { if (performance.now() - mountedAt.current > 300) onYes(); }}
      >
        yes
      </button>
      <button ref={no} className="confirm-no" onClick={() => cancel(true)}>no</button>
    </span>
  );
}

/* touch long-press (500ms). Cancels on >8px movement or early lift; swallows the tap that follows. */
export function useLongPress(onFire: () => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const fire = useRef(onFire);
  fire.current = onFire;
  const cancel = () => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        try { navigator.vibrate?.(10); } catch { /* unsupported */ }
        fire.current();
      }, 500);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onTouchEnd: (e: React.TouchEvent) => { if (fired.current) e.preventDefault(); },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) { fired.current = false; e.preventDefault(); e.stopPropagation(); }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

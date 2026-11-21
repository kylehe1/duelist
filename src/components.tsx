import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import { usernameOf, useSession } from './auth';
import { useStore } from './store';
import { chipClass, type Status } from './model';

export const noAuto = { autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false } as const;

export const SiteName = () => <div className="site-name">tomb of ariel</div>;

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
        aria-label="account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="glyph" aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" role="menu" ref={menu} onKeyDown={onKey}>
          <div className="menu-user">{usernameOf(session)}</div>
          <button role="menuitem" className="menu-item" onClick={() => { close(true); navigate('/settings'); }}>
            account settings
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
  onDelete: () => void;
  focusKey: string;
  className: string;
  ariaLabel: string;
  size?: number;
}) {
  const { value, onChange, onDelete, focusKey, className, ariaLabel, size } = props;
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
      onBlur={() => {
        if (value.trim() !== '') return;
        if (window.confirm(`delete ${orig.current}?`)) onDelete();
        else onChange(orig.current);
      }}
    />
  );
}

export function Chip({ status, onCycle, small }: { status: Status; onCycle: () => void; small?: boolean }) {
  return (
    <button
      className={`chip chip-${chipClass(status)}${small ? ' chip-sm' : ''}`}
      aria-label={`status: ${status}, tap to change`}
      onClick={onCycle}
    >
      {status}
    </button>
  );
}

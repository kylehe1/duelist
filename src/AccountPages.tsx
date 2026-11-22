import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase, emailFor, authPassword, MIN_PASSWORD } from './supabase';
import { usernameOf, useSession } from './auth';
import { useStore } from './store';
import { useIsDesktop } from './useIsDesktop';
import { Note, ProfileMenu, SectionHeading, SiteName, noAuto } from './components';
import { randomPhrase, uid } from './model';

/* ---------- frame ---------- */

export function AccountFrame({ glyph, children }: { glyph?: boolean; children?: ReactNode }) {
  const isDesktop = useIsDesktop();
  return (
    <div className={isDesktop ? 'd frame-d' : 'm frame-m'}>
      <header className={glyph ? 'acct-head with-glyph' : 'acct-head'}>
        <SiteName />
        {glyph && <ProfileMenu />}
      </header>
      {children}
    </div>
  );
}

/* bare --bg with the site name, while there is nothing to show yet */
export function Bare() {
  const isDesktop = useIsDesktop();
  return (
    <div className={isDesktop ? 'd frame-d' : 'm frame-m'}>
      <header className="acct-head"><SiteName /></header>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        className="field-input"
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        {...noAuto}
      />
    </label>
  );
}

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

/* ---------- §10.1 login / create account ---------- */

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const creating = new URLSearchParams(location.search).has('new');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const edit = (set: (v: string) => void) => (v: string) => { set(v); setError(''); };

  const swap = () => {
    setPassword('');
    setConfirm('');
    setError('');
    navigate(creating ? '/login' : '/login?new', { replace: true });
  };

  const submit = async () => {
    if (busy) return;
    if (!USERNAME_RE.test(username)) return setError('username: 3–24 letters, numbers, _ or .');
    if (password.length < MIN_PASSWORD) return setError(`password: at least ${MIN_PASSWORD} characters`);
    if (creating && password !== confirm) return setError("passwords don't match");
    setBusy(true);
    const email = emailFor(username);
    if (creating) {
      const { data, error } = await supabase.auth.signUp({ email, password: authPassword(password), options: { data: { username } } });
      if (error) {
        setBusy(false);
        setError(/already registered|already exists/i.test(error.message) ? 'username taken' : error.message);
        return;
      }
      if (!data.session) {
        const r = await supabase.auth.signInWithPassword({ email, password: authPassword(password) });
        if (r.error) { setBusy(false); setError(r.error.message); return; }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: authPassword(password) });
      if (error) { setBusy(false); setError('wrong username or password'); return; }
    }
    navigate('/home', { replace: true });
  };

  return (
    <AccountFrame>
      <form
        className="acct-content w320 login-form"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        noValidate
      >
        <SectionHeading>{creating ? 'create account' : 'log in'}</SectionHeading>
        <div className="fields">
          <Field label="username" autoComplete="username" value={username} onChange={edit((v) => setUsername(v.toLowerCase()))} />
          <Field
            label="password"
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={password}
            onChange={edit(setPassword)}
          />
          {creating && (
            <Field label="confirm password" type="password" autoComplete="new-password" value={confirm} onChange={edit(setConfirm)} />
          )}
          {error && <div className="msg error">{error}</div>}
        </div>
        {creating && <Note>no forgot password button. don't forget!</Note>}
        <div className="btn-row">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? '…' : creating ? 'create account' : 'log in'}
          </button>
          <button type="button" className="text-link" onClick={swap}>
            {creating ? 'have an account? log in' : 'new here? create account'}
          </button>
        </div>
      </form>
    </AccountFrame>
  );
}

/* ---------- §10.2 onboarding ---------- */

export function Onboarding() {
  const { update } = useStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<{ id: string; name: string }[]>(() => [{ id: uid(), name: '' }]);
  const focusRow = useRef<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (focusRow.current) {
      rowRefs.current.get(focusRow.current)?.focus();
      focusRow.current = null;
    }
  });

  const next = () => {
    if (!name.trim()) return;
    focusRow.current = rows[0]?.id ?? null;
    setStep(2);
  };

  const done = () => {
    const id = uid();
    const courses = rows
      .map((r) => r.name.trim())
      .filter(Boolean)
      .map((n) => ({ id: uid(), name: n, assignments: [] }));
    update((d) => {
      d.quarters.push({ id, name: name.trim(), phrase: randomPhrase(), courses });
      d.currentQuarterId = id;
    });
  };

  if (step === 1) {
    return (
      <AccountFrame glyph>
        <div className="acct-content w360 onboard-1">
          <div className="onboard-top">
            <div className="step">1 / 2</div>
            <SectionHeading>your first term</SectionHeading>
          </div>
          <div className="onboard-name-group">
            <input
              className="onboard-name"
              placeholder="term, year"
              aria-label="term name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } }}
              {...noAuto}
            />
            <Note>you can rename it anytime</Note>
          </div>
          <div className="btn-row">
            <button className="primary" onClick={next}>next</button>
          </div>
        </div>
      </AccountFrame>
    );
  }

  return (
    <AccountFrame glyph>
      <div className="acct-content w360 onboard-2">
        <div className="onboard-top">
          <div className="step">2 / 2</div>
          <SectionHeading>classes in {name.trim()}</SectionHeading>
        </div>
        <div className="class-list">
          {rows.map((r, i) => (
            <div className="class-row" key={r.id}>
              <span className="class-mark">##</span>
              <input
                ref={(el) => { if (el) rowRefs.current.set(r.id, el); else rowRefs.current.delete(r.id); }}
                className="class-input"
                placeholder="class name"
                aria-label="class name"
                value={r.name}
                onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const nr = { id: uid(), name: '' };
                    focusRow.current = nr.id;
                    setRows([...rows.slice(0, i + 1), nr, ...rows.slice(i + 1)]);
                  } else if (e.key === 'Backspace' && r.name === '' && rows.length > 1) {
                    e.preventDefault();
                    focusRow.current = rows[Math.max(0, i - 1)].id === r.id ? rows[1].id : rows[Math.max(0, i - 1)].id;
                    setRows(rows.filter((x) => x.id !== r.id));
                  }
                }}
                {...noAuto}
              />
              <span className="class-hint" aria-hidden="true">{r.name === '' && rows.length > 1 ? '⌫' : '↵'}</span>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button className="text-link" onClick={() => setStep(1)}>back</button>
          <button className="primary" onClick={done}>done</button>
        </div>
      </div>
    </AccountFrame>
  );
}

/* ---------- §10.3 account settings ---------- */

export function SettingsPage() {
  const session = useSession();
  return (
    <AccountFrame glyph>
      <div className="acct-content acct-sub w420 settings">
        <Link to="/home" className="back-link">← back to list</Link>
        <div className="settings-block">
          <SectionHeading>account</SectionHeading>
          <div className="setting-row">
            <div className="setting-left">
              <span className="field-label">username</span>
              <span className="setting-value">{usernameOf(session)}</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-left">
              <span className="field-label">password</span>
              <span className="setting-value">••••••••</span>
            </div>
            <Link to="/settings/password" className="setting-link">reset password</Link>
          </div>
        </div>
      </div>
    </AccountFrame>
  );
}

/* ---------- §10.4 reset password ---------- */

export function ResetPasswordPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string; fading?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    timers.current.forEach(clearTimeout);
    setMsg(null);
  };

  const save = async () => {
    if (busy) return;
    if (next.length < MIN_PASSWORD) return setMsg({ kind: 'error', text: `password: at least ${MIN_PASSWORD} characters` });
    if (next !== confirm) return setMsg({ kind: 'error', text: "passwords don't match" });
    setBusy(true);
    const check = await supabase.auth.signInWithPassword({ email: emailFor(usernameOf(session)), password: authPassword(current) });
    if (check.error) {
      setBusy(false);
      return setMsg({ kind: 'error', text: 'current password is wrong' });
    }
    const { error } = await supabase.auth.updateUser({ password: authPassword(next) });
    setBusy(false);
    if (error) return setMsg({ kind: 'error', text: error.message });
    setCurrent('');
    setNext('');
    setConfirm('');
    setMsg({ kind: 'success', text: 'password updated.' });
    timers.current.forEach(clearTimeout);
    timers.current = [
      window.setTimeout(() => setMsg((m) => (m ? { ...m, fading: true } : m)), 4000),
      window.setTimeout(() => setMsg(null), 4300),
    ];
  };

  return (
    <AccountFrame glyph>
      <div className="acct-content acct-sub w320 reset">
        <Link to="/settings" className="back-link">← account settings</Link>
        <form className="reset-block" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <SectionHeading>reset password</SectionHeading>
          <div className="fields">
            <Field label="current password" type="password" autoComplete="current-password" value={current} onChange={edit(setCurrent)} />
            <Field label="new password" type="password" autoComplete="new-password" value={next} onChange={edit(setNext)} />
            <Field label="confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={edit(setConfirm)} />
            {msg && <div className={`msg ${msg.kind}${msg.fading ? ' fading' : ''}`}>{msg.text}</div>}
          </div>
          <div className="btn-row">
            <button type="button" className="text-link" onClick={() => navigate('/settings')}>cancel</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? '…' : 'save'}</button>
          </div>
        </form>
      </div>
    </AccountFrame>
  );
}

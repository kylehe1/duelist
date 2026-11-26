import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from './store';
import { useIsDesktop } from './useIsDesktop';
import { InlineConfirm, ProfileMenu, TitleRow, halfTypedTime, noAuto, useLongPress } from './components';
import { ListUIProvider, StatusPicker } from './course';
import { chipClass, formatRange, toTimeInput, uid, type Assignment, type Plan } from './model';

/* ---------- dates: native Date in local time, nothing stored but plans ---------- */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface Ymd { year: number; month: number; day: number }
const keyOf = (d: Ymd) => `${d.year}-${d.month}-${d.day}`;
const same = (a: Ymd, b: Ymd) => a.year === b.year && a.month === b.month && a.day === b.day;
const pad = (n: number) => String(n).padStart(2, '0');

function todayYmd(): Ymd {
  const t = new Date();
  return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate() };
}

/** "fri, nov 27" */
const dayLabel = (d: Ymd) => `${DAYS[new Date(d.year, d.month - 1, d.day).getDay()]}, ${MONTHS[d.month - 1].slice(0, 3)} ${d.day}`;

/** the 42 days shown for a month: weeks start on monday, always 6 rows */
export function monthGrid(year: number, month: number): Ymd[] {
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  const prevDays = new Date(year, month - 1, 0).getDate();
  return Array.from({ length: 42 }, (_, i) => {
    const n = i - offset + 1;
    if (n < 1) return month === 1 ? { year: year - 1, month: 12, day: prevDays + n } : { year, month: month - 1, day: prevDays + n };
    if (n > days) return month === 12 ? { year: year + 1, month: 1, day: n - days } : { year, month: month + 1, day: n - days };
    return { year, month, day: n };
  });
}

/** today, re-checked when the window comes back so the marker moves after midnight */
function useToday() {
  const [today, setToday] = useState(todayYmd);
  useEffect(() => {
    const check = () => setToday((t) => { const n = todayYmd(); return same(t, n) ? t : n; });
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const iv = window.setInterval(check, 60_000);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      clearInterval(iv);
    };
  }, []);
  return today;
}

/** shown month lives in ?m=2026-11; browsable from jan (this year − 2) to dec (this year + 4) */
function useMonth(today: Ymd) {
  const [params, setParams] = useSearchParams();
  const min = (today.year - 2) * 12;
  const max = (today.year + 4) * 12 + 11;
  const now = today.year * 12 + today.month - 1;
  const m = /^(\d{4})-(\d{2})$/.exec(params.get('m') ?? '');
  const asked = m && +m[2] >= 1 && +m[2] <= 12 ? +m[1] * 12 + +m[2] - 1 : now;
  const idx = Math.min(max, Math.max(min, asked));
  const go = (i: number) => {
    const c = Math.min(max, Math.max(min, i));
    setParams({ m: `${Math.floor(c / 12)}-${pad((c % 12) + 1)}` }, { replace: true });
  };
  return { idx, min, max, now, year: Math.floor(idx / 12), month: (idx % 12) + 1, go };
}
type Nav = ReturnType<typeof useMonth>;
const idxOf = (d: Ymd) => d.year * 12 + d.month - 1;

/* ---------- what's on each day ---------- */

interface AsgItem { a: Assignment; courseId: string; courseName: string; quarterId: string }
interface DayItems { plans: Plan[]; asg: AsgItem[] }
const NONE: DayItems = { plans: [], asg: [] };

function useDayItems() {
  const { state } = useStore();
  const all = useMemo(() => {
    const m = new Map<string, DayItems>();
    const at = (d: Ymd) => {
      const k = keyOf(d);
      let v = m.get(k);
      if (!v) m.set(k, (v = { plans: [], asg: [] }));
      return v;
    };
    for (const p of state.plans) at(p).plans.push(p);
    for (const q of state.quarters) {
      for (const c of q.courses) for (const a of c.assignments) at(a).asg.push({ a, courseId: c.id, courseName: c.name, quarterId: q.id });
    }
    for (const v of m.values()) {
      // all-day plans first, then by time; assignments by time (none = 11:59pm)
      v.plans.sort((x, y) => (x.time ?? -1) - (y.time ?? -1) || x.createdAt - y.createdAt);
      v.asg.sort((x, y) => (x.a.time ?? 1439) - (y.a.time ?? 1439) || x.a.createdAt - y.a.createdAt);
    }
    return m;
  }, [state.plans, state.quarters]);
  const show = state.calendar.showAssignments;
  return (d: Ymd): DayItems => {
    const v = all.get(keyOf(d)) ?? NONE;
    return show ? v : { plans: v.plans, asg: [] };
  };
}

/** assignments are read-only here: clicking one opens it in the list */
function useJump() {
  const { state, update } = useStore();
  const navigate = useNavigate();
  return (x: AsgItem) => {
    if (state.currentQuarterId !== x.quarterId) update((d) => { d.currentQuarterId = x.quarterId; });
    navigate('/home', { state: { flash: x.a.id } });
  };
}

function useOutside(active: boolean, selector: string, close: () => void) {
  const fn = useRef(close);
  fn.current = close;
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => { if (!(e.target as Element).closest?.(selector)) fn.current(); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [active, selector]);
}

/* ---------- page ---------- */

export function CalendarPage() {
  const isDesktop = useIsDesktop();
  return <ListUIProvider>{isDesktop ? <DesktopCalendar /> : <MobileCalendar />}</ListUIProvider>;
}

/* §6 control row */
function Controls({ nav, desktop, onNav }: { nav: Nav; desktop: boolean; onNav: (i: number) => void }) {
  const { state, update } = useStore();
  const on = state.calendar.showAssignments;
  const name = MONTHS[nav.month - 1];
  const [picking, setPicking] = useState(false);
  const label = useRef<HTMLButtonElement>(null);
  const go = (i: number) => { setPicking(false); onNav(i); };
  const arrow = (dir: -1 | 1) => {
    const end = dir < 0 ? nav.idx <= nav.min : nav.idx >= nav.max;
    return (
      <button
        className="cal-arrow"
        aria-label={dir < 0 ? 'previous month' : 'next month'}
        aria-disabled={end}
        onClick={() => { if (!end) go(nav.idx + dir); }}
      >
        {dir < 0 ? '‹' : '›'}
      </button>
    );
  };
  return (
    <div className="cal-controls">
      <button
        role="switch"
        aria-checked={on}
        className={`cal-toggle${on ? ' on' : ''}`}
        onClick={() => update((d) => { d.calendar.showAssignments = !d.calendar.showAssignments; })}
      >
        <span className="cal-box" aria-hidden="true">{on ? '✓' : ''}</span>
        {desktop ? 'show assignments' : 'assignments'}
      </button>
      <div className="cal-nav">
        {arrow(-1)}
        <button
          ref={label}
          className="cal-label"
          aria-label={`${name} ${nav.year}, pick a month`}
          aria-haspopup="dialog"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
        >
          {desktop ? name : name.slice(0, 3)} {nav.year}
        </button>
        {arrow(1)}
        {picking && (
          <MonthPicker
            nav={nav}
            onPick={go}
            onClose={(refocus) => { setPicking(false); if (refocus) label.current?.focus(); }}
          />
        )}
      </div>
    </div>
  );
}

/** every month in range at a glance: pick a year, then a month */
function MonthPicker({ nav, onPick, onClose }: { nav: Nav; onPick: (i: number) => void; onClose: (refocus: boolean) => void }) {
  const [year, setYear] = useState(nav.year);
  const box = useRef<HTMLDivElement>(null);
  // a click anywhere but the picker (or the label, which toggles it) only closes it: it doesn't also add a plan, change month, etc.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const swallow = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest?.('.cal-picker, .cal-label')) return;
      document.addEventListener('click', swallow, { capture: true, once: true });
      // shortcut: a press that never becomes a click (a scroll) leaves the swallow armed for 400ms
      window.setTimeout(() => document.removeEventListener('click', swallow, true), 400);
      closeRef.current(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);
  useEffect(() => { box.current?.querySelector<HTMLElement>('.mp-month.current')?.focus({ preventScroll: true }); }, []);
  const first = Math.floor(nav.min / 12);
  const years = Array.from({ length: Math.floor(nav.max / 12) - first + 1 }, (_, i) => first + i);
  return (
    <div
      ref={box}
      className="cal-picker"
      role="dialog"
      aria-label="pick a month"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(true); } }}
    >
      <div className="mp-grid">
        {years.map((y) => (
          <button key={y} className={`mp-year${y === year ? ' current' : ''}`} aria-pressed={y === year} onClick={() => setYear(y)}>
            {y === year ? `[${y}]` : y}
          </button>
        ))}
      </div>
      <div className="mp-grid mp-months">
        {MONTHS.map((m, i) => {
          const idx = year * 12 + i;
          const shown = idx === nav.idx;
          return (
            <button
              key={m}
              className={`mp-month${shown ? ' current' : ''}${idx === nav.now ? ' now' : ''}`}
              aria-label={`${m} ${year}`}
              aria-current={shown ? 'date' : undefined}
              onClick={() => onPick(idx)}
            >
              {shown ? `[${m.slice(0, 3)}]` : m.slice(0, 3)}
            </button>
          );
        })}
      </div>
      <button className="mp-today" onClick={() => onPick(nav.now)}>today</button>
    </div>
  );
}

/* ---------- add / edit form, shared by the desktop popover and the mobile inline form ---------- */

const parseClock = (v: string) => {
  const m = /^(\d{2}):(\d{2})/.exec(v);
  return m ? +m[1] * 60 + +m[2] : null;
};

function PlanForm({ date, plan, onClose, mobile }: { date: Ymd; plan?: Plan; onClose: () => void; mobile?: boolean }) {
  const { update } = useStore();
  const [name, setName] = useState(plan?.name ?? '');
  const [start, setStart] = useState(toTimeInput(plan?.time ?? null));
  const [end, setEnd] = useState(toTimeInput(plan?.endTime ?? null));
  const [note, setNote] = useState(plan?.note ?? '');
  const [confirming, setConfirming] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [timeError, setTimeError] = useState(false);

  useEffect(() => {
    const el = nameRef.current;
    if (el) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }
    const r = box.current?.getBoundingClientRect();
    if (mobile && r && (r.bottom > window.innerHeight || r.top < 0)) {
      window.scrollTo({ top: window.scrollY + r.top - 96, behavior: 'smooth' });
    }
  }, [mobile]);

  const save = () => {
    const n = name.trim();
    const half = halfTypedTime(box.current);
    setTimeError(half);
    if (!n || half) return;
    const time = parseClock(start);
    const e = time == null ? null : parseClock(end);
    const fields = { name: n, time, endTime: e != null && e > time! ? e : null, note: note.trim() ? note : '' };
    update((d) => {
      if (!plan) d.plans.push({ id: uid(), ...date, ...fields, createdAt: Date.now() });
      else Object.assign(d.plans.find((p) => p.id === plan.id) ?? {}, fields);
    });
    onClose();
  };

  const remove = () => {
    update((d) => { d.plans = d.plans.filter((p) => p.id !== plan?.id); });
    onClose();
  };

  return (
    <div
      className="plan-form"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
        if (e.key !== 'Enter') return;
        const tag = (e.target as Element).tagName;
        if (tag === 'INPUT' || (tag === 'TEXTAREA' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); save(); }
      }}
    >
      <input ref={nameRef} className="plan-name" placeholder="name" aria-label="plan name" value={name} onChange={(e) => setName(e.target.value)} {...noAuto} />
      <div className="plan-times">
        <input type="time" className="plan-time" aria-label="start time" value={start} onChange={(e) => { setStart(e.target.value); setTimeError(false); }} />
        <span className="plan-dash" aria-hidden="true">–</span>
        <input type="time" className="plan-time" aria-label="end time" value={end} disabled={!start} onChange={(e) => { setEnd(e.target.value); setTimeError(false); }} />
      </div>
      {timeError && <div className="msg error" role="alert">finish the time (am / pm)</div>}
      <textarea className="plan-note" placeholder="note" aria-label="note" value={note} onChange={(e) => setNote(e.target.value)} {...noAuto} />
      {plan && confirming ? (
        <div className="edit-confirm">
          <InlineConfirm name={plan.name} returnFocus=".plan-form .edit-delete" onYes={remove} onNo={() => setConfirming(false)} />
        </div>
      ) : plan ? (
        <div className="edit-buttons">
          <button className="edit-cancel" onClick={onClose}>cancel</button>
          <button className="edit-save" onClick={save}>save</button>
          <span className="edit-spacer" />
          <button className="edit-delete" onClick={() => setConfirming(true)}>delete</button>
        </div>
      ) : (
        <div className="edit-buttons">
          <button className="edit-save" onClick={save}>add</button>
          <button className="edit-cancel" onClick={onClose}>cancel</button>
        </div>
      )}
    </div>
  );
}

/* ---------- desktop §7 ---------- */

type Open = { kind: 'add' | 'day'; date: Ymd } | { kind: 'edit'; id: string; date: Ymd } | null;

function Popover({ col, onClose, children }: { col: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().bottom > window.innerHeight) setUp(true);
    // take focus (so Esc works) unless a field inside already has it
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      className={`cal-pop ${col < 4 ? 'right' : 'left'}${up ? ' up' : ''}`}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      {children}
    </div>
  );
}

function DesktopCalendar() {
  const { state } = useStore();
  const today = useToday();
  const nav = useMonth(today);
  const itemsOn = useDayItems();
  const jump = useJump();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  useOutside(open != null, '.cal-pop', close);

  const navTo = (i: number) => { setOpen(null); nav.go(i); };
  const navRef = useRef(navTo);
  navRef.current = navTo;
  const idxRef = useRef(nav.idx);
  idxRef.current = nav.idx;

  // ← / → change the month when nothing is being typed in
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if ((document.activeElement as Element | null)?.closest?.('input, textarea, [role="menu"], .cal-pop, .cal-picker')) return;
      e.preventDefault();
      navRef.current(idxRef.current + (e.key === 'ArrowLeft' ? -1 : 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // day boxes shrink (112px down to 80px) so all six weeks fit the window with no scrolling; below that the page scrolls
  const grid = useRef<HTMLDivElement>(null);
  const [cellH, setCellH] = useState(112);
  useLayoutEffect(() => {
    const fit = () => {
      const g = grid.current;
      if (!g) return;
      const rowsTop = g.getBoundingClientRect().top + window.scrollY + (g.querySelector<HTMLElement>('.cal-wd')?.offsetHeight ?? 0);
      setCellH(Math.max(80, Math.min(112, Math.floor((window.innerHeight - Math.ceil(rowsTop) - 16 - 1) / 6)))); // 16 = .d.cal bottom padding
    };
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const cells = monthGrid(nav.year, nav.month);
  const openKey = open && keyOf(open.date);

  const popContent = (d: Ymd, { plans, asg }: DayItems) => {
    if (!open) return null;
    if (open.kind === 'add') return <PlanForm date={d} onClose={close} />;
    if (open.kind === 'edit') {
      const p = state.plans.find((x) => x.id === open.id);
      return p ? <PlanForm key={p.id} date={d} plan={p} onClose={close} /> : null;
    }
    return (
      <>
        <div className="cal-pop-list">
          {plans.map((p) => (
            <button key={p.id} className="cal-pop-plan" onClick={() => setOpen({ kind: 'edit', id: p.id, date: d })}>
              {p.time != null && <span className="cal-plan-time">{formatRange(p.time, p.endTime)}</span>}
              <span className="cal-plan-name">{p.name}</span>
            </button>
          ))}
          {asg.map((x) => (
            <button key={x.a.id} className="cal-pop-asg" onClick={() => jump(x)}>
              <span className={`chip st-${chipClass(x.a.status)}`}>{x.a.name}</span>
              <span className="cal-pop-class">{x.courseName}</span>
            </button>
          ))}
        </div>
        <button className="add-btn" onClick={() => setOpen({ kind: 'add', date: d })}>+ add</button>
      </>
    );
  };

  return (
    <div className="d frame-d cal">
      <header className="d-head">
        <div className="d-head-left"><TitleRow view="calendar" /></div>
        <div className="d-head-right"><ProfileMenu /></div>
      </header>
      <Controls nav={nav} desktop onNav={navTo} />
      <div className="cal-grid" ref={grid}>
        {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {cells.map((d, i) => {
          const k = keyOf(d);
          const out = d.month !== nav.month;
          const isToday = same(d, today);
          const items = itemsOn(d);
          const total = items.plans.length + items.asg.length;
          const shown = [
            ...items.plans.map((p) => (
              <button key={p.id} className={`cal-plan${open?.kind === 'edit' && open.id === p.id ? ' editing' : ''}`} onClick={() => setOpen({ kind: 'edit', id: p.id, date: d })}>
                {p.time != null && <span className="cal-plan-time">{formatRange(p.time, null)}</span>}
                <span className="cal-plan-name">{p.name}</span>
              </button>
            )),
            ...items.asg.map((x) => (
              <button key={x.a.id} className={`cal-asg st-${chipClass(x.a.status)}`} onClick={() => jump(x)}>{x.a.name}</button>
            )),
          ];
          const limit = 2; // at most 2 items per day, then "+N more"
          // a neighboring month's day: go to that month, then add there
          const add = () => {
            if (out) nav.go(idxOf(d));
            setOpen({ kind: 'add', date: d });
          };
          return (
            <div
              key={k}
              className={`cal-cell${out ? ' out' : ''}${openKey === k && open?.kind !== 'edit' ? ' open' : ''}`}
              style={{ height: cellH }}
              data-compact={cellH < 100 || undefined}
              onClick={(e) => { if (!(e.target as Element).closest('button, .cal-pop')) add(); }}
            >
              <span className={`cal-num${isToday ? ' today' : ''}`}>{isToday ? `[${d.day}]` : d.day}</span>
              <button className="cal-plus" aria-label={`add a plan on ${dayLabel(d)}`} onClick={add}>+</button>
              {shown.slice(0, total > limit ? limit : total)}
              {total > limit && (
                <button className="cal-more" onClick={() => setOpen({ kind: 'day', date: d })}>+{total - limit} more</button>
              )}
              {openKey === k && (
                <Popover key={`${nav.idx}:${open!.kind}:${'id' in open! ? open.id : ''}`} col={i % 7} onClose={close}>
                  <div className="cal-pop-date">{dayLabel(d)}</div>
                  {popContent(d, items)}
                </Popover>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- mobile §8 ---------- */

type MForm = { kind: 'add' } | { kind: 'edit'; id: string } | null;

function MobileCalendar() {
  const today = useToday();
  const nav = useMonth(today);
  const itemsOn = useDayItems();
  const jump = useJump();
  const [picked, setPicked] = useState<Ymd | null>(null);
  const [form, setForm] = useState<MForm>(null);
  useOutside(form != null, '.plan-form', () => setForm(null));

  const inMonth = (d: Ymd) => d.year === nav.year && d.month === nav.month;
  // selection: what you tapped, else today in this month, else the 1st
  const sel = picked && inMonth(picked) ? picked : inMonth(today) ? today : { year: nav.year, month: nav.month, day: 1 };
  const navTo = (i: number) => { setForm(null); setPicked(null); nav.go(i); };
  const select = (d: Ymd) => {
    setForm(null);
    setPicked(d);
    if (!inMonth(d)) nav.go(idxOf(d));
  };

  /* swipe the month: same thresholds as the class swipe */
  const swipe = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const swallow = useRef(false);
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy)) return;
    const v = dx / Math.max(1, e.timeStamp - s.t);
    if (Math.abs(dx) > 50 || Math.abs(v) > 0.4) {
      swallow.current = true;
      window.setTimeout(() => { swallow.current = false; }, 50);
      navTo(nav.idx + (dx < 0 ? 1 : -1));
    }
  };

  const { plans, asg } = itemsOn(sel);
  const count = plans.length + asg.length;

  return (
    <div className="m frame-m cal">
      <div className="m-namerow">
        <TitleRow view="calendar" />
        <ProfileMenu />
      </div>
      <Controls nav={nav} desktop={false} onNav={navTo} />
      <div
        className="mc-grid"
        onPointerDown={(e) => { swipe.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId }; }}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipe.current = null; }}
        onClickCapture={(e) => { if (swallow.current) { e.preventDefault(); e.stopPropagation(); } }}
      >
        {['m', 't', 'w', 't', 'f', 's', 's'].map((w, i) => <span key={i} className="mc-wd" aria-hidden="true">{w}</span>)}
        {monthGrid(nav.year, nav.month).map((d) => {
          const it = itemsOn(d);
          const isSel = same(d, sel);
          return (
            <button
              key={keyOf(d)}
              className={`mc-cell${inMonth(d) ? '' : ' out'}${isSel ? ' sel' : ''}`}
              aria-label={dayLabel(d)}
              aria-pressed={isSel}
              onClick={() => select(d)}
            >
              <span className={`mc-num${same(d, today) ? ' today' : ''}`}>{d.day}</span>
              <span className="mc-dots">
                {it.plans.length > 0 && <span className="mc-dot" />}
                {it.asg.slice(0, 2).map((x) => <span key={x.a.id} className={`mc-dot st-${chipClass(x.a.status)}`} />)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-day-head">
        <span className="cal-day-mark">##</span>
        <span className="cal-day-title">{dayLabel(sel)}</span>
        <span className="cal-day-count">{count}</span>
      </div>
      {count === 0 && form?.kind !== 'add' && <div className="cal-empty">nothing planned</div>}
      {plans.map((p) =>
        form?.kind === 'edit' && form.id === p.id
          ? <PlanForm key={p.id} date={sel} plan={p} mobile onClose={() => setForm(null)} />
          : <PlanRow key={p.id} p={p} onOpen={() => setForm({ kind: 'edit', id: p.id })} />,
      )}
      {asg.map((x) => (
        <div key={x.a.id} className="row" onClick={(e) => { if (!(e.target as Element).closest('.status')) jump(x); }}>
          <div className="row-left">
            <span className="row-name">{x.a.name}</span>
            <span className="row-date">{x.courseName}</span>
          </div>
          <div className="row-right"><StatusPicker a={x.a} courseId={x.courseId} /></div>
        </div>
      ))}
      {form?.kind === 'add'
        ? <PlanForm date={sel} mobile onClose={() => setForm(null)} />
        : <button className="cal-add" onClick={() => setForm({ kind: 'add' })}>+ add</button>}
    </div>
  );
}

function PlanRow({ p, onOpen }: { p: Plan; onOpen: () => void }) {
  const longPress = useLongPress(onOpen);
  return (
    <div className="row plan-row" {...longPress} onClick={onOpen}>
      <div className="row-left">
        <span className="plan-line">
          {p.time != null && <span className="plan-row-time">{formatRange(p.time, p.endTime)}</span>}
          <span className="row-name">{p.name}</span>
        </span>
        {p.note && <span className="plan-row-note">{p.note}</span>}
      </div>
    </div>
  );
}

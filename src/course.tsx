import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { noAuto } from './components';
import {
  activeOf, chipClass, convertStatus, finishedOf, formatDate, formatTime, isDueSoon, isExam, isFinished,
  parseDateInput, parseTimeInput, statusOptions, toDateInput, toTimeInput, uid,
  type AppState, type Assignment, type Course, type Status,
} from './model';

/* ---------- list-wide UI state: one add/edit form, one action strip ---------- */

export interface FormTarget { courseId: string; editId: string | null; }
interface ListUI {
  form: FormTarget | null;
  setForm: (f: FormTarget | null) => void;
  actionFor: string | null;
  setActionFor: (id: string | null) => void;
  statusFor: string | null;
  setStatusFor: (id: string | null) => void;
  /** which delete confirm is open, e.g. "quarter:<id>", "tab:<id>", "title:<id>", "class:<id>" */
  confirm: string | null;
  setConfirm: (key: string | null) => void;
  finishedOpen: Set<string>;
  toggleFinished: (courseId: string) => void;
}
const ListUICtx = createContext<ListUI | null>(null);
export const useListUI = () => useContext(ListUICtx)!;

export function ListUIProvider({ children }: { children: React.ReactNode }) {
  const [form, setFormState] = useState<FormTarget | null>(null);
  const [actionFor, setActionForState] = useState<string | null>(null);
  const [statusFor, setStatusForState] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const setActionFor = (id: string | null) => { setActionForState(id); setStatusForState(null); };
  const setStatusFor = (id: string | null) => { setStatusForState(id); setActionForState(null); };
  const [finishedOpen, setFinishedOpen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!actionFor) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.actions')) setActionFor(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActionFor(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionFor]);

  useEffect(() => {
    if (!statusFor) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.status')) setStatusForState(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [statusFor]);

  const ui: ListUI = {
    form,
    setForm: (f) => { setFormState(f); setActionFor(null); },
    actionFor,
    setActionFor,
    statusFor,
    setStatusFor,
    confirm,
    setConfirm,
    finishedOpen,
    toggleFinished: (id) =>
      setFinishedOpen((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
      }),
  };
  return <ListUICtx.Provider value={ui}>{children}</ListUICtx.Provider>;
}

/* ---------- state helpers ---------- */

export function findCourse(d: AppState, courseId: string): Course | undefined {
  for (const q of d.quarters) {
    const c = q.courses.find((c) => c.id === courseId);
    if (c) return c;
  }
}

/* ---------- add / edit form ---------- */

let lastDate: string | null = null; // remembered for this session

function tomorrowInput() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return toDateInput(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

interface FormValues { name: string; year: number; month: number; day: number; time: number | null; exam: boolean; }

function AddForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: Assignment;
  submitLabel: string;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [date, setDate] = useState(
    initial ? toDateInput(initial.year, initial.month, initial.day) : lastDate ?? tomorrowInput(),
  );
  const [time, setTime] = useState(initial ? toTimeInput(initial.time) : '');
  const [exam, setExam] = useState(initial ? isExam(initial.status) : false);

  const submit = () => {
    const n = name.trim();
    const d = parseDateInput(date);
    if (!n || !d) return;
    lastDate = date;
    onSubmit({ name: n, ...d, time: parseTimeInput(time), exam });
  };

  return (
    <div
      className="addform"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        else if (e.key === 'Enter' && (e.target as Element).tagName === 'INPUT') { e.preventDefault(); submit(); }
      }}
    >
      <input
        className="addform-name"
        placeholder="name"
        aria-label="assignment name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        {...noAuto}
      />
      <div className="addform-when">
        <input type="date" className="addform-date" aria-label="due date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" className="addform-time" aria-label="due time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="addform-buttons">
        <button className="addform-submit" onClick={submit}>{submitLabel}</button>
        <button className="addform-cancel" onClick={onCancel}>cancel</button>
        <button
          type="button"
          className={`chip ${exam ? 'st-exam' : 'st-planned'} kind-toggle`}
          aria-pressed={exam}
          aria-label={exam ? 'type: exam, tap to make it an assignment' : 'type: assignment, tap to make it an exam'}
          onClick={() => setExam((e) => !e)}
        >
          {exam ? 'exam' : 'assignment'}
        </button>
      </div>
    </div>
  );
}

/* ---------- rows ---------- */

function useRowActions(id: string) {
  const ui = useListUI();
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => cancel, []);
  return {
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); ui.setActionFor(id); },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => { timer.current = null; ui.setActionFor(id); }, 500);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}

function ActionStrip({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="actions">
      <button className="action-edit" onClick={onEdit}>edit</button>
      <button className="action-delete" onClick={onDelete}>delete</button>
    </div>
  );
}

function StatusPicker({ a, courseId, small }: { a: Assignment; courseId: string; small?: boolean }) {
  const { update } = useStore();
  const ui = useListUI();
  const open = ui.statusFor === a.id;
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  const options = statusOptions(a.status);

  // flip upward if there isn't room below (viewport on desktop, panel on mobile); focus the current row
  useLayoutEffect(() => {
    if (!open) { setUp(false); return; }
    const m = menu.current;
    const w = wrap.current;
    if (!m || !w) return;
    const panel = w.closest('.panel');
    const bottom = panel ? panel.getBoundingClientRect().bottom : window.innerHeight;
    const top = panel ? panel.getBoundingClientRect().top : 0;
    const r = m.getBoundingClientRect();
    const chip = w.getBoundingClientRect();
    if (r.bottom > bottom && chip.top - r.height - 6 >= top) setUp(true);
    m.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, [open]);

  // scrolling anything closes the menu
  useEffect(() => {
    if (!open) return;
    const close = () => ui.setStatusFor(null);
    document.addEventListener('scroll', close, true);
    return () => document.removeEventListener('scroll', close, true);
  }, [open, ui]);

  const close = (refocus: boolean) => {
    ui.setStatusFor(null);
    if (refocus) trigger.current?.focus();
  };

  const choose = (s: Status) => {
    if (s === a.status) { close(true); return; }
    ui.setStatusFor(null);
    update((d) => {
      const x = findCourse(d, courseId)?.assignments.find((x) => x.id === a.id);
      if (x) x.status = s;
    });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'ArrowDown' ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0);
    items[n]?.focus({ preventScroll: true });
  };

  return (
    <div className="status" ref={wrap}>
      <button
        ref={trigger}
        className={`chip st-${chipClass(a.status)}${small ? ' chip-sm' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`status: ${a.status}`}
        onClick={() => ui.setStatusFor(open ? null : a.id)}
      >
        {a.status}
      </button>
      {open && (
        <div className={`status-menu${up ? ' up' : ''}`} role="menu" ref={menu} onKeyDown={onKey}>
          {options.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={s === a.status}
              className="status-option"
              onClick={() => choose(s)}
            >
              <span className={`status-square st-${chipClass(s)}`} aria-hidden="true" />
              <span className="status-label">{s}</span>
              {s === a.status && <span className="status-current" aria-hidden="true">←</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentRow({ a, courseId, finished }: { a: Assignment; courseId: string; finished?: boolean }) {
  const { update } = useStore();
  const ui = useListUI();
  const handlers = useRowActions(a.id);

  const remove = () => {
    ui.setActionFor(null);
    update((d) => {
      const c = findCourse(d, courseId);
      if (c) c.assignments = c.assignments.filter((x) => x.id !== a.id);
    });
  };
  const right = ui.actionFor === a.id
    ? <ActionStrip onEdit={() => ui.setForm({ courseId, editId: a.id })} onDelete={remove} />
    : <StatusPicker a={a} courseId={courseId} small={finished} />;

  if (finished) {
    return (
      <div className="frow" {...handlers}>
        <div className="frow-left">
          <span className="frow-date">{formatDate(a)}</span>
          <span className="frow-name">{a.name}</span>
        </div>
        {right}
      </div>
    );
  }
  return (
    <div className="row" {...handlers}>
      <div className="row-left">
        <span className="row-name">{a.name}</span>
        <span className={`row-date${isDueSoon(a) ? ' soon' : ''}`}>
          {formatDate(a)}
          {a.time != null && <span className="row-time">{formatTime(a.time)}</span>}
        </span>
      </div>
      {right}
    </div>
  );
}

/* ---------- course body (shared by desktop column and mobile panel) ---------- */

export function CourseBody({ course }: { course: Course }) {
  const { update } = useStore();
  const ui = useListUI();
  const active = activeOf(course);
  const finished = finishedOf(course);
  const form = ui.form?.courseId === course.id ? ui.form : null;
  const finishedOpen = ui.finishedOpen.has(course.id);

  const editForm = (a: Assignment) => (
    <AddForm
      key={a.id}
      initial={a}
      submitLabel="save"
      onCancel={() => ui.setForm(null)}
      onSubmit={(v) => {
        update((d) => {
          const x = findCourse(d, course.id)?.assignments.find((x) => x.id === a.id);
          if (!x) return;
          const { exam, ...rest } = v;
          Object.assign(x, rest);
          x.status = convertStatus(x.status, exam);
        });
        ui.setForm(null);
      }}
    />
  );
  const renderRow = (a: Assignment, isDone?: boolean) =>
    form?.editId === a.id ? editForm(a) : <AssignmentRow key={a.id} a={a} courseId={course.id} finished={isDone} />;

  const addNew = (v: FormValues) => {
    const { exam, ...rest } = v;
    const item: Assignment = { id: uid(), status: exam ? 'EXAM!!' : 'planned', createdAt: Date.now(), ...rest };
    update((d) => { findCourse(d, course.id)?.assignments.push(item); });
    ui.setForm(null);
  };

  return (
    <>
      {active.length === 0 ? <div className="empty">nothing due</div> : active.map((a) => renderRow(a))}
      {form && form.editId === null ? (
        <AddForm submitLabel="add" onSubmit={addNew} onCancel={() => ui.setForm(null)} />
      ) : (
        <button className="add-btn" onClick={() => ui.setForm({ courseId: course.id, editId: null })}>+ add</button>
      )}
      {finished.length > 0 && (
        <>
          <button className="finished-toggle" aria-expanded={finishedOpen} onClick={() => ui.toggleFinished(course.id)}>
            {finishedOpen ? '▾' : '▸'} finished ({finished.length})
          </button>
          {finishedOpen && finished.map((a) => renderRow(a, true))}
        </>
      )}
    </>
  );
}

export const activeCount = (c: Course) => c.assignments.filter((a) => !isFinished(a.status)).length;

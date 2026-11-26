import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { InlineConfirm, halfTypedTime, noAuto, useLongPress } from './components';
import {
  activeOf, chipClass, finishedOf, formatDate, formatTime, isDueSoon, isExam, isFinished,
  parseDateInput, parseTimeInput, statusOptions, toDateInput, toTimeInput, uid,
  type AppState, type Assignment, type Course, type Status,
} from './model';

/* ---------- list-wide UI state: one add/edit form, one status menu, one delete confirm ---------- */

export interface FormTarget { courseId: string; editId: string | null; }
interface ListUI {
  form: FormTarget | null;
  setForm: (f: FormTarget | null) => void;
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

export function ListUIProvider({ children, initialFinished }: { children: React.ReactNode; initialFinished?: string }) {
  const [form, setFormState] = useState<FormTarget | null>(null);
  const [statusFor, setStatusFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [finishedOpen, setFinishedOpen] = useState<Set<string>>(() => new Set(initialFinished ? [initialFinished] : []));

  // clicking or tapping outside an open add/edit form discards it
  useEffect(() => {
    if (!form) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.addform')) setFormState(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [form]);

  useEffect(() => {
    if (!statusFor) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.status')) setStatusFor(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [statusFor]);

  const ui: ListUI = {
    form,
    setForm: setFormState,
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

function AddForm({ initial, onSubmit, onCancel, onDelete }: {
  initial?: Assignment;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [date, setDate] = useState(
    initial ? toDateInput(initial.year, initial.month, initial.day) : lastDate ?? tomorrowInput(),
  );
  const [time, setTime] = useState(initial ? toTimeInput(initial.time) : '');
  const [exam, setExam] = useState(initial ? isExam(initial.status) : false);
  const [confirming, setConfirming] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [timeError, setTimeError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const submit = () => {
    const n = name.trim();
    const d = parseDateInput(date);
    const half = halfTypedTime(box.current);
    if (!d) setDateError(true);
    setTimeError(half);
    if (!n || !d || half) return;
    lastDate = date;
    onSubmit({ name: n, ...d, time: parseTimeInput(time), exam });
  };

  const types: [string, boolean][] = [['assignment', false], ['exam', true]];

  return (
    <div
      className="addform"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        else if (e.key === 'Enter' && (e.target as Element).tagName === 'INPUT') { e.preventDefault(); submit(); }
      }}
    >
      <input
        ref={nameRef}
        className="addform-name"
        placeholder="name"
        aria-label="assignment name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        {...noAuto}
      />
      <div className="addform-when">
        <input type="date" className="addform-date" aria-label="due date" value={date} onChange={(e) => { setDate(e.target.value); setDateError(false); }} />
        <input type="time" className="addform-time" aria-label="due time" value={time} onChange={(e) => { setTime(e.target.value); setTimeError(false); }} />
      </div>
      {dateError && <div className="msg error" role="alert">pick a date</div>}
      {timeError && <div className="msg error" role="alert">finish the time (am / pm)</div>}
      <div className="type-switch" role="radiogroup" aria-label="type">
        {types.map(([label, isEx]) => (
          <button
            key={label}
            type="button"
            className={isEx === exam ? 'type-current' : 'type-other'}
            role="radio"
            aria-checked={isEx === exam}
            onClick={() => setExam(isEx)}
          >
            {isEx === exam ? `[${label}]` : label}
          </button>
        ))}
      </div>
      {!initial ? (
        <div className="addform-buttons">
          <button className="addform-submit" onClick={submit}>add</button>
          <button className="addform-cancel" onClick={onCancel}>cancel</button>
        </div>
      ) : confirming ? (
        <div className="edit-confirm">
          <InlineConfirm
            name={initial.name}
            returnFocus=".addform .edit-delete"
            onYes={() => onDelete?.()}
            onNo={() => setConfirming(false)}
          />
        </div>
      ) : (
        <div className="edit-buttons">
          <button className="edit-cancel" onClick={onCancel}>cancel</button>
          <button className="edit-save" onClick={submit}>save</button>
          <span className="edit-spacer" />
          <button className="edit-delete" onClick={() => setConfirming(true)}>delete</button>
        </div>
      )}
    </div>
  );
}

/* ---------- rows ---------- */

export function StatusPicker({ a, courseId, small }: { a: Assignment; courseId: string; small?: boolean }) {
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
  const ui = useListUI();
  const openEdit = () => ui.setForm({ courseId, editId: a.id });
  const longPress = useLongPress(openEdit);
  const handlers = {
    ...longPress,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); openEdit(); },
    onClick: (e: React.MouseEvent) => { if (!(e.target as Element).closest('.status')) openEdit(); },
  };
  const edit = <button className="row-edit" onClick={openEdit} aria-label={`edit ${a.name}`}>edit</button>;

  if (finished) {
    return (
      <div className="frow" data-aid={a.id} {...handlers}>
        <div className="frow-left">
          <span className="frow-date">{formatDate(a)}</span>
          <span className="frow-name">{a.name}</span>
        </div>
        <div className="row-right">
          {edit}
          <StatusPicker a={a} courseId={courseId} small />
        </div>
      </div>
    );
  }
  return (
    <div className="row" data-aid={a.id} {...handlers}>
      <div className="row-left">
        <span className="row-name">{a.name}</span>
        <span className={`row-date${isDueSoon(a) ? ' soon' : ''}`}>
          {formatDate(a)}
          {a.time != null && <span className="row-time">{formatTime(a.time)}</span>}
          {edit}
        </span>
      </div>
      <div className="row-right">
        <StatusPicker a={a} courseId={courseId} />
      </div>
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
      onCancel={() => ui.setForm(null)}
      onSubmit={(v) => {
        update((d) => {
          const x = findCourse(d, course.id)?.assignments.find((x) => x.id === a.id);
          if (!x) return;
          const { exam, ...rest } = v;
          Object.assign(x, rest);
          if (exam !== isExam(x.status)) x.status = exam ? 'EXAM!!' : 'planned';
        });
        ui.setForm(null);
      }}
      onDelete={() => {
        ui.setForm(null);
        update((d) => {
          const c = findCourse(d, course.id);
          if (c) c.assignments = c.assignments.filter((x) => x.id !== a.id);
        });
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
        <AddForm onSubmit={addNew} onCancel={() => ui.setForm(null)} />
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

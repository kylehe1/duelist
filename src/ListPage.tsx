import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { useIsDesktop } from './useIsDesktop';
import { InlineConfirm, NameInput, ProfileMenu, TitleRow, noAuto, revealIn, useLongPress } from './components';
import { CourseBody, ListUIProvider, activeCount, useListUI } from './course';
import type { Course } from './model';
import { activeOf, compareAssignments, currentQuarter, isFinished, randomPhrase, uid, type Assignment, type Quarter } from './model';

/* ---------- shared header pieces ---------- */

function useQuarterActions(q: Quarter) {
  const { update, focusKey } = useStore();
  return {
    rename: (name: string) => update((d) => { const x = d.quarters.find((x) => x.id === q.id); if (x) x.name = name; }),
    setPhrase: (phrase: string) => update((d) => { const x = d.quarters.find((x) => x.id === q.id); if (x) x.phrase = phrase; }),
    addClass: () => {
      const id = uid();
      focusKey.current = `class:${id}`;
      update((d) => { d.quarters.find((x) => x.id === q.id)?.courses.push({ id, name: 'new class', assignments: [] }); });
      return id;
    },
    renameClass: (courseId: string, name: string) => update((d) => {
      const c = d.quarters.find((x) => x.id === q.id)?.courses.find((c) => c.id === courseId);
      if (c) c.name = name;
    }),
    removeClass: (courseId: string) => update((d) => {
      const x = d.quarters.find((x) => x.id === q.id);
      if (x) x.courses = x.courses.filter((c) => c.id !== courseId);
    }),
  };
}

function useQuarterRemover() {
  const { update } = useStore();
  return (id: string) => update((d) => {
    const i = d.quarters.findIndex((x) => x.id === id);
    if (i < 0) return;
    d.quarters.splice(i, 1);
    if (d.currentQuarterId === id || !d.quarters.some((x) => x.id === d.currentQuarterId)) {
      d.currentQuarterId = d.quarters[Math.max(0, i - 1)]?.id ?? null;
    }
  });
}

function QuarterSwitcher({ className, desktop }: { className: string; desktop: boolean }) {
  const { state, update, focusKey } = useStore();
  const cur = currentQuarter(state)!;
  const addQuarter = () => {
    const id = uid();
    focusKey.current = `quarter:${id}`;
    update((d) => {
      d.quarters.push({ id, name: 'new term', phrase: randomPhrase(), courses: [] });
      d.currentQuarterId = id;
    });
  };
  // keep the current term in view when the terms scroll sideways
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const item = Array.from(box.current?.children ?? []).find((ch) => ch.querySelector('.qs-current'));
    const after = item?.nextElementSibling;
    // the newest term sits right before +new: show both
    revealIn(box.current, (after?.classList.contains('qs-new') ? after : item) as HTMLElement | null);
  }, [cur.id]);
  return (
    <div className={className} ref={box}>
      {state.quarters.map((q) => (
        <QuarterItem key={q.id} q={q} current={q.id === cur.id} desktop={desktop} />
      ))}
      <button className="qs-new" onClick={addQuarter}>+new</button>
    </div>
  );
}

function QuarterItem({ q, current, desktop }: { q: Quarter; current: boolean; desktop: boolean }) {
  const { update } = useStore();
  const ui = useListUI();
  const removeQuarter = useQuarterRemover();
  const { rename } = useQuarterActions(q);
  const key = `quarter:${q.id}`;
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const longPress = useLongPress(() => ui.setConfirm(key));

  if (ui.confirm === key) {
    const n = q.courses.length;
    const m = q.courses.reduce((t, c) => t + c.assignments.length, 0);
    const what = n === 0 ? '' : ` (${n} class${n === 1 ? '' : 'es'}, ${m} assignment${m === 1 ? '' : 's'})`;
    return (
      <InlineConfirm
        name={q.name + what}
        size={desktop ? 13 : 12}
        returnFocus={`[data-del="${key}"]`}
        onYes={() => { ui.setConfirm(null); removeQuarter(q.id); }}
        onNo={() => ui.setConfirm(null)}
      />
    );
  }

  const bracketed = (
    <span className="qs-current">
      [<NameInput
        className="qs-input"
        value={q.name}
        size={Math.max(q.name.length, 3)}
        onChange={rename}
        focusKey={key}
        ariaLabel="term name"
      />]
    </span>
  );

  if (!desktop) {
    return (
      <span className="qs-item" {...longPress}>
        {current ? bracketed : (
          <button className="qs-other" onClick={() => update((d) => { d.currentQuarterId = q.id; })}>{q.name}</button>
        )}
      </span>
    );
  }
  if (!current) {
    return <button className="qs-other" onClick={() => update((d) => { d.currentQuarterId = q.id; })}>{q.name}</button>;
  }
  const shown = hover || focusIn;
  return (
    <span
      className="qs-cur-wrap"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={(e) => setFocusIn(e.target.matches(':focus-visible') || e.target.tagName === 'INPUT')}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusIn(false); }}
    >
      {bracketed}
      <button
        className={`qs-del${shown ? ' shown' : ''}`}
        data-del={key}
        tabIndex={shown ? 0 : -1}
        aria-label={`delete term ${q.name}`}
        onClick={() => ui.setConfirm(key)}
      >
        ×
      </button>
    </span>
  );
}

function PhraseRow({ q }: { q: Quarter }) {
  const { setPhrase } = useQuarterActions(q);
  return (
    <div className="phrase-row">
      <span className="phrase-mark">#</span>
      <input className="phrase-input" aria-label="phrase" value={q.phrase} onChange={(e) => setPhrase(e.target.value)} {...noAuto} />
    </div>
  );
}

/* ---------- page ---------- */

export function ListPage() {
  const { state } = useStore();
  const isDesktop = useIsDesktop();
  const q = currentQuarter(state)!;
  const flash = useFlash(q);
  return (
    <ListUIProvider initialFinished={flash?.finished ? flash.courseId : undefined}>
      {isDesktop ? <DesktopList q={q} /> : <MobileList key={q.id} q={q} startCourse={flash?.courseId} />}
    </ListUIProvider>
  );
}

/* arriving from the calendar with { flash: assignmentId }: open its class (and finished list), scroll to it, flash it */
function useFlash(q: Quarter) {
  const loc = useLocation();
  const navigate = useNavigate();
  const id = (loc.state as { flash?: string } | null)?.flash ?? null;
  const [target] = useState(() => {
    for (const c of q.courses) {
      const a = c.assignments.find((x) => x.id === id);
      if (a) return { courseId: c.id, finished: isFinished(a.status), id: a.id };
    }
    return null;
  });
  useEffect(() => {
    if (!id) return;
    navigate('.', { replace: true, state: null }); // a reload shouldn't flash again
    const el = target && document.querySelector<HTMLElement>(`[data-aid="${target.id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panel = el.closest<HTMLElement>('.panel');
    if (panel) {
      const p = panel.getBoundingClientRect();
      if (r.bottom > p.bottom || r.top < p.top) panel.scrollTop += r.top - p.top - p.height / 3;
    } else if (r.bottom > window.innerHeight || r.top < 0) {
      window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 3 });
    }
    el.classList.add('flash');
    const t = window.setTimeout(() => el.classList.remove('flash'), 1200);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return target;
}

/* ---------- desktop §5 ---------- */

function DesktopList({ q }: { q: Quarter }) {
  const actions = useQuarterActions(q);
  return (
    <div className="d frame-d">
      <header className="d-head">
        <div className="d-head-left">
          <TitleRow view="list" />
          <PhraseRow q={q} />
        </div>
        <div className="d-head-right">
          <ProfileMenu />
          <QuarterSwitcher className="qs" desktop />
        </div>
      </header>
      <div className="d-cols">
        {q.courses.length > 0 && (
          <div className="d-grid">
            {q.courses.map((c) => (
              <section key={c.id} className="d-col">
                <DesktopColHead q={q} c={c} />
                <CourseBody course={c} />
              </section>
            ))}
          </div>
        )}
        <button className={`d-add-class${q.courses.length === 0 ? ' always' : ''}`} onClick={actions.addClass}>
          + class
        </button>
      </div>
    </div>
  );
}

function DesktopColHead({ q, c }: { q: Quarter; c: Course }) {
  const ui = useListUI();
  const actions = useQuarterActions(q);
  const key = `class:${c.id}`;
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const shown = hover || focusIn;
  return (
    <div
      className="col-head"
      data-head={key}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={(e) => setFocusIn(e.target.matches(':focus-visible') || e.target.tagName === 'INPUT')}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusIn(false); }}
    >
      <span className="col-mark">##</span>
      {ui.confirm === key ? (
        <InlineConfirm
          name={c.name}
          size={12}
          returnFocus={`[data-head="${key}"] input`}
          onYes={() => { ui.setConfirm(null); actions.removeClass(c.id); }}
          onNo={() => ui.setConfirm(null)}
        />
      ) : (
        <>
          <NameInput
            className="col-name"
            value={c.name}
            onChange={(v) => actions.renameClass(c.id, v)}
            focusKey={key}
            ariaLabel="class name"
          />
          {shown ? (
            <button className="col-del" data-del={key} aria-label={`delete class ${c.name}`} onClick={() => ui.setConfirm(key)}>
              ×
            </button>
          ) : (
            <span className="col-count">{activeCount(c)}</span>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- mobile §6 ---------- */

const lastClassKey = (qid: string) => `toa:class:${qid}`;

function initialIndex(q: Quarter, startCourse?: string) {
  const start = q.courses.findIndex((c) => c.id === startCourse);
  if (start >= 0) return start;
  try {
    const saved = localStorage.getItem(lastClassKey(q.id));
    const i = q.courses.findIndex((c) => c.id === saved);
    if (i >= 0) return i;
  } catch { /* storage unavailable */ }
  let best: { a: Assignment; i: number } | null = null;
  q.courses.forEach((c, i) => {
    const first = activeOf(c)[0];
    if (first && (!best || compareAssignments(first, best.a) < 0)) best = { a: first, i };
  });
  return best ? (best as { i: number }).i : 0;
}

function MobileList({ q, startCourse }: { q: Quarter; startCourse?: string }) {
  const actions = useQuarterActions(q);
  const ui = useListUI();
  const [rawIndex, setIndex] = useState(() => initialIndex(q, startCourse));
  const idx = Math.max(0, Math.min(rawIndex, q.courses.length - 1));

  const tabs = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  // position the track
  useLayoutEffect(() => {
    if (track.current) track.current.style.transform = `translateX(${-100 * idx}%)`;
  }, [idx]);

  // remember the class; keep the active tab visible
  const activeId = q.courses[idx]?.id;
  const { setStatusFor } = ui;
  useEffect(() => { setStatusFor(null); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeId) { try { localStorage.setItem(lastClassKey(q.id), activeId); } catch { /* ignore */ } }
    const box = tabs.current;
    const tab = box?.querySelector<HTMLElement>('.tab.active');
    if (!box || !tab) return;
    if (tab.offsetLeft < box.scrollLeft) box.scrollLeft = tab.offsetLeft;
    else if (tab.offsetLeft + tab.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = tab.offsetLeft + tab.offsetWidth - box.clientWidth;
    }
  }, [activeId, q.id]);

  /* swipe */
  const drag = useRef<{
    id: number; x0: number; y0: number; mode: 'pending' | 'h' | 'v'; dx: number; samples: { x: number; t: number }[];
  } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (ui.form || ui.confirm) return;
    if ((e.target as Element).closest('input, textarea, select')) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: 'pending', dx: 0, samples: [{ x: e.clientX, t: e.timeStamp }] };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || d.mode === 'v') return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (d.mode === 'pending') {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        d.mode = 'h';
        ui.setStatusFor(null);
        viewport.current?.setPointerCapture(e.pointerId);
        if (track.current) track.current.style.transition = 'none';
      } else {
        if (Math.abs(dy) > 8) d.mode = 'v';
        return;
      }
    }
    d.dx = dx;
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 100) d.samples.shift();
    if (track.current) track.current.style.transform = `translateX(calc(${-100 * idx}% + ${dx}px))`;
  };
  const endDrag = (e: React.PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.mode !== 'h') return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 50);
    const s = d.samples;
    const first = s[0];
    const last = s[s.length - 1];
    const v = (last.x - first.x) / Math.max(1, last.t - first.t);
    let next = idx;
    if (!cancelled) {
      if (Math.abs(d.dx) > 50) next = idx + (d.dx < 0 ? 1 : -1);
      else if (Math.abs(v) > 0.4) next = idx + (v < 0 ? 1 : -1);
    }
    next = Math.max(0, Math.min(next, q.courses.length - 1));
    if (track.current) {
      track.current.style.transition = '';
      track.current.style.transform = `translateX(${-100 * next}%)`;
    }
    setIndex(next);
  };

  const addClass = () => {
    actions.addClass();
    setIndex(q.courses.length);
  };
  const removeClass = (i: number) => {
    const id = q.courses[i]?.id;
    if (!id) return;
    ui.setConfirm(null);
    if (i < idx || (i === idx && i > 0)) setIndex(idx - 1);
    actions.removeClass(id);
  };

  return (
    <div className="m frame-m-list">
      <header className="m-head">
        <div className="m-namerow">
          <TitleRow view="list" />
          <ProfileMenu />
        </div>
        <div className="m-sub">
          <QuarterSwitcher className="qs" desktop={false} />
          <PhraseRow q={q} />
        </div>
        <div className="tabs" ref={tabs}>
          {q.courses.map((c, i) => (
            <ClassTab key={c.id} c={c} active={i === idx} onSelect={() => setIndex(i)} onDelete={() => removeClass(i)} />
          ))}
          <button className="tab tab-add" onClick={addClass}>+ class</button>
        </div>
      </header>
      <div
        className="viewport"
        ref={viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); } }}
        onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}
      >
        <div className="track" ref={track}>
          {q.courses.map((c, i) => (
            <section key={c.id} className="panel" inert={i !== idx}>
              <PanelTitle q={q} c={c} onDelete={() => removeClass(i)} />
              <CourseBody course={c} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClassTab({ c, active, onSelect, onDelete }: { c: Course; active: boolean; onSelect: () => void; onDelete: () => void }) {
  const ui = useListUI();
  const key = `tab:${c.id}`;
  const longPress = useLongPress(() => ui.setConfirm(key));
  if (ui.confirm === key) {
    return <InlineConfirm name={c.name} size={12} onYes={onDelete} onNo={() => ui.setConfirm(null)} />;
  }
  return (
    <button className={`tab${active ? ' active' : ''}`} onClick={onSelect} {...longPress}>
      {c.name}
    </button>
  );
}

function PanelTitle({ q, c, onDelete }: { q: Quarter; c: Course; onDelete: () => void }) {
  const ui = useListUI();
  const actions = useQuarterActions(q);
  const key = `title:${c.id}`;
  const longPress = useLongPress(() => ui.setConfirm(key));
  return (
    <div className="panel-title">
      <span className="panel-mark">##</span>
      {ui.confirm === key ? (
        <InlineConfirm name={c.name} size={12} onYes={onDelete} onNo={() => ui.setConfirm(null)} />
      ) : (
        <>
          <span className="panel-name-wrap" {...longPress}>
            <NameInput
              className="panel-name"
              value={c.name}
              onChange={(v) => actions.renameClass(c.id, v)}
              focusKey={`class:${c.id}`}
              ariaLabel="class name"
            />
          </span>
          <span className="panel-count">{activeCount(c)} open</span>
        </>
      )}
    </div>
  );
}

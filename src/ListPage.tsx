import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { useIsDesktop } from './useIsDesktop';
import { NameInput, ProfileMenu, SiteName, noAuto } from './components';
import { CourseBody, ListUIProvider, activeCount, useListUI } from './course';
import { activeOf, compareAssignments, currentQuarter, randomPhrase, uid, type Assignment, type Quarter } from './model';

/* ---------- shared header pieces ---------- */

function useQuarterActions(q: Quarter) {
  const { update, focusKey } = useStore();
  return {
    rename: (name: string) => update((d) => { const x = d.quarters.find((x) => x.id === q.id); if (x) x.name = name; }),
    remove: () => update((d) => {
      const i = d.quarters.findIndex((x) => x.id === q.id);
      if (i < 0) return;
      d.quarters.splice(i, 1);
      if (d.currentQuarterId === q.id || !d.quarters.some((x) => x.id === d.currentQuarterId)) {
        d.currentQuarterId = d.quarters[Math.max(0, i - 1)]?.id ?? null;
      }
    }),
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

function QuarterSwitcher({ className }: { className: string }) {
  const { state, update, focusKey } = useStore();
  const cur = currentQuarter(state)!;
  const actions = useQuarterActions(cur);
  const addQuarter = () => {
    const id = uid();
    focusKey.current = `quarter:${id}`;
    update((d) => {
      d.quarters.push({ id, name: 'new term', phrase: randomPhrase(), courses: [] });
      d.currentQuarterId = id;
    });
  };
  return (
    <div className={className}>
      {state.quarters.map((q) =>
        q.id === cur.id ? (
          <span key={q.id} className="qs-current">
            [<NameInput
              className="qs-input"
              value={q.name}
              size={Math.max(q.name.length, 3)}
              onChange={actions.rename}
              onDelete={actions.remove}
              focusKey={`quarter:${q.id}`}
              ariaLabel="term name"
            />]
          </span>
        ) : (
          <button key={q.id} className="qs-other" onClick={() => update((d) => { d.currentQuarterId = q.id; })}>
            {q.name}
          </button>
        ),
      )}
      <button className="qs-new" onClick={addQuarter}>+new</button>
    </div>
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
  return (
    <ListUIProvider>
      {isDesktop ? <DesktopList q={q} /> : <MobileList key={q.id} q={q} />}
    </ListUIProvider>
  );
}

/* ---------- desktop §5 ---------- */

function DesktopList({ q }: { q: Quarter }) {
  const actions = useQuarterActions(q);
  return (
    <div className="d frame-d">
      <header className="d-head">
        <div className="d-head-left">
          <SiteName />
          <PhraseRow q={q} />
        </div>
        <div className="d-head-right">
          <ProfileMenu />
          <QuarterSwitcher className="qs" />
        </div>
      </header>
      <div className="d-cols">
        {q.courses.map((c) => (
          <section key={c.id} className="d-col">
            <div className="col-head">
              <span className="col-mark">##</span>
              <NameInput
                className="col-name"
                value={c.name}
                onChange={(v) => actions.renameClass(c.id, v)}
                onDelete={() => actions.removeClass(c.id)}
                focusKey={`class:${c.id}`}
                ariaLabel="class name"
              />
              <span className="col-count">{activeCount(c)}</span>
            </div>
            <CourseBody course={c} />
          </section>
        ))}
        <button className={`d-add-class${q.courses.length === 0 ? ' always' : ''}`} onClick={actions.addClass}>
          + class
        </button>
      </div>
    </div>
  );
}

/* ---------- mobile §6 ---------- */

const lastClassKey = (qid: string) => `toa:class:${qid}`;

function initialIndex(q: Quarter) {
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

function MobileList({ q }: { q: Quarter }) {
  const actions = useQuarterActions(q);
  const ui = useListUI();
  const [rawIndex, setIndex] = useState(() => initialIndex(q));
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
    if (ui.form) return;
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

  return (
    <div className="m frame-m-list">
      <header className="m-head">
        <div className="m-namerow">
          <SiteName />
          <ProfileMenu />
        </div>
        <div className="m-sub">
          <QuarterSwitcher className="qs" />
          <PhraseRow q={q} />
        </div>
        <div className="tabs" ref={tabs}>
          {q.courses.map((c, i) => (
            <button key={c.id} className={`tab${i === idx ? ' active' : ''}`} onClick={() => setIndex(i)}>
              {c.name}
            </button>
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
              <div className="panel-title">
                <span className="panel-mark">##</span>
                <NameInput
                  className="panel-name"
                  value={c.name}
                  onChange={(v) => actions.renameClass(c.id, v)}
                  onDelete={() => actions.removeClass(c.id)}
                  focusKey={`class:${c.id}`}
                  ariaLabel="class name"
                />
                <span className="panel-count">{activeCount(c)} open</span>
              </div>
              <CourseBody course={c} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

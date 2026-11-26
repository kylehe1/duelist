export type Status = 'planned' | 'working..' | 'done!' | 'EXAM!!' | 'EXAM:)';

export interface Assignment {
  id: string;
  name: string;
  month: number;
  day: number;
  year: number;
  time: number | null;
  status: Status;
  createdAt: number;
}
export interface Course { id: string; name: string; assignments: Assignment[]; }
export interface Quarter { id: string; name: string; phrase: string; courses: Course[]; }
/** a personal calendar entry. time null = all day; endTime only with a time, and always after it */
export interface Plan {
  id: string;
  name: string;
  year: number;
  month: number;
  day: number;
  time: number | null;
  endTime: number | null;
  note: string;
  createdAt: number;
}
export interface AppState {
  quarters: Quarter[];
  currentQuarterId: string | null;
  plans: Plan[];
  calendar: { showAssignments: boolean };
}

export const emptyState = (): AppState => ({ quarters: [], currentQuarterId: null, plans: [], calendar: { showAssignments: true } });

/** fills in fields added after a copy was saved (plans and calendar came with spec 15) */
export function migrate(s: AppState): AppState {
  if (Array.isArray(s.plans) && s.calendar) return s;
  return { ...s, plans: s.plans ?? [], calendar: s.calendar ?? { showAssignments: true } };
}

export const isFinished = (s: Status) => s === 'done!' || s === 'EXAM:)';
export const isExam = (s: Status) => s === 'EXAM!!' || s === 'EXAM:)';
/** statuses an item can move between: assignments and exams each have their own set */
export const statusOptions = (s: Status): Status[] =>
  isExam(s) ? ['EXAM!!', 'EXAM:)'] : ['planned', 'working..', 'done!'];

const CHIP_CLASS: Record<Status, string> = {
  planned: 'planned',
  'working..': 'working',
  'done!': 'done',
  'EXAM!!': 'exam',
  'EXAM:)': 'examok',
};
export const chipClass = (s: Status) => CHIP_CLASS[s];

export function compareAssignments(a: Assignment, b: Assignment) {
  return (
    a.year - b.year ||
    a.month - b.month ||
    a.day - b.day ||
    (a.time ?? 1439) - (b.time ?? 1439) ||
    a.createdAt - b.createdAt
  );
}

/** spec 16c. 'late' (!!): active and the due moment has passed (no time = 11:59pm; 9am is late from 9:01).
 *  'soon' (!): active, not late, due today, tomorrow or the day after. Finished items never get a mark. */
export function urgency(a: Assignment, now = new Date()): 'late' | 'soon' | null {
  if (isFinished(a.status)) return null;
  const due = new Date(a.year, a.month - 1, a.day, 0, a.time ?? 1439);
  if (now.getTime() >= due.getTime() + 60_000) return 'late';
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  return new Date(a.year, a.month - 1, a.day) <= limit ? 'soon' : null;
}

export const activeOf = (c: Course) =>
  c.assignments.filter((a) => !isFinished(a.status)).sort(compareAssignments);
export const finishedOf = (c: Course) =>
  c.assignments.filter((a) => isFinished(a.status)).sort(compareAssignments);

export const formatDate = (a: Assignment) => `${a.month}/${a.day}`;

export function formatTime(t: number) {
  const h = Math.floor(t / 60);
  const m = t % 60;
  const ap = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, '0')}${ap}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateInput = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export function parseDateInput(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}
/** 9am, or 9am–11:40am */
export const formatRange = (t: number | null, end: number | null) =>
  t == null ? '' : end == null ? formatTime(t) : `${formatTime(t)}–${formatTime(end)}`;

export const toTimeInput = (t: number | null) => (t == null ? '' : `${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
export function parseTimeInput(v: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const t = +m[1] * 60 + +m[2];
  return t === 23 * 60 + 59 ? null : t;
}

export const PHRASES = [
  'better late than never',
  'a smooth sea never made a skilled sailor',
  'not all who wander are lost',
  'the tortoise had a good plan',
  'rest is part of the work',
  'fall seven, rise eight',
  'the cat knows something you do not',
  'bread is just patience with flour',
  'a good nap solves most problems',
  'bad days make good stories',
  'the lights are always on somewhere',
  'no one has ever regretted a walk',
  'fortune favors the prepared',
  'a wolf in sheeps clothing',
  'the pen is mightier than the sword',
  'once in a blue moon',
  'a blessing in disguise',
  'beggars cannot be choosers',
  'jack of all trades, master of none',
  'hindsight is 20/20',
  'all that glitters is not gold',
  'the devils in the details',
  'the early worm gets eaten',
  'third times the charm',
  'every rose has its thorn',
];
export const randomPhrase = () => PHRASES[Math.floor(Math.random() * PHRASES.length)];

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return crypto.randomUUID(); } catch { /* insecure context */ }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function currentQuarter(s: AppState): Quarter | null {
  return s.quarters.find((q) => q.id === s.currentQuarterId) ?? s.quarters[s.quarters.length - 1] ?? null;
}

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
export interface AppState { quarters: Quarter[]; currentQuarterId: string | null; }

export const emptyState = (): AppState => ({ quarters: [], currentQuarterId: null });

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

export function isDueSoon(a: Assignment, now = new Date()) {
  if (isFinished(a.status)) return false;
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  return new Date(a.year, a.month - 1, a.day) <= limit;
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
export const toTimeInput = (t: number | null) => (t == null ? '' : `${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
export function parseTimeInput(v: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const t = +m[1] * 60 + +m[2];
  return t === 23 * 60 + 59 ? null : t;
}

export const PHRASES = [
  'slow and steady',
  'one thing at a time',
  'make it fun',
  'future me says thanks',
  'cold hands warm heart',
  'even snails get there',
  'the moon never rushes',
  'rome took a while too',
  'tea first, then everything',
  'small steps still count',
  'water always finds a way',
  'good enough is good enough',
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

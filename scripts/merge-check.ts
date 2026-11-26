// self-check for src/merge.ts. Run: node scripts/merge-check.ts
import assert from 'node:assert/strict';
import { mergeState } from '../src/merge.ts';

const a = (id: string, name: string, status = 'planned') =>
  ({ id, name, month: 12, day: 1, year: 2026, time: null, status, createdAt: 1 }) as const;
const st = (assignments: ReturnType<typeof a>[], phrase = 'p') => ({
  currentQuarterId: 'q',
  quarters: [{ id: 'q', name: 'fall 26', phrase, courses: [{ id: 'c', name: '6D', assignments: [...assignments] }] }],
});
const names = (s: ReturnType<typeof mergeState>) => s.quarters[0].courses[0].assignments.map((x) => `${x.name}:${x.status}`);

const base = st([a('1', 'hw1'), a('2', 'hw2')]);

// QA F15: offline phone adds one, laptop adds one -> both kept
let m = mergeState(base as never, st([a('1', 'hw1'), a('2', 'hw2'), a('p', 'phone')]) as never, st([a('1', 'hw1'), a('2', 'hw2'), a('l', 'laptop')]) as never);
assert.deepEqual(names(m), ['hw1:planned', 'hw2:planned', 'phone:planned', 'laptop:planned']);

// a delete on either side sticks; an edit on the other side of a different item survives
m = mergeState(base as never, st([a('2', 'hw2')]) as never, st([a('1', 'hw1'), a('2', 'hw2', 'done!')]) as never);
assert.deepEqual(names(m), ['hw2:done!']);

// each side changed a different field: both changes kept; same field: local wins
m = mergeState(base as never, st([a('1', 'hw1', 'working..'), a('2', 'hw2')], 'mine') as never, st([a('1', 'HW1'), a('2', 'hw2')], 'theirs') as never);
assert.deepEqual(names(m), ['HW1:working..', 'hw2:planned']);
assert.equal(m.quarters[0].phrase, 'mine');

// no base known: union, nothing lost
m = mergeState(null, st([a('p', 'phone')]) as never, st([a('l', 'laptop')]) as never);
assert.deepEqual(names(m), ['phone:planned', 'laptop:planned']);

// current term deleted elsewhere -> falls back to a term that exists
m = mergeState(base as never, base as never, { currentQuarterId: null, quarters: [] } as never);
assert.equal(m.currentQuarterId, null);
assert.equal(m.quarters.length, 0);

console.log('merge ok');

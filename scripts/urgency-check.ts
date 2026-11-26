// self-check for urgency() in src/model.ts (spec 16c). Run: node scripts/urgency-check.ts
import assert from 'node:assert/strict';
import { urgency } from '../src/model.ts';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const a = (day: number, time: number | null = null, status = 'planned') =>
  ({ id: 'x', name: 'x', year: 2026, month: 11, day, time, status, createdAt: 0 }) as Parameters<typeof urgency>[0];

// no time: ! all day, !! from midnight
assert.equal(urgency(a(26), at(2026, 11, 26, 23, 59)), 'soon');
assert.equal(urgency(a(26), at(2026, 11, 27, 0, 0)), 'late');
// 9am: still ! at 9:00, !! from 9:01
assert.equal(urgency(a(26, 540), at(2026, 11, 26, 9, 0)), 'soon');
assert.equal(urgency(a(26, 540), at(2026, 11, 26, 9, 1)), 'late');
// day after tomorrow: !, three days out: nothing
assert.equal(urgency(a(28), at(2026, 11, 26, 12)), 'soon');
assert.equal(urgency(a(29), at(2026, 11, 26, 12)), null);
// finished never marked, even when late
assert.equal(urgency(a(1, null, 'done!'), at(2026, 11, 26)), null);
assert.equal(urgency(a(1, null, 'EXAM:)'), at(2026, 11, 26)), null);
assert.equal(urgency(a(1, null, 'EXAM!!'), at(2026, 11, 26)), 'late');
// across a month end
assert.equal(urgency({ ...a(1), month: 12 }, at(2026, 11, 29, 8)), 'soon');
console.log('urgency ok');

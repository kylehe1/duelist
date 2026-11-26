import type { AppState } from './model';

/* three-way merge of two copies of the account that both changed since `base` (the last copy both agreed on).
   Items are matched by id at every level (terms, classes, assignments), so new items from either side are kept.
   For a plain field, whichever side changed it wins; if both did, this device wins.
   An item one side deleted stays deleted. */

type Obj = Record<string, unknown>;
type Item = Obj & { id: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isIdList = (v: unknown): v is Item[] =>
  Array.isArray(v) && v.every((x) => x != null && typeof x === 'object' && 'id' in x);

function mergeObj(b: Obj | undefined, l: Obj, r: Obj): Obj {
  const out: Obj = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const bv = b?.[k];
    const lv = l[k];
    const rv = r[k];
    if (isIdList(lv) && isIdList(rv)) out[k] = mergeList(isIdList(bv) ? bv : [], lv, rv);
    else out[k] = same(lv, bv) ? rv : lv;
  }
  return out;
}

function mergeList(b: Item[], l: Item[], r: Item[]): Item[] {
  const B = new Map(b.map((x) => [x.id, x]));
  const L = new Map(l.map((x) => [x.id, x]));
  const R = new Map(r.map((x) => [x.id, x]));
  const out: Item[] = [];
  for (const x of l) {
    const rx = R.get(x.id);
    if (rx) out.push(mergeObj(B.get(x.id), x, rx) as Item);
    else if (!B.has(x.id)) out.push(x); // new here
  }
  for (const x of r) if (!L.has(x.id) && !B.has(x.id)) out.push(x); // new there
  return out;
}

export function mergeState(base: AppState | null, local: AppState, remote: AppState): AppState {
  const m = mergeObj(base as unknown as Obj | undefined, local as unknown as Obj, remote as unknown as Obj) as unknown as AppState;
  if (!m.quarters.some((q) => q.id === m.currentQuarterId)) m.currentQuarterId = m.quarters.at(-1)?.id ?? null;
  return m;
}

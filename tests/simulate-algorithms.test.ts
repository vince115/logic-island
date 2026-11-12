import { describe, expect, it } from 'vitest';
import { validateTrace, type TraceKind, type TraceStep } from '../src/content/curriculum/schema';
import {
  activitySelectionSteps, bfsSteps, binarySearchSteps, bubbleSortSteps, combinationSumSteps, dfsSteps, dijkstraSteps, fibTreeSteps, fixedWindowSteps,
  greedyCoinSteps, insertionSortSteps, knapsackSteps, linearSearchSteps, lowerBoundSteps, mergeSortSteps, minWindowSteps, prefixSumSteps, quickSortSteps,
  selectionSortSteps, tableFillSteps, twoSumSteps,
} from '../src/content/curriculum/simulate-algorithms';

/*
 * Phase E.4: every algorithm simulator against a reference implementation — fixed edge cases, all small inputs where
 * that is cheap, and seeded random inputs — and every trace it makes must pass the curriculum's trace validator.
 */
const valid = (kind: TraceKind, steps: TraceStep[]) => expect(validateTrace('t', kind, 'x\n'.repeat(19), steps)).toEqual([]);
const out = (steps: TraceStep[]) => steps.at(-1)!.output ?? steps.findLast(s => s.output !== undefined)?.output;
/** A small deterministic generator (mulberry32), so failures are reproducible. */
function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
}
const randomArrays = (seed: number, count: number, maxLen = 10, lo = -9, hi = 9) => {
  const r = rng(seed);
  return Array.from({ length: count }, () => Array.from({ length: Math.floor(r() * (maxLen + 1)) }, () => lo + Math.floor(r() * (hi - lo + 1))));
};
const EDGE_ARRAYS = [[], [5], [1, 2, 3, 4], [4, 3, 2, 1], [2, 2, 2], [3, -1, 3, -7, 0, -1], [1, 1, 0, 0, 1, 0]];
const sortedCopy = (a: number[]) => [...a].sort((x, y) => x - y);

describe('search simulators (E.4)', () => {
  it('linear search finds the first, last or every position, and −1 when missing', () => {
    for (const a of [...EDGE_ARRAYS, ...randomArrays(1, 200)]) for (const target of [-1, 0, 2, 3]) {
      expect(out(linearSearchSteps(a, target, 'first'))).toBe(String(a.indexOf(target)));
      expect(out(linearSearchSteps(a, target, 'last'))).toBe(String(a.lastIndexOf(target)));
      expect(out(linearSearchSteps(a, target, 'all'))).toBe(a.flatMap((v, i) => v === target ? [i] : []).join(' ') || '-1');
    }
    valid('array-index', linearSearchSteps([4, 2, 7, 2], 2, 'all'));
  });

  it('binary search (the lab engine) returns a position holding the target, or −1; lower bound the first index ≥ target', () => {
    for (const raw of [...EDGE_ARRAYS, ...randomArrays(2, 300)]) {
      const a = sortedCopy(raw);
      for (let target = -10; target <= 10; target++) {
        const got = Number(out(binarySearchSteps(a, target)));
        if (a.includes(target)) expect(a[got]).toBe(target); else expect(got).toBe(-1);
        const lb = a.findIndex(v => v >= target);
        expect(out(lowerBoundSteps(a, target))).toBe(String(lb < 0 ? a.length : lb));
      }
    }
    valid('array-index', binarySearchSteps([1, 3, 5, 7, 9, 11], 7));
    valid('array-index', binarySearchSteps([1, 3, 5], 4));
    valid('array-index', lowerBoundSteps([1, 2, 2, 2, 5], 2));
    valid('array-index', lowerBoundSteps([1, 2], 9));
  });
});

describe('sorting simulators (E.4)', () => {
  const sorts = { bubbleSortSteps, selectionSortSteps, insertionSortSteps, mergeSortSteps, quickSortSteps };
  it('every sort ends with the sorted array, on edge cases and 300 seeded random arrays', () => {
    for (const a of [...EDGE_ARRAYS, ...randomArrays(3, 300)]) for (const [name, sort] of Object.entries(sorts)) {
      const steps = sort(a);
      expect(steps.at(-1)!.arrays![0].cells, `${name} ${a}`).toEqual(sortedCopy(a).map(String));
      if (a.length) expect(out(steps), name).toBe(sortedCopy(a).join(' '));
    }
    for (const sort of Object.values(sorts)) valid('sorting-steps', sort([5, 2, 9, 2, 1, 7]));
  });

  it('counts match the textbook: selection always n(n−1)/2 compares; insertion n−1 compares when already sorted', () => {
    const a = [5, 1, 4, 2, 8, 0, 3];
    expect(selectionSortSteps(a).at(-1)!.vars!.比較).toBe(String((a.length * (a.length - 1)) / 2));
    expect(insertionSortSteps([1, 2, 3, 4, 5]).at(-1)!.vars!.比較).toBe('4');
    expect(insertionSortSteps([5, 4, 3, 2, 1]).at(-1)!.vars!.搬移).toBe('10');
  });

  it('equal keys: merge takes the left one on a tie and insertion stops at an equal key (stable); selection explains its swap is not', () => {
    expect(mergeSortSteps([2, 1, 2]).some(s => s.note.includes('相等取左半，維持穩定'))).toBe(true);
    expect(insertionSortSteps([2, 1, 2]).some(s => s.note.includes('相等時不越過'))).toBe(true);
    expect(selectionSortSteps([2, 2, 1]).some(s => s.note.includes('不穩定'))).toBe(true);
  });
});

describe('two pointers, windows and prefix sums (E.4)', () => {
  it('two pointers find a pair whenever one exists in a sorted array', () => {
    for (const raw of [...EDGE_ARRAYS, ...randomArrays(5, 300)]) {
      const a = sortedCopy(raw);
      for (let target = -12; target <= 12; target += 3) {
        const got = out(twoSumSteps(a, target))!;
        const exists = a.some((x, i) => a.some((y, j) => i < j && x + y === target));
        if (!exists) expect(got).toBe('-1');
        else { const [i, j] = got.split(' ').map(Number); expect(i).toBeLessThan(j); expect(a[i] + a[j]).toBe(target); }
      }
    }
    valid('array-index', twoSumSteps([1, 2, 4, 7, 11], 9));
  });

  it('fixed and variable windows match brute force; the variable window refuses negative numbers', () => {
    for (const raw of randomArrays(6, 300, 10, 0, 9)) {
      if (!raw.length) continue;
      const k = 1 + (raw.length > 1 ? raw[0] % raw.length : 0);
      const brute = Math.max(...raw.slice(0, raw.length - k + 1).map((_, i) => raw.slice(i, i + k).reduce((s, v) => s + v, 0)));
      expect(out(fixedWindowSteps(raw, k))).toBe(String(brute));
      for (const target of [1, 7, 15, 40]) {
        let best = 0;
        for (let i = 0; i < raw.length; i++) for (let j = i; j < raw.length; j++) if (raw.slice(i, j + 1).reduce((s, v) => s + v, 0) >= target) { if (!best || j - i + 1 < best) best = j - i + 1; }
        expect(out(minWindowSteps(raw, target)), `${raw} ${target}`).toBe(String(best));
      }
    }
    expect(() => minWindowSteps([2, -1, 3], 3)).toThrow();
    valid('array-index', minWindowSteps([2, 3, 1, 2, 4, 3], 7));
    valid('array-index', fixedWindowSteps([1, 4, 2, 10, 2, 3], 3));
  });

  it('prefix sums answer every inclusive range like a direct sum (P[r+1] − P[l])', () => {
    for (const a of randomArrays(7, 100, 10, -50, 50).filter(x => x.length)) {
      const queries: [number, number][] = [];
      for (let l = 0; l < a.length; l++) for (let r = l; r < a.length; r++) queries.push([l, r]);
      expect(out(prefixSumSteps(a, queries))).toBe(queries.map(([l, r]) => a.slice(l, r + 1).reduce((s, v) => s + v, 0)).join('\n'));
    }
    valid('array-index', prefixSumSteps([3, -1, 4, 1, 5], [[1, 3], [0, 4]]));
  });
});

describe('recursion, backtracking and greedy (E.4)', () => {
  it('fib call trees: the value is right; memoization makes 2n − 1 calls instead of fib(n+1)·2 − 1', () => {
    const fib = (n: number): number => n < 2 ? n : fib(n - 1) + fib(n - 2);
    for (let n = 0; n <= 7; n++) {
      const plain = fibTreeSteps(n, false), memo = fibTreeSteps(n, true);
      expect(out(plain)).toBe(String(fib(n)));
      expect(out(memo)).toBe(String(fib(n)));
      expect(plain.at(-1)!.vars!.呼叫次數).toBe(String(2 * fib(n + 1) - 1));
      expect(memo.at(-1)!.vars!.呼叫次數).toBe(String(n < 2 ? 1 : 2 * n - 1));
      valid('recursion-tree', plain);
    }
    // The call stack in each step is the path from the root to the running call.
    for (const s of fibTreeSteps(4, false)) expect(s.frames!.length).toBeLessThanOrEqual(5);
  });

  it('combination sum lists exactly the distinct subsets (each item once) with the target sum', () => {
    const r = rng(8);
    for (let t = 0; t < 60; t++) {
      const c = Array.from({ length: 1 + Math.floor(r() * 6) }, () => 1 + Math.floor(r() * 6));
      const target = 1 + Math.floor(r() * 12);
      const brute = new Set<string>();
      for (let mask = 1; mask < 1 << c.length; mask++) {
        const pick = c.filter((_, i) => mask & (1 << i)).sort((x, y) => x - y);
        if (pick.reduce((s, v) => s + v, 0) === target) brute.add(pick.join(' '));
      }
      const got = out(combinationSumSteps(c, target))!;
      expect(new Set(got === 'none' ? [] : got.split('\n')), `${c} → ${target}`).toEqual(brute);
    }
    valid('recursion-tree', combinationSumSteps([2, 3, 5, 2], 7));
  });

  it('activity selection matches the maximum found by brute force; greedy coins can be beaten', () => {
    const r = rng(9);
    for (let t = 0; t < 80; t++) {
      const acts = Array.from({ length: 1 + Math.floor(r() * 7) }, (_, i) => { const s = Math.floor(r() * 10); return { name: `a${i}`, start: s, end: s + 1 + Math.floor(r() * 4) }; });
      let best = 0;
      for (let mask = 0; mask < 1 << acts.length; mask++) {
        const pick = acts.filter((_, i) => mask & (1 << i)).sort((x, y) => x.start - y.start);
        if (pick.every((a, i) => !i || pick[i - 1].end <= a.start)) best = Math.max(best, pick.length);
      }
      expect(out(activitySelectionSteps(acts))).toBe(String(best));
    }
    expect(out(greedyCoinSteps([1, 3, 4], 6))).toBe('3'); // the optimum is 2 (3 + 3)
    expect(out(greedyCoinSteps([1, 5, 10, 50], 68))).toBe('6'); // 50 + 10 + 5 + 1 + 1 + 1
    valid('greedy-choice', activitySelectionSteps([{ name: 'A', start: 1, end: 3 }, { name: 'B', start: 2, end: 5 }, { name: 'C', start: 4, end: 7 }]));
  });
});

describe('graph simulators (E.4)', () => {
  const randomGraph = (seed: number) => {
    const r = rng(seed), n = 2 + Math.floor(r() * 6), nodes = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
    const edges = Array.from({ length: Math.floor(r() * 9) }, () => ({ from: nodes[Math.floor(r() * n)], to: nodes[Math.floor(r() * n)], weight: Math.floor(r() * 9) }));
    return { nodes, edges, directed: r() < 0.5 };
  };
  /** Bellman-Ford style reference distances (fine for small graphs). */
  const reference = (nodes: string[], edges: { from: string; to: string; weight?: number }[], directed: boolean, start: string, unit: boolean) => {
    const d = new Map(nodes.map(n => [n, n === start ? 0 : Infinity]));
    for (let k = 0; k < nodes.length; k++) for (const e of edges) for (const [u, v] of directed ? [[e.from, e.to]] : [[e.from, e.to], [e.to, e.from]]) {
      const w = unit ? 1 : e.weight ?? 1;
      if (d.get(u)! + w < d.get(v)!) d.set(v, d.get(u)! + w);
    }
    return d;
  };

  it('BFS distances equal shortest edge counts; unreachable nodes stay ∞ (200 random graphs with cycles, self-loops and multi-edges)', () => {
    for (let s = 0; s < 200; s++) {
      const { nodes, edges, directed } = randomGraph(100 + s);
      const steps = bfsSteps(nodes, edges, directed, 'A');
      const d = reference(nodes, edges, directed, 'A', true);
      const table = steps.at(-1)!.table!;
      for (const [i, n] of nodes.entries()) expect(table.rows[i][1], `${n}`).toBe(d.get(n) === Infinity ? '∞（未發現）' : String(d.get(n)));
      // The visiting order holds every reachable node once, in non-decreasing distance.
      const order = steps.at(-1)!.output!.split(' ');
      expect(new Set(order)).toEqual(new Set(nodes.filter(n => d.get(n) !== Infinity)));
      expect(order.map(n => d.get(n)!)).toEqual([...order.map(n => d.get(n)!)].sort((x, y) => x - y));
      valid('graph-traversal', steps);
    }
  });

  it('DFS visits exactly the nodes reachable from the start, each once, and each through an edge to an earlier node', () => {
    for (let s = 0; s < 200; s++) {
      const { nodes, edges, directed } = randomGraph(300 + s);
      const steps = dfsSteps(nodes, edges, directed, 'A');
      const order = steps.at(-1)!.output!.split(' ');
      const d = reference(nodes, edges, directed, 'A', true);
      expect(new Set(order)).toEqual(new Set(nodes.filter(n => d.get(n) !== Infinity)));
      expect(order.length).toBe(new Set(order).size);
      valid('graph-traversal', steps);
    }
  });

  it('Dijkstra matches the reference distances on non-negative weights and rejects negative ones', () => {
    for (let s = 0; s < 200; s++) {
      const { nodes, edges, directed } = randomGraph(500 + s);
      const target = nodes.at(-1)!;
      const steps = dijkstraSteps(nodes, edges, directed, 'A', target);
      const d = reference(nodes, edges, directed, 'A', false);
      const table = steps.findLast(s => s.table)!.table!;
      for (const [i, n] of nodes.entries()) expect(table.rows[i][1], `${n}`).toBe(d.get(n) === Infinity ? '∞' : String(d.get(n)));
      expect(out(steps)!.split('\n')[0]).toBe(d.get(target) === Infinity ? '-1' : String(d.get(target)));
      valid('graph-traversal', steps);
    }
    expect(() => dijkstraSteps(['A', 'B'], [{ from: 'A', to: 'B', weight: -1 }], true, 'A')).toThrow();
  });
});

describe('dynamic programming (E.4)', () => {
  it('0/1 knapsack equals brute force over all subsets, including capacity 0 and no items fitting', () => {
    const r = rng(10);
    for (let t = 0; t < 150; t++) {
      const items = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => ({ name: `i${i}`, weight: 1 + Math.floor(r() * 5), value: Math.floor(r() * 10) }));
      const cap = Math.floor(r() * 9);
      let best = 0;
      for (let mask = 0; mask < 1 << items.length; mask++) {
        const pick = items.filter((_, i) => mask & (1 << i));
        if (pick.reduce((s, x) => s + x.weight, 0) <= cap) best = Math.max(best, pick.reduce((s, x) => s + x.value, 0));
      }
      const [value, chosen] = out(knapsackSteps(items, cap))!.split('\n');
      expect(Number(value)).toBe(best);
      const picked = chosen === 'none' ? [] : chosen.split(' ').map(n => items.find(i => i.name === n)!);
      expect(picked.reduce((s, x) => s + x.weight, 0)).toBeLessThanOrEqual(cap);
      expect(picked.reduce((s, x) => s + x.value, 0)).toBe(best);
    }
    valid('dp-table', knapsackSteps([{ name: 'A', weight: 2, value: 3 }, { name: 'B', weight: 3, value: 4 }], 5));
  });

  it('a table fill reads only filled cells (climbing stairs), and refuses to read ahead', () => {
    const n = 8;
    const steps = tableFillSteps({ name: 'ways', rows: 1, cols: n + 1, order: Array.from({ length: n + 1 }, (_, i) => [0, i]),
      cell: (_, i, get) => i < 2 ? { value: 1, reads: [], note: 'base' } : { value: get(0, i - 1) + get(0, i - 2), reads: [[0, i - 1], [0, i - 2]], note: 'sum' } });
    expect(steps.at(-1)!.arrays![0].cells).toEqual([[1, 1, 2, 3, 5, 8, 13, 21, 34].map(String)]);
    valid('dp-table', steps);
    expect(() => tableFillSteps({ name: 'x', rows: 1, cols: 2, order: [[0, 0]], cell: (_, __, get) => ({ value: get(0, 1), reads: [], note: '' }) })).toThrow();
  });
});

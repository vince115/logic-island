import { describe, expect, it } from 'vitest';
import { validateTrace, type TraceKind, type TraceStep } from '../src/content/curriculum/schema';
import { type BstOp, bstSteps, bucketOf, containerSteps, dsuForest, dsuSteps, dynamicArraySteps, graphSteps, hashSteps, heapSteps, linkedListSteps, traversalSteps, type Shape } from '../src/content/curriculum/simulate';

// Phase E.3: the data-structure simulators behave like the real structures, and every step they make is a valid trace.
const valid = (kind: TraceKind, steps: TraceStep[]) => expect(validateTrace('t', kind, 'x\n'.repeat(9), steps)).toEqual([]);
const last = (steps: TraceStep[]) => steps.at(-1)!;

describe('data-structure simulators (E.3)', () => {
  it('stack is LIFO, queue is FIFO, and empty reads are underflows that change nothing', () => {
    const s = containerSteps('s', 'stack', [{ line: 1, op: 'push', value: '1' }, { line: 1, op: 'push', value: '2' }, { line: 1, op: 'push', value: '3' }, { line: 2, op: 'pop' }, { line: 3, op: 'top' }]);
    expect(s[3].vars).toEqual({ 取出: '3' });
    expect(last(s).vars).toEqual({ top: '2' });
    expect(last(s).containers![0].items).toEqual(['1', '2']);
    const q = containerSteps('q', 'queue', [{ line: 1, op: 'push', value: 'a' }, { line: 1, op: 'push', value: 'b' }, { line: 2, op: 'pop' }, { line: 2, op: 'pop' }, { line: 2, op: 'pop' }]);
    expect(q.slice(2, 4).map(x => x.vars)).toEqual([{ 取出: 'a' }, { 取出: 'b' }]);
    expect(last(q).containers![0]).toMatchObject({ items: [], underflow: true });
    const d = containerSteps('d', 'deque', [{ line: 1, op: 'push_back', value: '2' }, { line: 1, op: 'push_front', value: '1' }, { line: 1, op: 'push_back', value: '3' }, { line: 2, op: 'pop_back' }, { line: 2, op: 'front' }]);
    expect(d[2].containers![0].items).toEqual(['1', '2', '3']);
    expect(last(d).vars).toEqual({ front: '1' });
    for (const steps of [s, q, d]) valid('stack-queue', steps);
  });

  it('dynamic array doubles its capacity when full and shifts on insert and erase', () => {
    const a = dynamicArraySteps('a', [1, 2, 3, 4, 5].map(v => ({ line: 1, op: 'push_back' as const, value: String(v) })).concat([{ line: 2, op: 'insert', index: 1, value: '9' } as never, { line: 3, op: 'erase', index: 0 } as never, { line: 4, op: 'get', index: 7 } as never]));
    const caps = a.map(s => s.arrays![0].capacity);
    expect([...new Set(caps)]).toEqual([1, 2, 4, 8]);
    expect(a.filter(s => s.note.startsWith('容量已滿')).length).toBe(3);
    expect(a.at(-2)!.arrays![0].cells).toEqual(['9', '2', '3', '4', '5']);
    expect(last(a).arrays![0].marks).toEqual([{ at: 7, kind: 'bad' }]);
    valid('array-index', a);
  });

  it('linked list walks from head, keeps its links and reaches null when a value is missing', () => {
    const l = linkedListSteps('l', [{ line: 1, op: 'push_back', value: 'B' }, { line: 1, op: 'push_front', value: 'A' }, { line: 1, op: 'push_back', value: 'D' },
      { line: 2, op: 'insert_after', target: 'B', value: 'C' }, { line: 3, op: 'remove', value: 'A' }, { line: 4, op: 'find', value: 'Z' }]);
    expect(l.find(s => s.note.startsWith('在 B 之後'))!.list!.nodes).toEqual(['A', 'B', 'C', 'D']);
    expect(last(l).list).toMatchObject({ nodes: ['B', 'C', 'D'], pointers: { head: 0, cur: null } });
    valid('linked-list', l);
  });

  it('hash table puts each key in hash(key) mod m, chains collisions and keeps keys unique', () => {
    expect(bucketOf(-3, 5)).toBe(2);
    expect(bucketOf('ab', 7)).toBe((97 + 98) % 7);
    const h = hashSteps('h', 5, 'map', [{ line: 1, op: 'put', key: 3, value: 'x' }, { line: 1, op: 'put', key: 8, value: 'y' }, { line: 1, op: 'put', key: 3, value: 'z' },
      { line: 2, op: 'get', key: 8 }, { line: 3, op: 'remove', key: 3 }, { line: 4, op: 'contains', key: 3 }]);
    expect(h[1].note).toContain('碰撞');
    expect(h[2].buckets!.buckets[3]).toEqual(['3:z', '8:y']);
    expect(h[3].vars!['get(8)']).toBe('y');
    expect(last(h).buckets!.buckets[3]).toEqual(['8:y']);
    expect(last(h).vars!['contains(3)']).toBe('false');
    const set = hashSteps('s', 3, 'set', [{ line: 1, op: 'add', key: 'a' }, { line: 1, op: 'add', key: 'a' }]);
    expect(last(set).vars!.size).toBe('1');
    valid('hash-table', h);
  });

  it('traversals visit nodes in pre, in, post and level order', () => {
    const shape: Shape = ['A', ['B', ['D'], ['E']], ['C', null, ['F']]];
    const order = (o: 'pre' | 'in' | 'post' | 'level') => last(traversalSteps('t', shape, o, 1)).output;
    expect(order('pre')).toBe('A B D E C F');
    expect(order('in')).toBe('D B E A C F');
    expect(order('post')).toBe('D E B F C A');
    expect(order('level')).toBe('A B C D E F');
    valid('tree-traversal', traversalSteps('t', shape, 'level', 1));
  });

  it('BST keeps the search-tree order through inserts and removals (two-child removal uses the successor)', () => {
    const steps = bstSteps('b', [8, 3, 10, 1, 6, 14, 4, 7, 13].map((v): BstOp => ({ line: 1, op: 'insert', value: v })).concat([{ line: 2, op: 'remove', value: 3 }, { line: 3, op: 'search', value: 13 }, { line: 3, op: 'insert', value: 6 }]));
    const t = last(steps).tree!;
    const byId = new Map(t.nodes.map(n => [n.id, n]));
    const inorder: number[] = [];
    const go = (id?: string | null) => { if (!id) return; const n = byId.get(id)!; go(n.left); inorder.push(Number(n.label)); go(n.right); };
    go(t.roots[0]);
    expect(inorder).toEqual([1, 4, 6, 7, 8, 10, 13, 14]);
    expect(steps.find(s => s.vars?.['search(13)'])!.vars).toEqual({ 'search(13)': 'true' });
    expect(last(steps).note).toContain('不存重複值');
    valid('tree-traversal', steps);
  });

  it('min-heap keeps every parent ≤ its children and pops in sorted order', () => {
    const values = [5, 3, 8, 1, 9, 2];
    const steps = heapSteps('h', [...values.map(v => ({ line: 1, op: 'push' as const, value: v })), ...values.map(() => ({ line: 2, op: 'pop' as const }))]);
    for (const s of steps.filter(s => /結束|空的/.test(s.note))) {
      const h = s.arrays![0].cells.map(Number);
      h.forEach((v, i) => { if (i) expect(h[(i - 1) >> 1]).toBeLessThanOrEqual(v); });
    }
    expect(steps.filter(s => s.vars?.取出).map(s => Number(s.vars!.取出))).toEqual([...values].sort((a, b) => a - b));
    valid('heap', steps);
  });

  it('graphs store undirected edges both ways and directed edges one way', () => {
    const u = graphSteps('g', ['A', 'B', 'C'], false, [{ line: 1, op: 'edge', from: 'A', to: 'B' }, { line: 1, op: 'edge', from: 'B', to: 'C', weight: 4 }, { line: 2, op: 'neighbors', node: 'B' }, { line: 3, op: 'has_edge', from: 'C', to: 'B' }]);
    expect(u[2].vars).toEqual({ 'neighbors(B)': 'A C' });
    expect(last(u).vars).toEqual({ 'has_edge(C, B)': 'true' });
    const d = graphSteps('g', ['A', 'B'], true, [{ line: 1, op: 'edge', from: 'A', to: 'B' }, { line: 2, op: 'has_edge', from: 'B', to: 'A' }, { line: 3, op: 'neighbors', node: 'B' }]);
    expect(d[1].vars).toEqual({ 'has_edge(B, A)': 'false' });
    expect(last(d).vars).toEqual({ 'neighbors(B)': '（沒有）' });
    valid('graph-traversal', u);
  });

  it('union-find unions by size, compresses paths and answers connectivity', () => {
    const steps = dsuSteps(6, [{ line: 1, op: 'union', a: 0, b: 1 }, { line: 1, op: 'union', a: 2, b: 3 }, { line: 1, op: 'union', a: 1, b: 3 }, { line: 1, op: 'union', a: 4, b: 3 },
      { line: 2, op: 'find', a: 3 }, { line: 3, op: 'connected', a: 0, b: 4 }, { line: 3, op: 'connected', a: 0, b: 5 }]);
    const end = last(steps).dsu!;
    expect(end.parent[3]).toBe(0);
    expect(end.size[0]).toBe(5);
    expect(steps.some(s => s.note.startsWith('路徑壓縮'))).toBe(true);
    expect(steps.find(s => s.vars?.['connected(0, 4)'])!.vars).toEqual({ 'connected(0, 4)': 'true' });
    expect(last(steps).vars).toEqual({ 'connected(0, 5)': 'false' });
    expect(dsuForest(end.parent).roots).toEqual(['d0', 'd5']);
    valid('disjoint-set', steps);
  });
});

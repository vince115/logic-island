import { describe, expect, it } from 'vitest';
import { buildTree, checkTree, range, search, validateInput } from '../src/lib/bplus/tree';

// Phase F.1c: the B+ tree engine behind DB11's tree explorer.
describe('B+ tree engine (F.1c)', () => {
  it('splits leaves (copy up) and inner nodes (move up) as the textbook does', () => {
    const tree = buildTree(3, [10, 20, 30, 40, 50, 60, 70]);
    expect(tree.nodes.map(n => [n.id, n.keys])).toEqual([
      ['root', [50]], ['L1-1', [30]], ['L1-2', [70]],
      ['L2-1', [10, 20]], ['L2-2', [30, 40]], ['L2-3', [50, 60]], ['L2-4', [70]],
    ]);
    expect(tree.height).toBe(3);
    expect(tree.nodes.filter(n => n.leaf).map(n => n.next)).toEqual(['L2-2', 'L2-3', 'L2-4', undefined]);
    expect(checkTree(tree)).toEqual([]);
  });

  it('finds a key along one root-to-leaf path; an equal separator leads right', () => {
    const tree = buildTree(3, [10, 20, 30, 40, 50, 60, 70]);
    expect(search(tree, 65)).toEqual({ path: ['root', 'L1-2', 'L2-3'], found: false });
    expect(search(tree, 50)).toEqual({ path: ['root', 'L1-2', 'L2-3'], found: true });
    expect(search(tree, 30)).toEqual({ path: ['root', 'L1-1', 'L2-2'], found: true });
  });

  it('answers a range by walking the leaf chain from the first leaf', () => {
    const tree = buildTree(3, [10, 20, 30, 40, 50, 60, 70]);
    expect(range(tree, 25, 55)).toEqual({ path: ['root', 'L1-1', 'L2-1'], leaves: ['L2-1', 'L2-2', 'L2-3'], keys: [30, 40, 50] });
    expect(range(tree, 71, 99).keys).toEqual([]);
  });

  it('keeps every rule for any insertion order and order 3..6', () => {
    for (let order = 3; order <= 6; order++) for (let seed = 1; seed <= 25; seed++) {
      const keys = Array.from({ length: 40 }, (_, i) => (i * (7 + seed * 2) + seed * 13) % 997);
      const tree = buildTree(order, keys);
      expect(checkTree(tree), `order ${order} seed ${seed}`).toEqual([]);
      expect(tree.keyCount).toBe(new Set(keys).size);
      for (const k of keys) expect(search(tree, k).found).toBe(true);
      const [lo, hi] = [keys[3] % 500, keys[3] % 500 + 300];
      expect(range(tree, lo, hi).keys).toEqual([...new Set(keys)].filter(k => k >= lo && k <= hi).sort((a, b) => a - b));
    }
  });

  it('ignores a duplicate key and rejects input the page does not accept', () => {
    expect(buildTree(4, [5, 5, 5]).keyCount).toBe(1);
    expect(validateInput(2, [1])).toMatch(/階數/);
    expect(validateInput(4, [1.5])).toMatch(/整數/);
    expect(validateInput(4, Array.from({ length: 41 }, (_, i) => i))).toMatch(/最多 40/);
    expect(() => buildTree(7, [1])).toThrow();
    expect(buildTree(4, []).nodes).toEqual([{ id: 'root', level: 0, keys: [], leaf: true, children: [] }]);
  });
});

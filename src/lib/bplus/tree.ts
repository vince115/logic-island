/*
 * Phase F.1c B+ tree engine (DB11): a teaching B+ tree of integer keys built by inserting keys one by one, with the
 * search path of a key and the leaves a range query walks along the leaf chain. Pure functions, shared by the lesson
 * page (query-plan activity) and the tests, so every tree the page draws is computed, never typed in.
 *
 * Order m: a node has at most m children, so at most m − 1 keys. A full leaf splits into ⌈m/2⌉ and the rest, and the
 * right leaf's first key is copied up; a full internal node splits around its middle key, which moves up. Separators
 * follow "left < key ≤ right": a key equal to a separator is found in the right subtree. Keys are unique (an index on
 * a unique column); inserting a key that exists changes nothing.
 */

export const MIN_ORDER = 3;
export const MAX_ORDER = 6;
export const MAX_KEYS = 40;

interface Leaf { leaf: true; keys: number[]; next?: Leaf }
interface Inner { leaf: false; keys: number[]; children: Node[] }
type Node = Leaf | Inner;

/** A node as drawn: its level (0 = root), its keys, and for leaves the next leaf in key order. */
export interface TreeNode { id: string; level: number; keys: number[]; leaf: boolean; children: string[]; next?: string }
export interface BPlusTree { order: number; root: string; nodes: TreeNode[]; height: number; keyCount: number }

function insert(root: Node, key: number, order: number): Node {
  const split = insertInto(root, key, order);
  return split ? { leaf: false, keys: [split.up], children: [root, split.right] } : root;
}

/** Inserts into a subtree; a node that overflowed returns the key going up and its new right sibling. */
function insertInto(node: Node, key: number, order: number): { up: number; right: Node } | undefined {
  if (node.leaf) {
    if (node.keys.includes(key)) return undefined;
    node.keys.push(key);
    node.keys.sort((a, b) => a - b);
    if (node.keys.length < order) return undefined;
    const cut = Math.ceil(node.keys.length / 2);
    const right: Leaf = { leaf: true, keys: node.keys.slice(cut), next: node.next };
    node.keys = node.keys.slice(0, cut);
    node.next = right;
    return { up: right.keys[0], right };
  }
  const i = node.keys.filter(k => k <= key).length;
  const split = insertInto(node.children[i], key, order);
  if (!split) return undefined;
  node.keys.splice(i, 0, split.up);
  node.children.splice(i + 1, 0, split.right);
  if (node.keys.length < order) return undefined;
  const mid = Math.floor(node.keys.length / 2);
  const right: Inner = { leaf: false, keys: node.keys.slice(mid + 1), children: node.children.slice(mid + 1) };
  const up = node.keys[mid];
  node.keys = node.keys.slice(0, mid);
  node.children = node.children.slice(0, mid + 1);
  return { up, right };
}

/** Checks the inputs the page accepts from a learner: integers 0..999, at most MAX_KEYS, order MIN..MAX_ORDER. */
export function validateInput(order: number, keys: readonly number[]): string | undefined {
  if (!Number.isInteger(order) || order < MIN_ORDER || order > MAX_ORDER) return `階數要是 ${MIN_ORDER} 到 ${MAX_ORDER} 的整數。`;
  if (keys.length > MAX_KEYS) return `最多 ${MAX_KEYS} 個鍵。`;
  if (keys.some(k => !Number.isInteger(k) || k < 0 || k > 999)) return '鍵要是 0 到 999 的整數。';
  return undefined;
}

/** The tree after inserting `keys` in order, with nodes numbered level by level, left to right. */
export function buildTree(order: number, keys: readonly number[]): BPlusTree {
  const problem = validateInput(order, keys);
  if (problem) throw new Error(problem);
  let root: Node = { leaf: true, keys: [] };
  for (const k of keys) root = insert(root, k, order);
  const ids = new Map<Node, string>(), nodes: TreeNode[] = [];
  let level: Node[] = [root], depth = 0;
  while (level.length) {
    level.forEach((n, i) => ids.set(n, depth === 0 ? 'root' : `L${depth}-${i + 1}`));
    level = level.flatMap(n => n.leaf ? [] : n.children);
    depth++;
  }
  const walk = (n: Node, d: number) => {
    nodes.push({ id: ids.get(n)!, level: d, keys: [...n.keys], leaf: n.leaf, children: n.leaf ? [] : n.children.map(c => ids.get(c)!),
      ...(n.leaf && n.next ? { next: ids.get(n.next) } : {}) });
    if (!n.leaf) n.children.forEach(c => walk(c, d + 1));
  };
  walk(root, 0);
  nodes.sort((a, b) => a.level - b.level || Number(a.id.split('-')[1] ?? 0) - Number(b.id.split('-')[1] ?? 0));
  return { order, root: 'root', nodes, height: depth, keyCount: nodes.filter(n => n.leaf).reduce((s, n) => s + n.keys.length, 0) };
}

const byId = (tree: BPlusTree) => new Map(tree.nodes.map(n => [n.id, n]));

/** The nodes visited from the root to the leaf that holds (or would hold) `key`, and whether it is there. */
export function search(tree: BPlusTree, key: number): { path: string[]; found: boolean } {
  const nodes = byId(tree), path: string[] = [];
  let node = nodes.get(tree.root)!;
  for (;;) {
    path.push(node.id);
    if (node.leaf) return { path, found: node.keys.includes(key) };
    node = nodes.get(node.children[node.keys.filter(k => k <= key).length])!;
  }
}

/** A range query lo ≤ key ≤ hi: down to the first leaf, then along the leaf chain until a key passes hi. */
export function range(tree: BPlusTree, lo: number, hi: number): { path: string[]; leaves: string[]; keys: number[] } {
  const nodes = byId(tree), { path } = search(tree, lo), leaves: string[] = [], keys: number[] = [];
  let leaf: TreeNode | undefined = nodes.get(path.at(-1)!);
  while (leaf) {
    leaves.push(leaf.id);
    keys.push(...leaf.keys.filter(k => k >= lo && k <= hi));
    if (leaf.keys.some(k => k > hi) || !leaf.next) break;
    leaf = nodes.get(leaf.next);
  }
  return { path, leaves, keys };
}

/** The tree's own rules (tested): sorted keys, key counts within the order, every leaf at the same depth, separators. */
export function checkTree(tree: BPlusTree): string[] {
  const problems: string[] = [], nodes = byId(tree);
  const leafDepths = new Set(tree.nodes.filter(n => n.leaf).map(n => n.level));
  if (leafDepths.size > 1) problems.push('leaves at different depths');
  for (const n of tree.nodes) {
    if (n.keys.some((k, i) => i > 0 && k <= n.keys[i - 1])) problems.push(`${n.id}: keys not increasing`);
    if (n.keys.length > tree.order - 1) problems.push(`${n.id}: too many keys`);
    if (!n.leaf && n.children.length !== n.keys.length + 1) problems.push(`${n.id}: children ≠ keys + 1`);
    if (!n.leaf) n.children.forEach((c, i) => {
      const keys = collect(nodes, c);
      if (i > 0 && keys.some(k => k < n.keys[i - 1])) problems.push(`${n.id}: child ${i} has a key below its separator`);
      if (i < n.keys.length && keys.some(k => k >= n.keys[i])) problems.push(`${n.id}: child ${i} has a key at or above the next separator`);
    });
  }
  const chain: number[] = [];
  for (let leaf = tree.nodes.find(n => n.leaf && n.level === Math.max(...leafDepths)); leaf; leaf = leaf.next ? nodes.get(leaf.next) : undefined) chain.push(...leaf.keys);
  if (chain.some((k, i) => i > 0 && k <= chain[i - 1]) || chain.length !== tree.keyCount) problems.push('leaf chain is not all keys in order');
  return problems;
}
function collect(nodes: Map<string, TreeNode>, id: string): number[] {
  const n = nodes.get(id)!;
  return n.leaf ? n.keys : n.children.flatMap(c => collect(nodes, c));
}

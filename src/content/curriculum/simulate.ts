import type { Mark, TraceStep, TreeNode } from './schema';

/*
 * Phase E.3: trace steps for the data-structure visualizations, produced by actually running the operations on a
 * small implementation of each structure. A lesson lists its operations (each with the line of its code it belongs
 * to); the steps can then never disagree with how the structure behaves. tests/simulate.test.ts checks each one.
 */
type At = { line: number };

// ---- stack, queue, deque ------------------------------------------------------------------------------------------
export type ContainerOp = At & (
  | { op: 'push' | 'push_back' | 'push_front'; value: string }
  | { op: 'pop' | 'pop_back' | 'pop_front' | 'top' | 'front' | 'back' | 'empty' | 'size' }
);
const KIND_NAMES = { stack: '堆疊', queue: '佇列', deque: '雙端佇列' } as const;

/**
 * A stack (push / pop / top at the end), a queue (push at the back, pop at the front) or a deque (both ends).
 * Removing or reading from an empty one is an underflow: the step says so and nothing changes.
 */
export function containerSteps(name: string, kind: 'stack' | 'queue' | 'deque', ops: ContainerOp[], start: string[] = []): TraceStep[] {
  const items = [...start];
  const steps: TraceStep[] = [];
  const snap = (line: number, note: string, marks: { at: number; kind: Mark }[] = [], vars?: Record<string, string>, underflow = false) =>
    steps.push({ line, note, containers: [{ name, kind, items: [...items], marks, underflow }], ...(vars ? { vars } : {}) });
  for (const o of ops) {
    const end = kind === 'stack' ? '頂端' : '尾端';
    const empty = items.length === 0;
    const under = (what: string) => snap(o.line, `${what}：${KIND_NAMES[kind]}是空的，沒有元素可以${what.includes('pop') ? '移除' : '讀取'}（underflow）。實際程式中要先檢查是否為空。`, [], undefined, true);
    switch (o.op) {
      case 'push': case 'push_back':
        items.push(o.value);
        snap(o.line, `${o.op} ${o.value}：放到${end}，大小變成 ${items.length}。`, [{ at: items.length - 1, kind: 'write' }]);
        break;
      case 'push_front':
        items.unshift(o.value);
        snap(o.line, `push_front ${o.value}：放到前端，大小變成 ${items.length}。`, [{ at: 0, kind: 'write' }]);
        break;
      case 'pop': {
        if (empty) { under('pop'); break; }
        const v = kind === 'queue' ? items.shift()! : items.pop()!;
        snap(o.line, kind === 'queue' ? `pop：從前端移除最早進入的 ${v}（先進先出）。` : `pop：從頂端移除最後放入的 ${v}（後進先出）。`, [], { 取出: v });
        break;
      }
      case 'pop_back': {
        if (empty) { under('pop_back'); break; }
        const v = items.pop()!;
        snap(o.line, `pop_back：從尾端移除 ${v}。`, [], { 取出: v });
        break;
      }
      case 'pop_front': {
        if (empty) { under('pop_front'); break; }
        const v = items.shift()!;
        snap(o.line, `pop_front：從前端移除 ${v}。`, [], { 取出: v });
        break;
      }
      case 'top': case 'back': {
        if (empty) { under(o.op); break; }
        snap(o.line, `${o.op}：讀取${kind === 'stack' ? '頂端' : '尾端'}的 ${items.at(-1)}，不移除。`, [{ at: items.length - 1, kind: 'read' }], { [o.op]: items.at(-1)! });
        break;
      }
      case 'front': {
        if (empty) { under('front'); break; }
        snap(o.line, `front：讀取前端的 ${items[0]}，不移除。`, [{ at: 0, kind: 'read' }], { front: items[0] });
        break;
      }
      case 'empty': snap(o.line, `empty：目前${empty ? '是空的' : `有 ${items.length} 個元素`}。`, [], { 'empty()': String(empty) }); break;
      case 'size': snap(o.line, `size：${items.length}。`, [], { 'size()': String(items.length) }); break;
    }
  }
  return steps;
}

// ---- dynamic array -------------------------------------------------------------------------------------------------
export type ArrayOp = At & ({ op: 'push_back'; value: string } | { op: 'insert'; index: number; value: string } | { op: 'erase'; index: number } | { op: 'get'; index: number });

/** A dynamic array that doubles its capacity when full; inserting and erasing in the middle shift the elements after. */
export function dynamicArraySteps(name: string, ops: ArrayOp[], capacity = 1, start: string[] = []): TraceStep[] {
  const a = [...start];
  let cap = Math.max(capacity, a.length);
  const steps: TraceStep[] = [];
  const snap = (line: number, note: string, marks: { at: number; kind: Mark }[] = [], vars: Record<string, string> = {}) =>
    steps.push({ line, note, arrays: [{ name, cells: [...a], marks, capacity: cap }], vars: { size: String(a.length), capacity: String(cap), ...vars } });
  const grow = (line: number) => {
    if (a.length < cap) return;
    const old = cap;
    cap = Math.max(1, cap * 2);
    snap(line, `容量已滿（size = capacity = ${old}）：配置容量 ${cap} 的新空間，把 ${a.length} 個元素逐一複製過去，再釋放舊空間。這一步是 O(n)。`, a.map((_, i) => ({ at: i, kind: 'write' as Mark })));
  };
  for (const o of ops) {
    if (o.op === 'push_back') {
      grow(o.line);
      a.push(o.value);
      snap(o.line, `push_back ${o.value}：放在索引 ${a.length - 1}。不需要擴容時是 O(1)。`, [{ at: a.length - 1, kind: 'write' }]);
    } else if (o.op === 'insert') {
      if (o.index < 0 || o.index > a.length) { snap(o.line, `insert 位置 ${o.index} 不合法：只能插在 0～${a.length}。`, [{ at: o.index, kind: 'bad' }]); continue; }
      grow(o.line);
      const moved = a.length - o.index;
      a.splice(o.index, 0, o.value);
      snap(o.line, `insert(${o.index}, ${o.value})：索引 ${o.index} 之後的 ${moved} 個元素各往後移一格，再放入 ${o.value}。移動次數與 n 成正比，O(n)。`,
        a.map((_, i) => ({ at: i, kind: i === o.index ? 'write' as Mark : 'read' as Mark })).filter(m => m.at >= o.index));
    } else if (o.op === 'erase') {
      if (o.index < 0 || o.index >= a.length) { snap(o.line, `erase(${o.index}) 越界：合法索引是 0～${a.length - 1}。`, [{ at: o.index, kind: 'bad' }]); continue; }
      const [v] = a.splice(o.index, 1);
      snap(o.line, `erase(${o.index})：移除 ${v}，後面的 ${a.length - o.index} 個元素各往前移一格。容量不變。`, a.map((_, i) => ({ at: i, kind: 'write' as Mark })).filter(m => m.at >= o.index), { 移除: v });
    } else {
      if (o.index < 0 || o.index >= a.length) snap(o.line, `get(${o.index}) 越界：合法索引是 0～${a.length - 1}（容量 ${cap} 以內但超過 size 的格子也不能讀）。`, [{ at: o.index, kind: 'bad' }]);
      else snap(o.line, `get(${o.index})：直接算出位置讀取 ${a[o.index]}，O(1)。`, [{ at: o.index, kind: 'read' }], { [`a[${o.index}]`]: a[o.index] });
    }
  }
  return steps;
}

// ---- singly linked list --------------------------------------------------------------------------------------------
export type ListOp = At & ({ op: 'push_front' | 'push_back'; value: string } | { op: 'find' | 'remove'; value: string } | { op: 'insert_after'; target: string; value: string });

/** A singly linked list with only a head pointer: reaching the tail or a value means walking node by node. */
export function linkedListSteps(name: string, ops: ListOp[], start: string[] = []): TraceStep[] {
  const nodes = [...start];
  const steps: TraceStep[] = [];
  const snap = (line: number, note: string, marks: { at: number; kind: Mark }[] = [], pointers: Record<string, number | null> = {}) =>
    steps.push({ line, note, list: { name, nodes: [...nodes], marks, pointers: { head: nodes.length ? 0 : null, ...pointers } } });
  /** Walks from head; returns the index of value, or -1, adding one step per node visited. */
  const walk = (line: number, value: string, withPrev = false) => {
    for (let i = 0; i < nodes.length; ++i) {
      const hit = nodes[i] === value;
      snap(line, hit ? `cur 指向 ${nodes[i]}：找到了。` : `cur 指向 ${nodes[i]}，不是 ${value}，沿著 next 往下一個節點。`, [{ at: i, kind: hit ? 'found' : 'read' }],
        withPrev ? { prev: i > 0 ? i - 1 : null, cur: i } : { cur: i });
      if (hit) return i;
    }
    snap(line, `cur 走到 null（串列的結尾）：找不到 ${value}。`, [], { cur: null });
    return -1;
  };
  for (const o of ops) {
    if (o.op === 'push_front') {
      nodes.unshift(o.value);
      snap(o.line, `push_front ${o.value}：新節點的 next 指向原本的第一個節點，head 改指向新節點。O(1)。`, [{ at: 0, kind: 'write' }]);
    } else if (o.op === 'push_back') {
      for (let i = 0; i < nodes.length; ++i) snap(o.line, `沒有 tail 指標，要從 head 走到最後一個節點（目前在 ${nodes[i]}）。`, [{ at: i, kind: 'read' }], { cur: i });
      nodes.push(o.value);
      snap(o.line, `push_back ${o.value}：最後一個節點的 next 指向新節點，新節點的 next 是 null。只有 head 時 O(n)，多記一個 tail 指標可降為 O(1)。`, [{ at: nodes.length - 1, kind: 'write' }]);
    } else if (o.op === 'find') {
      walk(o.line, o.value);
    } else if (o.op === 'insert_after') {
      const i = walk(o.line, o.target);
      if (i < 0) continue;
      nodes.splice(i + 1, 0, o.value);
      snap(o.line, `在 ${o.target} 之後插入 ${o.value}：新節點的 next 指向 ${o.target} 原本的下一個，${o.target} 的 next 改指向新節點。只改兩個指標，O(1)（找到位置之後）。`, [{ at: i + 1, kind: 'write' }], { cur: i });
    } else {
      const i = walk(o.line, o.value, true);
      if (i < 0) continue;
      nodes.splice(i, 1);
      snap(o.line, i === 0 ? `移除 ${o.value}：它是第一個節點，head 改指向下一個節點。` : `移除 ${o.value}：前一個節點的 next 改指向 ${o.value} 的下一個，${o.value} 就不在串列中了。`, [], i > 0 ? { prev: i - 1 } : {});
    }
  }
  return steps;
}

// ---- hash table with separate chaining -----------------------------------------------------------------------------
export type HashOp = At & ({ op: 'put'; key: string | number; value: string } | { op: 'add' | 'get' | 'contains' | 'remove'; key: string | number });
/** The lessons' illustrative hash: an integer modulo m (non-negative), or the sum of a string's character codes modulo m. */
export function bucketOf(key: string | number, m: number) {
  const h = typeof key === 'number' ? key : [...key].reduce((s, c) => s + c.charCodeAt(0), 0);
  return ((h % m) + m) % m;
}
const hashText = (key: string | number, m: number) => typeof key === 'number' ? `${key} mod ${m} = ${bucketOf(key, m)}` : `字元碼總和 mod ${m} = ${bucketOf(key, m)}`;

/** A map (key:value) or a set (keys only) over m buckets; a key goes to bucket hash(key) and is searched along that chain. */
export function hashSteps(name: string, m: number, mode: 'map' | 'set', ops: HashOp[]): TraceStep[] {
  const buckets: { key: string | number; value?: string }[][] = Array.from({ length: m }, () => []);
  const steps: TraceStep[] = [];
  const label = (e: { key: string | number; value?: string }) => mode === 'map' ? `${e.key}:${e.value}` : String(e.key);
  const snap = (line: number, note: string, marks: { bucket: number; index?: number; kind: Mark }[] = [], vars: Record<string, string> = {}) => {
    const size = buckets.reduce((n, b) => n + b.length, 0);
    steps.push({ line, note, buckets: { name, buckets: buckets.map(b => b.map(label)), marks }, vars: { size: String(size), 負載因子: (size / m).toFixed(2), ...vars } });
  };
  for (const o of ops) {
    const b = bucketOf(o.key, m), chain = buckets[b], i = chain.findIndex(e => e.key === o.key);
    const where = `hash(${JSON.stringify(o.key)})：${hashText(o.key, m)} → 桶 ${b}。`;
    if (o.op === 'put' || o.op === 'add') {
      if (i >= 0) {
        if (o.op === 'put') { chain[i].value = o.value; snap(o.line, `${where}鍵已存在：更新它的值為 ${o.value}，不新增。`, [{ bucket: b, index: i, kind: 'write' }]); }
        else snap(o.line, `${where}${o.key} 已在集合中：集合不存重複元素，不變。`, [{ bucket: b, index: i, kind: 'read' }]);
        continue;
      }
      const collision = chain.length > 0;
      chain.push(o.op === 'put' ? { key: o.key, value: o.value } : { key: o.key });
      snap(o.line, `${where}${collision ? `桶 ${b} 已經有元素（碰撞）：接在這個桶的串列後面。` : '放進這個桶。'}`, [{ bucket: b, index: chain.length - 1, kind: 'write' }]);
    } else if (o.op === 'remove') {
      if (i < 0) { snap(o.line, `${where}這個桶裡沒有 ${o.key}，不變。`, [{ bucket: b, kind: 'read' }]); continue; }
      chain.splice(i, 1);
      snap(o.line, `${where}在桶 ${b} 的串列中找到並移除 ${o.key}。`, [{ bucket: b, kind: 'removed' }]);
    } else {
      const found = i >= 0;
      snap(o.line, `${where}只在桶 ${b} 的串列中比對${chain.length ? `（${chain.length} 個元素）` : '（空的）'}：${found ? `找到 ${label(chain[i])}` : `沒有 ${o.key}`}。`,
        found ? [{ bucket: b, index: i, kind: 'found' }] : [{ bucket: b, kind: 'read' }],
        { [`${o.op}(${JSON.stringify(o.key)})`]: o.op === 'get' ? (found ? String(chain[i].value) : '不存在') : String(found) });
    }
  }
  return steps;
}

// ---- trees -------------------------------------------------------------------------------------------------------
/** A binary tree from nested [label, left, right] tuples, with ids n0, n1, ... in preorder. */
export type Shape = [string, Shape | null, Shape | null] | [string];
export function binaryTree(shape: Shape): { nodes: TreeNode[]; root: string } {
  const nodes: TreeNode[] = [];
  const build = (s: Shape | null): string | null => {
    if (!s) return null;
    const id = `n${nodes.length}`;
    const node: TreeNode = { id, label: s[0], left: null, right: null };
    nodes.push(node);
    node.left = build(s[1] ?? null);
    node.right = build(s[2] ?? null);
    return id;
  };
  return { nodes, root: build(shape)! };
}

/** Preorder, inorder, postorder (recursive) or level order (with a queue) over a binary tree, one step per visit. */
export function traversalSteps(name: string, shape: Shape, order: 'pre' | 'in' | 'post' | 'level', line: number): TraceStep[] {
  const { nodes, root } = binaryTree(shape);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const steps: TraceStep[] = [];
  const done: string[] = [];
  const visit = (id: string, queue?: string[]) => {
    done.push(id);
    const output = done.map(d => byId.get(d)!.label).join(' ');
    steps.push({ line, note: `拜訪 ${byId.get(id)!.label}，輸出序列：${output}`, output,
      tree: { name, nodes, roots: [root], marks: done.map(d => ({ id: d, kind: (d === id ? 'current' : 'visited') as Mark })) },
      ...(queue ? { containers: [{ name: '佇列', kind: 'queue' as const, items: queue.map(q => byId.get(q)!.label) }] } : {}) });
  };
  if (order === 'level') {
    const queue = [root];
    steps.push({ line, note: `把根 ${byId.get(root)!.label} 放進佇列。`, tree: { name, nodes, roots: [root], marks: [] }, containers: [{ name: '佇列', kind: 'queue', items: [byId.get(root)!.label] }] });
    while (queue.length) {
      const id = queue.shift()!, n = byId.get(id)!;
      for (const c of [n.left, n.right]) if (c) queue.push(c);
      visit(id, [...queue]);
    }
  } else {
    const go = (id: string | null | undefined) => {
      if (!id) return;
      const n = byId.get(id)!;
      if (order === 'pre') visit(id);
      go(n.left);
      if (order === 'in') visit(id);
      go(n.right);
      if (order === 'post') visit(id);
    };
    go(root);
  }
  return steps;
}

export type BstOp = At & { op: 'insert' | 'search' | 'remove'; value: number };
/** A binary search tree of distinct numbers: every step compares at one node and goes left or right. */
export function bstSteps(name: string, ops: BstOp[], start: number[] = []): TraceStep[] {
  type N = { id: string; v: number; left: N | null; right: N | null };
  let root: N | null = null, next = 0;
  const steps: TraceStep[] = [];
  const make = (v: number): N => ({ id: `b${next++}`, v, left: null, right: null });
  const insertQuiet = (v: number) => { if (!root) { root = make(v); return; } let c: N = root; for (;;) { if (v === c.v) return; const side = v < c.v ? 'left' : 'right'; if (!c[side]) { c[side] = make(v); return; } c = c[side]!; } };
  start.forEach(insertQuiet);
  const nodes = (): TreeNode[] => { const out: TreeNode[] = []; const go = (n: N | null) => { if (!n) return; out.push({ id: n.id, label: String(n.v), left: n.left?.id ?? null, right: n.right?.id ?? null }); go(n.left); go(n.right); }; go(root); return out; };
  const snap = (line: number, note: string, marks: { id: string; kind: Mark }[] = [], vars?: Record<string, string>) =>
    steps.push({ line, note, tree: { name, nodes: nodes(), roots: root ? [root.id] : [], marks }, ...(vars ? { vars } : {}) });
  for (const o of ops) {
    let parent: N | null = null, cur: N | null = root;
    while (cur && cur.v !== o.value) {
      const side = o.value < cur.v ? 'left' : 'right';
      snap(o.line, `${o.value} ${o.value < cur.v ? '<' : '>'} ${cur.v}：往${side === 'left' ? '左' : '右'}子樹。`, [{ id: cur.id, kind: 'read' }]);
      parent = cur;
      cur = cur[side];
    }
    if (o.op === 'insert') {
      if (cur) { snap(o.line, `${o.value} 已在樹中：BST 不存重複值，不插入。`, [{ id: cur.id, kind: 'found' }]); continue; }
      const n = make(o.value);
      if (!parent) root = n; else parent[o.value < parent.v ? 'left' : 'right'] = n;
      snap(o.line, `走到空的位置，在這裡放入新的葉子 ${o.value}。`, [{ id: n.id, kind: 'write' }]);
    } else if (o.op === 'search') {
      snap(o.line, cur ? `找到 ${o.value}。比較次數等於所在深度 + 1。` : `走到空的位置：樹中沒有 ${o.value}。`, cur ? [{ id: cur.id, kind: 'found' }] : [], { [`search(${o.value})`]: String(!!cur) });
    } else {
      if (!cur) { snap(o.line, `樹中沒有 ${o.value}，不變。`); continue; }
      const replace = (child: N | null) => { if (!parent) root = child; else if (parent.left === cur) parent.left = child; else parent.right = child; };
      if (cur.left && cur.right) {
        snap(o.line, `${o.value} 有兩個孩子：找右子樹中最小的節點（後繼）來取代它。`, [{ id: cur.id, kind: 'read' }]);
        let sp: N = cur, s: N = cur.right;
        while (s.left) { snap(o.line, `後繼要往左找：經過 ${s.v}。`, [{ id: s.id, kind: 'read' }]); sp = s; s = s.left; }
        cur.v = s.v;
        if (sp.left === s) sp.left = s.right; else sp.right = s.right;
        snap(o.line, `把後繼 ${s.v} 的值搬到被刪除的位置，再移除原本的後繼節點（它最多只有右孩子）。`, [{ id: cur.id, kind: 'write' }]);
      } else {
        replace(cur.left ?? cur.right);
        snap(o.line, cur.left || cur.right ? `${o.value} 只有一個孩子：讓孩子接到它的位置。` : `${o.value} 是葉子：直接移除。`, []);
      }
    }
  }
  return steps;
}

// ---- binary heap ---------------------------------------------------------------------------------------------------
export type HeapOp = At & ({ op: 'push'; value: number } | { op: 'pop' | 'top' });
/** A binary min-heap stored in an array: children of i are 2i + 1 and 2i + 2, each parent ≤ its children. */
export function heapSteps(name: string, ops: HeapOp[], start: number[] = []): TraceStep[] {
  const h = [...start];
  const steps: TraceStep[] = [];
  const snap = (line: number, note: string, marks: { at: number; kind: Mark }[] = [], vars?: Record<string, string>) => {
    const nodes: TreeNode[] = h.map((v, i) => ({ id: `h${i}`, label: String(v), left: 2 * i + 1 < h.length ? `h${2 * i + 1}` : null, right: 2 * i + 2 < h.length ? `h${2 * i + 2}` : null }));
    steps.push({ line, note, arrays: [{ name, cells: h.map(String), marks }], tree: { name: `${name}（以樹呈現）`, nodes, roots: h.length ? ['h0'] : [], marks: marks.filter(m => m.at < h.length).map(m => ({ id: `h${m.at}`, kind: m.kind })) }, ...(vars ? { vars } : {}) });
  };
  for (const o of ops) {
    if (o.op === 'push') {
      h.push(o.value);
      let i = h.length - 1;
      snap(o.line, `push ${o.value}：先放在陣列最後（樹的最下層最左邊的空位）。`, [{ at: i, kind: 'write' }]);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (h[p] <= h[i]) { snap(o.line, `父節點 ${h[p]} ≤ ${h[i]}：滿足堆積性質，上浮結束。`, [{ at: i, kind: 'read' }, { at: p, kind: 'read' }]); break; }
        [h[p], h[i]] = [h[i], h[p]];
        snap(o.line, `父節點 ${h[i]} > ${h[p]}：交換，${h[p]} 往上浮一層（索引 ${i} → ${p}）。`, [{ at: p, kind: 'write' }, { at: i, kind: 'write' }]);
        i = p;
      }
    } else if (o.op === 'top') {
      if (!h.length) snap(o.line, 'top：堆積是空的，沒有最小值。', []);
      else snap(o.line, `top：最小值永遠在根（索引 0）：${h[0]}。O(1)。`, [{ at: 0, kind: 'read' }], { top: String(h[0]) });
    } else {
      if (!h.length) { snap(o.line, 'pop：堆積是空的，不能移除。', []); continue; }
      const min = h[0], last = h.pop()!;
      if (!h.length) { snap(o.line, `pop：取出 ${min}，堆積變成空的。`, [], { 取出: String(min) }); continue; }
      h[0] = last;
      snap(o.line, `pop：取出根的 ${min}，把最後一個元素 ${last} 搬到根。`, [{ at: 0, kind: 'write' }], { 取出: String(min) });
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let c = l;
        if (l >= h.length) { snap(o.line, `${h[i]} 沒有孩子：下沉結束。`, [{ at: i, kind: 'read' }]); break; }
        if (r < h.length && h[r] < h[l]) c = r;
        if (h[i] <= h[c]) { snap(o.line, `${h[i]} ≤ 較小的孩子 ${h[c]}：滿足堆積性質，下沉結束。`, [{ at: i, kind: 'read' }, { at: c, kind: 'read' }]); break; }
        [h[i], h[c]] = [h[c], h[i]];
        snap(o.line, `${h[c]} > 較小的孩子 ${h[i]}：交換，往下沉一層（索引 ${i} → ${c}）。`, [{ at: i, kind: 'write' }, { at: c, kind: 'write' }]);
        i = c;
      }
    }
  }
  return steps;
}

// ---- graphs --------------------------------------------------------------------------------------------------------
export type GraphOp = At & ({ op: 'edge'; from: string; to: string; weight?: number } | { op: 'neighbors'; node: string } | { op: 'has_edge'; from: string; to: string });
/** A graph built edge by edge, shown as adjacency list (and matrix); queries read one node's list or one cell. */
export function graphSteps(name: string, nodes: string[], directed: boolean, ops: GraphOp[], show: ('list' | 'matrix')[] = ['list', 'matrix']): TraceStep[] {
  const edges: { from: string; to: string; weight?: number }[] = [];
  const steps: TraceStep[] = [];
  const snap = (line: number, note: string, marks: { node?: string; edge?: number; kind: Mark }[] = [], vars?: Record<string, string>) =>
    steps.push({ line, note, graph: { name, nodes, edges: edges.map(e => ({ ...e })), directed, marks, show }, ...(vars ? { vars } : {}) });
  const neighbours = (n: string) => edges.flatMap((e, i) => e.from === n ? [{ to: e.to, i }] : !directed && e.to === n ? [{ to: e.from, i }] : []);
  for (const o of ops) {
    if (o.op === 'edge') {
      edges.push({ from: o.from, to: o.to, ...(o.weight !== undefined ? { weight: o.weight } : {}) });
      const w = o.weight !== undefined ? `（權重 ${o.weight}）` : '';
      snap(o.line, directed ? `加入有向邊 ${o.from} → ${o.to}${w}：只在 ${o.from} 的串列加入 ${o.to}，矩陣只設定 [${o.from}][${o.to}]。` : `加入無向邊 ${o.from} – ${o.to}${w}：${o.from} 的串列加入 ${o.to}，${o.to} 的串列也加入 ${o.from}；矩陣的 [${o.from}][${o.to}] 與 [${o.to}][${o.from}] 都要設定。`,
        [{ edge: edges.length - 1, kind: 'write' }, { node: o.from, kind: 'write' }, { node: o.to, kind: 'write' }]);
    } else if (o.op === 'neighbors') {
      const ns = neighbours(o.node);
      snap(o.line, `列出 ${o.node} 的鄰居：串列直接走過 ${ns.length} 個元素（O(度數)）；矩陣則要掃過一整列（O(V)）。`,
        [{ node: o.node, kind: 'read' }, ...ns.map(n => ({ node: n.to, kind: 'found' as Mark })), ...ns.map(n => ({ edge: n.i, kind: 'read' as Mark }))], { [`neighbors(${o.node})`]: ns.map(n => n.to).join(' ') || '（沒有）' });
    } else {
      const i = edges.findIndex(e => (e.from === o.from && e.to === o.to) || (!directed && e.from === o.to && e.to === o.from));
      snap(o.line, `${o.from} 和 ${o.to} 之間有沒有邊？矩陣直接看一格（O(1)）；串列要走過 ${o.from} 的鄰居（O(度數)）。答案：${i >= 0 ? '有' : '沒有'}。`,
        [{ node: o.from, kind: 'read' }, { node: o.to, kind: 'read' }, ...(i >= 0 ? [{ edge: i, kind: 'found' as Mark }] : [])], { [`has_edge(${o.from}, ${o.to})`]: String(i >= 0) });
    }
  }
  return steps;
}

// ---- union-find ----------------------------------------------------------------------------------------------------
export type DsuOp = At & ({ op: 'union'; a: number; b: number } | { op: 'find'; a: number } | { op: 'connected'; a: number; b: number });
/** Union-find with path compression and union by size; every find shows its path, then the compression. */
export function dsuSteps(n: number, ops: DsuOp[]): TraceStep[] {
  const parent = Array.from({ length: n }, (_, i) => i), size = Array(n).fill(1);
  const steps: TraceStep[] = [];
  const snap = (line: number, note: string, marks: { at: number; kind: Mark }[] = [], vars?: Record<string, string>) =>
    steps.push({ line, note, dsu: { parent: [...parent], size: [...size], marks }, ...(vars ? { vars } : {}) });
  const find = (line: number, a: number) => {
    const path = [a];
    while (parent[path.at(-1)!] !== path.at(-1)!) path.push(parent[path.at(-1)!]);
    const root = path.at(-1)!;
    snap(line, `find(${a})：沿著 parent 往上走 ${path.join(' → ')}，根是 ${root}。`, path.map(p => ({ at: p, kind: (p === root ? 'found' : 'read') as Mark })));
    const changed = path.slice(0, -1).filter(p => parent[p] !== root);
    if (changed.length) {
      for (const p of changed) parent[p] = root;
      snap(line, `路徑壓縮：讓 ${changed.join('、')} 直接指向根 ${root}，下次 find 只要一步。`, changed.map(p => ({ at: p, kind: 'write' as Mark })));
    }
    return root;
  };
  for (const o of ops) {
    if (o.op === 'find') { const r = find(o.line, o.a); steps.at(-1)!.vars = { [`find(${o.a})`]: String(r) }; continue; }
    const ra = find(o.line, o.a), rb = find(o.line, o.b);
    if (o.op === 'connected') { snap(o.line, `${o.a} 與 ${o.b} 的根${ra === rb ? `都是 ${ra}：同一個集合` : `分別是 ${ra} 與 ${rb}：不同集合`}。`, [{ at: ra, kind: 'found' }, { at: rb, kind: 'found' }], { [`connected(${o.a}, ${o.b})`]: String(ra === rb) }); continue; }
    if (ra === rb) { snap(o.line, `${o.a} 與 ${o.b} 已在同一個集合（根 ${ra}），不必合併。`, [{ at: ra, kind: 'found' }]); continue; }
    const [big, small] = size[ra] >= size[rb] ? [ra, rb] : [rb, ra];
    parent[small] = big;
    size[big] += size[small];
    snap(o.line, `union：較小的集合（根 ${small}，大小 ${size[big] - size[small]}）接到較大的集合（根 ${big}）下面，新大小 ${size[big]}。`, [{ at: small, kind: 'write' }, { at: big, kind: 'write' }]);
  }
  return steps;
}

/** The forest of a union-find parent array, for drawing. */
export function dsuForest(parent: number[]): { nodes: TreeNode[]; roots: string[] } {
  const nodes: TreeNode[] = parent.map((_, i) => ({ id: `d${i}`, label: String(i), children: [] }));
  const roots: string[] = [];
  parent.forEach((p, i) => { if (p === i) roots.push(`d${i}`); else nodes[p].children!.push(`d${i}`); });
  return { nodes, roots };
}

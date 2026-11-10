import { generateSteps, defaultInput } from '@/lib/engine';
import type { Mark, TraceStep, TreeNode } from './schema';

/*
 * Phase E.4: trace steps for the algorithms island, produced by running the algorithm itself (like simulate.ts for the
 * data structures). Each simulator takes `lines`, the code line of each event of the lesson's own program; events
 * without one fall back to `lines.default` (or 1). tests/simulate-algorithms.test.ts checks every result against a
 * reference implementation. Bubble sort and exact binary search come from the labs' engine (src/lib/engine.ts).
 */
export type Lines = Record<string, number>;
const at = (lines: Lines | undefined, key: string) => lines?.[key] ?? lines?.default ?? 1;
const cells = (a: number[]) => a.map(String);
type ArrayPanel = NonNullable<TraceStep['arrays']>[number];
const marks = (kind: Mark, ...indices: number[]) => indices.map(i => ({ at: i, kind }));

// ---- search -------------------------------------------------------------------------------------------------------
/** Linear search for the first, the last or every position of target; comparisons are counted. */
export function linearSearchSteps(a: number[], target: number, mode: 'first' | 'last' | 'all' = 'first', lines?: Lines): TraceStep[] {
  const steps: TraceStep[] = [];
  const found: number[] = [];
  let compares = 0;
  const order = mode === 'last' ? a.map((_, i) => a.length - 1 - i) : a.map((_, i) => i);
  for (const i of order) {
    compares++;
    const hit = a[i] === target;
    if (hit) found.push(i);
    steps.push({ line: at(lines, 'compare'), note: `比較 a[${i}] = ${a[i]} 與目標 ${target}：${hit ? '相等' : '不相等'}。`,
      arrays: [{ name: 'a', cells: cells(a), marks: [...marks('found', ...found.filter(f => f !== i)), { at: i, kind: hit ? 'found' : 'read' }], pointers: { i } }],
      vars: { i: String(i), 比較次數: String(compares), ...(mode === 'all' ? { 找到: found.join(' ') || '（還沒有）' } : {}) } });
    if (hit && mode !== 'all') break;
  }
  const result = mode === 'all' ? (found.join(' ') || '-1') : String(found[0] ?? -1);
  steps.push({ line: at(lines, 'result'), note: found.length ? `${mode === 'all' ? `共找到 ${found.length} 個位置` : `回傳索引 ${found[0]}`}，比較了 ${compares} 次。` : `走完整個陣列都沒有 ${target}，回傳 −1；找不到是最差情況：比較了 n = ${a.length} 次。`,
    arrays: [{ name: 'a', cells: cells(a), marks: marks('found', ...found) }], vars: { 結果: result, 比較次數: String(compares) }, output: result });
  return steps;
}

/** Exact binary search, from the array lab's engine: [low, high] shrinks around mid until found or empty. */
export function binarySearchSteps(a: number[], target: number, lines?: Lines): TraceStep[] {
  return generateSteps('binary-search', { ...defaultInput, values: a, target }).map((s, k, all): TraceStep => {
    const range = s.frontier.length ? { from: Math.min(...s.frontier), to: Math.max(...s.frontier), label: '搜尋範圍' } : undefined;
    const mid = s.phase === 'compare' || s.phase === 'found' ? s.active[0] : undefined;
    const done = k === all.length - 1;
    return { line: at(lines, s.phase === 'compare' ? 'compare' : s.phase === 'found' || done ? 'result' : s.phase === 'ready' ? 'init' : 'narrow'), note: s.description,
      arrays: [{ name: 'a', cells: cells(s.values), marks: mid !== undefined ? [{ at: mid, kind: s.phase === 'found' ? 'found' : 'read' }] : [],
        ...(range ? { range } : s.phase === 'access' ? { range: { from: 0, to: -1, label: '搜尋範圍（空）' } } : {}), ...(mid !== undefined ? { pointers: { mid } } : {}) }],
      ...(range ? { vars: { low: String(range.from), high: String(range.to), ...(mid !== undefined ? { mid: String(mid) } : {}) } } : {}),
      ...(s.result ? { output: String(s.result[0]) } : {}) };
  });
}

/** lower_bound: the first index whose value is ≥ target (a.length if none), with the half-open range [lo, hi). */
export function lowerBoundSteps(a: number[], target: number, lines?: Lines): TraceStep[] {
  const steps: TraceStep[] = [];
  let lo = 0, hi = a.length;
  const snap = (line: number, note: string, m: { at: number; kind: Mark }[] = [], mid?: number) => steps.push({ line, note,
    arrays: [{ name: 'a', cells: cells(a), marks: m, range: { from: lo, to: hi - 1, label: '答案可能的位置 [lo, hi)' }, pointers: { lo, hi, ...(mid !== undefined ? { mid } : {}) } }],
    vars: { lo: String(lo), hi: String(hi), ...(mid !== undefined ? { mid: String(mid) } : {}) } });
  snap(at(lines, 'init'), `lo = 0、hi = n = ${a.length}：答案一定在 [lo, hi) 之內（hi = n 代表「全部都小於 ${target}」）。迴圈不變量：lo 左邊都 < ${target}，hi 以右（含）都 ≥ ${target}。`);
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (a[mid] < target) { lo = mid + 1; snap(at(lines, 'compare'), `a[${mid}] = ${a[mid]} < ${target}：mid 和它左邊都不是答案，lo = mid + 1 = ${lo}。`, [{ at: mid, kind: 'read' }], mid); }
    else { hi = mid; snap(at(lines, 'compare'), `a[${mid}] = ${a[mid]} ≥ ${target}：mid 可能就是答案，保留它，hi = mid = ${hi}。`, [{ at: mid, kind: 'read' }], mid); }
  }
  steps.push({ line: at(lines, 'result'), note: lo < a.length ? `lo = hi = ${lo}：第一個 ≥ ${target} 的是 a[${lo}] = ${a[lo]}。` : `lo = hi = n = ${lo}：所有元素都 < ${target}，回傳 n。`,
    arrays: [{ name: 'a', cells: cells(a), marks: lo < a.length ? [{ at: lo, kind: 'found' }] : [], pointers: { lo } }], vars: { 結果: String(lo) }, output: String(lo) });
  return steps;
}

// ---- sorting ------------------------------------------------------------------------------------------------------
type SortCount = { compares: number; moves: number };
const sortVars = (c: SortCount, moveName = '交換') => ({ 比較: String(c.compares), [moveName]: String(c.moves) });

/** Bubble sort, from the bubble-sort lab's engine (adjacent compare and swap, stops early after a pass with no swap). */
export function bubbleSortSteps(a: number[], lines?: Lines): TraceStep[] {
  const c: SortCount = { compares: 0, moves: 0 };
  const raw = generateSteps('bubble-sort', { ...defaultInput, values: a });
  return raw.map((s, k): TraceStep => {
    if (s.phase === 'compare') c.compares++;
    if (s.phase === 'swap') c.moves++;
    const last = k === raw.length - 1;
    return { line: at(lines, last ? 'result' : s.phase === 'ready' ? 'init' : s.phase), note: s.description,
      arrays: [{ name: 'a', cells: cells(s.values), marks: [...marks('visited', ...s.visited.filter(v => !s.active.includes(v))), ...marks(s.phase === 'swap' ? 'write' : 'read', ...s.active)] }],
      vars: sortVars(c), ...(last ? { output: s.values.join(' ') } : {}) };
  });
}

/** Selection sort: find the minimum of the unsorted part, swap it to the front (not stable). */
export function selectionSortSteps(input: number[], lines?: Lines): TraceStep[] {
  const a = [...input], c: SortCount = { compares: 0, moves: 0 }, steps: TraceStep[] = [];
  const snap = (key: string, note: string, m: { at: number; kind: Mark }[], pointers: Record<string, number>, i: number) =>
    steps.push({ line: at(lines, key), note, arrays: [{ name: 'a', cells: cells(a), marks: [...marks('visited', ...Array.from({ length: i }, (_, k) => k)), ...m], range: { from: i, to: a.length - 1, label: '未排序' }, pointers }], vars: sortVars(c) });
  for (let i = 0; i < a.length - 1; i++) {
    let min = i;
    for (let j = i + 1; j < a.length; j++) {
      c.compares++;
      if (a[j] < a[min]) min = j;
      snap('compare', `比較 a[${j}] = ${a[j]} 與目前的最小值：最小值是 a[${min}] = ${a[min]}${min === j ? '（剛更新）' : ''}。`, [{ at: j, kind: 'read' }, { at: min, kind: 'found' }], { i, j, min }, i);
    }
    if (min !== i) { [a[i], a[min]] = [a[min], a[i]]; c.moves++; }
    snap('swap', min !== i ? `把最小值 ${a[i]} 換到索引 ${i}；被換走的 ${a[min]} 跳到後面，可能越過相同的值，所以選擇排序不穩定。` : `a[${i}] 已經是最小值，不必交換。`, marks('write', i, min), { i, min }, i + 1);
  }
  steps.push({ line: at(lines, 'result'), note: `完成：比較 ${c.compares} 次（一定是 n(n−1)/2），交換 ${c.moves} 次（最多 n−1）。`, arrays: [{ name: 'a', cells: cells(a), marks: marks('visited', ...a.map((_, k) => k)) }], vars: sortVars(c), output: a.join(' ') });
  return steps;
}

/** Insertion sort: take the next value and shift larger ones right until its place is found (stable). */
export function insertionSortSteps(input: number[], lines?: Lines): TraceStep[] {
  const a = [...input], c: SortCount = { compares: 0, moves: 0 }, steps: TraceStep[] = [];
  const snap = (key: string, note: string, m: { at: number; kind: Mark }[], pointers: Record<string, number>, sorted: number, key_: number) =>
    steps.push({ line: at(lines, key), note, arrays: [{ name: 'a', cells: cells(a), marks: m, range: { from: 0, to: sorted - 1, label: '已排序' }, pointers }], vars: { key: String(key_), ...sortVars(c, '搬移') } });
  for (let i = 1; i < a.length; i++) {
    const key = a[i];
    let j = i - 1;
    snap('take', `取出 key = a[${i}] = ${key}，要插進左邊已排序的 ${i} 個元素中。`, [{ at: i, kind: 'read' }], { i }, i, key);
    while (j >= 0) {
      c.compares++;
      if (a[j] <= key) { snap('compare', `a[${j}] = ${a[j]} ≤ ${key}：停在這裡（相等時不越過，所以插入排序穩定）。`, [{ at: j, kind: 'read' }], { i, j }, i, key); break; }
      a[j + 1] = a[j]; c.moves++;
      snap('shift', `a[${j}] = ${a[j]} > ${key}：往右搬一格到索引 ${j + 1}。`, marks('write', j + 1), { i, j }, i, key);
      j--;
    }
    a[j + 1] = key;
    snap('insert', `把 ${key} 放進索引 ${j + 1}。`, marks('write', j + 1), { i }, i + 1, key);
  }
  steps.push({ line: at(lines, 'result'), note: `完成：比較 ${c.compares} 次、搬移 ${c.moves} 次。已經排好的輸入只要 n−1 次比較（最佳 O(n)）。`, arrays: [{ name: 'a', cells: cells(a), marks: marks('visited', ...a.map((_, k) => k)) }], vars: sortVars(c, '搬移'), output: a.join(' ') });
  return steps;
}

/** Top-down merge sort: split [lo, hi], sort both halves, merge through a temporary array (stable: ties take the left). */
export function mergeSortSteps(input: number[], lines?: Lines): TraceStep[] {
  const a = [...input], steps: TraceStep[] = [];
  let compares = 0, depth = 0;
  const snap = (key: string, note: string, extra: Partial<ArrayPanel> = {}, tmp?: number[]) =>
    steps.push({ line: at(lines, key), note, arrays: [{ name: 'a', cells: cells(a), ...extra }, ...(tmp ? [{ name: 'tmp', cells: cells(tmp) }] : [])], vars: { 比較: String(compares), 遞迴深度: String(depth) } });
  const sort = (lo: number, hi: number) => {
    if (lo >= hi) return;
    const mid = (lo + hi) >> 1;
    depth++;
    snap('split', `分割 [${lo}, ${hi}] 為 [${lo}, ${mid}] 與 [${mid + 1}, ${hi}]。`, { range: { from: lo, to: hi, label: '目前處理的區段' }, pointers: { lo, mid, hi } });
    sort(lo, mid);
    sort(mid + 1, hi);
    const tmp: number[] = [];
    let i = lo, j = mid + 1;
    while (i <= mid && j <= hi) {
      compares++;
      const left = a[i] <= a[j];
      tmp.push(left ? a[i++] : a[j++]);
      snap('merge', `比較 ${a[left ? i - 1 : i]} 與 ${a[left ? j : j - 1]}：取${left ? '左半' : '右半'}的 ${tmp.at(-1)}${left && a[i - 1] === a[j] ? '（相等取左半，維持穩定）' : ''}。`,
        { range: { from: lo, to: hi, label: '合併中' }, pointers: { i, j }, marks: marks('read', ...[i, j].filter((x, k) => x <= (k ? hi : mid))) }, tmp);
    }
    while (i <= mid) tmp.push(a[i++]);
    while (j <= hi) tmp.push(a[j++]);
    tmp.forEach((v, k) => { a[lo + k] = v; });
    snap('copy', `一邊用完，剩下的直接接上；把 tmp 複製回 a[${lo}..${hi}]：${tmp.join(' ')}。`, { range: { from: lo, to: hi, label: '已合併' }, marks: marks('write', ...tmp.map((_, k) => lo + k)) }, tmp);
    depth--;
  };
  snap('init', `n = ${a.length}：每層把每段切成兩半，共約 log₂ n 層；每層合併總共 O(n)，所以是 O(n log n)。`);
  sort(0, a.length - 1);
  steps.push({ line: at(lines, 'result'), note: `完成，比較 ${compares} 次。合併需要長度 n 的暫存陣列（額外空間 O(n)）。`, arrays: [{ name: 'a', cells: cells(a), marks: marks('visited', ...a.map((_, k) => k)) }], vars: { 比較: String(compares) }, output: a.join(' ') });
  return steps;
}

/** Quick sort with Lomuto partition (pivot = last element of the range); recursion on both sides. */
export function quickSortSteps(input: number[], lines?: Lines): TraceStep[] {
  const a = [...input], steps: TraceStep[] = [], done = new Set<number>();
  let compares = 0, swaps = 0;
  const snap = (key: string, note: string, extra: Partial<ArrayPanel> = {}) => steps.push({ line: at(lines, key), note,
    arrays: [{ name: 'a', cells: cells(a), ...extra, marks: [...marks('visited', ...[...done].filter(d => !(extra.marks ?? []).some(m => m.at === d))), ...(extra.marks ?? [])] }], vars: { 比較: String(compares), 交換: String(swaps) } });
  const sort = (lo: number, hi: number) => {
    if (lo > hi) return;
    if (lo === hi) { done.add(lo); return; }
    const pivot = a[hi];
    let i = lo;
    snap('pivot', `處理 [${lo}, ${hi}]：選最後一個 a[${hi}] = ${pivot} 當基準值（pivot）。i = ${lo} 標記「小於 pivot 的區域」的結尾。`, { range: { from: lo, to: hi, label: '分割中' }, pointers: { i, hi }, marks: [{ at: hi, kind: 'current' }] });
    for (let j = lo; j < hi; j++) {
      compares++;
      if (a[j] < pivot) {
        [a[i], a[j]] = [a[j], a[i]]; if (i !== j) swaps++;
        snap('compare', `a[${j}] = ${a[i]} < ${pivot}：換到左邊區域（索引 ${i}），i 前進到 ${i + 1}。`, { range: { from: lo, to: hi, label: '分割中' }, pointers: { i: i + 1, j }, marks: [...marks('write', i, j), { at: hi, kind: 'current' }] });
        i++;
      } else snap('compare', `a[${j}] = ${a[j]} ≥ ${pivot}：留在右邊，i 不動。`, { range: { from: lo, to: hi, label: '分割中' }, pointers: { i, j }, marks: [{ at: j, kind: 'read' }, { at: hi, kind: 'current' }] });
    }
    [a[i], a[hi]] = [a[hi], a[i]]; if (i !== hi) swaps++;
    done.add(i);
    snap('place', `把 pivot ${pivot} 換到索引 ${i}：左邊都 < ${pivot}，右邊都 ≥ ${pivot}，它已在最終位置。`, { range: { from: lo, to: hi, label: '分割完成' }, pointers: { p: i }, marks: [{ at: i, kind: 'found' }] });
    sort(lo, i - 1);
    sort(i + 1, hi);
  };
  sort(0, a.length - 1);
  a.forEach((_, k) => done.add(k));
  steps.push({ line: at(lines, 'result'), note: `完成：比較 ${compares} 次、交換 ${swaps} 次。基準值每次都選到最大或最小時（例如已排序的輸入）會退化成 O(n²)。`, arrays: [{ name: 'a', cells: cells(a), marks: marks('visited', ...a.map((_, k) => k)) }], vars: { 比較: String(compares), 交換: String(swaps) }, output: a.join(' ') });
  return steps;
}

// ---- two pointers, sliding window, prefix sums ---------------------------------------------------------------------
/** Two pointers on a sorted array: find a pair with sum = target by moving left up or right down. */
export function twoSumSteps(a: number[], target: number, lines?: Lines): TraceStep[] {
  const steps: TraceStep[] = [];
  let l = 0, r = a.length - 1;
  while (l < r) {
    const sum = a[l] + a[r];
    const what = sum === target ? `= ${target}：找到配對。` : sum < target ? `< ${target}：和太小，a[l] 已經配上最大的 a[r] 仍不夠，l 不可能有解，left 右移。` : `> ${target}：和太大，a[r] 配上最小的 a[l] 仍太大，r 不可能有解，right 左移。`;
    steps.push({ line: at(lines, 'compare'), note: `a[${l}] + a[${r}] = ${a[l]} + ${a[r]} = ${sum} ${what}`, arrays: [{ name: 'a', cells: cells(a), marks: marks(sum === target ? 'found' : 'read', l, r), range: { from: l, to: r, label: '還要考慮的範圍' }, pointers: { left: l, right: r } }], vars: { left: String(l), right: String(r), sum: String(sum) } });
    if (sum === target) { steps.push({ line: at(lines, 'result'), note: `輸出索引 ${l} ${r}。每一步排除一個元素，最多 n − 1 步：O(n)。`, arrays: [{ name: 'a', cells: cells(a), marks: marks('found', l, r) }], output: `${l} ${r}` }); return steps; }
    if (sum < target) l++; else r--;
  }
  steps.push({ line: at(lines, 'result'), note: `left 與 right 相遇：沒有和為 ${target} 的配對，輸出 -1。`, arrays: [{ name: 'a', cells: cells(a), pointers: { left: l, right: r } }], output: '-1' });
  return steps;
}

/** Fixed-length window of k: slide one step at a time, add the new element and drop the old one. */
export function fixedWindowSteps(a: number[], k: number, lines?: Lines): TraceStep[] {
  const steps: TraceStep[] = [];
  let sum = a.slice(0, k).reduce((s, v) => s + v, 0), best = sum, bestAt = 0;
  steps.push({ line: at(lines, 'init'), note: `先算第一個視窗 a[0..${k - 1}] 的和 = ${sum}。`, arrays: [{ name: 'a', cells: cells(a), range: { from: 0, to: k - 1, label: `視窗（長度 ${k}）` }, marks: marks('read', ...Array.from({ length: k }, (_, i) => i)) }], vars: { sum: String(sum), best: String(best) } });
  for (let r = k; r < a.length; r++) {
    sum += a[r] - a[r - k];
    if (sum > best) { best = sum; bestAt = r - k + 1; }
    steps.push({ line: at(lines, 'slide'), note: `右移：加入 a[${r}] = ${a[r]}、移出 a[${r - k}] = ${a[r - k]}，和 = ${sum}${sum === best && bestAt === r - k + 1 ? '，目前最大' : ''}。每步 O(1)，不必重算整個視窗。`,
      arrays: [{ name: 'a', cells: cells(a), range: { from: r - k + 1, to: r, label: `視窗（長度 ${k}）` }, marks: [{ at: r, kind: 'write' }, { at: r - k, kind: 'removed' }] }], vars: { sum: String(sum), best: String(best) } });
  }
  steps.push({ line: at(lines, 'result'), note: `最大和 ${best}，視窗 a[${bestAt}..${bestAt + k - 1}]。`, arrays: [{ name: 'a', cells: cells(a), range: { from: bestAt, to: bestAt + k - 1, label: '最大的視窗' } }], vars: { best: String(best) }, output: String(best) });
  return steps;
}

/** Shortest window with sum ≥ target. Only valid for non-negative values: growing the window never lowers its sum. */
export function minWindowSteps(a: number[], target: number, lines?: Lines): TraceStep[] {
  if (a.some(v => v < 0)) throw new Error('minWindowSteps needs non-negative values');
  const steps: TraceStep[] = [];
  let l = 0, sum = 0, best = Infinity, bestL = -1;
  const panel = (r: number, m: { at: number; kind: Mark }[]) => [{ name: 'a', cells: cells(a), range: { from: l, to: r, label: '視窗' }, pointers: { left: l, right: r }, marks: m }];
  for (let r = 0; r < a.length; r++) {
    sum += a[r];
    steps.push({ line: at(lines, 'expand'), note: `擴張：加入 a[${r}] = ${a[r]}，視窗和 = ${sum}${sum >= target ? ` ≥ ${target}（合法）` : ` < ${target}（還不夠）`}。`, arrays: panel(r, [{ at: r, kind: 'write' }]), vars: { sum: String(sum), 最短長度: best === Infinity ? '—' : String(best) } });
    while (sum >= target) {
      if (r - l + 1 < best) { best = r - l + 1; bestL = l; }
      sum -= a[l];
      l++;
      steps.push({ line: at(lines, 'shrink'), note: `合法，記下長度 ${r - l + 2}；收縮：移出 a[${l - 1}] = ${a[l - 1]}，和 = ${sum}${sum >= target ? '，仍合法，繼續收縮' : `，< ${target}，停止收縮`}。`, arrays: panel(r, [{ at: l - 1, kind: 'removed' }]), vars: { sum: String(sum), 最短長度: String(best) } });
    }
  }
  const out = best === Infinity ? '0' : String(best);
  steps.push({ line: at(lines, 'result'), note: best === Infinity ? `沒有和 ≥ ${target} 的區間，輸出 0。` : `最短長度 ${best}：a[${bestL}..${bestL + best - 1}]。left 與 right 都只前進，總共 O(n)。`,
    arrays: [{ name: 'a', cells: cells(a), ...(bestL >= 0 ? { range: { from: bestL, to: bestL + best - 1, label: '最短的合法視窗' } } : {}) }], output: out });
  return steps;
}

/** Prefix sums with an exclusive prefix P (P[0] = 0, P[i+1] = P[i] + a[i]); query [l, r] inclusive = P[r+1] − P[l]. */
export function prefixSumSteps(a: number[], queries: [number, number][], lines?: Lines): TraceStep[] {
  const steps: TraceStep[] = [];
  const P = [0];
  const show = (pm: { at: number; kind: Mark }[], am: { at: number; kind: Mark }[], arange?: [number, number]) => [
    { name: 'a', cells: cells(a), marks: am, ...(arange ? { range: { from: arange[0], to: arange[1], label: '查詢區間' } } : {}) },
    { name: 'P', cells: cells(P), marks: pm }];
  steps.push({ line: at(lines, 'init'), note: 'P[0] = 0：P[i] 是「前 i 個元素」的和（不含 a[i]），所以 P 比 a 多一格。', arrays: show([{ at: 0, kind: 'write' }], []) });
  a.forEach((v, i) => {
    P.push(P[i] + v);
    steps.push({ line: at(lines, 'build'), note: `P[${i + 1}] = P[${i}] + a[${i}] = ${P[i]} + ${v} = ${P[i + 1]}。`, arrays: show([{ at: i, kind: 'read' }, { at: i + 1, kind: 'write' }], [{ at: i, kind: 'read' }]) });
  });
  const out: string[] = [];
  for (const [l, r] of queries) {
    const v = P[r + 1] - P[l];
    out.push(String(v));
    steps.push({ line: at(lines, 'query'), note: `區間 [${l}, ${r}]（含兩端）的和 = P[${r + 1}] − P[${l}] = ${P[r + 1]} − ${P[l]} = ${v}。用 P[${r}] 會少算 a[${r}]：這是最常見的差一錯誤。`,
      arrays: show(marks('read', l, r + 1), [], [l, r]), output: out.join('\n') });
  }
  return steps;
}

// ---- recursion trees and backtracking ------------------------------------------------------------------------------
/**
 * Records a recursive computation as a growing call tree: every call is a node, the call stack is the path to the
 * node running now. Simulators call enter / leave / note; each event becomes one step.
 */
export class CallTracer {
  readonly steps: TraceStep[] = [];
  private nodes: TreeNode[] = [];
  private status = new Map<string, Mark>();
  private stack: { id: string; name: string; vars: Record<string, string> }[] = [];
  private labels = new Map<string, string>();
  /** Everything printed so far stays on screen in later steps. */
  private printed?: string;
  constructor(private name: string, private lines?: Lines) {}
  private snap(key: string, note: string, extra: Partial<TraceStep> = {}) {
    if (extra.output !== undefined) this.printed = extra.output;
    this.steps.push({ line: at(this.lines, key), note, ...(this.printed !== undefined ? { output: this.printed } : {}), ...extra,
      tree: { name: this.name, nodes: this.nodes.map(n => ({ ...n, label: this.labels.get(n.id)!, children: [...n.children!] })), roots: this.nodes.length ? [this.nodes[0].id] : [],
        marks: [...this.status].map(([id, kind]) => ({ id, kind })) },
      frames: this.stack.map(f => ({ name: f.name, vars: { ...f.vars } })) });
  }
  /** A new call below the running one. */
  enter(name: string, vars: Record<string, string>, note: string, key = 'call') {
    const id = `c${this.nodes.length}`;
    this.nodes.push({ id, label: name, children: [] });
    this.labels.set(id, name);
    const parent = this.stack.at(-1);
    if (parent) this.nodes.find(n => n.id === parent.id)!.children!.push(id);
    for (const f of this.stack) this.status.set(f.id, 'pending');
    this.status.set(id, 'current');
    this.stack.push({ id, name, vars });
    this.snap(key, note);
    return id;
  }
  /** The running call ends; its node now shows the returned value (or why it was cut off). */
  leave(result: string, note: string, opts: { key?: string; kind?: Mark; output?: string } = {}) {
    const f = this.stack.pop()!;
    this.labels.set(f.id, `${f.name}${result ? ` = ${result}` : ''}`);
    this.status.set(f.id, opts.kind ?? 'visited');
    const top = this.stack.at(-1);
    if (top) this.status.set(top.id, 'current');
    this.snap(opts.key ?? 'return', note, opts.output !== undefined ? { output: opts.output } : {});
  }
  /** A step that changes nothing in the tree (e.g. choosing or undoing a candidate). */
  note(note: string, key: string, extra: Partial<TraceStep> = {}) { this.snap(key, note, extra); }
  /** Updates the running call's variables. */
  setVars(vars: Record<string, string>) { Object.assign(this.stack.at(-1)!.vars, vars); }
}

/** fib(n) as a call tree, plain (exponential, repeated subproblems) or memoized (each n computed once). */
export function fibTreeSteps(n: number, memo: boolean, lines?: Lines): TraceStep[] {
  const t = new CallTracer(memo ? 'fib 的呼叫樹（記憶化）' : 'fib 的呼叫樹', lines);
  const known = new Map<number, number>();
  let calls = 0;
  const fib = (k: number): number => {
    calls++;
    t.enter(`fib(${k})`, { n: String(k) }, `呼叫 fib(${k})（第 ${calls} 次呼叫）。`);
    if (k <= 1) { t.leave(String(k), `fib(${k}) 是終止條件，直接回傳 ${k}。`, { key: 'base' }); return k; }
    if (memo && known.has(k)) { t.leave(String(known.get(k)), `fib(${k}) 已經算過，直接從記憶表取出 ${known.get(k)}，不再展開。`, { key: 'memo', kind: 'found' }); return known.get(k)!; }
    const v = fib(k - 1) + fib(k - 2);
    if (memo) known.set(k, v);
    t.leave(String(v), `fib(${k}) = fib(${k - 1}) + fib(${k - 2}) = ${v}${memo ? '，存進記憶表' : ''}。`);
    return v;
  };
  const v = fib(n);
  t.note(`答案 fib(${n}) = ${v}，共呼叫 ${calls} 次${memo ? '（每個 n 只展開一次，O(n)）' : '（同一個 n 被重複計算，次數隨 n 指數成長）'}。`, 'result', { output: String(v), vars: { 呼叫次數: String(calls) } });
  return t.steps;
}

/** Backtracking: choose candidates for a target sum (each used at most once, sorted, with pruning). */
export function combinationSumSteps(candidates: number[], target: number, lines?: Lines): TraceStep[] {
  const c = [...candidates].sort((x, y) => x - y);
  const t = new CallTracer('搜尋樹', lines);
  const path: number[] = [], found: string[] = [];
  const dfs = (start: number, remain: number) => {
    t.enter(path.length ? `[${path.join(',')}]` : '[]', { remain: String(remain), start: String(start) }, path.length ? `選了 ${path.at(-1)}，剩下 ${remain}。` : `從空的選擇開始，目標 ${target}。`);
    if (remain === 0) { found.push(path.join(' ')); t.leave('✓', `剛好湊到 ${target}：記下 ${path.join(' + ')}。`, { kind: 'found', output: found.join('\n'), key: 'found' }); return; }
    for (let i = start; i < c.length; i++) {
      if (i > start && c[i] === c[i - 1]) { t.note(`跳過重複的 ${c[i]}：同一層選相同的值會產生重複的組合。`, 'skip'); continue; }
      if (c[i] > remain) { t.note(`剪枝：${c[i]} > 剩下的 ${remain}，而後面的數更大（已排序），整個分支都不可能，停止這一層。`, 'prune'); break; }
      path.push(c[i]);
      dfs(i + 1, remain - c[i]);
      path.pop();
      t.note(`撤銷：拿掉 ${c[i]}，回到 [${path.join(',')}]，試下一個候選。`, 'undo');
    }
    t.leave('', '這一層的候選都試完，回到上一層。', { kind: 'visited' });
  };
  dfs(0, target);
  t.note(found.length ? `共 ${found.length} 組：${found.join('；')}。` : `沒有任何組合的和是 ${target}。`, 'result', { output: found.join('\n') || 'none' });
  return t.steps;
}

// ---- greedy -------------------------------------------------------------------------------------------------------
/** Activity selection: sort by end time, take every activity that starts after the last chosen one ends. */
export function activitySelectionSteps(acts: { name: string; start: number; end: number }[], lines?: Lines): TraceStep[] {
  const sorted = [...acts].sort((x, y) => x.end - y.end || x.start - y.start);
  const status = sorted.map(() => '待決定');
  const steps: TraceStep[] = [];
  const table = (row?: number, kind?: Mark): TraceStep['table'] => ({ name: '活動（依結束時間排序）', head: ['活動', '開始', '結束', '狀態'],
    rows: sorted.map((a, i) => [a.name, String(a.start), String(a.end), status[i]]), marks: row === undefined ? [] : [{ row, kind: kind! }] });
  steps.push({ line: at(lines, 'sort'), note: '依結束時間由早到晚排序：最早結束的活動留給後面的空間最多。', table: table() });
  let last = -Infinity;
  const chosen: string[] = [];
  sorted.forEach((a, i) => {
    const ok = a.start >= last, before = last;
    status[i] = ok ? '選取' : `捨棄：開始 ${a.start} < 上一個結束 ${last}`;
    if (ok) { chosen.push(a.name); last = a.end; }
    const prev = before === -Infinity ? '（還沒有選任何活動）' : `上一個選取的結束時間 ${before}`;
    steps.push({ line: at(lines, 'choose'), note: ok ? `${a.name} 開始於 ${a.start}，${before === -Infinity ? '是第一個候選' : `≥ ${prev}`}，不衝突：選取，最後結束時間變成 ${a.end}。` : `${a.name} 開始於 ${a.start} < ${prev}，與已選的活動重疊：捨棄。`, table: table(i, ok ? 'found' : 'removed'), vars: { 已選: chosen.join(' '), 最後結束: String(last) } });
  });
  steps.push({ line: at(lines, 'result'), note: `選了 ${chosen.length} 個活動：${chosen.join('、')}。交換論證：任何最佳解的第一個活動都能換成「最早結束的」而不變差，所以這個選法正確。`, table: table(), output: String(chosen.length) });
  return steps;
}

/** Greedy change-making: always take the largest coin that fits. Optimal for some coin systems only. */
export function greedyCoinSteps(coins: number[], amount: number, lines?: Lines): TraceStep[] {
  const cs = [...coins].sort((x, y) => y - x);
  const used = cs.map(() => 0);
  const steps: TraceStep[] = [];
  let left = amount;
  const table = (row?: number): TraceStep['table'] => ({ name: '硬幣（由大到小）', head: ['面額', '使用枚數'], rows: cs.map((c, i) => [String(c), String(used[i])]), marks: row === undefined ? [] : [{ row, kind: 'write' }] });
  cs.forEach((c, i) => {
    used[i] = Math.floor(left / c);
    left -= used[i] * c;
    steps.push({ line: at(lines, 'take'), note: `面額 ${c}：盡量多拿，${used[i]} 枚，剩下 ${left}。`, table: table(i), vars: { 剩下: String(left), 總枚數: String(used.reduce((s, x) => s + x, 0)) } });
  });
  const total = used.reduce((s, x) => s + x, 0);
  steps.push({ line: at(lines, 'result'), note: left ? `剩下 ${left} 湊不出來：貪心失敗。` : `共 ${total} 枚。這只代表貪心「找到一個解」；對 {1, 3, 4} 湊 6，貪心給 4+1+1（3 枚），最佳是 3+3（2 枚）——要用反例或證明確認貪心正確。`, table: table(), output: left ? '-1' : String(total) });
  return steps;
}

// ---- graphs -------------------------------------------------------------------------------------------------------
type Edge = { from: string; to: string; weight?: number };
const adjacency = (nodes: string[], edges: Edge[], directed: boolean) => {
  const adj = new Map(nodes.map(n => [n, [] as { to: string; w: number; i: number }[]]));
  edges.forEach((e, i) => { adj.get(e.from)!.push({ to: e.to, w: e.weight ?? 1, i }); if (!directed) adj.get(e.to)!.push({ to: e.from, w: e.weight ?? 1, i }); });
  return adj;
};
const graphPanel = (name: string, nodes: string[], edges: Edge[], directed: boolean, m: { node?: string; edge?: number; kind: Mark }[]): TraceStep['graph'] =>
  ({ name, nodes, edges: edges.map(e => ({ ...e })), directed, marks: m, show: ['list'] });

/** BFS from start: a queue, a visited mark when a node is discovered, distance and parent per node. */
export function bfsSteps(nodes: string[], edges: Edge[], directed: boolean, start: string, lines?: Lines): TraceStep[] {
  const adj = adjacency(nodes, edges, directed);
  const dist = new Map<string, number>([[start, 0]]), parent = new Map<string, string>(), order: string[] = [];
  const queue = [start], steps: TraceStep[] = [];
  const table = (row?: string, kind?: Mark): TraceStep['table'] => ({ name: '距離與父節點', head: ['節點', 'dist', 'parent'],
    rows: nodes.map(n => [n, dist.has(n) ? String(dist.get(n)) : '∞（未發現）', parent.get(n) ?? (n === start ? '起點' : '—')]), marks: row ? [{ row: nodes.indexOf(row), kind: kind! }] : [] });
  const snap = (key: string, note: string, m: { node?: string; edge?: number; kind: Mark }[], row?: string, kind?: Mark) => steps.push({ line: at(lines, key), note,
    graph: graphPanel('圖', nodes, edges, directed, [...[...dist.keys()].filter(n => !m.some(x => x.node === n)).map(n => ({ node: n, kind: (order.includes(n) ? 'visited' : 'pending') as Mark })), ...m]),
    containers: [{ name: '佇列（frontier）', kind: 'queue', items: [...queue] }], table: table(row, kind), output: order.join(' ') });
  snap('init', `起點 ${start} 入隊，dist = 0，立刻標記為已發現（入隊時標記，才不會重複入隊）。`, [{ node: start, kind: 'current' }], start, 'write');
  while (queue.length) {
    const u = queue.shift()!;
    order.push(u);
    snap('visit', `取出 ${u}（距離 ${dist.get(u)}），拜訪它。佇列先進先出，所以距離小的一定先被拜訪。`, [{ node: u, kind: 'current' }], u, 'read');
    for (const { to, i } of adj.get(u)!) {
      if (dist.has(to)) continue;
      dist.set(to, dist.get(u)! + 1); parent.set(to, u); queue.push(to);
      snap('discover', `鄰居 ${to} 還沒被發現：dist = ${dist.get(u)! + 1}、parent = ${u}，入隊。`, [{ node: u, kind: 'current' }, { node: to, kind: 'write' }, { edge: i, kind: 'write' }], to, 'write');
    }
  }
  const unreachable = nodes.filter(n => !dist.has(n));
  snap('result', `佇列空了，走訪順序 ${order.join(' → ')}。${unreachable.length ? `${unreachable.join('、')} 無法從 ${start} 到達（dist 仍是 ∞）。` : '所有節點都能到達。'}每個節點入隊一次、每條邊看一（無向兩）次：O(V + E)。`, []);
  return steps;
}

/** Iterative DFS with an explicit stack (neighbours pushed in reverse so the first neighbour is explored first). */
export function dfsSteps(nodes: string[], edges: Edge[], directed: boolean, start: string, lines?: Lines): TraceStep[] {
  const adj = adjacency(nodes, edges, directed);
  const visited = new Set<string>(), parent = new Map<string, string>(), order: string[] = [];
  const stack: { node: string; from?: string }[] = [{ node: start }], steps: TraceStep[] = [];
  const table = (row?: string): TraceStep['table'] => ({ name: '拜訪與父節點', head: ['節點', '狀態', 'parent'],
    rows: nodes.map(n => [n, visited.has(n) ? `第 ${order.indexOf(n) + 1} 個拜訪` : '未拜訪', parent.get(n) ?? (n === start ? '起點' : '—')]), marks: row ? [{ row: nodes.indexOf(row), kind: 'read' }] : [] });
  const snap = (key: string, note: string, m: { node?: string; edge?: number; kind: Mark }[], row?: string) => steps.push({ line: at(lines, key), note,
    graph: graphPanel('圖', nodes, edges, directed, [...[...visited].filter(n => !m.some(x => x.node === n)).map(n => ({ node: n, kind: 'visited' as Mark })), ...m]),
    containers: [{ name: '堆疊', kind: 'stack', items: stack.map(s => s.node) }], table: table(row), output: order.join(' ') });
  snap('init', `把起點 ${start} 放進堆疊。`, [{ node: start, kind: 'current' }]);
  while (stack.length) {
    const { node: u, from } = stack.pop()!;
    if (visited.has(u)) { snap('skip', `取出 ${u}：已經拜訪過，略過（同一個節點可能被放進堆疊不只一次）。`, [{ node: u, kind: 'read' }]); continue; }
    visited.add(u); order.push(u); if (from) parent.set(u, from);
    const next = adj.get(u)!.filter(x => !visited.has(x.to)).reverse();
    for (const x of next) stack.push({ node: x.to, from: u });
    snap('visit', `取出 ${u} 並拜訪${from ? `（經由 ${from}）` : ''}；把還沒拜訪的鄰居 ${next.map(x => x.to).reverse().join('、') || '（沒有）'} 放進堆疊（反序放，先拜訪第一個）。`, [{ node: u, kind: 'current' }, ...next.map(x => ({ edge: x.i, kind: 'read' as Mark }))], u);
  }
  const rest = nodes.filter(n => !visited.has(n));
  snap('result', `堆疊空了，拜訪順序 ${order.join(' → ')}。${rest.length ? `${rest.join('、')} 不在 ${start} 的連通塊中；要數連通塊，就對每個未拜訪的節點再做一次 DFS。` : ''}`, []);
  return steps;
}

/** Dijkstra with a priority queue (lazy deletion); requires non-negative weights. Ends with the path to `target`. */
export function dijkstraSteps(nodes: string[], edges: Edge[], directed: boolean, start: string, target?: string, lines?: Lines): TraceStep[] {
  if (edges.some(e => (e.weight ?? 1) < 0)) throw new Error('Dijkstra needs non-negative weights');
  const adj = adjacency(nodes, edges, directed);
  const dist = new Map<string, number>([[start, 0]]), parent = new Map<string, string>(), settled = new Set<string>();
  const pq: [number, string][] = [[0, start]];
  const steps: TraceStep[] = [];
  const table = (row?: string, kind?: Mark): TraceStep['table'] => ({ name: '距離表', head: ['節點', 'dist', 'parent', '確定'],
    rows: nodes.map(n => [n, dist.has(n) ? String(dist.get(n)) : '∞', parent.get(n) ?? (n === start ? '起點' : '—'), settled.has(n) ? '是' : '否']), marks: row ? [{ row: nodes.indexOf(row), kind: kind! }] : [] });
  const snap = (key: string, note: string, m: { node?: string; edge?: number; kind: Mark }[], row?: string, kind?: Mark) => steps.push({ line: at(lines, key), note,
    graph: graphPanel('加權圖', nodes, edges, directed, [...[...settled].filter(n => !m.some(x => x.node === n)).map(n => ({ node: n, kind: 'visited' as Mark })), ...m]),
    // Shown in the order it will be served (smallest dist first), whatever the heap's internal array looks like.
    containers: [{ name: '優先佇列（依 dist 由小到大，最前面先取出）', kind: 'queue', items: [...pq].sort((x, y) => x[0] - y[0] || x[1].localeCompare(y[1])).map(([d, n]) => `${d}:${n}`) }], table: table(row, kind) });
  snap('init', `dist[${start}] = 0，其他都是 ∞；(0, ${start}) 放進優先佇列。`, [{ node: start, kind: 'current' }], start, 'write');
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0] || x[1].localeCompare(y[1]));
    const [d, u] = pq.shift()!;
    if (settled.has(u)) { snap('stale', `取出 (${d}, ${u})：${u} 已經確定（這是較舊、較大的紀錄），略過。`, [{ node: u, kind: 'read' }]); continue; }
    settled.add(u);
    snap('settle', `取出目前最小的 (${d}, ${u})：${u} 的最短距離確定為 ${d}。邊權非負，之後不可能再找到更短的路。`, [{ node: u, kind: 'current' }], u, 'found');
    for (const { to, w, i } of adj.get(u)!) {
      if (settled.has(to)) continue;
      const nd = d + w, old = dist.get(to);
      if (old === undefined || nd < old) {
        dist.set(to, nd); parent.set(to, u); pq.push([nd, to]);
        snap('relax', `鬆弛 ${u} → ${to}（權重 ${w}）：${d} + ${w} = ${nd} < ${old ?? '∞'}，更新 dist[${to}] = ${nd}、parent = ${u}，放進佇列。`, [{ node: u, kind: 'current' }, { node: to, kind: 'write' }, { edge: i, kind: 'write' }], to, 'write');
      } else snap('relax', `鬆弛 ${u} → ${to}（權重 ${w}）：${d} + ${w} = ${nd} ≥ ${old}，不更新。`, [{ node: u, kind: 'current' }, { node: to, kind: 'read' }, { edge: i, kind: 'read' }], to, 'read');
    }
  }
  if (target) {
    const path: string[] = [];
    for (let v: string | undefined = target; v !== undefined; v = parent.get(v)) path.unshift(v);
    const ok = dist.has(target);
    const pathEdges = path.slice(1).map((v, k) => edges.findIndex(e => (e.from === path[k] && e.to === v) || (!directed && e.to === path[k] && e.from === v)));
    snap('path', ok ? `沿著 parent 從 ${target} 倒推回 ${start}：${path.join(' → ')}，總距離 ${dist.get(target)}。` : `${target} 無法從 ${start} 到達。`,
      ok ? [...path.map(n => ({ node: n, kind: 'found' as Mark })), ...pathEdges.map(e => ({ edge: e, kind: 'found' as Mark }))] : []);
    steps.at(-1)!.output = ok ? `${dist.get(target)}\n${path.join(' ')}` : '-1';
  }
  return steps;
}

// ---- dynamic programming -------------------------------------------------------------------------------------------
/**
 * Fills a DP table cell by cell in the given order. `cell` returns the value, the cells it read and a note; the
 * step marks those reads and the written cell. Unfilled cells show as empty.
 */
export function tableFillSteps(spec: {
  name: string; rows: number; cols: number; rowLabels?: string[]; colLabels?: string[];
  order: [number, number][]; cell: (i: number, j: number, get: (i: number, j: number) => number) => { value: number; reads: [number, number][]; note: string; key?: string };
  result?: (get: (i: number, j: number) => number) => { cell: [number, number]; note: string; output: string };
}, lines?: Lines): TraceStep[] {
  const t: (number | null)[][] = Array.from({ length: spec.rows }, () => Array(spec.cols).fill(null));
  const get = (i: number, j: number) => { const v = t[i]?.[j]; if (v === null || v === undefined) throw new Error(`dp[${i}][${j}] read before it was filled`); return v; };
  const grid = () => t.map(r => r.map(v => v === null ? '' : String(v)));
  const steps: TraceStep[] = [];
  const panel = (m: { at: [number, number]; kind: Mark }[]) => [{ name: spec.name, cells: grid(), marks: m, ...(spec.rowLabels ? { rowLabels: spec.rowLabels } : {}), ...(spec.colLabels ? { colLabels: spec.colLabels } : {}) }];
  for (const [i, j] of spec.order) {
    const { value, reads, note, key } = spec.cell(i, j, get);
    t[i][j] = value;
    steps.push({ line: at(lines, key ?? 'fill'), note, arrays: panel([...reads.map(at_ => ({ at: at_, kind: 'read' as Mark })), { at: [i, j], kind: 'write' }]) });
  }
  if (spec.result) { const r = spec.result(get); steps.push({ line: at(lines, 'result'), note: r.note, arrays: panel([{ at: r.cell, kind: 'found' }]), output: r.output }); }
  return steps;
}

/** 0/1 knapsack: dp[i][w] = best value using the first i items with capacity w; then walk back to the chosen items. */
export function knapsackSteps(items: { name: string; weight: number; value: number }[], capacity: number, lines?: Lines): TraceStep[] {
  const n = items.length;
  const order: [number, number][] = [];
  for (let i = 0; i <= n; i++) for (let w = 0; w <= capacity; w++) order.push([i, w]);
  const steps = tableFillSteps({
    name: 'dp', rows: n + 1, cols: capacity + 1, rowLabels: ['前 0 個', ...items.map((it, k) => `前 ${k + 1} 個（${it.name}）`)], colLabels: Array.from({ length: capacity + 1 }, (_, w) => `w=${w}`), order,
    cell: (i, w, get) => {
      if (i === 0) return { value: 0, reads: [], note: `dp[0][${w}] = 0：沒有物品可選。`, key: 'base' };
      const it = items[i - 1], skip = get(i - 1, w);
      if (it.weight > w) return { value: skip, reads: [[i - 1, w]], note: `${it.name}（重 ${it.weight}）放不進容量 ${w}：只能不選，dp = dp[${i - 1}][${w}] = ${skip}。` };
      const take = get(i - 1, w - it.weight) + it.value;
      return { value: Math.max(skip, take), reads: [[i - 1, w], [i - 1, w - it.weight]],
        note: `${it.name}：不選 = dp[${i - 1}][${w}] = ${skip}；選 = dp[${i - 1}][${w - it.weight}] + ${it.value} = ${take}。取${take > skip ? '「選」' : '「不選」'}，${Math.max(skip, take)}。每個物品只看上一列，所以每個物品最多用一次（0/1）。` };
    },
  }, lines);
  // Walk back from dp[n][capacity] to the chosen items, as one final step.
  const last = steps.at(-1)!.arrays![0];
  const dp = (last.cells as string[][]).map(r => r.map(Number));
  const chosen: string[] = [];
  const path: [number, number][] = [];
  for (let i = n, w = capacity; i > 0; i--) {
    path.push([i, w]);
    if (dp[i][w] !== dp[i - 1][w]) { chosen.unshift(items[i - 1].name); w -= items[i - 1].weight; }
  }
  steps.push({ line: at(lines, 'result'), note: `最佳價值 dp[${n}][${capacity}] = ${dp[n][capacity]}。倒推：dp[i][w] ≠ dp[i−1][w] 表示選了第 i 個物品。選了：${chosen.join('、') || '（沒有）'}。`,
    arrays: [{ ...last, marks: path.map(p => ({ at: p, kind: 'found' as Mark })) }], output: `${dp[n][capacity]}\n${chosen.join(' ') || 'none'}` });
  return steps;
}

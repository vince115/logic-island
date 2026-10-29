export const algorithmIds = ['array', 'stack', 'queue', 'binary-search', 'bubble-sort', 'bfs'] as const;
export type AlgorithmId = typeof algorithmIds[number];
export type Phase = 'ready' | 'access' | 'update' | 'compare' | 'swap' | 'visit' | 'found' | 'done';
export interface Step { values: number[]; active: number[]; visited: number[]; frontier: number[]; edges: [number, number][]; description: string; phase: Phase; codeKey: string; result?: number[]; }
export interface Input { values: number[]; target: number; index: number; value: number; operation: 'access' | 'update' | 'push' | 'pop' | 'enqueue' | 'dequeue'; edges: [number, number][]; }
export const defaultInput: Input = { values: [8, 3, 6, 2, 7, 4], target: 7, index: 2, value: 9, operation: 'access', edges: [[0,1],[0,2],[1,3],[2,3],[3,4]] };
export function parseNumbers(text: string, max = 16): number[] {
  if (!text.trim()) return [];
  const tokens = text.trim().split(/[\s,，]+/);
  if (tokens.length > max || tokens.some(t => !/^-?\d+$/.test(t) || !Number.isSafeInteger(Number(t)) || Math.abs(Number(t)) > 999)) throw new Error(`請輸入最多 ${max} 個 -999 到 999 的整數，以逗號分隔。`);
  return tokens.map(Number);
}
export function parseEdges(text: string, count: number): [number, number][] {
  if (!text.trim()) return [];
  return text.split(/[,，]/).map(token => {
    const match = token.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (!match || Number(match[1]) >= count || Number(match[2]) >= count) throw new Error('邊請使用 0-1, 1-2 格式，端點須為有效節點編號。');
    return [Number(match[1]), Number(match[2])];
  });
}
export function cursorAt(cursor: number, delta: number, length: number) { return Math.min(Math.max(0, length - 1), Math.max(0, cursor + delta)); }
export function generateSteps(id: AlgorithmId, input: Input): Step[] {
  const a = [...input.values]; const steps: Step[] = [];
  const add = (description: string, phase: Phase, codeKey: string, active: number[] = [], visited: number[] = [], frontier: number[] = [], result?: number[]) => steps.push({ values: [...a], active: [...active], visited: [...visited], frontier: [...frontier], edges: input.edges.map(e => [...e] as [number, number]), description, phase, codeKey, result: result && [...result] });
  add('資料已準備好。按下播放，或逐步觀察每一次操作。', 'ready', 'init');
  if (id === 'array') {
    if (input.index < 0 || input.index >= a.length || !Number.isInteger(input.index)) throw new Error('索引必須介於 0 與陣列長度減一之間。');
    add(`透過索引 ${input.index}，直接存取值 ${a[input.index]}。`, 'access', 'access', [input.index]);
    if (input.operation === 'update') { a[input.index] = input.value; add(`將索引 ${input.index} 更新為 ${input.value}。`, 'update', 'update', [input.index]); }
  } else if (id === 'stack' || id === 'queue') {
    const insert = input.operation === 'push' || input.operation === 'enqueue';
    if (insert) { a.push(input.value); add(`將 ${input.value} 加入${id === 'stack' ? '堆疊頂端' : '佇列尾端'}。`, 'update', 'insert', [a.length - 1]); }
    else if (!a.length) add('集合為空，無法移除元素；資料保持不變。', 'done', 'empty');
    else { const value = id === 'stack' ? a.pop() : a.shift(); add(`移除${id === 'stack' ? '頂端' : '前端'}元素 ${value}。`, 'update', 'remove'); }
  } else if (id === 'binary-search') {
    if (a.some((v,i) => i > 0 && v < a[i-1])) throw new Error('二分搜尋需要遞增排序的資料，請先調整輸入。');
    let low = 0, high = a.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      add(`搜尋範圍 [${low}, ${high}]，比較 a[${mid}] = ${a[mid]} 與目標 ${input.target}。`, 'compare', 'compare', [mid], [], Array.from({length:high-low+1},(_,i)=>low+i));
      if (a[mid] === input.target) { add(`找到目標 ${input.target}，索引是 ${mid}。`, 'found', 'found', [mid], [], [], [mid]); return steps; }
      if (a[mid] < input.target) low = mid + 1; else high = mid - 1;
      add(`縮小搜尋範圍為 [${low}, ${high}]。`, 'access', 'narrow', [], [], Array.from({length:Math.max(0,high-low+1)},(_,i)=>low+i));
    }
    add(`找不到目標 ${input.target}，回傳 -1。`, 'done', 'missing', [], [], [], [-1]); return steps;
  } else if (id === 'bubble-sort') {
    const sorted: number[] = [];
    for (let end = a.length - 1; end > 0; end--) {
      let swapped = false;
      for (let j = 0; j < end; j++) {
        add(`比較相鄰元素 ${a[j]} 與 ${a[j+1]}。`, 'compare', 'compare', [j,j+1], sorted);
        if (a[j] > a[j+1]) { [a[j],a[j+1]] = [a[j+1],a[j]]; swapped = true; add('左側較大，交換兩個元素的位置。', 'swap', 'swap', [j,j+1], sorted); }
      }
      sorted.push(end);
      if (!swapped) break;
    }
  } else {
    if (!a.length || !Number.isInteger(input.target) || input.target < 0 || input.target >= a.length) throw new Error('BFS 起點必須為有效節點編號，且至少需要一個節點。');
    const adj = a.map(() => [] as number[]);
    for (const [u,v] of input.edges) { if (!adj[u] || !adj[v]) throw new Error('邊的端點超出節點範圍。'); adj[u].push(v); adj[v].push(u); }
    const seen = new Set([input.target]); const q = [input.target]; const order: number[] = [];
    add(`起點 ${input.target} 入隊，立即標記已發現，避免環造成重複入隊。`, 'update', 'enqueue', [input.target], [], q);
    while(q.length) {
      const u = q.shift()!; order.push(u);
      add(`取出並訪問節點 ${u}。`, 'visit', 'visit', [u], order, q);
      for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); q.push(v); add(`發現鄰居 ${v} 並入隊。`, 'update', 'enqueue', [v], order, q); }
    }
    add(`遍歷完成：${order.join(' → ')}。${a.length-order.length} 個節點無法從起點到達。`, 'done', 'done', [], order, [], order); return steps;
  }
  add('操作完成。可以後退檢視過程，或修改輸入再做一次實驗。', 'done', 'done', [], id === 'bubble-sort' ? a.map((_,i)=>i) : [], [], a);
  return steps;
}

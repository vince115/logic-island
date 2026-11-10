import type { LessonContent, TraceStep } from '../schema';
import { bfsSteps } from '../simulate-algorithms';

const code = String.raw;

/**
 * The visualization's graph: 7 nodes, a cycle 0-1-3-2-0, a second cycle 2-3-5-4-2, and node 6 with no edges (never
 * reachable). bfsSteps processes neighbours in edge order (both directions for an undirected graph), which gives
 * exactly the adjacency list written on line 2 of the trace code.
 */
const TRACE_NODES = ['0', '1', '2', '3', '4', '5', '6'];
const TRACE_EDGES = [['0', '1'], ['0', '2'], ['1', '3'], ['2', '3'], ['2', '4'], ['3', '5'], ['4', '5']].map(([from, to]) => ({ from, to }));
const TRACE_ADJ = TRACE_NODES.map(n => TRACE_EDGES.flatMap(e => e.from === n ? [Number(e.to)] : e.to === n ? [Number(e.from)] : []));

/**
 * The same BFS as the trace code, run here to record the code's variables (u, v, dist, parent as Python lists) and the
 * neighbours each visit skips, one event per simulator step ('init', then a 'visit' and its 'discover's, then 'result').
 */
type Ev = { kind: 'init' | 'visit' | 'discover' | 'result'; u?: number; v?: number; dist: number[]; parent: number[]; skipped?: number[] };
const events: Ev[] = (() => {
  const dist = TRACE_NODES.map(() => -1), parent = TRACE_NODES.map(() => -1), out: Ev[] = [];
  dist[0] = 0;
  out.push({ kind: 'init', dist: [...dist], parent: [...parent] });
  const q = [0];
  while (q.length) {
    const u = q.shift()!;
    out.push({ kind: 'visit', u, dist: [...dist], parent: [...parent], skipped: TRACE_ADJ[u].filter(v => dist[v] !== -1) });
    for (const v of TRACE_ADJ[u]) {
      if (dist[v] !== -1) continue;
      dist[v] = dist[u] + 1; parent[v] = u; q.push(v);
      out.push({ kind: 'discover', u, v, dist: [...dist], parent: [...parent] });
    }
  }
  out.push({ kind: 'result', dist: [...dist], parent: [...parent] });
  return out;
})();
const py = (a: number[]) => `[${a.join(', ')}]`;
const FINAL_OUTPUT = `${py(events[events.length - 1].dist)}\n${py(events[events.length - 1].parent)}`;

/**
 * bfsSteps runs the BFS (lines: init → 6, visit → 8, discover → 13, result → 15). Each step gets the code's variables;
 * the table shows −1 as the code does (the simulator writes ∞ / —); nothing is printed until lines 14–15.
 */
const simulated = bfsSteps(TRACE_NODES, TRACE_EDGES, false, '0', { init: 6, visit: 8, discover: 13, result: 15 });
if (simulated.length !== events.length) throw new Error('A14: trace events and simulator steps disagree');
const visitedSoFar: number[] = [];
const traceSteps: TraceStep[] = simulated.map((step, k): TraceStep => {
  const ev = events[k];
  if (ev.kind === 'visit') visitedSoFar.push(ev.u!);
  const vars: Record<string, string> = { ...(ev.u !== undefined ? { u: String(ev.u) } : {}), ...(ev.v !== undefined ? { v: String(ev.v) } : {}), dist: py(ev.dist), parent: py(ev.parent) };
  const table = step.table && { ...step.table, rows: step.table.rows.map(([n, d, p]) => [n, d.startsWith('∞') ? '-1（未發現）' : d, p === '起點' ? '-1（起點）' : p === '—' ? '-1' : p]) };
  let note = step.note;
  if (ev.kind === 'init') note += '程式用 −1 表示「還沒發現」，所以 `dist[v] == -1` 就是「沒拜訪過」的檢查，不需要另一個 visited 陣列。';
  if (ev.kind === 'visit') note += `${ev.skipped!.length ? `鄰居 ${ev.skipped!.join('、')} 的 dist 已經不是 −1（早就被發現、已在佇列中或已拜訪），第 10 行的條件不成立，跳過。` : ''}目前拜訪順序：${visitedSoFar.join(' → ')}。`;
  if (ev.kind === 'discover' && ev.v === 3) note += '3 也是 2 的鄰居，但 1 先被取出，所以 3 的 parent 是 1；兩條路 0 → 1 → 3 與 0 → 2 → 3 一樣長，BFS 記下先找到的那一條。';
  if (ev.kind === 'discover' && ev.v === 5) note += '5 也是 4 的鄰居，但 3 比 4 先入隊、先取出。不論經過 3 或 4，dist[5] 都是 3。';
  if (ev.kind === 'result') note = note.replace('（dist 仍是 ∞）', '（dist 仍是 −1）') + '第 14、15 行印出 dist 與 parent。用「自己試試看」把起點改成 6，只會拜訪 6 自己。';
  return { ...step, note, vars, ...(table ? { table } : {}), output: ev.kind === 'result' ? FINAL_OUTPUT : '' };
});

/**
 * Exercise worst cases, generated here (each about 1 MB of input).
 * Snake: 999 × 1000, open even rows, odd rows are walls with one gap alternating at the right and left ends; S at
 * (0, 0), E at (998, 0). Expected 499 × (999 + 2) + 999 = 500498, the output of the three reference solutions.
 */
const snakeInput = (() => {
  const R = 999, C = 1000;
  const rows = Array.from({ length: R }, (_, r) => {
    if (r % 2 === 0) return '.'.repeat(C);
    const gap = r % 4 === 1 ? C - 1 : 0;
    return '#'.repeat(gap) + '.' + '#'.repeat(C - 1 - gap);
  });
  rows[0] = 'S' + rows[0].slice(1);
  rows[R - 1] = 'E' + rows[R - 1].slice(1);
  return `${R} ${C}\n${rows.join('\n')}`;
})();
/**
 * Detour: 1000 × 1000 open grid with a wall in column 500 on rows 0–998 (row 999 is the only way through); S at
 * (0, 0), E at (0, 999): 999 down + 999 across + 999 up = 2997, while the Manhattan distance is only 999.
 */
const detourInput = (() => {
  const N = 1000;
  const rows = Array.from({ length: N }, (_, r) => r < N - 1 ? '.'.repeat(500) + '#' + '.'.repeat(N - 501) : '.'.repeat(N));
  rows[0] = 'S' + rows[0].slice(1, N - 1) + 'E';
  return `${N} ${N}\n${rows.join('\n')}`;
})();

/**
 * A14 BFS. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also offers
 * JavaScript (Node.js); its queues are an array (or Int32Array) with a head index, never shift().
 */
export const A14: LessonContent = {
  lessonId: 'A14',
  motivation: '迷宮從起點最少要走幾步？社群網路裡兩個人隔了幾層朋友？捷運從 A 站到 B 站最少要坐幾站？這些問題的共同點是：每走一步（每條邊）的代價都一樣，要找「邊數最少」的路。廣度優先搜尋（Breadth-First Search，BFS）從起點出發，先找出所有 1 步能到的點，再找 2 步能到的點，像水波一樣一層一層往外擴散，所以第一次碰到某個點時，走的就是最短的路。它用 D06 的佇列（queue）記住「下一個要處理誰」，用 D17 的鄰接串列（adjacency list）找出每個點的鄰居，時間只要 O(V + E)。格子地圖上的最少步數，是程式檢測實作題常見的題型。BFS 也有限制：邊有不同權重（例如每段路的時間不同）時，邊數最少不等於總時間最短，要改用 A16 的 Dijkstra；只想知道「到不到得了」或要走遍所有點時，A15 的 DFS 也可以。',
  sections: [
    {
      id: 'idea', title: '核心想法：用佇列一層一層擴展',
      blocks: [
        { type: 'p', text: 'BFS 的步驟只有三個：把起點放進佇列並標記「已發現」；只要佇列不空，就從前端取出一個節點 u，拜訪它；看 u 的每個鄰居 v，還沒被發現的就標記、記下距離，放到佇列尾端。佇列先進先出（FIFO），所以起點的鄰居（第 1 層）全部處理完之前，不會輪到第 2 層的節點；第 2 層全部處理完之前，也不會輪到第 3 層。' },
        { type: 'list', ordered: true, items: [
          '`dist` 全部設成 −1（代表還沒發現），`dist[start] = 0`，start 入隊。',
          '佇列不空時：`u = 從前端取出`，把 u 加進走訪順序。',
          '對 u 的每個鄰居 v：如果 `dist[v] == -1`，令 `dist[v] = dist[u] + 1`，v 入隊（入隊的同時就已經標記了）。',
          '佇列空了：所有從 start 到得了的節點都拜訪過，`dist` 仍是 −1 的節點就是到不了的。',
        ] },
        { type: 'example', id: 'bfs-order' },
        { type: 'p', text: '範例的圖有 8 個節點、8 條邊，鄰居依邊的輸入順序存放，例如 `adj[0] = [1, 4]`、`adj[1] = [0, 2, 5]`。從 0 出發：取出 0，發現 1、4（第 1 層）；取出 1，發現 2、5；取出 4，它的鄰居 0、5 都已發現；取出 2，發現 3；取出 5，發現 6；3、6 的鄰居都已發現。走訪順序 0 1 4 2 5 3 6 正好依層排列。節點 7 沒有任何邊，`dist[7]` 一直是 −1。鄰居的存放順序不同，同一層內的順序就會不同，但每個節點的距離不會變。' },
        { type: 'p', text: '頁面下方「相關互動實驗」中的 BFS 實驗室可以自己輸入節點（0 開始依序編號，最多 10 個）與邊，看佇列如何變化、哪些節點是「已發現」與「已拜訪」；它也只走訪起點所在的連通部分，鄰居依輸入邊的順序探索，和本課的寫法相同。' },
        { type: 'callout', tone: 'warning', title: '入隊時就標記，不要等到取出時', text: '如果改成「取出時才標記」，同一個節點在被取出之前，可能已經被好幾個鄰居各放進佇列一次。在 100 個節點兩兩相連的完全圖上，就算取出時跳過重複的，也要入隊 4951 次，而不是 100 次；在 1000 × 1000 的空地上是 1,998,001 次，佇列和時間都接近兩倍。更糟的是取出時不跳過、照樣展開鄰居：8 × 8 的空地從角落出發，總共入隊 12869 次（只有 64 格），格子越大增加得越快，很快就跑不完。正確寫法在「發現」的那一刻就標記，每個節點最多入隊一次。' },
      ],
    },
    {
      id: 'shortest', title: '無權最短距離：為什麼第一次發現就是最短的',
      blocks: [
        { type: 'p', text: '在無權圖（unweighted graph）中，路徑的長度就是經過的邊數。BFS 算出的 `dist[v]` 正是從起點到 v 的最少邊數。關鍵是佇列裡的距離永遠是非遞減的（non-decreasing）：任何時刻，佇列裡只有兩種距離 d 和 d + 1，而且所有 d 都排在 d + 1 前面。一開始只有起點（距離 0），成立；取出距離 d 的 u，放進去的鄰居距離是 d + 1，接在尾端，仍然成立。' },
        { type: 'p', text: '有了這個性質就能說明正確性：節點依距離由小到大被取出。假設 v 的真正最短距離是 k，最短路上 v 的前一個點 w 距離是 k − 1。w 會比所有距離 ≥ k 的點先被取出，取出 w 時，v 如果還沒被發現，就會在這時得到 `dist[v] = k`；如果早就被發現，發現它的點距離不會超過 k − 1，所以 `dist[v]` 也不會超過 k。另一方面，`dist[v]` 一定對應一條真的路徑，不可能比最短距離還小。所以第一次發現時記下的距離就是最短距離，之後不需要更新。' },
        { type: 'table', head: ['節點狀態', '在程式中的樣子', '意義'], rows: [
          ['未發現（undiscovered）', '`dist[v] == -1`', '還沒有任何路徑碰到它'],
          ['已發現、在佇列中（frontier）', '`dist[v] != -1`，還沒被取出', '距離已經確定，等著展開鄰居'],
          ['已拜訪（visited）', '已經從佇列取出', '鄰居都看過了'],
        ] },
        { type: 'p', text: '到不了的節點：BFS 只會走到起點所在的連通部分（connected component），其他節點的 `dist` 保持 −1（也可以用 ∞ 表示），輸出時要特別處理，例如印出 −1 或 `no path`。有向圖中，邊只能順著方向走：有一條 5 → 0 的邊，不代表從 0 能到 5。圖不連通時，如果題目要「每個點都走過」或要數連通部分有幾個，就依序檢查每個節點，遇到 `dist == -1` 的就從它再做一次 BFS；所有輪加起來，每個節點仍只入隊一次，總共還是 O(V + E)。' },
        { type: 'callout', tone: 'note', title: '多個起點：多源 BFS', text: '「每個格子離最近的出口有多遠」「火從好幾個地方同時開始燒，每格幾分鐘後著火」這類問題，不必對每個起點各做一次 BFS。把所有起點都設成距離 0、一起放進佇列，再照常執行，得到的 `dist[v]` 就是 v 到「最近的起點」的距離。原理相同：佇列裡的距離仍然非遞減。總時間仍是 O(V + E)，而不是起點數 × O(V + E)。' },
      ],
    },
    {
      id: 'path', title: '記錄父節點，還原最短路徑',
      blocks: [
        { type: 'p', text: '只知道距離還不夠時（例如要輸出怎麼走），再加一個 `parent` 陣列：v 從 u 第一次被發現時，記下 `parent[v] = u`。因為每個節點只被發現一次，`parent` 形成一棵以起點為根的樹，稱為 BFS 樹（BFS tree）；樹上從起點到 v 的路徑就是一條最短路徑。' },
        { type: 'p', text: '還原路徑的方法是倒著走：從終點 t 開始，不斷令 `v = parent[v]`，直到回到起點（起點的 parent 是 −1），把經過的點收集起來，最後反轉（reverse），就得到起點 → 終點的順序。路徑最多有 V 個點，還原是 O(V)。' },
        { type: 'example', id: 'shortest-path' },
        { type: 'p', text: '0 到 7 有好幾條路，例如 0 → 1 → 3 → 4 → 6 → 7（5 條邊）與 0 → 2 → 5 → 6 → 7（4 條邊）。6 是 5 先發現的（5 比 4 早入隊），所以 `parent[6] = 5`，從 7 倒著走得到 7 → 6 → 5 → 2 → 0，反轉後就是最短路徑。如果有好幾條一樣短的路，BFS 給的是「鄰居順序」決定的那一條：0 → 4 的兩條 3 邊路 0 → 1 → 3 → 4 與 0 → 2 → 3 → 4 中，1 先入隊，所以得到前者。題目若要求字典序最小的路徑，要把每個節點的鄰居先排序。' },
        { type: 'callout', tone: 'warning', title: '還原路徑的三個常見錯誤', text: '第一，忘了反轉，印出的是終點 → 起點。第二，終點到不了時，`parent[t]` 也是 −1，倒著走只會得到 `[t]`，看起來像一條路徑；要先用 `dist[t] == -1` 判斷「沒有路」。第三，在取出時才設 `parent`，或每次看到鄰居就覆寫 `parent`：後來的覆寫可能把 parent 改成距離更遠的點，路徑就不再最短。只在「第一次發現」時寫一次。' },
      ],
    },
    {
      id: 'grid', title: '格子地圖上的 BFS',
      blocks: [
        { type: 'p', text: '迷宮、地圖類的題目常給一個 R 列 C 行的字元格子：`.` 是空地、`#` 是牆、`S` 是起點、`E` 是終點，每一步往上下左右走一格，問最少幾步。這仍然是 BFS：每個格子是一個節點，相鄰且不是牆的格子之間有邊。不需要真的建出鄰接串列，「鄰居」用方向陣列（direction array）當場算出來：`dr = [-1, 1, 0, 0]`、`dc = [0, 0, -1, 1]`，第 k 個鄰居是 `(r + dr[k], c + dc[k])`。允許斜走時，就換成 8 個方向。' },
        { type: 'list', items: [
          '先檢查邊界：`0 <= nr < R` 而且 `0 <= nc < C`，成立才去讀 `grid[nr][nc]`。',
          '再檢查是不是牆，以及 `dist[nr][nc]` 是否還是 −1。',
          '起點、終點也是可以走的格子，只有 `#` 不能走。',
          '可以在取出 E 時就停下（那時 `dist` 已經是最短的），也可以跑完整個 BFS 再讀 `dist` 中 E 的那一格；佇列空了還沒碰到 E，就是到不了（−1）。',
          '把 `(r, c)` 編成一個整數 `r * C + c`，dist 用一維陣列，佇列也只放整數，在 C++／Java 裡比較省記憶體也比較快。',
        ] },
        { type: 'example', id: 'grid-steps' },
        { type: 'p', text: '迷宮 1 中 S 與 E 的曼哈頓距離（只看列差與行差）是 2 + 7 = 9，但牆擋住了直線，BFS 找到的最少步數是 11：先往下兩格，沿第 2 列走到第 3 行，繞到第 3 列避開 `(2, 4)` 的牆，再回到第 2 列走到 E。往上繞過第 0 列的路要 13 步，BFS 不會選它。迷宮 2 的 E 被牆隔在右邊，佇列空了也沒碰到 E，回傳 −1。' },
        { type: 'callout', tone: 'warning', title: '邊界檢查不能省，也不能放錯順序', text: '少了邊界檢查時，各語言的後果不同。Java 會丟出 `ArrayIndexOutOfBoundsException`（或 `StringIndexOutOfBoundsException`）；C++ 讀到陣列外面是未定義行為（undefined behavior），可能讀到垃圾值、悄悄算錯或當掉；Python 最危險：`grid[-1]` 是合法的，代表最後一列，所以從第 0 列往上走會「繞到」最底下一列，不會報錯，只會得到錯誤的步數。JavaScript 讀到界外不會報錯，只得到 `undefined`（例如 `grid[0][-1]`），可能悄悄算錯；但 `grid[-1][0]` 先得到 `undefined` 再往下讀，會丟出 `TypeError`。檢查也要寫在讀格子之前：先寫「是不是牆」再寫邊界的條件，在 Java 會先越界丟出例外，在 C++ 會先讀到界外；要把邊界寫在最前面，靠 `and`／`&&` 的短路求值（short-circuit evaluation）擋住後面的讀取。' },
        { type: 'p', text: '大小方面，1000 × 1000 的格子有 10^6 個節點、約 4 × 10^6 條邊（每格最多 4 個鄰居），BFS 是 O(RC)，對電腦來說很輕鬆。記憶體：C++／Java 的 `int` 距離陣列是 10^6 × 4 bytes ≈ 4 MB；Python 的 list 每格存一個指標（8 bytes），約 8 MB；JavaScript 用 `Int32Array` 也是約 4 MB。不要用遞迴的 DFS 找最短步數：它找到的第一條路不一定最短，而且在大格子上遞迴太深（Python 預設上限約 1000 層，C++／Java 可能堆疊溢位，JavaScript 約一萬層就丟出 `RangeError`）。BFS 只用迴圈和佇列，沒有這個問題。' },
      ],
    },
    {
      id: 'complexity', title: '複雜度、語言的佇列，以及和 DFS、Dijkstra 的比較',
      blocks: [
        { type: 'p', text: '用鄰接串列時，每個節點最多入隊、出隊一次，共 O(V)；每個節點出隊時掃過它的鄰居串列，所有串列的長度加起來是 E（有向圖）或 2E（無向圖），共 O(E)。總時間 O(V + E)，額外空間是 `dist`、`parent` 與佇列，O(V)。改用 D17 的鄰接矩陣時，找 u 的鄰居要掃整列 V 格，不論它真正有幾個鄰居，總時間變成 O(V²)；V = 10^5 時，光是矩陣就要 10^10 格，連記憶體都放不下。BFS 幾乎都用鄰接串列。' },
        { type: 'table', head: ['語言', '建議的佇列', '入隊／取出', '要避免的寫法'], rows: [
          ['C++', '`std::queue<int>`（預設底層是 `std::deque`）', '`q.push(v)`；`q.front()` 讀前端、`q.pop()` 移除（`pop` 不回傳值）', '對空佇列呼叫 `front()`／`pop()` 是未定義行為，先檢查 `!q.empty()`'],
          ['Python', '`collections.deque`', '`q.append(v)`；`q.popleft()`', '`list.pop(0)` 每次要把後面的元素全部往前移，是 O(n)，10^6 個節點時總共約 10^12 次移動'],
          ['Java', '`ArrayDeque<Integer>`（宣告成 `Queue<Integer>` 或 `ArrayDeque<Integer>`）', '`q.add(v)`／`q.offer(v)`；`q.poll()`（空時回傳 `null`）', '`ArrayDeque` 不能放 `null`；`LinkedList` 也能當佇列，但通常比較慢'],
          ['JavaScript', '沒有內建佇列；用陣列加一個前端索引 `head`', '`q.push(v)`；`q[head++]` 取出，`head < q.length` 表示不空', '`q.shift()` 每次要把後面的元素全部往前移，是 O(n)，和 Python 的 `list.pop(0)` 一樣慢'],
        ] },
        { type: 'p', text: '把佇列換成堆疊（stack），例如 Python 用 `list.pop()` 從尾端取、Java 的 `Deque` 用 `pop()`，或 JavaScript 用 `q.pop()`，程式照樣能跑完、也會走遍所有點，但取出的順序變成「最後發現的先處理」，那是深度優先的走法，算出的 `dist` 就不再是最短距離。只要問「最少幾步」，一定要確認是從前端取出。' },
        { type: 'table', head: ['', 'BFS（本課）', 'DFS（A15）', 'Dijkstra（A16）'], rows: [
          ['容器', '佇列', '堆疊或遞迴', '優先佇列（priority queue）'],
          ['走訪方式', '一層一層向外', '一條路走到底再回頭', '每次處理目前總距離最小的'],
          ['最短路徑', '無權圖的最少邊數', '不保證', '非負權重圖的最小總權重'],
          ['時間', 'O(V + E)', 'O(V + E)', 'O((V + E) log V)'],
          ['適合', '最少步數、層級、多源擴散', '連通性、找環、拓樸排序、回溯', '每條邊代價不同的最短路徑'],
        ] },
        { type: 'p', text: '在每條邊權重都相同（例如都是 5 分鐘）的圖上，BFS 的邊數乘以權重就是最短時間，不必用 Dijkstra。權重不同時，BFS 選的「邊最少」的路可能總時間更長，就必須用 Dijkstra。只問「從 A 能不能到 B」「有幾個連通部分」時，BFS 和 DFS 都可以，選順手的寫法即可。' },
      ],
    },
  ],
  examples: [
    {
      id: 'bfs-order', title: 'BFS 的走訪順序、距離與分層', description: '在 8 個節點的無向圖上從 0 出發，印出走訪順序、每個節點的距離，並依距離分層；節點 7 到不了。',
      output: 'order: 0 1 4 2 5 3 6\ndist: 0 1 2 3 1 2 3 -1\nlayer 0: 0\nlayer 1: 1 4\nlayer 2: 2 5\nlayer 3: 3 6\nunreachable: 7',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <queue>
#include <utility>
#include <vector>

// 回傳走訪順序；dist[v] = -1 代表從 start 到不了 v。
std::vector<int> bfs(const std::vector<std::vector<int>>& adj, int start, std::vector<int>& dist) {
    dist.assign(adj.size(), -1);
    std::vector<int> order;
    std::queue<int> q;
    dist[start] = 0;  // 入隊時就標記
    q.push(start);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        order.push_back(u);
        for (int v : adj[u]) {
            if (dist[v] == -1) {  // 第一次發現 v
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }
    return order;
}

int main() {
    const int n = 8;
    std::vector<std::pair<int, int>> edges = {{0, 1}, {0, 4}, {1, 2}, {1, 5}, {4, 5}, {2, 3}, {5, 6}, {3, 6}};
    std::vector<std::vector<int>> adj(n);
    for (const auto& [u, v] : edges) {  // 無向圖：兩個方向都加
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    std::vector<int> dist;
    std::vector<int> order = bfs(adj, 0, dist);
    std::cout << "order:";
    for (int v : order) std::cout << ' ' << v;
    std::cout << "\ndist:";
    for (int d : dist) std::cout << ' ' << d;
    std::cout << "\n";
    int maxDist = 0;
    for (int d : dist) maxDist = std::max(maxDist, d);
    for (int d = 0; d <= maxDist; ++d) {
        std::cout << "layer " << d << ":";
        for (int v = 0; v < n; ++v) if (dist[v] == d) std::cout << ' ' << v;
        std::cout << "\n";
    }
    std::cout << "unreachable:";
    for (int v = 0; v < n; ++v) if (dist[v] == -1) std::cout << ' ' << v;
    std::cout << "\n";
    return 0;
}`,
        Python: code`from collections import deque


def bfs(adj, start):
    """回傳 (走訪順序, dist)；dist[v] = -1 代表從 start 到不了 v。"""
    dist = [-1] * len(adj)
    dist[start] = 0  # 入隊時就標記
    q = deque([start])
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            if dist[v] == -1:  # 第一次發現 v
                dist[v] = dist[u] + 1
                q.append(v)
    return order, dist


n = 8
edges = [(0, 1), (0, 4), (1, 2), (1, 5), (4, 5), (2, 3), (5, 6), (3, 6)]
adj = [[] for _ in range(n)]
for u, v in edges:  # 無向圖：兩個方向都加
    adj[u].append(v)
    adj[v].append(u)

order, dist = bfs(adj, 0)
print("order:", *order)
print("dist:", *dist)
for d in range(max(dist) + 1):
    print(f"layer {d}:", *[v for v in range(n) if dist[v] == d])
print("unreachable:", *[v for v in range(n) if dist[v] == -1])`,
        Java: code`import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class Main {
    // 回傳走訪順序；dist[v] = -1 代表從 start 到不了 v。
    static List<Integer> bfs(List<List<Integer>> adj, int start, int[] dist) {
        Arrays.fill(dist, -1);
        List<Integer> order = new ArrayList<>();
        ArrayDeque<Integer> q = new ArrayDeque<>();
        dist[start] = 0;  // 入隊時就標記
        q.add(start);
        while (!q.isEmpty()) {
            int u = q.poll();
            order.add(u);
            for (int v : adj.get(u)) {
                if (dist[v] == -1) {  // 第一次發現 v
                    dist[v] = dist[u] + 1;
                    q.add(v);
                }
            }
        }
        return order;
    }

    public static void main(String[] args) {
        int n = 8;
        int[][] edges = {{0, 1}, {0, 4}, {1, 2}, {1, 5}, {4, 5}, {2, 3}, {5, 6}, {3, 6}};
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) {  // 無向圖：兩個方向都加
            adj.get(e[0]).add(e[1]);
            adj.get(e[1]).add(e[0]);
        }
        int[] dist = new int[n];
        List<Integer> order = bfs(adj, 0, dist);
        StringBuilder sb = new StringBuilder("order:");
        for (int v : order) sb.append(' ').append(v);
        sb.append("\ndist:");
        for (int d : dist) sb.append(' ').append(d);
        sb.append('\n');
        int maxDist = Arrays.stream(dist).max().getAsInt();
        for (int d = 0; d <= maxDist; d++) {
            sb.append("layer ").append(d).append(':');
            for (int v = 0; v < n; v++) if (dist[v] == d) sb.append(' ').append(v);
            sb.append('\n');
        }
        sb.append("unreachable:");
        for (int v = 0; v < n; v++) if (dist[v] == -1) sb.append(' ').append(v);
        System.out.println(sb);
    }
}`,
        JavaScript: code`// 回傳 [走訪順序, dist]；dist[v] = -1 代表從 start 到不了 v。
function bfs(adj, start) {
    const dist = new Array(adj.length).fill(-1);
    const order = [];
    const q = [start];  // 陣列當佇列：head 指向前端，不用 shift()（O(n)）
    let head = 0;
    dist[start] = 0;    // 入隊時就標記
    while (head < q.length) {
        const u = q[head++];
        order.push(u);
        for (const v of adj[u]) {
            if (dist[v] === -1) {  // 第一次發現 v
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }
    return [order, dist];
}

const n = 8;
const edges = [[0, 1], [0, 4], [1, 2], [1, 5], [4, 5], [2, 3], [5, 6], [3, 6]];
const adj = Array.from({ length: n }, () => []);
for (const [u, v] of edges) {  // 無向圖：兩個方向都加
    adj[u].push(v);
    adj[v].push(u);
}

const [order, dist] = bfs(adj, 0);
console.log("order: " + order.join(" "));
console.log("dist: " + dist.join(" "));
const nodes = [...Array(n).keys()];  // [0, 1, ..., n - 1]
for (let d = 0; d <= Math.max(...dist); d++) {
    console.log("layer " + d + ": " + nodes.filter(v => dist[v] === d).join(" "));
}
console.log("unreachable: " + nodes.filter(v => dist[v] === -1).join(" "));`,
      },
    },
    {
      id: 'shortest-path', title: '用 parent 還原最短路徑', description: '從 0 出發做 BFS，記錄每個節點的 parent，再從終點倒著走回起點並反轉；終點到不了時印出 no path。',
      output: 'parent: -1 0 0 1 3 2 5 6 -1\n0 -> 7: 4 edges, path 0 -> 2 -> 5 -> 6 -> 7\n0 -> 4: 3 edges, path 0 -> 1 -> 3 -> 4\n0 -> 8: no path',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <queue>
#include <utility>
#include <vector>

void bfs(const std::vector<std::vector<int>>& adj, int start, std::vector<int>& dist, std::vector<int>& parent) {
    dist.assign(adj.size(), -1);
    parent.assign(adj.size(), -1);
    std::queue<int> q;
    dist[start] = 0;
    q.push(start);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : adj[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                parent[v] = u;  // v 是從 u 第一次被發現的
                q.push(v);
            }
        }
    }
}

std::vector<int> buildPath(const std::vector<int>& parent, int target) {
    std::vector<int> path;
    for (int v = target; v != -1; v = parent[v]) path.push_back(v);  // 從終點沿著 parent 走回起點
    std::reverse(path.begin(), path.end());  // 收集到的是 終點 → 起點，反轉
    return path;
}

int main() {
    const int n = 9;
    std::vector<std::pair<int, int>> edges = {{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}, {2, 5}, {5, 6}, {4, 6}, {6, 7}};
    std::vector<std::vector<int>> adj(n);
    for (const auto& [u, v] : edges) {
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    std::vector<int> dist, parent;
    bfs(adj, 0, dist, parent);
    std::cout << "parent:";
    for (int p : parent) std::cout << ' ' << p;
    std::cout << "\n";
    for (int target : {7, 4, 8}) {
        if (dist[target] == -1) {
            std::cout << "0 -> " << target << ": no path\n";
            continue;
        }
        std::vector<int> path = buildPath(parent, target);
        std::cout << "0 -> " << target << ": " << dist[target] << " edges, path ";
        for (std::size_t i = 0; i < path.size(); ++i) std::cout << (i ? " -> " : "") << path[i];
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`from collections import deque


def bfs(adj, start):
    dist = [-1] * len(adj)
    parent = [-1] * len(adj)
    dist[start] = 0
    q = deque([start])
    while q:
        u = q.popleft()
        for v in adj[u]:
            if dist[v] == -1:
                dist[v] = dist[u] + 1
                parent[v] = u  # v 是從 u 第一次被發現的
                q.append(v)
    return dist, parent


def build_path(parent, target):
    path = []
    v = target
    while v != -1:  # 從終點沿著 parent 走回起點
        path.append(v)
        v = parent[v]
    path.reverse()  # 收集到的是 終點 → 起點，反轉
    return path


n = 9
edges = [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4), (2, 5), (5, 6), (4, 6), (6, 7)]
adj = [[] for _ in range(n)]
for u, v in edges:
    adj[u].append(v)
    adj[v].append(u)

dist, parent = bfs(adj, 0)
print("parent:", *parent)
for target in [7, 4, 8]:
    if dist[target] == -1:
        print(f"0 -> {target}: no path")
    else:
        path = build_path(parent, target)
        print(f"0 -> {target}: {dist[target]} edges, path", " -> ".join(map(str, path)))`,
        Java: code`import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class Main {
    static void bfs(List<List<Integer>> adj, int start, int[] dist, int[] parent) {
        Arrays.fill(dist, -1);
        Arrays.fill(parent, -1);
        ArrayDeque<Integer> q = new ArrayDeque<>();
        dist[start] = 0;
        q.add(start);
        while (!q.isEmpty()) {
            int u = q.poll();
            for (int v : adj.get(u)) {
                if (dist[v] == -1) {
                    dist[v] = dist[u] + 1;
                    parent[v] = u;  // v 是從 u 第一次被發現的
                    q.add(v);
                }
            }
        }
    }

    static List<Integer> buildPath(int[] parent, int target) {
        List<Integer> path = new ArrayList<>();
        for (int v = target; v != -1; v = parent[v]) path.add(v);  // 從終點沿著 parent 走回起點
        Collections.reverse(path);  // 收集到的是 終點 → 起點，反轉
        return path;
    }

    public static void main(String[] args) {
        int n = 9;
        int[][] edges = {{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}, {2, 5}, {5, 6}, {4, 6}, {6, 7}};
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) {
            adj.get(e[0]).add(e[1]);
            adj.get(e[1]).add(e[0]);
        }
        int[] dist = new int[n];
        int[] parent = new int[n];
        bfs(adj, 0, dist, parent);
        StringBuilder sb = new StringBuilder("parent:");
        for (int p : parent) sb.append(' ').append(p);
        sb.append('\n');
        for (int target : new int[] {7, 4, 8}) {
            if (dist[target] == -1) {
                sb.append("0 -> ").append(target).append(": no path\n");
                continue;
            }
            List<Integer> path = buildPath(parent, target);
            sb.append("0 -> ").append(target).append(": ").append(dist[target]).append(" edges, path ");
            for (int i = 0; i < path.size(); i++) sb.append(i > 0 ? " -> " : "").append(path.get(i));
            sb.append('\n');
        }
        System.out.print(sb);
    }
}`,
        JavaScript: code`function bfs(adj, start) {
    const dist = new Array(adj.length).fill(-1);
    const parent = new Array(adj.length).fill(-1);
    const q = [start];
    let head = 0;
    dist[start] = 0;
    while (head < q.length) {
        const u = q[head++];
        for (const v of adj[u]) {
            if (dist[v] === -1) {
                dist[v] = dist[u] + 1;
                parent[v] = u;  // v 是從 u 第一次被發現的
                q.push(v);
            }
        }
    }
    return [dist, parent];
}

function buildPath(parent, target) {
    const path = [];
    for (let v = target; v !== -1; v = parent[v]) path.push(v);  // 從終點沿著 parent 走回起點
    return path.reverse();  // 收集到的是 終點 → 起點，反轉
}

const n = 9;
const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [2, 5], [5, 6], [4, 6], [6, 7]];
const adj = Array.from({ length: n }, () => []);
for (const [u, v] of edges) {
    adj[u].push(v);
    adj[v].push(u);
}

const [dist, parent] = bfs(adj, 0);
console.log("parent: " + parent.join(" "));
for (const target of [7, 4, 8]) {
    if (dist[target] === -1) {
        console.log("0 -> " + target + ": no path");
    } else {
        const path = buildPath(parent, target);
        console.log("0 -> " + target + ": " + dist[target] + " edges, path " + path.join(" -> "));
    }
}`,
      },
    },
    {
      id: 'grid-steps', title: '格子迷宮的最少步數', description: '用方向陣列在兩個迷宮上做 BFS，求 S 走到 E 的最少步數（上下左右），走不到時回傳 −1。',
      output: 'maze 1: 11\nmaze 2: -1',
      code: {
        'C++': code`#include <iostream>
#include <queue>
#include <string>
#include <utility>
#include <vector>

const int DR[4] = {-1, 1, 0, 0};  // 上、下、左、右
const int DC[4] = {0, 0, -1, 1};

int shortestSteps(const std::vector<std::string>& grid) {
    int rows = static_cast<int>(grid.size()), cols = static_cast<int>(grid[0].size());
    int sr = 0, sc = 0;
    for (int r = 0; r < rows; ++r)
        for (int c = 0; c < cols; ++c)
            if (grid[r][c] == 'S') { sr = r; sc = c; }
    std::vector<std::vector<int>> dist(rows, std::vector<int>(cols, -1));
    std::queue<std::pair<int, int>> q;
    dist[sr][sc] = 0;
    q.push({sr, sc});
    while (!q.empty()) {
        auto [r, c] = q.front();
        q.pop();
        if (grid[r][c] == 'E') return dist[r][c];  // 第一次取出 E 時，距離就是最短
        for (int k = 0; k < 4; ++k) {
            int nr = r + DR[k], nc = c + DC[k];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;  // 先檢查邊界
            if (grid[nr][nc] == '#' || dist[nr][nc] != -1) continue;
            dist[nr][nc] = dist[r][c] + 1;
            q.push({nr, nc});
        }
    }
    return -1;  // 佇列空了還沒遇到 E
}

int main() {
    std::vector<std::string> maze1 = {"S.#.....",
                                      ".##.##.#",
                                      "....#..E",
                                      ".##...##"};
    std::vector<std::string> maze2 = {"S.#..",
                                      "..#.E",
                                      "###.."};
    std::cout << "maze 1: " << shortestSteps(maze1) << "\n";
    std::cout << "maze 2: " << shortestSteps(maze2) << "\n";
    return 0;
}`,
        Python: code`from collections import deque

DR = (-1, 1, 0, 0)  # 上、下、左、右
DC = (0, 0, -1, 1)


def shortest_steps(grid):
    rows, cols = len(grid), len(grid[0])
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == "S":
                sr, sc = r, c
    dist = [[-1] * cols for _ in range(rows)]
    dist[sr][sc] = 0
    q = deque([(sr, sc)])
    while q:
        r, c = q.popleft()
        if grid[r][c] == "E":  # 第一次取出 E 時，距離就是最短
            return dist[r][c]
        for k in range(4):
            nr, nc = r + DR[k], c + DC[k]
            if not (0 <= nr < rows and 0 <= nc < cols):  # 先檢查邊界
                continue
            if grid[nr][nc] == "#" or dist[nr][nc] != -1:
                continue
            dist[nr][nc] = dist[r][c] + 1
            q.append((nr, nc))
    return -1  # 佇列空了還沒遇到 E


maze1 = ["S.#.....",
         ".##.##.#",
         "....#..E",
         ".##...##"]
maze2 = ["S.#..",
         "..#.E",
         "###.."]
print("maze 1:", shortest_steps(maze1))
print("maze 2:", shortest_steps(maze2))`,
        Java: code`import java.util.ArrayDeque;
import java.util.Arrays;

public class Main {
    static final int[] DR = {-1, 1, 0, 0};  // 上、下、左、右
    static final int[] DC = {0, 0, -1, 1};

    static int shortestSteps(String[] grid) {
        int rows = grid.length, cols = grid[0].length();
        int sr = 0, sc = 0;
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++)
                if (grid[r].charAt(c) == 'S') { sr = r; sc = c; }
        int[][] dist = new int[rows][cols];
        for (int[] row : dist) Arrays.fill(row, -1);
        ArrayDeque<int[]> q = new ArrayDeque<>();
        dist[sr][sc] = 0;
        q.add(new int[] {sr, sc});
        while (!q.isEmpty()) {
            int[] cell = q.poll();
            int r = cell[0], c = cell[1];
            if (grid[r].charAt(c) == 'E') return dist[r][c];  // 第一次取出 E 時，距離就是最短
            for (int k = 0; k < 4; k++) {
                int nr = r + DR[k], nc = c + DC[k];
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;  // 先檢查邊界
                if (grid[nr].charAt(nc) == '#' || dist[nr][nc] != -1) continue;
                dist[nr][nc] = dist[r][c] + 1;
                q.add(new int[] {nr, nc});
            }
        }
        return -1;  // 佇列空了還沒遇到 E
    }

    public static void main(String[] args) {
        String[] maze1 = {"S.#.....",
                          ".##.##.#",
                          "....#..E",
                          ".##...##"};
        String[] maze2 = {"S.#..",
                          "..#.E",
                          "###.."};
        System.out.println("maze 1: " + shortestSteps(maze1));
        System.out.println("maze 2: " + shortestSteps(maze2));
    }
}`,
        JavaScript: code`const DR = [-1, 1, 0, 0];  // 上、下、左、右
const DC = [0, 0, -1, 1];

function shortestSteps(grid) {
    const rows = grid.length, cols = grid[0].length;
    let sr = 0, sc = 0;
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            if (grid[r][c] === "S") { sr = r; sc = c; }
    const dist = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    const q = [[sr, sc]];
    let head = 0;
    dist[sr][sc] = 0;
    while (head < q.length) {
        const [r, c] = q[head++];
        if (grid[r][c] === "E") return dist[r][c];  // 第一次取出 E 時，距離就是最短
        for (let k = 0; k < 4; k++) {
            const nr = r + DR[k], nc = c + DC[k];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;  // 先檢查邊界
            if (grid[nr][nc] === "#" || dist[nr][nc] !== -1) continue;
            dist[nr][nc] = dist[r][c] + 1;
            q.push([nr, nc]);
        }
    }
    return -1;  // 佇列空了還沒遇到 E
}

const maze1 = ["S.#.....",
               ".##.##.#",
               "....#..E",
               ".##...##"];
const maze2 = ["S.#..",
               "..#.E",
               "###.."];
console.log("maze 1: " + shortestSteps(maze1));
console.log("maze 2: " + shortestSteps(maze2));`,
      },
    },
  ],
  visualization: {
    kind: 'graph-traversal', title: 'BFS：佇列、dist 與 parent 一層一層填滿', language: 'Python',
    code: code`from collections import deque
adj = [[1, 2], [0, 3], [0, 3, 4], [1, 2, 5], [2, 5], [3, 4], []]
dist = [-1] * 7
parent = [-1] * 7
dist[0] = 0
q = deque([0])
while q:
    u = q.popleft()
    for v in adj[u]:
        if dist[v] == -1:
            dist[v] = dist[u] + 1
            parent[v] = u
            q.append(v)
print(dist)
print(parent)`,
    steps: traceSteps,
    tryIt: { algorithm: 'bfs', nodes: TRACE_NODES, edges: TRACE_EDGES, directed: false, start: '0' },
  },
  quiz: [
    {
      id: 'q-order', prompt: '下面的程式從節點 2 開始做 BFS，印出什麼？',
      code: { language: 'Python', text: code`from collections import deque
adj = [[1, 3], [0, 2, 4], [1, 5], [0, 4], [1, 3, 5], [2, 4]]
seen = [False] * 6
seen[2] = True
q = deque([2])
while q:
    u = q.popleft()
    print(u, end=' ')
    for v in adj[u]:
        if not seen[v]:
            seen[v] = True
            q.append(v)` },
      options: ['2 1 5 0 4 3', '2 1 0 3 4 5', '0 1 2 3 4 5', '2 5 4 3 0 1'],
      answer: 0, explanation: '取出 2，發現 1、5（第 1 層）；取出 1，發現 0、4（2 已發現）；取出 5，鄰居 2、4 都已發現；取出 0，發現 3；最後取出 4、3。所以是 2 1 5 0 4 3。「2 1 0 3 4 5」是一路往深處走的遞迴 DFS 順序；「0 1 2 3 4 5」只是照編號排；「2 5 4 3 0 1」是把 `popleft()` 誤寫成 `pop()`、從尾端取出（堆疊）的結果，程式一樣能跑完，但已經不是一層一層了。',
    },
    {
      id: 'q-dist', prompt: '下面的程式在有向圖上做 BFS，印出什麼？',
      code: { language: 'Python', text: code`from collections import deque
edges = [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4), (4, 1), (5, 0)]
adj = [[] for _ in range(6)]
for u, v in edges:
    adj[u].append(v)
dist = [-1] * 6
dist[0] = 0
q = deque([0])
while q:
    u = q.popleft()
    for v in adj[u]:
        if dist[v] == -1:
            dist[v] = dist[u] + 1
            q.append(v)
print(dist)` },
      options: ['[0, 1, 1, 2, 3, -1]', '[0, 1, 1, 2, 3, 1]', '[0, 1, 1, 2, 2, -1]', '[0, 1, 1, 3, 4, -1]'],
      answer: 0, explanation: '邊只加了 u → v 一個方向。0 → 1、0 → 2 得到距離 1；1 → 3 得到 2（之後 2 → 3 發現 3 已有距離，不更新）；3 → 4 得到 3；4 → 1 指回已發現的 1。邊 5 → 0 是從 5 出發，從 0 走不到 5，dist[5] 仍是 −1。「…, 1]」把圖當成無向；「[0, 1, 1, 2, 2, -1]」以為 4 → 1 能讓 1 走到 4，方向反了；「[0, 1, 1, 3, 4, -1]」以為 3 由 2 再發現一次會變大，但 BFS 第一次發現就是最短。',
    },
    {
      id: 'q-mark', prompt: '這個版本在「取出時」才標記 visited。在 4 個節點兩兩相連的圖上，它總共 append（含起點）幾次？',
      code: { language: 'Python', text: code`from collections import deque
adj = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]]
visited = [False] * 4
q = deque([0])
pushes = 1
while q:
    u = q.popleft()
    visited[u] = True
    for v in adj[u]:
        if not visited[v]:
            q.append(v)
            pushes += 1
print(pushes)` },
      options: ['4', '7', '13', '無窮迴圈，不會印出'],
      answer: 1, explanation: '取出 0：1、2、3 都還沒標記，全部入隊（共 4 次）。取出 1：只有 0、1 已標記，2、3 又入隊一次（6 次）。取出 2：3 還沒標記，再入隊（7 次）。之後佇列裡剩下的 3、2、3、3 取出時鄰居都已標記，不再入隊，印出 7。入隊時就標記的正確寫法只會入隊 4 次。13 是以為每次都把 3 個鄰居全部放進去；因為 visited 最後會全部變成 True，佇列終究會變空，不會無窮迴圈，但圖越大浪費越多。',
    },
    {
      id: 'q-path', prompt: 'BFS 從 0 出發，得到下面的 parent 陣列（−1 代表沒有父節點）。程式印出什麼？',
      code: { language: 'Python', text: code`parent = [-1, 0, 0, 1, 2, 3, 3]
path = []
v = 6
while v != -1:
    path.append(v)
    v = parent[v]
print(path[::-1])` },
      options: ['[0, 1, 3, 6]', '[6, 3, 1, 0]', '[0, 2, 4, 6]', '[0, 1, 3, 5, 6]'],
      answer: 0, explanation: '從 6 倒著走：parent[6] = 3、parent[3] = 1、parent[1] = 0、parent[0] = −1 停下，收集到 [6, 3, 1, 0]，`[::-1]` 反轉成 [0, 1, 3, 6]。「[6, 3, 1, 0]」是忘了反轉；「[0, 2, 4, 6]」把 parent[v] 當成 v 的孩子；「[0, 1, 3, 5, 6]」以為 5 和 6 是兄弟就會經過 5，但 parent[6] 直接是 3。',
    },
    {
      id: 'q-complexity', prompt: '一張無向圖有 V = 10^5 個節點、E = 2 × 10^5 條邊。分別用鄰接串列與鄰接矩陣做一次 BFS，哪個描述正確？',
      options: ['串列 O(V + E)，約 5 × 10^5 次基本操作；矩陣 O(V²)，約 10^10 次，而且矩陣本身就要 10^10 格', '兩者都是 O(V + E)，只差在常數', '串列 O(E log V)；矩陣 O(V + E)', '兩者都是 O(V²)，因為每個節點都可能和其他所有節點相連'],
      answer: 0, explanation: '串列：每個節點入隊一次（V），所有串列長度總和 2E = 4 × 10^5，加起來約 5 × 10^5。矩陣：找鄰居要掃整列 V 格，V 個節點共 V² = 10^10 格，不論實際的邊有多少，而且 10^10 格的矩陣連記憶體都放不下。BFS 用不到排序或優先佇列，沒有 log V；只有邊數接近 V² 的稠密圖，兩者才差不多。',
    },
    {
      id: 'q-grid-bug', prompt: '下面的格子 BFS 有一個錯誤。中間一整列都是牆，S 本來走不到 E。程式印出什麼？',
      code: { language: 'Python', text: code`from collections import deque
grid = ["S..",
        "###",
        "..E"]
R, C = 3, 3
dist = [[-1] * C for _ in range(R)]
dist[0][0] = 0
q = deque([(0, 0)])
while q:
    r, c = q.popleft()
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nr, nc = r + dr, c + dc
        if nr < R and nc < C and grid[nr][nc] != '#' and dist[nr][nc] == -1:
            dist[nr][nc] = dist[r][c] + 1
            q.append((nr, nc))
print(dist[2][2])` },
      options: ['-1', '2', '3', '丟出 IndexError'],
      answer: 1, explanation: '條件漏了 `nr >= 0` 與 `nc >= 0`。從 (0, 0) 往上得到 nr = −1，Python 的 `grid[-1][0]` 是合法的，代表最後一列的 (2, 0)，於是它被當成 1 步，存進佇列的是 (−1, 0)；取出它再往左得到 (−1, −1)，`grid[-1][-1]` 就是 E，`dist[-1][-1]` 也就是 `dist[2][2]` 被設成 2。程式不報錯，只是穿過了邊界，印出 2，正確答案應該是 −1。Python 的負索引不會丟出 IndexError（Java 會丟出例外，C++ 是未定義行為）；3 是以為只有列會繞過去、行不會（(2, 0) → (2, 1) → (2, 2)）。',
    },
    {
      id: 'q-choose', prompt: '三個問題：(1) 迷宮中從 S 到 E 最少幾步；(2) 捷運各站之間的行車時間不同，求 A 站到 B 站最短的總時間；(3) 判斷一張圖分成幾個連通部分。依序最適合的方法是？',
      options: ['BFS；Dijkstra；BFS 或 DFS 都可以', 'BFS；BFS；DFS', 'DFS；Dijkstra；BFS', 'Dijkstra；BFS；Dijkstra'],
      answer: 0, explanation: '(1) 每步代價相同，BFS 第一次碰到 E 就是最少步數。(2) 邊權重不同，邊數最少的路總時間不一定最短，要用 Dijkstra（A16）。(3) 只問連通性，對每個還沒走過的節點做一次 BFS 或 DFS（A15）都是 O(V + E)。用 BFS 解 (2) 會忽略權重；DFS 找到的第一條路不一定最短，不能解 (1)；Dijkstra 雖然也能解 (1)，但多了優先佇列的 log V，而且 (2) 不能用 BFS。',
    },
  ],
  exercises: [
    {
      id: 'e-grid-steps', title: '迷宮最少步數',
      statement: '給一個 R 列 C 行的迷宮，每一格是 `.`（空地）、`#`（牆）、`S`（起點）或 `E`（終點）之一。每一步可以往上、下、左、右走到相鄰而且不是牆的格子，不能走出迷宮。請輸出從 S 走到 E 的最少步數；走不到就輸出 −1。迷宮最大有 1000 × 1000 = 10^6 格，請用佇列實作 BFS，做到 O(RC)：用遞迴 DFS 找路不保證最短，在大迷宮上還會遞迴過深；直接回答曼哈頓距離會忽略牆。輸入不合法時只輸出 `Invalid`。',
      inputFormat: '第一行兩個整數 R C。接下來 R 行，每行是一個長度剛好為 C 的字串，只含 `.`、`#`、`S`、`E`，中間沒有空白。',
      outputFormat: '一行一個整數：最少步數，或 −1（走不到）；輸入不合法時只輸出一行 `Invalid`。',
      constraints: [
        '1 ≤ R ≤ 1000，1 ≤ C ≤ 1000，R、C 是十進位非負整數（否則輸出 Invalid）',
        '剛好 R 行，每行長度剛好是 C，只含 `.`、`#`、`S`、`E`（否則輸出 Invalid）',
        '`S` 與 `E` 各剛好出現一次（否則輸出 Invalid）；它們是不同的格子，所以 1 × 1 的迷宮一定不合法',
      ],
      samples: [{ kind: 'normal', input: '4 8\nS.#.....\n.##.##.#\n....#..E\n.##...##', output: '11', note: '牆擋住直線，要繞路；曼哈頓距離只有 9' }],
      tests: [
        { kind: 'normal', input: '4 8\nS.#.....\n.##.##.#\n....#..E\n.##...##', output: '11', note: '範例' },
        { kind: 'normal', input: '3 5\nS....\n.###.\n....E', output: '6', note: '上下兩條一樣短的路' },
        { kind: 'normal', input: '5 5\n.....\n.###.\n.#E#.\n.#.#.\nS....', output: '4', note: 'E 被三面牆包圍，只能從下方進入' },
        { kind: 'normal', input: '4 6\n#.....\n#.##.#\nS.#E.#\n###...', output: '9', note: '要先往上繞過整排牆，再從右邊折回 E' },
        { kind: 'edge', input: '1 2\nSE', output: '1', note: 'S 與 E 相鄰，最小的合法迷宮' },
        { kind: 'edge', input: '2 1\nE\nS', output: '1', note: '只有一行；E 在 S 的上方' },
        { kind: 'edge', input: '3 3\nS..\n###\n..E', output: '-1', note: '一整列牆隔開：沒檢查 nr >= 0 的 Python 程式會從第 0 列「繞」到最後一列，誤答 2' },
        { kind: 'edge', input: '3 4\nS#..\n##..\n...E', output: '-1', note: 'S 被牆與邊界圍住' },
        { kind: 'edge', input: '3 3\n.#.\n#E#\nS#.', output: '-1', note: 'E 被四面牆包圍' },
        { kind: 'edge', input: '2 3\n..S\nE##', output: '3', note: 'S 在右上角、E 在左下角：檢查最後一行與最後一列的邊界' },
        { kind: 'edge', input: snakeInput, output: '500498', note: '999 × 1000 的蛇形通道（約 1 MB），S 到 E 要走 500498 步：路徑非常長，也打敗只看曼哈頓距離的做法' },
        { kind: 'edge', input: detourInput, output: '2997', note: '1000 × 1000 幾乎全空的格子，第 500 行有一道只在最底下留缺口的牆；曼哈頓距離是 999，實際要 2997 步。Python 用 `list.pop(0)` 會非常慢' },
        { kind: 'error', input: '3 3\nS..\n...\n...', output: 'Invalid', note: '沒有 E' },
        { kind: 'error', input: '2 3\nS.S\n..E', output: 'Invalid', note: 'S 出現兩次' },
        { kind: 'error', input: '2 3\nS.E\n..E', output: 'Invalid', note: 'E 出現兩次' },
        { kind: 'error', input: '2 3\nS..\n.E', output: 'Invalid', note: '第 2 行長度不是 C' },
        { kind: 'error', input: '3 3\nS..\n..E', output: 'Invalid', note: '行數少於 R' },
        { kind: 'error', input: '1 3\nS.E\n...', output: 'Invalid', note: '行數多於 R' },
        { kind: 'error', input: '2 2\nSx\n.E', output: 'Invalid', note: '出現不允許的字元' },
        { kind: 'error', input: '0 5', output: 'Invalid', note: 'R = 0' },
        { kind: 'error', input: '1 1\nS', output: 'Invalid', note: '1 × 1 放不下不同的 S 與 E' },
        { kind: 'error', input: `1 1001\nS${'.'.repeat(999)}E`, output: 'Invalid', note: 'C = 1001 超過上限' },
        { kind: 'error', input: 'a 3\nS.E', output: 'Invalid', note: 'R 不是整數' },
        { kind: 'error', input: '', output: 'Invalid', note: '空輸入' },
      ],
      hints: [
        '先讀進所有字串，才能檢查行數、每行長度、字元與 S／E 的個數，全部合法才開始 BFS。',
        '把 `(r, c)` 編成 `r * C + c`：dist 用長度 R × C 的一維陣列，−1 代表還沒發現，佇列只放整數。',
        '方向陣列 `dr = [-1, 1, 0, 0]`、`dc = [0, 0, -1, 1]`；先檢查 `0 <= nr < R`、`0 <= nc < C`，再讀格子。',
        '入隊時就設定 dist，每格最多入隊一次；佇列空了還沒碰到 E 就輸出 −1。',
        'Python 用 `collections.deque` 的 `popleft()`，不要用 `list.pop(0)`；Java 用 `BufferedReader` 讀入；JavaScript 用陣列加 `head` 索引，不要用 `shift()`。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <queue>
#include <string>
#include <vector>

bool isNumber(const std::string& s) {
    if (s.empty() || s.size() > 7) return false;
    for (char ch : s) {
        if (ch < '0' || ch > '9') return false;
    }
    return true;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<std::string> t;  // 先讀進所有字串，才能檢查行數是否剛好
    std::string word;
    while (std::cin >> word) t.push_back(word);
    if (t.size() < 2 || !isNumber(t[0]) || !isNumber(t[1])) {
        std::cout << "Invalid\n";
        return 0;
    }
    int rows = std::stoi(t[0]), cols = std::stoi(t[1]);
    if (rows < 1 || rows > 1000 || cols < 1 || cols > 1000 || t.size() != static_cast<std::size_t>(rows) + 2) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::string grid;  // 第 r 列第 c 行在 grid[r * cols + c]
    grid.reserve(static_cast<std::size_t>(rows) * cols);
    int start = -1, end = -1, countS = 0, countE = 0;
    for (int r = 0; r < rows; ++r) {
        const std::string& line = t[r + 2];
        if (static_cast<int>(line.size()) != cols) {
            std::cout << "Invalid\n";
            return 0;
        }
        for (int c = 0; c < cols; ++c) {
            char ch = line[c];
            if (ch == 'S') { ++countS; start = r * cols + c; }
            else if (ch == 'E') { ++countE; end = r * cols + c; }
            else if (ch != '.' && ch != '#') {
                std::cout << "Invalid\n";
                return 0;
            }
        }
        grid += line;
    }
    if (countS != 1 || countE != 1) {
        std::cout << "Invalid\n";
        return 0;
    }
    const int dr[4] = {-1, 1, 0, 0};  // 上、下、左、右
    const int dc[4] = {0, 0, -1, 1};
    std::vector<int> dist(static_cast<std::size_t>(rows) * cols, -1);
    std::queue<int> q;
    dist[start] = 0;  // 入隊時就標記
    q.push(start);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        if (u == end) break;  // E 第一次被取出時，距離已是最短
        int r = u / cols, c = u % cols;
        for (int k = 0; k < 4; ++k) {
            int nr = r + dr[k], nc = c + dc[k];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;  // 先檢查邊界，再讀格子
            int v = nr * cols + nc;
            if (grid[v] == '#' || dist[v] != -1) continue;
            dist[v] = dist[u] + 1;
            q.push(v);
        }
    }
    std::cout << dist[end] << "\n";  // 沒碰到 E 時仍是 -1
    return 0;
}`,
        Python: code`import sys
from collections import deque

DR = (-1, 1, 0, 0)  # 上、下、左、右
DC = (0, 0, -1, 1)


def is_number(token):
    return token.isdigit() and len(token) <= 7


def main():
    data = sys.stdin.buffer.read().split()
    if len(data) < 2 or not is_number(data[0]) or not is_number(data[1]):
        print("Invalid")
        return
    rows, cols = int(data[0]), int(data[1])
    if not (1 <= rows <= 1000 and 1 <= cols <= 1000) or len(data) != 2 + rows:
        print("Invalid")
        return
    lines = data[2:]
    # translate 刪掉所有合法字元，剩下任何東西就代表有不允許的字元
    if any(len(line) != cols or line.translate(None, b".#SE") for line in lines):
        print("Invalid")
        return
    grid = b"".join(lines)  # 第 r 列第 c 行在 grid[r * cols + c]
    if grid.count(b"S") != 1 or grid.count(b"E") != 1:
        print("Invalid")
        return
    start, end = grid.index(b"S"), grid.index(b"E")
    wall = ord("#")
    dist = [-1] * (rows * cols)
    dist[start] = 0  # 入隊時就標記
    q = deque([start])
    while q:
        u = q.popleft()
        if u == end:  # E 第一次被取出時，距離已是最短
            break
        r, c = divmod(u, cols)
        d = dist[u] + 1
        for k in range(4):
            nr, nc = r + DR[k], c + DC[k]
            if 0 <= nr < rows and 0 <= nc < cols:  # 先檢查邊界，再讀格子
                v = nr * cols + nc
                if dist[v] == -1 and grid[v] != wall:
                    dist[v] = d
                    q.append(v)
    print(dist[end])  # 沒碰到 E 時仍是 -1


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.StringTokenizer;

public class Main {
    static boolean isNumber(String s) {
        if (s.isEmpty() || s.length() > 7) return false;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch < '0' || ch > '9') return false;
        }
        return true;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> t = new ArrayList<>();  // 先讀進所有字串，才能檢查行數是否剛好
        String line;
        while ((line = in.readLine()) != null) {
            StringTokenizer st = new StringTokenizer(line);
            while (st.hasMoreTokens()) t.add(st.nextToken());
        }
        if (t.size() < 2 || !isNumber(t.get(0)) || !isNumber(t.get(1))) {
            System.out.println("Invalid");
            return;
        }
        int rows = Integer.parseInt(t.get(0)), cols = Integer.parseInt(t.get(1));
        if (rows < 1 || rows > 1000 || cols < 1 || cols > 1000 || t.size() != rows + 2) {
            System.out.println("Invalid");
            return;
        }
        char[] grid = new char[rows * cols];  // 第 r 列第 c 行在 grid[r * cols + c]
        int start = -1, end = -1, countS = 0, countE = 0;
        for (int r = 0; r < rows; r++) {
            String row = t.get(r + 2);
            if (row.length() != cols) {
                System.out.println("Invalid");
                return;
            }
            for (int c = 0; c < cols; c++) {
                char ch = row.charAt(c);
                if (ch == 'S') { countS++; start = r * cols + c; }
                else if (ch == 'E') { countE++; end = r * cols + c; }
                else if (ch != '.' && ch != '#') {
                    System.out.println("Invalid");
                    return;
                }
                grid[r * cols + c] = ch;
            }
        }
        if (countS != 1 || countE != 1) {
            System.out.println("Invalid");
            return;
        }
        int[] dr = {-1, 1, 0, 0};  // 上、下、左、右
        int[] dc = {0, 0, -1, 1};
        int[] dist = new int[rows * cols];
        Arrays.fill(dist, -1);
        ArrayDeque<Integer> q = new ArrayDeque<>();
        dist[start] = 0;  // 入隊時就標記
        q.add(start);
        while (!q.isEmpty()) {
            int u = q.poll();
            if (u == end) break;  // E 第一次被取出時，距離已是最短
            int r = u / cols, c = u % cols;
            for (int k = 0; k < 4; k++) {
                int nr = r + dr[k], nc = c + dc[k];
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;  // 先檢查邊界，再讀格子
                int v = nr * cols + nc;
                if (grid[v] == '#' || dist[v] != -1) continue;
                dist[v] = dist[u] + 1;
                q.add(v);
            }
        }
        System.out.println(dist[end]);  // 沒碰到 E 時仍是 -1
    }
}`,
        JavaScript: code`const isNumber = s => /^[0-9]{1,7}$/.test(s);

function main() {
    // 先讀進所有字串，才能檢查行數是否剛好
    const t = require("fs").readFileSync(0, "utf8").split(/\s+/).filter(s => s !== "");
    if (t.length < 2 || !isNumber(t[0]) || !isNumber(t[1])) return "Invalid";
    const rows = Number(t[0]), cols = Number(t[1]);
    if (rows < 1 || rows > 1000 || cols < 1 || cols > 1000 || t.length !== rows + 2) return "Invalid";
    const lines = t.slice(2);
    if (lines.some(line => line.length !== cols || !/^[.#SE]*$/.test(line))) return "Invalid";
    const grid = lines.join("");  // 第 r 列第 c 行在 grid[r * cols + c]
    const start = grid.indexOf("S"), end = grid.indexOf("E");
    if (start === -1 || end === -1 || grid.lastIndexOf("S") !== start || grid.lastIndexOf("E") !== end) return "Invalid";

    const dr = [-1, 1, 0, 0];  // 上、下、左、右
    const dc = [0, 0, -1, 1];
    const dist = new Int32Array(rows * cols).fill(-1);
    const q = new Int32Array(rows * cols);  // 每格最多入隊一次，佇列不會超過 R × C
    let head = 0, tail = 0;
    dist[start] = 0;  // 入隊時就標記
    q[tail++] = start;
    while (head < tail) {
        const u = q[head++];
        if (u === end) break;  // E 第一次被取出時，距離已是最短
        const r = Math.floor(u / cols), c = u % cols;
        for (let k = 0; k < 4; k++) {
            const nr = r + dr[k], nc = c + dc[k];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;  // 先檢查邊界，再讀格子
            const v = nr * cols + nc;
            if (grid[v] === "#" || dist[v] !== -1) continue;
            dist[v] = dist[u] + 1;
            q[tail++] = v;
        }
    }
    return String(dist[end]);  // 沒碰到 E 時仍是 -1
}

console.log(main());`,
      },
      judge: 'none',
    },
  ],
};

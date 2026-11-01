import type { LessonContent, TraceStep } from '../schema';
import { dijkstraSteps } from '../simulate-algorithms';

const code = String.raw;

/**
 * The visualization's graph: directed, 6 nodes. A → B costs 4 with one edge, A → C → B only 3 with two; A → C → F
 * costs 10 with two edges, A → C → D → F only 6 with three. E has only an outgoing edge, so it is never reached.
 * Edges are listed in the order of the adjacency dict on lines 2–3 of the trace code; dijkstraSteps processes
 * neighbours in edge order and breaks distance ties by node name, exactly like heapq on (dist, name) tuples. No edge
 * ever leads into an already settled node, so the simulator (which skips those) and the code examine the same edges.
 */
const TRACE_NODES = ['A', 'B', 'C', 'D', 'E', 'F'];
const TRACE_EDGES = ([['A', 'B', 4], ['A', 'C', 1], ['B', 'D', 1], ['C', 'B', 2], ['C', 'D', 2], ['C', 'F', 9], ['D', 'F', 3], ['E', 'D', 1]] as const)
  .map(([from, to, weight]) => ({ from, to, weight }));

/**
 * The same Dijkstra as the trace code (heapq order: distance, then name; skip when d > dist[u]), run here to record
 * the code's variables per simulator step: 'init', then per pop a 'settle' or 'stale', each settle's 'relax'es, 'path'.
 */
type Ev = { kind: 'init' | 'settle' | 'stale' | 'relax' | 'path'; d?: number; u?: string; v?: string; w?: number; old?: number; updated?: boolean };
const events: Ev[] = (() => {
  const dist = new Map<string, number>(TRACE_NODES.map(n => [n, Infinity]));
  dist.set('A', 0);
  const pq: [number, string][] = [[0, 'A']], out: Ev[] = [{ kind: 'init' }];
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
    const [d, u] = pq.shift()!;
    if (d > dist.get(u)!) { out.push({ kind: 'stale', d, u }); continue; }
    out.push({ kind: 'settle', d, u });
    for (const e of TRACE_EDGES.filter(x => x.from === u)) {
      const old = dist.get(e.to)!, updated = d + e.weight < old;
      out.push({ kind: 'relax', d, u, v: e.to, w: e.weight, old, updated });
      if (updated) { dist.set(e.to, d + e.weight); pq.push([d + e.weight, e.to]); }
    }
  }
  out.push({ kind: 'path' });
  return out;
})();
const py = (x: number) => (x === Infinity ? 'inf' : String(x));

/**
 * dijkstraSteps runs the algorithm (lines: init → 5, settle → 7, stale → 8, relax → 10, path → 15); a relaxation
 * that updates is moved to line 11 where the assignment happens. Each step gets the code's variables, and the last
 * step prints `6 A C D F` on one line as line 15 does (the simulator writes distance and path on two lines).
 */
const LINES = { init: 5, settle: 7, stale: 8, relax: 10, path: 15 };
const simulated = dijkstraSteps(TRACE_NODES, TRACE_EDGES, true, 'A', 'F', LINES);
const kindOf = Object.fromEntries(Object.entries(LINES).map(([k, v]) => [v, k]));
if (simulated.length !== events.length || simulated.some((s, k) => kindOf[s.line] !== events[k].kind)) throw new Error('A16: trace events and simulator steps disagree');
const traceSteps: TraceStep[] = simulated.map((step, k): TraceStep => {
  const ev = events[k];
  const vars: Record<string, string> = ev.kind === 'relax'
    ? { d: String(ev.d), u: ev.u!, v: ev.v!, w: String(ev.w), 'd + w': String(ev.d! + ev.w!), 'dist[v]（比較前）': py(ev.old!) }
    : ev.d !== undefined ? { d: String(ev.d), u: ev.u! } : {};
  let note = step.note;
  if (ev.kind === 'init') note += '程式用 `float(\'inf\')` 表示 ∞；`parent` 一開始只有起點 A（值是 None）。';
  if (ev.kind === 'settle') note += `第 8 行：d = ${ev.d} 等於 dist['${ev.u}']，不是過期紀錄，${TRACE_EDGES.some(e => e.from === ev.u) ? `往下鬆弛 ${ev.u} 的每條出邊。` : `但 ${ev.u} 沒有出邊，沒有東西要鬆弛。`}`;
  if (ev.kind === 'settle' && ev.u === 'B') note += '佇列裡 (3, \'B\') 和 (3, \'D\') 距離相同，tuple 接著比第二項，\'B\' < \'D\'，所以 B 先取出；先取哪一個都不影響最後的距離。';
  if (ev.kind === 'relax' && ev.v === 'B' && ev.u === 'C') note += 'A → B 只有 1 條邊卻要 4；A → C → B 有 2 條邊只要 3。加權圖裡，邊數多不代表比較遠，這正是 BFS 會算錯的地方。';
  if (ev.kind === 'relax' && ev.v === 'F' && ev.u === 'C') note += 'A → C → F 只有 2 條邊、總長 10，目前是最好的；之後 3 條邊的 A → C → D → F（6）會取代它。';
  if (ev.kind === 'relax' && !ev.updated) note += '鬆弛不成功就什麼都不做：dist 只會變小，不會變大。';
  if (ev.kind === 'stale') note += `第 8 行：d = ${ev.d} > dist['${ev.u}']，執行 continue。這筆是 ${ev.u} 變短之前放進去的舊紀錄；\`heapq\` 不能修改佇列裡的元素，所以變短時直接再放一筆新的，舊的留到取出時才丟掉（lazy deletion）。`;
  if (ev.kind === 'path') note += 'E 只有出去的邊 E → D，沒有任何邊指向 E，所以 dist[\'E\'] 一直是 inf：從 A 到不了 E。第 13–15 行印出 `6 A C D F`。';
  return { ...step, line: ev.kind === 'relax' && ev.updated ? 11 : step.line, note, vars, output: ev.kind === 'path' ? '6 A C D F' : '' };
});

/**
 * Exercise worst cases, generated here (each under 1 MB of input).
 * Ladder: nodes 1..20000 with i → i+1 (10^9) and i → i+2 (10^9 − 1), plus node 20001 whose only edge leaves it.
 * dist of node k (d = k − 1 edges of length 1) is ⌊d / 2⌋ × 999999999 + (d mod 2) × 10^9, up to about 10^13; node 20001
 * is unreachable. Verified against the three reference solutions and a Python Dijkstra.
 */
const LADDER = 20000;
const ladderInput = (() => {
  const lines: string[] = [];
  for (let i = 1; i < LADDER; i++) {
    lines.push(`${i} ${i + 1} 1000000000`);
    if (i + 2 <= LADDER) lines.push(`${i} ${i + 2} 999999999`);
  }
  lines.push(`${LADDER + 1} 1 0`);
  return `${LADDER + 1} ${lines.length} 1\n${lines.join('\n')}`;
})();
const ladderOutput = [...Array.from({ length: LADDER }, (_, d) => String(Math.floor(d / 2) * 999999999 + (d % 2) * 1000000000)), '-1'].join(' ');
/** Star then chain: 1 → i costs 10^9 for every i, the chain i → i+1 costs 1, so dist[i] = i − 1 and every star entry goes stale. */
const STAR = 25000;
const starInput = `${STAR} ${2 * (STAR - 1)} 1\n${[...Array.from({ length: STAR - 1 }, (_, k) => `1 ${k + 2} 1000000000`), ...Array.from({ length: STAR - 1 }, (_, k) => `${k + 1} ${k + 2} 1`)].join('\n')}`;
const starOutput = Array.from({ length: STAR }, (_, i) => String(i)).join(' ');

/** A16 Graph Shortest Path. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const A16: LessonContent = {
  lessonId: 'A16',
  motivation: '導航軟體要找的不是「轉最少個彎」的路，而是「總時間最短」的路；網路封包要走延遲最小的線路；遊戲角色在草地、沼澤、道路上移動的代價各不相同。這些問題的圖，每條邊都帶著一個權重（weight），路徑的長度是權重的總和。A14 的 BFS 只會數邊數，在這種加權圖（weighted graph）上會選錯路。Dijkstra 演算法（由 Edsger W. Dijkstra 提出）用 D15 的優先佇列（priority queue）反覆「確定目前最近的點」，再用它去更新鄰居的距離（鬆弛，relaxation），在 O((V + E) log V) 時間內求出一個起點到所有點的最短距離，還能還原出路線。它也有明確的限制：只要有一條邊的權重是負的，它就可能給出錯誤的答案，這時要改用 Bellman-Ford。這一課要學會：鬆弛是什麼、怎麼用優先佇列寫出 Dijkstra、為什麼負權不行，以及看到題目時該選 BFS、Dijkstra 還是別的方法。',
  sections: [
    {
      id: 'weighted', title: '加權圖與鬆弛：BFS 的邊數不再是距離',
      blocks: [
        { type: 'p', text: '加權圖的每條邊是一個三元組 (u, v, w)：從 u 到 v，代價是 w。一條路徑的長度是它經過的所有邊權重的總和，最短路徑（shortest path）就是總和最小的那條。鄰接串列（adjacency list）的每個位置改成存 `(v, w)`；無向圖的一條路就存成兩個方向各一條有向邊。' },
        { type: 'p', text: 'BFS 為什麼不能用？看這張有向圖：A → B 權重 10；A → C、C → D、D → B 權重都是 1。BFS 從 A 出發，第一層就發現 B，記下「1 步」，parent 是 A，於是走 A → B，總長 10。但繞遠路的 A → C → D → B 雖然有 3 條邊，總長只有 3。BFS 的保證是「邊數最少」，在每條邊代價都相同時，邊數最少就是總代價最小；一旦權重不同，兩者就不一樣了。' },
        { type: 'table', head: ['路徑', '邊數', '總權重', '誰會選它'], rows: [
          ['A → B', '1', '10', 'BFS（邊數最少）'],
          ['A → C → D → B', '3', '3', 'Dijkstra（總權重最小）'],
        ] },
        { type: 'p', text: '所有最短路徑演算法共用一個基本動作：鬆弛（relaxation）。`dist[v]` 代表「目前找到、從起點到 v 的最短距離」，一開始只有 `dist[起點] = 0`，其他都是 ∞。鬆弛一條邊 (u, v, w) 的意思是：如果先走到 u 再走這條邊比目前的紀錄更短，也就是 `dist[u] + w < dist[v]`，就把 `dist[v]` 改成 `dist[u] + w`，並記下 `parent[v] = u`（v 是從 u 走過來的）。' },
        { type: 'list', items: [
          '`dist[v]` 只會變小，不會變大：鬆弛不成功就什麼都不做。',
          '`dist[v]` 永遠對應一條真實存在的路（沿著 parent 倒著走就找得到），所以它不會比真正的最短距離還小，只是「目前的上限」。',
          '如果最短路徑上的每一條邊，都「依照路徑的順序」被鬆弛過，`dist` 就等於真正的最短距離。不同的演算法，差別只在「用什麼順序鬆弛哪些邊」。',
        ] },
        { type: 'callout', tone: 'note', title: '把權重展開成很多條小邊行不行？', text: '權重是小的正整數時，可以把一條權重 w 的邊拆成 w 條權重 1 的邊（中間加 w − 1 個新點），再做 BFS，答案一樣。但權重可以到 10^9 時，圖會大到放不下。Dijkstra 直接處理權重，不管權重多大，點和邊的數量都不變。' },
      ],
    },
    {
      id: 'dijkstra', title: 'Dijkstra：每次確定目前最近的點',
      blocks: [
        { type: 'p', text: 'Dijkstra 的想法是：在還沒確定的點裡，`dist` 最小的那個點，它的距離已經不可能再變短了，可以「確定」（settle）下來；接著用它鬆弛它的所有出邊，讓鄰居的 `dist` 變小。重複這件事，就能由近到遠確定每一個點。要快速找出「`dist` 最小的點」，就用 D15 的最小堆積（min-heap）當優先佇列，裡面放 `(距離, 節點)`。' },
        { type: 'list', ordered: true, items: [
          '`dist` 全部設成 ∞，`dist[s] = 0`，把 `(0, s)` 放進優先佇列。',
          '佇列不空時，取出距離最小的 `(d, u)`。',
          '如果 `d > dist[u]`，這是一筆過期的紀錄（u 早就用更短的距離處理過了），直接略過。',
          '否則 u 的最短距離確定是 d。對 u 的每條出邊 (u, v, w)：如果 `d + w < dist[v]`，更新 `dist[v] = d + w`、`parent[v] = u`，並把 `(dist[v], v)` 放進佇列。',
          '佇列空了：`dist` 仍是 ∞ 的點，就是從 s 到不了的點。',
        ] },
        { type: 'p', text: '第 3 步叫做延遲刪除（lazy deletion）。C++ 的 `priority_queue`、Python 的 `heapq`、Java 的 `PriorityQueue` 都沒有「把佇列裡某個元素的優先度改小」（decrease-key）的操作。所以 v 的距離變短時，不去找舊的那筆，而是直接再放一筆新的；舊的那筆距離比較大，會比較晚被取出，取出時用 `d > dist[u]` 認出它、丟掉就好。同一個點可能同時在佇列裡有好幾筆，但只有距離等於 `dist[u]` 的那筆會真正被處理。' },
        { type: 'example', id: 'dijkstra-dist' },
        { type: 'p', text: '範例的圖有 6 個點、8 條有向邊。取出 0（距離 0），鬆弛得到 `dist[1] = 7`、`dist[2] = 2`；取出 2（距離 2），經由 2 到 1 只要 2 + 3 = 5 < 7，`dist[1]` 改成 5，也得到 `dist[3] = 10`、`dist[5] = 14`；取出 1（距離 5），`dist[3]` 改成 6；取出 3（距離 6），`dist[5]` 改成 8；最後取出 5。佇列裡剩下的 (7, 1)、(10, 3)、(14, 5) 都是被更新之前留下的舊紀錄，取出時都被略過，所以印出 3。節點 4 只有一條指向 0 的邊，沒有邊指向 4，`dist[4]` 一直是 ∞，印成 −1。注意確定的順序 0 2 1 3 5 正好是距離由小到大：0、2、5、6、8。' },
        { type: 'p', text: '頁面下方的視覺化用同樣的寫法，在 6 個點的圖上一步一步執行，可以看到優先佇列裡的紀錄、距離表的變化，以及過期紀錄被丟掉的時機；「自己試試」可以換一個起點重新執行，看距離表與最短路徑怎麼改變（圖上的權重都是非負的）。' },
        { type: 'callout', tone: 'warning', title: '不要在「發現」時就確定，也不要省掉過期檢查', text: 'BFS 第一次發現一個點，距離就已經是最短的，所以入隊時就標記。Dijkstra 不一樣：範例中 1 第一次被發現時是 7，後來才變成 5。如果第一次發現就把它當成確定，答案會錯。正確的時機是「從佇列取出、而且不是過期紀錄」的那一刻。另一方面，如果省掉 `if d > dist[u]: continue`，邊權非負時答案仍然正確（過期紀錄的 d 比較大，用它鬆弛不會成功），但每筆過期紀錄都會把那個點的出邊重新掃一遍：一個有很多出邊的點被放進佇列好幾次時，就會白做很多次，失去 O((V + E) log V) 的保證。' },
      ],
    },
    {
      id: 'correctness', title: '為什麼邊權必須非負：正確性與反例',
      blocks: [
        { type: 'p', text: '為什麼「取出時距離最小的點」就可以確定？假設 u 被取出時距離是 d，而且 d 是佇列裡所有有效紀錄中最小的。任何一條從起點到 u 的其他路，都必須在某個地方第一次離開「已確定的點」，走進一個還沒確定的點 x。走到 x 時的長度至少是 `dist[x]`，而 `dist[x] ≥ d`（否則 x 會比 u 先被取出）；從 x 再走到 u，剩下的邊權重都 ≥ 0，總長只會更大。所以沒有任何一條路比 d 短，u 可以確定。每一步確定的，都是「不可能再變短」的點。' },
        { type: 'p', text: '這個論證只在一個地方用到假設：「剩下的邊權重都 ≥ 0」。如果有負權邊（negative edge），先走一段比較長的路，再經過一條負權邊，總長反而可能比較短，已經確定的點就不再可靠。權重是 0 的邊沒有問題：多走一條 0 的邊不會讓路變短。' },
        { type: 'example', id: 'negative-edge' },
        { type: 'p', text: '範例照 Dijkstra 的定義寫：每個點用 `done` 陣列記錄，只確定一次。取出 0 之後，`dist[1] = 2`、`dist[2] = 5`；取出 1（距離 2），把它確定，並鬆弛得到 `dist[3] = 5`；接著取出 2（距離 5），經過權重 −4 的邊到 1，5 − 4 = 1 < 2，`dist[1]` 被改成 1。但 1 已經確定過，不會再處理一次，所以 1 → 3 那條邊沒有用新的距離重新鬆弛，`dist[3]` 停在 5；真正的最短路 0 → 2 → 1 → 3 是 5 − 4 + 3 = 4。Bellman-Ford 把每條邊都鬆弛 V − 1 輪，得到正確的 4。' },
        { type: 'callout', tone: 'note', title: '本課的寫法（只檢查 d > dist[u]）遇到負權會怎樣？', text: '本課的程式沒有 `done` 陣列，只丟掉 `d > dist[u]` 的紀錄。在上面的圖上，`dist[1]` 變成 1 後放進佇列的 (1, 1) 不算過期，1 會被再處理一次，碰巧算出 4。但這已經不是 Dijkstra 的保證了：同一個點可能被處理很多次，在特別構造的圖上，次數會隨點數呈指數成長；如果圖上有總權重為負的環（negative cycle），繞一圈距離就變小一次，迴圈永遠停不下來。有負權邊時，不要依賴這種「碰巧對」，直接改用 Bellman-Ford。' },
        { type: 'p', text: 'Bellman-Ford（這裡只介紹概念）把所有邊依序鬆弛一輪，重複 V − 1 輪：一條最短路最多有 V − 1 條邊，第 k 輪結束時，至多 k 條邊的最短路一定都已經算對。時間是 O(VE)，比 Dijkstra 慢，但允許負權邊。如果做完 V − 1 輪後還有邊能鬆弛成功，就代表從起點走得到一個負環；這時最短路徑沒有定義，因為繞著負環走越多圈，總長就越小，沒有最小值。' },
        { type: 'callout', tone: 'warning', title: '把所有權重加上同一個常數，不能修正負權', text: '常見的錯誤想法：最小的權重是 −4，那就每條邊都加 4，全部變成非負，再做 Dijkstra。這樣會偏袒邊數少的路：一條有 k 條邊的路總長會多出 4k。在範例的圖上，0 → 1 → 3（2 條邊，原本 5）變成 6 + 7 = 13，0 → 2 → 1 → 3（3 條邊，原本 4）變成 9 + 0 + 7 = 16，選出來的反而是原本比較長的那條。' },
      ],
    },
    {
      id: 'path', title: '還原路徑與到不了的點',
      blocks: [
        { type: 'p', text: '要知道「怎麼走」，就在每次鬆弛成功時記下 `parent[v] = u`。和 BFS 不同，Dijkstra 的 `parent[v]` 可能被改寫好幾次：每次 `dist[v]` 變短，最後一次寫入的就是最短路上 v 的前一個點。演算法結束時，所有到得了的點的 parent 合起來是一棵以起點為根的最短路徑樹（shortest-path tree）。' },
        { type: 'p', text: '還原 s 到 t 的路徑和 A14 一樣：從 t 開始不斷令 `v = parent[v]`，直到 −1（起點沒有 parent），收集經過的點，最後反轉（reverse）。但一定要先判斷 `dist[t]` 是不是 ∞：到不了的點 parent 也是 −1，不先檢查的話，會印出只有 t 一個點的「路徑」。' },
        { type: 'example', id: 'dijkstra-path' },
        { type: 'p', text: '這張圖是 7 個地點之間的雙向道路，每條路存成兩條有向邊。從 0 到 5 的最短路是 0 → 2 → 1 → 3 → 4 → 5，經過 5 條邊、總長 1 + 2 + 5 + 3 + 2 = 13；邊數最少的 0 → 2 → 4 → 5 只有 3 條邊，但總長是 1 + 12 + 2 = 15。`parent[1]` 一開始是 0（`dist[1] = 4`），取出 2 之後被改寫成 2（`dist[1] = 3`）。地點 6 沒有任何道路，`dist[6]` 一直是 ∞，程式印出 `no path`，不去還原路徑。' },
        { type: 'callout', tone: 'warning', title: '∞ 要選得夠大，也要小心 ∞ + w', text: '表示「到不了」的 ∞ 必須比任何真正的距離都大。權重最大 10^9、點數 10^5 時，最短路可能長到約 10^14，用 `int` 的 `10^9` 當 ∞ 會把真正的距離誤判成到不了。C++ 用 `std::numeric_limits<long long>::max()`、Java 用 `Long.MAX_VALUE`、Python 用 `float(\'inf\')`。用最大值當 ∞ 時，`dist[u] + w` 會溢位：本課的 Dijkstra 從不取出到不了的點，所以不會發生；但像 Bellman-Ford 那樣掃過所有邊時，要先檢查 `dist[u] != INF` 再相加，範例 `negative-edge` 的 C++ 與 Java 就是這樣寫的。輸出時把 ∞ 換成題目要求的 −1。' },
      ],
    },
    {
      id: 'complexity', title: '複雜度、三種語言的優先佇列與演算法選擇',
      blocks: [
        { type: 'p', text: '時間：每條邊最多讓一次鬆弛成功、放進一筆紀錄，所以佇列裡總共最多 E + 1 筆，每筆放入、取出各一次，每次 O(log E)。因為 E ≤ V²，log E ≤ 2 log V，和 log V 同級。再加上每個點的出邊只在它被確定時掃一次，總時間是 O((V + E) log V)。空間是鄰接串列 O(V + E) 加上佇列 O(E)。不用堆積、每次掃整個 `dist` 找最小值的寫法是 O(V²)：只有在非常稠密（E 接近 V²）的圖上才划算；V = 10^5、E = 2 × 10^5 時，堆積版大約做 3 × 10^5 × 17 ≈ 5 × 10^6 次基本操作，掃描版要 10^10 次。' },
        { type: 'table', head: ['語言', '最小堆積的宣告', '放入／取出', '要注意的地方'], rows: [
          ['C++', '`std::priority_queue<std::pair<long long, int>, std::vector<std::pair<long long, int>>, std::greater<std::pair<long long, int>>>`', '`pq.push({d, v})`；`pq.top()` 讀、`pq.pop()` 移除', '預設是最大堆積；`pair` 先比 first（距離），相同再比 second'],
          ['Python', '一個普通的 list，配合 `heapq`', '`heapq.heappush(pq, (d, v))`；`d, u = heapq.heappop(pq)`', 'tuple 逐項比較，距離放第一項；int 不會溢位'],
          ['Java', '`new PriorityQueue<long[]>((a, b) -> Long.compare(a[0], b[0]))`', '`pq.add(new long[]{d, v})`；`pq.poll()`', '比較器用 `Long.compare`，不要用相減；距離用 `long`'],
        ] },
        { type: 'callout', tone: 'warning', title: 'C++ 的 priority_queue 預設取出最大值', text: '`std::priority_queue<std::pair<long long, int>> pq;` 是最大堆積，`top()` 是距離最大的紀錄。配上過期檢查時，程式不會當掉、最後的距離也還是對的，但它會先處理遠的點，再被近的點一再改寫，同一個點被處理很多次。在一條 40 個點的鏈（每點到下一點權重 1、到下下點權重 3）上實測：最小堆積取出 78 次，最大堆積取出 420 次，點越多差距越大。修正方式是寫齊三個樣板參數並用 `std::greater`（在 `<functional>`），或改放 `{-dist, v}`、取出時再加負號。' },
        { type: 'callout', tone: 'warning', title: 'Java 的比較器不要寫 a[0] - b[0]', text: '距離是 `long` 時，`(a, b) -> (int) (a[0] - b[0])` 會把差值截成 `int`：差是 2^31 時變成負數，差是 2^32 時變成 0，堆積的順序就亂了，取出的不再是最小的。一律寫 `Long.compare(a[0], b[0])`（`int` 時寫 `Integer.compare`）。另外 `PriorityQueue<long[]>` 沒有比較器時，陣列不是 `Comparable`，第一次 `add` 就會丟出 `ClassCastException`。' },
        { type: 'p', text: '距離要用 64 位元整數：權重最大 10^9 時，只要 3 條邊，總長就是 3 × 10^9，超過 `int` 的上限 2^31 − 1 = 2147483647。C++ 的 `int` 溢位是未定義行為（undefined behavior），Java 的 `int` 會繞回負數，負的距離又會被當成「更短」而亂改答案；所以 C++ 用 `long long`、Java 用 `long`。Python 的 int 沒有上限，不會溢位，但 `float(\'inf\')` 和 int 混著比較沒有問題，輸出前記得轉換。' },
        { type: 'table', head: ['情況', '方法', '時間'], rows: [
          ['沒有權重，或每條邊權重都相同', 'BFS（A14）', 'O(V + E)'],
          ['權重只有 0 和 1', '0-1 BFS：用雙端佇列，權重 0 的鄰居放前端、權重 1 的放後端（這裡只提到，不展開）', 'O(V + E)'],
          ['權重都 ≥ 0', 'Dijkstra（本課）', 'O((V + E) log V)'],
          ['有負權邊（或要判斷負環）', 'Bellman-Ford', 'O(VE)'],
        ] },
        { type: 'p', text: '看到最短路徑的題目，先看三件事：邊有沒有權重、權重會不會是負的、要的是一個起點到所有點，還是只要兩點之間。把題目的「地點、路段、代價」轉成點、邊和權重，選對方法，再檢查距離會不會超過 `int`，這是實作題需要的能力。' },
      ],
    },
  ],
  examples: [
    {
      id: 'dijkstra-dist', title: 'Dijkstra：從起點到每個點的最短距離', description: '6 個點、8 條有向加權邊，從 0 出發；印出確定的順序、略過的過期紀錄數，以及每個點的距離（到不了印 −1）。',
      output: 'settle order: 0 2 1 3 5\nstale entries skipped: 3\ndist: 0 5 2 6 -1 8',
      code: {
        'C++': code`#include <functional>
#include <iostream>
#include <limits>
#include <queue>
#include <utility>
#include <vector>

using Item = std::pair<long long, int>;  // (距離, 節點)：先比距離，相同再比節點編號
const long long INF = std::numeric_limits<long long>::max();

int main() {
    const int n = 6;
    int edges[][3] = {{0, 1, 7}, {0, 2, 2}, {2, 1, 3}, {1, 3, 1}, {2, 3, 8}, {3, 5, 2}, {2, 5, 12}, {4, 0, 1}};
    std::vector<std::vector<std::pair<int, int>>> adj(n);  // adj[u] 存 (v, w)，有向邊 u -> v
    for (auto& e : edges) adj[e[0]].push_back({e[1], e[2]});

    std::vector<long long> dist(n, INF);
    std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;  // 最小堆積
    dist[0] = 0;
    pq.push({0, 0});
    std::vector<int> order;
    int stale = 0;
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) {  // 過期的紀錄：u 早就用更短的距離處理過了
            stale++;
            continue;
        }
        order.push_back(u);  // 第一次以 dist[u] 取出：u 的最短距離確定
        for (auto [v, w] : adj[u]) {
            if (d + w < dist[v]) {  // 鬆弛
                dist[v] = d + w;
                pq.push({dist[v], v});
            }
        }
    }

    std::cout << "settle order:";
    for (int u : order) std::cout << ' ' << u;
    std::cout << "\nstale entries skipped: " << stale << "\ndist:";
    for (long long d : dist) std::cout << ' ' << (d == INF ? -1 : d);
    std::cout << "\n";
}`,
        Python: code`import heapq

n = 6
edges = [(0, 1, 7), (0, 2, 2), (2, 1, 3), (1, 3, 1), (2, 3, 8), (3, 5, 2), (2, 5, 12), (4, 0, 1)]
adj = [[] for _ in range(n)]  # adj[u] 存 (v, w)，有向邊 u -> v
for u, v, w in edges:
    adj[u].append((v, w))

INF = float('inf')
dist = [INF] * n
dist[0] = 0
pq = [(0, 0)]  # (距離, 節點)：tuple 先比距離，相同再比節點編號
order, stale = [], 0
while pq:
    d, u = heapq.heappop(pq)
    if d > dist[u]:  # 過期的紀錄：u 早就用更短的距離處理過了
        stale += 1
        continue
    order.append(u)  # 第一次以 dist[u] 取出：u 的最短距離確定
    for v, w in adj[u]:
        if d + w < dist[v]:  # 鬆弛
            dist[v] = d + w
            heapq.heappush(pq, (dist[v], v))

print('settle order:', *order)
print('stale entries skipped:', stale)
print('dist:', *(d if d != INF else -1 for d in dist))`,
        Java: code`import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.PriorityQueue;

public class Main {
    public static void main(String[] args) {
        int n = 6;
        int[][] edges = {{0, 1, 7}, {0, 2, 2}, {2, 1, 3}, {1, 3, 1}, {2, 3, 8}, {3, 5, 2}, {2, 5, 12}, {4, 0, 1}};
        List<List<int[]>> adj = new ArrayList<>();  // adj.get(u) 存 {v, w}，有向邊 u -> v
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) adj.get(e[0]).add(new int[]{e[1], e[2]});

        long[] dist = new long[n];
        Arrays.fill(dist, Long.MAX_VALUE);
        // {距離, 節點}：先比距離，相同再比節點編號；用 Long.compare，不要用相減
        PriorityQueue<long[]> pq = new PriorityQueue<>((a, b) -> a[0] != b[0] ? Long.compare(a[0], b[0]) : Long.compare(a[1], b[1]));
        dist[0] = 0;
        pq.add(new long[]{0, 0});
        List<Integer> order = new ArrayList<>();
        int stale = 0;
        while (!pq.isEmpty()) {
            long[] top = pq.poll();
            long d = top[0];
            int u = (int) top[1];
            if (d > dist[u]) {  // 過期的紀錄：u 早就用更短的距離處理過了
                stale++;
                continue;
            }
            order.add(u);  // 第一次以 dist[u] 取出：u 的最短距離確定
            for (int[] e : adj.get(u)) {
                int v = e[0], w = e[1];
                if (d + w < dist[v]) {  // 鬆弛
                    dist[v] = d + w;
                    pq.add(new long[]{dist[v], v});
                }
            }
        }

        StringBuilder sb = new StringBuilder("settle order:");
        for (int u : order) sb.append(' ').append(u);
        sb.append("\nstale entries skipped: ").append(stale).append("\ndist:");
        for (long d : dist) sb.append(' ').append(d == Long.MAX_VALUE ? -1 : d);
        System.out.println(sb);
    }
}`,
      },
    },
    {
      id: 'dijkstra-path', title: '用 parent 還原最短路徑', description: '7 個地點之間的雙向道路；印出 0 到 5、0 到 3 的最短距離與路線，以及到不了的地點 6。',
      output: 'to 5: dist 13, path 0 -> 2 -> 1 -> 3 -> 4 -> 5\nto 3: dist 8, path 0 -> 2 -> 1 -> 3\nto 6: no path',
      code: {
        'C++': code`#include <algorithm>
#include <functional>
#include <iostream>
#include <limits>
#include <queue>
#include <tuple>
#include <utility>
#include <vector>

using Item = std::pair<long long, int>;
const long long INF = std::numeric_limits<long long>::max();

int main() {
    const int n = 7;
    std::vector<std::tuple<int, int, int>> roads = {{0, 1, 4}, {0, 2, 1}, {2, 1, 2}, {1, 3, 5}, {2, 3, 8}, {3, 4, 3}, {2, 4, 12}, {4, 5, 2}};
    std::vector<std::vector<std::pair<int, int>>> adj(n);
    for (auto [a, b, w] : roads) {  // 無向道路：兩個方向各存一條邊
        adj[a].push_back({b, w});
        adj[b].push_back({a, w});
    }

    std::vector<long long> dist(n, INF);
    std::vector<int> parent(n, -1);  // parent[v]：最短路上 v 的前一個點
    std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;
    dist[0] = 0;
    pq.push({0, 0});
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue;
        for (auto [v, w] : adj[u]) {
            if (d + w < dist[v]) {
                dist[v] = d + w;
                parent[v] = u;  // 每次變短都要更新 parent
                pq.push({dist[v], v});
            }
        }
    }

    for (int t : {5, 3, 6}) {
        std::cout << "to " << t << ": ";
        if (dist[t] == INF) {  // 先判斷到不到得了
            std::cout << "no path\n";
            continue;
        }
        std::vector<int> path;
        for (int v = t; v != -1; v = parent[v]) path.push_back(v);
        std::reverse(path.begin(), path.end());
        std::cout << "dist " << dist[t] << ", path";
        for (std::size_t i = 0; i < path.size(); i++) std::cout << (i ? " -> " : " ") << path[i];
        std::cout << "\n";
    }
}`,
        Python: code`import heapq

n = 7
roads = [(0, 1, 4), (0, 2, 1), (2, 1, 2), (1, 3, 5), (2, 3, 8), (3, 4, 3), (2, 4, 12), (4, 5, 2)]
adj = [[] for _ in range(n)]
for a, b, w in roads:  # 無向道路：兩個方向各存一條邊
    adj[a].append((b, w))
    adj[b].append((a, w))

INF = float('inf')
dist = [INF] * n
parent = [-1] * n  # parent[v]：最短路上 v 的前一個點
dist[0] = 0
pq = [(0, 0)]
while pq:
    d, u = heapq.heappop(pq)
    if d > dist[u]:
        continue
    for v, w in adj[u]:
        if d + w < dist[v]:
            dist[v] = d + w
            parent[v] = u  # 每次變短都要更新 parent
            heapq.heappush(pq, (dist[v], v))

for t in (5, 3, 6):
    if dist[t] == INF:  # 先判斷到不到得了
        print(f'to {t}: no path')
        continue
    path = []
    v = t
    while v != -1:
        path.append(v)
        v = parent[v]
    path.reverse()
    print(f'to {t}: dist {dist[t]}, path', ' -> '.join(map(str, path)))`,
        Java: code`import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.PriorityQueue;

public class Main {
    public static void main(String[] args) {
        int n = 7;
        int[][] roads = {{0, 1, 4}, {0, 2, 1}, {2, 1, 2}, {1, 3, 5}, {2, 3, 8}, {3, 4, 3}, {2, 4, 12}, {4, 5, 2}};
        List<List<int[]>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] r : roads) {  // 無向道路：兩個方向各存一條邊
            adj.get(r[0]).add(new int[]{r[1], r[2]});
            adj.get(r[1]).add(new int[]{r[0], r[2]});
        }

        long[] dist = new long[n];
        Arrays.fill(dist, Long.MAX_VALUE);
        int[] parent = new int[n];  // parent[v]：最短路上 v 的前一個點
        Arrays.fill(parent, -1);
        PriorityQueue<long[]> pq = new PriorityQueue<>((a, b) -> a[0] != b[0] ? Long.compare(a[0], b[0]) : Long.compare(a[1], b[1]));
        dist[0] = 0;
        pq.add(new long[]{0, 0});
        while (!pq.isEmpty()) {
            long[] top = pq.poll();
            long d = top[0];
            int u = (int) top[1];
            if (d > dist[u]) continue;
            for (int[] e : adj.get(u)) {
                int v = e[0], w = e[1];
                if (d + w < dist[v]) {
                    dist[v] = d + w;
                    parent[v] = u;  // 每次變短都要更新 parent
                    pq.add(new long[]{dist[v], v});
                }
            }
        }

        for (int t : new int[]{5, 3, 6}) {
            if (dist[t] == Long.MAX_VALUE) {  // 先判斷到不到得了
                System.out.println("to " + t + ": no path");
                continue;
            }
            List<Integer> path = new ArrayList<>();
            for (int v = t; v != -1; v = parent[v]) path.add(v);
            Collections.reverse(path);
            StringBuilder sb = new StringBuilder("to " + t + ": dist " + dist[t] + ", path");
            for (int i = 0; i < path.size(); i++) sb.append(i > 0 ? " -> " : " ").append(path.get(i));
            System.out.println(sb);
        }
    }
}`,
      },
    },
    {
      id: 'negative-edge', title: '負權邊讓 Dijkstra 算錯', description: '4 個點，其中 2 → 1 的權重是 −4；每個點只確定一次的 Dijkstra 與 Bellman-Ford 並排比較，印出算錯的點。',
      output: 'dijkstra:     0 1 5 5\nbellman-ford: 0 1 5 4\nnode 3: dijkstra 5, correct 4',
      code: {
        'C++': code`#include <functional>
#include <iostream>
#include <limits>
#include <queue>
#include <utility>
#include <vector>

using Item = std::pair<long long, int>;
const long long INF = std::numeric_limits<long long>::max();
const int N = 4;
const int EDGES[][3] = {{0, 1, 2}, {0, 2, 5}, {2, 1, -4}, {1, 3, 3}};  // 2 -> 1 是負權邊

// 課本定義的 Dijkstra：每個點只確定（處理）一次。
std::vector<long long> dijkstra() {
    std::vector<std::vector<std::pair<int, int>>> adj(N);
    for (auto& e : EDGES) adj[e[0]].push_back({e[1], e[2]});
    std::vector<long long> dist(N, INF);
    std::vector<bool> done(N, false);
    std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;
    dist[0] = 0;
    pq.push({0, 0});
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (done[u]) continue;
        done[u] = true;  // 認定 dist[u] 不會再變
        for (auto [v, w] : adj[u]) {
            if (d + w < dist[v]) {
                dist[v] = d + w;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}

// Bellman-Ford（只作對照）：把每條邊鬆弛 V - 1 輪，負權邊也正確。
std::vector<long long> bellmanFord() {
    std::vector<long long> dist(N, INF);
    dist[0] = 0;
    for (int round = 1; round < N; round++) {
        for (auto& e : EDGES) {
            if (dist[e[0]] != INF && dist[e[0]] + e[2] < dist[e[1]]) dist[e[1]] = dist[e[0]] + e[2];
        }
    }
    return dist;
}

int main() {
    std::vector<long long> a = dijkstra(), b = bellmanFord();
    std::cout << "dijkstra:    ";
    for (long long d : a) std::cout << ' ' << d;
    std::cout << "\nbellman-ford:";
    for (long long d : b) std::cout << ' ' << d;
    std::cout << "\n";
    for (int v = 0; v < N; v++) {
        if (a[v] != b[v]) std::cout << "node " << v << ": dijkstra " << a[v] << ", correct " << b[v] << "\n";
    }
}`,
        Python: code`import heapq

N = 4
EDGES = [(0, 1, 2), (0, 2, 5), (2, 1, -4), (1, 3, 3)]  # 2 -> 1 是負權邊
INF = float('inf')


def dijkstra():
    """課本定義的 Dijkstra：每個點只確定（處理）一次。"""
    adj = [[] for _ in range(N)]
    for u, v, w in EDGES:
        adj[u].append((v, w))
    dist = [INF] * N
    done = [False] * N
    dist[0] = 0
    pq = [(0, 0)]
    while pq:
        d, u = heapq.heappop(pq)
        if done[u]:
            continue
        done[u] = True  # 認定 dist[u] 不會再變
        for v, w in adj[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(pq, (dist[v], v))
    return dist


def bellman_ford():
    """Bellman-Ford（只作對照）：把每條邊鬆弛 V - 1 輪，負權邊也正確。"""
    dist = [INF] * N
    dist[0] = 0
    for _ in range(N - 1):
        for u, v, w in EDGES:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
    return dist


a, b = dijkstra(), bellman_ford()
print('dijkstra:    ', *a)
print('bellman-ford:', *b)
for v in range(N):
    if a[v] != b[v]:
        print(f'node {v}: dijkstra {a[v]}, correct {b[v]}')`,
        Java: code`import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.PriorityQueue;

public class Main {
    static final long INF = Long.MAX_VALUE;
    static final int N = 4;
    static final int[][] EDGES = {{0, 1, 2}, {0, 2, 5}, {2, 1, -4}, {1, 3, 3}};  // 2 -> 1 是負權邊

    // 課本定義的 Dijkstra：每個點只確定（處理）一次。
    static long[] dijkstra() {
        List<List<int[]>> adj = new ArrayList<>();
        for (int i = 0; i < N; i++) adj.add(new ArrayList<>());
        for (int[] e : EDGES) adj.get(e[0]).add(new int[]{e[1], e[2]});
        long[] dist = new long[N];
        Arrays.fill(dist, INF);
        boolean[] done = new boolean[N];
        PriorityQueue<long[]> pq = new PriorityQueue<>((a, b) -> a[0] != b[0] ? Long.compare(a[0], b[0]) : Long.compare(a[1], b[1]));
        dist[0] = 0;
        pq.add(new long[]{0, 0});
        while (!pq.isEmpty()) {
            long[] top = pq.poll();
            long d = top[0];
            int u = (int) top[1];
            if (done[u]) continue;
            done[u] = true;  // 認定 dist[u] 不會再變
            for (int[] e : adj.get(u)) {
                if (d + e[1] < dist[e[0]]) {
                    dist[e[0]] = d + e[1];
                    pq.add(new long[]{dist[e[0]], e[0]});
                }
            }
        }
        return dist;
    }

    // Bellman-Ford（只作對照）：把每條邊鬆弛 V - 1 輪，負權邊也正確。
    static long[] bellmanFord() {
        long[] dist = new long[N];
        Arrays.fill(dist, INF);
        dist[0] = 0;
        for (int round = 1; round < N; round++) {
            for (int[] e : EDGES) {
                if (dist[e[0]] != INF && dist[e[0]] + e[2] < dist[e[1]]) dist[e[1]] = dist[e[0]] + e[2];
            }
        }
        return dist;
    }

    public static void main(String[] args) {
        long[] a = dijkstra(), b = bellmanFord();
        StringBuilder sb = new StringBuilder("dijkstra:    ");
        for (long d : a) sb.append(' ').append(d);
        sb.append("\nbellman-ford:");
        for (long d : b) sb.append(' ').append(d);
        for (int v = 0; v < N; v++) {
            if (a[v] != b[v]) sb.append("\nnode ").append(v).append(": dijkstra ").append(a[v]).append(", correct ").append(b[v]);
        }
        System.out.println(sb);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'graph-traversal', title: 'Dijkstra：優先佇列、距離表與過期紀錄', language: 'Python',
    code: code`import heapq
adj = {'A': [('B', 4), ('C', 1)], 'B': [('D', 1)], 'C': [('B', 2), ('D', 2), ('F', 9)],
       'D': [('F', 3)], 'E': [('D', 1)], 'F': []}
dist = {v: float('inf') for v in adj}
dist['A'], parent, pq = 0, {'A': None}, [(0, 'A')]
while pq:
    d, u = heapq.heappop(pq)
    if d > dist[u]: continue  # 過期的紀錄，略過
    for v, w in adj[u]:
        if d + w < dist[v]:  # 鬆弛
            dist[v], parent[v] = d + w, u
            heapq.heappush(pq, (dist[v], v))
path = ['F']
while parent[path[-1]]: path.append(parent[path[-1]])
print(dist['F'], ' '.join(reversed(path)))`,
    steps: traceSteps,
    tryIt: { algorithm: 'dijkstra', nodes: TRACE_NODES, edges: TRACE_EDGES, directed: true, start: 'A' },
  },
  quiz: [
    {
      id: 'q-dist', prompt: '下面的程式在有向加權圖上執行 Dijkstra，印出什麼？',
      code: { language: 'Python', text: code`import heapq
adj = {0: [(1, 4), (2, 1)], 1: [(3, 1)], 2: [(1, 2), (3, 5)], 3: [], 4: [(3, 1)]}
dist = {v: float('inf') for v in adj}
dist[0] = 0
pq = [(0, 0)]
while pq:
    d, u = heapq.heappop(pq)
    if d > dist[u]:
        continue
    for v, w in adj[u]:
        if d + w < dist[v]:
            dist[v] = d + w
            heapq.heappush(pq, (dist[v], v))
print([dist[v] for v in range(5)])` },
      options: ['[0, 3, 1, 4, inf]', '[0, 4, 1, 5, inf]', '[0, 3, 1, 6, inf]', '[0, 3, 1, 4, 5]'],
      answer: 0, explanation: '取出 0：dist[1] = 4、dist[2] = 1。取出 2（距離 1）：1 + 2 = 3 < 4，dist[1] 改成 3；dist[3] = 1 + 5 = 6。取出 1（距離 3）：3 + 1 = 4 < 6，dist[3] 改成 4。之後的 (4, 1)、(6, 3) 都是過期紀錄。節點 4 只有出邊 4 → 3，沒有邊指向它，仍是 inf。「[0, 4, 1, 5, inf]」是第一次發現就不再更新的結果；「[0, 3, 1, 6, inf]」是 dist[1] 變短後沒有再用 1 去鬆弛 1 → 3；「…, 5]」把 4 → 3 當成雙向邊。',
    },
    {
      id: 'q-order', prompt: '下面的程式記錄 Dijkstra「確定」節點的順序，印出什麼？',
      code: { language: 'Python', text: code`import heapq
adj = [[(1, 2), (2, 6), (3, 7)], [(2, 3), (4, 9)], [(4, 1)], [(4, 1)], []]
dist = [float('inf')] * 5
dist[0] = 0
pq = [(0, 0)]
order = []
while pq:
    d, u = heapq.heappop(pq)
    if d > dist[u]:
        continue
    order.append(u)
    for v, w in adj[u]:
        if d + w < dist[v]:
            dist[v] = d + w
            heapq.heappush(pq, (dist[v], v))
print(*order)` },
      options: ['0 1 2 4 3', '0 1 2 3 4', '0 1 2 2 4 3 4', '0 1 4 2 3'],
      answer: 0, explanation: '最短距離是 0:0、1:2、2:5（0 → 1 → 2）、4:6（0 → 1 → 2 → 4）、3:7，Dijkstra 依距離由小到大確定，所以是 0 1 2 4 3：4 比 3 先確定，雖然它的編號比較大、離起點的邊數也比較多。「0 1 2 3 4」是 BFS 一層一層的順序（也是發現的順序）；「0 1 2 2 4 3 4」是把 `order.append(u)` 放在過期檢查之前，連過期的 (6, 2)、(11, 4) 都記了進去；「0 1 4 2 3」以為鬆弛 1 → 4 之後會馬上處理 4，但當時 dist[4] = 11 並不是最小的。',
    },
    {
      id: 'q-negative', prompt: '圖上有一條負權邊 2 → 1（權重 −3）。下面「每個點只確定一次」的 Dijkstra 印出什麼？',
      code: { language: 'Python', text: code`import heapq
adj = [[(1, 1), (2, 3)], [(3, 2)], [(1, -3)], []]
dist = [float('inf')] * 4
done = [False] * 4
dist[0] = 0
pq = [(0, 0)]
while pq:
    d, u = heapq.heappop(pq)
    if done[u]:
        continue
    done[u] = True
    for v, w in adj[u]:
        if d + w < dist[v]:
            dist[v] = d + w
            heapq.heappush(pq, (dist[v], v))
print(dist)` },
      options: ['[0, 0, 3, 3]', '[0, 0, 3, 2]', '[0, 1, 3, 3]', '程式不會停'],
      answer: 0, explanation: '取出 0：dist[1] = 1、dist[2] = 3。取出 1（距離 1）並確定，dist[3] = 1 + 2 = 3。取出 2（距離 3）：3 − 3 = 0 < 1，dist[1] 改成 0，放入 (0, 1)；但 1 已經確定，取出 (0, 1) 時直接略過，1 → 3 沒有用新的距離重新鬆弛，dist[3] 停在 3。真正的最短距離是 [0, 0, 3, 2]（0 → 2 → 1 → 3 = 3 − 3 + 2），那是 Bellman-Ford 的答案，不是這個程式的輸出。「[0, 1, 3, 3]」以為已確定的點連 dist 都不會改，但這個程式在鬆弛時沒有檢查 done[v]。這張圖沒有負環，每個點只處理一次，程式一定會停。',
    },
    {
      id: 'q-complexity', prompt: '一張有向圖有 V = 10^5 個點、E = 2 × 10^5 條邊，權重非負。下面哪個描述正確？',
      options: [
        '用二元堆積的 Dijkstra 是 O((V + E) log V)，約 3 × 10^5 × 17 ≈ 5 × 10^6 次基本操作；每次掃整個 dist 找最小值的版本是 O(V²) ≈ 10^10',
        '兩種寫法都是 O(V + E)，因為每個點只確定一次',
        '用堆積的版本是 O(V × E × log V)，因為每個點都要掃過所有邊',
        '掃描 dist 的版本比較快，因為不用維護堆積',
      ],
      answer: 0, explanation: '每次鬆弛成功最多放入一筆紀錄，佇列總共 O(E) 筆，放入、取出各 O(log E) = O(log V)；每個點的出邊只在它被確定時掃一次。所以是 O((V + E) log V)。掃描版每確定一個點要花 O(V) 找最小值，共 V 次，是 O(V²)，在這種稀疏圖（E 遠小於 V²）上慢很多；它只在 E 接近 V² 的稠密圖上才划算。「O(V + E)」忽略了找最小值的代價（那是 BFS 的複雜度）；「O(V × E × log V)」把每個點都當成要掃過所有邊。',
    },
    {
      id: 'q-maxheap', prompt: '下面這段 C++ 的 Dijkstra（dist 是 `std::vector<long long>`，邊權非負）有什麼問題？',
      code: { language: 'C++', text: code`std::priority_queue<std::pair<long long, int>> pq;  // 想要每次取出距離最小的
dist[s] = 0;
pq.push({0, s});
while (!pq.empty()) {
    auto [d, u] = pq.top();
    pq.pop();
    if (d > dist[u]) continue;
    for (auto [v, w] : adj[u]) {
        if (d + w < dist[v]) {
            dist[v] = d + w;
            pq.push({dist[v], v});
        }
    }
}` },
      options: [
        '`priority_queue` 預設是最大堆積，先取出距離最大的；有過期檢查時最後的距離仍然正確，但同一個點會被處理很多次，失去 O((V + E) log V) 的保證',
        '`std::pair` 不能放進 `priority_queue`，無法編譯',
        '沒有問題：`priority_queue` 預設就是取出最小值',
        '最後的距離一定是錯的，因為先確定的是最遠的點',
      ],
      answer: 0, explanation: '`std::priority_queue` 預設用 `std::less`，`top()` 是最大值。先處理遠的點，之後近的點又把它的距離改小、重新放入，所以同一個點會被處理很多次；因為只丟掉 `d > dist[u]` 的紀錄、而且權重非負，最後的 dist 仍然正確，只是慢：在 40 個點的鏈（每點到下一點權重 1、到下下點權重 3）上實測，最小堆積取出 78 次，這段程式取出 420 次。`pair` 有內建的比較，可以編譯。「一定是錯的」只在用 `done` 陣列、每個點只處理一次的寫法才會發生。修正：`std::priority_queue<Item, std::vector<Item>, std::greater<Item>>`，或放入 `{-dist[v], v}`。',
    },
    {
      id: 'q-overflow', prompt: '下面的 Java 程式在一條鏈 0 → 1 → 2 → 3（每條邊權重 10^9）上執行 Dijkstra，印出什麼？',
      code: { language: 'Java', text: code`import java.util.Arrays;
import java.util.PriorityQueue;

public class Main {
    public static void main(String[] args) {
        int[][] adj = {{1}, {2}, {3}, {}};  // 一條鏈 0 -> 1 -> 2 -> 3
        int w = 1000000000;                  // 每條邊的權重都是 10^9
        int[] dist = new int[4];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[0] = 0;
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0]));
        pq.add(new int[]{0, 0});
        while (!pq.isEmpty()) {
            int[] top = pq.poll();
            int d = top[0], u = top[1];
            if (d > dist[u]) continue;
            for (int v : adj[u]) {
                if (d + w < dist[v]) {
                    dist[v] = d + w;
                    pq.add(new int[]{dist[v], v});
                }
            }
        }
        System.out.println(dist[3]);
    }
}` },
      options: ['3000000000', '-1294967296', '2147483647', '丟出 ArithmeticException'],
      answer: 1, explanation: 'dist[1] = 10^9、dist[2] = 2 × 10^9 都還在 `int` 的範圍內（上限 2147483647）。取出 2 時，`d + w` = 3 × 10^9 超過上限，Java 的 `int` 會繞回：3000000000 − 2^32 = −1294967296，它比 dist[3] 的 `Integer.MAX_VALUE` 小，於是被寫進 dist[3]。Java 的整數溢位不會丟出例外；`2147483647` 是以為到不了。正確寫法是 `dist` 與 `d` 都用 `long`，才會印出 3000000000；C++ 的 `int` 溢位更糟，是未定義行為。',
    },
    {
      id: 'q-choose', prompt: '三個問題：(1) 迷宮中每走一格都花 1 秒，求最少秒數；(2) 城市道路的行車時間各不相同（都是正數），求最短時間；(3) 有些路段走過會補充能量（代價為負），保證沒有負環，求最小總代價。依序最適合的方法是？',
      options: ['BFS、Dijkstra、Bellman-Ford', 'Dijkstra、Dijkstra、Dijkstra', 'BFS、BFS、Dijkstra', 'DFS、Dijkstra、Bellman-Ford'],
      answer: 0, explanation: '(1) 每條邊代價相同，邊數最少就是時間最短，BFS 是 O(V + E)；用 Dijkstra 答案也對，只是多了 log V。(2) 權重不同，BFS 會選邊數少但比較慢的路，要用 Dijkstra。(3) 有負權邊，Dijkstra 可能算錯（本課的反例），要用 Bellman-Ford；它也能判斷有沒有負環。DFS 找到的第一條路不保證最短。如果代價只有 0 和 1 兩種，還可以用 0-1 BFS。',
    },
  ],
  exercises: [
    {
      id: 'e-sssp', title: '單一起點的最短距離',
      statement: '有 n 個地點（編號 1 到 n）與 m 條單向道路，第 i 條從 u 到 v，通過要花 w（0 ≤ w ≤ 10^9）。請求出從起點 s 到每個地點的最短總花費；到不了的地點輸出 −1。同一對地點之間可能有好幾條道路，也可能有從一個地點回到自己的道路。n 最大 10^5、m 最大 2 × 10^5，請用優先佇列實作 Dijkstra，做到 O((n + m) log n)；距離可能遠超過 2^31，要用 64 位元整數。輸入不合法（例如權重是負的、地點編號超出範圍）時只輸出 `Invalid`。',
      inputFormat: '第一行三個整數 n m s。接下來 m 行，每行三個整數 u v w，代表一條從 u 到 v、花費 w 的單向道路。所有數字以空白或換行分隔。',
      outputFormat: '一行 n 個整數，以一個空白分隔：第 i 個是 s 到地點 i 的最短總花費，到不了是 −1（s 自己是 0）。輸入不合法時只輸出一行 `Invalid`。',
      constraints: [
        '1 ≤ n ≤ 10^5，0 ≤ m ≤ 2 × 10^5，1 ≤ s ≤ n',
        '1 ≤ u, v ≤ n，0 ≤ w ≤ 10^9；允許重複的邊與自環（u = v）',
        '每個數都必須是十進位整數，而且剛好有 3 + 3m 個數；不符合任何一項就輸出 Invalid',
      ],
      samples: [{ kind: 'normal', input: '5 6 1\n1 2 4\n1 3 1\n3 2 2\n2 4 5\n3 4 8\n5 1 3', output: '0 3 1 8 -1', note: '1 → 3 → 2（3）比直接 1 → 2（4）短；地點 5 只有出去的路，到不了' }],
      tests: [
        { kind: 'normal', input: '5 6 1\n1 2 4\n1 3 1\n3 2 2\n2 4 5\n3 4 8\n5 1 3', output: '0 3 1 8 -1', note: '範例' },
        { kind: 'normal', input: '4 4 1\n1 4 10\n1 2 1\n2 3 1\n3 4 1', output: '0 1 2 3', note: '1 → 4 只有一條邊卻要 10，繞 3 條邊只要 3：數邊數的 BFS 會答 10' },
        { kind: 'normal', input: '6 9 3\n3 1 7\n3 2 2\n2 1 3\n1 4 1\n2 4 8\n4 5 2\n5 6 1\n2 6 20\n6 3 1', output: '5 2 0 6 8 9', note: '起點是 3；1、4、6 的距離都會被更新一次以上，第一次發現就不再更新的做法會錯' },
        { kind: 'normal', input: '5 6 5\n5 4 1\n4 3 1\n3 2 1\n2 1 1\n5 1 10\n3 5 1', output: '4 3 2 1 0', note: '邊從大編號指向小編號：照編號順序只鬆弛一輪的做法會錯' },
        { kind: 'normal', input: '8 16 2\n6 2 7\n7 8 18\n8 4 0\n2 2 9\n2 8 0\n8 6 6\n7 5 11\n6 7 16\n2 6 2\n5 5 14\n3 5 0\n6 6 14\n7 2 12\n8 2 13\n8 7 16\n5 7 18', output: '-1 0 -1 0 27 2 16 0', note: '隨機小圖（含自環、0 權重），答案以 Bellman-Ford 交叉檢查' },
        { kind: 'normal', input: '12 30 8\n9 9 864548086\n1 10 241081736\n3 1 756625749\n9 11 110140551\n12 10 461074970\n8 3 517665009\n4 2 672882330\n12 8 724027511\n8 12 998005110\n9 5 601076435\n7 11 330312277\n9 11 538910604\n12 8 864248673\n7 7 217466370\n5 5 9960991\n1 3 703990996\n10 8 862801954\n9 8 386478187\n4 5 743725055\n8 8 548968520\n8 7 598973996\n11 1 892712094\n5 6 491403934\n2 8 740165814\n12 9 277917833\n8 3 457174076\n12 8 69036396\n11 5 969871994\n8 6 103790621\n4 12 919807268', output: '1213799825 -1 457174076 -1 1876999378 103790621 598973996 0 1275922943 1454881561 929286273 998005110', note: '隨機中型圖、權重接近 10^9：距離超過 2^31 − 1，答案以 Bellman-Ford 交叉檢查' },
        { kind: 'edge', input: '1 0 1', output: '0', note: '只有一個地點、沒有道路' },
        { kind: 'edge', input: '1 1 1\n1 1 5', output: '0', note: '只有一個自環：起點仍是 0' },
        { kind: 'edge', input: '4 4 1\n1 2 0\n2 3 0\n3 4 0\n1 4 1', output: '0 0 0 0', note: '權重 0 的邊：沿著 0 走三步比直接走 1 更短' },
        { kind: 'edge', input: '3 5 1\n1 2 5\n1 2 3\n1 2 7\n2 3 4\n2 3 1', output: '0 3 4', note: '同一對地點之間有好幾條路，要取最小的' },
        { kind: 'edge', input: '3 4 1\n1 1 0\n2 2 1\n1 2 6\n2 3 0', output: '0 6 6', note: '自環不會讓距離變短' },
        { kind: 'edge', input: '3 0 2', output: '-1 0 -1', note: '沒有任何道路，只有起點到得了' },
        { kind: 'edge', input: '2 1 1\n2 1 5', output: '0 -1', note: '道路是單向的：有 2 → 1 不代表 1 能到 2' },
        { kind: 'edge', input: '3 3 1\n1 2 0\n2 3 0\n3 1 0', output: '0 0 0', note: '權重全為 0 的環：程式必須正常結束' },
        { kind: 'edge', input: '5 4 1\n1 2 1000000000\n2 3 1000000000\n3 4 1000000000\n4 5 1000000000', output: '0 1000000000 2000000000 3000000000 4000000000', note: '距離超過 2^31 − 1：用 32 位元整數會溢位成負數' },
        { kind: 'edge', input: '5 5 1\n1 2 1000000000\n2 3 1000000000\n3 4 1000000000\n1 5 1000000000\n5 4 1000000000', output: '0 1000000000 2000000000 2000000000 1000000000', note: '用 int 時 3 → 4 的 3 × 10^9 會溢位成負數，被誤當成更短的路' },
        { kind: 'edge', input: '4 3 4\n4 3 2\n3 2 2\n1 2 1', output: '-1 4 2 0', note: '起點是最後一個地點；地點 1 只有出去的路' },
        { kind: 'edge', input: ladderInput, output: ladderOutput, note: '20001 個地點、39998 條路（約 0.86 MB）：每點到下一點 10^9、到下下點 10^9 − 1，距離約到 10^13，最後一個地點到不了；BFS、32 位元整數或 O(nm) 的做法都過不了' },
        { kind: 'edge', input: starInput, output: starOutput, note: '25000 個地點（約 0.79 MB）：起點直接連到每個地點（10^9），但沿著權重 1 的鏈更近；每筆 10^9 的紀錄都會過期，考驗延遲刪除' },
        { kind: 'edge', input: '100000 0 1', output: `0${' -1'.repeat(99999)}`, note: 'n 達到上限而沒有道路：輸出 1 個 0 與 99999 個 −1' },
        { kind: 'error', input: '3 2 1\n1 2 5\n2 3 -1', output: 'Invalid', note: '負權重：Dijkstra 不適用' },
        { kind: 'error', input: '3 1 1\n0 2 5', output: 'Invalid', note: '起點編號 0 超出 1..n' },
        { kind: 'error', input: '3 1 1\n1 4 5', output: 'Invalid', note: '終點編號大於 n' },
        { kind: 'error', input: '3 1 0\n1 2 5', output: 'Invalid', note: 's = 0' },
        { kind: 'error', input: '3 1 4\n1 2 5', output: 'Invalid', note: 's 大於 n' },
        { kind: 'error', input: '0 0 1', output: 'Invalid', note: 'n = 0' },
        { kind: 'error', input: '100001 0 1', output: 'Invalid', note: 'n 超過 10^5' },
        { kind: 'error', input: '2 200001 1', output: 'Invalid', note: 'm 超過 2 × 10^5' },
        { kind: 'error', input: '2 -1 1', output: 'Invalid', note: 'm 是負數' },
        { kind: 'error', input: '2 1 1\n1 2 1000000001', output: 'Invalid', note: '權重超過 10^9' },
        { kind: 'error', input: '2 1 1\n1 2 99999999999999999999999', output: 'Invalid', note: '權重大到放不進 64 位元整數，也必須輸出 Invalid 而不是溢位' },
        { kind: 'error', input: '3 2 1\n1 2 5', output: 'Invalid', note: '道路少於 m 條' },
        { kind: 'error', input: '2 1 1\n1 2 5\n2 1', output: 'Invalid', note: '多出不完整的資料' },
        { kind: 'error', input: '2 1 1\n1 2 1.5', output: 'Invalid', note: '權重不是整數' },
        { kind: 'error', input: '2 1 1\n1 2 x', output: 'Invalid', note: '出現非數字' },
        { kind: 'error', input: '2 1 1\n1 2 +5', output: 'Invalid', note: '帶正號不算十進位整數的寫法' },
        { kind: 'error', input: '', output: 'Invalid', note: '空輸入' },
      ],
      hints: [
        '先把所有 token 讀進來並逐一檢查是不是整數，再檢查 n、m、s 的範圍與數字個數是不是剛好 3 + 3m，最後檢查每條路。全部合法才開始計算。',
        '鄰接串列存 `(v, w)`；道路是單向的，只加 u → v。',
        '`dist` 用 64 位元整數，初始為一個比所有可能距離都大的 INF；優先佇列放 `(距離, 地點)`，取出時 `d > dist[u]` 就略過。',
        'C++ 記得用 `std::greater` 讓 `priority_queue` 變成最小堆積；Java 的比較器用 `Long.compare`。',
        '輸出時把 INF 換成 −1。輸入很大：C++ 關掉同步（`std::ios::sync_with_stdio(false)`），Python 用 `sys.stdin.buffer.read().split()`，Java 用 `BufferedReader` 讀入、`StringBuilder` 組合輸出。',
      ],
      solution: {
        'C++': code`#include <functional>
#include <iostream>
#include <limits>
#include <queue>
#include <string>
#include <utility>
#include <vector>

// 把 token 轉成整數；不是十進位整數（可有負號）就回傳 false。
// 絕對值 ≥ 10^17 的數一律停在 ≥ 10^17（一定超出範圍），不會溢位。
bool parseInt(const std::string& t, long long& out) {
    std::size_t i = (!t.empty() && t[0] == '-') ? 1 : 0;
    if (i == t.size()) return false;
    long long v = 0;
    for (; i < t.size(); i++) {
        if (t[i] < '0' || t[i] > '9') return false;
        if (v < 100000000000000000LL) v = v * 10 + (t[i] - '0');
    }
    out = t[0] == '-' ? -v : v;
    return true;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<long long> nums;
    std::string tok;
    while (std::cin >> tok) {
        long long x;
        if (!parseInt(tok, x)) {
            std::cout << "Invalid\n";
            return 0;
        }
        nums.push_back(x);
    }
    if (nums.size() < 3) {
        std::cout << "Invalid\n";
        return 0;
    }
    long long n = nums[0], m = nums[1], s = nums[2];
    if (n < 1 || n > 100000 || m < 0 || m > 200000 || s < 1 || s > n || nums.size() != static_cast<std::size_t>(3 + 3 * m)) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<std::vector<std::pair<int, long long>>> adj(n + 1);
    for (std::size_t i = 3; i < nums.size(); i += 3) {
        long long u = nums[i], v = nums[i + 1], w = nums[i + 2];
        if (u < 1 || u > n || v < 1 || v > n || w < 0 || w > 1000000000) {
            std::cout << "Invalid\n";
            return 0;
        }
        adj[u].push_back({static_cast<int>(v), w});
    }

    const long long INF = std::numeric_limits<long long>::max();
    std::vector<long long> dist(n + 1, INF);  // 最長約 10^5 × 10^9 = 10^14，要用 long long
    using Item = std::pair<long long, int>;
    std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;  // 最小堆積
    dist[s] = 0;
    pq.push({0, static_cast<int>(s)});
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue;  // 過期的紀錄
        for (auto [v, w] : adj[u]) {
            if (d + w < dist[v]) {
                dist[v] = d + w;
                pq.push({dist[v], v});
            }
        }
    }
    std::string out;
    for (int v = 1; v <= n; v++) {
        if (v > 1) out += ' ';
        out += dist[v] == INF ? "-1" : std::to_string(dist[v]);
    }
    std::cout << out << "\n";
}`,
        Python: code`import heapq
import sys


def main():
    nums = []
    for t in sys.stdin.buffer.read().split():
        body = t[1:] if t[:1] == b'-' else t
        if not body.isdigit():  # 只接受十進位整數（可有負號）
            print("Invalid")
            return
        nums.append(int(t))
    if len(nums) < 3:
        print("Invalid")
        return
    n, m, s = nums[0], nums[1], nums[2]
    if not (1 <= n <= 100000 and 0 <= m <= 200000 and 1 <= s <= n) or len(nums) != 3 + 3 * m:
        print("Invalid")
        return
    adj = [[] for _ in range(n + 1)]
    for i in range(3, len(nums), 3):
        u, v, w = nums[i], nums[i + 1], nums[i + 2]
        if not (1 <= u <= n and 1 <= v <= n and 0 <= w <= 10**9):
            print("Invalid")
            return
        adj[u].append((v, w))
    INF = 1 << 62
    dist = [INF] * (n + 1)
    dist[s] = 0
    pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:  # 過期的紀錄
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    print(' '.join(str(d) if d < INF else '-1' for d in dist[1:]))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.PriorityQueue;
import java.util.StringTokenizer;

public class Main {
    static boolean valid = true;

    // 把 token 轉成整數；不是十進位整數（可有負號）就把 valid 設成 false。
    // 絕對值 ≥ 10^17 的數一律停在 ≥ 10^17（一定超出範圍），不會溢位。
    static long parse(String t) {
        int i = t.charAt(0) == '-' ? 1 : 0;
        if (i == t.length()) valid = false;
        long v = 0;
        for (; i < t.length(); i++) {
            char ch = t.charAt(i);
            if (ch < '0' || ch > '9') {
                valid = false;
                return 0;
            }
            if (v < 100000000000000000L) v = v * 10 + (ch - '0');
        }
        return t.charAt(0) == '-' ? -v : v;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        long[] nums = new long[16];
        int count = 0;
        String line;
        while ((line = br.readLine()) != null && valid) {
            StringTokenizer st = new StringTokenizer(line);
            while (st.hasMoreTokens() && valid) {
                if (count == nums.length) nums = Arrays.copyOf(nums, count * 2);
                nums[count++] = parse(st.nextToken());
            }
        }
        if (!valid || count < 3) {
            System.out.println("Invalid");
            return;
        }
        long n = nums[0], m = nums[1], s = nums[2];
        if (n < 1 || n > 100000 || m < 0 || m > 200000 || s < 1 || s > n || count != 3 + 3 * m) {
            System.out.println("Invalid");
            return;
        }
        // 鄰接串列用陣列存（前向星）：head[u] 是 u 的第一條邊，next 串起同一個起點的邊
        int[] head = new int[(int) n + 1], next = new int[(int) m], to = new int[(int) m];
        long[] weight = new long[(int) m];
        Arrays.fill(head, -1);
        for (int e = 0; e < m; e++) {
            long u = nums[3 + 3 * e], v = nums[4 + 3 * e], w = nums[5 + 3 * e];
            if (u < 1 || u > n || v < 1 || v > n || w < 0 || w > 1000000000) {
                System.out.println("Invalid");
                return;
            }
            to[e] = (int) v;
            weight[e] = w;
            next[e] = head[(int) u];
            head[(int) u] = e;
        }

        long[] dist = new long[(int) n + 1];  // 最長約 10^5 × 10^9 = 10^14，要用 long
        Arrays.fill(dist, Long.MAX_VALUE);
        PriorityQueue<long[]> pq = new PriorityQueue<>((a, b) -> Long.compare(a[0], b[0]));  // 不要寫 (int) (a[0] - b[0])
        dist[(int) s] = 0;
        pq.add(new long[]{0, s});
        while (!pq.isEmpty()) {
            long[] top = pq.poll();
            long d = top[0];
            int u = (int) top[1];
            if (d > dist[u]) continue;  // 過期的紀錄
            for (int e = head[u]; e != -1; e = next[e]) {
                int v = to[e];
                if (d + weight[e] < dist[v]) {
                    dist[v] = d + weight[e];
                    pq.add(new long[]{dist[v], v});
                }
            }
        }
        StringBuilder sb = new StringBuilder();
        for (int v = 1; v <= n; v++) {
            if (v > 1) sb.append(' ');
            sb.append(dist[v] == Long.MAX_VALUE ? -1 : dist[v]);
        }
        System.out.println(sb);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

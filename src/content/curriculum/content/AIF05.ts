import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/**
 * AIF05 啟發式搜尋與 A*. Python only (python-code). Every example and the reference solution run in the curriculum
 * code tests; their outputs were produced by running the programs.
 *
 * The visualization's graph: undirected, 6 nodes, the same graph and heuristic as examples e-greedy and
 * e-inadmissible. The heuristic is admissible and consistent (h ≤ h*, |h(u) − h(v)| ≤ w on every edge):
 * true distances to G are S 6, A 5, B 5, C 3, D 2, G 0. Greedy best-first takes S-B-G (9); A* finds S-A-C-D-G (6).
 */
const TRACE_NODES = ['S', 'A', 'B', 'C', 'D', 'G'];
const TRACE_EDGES: { from: string; to: string; weight: number }[] = ([['S', 'A', 1], ['S', 'B', 4], ['A', 'C', 2], ['B', 'G', 5], ['C', 'D', 1], ['D', 'G', 2]] as const)
  .map(([from, to, weight]) => ({ from, to, weight }));
const H: Record<string, number> = { S: 5, A: 4, B: 1, C: 3, D: 2, G: 0 };
/** Neighbours in the order of the adjacency dict on lines 2–3 of the trace code (the edge list's order, both ways). */
const ADJ = new Map<string, { to: string; w: number; i: number }[]>(TRACE_NODES.map(n => [n, TRACE_EDGES.flatMap((e, i) => e.from === n ? [{ to: e.to, w: e.weight, i }] : e.to === n ? [{ to: e.from, w: e.weight, i }] : [])]));
const TRACE_OUTPUT = '6 S-A-C-D-G 5';

/**
 * The trace code's A*, run here step by step: open is a heap of (f, h, counter, node) tuples, served smallest first
 * (heapq compares the tuples, and the counter is unique, so the node name is never compared). Lines: 6 start,
 * 9 a stale entry skipped, 10 the goal taken out, 11 a node expanded, 13 a neighbour skipped, 16 a neighbour pushed,
 * 19 the path printed. The last step's output is checked against the program's real output by the lesson test.
 */
const traceSteps: TraceStep[] = (() => {
  type Entry = [number, number, number, string];
  const g = new Map<string, number>([['S', 0]]), parent = new Map<string, string | null>([['S', null]]), closed = new Set<string>();
  let counter = 0;
  const open: Entry[] = [[H.S, H.S, 0, 'S']];
  const steps: TraceStep[] = [];
  const cmp = (a: Entry, b: Entry) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const stale = (e: Entry) => closed.has(e[3]) || e[0] !== g.get(e[3])! + H[e[3]];
  const snap = (line: number, note: string, marks: { node?: string; edge?: number; kind: Mark }[], vars: Record<string, string>, row?: string, kind?: Mark, goalTaken = false) => {
    const sorted = [...open].sort(cmp);
    const nodeMarks = TRACE_NODES.filter(n => !marks.some(m => m.node === n)).flatMap(n => closed.has(n) ? [{ node: n, kind: 'visited' as Mark }]
      : g.has(n) ? [{ node: n, kind: 'pending' as Mark }] : []);
    steps.push({
      line, note, vars,
      graph: { name: '加權無向圖（邊上是成本）', nodes: TRACE_NODES, edges: TRACE_EDGES.map(e => ({ ...e })), directed: false, marks: [...nodeMarks, ...marks], show: ['list'] },
      containers: [{ name: 'open（依 (f, h, counter) 由小到大，最前面先取出）', kind: 'queue', items: sorted.map(([f, h, c, n]) => `(${f}, ${h}, ${c}, ${n})`),
        marks: sorted.flatMap((e, at) => stale(e) ? [{ at, kind: 'removed' as Mark }] : []) }],
      table: { name: 'g、h、f 與 parent', head: ['節點', 'g', 'h', 'f = g + h', 'parent', '狀態'],
        rows: TRACE_NODES.map(n => [n, g.has(n) ? String(g.get(n)) : '∞', String(H[n]), g.has(n) ? String(g.get(n)! + H[n]) : '—',
          parent.has(n) ? parent.get(n) ?? '起點' : '—', closed.has(n) ? 'closed' : goalTaken && n === 'G' ? '取出（終點）' : g.has(n) ? 'open' : '未發現']),
        marks: row ? [{ row: TRACE_NODES.indexOf(row), kind: kind! }] : [] },
    });
  };
  snap(6, '起點 S：g = 0、h = 5，f = 5。open 裡只有 (5, 5, 0, S)，closed 是空的。tuple 的第二項 h 與第三項 counter 是同分時的決勝順序：f 相同先取 h 小的，再相同就先取先放進去的。',
    [{ node: 'S', kind: 'current' }], { counter: '0' }, 'S', 'write');
  let output = '';
  while (open.length) {
    open.sort(cmp);
    const [f, h, c, u] = open.shift()!;
    const popped = `(${f}, ${h}, ${c}, ${u})`;
    if (closed.has(u)) { snap(9, `取出 ${popped}：${u} 已在 closed，這是過期紀錄，continue。`, [{ node: u, kind: 'read' }], { f: String(f), u }); continue; }
    if (u === 'G') {
      snap(10, `取出 ${popped}：u 是終點 G，break。要等終點「從 open 取出」才停，因為這時 open 裡所有紀錄的 f 都不小於 ${f}，不可能再有更便宜的路。`,
        [{ node: 'G', kind: 'found' }], { f: String(f), u, 'g[G]': String(g.get('G')) }, 'G', 'found', true);
      break;
    }
    closed.add(u);
    const tieNote = u === 'B' ? '(5, 4, 1, A) 和 (5, 1, 2, B) 的 f 都是 5，比第二項 h：1 < 4，所以 B 先取出。h 小代表「估計離終點比較近」，同分時先試它通常比較快碰到終點。' : '';
    snap(11, `取出 ${popped}：${u} 不是終點，放進 closed（展開 ${u}），接著看 ${u} 的每個鄰居。${tieNote}`, [{ node: u, kind: 'current' }],
      { f: String(f), u, 'g[u]': String(g.get(u)), 'len(closed)': String(closed.size) }, u, 'found');
    for (const { to: v, w, i } of ADJ.get(u)!) {
      const old = g.get(v), ng = g.get(u)! + w;
      if (closed.has(v) || (old !== undefined && ng >= old)) {
        snap(13, closed.has(v) ? `鄰居 ${v} 已在 closed，略過：h 是一致的，第一次展開時的 g 就是最小值，不必再打開。` : `鄰居 ${v}：${g.get(u)} + ${w} = ${ng} ≥ g[${v}] = ${old}，不更新。`,
          [{ node: u, kind: 'current' }, { node: v, kind: 'read' }, { edge: i, kind: 'read' }], { u, v, w: String(w), 'g[u] + w': String(ng) }, v, 'read');
        continue;
      }
      g.set(v, ng); parent.set(v, u); counter += 1;
      open.push([ng + H[v], H[v], counter, v]);
      const extra = v === 'G' && old !== undefined ? `G 原本的 g 是 ${old}（S-B-G），現在找到更便宜的 ${ng}。舊的 (${old}, 0, …, G) 還留在 open 裡，heapq 不能修改元素，只能等它被取出時當成過期紀錄略過。`
        : v === 'G' ? '這時已經「產生」了終點，但 g = 9 不一定最小，所以先放進 open，不能馬上回傳。' : '';
      snap(16, `鄰居 ${v}：g = ${g.get(u)} + ${w} = ${ng}，h = ${H[v]}，f = ${ng + H[v]}；parent[${v}] = ${u}，counter 變成 ${counter}，放進 open。${extra}`,
        [{ node: u, kind: 'current' }, { node: v, kind: 'write' }, { edge: i, kind: 'write' }], { u, v, w: String(w), 'g[v]': String(ng), 'h[v]': String(H[v]), counter: String(counter) }, v, 'write');
    }
  }
  const path = ['G'];
  while (parent.get(path.at(-1)!)) path.push(parent.get(path.at(-1)!)!);
  path.reverse();
  output = `${g.get('G')} ${path.join('-')} ${closed.size}`;
  if (output !== TRACE_OUTPUT) throw new Error(`AIF05: the trace ends with ${output}, the program prints ${TRACE_OUTPUT}`);
  const pathEdges = path.slice(1).map((v, k) => TRACE_EDGES.findIndex(e => (e.from === path[k] && e.to === v) || (e.to === path[k] && e.from === v)));
  snap(19, `沿 parent 從 G 倒推：${[...path].reverse().join(' ← ')}，成本 ${g.get('G')}，展開了 ${closed.size} 個節點（S、B、A、C、D）。B 雖然被展開，但它通往 G 的路（成本 9）最後被 D 那條（成本 6）取代。印出 \`${output}\`。`,
    [...path.map(n => ({ node: n, kind: 'found' as Mark })), ...pathEdges.map(e => ({ edge: e, kind: 'found' as Mark }))], { 'g[G]': String(g.get('G')), 'len(closed)': String(closed.size) }, undefined, undefined, true);
  steps.at(-1)!.output = output;
  return steps;
})();

export const AIF05: LessonContent = {
  lessonId: 'AIF05',
  motivation: 'AIF04 的無資訊搜尋（BFS、UCS）不知道終點在哪個方向，只能從起點一圈一圈往外擴：在 100 × 100 的地圖上，終點就在右邊 10 格，UCS 也會把左邊、上面、下面成本小於 10 的格子全部展開一遍。人找路時不會這樣做，我們會「大概朝終點的方向」走。啟發式搜尋（informed search）把這種直覺寫成一個函數 h(n)：估計從 n 到終點還要多少成本。只看 h 的貪婪最佳優先搜尋很快，卻可能走錯路；A* 把「已經花的成本 g」和「估計還要的成本 h」相加，只要 h 從不高估，就保證找到最便宜的路，而且通常比 Dijkstra 少展開很多節點。A* 由 Peter Hart、Nils Nilsson 與 Bertram Raphael 在 1968 年發表，至今仍是遊戲尋路、機器人路徑規劃與拼圖求解的基本工具。這一課要學會：怎麼定義與設計啟發函數、什麼條件下 A* 一定最佳、怎麼比較兩個啟發函數，以及怎麼用數字（展開數、有效分支因子）說明搜尋變快了多少。',
  sections: [
    {
      id: 'heuristic', title: '啟發函數與貪婪最佳優先搜尋',
      blocks: [
        { type: 'p', text: '啟發函數（heuristic function）h(n) 是對「從狀態 n 走到最近的終點，最少還要多少成本」的估計。真正的最少成本記成 h*(n)，搜尋時不知道它，否則就不必搜尋了。h 只看狀態本身，要算得快，例如格子地圖上 n 與終點的曼哈頓距離 |Δ列| + |Δ行|，或地圖上兩城市的直線距離。終點的 h 一定是 0。' },
        { type: 'p', text: '搜尋演算法的骨架和 AIF04 一樣：一個依優先順序取出的邊界（frontier，又稱 open），一個記錄已展開狀態的集合（closed）。差別只在 open 用什麼排序。貪婪最佳優先搜尋（greedy best-first search）令 f(n) = h(n)：永遠先展開「看起來離終點最近」的節點，完全不管走到這裡已經花了多少。' },
        { type: 'example', id: 'e-greedy' },
        { type: 'p', text: '範例的圖裡 B 的 h 只有 1（估計離終點很近），貪婪搜尋從 S 立刻走向 B，再從 B 直接到 G，只展開 2 個節點就結束，但路徑 S-B-G 的成本是 4 + 5 = 9。A* 展開 5 個節點，找到成本 6 的 S-A-C-D-G。貪婪搜尋快，是因為它只看前方；它不最佳，也是因為它只看前方：S → B 這條邊已經花了 4，它不在乎。' },
        { type: 'table', head: ['演算法', 'open 的排序依據', '最佳？', '本課的圖'], rows: [
          ['UCS／Dijkstra（AIF04、A16）', 'f(n) = g(n)', '是（邊成本非負）', '展開 5 個，成本 6'],
          ['貪婪最佳優先', 'f(n) = h(n)', '否', '展開 2 個，成本 9'],
          ['A*', 'f(n) = g(n) + h(n)', '是（h 可接受；用 closed 時要一致）', '展開 5 個，成本 6'],
        ] },
        { type: 'callout', tone: 'warning', title: '「h 最小的鄰居」不等於「最短路上的下一步」', text: 'h 只是估計，而且它不知道走過去要付多少。貪婪搜尋在有限圖上用 closed 集合可以保證找得到解（不會繞圈），但不保證最便宜；在沒有 closed 的樹搜尋中，它甚至可能在兩個狀態之間來回而永遠不停。需要最便宜的路時，不能只看 h。' },
      ],
    },
    {
      id: 'astar', title: 'A*：f(n) = g(n) + h(n)',
      blocks: [
        { type: 'p', text: 'A* 的 f(n) = g(n) + h(n)：g(n) 是從起點走到 n 目前找到的最小成本，h(n) 是估計還要的成本，所以 f(n) 是「經過 n 的完整路徑」的估計成本。A* 每次從 open 取出 f 最小的節點；它和 A16 的 Dijkstra 程式幾乎一樣，只是放進優先佇列（D15 的 heap）的鍵從 g 改成 g + h。' },
        { type: 'list', ordered: true, items: [
          '起點放進 open：g = 0，f = h(起點)。',
          '從 open 取出 f 最小的紀錄 u。若 u 已在 closed，這是過期紀錄，略過。',
          '若 u 是終點，停止：g(u) 就是答案（「取出時」才檢查終點，不是「產生時」）。',
          '否則把 u 放進 closed（展開 u），對每個鄰居 v：若 v 不在 closed，且 g(u) + c(u, v) < g(v)，就更新 g(v) 與 parent(v)，把 (f, h, counter, v) 放進 open。',
          'open 空了還沒取出終點：沒有路。',
        ] },
        { type: 'p', text: '本課所有程式都用 tuple (f, h, counter, 節點) 當 heap 的元素，同分時的順序完全確定：f 小的先；f 相同時 h 小的先（比較接近終點，常常更快碰到終點）；再相同就看 counter，先放進去的先取出。counter 每放一筆加 1，因為它不會重複，heapq 永遠不必比較節點本身。展開數會受同分規則影響，所以比較兩種啟發函數時，規則必須固定。' },
        { type: 'p', text: '下方的視覺化逐步執行同一張圖上的 A*：表格列出每個節點的 g、h、f = g + h、parent 與狀態（未發現、open、closed），佇列面板是 open 依 (f, h, counter) 排好的樣子，被取代的舊紀錄標成「已移除」。注意 G 曾經以 g = 9（經過 B）進入 open，後來經過 D 降到 6；因為 A* 要等終點從 open 取出才停，那條較貴的路沒有被回傳。' },
        { type: 'callout', tone: 'note', title: 'A* 也是「最佳優先」的一種', text: '貪婪搜尋、UCS 與 A* 都是最佳優先搜尋（best-first search）：差別只是評估函數 f。f = g 是 UCS，f = h 是貪婪，f = g + h 是 A*。寫成一個函數、把 f 當參數傳進去，就能用同一份程式比較三者，本課的範例就是這樣做的。' },
      ],
    },
    {
      id: 'optimality', title: '可接受與一致性：A* 為什麼最佳',
      blocks: [
        { type: 'p', text: '可接受（admissible）：對每個 n，h(n) ≤ h*(n)，也就是從不高估。一致（consistent，又稱單調 monotone）：對每條邊 n → n\'，h(n) ≤ c(n, n\') + h(n\')，像三角不等式；再加上 h(終點) = 0。一致一定可接受（沿著最短路把不等式一路加到終點即得），反過來不一定。' },
        { type: 'table', head: ['條件', '定義', '保證什麼'], rows: [
          ['可接受', 'h(n) ≤ h*(n)', 'A* 取出終點時的 g 就是最小成本（不用 closed、允許重複展開時）'],
          ['一致', 'h(n) ≤ c(n, n\') + h(n\')', '沿任何路徑 f 不會變小；節點第一次被取出時 g 已經最小，用 closed 不必重新打開'],
          ['都不滿足', 'h 在某處高估', '可能回傳較貴的路'],
        ] },
        { type: 'p', text: '為什麼可接受就最佳？設最便宜的成本是 C*。假如 A* 取出終點時 g = C > C*。最佳路徑上一定還有某個節點 n 在 open 裡（起點就在最佳路徑上，路徑還沒走完），而且 g(n) 已經是它在最佳路徑上的成本，所以 f(n) = g(n) + h(n) ≤ g(n) + h*(n) = C* < C。f(n) 比終點小，A* 應該先取出 n，矛盾。所以終點被取出時 g 一定等於 C*。一致性再保證 f 沿路徑不減，於是每個節點第一次被取出時就已經是最小的 g，closed 裡的節點永遠不必再打開。' },
        { type: 'example', id: 'e-inadmissible' },
        { type: 'p', text: '範例只改了一個數字：h(A) 從 4 改成 10，而 A 到 G 真正的成本是 5，h 高估了。A 的 f 變成 1 + 10 = 11，B 那條路的終點 f 只有 9，A* 先取出 G，回傳成本 9 的 S-B-G。A* 的最佳性完全建立在「不高估」上。' },
        { type: 'callout', tone: 'warning', title: '「h 越大越準，所以越大越好」只對了一半', text: '在可接受的前提下，h 越大（越接近 h*）展開越少；一旦超過 h*，就失去最佳保證。故意把 h 乘上 w > 1（weighted A*）會更快，但找到的路可能比最佳貴。另一個陷阱：h 可接受但不一致時，若程式用 closed 而且從不重新打開節點，也可能回傳較貴的路；這時要允許重新打開，或改用一致的 h。' },
      ],
    },
    {
      id: 'grid', title: '格子地圖：曼哈頓距離與零啟發（A* 與 Dijkstra）',
      blocks: [
        { type: 'p', text: '在只能上下左右移動、每步成本至少 1 的格子地圖上，曼哈頓距離 |r − r_G| + |c − c_G| 是一致的啟發函數：走一步最多讓它減少 1，而那一步至少花 1。它忽略牆，所以只會低估。h = 0 也可接受而且一致，這時 f = g，A* 就變成 UCS，也就是只找一個終點、找到就停的 Dijkstra。' },
        { type: 'example', id: 'e-grid' },
        { type: 'p', text: '兩種啟發函數找到的成本都是 11，因為兩者都可接受；差別在展開數：16 對 36。h = 0 時 open 只依 g 排序，所有 g < 11 的格子都會被展開，包括牆左側離終點越來越遠的角落；曼哈頓距離讓「離終點越遠」的格子 f 越大，只要 f 超過 11 就永遠不會被取出。' },
        { type: 'table', head: ['啟發函數', '路徑成本', '展開數', '說明'], rows: [
          ['曼哈頓距離', '11', '16', '朝終點方向延伸，只在牆附近散開'],
          ['h = 0（Dijkstra）', '11', '36', '依 g 一圈一圈往外擴，不管方向'],
        ] },
        { type: 'p', text: '一個常用的判斷：用一致的 h 時，f(n) < C* 的節點一定會被展開，f(n) > C* 的節點一定不會；f(n) = C* 的節點看同分規則。h = 0 時「f < C*」就是「g < C*」，所以 Dijkstra 會展開所有比終點近的節點。h 越大，滿足 f < C* 的節點越少。' },
        { type: 'callout', tone: 'note', title: '可以斜走時要換啟發函數', text: '若允許 8 個方向移動且斜走成本是 1，曼哈頓距離會高估（斜走一步讓它減少 2），不再可接受，要改用 Chebyshev 距離 max(|Δr|, |Δc|)；斜走成本是 √2 時常用 octile 距離。啟發函數必須配合移動規則與成本一起設計。' },
      ],
    },
    {
      id: 'relaxed', title: '放寬問題與支配關係',
      blocks: [
        { type: 'p', text: '好的啟發函數從哪裡來？一個系統化的方法是放寬問題（relaxed problem）：拿掉原問題的一些限制，讓它變簡單到可以直接算出最佳解，再用那個最佳成本當 h。放寬後的問題允許更多走法，最佳成本只會更小或相等，所以一定可接受；而且它是某個問題的真實距離，自然滿足三角不等式，也是一致的。' },
        { type: 'p', text: '8-puzzle（3 × 3 的滑塊拼圖）的規則是：方塊可以從格子 A 移到格子 B，若 A 與 B 相鄰，而且 B 是空格。拿掉「B 是空格」：每個方塊各自沿格子走到目標，需要的步數就是它的曼哈頓距離，加總得到 h2。兩個條件都拿掉，方塊可以一步跳到任何地方：每個不在目標位置的方塊各需 1 步，得到誤置方塊數（misplaced tiles）h1。格子地圖拿掉牆，得到的正是上一節的曼哈頓距離。' },
        { type: 'example', id: 'e-puzzle' },
        { type: 'p', text: '支配（dominance）：若 h1、h2 都可接受，而且對每個 n 都有 h2(n) ≥ h1(n)，就說 h2 支配 h1。每個不在目標的方塊，曼哈頓距離至少是 1，所以 h2 ≥ h1。h2 支配 h1 時，用一致的 h2 的 A* 不會比用 h1 展開更多節點（f 剛好等於 C* 的同分節點除外），因為「f(n) < C*」等於 h(n) < C* − g(n)，h 越大越難滿足。範例中深度 18 的狀態，h1 展開 929 個、h2 只展開 163 個。' },
        { type: 'table', head: ['起始狀態', '最佳步數 d', 'h1（誤置）', 'h2（曼哈頓）', 'h1 展開數', 'h2 展開數'], rows: [
          ['012456738', '10', '4', '6', '36', '13'],
          ['013526847', '14', '6', '8', '174', '52'],
          ['012673584', '18', '7', '12', '929', '163'],
        ] },
        { type: 'callout', tone: 'tip', title: '多個可接受的 h：取最大值', text: '若手上有 h1、h2、…、hk 都可接受，但沒有一個處處最大，可以用 h(n) = max(h1(n), …, hk(n))。最大值仍不超過 h*，所以可接受，而且支配每一個 hi。代價是每個節點要多算幾次 h。' },
      ],
    },
    {
      id: 'ebf', title: '有效分支因子：用一個數字比較啟發函數',
      blocks: [
        { type: 'p', text: '展開數會隨解的深度變化，深度不同的題目很難直接比。有效分支因子（effective branching factor）b* 把它換成一個數：若搜尋處理了 N 個節點、解的深度是 d，b* 是一棵每層分支數都相同、深度 d、總共有 N + 1 個節點的樹的分支數，也就是 N + 1 = 1 + b* + (b*)² + … + (b*)^d。b* 越接近 1，搜尋越像「直直走向終點」。教科書（Russell 與 Norvig）的例子是 N = 52、d = 5，得到 b* ≈ 1.92。' },
        { type: 'example', id: 'e-ebf' },
        { type: 'p', text: '這個方程沒有簡單的公式解，但左右兩邊都隨 b 遞增，可以用二分搜尋求出 b*。教科書的 N 是「產生的節點數」；本課的程式數的是展開數，代入同一個公式時數值會比較小，但同一種計數方式下比較兩個啟發函數，結論相同：深度 18 時，誤置方塊數的 b* ≈ 1.36，曼哈頓距離 ≈ 1.21。' },
        { type: 'table', head: ['深度 d', 'h1：N', 'h1：b*', 'h2：N', 'h2：b*'], rows: [
          ['10', '36', '1.23', '13', '1.05'],
          ['14', '174', '1.31', '52', '1.16'],
          ['18', '929', '1.36', '163', '1.21'],
        ] },
        { type: 'p', text: '題目夠難時，同一個啟發函數的 b* 變化不大（表中誤置方塊數從 1.23 到 1.36），所以可以用一些題目量出的 b*，粗估更深的題目大約要展開多少節點。若 b* 從 1.36 降到 1.21，深度 30 時兩者的差距大約是 (1.36 / 1.21)^30 倍，相差一個數量級以上；這也說明了為什麼設計更好的啟發函數，常常比換更快的電腦有用。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-greedy', title: '同一張圖：貪婪最佳優先與 A*',
      description: '同一個搜尋函數，貪婪只用 h 排序、第一次看到節點就定案；A* 用 g + h，找到更便宜的路時會更新。h 對這張圖可接受而且一致。',
      code: { Python: code`import heapq
adj = {'S': [('A', 1), ('B', 4)], 'A': [('S', 1), ('C', 2)], 'B': [('S', 4), ('G', 5)],
       'C': [('A', 2), ('D', 1)], 'D': [('C', 1), ('G', 2)], 'G': [('B', 5), ('D', 2)]}
h = {'S': 5, 'A': 4, 'B': 1, 'C': 3, 'D': 2, 'G': 0}

def search(start, goal, use_g):
    g, parent, closed = {start: 0}, {start: None}, set()
    counter = 0
    pq = [(h[start], h[start], counter, start)]
    expanded = 0
    while pq:
        _, _, _, u = heapq.heappop(pq)
        if u in closed:
            continue
        if u == goal:
            path = [u]
            while parent[path[-1]]:
                path.append(parent[path[-1]])
            return g[u], '-'.join(reversed(path)), expanded
        closed.add(u)
        expanded += 1
        for v, w in adj[u]:
            if v in closed:
                continue
            if use_g and g[u] + w < g.get(v, float('inf')):
                g[v], parent[v] = g[u] + w, u
            elif not use_g and v not in g:  # 貪婪：第一次看到就定案
                g[v], parent[v] = g[u] + w, u
            else:
                continue
            counter += 1
            f = g[v] + h[v] if use_g else h[v]
            heapq.heappush(pq, (f, h[v], counter, v))
    return None

for name, use_g in [('greedy', False), ('A*', True)]:
    cost, path, expanded = search('S', 'G', use_g)
    print(f'{name:6} path={path} cost={cost} expanded={expanded}')` },
      output: 'greedy path=S-B-G cost=9 expanded=2\nA*     path=S-A-C-D-G cost=6 expanded=5',
    },
    {
      id: 'e-inadmissible', title: '高估的啟發函數讓 A* 回傳較貴的路',
      description: '同一張圖，只把 h(A) 從 4 改成 10（A 到 G 真正的成本是 5）。A 的 f 變大，A* 在探索 A 之前就取出了經過 B 的終點。',
      code: { Python: code`import heapq
adj = {'S': [('A', 1), ('B', 4)], 'A': [('S', 1), ('C', 2)], 'B': [('S', 4), ('G', 5)],
       'C': [('A', 2), ('D', 1)], 'D': [('C', 1), ('G', 2)], 'G': [('B', 5), ('D', 2)]}
good = {'S': 5, 'A': 4, 'B': 1, 'C': 3, 'D': 2, 'G': 0}
bad = dict(good, A=10)  # A 真正離終點 5，卻估成 10：高估了

def astar(h, start='S', goal='G'):
    g, parent, closed, counter = {start: 0}, {start: None}, set(), 0
    pq = [(h[start], h[start], counter, start)]
    while pq:
        f, _, _, u = heapq.heappop(pq)
        if u in closed:
            continue
        if u == goal:
            path = [u]
            while parent[path[-1]]:
                path.append(parent[path[-1]])
            return g[u], '-'.join(reversed(path))
        closed.add(u)
        for v, w in adj[u]:
            if v not in closed and g[u] + w < g.get(v, float('inf')):
                g[v], parent[v] = g[u] + w, u
                counter += 1
                heapq.heappush(pq, (g[v] + h[v], h[v], counter, v))
    return None

for name, h in [('admissible', good), ('overestimate', bad)]:
    cost, path = astar(h)
    print(f'{name:12} h(A)={h["A"]:2} path={path} cost={cost}')` },
      output: 'admissible   h(A)= 4 path=S-A-C-D-G cost=6\noverestimate h(A)=10 path=S-B-G cost=9',
    },
    {
      id: 'e-grid', title: '格子地圖：曼哈頓距離與 h = 0 的展開數',
      description: '上下左右移動、每步成本 1，牆是 #。兩種啟發函數都可接受，路徑成本相同，展開數差很多；h = 0 的 A* 就是 Dijkstra。',
      code: { Python: code`import heapq
GRID = ['........',
        '...#....',
        'S..#...G',
        '...#....',
        '........']
MOVES = [(-1, 0), (1, 0), (0, -1), (0, 1)]  # 上、下、左、右

def find(ch):
    return next((r, c) for r, row in enumerate(GRID) for c, x in enumerate(row) if x == ch)

def astar(heuristic):
    start, goal = find('S'), find('G')
    h = lambda p: heuristic(p, goal)
    g, closed, counter = {start: 0}, set(), 0
    pq = [(h(start), h(start), counter, start)]
    expanded = 0
    while pq:
        _, _, _, u = heapq.heappop(pq)
        if u in closed:
            continue
        if u == goal:
            return g[u], expanded
        closed.add(u)
        expanded += 1
        for dr, dc in MOVES:
            v = (u[0] + dr, u[1] + dc)
            if 0 <= v[0] < len(GRID) and 0 <= v[1] < len(GRID[0]) and GRID[v[0]][v[1]] != '#':
                if v not in closed and g[u] + 1 < g.get(v, float('inf')):
                    g[v] = g[u] + 1
                    counter += 1
                    heapq.heappush(pq, (g[v] + h(v), h(v), counter, v))
    return None, expanded

manhattan = lambda p, q: abs(p[0] - q[0]) + abs(p[1] - q[1])
zero = lambda p, q: 0
for name, fn in [('manhattan', manhattan), ('zero', zero)]:
    cost, expanded = astar(fn)
    print(f'{name:9} cost={cost} expanded={expanded}')` },
      output: 'manhattan cost=11 expanded=16\nzero      cost=11 expanded=36',
    },
    {
      id: 'e-puzzle', title: '8-puzzle：誤置方塊數與曼哈頓距離',
      description: '三個不同深度的起始狀態（0 是空格，目標是 123456780），分別用兩種由放寬問題得到的啟發函數執行 A*，比較展開數。',
      code: { Python: code`import heapq
GOAL = '123456780'  # 0 是空格；數字 t 的目標位置是索引 t - 1
MOVES = [(-1, 0), (1, 0), (0, -1), (0, 1)]  # 空格往上、下、左、右

def misplaced(s):  # 放寬：方塊可以一步跳到任何位置
    return sum(1 for i, t in enumerate(s) if t != '0' and t != GOAL[i])

def manhattan(s):  # 放寬：方塊可以移到相鄰格，不管那格有沒有方塊
    return sum(abs(i // 3 - (int(t) - 1) // 3) + abs(i % 3 - (int(t) - 1) % 3)
               for i, t in enumerate(s) if t != '0')

def astar(start, h):
    g, closed, counter, expanded = {start: 0}, set(), 0, 0
    pq = [(h(start), h(start), counter, start)]
    while pq:
        _, _, _, s = heapq.heappop(pq)
        if s in closed:
            continue
        if s == GOAL:
            return g[s], expanded
        closed.add(s)
        expanded += 1
        z = s.index('0')
        for dr, dc in MOVES:
            r, c = z // 3 + dr, z % 3 + dc
            if 0 <= r < 3 and 0 <= c < 3:
                t = list(s)
                t[z], t[r * 3 + c] = t[r * 3 + c], '0'
                t = ''.join(t)
                if t not in closed and g[s] + 1 < g.get(t, float('inf')):
                    g[t] = g[s] + 1
                    counter += 1
                    heapq.heappush(pq, (g[t] + h(t), h(t), counter, t))

for start in ['012456738', '013526847', '012673584']:
    d1, n1 = astar(start, misplaced)
    d2, n2 = astar(start, manhattan)
    print(f'{start} d={d1} h1={misplaced(start)} h2={manhattan(start)} misplaced={n1} manhattan={n2}')` },
      output: '012456738 d=10 h1=4 h2=6 misplaced=36 manhattan=13\n013526847 d=14 h1=6 h2=8 misplaced=174 manhattan=52\n012673584 d=18 h1=7 h2=12 misplaced=929 manhattan=163',
    },
    {
      id: 'e-ebf', title: '用二分搜尋求有效分支因子',
      description: '解 N + 1 = 1 + b + … + b^d。先用教科書的 N = 52、d = 5 檢查，再代入上一個範例的展開數。',
      code: { Python: code`def nodes_in_tree(b, d):
    return sum(b ** i for i in range(d + 1))  # 1 + b + b^2 + ... + b^d

def effective_branching(n, d):
    lo, hi = 1.0, float(n)
    for _ in range(60):  # 二分搜尋：找 b 使 nodes_in_tree(b, d) = n + 1
        mid = (lo + hi) / 2
        if nodes_in_tree(mid, d) < n + 1:
            lo = mid
        else:
            hi = mid
    return lo

print(f'check: N=52, d=5 -> b*={effective_branching(52, 5):.2f}')
for d, n1, n2 in [(10, 36, 13), (14, 174, 52), (18, 929, 163)]:
    b1, b2 = effective_branching(n1, d), effective_branching(n2, d)
    print(f'd={d:2} misplaced N={n1:3} b*={b1:.2f} | manhattan N={n2:3} b*={b2:.2f}')` },
      output: 'check: N=52, d=5 -> b*=1.92\nd=10 misplaced N= 36 b*=1.23 | manhattan N= 13 b*=1.05\nd=14 misplaced N=174 b*=1.31 | manhattan N= 52 b*=1.16\nd=18 misplaced N=929 b*=1.36 | manhattan N=163 b*=1.21',
    },
  ],
  exercises: [
    {
      id: 'x-grid-astar', title: '格子地圖上的 A*：曼哈頓距離與零啟發',
      statement: '實作格子地圖上的 A*，並讓使用者選擇啟發函數。地圖的字元：`#` 是牆（不能進入）；`S` 是起點、`G` 是終點，各恰好一個；`.` 是一般地面；數字 `1`–`9` 是地形，進入該格的成本就是那個數字。進入 `.`、`S`、`G` 的成本都是 1。每一步只能往上、下、左、右移到相鄰格，不能走出地圖。啟發函數 `manhattan` 是 h = |r − r_G| + |c − c_G|，`zero` 是 h = 0（每步成本至少 1，所以兩者都一致）。規則必須完全照下面做，展開數才會相同：open 是以 (f, h, counter, 格子) 為元素的最小堆積，f = g + h；起點以 counter 0 放入，之後每放入一筆 counter 加 1。取出一筆紀錄時：格子已在 closed 就略過；是終點就停止；否則放進 closed，展開數加 1，依上、下、左、右的順序看鄰居，若鄰居不是牆、不在 closed，而且 g + 進入成本 < 它目前的 g，就更新 g 與 parent 並放入 open。終點取出時不算展開。',
      inputFormat: '第一行：列數 R、行數 C 與啟發函數名稱（manhattan 或 zero），以空白分隔。接著 R 行，每行恰好 C 個字元。',
      outputFormat: '找得到路：三行 `cost X`（路徑成本）、`length L`（路徑的步數）、`expanded E`（展開數）。找不到路：兩行 `no path` 與 `expanded E`。輸入不合規定（第一行格式、R 或 C 超出範圍、名稱不是 manhattan 或 zero、列數不足、某列長度不是 C、出現其他字元、S 或 G 不是恰好一個）：一行 `invalid input`。',
      constraints: ['1 ≤ R, C ≤ 20', '地形數字 1–9；`.`、`S`、`G` 的進入成本是 1', '只能上下左右移動，鄰居順序固定為上、下、左、右', '同分規則固定為 (f, h, counter)'],
      samples: [
        { kind: 'normal', input: '5 8 manhattan\n........\n...#....\nS..#...G\n...#....\n........\n', output: 'cost 11\nlength 11\nexpanded 16\n', note: '範例：曼哈頓距離把搜尋集中在牆的兩側' },
        { kind: 'normal', input: '5 8 zero\n........\n...#....\nS..#...G\n...#....\n........\n', output: 'cost 11\nlength 11\nexpanded 36\n', note: '同一張地圖改用零啟發：路徑成本相同，展開數變多' },
      ],
      tests: [
        { kind: 'normal', input: '5 10 manhattan\nS...9.....\n.##.9.###.\n....9...#.\n.##.1.#.#.\n....9.#..G\n', output: 'cost 15\nlength 15\nexpanded 25\n', note: '地形成本：要從唯一的 1 穿過 9 組成的牆' },
        { kind: 'normal', input: '5 10 zero\nS...9.....\n.##.9.###.\n....9...#.\n.##.1.#.#.\n....9.#..G\n', output: 'cost 15\nlength 15\nexpanded 34\n', note: '同一張地形圖用零啟發，成本相同、展開較多' },
        { kind: 'normal', input: '3 4 manhattan\nS2.G\n.##.\n....\n', output: 'cost 4\nlength 3\nexpanded 3\n', note: '穿過成本 2 的格子仍比繞路便宜：成本 4、長度 3，兩者不同' },
        { kind: 'normal', input: '4 6 manhattan\nS.....\n.9999.\n.9..9.\n...9.G\n', output: 'cost 8\nlength 8\nexpanded 13\n', note: '終點周圍被 9 半包圍，最便宜的路沿上緣與右緣繞過 9 的區域' },
        { kind: 'edge', input: '1 2 zero\nSG\n', output: 'cost 1\nlength 1\nexpanded 1\n', note: 'S 緊鄰 G：只展開 S 一個節點' },
        { kind: 'edge', input: '2 1 manhattan\nG\nS\n', output: 'cost 1\nlength 1\nexpanded 1\n', note: 'S 在 G 的正下方，只有一條路' },
        { kind: 'edge', input: '1 5 manhattan\nS999G\n', output: 'cost 28\nlength 4\nexpanded 4\n', note: '唯一的路全是成本 9 的地形：成本 28、長度 4' },
        { kind: 'error', input: '3 3 manhattan\nS#.\n##.\n..G\n', output: 'no path\nexpanded 1\n', note: 'S 被牆封住：印出 no path 與展開數' },
        { kind: 'error', input: '3 5 zero\nS.#..\n..#.G\n..#..\n', output: 'no path\nexpanded 6\n', note: '整欄的牆把地圖切成兩半，零啟發展開左半部所有格子後才確定無路' },
        { kind: 'error', input: '2 3 manhattan\nS..\n.G\n', output: 'invalid input\n', note: '第二列只有 2 個字元，與 C = 3 不符' },
        { kind: 'error', input: '2 2 euclid\nSG\n..\n', output: 'invalid input\n', note: '不支援的啟發函數名稱' },
        { kind: 'error', input: '2 3 zero\nS.G\n..G\n', output: 'invalid input\n', note: '有兩個 G' },
        { kind: 'error', input: '2 3 zero\nS.x\n..G\n', output: 'invalid input\n', note: '出現規定以外的字元 x' },
        { kind: 'error', input: '3 3 zero\nS..\n..G\n', output: 'invalid input\n', note: '少了一列' },
        { kind: 'error', input: '0 3 zero\n', output: 'invalid input\n', note: '列數 0 超出範圍' },
      ],
      hints: [
        '先寫 parse：把所有不合規定的情況都回傳 None，主程式只要印 `invalid input`。',
        '格子用 (r, c) tuple 表示，可以直接當 dict 的鍵；heap 元素是 (f, h, counter, (r, c))，counter 不重複，所以不會比到格子。',
        '路徑長度沿 parent 從終點數回起點；路徑成本就是終點的 g，兩者在有地形時不一樣。',
        '用同一張地圖分別跑 manhattan 與 zero：成本必須相同，展開數 manhattan 不會比較多。',
      ],
      solution: { Python: code`import heapq
import sys

def parse(lines):
    head = lines[0].split() if lines else []
    if len(head) != 3 or not head[0].isdigit() or not head[1].isdigit():
        return None
    rows, cols, name = int(head[0]), int(head[1]), head[2]
    grid = [line.rstrip('\r') for line in lines[1:1 + rows]]
    if not (1 <= rows <= 20 and 1 <= cols <= 20) or name not in ('manhattan', 'zero') or len(grid) != rows:
        return None
    if any(len(row) != cols or any(ch not in '.#SG123456789' for ch in row) for row in grid):
        return None
    cells = [(r, c, ch) for r, row in enumerate(grid) for c, ch in enumerate(row)]
    starts = [(r, c) for r, c, ch in cells if ch == 'S']
    goals = [(r, c) for r, c, ch in cells if ch == 'G']
    if len(starts) != 1 or len(goals) != 1:
        return None
    return grid, starts[0], goals[0], name

def astar(grid, start, goal, name):
    def h(p):
        return abs(p[0] - goal[0]) + abs(p[1] - goal[1]) if name == 'manhattan' else 0
    g, parent, closed = {start: 0}, {start: None}, set()
    counter, expanded = 0, 0
    pq = [(h(start), h(start), counter, start)]
    while pq:
        _, _, _, u = heapq.heappop(pq)
        if u in closed:
            continue  # 過期紀錄
        if u == goal:
            length, p = 0, u
            while parent[p] is not None:
                length, p = length + 1, parent[p]
            return g[u], length, expanded
        closed.add(u)
        expanded += 1
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):  # 上、下、左、右
            r, c = u[0] + dr, u[1] + dc
            if 0 <= r < len(grid) and 0 <= c < len(grid[0]) and grid[r][c] != '#' and (r, c) not in closed:
                ch = grid[r][c]
                ng = g[u] + (int(ch) if ch.isdigit() else 1)
                if ng < g.get((r, c), float('inf')):
                    g[(r, c)], parent[(r, c)] = ng, u
                    counter += 1
                    heapq.heappush(pq, (ng + h((r, c)), h((r, c)), counter, (r, c)))
    return None, None, expanded

parsed = parse(sys.stdin.read().split('\n'))
if parsed is None:
    print('invalid input')
else:
    cost, length, expanded = astar(*parsed)
    if cost is None:
        print('no path')
    else:
        print(f'cost {cost}')
        print(f'length {length}')
    print(f'expanded {expanded}')` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'graph-traversal', title: 'A*：open、closed 與 g、h、f', language: 'Python',
    code: code`import heapq
adj = {'S': [('A', 1), ('B', 4)], 'A': [('S', 1), ('C', 2)], 'B': [('S', 4), ('G', 5)],
       'C': [('A', 2), ('D', 1)], 'D': [('C', 1), ('G', 2)], 'G': [('B', 5), ('D', 2)]}
h = {'S': 5, 'A': 4, 'B': 1, 'C': 3, 'D': 2, 'G': 0}
g, parent, closed, counter = {'S': 0}, {'S': None}, set(), 0
open_pq = [(h['S'], h['S'], counter, 'S')]  # (f, h, counter, 節點)
while open_pq:
    f, _, _, u = heapq.heappop(open_pq)
    if u in closed: continue  # 過期紀錄
    if u == 'G': break  # 取出終點才算找到
    closed.add(u)  # 展開 u
    for v, w in adj[u]:
        if v not in closed and g[u] + w < g.get(v, float('inf')):
            g[v], parent[v] = g[u] + w, u
            counter += 1
            heapq.heappush(open_pq, (g[v] + h[v], h[v], counter, v))
path = ['G']
while parent[path[-1]]: path.append(parent[path[-1]])
print(g['G'], '-'.join(reversed(path)), len(closed))`,
    steps: traceSteps,
  },
  quiz: [
    {
      id: 'q-priority', prompt: '貪婪最佳優先搜尋、A*、UCS（Dijkstra）分別用哪個值決定 open 的取出順序？',
      options: ['h(n)、g(n) + h(n)、g(n)', 'g(n)、g(n) + h(n)、h(n)', 'h(n)、h(n)、g(n)', 'g(n) + h(n)、h(n)、g(n)'],
      answer: 0, explanation: '貪婪只看估計的剩餘成本 h；A* 看完整路徑的估計 g + h；UCS 只看已經花的 g，所以第一個選項正確。「g、g + h、h」把貪婪和 UCS 對調了；「h、h、g」把 A* 當成貪婪，少了 g，就會像本課範例一樣走成本 9 的路；「g + h、h、g」把貪婪和 A* 對調了。',
    },
    {
      id: 'q-trace', prompt: '下面的程式在有向圖上執行 A*（同分依 (f, h, counter)），印出什麼？',
      code: { language: 'Python', text: code`import heapq
adj = {'S': [('A', 2), ('B', 1)], 'A': [('G', 2)], 'B': [('A', 2), ('G', 5)], 'G': []}
h = {'S': 3, 'A': 2, 'B': 3, 'G': 0}
g, parent, closed, counter = {'S': 0}, {'S': None}, set(), 0
pq = [(h['S'], h['S'], counter, 'S')]
while pq:
    f, _, _, u = heapq.heappop(pq)
    if u in closed:
        continue
    if u == 'G':
        break
    closed.add(u)
    for v, w in adj[u]:
        if v not in closed and g[u] + w < g.get(v, float('inf')):
            g[v], parent[v] = g[u] + w, u
            counter += 1
            heapq.heappush(pq, (g[v] + h[v], h[v], counter, v))
path = ['G']
while parent[path[-1]]:
    path.append(parent[path[-1]])
print(g['G'], '-'.join(reversed(path)), len(closed))` },
      options: ['4 S-A-G 3', '4 S-A-G 2', '6 S-B-G 2', '5 S-B-A-G 3'],
      answer: 1, explanation: '展開 S：A 的 g = 2、f = 4、h = 2；B 的 g = 1、f = 4、h = 3。f 同分比 h，A 先取出並展開：G 的 g = 4、f = 4。接著取出 (4, 0, 3, G) 是終點，break。closed 只有 S、A，所以印 4 S-A-G 2。「4 S-A-G 3」把終點也算進 closed，或是同分時先取 g 小的 B，多展開一個；「6 S-B-G 2」以為 B → G 那條路最便宜，但 S-A-G 只要 2 + 2 = 4；「5 S-B-A-G 3」的成本是 1 + 2 + 2 = 5，比 S-A-G 貴，A* 不會選它。',
    },
    {
      id: 'q-admissible', prompt: '啟發函數 h 「可接受」（admissible）的定義是哪一個？h*(n) 是從 n 到終點真正的最小成本。',
      options: ['對每條邊 n → n\'，h(n) ≤ c(n, n\') + h(n\')', '對每個 n，h(n) ≥ h*(n)', '對每個 n，h(n) ≤ h*(n)', '只要 h(終點) = 0 就可接受'],
      answer: 2, explanation: '可接受就是從不高估：每個 n 都有 h(n) ≤ h*(n)，這正是 A* 最佳性證明用到的不等式。「h(n) ≤ c(n, n\') + h(n\')」是一致性的定義，它比可接受更強；「h(n) ≥ h*(n)」方向相反，是高估，會讓 A* 失去最佳保證；「h(終點) = 0」只是必要條件，h(A) = 10 的範例就滿足它卻不可接受。',
    },
    {
      id: 'q-consistent', prompt: '有向圖只有兩條邊：S → A 成本 1、A → G 成本 4。h(S) = 4、h(A) = 1、h(G) = 0。這個 h 是？',
      options: ['一致但不可接受', '既可接受又一致', '既不可接受也不一致', '可接受但不一致'],
      answer: 3, explanation: '真正的成本 h*(S) = 5、h*(A) = 4，h(S) = 4 ≤ 5、h(A) = 1 ≤ 4，所以可接受。但邊 S → A 有 h(S) = 4 > c(S, A) + h(A) = 1 + 1 = 2，不一致。「一致但不可接受」不可能發生：一致加上 h(G) = 0 就推得出可接受；「既可接受又一致」忽略了 S → A 的不等式；「既不可接受也不一致」錯在 h 沒有高估任何節點。',
    },
    {
      id: 'q-puzzle', prompt: '8-puzzle 的狀態 012456738（由上到下、由左到右：第一列 _ 1 2、第二列 4 5 6、第三列 7 3 8，_ 是空格），目標是 123456780。誤置方塊數 h1 與曼哈頓距離 h2 是多少？（都不計空格）',
      options: ['h1 = 5、h2 = 10', 'h1 = 4、h2 = 6', 'h1 = 4、h2 = 10', 'h1 = 6、h2 = 4'],
      answer: 1, explanation: '方塊 1、2、3、8 不在目標位置，h1 = 4。距離：1 差 1 格、2 差 1 格、3 從第三列第二格到第一列第三格差 2 + 1 = 3 格、8 差 1 格，h2 = 6。「h1 = 5、h2 = 10」把空格也算進去（空格不在右下角算 1 個、距離 4），會高估，不再可接受；「h1 = 4、h2 = 10」只有 h2 誤算了空格；「h1 = 6、h2 = 4」把兩者對調，而且 h2 不可能比 h1 小。',
    },
    {
      id: 'q-ebf', prompt: 'A* 在深度 d = 5 找到解，總共處理了 N = 52 個節點。有效分支因子 b* 滿足哪一個方程？',
      options: ['52 = (b*)^5', '52 = 5 × b*', '53 = 1 + b* + (b*)² + (b*)³ + (b*)⁴ + (b*)⁵', '53 = b* + (b*)² + (b*)³ + (b*)⁴ + (b*)⁵'],
      answer: 2, explanation: '定義是：深度 d、每層分支 b* 的均勻樹共有 N + 1 個節點，N + 1 = 1 + b* + … + (b*)^d，解出 b* ≈ 1.92。「52 = (b*)^5」只算最底層，漏了上面各層；「52 = 5 × b*」把指數成長當成線性；最後一個選項少了根節點的 1，左邊卻已經加了 1，兩邊不一致。',
    },
    {
      id: 'q-goal-test', prompt: '下面把 A* 改成「產生終點時就回傳」，在本課的圖上（h 可接受且一致）印出什麼？',
      code: { language: 'Python', text: code`import heapq
adj = {'S': [('A', 1), ('B', 4)], 'A': [('S', 1), ('C', 2)], 'B': [('S', 4), ('G', 5)],
       'C': [('A', 2), ('D', 1)], 'D': [('C', 1), ('G', 2)], 'G': [('B', 5), ('D', 2)]}
h = {'S': 5, 'A': 4, 'B': 1, 'C': 3, 'D': 2, 'G': 0}
g, closed, counter = {'S': 0}, set(), 0
pq = [(h['S'], h['S'], counter, 'S')]
while pq:
    f, _, _, u = heapq.heappop(pq)
    if u in closed:
        continue
    closed.add(u)
    for v, w in adj[u]:
        if v not in closed and g[u] + w < g.get(v, float('inf')):
            g[v] = g[u] + w
            if v == 'G':  # 產生 G 就宣告找到
                print(g[v])
                raise SystemExit
            counter += 1
            heapq.heappush(pq, (g[v] + h[v], h[v], counter, v))` },
      options: ['6', '5', '程式沒有輸出', '9'],
      answer: 3, explanation: '展開 S 後 open 有 A 與 B（f 都是 5），同分比 h，先展開 B；B 的鄰居 G 第一次被產生時 g = 4 + 5 = 9，程式立刻印出 9。正確的 A* 要等 G 從 open 取出才停，那時經過 D 的 g = 6 已經放進去，會先被取出。「6」是正確 A* 的答案，這段程式拿不到；「5」是 h(S)，不是任何路徑的成本；「程式沒有輸出」錯在 G 一定會在展開 B 時被產生。',
    },
    {
      id: 'q-dijkstra', prompt: '格子地圖上（每步成本 1）把 A* 的 h 從曼哈頓距離改成 h = 0，下列何者正確？',
      options: ['變成 Dijkstra（UCS）：路徑成本不變，展開的節點通常更多', '變成貪婪最佳優先：展開較少，但路徑可能更貴', '路徑成本與展開數都不變，因為 h = 0 也可接受', '不再保證最佳，因為 h = 0 低估了所有節點'],
      answer: 0, explanation: 'h = 0 時 f = g，A* 就是找到終點就停的 Dijkstra。h = 0 可接受，成本仍最佳；但所有 g < C* 的格子都會展開，範例中是 36 對 16。「變成貪婪」錯：貪婪是 f = h，這裡 f = g；「展開數不變」錯：可接受只保證成本，展開數取決於 h 有多接近 h*；「低估就不最佳」顛倒了，低估正是最佳性需要的條件。',
    },
  ],
};

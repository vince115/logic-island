import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/**
 * The lesson's road map (examples e1 and e3, the exercise's first graph as 0..5, and the visualization): the path with
 * the fewest roads S-B-G costs 10, the cheapest S-A-C-D-G costs 6, so BFS and UCS disagree.
 */
const ROADS: Record<string, Record<string, number>> = {
  S: { A: 1, B: 4 }, A: { S: 1, C: 2, D: 5 }, B: { S: 4, G: 6 }, C: { A: 2, D: 1 }, D: { A: 5, C: 1, G: 2 }, G: { B: 6, D: 2 },
};

/** The visualization's program: BFS as graph search, goal test when a state is generated (lines are referenced below). */
const BFS_CODE = code`from collections import deque
roads = {"S": {"A": 1, "B": 4}, "A": {"S": 1, "C": 2, "D": 5},
         "B": {"S": 4, "G": 6}, "C": {"A": 2, "D": 1},
         "D": {"A": 5, "C": 1, "G": 2}, "G": {"B": 6, "D": 2}}

def bfs(start, goal):
    frontier, parent, order = deque([start]), {start: None}, []
    while frontier:
        s = frontier.popleft()
        order.append(s)
        for t in sorted(roads[s]):
            if t not in parent:
                parent[t] = s
                if t == goal:
                    return parent, order
                frontier.append(t)

parent, order = bfs("S", "G")
path, s = [], "G"
while s is not None:
    path.append(s)
    s = parent[s]
print("path:", " ".join(path[::-1]), "expanded:", len(order))`;

/**
 * Runs the same BFS as BFS_CODE on ROADS (neighbours in sorted order, FIFO frontier, a state is reached once) and makes
 * one step per change: a pop (line 10), a skipped repeated state (line 12), a new search-tree node (line 13), a push
 * (line 16), the goal found (line 15) and the printed result (line 23). The tree is the search tree: each node is a
 * state's first discovery, its parent the state that generated it.
 */
function bfsSteps(start: string, goal: string): TraceStep[] {
  const frontier = [start], order: string[] = [], steps: TraceStep[] = [];
  const parent = new Map<string, string | null>([[start, null]]), kids = new Map<string, string[]>([[start, []]]);
  const g = new Map([[start, 0]]);
  const edges = Object.entries(ROADS).flatMap(([a, out]) => Object.entries(out).filter(([b]) => a < b).map(([b, weight]) => ({ from: a, to: b, weight })));
  const show = (m: Map<string, string | null>) => [...m].map(([k, v]) => `${k}←${v ?? 'None'}`).join(', ');
  const snap = (line: number, note: string, at: { s?: string; t?: string }, focus: Record<string, Mark> = {}, pushed = false, output?: string) => {
    const kind = (id: string): Mark | undefined => focus[id] ?? (frontier.includes(id) ? 'pending' : order.includes(id) ? 'visited' : undefined);
    const marked = (ids: string[]) => ids.flatMap(id => { const k = kind(id); return k ? [{ id, kind: k }] : []; });
    steps.push({
      line, note,
      vars: { ...at.s ? { s: at.s } : {}, ...at.t ? { t: at.t } : {}, order: `[${order.join(', ')}]`, parent: show(parent) },
      tree: { name: '搜尋樹', nodes: [...kids].map(([id, c]) => ({ id, label: id, children: [...c] })), roots: [start], marks: marked([...kids.keys()]) },
      graph: { name: '道路地圖（狀態空間）', nodes: Object.keys(ROADS), edges, directed: false, show: ['list'],
        marks: marked(Object.keys(ROADS)).map(m => ({ node: m.id, kind: m.kind })) },
      containers: [{ name: 'frontier', kind: 'queue', items: [...frontier], ...pushed ? { marks: [{ at: frontier.length - 1, kind: 'write' as const }] } : {} }],
      ...output ? { output } : {},
    });
  };
  snap(7, `邊界（frontier）是一個佇列，先放入初始狀態 ${start}；parent 記錄每個「見過」的狀態是由誰產生的，它同時就是圖搜尋的已探索集合：見過的狀態不會再放進邊界。`, {});
  while (frontier.length) {
    const s = frontier.shift()!;
    order.push(s);
    snap(10, `第 9 行從佇列前端取出 ${s}（g = ${g.get(s)}），第 10 行把它記入 order：這是第 ${order.length} 個被展開的節點。佇列先進先出，所以淺的節點一定比深的先展開。`, { s }, { [s]: 'current' });
    for (const t of Object.keys(ROADS[s]).sort()) {
      if (parent.has(t)) {
        snap(12, `${t} 已經在 parent 裡（${order.includes(t) ? '已經展開過' : '還在邊界裡'}），是重複狀態：圖搜尋直接跳過。樹搜尋沒有這個檢查，會再產生一個 ${t} 節點（${s} → ${t} 又走回頭），來回繞的路徑會越來越多。`, { s, t }, { [s]: 'current', [t]: 'read' });
        continue;
      }
      parent.set(t, s);
      kids.get(s)!.push(t);
      kids.set(t, []);
      g.set(t, g.get(s)! + ROADS[s][t]);
      snap(13, `第一次見到 ${t}：在搜尋樹上把它接成 ${s} 的子節點，parent[${t}] = ${s}。這條路走到 ${t} 的成本是 g = ${g.get(t)}，但 BFS 只看層數，不看成本。`, { s, t }, { [s]: 'current', [t]: 'write' });
      if (t === goal) {
        snap(15, `${t} 就是目標：BFS 在「產生」時就做目標測試，不必等它被取出，因為之後展開的節點都不會比它淺。回傳時邊界裡還有 ${frontier.join('、')}，展開了 ${order.length} 個節點。`, { s, t }, { [s]: 'current', [t]: 'found' });
        const path: string[] = [];
        for (let v: string | null = goal; v !== null; v = parent.get(v)!) path.unshift(v);
        const out = `path: ${path.join(' ')} expanded: ${order.length}`;
        snap(23, `第 19–22 行沿著 parent 從 ${goal} 走回 ${start} 再反轉，得到 ${path.join(' → ')}：只有 ${path.length - 1} 條路，是邊數最少的解，但成本 ${g.get(goal)} 不是最小的；成本最小的 S → A → C → D → G 只要 6，要用 UCS 才找得到。`,
          {}, Object.fromEntries(path.map(v => [v, 'found' as const])), false, out);
        return steps;
      }
      frontier.push(t);
      snap(16, `${t} 不是目標，放到佇列尾端，等同一層的節點都展開完才輪到它。`, { s, t }, { [s]: 'current' }, true);
    }
  }
  return steps;
}

export const AIF04: LessonContent = {
  lessonId: 'AIF04',
  motivation: '導航規劃路線、機器人決定動作順序、解一道滑塊拼圖，都是同一類問題：從一個狀態出發，找出一串動作到達目標。演算法島的 BFS（A14）、DFS（A15）與 Dijkstra（A16）都在一張「已經建好」的圖上執行；AI 的問題通常沒有現成的圖，圖是由問題的定義一步一步產生的，而且大到不可能先建好：八數碼有 181,440 個可達狀態，十五數碼超過 10 兆個。上一課（AIF03）的目標導向代理人在行動之前要先「想好」整串動作，靠的就是這一課的搜尋。學會把問題寫成初始狀態、動作、轉移模型、目標測試與路徑成本，就能把同一套搜尋框架用在任何問題上，再依完備性、最佳性、時間與記憶體挑選 BFS、UCS 或 IDS。',
  sections: [
    {
      id: 'formulation', title: '問題形式化：把問題寫成五個部分',
      blocks: [
        { type: 'p', text: '要讓程式替我們搜尋，先得把問題寫成程式看得懂的形式，這叫問題形式化（problem formulation）。一個搜尋問題由下面幾個部分定義，它們合起來描述了狀態空間（state space）：所有可能狀態，以及狀態之間怎麼移動。' },
        { type: 'table', head: ['部分', '意義', '路線問題', '八數碼'], rows: [
          ['初始狀態（initial state）', '出發時的狀態', '城鎮 S', '題目給的盤面'],
          ['動作 ACTIONS(s)', '在狀態 s 可以做的動作', '開往一個相鄰的城鎮', '空格往上、下、左、右移（靠邊時較少）'],
          ['轉移模型 RESULT(s, a)', '在 s 做動作 a 之後到達的狀態', '抵達那個城鎮', '空格和那一格的方塊交換'],
          ['目標測試 IS-GOAL(s)', '判斷 s 是不是目標', 's 是 G', '盤面是 1 2 3 / 4 5 6 / 7 8 空'],
          ['路徑成本（path cost）', '每一步的動作成本 c(s, a, s′) 加總', '道路長度的總和', '每步 1，成本就是步數'],
        ] },
        { type: 'p', text: '解（solution）是從初始狀態到某個目標狀態的動作序列；最佳解（optimal solution）是路徑成本最小的解。初始狀態、動作與轉移模型合起來，隱含地定義了一張圖：狀態是頂點，動作是邊。和 A14–A16 不同的是，這張圖通常不會先建出來，搜尋時才用 ACTIONS 與 RESULT 一個一個產生鄰居。下面的 `Problem` 類別就是這個介面：通用的搜尋程式只呼叫這五個方法，換一個問題只要換一個子類別。' },
        { type: 'example', id: 'route-problem' },
        { type: 'p', text: '`RouteProblem` 只覆寫三個方法：`actions` 回傳排序過的相鄰城鎮，讓搜尋的順序固定；`result` 是轉移模型，開往 a 就抵達 a；`action_cost` 是道路長度。最後的迴圈照著動作 A、C、D、G 走一遍，路徑成本累積成 6，目標測試為真。狀態要能當作 dict 的鍵、放進 set（可雜湊、不可變），所以路線問題用城鎮名稱的字串，八數碼用 tuple 而不是 list。' },
        { type: 'callout', tone: 'tip', title: '抽象化：只留下和決策有關的細節', text: '路線問題的狀態只記「在哪個城鎮」，不記油量、天氣、車上的音樂；八數碼不記方塊滑到一半的位置。去掉細節叫抽象化（abstraction）。抽象得好，狀態空間小、搜尋快；抽象過頭（例如路線問題忘了單行道），找到的解在真實世界裡做不到。檢查方法：抽象解的每一步，都要對應到真實世界裡做得到的一串動作。' },
      ],
    },
    {
      id: 'framework', title: '搜尋框架：節點、邊界，樹搜尋與圖搜尋',
      blocks: [
        { type: 'p', text: '搜尋時在記憶體裡長出一棵搜尋樹（search tree）。樹上的節點（node）不等於狀態：節點記錄狀態、父節點、到達它的動作、路徑成本 g(n) 與深度；同一個狀態可以由不同路徑到達，就會出現在好幾個節點上。展開（expand）一個節點，是用 ACTIONS 與 RESULT 產生（generate）它所有的子節點。已產生、還沒展開的節點集合叫邊界（frontier）。所有搜尋演算法都是同一個迴圈：' },
        { type: 'list', ordered: true, items: [
          '把初始狀態的節點放進邊界。',
          '邊界空了就回報失敗。',
          '依照策略從邊界取出一個節點 n。',
          '如果 n 的狀態通過目標測試，沿著父節點回傳路徑。',
          '展開 n，把子節點放進邊界，回到第 2 步。',
        ] },
        { type: 'p', text: '無資訊搜尋（uninformed search，也叫盲目搜尋）除了問題定義以外什麼都不知道，無法判斷哪個狀態「比較接近」目標。各種演算法只差在第 3 步取出哪一個：' },
        { type: 'table', head: ['演算法', '邊界的資料結構', '先取出', '演算法島對照'], rows: [
          ['BFS（廣度優先）', '佇列（FIFO）', '最早放入的，也就是最淺的', 'A14'],
          ['DFS（深度優先）', '堆疊（LIFO）或遞迴', '最晚放入的，也就是最深的', 'A15'],
          ['UCS（一致代價搜尋）', '優先佇列（heapq）', '路徑成本 g(n) 最小的', 'A16 的 Dijkstra'],
          ['DLS／IDS', '堆疊加上深度上限', '最深的，但不超過上限', '本課新內容'],
        ] },
        { type: 'p', text: '樹搜尋（tree search）照著上面的迴圈做，完全不記得看過哪些狀態。狀態空間有環時（路線可以來回開，八數碼可以把空格移回去），搜尋樹是無限的。圖搜尋（graph search）多記一個已探索集合（explored set），重複狀態不再放進邊界。常見的寫法把「見過的狀態」都記下來，包括還在邊界裡的，AIMA 第 4 版稱為 reached。下面在 n × n 的空地上，從左上角走到右下角，比較兩者展開的節點數：' },
        { type: 'example', id: 'tree-vs-graph' },
        { type: 'p', text: '兩者都找到最短的路（向下、向右各 n − 1 步），但樹搜尋把「先右再左」這類繞回原地的路徑也展開了。5 × 5 只有 25 個狀態，圖搜尋展開 23 個，樹搜尋卻展開 1317 個節點，而且每大一圈就多出好幾倍。代價是 reached 集合要存下每個見過的狀態。' },
        { type: 'callout', tone: 'warning', title: '「圖搜尋一定比較好，所以永遠要用已探索集合」', text: '已探索集合的大小和見過的狀態數一樣，BFS 與 UCS 反正要把整層邊界放在記憶體裡，多記這個集合不吃虧。但 DFS 與 IDS 的賣點是只用 O(bm) 或 O(bd) 的記憶體，加上一個存下所有狀態的集合，就失去了這個優點。所以 DFS 與 IDS 常只檢查目前路徑上的狀態（避免繞圈），接受同一個狀態從不同路徑被重複展開。選哪一種，看記憶體夠不夠、重複路徑多不多。' },
      ],
    },
    {
      id: 'bfs-ucs', title: 'BFS 與一致代價搜尋（UCS）',
      blocks: [
        { type: 'p', text: 'BFS 的細節在 A14 學過：佇列先進先出，一層一層展開，第一次找到目標時用的邊數最少。放進框架之後多一個選擇：目標測試可以提早到「產生」子節點的時候（early goal test），因為之後展開的節點都不會更淺，這樣可以少展開整整一層。BFS 的最少邊數只有在每一步成本都相同時才等於最小成本。' },
        { type: 'p', text: '一致代價搜尋（uniform-cost search，UCS）把邊界換成以 g(n) 排序的優先佇列，每次取出目前路徑成本最小的節點。它和 A16 的 Dijkstra 是同一個想法：每次確定一個目前最近的點。差別在用法：Dijkstra 通常在整張已知的圖上算出起點到每個點的最短距離；UCS 找到目標就停，鄰居是搜尋時才產生的，所以也能用在隱含、甚至無限大的狀態空間。' },
        { type: 'p', text: 'Python 用 `heapq` 實作優先佇列，有兩個細節要寫清楚。第一，平手規則（tie-breaking）：放入 `(g, counter, state)`，counter 每放入一筆就加 1，成本相同時先放入的先取出。少了 counter，成本相同時會比較 state 本身，結果取決於狀態的表示法，狀態若是不能比較大小的物件還會丟出 `TypeError`。第二，`heapq` 不能修改已放入的成本，找到更便宜的路就再放一筆，取出時遇到 `g > best[s]` 的過期紀錄就跳過，和 A16 相同。' },
        { type: 'example', id: 'bfs-vs-ucs' },
        { type: 'p', text: 'BFS 展開 S、A、B，在展開 B 時產生 G 就停下：S → B → G 只有兩條路，成本卻是 10。UCS 依成本取出 S(0)、A(1)、C(3)，接著 B 與 D 的成本都是 4：B 在展開 S 時放入，序號 k 是 2；D 先在展開 A 時以成本 6 放入（序號 4），經由 C 改善成 4 時再放入一筆（序號 5），所以 B 先出來，D 那筆成本 6 的舊紀錄之後取出時會被當成過期而跳過。最後取出 G 時 g = 6，路徑 S → A → C → D → G。兩者的差別正是「最少的邊」與「最小的成本」。下方的視覺化一步一步追蹤 BFS 在這張地圖上長出的搜尋樹與佇列。' },
        { type: 'callout', tone: 'warning', title: 'UCS 不能在產生時就做目標測試', text: '把 BFS 的提早目標測試搬到 UCS 是常見的錯誤。在上面的地圖上，展開 B 時就產生了 G（g = 10），如果這時回傳，答案是成本 10 的 S → B → G；但當時邊界裡還有 g = 4 的 D，經過 D 到 G 只要 6。只有在 G 被「取出」時，它的 g 才保證是最小的：優先佇列裡其他節點的成本都不比它小，成本又不會是負的。BFS 可以提早，是因為每步成本相同，層數就是成本。' },
      ],
    },
    {
      id: 'dfs-ids', title: 'DFS、深度限制搜尋與迭代加深搜尋（IDS）',
      blocks: [
        { type: 'p', text: 'DFS（A15）用堆疊，一路往深處走，只需要記住目前這條路徑和路上每個節點還沒試的兄弟，記憶體是 O(bm)，m 是最大深度。缺點是：狀態空間無限深或有環時，樹搜尋的 DFS 可能一路走下去永遠不回頭；找到的解也不一定最淺、更不一定最便宜。' },
        { type: 'p', text: '深度限制搜尋（depth-limited search，DLS）給 DFS 一個深度上限 ℓ：深度到 ℓ 的節點不再展開。它有兩種「沒找到」：cutoff 表示有節點因為上限而沒展開，上限加大也許找得到；failure 表示整個空間都看完了，真的沒有解。ℓ 比最淺解的深度 d 小時，DLS 一定找不到。' },
        { type: 'p', text: '迭代加深搜尋（iterative deepening search，IDS）依序用 ℓ = 0、1、2…… 執行 DLS，直到找到解或回報 failure。它像 BFS 一樣一層一層加深，所以會先找到最淺的解；又像 DFS 一樣只記一條路徑，記憶體 O(bd)。下面的程式在一棵樹上執行 IDS，印出每一輪拜訪的順序：' },
        { type: 'example', id: 'ids-tree' },
        { type: 'p', text: '找 J 時，前三輪都回報 cutoff，第 4 輪（ℓ = 3）在 A → B → E → J 找到，四輪共拜訪 18 個節點；BFS 依 A B C D E F G H I J 的順序只要 10 個。找不存在的 Z 時，ℓ = 3 那一輪碰到的最深節點都是葉子，沒有任何節點因上限而被切掉，所以回報 failure 而不是無限加深下去。本課的 DLS 比教科書的寫法多一個細節：深度用完的節點只有還有孩子時才算 cutoff，AIMA 第 3 版的遞迴版本只要到達上限就回報 cutoff，在有限的樹上會多跑一輪才停。' },
        { type: 'p', text: '重做前面幾層看起來浪費，其實不多。分支因子 b 時，最底層的節點數比上面所有層加起來還多，而最底層只產生一次。b = 10、d = 5 時：' },
        { type: 'table', head: ['深度', '該層節點數', 'IDS 產生幾次', 'IDS 小計'], rows: [
          ['1', '10', '5', '50'],
          ['2', '100', '4', '400'],
          ['3', '1,000', '3', '3,000'],
          ['4', '10,000', '2', '20,000'],
          ['5', '100,000', '1', '100,000'],
          ['合計', '111,110（BFS）', '', '123,450（IDS）'],
        ] },
        { type: 'p', text: 'IDS 只比 BFS 多產生約 11% 的節點，記憶體卻從 O(b^d) 降到 O(bd)。這也是為什麼搜尋空間大、解的深度未知時，IDS 是無資訊搜尋的首選。' },
        { type: 'callout', tone: 'warning', title: 'IDS 的重複成本只在「像樹」的空間才小', text: '上面 11% 的計算假設每個狀態只有一條路徑可以到達。八數碼、格子地圖這類空間有很多條路通往同一個狀態，IDS 只檢查目前路徑、不記已探索集合，每條路徑都會重新展開一次：最後一節的八數碼裡，8 步的解 BFS 展開 146 個節點，IDS 展開 340 個。重複路徑很多、記憶體又夠時，圖搜尋版本的 BFS 或 UCS 比較快。' },
      ],
    },
    {
      id: 'compare', title: '完備性、最佳性與複雜度：b、d 與指數成長',
      blocks: [
        { type: 'p', text: '比較搜尋演算法用四個準則：完備性（completeness），有解時一定找得到；最佳性（optimality），找到的是路徑成本最小的解；時間複雜度，產生的節點數；空間複雜度，同時要放在記憶體裡的節點數。複雜度用下列參數表示：分支因子（branching factor）b 是一個節點最多幾個子節點；d 是最淺解的深度；m 是狀態空間的最大深度（可能無限）；ℓ 是深度上限；C* 是最佳解的成本；ε 是最小的單步成本。' },
        { type: 'table', head: ['準則', 'BFS', 'UCS', 'DFS', 'DLS', 'IDS'], rows: [
          ['完備', '是（b 有限）', '是（b 有限且每步成本 ≥ ε > 0）', '樹搜尋否；有限空間的圖搜尋是', 'ℓ < d 時否', '是（b 有限）'],
          ['最佳', '每步成本相同時是', '是', '否', '否', '每步成本相同時是'],
          ['時間', 'O(b^d)', 'O(b^(1 + ⌊C*/ε⌋))', 'O(b^m)', 'O(b^ℓ)', 'O(b^d)'],
          ['空間', 'O(b^d)', 'O(b^(1 + ⌊C*/ε⌋))', 'O(bm)', 'O(bℓ)', 'O(bd)'],
        ] },
        { type: 'p', text: 'UCS 的界線來自：最佳解的成本是 C*，每步至少 ε，所以 UCS 最多走到約 C*/ε 層深。若每步成本都相同，它就是 O(b^(d + 1))，比提早測試的 BFS 多一層。如果允許成本為 0 的動作，UCS 可能在一圈成本 0 的環上永遠繞下去，所以完備性需要 ε > 0。' },
        { type: 'p', text: 'O(b^d) 的指數成長是無資訊搜尋最大的限制。假設每秒產生一百萬個節點、每個節點占 1 KB：b = 10、d = 10 時約有 1.1 × 10^10 個節點，BFS 要跑約 3 小時，而且要約 11 TB 的記憶體存邊界。時間還能等，記憶體先不夠，這正是 IDS 只用 O(bd) 記憶體的價值。d 再加 2，節點數就再乘 100。' },
        { type: 'callout', tone: 'note', title: '每步成本都相同時，UCS 和 BFS 的差別', text: '兩者找到的解一樣長，都是最佳解。但 UCS 要等目標被取出才停，會把成本小於 d 的節點全部展開，還可能展開一些成本等於 d 的節點；提早測試的 BFS 在展開第 d − 1 層的途中產生目標就停。所以在成本都相同的問題上，UCS 展開的節點較多，沒有好處。' },
      ],
    },
    {
      id: 'puzzle-framework', title: '八數碼：用同一個框架切換 BFS、UCS 與 IDS',
      blocks: [
        { type: 'p', text: '八數碼（8-puzzle）是 3 × 3 的盤面上 8 個數字方塊和一個空格，每次把空格旁的方塊滑進空格，目標是排成 1 2 3 / 4 5 6 / 7 8 空。形式化：狀態是 9 格的 tuple，0 代表空格；動作是空格往 U、D、L、R 移動，依這個固定順序產生；轉移模型是交換空格與鄰格；目標測試是等於 `(1, 2, 3, 4, 5, 6, 7, 8, 0)`；每步成本 1。空格在角落有 2 個動作，在邊上 3 個，在中央 4 個，平均分支因子 24 / 9 ≈ 2.67。' },
        { type: 'p', text: '9 格共有 9! = 362,880 種排列，但每次滑動都不改變「數字方塊的逆序數是奇是偶」（3 × 3 這種寬度為奇數的盤面），所以只有一半，181,440 個狀態，能到達目標，另一半無解。最難的盤面需要 31 步，所以下面 IDS 的上限只要試到 31。' },
        { type: 'example', id: 'eight-puzzle' },
        { type: 'p', text: '三個演算法共用 `successors`（動作加上轉移模型）與 `GOAL`，只換搜尋策略，用 `ALGORITHMS` 這個 dict 依名稱切換。三者在每個盤面找到的步數都一樣，因為每步成本相同時三者都是最佳的；展開的節點數卻不同：8 步的盤面，BFS 展開 146 個，UCS 因為取出時才測試而展開 255 個，IDS 因為一輪一輪重做、又只檢查目前路徑而展開 340 個。解再深一點，三者的差距與指數成長都會更明顯。' },
        { type: 'table', head: ['情況', '選擇', '理由'], rows: [
          ['每步成本相同、記憶體足夠', 'BFS', '最佳，提早目標測試，展開最少'],
          ['每步成本不同', 'UCS', '唯一保證最小成本的無資訊搜尋'],
          ['每步成本相同、記憶體很緊、深度未知', 'IDS', '最佳且只要 O(bd) 記憶體'],
          ['只要任何一個解、解很多又很深', 'DFS（加深度上限）', '記憶體最省，可能很快碰到解'],
        ] },
        { type: 'callout', tone: 'tip', title: '下一步：有資訊的搜尋', text: '這一課的演算法都不知道目標在哪個方向。下一課的 A*（AIF05）沿用同一個框架與 UCS 的優先佇列，只把排序鍵從 g(n) 改成 g(n) + h(n)，h(n) 是估計還要走多遠的啟發函數（heuristic），例如八數碼每個方塊離目標位置的曼哈頓距離總和。' },
      ],
    },
  ],
  examples: [
    {
      id: 'route-problem', title: '通用 Problem 類別與路線問題',
      description: '把路線問題寫成初始狀態、動作、轉移模型、目標測試與路徑成本，並手動照一串動作走一次。',
      code: { Python: code`class Problem:
    """通用搜尋問題：初始狀態、動作、轉移模型、目標測試、路徑成本。"""
    def __init__(self, initial, goal):
        self.initial, self.goal = initial, goal
    def actions(self, s):
        raise NotImplementedError
    def result(self, s, a):
        raise NotImplementedError
    def is_goal(self, s):
        return s == self.goal
    def action_cost(self, s, a, t):
        return 1

class RouteProblem(Problem):
    def __init__(self, initial, goal, roads):
        super().__init__(initial, goal)
        self.roads = roads
    def actions(self, s):                 # 動作：開往某個相鄰城鎮
        return sorted(self.roads[s])
    def result(self, s, a):               # 轉移模型：開往 a 就抵達 a
        return a
    def action_cost(self, s, a, t):       # 單步成本：道路長度
        return self.roads[s][a]

roads = {"S": {"A": 1, "B": 4}, "A": {"S": 1, "C": 2, "D": 5},
         "B": {"S": 4, "G": 6}, "C": {"A": 2, "D": 1},
         "D": {"A": 5, "C": 1, "G": 2}, "G": {"B": 6, "D": 2}}
p = RouteProblem("S", "G", roads)
print("state space:", " ".join(sorted(roads)))
print("initial:", p.initial, "actions:", p.actions(p.initial))
s, cost = p.initial, 0
for a in ["A", "C", "D", "G"]:
    t = p.result(s, a)
    cost += p.action_cost(s, a, t)
    print(f"{s} --{a}--> {t}  g = {cost}")
    s = t
print("goal reached:", p.is_goal(s), "path cost:", cost)` },
      output: `state space: A B C D G S
initial: S actions: ['A', 'B']
S --A--> A  g = 1
A --C--> C  g = 3
C --D--> D  g = 4
D --G--> G  g = 6
goal reached: True path cost: 6`,
    },
    {
      id: 'tree-vs-graph', title: '樹搜尋與圖搜尋：格子上的重複狀態',
      description: '同一個 BFS，在 n × n 空地上開或關已探索集合（reached），比較展開的節點數。',
      code: { Python: code`from collections import deque

MOVES = [("U", -1, 0), ("D", 1, 0), ("L", 0, -1), ("R", 0, 1)]

def successors(s, n):
    r, c = s
    for name, dr, dc in MOVES:              # 固定的動作順序：上、下、左、右
        if 0 <= r + dr < n and 0 <= c + dc < n:
            yield name, (r + dr, c + dc)

def bfs(n, graph_search):
    start, goal = (0, 0), (n - 1, n - 1)    # n × n 的空地，左上走到右下
    frontier = deque([(start, "")])
    reached = {start}
    expanded = 0
    while frontier:
        s, path = frontier.popleft()
        expanded += 1
        for name, t in successors(s, n):
            if graph_search:
                if t in reached:
                    continue                # 圖搜尋：見過的狀態不再放進邊界
                reached.add(t)
            if t == goal:
                return path + name, expanded
            frontier.append((t, path + name))
    return None, expanded

for n in (3, 4, 5):
    tree_path, tree_expanded = bfs(n, False)
    graph_path, graph_expanded = bfs(n, True)
    print(f"{n}x{n}: tree search {tree_path} expanded {tree_expanded:4d} | "
          f"graph search {graph_path} expanded {graph_expanded:2d}")` },
      output: `3x3: tree search DDRR expanded   13 | graph search DDRR expanded  7
4x4: tree search DDDRRR expanded  118 | graph search DDDRRR expanded 14
5x5: tree search DDDDRRRR expanded 1317 | graph search DDDDRRRR expanded 23`,
    },
    {
      id: 'bfs-vs-ucs', title: 'BFS 與 UCS：最少的邊與最小的成本',
      description: '在加權的道路地圖上比較 BFS 與 UCS 的路徑、成本、展開順序與展開數；UCS 以 (成本, 放入序號, 狀態) 打破平手。',
      code: { Python: code`import heapq
from collections import deque

roads = {"S": {"A": 1, "B": 4}, "A": {"S": 1, "C": 2, "D": 5},
         "B": {"S": 4, "G": 6}, "C": {"A": 2, "D": 1},
         "D": {"A": 5, "C": 1, "G": 2}, "G": {"B": 6, "D": 2}}

def walk(parent, s):
    path = []
    while s is not None:
        path.append(s)
        s = parent[s]
    return path[::-1]

def bfs(start, goal):                       # 產生時就做目標測試
    frontier, parent, order = deque([start]), {start: None}, []
    while frontier:
        s = frontier.popleft()
        order.append(s)
        for t in sorted(roads[s]):
            if t not in parent:
                parent[t] = s
                if t == goal:
                    return walk(parent, t), order
                frontier.append(t)

def ucs(start, goal):                       # 取出時才做目標測試
    frontier, g, parent, order, k = [(0, 0, start)], {start: 0}, {start: None}, [], 1
    while frontier:
        cost, _, s = heapq.heappop(frontier)  # 同成本時序號 k 小（先放入）的先出
        if s == goal:
            return walk(parent, s), order
        if cost > g[s]:
            continue                        # 過期的紀錄：s 已用更低的成本取出過
        order.append(s)
        for t in sorted(roads[s]):
            if cost + roads[s][t] < g.get(t, float("inf")):
                g[t], parent[t] = cost + roads[s][t], s
                heapq.heappush(frontier, (g[t], k, t))
                k += 1

for name, search in (("BFS", bfs), ("UCS", ucs)):
    path, order = search("S", "G")
    cost = sum(roads[a][b] for a, b in zip(path, path[1:]))
    print(f"{name}: path {' '.join(path)}, cost {cost}, "
          f"expanded {len(order)}: {' '.join(order)}")` },
      output: `BFS: path S B G, cost 10, expanded 3: S A B
UCS: path S A C D G, cost 6, expanded 5: S A C B D`,
    },
    {
      id: 'ids-tree', title: '迭代加深搜尋：每一輪的拜訪順序',
      description: '在一棵樹上依 ℓ = 0、1、2…… 執行深度限制搜尋，區分 cutoff 與 failure。',
      code: { Python: code`tree = {"A": ["B", "C"], "B": ["D", "E"], "C": ["F", "G"],
        "D": ["H", "I"], "E": ["J"], "F": [], "G": ["K"],
        "H": [], "I": [], "J": [], "K": []}

def dls(s, goal, limit, seen):
    """回傳路徑（找到）、"cutoff"（因深度限制而停）或 None（真的沒有）。"""
    seen.append(s)
    if s == goal:
        return [s]
    if limit == 0:
        return "cutoff" if tree[s] else None
    cut = False
    for child in tree[s]:                   # 孩子依固定順序（由左到右）
        r = dls(child, goal, limit - 1, seen)
        if r == "cutoff":
            cut = True
        elif r is not None:
            return [s] + r
    return "cutoff" if cut else None

def ids(goal):
    total, limit = 0, 0
    while True:
        seen = []
        r = dls("A", goal, limit, seen)
        total += len(seen)
        print(f"  limit {limit}: {' '.join(seen)}")
        if r != "cutoff":
            return r, total
        limit += 1

for goal in ("J", "Z"):
    print(f"goal {goal}")
    path, total = ids(goal)
    print("  result:", " ".join(path) if path else "failure", "| nodes visited:", total)` },
      output: `goal J
  limit 0: A
  limit 1: A B C
  limit 2: A B D E C F G
  limit 3: A B D H I E J
  result: A B E J | nodes visited: 18
goal Z
  limit 0: A
  limit 1: A B C
  limit 2: A B D E C F G
  limit 3: A B D H I E J C F G K
  result: failure | nodes visited: 22`,
    },
    {
      id: 'eight-puzzle', title: '八數碼：同一個問題，三種搜尋',
      description: '狀態是 tuple，動作依 U、D、L、R 的固定順序；以名稱切換 BFS、UCS 與 IDS，比較展開的節點數。',
      code: { Python: code`import heapq
from collections import deque

GOAL = (1, 2, 3, 4, 5, 6, 7, 8, 0)                # 狀態：9 格的 tuple，0 是空格

def successors(s):                                # 動作依 U、D、L、R 的固定順序
    i = s.index(0)
    for a, d, ok in (("U", -3, i >= 3), ("D", 3, i < 6), ("L", -1, i % 3 > 0), ("R", 1, i % 3 < 2)):
        if ok:
            b = list(s)
            b[i], b[i + d] = b[i + d], b[i]       # 轉移模型：空格和鄰格交換
            yield a, tuple(b)

def bfs(start):                                   # 產生時做目標測試
    frontier, reached, n = deque([(start, "")]), {start}, 0
    while frontier:
        s, path = frontier.popleft()
        n += 1
        for a, t in successors(s):
            if t not in reached:
                reached.add(t)
                if t == GOAL:
                    return path + a, n
                frontier.append((t, path + a))

def ucs(start):                                   # 取出時做目標測試，每步成本 1
    frontier, best, n, k = [(0, 0, start, "")], {start: 0}, 0, 1
    while frontier:
        g, _, s, path = heapq.heappop(frontier)   # (成本, 放入序號, 狀態, 路徑)
        if s == GOAL:
            return path, n
        if g > best[s]:
            continue
        n += 1
        for a, t in successors(s):
            if g + 1 < best.get(t, float("inf")):
                best[t] = g + 1
                heapq.heappush(frontier, (g + 1, k, t, path + a))
                k += 1

def ids(start):
    n = 0
    def dls(s, path, limit, on_path):
        nonlocal n
        if s == GOAL:
            return path
        if limit == 0:
            return None
        n += 1
        for a, t in successors(s):
            if t not in on_path:                  # 只避免繞回目前路徑上的狀態
                found = dls(t, path + a, limit - 1, on_path | {t})
                if found is not None:
                    return found
        return None
    for limit in range(32):                       # 八數碼的最佳解最多 31 步
        found = dls(start, "", limit, {start})
        if found is not None:
            return found, n

ALGORITHMS = {"BFS": bfs, "UCS": ucs, "IDS": ids}
for start in [(0, 1, 3, 4, 2, 5, 7, 8, 6), (0, 1, 2, 4, 6, 3, 7, 5, 8), (0, 1, 2, 4, 8, 3, 7, 6, 5)]:
    print("start", "".join(map(str, start)))
    for name, search in ALGORITHMS.items():
        path, n = search(start)
        print(f"  {name}: {path:<8} {len(path)} moves, expanded {n:3d}")` },
      output: `start 013425786
  BFS: RDRD     4 moves, expanded  14
  UCS: RDRD     4 moves, expanded  28
  IDS: RDRD     4 moves, expanded  24
start 012463758
  BFS: RRDLDR   6 moves, expanded  50
  UCS: RRDLDR   6 moves, expanded  87
  IDS: RRDLDR   6 moves, expanded 107
start 012483765
  BFS: RRDDLURD 8 moves, expanded 146
  UCS: RRDDLURD 8 moves, expanded 255
  IDS: RRDDLURD 8 moves, expanded 340`,
    },
  ],
  visualization: {
    kind: 'tree-traversal', title: 'BFS 的搜尋樹：在道路地圖上從 S 找 G', language: 'Python',
    code: BFS_CODE,
    steps: bfsSteps('S', 'G'),
  },
  quiz: [
    {
      id: 'q-formulation', prompt: '在八數碼的形式化裡，「空格在左上角時，只能往 D 或 R 移動」屬於哪一個部分？',
      options: ['轉移模型 RESULT(s, a)', '動作 ACTIONS(s)', '目標測試 IS-GOAL(s)', '路徑成本'],
      answer: 1, explanation: 'ACTIONS(s) 回答「在狀態 s 可以做哪些動作」，空格在角落只有 D、R 兩個合法動作，正是它的內容。轉移模型回答的是「做了動作之後變成哪個狀態」（空格和鄰格交換）；目標測試只判斷盤面是不是 1 2 3 / 4 5 6 / 7 8 空；路徑成本是每步成本 1 的加總，三者都不決定哪些動作合法。',
    },
    {
      id: 'q-graph-search', prompt: '下列關於樹搜尋與圖搜尋的敘述，哪一個正確？',
      options: ['圖搜尋只能用在已經用鄰接串列建好的圖上', '樹搜尋只能用在狀態空間本身是一棵樹的問題', '圖搜尋一定比樹搜尋省記憶體', '狀態空間有環時，樹搜尋的搜尋樹可能是無限的；圖搜尋用已探索集合避免重複狀態'],
      answer: 3, explanation: '樹搜尋不記得看過的狀態，可以來回走的空間（路線、八數碼）會讓搜尋樹無限長；圖搜尋把見過的狀態記下來，不再放進邊界。「只能用在建好的圖上」錯：兩者都是邊搜邊用 ACTIONS 與 RESULT 產生鄰居。樹搜尋也能用在有環的空間（例如 IDS 只檢查目前路徑），只是會重複展開。圖搜尋要存每個見過的狀態，反而可能比 DFS 式的樹搜尋更吃記憶體。',
    },
    {
      id: 'q-ucs-order', prompt: '下面的 UCS 依序印出被展開的狀態。輸出是什麼？',
      code: { language: 'Python', text: code`import heapq

roads = {"P": {"R": 1, "Z": 2}, "R": {"B": 1}, "Z": {"B": 1}, "B": {}}
frontier, best, k = [(0, 0, "P")], {"P": 0}, 1
while frontier:
    g, _, s = heapq.heappop(frontier)
    if g > best[s]:
        continue
    print(s, end=" ")
    for t in sorted(roads[s]):
        if g + roads[s][t] < best.get(t, float("inf")):
            best[t] = g + roads[s][t]
            heapq.heappush(frontier, (best[t], k, t))
            k += 1
print()` },
      options: ['P R Z B', 'P R B Z', 'P Z R B', 'P R Z B B'],
      answer: 0, explanation: '取出 P(0)，依序放入 R(1, 序號 1)、Z(2, 序號 2)。取出 R(1)，放入 B(2, 序號 3)。此時 Z 與 B 的成本都是 2，比較第二個欄位：Z 的序號 2 比 B 的 3 小，先取出 Z；經 Z 到 B 是 3，不比 2 小，不再放入。最後取出 B。所以是 P R Z B。「P R B Z」是平手時比較狀態名稱（B < Z）的結果，這段程式有序號，不會走到名稱；「P Z R B」忽略了成本，R 的 1 比 Z 的 2 小；B 只被放入一次，不會印兩次。',
    },
    {
      id: 'q-early-goal', prompt: '在本課的道路地圖（S–A 1、S–B 4、A–C 2、A–D 5、B–G 6、C–D 1、D–G 2）上，有人把 UCS 改成「產生子節點時就做目標測試」，其餘不變（平手依放入順序）。它回傳哪一條路徑？',
      options: ['S → A → C → D → G，成本 6', 'S → A → D → G，成本 8', 'S → B → G，成本 10', '找不到路徑'],
      answer: 2, explanation: '依成本取出 S(0)、A(1)、C(3)，接著 B 與 D 都是 4，B 先放入所以先取出；展開 B 時產生 G（g = 10），提早測試就在這裡回傳 S → B → G，成本 10。正確的 UCS 要等 G 被取出，那時經 D 的 G 已經改善成 6，答案才是 S → A → C → D → G。S → A → D → G 的 D 是由 A 產生的成本 6，但 D 已經在展開 C 時改善成 4，而且在 D 被展開前就回傳了；「找不到」也不對，G 明明被產生了。',
    },
    {
      id: 'q-ids-count', prompt: '分支因子 b = 10、最淺解深度 d = 5，最壞情況下 BFS 產生 10 + 100 + 1,000 + 10,000 + 100,000 = 111,110 個節點。IDS 產生多少個？',
      options: ['555,550：每一層都重做 5 次', '123,450', '111,110：和 BFS 完全一樣', '1,111,110：多搜一層'],
      answer: 1, explanation: 'IDS 第 k 層的節點在 ℓ = k、k + 1、…、d 的每一輪都會產生，共 d − k + 1 次：5 × 10 + 4 × 100 + 3 × 1,000 + 2 × 10,000 + 1 × 100,000 = 123,450，只多約 11%。只有第 1 層被產生 5 次，最底層只產生一次，所以不是 555,550；IDS 確實有重做，所以不會和 BFS 一樣；多搜一層的 1,111,110 是取出時才測試的 UCS 在成本都相同時的量級，不是 IDS。',
    },
    {
      id: 'q-choose', prompt: '每步成本都相同，解的深度未知，而且記憶體只放得下幾千個節點。該選哪一種無資訊搜尋？',
      options: ['BFS', 'DFS', 'IDS', 'UCS'],
      answer: 2, explanation: 'IDS 每步成本相同時是完備且最佳的，記憶體只要 O(bd)。BFS 與 UCS 也最佳，但邊界要放 O(b^d) 個節點，記憶體先不夠；DFS 記憶體省，但不保證找到最淺的解，深度無限時甚至可能找不到。',
    },
    {
      id: 'q-ucs-vs-bfs', prompt: '在每步成本都是 1 的八數碼上，比較 UCS（取出時才測試）與 BFS（產生時就測試），哪一個敘述正確？',
      options: ['UCS 找到的解比較短', '兩者展開的節點數一定相同', 'UCS 可能找不到解，因為成本都相同', '兩者的解一樣長，但 UCS 通常展開較多節點'],
      answer: 3, explanation: '每步成本相同時兩者都是最佳的，解一樣長；但 UCS 要等目標被取出，會展開所有成本小於 d 的節點，BFS 在展開第 d − 1 層途中就停了。本課範例 8 步的盤面，BFS 展開 146 個、UCS 255 個。UCS 不會比 BFS 短，兩者都已經最短；展開數不同；每步成本 1 ≥ ε > 0，UCS 是完備的。',
    },
    {
      id: 'q-dls-cutoff', prompt: '用本課 IDS 範例的 `tree` 與 `dls`（深度用完時，還有孩子才回報 cutoff），呼叫 `dls("A", "K", 2, [])` 回傳什麼？K 在 A → C → G → K，深度 3。',
      options: ['"cutoff"', 'None（failure）', '["A", "C", "G", "K"]', '無限遞迴，直到 RecursionError'],
      answer: 0, explanation: 'ℓ = 2 只展開到深度 1，深度 2 的 D、E、F、G 不再展開；D、E、G 還有孩子，所以回報 cutoff，表示上限加大可能找得到。不會回傳 None：failure 代表整棵樹都看完了，這裡有節點被切掉；也找不到路徑，因為 K 在深度 3；遞迴每層 ℓ 減 1，到 0 就停，不會無限遞迴。',
    },
  ],
  exercises: [
    {
      id: 'x-search-switch', title: '一個框架，三種搜尋',
      statement: '給一張無向加權圖、起點、終點與一個演算法名稱（`bfs`、`ucs` 或 `ids`），用該演算法找路徑，輸出路徑、成本與展開的節點數。為了讓答案唯一，所有演算法都遵守以下規則。一、鄰居一律依節點編號由小到大處理。二、「展開」是指產生某個節點的鄰居；起點就是終點時，不展開任何節點，路徑只有起點、成本 0。三、`bfs` 是圖搜尋：佇列先進先出，每個節點第一次被產生時記下父節點，之後不再放入；在產生節點時做目標測試。四、`ucs` 的優先佇列放 `(g, k, v)`，k 是放入的順序（每放一筆加 1），成本相同時先放入的先取出；只有找到嚴格更小的 g 才更新並放入；取出過期紀錄（g 大於目前最佳）時跳過、不算展開；在取出時做目標測試。五、`ids` 依 ℓ = 0、1、2…… 執行深度限制搜尋：進入節點時先做目標測試；ℓ = 0 時不展開，只要還有不在目前路徑上的鄰居就回報 cutoff；ℓ > 0 時展開該節點，依序遞迴到不在目前路徑上的鄰居。某一輪沒有任何 cutoff 卻也沒找到，就輸出沒有路徑。展開數是所有輪的總和。輸入不合法時只輸出 `Invalid`。',
      inputFormat: '第一行是演算法名稱，小寫的 `bfs`、`ucs` 或 `ids`。第二行是 n 與 m：節點編號 0 到 n − 1，共 m 條邊。接下來 m 行，每行 `u v w` 表示 u 與 v 之間有一條成本 w 的無向邊。最後一行是起點 s 與終點 t。',
      outputFormat: '找到路徑時輸出三行：`path:` 後接路徑上的節點、`cost:` 後接路徑成本、`expanded:` 後接展開的節點數。找不到時輸出兩行：`no path` 與 `expanded:` 行。輸入不合法時只輸出 `Invalid`。',
      constraints: [
        '1 ≤ n ≤ 8，0 ≤ m ≤ n(n − 1) / 2',
        '1 ≤ w ≤ 100；所有數字都是十進位整數（不接受 +5、1.5）',
        'u ≠ v，同一對節點之間最多一條邊',
        '演算法名稱、節點編號、權重或數字個數不符合以上規則時，輸出 Invalid',
      ],
      samples: [
        { kind: 'normal', input: 'bfs\n6 7\n0 1 1\n0 2 4\n1 3 2\n1 4 5\n2 5 6\n3 4 1\n4 5 2\n0 5', output: 'path: 0 2 5\ncost: 10\nexpanded: 3', note: '本課的道路地圖（S、A、B、C、D、G 依序是 0 到 5）：BFS 找到邊數最少的 0 2 5，成本 10' },
        { kind: 'normal', input: 'ucs\n6 7\n0 1 1\n0 2 4\n1 3 2\n1 4 5\n2 5 6\n3 4 1\n4 5 2\n0 5', output: 'path: 0 1 3 4 5\ncost: 6\nexpanded: 5', note: '同一張圖用 UCS：成本最小的 0 1 3 4 5；提早做目標測試的錯誤寫法會輸出成本 10' },
      ],
      tests: [
        { kind: 'normal', input: 'ids\n6 7\n0 1 1\n0 2 4\n1 3 2\n1 4 5\n2 5 6\n3 4 1\n4 5 2\n0 5', output: 'path: 0 2 5\ncost: 10\nexpanded: 4', note: 'IDS 找到最淺的解，和 BFS 相同的 0 2 5，但成本不是最小；ℓ = 0、1、2 共展開 4 次' },
        { kind: 'normal', input: 'ucs\n5 5\n0 1 1\n0 3 4\n1 2 3\n2 4 1\n3 4 1\n0 4', output: 'path: 0 3 4\ncost: 5\nexpanded: 4', note: '節點 3 與 2 的成本都是 4，3 先放入所以先取出，答案是 0 3 4；平手時改比節點編號會得到 0 1 2 4' },
        { kind: 'normal', input: 'bfs\n5 5\n0 1 1\n0 3 4\n1 2 3\n2 4 1\n3 4 1\n0 4', output: 'path: 0 3 4\ncost: 5\nexpanded: 3', note: '同一張圖用 BFS：依邊數，0 3 4 只有兩條邊' },
        { kind: 'normal', input: 'ucs\n4 4\n0 1 1\n0 2 1\n1 3 1\n2 3 1\n0 3', output: 'path: 0 1 3\ncost: 2\nexpanded: 3', note: '兩條成本相同的路：依規則先處理編號小的 1，答案是 0 1 3' },
        { kind: 'normal', input: 'ids\n5 5\n0 1 1\n1 2 1\n2 0 1\n2 3 5\n3 4 1\n0 4', output: 'path: 0 2 3 4\ncost: 7\nexpanded: 10', note: '0、1、2 形成一個環：IDS 必須只走不在目前路徑上的鄰居，否則會在環上繞圈' },
        { kind: 'normal', input: 'ucs\n5 5\n0 1 1\n1 2 1\n2 0 1\n2 3 5\n3 4 1\n0 4', output: 'path: 0 2 3 4\ncost: 7\nexpanded: 4', note: '同一個環用 UCS，取出 4 時結束' },
        { kind: 'normal', input: 'ucs\n6 7\n0 1 1\n0 2 4\n1 3 2\n1 4 5\n2 5 6\n3 4 1\n4 5 2\n5 0', output: 'path: 5 4 3 1 0\ncost: 6\nexpanded: 5', note: '從 5 走回 0：邊是無向的' },
        { kind: 'edge', input: 'bfs\n6 7\n0 1 1\n0 2 4\n1 3 2\n1 4 5\n2 5 6\n3 4 1\n4 5 2\n3 3', output: 'path: 3\ncost: 0\nexpanded: 0', note: '起點就是終點：路徑只有 3，成本 0，不展開任何節點' },
        { kind: 'edge', input: 'ids\n6 7\n0 1 1\n0 2 4\n1 3 2\n1 4 5\n2 5 6\n3 4 1\n4 5 2\n3 3', output: 'path: 3\ncost: 0\nexpanded: 0', note: '起點就是終點，用 IDS：ℓ = 0 進入節點時就通過目標測試' },
        { kind: 'edge', input: 'ucs\n1 0\n0 0', output: 'path: 0\ncost: 0\nexpanded: 0', note: '只有一個節點、沒有邊' },
        { kind: 'edge', input: 'bfs\n5 3\n0 1 3\n1 2 3\n3 4 1\n0 4', output: 'no path\nexpanded: 3', note: '終點在另一個連通塊：BFS 展開 0、1、2 後佇列空了' },
        { kind: 'edge', input: 'ucs\n5 3\n0 1 3\n1 2 3\n3 4 1\n0 4', output: 'no path\nexpanded: 3', note: '同上用 UCS：展開 3 個節點後優先佇列空了' },
        { kind: 'edge', input: 'ids\n5 3\n0 1 3\n1 2 3\n3 4 1\n0 4', output: 'no path\nexpanded: 3', note: '同上用 IDS：ℓ = 2 那一輪沒有 cutoff，回報沒有路徑，而不是無限加深' },
        { kind: 'edge', input: 'ids\n6 5\n0 1 1\n1 2 1\n2 0 1\n2 3 5\n4 5 1\n0 5', output: 'no path\nexpanded: 10', note: '有環而且到不了：IDS 要靠路徑檢查與 cutoff 規則才會停' },
        { kind: 'edge', input: 'ids\n3 0\n0 2', output: 'no path\nexpanded: 0', note: '沒有任何邊：ℓ = 0 時起點沒有鄰居，不算 cutoff，展開 0 個節點' },
        { kind: 'edge', input: 'bfs\n2 1\n1 0 7\n0 1', output: 'path: 0 1\ncost: 7\nexpanded: 1', note: '邊寫成 1 0，仍然可以從 0 走到 1' },
        { kind: 'edge', input: 'ids\n8 28\n0 1 1\n0 2 1\n0 3 1\n0 4 1\n0 5 1\n0 6 1\n0 7 1\n1 2 1\n1 3 1\n1 4 1\n1 5 1\n1 6 1\n1 7 1\n2 3 1\n2 4 1\n2 5 1\n2 6 1\n2 7 1\n3 4 1\n3 5 1\n3 6 1\n3 7 1\n4 5 1\n4 6 1\n4 7 1\n5 6 1\n5 7 1\n6 7 1\n0 7', output: 'path: 0 7\ncost: 1\nexpanded: 1', note: '8 個節點的完全圖：0 和 7 直接相連，IDS 在 ℓ = 1 找到' },
        { kind: 'edge', input: 'ids\n8 21\n0 1 1\n0 2 1\n0 3 1\n0 4 1\n0 5 1\n0 6 1\n1 2 1\n1 3 1\n1 4 1\n1 5 1\n1 6 1\n2 3 1\n2 4 1\n2 5 1\n2 6 1\n3 4 1\n3 5 1\n3 6 1\n4 5 1\n4 6 1\n5 6 1\n0 7', output: 'no path\nexpanded: 1956', note: '7 個節點的完全圖加上孤立的 7：IDS 走遍所有不重複的路徑才確定沒有路，展開 1956 次' },
        { kind: 'error', input: 'dfs\n6 7\n0 1 1\n0 2 4\n1 3 2\n1 4 5\n2 5 6\n3 4 1\n4 5 2\n0 5', output: 'Invalid', note: 'dfs 不是允許的演算法名稱' },
        { kind: 'error', input: 'BFS\n6 7\n0 1 1\n0 2 4\n1 3 2\n1 4 5\n2 5 6\n3 4 1\n4 5 2\n0 5', output: 'Invalid', note: '名稱要小寫' },
        { kind: 'error', input: 'bfs\n3 1\n0 3 1\n0 2', output: 'Invalid', note: '邊的端點 3 超出 0..n − 1' },
        { kind: 'error', input: 'ucs\n3 1\n0 1 0\n0 1', output: 'Invalid', note: '權重 0：UCS 的完備性需要每步成本至少 ε > 0' },
        { kind: 'error', input: 'ucs\n3 1\n0 1 -2\n0 1', output: 'Invalid', note: '負權重' },
        { kind: 'error', input: 'bfs\n3 1\n1 1 2\n0 1', output: 'Invalid', note: '自環' },
        { kind: 'error', input: 'bfs\n3 2\n0 1 2\n1 0 5\n0 1', output: 'Invalid', note: '同一對節點有兩條邊（1 0 與 0 1 是同一對）' },
        { kind: 'error', input: 'bfs\n3 2\n0 1 2\n0 1', output: 'Invalid', note: '邊少於 m 條' },
        { kind: 'error', input: 'bfs\n3 1\n0 1 2\n0 1 2', output: 'Invalid', note: '多出一個數字' },
        { kind: 'error', input: 'ucs\n3 1\n0 1 1.5\n0 1', output: 'Invalid', note: '權重不是整數' },
        { kind: 'error', input: 'ucs\n3 1\n0 1 +5\n0 1', output: 'Invalid', note: '帶正號不算十進位整數的寫法（Python 的 int() 會接受，要自己檢查）' },
        { kind: 'error', input: 'bfs\n3 1\n0 1 2\n0 3', output: 'Invalid', note: '終點 3 超出範圍' },
        { kind: 'error', input: 'bfs\n9 0\n0 1', output: 'Invalid', note: 'n = 9 超過上限' },
        { kind: 'error', input: 'bfs\n0 0\n0 0', output: 'Invalid', note: 'n = 0' },
        { kind: 'error', input: 'bfs', output: 'Invalid', note: '只有演算法名稱，缺少其他資料' },
        { kind: 'error', input: '', output: 'Invalid', note: '空輸入' },
      ],
      hints: [
        '先寫 `read`：把所有 token 讀進來，檢查演算法名稱、n、m、每條邊與 token 總數，任何一項不對就輸出 Invalid。',
        '三個搜尋函式都回傳 `(path, expanded)`，找不到時 path 是 None；主程式用 dict 依名稱挑函式，輸出的部分只寫一次。',
        'UCS 的 heap 元素寫成 `(g, k, v)`，k 是全域遞增的計數器；IDS 的 DLS 回傳路徑、"cutoff" 或 None 三種結果。',
      ],
      solution: { Python: code`import heapq
import re
import sys
from collections import deque

def bfs(adj, s, t):
    if s == t:
        return [s], 0
    parent, frontier, expanded = {s: None}, deque([s]), 0
    while frontier:
        u = frontier.popleft()
        expanded += 1
        for v, _ in adj[u]:
            if v not in parent:
                parent[v] = u
                if v == t:
                    return walk(parent, v), expanded
                frontier.append(v)
    return None, expanded

def ucs(adj, s, t):
    g, parent, frontier, expanded, k = {s: 0}, {s: None}, [(0, 0, s)], 0, 1
    while frontier:
        cost, _, u = heapq.heappop(frontier)
        if u == t:
            return walk(parent, u), expanded
        if cost > g[u]:
            continue
        expanded += 1
        for v, w in adj[u]:
            if cost + w < g.get(v, float("inf")):
                g[v], parent[v] = cost + w, u
                heapq.heappush(frontier, (cost + w, k, v))
                k += 1
    return None, expanded

def ids(adj, s, t):
    expanded = 0
    def dls(u, path, limit):
        nonlocal expanded
        if u == t:
            return path
        if limit == 0:
            return "cutoff" if any(v not in path for v, _ in adj[u]) else None
        expanded += 1
        cut = False
        for v, _ in adj[u]:
            if v not in path:
                r = dls(v, path + [v], limit - 1)
                if r == "cutoff":
                    cut = True
                elif r is not None:
                    return r
        return "cutoff" if cut else None
    limit = 0
    while True:
        r = dls(s, [s], limit)
        if r != "cutoff":
            return r, expanded
        limit += 1

def walk(parent, v):
    path = []
    while v is not None:
        path.append(v)
        v = parent[v]
    return path[::-1]

def num(x):
    if not re.fullmatch(r"-?[0-9]+", x):     # 只接受十進位整數（不含 +5、1.5、1_0）
        raise ValueError(x)
    return int(x)

def read(tokens):
    algo, n, m = tokens[0], num(tokens[1]), num(tokens[2])
    if algo not in ("bfs", "ucs", "ids") or not 1 <= n <= 8 or not 0 <= m <= n * (n - 1) // 2:
        return None
    if len(tokens) != 5 + 3 * m:
        return None
    nums = [num(x) for x in tokens[3:]]
    adj, seen = [[] for _ in range(n)], set()
    for i in range(m):
        u, v, w = nums[3 * i: 3 * i + 3]
        if not (0 <= u < n and 0 <= v < n and u != v and 1 <= w <= 100) or (min(u, v), max(u, v)) in seen:
            return None
        seen.add((min(u, v), max(u, v)))
        adj[u].append((v, w))
        adj[v].append((u, w))
    s, t = nums[-2], nums[-1]
    if not (0 <= s < n and 0 <= t < n):
        return None
    for a in adj:
        a.sort()                                 # 鄰居一律依編號由小到大
    return algo, adj, s, t

def main():
    try:
        problem = read(sys.stdin.read().split())
    except (ValueError, IndexError):
        problem = None
    if problem is None:
        print("Invalid")
        return
    algo, adj, s, t = problem
    path, expanded = {"bfs": bfs, "ucs": ucs, "ids": ids}[algo](adj, s, t)
    if path is None:
        print("no path")
    else:
        cost = sum(dict(adj[a])[b] for a, b in zip(path, path[1:]))
        print("path:", *path)
        print("cost:", cost)
    print("expanded:", expanded)

main()` },
      judge: 'none',
    },
  ],
};

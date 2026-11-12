import type { LessonContent, TraceStep } from '../schema';
import { graphSteps, type GraphOp } from '../simulate';

const code = String.raw;

/** The trace's operations on the Python adjacency lists (6 vertices, 5 undirected edges): the line and why it matters. */
const nodes = ['0', '1', '2', '3', '4', '5'];
const traceOps: { op: GraphOp; note: string }[] = [
  { op: { op: 'edge', from: '0', to: '1', line: 6 }, note: '第一條邊 (0, 1)：第 5 行把 1 接到 `adj[0]` 後面，第 6 行把 0 接到 `adj[1]` 後面。無向邊要存兩個方向，之後從 0 或從 1 出發都看得到這條邊。' },
  { op: { op: 'edge', from: '0', to: '2', line: 6 }, note: '邊 (0, 2)：`adj[0]` 變成 [1, 2]，`adj[2]` 變成 [0]。每個串列都依「邊被讀到的先後」排列，不會自動排序。' },
  { op: { op: 'edge', from: '1', to: '2', line: 6 }, note: '邊 (1, 2)：0、1、2 三個節點兩兩相連，形成一個環 0 – 1 – 2 – 0。' },
  { op: { op: 'edge', from: '2', to: '3', line: 6 }, note: '邊 (2, 3)：節點 2 的串列長度變成 3，這就是它的度數。' },
  { op: { op: 'edge', from: '3', to: '4', line: 6 }, note: '最後一條邊 (3, 4)。5 條邊、度數總和 10 = 2 × 5：每條無向邊剛好讓兩個端點的度數各加 1（握手定理）。節點 5 沒有出現在任何邊裡，它的串列是空的，自己是一個連通塊。' },
  { op: { op: 'neighbors', node: '2', line: 7 }, note: '查詢 2 的鄰居：直接讀出 `adj[2]` = [0, 1, 3]，不必掃過全部的邊，花費 O(度數)。`len(adj[2])` 就是度數 3，是 O(1)。' },
  { op: { op: 'neighbors', node: '5', line: 8 }, note: '節點 5 是孤立點（isolated vertex）：`adj[5]` 是空串列，度數 0。圖不一定連通，n 個節點都要事先建好空串列，否則 `adj[5]` 會丟出 `IndexError`。' },
];
const outputs = ['', '', '', '', '', '[0, 1, 3] 3', '[0, 1, 3] 3\n[] 0'];

const degreeVars = (edges: { from: string; to: string }[]): Record<string, string> => {
  const degree = nodes.map(() => 0);
  for (const e of edges) { degree[Number(e.from)] += 1; degree[Number(e.to)] += 1; }
  return { 'E（邊數）': String(edges.length), '[len(a) for a in adj]': `[${degree.join(', ')}]`, 度數總和: String(degree.reduce((a, b) => a + b, 0)) };
};
const simulated: TraceStep[] = graphSteps('adj', nodes, false, traceOps.map(t => t.op), ['list']).map((step, i) => {
  const op = traceOps[i].op;
  return {
    ...step,
    note: traceOps[i].note,
    vars: { ...(op.op === 'edge' ? { 'u, v': `${op.from}, ${op.to}` } : {}), ...degreeVars(step.graph!.edges), ...(step.vars ?? {}) },
    ...(outputs[i] ? { output: outputs[i] } : {}),
  };
});

/**
 * D16 Graph basics. Every example and the reference solution run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); adjacency lists are `Array.from({ length: n }, () => [])`.
 */
export const D16: LessonContent = {
  lessonId: 'D16',
  motivation: '前面學的串列、堆疊、樹，都是「一個接一個」或「一個管好幾個」的關係。但現實中很多關係是網狀的：城市之間的道路、朋友之間的認識、網頁之間的超連結、課程之間的先修關係。圖（graph）就是描述這種任意關係的資料結構：用節點代表東西，用邊代表兩樣東西之間的關係。導航找路、社群推薦好友、搜尋引擎分析連結、排課時決定先後順序，背後都是圖。這一課先建立共同的語言：有向與無向、權重、度數、路徑、環與連通，並學會把題目的「n m 加上 m 條邊」讀進程式、存成鄰接串列。限制也要先說清楚：圖本身只是模型，要回答「能不能到」「最短要走多遠」還需要走訪演算法（演算法島的 BFS、DFS 與最短路徑），而把問題畫成圖時，選錯有向或無向、忘了權重，後面的演算法再正確也會得到錯的答案。',
  sections: [
    {
      id: 'vertices-edges', title: '節點與邊：圖的種類',
      blocks: [
        { type: 'p', text: '一張圖 G = (V, E) 由兩個集合組成：節點（vertex，也叫頂點，複數 vertices）的集合 V，以及邊（edge）的集合 E。每條邊連接兩個節點，這兩個節點稱為邊的端點（endpoint），彼此是鄰居（neighbor），也說它們相鄰（adjacent）。習慣上用 n 或 V 表示節點數、m 或 E 表示邊數。程式裡通常把節點編號成 0..n − 1 或 1..n，用編號代替名字。' },
        { type: 'p', text: '和 D11 的樹相比，圖沒有根、沒有父子關係，也沒有「不能繞回來」的限制：任兩個節點之間都可以有邊，邊可以繞成環，整張圖也可以分成好幾塊互不相連的部分。樹其實是一種特別的圖（下一節會說明條件）。' },
        { type: 'p', text: '依照邊的性質，圖可以分成幾種：' },
        { type: 'list', items: [
          '無向圖（undirected graph）：邊沒有方向，邊 {u, v} 表示 u 和 v 互相連通，從哪一端出發都可以走。例如雙向道路、「互為好友」。',
          '有向圖（directed graph，digraph）：邊有方向，寫成 u → v，只能從 u 走到 v，反過來不一定可以。例如單行道、「A 追蹤 B」、「課程 u 是課程 v 的先修」。',
          '無權圖（unweighted graph）：只關心「有沒有邊」，每條邊都一樣。',
          '加權圖（weighted graph）：每條邊帶一個數字，稱為權重（weight），例如道路的公里數、通行時間、網路線的費用。權重可以出現在有向圖或無向圖上。',
        ] },
        { type: 'p', text: '還有兩種特殊的邊：自環（self-loop）是兩個端點相同的邊 u – u；重邊（multi-edge，平行邊）是同一對節點之間有兩條以上的邊，例如兩座城市之間有兩條不同的路。沒有自環也沒有重邊的無向圖稱為簡單圖（simple graph），大部分教科書的定理預設的都是簡單圖。程式題常常會在題目裡說明「保證沒有自環與重邊」，沒說的話就要自己想清楚它們出現時該怎麼算。' },
        { type: 'table', head: ['種類', '邊的寫法', '例子', '要注意的地方'], rows: [
          ['無向、無權', '{u, v}', '好友關係、雙向道路是否存在', '存的時候 u、v 兩邊都要記'],
          ['有向、無權', 'u → v', '追蹤、超連結、先修課程', 'u → v 存在不代表 v → u 存在'],
          ['無向、加權', '{u, v}，權重 w', '城市之間道路的公里數', '同一條邊兩個方向的權重相同'],
          ['有向、加權', 'u → v，權重 w', '單行道的通行時間、匯率換算', '兩個方向可以有不同的權重'],
          ['簡單圖', '—', '大部分的觀念題', '沒有自環、沒有重邊，邊數最多 n(n − 1) / 2'],
          ['多重圖（multigraph）', '—', '兩城之間有多條路', '重邊要分開計算，不能去重'],
        ] },
      ],
    },
    {
      id: 'degree', title: '度數與握手定理',
      blocks: [
        { type: 'p', text: '無向圖中，節點 v 的度數（degree）deg(v) 是連到 v 的邊數。自環的兩個端點都是 v，慣例上算 2；重邊每一條都要算。度數為 0 的節點稱為孤立點（isolated vertex）。' },
        { type: 'p', text: '握手定理（handshake lemma）：無向圖所有節點的度數總和，剛好等於邊數的兩倍，也就是 deg(v) 的總和 = 2E。理由很簡單：每條邊有兩個端點，計算度數時會被兩端各算一次（自環也是在同一個節點算兩次）。就像一群人握手，每次握手有兩個人參與，「每個人握手次數」的總和一定是握手次數的兩倍。由此可以推出：度數總和一定是偶數，所以度數為奇數的節點一定有偶數個。如果題目給的度數總和是奇數，這樣的無向圖根本不存在。' },
        { type: 'example', id: 'degree-count' },
        { type: 'p', text: '有向圖要分成兩種度數：入度（in-degree）是指向 v 的邊數（v 是終點），出度（out-degree）是從 v 出發的邊數（v 是起點）。每條有向邊 u → v 讓 u 的出度加 1、v 的入度加 1，所以所有入度的總和 = 所有出度的總和 = E。入度為 0 的節點沒有任何邊指向它；在先修關係圖裡，這代表「不需要先修任何課程，可以最先學」。出度為 0 的節點則是沒有後續的終點。' },
        { type: 'example', id: 'in-out-degree' },
        { type: 'callout', tone: 'tip', title: '用握手定理檢查程式', text: '建好無向圖的鄰接串列之後，把每個串列的長度加起來，應該剛好是 2m（m 是讀進來的邊數）。如果只得到 m，代表你忘了加反向邊；有向圖則應該剛好是 m。這是除錯時非常便宜又有效的檢查。' },
      ],
    },
    {
      id: 'paths-connectivity', title: '路徑、環、連通與樹',
      blocks: [
        { type: 'p', text: '路徑（path）是一串節點 v0, v1, …, vk，其中每兩個相鄰的節點之間都有邊（有向圖要順著邊的方向）。路徑的長度通常指經過的邊數 k；加權圖裡則常指路上權重的總和，要看題目怎麼定義。節點都不重複的路徑稱為簡單路徑（simple path）。起點和終點相同、至少有一條邊，而且中間不重複走同一條邊的路徑稱為環（cycle），例如 0 – 1 – 2 – 0。沒有任何環的有向圖稱為有向無環圖（DAG，directed acyclic graph）。' },
        { type: 'p', text: '無向圖中，如果 u 和 v 之間有路徑，就說它們連通（connected）。任兩個節點都連通的圖稱為連通圖（connected graph）。一張不連通的圖會自然分成幾塊，每一塊內部彼此連通、塊與塊之間沒有邊，這些塊稱為連通塊（connected component，連通分量）。孤立點自己就是一個連通塊。例如節點 0..5、邊 (0, 1)、(1, 2)、(3, 4) 的圖有三個連通塊：{0, 1, 2}、{3, 4}、{5}。' },
        { type: 'p', text: '有向圖要改說可達（reachable）：從 u 沿著邊的方向能走到 v，就說 v 從 u 可達。可達沒有對稱性：u → v 這條邊讓 v 從 u 可達，但 u 不一定從 v 可達。任兩個節點都互相可達的有向圖稱為強連通（strongly connected）。判斷連通與可達要用演算法島的 BFS（A14）或 DFS（A15）去走訪，或用 D18 的並查集處理無向圖的連通；這一課先把觀念定清楚。' },
        { type: 'p', text: '樹與圖的關係：D11 的樹，用圖的語言說就是「連通、而且沒有環的無向圖」。n 個節點的樹剛好有 n − 1 條邊。更實用的事實是：對一張 n 個節點的無向圖，下面三個條件只要任兩個成立，第三個就自動成立，圖就是樹：' },
        { type: 'list', items: [
          '連通。',
          '沒有環（自環與重邊也算環）。',
          '剛好有 n − 1 條邊。',
        ] },
        { type: 'p', text: '只看邊數不夠：6 個節點、5 條邊的圖可能一邊有環、另一邊不連通。更一般地，沒有環但不連通的圖稱為森林（forest），由 c 棵樹組成時剛好有 n − c 條邊；所以邊數比 n − 1 少的圖一定不連通，比 n − 1 多的圖一定有環。' },
        { type: 'table', head: ['名詞', '適用', '意思'], rows: [
          ['路徑', '有向、無向', '一串相鄰節點；有向圖要順著方向'],
          ['環', '有向、無向', '從某節點出發、不重複用邊，回到自己'],
          ['連通、連通塊', '無向', '有路徑相連；彼此連通的最大一塊'],
          ['可達', '有向', '順著方向走得到；不對稱'],
          ['樹', '無向', '連通 + 無環，邊數 n − 1'],
          ['DAG', '有向', '沒有有向環，例如先修關係'],
        ] },
      ],
    },
    {
      id: 'modelling', title: '把生活問題轉成圖',
      blocks: [
        { type: 'p', text: '用圖解題的第一步是建模（modelling）：決定什麼是節點、什麼是邊，再問三個問題：關係有沒有方向？邊有沒有權重？會不會有自環或重邊？答案決定了要存幾個方向、要不要存權重，以及之後能用哪些演算法。' },
        { type: 'table', head: ['問題', '節點', '邊', '有向？', '加權？'], rows: [
          ['地圖導航：最短路線', '路口或城市', '道路', '雙向道無向；有單行道就要有向', '是：距離或時間'],
          ['社群網站的好友', '使用者', '互為好友', '無向（雙方都同意）', '通常否'],
          ['追蹤、粉絲', '使用者', 'A 追蹤 B', '有向', '否'],
          ['網頁連結', '網頁', '超連結 A → B', '有向', '否（分析時可能另外給權重）'],
          ['課程先修', '課程', 'u 是 v 的先修：u → v', '有向，而且必須是 DAG', '否'],
          ['迷宮、棋盤格子', '格子', '相鄰而且都能走', '通常無向', '否（每步成本相同）'],
          ['電腦網路佈線', '電腦', '可以拉的線', '無向', '是：線的費用'],
        ] },
        { type: 'p', text: '本課程自己就是一個例子：每一課是節點，「A 是 B 的先修」是一條有向邊 A → B。這一課的先修是 D01，所以有一條邊 D01 → D16；D17 與 D18 都以本課為先修，所以 D16 有兩條出邊。課程表在檢查時要求每個先修都排在後面那一課之前，這保證了沿著邊只能往後走、永遠繞不回來，所以整張先修圖是一個 DAG。如果先修關係有環（A 要先學 B、B 又要先學 A），就沒有人能開始學，這正是有向圖裡「環」造成的問題。' },
        { type: 'callout', tone: 'warning', title: '有向還是無向，要看關係本身', text: '「A 和 B 是朋友」是對稱的，用無向邊；「A 追蹤 B」不是對稱的，用有向邊。把有向關係當成無向來存，會憑空多出 B → A 的路，讓不可達的節點變成可達；反過來把無向關係只存一個方向，則會漏掉一半的路。讀題時看到「單向」「只能從…到…」「依賴」「先後」這類字眼，通常就是有向圖。' },
      ],
    },
    {
      id: 'storing', title: '讀入邊並存成鄰接串列',
      blocks: [
        { type: 'p', text: '程式題最常見的圖輸入格式是邊串列（edge list）：第一行兩個整數 n 與 m（節點數、邊數），接下來 m 行，每行兩個整數 u v 表示一條邊（加權圖會多一個 w）。只把這 m 對數字存在陣列裡，要找某個節點的鄰居就得掃過全部 m 條邊。所以通常會改存成鄰接串列（adjacency list）：每個節點一個串列，裝著它的所有鄰居。' },
        { type: 'p', text: '建立方法：先為 n 個節點各準備一個空串列，然後每讀一條邊 (u, v)，就把 v 加到 u 的串列；無向圖還要把 u 加到 v 的串列。下面的範例讀入 1-based 的邊，依讀入順序與排序後各印一次每個節點的鄰居。鄰居的順序就是邊被讀到的順序，需要固定順序（例如題目要求由小到大）時要自己排序。' },
        { type: 'example', id: 'adjacency-list' },
        { type: 'p', text: '下方的視覺化用 Python 逐步建立一張 6 個節點、5 條邊的無向圖：每加一條邊，兩個端點的串列都多一個元素；最後查詢節點 2 與孤立點 5 的鄰居與度數。' },
        { type: 'callout', tone: 'warning', title: '節點編號：1-based 輸入不能直接放進大小 n 的陣列', text: '很多題目的節點編號是 1..n，但陣列索引從 0 開始。直接配置 n 個串列、再用 `adj[u]`，遇到 u = n 就越界：Python 丟出 `IndexError`、Java 丟出 `IndexOutOfBoundsException`、JavaScript 的 `adj[u]` 是 `undefined`，接著 `.push` 丟出 `TypeError`，C++ 的 `adj[u]` 不檢查邊界，是未定義行為，可能默默寫壞記憶體。兩種正確做法擇一：配置 n + 1 個串列、索引 0 不用；或讀進來時立刻 `u--`、`v--` 轉成 0-based，輸出時再加 1。反過來，題目是 0-based 卻當成 1-based 減 1，節點 0 會變成 -1：Python 的 `adj[-1]` 不會報錯，而是悄悄存到最後一個節點，最難發現。' },
        { type: 'callout', tone: 'warning', title: '無向圖忘了加反向邊', text: '只寫 `adj[u].append(v)` 而沒有 `adj[v].append(u)`，等於把無向圖存成有向圖：從 v 看不到 u，算出來的度數少了一半，之後的走訪也會漏掉節點。這是圖論題最經典的錯誤，而且程式不會報錯，只會默默算出錯的答案，有時還能通過簡單的範例。用上一節的檢查：所有串列的長度總和應該是 2m。' },
        { type: 'p', text: '四種語言的寫法不同，但都是「串列的串列」：' },
        { type: 'list', items: [
          'C++：`std::vector<std::vector<int>> adj(n);` 一次建好 n 個空的 vector，`adj[u].push_back(v)` 加入鄰居，`adj[u].size()` 是度數。`adj[u]` 不檢查邊界，除錯時可以改用 `adj.at(u)`，越界會丟出 `std::out_of_range`。加權圖常存 `std::vector<std::vector<std::pair<int, int>>>`，pair 放（鄰居, 權重）。',
          'Python：`adj = [[] for _ in range(n)]`，`adj[u].append(v)`，`len(adj[u])` 是度數。不要寫 `[[]] * n`：那是同一個 list 的 n 個參考，加到任何一個節點都會出現在所有節點的串列裡。',
          'Java：`List<List<Integer>> adj = new ArrayList<>();` 再用迴圈 `adj.add(new ArrayList<>())` 加 n 次；`adj.get(u).add(v)`、`adj.get(u).size()`。忘了先加內層串列，`adj.get(u)` 會丟出 `IndexOutOfBoundsException`。元素是 `Integer` 物件（自動裝箱），比 C++ 的 `int` 多用不少記憶體；`new ArrayList<Integer>[n]` 這種泛型陣列寫法 Java 不允許直接建立，要轉型並產生未檢查警告，所以通常用 `List<List<Integer>>`。',
          'JavaScript：`const adj = Array.from({ length: n }, () => []);` 建好 n 個各自獨立的空陣列，`adj[u].push(v)` 加入鄰居，`adj[u].length` 是度數。不要寫 `new Array(n).fill([])`：和 Python 的 `[[]] * n` 一樣，n 格都指向同一個陣列。排序鄰居要寫 `adj[u].sort((a, b) => a - b)`，預設的 `sort()` 會把數字當字串比較。',
        ] },
        { type: 'table', head: ['操作', '只存邊串列', '鄰接串列', 'C++ / Python / Java 寫法', 'JavaScript 寫法'], rows: [
          ['建立', 'O(E)', 'O(V + E)', '先建 V 個空串列，再加入 E 條邊（無向圖 2E 次加入）', '`Array.from({ length: n }, () => [])`，再 `push` E（無向 2E）次'],
          ['記憶體', 'O(E)', 'O(V + E)', '`vector<vector<int>>`／`list` 的 `list`／`List<List<Integer>>`', '陣列的陣列'],
          ['列出 u 的所有鄰居', 'O(E)：掃過全部的邊', 'O(deg(u))', '`for (int v : adj[u])`／`for v in adj[u]`／`for (int v : adj.get(u))`', '`for (const v of adj[u])`'],
          ['查 u 的度數', 'O(E)', 'O(1)', '`adj[u].size()`／`len(adj[u])`／`adj.get(u).size()`', '`adj[u].length`'],
          ['判斷 u、v 是否相鄰', 'O(E)', 'O(deg(u))', '在 `adj[u]` 裡線性搜尋；D17 的鄰接矩陣可以 O(1)', '`adj[u].includes(v)`，同樣是線性搜尋'],
          ['走訪整張圖（A14、A15）', '—', 'O(V + E)', '每個節點與每個串列元素各處理一次', '同左'],
        ] },
        { type: 'p', text: '存 E 條邊的鄰接串列需要 O(V + E) 的空間：V 個串列本身，加上總共 E（有向）或 2E（無向）個元素。這對稀疏的圖（邊數遠少於 V²）非常省，也是大部分程式題的標準存法。另一種存法是 V × V 的鄰接矩陣（adjacency matrix），判斷兩點是否相鄰只要 O(1)，但空間固定是 O(V²)；兩者的完整比較與選擇，留到下一課 D17。' },
      ],
    },
  ],
  examples: [
    {
      id: 'degree-count', title: '由邊串列計算每個節點的度數', description: '5 個節點、5 條無向邊。每條邊讓兩個端點的度數各加 1，最後驗證度數總和等於 2E，並數出奇數度的節點。',
      output: 'deg(0) = 2\ndeg(1) = 3\ndeg(2) = 2\ndeg(3) = 2\ndeg(4) = 1\nsum = 10, 2E = 10\nodd-degree vertices: 2',
      code: {
        'C++': code`#include <iostream>
#include <utility>
#include <vector>

int main() {
    int n = 5;
    std::vector<std::pair<int, int>> edges = {{0, 1}, {0, 2}, {1, 2}, {1, 3}, {3, 4}};
    std::vector<int> degree(n, 0);
    for (const auto& [u, v] : edges) {
        ++degree[u];
        ++degree[v];  // 無向邊：兩個端點各加 1
    }
    int sum = 0, odd = 0;
    for (int v = 0; v < n; ++v) {
        std::cout << "deg(" << v << ") = " << degree[v] << "\n";
        sum += degree[v];
        if (degree[v] % 2 == 1) ++odd;
    }
    std::cout << "sum = " << sum << ", 2E = " << 2 * edges.size() << "\n";
    std::cout << "odd-degree vertices: " << odd << "\n";
    return 0;
}`,
        Python: code`n = 5
edges = [(0, 1), (0, 2), (1, 2), (1, 3), (3, 4)]
degree = [0] * n
for u, v in edges:
    degree[u] += 1
    degree[v] += 1  # 無向邊：兩個端點各加 1
for v in range(n):
    print(f"deg({v}) = {degree[v]}")
print(f"sum = {sum(degree)}, 2E = {2 * len(edges)}")
print("odd-degree vertices:", sum(1 for d in degree if d % 2 == 1))`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int n = 5;
        int[][] edges = {{0, 1}, {0, 2}, {1, 2}, {1, 3}, {3, 4}};
        int[] degree = new int[n];
        for (int[] e : edges) {
            degree[e[0]]++;
            degree[e[1]]++;  // 無向邊：兩個端點各加 1
        }
        int sum = 0, odd = 0;
        for (int v = 0; v < n; v++) {
            System.out.println("deg(" + v + ") = " + degree[v]);
            sum += degree[v];
            if (degree[v] % 2 == 1) odd++;
        }
        System.out.println("sum = " + sum + ", 2E = " + 2 * edges.length);
        System.out.println("odd-degree vertices: " + odd);
    }
}`,
        JavaScript: code`const n = 5;
const edges = [[0, 1], [0, 2], [1, 2], [1, 3], [3, 4]];
const degree = new Array(n).fill(0);
for (const [u, v] of edges) {
    degree[u]++;
    degree[v]++;  // 無向邊：兩個端點各加 1
}
let sum = 0;
let odd = 0;
for (let v = 0; v < n; v++) {
    console.log("deg(" + v + ") = " + degree[v]);
    sum += degree[v];
    if (degree[v] % 2 === 1) odd++;
}
console.log("sum = " + sum + ", 2E = " + 2 * edges.length);
console.log("odd-degree vertices: " + odd);`,
      },
    },
    {
      id: 'in-out-degree', title: '有向圖的入度與出度', description: '5 門課的先修關係，u → v 表示 u 要先學。入度為 0 的課可以最先學，出度為 0 的課沒有後續；入度總和與出度總和都等於 E。',
      output: '0: in 0, out 2\n1: in 1, out 1\n2: in 1, out 1\n3: in 2, out 1\n4: in 1, out 0\nsum in = 5, sum out = 5, E = 5\nsources (in = 0): 0\nsinks (out = 0): 4',
      code: {
        'C++': code`#include <iostream>
#include <utility>
#include <vector>

int main() {
    int n = 5;
    std::vector<std::pair<int, int>> edges = {{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}};  // u -> v
    std::vector<int> in(n, 0), out(n, 0);
    for (const auto& [u, v] : edges) {
        ++out[u];  // 從 u 出發
        ++in[v];   // 指向 v
    }
    int sumIn = 0, sumOut = 0;
    for (int v = 0; v < n; ++v) {
        std::cout << v << ": in " << in[v] << ", out " << out[v] << "\n";
        sumIn += in[v];
        sumOut += out[v];
    }
    std::cout << "sum in = " << sumIn << ", sum out = " << sumOut << ", E = " << edges.size() << "\n";
    std::cout << "sources (in = 0):";
    for (int v = 0; v < n; ++v) if (in[v] == 0) std::cout << " " << v;
    std::cout << "\nsinks (out = 0):";
    for (int v = 0; v < n; ++v) if (out[v] == 0) std::cout << " " << v;
    std::cout << "\n";
    return 0;
}`,
        Python: code`n = 5
edges = [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4)]  # u -> v
indeg = [0] * n
outdeg = [0] * n
for u, v in edges:
    outdeg[u] += 1  # 從 u 出發
    indeg[v] += 1   # 指向 v
for v in range(n):
    print(f"{v}: in {indeg[v]}, out {outdeg[v]}")
print(f"sum in = {sum(indeg)}, sum out = {sum(outdeg)}, E = {len(edges)}")
print("sources (in = 0):", *[v for v in range(n) if indeg[v] == 0])
print("sinks (out = 0):", *[v for v in range(n) if outdeg[v] == 0])`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int n = 5;
        int[][] edges = {{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}};  // u -> v
        int[] in = new int[n], out = new int[n];
        for (int[] e : edges) {
            out[e[0]]++;  // 從 u 出發
            in[e[1]]++;   // 指向 v
        }
        int sumIn = 0, sumOut = 0;
        for (int v = 0; v < n; v++) {
            System.out.println(v + ": in " + in[v] + ", out " + out[v]);
            sumIn += in[v];
            sumOut += out[v];
        }
        System.out.println("sum in = " + sumIn + ", sum out = " + sumOut + ", E = " + edges.length);
        StringBuilder sources = new StringBuilder("sources (in = 0):"), sinks = new StringBuilder("sinks (out = 0):");
        for (int v = 0; v < n; v++) {
            if (in[v] == 0) sources.append(" ").append(v);
            if (out[v] == 0) sinks.append(" ").append(v);
        }
        System.out.println(sources);
        System.out.println(sinks);
    }
}`,
        JavaScript: code`const n = 5;
const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];  // u -> v
const indeg = new Array(n).fill(0);
const outdeg = new Array(n).fill(0);
for (const [u, v] of edges) {
    outdeg[u]++;  // 從 u 出發
    indeg[v]++;   // 指向 v
}
let sumIn = 0;
let sumOut = 0;
for (let v = 0; v < n; v++) {
    console.log(v + ": in " + indeg[v] + ", out " + outdeg[v]);
    sumIn += indeg[v];
    sumOut += outdeg[v];
}
console.log("sum in = " + sumIn + ", sum out = " + sumOut + ", E = " + edges.length);
const sources = [];
const sinks = [];
for (let v = 0; v < n; v++) {
    if (indeg[v] === 0) sources.push(v);
    if (outdeg[v] === 0) sinks.push(v);
}
console.log("sources (in = 0): " + sources.join(" "));
console.log("sinks (out = 0): " + sinks.join(" "));`,
      },
    },
    {
      id: 'adjacency-list', title: '讀入邊串列，建立鄰接串列', description: '輸入 n、m 與 m 條 1-based 的無向邊，配置 n + 1 個串列（索引 0 不用），兩個方向都加入。每個節點先依讀入順序、再依排序後印出鄰居，沒有鄰居印 -。',
      stdin: '5 5\n1 4\n1 2\n3 1\n2 3\n4 2',
      output: '1: 4 2 3 | sorted: 2 3 4\n2: 1 3 4 | sorted: 1 3 4\n3: 1 2 | sorted: 1 2\n4: 1 2 | sorted: 1 2\n5: - | sorted: -',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

void printList(const std::vector<int>& list) {
    if (list.empty()) std::cout << " -";
    for (int v : list) std::cout << " " << v;
}

int main() {
    int n, m;
    std::cin >> n >> m;
    std::vector<std::vector<int>> adj(n + 1);  // 節點 1..n，索引 0 不用
    for (int i = 0; i < m; ++i) {
        int u, v;
        std::cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);  // 無向圖：反向也要加
    }
    for (int u = 1; u <= n; ++u) {
        std::vector<int> sorted = adj[u];  // 複製一份再排序，原串列保持讀入順序
        std::sort(sorted.begin(), sorted.end());
        std::cout << u << ":";
        printList(adj[u]);
        std::cout << " | sorted:";
        printList(sorted);
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`import sys

data = sys.stdin.read().split()
n, m = int(data[0]), int(data[1])
adj = [[] for _ in range(n + 1)]  # 節點 1..n，索引 0 不用
for i in range(m):
    u, v = int(data[2 + 2 * i]), int(data[3 + 2 * i])
    adj[u].append(v)
    adj[v].append(u)  # 無向圖：反向也要加
for u in range(1, n + 1):
    in_order = " ".join(map(str, adj[u])) or "-"
    by_value = " ".join(map(str, sorted(adj[u]))) or "-"
    print(f"{u}: {in_order} | sorted: {by_value}")`,
        Java: code`import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Scanner;

public class Main {
    static String join(List<Integer> list) {
        if (list.isEmpty()) return "-";
        StringBuilder sb = new StringBuilder();
        for (int v : list) sb.append(sb.length() > 0 ? " " : "").append(v);
        return sb.toString();
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), m = sc.nextInt();
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i <= n; i++) adj.add(new ArrayList<>());  // 節點 1..n，索引 0 不用
        for (int i = 0; i < m; i++) {
            int u = sc.nextInt(), v = sc.nextInt();
            adj.get(u).add(v);
            adj.get(v).add(u);  // 無向圖：反向也要加
        }
        for (int u = 1; u <= n; u++) {
            List<Integer> sorted = new ArrayList<>(adj.get(u));  // 複製一份再排序
            Collections.sort(sorted);
            System.out.println(u + ": " + join(adj.get(u)) + " | sorted: " + join(sorted));
        }
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = data[0], m = data[1];
const adj = Array.from({ length: n + 1 }, () => []);  // 節點 1..n，索引 0 不用
for (let i = 0; i < m; i++) {
    const u = data[2 + 2 * i], v = data[3 + 2 * i];
    adj[u].push(v);
    adj[v].push(u);  // 無向圖：反向也要加
}
const join = list => (list.length > 0 ? list.join(" ") : "-");
for (let u = 1; u <= n; u++) {
    const sorted = [...adj[u]].sort((a, b) => a - b);  // 複製一份再排序，原串列保持讀入順序
    console.log(u + ": " + join(adj[u]) + " | sorted: " + join(sorted));
}`,
      },
    },
  ],
  visualization: {
    kind: 'graph-traversal', title: '由邊串列建立無向圖的鄰接串列，查詢鄰居與度數', language: 'Python',
    code: code`n = 6
edges = [(0, 1), (0, 2), (1, 2), (2, 3), (3, 4)]
adj = [[] for _ in range(n)]
for u, v in edges:
    adj[u].append(v)
    adj[v].append(u)
print(adj[2], len(adj[2]))
print(adj[5], len(adj[5]))`,
    steps: [
      { line: 3, note: '先為 6 個節點各建一個空串列（第 3 行）。這時還沒有任何邊，每個節點的度數都是 0。注意要用串列生成式，`[[]] * n` 會讓 6 個節點共用同一個串列。',
        graph: { name: 'adj', nodes, edges: [], directed: false, marks: [], show: ['list'] }, vars: degreeVars([]) },
      ...simulated,
    ],
  },
  quiz: [
    {
      id: 'q-handshake', prompt: '一張無向圖有 7 個節點，度數分別是 3、3、2、2、2、1、1。這張圖有幾條邊？',
      options: ['7', '14', '6', '條件矛盾，不存在這樣的圖'],
      answer: 0, explanation: '握手定理：度數總和 = 2E。3 + 3 + 2 + 2 + 2 + 1 + 1 = 14，所以 E = 14 / 2 = 7。14 是度數總和，忘了每條邊被兩個端點各算一次；6 是把節點數減 1，那是樹的邊數，題目沒說是樹。度數總和是偶數，這樣的圖確實存在（例如 0–1、0–2、0–3、1–4、1–5、2–6、3–4）；只有總和是奇數時才不可能。',
    },
    {
      id: 'q-directed', prompt: '下列哪一種關係最適合用有向圖（directed graph）表示？',
      options: ['臉書好友（雙方都同意才成立）', 'Instagram 的追蹤（A 追蹤 B，B 不一定追蹤 A）', '兩個城市之間的雙向道路', '分子中兩個原子之間的化學鍵'],
      answer: 1, explanation: '追蹤關係沒有對稱性：A → B 存在時 B → A 不一定存在，必須用有向邊才能區分。好友、雙向道路與化學鍵都是對稱的關係，用無向邊即可；硬用有向圖也可以（每條關係存兩個方向），但那正是無向圖在程式裡的存法，不是需要有向圖的理由。',
    },
    {
      id: 'q-one-based', prompt: '下面的 Python 程式讀入節點編號為 1..n 的無向圖，輸入是 `3 2`、`1 2`、`2 3` 三行。執行時會發生什麼？',
      code: { language: 'Python', text: 'n, m = map(int, input().split())\nadj = [[] for _ in range(n)]\nfor _ in range(m):\n    u, v = map(int, input().split())\n    adj[u].append(v)\n    adj[v].append(u)' },
      options: ['正常執行，adj 正確存下兩條邊', '處理第二條邊 `2 3` 時，`adj[3]` 丟出 `IndexError`', '處理第一條邊 `1 2` 時就丟出 `IndexError`', '不會出錯，但節點 3 的鄰居被存進 `adj[0]`'],
      answer: 1, explanation: '`adj` 只有索引 0、1、2。第一條邊用到 `adj[1]`、`adj[2]`，都在範圍內，不會出錯（但節點 1 的資料其實放在「第 2 格」，索引 0 沒用到）。第二條邊執行 `adj[2].append(3)` 之後，`adj[3].append(2)` 越界，丟出 `IndexError`。Python 的正索引越界一定報錯，不會繞回 `adj[0]`；只有負索引（例如把 0 減 1 得到 -1）才會悄悄存到最後一格。修正：配置 `n + 1` 個串列，或讀入後 `u -= 1`、`v -= 1`。',
    },
    {
      id: 'q-neighbours', prompt: '下面的 C++ 程式印出什麼？',
      code: { language: 'C++', text: 'std::vector<std::vector<int>> adj(4);\nint edges[][2] = {{2, 1}, {0, 1}, {1, 3}, {3, 0}};\nfor (auto& e : edges) {\n    adj[e[0]].push_back(e[1]);\n    adj[e[1]].push_back(e[0]);\n}\nfor (int v : adj[1]) std::cout << v << " ";' },
      options: ['0 2 3', '2 0 3', '3', '2 0 3 0'],
      answer: 1, explanation: '依序處理每條邊：(2, 1) 把 2 加進 `adj[1]`；(0, 1) 把 0 加進 `adj[1]`；(1, 3) 把 3 加進 `adj[1]`；(3, 0) 和節點 1 無關。所以 `adj[1]` 是 2、0、3，依加入的先後排列。鄰接串列不會自動排序，「0 2 3」是排序後的結果；「3」是只看 u = 1 的那條邊、忘了反向邊也會加進來；邊 (3, 0) 不含節點 1，不會多出一個 0。',
    },
    {
      id: 'q-reverse-edge', prompt: '下面的 Java 程式想建立一張無向圖（邊 0–1、1–2）並印出節點 2 的度數與節點 1 的鄰居。實際印出什麼？',
      code: { language: 'Java', text: 'List<List<Integer>> adj = new ArrayList<>();\nfor (int i = 0; i < 3; i++) adj.add(new ArrayList<>());\nint[][] edges = {{0, 1}, {1, 2}};\nfor (int[] e : edges) adj.get(e[0]).add(e[1]);\nSystem.out.println(adj.get(2).size() + " " + adj.get(1));' },
      options: ['1 [0, 2]', '0 [2]', '0 [0, 2]', '丟出 IndexOutOfBoundsException'],
      answer: 1, explanation: '迴圈只執行 `adj.get(e[0]).add(e[1])`，只存了 0 → 1 與 1 → 2 兩個方向：`adj[1]` 是 [2]，`adj[2]` 是空的，所以印出 `0 [2]`。這就是忘了反向邊：無向圖要再加 `adj.get(e[1]).add(e[0])`，修正後才會得到原本想要的 `1 [0, 2]`。三個內層串列都已建立，索引 0..2 都合法，不會丟出例外。',
    },
    {
      id: 'q-tree', prompt: '一張無向圖有 6 個節點 0..5，邊是 (0, 1)、(1, 2)、(0, 2)、(3, 4)、(4, 5)。它是不是一棵樹？',
      options: ['是，因為邊數 5 = n − 1', '不是：0–1–2–0 是環，而且 {0, 1, 2} 與 {3, 4, 5} 之間不連通', '是，因為沒有自環也沒有重邊', '不是，因為 6 個節點的樹必須有 6 條邊'],
      answer: 1, explanation: '樹要「連通而且沒有環」。這張圖的 (0, 1)、(1, 2)、(0, 2) 圍成環，兩個連通塊之間也沒有邊，兩個條件都不成立。只看邊數 = n − 1 不夠：必須再加上「連通」或「無環」其中一個條件才能確定是樹。沒有自環、重邊只代表是簡單圖；n 個節點的樹是 n − 1 條邊，不是 n 條。',
    },
  ],
  exercises: [
    {
      id: 'e-degrees', title: '計算度數與度數最大的節點',
      statement: '給一張無向圖，節點編號 1..n，接著有 m 條邊，每條邊以兩個整數 u v 表示。請輸出每個節點的度數，以及度數最大的節點；有多個節點的度數同樣最大時，選編號最小的那個。度數的算法：重邊每一條都要算；自環 u u 讓節點 u 的度數加 2（它的兩個端點都是 u，這樣握手定理「度數總和 = 2m」仍然成立）。輸入有誤時只輸出一行 `Invalid`，不輸出任何其他內容：任何一個端點不在 1..n 的範圍內（例如誤用 0-based 編號），或輸入在讀完 m 條邊之前就結束了。',
      inputFormat: '第一行兩個整數 n 與 m。接下來應該有 m 行，每行兩個整數 u v，表示 u 與 v 之間有一條無向邊。',
      outputFormat: '輸入正確時輸出兩行：第一行 n 個整數，依序是節點 1..n 的度數，以一個空白分隔；第二行兩個整數，度數最大的節點編號與它的度數。輸入有誤時只輸出 `Invalid`。',
      constraints: ['1 ≤ n ≤ 2 × 10^5', '0 ≤ m ≤ 2 × 10^5', '-10^9 ≤ u, v ≤ 10^9（不在 1..n 時要輸出 `Invalid`）', '第一行的 n、m 一定存在且合法', '可能有自環與重邊'],
      samples: [
        { kind: 'normal', input: '5 5\n1 2\n1 3\n2 3\n3 4\n4 5', output: '2 2 3 2 1\n3 3', note: '節點 3 連到 1、2、4，度數 3 最大；度數總和 10 = 2 × 5' },
        { kind: 'edge', input: '3 2\n2 2\n1 3', output: '1 2 1\n2 2', note: '自環 2 2 讓節點 2 的度數加 2，2 是唯一度數最大的節點' },
      ],
      tests: [
        { kind: 'normal', input: '5 5\n1 2\n1 3\n2 3\n3 4\n4 5', output: '2 2 3 2 1\n3 3', note: '範例' },
        { kind: 'normal', input: '4 4\n1 2\n2 3\n3 4\n4 1', output: '2 2 2 2\n1 2', note: '環上每個節點度數都是 2，並列時選編號最小的 1' },
        { kind: 'normal', input: '6 5\n4 1\n4 2\n4 3\n4 5\n4 6', output: '1 1 1 5 1 1\n4 5', note: '星形：中心節點 4 的度數是 n − 1' },
        { kind: 'normal', input: '5 3\n2 5\n5 3\n2 4', output: '0 2 1 1 2\n2 2', note: '節點 1 是孤立點；2 與 5 並列最大，選 2' },
        { kind: 'edge', input: '3 0', output: '0 0 0\n1 0', note: 'm = 0：沒有邊，所有度數都是 0，最大的是節點 1' },
        { kind: 'edge', input: '1 0', output: '0\n1 0', note: '只有一個節點' },
        { kind: 'edge', input: '3 2\n2 2\n1 3', output: '1 2 1\n2 2', note: '自環算度數 2' },
        { kind: 'edge', input: '3 3\n1 2\n2 1\n1 2', output: '3 3 0\n1 3', note: '重邊：同一對節點的 3 條邊都要算，寫成 2 1 也是同一對' },
        { kind: 'edge', input: '2 3\n1 1\n1 1\n1 2', output: '5 1\n1 5', note: '兩個自環加一條邊：2 + 2 + 1 = 5；度數總和 6 = 2 × 3' },
        { kind: 'edge', input: '4 2\n4 4\n1 4', output: '1 0 0 3\n4 3', note: '用到編號 n 本身：陣列要能放到索引 n' },
        { kind: 'error', input: '3 2\n1 2\n2 4', output: 'Invalid', note: '節點 4 超過 n = 3' },
        { kind: 'error', input: '3 2\n0 1\n1 2', output: 'Invalid', note: '節點 0 不在 1..n：輸入用了 0-based 編號' },
        { kind: 'error', input: '3 1\n-1 2', output: 'Invalid', note: '負的節點編號' },
        { kind: 'error', input: '4 3\n1 2\n2 3', output: 'Invalid', note: '說有 3 條邊，只給了 2 行' },
        { kind: 'error', input: '3 2\n1 2\n3', output: 'Invalid', note: '最後一條邊只有一個端點' },
      ],
      hints: [
        '只需要度數時不必建鄰接串列：開一個長度 n + 1 的整數陣列（索引 0 不用），每讀一條邊 (u, v) 就讓 `degree[u]` 與 `degree[v]` 各加 1。自環 u = v 會剛好加兩次，符合題目的規則。',
        '先讀完並檢查全部的邊，確定沒有錯誤之後才輸出；否則前面已經印出的度數會和 `Invalid` 混在一起。',
        '偵測「輸入提早結束」：C++ 檢查 `std::cin >> u >> v` 是否成功；Python 與 JavaScript 一次讀入所有數字，看數量是否至少 2 + 2m；Java 的讀取函式在檔尾回傳 null。',
        '找最大值時只在「嚴格大於」目前最大值時才更新，就會自然留下編號最小的那個。',
        'n、m 到 2 × 10^5：每條邊 O(1)，總共 O(n + m)。Java 用 `BufferedReader` 讀入、`StringBuilder` 組合輸出，比 `Scanner` 與逐次 `print` 快得多。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n, m;
    std::cin >> n >> m;
    std::vector<int> degree(n + 1, 0);  // 節點 1..n，索引 0 不用
    for (int i = 0; i < m; ++i) {
        long long u, v;
        if (!(std::cin >> u >> v) || u < 1 || u > n || v < 1 || v > n) {  // 少了邊，或端點越界
            std::cout << "Invalid\n";
            return 0;
        }
        ++degree[u];
        ++degree[v];  // 自環 u == v 會加兩次
    }
    int best = 1;
    for (int v = 1; v <= n; ++v) {
        if (degree[v] > degree[best]) best = v;  // 嚴格大於：並列時保留編號小的
        std::cout << degree[v] << (v < n ? " " : "\n");
    }
    std::cout << best << " " << degree[best] << "\n";
    return 0;
}`,
        Python: code`import sys


def main():
    data = sys.stdin.read().split()
    n, m = int(data[0]), int(data[1])
    if len(data) < 2 + 2 * m:  # 輸入在讀完 m 條邊之前就結束了
        print("Invalid")
        return
    degree = [0] * (n + 1)  # 節點 1..n，索引 0 不用
    for i in range(m):
        u, v = int(data[2 + 2 * i]), int(data[3 + 2 * i])
        if not (1 <= u <= n and 1 <= v <= n):
            print("Invalid")
            return
        degree[u] += 1
        degree[v] += 1  # 自環 u == v 會加兩次
    best = 1
    for v in range(2, n + 1):
        if degree[v] > degree[best]:  # 嚴格大於：並列時保留編號小的
            best = v
    print(" ".join(map(str, degree[1:])))
    print(best, degree[best])


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringTokenizer;

public class Main {
    static BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    static StringTokenizer st = new StringTokenizer("");

    static String next() throws IOException {  // 下一個數字；輸入結束時回傳 null
        while (!st.hasMoreTokens()) {
            String line = br.readLine();
            if (line == null) return null;
            st = new StringTokenizer(line);
        }
        return st.nextToken();
    }

    public static void main(String[] args) throws IOException {
        int n = Integer.parseInt(next()), m = Integer.parseInt(next());
        int[] degree = new int[n + 1];  // 節點 1..n，索引 0 不用
        for (int i = 0; i < m; i++) {
            String a = next(), b = next();
            if (a == null || b == null) {  // 少了邊
                System.out.println("Invalid");
                return;
            }
            long u = Long.parseLong(a), v = Long.parseLong(b);
            if (u < 1 || u > n || v < 1 || v > n) {
                System.out.println("Invalid");
                return;
            }
            degree[(int) u]++;
            degree[(int) v]++;  // 自環 u == v 會加兩次
        }
        StringBuilder out = new StringBuilder();
        int best = 1;
        for (int v = 1; v <= n; v++) {
            if (degree[v] > degree[best]) best = v;  // 嚴格大於：並列時保留編號小的
            out.append(degree[v]).append(v < n ? " " : "\n");
        }
        out.append(best).append(" ").append(degree[best]).append("\n");
        System.out.print(out);
    }
}`,
        JavaScript: code`function main() {
    const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
    const n = data[0], m = data[1];
    if (data.length < 2 + 2 * m) {  // 輸入在讀完 m 條邊之前就結束了
        console.log("Invalid");
        return;
    }
    const degree = new Array(n + 1).fill(0);  // 節點 1..n，索引 0 不用
    for (let i = 0; i < m; i++) {
        const u = data[2 + 2 * i], v = data[3 + 2 * i];
        if (u < 1 || u > n || v < 1 || v > n) {
            console.log("Invalid");
            return;
        }
        degree[u]++;
        degree[v]++;  // 自環 u === v 會加兩次
    }
    let best = 1;
    for (let v = 2; v <= n; v++) {
        if (degree[v] > degree[best]) best = v;  // 嚴格大於：並列時保留編號小的
    }
    console.log(degree.slice(1).join(" "));
    console.log(best + " " + degree[best]);
}

main();`,
      },
      judge: 'none',
    },
  ],
};

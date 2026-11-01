import type { LessonContent, TraceStep } from '../schema';
import { dfsSteps } from '../simulate-algorithms';

const code = String.raw;

/**
 * The visualization's graph: A–B–D–C–A is a cycle (so C is pushed twice, by A and by D), D–E hangs off it, and F–G is
 * a second component that a DFS from A never reaches. The adjacency lists follow the edge order, as dfsSteps builds
 * them, and match the `graph` dict of the trace code.
 */
const NODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const EDGES = [
  { from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' },
  { from: 'C', to: 'D' }, { from: 'D', to: 'E' }, { from: 'F', to: 'G' },
];

/**
 * dfsSteps runs the trace code's algorithm: pop, skip a node that is already visited, mark it, push its unvisited
 * neighbours in reverse order. Its 'visit' step shows the stack after the pushes, so a visit that pushed something
 * points at the push on line 13 and one that pushed nothing at the marking on line 9.
 */
const traceSteps: TraceStep[] = dfsSteps(NODES, EDGES, false, 'A', { init: 4, skip: 8, visit: 9, result: 14 }).map((step, k, all): TraceStep => {
  if (k === all.length - 1) return { ...step, note: `${step.note}遞迴版從 A 出發也是 A → B → D → C → E：反序放入鄰居，堆疊版就和遞迴版的順序相同。` };
  if (step.line !== 9) return step;
  if (step.note.includes('（沒有）')) return { ...step, note: `${step.note.split('；')[0]}；它的鄰居都已經拜訪過，沒有東西要放進堆疊，這條路走到底了，下一輪會從堆疊頂端「回頭」。` };
  const items = step.containers?.[0]?.items ?? [];
  const twice = items.find((x, i) => items.indexOf(x) !== i);
  return { ...step, line: 13, note: twice ? `${step.note}${twice} 這時在堆疊裡有兩份：較早放入的在下面，剛放入的在頂端，會先被取出；較早那份之後取出時已經拜訪過，會被略過。` : step.note };
});

/** Exercise worst cases, generated here (each input stays near 1 MB, the test runner's comfortable size). */
const SNAKE = 1000;
/** Even rows are all land; odd rows keep one land cell, alternately at the right and the left end: one long snake. */
const snakeRows = Array.from({ length: SNAKE }, (_, r) => r % 2 === 0 ? '#'.repeat(SNAKE) : r % 4 === 1 ? `${'.'.repeat(SNAKE - 1)}#` : `#${'.'.repeat(SNAKE - 1)}`);
const snakeInput = `${SNAKE} ${SNAKE}\n${snakeRows.join('\n')}`;
/** 500 full rows of 1000 plus 500 single connecting cells; checked against the reference and a union-find counter. */
const snakeOutput = `1 ${(SNAKE / 2) * SNAKE + SNAKE / 2}`;
const BOARD = 700;
/** A checkerboard: land where r + c is even. Every land cell touches others only diagonally, so each is its own island. */
const boardInput = `${BOARD} ${BOARD}\n${Array.from({ length: BOARD }, (_, r) => Array.from({ length: BOARD }, (_, c) => (r + c) % 2 === 0 ? '#' : '.').join('')).join('\n')}`;
const boardOutput = `${Math.ceil((BOARD * BOARD) / 2)} 1`;

/** A15 DFS. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const A15: LessonContent = {
  lessonId: 'A15',
  motivation: '走迷宮時，一個常見的策略是：每到岔路就挑一條還沒走過的路一直走，走到死路再退回上一個岔路口換另一條。深度優先搜尋（depth-first search，DFS）就是把這個策略用在圖上。它回答「從這裡走得到哪些地方」：社群網路中誰和誰間接相連、地圖上有幾座島、每座島有多大、一張圖有沒有環、油漆桶工具一次會塗滿哪一塊區域。DFS 只需要一個拜訪標記和一個堆疊（遞迴時就是呼叫堆疊），每個點、每條邊各處理常數次，總共 O(V + E)，寫起來也很短。它的限制也很明確：DFS 走出來的路不一定最短，求無權圖的最短距離要用 BFS（A14）；遞迴版在長鏈或大面積的格子上會遞迴幾十萬層，超過 Python 的遞迴上限或 C++／Java 的堆疊大小；如果邊是陸續加入、查詢穿插其中，並查集（D18）比每次重做 DFS 合適。',
  sections: [
    {
      id: 'idea', title: '核心想法：一路走到底，再回頭',
      blocks: [
        { type: 'p', text: 'DFS 從起點出發，每次都往「還沒拜訪過的鄰居」走深一層；當目前的點所有鄰居都拜訪過了，就退回上一個點，看它還有沒有別的鄰居可走。退回去的動作叫回溯（backtracking），和 A12 的回溯法是同一個意思：這條路走完了，回到上一個選擇點換下一個選擇。' },
        { type: 'list', items: [
          '標記 u 已拜訪（visited），並記錄它（例如加進拜訪順序）。',
          '依照鄰接串列的順序看 u 的每個鄰居 v。',
          '如果 v 還沒拜訪，就從 v 重複整個過程（走深一層），並記下 `parent[v] = u`。',
          'u 的鄰居都看完了，就回到把 u 帶進來的那個點（回頭）。',
        ] },
        { type: 'p', text: '「最近走進的岔路口最先回去」正是後進先出（LIFO），所以 DFS 背後是一個堆疊（stack，D05）。用遞迴（F18）寫時，呼叫堆疊自動記住「要回到哪裡、看到第幾個鄰居」；不用遞迴時，就自己用一個堆疊來記。這也是 DFS 和 BFS（A14）唯一的本質差別：BFS 用佇列，先拜訪離起點近的點；DFS 用堆疊，先往深處走。' },
        { type: 'p', text: '拜訪標記不能省。圖可能有環（cycle），例如下方視覺化中的 A – B – D – C – A：沒有標記時，從 A 走到 B、D、C，C 又會走回 A，永遠繞不完。有了標記，每個點只會被「拜訪」一次，DFS 一定會停，而且停下來時，從起點走得到的點全部都被拜訪過：如果某個走得到的點 w 沒被拜訪，沿著起點到 w 的路，一定有第一個沒被拜訪的點，但它前一個點被拜訪過、檢查過所有鄰居，不可能漏掉它，矛盾。' },
        { type: 'p', text: 'DFS 跑完可以得到：從起點走得到的所有點（也就是起點所在的連通塊，connected component，也叫連通元件）、每個點的 `parent`（它們組成一棵 DFS 樹）、拜訪順序。圖的表示法沿用 D17 的鄰接串列：無向邊 u – v 兩個方向都要加，拜訪順序取決於鄰接串列裡鄰居的順序。' },
      ],
    },
    {
      id: 'two-versions', title: '遞迴版與堆疊版：為什麼順序可能不同',
      blocks: [
        { type: 'p', text: '遞迴版最接近定義：`dfs(u)` 先標記 u，再對每個沒拜訪的鄰居 v 設 `parent[v] = u` 並呼叫 `dfs(v)`。呼叫返回就是「回頭」。下面的範例在同一張 7 個點的圖上，比較遞迴版和兩種堆疊版的拜訪順序。' },
        { type: 'example', id: 'dfs-orders' },
        { type: 'p', text: '遞迴版從 0 走到 1、3，再從 3 走到 2；2 的鄰居 0、3 都拜訪過了，於是往 5、6 走；6 是死路，回到 5、回到 2、回到 3，3 還有沒走過的 4。所以順序是 `0 1 3 2 5 6 4`。parent 陣列記下每個點是從誰走進來的，沿著 parent 從 2 倒推回 0，得到 DFS 樹上的路 `0 1 3 2`：走了 3 條邊，但圖中明明有邊 0 – 2。DFS 走到一個點的路不一定最短，這點在最後一節還會再談。' },
        { type: 'p', text: '堆疊版：`stack = [start]`；每次取出（pop）堆疊頂端的 u，如果 u 已拜訪就跳過，否則標記它，再把還沒拜訪的鄰居放進（push）堆疊。為什麼取出時要再檢查一次？因為同一個點可能在被拜訪之前被放進堆疊好幾次：範例中 0 放進 2 之後，3 又放進一次 2。第二次放進的那個先被取出，於是 2 的 parent 是 3（和遞迴版相同）；之後取到較早那份 2 時，它已經拜訪過了，直接跳過。' },
        { type: 'p', text: '順序為什麼可能不同？堆疊後進先出，最後放進去的鄰居最先被取出。0 的鄰居依序是 1、2，照順序放進去，2 在頂端，先拜訪 2，所以「照順序放入」得到 `0 2 5 6 3 4 1`，和遞迴版不同；它仍然是一個合法的 DFS（一路走到底再回頭），只是每個點看鄰居的順序反過來了。要和遞迴版完全一樣，就把鄰居反序放入：第一個鄰居最後放、最先取出，正是遞迴版下一個要走進去的點，而遞迴版會跳過的已拜訪點，堆疊版取出時也會跳過，所以得到 `0 1 3 2 5 6 4`。' },
        { type: 'callout', tone: 'tip', title: '只要「走得到哪些點」時，可以在放入時就標記', text: '數連通塊、算面積這類問題不在乎拜訪順序，常見的寫法是「放進堆疊時就標記」：每個點最多進堆疊一次，堆疊不超過 V 個元素，也不需要取出時的檢查。代價是拜訪順序不再和遞迴版相同（它不是嚴格的 DFS 順序），所以要求「DFS 順序」或「DFS 樹」時，用取出時才標記的寫法。兩種寫法都對，錯的是混在一起：取出時才標記、取出時卻不檢查，同一個點會被處理好幾次（測驗中有一題）。' },
        { type: 'p', text: '下方的視覺化跑的就是反序放入、取出時檢查的堆疊版：A 的鄰居 B、C 反序放入，先取出 B；D 放進 C 和 E 之後，堆疊裡有兩份 C；第二份先被取出並拜訪（parent 是 D），最後取到第一份 C 時跳過。F、G 是另一個連通塊，從 A 出發永遠走不到。「自己試試看」可以換一個起點，觀察堆疊與拜訪順序（例如從 F 出發只會走到 F、G）。' },
      ],
    },
    {
      id: 'components-grid', title: '連通塊計數與格子上的 flood fill',
      blocks: [
        { type: 'p', text: '一次 DFS 只會拜訪起點所在的連通塊。要數整張圖有幾個連通塊，就依序檢查每個點：還沒拜訪過的點代表一個新的連通塊，從它做一次 DFS，把整塊標上同一個編號並數出大小。雖然 DFS 做了好幾次，但每個點只會被標記一次、每條邊只會從兩端各看一次，總時間仍然是 O(V + E)。' },
        { type: 'example', id: 'components' },
        { type: 'p', text: '10 個點、7 條邊：0 – 1 – 2 – 0 是一個環，3 – 4 一組，5 到 8 連成一串，9 沒有任何邊。外層迴圈依序在 0、3、5、9 發現新的連通塊，所以有 4 個。注意 9：外層迴圈要走過「每個點」，而不是「每條邊的端點」，否則孤立點（isolated vertex）會被漏掉。大小依發現順序是 `3 2 4 1`，題目要求排序輸出時要另外排序；`label` 陣列讓之後判斷「u 和 v 是否相連」只要 O(1)：比較 `label[u] == label[v]`。' },
        { type: 'p', text: '二維格子（grid）也是一張圖：每一格是一個點，上下左右相鄰的兩格陸地之間有一條邊（4 方向相鄰）。不需要真的建鄰接串列，用方向陣列 `dr = [-1, 1, 0, 0]`、`dc = [0, 0, -1, 1]` 就能算出四個鄰居。從一格陸地出發，把整塊相連的陸地都塗上記號，叫做 flood fill（洪水填充，繪圖軟體的油漆桶就是它）。數島嶼就是數「外層掃描時遇到幾次還沒塗過的陸地」，每次 flood fill 數到的格數就是那座島的面積。' },
        { type: 'example', id: 'grid-islands' },
        { type: 'p', text: '外層依列、行的順序掃描，遇到 (0, 0) 時塗滿第 1 座島（3 格），遇到 (0, 4) 時塗滿第 2 座。(2, 2) 和 (3, 1) 只有斜角相接，4 方向相鄰不算相連，所以 (2, 2) 自己是一座面積 1 的島。如果題目說 8 方向相鄰（斜角也算），只要把方向陣列擴充成 8 個。檢查鄰居時一定先確認 `0 <= nx < R` 和 `0 <= ny < C`，再讀 `grid[nx][ny]`。另一種常見寫法是不用 `seen` 陣列，直接把走過的陸地改成水（「淹掉」），省記憶體，但會改到原本的地圖，之後還要用就先複製一份。' },
        { type: 'p', text: 'DFS 也能判斷無向圖有沒有環：DFS 從 u 看鄰居 v 時，如果 v 已經拜訪過，而且 v 不是 u 的 parent，就找到了一個環。要排除 parent，是因為無向邊 u – v 同時存在 u 和 v 的串列裡，從 v 走到 u 後回頭看見 v 只是同一條邊，不是環。如果同一對點之間可能有兩條邊（重邊），兩條邊本身就是一個環，這時要記「從哪一條邊進來」而不是從哪個點。另一個判斷法：一個連通塊有 k 個點，邊數至少 k 條就一定有環（沒有環的連通圖是樹，恰好 k − 1 條邊）。有向圖的環要看箭頭方向，需要區分「正在遞迴中」與「已經結束」兩種已拜訪狀態，本課不展開。' },
      ],
    },
    {
      id: 'complexity-depth', title: '時間、空間與遞迴深度',
      blocks: [
        { type: 'p', text: '用鄰接串列時，每個點被標記並展開一次，展開時掃過它的整個鄰接串列；所有串列的長度總和是 E（有向圖）或 2E（無向圖），所以時間是 O(V + E)。取出時才檢查的堆疊版中，一個點可能被放進堆疊好幾次，但每次放入都對應一條被掃過的邊，放入的總次數不超過 2E，時間仍是 O(V + E)。' },
        { type: 'table', head: ['情況', '時間', '額外空間', '說明'], rows: [
          ['鄰接串列', 'O(V + E)', 'O(V)（標記）＋堆疊', '最常用'],
          ['鄰接矩陣（D17）', 'O(V²)', 'O(V) ＋堆疊', '找 u 的鄰居要掃整列 V 格'],
          ['R × C 格子', 'O(RC)', 'O(RC)', '每格最多 4 個鄰居，E ≤ 2RC'],
          ['堆疊：放入時標記', '—', '最多 V 個元素', '每個點只進堆疊一次'],
          ['堆疊：取出時才標記', '—', '最多約 E 個元素', '同一個點可能重複放入'],
          ['遞迴版', '—', '呼叫深度最深可達 V 層', '每層一個堆疊框架（frame）'],
        ] },
        { type: 'p', text: '遞迴的深度等於 DFS 樹上目前這條路的長度。一條 10^5 個點的長鏈（path graph）0 – 1 – 2 – …，從 0 出發會一路遞迴 10^5 層才開始回頭；1000 × 1000 的格子如果是一條蛇形的島（練習題就有這筆測資），一次 flood fill 會遞迴約 5×10^5 層，整片陸地時也可能深達數十萬層。' },
        { type: 'callout', tone: 'warning', title: '遞迴太深：Python RecursionError，C++／Java 堆疊溢位', text: 'Python 預設的遞迴上限是 1000 層（`sys.getrecursionlimit()`），長鏈上的遞迴 DFS 走不到第 1000 個點就丟出 `RecursionError`；用 `sys.setrecursionlimit` 調高上限，可能讓直譯器自己的堆疊溢位而直接當掉，不是可靠的解法。C++ 每一層呼叫佔用一塊堆疊框架，常見的預設堆疊大小只有幾 MB（Linux 上常見 8 MB，Windows 常見 1 MB），幾十萬層就可能用完，程式以 segmentation fault 結束，沒有任何錯誤訊息。Java 會丟出 `StackOverflowError`。資料範圍讓 DFS 可能很深時（V 達到 10^4 以上、或格子可能有大片相連區域），就改用堆疊版：C++ 用 `std::vector`、Python 用 `list` 的 `append`／`pop`、Java 用 `int[]` 或 `ArrayDeque`，它們放在堆積（heap）上，大小只受記憶體限制。' },
        { type: 'p', text: 'Java 的舊類別 `java.util.Stack` 繼承自同步化的 `Vector`，官方文件建議改用 `Deque` 介面（例如 `ArrayDeque`）。存大量整數時，`ArrayDeque<Integer>` 要把每個 `int` 包裝成物件，用一個 `int[]` 加一個指標自己當堆疊會更快、更省記憶體，練習題的 Java 解答就是這樣做。' },
      ],
    },
    {
      id: 'compare', title: '和 BFS、並查集比較，以及常見錯誤',
      blocks: [
        { type: 'p', text: 'BFS（A14）和 DFS 都能在 O(V + E) 內找出起點走得到的所有點，也都能數連通塊、做 flood fill，這時兩者都可以，選順手的即可。差別在順序：BFS 一層一層往外，第一次拜訪某個點時走的就是邊數最少的路；DFS 一路往深處走，第一次到達某個點的路可能繞了遠路。範例中 DFS 樹到 2 的路是 `0 1 3 2`，BFS 會直接走 0 – 2。所以「最少要走幾步」「最短路徑」一定用 BFS，不能用 DFS。' },
        { type: 'table', head: ['需求', 'DFS', 'BFS（A14）', '並查集（D18）'], rows: [
          ['從起點走得到哪些點', '可以', '可以', '可以（同組的點）'],
          ['連通塊數量與大小', '可以，O(V + E)', '可以，O(V + E)', '可以，邊逐條加入也行'],
          ['無權圖的最短距離、最短路徑', '不行', '可以', '不行'],
          ['邊陸續加入、查詢穿插其中', '每次重做太慢', '每次重做太慢', '最適合，每次約 O(α(n))'],
          ['列出一條路徑', 'parent 倒推（不一定最短）', 'parent 倒推（最短）', '做不到'],
          ['遞迴寫法的深度風險', '有（改用堆疊版）', '沒有（佇列）', '沒有（迭代 find）'],
        ] },
        { type: 'list', items: [
          '忘了拜訪標記，或在錯的地方標記：有環的圖會無限循環；取出時才標記卻沒有檢查，同一個點會被處理好幾次。',
          '數連通塊時只從邊的端點出發：孤立點也是一個連通塊，外層迴圈要走過每個點。',
          '點的編號從 1 開始（1 到 n），陣列卻只開 n 格：`visited[n]` 越界。開 n + 1 格，索引 0 不用。',
          '無向邊只加了一個方向：從 v 走不到 u，連通塊被拆成好幾塊。',
          '格子沒有先檢查邊界就讀鄰居；或把 R、C 弄反（列數是 R、行數是 C）。',
          '以為 DFS 走到終點的路就是最短路徑。',
        ] },
        { type: 'callout', tone: 'warning', title: 'Python 的負索引不會報錯', text: 'C++ 讀 `grid[-1]` 是未定義行為，Java 會丟出 `ArrayIndexOutOfBoundsException`，至少讓你知道出錯了；Python 的 `grid[-1]` 卻是合法的「最後一列」，`grid[r][-1]` 是那一列的最後一格。只檢查 `nx < R` 而忘了 `nx >= 0` 時，第 0 列的陸地會被當成和最後一列相連，島嶼數默默變少，程式不會報錯。邊界條件要上下界一起寫：`0 <= nx < R and 0 <= ny < C`。' },
      ],
    },
  ],
  examples: [
    {
      id: 'dfs-orders', title: '遞迴版與兩種堆疊版的拜訪順序', description: '7 個點、7 條無向邊（0 – 1 – 3 – 2 – 0 是一個環）。印出遞迴 DFS 的順序與 parent、沿 parent 倒推到 2 的路，以及反序放入與照順序放入的堆疊版順序。',
      output: 'recursive: 0 1 3 2 5 6 4\nparent: -1 0 3 1 3 2 5\ntree path to 2: 0 1 3 2\nstack, reversed push: 0 1 3 2 5 6 4\nstack, plain push: 0 2 5 6 3 4 1',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <utility>
#include <vector>

std::vector<std::vector<int>> adj;
std::vector<bool> visited;
std::vector<int> parent, order;

// 遞迴版：標記自己，再依序走進每個還沒拜訪的鄰居。
void dfs(int u) {
    visited[u] = true;
    order.push_back(u);
    for (int v : adj[u]) {
        if (!visited[v]) {
            parent[v] = u;
            dfs(v);  // 走深一層；返回時就是「回頭」
        }
    }
}

// 堆疊版：取出時才檢查與標記；reverse 為 true 時把鄰居反序放入。
std::vector<int> dfsStack(int start, bool reverse) {
    std::vector<bool> seen(adj.size(), false);
    std::vector<int> result, stack = {start};
    while (!stack.empty()) {
        int u = stack.back();
        stack.pop_back();
        if (seen[u]) continue;  // 同一個點可能被放進堆疊不只一次
        seen[u] = true;
        result.push_back(u);
        std::vector<int> next;
        for (int v : adj[u])
            if (!seen[v]) next.push_back(v);
        if (reverse) std::reverse(next.begin(), next.end());  // 第一個鄰居最後放、最先取出
        for (int v : next) stack.push_back(v);
    }
    return result;
}

void print(const char* name, const std::vector<int>& a) {
    std::cout << name;
    for (int x : a) std::cout << ' ' << x;
    std::cout << "\n";
}

int main() {
    int n = 7;
    std::vector<std::pair<int, int>> edges = {{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}, {2, 5}, {5, 6}};
    adj.assign(n, {});
    for (auto [a, b] : edges) {  // 無向圖：兩個方向都加
        adj[a].push_back(b);
        adj[b].push_back(a);
    }
    visited.assign(n, false);
    parent.assign(n, -1);
    dfs(0);
    print("recursive:", order);
    print("parent:", parent);
    std::vector<int> path;
    for (int v = 2; v != -1; v = parent[v]) path.push_back(v);  // 從 2 沿 parent 倒推回起點
    std::reverse(path.begin(), path.end());
    print("tree path to 2:", path);
    print("stack, reversed push:", dfsStack(0, true));
    print("stack, plain push:", dfsStack(0, false));
    return 0;
}`,
        Python: code`def build(n, edges):
    adj = [[] for _ in range(n)]
    for a, b in edges:  # 無向圖：兩個方向都加
        adj[a].append(b)
        adj[b].append(a)
    return adj


def dfs_recursive(adj, start):
    visited = [False] * len(adj)
    parent = [-1] * len(adj)
    order = []

    def dfs(u):
        visited[u] = True
        order.append(u)
        for v in adj[u]:
            if not visited[v]:
                parent[v] = u
                dfs(v)  # 走深一層；返回時就是「回頭」

    dfs(start)
    return order, parent


def dfs_stack(adj, start, reverse):
    visited = [False] * len(adj)
    order = []
    stack = [start]
    while stack:
        u = stack.pop()
        if visited[u]:
            continue  # 同一個點可能被放進堆疊不只一次
        visited[u] = True
        order.append(u)
        nxt = [v for v in adj[u] if not visited[v]]
        if reverse:
            nxt.reverse()  # 第一個鄰居最後放、最先取出
        stack.extend(nxt)
    return order


adj = build(7, [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4), (2, 5), (5, 6)])
order, parent = dfs_recursive(adj, 0)
print("recursive:", *order)
print("parent:", *parent)
path = [2]
while parent[path[-1]] != -1:  # 從 2 沿 parent 倒推回起點
    path.append(parent[path[-1]])
print("tree path to 2:", *reversed(path))
print("stack, reversed push:", *dfs_stack(adj, 0, True))
print("stack, plain push:", *dfs_stack(adj, 0, False))`,
        Java: code`import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Main {
    static List<List<Integer>> adj = new ArrayList<>();
    static boolean[] visited;
    static int[] parent;
    static List<Integer> order = new ArrayList<>();

    // 遞迴版：標記自己，再依序走進每個還沒拜訪的鄰居。
    static void dfs(int u) {
        visited[u] = true;
        order.add(u);
        for (int v : adj.get(u)) {
            if (!visited[v]) {
                parent[v] = u;
                dfs(v);  // 走深一層；返回時就是「回頭」
            }
        }
    }

    // 堆疊版：取出時才檢查與標記；reverse 為 true 時把鄰居反序放入。
    static List<Integer> dfsStack(int start, boolean reverse) {
        boolean[] seen = new boolean[adj.size()];
        List<Integer> result = new ArrayList<>();
        List<Integer> stack = new ArrayList<>();
        stack.add(start);
        while (!stack.isEmpty()) {
            int u = stack.remove(stack.size() - 1);
            if (seen[u]) continue;  // 同一個點可能被放進堆疊不只一次
            seen[u] = true;
            result.add(u);
            List<Integer> next = new ArrayList<>();
            for (int v : adj.get(u))
                if (!seen[v]) next.add(v);
            if (reverse) Collections.reverse(next);  // 第一個鄰居最後放、最先取出
            stack.addAll(next);
        }
        return result;
    }

    static void print(String name, List<Integer> a) {
        StringBuilder sb = new StringBuilder(name);
        for (int x : a) sb.append(' ').append(x);
        System.out.println(sb);
    }

    public static void main(String[] args) {
        int n = 7;
        int[][] edges = {{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}, {2, 5}, {5, 6}};
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) {  // 無向圖：兩個方向都加
            adj.get(e[0]).add(e[1]);
            adj.get(e[1]).add(e[0]);
        }
        visited = new boolean[n];
        parent = new int[n];
        java.util.Arrays.fill(parent, -1);
        dfs(0);
        print("recursive:", order);
        List<Integer> parents = new ArrayList<>();
        for (int p : parent) parents.add(p);
        print("parent:", parents);
        List<Integer> path = new ArrayList<>();
        for (int v = 2; v != -1; v = parent[v]) path.add(v);  // 從 2 沿 parent 倒推回起點
        Collections.reverse(path);
        print("tree path to 2:", path);
        print("stack, reversed push:", dfsStack(0, true));
        print("stack, plain push:", dfsStack(0, false));
    }
}`,
      },
    },
    {
      id: 'components', title: '連通塊的數量、編號與大小', description: '10 個點、7 條無向邊，其中 9 是孤立點。對每個還沒拜訪的點做一次堆疊版 DFS（放入時就標記），印出連通塊數、每個點的編號、依發現順序與由大到小的大小。',
      output: 'components = 4\nlabel: 0 0 0 1 1 2 2 2 2 3\nsizes in discovery order: 3 2 4 1\nsizes, largest first: 4 3 2 1',
      code: {
        'C++': code`#include <algorithm>
#include <functional>
#include <iostream>
#include <utility>
#include <vector>

int main() {
    int n = 10;
    std::vector<std::pair<int, int>> edges = {{0, 1}, {1, 2}, {2, 0}, {3, 4}, {5, 6}, {6, 7}, {7, 8}};
    std::vector<std::vector<int>> adj(n);
    for (auto [a, b] : edges) {
        adj[a].push_back(b);
        adj[b].push_back(a);
    }
    std::vector<int> label(n, -1);  // -1 代表還沒拜訪；否則是所屬連通塊的編號
    std::vector<int> sizes;
    for (int s = 0; s < n; ++s) {  // 每個點都要檢查，孤立點也是一個連通塊
        if (label[s] != -1) continue;
        int id = static_cast<int>(sizes.size());
        label[s] = id;  // 放進堆疊時就標記，每個點最多進堆疊一次
        std::vector<int> stack = {s};
        int size = 0;
        while (!stack.empty()) {
            int u = stack.back();
            stack.pop_back();
            ++size;
            for (int v : adj[u]) {
                if (label[v] == -1) {
                    label[v] = id;
                    stack.push_back(v);
                }
            }
        }
        sizes.push_back(size);
    }
    std::cout << "components = " << sizes.size() << "\n";
    std::cout << "label:";
    for (int x : label) std::cout << ' ' << x;
    std::cout << "\nsizes in discovery order:";
    for (int x : sizes) std::cout << ' ' << x;
    std::sort(sizes.begin(), sizes.end(), std::greater<int>());
    std::cout << "\nsizes, largest first:";
    for (int x : sizes) std::cout << ' ' << x;
    std::cout << "\n";
    return 0;
}`,
        Python: code`def components(n, edges):
    adj = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    label = [-1] * n  # -1 代表還沒拜訪；否則是所屬連通塊的編號
    sizes = []
    for s in range(n):  # 每個點都要檢查，孤立點也是一個連通塊
        if label[s] != -1:
            continue
        cid = len(sizes)
        label[s] = cid  # 放進堆疊時就標記，每個點最多進堆疊一次
        stack = [s]
        size = 0
        while stack:
            u = stack.pop()
            size += 1
            for v in adj[u]:
                if label[v] == -1:
                    label[v] = cid
                    stack.append(v)
        sizes.append(size)
    return label, sizes


label, sizes = components(10, [(0, 1), (1, 2), (2, 0), (3, 4), (5, 6), (6, 7), (7, 8)])
print("components =", len(sizes))
print("label:", *label)
print("sizes in discovery order:", *sizes)
print("sizes, largest first:", *sorted(sizes, reverse=True))`,
        Java: code`import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        int n = 10;
        int[][] edges = {{0, 1}, {1, 2}, {2, 0}, {3, 4}, {5, 6}, {6, 7}, {7, 8}};
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) {
            adj.get(e[0]).add(e[1]);
            adj.get(e[1]).add(e[0]);
        }
        int[] label = new int[n];
        Arrays.fill(label, -1);  // -1 代表還沒拜訪；否則是所屬連通塊的編號
        List<Integer> sizes = new ArrayList<>();
        int[] stack = new int[n];  // 放入時就標記，每個點最多進堆疊一次，n 格就夠
        for (int s = 0; s < n; s++) {  // 每個點都要檢查，孤立點也是一個連通塊
            if (label[s] != -1) continue;
            int id = sizes.size();
            label[s] = id;
            int top = 0, size = 0;
            stack[top++] = s;
            while (top > 0) {
                int u = stack[--top];
                size++;
                for (int v : adj.get(u)) {
                    if (label[v] == -1) {
                        label[v] = id;
                        stack[top++] = v;
                    }
                }
            }
            sizes.add(size);
        }
        System.out.println("components = " + sizes.size());
        StringBuilder sb = new StringBuilder("label:");
        for (int x : label) sb.append(' ').append(x);
        sb.append("\nsizes in discovery order:");
        for (int x : sizes) sb.append(' ').append(x);
        sizes.sort((a, b) -> Integer.compare(b, a));
        sb.append("\nsizes, largest first:");
        for (int x : sizes) sb.append(' ').append(x);
        System.out.println(sb);
    }
}`,
      },
    },
    {
      id: 'grid-islands', title: '格子 flood fill：數島嶼與面積', description: '5 × 5 的地圖，`#` 是陸地、`.` 是水，上下左右相鄰才算相連。依列、行的順序掃描，每遇到一格還沒塗過的陸地，就用堆疊塗滿整座島並算出面積。',
      output: 'island 1 starts at (0, 0), area 3\nisland 2 starts at (0, 4), area 3\nisland 3 starts at (2, 2), area 1\nisland 4 starts at (3, 0), area 3\nisland 5 starts at (3, 4), area 4\nislands = 5\nlargest = 4',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <utility>
#include <vector>

int main() {
    std::vector<std::string> grid = {
        "##..#",
        "#..##",
        "..#..",
        "##..#",
        "#.###",
    };
    int R = static_cast<int>(grid.size()), C = static_cast<int>(grid[0].size());
    std::vector<std::vector<bool>> seen(R, std::vector<bool>(C, false));
    const int dr[4] = {-1, 1, 0, 0}, dc[4] = {0, 0, -1, 1};  // 上下左右；斜角不算相連
    int islands = 0, largest = 0;
    for (int r = 0; r < R; ++r) {
        for (int c = 0; c < C; ++c) {
            if (grid[r][c] != '#' || seen[r][c]) continue;
            seen[r][c] = true;  // 新的島：從這格開始 flood fill
            std::vector<std::pair<int, int>> stack = {{r, c}};
            int area = 0;
            while (!stack.empty()) {
                auto [x, y] = stack.back();
                stack.pop_back();
                ++area;
                for (int d = 0; d < 4; ++d) {
                    int nx = x + dr[d], ny = y + dc[d];
                    // 先檢查邊界，再讀 grid
                    if (nx >= 0 && nx < R && ny >= 0 && ny < C && grid[nx][ny] == '#' && !seen[nx][ny]) {
                        seen[nx][ny] = true;
                        stack.push_back({nx, ny});
                    }
                }
            }
            ++islands;
            if (area > largest) largest = area;
            std::cout << "island " << islands << " starts at (" << r << ", " << c << "), area " << area << "\n";
        }
    }
    std::cout << "islands = " << islands << "\n";
    std::cout << "largest = " << largest << "\n";
    return 0;
}`,
        Python: code`grid = [
    "##..#",
    "#..##",
    "..#..",
    "##..#",
    "#.###",
]
R, C = len(grid), len(grid[0])
seen = [[False] * C for _ in range(R)]
DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1)]  # 上下左右；斜角不算相連
areas = []
for r in range(R):
    for c in range(C):
        if grid[r][c] != "#" or seen[r][c]:
            continue
        seen[r][c] = True  # 新的島：從這格開始 flood fill
        stack = [(r, c)]
        area = 0
        while stack:
            x, y = stack.pop()
            area += 1
            for dx, dy in DIRS:
                nx, ny = x + dx, y + dy
                # 先檢查邊界，再讀 grid；Python 的 grid[-1] 不會報錯，會讀到最後一列
                if 0 <= nx < R and 0 <= ny < C and grid[nx][ny] == "#" and not seen[nx][ny]:
                    seen[nx][ny] = True
                    stack.append((nx, ny))
        areas.append(area)
        print(f"island {len(areas)} starts at ({r}, {c}), area {area}")
print("islands =", len(areas))
print("largest =", max(areas, default=0))`,
        Java: code`public class Main {
    public static void main(String[] args) {
        String[] grid = {
            "##..#",
            "#..##",
            "..#..",
            "##..#",
            "#.###",
        };
        int R = grid.length, C = grid[0].length();
        boolean[][] seen = new boolean[R][C];
        int[] dr = {-1, 1, 0, 0}, dc = {0, 0, -1, 1};  // 上下左右；斜角不算相連
        int[] stack = new int[R * C];  // 存 x * C + y；放入時就標記，最多 R * C 格
        int islands = 0, largest = 0;
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < R; r++) {
            for (int c = 0; c < C; c++) {
                if (grid[r].charAt(c) != '#' || seen[r][c]) continue;
                seen[r][c] = true;  // 新的島：從這格開始 flood fill
                int top = 0, area = 0;
                stack[top++] = r * C + c;
                while (top > 0) {
                    int cell = stack[--top];
                    int x = cell / C, y = cell % C;
                    area++;
                    for (int d = 0; d < 4; d++) {
                        int nx = x + dr[d], ny = y + dc[d];
                        // 先檢查邊界，再讀 grid
                        if (nx >= 0 && nx < R && ny >= 0 && ny < C && grid[nx].charAt(ny) == '#' && !seen[nx][ny]) {
                            seen[nx][ny] = true;
                            stack[top++] = nx * C + ny;
                        }
                    }
                }
                islands++;
                largest = Math.max(largest, area);
                sb.append("island ").append(islands).append(" starts at (").append(r).append(", ").append(c).append("), area ").append(area).append('\n');
            }
        }
        sb.append("islands = ").append(islands).append('\n');
        sb.append("largest = ").append(largest);
        System.out.println(sb);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'graph-traversal', title: '堆疊版 DFS：反序放入鄰居，取出時檢查', language: 'Python',
    code: code`graph = {'A': ['B', 'C'], 'B': ['A', 'D'], 'C': ['A', 'D'],
         'D': ['B', 'C', 'E'], 'E': ['D'], 'F': ['G'], 'G': ['F']}
visited, order = set(), []
stack = ['A']
while stack:
    u = stack.pop()
    if u in visited:
        continue
    visited.add(u)
    order.append(u)
    for v in reversed(graph[u]):
        if v not in visited:
            stack.append(v)
print(' '.join(order))`,
    steps: traceSteps,
    tryIt: { algorithm: 'dfs', nodes: NODES, edges: EDGES, directed: false, start: 'A' },
  },
  quiz: [
    {
      id: 'q-order', prompt: '下面的遞迴 DFS 印出什麼？（把第 4～9 行換成「反序放入、取出時檢查」的堆疊版，結果也一樣。）',
      code: { language: 'Python', text: code`graph = {1: [3, 2], 2: [1, 4], 3: [1, 5, 4], 4: [2, 3, 6], 5: [3], 6: [4]}
visited = set()

def dfs(u):
    visited.add(u)
    print(u, end=' ')
    for v in graph[u]:
        if v not in visited:
            dfs(v)

dfs(1)` },
      options: ['1 3 5 4 2 6', '1 3 2 5 4 6', '1 2 4 6 3 5', '1 2 3 4 5 6'],
      answer: 0, explanation: '1 的第一個鄰居是 3，走進 3；3 的第一個未拜訪鄰居是 5，5 是死路，回到 3 再走 4；4 的鄰居 2 未拜訪，走進 2（2 的鄰居 1、4 都拜訪過了），回到 4 再走 6。所以是 1 3 5 4 2 6。「1 3 2 5 4 6」是 BFS 一層一層的順序；「1 2 4 6 3 5」是堆疊版「照順序放入」的結果，鄰居順序被反過來；「1 2 3 4 5 6」只是把編號排好，鄰接串列的順序才是關鍵。已用 Python 執行遞迴版、反序與照順序放入的堆疊版以及 BFS 驗證。',
    },
    {
      id: 'q-plain-push', prompt: '同一張圖改用下面的堆疊版（鄰居照順序放入）。它印出什麼？為什麼和遞迴版不同？',
      code: { language: 'Python', text: code`graph = {1: [3, 2], 2: [1, 4], 3: [1, 5, 4], 4: [2, 3, 6], 5: [3], 6: [4]}
visited, order = set(), []
stack = [1]
while stack:
    u = stack.pop()
    if u in visited:
        continue
    visited.add(u)
    order.append(u)
    for v in graph[u]:
        if v not in visited:
            stack.append(v)
print(*order)` },
      options: ['1 2 4 6 3 5：後放入的鄰居先被取出，每個點的鄰居等於被反著看', '1 3 5 4 2 6：堆疊版和遞迴版一定相同', '1 2 4 3 5 6：堆疊版會先把同一層的鄰居看完', '1 2 4 6 3 5 3：3 被放入兩次，所以印兩次'],
      answer: 0, explanation: '取出 1，放入 3、2，堆疊頂端是 2；取出 2，放入 4；取出 4，放入 3、6；取出 6；取出 3（4 放入的那份），放入 5；取出 5；最後取到 1 放入的那份 3，已拜訪，跳過。順序 1 2 4 6 3 5。堆疊後進先出，照順序放入時最後一個鄰居最先被走，所以和遞迴版不同；把第 10 行改成 `reversed(graph[u])` 就會得到遞迴版的 1 3 5 4 2 6。堆疊版不是「一層一層」，那是 BFS；第 6、7 行的檢查讓重複放入的 3 被跳過，不會印兩次。已用 Python 執行驗證。',
    },
    {
      id: 'q-components', prompt: '下面的程式輸出什麼？',
      code: { language: 'Python', text: code`n = 8
edges = [(1, 2), (3, 1), (4, 5), (6, 7), (7, 4), (5, 6)]
adj = [[] for _ in range(n + 1)]
for a, b in edges:
    adj[a].append(b)
    adj[b].append(a)
seen = [False] * (n + 1)
sizes = []
for s in range(1, n + 1):
    if not seen[s]:
        seen[s] = True
        stack, size = [s], 0
        while stack:
            u = stack.pop()
            size += 1
            for v in adj[u]:
                if not seen[v]:
                    seen[v] = True
                    stack.append(v)
        sizes.append(size)
print(len(sizes), sorted(sizes, reverse=True))` },
      options: ['3 [4, 3, 1]', '2 [4, 3]', '4 [3, 2, 2, 1]', '3 [4, 3, 0]'],
      answer: 0, explanation: '1、2、3 透過 1 – 2、3 – 1 相連（3 個點）；4、5、6、7 由 4 – 5 – 6 – 7 – 4 圍成一個環（4 個點）；8 沒有任何邊，自己是一個大小 1 的連通塊。外層迴圈走過 1 到 8 的每個點，所以 8 也被數到，共 3 個。「2 [4, 3]」漏掉了孤立點；「4 [3, 2, 2, 1]」是把邊依讀入順序分組，沒有發現 7 – 4、5 – 6 把它們接起來；大小至少是 1（起點本身），不會是 0。已用 Python 執行驗證。',
    },
    {
      id: 'q-late-mark', prompt: '下面的堆疊版在取出時才標記，但少了「取出時檢查是否已拜訪」。它印出什麼？',
      code: { language: 'Python', text: code`graph = {'A': ['B', 'C'], 'B': ['A', 'C'], 'C': ['A', 'B']}
visited = set()
order = []
stack = ['A']
while stack:
    u = stack.pop()
    visited.add(u)
    order.append(u)
    for v in graph[u]:
        if v not in visited:
            stack.append(v)
print(order)` },
      options: ["['A', 'C', 'B', 'B']", "['A', 'C', 'B']", "['A', 'B', 'C']", '無窮迴圈，什麼都不印'],
      answer: 0, explanation: '取出 A，放入 B、C；取出 C，A 已標記、B 還沒有，於是 B 又被放入一次，堆疊變成 [B, B]；取出 B 並記錄；再取出第二份 B，沒有檢查就又記錄一次。B 被「拜訪」兩次，在大一點的圖上，重複的點會一再展開，結果和時間都會出錯。修正方法二選一：取出後加上 `if u in visited: continue`，或改成放入時就標記。只有 A、C、B 三個元素的那個選項是修正後的結果；A、B、C 的順序忽略了後進先出；因為有標記，放入的次數有限，不會無窮迴圈。已用 Python 執行驗證。',
    },
    {
      id: 'q-depth', prompt: '在一條 10^5 個點的長鏈 0 – 1 – 2 – … – 99999 上，從 0 執行下面的 Python 遞迴 DFS（沒有呼叫 `sys.setrecursionlimit`），會發生什麼事？',
      code: { language: 'Python', text: code`def dfs(u):
    visited[u] = True
    for v in adj[u]:
        if not visited[v]:
            dfs(v)

dfs(0)
print(sum(visited))` },
      options: ['丟出 RecursionError，沒有印出結果', '印出 100000', '印出 1000', '可以印出 100000，只是比較慢'],
      answer: 0, explanation: '從 0 出發要一路遞迴到 99999 才會回頭，遞迴深度約 10^5，而 Python 預設上限是 1000 層，走到大約第 1000 層就丟出 `RecursionError: maximum recursion depth exceeded`，`print` 根本沒有執行。它不會「只拜訪 1000 個點然後印出 1000」，例外會中斷整個程式；也不是慢一點而已。C++／Java 的遞迴版在更深時（例如 10^6 層）也會堆疊溢位。改用堆疊版就沒有深度限制。已用 Python 3 在長鏈上執行驗證。',
    },
    {
      id: 'q-bounds', prompt: '下面的 flood fill 想數 3 × 3 地圖上的島嶼數（正確答案是 2：左上角和左下角）。它實際印出什麼？',
      code: { language: 'Python', text: code`grid = ['#..', '...', '#..']
R, C = 3, 3
seen = [[False] * C for _ in range(R)]
count = 0
for r in range(R):
    for c in range(C):
        if grid[r][c] == '#' and not seen[r][c]:
            count += 1
            seen[r][c] = True
            stack = [(r, c)]
            while stack:
                x, y = stack.pop()
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if nx < R and ny < C and grid[nx][ny] == '#' and not seen[nx][ny]:
                        seen[nx][ny] = True
                        stack.append((nx, ny))
print(count)` },
      options: ['1', '2', '丟出 IndexError', '0'],
      answer: 0, explanation: '邊界檢查只寫了 `nx < R`、`ny < C`，漏了 `nx >= 0`、`ny >= 0`。從 (0, 0) 往上看 (−1, 0) 時，Python 的 `grid[-1]` 是最後一列，`grid[-1][0]` 正是左下角的 `#`，於是兩座島被當成同一座，印出 1。負索引在 Python 合法，所以不會丟出 IndexError（往下、往右越界才會，但這裡都被 `< R`、`< C` 擋住了）；C++ 會是未定義行為、Java 會丟出 `ArrayIndexOutOfBoundsException`。改成 `0 <= nx < R and 0 <= ny < C` 就會印出 2。已用 Python 執行驗證。',
    },
    {
      id: 'q-choose', prompt: '三個任務：(甲) 迷宮中從起點到終點最少要走幾步；(乙) 一張固定的 1000 × 1000 地圖上有幾座島；(丙) 道路一條一條陸續開通，每開通一條之後都要回答好幾個「城市 x 和 y 現在是否相連」。哪一組選擇最合適？',
      options: ['甲用 BFS；乙用 DFS 或 BFS（迭代版）；丙用並查集', '三個都用遞迴 DFS', '甲用 DFS；乙用並查集；丙每次查詢都做一次 BFS', '甲用並查集；乙用 BFS；丙用 DFS'],
      answer: 0, explanation: '最少步數是無權最短距離，BFS 第一次到達終點時的層數就是答案；DFS 找到的路可能繞遠，不能保證最少。數島嶼只要知道哪些格子相連，DFS、BFS 都可以；10^6 格的大島會讓遞迴 DFS 太深，所以用迭代版。道路陸續開通、查詢穿插其中，每次查詢都重做 DFS／BFS 最差要 O(V + E)，查詢一多就太慢；並查集每次 union、find 幾乎是常數時間。並查集只知道是否相連，給不出步數，不能用在甲。',
    },
  ],
  exercises: [
    {
      id: 'e-islands', title: '島嶼數量與最大島嶼',
      statement: '一張 R × C 的地圖，`#` 是陸地、`.` 是水。上下左右相鄰的陸地屬於同一座島，只有斜角相接的不算相連。請輸出島嶼的數量，以及最大那座島的格數（沒有陸地時兩者都是 0）。R、C 最大到 1000，地圖可能有一座蜿蜒 50 萬格的蛇形島：遞迴版的 flood fill 會遞迴幾十萬層，Python 超過遞迴上限，C++／Java 可能堆疊溢位，請用自己的堆疊（或佇列）做迭代版的 DFS（或 BFS），讓每格只處理常數次。輸入不合法時只輸出一行 `Invalid`：R 或 C 不是 1～1000 的整數、地圖的列數不是 R、某一列的長度不是 C，或出現 `#`、`.` 以外的字元。',
      inputFormat: '第一行兩個整數 R 與 C。接下來 R 行，每行是一個長度 C、只由 `#` 與 `.` 組成的字串（中間沒有空白）。',
      outputFormat: '一行兩個以空白分隔的整數：島嶼數量、最大島嶼的格數；輸入不合法時只輸出一行 `Invalid`。',
      constraints: ['1 ≤ R ≤ 1000，1 ≤ C ≤ 1000（否則輸出 Invalid）', '每一列恰好 C 個字元，只能是 `#` 或 `.`', '恰好 R 列地圖'],
      samples: [{ kind: 'normal', input: '4 5\n##..#\n#..##\n.....\n.#.#.', output: '4 3', note: '左上 3 格、右上 3 格，以及最下面兩座 1 格的島；最大的有兩座並列 3 格' }],
      tests: [
        { kind: 'normal', input: '4 5\n##..#\n#..##\n.....\n.#.#.', output: '4 3', note: '範例' },
        { kind: 'normal', input: '5 5\n#...#\n#...#\n#...#\n#####\n.....', output: '1 11', note: 'U 形的島：只看同一列或從上往下掃一次會誤判成兩座' },
        { kind: 'normal', input: '5 5\n#####\n#...#\n#.#.#\n#...#\n#####', output: '2 16', note: '環形的島圍著一座 1 格的島：被包住的陸地沒有和外圈相連' },
        { kind: 'normal', input: '6 8\n#.......\n##..##..\n....##..\n.#......\n.##..###\n..#..#.#', output: '4 5', note: '多座大小不同的島，最大的在右下角，接觸地圖邊緣' },
        { kind: 'edge', input: '3 4\n....\n....\n....', output: '0 0', note: '全部是水' },
        { kind: 'edge', input: '3 4\n####\n####\n####', output: '1 12', note: '全部是陸地' },
        { kind: 'edge', input: '1 1\n#', output: '1 1', note: '只有一格陸地' },
        { kind: 'edge', input: '1 1\n.', output: '0 0', note: '只有一格水' },
        { kind: 'edge', input: '3 3\n#.#\n.#.\n#.#', output: '5 1', note: '只有斜角相接：5 座各 1 格的島' },
        { kind: 'edge', input: '1 9\n##.###.##', output: '3 3', note: '只有一列：沒有上下鄰居' },
        { kind: 'edge', input: '5 1\n#\n#\n.\n#\n#', output: '2 2', note: '只有一行：沒有左右鄰居' },
        { kind: 'edge', input: snakeInput, output: snakeOutput, note: '1000 × 1000 的蛇形島（50 萬 500 格）：遞迴版要遞迴數十萬層，會超過 Python 的遞迴上限或讓 C++／Java 堆疊溢位' },
        { kind: 'edge', input: boardInput, output: boardOutput, note: '700 × 700 的棋盤格：24 萬 5 千座 1 格的島，把斜角當成相連的寫法會得到 1 座' },
        { kind: 'error', input: '3 4\n####\n###\n####', output: 'Invalid', note: '第 2 列只有 3 個字元' },
        { kind: 'error', input: '2 3\n#.#\n.x.', output: 'Invalid', note: '出現未知字元 x' },
        { kind: 'error', input: '3 3\n###\n...', output: 'Invalid', note: '只有 2 列，少於 R' },
        { kind: 'error', input: '2 2\n##\n..\n##', output: 'Invalid', note: '有 3 列，多於 R' },
        { kind: 'error', input: '0 5', output: 'Invalid', note: 'R = 0' },
        { kind: 'error', input: '2 1001\n#\n#', output: 'Invalid', note: 'C 超過 1000' },
        { kind: 'error', input: 'three 3\n...\n...\n...', output: 'Invalid', note: 'R 不是整數' },
      ],
      hints: [
        '外層依序掃過每一格；遇到還沒處理過的陸地，島嶼數加 1，再從它做一次 flood fill，數出這座島的格數。',
        '放進堆疊時就把格子標記（或直接改成水），每格最多進堆疊一次，堆疊最多 R × C 個元素。',
        '把格子 (r, c) 編號成 `r * C + c`，堆疊只要存一個整數；取出時用 `r = id / C`、`c = id % C` 還原。',
        '檢查鄰居前先確認 `0 <= nr < R`、`0 <= nc < C`；Python 的負索引不會報錯，只會默默讀到另一邊。',
        '先把所有列讀進來，檢查列數、每列長度與字元，再開始 flood fill。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// R、C 必須是 1～1000 的正整數（只能有數字）；不合法回傳 -1。
int parseSize(const std::string& s) {
    if (s.empty() || s.size() > 4) return -1;
    int v = 0;
    for (char ch : s) {
        if (ch < '0' || ch > '9') return -1;
        v = v * 10 + (ch - '0');
    }
    return (v >= 1 && v <= 1000) ? v : -1;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<std::string> tokens;  // 先讀進所有以空白分隔的字串
    std::string t;
    while (std::cin >> t) tokens.push_back(t);
    int R = tokens.size() >= 2 ? parseSize(tokens[0]) : -1;
    int C = tokens.size() >= 2 ? parseSize(tokens[1]) : -1;
    if (R < 0 || C < 0 || tokens.size() != static_cast<std::size_t>(R) + 2) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<char> land(static_cast<std::size_t>(R) * C, 0);  // 格子 (r, c) 的編號是 r * C + c
    for (int r = 0; r < R; ++r) {
        const std::string& row = tokens[r + 2];
        if (row.size() != static_cast<std::size_t>(C)) {
            std::cout << "Invalid\n";
            return 0;
        }
        for (int c = 0; c < C; ++c) {
            if (row[c] != '#' && row[c] != '.') {
                std::cout << "Invalid\n";
                return 0;
            }
            land[r * C + c] = row[c] == '#';
        }
    }
    std::vector<int> stack;  // 自己的堆疊放在堆積上，不受遞迴深度限制
    stack.reserve(land.size());
    int count = 0, best = 0;
    for (int s = 0; s < R * C; ++s) {
        if (!land[s]) continue;
        ++count;
        land[s] = 0;  // 放進堆疊時就淹掉，每格最多進堆疊一次
        stack.push_back(s);
        int size = 0;
        while (!stack.empty()) {
            int i = stack.back();
            stack.pop_back();
            ++size;
            int r = i / C, c = i % C;
            if (r > 0 && land[i - C]) { land[i - C] = 0; stack.push_back(i - C); }
            if (r + 1 < R && land[i + C]) { land[i + C] = 0; stack.push_back(i + C); }
            if (c > 0 && land[i - 1]) { land[i - 1] = 0; stack.push_back(i - 1); }
            if (c + 1 < C && land[i + 1]) { land[i + 1] = 0; stack.push_back(i + 1); }
        }
        if (size > best) best = size;
    }
    std::cout << count << ' ' << best << "\n";
    return 0;
}`,
        Python: code`import sys


def main():
    data = sys.stdin.buffer.read().split()
    if len(data) < 2 or not all(t.isdigit() and len(t) <= 4 for t in data[:2]):
        print("Invalid")
        return
    R, C = int(data[0]), int(data[1])
    rows = data[2:]
    if not (1 <= R <= 1000 and 1 <= C <= 1000) or len(rows) != R:
        print("Invalid")
        return
    for row in rows:
        if len(row) != C or row.translate(None, b"#."):  # 刪掉 # 和 . 之後還有剩：有未知字元
            print("Invalid")
            return
    grid = bytearray(b"".join(rows))  # 攤平成一維：格子 (r, c) 的編號是 r * C + c
    LAND, WATER = ord("#"), ord(".")
    count = best = 0
    s = grid.find(b"#")
    while s != -1:
        count += 1
        grid[s] = WATER  # 放進堆疊時就淹掉，每格最多進堆疊一次
        stack = [s]
        size = 0
        while stack:
            i = stack.pop()
            size += 1
            r, c = divmod(i, C)
            if r > 0 and grid[i - C] == LAND:
                grid[i - C] = WATER
                stack.append(i - C)
            if r + 1 < R and grid[i + C] == LAND:
                grid[i + C] = WATER
                stack.append(i + C)
            if c > 0 and grid[i - 1] == LAND:
                grid[i - 1] = WATER
                stack.append(i - 1)
            if c + 1 < C and grid[i + 1] == LAND:
                grid[i + 1] = WATER
                stack.append(i + 1)
        best = max(best, size)
        s = grid.find(b"#", s + 1)  # 下一格還沒淹掉的陸地就是下一座島
    print(count, best)


main()`,
        Java: code`import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class Main {
    // R、C 必須是 1～1000 的正整數（只能有數字）；不合法回傳 -1。
    static int parseSize(byte[] in, int[] tok) {
        int len = tok[1] - tok[0];
        if (len < 1 || len > 4) return -1;
        int v = 0;
        for (int k = tok[0]; k < tok[1]; k++) {
            if (in[k] < '0' || in[k] > '9') return -1;
            v = v * 10 + (in[k] - '0');
        }
        return (v >= 1 && v <= 1000) ? v : -1;
    }

    public static void main(String[] args) throws IOException {
        byte[] in = System.in.readAllBytes();
        List<int[]> tokens = new ArrayList<>();  // 每個以空白分隔的字串記成 [起點, 終點)
        int p = 0;
        while (p < in.length) {
            while (p < in.length && in[p] <= ' ') p++;
            int start = p;
            while (p < in.length && in[p] > ' ') p++;
            if (p > start) tokens.add(new int[] {start, p});
        }
        int R = tokens.size() >= 2 ? parseSize(in, tokens.get(0)) : -1;
        int C = tokens.size() >= 2 ? parseSize(in, tokens.get(1)) : -1;
        if (R < 0 || C < 0 || tokens.size() != R + 2) {
            System.out.println("Invalid");
            return;
        }
        boolean[] land = new boolean[R * C];  // 格子 (r, c) 的編號是 r * C + c
        for (int r = 0; r < R; r++) {
            int[] tok = tokens.get(r + 2);
            if (tok[1] - tok[0] != C) {
                System.out.println("Invalid");
                return;
            }
            for (int c = 0; c < C; c++) {
                byte ch = in[tok[0] + c];
                if (ch != '#' && ch != '.') {
                    System.out.println("Invalid");
                    return;
                }
                land[r * C + c] = ch == '#';
            }
        }
        int[] stack = new int[R * C];  // 放入時就淹掉，每格最多進堆疊一次，R * C 格就夠
        int count = 0, best = 0;
        for (int s = 0; s < R * C; s++) {
            if (!land[s]) continue;
            count++;
            land[s] = false;
            int top = 0, size = 0;
            stack[top++] = s;
            while (top > 0) {
                int i = stack[--top];
                size++;
                int r = i / C, c = i % C;
                if (r > 0 && land[i - C]) { land[i - C] = false; stack[top++] = i - C; }
                if (r + 1 < R && land[i + C]) { land[i + C] = false; stack[top++] = i + C; }
                if (c > 0 && land[i - 1]) { land[i - 1] = false; stack[top++] = i - 1; }
                if (c + 1 < C && land[i + 1]) { land[i + 1] = false; stack[top++] = i + 1; }
            }
            best = Math.max(best, size);
        }
        System.out.println(count + " " + best);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

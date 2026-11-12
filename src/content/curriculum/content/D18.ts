import type { LessonContent, TraceStep } from '../schema';
import { dsuSteps, type DsuOp } from '../simulate';

const code = String.raw;

/*
 * The trace runs the Python program below on 8 elements: dsuSteps uses the same rules as that code (union by size,
 * ties put b's root under a's root, and a find that points every node on its path straight at the root).
 * Each operation carries a short "why" that is appended to its last step.
 */
const traceOps: { op: DsuOp; why: string }[] = [
  { op: { op: 'union', a: 0, b: 1, line: 14 }, why: '兩邊大小都是 1；依本課約定，一樣大時把 b 的根接到 a 的根下面，所以 1 接到 0。' },
  { op: { op: 'union', a: 2, b: 3, line: 14 }, why: '' },
  { op: { op: 'union', a: 1, b: 3, line: 14 }, why: '大小 2 對 2：根 2 接到根 0 下面。3 現在要走兩步才到根（3 → 2 → 0），這是樹第一次長高。' },
  { op: { op: 'union', a: 4, b: 5, line: 14 }, why: '' },
  { op: { op: 'union', a: 6, b: 7, line: 14 }, why: '' },
  { op: { op: 'union', a: 5, b: 7, line: 14 }, why: '同樣是 2 對 2：根 6 接到根 4 下面，7 → 6 → 4 也是兩步。' },
  { op: { op: 'union', a: 3, b: 7, line: 14 }, why: '兩次 find 都順便壓縮了路徑；接著兩個大小 4 的集合合併，8 個元素成為同一個集合，最深的點也只離根兩步。' },
  { op: { op: 'union', a: 1, b: 2, line: 14 }, why: '程式第 11 行 `if ra == rb: return` 直接結束：parent 與 size 完全不變，這種 union 不會減少集合數。' },
  { op: { op: 'connected', a: 7, b: 2, line: 15 }, why: '先前被壓縮成指向 4 的 7，這次再被壓縮成直接指向 0。兩個根相同，所以印出 True。' },
];

const ops = traceOps.map(t => t.op);
/** Index of the last step each operation produces (the simulator is deterministic, so a prefix gives the same steps). */
const lastStep = ops.map((_, i) => dsuSteps(8, ops.slice(0, i + 1)).length - 1);
/** The line of the trace code each kind of simulator step belongs to. */
const lineOf = (note: string, line: number) =>
  note.startsWith('find(') ? 4 : note.startsWith('路徑壓縮') ? 7 : note.startsWith('union：') ? 13 : note.includes('已在同一個集合') ? 11 : line;

const simulated: TraceStep[] = dsuSteps(8, ops).map((step, i) => {
  const at = lastStep.indexOf(i);
  const why = at >= 0 ? traceOps[at].why : '';
  return { ...step, line: lineOf(step.note, step.line), note: why ? `${step.note}${why}` : step.note };
});
const final = simulated.at(-1)!;
const traceSteps: TraceStep[] = [
  { line: 1, note: '一開始每個元素自成一個集合：`parent[i] = i`（自己就是根），每個集合的大小 `size[i] = 1`。8 個元素就是 8 棵只有一個點的樹。',
    dsu: { parent: [0, 1, 2, 3, 4, 5, 6, 7], size: [1, 1, 1, 1, 1, 1, 1, 1] } },
  ...simulated.slice(0, -1),
  { ...final, vars: { 'find(7) == find(2)': 'True' }, output: 'True' },
];

/**
 * D18 Disjoint Set Union. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js), with the same iterative two-pass find.
 */
export const D18: LessonContent = {
  lessonId: 'D18',
  motivation: '很多問題只關心「誰和誰是同一組」：社群網站裡兩個人是不是在同一個朋友圈、網路上兩台電腦能不能互通、地圖上兩個城市有沒有道路相連。如果連線是一條一條陸續加進來的，每次都重新跑一次 D16 的連通元件搜尋太慢了。並查集（Disjoint Set Union，DSU，也叫 union-find）專門處理兩種操作：「把兩個組合併」（union）和「x 和 y 是否在同一組」（find）。只用一個 parent 陣列，再加上按大小合併與路徑壓縮兩個小技巧，每次操作就幾乎是常數時間。它也是偵測無向圖中的環、以及演算法島裡最小生成樹（Kruskal 演算法）的核心工具。它的限制同樣明確：只能合併、不能拆開；它只記得「誰跟誰同組」，不記得是哪些邊造成的，也不能直接列出一組的所有成員。',
  sections: [
    {
      id: 'idea', title: '問題與表示法：每個集合是一棵樹',
      blocks: [
        { type: 'p', text: '並查集維護 n 個元素（編號 0 到 n − 1）分成的若干個互不相交的集合（disjoint sets）。一開始每個元素自成一組，之後只會發生兩件事：union(a, b) 把 a 所在的組與 b 所在的組合併成一組；find(x) 回答 x 屬於哪一組。「x 和 y 是否同組」就是比較 find(x) 與 find(y)。' },
        { type: 'list', items: [
          '朋友圈：A 和 B 成為朋友就 union(A, B)，問兩個人是否間接認識就比較 find。',
          '網路連通：每接上一條線就 union 兩端，隨時能回答兩台電腦能不能互通。',
          '邊陸續加入時計算連通元件個數：每次真的合併了兩組，組數就減 1。',
        ] },
        { type: 'p', text: '表示法：每一組是一棵樹，用一個陣列 `parent` 存每個元素的父節點（parent）。根（root）的 parent 是自己，`parent[r] == r`，根就是這一組的代表元（representative）。find(x) 從 x 沿著 parent 一直往上走，走到根為止，回傳根；兩個元素的根相同，就在同一組。union(a, b) 先找出兩邊的根 ra、rb，如果不同，把其中一個根的 parent 改成另一個根，兩棵樹就接成一棵。' },
        { type: 'p', text: '注意 parent 只是「往上的指標」，和 D13 的二元樹不同：每個點不記得自己的孩子，樹也不必是二元的。一組的成員是誰、樹長什麼形狀都不重要，重要的只有「根是誰」。' },
        { type: 'callout', tone: 'warning', title: 'union 一定要先找根', text: '常見錯誤是把 union 寫成 `parent[a] = b`。a 不一定是根：如果 a 原本掛在別的點底下，這一行會把 a 從原本的組拔出來，原本那組的其他成員被丟在原地，兩組不但沒有合併，還被拆壞了。正確寫法是 `parent[find(a)] = find(b)`：改的是根的 parent，整棵樹一起搬過去。' },
        { type: 'p', text: '最天真的版本「a 的根一律接到 b 的根下面」在某些順序下會退化：依序做 union(0, 1)、union(1, 2)、…、union(n − 2, n − 1)，得到一條 0 → 1 → 2 → … → n − 1 的鏈，find(0) 要走 n − 1 步，單次是 O(n)。下一節的兩個技巧就是為了不讓樹長高。' },
      ],
    },
    {
      id: 'optimizations', title: '按大小合併與路徑壓縮',
      blocks: [
        { type: 'p', text: '按大小合併（union by size）：另外用陣列 `size` 記錄每個根所代表的集合有幾個元素。合併時，把小的那棵樹的根接到大的那棵樹的根下面，再把大小加過去。本課約定：兩邊一樣大時，把 b 的根接到 a 的根下面（視覺化與所有範例都照這個規則）。' },
        { type: 'p', text: '為什麼樹高不超過 log₂ n：一個點離根的距離只有在「它所在的樹被接到另一棵至少一樣大的樹下面」時才會加 1，而這時它所在的集合大小至少變成原來的 2 倍。集合大小最多是 n，最多只能翻倍 log₂ n 次，所以任何點離根都不超過 log₂ n 步，find 最差 O(log n)。也可以改用按秩合併（union by rank）：rank 是樹高的上界，只有兩棵 rank 相同的樹合併時新根的 rank 才加 1，效果一樣。' },
        { type: 'example', id: 'naive-vs-size' },
        { type: 'p', text: '路徑壓縮（path compression）：find(x) 走到根之後，既然已經知道根是誰，就把路上經過的每一個點的 parent 都直接改成根。下次再 find 這些點（以及它們底下的點）只要一步。寫法是兩趟迴圈：第一趟往上找到根，第二趟從 x 再走一次，邊走邊把 parent 改成根。' },
        { type: 'example', id: 'dsu-basic' },
        { type: 'p', text: '上面第一次印出的 parent 裡 `parent[3] = 2`：3 要經過 2 才到根 0。查詢 same(1, 3) 時 find(3) 走過 3 → 2 → 0，順手把 `parent[3]` 改成 0，所以第二次印出時 3 已經直接指向根。下方的視覺化逐步執行同一套規則，可以看到樹怎麼合併、路徑怎麼被壓平；也可以在「自己試試」對 8 個元素自己下 union 與 find。' },
        { type: 'p', text: '兩個技巧一起用時，做 m 次操作的總時間是 O(m·α(n))，也就是每次操作攤銷（amortized）O(α(n))。α 是反阿克曼函數（inverse Ackermann function），成長得極慢：對任何實際可能出現的 n，α(n) 都不超過 4，所以可以把它當成「幾乎是常數」。這個結果的證明超出本課範圍，這裡只說明結論。' },
        { type: 'table', head: ['操作', '天真版', '只按大小合併', '只做路徑壓縮', '按大小合併 + 路徑壓縮'], rows: [
          ['初始化 n 個元素', 'O(n)', 'O(n)', 'O(n)', 'O(n)'],
          ['find(x)', '最差 O(n)', '最差 O(log n)', '攤銷 O(log n)', '攤銷 O(α(n))，幾乎常數'],
          ['union(a, b)（含兩次 find）', '最差 O(n)', '最差 O(log n)', '攤銷 O(log n)', '攤銷 O(α(n))'],
          ['x、y 是否同組', '最差 O(n)', '最差 O(log n)', '攤銷 O(log n)', '攤銷 O(α(n))'],
          ['目前有幾組', 'O(1)（維護計數器）', 'O(1)', 'O(1)', 'O(1)'],
          ['x 所在組的大小', '要另外維護', '`size[find(x)]`', '要另外維護', '`size[find(x)]`'],
          ['記憶體', 'n 個整數', '2n 個整數', 'n 個整數', '2n 個整數'],
        ] },
      ],
    },
    {
      id: 'applications', title: '應用：計算連通元件與偵測環',
      blocks: [
        { type: 'p', text: '計算連通元件：n 個點、一開始沒有邊，連通元件數是 n。每加入一條邊 (a, b) 就做 union(a, b)；只有在 a、b 原本不同組、真的合併時，元件數才減 1。所以 union 最好回傳「有沒有真的合併」。' },
        { type: 'example', id: 'count-components' },
        { type: 'callout', tone: 'warning', title: '已經同組的 union 不能減少組數', text: '每呼叫一次 union 就把組數減 1 是常見錯誤。上例的邊 0-2 加入時，0 和 2 早已透過 1 相連，union 什麼也沒改，元件數必須維持 3。邊 (a, a)（自環）與重複的邊也一樣不會減少組數。' },
        { type: 'p', text: '偵測無向圖的環（cycle）：依序處理每條邊 (a, b)，如果 find(a) == find(b)，表示 a 和 b 早已透過之前的邊相連，再加上這條邊就形成一個環；否則就 union。下面的程式找出第一條造成環的邊，點的編號是 1 到 n，所以陣列多開一格。' },
        { type: 'example', id: 'first-cycle' },
        { type: 'p', text: '第一張圖的前 4 條邊把 1、2、3、4、5 連成一棵樹；第 5 條邊 4-1 的兩端已經相連，形成 1 → 2 → 3 → 4 → 1 的環。第二張圖 5 個點只有 4 條邊、沒有任何一條邊閉合，所以是一棵樹，沒有環。' },
        { type: 'p', text: '這個方法只適用於無向圖。有向圖的環要看邊的方向：1 → 2、1 → 3、2 → 3 在無向的意義下圍成一圈，但沿著箭頭走不回起點，並沒有有向環；有向圖要用 DFS 或拓撲排序判斷（演算法島）。' },
        { type: 'callout', tone: 'note', title: '預告：最小生成樹的 Kruskal 演算法', text: '把所有邊依權重由小到大排序，依序考慮每一條邊：如果兩端不同組就選它並 union，同組就跳過（選了會形成環）。最後選出的邊就是最小生成樹（minimum spanning tree）。判斷「選了會不會形成環」正是本節的並查集，這會在演算法島的圖論課程中詳細介紹。' },
      ],
    },
    {
      id: 'languages', title: '四種語言的實作細節',
      blocks: [
        { type: 'p', text: '四種語言的標準函式庫都沒有現成的並查集，要自己寫，好在只需要整數陣列：C++ 用 `std::vector<int>`，可以用 `<numeric>` 的 `std::iota` 把 parent 設成 0、1、2、…；Python 用 `list(range(n))`；Java 用 `int[]`，用迴圈設定初值；JavaScript 用 `Array.from({ length: n }, (_, i) => i)`。C++ 的 `union` 是關鍵字，函式只能取別的名字（例如 `unite`）；Java、Python 與 JavaScript 可以直接叫 `union`。' },
        { type: 'table', head: ['', 'C++17', 'Python 3', 'Java 17', 'JavaScript'], rows: [
          ['parent 陣列', '`std::vector<int> parent(n)`', '`parent = list(range(n))`', '`int[] parent = new int[n]`', '`const parent = Array.from({ length: n }, (_, i) => i)`'],
          ['設定 parent[i] = i', '`std::iota(parent.begin(), parent.end(), 0)`', '`list(range(n))` 已經是', '`for` 迴圈', '`Array.from` 的第二個參數已經設好'],
          ['函式名稱', '`union` 是關鍵字，改用 `unite`', '可以用 `union`', '可以用 `union`', '可以用 `union`'],
          ['遞迴 find 太深時', '堆疊溢位（stack overflow），程式直接當掉', '超過預設上限 1000 層就丟出 `RecursionError`', '丟出 `StackOverflowError`', 'Node.js 預設大約一萬層，超過就丟出 `RangeError`（Maximum call stack size exceeded）'],
          ['索引越界', '未定義行為（undefined behavior）', '負數索引不會報錯，`parent[-1]` 是最後一格', '丟出 `ArrayIndexOutOfBoundsException`', '不會報錯，`parent[n]`、`parent[-1]` 都是 `undefined`，之後悄悄算錯'],
        ] },
        { type: 'p', text: '路徑壓縮最短的寫法是遞迴：`if parent[x] != x: parent[x] = find(parent[x])`，再回傳 `parent[x]`。它的效果和兩趟迴圈完全一樣，但遞迴深度等於 find 這一趟要走的步數。' },
        { type: 'callout', tone: 'warning', title: '遞迴 find 可能超過遞迴深度上限', text: '在壓縮發生之前，樹可能很深：例如沒有按大小合併、邊又剛好依序連成一條長鏈時，第一次 find 就要遞迴 n 層。Python 預設的遞迴上限是 1000 層（`sys.getrecursionlimit()`），n = 2×10^5 時會丟出 `RecursionError`；`sys.setrecursionlimit` 調高上限也可能讓直譯器本身的堆疊溢位而直接當掉。C++ 與 Java 的上限取決於堆疊大小，同樣可能溢位；JavaScript（Node.js）預設大約一萬層就丟出 `RangeError`。最穩當的做法是寫成兩趟迴圈的迭代版 find（本課所有程式都是），而且同時做按大小合併，讓樹高不超過 log₂ n。' },
        { type: 'p', text: 'Python 迭代版的第二趟可以寫成 `parent[x], x = root, parent[x]`：右邊先算出 `(root, 舊的 parent[x])`，再由左到右指定，先改 `parent[x]`（此時 x 還是舊的 x），再把 x 移到舊的父節點。順序寫反成 `x, parent[x] = parent[x], root` 就錯了：x 先被改掉，改到的是下一個點，原本的 x 沒有被壓縮。看不清楚時，用一個暫存變數 `nxt = parent[x]` 分三行寫最安全。' },
        { type: 'p', text: '0-based 與 1-based：題目常把元素編號成 1 到 n。可以開 n + 1 格、索引 0 不用（如上面的偵測環範例與本課練習），也可以在讀入時把編號減 1。開 n + 1 格時，組數的初值仍是 n 而不是 n + 1，因為索引 0 不是真正的元素；而且一定要先檢查編號是否在 1 到 n 之間，Python 的 `parent[0]` 或 `parent[-1]` 不會報錯，只會悄悄算錯；JavaScript 的 `parent[-1]` 是 `undefined`，同樣不會報錯。' },
      ],
    },
    {
      id: 'compare', title: '和 BFS／DFS、鄰接串列比較，以及並查集的限制',
      blocks: [
        { type: 'p', text: 'D16 用 BFS 或 DFS 在鄰接串列上找連通元件。兩種做法回答的問題相同，適合的情況卻不同：並查集擅長「邊只增不減、查詢穿插在加邊之間」（線上 online 的連通查詢）；鄰接串列保留了整張圖，能回答更多種問題。' },
        { type: 'table', head: ['需求', '並查集', '鄰接串列 + 每次查詢做 BFS／DFS', '鄰接串列 + 先做一次 BFS 標記元件編號'], rows: [
          ['加入一條邊', '攤銷 O(α(n))', 'O(1)', '要重新標記 O(V + E)'],
          ['x、y 是否連通', '攤銷 O(α(n))', 'O(V + E)', 'O(1)'],
          ['目前有幾個連通元件', 'O(1)（維護計數器）', 'O(V + E)', 'O(1)'],
          ['刪除一條邊', '不支援', 'O(度數)，之後照常查詢', '要重新標記 O(V + E)'],
          ['列出 x 所在組的成員', '掃過全部元素 O(n)，或另外維護成員清單', 'O(該元件的點數 + 邊數)', '掃過全部元素 O(n)，或另存清單'],
          ['找出 x 到 y 的一條路徑', '做不到', 'BFS 可給邊數最少的路徑', '做不到（只有編號）'],
        ] },
        { type: 'p', text: '例如 10^5 個點、10^5 次加邊與 10^5 次查詢穿插出現：每次查詢做 BFS 最差要 10^5 × (V + E) ≈ 10^10 步，太慢；每次加邊後重新標記也一樣；並查集總共只需要約 (加邊數 + 查詢數) × α(n) 次操作。反過來，如果題目要路徑、最短距離，或者邊會被刪除，就要回到鄰接串列。' },
        { type: 'list', items: [
          '不能拆開（split）：一旦合併就分不開，因為不記得是哪條邊把兩組連起來的。邊會被刪除時，一種離線（offline）技巧是把所有操作倒過來處理，讓「刪邊」變成「加邊」；否則需要更進階的結構。',
          '不能直接列出一組的成員：parent 只往上指，要找出某組的所有成員，得掃過全部 n 個元素比較根；常需要時可以替每個根另外維護一份成員清單，合併時把小的清單併進大的。',
          '只記得連通與否：不記得邊、不記得距離，也不能回答「中間經過哪些點」。',
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'naive-vs-size', title: '天真合併與按大小合併的樹高', description: '8 個元素、不做路徑壓縮，比較兩種合併規則下最深的點離根幾步。chain 依序 union(i, i + 1)；pairs 每次合併兩個一樣大的集合，是按大小合併的最差情況。',
      output: 'chain: naive depth 7, by size depth 1\npairs: naive depth 3, by size depth 3',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <numeric>
#include <utility>
#include <vector>

using Pairs = std::vector<std::pair<int, int>>;

int findRoot(const std::vector<int>& parent, int x) {  // 不做路徑壓縮
    while (parent[x] != x) x = parent[x];
    return x;
}

std::vector<int> build(int n, const Pairs& pairs, bool bySize) {
    std::vector<int> parent(n), sz(n, 1);
    std::iota(parent.begin(), parent.end(), 0);
    for (auto [a, b] : pairs) {
        int ra = findRoot(parent, a), rb = findRoot(parent, b);
        if (ra == rb) continue;
        if (!bySize) { parent[ra] = rb; continue; }  // 天真版：a 的根一律接到 b 的根下
        if (sz[ra] < sz[rb]) std::swap(ra, rb);
        parent[rb] = ra;
        sz[ra] += sz[rb];
    }
    return parent;
}

int maxDepth(const std::vector<int>& parent) {  // 最深的點要往上走幾步才到根
    int best = 0;
    for (int x = 0; x < static_cast<int>(parent.size()); ++x) {
        int steps = 0;
        for (int y = x; parent[y] != y; y = parent[y]) ++steps;
        best = std::max(best, steps);
    }
    return best;
}

int main() {
    Pairs chain, pairs = {{0, 1}, {2, 3}, {4, 5}, {6, 7}, {0, 2}, {4, 6}, {0, 4}};
    for (int i = 0; i < 7; ++i) chain.push_back({i, i + 1});
    for (auto& [name, ops] : std::vector<std::pair<const char*, Pairs>>{{"chain", chain}, {"pairs", pairs}}) {
        std::cout << name << ": naive depth " << maxDepth(build(8, ops, false))
                  << ", by size depth " << maxDepth(build(8, ops, true)) << "\n";
    }
    return 0;
}`,
        Python: code`def build(n, pairs, by_size):  # 不做路徑壓縮，只比較合併規則
    parent = list(range(n))
    size = [1] * n

    def find(x):
        while parent[x] != x:
            x = parent[x]
        return x

    for a, b in pairs:
        ra, rb = find(a), find(b)
        if ra == rb:
            continue
        if not by_size:
            parent[ra] = rb  # 天真版：a 的根一律接到 b 的根下
            continue
        if size[ra] < size[rb]:
            ra, rb = rb, ra
        parent[rb] = ra
        size[ra] += size[rb]
    return parent


def max_depth(parent):  # 最深的點要往上走幾步才到根
    best = 0
    for x in range(len(parent)):
        steps = 0
        while parent[x] != x:
            x = parent[x]
            steps += 1
        best = max(best, steps)
    return best


chain = [(i, i + 1) for i in range(7)]
pairs = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (4, 6), (0, 4)]
for name, ops in [("chain", chain), ("pairs", pairs)]:
    naive = max_depth(build(8, ops, False))
    sized = max_depth(build(8, ops, True))
    print(f"{name}: naive depth {naive}, by size depth {sized}")`,
        Java: code`public class Main {
    static int findRoot(int[] parent, int x) {  // 不做路徑壓縮
        while (parent[x] != x) x = parent[x];
        return x;
    }

    static int[] build(int n, int[][] pairs, boolean bySize) {
        int[] parent = new int[n], size = new int[n];
        for (int i = 0; i < n; i++) { parent[i] = i; size[i] = 1; }
        for (int[] p : pairs) {
            int ra = findRoot(parent, p[0]), rb = findRoot(parent, p[1]);
            if (ra == rb) continue;
            if (!bySize) { parent[ra] = rb; continue; }  // 天真版：a 的根一律接到 b 的根下
            if (size[ra] < size[rb]) { int t = ra; ra = rb; rb = t; }
            parent[rb] = ra;
            size[ra] += size[rb];
        }
        return parent;
    }

    static int maxDepth(int[] parent) {  // 最深的點要往上走幾步才到根
        int best = 0;
        for (int x = 0; x < parent.length; x++) {
            int steps = 0;
            for (int y = x; parent[y] != y; y = parent[y]) steps++;
            best = Math.max(best, steps);
        }
        return best;
    }

    public static void main(String[] args) {
        int[][] chain = new int[7][];
        for (int i = 0; i < 7; i++) chain[i] = new int[] {i, i + 1};
        int[][] pairs = {{0, 1}, {2, 3}, {4, 5}, {6, 7}, {0, 2}, {4, 6}, {0, 4}};
        String[] names = {"chain", "pairs"};
        int[][][] all = {chain, pairs};
        for (int k = 0; k < 2; k++) {
            System.out.println(names[k] + ": naive depth " + maxDepth(build(8, all[k], false))
                + ", by size depth " + maxDepth(build(8, all[k], true)));
        }
    }
}`,
        JavaScript: code`function build(n, pairs, bySize) {  // 不做路徑壓縮，只比較合併規則
    const parent = Array.from({ length: n }, (_, i) => i);
    const size = new Array(n).fill(1);
    const findRoot = x => {
        while (parent[x] !== x) x = parent[x];
        return x;
    };
    for (const [a, b] of pairs) {
        let ra = findRoot(a), rb = findRoot(b);
        if (ra === rb) continue;
        if (!bySize) {
            parent[ra] = rb;  // 天真版：a 的根一律接到 b 的根下
            continue;
        }
        if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
        parent[rb] = ra;
        size[ra] += size[rb];
    }
    return parent;
}

function maxDepth(parent) {  // 最深的點要往上走幾步才到根
    let best = 0;
    for (let x = 0; x < parent.length; x++) {
        let steps = 0;
        for (let y = x; parent[y] !== y; y = parent[y]) steps++;
        best = Math.max(best, steps);
    }
    return best;
}

const chain = Array.from({ length: 7 }, (_, i) => [i, i + 1]);
const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [4, 6], [0, 4]];
for (const [name, ops] of [["chain", chain], ["pairs", pairs]]) {
    const naive = maxDepth(build(8, ops, false));
    const sized = maxDepth(build(8, ops, true));
    console.log(name + ": naive depth " + naive + ", by size depth " + sized);
}`,
      },
    },
    {
      id: 'dsu-basic', title: '完整的並查集：find、union 與 same', description: '6 個元素（0 到 5），迭代版 find 做路徑壓縮，union 按大小合併（一樣大時 b 的根接到 a 的根下）。印出 parent 陣列，看 same(1, 3) 前後 parent[3] 的變化。',
      output: "parent: 0 0 0 2 4 5\nsame(1, 3): yes\nparent: 0 0 0 0 4 5\nsame(4, 5): no\nsame(4, 5): yes\nsize of 0's set: 4",
      code: {
        'C++': code`#include <iostream>
#include <numeric>
#include <utility>
#include <vector>

std::vector<int> parent(6), sz(6, 1);

int find(int x) {
    int root = x;
    while (parent[root] != root) root = parent[root];  // 第一趟：往上找到根
    while (parent[x] != root) {  // 第二趟：路徑壓縮
        int next = parent[x];
        parent[x] = root;
        x = next;
    }
    return root;
}

bool unite(int a, int b) {  // union 是 C++ 的關鍵字，所以叫 unite
    int ra = find(a), rb = find(b);
    if (ra == rb) return false;  // 已在同一個集合
    if (sz[ra] < sz[rb]) std::swap(ra, rb);  // ra 是較大的集合；一樣大時 b 的根接到 a 的根下
    parent[rb] = ra;
    sz[ra] += sz[rb];
    return true;
}

const char* same(int a, int b) { return find(a) == find(b) ? "yes" : "no"; }

void show() {
    std::cout << "parent:";
    for (int p : parent) std::cout << " " << p;
    std::cout << "\n";
}

int main() {
    std::iota(parent.begin(), parent.end(), 0);  // parent[i] = i
    unite(0, 1);
    unite(2, 3);
    unite(1, 3);
    show();
    std::cout << "same(1, 3): " << same(1, 3) << "\n";
    show();
    std::cout << "same(4, 5): " << same(4, 5) << "\n";
    unite(4, 5);
    std::cout << "same(4, 5): " << same(4, 5) << "\n";
    std::cout << "size of 0's set: " << sz[find(0)] << "\n";
    return 0;
}`,
        Python: code`parent = list(range(6))
size = [1] * 6


def find(x):
    root = x
    while parent[root] != root:  # 第一趟：往上找到根
        root = parent[root]
    while parent[x] != root:  # 第二趟：路徑壓縮
        parent[x], x = root, parent[x]
    return root


def union(a, b):
    ra, rb = find(a), find(b)
    if ra == rb:
        return False  # 已在同一個集合
    if size[ra] < size[rb]:
        ra, rb = rb, ra  # ra 是較大的集合；一樣大時 b 的根接到 a 的根下
    parent[rb] = ra
    size[ra] += size[rb]
    return True


def same(a, b):
    return "yes" if find(a) == find(b) else "no"


union(0, 1)
union(2, 3)
union(1, 3)
print("parent:", *parent)
print("same(1, 3):", same(1, 3))
print("parent:", *parent)
print("same(4, 5):", same(4, 5))
union(4, 5)
print("same(4, 5):", same(4, 5))
print("size of 0's set:", size[find(0)])`,
        Java: code`public class Main {
    static int[] parent = new int[6], size = new int[6];

    static int find(int x) {
        int root = x;
        while (parent[root] != root) root = parent[root];  // 第一趟：往上找到根
        while (parent[x] != root) {  // 第二趟：路徑壓縮
            int next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    }

    static boolean union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;  // 已在同一個集合
        if (size[ra] < size[rb]) { int t = ra; ra = rb; rb = t; }  // 一樣大時 b 的根接到 a 的根下
        parent[rb] = ra;
        size[ra] += size[rb];
        return true;
    }

    static String same(int a, int b) { return find(a) == find(b) ? "yes" : "no"; }

    static void show() {
        StringBuilder sb = new StringBuilder("parent:");
        for (int p : parent) sb.append(" ").append(p);
        System.out.println(sb);
    }

    public static void main(String[] args) {
        for (int i = 0; i < 6; i++) { parent[i] = i; size[i] = 1; }
        union(0, 1);
        union(2, 3);
        union(1, 3);
        show();
        System.out.println("same(1, 3): " + same(1, 3));
        show();
        System.out.println("same(4, 5): " + same(4, 5));
        union(4, 5);
        System.out.println("same(4, 5): " + same(4, 5));
        System.out.println("size of 0's set: " + size[find(0)]);
    }
}`,
        JavaScript: code`const parent = Array.from({ length: 6 }, (_, i) => i);  // parent[i] = i
const size = new Array(6).fill(1);

function find(x) {
    let root = x;
    while (parent[root] !== root) root = parent[root];  // 第一趟：往上找到根
    while (parent[x] !== root) {  // 第二趟：路徑壓縮
        const next = parent[x];
        parent[x] = root;
        x = next;
    }
    return root;
}

function union(a, b) {
    let ra = find(a), rb = find(b);
    if (ra === rb) return false;  // 已在同一個集合
    if (size[ra] < size[rb]) [ra, rb] = [rb, ra];  // ra 是較大的集合；一樣大時 b 的根接到 a 的根下
    parent[rb] = ra;
    size[ra] += size[rb];
    return true;
}

const same = (a, b) => (find(a) === find(b) ? "yes" : "no");

union(0, 1);
union(2, 3);
union(1, 3);
console.log("parent: " + parent.join(" "));
console.log("same(1, 3): " + same(1, 3));
console.log("parent: " + parent.join(" "));
console.log("same(4, 5): " + same(4, 5));
union(4, 5);
console.log("same(4, 5): " + same(4, 5));
console.log("size of 0's set: " + size[find(0)]);`,
      },
    },
    {
      id: 'count-components', title: '邊陸續加入時的連通元件數', description: '6 個點、沒有邊；依序加入 6 條邊，每加一條印出目前的連通元件數。union 回傳是否真的合併，只有真的合併時才減 1。',
      output: '0-1 merged, components = 5\n1-2 merged, components = 4\n3-4 merged, components = 3\n0-2 already connected, components = 3\n4-5 merged, components = 2\n2-3 merged, components = 1',
      code: {
        'C++': code`#include <iostream>
#include <numeric>
#include <utility>
#include <vector>

const int N = 6;
std::vector<int> parent(N), sz(N, 1);

int find(int x) {
    int root = x;
    while (parent[root] != root) root = parent[root];
    while (parent[x] != root) {
        int next = parent[x];
        parent[x] = root;
        x = next;
    }
    return root;
}

bool unite(int a, int b) {  // 真的合併了才回傳 true
    int ra = find(a), rb = find(b);
    if (ra == rb) return false;
    if (sz[ra] < sz[rb]) std::swap(ra, rb);
    parent[rb] = ra;
    sz[ra] += sz[rb];
    return true;
}

int main() {
    std::iota(parent.begin(), parent.end(), 0);
    int components = N;  // 一開始每個點自成一個連通元件
    std::vector<std::pair<int, int>> edges = {{0, 1}, {1, 2}, {3, 4}, {0, 2}, {4, 5}, {2, 3}};
    for (auto [a, b] : edges) {
        bool merged = unite(a, b);
        if (merged) --components;
        std::cout << a << "-" << b << (merged ? " merged" : " already connected")
                  << ", components = " << components << "\n";
    }
    return 0;
}`,
        Python: code`n = 6
parent = list(range(n))
size = [1] * n


def find(x):
    root = x
    while parent[root] != root:
        root = parent[root]
    while parent[x] != root:
        parent[x], x = root, parent[x]
    return root


def union(a, b):  # 真的合併了才回傳 True
    ra, rb = find(a), find(b)
    if ra == rb:
        return False
    if size[ra] < size[rb]:
        ra, rb = rb, ra
    parent[rb] = ra
    size[ra] += size[rb]
    return True


components = n  # 一開始每個點自成一個連通元件
for a, b in [(0, 1), (1, 2), (3, 4), (0, 2), (4, 5), (2, 3)]:
    if union(a, b):
        components -= 1
        print(f"{a}-{b} merged, components = {components}")
    else:
        print(f"{a}-{b} already connected, components = {components}")`,
        Java: code`public class Main {
    static final int N = 6;
    static int[] parent = new int[N], size = new int[N];

    static int find(int x) {
        int root = x;
        while (parent[root] != root) root = parent[root];
        while (parent[x] != root) {
            int next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    }

    static boolean union(int a, int b) {  // 真的合併了才回傳 true
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;
        if (size[ra] < size[rb]) { int t = ra; ra = rb; rb = t; }
        parent[rb] = ra;
        size[ra] += size[rb];
        return true;
    }

    public static void main(String[] args) {
        for (int i = 0; i < N; i++) { parent[i] = i; size[i] = 1; }
        int components = N;  // 一開始每個點自成一個連通元件
        int[][] edges = {{0, 1}, {1, 2}, {3, 4}, {0, 2}, {4, 5}, {2, 3}};
        for (int[] e : edges) {
            boolean merged = union(e[0], e[1]);
            if (merged) components--;
            System.out.println(e[0] + "-" + e[1] + (merged ? " merged" : " already connected")
                + ", components = " + components);
        }
    }
}`,
        JavaScript: code`const n = 6;
const parent = Array.from({ length: n }, (_, i) => i);
const size = new Array(n).fill(1);

function find(x) {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
        const next = parent[x];
        parent[x] = root;
        x = next;
    }
    return root;
}

function union(a, b) {  // 真的合併了才回傳 true
    let ra = find(a), rb = find(b);
    if (ra === rb) return false;
    if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    size[ra] += size[rb];
    return true;
}

let components = n;  // 一開始每個點自成一個連通元件
for (const [a, b] of [[0, 1], [1, 2], [3, 4], [0, 2], [4, 5], [2, 3]]) {
    const merged = union(a, b);
    if (merged) components--;
    console.log(a + "-" + b + (merged ? " merged" : " already connected") + ", components = " + components);
}`,
      },
    },
    {
      id: 'first-cycle', title: '找出第一條造成環的邊', description: '無向圖，點的編號是 1 到 n（陣列開 n + 1 格，索引 0 不用）。依序處理邊：兩端已經同組就是第一條閉合成環的邊；全部處理完都沒有，就是沒有環。',
      output: 'edge #5 4-1 closes a cycle\nno cycle',
      code: {
        'C++': code`#include <iostream>
#include <numeric>
#include <string>
#include <utility>
#include <vector>

std::string firstCycleEdge(int n, const std::vector<std::pair<int, int>>& edges) {
    std::vector<int> parent(n + 1), sz(n + 1, 1);  // 多開一格，索引 0 不用
    std::iota(parent.begin(), parent.end(), 0);
    auto find = [&parent](int x) {
        int root = x;
        while (parent[root] != root) root = parent[root];
        while (parent[x] != root) {
            int next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    };
    for (int i = 0; i < static_cast<int>(edges.size()); ++i) {
        auto [a, b] = edges[i];
        int ra = find(a), rb = find(b);
        if (ra == rb)
            return "edge #" + std::to_string(i + 1) + " " + std::to_string(a) + "-" + std::to_string(b) + " closes a cycle";
        if (sz[ra] < sz[rb]) std::swap(ra, rb);
        parent[rb] = ra;
        sz[ra] += sz[rb];
    }
    return "no cycle";
}

int main() {
    std::cout << firstCycleEdge(5, {{1, 2}, {3, 4}, {2, 3}, {5, 1}, {4, 1}, {2, 5}}) << "\n";
    std::cout << firstCycleEdge(5, {{1, 2}, {1, 3}, {3, 4}, {3, 5}}) << "\n";
    return 0;
}`,
        Python: code`def first_cycle_edge(n, edges):  # 點的編號是 1..n
    parent = list(range(n + 1))  # 多開一格，索引 0 不用
    size = [1] * (n + 1)

    def find(x):
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:
            parent[x], x = root, parent[x]
        return root

    for i, (a, b) in enumerate(edges, start=1):
        ra, rb = find(a), find(b)
        if ra == rb:
            return f"edge #{i} {a}-{b} closes a cycle"
        if size[ra] < size[rb]:
            ra, rb = rb, ra
        parent[rb] = ra
        size[ra] += size[rb]
    return "no cycle"


print(first_cycle_edge(5, [(1, 2), (3, 4), (2, 3), (5, 1), (4, 1), (2, 5)]))
print(first_cycle_edge(5, [(1, 2), (1, 3), (3, 4), (3, 5)]))`,
        Java: code`public class Main {
    static int[] parent, size;

    static int find(int x) {
        int root = x;
        while (parent[root] != root) root = parent[root];
        while (parent[x] != root) {
            int next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    }

    static String firstCycleEdge(int n, int[][] edges) {  // 點的編號是 1..n
        parent = new int[n + 1];  // 多開一格，索引 0 不用
        size = new int[n + 1];
        for (int i = 0; i <= n; i++) { parent[i] = i; size[i] = 1; }
        for (int i = 0; i < edges.length; i++) {
            int a = edges[i][0], b = edges[i][1];
            int ra = find(a), rb = find(b);
            if (ra == rb) return "edge #" + (i + 1) + " " + a + "-" + b + " closes a cycle";
            if (size[ra] < size[rb]) { int t = ra; ra = rb; rb = t; }
            parent[rb] = ra;
            size[ra] += size[rb];
        }
        return "no cycle";
    }

    public static void main(String[] args) {
        System.out.println(firstCycleEdge(5, new int[][] {{1, 2}, {3, 4}, {2, 3}, {5, 1}, {4, 1}, {2, 5}}));
        System.out.println(firstCycleEdge(5, new int[][] {{1, 2}, {1, 3}, {3, 4}, {3, 5}}));
    }
}`,
        JavaScript: code`function firstCycleEdge(n, edges) {  // 點的編號是 1..n
    const parent = Array.from({ length: n + 1 }, (_, i) => i);  // 多開一格，索引 0 不用
    const size = new Array(n + 1).fill(1);
    const find = x => {
        let root = x;
        while (parent[root] !== root) root = parent[root];
        while (parent[x] !== root) {
            const next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    };
    for (let i = 0; i < edges.length; i++) {
        const [a, b] = edges[i];
        let ra = find(a), rb = find(b);
        if (ra === rb) return "edge #" + (i + 1) + " " + a + "-" + b + " closes a cycle";
        if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
        parent[rb] = ra;
        size[ra] += size[rb];
    }
    return "no cycle";
}

console.log(firstCycleEdge(5, [[1, 2], [3, 4], [2, 3], [5, 1], [4, 1], [2, 5]]));
console.log(firstCycleEdge(5, [[1, 2], [1, 3], [3, 4], [3, 5]]));`,
      },
    },
  ],
  visualization: {
    kind: 'disjoint-set', title: '並查集：按大小合併、find 時路徑壓縮', language: 'Python',
    code: code`parent, size = list(range(8)), [1] * 8
def find(x):
    root = x
    while parent[root] != root:  # 往上找根
        root = parent[root]
    while parent[x] != root:  # 路徑壓縮
        parent[x], x = root, parent[x]
    return root
def union(a, b):
    ra, rb = find(a), find(b)
    if ra == rb: return
    if size[ra] < size[rb]: ra, rb = rb, ra
    parent[rb] = ra; size[ra] += size[rb]
for a, b in [(0, 1), (2, 3), (1, 3), (4, 5), (6, 7), (5, 7), (3, 7), (1, 2)]: union(a, b)
print(find(7) == find(2))`,
    steps: traceSteps,
    playground: { structure: 'dsu', size: 8 },
  },
  quiz: [
    {
      id: 'q-parent', prompt: '5 個元素 0 到 4，使用本課的規則（按大小合併，一樣大時 b 的根接到 a 的根下；find 做路徑壓縮），依序執行 union(0, 1)、union(2, 3)、union(3, 4)、union(1, 4)。最後的 parent 陣列是什麼？',
      options: ['[0, 0, 0, 2, 2]', '[1, 4, 3, 4, 4]', '[2, 0, 2, 2, 2]', '[2, 2, 2, 2, 2]'],
      answer: 2, explanation: 'union(0, 1)：一樣大，1 接到 0，size[0] = 2。union(2, 3)：3 接到 2，size[2] = 2。union(3, 4)：根 2（大小 2）比根 4（大小 1）大，4 接到 2，size[2] = 3。union(1, 4)：find(1) = 0、find(4) = 2（4 已直接指向根，沒有可壓縮的），大小 2 對 3，較小的根 0 接到 2 下面。結果 [2, 0, 2, 2, 2]：1 仍指向 0，要等下次 find(1) 才會被壓縮。[0, 0, 0, 2, 2] 是忽略大小、永遠把 b 的根接到 a 的根下的結果；[1, 4, 3, 4, 4] 是天真版「a 的根接到 b 的根下」；[2, 2, 2, 2, 2] 誤以為 union 會把所有點都壓縮，但壓縮只發生在 find 走過的路徑上。',
    },
    {
      id: 'q-compress', prompt: '目前 parent = [0, 0, 1, 2, 3]（一條鏈 4 → 3 → 2 → 1 → 0）。執行一次有路徑壓縮的 find(3) 之後，parent 變成什麼？',
      options: ['[0, 0, 0, 0, 0]', '[0, 0, 0, 0, 3]', '[0, 0, 1, 0, 3]', '[0, 0, 1, 2, 3]'],
      answer: 1, explanation: 'find(3) 走過 3 → 2 → 1 → 0，根是 0。路徑上的 3、2、1 都改成直接指向 0（1 本來就是），得到 [0, 0, 0, 0, 3]。4 不在這次的路徑上，仍然指向 3，要等下次 find(4) 才會被壓縮，所以 [0, 0, 0, 0, 0] 不對；[0, 0, 1, 0, 3] 只改了起點 3，漏了路上的 2；[0, 0, 1, 2, 3] 是沒有路徑壓縮的 find，它只讀不寫。',
    },
    {
      id: 'q-count', prompt: '7 個元素 0 到 6，依序執行 union(0, 1)、union(2, 3)、union(1, 2)、union(4, 5)、union(3, 0)、union(5, 4)。最後共有幾個集合？',
      options: ['1', '2', '3', '4'],
      answer: 2, explanation: '真正發生合併的只有前 4 次：{0, 1, 2, 3} 與 {4, 5}；union(3, 0) 與 union(5, 4) 的兩端早已同組，什麼也沒改。另外 6 從沒被合併過，自成一組。所以是 7 − 4 = 3 組：{0, 1, 2, 3}、{4, 5}、{6}。答 1 是每次 union 都減 1（7 − 6）；答 2 漏算了沒參與任何 union 的 6；答 4 少算了一次合併。',
    },
    {
      id: 'q-complexity', prompt: '並查集只做按大小合併、不做路徑壓縮，n 個元素時單次 find 的最差時間複雜度是多少？',
      options: ['O(1)', 'O(α(n))', 'O(log n)', 'O(n)'],
      answer: 2, explanation: '按大小合併時，一個點離根的距離只有在它所在的集合被接到至少一樣大的集合下時才加 1，而這時集合大小至少翻倍；大小最多 n，所以最多翻倍 log₂ n 次，樹高 ≤ log₂ n，find 最差 O(log n)。O(n) 是完全不優化時鏈狀退化的情況；O(α(n)) 要兩個技巧一起用，而且是攤銷的結果；O(1) 只有在每個點都直接指向根時才成立，一般做不到保證。',
    },
    {
      id: 'q-bug', prompt: '下面的 union 寫錯了。這段 Python 程式印出什麼？錯在哪裡？',
      code: { language: 'Python', text: 'parent = [0, 1, 2]\ndef find(x):\n    while parent[x] != x:\n        x = parent[x]\n    return x\ndef union(a, b):\n    parent[a] = b\nunion(0, 1)\nunion(0, 2)\nprint(find(1) == find(2))' },
      options: ['True：0、1、2 都被合併到同一組了', 'False：第二次 union 把 0 從 1 底下拔走、改接到 2，1 被留在原地；應先找根，寫成 `parent[find(a)] = find(b)`', 'False：union 應該寫成 `parent[b] = a` 才對', '程式陷入無窮迴圈'],
      answer: 1, explanation: 'union(0, 1) 讓 parent[0] = 1，組是 {0, 1}、根 1。union(0, 2) 直接改 parent[0] = 2：0 不是根，這行把 0 搬到 2 底下，1 卻還是自己一組的根。最後 parent = [2, 1, 2]，find(1) = 1、find(2) = 2，印出 False。改成 `parent[b] = a` 一樣沒有先找根，換一組操作就會出錯；parent 只有 2 → 2、1 → 1 兩個根，沒有形成圈，所以不會無窮迴圈；以為印 True 是把「union 被呼叫了」當成「真的合併了」。',
    },
    {
      id: 'q-choose', prompt: '一個社群網站有 10^5 位使用者，好友關係只會增加、不會解除。系統會陸續收到 10^5 筆「成為好友」與 10^5 次「x 和 y 是否在同一個朋友圈（可間接認識）」的查詢，兩者穿插出現。哪個做法最合適？',
      options: ['用鄰接串列存好友關係，每次查詢從 x 做一次 BFS', '用並查集：成為好友就 union，查詢就比較兩個人的 find', '用 10^5 × 10^5 的鄰接矩陣，查詢時看 matrix[x][y]', '每加一筆好友關係，就用 BFS 重新標記所有人的朋友圈編號'],
      answer: 1, explanation: '邊只增不減、查詢穿插在加邊之間，正是並查集的強項：每次操作攤銷 O(α(n))，總共約 3×10^5 次幾乎常數的操作。每次查詢做 BFS 最差要 O(V + E)，10^5 次查詢可能上看 10^10 步；每加一條邊就重新標記也一樣慢；鄰接矩陣要 10^10 格記憶體，而且 matrix[x][y] 只代表直接是朋友，不代表間接連通。如果好友關係會被解除，並查集就不適用了。',
    },
  ],
  exercises: [
    {
      id: 'e-friend-groups', title: '朋友圈：合併與查詢',
      statement: '有 n 個人，編號 1 到 n，一開始每個人自成一個朋友圈。依序處理 q 個指令：`union a b` 把 a 所在的朋友圈與 b 所在的朋友圈合併（已經同一圈就不變）；`same a b` 輸出 `yes`（a 與 b 在同一圈）或 `no`。如果 `union` 或 `same` 的 a 或 b 不在 1 到 n 之間，輸出 `Invalid` 並忽略這個指令；不認得的指令名稱（大小寫有別，後面可能帶任意參數）輸出 `Error` 並忽略。全部處理完後，再輸出一行目前的朋友圈個數。n 與 q 都可能到 2×10^5，請用按大小合併與路徑壓縮，而且 find 要寫成迭代版（不用遞迴）。',
      inputFormat: '第一行兩個整數 n 與 q。接下來 q 行，每行一個指令：`union a b`、`same a b`，或其他不認得的指令。',
      outputFormat: '依序輸出每個 `same` 的 `yes`／`no`、每個編號超出範圍的指令的 `Invalid`、每個不認得的指令的 `Error`；`union` 成功時不輸出。最後一行輸出朋友圈的個數。',
      constraints: ['1 ≤ n ≤ 2×10^5', '1 ≤ q ≤ 2×10^5', '`union` 與 `same` 後面一定有兩個整數 a、b，-10^9 ≤ a, b ≤ 10^9', 'a 可以等於 b'],
      samples: [
        { kind: 'normal', input: '5 6\nunion 1 2\nunion 3 4\nsame 1 3\nunion 2 4\nsame 1 3\nsame 5 1', output: 'no\nyes\nno\n2', note: 'union 2 4 讓 {1, 2} 與 {3, 4} 合併；5 一直自己一圈，最後剩 2 圈' },
      ],
      tests: [
        { kind: 'normal', input: '5 6\nunion 1 2\nunion 3 4\nsame 1 3\nunion 2 4\nsame 1 3\nsame 5 1', output: 'no\nyes\nno\n2', note: '範例' },
        { kind: 'normal', input: '6 8\nunion 1 2\nunion 2 3\nunion 4 5\nsame 1 3\nsame 3 4\nunion 6 4\nsame 5 6\nunion 3 5', output: 'yes\nno\nyes\n1', note: '間接相連也算同一圈；最後一次 union 把兩大圈接起來' },
        { kind: 'normal', input: '4 3\nsame 1 2\nsame 2 2\nunion 1 4', output: 'no\nyes\n3', note: '還沒有任何 union 時查詢；自己和自己一定同圈' },
        { kind: 'edge', input: '3 3\nunion 2 2\nsame 2 2\nsame 1 2', output: 'yes\nno\n3', note: '和自己 union：根相同，不合併，圈數不變' },
        { kind: 'edge', input: '4 6\nunion 1 2\nunion 2 1\nunion 1 2\nunion 3 4\nunion 4 3\nsame 1 4', output: 'no\n2', note: '重複的 union 不能讓圈數一直減少' },
        { kind: 'edge', input: '1 2\nsame 1 1\nunion 1 1', output: 'yes\n1', note: 'n = 1：只有一個人' },
        { kind: 'edge', input: '8 9\nunion 1 2\nunion 2 3\nunion 3 4\nunion 4 5\nunion 5 6\nunion 6 7\nunion 7 8\nsame 1 8\nsame 8 1', output: 'yes\nyes\n1', note: '依序連成一條鏈：天真合併會變成長鏈，按大小合併不會' },
        { kind: 'error', input: '3 4\nunion 1 4\nsame 0 1\nunion 1 2\nsame 1 2', output: 'Invalid\nInvalid\nyes\n2', note: '4 與 0 都超出 1..3：輸出 Invalid，不影響其他指令' },
        { kind: 'error', input: '3 4\nmerge 1 2\nsame 1 2\nUNION 1 2\nfind 3', output: 'Error\nno\nError\nError\n3', note: '不認得的指令（含大小寫不同、參數個數不同）都輸出 Error，而且沒有合併' },
        { kind: 'error', input: '2 2\nunion -1 2\nsame 2 2', output: 'Invalid\nyes\n2', note: '負數編號：Python 的 `parent[-1]` 不會報錯，一定要先檢查範圍' },
        { kind: 'error', input: '4 3\nunion 1 5\nlink 1 2\nunion 5 6', output: 'Invalid\nError\nInvalid\n4', note: '無效的指令都被忽略，4 個人仍各自一圈' },
      ],
      hints: [
        'parent 與 size 都開 n + 1 格，讓編號直接當索引（索引 0 不用）；朋友圈個數從 n 開始，只有真的合併（兩個根不同）時才減 1。',
        '迭代版 find 分兩趟：第一趟沿 parent 走到根；第二趟從 x 再走一次，把每個點的 parent 改成根。',
        '先檢查指令名稱，再檢查 a、b 是否在 1..n，最後才呼叫 find；超出範圍的索引在 C++ 是未定義行為、在 Java 會丟出例外，在 Python 的負數索引則會悄悄讀到錯的格子，在 JavaScript 則讀到 `undefined`、也不會報錯。',
        '不認得的指令後面可能有任意多個參數，所以一行一行讀、再切開比較穩；q 可能到 2×10^5，輸出先收集起來最後一次印出。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

std::vector<int> parent, sz;

int find(int x) {
    int root = x;
    while (parent[root] != root) root = parent[root];
    while (parent[x] != root) {  // 路徑壓縮
        int next = parent[x];
        parent[x] = root;
        x = next;
    }
    return root;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n, q;
    std::cin >> n >> q;
    parent.resize(n + 1);
    sz.assign(n + 1, 1);
    for (int i = 0; i <= n; ++i) parent[i] = i;  // 編號 1..n，索引 0 不用
    int groups = n;
    std::string line, out;
    std::getline(std::cin, line);  // 讀掉第一行剩下的換行
    for (int i = 0; i < q && std::getline(std::cin, line); ++i) {
        std::istringstream in(line);
        std::string cmd;
        long long a = 0, b = 0;
        in >> cmd;
        if (cmd != "union" && cmd != "same") {
            out += "Error\n";
            continue;
        }
        in >> a >> b;
        if (a < 1 || a > n || b < 1 || b > n) {
            out += "Invalid\n";
            continue;
        }
        int ra = find(static_cast<int>(a)), rb = find(static_cast<int>(b));
        if (cmd == "same") {
            out += ra == rb ? "yes\n" : "no\n";
        } else if (ra != rb) {
            if (sz[ra] < sz[rb]) std::swap(ra, rb);
            parent[rb] = ra;
            sz[ra] += sz[rb];
            --groups;
        }
    }
    out += std::to_string(groups) + "\n";
    std::cout << out;
    return 0;
}`,
        Python: code`import sys


def main():
    lines = sys.stdin.read().split("\n")
    n, q = map(int, lines[0].split())
    parent = list(range(n + 1))  # 編號 1..n，索引 0 不用
    size = [1] * (n + 1)

    def find(x):
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:  # 路徑壓縮
            parent[x], x = root, parent[x]
        return root

    groups = n
    out = []
    for line in lines[1:q + 1]:
        parts = line.split()
        if not parts or parts[0] not in ("union", "same"):
            out.append("Error")
            continue
        a, b = int(parts[1]), int(parts[2])
        if not (1 <= a <= n and 1 <= b <= n):
            out.append("Invalid")
            continue
        ra, rb = find(a), find(b)
        if parts[0] == "same":
            out.append("yes" if ra == rb else "no")
        elif ra != rb:
            if size[ra] < size[rb]:
                ra, rb = rb, ra
            parent[rb] = ra
            size[ra] += size[rb]
            groups -= 1
    out.append(str(groups))
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringTokenizer;

public class Main {
    static int[] parent, size;

    static int find(int x) {
        int root = x;
        while (parent[root] != root) root = parent[root];
        while (parent[x] != root) {  // 路徑壓縮
            int next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        int n = Integer.parseInt(st.nextToken()), q = Integer.parseInt(st.nextToken());
        parent = new int[n + 1];  // 編號 1..n，索引 0 不用
        size = new int[n + 1];
        for (int i = 0; i <= n; i++) { parent[i] = i; size[i] = 1; }
        int groups = n;
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < q; i++) {
            String line = br.readLine();
            if (line == null) break;
            st = new StringTokenizer(line);
            String cmd = st.hasMoreTokens() ? st.nextToken() : "";
            if (!cmd.equals("union") && !cmd.equals("same")) {
                out.append("Error\n");
                continue;
            }
            long a = Long.parseLong(st.nextToken()), b = Long.parseLong(st.nextToken());
            if (a < 1 || a > n || b < 1 || b > n) {
                out.append("Invalid\n");
                continue;
            }
            int ra = find((int) a), rb = find((int) b);
            if (cmd.equals("same")) {
                out.append(ra == rb ? "yes\n" : "no\n");
            } else if (ra != rb) {
                if (size[ra] < size[rb]) { int t = ra; ra = rb; rb = t; }
                parent[rb] = ra;
                size[ra] += size[rb];
                groups--;
            }
        }
        out.append(groups).append("\n");
        System.out.print(out);
    }
}`,
        JavaScript: code`const lines = require("fs").readFileSync(0, "utf8").split("\n");
const [n, q] = lines[0].trim().split(/\s+/).map(Number);
const parent = Array.from({ length: n + 1 }, (_, i) => i);  // 編號 1..n，索引 0 不用
const size = new Array(n + 1).fill(1);

function find(x) {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {  // 路徑壓縮
        const next = parent[x];
        parent[x] = root;
        x = next;
    }
    return root;
}

let groups = n;
const out = [];
for (let i = 1; i <= q && i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    const cmd = parts[0];
    if (cmd !== "union" && cmd !== "same") {
        out.push("Error");
        continue;
    }
    const a = Number(parts[1]), b = Number(parts[2]);
    if (a < 1 || a > n || b < 1 || b > n) {
        out.push("Invalid");
        continue;
    }
    let ra = find(a), rb = find(b);
    if (cmd === "same") {
        out.push(ra === rb ? "yes" : "no");
    } else if (ra !== rb) {
        if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
        parent[rb] = ra;
        size[ra] += size[rb];
        groups--;
    }
}
out.push(String(groups));
console.log(out.join("\n"));`,
      },
      judge: 'none',
    },
  ],
};

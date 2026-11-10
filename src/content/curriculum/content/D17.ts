import type { LessonContent, TraceStep } from '../schema';
import { graphSteps, type GraphOp } from '../simulate';

const code = String.raw;

/** The trace's operations on the Python program: each with the line it runs and why it matters. */
const traceOps: { op: GraphOp; why: string; output?: string }[] = [
  { op: { op: 'edge', from: '0', to: '1', weight: 5, line: 12 }, why: '`adj[0]` 多了 `(1, 5)`，`mat[0][1]` 從 0 變成 5。一條邊同時寫進兩種表示法。' },
  { op: { op: 'edge', from: '0', to: '2', weight: 3, line: 12 }, why: '0 的串列現在有 2 個元素；矩陣第 0 列有兩格不是 0。' },
  { op: { op: 'edge', from: '1', to: '2', weight: 2, line: 12 }, why: '' },
  { op: { op: 'edge', from: '2', to: '3', weight: 7, line: 12 }, why: '' },
  { op: { op: 'edge', from: '3', to: '0', weight: 4, line: 12 }, why: '有向邊只寫一個方向：`mat[3][0]` 是 4，`mat[0][3]` 仍是 0。5 條邊在串列裡總共 5 個元素，矩陣卻從一開始就占著 4 × 4 = 16 格。' },
  { op: { op: 'neighbors', node: '0', line: 13 }, why: '本程式的 `neighbors` 用串列：`adj[0]` 是 `[(1, 5), (2, 3)]`，只取終點得到 `[1, 2]`。' },
  { op: { op: 'neighbors', node: '3', line: 13 }, why: '3 只有一條出邊 3 → 0；0 → 3 不存在，因為邊是有向的。這一行印出 `[1, 2] [0]`。', output: '[1, 2] [0]' },
  { op: { op: 'has_edge', from: '2', to: '3', line: 14 }, why: '本程式的 `has_edge` 用矩陣：`mat[2][3]` 是 7，不是 0，所以是 True。' },
  { op: { op: 'has_edge', from: '3', to: '2', line: 14 }, why: '`mat[3][2]` 是 0：2 → 3 存在，但方向相反，3 → 2 不存在。這一行印出 `True False`。', output: '[1, 2] [0]\nTrue False' },
];

const nodes = ['0', '1', '2', '3'];
const pyValue = (v: string) => v === 'true' ? 'True' : v === 'false' ? 'False' : v === '（沒有）' ? '[]' : `[${v.split(' ').join(', ')}]`;
let printed = '';
const simulated: TraceStep[] = graphSteps('g', nodes, true, traceOps.map(t => t.op), ['list', 'matrix']).map((step, i) => {
  const t = traceOps[i];
  if (t.output) printed = t.output;
  const vars = step.vars ? Object.fromEntries(Object.entries(step.vars).map(([k, v]) => [k, pyValue(v)])) : undefined;
  return { ...step, note: `${step.note}${t.why}`, ...(vars ? { vars } : {}), ...(printed ? { output: printed } : {}) };
});

const traceSteps: TraceStep[] = [
  { line: 3, note: '建立 n = 4 個空串列（`adj`）與 4 × 4、全部是 0 的矩陣（`mat`）。`[0] * n` 寫在推導式裡面，每一列都是新的 list，不會共用。這個矩陣用 0 代表「沒有邊」，所以權重不能是 0。',
    vars: { n: '4' }, graph: { name: 'g', nodes, edges: [], directed: true, marks: [], show: ['list', 'matrix'] } },
  ...simulated,
];

/** Exercise edge test: n = 2000 (the largest n), every vertex has an edge to the next one and a self-loop. */
const BIG = 2000;
const bigInput = [BIG + ' ' + 2 * BIG,
  ...Array.from({ length: BIG }, (_, i) => i + ' ' + ((i + 1) % BIG) + '\n' + i + ' ' + i),
  '3', '1999 0', '0 1999', '1000 1000'].join('\n');
const bigOutput = ['yes', 'no', 'yes',
  ...Array.from({ length: BIG }, (_, u) => u + ': ' + [u, (u + 1) % BIG].sort((a, b) => a - b).join(' '))].join('\n');

/**
 * D17 Adjacency List / Matrix. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); the exercise's boolean matrix is one `Uint8Array` per row.
 */
export const D17: LessonContent = {
  lessonId: 'D17',
  motivation: 'D16 認識了頂點、邊、方向與權重，但圖要放進程式裡才能計算。導航軟體要存數十萬個路口與道路、社群網站要存每個人的好友名單、選課系統要存「先修完 A 才能修 B」的關係、遊戲要存地圖上哪些房間相通：同一張圖可以存成邊串列（edge list）、鄰接矩陣（adjacency matrix）或鄰接串列（adjacency list），而選哪一種，決定了記憶體夠不夠用，以及「u 和 v 之間有沒有邊」「u 的鄰居有哪些」這兩個問題要花多少時間。這一課學會從邊的輸入建立這三種表示法、比較它們的成本，並依頂點數、邊數與題目需要的操作做選擇。限制也要清楚：表示法只是把圖存好，走訪整張圖、找最短路徑還需要之後的 BFS 與 DFS 等演算法；而且沒有一種表示法在所有操作上都最好。',
  sections: [
    {
      id: 'three-forms', title: '三種表示法：邊串列、鄰接矩陣、鄰接串列',
      blocks: [
        { type: 'p', text: '本課沿用 D16 的約定：n 個頂點編號 0 到 n − 1（0-based），V 是頂點數、E 是邊數（輸入裡常寫成 m）。題目若用 1 到 n 編號，讀入時先減 1，或者把陣列開成 n + 1 格、不用第 0 格。' },
        { type: 'list', items: [
          '邊串列（edge list）：照輸入的樣子，把 m 條邊存成 m 個 `(u, v)`（加權圖是 `(u, v, w)`）。最省事，也方便「把所有邊依權重排序」，例如最小生成樹的 Kruskal 演算法就是這樣用。但要回答「u 的鄰居有哪些」，只能把 m 條邊全部看過一遍。',
          '鄰接矩陣（adjacency matrix）：開一個 V × V 的二維陣列，`mat[u][v]` 是 1 表示有 u → v 的邊、0 表示沒有；加權圖則直接存權重。無向邊 u – v 要同時設定 `mat[u][v]` 與 `mat[v][u]`，所以無向圖的矩陣一定對稱（symmetric）：`mat[u][v] == mat[v][u]`。',
          '鄰接串列（adjacency list）：每個頂點一個串列，`adj[u]` 存 u 的所有鄰居（有向圖是出邊的終點）。無向邊 u – v 要加兩次：`adj[u]` 加 v、`adj[v]` 加 u。所有串列的元素總數，有向圖是 E、無向圖是 2E。',
        ] },
        { type: 'p', text: '下面把同一張有向圖（4 個頂點、5 條邊）同時存成三種形式並印出。矩陣的第 u 列（row）就是 u 的出邊，第 v 行（column）則是所有指向 v 的邊；鄰接串列的第 u 個串列和矩陣第 u 列記的是同一件事，只是只寫下「有」的那些格子。' },
        { type: 'example', id: 'same-graph' },
        { type: 'callout', tone: 'tip', title: '讀矩陣的方向', text: '本課約定「列是起點、行是終點」：`mat[u][v]` 是 u → v。看 `mat[1]` 這一整列是「1 指向誰」，看第 1 行（`mat[0][1]`、`mat[1][1]`、`mat[2][1]`……）是「誰指向 1」。有向圖把兩者搞反，答案就變成反方向的邊。' },
      ],
    },
    {
      id: 'weighted-convert', title: '加權圖與表示法之間的轉換',
      blocks: [
        { type: 'p', text: '加權圖（weighted graph）的每條邊多一個數字 w（距離、時間、費用）。矩陣直接在 `mat[u][v]` 存 w；鄰接串列則在 `adj[u]` 裡存一對 `(v, w)`。各語言的慣用寫法：C++ 用 `std::vector<std::vector<std::pair<int, int>>>`，`adj[u].push_back({v, w})`；Python 用 list of tuple，`adj[u].append((v, w))`；Java 可以用 `List<List<int[]>>` 存 `new int[]{v, w}`，或宣告一個小小的 `record Edge(int to, int w) {}`，欄位有名字，比 `e[0]`、`e[1]` 更不容易寫錯；JavaScript 存成兩個元素的陣列，`adj[u].push([v, w])`，讀取時用解構 `for (const [v, w] of adj[u])`。' },
        { type: 'example', id: 'weighted-list' },
        { type: 'callout', tone: 'warning', title: '加權矩陣：0 可能是合法的權重', text: '用 0 代表「沒有邊」，前提是權重不會是 0。若題目允許權重 0（或負數），就要先把每格填成一個不可能出現的值（例如 -1，或一個很大的 INF），有邊時才寫入權重；或者另開一個布林矩陣記「有沒有邊」。另外，同一對 (u, v) 出現兩條不同權重的邊（重邊）時，矩陣一格只放得下一個值，通常保留較小的那個；鄰接串列則可以把兩條都存下來。' },
        { type: 'p', text: '表示法之間可以互相轉換：邊串列 → 鄰接串列或矩陣是 O(V + E)（矩陣要先花 O(V²) 開好、清成 0）；矩陣 → 鄰接串列要掃過每一格，是 O(V²)；鄰接串列 → 邊串列是 O(V + E)。常見的做法是讀入時就直接建成需要的形式；某些題目也會同時保留兩種，例如用鄰接串列走訪、用矩陣查邊。' },
        { type: 'example', id: 'convert' },
      ],
    },
    {
      id: 'costs', title: '成本比較：稀疏圖與稠密圖',
      blocks: [
        { type: 'p', text: '兩個最常見的問題是「u 和 v 之間有沒有邊（edge check）」與「列出 u 的所有鄰居」。矩陣查邊只看一格，O(1)；但列出鄰居要掃過整列 V 格，不管 u 實際上只有幾個鄰居。鄰接串列列出鄰居只走過 deg(u) 個元素（deg 是度數，有向圖指出度），但查邊要在 `adj[u]` 裡一個一個找，O(deg(u))。如果需要在很大的稀疏圖上頻繁查邊，可以讓每個頂點存一個雜湊集合（C++ `std::unordered_set`、Python `set`、Java `HashSet`、JavaScript `Set`），查邊平均 O(1)，代價是記憶體與常數較大，而且集合沒有固定順序，輸出前要先排序。' },
        { type: 'example', id: 'queries-compared' },
        { type: 'table', head: ['操作', '邊串列', '鄰接矩陣', '鄰接串列（動態陣列）', '每點一個雜湊集合'], rows: [
          ['記憶體', 'O(E)', 'O(V²)', 'O(V + E)', 'O(V + E)，常數較大'],
          ['查 u → v 有沒有邊', 'O(E)', 'O(1)', 'O(deg(u))', '平均 O(1)'],
          ['列出 u 的鄰居', 'O(E)', 'O(V)', 'O(deg(u))', 'O(deg(u))，順序不固定'],
          ['走過所有的邊', 'O(E)', 'O(V²)', 'O(V + E)', 'O(V + E)'],
          ['加入一條邊', 'O(1)（攤銷）', 'O(1)', 'O(1)（攤銷）', '平均 O(1)'],
          ['刪除一條邊', 'O(E)', 'O(1)', 'O(deg(u))', '平均 O(1)'],
        ] },
        { type: 'p', text: '稀疏圖（sparse graph）是邊數遠少於 V² 的圖，例如道路網、好友關係，E 通常和 V 同一個等級；稠密圖（dense graph）是邊數接近上限的圖（有向圖最多 V(V − 1) 條不含自環的邊，無向圖最多 V(V − 1) / 2 條）。矩陣的記憶體只看 V、不看 E，所以在稀疏圖上絕大部分的格子都是 0，白白浪費。之後的 BFS 與 DFS 需要「列出每個頂點的鄰居」，用鄰接串列總共 O(V + E)，用矩陣則是 O(V²)。' },
        { type: 'callout', tone: 'warning', title: '頂點一多，矩陣就放不下', text: 'V = 10^4 時矩陣有 10^8 格，用 4 位元組的 `int` 約 400 MB，已超過常見的記憶體限制；V = 10^5 時是 10^10 格，就算每格只用 1 個位元（bit）也要約 1.25 GB，用 1 位元組要約 10 GB。看到 V 達到 10^5，就不要考慮矩陣，改用鄰接串列。開陣列前先算一下 V² 有多大。' },
        { type: 'table', head: ['情況', '建議的表示法', '原因'], rows: [
          ['V ≤ 幾千，而且常問「u、v 之間有沒有邊」', '鄰接矩陣', 'V² 放得下，查邊 O(1)'],
          ['圖很稠密（E 接近 V²）', '鄰接矩陣', '反正每格都用得到，寫法也最簡單'],
          ['V 達 10^5 以上、E 和 V 同級（稀疏）', '鄰接串列', '記憶體 O(V + E)；走訪鄰居只花 O(deg)'],
          ['大型稀疏圖但要常查邊', '每點一個雜湊集合（或排序後二分搜尋）', '記憶體仍是 O(V + E)，查邊平均 O(1)（二分搜尋是 O(log deg)）'],
          ['要把所有邊依權重排序、逐條處理', '邊串列', '排序整個串列就好，不需要鄰居結構'],
        ] },
      ],
    },
    {
      id: 'languages', title: '四種語言的寫法與常見錯誤',
      blocks: [
        { type: 'table', head: ['', 'C++17', 'Python 3', 'Java 17', 'JavaScript'], rows: [
          ['鄰接串列', '`std::vector<std::vector<int>> adj(n);`', '`adj = [[] for _ in range(n)]`', '`List<List<Integer>> adj`，迴圈 `add(new ArrayList<>())` n 次', '`Array.from({ length: n }, () => [])`'],
          ['加權鄰接串列', '`std::vector<std::vector<std::pair<int, int>>>`', '`adj[u].append((v, w))`', '`List<List<int[]>>` 或 `List<List<Edge>>`（record）', '`adj[u].push([v, w])`'],
          ['鄰接矩陣', '`std::vector<std::vector<int>> mat(n, std::vector<int>(n));`', '`mat = [[0] * n for _ in range(n)]`', '`int[][] mat = new int[n][n];`（預設全是 0）', '`Array.from({ length: n }, () => new Array(n).fill(0))`'],
          ['布林矩陣', '`std::vector<std::vector<char>>`', '`[bytearray(n) for _ in range(n)]`', '`boolean[][]`（預設全是 false）', '`Array.from({ length: n }, () => new Uint8Array(n))`（預設全是 0）'],
          ['查邊', '`mat[u][v] != 0`', '`mat[u][v] != 0`', '`mat[u][v] != 0`', '`mat[u][v] !== 0`'],
        ] },
        { type: 'p', text: 'C++：`std::vector<std::vector<int>> adj(n)` 一次開好 n 個空的 vector；`std::vector<std::vector<int>> mat(n, std::vector<int>(n))` 開 n 列、每列 n 個 0（vector 會把元素初始化成 0）。不要寫 `int mat[n][n];`：n 是執行時才知道的值時，這是可變長度陣列（VLA），不是標準 C++，只是 g++ 的擴充功能；而且它放在堆疊（stack）上，n 稍大就會堆疊溢位。只存有沒有邊時可以用 `char`；`std::vector<bool>` 雖然把每格壓成 1 個位元，但它是特殊化的版本，取出的不是真正的 `bool&`，初學時容易踩到奇怪的行為。' },
        { type: 'p', text: 'Python：鄰接串列寫 `[[] for _ in range(n)]`，矩陣寫 `[[0] * n for _ in range(n)]`。內層的 `[0] * n` 沒問題，因為 0 是不可變的整數；問題出在外層用乘法複製 list。Python 的串列存的是參考（reference），`[[0] * n] * n` 是同一個 list 的 n 個參考，`[[]] * n` 也一樣。另外，Python 的負索引不會出錯：`mat[-1]` 是最後一列，所以頂點編號不合法時程式不會當掉，只會默默讀錯資料，要自己先檢查 `0 <= u < n`。' },
        { type: 'callout', tone: 'warning', title: 'Python：`[[0] * n] * n` 的每一列是同一個 list', text: '`mat = [[0] * 3] * 3` 之後執行 `mat[0][1] = 1`，印出來是 `[[0, 1, 0], [0, 1, 0], [0, 1, 0]]`：三列其實是同一個物件，改一列等於三列都改。鄰接串列寫成 `[[]] * n` 也一樣，`adj[0].append(1)` 會讓每個頂點都多一個鄰居 1。外層一定要用推導式 `[... for _ in range(n)]`，每次產生新的 list。' },
        { type: 'p', text: 'Java：`int[][] mat = new int[n][n]` 會自動填 0，`boolean[][]` 會自動填 false。鄰接串列寫 `List<List<Integer>> adj = new ArrayList<>();` 再用迴圈加入 n 個 `new ArrayList<>()`；`adj.get(u)` 一開始就是空串列，不是 null。泛型不能放基本型別，所以 `List<Integer>` 裡的每個 `int` 都會自動裝箱（autoboxing）成 `Integer` 物件：串列實際存的是指向物件的參考，記憶體大約是 `int[]` 的數倍，存取也慢一些，邊數達到數百萬時就會感覺到。另外 `new ArrayList<Integer>[n]`（泛型陣列）無法編譯，用 `List<List<Integer>>` 最省事。' },
        { type: 'p', text: 'JavaScript：鄰接串列寫 `Array.from({ length: n }, () => [])`，矩陣寫 `Array.from({ length: n }, () => new Array(n).fill(0))`，函式每次都產生新的陣列。和 Python 一樣不能用 `new Array(n).fill([])` 或 `.fill(new Array(n).fill(0))`：`fill` 放進去的是同一個陣列的參考，改一列等於每一列都改。只存有沒有邊時，每列用 `new Uint8Array(n)`（每格 1 位元組，預設全是 0）。u 越界時 `mat[u]` 是 `undefined`，再取 `[v]` 會丟出 `TypeError`；v 越界時 `mat[u][v]` 則默默得到 `undefined`，不會報錯。負索引 `mat[-1]` 也是 `undefined`，不會像 Python 那樣讀到最後一列。' },
        { type: 'callout', tone: 'warning', title: '無向圖忘了加反方向', text: '無向邊 u – v 只寫了 `mat[u][v] = 1` 或 `adj[u].push_back(v)`，就等於建了一張有向圖：從 u 查得到 v，從 v 卻查不到 u，之後的走訪會漏掉一半的路。讀入無向邊時，兩個方向都要寫；寫完可以檢查矩陣是否對稱，或鄰接串列的元素總數是否為 2E。' },
      ],
    },
  ],
  examples: [
    {
      id: 'same-graph', title: '同一張有向圖：邊串列、矩陣與鄰接串列', description: '4 個頂點、5 條有向邊。依輸入順序印出邊串列，再印出 4 × 4 的矩陣與每個頂點的鄰接串列。',
      output: 'edges: 0->1 0->2 1->2 2->3 3->1\nmatrix:\n0 1 1 0\n0 0 1 0\n0 0 0 1\n0 1 0 0\nlists:\n0: 1 2\n1: 2\n2: 3\n3: 1',
      code: {
        'C++': code`#include <iostream>
#include <utility>
#include <vector>

int main() {
    int n = 4;
    std::vector<std::pair<int, int>> edges = {{0, 1}, {0, 2}, {1, 2}, {2, 3}, {3, 1}};
    std::vector<std::vector<int>> mat(n, std::vector<int>(n, 0));
    std::vector<std::vector<int>> adj(n);
    std::cout << "edges:";
    for (const auto& [u, v] : edges) {
        std::cout << " " << u << "->" << v;
        mat[u][v] = 1;  // 有向：只設定 u 到 v
        adj[u].push_back(v);
    }
    std::cout << "\nmatrix:\n";
    for (int u = 0; u < n; ++u)
        for (int v = 0; v < n; ++v) std::cout << mat[u][v] << (v + 1 < n ? " " : "\n");
    std::cout << "lists:\n";
    for (int u = 0; u < n; ++u) {
        std::cout << u << ":";
        for (int v : adj[u]) std::cout << " " << v;
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`n = 4
edges = [(0, 1), (0, 2), (1, 2), (2, 3), (3, 1)]
mat = [[0] * n for _ in range(n)]
adj = [[] for _ in range(n)]
for u, v in edges:
    mat[u][v] = 1  # 有向：只設定 u 到 v
    adj[u].append(v)
print("edges:", " ".join(f"{u}->{v}" for u, v in edges))
print("matrix:")
for row in mat:
    print(*row)
print("lists:")
for u in range(n):
    print(f"{u}:", *adj[u])`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        int n = 4;
        int[][] edges = {{0, 1}, {0, 2}, {1, 2}, {2, 3}, {3, 1}};
        int[][] mat = new int[n][n];  // 預設全是 0
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        StringBuilder sb = new StringBuilder("edges:");
        for (int[] e : edges) {
            sb.append(" ").append(e[0]).append("->").append(e[1]);
            mat[e[0]][e[1]] = 1;  // 有向：只設定 u 到 v
            adj.get(e[0]).add(e[1]);
        }
        System.out.println(sb);
        System.out.println("matrix:");
        for (int[] row : mat) {
            StringBuilder line = new StringBuilder();
            for (int v = 0; v < n; v++) line.append(v > 0 ? " " : "").append(row[v]);
            System.out.println(line);
        }
        System.out.println("lists:");
        for (int u = 0; u < n; u++) {
            StringBuilder line = new StringBuilder(u + ":");
            for (int v : adj.get(u)) line.append(" ").append(v);
            System.out.println(line);
        }
    }
}`,
        JavaScript: code`const n = 4;
const edges = [[0, 1], [0, 2], [1, 2], [2, 3], [3, 1]];
const mat = Array.from({ length: n }, () => new Array(n).fill(0));
const adj = Array.from({ length: n }, () => []);
for (const [u, v] of edges) {
    mat[u][v] = 1;  // 有向：只設定 u 到 v
    adj[u].push(v);
}
console.log("edges: " + edges.map(([u, v]) => u + "->" + v).join(" "));
console.log("matrix:");
for (const row of mat) console.log(row.join(" "));
console.log("lists:");
for (let u = 0; u < n; u++) console.log(u + ": " + adj[u].join(" "));`,
      },
    },
    {
      id: 'weighted-list', title: '加權鄰接串列：存 (v, w) 並查權重', description: '有向加權圖，每個頂點的串列存 (終點, 權重)。印出每個串列（沒有出邊印 -），再沿著串列找出 2 → 1 與 3 → 0 的權重。',
      output: '0: (1, 4) (2, 1)\n1: (3, 5)\n2: (1, 2) (3, 8)\n3: -\nw(2->1) = 2\nw(3->0) = none',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <utility>
#include <vector>

using Graph = std::vector<std::vector<std::pair<int, int>>>;  // adj[u] 裡放 (v, w)

int weightOf(const Graph& adj, int u, int v) {  // 找不到回傳 -1
    for (const auto& [to, w] : adj[u])
        if (to == v) return w;
    return -1;
}

int main() {
    int n = 4;
    int edges[][3] = {{0, 1, 4}, {0, 2, 1}, {2, 1, 2}, {1, 3, 5}, {2, 3, 8}};
    Graph adj(n);
    for (const auto& e : edges) adj[e[0]].push_back({e[1], e[2]});
    for (int u = 0; u < n; ++u) {
        std::cout << u << ":";
        if (adj[u].empty()) std::cout << " -";
        for (const auto& [v, w] : adj[u]) std::cout << " (" << v << ", " << w << ")";
        std::cout << "\n";
    }
    int b = weightOf(adj, 3, 0);
    std::cout << "w(2->1) = " << weightOf(adj, 2, 1) << "\n";
    std::cout << "w(3->0) = " << (b < 0 ? "none" : std::to_string(b)) << "\n";
    return 0;
}`,
        Python: code`n = 4
edges = [(0, 1, 4), (0, 2, 1), (2, 1, 2), (1, 3, 5), (2, 3, 8)]
adj = [[] for _ in range(n)]  # adj[u] 裡放 (v, w)
for u, v, w in edges:
    adj[u].append((v, w))


def weight_of(u, v):  # 找不到回傳 None
    for to, w in adj[u]:
        if to == v:
            return w
    return None


for u in range(n):
    print(f"{u}:", " ".join(f"({v}, {w})" for v, w in adj[u]) or "-")
print("w(2->1) =", weight_of(2, 1))
w = weight_of(3, 0)
print("w(3->0) =", "none" if w is None else w)`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    record Edge(int to, int w) {}  // 一條出邊：終點與權重

    static int weightOf(List<List<Edge>> adj, int u, int v) {  // 找不到回傳 -1
        for (Edge e : adj.get(u)) if (e.to() == v) return e.w();
        return -1;
    }

    public static void main(String[] args) {
        int n = 4;
        int[][] edges = {{0, 1, 4}, {0, 2, 1}, {2, 1, 2}, {1, 3, 5}, {2, 3, 8}};
        List<List<Edge>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) adj.get(e[0]).add(new Edge(e[1], e[2]));
        for (int u = 0; u < n; u++) {
            StringBuilder line = new StringBuilder(u + ":");
            if (adj.get(u).isEmpty()) line.append(" -");
            for (Edge e : adj.get(u)) line.append(" (").append(e.to()).append(", ").append(e.w()).append(")");
            System.out.println(line);
        }
        int b = weightOf(adj, 3, 0);
        System.out.println("w(2->1) = " + weightOf(adj, 2, 1));
        System.out.println("w(3->0) = " + (b < 0 ? "none" : String.valueOf(b)));
    }
}`,
        JavaScript: code`const n = 4;
const edges = [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 5], [2, 3, 8]];
const adj = Array.from({ length: n }, () => []);  // adj[u] 裡放 [v, w]
for (const [u, v, w] of edges) adj[u].push([v, w]);

function weightOf(u, v) {  // 找不到回傳 null
    for (const [to, w] of adj[u]) {
        if (to === v) return w;
    }
    return null;
}

for (let u = 0; u < n; u++) {
    const items = adj[u].map(([v, w]) => "(" + v + ", " + w + ")");
    console.log(u + ": " + (items.length > 0 ? items.join(" ") : "-"));
}
console.log("w(2->1) = " + weightOf(2, 1));
const b = weightOf(3, 0);
console.log("w(3->0) = " + (b === null ? "none" : b));`,
      },
    },
    {
      id: 'convert', title: '矩陣 → 鄰接串列 → 邊串列', description: '從一個 3 × 3 的有向圖矩陣出發：掃過每一列建立鄰接串列，再由鄰接串列列出所有的邊。',
      output: '0: 1\n1: 2\n2: 0 1\nedges: 0->1 1->2 2->0 2->1',
      code: {
        'C++': code`#include <iostream>
#include <utility>
#include <vector>

int main() {
    std::vector<std::vector<int>> mat = {{0, 1, 0}, {0, 0, 1}, {1, 1, 0}};
    int n = static_cast<int>(mat.size());
    std::vector<std::vector<int>> adj(n);
    for (int u = 0; u < n; ++u)  // 矩陣 → 串列：掃過每一格，O(V²)
        for (int v = 0; v < n; ++v)
            if (mat[u][v] != 0) adj[u].push_back(v);
    std::vector<std::pair<int, int>> edges;
    for (int u = 0; u < n; ++u)  // 串列 → 邊串列：O(V + E)
        for (int v : adj[u]) edges.push_back({u, v});
    for (int u = 0; u < n; ++u) {
        std::cout << u << ":";
        for (int v : adj[u]) std::cout << " " << v;
        std::cout << "\n";
    }
    std::cout << "edges:";
    for (const auto& [u, v] : edges) std::cout << " " << u << "->" << v;
    std::cout << "\n";
    return 0;
}`,
        Python: code`mat = [[0, 1, 0], [0, 0, 1], [1, 1, 0]]
n = len(mat)
adj = [[v for v in range(n) if mat[u][v] != 0] for u in range(n)]  # 矩陣 → 串列：O(V²)
edges = [(u, v) for u in range(n) for v in adj[u]]  # 串列 → 邊串列：O(V + E)
for u in range(n):
    print(f"{u}:", *adj[u])
print("edges:", " ".join(f"{u}->{v}" for u, v in edges))`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        int[][] mat = {{0, 1, 0}, {0, 0, 1}, {1, 1, 0}};
        int n = mat.length;
        List<List<Integer>> adj = new ArrayList<>();
        for (int u = 0; u < n; u++) {  // 矩陣 → 串列：掃過每一格，O(V²)
            adj.add(new ArrayList<>());
            for (int v = 0; v < n; v++) if (mat[u][v] != 0) adj.get(u).add(v);
        }
        List<int[]> edges = new ArrayList<>();
        for (int u = 0; u < n; u++)  // 串列 → 邊串列：O(V + E)
            for (int v : adj.get(u)) edges.add(new int[]{u, v});
        for (int u = 0; u < n; u++) {
            StringBuilder line = new StringBuilder(u + ":");
            for (int v : adj.get(u)) line.append(" ").append(v);
            System.out.println(line);
        }
        StringBuilder sb = new StringBuilder("edges:");
        for (int[] e : edges) sb.append(" ").append(e[0]).append("->").append(e[1]);
        System.out.println(sb);
    }
}`,
        JavaScript: code`const mat = [[0, 1, 0], [0, 0, 1], [1, 1, 0]];
const n = mat.length;
const adj = Array.from({ length: n }, () => []);
for (let u = 0; u < n; u++) {  // 矩陣 → 串列：掃過每一格，O(V²)
    for (let v = 0; v < n; v++) {
        if (mat[u][v] !== 0) adj[u].push(v);
    }
}
const edges = [];
for (let u = 0; u < n; u++) {  // 串列 → 邊串列：O(V + E)
    for (const v of adj[u]) edges.push([u, v]);
}
for (let u = 0; u < n; u++) console.log(u + ": " + adj[u].join(" "));
console.log("edges: " + edges.map(([u, v]) => u + "->" + v).join(" "));`,
      },
    },
    {
      id: 'queries-compared', title: '查邊與列鄰居：矩陣和串列各自的做法', description: '同一張無向圖（5 個頂點、5 條邊）同時存成矩陣與鄰接串列。列出 1 的鄰居時，矩陣要掃 5 格、串列只讀 3 個元素；查邊時兩者答案相同。',
      output: 'neighbors(1) by matrix: 0 2 3 (scanned 5 cells)\nneighbors(1) by list: 0 2 3 (read 3 items)\nhas_edge(3, 1): matrix yes, list yes\nhas_edge(2, 4): matrix no, list no',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

int main() {
    int n = 5;
    int edges[][2] = {{0, 1}, {0, 4}, {1, 2}, {1, 3}, {3, 4}};
    std::vector<std::vector<int>> mat(n, std::vector<int>(n, 0));
    std::vector<std::vector<int>> adj(n);
    for (const auto& e : edges) {
        int u = e[0], v = e[1];
        mat[u][v] = mat[v][u] = 1;  // 無向：兩格都要設定
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    std::cout << "neighbors(1) by matrix:";
    for (int v = 0; v < n; ++v)  // 掃過整列：O(V)
        if (mat[1][v]) std::cout << " " << v;
    std::cout << " (scanned " << n << " cells)\n";
    std::cout << "neighbors(1) by list:";
    for (int v : adj[1]) std::cout << " " << v;  // O(deg)
    std::cout << " (read " << adj[1].size() << " items)\n";
    int queries[][2] = {{3, 1}, {2, 4}};
    for (const auto& q : queries) {
        bool byMatrix = mat[q[0]][q[1]] == 1;  // O(1)
        bool byList = std::find(adj[q[0]].begin(), adj[q[0]].end(), q[1]) != adj[q[0]].end();  // O(deg)
        std::cout << "has_edge(" << q[0] << ", " << q[1] << "): matrix " << (byMatrix ? "yes" : "no")
                  << ", list " << (byList ? "yes" : "no") << "\n";
    }
    return 0;
}`,
        Python: code`n = 5
edges = [(0, 1), (0, 4), (1, 2), (1, 3), (3, 4)]
mat = [[0] * n for _ in range(n)]
adj = [[] for _ in range(n)]
for u, v in edges:
    mat[u][v] = mat[v][u] = 1  # 無向：兩格都要設定
    adj[u].append(v)
    adj[v].append(u)
by_matrix = [v for v in range(n) if mat[1][v]]  # 掃過整列：O(V)
print("neighbors(1) by matrix:", *by_matrix, f"(scanned {n} cells)")
print("neighbors(1) by list:", *adj[1], f"(read {len(adj[1])} items)")
for u, v in [(3, 1), (2, 4)]:
    by_m = "yes" if mat[u][v] else "no"  # O(1)
    by_l = "yes" if v in adj[u] else "no"  # O(deg)
    print(f"has_edge({u}, {v}): matrix {by_m}, list {by_l}")`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        int n = 5;
        int[][] edges = {{0, 1}, {0, 4}, {1, 2}, {1, 3}, {3, 4}};
        int[][] mat = new int[n][n];
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) {
            int u = e[0], v = e[1];
            mat[u][v] = mat[v][u] = 1;  // 無向：兩格都要設定
            adj.get(u).add(v);
            adj.get(v).add(u);
        }
        StringBuilder byMatrix = new StringBuilder("neighbors(1) by matrix:");
        for (int v = 0; v < n; v++) if (mat[1][v] == 1) byMatrix.append(" ").append(v);  // O(V)
        System.out.println(byMatrix + " (scanned " + n + " cells)");
        StringBuilder byList = new StringBuilder("neighbors(1) by list:");
        for (int v : adj.get(1)) byList.append(" ").append(v);  // O(deg)
        System.out.println(byList + " (read " + adj.get(1).size() + " items)");
        int[][] queries = {{3, 1}, {2, 4}};
        for (int[] q : queries) {
            String m = mat[q[0]][q[1]] == 1 ? "yes" : "no";  // O(1)
            String l = adj.get(q[0]).contains(q[1]) ? "yes" : "no";  // O(deg)
            System.out.println("has_edge(" + q[0] + ", " + q[1] + "): matrix " + m + ", list " + l);
        }
    }
}`,
        JavaScript: code`const n = 5;
const edges = [[0, 1], [0, 4], [1, 2], [1, 3], [3, 4]];
const mat = Array.from({ length: n }, () => new Array(n).fill(0));
const adj = Array.from({ length: n }, () => []);
for (const [u, v] of edges) {
    mat[u][v] = mat[v][u] = 1;  // 無向：兩格都要設定
    adj[u].push(v);
    adj[v].push(u);
}
const byMatrix = [];
for (let v = 0; v < n; v++) {  // 掃過整列：O(V)
    if (mat[1][v] === 1) byMatrix.push(v);
}
console.log("neighbors(1) by matrix: " + byMatrix.join(" ") + " (scanned " + n + " cells)");
console.log("neighbors(1) by list: " + adj[1].join(" ") + " (read " + adj[1].length + " items)");  // O(deg)
for (const [u, v] of [[3, 1], [2, 4]]) {
    const byM = mat[u][v] === 1 ? "yes" : "no";      // O(1)
    const byL = adj[u].includes(v) ? "yes" : "no";  // O(deg)
    console.log("has_edge(" + u + ", " + v + "): matrix " + byM + ", list " + byL);
}`,
      },
    },
  ],
  visualization: {
    kind: 'graph-traversal', title: '同一張有向加權圖，同時存成鄰接串列與鄰接矩陣', language: 'Python',
    code: code`n = 4
adj = [[] for _ in range(n)]
mat = [[0] * n for _ in range(n)]
def add_edge(u, v, w):
    adj[u].append((v, w))
    mat[u][v] = w
def neighbors(u):
    return [v for v, w in adj[u]]
def has_edge(u, v):
    return mat[u][v] != 0
for u, v, w in [(0, 1, 5), (0, 2, 3), (1, 2, 2), (2, 3, 7), (3, 0, 4)]:
    add_edge(u, v, w)
print(neighbors(0), neighbors(3))
print(has_edge(2, 3), has_edge(3, 2))`,
    steps: traceSteps,
  },
  quiz: [
    {
      id: 'q-memory', prompt: '一張圖有 V = 10^4 個頂點。用鄰接矩陣存它需要多少格？如果每格是 4 位元組的 `int`，大約佔多少記憶體？',
      options: ['10^4 格，約 40 KB', '10^8 格，約 400 MB', '2 × 10^4 格，約 80 KB', '10^16 格，根本無法估計'],
      answer: 1, explanation: '矩陣是 V × V = 10^4 × 10^4 = 10^8 格，乘上 4 位元組是 4 × 10^8 位元組，約 400 MB，通常已超過題目的記憶體限制。「10^4 格」是把矩陣當成一維陣列，只算了一列；「2 × 10^4 格」把「一列加一行」當成全部；「10^16 格」是把 V² 又平方了一次。矩陣的大小和邊數無關，就算圖裡只有 10 條邊也一樣大。',
    },
    {
      id: 'q-choose', prompt: '一張無向圖有 10^5 個頂點、2 × 10^5 條邊，接下來要反覆「列出某個頂點的所有鄰居」來走訪整張圖。哪一種表示法最合適？',
      options: ['鄰接矩陣，因為查邊只要 O(1)', '用 `std::vector<bool>` 的鄰接矩陣，每格只佔 1 個位元', '鄰接串列', '只保留邊串列，需要時再掃過所有邊'],
      answer: 2, explanation: '這是稀疏圖（E 和 V 同級）。鄰接串列的記憶體是 O(V + E)，約 5 × 10^5 個元素（無向邊存兩次）；列出 u 的鄰居只花 O(deg(u))，整張圖走訪一次是 O(V + E)。矩陣有 10^10 格，用 int 要約 40 GB；就算壓成每格 1 個位元仍要約 1.25 GB，而且列出鄰居每次要掃 10^5 格。邊串列每找一次鄰居都要掃過 2 × 10^5 條邊，走訪整張圖會變成 O(V × E)。',
    },
    {
      id: 'q-complexity', prompt: '要列出頂點 u 的所有鄰居，用鄰接矩陣和用鄰接串列的時間複雜度各是多少？（deg(u) 是 u 的度數）',
      options: ['矩陣 O(V)，串列 O(deg(u))', '矩陣 O(1)，串列 O(V)', '兩者都是 O(deg(u))', '矩陣 O(V²)，串列 O(E)'],
      answer: 0, explanation: '矩陣不知道哪些格子是 1，只能把第 u 列的 V 格全部看過，是 O(V)，就算 u 只有 1 個鄰居也一樣。鄰接串列的 `adj[u]` 裡只放真正的鄰居，走過它就是 O(deg(u))。「矩陣 O(1)」是把查邊（只看一格）和列鄰居搞混了；「矩陣 O(V²)」是走過所有邊的成本，不是列出一個頂點的鄰居。',
    },
    {
      id: 'q-row', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'n = 4\nmat = [[0] * n for _ in range(n)]\nfor u, v in [(0, 1), (1, 2), (2, 1), (1, 3), (3, 0)]:\n    mat[u][v] = 1\nprint(mat[1])' },
      options: ['[0, 0, 1, 1]', '[1, 0, 1, 0]', '[1, 0, 1, 1]', '[0, 1, 1, 1]'],
      answer: 0, explanation: '`mat[1]` 是第 1 列，記錄「從 1 出發」的邊：只有 1 → 2 與 1 → 3，所以是 `[0, 0, 1, 1]`。`[1, 0, 1, 0]` 是第 1 行（`mat[0][1]`、`mat[2][1]` 是 1），代表「指向 1」的邊；`[1, 0, 1, 1]` 是把圖當成無向圖，連 0 → 1、2 → 1 也算成 1 的鄰居；`[0, 1, 1, 1]` 把沒有的自環 1 → 1 也算進去了。',
    },
    {
      id: 'q-shared-rows', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'n = 3\nmat = [[0] * n] * n\nmat[0][1] = 1\nprint(mat)' },
      options: ['[[0, 1, 0], [0, 0, 0], [0, 0, 0]]', '[[0, 1, 0], [0, 1, 0], [0, 1, 0]]', '[[1, 1, 1], [0, 0, 0], [0, 0, 0]]', '丟出 TypeError：list 不能相乘'],
      answer: 1, explanation: '`[[0] * n] * n` 先建立一個 list `[0, 0, 0]`，再把「指向它的參考」複製 3 份，三列是同一個物件。改 `mat[0][1]` 等於改了唯一的那一列，所以三列都變成 `[0, 1, 0]`。以為只有第 0 列改變，是把它當成了三個獨立的 list，那要寫成 `[[0] * n for _ in range(n)]`；list 可以用 `*` 重複，不會丟出 TypeError。內層的 `[0] * n` 沒問題，因為整數不可變。',
    },
    {
      id: 'q-symmetry', prompt: '下面的 C++ 片段要建立無向圖的鄰接矩陣（`mat` 已開成 n × n 的 0）。輸入兩條邊 `0 1` 與 `1 2` 之後，`mat[1][0]` 是多少？',
      code: { language: 'C++', text: 'for (int i = 0; i < m; ++i) {\n    int u, v;\n    std::cin >> u >> v;\n    mat[u][v] = 1;\n}' },
      options: ['1，程式是正確的', '編譯錯誤：二維 vector 不能寫 `mat[u][v]`', '1，因為矩陣會自動保持對稱', '0：無向邊要同時設定 `mat[u][v]` 與 `mat[v][u]`'],
      answer: 3, explanation: '程式只設定了 `mat[0][1]` 與 `mat[1][2]`，`mat[1][0]` 仍是 0，於是「從 1 查 0」會得到沒有邊：這其實建成了一張有向圖。無向邊必須寫 `mat[u][v] = mat[v][u] = 1`，矩陣才會對稱。矩陣不會自動對稱；`mat[u][v]` 對 `std::vector<std::vector<int>>` 是合法的寫法。',
    },
    {
      id: 'q-weighted', prompt: '一張有向加權圖的權重可以是 0 到 100 之間的任何整數（包含 0）。在 Java 中，哪一種做法可以正確記錄每條邊的權重，並分辨「沒有邊」？',
      options: ['`int[][] w = new int[n][n];`，沒有邊就是預設的 0', '`List<List<Integer>> adj`，`adj.get(u)` 只存終點 v', '先把 `int[][] w` 的每格填成 -1，有邊時才寫入權重', '只存邊串列 `List<int[]>`，就能 O(1) 查出 u → v 的權重'],
      answer: 2, explanation: '-1 不可能是權重，所以「-1 = 沒有邊、其他值 = 權重」不會混淆，查邊與讀權重都是 O(1)。直接用預設的 0 表示沒有邊，權重 0 的邊就和「沒有邊」分不出來；只存終點 v 的串列把權重弄丟了，應該存 `int[]{v, w}` 或一個 record；邊串列要查一條邊得掃過全部 E 條，是 O(E)，不是 O(1)。',
    },
  ],
  exercises: [
    {
      id: 'e-edge-queries', title: '有向圖的查邊與出鄰居',
      statement: '給一張有 n 個頂點（編號 0 到 n − 1）的有向圖，依序讀入 m 條邊 `u v`（表示 u → v）。頂點編號不在 0 到 n − 1 之間的邊不合法：輸出一行 `Invalid`，並忽略這條邊。同一條邊可能出現多次（重複的邊只算一條），也可能有自環 u → u。接著回答 q 個查詢 `u v`：u → v 這條邊存在就輸出 `yes`，不存在輸出 `no`；查詢的頂點編號不合法時輸出 `Invalid`。最後依編號輸出每個頂點的出鄰居（out-neighbour），由小到大排序、不重複；沒有出邊的頂點輸出 `-`。本題 n ≤ 2,000，允許使用 n × n 的布林矩陣。',
      inputFormat: '第一行兩個整數 n 與 m。接下來 m 行，每行兩個整數 u、v。再來一行一個整數 q，接著 q 行，每行兩個整數 u、v。',
      outputFormat: '依讀入的順序：每條不合法的邊輸出一行 `Invalid`；每個查詢輸出一行 `yes`、`no` 或 `Invalid`。最後輸出 n 行，第 u 行是 `u:` 後接以空白分隔、由小到大的出鄰居，沒有出鄰居時是 `u: -`。',
      constraints: ['1 ≤ n ≤ 2,000', '0 ≤ m ≤ 200,000', '1 ≤ q ≤ 200,000', '-10^9 ≤ u, v ≤ 10^9（只有 0 ≤ u, v < n 是合法的頂點）'],
      samples: [
        { kind: 'normal', input: '4 5\n0 1\n0 2\n2 3\n3 1\n1 2\n4\n0 2\n2 0\n3 1\n1 3', output: 'yes\nno\nyes\nno\n0: 1 2\n1: 2\n2: 3\n3: 1', note: '有向圖：2 → 0 與 1 → 3 都不存在' },
      ],
      tests: [
        { kind: 'normal', input: '4 5\n0 1\n0 2\n2 3\n3 1\n1 2\n4\n0 2\n2 0\n3 1\n1 3', output: 'yes\nno\nyes\nno\n0: 1 2\n1: 2\n2: 3\n3: 1', note: '範例' },
        { kind: 'normal', input: '5 5\n4 3\n4 0\n4 2\n1 4\n0 3\n2\n4 2\n2 4', output: 'yes\nno\n0: 3\n1: 4\n2: -\n3: -\n4: 0 2 3', note: '邊的輸入順序不是排好的，輸出時要排序；沒有出邊的頂點印 -' },
        { kind: 'edge', input: '3 2\n1 1\n1 0\n2\n1 1\n0 0', output: 'yes\nno\n0: -\n1: 0 1\n2: -', note: '自環 1 → 1 是合法的邊，1 也是自己的出鄰居' },
        { kind: 'edge', input: '3 4\n0 1\n0 1\n1 0\n0 1\n1\n0 1', output: 'yes\n0: 1\n1: 0\n2: -', note: '重複的邊只算一次；0 → 1 與 1 → 0 是不同的兩條邊' },
        { kind: 'edge', input: '1 0\n1\n0 0', output: 'no\n0: -', note: '只有一個頂點、沒有任何邊' },
        { kind: 'edge', input: bigInput, output: bigOutput, note: 'n = 2,000：矩陣有 4 × 10^6 格；每個頂點有指向下一個頂點的邊和自環，1999 → 0 繞回開頭' },
        { kind: 'error', input: '3 1\n0 2\n3\n0 3\n-1 0\n0 2', output: 'Invalid\nInvalid\nyes\n0: 2\n1: -\n2: -', note: '查詢的頂點 3 與 -1 不合法；在 Python 中 -1 不檢查會默默讀到最後一列' },
        { kind: 'error', input: '2 3\n0 1\n2 0\n1 -5\n1\n1 0', output: 'Invalid\nInvalid\nno\n0: 1\n1: -', note: '不合法的邊輸出 Invalid 並忽略，不會被加入圖中' },
        { kind: 'error', input: '2 1\n1000000000 0\n1\n0 -1000000000', output: 'Invalid\nInvalid\n0: -\n1: -', note: '最大與最小的編號都不合法，不能拿來當索引' },
      ],
      hints: [
        '本題的設計：n ≤ 2,000 時 n² = 4 × 10^6 格，布林矩陣放得下，查詢 `has[u][v]` 是 O(1)，也順便擋掉重複的邊。C++ 用 `std::vector<std::vector<char>>`（不要寫 `bool has[n][n]` 這種 VLA），Python 用 `[bytearray(n) for _ in range(n)]`（每格 1 位元組，list of list 每格要 8 位元組的參考），Java 用 `boolean[][]`，JavaScript 每列用一個 `new Uint8Array(n)`。',
        '如果 n 是 2 × 10^5，矩陣要 4 × 10^10 格，不可能開得出來；那時改成每個頂點一個雜湊集合（`std::unordered_set<int>`、`set()`、`HashSet<Integer>`、`new Set()`），查詢平均 O(1)，輸出前再排序。',
        '輸出出鄰居時，掃矩陣的每一列要 O(n²)；另外存一份鄰接串列，只在 `has[u][v]` 從 0 變成 1 的那一刻把 v 加進 `adj[u]`，最後排序每個串列即可，總共 O(n + m log m)。',
        '先檢查 `0 <= u < n` 與 `0 <= v < n` 再當索引使用。C++ 與 Java 越界會讀到不屬於矩陣的記憶體或丟出例外，JavaScript 會得到 `undefined`（u 越界時接著丟出 `TypeError`）；Python 的負索引則不會報錯，`has[-1]` 會默默讀到最後一列。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n, m;
    std::cin >> n >> m;
    std::vector<std::vector<char>> has(n, std::vector<char>(n, 0));  // n × n 布林矩陣
    std::vector<std::vector<int>> adj(n);                             // 出鄰居，輸出用
    auto valid = [n](int x) { return 0 <= x && x < n; };
    for (int i = 0; i < m; ++i) {
        int u, v;
        std::cin >> u >> v;
        if (!valid(u) || !valid(v)) {
            std::cout << "Invalid\n";
        } else if (!has[u][v]) {  // 重複的邊只加一次
            has[u][v] = 1;
            adj[u].push_back(v);
        }
    }
    int q;
    std::cin >> q;
    for (int i = 0; i < q; ++i) {
        int u, v;
        std::cin >> u >> v;
        if (!valid(u) || !valid(v)) std::cout << "Invalid\n";
        else std::cout << (has[u][v] ? "yes" : "no") << "\n";
    }
    for (int u = 0; u < n; ++u) {
        std::sort(adj[u].begin(), adj[u].end());
        std::cout << u << ":";
        if (adj[u].empty()) std::cout << " -";
        for (int v : adj[u]) std::cout << " " << v;
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, m = int(data[0]), int(data[1])
    has = [bytearray(n) for _ in range(n)]  # n × n 布林矩陣，每格 1 位元組
    adj = [[] for _ in range(n)]  # 出鄰居，輸出用
    out = []
    pos = 2
    for _ in range(m):
        u, v = int(data[pos]), int(data[pos + 1])
        pos += 2
        if not (0 <= u < n and 0 <= v < n):
            out.append("Invalid")
        elif not has[u][v]:  # 重複的邊只加一次
            has[u][v] = 1
            adj[u].append(v)
    q = int(data[pos])
    pos += 1
    for _ in range(q):
        u, v = int(data[pos]), int(data[pos + 1])
        pos += 2
        if not (0 <= u < n and 0 <= v < n):
            out.append("Invalid")
        else:
            out.append("yes" if has[u][v] else "no")
    for u in range(n):
        out.append(f"{u}: " + (" ".join(map(str, sorted(adj[u]))) or "-"))
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.StringTokenizer;

public class Main {
    static BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    static StringTokenizer st;

    static int next() throws IOException {
        while (st == null || !st.hasMoreTokens()) st = new StringTokenizer(br.readLine());
        return Integer.parseInt(st.nextToken());
    }

    public static void main(String[] args) throws IOException {
        int n = next(), m = next();
        boolean[][] has = new boolean[n][n];  // 預設全是 false
        List<List<Integer>> adj = new ArrayList<>();  // 出鄰居，輸出用
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < m; i++) {
            int u = next(), v = next();
            if (u < 0 || u >= n || v < 0 || v >= n) {
                out.append("Invalid\n");
            } else if (!has[u][v]) {  // 重複的邊只加一次
                has[u][v] = true;
                adj.get(u).add(v);
            }
        }
        int q = next();
        for (int i = 0; i < q; i++) {
            int u = next(), v = next();
            if (u < 0 || u >= n || v < 0 || v >= n) out.append("Invalid\n");
            else out.append(has[u][v] ? "yes\n" : "no\n");
        }
        for (int u = 0; u < n; u++) {
            List<Integer> list = adj.get(u);
            Collections.sort(list);
            out.append(u).append(":");
            if (list.isEmpty()) out.append(" -");
            for (int v : list) out.append(" ").append(v);
            out.append("\n");
        }
        System.out.print(out);
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
let pos = 0;
const n = data[pos++], m = data[pos++];
const has = Array.from({ length: n }, () => new Uint8Array(n));  // n × n 布林矩陣，每格 1 位元組
const adj = Array.from({ length: n }, () => []);                // 出鄰居，輸出用
const valid = x => 0 <= x && x < n;
const out = [];
for (let i = 0; i < m; i++) {
    const u = data[pos++], v = data[pos++];
    if (!valid(u) || !valid(v)) {
        out.push("Invalid");
    } else if (!has[u][v]) {  // 重複的邊只加一次
        has[u][v] = 1;
        adj[u].push(v);
    }
}
const q = data[pos++];
for (let i = 0; i < q; i++) {
    const u = data[pos++], v = data[pos++];
    if (!valid(u) || !valid(v)) out.push("Invalid");
    else out.push(has[u][v] ? "yes" : "no");
}
for (let u = 0; u < n; u++) {
    adj[u].sort((a, b) => a - b);
    out.push(u + ": " + (adj[u].length > 0 ? adj[u].join(" ") : "-"));
}
console.log(out.join("\n"));`,
      },
      judge: 'none',
    },
  ],
};

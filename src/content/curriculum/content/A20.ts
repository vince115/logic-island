import type { LessonContent } from '../schema';

const code = String.raw;

/** Rows of heights, one row per line, numbers separated by single spaces. */
const gridText = (h: number[][]) => h.map(row => row.join(' ')).join('\n');

/**
 * Exercise worst cases, generated here (200 × 200 = 4 × 10^4 cells, at most 1000 supply points).
 *
 * Random: i = r·200 + c (0-based), height (7i² + 31i + 11) mod 1000001, a collapsed cell (−1) when that height is a
 * multiple of 23. The expected output came from the three reference solutions and, independently, from a union-find
 * bottleneck computation of the capacity (edges added in increasing height difference until every target joins the
 * base) plus a Dijkstra pass for the steps; all agreed.
 */
const randomInput = (() => {
  const N = 200;
  const h = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => {
    const i = r * N + c, v = (7 * i * i + 31 * i + 11) % 1000001;
    return v % 23 === 0 ? -1 : v;
  }));
  return `${N} ${N}\n${gridText(h)}\n1 1\n7\n200 200\n1 200\n200 1\n100 100\n57 143\n150 20\n3 198`;
})();
const randomOutput = 'Capacity 554410\n6 182\n5 198\n4 200\n7 211\n2 215\n3 233\n1 398';

/**
 * Snake: even rows (0-based) are open, odd rows are collapsed except one gap that alternates between the right and
 * the left end, row 199 is all collapsed. Heights count 0, 1, 2… along the single path, so capacity 1 is needed and
 * enough, and a cell's steps equal its height. One extra cell (row 1, column 100) has height 500000: a shortcut that
 * only a capacity of about 5 × 10^5 can use, so a program that reports the steps of the BFS with the upper bound hi
 * (instead of the minimum capacity) prints fewer steps. Expected by that formula, matched by the three references.
 */
const snakeInput = (() => {
  const N = 200;
  const h = Array.from({ length: N }, () => Array<number>(N).fill(-1));
  let k = 0;
  for (let r = 0; r < N - 1; r += 2) {
    const leftToRight = (r / 2) % 2 === 0;
    for (let j = 0; j < N; j++) h[r][leftToRight ? j : N - 1 - j] = k++;
    if (r + 2 < N - 1) h[r + 1][leftToRight ? N - 1 : 0] = k++;
  }
  h[1][100] = 500000;
  return `${N} ${N}\n${gridText(h)}\n1 1\n4\n199 1\n1 1\n99 49\n199 1`;
})();
const snakeOutput = 'Capacity 1\n2 0\n3 10000\n1 20098\n4 20098';

/**
 * Cliff: a flat 200 × 200 plain (height 0) whose corner (200, 200) has height 10^6. Supply point 1000 is that corner,
 * so the answer is the whole range 10^6 and every check of the binary search visits about 4 × 10^4 cells. With every
 * move allowed and no collapsed cell, the steps are the Manhattan distances from the base (100, 100): the expected
 * output is computed here by that formula, which shares nothing with BFS (checked against the references).
 */
const cliffPoints: [number, number][] = [
  ...Array.from({ length: 999 }, (_, i): [number, number] => [(i * 37) % 200 + 1, (i * 91 + 7) % 200 + 1]),
  [200, 200],
];
const cliffInput = (() => {
  const h = Array.from({ length: 200 }, () => Array<number>(200).fill(0));
  h[199][199] = 1000000;
  return `200 200\n${gridText(h)}\n100 100\n1000\n${cliffPoints.map(([r, c]) => `${r} ${c}`).join('\n')}`;
})();
const cliffOutput = ['Capacity 1000000', ...cliffPoints
  .map(([r, c], i) => ({ id: i + 1, steps: Math.abs(r - 100) + Math.abs(c - 100) }))
  .sort((a, b) => a.steps - b.steps || a.id - b.id)
  .map(p => `${p.id} ${p.steps}`)].join('\n');

const SAMPLE_INPUT = '5 5\n0 1 2 3 4\n0 -1 -1 -1 8\n0 2 4 -1 5\n-1 -1 3 -1 -1\n6 -1 1 2 3\n1 1\n5\n1 5\n3 5\n5 5\n5 1\n3 3';
const SAMPLE_OUTPUT = 'Capacity 4\n1 4\n5 4\n2 6\n3 8\n4 unreachable';

/**
 * A20 演算法島綜合試煉. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); its BFS queue is an array with a head index (no shift()).
 */
export const A20: LessonContent = {
  lessonId: 'A20',
  motivation: '學完搜尋、排序、圖的走訪、貪心與動態規劃之後，真正的題目不會告訴你「這題用 BFS 加二分搜」。它只描述一個情境：一張地圖、一台能力有限的車、幾個要去的地方，以及輸入可能出錯的各種方式。這一課的「救援路線規劃」把整座演算法島串起來：先把題目拆成能各自驗證的子問題，替每個子問題選出夠快的演算法（格子 BFS、對答案二分搜、自訂排序），再一個階段一個階段地實作與測試，最後用暴力解對拍與複雜度分析證明它是對的、也夠快。物流配送、機器人路徑規劃、網路頻寬規劃都長成「最少需要多少能力才能全部完成，完成時的成本又是多少」這種樣子。限制也要說清楚：這套組合只在題目的條件下成立——每一步代價相同，所以能用 BFS；能力越大越容易成立，所以能二分搜。條件一變（每一段路耗時不同、要挑選攜帶哪些物資），就要換成 A16 的 Dijkstra 或 A18 的背包。這是程式邏輯島的最後一課：完成它，就走完了三座島共 60 堂課的課程。',
  sections: [
    {
      id: 'read-problem', title: '讀題：把救援任務拆成子問題',
      blocks: [
        { type: 'p', text: '題目情境：地震過後，救援車要從基地出發，把物資送到 K 個補給點。地圖是 R × C 的格子，每一格有一個高度（0～10⁶），`-1` 代表崩塌區，不能進入。車子每一步只能往上、下、左、右移動一格，而且兩格的高度差不能超過車子的爬坡能力 D。能力越高的車越貴，所以要找出最小的 D，讓「所有原本就有路可通的補給點」都到得了；被崩塌區完全隔開的補給點，能力再高也到不了，直接回報 `unreachable`。最後用這個最小能力，回報每個補給點最少要走幾步。' },
        { type: 'list', items: [
          '輸入：`R C`，接著 R 列、每列 C 個整數的高度，然後是基地座標 `r c`、補給點數量 K，以及 K 個補給點座標（編號依輸入順序為 1～K）。座標從 1 開始（1-based），第 r 列第 c 行。',
          '輸出第一行：`Capacity D`，D 是最小的爬坡能力。',
          '接著每個到得了的補給點一行 `編號 步數`，依步數由小到大，步數相同時編號小的在前；最後是到不了的補給點 `編號 unreachable`，依編號由小到大。',
          '步數一律用最小能力 D 計算。補給點可以就在基地上（步數 0），兩個補給點也可以在同一格。',
        ] },
        { type: 'p', text: '輸入有任何問題就只輸出一行 `Invalid`：出現不是整數的字詞、R 或 C 不在 1～200、K 不在 1～1000、字詞數量和 R、C、K 算出來的不一致（少了或多了）、高度不是 `-1` 也不在 0～10⁶、基地或補給點在地圖外或在崩塌區。字詞之間可以有任意多個空白與換行，所以「整個輸入切成字詞」比「一行一行解析」可靠。' },
        { type: 'callout', tone: 'tip', title: '先列子問題，再選演算法', text: '讀完題目先寫下子問題，而不是直接寫程式：(1) 讀入並驗證輸入；(2) 哪些補給點不論能力多高都到不了；(3) 最小能力 D 是多少；(4) 能力 D 時每個補給點的最少步數；(5) 依規則排序輸出。每一個子問題都有清楚的輸入與輸出，可以單獨寫、單獨測，最後再接起來。接著才看資料範圍：R × C 最多 4 × 10⁴ 格，高度差最多 10⁶，這決定了每個子問題能花多少時間。' },
        { type: 'p', text: '階段一是解析（parsing）與驗證。每個字詞要先檢查字元，再轉成整數，因為各語言的轉換函式各自「太寬鬆」的地方不同：Python 的 `int("+5")` 是 5，`int("1_0")` 是 10，`int(" 5 ")` 是 5，連全形的 `int("３")` 都是 3；C++ 的 `std::stoi("7x")` 默默回傳 7、`std::stoi("3.5")` 回傳 3、`std::stoi("+5")` 回傳 5；Java 的 `Integer.parseInt("+5")` 也是 5，但 `"1_0"`、`" 5"` 會丟出 `NumberFormatException`；JavaScript 的 `Number("+5")`、`Number(" 5 ")` 都是 5，`Number("1e3")` 是 1000，`Number("")` 甚至是 0，`parseInt("7x")` 則默默回傳 7。所以統一規則：只接受「可選的負號＋1～9 位 ASCII 數字」，9 位數保證轉換時不會超出 `int`。之後依 R、C、K 檢查字詞總數必須剛好是 R × C + 5 + 2K，再檢查各個範圍。' },
        { type: 'example', id: 'parse-token' },
      ],
    },
    {
      id: 'choose-algorithms', title: '為每個子問題選演算法',
      blocks: [
        { type: 'p', text: '把子問題逐一對應到學過的演算法，並寫下每一個的成本。設 N = R × C ≤ 4 × 10⁴ 是格子數，H 是陸地最高與最低高度的差（H ≤ 10⁶）。' },
        { type: 'table', head: ['子問題', '演算法（課程）', '為什麼選它', '成本'], rows: [
          ['讀入與驗證', '逐字詞檢查（F03、A02）', '先檢查字元再轉換；字詞數必須剛好相符', 'O(N + K)'],
          ['完全到不了的補給點', '格子 BFS（A14），能力設為 H', '能力 H 時任兩格陸地都能互走，只剩崩塌區在擋路', 'O(N)'],
          ['最小能力 D', '對答案二分搜（A04），用 BFS 當判斷函式', '`check(D)` 是單調的：D 可行，D + 1 也可行', 'O(N log H)'],
          ['能力 D 時的最少步數', '格子 BFS（A14）', '每一步代價相同，BFS 第一次到達就是最少步數', 'O(N)'],
          ['排序輸出', '函式庫排序＋自訂排序鍵（A05、F16）', '同步數依編號，到不了的排最後，輸出才唯一', 'O(K log K)'],
        ] },
        { type: 'p', text: '為什麼不用別的方法？逐一嘗試 D = 0、1、2…，最壞要試 10⁶ 次，每次 BFS 掃過 4 × 10⁴ 格，是 4 × 10¹⁰ 次運算；二分搜的範圍 [0, H] 最多 10⁶ + 1 個值，迴圈最多 20 回合，連同前後兩次 BFS 總共最多 22 次 BFS。貪心地「每一步走高度差最小的鄰居」不行：它只看眼前，可能走進死路，也無法回答「最少需要多少」。DFS（A15）也能回答「到不到得了」，但遞迴版在 200 × 200 的蛇形地圖上深度可達 2 × 10⁴，超過 Python 預設約 1000 的遞迴上限；而且 DFS 第一次到達的路不一定最短，第四個子問題還是要 BFS。' },
        { type: 'p', text: '也有更進階的做法：把「路徑上最大的高度差」當成要最小化的代價，用 A16 的 Dijkstra 改寫成瓶頸路徑（bottleneck path），或用 D18 的並查集依高度差由小到大加邊，直到所有目標都和基地連通，都能一次求出最小能力，時間 O(N log N)。它們都正確，本課的大型測資就用並查集版本交叉檢查過；正式解選「二分搜＋BFS」是因為只用到最熟悉的兩個工具，而且 `check` 很容易單獨測試。' },
        { type: 'callout', tone: 'note', title: '題目再加一個條件，就換一種演算法', text: '辨認題型時，看的是題目問什麼：「最少要多少才夠」而且條件單調 → 對答案二分搜（A04）；「每一步代價相同的最少步數」→ BFS（A14）；「每一段路代價不同的最短路」→ Dijkstra（A16）；「容量有限，挑選物品讓價值最大」→ 0/1 背包（A18）。如果這題再加上「車子載重 W，每個補給點的物資有重量與救援人數，要選哪些點送」，前四個階段不變，只要把到得了的補給點當成物品，多接一個背包 DP。' },
        { type: 'p', text: '各語言的工具：佇列用 C++ 的 `std::queue`、Python 的 `collections.deque`（`list.pop(0)` 每次要搬動整個串列，是 O(n)）、Java 的 `ArrayDeque`；JavaScript 沒有內建的佇列，用陣列加上 head 索引（`q[head++]`），不要用每次都要搬動整個陣列的 `shift()`；或像參考解答一樣用一個長度 N 的整數陣列加上頭尾索引（每格最多入隊一次）。絕對值在 C++ 用 `<cstdlib>` 的 `std::abs`，Python 用內建的 `abs`，Java 與 JavaScript 用 `Math.abs`。' },
      ],
    },
    {
      id: 'stage-plan', title: '分階段實作：每完成一塊就測一塊',
      blocks: [
        { type: 'p', text: '階段二：有能力限制的格子 BFS。把 A14 的格子 BFS 多加一個條件：鄰居必須在地圖內、是陸地、還沒拜訪過，而且 `|h[鄰居] − h[目前]| ≤ cap`。邊界檢查寫在最前面，靠短路求值擋住後面的讀取（Python 的 `grid[-1]` 不會報錯，只會悄悄讀到最後一列）。下面在範例地圖上分別用能力 1 與 4 做 BFS，`#` 是崩塌區、`.` 是到不了的格子。' },
        { type: 'example', id: 'grid-bfs-cap' },
        { type: 'p', text: '能力 1 時，第 3 列第 2 行（高度 2）和它左邊的高度 0 差了 2，車子過不去，於是第 3 列中間與整個下方都到不了；右上角的高度 8 和旁邊的 4 差了 4，也上不去。能力 4 時，只剩左下角高度 6 的那一格是 `.`：它的上方與右方都是崩塌區，能力再高也沒用。這一格就是範例中「完全到不了」的補給點 4。測這個階段時，挑幾張小地圖手算距離，特別是貼著邊界、被牆圍住、高度差剛好等於 cap 的格子。' },
        { type: 'p', text: '階段三：對答案二分搜。判斷函式 `check(D)`：用能力 D 做一次 BFS，所有目標補給點都被拜訪到就成立。單調性的理由很直接：能力 D 允許的每一步，在能力 D + 1 時仍然允許，所以 D 走得到的地方，D + 1 一定也走得到；`check` 的結果因此是 `F F … F T T … T`，答案就是第一個 T。範圍：下界 0（平地不需要爬坡能力）；上界 H = 最高 − 最低，因為任兩格陸地的高度差都不超過 H，`check(H)` 一定成立。用 A04 的寫法：`while lo < hi`，`mid = lo + (hi − lo) / 2`（JavaScript 的 `/` 會留下小數，要寫 `Math.floor((hi - lo) / 2)`），成立就 `hi = mid`，否則 `lo = mid + 1`；迴圈不變量是「答案一直在 [lo, hi] 裡」。' },
        { type: 'p', text: '有一個細節決定成敗：目標只能是「能力 H 時到得了」的補給點。如果把被崩塌區隔開的點也放進目標，`check` 永遠不成立，lo 一路往上推到 hi，答案就變成 H。所以先用能力 H 做一次 BFS，把到不了的點排除；若沒有任何目標，`check(0)` 就成立，答案是 0。' },
        { type: 'example', id: 'min-capacity' },
        { type: 'p', text: '範圍是 [0, 8]：`check(4)` 成立，答案 ≤ 4；`check(2)` 不成立，答案 > 2；`check(3)` 不成立，答案 > 3，於是 lo = hi = 4。只做了 3 次 BFS，而逐一嘗試 0～4 要 5 次；高度範圍是 10⁶ 時，差距是 20 次對上百萬次。測這個階段時，對同一張地圖把 `check(0)`～`check(H)` 全部印出來，確認它真的是 `F…FT…T`，再確認二分搜停在第一個 T。' },
        { type: 'p', text: '階段四：用最小能力計算步數並排序。找到 D 之後，用能力 D 再做一次 BFS 取得步數。不能直接沿用能力 H 那一次的結果：能力越高，可走的路越多，步數可能更少。例如在 `0 9 0 0／0 9 9 0／0 1 2 1` 這張地圖上，從左上角到右上角，能力 9 時翻過中間的高牆只要 3 步，最小能力 1 時要繞下方走 7 步，題目要的是 7。排序時把每個補給點變成排序鍵（到不了?, 步數, 編號）：`false` 排在 `true` 前面，所以到得了的在前；同步數時比編號。' },
        { type: 'example', id: 'report-order' },
        { type: 'p', text: 'C++ 的 `std::tuple` 會依序比較每一欄，Python 的 `sorted` 用 `key` 回傳 tuple，Java 用比較器（comparator），把到不了的步數當成 `Integer.MAX_VALUE`；JavaScript 的 `sort` 同樣傳入比較函式，把到不了的當成 `Infinity`。最後把五塊接起來：讀入全部字詞 → 驗證 → 能力 H 的 BFS 找出目標 → 二分搜 → 能力 D 的 BFS → 排序輸出。輸入最多約 4 × 10⁴ 個字詞：C++ 關閉與 C 的同步（`std::ios::sync_with_stdio(false)`），Java 用 `BufferedReader` 加 `StringTokenizer`，JavaScript 用 `readFileSync(0, "utf8")` 一次讀完，輸出先累積在 `std::string`、串列或 `StringBuilder`，最後一次印出。' },
      ],
    },
    {
      id: 'testing', title: '測試策略與整體複雜度',
      blocks: [
        { type: 'p', text: '組合多種演算法時，最有效的測試是暴力解對拍：另外寫一支「慢但明顯正確」的程式，在大量隨機小地圖上和正式解比對輸出。本課的暴力解和正式解沒有共用任何演算法：能力從 0 開始逐一嘗試（不用二分搜），步數用「反覆掃過所有格子、把能縮短的距離縮短，直到沒有任何變化」求出（不用佇列）。在 1～6 × 1～6、高度 0～12、約兩成崩塌區的數百張隨機地圖上（其中一部分還故意改壞一個字詞），兩者輸出完全相同。一旦有差異，就把那張地圖縮小到最少格子，通常就能看出是哪一個階段錯了。' },
        { type: 'p', text: '隨機測試之外，還要有「瞄準特定錯誤」的測資。每一組都先確定正確答案，並寫下它想抓的錯誤：' },
        { type: 'table', head: ['測資', '類型', '它抓得到的錯誤'], rows: [
          ['範例：補給點 4 被崩塌區圍住', '一般', '沒有先排除到不了的點：每次 check 都失敗，印出 `Capacity 8`'],
          ['`0 9 0 0／0 9 9 0／0 1 2 1` 的繞路地圖', '一般', '步數沿用能力 H 的 BFS：印出 3 步而不是 7 步'],
          ['全部同高的 3 × 3，補給點有同步數與重複', '邊界', '下界寫成 lo = 1（印出 1）；同步數沒有依編號排序'],
          ['1 × 1，基地就是補給點', '邊界', 'H = 0 時迴圈一次都不跑；步數 0 被當成到不了'],
          ['`0 1000000`，答案剛好是整個範圍', '邊界', '上界少 1：連能力 H 的 BFS 都到不了，答案錯成 0'],
          ['基地被崩塌區完全圍住', '邊界', '目標為空時答案應為 0，不是 H'],
          ['字詞任意換行、整個地圖寫在同一行', '邊界', '一行一行解析、假設每列剛好 C 個數'],
          ['200 × 200 的隨機地圖、蛇形通道、平地加一座 10⁶ 的懸崖', '效能', '逐一嘗試能力、遞迴 DFS 太深、`list.pop(0)`；蛇形地圖的捷徑也抓「步數用錯能力」'],
          ['`+1`、`3.5`、高度 −2 或 10⁶ + 1、R = 0、K = 0、座標 R + 1、字詞多或少', '錯誤', '直接用 `int`／`stoi`／`parseInt`；1-based 範圍寫成 `r < R`'],
        ] },
        { type: 'p', text: '整體複雜度：解析 O(N + K)。每次 BFS 每格最多入隊一次、檢查 4 個鄰居，是 O(N)。二分搜最多 ⌈log₂(H + 1)⌉ = 20 回合，加上前後兩次 BFS，合計 O(N log H)。排序 O(K log K)。總共 O(N log H + K log K)：最大的地圖約 22 × 4 × 10⁴ × 4 ≈ 3.5 × 10⁶ 次鄰居檢查，四種語言都能在一秒內完成。空間是 O(N + K)：每次 BFS 用一個新的長度 N 陣列，用完就丟。' },
        { type: 'p', text: '數值範圍也要檢查，而不是憑感覺：步數最多 N − 1 < 4 × 10⁴；高度差、`lo + hi` 最多約 2 × 10⁶，全部放得進 32 位元的 `int`。但只要題目稍微改變就不一樣了：高度若到 2 × 10⁹，`h[v] − h[u]` 可能到 4 × 10⁹，超過 `int` 的上限 2³¹ − 1 ≈ 2.1 × 10⁹；若要輸出 10⁵ 個補給點的步數總和，最多約 4 × 10⁹，也超過。這時 C++ 要用 `long long`、Java 要用 `long`；Python 的整數沒有上限，不受影響；JavaScript 的 `number` 在 2⁵³ 以內都是精確整數，4 × 10⁹ 也沒有問題。' },
      ],
    },
    {
      id: 'pitfalls', title: '常見陷阱',
      blocks: [
        { type: 'callout', tone: 'warning', title: '二分搜的邊界差一', text: '上界寫成 `hi = 最高 − 最低 − 1`，答案剛好是整個範圍時就找不到；下界寫成 1，平地的答案 0 會變成 1。更新寫成 `lo = mid`（沒有加 1）時，只要答案大於 0，最後一定會遇到 hi = lo + 1、`check(lo)` 不成立，mid 永遠等於 lo，形成無窮迴圈。三件事要一起對：`while lo < hi`、mid 向下取整、成立時 `hi = mid`、不成立時 `lo = mid + 1`。用「答案是 0」與「答案是整個範圍」兩組測資，就能抓到大部分的邊界錯誤。' },
        { type: 'callout', tone: 'warning', title: '每次 check 沒有重設拜訪標記', text: '為了「省記憶體」把 `seen` 或 `dist` 開成全域變數、只在程式開頭建立一次，第一次 BFS 標記過的格子在之後的 check 裡仍然是「已拜訪」，於是每次 check 都成立，二分搜一路往下，在範例地圖上印出 `Capacity 0`。C++ 的全域或 `static` 陣列、Java 的 `static` 欄位、JavaScript 寫在函式外面的陣列都會有同樣的問題。在 BFS 開頭重新建立陣列，或用 `std::fill`／`Arrays.fill` 重設；重設本身是 O(N)，和一次 BFS 同一個量級，不會讓複雜度變差。' },
        { type: 'callout', tone: 'warning', title: '64 位元與溢位', text: '本題的數值都在 `int` 範圍內，但這是算出來的結論，不是預設。C++ 有號整數溢位是未定義行為（undefined behavior），Java 的 `int` 溢位會繞回負數而不報錯。範圍可能超過 2³¹ − 1 時（高度到 10⁹ 以上、步數加總、筆數乘上權重），C++ 改用 `long long`、Java 改用 `long`；中點一律寫成 `lo + (hi − lo) / 2`。Python 沒有溢位，JavaScript 的 `number` 在 2⁵³ 以內也都精確，但四種語言用同一個寫法，比較不容易出錯。' },
        { type: 'callout', tone: 'warning', title: '依賴沒有規則的走訪順序', text: '如果把結果先放進 `std::unordered_map`、`HashMap` 或 Python 的 `set`，再直接走訪輸出，順序取決於雜湊值與桶的數量，換一個編譯器、JDK 或資料量就可能不同；本機剛好排好不代表評測時也是。題目規定了順序，就用完整的排序鍵（到不了?, 步數, 編號）明確排序。Java 對 `Integer[]` 的 `Arrays.sort` 是穩定的 TimSort，C++ 的 `std::sort` 不穩定、Python 的 `sorted` 與 JavaScript 的 `sort`（ES2019 起）穩定——把編號寫進排序鍵，就不必依賴穩定性。' },
        { type: 'callout', tone: 'warning', title: '1-based 座標與 0-based 陣列', text: '輸入的座標從 1 開始，陣列從 0 開始。驗證時要檢查 `1 ≤ r ≤ R`，不是 `0 ≤ r < R`；轉換成編號是 `(r − 1) × C + (c − 1)`。若忘了減 1，座標 (R, c) 會被當成界外的錯誤輸入，或在 Python 用負索引時悄悄讀到別的格子。範例測資裡的「座標 R + 1」與「座標剛好是 (R, C)」兩種輸入，分別確認上界的兩側。' },
        { type: 'p', text: '完成這個試煉，代表你能從題目描述拆出子問題、依資料範圍替每個子問題選出演算法、把它們組合成一支程式，再用暴力解對拍、邊界測資與複雜度分析證明它可行。這是演算法島的最後一課，也是程式邏輯島全部 60 堂課的最後一課：基礎程式島的語法與除錯、資料結構島的佇列與雜湊表、演算法島的搜尋與動態規劃，都在這一題裡用上了。之後可以回到課程目錄，挑出還不熟的課重新練習，或拿這一課的流程（列子問題、選演算法、分階段測試、對拍）去解新的題目。' },
      ],
    },
  ],
  examples: [
    {
      id: 'parse-token', title: '逐字詞驗證整數', description: '只接受「可選的負號＋1～9 位 ASCII 數字」。`+5`、`3.5`、`1_0`、只有負號、10 位數與 `7x` 都是 Invalid；`0007` 是合法的 7。',
      output: '42 -> 42\n-1 -> -1\n0007 -> 7\n+5 -> Invalid\n3.5 -> Invalid\n1_0 -> Invalid\n- -> Invalid\n1000000000 -> Invalid\n7x -> Invalid',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// 成功時把值寫進 out 並回傳 true；std::stoi 自己會接受 "+5"、" 5"、"7x"（只讀前面的 7）
bool toInt(const std::string& s, int& out) {
    std::size_t start = (!s.empty() && s[0] == '-') ? 1 : 0;
    if (s.size() - start < 1 || s.size() - start > 9) return false;
    for (std::size_t i = start; i < s.size(); ++i)
        if (s[i] < '0' || s[i] > '9') return false;
    out = std::stoi(s);  // 最多 9 位數字，不會超出 int
    return true;
}

int main() {
    const std::vector<std::string> tokens = {"42", "-1", "0007", "+5", "3.5", "1_0", "-", "1000000000", "7x"};
    for (const auto& s : tokens) {
        int v;
        std::cout << s << " -> " << (toInt(s, v) ? std::to_string(v) : "Invalid") << "\n";
    }
    return 0;
}`,
        Python: code`def to_int(s):
    digits = s[1:] if s.startswith("-") else s
    # isascii 擋掉全形或其他文字的數字；長度上限讓之後的轉換不會超出 int
    if not (1 <= len(digits) <= 9 and digits.isascii() and digits.isdigit()):
        return None
    return int(s)


for s in ["42", "-1", "0007", "+5", "3.5", "1_0", "-", "1000000000", "7x"]:
    v = to_int(s)
    print(f"{s} -> {'Invalid' if v is None else v}")`,
        Java: code`public class Main {
    // 失敗時回傳 null；Integer.parseInt 自己會接受 "+5"
    static Integer toInt(String s) {
        int start = s.startsWith("-") ? 1 : 0;
        if (s.length() - start < 1 || s.length() - start > 9) return null;
        for (int i = start; i < s.length(); ++i)
            if (s.charAt(i) < '0' || s.charAt(i) > '9') return null;
        return Integer.parseInt(s);  // 最多 9 位數字，不會超出 int
    }

    public static void main(String[] args) {
        String[] tokens = {"42", "-1", "0007", "+5", "3.5", "1_0", "-", "1000000000", "7x"};
        for (String s : tokens) {
            Integer v = toInt(s);
            System.out.println(s + " -> " + (v == null ? "Invalid" : v.toString()));
        }
    }
}`,
        JavaScript: code`// 失敗時回傳 null；Number 自己會接受 "+5"、"3.5"、" 5 " 與 "1e3"，parseInt("7x") 會默默回傳 7
function toInt(s) {
    if (!/^-?[0-9]{1,9}$/.test(s)) return null;  // 可選的負號 + 1～9 位 ASCII 數字
    return Number(s);
}

for (const s of ["42", "-1", "0007", "+5", "3.5", "1_0", "-", "1000000000", "7x"]) {
    const v = toInt(s);
    console.log(s + " -> " + (v === null ? "Invalid" : v));
}`,
      },
    },
    {
      id: 'grid-bfs-cap', title: '有爬坡能力限制的格子 BFS', description: '在範例地圖上從左上角出發，分別用能力 1 與 4 做 BFS，印出每格的步數；`#` 是崩塌區，`.` 是到不了的格子。',
      output: 'cap = 1\n0 1 2 3 4\n1 # # # .\n2 . . # .\n# # . # #\n. # . . .\ncap = 4\n0 1 2 3 4\n1 # # # 5\n2 3 4 # 6\n# # 5 # #\n. # 6 7 8',
      code: {
        'C++': code`#include <cstdlib>
#include <iostream>
#include <queue>
#include <utility>
#include <vector>

const std::vector<std::vector<int>> H = {
    {0, 1, 2, 3, 4}, {0, -1, -1, -1, 8}, {0, 2, 4, -1, 5}, {-1, -1, 3, -1, -1}, {6, -1, 1, 2, 3}};  // -1 是崩塌區
const int R = 5, C = 5;

std::vector<std::vector<int>> bfs(int sr, int sc, int cap) {
    std::vector<std::vector<int>> dist(R, std::vector<int>(C, -1));
    std::queue<std::pair<int, int>> q;
    dist[sr][sc] = 0;
    q.push({sr, sc});
    const int dr[] = {-1, 1, 0, 0}, dc[] = {0, 0, -1, 1};
    while (!q.empty()) {
        auto [r, c] = q.front();
        q.pop();
        for (int k = 0; k < 4; ++k) {
            int nr = r + dr[k], nc = c + dc[k];
            if (nr >= 0 && nr < R && nc >= 0 && nc < C && dist[nr][nc] == -1
                && H[nr][nc] != -1 && std::abs(H[nr][nc] - H[r][c]) <= cap) {
                dist[nr][nc] = dist[r][c] + 1;
                q.push({nr, nc});
            }
        }
    }
    return dist;
}

int main() {
    for (int cap : {1, 4}) {
        auto dist = bfs(0, 0, cap);
        std::cout << "cap = " << cap << "\n";
        for (int r = 0; r < R; ++r)
            for (int c = 0; c < C; ++c) {
                if (H[r][c] == -1) std::cout << "#";
                else if (dist[r][c] == -1) std::cout << ".";
                else std::cout << dist[r][c];
                std::cout << (c + 1 < C ? " " : "\n");
            }
    }
    return 0;
}`,
        Python: code`from collections import deque

H = [[0, 1, 2, 3, 4],
     [0, -1, -1, -1, 8],
     [0, 2, 4, -1, 5],
     [-1, -1, 3, -1, -1],
     [6, -1, 1, 2, 3]]   # -1 是崩塌區
R, C = len(H), len(H[0])


def bfs(sr, sc, cap):
    dist = [[-1] * C for _ in range(R)]
    dist[sr][sc] = 0
    q = deque([(sr, sc)])
    while q:
        r, c = q.popleft()
        for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
            if 0 <= nr < R and 0 <= nc < C and dist[nr][nc] == -1 \
                    and H[nr][nc] != -1 and abs(H[nr][nc] - H[r][c]) <= cap:
                dist[nr][nc] = dist[r][c] + 1
                q.append((nr, nc))
    return dist


for cap in (1, 4):
    dist = bfs(0, 0, cap)
    print(f"cap = {cap}")
    for r in range(R):
        print(" ".join("#" if H[r][c] == -1 else "." if dist[r][c] == -1 else str(dist[r][c]) for c in range(C)))`,
        Java: code`import java.util.ArrayDeque;
import java.util.Arrays;

public class Main {
    static final int[][] H = {
        {0, 1, 2, 3, 4}, {0, -1, -1, -1, 8}, {0, 2, 4, -1, 5}, {-1, -1, 3, -1, -1}, {6, -1, 1, 2, 3}};  // -1 是崩塌區
    static final int R = 5, C = 5;

    static int[][] bfs(int sr, int sc, int cap) {
        int[][] dist = new int[R][C];
        for (int[] row : dist) Arrays.fill(row, -1);
        ArrayDeque<int[]> q = new ArrayDeque<>();
        dist[sr][sc] = 0;
        q.add(new int[]{sr, sc});
        int[] dr = {-1, 1, 0, 0}, dc = {0, 0, -1, 1};
        while (!q.isEmpty()) {
            int[] cur = q.poll();
            int r = cur[0], c = cur[1];
            for (int k = 0; k < 4; ++k) {
                int nr = r + dr[k], nc = c + dc[k];
                if (nr >= 0 && nr < R && nc >= 0 && nc < C && dist[nr][nc] == -1
                        && H[nr][nc] != -1 && Math.abs(H[nr][nc] - H[r][c]) <= cap) {
                    dist[nr][nc] = dist[r][c] + 1;
                    q.add(new int[]{nr, nc});
                }
            }
        }
        return dist;
    }

    public static void main(String[] args) {
        for (int cap : new int[]{1, 4}) {
            int[][] dist = bfs(0, 0, cap);
            System.out.println("cap = " + cap);
            for (int r = 0; r < R; ++r) {
                StringBuilder line = new StringBuilder();
                for (int c = 0; c < C; ++c) {
                    if (c > 0) line.append(' ');
                    line.append(H[r][c] == -1 ? "#" : dist[r][c] == -1 ? "." : String.valueOf(dist[r][c]));
                }
                System.out.println(line);
            }
        }
    }
}`,
        JavaScript: code`const H = [
    [0, 1, 2, 3, 4],
    [0, -1, -1, -1, 8],
    [0, 2, 4, -1, 5],
    [-1, -1, 3, -1, -1],
    [6, -1, 1, 2, 3]];   // -1 是崩塌區
const R = H.length, C = H[0].length;

function bfs(sr, sc, cap) {
    const dist = Array.from({ length: R }, () => new Array(C).fill(-1));
    const q = [[sr, sc]];  // 陣列當佇列：用 head 往前走，不用 shift()（每次都要搬動整個陣列）
    let head = 0;
    dist[sr][sc] = 0;
    while (head < q.length) {
        const [r, c] = q[head++];
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
            if (nr >= 0 && nr < R && nc >= 0 && nc < C && dist[nr][nc] === -1
                && H[nr][nc] !== -1 && Math.abs(H[nr][nc] - H[r][c]) <= cap) {
                dist[nr][nc] = dist[r][c] + 1;
                q.push([nr, nc]);
            }
        }
    }
    return dist;
}

for (const cap of [1, 4]) {
    const dist = bfs(0, 0, cap);
    console.log("cap = " + cap);
    for (let r = 0; r < R; r++) {
        const line = [];
        for (let c = 0; c < C; c++) line.push(H[r][c] === -1 ? "#" : dist[r][c] === -1 ? "." : String(dist[r][c]));
        console.log(line.join(" "));
    }
}`,
      },
    },
    {
      id: 'min-capacity', title: '對答案二分搜：最小爬坡能力', description: '目標是範例中到得了的四個補給點。每次 `check` 都用新的拜訪陣列做一次 BFS；印出每一回合的 lo、hi、mid 與結果。',
      output: 'lo=0 hi=8 mid=4 ok\nlo=0 hi=4 mid=2 fail\nlo=3 hi=4 mid=3 fail\nCapacity 4',
      code: {
        'C++': code`#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <queue>
#include <utility>
#include <vector>

const std::vector<std::vector<int>> H = {
    {0, 1, 2, 3, 4}, {0, -1, -1, -1, 8}, {0, 2, 4, -1, 5}, {-1, -1, 3, -1, -1}, {6, -1, 1, 2, 3}};
const int R = 5, C = 5;
const std::vector<std::pair<int, int>> TARGETS = {{0, 4}, {2, 4}, {4, 4}, {2, 2}};  // (4, 0) 到不了，已先排除

bool check(int cap) {
    std::vector<std::vector<bool>> seen(R, std::vector<bool>(C, false));  // 每次 check 都重新建立
    std::queue<std::pair<int, int>> q;
    seen[0][0] = true;
    q.push({0, 0});
    const int dr[] = {-1, 1, 0, 0}, dc[] = {0, 0, -1, 1};
    while (!q.empty()) {
        auto [r, c] = q.front();
        q.pop();
        for (int k = 0; k < 4; ++k) {
            int nr = r + dr[k], nc = c + dc[k];
            if (nr >= 0 && nr < R && nc >= 0 && nc < C && !seen[nr][nc]
                && H[nr][nc] != -1 && std::abs(H[nr][nc] - H[r][c]) <= cap) {
                seen[nr][nc] = true;
                q.push({nr, nc});
            }
        }
    }
    return std::all_of(TARGETS.begin(), TARGETS.end(), [&](const auto& t) { return seen[t.first][t.second]; });
}

int main() {
    int lowest = 1000000, highest = 0;
    for (const auto& row : H)
        for (int h : row)
            if (h != -1) { lowest = std::min(lowest, h); highest = std::max(highest, h); }
    int lo = 0, hi = highest - lowest;  // check(hi) 一定成立
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        bool ok = check(mid);
        std::cout << "lo=" << lo << " hi=" << hi << " mid=" << mid << (ok ? " ok" : " fail") << "\n";
        if (ok) hi = mid;      // mid 可行：答案 <= mid
        else lo = mid + 1;     // mid 不行：比 mid 小的也都不行
    }
    std::cout << "Capacity " << lo << "\n";
    return 0;
}`,
        Python: code`from collections import deque

H = [[0, 1, 2, 3, 4],
     [0, -1, -1, -1, 8],
     [0, 2, 4, -1, 5],
     [-1, -1, 3, -1, -1],
     [6, -1, 1, 2, 3]]
R, C = len(H), len(H[0])
TARGETS = [(0, 4), (2, 4), (4, 4), (2, 2)]   # 到得了的補給點（(4, 0) 被崩塌區圍住，已先排除）


def check(cap):
    seen = [[False] * C for _ in range(R)]   # 每次 check 都重新建立
    seen[0][0] = True
    q = deque([(0, 0)])
    while q:
        r, c = q.popleft()
        for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
            if 0 <= nr < R and 0 <= nc < C and not seen[nr][nc] \
                    and H[nr][nc] != -1 and abs(H[nr][nc] - H[r][c]) <= cap:
                seen[nr][nc] = True
                q.append((nr, nc))
    return all(seen[r][c] for r, c in TARGETS)


land = [h for row in H for h in row if h != -1]
lo, hi = 0, max(land) - min(land)   # check(hi) 一定成立
while lo < hi:
    mid = (lo + hi) // 2
    ok = check(mid)
    print(f"lo={lo} hi={hi} mid={mid} {'ok' if ok else 'fail'}")
    if ok:
        hi = mid        # mid 可行：答案 <= mid
    else:
        lo = mid + 1    # mid 不行：比 mid 小的也都不行
print(f"Capacity {lo}")`,
        Java: code`import java.util.ArrayDeque;

public class Main {
    static final int[][] H = {
        {0, 1, 2, 3, 4}, {0, -1, -1, -1, 8}, {0, 2, 4, -1, 5}, {-1, -1, 3, -1, -1}, {6, -1, 1, 2, 3}};
    static final int R = 5, C = 5;
    static final int[][] TARGETS = {{0, 4}, {2, 4}, {4, 4}, {2, 2}};  // (4, 0) 到不了，已先排除

    static boolean check(int cap) {
        boolean[][] seen = new boolean[R][C];  // 每次 check 都重新建立
        ArrayDeque<int[]> q = new ArrayDeque<>();
        seen[0][0] = true;
        q.add(new int[]{0, 0});
        int[] dr = {-1, 1, 0, 0}, dc = {0, 0, -1, 1};
        while (!q.isEmpty()) {
            int[] cur = q.poll();
            for (int k = 0; k < 4; ++k) {
                int nr = cur[0] + dr[k], nc = cur[1] + dc[k];
                if (nr >= 0 && nr < R && nc >= 0 && nc < C && !seen[nr][nc]
                        && H[nr][nc] != -1 && Math.abs(H[nr][nc] - H[cur[0]][cur[1]]) <= cap) {
                    seen[nr][nc] = true;
                    q.add(new int[]{nr, nc});
                }
            }
        }
        for (int[] t : TARGETS) if (!seen[t[0]][t[1]]) return false;
        return true;
    }

    public static void main(String[] args) {
        int lowest = 1_000_000, highest = 0;
        for (int[] row : H)
            for (int h : row)
                if (h != -1) { lowest = Math.min(lowest, h); highest = Math.max(highest, h); }
        int lo = 0, hi = highest - lowest;  // check(hi) 一定成立
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            boolean ok = check(mid);
            System.out.println("lo=" + lo + " hi=" + hi + " mid=" + mid + (ok ? " ok" : " fail"));
            if (ok) hi = mid;      // mid 可行：答案 <= mid
            else lo = mid + 1;     // mid 不行：比 mid 小的也都不行
        }
        System.out.println("Capacity " + lo);
    }
}`,
        JavaScript: code`const H = [
    [0, 1, 2, 3, 4],
    [0, -1, -1, -1, 8],
    [0, 2, 4, -1, 5],
    [-1, -1, 3, -1, -1],
    [6, -1, 1, 2, 3]];
const R = H.length, C = H[0].length;
const TARGETS = [[0, 4], [2, 4], [4, 4], [2, 2]];  // (4, 0) 到不了，已先排除

function check(cap) {
    const seen = Array.from({ length: R }, () => new Array(C).fill(false));  // 每次 check 都重新建立
    const q = [[0, 0]];
    let head = 0;
    seen[0][0] = true;
    while (head < q.length) {
        const [r, c] = q[head++];
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
            if (nr >= 0 && nr < R && nc >= 0 && nc < C && !seen[nr][nc]
                && H[nr][nc] !== -1 && Math.abs(H[nr][nc] - H[r][c]) <= cap) {
                seen[nr][nc] = true;
                q.push([nr, nc]);
            }
        }
    }
    return TARGETS.every(([r, c]) => seen[r][c]);
}

const land = H.flat().filter(h => h !== -1);
let lo = 0, hi = Math.max(...land) - Math.min(...land);  // check(hi) 一定成立
while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);  // / 會留下小數，要向下取整
    const ok = check(mid);
    console.log("lo=" + lo + " hi=" + hi + " mid=" + mid + (ok ? " ok" : " fail"));
    if (ok) hi = mid;      // mid 可行：答案 <= mid
    else lo = mid + 1;     // mid 不行：比 mid 小的也都不行
}
console.log("Capacity " + lo);`,
      },
    },
    {
      id: 'report-order', title: '依（步數, 編號）排序，到不了的排最後', description: '七個補給點的步數（−1 表示到不了）。同步數 4 的補給點 2、4 與同步數 6 的 1、7 依編號排列，補給點 3、6 到不了，排在最後。',
      output: '5 0\n2 4\n4 4\n1 6\n7 6\n3 unreachable\n6 unreachable',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <tuple>
#include <vector>

int main() {
    const std::vector<int> steps = {6, 4, -1, 4, 0, -1, 6};  // 補給點 1～7 的步數，-1 表示到不了
    // tuple 依序比較每一欄：(到不了?, 步數, 編號)，false < true，所以到得了的在前
    std::vector<std::tuple<bool, int, int>> rows;
    for (int i = 0; i < static_cast<int>(steps.size()); ++i) rows.emplace_back(steps[i] == -1, steps[i], i + 1);
    std::sort(rows.begin(), rows.end());
    for (const auto& [unreachable, s, id] : rows) {
        std::cout << id << " ";
        if (unreachable) std::cout << "unreachable\n";
        else std::cout << s << "\n";
    }
    return 0;
}`,
        Python: code`steps = [6, 4, -1, 4, 0, -1, 6]   # 補給點 1～7 的步數，-1 表示到不了

# 排序鍵 (到不了?, 步數, 編號)：False < True，所以到得了的在前；同步數時編號小的在前
order = sorted(range(len(steps)), key=lambda i: (steps[i] == -1, steps[i], i))
for i in order:
    print(i + 1, "unreachable" if steps[i] == -1 else steps[i])`,
        Java: code`import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] steps = {6, 4, -1, 4, 0, -1, 6};  // 補給點 1～7 的步數，-1 表示到不了
        Integer[] order = new Integer[steps.length];
        for (int i = 0; i < steps.length; ++i) order[i] = i;
        // 到不了的當成無限大，排到最後；同步數時編號小的在前
        Arrays.sort(order, (x, y) -> {
            int kx = steps[x] == -1 ? Integer.MAX_VALUE : steps[x];
            int ky = steps[y] == -1 ? Integer.MAX_VALUE : steps[y];
            return kx != ky ? Integer.compare(kx, ky) : Integer.compare(x, y);
        });
        for (int i : order) System.out.println((i + 1) + " " + (steps[i] == -1 ? "unreachable" : String.valueOf(steps[i])));
    }
}`,
        JavaScript: code`const steps = [6, 4, -1, 4, 0, -1, 6];  // 補給點 1～7 的步數，-1 表示到不了
const order = steps.map((_, i) => i);
// 到不了的當成 Infinity，排到最後；同步數時編號小的在前
const key = i => (steps[i] === -1 ? Infinity : steps[i]);
order.sort((x, y) => (key(x) !== key(y) ? key(x) - key(y) : x - y));
for (const i of order) console.log((i + 1) + " " + (steps[i] === -1 ? "unreachable" : steps[i]));`,
      },
    },
  ],
  visualization: {
    kind: 'challenge-stages', title: '救援路線規劃：五個階段',
    stages: [
      { title: '讀題與驗證輸入', concepts: ['F03', 'F12', 'A02'], goal: '讀入地圖、基地與補給點，任何格式或範圍錯誤都只輸出 Invalid。', detail: '整個輸入切成字詞，每個字詞先檢查「可選負號＋1～9 位數字」再轉換，不直接用 int／stoi／parseInt。字詞總數必須剛好是 R × C + 5 + 2K；高度是 −1 或 0～10⁶；座標 1-based，轉成 (r − 1) × C + (c − 1)，不可在界外或崩塌區。' },
      { title: '找出完全到不了的補給點', concepts: ['A14', 'D06', 'F12'], goal: '用一次 BFS 找出不論能力多高都到不了的補給點。', detail: '能力設為 H = 最高 − 最低，此時任兩格陸地都能互走，只剩崩塌區在擋路。被圍住的補給點直接標記 unreachable，其餘的才是二分搜的目標。' },
      { title: '對答案二分搜最小能力', concepts: ['A04', 'A14', 'A01'], goal: '找出讓所有目標都到得了的最小爬坡能力 D。', detail: 'check(D)：只走高度差 ≤ D 的 BFS，所有目標都被拜訪就成立；D 可行則 D + 1 可行。範圍 [0, H]，while lo < hi，成立 hi = mid，否則 lo = mid + 1。每次 check 用新的拜訪陣列，最多 20 回合。' },
      { title: '計算步數並排序輸出', concepts: ['A14', 'A05', 'F16'], goal: '用能力 D 重新 BFS 得到步數，依規則排序輸出。', detail: '步數必須用最小能力 D 計算，不能沿用能力 H 的結果（能力越高可能有捷徑）。排序鍵（到不了?, 步數, 編號）：C++ 用 tuple、Python 用 key、Java 與 JavaScript 用比較函式；不依賴雜湊容器的走訪順序。' },
      { title: '對拍、邊界測資與複雜度', concepts: ['A01', 'A19', 'F17'], goal: '用暴力解與瞄準錯誤的測資驗證，並確認整體 O(N log H + K log K)。', detail: '暴力解逐一嘗試能力、用反覆鬆弛求步數，在數百張隨機小地圖上比對。邊界：1 × 1、全平地、答案剛好 10⁶、全部到不了、同步數與重複點、任意換行；效能：200 × 200 的隨機、蛇形與懸崖地圖。' },
    ],
  },
  quiz: [
    {
      id: 'q-choose', prompt: '地圖最大 200 × 200，高度 0～10⁶。要求「讓所有目標都到得了的最小爬坡能力」，下列哪一種做法正確而且夠快？',
      options: ['從 D = 0 開始逐一加 1，每次做一次 BFS，第一個成功的 D 就是答案', '在 [0, 最高 − 最低] 上對 D 二分搜，每次用 BFS 檢查所有目標是否都被拜訪', '取整張地圖所有相鄰陸地高度差的最大值', '從基地出發，每一步都走向高度差最小的鄰居，記下走過的最大高度差'],
      answer: 1, explanation: '`check(D)` 單調，二分搜最多約 20 回合，每回合一次 O(N) 的 BFS，總共不到 10⁶ 格次。逐一嘗試答案正確，但最壞要 10⁶ 次 BFS、約 4 × 10¹⁰ 次運算，太慢。相鄰高度差的最大值會高估：繞路地圖 `0 9 0 0／0 9 9 0／0 1 2 1` 的最大相鄰差是 9，但繞下方只需要 1。貪心地走最小高度差只看眼前，可能走進死路，也不保證得到的最大差是最小的。',
    },
    {
      id: 'q-monotone', prompt: '對答案二分搜的前提是 `check(D)` 單調（`F…FT…T`）。下列哪一個是正確的理由？',
      options: ['能力 D 允許的每一步，在能力 D + 1 時仍然允許，所以 D 走得到的格子 D + 1 也走得到', 'BFS 求出的步數會隨 D 變大而變大，所以越來越難失敗', '地圖的高度已經由小到大排好', '`check` 只會回傳 true 或 false 兩種結果'],
      answer: 0, explanation: 'D + 1 可走的邊包含 D 可走的所有邊，原本走得通的路仍然走得通，所以一旦成立，之後都成立。步數其實是隨 D 變大而「不增加」：繞路地圖從 7 步變成 3 步，方向說反了，而且步數和 `check` 的成立與否無關。地圖高度沒有排序，二分搜的對象是能力 D，不是高度陣列。任何判斷都只有 true／false，但不代表單調，例如「剛好走 7 步」就不是。',
    },
    {
      id: 'q-output', prompt: '地圖 2 × 3，第一列高度 `0 3 0`、第二列 `1 2 6`，沒有崩塌區；基地在 (1, 1)，補給點 1 在 (1, 3)，補給點 2 在 (2, 3)。也就是輸入 `2 3 0 3 0 1 2 6 1 1 2 1 3 2 3`。參考解答的輸出是？（／表示換行）',
      options: ['Capacity 3／1 2／2 unreachable', 'Capacity 4／1 2／2 3', 'Capacity 6／1 2／2 3', 'Capacity 4／1 4／2 3'],
      answer: 1, explanation: '(1, 3) 的鄰居是高度 3 與 6，最少要能力 3；(2, 3) 高度 6，鄰居是高度 2 與 0，最少要能力 4，所以答案是 4。能力 4 時：基地 → (1, 2)（差 3）→ (1, 3)，2 步；基地 → (2, 1) → (2, 2) → (2, 3)（差 4），3 步。第一個選項把「能力 3 到不了」誤當成 unreachable，但 unreachable 只用於被崩塌區隔開的點；6 是走 (1, 3) → (2, 3) 那條邊需要的能力，不是最小值；4 步是繞 (2, 1) → (2, 2) → (1, 2) → (1, 3) 的路線，但能力 4 時基地可以直接爬上 (1, 2)，BFS 找到的最少步數是 2。',
    },
    {
      id: 'q-complexity', prompt: '設 N = R × C、H = 最高 − 最低，參考解答（解析、兩次額外 BFS、二分搜、排序）的總時間複雜度是？',
      options: ['O(N + K)', 'O(N log H + K log K)', 'O(N · H)', 'O(N² log H)'],
      answer: 1, explanation: '每次 BFS 是 O(N)，二分搜做 O(log H) 次，另外兩次 BFS 是 O(N)，排序 K 個補給點是 O(K log K)，合計 O(N log H + K log K)。O(N + K) 忽略了二分搜的回合數；O(N · H) 是逐一嘗試每個能力的成本；O(N² log H) 是把每次 BFS 誤算成 O(N²)，例如每次都用鄰接矩陣找鄰居。',
    },
    {
      id: 'q-visited', prompt: '有人把 `min-capacity` 範例的 `check` 改成下面這樣（`seen` 只在程式開頭建立一次），其餘不變。在同一張範例地圖上，最後一行印出什麼？',
      code: { language: 'Python', text: 'seen = [[False] * C for _ in range(R)]       # 只在程式開頭建立一次\n\n\ndef check(cap):\n    seen[0][0] = True\n    q = deque([(0, 0)])\n    while q:\n        r, c = q.popleft()\n        for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):\n            if 0 <= nr < R and 0 <= nc < C and not seen[nr][nc] \\\n                    and H[nr][nc] != -1 and abs(H[nr][nc] - H[r][c]) <= cap:\n                seen[nr][nc] = True\n                q.append((nr, nc))\n    return all(seen[r][c] for r, c in TARGETS)' },
      options: ['`Capacity 4`，和原本一樣', '`Capacity 0`', '程式陷入無窮迴圈', '`Capacity 8`'],
      answer: 1, explanation: '第一次 `check(4)` 正確地拜訪了所有目標並留下標記；之後的 `check(2)`、`check(1)`、`check(0)` 一開始就看到目標都是 True，全部回傳成立，hi 一路降到 0，印出 `Capacity 0`（實際執行四回合都是 ok）。它不會無窮迴圈，因為 lo、hi 仍照規則縮小；8 是「每次 check 都失敗」時的結果，那是沒有排除到不了的點的錯誤。修正：在 `check` 裡面建立 `seen`。',
    },
    {
      id: 'q-test', prompt: '某人的程式把上界寫成 `hi = 最高 − 最低 − 1`，其餘正確。下列哪一組測資能抓到這個錯誤（輸出和正確答案不同）？',
      options: ['全部高度都是 5 的 3 × 3 平地', '範例的 5 × 5 地圖（正確答案是能力 4）', '`1 2`／`0 1000000`，基地 (1, 1)，補給點 (1, 2)', '基地被崩塌區完全圍住、兩個補給點都到不了的 3 × 3 地圖'],
      answer: 2, explanation: '正確答案是 `Capacity 1000000`。錯誤程式的上界是 999999，連「找出到得了的點」那次 BFS 都過不去，補給點被誤判成 unreachable，印出 `Capacity 0` 與 `1 unreachable`。平地的正確答案是 0，hi 變成 −1 時迴圈不執行，仍印出 0；範例答案 4 小於錯誤的上界 7，不受影響；全部到不了時答案本來就是 0。只有「答案剛好等於整個範圍」的測資會讓這個錯誤現形。',
    },
    {
      id: 'q-loop', prompt: '二分搜的更新寫成下面這樣（其餘照參考解答）。下列哪一個說法正確？',
      code: { language: 'Python', text: 'while lo < hi:\n    mid = (lo + hi) // 2\n    if check(mid):\n        hi = mid\n    else:\n        lo = mid' },
      options: ['只要正確答案大於 0，就會陷入無窮迴圈', '只有正確答案是 0 時才會陷入無窮迴圈', '永遠會結束，只是多跑幾回合', '只有當 hi − lo 是奇數時才會出錯'],
      answer: 0, explanation: '答案 a > 0 時，範圍最後會縮到 lo = a − 1、hi = a：mid = a − 1，`check` 不成立，`lo = mid` 讓 lo 不變，範圍不再縮小，永遠停在這裡（用每一個 a 模擬都得到同樣的結果）。答案是 0 時，`check(mid)` 一路成立，hi 往下降到 0，迴圈正常結束，所以第二個選項說反了。問題不在奇偶：mid 向下取整時，`lo = mid` 必須寫成 `lo = mid + 1`，才能保證每回合都排除至少一個值。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '綜合試煉：救援路線規劃',
      statement: '地圖是 R × C 的格子，每格有高度（0～10⁶），`-1` 代表崩塌區不能進入。救援車從基地出發，每一步往上、下、左、右移動一格，兩格的高度差不能超過爬坡能力 D。有 K 個補給點（依輸入順序編號 1～K）。若某個補給點即使不限制高度差也到不了（被崩塌區隔開），它是「到不了的點」；其餘的補給點稱為目標。求最小的整數 D ≥ 0，使所有目標都到得了（沒有目標時 D = 0），再用能力 D 求出每個補給點的最少步數。輸入有任何錯誤時只輸出 `Invalid`。',
      inputFormat: '輸入由以空白或換行分隔的整數組成（排列方式不限）：`R C`；接著 R × C 個高度，依列由上而下、每列由左而右；基地座標 `r c`；補給點數量 K；接著 K 組座標 `r c`。座標從 1 開始。每個字詞必須是「可選的負號＋1～9 位數字」，否則整個輸入為 Invalid。',
      outputFormat: '第一行 `Capacity D`。接著每個目標一行 `編號 步數`，依步數由小到大，步數相同時依編號由小到大；最後每個到不了的點一行 `編號 unreachable`，依編號由小到大。輸入不合法時只輸出一行 `Invalid`。',
      constraints: ['1 ≤ R, C ≤ 200', '每格高度為 −1 或 0 ≤ h ≤ 10⁶', '1 ≤ K ≤ 1000', '基地與補給點必須在地圖內（1 ≤ r ≤ R、1 ≤ c ≤ C），且不在崩塌區', '字詞總數必須剛好是 R × C + 5 + 2K', '補給點可以在基地上，也可以重複'],
      samples: [{ kind: 'normal', input: SAMPLE_INPUT, output: SAMPLE_OUTPUT, note: '補給點 4 被崩塌區圍住；補給點 2 需要能力 4（高度 4 → 8）；補給點 1 與 5 都是 4 步，依編號排列' }],
      tests: [
        { kind: 'normal', input: SAMPLE_INPUT, output: SAMPLE_OUTPUT, note: '範例：到不了的點、需要能力 4、同步數依編號' },
        { kind: 'normal', input: '3 4\n0 9 0 0\n0 9 9 0\n0 1 2 1\n1 1\n2\n1 4\n3 3', output: 'Capacity 1\n2 4\n1 7', note: '繞路地圖：能力 9 時 (1, 4) 只要 3 步，但步數要用最小能力 1 計算，是 7 步' },
        { kind: 'normal', input: '4 6\n5 6 8 30 31 33\n4 -1 9 -1 -1 35\n3 2 12 14 40 38\n-1 1 -1 15 -1 36\n3 2\n5\n1 6\n4 4\n4 2\n2 6\n1 1', output: 'Capacity 22\n3 1\n2 3\n5 3\n1 6\n4 7', note: '右上的高地只能從高度 8 → 30 上去（差 22）；同 3 步的補給點 2 與 5 依編號' },
        { kind: 'normal', input: randomInput, output: randomOutput, note: '200 × 200 的偽隨機高度（約 4% 崩塌區），答案 554410：逐一嘗試能力要做幾十萬次 BFS' },
        { kind: 'edge', input: '1 1\n5\n1 1\n1\n1 1', output: 'Capacity 0\n1 0', note: '最小地圖：基地就是補給點，H = 0，二分搜一回合都不跑' },
        { kind: 'edge', input: '3 3\n5 5 5\n5 5 5\n5 5 5\n2 2\n6\n1 1\n1 2\n3 3\n2 2\n1 2\n2 1', output: 'Capacity 0\n4 0\n2 1\n5 1\n6 1\n1 2\n3 2', note: '全平地答案 0（抓 lo = 1）；補給點 4 在基地上；2 與 5 重複；同步數依編號' },
        { kind: 'edge', input: '1 2\n0 1000000\n1 1\n1\n1 2', output: 'Capacity 1000000\n1 1', note: '答案剛好是整個範圍 10⁶（抓上界少 1）' },
        { kind: 'edge', input: '3 3\n1 -1 5\n-1 -1 5\n5 5 5\n1 1\n2\n3 3\n1 3', output: 'Capacity 0\n1 unreachable\n2 unreachable', note: '基地被圍住：沒有目標，答案是 0 而不是 H = 4' },
        { kind: 'edge', input: '2 3 0 4\n1 -1\n\n2 3 1 1 2 2 3\n1   3\n', output: 'Capacity 4\n2 2\n1 3', note: '字詞任意換行與空行：依字詞解析，不依行' },
        { kind: 'edge', input: snakeInput, output: snakeOutput, note: '200 × 200 蛇形通道，最長 20098 步；一個高度 500000 的捷徑只有能力很高時才能用，步數必須用能力 1 計算' },
        { kind: 'edge', input: cliffInput, output: cliffOutput, note: '200 × 200 平地加一座 10⁶ 的懸崖、K = 1000：每次 check 都走遍整張地圖；步數是曼哈頓距離，大量同步數' },
        { kind: 'error', input: '0 5', output: 'Invalid', note: 'R = 0' },
        { kind: 'error', input: '2 201', output: 'Invalid', note: 'C = 201 超出範圍' },
        { kind: 'error', input: '2 2\n0 1\n1000001 3\n1 1\n1\n2 2', output: 'Invalid', note: '高度超過 10⁶' },
        { kind: 'error', input: '2 2\n0 1\n-2 3\n1 1\n1\n2 2', output: 'Invalid', note: '高度 −2：只有 −1 代表崩塌區' },
        { kind: 'error', input: '2 2\n0 1\n3.5 3\n1 1\n1\n2 2', output: 'Invalid', note: '小數：`std::stoi` 會默默讀成 3' },
        { kind: 'error', input: '2 2\n0 +1\n2 3\n1 1\n1\n2 2', output: 'Invalid', note: '`+1`：`int`、`stoi`、`parseInt` 都會接受，但不符合格式' },
        { kind: 'error', input: '2 2\n-1 1\n2 3\n1 1\n1\n2 2', output: 'Invalid', note: '基地在崩塌區' },
        { kind: 'error', input: '2 3\n0 1 2\n3 4 5\n1 1\n2\n2 3\n3 1', output: 'Invalid', note: '補給點 (3, 1) 超出 R = 2：1-based 的上界；(2, 3) 剛好是右下角，合法' },
        { kind: 'error', input: '2 3\n0 1 2\n3 -1 5\n1 1\n1\n2 2', output: 'Invalid', note: '補給點在崩塌區' },
        { kind: 'error', input: '2 2\n0 1\n2 3\n1 1\n0', output: 'Invalid', note: 'K = 0' },
        { kind: 'error', input: '2 2\n0 1\n2 3\n1 1\n2\n2 2\n1', output: 'Invalid', note: 'K = 2 但只有一組半的座標' },
        { kind: 'error', input: '2 2\n0 1\n2 3\n1 1\n1\n2 2 7', output: 'Invalid', note: '多了一個字詞' },
        { kind: 'error', input: '', output: 'Invalid', note: '空的輸入' },
      ],
      hints: [
        '階段一：把整個輸入切成字詞，寫一個「可選負號＋1～9 位數字」的檢查函式；依 R、C、K 確認字詞總數，再檢查高度與座標範圍。先只用錯誤測資測它。',
        '階段二：寫 `bfs(start, cap)`，回傳每格的步數（−1 表示到不了）。陣列在函式裡面建立，邊界檢查寫在讀取高度之前。',
        '階段三：用 cap = 最高 − 最低 做一次 BFS，排除到不了的補給點；對剩下的目標在 [0, 最高 − 最低] 上二分搜：成立 `hi = mid`，否則 `lo = mid + 1`。',
        '階段四：用找到的最小能力再做一次 BFS，依（到不了?, 步數, 編號）排序輸出。',
        '階段五：另寫一支逐一嘗試能力的暴力解，在隨機小地圖上對拍；再測 1 × 1、全平地、答案 10⁶、全部到不了與 200 × 200 的地圖。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <queue>
#include <string>
#include <tuple>
#include <vector>

int R, C;
std::vector<int> h;  // 高度，-1 是崩塌區

// 只接受「可選的負號 + 1～9 位數字」；std::stoi 自己會接受 "+5"、" 5" 與 "5x"
bool toInt(const std::string& s, int& out) {
    std::size_t start = (!s.empty() && s[0] == '-') ? 1 : 0;
    if (s.size() - start < 1 || s.size() - start > 9) return false;
    for (std::size_t i = start; i < s.size(); ++i)
        if (s[i] < '0' || s[i] > '9') return false;
    out = std::stoi(s);
    return true;
}

// 從 start 出發，只走高度差 <= cap 的相鄰陸地，回傳每一格的步數（到不了是 -1）
std::vector<int> bfs(int start, int cap) {
    std::vector<int> dist(R * C, -1);  // 每次呼叫都重新建立，不沿用上一次的結果
    std::queue<int> q;
    dist[start] = 0;
    q.push(start);
    const int dr[] = {-1, 1, 0, 0}, dc[] = {0, 0, -1, 1};
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        int r = u / C, c = u % C;
        for (int k = 0; k < 4; ++k) {
            int nr = r + dr[k], nc = c + dc[k];
            if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
            int v = nr * C + nc;
            if (dist[v] == -1 && h[v] != -1 && std::abs(h[v] - h[u]) <= cap) {
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }
    return dist;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<int> a;
    for (std::string t; std::cin >> t;) {
        int x;
        if (!toInt(t, x)) { std::cout << "Invalid\n"; return 0; }
        a.push_back(x);
    }
    auto invalid = [] { std::cout << "Invalid\n"; return 0; };
    if (a.size() < 2) return invalid();
    R = a[0];
    C = a[1];
    if (R < 1 || R > 200 || C < 1 || C > 200 || a.size() < static_cast<std::size_t>(R * C + 5)) return invalid();
    int n = R * C, K = a[n + 4];
    if (K < 1 || K > 1000 || a.size() != static_cast<std::size_t>(n + 5 + 2 * K)) return invalid();
    h.assign(a.begin() + 2, a.begin() + 2 + n);
    int lowest = 1000000, highest = 0;
    for (int x : h) {
        if (x < -1 || x > 1000000) return invalid();
        if (x != -1) { lowest = std::min(lowest, x); highest = std::max(highest, x); }
    }
    auto cell = [&](int r, int c) {  // 1-based 座標 → 0-based 編號；界外或崩塌區回傳 -1
        return (r < 1 || r > R || c < 1 || c > C || h[(r - 1) * C + c - 1] == -1) ? -1 : (r - 1) * C + c - 1;
    };
    int base = cell(a[n + 2], a[n + 3]);
    std::vector<int> pts(K);
    for (int i = 0; i < K; ++i) pts[i] = cell(a[n + 5 + 2 * i], a[n + 6 + 2 * i]);
    if (base == -1 || std::count(pts.begin(), pts.end(), -1) > 0) return invalid();

    int lo = 0, hi = highest - lowest;  // hi：所有相鄰陸地之間都能走，一定可行
    std::vector<int> reach = bfs(base, hi), targets;
    for (int v : pts) if (reach[v] != -1) targets.push_back(v);
    while (lo < hi) {  // 找第一個 check 成立的能力
        int mid = lo + (hi - lo) / 2;
        std::vector<int> dist = bfs(base, mid);
        bool ok = std::all_of(targets.begin(), targets.end(), [&](int v) { return dist[v] != -1; });
        if (ok) hi = mid;
        else lo = mid + 1;
    }
    std::vector<int> dist = bfs(base, lo);
    std::vector<std::tuple<bool, int, int>> rows;  // (到不了, 步數, 編號)：false 排在 true 前面
    for (int i = 0; i < K; ++i) rows.emplace_back(dist[pts[i]] == -1, dist[pts[i]], i + 1);
    std::sort(rows.begin(), rows.end());
    std::string out = "Capacity " + std::to_string(lo) + "\n";
    for (const auto& [unreachable, steps, id] : rows)
        out += std::to_string(id) + (unreachable ? std::string(" unreachable") : " " + std::to_string(steps)) + "\n";
    std::cout << out;
    return 0;
}`,
        Python: code`import sys
from collections import deque

MAX_H = 10**6


def to_int(s):
    # 只接受「可選的負號 + 1～9 位 ASCII 數字」；int() 自己會接受 "+5"、"1_0" 與全形數字
    digits = s[1:] if s.startswith("-") else s
    if not (1 <= len(digits) <= 9 and digits.isascii() and digits.isdigit()):
        return None
    return int(s)


def bfs(h, R, C, start, cap):
    # 從 start 出發，只走高度差 <= cap 的相鄰陸地，回傳每一格的步數（到不了是 -1）
    dist = [-1] * (R * C)  # 每次呼叫都重新建立，不沿用上一次的結果
    dist[start] = 0
    q = deque([start])
    while q:
        u = q.popleft()
        r, c = divmod(u, C)
        for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
            if 0 <= nr < R and 0 <= nc < C:
                v = nr * C + nc
                if dist[v] == -1 and h[v] != -1 and abs(h[v] - h[u]) <= cap:
                    dist[v] = dist[u] + 1
                    q.append(v)
    return dist


def solve(tokens):
    nums = [to_int(t) for t in tokens]
    if len(nums) < 2 or None in nums:
        return None
    R, C = nums[0], nums[1]
    if not (1 <= R <= 200 and 1 <= C <= 200) or len(nums) < R * C + 5:
        return None
    h = nums[2:2 + R * C]                        # 高度，-1 是崩塌區
    sr, sc, K = nums[2 + R * C:5 + R * C]
    if not (1 <= K <= 1000) or len(nums) != R * C + 5 + 2 * K:
        return None
    if any(x < -1 or x > MAX_H for x in h):
        return None
    # 座標是 1-based；基地與補給點都不能在界外或崩塌區
    coords = [(sr, sc)] + [(nums[R * C + 5 + 2 * i], nums[R * C + 6 + 2 * i]) for i in range(K)]
    if any(not (1 <= r <= R and 1 <= c <= C) or h[(r - 1) * C + c - 1] == -1 for r, c in coords):
        return None
    base = (sr - 1) * C + sc - 1
    cells = [(r - 1) * C + c - 1 for r, c in coords[1:]]

    land = [x for x in h if x != -1]
    lo, hi = 0, max(land) - min(land)            # hi：所有相鄰陸地之間都能走，一定可行
    reach = bfs(h, R, C, base, hi)
    targets = [v for v in cells if reach[v] != -1]
    while lo < hi:                               # 找第一個 check 成立的能力
        mid = (lo + hi) // 2
        dist = bfs(h, R, C, base, mid)
        if all(dist[v] != -1 for v in targets):
            hi = mid
        else:
            lo = mid + 1
    dist = bfs(h, R, C, base, lo)
    # 排序鍵 (到不了?, 步數, 編號)：到得了的在前，同步數依編號
    order = sorted(range(K), key=lambda i: (dist[cells[i]] == -1, dist[cells[i]], i))
    out = [f"Capacity {lo}"]
    for i in order:
        d = dist[cells[i]]
        out.append(f"{i + 1} {d}" if d != -1 else f"{i + 1} unreachable")
    return "\n".join(out)


def main():
    result = solve(sys.stdin.read().split())
    print("Invalid" if result is None else result)


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.StringTokenizer;

public class Main {
    static int R, C;
    static int[] h;  // 高度，-1 是崩塌區

    // 只接受「可選的負號 + 1～9 位數字」；Integer.parseInt 自己會接受 "+5"
    static Integer toInt(String s) {
        int start = s.startsWith("-") ? 1 : 0;
        if (s.length() - start < 1 || s.length() - start > 9) return null;
        for (int i = start; i < s.length(); ++i)
            if (s.charAt(i) < '0' || s.charAt(i) > '9') return null;
        return Integer.parseInt(s);
    }

    // 從 start 出發，只走高度差 <= cap 的相鄰陸地，回傳每一格的步數（到不了是 -1）
    static int[] bfs(int start, int cap) {
        int[] dist = new int[R * C];
        Arrays.fill(dist, -1);  // 每次呼叫都重新建立，不沿用上一次的結果
        int[] queue = new int[R * C];  // 每格最多入隊一次，用陣列當佇列
        int head = 0, tail = 0;
        dist[start] = 0;
        queue[tail++] = start;
        int[] dr = {-1, 1, 0, 0}, dc = {0, 0, -1, 1};
        while (head < tail) {
            int u = queue[head++], r = u / C, c = u % C;
            for (int k = 0; k < 4; ++k) {
                int nr = r + dr[k], nc = c + dc[k];
                if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
                int v = nr * C + nc;
                if (dist[v] == -1 && h[v] != -1 && Math.abs(h[v] - h[u]) <= cap) {
                    dist[v] = dist[u] + 1;
                    queue[tail++] = v;
                }
            }
        }
        return dist;
    }

    static int cell(int r, int c) {  // 1-based 座標 → 0-based 編號；界外或崩塌區回傳 -1
        return (r < 1 || r > R || c < 1 || c > C || h[(r - 1) * C + c - 1] == -1) ? -1 : (r - 1) * C + c - 1;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        List<Integer> a = new ArrayList<>();
        for (String line; (line = br.readLine()) != null;) {
            for (StringTokenizer st = new StringTokenizer(line); st.hasMoreTokens();) {
                Integer x = toInt(st.nextToken());
                if (x == null) { System.out.println("Invalid"); return; }
                a.add(x);
            }
        }
        System.out.print(solve(a));
    }

    static String solve(List<Integer> a) {
        if (a.size() < 2) return "Invalid\n";
        R = a.get(0);
        C = a.get(1);
        if (R < 1 || R > 200 || C < 1 || C > 200 || a.size() < R * C + 5) return "Invalid\n";
        int n = R * C, K = a.get(n + 4);
        if (K < 1 || K > 1000 || a.size() != n + 5 + 2 * K) return "Invalid\n";
        h = new int[n];
        int lowest = 1_000_000, highest = 0;
        for (int i = 0; i < n; ++i) {
            h[i] = a.get(i + 2);
            if (h[i] < -1 || h[i] > 1_000_000) return "Invalid\n";
            if (h[i] != -1) { lowest = Math.min(lowest, h[i]); highest = Math.max(highest, h[i]); }
        }
        int base = cell(a.get(n + 2), a.get(n + 3));
        int[] pts = new int[K];
        for (int i = 0; i < K; ++i) pts[i] = cell(a.get(n + 5 + 2 * i), a.get(n + 6 + 2 * i));
        if (base == -1 || Arrays.stream(pts).anyMatch(v -> v == -1)) return "Invalid\n";

        int lo = 0, hi = highest - lowest;  // hi：所有相鄰陸地之間都能走，一定可行
        int[] reach = bfs(base, hi);
        int[] targets = Arrays.stream(pts).filter(v -> reach[v] != -1).toArray();
        while (lo < hi) {  // 找第一個 check 成立的能力
            int mid = lo + (hi - lo) / 2;
            int[] dist = bfs(base, mid);
            if (Arrays.stream(targets).allMatch(v -> dist[v] != -1)) hi = mid;
            else lo = mid + 1;
        }
        int[] dist = bfs(base, lo);
        Integer[] order = new Integer[K];
        for (int i = 0; i < K; ++i) order[i] = i;
        // 到得了的依步數、同步數依編號；到不了的（key 最大）排最後，依編號
        Arrays.sort(order, (x, y) -> {
            int kx = dist[pts[x]] == -1 ? Integer.MAX_VALUE : dist[pts[x]];
            int ky = dist[pts[y]] == -1 ? Integer.MAX_VALUE : dist[pts[y]];
            return kx != ky ? Integer.compare(kx, ky) : Integer.compare(x, y);
        });
        StringBuilder out = new StringBuilder("Capacity ").append(lo).append('\n');
        for (int i : order) {
            out.append(i + 1).append(' ');
            out.append(dist[pts[i]] == -1 ? "unreachable" : String.valueOf(dist[pts[i]])).append('\n');
        }
        return out.toString();
    }
}`,
        JavaScript: code`const MAX_H = 1000000;

// 只接受「可選的負號 + 1～9 位 ASCII 數字」；Number 自己會接受 "+5"、"3.5" 與 "1e3"
function toInt(s) {
    return /^-?[0-9]{1,9}$/.test(s) ? Number(s) : null;
}

// 從 start 出發，只走高度差 <= cap 的相鄰陸地，回傳每一格的步數（到不了是 -1）
function bfs(h, R, C, start, cap) {
    const dist = new Array(R * C).fill(-1);  // 每次呼叫都重新建立，不沿用上一次的結果
    const queue = [start];                   // 陣列當佇列，head 指向下一個要取出的位置
    let head = 0;
    dist[start] = 0;
    while (head < queue.length) {
        const u = queue[head++];
        const r = Math.floor(u / C), c = u % C;
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
            if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
            const v = nr * C + nc;
            if (dist[v] === -1 && h[v] !== -1 && Math.abs(h[v] - h[u]) <= cap) {
                dist[v] = dist[u] + 1;
                queue.push(v);
            }
        }
    }
    return dist;
}

function solve(tokens) {
    const nums = tokens.map(toInt);
    if (nums.length < 2 || nums.includes(null)) return null;
    const [R, C] = nums;
    if (!(R >= 1 && R <= 200 && C >= 1 && C <= 200) || nums.length < R * C + 5) return null;
    const n = R * C;
    const h = nums.slice(2, 2 + n);              // 高度，-1 是崩塌區
    const [sr, sc, K] = nums.slice(2 + n, 5 + n);
    if (!(K >= 1 && K <= 1000) || nums.length !== n + 5 + 2 * K) return null;
    if (h.some(x => x < -1 || x > MAX_H)) return null;
    // 座標是 1-based；基地與補給點都不能在界外或崩塌區
    const coords = [[sr, sc]];
    for (let i = 0; i < K; i++) coords.push([nums[n + 5 + 2 * i], nums[n + 6 + 2 * i]]);
    if (coords.some(([r, c]) => !(r >= 1 && r <= R && c >= 1 && c <= C) || h[(r - 1) * C + c - 1] === -1)) return null;
    const base = (sr - 1) * C + sc - 1;
    const cells = coords.slice(1).map(([r, c]) => (r - 1) * C + c - 1);

    let lowest = MAX_H, highest = 0;
    for (const x of h) {
        if (x !== -1) {
            lowest = Math.min(lowest, x);
            highest = Math.max(highest, x);
        }
    }
    let lo = 0, hi = highest - lowest;           // hi：所有相鄰陸地之間都能走，一定可行
    const reach = bfs(h, R, C, base, hi);
    const targets = cells.filter(v => reach[v] !== -1);
    while (lo < hi) {                            // 找第一個 check 成立的能力
        const mid = lo + Math.floor((hi - lo) / 2);
        const dist = bfs(h, R, C, base, mid);
        if (targets.every(v => dist[v] !== -1)) hi = mid;
        else lo = mid + 1;
    }
    const dist = bfs(h, R, C, base, lo);
    // 排序鍵：到得了的依步數、同步數依編號；到不了的當成 Infinity 排最後，依編號
    const key = i => (dist[cells[i]] === -1 ? Infinity : dist[cells[i]]);
    const order = cells.map((_, i) => i).sort((x, y) => (key(x) !== key(y) ? key(x) - key(y) : x - y));
    const out = ["Capacity " + lo];
    for (const i of order) {
        const d = dist[cells[i]];
        out.push((i + 1) + " " + (d === -1 ? "unreachable" : d));
    }
    return out.join("\n");
}

const result = solve(require("fs").readFileSync(0, "utf8").split(/\s+/).filter(t => t.length > 0));
console.log(result === null ? "Invalid" : result);`,
      },
      judge: 'none',
    },
  ],
};

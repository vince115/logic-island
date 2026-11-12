import type { LessonContent, TraceStep } from '../schema';
import { prefixSumSteps } from '../simulate-algorithms';

const code = String.raw;

/*
 * A10 Prefix Sum. Every example and the reference solutions run in tests/curriculum-code.test.ts. The small tests'
 * expected outputs were produced by an independent brute-force Python reference (sum(a[l-1:r]) per query, same input
 * checks); the two large tests below compute theirs here without a prefix array over the input.
 */

/** The visualization's data: a negative value, so a range sum can be smaller than its parts. */
const TRACE_A = [3, -1, 4, 1, 5, -9, 2];
const TRACE_Q: [number, number][] = [[0, 2], [2, 5], [4, 4]];

/**
 * prefixSumSteps runs the trace code: 'init' is `P = [0]` (line 2), 'build' the append (line 4), 'query' the print
 * (line 7). The loop variables of the trace code are added to each step here.
 */
const traceSteps: TraceStep[] = prefixSumSteps(TRACE_A, TRACE_Q, { init: 2, build: 4, query: 7 }).map((step, k, all): TraceStep => {
  const n = TRACE_A.length;
  if (k >= 1 && k <= n) return { ...step, vars: { i: String(k - 1) } };
  if (k > n) {
    const [l, r] = TRACE_Q[k - n - 1];
    const extra = k === all.length - 1 ? '單一元素的區間 l = r 也用同一個公式：P[r + 1] − P[r] 就是 a[r] 本身。' : '';
    return { ...step, vars: { l: String(l), r: String(r) }, note: `${step.note}${extra}` };
  }
  return step;
});

/**
 * Large test 1 (too slow for O(nq)): n = 2×10^5 values a[i] = (7i mod 19) − 9, q = 2×10^4 queries, each about 2×10^5
 * long (4×10^9 additions by brute force). The values repeat with period 19 and one period sums to 0, so the sum of the
 * first m values is G[m mod 19], where G is the brute-force sum of the first 0..18 values; no array of n prefixes.
 */
const BIG_N = 200_000;
const BIG_Q = 20_000;
const f = (i: number) => ((i * 7) % 19) - 9;
const G = Array.from({ length: 19 }, (_, m) => Array.from({ length: m }, (_, i) => f(i)).reduce((s, v) => s + v, 0));
const bigQueries = Array.from({ length: BIG_Q }, (_, k): [number, number] => [1 + ((k * 37) % 1000), BIG_N - ((k * 53) % 1000)]);
const bigInput = `${BIG_N}\n${Array.from({ length: BIG_N }, (_, i) => f(i)).join(' ')}\n${BIG_Q}\n${bigQueries.map(([l, r]) => `${l} ${r}`).join('\n')}`;
const bigOutput = bigQueries.map(([l, r]) => String(G[r % 19] - G[(l - 1) % 19])).join('\n');

/**
 * Large test 2 (overflow): n = 6×10^4 values close to ±10^9, so long ranges sum to about 3×10^13, far beyond 2^31.
 * q = 300 queries (long and short in turn); expected sums by brute force, query by query (exact: below 2^53).
 */
const OV_N = 60_000;
const OV_Q = 300;
const ovValues = Array.from({ length: OV_N }, (_, i) => (i % 4 === 3 ? -999_999_999 : 1_000_000_000 - (i % 10)));
const ovQueries = Array.from({ length: OV_Q }, (_, k): [number, number] => {
  const l = 1 + ((k * 97) % 500);
  return [l, k % 2 ? OV_N - ((k * 89) % 500) : l + (k % 50)];
});
const ovInput = `${OV_N}\n${ovValues.join(' ')}\n${OV_Q}\n${ovQueries.map(([l, r]) => `${l} ${r}`).join('\n')}`;
const ovOutput = ovQueries.map(([l, r]) => {
  let s = 0;
  for (let i = l - 1; i < r; i++) s += ovValues[i];
  return String(s);
}).join('\n');

/**
 * A10 Prefix Sum. 2026-11-02: also offers JavaScript (Node.js); prefix sums (|P| ≤ 2×10^14 under the stated limits) stay
 * plain numbers, exact below 2^53, so no BigInt; the subarray count uses a Map.
 */
export const A10: LessonContent = {
  lessonId: 'A10',
  motivation: '成績表上有 n 天的營業額，老闆一直問：「第 3 天到第 40 天一共賺多少？」「第 100 天到第 2000 天呢？」每次都用迴圈從頭加，一次查詢最多 O(n)，q 次就是 O(nq)；n 與 q 都是 2×10^5 時，要做到 4×10^10 次加法，遠遠超時。前綴和（prefix sum）的想法很簡單：先花 O(n) 把「前 i 個的和」全部算好存起來，之後任何一段連續區間的和都只要一次減法，O(1) 回答。同一個想法可以延伸到表格（二維前綴和，算任意子矩形的和）、反過來處理「很多次把一段區間都加上 v」（差分陣列），還能配合雜湊表數出「和恰好是 K 的子陣列有幾個」，而且負數也沒問題。它的限制是：資料必須先固定下來；如果查詢之間陣列一直被修改，每改一次前綴和就要重建 O(n)，需要的是更進階的資料結構。另外，前綴和本身的數值會比每個元素大很多，C++／Java 用 `int` 存很容易溢位，這也是本課要特別小心的地方。',
  sections: [
    {
      id: 'idea', title: '核心想法：先累加一次，之後每次 O(1)',
      blocks: [
        { type: 'p', text: '給長度 n 的陣列 `a[0..n−1]`（0-based）。定義前綴和陣列 `P`，長度是 n + 1：`P[i]` 是「前 i 個元素」的和，也就是 `a[0] + a[1] + … + a[i−1]`，不包含 `a[i]`。所以 `P[0] = 0`（前 0 個元素，空的和），而且 `P[i + 1] = P[i] + a[i]`：從左到右一個迴圈就能建好，O(n)。這種「P[i] 不含 a[i]」的寫法叫做排除式（exclusive）前綴和，多出來的 `P[0] = 0` 讓之後的公式不需要任何特例。' },
        { type: 'table', head: ['i', '0', '1', '2', '3', '4', '5', '6', '7', '8'], rows: [
          ['a[i]', '3', '1', '4', '1', '5', '9', '2', '6', '（無）'],
          ['P[i]（前 i 個的和）', '0', '3', '4', '8', '9', '14', '23', '25', '31'],
        ] },
        { type: 'p', text: '區間和（range sum）：`a[l] + a[l+1] + … + a[r]`（0-based、含兩端 l 和 r）等於 `P[r + 1] − P[l]`。理由是：`P[r + 1]` 是 `a[0..r]` 的和，`P[l]` 是 `a[0..l−1]` 的和，相減後前面共同的 `a[0..l−1]` 互相抵消，剩下的剛好是 `a[l..r]`。像這樣「大的一段減掉小的一段」的寫法，用在每一個 l ≤ r 都成立，包括 l = 0（減掉 `P[0] = 0`）與 l = r（只剩 `a[r]` 一個）。例如上表 `a[1..3] = 1 + 4 + 1 = 6`，用公式是 `P[4] − P[1] = 9 − 3 = 6`。' },
        { type: 'example', id: 'prefix-query' },
        { type: 'p', text: '範例中的題目用的是「第 l 個到第 r 個」（1-based），程式先換成 0-based 的 `a[l−1..r−1]`，再套 `P[r + 1] − P[l]` 的 0-based 公式，所以實際用到的是 `P[r] − P[l−1]`（l、r 是題目的 1-based 數字）。下一節會整理兩種慣例。C++、Python、Java 都有算前綴的函式庫：Python 的 `itertools.accumulate(a, initial=0)`（3.8 起有 `initial`）直接得到含 `P[0] = 0` 的 P；C++ `<numeric>` 的 `std::partial_sum` 與 Java 的 `Arrays.parallelPrefix` 算的是「含 a[i]」的前綴（沒有開頭的 0），範例把它們寫到第 1 格以後再比對；JavaScript 沒有內建的前綴和函式，範例用迴圈建 P，再用 `reduce` 暴力加總比對。注意 `std::partial_sum` 累加時用的是輸入元素的型別：輸入是 `int` 時，就算輸出存進 `long long` 也會在中途溢位，所以範例的 a 本身就是 `long long`。' },
        { type: 'table', head: ['做法', '準備', '每次查詢', 'q 次查詢共', '額外空間'], rows: [
          ['每次用迴圈從 l 加到 r', '無', 'O(r − l + 1)，最壞 O(n)', 'O(nq)', 'O(1)'],
          ['前綴和', 'O(n) 建 P', 'O(1)：一次減法', 'O(n + q)', 'O(n)：P 有 n + 1 格'],
        ] },
        { type: 'p', text: '為什麼值得多花 n + 1 格空間：n = q = 2×10^5 時，前綴和只要大約 4×10^5 次運算，暴力加總要 4×10^10 次。下方的視覺化逐步建出 P，再回答三個區間查詢，可以看到每個查詢只讀了 P 的兩格；「自己試試看」可以換成自己的陣列。' },
      ],
    },
    {
      id: 'boundaries', title: '邊界與型別：含兩端、0-based／1-based、溢位',
      blocks: [
        { type: 'p', text: '前綴和的錯誤幾乎都來自「差一」（off-by-one）：P 比 a 多一格，題目又常用 1-based 的編號。只要固定一種慣例、整份程式照用，就不會亂。兩種常見寫法的 P 其實是同一個陣列（`P[i]` = 前 i 個元素的和），差別只在 l、r 怎麼編號：' },
        { type: 'table', head: ['慣例', 'a 的編號', '建表', '區間 l..r（含兩端）的和', '整個陣列'], rows: [
          ['0-based（程式的陣列）', '`a[0..n−1]`', '`P[0] = 0`，`P[i + 1] = P[i] + a[i]`', '`P[r + 1] − P[l]`', '`P[n] − P[0]`'],
          ['1-based（題目的「第 l 到第 r 個」）', '第 1～n 個，存在 `a[0..n−1]`', '同上（或把 a 存在 `a[1..n]`，令 `P[i] = P[i − 1] + a[i]`）', '`P[r] − P[l − 1]`', '`P[n] − P[0]`'],
        ] },
        { type: 'p', text: '讀題時先問自己兩件事：編號從 0 還是從 1 開始？區間是否包含兩端？本課的題目都是含兩端的閉區間（inclusive）。如果題目給的是半開區間 `[l, r)`（含 l、不含 r，0-based），和就是 `P[r] − P[l]`，個數是 r − l。三種寫法只差一個 ±1，所以要用 l = r（只有一個元素）、l = 1（從第一個開始）、r = n（到最後一個）這三種查詢檢查程式。' },
        { type: 'callout', tone: 'warning', title: '最常見的錯：寫成 `P[r] − P[l]`', text: '以 0-based、含兩端為例，`a = [10, 20, 30, 40]` 的 `a[1..2]` 應該是 20 + 30 = 50。P 是 `[0, 10, 30, 60, 100]`，`P[r] − P[l] = P[2] − P[1] = 20`，少算了 `a[r]`。在 1-based 的題目裡，第 2 到第 3 個也是 50，寫成 `P[r] − P[l] = P[3] − P[2] = 30` 則少算了第 l 個。兩種錯的共同點是：拿「含兩端」的區間去套「半開區間」的公式。另一種錯是在 1-based 題目直接用 0-based 公式 `P[r + 1] − P[l]`：第 2 到第 3 個會算成 `P[4] − P[2] = 70`，整段往右偏了一格，r = n 時還會讀到 `P[n + 1]` 而越界（Python `IndexError`、Java `ArrayIndexOutOfBoundsException`、C++ 未定義行為；JavaScript 不報錯，讀到 `undefined`，差變成 `NaN`）。' },
        { type: 'p', text: '整數範圍：前綴和是很多個數加起來的結果，比任何一個元素都大得多。n = 2×10^5 個、每個絕對值到 10^9 的數，總和的絕對值可能到 2×10^14，而 C++ 與 Java 的 `int` 最大只有 2^31 − 1 = 2147483647（約 2.1×10^9），只要 3 個 10^9 加起來就超過了。所以 P 要用 C++ `long long`、Java `long`（最大約 9.2×10^18）；Python 的整數沒有大小上限，不會溢位。JavaScript 只有一種 number，整數在 2^53（約 9×10^15）以內都精確，2×10^14 放得下，所以本課的 JavaScript 程式直接用 number；可能超過 2^53 時才需要改用 `BigInt`。' },
        { type: 'callout', tone: 'warning', title: '`int` 存前綴和會溢位', text: 'Java 的 `int` 溢位會默默繞回（wrap around）：三個 1000000000 的和印出 −1294967296，不會丟出例外。C++ 有號整數溢位是未定義行為（undefined behavior），結果不能預期。只把 P 宣告成 `long long` 還不夠：C++ 的 `P[i + 1] = P[i] + a[i]` 因為 `P[i]` 是 `long long`，加法會用 `long long` 計算，這樣是安全的；但像 `long long s = a[i] + a[j];`（兩個都是 `int`）會先用 `int` 相加再轉型，已經來不及了。二維前綴和與差分陣列也一樣，表格本身要用 64 位元整數。' },
        { type: 'p', text: '前綴和只適合「資料先固定，之後只查詢」的情況。如果查詢之間還會修改某個 `a[i]`，從 `P[i + 1]` 開始的每一格都要改，一次修改 O(n)；修改與查詢都很多時，就要改用樹狀陣列（Fenwick tree，又叫 Binary Indexed Tree）或線段樹（segment tree），它們能讓修改與查詢都是 O(log n)，本課不展開。' },
      ],
    },
    {
      id: 'two-d', title: '二維前綴和：任意子矩形的和',
      blocks: [
        { type: 'p', text: '表格 `g` 有 R 列、C 行。定義 `S[i][j]` 為「前 i 列、前 j 行」，也就是左上角 i × j 那一塊的和，S 的大小是 (R + 1) × (C + 1)，第 0 列與第 0 行都是 0，作用和一維的 `P[0] = 0` 一樣。建表的公式是 `S[i + 1][j + 1] = S[i][j + 1] + S[i + 1][j] − S[i][j] + g[i][j]`：上面那一塊加左邊那一塊，兩塊重疊的左上角被加了兩次，所以減掉一次，最後加上格子本身。依列、依行由小到大填，用到的格子都已經算好，總共 O(RC)。' },
        { type: 'p', text: '查詢列 r1..r2、行 c1..c2（0-based、含兩端）的子矩形和，用容斥原理（inclusion–exclusion）：`S[r2 + 1][c2 + 1] − S[r1][c2 + 1] − S[r2 + 1][c1] + S[r1][c1]`。先拿到右下角為止的整塊，減掉上方（列 0..r1−1）的一條，再減掉左方（行 0..c1−1）的一條；左上角那一小塊被減了兩次，要加回一次。每次查詢 O(1)。' },
        { type: 'example', id: 'rect-sum' },
        { type: 'p', text: '範例先印出 S（左上角的 0 列、0 行就是多出來的邊框），例如列 1..2、行 1..3 的和是 `S[3][4] − S[1][4] − S[3][1] + S[1][1] = 28 − 8 − 9 + 3 = 14`，和暴力加總的 6 + 3 + 2 + 2 + 0 + 1 = 14 相同。單一格、單一列、整張表也都用同一個公式。' },
        { type: 'callout', tone: 'warning', title: '二維的兩個常見錯誤', text: '第一，加回 `S[r1][c1]` 忘了寫，或寫成減號：左上角那一塊會被多減一次。第二，下標的 +1 只加在一邊，例如 `S[r2][c2] − S[r1][c2] − …`：和一維的 `P[r] − P[l]` 一樣，少算了最後一列與最後一行。不確定時，拿只有一格的查詢（r1 = r2、c1 = c2）驗算，結果必須等於 `g[r1][c1]`。另外 R × C 可能很大（例如 1000 × 1000 個 10^6，總和 10^12），S 同樣要用 64 位元整數。' },
      ],
    },
    {
      id: 'difference', title: '差分陣列：大量區間加值，前綴和的反向操作',
      blocks: [
        { type: 'p', text: '另一種常見的題目反過來：有 m 次操作「把 `a[l..r]` 每一個都加上 v」，全部做完才問最後的陣列。直接做每次 O(r − l + 1)，最壞 O(nm)。差分陣列（difference array）把「一整段加 v」變成兩格的修改：`D[l] += v`、`D[r + 1] −= v`（D 的長度是 n + 1，r = n − 1 時 `D[n]` 才有地方放）。全部操作記完以後，對 D 做一次前綴和，第 i 格的值就是位置 i 一共被加了多少。' },
        { type: 'p', text: '為什麼對：對 D 做前綴和時，走到位置 i 的累計值是 `D[0] + … + D[i]`。一次操作 (l, r, v) 在 `D[l]` 放了 +v，在 `D[r + 1]` 放了 −v：i < l 時兩個都還沒走到，貢獻 0；l ≤ i ≤ r 時只走到 +v；i > r 時 +v 與 −v 抵消。所以每個操作剛好讓 l..r 加上 v，其他位置不受影響。前綴和是「從差求總」，差分是「從總求差」：對原陣列做 `D[i] = a[i] − a[i − 1]`，再做前綴和就會還原 a，兩者互為反向操作。' },
        { type: 'example', id: 'diff-array' },
        { type: 'p', text: '範例中 4 次操作一共只修改了 D 8 次（每次 2 格），最後一次前綴和得到 `a = -1 2 2 5 5 2 7 7`，和逐格直接加的結果相同。總複雜度是 O(n + m)。原本陣列不是全 0 時，把最後的結果加到原陣列上即可。注意差分只適合「先全部更新、最後才查詢」；如果更新和查詢交錯出現，每次查詢都要重做前綴和，又變回 O(n)。' },
        { type: 'callout', tone: 'tip', title: '二維也可以差分', text: '把子矩形 (r1, c1)..(r2, c2) 全部加 v，在 (R + 1) × (C + 1) 的差分表上改四格：`D[r1][c1] += v`、`D[r1][c2 + 1] −= v`、`D[r2 + 1][c1] −= v`、`D[r2 + 1][c2 + 1] += v`，最後做一次二維前綴和。四個角的正負號正好對應上一節查詢公式的容斥。' },
      ],
    },
    {
      id: 'hash-count', title: '前綴和 + 雜湊表：和為 K 的子陣列，與其他方法比較',
      blocks: [
        { type: 'p', text: '問題：陣列有正有負，和恰好是 K 的連續子陣列（subarray）有幾個？兩層迴圈列舉每一對 (i, j) 是 O(n²)。用前綴和改寫條件：`a[i..j]` 的和是 `P[j + 1] − P[i]`，要它等於 K，就是 `P[i] = P[j + 1] − K`。所以由左往右掃，每走到一個新的前綴和 `P[j + 1]`，就問「前面出現過幾次 `P[j + 1] − K`」，把次數加進答案，再把 `P[j + 1]` 記進雜湊表（D10；JavaScript 用 `Map`）。每一步平均 O(1)，總共平均 O(n)。' },
        { type: 'list', items: [
          '雜湊表一開始要放 `{0: 1}`，代表空的前綴 `P[0] = 0`；漏掉它就數不到從索引 0 開始的子陣列。',
          '先查詢、再把目前的前綴和放進去。順序反過來，K = 0 時每一步都會把「空的子陣列」算成一個。',
          '答案可能很大：n 個 0、K = 0 時有 n(n + 1)/2 個，n = 2×10^5 時約 2×10^10，C++／Java 的計數要用 `long long`／`long`；JavaScript 的 number 在 2^53 以內精確，直接計數即可。',
        ] },
        { type: 'example', id: 'subarray-k' },
        { type: 'p', text: '和 A09 的滑動視窗（sliding window）比較：視窗做法依賴「元素都非負」，這樣右端往右擴，和只會變大；左端往右縮，和只會變小，於是「和太大就縮左端」永遠不會錯過答案。有負數時這個單調性消失：在 `[5, −3, 1]` 找和為 3，視窗看到 5 > 3 就把 5 丟掉，但其實 5 + (−3) + 1 = 3 正是答案（範例最後一行的 1 個）。前綴和 + 雜湊表不需要任何單調性，負數、0 都可以；代價是 O(n) 的額外空間，而且只能「數個數」或「找位置」，不像視窗能順便維護視窗內的其他資訊。元素保證非負時，兩種都行，視窗只需要 O(1) 額外空間。' },
        { type: 'table', head: ['情況', '適合的做法', '時間', '說明'], rows: [
          ['陣列固定，大量區間和查詢', '前綴和', '建表 O(n)，每次 O(1)', '本課主角；記得 64 位元'],
          ['只查一兩次', '直接用迴圈加', 'O(n)', '不值得建表'],
          ['陣列一直被修改，又要查詢', '樹狀陣列（Fenwick tree）或線段樹', '修改與查詢 O(log n)', '前綴和每次修改都要 O(n) 重建'],
          ['大量區間加值，最後才看結果', '差分陣列', 'O(n + m)', '前綴和的反向操作'],
          ['和為 K 的子陣列個數，有負數', '前綴和 + 雜湊表', '平均 O(n)', '滑動視窗在有負數時會漏掉答案'],
          ['和 ≥ S 的最短子陣列，元素非負', '滑動視窗（A09）', 'O(n)', 'O(1) 額外空間'],
          ['子矩形的和', '二維前綴和', '建表 O(RC)，每次 O(1)', '容斥：減兩條、加回左上角'],
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'prefix-query', title: '建立前綴和並回答 1-based 的區間查詢', description: '建出長度 n + 1 的 P，和函式庫的結果比對，再把題目的「第 l 到第 r 個」換成 0-based 後用 `P[r + 1] − P[l]` 回答。',
      output: 'P = 0 3 4 8 9 14 23 25 31\nsum(1..8) -> a[0..7] = P[8] - P[0] = 31 - 0 = 31\nsum(2..4) -> a[1..3] = P[4] - P[1] = 9 - 3 = 6\nsum(5..5) -> a[4..4] = P[5] - P[4] = 14 - 9 = 5\nsum(3..7) -> a[2..6] = P[7] - P[2] = 25 - 4 = 21',
      code: {
        'C++': code`#include <iostream>
#include <numeric>
#include <utility>
#include <vector>

int main() {
    std::vector<long long> a = {3, 1, 4, 1, 5, 9, 2, 6};
    int n = static_cast<int>(a.size());
    // P[i] = a[0] + ... + a[i-1]（前 i 個的和），P[0] = 0，長度 n + 1
    std::vector<long long> P(n + 1, 0);
    for (int i = 0; i < n; ++i) P[i + 1] = P[i] + a[i];
    // 函式庫：std::partial_sum 算的是含 a[i] 的前綴，所以寫到第 1 格以後
    std::vector<long long> lib(n + 1, 0);
    std::partial_sum(a.begin(), a.end(), lib.begin() + 1);
    if (lib != P) std::cout << "DIFFERENT\n";
    std::cout << "P =";
    for (long long p : P) std::cout << " " << p;
    std::cout << "\n";
    // 題目用 1-based、含兩端的 [l, r]：0-based 是 a[l-1..r-1]
    std::vector<std::pair<int, int>> queries = {{1, 8}, {2, 4}, {5, 5}, {3, 7}};
    for (const auto& [l, r] : queries) {
        int lo = l - 1, hi = r - 1;  // 換成 0-based
        long long total = P[hi + 1] - P[lo];
        std::cout << "sum(" << l << ".." << r << ") -> a[" << lo << ".." << hi << "] = P[" << hi + 1 << "] - P[" << lo
                  << "] = " << P[hi + 1] << " - " << P[lo] << " = " << total << "\n";
    }
    return 0;
}`,
        Python: code`from itertools import accumulate

a = [3, 1, 4, 1, 5, 9, 2, 6]
n = len(a)
# P[i] = a[0] + ... + a[i-1]（前 i 個的和），P[0] = 0，長度 n + 1
P = [0] * (n + 1)
for i in range(n):
    P[i + 1] = P[i] + a[i]
assert P == list(accumulate(a, initial=0))  # 函式庫（Python 3.8+）的結果相同
print("P =", *P)
# 題目用 1-based、含兩端的 [l, r]：0-based 是 a[l-1..r-1]
for l, r in [(1, 8), (2, 4), (5, 5), (3, 7)]:
    lo, hi = l - 1, r - 1  # 換成 0-based
    total = P[hi + 1] - P[lo]
    assert total == sum(a[lo:hi + 1])  # 和暴力加總相同
    print(f"sum({l}..{r}) -> a[{lo}..{hi}] = P[{hi + 1}] - P[{lo}] = {P[hi + 1]} - {P[lo]} = {total}")`,
        Java: code`import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        long[] a = {3, 1, 4, 1, 5, 9, 2, 6};
        int n = a.length;
        // P[i] = a[0] + ... + a[i-1]（前 i 個的和），P[0] = 0，長度 n + 1；用 long 避免溢位
        long[] P = new long[n + 1];
        for (int i = 0; i < n; i++) P[i + 1] = P[i] + a[i];
        // 函式庫：Arrays.parallelPrefix 就地算出含 a[i] 的前綴，lib[i] 應該等於 P[i + 1]
        long[] lib = a.clone();
        Arrays.parallelPrefix(lib, Long::sum);
        for (int i = 0; i < n; i++) if (lib[i] != P[i + 1]) System.out.println("DIFFERENT");
        StringBuilder sb = new StringBuilder("P =");
        for (long p : P) sb.append(' ').append(p);
        System.out.println(sb);
        // 題目用 1-based、含兩端的 [l, r]：0-based 是 a[l-1..r-1]
        int[][] queries = {{1, 8}, {2, 4}, {5, 5}, {3, 7}};
        for (int[] q : queries) {
            int l = q[0], r = q[1];
            int lo = l - 1, hi = r - 1;  // 換成 0-based
            long total = P[hi + 1] - P[lo];
            System.out.println("sum(" + l + ".." + r + ") -> a[" + lo + ".." + hi + "] = P[" + (hi + 1) + "] - P[" + lo
                + "] = " + P[hi + 1] + " - " + P[lo] + " = " + total);
        }
    }
}`,
        JavaScript: code`const a = [3, 1, 4, 1, 5, 9, 2, 6];
const n = a.length;
// P[i] = a[0] + ... + a[i-1]（前 i 個的和），P[0] = 0，長度 n + 1
const P = new Array(n + 1).fill(0);
for (let i = 0; i < n; i++) P[i + 1] = P[i] + a[i];
// JavaScript 沒有內建的前綴和函式：用 reduce 暴力加總比對總和
if (P[n] !== a.reduce((s, x) => s + x, 0)) console.log("DIFFERENT");
console.log("P = " + P.join(" "));
// 題目用 1-based、含兩端的 [l, r]：0-based 是 a[l-1..r-1]
for (const [l, r] of [[1, 8], [2, 4], [5, 5], [3, 7]]) {
    const lo = l - 1, hi = r - 1;  // 換成 0-based
    const total = P[hi + 1] - P[lo];
    if (total !== a.slice(lo, hi + 1).reduce((s, x) => s + x, 0)) console.log("DIFFERENT");  // 和暴力加總相同
    console.log("sum(" + l + ".." + r + ") -> a[" + lo + ".." + hi + "] = P[" + (hi + 1) + "] - P[" + lo + "] = "
        + P[hi + 1] + " - " + P[lo] + " = " + total);
}`,
      },
    },
    {
      id: 'rect-sum', title: '二維前綴和：子矩形的和', description: '4 × 5 的表格建出 5 × 6 的 S，印出 S，再用容斥公式回答 5 個子矩形查詢，並和暴力加總比對。',
      output: ' 0  0  0  0  0  0\n 0  3  3  4  8 10\n 0  8 14 18 24 27\n 0  9 17 21 28 36\n 0 13 22 26 34 49\nrows 1..2, cols 1..3: 14 (brute 14)\nrows 0..3, cols 0..4: 49 (brute 49)\nrows 2..3, cols 4..4: 12 (brute 12)\nrows 0..0, cols 2..2: 1 (brute 1)\nrows 3..3, cols 0..4: 13 (brute 13)',
      code: {
        'C++': code`#include <iomanip>
#include <iostream>
#include <vector>

int main() {
    std::vector<std::vector<long long>> g = {
        {3, 0, 1, 4, 2},
        {5, 6, 3, 2, 1},
        {1, 2, 0, 1, 5},
        {4, 1, 0, 1, 7},
    };
    int R = static_cast<int>(g.size()), C = static_cast<int>(g[0].size());
    // S[i][j] = 前 i 列、前 j 行（左上角 i x j 的矩形）的和；第 0 列與第 0 行都是 0
    std::vector<std::vector<long long>> S(R + 1, std::vector<long long>(C + 1, 0));
    for (int i = 0; i < R; ++i)
        for (int j = 0; j < C; ++j)
            S[i + 1][j + 1] = S[i][j + 1] + S[i + 1][j] - S[i][j] + g[i][j];
    for (const auto& row : S) {
        for (int j = 0; j <= C; ++j) std::cout << (j ? " " : "") << std::setw(2) << row[j];
        std::cout << "\n";
    }
    // 列 r1..r2、行 c1..c2（0-based、含兩端）的和：容斥原理
    auto rect = [&](int r1, int c1, int r2, int c2) {
        return S[r2 + 1][c2 + 1] - S[r1][c2 + 1] - S[r2 + 1][c1] + S[r1][c1];
    };
    std::vector<std::vector<int>> queries = {{1, 1, 2, 3}, {0, 0, 3, 4}, {2, 4, 3, 4}, {0, 2, 0, 2}, {3, 0, 3, 4}};
    for (const auto& q : queries) {
        long long brute = 0;
        for (int i = q[0]; i <= q[2]; ++i)
            for (int j = q[1]; j <= q[3]; ++j) brute += g[i][j];
        std::cout << "rows " << q[0] << ".." << q[2] << ", cols " << q[1] << ".." << q[3] << ": "
                  << rect(q[0], q[1], q[2], q[3]) << " (brute " << brute << ")\n";
    }
    return 0;
}`,
        Python: code`g = [
    [3, 0, 1, 4, 2],
    [5, 6, 3, 2, 1],
    [1, 2, 0, 1, 5],
    [4, 1, 0, 1, 7],
]
R, C = len(g), len(g[0])
# S[i][j] = 前 i 列、前 j 行（左上角 i x j 的矩形）的和；第 0 列與第 0 行都是 0
S = [[0] * (C + 1) for _ in range(R + 1)]
for i in range(R):
    for j in range(C):
        S[i + 1][j + 1] = S[i][j + 1] + S[i + 1][j] - S[i][j] + g[i][j]
for row in S:
    print(" ".join(f"{v:2d}" for v in row))


def rect(r1, c1, r2, c2):
    """列 r1..r2、行 c1..c2（0-based、含兩端）的和：容斥原理。"""
    return S[r2 + 1][c2 + 1] - S[r1][c2 + 1] - S[r2 + 1][c1] + S[r1][c1]


for r1, c1, r2, c2 in [(1, 1, 2, 3), (0, 0, 3, 4), (2, 4, 3, 4), (0, 2, 0, 2), (3, 0, 3, 4)]:
    brute = sum(g[i][j] for i in range(r1, r2 + 1) for j in range(c1, c2 + 1))
    print(f"rows {r1}..{r2}, cols {c1}..{c2}: {rect(r1, c1, r2, c2)} (brute {brute})")`,
        Java: code`public class Main {
    public static void main(String[] args) {
        long[][] g = {
            {3, 0, 1, 4, 2},
            {5, 6, 3, 2, 1},
            {1, 2, 0, 1, 5},
            {4, 1, 0, 1, 7},
        };
        int R = g.length, C = g[0].length;
        // S[i][j] = 前 i 列、前 j 行（左上角 i x j 的矩形）的和；第 0 列與第 0 行都是 0
        long[][] S = new long[R + 1][C + 1];
        for (int i = 0; i < R; i++)
            for (int j = 0; j < C; j++)
                S[i + 1][j + 1] = S[i][j + 1] + S[i + 1][j] - S[i][j] + g[i][j];
        for (long[] row : S) {
            StringBuilder sb = new StringBuilder();
            for (int j = 0; j <= C; j++) sb.append(j > 0 ? " " : "").append(String.format("%2d", row[j]));
            System.out.println(sb);
        }
        int[][] queries = {{1, 1, 2, 3}, {0, 0, 3, 4}, {2, 4, 3, 4}, {0, 2, 0, 2}, {3, 0, 3, 4}};
        for (int[] q : queries) {
            int r1 = q[0], c1 = q[1], r2 = q[2], c2 = q[3];
            // 列 r1..r2、行 c1..c2（0-based、含兩端）的和：容斥原理
            long sum = S[r2 + 1][c2 + 1] - S[r1][c2 + 1] - S[r2 + 1][c1] + S[r1][c1];
            long brute = 0;
            for (int i = r1; i <= r2; i++)
                for (int j = c1; j <= c2; j++) brute += g[i][j];
            System.out.println("rows " + r1 + ".." + r2 + ", cols " + c1 + ".." + c2 + ": " + sum + " (brute " + brute + ")");
        }
    }
}`,
        JavaScript: code`const g = [
    [3, 0, 1, 4, 2],
    [5, 6, 3, 2, 1],
    [1, 2, 0, 1, 5],
    [4, 1, 0, 1, 7],
];
const R = g.length, C = g[0].length;
// S[i][j] = 前 i 列、前 j 行（左上角 i x j 的矩形）的和；第 0 列與第 0 行都是 0
const S = Array.from({ length: R + 1 }, () => new Array(C + 1).fill(0));
for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++)
        S[i + 1][j + 1] = S[i][j + 1] + S[i + 1][j] - S[i][j] + g[i][j];
for (const row of S) console.log(row.map(v => String(v).padStart(2)).join(" "));

// 列 r1..r2、行 c1..c2（0-based、含兩端）的和：容斥原理
function rect(r1, c1, r2, c2) {
    return S[r2 + 1][c2 + 1] - S[r1][c2 + 1] - S[r2 + 1][c1] + S[r1][c1];
}

for (const [r1, c1, r2, c2] of [[1, 1, 2, 3], [0, 0, 3, 4], [2, 4, 3, 4], [0, 2, 0, 2], [3, 0, 3, 4]]) {
    let brute = 0;
    for (let i = r1; i <= r2; i++)
        for (let j = c1; j <= c2; j++) brute += g[i][j];
    console.log("rows " + r1 + ".." + r2 + ", cols " + c1 + ".." + c2 + ": " + rect(r1, c1, r2, c2) + " (brute " + brute + ")");
}`,
      },
    },
    {
      id: 'diff-array', title: '差分陣列：4 次區間加值', description: '每次操作只改 D 的兩格，最後對 D 做一次前綴和得到結果，並和逐格直接加的做法比對。',
      output: 'D = -1 3 0 3 0 -3 5 0 -7\na = -1 2 2 5 5 2 7 7\nnaive: same',
      code: {
        'C++': code`#include <array>
#include <iostream>
#include <vector>

int main() {
    const int n = 8;
    // (l, r, v)：a[l..r] 每個都加 v（0-based、含兩端）
    std::vector<std::array<int, 3>> updates = {{1, 4, 3}, {3, 7, 2}, {0, 2, -1}, {6, 7, 5}};
    std::vector<long long> D(n + 1, 0);  // 多一格，r = n - 1 時 D[r + 1] 才不會越界
    for (const auto& [l, r, v] : updates) {
        D[l] += v;
        D[r + 1] -= v;
    }
    std::cout << "D =";
    for (long long d : D) std::cout << " " << d;
    std::cout << "\n";
    std::vector<long long> a(n, 0);
    long long running = 0;
    for (int i = 0; i < n; ++i) {
        running += D[i];  // 對 D 做前綴和，就是每個位置被加了多少
        a[i] = running;
    }
    std::cout << "a =";
    for (long long x : a) std::cout << " " << x;
    std::cout << "\n";
    std::vector<long long> naive(n, 0);
    for (const auto& [l, r, v] : updates)  // 直接加：每次 O(r - l + 1)
        for (int i = l; i <= r; ++i) naive[i] += v;
    std::cout << "naive: " << (naive == a ? "same" : "DIFFERENT") << "\n";
    return 0;
}`,
        Python: code`n = 8
updates = [(1, 4, 3), (3, 7, 2), (0, 2, -1), (6, 7, 5)]  # (l, r, v)：a[l..r] 每個都加 v（0-based、含兩端）
D = [0] * (n + 1)  # 多一格，r = n - 1 時 D[r + 1] 才不會越界
for l, r, v in updates:
    D[l] += v
    D[r + 1] -= v
print("D =", *D)
a = [0] * n
running = 0
for i in range(n):
    running += D[i]  # 對 D 做前綴和，就是每個位置被加了多少
    a[i] = running
print("a =", *a)
naive = [0] * n
for l, r, v in updates:  # 直接加：每次 O(r - l + 1)
    for i in range(l, r + 1):
        naive[i] += v
print("naive:", "same" if naive == a else "DIFFERENT")`,
        Java: code`import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int n = 8;
        // (l, r, v)：a[l..r] 每個都加 v（0-based、含兩端）
        int[][] updates = {{1, 4, 3}, {3, 7, 2}, {0, 2, -1}, {6, 7, 5}};
        long[] D = new long[n + 1];  // 多一格，r = n - 1 時 D[r + 1] 才不會越界
        for (int[] u : updates) {
            D[u[0]] += u[2];
            D[u[1] + 1] -= u[2];
        }
        StringBuilder sb = new StringBuilder("D =");
        for (long d : D) sb.append(' ').append(d);
        System.out.println(sb);
        long[] a = new long[n];
        long running = 0;
        for (int i = 0; i < n; i++) {
            running += D[i];  // 對 D 做前綴和，就是每個位置被加了多少
            a[i] = running;
        }
        sb = new StringBuilder("a =");
        for (long x : a) sb.append(' ').append(x);
        System.out.println(sb);
        long[] naive = new long[n];
        for (int[] u : updates)  // 直接加：每次 O(r - l + 1)
            for (int i = u[0]; i <= u[1]; i++) naive[i] += u[2];
        System.out.println("naive: " + (Arrays.equals(naive, a) ? "same" : "DIFFERENT"));
    }
}`,
        JavaScript: code`const n = 8;
const updates = [[1, 4, 3], [3, 7, 2], [0, 2, -1], [6, 7, 5]];  // [l, r, v]：a[l..r] 每個都加 v（0-based、含兩端）
const D = new Array(n + 1).fill(0);  // 多一格，r = n - 1 時 D[r + 1] 才有地方放
for (const [l, r, v] of updates) {
    D[l] += v;
    D[r + 1] -= v;
}
console.log("D = " + D.join(" "));
const a = new Array(n).fill(0);
let running = 0;
for (let i = 0; i < n; i++) {
    running += D[i];  // 對 D 做前綴和，就是每個位置被加了多少
    a[i] = running;
}
console.log("a = " + a.join(" "));
const naive = new Array(n).fill(0);
for (const [l, r, v] of updates)  // 直接加：每次 O(r - l + 1)
    for (let i = l; i <= r; i++) naive[i] += v;
console.log("naive: " + (naive.every((x, i) => x === a[i]) ? "same" : "DIFFERENT"));`,
      },
    },
    {
      id: 'subarray-k', title: '和為 K 的子陣列個數（可以有負數）', description: '前綴和配合雜湊表數出和恰好是 k 的連續子陣列，並和 O(n²) 的暴力解比對；最後一組是滑動視窗會漏掉的例子。',
      output: 'case 1: k=7 count=4 brute=4\ncase 2: k=0 count=3 brute=3\ncase 3: k=0 count=4 brute=4\ncase 4: k=3 count=1 brute=1',
      code: {
        'C++': code`#include <iostream>
#include <unordered_map>
#include <utility>
#include <vector>

// 和恰好是 k 的連續子陣列個數；a 可以有負數。
long long countSumK(const std::vector<long long>& a, long long k) {
    std::unordered_map<long long, long long> seen;
    seen[0] = 1;  // 空的前綴 P[0] = 0
    long long prefix = 0, count = 0;
    for (long long x : a) {
        prefix += x;  // prefix = P[j + 1]
        auto it = seen.find(prefix - k);
        if (it != seen.end()) count += it->second;  // 前面有幾個 P[i] = P[j + 1] - k
        ++seen[prefix];                              // 先查再放：子陣列至少有一個元素
    }
    return count;
}

long long brute(const std::vector<long long>& a, long long k) {
    long long count = 0;
    for (size_t i = 0; i < a.size(); ++i) {
        long long s = 0;
        for (size_t j = i; j < a.size(); ++j) {
            s += a[j];
            if (s == k) ++count;
        }
    }
    return count;
}

int main() {
    std::vector<std::pair<std::vector<long long>, long long>> cases = {
        {{3, 4, -7, 1, 3, 3, 1, -4}, 7}, {{3, 4, -7, 1, 3, 3, 1, -4}, 0}, {{1, -1, 1, -1}, 0}, {{5, -3, 1}, 3}};
    int id = 0;
    for (const auto& [a, k] : cases) {
        std::cout << "case " << ++id << ": k=" << k << " count=" << countSumK(a, k) << " brute=" << brute(a, k) << "\n";
    }
    return 0;
}`,
        Python: code`from collections import defaultdict


def count_sum_k(a, k):
    """和恰好是 k 的連續子陣列個數；a 可以有負數。"""
    seen = defaultdict(int)
    seen[0] = 1  # 空的前綴 P[0] = 0
    prefix = count = 0
    for x in a:
        prefix += x                  # prefix = P[j + 1]
        count += seen[prefix - k]    # 前面有幾個 P[i] = P[j + 1] - k
        seen[prefix] += 1            # 先查再放：子陣列至少有一個元素
    return count


def brute(a, k):
    count = 0
    for i in range(len(a)):
        s = 0
        for j in range(i, len(a)):
            s += a[j]
            count += s == k
    return count


cases = [([3, 4, -7, 1, 3, 3, 1, -4], 7), ([3, 4, -7, 1, 3, 3, 1, -4], 0), ([1, -1, 1, -1], 0), ([5, -3, 1], 3)]
for case_id, (a, k) in enumerate(cases, start=1):
    print(f"case {case_id}: k={k} count={count_sum_k(a, k)} brute={brute(a, k)}")`,
        Java: code`import java.util.HashMap;
import java.util.Map;

public class Main {
    // 和恰好是 k 的連續子陣列個數；a 可以有負數。
    static long countSumK(long[] a, long k) {
        Map<Long, Long> seen = new HashMap<>();
        seen.put(0L, 1L);  // 空的前綴 P[0] = 0
        long prefix = 0, count = 0;
        for (long x : a) {
            prefix += x;                                // prefix = P[j + 1]
            count += seen.getOrDefault(prefix - k, 0L); // 前面有幾個 P[i] = P[j + 1] - k
            seen.merge(prefix, 1L, Long::sum);          // 先查再放：子陣列至少有一個元素
        }
        return count;
    }

    static long brute(long[] a, long k) {
        long count = 0;
        for (int i = 0; i < a.length; i++) {
            long s = 0;
            for (int j = i; j < a.length; j++) {
                s += a[j];
                if (s == k) count++;
            }
        }
        return count;
    }

    public static void main(String[] args) {
        long[][] arrays = {{3, 4, -7, 1, 3, 3, 1, -4}, {3, 4, -7, 1, 3, 3, 1, -4}, {1, -1, 1, -1}, {5, -3, 1}};
        long[] ks = {7, 0, 0, 3};
        for (int c = 0; c < arrays.length; c++) {
            System.out.println("case " + (c + 1) + ": k=" + ks[c] + " count=" + countSumK(arrays[c], ks[c]) + " brute=" + brute(arrays[c], ks[c]));
        }
    }
}`,
        JavaScript: code`// 和恰好是 k 的連續子陣列個數；a 可以有負數。
function countSumK(a, k) {
    const seen = new Map([[0, 1]]);  // 空的前綴 P[0] = 0
    let prefix = 0, count = 0;
    for (const x of a) {
        prefix += x;                                    // prefix = P[j + 1]
        count += seen.get(prefix - k) ?? 0;             // 前面有幾個 P[i] = P[j + 1] - k
        seen.set(prefix, (seen.get(prefix) ?? 0) + 1);  // 先查再放：子陣列至少有一個元素
    }
    return count;
}

function brute(a, k) {
    let count = 0;
    for (let i = 0; i < a.length; i++) {
        let s = 0;
        for (let j = i; j < a.length; j++) {
            s += a[j];
            if (s === k) count++;
        }
    }
    return count;
}

const cases = [[[3, 4, -7, 1, 3, 3, 1, -4], 7], [[3, 4, -7, 1, 3, 3, 1, -4], 0], [[1, -1, 1, -1], 0], [[5, -3, 1], 3]];
cases.forEach(([a, k], c) => {
    console.log("case " + (c + 1) + ": k=" + k + " count=" + countSumK(a, k) + " brute=" + brute(a, k));
});`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '前綴和：建出 P，再用 P[r + 1] − P[l] 回答含兩端的查詢', language: 'Python',
    code: code`a = [3, -1, 4, 1, 5, -9, 2]
P = [0]                    # P[0] = 0：前 0 個的和
for i in range(len(a)):
    P.append(P[i] + a[i])  # P[i + 1] = P[i] + a[i]
queries = [(0, 2), (2, 5), (4, 4)]  # 0-based、含兩端
for l, r in queries:
    print(P[r + 1] - P[l])`,
    steps: traceSteps,
    tryIt: { algorithm: 'prefix-sum', initial: TRACE_A },
  },
  quiz: [
    {
      id: 'q-build', prompt: '下面的 Python 程式印出什麼？',
      code: { language: 'Python', text: code`a = [5, -2, 7, 0, 3]
P = [0] * (len(a) + 1)
for i in range(len(a)):
    P[i + 1] = P[i] + a[i]
print(P)` },
      options: ['[0, 5, 3, 10, 10, 13]', '[5, 3, 10, 10, 13]', '[0, 5, 3, 10, 10]', '[0, 5, -2, 7, 0, 3]'],
      answer: 0, explanation: 'P 有 len(a) + 1 = 6 格，`P[0] = 0`，之後每格是前一格加上對應的元素：0、5、5 − 2 = 3、3 + 7 = 10、10 + 0 = 10、10 + 3 = 13。「[5, 3, 10, 10, 13]」是含 a[i] 的前綴和，少了開頭的 0（這個程式的 P 有 6 格）；「[0, 5, 3, 10, 10]」漏了最後一格的總和 13；「[0, 5, -2, 7, 0, 3]」只是把 a 往右移一格，沒有累加。',
    },
    {
      id: 'q-query', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`a = [4, 8, 15, 16, 23, 42]
P = [0]
for x in a:
    P.append(P[-1] + x)
print(P[4] - P[1])` },
      options: ['39', '54', '62', '43'],
      answer: 0, explanation: 'P = [0, 4, 12, 27, 43, 66, 108]。`P[4] − P[1]` 是「前 4 個的和」減「前 1 個的和」，剩下 a[1..3] = 8 + 15 + 16 = 39，也就是 `P[r + 1] − P[l]` 中 l = 1、r = 3。「54」是把 P[i] 誤當成含 a[i] 的前綴，得到 a[2..4]；「62」以為是 a[1..4]；「43」是只看 P[4]、忘了減掉前面的部分。',
    },
    {
      id: 'q-convert', prompt: '題目：「輸出第 l 個到第 r 個數的和（編號從 1 開始，含兩端）」。下面的 C++ 片段在 a = {10, 20, 30, 40}、l = 2、r = 3 時印出 30，正確答案是 20 + 30 = 50。應該怎麼改最後一行？',
      code: { language: 'C++', text: code`std::vector<long long> P(n + 1, 0);
for (int i = 0; i < n; ++i) P[i + 1] = P[i] + a[i];
std::cout << P[r] - P[l] << "\n";` },
      options: ['改成 `P[r] - P[l - 1]`', '改成 `P[r + 1] - P[l]`', '改成 `P[r + 1] - P[l - 1]`', '把 P 改成含 a[i] 的前綴（`P[i] = a[0] + … + a[i]`），式子不變'],
      answer: 0, explanation: 'P = [0, 10, 30, 60, 100]，`P[i]` 是前 i 個的和。1-based 的第 l～r 個是前 r 個去掉前 l − 1 個，所以是 `P[r] − P[l − 1] = 60 − 10 = 50`。`P[r] − P[l]` 少算了第 l 個（30 只剩第 3 個數）。`P[r + 1] − P[l]` 是 0-based 的公式，套在 1-based 的 l、r 上整段往右偏一格，得到 30 + 40 = 70，r = n 時還會越界；`P[r + 1] − P[l − 1]` 多算了一格，得到 90；改成含 a[i] 的前綴 Q = [10, 30, 60, 100] 時 `Q[3] − Q[2] = 40`，只剩第 4 個數，同樣錯。',
    },
    {
      id: 'q-overflow', prompt: '下面的 Java 片段印出什麼？',
      code: { language: 'Java', text: code`int[] a = {1000000000, 1000000000, 1000000000};
int[] P = new int[a.length + 1];
for (int i = 0; i < a.length; i++) P[i + 1] = P[i] + a[i];
System.out.println(P[3] - P[0]);` },
      options: ['3000000000', '-1294967296', '2147483647', '丟出 ArithmeticException'],
      answer: 1, explanation: '`P[2] = 2000000000` 還在 `int` 範圍內，但 `P[3]` = 3,000,000,000 超過上限 2,147,483,647。Java 的 `int` 溢位會繞回：3,000,000,000 − 2^32 = −1,294,967,296，不會停在最大值，也不會丟出例外（`ArithmeticException` 是整數除以 0 之類的情況）。3000000000 是數學上的答案，要把 P 宣告成 `long[]` 才會得到；在 C++ 用 `int` 則是未定義行為。Python 的整數沒有上限，同樣的程式會印出 3000000000。',
    },
    {
      id: 'q-2d', prompt: '表格 g = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]，S 是 4 × 4 的二維前綴和（`S[i][j]` 是前 i 列、前 j 行的和，第 0 列、第 0 行都是 0）。要算列 1..2、行 1..2（0-based、含兩端）的和，也就是 5 + 6 + 8 + 9，哪一個式子正確？',
      options: ['`S[3][3] − S[1][3] − S[3][1] + S[1][1]`，得 28', '`S[2][2] − S[1][2] − S[2][1] + S[1][1]`，得 5', '`S[3][3] − S[1][3] − S[3][1]`，得 27', '`S[3][3] − S[0][3] − S[3][0] + S[0][0]`，得 45'],
      answer: 0, explanation: 'S 的最後一列是 [0, 12, 27, 45]，`S[1] = [0, 1, 3, 6]`。公式 `S[r2 + 1][c2 + 1] − S[r1][c2 + 1] − S[r2 + 1][c1] + S[r1][c1]` 代入 r1 = c1 = 1、r2 = c2 = 2：45 − 6 − 12 + 1 = 28，和直接相加相同。第二個式子忘了 +1，只剩 g[1][1] = 5（和一維的 `P[r] − P[l]` 同一種錯）；第三個漏了加回左上角，那一格 g[0][0] = 1 被減了兩次；第四個把 r1 − 1 當成減掉的邊界，結果是整張表 45。',
    },
    {
      id: 'q-diff', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`n = 6
D = [0] * (n + 1)
for l, r, v in [(1, 3, 2), (2, 5, 3), (0, 0, -1)]:
    D[l] += v
    D[r + 1] -= v
a, run = [], 0
for i in range(n):
    run += D[i]
    a.append(run)
print(a)` },
      options: ['[-1, 2, 5, 5, 3, 3]', '[0, 2, 5, 3, 3, 0]', '[-1, 3, 3, 0, -2, 0]', '[-1, 2, 5, 5, 3, 0]'],
      answer: 0, explanation: '三次操作分別讓 a[1..3] 加 2、a[2..5] 加 3、a[0] 減 1：位置 0 是 −1，1 是 2，2、3 是 2 + 3 = 5，4、5 是 3。D = [−1, 3, 3, 0, −2, 0, −3]，對它做前綴和就得到這個結果。「[0, 2, 5, 3, 3, 0]」是把 `D[r + 1]` 寫成 `D[r]` 的結果（區間變成不含 r，(0, 0, −1) 整個抵消）；「[-1, 3, 3, 0, -2, 0]」是直接印出 D 而沒有做前綴和；最後一個選項以為 r = n − 1 = 5 的那次更新到不了最後一格，但 D 有 n + 1 格，`D[6]` 只是在陣列外面抵消，不影響 a[5]。',
    },
    {
      id: 'q-choose', prompt: '陣列有 n = 2×10^5 個整數，有正有負（例如 `[5, -3, 1]`），要數出「和恰好是 K 的連續子陣列」有幾個。哪一種做法正確而且夠快？',
      options: ['前綴和 + 雜湊表：由左往右掃，每一步加上「前面出現過幾次 P − K」', '滑動視窗：和小於 K 就擴右端，大於 K 就縮左端', '先建前綴和，再用兩層迴圈檢查每一對 (i, j) 的 `P[j + 1] − P[i]`', '先排序，再用雙指標找和為 K 的區間'],
      answer: 0, explanation: '前綴和 + 雜湊表平均 O(n)，而且不需要元素非負。滑動視窗依賴「擴右端和變大、縮左端和變小」，有負數時會漏：`[5, -3, 1]`、K = 3 時看到 5 > 3 就丟掉 5，錯過整段 5 − 3 + 1 = 3。兩層迴圈配前綴和雖然每對 O(1)，但有 n(n + 1)/2 ≈ 2×10^10 對，太慢。排序會打亂元素的位置，「連續子陣列」就沒有意義了。',
    },
  ],
  exercises: [
    {
      id: 'e-range-sum', title: '區間和查詢（1-based）',
      statement: '給 n 個整數 a_1, a_2, …, a_n（編號從 1 開始），以及 q 個查詢。每個查詢給兩個整數 l、r，請輸出第 l 個到第 r 個數的和 a_l + a_{l+1} + … + a_r（含兩端）。n、q 都可能到 2×10^5：每個查詢都用迴圈加一遍的 O(nq) 做法最多要 4×10^10 次加法，太慢，請用前綴和做到 O(n + q)。數的絕對值可能到 10^9，總和可能超過 2^31，C++／Java 要用 64 位元整數。不合法的輸入分兩種處理：（1）整份輸入的格式錯誤：n 不在 1～2×10^5、q 不在 1～2×10^5，或數字的個數和 n、q 對不上（太少或太多），只輸出一行 `Invalid`，其他什麼都不輸出；（2）格式正確，但某個查詢的 l、r 不合法（l < 1、r > n 或 l > r）：那一個查詢輸出一行 `Invalid`，其他查詢照常輸出，不會中斷。',
      inputFormat: '第一行一個整數 n。第二行 n 個整數 a_1～a_n。第三行一個整數 q。接下來 q 行，每行兩個整數 l r。數字之間以空白或換行分隔。',
      outputFormat: '格式正確時輸出 q 行，第 i 行是第 i 個查詢的區間和，或該查詢不合法時的 `Invalid`；整份輸入格式錯誤時只輸出一行 `Invalid`。',
      constraints: ['1 ≤ n ≤ 2×10^5，1 ≤ q ≤ 2×10^5（否則輸出一行 Invalid）', '每個 a_i 都是 −10^9～10^9 的整數（保證成立）', '合法的查詢滿足 1 ≤ l ≤ r ≤ n；其他查詢輸出 Invalid'],
      samples: [{ kind: 'normal', input: '6\n2 7 1 8 2 8\n4\n1 3\n2 5\n4 4\n1 6', output: '10\n18\n8\n28', note: '第 1～3 個是 2 + 7 + 1 = 10；4 4 只有第 4 個；1 6 是整個陣列' }],
      tests: [
        { kind: 'normal', input: '6\n2 7 1 8 2 8\n4\n1 3\n2 5\n4 4\n1 6', output: '10\n18\n8\n28', note: '範例' },
        { kind: 'normal', input: '8\n-5 3 -2 7 -1 0 4 -6\n5\n1 8\n2 4\n3 6\n5 7\n8 8', output: '0\n8\n4\n3\n-6', note: '有負數，區間和可能是 0 或負的' },
        { kind: 'normal', input: '5\n10 20 30 40 50\n6\n2 3\n1 1\n5 5\n1 5\n3 5\n2 3', output: '50\n10\n50\n150\n120\n50', note: '查詢沒有排序、有重複；2 3 寫成 P[r] − P[l] 會得到 30' },
        { kind: 'edge', input: '1\n-7\n2\n1 1\n1 1', output: '-7\n-7', note: 'n = 1，l = r = 1' },
        { kind: 'edge', input: '5\n4 -2 9 0 3\n4\n1 1\n5 5\n1 4\n2 5', output: '4\n3\n11\n10', note: '只查第一個、只查最後一個、從頭開始、到結尾為止' },
        { kind: 'edge', input: '3\n1000000000 1000000000 147483648\n3\n1 3\n1 2\n2 3', output: '2147483648\n2000000000\n1147483648', note: '總和剛好是 2^31，比 int 的上限多 1' },
        { kind: 'edge', input: '5\n1000000000 1000000000 1000000000 1000000000 1000000000\n2\n1 5\n2 4', output: '5000000000\n3000000000', note: '最大的值：區間和遠超過 int' },
        { kind: 'edge', input: '4\n-1000000000 -1000000000 -1000000000 -1000000000\n2\n1 4\n4 4', output: '-4000000000\n-1000000000', note: '最小的值：區間和低於 int 的下限' },
        { kind: 'edge', input: '6\n1000000000 -1000000000 1000000000 -1000000000 1000000000 -1000000000\n4\n1 6\n1 5\n2 5\n2 2', output: '0\n1000000000\n0\n-1000000000', note: '正負交錯：前綴和在 0 與 10^9 之間來回' },
        { kind: 'edge', input: bigInput, output: bigOutput, note: 'n = 2×10^5、q = 2×10^4，每個查詢長約 2×10^5：O(nq) 的做法要約 4×10^9 次加法，會超時' },
        { kind: 'edge', input: ovInput, output: ovOutput, note: 'n = 6×10^4 個接近 ±10^9 的數、q = 300，長區間的和約 3×10^13：用 int 存前綴和會溢位' },
        { kind: 'error', input: '3\n1 2 3\n5\n1 3\n3 1\n0 2\n2 4\n2 2', output: '6\nInvalid\nInvalid\nInvalid\n2', note: 'l > r、l = 0、r = n + 1 各輸出 Invalid，其他查詢照常回答' },
        { kind: 'error', input: '4\n5 6 7 8\n2\n-1 2\n1 4', output: 'Invalid\n26', note: 'l 是負數' },
        { kind: 'error', input: '0\n1\n1 1', output: 'Invalid', note: 'n = 0：整份輸入不合法' },
        { kind: 'error', input: '5\n1 2 3\n1\n1 2', output: 'Invalid', note: '值的個數少於 n' },
        { kind: 'error', input: '3\n1 2 3\n3\n1 2\n2 3', output: 'Invalid', note: '查詢的行數少於 q' },
        { kind: 'error', input: '3\n1 2 3\n1\n1 2 3', output: 'Invalid', note: '多出一個數字' },
        { kind: 'error', input: '2\n1 2\n0', output: 'Invalid', note: 'q = 0' },
        { kind: 'error', input: '', output: 'Invalid', note: '空的輸入' },
      ],
      hints: [
        '建 `P[0] = 0`、`P[i] = P[i − 1] + a_i`（P[i] 是前 i 個數的和），第 l～r 個的和就是 `P[r] − P[l − 1]`。',
        '先用 l = r、l = 1、r = n 的查詢手算檢查公式，最常見的錯是寫成 `P[r] − P[l]`。',
        'C++ 的 P 用 `long long`，Java 用 `long`：5 個 10^9 的和就超過 `int`。Python 不受影響；JavaScript 的 number 在 2^53 以內精確，也不受影響。',
        '先把所有數字讀進來，檢查個數是否剛好是 1 + n + 1 + 2q，才開始輸出；查詢不合法時只影響那一行。',
        '輸入輸出量大：C++ 加 `std::ios::sync_with_stdio(false)`，Python 用 `sys.stdin.buffer.read().split()`，Java 用 `BufferedReader` + `StringTokenizer`，JavaScript 用 `require("fs").readFileSync(0, "utf8")` 一次讀入；輸出都先串起來（Java 用 `StringBuilder`，JavaScript 收集到陣列再 `join`）再一次印出。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<long long> t;  // 先讀進所有數字，才能檢查個數是否相符
    long long v;
    while (std::cin >> v) t.push_back(v);
    const long long LIMIT = 200000;
    long long total = static_cast<long long>(t.size());
    long long n = total > 0 ? t[0] : 0;
    if (n < 1 || n > LIMIT || total < n + 2) {
        std::cout << "Invalid\n";
        return 0;
    }
    long long q = t[n + 1];
    if (q < 1 || q > LIMIT || total != n + 2 + 2 * q) {
        std::cout << "Invalid\n";
        return 0;
    }
    // P[i] = a_1 + ... + a_i（前 i 個的和），P[0] = 0；long long：總和可能到 2×10^14
    std::vector<long long> P(n + 1, 0);
    for (long long i = 1; i <= n; ++i) P[i] = P[i - 1] + t[i];
    std::string out;
    for (long long k = 0; k < q; ++k) {
        long long l = t[n + 2 + 2 * k], r = t[n + 3 + 2 * k];
        if (l < 1 || r > n || l > r) out += "Invalid\n";
        else out += std::to_string(P[r] - P[l - 1]) + '\n';  // 第 l～r 個 = 前 r 個 − 前 l−1 個
    }
    std::cout << out;
    return 0;
}`,
        Python: code`import sys
from itertools import accumulate

LIMIT = 200000


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]) if data else 0
    if not 1 <= n <= LIMIT or len(data) < n + 2:
        print("Invalid")
        return
    q = int(data[n + 1])
    if not 1 <= q <= LIMIT or len(data) != n + 2 + 2 * q:
        print("Invalid")
        return
    # P[i] = a_1 + ... + a_i（前 i 個的和），P[0] = 0；Python 的 int 不會溢位
    P = list(accumulate(map(int, data[1:n + 1]), initial=0))
    nums = list(map(int, data[n + 2:]))
    out = []
    for k in range(q):
        l, r = nums[2 * k], nums[2 * k + 1]
        if 1 <= l <= r <= n:
            out.append(str(P[r] - P[l - 1]))  # 第 l～r 個 = 前 r 個 − 前 l−1 個
        else:
            out.append("Invalid")
    sys.stdout.write("\n".join(out) + "\n")


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        long[] t = new long[16];  // 先讀進所有數字，才能檢查個數是否相符
        int total = 0;
        String line;
        while ((line = br.readLine()) != null) {
            StringTokenizer st = new StringTokenizer(line);
            while (st.hasMoreTokens()) {
                if (total == t.length) t = Arrays.copyOf(t, total * 2);
                t[total++] = Long.parseLong(st.nextToken());
            }
        }
        final long LIMIT = 200000;
        long n = total > 0 ? t[0] : 0;
        if (n < 1 || n > LIMIT || total < n + 2) {
            System.out.println("Invalid");
            return;
        }
        int m = (int) n;
        long q = t[m + 1];
        if (q < 1 || q > LIMIT || total != n + 2 + 2 * q) {
            System.out.println("Invalid");
            return;
        }
        // P[i] = a_1 + ... + a_i（前 i 個的和），P[0] = 0；long：總和可能到 2×10^14，超過 int
        long[] P = new long[m + 1];
        for (int i = 1; i <= m; i++) P[i] = P[i - 1] + t[i];
        StringBuilder out = new StringBuilder();
        for (int k = 0; k < q; k++) {
            long l = t[m + 2 + 2 * k], r = t[m + 3 + 2 * k];
            if (l < 1 || r > n || l > r) out.append("Invalid\n");
            else out.append(P[(int) r] - P[(int) l - 1]).append('\n');  // 第 l～r 個 = 前 r 個 − 前 l−1 個
        }
        System.out.print(out);
    }
}`,
        JavaScript: code`const LIMIT = 200000;

function solve(t) {  // 先讀進所有數字，才能檢查個數是否相符
    const total = t.length;
    const n = total > 0 ? t[0] : 0;
    if (n < 1 || n > LIMIT || total < n + 2) return "Invalid";
    const q = t[n + 1];
    if (q < 1 || q > LIMIT || total !== n + 2 + 2 * q) return "Invalid";
    // P[i] = a_1 + ... + a_i（前 i 個的和），P[0] = 0；總和最多 2×10^14 < 2^53，number 精確
    const P = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) P[i] = P[i - 1] + t[i];
    const out = [];
    for (let k = 0; k < q; k++) {
        const l = t[n + 2 + 2 * k], r = t[n + 3 + 2 * k];
        if (l < 1 || r > n || l > r) out.push("Invalid");
        else out.push(String(P[r] - P[l - 1]));  // 第 l～r 個 = 前 r 個 − 前 l−1 個
    }
    return out.join("\n");
}

const text = require("fs").readFileSync(0, "utf8").trim();
console.log(solve(text === "" ? [] : text.split(/\s+/).map(Number)));`,
      },
      judge: 'none',
    },
  ],
};

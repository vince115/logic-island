import type { LessonContent, Mark, TraceStep } from '../schema';
import { tableFillSteps } from '../simulate-algorithms';

const code = String.raw;

/**
 * The visualization: minimum path sum on a 3×4 grid (only right or down), filled row by row. tableFillSteps runs the
 * `cell` function below, which is exactly the trace code's transition: the start cell (line 7, key 'base'), the first
 * row from the left (line 9, 'row'), the first column from above (line 11, 'col') and the general cell, the smaller of
 * up and left (line 13, 'fill'); 'result' is the print on line 14. On this grid greedy (always step to the cheaper
 * neighbour) pays 12, the table finds 10.
 */
const VIZ_GRID = [[1, 3, 1, 2], [1, 5, 1, 4], [4, 2, 1, 3]];
const VIZ_R = VIZ_GRID.length;
const VIZ_C = VIZ_GRID[0].length;
const ROW_LABELS = Array.from({ length: VIZ_R }, (_, i) => `第 ${i} 列`);
const COL_LABELS = Array.from({ length: VIZ_C }, (_, j) => `第 ${j} 行`);
const order: [number, number][] = [];
for (let i = 0; i < VIZ_R; i++) for (let j = 0; j < VIZ_C; j++) order.push([i, j]);

const fillSteps = tableFillSteps({
  name: 'dp', rows: VIZ_R, cols: VIZ_C, rowLabels: ROW_LABELS, colLabels: COL_LABELS, order,
  cell: (i, j, get) => {
    const g = VIZ_GRID[i][j];
    if (i === 0 && j === 0) {
      return { value: g, reads: [], key: 'base', note: `初始值：dp[0][0] = grid[0][0] = ${g}。從起點走到起點，成本就是起點這一格。` };
    }
    if (i === 0) {
      const left = get(0, j - 1);
      return { value: left + g, reads: [[0, j - 1]], key: 'row',
        note: `第 0 列上面沒有格子，只能從左邊來：dp[0][${j}] = dp[0][${j - 1}] + grid[0][${j}] = ${left} + ${g} = ${left + g}。` };
    }
    if (j === 0) {
      const up = get(i - 1, 0);
      return { value: up + g, reads: [[i - 1, 0]], key: 'col',
        note: `第 0 行左邊沒有格子，只能從上面來：dp[${i}][0] = dp[${i - 1}][0] + grid[${i}][0] = ${up} + ${g} = ${up + g}。` };
    }
    const up = get(i - 1, j), left = get(i, j - 1), best = Math.min(up, left);
    const from = up < left ? '從上面來比較便宜' : up > left ? '從左邊來比較便宜' : '兩邊一樣便宜';
    return { value: best + g, reads: [[i - 1, j], [i, j - 1]], key: 'fill',
      note: `最後一步不是從上面就是從左邊來：上面 dp[${i - 1}][${j}] = ${up}，左邊 dp[${i}][${j - 1}] = ${left}，${from}。dp[${i}][${j}] = min(${up}, ${left}) + grid[${i}][${j}] = ${best} + ${g} = ${best + g}。兩格都已經填好，因為逐列由左到右填。` };
  },
  result: get => ({ cell: [VIZ_R - 1, VIZ_C - 1], output: String(get(VIZ_R - 1, VIZ_C - 1)),
    note: `12 格全部填完。答案在右下角：dp[${VIZ_R - 1}][${VIZ_C - 1}] = ${get(VIZ_R - 1, VIZ_C - 1)}，第 14 行把它印出來。` }),
}, { base: 7, row: 9, col: 11, fill: 13, result: 14 });

/** The final dp table, read back from the simulator's last step. */
const finalDp = (fillSteps.at(-1)!.arrays![0].cells as string[][]).map(r => r.map(Number));
/** Walk back from the answer cell: up when dp above ≤ dp on the left (ties go up), as in the grid-path example. */
const vizPath: [number, number][] = [];
for (let i = VIZ_R - 1, j = VIZ_C - 1; ;) {
  vizPath.unshift([i, j]);
  if (i === 0 && j === 0) break;
  if (i === 0) j--;
  else if (j === 0) i--;
  else if (finalDp[i - 1][j] <= finalDp[i][j - 1]) i--;
  else j--;
}
const pathText = vizPath.map(([i, j]) => `(${i},${j})`).join(' → ');
const pathCosts = vizPath.map(([i, j]) => VIZ_GRID[i][j]);

/** The cost grid shown above the dp table, with the cell being filled (or the path) marked. */
const gridPanel = (marks: { at: [number, number]; kind: Mark }[]) => ({
  name: 'grid（每格成本）', cells: VIZ_GRID.map(r => r.map(String)), marks, rowLabels: ROW_LABELS, colLabels: COL_LABELS,
});
const emptyDp = { name: 'dp', cells: VIZ_GRID.map(r => r.map(() => '')), rowLabels: ROW_LABELS, colLabels: COL_LABELS };

const traceSteps: TraceStep[] = [
  { line: 3, note: '建立 3 × 4 的 dp 表，dp[i][j] 代表「從左上角 (0, 0) 走到 (i, j) 的最小成本（含兩端的格子）」。空白格代表還沒填（程式裡先放 0）。接下來逐列、由左到右填，每一格只讀上面與左邊已經填好的格子。',
    vars: { R: String(VIZ_R), C: String(VIZ_C) }, arrays: [gridPanel([]), emptyDp] },
  ...fillSteps.map((step, k): TraceStep => {
    const isResult = k === fillSteps.length - 1;
    const [i, j] = isResult ? [VIZ_R - 1, VIZ_C - 1] : order[k];
    return { ...step, vars: { i: String(i), j: String(j), 'grid[i][j]': String(VIZ_GRID[i][j]) },
      arrays: [gridPanel([{ at: [i, j], kind: isResult ? 'found' : 'current' }]), ...step.arrays!] };
  }),
  { line: 14, output: String(finalDp[VIZ_R - 1][VIZ_C - 1]),
    note: `程式只印出最小成本；要知道走哪條路，從答案格往回走：每一格的值是從上面或左邊較小的那一格加上來的，就往那一格退（平手時選上面），退到 (0, 0) 為止。路線是 ${pathText}，成本 ${pathCosts.join(' + ')} = ${pathCosts.reduce((a, b) => a + b, 0)}。對照貪心（每步走向較便宜的鄰格）：1 → 1 → 4 → 2 → 1 → 3 = 12，第一步選了便宜的 1，後面卻被迫走貴的格子。`,
    vars: { 最小成本: String(finalDp[VIZ_R - 1][VIZ_C - 1]), 路線格數: String(vizPath.length) },
    arrays: [gridPanel(vizPath.map(p => ({ at: p, kind: 'found' as Mark }))),
      { name: 'dp', cells: finalDp.map(r => r.map(String)), marks: vizPath.map(p => ({ at: p, kind: 'found' as Mark })), rowLabels: ROW_LABELS, colLabels: COL_LABELS }] },
];

/**
 * Exercise worst cases, generated here. The test runner passes input through stdin, so the largest grid stays near
 * 1 MB: a tall 1000 × 90 grid of costs up to 10^9 (sums near 10^12, far beyond 2^31) and a wide 3 × 1000 grid of
 * single digits. Expected values come from a column-major full-table DP below, a different filling order from the
 * row-by-row rolling solutions; the small tests were checked against a brute force over all paths.
 */
const MASK64 = (1n << 64n) - 1n;
let lcg = 17_171_717n;
const nextRandom = () => (lcg = (lcg * 6364136223846793005n + 1442695040888963407n) & MASK64);
const makeGrid = (rows: number, cols: number, limit: bigint) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => Number((nextRandom() >> 16n) % (limit + 1n))));
const minPathColumnMajor = (g: number[][]) => {
  const R = g.length, C = g[0].length;
  const d = g.map(r => r.map(() => 0));
  for (let j = 0; j < C; j++) {
    for (let i = 0; i < R; i++) {
      const up = i > 0 ? d[i - 1][j] : Infinity, left = j > 0 ? d[i][j - 1] : Infinity;
      d[i][j] = g[i][j] + (i === 0 && j === 0 ? 0 : Math.min(up, left));
    }
  }
  return d[R - 1][C - 1];
};
const gridInput = (g: number[][]) => `${g.length} ${g[0].length}\n${g.map(r => r.join(' ')).join('\n')}`;
const tallGrid = makeGrid(1000, 90, 1_000_000_000n);
const wideGrid = makeGrid(3, 1000, 9n);

/**
 * A17 Dynamic Programming 入門. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); climb-stairs uses BigInt (n = 90 exceeds 2^53), the grid sums stay number.
 */
export const A17: LessonContent = {
  lessonId: 'A17',
  motivation: '很多問題問的是「有幾種方法」或「最好的選擇是多少」：爬 n 階樓梯有幾種走法、在方格裡從左上走到右下的最小成本、背包裝哪些東西價值最高（A18）。直接列舉所有可能通常是指數級：只能往右或往下的 R × C 方格，路線有 C(R + C − 2, R − 1) 條，3 × 4 是 10 條，20 × 20 已經有 35345263800 條，1000 × 1000 超過 10^599 條。貪心（greedy）每一步只看眼前最便宜的選擇，速度快，但在很多問題上會選錯（本課的方格上貪心付 12，最佳是 10）。動態規劃（dynamic programming，DP）的做法是：把問題的答案定義成由少數參數決定的「狀態」，寫出狀態之間的關係，再把每個狀態只算一次、存進表格。A11 的記憶化費氏數列其實就是 DP；這一課把它整理成可以重複使用的四個步驟：定義狀態、寫出轉移、設定初始值、決定填表順序，並比較由上而下的記憶化與由下而上的填表、分析時間與空間、用滾動陣列省記憶體、從表格倒推出最佳路線。DP 的限制也要清楚：狀態必須包含「之後的決策需要知道的一切」，而且狀態數乘上每個轉移的成本要在時間與記憶體之內；找不到這樣的狀態時，DP 就幫不上忙。',
  sections: [
    {
      id: 'when', title: '什麼時候用 DP：重複子問題與最佳子結構',
      blocks: [
        { type: 'p', text: 'A11 的費氏數列：直接遞迴時 fib(3)、fib(2) 被重複算了很多次，呼叫次數隨 n 指數成長；加上記憶表之後，每個 fib(k) 只算一次，時間變成 O(n)。關鍵在於 fib(k) 的答案只由 k 決定，不管是從哪裡呼叫到它的。DP 把這個觀察推廣：只要問題的答案能用少數參數描述（這組參數就叫狀態，state），而且大狀態的答案能由小狀態組出來，就可以每個狀態算一次、存起來。' },
        { type: 'list', items: [
          '重複子問題（overlapping subproblems）：不同的計算路線會用到同一個子問題。方格中走到 (1, 1) 的最小成本，往右走到 (1, 2) 與往下走到 (2, 1) 時都要用到它。子問題若從不重複（例如合併排序的左右兩半），存起來也不會變快。',
          '最佳子結構（optimal substructure）：最佳解的一部分，也是對應子問題的最佳解。走到 (i, j) 的最便宜路線，如果最後一步從上面 (i − 1, j) 來，那它到 (i − 1, j) 的那一段一定也是走到 (i − 1, j) 最便宜的路線，否則換成更便宜的那段，整條路線就更便宜了。計數問題則要求子問題的情況「不重複、不遺漏」，才能直接相加。',
        ] },
        { type: 'p', text: '和貪心比較：在下方視覺化的 3 × 4 方格上，貪心每一步走向右邊或下面較便宜的那一格，第一步選了成本 1 的下方，之後被迫走 4、2，總共 1 + 1 + 4 + 2 + 1 + 3 = 12；最佳路線是 1 + 3 + 1 + 1 + 1 + 3 = 10，第一步反而走貴的 3。貪心一旦做了選擇就不回頭，DP 則保留每個狀態的最佳值，在每一格比較所有可能的「上一步」。A16 會看到有些問題能證明貪心正確（例如活動選擇），那時貪心更快更簡單；沒有證明時，若狀態數放得進時間與記憶體，DP 是比較安全的選擇。' },
        { type: 'callout', tone: 'note', title: '狀態要記住「之後還需要知道的事」', text: '如果題目改成「不能連續往右走兩次」，只知道站在 (i, j) 已經不夠：下一步能不能往右，取決於上一步怎麼走。這時狀態要加一維，例如 `dp[i][j][d]`，d 表示最後一步是往右還是往下。判斷方法：問自己「從這個狀態往後走，需要知道過去的哪些資訊？」全部放進狀態，之後的計算就只依賴狀態本身，不必知道是怎麼走到這裡的（常稱為無後效性）。' },
      ],
    },
    {
      id: 'four-steps', title: 'DP 四步驟：狀態、轉移、初始值、填表順序',
      blocks: [
        { type: 'list', ordered: true, items: [
          '定義狀態：用一句完整的中文說出 `dp[i]`（或 `dp[i][j]`）代表什麼，包括從哪裡算起、算的是方法數還是最小成本。說不清楚的狀態，轉移一定寫不對。',
          '寫出轉移（transition）：`dp[i]` 的值從哪些較小的狀態來？最常用的思考方式是看「最後一步」：最後一步有哪幾種可能，每一種可能對應哪個較小的狀態。',
          '設定初始值（base case）：轉移用不了的最小狀態，直接給答案。用最小的幾個例子手算檢查。',
          '決定填表順序與答案位置：每個狀態被計算時，它讀的狀態都必須已經填好；最後說清楚答案在哪一格。',
        ] },
        { type: 'p', text: '爬樓梯（climbing stairs）：有 n 階樓梯，每次可以爬 1 階或 2 階，從地面（第 0 階）爬到第 n 階有幾種走法？狀態：`dp[i]` = 從地面爬到第 i 階的走法數。轉移：到達第 i 階的最後一步，不是從第 i − 1 階爬 1 階，就是從第 i − 2 階爬 2 階；這兩類走法不重複（最後一步不同）也不遺漏，所以 `dp[i] = dp[i − 1] + dp[i − 2]`。初始值：`dp[0] = 1`（還沒出發也算一種走法：什麼都不做），`dp[1] = 1`。順序：i 由小到大。答案：`dp[n]`。' },
        { type: 'table', head: ['i', '0', '1', '2', '3', '4', '5', '6'], rows: [
          ['dp[i]', '1', '1', '2', '3', '5', '8', '13'],
          ['fib(i)', '0', '1', '1', '2', '3', '5', '8'],
        ] },
        { type: 'p', text: '轉移和費氏數列一模一樣，只是起點錯開一格：`dp[i] = fib(i + 1)`。範例同時用填表與 A11 的記憶化遞迴計算，兩者答案相同。' },
        { type: 'example', id: 'climb-stairs' },
        { type: 'p', text: '每行是 n、填表的答案、記憶化的答案與兩者是否相同。走法數大約每多一階就乘上 1.618 倍：n = 45 是 1836311903，還在 C++／Java `int` 的上限 2147483647 之內；n = 46 是 2971215073，`int` 就溢位了。範例用 `long long`／`long`（上限約 9.22×10^18），能撐到 n = 91；n = 90 是 4660046610375530309。JavaScript 的 `number` 只能精確表示到 2^53（約 9×10^15），n = 90 已經超過，所以 JavaScript 範例改用 `BigInt`（`1n`、`dp[i - 1] + dp[i - 2]`），用 `String()` 輸出。' },
        { type: 'callout', tone: 'warning', title: '初始值錯了，整張表都錯', text: '常見的直覺是「0 階沒有走法，所以 `dp[0] = 0`」。這樣 `dp[2] = dp[1] + dp[0] = 1`，可是爬 2 階明明有「1 + 1」與「2」兩種，之後每一格都跟著錯，n = 4 會印出 3 而不是 5。`dp[0] = 1` 的意思是「已經站在目標上的走法有一種：什麼都不做」，`dp[2]` 裡「最後一步爬 2 階」的那一類正是由它算進來。檢查初始值的方法：用 n = 1、2、3 手動列出所有走法，和表格對照。' },
        { type: 'callout', tone: 'warning', title: '題目的「第 1 階」與陣列的索引', text: '題目常用 1 開始編號（第 1 階到第 n 階），陣列從 0 開始。本課讓索引 0 代表地面，所以陣列要開 n + 1 格，答案是 `dp[n]`。只開 n 格再讀 `dp[n]`，C++ 是未定義行為（可能默默讀到垃圾值），Java 丟出 `ArrayIndexOutOfBoundsException`，Python 丟出 `IndexError`，JavaScript 讀到 `undefined`、拿去相加變成 `NaN`，也不會報錯。寫程式前先決定「索引 i 對應題目的哪一階」，並寫在註解裡。' },
        { type: 'callout', tone: 'warning', title: '方法數會溢位', text: '計數型 DP 的答案常常指數成長。C++ 與 Java 的 `int` 在 n = 46 就溢位，`long long`／`long` 也只到 n = 91；有號整數溢位在 C++ 是未定義行為，Java 會默默繞回負數，JavaScript 的 `number` 超過 2^53 後則默默失去精確度（要用 `BigInt`）。題目若說「輸出答案除以 10^9 + 7 的餘數」，要在每次相加後立刻取餘數：`dp[i] = (dp[i - 1] + dp[i - 2]) % MOD`，等到最後才取餘數就太晚了，中間早已溢位。Python 的整數不會溢位，但數字越來越大會變慢，題目要求取餘數時一樣照做。' },
      ],
    },
    {
      id: 'grid', title: '二維 DP：方格最小成本路徑與倒推路線',
      blocks: [
        { type: 'p', text: '題目：R × C 的方格，每格有一個非負的成本 `grid[i][j]`，從左上角 (0, 0) 走到右下角 (R − 1, C − 1)，每一步只能往右或往下，路線經過的格子（含起點與終點）成本相加，求最小總成本。' },
        { type: 'list', items: [
          '狀態：`dp[i][j]` = 從 (0, 0) 走到 (i, j) 的最小成本，包含兩端的格子。',
          '轉移：走到 (i, j) 的最後一步，不是從上面 (i − 1, j) 就是從左邊 (i, j − 1) 來，所以 `dp[i][j] = min(dp[i − 1][j], dp[i][j − 1]) + grid[i][j]`。',
          '初始值：`dp[0][0] = grid[0][0]`。第 0 列上面沒有格子，只能從左邊來：`dp[0][j] = dp[0][j − 1] + grid[0][j]`；第 0 行同理只能從上面來：`dp[i][0] = dp[i − 1][0] + grid[i][0]`。',
          '順序：逐列、每列由左到右。輪到 (i, j) 時，上面那一列已經整列填好，左邊那一格剛剛填好。答案：`dp[R − 1][C − 1]`。',
        ] },
        { type: 'p', text: '下方的視覺化逐格填這張 3 × 4 的表：上面是成本方格，標出正在處理的格子；下面是 dp 表，標出這一步讀的格子與寫入的格子。第 0 列與第 0 行的格子只讀一格，其他格子讀上面與左邊兩格。填完的表如下，答案是右下角的 10：' },
        { type: 'table', head: ['dp', '第 0 行', '第 1 行', '第 2 行', '第 3 行'], rows: [
          ['第 0 列', '1', '4', '5', '7'],
          ['第 1 列', '2', '7', '6', '10'],
          ['第 2 列', '6', '8', '7', '10'],
        ] },
        { type: 'p', text: '表格只存了成本，但也記錄了「從哪裡來」：`dp[i][j]` 是由上面與左邊中較小的那一格加上 `grid[i][j]` 得到的。所以從答案格往回走，每次退到上面與左邊中 dp 較小的一格（第 0 列只能往左、第 0 行只能往上；平手時任選一邊都是最佳路線，範例固定選上面），退到 (0, 0) 後把經過的格子反轉，就是一條最佳路線。倒推只走 R + C − 1 格，但前提是整張表還在。' },
        { type: 'example', id: 'grid-path' },
        { type: 'p', text: '輸出先印出整張 dp 表，再印最小成本 10、倒推出的路線，以及路線上每一格的成本 1 + 3 + 1 + 1 + 1 + 3 = 10，用來確認路線真的達到最小成本。' },
        { type: 'callout', tone: 'warning', title: '讀到還沒填的格子，程式不會報錯', text: '若把外層迴圈寫成由下往上 `for i in range(R - 1, -1, -1)`，計算第 2 列時讀的 `dp[1][j]` 還是一開始放的 0，程式照樣執行，只是答案錯了：這個方格會印出 3。規則是「每一格讀的格子都必須已經填好」：對「上面與左邊」的轉移，逐列、逐行、沿著 i + j 相同的斜線填都可以，由下往上就不行。另一個陷阱是邊界：在 Python 中 i = 0 時 `dp[i - 1][j]` 是 `dp[-1][j]`，會默默讀到最後一列；C++ 讀到陣列外是未定義行為，Java 丟出例外，JavaScript 的 `dp[-1]` 是 `undefined`，接著讀 `dp[-1][j]` 會丟出 `TypeError`。所以第 0 列與第 0 行要分開處理，不能讓一般轉移去讀不存在的格子。' },
      ],
    },
    {
      id: 'memo-vs-tab', title: '由上而下的記憶化與由下而上的填表',
      blocks: [
        { type: 'p', text: '同一個狀態與轉移有兩種寫法。記憶化（memoization，由上而下 top-down）：把轉移直接寫成遞迴函式，函式開頭查表，有答案就回傳，沒有就照轉移算完存起來；先問最大的問題，遞迴自然會往下問到初始值。填表（tabulation，由下而上 bottom-up）：用迴圈從初始值開始，依你決定的順序把表一格一格填滿，完全不需要遞迴。' },
        { type: 'table', head: ['', '記憶化（top-down）', '填表（bottom-up）'], rows: [
          ['寫法', '遞迴函式 + 記憶表，最貼近轉移式', '迴圈 + 表格'],
          ['計算順序', '由遞迴自動決定，不必自己想', '要自己安排，保證讀的格子已經填好'],
          ['會算哪些狀態', '只算從問題出發遞迴得到的狀態', '通常把整張表都填滿'],
          ['時間', '狀態數 × 每個轉移的成本，再加上函式呼叫的額外開銷', '同樣的 O(狀態數 × 轉移成本)，常數通常較小'],
          ['遞迴深度', '可能和狀態鏈一樣長，爬 n 階樓梯就是 n 層', '沒有遞迴，沒有深度限制'],
          ['省空間', '記憶表通常要整張保留', '可以只留需要的列（滾動陣列）'],
        ] },
        { type: 'callout', tone: 'warning', title: 'Python 的記憶化撐不過 10^5 層', text: '爬 10^5 階樓梯時，記憶化版第一次呼叫 `ways(100000)` 會一路呼叫 `ways(99999)`、`ways(99998)`……直到 `ways(1)`，深度約 10^5 層，遠超過 Python 預設約 1,000 層的上限，丟出 `RecursionError`；改用 `functools.cache` 也一樣，它只是自動幫你記憶，遞迴還是遞迴。A11 說過，調高 `sys.setrecursionlimit` 只放寬檢查，不保證安全。C++、Java 與 JavaScript 深度太大時同樣會堆疊溢位（Node.js 丟出 `RangeError: Maximum call stack size exceeded`）。同一題的填表版只是一個 10^5 次的迴圈，沒有這個問題。' },
        { type: 'list', items: [
          '適合記憶化：狀態很多但真正用到的只有一小部分；填表順序不容易想清楚；遞迴深度不大。先寫記憶化確認轉移正確，再改寫成填表，也是常見的做法。',
          '適合填表：狀態幾乎都會用到；深度可能很大（線性的鏈、很長的序列）；想用滾動陣列省空間。',
          '兩種寫法的狀態、轉移、初始值完全相同，答案也一定相同；差別只在計算的順序與實作的成本。',
        ] },
      ],
    },
    {
      id: 'cost', title: '時間、空間與滾動陣列',
      blocks: [
        { type: 'p', text: 'DP 的時間複雜度 = 狀態數 × 每個轉移的成本。爬樓梯有 n + 1 個狀態，每個轉移 O(1)，共 O(n)；方格有 R × C 個狀態，每個轉移比較兩個數，共 O(RC)；若每次可以爬 1～k 階，每個狀態要加總 k 個前面的狀態，就是 O(nk)。空間是表格的大小：O(n) 或 O(RC)。估計時先寫出狀態有幾維、每一維的範圍，相乘就是表格大小。' },
        { type: 'p', text: '滾動陣列（rolling array）：方格的第 i 列只讀第 i − 1 列（上面）與第 i 列自己（左邊），更早的列再也用不到，所以只要一個長度 C 的一維陣列 `row`。由左到右更新 `row[j]` 時，更新前的 `row[j]` 還是上一列的值（上面），`row[j - 1]` 剛被更新成這一列的值（左邊），所以 `row[j] = min(row[j], row[j - 1]) + grid[i][j]`。空間從 O(RC) 降到 O(C)，時間不變。爬樓梯更省：只要記住前兩個數。' },
        { type: 'example', id: 'rolling-row' },
        { type: 'p', text: '兩個方格都用完整表格與滾動陣列各算一次，答案相同；最後一欄是兩種做法保存的格數：200 × 300 的方格，完整表格 60000 格，滾動陣列只要 300 格。代價是表格不見了，沒辦法再倒推路線；需要路線時，保留完整表格，或另外用一張小的表記錄每一格是從上面還是左邊來的。' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java', 'JavaScript'], rows: [
          ['二維表格', '`std::vector<std::vector<long long>> dp(R, std::vector<long long>(C, 0))`', '`dp = [[0] * C for _ in range(R)]`', '`long[][] dp = new long[R][C]`，自動初始化為 0', '`Array.from({ length: R }, () => new Array(C).fill(0))`'],
          ['1000 × 1000 的表格', '64 位元整數約 8 MB', '每格是指向整數物件的參照，通常比 C++／Java 多好幾倍', '約 8 MB', '數字陣列每格通常 8 位元組，約 8 MB，另加每列陣列物件的開銷'],
          ['成本或方法數很大', '用 `long long`；`int` 只到約 2.1×10^9', '`int` 沒有上限', '用 `long`；`int` 只到約 2.1×10^9', '`number` 在 2^53（約 9×10^15）以內是精確整數，更大要用 `BigInt`'],
          ['記憶化的深度', '受堆疊大小限制，太深直接當掉', '預設約 1,000 層', '受堆疊大小限制，`StackOverflowError`', '受堆疊大小限制，Node.js 預設大約一萬層，`RangeError`'],
        ] },
        { type: 'callout', tone: 'warning', title: '`[[0] * C] * R` 讓每一列都是同一個 list', text: 'Python 中 `[[0] * C] * R` 只建立了一列，再把同一列的參照放 R 次：改 `dp[0][0]` 時，每一列的第 0 格都跟著變，DP 表會亂掉卻不報錯。二維表格一定要寫成 `[[0] * C for _ in range(R)]`，每一列各自建立。JavaScript 的 `new Array(R).fill(new Array(C).fill(0))` 是同一個陷阱（`fill` 放進去的是同一個陣列），要寫成 `Array.from({ length: R }, () => new Array(C).fill(0))`。' },
        { type: 'p', text: '寫完 DP 後的檢查清單：' },
        { type: 'list', items: [
          '狀態能用一句話說清楚嗎？轉移是否涵蓋所有「最後一步」，而且不重複？',
          '初始值用最小的幾個例子手算過嗎（例如 `dp[0] = 1`）？',
          '照填表順序，每一格讀的格子都已經填好了嗎？會不會讀到邊界外？',
          '答案在哪一格？題目的 1 開始編號和陣列索引對齊了嗎？',
          '最大的答案會不會超過 `int`？題目是否要求取餘數？',
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'climb-stairs', title: '爬樓梯：填表與記憶化遞迴', description: '每次爬 1 或 2 階，`dp[i] = dp[i − 1] + dp[i − 2]`，`dp[0] = dp[1] = 1`。對 n = 1、2、3、5、10、45、90 分別用填表與記憶化計算，印出 n、兩個答案與是否相同；n = 90 的答案超過 `int`，要用 64 位元整數。',
      output: '1 1 1 same\n2 2 2 same\n3 3 3 same\n5 8 8 same\n10 89 89 same\n45 1836311903 1836311903 same\n90 4660046610375530309 4660046610375530309 same',
      code: {
        'C++': code`#include <iostream>
#include <vector>

// dp[i] = 從地面爬到第 i 階的走法數
long long waysTable(int n) {
    std::vector<long long> dp(n + 1, 0);
    dp[0] = 1;                            // 0 階：什麼都不做，1 種
    for (int i = 1; i <= n; i++) {
        dp[i] = dp[i - 1];                // 最後一步爬 1 階
        if (i >= 2) dp[i] += dp[i - 2];   // 最後一步爬 2 階
    }
    return dp[n];
}

std::vector<long long> memo(100, -1);     // -1 代表還沒算

long long waysMemo(int n) {
    if (n <= 1) return 1;                 // 0 階、1 階都只有 1 種
    if (memo[n] == -1) memo[n] = waysMemo(n - 1) + waysMemo(n - 2);
    return memo[n];
}

int main() {
    for (int n : {1, 2, 3, 5, 10, 45, 90}) {
        long long a = waysTable(n), b = waysMemo(n);
        std::cout << n << " " << a << " " << b << " " << (a == b ? "same" : "different") << "\n";
    }
    return 0;
}`,
        Python: code`def ways_table(n):
    """dp[i] = 從地面爬到第 i 階的走法數。"""
    dp = [0] * (n + 1)
    dp[0] = 1                      # 0 階：什麼都不做，1 種
    for i in range(1, n + 1):
        dp[i] = dp[i - 1]          # 最後一步爬 1 階
        if i >= 2:
            dp[i] += dp[i - 2]     # 最後一步爬 2 階
    return dp[n]


memo = {}


def ways_memo(n):
    if n <= 1:                     # 0 階、1 階都只有 1 種
        return 1
    if n not in memo:
        memo[n] = ways_memo(n - 1) + ways_memo(n - 2)
    return memo[n]


for n in [1, 2, 3, 5, 10, 45, 90]:
    a, b = ways_table(n), ways_memo(n)
    print(n, a, b, "same" if a == b else "different")`,
        Java: code`import java.util.Arrays;

public class Main {
    // dp[i] = 從地面爬到第 i 階的走法數
    static long waysTable(int n) {
        long[] dp = new long[n + 1];
        dp[0] = 1;                            // 0 階：什麼都不做，1 種
        for (int i = 1; i <= n; i++) {
            dp[i] = dp[i - 1];                // 最後一步爬 1 階
            if (i >= 2) dp[i] += dp[i - 2];   // 最後一步爬 2 階
        }
        return dp[n];
    }

    static long[] memo = new long[100];       // -1 代表還沒算

    static long waysMemo(int n) {
        if (n <= 1) return 1;                 // 0 階、1 階都只有 1 種
        if (memo[n] == -1) memo[n] = waysMemo(n - 1) + waysMemo(n - 2);
        return memo[n];
    }

    public static void main(String[] args) {
        Arrays.fill(memo, -1);
        for (int n : new int[] {1, 2, 3, 5, 10, 45, 90}) {
            long a = waysTable(n), b = waysMemo(n);
            System.out.println(n + " " + a + " " + b + " " + (a == b ? "same" : "different"));
        }
    }
}`,
        JavaScript: code`// n = 90 的答案約 4.66 × 10^18，超過 number 能精確表示的 2^53，所以用 BigInt（數字後面加 n）。
// dp[i] = 從地面爬到第 i 階的走法數
function waysTable(n) {
    const dp = new Array(n + 1).fill(0n);
    dp[0] = 1n;                            // 0 階：什麼都不做，1 種
    for (let i = 1; i <= n; i++) {
        dp[i] = dp[i - 1];                 // 最後一步爬 1 階
        if (i >= 2) dp[i] += dp[i - 2];    // 最後一步爬 2 階
    }
    return dp[n];
}

const memo = new Map();

function waysMemo(n) {
    if (n <= 1) return 1n;                 // 0 階、1 階都只有 1 種
    if (!memo.has(n)) memo.set(n, waysMemo(n - 1) + waysMemo(n - 2));
    return memo.get(n);
}

for (const n of [1, 2, 3, 5, 10, 45, 90]) {
    const a = waysTable(n), b = waysMemo(n);
    console.log(n + " " + String(a) + " " + String(b) + " " + (a === b ? "same" : "different"));
}`,
      },
    },
    {
      id: 'grid-path', title: '方格最小成本：填表並倒推路線', description: '3 × 4 的成本方格，只能往右或往下。逐列填 `dp[i][j]`，印出整張表與最小成本，再從右下角倒推（平手時選上面），印出路線與路線上每一格的成本。',
      output: '1 4 5 7\n2 7 6 10\n6 8 7 10\nmin 10\npath (0,0) -> (0,1) -> (0,2) -> (1,2) -> (2,2) -> (2,3)\ncells 1 + 3 + 1 + 1 + 1 + 3',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <utility>
#include <vector>

int main() {
    std::vector<std::vector<long long>> grid = {{1, 3, 1, 2}, {1, 5, 1, 4}, {4, 2, 1, 3}};
    int R = static_cast<int>(grid.size()), C = static_cast<int>(grid[0].size());

    // dp[i][j] = 從 (0, 0) 走到 (i, j) 的最小成本（包含兩端的格子）
    std::vector<std::vector<long long>> dp(R, std::vector<long long>(C, 0));
    for (int i = 0; i < R; i++) {
        for (int j = 0; j < C; j++) {
            if (i == 0 && j == 0) dp[i][j] = grid[0][0];
            else if (i == 0) dp[i][j] = dp[i][j - 1] + grid[i][j];   // 第一列只能從左邊來
            else if (j == 0) dp[i][j] = dp[i - 1][j] + grid[i][j];   // 第一行只能從上面來
            else dp[i][j] = std::min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j];
        }
    }
    for (const auto& row : dp) {
        for (int j = 0; j < C; j++) std::cout << (j ? " " : "") << row[j];
        std::cout << "\n";
    }
    std::cout << "min " << dp[R - 1][C - 1] << "\n";

    // 從終點倒推：每一格是從「上面」或「左邊」較小的那一格來的
    std::vector<std::pair<int, int>> path;
    int i = R - 1, j = C - 1;
    while (true) {
        path.push_back({i, j});
        if (i == 0 && j == 0) break;
        if (i == 0) j--;
        else if (j == 0) i--;
        else if (dp[i - 1][j] <= dp[i][j - 1]) i--;   // 平手時選上面
        else j--;
    }
    std::reverse(path.begin(), path.end());
    std::cout << "path";
    for (std::size_t k = 0; k < path.size(); k++) {
        std::cout << (k ? " -> " : " ") << "(" << path[k].first << "," << path[k].second << ")";
    }
    std::cout << "\ncells";
    for (std::size_t k = 0; k < path.size(); k++) {
        std::cout << (k ? " + " : " ") << grid[path[k].first][path[k].second];
    }
    std::cout << "\n";
    return 0;
}`,
        Python: code`grid = [[1, 3, 1, 2],
        [1, 5, 1, 4],
        [4, 2, 1, 3]]
R, C = len(grid), len(grid[0])

# dp[i][j] = 從 (0, 0) 走到 (i, j) 的最小成本（包含兩端的格子）
dp = [[0] * C for _ in range(R)]
for i in range(R):
    for j in range(C):
        if i == 0 and j == 0:
            dp[i][j] = grid[0][0]
        elif i == 0:
            dp[i][j] = dp[i][j - 1] + grid[i][j]      # 第一列只能從左邊來
        elif j == 0:
            dp[i][j] = dp[i - 1][j] + grid[i][j]      # 第一行只能從上面來
        else:
            dp[i][j] = min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j]

for row in dp:
    print(" ".join(str(v) for v in row))
print("min", dp[R - 1][C - 1])

# 從終點倒推：每一格是從「上面」或「左邊」較小的那一格來的
path = []
i, j = R - 1, C - 1
while True:
    path.append((i, j))
    if i == 0 and j == 0:
        break
    if i == 0:
        j -= 1
    elif j == 0:
        i -= 1
    elif dp[i - 1][j] <= dp[i][j - 1]:    # 平手時選上面
        i -= 1
    else:
        j -= 1
path.reverse()
print("path", " -> ".join(f"({r},{c})" for r, c in path))
print("cells", " + ".join(str(grid[r][c]) for r, c in path))`,
        Java: code`import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        long[][] grid = {{1, 3, 1, 2}, {1, 5, 1, 4}, {4, 2, 1, 3}};
        int R = grid.length, C = grid[0].length;

        // dp[i][j] = 從 (0, 0) 走到 (i, j) 的最小成本（包含兩端的格子）
        long[][] dp = new long[R][C];
        for (int i = 0; i < R; i++) {
            for (int j = 0; j < C; j++) {
                if (i == 0 && j == 0) dp[i][j] = grid[0][0];
                else if (i == 0) dp[i][j] = dp[i][j - 1] + grid[i][j];   // 第一列只能從左邊來
                else if (j == 0) dp[i][j] = dp[i - 1][j] + grid[i][j];   // 第一行只能從上面來
                else dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j];
            }
        }
        StringBuilder out = new StringBuilder();
        for (long[] row : dp) {
            for (int j = 0; j < C; j++) out.append(j > 0 ? " " : "").append(row[j]);
            out.append("\n");
        }
        out.append("min ").append(dp[R - 1][C - 1]).append("\n");

        // 從終點倒推：每一格是從「上面」或「左邊」較小的那一格來的
        List<int[]> path = new ArrayList<>();
        int i = R - 1, j = C - 1;
        while (true) {
            path.add(new int[] {i, j});
            if (i == 0 && j == 0) break;
            if (i == 0) j--;
            else if (j == 0) i--;
            else if (dp[i - 1][j] <= dp[i][j - 1]) i--;   // 平手時選上面
            else j--;
        }
        Collections.reverse(path);
        out.append("path");
        for (int k = 0; k < path.size(); k++) {
            out.append(k > 0 ? " -> " : " ").append("(").append(path.get(k)[0]).append(",").append(path.get(k)[1]).append(")");
        }
        out.append("\ncells");
        for (int k = 0; k < path.size(); k++) {
            out.append(k > 0 ? " + " : " ").append(grid[path.get(k)[0]][path.get(k)[1]]);
        }
        System.out.println(out);
    }
}`,
        JavaScript: code`const grid = [[1, 3, 1, 2], [1, 5, 1, 4], [4, 2, 1, 3]];
const R = grid.length, C = grid[0].length;

// dp[i][j] = 從 (0, 0) 走到 (i, j) 的最小成本（包含兩端的格子）
const dp = Array.from({ length: R }, () => new Array(C).fill(0));
for (let i = 0; i < R; i++) {
    for (let j = 0; j < C; j++) {
        if (i === 0 && j === 0) dp[i][j] = grid[0][0];
        else if (i === 0) dp[i][j] = dp[i][j - 1] + grid[i][j];   // 第一列只能從左邊來
        else if (j === 0) dp[i][j] = dp[i - 1][j] + grid[i][j];   // 第一行只能從上面來
        else dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j];
    }
}
for (const row of dp) console.log(row.join(" "));
console.log("min " + dp[R - 1][C - 1]);

// 從終點倒推：每一格是從「上面」或「左邊」較小的那一格來的
const path = [];
let i = R - 1, j = C - 1;
while (true) {
    path.push([i, j]);
    if (i === 0 && j === 0) break;
    if (i === 0) j--;
    else if (j === 0) i--;
    else if (dp[i - 1][j] <= dp[i][j - 1]) i--;   // 平手時選上面
    else j--;
}
path.reverse();
console.log("path " + path.map(([r, c]) => "(" + r + "," + c + ")").join(" -> "));
console.log("cells " + path.map(([r, c]) => grid[r][c]).join(" + "));`,
      },
    },
    {
      id: 'rolling-row', title: '滾動陣列：只留一列，答案相同', description: '同一個轉移，一次用完整的 R × C 表格，一次只用一個長度 C 的陣列 `row`（更新前的 `row[j]` 是上面，`row[j − 1]` 是左邊）。兩個方格：視覺化的 3 × 4 方格，以及成本為 `(37i + 91j) % 100` 的 200 × 300 方格；每行印出大小、兩種做法的答案與保存的格數。',
      output: '3x4 full=10 rolling=10 cells=12/4\n200x300 full=12799 rolling=12799 cells=60000/300',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

using Grid = std::vector<std::vector<long long>>;

long long fullTable(const Grid& grid) {
    int R = static_cast<int>(grid.size()), C = static_cast<int>(grid[0].size());
    Grid dp(R, std::vector<long long>(C, 0));
    for (int i = 0; i < R; i++) {
        for (int j = 0; j < C; j++) {
            if (i == 0 && j == 0) dp[i][j] = grid[0][0];
            else if (i == 0) dp[i][j] = dp[i][j - 1] + grid[i][j];
            else if (j == 0) dp[i][j] = dp[i - 1][j] + grid[i][j];
            else dp[i][j] = std::min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j];
        }
    }
    return dp[R - 1][C - 1];
}

long long rolling(const Grid& grid) {
    int R = static_cast<int>(grid.size()), C = static_cast<int>(grid[0].size());
    std::vector<long long> row(C, 0);     // row[j]：目前這一列的 dp[i][j]
    for (int i = 0; i < R; i++) {
        for (int j = 0; j < C; j++) {
            if (i == 0 && j == 0) row[j] = grid[0][0];
            else if (i == 0) row[j] = row[j - 1] + grid[i][j];
            else if (j == 0) row[j] = row[j] + grid[i][j];          // row[0] 還是上一列的值
            else row[j] = std::min(row[j], row[j - 1]) + grid[i][j];  // row[j] 是上面，row[j - 1] 是左邊
        }
    }
    return row[C - 1];
}

int main() {
    Grid small = {{1, 3, 1, 2}, {1, 5, 1, 4}, {4, 2, 1, 3}};
    Grid big(200, std::vector<long long>(300));
    for (int i = 0; i < 200; i++)
        for (int j = 0; j < 300; j++) big[i][j] = (i * 37 + j * 91) % 100;
    for (const Grid* g : {&small, &big}) {
        long long R = static_cast<long long>(g->size()), C = static_cast<long long>((*g)[0].size());
        std::cout << R << "x" << C << " full=" << fullTable(*g) << " rolling=" << rolling(*g)
                  << " cells=" << R * C << "/" << C << "\n";
    }
    return 0;
}`,
        Python: code`def full_table(grid):
    R, C = len(grid), len(grid[0])
    dp = [[0] * C for _ in range(R)]
    for i in range(R):
        for j in range(C):
            if i == 0 and j == 0:
                dp[i][j] = grid[0][0]
            elif i == 0:
                dp[i][j] = dp[i][j - 1] + grid[i][j]
            elif j == 0:
                dp[i][j] = dp[i - 1][j] + grid[i][j]
            else:
                dp[i][j] = min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j]
    return dp[R - 1][C - 1]


def rolling(grid):
    C = len(grid[0])
    row = [0] * C                  # row[j]：目前這一列的 dp[i][j]
    for i, costs in enumerate(grid):
        for j in range(C):
            if i == 0 and j == 0:
                row[j] = costs[0]
            elif i == 0:
                row[j] = row[j - 1] + costs[j]
            elif j == 0:
                row[j] = row[j] + costs[j]          # row[0] 還是上一列的值
            else:
                row[j] = min(row[j], row[j - 1]) + costs[j]   # row[j] 是上面，row[j - 1] 是左邊
    return row[C - 1]


small = [[1, 3, 1, 2], [1, 5, 1, 4], [4, 2, 1, 3]]
big = [[(i * 37 + j * 91) % 100 for j in range(300)] for i in range(200)]
for grid in (small, big):
    R, C = len(grid), len(grid[0])
    print(f"{R}x{C} full={full_table(grid)} rolling={rolling(grid)} cells={R * C}/{C}")`,
        Java: code`public class Main {
    static long fullTable(long[][] grid) {
        int R = grid.length, C = grid[0].length;
        long[][] dp = new long[R][C];
        for (int i = 0; i < R; i++) {
            for (int j = 0; j < C; j++) {
                if (i == 0 && j == 0) dp[i][j] = grid[0][0];
                else if (i == 0) dp[i][j] = dp[i][j - 1] + grid[i][j];
                else if (j == 0) dp[i][j] = dp[i - 1][j] + grid[i][j];
                else dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j];
            }
        }
        return dp[R - 1][C - 1];
    }

    static long rolling(long[][] grid) {
        int R = grid.length, C = grid[0].length;
        long[] row = new long[C];             // row[j]：目前這一列的 dp[i][j]
        for (int i = 0; i < R; i++) {
            for (int j = 0; j < C; j++) {
                if (i == 0 && j == 0) row[j] = grid[0][0];
                else if (i == 0) row[j] = row[j - 1] + grid[i][j];
                else if (j == 0) row[j] = row[j] + grid[i][j];          // row[0] 還是上一列的值
                else row[j] = Math.min(row[j], row[j - 1]) + grid[i][j];  // row[j] 是上面，row[j - 1] 是左邊
            }
        }
        return row[C - 1];
    }

    public static void main(String[] args) {
        long[][] small = {{1, 3, 1, 2}, {1, 5, 1, 4}, {4, 2, 1, 3}};
        long[][] big = new long[200][300];
        for (int i = 0; i < 200; i++)
            for (int j = 0; j < 300; j++) big[i][j] = (i * 37 + j * 91) % 100;
        for (long[][] g : new long[][][] {small, big}) {
            long R = g.length, C = g[0].length;
            System.out.println(R + "x" + C + " full=" + fullTable(g) + " rolling=" + rolling(g) + " cells=" + R * C + "/" + C);
        }
    }
}`,
        JavaScript: code`function fullTable(grid) {
    const R = grid.length, C = grid[0].length;
    const dp = Array.from({ length: R }, () => new Array(C).fill(0));
    for (let i = 0; i < R; i++) {
        for (let j = 0; j < C; j++) {
            if (i === 0 && j === 0) dp[i][j] = grid[0][0];
            else if (i === 0) dp[i][j] = dp[i][j - 1] + grid[i][j];
            else if (j === 0) dp[i][j] = dp[i - 1][j] + grid[i][j];
            else dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j];
        }
    }
    return dp[R - 1][C - 1];
}

function rolling(grid) {
    const R = grid.length, C = grid[0].length;
    const row = new Array(C).fill(0);      // row[j]：目前這一列的 dp[i][j]
    for (let i = 0; i < R; i++) {
        for (let j = 0; j < C; j++) {
            if (i === 0 && j === 0) row[j] = grid[0][0];
            else if (i === 0) row[j] = row[j - 1] + grid[i][j];
            else if (j === 0) row[j] = row[j] + grid[i][j];              // row[0] 還是上一列的值
            else row[j] = Math.min(row[j], row[j - 1]) + grid[i][j];     // row[j] 是上面，row[j - 1] 是左邊
        }
    }
    return row[C - 1];
}

const small = [[1, 3, 1, 2], [1, 5, 1, 4], [4, 2, 1, 3]];
const big = Array.from({ length: 200 }, (_, i) => Array.from({ length: 300 }, (_, j) => (i * 37 + j * 91) % 100));
for (const g of [small, big]) {
    const R = g.length, C = g[0].length;
    console.log(R + "x" + C + " full=" + fullTable(g) + " rolling=" + rolling(g) + " cells=" + R * C + "/" + C);
}`,
      },
    },
  ],
  visualization: {
    kind: 'dp-table', title: '方格最小成本：逐列填 dp 表', language: 'Python',
    code: code`grid = [[1, 3, 1, 2], [1, 5, 1, 4], [4, 2, 1, 3]]
R, C = len(grid), len(grid[0])
dp = [[0] * C for _ in range(R)]
for i in range(R):
    for j in range(C):
        if i == 0 and j == 0:
            dp[i][j] = grid[0][0]
        elif i == 0:
            dp[i][j] = dp[i][j - 1] + grid[i][j]
        elif j == 0:
            dp[i][j] = dp[i - 1][j] + grid[i][j]
        else:
            dp[i][j] = min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j]
print(dp[R - 1][C - 1])`,
    steps: traceSteps,
  },
  quiz: [
    {
      id: 'q-stairs-three', prompt: '樓梯每次可以爬 1、2 或 3 階。下面的程式印出什麼？',
      code: { language: 'Python', text: 'n = 5\ndp = [0] * (n + 1)\ndp[0] = 1\nfor i in range(1, n + 1):\n    for s in (1, 2, 3):\n        if i - s >= 0:\n            dp[i] += dp[i - s]\nprint(dp[n])' },
      options: ['8', '13', '7', '16'],
      answer: 1,
      explanation: '最後一步可以是 1、2 或 3 階，所以 `dp[i] = dp[i − 1] + dp[i − 2] + dp[i − 3]`（不存在的項不加）。由小到大填：dp = 1, 1, 2, 4, 7, 13，dp[5] = 13（已執行程式確認）。8 是只能爬 1 或 2 階時的答案；7 是 dp[4]，差了一格；16 = 2^4 是「每次可以爬任意階數」的走法數。',
    },
    {
      id: 'q-state-suffix', prompt: '方格最小成本（只能往右或往下）改用另一個狀態：`dp[i][j]` = 從 (i, j) 走到右下角 (R − 1, C − 1) 的最小成本（含兩端）。最後一列與最後一行另外處理邊界。哪一組轉移、填表順序與答案位置是正確的？',
      options: [
        '`dp[i][j] = min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j]`，i、j 由小到大填，答案是 `dp[R - 1][C - 1]`',
        '`dp[i][j] = min(dp[i + 1][j], dp[i][j + 1]) + grid[i][j]`，i、j 由大到小填，答案是 `dp[0][0]`',
        '`dp[i][j] = min(dp[i + 1][j], dp[i][j + 1]) + grid[i][j]`，i、j 由小到大填，答案是 `dp[0][0]`',
        '`dp[i][j] = min(dp[i + 1][j], dp[i][j + 1]) + grid[i][j]`，i、j 由大到小填，答案是 `dp[R - 1][C - 1]`',
      ],
      answer: 1,
      explanation: '從 (i, j) 出發，第一步走到下面 (i + 1, j) 或右邊 (i, j + 1)，之後的最小成本就是那兩個狀態，所以讀的是 i + 1 與 j + 1；這兩格要先填好，只能由大到小填；「從 (0, 0) 出發」的答案是 `dp[0][0]`，而 `dp[R − 1][C − 1]` 只是終點自己的成本（初始值）。第一個選項是本課原本的狀態定義，不是題目給的定義。第三個選項由小到大填時會讀到還沒填的格子。已用程式在 300 個隨機方格上和窮舉所有路線比對，第二個選項全部正確。',
    },
    {
      id: 'q-order', prompt: '方格最小成本的轉移是 `dp[i][j] = min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j]`（第 0 列與第 0 行另外處理，表格一開始全是 0）。下面哪一種填表順序會算出錯誤的答案？',
      options: [
        '外層 i 由 0 到 R − 1、內層 j 由 0 到 C − 1（逐列）',
        '外層 j 由 0 到 C − 1、內層 i 由 0 到 R − 1（逐行）',
        '依 d = i + j 由 0 到 R + C − 2，一條斜線一條斜線填',
        '外層 i 由 R − 1 到 0、內層 j 由 0 到 C − 1',
      ],
      answer: 3,
      explanation: '每一格只讀上面與左邊。逐列時上面那列整列填過、左邊剛填過；逐行時左邊那行整行填過、上面剛填過；沿斜線填時，上面與左邊都在 i + j 小 1 的前一條斜線上。由下往上填時，第 i 列讀的第 i − 1 列還是初始的 0，程式不會報錯，答案卻是錯的（本課 3 × 4 方格會印出 3 而不是 10）。已用程式在 300 個隨機小方格上和窮舉比對：前三種全部正確，第四種在大多數方格上算錯。',
    },
    {
      id: 'q-complexity', prompt: '樓梯有 n 階，每次可以爬 1～k 階，求走法數除以 MOD 的餘數。下面填表程式的時間複雜度是？',
      code: { language: 'Python', text: 'dp = [0] * (n + 1)\ndp[0] = 1\nfor i in range(1, n + 1):\n    for s in range(1, k + 1):\n        if s <= i:\n            dp[i] = (dp[i] + dp[i - s]) % MOD\nprint(dp[n])' },
      options: ['O(n)', 'O(n + k)', 'O(nk)', 'O(k^n)'],
      answer: 2,
      explanation: '時間 = 狀態數 × 每個轉移的成本：有 n + 1 個狀態，每個狀態的轉移要看 k 種最後一步，內層迴圈總共執行 n × k 次（n = 50、k = 7 時實際數到 350 次），所以是 O(nk)。O(n) 忽略了每個轉移要加 k 項；O(n + k) 是把兩層迴圈當成先後執行；O(k^n) 是不記憶、直接遞迴列舉所有走法的成本，DP 正是為了避免它。',
    },
    {
      id: 'q-memo-depth', prompt: '爬樓梯（每次 1 或 2 階）要算 n = 100000，答案取 10^9 + 7 的餘數。在 Python 預設設定下，記憶化遞迴版（`ways(n)` 先查字典，沒有就呼叫 `ways(n - 1)` 與 `ways(n - 2)`）與填表版（一個 for 迴圈）各會怎樣？',
      options: [
        '兩個都正常印出相同的答案',
        '填表版比較慢，因為它要把 n 個狀態全部算完',
        '記憶化版比較快，時間只有 O(log n)',
        '記憶化版丟出 RecursionError，填表版正常印出答案',
      ],
      answer: 3,
      explanation: '記憶化版第一次呼叫 `ways(100000)` 時會一路往下呼叫到 `ways(1)`，深度約 10^5 層，超過 Python 預設約 1,000 層的上限而丟出 RecursionError；填表版只是迴圈，正常印出 967618232（兩者都已實際執行確認）。兩個版本都要算約 n 個狀態，時間都是 O(n)，記憶化不會變成 O(log n)，也不會比填表少算（這題每個狀態都會用到）。',
    },
    {
      id: 'q-base-case', prompt: '下面的程式要算爬 4 階樓梯（每次 1 或 2 階）的走法數，卻印出 3，正確答案是 5。錯在哪裡？',
      code: { language: 'Python', text: 'n = 4\ndp = [0] * (n + 1)\ndp[0] = 0\ndp[1] = 1\nfor i in range(2, n + 1):\n    dp[i] = dp[i - 1] + dp[i - 2]\nprint(dp[n])' },
      options: [
        '`dp[0]` 應該是 1：還沒出發也算一種走法，`dp[2]` 才會等於 2',
        '迴圈應該從 `i = 1` 開始',
        '轉移應該是 `dp[i - 1] * dp[i - 2]`',
        '整數溢位了，要改用更大的型別',
      ],
      answer: 0,
      explanation: '`dp[0] = 0` 讓 `dp[2] = dp[1] + dp[0] = 1`，少算了「一次爬 2 階」的那一種，之後全部跟著錯：表格變成 0, 1, 1, 2, 3，其實是 fib(i)。改成 `dp[0] = 1` 後是 1, 1, 2, 3, 5（兩種都已執行確認）。迴圈從 1 開始會用 `dp[0] + dp[-1]` 覆蓋掉 `dp[1]`，結果全部變 0；兩種走法數要相加（最後一步不同，互不重複），不是相乘；Python 整數不會溢位，而且 3 和 5 都很小。',
    },
    {
      id: 'q-greedy', prompt: '成本方格如下，只能往右或往下，從左上走到右下。「貪心」是每一步走向右邊或下面中成本較小的那一格（只剩一個方向時就走那個方向）。貪心的總成本與真正的最小成本各是多少？',
      code: { language: 'Python', text: 'grid = [[1, 1, 8],\n        [2, 9, 7],\n        [1, 1, 1]]' },
      options: ['貪心 6，最小成本 6', '貪心 11，最小成本 6', '貪心 18，最小成本 6', '貪心 18，最小成本 11'],
      answer: 2,
      explanation: '貪心第一步右邊是 1、下面是 2，往右；接著右邊 8、下面 9，往右；之後只能往下：1 + 1 + 8 + 7 + 1 = 18。DP 比較每一格的所有來源，找到先往下走的路線 1 + 2 + 1 + 1 + 1 = 6。貪心只看下一格，第一步省下的 1 換來後面一連串貴的格子；這就是要用 DP 的原因。兩個數字都已用程式計算，最小成本也用窮舉所有路線確認。',
    },
  ],
  exercises: [
    {
      id: 'e-min-path-sum', title: '方格最小路徑和',
      statement: '有一個 R 列、C 行的方格，第 i 列第 j 行的成本是一個非負整數。從左上角出發走到右下角，每一步只能往右或往下走一格，路線經過的每一格（包括起點與終點）的成本都要付。請輸出最小的總成本。R、C 可以到 1000，路線數量是天文數字，不能列舉；成本可以到 10^9，總和可以到約 2×10^12，要用 64 位元整數（C++ `long long`、Java `long`；JavaScript 的 `number` 在 2^53 以內是精確整數，夠用）。請用 DP 填表，可以用完整的表格，也可以用只保留一列的滾動陣列。輸入不合法時輸出 `Invalid`：第一行不是兩個 1～1000 的整數、成本的列數不是 R、某一列的數字個數不是 C、某個成本不是由 0～9 組成的整數（例如負數、小數、文字），或某個成本大於 10^9。',
      inputFormat: '第一行兩個整數 R、C。接下來 R 行，每行 C 個整數，以空白分隔，代表方格的成本。完全空白的行會被忽略。',
      outputFormat: '一行：最小總成本；輸入不合法時輸出 `Invalid`。',
      constraints: ['1 ≤ R, C ≤ 1000', '0 ≤ 每格成本 ≤ 10^9', '答案可能超過 2^31，C++ 與 Java 要用 64 位元整數', '不合法的輸入輸出 Invalid'],
      samples: [
        { kind: 'normal', input: '3 3\n1 3 1\n1 5 1\n4 2 1', output: '7', note: '路線 1 → 3 → 1 → 1 → 1' },
        { kind: 'error', input: '2 3\n1 2 3\n4 5', output: 'Invalid', note: '第二列只有 2 個數字' },
      ],
      tests: [
        { kind: 'normal', input: '3 3\n1 3 1\n1 5 1\n4 2 1', output: '7', note: '範例' },
        { kind: 'normal', input: '3 4\n1 3 1 2\n1 5 1 4\n4 2 1 3', output: '10', note: '視覺化的方格：貪心會付 12' },
        { kind: 'normal', input: '3 3\n1 1 8\n2 9 7\n1 1 1', output: '6', note: '貪心陷阱：每步走較便宜的鄰格會付 18' },
        { kind: 'normal', input: '4 5\n8 6 4 5 4\n2 8 4 1 0\n3 6 6 4 8\n5 6 2 8 0', output: '31', note: '隨機小方格，已用窮舉所有路線確認' },
        { kind: 'edge', input: '1 1\n5', output: '5', note: '1 × 1：起點就是終點' },
        { kind: 'edge', input: '1 5\n4 0 7 1 3', output: '15', note: '只有一列：只能一路往右，第 0 列的初始值' },
        { kind: 'edge', input: '5 1\n2\n9\n0\n4\n6', output: '21', note: '只有一行：只能一路往下，第 0 行的初始值' },
        { kind: 'edge', input: '3 4\n0 0 0 0\n0 0 0 0\n0 0 0 0', output: '0', note: '全部是 0' },
        { kind: 'edge', input: '3 3\n1000000000 1000000000 1000000000\n1000000000 1000000000 1000000000\n1000000000 1000000000 1000000000', output: '5000000000', note: '成本最大：總和 5×10^9 超過 32 位元' },
        { kind: 'edge', input: '2 2\n1000000000 1000000000\n147483648 1000000000', output: '2147483648', note: '答案正好是 2^31，用 int 會溢位成負數' },
        { kind: 'edge', input: gridInput(tallGrid), output: String(minPathColumnMajor(tallGrid)), note: '1000 × 90 的方格、成本到 10^9，總和約 10^12（測資由程式產生，約 1 MB）' },
        { kind: 'edge', input: gridInput(wideGrid), output: String(minPathColumnMajor(wideGrid)), note: '3 × 1000 的寬方格（測資由程式產生）' },
        { kind: 'error', input: '2 3\n1 2 3\n4 5', output: 'Invalid', note: '某一列的數字個數不對' },
        { kind: 'error', input: '2 2\n1 2.5\n3 4', output: 'Invalid', note: '成本不是整數' },
        { kind: 'error', input: '2 2\n1 -2\n3 4', output: 'Invalid', note: '負的成本' },
        { kind: 'error', input: '3 2\n1 2\n3 4', output: 'Invalid', note: '列數比 R 少' },
        { kind: 'error', input: '1 2\n1 1000000001', output: 'Invalid', note: '成本超過 10^9' },
        { kind: 'error', input: '0 5', output: 'Invalid', note: 'R 必須至少是 1' },
      ],
      hints: [
        '狀態：`dp[i][j]` = 從左上角走到 (i, j) 的最小成本（含兩端）。轉移：最後一步從上面或左邊來，取較小的再加上 `grid[i][j]`。',
        '第 0 列只能從左邊來、第 0 行只能從上面來，要分開處理；不要讓一般轉移讀到方格外面（Python 的 `dp[-1]` 不會報錯，會默默讀到最後一列）。',
        '滾動陣列：只開一個長度 C 的 `row`，逐列更新；更新前的 `row[j]` 是上面，`row[j - 1]` 是左邊。這樣 1000 × 1000 也只要 1000 個 64 位元整數，而且可以一邊讀一列一邊算。',
        '先檢查每一列的數字個數與每個成本是否合法，再拿來計算。可以寫一個窮舉所有路線的程式，在 3 × 3 以內的小方格上和自己的答案對照。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

// tok 全由 0～9 組成且值不超過 limit 時，把值寫進 v 並回傳 true
bool parseNumber(const std::string& tok, long long limit, long long& v) {
    v = 0;
    for (char ch : tok) {
        if (ch < '0' || ch > '9') return false;
        v = v * 10 + (ch - '0');
        if (v > limit) return false;
    }
    return !tok.empty();
}

// 讀下一個不是空白的行並切成字串；沒有了回傳 false
bool nextRow(std::vector<std::string>& toks) {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.find_first_not_of(" \t\r") == std::string::npos) continue;
        toks.clear();
        std::istringstream in(line);
        std::string t;
        while (in >> t) toks.push_back(t);
        return true;
    }
    return false;
}

std::string solve() {
    std::vector<std::string> toks;
    long long r, c;
    if (!nextRow(toks) || toks.size() != 2) return "Invalid";
    if (!parseNumber(toks[0], 1000, r) || !parseNumber(toks[1], 1000, c) || r < 1 || c < 1) return "Invalid";
    std::vector<long long> row(c, 0);    // 滾動陣列：row[j] 是目前這一列的 dp 值
    for (long long i = 0; i < r; i++) {
        if (!nextRow(toks) || static_cast<long long>(toks.size()) != c) return "Invalid";
        for (long long j = 0; j < c; j++) {
            long long cost;
            if (!parseNumber(toks[j], 1000000000LL, cost)) return "Invalid";
            if (j == 0) row[0] += cost;                         // 第一行只能從上面來（i = 0 時是起點）
            else if (i == 0) row[j] = row[j - 1] + cost;        // 第一列只能從左邊來
            else row[j] = std::min(row[j], row[j - 1]) + cost;  // 上面與左邊取較小的
        }
    }
    if (nextRow(toks)) return "Invalid";  // 列數比 R 多
    return std::to_string(row[c - 1]);
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::cout << solve() << "\n";
    return 0;
}`,
        Python: code`import sys


def is_number(tok):
    return tok.isascii() and tok.isdigit()     # 只接受 0～9 組成的整數


def solve():
    rows = (line.split() for line in sys.stdin if line.strip())   # 跳過空白行
    header = next(rows, None)
    if header is None or len(header) != 2 or not all(is_number(t) for t in header):
        return "Invalid"
    r, c = int(header[0]), int(header[1])
    if not (1 <= r <= 1000 and 1 <= c <= 1000):
        return "Invalid"
    row = [0] * c                  # 滾動陣列：row[j] 是目前這一列的 dp 值
    for i in range(r):
        toks = next(rows, None)
        if toks is None or len(toks) != c or not all(is_number(t) for t in toks):
            return "Invalid"
        costs = [int(t) for t in toks]
        if max(costs) > 10**9:
            return "Invalid"
        row[0] += costs[0]                               # 第一行只能從上面來（i = 0 時是起點）
        for j in range(1, c):
            if i == 0:
                row[j] = row[j - 1] + costs[j]           # 第一列只能從左邊來
            else:
                row[j] = min(row[j], row[j - 1]) + costs[j]
    if next(rows, None) is not None:                     # 列數比 R 多
        return "Invalid"
    return str(row[c - 1])


print(solve())`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringTokenizer;

public class Main {
    // tok 全由 0～9 組成且值不超過 limit 時回傳它的值，否則回傳 -1
    static long parseNumber(String tok, long limit) {
        long v = 0;
        for (int k = 0; k < tok.length(); k++) {
            char ch = tok.charAt(k);
            if (ch < '0' || ch > '9') return -1;
            v = v * 10 + (ch - '0');
            if (v > limit) return -1;
        }
        return v;
    }

    // 下一個不是空白的行；沒有了回傳 null
    static String nextLine(BufferedReader in) throws IOException {
        String line;
        while ((line = in.readLine()) != null) {
            if (!line.trim().isEmpty()) return line;
        }
        return null;
    }

    static String solve(BufferedReader in) throws IOException {
        String header = nextLine(in);
        if (header == null) return "Invalid";
        StringTokenizer st = new StringTokenizer(header);
        if (st.countTokens() != 2) return "Invalid";
        long r = parseNumber(st.nextToken(), 1000), c = parseNumber(st.nextToken(), 1000);
        if (r < 1 || c < 1) return "Invalid";
        int cols = (int) c;
        long[] row = new long[cols];         // 滾動陣列：row[j] 是目前這一列的 dp 值
        for (int i = 0; i < r; i++) {
            String line = nextLine(in);
            if (line == null) return "Invalid";
            st = new StringTokenizer(line);
            if (st.countTokens() != cols) return "Invalid";
            for (int j = 0; j < cols; j++) {
                long cost = parseNumber(st.nextToken(), 1000000000L);
                if (cost < 0) return "Invalid";
                if (j == 0) row[0] += cost;                          // 第一行只能從上面來（i = 0 時是起點）
                else if (i == 0) row[j] = row[j - 1] + cost;         // 第一列只能從左邊來
                else row[j] = Math.min(row[j], row[j - 1]) + cost;   // 上面與左邊取較小的
            }
        }
        if (nextLine(in) != null) return "Invalid";   // 列數比 R 多
        return String.valueOf(row[cols - 1]);
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        System.out.println(solve(in));
    }
}`,
        JavaScript: code`// tok 全由 0～9 組成且值不超過 limit 時回傳它的值，否則回傳 -1
function parseNumber(tok, limit) {
    if (!/^[0-9]+$/.test(tok)) return -1;
    const v = Number(tok);
    return v > limit ? -1 : v;
}

function solve() {
    const rows = require("fs").readFileSync(0, "utf8").split("\n")
        .filter(line => line.trim() !== "")           // 跳過空白行
        .map(line => line.trim().split(/\s+/));
    let next = 0;
    const header = rows[next++];
    if (header === undefined || header.length !== 2) return "Invalid";
    const r = parseNumber(header[0], 1000), c = parseNumber(header[1], 1000);
    if (r < 1 || c < 1) return "Invalid";
    // 總和最多約 2 × 10^12，小於 2^53，number 可以精確表示
    const row = new Array(c).fill(0);             // 滾動陣列：row[j] 是目前這一列的 dp 值
    for (let i = 0; i < r; i++) {
        const toks = rows[next++];
        if (toks === undefined || toks.length !== c) return "Invalid";
        for (let j = 0; j < c; j++) {
            const cost = parseNumber(toks[j], 1000000000);
            if (cost < 0) return "Invalid";
            if (j === 0) row[0] += cost;                         // 第一行只能從上面來（i = 0 時是起點）
            else if (i === 0) row[j] = row[j - 1] + cost;        // 第一列只能從左邊來
            else row[j] = Math.min(row[j], row[j - 1]) + cost;   // 上面與左邊取較小的
        }
    }
    if (next < rows.length) return "Invalid";     // 列數比 R 多
    return String(row[c - 1]);
}

console.log(solve());`,
      },
      judge: 'none',
    },
  ],
};

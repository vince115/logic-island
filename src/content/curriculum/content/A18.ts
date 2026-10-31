import type { LessonContent, TraceStep } from '../schema';
import { knapsackSteps } from '../simulate-algorithms';

const code = String.raw;

/**
 * The visualization: the 2D 0/1 knapsack on three items and capacity 6 (the same items as the greedy counterexample
 * and the loop-direction example). knapsackSteps fills row by row, w from 0 to W, exactly like the trace code; its
 * events map to the trace code's lines: 'base' → line 3 (the row of zeros), 'fill' → line 9 (the max of skip and
 * take), 'result' → line 15 (the walk-back and the print). The simulator also reports the cells where the item does
 * not fit under 'fill'; those steps (one read: only the cell above) are moved to line 8, the `if wt <= w` that fails.
 */
const TRACE_ITEMS = [{ name: 'A', weight: 4, value: 7 }, { name: 'B', weight: 3, value: 5 }, { name: 'C', weight: 3, value: 4 }];
const TRACE_W = 6;
const traceSteps: TraceStep[] = knapsackSteps(TRACE_ITEMS, TRACE_W, { base: 3, fill: 9, result: 15 }).map(step => {
  const reads = step.arrays?.[0].marks?.filter(m => m.kind === 'read').length ?? 0;
  return step.line === 9 && reads === 1 ? { ...step, line: 8 } : step;
});

/**
 * Exercise worst cases, generated here: n = 100 items and W = 10^5 with a fixed 32-bit xorshift, so the input is
 * deterministic. Weights 1..2000 (total just above W, so almost everything fits and every item loops ~10^5 times)
 * and weights 1..10^5; values 0..10^9, so the answers pass 2^31. The expected values were produced by running the
 * Python reference (1D, w downward) and an independent two-row 2D reference on exactly this input; both agreed, and
 * the three solutions are checked against them by tests/curriculum-code.test.ts.
 */
let seed = 20261031;
const rand = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };
const makeItems = (n: number, cap: number, maxWeight: number) =>
  [`${n} ${cap}`, ...Array.from({ length: n }, () => { const wt = 1 + rand() % maxWeight; return `${wt} ${rand() % 1_000_000_001}`; })].join('\n');
const BIG_SMALL_WEIGHTS = makeItems(100, 100_000, 2_000);
const BIG_LARGE_WEIGHTS = makeItems(100, 100_000, 100_000);
const BIG_ALL_FIT = ['100 100000', ...Array.from({ length: 100 }, () => '1000 1000000000')].join('\n');

/** A18 Knapsack 基礎. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const A18: LessonContent = {
  lessonId: 'A18',
  motivation: '背包問題（knapsack problem）是動態規劃最經典的模型：有一個容量有限的背包和一堆物品，每個物品有重量和價值，要挑出總重量不超過容量、總價值最大的組合。它的樣子到處都是：預算有限要挑哪些專案、考試時間有限要先寫哪些題、行李限重要帶哪些東西、能不能用手上的硬幣剛好湊出某個金額。直接列舉所有組合是 2^n 種，n = 100 時完全不可能；依「價值 / 重量」挑最划算的貪心（A13）看起來合理，卻會被很小的例子打敗。A17 學過的狀態、轉移、初始值與填表順序，在這裡會組成一個完整的方法：dp[i][w] 表示「只用前 i 個物品、容量 w 時的最大價值」，O(nW) 就能算出最佳解，還能倒推出選了哪些物品。這一課也要學會兩個關鍵的分辨：每個物品最多用一次的 0/1 背包和可以無限次使用的無限背包，一維陣列的迴圈方向剛好相反；以及背包的限制：時間與容量 W 的「數值」成正比，W = 10^9 時這個方法就不能用了。',
  sections: [
    {
      id: 'problem', title: '0/1 背包問題：為什麼不能只看 CP 值',
      blocks: [
        { type: 'p', text: '0/1 背包（0/1 knapsack）：有 n 個物品，第 i 個重 `wt[i]`、價值 `val[i]`，背包容量 W。每個物品只能「不拿（0）」或「拿一個（1）」，不能切開、也不能拿兩次，要讓總重量 ≤ W 時總價值最大。暴力法是列舉 2^n 個子集合，n = 20 約一百萬種還可以，n = 60 就有 10^18 種，完全不可能。' },
        { type: 'p', text: '直覺的貪心是依「價值 / 重量」（CP 值）由大到小，放得下就放。看這組物品，容量 W = 6：' },
        { type: 'table', head: ['物品', '重量', '價值', '價值 / 重量'], rows: [
          ['A', '4', '7', '1.75'],
          ['B', '3', '5', '約 1.67'],
          ['C', '3', '4', '約 1.33'],
        ] },
        { type: 'p', text: '貪心先拿 CP 值最高的 A（重 4），剩下容量 2，B 和 C 都放不下，總價值 7。但不拿 A、改拿 B 和 C（重 3 + 3 = 6）可以得到 9。問題出在 A 用掉的 4 格容量讓剩下的 2 格浪費了；「現在最划算」不代表「整體最好」。換成其他規則也一樣會失敗：依價值最大也是先拿 A，得到 7；依重量最輕先拿，遇到 {重 1 價值 1, 重 1 價值 1, 重 5 價值 10}、W = 5 時會先拿兩個輕的，最大的那個就放不下了，得到 2 而不是 10。' },
        { type: 'callout', tone: 'note', title: '可以切開的話，貪心就對了', text: '如果物品可以只拿一部分（例如砂糖、金粉，稱為分數背包 fractional knapsack），依 CP 值由大到小、最後一個放不下就切一部分，這個貪心是正確的：每一格容量都裝了當下最值錢的東西，不會有浪費。0/1 背包不能切，剩下的零碎容量可能用不到，所以要用動態規劃把「拿」和「不拿」兩種可能都考慮。' },
        { type: 'p', text: '為什麼動態規劃適合？考慮最後一個物品，只有兩種情況：不拿它，問題變成「前 n − 1 個物品、容量 W」；拿它，問題變成「前 n − 1 個物品、容量 W − wt」，再加上它的價值。兩個子問題的形式一樣，都只由「看到第幾個物品」和「還剩多少容量」決定，這就是 A17 說的狀態。不同的選法常常走到同一個（物品數, 剩餘容量），把它的答案存起來，就不必重複計算。' },
      ],
    },
    {
      id: 'table', title: '狀態、轉移、初始值與倒推',
      blocks: [
        { type: 'p', text: '照 A17 的四個步驟寫出 0/1 背包：' },
        { type: 'list', ordered: true, items: [
          '狀態（state）：`dp[i][w]` = 只用前 i 個物品（第 1～i 個）、總重量不超過 w 時，能得到的最大價值。表格有 (n + 1) × (W + 1) 格。',
          '轉移（transition）：第 i 個物品不拿，答案是 `dp[i − 1][w]`；拿（只有 `wt[i] ≤ w` 時才可以），答案是 `dp[i − 1][w − wt[i]] + val[i]`。`dp[i][w]` 取兩者較大的那個。',
          '初始值（base case）：`dp[0][w] = 0`：沒有任何物品可選，價值是 0，對每個 w 都成立。',
          '填表順序與答案：第 i 列只用到第 i − 1 列，所以一列一列由上往下填（同一列裡 w 的順序在二維表中不影響結果）。答案是 `dp[n][W]`。',
        ] },
        { type: 'p', text: '為什麼這樣是對的？前 i 個物品的每一種合法選法，不是「含第 i 個」就是「不含第 i 個」，兩種情況剛好涵蓋全部。不含時，它就是前 i − 1 個物品在容量 w 下的一種選法，最好的是 `dp[i − 1][w]`；含時，扣掉第 i 個後剩下的是前 i − 1 個物品在容量 `w − wt[i]` 下的一種選法，最好的是 `dp[i − 1][w − wt[i]]`。最佳解的一部分也必須是對應子問題的最佳解（否則換成更好的子問題解，整體會更好），這個性質稱為最佳子結構（optimal substructure）。' },
        { type: 'p', text: '下方的視覺化用上一節的 A、B、C 與 W = 6 一格一格填表：每一格標出讀取的「正上方（不拿）」與「左上方 wt 格（拿）」兩格，最後一步從 `dp[3][6]` 倒推出選了哪些物品。你也可以在「自己試試」裡把容量改成 0～12，看最佳組合怎麼變。' },
        { type: 'example', id: 'table-2d' },
        { type: 'p', text: '範例的四個物品 P、Q、R、S，容量 7。表的最後一格 `dp[4][7] = 9` 就是答案。依 CP 值的貪心先拿 S（重 5、價值 7，CP 值 1.4），再拿 P，只得到 8。' },
        { type: 'p', text: '倒推（reconstruction）：從 `(i, w) = (n, W)` 開始，每次比較 `dp[i][w]` 和正上方的 `dp[i − 1][w]`。如果相等，不拿第 i 個也能得到同樣的價值，就當作沒拿，往上一列；如果不同，第 i 個一定被拿了，記下它，w 減去它的重量，再往上一列。範例中 `dp[4][7] = dp[3][7] = 9`，所以 S 沒拿；`dp[3][7] = 9 ≠ dp[2][7] = 5`，拿了 R，w 變成 3；`dp[2][3] = 4 ≠ dp[1][3] = 1`，拿了 Q，w 變成 0；最後 P 沒拿。最佳組合可能不只一種，倒推只會找出其中一種；相等時「當作沒拿」是本課的約定，題目若要求特定的組合（例如字典序最小），要另外設計比較規則。' },
        { type: 'callout', tone: 'warning', title: '忘了檢查 `wt <= w`', text: '寫成 `dp[i][w] = max(dp[i - 1][w], dp[i - 1][w - wt] + val)`、少了「放得下才能拿」的判斷時，`w - wt` 會變成負數。Python 的負索引不會報錯，而是默默讀到這一列的尾端：A、B、C、W = 6 會印出 16（實際執行確認），比正確答案 9 還大，看起來像是「找到了更好的解」。C++ 的 `std::vector` 用 `[]` 越界是未定義行為，可能讀到垃圾值或當掉；Java 會丟出 `ArrayIndexOutOfBoundsException`。三種語言都要先判斷 `wt <= w` 才讀 `w - wt`。' },
      ],
    },
    {
      id: 'rolling', title: '一維優化：0/1 背包的 w 要由大到小',
      blocks: [
        { type: 'p', text: '第 i 列只用到第 i − 1 列，所以不必保存整張表：用一個長度 W + 1 的陣列 `dp[w]`，處理第 i 個物品之前，它存的就是第 i − 1 列；處理時就地更新成第 i 列。空間從 O(nW) 降到 O(W)，這就是 A17 的滾動陣列（rolling array）。更新式變成 `dp[w] = max(dp[w], dp[w - wt] + val)`，右邊的 `dp[w]` 是「不拿」（上一列的同一格），`dp[w - wt]` 必須是「上一列」的值。' },
        { type: 'p', text: '關鍵在迴圈方向。w 由大到小時，更新 `dp[w]` 那一刻，比 w 小的格子這一輪都還沒動，`dp[w - wt]` 仍是上一列的值，正確。w 由小到大時，`dp[w - wt]` 在這一輪已經更新過，可能已經包含了第 i 個物品，再加一次 `val` 就等於同一個物品拿了兩次。' },
        { type: 'example', id: 'rolling-direction' },
        { type: 'p', text: '看由小到大處理 B（重 3、價值 5）的過程：先更新 `dp[3] = dp[0] + 5 = 5`，這已經是「拿了一個 B」；接著 `dp[6] = max(7, dp[3] + 5) = 10`，讀到的 `dp[3]` 是剛更新過的值，所以 10 其實是「B 拿了兩個」，重量 6、價值 10。題目規定每個物品只有一個，這個答案不合法；由大到小時 `dp[6]` 先更新，讀到的 `dp[3]` 還是 0，就不會出錯。' },
        { type: 'list', items: [
          '0/1 背包的一維寫法：`for w in range(W, wt - 1, -1)`，C++／Java 寫成 `for (w = W; w >= wt; w--)`。迴圈到 `wt` 就停，不必再寫 `if wt <= w`，也不會出現負索引。',
          '一維陣列只保留最後一列，沒辦法再從表格倒推出選了哪些物品；需要輸出組合時，保留二維表，或另外用一個 `took[i][w]` 記錄每一格是否拿了第 i 個。',
          '時間仍是 O(nW)，一維優化只省空間。W = 10^5 時，二維表 100 × 10^5 個 64 位元整數約 80 MB，一維只要約 0.8 MB。',
        ] },
        { type: 'callout', tone: 'warning', title: '方向寫錯，範例常常還是會過', text: '如果測資裡每個物品都「拿兩個也放不下」，或拿兩個剛好不比較好，由小到大的錯誤寫法也會印出正確答案，很難察覺。測試時一定要放一組「重複拿同一個物品會更好」的資料，例如上面的 A、B、C 與 W = 6（錯誤寫法得 10，正確是 9），或兩個一模一樣的物品（重 2、價值 3，W = 6：正確 6，錯誤寫法會拿三次得 9）。' },
      ],
    },
    {
      id: 'unbounded', title: '無限背包：每種物品可以拿任意多次',
      blocks: [
        { type: 'p', text: '無限背包（unbounded knapsack，也叫完全背包）：每一種物品有無限多個，可以拿 0 次、1 次或很多次。二維狀態仍是 `dp[i][w]` = 只用前 i 種物品、容量 w 時的最大價值，但「拿」的轉移變成 `dp[i][w − wt[i]] + val[i]`：讀的是「同一列」，因為拿了一個第 i 種之後，還可以繼續拿第 i 種。改成一維時，`dp[w - wt]` 要的正是「這一輪已經更新過」的值，所以 w 要由小到大，剛好是上一節的「錯誤寫法」。' },
        { type: 'table', head: ['', '0/1 背包', '無限背包'], rows: [
          ['每個物品', '最多拿一次', '可以拿任意多次'],
          ['二維「拿」的轉移', '`dp[i − 1][w − wt] + val`（上一列）', '`dp[i][w − wt] + val`（同一列）'],
          ['一維迴圈方向', 'w 由大到小：`W` 到 `wt`', 'w 由小到大：`wt` 到 `W`'],
          ['A、B、C，W = 6 的答案', '9（B + C）', '10（B + B）'],
          ['典型題目', '每件物品只有一件：挑選專案、選題、行李', '供應無限：找零、裁切材料、無限硬幣'],
        ] },
        { type: 'p', text: 'A13 看過找零的貪心會失敗：面額 {1, 3, 4} 湊 6，貪心拿 4 + 1 + 1 共 3 枚，但 3 + 3 只要 2 枚。最少硬幣數（minimum coins）就是一種無限背包：`dp[a]` = 湊出金額 a 最少要幾枚硬幣，`dp[0] = 0`，其他先設成「無限大」INF 代表還湊不出來；對每種面額 c，a 由小到大，`dp[a] = min(dp[a], dp[a − c] + 1)`。和背包相比只是把 `max` 換成 `min`、價值換成「枚數 1」。最後 `dp[amount]` 仍是 INF，表示湊不出來，依題目輸出 −1。' },
        { type: 'example', id: 'unbounded-coins' },
        { type: 'p', text: '`{1, 3, 4}` 的 `dp[0..6] = 0 1 2 1 1 2 2`：`dp[6]` 由 `dp[3] + 1` 得到 2（3 + 3）。`{3, 5}` 湊 7 時，`dp[7]` 一直是 INF，輸出 −1；湊 9 時 3 + 3 + 3 得到 3 枚（A13 提過，這時的貪心會先拿 5、剩 4 再拿 3、剩 1，誤以為湊不出來）。最後一行把 A、B、C 當成無限供應，W = 6 的最大價值是 10，和上一節錯誤方向的結果相同，因為那個錯誤寫法其實就是無限背包。' },
        { type: 'callout', tone: 'tip', title: 'INF 要選多大', text: '「湊不出來」要用一個比任何可能答案都大、加 1 之後又不會溢位的數。範例用 `10^9`：枚數最多是金額本身，不會到 10^9，而 `10^9 + 1` 仍在 C++／Java `int` 的範圍內。用 `INT_MAX` 或 `Integer.MAX_VALUE` 當 INF 時，`dp[a - c] + 1` 會溢位變成負數，反而被 `min` 選中；Python 的整數不會溢位，也可以用 `float(\'inf\')`，但混用浮點數時輸出要記得轉回整數。' },
      ],
    },
    {
      id: 'cost-variants', title: '複雜度、資料範圍與常見變形',
      blocks: [
        { type: 'p', text: '兩種背包的時間都是 O(nW)：表有 (n + 1)(W + 1) 格，每格 O(1)。空間二維 O(nW)、一維 O(W)。n = 100、W = 10^5 時約 10^7 次更新，C++／Java 一下就完成，Python 也在一秒左右。' },
        { type: 'p', text: '注意 O(nW) 和 O(n²) 不一樣：W 是輸入裡的一個「數值」，寫出來只要幾位數，時間卻和它的大小成正比。這種「對數值是多項式、對輸入長度不是」的複雜度叫做偽多項式（pseudo-polynomial）。所以背包 DP 適不適用，要看 W（或金額）的範圍，不是只看 n。' },
        { type: 'callout', tone: 'warning', title: 'W = 10^9 時，背包 DP 不能用', text: 'n = 100、W = 10^9 時要做約 10^11 次更新，一維陣列也要 10^9 + 1 格，64 位元整數約 8 GB，時間和記憶體都不可能。這時要換一個維度：如果所有價值都很小（例如總和 ≤ 10^5），改用 `dp[v]` = 湊出總價值 v 的最小重量，複雜度是 O(n × 價值總和)；如果 n ≤ 20，直接列舉 2^n 個子集合。看到題目先比較 n、W、價值總和三個範圍，再決定狀態用哪一個。' },
        { type: 'p', text: '背包的骨架「對每個物品，更新一個以容量（或金額、總和）為索引的陣列」可以套到很多題目，只是格子裡存的東西不同：' },
        { type: 'table', head: ['變形', '格子存什麼', '初始值', '轉移', '迴圈方向'], rows: [
          ['子集合和（subset sum）：能不能挑一些數剛好湊出 S', '`True`／`False`', '`can[0] = True`，其他 `False`', '`can[s] = can[s] or can[s − x]`', '每個數用一次：由大到小'],
          ['湊出 S 的子集合有幾個', '方法數', '`cnt[0] = 1`', '`cnt[s] += cnt[s − x]`', '由大到小'],
          ['硬幣湊出金額的方法數（不計順序）', '方法數', '`ways[0] = 1`', '`ways[a] += ways[a − c]`', '面額無限：由小到大，外層是面額'],
          ['最少硬幣數', '最少枚數', '`dp[0] = 0`，其他 INF', '`dp[a] = min(dp[a], dp[a − c] + 1)`', '由小到大'],
          ['恰好裝滿的最大價值', '最大價值', '`dp[0] = 0`，其他「不可能」（−INF）', '同 0/1 背包，讀到 −INF 就跳過', '依物品是 0/1 或無限'],
        ] },
        { type: 'example', id: 'variations' },
        { type: 'p', text: '`{3, 34, 4, 12, 5, 2}` 可以湊出 9（4 + 5），但湊不出 30：不用 34 時其他數加起來只有 26。`{1, 2, 3, 4, 5}` 湊 5 有 {5}、{1, 4}、{2, 3} 三種。硬幣 {1, 2, 5} 湊 5 有 4 種組合：5、2 + 2 + 1、2 + 1 + 1 + 1、1 × 5。如果把兩層迴圈交換成「外層金額、內層面額」，算的就變成「有順序」的方法數（1 + 2 + 2 和 2 + 1 + 2 算不同），得到 9，題目問的是哪一種要先看清楚。' },
        { type: 'p', text: '方法數成長得非常快：八種面額 {1, 2, 5, 10, 20, 50, 100, 200} 湊 100000 的方法數有 23 位數（約 1.0 × 10^22），超過 64 位元整數的上限約 9.22 × 10^18。題目通常要求「除以 10^9 + 7 的餘數」，每次加完就取餘數，數字一直小於 2 × (10^9 + 7)，C++／Java 用 `long long`／`long` 不會溢位。' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java'], rows: [
          ['價值總和超過 2^31', '用 `long long`：100 個 10^9 的價值總和是 10^11，`int` 會溢位（未定義行為）', '`int` 沒有上限', '用 `long`：`int` 溢位後默默繞回，答案錯誤'],
          ['方法數', '每次加完 `% MOD`；不取餘數時 64 位元也會溢位', '可以算出精確的大數，但數字越大越慢，題目要求取餘數時仍要取', '同 C++；需要精確值時用 `java.math.BigInteger`'],
          ['越界讀取 `w - wt < 0`', '`[]` 不檢查，未定義行為', '負索引默默讀到尾端', '`ArrayIndexOutOfBoundsException`'],
          ['W = 10^5 的一維陣列', '`std::vector<long long> dp(W + 1)`', '`[0] * (W + 1)`', '`new long[W + 1]`'],
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'table-2d', title: '二維 0/1 背包：整張表、最佳價值與選了誰', description: '四個物品 P(1, 1)、Q(3, 4)、R(4, 5)、S(5, 7)（括號內是重量、價值），容量 7。印出整張 dp 表（每列是「前 i 個物品」，每行是容量 w）、最佳價值、倒推出的物品，以及依 CP 值貪心的結果作為對照。',
      output: 'w: 0 1 2 3 4 5 6 7\n0: 0 0 0 0 0 0 0 0\nP: 0 1 1 1 1 1 1 1\nQ: 0 1 1 4 5 5 5 5\nR: 0 1 1 4 5 6 6 9\nS: 0 1 1 4 5 7 8 9\nbest 9\nchosen Q R\ngreedy 8',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> names = {"P", "Q", "R", "S"};
    std::vector<int> wt = {1, 3, 4, 5};
    std::vector<int> val = {1, 4, 5, 7};
    int W = 7;
    int n = static_cast<int>(names.size());

    // dp[i][w]：只用前 i 個物品、容量 w 時的最大價值；第 0 列全是 0
    std::vector<std::vector<long long>> dp(n + 1, std::vector<long long>(W + 1, 0));
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= W; w++) {
            dp[i][w] = dp[i - 1][w];                                  // 不拿第 i 個
            if (wt[i - 1] <= w) {                                     // 放得下才能拿
                dp[i][w] = std::max(dp[i][w], dp[i - 1][w - wt[i - 1]] + val[i - 1]);
            }
        }
    }

    std::cout << "w:";
    for (int w = 0; w <= W; w++) std::cout << " " << w;
    std::cout << "\n";
    for (int i = 0; i <= n; i++) {
        std::cout << (i == 0 ? std::string("0") : names[i - 1]) << ":";
        for (int w = 0; w <= W; w++) std::cout << " " << dp[i][w];
        std::cout << "\n";
    }
    std::cout << "best " << dp[n][W] << "\n";

    // 倒推：和上一列不同，表示拿了第 i 個
    std::vector<std::string> chosen;
    int w = W;
    for (int i = n; i >= 1; i--) {
        if (dp[i][w] != dp[i - 1][w]) {
            chosen.push_back(names[i - 1]);
            w -= wt[i - 1];
        }
    }
    std::reverse(chosen.begin(), chosen.end());
    std::cout << "chosen";
    for (const std::string& name : chosen) std::cout << " " << name;
    std::cout << "\n";

    // 對照：依「價值 / 重量」由大到小的貪心（交叉相乘比較，不用浮點數）
    std::vector<int> order = {0, 1, 2, 3};
    std::sort(order.begin(), order.end(), [&](int a, int b) { return val[a] * wt[b] > val[b] * wt[a]; });
    int room = W;
    long long total = 0;
    for (int k : order) {
        if (wt[k] <= room) {
            room -= wt[k];
            total += val[k];
        }
    }
    std::cout << "greedy " << total << "\n";
    return 0;
}`,
        Python: code`names = ["P", "Q", "R", "S"]
wt = [1, 3, 4, 5]
val = [1, 4, 5, 7]
W = 7
n = len(names)

# dp[i][w]：只用前 i 個物品、容量 w 時的最大價值；第 0 列全是 0
dp = [[0] * (W + 1) for _ in range(n + 1)]
for i in range(1, n + 1):
    for w in range(W + 1):
        dp[i][w] = dp[i - 1][w]                     # 不拿第 i 個
        if wt[i - 1] <= w:                          # 放得下才能拿
            dp[i][w] = max(dp[i][w], dp[i - 1][w - wt[i - 1]] + val[i - 1])

print("w:", *range(W + 1))
for i in range(n + 1):
    label = "0" if i == 0 else names[i - 1]
    print(label + ":", *dp[i])
print("best", dp[n][W])

# 倒推：和上一列不同，表示拿了第 i 個
chosen = []
w = W
for i in range(n, 0, -1):
    if dp[i][w] != dp[i - 1][w]:
        chosen.append(names[i - 1])
        w -= wt[i - 1]
chosen.reverse()
print("chosen", *chosen)

# 對照：依「價值 / 重量」由大到小的貪心（四個比值都不同，不會有平手）
order = sorted(range(n), key=lambda k: val[k] / wt[k], reverse=True)
room, total = W, 0
for k in order:
    if wt[k] <= room:
        room -= wt[k]
        total += val[k]
print("greedy", total)`,
        Java: code`import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        String[] names = {"P", "Q", "R", "S"};
        int[] wt = {1, 3, 4, 5};
        int[] val = {1, 4, 5, 7};
        int W = 7;
        int n = names.length;

        // dp[i][w]：只用前 i 個物品、容量 w 時的最大價值；第 0 列全是 0
        long[][] dp = new long[n + 1][W + 1];
        for (int i = 1; i <= n; i++) {
            for (int w = 0; w <= W; w++) {
                dp[i][w] = dp[i - 1][w];                                  // 不拿第 i 個
                if (wt[i - 1] <= w) {                                     // 放得下才能拿
                    dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - wt[i - 1]] + val[i - 1]);
                }
            }
        }

        StringBuilder out = new StringBuilder("w:");
        for (int w = 0; w <= W; w++) out.append(' ').append(w);
        out.append('\n');
        for (int i = 0; i <= n; i++) {
            out.append(i == 0 ? "0" : names[i - 1]).append(':');
            for (int w = 0; w <= W; w++) out.append(' ').append(dp[i][w]);
            out.append('\n');
        }
        out.append("best ").append(dp[n][W]).append('\n');

        // 倒推：和上一列不同，表示拿了第 i 個
        List<String> chosen = new ArrayList<>();
        int w = W;
        for (int i = n; i >= 1; i--) {
            if (dp[i][w] != dp[i - 1][w]) {
                chosen.add(names[i - 1]);
                w -= wt[i - 1];
            }
        }
        Collections.reverse(chosen);
        out.append("chosen");
        for (String name : chosen) out.append(' ').append(name);
        out.append('\n');

        // 對照：依「價值 / 重量」由大到小的貪心（交叉相乘比較，不用浮點數）
        Integer[] order = {0, 1, 2, 3};
        Arrays.sort(order, (a, b) -> Integer.compare(val[b] * wt[a], val[a] * wt[b]));
        int room = W;
        long total = 0;
        for (int k : order) {
            if (wt[k] <= room) {
                room -= wt[k];
                total += val[k];
            }
        }
        out.append("greedy ").append(total);
        System.out.println(out);
    }
}`,
      },
    },
    {
      id: 'rolling-direction', title: '一維陣列：由大到小（正確）與由小到大（錯誤）', description: 'A(4, 7)、B(3, 5)、C(3, 4)，容量 6，每個物品只有一個。同一個一維更新式，分別用 w 由大到小與由小到大執行，印出處理完每個物品後的整個 dp 陣列與答案。',
      output: 'down (0/1):\n  after A: 0 0 0 0 7 7 7\n  after B: 0 0 0 5 7 7 7\n  after C: 0 0 0 5 7 7 9\nanswer 9\nup (wrong for 0/1):\n  after A: 0 0 0 0 7 7 7\n  after B: 0 0 0 5 7 7 10\n  after C: 0 0 0 5 7 7 10\nanswer 10',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

const std::vector<std::string> names = {"A", "B", "C"};
const std::vector<int> wt = {4, 3, 3};
const std::vector<int> val = {7, 5, 4};
const int W = 6;

long long run(bool downward) {
    std::vector<long long> dp(W + 1, 0);
    for (int k = 0; k < static_cast<int>(names.size()); k++) {
        if (downward) {
            for (int w = W; w >= wt[k]; w--)            // 0/1：由大到小
                dp[w] = std::max(dp[w], dp[w - wt[k]] + val[k]);
        } else {
            for (int w = wt[k]; w <= W; w++)            // 由小到大（錯誤示範）
                dp[w] = std::max(dp[w], dp[w - wt[k]] + val[k]);
        }
        std::cout << "  after " << names[k] << ":";
        for (long long v : dp) std::cout << " " << v;
        std::cout << "\n";
    }
    return dp[W];
}

int main() {
    std::cout << "down (0/1):\n";
    long long down = run(true);
    std::cout << "answer " << down << "\n";
    std::cout << "up (wrong for 0/1):\n";
    long long up = run(false);
    std::cout << "answer " << up << "\n";
    return 0;
}`,
        Python: code`names = ["A", "B", "C"]
wt = [4, 3, 3]
val = [7, 5, 4]
W = 6


def run(downward):
    dp = [0] * (W + 1)
    for k in range(len(names)):
        if downward:
            ws = range(W, wt[k] - 1, -1)    # 0/1：由大到小
        else:
            ws = range(wt[k], W + 1)        # 由小到大（錯誤示範）
        for w in ws:
            dp[w] = max(dp[w], dp[w - wt[k]] + val[k])
        print("  after", names[k] + ":", *dp)
    return dp[W]


print("down (0/1):")
down = run(True)
print("answer", down)
print("up (wrong for 0/1):")
up = run(False)
print("answer", up)`,
        Java: code`public class Main {
    static final String[] NAMES = {"A", "B", "C"};
    static final int[] WT = {4, 3, 3};
    static final int[] VAL = {7, 5, 4};
    static final int W = 6;
    static StringBuilder out = new StringBuilder();

    static long run(boolean downward) {
        long[] dp = new long[W + 1];
        for (int k = 0; k < NAMES.length; k++) {
            if (downward) {
                for (int w = W; w >= WT[k]; w--)            // 0/1：由大到小
                    dp[w] = Math.max(dp[w], dp[w - WT[k]] + VAL[k]);
            } else {
                for (int w = WT[k]; w <= W; w++)            // 由小到大（錯誤示範）
                    dp[w] = Math.max(dp[w], dp[w - WT[k]] + VAL[k]);
            }
            out.append("  after ").append(NAMES[k]).append(':');
            for (long v : dp) out.append(' ').append(v);
            out.append('\n');
        }
        return dp[W];
    }

    public static void main(String[] args) {
        out.append("down (0/1):\n");
        long down = run(true);
        out.append("answer ").append(down).append('\n');
        out.append("up (wrong for 0/1):\n");
        long up = run(false);
        out.append("answer ").append(up);
        System.out.println(out);
    }
}`,
      },
    },
    {
      id: 'unbounded-coins', title: '無限背包：最少硬幣數與無限供應的最大價值', description: '面額 {1, 3, 4} 湊 0～6 的最少枚數與貪心對照；{3, 5} 湊 7（湊不出來）與湊 9；最後把 A(4, 7)、B(3, 5)、C(3, 4) 當成無限供應，求容量 6 的最大價值。迴圈都是 w（金額）由小到大。',
      output: 'coins 1 3 4: 0 1 2 1 1 2 2\namount 6: dp 2, greedy 3\ncoins 3 5, amount 7: -1\ncoins 3 5, amount 9: 3\nunbounded A B C, W 6: 10',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

const int INF = 1000000000;   // 「湊不出來」；INF + 1 仍不會溢位

std::vector<int> minCoins(const std::vector<int>& coins, int amount) {
    std::vector<int> dp(amount + 1, INF);
    dp[0] = 0;
    for (int c : coins) {
        for (int a = c; a <= amount; a++) {         // 無限：由小到大
            if (dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
        }
    }
    return dp;
}

int greedyCoins(std::vector<int> coins, int amount) {
    std::sort(coins.rbegin(), coins.rend());        // 面額由大到小
    int count = 0;
    for (int c : coins) {
        count += amount / c;
        amount %= c;
    }
    return amount == 0 ? count : -1;
}

int answer(const std::vector<int>& coins, int amount) {
    int best = minCoins(coins, amount)[amount];
    return best == INF ? -1 : best;
}

int main() {
    std::vector<int> dp = minCoins({1, 3, 4}, 6);
    std::cout << "coins 1 3 4:";
    for (int v : dp) std::cout << " " << v;
    std::cout << "\n";
    std::cout << "amount 6: dp " << dp[6] << ", greedy " << greedyCoins({1, 3, 4}, 6) << "\n";
    std::cout << "coins 3 5, amount 7: " << answer({3, 5}, 7) << "\n";
    std::cout << "coins 3 5, amount 9: " << answer({3, 5}, 9) << "\n";

    // 無限背包：每種物品可以拿很多次
    std::vector<int> wt = {4, 3, 3}, val = {7, 5, 4};
    int W = 6;
    std::vector<long long> best(W + 1, 0);
    for (int k = 0; k < 3; k++) {
        for (int w = wt[k]; w <= W; w++) best[w] = std::max(best[w], best[w - wt[k]] + val[k]);
    }
    std::cout << "unbounded A B C, W 6: " << best[W] << "\n";
    return 0;
}`,
        Python: code`INF = 10**9   # 「湊不出來」


def min_coins(coins, amount):
    dp = [0] + [INF] * amount
    for c in coins:
        for a in range(c, amount + 1):          # 無限：由小到大
            if dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return dp


def greedy_coins(coins, amount):
    count = 0
    for c in sorted(coins, reverse=True):       # 面額由大到小
        count += amount // c
        amount %= c
    return count if amount == 0 else -1


def answer(coins, amount):
    best = min_coins(coins, amount)[amount]
    return -1 if best == INF else best


dp = min_coins([1, 3, 4], 6)
print("coins 1 3 4:", *dp)
print(f"amount 6: dp {dp[6]}, greedy {greedy_coins([1, 3, 4], 6)}")
print("coins 3 5, amount 7:", answer([3, 5], 7))
print("coins 3 5, amount 9:", answer([3, 5], 9))

# 無限背包：每種物品可以拿很多次
wt, val, W = [4, 3, 3], [7, 5, 4], 6
best = [0] * (W + 1)
for k in range(3):
    for w in range(wt[k], W + 1):
        best[w] = max(best[w], best[w - wt[k]] + val[k])
print("unbounded A B C, W 6:", best[W])`,
        Java: code`import java.util.Arrays;

public class Main {
    static final int INF = 1000000000;   // 「湊不出來」；INF + 1 仍不會溢位

    static int[] minCoins(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, INF);
        dp[0] = 0;
        for (int c : coins) {
            for (int a = c; a <= amount; a++) {         // 無限：由小到大
                if (dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
            }
        }
        return dp;
    }

    static int greedyCoins(int[] coins, int amount) {
        int[] sorted = coins.clone();
        Arrays.sort(sorted);
        int count = 0;
        for (int k = sorted.length - 1; k >= 0; k--) {  // 面額由大到小
            count += amount / sorted[k];
            amount %= sorted[k];
        }
        return amount == 0 ? count : -1;
    }

    static int answer(int[] coins, int amount) {
        int best = minCoins(coins, amount)[amount];
        return best == INF ? -1 : best;
    }

    public static void main(String[] args) {
        StringBuilder out = new StringBuilder();
        int[] dp = minCoins(new int[] {1, 3, 4}, 6);
        out.append("coins 1 3 4:");
        for (int v : dp) out.append(' ').append(v);
        out.append('\n');
        out.append("amount 6: dp ").append(dp[6]).append(", greedy ").append(greedyCoins(new int[] {1, 3, 4}, 6)).append('\n');
        out.append("coins 3 5, amount 7: ").append(answer(new int[] {3, 5}, 7)).append('\n');
        out.append("coins 3 5, amount 9: ").append(answer(new int[] {3, 5}, 9)).append('\n');

        // 無限背包：每種物品可以拿很多次
        int[] wt = {4, 3, 3}, val = {7, 5, 4};
        int W = 6;
        long[] best = new long[W + 1];
        for (int k = 0; k < 3; k++) {
            for (int w = wt[k]; w <= W; w++) best[w] = Math.max(best[w], best[w - wt[k]] + val[k]);
        }
        out.append("unbounded A B C, W 6: ").append(best[W]);
        System.out.println(out);
    }
}`,
      },
    },
    {
      id: 'variations', title: '背包變形：子集合和、子集合個數與硬幣方法數', description: '同一個骨架換成布林、計數與取餘數的計數。子集合和與子集合個數每個數只能用一次（由大到小）；硬幣方法數面額無限（由小到大），最後一行湊 100000 的方法數有 23 位數，所以輸出除以 10^9 + 7 的餘數。',
      output: 'subset sum 9: yes\nsubset sum 30: no\nsubsets of 1..5 with sum 5: 3\nways 1 2 5 to 5: 4\nways 8 coins to 100000 mod 1e9+7: 836633026',
      code: {
        'C++': code`#include <iostream>
#include <vector>

const long long MOD = 1000000007;

bool subsetSum(const std::vector<int>& nums, int target) {
    std::vector<bool> can(target + 1, false);
    can[0] = true;                                  // 什麼都不選，和是 0
    for (int x : nums) {
        for (int s = target; s >= x; s--) {         // 每個數一次：由大到小
            if (can[s - x]) can[s] = true;
        }
    }
    return can[target];
}

long long countSubsets(const std::vector<int>& nums, int target) {
    std::vector<long long> cnt(target + 1, 0);
    cnt[0] = 1;
    for (int x : nums) {
        for (int s = target; s >= x; s--) cnt[s] += cnt[s - x];
    }
    return cnt[target];
}

long long countWays(const std::vector<int>& coins, int amount) {
    std::vector<long long> ways(amount + 1, 0);
    ways[0] = 1;
    for (int c : coins) {                           // 外層面額：不計順序
        for (int a = c; a <= amount; a++) {         // 面額無限：由小到大
            ways[a] = (ways[a] + ways[a - c]) % MOD;
        }
    }
    return ways[amount];
}

int main() {
    std::vector<int> nums = {3, 34, 4, 12, 5, 2};
    std::cout << "subset sum 9: " << (subsetSum(nums, 9) ? "yes" : "no") << "\n";
    std::cout << "subset sum 30: " << (subsetSum(nums, 30) ? "yes" : "no") << "\n";
    std::cout << "subsets of 1..5 with sum 5: " << countSubsets({1, 2, 3, 4, 5}, 5) << "\n";
    std::cout << "ways 1 2 5 to 5: " << countWays({1, 2, 5}, 5) << "\n";
    std::cout << "ways 8 coins to 100000 mod 1e9+7: "
              << countWays({1, 2, 5, 10, 20, 50, 100, 200}, 100000) << "\n";
    return 0;
}`,
        Python: code`MOD = 10**9 + 7


def subset_sum(nums, target):
    can = [True] + [False] * target         # 什麼都不選，和是 0
    for x in nums:
        for s in range(target, x - 1, -1):  # 每個數一次：由大到小
            if can[s - x]:
                can[s] = True
    return can[target]


def count_subsets(nums, target):
    cnt = [1] + [0] * target
    for x in nums:
        for s in range(target, x - 1, -1):
            cnt[s] += cnt[s - x]
    return cnt[target]


def count_ways(coins, amount):
    ways = [1] + [0] * amount
    for c in coins:                         # 外層面額：不計順序
        for a in range(c, amount + 1):      # 面額無限：由小到大
            ways[a] = (ways[a] + ways[a - c]) % MOD
    return ways[amount]


nums = [3, 34, 4, 12, 5, 2]
print("subset sum 9:", "yes" if subset_sum(nums, 9) else "no")
print("subset sum 30:", "yes" if subset_sum(nums, 30) else "no")
print("subsets of 1..5 with sum 5:", count_subsets([1, 2, 3, 4, 5], 5))
print("ways 1 2 5 to 5:", count_ways([1, 2, 5], 5))
print("ways 8 coins to 100000 mod 1e9+7:", count_ways([1, 2, 5, 10, 20, 50, 100, 200], 100000))`,
        Java: code`public class Main {
    static final long MOD = 1000000007L;

    static boolean subsetSum(int[] nums, int target) {
        boolean[] can = new boolean[target + 1];
        can[0] = true;                                  // 什麼都不選，和是 0
        for (int x : nums) {
            for (int s = target; s >= x; s--) {         // 每個數一次：由大到小
                if (can[s - x]) can[s] = true;
            }
        }
        return can[target];
    }

    static long countSubsets(int[] nums, int target) {
        long[] cnt = new long[target + 1];
        cnt[0] = 1;
        for (int x : nums) {
            for (int s = target; s >= x; s--) cnt[s] += cnt[s - x];
        }
        return cnt[target];
    }

    static long countWays(int[] coins, int amount) {
        long[] ways = new long[amount + 1];
        ways[0] = 1;
        for (int c : coins) {                           // 外層面額：不計順序
            for (int a = c; a <= amount; a++) {         // 面額無限：由小到大
                ways[a] = (ways[a] + ways[a - c]) % MOD;
            }
        }
        return ways[amount];
    }

    public static void main(String[] args) {
        int[] nums = {3, 34, 4, 12, 5, 2};
        StringBuilder out = new StringBuilder();
        out.append("subset sum 9: ").append(subsetSum(nums, 9) ? "yes" : "no").append('\n');
        out.append("subset sum 30: ").append(subsetSum(nums, 30) ? "yes" : "no").append('\n');
        out.append("subsets of 1..5 with sum 5: ").append(countSubsets(new int[] {1, 2, 3, 4, 5}, 5)).append('\n');
        out.append("ways 1 2 5 to 5: ").append(countWays(new int[] {1, 2, 5}, 5)).append('\n');
        out.append("ways 8 coins to 100000 mod 1e9+7: ")
           .append(countWays(new int[] {1, 2, 5, 10, 20, 50, 100, 200}, 100000));
        System.out.println(out);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'dp-table', title: '0/1 背包：A、B、C，容量 6 的二維表與倒推', language: 'Python',
    code: code`items = [("A", 4, 7), ("B", 3, 5), ("C", 3, 4)]
W, n = 6, len(items)
dp = [[0] * (W + 1) for _ in range(n + 1)]
for i in range(1, n + 1):
    _, wt, val = items[i - 1]
    for w in range(W + 1):
        dp[i][w] = dp[i - 1][w]
        if wt <= w:
            dp[i][w] = max(dp[i][w], dp[i - 1][w - wt] + val)
chosen, w = [], W
for i in range(n, 0, -1):
    if dp[i][w] != dp[i - 1][w]:
        chosen.append(items[i - 1][0])
        w -= items[i - 1][1]
print(dp[n][W], " ".join(reversed(chosen)), sep="\n")`,
    steps: traceSteps,
    tryIt: { algorithm: 'knapsack', items: TRACE_ITEMS, capacity: TRACE_W },
  },
  quiz: [
    {
      id: 'q-cell', prompt: '物品 P(重 1, 價值 1)、Q(3, 4)、R(4, 5)、S(5, 7)，`dp[i][w]` 是只用前 i 個物品、容量 w 的最大價值（0/1 背包）。`dp[3][5]` 是多少？',
      options: ['5', '6', '7', '9'],
      answer: 1,
      explanation: '`dp[3][5]` 只能用前 3 個物品 P、Q、R，容量 5：P + R 重 5、價值 6；P + Q 重 4、價值 5；R 單獨 5；Q + R 重 7 放不下。所以是 6。7 是 S 單獨的價值，但 S 是第 4 個，不在前 3 個之內；5 漏掉了 P + R 的組合；9 是 `dp[3][7]`（Q + R）。已用程式填表確認 `dp[3][5] = 6`。',
    },
    {
      id: 'q-walkback', prompt: '同一組物品 P(1, 1)、Q(3, 4)、R(4, 5)、S(5, 7)，容量改成 8，最佳價值是 11。照本課的倒推規則（`dp[i][w] ≠ dp[i − 1][w]` 才算拿了第 i 個），找出的是哪些物品？',
      options: ['Q 和 S', 'P、Q 和 R', 'P 和 S', 'R 和 S'],
      answer: 0,
      explanation: '從 (4, 8) 倒推：`dp[4][8] = 11 ≠ dp[3][8] = 10`，拿了 S，w = 3；`dp[3][3] = 4 = dp[2][3]`，R 沒拿；`dp[2][3] = 4 ≠ dp[1][3] = 1`，拿了 Q，w = 0；`dp[1][0] = 0 = dp[0][0]`，P 沒拿。Q + S 重 8、價值 11。P、Q、R 重 8 但價值只有 10（這是 `dp[3][8]`）；P + S 價值 8；R + S 重 9 超過容量。已用程式填表倒推，並以暴力列舉 16 個子集合確認最佳是 11。',
    },
    {
      id: 'q-direction', prompt: '每個物品只有一個（0/1 背包），但一維迴圈寫成由小到大。這段程式印出什麼？',
      code: { language: 'Python', text: 'wt = [4, 3, 3]\nval = [7, 5, 4]\nW = 6\ndp = [0] * (W + 1)\nfor k in range(3):\n    for w in range(wt[k], W + 1):\n        dp[w] = max(dp[w], dp[w - wt[k]] + val[k])\nprint(dp[W])' },
      options: ['9', '10', '14', '7'],
      answer: 1,
      explanation: 'w 由小到大時，`dp[w - wt]` 可能已經在這一輪更新過：處理第二個物品（重 3、價值 5）時，先得到 `dp[3] = 5`，再算 `dp[6] = dp[3] + 5 = 10`，等於同一個物品拿了兩次。這段程式算的其實是無限背包，印出 10（已執行確認）。9 是 0/1 背包的正確答案，要把迴圈改成 `range(W, wt[k] - 1, -1)`；14 是第一個物品拿兩次，但那要重 8，放不下；7 是只拿第一個物品的貪心結果。',
    },
    {
      id: 'q-greedy', prompt: '依「價值 / 重量」由大到小、放得下就放的貪心，在哪一組資料上得不到 0/1 背包的最佳解？（括號內是重量、價值）',
      options: [
        '(1, 2)、(2, 3)、(3, 4)，容量 3',
        '(1, 1)、(4, 7)、(3, 5)，容量 4',
        '(2, 4)、(2, 4)、(3, 5)，容量 4',
        '(5, 10)、(4, 7)、(4, 7)，容量 8',
      ],
      answer: 3,
      explanation: '第四組：(5, 10) 的比值 2 最高，貪心先拿它，剩下容量 3，兩個 (4, 7) 都放不下，總價值 10；但兩個 (4, 7) 剛好重 8、價值 14。其他三組貪心都剛好是最佳：第一組拿 (1, 2) 和 (2, 3) 得 5；第二組拿 (4, 7) 得 7；第三組拿兩個 (2, 4) 得 8。已用程式對四組分別執行貪心與暴力列舉確認。這也說明為什麼「找不到反例」不能證明貪心正確，背包要用動態規劃。',
    },
    {
      id: 'q-complexity', prompt: '一題 0/1 背包：n = 100，容量 W = 10^9，重量也到 10^9。下列敘述何者正確？',
      options: [
        'O(nW) 是多項式時間，W = 10^9 也很快',
        '改成一維陣列後時間變成 O(W)，就跑得完',
        '要約 10^11 次更新，一維陣列也要約 10^9 格（64 位元整數約 8 GB），不可行；要依其他範圍換狀態，例如價值總和很小時改用以價值為索引的 DP',
        '改用依「價值 / 重量」的貪心，因為資料很大時貪心一定正確',
      ],
      answer: 2,
      explanation: '背包 DP 的時間是 O(nW)，和 W 的「數值」成正比，是偽多項式時間：100 × 10^9 = 10^11 次更新遠超過一般題目的時間限制，10^9 格的陣列也放不進記憶體。一維優化只省空間，時間仍是 O(nW)，而且 O(W) 的空間本身就是 8 GB。貪心在 0/1 背包上不保證正確，和資料大小無關（上一題就是反例）。正確的方向是看哪個範圍小：價值總和小就改用 `dp[v]` = 最小重量，n ≤ 20 就列舉子集合。',
    },
    {
      id: 'q-bug-check', prompt: '這段 0/1 背包少了 `if wt <= w` 的判斷。用 Python 執行會怎樣？',
      code: { language: 'Python', text: 'items = [(4, 7), (3, 5), (3, 4)]\nW = 6\ndp = [[0] * (W + 1) for _ in range(len(items) + 1)]\nfor i in range(1, len(items) + 1):\n    wt, val = items[i - 1]\n    for w in range(W + 1):\n        dp[i][w] = max(dp[i - 1][w], dp[i - 1][w - wt] + val)\nprint(dp[len(items)][W])' },
      options: ['印出 9', '印出 16', '丟出 IndexError', '印出 10'],
      answer: 1,
      explanation: 'w < wt 時 `w - wt` 是負數，Python 的負索引不會報錯，而是讀到這一列的尾端：例如 `dp[0][0 - 4]` 就是 `dp[0][3]`。結果第 1 列每格都變成 7（連容量 0 都「裝下」了 A），第 2 列都是 12，第 3 列都是 16，印出 16（已執行確認）。不會丟出 IndexError，因為 −1 到 −7 都是合法的負索引；9 是加上判斷後的正確答案；10 是無限背包的答案。這種錯誤特別危險，因為答案「看起來更好」而不是當掉。',
    },
    {
      id: 'q-same-row', prompt: '想寫 0/1 背包的二維表，卻把「拿」的轉移寫成 `dp[i][w - wt] + val`（讀同一列）。對物品 A(4, 7)、B(3, 5)、C(3, 4)、容量 6，`dp[3][6]` 會是多少，代表什麼？',
      code: { language: 'Python', text: 'for i in range(1, n + 1):\n    wt, val = items[i - 1]\n    for w in range(W + 1):\n        dp[i][w] = dp[i - 1][w]\n        if wt <= w:\n            dp[i][w] = max(dp[i][w], dp[i][w - wt] + val)' },
      options: ['9，和正確的 0/1 背包一樣', '10，因為同一列的格子已經可能拿過第 i 個，算成了無限背包', '7，只會拿到 A', '0，因為同一列還沒填'],
      answer: 1,
      explanation: '`dp[i][w - wt]` 是同一列、比 w 小的格子，w 由小到大填時它已經算好，而且可能已經拿了第 i 個；再加一次 `val` 就讓第 i 個被拿第二次。處理 B 時 `dp[2][3] = 5`、`dp[2][6] = dp[2][3] + 5 = 10`（B + B），最後 `dp[3][6] = 10`（已執行確認）。這正是無限背包的轉移；0/1 背包必須讀上一列 `dp[i - 1][w - wt]`。同一列不是空的（w 由小到大時左邊已填好），所以不是 0；A 之後還有更好的組合，所以不是 7。',
    },
  ],
  exercises: [
    {
      id: 'e-knapsack', title: '0/1 背包的最大價值',
      statement: '有 n 個物品，第 i 個物品重 `w_i`、價值 `v_i`，每個物品只有一個。背包容量是 W，請挑選一些物品放進背包，總重量不超過 W，輸出能得到的最大總價值（可以一個都不拿，價值為 0）。請用一維陣列的 0/1 背包 DP：對每個物品，容量由大到小更新。價值總和可能超過 2^31，C++ 請用 `long long`、Java 請用 `long`。輸入不合法時（n 或 W 是負數、某個物品的重量 ≤ 0 或價值是負數、物品的數字個數和 n 不符），只輸出一行 `Invalid`。',
      inputFormat: '第一行兩個整數 n、W。接下來 n 行，每行兩個整數 `w_i`、`v_i`。',
      outputFormat: '一行，最大總價值；輸入不合法時輸出 `Invalid`。',
      constraints: ['0 ≤ n ≤ 100', '0 ≤ W ≤ 10^5', '1 ≤ w_i ≤ 10^5（可以比 W 大，那就放不進去）', '0 ≤ v_i ≤ 10^9；答案最大約 10^11，需要 64 位元整數', '不合法：n < 0、W < 0、某個 w_i ≤ 0、某個 v_i < 0，或物品的數字個數不是 2n，輸出 Invalid'],
      samples: [
        { kind: 'normal', input: '3 6\n4 7\n3 5\n3 4', output: '9', note: '拿重 3 的兩個物品：5 + 4 = 9；依 CP 值先拿重 4 的只得到 7' },
        { kind: 'normal', input: '4 7\n1 1\n3 4\n4 5\n5 7', output: '9', note: '重 3 與重 4 的物品：4 + 5 = 9' },
      ],
      tests: [
        { kind: 'normal', input: '3 6\n4 7\n3 5\n3 4', output: '9', note: '範例：貪心得 7；由小到大的錯誤迴圈會得 10' },
        { kind: 'normal', input: '4 7\n1 1\n3 4\n4 5\n5 7', output: '9', note: '範例：貪心得 8' },
        { kind: 'normal', input: '4 8\n1 1\n3 4\n4 5\n5 7', output: '11', note: '容量加 1，最佳組合整個換掉（重 3 與重 5）' },
        { kind: 'normal', input: '3 8\n5 10\n4 7\n4 7', output: '14', note: '貪心先拿 CP 值 2 的物品只得 10；兩個重 4 的剛好裝滿' },
        { kind: 'normal', input: '12 40\n3 15\n11 57\n6 30\n4 62\n11 63\n3 61\n5 58\n15 33\n4 32\n15 88\n2 41\n9 86', output: '403', note: '隨機 12 個物品，已用 2^12 個子集合的暴力法確認' },
        { kind: 'normal', input: '15 60\n6 929801944\n8 181492580\n8 214990713\n12 617984779\n17 216755727\n16 232031511\n10 284537106\n1 368018223\n13 236696220\n13 577562818\n12 637225568\n19 565578235\n9 886404948\n9 644170094\n10 592544397', output: '4676149953', note: '隨機 15 個物品、價值近 10^9，答案超過 2^32；已用 2^15 個子集合的暴力法確認' },
        { kind: 'edge', input: '3 0\n1 5\n2 6\n3 7', output: '0', note: 'W = 0：什麼都放不下' },
        { kind: 'edge', input: '3 4\n5 10\n6 20\n7 30', output: '0', note: '每個物品都比背包重' },
        { kind: 'edge', input: '3 100\n10 3\n20 4\n30 5', output: '12', note: '全部都放得下：答案是價值總和' },
        { kind: 'edge', input: '1 5\n5 9', output: '9', note: 'n = 1，重量剛好等於 W（邊界 `w >= wt` 要包含等號）' },
        { kind: 'edge', input: '1 4\n5 9', output: '0', note: 'n = 1，差一點放不下' },
        { kind: 'edge', input: '0 10', output: '0', note: 'n = 0：沒有物品' },
        { kind: 'edge', input: '2 6\n2 3\n2 3', output: '6', note: '兩個一模一樣的物品：各拿一次得 6；由小到大的錯誤迴圈會拿三次得 9' },
        { kind: 'edge', input: '3 5\n2 3\n2 3\n2 3', output: '6', note: '三個相同的物品，容量只夠兩個' },
        { kind: 'edge', input: '4 10\n5 0\n4 0\n3 1\n2 0', output: '1', note: '價值為 0 的物品' },
        { kind: 'edge', input: '3 3\n1 1000000000\n1 1000000000\n1 1000000000', output: '3000000000', note: '溢位陷阱：總和 3×10^9 超過 32 位元整數' },
        { kind: 'edge', input: '4 5\n3 1000000000\n2 999999999\n4 1000000000\n1 999999999', output: '1999999999', note: '兩種組合同分（重 3 + 2 與重 4 + 1）' },
        { kind: 'edge', input: BIG_ALL_FIT, output: '100000000000', note: '最大規模：100 個物品剛好全部裝滿，答案 10^11（測資由程式產生）' },
        { kind: 'edge', input: BIG_SMALL_WEIGHTS, output: '44443558252', note: '最大規模：n = 100、W = 10^5，重量 1～2000、總重略超過 W（測資由程式產生，O(nW) 約 10^7）' },
        { kind: 'edge', input: BIG_LARGE_WEIGHTS, output: '7262199487', note: '最大規模：重量 1～10^5，只有少數物品放得下（測資由程式產生）' },
        { kind: 'error', input: '3 -1\n1 1\n2 2\n3 3', output: 'Invalid', note: 'W < 0' },
        { kind: 'error', input: '2 5\n0 4\n2 3', output: 'Invalid', note: '重量為 0' },
        { kind: 'error', input: '2 5\n-2 4\n2 3', output: 'Invalid', note: '重量為負數' },
        { kind: 'error', input: '2 5\n1 -4\n2 3', output: 'Invalid', note: '價值為負數' },
        { kind: 'error', input: '3 5\n1 1\n2 2', output: 'Invalid', note: '說有 3 個物品，只給了 2 個' },
        { kind: 'error', input: '2 5\n1 1\n2 2\n3 3', output: 'Invalid', note: '說有 2 個物品，卻給了 3 個' },
        { kind: 'error', input: '-1 5', output: 'Invalid', note: 'n < 0' },
      ],
      hints: [
        '先把所有數字讀進來，檢查個數是不是 2 + 2n，再檢查 W、每個重量與價值；全部合法才開始 DP。',
        '`dp[w]` = 容量 w 以內的最大價值，一開始全是 0。對每個物品 (wt, val)：w 從 W 往下到 wt，`dp[w] = max(dp[w], dp[w - wt] + val)`。由大到小保證 `dp[w - wt]` 還是「沒拿這個物品」時的值。',
        '答案是 `dp[W]`。用「兩個一模一樣的物品」和「價值 10^9 的物品」測試自己的程式：前者抓迴圈方向，後者抓溢位。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<long long> data;
    long long x;
    while (std::cin >> x) data.push_back(x);
    if (data.size() < 2) {
        std::cout << "Invalid\n";
        return 0;
    }
    long long n = data[0], cap = data[1];
    long long rest = static_cast<long long>(data.size()) - 2;
    if (n < 0 || cap < 0 || rest % 2 != 0 || rest / 2 != n) {
        std::cout << "Invalid\n";
        return 0;
    }
    for (long long k = 0; k < n; k++) {
        if (data[2 + 2 * k] <= 0 || data[3 + 2 * k] < 0) {
            std::cout << "Invalid\n";
            return 0;
        }
    }
    std::vector<long long> dp(cap + 1, 0);       // dp[w]：容量 w 以內的最大價值
    for (long long k = 0; k < n; k++) {
        long long wt = data[2 + 2 * k], val = data[3 + 2 * k];
        for (long long w = cap; w >= wt; w--) {   // 0/1：由大到小
            dp[w] = std::max(dp[w], dp[w - wt] + val);
        }
    }
    std::cout << dp[cap] << "\n";
    return 0;
}`,
        Python: code`import sys


def main():
    data = sys.stdin.read().split()
    if len(data) < 2:
        print("Invalid")
        return
    n, cap = int(data[0]), int(data[1])
    if n < 0 or cap < 0 or len(data) != 2 + 2 * n:
        print("Invalid")
        return
    items = [(int(data[2 + 2 * k]), int(data[3 + 2 * k])) for k in range(n)]
    if any(wt <= 0 or val < 0 for wt, val in items):
        print("Invalid")
        return
    dp = [0] * (cap + 1)                      # dp[w]：容量 w 以內的最大價值
    for wt, val in items:
        for w in range(cap, wt - 1, -1):      # 0/1：由大到小
            cand = dp[w - wt] + val
            if cand > dp[w]:
                dp[w] = cand
    print(dp[cap])


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<Long> data = new ArrayList<>();
        String line;
        while ((line = in.readLine()) != null) {
            StringTokenizer st = new StringTokenizer(line);
            while (st.hasMoreTokens()) data.add(Long.parseLong(st.nextToken()));
        }
        if (data.size() < 2) {
            System.out.println("Invalid");
            return;
        }
        long n = data.get(0), cap = data.get(1);
        long rest = data.size() - 2;
        if (n < 0 || cap < 0 || rest % 2 != 0 || rest / 2 != n) {
            System.out.println("Invalid");
            return;
        }
        int count = (int) n;
        long[] wt = new long[count], val = new long[count];
        for (int k = 0; k < count; k++) {
            wt[k] = data.get(2 + 2 * k);
            val[k] = data.get(3 + 2 * k);
            if (wt[k] <= 0 || val[k] < 0) {
                System.out.println("Invalid");
                return;
            }
        }
        long[] dp = new long[(int) cap + 1];          // dp[w]：容量 w 以內的最大價值
        for (int k = 0; k < count; k++) {
            for (int w = (int) cap; w >= wt[k]; w--) { // 0/1：由大到小
                dp[w] = Math.max(dp[w], dp[w - (int) wt[k]] + val[k]);
            }
        }
        System.out.println(dp[(int) cap]);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

import type { LessonContent, TraceStep } from '../schema';
import { quickSortSteps } from '../simulate-algorithms';

const code = String.raw;

/** The traced input: six distinct values, so the first pivot (4) splits them 3 + 2 and the recursion goes two levels deep. */
const traceInput = [3, 6, 2, 5, 1, 4];

/**
 * The quick-sort trace. quickSortSteps runs the same Lomuto partition as the trace code (pivot = a[hi], strict `<`,
 * recursion on [lo, i − 1] then [i + 1, hi], ranges of length ≤ 1 return at once); its events map to the lines below.
 * A first step (line 14) is added by hand; compare steps that swap point at the swap line (8), and every 'place' step
 * gets a note naming the two recursive calls that follow (lines 11–12), including the ones that return immediately.
 */
const quickTrace: TraceStep[] = [
  { line: 14, note: '準備排序 `a = [3, 6, 2, 5, 1, 4]`，呼叫 `quick_sort(a, 0, 5)` 處理整個陣列。每一次分割都會把一個 pivot 放到最終位置（標成「找到」），再遞迴處理它左右兩段。',
    arrays: [{ name: 'a', cells: traceInput.map(String), range: { from: 0, to: traceInput.length - 1, label: '待排序' } }], vars: { n: String(traceInput.length) } },
  ...quickSortSteps(traceInput, { pivot: 4, compare: 7, place: 10, result: 15 }).map(step => {
    if (step.note.includes('換到左邊')) return { ...step, line: 8 };
    const placed = /^把 pivot -?\d+ 換到索引 (\d+)/.exec(step.note);
    const range = step.arrays?.[0]?.range;
    if (placed && range) {
      const p = Number(placed[1]);
      const call = (lo: number, hi: number) => hi <= lo
        ? `\`quick_sort(a, ${lo}, ${hi})\`（${hi < lo ? '空區間' : '只有一個元素'}，第 2 行 \`lo >= hi\` 直接 return）`
        : `\`quick_sort(a, ${lo}, ${hi})\``;
      return { ...step, note: `${step.note}接著第 11、12 行遞迴：先 ${call(range.from, p - 1)}，再 ${call(p + 1, range.to)}。` };
    }
    return step;
  }),
];

/** Exercise worst-case tests: n = 2 × 10^5 random values (fixed LCG), all equal values, and already sorted values. */
const BIG = 200000;
const bigRandomValues = (() => {
  let seed = 20261031;
  return Array.from({ length: BIG }, () => { seed = (seed * 48271) % 2147483647; return (seed % 2000000001) - 1000000000; });
})();
const bigRandomK = 100000;
const bigRandomInput = `${BIG} ${bigRandomK}\n${bigRandomValues.join(' ')}`;
const bigRandomOutput = String([...bigRandomValues].sort((x, y) => x - y)[bigRandomK - 1]);
const bigEqualInput = `${BIG} 150000\n${Array.from({ length: BIG }, () => '7').join(' ')}`;
const bigSortedInput = `${BIG} 123457\n${Array.from({ length: BIG }, (_, i) => String(i + 1)).join(' ')}`;

/**
 * A07 Quick Sort. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); Math.random has no seed, so the exercise uses the lesson's fixed-seed LCG.
 */
export const A07: LessonContent = {
  lessonId: 'A07',
  motivation: '合併排序（A06）保證 O(n log n)，但需要 O(n) 的額外陣列。快速排序（quick sort）用另一種分治：先挑一個基準值（pivot），把比它小的搬到左邊、其他的搬到右邊，pivot 就落在最終位置，再分別處理兩邊——全部在原陣列上完成，不需要合併。它平均是 O(n log n)、常數小、對快取友善，所以 C++ `std::sort` 與 Java 基本型別的 `Arrays.sort` 都以快速排序為核心。分割（partition）本身也是很有用的工具：只遞迴需要的那一邊，就能平均 O(n) 找到第 k 小的數（快速選擇，quickselect）。它的限制同樣重要：pivot 選得不好時會退化成 O(n²)，例如「已經排好的資料」配上「固定選最後一個」；遞迴可能深到 n 層而堆疊溢位；而且它不是穩定排序。本課學會寫出邊界正確的分割、分析平均與最差情況、用隨機化與「先遞迴小的一邊」避開風險，並判斷何時該選合併排序或函式庫排序。',
  sections: [
    {
      id: 'idea', title: '核心想法：選基準、分割、兩邊各自遞迴',
      blocks: [
        { type: 'p', text: '快速排序處理一個區間 `a[lo..hi]` 時，先選一個基準值 pivot，然後分割：把小於 pivot 的元素都搬到左邊、大於等於 pivot 的搬到右邊，pivot 本身放在兩段中間的位置 p。分割完成後，左邊每個值都比 pivot 小、右邊每個值都不比它小，所以排序後 pivot 一定就在 p——它已經在最終位置，之後再也不會移動。' },
        { type: 'list', ordered: true, items: [
          '基本情況（base case）：區間長度 ≤ 1（`lo >= hi`）時已經排好，直接結束。',
          '選 pivot：本課的程式選最後一個元素 `a[hi]`（之後會看到它的風險與改進）。',
          '分割：重新排列 `a[lo..hi]`，回傳 pivot 最後的位置 p。',
          '遞迴排序左段 `a[lo..p−1]`。',
          '遞迴排序右段 `a[p+1..hi]`。兩段排好後整個區間就排好了，不需要合併步驟。',
        ] },
        { type: 'p', text: '為什麼這樣一定正確？用歸納法（induction）想：假設較短的區間都能被正確排序。分割後左段的值全部 < pivot、右段的值全部 ≥ pivot，而兩段都比原區間短（至少少了 pivot 一個），所以都能排好；「排好的左段 + pivot + 排好的右段」自然是由小到大。每次遞迴的區間都嚴格變短，所以一定會走到長度 ≤ 1 的基本情況而結束。' },
        { type: 'p', text: '和合併排序對照：兩者都是分治（divide and conquer），但工作做在不同時間點。合併排序「切」很簡單（從中間切），真正的工作在遞迴之後的合併；快速排序的工作在遞迴之前的分割，遞迴回來後什麼都不用做。代價是：合併排序永遠從中間切、兩半一樣大，快速排序切在哪裡則取決於 pivot 的值——pivot 太大或太小，兩段就很不平均，這正是快速排序最差情況的來源。' },
        { type: 'callout', tone: 'note', title: '分割後「左右兩段內部」還沒排好', text: '分割只保證 pivot 在最終位置、左段都比它小、右段都不比它小；兩段內部的順序仍是亂的。例如 `[7, 2, 9, 4, 3, 8, 5]` 以 5 分割後是 `[2, 4, 3, 5, 9, 8, 7]`：5 已經在索引 3，但 `2 4 3` 與 `9 8 7` 都還要再遞迴排序。' },
      ],
    },
    {
      id: 'lomuto', title: 'Lomuto 分割：用 i 劃出「小於 pivot」的區域',
      blocks: [
        { type: 'p', text: '最容易寫對的分割法是 Lomuto 分割（Lomuto partition）：`pivot = a[hi]`，`i = lo`；j 從 lo 掃到 hi − 1，每遇到 `a[j] < pivot`，就把 `a[j]` 和 `a[i]` 交換、`i` 加一；最後把 pivot 換到 `a[i]`，回傳 i。掃描過程中一直維持這個迴圈不變量（loop invariant）：' },
        { type: 'list', items: [
          '`a[lo..i−1]`：都 < pivot（「小區」）。',
          '`a[i..j−1]`：都 ≥ pivot（「大區」）。',
          '`a[j..hi−1]`：還沒檢查。`a[hi]`：pivot 自己。',
          '遇到 `a[j] < pivot` 時，`a[i]` 是大區的第一個元素（或 i == j 時就是 `a[j]` 自己），和 `a[j]` 交換後小區多一格、大區整體往右挪一格，不變量仍然成立。迴圈結束時 j = hi，交換 `a[i]` 和 `a[hi]` 就把 pivot 放到兩區中間。',
        ] },
        { type: 'p', text: '下面把 `[7, 2, 9, 4, 3, 8, 5]` 的一次分割逐步印出來。pivot 是 5；小於 5 的有 2、4、3 三個，所以 pivot 最後一定在索引 3。注意 j = 1 時 `i = 0`，交換的是 `a[0] = 7` 和 `a[1] = 2`：7 被換到後面，這種遠距離交換就是快速排序不穩定的原因。' },
        { type: 'example', id: 'ex-lomuto-partition' },
        { type: 'p', text: '長度 m 的區間做一次 Lomuto 分割，`a[j] < pivot` 恰好比較 m − 1 次，交換最多 m 次，額外空間 O(1)。下方視覺化用同一個 Lomuto 分割排序 `[3, 6, 2, 5, 1, 4]`：可以看到 i 和 j 怎麼移動、每次分割後 pivot 落在哪裡，以及長度 ≤ 1 的區間直接返回。「自己試試看」可以輸入自己的數字，試試看 `1 2 3 4 5 6` 這種已排序的輸入：每次分割都只放好最後一個元素、剩下的全部擠在左邊。' },
        { type: 'p', text: '另一種常見的寫法是 Hoare 分割（Hoare partition）：兩個指標從區間兩端往中間走，左指標停在 ≥ pivot 的值、右指標停在 ≤ pivot 的值，兩者交換，直到指標交錯。它的交換次數通常比 Lomuto 少，遇到大量相等的值時兩個指標都會停下來交換，分割仍能落在中間附近；但分割完 pivot 不一定在最終位置，遞迴的範圍要寫成 `[lo, j]` 與 `[j + 1, hi]`，邊界更容易寫錯。本課的程式都用 Lomuto，因為它的不變量最容易說清楚。' },
        { type: 'callout', tone: 'warning', title: '三個邊界一個都不能錯', text: '一、遞迴範圍是 `[lo, i − 1]` 和 `[i + 1, hi]`，pivot 所在的 i 要排除。寫成 `quick_sort(a, lo, i)` 時，只要 pivot 是區間最大值（i == hi），下一層又是同一個區間，無窮遞迴：Python 丟出 `RecursionError`，C++、Java 會堆疊溢位（stack overflow），JavaScript 丟出 `RangeError: Maximum call stack size exceeded`。二、基本情況要寫 `lo >= hi`，不能只寫 `lo == hi`：pivot 是最小值時 `[lo, i − 1]` 是空區間（hi = lo − 1）。三、迴圈是 `for j in range(lo, hi)`，不含 hi。若再把條件改成 `a[j] <= pivot` 並讓 j 跑到 hi，pivot 會被自己換進小區，i 跑到 hi + 1：對 `[1, 2, 3]` 會讀 `a[3]`（Python 丟出 `IndexError`，C++ 是未定義行為；JavaScript 不報錯，讀到 `undefined` 並把它換進陣列，得到 `[1, 2, undefined, 3]`）。' },
      ],
    },
    {
      id: 'analysis', title: '效率分析：平均 O(n log n)、最差 O(n²)，以及遞迴深度',
      blocks: [
        { type: 'p', text: '把遞迴畫成一棵樹：同一層的區間互不重疊，總長度最多 n，所以每一層的分割合計最多約 n 次比較。總成本 = 層數 × n。如果每次 pivot 都把區間分成差不多的兩半，層數約 log₂ n，總共 O(n log n)。其實不必剛好對半：就算每次都是 1 : 9 的比例，層數也只是 log 以 10/9 為底的 n，仍是 O(log n) 層、O(n log n)。' },
        { type: 'p', text: '最差情況是 pivot 每次都是區間的最小值或最大值：分割後一邊是空的，另一邊只少了一個元素，區間長度依序是 n、n − 1、n − 2…，比較次數 (n − 1) + (n − 2) + … + 1 = n(n − 1)/2，是 O(n²)。用「最後一個元素當 pivot」時，下面三種很常見的輸入都會踩到：由小到大已經排好（pivot 每次是最大值）、由大到小（pivot 交替是最小、最大值）、全部相等（`a[j] < pivot` 永遠不成立，所有元素都留在 pivot 的右邊）。' },
        { type: 'p', text: '下面的範例對 n = 1000 數比較次數，並記錄最深的遞迴層數。程式已經用了「遞迴較小的一邊、較大的一邊用迴圈繼續」的寫法（後面說明），所以已排序的輸入深度只有 1；但比較次數不受影響：已排序與全部相等都剛好是 n(n − 1)/2 = 499500 次，是隨機輸入（10850 次）的約 46 倍。最後一行對同一份已排序的輸入改用隨機 pivot，比較次數立刻回到 11215 次。隨機數用同一個線性同餘產生器（`seed = seed * 48271 % 2147483647`），四種語言的結果完全相同。' },
        { type: 'example', id: 'ex-compare-count' },
        { type: 'list', items: [
          '平均情況：輸入是隨機排列（或 pivot 隨機選）時，期望比較次數約 2n ln n ≈ 1.39 n log₂ n，n = 1000 時約 1.1 × 10^4 次，和範例的 10850、11215 相符。',
          '隨機化 pivot（randomized pivot）：每次先從 `a[lo..hi]` 隨機挑一個和 `a[hi]` 交換再分割。這樣「哪種輸入最慢」不再由資料決定：對任何輸入，期望時間都是 O(n log n)。最差 O(n²) 理論上仍然可能，只是要連續很多次都抽到極端值，機率極小。另一種常見做法是三數取中（median-of-three）：取開頭、中間、結尾三個值的中位數當 pivot，已排序的輸入就不會退化，但仍可能被刻意構造的輸入打敗。',
          '大量重複值：隨機 pivot 救不了「全部相等」——不管抽到哪個，`<` 都把其他元素全部丟到同一邊（範例的寫法換成隨機 pivot 後，1000 個 7 仍是 499500 次）。解法是三路分割（three-way partition），把區間分成 < pivot、= pivot、> pivot 三段，等於 pivot 的整段不再遞迴；或改用 Hoare 分割。',
          '遞迴深度與空間：快速排序是原地排序（in-place），額外空間只有遞迴的呼叫堆疊——平均 O(log n) 層，最差 O(n) 層。Python 預設的遞迴上限約 1000 層，用最基本的遞迴寫法排 1000 個已排好的數（每層只少一個元素，深度約 1000）就會 `RecursionError`；C++、Java、JavaScript 在 n 很大時也會堆疊溢位。解法是先遞迴「較小的那一邊」，較大的一邊用 while 迴圈繼續處理：每次遞迴的區間最多是原來的一半，深度保證 ≤ log₂ n。',
          '整數範圍：比較次數最多 n(n − 1)/2，n = 10^5 時約 5 × 10^9，超過 C++ / Java `int` 的上限 2^31 − 1，計數器要用 `long long` / `long`；Python 的整數不會溢位；JavaScript 的 number 在 2^53（約 9 × 10^15）以內都是精確整數，直接計數即可。計算中間索引時用 `lo + (hi - lo) / 2`，避免 `lo + hi` 在很大的索引時溢位；JavaScript 的 `/` 會保留小數，要寫 `Math.floor((lo + hi) / 2)`。',
        ] },
        { type: 'table', head: ['情況（最後一個元素當 pivot）', '每次分割', '比較次數', '遞迴深度（基本寫法）'], rows: [
          ['隨機排列', '大致平均', '約 1.39 n log₂ n，O(n log n)', '平均 O(log n)'],
          ['已排序、反序', '一邊空、一邊少一個', 'n(n − 1)/2，O(n²)', 'n 層'],
          ['全部相等（`<` 分割）', '全部在右邊', 'n(n − 1)/2，O(n²)', 'n 層'],
          ['任何輸入 + 隨機 pivot', '期望上大致平均', '期望 O(n log n)', '期望 O(log n)'],
          ['先遞迴較小的一邊', '（不影響分割）', '（不影響比較次數）', '保證 ≤ log₂ n'],
        ] },
      ],
    },
    {
      id: 'compare', title: '穩定性、和合併排序比較，以及函式庫怎麼做',
      blocks: [
        { type: 'p', text: '快速排序不穩定（not stable）。分割時的交換是遠距離的，會把一個元素直接「跳過」和它相等的元素。用分數排序 `(1,a) (2,b) (1,c) (2,d)`：第一次以 `(2,d)` 為 pivot，`(1,a)`、`(1,c)` 換到左邊後，pivot 和 `(2,b)` 交換，得到 `(1,a) (1,c) (2,d) (2,b)`；左段再以 `(1,c)` 為 pivot 分割，`(1,c)` 和 `(1,a)` 對調。最後是 `(1,c) (1,a) (2,d) (2,b)`，兩組同分的先後都反了（隨堂測驗有完整程式）。' },
        { type: 'table', head: ['', '平均', '最差', '額外空間', '穩定', '說明'], rows: [
          ['快速排序', 'O(n log n)', 'O(n²)', 'O(log n) 遞迴堆疊（先遞迴小的一邊）', '否', '原地、常數小，實務上通常最快'],
          ['合併排序（A06）', 'O(n log n)', 'O(n log n)', 'O(n) 暫存陣列', '是', '保證最差情況，也適合鏈結串列與外部排序'],
          ['堆積排序（heap sort）', 'O(n log n)', 'O(n log n)', 'O(1)', '否', '用 D15 的堆積：建堆後反覆取出最大值，保證最差情況但通常比快速排序慢'],
        ] },
        { type: 'list', items: [
          'C++17：`std::sort` 保證 O(n log n) 次比較，常見實作（例如 GCC 的 libstdc++）是內省排序（introsort）：以快速排序為主，遞迴太深時改用堆積排序，保證不會退化，小區段再用插入排序收尾。它不穩定；要穩定用 `std::stable_sort`。',
          'Java 17：基本型別陣列 `Arrays.sort(int[])` 用雙軸快速排序（dual-pivot quicksort，一次用兩個 pivot 分成三段）；物件的 `Arrays.sort(T[])`、`List.sort` 用穩定的 TimSort。',
          'Python 3：`sorted` 與 `list.sort` 用 TimSort 系列（合併排序加插入排序的混合），保證穩定與 O(n log n)，完全不用快速排序。',
          'JavaScript（Node.js）：`arr.sort(cmp)` 在 V8 引擎中用 TimSort，ES2019 起保證穩定，也不用快速排序；排數字一定要給比較函式 `(a, b) => a - b`。',
        ] },
        { type: 'p', text: '怎麼選？需要穩定（例如同分要維持原本的順序）、或一定要保證最差 O(n log n)、或排的是鏈結串列時，選合併排序；記憶體很吃緊、只要平均夠快時，快速排序（配上隨機 pivot）很合適；只需要第 k 小或前 k 小時，不必整個排好，用下一節的快速選擇或 D15 的堆積。' },
        { type: 'callout', tone: 'tip', title: '實作題直接用函式庫排序', text: '自己寫快速排序最容易錯在邊界與退化，函式庫已經處理好了。只有題目問的是分割本身（例如「分割後陣列長怎樣」「pivot 落在哪裡」）、要求第 k 小、或要計算排序過程中的量時，才需要自己寫分割。' },
      ],
    },
    {
      id: 'quickselect', title: '快速選擇：只遞迴答案所在的那一邊',
      blocks: [
        { type: 'p', text: '想找第 k 小的數（k 從 1 算起，排序後的 `a[k − 1]`），不必把整個陣列排好。分割後 pivot 在索引 p：若 p == k − 1，pivot 就是答案；若 k − 1 < p，答案在左段，右段可以整段丟掉；否則答案在右段，丟掉左段。這叫快速選擇（quickselect）。每次只處理一邊，平均情況下區間長度大約 n、n/2、n/4…，總共約 2n，所以平均 O(n)；最差情況和快速排序一樣是 O(n²)（pivot 每次都是極端值）。' },
        { type: 'p', text: '下面的範例用固定的規則「取區間中間的元素當 pivot」（先和 `a[hi]` 交換，再做同樣的 Lomuto 分割），所以每次執行結果都一樣。陣列有兩個 4，第 3 小與第 4 小都是 4：答案是排序後那個位置的「值」，相等的值會占多個位置。最後一行印出排序結果對照。' },
        { type: 'example', id: 'ex-quickselect' },
        { type: 'list', items: [
          'C++：`std::nth_element(v.begin(), v.begin() + (k - 1), v.end())` 會把第 k 小放到正確位置，標準規定平均是線性時間。',
          'Python：沒有內建的快速選擇；`sorted(a)[k - 1]` 是 O(n log n)，`heapq.nsmallest(k, a)[-1]` 約 O(n log k)，也可以自己寫快速選擇。',
          'Java：沒有內建的快速選擇；`Arrays.sort` 後取 `a[k - 1]` 是 O(n log n)，或自己寫快速選擇。',
          'JavaScript：沒有內建的快速選擇；`a.slice().sort((x, y) => x - y)[k - 1]` 是 O(n log n)，或自己寫快速選擇。',
          '本課的練習題 n 最大 2 × 10^5，而且測資刻意包含「已排序」與「全部相等」：固定選最後一個當 pivot、或只用 `<` 的兩路分割，都會退化成約 2 × 10^10 次比較。要同時用隨機 pivot 和三路分割。',
        ] },
        { type: 'callout', tone: 'warning', title: '第 k 小是索引 k − 1', text: '題目的 k 從 1 開始，陣列索引從 0 開始：比較 p 時要和 `k - 1` 比。少減 1 會得到第 k + 1 小；k = n 時目標索引 n 根本不存在，區間最後變成空的，接著就讀到陣列範圍外。k 不在 1..n 時要先檢查，不能交給快速選擇處理。' },
      ],
    },
  ],
  examples: [
    {
      id: 'ex-lomuto-partition', title: 'Lomuto 分割的每一步',
      description: '對 `[7, 2, 9, 4, 3, 8, 5]` 以最後一個元素 5 為 pivot 做一次分割：每個 j 印出比較結果，`a[j] < 5` 時印出交換後的陣列；最後把 pivot 換到 `a[3]`，左段 `2 4 3` 都小於 5、右段 `9 8 7` 都不小於 5，但兩段內部還沒排好。',
      output: 'before: 7 2 9 4 3 8 5\npivot = 5\nj=0: 7 >= 5, keep\nj=1: 2 < 5, swap a[0] a[1] -> 2 7 9 4 3 8 5\nj=2: 9 >= 5, keep\nj=3: 4 < 5, swap a[1] a[3] -> 2 4 9 7 3 8 5\nj=4: 3 < 5, swap a[2] a[4] -> 2 4 3 7 9 8 5\nj=5: 8 >= 5, keep\npivot to a[3] -> 2 4 3 5 9 8 7\npivot index: 3\nleft: 2 4 3\nright: 9 8 7',
      code: {
        'C++': code`#include <iostream>
#include <utility>
#include <vector>

void show(const std::vector<int>& a, int from, int to) {
    for (int k = from; k < to; k++) std::cout << ' ' << a[k];
    std::cout << "\n";
}

int partition(std::vector<int>& a, int lo, int hi) {
    int pivot = a[hi];
    int i = lo;  // a[lo..i-1] < pivot
    std::cout << "pivot = " << pivot << "\n";
    for (int j = lo; j < hi; j++) {
        if (a[j] < pivot) {
            std::swap(a[i], a[j]);
            std::cout << "j=" << j << ": " << a[i] << " < " << pivot << ", swap a[" << i << "] a[" << j << "] ->";
            show(a, 0, static_cast<int>(a.size()));
            i++;
        } else {
            std::cout << "j=" << j << ": " << a[j] << " >= " << pivot << ", keep\n";
        }
    }
    std::swap(a[i], a[hi]);
    std::cout << "pivot to a[" << i << "] ->";
    show(a, 0, static_cast<int>(a.size()));
    return i;
}

int main() {
    std::vector<int> a = {7, 2, 9, 4, 3, 8, 5};
    int n = static_cast<int>(a.size());
    std::cout << "before:";
    show(a, 0, n);
    int p = partition(a, 0, n - 1);
    std::cout << "pivot index: " << p << "\n";
    std::cout << "left:";
    show(a, 0, p);
    std::cout << "right:";
    show(a, p + 1, n);
}`,
        Python: code`def partition(a, lo, hi):
    pivot = a[hi]
    i = lo  # a[lo..i-1] < pivot
    print(f"pivot = {pivot}")
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            print(f"j={j}: {a[i]} < {pivot}, swap a[{i}] a[{j}] ->", *a)
            i += 1
        else:
            print(f"j={j}: {a[j]} >= {pivot}, keep")
    a[i], a[hi] = a[hi], a[i]
    print(f"pivot to a[{i}] ->", *a)
    return i


a = [7, 2, 9, 4, 3, 8, 5]
print("before:", *a)
p = partition(a, 0, len(a) - 1)
print("pivot index:", p)
print("left:", *a[:p])
print("right:", *a[p + 1:])`,
        Java: code`public class Main {
    static String show(int[] a, int from, int to) {
        StringBuilder sb = new StringBuilder();
        for (int k = from; k < to; k++) sb.append(' ').append(a[k]);
        return sb.toString();
    }

    static int partition(int[] a, int lo, int hi) {
        int pivot = a[hi];
        int i = lo;  // a[lo..i-1] < pivot
        System.out.println("pivot = " + pivot);
        for (int j = lo; j < hi; j++) {
            if (a[j] < pivot) {
                int t = a[i];
                a[i] = a[j];
                a[j] = t;
                System.out.println("j=" + j + ": " + a[i] + " < " + pivot + ", swap a[" + i + "] a[" + j + "] ->" + show(a, 0, a.length));
                i++;
            } else {
                System.out.println("j=" + j + ": " + a[j] + " >= " + pivot + ", keep");
            }
        }
        int t = a[i];
        a[i] = a[hi];
        a[hi] = t;
        System.out.println("pivot to a[" + i + "] ->" + show(a, 0, a.length));
        return i;
    }

    public static void main(String[] args) {
        int[] a = {7, 2, 9, 4, 3, 8, 5};
        System.out.println("before:" + show(a, 0, a.length));
        int p = partition(a, 0, a.length - 1);
        System.out.println("pivot index: " + p);
        System.out.println("left:" + show(a, 0, p));
        System.out.println("right:" + show(a, p + 1, a.length));
    }
}`,
        JavaScript: code`function swap(a, x, y) {
    const t = a[x];
    a[x] = a[y];
    a[y] = t;
}

function partition(a, lo, hi) {
    const pivot = a[hi];
    let i = lo;  // a[lo..i-1] < pivot
    console.log("pivot = " + pivot);
    for (let j = lo; j < hi; j++) {
        if (a[j] < pivot) {
            swap(a, i, j);
            console.log("j=" + j + ": " + a[i] + " < " + pivot + ", swap a[" + i + "] a[" + j + "] -> " + a.join(" "));
            i++;
        } else {
            console.log("j=" + j + ": " + a[j] + " >= " + pivot + ", keep");
        }
    }
    swap(a, i, hi);
    console.log("pivot to a[" + i + "] -> " + a.join(" "));
    return i;
}

const a = [7, 2, 9, 4, 3, 8, 5];
console.log("before: " + a.join(" "));
const p = partition(a, 0, a.length - 1);
console.log("pivot index: " + p);
console.log("left: " + a.slice(0, p).join(" "));
console.log("right: " + a.slice(p + 1).join(" "));`,
      },
    },
    {
      id: 'ex-compare-count', title: '比較次數：隨機輸入、已排序、全部相等與隨機 pivot',
      description: '完整的快速排序（Lomuto 分割，先遞迴較小的一邊、較大的一邊用迴圈），對 n = 1000 的四種情況印出比較次數、最深遞迴層數與結果是否排好。已排序與全部相等都是 n(n − 1)/2 = 499500 次；同一份已排序資料改用隨機 pivot 後只要 11215 次。比較次數用 `long long` / `long` 計數，因為 n = 10^5 的最差情況會超過 `int`；JavaScript 的 number 在 2^53 以內精確，直接計數即可。',
      output: 'n = 1000, n(n-1)/2 = 499500\nrandom input: compares 10850, depth 7, sorted yes\nsorted input: compares 499500, depth 1, sorted yes\nall equal: compares 499500, depth 1, sorted yes\nsorted, random pivot: compares 11215, depth 6, sorted yes',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

long long seed = 20261031;
long long compares = 0;  // can reach n(n-1)/2: about 5 * 10^9 when n = 10^5, too big for int
int maxDepth = 0;

long long nextRand() {
    seed = seed * 48271 % 2147483647;
    return seed;
}

int partition(std::vector<int>& a, int lo, int hi) {
    int pivot = a[hi];
    int i = lo;
    for (int j = lo; j < hi; j++) {
        compares++;
        if (a[j] < pivot) {
            std::swap(a[i], a[j]);
            i++;
        }
    }
    std::swap(a[i], a[hi]);
    return i;
}

void quickSort(std::vector<int>& a, int lo, int hi, int depth, bool randomPivot) {
    while (lo < hi) {
        maxDepth = std::max(maxDepth, depth);
        if (randomPivot) {
            int r = lo + static_cast<int>(nextRand() % (hi - lo + 1));
            std::swap(a[r], a[hi]);
        }
        int p = partition(a, lo, hi);
        if (p - lo < hi - p) {  // recurse on the smaller side, loop on the larger one
            quickSort(a, lo, p - 1, depth + 1, randomPivot);
            lo = p + 1;
        } else {
            quickSort(a, p + 1, hi, depth + 1, randomPivot);
            hi = p - 1;
        }
    }
}

void run(const std::string& name, std::vector<int> a, bool randomPivot) {
    compares = 0;
    maxDepth = 0;
    quickSort(a, 0, static_cast<int>(a.size()) - 1, 1, randomPivot);
    bool ok = std::is_sorted(a.begin(), a.end());
    std::cout << name << ": compares " << compares << ", depth " << maxDepth << ", sorted " << (ok ? "yes" : "no") << "\n";
}

int main() {
    const int n = 1000;
    std::cout << "n = " << n << ", n(n-1)/2 = " << 1LL * n * (n - 1) / 2 << "\n";
    std::vector<int> random(n), sorted(n);
    for (int k = 0; k < n; k++) random[k] = static_cast<int>(nextRand() % 1000000);
    for (int k = 0; k < n; k++) sorted[k] = k;
    run("random input", random, false);
    run("sorted input", sorted, false);
    run("all equal", std::vector<int>(n, 7), false);
    run("sorted, random pivot", sorted, true);
}`,
        Python: code`seed = 20261031
compares = 0
max_depth = 0


def next_rand():
    global seed
    seed = seed * 48271 % 2147483647
    return seed


def partition(a, lo, hi):
    global compares
    pivot = a[hi]
    i = lo
    for j in range(lo, hi):
        compares += 1
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    return i


def quick_sort(a, lo, hi, depth, random_pivot):
    global max_depth
    while lo < hi:
        max_depth = max(max_depth, depth)
        if random_pivot:
            r = lo + next_rand() % (hi - lo + 1)
            a[r], a[hi] = a[hi], a[r]
        p = partition(a, lo, hi)
        if p - lo < hi - p:  # recurse on the smaller side, loop on the larger one
            quick_sort(a, lo, p - 1, depth + 1, random_pivot)
            lo = p + 1
        else:
            quick_sort(a, p + 1, hi, depth + 1, random_pivot)
            hi = p - 1


def run(name, a, random_pivot):
    global compares, max_depth
    compares, max_depth = 0, 0
    quick_sort(a, 0, len(a) - 1, 1, random_pivot)
    ok = all(a[k] <= a[k + 1] for k in range(len(a) - 1))
    print(f"{name}: compares {compares}, depth {max_depth}, sorted {'yes' if ok else 'no'}")


n = 1000
print(f"n = {n}, n(n-1)/2 = {n * (n - 1) // 2}")
run("random input", [next_rand() % 1000000 for _ in range(n)], False)
run("sorted input", list(range(n)), False)
run("all equal", [7] * n, False)
run("sorted, random pivot", list(range(n)), True)`,
        Java: code`import java.util.Arrays;

public class Main {
    static long seed = 20261031;
    static long compares = 0;  // can reach n(n-1)/2: about 5 * 10^9 when n = 10^5, too big for int
    static int maxDepth = 0;

    static long nextRand() {
        seed = seed * 48271 % 2147483647;
        return seed;
    }

    static void swap(int[] a, int x, int y) {
        int t = a[x];
        a[x] = a[y];
        a[y] = t;
    }

    static int partition(int[] a, int lo, int hi) {
        int pivot = a[hi];
        int i = lo;
        for (int j = lo; j < hi; j++) {
            compares++;
            if (a[j] < pivot) {
                swap(a, i, j);
                i++;
            }
        }
        swap(a, i, hi);
        return i;
    }

    static void quickSort(int[] a, int lo, int hi, int depth, boolean randomPivot) {
        while (lo < hi) {
            maxDepth = Math.max(maxDepth, depth);
            if (randomPivot) swap(a, lo + (int) (nextRand() % (hi - lo + 1)), hi);
            int p = partition(a, lo, hi);
            if (p - lo < hi - p) {  // recurse on the smaller side, loop on the larger one
                quickSort(a, lo, p - 1, depth + 1, randomPivot);
                lo = p + 1;
            } else {
                quickSort(a, p + 1, hi, depth + 1, randomPivot);
                hi = p - 1;
            }
        }
    }

    static void run(String name, int[] a, boolean randomPivot) {
        compares = 0;
        maxDepth = 0;
        quickSort(a, 0, a.length - 1, 1, randomPivot);
        boolean ok = true;
        for (int k = 0; k + 1 < a.length; k++) if (a[k] > a[k + 1]) ok = false;
        System.out.println(name + ": compares " + compares + ", depth " + maxDepth + ", sorted " + (ok ? "yes" : "no"));
    }

    public static void main(String[] args) {
        int n = 1000;
        System.out.println("n = " + n + ", n(n-1)/2 = " + (long) n * (n - 1) / 2);
        int[] random = new int[n], sorted = new int[n], equal = new int[n];
        for (int k = 0; k < n; k++) random[k] = (int) (nextRand() % 1000000);
        for (int k = 0; k < n; k++) sorted[k] = k;
        Arrays.fill(equal, 7);
        run("random input", random, false);
        run("sorted input", sorted.clone(), false);
        run("all equal", equal, false);
        run("sorted, random pivot", sorted.clone(), true);
    }
}`,
        JavaScript: code`let seed = 20261031;  // seed * 48271 stays below 2^47: exact in a number
let compares = 0;     // can reach n(n-1)/2: about 5 * 10^9 when n = 10^5, still exact in a number
let maxDepth = 0;

function nextRand() {
    seed = seed * 48271 % 2147483647;
    return seed;
}

function swap(a, x, y) {
    const t = a[x];
    a[x] = a[y];
    a[y] = t;
}

function partition(a, lo, hi) {
    const pivot = a[hi];
    let i = lo;
    for (let j = lo; j < hi; j++) {
        compares++;
        if (a[j] < pivot) {
            swap(a, i, j);
            i++;
        }
    }
    swap(a, i, hi);
    return i;
}

function quickSort(a, lo, hi, depth, randomPivot) {
    while (lo < hi) {
        maxDepth = Math.max(maxDepth, depth);
        if (randomPivot) swap(a, lo + nextRand() % (hi - lo + 1), hi);
        const p = partition(a, lo, hi);
        if (p - lo < hi - p) {  // recurse on the smaller side, loop on the larger one
            quickSort(a, lo, p - 1, depth + 1, randomPivot);
            lo = p + 1;
        } else {
            quickSort(a, p + 1, hi, depth + 1, randomPivot);
            hi = p - 1;
        }
    }
}

function run(name, a, randomPivot) {
    compares = 0;
    maxDepth = 0;
    quickSort(a, 0, a.length - 1, 1, randomPivot);
    const ok = a.every((v, k) => k === 0 || a[k - 1] <= v);
    console.log(name + ": compares " + compares + ", depth " + maxDepth + ", sorted " + (ok ? "yes" : "no"));
}

const n = 1000;
console.log("n = " + n + ", n(n-1)/2 = " + n * (n - 1) / 2);
const random = Array.from({ length: n }, () => nextRand() % 1000000);
const sorted = Array.from({ length: n }, (_, k) => k);
run("random input", random, false);
run("sorted input", sorted.slice(), false);
run("all equal", new Array(n).fill(7), false);
run("sorted, random pivot", sorted.slice(), true);`,
      },
    },
    {
      id: 'ex-quickselect', title: '快速選擇：第 k 小的數',
      description: '固定取中間元素當 pivot 的快速選擇：每次分割後只留下答案所在的一邊。對含兩個 4 的陣列印出第 1、3、4、5、8 小，最後一行是排序結果對照：第 3 小與第 4 小都是 4，第 1 小是最小值 2、第 n = 8 小是最大值 9。',
      output: 'k=1: 2\nk=3: 4\nk=4: 4\nk=5: 5\nk=8: 9\nsorted: 2 3 4 4 5 7 8 9',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <utility>
#include <vector>

int partition(std::vector<int>& a, int lo, int hi) {
    int pivot = a[hi];
    int i = lo;
    for (int j = lo; j < hi; j++) {
        if (a[j] < pivot) {
            std::swap(a[i], a[j]);
            i++;
        }
    }
    std::swap(a[i], a[hi]);
    return i;
}

// The k-th smallest value (k = 1 is the minimum). a is a copy, so the caller's data is unchanged.
int quickselect(std::vector<int> a, int k) {
    int lo = 0, hi = static_cast<int>(a.size()) - 1, target = k - 1;
    while (true) {
        int mid = lo + (hi - lo) / 2;  // fixed rule: the middle element is the pivot
        std::swap(a[mid], a[hi]);
        int p = partition(a, lo, hi);
        if (p == target) return a[p];
        if (target < p) hi = p - 1;  // the answer is on the left: drop the right side
        else lo = p + 1;             // the answer is on the right: drop the left side
    }
}

int main() {
    const std::vector<int> data = {7, 2, 9, 4, 3, 8, 5, 4};
    for (int k : {1, 3, 4, 5, 8}) std::cout << "k=" << k << ": " << quickselect(data, k) << "\n";
    std::vector<int> s = data;
    std::sort(s.begin(), s.end());
    std::cout << "sorted:";
    for (int v : s) std::cout << ' ' << v;
    std::cout << "\n";
}`,
        Python: code`def partition(a, lo, hi):
    pivot = a[hi]
    i = lo
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    return i


def quickselect(values, k):
    """The k-th smallest value (k = 1 is the minimum)."""
    a = values[:]
    lo, hi, target = 0, len(a) - 1, k - 1
    while True:
        mid = (lo + hi) // 2  # fixed rule: the middle element is the pivot
        a[mid], a[hi] = a[hi], a[mid]
        p = partition(a, lo, hi)
        if p == target:
            return a[p]
        if target < p:
            hi = p - 1  # the answer is on the left: drop the right side
        else:
            lo = p + 1  # the answer is on the right: drop the left side


data = [7, 2, 9, 4, 3, 8, 5, 4]
for k in (1, 3, 4, 5, 8):
    print(f"k={k}: {quickselect(data, k)}")
print("sorted:", *sorted(data))`,
        Java: code`import java.util.Arrays;

public class Main {
    static void swap(int[] a, int x, int y) {
        int t = a[x];
        a[x] = a[y];
        a[y] = t;
    }

    static int partition(int[] a, int lo, int hi) {
        int pivot = a[hi];
        int i = lo;
        for (int j = lo; j < hi; j++) {
            if (a[j] < pivot) {
                swap(a, i, j);
                i++;
            }
        }
        swap(a, i, hi);
        return i;
    }

    // The k-th smallest value (k = 1 is the minimum).
    static int quickselect(int[] values, int k) {
        int[] a = values.clone();
        int lo = 0, hi = a.length - 1, target = k - 1;
        while (true) {
            int mid = lo + (hi - lo) / 2;  // fixed rule: the middle element is the pivot
            swap(a, mid, hi);
            int p = partition(a, lo, hi);
            if (p == target) return a[p];
            if (target < p) hi = p - 1;  // the answer is on the left: drop the right side
            else lo = p + 1;             // the answer is on the right: drop the left side
        }
    }

    public static void main(String[] args) {
        int[] data = {7, 2, 9, 4, 3, 8, 5, 4};
        for (int k : new int[] {1, 3, 4, 5, 8}) System.out.println("k=" + k + ": " + quickselect(data, k));
        int[] s = data.clone();
        Arrays.sort(s);
        StringBuilder sb = new StringBuilder("sorted:");
        for (int v : s) sb.append(' ').append(v);
        System.out.println(sb);
    }
}`,
        JavaScript: code`function swap(a, x, y) {
    const t = a[x];
    a[x] = a[y];
    a[y] = t;
}

function partition(a, lo, hi) {
    const pivot = a[hi];
    let i = lo;
    for (let j = lo; j < hi; j++) {
        if (a[j] < pivot) {
            swap(a, i, j);
            i++;
        }
    }
    swap(a, i, hi);
    return i;
}

// The k-th smallest value (k = 1 is the minimum).
function quickselect(values, k) {
    const a = values.slice();
    let lo = 0, hi = a.length - 1;
    const target = k - 1;
    while (true) {
        const mid = Math.floor((lo + hi) / 2);  // fixed rule: the middle element is the pivot
        swap(a, mid, hi);
        const p = partition(a, lo, hi);
        if (p === target) return a[p];
        if (target < p) hi = p - 1;  // the answer is on the left: drop the right side
        else lo = p + 1;             // the answer is on the right: drop the left side
    }
}

const data = [7, 2, 9, 4, 3, 8, 5, 4];
for (const k of [1, 3, 4, 5, 8]) console.log("k=" + k + ": " + quickselect(data, k));
console.log("sorted: " + data.slice().sort((x, y) => x - y).join(" "));`,
      },
    },
  ],
  visualization: {
    kind: 'sorting-steps', title: '快速排序：Lomuto 分割，pivot 落定後遞迴兩邊', language: 'Python',
    code: code`def quick_sort(a, lo, hi):
    if lo >= hi:
        return
    pivot = a[hi]
    i = lo
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    quick_sort(a, lo, i - 1)
    quick_sort(a, i + 1, hi)
a = [3, 6, 2, 5, 1, 4]
quick_sort(a, 0, len(a) - 1)
print(*a)`,
    steps: quickTrace,
    tryIt: { algorithm: 'quick-sort', initial: [8, 3, 5, 1, 9, 2, 7] },
  },
  quiz: [
    {
      id: 'q-partition-output', prompt: '下面的程式對陣列做一次 Lomuto 分割（pivot 是最後一個元素 4），會印出什麼？',
      code: { language: 'Python', text: code`a = [6, 3, 8, 1, 5, 2, 4]
pivot = a[-1]
i = 0
for j in range(len(a) - 1):
    if a[j] < pivot:
        a[i], a[j] = a[j], a[i]
        i += 1
a[i], a[-1] = a[-1], a[i]
print(*a, "/", i)` },
      options: ['1 2 3 4 5 6 8 / 3', '3 1 2 6 5 8 4 / 3', '3 1 2 4 5 8 6 / 3', '3 1 2 4 5 8 6 / 4'],
      answer: 2, explanation: '小於 4 的是 3、1、2，依序被換到索引 0、1、2：j = 1 時 3 和 6 交換，j = 3 時 1 和 8 交換，j = 5 時 2 和 6 交換，得到 `3 1 2 6 5 8 4`、i = 3；最後 pivot 4 和 a[3] = 6 交換，得到 `3 1 2 4 5 8 6`，印出 i = 3。「1 2 3 4 5 6 8」把一次分割誤當成整個排序——兩邊內部還沒排好；「3 1 2 6 5 8 4」漏了最後把 pivot 換到 a[i]；「/ 4」把 i 多算一格。以 Python 實際執行確認。',
    },
    {
      id: 'q-pivot-position', prompt: '對 `[9, 4, 7, 1, 8, 3, 6]` 做一次 Lomuto 分割（pivot = 最後一個元素 6）。分割後 6 在哪個索引？',
      options: ['索引 2', '索引 3', '索引 4', '索引 6：pivot 一直留在最後'],
      answer: 1, explanation: 'pivot 最後的位置等於區間中「小於 pivot」的元素個數：小於 6 的有 4、1、3 三個，所以 i 停在 3，分割後是 `[4, 1, 3, 6, 8, 7, 9]`。排好的陣列 `[1, 3, 4, 6, 7, 8, 9]` 中 6 也在索引 3——這就是「pivot 已在最終位置」。「索引 6」忘了最後一步要把 pivot 換到 a[i]；「索引 2」「索引 4」是數錯小於 6 的個數。以程式實際分割確認。',
    },
    {
      id: 'q-worst-input', prompt: '用「最後一個元素當 pivot、條件 `a[j] < pivot`」的 Lomuto 快速排序排 n = 1000 個數。下列哪些輸入會讓比較次數達到最大值 n(n − 1)/2 = 499500？',
      options: ['只有由小到大排好的輸入', '由小到大與由大到小；全部相等的輸入則很快', '由小到大、由大到小、全部相等三種都會', '只有全部相等的輸入'],
      answer: 2, explanation: '只要 pivot 每次都是區間的最小或最大值，區間每次只少一個元素，比較次數就是 999 + 998 + … + 1 = 499500。由小到大時 pivot 每次是最大值；由大到小時 pivot 交替是最小、最大值；全部相等時 `a[j] < pivot` 永遠不成立，所有元素都留在右邊，一樣每次只少一個。「全部相等很快」是常見的誤解——等值要用三路分割才快。以計數程式對三種輸入實際執行，都得到 499500（隨機輸入約 10436）。',
    },
    {
      id: 'q-random-pivot', prompt: '把 Lomuto 快速排序改成「每次先從區間中隨機選一個元素和 a[hi] 交換，再分割」。下列哪個敘述正確？',
      options: [
        '最差情況變成 O(n log n)，再也不會出現 O(n²)',
        '對任何輸入，期望比較次數都是 O(n log n)；O(n²) 仍可能發生，只是機率極小',
        '排序變成穩定的',
        '全部相等的輸入也會變成 O(n log n)',
      ],
      answer: 1, explanation: '隨機 pivot 讓「慢不慢」只取決於抽到的隨機數、不再取決於輸入的排列，所以對任何輸入期望都是 O(n log n)；但連續抽到極端值的機率雖然極小，仍不是零，最差情況仍是 O(n²)。分割仍做遠距離交換，所以還是不穩定。全部相等時，不管抽到哪個元素，`<` 都把其他元素全部放到同一邊：實測 1000 個 7 用隨機 pivot 仍是 499500 次比較，要用三路分割才能解決；而已排序的 1000 個數用隨機 pivot 只要約 1.1 × 10^4 次。',
    },
    {
      id: 'q-stability', prompt: '依分數（每筆的第一個值）用 Lomuto 快速排序四筆紀錄，會印出什麼？',
      code: { language: 'Python', text: code`recs = [(1, "a"), (2, "b"), (1, "c"), (2, "d")]


def quick_sort(a, lo, hi):
    if lo >= hi:
        return
    pivot = a[hi][0]
    i = lo
    for j in range(lo, hi):
        if a[j][0] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    quick_sort(a, lo, i - 1)
    quick_sort(a, i + 1, hi)


quick_sort(recs, 0, len(recs) - 1)
print(*(f"{s}{t}" for s, t in recs))` },
      options: ['1a 1c 2b 2d', '1c 1a 2d 2b', '1a 1c 2d 2b', '1c 1a 2b 2d'],
      answer: 1, explanation: '第一次 pivot 是 (2,d)：(1,a) 留在索引 0、(1,c) 和 (2,b) 交換，得到 `1a 1c 2b 2d`、i = 2；pivot (2,d) 再和 a[2] = (2,b) 交換，變成 `1a 1c 2d 2b`。左段 [0, 1] 的 pivot 是 (1,c)，(1,a) 不小於 1，i = 0，(1,c) 和 (1,a) 對調：`1c 1a 2d 2b`。兩組同分紀錄的先後都反了，所以快速排序不穩定。「1a 1c 2b 2d」是穩定排序（例如 Python `sorted`）的結果；另兩個選項只反了一組。以 Python 實際執行確認。',
    },
    {
      id: 'q-bug', prompt: '下面的快速排序只改了一個地方（第 11 行）。執行後會怎樣？',
      code: { language: 'Python', text: code`def quick_sort(a, lo, hi):
    if lo >= hi:
        return
    pivot = a[hi]
    i = lo
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    quick_sort(a, lo, i)
    quick_sort(a, i + 1, hi)


a = [3, 1, 2]
quick_sort(a, 0, 2)
print(a)` },
      options: ['印出 `[1, 2, 3]`', '印出 `[1, 3, 2]`', '丟出 `RecursionError`：區間 [0, 1] 不斷重複遞迴', '丟出 `IndexError`'],
      answer: 2, explanation: '第一次分割後 `a = [1, 2, 3]`、i = 1，接著呼叫 `quick_sort(a, 0, 1)`：pivot 是 a[1] = 2，1 < 2 所以 i 變成 1 = hi，pivot 不動，然後又呼叫 `quick_sort(a, 0, 1)`——區間完全沒有變短，無窮遞迴，直到超過 Python 的遞迴上限丟出 `RecursionError`。只要 pivot 是區間最大值（i == hi）就會發生，所以這個錯誤在某些輸入（例如 `[2, 1]`）上碰巧不會出現，更難發現。正確寫法是 `quick_sort(a, lo, i - 1)`，把已經就位的 pivot 排除。以 Python 實際執行確認。',
    },
    {
      id: 'q-choose', prompt: '要把 10^6 筆報名紀錄依分數排序，同分者必須維持原本的報名先後，而且資料很可能已經大致排好。只能自己實作下列一種排序，選哪一種？',
      options: ['最後一個元素當 pivot 的快速排序：原地、平均最快', '隨機 pivot 的快速排序：已排好的輸入也不會退化', '合併排序', '選擇排序：交換次數最少'],
      answer: 2, explanation: '題目要求「同分維持原本先後」，也就是需要穩定排序，而且要在大致排好的資料上保證效率。合併排序穩定、最差也是 O(n log n)。快速排序不論怎麼選 pivot 都不穩定；固定選最後一個時，大致排好的資料還會讓它接近 O(n²)。隨機 pivot 解決了退化，卻解決不了穩定性。選擇排序也不穩定，而且固定 O(n²)，10^6 筆約 5 × 10^11 次比較。',
    },
  ],
  exercises: [
    {
      id: 'e-kth-smallest', title: '第 k 小的數',
      statement: '給 n 個整數與 k，輸出由小到大排序後的第 k 個數（k = 1 是最小值，k = n 是最大值；相等的值各占一個位置）。n 最大 2 × 10^5，請用快速選擇在平均 O(n) 內完成，並注意測資包含已經排好的資料與大量相等的值。輸入必須完全合法才計算：第一個記號是 n、第二個是 k，之後恰好有 n 個值；每個記號都必須是「可選的負號 `-` 加上 1～10 位數字」（不接受 `+5`、`2.5`、`x` 之類）。若 n 不在 1～200000、k 不在 1～n、任一值的絕對值超過 10^9、值的個數不是 n，或有任何記號不是這種整數，只輸出一行 `Invalid`。',
      inputFormat: '第一行是 n 與 k，接著是 n 個整數。所有記號以空白或換行分隔，值可以分成任意多行。',
      outputFormat: '一行：第 k 小的數；或只有一行 `Invalid`。',
      constraints: [
        '1 ≤ n ≤ 2 × 10^5',
        '1 ≤ k ≤ n（否則輸出 `Invalid`）',
        '每個值 v 滿足 −10^9 ≤ v ≤ 10^9',
      ],
      samples: [
        { kind: 'normal', input: '7 3\n7 2 9 4 3 8 5', output: '4', note: '排序後是 2 3 4 5 7 8 9，第 3 個是 4' },
      ],
      tests: [
        { kind: 'normal', input: '7 3\n7 2 9 4 3 8 5', output: '4', note: '範例' },
        { kind: 'normal', input: '8 5\n7 2 9 4 3 8 5 4', output: '5', note: '有兩個 4：排序後 2 3 4 4 5 7 8 9，第 5 個是 5；把重複值去掉會答成 7' },
        { kind: 'normal', input: '6 2\n-5 3 -10 0 3 -5', output: '-5', note: '負數與重複：排序後 −10 −5 −5 0 3 3' },
        { kind: 'normal', input: '3 3\n1000000000 -1000000000 0', output: '1000000000', note: '值的上下限' },
        { kind: 'normal', input: '5 2\n3\n1\n2\n5\n4', output: '2', note: '值分在多行' },
        { kind: 'normal', input: bigRandomInput, output: bigRandomOutput, note: `n = ${BIG} 個隨機值、k = ${bigRandomK}：O(n²) 的做法會超時` },
        { kind: 'edge', input: '1 1\n42', output: '42', note: 'n = 1' },
        { kind: 'edge', input: '5 1\n4 -2 9 -2 7', output: '-2', note: 'k = 1：最小值，而且出現兩次' },
        { kind: 'edge', input: '5 5\n4 -2 9 -2 7', output: '9', note: 'k = n：最大值' },
        { kind: 'edge', input: '6 4\n5 5 5 5 5 5', output: '5', note: '全部相等' },
        { kind: 'edge', input: '6 5\n6 5 4 3 2 1', output: '5', note: '由大到小' },
        { kind: 'edge', input: bigSortedInput, output: '123457', note: `n = ${BIG}、已經由小到大排好：固定選最後一個當 pivot 會退化成約 2 × 10^10 次比較` },
        { kind: 'edge', input: bigEqualInput, output: '7', note: `n = ${BIG} 個 7：只用 \`<\` 的兩路分割（即使隨機選 pivot）也會退化，需要三路分割` },
        { kind: 'error', input: '3 0\n1 2 3', output: 'Invalid', note: 'k = 0 不在 1～n' },
        { kind: 'error', input: '3 4\n1 2 3', output: 'Invalid', note: 'k = n + 1 不在 1～n' },
        { kind: 'error', input: '3 -1\n1 2 3', output: 'Invalid', note: 'k 是負數' },
        { kind: 'error', input: '0 1', output: 'Invalid', note: 'n = 0 不在 1～200000' },
        { kind: 'error', input: '3 2\n1 2', output: 'Invalid', note: '值少於 n 個' },
        { kind: 'error', input: '3 2\n1 2 3 4', output: 'Invalid', note: '值多於 n 個' },
        { kind: 'error', input: '3 2\n1 2.5 3', output: 'Invalid', note: '值不是整數' },
        { kind: 'error', input: '3 2\n1 +2 3', output: 'Invalid', note: '不接受正號' },
        { kind: 'error', input: '3 2\n1 1000000001 3', output: 'Invalid', note: '值超過 10^9' },
        { kind: 'error', input: '', output: 'Invalid', note: '空的輸入' },
      ],
      hints: [
        '先讀入全部記號並檢查：個數必須剛好是 2 + n，每個記號都要是合法的整數且在範圍內，k 要在 1～n。',
        '快速選擇：分割後若答案的索引 k − 1 落在 pivot 的左邊，就只處理左段；落在右邊就只處理右段；等於 pivot 的位置就找到了。用 while 迴圈即可，不必遞迴。',
        '已排序的測資會讓「固定選最後一個」的 pivot 退化：改成在區間內隨機選 pivot（固定亂數種子，讓每次執行都一樣；JavaScript 的 `Math.random` 不能設定種子，可以自己寫一個簡單的線性同餘產生器）。',
        '全部相等的測資會讓只用 `<` 的分割退化：改用三路分割，把區間分成 < pivot、= pivot、> pivot 三段；若 k − 1 落在中間那段，答案就是 pivot。',
        '值的絕對值最多 10^9，放得進 32 位元 `int`；但檢查範圍前請用 `long long` / `long` 解析，避免 10 位數的記號溢位；JavaScript 用 `Number` 轉換即可，10 位數遠小於 2^53。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <random>
#include <string>
#include <utility>
#include <vector>

// Strict: an optional minus sign and 1-10 digits, absolute value at most limit.
bool parseInt(const std::string& s, long long limit, long long& out) {
    std::size_t start = (!s.empty() && s[0] == '-') ? 1 : 0;
    std::size_t digits = s.size() - start;
    if (digits < 1 || digits > 10) return false;
    long long v = 0;
    for (std::size_t i = start; i < s.size(); i++) {
        if (s[i] < '0' || s[i] > '9') return false;
        v = v * 10 + (s[i] - '0');
    }
    if (start) v = -v;
    if (v < -limit || v > limit) return false;
    out = v;
    return true;
}

// Quickselect with a random pivot and a three-way partition: average O(n).
int kthSmallest(std::vector<int>& a, int k) {
    std::mt19937 rng(2026);  // fixed seed: the same run every time (the answer is unique anyway)
    int lo = 0, hi = static_cast<int>(a.size()) - 1, target = k - 1;
    while (true) {
        int pivot = a[lo + static_cast<int>(rng() % static_cast<unsigned>(hi - lo + 1))];
        // after the loop: a[lo..lt-1] < pivot, a[lt..gt] == pivot, a[gt+1..hi] > pivot
        int lt = lo, i = lo, gt = hi;
        while (i <= gt) {
            if (a[i] < pivot) std::swap(a[lt++], a[i++]);
            else if (a[i] > pivot) std::swap(a[i], a[gt--]);
            else i++;
        }
        if (target < lt) hi = lt - 1;
        else if (target > gt) lo = gt + 1;
        else return pivot;
    }
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<std::string> t;
    std::string s;
    while (std::cin >> s) t.push_back(s);
    long long n = 0, k = 0;
    if (t.size() < 2 || !parseInt(t[0], 200000, n) || !parseInt(t[1], 200000, k) || n < 1 || k < 1 || k > n
        || static_cast<long long>(t.size()) != 2 + n) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<int> a(n);
    for (long long i = 0; i < n; i++) {
        long long v = 0;
        if (!parseInt(t[2 + i], 1000000000, v)) {
            std::cout << "Invalid\n";
            return 0;
        }
        a[i] = static_cast<int>(v);
    }
    std::cout << kthSmallest(a, static_cast<int>(k)) << "\n";
    return 0;
}`,
        Python: code`import random
import re
import sys

INT = re.compile(r"-?[0-9]{1,10}")


def parse(tok, limit):
    """Strict: an optional minus sign and 1-10 digits, absolute value at most limit; otherwise None."""
    if INT.fullmatch(tok) is None:
        return None
    v = int(tok)
    return v if -limit <= v <= limit else None


def kth_smallest(a, k):
    """Quickselect with a random pivot and a three-way split: average O(n)."""
    rng = random.Random(2026)  # fixed seed: the same run every time (the answer is unique anyway)
    while True:
        pivot = a[rng.randrange(len(a))]
        less = [x for x in a if x < pivot]
        if k <= len(less):
            a = less
            continue
        greater = [x for x in a if x > pivot]
        equal = len(a) - len(less) - len(greater)
        if k <= len(less) + equal:
            return pivot
        k -= len(less) + equal
        a = greater


def main():
    t = sys.stdin.read().split()
    n = parse(t[0], 200000) if len(t) >= 2 else None
    k = parse(t[1], 200000) if len(t) >= 2 else None
    if n is None or k is None or n < 1 or not 1 <= k <= n or len(t) != 2 + n:
        print("Invalid")
        return
    a = [parse(tok, 10**9) for tok in t[2:]]
    if any(v is None for v in a):
        print("Invalid")
        return
    print(kth_smallest(a, k))


main()`,
        Java: code`import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Random;

public class Main {
    // Strict: an optional minus sign and 1-10 digits, absolute value at most limit; otherwise null.
    static Long parse(String s, long limit) {
        int start = s.startsWith("-") ? 1 : 0;
        int digits = s.length() - start;
        if (digits < 1 || digits > 10) return null;
        long v = 0;
        for (int i = start; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch < '0' || ch > '9') return null;
            v = v * 10 + (ch - '0');
        }
        if (start == 1) v = -v;
        return v < -limit || v > limit ? null : v;
    }

    static void swap(int[] a, int x, int y) {
        int t = a[x];
        a[x] = a[y];
        a[y] = t;
    }

    // Quickselect with a random pivot and a three-way partition: average O(n).
    static int kthSmallest(int[] a, int k) {
        Random rng = new Random(2026);  // fixed seed: the same run every time (the answer is unique anyway)
        int lo = 0, hi = a.length - 1, target = k - 1;
        while (true) {
            int pivot = a[lo + rng.nextInt(hi - lo + 1)];
            // after the loop: a[lo..lt-1] < pivot, a[lt..gt] == pivot, a[gt+1..hi] > pivot
            int lt = lo, i = lo, gt = hi;
            while (i <= gt) {
                if (a[i] < pivot) swap(a, lt++, i++);
                else if (a[i] > pivot) swap(a, i, gt--);
                else i++;
            }
            if (target < lt) hi = lt - 1;
            else if (target > gt) lo = gt + 1;
            else return pivot;
        }
    }

    public static void main(String[] args) throws IOException {
        String text = new String(System.in.readAllBytes(), StandardCharsets.UTF_8).trim();
        String[] t = text.isEmpty() ? new String[0] : text.split("\\s+");
        Long n = t.length >= 2 ? parse(t[0], 200000) : null;
        Long k = t.length >= 2 ? parse(t[1], 200000) : null;
        if (n == null || k == null || n < 1 || k < 1 || k > n || t.length != 2 + n) {
            System.out.println("Invalid");
            return;
        }
        int[] a = new int[(int) (long) n];
        for (int i = 0; i < a.length; i++) {
            Long v = parse(t[2 + i], 1000000000);
            if (v == null) {
                System.out.println("Invalid");
                return;
            }
            a[i] = (int) (long) v;
        }
        System.out.println(kthSmallest(a, (int) (long) k));
    }
}`,
        JavaScript: code`// Strict: an optional minus sign and 1-10 digits, absolute value at most limit; otherwise null.
function parse(tok, limit) {
    if (!/^-?[0-9]{1,10}$/.test(tok)) return null;
    const v = Number(tok);
    return v >= -limit && v <= limit ? v : null;
}

function swap(a, x, y) {
    const t = a[x];
    a[x] = a[y];
    a[y] = t;
}

// Quickselect with a random pivot and a three-way partition: average O(n).
function kthSmallest(a, k) {
    // JavaScript has no seeded random generator: a small fixed-seed LCG makes every run the same
    let seed = 2026;
    const nextRand = () => (seed = seed * 48271 % 2147483647);
    let lo = 0, hi = a.length - 1;
    const target = k - 1;
    while (true) {
        const pivot = a[lo + nextRand() % (hi - lo + 1)];
        // after the loop: a[lo..lt-1] < pivot, a[lt..gt] == pivot, a[gt+1..hi] > pivot
        let lt = lo, i = lo, gt = hi;
        while (i <= gt) {
            if (a[i] < pivot) swap(a, lt++, i++);
            else if (a[i] > pivot) swap(a, i, gt--);
            else i++;
        }
        if (target < lt) hi = lt - 1;
        else if (target > gt) lo = gt + 1;
        else return pivot;
    }
}

function solve(t) {
    const n = t.length >= 2 ? parse(t[0], 200000) : null;
    const k = t.length >= 2 ? parse(t[1], 200000) : null;
    if (n === null || k === null || n < 1 || k < 1 || k > n || t.length !== 2 + n) return "Invalid";
    const a = [];
    for (const tok of t.slice(2)) {
        const v = parse(tok, 1000000000);
        if (v === null) return "Invalid";
        a.push(v);
    }
    return String(kthSmallest(a, k));
}

const text = require("fs").readFileSync(0, "utf8").trim();
console.log(solve(text === "" ? [] : text.split(/\s+/)));`,
      },
      judge: 'none',
    },
  ],
};

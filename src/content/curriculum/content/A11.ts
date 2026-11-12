import type { LessonContent, Mark, TraceStep } from '../schema';
import { fibTreeSteps } from '../simulate-algorithms';

const code = String.raw;

/**
 * The visualization: plain fib(5) as a call tree. fibTreeSteps runs the same recursion as the trace code (base case
 * n <= 1 first, then fib(n − 1) before fib(n − 2), Python's left-to-right order); its events map to the trace code's
 * lines: 'call' → line 1 (entering fib), 'base' → line 3 (return n), 'return' → line 4 (the sum), 'result' → line 6.
 */
const TRACE_N = 5;
const plainSteps = fibTreeSteps(TRACE_N, false, { call: 1, base: 3, return: 4, result: 6 });
/** The memoized run of the same n, used only for its call count (its last step holds 呼叫次數). */
const memoCalls = fibTreeSteps(TRACE_N, true).at(-1)!.vars!['呼叫次數'];
const plainCalls = plainSteps.at(-1)!.vars!['呼叫次數'];

/**
 * One extra step after the simulator's result: the same finished tree, with the two calls a memo table would answer
 * directly marked found: the root's second child (the repeated fib(3)) and the second child of fib(4) (the repeated
 * fib(2)). Their ids are looked up in the tree, not hard-coded.
 */
const lastTree = plainSteps.at(-1)!.tree!;
const nodeById = new Map(lastTree.nodes.map(n => [n.id, n]));
const root = nodeById.get(lastTree.roots[0])!;
const repeatedFib3 = root.children![1];
const repeatedFib2 = nodeById.get(root.children![0])!.children![1];
const memoHits = new Set([repeatedFib3, repeatedFib2]);
const traceSteps: TraceStep[] = [
  ...plainSteps,
  {
    line: 6,
    note: `對照記憶化：同一棵樹裡 fib(3) 出現 2 次、fib(2) 出現 3 次，都是重複的子問題。如果把算過的 fib(k) 存進記憶表，標成「找到」的右側 fib(3) 與 fib(4) 底下的 fib(2) 會直接查表回傳，它們底下的呼叫都不必做：呼叫次數從 ${plainCalls} 次降為 ${memoCalls} 次。`,
    vars: { 一般遞迴呼叫次數: plainCalls, 記憶化呼叫次數: memoCalls },
    output: plainSteps.at(-1)!.output,
    tree: { ...lastTree, marks: (lastTree.marks ?? []).map(m => ({ id: m.id, kind: (memoHits.has(m.id) ? 'found' : m.kind) as Mark })) },
  },
];

/**
 * Exercise worst case, generated here: T = 10^4 queries with a, b up to 10^18 and m up to 10^9 (every third m close to
 * 10^9, so products of two residues come close to 10^18; every other b close to 10^18). A fixed 64-bit LCG makes the
 * input deterministic. Expected values come from an iterative right-to-left square-and-multiply on BigInt, a different
 * algorithm from the recursive solutions; it was checked against Python's built-in pow(a, b, m) on this exact input.
 */
const MASK64 = (1n << 64n) - 1n;
const E18 = 10n ** 18n;
let lcg = 20261031n;
const nextRandom = () => (lcg = (lcg * 6364136223846793005n + 1442695040888963407n) & MASK64);
const BIG_T = 10_000;
const bigQueries = Array.from({ length: BIG_T }, (_, i) => {
  const a = nextRandom() % (E18 + 1n);
  const b = i % 2 === 0 ? E18 - 1n - BigInt(i) : nextRandom() % (E18 + 1n);
  const m = i % 3 === 0 ? 1_000_000_000n - BigInt(i) : nextRandom() % 1_000_000_000n + 1n;
  return [a, b, m] as const;
});
const modPow = (a: bigint, b: bigint, m: bigint) => {
  let result = 1n % m, base = a % m, e = b;
  while (e > 0n) {
    if (e & 1n) result = result * base % m;
    base = base * base % m;
    e >>= 1n;
  }
  return result;
};
const bigInput = `${BIG_T}\n${bigQueries.map(q => q.join(' ')).join('\n')}`;
const bigOutput = bigQueries.map(([a, b, m]) => String(modPow(a, b, m))).join('\n');

/**
 * A11 Recursion 與分治. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also
 * offers JavaScript (Node.js); the fast-power example and exercise use BigInt, since 10^18 and the products exceed 2^53.
 */
export const A11: LessonContent = {
  lessonId: 'A11',
  motivation: 'F18 學過遞迴的語法：終止條件、呼叫堆疊、往下再往回。這一課學的是「怎麼設計」遞迴：把一個大問題說成「同樣形式、規模更小」的子問題，再把子問題的答案組回來。很多重要的演算法都是這樣想出來的：合併排序（A06）把陣列切成兩半各自排好再合併；快速冪把 x^n 化成 x^(n/2) 的平方，n = 10^18 也只要約 60 層；河內塔、樹的走訪、之後的回溯（A12）與動態規劃（A17）都從遞迴關係出發。這一課也要學會估計遞迴的成本：畫出遞迴樹（recursion tree），數每一層做多少事、有幾層，就能分辨 O(log n)、O(n log n) 與指數時間。遞迴的限制同樣重要：子問題大量重複時（例如直接遞迴的費氏數列），時間會爆炸，要用記憶化（memoization）把算過的答案存起來；遞迴深度太大時（例如 10^5 層），Python 會超過預設約 1,000 層的上限，C++／Java 可能把堆疊用完，JavaScript（Node.js）預設約一萬層就會丟出 `RangeError`，這時要改用迴圈。',
  sections: [
    {
      id: 'design', title: '設計遞迴：定義、終止條件、相信小一號的呼叫',
      blocks: [
        { type: 'p', text: '寫遞迴之前，先用一句話把函式的「定義」說清楚：給它一個子問題，它回傳（或完成）什麼。接著只回答兩個問題：' },
        { type: 'list', ordered: true, items: [
          '終止條件（base case）：哪些子問題小到可以直接回答？可能不只一個，例如費氏數列的 n = 0 與 n = 1。',
          '遞迴關係（recursive relation）：規模為 n 的答案，怎麼由一個或幾個「規模更小」的答案組出來？',
          '檢查前進：每一次遞迴呼叫，規模都必須嚴格變小，而且一定會走到某個終止條件，包括奇數、偶數、0、負數這些邊界輸入。',
        ] },
        { type: 'p', text: '第 2 點是最需要練習的思考方式，常被稱為「信心的一躍」（leap of faith）：寫這一層時，不要在腦中一路展開到最底層，而是直接「相信」小一號的呼叫已經照定義回傳了正確答案，只思考這一層怎麼使用它。為什麼可以相信？這就是數學歸納法（mathematical induction）：終止條件正確（起點成立），而且「只要小一號的都對，這一層就對」（遞推成立），那麼所有規模都對。' },
        { type: 'p', text: '河內塔（Tower of Hanoi）是最好的練習：三根柱子 A、B、C，n 個大小不同的盤子疊在 A 上，每次只能移動最上面的一個盤子，大盤不能壓在小盤上，要全部搬到 C。定義：`hanoi(n, from, to, via)` 把最上面 n 個盤子從 from 搬到 to，via 是暫放的柱子。終止條件：n = 0 時什麼都不用做。遞迴關係：先把上面 n − 1 個搬到 via（相信它做得到），再把最大的第 n 個盤子從 from 搬到 to，最後把那 n − 1 個從 via 搬到 to。' },
        { type: 'example', id: 'hanoi' },
        { type: 'p', text: '搬動次數 M(n) = 2M(n − 1) + 1，M(0) = 0，所以 M(n) = 2^n − 1：n = 3 是 7 步，n = 20 已經超過一百萬步。這個數量是問題本身要求的（每一步都要印出來），不是寫法的浪費；遞迴深度則只有 n 層。' },
        { type: 'callout', tone: 'warning', title: '終止條件寫了，卻走不到', text: '`def f(n): if n == 0: return 0; return 1 + f(n - 2)` 對偶數正確，但 f(5) 會走 5、3、1、−1、−3……永遠碰不到 0，直到 Python 丟出 `RecursionError`（C++ 可能直接當掉，Java 丟出 `StackOverflowError`，JavaScript 丟出 `RangeError: Maximum call stack size exceeded`）。同樣地，只寫 `n == 0` 的階乘遇到負數輸入也停不下來。修正方式：終止條件寫成涵蓋範圍的 `n <= 0`，或在進入遞迴前先檢查輸入是否合法（例如本課練習題對負數輸出 `Invalid`）。' },
      ],
    },
    {
      id: 'divide', title: '分治：拆開、各自解決、合併',
      blocks: [
        { type: 'p', text: '分治（divide and conquer）是一種特別的遞迴設計，分三步：拆分（divide）把問題切成幾個獨立、形式相同的子問題，通常是對半切；解決（conquer）遞迴處理每個子問題，夠小時直接回答；合併（combine）把子問題的答案組成原問題的答案。合併排序（A06）就是典型：切成左右兩半、各自排序、再用 O(n) 的合併把兩個有序陣列併起來。' },
        { type: 'p', text: '先看最簡單的分治：在 `a[lo..hi]` 中找最大值。區間只剩一個元素時，它就是最大值；否則從 `mid = (lo + hi) / 2` 切開，左半的最大值與右半的最大值，較大的那個就是整段的最大值。用同樣的骨架也能數偶數的個數：左半的個數加右半的個數，合併只是相加。' },
        { type: 'example', id: 'max-by-halves' },
        { type: 'p', text: '範例中 `count_even` 多了 `lo > hi` 的終止條件，讓空陣列也有定義（回傳 0）；最大值在空陣列上沒有意義，呼叫前要先確認 n ≥ 1。這兩個問題用一個迴圈也能 O(n) 解決，分治並沒有比較快，但它展示了「切半、合併」的骨架；合併排序、逆序數對、最近點對這些問題，正是靠同樣的骨架從 O(n²) 降到 O(n log n)。' },
        { type: 'p', text: '快速冪（fast exponentiation）是分治加上「兩個子問題其實一樣」的例子。x^b 可以由 x^(b/2) 組出來：b 是偶數時 x^b = (x^(b/2))²，b 是奇數時再多乘一個 x（`b / 2` 是整數除法）；終止條件 x^0 = 1。只要算一次 `half = power(x, b / 2)`，再用 `half * half`，每層 b 減半，b = 10^18 時只有約 60 層。' },
        { type: 'p', text: '次方很快就大到裝不下（2^100 有 31 位數），題目通常要求「除以 m 的餘數」。模運算（modular arithmetic）有一個關鍵性質：`(x × y) mod m = ((x mod m) × (y mod m)) mod m`，所以每次乘完立刻取餘數，數字就一直小於 m，答案不變。' },
        { type: 'example', id: 'fast-power' },
        { type: 'p', text: '每一行輸出「a^b mod m 的值」與「呼叫次數」。呼叫次數等於 b 的二進位位數加 1：b = 10 是 `1010`（4 位），呼叫 5 次；b = 10^18 有 60 位，呼叫 61 次。若用迴圈乘 b 次，10^18 次乘法要算好幾十年。第三行先把 a = 10^18 取餘數 `a % m` 才傳進去，否則 `half * a` 會溢位，原因見下表。' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java', 'JavaScript'], rows: [
          ['整數型別', '`long long`，64 位元，最大約 9.22×10^18；`int` 只到約 2.1×10^9', '`int` 沒有大小上限', '`long`，64 位元，最大約 9.22×10^18；`int` 只到約 2.1×10^9', '`number` 只能精確表示到 2^53（約 9.0×10^15）；`BigInt`（寫成 `10n`）沒有大小上限'],
          ['m ≤ 10^9 + 7 時的乘積', '兩個餘數都 < m，乘積 < 1.1×10^18，`long long` 放得下', '不會溢位', '同 C++，`long` 放得下', '乘積超過 2^53，`number` 會失去精確度；全部改用 `BigInt` 就不會出錯'],
          ['忘記先算 `a % m`', 'a 可能到 10^18，`r * a` 溢位（有號溢位是未定義行為）', '結果仍正確，只是數字變大、變慢', '`r * a` 溢位後默默繞回，答案錯誤', '用 `BigInt` 時同 Python：結果正確，只是變慢'],
          ['m 到 10^18 時', '乘積可能到 10^36，`unsigned long long` 也不夠；要用 `__int128`（GCC／Clang 擴充，非標準）或另寫模乘法', '不受影響', '用 `java.math.BigInteger`', '`BigInt` 不受影響'],
          ['現成函式', '標準函式庫沒有模冪；`std::pow` 是浮點數，不能用', '`pow(a, b, m)`', '`BigInteger.valueOf(a).modPow(...)`', '沒有模冪；`Math.pow` 是浮點數，不能用'],
        ] },
        { type: 'callout', tone: 'warning', title: '把 `half` 算兩次，快速冪就不快了', text: '寫成 `return power(x, b / 2) * power(x, b / 2)`，結果一樣正確，但每層有兩個遞迴呼叫，T(b) = 2T(b/2) + O(1)，總共約 2b 次呼叫，又回到 O(b)。分治省時間的關鍵往往是「相同的子問題只算一次」。另一個常見錯誤是用 `std::pow` 或 `Math.pow`（Java 與 JavaScript 都有）：它們回傳 `double`（浮點數），只有約 15～16 位有效數字，超過 2^53 的整數就不精確，取餘數的結果會錯。' },
      ],
    },
    {
      id: 'tree', title: '用遞迴樹估計成本',
      blocks: [
        { type: 'p', text: '遞迴樹把每一次呼叫畫成一個節點，它呼叫的子問題畫成子節點。估計時間的方法：寫出每個節點自己做的工作量（不含子呼叫），一層一層加總，再乘上（或加總）所有層。遞迴的深度就是樹高，也就是呼叫堆疊最多疊幾層，決定了額外的空間。' },
        { type: 'list', items: [
          '`T(n) = T(n/2) + O(1)`（快速冪、遞迴寫的二分搜尋）：每個節點只有一個子節點，樹是一條長度約 log₂ n 的鏈，每層 O(1)，總共 O(log n)；深度也是 O(log n)。',
          '`T(n) = 2T(n/2) + O(1)`（分治求最大值）：第 0 層 1 個節點、第 1 層 2 個、第 2 層 4 個……最底層約 n 個，總共約 1 + 2 + 4 + … + n ≈ 2n 個節點，每個 O(1)，所以是 O(n)，不是 O(log n)。8 個元素時正好 15 次呼叫。',
          '`T(n) = 2T(n/2) + O(n)`（合併排序）：第 k 層有 2^k 個節點，每個處理 n / 2^k 個元素，所以每一層合計都是 n；共約 log₂ n 層，總共 O(n log n)。',
          '`T(n) = T(n − 1) + T(n − 2) + O(1)`（直接遞迴的費氏數列）：每個節點分出兩個子節點，但規模只減 1 或 2，樹高約 n，節點數隨 n 指數成長，大約每多 1 就乘上 1.6 倍（黃金比例 φ ≈ 1.618）。',
        ] },
        { type: 'table', head: ['遞迴式', '例子', '樹的形狀', '時間', '遞迴深度'], rows: [
          ['`T(n) = T(n − 1) + O(1)`', '階乘、F18 的數字和', '一條長度 n 的鏈', 'O(n)', 'O(n)'],
          ['`T(n) = T(n/2) + O(1)`', '快速冪、二分搜尋', '一條長度 log n 的鏈', 'O(log n)', 'O(log n)'],
          ['`T(n) = 2T(n/2) + O(1)`', '分治求最大值', '完整二元樹，約 2n 個節點', 'O(n)', 'O(log n)'],
          ['`T(n) = 2T(n/2) + O(n)`', '合併排序', 'log n 層，每層合計 n', 'O(n log n)', 'O(log n)'],
          ['`T(n) = T(n − 1) + T(n − 2) + O(1)`', '直接遞迴的 fib', '高度 n，節點約 1.6^n', '指數', 'O(n)'],
        ] },
        { type: 'p', text: '下方的視覺化畫出 fib(5) 的完整呼叫樹：每個節點標著 `fib(k) = 回傳值`，右側是當下的呼叫堆疊。注意右邊的 fib(3) 把左邊已經算過的整棵子樹又算了一次，fib(2) 一共被算了 3 次；n 越大，重複的子樹越多，這就是指數時間的來源。呼叫次數 C(n) = 1 + C(n − 1) + C(n − 2)，C(0) = C(1) = 1，可以算出 C(5) = 15、C(20) = 21891、C(40) = 331160281。' },
        { type: 'callout', tone: 'note', title: '深度與總量是兩回事', text: '分治求最大值的樹只有約 log₂ n 層深，但節點總數約 2n：時間看總節點數，空間（呼叫堆疊）看深度。反過來，F18 的階乘每層只有一個呼叫，總量與深度都是 n。分析遞迴時兩者都要寫出來。' },
      ],
    },
    {
      id: 'memo', title: '重複子問題與記憶化',
      blocks: [
        { type: 'p', text: '當同一個子問題在遞迴樹裡出現很多次，稱為重複子問題（overlapping subproblems）。fib(k) 的答案只和 k 有關，算一次之後存起來，之後再被呼叫就直接回傳，這就是記憶化（memoization）：在函式開頭查表，有答案就回傳；沒有就照原本的遞迴關係算，回傳前存進表裡。' },
        { type: 'example', id: 'fib-memo' },
        { type: 'p', text: '每一行是 n、fib(n)、一般遞迴的呼叫次數、記憶化的呼叫次數（查表命中也算一次呼叫）。記憶化後，每個 k 只會「展開」一次，每次展開最多再發出兩個呼叫，n ≥ 1 時總共正好 2n − 1 次：n = 30 從 269 萬次降到 59 次，時間從指數變成 O(n)，代價是 O(n) 的記憶表。' },
        { type: 'list', items: [
          '記憶表的鍵就是「決定答案的參數」。fib 只需要 k；格子路徑 `paths(r, c)` 需要 (r, c)，用二維陣列存。',
          '要能分辨「還沒算」與「答案剛好是 0」：C++／Java 範例用 −1 代表還沒算（fib 不會是負數），Python 用字典的 `in`，JavaScript 用 `Map` 的 `has`。',
          'Python 的 `functools.cache`（3.9 起）或 `functools.lru_cache(maxsize=None)` 可以自動幫函式加上記憶化；C++、Java 與 JavaScript 沒有內建等價物，要自己寫陣列或 `std::map`／`HashMap`／`Map`。',
          '只有子問題真的重複時記憶化才有用。合併排序、快速冪、二分搜尋的每個子問題都只出現一次，加記憶表只會浪費空間。',
          '答案本身也可能溢位：fib(92) = 7540113804746346429 還在 64 位元範圍內，fib(93) 就超過了，C++／Java 需要取餘數或大數，Python 不受影響；JavaScript 的 `number` 在 fib(79) 就超過 2^53、不再精確，要改用 `BigInt`。',
        ] },
        { type: 'p', text: '記憶化是動態規劃（dynamic programming，A17）的入口：A17 會把同樣的遞迴關係改成「由小到大填表」的迴圈，不需要遞迴，也就沒有深度限制；也會說明怎麼定義狀態、決定填表順序。' },
        { type: 'callout', tone: 'warning', title: '記憶化不會減少遞迴深度', text: '記憶化版的 fib(n) 第一次呼叫時，仍然一路 fib(n) → fib(n − 1) → … → fib(1) 往下，深度還是 n。Python 算 fib(5000) 時就會超過預設約 1,000 層的上限丟出 `RecursionError`；要計算很大的 n，改用 A17 的迴圈填表。' },
      ],
    },
    {
      id: 'limits', title: '遞迴深度的限制與何時改用迴圈',
      blocks: [
        { type: 'p', text: '每一層遞迴都在呼叫堆疊上占一格，保存參數、區域變數與返回位置。深度只有 O(log n) 的遞迴（快速冪、合併排序、平衡的分治）幾乎不會有問題：10^18 也才約 60 層。深度和 n 一樣大的遞迴（處理長鏈、逐一減 1、退化成一條線的樹）在 n 很大時就會撞到限制。' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java', 'JavaScript'], rows: [
          ['深度上限', '沒有語言規定的上限，受執行緒堆疊大小限制（常見 1～8 MB），每層用多少記憶體決定能疊幾層', '直譯器預設的遞迴上限約 1,000 層（`sys.getrecursionlimit()` 可查）', '受執行緒堆疊大小限制（`-Xss` 可調），常見約數千到數萬層', 'Node.js 受 V8 引擎的堆疊大小限制（`node --stack-size` 可調），預設約一萬層，視每層用多少記憶體而定'],
          ['超過時', '堆疊溢位（stack overflow），程式通常直接當掉、沒有錯誤訊息', '`RecursionError`', '`StackOverflowError`', '`RangeError: Maximum call stack size exceeded`'],
          ['深度 10^5 的線性遞迴', '可能成功也可能當掉，取決於環境', '預設一定失敗', '可能失敗，取決於堆疊大小', '預設會失敗'],
        ] },
        { type: 'callout', tone: 'warning', title: '`sys.setrecursionlimit` 不是 10^5 層遞迴的解法', text: '`sys.setrecursionlimit(10**6)` 只是放寬 Python 的檢查，堆疊與記憶體並沒有變多。在某些 Python 版本或平台上，深度很大時直譯器會因為真正的堆疊用完而直接崩潰（segmentation fault），連 `RecursionError` 都沒有；就算剛好能跑，每層也要占記憶體、速度變慢，而且評測環境的版本與設定你無法控制。深度可能到 10^5 以上時，可靠的做法是改成迴圈，或用自己的堆疊（D05）模擬遞迴。' },
        { type: 'callout', tone: 'warning', title: 'C++ 與 Java 也會疊爆', text: 'C++ 遞迴太深時通常直接 segmentation fault，看起來像「程式莫名其妙停了」，很難除錯；Java 會丟出 `StackOverflowError`，JavaScript 丟出 `RangeError`。不要依賴「我的電腦跑得過」：遞迴深度可能到 10^5、10^6 的題目（例如一條很長的鏈、深度很大的樹或圖的 DFS），一律考慮改用迴圈。' },
        { type: 'p', text: '什麼時候該用遞迴、什麼時候改用迴圈？' },
        { type: 'list', items: [
          '適合遞迴：問題天生是樹狀或分治的（樹的走訪、合併排序、回溯 A12），而且深度是 O(log n) 或題目保證不深。遞迴版通常更短、更貼近定義，也比較不容易寫錯。',
          '改用迴圈：遞迴只是「每次減 1」的一條鏈（階乘、走訪鏈結串列、加總），迴圈一樣好寫又沒有深度問題；或深度可能到 10^4 以上。',
          '改成由小到大的迴圈：有重複子問題、深度又大時，用 A17 的填表法同時解決時間與深度。',
          '自己的堆疊：必須做深度很大的 DFS 時，用明確的堆疊（C++ `std::vector`、Python `list`、Java `ArrayDeque`、JavaScript 陣列）保存待處理的狀態（A15 會示範）。',
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'hanoi', title: '河內塔：n = 3 的每一步', description: '相信 hanoi(n − 1) 能把上面的盤子搬走，這一層只負責最大的盤子。每行是「盤子編號: 從 -> 到」，最後印出總步數 2^3 − 1 = 7。',
      output: '1: A -> C\n2: A -> B\n1: C -> B\n3: A -> C\n1: B -> A\n2: B -> C\n1: A -> C\nmoves 7',
      code: {
        'C++': code`#include <iostream>

int moves = 0;

// 把最上面 n 個盤子從 from 搬到 to，via 是暫放的柱子
void hanoi(int n, char from, char to, char via) {
    if (n == 0) return;              // 終止條件：沒有盤子要搬
    hanoi(n - 1, from, via, to);     // 相信它：上面 n - 1 個先移開
    moves++;
    std::cout << n << ": " << from << " -> " << to << "\n";
    hanoi(n - 1, via, to, from);     // 再把它們搬到最大的盤子上
}

int main() {
    hanoi(3, 'A', 'C', 'B');
    std::cout << "moves " << moves << "\n";
    return 0;
}`,
        Python: code`moves = 0


def hanoi(n, src, dst, via):
    """把最上面 n 個盤子從 src 搬到 dst，via 是暫放的柱子。"""
    global moves
    if n == 0:                    # 終止條件：沒有盤子要搬
        return
    hanoi(n - 1, src, via, dst)   # 相信它：上面 n - 1 個先移開
    moves += 1
    print(f"{n}: {src} -> {dst}")
    hanoi(n - 1, via, dst, src)   # 再把它們搬到最大的盤子上


hanoi(3, "A", "C", "B")
print("moves", moves)`,
        Java: code`public class Main {
    static int moves = 0;
    static StringBuilder out = new StringBuilder();

    // 把最上面 n 個盤子從 from 搬到 to，via 是暫放的柱子
    static void hanoi(int n, char from, char to, char via) {
        if (n == 0) return;              // 終止條件：沒有盤子要搬
        hanoi(n - 1, from, via, to);     // 相信它：上面 n - 1 個先移開
        moves++;
        out.append(n).append(": ").append(from).append(" -> ").append(to).append("\n");
        hanoi(n - 1, via, to, from);     // 再把它們搬到最大的盤子上
    }

    public static void main(String[] args) {
        hanoi(3, 'A', 'C', 'B');
        out.append("moves ").append(moves);
        System.out.println(out);
    }
}`,
        JavaScript: code`let moves = 0;
const out = [];

// 把最上面 n 個盤子從 from 搬到 to，via 是暫放的柱子
function hanoi(n, from, to, via) {
    if (n === 0) return;             // 終止條件：沒有盤子要搬
    hanoi(n - 1, from, via, to);     // 相信它：上面 n - 1 個先移開
    moves++;
    out.push(n + ": " + from + " -> " + to);
    hanoi(n - 1, via, to, from);     // 再把它們搬到最大的盤子上
}

hanoi(3, "A", "C", "B");
out.push("moves " + moves);
console.log(out.join("\n"));`,
      },
    },
    {
      id: 'max-by-halves', title: '分治：對半求最大值與偶數個數', description: '切成左右兩半各自求解，再合併：最大值取較大者，個數相加。陣列 `[3, 8, 1, 9, 4, 6, 7, 2]` 的最大值是 9，偶數有 8、4、6、2 共 4 個。',
      output: '9\n4',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int maxOf(const std::vector<int>& a, int lo, int hi) {
    if (lo == hi) return a[lo];               // 只剩一個元素
    int mid = (lo + hi) / 2;
    int left = maxOf(a, lo, mid);             // 拆分並解決
    int right = maxOf(a, mid + 1, hi);
    return left > right ? left : right;       // 合併
}

int countEven(const std::vector<int>& a, int lo, int hi) {
    if (lo > hi) return 0;                    // 空區間
    if (lo == hi) return a[lo] % 2 == 0 ? 1 : 0;
    int mid = (lo + hi) / 2;
    return countEven(a, lo, mid) + countEven(a, mid + 1, hi);
}

int main() {
    std::vector<int> a = {3, 8, 1, 9, 4, 6, 7, 2};
    int n = static_cast<int>(a.size());
    std::cout << maxOf(a, 0, n - 1) << "\n";
    std::cout << countEven(a, 0, n - 1) << "\n";
    return 0;
}`,
        Python: code`def max_of(a, lo, hi):
    if lo == hi:                      # 只剩一個元素
        return a[lo]
    mid = (lo + hi) // 2
    left = max_of(a, lo, mid)         # 拆分並解決
    right = max_of(a, mid + 1, hi)
    return max(left, right)           # 合併


def count_even(a, lo, hi):
    if lo > hi:                       # 空區間
        return 0
    if lo == hi:
        return 1 if a[lo] % 2 == 0 else 0
    mid = (lo + hi) // 2
    return count_even(a, lo, mid) + count_even(a, mid + 1, hi)


a = [3, 8, 1, 9, 4, 6, 7, 2]
print(max_of(a, 0, len(a) - 1))
print(count_even(a, 0, len(a) - 1))`,
        Java: code`public class Main {
    static int maxOf(int[] a, int lo, int hi) {
        if (lo == hi) return a[lo];               // 只剩一個元素
        int mid = (lo + hi) / 2;
        int left = maxOf(a, lo, mid);             // 拆分並解決
        int right = maxOf(a, mid + 1, hi);
        return Math.max(left, right);             // 合併
    }

    static int countEven(int[] a, int lo, int hi) {
        if (lo > hi) return 0;                    // 空區間
        if (lo == hi) return a[lo] % 2 == 0 ? 1 : 0;
        int mid = (lo + hi) / 2;
        return countEven(a, lo, mid) + countEven(a, mid + 1, hi);
    }

    public static void main(String[] args) {
        int[] a = {3, 8, 1, 9, 4, 6, 7, 2};
        System.out.println(maxOf(a, 0, a.length - 1));
        System.out.println(countEven(a, 0, a.length - 1));
    }
}`,
        JavaScript: code`function maxOf(a, lo, hi) {
    if (lo === hi) return a[lo];              // 只剩一個元素
    const mid = Math.floor((lo + hi) / 2);    // / 會保留小數，要取整數
    const left = maxOf(a, lo, mid);           // 拆分並解決
    const right = maxOf(a, mid + 1, hi);
    return Math.max(left, right);             // 合併
}

function countEven(a, lo, hi) {
    if (lo > hi) return 0;                    // 空區間
    if (lo === hi) return a[lo] % 2 === 0 ? 1 : 0;
    const mid = Math.floor((lo + hi) / 2);
    return countEven(a, lo, mid) + countEven(a, mid + 1, hi);
}

const a = [3, 8, 1, 9, 4, 6, 7, 2];
console.log(maxOf(a, 0, a.length - 1));
console.log(countEven(a, 0, a.length - 1));`,
      },
    },
    {
      id: 'fast-power', title: '快速冪：a^b mod m 與呼叫次數', description: '每層把 b 減半，只遞迴一次。三組輸入：2^10 mod 1000、3^200 mod (10^9 + 7)、(10^18)^(10^18) mod (10^9 + 7)；每行印出結果與呼叫次數。',
      output: '24 5\n136318165 9\n504853526 61',
      code: {
        'C++': code`#include <iostream>

long long calls = 0;

// 前提：0 <= a < m。回傳 a^b mod m
long long powerMod(long long a, long long b, long long m) {
    calls++;
    if (b == 0) return 1 % m;               // m = 1 時答案是 0
    long long half = powerMod(a, b / 2, m); // 只算一次
    long long r = half * half % m;          // 兩數都 < m，乘積 < 10^18
    if (b % 2 == 1) r = r * a % m;          // 奇數再多乘一個 a
    return r;
}

int main() {
    long long tests[3][3] = {{2, 10, 1000}, {3, 200, 1000000007},
                             {1000000000000000000LL, 1000000000000000000LL, 1000000007}};
    for (auto& t : tests) {
        calls = 0;
        long long value = powerMod(t[0] % t[2], t[1], t[2]);   // 先把 a 取餘數
        std::cout << value << " " << calls << "\n";
    }
    return 0;
}`,
        Python: code`calls = 0


def power_mod(a, b, m):
    """前提：0 <= a < m。回傳 a^b mod m。"""
    global calls
    calls += 1
    if b == 0:
        return 1 % m                  # m = 1 時答案是 0
    half = power_mod(a, b // 2, m)    # 只算一次
    r = half * half % m
    if b % 2 == 1:                    # 奇數再多乘一個 a
        r = r * a % m
    return r


tests = [(2, 10, 1000), (3, 200, 10**9 + 7), (10**18, 10**18, 10**9 + 7)]
for a, b, m in tests:
    calls = 0
    value = power_mod(a % m, b, m)    # 先把 a 取餘數
    assert value == pow(a, b, m)      # 與內建 pow 對照
    print(value, calls)`,
        Java: code`public class Main {
    static long calls = 0;

    // 前提：0 <= a < m。回傳 a^b mod m
    static long powerMod(long a, long b, long m) {
        calls++;
        if (b == 0) return 1 % m;               // m = 1 時答案是 0
        long half = powerMod(a, b / 2, m);      // 只算一次
        long r = half * half % m;               // 兩數都 < m，乘積 < 10^18
        if (b % 2 == 1) r = r * a % m;          // 奇數再多乘一個 a
        return r;
    }

    public static void main(String[] args) {
        long[][] tests = {{2, 10, 1000}, {3, 200, 1000000007},
                          {1000000000000000000L, 1000000000000000000L, 1000000007}};
        for (long[] t : tests) {
            calls = 0;
            long value = powerMod(t[0] % t[2], t[1], t[2]);   // 先把 a 取餘數
            System.out.println(value + " " + calls);
        }
    }
}`,
        JavaScript: code`let calls = 0;

// 前提：0n <= a < m。回傳 a^b mod m（全部是 BigInt：10^18 與乘積都超過 2^53）
function powerMod(a, b, m) {
    calls++;
    if (b === 0n) return 1n % m;            // m = 1 時答案是 0
    const half = powerMod(a, b / 2n, m);    // 只算一次；BigInt 的 / 會捨去小數
    let r = half * half % m;
    if (b % 2n === 1n) r = r * a % m;       // 奇數再多乘一個 a
    return r;
}

const tests = [[2n, 10n, 1000n], [3n, 200n, 1000000007n], [10n ** 18n, 10n ** 18n, 1000000007n]];
for (const [a, b, m] of tests) {
    calls = 0;
    const value = powerMod(a % m, b, m);    // 先把 a 取餘數
    console.log(String(value), calls);
}`,
      },
    },
    {
      id: 'fib-memo', title: '費氏數列：一般遞迴與記憶化的呼叫次數', description: '同一個 n 分別用一般遞迴與記憶化計算。每行印出 n、fib(n)、一般遞迴的呼叫次數、記憶化的呼叫次數。',
      output: '5 5 15 9\n10 55 177 19\n20 6765 21891 39\n30 832040 2692537 59',
      code: {
        'C++': code`#include <iostream>
#include <vector>

long long plainCalls = 0, memoCalls = 0;
std::vector<long long> memo;   // -1 代表還沒算

long long fibPlain(int n) {
    plainCalls++;
    if (n <= 1) return n;
    return fibPlain(n - 1) + fibPlain(n - 2);
}

long long fibMemo(int n) {
    memoCalls++;
    if (n <= 1) return n;
    if (memo[n] != -1) return memo[n];          // 算過了，直接查表
    memo[n] = fibMemo(n - 1) + fibMemo(n - 2);  // 第一次：算完存起來
    return memo[n];
}

int main() {
    for (int n : {5, 10, 20, 30}) {
        plainCalls = 0;
        memoCalls = 0;
        memo.assign(n + 1, -1);
        long long value = fibPlain(n);
        fibMemo(n);
        std::cout << n << " " << value << " " << plainCalls << " " << memoCalls << "\n";
    }
    return 0;
}`,
        Python: code`plain_calls = 0
memo_calls = 0
memo = {}


def fib_plain(n):
    global plain_calls
    plain_calls += 1
    if n <= 1:
        return n
    return fib_plain(n - 1) + fib_plain(n - 2)


def fib_memo(n):
    global memo_calls
    memo_calls += 1
    if n <= 1:
        return n
    if n in memo:                              # 算過了，直接查表
        return memo[n]
    memo[n] = fib_memo(n - 1) + fib_memo(n - 2)  # 第一次：算完存起來
    return memo[n]


for n in [5, 10, 20, 30]:
    plain_calls = 0
    memo_calls = 0
    memo.clear()
    value = fib_plain(n)
    fib_memo(n)
    print(n, value, plain_calls, memo_calls)`,
        Java: code`import java.util.Arrays;

public class Main {
    static long plainCalls = 0, memoCalls = 0;
    static long[] memo;   // -1 代表還沒算

    static long fibPlain(int n) {
        plainCalls++;
        if (n <= 1) return n;
        return fibPlain(n - 1) + fibPlain(n - 2);
    }

    static long fibMemo(int n) {
        memoCalls++;
        if (n <= 1) return n;
        if (memo[n] != -1) return memo[n];          // 算過了，直接查表
        memo[n] = fibMemo(n - 1) + fibMemo(n - 2);  // 第一次：算完存起來
        return memo[n];
    }

    public static void main(String[] args) {
        for (int n : new int[] {5, 10, 20, 30}) {
            plainCalls = 0;
            memoCalls = 0;
            memo = new long[n + 1];
            Arrays.fill(memo, -1);
            long value = fibPlain(n);
            fibMemo(n);
            System.out.println(n + " " + value + " " + plainCalls + " " + memoCalls);
        }
    }
}`,
        JavaScript: code`let plainCalls = 0, memoCalls = 0;
const memo = new Map();

function fibPlain(n) {
    plainCalls++;
    if (n <= 1) return n;
    return fibPlain(n - 1) + fibPlain(n - 2);
}

function fibMemo(n) {
    memoCalls++;
    if (n <= 1) return n;
    if (memo.has(n)) return memo.get(n);             // 算過了，直接查表
    memo.set(n, fibMemo(n - 1) + fibMemo(n - 2));   // 第一次：算完存起來
    return memo.get(n);
}

for (const n of [5, 10, 20, 30]) {
    plainCalls = 0;
    memoCalls = 0;
    memo.clear();
    const value = fibPlain(n);
    fibMemo(n);
    console.log(n, value, plainCalls, memoCalls);
}`,
      },
    },
  ],
  visualization: {
    kind: 'recursion-tree', title: 'fib(5) 的呼叫樹：重複的子問題', language: 'Python',
    code: code`def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(5))`,
    steps: traceSteps,
  },
  quiz: [
    {
      id: 'q-memo-calls', prompt: '一般遞迴版的 fib(5) 會呼叫 fib 幾次？下面的記憶化版本（查表命中也算一次呼叫）呼叫 fib(5) 時，`calls` 最後是多少？',
      code: { language: 'Python', text: 'calls = 0\nmemo = {}\n\ndef fib(n):\n    global calls\n    calls += 1\n    if n <= 1:\n        return n\n    if n in memo:\n        return memo[n]\n    memo[n] = fib(n - 1) + fib(n - 2)\n    return memo[n]\n\nfib(5)\nprint(calls)' },
      options: ['一般 15 次，記憶化 9 次', '一般 15 次，記憶化 6 次', '一般 9 次，記憶化 5 次', '一般 31 次，記憶化 9 次'],
      answer: 0,
      explanation: '一般遞迴的呼叫次數 C(n) = 1 + C(n − 1) + C(n − 2)，C(0) = C(1) = 1，得 C(5) = 15。記憶化時，fib(5)、fib(4)、fib(3)、fib(2) 各展開一次並各呼叫兩個子問題，加上最上層的一次：1 + 2 × 4 = 9（依序是 5、4、3、2、1、0、1、2、3，最後兩次查表命中）。6 是不同 n 值（0～5）的個數，但查表命中和重複的終止條件也是呼叫；31 是 2^5 − 1，是把樹當成完整二元樹的高估。兩個數字都實際執行程式確認過。',
    },
    {
      id: 'q-tree-cost', prompt: '下面的 h(n) 每次呼叫自己做 O(1) 的工作。呼叫 h(n)（n 是 2 的次方）的時間複雜度是？',
      code: { language: 'Python', text: 'def h(n):\n    if n <= 1:\n        return 1\n    return h(n // 2) + h(n // 2)' },
      options: ['O(log n)', 'O(n)', 'O(n log n)', 'O(2^n)'],
      answer: 1,
      explanation: '遞迴式 T(n) = 2T(n/2) + O(1)。畫遞迴樹：第 0 層 1 個節點、第 1 層 2 個……第 log₂ n 層有 n 個，總共 1 + 2 + … + n = 2n − 1 個節點，每個 O(1)，所以是 O(n)（h(1024) 實際呼叫 2047 次）。O(log n) 是樹的深度，不是節點總數；它只在「每層只有一個呼叫」時成立（例如快速冪只算一次 half）。O(n log n) 需要每層合計 O(n) 的工作，像合併排序；O(2^n) 是規模只減 1 的 fib 那種樹。',
    },
    {
      id: 'q-output', prompt: '這段分治程式印出什麼？',
      code: { language: 'Python', text: 'def f(a, lo, hi):\n    if lo == hi:\n        return a[lo]\n    mid = (lo + hi) // 2\n    return f(a, lo, mid) - f(a, mid + 1, hi)\n\nprint(f([5, 1, 4, 2], 0, 3))' },
      options: ['2', '-2', '6', '12'],
      answer: 0,
      explanation: 'f(0, 3) 從 mid = 1 切開：左半 f(0, 1) = f(0, 0) − f(1, 1) = 5 − 1 = 4，右半 f(2, 3) = 4 − 2 = 2，合併 4 − 2 = 2。−2 是由左到右依序相減 5 − 1 − 4 − 2；6 是從右邊開始巢狀相減 5 − (1 − (4 − 2))；12 是總和。分治的合併順序由切法決定，要照遞迴樹一層層算。已執行程式確認輸出 2。',
    },
    {
      id: 'q-bug', prompt: '下面的函式想計算「從 n 每次減 2 到 0 要幾步」。呼叫 `count_down(5)` 會怎樣？',
      code: { language: 'Python', text: 'def count_down(n):\n    if n == 0:\n        return 0\n    return 1 + count_down(n - 2)\n\nprint(count_down(5))' },
      options: ['印出 2', '印出 3', '丟出 RecursionError', '印出 0'],
      answer: 2,
      explanation: 'n 依序是 5、3、1、−1、−3……奇數永遠不會等於 0，終止條件存在卻走不到，直到超過 Python 預設約 1,000 層的上限而丟出 RecursionError（已執行確認；count_down(4) 則正常印出 2）。印出 2 或 3 是假設它會在 1 附近停下，但程式沒有這樣的條件。修正：把終止條件改成 `n <= 0`，或在呼叫前拒絕奇數與負數輸入。',
    },
    {
      id: 'q-overlap', prompt: '下面哪一個遞迴有大量重複的子問題，加上記憶化能大幅加速？',
      options: [
        '合併排序：`sort(lo, mid)` 與 `sort(mid + 1, hi)` 再合併',
        '快速冪：`half = power(a, b // 2)`，再回傳 `half * half`（必要時乘 a）',
        '格子路徑數：`paths(r, c) = paths(r - 1, c) + paths(r, c - 1)`，`paths(0, c) = paths(r, 0) = 1`',
        '遞迴的二分搜尋：每次只往左半或右半其中一邊遞迴',
      ],
      answer: 2,
      explanation: '`paths(r - 1, c)` 與 `paths(r, c - 1)` 都會呼叫 `paths(r - 1, c - 1)`，越往下重複越多，呼叫次數隨 r + c 指數成長；以 (r, c) 為鍵記憶化後，每個格子只算一次，O(rc)。合併排序的子問題是不重疊的區間，每段只出現一次；快速冪每層只有一個子問題（已經只算一次 half）；二分搜尋每次只走一邊。這三個加記憶表都不會變快。',
    },
    {
      id: 'q-deep', prompt: '在 Python 中要處理一條有 10^5 個節點的鏈（例如逐一加總），目前的寫法是每個節點遞迴一層。最可靠的做法是？',
      options: [
        '把 `sys.setrecursionlimit` 調到 `10**6`，一定安全，不必改寫',
        '改寫成迴圈（或用自己的堆疊），深度不再受限',
        '加上記憶化，遞迴深度就會變小',
        '改用 C++ 寫同樣的遞迴，C++ 沒有遞迴深度限制',
      ],
      answer: 1,
      explanation: '深度 10^5 遠超過 Python 預設約 1,000 層的上限。調高上限只是放寬檢查，真正的堆疊與記憶體沒有變多，視版本與平台可能直接崩潰，評測環境也無法控制，所以「一定安全」不成立。記憶化減少的是重複計算，不會減少深度（每個節點本來就只走一次）。C++ 雖然沒有語言規定的上限，但受執行緒堆疊大小限制，太深一樣會堆疊溢位而當掉。一條鏈的走訪用迴圈同樣好寫，是最穩的選擇。',
    },
  ],
  exercises: [
    {
      id: 'e-power-mod', title: '快速模冪',
      statement: '有 T 組詢問，每組給三個整數 a、b、m，請輸出 a^b 除以 m 的餘數（定義 a^0 = 1，包括 0^0 = 1，所以 b = 0 時答案是 `1 % m`）。b 可以大到 10^18，逐一相乘 b 次太慢，請用遞迴的快速冪：每層把 b 減半，只遞迴一次。a 也可能到 10^18，要先算 `a % m` 再開始乘，讓每次相乘的兩個數都小於 m ≤ 10^9，乘積小於 10^18，放得進 C++ `long long` 與 Java `long`（JavaScript 的 `number` 只能精確表示到 2^53，要用 `BigInt`）。某一組的 a 或 b 是負數，或 m ≤ 0 時，那一行輸出 `Invalid`，其他組照常輸出。',
      inputFormat: '第一行一個整數 T。接下來 T 行，每行三個整數 a、b、m，以空白分隔。',
      outputFormat: 'T 行，第 i 行是第 i 組的 a^b mod m；不合法的那一組輸出 `Invalid`。',
      constraints: ['1 ≤ T ≤ 10^4', '合法的詢問：0 ≤ a ≤ 10^18，0 ≤ b ≤ 10^18，1 ≤ m ≤ 10^9', '每個數字都在 64 位元有號整數範圍內；a 或 b 為負數、或 m ≤ 0 的那一組輸出 Invalid'],
      samples: [{ kind: 'normal', input: '3\n2 10 1000\n3 0 7\n5 3 13', output: '24\n1\n8', note: '1024 mod 1000 = 24；b = 0 時是 1；125 = 9 × 13 + 8' }],
      tests: [
        { kind: 'normal', input: '3\n2 10 1000\n3 0 7\n5 3 13', output: '24\n1\n8', note: '範例' },
        { kind: 'normal', input: '1\n3 200 1000000007', output: '136318165', note: '3^200 有 96 位數，必須邊乘邊取餘數' },
        { kind: 'normal', input: '2\n123456789 987654321 998244353\n2 1000000000000000000 1000000007', output: '730701112\n719476260', note: '大指數：逐一相乘要 10^18 次' },
        { kind: 'edge', input: '4\n7 0 1\n7 0 5\n0 0 7\n0 5 7', output: '0\n1\n1\n0', note: 'b = 0 時答案是 1 % m（m = 1 時是 0）；0^0 = 1；0 的正次方是 0' },
        { kind: 'edge', input: '2\n5 3 1\n1000000000000000000 1000000000000000000 1', output: '0\n0', note: 'm = 1 時任何數的餘數都是 0' },
        { kind: 'edge', input: '3\n999999999999999999 1000000000000000000 1000000000\n999999999999999999 1000000000000000000 999999937\n999999998 999999999999999999 999999999', output: '1\n209721133\n999999998', note: '溢位陷阱：沒有先算 a % m 時 a × a 會溢位；餘數接近 m 時乘積接近 10^18' },
        { kind: 'edge', input: '2\n1000000000 5 1000000000\n1000000000000000000 1 999999937', output: '0\n3969', note: 'a 是 m 的倍數；b = 1 時答案是 a % m' },
        { kind: 'edge', input: bigInput, output: bigOutput, note: '最大規模：10^4 組，a、b 接近 10^18、m 接近 10^9（測資由程式產生）' },
        { kind: 'error', input: '3\n2 -1 5\n2 10 0\n2 10 -7', output: 'Invalid\nInvalid\nInvalid', note: '負指數、m = 0、負的 m' },
        { kind: 'error', input: '3\n2 5 7\n-3 2 5\n2 5 7', output: '4\nInvalid\n4', note: '只有不合法的那一組輸出 Invalid，前後的詢問照常回答' },
      ],
      hints: [
        '定義 `power(a, b, m)`：在 0 ≤ a < m 的前提下回傳 a^b mod m。終止條件：b = 0 時回傳 `1 % m`（不要直接回傳 1，m = 1 時答案是 0）。',
        '遞迴關係：`half = power(a, b / 2, m)`，結果是 `half * half % m`；b 是奇數時再乘 a、再取一次餘數。half 只能算一次。',
        '先檢查 a、b 是否為負、m 是否 ≤ 0，再把 a 換成 `a % m` 才呼叫；遞迴深度只有約 60 層，不必擔心深度限制。Python 可以用內建的 `pow(a, b, m)` 檢查自己的答案。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>

// 前提：0 <= a < m <= 10^9。回傳 a^b mod m
long long powerMod(long long a, long long b, long long m) {
    if (b == 0) return 1 % m;
    long long half = powerMod(a, b / 2, m);
    long long r = half * half % m;      // 乘積 < 10^18，long long 放得下
    if (b % 2 == 1) r = r * a % m;
    return r;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int t;
    std::cin >> t;
    std::string out;
    for (int i = 0; i < t; i++) {
        long long a, b, m;
        std::cin >> a >> b >> m;
        if (a < 0 || b < 0 || m <= 0) {
            out += "Invalid\n";
        } else {
            out += std::to_string(powerMod(a % m, b, m)) + "\n";
        }
    }
    std::cout << out;
    return 0;
}`,
        Python: code`import sys


def power_mod(a, b, m):
    """前提：0 <= a < m。回傳 a^b mod m。"""
    if b == 0:
        return 1 % m
    half = power_mod(a, b // 2, m)
    r = half * half % m
    if b % 2 == 1:
        r = r * a % m
    return r


def main():
    data = sys.stdin.read().split()
    t = int(data[0])
    out = []
    for i in range(t):
        a, b, m = (int(x) for x in data[1 + 3 * i:4 + 3 * i])
        if a < 0 or b < 0 or m <= 0:
            out.append("Invalid")
        else:
            out.append(str(power_mod(a % m, b, m)))
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringTokenizer;

public class Main {
    // 前提：0 <= a < m <= 10^9。回傳 a^b mod m
    static long powerMod(long a, long b, long m) {
        if (b == 0) return 1 % m;
        long half = powerMod(a, b / 2, m);
        long r = half * half % m;       // 乘積 < 10^18，long 放得下
        if (b % 2 == 1) r = r * a % m;
        return r;
    }

    static BufferedReader in;
    static StringTokenizer st;

    static long next() throws IOException {
        while (st == null || !st.hasMoreTokens()) st = new StringTokenizer(in.readLine());
        return Long.parseLong(st.nextToken());
    }

    public static void main(String[] args) throws IOException {
        in = new BufferedReader(new InputStreamReader(System.in));
        int t = (int) next();
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < t; i++) {
            long a = next(), b = next(), m = next();
            if (a < 0 || b < 0 || m <= 0) out.append("Invalid\n");
            else out.append(powerMod(a % m, b, m)).append('\n');
        }
        System.out.print(out);
    }
}`,
        JavaScript: code`// 前提：0n <= a < m <= 10^9。回傳 a^b mod m
// 乘積可到 10^18，超過 number 能精確表示的 2^53，所以全部用 BigInt
function powerMod(a, b, m) {
    if (b === 0n) return 1n % m;
    const half = powerMod(a, b / 2n, m);
    let r = half * half % m;
    if (b % 2n === 1n) r = r * a % m;
    return r;
}

const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/);
const t = Number(data[0]);
const out = [];
for (let i = 0; i < t; i++) {
    const a = BigInt(data[1 + 3 * i]);
    const b = BigInt(data[2 + 3 * i]);
    const m = BigInt(data[3 + 3 * i]);
    if (a < 0n || b < 0n || m <= 0n) {
        out.push("Invalid");
    } else {
        out.push(String(powerMod(a % m, b, m)));
    }
}
console.log(out.join("\n"));`,
      },
      judge: 'none',
    },
  ],
};

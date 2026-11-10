import type { LessonContent, TraceStep } from '../schema';
import { lowerBoundSteps } from '../simulate-algorithms';

const code = String.raw;

/** The visualization's data: duplicates of 4, so the first probe (mid = 4) hits a 4 and the search still goes left. */
const TRACE_A = [1, 2, 4, 4, 4, 7, 9, 12];
const TRACE_X = 4;

/**
 * lowerBoundSteps runs the half-open lower bound of the trace code. Its 'compare' event covers both branches; each
 * compare step is moved here to the line of the branch it took (line 6 `lo = mid + 1` or line 8 `hi = mid`), and the
 * result step to the print on line 11.
 */
const traceSteps: TraceStep[] = lowerBoundSteps(TRACE_A, TRACE_X, { init: 2, compare: 6, result: 11 }).map((step, k, all): TraceStep => {
  if (k === all.length - 1) return { ...step, note: `${step.note}迴圈結束時 lo = hi，函式回傳 lo，第 11 行印出 ${step.output}。注意第一次比較時 a[4] 就等於 4，但它不一定是第一個 4，所以 lower bound 不會停下來，而是把 hi 移到 4 繼續往左找。` };
  if (step.vars?.mid === undefined) return step;
  const tookLo = step.vars.lo === String(Number(step.vars.mid) + 1);
  return { ...step, line: tookLo ? 6 : 8 };
});

/**
 * Exercise worst cases, generated here: n = 2×10^5 values and q = 5×10^4 queries (the test runner keeps a program's
 * output under 1 MB, so q stays below its 2×10^5 limit; O(nq) is still 10^10 comparisons).
 */
const BIG_N = 200_000;
const BIG_Q = 50_000;
const bigValues = Array.from({ length: BIG_N }, (_, i) => -1_000_000_000 + Math.floor(i / 4) * 40_000);
/** One query per distinct value: equal to it, one above it, or one below it, in turn. */
const bigQueries = Array.from({ length: BIG_Q }, (_, j) => -1_000_000_000 + 40_000 * j + [0, 1, -1][j % 3]);
const bigInput = `${BIG_N}\n${bigValues.join(' ')}\n${BIG_Q}\n${bigQueries.join(' ')}`;
/**
 * Expected counts by a formula independent of binary search: the values are −10^9 + 40000·m (m = 0..49999), each 4
 * times; checked against a brute-force counter on a scaled copy and against the reference solutions.
 */
const bigOutput = bigQueries.map(x => {
  const d = x + 1_000_000_000;
  const less = 4 * Math.min(BIG_N / 4, Math.max(0, Math.ceil(d / 40_000)));
  const equal = d % 40_000 === 0 && d / 40_000 < BIG_N / 4 ? 4 : 0;
  return `${less} ${equal} ${BIG_N - less - equal}`;
}).join('\n');
const sameInput = `${BIG_N}\n${Array(BIG_N).fill('7').join(' ')}\n${BIG_Q}\n${Array(BIG_Q).fill('7').join(' ')}`;
const sameOutput = Array(BIG_Q).fill(`0 ${BIG_N} 0`).join('\n');

/**
 * A04 Binary Search. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also
 * offers JavaScript (Node.js): midpoints are Math.floor((lo + hi) / 2), isqrt uses BigInt (inputs up to 2^63 − 1),
 * and since JavaScript has no built-in binary search, bounds-count checks against an O(n) findIndex.
 */
export const A04: LessonContent = {
  lessonId: 'A04',
  motivation: '在 100 萬筆已排好的學號裡找一個人，線性搜尋（A03）最壞要比較 100 萬次；二分搜尋（binary search）每比較一次就丟掉一半，最多 20 次。它是「先排序一次，之後查很多次」的標準工具：查一個值在不在、找第一個大於等於 x 的位置、數出某個值出現幾次、找門檻（第一個超過標準的分數）。更進一步，只要「答案越大越容易成立」這種單調性存在，就能直接對答案二分搜，例如求最小的貨車容量、整數平方根。它的限制是：資料必須依同一個順序排好（或判斷條件必須單調），而且要能用索引在 O(1) 時間跳到中間（陣列可以，鏈結串列不行）；如果資料沒排好又只查一次，先排序 O(n log n) 反而比線性搜尋 O(n) 慢；邊界寫錯一個字就會漏掉答案或陷入無窮迴圈，這也是本課最花時間的部分。',
  sections: [
    {
      id: 'idea', title: '核心想法：有序資料，每次丟掉一半',
      blocks: [
        { type: 'p', text: '猜 1～100 的數字時，每次都猜中間，對方回答「太大」或「太小」，最多 7 次就能猜中。二分搜尋在陣列上做同一件事：看搜尋範圍正中間的元素 `a[mid]`，和目標比較；因為陣列由小到大排好，`a[mid]` 太小時，它左邊的元素一定也太小，整個左半邊都可以丟掉，反之丟掉右半邊。每一回合範圍至少減半，n 個元素最多 ⌊log₂ n⌋ + 1 回合。' },
        { type: 'table', head: ['資料量 n', '線性搜尋最壞比較次數', '二分搜尋最壞回合數'], rows: [
          ['10', '10', '4'],
          ['1,000', '1,000', '10'],
          ['10^6', '10^6', '20'],
          ['10^9', '10^9', '30'],
        ] },
        { type: 'p', text: '前提有兩個。第一，資料要依比較的順序排好；更精確地說，是「判斷條件」要單調：例如「`a[i] >= x`」在陣列前段都不成立、從某個位置開始全部成立，二分搜尋找的就是這個分界。第二，要能在 O(1) 時間取得 `a[mid]`：C++ `std::vector`、Python `list`、Java 陣列與 `ArrayList`、JavaScript 陣列都可以；鏈結串列要從頭走到中間，二分搜尋就失去意義。' },
        { type: 'callout', tone: 'warning', title: '資料沒排好，結果沒有意義', text: '二分搜尋不會檢查資料有沒有排好。在 `[7, 2, 9, 4, 5]` 中找 2：第一回合 `a[2] = 9 > 2`，丟掉右半邊；第二回合 `a[0] = 7 > 2`，範圍變空，回傳 −1，但 2 明明在索引 1。函式庫也一樣：C++ 的 `std::lower_bound` 要求範圍已依目標分好（否則行為未定義），Python 的 `bisect` 不報錯但回傳的位置沒有意義，Java 文件寫明未排序時「結果未定義」。本課的視覺化與「相關互動實驗」裡的 Binary Search 實驗室都會拒絕未排序的輸入。' },
        { type: 'p', text: '什麼時候值得先排序？只查一次時，線性搜尋 O(n) 最划算；要查 q 次時，先排序 O(n log n)，之後每次 O(log n)，總共 O((n + q) log n)，遠比 q 次線性搜尋的 O(nq) 快。如果只需要回答「在不在」，雜湊集合（D08、D10）平均 O(1) 也很好；但「有幾個小於 x」「第一個大於等於 x 的是誰」這類問題，只有排好序的資料才能回答。頁面下方「相關互動實驗」中的 Binary Search 實驗室可以輸入自己的資料，一步步看搜尋範圍如何縮小。' },
      ],
    },
    {
      id: 'closed-interval', title: '精確搜尋：閉區間 [lo, hi] 與迴圈不變量',
      blocks: [
        { type: 'p', text: '最常見的寫法用閉區間（closed interval）`[lo, hi]`：一開始 `lo = 0`、`hi = n − 1`；只要 `lo <= hi`（範圍裡還有元素）就取 `mid`，比較後有三種情況：相等就回傳 mid；`a[mid] < target` 就令 `lo = mid + 1`；`a[mid] > target` 就令 `hi = mid − 1`。' },
        { type: 'p', text: '為什麼對？靠的是迴圈不變量（loop invariant）：「如果 target 存在，它一定在 `a[lo..hi]` 裡」。一開始範圍是整個陣列，當然成立。`a[mid] < target` 時，因為有序，`a[0..mid]` 都 ≤ `a[mid]` < target，全部不可能是答案，丟掉它們（`lo = mid + 1`）後不變量仍成立；另一邊同理。每一步只丟掉「不可能的答案」，所以不會漏掉 target。' },
        { type: 'p', text: '為什麼會停？mid 一定落在 `[lo, hi]` 裡，而且三種情況都把 mid 本身排除，所以範圍的大小 `hi − lo + 1` 每回合至少減 1（實際上大約減半）。範圍變空（`lo > hi`）時，依不變量，target 不在陣列裡，回傳 −1。' },
        { type: 'example', id: 'exact-search' },
        { type: 'p', text: '找 23：範圍 `[0, 9]`，mid = 4（16 太小）→ `[5, 9]`，mid = 7（56 太大）→ `[5, 6]`，mid = 5 找到，共 3 回合。找 7 時：mid = 4（16）→ `[0, 3]`，mid = 1（5）→ `[2, 3]`，mid = 2（8）→ `lo = 2`、`hi = 1`，範圍空了，回傳 −1。結束時的 lo = 2 正好是 7「應該插入」的位置，這就是下一節 lower bound 的由來。10 個元素最多 4 回合，符合 ⌊log₂ 10⌋ + 1 = 4。' },
        { type: 'p', text: '中點寫成 `mid = lo + (hi − lo) / 2`，而不是 `(lo + hi) / 2`。兩者數學上相同（hi ≥ lo 時，C++／Java 的整數除法與 Python 的 `//` 都是無條件捨去），差別在溢位：C++ 與 Java 的 `int` 最大是 2^31 − 1 = 2147483647，`lo + hi` 可能先超過它。陣列很少大到這樣，但對答案二分搜時範圍常到 10^9 甚至更大，`lo = 1.5×10^9`、`hi = 2×10^9` 的和就已經溢位。`hi − lo` 不會超過 hi，所以安全。Python 的整數沒有大小上限，不會溢位，但用同一個寫法讓 C++、Java、Python 一致。JavaScript 的 `/` 會保留小數，中點要寫 `Math.floor((lo + hi) / 2)`；`number` 在 2^53（約 9 × 10^15）以內都是精確整數，`lo + hi` 不會溢位，但 `(lo + hi) >> 1` 會先轉成 32 位元整數，`lo + hi` 超過 2^31 − 1 時一樣會算錯。' },
        { type: 'callout', tone: 'warning', title: '`(lo + hi) / 2` 的溢位', text: 'Java 的 `int` 溢位會繞回負數（不丟例外），mid 變成負的，接著 `a[mid]` 丟出 `ArrayIndexOutOfBoundsException`，或在對答案二分搜時默默算錯；C++ 有號整數溢位是未定義行為（undefined behavior），什麼都可能發生。Joshua Bloch 在 2006 年撰文指出，Java 標準函式庫的 `Arrays.binarySearch` 多年來都藏著這個錯誤（之後已修正）。安全的寫法：`lo + (hi - lo) / 2`；Java 也可以寫 `(lo + hi) >>> 1`（無號右移，lo、hi 都非負時正確）；範圍本身超過 `int` 時，lo、hi、mid 都改用 C++ `long long`／Java `long`。' },
      ],
    },
    {
      id: 'bounds', title: 'lower bound、upper bound 與函式庫',
      blocks: [
        { type: 'p', text: '有重複值時，精確搜尋只保證回傳「某一個」相等的位置。在 `[1, 2, 4, 4, 4, 7, 9, 12]` 找 4，相關互動實驗裡的閉區間寫法第一回合取 mid = 3，`a[3] = 4` 就停了，回傳 3，而不是第一個 4 的索引 2。很多問題要的是邊界：lower bound 是第一個 ≥ x 的位置，upper bound 是第一個 > x 的位置。答案可能是 0～n 共 n + 1 種（n 代表「全部都比 x 小」），所以改用半開區間（half-open interval）`[lo, hi)`：`lo = 0`、`hi = n`，條件 `while lo < hi`。' },
        { type: 'p', text: 'lower bound 的不變量：「lo 左邊的元素都 < x，hi 以右（含 hi）的元素都 ≥ x」。一開始左右兩邊都沒有元素，自然成立。`a[mid] < x` 時，mid 和它左邊都 < x，令 `lo = mid + 1`；否則 `a[mid] ≥ x`，mid 可能就是答案，令 `hi = mid`，把它放進「≥ x」的那一邊而不是丟掉。`lo < hi` 時 mid 一定 < hi，兩種更新都讓範圍變小；結束時 `lo == hi`，左邊全部 < x、從 lo 開始全部 ≥ x，lo 就是第一個 ≥ x 的位置。' },
        { type: 'p', text: '下方的視覺化在同一個陣列上跑 lower bound：第一回合 `a[4] = 4` 雖然等於 x，仍把 hi 移到 4 繼續往左，最後停在索引 2。視覺化的「自己試試看」執行的則是相關互動實驗的精確搜尋（閉區間、找到就停），用同樣的資料找 4 會停在索引 3，正好對照兩者的差別。' },
        { type: 'table', head: ['項目', 'lower bound', 'upper bound'], rows: [
          ['定義', '第一個 ≥ x 的位置', '第一個 > x 的位置'],
          ['往右移（`lo = mid + 1`）的條件', '`a[mid] < x`', '`a[mid] <= x`'],
          ['結果同時是', '< x 的個數', '≤ x 的個數'],
          ['x 不存在時', '兩者相同，都是插入點', '兩者相同，都是插入點'],
          ['x 比全部都大時', 'n', 'n'],
        ] },
        { type: 'list', items: [
          'x 出現的次數：`upper − lower`（等於 0 就是不存在）。',
          '第一次出現的位置：`lower`，但要先確認 `lower < n` 而且 `a[lower] == x`。',
          '最後一次出現的位置：`upper − 1`（次數大於 0 時）。',
          '大於 x 的個數：`n − upper`；最後一個 < x 的元素在 `lower − 1`（lower > 0 時）。',
        ] },
        { type: 'example', id: 'bounds-count' },
        { type: 'p', text: '範例中自己寫的兩個函式只差一個字（`<` 與 `<=`），C++、Python、Java 都和函式庫的結果相同（`library=same`）；JavaScript 沒有內建的二分搜尋，範例改和 O(n) 的 `findIndex` 對照。注意 x = 13 時 lower = 8 = n，直接讀 `a[lower]` 會越界，所以先檢查次數。各語言的函式庫如下：' },
        { type: 'table', head: ['語言', '函式', '回傳', '注意'], rows: [
          ['C++', '`std::lower_bound(first, last, x)`', '第一個 ≥ x 的迭代器，沒有就是 `last`', '在 `<algorithm>`；減掉 `a.begin()` 得到索引'],
          ['C++', '`std::upper_bound(first, last, x)`', '第一個 > x 的迭代器', '`std::equal_range` 一次回傳兩者'],
          ['C++', '`std::binary_search(first, last, x)`', '`bool`：在不在', '不給位置；要位置就用 `lower_bound`'],
          ['Python', '`bisect.bisect_left(a, x)`', 'lower bound 的索引', 'Python 3.10 起可以傳 `key=`'],
          ['Python', '`bisect.bisect_right(a, x)`（即 `bisect.bisect`）', 'upper bound 的索引', '`insort` 插入並保持有序，但插入本身是 O(n)'],
          ['Java', '`Arrays.binarySearch(a, key)`', '找到：某一個相等的索引；找不到：−(插入點) − 1', '有重複時不保證是第一個'],
          ['Java', '`Collections.binarySearch(list, key)`', '同上，用於 `List`', '`LinkedList` 這類不能隨機存取的 List 要走 O(n) 步'],
          ['JavaScript', '（沒有內建）', '—', '自己寫半開區間的 lower／upper bound；`indexOf`、`findIndex` 都是 O(n) 的線性搜尋'],
        ] },
        { type: 'callout', tone: 'warning', title: 'Java 的 `Arrays.binarySearch` 不是 lower bound', text: '找得到時，它回傳「任何一個」相等元素的索引，重複值有好幾個時，文件不保證是哪一個，所以不能拿來找第一個或數個數。找不到時回傳 `−(插入點) − 1`，插入點是第一個比 key 大的位置（也就是 lower bound），例如範例中找 5 回傳 −(5) − 1 = −6；減 1 是為了讓「插入點 0」變成 −1，和「在索引 0 找到」區分開。還原插入點：`int ip = r >= 0 ? r : -r - 1;`。Java 標準函式庫沒有陣列的 lower bound，需要時就自己寫（如範例與練習題的 Java 解答），或改用 `TreeSet`／`TreeMap` 的 `ceiling`、`higher`（不允許重複鍵，D08、D14）。' },
        { type: 'callout', tone: 'note', title: '在 `std::set` 上要用成員函式', text: '`std::lower_bound(s.begin(), s.end(), x)` 對 `std::set` 也能編譯，但 set 的迭代器不能跳到中間，只能一步一步走，總共 O(n)。應該寫 `s.lower_bound(x)`，它沿著平衡樹往下找，是 O(log n)。' },
      ],
    },
    {
      id: 'traps', title: '邊界陷阱：差一錯誤與無窮迴圈',
      blocks: [
        { type: 'p', text: '二分搜尋的錯誤幾乎都來自「區間的定義、迴圈條件、更新方式」三者沒有搭配好，造成差一錯誤（off-by-one error）或無窮迴圈。選定一種模板就整組照抄，不要混用：' },
        { type: 'table', head: ['模板', '區間', '迴圈條件', '更新', '結束時'], rows: [
          ['精確搜尋', '閉區間，`hi = n − 1`', '`lo <= hi`', '`lo = mid + 1`／`hi = mid − 1`', '找到就回傳；`lo > hi` 代表不存在'],
          ['lower／upper bound（找第一個成立）', '半開區間，`hi = n`', '`lo < hi`', '`lo = mid + 1`／`hi = mid`，mid 向下取整', '`lo == hi` 就是答案（可能是 n）'],
          ['找最後一個成立', '閉區間，答案一定在裡面', '`lo < hi`', '`lo = mid`／`hi = mid − 1`，mid 向上取整', '`lo == hi` 就是答案'],
        ] },
        { type: 'p', text: '判斷有沒有寫對的原則：每一個分支都必須讓區間真的變小。分支是 `hi = mid` 時，mid 必須 < hi（向下取整的 mid 在 `lo < hi` 時一定做到）；分支是 `lo = mid` 時，mid 必須 > lo，所以要向上取整：`mid = lo + (hi − lo + 1) / 2`，或寫成不會溢位的 `hi − (hi − lo) / 2`。' },
        { type: 'callout', tone: 'warning', title: '一個真的停不下來的例子', text: '想找「最後一個 ≤ x 的索引」，寫成 `while lo < hi: mid = (lo + hi) // 2; if a[mid] <= x: lo = mid; else: hi = mid - 1`。在 `[1, 3, 5, 7]` 找 x = 8：(lo, hi, mid) 依序是 (0, 3, 1) → (1, 3, 2) → (2, 3, 2) → (2, 3, 2) → …。只剩兩個元素時（`hi = lo + 1`），向下取整的 mid 等於 lo，`lo = mid` 沒有前進，程式永遠停不下來。改成向上取整的 mid 就會得到 3；或者改求「第一個 > x 的位置」（upper bound）再減 1。' },
        { type: 'list', items: [
          '`<` 與 `<=` 搭錯：閉區間卻寫 `while lo < hi`，`lo == hi` 時剩下的那一個元素沒被檢查。在 `[5]` 找 5、在 `[1, 3, 5]` 找 5 都會錯誤地回傳 −1。',
          '半開區間卻寫 `while lo <= hi`：在 `[1, 3]` 求 3 的 lower bound，lo = hi = 1 之後 mid = 1、`hi = mid` 不變，無窮迴圈；求 5 的 lower bound 時 mid 會等於 n = 2，讀 `a[2]` 越界（Python `IndexError`、Java `ArrayIndexOutOfBoundsException`、C++ 未定義行為、JavaScript 安靜地得到 `undefined`）。',
          '半開區間卻寫 `hi = mid − 1`：mid 可能正是答案，卻被丟掉了。',
          'lower bound 的條件寫成 `a[mid] <= x`：得到的是 upper bound，「小於 x 的個數」就多算了等於 x 的那些。',
          '用 lower 的結果前沒檢查 `lower < n`：x 比全部都大時，`a[lower]` 越界。',
        ] },
        { type: 'p', text: '測試二分搜尋時，一定要涵蓋這些情況：只有 1 個元素、x 比全部都小、x 比全部都大、x 等於第一個或最後一個、所有元素都相等、長度是奇數與偶數。最可靠的方法是和線性搜尋（A03）的暴力解在大量隨機小陣列上比對結果。' },
      ],
    },
    {
      id: 'answer-search', title: '對答案二分搜：單調的判斷函式',
      blocks: [
        { type: 'p', text: '很多題目問「最小要多少才夠」或「最大可以到多少」。如果能寫出判斷函式 `check(v)`：「答案是 v 時行不行？」，而且它是單調的（monotonic）：v 小時都不行，從某個值開始全部都行（`F F F T T T`），那麼答案就是第一個 T 的位置。這正是在一個「想像出來的陣列」`check(lo), check(lo + 1), …, check(hi)` 上做 lower bound，只是不需要真的建出陣列，需要哪一格就呼叫一次 `check(mid)`。' },
        { type: 'p', text: '例題：輸送帶上的包裹要依順序在 D 天內運完，每天裝上船的總重不能超過容量 cap，求最小的 cap。`check(cap)`：照順序裝，裝不下就換下一天，算出需要的天數是否 ≤ D。單調性：容量 cap 可以，容量更大時照原本的分法一定也裝得下，所以也可以。答案範圍：至少是最重那一件（否則它永遠裝不上），至多是全部的總和（一天運完）。' },
        { type: 'example', id: 'min-capacity' },
        { type: 'p', text: 'D = 5 時範圍是 `[10, 55]`：cap 32 可行 → 答案 ≤ 32；21 可行；15 可行；12 要 6 天，不行 → 答案 > 12；14 也不行 → 答案 > 14。此時 lo = hi = 15。只呼叫了 5 次 check，而逐一嘗試 10～55 最多要 46 次。' },
        { type: 'p', text: '複雜度：回合數是 O(log(範圍大小))，每回合呼叫一次 check，總共 O(log(hi − lo) × check 的成本)。包裹題有 n 件、每件最重 W 時，範圍不超過 nW，check 是 O(n)，總共 O(n log(nW))。n = 10^5、W = 10^4 時範圍約 10^9，只要約 30 回合、3×10^6 次運算。總重可能超過 `int`：2×10^5 件、每件 10^9 時總和是 2×10^14，C++ 要用 `long long`（範例的 `std::accumulate` 初始值寫 `0LL`，寫 `0` 會用 `int` 累加而溢位），Java 用 `long`，Python 不受影響；JavaScript 的 `number` 在 2^53 以內精確，2×10^14 也沒問題。' },
        { type: 'p', text: '另一個例子是整數平方根：最大的 r 使得 r × r ≤ x。這是「找最後一個成立」，所以用上一節的第三個模板，mid 向上取整。x 接近 2^63 − 1 時，`mid * mid` 在 C++／Java 會溢位，改成等價的 `mid <= x / mid` 就不會；Python 可以直接平方，也可以和標準函式庫的 `math.isqrt` 對照。JavaScript 的 `number` 超過 2^53 就不再精確，範例改用 `BigInt`（`10n ** 18n`），它和 Python 的整數一樣不會溢位，可以直接平方。' },
        { type: 'example', id: 'isqrt' },
        { type: 'callout', tone: 'tip', title: '怎麼判斷能不能對答案二分搜', text: '問自己：「如果 v 可行，v + 1（或 v − 1）是不是一定也可行？」能肯定回答，就能二分搜。常見的說法有：最小的最大值、最大的最小值、最少要幾天／多少容量、第一個超過門檻的時間。條件不單調就不行，例如「剛好 D 天運完」：容量變大可能只要更少天，「剛好」反而不成立。答案是實數時，通常改成固定做 100 回合左右，而不是等 `lo < hi` 不成立。' },
      ],
    },
  ],
  examples: [
    {
      id: 'exact-search', title: '閉區間的精確搜尋', description: '在 10 個排好的數中找 5 個目標，回傳索引或 −1，並數出用了幾回合。',
      output: 'find 23 -> 5 (3 rounds)\nfind 2 -> 0 (3 rounds)\nfind 91 -> 9 (4 rounds)\nfind 7 -> -1 (3 rounds)\nfind 100 -> -1 (4 rounds)',
      code: {
        'C++': code`#include <iostream>
#include <vector>

// 閉區間 [lo, hi]：如果 target 存在，它一定在 a[lo..hi] 裡。
int binarySearch(const std::vector<int>& a, int target, int& rounds) {
    int lo = 0, hi = static_cast<int>(a.size()) - 1;
    rounds = 0;
    while (lo <= hi) {
        ++rounds;
        int mid = lo + (hi - lo) / 2;  // 不寫 (lo + hi) / 2，避免 int 溢位
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;  // mid 和左邊都太小
        else hi = mid - 1;                  // mid 和右邊都太大
    }
    return -1;  // 範圍空了：target 不存在
}

int main() {
    std::vector<int> a = {2, 5, 8, 12, 16, 23, 38, 56, 72, 91};
    for (int target : {23, 2, 91, 7, 100}) {
        int rounds = 0;
        int index = binarySearch(a, target, rounds);
        std::cout << "find " << target << " -> " << index << " (" << rounds << " rounds)\n";
    }
    return 0;
}`,
        Python: code`def binary_search(a, target):
    """閉區間 [lo, hi]：如果 target 存在，它一定在 a[lo..hi] 裡。回傳 (索引, 回合數)。"""
    lo, hi = 0, len(a) - 1
    rounds = 0
    while lo <= hi:
        rounds += 1
        mid = lo + (hi - lo) // 2  # Python 的 int 不會溢位，寫法與 C++／Java 一致
        if a[mid] == target:
            return mid, rounds
        if a[mid] < target:
            lo = mid + 1  # mid 和左邊都太小
        else:
            hi = mid - 1  # mid 和右邊都太大
    return -1, rounds  # 範圍空了：target 不存在


a = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
for target in [23, 2, 91, 7, 100]:
    index, rounds = binary_search(a, target)
    print(f"find {target} -> {index} ({rounds} rounds)")`,
        Java: code`public class Main {
    static int rounds;

    // 閉區間 [lo, hi]：如果 target 存在，它一定在 a[lo..hi] 裡。
    static int binarySearch(int[] a, int target) {
        int lo = 0, hi = a.length - 1;
        rounds = 0;
        while (lo <= hi) {
            rounds++;
            int mid = lo + (hi - lo) / 2;  // 不寫 (lo + hi) / 2，避免 int 溢位
            if (a[mid] == target) return mid;
            if (a[mid] < target) lo = mid + 1;  // mid 和左邊都太小
            else hi = mid - 1;                  // mid 和右邊都太大
        }
        return -1;  // 範圍空了：target 不存在
    }

    public static void main(String[] args) {
        int[] a = {2, 5, 8, 12, 16, 23, 38, 56, 72, 91};
        for (int target : new int[] {23, 2, 91, 7, 100}) {
            int index = binarySearch(a, target);
            System.out.println("find " + target + " -> " + index + " (" + rounds + " rounds)");
        }
    }
}`,
        JavaScript: code`// 閉區間 [lo, hi]：如果 target 存在，它一定在 a[lo..hi] 裡。回傳 [索引, 回合數]。
function binarySearch(a, target) {
    let lo = 0, hi = a.length - 1;
    let rounds = 0;
    while (lo <= hi) {
        rounds++;
        const mid = Math.floor((lo + hi) / 2);  // / 會保留小數，要 Math.floor；number 在 2^53 以內不會溢位
        if (a[mid] === target) return [mid, rounds];
        if (a[mid] < target) lo = mid + 1;  // mid 和左邊都太小
        else hi = mid - 1;                  // mid 和右邊都太大
    }
    return [-1, rounds];  // 範圍空了：target 不存在
}

const a = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
for (const target of [23, 2, 91, 7, 100]) {
    const [index, rounds] = binarySearch(a, target);
    console.log("find " + target + " -> " + index + " (" + rounds + " rounds)");
}`,
      },
    },
    {
      id: 'bounds-count', title: 'lower bound、upper bound 與重複值', description: '自己寫的 lower／upper bound 算出次數、第一次與最後一次出現的位置，並和各語言的函式庫比對。',
      output: 'x=4 lower=2 upper=5 count=3 first=2 last=4 library=same\nx=5 lower=5 upper=5 count=0 first=-1 last=-1 library=same\nx=1 lower=0 upper=1 count=1 first=0 last=0 library=same\nx=12 lower=7 upper=8 count=1 first=7 last=7 library=same\nx=0 lower=0 upper=0 count=0 first=-1 last=-1 library=same\nx=13 lower=8 upper=8 count=0 first=-1 last=-1 library=same\nbinarySearch(5) = -6',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

// 半開區間 [lo, hi)：lo 左邊都 < x，hi 以右（含 hi）都 >= x。
int lowerBound(const std::vector<int>& a, int x) {
    int lo = 0, hi = static_cast<int>(a.size());
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < x) lo = mid + 1;
        else hi = mid;
    }
    return lo;  // 第一個 >= x 的位置；全部都 < x 時是 n
}

// 只把 < 換成 <=：第一個 > x 的位置。
int upperBound(const std::vector<int>& a, int x) {
    int lo = 0, hi = static_cast<int>(a.size());
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] <= x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

int main() {
    std::vector<int> a = {1, 2, 4, 4, 4, 7, 9, 12};
    for (int x : {4, 5, 1, 12, 0, 13}) {
        int lower = lowerBound(a, x), upper = upperBound(a, x), count = upper - lower;
        int first = count > 0 ? lower : -1, last = count > 0 ? upper - 1 : -1;
        // 函式庫：std::lower_bound／std::upper_bound 回傳迭代器，減掉 begin() 得到索引
        bool same = std::lower_bound(a.begin(), a.end(), x) - a.begin() == lower
            && std::upper_bound(a.begin(), a.end(), x) - a.begin() == upper
            && std::binary_search(a.begin(), a.end(), x) == (count > 0);
        std::cout << "x=" << x << " lower=" << lower << " upper=" << upper << " count=" << count
                  << " first=" << first << " last=" << last << " library=" << (same ? "same" : "DIFFERENT") << "\n";
    }
    // Java 的 Arrays.binarySearch 找不到時回傳 -(插入點) - 1
    std::cout << "binarySearch(5) = " << -lowerBound(a, 5) - 1 << "\n";
    return 0;
}`,
        Python: code`from bisect import bisect_left, bisect_right


def lower_bound(a, x):
    """半開區間 [lo, hi)：lo 左邊都 < x，hi 以右（含 hi）都 >= x。"""
    lo, hi = 0, len(a)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if a[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    return lo  # 第一個 >= x 的位置；全部都 < x 時是 n


def upper_bound(a, x):
    """只把 < 換成 <=：第一個 > x 的位置。"""
    lo, hi = 0, len(a)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if a[mid] <= x:
            lo = mid + 1
        else:
            hi = mid
    return lo


a = [1, 2, 4, 4, 4, 7, 9, 12]
for x in [4, 5, 1, 12, 0, 13]:
    lower, upper = lower_bound(a, x), upper_bound(a, x)
    count = upper - lower
    first, last = (lower, upper - 1) if count > 0 else (-1, -1)
    # 函式庫：bisect_left 就是 lower bound，bisect_right（也就是 bisect）就是 upper bound
    i = bisect_left(a, x)
    same = i == lower and bisect_right(a, x) == upper and (i < len(a) and a[i] == x) == (count > 0)
    print(f"x={x} lower={lower} upper={upper} count={count} first={first} last={last} library={'same' if same else 'DIFFERENT'}")
# Java 的 Arrays.binarySearch 找不到時回傳 -(插入點) - 1
print(f"binarySearch(5) = {-lower_bound(a, 5) - 1}")`,
        Java: code`import java.util.Arrays;

public class Main {
    // 半開區間 [lo, hi)：lo 左邊都 < x，hi 以右（含 hi）都 >= x。
    static int lowerBound(int[] a, int x) {
        int lo = 0, hi = a.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] < x) lo = mid + 1;
            else hi = mid;
        }
        return lo;  // 第一個 >= x 的位置；全部都 < x 時是 n
    }

    // 只把 < 換成 <=：第一個 > x 的位置。
    static int upperBound(int[] a, int x) {
        int lo = 0, hi = a.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] <= x) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    public static void main(String[] args) {
        int[] a = {1, 2, 4, 4, 4, 7, 9, 12};
        for (int x : new int[] {4, 5, 1, 12, 0, 13}) {
            int lower = lowerBound(a, x), upper = upperBound(a, x), count = upper - lower;
            int first = count > 0 ? lower : -1, last = count > 0 ? upper - 1 : -1;
            // Java 沒有 lower_bound：Arrays.binarySearch 找到時回傳「某一個」相等的位置（落在 [lower, upper) 裡），
            // 找不到時回傳 -(插入點) - 1，插入點就是 lower bound。
            int r = Arrays.binarySearch(a, x);
            boolean same = r >= 0 ? lower <= r && r < upper && a[r] == x : -r - 1 == lower && count == 0;
            System.out.println("x=" + x + " lower=" + lower + " upper=" + upper + " count=" + count
                + " first=" + first + " last=" + last + " library=" + (same ? "same" : "DIFFERENT"));
        }
        System.out.println("binarySearch(5) = " + Arrays.binarySearch(a, 5));
    }
}`,
        JavaScript: code`// 半開區間 [lo, hi)：lo 左邊都 < x，hi 以右（含 hi）都 >= x。
function lowerBound(a, x) {
    let lo = 0, hi = a.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (a[mid] < x) lo = mid + 1;
        else hi = mid;
    }
    return lo;  // 第一個 >= x 的位置；全部都 < x 時是 n
}

// 只把 < 換成 <=：第一個 > x 的位置。
function upperBound(a, x) {
    let lo = 0, hi = a.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (a[mid] <= x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// JavaScript 沒有內建的二分搜尋：用 O(n) 的 findIndex 對照（找不到時 -1 代表 n）
function linearFirst(a, ok) {
    const i = a.findIndex(ok);
    return i === -1 ? a.length : i;
}

const a = [1, 2, 4, 4, 4, 7, 9, 12];
for (const x of [4, 5, 1, 12, 0, 13]) {
    const lower = lowerBound(a, x), upper = upperBound(a, x), count = upper - lower;
    const first = count > 0 ? lower : -1, last = count > 0 ? upper - 1 : -1;
    const same = linearFirst(a, v => v >= x) === lower && linearFirst(a, v => v > x) === upper
        && a.includes(x) === (count > 0);
    console.log("x=" + x + " lower=" + lower + " upper=" + upper + " count=" + count
        + " first=" + first + " last=" + last + " library=" + (same ? "same" : "DIFFERENT"));
}
// Java 的 Arrays.binarySearch 找不到時回傳 -(插入點) - 1
console.log("binarySearch(5) = " + (-lowerBound(a, 5) - 1));`,
      },
    },
    {
      id: 'min-capacity', title: '對答案二分搜：最小的運送容量', description: '包裹 1～10 要依序在 D 天內運完，二分搜尋最小容量，並印出 D = 5 時每一次 check 的結果。',
      output: 'D=5, search in [10, 55]\n  cap 32: 2 days ok\n  cap 21: 3 days ok\n  cap 15: 5 days ok\n  cap 12: 6 days too many\n  cap 14: 6 days too many\nD=5 -> 15\nD=1 -> 55\nD=3 -> 21\nD=10 -> 10',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <numeric>
#include <vector>

// check：容量 cap 時，依序裝貨需要幾天（裝不下就換下一天）。
int daysNeeded(const std::vector<int>& w, long long cap) {
    int days = 1;
    long long load = 0;
    for (int x : w) {
        if (load + x > cap) {
            ++days;
            load = 0;
        }
        load += x;
    }
    return days;
}

// 最小的 cap 使得 daysNeeded(cap) <= d：「可行」對 cap 單調（容量越大越可行）。
long long minCapacity(const std::vector<int>& w, int d, bool log) {
    long long lo = *std::max_element(w.begin(), w.end());   // 小於最重的一件一定不行
    long long hi = std::accumulate(w.begin(), w.end(), 0LL); // 一天全部運完一定可以
    while (lo < hi) {
        long long mid = lo + (hi - lo) / 2;
        int days = daysNeeded(w, mid);
        if (log) std::cout << "  cap " << mid << ": " << days << " days " << (days <= d ? "ok" : "too many") << "\n";
        if (days <= d) hi = mid;  // mid 可行：答案 <= mid
        else lo = mid + 1;        // mid 不可行：答案 > mid
    }
    return lo;
}

int main() {
    std::vector<int> w = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    std::cout << "D=5, search in [10, 55]\n";
    long long answer = minCapacity(w, 5, true);  // 先算完（會印出過程），再印答案
    std::cout << "D=5 -> " << answer << "\n";
    for (int d : {1, 3, 10}) std::cout << "D=" << d << " -> " << minCapacity(w, d, false) << "\n";
    return 0;
}`,
        Python: code`def days_needed(w, cap):
    """check：容量 cap 時，依序裝貨需要幾天（裝不下就換下一天）。"""
    days, load = 1, 0
    for x in w:
        if load + x > cap:
            days += 1
            load = 0
        load += x
    return days


def min_capacity(w, d, log):
    """最小的 cap 使得 days_needed(cap) <= d：「可行」對 cap 單調（容量越大越可行）。"""
    lo, hi = max(w), sum(w)  # 小於最重的一件一定不行；一天全部運完一定可以
    while lo < hi:
        mid = lo + (hi - lo) // 2
        days = days_needed(w, mid)
        if log:
            print(f"  cap {mid}: {days} days {'ok' if days <= d else 'too many'}")
        if days <= d:
            hi = mid  # mid 可行：答案 <= mid
        else:
            lo = mid + 1  # mid 不可行：答案 > mid
    return lo


w = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
print("D=5, search in [10, 55]")
answer = min_capacity(w, 5, True)  # 先算完（會印出過程），再印答案
print(f"D=5 -> {answer}")
for d in [1, 3, 10]:
    print(f"D={d} -> {min_capacity(w, d, False)}")`,
        Java: code`public class Main {
    // check：容量 cap 時，依序裝貨需要幾天（裝不下就換下一天）。
    static int daysNeeded(int[] w, long cap) {
        int days = 1;
        long load = 0;
        for (int x : w) {
            if (load + x > cap) {
                days++;
                load = 0;
            }
            load += x;
        }
        return days;
    }

    // 最小的 cap 使得 daysNeeded(cap) <= d：「可行」對 cap 單調（容量越大越可行）。
    static long minCapacity(int[] w, int d, boolean log) {
        long lo = 0, hi = 0;
        for (int x : w) {
            lo = Math.max(lo, x);  // 小於最重的一件一定不行
            hi += x;               // 一天全部運完一定可以（用 long 加總）
        }
        while (lo < hi) {
            long mid = lo + (hi - lo) / 2;
            int days = daysNeeded(w, mid);
            if (log) System.out.println("  cap " + mid + ": " + days + " days " + (days <= d ? "ok" : "too many"));
            if (days <= d) hi = mid;  // mid 可行：答案 <= mid
            else lo = mid + 1;        // mid 不可行：答案 > mid
        }
        return lo;
    }

    public static void main(String[] args) {
        int[] w = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
        System.out.println("D=5, search in [10, 55]");
        long answer = minCapacity(w, 5, true);  // 先算完（會印出過程），再印答案
        System.out.println("D=5 -> " + answer);
        for (int d : new int[] {1, 3, 10}) System.out.println("D=" + d + " -> " + minCapacity(w, d, false));
    }
}`,
        JavaScript: code`// check：容量 cap 時，依序裝貨需要幾天（裝不下就換下一天）。
function daysNeeded(w, cap) {
    let days = 1, load = 0;
    for (const x of w) {
        if (load + x > cap) {
            days++;
            load = 0;
        }
        load += x;
    }
    return days;
}

// 最小的 cap 使得 daysNeeded(cap) <= d：「可行」對 cap 單調（容量越大越可行）。
function minCapacity(w, d, log) {
    let lo = Math.max(...w);               // 小於最重的一件一定不行
    let hi = w.reduce((s, x) => s + x, 0); // 一天全部運完一定可以
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const days = daysNeeded(w, mid);
        if (log) console.log("  cap " + mid + ": " + days + " days " + (days <= d ? "ok" : "too many"));
        if (days <= d) hi = mid;  // mid 可行：答案 <= mid
        else lo = mid + 1;        // mid 不可行：答案 > mid
    }
    return lo;
}

const w = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
console.log("D=5, search in [10, 55]");
const answer = minCapacity(w, 5, true);  // 先算完（會印出過程），再印答案
console.log("D=5 -> " + answer);
for (const d of [1, 3, 10]) console.log("D=" + d + " -> " + minCapacity(w, d, false));`,
      },
    },
    {
      id: 'isqrt', title: '整數平方根：找最後一個成立', description: '用向上取整的 mid 與不會溢位的比較 `mid <= x / mid`，算到 2^63 − 1 的整數平方根。',
      output: 'isqrt(0) = 0\nisqrt(1) = 1\nisqrt(15) = 3\nisqrt(16) = 4\nisqrt(1000000000000000000) = 1000000000\nisqrt(9223372036854775807) = 3037000499',
      code: {
        'C++': code`#include <iostream>

// 最大的 r 使得 r * r <= x（x >= 0）。答案一定在閉區間 [lo, hi] 裡。
long long isqrt(long long x) {
    long long lo = 0, hi = x;
    while (lo < hi) {
        long long mid = hi - (hi - lo) / 2;  // 向上取整的中點：lo < mid <= hi，不會卡在 lo = mid
        if (mid <= x / mid) lo = mid;        // 等同 mid * mid <= x，但不會溢位
        else hi = mid - 1;
    }
    return lo;
}

int main() {
    for (long long x : {0LL, 1LL, 15LL, 16LL, 1000000000000000000LL, 9223372036854775807LL}) {
        std::cout << "isqrt(" << x << ") = " << isqrt(x) << "\n";
    }
    return 0;
}`,
        Python: code`import math


def isqrt(x):
    """最大的 r 使得 r * r <= x（x >= 0）。答案一定在閉區間 [lo, hi] 裡。"""
    lo, hi = 0, x
    while lo < hi:
        mid = hi - (hi - lo) // 2  # 向上取整的中點：lo < mid <= hi，不會卡在 lo = mid
        if mid * mid <= x:  # Python 的 int 不會溢位，可以直接平方
            lo = mid
        else:
            hi = mid - 1
    return lo


for x in [0, 1, 15, 16, 10**18, 2**63 - 1]:
    r = isqrt(x)
    assert r == math.isqrt(x)  # 標準函式庫（Python 3.8+）的答案相同
    print(f"isqrt({x}) = {r}")`,
        Java: code`public class Main {
    // 最大的 r 使得 r * r <= x（x >= 0）。答案一定在閉區間 [lo, hi] 裡。
    static long isqrt(long x) {
        long lo = 0, hi = x;
        while (lo < hi) {
            long mid = hi - (hi - lo) / 2;  // 向上取整的中點：lo < mid <= hi，不會卡在 lo = mid
            if (mid <= x / mid) lo = mid;   // 等同 mid * mid <= x，但不會溢位
            else hi = mid - 1;
        }
        return lo;
    }

    public static void main(String[] args) {
        for (long x : new long[] {0L, 1L, 15L, 16L, 1000000000000000000L, Long.MAX_VALUE}) {
            System.out.println("isqrt(" + x + ") = " + isqrt(x));
        }
    }
}`,
        JavaScript: code`// 最大的 r 使得 r * r <= x（x >= 0）。答案一定在閉區間 [lo, hi] 裡。
// x 到 2^63 - 1，超過 number 能精確表示的 2^53，所以全部用 BigInt（數字後面加 n）。
function isqrt(x) {
    let lo = 0n, hi = x;
    while (lo < hi) {
        const mid = hi - (hi - lo) / 2n;  // BigInt 的 / 只留整數；向上取整的中點：lo < mid <= hi
        if (mid * mid <= x) lo = mid;     // BigInt 不會溢位，可以直接平方
        else hi = mid - 1n;
    }
    return lo;
}

for (const x of [0n, 1n, 15n, 16n, 10n ** 18n, 2n ** 63n - 1n]) {
    console.log("isqrt(" + String(x) + ") = " + String(isqrt(x)));
}`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: 'lower bound：半開區間 [lo, hi) 找第一個 ≥ x', language: 'Python',
    code: code`def lower_bound(a, x):
    lo, hi = 0, len(a)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if a[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    return lo

a = [1, 2, 4, 4, 4, 7, 9, 12]
print(lower_bound(a, 4))`,
    steps: traceSteps,
    tryIt: { algorithm: 'binary-search', initial: TRACE_A, target: TRACE_X },
  },
  quiz: [
    {
      id: 'q-trace', prompt: '下面的 Python 程式（閉區間精確搜尋，找 72）依序印出哪些 (lo, hi, mid)？',
      code: { language: 'Python', text: code`a = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
lo, hi = 0, len(a) - 1
while lo <= hi:
    mid = (lo + hi) // 2
    print(lo, hi, mid)
    if a[mid] == 72:
        break
    if a[mid] < 72:
        lo = mid + 1
    else:
        hi = mid - 1` },
      options: ['(0, 9, 4) → (5, 9, 7) → (8, 9, 8)', '(0, 9, 5) → (6, 9, 8)', '(0, 9, 4) → (4, 9, 6) → (6, 9, 7) → (7, 9, 8)', '(0, 9, 4) → (5, 9, 7) → (8, 9, 8) → (9, 9, 9)'],
      answer: 0, explanation: 'mid = (0 + 9) // 2 = 4，a[4] = 16 < 72，lo = 5；mid = (5 + 9) // 2 = 7，a[7] = 56 < 72，lo = 8；mid = (8 + 9) // 2 = 8，a[8] = 72，break。「(0, 9, 5) → …」是把 mid 向上取整；「(0, 9, 4) → (4, 9, 6) → …」是把 `lo = mid + 1` 寫成 `lo = mid`，多走了一回合；最後一個選項忽略了找到時的 break。',
    },
    {
      id: 'q-bounds', prompt: '下面的程式輸出什麼？',
      code: { language: 'Python', text: code`from bisect import bisect_left, bisect_right
a = [1, 2, 4, 4, 4, 7, 9, 12]
print(bisect_left(a, 4), bisect_right(a, 4), bisect_left(a, 13))` },
      options: ['2 5 8', '2 4 8', '3 5 -1', '2 5 7'],
      answer: 0, explanation: '`bisect_left` 是第一個 ≥ 4 的位置，索引 2；`bisect_right` 是第一個 > 4 的位置，索引 5（4 出現 5 − 2 = 3 次）；13 比全部都大，插入點是 n = 8。「2 4 8」把 upper bound 當成最後一個 4 的索引（那是 upper − 1）；「3 5 -1」以為會回傳某個相等的位置、找不到回傳 −1，那是精確搜尋的行為；「2 5 7」以為結果一定是合法索引，但 lower bound 可以是 n。',
    },
    {
      id: 'q-loop', prompt: '下面的函式想找「最後一個 ≤ x 的索引」。執行最後一行時會怎樣？',
      code: { language: 'Python', text: code`def last_at_most(a, x):
    lo, hi = 0, len(a) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] <= x:
            lo = mid
        else:
            hi = mid - 1
    return lo

print(last_at_most([1, 3, 5, 7], 8))` },
      options: ['印出 3', '印出 2', '無窮迴圈，什麼都不印', '丟出 IndexError'],
      answer: 2, explanation: '(lo, hi) 從 (0, 3) 變成 (1, 3)、(2, 3)。此時 mid = (2 + 3) // 2 = 2，`a[2] = 5 <= 8`，執行 `lo = mid` 還是 2，區間不再變小，永遠停不下來（實際執行要用逾時才能中斷）。「印出 3」是修正後（mid 向上取整 `(lo + hi + 1) // 2`）的正確答案；「印出 2」以為迴圈會在 (2, 3) 時停下；mid 永遠落在 [lo, hi] 內，所以不會越界。',
    },
    {
      id: 'q-overflow', prompt: '對答案二分搜的範圍很大時，下面的 Java 片段印出什麼？',
      code: { language: 'Java', text: code`int lo = 1200000000, hi = 2100000000;
int mid = (lo + hi) / 2;
System.out.println(mid);` },
      options: ['1650000000', '-497483648', '2147483647', '丟出 ArithmeticException'],
      answer: 1, explanation: '`lo + hi` = 3,300,000,000 超過 `int` 的上限 2,147,483,647，Java 的 `int` 溢位會繞回：3,300,000,000 − 2^32 = −994,967,296，除以 2 得 −497,483,648。1650000000 是數學上的答案，要寫成 `lo + (hi - lo) / 2` 才會得到；Java 整數溢位不會停在最大值，也不會丟出例外（`ArithmeticException` 只在除以 0 等情況出現）。在 C++ 中這是未定義行為。',
    },
    {
      id: 'q-java', prompt: '下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: code`int[] a = {10, 20, 30, 40};
System.out.println(Arrays.binarySearch(a, 25) + " " + Arrays.binarySearch(a, 50));` },
      options: ['-3 -5', '-1 -1', '-2 -4', '2 4'],
      answer: 0, explanation: '找不到時回傳 −(插入點) − 1。25 的插入點是 2（第一個比它大的是索引 2 的 30），回傳 −2 − 1 = −3；50 比全部都大，插入點是 4 = n，回傳 −5。「-1 -1」是把它當成其他語言常見的「找不到就回傳 −1」；「-2 -4」忘了減 1；「2 4」是插入點本身，Java 用負數表示「不存在」。',
    },
    {
      id: 'q-answer', prompt: 'n 件包裹，每件重量 1～W，用本課的方法對「最小容量」二分搜（範圍 [最重一件, 總重]，每次 check 依序模擬裝貨一遍）。總時間複雜度是多少？',
      options: ['O(n log(nW))', 'O(log(nW))', 'O(n · nW)', 'O(n log n)'],
      answer: 0, explanation: '範圍大小不超過總重 nW，二分搜約 log₂(nW) 回合；每回合的 check 要走過 n 件包裹，是 O(n)，相乘得 O(n log(nW))。O(log(nW)) 忽略了每次 check 的成本；O(n · nW) 是把每個容量都試一遍；O(n log n) 是排序的複雜度，這題不需要排序，回合數由數值範圍決定，而不是由 n 決定。',
    },
    {
      id: 'q-choose', prompt: '有 n = 10^5 個沒有排序的整數，接著有 q = 10^5 個查詢，每個查詢問「x 是否出現、出現幾次」。哪一種做法最合適？',
      options: ['每個查詢都做一次線性搜尋', '直接對原陣列做二分搜尋', '先排序一次，每個查詢用 upper bound − lower bound', '每次查詢前先排序，再做二分搜尋'],
      answer: 2, explanation: '排序一次 O(n log n)，每個查詢兩次二分搜 O(log n)，總共 O((n + q) log n)，約 3×10^6 次比較。每次線性搜尋是 O(nq) = 10^10，太慢；未排序的陣列不能二分搜，結果沒有意義；每次查詢都重新排序是 O(q · n log n)，比線性搜尋還慢。如果只有一個查詢，就不值得排序，線性搜尋 O(n) 最快。',
    },
  ],
  exercises: [
    {
      id: 'e-count-queries', title: '小於、等於、大於各有幾個',
      statement: '給 n 個已由小到大（非遞減，可以重複）排好的整數，以及 q 個查詢。對每個查詢 x，輸出陣列中小於 x、等於 x、大於 x 的數各有幾個。n 與 q 都可能到 2×10^5：每個查詢都掃一遍的 O(nq) 做法最多要 4×10^10 次比較，太慢；找到一個 x 後再往左右擴展來數重複值也不行（所有值都相同時又變成 O(nq)）。請用 lower bound 與 upper bound 做到 O((n + q) log n)。輸入不合法時只輸出一行 `Invalid`：n < 1、q < 1、數字的個數和 n、q 對不上（太少或太多），或 n 個值不是非遞減（某個數比前一個小）。',
      inputFormat: '第一行一個整數 n。第二行 n 個整數 a[0]～a[n−1]。第三行一個整數 q。第四行 q 個整數，依序是每個查詢的 x。數字之間以空白或換行分隔。',
      outputFormat: 'q 行，第 i 行是三個以空白分隔的整數：小於、等於、大於第 i 個查詢 x 的個數；輸入不合法時只輸出一行 `Invalid`。',
      constraints: ['1 ≤ n ≤ 2×10^5，1 ≤ q ≤ 2×10^5（否則輸出 Invalid）', '每個 a[i] 與 x 都是 −10^9～10^9 的整數', 'a 必須是非遞減的；不是就輸出 Invalid'],
      samples: [{ kind: 'normal', input: '7\n1 3 3 3 5 8 9\n4\n3 4 0 9', output: '1 3 3\n4 0 3\n0 0 7\n6 1 0', note: '3 出現 3 次；4 不存在；0 比全部小；9 是最後一個' }],
      tests: [
        { kind: 'normal', input: '7\n1 3 3 3 5 8 9\n4\n3 4 0 9', output: '1 3 3\n4 0 3\n0 0 7\n6 1 0', note: '範例' },
        { kind: 'normal', input: '8\n-7 -7 -2 0 0 0 4 10\n5\n0 -7 -3 10 5', output: '3 3 2\n0 2 6\n2 0 6\n7 1 0\n7 0 1', note: '負數與重複值；查詢等於第一個與最後一個元素' },
        { kind: 'normal', input: '5\n2 4 6 8 10\n6\n10 1 6 11 6 5', output: '4 1 0\n0 0 5\n2 1 2\n5 0 0\n2 1 2\n2 0 3', note: '查詢沒有排序、有重複的查詢' },
        { kind: 'edge', input: '4\n5 6 7 8\n1\n-100', output: '0 0 4', note: 'x 比全部都小：lower bound 是 0' },
        { kind: 'edge', input: '4\n5 6 7 8\n1\n100', output: '4 0 0', note: 'x 比全部都大：lower bound 是 n，不能讀 a[n]' },
        { kind: 'edge', input: '6\n3 3 3 3 3 3\n3\n3 2 4', output: '0 6 0\n0 0 6\n6 0 0', note: '所有元素都相等' },
        { kind: 'edge', input: '1\n0\n3\n-1 0 1', output: '0 0 1\n0 1 0\n1 0 0', note: 'n = 1' },
        { kind: 'edge', input: '5\n-1000000000 -1000000000 0 1000000000 1000000000\n4\n-1000000000 1000000000 999999999 -999999999', output: '0 2 3\n3 2 0\n3 0 2\n2 0 3', note: '最小與最大的值，以及緊鄰它們的查詢' },
        { kind: 'edge', input: bigInput, output: bigOutput, note: 'n = 2×10^5、q = 5×10^4，每個值重複 4 次；查詢輪流等於某個值、比它大 1、比它小 1，從 −10^9 到接近 10^9：O(nq) 的做法會超時' },
        { kind: 'edge', input: sameInput, output: sameOutput, note: 'n = 2×10^5 個 7、q = 5×10^4 個查詢 7：找到後往兩邊擴展的做法每個查詢都要 O(n)' },
        { kind: 'error', input: '5\n1 3 2 4 5\n2\n3 4', output: 'Invalid', note: '沒有排好：2 比前一個 3 小' },
        { kind: 'error', input: '3\n9 5 1\n1\n5', output: 'Invalid', note: '由大到小排也不行' },
        { kind: 'error', input: '5\n1 2 3\n1\n2', output: 'Invalid', note: '值的個數少於 n' },
        { kind: 'error', input: '3\n1 2 3\n4\n1 2', output: 'Invalid', note: '查詢的個數少於 q' },
        { kind: 'error', input: '3\n1 2 3\n1\n1 2', output: 'Invalid', note: '查詢的個數多於 q' },
        { kind: 'error', input: '0\n1\n5', output: 'Invalid', note: 'n = 0' },
      ],
      hints: [
        '小於 x 的個數就是 lower bound（第一個 ≥ x 的位置）：它左邊的元素都 < x。',
        '小於等於 x 的個數是 upper bound（第一個 > x 的位置）；等於 x 的個數是 upper − lower，大於 x 的個數是 n − upper。',
        'C++ 用 `std::lower_bound`／`std::upper_bound`，Python 用 `bisect_left`／`bisect_right`；Java 的 `Arrays.binarySearch` 不保證回傳第一個，請自己寫半開區間的 lower／upper bound；JavaScript 沒有內建的二分搜尋，也要自己寫。',
        '先把所有數字讀進來，才能檢查個數是否剛好是 1 + n + 1 + q；排序檢查只要 O(n) 走一遍相鄰兩數。',
        '輸出很多行時，先串成一個字串（Java 用 `StringBuilder`，JavaScript 收集到陣列再 `join`）再一次印出。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<long long> t;  // 先讀進所有數字，才能檢查個數是否相符
    long long v;
    while (std::cin >> v) t.push_back(v);
    long long total = static_cast<long long>(t.size());
    long long n = total > 0 ? t[0] : 0;
    if (n < 1 || total < n + 2) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<long long> a(t.begin() + 1, t.begin() + 1 + n);
    long long q = t[n + 1];
    if (q < 1 || total != n + 2 + q || !std::is_sorted(a.begin(), a.end())) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::string out;
    for (long long k = n + 2; k < total; ++k) {
        long long x = t[k];
        long long lo = std::lower_bound(a.begin(), a.end(), x) - a.begin();  // 前面 lo 個都 < x
        long long hi = std::upper_bound(a.begin(), a.end(), x) - a.begin();  // [lo, hi) 都等於 x
        out += std::to_string(lo) + ' ' + std::to_string(hi - lo) + ' ' + std::to_string(n - hi) + '\n';
    }
    std::cout << out;
    return 0;
}`,
        Python: code`import sys
from bisect import bisect_left, bisect_right


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]) if data else 0
    if n < 1 or len(data) < n + 2:
        print("Invalid")
        return
    a = list(map(int, data[1:n + 1]))
    q = int(data[n + 1])
    if q < 1 or len(data) != n + 2 + q or any(a[i] > a[i + 1] for i in range(n - 1)):
        print("Invalid")
        return
    out = []
    for x in map(int, data[n + 2:]):
        lo = bisect_left(a, x)   # 第一個 >= x：前面 lo 個都 < x
        hi = bisect_right(a, x)  # 第一個 > x：[lo, hi) 都等於 x
        out.append(f"{lo} {hi - lo} {n - hi}")
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.StringTokenizer;

public class Main {
    // 第一個 >= x 的位置（strict = false），或第一個 > x 的位置（strict = true）；半開區間 [lo, hi)。
    static int bound(long[] a, long x, boolean strict) {
        int lo = 0, hi = a.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] < x || (strict && a[mid] == x)) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

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
        long n = total > 0 ? t[0] : 0;
        if (n < 1 || total < n + 2) {
            System.out.println("Invalid");
            return;
        }
        long[] a = Arrays.copyOfRange(t, 1, (int) n + 1);
        long q = t[(int) n + 1];
        boolean sorted = true;
        for (int i = 0; i + 1 < a.length; i++) if (a[i] > a[i + 1]) sorted = false;
        if (q < 1 || total != n + 2 + q || !sorted) {
            System.out.println("Invalid");
            return;
        }
        StringBuilder out = new StringBuilder();
        for (int k = (int) n + 2; k < total; k++) {
            int lo = bound(a, t[k], false);  // 前面 lo 個都 < x
            int hi = bound(a, t[k], true);   // [lo, hi) 都等於 x
            out.append(lo).append(' ').append(hi - lo).append(' ').append(n - hi).append('\n');
        }
        System.out.print(out);
    }
}`,
        JavaScript: code`// 第一個 >= x 的位置；半開區間 [lo, hi)。
function lowerBound(a, x) {
    let lo = 0, hi = a.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (a[mid] < x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// 第一個 > x 的位置。
function upperBound(a, x) {
    let lo = 0, hi = a.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (a[mid] <= x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function main() {
    const text = require("fs").readFileSync(0, "utf8").trim();
    const t = text === "" ? [] : text.split(/\s+/).map(Number);  // 先讀進所有數字，才能檢查個數是否相符
    const n = t.length > 0 ? t[0] : 0;
    if (n < 1 || t.length < n + 2) {
        console.log("Invalid");
        return;
    }
    const a = t.slice(1, n + 1);
    const q = t[n + 1];
    let sorted = true;
    for (let i = 0; i + 1 < n; i++) if (a[i] > a[i + 1]) sorted = false;
    if (q < 1 || t.length !== n + 2 + q || !sorted) {
        console.log("Invalid");
        return;
    }
    const out = [];
    for (let k = n + 2; k < t.length; k++) {
        const lo = lowerBound(a, t[k]);  // 前面 lo 個都 < x
        const hi = upperBound(a, t[k]);  // [lo, hi) 都等於 x
        out.push(lo + " " + (hi - lo) + " " + (n - hi));
    }
    console.log(out.join("\n"));
}

main();`,
      },
      judge: 'none',
    },
  ],
};

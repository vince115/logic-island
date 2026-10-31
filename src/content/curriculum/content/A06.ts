import type { LessonContent, TraceStep } from '../schema';
import { mergeSortSteps } from '../simulate-algorithms';

const code = String.raw;

/** The traced input: six values with a duplicate 2 (indices 1 and 3), so the last merge shows the tie rule. */
const traceInput = [5, 2, 4, 2, 6, 1];

/**
 * The merge-sort trace. mergeSortSteps runs the same algorithm as the trace code: base case `lo >= hi`,
 * mid = (lo + hi) // 2, halves [lo, mid] and [mid + 1, hi], merge with `<=` (ties take the left), then the rest of the
 * unfinished side is appended and copied back. Its 'merge' steps happen after an element is taken, so each one is moved
 * to the append line of the side it took (line 10 for the left, line 12 for the right). The one tie gets a note on
 * which 2 is which.
 */
const mergeTrace: TraceStep[] = mergeSortSteps(traceInput, { init: 14, split: 4, merge: 9, copy: 13, result: 15 }).map(step => {
  const split = /^分割 \[\d+, \d+\] 為 \[(\d+), (\d+)\] 與 \[(\d+), (\d+)\]。$/.exec(step.note);
  if (split) {
    const singles = [[split[1], split[2]], [split[3], split[4]]].filter(([lo, hi]) => lo === hi).map(([lo, hi]) => `[${lo}, ${hi}]`);
    const one = singles.length === 2 ? '都只有一個元素：兩個遞迴呼叫都碰到 `lo >= hi` 直接回傳，它們本來就排好了。' : '只有一個元素：遞迴呼叫碰到 `lo >= hi` 直接回傳，它本來就排好了。';
    return singles.length ? { ...step, note: `${step.note}${singles.join(' 與 ')} ${one}` } : step;
  }
  if (step.line !== 9) return step;
  const left = step.note.includes('取左半');
  const note = step.note.includes('相等取左半')
    ? `${step.note}左半的這個 2 原本在索引 1，右半的 2 原本在索引 3；相等時先放左半，兩個 2 的先後就和原本一樣。`
    : step.note;
  return { ...step, line: left ? 10 : 12, note };
});

/** A fixed pseudo-random sequence for the large tests (the same generator as A05). */
const randomInts = (seed: number, count: number, modulo: number, shift: number) => {
  const out: number[] = [];
  for (let k = 0; k < count; k++) { seed = (seed * 48271) % 2147483647; out.push((seed % modulo) - shift); }
  return out;
};
/** Brute force O(n²): only for the medium test. */
const bruteInversions = (a: number[]) => {
  let count = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) count++;
  return count;
};
/** Small values only (−99..99): count, for each element, the earlier elements greater than it with a Fenwick tree. */
const smallValueInversions = (a: number[]) => {
  const tree = new Array<number>(200).fill(0);
  let count = 0;
  a.forEach((v, k) => {
    let seen = 0;
    for (let i = v + 100; i > 0; i -= i & -i) seen += tree[i];  // earlier elements ≤ v
    count += k - seen;
    for (let i = v + 100; i < 200; i += i & -i) tree[i]++;
  });
  return count;
};
const asInput = (a: number[]) => `${a.length}\n${a.join(' ')}`;
const medium = randomInts(20261031, 2000, 2000000001, 1000000000);
const REV = 70000;
const reversed = Array.from({ length: REV }, (_, k) => REV - k);
const BIG = 200000;
const big = randomInts(7340033, BIG, 199, 99);

/** A06 Merge Sort. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const A06: LessonContent = {
  lessonId: 'A06',
  motivation: 'A05 的三種基本排序最差都是 O(n²)：n = 10^5 時約 5 × 10^9 次比較，一般的時間限制內跑不完。合併排序（merge sort）用分治法（divide and conquer）把陣列切成兩半、各自排好、再把兩個有序的半邊合併，不論輸入長什麼樣子都保證 O(n log n)，n = 10^5 時只要約 1.7 × 10^6 次比較；它還是穩定排序，C++ 的 `std::stable_sort`、Python 的 `sorted` 與 Java 的物件排序背後都是合併的想法。學會合併排序，也就學會了「拆成子問題、再把答案合起來」的分治模板，還能在合併的同時順便算出逆序數（inversion）這類「排序過程中的量」。它的限制是合併需要一個長度 n 的暫存陣列（額外空間 O(n)），對很小或幾乎排好的資料，常數也比插入排序大；只要排序本身時，實作題直接用函式庫即可。',
  sections: [
    {
      id: 'idea', title: '分治：切成兩半、各自排好、再合併',
      blocks: [
        { type: 'p', text: '分治法有三個步驟：分割（divide）成較小的同類問題、遞迴地解決（conquer）它們、再合併（combine）子問題的答案。合併排序要排好 `a[lo..hi]`（含兩端）時：' },
        { type: 'list', ordered: true, items: [
          '終止條件：`lo >= hi` 時這段最多只有一個元素，本來就排好了，直接回傳。',
          '分割：取中點 `mid = (lo + hi) // 2`，左半是 `a[lo..mid]`、右半是 `a[mid + 1..hi]`。只要 lo < hi，兩半都至少有一個元素，而且都比原來短。',
          '遞迴：`merge_sort(a, lo, mid)` 與 `merge_sort(a, mid + 1, hi)`。依照 F18 的「相信遞迴」：呼叫回來時，這兩段已經各自排好。',
          '合併：把兩段有序的資料合併成一段有序的資料，寫回 `a[lo..hi]`。真正比較大小的工作全都在這一步。',
        ] },
        { type: 'p', text: '注意順序：先一路切到只剩一個元素，回程時才開始合併——合併發生在兩個遞迴呼叫「之後」，所以最早完成的是最左邊兩個元素的合併，最後才是整個陣列的合併。下方視覺化追蹤 `[5, 2, 4, 2, 6, 1]`：每次分割顯示目前的區段與 lo、mid、hi，合併時顯示 i、j 兩個索引與暫存陣列 `tmp`；「自己試試看」可以輸入自己的數字，跑同一個合併排序。' },
        { type: 'callout', tone: 'warning', title: '中點與終止條件要搭配好', text: '本課的切法是 `[lo, mid]` 與 `[mid + 1, hi]`，配上 `if lo >= hi: return`。若改成 `[lo, mid − 1]` 與 `[mid, hi]`，長度 2 的區段（hi = lo + 1）會算出 mid = lo，右半 `[lo, hi]` 跟原本一模一樣，遞迴永遠停不下來：Python 丟出 `RecursionError`，Java 丟出 `StackOverflowError`，C++ 通常因堆疊溢位而當掉。終止條件寫成 `lo == hi` 也有風險：只要某次呼叫傳進空區段（lo > hi），它就不會停。C++ 與 Java 習慣寫 `mid = lo + (hi - lo) / 2`，避免 lo + hi 超過 `int` 範圍（陣列長度接近 2^31 時才會發生，但這是好習慣）。' },
      ],
    },
    {
      id: 'merging', title: '合併兩個有序陣列：兩個索引，每次取較小的',
      blocks: [
        { type: 'p', text: '有兩個已排好的陣列 L 與 R，用索引 i、j 分別指向兩邊「還沒放進輸出」的第一個元素。每一步比較 `L[i]` 與 `R[j]`，把較小的放進輸出並讓那一邊的索引前進；其中一邊用完時，另一邊剩下的元素本來就排好、而且都不小於已輸出的元素，直接整段接在後面。' },
        { type: 'p', text: '為什麼對：L 與 R 都排好了，所以 `L[i]` 是 L 剩下最小的、`R[j]` 是 R 剩下最小的，兩者中較小的就是「全部剩下的元素中最小的」。每一步都把剩下最小的放到輸出的尾端，所以輸出一直保持「已經放進去的就是最小的那幾個，而且依序排好」——這就是合併的迴圈不變量。' },
        { type: 'p', text: '代價：每次比較都會輸出一個元素，所以合併長度 p 與 q 的兩段最多比較 p + q − 1 次（兩邊交錯，直到最後一個才用完），最少 min(p, q) 次（較短的一邊全部比較小，先用完），時間是 O(p + q)。輸出要寫到另一個陣列：如果直接寫回原陣列，會蓋掉還沒處理的元素。' },
        { type: 'example', id: 'ex-merge-two' },
        { type: 'p', text: '範例的元素是（值, 代號），只用值比較。三個 4 中，`4b`、`4c` 在左邊、`4f` 在右邊。用 `<=` 時，`4b` 與 `4f` 相等，取左邊的 `4b`，接著 `4c` 也先放，結果 `4b 4c 4f` 保持「左邊的先」；用 `<` 時，相等就取右邊，`4f` 跳到 `4b`、`4c` 前面。兩種寫法的比較次數一樣都是 6 次（7 個元素最多 6 次），值的順序也都正確，差別只在相等元素的先後。' },
        { type: 'callout', tone: 'warning', title: '用 `<` 會破壞穩定性', text: '合併排序穩定的原因是「相等時取左半」：在原陣列中，左半的每個元素都在右半的每個元素前面，相等時先放左邊，就保持了原本的先後；每一次合併都這樣做，整個排序就是穩定的。把 `a[i] <= a[j]` 寫成 `a[i] < a[j]`，排出來的數值仍然正確，只排整數時看不出問題，但排紀錄時同分者的順序會被打亂；在下面的逆序數計算中，還會把相等的配對誤算成逆序對。' },
      ],
    },
    {
      id: 'analysis', title: '遞迴樹：O(n log n) 的由來與記憶體',
      blocks: [
        { type: 'p', text: '把每一次呼叫畫成一個節點，就得到遞迴樹（recursion tree）：最上面一層是長度 n 的整段，下一層是兩段 n/2，再下一層是四段 n/4……每往下一層長度減半，大約 log₂ n 層之後每段只剩一個元素。n = 8 時是 8 → 4 → 2 → 1，要合併的有 3 層。' },
        { type: 'p', text: '同一層的各段互不重疊，合起來剛好是整個陣列，所以「一整層的合併」總共處理 n 個元素，花 O(n) 時間。log₂ n 層、每層 O(n)，總共 O(n log n)。寫成遞迴式（recurrence）就是 T(n) = 2T(n/2) + O(n)：排長度 n 的代價，等於排兩個一半的代價，加上一次線性時間的合併；把它一層層展開，每層都貢獻約 cn，共 log₂ n 層。A11 會更完整地用遞迴樹分析這類式子。' },
        { type: 'p', text: '最佳、平均、最差都是 O(n log n)：不論資料長什麼樣子，合併排序都在同樣的位置切開、做同樣多層的合併，資料只影響每次合併比較的次數（介於 min(p, q) 與 p + q − 1 之間）。n = 8 時，所有 8! 種排列的比較次數都在 12 到 17 次之間。這和插入排序不同：插入排序在已排好的資料上是 O(n)，在反序資料上是 O(n²)。' },
        { type: 'table', head: ['n', 'n log₂ n（約）', 'n(n − 1)/2', '差距'], rows: [
          ['10^3', '1.0 × 10^4', '5.0 × 10^5', '約 50 倍'],
          ['10^5', '1.7 × 10^6', '5.0 × 10^9', '約 3000 倍'],
          ['10^6', '2.0 × 10^7', '5.0 × 10^11', '約 25000 倍'],
        ] },
        { type: 'p', text: '下面的範例只配置一個暫存陣列 `tmp`，每次合併後印出這一段的結果，並依遞迴深度縮排。縮排正好畫出遞迴樹：最深的長度 2 合併先完成，然後是長度 4，最後是整個陣列。這組輸入剛好用了 17 次比較，是 n = 8 的最多次數。' },
        { type: 'example', id: 'ex-merge-sort' },
        { type: 'p', text: '空間：暫存陣列 O(n)，加上遞迴深度 O(log n) 的呼叫堆疊。n = 2 × 10^5 時遞迴只有約 18 層，不會碰到 Python 預設約 1000 層的遞迴限制，也不會讓 C++、Java 的堆疊溢位——這和深度 O(n) 的遞迴（例如 F18 的一層減 1）不同。也可以寫成不用遞迴的由下而上（bottom-up）版本：先把相鄰的長度 1 兩兩合併，再合併長度 2、4、8……的區段，一樣是 log₂ n 輪、每輪 O(n)。' },
        { type: 'callout', tone: 'warning', title: '不要在每次呼叫都配置新陣列', text: '每次合併都 `new` 一個陣列、或在 Python 用 `a[:mid]`、`a[mid:]` 切出新串列再遞迴，結果是對的、複雜度仍是 O(n log n)，但會產生大量小陣列：配置、複製與回收的成本讓常數變大很多，同時存在的暫存資料也更多。比較好的寫法是像範例一樣，在最外層配置一次長度 n 的 `tmp`，傳給每一次呼叫重複使用。' },
      ],
    },
    {
      id: 'inversions', title: '合併時順便數逆序數',
      blocks: [
        { type: 'p', text: '逆序對（inversion）是滿足 i < j 而且 a[i] > a[j] 的一對索引；逆序數就是它們的個數，可以用來衡量資料「離排好有多遠」。A05 提過，氣泡排序的交換次數與插入排序的搬移次數都等於逆序數，也就是用相鄰交換排好所需的最少次數。直接檢查每一對要 n(n − 1)/2 次，是 O(n²)；合併排序可以在 O(n log n) 內數出來。' },
        { type: 'p', text: '把 `a[lo..hi]` 的逆序對分成三種：兩個都在左半、兩個都在右半、一個在左半一個在右半（跨半邊）。前兩種交給遞迴去數；跨半邊的在合併時數：合併中取出右半的 `a[j]` 時，左半還沒取出的 `a[i..mid]` 共 `mid − i + 1` 個，它們都 ≥ `a[i]` > `a[j]`，而且原本都在 `a[j]` 前面，所以各和 `a[j]` 形成一個逆序對，一次加上 `mid − i + 1`。取出左半的元素時不用加：它不大於右半剩下的任何元素。' },
        { type: 'p', text: '為什麼先把兩半排好不會數錯：排序只在各自的半邊內部調換順序，「左半的元素」仍然都在「右半的元素」前面，所以跨半邊的配對數量不變，只是變得很好數。每一對跨半邊的逆序 (x, y) 剛好在 y 被取出時數到一次：那時 x 一定還在左半等著，因為它比 y 大，不會先被取出。' },
        { type: 'example', id: 'ex-inversions' },
        { type: 'p', text: '範例先用 `[3, 1, 4, 1, 5, 9, 2, 6]` 比對合併排序與暴力法（都是 8），再對 n = 100000 的反序陣列計數：每一對都是逆序，答案是 n(n − 1)/2 = 4999950000，暴力法要檢查約 5 × 10^9 對，合併排序只要約 1.7 × 10^6 次比較。計數函式先複製一份陣列再排序，呼叫者原本的陣列不會被改動。' },
        { type: 'callout', tone: 'warning', title: '計數要用 64 位元整數', text: '逆序數最多是 n(n − 1)/2：n = 2 × 10^5 時約 2 × 10^10，遠超過 `int` 的上限 2^31 − 1 ≈ 2.1 × 10^9。C++ 要用 `long long`、Java 要用 `long` 來累加（範例中 n = 100000 的答案 4999950000 用 `int` 就會溢位成錯誤的值）；公式 `n * (n - 1) / 2` 也要先轉型，例如 C++ 的 `static_cast<long long>(n) * (n - 1) / 2`、Java 的 `(long) n * (n - 1) / 2`。Python 的整數不會溢位。另外，相等的元素不是逆序對，所以合併時相等一定要取左半（`<=`）：寫成 `<` 時，相等的右半元素會先被取出，把相等的配對也算進去。' },
      ],
    },
    {
      id: 'compare', title: '和其他排序比較、函式庫與何時選用',
      blocks: [
        { type: 'table', head: ['排序', '最佳', '平均', '最差', '額外空間', '穩定'], rows: [
          ['插入排序（A05）', 'O(n)', 'O(n²)', 'O(n²)', 'O(1)', '穩定'],
          ['選擇排序（A05）', 'O(n²)', 'O(n²)', 'O(n²)', 'O(1)', '不穩定'],
          ['合併排序（本課）', 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(n) 暫存陣列 + O(log n) 堆疊', '穩定（相等取左）'],
          ['快速排序（A07）', 'O(n log n)', 'O(n log n)', 'O(n²)', '原地；平均 O(log n) 堆疊', '一般寫法不穩定'],
        ] },
        { type: 'p', text: '和 A07 的快速排序（quick sort）相比：快速排序在原陣列上分割、不需要長度 n 的暫存陣列，實務上常數小、通常較快；但基準值（pivot）選得不好時會退化成 O(n²)（隨機選基準可以讓這種情況極不可能發生），而且一般寫法不穩定。合併排序則保證每種輸入都是 O(n log n) 而且穩定，代價是 O(n) 的額外記憶體。' },
        { type: 'list', items: [
          'C++17：`std::sort` 不穩定（常見實作是內省排序 introsort）；`std::stable_sort` 穩定，常見實作是合併排序：有足夠暫存記憶體時 O(n log n)，配置不到時標準只保證 O(n log² n)。',
          'Python 3：`sorted` 與 `list.sort` 都是 TimSort 系列——以合併為基礎的自適應排序，先找出資料中已經排好的連續段（run），再把它們合併；穩定，對已排好的資料只要 O(n)。',
          'Java 17：物件陣列 `Arrays.sort(T[], ...)`、`List.sort` 與 `Collections.sort` 用 TimSort，穩定；基本型別陣列 `Arrays.sort(int[])` 用雙軸快速排序（dual-pivot quicksort），不保證穩定，但相等的 int 沒有差別。',
        ] },
        { type: 'p', text: '怎麼選：需要穩定（依某個欄位排紀錄、多次排序）、或必須保證最差情況時，用合併排序或穩定的函式庫排序；記憶體很緊、只排基本型別而且不在意穩定，可以用原地的快速排序；資料很少或幾乎排好時插入排序最快，所以許多函式庫在小區段改用插入排序。合併排序只需要「依序往前讀」，所以也很適合鏈結串列（合併時只要改指標，不必另開陣列），以及資料大到放不進記憶體、要先把每一塊排好再合併的外部排序（external sorting）。' },
        { type: 'callout', tone: 'tip', title: '什麼時候要自己寫合併排序', text: '只是要把資料排好時，直接用函式庫：它已經是 O(n log n)，而且經過大量測試。需要自己寫的，是題目要的東西藏在合併過程中：逆序數、「每個元素右邊有幾個比它小」、合併兩個已排好的序列等。觀念題則常要追蹤遞迴的切法與合併的順序、某一次合併後陣列的樣子，或比較次數的範圍，這些都要能一步步畫出遞迴樹才答得出來。' },
      ],
    },
  ],
  examples: [
    {
      id: 'ex-merge-two', title: '合併兩個有序串列：`<=` 與 `<` 的差別',
      description: '左邊 `1a 4b 4c 9d`、右邊 `2e 4f 7g` 都已依值排好。`merge` 用兩個索引每次取較小的，一邊用完就把另一邊剩下的接上。相等時取左邊（`<=`）得到 `4b 4c 4f`；改用 `<` 則變成 `4f 4b 4c`。兩者都比較 6 次。',
      output: 'with <=: 1a 2e 4b 4c 4f 7g 9d (compares 6)\nwith <: 1a 2e 4f 4b 4c 7g 9d (compares 6)',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

struct Item {
    int value;
    char tag;
};

// Merges two lists sorted by value. stable = true takes the left item on ties (<=), false uses <.
std::vector<Item> merge(const std::vector<Item>& left, const std::vector<Item>& right, bool stable, int& compares) {
    std::vector<Item> out;
    out.reserve(left.size() + right.size());
    std::size_t i = 0, j = 0;
    while (i < left.size() && j < right.size()) {
        compares++;
        bool takeLeft = stable ? left[i].value <= right[j].value : left[i].value < right[j].value;
        if (takeLeft) out.push_back(left[i++]);
        else out.push_back(right[j++]);
    }
    while (i < left.size()) out.push_back(left[i++]);   // one side is used up:
    while (j < right.size()) out.push_back(right[j++]);  // copy the rest of the other
    return out;
}

void show(const std::string& label, const std::vector<Item>& a, int compares) {
    std::cout << label << ":";
    for (const Item& x : a) std::cout << ' ' << x.value << x.tag;
    std::cout << " (compares " << compares << ")\n";
}

int main() {
    const std::vector<Item> left = {{1, 'a'}, {4, 'b'}, {4, 'c'}, {9, 'd'}};
    const std::vector<Item> right = {{2, 'e'}, {4, 'f'}, {7, 'g'}};
    int c1 = 0, c2 = 0;
    std::vector<Item> stable = merge(left, right, true, c1);
    std::vector<Item> unstable = merge(left, right, false, c2);
    show("with <=", stable, c1);
    show("with <", unstable, c2);
}`,
        Python: code`def merge(left, right, stable=True):
    """Merges two lists of (value, tag) sorted by value; stable takes the left item on ties."""
    out, i, j, compares = [], 0, 0, 0
    while i < len(left) and j < len(right):
        compares += 1
        take_left = left[i][0] <= right[j][0] if stable else left[i][0] < right[j][0]
        if take_left:
            out.append(left[i])
            i += 1
        else:
            out.append(right[j])
            j += 1
    out += left[i:]   # one side is used up:
    out += right[j:]  # copy the rest of the other
    return out, compares


def show(label, result):
    items, compares = result
    print(f"{label}:", " ".join(f"{v}{t}" for v, t in items), f"(compares {compares})")


left = [(1, "a"), (4, "b"), (4, "c"), (9, "d")]
right = [(2, "e"), (4, "f"), (7, "g")]
show("with <=", merge(left, right))
show("with <", merge(left, right, stable=False))`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    record Item(int value, char tag) {}

    static int compares;

    // Merges two lists sorted by value. stable = true takes the left item on ties (<=), false uses <.
    static List<Item> merge(List<Item> left, List<Item> right, boolean stable) {
        List<Item> out = new ArrayList<>(left.size() + right.size());
        int i = 0, j = 0;
        compares = 0;
        while (i < left.size() && j < right.size()) {
            compares++;
            int x = left.get(i).value(), y = right.get(j).value();
            boolean takeLeft = stable ? x <= y : x < y;
            if (takeLeft) out.add(left.get(i++));
            else out.add(right.get(j++));
        }
        while (i < left.size()) out.add(left.get(i++));    // one side is used up:
        while (j < right.size()) out.add(right.get(j++));  // copy the rest of the other
        return out;
    }

    static void show(String label, List<Item> a) {
        StringBuilder sb = new StringBuilder(label + ":");
        for (Item x : a) sb.append(' ').append(x.value()).append(x.tag());
        sb.append(" (compares ").append(compares).append(')');
        System.out.println(sb);
    }

    public static void main(String[] args) {
        List<Item> left = List.of(new Item(1, 'a'), new Item(4, 'b'), new Item(4, 'c'), new Item(9, 'd'));
        List<Item> right = List.of(new Item(2, 'e'), new Item(4, 'f'), new Item(7, 'g'));
        show("with <=", merge(left, right, true));
        show("with <", merge(left, right, false));
    }
}`,
      },
    },
    {
      id: 'ex-merge-sort', title: '完整的合併排序：一個暫存陣列、印出每次合併',
      description: '排序 `[5, 2, 4, 7, 1, 3, 2, 6]`。每次合併後印出 `merge [lo..hi]` 與該段排好的結果，縮排表示遞迴深度：先完成四個長度 2 的合併，再兩個長度 4，最後整個陣列。全程只配置一個 `tmp`，共比較 17 次。',
      output: '    merge [0..1]: 2 5\n    merge [2..3]: 4 7\n  merge [0..3]: 2 4 5 7\n    merge [4..5]: 1 3\n    merge [6..7]: 2 6\n  merge [4..7]: 1 2 3 6\nmerge [0..7]: 1 2 2 3 4 5 6 7\nsorted: 1 2 2 3 4 5 6 7\ncompares 17',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// Sorts a[lo..hi] (inclusive) through the one shared buffer tmp; prints every merge, indented by depth.
void mergeSort(std::vector<int>& a, std::vector<int>& tmp, int lo, int hi, int depth, int& compares) {
    if (lo >= hi) return;  // 0 or 1 element: already sorted
    int mid = lo + (hi - lo) / 2;
    mergeSort(a, tmp, lo, mid, depth + 1, compares);
    mergeSort(a, tmp, mid + 1, hi, depth + 1, compares);
    int i = lo, j = mid + 1, k = lo;
    while (i <= mid && j <= hi) {
        compares++;
        if (a[i] <= a[j]) tmp[k++] = a[i++];
        else tmp[k++] = a[j++];
    }
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= hi) tmp[k++] = a[j++];
    for (k = lo; k <= hi; k++) a[k] = tmp[k];
    std::cout << std::string(2 * depth, ' ') << "merge [" << lo << ".." << hi << "]:";
    for (k = lo; k <= hi; k++) std::cout << ' ' << a[k];
    std::cout << "\n";
}

int main() {
    std::vector<int> a = {5, 2, 4, 7, 1, 3, 2, 6};
    std::vector<int> tmp(a.size());  // allocated once, reused by every merge
    int compares = 0;
    mergeSort(a, tmp, 0, static_cast<int>(a.size()) - 1, 0, compares);
    std::cout << "sorted:";
    for (int v : a) std::cout << ' ' << v;
    std::cout << "\ncompares " << compares << "\n";
}`,
        Python: code`def merge_sort(a, tmp, lo, hi, depth=0):
    """Sorts a[lo..hi] (inclusive) through the shared buffer tmp; prints every merge; returns the comparisons."""
    if lo >= hi:  # 0 or 1 element: already sorted
        return 0
    mid = (lo + hi) // 2
    compares = merge_sort(a, tmp, lo, mid, depth + 1) + merge_sort(a, tmp, mid + 1, hi, depth + 1)
    i, j, k = lo, mid + 1, lo
    while i <= mid and j <= hi:
        compares += 1
        if a[i] <= a[j]:
            tmp[k] = a[i]
            i += 1
        else:
            tmp[k] = a[j]
            j += 1
        k += 1
    tmp[k:hi + 1] = a[i:mid + 1] + a[j:hi + 1]  # copy the rest of the unfinished side
    a[lo:hi + 1] = tmp[lo:hi + 1]
    print("  " * depth + f"merge [{lo}..{hi}]:", *a[lo:hi + 1])
    return compares


a = [5, 2, 4, 7, 1, 3, 2, 6]
tmp = [0] * len(a)  # allocated once, reused by every merge
compares = merge_sort(a, tmp, 0, len(a) - 1)
print("sorted:", *a)
print("compares", compares)`,
        Java: code`public class Main {
    static int compares = 0;

    // Sorts a[lo..hi] (inclusive) through the one shared buffer tmp; prints every merge, indented by depth.
    static void mergeSort(int[] a, int[] tmp, int lo, int hi, int depth) {
        if (lo >= hi) return;  // 0 or 1 element: already sorted
        int mid = lo + (hi - lo) / 2;
        mergeSort(a, tmp, lo, mid, depth + 1);
        mergeSort(a, tmp, mid + 1, hi, depth + 1);
        int i = lo, j = mid + 1, k = lo;
        while (i <= mid && j <= hi) {
            compares++;
            if (a[i] <= a[j]) tmp[k++] = a[i++];
            else tmp[k++] = a[j++];
        }
        while (i <= mid) tmp[k++] = a[i++];
        while (j <= hi) tmp[k++] = a[j++];
        for (k = lo; k <= hi; k++) a[k] = tmp[k];
        StringBuilder sb = new StringBuilder(" ".repeat(2 * depth) + "merge [" + lo + ".." + hi + "]:");
        for (k = lo; k <= hi; k++) sb.append(' ').append(a[k]);
        System.out.println(sb);
    }

    public static void main(String[] args) {
        int[] a = {5, 2, 4, 7, 1, 3, 2, 6};
        int[] tmp = new int[a.length];  // allocated once, reused by every merge
        mergeSort(a, tmp, 0, a.length - 1, 0);
        StringBuilder sb = new StringBuilder("sorted:");
        for (int v : a) sb.append(' ').append(v);
        System.out.println(sb);
        System.out.println("compares " + compares);
    }
}`,
      },
    },
    {
      id: 'ex-inversions', title: '用合併排序數逆序數，並和暴力法、公式比對',
      description: '`sortCount` 在取出右半元素時加上左半剩下的個數 `mid − i + 1`。小陣列與 O(n²) 暴力法比對（都是 8）；n = 100000 的反序陣列與公式 n(n − 1)/2 比對，答案 4999950000 超過 `int` 範圍，C++ 用 `long long`、Java 用 `long`。',
      output: 'a: 3 1 4 1 5 9 2 6\nmerge sort: 8\nbrute force: 8\nreversed n = 100000: merge sort 4999950000, formula 4999950000',
      code: {
        'C++': code`#include <iostream>
#include <vector>

// Sorts a[lo..hi] and returns the number of pairs i < j with a[i] > a[j] inside it.
long long sortCount(std::vector<int>& a, std::vector<int>& tmp, int lo, int hi) {
    if (lo >= hi) return 0;
    int mid = lo + (hi - lo) / 2;
    long long count = sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid + 1, hi);
    int i = lo, j = mid + 1, k = lo;
    while (i <= mid && j <= hi) {
        if (a[i] <= a[j]) {
            tmp[k++] = a[i++];
        } else {
            count += mid - i + 1;  // a[j] is smaller than a[i..mid], all still waiting on the left
            tmp[k++] = a[j++];
        }
    }
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= hi) tmp[k++] = a[j++];
    for (k = lo; k <= hi; k++) a[k] = tmp[k];
    return count;
}

long long countInversions(std::vector<int> a) {  // a copy: the caller's array stays unsorted
    std::vector<int> tmp(a.size());
    return sortCount(a, tmp, 0, static_cast<int>(a.size()) - 1);
}

long long bruteForce(const std::vector<int>& a) {
    long long count = 0;
    for (std::size_t i = 0; i < a.size(); i++)
        for (std::size_t j = i + 1; j < a.size(); j++)
            if (a[i] > a[j]) count++;
    return count;
}

int main() {
    const std::vector<int> a = {3, 1, 4, 1, 5, 9, 2, 6};
    std::cout << "a:";
    for (int v : a) std::cout << ' ' << v;
    std::cout << "\nmerge sort: " << countInversions(a) << "\nbrute force: " << bruteForce(a) << "\n";

    const int n = 100000;
    std::vector<int> rev(n);
    for (int k = 0; k < n; k++) rev[k] = n - k;  // n, n - 1, ..., 1: every pair is an inversion
    std::cout << "reversed n = " << n << ": merge sort " << countInversions(rev)
              << ", formula " << static_cast<long long>(n) * (n - 1) / 2 << "\n";
}`,
        Python: code`def sort_count(a, tmp, lo, hi):
    """Sorts a[lo..hi] and returns the number of pairs i < j with a[i] > a[j] inside it."""
    if lo >= hi:
        return 0
    mid = (lo + hi) // 2
    count = sort_count(a, tmp, lo, mid) + sort_count(a, tmp, mid + 1, hi)
    i, j, k = lo, mid + 1, lo
    while i <= mid and j <= hi:
        if a[i] <= a[j]:
            tmp[k] = a[i]
            i += 1
        else:
            count += mid - i + 1  # a[j] is smaller than a[i..mid], all still waiting on the left
            tmp[k] = a[j]
            j += 1
        k += 1
    tmp[k:hi + 1] = a[i:mid + 1] + a[j:hi + 1]
    a[lo:hi + 1] = tmp[lo:hi + 1]
    return count


def count_inversions(a):
    a = a[:]  # a copy: the caller's list stays unsorted
    return sort_count(a, [0] * len(a), 0, len(a) - 1)


def brute_force(a):
    return sum(1 for i in range(len(a)) for j in range(i + 1, len(a)) if a[i] > a[j])


a = [3, 1, 4, 1, 5, 9, 2, 6]
print("a:", *a)
print("merge sort:", count_inversions(a))
print("brute force:", brute_force(a))

n = 100000
rev = list(range(n, 0, -1))  # n, n - 1, ..., 1: every pair is an inversion
print(f"reversed n = {n}: merge sort {count_inversions(rev)}, formula {n * (n - 1) // 2}")`,
        Java: code`public class Main {
    // Sorts a[lo..hi] and returns the number of pairs i < j with a[i] > a[j] inside it.
    static long sortCount(int[] a, int[] tmp, int lo, int hi) {
        if (lo >= hi) return 0;
        int mid = lo + (hi - lo) / 2;
        long count = sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid + 1, hi);
        int i = lo, j = mid + 1, k = lo;
        while (i <= mid && j <= hi) {
            if (a[i] <= a[j]) {
                tmp[k++] = a[i++];
            } else {
                count += mid - i + 1;  // a[j] is smaller than a[i..mid], all still waiting on the left
                tmp[k++] = a[j++];
            }
        }
        while (i <= mid) tmp[k++] = a[i++];
        while (j <= hi) tmp[k++] = a[j++];
        for (k = lo; k <= hi; k++) a[k] = tmp[k];
        return count;
    }

    static long countInversions(int[] original) {
        int[] a = original.clone();  // a copy: the caller's array stays unsorted
        return sortCount(a, new int[a.length], 0, a.length - 1);
    }

    static long bruteForce(int[] a) {
        long count = 0;
        for (int i = 0; i < a.length; i++)
            for (int j = i + 1; j < a.length; j++)
                if (a[i] > a[j]) count++;
        return count;
    }

    public static void main(String[] args) {
        int[] a = {3, 1, 4, 1, 5, 9, 2, 6};
        StringBuilder sb = new StringBuilder("a:");
        for (int v : a) sb.append(' ').append(v);
        System.out.println(sb);
        System.out.println("merge sort: " + countInversions(a));
        System.out.println("brute force: " + bruteForce(a));

        int n = 100000;
        int[] rev = new int[n];
        for (int k = 0; k < n; k++) rev[k] = n - k;  // n, n - 1, ..., 1: every pair is an inversion
        System.out.println("reversed n = " + n + ": merge sort " + countInversions(rev) + ", formula " + (long) n * (n - 1) / 2);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'sorting-steps', title: '合併排序：一路切半，回程時用 tmp 合併', language: 'Python',
    code: code`def merge_sort(a, lo, hi):
    if lo >= hi:
        return
    mid = (lo + hi) // 2
    merge_sort(a, lo, mid)
    merge_sort(a, mid + 1, hi)
    tmp, i, j = [], lo, mid + 1
    while i <= mid and j <= hi:
        if a[i] <= a[j]:
            tmp.append(a[i]); i += 1
        else:
            tmp.append(a[j]); j += 1
    a[lo:hi + 1] = tmp + a[i:mid + 1] + a[j:hi + 1]
a = [5, 2, 4, 2, 6, 1]
merge_sort(a, 0, len(a) - 1); print(*a)`,
    steps: mergeTrace,
    tryIt: { algorithm: 'merge-sort', initial: [8, 3, 5, 3, 9, 1, 7] },
  },
  quiz: [
    {
      id: 'q-levels', prompt: '用本課的合併排序（`[lo, mid]` 與 `[mid + 1, hi]`，合併時每次比較輸出一個元素）排 n = 8 個數。要合併的有幾層？不論輸入怎麼排列，總比較次數最多是多少？',
      options: ['8 層，最多 28 次', '3 層，最多 17 次', '3 層，最多 24 次', '4 層，最多 12 次'],
      answer: 1, explanation: '長度 8 → 4 → 2 → 1，要合併的有 3 = log₂ 8 層。合併長度 p、q 的兩段最多比較 p + q − 1 次：最底層 4 次合併各 1 次、中間 2 次合併各 3 次、最上層 1 次合併 7 次，共 4 + 6 + 7 = 17 次。「24 次」是 n log₂ n = 8 × 3，是很好的估計，但每次合併至少少比一次；「28 次」是 O(n²) 排序的 n(n − 1)/2；12 次是最少的比較次數（每次合併較短的一邊先用完），不是最多。以程式跑過全部 8! = 40320 種排列確認：比較次數介於 12 與 17。',
    },
    {
      id: 'q-merge-trace', prompt: '下面的程式合併兩個有序串列，記錄每一步取的是左邊（L）還是右邊（R），最後印出順序與比較次數。輸出是什麼？',
      code: { language: 'Python', text: code`left = [3, 5, 8]
right = [1, 5, 9]
i = j = compares = 0
sides = []
while i < len(left) and j < len(right):
    compares += 1
    if left[i] <= right[j]:
        sides.append("L")
        i += 1
    else:
        sides.append("R")
        j += 1
sides += ["L"] * (len(left) - i) + ["R"] * (len(right) - j)
print(*sides, compares)` },
      options: ['R L L R L R 5', 'R L R L L R 5', 'R L L R L R 6', 'L R L R L R 5'],
      answer: 0, explanation: '3 vs 1 取 R；3 vs 5 取 L；5 vs 5 相等，`<=` 成立取 L；8 vs 5 取 R；8 vs 9 取 L；這時左邊用完，剩下的 9 直接接上（R），不需比較。共 5 次比較，順序 `R L L R L R`。「R L R L L R」是相等時取右邊（`<`）的結果；「6」把最後直接接上的元素也算成一次比較；「L R L R L R」以為兩邊輪流取。實際執行確認。',
    },
    {
      id: 'q-stable-why', prompt: '本課的合併排序在 `a[i] == a[j]` 時取左半的 `a[i]`。這為什麼能讓整個排序穩定？',
      options: [
        '因為合併排序從不交換元素，所以不論相等時取哪邊都是穩定的',
        '因為 mid 取在正中間，左右兩半的長度最多差 1',
        '因為左半的元素在原陣列中都在右半的元素前面：相等時先放左半，就保持了原本的先後，而每一次合併都這樣做',
        '因為遞迴時先排左半、再排右半',
      ],
      answer: 2, explanation: '每次合併的兩段在原陣列中是相鄰的，左段整個在右段前面，而且（歸納地）每段內部已經穩定地排好；相等時取左邊，左段的相等元素就會留在右段的相等元素前面，所以每次合併後仍然穩定。「從不交換」不是理由：改成 `<` 同樣不交換，卻會讓右邊相等的元素跑到前面；兩半長度、先排哪一半都和相等元素的先後無關。以 3000 組隨機小紀錄陣列和 Python 的穩定 `sorted` 比對確認：`<=` 版本全部一致，`<` 版本有 2341 組不一致。',
    },
    {
      id: 'q-inversions', prompt: '下面的程式用合併排序計算逆序數。輸出是什麼？',
      code: { language: 'Python', text: code`def count(a):
    if len(a) <= 1:
        return a, 0
    mid = len(a) // 2
    left, x = count(a[:mid])
    right, y = count(a[mid:])
    merged, i, j, c = [], 0, 0, x + y
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i])
            i += 1
        else:
            c += len(left) - i
            merged.append(right[j])
            j += 1
    merged += left[i:] + right[j:]
    return merged, c


print(count([3, 1, 4, 1, 5, 2])[1])` },
      options: ['5', '6', '7', '15'],
      answer: 1, explanation: '逆序對：3 和後面的 1、1、2（3 對），4 和後面的 1、2（2 對），5 和 2（1 對），兩個 1 相等不算，共 6。程式取出右半元素時加上左半剩下的個數，相等時取左半，所以不會把 (1, 1) 算進去。「7」是把 `<=` 改成 `<` 的結果，相等的一對被誤算；「15」是 n(n − 1)/2，只有嚴格遞減時才會這麼多。實際執行，並把 `<=` 改成 `<` 再跑一次確認得到 7。',
    },
    {
      id: 'q-bug-split', prompt: '下面的合併排序把區段切成 `[lo, mid − 1]` 與 `[mid, hi]`。執行後會怎樣？',
      code: { language: 'Python', text: code`def merge_sort(a, lo, hi):
    if lo >= hi:
        return
    mid = (lo + hi) // 2
    merge_sort(a, lo, mid - 1)  # left half a[lo..mid-1]
    merge_sort(a, mid, hi)      # right half a[mid..hi]
    tmp, i, j = [], lo, mid
    while i < mid and j <= hi:
        if a[i] <= a[j]:
            tmp.append(a[i]); i += 1
        else:
            tmp.append(a[j]); j += 1
    a[lo:hi + 1] = tmp + a[i:mid] + a[j:hi + 1]


a = [4, 1, 3, 2]
merge_sort(a, 0, len(a) - 1)
print(a)` },
      options: ['印出 `[1, 2, 3, 4]`', '印出沒有排好的結果，例如 `[1, 4, 2, 3]`', '丟出 `IndexError`', '丟出 `RecursionError`'],
      answer: 3, explanation: '區段只剩兩個元素時（例如 lo = 0、hi = 1），mid = (0 + 1) // 2 = 0：左半 `[0, −1]` 是空的會立刻回傳，右半卻是 `merge_sort(a, 0, 1)`——和原本的呼叫一模一樣，區段沒有變短，遞迴永遠停不下來，直到超過 Python 的遞迴上限丟出 `RecursionError`。程式根本走不到合併，所以不會印出任何陣列；索引也都沒有越界。修正方法是改回 `[lo, mid]` 與 `[mid + 1, hi]`，或在這種切法下改用 `mid = (lo + hi + 1) // 2`。實際執行確認，並確認改用後者時印出 `[1, 2, 3, 4]`。',
    },
    {
      id: 'q-choose', prompt: '三個情境：（甲）10^6 筆物件紀錄依分數排序，同分要保持原本的報名順序；（乙）10^6 個 int，記憶體很緊，無法再配置一個同樣大小的陣列，不需要穩定；（丙）只有 20 個、幾乎排好（只有一對相鄰元素顛倒）的數。各選哪一種排序最合適？',
      options: [
        '甲 快速排序、乙 合併排序、丙 插入排序',
        '甲、乙、丙都用合併排序，因為它在每種情況都是 O(n log n)',
        '甲 合併排序、乙 快速排序（隨機選基準）、丙 插入排序',
        '甲 插入排序、乙 快速排序、丙 合併排序',
      ],
      answer: 2, explanation: '甲需要穩定，又有 10^6 筆：合併排序（或函式庫的穩定排序，例如 Java 物件的 TimSort）。乙不能配置長度 n 的暫存陣列，合併排序不適合；原地的快速排序只用平均 O(log n) 的堆疊，隨機選基準讓 O(n²) 的最差情況極不可能發生。丙很小又幾乎排好，插入排序約 n + 逆序數次比較。「都用合併排序」忽略了乙的記憶體限制，而且 O(n log n) 不代表小資料上最快；甲用一般的快速排序會失去穩定性。以程式實測丙：插入排序比較 20 次，合併排序比較 49 次。',
    },
  ],
  exercises: [
    {
      id: 'e-count-inversions', title: '逆序數：數出 i < j 且 a[i] > a[j] 的配對',
      statement: '給一個長度 n 的整數序列 a[0], a[1], …, a[n − 1]，請計算逆序對的個數：滿足 i < j 而且 a[i] > a[j] 的索引配對 (i, j) 有幾個（相等的兩個值不算逆序）。這個數字也是「只用相鄰交換把序列排好」最少需要的交換次數。n 最大 2 × 10^5，O(n²) 的暴力法會超時，請在合併排序的過程中計數；答案可能超過 2^31 − 1。輸入有任何不合法之處時，只輸出一行 `Invalid`：輸入為空、第一個數 n 不是 1 到 2 × 10^5 的整數、n 之後的整數個數不是剛好 n 個（多或少都算）、某個值不是整數，或超出 −10^9 到 10^9。整數的寫法是：可有一個負號 `-`，後面接 1 到 10 個數字 0–9（不接受 `+` 號、小數點或其他字元；n 不能有負號，最多 6 個數字）。',
      inputFormat: '第一個數是 n，接著是 n 個整數 a[0] … a[n − 1]，彼此以空白或換行分隔（通常第一行是 n，第二行是 n 個數）。',
      outputFormat: '一行：逆序對的個數；或只有一行 `Invalid`。',
      constraints: [
        '1 ≤ n ≤ 2 × 10^5',
        '−10^9 ≤ a[i] ≤ 10^9，可以重複',
        '答案最大約 2 × 10^10：C++ 用 `long long`、Java 用 `long`',
      ],
      samples: [
        { kind: 'normal', input: '6\n3 1 4 1 5 2', output: '6', note: '(3,1) (3,1) (3,2) (4,1) (4,2) (5,2)；兩個 1 相等不算' },
      ],
      tests: [
        { kind: 'normal', input: '6\n3 1 4 1 5 2', output: '6', note: '範例' },
        { kind: 'normal', input: '8\n-5 3 -5 0 10 -1 3 2', output: '9', note: '負數與重複值（兩個 −5、兩個 3）混在一起' },
        { kind: 'normal', input: '6\n1000000000 -1000000000 999999999 -999999999 0 1000000000', output: '6', note: '值在 ±10^9 的邊界，頭尾兩個 10^9 相等不算' },
        { kind: 'normal', input: '5\n5 4\n3\n2 1', output: '10', note: '數字分在好幾行：以空白或換行分隔都可以' },
        { kind: 'normal', input: asInput(medium), output: String(bruteInversions(medium)), note: '2000 個 ±10^9 範圍的隨機值（答案由 O(n²) 暴力法算出）' },
        { kind: 'normal', input: asInput(big), output: String(smallValueInversions(big)), note: `${BIG} 個 −99 到 99 的隨機值、大量重複：O(n²) 會超時，答案約 10^10 超過 32 位元，相等時必須取左半` },
        { kind: 'edge', input: '1\n7', output: '0', note: '只有一個元素' },
        { kind: 'edge', input: '1\n-1000000000', output: '0', note: '一個元素而且是最小值' },
        { kind: 'edge', input: '6\n-3 -1 0 2 2 9', output: '0', note: '已排好（含重複）：相等時取右半的寫法會誤算出 1' },
        { kind: 'edge', input: '5\n5 4 3 2 1', output: '10', note: '嚴格遞減：每一對都是逆序，n(n − 1)/2' },
        { kind: 'edge', input: '7\n4 4 4 4 4 4 4', output: '0', note: '全部相等：沒有任何逆序對' },
        { kind: 'edge', input: '2\n2 1', output: '1', note: '兩個元素、顛倒' },
        { kind: 'edge', input: '2\n1 1', output: '0', note: '兩個相等的元素' },
        { kind: 'edge', input: '6\n3 3 2 2 1 1', output: '12', note: '遞減但成對重複：15 對中扣掉 3 對相等' },
        { kind: 'edge', input: asInput(reversed), output: String((REV * (REV - 1)) / 2), note: `n = ${REV} 的嚴格遞減序列：答案 n(n − 1)/2 = 2449965000 超過 2^31 − 1，用 32 位元累加會溢位` },
        { kind: 'error', input: '3\n1 2', output: 'Invalid', note: 'n = 3 但只有兩個數' },
        { kind: 'error', input: '2\n1 2 3', output: 'Invalid', note: 'n = 2 但有三個數' },
        { kind: 'error', input: '3\n1 2.5 3', output: 'Invalid', note: '2.5 不是整數' },
        { kind: 'error', input: '2\n1 x', output: 'Invalid', note: '值不是數字' },
        { kind: 'error', input: '2\n1000000001 0', output: 'Invalid', note: '值超過 10^9' },
        { kind: 'error', input: '2\n+1 2', output: 'Invalid', note: '不接受 `+` 號' },
        { kind: 'error', input: '0', output: 'Invalid', note: 'n = 0 不在 1..2 × 10^5' },
        { kind: 'error', input: '200001\n1', output: 'Invalid', note: 'n 超過 2 × 10^5' },
        { kind: 'error', input: '-3\n1 2 3', output: 'Invalid', note: 'n 是負數' },
        { kind: 'error', input: '', output: 'Invalid', note: '空輸入' },
      ],
      hints: [
        '先讀完全部的數並檢查：個數剛好 n 個、每個都是合法範圍內的整數，才開始計算。',
        '寫一個 `sortCount(lo, hi)`：排好 `a[lo..hi]` 並回傳這段內部的逆序數 = 左半的 + 右半的 + 合併時數到的跨半邊配對。',
        '合併時取出右半的 `a[j]`，代表左半剩下的 `a[i..mid]` 都比它大，加上 `mid − i + 1`；相等時一定要取左半，否則會把相等的配對算進去。',
        '只配置一次長度 n 的暫存陣列；遞迴深度只有約 log₂ n ≈ 18 層，不必擔心遞迴上限。',
        '計數變數用 `long long`（C++）或 `long`（Java），n = 2 × 10^5 時答案可能約 2 × 10^10。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// Parses an optional '-' and 1..maxDigits digits into v; false if the token is anything else.
bool parse(const std::string& s, std::size_t maxDigits, long long& v) {
    std::size_t start = (!s.empty() && s[0] == '-') ? 1 : 0;
    if (s.size() == start || s.size() - start > maxDigits) return false;
    v = 0;
    for (std::size_t k = start; k < s.size(); k++) {
        if (s[k] < '0' || s[k] > '9') return false;
        v = v * 10 + (s[k] - '0');
    }
    if (start) v = -v;
    return true;
}

// Sorts a[lo..hi] through tmp and returns the inversions inside it (64-bit: up to n(n-1)/2).
long long sortCount(std::vector<int>& a, std::vector<int>& tmp, int lo, int hi) {
    if (lo >= hi) return 0;
    int mid = lo + (hi - lo) / 2;
    long long count = sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid + 1, hi);
    int i = lo, j = mid + 1, k = lo;
    while (i <= mid && j <= hi) {
        if (a[i] <= a[j]) {
            tmp[k++] = a[i++];  // equal values are not an inversion: take the left one
        } else {
            count += mid - i + 1;
            tmp[k++] = a[j++];
        }
    }
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= hi) tmp[k++] = a[j++];
    for (k = lo; k <= hi; k++) a[k] = tmp[k];
    return count;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<std::string> tokens;
    std::string token;
    while (std::cin >> token) tokens.push_back(token);
    long long n = 0;
    bool ok = !tokens.empty() && tokens[0][0] != '-' && parse(tokens[0], 6, n) && n >= 1 && n <= 200000
              && tokens.size() == static_cast<std::size_t>(n) + 1;
    std::vector<int> a;
    for (std::size_t k = 1; ok && k < tokens.size(); k++) {
        long long v = 0;
        ok = parse(tokens[k], 10, v) && v >= -1000000000LL && v <= 1000000000LL;
        a.push_back(static_cast<int>(v));
    }
    if (!ok) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<int> tmp(a.size());
    std::cout << sortCount(a, tmp, 0, static_cast<int>(a.size()) - 1) << "\n";
}`,
        Python: code`import re
import sys

INT = re.compile(r"-?[0-9]{1,10}")


def sort_count(a, tmp, lo, hi):
    """Sorts a[lo..hi] through tmp and returns the inversions inside it."""
    if lo >= hi:
        return 0
    mid = (lo + hi) // 2
    count = sort_count(a, tmp, lo, mid) + sort_count(a, tmp, mid + 1, hi)
    i, j, k = lo, mid + 1, lo
    while i <= mid and j <= hi:
        if a[i] <= a[j]:  # equal values are not an inversion: take the left one
            tmp[k] = a[i]
            i += 1
        else:
            count += mid - i + 1
            tmp[k] = a[j]
            j += 1
        k += 1
    tmp[k:hi + 1] = a[i:mid + 1] + a[j:hi + 1]
    a[lo:hi + 1] = tmp[lo:hi + 1]
    return count


def solve(tokens):
    if not tokens or not re.fullmatch(r"[0-9]{1,6}", tokens[0]):
        return None
    n = int(tokens[0])
    if not 1 <= n <= 200000 or len(tokens) != n + 1:
        return None
    if not all(INT.fullmatch(t) for t in tokens[1:]):
        return None
    a = [int(t) for t in tokens[1:]]
    if any(abs(v) > 10**9 for v in a):
        return None
    return sort_count(a, [0] * n, 0, n - 1)


result = solve(sys.stdin.read().split())
print("Invalid" if result is None else result)`,
        Java: code`import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class Main {
    // The value of an optional '-' and 1..maxDigits digits, or null if the token is anything else.
    static Long parse(String s, int maxDigits) {
        int start = s.startsWith("-") ? 1 : 0;
        if (s.length() == start || s.length() - start > maxDigits) return null;
        long v = 0;
        for (int k = start; k < s.length(); k++) {
            char ch = s.charAt(k);
            if (ch < '0' || ch > '9') return null;
            v = v * 10 + (ch - '0');
        }
        return start == 1 ? -v : v;
    }

    // Sorts a[lo..hi] through tmp and returns the inversions inside it (long: up to n(n-1)/2).
    static long sortCount(int[] a, int[] tmp, int lo, int hi) {
        if (lo >= hi) return 0;
        int mid = lo + (hi - lo) / 2;
        long count = sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid + 1, hi);
        int i = lo, j = mid + 1, k = lo;
        while (i <= mid && j <= hi) {
            if (a[i] <= a[j]) {
                tmp[k++] = a[i++];  // equal values are not an inversion: take the left one
            } else {
                count += mid - i + 1;
                tmp[k++] = a[j++];
            }
        }
        while (i <= mid) tmp[k++] = a[i++];
        while (j <= hi) tmp[k++] = a[j++];
        for (k = lo; k <= hi; k++) a[k] = tmp[k];
        return count;
    }

    static String solve(String[] tokens) {
        Long n = tokens.length > 0 && !tokens[0].startsWith("-") ? parse(tokens[0], 6) : null;
        if (n == null || n < 1 || n > 200000 || tokens.length != n + 1) return "Invalid";
        int[] a = new int[(int) (long) n];
        for (int k = 0; k < a.length; k++) {
            Long v = parse(tokens[k + 1], 10);
            if (v == null || v < -1000000000L || v > 1000000000L) return "Invalid";
            a[k] = (int) (long) v;
        }
        return String.valueOf(sortCount(a, new int[a.length], 0, a.length - 1));
    }

    public static void main(String[] args) throws IOException {
        String text = new String(System.in.readAllBytes(), StandardCharsets.US_ASCII).trim();
        System.out.println(solve(text.isEmpty() ? new String[0] : text.split("\\s+")));
    }
}`,
      },
      judge: 'none',
    },
  ],
};

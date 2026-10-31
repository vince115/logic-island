import type { LessonContent, TraceStep } from '../schema';
import { twoSumSteps } from '../simulate-algorithms';

const code = String.raw;

/** The visualization's data: target 10 moves both pointers several times before 4 + 6 is found. */
const TRACE_A = [1, 3, 4, 6, 8, 11, 15];
const TRACE_T = 10;

/**
 * twoSumSteps runs the left/right pointer search of the trace code. Its 'compare' event is one step per round; each
 * round is moved here to the line of the branch it took (line 7 `break`, line 9 `left += 1`, line 11 `right -= 1`),
 * the variable `sum` is shown as the trace code's `s`, and the result step goes to the print on line 12.
 */
const traceSteps: TraceStep[] = twoSumSteps(TRACE_A, TRACE_T, { compare: 5, result: 12 }).map((step): TraceStep => {
  if (step.vars?.sum === undefined) return step;
  const { sum, ...rest } = step.vars;
  const s = Number(sum);
  return { ...step, line: s === TRACE_T ? 7 : s < TRACE_T ? 9 : 11, vars: { ...rest, s: sum } };
});

/** Exercise: a brute-force O(n²) count, used for the medium-sized test (n = 1000). */
function bruteCount(values: number[], k: number): number {
  let count = 0;
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) if (values[i] + values[j] <= k) count++;
  return count;
}

/**
 * Exercise: a count independent of two pointers, for the large tests. With f(v) copies of each value v and le(x) the
 * number of elements ≤ x, the ordered pairs (i, j), i ≠ j, with a[i] + a[j] ≤ k are Σ f(v)·le(k − v) minus the
 * f(v) self-pairs where 2v ≤ k; each unordered pair is counted twice. Checked against a brute-force counter on the
 * n = 1000 test and against the three reference solutions.
 */
function formulaCount(values: number[], k: number): number {
  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  const distinct = [...freq.keys()].sort((x, y) => x - y);
  const cumulative: number[] = [];
  distinct.forEach((v, i) => cumulative.push((i > 0 ? cumulative[i - 1] : 0) + freq.get(v)!));
  const atMost = (x: number) => {
    let lo = 0, hi = distinct.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (distinct[mid] <= x) lo = mid + 1; else hi = mid; }
    return lo > 0 ? cumulative[lo - 1] : 0;
  };
  let ordered = 0;
  for (const v of distinct) ordered += freq.get(v)! * atMost(k - v) - (2 * v <= k ? freq.get(v)! : 0);
  return ordered / 2;
}

const BIG_N = 200_000;
const medValues = Array.from({ length: 1000 }, (_, i) => ((i * 37) % 201) - 100);
const medInput = `1000 -7\n${medValues.join(' ')}`;
const onesInput = `${BIG_N} 2\n${Array(BIG_N).fill('1').join(' ')}`;
const mixedValues = Array.from({ length: BIG_N }, (_, i) => ((i * 7919) % 2001) - 1000);
const mixedInput = `${BIG_N} 37\n${mixedValues.join(' ')}`;
const altValues = Array.from({ length: 50_000 }, (_, i) => (i % 2 === 0 ? 2_000_000_000 : -2_000_000_000));
const altInput = `50000 0\n${altValues.join(' ')}`;

/** A08 Two Pointers. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const A08: LessonContent = {
  lessonId: 'A08',
  motivation: '「在 10 萬個數裡找兩個數，和剛好是 T」：把每一對都試一遍要比較約 5×10^9 次；如果資料已經由小到大排好，從兩端各放一個指標（pointer，這裡就是索引），和太小就把左邊往右移、和太大就把右邊往左移，最多 n − 1 步就能回答。這種「兩個索引只往一個方向前進」的雙指標（two pointers）技巧，把很多 O(n²) 的配對問題降成 O(n)：找和為目標的一對、數出和不超過 K 的配對有幾組、原地刪除重複值或指定的值、合併兩個排好的陣列。它的限制也很明確：左右指標依賴「有序」，資料沒排好就要先排序 O(n log n)，排序又會打亂原本的位置；條件必須讓「移動某一邊」不會錯過答案；而且它找的是配對或連續區間這種結構，不是萬用的搜尋法。本課也會比較雙指標、暴力法與雜湊集合各自適合的情況。',
  sections: [
    {
      id: 'opposite-ends', title: '左右指標：在有序陣列找和為目標的配對',
      blocks: [
        { type: 'p', text: '問題：已由小到大排好的陣列 `a`，找兩個不同位置 `i < j`，使 `a[i] + a[j] == T`。暴力法（brute force）檢查所有 n(n − 1)/2 對，是 O(n²)。左右指標的做法：`left = 0`、`right = n − 1`，只要 `left < right` 就看 `s = a[left] + a[right]`：相等就找到了；`s < T` 就 `left += 1`；`s > T` 就 `right -= 1`。' },
        { type: 'p', text: '為什麼移動不會錯過答案？關鍵是：每一步只丟掉「已經不可能在答案裡」的元素。`s < T` 時，`a[right]` 是目前範圍 `a[left..right]` 裡最大的數，`a[left]` 配上它都還不夠，配上範圍內任何其他數只會更小，所以 `a[left]` 不可能是答案的一部分，可以丟掉。`s > T` 時對稱：`a[left]` 是範圍內最小的，`a[right]` 配上它都太大，`a[right]` 也可以丟掉。這是一個迴圈不變量（loop invariant）：「如果答案存在，它的兩個元素都還在 `a[left..right]` 裡」。' },
        { type: 'table', head: ['目前的和', '可以確定的事', '移動'], rows: [
          ['`s == T`', '找到一對', '停止（只要一對時）'],
          ['`s < T`', '`a[left]` 配範圍內最大的數都不夠：`a[left]` 沒有用', '`left += 1`'],
          ['`s > T`', '`a[right]` 配範圍內最小的數都太大：`a[right]` 沒有用', '`right -= 1`'],
        ] },
        { type: 'p', text: '複雜度：每一步讓 `right − left` 減 1，最多 n − 1 步，時間 O(n)、額外空間 O(1)。資料沒排好時要先排序，總共 O(n log n)，仍然比 O(n²) 快很多：n = 10^5 時，排序約 1.7×10^6 次比較，暴力法約 5×10^9 次。下方的視覺化在 `[1, 3, 4, 6, 8, 11, 15]` 找和為 10：right 先往左移兩次、left 右移……共 6 回合找到 `4 + 6`；「自己試試」可以換成自己的有序資料與目標。' },
        { type: 'p', text: '題目要的是「原本的索引」時，直接排序會把位置弄丟。做法是把 (值, 原索引) 綁成一組再排序：C++ 用 `std::pair<int, int>`（`std::sort` 依字典順序比較，先比值再比索引），Python 用 tuple（`sorted` 也是先比第一個元素），Java 用 `int[][]` 搭配比較器（Comparator）。找到後再輸出兩個原索引，小的在前。' },
        { type: 'example', id: 'pair-indices' },
        { type: 'p', text: '排序後的值是 `1 3 5 5 6 8 11 15`。找 10 時兩個 5 是不同位置的元素（原索引 3 與 7），可以配對；找 2 時只有一個 1，`left < right` 的條件保證不會拿同一個元素用兩次，答案是 none。找不到時正好走 n − 1 = 7 回合，這是最壞情況。和用 `long long`／`long` 計算，是為了值很大時不溢位（見最後一節）。' },
      ],
    },
    {
      id: 'counting', title: '數配對：和 ≤ K 的個數，以及和 = K 時的重複值',
      blocks: [
        { type: 'p', text: '「有幾對 `i < j` 的和 ≤ K」也能用左右指標。排好序後，若 `a[left] + a[right] <= K`，那麼 `a[left]` 配上 `a[left + 1]`、`a[left + 2]`、…、`a[right]` 都成立（它們都 ≤ `a[right]`），一次就能數 `right − left` 對，然後 `left += 1`（`a[left]` 的配對全部數完了）。否則 `a[right]` 配上最小的 `a[left]` 都太大，配誰都不成立，`right -= 1`。每一步一樣丟掉一個元素，時間 O(n)，加上排序 O(n log n)。' },
        { type: 'p', text: '「和剛好 = K 的配對有幾對」要小心重複值。在 `[2, 2, 2, 3, 3, 4]` 數和為 5 的配對：三個 2 與兩個 3 兩兩都能配，共 3 × 2 = 6 對。如果找到一對就把兩個指標各移一格，只會數到 2 對。正確做法是找到時先數出左邊有幾個相同的值 `cl`、右邊有幾個 `cr`，加上 `cl × cr`，再把兩個指標各自跳過這一整批；特例是 `a[left] == a[right]`，表示中間全部相等，任選兩個都成立，加上 m(m − 1)/2（m = `right − left + 1`）就結束。' },
        { type: 'example', id: 'count-pairs' },
        { type: 'p', text: '範例中三組小資料都和暴力法比對（`brute=same`）。最後一行有 10^5 個 0，每一對的和都是 0，共 100000 × 99999 / 2 = 4999950000 對，超過 `int` 的上限 2147483647，所以計數器在 C++ 要用 `long long`、Java 用 `long`。第三組資料的 `2×10^9 + 2×10^9 = 4×10^9` 也超過 `int`：若用 `int` 相加會溢位成 −294967296，被誤判為 ≤ 0。' },
        { type: 'callout', tone: 'warning', title: '找到一對就同時移動兩個指標', text: '只要「是否存在」或資料沒有重複時，找到後 `left += 1; right -= 1` 沒問題。一旦要「數個數」而且有重複值，這樣做會漏掉同一批值之間的其他組合：`[2, 2, 2, 3, 3]` 中和為 5 的配對有 6 對，同時移動只數到 2 對。要嘛成批計算（如範例的 `cl × cr`），要嘛改用「和 ≤ K 的個數 − 和 ≤ K − 1 的個數」（整數時兩者相減就是和剛好為 K 的個數）。' },
      ],
    },
    {
      id: 'fast-slow', title: '快慢指標：原地去重、原地刪除與合併',
      blocks: [
        { type: 'p', text: '另一種雙指標是兩個指標往同一個方向走：快指標（fast）逐一讀每個元素，慢指標（slow）指向「下一個要寫入的位置」。`a[0..slow − 1]` 永遠是已經整理好的結果，這就是迴圈不變量。因為 slow ≤ fast，寫入的位置一定已經讀過，不會蓋掉還沒處理的資料，所以不需要另一個陣列，額外空間 O(1)。' },
        { type: 'list', ordered: true, items: [
          '去重（排好序的陣列）：`slow = 1`（第一個元素一定保留）；fast 從 1 走到 n − 1，`a[fast] != a[slow − 1]`（和最後保留的值不同）時，寫入 `a[slow] = a[fast]`、`slow += 1`。結束時 slow 就是新長度。',
          '刪除所有等於 val 的元素（不需排序）：`slow = 0`；`a[fast] != val` 時寫入並 `slow += 1`。保留下來的元素維持原本的順序。',
          '兩種都要注意空陣列：去重時 n = 0 要直接回傳 0，否則 `slow = 1` 會回報錯誤的長度。',
        ] },
        { type: 'example', id: 'dedupe-remove' },
        { type: 'p', text: '「原地」的意思是結果放在陣列前段，長度另外回傳；後段的元素沒有被清掉。範例最後一行的整個陣列是 `1 4 2 4 3 2`，只有前 3 個是答案。C++ 的 `std::unique` 與 `std::remove` 做的正是這件事，回傳新結尾的迭代器，後段的值未指定，所以要接著 `a.erase(新結尾, a.end())` 真正縮短（erase–remove 慣用法）。Python 常寫 `a[:] = [x for x in a if x != val]`，簡潔但會建立新串列，額外空間 O(n)；Java 的 `ArrayList` 有 `removeIf`。' },
        { type: 'p', text: '合併兩個排好的陣列也是雙指標：i 指向 A、j 指向 B，每次比較 `A[i]` 與 `B[j]`，把較小的放進結果並移動那個指標；其中一個用完後，把另一個剩下的部分整段接上。每個元素只被放一次，時間 O(n + m)。相等時先拿 A 的（`A[i] <= B[j]`）可以讓合併保持穩定（stable）。這正是 A06 Merge Sort 合併步驟的核心；C++ 的 `std::merge`、Python 的 `heapq.merge` 也提供同樣的功能。' },
        { type: 'callout', tone: 'warning', title: '邊走邊刪的陷阱', text: '在 Python 用 `for x in a: if x == val: a.remove(x)` 會跳過元素：刪掉一個後，後面的元素往前移一格，下一輪卻從下一個索引繼續，`[3, 3, 1]` 刪 3 會剩下 `[3, 1]`。改用索引一個一個 `del` 或 `erase` 雖然正確，但每次刪除都要搬移後面的元素，最壞 O(n²)。快慢指標一次掃描就完成，O(n)。' },
      ],
    },
    {
      id: 'when-not', title: '什麼時候不能用：和暴力法、雜湊集合、二分搜尋的比較',
      blocks: [
        { type: 'p', text: '左右指標的正確性完全依賴「有序」：只有排好序，才能說 `a[right]` 是範圍內最大、`a[left]` 是最小。在沒排序的 `[8, 3, 11, 5]` 直接找和為 13：8 + 5 = 13 恰好找到；但找和為 8 時，8 + 5 = 13 太大，right 左移，8 + 11 = 19 仍太大，right 再左移，8 + 3 = 11 太大，結束，漏掉了 3 + 5。資料沒排好就先排序；需要原索引就排序 (值, 索引)。' },
        { type: 'table', head: ['方法', '時間', '額外空間', '適合', '不適合'], rows: [
          ['暴力法（雙重迴圈）', 'O(n²)', 'O(1)', 'n 很小；條件很複雜；要列出所有配對', 'n = 10^5 時約 5×10^9 次'],
          ['雜湊集合（D08／D10）', '平均 O(n)', 'O(n)', '沒排序、只問和「等於」T 是否存在，或用計數表數個數', '「≤ K」「最接近 T」這類大小關係的條件'],
          ['排序 + 二分搜尋（A04）', 'O(n log n)', '依排序而定', '對每個 a[i] 找 T − a[i]，或數 ≤ K − a[i] 的個數', '比雙指標多一個 log n'],
          ['排序 + 左右指標', 'O(n log n)，已排好時 O(n)', 'O(1)（不含排序）', '等於、≤ K、最接近 T；記憶體有限', '要原索引時要多存索引；條件沒有單調性時不能用'],
        ] },
        { type: 'p', text: '怎麼選：資料已經排好，左右指標最省記憶體也最快。沒排好、只問「等於」，雜湊集合平均 O(n) 而且不會打亂索引，但要 O(n) 的額外記憶體，而且只能回答相等，不能回答「≤ K」或「最接近 T」。要「列出所有配對」時，輸出本身就可能有 O(n²) 對（例如全部相等），任何方法都至少是輸出的大小。' },
        { type: 'p', text: '能不能用雙指標，問自己：「移動某一邊時，被丟掉的元素是不是真的不可能是答案？」這需要一種單調性：left 右移和會變大、right 左移和會變小。值有正有負沒關係（排序後仍然成立），但像「兩數的乘積等於 T」在有負數時就不單調，直接套用會出錯。下一課 A09 Sliding Window 是同一個想法的延伸：兩個指標都往右走，夾出一段連續區間。' },
      ],
    },
    {
      id: 'pitfalls', title: '常見錯誤、邊界與三種語言的差異',
      blocks: [
        { type: 'callout', tone: 'warning', title: '`while left <= right` 讓同一個元素用兩次', text: '題目要「兩個不同位置」時，條件必須是 `left < right`。寫成 `<=` 時，`left == right` 那一輪會檢查 `a[i] + a[i]`：在 `[1, 3, 4, 9]` 找和為 8 會回報 `2 2`（4 + 4），但正確答案是不存在。數「和 ≤ K 的個數」時，若把 `right − left` 寫成 `right − left + 1`，也會把元素和自己的配對算進去。' },
        { type: 'callout', tone: 'warning', title: '`a[left] + a[right]` 在 C++／Java 的 `int` 溢位', text: '`int` 的範圍是 −2147483648～2147483647（約 ±2.1×10^9）。值只到 ±10^9 時，兩數的和最多 ±2×10^9，剛好還放得下；但值到 ±2×10^9 時（本身仍是合法的 `int`），和可能到 ±4×10^9 而溢位。Java 的 `int` 溢位會繞回（2×10^9 + 2×10^9 變成 −294967296），不丟例外；C++ 有號整數溢位是未定義行為（undefined behavior）。結果就是「和太大」被當成「和很小」，指標往錯的方向移。修正：陣列直接用 `long long`／`long`，或相加前轉型 `static_cast<long long>(a[l]) + a[r]`、`(long) a[l] + a[r]`。配對個數最多 n(n − 1)/2，n = 2×10^5 時約 2×10^10，計數器也要 64 位元。Python 的整數沒有大小上限，不會溢位。' },
        { type: 'list', items: [
          '移錯指標：和太小時應該移 left（讓和變大），寫成移 right 會讓和越來越小，最後回報找不到。',
          '忘了先排序：左右指標在沒排序的資料上不會報錯，只是默默答錯。',
          '排序後輸出索引：輸出的是排序後的位置，不是題目原本的位置；需要原索引就排序 (值, 索引)。',
          '空陣列與 n = 1：`right = n − 1` 會是 −1 或 0，`left < right` 一開始就不成立，迴圈不執行，答案是「不存在」或 0，這正是對的；但去重時 `slow = 1` 的寫法要先處理 n = 0。',
        ] },
        { type: 'p', text: '測試雙指標程式時，一定要涵蓋：n = 0 或 1、所有元素都相等、答案在最左或最右、有負數、目標比所有和都小或都大、兩數的和超過 `int`。最可靠的方法是在大量隨機的小陣列上，和暴力法比對結果。' },
        { type: 'table', head: ['項目', 'C++17', 'Python 3', 'Java 17'], rows: [
          ['兩數相加', '`int` 可能溢位，用 `long long`', '不會溢位', '`int` 會繞回，用 `long`'],
          ['排序', '`std::sort`（不穩定）', '`sorted`／`list.sort`（穩定）', '`Arrays.sort`：基本型別用 dual-pivot quicksort，物件（如 `int[][]`）用穩定的 TimSort'],
          ['(值, 索引) 一起排序', '`std::pair` 依字典順序比較', 'tuple 依字典順序比較', '`int[][]` 加比較器，或自訂類別'],
          ['原地去重／刪除', '`std::unique`、`std::remove` 後再 `erase`', '沒有原地版本，常用串列生成式（新串列）', '陣列沒有內建；`ArrayList.removeIf`'],
          ['合併兩個有序序列', '`std::merge`', '`heapq.merge`（回傳迭代器）', '沒有陣列版本，自己寫雙指標'],
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'pair-indices', title: '找和為目標的一對（輸出原索引）', description: '沒排序的 8 個數，先排序 (值, 原索引)，再用左右指標找 5 個目標；找到時輸出原索引，找不到輸出 none，並數出用了幾回合。',
      output: 'target 14 -> indices 1 2 (3 + 11), 3 steps\ntarget 10 -> indices 3 7 (5 + 5), 7 steps\ntarget 2 -> none, 7 steps\ntarget 26 -> indices 2 6 (11 + 15), 7 steps\ntarget 30 -> none, 7 steps',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <utility>
#include <vector>

int main() {
    std::vector<int> a = {8, 3, 11, 5, 1, 6, 15, 5};
    // 排序會打亂位置，所以把 (值, 原索引) 綁在一起排序
    std::vector<std::pair<int, int>> p;
    for (int i = 0; i < static_cast<int>(a.size()); ++i) p.push_back({a[i], i});
    std::sort(p.begin(), p.end());
    for (int target : {14, 10, 2, 26, 30}) {
        int left = 0, right = static_cast<int>(p.size()) - 1, steps = 0;
        bool found = false;
        while (left < right) {  // 不寫 <=：同一個元素不能用兩次
            ++steps;
            long long sum = static_cast<long long>(p[left].first) + p[right].first;
            if (sum == target) {
                found = true;
                break;
            }
            if (sum < target) ++left;  // p[left] 配上最大的仍太小：丟掉它
            else --right;              // p[right] 配上最小的仍太大：丟掉它
        }
        std::cout << "target " << target << " -> ";
        if (found) {
            int i = std::min(p[left].second, p[right].second), j = std::max(p[left].second, p[right].second);
            std::cout << "indices " << i << " " << j << " (" << a[i] << " + " << a[j] << ")";
        } else {
            std::cout << "none";
        }
        std::cout << ", " << steps << " steps\n";
    }
    return 0;
}`,
        Python: code`a = [8, 3, 11, 5, 1, 6, 15, 5]
# 排序會打亂位置，所以把 (值, 原索引) 綁在一起排序
p = sorted((v, i) for i, v in enumerate(a))
for target in [14, 10, 2, 26, 30]:
    left, right, steps = 0, len(p) - 1, 0
    found = False
    while left < right:  # 不寫 <=：同一個元素不能用兩次
        steps += 1
        s = p[left][0] + p[right][0]
        if s == target:
            found = True
            break
        if s < target:
            left += 1  # p[left] 配上最大的仍太小：丟掉它
        else:
            right -= 1  # p[right] 配上最小的仍太大：丟掉它
    if found:
        i, j = sorted((p[left][1], p[right][1]))
        print(f"target {target} -> indices {i} {j} ({a[i]} + {a[j]}), {steps} steps")
    else:
        print(f"target {target} -> none, {steps} steps")`,
        Java: code`import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] a = {8, 3, 11, 5, 1, 6, 15, 5};
        // 排序會打亂位置，所以把 {值, 原索引} 綁在一起排序（值相同時依索引）
        int[][] p = new int[a.length][];
        for (int i = 0; i < a.length; i++) p[i] = new int[] {a[i], i};
        Arrays.sort(p, (x, y) -> x[0] != y[0] ? Integer.compare(x[0], y[0]) : Integer.compare(x[1], y[1]));
        for (int target : new int[] {14, 10, 2, 26, 30}) {
            int left = 0, right = p.length - 1, steps = 0;
            boolean found = false;
            while (left < right) {  // 不寫 <=：同一個元素不能用兩次
                steps++;
                long sum = (long) p[left][0] + p[right][0];
                if (sum == target) {
                    found = true;
                    break;
                }
                if (sum < target) left++;  // p[left] 配上最大的仍太小：丟掉它
                else right--;              // p[right] 配上最小的仍太大：丟掉它
            }
            StringBuilder line = new StringBuilder("target " + target + " -> ");
            if (found) {
                int i = Math.min(p[left][1], p[right][1]), j = Math.max(p[left][1], p[right][1]);
                line.append("indices " + i + " " + j + " (" + a[i] + " + " + a[j] + ")");
            } else {
                line.append("none");
            }
            System.out.println(line + ", " + steps + " steps");
        }
    }
}`,
      },
    },
    {
      id: 'count-pairs', title: '數配對：和 ≤ k 與和 = k', description: '排好序後用左右指標數出和 ≤ k 與和剛好 = k 的配對數（重複值成批計算），和暴力法比對，並示範需要 64 位元的計數。',
      output: 'k=4 atMost=16 equal=4 brute=same\nk=5 atMost=9 equal=6 brute=same\nk=0 atMost=2 equal=2 brute=same\n100000 zeros, k=0: atMost=4999950000 equal=4999950000',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

// a 已排好：和 <= k 的配對數。a[l] + a[r] <= k 時，a[l] 配 a[l+1..r] 都成立，一次數 r - l 個。
long long countAtMost(const std::vector<long long>& a, long long k) {
    long long count = 0;
    int l = 0, r = static_cast<int>(a.size()) - 1;
    while (l < r) {
        if (a[l] + a[r] <= k) {
            count += r - l;
            ++l;
        } else {
            --r;
        }
    }
    return count;
}

// a 已排好：和剛好 = k 的配對數，相同的值要成批計算。
long long countEqual(const std::vector<long long>& a, long long k) {
    long long count = 0;
    int l = 0, r = static_cast<int>(a.size()) - 1;
    while (l < r) {
        long long sum = a[l] + a[r];
        if (sum < k) ++l;
        else if (sum > k) --r;
        else if (a[l] == a[r]) {  // a[l..r] 全部相等：任選兩個
            long long m = r - l + 1;
            count += m * (m - 1) / 2;
            break;
        } else {
            long long cl = 1, cr = 1;
            while (l + cl < r && a[l + cl] == a[l]) ++cl;
            while (r - cr > l && a[r - cr] == a[r]) ++cr;
            count += cl * cr;  // 每個左邊的值配每個右邊的值
            l += static_cast<int>(cl);
            r -= static_cast<int>(cr);
        }
    }
    return count;
}

int main() {
    std::vector<std::vector<long long>> tests = {{4, -3, 2, 7, -1, 2, 0, 5}, {3, 2, 4, 2, 3, 2}, {2000000000, 2000000000, -2000000000}};
    std::vector<long long> ks = {4, 5, 0};
    for (std::size_t t = 0; t < tests.size(); ++t) {
        std::vector<long long> a = tests[t];
        std::sort(a.begin(), a.end());
        long long k = ks[t], bruteAtMost = 0, bruteEqual = 0;
        for (std::size_t i = 0; i < a.size(); ++i)
            for (std::size_t j = i + 1; j < a.size(); ++j) {
                bruteAtMost += a[i] + a[j] <= k;
                bruteEqual += a[i] + a[j] == k;
            }
        long long atMost = countAtMost(a, k), equal = countEqual(a, k);
        std::cout << "k=" << k << " atMost=" << atMost << " equal=" << equal
                  << " brute=" << (atMost == bruteAtMost && equal == bruteEqual ? "same" : "DIFFERENT") << "\n";
    }
    std::vector<long long> zeros(100000, 0);  // 全部是 0：每一對都成立
    std::cout << "100000 zeros, k=0: atMost=" << countAtMost(zeros, 0) << " equal=" << countEqual(zeros, 0) << "\n";
    return 0;
}`,
        Python: code`def count_at_most(a, k):
    """a 已排好：和 <= k 的配對數。a[l] + a[r] <= k 時，a[l] 配 a[l+1..r] 都成立，一次數 r - l 個。"""
    count, l, r = 0, 0, len(a) - 1
    while l < r:
        if a[l] + a[r] <= k:
            count += r - l
            l += 1
        else:
            r -= 1
    return count


def count_equal(a, k):
    """a 已排好：和剛好 = k 的配對數，相同的值要成批計算。"""
    count, l, r = 0, 0, len(a) - 1
    while l < r:
        s = a[l] + a[r]
        if s < k:
            l += 1
        elif s > k:
            r -= 1
        elif a[l] == a[r]:  # a[l..r] 全部相等：任選兩個
            m = r - l + 1
            count += m * (m - 1) // 2
            break
        else:
            cl = cr = 1
            while l + cl < r and a[l + cl] == a[l]:
                cl += 1
            while r - cr > l and a[r - cr] == a[r]:
                cr += 1
            count += cl * cr  # 每個左邊的值配每個右邊的值
            l += cl
            r -= cr
    return count


tests = [([4, -3, 2, 7, -1, 2, 0, 5], 4), ([3, 2, 4, 2, 3, 2], 5), ([2 * 10**9, 2 * 10**9, -2 * 10**9], 0)]
for values, k in tests:
    a = sorted(values)
    pairs = [a[i] + a[j] for i in range(len(a)) for j in range(i + 1, len(a))]
    at_most, equal = count_at_most(a, k), count_equal(a, k)
    same = at_most == sum(s <= k for s in pairs) and equal == pairs.count(k)
    print(f"k={k} atMost={at_most} equal={equal} brute={'same' if same else 'DIFFERENT'}")
zeros = [0] * 100000  # 全部是 0：每一對都成立
print(f"100000 zeros, k=0: atMost={count_at_most(zeros, 0)} equal={count_equal(zeros, 0)}")`,
        Java: code`import java.util.Arrays;

public class Main {
    // a 已排好：和 <= k 的配對數。a[l] + a[r] <= k 時，a[l] 配 a[l+1..r] 都成立，一次數 r - l 個。
    static long countAtMost(long[] a, long k) {
        long count = 0;
        int l = 0, r = a.length - 1;
        while (l < r) {
            if (a[l] + a[r] <= k) {
                count += r - l;
                l++;
            } else {
                r--;
            }
        }
        return count;
    }

    // a 已排好：和剛好 = k 的配對數，相同的值要成批計算。
    static long countEqual(long[] a, long k) {
        long count = 0;
        int l = 0, r = a.length - 1;
        while (l < r) {
            long sum = a[l] + a[r];
            if (sum < k) l++;
            else if (sum > k) r--;
            else if (a[l] == a[r]) {  // a[l..r] 全部相等：任選兩個
                long m = r - l + 1;
                count += m * (m - 1) / 2;
                break;
            } else {
                int cl = 1, cr = 1;
                while (l + cl < r && a[l + cl] == a[l]) cl++;
                while (r - cr > l && a[r - cr] == a[r]) cr++;
                count += (long) cl * cr;  // 每個左邊的值配每個右邊的值
                l += cl;
                r -= cr;
            }
        }
        return count;
    }

    public static void main(String[] args) {
        long[][] tests = {{4, -3, 2, 7, -1, 2, 0, 5}, {3, 2, 4, 2, 3, 2}, {2000000000L, 2000000000L, -2000000000L}};
        long[] ks = {4, 5, 0};
        for (int t = 0; t < tests.length; t++) {
            long[] a = tests[t].clone();
            Arrays.sort(a);
            long k = ks[t], bruteAtMost = 0, bruteEqual = 0;
            for (int i = 0; i < a.length; i++)
                for (int j = i + 1; j < a.length; j++) {
                    if (a[i] + a[j] <= k) bruteAtMost++;
                    if (a[i] + a[j] == k) bruteEqual++;
                }
            long atMost = countAtMost(a, k), equal = countEqual(a, k);
            System.out.println("k=" + k + " atMost=" + atMost + " equal=" + equal
                + " brute=" + (atMost == bruteAtMost && equal == bruteEqual ? "same" : "DIFFERENT"));
        }
        long[] zeros = new long[100000];  // 全部是 0：每一對都成立
        System.out.println("100000 zeros, k=0: atMost=" + countAtMost(zeros, 0) + " equal=" + countEqual(zeros, 0));
    }
}`,
      },
    },
    {
      id: 'dedupe-remove', title: '快慢指標：原地去重與刪除', description: '在排好的陣列原地去重，以及在沒排序的陣列原地刪除所有 3，印出新長度與結果；最後一行顯示陣列後段沒有被清掉。',
      output: 'dedupe: length 5 [1 2 3 5 8]\ndedupe: length 1 [7]\ndedupe: length 0 []\ndedupe: length 3 [-2 0 4]\nremove 3: length 3 [1 4 2], whole array [1 4 2 4 3 2]',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// a 已排好：把不重複的值依序搬到前面，回傳新長度。slow 是下一個要寫入的位置。
int dedupe(std::vector<int>& a) {
    if (a.empty()) return 0;
    int slow = 1;
    for (int fast = 1; fast < static_cast<int>(a.size()); ++fast) {
        if (a[fast] != a[slow - 1]) {  // 和最後保留的值不同：是新的值
            a[slow] = a[fast];
            ++slow;
        }
    }
    return slow;
}

// 刪除所有等於 val 的元素（不必排序），其餘元素保持原本的順序。
int removeValue(std::vector<int>& a, int val) {
    int slow = 0;
    for (int fast = 0; fast < static_cast<int>(a.size()); ++fast) {
        if (a[fast] != val) a[slow++] = a[fast];
    }
    return slow;
}

std::string prefix(const std::vector<int>& a, int k) {
    std::string s;
    for (int i = 0; i < k; ++i) s += (i > 0 ? " " : "") + std::to_string(a[i]);
    return s;
}

int main() {
    std::vector<std::vector<int>> sorted = {{1, 1, 2, 3, 3, 3, 5, 8, 8}, {7, 7, 7}, {}, {-2, 0, 4}};
    for (auto a : sorted) {
        int k = dedupe(a);
        std::cout << "dedupe: length " << k << " [" << prefix(a, k) << "]\n";
    }
    std::vector<int> b = {3, 1, 3, 4, 3, 2};
    int k = removeValue(b, 3);
    std::cout << "remove 3: length " << k << " [" << prefix(b, k) << "], whole array [" << prefix(b, static_cast<int>(b.size())) << "]\n";
    return 0;
}`,
        Python: code`def dedupe(a):
    """a 已排好：把不重複的值依序搬到前面，回傳新長度。slow 是下一個要寫入的位置。"""
    if not a:
        return 0
    slow = 1
    for fast in range(1, len(a)):
        if a[fast] != a[slow - 1]:  # 和最後保留的值不同：是新的值
            a[slow] = a[fast]
            slow += 1
    return slow


def remove_value(a, val):
    """刪除所有等於 val 的元素（不必排序），其餘元素保持原本的順序。"""
    slow = 0
    for fast in range(len(a)):
        if a[fast] != val:
            a[slow] = a[fast]
            slow += 1
    return slow


def show(a, k):
    return " ".join(map(str, a[:k]))


for a in [[1, 1, 2, 3, 3, 3, 5, 8, 8], [7, 7, 7], [], [-2, 0, 4]]:
    k = dedupe(a)
    print(f"dedupe: length {k} [{show(a, k)}]")
b = [3, 1, 3, 4, 3, 2]
k = remove_value(b, 3)
print(f"remove 3: length {k} [{show(b, k)}], whole array [{show(b, len(b))}]")`,
        Java: code`public class Main {
    // a 已排好：把不重複的值依序搬到前面，回傳新長度。slow 是下一個要寫入的位置。
    static int dedupe(int[] a) {
        if (a.length == 0) return 0;
        int slow = 1;
        for (int fast = 1; fast < a.length; fast++) {
            if (a[fast] != a[slow - 1]) {  // 和最後保留的值不同：是新的值
                a[slow] = a[fast];
                slow++;
            }
        }
        return slow;
    }

    // 刪除所有等於 val 的元素（不必排序），其餘元素保持原本的順序。
    static int removeValue(int[] a, int val) {
        int slow = 0;
        for (int fast = 0; fast < a.length; fast++) {
            if (a[fast] != val) a[slow++] = a[fast];
        }
        return slow;
    }

    static String prefix(int[] a, int k) {
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < k; i++) s.append(i > 0 ? " " : "").append(a[i]);
        return s.toString();
    }

    public static void main(String[] args) {
        int[][] sorted = {{1, 1, 2, 3, 3, 3, 5, 8, 8}, {7, 7, 7}, {}, {-2, 0, 4}};
        for (int[] a : sorted) {
            int k = dedupe(a);
            System.out.println("dedupe: length " + k + " [" + prefix(a, k) + "]");
        }
        int[] b = {3, 1, 3, 4, 3, 2};
        int k = removeValue(b, 3);
        System.out.println("remove 3: length " + k + " [" + prefix(b, k) + "], whole array [" + prefix(b, b.length) + "]");
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '左右指標：在有序陣列找和為 10 的一對', language: 'Python',
    code: code`a = [1, 3, 4, 6, 8, 11, 15]
target = 10
left, right = 0, len(a) - 1
while left < right:
    s = a[left] + a[right]
    if s == target:
        break
    if s < target:
        left += 1
    else:
        right -= 1
print(f"{left} {right}" if left < right else -1)`,
    steps: traceSteps,
    tryIt: { algorithm: 'two-sum', initial: TRACE_A, target: TRACE_T },
  },
  quiz: [
    {
      id: 'q-moves', prompt: '下面的程式依序印出哪些 (left, right)？',
      code: { language: 'Python', text: code`a = [2, 5, 7, 9, 12, 14]
left, right = 0, len(a) - 1
while left < right:
    print(left, right)
    s = a[left] + a[right]
    if s == 17:
        break
    if s < 17:
        left += 1
    else:
        right -= 1` },
      options: ['(0, 5) → (1, 4)', '(0, 5) → (0, 4) → (0, 3) → (0, 2) → (0, 1)', '(0, 5) → (1, 5) → (1, 4)', '(0, 5) → (1, 5) → (1, 4) → (2, 4)'],
      answer: 2, explanation: '2 + 14 = 16 < 17，和太小，left 右移；5 + 14 = 19 > 17，和太大，right 左移；5 + 12 = 17，break。所以印出 (0, 5)、(1, 5)、(1, 4)。「(0, 5) → (1, 4)」是一次移動兩個指標，這裡碰巧找到，但程式並不是這樣寫的，而且一般情況會跳過答案；「(0, 5) → (0, 4) → …」是和太小時移了 right，和只會越來越小，最後找不到；最後一個選項忽略了找到時的 break。',
    },
    {
      id: 'q-why', prompt: '在由小到大排好的陣列找和為 T 的兩個數。某一回合 `a[left] + a[right] < T`，程式執行 `left += 1`。為什麼這樣不會錯過答案？',
      options: [
        '因為 `a[left]` 是整個陣列最小的數，它和任何數相加都比 T 小',
        '因為 `a[right]` 是範圍 `a[left..right]` 裡最大的數；`a[left]` 配它都不夠，配範圍內其他數只會更小，所以 `a[left]` 不可能在答案裡',
        '因為 left 右移會讓和變大，繼續移下去一定會剛好等於 T',
        '因為 `a[right]` 已經比較過了，之後不會再用到它',
      ],
      answer: 1, explanation: '能丟掉 `a[left]`，是因為它和範圍內「最大的」數相加都還不夠：範圍外右邊的數之前已經被證明不可能是答案，範圍內的數都 ≤ `a[right]`。第一個選項的理由錯了：`a[left]` 不一定是整個陣列最小的（前面的已被丟掉），而且最小不代表配誰都不夠；第三個選項錯在「一定會等於 T」，答案可能根本不存在；第四個選項說反了，這一回合丟掉的是 `a[left]`，`a[right]` 還留在範圍裡。',
    },
    {
      id: 'q-complexity', prompt: '給 n 個沒有排序的整數，用「先排序，再用左右指標」判斷有沒有兩個數和為 T。整體的時間複雜度是多少？如果資料一開始就已經排好呢？',
      options: ['O(n log n)；已排好時 O(n)', 'O(n)；已排好時 O(n)', 'O(n²)；已排好時 O(n)', 'O(n log n)；已排好時 O(log n)'],
      answer: 0, explanation: '比較式排序是 O(n log n)，之後左右指標每一步讓 `right − left` 減 1，最多 n − 1 步，是 O(n)，合起來由排序主導：O(n log n)。已排好就省掉排序，只剩 O(n)。「O(n)；O(n)」忽略了排序的成本；「O(n²)」是暴力法；「O(log n)」把雙指標和二分搜尋混淆了，雙指標最壞要看過幾乎每個元素。',
    },
    {
      id: 'q-dedupe', prompt: '下面的快慢指標程式輸出什麼？',
      code: { language: 'Python', text: code`a = [0, 0, 1, 1, 1, 2, 3, 3]
slow = 1
for fast in range(1, len(a)):
    if a[fast] != a[slow - 1]:
        a[slow] = a[fast]
        slow += 1
print(slow, a)` },
      options: ['4 [0, 1, 2, 3]', '4 [0, 1, 2, 3, 0, 0, 0, 0]', '3 [0, 1, 2, 3, 1, 2, 3, 3]', '4 [0, 1, 2, 3, 1, 2, 3, 3]'],
      answer: 3, explanation: '不重複的值有 0、1、2、3，依序寫到 `a[0..3]`，slow 最後是 4。程式只覆寫前段，後段 `a[4..7]` 保留原本的 `1, 2, 3, 3`，所以印出整個串列是 `[0, 1, 2, 3, 1, 2, 3, 3]`。「4 [0, 1, 2, 3]」以為原地去重會縮短串列；補 0 的選項以為後段會被清空；「3」少算了第一個元素（slow 從 1 開始，因為 a[0] 一定保留）。',
    },
    {
      id: 'q-bug', prompt: '下面的程式想在 `[1, 3, 4, 9]` 中找兩個「不同位置」的數，和為 8。它印出什麼？',
      code: { language: 'Python', text: code`a = [1, 3, 4, 9]
left, right = 0, len(a) - 1
answer = "none"
while left <= right:
    s = a[left] + a[right]
    if s == 8:
        answer = f"{left} {right}"
        break
    if s < 8:
        left += 1
    else:
        right -= 1
print(answer)` },
      options: ['2 2', 'none', '1 2', '迴圈停不下來'],
      answer: 0, explanation: '1 + 9 = 10 太大，right = 2；1 + 4 = 5 太小，left = 1；3 + 4 = 7 太小，left = 2；此時 `left == right == 2`，因為條件寫成 `<=`，迴圈繼續，4 + 4 = 8，印出 `2 2`：同一個元素用了兩次。正確答案應該是 none，把條件改成 `left < right` 即可。「1 2」是 3 + 4 = 7，不是 8；迴圈每一輪都移動一個指標或 break，不會停不下來。',
    },
    {
      id: 'q-choose', prompt: 'n = 2×10^5 個沒有排序的整數（可能有負數），要數出有幾對 `i < j` 滿足 `a[i] + a[j] <= K`。哪一個做法正確而且夠快？',
      options: [
        '對每個 a[i] 用雜湊集合查 K − a[i] 在不在，平均 O(n)',
        '先排序，再用左右指標：和 ≤ K 時一次加上 right − left 並移動 left，否則移動 right；O(n log n)',
        '不排序，直接從兩端用左右指標，O(n)',
        '雙重迴圈檢查每一對，O(n²)',
      ],
      answer: 1, explanation: '排序後，`a[left] + a[right] <= K` 代表 `a[left]` 配 `a[left+1..right]` 都成立，一次數完；否則 `a[right]` 配誰都太大。排序 O(n log n) 加掃描 O(n)。雜湊集合只能回答「剛好等於」，不能回答「≤ K」；沒排序時左右指標的推理（right 是最大的）不成立；雙重迴圈正確，但要約 2×10^10 次運算，太慢。（排序後對每個 a[i] 用二分搜尋數 ≤ K − a[i] 的個數也正確，是 O(n log n)。）',
    },
  ],
  exercises: [
    {
      id: 'e-count-at-most', title: '和不超過 K 的配對數',
      statement: '給 n 個整數 a[0]～a[n−1]（沒有排序，可能重複、可能是負數）與整數 K，數出有幾對索引 `i < j` 滿足 `a[i] + a[j] <= K`。n 可能到 2×10^5：檢查每一對的 O(n²) 做法約要 2×10^10 次運算，太慢。請先排序，再用左右指標，做到 O(n log n)。注意每個值都放得進 32 位元整數，但兩數的和與答案都可能超過它。輸入不合法時只輸出一行 `Invalid`（見輸出格式）。',
      inputFormat: '第一行兩個整數 n 與 K。第二行 n 個整數 a[0]～a[n−1]。數字之間以空白或換行分隔（換行與空白視為相同）。',
      outputFormat: '一個整數：滿足條件的配對數。以下情況只輸出一行 `Invalid`：完全沒有輸入；出現不是整數的資料（整數是可選的負號加上 1～10 位數字，`2.5`、`abc`、`+1` 都不是）；n 不在 1～2×10^5；K 不在 −4×10^9～4×10^9；某個 a[i] 不在 −2×10^9～2×10^9；數字的個數不等於 n + 2（少給或多給）。',
      constraints: ['1 ≤ n ≤ 2×10^5', '−2×10^9 ≤ a[i] ≤ 2×10^9，−4×10^9 ≤ K ≤ 4×10^9：a[i] 放得進 32 位元 `int`，但兩數的和放不下', '答案最多 n(n − 1)/2 ≈ 2×10^10：C++ 用 `long long`、Java 用 `long`'],
      samples: [{ kind: 'normal', input: '6 7\n4 -3 2 7 -1 5', output: '11', note: '排序後是 -3 -1 2 4 5 7；和 ≤ 7 的配對共 11 對，例如 (-3, 7)、(2, 5)，但 (4, 5) = 9 不算' }],
      tests: [
        { kind: 'normal', input: '6 7\n4 -3 2 7 -1 5', output: '11', note: '範例' },
        { kind: 'normal', input: '7 10\n5 5 5 1 9 2 8', output: '13', note: '有重複值，而且 5 + 5 剛好等於 K（≤ 包含等於）' },
        { kind: 'normal', input: '6 -5\n-4 3 -2 -1 0 -6', output: '6', note: 'K 是負數' },
        { kind: 'normal', input: '4 10\n5 5 2 8', output: '4', note: '和剛好等於 K 的配對有兩種：5 + 5 與 2 + 8' },
        { kind: 'normal', input: medInput, output: String(bruteCount(medValues, -7)), note: 'n = 1000，−100～100 的值大量重複（由 TS 產生，答案以 O(n²) 暴力法計算）' },
        { kind: 'edge', input: '1 100\n5', output: '0', note: 'n = 1：沒有任何一對' },
        { kind: 'edge', input: '2 2\n1 5', output: '0', note: '1 + 1 = 2 ≤ K，但同一個元素不能和自己配對' },
        { kind: 'edge', input: '5 6\n3 3 3 3 3', output: '10', note: '全部相等而且都成立：5 × 4 / 2 = 10' },
        { kind: 'edge', input: '5 5\n3 3 3 3 3', output: '0', note: '全部相等而且都不成立' },
        { kind: 'edge', input: '4 -4000000000\n5 6 7 8', output: '0', note: 'K 是最小值，沒有任何配對成立；K 本身就放不進 `int`' },
        { kind: 'edge', input: '4 4000000000\n2000000000 -2000000000 2000000000 0', output: '6', note: 'K 是最大值，每一對都成立，包含 2×10^9 + 2×10^9 = 4×10^9' },
        { kind: 'edge', input: '3 0\n2000000000 2000000000 2000000000', output: '0', note: '2×10^9 + 2×10^9 用 32 位元 `int` 相加會溢位成 −294967296，被誤判為 ≤ 0' },
        { kind: 'edge', input: '3 -4000000000\n-2000000000 -2000000000 -2000000000', output: '3', note: '和剛好是 −4×10^9 = K' },
        { kind: 'edge', input: onesInput, output: String((BIG_N * (BIG_N - 1)) / 2), note: 'n = 2×10^5 個 1、K = 2：每一對都成立，答案 n(n − 1)/2 = 19999900000 超過 32 位元；O(n²) 的做法會超時' },
        { kind: 'edge', input: mixedInput, output: String(formulaCount(mixedValues, 37)), note: 'n = 2×10^5，−1000～1000 的值沒有排序而且大量重複（答案以「每個值的個數 × 累計個數」的公式計算，與雙指標無關）' },
        { kind: 'edge', input: altInput, output: String(formulaCount(altValues, 0)), note: 'n = 5×10^4 個 ±2×10^9 交錯、K = 0：用 `int` 相加會把 2×10^9 + 2×10^9 溢位成負數而多算' },
        { kind: 'error', input: '', output: 'Invalid', note: '完全沒有輸入' },
        { kind: 'error', input: '3 5\n1 2', output: 'Invalid', note: 'n = 3，只給了 2 個值' },
        { kind: 'error', input: '2 5\n1 2 3', output: 'Invalid', note: 'n = 2，卻給了 3 個值' },
        { kind: 'error', input: '3 5\n1 2.5 3', output: 'Invalid', note: '`2.5` 不是整數' },
        { kind: 'error', input: '3 5\n1 abc 3', output: 'Invalid', note: '`abc` 不是整數' },
        { kind: 'error', input: '2 5\n+1 3', output: 'Invalid', note: '`+1` 不符合格式：Python 的 `int()` 與 Java 的 `Long.parseLong` 都接受它，所以要自己檢查' },
        { kind: 'error', input: '0 5\n', output: 'Invalid', note: 'n = 0 不在 1～2×10^5' },
        { kind: 'error', input: '2 5\n2000000001 0', output: 'Invalid', note: '值超出 −2×10^9～2×10^9' },
        { kind: 'error', input: '2 5000000000\n1 2', output: 'Invalid', note: 'K 超出 −4×10^9～4×10^9（仍是 10 位數的合法整數記號）' },
      ],
      hints: [
        '先排序。若 `a[left] + a[right] <= K`，`a[left]` 配上 `a[left + 1]`～`a[right]` 都成立，一次加上 `right − left`，然後 left 右移。',
        '否則 `a[right]` 配上最小的 `a[left]` 都太大，它配誰都不成立，right 左移。迴圈條件是 `left < right`。',
        '和用 64 位元計算（C++ `long long`、Java `long`），計數器也用 64 位元；Python 不需要。',
        '先把所有記號讀進來，逐一檢查是不是整數，再檢查 n、K 的範圍與個數是否剛好 n + 2。',
        '自己寫好後，用隨機的小陣列和 O(n²) 暴力法比對，特別是全部相等、有負數、n = 1 的情況。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

// 可選的負號加上 1～10 位數字
bool parseInt(const std::string& s, long long& value) {
    std::size_t start = s[0] == '-' ? 1 : 0;
    if (start == s.size() || s.size() - start > 10) return false;
    for (std::size_t i = start; i < s.size(); ++i) {
        if (s[i] < '0' || s[i] > '9') return false;
    }
    value = std::stoll(s);
    return true;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<long long> t;
    std::string token;
    while (std::cin >> token) {
        long long v;
        if (!parseInt(token, v)) {
            std::cout << "Invalid\n";
            return 0;
        }
        t.push_back(v);
    }
    const long long LIMIT = 2000000000LL;
    long long total = static_cast<long long>(t.size());
    if (total < 2 || t[0] < 1 || t[0] > 200000 || t[1] < -2 * LIMIT || t[1] > 2 * LIMIT || total != t[0] + 2) {
        std::cout << "Invalid\n";
        return 0;
    }
    long long k = t[1];
    std::vector<long long> a(t.begin() + 2, t.end());
    for (long long x : a) {
        if (x < -LIMIT || x > LIMIT) {
            std::cout << "Invalid\n";
            return 0;
        }
    }
    std::sort(a.begin(), a.end());
    long long count = 0;  // 最多 n(n-1)/2，約 2×10^10，超過 int
    int l = 0, r = static_cast<int>(a.size()) - 1;
    while (l < r) {
        if (a[l] + a[r] <= k) {  // long long：兩個 2×10^9 相加不會溢位
            count += r - l;      // a[l] 配 a[l+1..r] 都成立
            ++l;
        } else {
            --r;                 // a[r] 配最小的 a[l] 都太大
        }
    }
    std::cout << count << "\n";
    return 0;
}`,
        Python: code`import re
import sys

INTEGER = re.compile(r"-?[0-9]{1,10}")
LIMIT = 2 * 10**9


def solve(tokens):
    if len(tokens) < 2 or not all(INTEGER.fullmatch(t) for t in tokens):
        return None
    n, k = int(tokens[0]), int(tokens[1])
    if not 1 <= n <= 200000 or abs(k) > 2 * LIMIT or len(tokens) != n + 2:
        return None
    a = sorted(map(int, tokens[2:]))
    if a[0] < -LIMIT or a[-1] > LIMIT:
        return None
    count, l, r = 0, 0, n - 1
    while l < r:
        if a[l] + a[r] <= k:
            count += r - l  # a[l] 配 a[l+1..r] 都成立
            l += 1
        else:
            r -= 1  # a[r] 配最小的 a[l] 都太大
    return count


result = solve(sys.stdin.read().split())
print("Invalid" if result is None else result)`,
        Java: code`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.StringTokenizer;
import java.util.regex.Pattern;

public class Main {
    // 可選的負號加上 1～10 位數字
    static final Pattern INTEGER = Pattern.compile("-?[0-9]{1,10}");
    static final long LIMIT = 2_000_000_000L;

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        List<Long> t = new ArrayList<>();
        String line;
        while ((line = br.readLine()) != null) {
            StringTokenizer st = new StringTokenizer(line);
            while (st.hasMoreTokens()) {
                String s = st.nextToken();
                if (!INTEGER.matcher(s).matches()) {
                    System.out.println("Invalid");
                    return;
                }
                t.add(Long.parseLong(s));
            }
        }
        if (t.size() < 2 || t.get(0) < 1 || t.get(0) > 200000 || Math.abs(t.get(1)) > 2 * LIMIT || t.size() != t.get(0) + 2) {
            System.out.println("Invalid");
            return;
        }
        int n = (int) (long) t.get(0);
        long k = t.get(1);
        long[] a = new long[n];  // long：兩個 2×10^9 相加不會溢位
        for (int i = 0; i < n; i++) {
            a[i] = t.get(i + 2);
            if (a[i] < -LIMIT || a[i] > LIMIT) {
                System.out.println("Invalid");
                return;
            }
        }
        Arrays.sort(a);
        long count = 0;  // 最多 n(n-1)/2，約 2×10^10，超過 int
        int l = 0, r = n - 1;
        while (l < r) {
            if (a[l] + a[r] <= k) {
                count += r - l;  // a[l] 配 a[l+1..r] 都成立
                l++;
            } else {
                r--;             // a[r] 配最小的 a[l] 都太大
            }
        }
        System.out.println(count);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

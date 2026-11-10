import type { LessonContent, TraceStep } from '../schema';
import { linearSearchSteps } from '../simulate-algorithms';

const code = String.raw;

/* ---- visualization: find every position of 7, steps from the shared simulator ('all' mode) ---------------------- */
const traceA = [4, 7, 2, 7, 9, 7];
const traceTarget = 7;
const raw = linearSearchSteps(traceA, traceTarget, 'all', { compare: 4, result: 10 });
const hits = traceA.flatMap((v, i) => v === traceTarget ? [i] : []);
const lastStep = raw[raw.length - 1];
const traceSteps: TraceStep[] = [
  { line: 2, note: '第 9 行呼叫 `find_all(a, 7)`，進入函式後先建立空的 `positions`，用來記下每一個找到的索引。還沒有比較任何格子。',
    arrays: [{ name: 'a', cells: traceA.map(String), marks: [] }], vars: { 比較次數: '0', 找到: '（還沒有）' } },
  ...raw.slice(0, -1).map((s): TraceStep => {
    const i = s.arrays![0].pointers!.i!;
    const hit = traceA[i] === traceTarget;
    const extra = !hit ? '條件不成立，什麼都不做，直接看下一格。'
      : i === hits[0] ? '條件成立，執行第 5 行把 ' + i + ' 加入 `positions`。如果只要「第一個」，`find_first` 會在這裡就回傳 ' + i + '，只比較 ' + (i + 1) + ' 次；要找「全部」就不能提早結束，繼續往後看。'
      : i === traceA.length - 1 ? '條件成立，第 5 行把 ' + i + ' 加入 `positions`。這是最後一格，迴圈接著結束。'
      : '條件成立，第 5 行把 ' + i + ' 加入 `positions`。前面已經找到過，但後面還可能有，所以繼續。';
    return { ...s, line: hit ? 5 : 4, note: s.note + extra };
  }),
  { line: 6, note: '`for` 迴圈看完了全部 ' + traceA.length + ' 格：找全部時一定要比較 n 次，不論找到幾個。回傳 `positions` = [' + hits.join(', ') + ']。',
    arrays: lastStep.arrays, vars: { positions: '[' + hits.join(', ') + ']', 比較次數: String(traceA.length) } },
  { ...lastStep, note: lastStep.note + '`positions` 不是空的，所以印出以空白分隔的索引；若是空 list，條件運算式會改印 `-1`。找不到的約定由呼叫的人決定怎麼輸出，函式本身只負責回傳結果。' },
];

/* ---- exercise: a worst-case-sized test (n = q = 1000), its answers from a TS brute force (indexOf / lastIndexOf) --- */
const bigA = Array.from({ length: 1000 }, (_, i) => (i * 37) % 101 - 50);
const bigQ = Array.from({ length: 1000 }, (_, j) => (j % 120) - 60);
const bigInput = '1000\n' + bigA.join(' ') + '\n1000\n' + bigQ.join(' ') + '\n';
const bigOutput = bigQ.map(x => bigA.indexOf(x) + ' ' + bigA.lastIndexOf(x)).join('\n');

/**
 * A03 Linear Search. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also
 * offers JavaScript (Node.js); the libraries table gains JavaScript rows (indexOf, findIndex, includes).
 */
export const A03: LessonContent = {
  lessonId: 'A03',
  motivation: '「名單裡有沒有這個學號？」「第一筆超過門檻的成績在哪裡？」「最高分是誰，出現在第幾個？」只要資料沒有排序、也沒有事先整理，最直接可靠的方法就是從頭到尾一格一格檢查，這就是線性搜尋（linear search，也叫循序搜尋 sequential search）。它不需要任何前置工作，對陣列、字串、鏈結串列都適用，也是 `in`、`std::find`、`indexOf` 這些函式庫函式背後的做法。它的限制同樣明確：最差要看完全部 n 個元素，若同一份資料要被查詢很多次，每次都從頭掃描就太慢了，這時應該先排序再用二分搜尋（A04），或把資料放進雜湊集合（D08）。這一課學會把線性搜尋寫對（尤其是找不到的情況）、找第一個／最後一個／全部，並判斷它什麼時候「已經足夠」。',
  sections: [
    {
      id: 'idea', title: '演算法與「找不到」的約定',
      blocks: [
        { type: 'p', text: '線性搜尋的想法只有一句話：從索引 0 開始，依序把每個元素和目標（target）比較，相等就回答「在這裡」；全部比完都不相等，才能回答「找不到」。步驟如下：' },
        { type: 'list', ordered: true, items: [
          '設 i = 0。',
          '若 i 已經等於 n（看完了），跳到第 5 步。',
          '比較 `a[i]` 與 target：相等就回傳 i，結束。',
          '不相等就 i 加 1，回到第 2 步。',
          '迴圈結束後回傳「找不到」的代表值。',
        ] },
        { type: 'p', text: '為什麼這樣一定對？每次要比較 `a[i]` 之前，都成立一個迴圈不變量（loop invariant）：「`a[0]` 到 `a[i−1]` 都不等於 target」。所以第一次相等時，i 一定是第一個出現的位置；而迴圈跑完都沒有相等，代表每一格都已經被排除，這時「找不到」才是有根據的結論。換句話說，「找不到」只能在迴圈結束之後才知道，不能在迴圈裡遇到第一個不相等就下結論。' },
        { type: 'p', text: '找不到時要回傳什麼？常見的約定是回傳一個不可能是合法索引的哨兵值（sentinel value）：C++ 與 Java 慣用 −1（JavaScript 的 `indexOf` 也回傳 −1），Python 也常用 -1，或者回傳 `None`。讓函式「回傳」結果，而不是在迴圈裡直接 `print`，好處是呼叫的人可以決定怎麼用這個答案：拿去當索引、統計、再做下一步，或依題目要求印出 `-1`、`Not found`。在迴圈裡印東西還很容易犯錯：每遇到一個不相等就印一次「找不到」，或找到之後沒有停，又繼續印。' },
        { type: 'callout', tone: 'warning', title: '小心 −1 被當成索引，以及索引 0 被當成「假」', text: 'Python 的 `a[-1]` 是合法的，代表最後一個元素：如果忘了檢查 `pos == -1` 就寫 `a[pos]`，程式不會出錯，只會安靜地拿到錯的值。C++ 的 `a[-1]` 是未定義行為（undefined behavior），Java 會丟出 `ArrayIndexOutOfBoundsException`，JavaScript 的 `a[-1]` 則是 `undefined`，同樣不會報錯。另一個陷阱是寫 `if find(a, x):` 判斷有沒有找到：找到時若索引是 0，0 在 Python（和 JavaScript）是「假」，會被當成沒找到；而 −1 卻是「真」。一律明確寫 `if pos != -1:`（或回傳 `None` 時寫 `if pos is not None:`）。' },
        { type: 'p', text: '還有一種寫法叫哨兵搜尋（sentinel search）：先把 target 放到陣列尾端，迴圈就一定會停下，可以省掉每圈「i < n」的檢查。它只是常數上的小優化，複雜度一樣是 O(n)，而且要能修改陣列；本課的程式都用一般寫法。' },
      ],
    },
    {
      id: 'first-last-all', title: '第一個、最後一個與全部',
      blocks: [
        { type: 'p', text: '資料有重複時，「找到」要說清楚是哪一個。三種問法只差在迴圈方向與要不要提早結束：' },
        { type: 'table', head: ['要找', '迴圈方向', '找到後', '比較次數'], rows: [
          ['第一個位置', '由前往後（0 → n−1）', '立刻回傳（early exit）', '1 ～ n'],
          ['最後一個位置', '由後往前（n−1 → 0）', '立刻回傳', '1 ～ n'],
          ['所有位置', '由前往後', '記下來，繼續找', '一定是 n'],
        ] },
        { type: 'p', text: '找最後一個也可以「由前往後、每次相等就覆蓋答案、不提早結束」，結果一樣，但一定要比較 n 次；由後往前並在第一次相等時停下，比較次數最少。反過來，如果本來想找第一個，卻忘了 `break` 或 `return`，覆蓋到最後就變成了「最後一個」，這是很常見的錯誤。找全部時結果可能是空的，題目通常要求印 `-1` 或 `None`，要特別處理。' },
        { type: 'example', id: 'ex-first-last-all' },
        { type: 'p', text: '下方的視覺化追蹤 `find_all`：因為要找全部，每一格都會被比較，總共 n 次。「自己試試」用的是找第一個的版本（找到就停），可以輸入自己的資料，觀察目標在前面、在後面或不存在時，比較次數有什麼不同。' },
        { type: 'callout', tone: 'warning', title: '由後往前的迴圈不要用無號整數', text: 'C++ 寫 `for (std::size_t i = a.size() - 1; i >= 0; --i)` 是無窮迴圈：`std::size_t` 是無號整數（unsigned），永遠 ≥ 0，i 從 0 再減 1 會變成極大的數，接著越界讀取；而且 `a` 是空的時候，`a.size() - 1` 一開始就是極大的數。改用 `int i = static_cast<int>(a.size()) - 1;`。Python 的 `range(len(a) - 1, -1, -1)` 中間的 `-1` 是「停在 0 之後」的終點，不是索引；也可以寫 `reversed(range(len(a)))`。Java 的 `int` 有號，`for (int i = a.length - 1; i >= 0; i--)` 沒有這個問題；JavaScript 的 `for (let i = a.length - 1; i >= 0; i--)` 也一樣。' },
      ],
    },
    {
      id: 'by-condition', title: '依條件搜尋：第一個符合的元素與最大值的位置',
      blocks: [
        { type: 'p', text: '線性搜尋不只能找「等於 x」，任何「逐一檢查、看是否符合條件」的問題都是同一個骨架：把 `a[i] == target` 換成任意條件，例如「第一個大於 7 的數」「第一個負數」「第一個不及格的成績」。C++ 的 `std::find_if`、Python 的 `next((i for i, v in enumerate(a) if 條件), -1)`、JavaScript 的 `a.findIndex(x => 條件)` 都是這個意思。' },
        { type: 'p', text: '找最大值（或最小值）與它的位置（argmax／argmin）也是線性搜尋的變形：不能提早結束，因為還沒看到的元素可能更大，所以一定要看完 n 個。答案的初始值要用第一個元素（`best = 0`，表示索引 0），不要用 0 或某個「夠小」的數當最大值的初值：資料全是負數時，初值 0 會讓答案變成一個根本不在陣列裡的數。' },
        { type: 'p', text: '最大值出現好幾次時，題目要說清楚要哪一個索引，程式也要對應：用 `a[i] > a[best]`（嚴格大於）更新，遇到相等不換，得到第一個最大值的位置；用 `a[i] >= a[best]` 更新，相等也換，得到最後一個。寫程式前先確定題目要的是哪一個，這是很多題目「範例過了、測資卻錯」的原因。' },
        { type: 'example', id: 'ex-by-condition' },
        { type: 'p', text: '範例中最大值 9 出現在索引 2 與 4：嚴格大於得到 2，大於等於得到 4。條件搜尋找不到時（沒有任何數大於 100）同樣回傳 −1。最大值與最小值不會「找不到」，但空陣列沒有最大值，呼叫前要先確認 n ≥ 1。' },
      ],
    },
    {
      id: 'complexity', title: '複雜度與「線性搜尋什麼時候就夠了」',
      blocks: [
        { type: 'p', text: '延續 A01 的最佳、最差、平均情況分析，以「比較次數」來數，n 是元素個數：' },
        { type: 'table', head: ['情況', '比較次數', 'Big-O'], rows: [
          ['最佳：目標就在索引 0', '1', 'O(1)'],
          ['最差：目標在最後一格，或根本不存在', 'n', 'O(n)'],
          ['平均：目標存在，且在每個位置的機率相同', '(1 + 2 + … + n) / n = (n + 1) / 2，約 n/2', 'O(n)'],
          ['目標不存在', '一定是 n', 'O(n)'],
          ['找全部位置、最大值位置', '一定是 n', 'O(n)'],
        ] },
        { type: 'p', text: '平均情況要加上假設才有意義：「目標存在、而且出現在每個位置的機會一樣」。目標若常常不存在，平均會更接近 n。Big-O 忽略常數，所以 n/2 仍是 O(n)。額外空間只用了幾個變數，是 O(1)；找全部時要存下 k 個結果，是 O(k)。' },
        { type: 'p', text: '單次查詢時，線性搜尋其實很難被打敗：任何方法至少要讀過資料一次，而排序本身就要 O(n log n)。真正的分界是查詢次數 q。如果同一份資料（大小 n）要回答 q 次「x 在不在、在哪裡」：' },
        { type: 'table', head: ['做法', '前置工作', '每次查詢', 'q 次查詢的總成本', '適合'], rows: [
          ['每次線性搜尋', '無', 'O(n)', 'O(n × q)', 'n 或 q 很小、資料沒排序、只查一兩次、鏈結串列'],
          ['先排序，再二分搜尋（A04）', '排序 O(n log n)', 'O(log n)', 'O(n log n + q log n)', '查詢多，還需要「第一個 ≥ x」這類有序的問題'],
          ['放進雜湊集合／map（D08、D09）', '建立 O(n)（平均）', '平均 O(1)', 'O(n + q)（平均）', '查詢很多，只問在不在或對應的資料'],
        ] },
        { type: 'p', text: '舉例：n = q = 10^5 時，每次線性搜尋最差要 10^5 × 10^5 = 10^10 次比較，遠超過一般題目的時間限制；排序加二分搜尋約幾百萬次，雜湊集合約 2 × 10^5 次。反過來，n = 1000、q = 1000 時 n × q = 10^6，線性搜尋完全夠用，寫起來也最不容易錯。鏈結串列不能跳到中間，二分搜尋派不上用場，只能線性搜尋。下面的範例實際數出每次查詢的比較次數，再估算大資料時三種做法的總成本。' },
        { type: 'example', id: 'ex-count-queries' },
        { type: 'p', text: '注意估算 10^10 這種數字時，C++ 的 `int` 與 Java 的 `int` 最大約 2.1 × 10^9 會溢位（overflow），範例用 `long long`／`long` 計算；Python 的整數沒有上限，不會溢位；JavaScript 的 `number` 在 2^53（約 9 × 10^15）以內都是精確的整數，10^10 沒有問題。範例裡「排序＋二分」用 n × ⌈log₂ n⌉ + q × ⌈log₂ n⌉ 粗估，「集合」把每次加入與查詢都算成 1 次平均操作，這些都是模型，不是實測時間。' },
      ],
    },
    {
      id: 'libraries', title: '各語言的現成函式與陷阱',
      blocks: [
        { type: 'p', text: '各語言都已經內建線性搜尋，它們同樣是 O(n)，差別在「找不到時怎麼告訴你」：' },
        { type: 'table', head: ['語言', '函式', '找到時', '找不到時'], rows: [
          ['C++', '`std::find(first, last, x)`、`std::find_if(first, last, pred)`', '指向該元素的迭代器，`it - a.begin()` 是索引', '回傳 `last`（通常是 `a.end()`），不可以解參考'],
          ['C++', '`std::string::find(sub)`', '第一個出現的位置', '回傳 `std::string::npos`'],
          ['Python', '`list.index(x)`', '第一個出現的索引', '丟出 `ValueError`'],
          ['Python', '`str.find(sub)`／`str.index(sub)`', '第一個出現的位置', '`find` 回傳 −1；`index` 丟出 `ValueError`'],
          ['Python', '`x in a`', '`True`', '`False`（只回答在不在）'],
          ['Java', '`List.indexOf(x)`／`lastIndexOf(x)`', '第一個／最後一個索引', '回傳 −1'],
          ['Java', '`String.indexOf(sub)`', '第一個出現的位置', '回傳 −1'],
          ['JavaScript', '`arr.indexOf(x)`／`lastIndexOf(x)`、`str.indexOf(sub)`', '第一個／最後一個索引', '回傳 −1'],
          ['JavaScript', '`arr.findIndex(pred)`／`arr.find(pred)`', '索引／元素本身', '`findIndex` 回傳 −1；`find` 回傳 `undefined`'],
          ['JavaScript', '`arr.includes(x)`', '`true`', '`false`（只回答在不在）'],
        ] },
        { type: 'example', id: 'ex-library' },
        { type: 'callout', tone: 'warning', title: 'Python 的 list.index 找不到會丟出例外', text: '`str.find` 找不到回傳 −1，但 list 沒有 `find` 方法，只有 `index`，而 `a.index(9)` 在 9 不存在時會丟出 `ValueError: list.index(x): x not in list`，程式直接中止，後面的程式碼都不會執行。不確定在不在時，先用 `if x in a:` 檢查（這也是一次 O(n) 掃描，總共掃兩次），或用 `try: … except ValueError:` 接住，或自己寫回傳 −1 的線性搜尋。' },
        { type: 'callout', tone: 'warning', title: 'Java 的基本型別陣列沒有 indexOf，也不要用 Arrays.asList 包它', text: 'Java 的 `int[]` 沒有 `indexOf` 方法。有人會寫 `Arrays.asList(arr).indexOf(2)`，但 `Arrays.asList` 收到 `int[]` 時，產生的是「只有一個元素（整個陣列）」的 `List<int[]>`，所以 `indexOf(2)` 永遠回傳 −1，`size()` 是 1，而且編譯時不會報錯。`Integer[]` 才會被轉成 `List<Integer>`。對 `int[]` 做搜尋，直接寫 `for` 迴圈最清楚；`Arrays.binarySearch` 則要求陣列已排序，是 A04 的主題。' },
        { type: 'p', text: '另外，`ArrayList.contains`、Python 的 `x in list`、C++ 對 `std::vector` 用 `std::find`、JavaScript 的 `arr.includes(x)`，每一次都是 O(n)。把它們放在迴圈裡（例如對每個查詢都 `in` 一次 list），總成本就是上一節的 O(n × q)；需要大量查詢時，改用集合。' },
      ],
    },
  ],
  examples: [
    {
      id: 'ex-first-last-all', title: '第一個、最後一個與所有位置', description: '同一個有重複值的陣列，分別找 8、1、4 的第一個、最後一個與所有位置；找不到一律是 −1。',
      output: 'target 8: first 1, last 5, all 1 3 5\ntarget 1: first 2, last 2, all 2\ntarget 4: first -1, last -1, all -1',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

int findFirst(const std::vector<int>& a, int target) {
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        if (a[i] == target) return i;  // 找到就立刻回傳
    }
    return -1;  // 看完全部都沒有，才能說找不到
}

int findLast(const std::vector<int>& a, int target) {
    for (int i = static_cast<int>(a.size()) - 1; i >= 0; --i) {  // 用有號的 int 倒著走
        if (a[i] == target) return i;
    }
    return -1;
}

std::vector<int> findAll(const std::vector<int>& a, int target) {
    std::vector<int> positions;
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        if (a[i] == target) positions.push_back(i);  // 記下來，繼續找
    }
    return positions;
}

int main() {
    std::vector<int> a = {3, 8, 1, 8, 5, 8};
    for (int t : {8, 1, 4}) {
        std::vector<int> pos = findAll(a, t);
        std::string all;
        for (int p : pos) all += (all.empty() ? "" : " ") + std::to_string(p);
        if (all.empty()) all = "-1";
        std::cout << "target " << t << ": first " << findFirst(a, t) << ", last " << findLast(a, t) << ", all " << all << "\n";
    }
    return 0;
}`,
        Python: code`def find_first(a, target):
    for i in range(len(a)):
        if a[i] == target:
            return i  # 找到就立刻回傳
    return -1  # 看完全部都沒有，才能說找不到


def find_last(a, target):
    for i in range(len(a) - 1, -1, -1):  # 從 n-1 倒著走到 0
        if a[i] == target:
            return i
    return -1


def find_all(a, target):
    return [i for i in range(len(a)) if a[i] == target]


a = [3, 8, 1, 8, 5, 8]
for t in [8, 1, 4]:
    pos = find_all(a, t)
    all_text = " ".join(map(str, pos)) if pos else "-1"
    print(f"target {t}: first {find_first(a, t)}, last {find_last(a, t)}, all {all_text}")`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static int findFirst(int[] a, int target) {
        for (int i = 0; i < a.length; i++) {
            if (a[i] == target) return i;  // 找到就立刻回傳
        }
        return -1;  // 看完全部都沒有，才能說找不到
    }

    static int findLast(int[] a, int target) {
        for (int i = a.length - 1; i >= 0; i--) {
            if (a[i] == target) return i;
        }
        return -1;
    }

    static List<Integer> findAll(int[] a, int target) {
        List<Integer> positions = new ArrayList<>();
        for (int i = 0; i < a.length; i++) {
            if (a[i] == target) positions.add(i);  // 記下來，繼續找
        }
        return positions;
    }

    public static void main(String[] args) {
        int[] a = {3, 8, 1, 8, 5, 8};
        for (int t : new int[] {8, 1, 4}) {
            List<Integer> pos = findAll(a, t);
            StringBuilder all = new StringBuilder();
            for (int p : pos) {
                if (all.length() > 0) all.append(" ");
                all.append(p);
            }
            if (pos.isEmpty()) all.append("-1");
            System.out.println("target " + t + ": first " + findFirst(a, t) + ", last " + findLast(a, t) + ", all " + all);
        }
    }
}`,
        JavaScript: code`function findFirst(a, target) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] === target) return i;  // 找到就立刻回傳
    }
    return -1;  // 看完全部都沒有，才能說找不到
}

function findLast(a, target) {
    for (let i = a.length - 1; i >= 0; i--) {
        if (a[i] === target) return i;
    }
    return -1;
}

function findAll(a, target) {
    const positions = [];
    for (let i = 0; i < a.length; i++) {
        if (a[i] === target) positions.push(i);  // 記下來，繼續找
    }
    return positions;
}

const a = [3, 8, 1, 8, 5, 8];
for (const t of [8, 1, 4]) {
    const pos = findAll(a, t);
    const all = pos.length > 0 ? pos.join(" ") : "-1";
    console.log("target " + t + ": first " + findFirst(a, t) + ", last " + findLast(a, t) + ", all " + all);
}`,
      },
    },
    {
      id: 'ex-by-condition', title: '第一個符合條件的元素，以及最大值、最小值的位置', description: '在 [6, −2, 9, 3, 9, −5, 1] 中找第一個大於 7、第一個負數、第一個大於 100 的元素，再找最大值第一次與最後一次出現的位置，以及最小值的位置。',
      output: 'first > 7: index 2 (value 9)\nfirst negative: index 1 (value -2)\nfirst > 100: index -1\nmax 9: first at 2, last at 4\nmin -5 at 5',
      code: {
        'C++': code`#include <iostream>
#include <vector>

template <typename Pred>
int findFirstIf(const std::vector<int>& a, Pred ok) {
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        if (ok(a[i])) return i;
    }
    return -1;
}

int main() {
    std::vector<int> a = {6, -2, 9, 3, 9, -5, 1};
    int big = findFirstIf(a, [](int x) { return x > 7; });
    int neg = findFirstIf(a, [](int x) { return x < 0; });
    int huge = findFirstIf(a, [](int x) { return x > 100; });
    std::cout << "first > 7: index " << big << " (value " << a[big] << ")\n";
    std::cout << "first negative: index " << neg << " (value " << a[neg] << ")\n";
    std::cout << "first > 100: index " << huge << "\n";  // -1：不能拿去當索引

    int firstMax = 0, lastMax = 0, minAt = 0;  // 初值是索引 0，不是數值 0
    for (int i = 1; i < static_cast<int>(a.size()); ++i) {
        if (a[i] > a[firstMax]) firstMax = i;   // 嚴格大於：相等不換，留下第一個
        if (a[i] >= a[lastMax]) lastMax = i;    // 大於等於：相等也換，留下最後一個
        if (a[i] < a[minAt]) minAt = i;
    }
    std::cout << "max " << a[firstMax] << ": first at " << firstMax << ", last at " << lastMax << "\n";
    std::cout << "min " << a[minAt] << " at " << minAt << "\n";
    return 0;
}`,
        Python: code`def find_first_if(a, ok):
    for i, v in enumerate(a):
        if ok(v):
            return i
    return -1


a = [6, -2, 9, 3, 9, -5, 1]
big = find_first_if(a, lambda x: x > 7)
neg = find_first_if(a, lambda x: x < 0)
huge = next((i for i, v in enumerate(a) if v > 100), -1)  # 同樣的事，一行寫法
print(f"first > 7: index {big} (value {a[big]})")
print(f"first negative: index {neg} (value {a[neg]})")
print(f"first > 100: index {huge}")  # -1：a[-1] 會安靜地拿到最後一個元素

first_max = last_max = min_at = 0  # 初值是索引 0，不是數值 0
for i in range(1, len(a)):
    if a[i] > a[first_max]:  # 嚴格大於：相等不換，留下第一個
        first_max = i
    if a[i] >= a[last_max]:  # 大於等於：相等也換，留下最後一個
        last_max = i
    if a[i] < a[min_at]:
        min_at = i
print(f"max {a[first_max]}: first at {first_max}, last at {last_max}")
print(f"min {a[min_at]} at {min_at}")`,
        Java: code`import java.util.function.IntPredicate;

public class Main {
    static int findFirstIf(int[] a, IntPredicate ok) {
        for (int i = 0; i < a.length; i++) {
            if (ok.test(a[i])) return i;
        }
        return -1;
    }

    public static void main(String[] args) {
        int[] a = {6, -2, 9, 3, 9, -5, 1};
        int big = findFirstIf(a, x -> x > 7);
        int neg = findFirstIf(a, x -> x < 0);
        int huge = findFirstIf(a, x -> x > 100);
        System.out.println("first > 7: index " + big + " (value " + a[big] + ")");
        System.out.println("first negative: index " + neg + " (value " + a[neg] + ")");
        System.out.println("first > 100: index " + huge);  // -1：不能拿去當索引

        int firstMax = 0, lastMax = 0, minAt = 0;  // 初值是索引 0，不是數值 0
        for (int i = 1; i < a.length; i++) {
            if (a[i] > a[firstMax]) firstMax = i;   // 嚴格大於：相等不換，留下第一個
            if (a[i] >= a[lastMax]) lastMax = i;    // 大於等於：相等也換，留下最後一個
            if (a[i] < a[minAt]) minAt = i;
        }
        System.out.println("max " + a[firstMax] + ": first at " + firstMax + ", last at " + lastMax);
        System.out.println("min " + a[minAt] + " at " + minAt);
    }
}`,
        JavaScript: code`function findFirstIf(a, ok) {
    for (let i = 0; i < a.length; i++) {
        if (ok(a[i])) return i;
    }
    return -1;
}

const a = [6, -2, 9, 3, 9, -5, 1];
const big = findFirstIf(a, x => x > 7);
const neg = findFirstIf(a, x => x < 0);
const huge = a.findIndex(x => x > 100);  // 同樣的事，內建的寫法
console.log("first > 7: index " + big + " (value " + a[big] + ")");
console.log("first negative: index " + neg + " (value " + a[neg] + ")");
console.log("first > 100: index " + huge);  // -1：a[-1] 是 undefined，不會報錯

let firstMax = 0, lastMax = 0, minAt = 0;  // 初值是索引 0，不是數值 0
for (let i = 1; i < a.length; i++) {
    if (a[i] > a[firstMax]) firstMax = i;   // 嚴格大於：相等不換，留下第一個
    if (a[i] >= a[lastMax]) lastMax = i;    // 大於等於：相等也換，留下最後一個
    if (a[i] < a[minAt]) minAt = i;
}
console.log("max " + a[firstMax] + ": first at " + firstMax + ", last at " + lastMax);
console.log("min " + a[minAt] + " at " + minAt);`,
      },
    },
    {
      id: 'ex-count-queries', title: '數一數：q 次查詢的比較次數', description: '對 8 個沒排序的數回答 5 次查詢，數出線性搜尋每次的比較次數與總數，和雜湊集合的操作次數比較；再估算 n = q = 10^5 時三種做法的總成本。',
      output: 'query 3: index 4, comparisons 5\nquery 12: index 0, comparisons 1\nquery 99: index -1, comparisons 8\nquery 10: index 7, comparisons 8\nquery 42: index -1, comparisons 8\nlinear total: 30 comparisons\nset: 8 inserts + 5 lookups = 13 operations (average)\nn = 100000, q = 100000\nlinear worst: 10000000000\nsort + binary about: 3400000\nset about: 200000',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    std::vector<int> data = {12, 5, 8, 20, 3, 15, 7, 10};
    std::vector<int> queries = {3, 12, 99, 10, 42};
    int n = static_cast<int>(data.size()), q = static_cast<int>(queries.size());
    int total = 0;
    for (int x : queries) {
        int index = -1, comparisons = 0;
        for (int i = 0; i < n; ++i) {
            ++comparisons;
            if (data[i] == x) {
                index = i;
                break;
            }
        }
        total += comparisons;
        std::cout << "query " << x << ": index " << index << ", comparisons " << comparisons << "\n";
    }
    std::cout << "linear total: " << total << " comparisons\n";
    std::cout << "set: " << n << " inserts + " << q << " lookups = " << n + q << " operations (average)\n";

    long long bigN = 100000, bigQ = 100000;  // n * q 超過 int 的範圍，要用 long long
    int lg = 0;
    while ((1LL << lg) < bigN) ++lg;  // ceil(log2 n) = 17
    std::cout << "n = " << bigN << ", q = " << bigQ << "\n";
    std::cout << "linear worst: " << bigN * bigQ << "\n";
    std::cout << "sort + binary about: " << bigN * lg + bigQ * lg << "\n";
    std::cout << "set about: " << bigN + bigQ << "\n";
    return 0;
}`,
        Python: code`data = [12, 5, 8, 20, 3, 15, 7, 10]
queries = [3, 12, 99, 10, 42]
n, q = len(data), len(queries)
total = 0
for x in queries:
    index, comparisons = -1, 0
    for i in range(n):
        comparisons += 1
        if data[i] == x:
            index = i
            break
    total += comparisons
    print(f"query {x}: index {index}, comparisons {comparisons}")
print(f"linear total: {total} comparisons")
print(f"set: {n} inserts + {q} lookups = {n + q} operations (average)")

big_n = big_q = 100000  # Python 的整數不會溢位
lg = (big_n - 1).bit_length()  # ceil(log2 n) = 17
print(f"n = {big_n}, q = {big_q}")
print(f"linear worst: {big_n * big_q}")
print(f"sort + binary about: {big_n * lg + big_q * lg}")
print(f"set about: {big_n + big_q}")`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int[] data = {12, 5, 8, 20, 3, 15, 7, 10};
        int[] queries = {3, 12, 99, 10, 42};
        int n = data.length, q = queries.length;
        int total = 0;
        for (int x : queries) {
            int index = -1, comparisons = 0;
            for (int i = 0; i < n; i++) {
                comparisons++;
                if (data[i] == x) {
                    index = i;
                    break;
                }
            }
            total += comparisons;
            System.out.println("query " + x + ": index " + index + ", comparisons " + comparisons);
        }
        System.out.println("linear total: " + total + " comparisons");
        System.out.println("set: " + n + " inserts + " + q + " lookups = " + (n + q) + " operations (average)");

        long bigN = 100000, bigQ = 100000;  // n * q 超過 int 的範圍，要用 long
        int lg = 0;
        while ((1L << lg) < bigN) lg++;  // ceil(log2 n) = 17
        System.out.println("n = " + bigN + ", q = " + bigQ);
        System.out.println("linear worst: " + bigN * bigQ);
        System.out.println("sort + binary about: " + (bigN * lg + bigQ * lg));
        System.out.println("set about: " + (bigN + bigQ));
    }
}`,
        JavaScript: code`const data = [12, 5, 8, 20, 3, 15, 7, 10];
const queries = [3, 12, 99, 10, 42];
const n = data.length, q = queries.length;
let total = 0;
for (const x of queries) {
    let index = -1, comparisons = 0;
    for (let i = 0; i < n; i++) {
        comparisons++;
        if (data[i] === x) {
            index = i;
            break;
        }
    }
    total += comparisons;
    console.log("query " + x + ": index " + index + ", comparisons " + comparisons);
}
console.log("linear total: " + total + " comparisons");
console.log("set: " + n + " inserts + " + q + " lookups = " + (n + q) + " operations (average)");

const bigN = 100000, bigQ = 100000;  // n * q = 10^10 < 2^53，number 仍是精確整數
let lg = 0;
while (2 ** lg < bigN) lg++;  // ceil(log2 n) = 17
console.log("n = " + bigN + ", q = " + bigQ);
console.log("linear worst: " + bigN * bigQ);
console.log("sort + binary about: " + (bigN * lg + bigQ * lg));
console.log("set about: " + (bigN + bigQ));`,
      },
    },
    {
      id: 'ex-library', title: '用現成函式做線性搜尋', description: '在 [4, 7, 2, 7, 9] 中用各語言的內建函式找 7、找不存在的 5、找第一個大於 8 的數、找最後一個 7，再在字串 "banana" 中找子字串；找不到時統一印 −1。',
      output: 'find 7: 1\nfind 5: -1\nfirst > 8: 4\nlast 7: 3\n"banana".find("na"): 2\n"banana".find("x"): -1',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<int> a = {4, 7, 2, 7, 9};
    auto indexOf = [&](std::vector<int>::const_iterator it) {
        return it == a.cend() ? -1 : static_cast<int>(it - a.cbegin());  // end() 代表找不到，不可解參考
    };
    std::cout << "find 7: " << indexOf(std::find(a.cbegin(), a.cend(), 7)) << "\n";
    std::cout << "find 5: " << indexOf(std::find(a.cbegin(), a.cend(), 5)) << "\n";
    std::cout << "first > 8: " << indexOf(std::find_if(a.cbegin(), a.cend(), [](int x) { return x > 8; })) << "\n";
    auto r = std::find(a.crbegin(), a.crend(), 7);  // 反向迭代器：由後往前找
    std::cout << "last 7: " << (r == a.crend() ? -1 : static_cast<int>(a.crend() - r) - 1) << "\n";

    std::string s = "banana";
    std::size_t p = s.find("na"), miss = s.find("x");
    std::cout << "\"banana\".find(\"na\"): " << (p == std::string::npos ? -1 : static_cast<int>(p)) << "\n";
    std::cout << "\"banana\".find(\"x\"): " << (miss == std::string::npos ? -1 : static_cast<int>(miss)) << "\n";
    return 0;
}`,
        Python: code`a = [4, 7, 2, 7, 9]
print("find 7:", a.index(7))
try:
    print("find 5:", a.index(5))
except ValueError:  # list.index 找不到會丟出 ValueError
    print("find 5:", -1)
print("first > 8:", next((i for i, x in enumerate(a) if x > 8), -1))
last = -1
for i in reversed(range(len(a))):
    if a[i] == 7:
        last = i
        break
print("last 7:", last)
print('"banana".find("na"):', "banana".find("na"))
print('"banana".find("x"):', "banana".find("x"))  # str.find 找不到回傳 -1`,
        Java: code`import java.util.List;
import java.util.stream.IntStream;

public class Main {
    public static void main(String[] args) {
        List<Integer> a = List.of(4, 7, 2, 7, 9);
        System.out.println("find 7: " + a.indexOf(7));
        System.out.println("find 5: " + a.indexOf(5));  // 找不到回傳 -1
        int big = IntStream.range(0, a.size()).filter(i -> a.get(i) > 8).findFirst().orElse(-1);
        System.out.println("first > 8: " + big);
        System.out.println("last 7: " + a.lastIndexOf(7));
        System.out.println("\"banana\".find(\"na\"): " + "banana".indexOf("na"));
        System.out.println("\"banana\".find(\"x\"): " + "banana".indexOf("x"));
    }
}`,
        JavaScript: code`const a = [4, 7, 2, 7, 9];
console.log("find 7: " + a.indexOf(7));
console.log("find 5: " + a.indexOf(5));  // 找不到回傳 -1
console.log("first > 8: " + a.findIndex(x => x > 8));
console.log("last 7: " + a.lastIndexOf(7));
console.log("\"banana\".find(\"na\"): " + "banana".indexOf("na"));
console.log("\"banana\".find(\"x\"): " + "banana".indexOf("x"));`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '線性搜尋：找出 7 的所有位置', language: 'Python',
    code: code`def find_all(a, target):
    positions = []
    for i in range(len(a)):
        if a[i] == target:
            positions.append(i)
    return positions

a = [4, 7, 2, 7, 9, 7]
pos = find_all(a, 7)
print(" ".join(map(str, pos)) if pos else -1)`,
    steps: traceSteps,
    tryIt: { algorithm: 'linear-search', initial: [5, -3, 8, 0, 8, 2], target: 8 },
  },
  quiz: [
    {
      id: 'q-first-or-last', prompt: '這段 Python 程式想找 2 第一次出現的位置。它實際輸出什麼？',
      code: { language: 'Python', text: code`a = [2, 5, 2, 7, 2]
first = -1
for i in range(len(a)):
    if a[i] == 2:
        first = i
print(first)` },
      options: ['0', '4', '2', '-1'],
      answer: 1, explanation: '找到之後沒有 `break`，迴圈繼續跑，後面每個 2 都會覆蓋 `first`，最後留下的是最後一個 2 的索引 4。想要第一個位置（0）要在設定後立刻 `break` 或 `return`。「2」是把 2 的個數（其實有 3 個）或中間那個位置當答案；「-1」只有完全找不到時才會出現。',
    },
    {
      id: 'q-comparisons', prompt: '對 a = [9, 4, 6, 4, 1] 用「找到第一個就回傳」的線性搜尋，先找 4、再找 8。兩次查詢總共比較幾次？',
      options: ['4', '5', '7', '10'],
      answer: 2, explanation: '找 4：比較 a[0] = 9、a[1] = 4，第 2 次就找到並停下，2 次。找 8：8 不存在，必須比完全部 5 個才能確定找不到，5 次。合計 7 次。「4」以為找不到時可以提早停；「5」只算了找不到的那次；「10」以為每次都要比完 n 個，忘了找到就停。',
    },
    {
      id: 'q-bug-return', prompt: '下面的 C++ 函式呼叫 `find({3, 8, 5}, 8)` 會回傳什麼？問題出在哪裡？',
      code: { language: 'C++', text: code`int find(const std::vector<int>& a, int x) {
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        if (a[i] == x) return i;
        else return -1;
    }
    return -1;
}` },
      options: ['回傳 1，程式正確', '回傳 -1：第一次比較不相等就回傳，只檢查了 a[0]', '回傳 2：找到的是最後一個', '編譯錯誤：同一個函式不能有兩個 return -1'],
      answer: 1, explanation: '`else return -1;` 讓迴圈在第一圈就結束：a[0] = 3 不等於 8，立刻回傳 −1，a[1] = 8 根本沒被看到。「找不到」只能在整個迴圈結束後才下結論，所以應刪掉 `else` 那一行，只保留迴圈後的 `return -1;`。函式有多個 `return` 完全合法，不會編譯錯誤；它也不會回傳 2。',
    },
    {
      id: 'q-list-index', prompt: '執行這段 Python 程式，畫面上會出現什麼？',
      code: { language: 'Python', text: code`a = [4, 1, 3]
print(a.index(3))
print(a.index(9))
print("done")` },
      options: ['2、-1、done 三行', '印出 2，接著丟出 ValueError，done 不會印出', '3、-1、done 三行', '2、None、done 三行'],
      answer: 1, explanation: '`a.index(3)` 回傳 3 所在的索引 2（不是值 3）。`list.index` 找不到時不回傳 −1，而是丟出 `ValueError: list.index(x): x not in list`，程式在第 3 行中止，`print("done")` 不會執行。回傳 −1 的是字串的 `str.find`；Python 也不會回傳 `None`。實際執行即可確認。',
    },
    {
      id: 'q-empty-argmax', prompt: '下面的 Java 方法回傳最大值第一次出現的索引。它在什麼輸入下會出問題？',
      code: { language: 'Java', text: code`static int argmax(int[] a) {
    int best = 0;
    for (int i = 1; i < a.length; i++) {
        if (a[i] > a[best]) best = i;
    }
    return best;
}` },
      options: ['a 全是負數時，會回傳錯的索引', '最大值出現好幾次時，會回傳最後一個', 'a 只有一個元素時，迴圈不執行所以出錯', 'a 是空陣列時，回傳 0，但 a[0] 不存在'],
      answer: 3, explanation: '空陣列時迴圈一次都不執行，直接回傳 0，呼叫的人若拿 `a[0]` 就會丟出 `ArrayIndexOutOfBoundsException`；空陣列沒有最大值，應先檢查 `a.length == 0` 另外處理（例如回傳 −1）。全是負數沒問題，因為 `best` 是索引、比的是 `a[best]`，不是拿數值 0 當初值；嚴格大於 `>` 遇到相等不換，回傳的是第一個最大值；只有一個元素時正確回傳 0。',
    },
    {
      id: 'q-choose', prompt: '下列哪一種情況，直接用線性搜尋最合適？',
      options: ['10^5 個沒排序的學號，要回答 10^5 次「這個學號在不在」', '讀入 200 個沒排序的數，只問一次「第一個負數在哪裡」', '10^6 個已排序的數，要回答 10^5 次「第一個 ≥ x 的位置」', '一份 10^6 筆的通訊錄，程式要不停地依名字查電話'],
      answer: 1, explanation: '只查一次、資料又沒排序時，任何方法都至少要讀過一遍資料，線性搜尋 O(n) 就是最好的，排序反而要 O(n log n)。第一項要 10^5 × 10^5 = 10^10 次比較，應改用雜湊集合（平均 O(n + q)）；第三項資料已排序又有大量「第一個 ≥ x」查詢，該用二分搜尋（A04）；第四項查詢不停發生，該用以名字為鍵的 map（D09）。',
    },
  ],
  exercises: [
    {
      id: 'e-first-last', title: '查詢第一次與最後一次出現的位置',
      statement: '給你 n 個整數 a[0]～a[n−1]（可能重複、可能是負數，沒有排序），以及 q 個查詢。對每個查詢值 x，輸出 x 第一次出現的索引與最後一次出現的索引（索引從 0 開始）；x 沒有出現時輸出 `-1 -1`。資料量不大，請用線性搜尋完成。若輸入不符合格式（見輸出說明），只輸出一行 `Invalid`。',
      inputFormat: '所有資料以空白或換行分隔：先是整數 n，接著 n 個整數 a[i]，然後是整數 q，接著 q 個查詢值。範例中分成四行，但換行與空白視為相同。',
      outputFormat: '資料正確時輸出 q 行，第 j 行是第 j 個查詢的「第一次索引 最後一次索引」，以一個空白分隔；沒出現時是 `-1 -1`。以下情況只輸出一行 `Invalid`：出現不是整數的資料（整數是可選的負號加上 1～10 位數字，例如 `3.5`、`abc` 都不是）；數值超出 −10^9～10^9；n 或 q 不在 1～1000；資料個數不等於 2 + n + q（少給或多給）；完全沒有輸入。',
      constraints: ['1 ≤ n ≤ 1000，1 ≤ q ≤ 1000', '−10^9 ≤ a[i]、x ≤ 10^9', '每個查詢做兩次線性搜尋，最差約 2 × n × q = 2 × 10^6 次比較，夠快'],
      samples: [{ kind: 'normal', input: '8\n5 3 5 9 3 5 1 7\n4\n5 3 9 4\n', output: '0 5\n1 4\n3 3\n-1 -1', note: '5 出現三次、3 出現兩次、9 只出現一次、4 沒有出現' }],
      tests: [
        { kind: 'normal', input: '8\n5 3 5 9 3 5 1 7\n4\n5 3 9 4\n', output: '0 5\n1 4\n3 3\n-1 -1', note: '範例' },
        { kind: 'normal', input: '7\n-2 4 -2 0 4 -7 -2\n5\n-2 4 0 -7 2\n', output: '0 6\n1 4\n3 3\n5 5\n-1 -1', note: '有負數；2 不存在但 -2 存在，不能只比絕對值' },
        { kind: 'normal', input: '6 10 20 10 30 20 10 3 20 10 40', output: '1 4\n0 5\n-1 -1', note: '全部資料寫在同一行也合法' },
        { kind: 'edge', input: '1\n42\n2\n42 7\n', output: '0 0\n-1 -1', note: 'n = 1：第一次與最後一次是同一個位置；找不到時兩個都是 -1' },
        { kind: 'edge', input: '5\n7 7 7 7 7\n2\n7 8\n', output: '0 4\n-1 -1', note: '全部相同：第一次是 0、最後一次是 n−1；只寫「找第一個」的程式在這裡會答錯最後一次' },
        { kind: 'edge', input: '5\n9 1 2 3 4\n2\n9 4\n', output: '0 0\n4 4', note: '目標只在索引 0，或只在最後一格 n−1' },
        { kind: 'edge', input: '4\n1 2 3 4\n3\n0 5 -1\n', output: '-1 -1\n-1 -1\n-1 -1', note: '所有查詢都找不到' },
        { kind: 'edge', input: '4\n1000000000 -1000000000 1000000000 0\n3\n1000000000 -1000000000 999999999\n', output: '0 2\n1 1\n-1 -1', note: '數值達到 ±10^9' },
        { kind: 'edge', input: '3\n5 6 5\n3\n5 5 6\n', output: '0 2\n0 2\n1 1', note: '同一個查詢值重複出現，每次都要照樣回答' },
        { kind: 'edge', input: bigInput, output: bigOutput, note: '最大資料量 n = q = 1000（由 TS 產生；答案以 indexOf／lastIndexOf 暴力計算），含大量不存在的查詢' },
        { kind: 'error', input: '5\n1 2 3\n1\n2\n', output: 'Invalid', note: '宣告 n = 5，只給了 3 個值，資料個數不足' },
        { kind: 'error', input: '3\n1 2 3.5\n1\n2\n', output: 'Invalid', note: '`3.5` 不是整數' },
        { kind: 'error', input: '3\n1 2 3\n2\nabc 2\n', output: 'Invalid', note: '查詢值 `abc` 不是整數' },
        { kind: 'error', input: '3\n1 2 3\n1\n2 9\n', output: 'Invalid', note: '宣告 q = 1，卻給了 2 個查詢值' },
        { kind: 'error', input: '0\n1\n5\n', output: 'Invalid', note: 'n = 0 不在 1～1000' },
        { kind: 'error', input: '', output: 'Invalid', note: '完全沒有輸入' },
      ],
      hints: [
        '先把所有資料讀成一串字串，逐一檢查是不是整數，再依 n、q 檢查個數是否剛好是 2 + n + q。',
        '找第一次：由前往後，相等就記下並 `break`。找最後一次：由後往前，相等就記下並 `break`。',
        '兩個答案的初值都設為 −1，迴圈結束還是 −1 就代表沒出現，不要在迴圈裡遇到不相等就輸出 `-1`。',
        'C++ 倒著走的迴圈用 `int`，不要用 `std::size_t`；輸出很多行時，C++ 用 `"\\n"`、Java 用 `StringBuilder` 一次輸出，JavaScript 收集到陣列再 `join("\\n")`。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// 可選的負號加上 1～10 位數字，數值在 -10^9～10^9
bool parseInt(const std::string& s, long long& value) {
    std::size_t start = s[0] == '-' ? 1 : 0;
    if (start == s.size() || s.size() - start > 10) return false;
    for (std::size_t i = start; i < s.size(); ++i) {
        if (s[i] < '0' || s[i] > '9') return false;
    }
    value = std::stoll(s);
    return value >= -1000000000LL && value <= 1000000000LL;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<long long> nums;
    std::string token;
    while (std::cin >> token) {
        long long v;
        if (!parseInt(token, v)) {
            std::cout << "Invalid\n";
            return 0;
        }
        nums.push_back(v);
    }
    long long total = static_cast<long long>(nums.size());
    if (total == 0 || nums[0] < 1 || nums[0] > 1000 || total < nums[0] + 2) {
        std::cout << "Invalid\n";
        return 0;
    }
    int n = static_cast<int>(nums[0]);
    long long q = nums[n + 1];
    if (q < 1 || q > 1000 || total != n + 2 + q) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<long long> a(nums.begin() + 1, nums.begin() + 1 + n);
    std::string out;
    for (long long j = 0; j < q; ++j) {
        long long x = nums[n + 2 + j];
        int first = -1, last = -1;
        for (int i = 0; i < n; ++i) {
            if (a[i] == x) {
                first = i;
                break;
            }
        }
        for (int i = n - 1; i >= 0; --i) {
            if (a[i] == x) {
                last = i;
                break;
            }
        }
        out += std::to_string(first) + " " + std::to_string(last) + "\n";
    }
    std::cout << out;
    return 0;
}`,
        Python: code`import re
import sys

INTEGER = re.compile(r"-?[0-9]{1,10}")


def solve(tokens):
    if not tokens or not all(INTEGER.fullmatch(t) for t in tokens):
        return None
    nums = [int(t) for t in tokens]
    if any(abs(v) > 10**9 for v in nums):
        return None
    n = nums[0]
    if not 1 <= n <= 1000 or len(nums) < n + 2:
        return None
    a = nums[1:n + 1]
    q = nums[n + 1]
    if not 1 <= q <= 1000 or len(nums) != n + 2 + q:
        return None
    lines = []
    for x in nums[n + 2:]:
        first = -1
        for i in range(n):
            if a[i] == x:
                first = i
                break
        last = -1
        for i in range(n - 1, -1, -1):
            if a[i] == x:
                last = i
                break
        lines.append(f"{first} {last}")
    return lines


result = solve(sys.stdin.read().split())
print("Invalid" if result is None else "\n".join(result))`,
        Java: code`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        List<Long> nums = new ArrayList<>();
        String line;
        while ((line = br.readLine()) != null) {
            for (String t : line.trim().split("\\s+")) {
                if (t.isEmpty()) continue;
                // 可選的負號加上 1～10 位數字，數值在 -10^9～10^9
                if (!t.matches("-?[0-9]{1,10}")) {
                    System.out.println("Invalid");
                    return;
                }
                long v = Long.parseLong(t);
                if (v < -1000000000L || v > 1000000000L) {
                    System.out.println("Invalid");
                    return;
                }
                nums.add(v);
            }
        }
        long total = nums.size();
        if (total == 0 || nums.get(0) < 1 || nums.get(0) > 1000 || total < nums.get(0) + 2) {
            System.out.println("Invalid");
            return;
        }
        int n = (int) (long) nums.get(0);
        long q = nums.get(n + 1);
        if (q < 1 || q > 1000 || total != n + 2 + q) {
            System.out.println("Invalid");
            return;
        }
        long[] a = new long[n];
        for (int i = 0; i < n; i++) a[i] = nums.get(i + 1);
        StringBuilder out = new StringBuilder();
        for (int j = 0; j < q; j++) {
            long x = nums.get(n + 2 + j);
            int first = -1, last = -1;
            for (int i = 0; i < n; i++) {
                if (a[i] == x) {
                    first = i;
                    break;
                }
            }
            for (int i = n - 1; i >= 0; i--) {
                if (a[i] == x) {
                    last = i;
                    break;
                }
            }
            out.append(first).append(' ').append(last).append('\n');
        }
        System.out.print(out);
    }
}`,
        JavaScript: code`const INTEGER = /^-?[0-9]{1,10}$/;  // 可選的負號加上 1～10 位數字

function solve(tokens) {
    if (tokens.length === 0 || !tokens.every(t => INTEGER.test(t))) return null;
    const nums = tokens.map(Number);
    if (nums.some(v => Math.abs(v) > 1000000000)) return null;
    const n = nums[0];
    if (n < 1 || n > 1000 || nums.length < n + 2) return null;
    const a = nums.slice(1, n + 1);
    const q = nums[n + 1];
    if (q < 1 || q > 1000 || nums.length !== n + 2 + q) return null;
    const lines = [];
    for (const x of nums.slice(n + 2)) {
        let first = -1;
        for (let i = 0; i < n; i++) {
            if (a[i] === x) {
                first = i;
                break;
            }
        }
        let last = -1;
        for (let i = n - 1; i >= 0; i--) {
            if (a[i] === x) {
                last = i;
                break;
            }
        }
        lines.push(first + " " + last);
    }
    return lines;
}

const text = require("fs").readFileSync(0, "utf8").trim();
const result = solve(text === "" ? [] : text.split(/\s+/));
console.log(result === null ? "Invalid" : result.join("\n"));`,
      },
      judge: 'none',
    },
  ],
};

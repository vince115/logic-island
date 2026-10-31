import type { LessonContent, TraceStep } from '../schema';
import { insertionSortSteps } from '../simulate-algorithms';

const code = String.raw;

/** The traced input: six values with a duplicate 2, so the trace shows an equal value that is not passed over. */
const traceInput = [5, 2, 4, 2, 6, 1];

/**
 * The insertion-sort trace. insertionSortSteps runs the same loop as the trace code (`while j >= 0 and a[j] > key`,
 * shift, then `a[j + 1] = key`); its events map to the lines below. A first step (line 1) is added by hand, and the
 * insert steps that land at index 0 get a note on why the loop stopped without a comparison (j reached −1).
 */
const insertionTrace: TraceStep[] = [
  { line: 1, note: '準備排序 `a = [5, 2, 4, 2, 6, 1]`。插入排序從 i = 1 開始：最左邊的 a[0] 自己一個元素，本來就是「已排序」的。注意有兩個 2，看看它們的先後會不會被改變。',
    arrays: [{ name: 'a', cells: traceInput.map(String), range: { from: 0, to: 0, label: '已排序' } }], vars: { n: String(traceInput.length) } },
  ...insertionSortSteps(traceInput, { take: 3, compare: 5, shift: 6, insert: 8, result: 9 }).map(step => {
    if (/放進索引 0。$/.test(step.note))
      return { ...step, note: `${step.note}這次 j 一路減到 −1：\`j >= 0\` 不成立，while 因為走到最左邊而停止，沒有再比較 a[−1]（Python 的 \`and\` 先檢查 \`j >= 0\`，不成立就不會讀 \`a[j]\`）。` };
    const stop = /^a\[\d+\] = (-?\d+) ≤ (-?\d+)：/.exec(step.note);
    if (stop && stop[1] !== stop[2]) return { ...step, note: step.note.replace('（相等時不越過，所以插入排序穩定）', '，因為 `a[j] > key` 不成立，while 結束，key 要放在它的右邊') };
    if (stop) return { ...step, note: `${step.note}第二個 ${stop[1]} 停在第一個 ${stop[1]} 的右邊，兩個 ${stop[1]} 的先後和原本一樣。` };
    return step;
  }),
];

/** The worst-case exercise test: 10^5 records with many repeated scores and names, from a fixed pseudo-random sequence. */
const BIG = 100000;
const bigStudents = (() => {
  let seed = 20261031;
  const next = (m: number) => { seed = (seed * 48271) % 2147483647; return seed % m; };
  return Array.from({ length: BIG }, () => {
    const len = 1 + next(3);
    let name = '';
    for (let k = 0; k < len; k++) name += 'abcde'[next(5)];
    return { name, score: next(101) };
  });
})();
const bigInput = `${BIG}\n` + bigStudents.map(s => `${s.name} ${s.score}`).join('\n');
const bigOutput = [...bigStudents]
  .sort((x, y) => (y.score - x.score) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
  .map(s => `${s.name} ${s.score}`).join('\n');

/** A05 Bubble / Selection / Insertion Sort. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const A05: LessonContent = {
  lessonId: 'A05',
  motivation: '排行榜要由高分排到低分、通訊錄要照姓名排、二分搜尋（A04）和雙指標都要求資料先排好：排序（sorting）是最常被呼叫的演算法之一。本課學三種最基本的排序：氣泡排序（bubble sort）、選擇排序（selection sort）與插入排序（insertion sort）。它們的程式都只有幾行，很適合用來練習「追蹤每一輪陣列長什麼樣子」、「數比較與交換的次數」，以及理解什麼叫穩定排序（stable sort）——這些都是之後合併排序、快速排序與各種「先排序再處理」題目的基礎。它們的限制也很明確：最差情況都是 O(n²)，n = 10^5 時約要 5 × 10^9 次比較，實作題幾乎一定跑不完；所以最後要學會改用語言內建、O(n log n) 的函式庫排序，並正確寫出多鍵排序的比較規則。',
  sections: [
    {
      id: 'bubble', title: '氣泡排序：相鄰比較，每輪把最大值推到最後',
      blocks: [
        { type: 'p', text: '氣泡排序只做一件事：比較相鄰的兩個元素 `a[j]` 與 `a[j + 1]`，左邊比較大就交換（swap）。從左到右做完一次稱為一輪（pass）。一輪下來，目前最大的值會像氣泡一樣一路被「推」到最右邊。' },
        { type: 'list', ordered: true, items: [
          '第 i 輪（i 從 0 開始）只需要比較 `j = 0` 到 `j = n − 2 − i`：最後 i 個位置已經是最大的 i 個值，不必再看。所以內層迴圈寫成 `for j in range(n - 1 - i)`。',
          '每一輪結束時，「最右邊 i + 1 個位置已經放好」——這就是氣泡排序的迴圈不變量（loop invariant）。做完 n − 1 輪，最小的值自然留在最左邊，整個陣列排好。',
          '提早結束（early exit）：如果某一輪完全沒有交換，表示每一對相鄰元素都已經 `a[j] <= a[j + 1]`，陣列已經排好，可以直接停止。用一個 `swapped` 旗標記錄。',
        ] },
        { type: 'p', text: '比較次數：最差（例如由大到小）要做滿 n − 1 輪，共 (n − 1) + (n − 2) + … + 1 = n(n − 1)/2 次比較，是 O(n²)。最佳情況是輸入已經排好：第一輪 n − 1 次比較都不交換，立刻停止，是 O(n)；沒有 `swapped` 旗標的版本即使已經排好也照樣跑滿 O(n²)。交換次數恰好等於陣列的逆序數（inversion，i < j 但 a[i] > a[j] 的配對數），因為每次相鄰交換剛好消除一個逆序對。' },
        { type: 'p', text: '本課的「相關互動實驗」是 Bubble Sort 實驗室，可以逐步播放每一次比較與交換；下方視覺化的「自己試試看」也是用同一個 Bubble Sort 引擎跑你輸入的數字。' },
        { type: 'callout', tone: 'warning', title: '內層迴圈多跑一格就越界', text: '內層迴圈讀 `a[j + 1]`，所以 j 最大只能到 n − 2 − i。寫成 `range(n - i)` 時，第一輪 j 會到 n − 1，讀 `a[n]`：Python 丟出 `IndexError`，Java 丟出 `ArrayIndexOutOfBoundsException`，C++ 則是未定義行為（undefined behavior），可能讀到垃圾值而不會報錯。寫完先用 n = 1、n = 2 的陣列手動追一次邊界。' },
      ],
    },
    {
      id: 'selection', title: '選擇排序：找最小值換到前面',
      blocks: [
        { type: 'p', text: '選擇排序把陣列分成左邊「已排序」與右邊「未排序」兩段。第 i 輪在 `a[i..n−1]` 中找出最小值的位置 `m`，再把 `a[m]` 與 `a[i]` 交換；不變量是「`a[0..i]` 是全部資料中最小的 i + 1 個值，而且已經排好」。' },
        { type: 'list', items: [
          '比較次數一定是 (n − 1) + (n − 2) + … + 1 = n(n − 1)/2：不論輸入是否已經排好，都得看完未排序段才能確定誰最小，所以最佳、最差都是 O(n²)，沒有提早結束的機會。',
          '交換次數最多 n − 1 次（每輪最多一次；`m == i` 時可以不換）。當「搬動資料」比「比較」昂貴很多時，這是選擇排序唯一的優點。',
          '空間 O(1)：只在原陣列上交換，是原地排序（in-place）。',
        ] },
        { type: 'p', text: '選擇排序不穩定（not stable）：遠距離的交換會把一個元素「跳過」和它相等的元素。用分數排序三筆紀錄 `(2,a) (2,b) (1,c)`：第 0 輪最小值是 `(1,c)`，它和 `(2,a)` 交換，得到 `(1,c) (2,b) (2,a)`；第 1 輪剩下兩個 2 一樣大，不交換。結果 `b` 跑到了 `a` 前面，原本 `a` 在 `b` 前面的相對順序被打亂了。後面「三種排序比一比」一節的範例會把它和插入排序並排比較。' },
        { type: 'callout', tone: 'note', title: '和「一比就換」的寫法不同', text: '有些人把選擇排序寫成「只要 `a[j] < a[i]` 就馬上交換 `a[i]`、`a[j]`」。結果一樣會排好、比較次數一樣，但交換次數可能多很多，也不是本課說的選擇排序。標準寫法是先只記住最小值的索引 `m`，一輪最後才交換一次。' },
      ],
    },
    {
      id: 'insertion', title: '插入排序：把下一張牌插進已排好的手牌',
      blocks: [
        { type: 'p', text: '插入排序像整理撲克牌：左邊 `a[0..i−1]` 已排好，取出下一個值 `key = a[i]`，從右往左看已排序段，比 key 大的都往右搬一格（shift），直到遇到 ≤ key 的值或走到最左邊，再把 key 放進空出來的位置 `a[j + 1]`。不變量是「每輪結束時 `a[0..i]` 排好」，但和選擇排序不同，它們不一定是全部資料中最小的 i + 1 個。' },
        { type: 'list', items: [
          '最佳 O(n)：輸入已排好時，每個 key 只和左邊鄰居比一次就停，共 n − 1 次比較、0 次搬移。',
          '最差 O(n²)：輸入由大到小時，每個 key 都要搬到最左邊，比較與搬移都是 n(n − 1)/2 次。',
          '搬移次數恰好等於逆序數。資料「幾乎排好」時（每個元素離最終位置最多 k 格），逆序數最多約 n·k，插入排序是 O(n·k)，非常快；n 很小（例如 ≤ 16）時常數也小，所以許多函式庫排序在小區段會改用插入排序。',
          '穩定：條件是 `a[j] > key` 才搬，遇到相等的值就停下，key 不會越過和它相等、原本在它前面的元素。如果改成 `a[j] >= key` 就會變成不穩定。',
        ] },
        { type: 'p', text: '下方視覺化追蹤的是插入排序（`[5, 2, 4, 2, 6, 1]`，含兩個 2）：可以看到每個 key 被取出、比較、較大的值往右搬，以及第二個 2 停在第一個 2 的右邊。視覺化的「自己試試看」與 Bubble Sort 實驗室跑的則是氣泡排序，可以拿同一組數字比較兩者每一步做的事。' },
        { type: 'callout', tone: 'warning', title: '`j >= 0` 一定要先檢查', text: '`while j >= 0 and a[j] > key` 依賴短路求值（short-circuit）：j 變成 −1 時第一個條件就不成立，不會讀 `a[-1]`。若順序寫反成 `a[j] > key and j >= 0`，Python 不會報錯，而是讀到 `a[-1]`（最後一個元素）造成錯誤結果；C++ 會讀越界記憶體（未定義行為）；Java 則丟出 `ArrayIndexOutOfBoundsException`。' },
      ],
    },
    {
      id: 'compare', title: '三種排序比一比：比較次數、交換次數與穩定性',
      blocks: [
        { type: 'p', text: '先把三種排序對同一個陣列 `[5, 1, 4, 2, 8, 3]` 的每一輪印出來，並數比較與交換（插入排序算「搬移」）的次數。注意氣泡排序第 4 輪沒有任何交換，所以提早結束、沒有跑第 5 輪；選擇排序則固定跑滿 n − 1 = 5 輪、比較 6 × 5 / 2 = 15 次。' },
        { type: 'example', id: 'ex-three-passes' },
        { type: 'p', text: '輸入的「形狀」對三者影響很不同。下面對 n = 8 的已排序、反序與「只有一對相鄰元素顛倒」三種輸入，印出「比較次數/交換或搬移次數」：' },
        { type: 'example', id: 'ex-best-worst' },
        { type: 'table', head: ['', '比較次數', '交換／搬移', '最佳', '最差', '穩定', '原地（額外空間）'], rows: [
          ['氣泡排序（提早結束）', 'n − 1 到 n(n − 1)/2', '交換 = 逆序數', 'O(n)（已排序）', 'O(n²)', '穩定（`>` 才交換）', '是，O(1)'],
          ['選擇排序', '固定 n(n − 1)/2', '交換 ≤ n − 1', 'O(n²)', 'O(n²)', '不穩定', '是，O(1)'],
          ['插入排序', 'n − 1 到 n(n − 1)/2', '搬移 = 逆序數', 'O(n)（已排序）', 'O(n²)', '穩定（`>` 才搬）', '是，O(1)'],
        ] },
        { type: 'p', text: '穩定性（stability）的意思是：排序鍵（key）相等的元素，排序後仍保持原本的先後順序。只排整數時看不出差別（兩個 2 長得一樣），但排的是「紀錄」時就很重要：例如成績單已經依座號排好，再依分數排序，穩定排序能保證同分的人仍依座號排列。下面用分數當鍵，對 `(2,a) (2,b) (1,c)` 分別做選擇排序、插入排序與函式庫的穩定排序：' },
        { type: 'example', id: 'ex-stability' },
        { type: 'p', text: '穩定性讓多鍵排序可以「分兩次排」：要依「分數由高到低，同分依姓名」排序，可以先依姓名排，再用穩定排序依分數排——第二次排序不會打亂同分者已經排好的姓名順序。重點是次要的鍵先排、主要的鍵最後排，而且最後那次一定要穩定。' },
      ],
    },
    {
      id: 'library', title: '實作題用函式庫排序：比較規則與常見錯誤',
      blocks: [
        { type: 'p', text: '三種基本排序都是 O(n²)；n = 10^5 時約 5 × 10^9 次比較，遠超過一般題目的時間限制。實作時應該用語言內建的 O(n log n) 排序，把心力放在「比較規則寫對」：' },
        { type: 'list', items: [
          'C++17：`std::sort(v.begin(), v.end(), cmp)` 保證 O(n log n)，常見實作（例如 GCC 的 libstdc++）是內省排序（introsort：快速排序 + 堆積排序 + 小區段插入排序），不穩定。需要穩定時用 `std::stable_sort`（通常是合併排序，會用額外記憶體）。`cmp(x, y)` 回傳「x 是否應該排在 y 前面」。',
          'Python 3：`sorted(iterable)` 回傳新串列，`list.sort()` 原地排序，兩者都保證穩定（TimSort 系列的演算法），用 `key=` 指定排序鍵，例如 `key=lambda s: (-s[1], s[0])`；`reverse=True` 也保持穩定。',
          'Java 17：`Arrays.sort(int[])` 等基本型別陣列用雙軸快速排序（dual-pivot quicksort），不保證穩定——但基本型別相等的值完全一樣、沒有「身分」可分，所以穩定與否沒有差別。物件陣列 `Arrays.sort(T[], Comparator)` 與 `List.sort`、`Collections.sort` 用 TimSort，保證穩定。比較規則用 `Comparator`，例如 `Comparator.comparingInt(Student::score).reversed().thenComparing(Student::name)`。',
        ] },
        { type: 'p', text: '下面的範例把五位學生依「分數由高到低、同分依姓名由小到大」排序：一次用完整的比較規則，一次用「先排姓名、再穩定排分數」的兩段式；最後一行示範常見的錯誤寫法——把整個（分數, 姓名）一起反轉，同分時姓名也變成由大到小了。' },
        { type: 'example', id: 'ex-library-sort' },
        { type: 'callout', tone: 'warning', title: 'C++ 的比較函式不能用 `<=`', text: '`std::sort` 要求比較函式是嚴格弱序（strict weak ordering）：`cmp(x, x)` 必須是 false。寫成 `return x.score <= y.score;` 時，相等的元素會讓 `cmp(x, y)` 和 `cmp(y, x)` 同時為 true，這是未定義行為：在很多相等元素時，常見實作可能讀出陣列範圍外而當掉，或排出錯的結果。永遠用 `<`、`>`，多鍵時先比主鍵、不相等才回傳，相等再比次鍵。' },
        { type: 'callout', tone: 'warning', title: 'Java 不要用減法比較', text: '`(x, y) -> x.value - y.value` 在值很大或很小時會整數溢位：例如 `Integer.MIN_VALUE - 1` 變成一個很大的正數，比較結果反過來，TimSort 甚至可能丟出「Comparison method violates its general contract!」的 `IllegalArgumentException`。改用 `Integer.compare(x.value, y.value)` 或 `Comparator.comparingInt`。C++ 與 Python 的 `key=` 寫法沒有這個問題（Python 整數不會溢位）。' },
        { type: 'callout', tone: 'tip', title: '那為什麼還要學 O(n²) 排序？', text: '因為題目常常不是「排序」本身，而是排序過程中的量：交換次數（= 逆序數）、某一輪之後的陣列、穩定與否、最少要幾次相鄰交換才能排好。這些都要能一步步追蹤基本排序才答得出來；而且插入排序在幾乎排好、或 n 很小的資料上，本身就是很好的選擇。' },
      ],
    },
  ],
  examples: [
    {
      id: 'ex-three-passes', title: '三種排序的每一輪與比較、交換次數',
      description: '對同一個陣列 `[5, 1, 4, 2, 8, 3]` 分別做氣泡、選擇、插入排序，每輪結束印出陣列，最後印出比較次數與交換（插入排序為搬移）次數。氣泡排序第 4 輪沒有交換而提早結束；三者的交換／搬移次數中，氣泡與插入都等於逆序數 7。',
      output: 'bubble\npass 1: 1 4 2 5 3 8\npass 2: 1 2 4 3 5 8\npass 3: 1 2 3 4 5 8\npass 4: 1 2 3 4 5 8\ncompares 14, swaps 7\nselection\npass 1: 1 5 4 2 8 3\npass 2: 1 2 4 5 8 3\npass 3: 1 2 3 5 8 4\npass 4: 1 2 3 4 8 5\npass 5: 1 2 3 4 5 8\ncompares 15, swaps 5\ninsertion\npass 1: 1 5 4 2 8 3\npass 2: 1 4 5 2 8 3\npass 3: 1 2 4 5 8 3\npass 4: 1 2 4 5 8 3\npass 5: 1 2 3 4 5 8\ncompares 11, moves 7',
      code: {
        'C++': code`#include <iostream>
#include <utility>
#include <vector>

void show(int k, const std::vector<int>& a) {
    std::cout << "pass " << k << ":";
    for (int v : a) std::cout << ' ' << v;
    std::cout << "\n";
}

void bubble(std::vector<int> a) {
    int n = static_cast<int>(a.size()), compares = 0, swaps = 0;
    for (int i = 0; i < n - 1; i++) {
        bool swapped = false;
        for (int j = 0; j < n - 1 - i; j++) {
            compares++;
            if (a[j] > a[j + 1]) {
                std::swap(a[j], a[j + 1]);
                swaps++;
                swapped = true;
            }
        }
        show(i + 1, a);
        if (!swapped) break;
    }
    std::cout << "compares " << compares << ", swaps " << swaps << "\n";
}

void selection(std::vector<int> a) {
    int n = static_cast<int>(a.size()), compares = 0, swaps = 0;
    for (int i = 0; i < n - 1; i++) {
        int m = i;
        for (int j = i + 1; j < n; j++) {
            compares++;
            if (a[j] < a[m]) m = j;
        }
        if (m != i) {
            std::swap(a[i], a[m]);
            swaps++;
        }
        show(i + 1, a);
    }
    std::cout << "compares " << compares << ", swaps " << swaps << "\n";
}

void insertion(std::vector<int> a) {
    int n = static_cast<int>(a.size()), compares = 0, moves = 0;
    for (int i = 1; i < n; i++) {
        int key = a[i], j = i - 1;
        while (j >= 0) {
            compares++;
            if (a[j] <= key) break;
            a[j + 1] = a[j];
            moves++;
            j--;
        }
        a[j + 1] = key;
        show(i, a);
    }
    std::cout << "compares " << compares << ", moves " << moves << "\n";
}

int main() {
    const std::vector<int> data = {5, 1, 4, 2, 8, 3};
    std::cout << "bubble\n";
    bubble(data);
    std::cout << "selection\n";
    selection(data);
    std::cout << "insertion\n";
    insertion(data);
}`,
        Python: code`def show(k, a):
    print(f"pass {k}:", *a)


def bubble(a):
    n, compares, swaps = len(a), 0, 0
    for i in range(n - 1):
        swapped = False
        for j in range(n - 1 - i):
            compares += 1
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
                swaps += 1
                swapped = True
        show(i + 1, a)
        if not swapped:
            break
    print(f"compares {compares}, swaps {swaps}")


def selection(a):
    n, compares, swaps = len(a), 0, 0
    for i in range(n - 1):
        m = i
        for j in range(i + 1, n):
            compares += 1
            if a[j] < a[m]:
                m = j
        if m != i:
            a[i], a[m] = a[m], a[i]
            swaps += 1
        show(i + 1, a)
    print(f"compares {compares}, swaps {swaps}")


def insertion(a):
    compares, moves = 0, 0
    for i in range(1, len(a)):
        key, j = a[i], i - 1
        while j >= 0:
            compares += 1
            if a[j] <= key:
                break
            a[j + 1] = a[j]
            moves += 1
            j -= 1
        a[j + 1] = key
        show(i, a)
    print(f"compares {compares}, moves {moves}")


data = [5, 1, 4, 2, 8, 3]
for name, sort in (("bubble", bubble), ("selection", selection), ("insertion", insertion)):
    print(name)
    sort(data[:])`,
        Java: code`public class Main {
    static void show(int k, int[] a) {
        StringBuilder sb = new StringBuilder("pass " + k + ":");
        for (int v : a) sb.append(' ').append(v);
        System.out.println(sb);
    }

    static void bubble(int[] a) {
        int n = a.length, compares = 0, swaps = 0;
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            for (int j = 0; j < n - 1 - i; j++) {
                compares++;
                if (a[j] > a[j + 1]) {
                    int t = a[j];
                    a[j] = a[j + 1];
                    a[j + 1] = t;
                    swaps++;
                    swapped = true;
                }
            }
            show(i + 1, a);
            if (!swapped) break;
        }
        System.out.println("compares " + compares + ", swaps " + swaps);
    }

    static void selection(int[] a) {
        int n = a.length, compares = 0, swaps = 0;
        for (int i = 0; i < n - 1; i++) {
            int m = i;
            for (int j = i + 1; j < n; j++) {
                compares++;
                if (a[j] < a[m]) m = j;
            }
            if (m != i) {
                int t = a[i];
                a[i] = a[m];
                a[m] = t;
                swaps++;
            }
            show(i + 1, a);
        }
        System.out.println("compares " + compares + ", swaps " + swaps);
    }

    static void insertion(int[] a) {
        int compares = 0, moves = 0;
        for (int i = 1; i < a.length; i++) {
            int key = a[i], j = i - 1;
            while (j >= 0) {
                compares++;
                if (a[j] <= key) break;
                a[j + 1] = a[j];
                moves++;
                j--;
            }
            a[j + 1] = key;
            show(i, a);
        }
        System.out.println("compares " + compares + ", moves " + moves);
    }

    public static void main(String[] args) {
        int[] data = {5, 1, 4, 2, 8, 3};
        System.out.println("bubble");
        bubble(data.clone());
        System.out.println("selection");
        selection(data.clone());
        System.out.println("insertion");
        insertion(data.clone());
    }
}`,
      },
    },
    {
      id: 'ex-best-worst', title: '已排序、反序、幾乎排好：誰受輸入影響',
      description: '對 n = 8 的三種輸入，印出每種排序的「比較次數/交換或搬移次數」。已排序時氣泡（提早結束）與插入都只要 7 次比較；選擇排序永遠 28 = 8 × 7 / 2 次。反序時選擇排序只交換 4 次（每次把兩端對調），另外兩者交換／搬移 28 次 = 逆序數。只顛倒一對時，插入排序 8 次比較，氣泡排序要跑兩輪共 13 次。',
      output: 'sorted: bubble 7/0, selection 28/0, insertion 7/0\nreversed: bubble 28/28, selection 28/4, insertion 28/28\nnearly: bubble 13/1, selection 28/1, insertion 8/1',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <utility>
#include <vector>

using Count = std::pair<int, int>;  // compares, swaps or moves

Count bubble(std::vector<int> a) {
    int n = static_cast<int>(a.size()), c = 0, s = 0;
    for (int i = 0; i < n - 1; i++) {
        bool swapped = false;
        for (int j = 0; j < n - 1 - i; j++) {
            c++;
            if (a[j] > a[j + 1]) {
                std::swap(a[j], a[j + 1]);
                s++;
                swapped = true;
            }
        }
        if (!swapped) break;
    }
    return {c, s};
}

Count selection(std::vector<int> a) {
    int n = static_cast<int>(a.size()), c = 0, s = 0;
    for (int i = 0; i < n - 1; i++) {
        int m = i;
        for (int j = i + 1; j < n; j++) {
            c++;
            if (a[j] < a[m]) m = j;
        }
        if (m != i) {
            std::swap(a[i], a[m]);
            s++;
        }
    }
    return {c, s};
}

Count insertion(std::vector<int> a) {
    int n = static_cast<int>(a.size()), c = 0, s = 0;
    for (int i = 1; i < n; i++) {
        int key = a[i], j = i - 1;
        while (j >= 0) {
            c++;
            if (a[j] <= key) break;
            a[j + 1] = a[j];
            s++;
            j--;
        }
        a[j + 1] = key;
    }
    return {c, s};
}

std::string text(Count x) {
    return std::to_string(x.first) + "/" + std::to_string(x.second);
}

int main() {
    const std::vector<std::pair<std::string, std::vector<int>>> inputs = {
        {"sorted", {1, 2, 3, 4, 5, 6, 7, 8}},
        {"reversed", {8, 7, 6, 5, 4, 3, 2, 1}},
        {"nearly", {1, 2, 3, 5, 4, 6, 7, 8}},
    };
    for (const auto& [name, a] : inputs) {
        std::cout << name << ": bubble " << text(bubble(a)) << ", selection " << text(selection(a))
                  << ", insertion " << text(insertion(a)) << "\n";
    }
}`,
        Python: code`def bubble(a):
    n, c, s = len(a), 0, 0
    for i in range(n - 1):
        swapped = False
        for j in range(n - 1 - i):
            c += 1
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
                s += 1
                swapped = True
        if not swapped:
            break
    return c, s


def selection(a):
    n, c, s = len(a), 0, 0
    for i in range(n - 1):
        m = i
        for j in range(i + 1, n):
            c += 1
            if a[j] < a[m]:
                m = j
        if m != i:
            a[i], a[m] = a[m], a[i]
            s += 1
    return c, s


def insertion(a):
    c, s = 0, 0
    for i in range(1, len(a)):
        key, j = a[i], i - 1
        while j >= 0:
            c += 1
            if a[j] <= key:
                break
            a[j + 1] = a[j]
            s += 1
            j -= 1
        a[j + 1] = key
    return c, s


inputs = [
    ("sorted", [1, 2, 3, 4, 5, 6, 7, 8]),
    ("reversed", [8, 7, 6, 5, 4, 3, 2, 1]),
    ("nearly", [1, 2, 3, 5, 4, 6, 7, 8]),
]
for name, a in inputs:
    parts = [f"{label} {c}/{s}" for label, (c, s) in
             (("bubble", bubble(a[:])), ("selection", selection(a[:])), ("insertion", insertion(a[:])))]
    print(f"{name}: " + ", ".join(parts))`,
        Java: code`public class Main {
    static String bubble(int[] a) {
        int n = a.length, c = 0, s = 0;
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            for (int j = 0; j < n - 1 - i; j++) {
                c++;
                if (a[j] > a[j + 1]) {
                    int t = a[j];
                    a[j] = a[j + 1];
                    a[j + 1] = t;
                    s++;
                    swapped = true;
                }
            }
            if (!swapped) break;
        }
        return c + "/" + s;
    }

    static String selection(int[] a) {
        int n = a.length, c = 0, s = 0;
        for (int i = 0; i < n - 1; i++) {
            int m = i;
            for (int j = i + 1; j < n; j++) {
                c++;
                if (a[j] < a[m]) m = j;
            }
            if (m != i) {
                int t = a[i];
                a[i] = a[m];
                a[m] = t;
                s++;
            }
        }
        return c + "/" + s;
    }

    static String insertion(int[] a) {
        int c = 0, s = 0;
        for (int i = 1; i < a.length; i++) {
            int key = a[i], j = i - 1;
            while (j >= 0) {
                c++;
                if (a[j] <= key) break;
                a[j + 1] = a[j];
                s++;
                j--;
            }
            a[j + 1] = key;
        }
        return c + "/" + s;
    }

    public static void main(String[] args) {
        String[] names = {"sorted", "reversed", "nearly"};
        int[][] inputs = {
            {1, 2, 3, 4, 5, 6, 7, 8},
            {8, 7, 6, 5, 4, 3, 2, 1},
            {1, 2, 3, 5, 4, 6, 7, 8},
        };
        for (int k = 0; k < inputs.length; k++) {
            int[] a = inputs[k];
            System.out.println(names[k] + ": bubble " + bubble(a.clone()) + ", selection " + selection(a.clone())
                + ", insertion " + insertion(a.clone()));
        }
    }
}`,
      },
    },
    {
      id: 'ex-stability', title: '穩定與不穩定：依分數排序三筆紀錄',
      description: '紀錄是（分數, 代號），只用分數當排序鍵。選擇排序把 `(1,c)` 和 `(2,a)` 遠距離交換，`a` 被換到 `b` 後面；插入排序與函式庫的穩定排序（C++ `std::stable_sort`、Python `sorted`、Java `List.sort`）都保持同分的 `a` 在 `b` 前面。',
      output: 'input: (2,a) (2,b) (1,c)\nselection: (1,c) (2,b) (2,a)\ninsertion: (1,c) (2,a) (2,b)\nlibrary stable: (1,c) (2,a) (2,b)',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

struct Rec {
    int score;
    char tag;
};

std::vector<Rec> selectionByScore(std::vector<Rec> a) {
    int n = static_cast<int>(a.size());
    for (int i = 0; i < n - 1; i++) {
        int m = i;
        for (int j = i + 1; j < n; j++)
            if (a[j].score < a[m].score) m = j;
        std::swap(a[i], a[m]);
    }
    return a;
}

std::vector<Rec> insertionByScore(std::vector<Rec> a) {
    int n = static_cast<int>(a.size());
    for (int i = 1; i < n; i++) {
        Rec key = a[i];
        int j = i - 1;
        while (j >= 0 && a[j].score > key.score) {
            a[j + 1] = a[j];
            j--;
        }
        a[j + 1] = key;
    }
    return a;
}

void show(const std::string& label, const std::vector<Rec>& a) {
    std::cout << label << ":";
    for (const Rec& r : a) std::cout << " (" << r.score << ',' << r.tag << ')';
    std::cout << "\n";
}

int main() {
    const std::vector<Rec> recs = {{2, 'a'}, {2, 'b'}, {1, 'c'}};
    show("input", recs);
    show("selection", selectionByScore(recs));
    show("insertion", insertionByScore(recs));
    std::vector<Rec> lib = recs;
    std::stable_sort(lib.begin(), lib.end(), [](const Rec& x, const Rec& y) { return x.score < y.score; });
    show("library stable", lib);
}`,
        Python: code`def selection_by_score(recs):
    a = recs[:]
    for i in range(len(a) - 1):
        m = i
        for j in range(i + 1, len(a)):
            if a[j][0] < a[m][0]:
                m = j
        a[i], a[m] = a[m], a[i]
    return a


def insertion_by_score(recs):
    a = recs[:]
    for i in range(1, len(a)):
        key, j = a[i], i - 1
        while j >= 0 and a[j][0] > key[0]:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key
    return a


def show(label, a):
    print(label + ":", " ".join(f"({score},{tag})" for score, tag in a))


recs = [(2, "a"), (2, "b"), (1, "c")]
show("input", recs)
show("selection", selection_by_score(recs))
show("insertion", insertion_by_score(recs))
show("library stable", sorted(recs, key=lambda r: r[0]))`,
        Java: code`import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class Main {
    record Rec(int score, char tag) {}

    static List<Rec> selectionByScore(List<Rec> recs) {
        List<Rec> a = new ArrayList<>(recs);
        for (int i = 0; i < a.size() - 1; i++) {
            int m = i;
            for (int j = i + 1; j < a.size(); j++)
                if (a.get(j).score() < a.get(m).score()) m = j;
            Rec t = a.get(i);
            a.set(i, a.get(m));
            a.set(m, t);
        }
        return a;
    }

    static List<Rec> insertionByScore(List<Rec> recs) {
        List<Rec> a = new ArrayList<>(recs);
        for (int i = 1; i < a.size(); i++) {
            Rec key = a.get(i);
            int j = i - 1;
            while (j >= 0 && a.get(j).score() > key.score()) {
                a.set(j + 1, a.get(j));
                j--;
            }
            a.set(j + 1, key);
        }
        return a;
    }

    static void show(String label, List<Rec> a) {
        StringBuilder sb = new StringBuilder(label + ":");
        for (Rec r : a) sb.append(" (").append(r.score()).append(',').append(r.tag()).append(')');
        System.out.println(sb);
    }

    public static void main(String[] args) {
        List<Rec> recs = List.of(new Rec(2, 'a'), new Rec(2, 'b'), new Rec(1, 'c'));
        show("input", recs);
        show("selection", selectionByScore(recs));
        show("insertion", insertionByScore(recs));
        List<Rec> lib = new ArrayList<>(recs);
        lib.sort(Comparator.comparingInt(Rec::score));
        show("library stable", lib);
    }
}`,
      },
    },
    {
      id: 'ex-library-sort', title: '函式庫排序與多鍵排序：分數由高到低、同分依姓名',
      description: '`key` 一行用完整的比較規則；`two passes` 先依姓名排，再用穩定排序依分數由高到低排；`wrong` 把（分數, 姓名）整組反轉，同分的 `bob`、`cat` 與 `amy`、`dan` 姓名順序也被反過來了。',
      output: 'key: eve 95, bob 90, cat 90, amy 85, dan 85\ntwo passes: eve 95, bob 90, cat 90, amy 85, dan 85\nwrong: eve 95, cat 90, bob 90, dan 85, amy 85',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <tuple>
#include <vector>

struct Student {
    std::string name;
    int score;
};

void show(const std::string& label, const std::vector<Student>& a) {
    std::cout << label << ":";
    for (std::size_t i = 0; i < a.size(); i++) std::cout << (i ? ", " : " ") << a[i].name << ' ' << a[i].score;
    std::cout << "\n";
}

int main() {
    const std::vector<Student> students = {{"bob", 90}, {"amy", 85}, {"cat", 90}, {"dan", 85}, {"eve", 95}};

    std::vector<Student> a = students;
    std::sort(a.begin(), a.end(), [](const Student& x, const Student& y) {
        if (x.score != y.score) return x.score > y.score;  // main key: higher score first
        return x.name < y.name;                            // tie: smaller name first
    });
    show("key", a);

    std::vector<Student> b = students;
    std::sort(b.begin(), b.end(), [](const Student& x, const Student& y) { return x.name < y.name; });
    std::stable_sort(b.begin(), b.end(), [](const Student& x, const Student& y) { return x.score > y.score; });
    show("two passes", b);

    std::vector<Student> c = students;
    std::sort(c.begin(), c.end(), [](const Student& x, const Student& y) {
        return std::tie(x.score, x.name) > std::tie(y.score, y.name);
    });
    show("wrong", c);
}`,
        Python: code`students = [("bob", 90), ("amy", 85), ("cat", 90), ("dan", 85), ("eve", 95)]


def show(label, a):
    print(label + ":", ", ".join(f"{name} {score}" for name, score in a))


show("key", sorted(students, key=lambda s: (-s[1], s[0])))

two = sorted(students, key=lambda s: s[0])
two.sort(key=lambda s: s[1], reverse=True)  # stable, even with reverse=True
show("two passes", two)

show("wrong", sorted(students, key=lambda s: (s[1], s[0]), reverse=True))`,
        Java: code`import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class Main {
    record Student(String name, int score) {}

    static void show(String label, List<Student> a) {
        StringBuilder sb = new StringBuilder(label + ":");
        for (int i = 0; i < a.size(); i++) sb.append(i > 0 ? ", " : " ").append(a.get(i).name()).append(' ').append(a.get(i).score());
        System.out.println(sb);
    }

    public static void main(String[] args) {
        List<Student> students = List.of(new Student("bob", 90), new Student("amy", 85), new Student("cat", 90),
            new Student("dan", 85), new Student("eve", 95));

        List<Student> a = new ArrayList<>(students);
        a.sort(Comparator.comparingInt(Student::score).reversed().thenComparing(Student::name));
        show("key", a);

        List<Student> b = new ArrayList<>(students);
        b.sort(Comparator.comparing(Student::name));
        b.sort(Comparator.comparingInt(Student::score).reversed());  // List.sort is stable
        show("two passes", b);

        List<Student> c = new ArrayList<>(students);
        c.sort(Comparator.comparingInt(Student::score).thenComparing(Student::name).reversed());
        show("wrong", c);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'sorting-steps', title: '插入排序：取出 key、較大的往右搬、插入空位', language: 'Python',
    code: code`a = [5, 2, 4, 2, 6, 1]
for i in range(1, len(a)):
    key = a[i]
    j = i - 1
    while j >= 0 and a[j] > key:
        a[j + 1] = a[j]
        j -= 1
    a[j + 1] = key
print(*a)`,
    steps: insertionTrace,
    tryIt: { algorithm: 'bubble-sort', initial: [5, 1, 4, 2, 8] },
  },
  quiz: [
    {
      id: 'q-first-pass', prompt: '對 `[4, 3, 1, 2]` 各做「第一輪」：氣泡排序 i = 0 的內層迴圈跑完、選擇排序 i = 0 那輪做完、插入排序 i = 1 那輪做完（都依本課的寫法）。三個結果依序是？',
      options: [
        '氣泡 `3 4 1 2`；選擇 `1 3 4 2`；插入 `1 3 4 2`',
        '氣泡 `1 3 4 2`；選擇 `1 3 4 2`；插入 `3 4 1 2`',
        '氣泡 `3 1 2 4`；選擇 `1 3 4 2`；插入 `3 4 1 2`',
        '氣泡 `3 1 2 4`；選擇 `1 4 3 2`；插入 `1 3 4 2`',
      ],
      answer: 2, explanation: '氣泡第一輪：4 和 3 換、4 和 1 換、4 和 2 換，最大值 4 被推到最後：`3 1 2 4`。選擇第一輪：找到最小值 1（索引 2），和 a[0] = 4 交換：`1 3 4 2`。插入第一輪：key = 3，4 > 3 往右搬，3 放到索引 0：`3 4 1 2`（只有前兩個排好）。「氣泡 `1 3 4 2`」誤以為氣泡排序把最小值移到前面；「選擇 `1 4 3 2`」是「一比就換」的寫法；「氣泡 `3 4 1 2`」只做了第一次比較。以程式實際跑過三種排序的第一輪確認。',
    },
    {
      id: 'q-selection-count', prompt: '下面的選擇排序對已經排好的 6 個數執行，會印出什麼？',
      code: { language: 'Python', text: code`a = [1, 2, 3, 4, 5, 6]
compares = swaps = 0
for i in range(len(a) - 1):
    m = i
    for j in range(i + 1, len(a)):
        compares += 1
        if a[j] < a[m]:
            m = j
    if m != i:
        a[i], a[m] = a[m], a[i]
        swaps += 1
print(compares, swaps)` },
      options: ['5 0', '15 0', '15 5', '36 0'],
      answer: 1, explanation: '選擇排序不管輸入是否已排好，都要看完未排序段才能確定最小值：5 + 4 + 3 + 2 + 1 = 15 = 6 × 5 / 2 次比較。每輪最小值都已經在 a[i]（`m == i`），所以不交換，`swaps` 是 0。「5 0」是插入排序或提早結束的氣泡排序在已排序輸入上的比較次數；「15 5」忽略了 `if m != i`；「36 0」把比較算成 n²。',
    },
    {
      id: 'q-stable', prompt: '依本課的寫法：氣泡排序在 `a[j] > a[j + 1]` 時才交換、選擇排序找最小值用 `<` 並與 a[i] 交換、插入排序在 `a[j] > key` 時才往右搬。以紀錄的某個欄位當鍵排序時，哪些是穩定排序？',
      options: ['三種都穩定', '只有插入排序', '氣泡排序與插入排序', '只有選擇排序'],
      answer: 2, explanation: '氣泡排序只交換相鄰且「嚴格大於」的兩個元素，相等的元素不會互相越過；插入排序遇到相等的值就停下，key 不會跑到它前面——兩者都穩定。選擇排序的交換是遠距離的：`(2,a) (2,b) (1,c)` 中 `(1,c)` 和 `(2,a)` 對調後變成 `(1,c) (2,b) (2,a)`，同分的 a、b 順序反了，所以不穩定。以三千組隨機小紀錄陣列，與 Python 的穩定 `sorted` 結果比對確認（選擇排序有不一致、另兩者沒有）。',
    },
    {
      id: 'q-insertion-best', prompt: '插入排序（`while j >= 0 and a[j] > key`）對已經由小到大排好的 1000 個不同整數執行，`a[j] > key` 這個比較總共做幾次？',
      options: ['0', '999', '1000', '499500'],
      answer: 1, explanation: 'i 從 1 到 999，每個 key 只和左邊鄰居比一次：`a[i − 1] > key` 不成立就停下，共 999 = n − 1 次，這是插入排序的最佳情況 O(n)。「0」忘了每輪至少要比一次才知道該停；「1000」把 i = 0 也算進去，但第一個元素不必插入；「499500 = 1000 × 999 / 2」是反序輸入的最差情況。以計數程式實際跑過確認。',
    },
    {
      id: 'q-bug', prompt: '下面的氣泡排序執行 `bubble([3, 1, 2])` 會怎樣？',
      code: { language: 'Python', text: code`def bubble(a):
    n = len(a)
    for i in range(n - 1):
        for j in range(n - i):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]` },
      options: ['正常排好成 `[1, 2, 3]`', '丟出 `IndexError`：第一輪 j 到 n − 1 時讀 `a[n]`', '排成由大到小 `[3, 2, 1]`', '最後一個元素沒有排到，得到 `[1, 3, 2]`'],
      answer: 1, explanation: '內層迴圈要讀 `a[j + 1]`，所以 j 最多只能到 n − 2 − i，正確寫法是 `range(n - 1 - i)`。這裡第一輪 i = 0，j 會跑到 n − 1 = 2，讀 `a[3]`，Python 丟出 `IndexError: list index out of range`。它不會「剛好排好」：前兩次比較已經把 3 推到最後，第三次比較就越界了。在 C++ 中同樣的錯誤是未定義行為，可能不報錯而讀到垃圾值，更難發現。實際執行確認。',
    },
    {
      id: 'q-choose', prompt: '有 10^5 筆已經由小到大排好的成績，後面又接上 10 筆新成績（任意值），要把全部 10^5 + 10 筆重新排好，而且只能在這三種基本排序中選一種。哪一種最適合？',
      options: ['選擇排序：交換最多 n − 1 次，搬動最少', '有提早結束的氣泡排序：資料幾乎排好，一兩輪就會停', '三種都是 O(n²)，選哪一種都一樣快', '插入排序'],
      answer: 3, explanation: '插入排序的工作量約是 n 加上逆序數：前 10^5 筆每筆只比較一次，新加入的 10 筆每筆最多往左搬 10^5 格，合計約 10^6 次，很快。選擇排序固定 n(n − 1)/2 ≈ 5 × 10^9 次比較。氣泡排序每一輪只能把一個小值往左移一格，若新成績中有很小的值，要跑將近 n 輪才停，也是 O(n²)；「一兩輪就停」只在每個元素都離最終位置很近時成立。以 n = 5000 加 10 筆隨機值實測：插入排序約 2.8 × 10^4 次比較，氣泡與選擇排序都超過 1.2 × 10^7 次。',
    },
  ],
  exercises: [
    {
      id: 'e-rank-students', title: '成績排行榜：分數由高到低、同分依姓名',
      statement: '給 n 位學生的姓名與分數，請輸出排行榜：分數高的在前；分數相同時，姓名依字典順序由小到大（逐字比較字母 a–z，較短的字串若是較長字串的開頭，較短的在前，例如 `al` 在 `alice` 前面）。姓名與分數都相同的紀錄可能出現多次，照樣全部輸出。n 最大 10^5，請使用語言內建的排序並寫對比較規則。輸入有任何不合法之處時，只輸出一行 `Invalid`：第一行不是剛好一個 1 到 10^5 的整數、學生資料少於 n 行、某行不是剛好兩個欄位、姓名不是 1 到 20 個小寫英文字母、分數不是 0 到 100 的整數（只能由數字 0–9 組成，不含正負號）。',
      inputFormat: '第一行是 n。接下來 n 行，每行是 `name score`，以空白分隔。n 行之後若還有內容，忽略不看。',
      outputFormat: '共 n 行，依排行順序每行輸出 `name score`（分數輸出為整數）；或只有一行 `Invalid`。',
      constraints: [
        '1 ≤ n ≤ 10^5',
        '姓名：1 到 20 個小寫英文字母 a–z，可以重複',
        '分數：0 到 100 的整數',
      ],
      samples: [
        { kind: 'normal', input: '5\nbob 90\namy 85\ncat 90\ndan 85\neve 95', output: 'eve 95\nbob 90\ncat 90\namy 85\ndan 85', note: '90 分的 bob、cat 與 85 分的 amy、dan 都依姓名排' },
      ],
      tests: [
        { kind: 'normal', input: '5\nbob 90\namy 85\ncat 90\ndan 85\neve 95', output: 'eve 95\nbob 90\ncat 90\namy 85\ndan 85', note: '範例' },
        { kind: 'normal', input: '8\nzoe 70\nal 70\nalice 70\nalex 100\nbo 0\nal 70\nmia 100\nann 0', output: 'alex 100\nmia 100\nal 70\nal 70\nalice 70\nzoe 70\nann 0\nbo 0', note: '前綴姓名 `al` 在 `alex`、`alice` 前面；重複的紀錄 `al 70` 兩筆都要輸出' },
        { kind: 'normal', input: '6\nfay 60\neli 80\ndon 60\ncal 80\nbea 60\nada 80', output: 'ada 80\ncal 80\neli 80\nbea 60\ndon 60\nfay 60', note: '同分者在輸入中是姓名由大到小：只依分數排（保持輸入順序）或把（分數, 姓名）整組反轉都會錯' },
        { kind: 'normal', input: bigInput, output: bigOutput, note: `${BIG} 筆、姓名與分數大量重複的最大資料：O(n²) 的排序會超時，Java 需要 BufferedReader 與 StringBuilder` },
        { kind: 'edge', input: '1\nx 50', output: 'x 50', note: '只有一位學生' },
        { kind: 'edge', input: '4\ndd 77\ncc 77\nbb 77\naa 77', output: 'aa 77\nbb 77\ncc 77\ndd 77', note: '全部同分：完全由姓名決定順序' },
        { kind: 'edge', input: '4\nann 100\nbob 90\ncat 90\ndan 0', output: 'ann 100\nbob 90\ncat 90\ndan 0', note: '輸入已經是排行順序' },
        { kind: 'edge', input: '4\nd 0\nc 1\nb 2\na 3', output: 'a 3\nb 2\nc 1\nd 0', note: '分數由低到高、姓名由大到小：完全反序' },
        { kind: 'edge', input: '3\nabcdefghijklmnopqrst 100\nz 0\nabcdefghijklmnopqrss 100', output: 'abcdefghijklmnopqrss 100\nabcdefghijklmnopqrst 100\nz 0', note: '分數邊界 0 與 100、姓名長度上限 20，只差最後一個字母' },
        { kind: 'error', input: '2\nann 101\nbob 5', output: 'Invalid', note: '分數 101 超出範圍' },
        { kind: 'error', input: '2\nann -5\nbob 5', output: 'Invalid', note: '分數不能是負數（也不能有正負號）' },
        { kind: 'error', input: '2\nann 9x\nbob 5', output: 'Invalid', note: '分數不是整數' },
        { kind: 'error', input: '2\nann\nbob 5', output: 'Invalid', note: '少了分數欄位' },
        { kind: 'error', input: '2\nann 85 3\nbob 5', output: 'Invalid', note: '多了一個欄位' },
        { kind: 'error', input: '2\nAmy 85\nbob 5', output: 'Invalid', note: '姓名有大寫字母' },
        { kind: 'error', input: '1\nabcdefghijklmnopqrstu 50', output: 'Invalid', note: '姓名 21 個字母，超過 20' },
        { kind: 'error', input: '3\nann 85\nbob 5', output: 'Invalid', note: 'n = 3 但只有兩行資料' },
        { kind: 'error', input: '0', output: 'Invalid', note: 'n = 0 不在 1..10^5' },
        { kind: 'error', input: 'two\nann 85', output: 'Invalid', note: '第一行不是整數' },
      ],
      hints: [
        '先讀完並檢查全部 n 行，確定都合法後才排序與輸出；中途發現錯誤就只輸出 `Invalid`。',
        '一次寫好比較規則：先比分數（大的在前），分數不同就決定了；分數相同才比姓名（小的在前）。Python 可以用 `key=lambda s: (-s[1], s[0])`。',
        'C++ 的比較函式只能用 `>`、`<`，不能用 `>=`、`<=`；Java 用 `Comparator.comparingInt(...).reversed().thenComparing(...)` 或 `Integer.compare`，不要用減法。',
        '也可以分兩次排：先依姓名排，再用穩定排序依分數由高到低排（C++ 第二次要用 `std::stable_sort`）。',
        '輸出 10^5 行時，把結果組成一個字串再一次印出（Java 用 StringBuilder）。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

struct Student {
    std::string name;
    int score;
};

bool isName(const std::string& s) {
    if (s.empty() || s.size() > 20) return false;
    for (char ch : s)
        if (ch < 'a' || ch > 'z') return false;
    return true;
}

// The value of a string of 1..maxLen digits, or -1 if it is not one.
int toNumber(const std::string& s, std::size_t maxLen) {
    if (s.empty() || s.size() > maxLen) return -1;
    int v = 0;
    for (char ch : s) {
        if (ch < '0' || ch > '9') return -1;
        v = v * 10 + (ch - '0');
    }
    return v;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::string line, token, extra;
    int n = -1;
    if (std::getline(std::cin, line)) {
        std::istringstream first(line);
        if ((first >> token) && !(first >> extra)) n = toNumber(token, 6);
    }
    if (n < 1 || n > 100000) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<Student> students;
    students.reserve(n);
    for (int k = 0; k < n; k++) {
        std::string name, score, more;
        bool ok = static_cast<bool>(std::getline(std::cin, line));
        if (ok) {
            std::istringstream in(line);
            ok = (in >> name >> score) && !(in >> more);
        }
        int value = ok ? toNumber(score, 3) : -1;
        if (!ok || !isName(name) || value < 0 || value > 100) {
            std::cout << "Invalid\n";
            return 0;
        }
        students.push_back({name, value});
    }
    std::sort(students.begin(), students.end(), [](const Student& x, const Student& y) {
        if (x.score != y.score) return x.score > y.score;
        return x.name < y.name;
    });
    std::string out;
    for (const Student& s : students) out += s.name + ' ' + std::to_string(s.score) + '\n';
    std::cout << out;
}`,
        Python: code`import sys


def is_name(s):
    return 1 <= len(s) <= 20 and all("a" <= ch <= "z" for ch in s)


def to_number(s, max_len):
    if not 1 <= len(s) <= max_len or not all("0" <= ch <= "9" for ch in s):
        return -1
    return int(s)


def solve(lines):
    first = lines[0].split()
    n = to_number(first[0], 6) if len(first) == 1 else -1
    if not 1 <= n <= 100000 or len(lines) < n + 1:
        return None
    students = []
    for line in lines[1:n + 1]:
        parts = line.split()
        if len(parts) != 2:
            return None
        name, score = parts[0], to_number(parts[1], 3)
        if not is_name(name) or not 0 <= score <= 100:
            return None
        students.append((name, score))
    students.sort(key=lambda s: (-s[1], s[0]))
    return "\n".join(f"{name} {score}" for name, score in students)


result = solve(sys.stdin.read().split("\n"))
print("Invalid" if result is None else result)`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class Main {
    record Student(String name, int score) {}

    static boolean isName(String s) {
        if (s.isEmpty() || s.length() > 20) return false;
        for (int i = 0; i < s.length(); i++)
            if (s.charAt(i) < 'a' || s.charAt(i) > 'z') return false;
        return true;
    }

    // The value of a string of 1..maxLen digits, or -1 if it is not one.
    static int toNumber(String s, int maxLen) {
        if (s.isEmpty() || s.length() > maxLen) return -1;
        int v = 0;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch < '0' || ch > '9') return -1;
            v = v * 10 + (ch - '0');
        }
        return v;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line = in.readLine();
        int n = -1;
        if (line != null) {
            String[] first = line.trim().split("\\s+");
            if (first.length == 1) n = toNumber(first[0], 6);
        }
        if (n < 1 || n > 100000) {
            System.out.println("Invalid");
            return;
        }
        List<Student> students = new ArrayList<>(n);
        for (int k = 0; k < n; k++) {
            line = in.readLine();
            String[] parts = line == null ? new String[0] : line.trim().split("\\s+");
            int value = parts.length == 2 ? toNumber(parts[1], 3) : -1;
            if (parts.length != 2 || !isName(parts[0]) || value < 0 || value > 100) {
                System.out.println("Invalid");
                return;
            }
            students.add(new Student(parts[0], value));
        }
        students.sort(Comparator.comparingInt(Student::score).reversed().thenComparing(Student::name));
        StringBuilder sb = new StringBuilder();
        for (Student s : students) sb.append(s.name()).append(' ').append(s.score()).append('\n');
        System.out.print(sb);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

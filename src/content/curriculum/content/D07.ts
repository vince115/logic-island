import type { LessonContent } from '../schema';
import { containerSteps, type ContainerOp } from '../simulate';

const code = String.raw;

/** The trace's array and window size; the trace code below spells out the same values. */
const A = [1, 3, -1, -3, 5, 3, 6, 7];
const K = 3;

/**
 * Runs the monotonic-deque sliding-window maximum on A and records every deque operation it really performs (with the
 * line of the trace code it belongs to), the current i, the window maxima so far and why the operation happens.
 * The deque stores indices, so the steps can never disagree with the algorithm.
 */
function windowMaxOps(): { op: ContainerOp; i: number; out: number[]; why: string }[] {
  const ops: { op: ContainerOp; i: number; out: number[]; why: string }[] = [];
  const dq: number[] = [];
  const out: number[] = [];
  for (let i = 0; i < A.length; i++) {
    if (dq.length && dq[0] <= i - K) {
      const j = dq.shift()!;
      ops.push({ op: { op: 'pop_front', line: 8 }, i, out: [...out], why: `（Python 的 \`dq.popleft()\`）索引 ${j} ≤ i − k = ${i - K}，已經不在目前的視窗 [${i - K + 1}, ${i}] 裡，所以從前端丟掉。` });
    }
    while (dq.length && A[dq.at(-1)!] <= A[i]) {
      const j = dq.pop()!;
      ops.push({ op: { op: 'pop_back', line: 10 }, i, out: [...out], why: `（Python 的 \`dq.pop()\`）尾端索引 ${j} 的值 a[${j}] = ${A[j]} ≤ a[${i}] = ${A[i]}。a[${i}] 比它晚離開視窗，又不比它小，所以 a[${j}] 以後不可能再當最大值，直接丟掉。` });
    }
    dq.push(i);
    const full = i >= K - 1;
    ops.push({ op: { op: 'push_back', value: String(i), line: 11 }, i, out: [...out], why: `（Python 的 \`dq.append(i)\`）放入的是索引 ${i}（值 ${A[i]}）。${dq.length === 1 ? '現在 dq 只有它一個。' : `現在 dq 對應的值由前往後是 ${dq.map(j => A[j]).join(' > ')}，仍然遞減。`}${full ? '' : `視窗還不到 k = ${K} 個元素，先不輸出。`}` });
    if (full) {
      out.push(A[dq[0]]);
      ops.push({ op: { op: 'front', line: 13 }, i, out: [...out], why: `（Python 的 \`dq[0]\`）視窗 [${i - K + 1}, ${i}] 已滿 k 個元素。前端索引 ${dq[0]} 的值 ${A[dq[0]]} 是 dq 裡最大的，也就是這個視窗的最大值，加進 out。` });
    }
  }
  return ops;
}
const traceOps = windowMaxOps();
const countOps = (kind: ContainerOp['op']) => traceOps.filter(t => t.op.op === kind).length;

/**
 * D07 Deque. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); no built-in deque, so a small ring-buffer `Deque` class where push_front
 * is needed, otherwise an array plus a head index.
 */
export const D07: LessonContent = {
  lessonId: 'D07',
  motivation: '堆疊只能動一端，佇列只能一端進、另一端出；有些問題需要兩端都能操作：檢查回文要同時從頭和尾往中間比對，排程系統要把緊急工作插到最前面，「滑動視窗最大值」要從前端丟掉過期的資料、從尾端丟掉沒用的資料。雙端佇列（deque，double-ended queue，讀作「deck」）在兩端放入和取出都是 O(1)，一個結構就能當堆疊也能當佇列。它的限制是：中間的插入與刪除仍是 O(n)，而且 C++、Python、Java 的 deque 能不能用索引讀中間元素、讀得多快，差異很大（JavaScript 則根本沒有內建的 deque）。',
  sections: [
    {
      id: 'two-ends', title: '兩端都能進出：deque 的操作',
      blocks: [
        { type: 'p', text: '把 deque 想成一條兩頭都開口的隊伍：前端（front）和尾端（back）都可以加人、也都可以讓人離開。它的基本操作有六個：' },
        { type: 'list', items: [
          '`push_front(x)`／`push_back(x)`：把 x 放到前端／尾端。',
          '`pop_front()`／`pop_back()`：移除前端／尾端的元素。',
          '`front()`／`back()`：讀取前端／尾端的元素，但不移除。',
          '另外還有 `empty()`（是否為空）與 `size()`（元素個數）。',
        ] },
        { type: 'p', text: '這些操作都只碰兩端，不需要移動其他元素，所以都是 O(1)（Java `ArrayDeque` 的放入是攤銷 O(1)：底層陣列偶爾要擴容）。下面的程式先從尾端放 1、2，再從前端放 0、-1，然後兩端各移除一個。頁面中「自己試試」的 deque 實驗可以用自己的數字操作兩端。' },
        { type: 'example', id: 'both-ends' },
        { type: 'table', head: ['操作', 'C++ `std::deque`', 'Python `collections.deque`', 'Java `ArrayDeque`', 'JavaScript 陣列（沒有內建 deque）'], rows: [
          ['尾端放入', '`push_back(x)`，O(1)', '`append(x)`，O(1)', '`offerLast(x)`／`addLast(x)`，攤銷 O(1)', '`push(x)`，攤銷 O(1)'],
          ['前端放入', '`push_front(x)`，O(1)', '`appendleft(x)`，O(1)', '`offerFirst(x)`／`addFirst(x)`，攤銷 O(1)', '`unshift(x)`，O(n)；要 O(1) 得自己寫環狀陣列'],
          ['尾端移除', '`pop_back()`，O(1)，不回傳值', '`pop()`，O(1)，回傳該值', '`pollLast()`／`removeLast()`，O(1)，回傳該值', '`pop()`，O(1)，回傳該值'],
          ['前端移除', '`pop_front()`，O(1)，不回傳值', '`popleft()`，O(1)，回傳該值', '`pollFirst()`／`removeFirst()`，O(1)，回傳該值', '`shift()`，O(n)；改用 head 索引 `d[head++]`，O(1)'],
          ['讀取兩端', '`front()`、`back()`，O(1)', '`d[0]`、`d[-1]`，O(1)', '`peekFirst()`、`peekLast()`，O(1)', '`d[0]`、`d[d.length - 1]`，O(1)'],
          ['用索引讀第 i 個', '`d[i]`，O(1)', '`d[i]`，兩端附近快，中間 O(n)', '不支援', '`d[i]`，O(1)'],
          ['在中間插入／刪除', '`insert`／`erase`，O(n)', '`insert(i, x)`／`del d[i]`，O(n)', '不支援索引；`removeFirstOccurrence(x)` 是 O(n)', '`splice`，O(n)'],
        ] },
      ],
    },
    {
      id: 'stack-or-queue', title: '一個 deque，當堆疊也當佇列',
      blocks: [
        { type: 'p', text: '只用尾端放入、尾端取出（`push_back` + `pop_back`），deque 就是堆疊（後進先出）；尾端放入、前端取出（`push_back` + `pop_front`），它就是佇列（先進先出）。這也是為什麼 C++ 的 `std::stack` 與 `std::queue` 預設底層都是 `std::deque`，Java 的 `ArrayDeque` 同時被推薦當堆疊和佇列用。JavaScript 沒有 deque，範例用陣列當堆疊、陣列加 head 索引當佇列。下面把 1、2、3 放進兩個 deque，一個從尾端取、一個從前端取：' },
        { type: 'example', id: 'stack-and-queue' },
        { type: 'p', text: '兩端都能取出，還能解決「從兩頭往中間」的問題。檢查回文（palindrome，正著讀和倒著讀一樣的字串）時，把字元全部放進 deque，每次比較前端與尾端，相同就兩端各移除一個，直到剩下不到兩個字元：' },
        { type: 'example', id: 'palindrome' },
        { type: 'callout', tone: 'tip', title: 'Java：先取出成 char 再比較', text: 'Java 版本寫成 `char a = d.pollFirst(); char b = d.pollLast();`，把 `Character` 物件拆箱成基本型別 `char` 再用 `!=` 比較。如果直接寫 `d.pollFirst() != d.pollLast()`，比較的是兩個物件的參考（reference），不是字元的值；它對常見字元剛好能用（Java 會快取 0～127 的 `Character`），換成其他字元就可能出錯。比較包裝類別的值，要拆箱或用 `equals`。' },
        { type: 'table', head: ['', '堆疊 Stack', '佇列 Queue', '雙端佇列 Deque', '動態陣列'], rows: [
          ['放入', '頂端 O(1)', '尾端 O(1)', '兩端都 O(1)', '尾端攤銷 O(1)；前端 O(n)'],
          ['取出', '頂端 O(1)', '前端 O(1)', '兩端都 O(1)', '尾端 O(1)；前端 O(n)'],
          ['用索引讀第 i 個', '不提供', '不提供', 'C++ O(1)；Python 中間 O(n)；Java 不支援', 'O(1)'],
          ['典型用途', '復原、括號配對、DFS', '排隊模擬、BFS', '回文、滑動視窗、兩端都要進出的排程', '需要大量隨機存取的資料'],
          ['C++／Python／Java', '`std::stack`／`list`／`ArrayDeque`', '`std::queue`／`deque`／`ArrayDeque`', '`std::deque`／`deque`／`ArrayDeque`', '`std::vector`／`list`／`ArrayList`'],
          ['JavaScript', '陣列的 `push`／`pop`', '陣列 + head 索引', '沒有內建，自己寫環狀陣列', '陣列（`Array`）'],
        ] },
        { type: 'p', text: '選擇的原則：只需要一端，就用堆疊或佇列，介面小、不容易用錯；兩端都要放入或取出，才用 deque；主要是用索引讀寫、只在尾端增減，用動態陣列。' },
      ],
    },
    {
      id: 'languages', title: '四種語言的 deque',
      blocks: [
        { type: 'p', text: 'C++ `std::deque`：底層是分段儲存（chunked storage），由許多固定大小的區塊加上一張記錄區塊位置的索引表組成，不是一整塊連續記憶體。所以它兩端放入是 O(1)，`d[i]` 也是 O(1)（先算出在第幾個區塊、再算區塊內的位置），但不能像 `vector` 一樣拿 `&d[0]` 當連續陣列用。在中間 `insert`／`erase` 要移動較靠近那一端的所有元素，是 O(n)。' },
        { type: 'p', text: 'C++ 的迭代器失效（iterator invalidation）規則：`push_front`／`push_back` 會讓所有迭代器失效，但指向現有元素的參考與指標仍然有效（元素沒有被搬動，只是索引表可能重新配置）；`pop_front`／`pop_back` 只讓指向被移除元素的迭代器與參考失效（`pop_back` 另外會讓 `end()` 失效）；在中間插入則讓所有迭代器與參考都失效。所以不要一邊用迭代器走訪 deque、一邊在兩端放入元素。' },
        { type: 'p', text: 'Python `collections.deque`：要先 `from collections import deque`。`append`／`appendleft`／`pop`／`popleft` 都是 O(1)；`d[0]` 與 `d[-1]` 是 O(1)，但官方文件說明索引存取越靠近中間越慢，中間是 O(n)。建立時可以給 `maxlen`，變成有上限的 deque：滿了之後再從一端加入，另一端的元素會自動被丟掉，很適合「只保留最近 N 筆」的紀錄。' },
        { type: 'p', text: 'Java `ArrayDeque`：用環狀陣列實作，宣告成 `Deque<Integer> d = new ArrayDeque<>();`。前端是 `offerFirst`／`pollFirst`／`peekFirst`，尾端是 `offerLast`／`pollLast`／`peekLast`。它不能放 `null`（`add(null)`、`offerLast(null)` 都丟出 `NullPointerException`），因為它用 `null` 表示「沒有元素」；它也沒有 `get(i)`，不能用索引讀中間。`LinkedList` 同樣實作了 `Deque` 介面，允許 `null`，也能 `get(i)`（但那是 O(n)，要從頭或尾一路走過去）；Java 官方文件指出 `ArrayDeque` 當佇列用時通常比 `LinkedList` 快，所以它是 Java 中 deque 的首選。' },
        { type: 'p', text: 'JavaScript：標準函式庫沒有 deque。陣列的 `push`／`pop` 在尾端是 O(1)，但 `unshift`／`shift` 在前端要搬動所有元素，是 O(n)。本課的 JavaScript 範例分兩種情況：只需要從前端移除時（回文、滑動視窗），用陣列加一個 head 索引，`d[head++]` 就是 O(1) 的 pop_front；需要從前端放入時（第一個範例），就像 D06 的環狀佇列一樣自己寫一個環狀陣列的 `Deque` 類別，放滿時擴成兩倍。' },
        { type: 'callout', tone: 'note', title: 'Java 的兩組方法：回傳特殊值或丟出例外', text: '`Deque` 每個動作都有兩個版本。空的時候，`pollFirst()`／`pollLast()`／`peekFirst()`／`peekLast()` 回傳 `null`；`removeFirst()`／`removeLast()`／`getFirst()`／`getLast()` 丟出 `NoSuchElementException`。`offerFirst`／`offerLast` 回傳 boolean，`addFirst`／`addLast` 失敗時丟出例外；對沒有容量上限的 `ArrayDeque` 來說兩者效果一樣。另外 `push`／`pop`／`peek` 等同 `addFirst`／`removeFirst`／`peekFirst`，作用在前端。' },
      ],
    },
    {
      id: 'pitfalls', title: '常見錯誤：空 deque、弄錯端、索引走訪',
      blocks: [
        { type: 'p', text: '和堆疊、佇列一樣，對空 deque 移除或讀取兩端會出問題，而且四種語言的反應不同：' },
        { type: 'table', head: ['語言', '空 deque 上移除', '空 deque 上讀取兩端'], rows: [
          ['C++ `std::deque`', '`pop_front()`／`pop_back()` 是未定義行為（undefined behavior）', '`front()`／`back()` 也是未定義行為'],
          ['Python `collections.deque`', '`popleft()`／`pop()` 丟出 `IndexError`', '`d[0]`／`d[-1]` 丟出 `IndexError`'],
          ['Java `ArrayDeque`', '`pollFirst()` 回傳 `null`；`removeFirst()` 丟出 `NoSuchElementException`', '`peekFirst()` 回傳 `null`；`getFirst()` 丟出 `NoSuchElementException`'],
          ['JavaScript 陣列', '`pop()`／`shift()` 回傳 `undefined`，不丟出例外；`d[head++]` 還會讓 head 越過尾端', '`d[0]`／`d[d.length - 1]` 是 `undefined`'],
        ] },
        { type: 'callout', tone: 'warning', title: '先檢查是否為空，再確認你動的是哪一端', text: 'C++ 的未定義行為不一定當掉，可能讀到垃圾值還繼續執行，最難除錯。Java 的 `pollFirst()` 雖然不丟例外，但 `int x = d.pollFirst();` 在空 deque 上會因為把 `null` 自動拆箱（unboxing）成 int 而丟出 `NullPointerException`。第二個常見錯誤是弄錯端：Python 的 `pop()` 移除的是尾端（右邊），前端要用 `popleft()`；Java 的 `push`／`pop` 作用在前端，和 `offerLast` 混用時，堆疊的「頂端」其實是 deque 的前端。每次寫兩端操作時，先在註解寫清楚哪一端代表什麼。' },
        { type: 'p', text: '第三個陷阱只在 Python：`for i in range(len(d)): print(d[i])` 看起來是 O(n)，但 deque 中間的索引存取是 O(n)，整個迴圈變成 O(n²)，n = 10^5 時會非常慢。要走訪全部元素，直接寫 `for x in d:`（O(n)）；需要大量隨機存取時，改用 `list`。C++ 的 `d[i]` 與 JavaScript 陣列的 `d[i]` 都是 O(1)，沒有這個問題；Java 的 `ArrayDeque` 則根本不能用索引，只能用 for-each 走訪。' },
        { type: 'p', text: '反過來，用 Python `list` 當佇列也是常見錯誤：`list.pop(0)` 與 `list.insert(0, x)` 要把後面所有元素移動一格，是 O(n)；需要從前端移除時，用 `deque.popleft()`。JavaScript 陣列的 `shift()` 與 `unshift(x)` 也一樣是 O(n)，前端移除改用 head 索引。' },
      ],
    },
    {
      id: 'monotonic', title: '單調佇列：滑動視窗最大值',
      blocks: [
        { type: 'p', text: '問題：給一個長度 n 的陣列 a 和視窗大小 k，對每個連續 k 個元素的視窗 [i − k + 1, i]，求視窗內的最大值。例如 a = [1, 3, -1, -3, 5, 3, 6, 7]、k = 3，六個視窗的最大值是 3 3 5 5 6 7。暴力解每個視窗都掃 k 個元素，總共 O(nk)；n = 2×10^5、k = 10^5 時大約要 10^10 次比較，太慢了。' },
        { type: 'p', text: '單調佇列（monotonic deque）的想法：deque 裡存索引，並維持它們對應的值由前往後嚴格遞減。處理 a[i] 時做三件事：' },
        { type: 'list', ordered: true, items: [
          '前端的索引若 ≤ i − k，表示它已經離開視窗，從前端移除（`pop_front`）。',
          '尾端的值若 ≤ a[i]，從尾端移除（`pop_back`），重複直到尾端比 a[i] 大或 deque 變空。理由：a[i] 比它晚進來、也比它晚離開視窗，又不比它小，所以它以後永遠不可能是最大值。',
          '把 i 放到尾端（`push_back`）；若 i ≥ k − 1（視窗已滿），前端索引的值就是這個視窗的最大值。',
        ] },
        { type: 'example', id: 'window-max' },
        { type: 'p', text: '為什麼總共是 O(n)？內層的 while 迴圈某一次可能 pop 很多個，看起來像 O(k)；但每個索引只會被 push 一次，被 pop（不論從前端或尾端）最多一次。所以整個程式所有 push 加上所有 pop 最多 2n 次，總時間 O(n)，平均每個元素 O(1)，這就是攤銷分析（amortized analysis）。下方的視覺化逐步追蹤這個例子，可以看到每個索引進出 deque 各一次。' },
        { type: 'p', text: '為什麼存索引而不是值？因為判斷「是否已經離開視窗」需要知道元素的位置。只存值時，遇到重複的值就分不清前端那個是不是已經過期。若要求的是最小值，把比較反過來（尾端的值 ≥ a[i] 就移除），deque 的值改為遞增即可。' },
      ],
    },
  ],
  examples: [
    {
      id: 'both-ends', title: '兩端放入與移除', description: '從尾端放 1、2，從前端放 0、-1，讀兩端，再兩端各移除一個。各語言都自己把元素用空白串起來輸出，格式才會一致；JavaScript 沒有內建 deque，用自己寫的環狀陣列。',
      output: 'deque: -1 0 1 2\nfront: -1 back: 2\nafter pop_front and pop_back: 0 1\nsize: 2',
      code: {
        'C++': code`#include <deque>
#include <iostream>

void print(const std::deque<int>& d) {
    for (std::size_t i = 0; i < d.size(); ++i) std::cout << (i ? " " : "") << d[i];
    std::cout << "\n";
}

int main() {
    std::deque<int> d;
    d.push_back(1);
    d.push_back(2);
    d.push_front(0);
    d.push_front(-1);
    std::cout << "deque: ";
    print(d);
    std::cout << "front: " << d.front() << " back: " << d.back() << "\n";
    d.pop_front();
    d.pop_back();
    std::cout << "after pop_front and pop_back: ";
    print(d);
    std::cout << "size: " << d.size() << "\n";
    return 0;
}`,
        Python: code`from collections import deque

d = deque()
d.append(1)
d.append(2)
d.appendleft(0)
d.appendleft(-1)
print("deque:", *d)
print("front:", d[0], "back:", d[-1])
d.popleft()
d.pop()
print("after pop_front and pop_back:", *d)
print("size:", len(d))`,
        Java: code`import java.util.ArrayDeque;
import java.util.Deque;
import java.util.StringJoiner;

public class Main {
    static String join(Deque<Integer> d) {
        StringJoiner sj = new StringJoiner(" ");
        for (int x : d) sj.add(String.valueOf(x));
        return sj.toString();
    }

    public static void main(String[] args) {
        Deque<Integer> d = new ArrayDeque<>();
        d.offerLast(1);
        d.offerLast(2);
        d.offerFirst(0);
        d.offerFirst(-1);
        System.out.println("deque: " + join(d));
        System.out.println("front: " + d.peekFirst() + " back: " + d.peekLast());
        d.pollFirst();
        d.pollLast();
        System.out.println("after pop_front and pop_back: " + join(d));
        System.out.println("size: " + d.size());
    }
}`,
        JavaScript: code`// JavaScript 沒有內建的 deque：用環狀陣列自己寫一個（D06 的環狀佇列再加上前端放入），滿了就擴成兩倍
class Deque {
    constructor() {
        this.a = new Array(2);
        this.head = 0;
        this.size = 0;
    }

    get(i) {  // 邏輯上的第 i 個，0 是前端
        return this.a[(this.head + i) % this.a.length];
    }

    grow() {
        const b = new Array(this.a.length * 2);
        for (let i = 0; i < this.size; i++) b[i] = this.get(i);
        this.a = b;
        this.head = 0;
    }

    pushBack(x) {
        if (this.size === this.a.length) this.grow();
        this.a[(this.head + this.size) % this.a.length] = x;
        this.size++;
    }

    pushFront(x) {
        if (this.size === this.a.length) this.grow();
        this.head = (this.head - 1 + this.a.length) % this.a.length;
        this.a[this.head] = x;
        this.size++;
    }

    popFront() {  // 呼叫前要先確認 size > 0
        const x = this.a[this.head];
        this.head = (this.head + 1) % this.a.length;
        this.size--;
        return x;
    }

    popBack() {  // 呼叫前要先確認 size > 0
        this.size--;
        return this.get(this.size);
    }

    toArray() {
        return Array.from({ length: this.size }, (_, i) => this.get(i));
    }
}

const d = new Deque();
d.pushBack(1);
d.pushBack(2);
d.pushFront(0);
d.pushFront(-1);
console.log("deque:", d.toArray().join(" "));
console.log("front:", d.get(0), "back:", d.get(d.size - 1));
d.popFront();
d.popBack();
console.log("after pop_front and pop_back:", d.toArray().join(" "));
console.log("size:", d.size);`,
      },
    },
    {
      id: 'stack-and-queue', title: '同一種 deque，當堆疊與佇列', description: '兩個 deque 都依序放入 1、2、3：從尾端取出得到後進先出，從前端取出得到先進先出。',
      output: 'as stack: 3 2 1\nas queue: 1 2 3',
      code: {
        'C++': code`#include <deque>
#include <iostream>

int main() {
    std::deque<int> stack, queue;
    for (int x : {1, 2, 3}) {
        stack.push_back(x);
        queue.push_back(x);
    }
    std::cout << "as stack:";
    while (!stack.empty()) {
        std::cout << " " << stack.back();
        stack.pop_back();
    }
    std::cout << "\nas queue:";
    while (!queue.empty()) {
        std::cout << " " << queue.front();
        queue.pop_front();
    }
    std::cout << "\n";
    return 0;
}`,
        Python: code`from collections import deque

stack = deque()
queue = deque()
for x in [1, 2, 3]:
    stack.append(x)
    queue.append(x)
print("as stack:", *[stack.pop() for _ in range(3)])
print("as queue:", *[queue.popleft() for _ in range(3)])`,
        Java: code`import java.util.ArrayDeque;
import java.util.Deque;

public class Main {
    public static void main(String[] args) {
        Deque<Integer> stack = new ArrayDeque<>();
        Deque<Integer> queue = new ArrayDeque<>();
        for (int x : new int[] {1, 2, 3}) {
            stack.offerLast(x);
            queue.offerLast(x);
        }
        StringBuilder s = new StringBuilder("as stack:");
        while (!stack.isEmpty()) s.append(" ").append(stack.pollLast());
        StringBuilder q = new StringBuilder("as queue:");
        while (!queue.isEmpty()) q.append(" ").append(queue.pollFirst());
        System.out.println(s);
        System.out.println(q);
    }
}`,
        JavaScript: code`// JavaScript 沒有內建的 deque。陣列的 push／pop 都在尾端，就是堆疊；
// 再用一個 head 索引從前端取出，就是佇列
const stack = [];
const queue = [];
let head = 0;
for (const x of [1, 2, 3]) {
    stack.push(x);
    queue.push(x);
}
const s = [];
while (stack.length > 0) s.push(stack.pop());
const q = [];
while (head < queue.length) q.push(queue[head++]);
console.log("as stack:", s.join(" "));
console.log("as queue:", q.join(" "));`,
      },
    },
    {
      id: 'palindrome', title: '從兩端比對檢查回文', description: '把字元放進 deque，每次比較前端與尾端，相同就兩端各移除一個，直到剩下不到兩個字元。',
      output: 'racecar YES\nabba YES\ndeque NO\nx YES',
      code: {
        'C++': code`#include <deque>
#include <iostream>
#include <string>

bool isPalindrome(const std::string& s) {
    std::deque<char> d(s.begin(), s.end());
    while (d.size() > 1) {
        if (d.front() != d.back()) return false;
        d.pop_front();
        d.pop_back();
    }
    return true;
}

int main() {
    for (const char* s : {"racecar", "abba", "deque", "x"}) {
        std::cout << s << " " << (isPalindrome(s) ? "YES" : "NO") << "\n";
    }
    return 0;
}`,
        Python: code`from collections import deque


def is_palindrome(s):
    d = deque(s)
    while len(d) > 1:
        if d.popleft() != d.pop():
            return False
    return True


for s in ["racecar", "abba", "deque", "x"]:
    print(s, "YES" if is_palindrome(s) else "NO")`,
        Java: code`import java.util.ArrayDeque;
import java.util.Deque;

public class Main {
    static boolean isPalindrome(String s) {
        Deque<Character> d = new ArrayDeque<>();
        for (char c : s.toCharArray()) d.offerLast(c);
        while (d.size() > 1) {
            char a = d.pollFirst();
            char b = d.pollLast();
            if (a != b) return false;
        }
        return true;
    }

    public static void main(String[] args) {
        for (String s : new String[] {"racecar", "abba", "deque", "x"}) {
            System.out.println(s + " " + (isPalindrome(s) ? "YES" : "NO"));
        }
    }
}`,
        JavaScript: code`function isPalindrome(s) {
    const d = s.split("");  // 字元陣列：pop() 移除尾端，d[head++] 移除前端
    let head = 0;
    while (d.length - head > 1) {
        if (d[head++] !== d.pop()) return false;
    }
    return true;
}

for (const s of ["racecar", "abba", "deque", "x"]) {
    console.log(s, isPalindrome(s) ? "YES" : "NO");
}`,
      },
    },
    {
      id: 'window-max', title: '單調佇列求滑動視窗最大值', description: 'deque 存索引，對應的值由前往後遞減：前端丟掉離開視窗的索引，尾端丟掉不可能再當最大值的索引。每個索引進出各一次，總共 O(n)。',
      output: '3 3 5 5 6 7',
      code: {
        'C++': code`#include <deque>
#include <iostream>
#include <vector>

int main() {
    std::vector<int> a = {1, 3, -1, -3, 5, 3, 6, 7};
    int n = static_cast<int>(a.size()), k = 3;
    std::deque<int> dq;  // 存索引，對應的值由前往後遞減
    for (int i = 0; i < n; ++i) {
        if (!dq.empty() && dq.front() <= i - k) dq.pop_front();
        while (!dq.empty() && a[dq.back()] <= a[i]) dq.pop_back();
        dq.push_back(i);
        if (i >= k - 1) std::cout << a[dq.front()] << (i + 1 < n ? " " : "\n");
    }
    return 0;
}`,
        Python: code`from collections import deque

a = [1, 3, -1, -3, 5, 3, 6, 7]
k = 3
dq = deque()  # 存索引，對應的值由前往後遞減
out = []
for i in range(len(a)):
    if dq and dq[0] <= i - k:
        dq.popleft()
    while dq and a[dq[-1]] <= a[i]:
        dq.pop()
    dq.append(i)
    if i >= k - 1:
        out.append(a[dq[0]])
print(*out)`,
        Java: code`import java.util.ArrayDeque;
import java.util.Deque;

public class Main {
    public static void main(String[] args) {
        int[] a = {1, 3, -1, -3, 5, 3, 6, 7};
        int k = 3;
        Deque<Integer> dq = new ArrayDeque<>();  // 存索引，對應的值由前往後遞減
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < a.length; i++) {
            if (!dq.isEmpty() && dq.peekFirst() <= i - k) dq.pollFirst();
            while (!dq.isEmpty() && a[dq.peekLast()] <= a[i]) dq.pollLast();
            dq.offerLast(i);
            if (i >= k - 1) {
                if (out.length() > 0) out.append(" ");
                out.append(a[dq.peekFirst()]);
            }
        }
        System.out.println(out);
    }
}`,
        JavaScript: code`const a = [1, 3, -1, -3, 5, 3, 6, 7];
const k = 3;
// 存索引，對應的值由前往後遞減。不需要從前端放入，所以陣列 + head 索引就夠了：
// dq[head] 是前端，dq[dq.length - 1] 是尾端
const dq = [];
let head = 0;
const out = [];
for (let i = 0; i < a.length; i++) {
    if (head < dq.length && dq[head] <= i - k) head++;
    while (head < dq.length && a[dq[dq.length - 1]] <= a[i]) dq.pop();
    dq.push(i);
    if (i >= k - 1) out.push(a[dq[head]]);
}
console.log(out.join(" "));`,
      },
    },
  ],
  visualization: {
    kind: 'stack-queue', title: '單調佇列：滑動視窗最大值（deque 裡存的是索引）', language: 'Python',
    code: code`from collections import deque
a = [1, 3, -1, -3, 5, 3, 6, 7]
k = 3
dq = deque()
out = []
for i in range(len(a)):
    if dq and dq[0] <= i - k:
        dq.popleft()
    while dq and a[dq[-1]] <= a[i]:
        dq.pop()
    dq.append(i)
    if i >= k - 1:
        out.append(a[dq[0]])
print(*out)`,
    steps: [
      { line: 5, note: '建立空的 dq 與 out。注意：dq 裡存的是索引，不是值；變數面板的「dq 的值」列出這些索引對應的 a 值，方便看出它們由前往後遞減。', vars: { k: String(K) },
        containers: [{ name: 'dq', kind: 'deque', items: [] }] },
      ...containerSteps('dq', 'deque', traceOps.map(t => t.op)).map((step, n) => {
        const t = traceOps[n];
        const items = step.containers?.[0]?.items ?? [];
        return {
          ...step,
          note: `${step.note}${t.why}`,
          vars: { i: String(t.i), 'a[i]': String(A[t.i]), 'dq 的值': items.length ? items.map(j => A[Number(j)]).join(', ') : '（空）', out: `[${t.out.join(', ')}]`, ...step.vars },
        };
      }),
      { line: 14, note: `迴圈結束，印出每個視窗的最大值 3 3 5 5 6 7。回頭數一數：${A.length} 個索引各被 push 一次；被 pop 的索引（從前端 ${countOps('pop_front')} 次、從尾端 ${countOps('pop_back')} 次）也都只 pop 一次，最後 dq 裡還剩 1 個。總操作次數與 n 成正比，O(n)。`, vars: { k: String(K), out: '[3, 3, 5, 5, 6, 7]' },
        containers: [{ name: 'dq', kind: 'deque', items: ['7'] }], output: '3 3 5 5 6 7' },
    ],
    playground: { structure: 'deque' },
  },
  quiz: [
    {
      id: 'q-order', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'from collections import deque\nd = deque([1, 2])\nd.appendleft(0)\nd.append(3)\nx = d.popleft()\nd.appendleft(9)\ny = d.pop()\nprint(x, y, list(d))' },
      options: ['0 3 [9, 1, 2]', '1 9 [2, 0, 3]', '0 9 [1, 2, 3]', '3 0 [9, 1, 2]'],
      answer: 0, explanation: 'd 依序變成 [1, 2] → [0, 1, 2]（appendleft）→ [0, 1, 2, 3]（append）→ popleft 取出前端 0，剩 [1, 2, 3] → appendleft(9) 變 [9, 1, 2, 3] → pop 取出尾端 3，剩 [9, 1, 2]。「1 9 [2, 0, 3]」是把 appendleft 當成 append；「0 9 [1, 2, 3]」是以為 pop() 從前端移除（Python 的 pop 移除的是尾端）；「3 0 [9, 1, 2]」把 x 與 y 對調了。',
    },
    {
      id: 'q-complexity', prompt: '用本課的單調佇列求長度 n 的陣列、視窗大小 k 的所有視窗最大值，總時間複雜度是多少？',
      options: ['O(n)', 'O(nk)', 'O(n log n)', 'O(k)'],
      answer: 0, explanation: '內層 while 某一次可能 pop 很多個，但每個索引只被 push 一次、最多被 pop 一次（不論從前端或尾端），所有操作加起來最多 2n 次，總共 O(n)。O(nk) 是每個視窗都重新掃一遍的暴力解；O(n log n) 是用堆積（heap）或平衡樹的做法；O(k) 連把 n 個元素讀完都不夠。',
    },
    {
      id: 'q-java-null', prompt: '下面的 Java 片段執行時會怎樣？',
      code: { language: 'Java', text: 'Deque<Integer> dq = new ArrayDeque<>();\ndq.offerLast(5);\ndq.pollFirst();\nint x = dq.pollFirst();\nSystem.out.println(x);' },
      options: ['輸出 0', '輸出 5', '丟出 NullPointerException', '丟出 NoSuchElementException'],
      answer: 2, explanation: '第一次 pollFirst() 取出 5 後 deque 已經空了。第二次 pollFirst() 不丟例外，而是回傳 null；把 null 自動拆箱成 int 時才丟出 NullPointerException。NoSuchElementException 是 removeFirst() 在空 deque 上的行為；Java 不會把 null 當成 0，所以不會輸出 0；5 早就被第一次 pollFirst() 移除了。',
    },
    {
      id: 'q-choose', prompt: 'Python 程式要處理 10^5 人的等候名單：反覆從最前面移除一人、從最後面加入新的人。哪一種寫法最合適？',
      options: ['`list`，用 `append(x)` 與 `pop(0)`', '`collections.deque`，用 `append(x)` 與 `popleft()`', '`list`，用 `insert(0, x)` 與 `pop()`', '每次加入後把 `list` 排序，再 `pop(0)`'],
      answer: 1, explanation: '`deque` 兩端的 append 與 popleft 都是 O(1)，10^5 次操作總共 O(n)。`list.pop(0)` 與 `list.insert(0, x)` 都要移動所有其他元素，每次 O(n)，總共 O(n²)，n = 10^5 時會很慢；排序更是每次 O(n log n)，而且這題要的是先來先服務，不需要排序。',
    },
    {
      id: 'q-maxlen', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'from collections import deque\nd = deque(maxlen=3)\nfor x in [1, 2, 3, 4, 5]:\n    d.append(x)\nd.appendleft(0)\nprint(list(d))' },
      options: ['[0, 3, 4]', '[0, 4, 5]', '[3, 4, 5]', '[0, 1, 2, 3, 4, 5]'],
      answer: 0, explanation: '`maxlen=3` 的 deque 滿了之後，從一端加入新元素，會從另一端丟掉一個。append 1～5 時每次從左邊丟，剩 [3, 4, 5]；appendleft(0) 從左邊加入，所以從右邊丟掉 5，得到 [0, 3, 4]。「[0, 4, 5]」以為總是丟最左邊（最舊）的；「[3, 4, 5]」以為滿了就不能再加入；「[0, 1, 2, 3, 4, 5]」忽略了 maxlen。',
    },
    {
      id: 'q-monotonic', prompt: '用本課的滑動視窗最大值程式（deque 存索引）處理 a = [4, 2, 12, 3, 8]、k = 3。處理完 i = 4（值 8）之後，dq 裡的索引（前 → 後）是什麼？',
      options: ['[2, 4]', '[4]', '[2, 3, 4]', '[0, 2, 4]'],
      answer: 0, explanation: 'i = 2 時 12 把索引 1（值 2）和 0（值 4）都從尾端擠掉，dq = [2]；i = 3 放入 3，dq = [2, 3]；i = 4 時 a[3] = 3 ≤ 8 被擠掉，a[2] = 12 > 8 留下，前端索引 2 > 4 − 3 = 1 還在視窗內，最後 dq = [2, 4]，對應值 12、8 遞減。「[4]」以為 8 會擠掉比它大的 12；「[2, 3, 4]」忘了擠掉尾端較小的值；「[0, 2, 4]」中的索引 0 早在 i = 2 就被移除，而且也已離開視窗。',
    },
  ],
  exercises: [
    {
      id: 'e-window-max', title: '滑動視窗最大值',
      statement: '給一個長度 n 的整數陣列 a 與視窗大小 k。視窗從最左邊開始，每次往右移一格，共有 n − k + 1 個視窗；請依序輸出每個視窗（連續 k 個元素）中的最大值。n 可以到 2×10^5，每個視窗重新掃一遍的 O(nk) 做法會太慢，請用單調佇列做到 O(n)。若 k 不滿足 1 ≤ k ≤ n（k ≤ 0 或 k > n），輸出 `Invalid`。',
      inputFormat: '第一行兩個整數 n 與 k。第二行 n 個以空白分隔的整數 a[0]～a[n−1]。',
      outputFormat: '一行：n − k + 1 個以空白分隔的整數，依序是每個視窗的最大值；或 `Invalid`。',
      constraints: ['1 ≤ n ≤ 2×10^5', 'k 是整數，|k| ≤ 10^9（不在 1～n 之間時輸出 Invalid）', '每個 a[i] 是 −10^9～10^9 的整數'],
      samples: [{ kind: 'normal', input: '8 3\n1 3 -1 -3 5 3 6 7', output: '3 3 5 5 6 7', note: '本課視覺化的例子' }],
      tests: [
        { kind: 'normal', input: '8 3\n1 3 -1 -3 5 3 6 7', output: '3 3 5 5 6 7', note: '本課視覺化的例子' },
        { kind: 'normal', input: '6 2\n4 2 12 3 8 1', output: '4 12 12 8 8', note: '大值 12 連續當兩個視窗的最大值' },
        { kind: 'normal', input: '5 3\n-5 -2 -8 -1 -9', output: '-2 -1 -1', note: '全部是負數，不能把最大值初始化成 0' },
        { kind: 'edge', input: '4 1\n5 -1 3 3', output: '5 -1 3 3', note: 'k = 1：每個元素自己就是一個視窗' },
        { kind: 'edge', input: '5 5\n2 9 4 9 1', output: '9', note: 'k = n：只有一個視窗' },
        { kind: 'edge', input: '6 3\n7 7 7 7 7 7', output: '7 7 7 7', note: '全部相等：相等的值也要正確處理' },
        { kind: 'edge', input: '6 2\n9 7 5 3 1 0', output: '9 7 5 3 1', note: '遞減陣列：尾端從不 pop，每一步都要從前端丟掉過期索引' },
        { kind: 'edge', input: '5 3\n1 2 3 4 5', output: '3 4 5', note: '遞增陣列：每個新元素都把 deque 清空' },
        { kind: 'edge', input: '1 1\n-1000000000', output: '-1000000000', note: '最小的 n 與最小的值' },
        { kind: 'edge', input: `1000 500\n${Array.from({ length: 1000 }, (_, i) => 1000 - i).join(' ')}`, output: Array.from({ length: 501 }, (_, j) => 1000 - j).join(' '), note: '1000 到 1 遞減、k = 500：501 個視窗，最大值都是視窗的第一個元素' },
        { kind: 'error', input: '3 0\n1 2 3', output: 'Invalid', note: 'k = 0' },
        { kind: 'error', input: '3 4\n1 2 3', output: 'Invalid', note: 'k > n，一個完整的視窗都沒有' },
        { kind: 'error', input: '3 -2\n1 2 3', output: 'Invalid', note: 'k 是負數' },
      ],
      hints: [
        'deque 裡存索引，並維持它們對應的值由前往後遞減；前端永遠是目前視窗的最大值。',
        '處理 a[i]：先看前端索引是否 ≤ i − k（已離開視窗），是就從前端移除；再把尾端所有值 ≤ a[i] 的索引從尾端移除；最後把 i 放到尾端。',
        '只有 i ≥ k − 1 時視窗才滿，這時才輸出前端索引的值。',
        '每個索引最多進出 deque 各一次，所以總共 O(n)。先檢查 k 是否在 1～n 之間，否則輸出 Invalid。',
      ],
      solution: {
        'C++': code`#include <deque>
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n, k;
    std::cin >> n >> k;
    std::vector<int> a(n);
    for (int& x : a) std::cin >> x;
    if (k < 1 || k > n) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::deque<int> dq;  // 索引，對應的值由前往後遞減
    std::string out;
    for (int i = 0; i < n; ++i) {
        if (!dq.empty() && dq.front() <= i - k) dq.pop_front();
        while (!dq.empty() && a[dq.back()] <= a[i]) dq.pop_back();
        dq.push_back(i);
        if (i >= k - 1) {
            if (!out.empty()) out += ' ';
            out += std::to_string(a[dq.front()]);
        }
    }
    std::cout << out << "\n";
    return 0;
}`,
        Python: code`import sys
from collections import deque

data = sys.stdin.read().split()
n, k = int(data[0]), int(data[1])
a = list(map(int, data[2:2 + n]))
if k < 1 or k > n:
    print("Invalid")
else:
    dq = deque()  # 索引，對應的值由前往後遞減
    out = []
    for i in range(n):
        if dq and dq[0] <= i - k:
            dq.popleft()
        while dq and a[dq[-1]] <= a[i]:
            dq.pop()
        dq.append(i)
        if i >= k - 1:
            out.append(a[dq[0]])
    print(*out)`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        int n = Integer.parseInt(st.nextToken());
        int k = Integer.parseInt(st.nextToken());
        int[] a = new int[n];
        st = new StringTokenizer(br.readLine());
        for (int i = 0; i < n; i++) a[i] = Integer.parseInt(st.nextToken());
        if (k < 1 || k > n) {
            System.out.println("Invalid");
            return;
        }
        Deque<Integer> dq = new ArrayDeque<>();  // 索引，對應的值由前往後遞減
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < n; i++) {
            if (!dq.isEmpty() && dq.peekFirst() <= i - k) dq.pollFirst();
            while (!dq.isEmpty() && a[dq.peekLast()] <= a[i]) dq.pollLast();
            dq.offerLast(i);
            if (i >= k - 1) {
                if (out.length() > 0) out.append(' ');
                out.append(a[dq.peekFirst()]);
            }
        }
        System.out.println(out);
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = data[0];
const k = data[1];
const a = data.slice(2, 2 + n);
if (k < 1 || k > n) {
    console.log("Invalid");
} else {
    const dq = [];  // 索引，對應的值由前往後遞減；dq[head] 是前端
    let head = 0;
    const out = [];
    for (let i = 0; i < n; i++) {
        if (head < dq.length && dq[head] <= i - k) head++;
        while (head < dq.length && a[dq[dq.length - 1]] <= a[i]) dq.pop();
        dq.push(i);
        if (i >= k - 1) out.push(a[dq[head]]);
    }
    console.log(out.join(" "));
}`,
      },
      judge: 'none',
    },
  ],
};

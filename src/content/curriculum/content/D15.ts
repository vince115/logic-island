import type { LessonContent, TraceStep } from '../schema';
import { heapSteps, type HeapOp } from '../simulate';

const code = String.raw;

/**
 * The trace's operations: six heappush calls in the loop (line 4), two heappop calls (lines 6 and 7) and reading
 * h[0] (line 8). Each carries the variables to show and what its print statement adds to the output.
 */
const traceOps: { op: HeapOp; vars?: Record<string, string>; print?: string; why?: string }[] = [
  ...[5, 3, 8, 1, 9, 2].map(x => ({ op: { op: 'push', value: x, line: 4 } as HeapOp, vars: { x: String(x) } })),
  { op: { op: 'pop', line: 6 }, print: '1', why: '`heappop` 回傳被取出的 1，print 印出 1。' },
  { op: { op: 'pop', line: 7 }, print: '2', why: '回傳 2 並印出。兩次 pop 依序得到 1、2：每次都是目前最小的。' },
  { op: { op: 'top', line: 8 }, print: '3', why: '`h[0]` 只是讀取，不會移除，所以陣列不變。' },
];

/** Steps from the heap simulator, one operation at a time, with the loop variable and everything printed so far. */
function traceSteps(): TraceStep[] {
  const steps: TraceStep[] = [
    { line: 2, note: '建立空串列 h。heapq 沒有自己的類別，就把一個普通 list 當作最小堆積來維護。', arrays: [{ name: 'h', cells: [] }], tree: { name: 'h（以樹呈現）', nodes: [], roots: [] } },
  ];
  const printed: string[] = [];
  const snapshot = (line: number, note: string): TraceStep => {
    const last = steps[steps.length - 1];
    return { line, note, arrays: last.arrays!.map(a => ({ ...a, marks: [] })), tree: { ...last.tree!, marks: [] }, output: printed.join('\n') };
  };
  let done = 0;
  traceOps.forEach((t, k) => {
    if (k === 6) {
      const cells = steps[steps.length - 1].arrays![0].cells as string[];
      printed.push(`[${cells.join(', ')}]`);
      steps.push(snapshot(5, `印出底層的 list：${printed[0]}。它是合法的最小堆積（每個父節點 ≤ 孩子），但不是排序好的：索引 2 的 2 比索引 1 的 3 還小。`));
    }
    const all = heapSteps('h', traceOps.slice(0, k + 1).map(o => o.op));
    const group = all.slice(done);
    done = all.length;
    group.forEach((step, j) => {
      const isLast = j === group.length - 1;
      if (isLast && t.print) printed.push(t.print);
      steps.push({
        ...step,
        note: isLast && t.why ? `${step.note}${t.why}` : step.note,
        ...(t.vars || step.vars ? { vars: { ...t.vars, ...step.vars } } : {}),
        ...(printed.length ? { output: printed.join('\n') } : {}),
      });
    });
  });
  const cells = steps[steps.length - 1].arrays![0].cells as string[];
  printed.push(`[${cells.join(', ')}]`);
  steps.push(snapshot(9, `最後的 list 是 ${printed[printed.length - 1]}。動畫用的是教科書的下沉（和較小的孩子比，比較大就交換）；Python 的 heappop 內部寫法不同（先一路把較小的孩子往上補到葉子，再把最後一個元素上浮），這組資料的結果相同。遇到相等的值時，函式庫可能把相等的元素擺在不同位置，但一定仍是合法的堆積。`));
  return steps;
}

/**
 * D15 Heap / Priority Queue. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); it has no built-in heap, so every JavaScript program carries the same
 * hand-written binary `Heap` class (push/pop/peek/size, comparator `before`, min-heap by default).
 */
export const D15: LessonContent = {
  lessonId: 'D15',
  motivation: '急診室不是先來先看，而是最危急的先看；作業系統挑「優先度最高」的工作先執行；導航軟體找最短路徑時，每一步都要拿出「目前距離最小」的地點。這類「隨時取出最大或最小值，同時還會不斷加入新資料」的需求，用排序太慢（每加一筆就要重排），用普通陣列每次都要掃一遍找最小值。堆積（heap）把最小值固定放在根，插入與取出都是 O(log n)、讀最小值是 O(1)，是優先佇列（priority queue）最常見的實作。它的限制是：只保證根是最值，其他元素沒有排序，也不能有效率地搜尋或刪除任意一個值；需要那些操作時要改用 D14 的搜尋樹。',
  sections: [
    {
      id: 'heap-property', title: '堆積性質：存在陣列裡的完全二元樹',
      blocks: [
        { type: 'p', text: '二元堆積（binary heap）是一棵完全二元樹（complete binary tree，D12）：除了最下面一層，每層都是滿的，最下層從左邊開始排。它還要滿足堆積性質（heap property）：' },
        { type: 'list', items: [
          '最小堆積（min-heap）：每個父節點 ≤ 它的孩子，所以根是全部元素中最小的。',
          '最大堆積（max-heap）：反過來，每個父節點 ≥ 它的孩子，根是最大的。',
        ] },
        { type: 'p', text: '因為是完全二元樹，不需要指標，直接按層序存在陣列裡就好。D12 的公式：索引 i 的左孩子是 `2i+1`、右孩子是 `2i+2`、父節點是 `(i-1)/2`（整數除法，Python 寫 `(i - 1) // 2`，JavaScript 寫 `Math.floor((i - 1) / 2)`）。例如陣列 `[1, 3, 2, 5, 9, 8]`：索引 0 的 1 是根，它的孩子是索引 1 的 3 和索引 2 的 2；3 的孩子是 5 和 9；2 的孩子是 8。n 個元素的完全二元樹高度只有 ⌊log₂ n⌋，這就是堆積操作快的原因。' },
        { type: 'callout', tone: 'warning', title: '堆積不是排序好的陣列', text: '堆積性質只規定「父 ≤ 子」，兄弟之間、不同分支之間沒有任何大小關係。`[1, 3, 2, 5, 9, 8]` 是合法的最小堆積，但顯然沒有排序：索引 1 的 3 比索引 2 的 2 大。唯一能保證的是根（索引 0）是最小值；第二小的一定是根的某個孩子，但不知道是哪一個。想依序得到所有元素，要一個一個取出（pop），每次取出的都是當下的最小值。' },
        { type: 'p', text: '下面的程式把 7 個數放進最小堆積，再全部取出：取出的順序就是由小到大。這也是堆積排序（heap sort）的想法，總共 O(n log n)。' },
        { type: 'example', id: 'pop-all-sorted' },
      ],
    },
    {
      id: 'sift', title: '插入要上浮，取出要下沉',
      blocks: [
        { type: 'p', text: 'push（插入）：先把新元素放在陣列最後（樹最下層最左邊的空位），維持完全二元樹的形狀；再做上浮（sift up）：只要它比父節點小，就和父節點交換，一路往上，直到父節點 ≤ 它或到了根。最多走樹的高度那麼多層，所以是 O(log n)。' },
        { type: 'p', text: 'pop（取出最小值）：根就是答案。為了保持形狀，把陣列最後一個元素搬到根，陣列長度減一；再做下沉（sift down）：和兩個孩子中較小的那個比，如果比它大就交換，一路往下，直到它 ≤ 較小的孩子或變成葉子。一定要選較小的孩子：若和較大的孩子交換，較大的孩子會變成較小孩子的父節點，又違反了堆積性質。下沉同樣是 O(log n)。' },
        { type: 'p', text: 'top（讀最小值）：直接看索引 0，O(1)。下方的視覺化用 Python 的 `heapq` 依序 push 5、3、8、1、9、2，再 pop 兩次，每一次交換都會畫出陣列和對應的樹。' },
        { type: 'table', head: ['操作', '做法', '時間'], rows: [
          ['top：讀最值', '看索引 0', 'O(1)'],
          ['push：插入', '放到最後，上浮', 'O(log n)'],
          ['pop：取出最值', '最後一個搬到根，下沉', 'O(log n)'],
          ['heapify：把整個陣列變成堆積', '從最後一個非葉節點往前，逐一下沉', 'O(n)'],
          ['搜尋或刪除任意值', '堆積沒有幫助，只能掃過陣列', 'O(n)'],
        ] },
        { type: 'p', text: '把已有的 n 個數變成堆積，逐一 push 是 O(n log n)；但直接 heapify 只要 O(n)：大約一半的節點是葉子，根本不用動，越靠近根的節點越少，加總起來的下沉次數只和 n 成正比。C++、Python 與 Java 都有現成的寫法：Python `heapq.heapify(list)`、C++ `std::make_heap` 或 `std::priority_queue<int> pq(v.begin(), v.end());`、Java `new PriorityQueue<>(collection)`；JavaScript 沒有內建的堆積，要自己寫。' },
        { type: 'callout', tone: 'note', title: '動畫與函式庫的內部寫法', text: '動畫顯示的是教科書的下沉。Python `heapq` 的 `heappop` 內部做法不同：先沿著較小的孩子一路把空位推到葉子，再把最後一個元素放進去往上浮。兩種做法沿著同一條路徑，元素都不相等時結果一樣；有相等的值時，函式庫可能把相等的元素擺在不同位置，結果仍然是合法的堆積，取出的值也一樣。所以不要依賴堆積陣列的內部排列，只依賴「根是最值」。' },
      ],
    },
    {
      id: 'languages', title: '各語言的優先佇列',
      blocks: [
        { type: 'p', text: '優先佇列是「每次取出優先度最高者」的抽象資料型別，C++、Python 與 Java 的標準函式庫都用二元堆積實作，但預設方向和介面不一樣；JavaScript 沒有內建的堆積或優先佇列，本課的 JavaScript 範例自己用陣列寫一個小小的 `Heap` 類別（push 上浮、pop 下沉，和上一節的做法相同）：' },
        { type: 'table', head: ['', 'C++ `std::priority_queue`', 'Python `heapq`', 'Java `PriorityQueue`', 'JavaScript 自己寫的 `Heap`'], rows: [
          ['預設', '最大堆積', '最小堆積（作用在普通 list 上）', '最小堆積', '由傳入的比較函式 `before(a, b)` 決定，本課預設最小堆積'],
          ['插入 O(log n)', '`pq.push(x)`', '`heapq.heappush(h, x)`', '`pq.offer(x)` 或 `add(x)`', '`h.push(x)`'],
          ['讀最值 O(1)', '`pq.top()`', '`h[0]`', '`pq.peek()`', '`h.peek()`'],
          ['取出最值 O(log n)', '`pq.pop()`，回傳 void，要先 `top()`', '`heapq.heappop(h)`，回傳該值', '`pq.poll()`，回傳該值', '`h.pop()`，回傳該值'],
          ['大小', '`pq.size()`、`pq.empty()`', '`len(h)`、`not h`', '`pq.size()`、`pq.isEmpty()`', '`h.size()`、`h.size() === 0`'],
          ['另一個方向', '`std::priority_queue<int, std::vector<int>, std::greater<int>>`', '存負數 `-x`', '`new PriorityQueue<>(Comparator.reverseOrder())`', '`new Heap((a, b) => a > b)`'],
          ['空的時候取值', '`top()`／`pop()` 是未定義行為', '`h[0]`／`heappop` 丟出 `IndexError`', '`peek()`／`poll()` 回傳 `null`', '本課的寫法回傳 `undefined`，要先檢查 `size()`'],
        ] },
        { type: 'callout', tone: 'warning', title: 'C++：預設是最大堆積，pop 不回傳值', text: '`std::priority_queue<int>` 的 `top()` 是最大值，和 Python、Java 剛好相反。要最小堆積得寫齊三個樣板參數：`std::priority_queue<int, std::vector<int>, std::greater<int>>`（`std::greater` 在 `<functional>`）。比較器的意思是「誰排在後面」：預設的 `std::less` 讓大的優先。另外 `pop()` 回傳 void，`int x = pq.pop();` 無法編譯，要寫 `int x = pq.top(); pq.pop();`。' },
        { type: 'callout', tone: 'warning', title: 'Python：最大堆積用負數，平手要能比較', text: '`heapq` 只提供最小堆積的函式，常見做法是放入 `-x`、取出時再加負號。放入 tuple 時，Python 會逐項比較：先比第一項，相同才比第二項。如果第一項（優先度）相同而第二項是無法比大小的東西（例如 dict），`heappush` 會丟出 `TypeError`。慣用寫法是放 `(priority, order, item)`，用遞增的編號 order 打破平手，還能讓同優先度的資料先來先出。' },
        { type: 'callout', tone: 'warning', title: 'Java：走訪和印出都不是排序的', text: '`PriorityQueue` 的 for-each、`iterator()` 和 `toString()` 都是照內部陣列的順序，不是由小到大：依序 offer 5、1、4、2、3 後 `System.out.println(pq)` 印出 `[1, 2, 4, 5, 3]`。要排序的結果只能反覆 `poll()`。空的時候 `poll()`／`peek()` 回傳 `null`，寫 `int x = pq.poll();` 會因為自動拆箱 null 而丟出 `NullPointerException`；`remove()`／`element()` 則丟出 `NoSuchElementException`。' },
        { type: 'example', id: 'max-and-min' },
        { type: 'p', text: '要依「優先度，再依先後」排序時，C++ 可以用 `std::tuple` 搭配 `std::greater`（tuple 也是逐項比較），Python 用 tuple，Java 寫一個比較器（comparator），JavaScript 把同樣的比較寫成函式傳給 `Heap`：' },
        { type: 'example', id: 'task-priority' },
      ],
    },
    {
      id: 'applications', title: '應用：前 k 大、合併有序串列、排程',
      blocks: [
        { type: 'p', text: '前 k 大（top-k）：在 n 個數中找最大的 k 個。直覺的做法是全部排序，O(n log n)。更好的做法是維持一個大小最多 k 的最小堆積：每讀一個數就 push，大小超過 k 就 pop 掉最小的。堆積裡留下的永遠是「目前看過的數中最大的 k 個」，而根是這 k 個裡最小的，正好是被淘汰的候選人。每次操作只要 O(log k)，總共 O(n log k)，而且只用 O(k) 的記憶體，資料一筆一筆串流進來也能做。' },
        { type: 'callout', tone: 'tip', title: '找前 k 大要用最小堆積', text: '這是很容易弄反的地方：要留下最大的 k 個，就要能快速丟掉其中最小的，所以用最小堆積。最後依序 pop 得到的是由小到大，題目要由大到小時記得反過來輸出。' },
        { type: 'example', id: 'top-k' },
        { type: 'list', items: [
          '合併 k 個已排序串列：把每個串列的第一個元素放進最小堆積，每次 pop 出最小的，再把它所屬串列的下一個元素 push 進去。總共 N 個元素時是 O(N log k)。',
          '依優先度排程：工作帶著優先度進入佇列，處理器每次取出優先度最高的；新工作隨時可以加入。',
          '最短路徑：演算法島 A15 的 Dijkstra 演算法，每一步都要取出「目前距離最小」的節點，就是用優先佇列。',
        ] },
      ],
    },
    {
      id: 'compare', title: '堆積、有序陣列、搜尋樹與無序陣列',
      blocks: [
        { type: 'p', text: '同樣是「要找最小值」，不同結構付出的代價不一樣。下表的平衡搜尋樹指 D14 的 BST 在不退化時的情形，實務上用 C++ `std::set`／`std::map`、Java `TreeMap`／`TreeSet`（Python 與 JavaScript 的標準函式庫沒有內建的平衡搜尋樹）。' },
        { type: 'table', head: ['操作', '二元堆積', '有序陣列', '平衡搜尋樹', '無序陣列'], rows: [
          ['插入', 'O(log n)', 'O(n)（要搬移元素）', 'O(log n)', '攤銷 O(1)'],
          ['讀最小值', 'O(1)', 'O(1)', 'O(log n)（`std::set` 的 `begin()` 是 O(1)）', 'O(n)'],
          ['取出最小值', 'O(log n)', 'O(n)（從前端刪）', 'O(log n)', 'O(n)'],
          ['搜尋任意值', 'O(n)', 'O(log n)（二分搜）', 'O(log n)', 'O(n)'],
          ['刪除任意值', 'O(n)（先要找到）', 'O(n)', 'O(log n)', 'O(n)'],
          ['由小到大走訪全部', 'O(n log n)（逐一 pop）', 'O(n)', 'O(n)', 'O(n log n)（先排序）'],
          ['由 n 個數建立', 'O(n)（heapify）', 'O(n log n)（排序）', 'O(n log n)', 'O(n)'],
        ] },
        { type: 'p', text: '選擇的原則：只需要「反覆插入、反覆取出最值」，用堆積，常數小、實作簡單。還需要搜尋任意值、刪除任意值、找「大於等於 x 的最小值」或依序走訪，就用平衡搜尋樹。資料不會再變動、只要查詢，排序一次後用有序陣列加二分搜。' },
      ],
    },
  ],
  examples: [
    {
      id: 'pop-all-sorted', title: '放進最小堆積，再全部取出', description: '放入 7 個數，讀最小值與大小，再反覆取出：取出的順序由小到大。',
      output: 'top: 1\nsize: 7\npop order: 1 2 3 5 7 8 9',
      code: {
        'C++': code`#include <functional>
#include <iostream>
#include <queue>
#include <vector>

int main() {
    std::priority_queue<int, std::vector<int>, std::greater<int>> pq;  // 最小堆積
    for (int x : {5, 3, 8, 1, 9, 2, 7}) pq.push(x);
    std::cout << "top: " << pq.top() << "\n";
    std::cout << "size: " << pq.size() << "\n";
    std::cout << "pop order:";
    while (!pq.empty()) {
        std::cout << " " << pq.top();  // pop() 不回傳值，先用 top() 讀
        pq.pop();
    }
    std::cout << "\n";
    return 0;
}`,
        Python: code`import heapq

h = []
for x in [5, 3, 8, 1, 9, 2, 7]:
    heapq.heappush(h, x)
print("top:", h[0])
print("size:", len(h))
order = []
while h:
    order.append(heapq.heappop(h))
print("pop order:", *order)`,
        Java: code`import java.util.PriorityQueue;

public class Main {
    public static void main(String[] args) {
        PriorityQueue<Integer> pq = new PriorityQueue<>();  // 最小堆積
        for (int x : new int[] {5, 3, 8, 1, 9, 2, 7}) pq.offer(x);
        System.out.println("top: " + pq.peek());
        System.out.println("size: " + pq.size());
        StringBuilder order = new StringBuilder("pop order:");
        while (!pq.isEmpty()) order.append(" ").append(pq.poll());
        System.out.println(order);
    }
}`,
        JavaScript: code`// JavaScript 沒有內建的堆積：自己用陣列寫一個二元堆積
// before(a, b) 為 true 表示 a 要比 b 先取出；預設是最小堆積
class Heap {
    constructor(before = (a, b) => a < b) {
        this.items = [];
        this.before = before;
    }

    size() {
        return this.items.length;
    }

    peek() {
        return this.items[0];  // 讀最值：索引 0
    }

    push(x) {  // 放到最後，再上浮
        const a = this.items;
        a.push(x);
        let i = a.length - 1;
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (!this.before(a[i], a[parent])) break;
            [a[i], a[parent]] = [a[parent], a[i]];
            i = parent;
        }
    }

    pop() {  // 取出根；最後一個搬到根，再下沉
        const a = this.items;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            while (true) {
                const left = 2 * i + 1, right = 2 * i + 2;
                let best = i;  // 自己和兩個孩子中，最該先取出的那個
                if (left < a.length && this.before(a[left], a[best])) best = left;
                if (right < a.length && this.before(a[right], a[best])) best = right;
                if (best === i) break;
                [a[i], a[best]] = [a[best], a[i]];
                i = best;
            }
        }
        return top;
    }
}

const h = new Heap();  // 最小堆積
for (const x of [5, 3, 8, 1, 9, 2, 7]) h.push(x);
console.log("top: " + h.peek());
console.log("size: " + h.size());
const order = [];
while (h.size() > 0) order.push(h.pop());
console.log("pop order: " + order.join(" "));`,
      },
    },
    {
      id: 'max-and-min', title: '最大堆積與最小堆積', description: '同一組數分別放進最大堆積與最小堆積。C++ 預設是最大堆積；Python 存負數；Java 用 Comparator.reverseOrder()；JavaScript 傳給自己寫的 Heap 不同的比較函式。',
      output: 'max-heap: 10 7 4 2\nmin-heap: 2 4 7 10',
      code: {
        'C++': code`#include <functional>
#include <iostream>
#include <queue>
#include <vector>

int main() {
    std::vector<int> values = {4, 10, 7, 2};
    std::priority_queue<int> maxHeap;  // 預設：最大堆積
    std::priority_queue<int, std::vector<int>, std::greater<int>> minHeap;
    for (int x : values) {
        maxHeap.push(x);
        minHeap.push(x);
    }
    std::cout << "max-heap:";
    while (!maxHeap.empty()) {
        std::cout << " " << maxHeap.top();
        maxHeap.pop();
    }
    std::cout << "\nmin-heap:";
    while (!minHeap.empty()) {
        std::cout << " " << minHeap.top();
        minHeap.pop();
    }
    std::cout << "\n";
    return 0;
}`,
        Python: code`import heapq

values = [4, 10, 7, 2]
max_heap = []
min_heap = []
for x in values:
    heapq.heappush(max_heap, -x)  # 存負數：最小的 -x 就是最大的 x
    heapq.heappush(min_heap, x)
print("max-heap:", *[-heapq.heappop(max_heap) for _ in values])
print("min-heap:", *[heapq.heappop(min_heap) for _ in values])`,
        Java: code`import java.util.Comparator;
import java.util.PriorityQueue;

public class Main {
    public static void main(String[] args) {
        int[] values = {4, 10, 7, 2};
        PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Comparator.reverseOrder());
        PriorityQueue<Integer> minHeap = new PriorityQueue<>();
        for (int x : values) {
            maxHeap.offer(x);
            minHeap.offer(x);
        }
        StringBuilder out = new StringBuilder("max-heap:");
        while (!maxHeap.isEmpty()) out.append(" ").append(maxHeap.poll());
        out.append("\nmin-heap:");
        while (!minHeap.isEmpty()) out.append(" ").append(minHeap.poll());
        System.out.println(out);
    }
}`,
        JavaScript: code`// JavaScript 沒有內建的堆積：自己用陣列寫一個二元堆積
// before(a, b) 為 true 表示 a 要比 b 先取出；預設是最小堆積
class Heap {
    constructor(before = (a, b) => a < b) {
        this.items = [];
        this.before = before;
    }

    size() {
        return this.items.length;
    }

    peek() {
        return this.items[0];  // 讀最值：索引 0
    }

    push(x) {  // 放到最後，再上浮
        const a = this.items;
        a.push(x);
        let i = a.length - 1;
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (!this.before(a[i], a[parent])) break;
            [a[i], a[parent]] = [a[parent], a[i]];
            i = parent;
        }
    }

    pop() {  // 取出根；最後一個搬到根，再下沉
        const a = this.items;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            while (true) {
                const left = 2 * i + 1, right = 2 * i + 2;
                let best = i;  // 自己和兩個孩子中，最該先取出的那個
                if (left < a.length && this.before(a[left], a[best])) best = left;
                if (right < a.length && this.before(a[right], a[best])) best = right;
                if (best === i) break;
                [a[i], a[best]] = [a[best], a[i]];
                i = best;
            }
        }
        return top;
    }
}

const values = [4, 10, 7, 2];
const maxHeap = new Heap((a, b) => a > b);  // 大的先取出：最大堆積
const minHeap = new Heap();
for (const x of values) {
    maxHeap.push(x);
    minHeap.push(x);
}
const maxOrder = [], minOrder = [];
while (maxHeap.size() > 0) maxOrder.push(maxHeap.pop());
while (minHeap.size() > 0) minOrder.push(minHeap.pop());
console.log("max-heap: " + maxOrder.join(" "));
console.log("min-heap: " + minOrder.join(" "));`,
      },
    },
    {
      id: 'task-priority', title: '依優先度排程，平手先來先做', description: '數字越小優先度越高；優先度相同時，用加入的順序打破平手。',
      output: 'test (priority 1)\nreview (priority 1)\nwrite (priority 2)\ndeploy (priority 3)',
      code: {
        'C++': code`#include <functional>
#include <iostream>
#include <queue>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

int main() {
    std::vector<std::pair<std::string, int>> tasks = {{"write", 2}, {"test", 1}, {"deploy", 3}, {"review", 1}};
    using Item = std::tuple<int, int, std::string>;  // (優先度, 加入順序, 名稱)
    std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;
    for (int i = 0; i < (int)tasks.size(); i++) pq.push({tasks[i].second, i, tasks[i].first});
    while (!pq.empty()) {
        Item top = pq.top();  // 先複製一份，pop 之後原本的就不見了
        pq.pop();
        std::cout << std::get<2>(top) << " (priority " << std::get<0>(top) << ")\n";
    }
    return 0;
}`,
        Python: code`import heapq

tasks = [("write", 2), ("test", 1), ("deploy", 3), ("review", 1)]
h = []
for order, (name, priority) in enumerate(tasks):
    heapq.heappush(h, (priority, order, name))  # order 打破平手：先來的先做
while h:
    priority, _, name = heapq.heappop(h)
    print(f"{name} (priority {priority})")`,
        Java: code`import java.util.PriorityQueue;

public class Main {
    public static void main(String[] args) {
        String[] names = {"write", "test", "deploy", "review"};
        int[] priority = {2, 1, 3, 1};
        // 存任務編號；先比優先度，平手時比編號（先來的先做）
        PriorityQueue<Integer> pq = new PriorityQueue<>((a, b) ->
            priority[a] != priority[b] ? Integer.compare(priority[a], priority[b]) : Integer.compare(a, b));
        for (int i = 0; i < names.length; i++) pq.offer(i);
        while (!pq.isEmpty()) {
            int i = pq.poll();
            System.out.println(names[i] + " (priority " + priority[i] + ")");
        }
    }
}`,
        JavaScript: code`// JavaScript 沒有內建的堆積：自己用陣列寫一個二元堆積
// before(a, b) 為 true 表示 a 要比 b 先取出；預設是最小堆積
class Heap {
    constructor(before = (a, b) => a < b) {
        this.items = [];
        this.before = before;
    }

    size() {
        return this.items.length;
    }

    peek() {
        return this.items[0];  // 讀最值：索引 0
    }

    push(x) {  // 放到最後，再上浮
        const a = this.items;
        a.push(x);
        let i = a.length - 1;
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (!this.before(a[i], a[parent])) break;
            [a[i], a[parent]] = [a[parent], a[i]];
            i = parent;
        }
    }

    pop() {  // 取出根；最後一個搬到根，再下沉
        const a = this.items;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            while (true) {
                const left = 2 * i + 1, right = 2 * i + 2;
                let best = i;  // 自己和兩個孩子中，最該先取出的那個
                if (left < a.length && this.before(a[left], a[best])) best = left;
                if (right < a.length && this.before(a[right], a[best])) best = right;
                if (best === i) break;
                [a[i], a[best]] = [a[best], a[i]];
                i = best;
            }
        }
        return top;
    }
}

const tasks = [["write", 2], ["test", 1], ["deploy", 3], ["review", 1]];
// 先比優先度，平手時比加入順序（先來的先做）
const pq = new Heap((a, b) => (a.priority !== b.priority ? a.priority < b.priority : a.order < b.order));
tasks.forEach(([name, priority], order) => pq.push({ priority, order, name }));
while (pq.size() > 0) {
    const t = pq.pop();
    console.log(t.name + " (priority " + t.priority + ")");
}`,
      },
    },
    {
      id: 'top-k', title: '用大小為 k 的最小堆積找前 k 大', description: '讀入 n、k 與 n 個整數，堆積大小超過 k 就丟掉最小的；最後由大到小輸出最大的 k 個（重複的值各算一個）。',
      stdin: '10 3\n4 15 8 23 42 16 4 8 1 23', output: '42 23 23',
      code: {
        'C++': code`#include <functional>
#include <iostream>
#include <queue>
#include <vector>

int main() {
    int n, k;
    std::cin >> n >> k;
    std::priority_queue<int, std::vector<int>, std::greater<int>> pq;
    for (int i = 0; i < n; i++) {
        int x;
        std::cin >> x;
        pq.push(x);
        if ((int)pq.size() > k) pq.pop();  // 丟掉 k+1 個裡最小的
    }
    std::vector<int> result;
    while (!pq.empty()) {
        result.push_back(pq.top());
        pq.pop();
    }
    for (int i = (int)result.size() - 1; i >= 0; i--) {
        std::cout << result[i] << (i > 0 ? " " : "\n");
    }
    return 0;
}`,
        Python: code`import heapq

n, k = map(int, input().split())
nums = list(map(int, input().split()))
h = []
for x in nums[:n]:
    heapq.heappush(h, x)
    if len(h) > k:
        heapq.heappop(h)  # 丟掉 k+1 個裡最小的
result = []
while h:
    result.append(heapq.heappop(h))
print(*reversed(result))`,
        Java: code`import java.util.ArrayList;
import java.util.List;
import java.util.PriorityQueue;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), k = sc.nextInt();
        PriorityQueue<Integer> pq = new PriorityQueue<>();
        for (int i = 0; i < n; i++) {
            pq.offer(sc.nextInt());
            if (pq.size() > k) pq.poll();  // 丟掉 k+1 個裡最小的
        }
        List<Integer> result = new ArrayList<>();
        while (!pq.isEmpty()) result.add(pq.poll());
        StringBuilder out = new StringBuilder();
        for (int i = result.size() - 1; i >= 0; i--) {
            out.append(result.get(i)).append(i > 0 ? " " : "");
        }
        System.out.println(out);
    }
}`,
        JavaScript: code`// JavaScript 沒有內建的堆積：自己用陣列寫一個二元堆積
// before(a, b) 為 true 表示 a 要比 b 先取出；預設是最小堆積
class Heap {
    constructor(before = (a, b) => a < b) {
        this.items = [];
        this.before = before;
    }

    size() {
        return this.items.length;
    }

    peek() {
        return this.items[0];  // 讀最值：索引 0
    }

    push(x) {  // 放到最後，再上浮
        const a = this.items;
        a.push(x);
        let i = a.length - 1;
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (!this.before(a[i], a[parent])) break;
            [a[i], a[parent]] = [a[parent], a[i]];
            i = parent;
        }
    }

    pop() {  // 取出根；最後一個搬到根，再下沉
        const a = this.items;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            while (true) {
                const left = 2 * i + 1, right = 2 * i + 2;
                let best = i;  // 自己和兩個孩子中，最該先取出的那個
                if (left < a.length && this.before(a[left], a[best])) best = left;
                if (right < a.length && this.before(a[right], a[best])) best = right;
                if (best === i) break;
                [a[i], a[best]] = [a[best], a[i]];
                i = best;
            }
        }
        return top;
    }
}

const [n, k, ...nums] = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const h = new Heap();  // 最小堆積
for (const x of nums.slice(0, n)) {
    h.push(x);
    if (h.size() > k) h.pop();  // 丟掉 k+1 個裡最小的
}
const result = [];
while (h.size() > 0) result.push(h.pop());
console.log(result.reverse().join(" "));`,
      },
    },
  ],
  visualization: {
    kind: 'heap', title: 'heapq：push 的上浮與 pop 的下沉', language: 'Python',
    code: code`import heapq
h = []
for x in [5, 3, 8, 1, 9, 2]:
    heapq.heappush(h, x)
print(h)
print(heapq.heappop(h))
print(heapq.heappop(h))
print(h[0])
print(h)`,
    steps: traceSteps(),
    playground: { structure: 'heap' },
  },
  quiz: [
    {
      id: 'q-push', prompt: '最小堆積的陣列是 `[1, 3, 5, 7, 4]`。push 2 之後，陣列變成什麼？',
      options: ['[1, 3, 2, 7, 4, 5]', '[1, 2, 3, 4, 5, 7]', '[1, 3, 5, 7, 4, 2]', '[1, 2, 5, 7, 4, 3]'],
      answer: 0, explanation: '2 先放到最後（索引 5）。它的父節點是索引 (5-1)/2 = 2 的 5，5 > 2，交換，變成 `[1, 3, 2, 7, 4, 5]`；再往上，索引 2 的父節點是根 1，1 ≤ 2，上浮結束。「[1, 2, 3, 4, 5, 7]」把堆積當成排序陣列；「[1, 3, 5, 7, 4, 2]」忘了上浮；「[1, 2, 5, 7, 4, 3]」用錯了父節點，把 2 和索引 1 的 3 交換，但索引 5 的父節點是索引 2。',
    },
    {
      id: 'q-pop', prompt: '最小堆積的陣列是 `[1, 3, 2, 7, 4, 5]`。依教科書的做法 pop 一次之後，陣列變成什麼？',
      options: ['[2, 3, 5, 7, 4]', '[3, 5, 2, 7, 4]', '[2, 3, 4, 5, 7]', '[3, 2, 7, 4, 5]'],
      answer: 0, explanation: '取出根 1，把最後一個元素 5 搬到根：`[5, 3, 2, 7, 4]`。5 的孩子是 3 和 2，較小的是索引 2 的 2，5 > 2，交換：`[2, 3, 5, 7, 4]`；索引 2 的孩子索引 5、6 已超出範圍，下沉結束（Python 的 heapq 結果也一樣）。「[3, 5, 2, 7, 4]」是固定和左孩子交換，結果根 3 比右孩子 2 大，不合法；「[2, 3, 4, 5, 7]」是重新排序；「[3, 2, 7, 4, 5]」是像普通 list 刪除開頭一樣把後面全部往前移，不但是 O(n)，根 3 也比孩子 2 大。',
    },
    {
      id: 'q-cpp-default', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'std::priority_queue<int> pq;\nfor (int x : {3, 1, 4, 1, 5}) pq.push(x);\nwhile (!pq.empty()) {\n    std::cout << pq.top() << " ";\n    pq.pop();\n}' },
      options: ['1 1 3 4 5', '5 4 3 1 1', '3 1 4 1 5', '5 1 4 1 3'],
      answer: 1, explanation: '`std::priority_queue<int>` 預設比較器是 `std::less<int>`，是最大堆積：`top()` 永遠是目前最大的值，所以依序取出 5、4、3、1、1。「1 1 3 4 5」是 Python heapq 或 Java PriorityQueue 的預設行為（最小堆積），C++ 要加 `std::greater<int>` 才會這樣；「3 1 4 1 5」是把它當成普通佇列（先進先出）；「5 1 4 1 3」是把它當成堆疊（後進先出）。',
    },
    {
      id: 'q-topk', prompt: '從 n 個數中，用「大小最多為 k 的最小堆積」找出最大的 k 個數（k 遠小於 n），時間複雜度是多少？',
      options: ['O(n log n)', 'O(n log k)', 'O(n × k)', 'O(k log n)'],
      answer: 1, explanation: '每個數都要 push 一次，堆積大小超過 k 時再 pop 一次；堆積最多 k + 1 個元素，每次操作 O(log k)，n 個數共 O(n log k)。O(n log n) 是整個排序或把 n 個數都放進同一個堆積的做法；O(n × k) 是每次在長度 k 的普通陣列中線性找最小值；O(k log n) 少算了讀過全部 n 個數的成本，至少要 O(n)。',
    },
    {
      id: 'q-java-iter', prompt: '一位同學想由小到大印出 PriorityQueue 的內容，寫了下面的 Java 程式，卻印出 `1 2 4 5 3`。原因是什麼？',
      code: { language: 'Java', text: 'PriorityQueue<Integer> pq = new PriorityQueue<>();\nfor (int x : new int[] {5, 1, 4, 2, 3}) pq.offer(x);\nfor (int x : pq) System.out.print(x + " ");' },
      options: ['PriorityQueue 預設是最大堆積，要加 Comparator', 'for-each 走訪的是內部堆積陣列的順序，只保證第一個是最小值；要排序的結果得反覆 poll()', 'offer() 不會維護堆積性質，要改用 add()', 'int 與 Integer 自動拆箱造成順序錯亂'],
      answer: 1, explanation: '`PriorityQueue` 的 iterator（for-each 與 `toString()` 都用它）照內部陣列的順序走，那只是一個合法的最小堆積 `[1, 2, 4, 5, 3]`，不是排序。只有 `poll()` 保證每次取出目前的最小值。Java 的 PriorityQueue 預設是最小堆積（第一個印出的正是最小值 1）；`offer` 和 `add` 都會上浮，行為相同；自動拆箱不影響順序。',
    },
    {
      id: 'q-choose', prompt: '下列哪個需求，只用堆積（優先佇列）不夠，應該改用平衡搜尋樹（C++ `std::set`、Java `TreeSet`）？',
      options: ['急診室每次叫最危急的病人', '從一百萬個數中找出最大的 10 個', '隨時查詢「大於等於 x 的最小值」，也要能刪除任意一個指定的值', '合併 k 個已排序的串列'],
      answer: 2, explanation: '堆積只保證根是最值，要找「大於等於 x 的最小值」或刪除任意一個值，都得掃過整個陣列，O(n)；平衡搜尋樹的 `lower_bound`／`ceiling` 與刪除都是 O(log n)。其他三個需求都只是反覆取出最值（急診、合併串列）或維持前 k 個（top-k），正是堆積擅長的事。',
    },
  ],
  exercises: [
    {
      id: 'e-min-heap-commands', title: '最小堆積指令',
      statement: '維護一個一開始為空的最小堆積（可以有重複的值），依序執行 q 個指令：`push x` 放入整數 x；`pop` 取出並輸出目前的最小值；`top` 輸出目前的最小值但不取出；`size` 輸出目前的元素個數。堆積是空的時候，`pop` 與 `top` 都輸出 `Empty`，堆積不變。請使用語言內建的堆積：C++ `std::priority_queue`、Python `heapq`、Java `PriorityQueue`；JavaScript 沒有內建的堆積，請自己用陣列寫一個最小堆積。',
      inputFormat: '第一行是整數 q。接下來 q 行，每行一個指令：`push x`、`pop`、`top` 或 `size`。',
      outputFormat: '每個 `pop`、`top`、`size` 指令輸出一行。',
      constraints: ['1 ≤ q ≤ 2×10^5', '−10^9 ≤ x ≤ 10^9', '指令一定是上述四種之一'],
      samples: [{ kind: 'normal', input: '8\npush 5\npush 1\npush 3\ntop\npop\npop\nsize\npop', output: '1\n1\n3\n1\n5', note: '依序取出 1、3、5' }],
      tests: [
        { kind: 'normal', input: '8\npush 5\npush 1\npush 3\ntop\npop\npop\nsize\npop', output: '1\n1\n3\n1\n5', note: '依序取出 1、3、5' },
        { kind: 'normal', input: '9\npush 10\npush 4\npop\npush 7\npush 2\ntop\npop\npop\nsize', output: '4\n2\n2\n7\n1', note: 'push 與 pop 交錯' },
        { kind: 'edge', input: '8\npush 2\npush 2\npush 1\npush 2\npop\npop\npop\nsize', output: '1\n2\n2\n1', note: '重複的值各自保留' },
        { kind: 'edge', input: '6\npush -5\npush 3\npush -10\npop\ntop\nsize', output: '-10\n-5\n2', note: '負數' },
        { kind: 'edge', input: '4\npush 42\ntop\npop\nsize', output: '42\n42\n0', note: '只有一個元素' },
        { kind: 'edge', input: '4\npush 1000000000\npush -1000000000\npop\npop', output: '-1000000000\n1000000000', note: '值的上下界' },
        { kind: 'edge', input: `200\n${Array.from({ length: 100 }, (_, i) => `push ${100 - i}`).join('\n')}\n${Array(100).fill('pop').join('\n')}`,
          output: Array.from({ length: 100 }, (_, i) => String(i + 1)).join('\n'), note: '由大到小放入 100 個數，每次都要上浮到根；再全部取出，得到 1 到 100' },
        { kind: 'error', input: '1\npop', output: 'Empty', note: '對空堆積 pop' },
        { kind: 'error', input: '2\ntop\nsize', output: 'Empty\n0', note: '對空堆積 top，大小仍是 0' },
        { kind: 'error', input: '6\npush 3\npop\npop\ntop\npush 4\ntop', output: '3\nEmpty\nEmpty\n4', note: '取空之後再 pop、top，之後仍能正常放入' },
      ],
      hints: [
        '每次 `pop` 或 `top` 之前先檢查是否為空：C++ `pq.empty()`、Python `not h`、Java `pq.isEmpty()`、JavaScript `h.size() === 0`。',
        'C++ 要最小堆積，寫 `std::priority_queue<int, std::vector<int>, std::greater<int>>`；取出時先 `top()` 再 `pop()`。',
        'Python 用一個 list 搭配 `heapq.heappush`、`heapq.heappop` 與 `h[0]`；Java 用 `offer`、`poll`、`peek`；JavaScript 自己寫 `push`（放到最後再上浮）、`pop`（最後一個搬到根再下沉）與 `peek`。',
        '最多 2×10^5 個指令，輸入輸出要快：C++ 關掉同步、Python 用 `sys.stdin`、Java 用 `BufferedReader` 與 `StringBuilder`、JavaScript 用 `readFileSync(0)` 一次讀完，輸出收集起來最後一次印出。',
      ],
      solution: {
        'C++': code`#include <functional>
#include <iostream>
#include <queue>
#include <string>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int q;
    std::cin >> q;
    std::priority_queue<int, std::vector<int>, std::greater<int>> pq;
    std::string cmd;
    for (int i = 0; i < q; i++) {
        std::cin >> cmd;
        if (cmd == "push") {
            int x;
            std::cin >> x;
            pq.push(x);
        } else if (cmd == "pop") {
            if (pq.empty()) {
                std::cout << "Empty\n";
            } else {
                std::cout << pq.top() << "\n";
                pq.pop();
            }
        } else if (cmd == "top") {
            if (pq.empty()) std::cout << "Empty\n";
            else std::cout << pq.top() << "\n";
        } else {
            std::cout << pq.size() << "\n";
        }
    }
    return 0;
}`,
        Python: code`import heapq
import sys


def main():
    data = sys.stdin.read().split()
    q = int(data[0])
    h = []
    out = []
    i = 1
    for _ in range(q):
        cmd = data[i]
        i += 1
        if cmd == "push":
            heapq.heappush(h, int(data[i]))
            i += 1
        elif cmd == "pop":
            out.append(str(heapq.heappop(h)) if h else "Empty")
        elif cmd == "top":
            out.append(str(h[0]) if h else "Empty")
        else:
            out.append(str(len(h)))
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.PriorityQueue;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int q = Integer.parseInt(in.readLine().trim());
        PriorityQueue<Integer> pq = new PriorityQueue<>();
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < q; i++) {
            StringTokenizer st = new StringTokenizer(in.readLine());
            String cmd = st.nextToken();
            if (cmd.equals("push")) {
                pq.offer(Integer.parseInt(st.nextToken()));
            } else if (cmd.equals("pop")) {
                out.append(pq.isEmpty() ? "Empty" : String.valueOf(pq.poll())).append('\n');
            } else if (cmd.equals("top")) {
                out.append(pq.isEmpty() ? "Empty" : String.valueOf(pq.peek())).append('\n');
            } else {
                out.append(pq.size()).append('\n');
            }
        }
        System.out.print(out);
    }
}`,
        JavaScript: code`// JavaScript 沒有內建的堆積：自己用陣列寫一個二元堆積
// before(a, b) 為 true 表示 a 要比 b 先取出；預設是最小堆積
class Heap {
    constructor(before = (a, b) => a < b) {
        this.items = [];
        this.before = before;
    }

    size() {
        return this.items.length;
    }

    peek() {
        return this.items[0];  // 讀最值：索引 0
    }

    push(x) {  // 放到最後，再上浮
        const a = this.items;
        a.push(x);
        let i = a.length - 1;
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (!this.before(a[i], a[parent])) break;
            [a[i], a[parent]] = [a[parent], a[i]];
            i = parent;
        }
    }

    pop() {  // 取出根；最後一個搬到根，再下沉
        const a = this.items;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            while (true) {
                const left = 2 * i + 1, right = 2 * i + 2;
                let best = i;  // 自己和兩個孩子中，最該先取出的那個
                if (left < a.length && this.before(a[left], a[best])) best = left;
                if (right < a.length && this.before(a[right], a[best])) best = right;
                if (best === i) break;
                [a[i], a[best]] = [a[best], a[i]];
                i = best;
            }
        }
        return top;
    }
}

const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/);
const q = Number(data[0]);
const h = new Heap();  // 最小堆積
const out = [];
let pos = 1;
for (let i = 0; i < q; i++) {
    const cmd = data[pos++];
    if (cmd === "push") {
        h.push(Number(data[pos++]));
    } else if (cmd === "pop") {
        out.push(h.size() === 0 ? "Empty" : String(h.pop()));
    } else if (cmd === "top") {
        out.push(h.size() === 0 ? "Empty" : String(h.peek()));
    } else {
        out.push(String(h.size()));
    }
}
console.log(out.join("\n"));`,
      },
      judge: 'none',
    },
  ],
};

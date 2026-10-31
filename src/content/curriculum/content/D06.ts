import type { LessonContent, TraceStep } from '../schema';
import { containerSteps, type ContainerOp } from '../simulate';

const code = String.raw;

/**
 * The trace's operations for the round-robin program: the queue operation, why it happens, the variables after it
 * and everything printed so far (prints happen between operations, so they show up from the next step on).
 */
const L0 = "{'A': 2, 'B': 1, 'C': 2}";
const traceOps: { op: ContainerOp; why: string; vars: Record<string, string>; output?: string }[] = [
  { op: { op: 'push', value: 'A', line: 5 }, why: '`append` 就是 enqueue：A 第一個排隊，站在最前面。', vars: { name: "'A'", left: L0 } },
  { op: { op: 'push', value: 'B', line: 5 }, why: 'B 排在 A 後面。', vars: { name: "'B'", left: L0 } },
  { op: { op: 'push', value: 'C', line: 5 }, why: 'C 排在最後。三個工作都排好了，接著進入 while 迴圈。', vars: { name: "'C'", left: L0 } },
  { op: { op: 'pop', line: 7 }, why: '`popleft` 就是 dequeue：輪到最早排隊的 A 執行一個時間單位。', vars: { job: "'A'", left: L0 } },
  { op: { op: 'push', value: 'A', line: 10 }, why: 'A 執行後還剩 1 單位（大於 0），所以重新排到隊尾，等 B、C 都輪過一次再回來。這就是輪流執行（round-robin）。', vars: { job: "'A'", left: "{'A': 1, 'B': 1, 'C': 2}" } },
  { op: { op: 'pop', line: 7 }, why: '上一輪印出了 `A back`。現在前端是 B。', vars: { job: "'B'", left: "{'A': 1, 'B': 1, 'C': 2}" }, output: 'A back' },
  { op: { op: 'pop', line: 7 }, why: 'B 執行後剩 0，印出 `B done`，不再排隊。現在輪到 C。', vars: { job: "'C'", left: "{'A': 1, 'B': 0, 'C': 2}" }, output: 'A back\nB done' },
  { op: { op: 'push', value: 'C', line: 10 }, why: 'C 還剩 1 單位，回到隊尾，排在 A 後面。', vars: { job: "'C'", left: "{'A': 1, 'B': 0, 'C': 1}" }, output: 'A back\nB done' },
  { op: { op: 'pop', line: 7 }, why: '上一輪印出了 `C back`。A 第二次輪到。', vars: { job: "'A'", left: "{'A': 1, 'B': 0, 'C': 1}" }, output: 'A back\nB done\nC back' },
  { op: { op: 'pop', line: 7 }, why: 'A 剩 0，印出 `A done`。最後輪到 C。', vars: { job: "'C'", left: "{'A': 0, 'B': 0, 'C': 1}" }, output: 'A back\nB done\nC back\nA done' },
  { op: { op: 'empty', line: 6 }, why: 'C 也做完了（印出 `C done`）。`while q:` 再檢查一次：佇列是空的，條件不成立，迴圈結束。不先檢查就 `popleft()`，會丟出 `IndexError`。', vars: { job: "'C'", left: "{'A': 0, 'B': 0, 'C': 0}", 'not q': 'True' }, output: 'A back\nB done\nC back\nA done\nC done' },
];

const traceSteps: TraceStep[] = [
  { line: 3, note: '建立空佇列 q（`collections.deque`）。left 記錄每個工作還需要幾個時間單位；每次輪到的工作只執行 1 單位。', vars: { left: L0 },
    containers: [{ name: 'q', kind: 'queue', items: [] }] },
  ...containerSteps('q', 'queue', traceOps.map(t => t.op)).map((step, i) => {
    const t = traceOps[i];
    const simVars = Object.fromEntries(Object.entries(step.vars ?? {}).filter(([k]) => k !== 'empty()'));
    return { ...step, note: `${step.note}${t.why}`, vars: { ...t.vars, ...simVars }, ...(t.output ? { output: t.output } : {}) };
  }),
  { line: 14, note: '迴圈結束後印出 `empty: True`。完成的順序是 B、A、C：需要時間短的 B 先做完，但每個工作都公平地輪流取得執行時間。', vars: { left: "{'A': 0, 'B': 0, 'C': 0}" },
    containers: [{ name: 'q', kind: 'queue', items: [] }], output: 'A back\nB done\nC back\nA done\nC done\nempty: True' },
];

/** Exercise edge test: capacity 3, the head index wraps around many times. */
const wrapInput = ['3 2004', 'enqueue 1', 'enqueue 2',
  ...Array.from({ length: 1000 }, (_, k) => 'enqueue ' + (k + 3) + '\ndequeue'), 'size', 'front'].join('\n');
const wrapOutput = [...Array.from({ length: 1000 }, (_, k) => String(k + 1)), '2', '1001'].join('\n');

/** D06 Queue. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const D06: LessonContent = {
  lessonId: 'D06',
  motivation: '印表機一份一份印文件、客服電話依來電順序接聽、作業系統讓多個程式輪流使用 CPU、網路卡暫存還來不及處理的封包，背後都是同一個規則：先來的先處理。佇列（queue）從尾端放入、從前端取出，選對容器時每個操作都是 O(1)。它也是之後廣度優先搜尋（BFS）的核心。限制是：只能看到前端（和尾端），不能直接處理中間的元素；要「最近的那一個」時該用上一課的堆疊，要依優先順序取出時則要用優先佇列（D15）。',
  sections: [
    {
      id: 'fifo', title: '先進先出：enqueue、dequeue、front',
      blocks: [
        { type: 'p', text: '想像排隊買票：新來的人排到隊伍最後面（尾端，back／rear），售票員從最前面（前端，front）開始服務。佇列的規則就是先進先出（FIFO，First In First Out）。它的操作只有幾個：' },
        { type: 'list', items: [
          'enqueue（入隊）：把 x 放到尾端。C++ 叫 `push`，Python 是 `append`，Java 是 `offer`。',
          'dequeue（出隊）：移除前端的元素。C++ 叫 `pop`，Python 是 `popleft`，Java 是 `poll`。',
          'front／peek：讀取前端的元素，但不移除。',
          'empty／size：是否沒有元素、目前有幾個元素。',
        ] },
        { type: 'p', text: '放入只動尾端、取出只動前端，用對了容器就不需要搬動其他元素。下面依序放入 10、20、30，取出一個，再放入 40，最後全部取出：取出的順序和放入的順序相同。頁面中「相關互動實驗」的 Queue 實驗可以用動畫看 enqueue 與 dequeue 的過程。' },
        { type: 'example', id: 'basic-fifo' },
        { type: 'table', head: ['操作', 'C++ `std::queue`', 'Python `collections.deque`', 'Java `ArrayDeque`（`Queue` 介面）'], rows: [
          ['放入尾端（enqueue）', '`q.push(x)`，O(1)', '`q.append(x)`，O(1)', '`q.offer(x)`，攤銷 O(1)'],
          ['移除前端（dequeue）', '`q.pop()`，O(1)，不回傳值', '`q.popleft()`，O(1)，回傳該值', '`q.poll()`，O(1)，回傳該值'],
          ['讀取前端', '`q.front()`，O(1)', '`q[0]`，O(1)', '`q.peek()`，O(1)'],
          ['讀取尾端', '`q.back()`，O(1)', '`q[-1]`，O(1)', '`Queue` 介面沒有；`ArrayDeque` 的 `peekLast()`，O(1)'],
          ['是否為空／大小', '`q.empty()`、`q.size()`，O(1)', '`not q`、`len(q)`，O(1)', '`q.isEmpty()`、`q.size()`，O(1)'],
        ] },
      ],
    },
    {
      id: 'array-front', title: '為什麼不從陣列開頭刪除',
      blocks: [
        { type: 'p', text: '最直覺的寫法是用一般的陣列（Python `list`、C++ `vector`、Java `ArrayList`）：尾端 append，前端刪除。問題在「前端刪除」：陣列的元素在記憶體中連續存放，刪掉第 0 個之後，後面的每個元素都要往前移一格，才能維持「索引 0 是第一個」。這是 D02 講過的 O(n) 搬移。' },
        { type: 'table', head: ['做法', '移除前端', '原因'], rows: [
          ['Python `list.pop(0)`', 'O(n)', '後面 n − 1 個元素全部往前移一格'],
          ['C++ `v.erase(v.begin())`', 'O(n)', '同上'],
          ['Java `ArrayList.remove(0)`', 'O(n)', '同上'],
          ['`collections.deque`／`std::deque`／`ArrayDeque`', 'O(1)', '前端有預留空間，只調整前端的位置'],
          ['環狀佇列（陣列 + head + size）', 'O(1)', '只把 head 索引往後移一格，元素都不動'],
        ] },
        { type: 'p', text: '一次 O(n) 看起來不嚴重，但佇列通常要把 n 個元素全部取出：用 `list.pop(0)` 取完 n 個元素，總共要搬移約 n²/2 次。n = 100,000 時大約是 50 億次搬移，遠比 deque 的 10 萬次操作慢。' },
        { type: 'p', text: '另一種想法是不真的刪除，只用一個 head 索引記住「目前的前端在哪」，dequeue 時 `head += 1`。這樣每次都是 O(1)，但前面已經取出的格子永遠空在那裡，不斷進出的佇列會一直佔用更多記憶體。把陣列「頭尾相接」重複使用這些格子，就是後面要介紹的環狀佇列。' },
      ],
    },
    {
      id: 'languages', title: '三種語言的佇列與空佇列',
      blocks: [
        { type: 'p', text: 'C++：`std::queue` 和 `std::stack` 一樣是容器配接器（container adaptor），預設包住 `std::deque`，也可以寫成 `std::queue<int, std::list<int>>`；但不能用 `std::vector`，因為 vector 沒有 `pop_front`。`pop()` 的回傳型別是 `void`，要先用 `front()` 讀出前端，再 `pop()`。' },
        { type: 'p', text: 'Python：用 `collections.deque`，`append(x)` 放到右邊（尾端）、`popleft()` 從左邊（前端）取出，兩個都是 O(1)。標準函式庫另外有 `queue.Queue`，它是給多執行緒（thread）程式在執行緒之間安全傳遞資料用的，內部有鎖，佇列空時 `get()` 預設會一直等待；一般演算法題目用 `deque` 就好。' },
        { type: 'p', text: 'Java：`Queue` 是介面（interface），常用的實作是 `ArrayDeque`，宣告成 `Queue<Integer> q = new ArrayDeque<>();`。`LinkedList` 也實作了 `Queue`，但 Java 官方文件指出 `ArrayDeque` 當佇列用時通常比 `LinkedList` 快。`Queue` 的每個操作都有兩種版本，差別在失敗時的反應：' },
        { type: 'table', head: ['動作', '失敗時丟出例外', '失敗時回傳特殊值'], rows: [
          ['放入尾端', '`add(x)`：容量受限的佇列滿了丟出 `IllegalStateException`', '`offer(x)`：回傳 `false`'],
          ['移除前端', '`remove()`：空佇列丟出 `NoSuchElementException`', '`poll()`：回傳 `null`'],
          ['讀取前端', '`element()`：空佇列丟出 `NoSuchElementException`', '`peek()`：回傳 `null`'],
        ] },
        { type: 'p', text: '`ArrayDeque` 沒有容量上限，所以 `add` 與 `offer` 都一定成功；但它不能放入 `null`，因為 `null` 被拿來表示「佇列是空的」。三種語言在空佇列上的反應整理如下：' },
        { type: 'table', head: ['語言', '空佇列上 dequeue', '空佇列上讀前端'], rows: [
          ['C++ `std::queue`', '`pop()`：未定義行為（undefined behavior）', '`front()`：未定義行為'],
          ['Python `deque`', '`popleft()` 丟出 `IndexError: pop from an empty deque`', '`q[0]` 丟出 `IndexError`'],
          ['Java `ArrayDeque`', '`poll()` 回傳 `null`；`remove()` 丟出 `NoSuchElementException`', '`peek()` 回傳 `null`；`element()` 丟出例外'],
        ] },
        { type: 'callout', tone: 'warning', title: '取出之前先確認佇列不是空的', text: 'C++ 在空佇列上 `front()` 或 `pop()` 是未定義行為：程式可能當掉，也可能讀到垃圾值後若無其事地繼續跑，最難除錯。Java 的 `poll()` 不會出錯，但 `int x = q.poll();` 在空佇列上會因為 `null` 自動拆箱（unboxing）成 int 而丟出 `NullPointerException`。所以每次 dequeue 或讀前端之前，都先用 `empty()`／`not q`／`isEmpty()` 檢查，或像 `while q:` 一樣把檢查寫在迴圈條件裡。' },
      ],
    },
    {
      id: 'circular', title: '環狀佇列：用陣列和取餘數頭尾相接',
      blocks: [
        { type: 'p', text: '環狀佇列（circular queue，也叫環形緩衝區 ring buffer）用一個固定容量 capacity 的陣列，把最後一格和第 0 格想成相鄰，繞成一個圈。只需要記兩個整數：' },
        { type: 'list', items: [
          '`head`：前端元素所在的索引。',
          '`size`：目前有幾個元素。',
          '下一個要寫入的位置（尾端之後）是 `tail = (head + size) % capacity`；取餘數（%）讓超過最後一格的索引繞回 0。',
          'enqueue：`size == capacity` 時已滿；否則寫入 `a[tail]`，`size += 1`。',
          'dequeue：`size == 0` 時是空的；否則讀出 `a[head]`，`head = (head + 1) % capacity`，`size -= 1`。',
        ] },
        { type: 'p', text: '每個操作只做幾次加法和取餘數，元素從不搬動，所以都是 O(1)，而且記憶體固定是 capacity 格。下面的程式用容量 4 的陣列：先放滿 1～4（第 5 個放不進去），取出 1、2 之後再放入 5、6，它們繞回索引 0、1。所以實體陣列的內容是 `5 6 3 4`，但從 head = 2 開始讀，邏輯順序仍然是 3、4、5、6。' },
        { type: 'example', id: 'ring-buffer' },
        { type: 'callout', tone: 'tip', title: '為什麼要記 size，而不只記 head 和 tail', text: '如果只記 head 和 tail，佇列空的時候 head == tail，放滿的時候 tail 繞一圈回來，也是 head == tail，兩種情況分不出來。記下 size 就能直接判斷：`size == 0` 是空、`size == capacity` 是滿。另一種常見做法是故意空一格不用，規定 `(tail + 1) % capacity == head` 時就算滿。' },
        { type: 'p', text: '取餘數只在被除數非負時三種語言才一致：C++ 與 Java 的 `-1 % 4` 是 −1，Python 是 3。往後退一格（下一課雙端佇列的 push_front 會用到）要寫成 `(head - 1 + capacity) % capacity`，三種語言都會得到正確的非負索引。Java 的 `ArrayDeque` 內部其實就是一個會自動擴容的環狀陣列。' },
      ],
    },
    {
      id: 'applications', title: '佇列的應用與比較',
      blocks: [
        { type: 'list', items: [
          '工作排程：印表機佇列依送達順序列印；作業系統的輪流排程（round-robin）讓每個程式執行一小段時間（時間片，time slice），沒做完就排回隊尾。',
          '緩衝區（buffer）：鍵盤輸入、網路封包、影音串流的資料先放進佇列，處理的一方再依序取出，兩邊的速度不必一樣；固定大小的緩衝區常用環狀佇列實作。',
          '廣度優先搜尋（BFS，A14）：從起點出發，把下一層的節點放進佇列，依序取出擴展，就會一層一層往外走，並得到無權圖的最短距離。',
        ] },
        { type: 'p', text: '下面模擬輪流排程：三個工作 A、B、C 分別需要 5、2、3 個時間單位，每次輪到時最多執行 2 單位（quantum），沒做完就回到隊尾。下方的視覺化用更小的例子逐步追蹤同樣的過程。' },
        { type: 'example', id: 'round-robin' },
        { type: 'table', head: ['', '堆疊 Stack（D05）', '佇列 Queue（本課）', '雙端佇列 Deque（D07）'], rows: [
          ['規則', '後進先出（LIFO）', '先進先出（FIFO）', '兩端都能放入與取出'],
          ['放入／取出的位置', '都在頂端', '尾端放入、前端取出', '前端或尾端'],
          ['典型用途', '復原、括號配對、遞迴、DFS', '排隊模擬、工作排程、緩衝區、BFS', '同時需要兩端操作、滑動視窗'],
          ['C++／Python／Java', '`std::stack`／`list`／`ArrayDeque`', '`std::queue`／`deque`／`ArrayDeque`', '`std::deque`／`deque`／`ArrayDeque`'],
        ] },
        { type: 'p', text: '選擇的判斷：要處理「最早來的」用佇列，要處理「最近的」用堆疊，兩端都要用就選雙端佇列。注意三種語言的 deque／`ArrayDeque` 都能同時當堆疊和佇列，差別只在你從哪一端取出。' },
      ],
    },
  ],
  examples: [
    {
      id: 'basic-fifo', title: 'enqueue、front、dequeue 的基本操作', description: '依序放入 10、20、30，讀前端、取出一個，再放入 40 後全部取出。C++ 的 pop() 不回傳值，所以先用 front() 讀。',
      output: 'front: 10\ndequeue: 10\nsize: 3\ndequeue order: 20 30 40\nempty: yes',
      code: {
        'C++': code`#include <iostream>
#include <queue>

int main() {
    std::queue<int> q;
    q.push(10);
    q.push(20);
    q.push(30);
    std::cout << "front: " << q.front() << "\n";
    std::cout << "dequeue: " << q.front() << "\n";
    q.pop();  // pop() 不回傳值，先用 front() 讀
    q.push(40);
    std::cout << "size: " << q.size() << "\n";
    std::cout << "dequeue order:";
    while (!q.empty()) {
        std::cout << " " << q.front();
        q.pop();
    }
    std::cout << "\n";
    std::cout << "empty: " << (q.empty() ? "yes" : "no") << "\n";
    return 0;
}`,
        Python: code`from collections import deque

q = deque()
q.append(10)
q.append(20)
q.append(30)
print("front:", q[0])
print("dequeue:", q.popleft())
q.append(40)
print("size:", len(q))
order = []
while q:
    order.append(q.popleft())
print("dequeue order:", *order)
print("empty:", "yes" if not q else "no")`,
        Java: code`import java.util.ArrayDeque;
import java.util.Queue;

public class Main {
    public static void main(String[] args) {
        Queue<Integer> q = new ArrayDeque<>();
        q.offer(10);
        q.offer(20);
        q.offer(30);
        System.out.println("front: " + q.peek());
        System.out.println("dequeue: " + q.poll());
        q.offer(40);
        System.out.println("size: " + q.size());
        StringBuilder order = new StringBuilder("dequeue order:");
        while (!q.isEmpty()) order.append(" ").append(q.poll());
        System.out.println(order);
        System.out.println("empty: " + (q.isEmpty() ? "yes" : "no"));
    }
}`,
      },
    },
    {
      id: 'ring-buffer', title: '固定容量的環狀佇列', description: '用容量 4 的陣列加上 head、size 與取餘數實作佇列：放滿後拒絕新元素，取出後的空格被繞回來重複使用。',
      output: 'enqueue 5: full\ndequeue: 1\ndequeue: 2\nslots: 5 6 3 4\nhead: 2 size: 4\ndequeue order: 3 4 5 6\nhead: 2 size: 0',
      code: {
        'C++': code`#include <iostream>
#include <vector>

struct RingQueue {
    std::vector<int> a;
    int cap, head = 0, size = 0;
    explicit RingQueue(int c) : a(c), cap(c) {}
    bool push(int x) {
        if (size == cap) return false;  // 滿了
        a[(head + size) % cap] = x;
        ++size;
        return true;
    }
    int pop() {  // 呼叫前要先確認 size > 0
        int x = a[head];
        head = (head + 1) % cap;
        --size;
        return x;
    }
};

int main() {
    RingQueue q(4);
    for (int x = 1; x <= 5; ++x) {
        if (!q.push(x)) std::cout << "enqueue " << x << ": full\n";
    }
    std::cout << "dequeue: " << q.pop() << "\n";
    std::cout << "dequeue: " << q.pop() << "\n";
    q.push(5);
    q.push(6);
    std::cout << "slots:";
    for (int v : q.a) std::cout << " " << v;
    std::cout << "\nhead: " << q.head << " size: " << q.size << "\n";
    std::cout << "dequeue order:";
    while (q.size > 0) std::cout << " " << q.pop();
    std::cout << "\nhead: " << q.head << " size: " << q.size << "\n";
    return 0;
}`,
        Python: code`class RingQueue:
    def __init__(self, cap):
        self.a = [0] * cap
        self.head = 0
        self.size = 0

    def push(self, x):
        if self.size == len(self.a):
            return False  # 滿了
        self.a[(self.head + self.size) % len(self.a)] = x
        self.size += 1
        return True

    def pop(self):  # 呼叫前要先確認 size > 0
        x = self.a[self.head]
        self.head = (self.head + 1) % len(self.a)
        self.size -= 1
        return x


q = RingQueue(4)
for x in range(1, 6):
    if not q.push(x):
        print("enqueue", str(x) + ":", "full")
print("dequeue:", q.pop())
print("dequeue:", q.pop())
q.push(5)
q.push(6)
print("slots:", *q.a)
print("head:", q.head, "size:", q.size)
order = []
while q.size > 0:
    order.append(q.pop())
print("dequeue order:", *order)
print("head:", q.head, "size:", q.size)`,
        Java: code`public class Main {
    static int[] a = new int[4];
    static int head = 0, size = 0;

    static boolean push(int x) {
        if (size == a.length) return false;  // 滿了
        a[(head + size) % a.length] = x;
        size++;
        return true;
    }

    static int pop() {  // 呼叫前要先確認 size > 0
        int x = a[head];
        head = (head + 1) % a.length;
        size--;
        return x;
    }

    public static void main(String[] args) {
        for (int x = 1; x <= 5; x++) {
            if (!push(x)) System.out.println("enqueue " + x + ": full");
        }
        System.out.println("dequeue: " + pop());
        System.out.println("dequeue: " + pop());
        push(5);
        push(6);
        StringBuilder slots = new StringBuilder("slots:");
        for (int v : a) slots.append(" ").append(v);
        System.out.println(slots);
        System.out.println("head: " + head + " size: " + size);
        StringBuilder order = new StringBuilder("dequeue order:");
        while (size > 0) order.append(" ").append(pop());
        System.out.println(order);
        System.out.println("head: " + head + " size: " + size);
    }
}`,
      },
    },
    {
      id: 'round-robin', title: '輪流排程模擬', description: '工作 A、B、C 需要 5、2、3 個時間單位，每次最多執行 2 單位，沒做完就回到隊尾。每行輸出一段執行時間與工作名稱。',
      output: '0-2 A\n2-4 B done\n4-6 C\n6-8 A\n8-9 C done\n9-10 A done',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <queue>
#include <utility>

int main() {
    const int quantum = 2;
    std::queue<std::pair<char, int>> q;  // (名稱, 剩餘時間)
    q.push({'A', 5});
    q.push({'B', 2});
    q.push({'C', 3});
    int t = 0;
    while (!q.empty()) {
        auto [name, left] = q.front();
        q.pop();
        int run = std::min(quantum, left);
        std::cout << t << "-" << t + run << " " << name;
        t += run;
        left -= run;
        if (left > 0) {
            q.push({name, left});  // 還沒做完，回到隊尾
            std::cout << "\n";
        } else {
            std::cout << " done\n";
        }
    }
    return 0;
}`,
        Python: code`from collections import deque

quantum = 2
q = deque([("A", 5), ("B", 2), ("C", 3)])  # (名稱, 剩餘時間)
t = 0
while q:
    name, left = q.popleft()
    run = min(quantum, left)
    line = str(t) + "-" + str(t + run) + " " + name
    t += run
    left -= run
    if left > 0:
        q.append((name, left))  # 還沒做完，回到隊尾
        print(line)
    else:
        print(line, "done")`,
        Java: code`import java.util.ArrayDeque;
import java.util.Queue;

public class Main {
    public static void main(String[] args) {
        final int quantum = 2;
        String[] names = {"A", "B", "C"};
        int[] left = {5, 2, 3};
        Queue<Integer> q = new ArrayDeque<>();  // 存工作的編號
        for (int i = 0; i < names.length; i++) q.offer(i);
        int t = 0;
        while (!q.isEmpty()) {
            int job = q.poll();
            int run = Math.min(quantum, left[job]);
            String line = t + "-" + (t + run) + " " + names[job];
            t += run;
            left[job] -= run;
            if (left[job] > 0) {
                q.offer(job);  // 還沒做完，回到隊尾
                System.out.println(line);
            } else {
                System.out.println(line + " done");
            }
        }
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'stack-queue', title: '輪流執行：取出前端，沒做完就排回隊尾', language: 'Python',
    code: code`from collections import deque
left = {"A": 2, "B": 1, "C": 2}
q = deque()
for name in "ABC":
    q.append(name)
while q:
    job = q.popleft()
    left[job] -= 1
    if left[job] > 0:
        q.append(job)
        print(job, "back")
    else:
        print(job, "done")
print("empty:", not q)`,
    steps: traceSteps,
    playground: { structure: 'queue' },
  },
  quiz: [
    {
      id: 'q-order', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'from collections import deque\nq = deque()\nfor x in [1, 2, 3]:\n    q.append(x)\nprint(q.popleft(), end=" ")\nq.append(4)\nq.append(5)\nprint(q.popleft(), end=" ")\nprint(q.popleft(), end=" ")\nprint(q[0])' },
      options: ['1 2 3 4', '3 5 4 2', '1 2 3 5', '1 5 4 2'],
      answer: 0, explanation: '放入 1、2、3 後 popleft 取出最早放入的 1，剩 [2, 3]；放入 4、5 變成 [2, 3, 4, 5]；再 popleft 兩次依序得到 2、3，剩 [4, 5]；`q[0]` 讀前端 4（不移除）。「3 5 4 2」是把它當成堆疊（後進先出）；「1 2 3 5」把 `q[0]` 誤當成尾端（尾端是 `q[-1]`）；「1 5 4 2」以為新放入的 4、5 會排到前面。',
    },
    {
      id: 'q-complexity', prompt: 'Python 中有 n 個元素時，`lst.pop(0)`（lst 是 list）和 `dq.popleft()`（dq 是 collections.deque）的時間複雜度各是多少？',
      options: ['兩個都是 O(1)', '`lst.pop(0)` 是 O(n)，`dq.popleft()` 是 O(1)', '`lst.pop(0)` 是 O(1)，`dq.popleft()` 是 O(n)', '兩個都是 O(n)'],
      answer: 1, explanation: 'list 的元素連續存放，刪掉第 0 個後其餘 n − 1 個元素都要往前移一格，是 O(n)；deque 的前端有預留空間，`popleft()` 只調整前端位置，是 O(1)。兩者寫起來都只有一行，但用 `pop(0)` 取完 n 個元素總共是 O(n²)。`lst.pop()`（不帶參數，從尾端取）才是 O(1)，不要和 `pop(0)` 搞混。',
    },
    {
      id: 'q-java-empty', prompt: '下面的 Java 程式片段執行時會怎樣？',
      code: { language: 'Java', text: 'Queue<Integer> q = new ArrayDeque<>();\nSystem.out.println(q.poll());\nSystem.out.println(q.remove());' },
      options: ['兩行都印出 null', '第一行就丟出 NoSuchElementException', '先印出 null，第二行丟出 NoSuchElementException', '兩行都丟出 EmptyStackException'],
      answer: 2, explanation: '`Queue` 的操作分兩組：`poll()` 在空佇列上回傳 `null`，所以第一行印出 null；`remove()` 在空佇列上丟出 `NoSuchElementException`。以為兩個都回傳 null，或兩個都丟例外，都是把兩組方法搞混了。`EmptyStackException` 只有舊的 `java.util.Stack` 會丟出，和佇列無關。',
    },
    {
      id: 'q-circular', prompt: '一個用陣列實作的環狀佇列，capacity = 5，目前 head = 3、size = 4。此時 enqueue 一個新元素，它會寫入陣列的哪個索引？',
      options: ['索引 7', '索引 2', '索引 1', '索引 3'],
      answer: 1, explanation: '寫入位置是 `(head + size) % capacity = (3 + 4) % 5 = 2`。目前的 4 個元素在索引 3、4、0、1，下一格就是 2；寫入後 size = 5，佇列滿了。「索引 7」忘了取餘數，會超出陣列範圍；「索引 1」是 `(head + size - 1) % capacity`，也就是目前尾端元素的位置，寫進去會蓋掉它；「索引 3」是前端 head，寫進去會蓋掉最早排隊的元素。',
    },
    {
      id: 'q-choose', prompt: '下列哪個情境最適合用佇列，而不是堆疊？',
      options: ['文字編輯器的「復原」（undo）', '檢查程式碼的括號是否配對', '瀏覽器的「上一頁」按鈕', '網頁伺服器依請求抵達的順序處理請求'],
      answer: 3, explanation: '依抵達順序處理是「先來先服務」，最早到的先處理，就是先進先出，用佇列。復原要撤銷最近的一個動作、括號配對要先配對最近的左括號、上一頁要回到最近離開的頁面，三者都是「最近的那一個先出來」，是後進先出，用堆疊（D05）。',
    },
  ],
  exercises: [
    {
      id: 'e-circular-queue', title: '實作環狀佇列',
      statement: '請用一個長度為 C 的陣列加上 head（前端索引）與 size（元素個數）實作容量固定為 C 的環狀佇列，依序執行 Q 個指令。不可以使用語言內建的佇列或 deque，每個指令都要是 O(1)。指令有四種：`enqueue x` 把整數 x 放到尾端，成功時不輸出，佇列已滿（已有 C 個元素）時輸出 `Full` 且佇列不變；`dequeue` 移除前端元素並輸出它，佇列是空的時輸出 `Empty`；`front` 輸出前端元素但不移除，空的時輸出 `Empty`；`size` 輸出目前的元素個數。',
      inputFormat: '第一行兩個整數 C 與 Q。接下來 Q 行，每行一個指令：`enqueue x`、`dequeue`、`front` 或 `size`。',
      outputFormat: '依序輸出每個 `dequeue`、`front`、`size` 指令的結果，以及每次放不進去時的 `Full`，每個一行。保證至少有一行輸出。',
      constraints: ['1 ≤ C ≤ 100,000', '1 ≤ Q ≤ 200,000', '−1,000,000,000 ≤ x ≤ 1,000,000,000', '指令一定是上述四種之一，格式正確'],
      samples: [{ kind: 'normal', input: '3 8\nenqueue 10\nenqueue 20\nfront\ndequeue\nenqueue 30\nenqueue 40\nsize\ndequeue', output: '10\n10\n3\n20', note: 'front 不移除；取出 10 後還能再放兩個' }],
      tests: [
        { kind: 'normal', input: '3 8\nenqueue 10\nenqueue 20\nfront\ndequeue\nenqueue 30\nenqueue 40\nsize\ndequeue', output: '10\n10\n3\n20', note: 'front 不移除；取出 10 後還能再放兩個' },
        { kind: 'normal', input: '4 9\nenqueue 3\nenqueue 1\nenqueue 4\ndequeue\nenqueue 1\nenqueue 5\nsize\ndequeue\nfront', output: '3\n4\n1\n4', note: '5 寫入時繞回索引 0，佇列剛好放滿' },
        { kind: 'edge', input: '1 7\nenqueue 5\nenqueue 6\nfront\ndequeue\nenqueue 6\ndequeue\ndequeue', output: 'Full\n5\n5\n6\nEmpty', note: '容量 1：放一個就滿，取出後又能再放' },
        { kind: 'edge', input: wrapInput, output: wrapOutput, note: '容量 3，連續 1000 次放入與取出，head 繞了三百多圈' },
        { kind: 'edge', input: '2 5\nenqueue -1000000000\nenqueue 1000000000\ndequeue\ndequeue\nsize', output: '-1000000000\n1000000000\n0', note: '負數與最大值' },
        { kind: 'error', input: '2 3\ndequeue\nfront\nsize', output: 'Empty\nEmpty\n0', note: '一開始就對空佇列 dequeue 與 front' },
        { kind: 'error', input: '2 5\nenqueue 7\nenqueue 8\nenqueue 9\nfront\nsize', output: 'Full\n7\n2', note: '已滿時放入 9 被拒絕，佇列不變' },
        { kind: 'error', input: '2 8\nenqueue 1\nenqueue 2\ndequeue\nenqueue 3\nenqueue 4\ndequeue\ndequeue\ndequeue', output: '1\nFull\n2\n3\nEmpty', note: '繞回之後仍要正確判斷滿與空' },
        { kind: 'error', input: '3 6\nenqueue 1\ndequeue\ndequeue\nenqueue 2\nfront\nsize', output: '1\nEmpty\n2\n1', note: '取空之後再 dequeue，接著還能正常使用' },
      ],
      hints: [
        '開一個長度 C 的陣列，head = 0、size = 0。下一個要寫入的位置是 `(head + size) % C`。',
        'dequeue 時讀出 `a[head]`，再令 `head = (head + 1) % C`、`size -= 1`；不需要清除舊的格子。',
        '用 size 判斷滿與空：`size == C` 是滿、`size == 0` 是空。只看 head 和尾端位置是否相等，分不出這兩種情況。',
        'Q 可以到 200,000：Python 用 `sys.stdin` 一次讀入，Java 用 `BufferedReader`，輸出都先收集起來最後一次印出。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int cap, q;
    std::cin >> cap >> q;
    std::vector<long long> a(cap);
    int head = 0, size = 0;
    std::string cmd, out;
    for (int i = 0; i < q; ++i) {
        std::cin >> cmd;
        if (cmd == "enqueue") {
            long long x;
            std::cin >> x;
            if (size == cap) {
                out += "Full\n";
            } else {
                a[(head + size) % cap] = x;
                ++size;
            }
        } else if (cmd == "dequeue") {
            if (size == 0) {
                out += "Empty\n";
            } else {
                out += std::to_string(a[head]) + "\n";
                head = (head + 1) % cap;
                --size;
            }
        } else if (cmd == "front") {
            out += size == 0 ? std::string("Empty\n") : std::to_string(a[head]) + "\n";
        } else {
            out += std::to_string(size) + "\n";
        }
    }
    std::cout << out;
    return 0;
}`,
        Python: code`import sys


def main():
    data = sys.stdin.read().split()
    cap, q = int(data[0]), int(data[1])
    a = [0] * cap
    head = size = 0
    out = []
    i = 2
    for _ in range(q):
        cmd = data[i]
        i += 1
        if cmd == "enqueue":
            x = int(data[i])
            i += 1
            if size == cap:
                out.append("Full")
            else:
                a[(head + size) % cap] = x
                size += 1
        elif cmd == "dequeue":
            if size == 0:
                out.append("Empty")
            else:
                out.append(str(a[head]))
                head = (head + 1) % cap
                size -= 1
        elif cmd == "front":
            out.append("Empty" if size == 0 else str(a[head]))
        else:
            out.append(str(size))
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        int cap = Integer.parseInt(st.nextToken());
        int q = Integer.parseInt(st.nextToken());
        int[] a = new int[cap];
        int head = 0, size = 0;
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < q; i++) {
            st = new StringTokenizer(br.readLine());
            String cmd = st.nextToken();
            if (cmd.equals("enqueue")) {
                int x = Integer.parseInt(st.nextToken());
                if (size == cap) {
                    out.append("Full\n");
                } else {
                    a[(head + size) % cap] = x;
                    size++;
                }
            } else if (cmd.equals("dequeue")) {
                if (size == 0) {
                    out.append("Empty\n");
                } else {
                    out.append(a[head]).append("\n");
                    head = (head + 1) % cap;
                    size--;
                }
            } else if (cmd.equals("front")) {
                out.append(size == 0 ? "Empty" : String.valueOf(a[head])).append("\n");
            } else {
                out.append(size).append("\n");
            }
        }
        System.out.print(out);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

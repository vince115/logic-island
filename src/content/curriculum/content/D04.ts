import type { LessonContent } from '../schema';
import { linkedListSteps } from '../simulate';

const code = String.raw;

/** D04 Linked List. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const D04: LessonContent = {
  lessonId: 'D04',
  motivation: '動態陣列在中間插入或刪除一個元素，後面的元素全部要搬一格；鏈結串列（linked list）把每筆資料放在各自的節點裡，用指標串起來，只要改一兩個指標就能插入或刪除，不必搬動其他資料。它是許多結構的零件：雜湊表的鏈結法、LRU 快取（雜湊表加雙向串列）、作業系統管理空閒記憶體的清單，都用到它。代價是不能用索引直接跳到第 k 個、每個節點多佔指標的空間、節點散落在記憶體各處而對快取不友善——所以實務上多數情況動態陣列反而比較快，學會鏈結串列的同時也要知道什麼時候不該用它。',
  sections: [
    {
      id: 'nodes', title: '節點與指標：資料怎麼串起來',
      blocks: [
        { type: 'p', text: '單向鏈結串列（singly linked list）由一個個節點（node）組成，每個節點存兩樣東西：資料 `value`，以及指向下一個節點的指標（pointer，Python 與 Java 稱為參考 reference）`next`。最後一個節點的 `next` 是「空」，表示串列到此結束。整個串列只需要記住第一個節點的位置，稱為 `head`；串列是空的時候，`head` 本身就是空。' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java'], rows: [
          ['節點的定義', '`struct Node { int value; Node* next; };`', '`class Node:` 在 `__init__` 設定 `self.value`、`self.next`', '`static class Node { int value; Node next; }`'],
          ['「空」怎麼寫', '`nullptr`', '`None`', '`null`'],
          ['建立節點', '`new Node{3, head}`（回傳指標）', '`Node(3, head)`', '`new Node(3, head)`'],
          ['取下一個節點', '`cur->next`（等於 `(*cur).next`）', '`cur.next`', '`cur.next`'],
          ['變數存的是', '指標：節點的位址', '參考：指向節點物件', '參考：指向節點物件'],
        ] },
        { type: 'p', text: '三種語言的變數存的都是「節點在哪裡」，不是節點本身：Python 寫 `b = a`、Java 寫 `Node b = a;`、C++ 寫 `Node* b = a;`，都只是讓 b 也指向同一個節點，沒有複製任何節點。所以透過 b 修改 `b.next`，從 a 走過去也會看到改變——這正是串列能「改一個指標就重新接線」的原因。' },
        { type: 'p', text: '在頭端加入（push_front）只要兩步：新節點的 `next` 指向目前的 head，再讓 head 指向新節點，與串列長度無關，是 O(1)。走訪（traversal）則從 head 開始，用 `cur = cur.next` 一個一個往下走，直到 cur 變成空為止。下面依序在頭端放入 3、2、1，得到 1 → 2 → 3，再走訪一遍印出並計算長度：' },
        { type: 'example', id: 'build-print' },
        { type: 'p', text: '輸出的 `null` 只是我們選擇印出的文字，用來標示串列結尾；三種語言都印同一個字，方便比對。下方的視覺化可以逐步看到每個操作改了哪些指標，最後的「試試看」也能用自己的數字操作串列。' },
      ],
    },
    {
      id: 'insert-delete', title: '插入、刪除與「前一個節點」',
      blocks: [
        { type: 'p', text: '尾端加入（push_back）：如果只記住 head，就得從 head 走到最後一個節點，再把它的 `next` 指向新節點，是 O(n)。多記一個指向最後節點的 `tail` 指標，就能直接接上去，降為 O(1)；代價是每個會改到最後一個節點的操作（加入第一個節點、刪除最後一個節點）都要記得同步更新 tail。' },
        { type: 'p', text: '在某個節點 p 之後插入新節點 n：先讓 `n.next = p.next`（n 接上 p 原本的下一個），再讓 `p.next = n`。只改兩個指標，找到 p 之後是 O(1)。' },
        { type: 'callout', tone: 'warning', title: '指標的修改順序不能顛倒', text: '如果先寫 `p.next = n`，p 原本後面那一大段串列就再也找不到了（沒有任何變數指向它）；接著 `n.next = p.next` 只會讓 n 指向自己。原則是：先把新節點接到「後面」，再讓「前面」指向新節點——任何時刻都不要讓還需要的節點失去所有指向它的指標。' },
        { type: 'p', text: '依值刪除：單向串列只能往後走，要刪除 cur，必須改的是「cur 前一個節點」的 `next`，所以走訪時要同時記住 `prev`。找到後讓 `prev.next = cur.next`，cur 就被跳過了。如果要刪的正好是第一個節點，它沒有前一個節點（prev 是空），這時要改的是 head 本身：`head = cur.next`。這個特例最容易忘記。' },
        { type: 'example', id: 'remove-value' },
        { type: 'callout', tone: 'tip', title: '虛擬頭節點（dummy head）', text: '在 head 前面放一個不存資料的節點 dummy，令 `dummy.next = head`，再從 `prev = dummy` 開始找。這樣每個真正的節點都有前一個節點，刪除頭節點不再是特例；最後取 `head = dummy.next` 即可。C++ 可以直接宣告區域變數 `Node dummy{0, head};`，用 `&dummy` 當 prev 的起點。' },
      ],
    },
    {
      id: 'reverse-memory', title: '原地反轉、記憶體與空指標',
      blocks: [
        { type: 'p', text: '反轉串列是練習指標操作的經典題：不建立新節點，只把每個節點的 `next` 改成指向前一個。需要三個變數：prev（已反轉部分的頭）、cur（正在處理的節點）、nxt（先存好 cur 原本的下一個，否則改掉 `cur.next` 後就找不到了）。每一輪改一個指標，O(n) 時間、O(1) 額外空間。' },
        { type: 'example', id: 'reverse' },
        { type: 'p', text: '記憶體的管理三種語言不同。C++ 用 `new` 建立的節點不會自動釋放，刪除節點或程式結束前要自己 `delete`，否則就是記憶體洩漏（memory leak）；更安全的寫法是用 `std::unique_ptr<Node>` 當 next，節點在沒有擁有者時自動釋放（但很長的串列會連鎖解構，可能用光堆疊，通常改用迴圈逐一釋放）。Python 與 Java 有垃圾回收（garbage collection）：一個節點不再被任何變數或節點指向，就會被自動回收，所以刪除只要把它從串列「跳過」即可。' },
        { type: 'callout', tone: 'warning', title: '對空指標取 next', text: '當 cur 已經是空的，還去讀 `cur->next` 或 `cur.next`：C++ 是未定義行為（undefined behavior），通常當掉（segmentation fault），但不保證；Python 丟出 `AttributeError: \'NoneType\' object has no attribute \'next\'`；Java 丟出 `NullPointerException`。常見原因：空串列沒有先判斷、迴圈條件寫成 `cur.next != null` 卻在迴圈裡又往下走兩步、刪除後繼續使用已刪除的節點（C++ 中這是懸空指標 dangling pointer）。每次要用 `x.next` 之前，先確定 x 不是空的。' },
      ],
    },
    {
      id: 'vs-array', title: '鏈結串列與動態陣列的取捨',
      blocks: [
        { type: 'p', text: '動態陣列（D02）把元素放在連續的記憶體中，可以用索引直接算出位置；鏈結串列的節點散落各處，只能沿著 next 一個一個走。下表比較常見操作的時間複雜度（n 是元素個數）：' },
        { type: 'table', head: ['操作', '單向串列（只有 head）', '單向串列＋tail', '雙向串列（std::list、LinkedList）', '動態陣列（vector、list、ArrayList）'], rows: [
          ['讀第 k 個元素', 'O(k)，最壞 O(n)', 'O(k)，最壞 O(n)', 'O(n)', 'O(1)'],
          ['頭端加入', 'O(1)', 'O(1)', 'O(1)', 'O(n)（全部後移）'],
          ['尾端加入', 'O(n)（先走到尾）', 'O(1)', 'O(1)', '攤銷 O(1)'],
          ['在已知節點之後插入', 'O(1)', 'O(1)', 'O(1)', 'O(n)（後面元素後移）'],
          ['刪除頭端', 'O(1)', 'O(1)', 'O(1)', 'O(n)（全部前移）'],
          ['刪除尾端', 'O(n)（要找到倒數第二個）', 'O(n)（tail 也幫不上）', 'O(1)', 'O(1)'],
          ['依值搜尋', 'O(n)', 'O(n)', 'O(n)', 'O(n)（未排序時）'],
        ] },
        { type: 'p', text: '「插入是 O(1)」只在已經握有那個位置的節點時成立；如果要先從 head 找到第 k 個位置，找的過程就是 O(k)。所以「在第 k 個位置插入」對兩種結構其實都是 O(n)，差別在串列花在「走」、陣列花在「搬」。' },
        { type: 'table', head: ['比較項目', '鏈結串列', '動態陣列'], rows: [
          ['記憶體配置', '每個節點各自配置，散落各處', '一整塊連續空間，滿了再整塊搬到更大的空間'],
          ['每個元素的額外空間', '至少一個指標（雙向是兩個；64 位元系統一個指標 8 bytes），加上每次配置的開銷', '只有預留的容量（最多約與元素一樣多）'],
          ['快取（cache）', '走訪時常要跳到別處的記憶體，快取命中率低', '相鄰元素一起載入快取，循序走訪非常快'],
          ['插入或刪除後', '其他節點的位置不變，指向它們的指標仍有效', '後面的元素被搬動；擴容時全部搬家'],
        ] },
        { type: 'callout', tone: 'note', title: '先想清楚需要哪些操作', text: '需要用索引隨機存取、或只在尾端加入時，選動態陣列；需要在「手上已有的位置」頻繁插入刪除、或要求其他元素的位置在修改後保持不變時，才考慮鏈結串列。只在兩端進出的情況，用 deque（C++ `std::deque`、Python `collections.deque`、Java `ArrayDeque`）通常比串列更好。' },
      ],
    },
    {
      id: 'library', title: '各語言標準函式庫中的鏈結串列',
      blocks: [
        { type: 'p', text: '考試與練習常要求自己寫節點，但實際開發時先看標準函式庫。三種語言提供的東西並不對等：' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java'], rows: [
          ['單向串列', '`std::forward_list<int>`（沒有 `size()`、只能 `push_front`）', '沒有內建，自己寫 class', '沒有內建，自己寫 class'],
          ['雙向串列', '`std::list<int>`', '沒有通用的串列型別；`collections.deque` 是以區塊組成的雙向串列，只適合兩端操作', '`java.util.LinkedList<Integer>`（同時實作 `List` 與 `Deque`）'],
          ['兩端加入與刪除（O(1)）', '`push_front`、`push_back`、`pop_front`、`pop_back`（list）', '`appendleft`、`append`、`popleft`、`pop`', '`addFirst`、`addLast`、`removeFirst`、`removeLast`'],
          ['在某個位置插入', '`l.insert(it, x)`：給迭代器，O(1)；forward_list 用 `insert_after`', '`d.insert(i, x)`：O(n)', '`ListIterator` 的 `add(x)`：O(1)；`list.add(i, x)` 要先走到 i，O(n)'],
          ['取第 i 個', '沒有 `[]`；`std::next(l.begin(), i)` 是 O(i)', '`d[i]`：兩端 O(1)，中間 O(n)', '`list.get(i)`：從較近的一端走過去，O(n)'],
        ] },
        { type: 'p', text: '迭代器穩定性（iterator stability）是 `std::list` 的主要優點：插入不會讓任何迭代器失效，刪除只讓指向被刪元素的迭代器失效。相比之下，`std::vector` 插入時，插入點之後的迭代器都會失效，若觸發擴容則全部失效。Java 的 `LinkedList` 迭代器是 fail-fast：走訪途中若不是透過該迭代器本身修改串列，下一次操作會丟出 `ConcurrentModificationException`。' },
        { type: 'callout', tone: 'warning', title: 'Java LinkedList 配 get(i) 的迴圈是 O(n²)', text: '`for (int i = 0; i < list.size(); i++) sum += list.get(i);` 在 `ArrayList` 上是 O(n)，換成 `LinkedList` 卻是 O(n²)：每次 `get(i)` 都要從頭或尾重新走到第 i 個。走訪 LinkedList 請用 for-each（`for (int x : list)`）或迭代器，一次往下走一步。另外，Java 文件指出 `ArrayDeque` 當佇列使用時通常比 `LinkedList` 快。' },
        { type: 'p', text: 'Python 的 `list` 是動態陣列，不是鏈結串列；`collections.deque`（CPython 的實作是由固定大小區塊串成的雙向串列）適合當佇列或雙端佇列，兩端進出都是 O(1)，但不適合用索引在中間插入或讀取。需要真正的節點操作時，就像本課一樣自己定義 `Node` 類別。' },
      ],
    },
  ],
  examples: [
    {
      id: 'build-print', title: '建立串列並走訪', description: '在頭端依序放入 3、2、1，從 head 走到結尾印出每個值並計算長度。C++ 最後逐一 delete 節點。',
      output: '1 -> 2 -> 3 -> null\nlength = 3',
      code: {
        'C++': code`#include <initializer_list>
#include <iostream>

struct Node {
    int value;
    Node* next;
};

int main() {
    Node* head = nullptr;
    for (int v : {3, 2, 1}) head = new Node{v, head};  // push_front
    int length = 0;
    for (Node* cur = head; cur != nullptr; cur = cur->next) {
        std::cout << cur->value << " -> ";
        ++length;
    }
    std::cout << "null\n" << "length = " << length << "\n";
    while (head != nullptr) {  // 釋放每個節點
        Node* next = head->next;
        delete head;
        head = next;
    }
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next


head = None
for v in (3, 2, 1):
    head = Node(v, head)  # push_front
parts = []
cur = head
while cur is not None:
    parts.append(str(cur.value))
    cur = cur.next
print(" -> ".join(parts + ["null"]))
print("length =", len(parts))`,
        Java: code`public class Main {
    static class Node {
        int value;
        Node next;
        Node(int value, Node next) {
            this.value = value;
            this.next = next;
        }
    }

    public static void main(String[] args) {
        Node head = null;
        for (int v : new int[] {3, 2, 1}) head = new Node(v, head);  // push_front
        StringBuilder sb = new StringBuilder();
        int length = 0;
        for (Node cur = head; cur != null; cur = cur.next) {
            sb.append(cur.value).append(" -> ");
            length++;
        }
        System.out.println(sb.append("null"));
        System.out.println("length = " + length);
    }
}`,
      },
    },
    {
      id: 'remove-value', title: '依值刪除：記住前一個節點', description: '串列 5 → 8 → 3 → 1，依序刪除 8（中間）、5（頭節點的特例）、7（不存在）。',
      output: '5 -> 8 -> 3 -> 1 -> null\nremove 8: 5 -> 3 -> 1 -> null\nremove 5: 3 -> 1 -> null\nremove 7: not found',
      code: {
        'C++': code`#include <initializer_list>
#include <iostream>

struct Node {
    int value;
    Node* next;
};

void print(const Node* head) {
    for (const Node* cur = head; cur != nullptr; cur = cur->next) std::cout << cur->value << " -> ";
    std::cout << "null\n";
}

bool removeValue(Node*& head, int x) {  // head 以參考傳入：刪除頭節點要改它
    Node* prev = nullptr;
    Node* cur = head;
    while (cur != nullptr && cur->value != x) {
        prev = cur;
        cur = cur->next;
    }
    if (cur == nullptr) return false;       // 找不到
    if (prev == nullptr) head = cur->next;  // 刪除的是頭節點
    else prev->next = cur->next;            // 前一個節點跳過 cur
    delete cur;
    return true;
}

int main() {
    Node* head = nullptr;
    for (int v : {1, 3, 8, 5}) head = new Node{v, head};
    print(head);
    for (int x : {8, 5, 7}) {
        std::cout << "remove " << x << ": ";
        if (removeValue(head, x)) print(head);
        else std::cout << "not found\n";
    }
    while (head != nullptr) removeValue(head, head->value);
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next


def show(head):
    parts = []
    while head is not None:
        parts.append(str(head.value))
        head = head.next
    return " -> ".join(parts + ["null"])


def remove_value(head, x):
    """刪除第一個 x，回傳 (新的 head, 是否刪除)。"""
    prev, cur = None, head
    while cur is not None and cur.value != x:
        prev, cur = cur, cur.next
    if cur is None:
        return head, False
    if prev is None:
        return cur.next, True  # 刪除的是頭節點
    prev.next = cur.next
    return head, True


head = None
for v in (1, 3, 8, 5):
    head = Node(v, head)
print(show(head))
for x in (8, 5, 7):
    head, ok = remove_value(head, x)
    print(f"remove {x}: {show(head) if ok else 'not found'}")`,
        Java: code`public class Main {
    static class Node {
        int value;
        Node next;
        Node(int value, Node next) {
            this.value = value;
            this.next = next;
        }
    }

    static Node head = null;

    static String show() {
        StringBuilder sb = new StringBuilder();
        for (Node cur = head; cur != null; cur = cur.next) sb.append(cur.value).append(" -> ");
        return sb.append("null").toString();
    }

    static boolean removeValue(int x) {
        Node prev = null, cur = head;
        while (cur != null && cur.value != x) {
            prev = cur;
            cur = cur.next;
        }
        if (cur == null) return false;       // 找不到
        if (prev == null) head = cur.next;   // 刪除的是頭節點
        else prev.next = cur.next;           // 前一個節點跳過 cur
        return true;
    }

    public static void main(String[] args) {
        for (int v : new int[] {1, 3, 8, 5}) head = new Node(v, head);
        System.out.println(show());
        for (int x : new int[] {8, 5, 7}) {
            System.out.println("remove " + x + ": " + (removeValue(x) ? show() : "not found"));
        }
    }
}`,
      },
    },
    {
      id: 'reverse', title: '原地反轉串列', description: '用 prev、cur、nxt 三個變數，把每個節點的 next 改成指向前一個，不建立新節點。',
      output: 'before: 1 -> 2 -> 3 -> 4 -> null\nafter: 4 -> 3 -> 2 -> 1 -> null',
      code: {
        'C++': code`#include <iostream>

struct Node {
    int value;
    Node* next;
};

void print(const char* label, const Node* head) {
    std::cout << label;
    for (const Node* cur = head; cur != nullptr; cur = cur->next) std::cout << cur->value << " -> ";
    std::cout << "null\n";
}

int main() {
    Node* head = nullptr;
    for (int v = 4; v >= 1; --v) head = new Node{v, head};
    print("before: ", head);
    Node* prev = nullptr;
    Node* cur = head;
    while (cur != nullptr) {
        Node* nxt = cur->next;  // 先記住原本的下一個
        cur->next = prev;       // 反轉這一個指標
        prev = cur;
        cur = nxt;
    }
    head = prev;  // 原本的最後一個節點成為新的 head
    print("after: ", head);
    while (head != nullptr) {
        Node* next = head->next;
        delete head;
        head = next;
    }
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next


def show(head):
    parts = []
    while head is not None:
        parts.append(str(head.value))
        head = head.next
    return " -> ".join(parts + ["null"])


head = None
for v in range(4, 0, -1):
    head = Node(v, head)
print("before:", show(head))
prev, cur = None, head
while cur is not None:
    nxt = cur.next   # 先記住原本的下一個
    cur.next = prev  # 反轉這一個指標
    prev, cur = cur, nxt
head = prev  # 原本的最後一個節點成為新的 head
print("after:", show(head))`,
        Java: code`public class Main {
    static class Node {
        int value;
        Node next;
        Node(int value, Node next) {
            this.value = value;
            this.next = next;
        }
    }

    static String show(Node head) {
        StringBuilder sb = new StringBuilder();
        for (Node cur = head; cur != null; cur = cur.next) sb.append(cur.value).append(" -> ");
        return sb.append("null").toString();
    }

    public static void main(String[] args) {
        Node head = null;
        for (int v = 4; v >= 1; v--) head = new Node(v, head);
        System.out.println("before: " + show(head));
        Node prev = null, cur = head;
        while (cur != null) {
            Node nxt = cur.next;  // 先記住原本的下一個
            cur.next = prev;      // 反轉這一個指標
            prev = cur;
            cur = nxt;
        }
        head = prev;  // 原本的最後一個節點成為新的 head
        System.out.println("after: " + show(head));
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'linked-list', title: '單向鏈結串列：只有 head 時的加入、插入、搜尋與刪除', language: 'Python',
    code: code`# lst：只有 head 的單向串列（方法的寫法見本課各節）
lst = LinkedList()
lst.push_front(3)
lst.push_front(1)
lst.push_back(5)
lst.insert_after(1, 2)
lst.find(5)
lst.remove(3)
lst.remove(1)
lst.remove(9)
lst.push_front(0)
print(lst)`,
    steps: [
      { line: 2, note: '建立空串列：head 是 None（畫面上以 null 表示串列結尾），還沒有任何節點。', list: { name: 'lst', nodes: [], pointers: { head: null } } },
      ...linkedListSteps('lst', [
        { line: 3, op: 'push_front', value: '3' },
        { line: 4, op: 'push_front', value: '1' },
        { line: 5, op: 'push_back', value: '5' },
        { line: 6, op: 'insert_after', target: '1', value: '2' },
        { line: 7, op: 'find', value: '5' },
        { line: 8, op: 'remove', value: '3' },
        { line: 9, op: 'remove', value: '1' },
        { line: 10, op: 'remove', value: '9' },
        { line: 11, op: 'push_front', value: '0' },
      ]),
      { line: 12, note: '印出串列：從 head 沿著 next 走到結尾，依序印出 0、2、5。', list: { name: 'lst', nodes: ['0', '2', '5'], pointers: { head: 0 } }, output: '0 -> 2 -> 5 -> null' },
    ],
    playground: { structure: 'list' },
  },
  quiz: [
    {
      id: 'q1', prompt: '要在節點 p 之後插入新節點 n（n 是剛建立的節點，`n->next` 是 `nullptr`）。哪一種寫法正確？',
      options: [
        '`n->next = p->next; p->next = n;`',
        '`p->next = n; n->next = p->next;`',
        '`n->next = p; p->next = n;`',
        '`p->next = n->next; n->next = p;`',
      ],
      answer: 0, explanation: '先讓 n 接上 p 原本的下一個，再讓 p 指向 n，串列才完整。第二個選項先改了 `p->next`，p 後面原本那一段就沒有任何指標指向它而遺失，接著 `n->next = p->next` 只是讓 n 指向自己，形成環。第三個選項讓 n 指回 p，同樣弄丟後面的串列並形成環。第四個選項先把 `p->next` 設成 n 的 next（也就是 nullptr），後面的串列直接斷掉，n 也沒有接進串列。',
    },
    {
      id: 'q2', prompt: '`list` 是有 n 個元素的 Java `LinkedList<Integer>`。下面的迴圈總共要花多少時間？',
      code: { language: 'Java', text: 'long sum = 0;\nfor (int i = 0; i < list.size(); i++) {\n    sum += list.get(i);\n}' },
      options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(1)，因為 size() 是 O(1)'],
      answer: 2, explanation: '`LinkedList.get(i)` 沒有索引可以直接跳，要從較近的一端一個節點一個節點走到第 i 個，最多約 n/2 步；n 次呼叫加起來約 n²/4 步，是 O(n²)。O(n) 是同樣的迴圈用在 `ArrayList` 上的成本（get 是 O(1)），也是改用 for-each 或迭代器走訪 LinkedList 的成本。`size()` 確實是 O(1)，但瓶頸在 get。',
    },
    {
      id: 'q3', prompt: '下面的 C++ 函式要刪除第一個值為 x 的節點。它有什麼問題？',
      code: { language: 'C++', text: 'void removeValue(Node* head, int x) {\n    Node* prev = head;\n    while (prev->next != nullptr && prev->next->value != x)\n        prev = prev->next;\n    if (prev->next != nullptr) {\n        Node* del = prev->next;\n        prev->next = del->next;\n        delete del;\n    }\n}' },
      options: [
        '頭節點的值是 x 時刪不掉；串列是空的（head 是 nullptr）時，`prev->next` 對空指標取值，是未定義行為',
        '刪除最後一個節點時，`del->next` 是 nullptr，會讓串列斷掉',
        '`delete del` 之後，`prev->next` 會變成懸空指標',
        '沒有問題，所有情況都正確',
      ],
      answer: 0, explanation: '迴圈一開始就比較 `prev->next->value`，也就是從第二個節點開始比，頭節點永遠不會被檢查；空串列時 prev 是 nullptr，`prev->next` 對空指標取值，C++ 是未定義行為（常見結果是當掉）。刪除最後一個節點時讓 `prev->next = nullptr` 正是正確的新結尾，不是錯誤；`prev->next` 在 delete 之前已改成 `del->next`，不會指向被釋放的節點。修正方式：加上虛擬頭節點 `Node dummy{0, head};` 從 `&dummy` 開始找，並把 head 改為以參考 `Node*& head` 傳入，最後令 `head = dummy.next`。',
    },
    {
      id: 'q4', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'class Node:\n    def __init__(self, value, next=None):\n        self.value, self.next = value, next\n\na = Node(1, Node(2, Node(3)))\nb = a.next\nb.next = Node(4, b.next)\na.next = b.next\ncur, out = a, []\nwhile cur:\n    out.append(cur.value)\n    cur = cur.next\nprint(out)' },
      options: ['[1, 2, 4, 3]', '[1, 4, 3]', '[1, 2, 3]', '[1, 4, 2, 3]'],
      answer: 1, explanation: '一開始是 1 → 2 → 3，`b` 指向值為 2 的節點（不是複製）。`b.next = Node(4, b.next)` 在 2 之後插入 4：1 → 2 → 4 → 3。接著 `a.next = b.next` 讓 1 直接指向 4，值為 2 的節點被跳過，串列變成 1 → 4 → 3。選 [1, 2, 4, 3] 是漏看了最後一次重新接線；[1, 4, 2, 3] 則誤以為 4 插在 1 與 2 之間。',
    },
    {
      id: 'q5', prompt: '下列哪一種情況，鏈結串列明顯比動態陣列合適？',
      options: [
        '讀入 10⁵ 個數後，反覆查詢「第 k 個數是多少」',
        '已經握有某個元素的位置（迭代器），要在它後面插入大量元素，而且指向其他元素的迭代器必須保持有效',
        '存放 10⁶ 個整數，從頭到尾加總很多次',
        '只在尾端加入與刪除元素，當作堆疊使用',
      ],
      answer: 1, explanation: '在已知位置插入，串列只改兩個指標（O(1)），而且 `std::list` 插入不會讓其他迭代器失效；動態陣列每次要搬動後面的元素（O(n)），擴容時迭代器全部失效。查詢第 k 個需要隨機存取，陣列 O(1)、串列 O(k)。大量循序加總時，陣列的連續記憶體對快取友善得多。只在尾端操作時，動態陣列的 push_back／pop_back 已是攤銷 O(1)，又沒有每個節點的配置開銷。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '用指令操作單向鏈結串列',
      statement: '用自己定義的節點（`Node`，含值與 next）實作一個單向鏈結串列，不可以用 `std::vector`、`std::list`、Python 的 `list`、Java 的 `ArrayList`／`LinkedList` 等現成容器存放元素。串列一開始是空的，依序執行 q 個指令：`push_front x` 把 x 放到最前面；`push_back x` 把 x 放到最後面；`remove x` 刪除從頭數來第一個值為 x 的節點，如果串列中沒有 x，輸出 `Not found` 且串列不變；`print` 從頭到尾輸出串列，格式為每個值後接 ` -> `、最後接 `null`（例如 `1 -> 2 -> null`），串列是空的則輸出 `empty`。',
      inputFormat: '第一行是指令數 q。接下來 q 行，每行一個指令：`push_front x`、`push_back x`、`remove x` 或 `print`。',
      outputFormat: '每個 `print` 輸出一行串列內容或 `empty`；每個找不到值的 `remove` 輸出一行 `Not found`。其他指令不輸出。',
      constraints: ['1 ≤ q ≤ 5000', '−10⁹ ≤ x ≤ 10⁹（x 是整數）', '指令只會是上述四種', 'push_front 與 push_back 都必須是 O(1)（提示：多記一個 tail）'],
      samples: [{ kind: 'normal', input: '6\npush_back 2\npush_front 1\npush_back 3\nprint\nremove 2\nprint', output: '1 -> 2 -> 3 -> null\n1 -> 3 -> null', note: '在兩端加入，再刪除中間的 2' }],
      tests: [
        { kind: 'normal', input: '6\npush_back 2\npush_front 1\npush_back 3\nprint\nremove 2\nprint', output: '1 -> 2 -> 3 -> null\n1 -> 3 -> null', note: '一般情況：兩端加入、刪除中間' },
        { kind: 'normal', input: '4\npush_front 1\npush_front 2\npush_front 3\nprint', output: '3 -> 2 -> 1 -> null', note: '一直在頭端加入，順序相反' },
        { kind: 'normal', input: '5\npush_back 5\npush_back 7\npush_back 5\nremove 5\nprint', output: '7 -> 5 -> null', note: '有重複值時只刪除第一個' },
        { kind: 'edge', input: '1\nprint', output: 'empty', note: '空串列直接輸出' },
        { kind: 'edge', input: '4\npush_back 1\npush_back 2\nremove 1\nprint', output: '2 -> null', note: '刪除頭節點：head 要改指向下一個' },
        { kind: 'edge', input: '5\npush_front 9\nremove 9\nprint\npush_back 4\nprint', output: 'empty\n4 -> null', note: '刪除唯一的節點後串列變空，tail 也要清掉，之後 push_back 才正確' },
        { kind: 'edge', input: '5\npush_back 1\npush_back 2\nremove 2\npush_back 3\nprint', output: '1 -> 3 -> null', note: '刪除最後一個節點：tail 要改成前一個節點' },
        { kind: 'edge', input: '3\npush_front 1\npush_back 2\nprint', output: '1 -> 2 -> null', note: '空串列的第一個 push_front 也要設定 tail' },
        { kind: 'edge', input: '3\npush_back -1000000000\npush_front 1000000000\nprint', output: '1000000000 -> -1000000000 -> null', note: '值的上下限與負數' },
        { kind: 'error', input: '3\npush_back 1\nremove 4\nprint', output: 'Not found\n1 -> null', note: '刪除不存在的值：輸出 Not found，串列不變' },
        { kind: 'error', input: '2\nremove 1\nprint', output: 'Not found\nempty', note: '對空串列刪除：不能對空的 head 取 next' },
      ],
      hints: [
        '記住 head 與 tail 兩個指標。push_front 改 head，push_back 接在 tail 後面；串列原本是空的時候，兩者都要指向新節點。',
        'remove 時同時記住 prev 與 cur。cur 是頭節點（prev 為空）時改 head，否則改 `prev.next`；被刪的是 tail 時，tail 改成 prev。',
        '迴圈條件先檢查 cur 不是空的，再讀 `cur.value`，就不會對空指標取值。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>

struct Node {
    int value;
    Node* next;
};

int main() {
    int q;
    std::cin >> q;
    Node* head = nullptr;
    Node* tail = nullptr;
    while (q--) {
        std::string cmd;
        std::cin >> cmd;
        if (cmd == "print") {
            if (head == nullptr) {
                std::cout << "empty\n";
                continue;
            }
            for (Node* cur = head; cur != nullptr; cur = cur->next) std::cout << cur->value << " -> ";
            std::cout << "null\n";
            continue;
        }
        int x;
        std::cin >> x;
        if (cmd == "push_front") {
            head = new Node{x, head};
            if (tail == nullptr) tail = head;
        } else if (cmd == "push_back") {
            Node* node = new Node{x, nullptr};
            if (tail == nullptr) head = node;
            else tail->next = node;
            tail = node;
        } else {  // remove
            Node* prev = nullptr;
            Node* cur = head;
            while (cur != nullptr && cur->value != x) {
                prev = cur;
                cur = cur->next;
            }
            if (cur == nullptr) {
                std::cout << "Not found\n";
                continue;
            }
            if (prev == nullptr) head = cur->next;
            else prev->next = cur->next;
            if (cur == tail) tail = prev;
            delete cur;
        }
    }
    while (head != nullptr) {
        Node* next = head->next;
        delete head;
        head = next;
    }
    return 0;
}`,
        Python: code`import sys


class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next


def main():
    lines = sys.stdin.read().splitlines()
    q = int(lines[0])
    head = tail = None
    out = []
    for line in lines[1:q + 1]:
        cmd, *rest = line.split()
        if cmd == "print":
            if head is None:
                out.append("empty")
                continue
            parts = []
            cur = head
            while cur is not None:
                parts.append(str(cur.value))
                cur = cur.next
            out.append(" -> ".join(parts) + " -> null")
            continue
        x = int(rest[0])
        if cmd == "push_front":
            head = Node(x, head)
            if tail is None:
                tail = head
        elif cmd == "push_back":
            node = Node(x)
            if tail is None:
                head = node
            else:
                tail.next = node
            tail = node
        else:  # remove
            prev, cur = None, head
            while cur is not None and cur.value != x:
                prev, cur = cur, cur.next
            if cur is None:
                out.append("Not found")
                continue
            if prev is None:
                head = cur.next
            else:
                prev.next = cur.next
            if cur is tail:
                tail = prev
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

public class Main {
    static class Node {
        int value;
        Node next;
        Node(int value, Node next) {
            this.value = value;
            this.next = next;
        }
    }

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int q = Integer.parseInt(br.readLine().trim());
        Node head = null, tail = null;
        StringBuilder out = new StringBuilder();
        for (int k = 0; k < q; k++) {
            String[] p = br.readLine().trim().split("\\s+");
            if (p[0].equals("print")) {
                if (head == null) {
                    out.append("empty\n");
                    continue;
                }
                for (Node cur = head; cur != null; cur = cur.next) out.append(cur.value).append(" -> ");
                out.append("null\n");
                continue;
            }
            int x = Integer.parseInt(p[1]);
            if (p[0].equals("push_front")) {
                head = new Node(x, head);
                if (tail == null) tail = head;
            } else if (p[0].equals("push_back")) {
                Node node = new Node(x, null);
                if (tail == null) head = node;
                else tail.next = node;
                tail = node;
            } else {  // remove
                Node prev = null, cur = head;
                while (cur != null && cur.value != x) {
                    prev = cur;
                    cur = cur.next;
                }
                if (cur == null) {
                    out.append("Not found\n");
                    continue;
                }
                if (prev == null) head = cur.next;
                else prev.next = cur.next;
                if (cur == tail) tail = prev;
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

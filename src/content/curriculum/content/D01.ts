import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * D01 資料結構概論. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); its arrays copy by reference, so copy-semantics needs no outputByLanguage.
 */
export const D01: LessonContent = {
  lessonId: 'D01',
  motivation: '同一個問題，選對資料結構可能讓程式從「跑好幾個小時」變成「一眨眼」：查詢學號是否在名單中、排行榜隨時找出最高分、瀏覽器記住上一頁，背後都是在挑一種擺放資料的方式。這一課先建立整張地圖：每種結構擅長什麼、不擅長什麼、每種語言用哪個容器。它的限制是只到「挑候選」為止——每種結構怎麼運作、怎麼實作，會在資料結構島後面的課程逐一展開；Big-O 也只是估計，不等於實際秒數。',
  sections: [
    {
      id: 'what-is', title: '資料結構＝擺放方式＋允許的操作',
      blocks: [
        { type: 'p', text: '資料結構（data structure）說的是兩件事：資料在記憶體裡怎麼擺放，以及它允許哪些操作、每個操作要花多少成本。同樣一串學號，放在陣列裡可以用索引直接拿到第 k 個；放進雜湊集合（hash set）裡，可以很快回答「某個學號在不在」，卻沒有「第 k 個」可言。' },
        { type: 'p', text: '抽象資料型別（Abstract Data Type, ADT）只規定「能做什麼」以及行為規則，不規定怎麼存。例如堆疊（stack）：`push` 放到頂端、`pop` 取走頂端、`top` 查看頂端，後放入的先取出（LIFO）。實作（implementation）則是具體的擺放方式：可以拿動態陣列的「尾端」當頂端，也可以拿鏈結串列的「頭端」當頂端。下面的範例用兩種實作執行同一串操作，對外行為完全一樣。' },
        { type: 'example', id: 'stack-two-ways' },
        { type: 'list', items: [
          'C++：`std::stack` 是容器配接器（container adaptor），預設底層是 `std::deque`，也可以寫 `std::stack<int, std::vector<int>>` 改用 `std::vector`。',
          'Python：直接用 `list` 的 `append`／`pop`／`a[-1]` 當堆疊，尾端操作都很快。',
          'Java：建議用 `ArrayDeque` 的 `push`／`pop`／`peek`；舊的 `Stack` 類別繼承自同步化的 `Vector`，一般不再推薦。',
          'JavaScript：直接用陣列的 `push`／`pop`／`a[a.length - 1]` 當堆疊，尾端操作都很快。',
        ] },
        { type: 'callout', tone: 'tip', title: '先想 ADT，再挑實作', text: '解題時先寫下「需要哪些操作」（這就是 ADT），再挑一個讓這些操作都夠快的實作。使用它的程式只依賴操作，之後換一種實作也不必改寫其他部分。' },
      ],
    },
    {
      id: 'cost-table', title: '操作成本總表',
      blocks: [
        { type: 'p', text: '下表的 n 是結構裡的元素個數，成本用 Big-O 表示（F19 學過）。兩個常見的修飾詞：「攤銷（amortized）」表示一連串操作的總成本平均分到每次是這麼多，偶爾某一次會特別貴；「平均（average）」表示在資料分布良好的假設下的期望值，最差情況可能更慢。' },
        { type: 'table', head: ['操作', '固定陣列', '動態陣列', '鏈結串列', '雜湊表', '平衡 BST', '堆積'], rows: [
          ['依索引取第 k 個', 'O(1)', 'O(1)', 'O(n)', '不支援', 'O(n)', '不支援'],
          ['加入一個元素', '不支援（大小固定）', 'O(1) 攤銷（尾端）', 'O(1)（頭端，或有尾指標的尾端）', '平均 O(1)', 'O(log n)', 'O(log n)'],
          ['在最前面插入', 'O(n)（要搬移且需有空位）', 'O(n)', 'O(1)', '不適用（無順序）', '不適用（依大小排）', '不適用'],
          ['依值搜尋', 'O(n)（已排序可二分 O(log n)）', 'O(n)', 'O(n)', '平均 O(1)，最差 O(n)', 'O(log n)', 'O(n)'],
          ['刪除指定值', 'O(n)', 'O(n)', 'O(n)（找到後拔除 O(1)）', '平均 O(1)', 'O(log n)', 'O(n)'],
          ['取得最小值', 'O(n)', 'O(n)', 'O(n)', 'O(n)', 'O(log n)', 'O(1)'],
        ] },
        { type: 'p', text: '平衡二元搜尋樹（balanced binary search tree, BST）讓元素一直保持排序：C++ 的 `std::set`／`std::map`（常見實作是紅黑樹）、Java 的 `TreeSet`／`TreeMap` 都是。Python 標準庫沒有內建的平衡 BST；常見替代是維持一個已排序的 `list` 搭配 `bisect` 模組：`bisect_left` 搜尋是 O(log n)，但 `insort` 插入時要搬移後面的元素，是 O(n)。JavaScript 也沒有內建的平衡 BST 與堆積，需要時得自己實作，或用已排序陣列加上自己寫的二分搜尋。' },
        { type: 'p', text: '堆積（heap）只保證最小（或最大）的元素在頂端：查看它 O(1)、取出它 O(log n)，但找任意一個值得逐一檢查。雜湊表把元素依雜湊值分散到各個位置，因此沒有「順序」，也就沒有第 k 個或最小值可以直接拿。' },
        { type: 'callout', tone: 'note', title: '攤銷與平均不一樣', text: '動態陣列尾端加入是「O(1) 攤銷」：容量用完時那一次要把全部元素搬到新空間（O(n)），但平均分攤到每次仍是 O(1)，這是確定的保證。雜湊表的「平均 O(1)」則依賴雜湊函數把鍵分散得夠均勻；碰撞（collision）集中時，單次操作可退化到 O(n)。' },
      ],
    },
    {
      id: 'memory', title: '連續與非連續儲存',
      blocks: [
        { type: 'p', text: '陣列與動態陣列是連續儲存（contiguous）：元素一個緊接一個放，第 k 個的位址是「起點 + k × 元素大小」，所以依索引存取是 O(1)。CPU 讀記憶體時會一次載入一小段（快取列，cache line），依序走訪連續的資料時，下一個元素多半已經在快取裡，這稱為快取區域性（cache locality），讓走訪陣列在實務上非常快。' },
        { type: 'p', text: '鏈結串列、樹，以及用鏈結法處理碰撞的雜湊表，是非連續儲存（non-contiguous）：每個節點各自配置記憶體，靠指標（pointer）或參考（reference）串起來。好處是插入、刪除只需改指標、不必搬動其他資料；代價是每個節點都要多存指標（64 位元系統上一個指標佔 8 bytes）、找第 k 個得一路沿著指標走，而且節點散落各處，走訪時容易快取失誤（cache miss）。' },
        { type: 'p', text: '語言之間也有差別：C++ 的 `std::vector<int>` 與 Java 的 `int[]` 把數值本身連續存放；Python 的 `list` 與 Java 的 `ArrayList<Integer>` 雖然也是連續的陣列，存的卻是「指向整數物件的參考」，物件本身散在別處，所以同樣的元素個數會佔用更多記憶體。JavaScript 的一般陣列怎麼存由引擎決定（例如 V8 對只放小整數的陣列會直接存數值）；需要確定連續存放數值時，可以用 `Int32Array` 這類型別化陣列（typed array）。' },
        { type: 'callout', tone: 'note', title: '「插入 O(1)」不一定比較快', text: '鏈結串列在已知位置插入是 O(1)，但要先花 O(n) 走到那個位置；動態陣列中間插入要搬 O(n) 個元素，可是搬的是連續記憶體，速度很快。所以「經常在中間插入」並不自動代表該選鏈結串列，要看你是否已經握有那個位置。' },
      ],
    },
    {
      id: 'choosing', title: '從題目的操作與規模挑候選結構',
      blocks: [
        { type: 'list', ordered: true, items: [
          '列出題目需要的操作，以及每種操作大概做幾次。',
          '看資料量 n 與操作次數 q，估算總成本（例如 n × q）。',
          '查成本表，淘汰讓總成本太高的結構。',
          '在剩下的候選裡，挑最簡單、語言內建的那一個。',
        ] },
        { type: 'p', text: '實例：名單有 n = 2×10^5 個學號，接著 q = 2×10^5 次查詢「某學號在不在名單中」。用 list 逐一比對，最差要 n × q = 4×10^10 次比較，遠超過「一秒大約 10^8 次簡單運算」的粗略估計；改用雜湊集合，平均每次 O(1)，總共約 4×10^5 次；排序後二分搜尋或用平衡 BST，每次約 log₂(2×10^5) ≈ 18 次比較，總共約 3.6×10^6 次，也綽綽有餘。如果題目還要求「由小到大輸出」或「找出比 x 大的最小學號」，雜湊集合沒有順序做不到，就該選平衡 BST（或排序＋二分搜尋）。' },
        { type: 'p', text: '下面的範例用兩種方式回答同一批查詢：結果一定相同，差別在花了多少功夫。程式印出線性搜尋實際做了幾次比較（不印執行時間，因為時間會隨電腦而變）。' },
        { type: 'example', id: 'membership' },
        { type: 'callout', tone: 'warning', title: 'Big-O 藏起了常數，也要分清平均與最差', text: 'Big-O 只描述成長趨勢、忽略常數：n 只有幾十個時，O(n) 掃過一個連續陣列，可能比計算雜湊值的 O(1) 還快。雜湊表的 O(1) 是「平均」，碰撞集中時（例如刻意構造的輸入）單次會退化到 O(n)；需要最差情況保證時，平衡 BST 的 O(log n) 更可靠。Java 8 起的 `HashMap` 會把碰撞過多的桶改成樹來緩解，C++ 的 `unordered_map`、Python 的 `dict` 與 JavaScript 的 `Map` 則沒有這種保證。' },
      ],
    },
    {
      id: 'languages', title: '各語言的容器對照與複製語意',
      blocks: [
        { type: 'table', head: ['結構', 'C++17', 'Python 3', 'Java 17', 'JavaScript'], rows: [
          ['固定陣列', '`std::array`、內建陣列', '無（`list` 兼任）', '`int[]` 等陣列', '型別化陣列 `Int32Array` 等（長度固定）'],
          ['動態陣列', '`std::vector`', '`list`', '`ArrayList`', '`Array`（一般陣列）'],
          ['雙端佇列', '`std::deque`', '`collections.deque`', '`ArrayDeque`', '無內建（陣列＋頭端索引）'],
          ['鏈結串列', '`std::list`（雙向）、`std::forward_list`（單向）', '無內建（自己寫節點類別）', '`LinkedList`（雙向）', '無內建（自己寫節點類別）'],
          ['堆疊', '`std::stack`', '`list`（`append`／`pop`）', '`ArrayDeque`（`push`／`pop`）', '陣列（`push`／`pop`）'],
          ['雜湊集合／對照表', '`std::unordered_set`／`std::unordered_map`', '`set`／`dict`', '`HashSet`／`HashMap`', '`Set`／`Map`'],
          ['平衡 BST（有序）', '`std::set`／`std::map`', '無內建（已排序 `list`＋`bisect`）', '`TreeSet`／`TreeMap`', '無內建（已排序陣列＋自己寫二分搜尋）'],
          ['堆積（優先佇列）', '`std::priority_queue`（預設最大在頂）', '`heapq`（操作 `list`，最小在頂）', '`PriorityQueue`（預設最小在頂）', '無內建（自己寫二元堆積）'],
        ] },
        { type: 'p', text: '複製容器時，各語言的預設行為不同。C++ 的容器是值語意（value semantics）：`std::vector<int> b = a;` 會複製全部元素，之後改 b 不影響 a；想共用同一份要寫參考 `std::vector<int>& b = a;`。Python、Java 與 JavaScript 的變數存的是物件的參考（reference semantics）：`b = a` 只是讓兩個名字指向同一個容器，改 b 就是改 a；要真的複製得明寫 `a.copy()`（或 `list(a)`）、`new ArrayList<>(a)`、`[...a]`（或 `a.slice()`）。下面同一段程式在不同語言的輸出確實不同，原因就在這裡，所以範例分語言列出預期輸出：C++ 的 a 仍是 `[1, 2, 3]`，Python、Java 與 JavaScript 的 a 也多了 4。' },
        { type: 'example', id: 'copy-semantics' },
        { type: 'callout', tone: 'warning', title: '函式參數也遵守同樣的規則', text: 'C++ 寫 `void f(std::vector<int> v)` 會在每次呼叫時複製整個容器（O(n)），只讀不改時改用 `const std::vector<int>& v`。Python、Java 與 JavaScript 傳進函式的是同一個物件，函式裡的 `append`／`add`／`push` 會直接改到呼叫者的容器。另外 Python 的 `a.copy()` 是淺複製（shallow copy）：若元素本身是 list，內層仍然共用；JavaScript 的 `[...a]` 也是淺複製。' },
      ],
    },
  ],
  examples: [
    {
      id: 'stack-two-ways', title: '同一個堆疊 ADT，兩種實作',
      description: '依序 push 1、2、3 再全部 pop：一個用動態陣列的尾端當頂端，一個用鏈結串列的頭端當頂端，輸出順序相同。',
      output: 'array: 3 2 1\nlinked: 3 2 1',
      code: {
        'C++': code`#include <iostream>
#include <vector>

struct Node { int value; Node* next; };

int main() {
    std::vector<int> arr;    // 實作一：尾端是頂端
    Node* head = nullptr;    // 實作二：頭端是頂端
    for (int x : {1, 2, 3}) {
        arr.push_back(x);
        head = new Node{x, head};
    }
    std::cout << "array:";
    while (!arr.empty()) {
        std::cout << " " << arr.back();
        arr.pop_back();
    }
    std::cout << "\nlinked:";
    while (head != nullptr) {
        std::cout << " " << head->value;
        Node* old = head;
        head = head->next;
        delete old;
    }
    std::cout << "\n";
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, value, next_node):
        self.value = value
        self.next = next_node

arr = []     # 實作一：list 的尾端是頂端
head = None  # 實作二：鏈結串列的頭端是頂端
for x in [1, 2, 3]:
    arr.append(x)
    head = Node(x, head)
out = []
while arr:
    out.append(arr.pop())
print("array:", *out)
out = []
while head is not None:
    out.append(head.value)
    head = head.next
print("linked:", *out)`,
        Java: code`import java.util.ArrayList;

public class Main {
    static class Node {
        int value;
        Node next;
        Node(int value, Node next) { this.value = value; this.next = next; }
    }

    public static void main(String[] args) {
        ArrayList<Integer> arr = new ArrayList<>();  // 實作一：尾端是頂端
        Node head = null;                            // 實作二：頭端是頂端
        for (int x = 1; x <= 3; x++) {
            arr.add(x);
            head = new Node(x, head);
        }
        StringBuilder sb = new StringBuilder("array:");
        while (!arr.isEmpty()) sb.append(" ").append(arr.remove(arr.size() - 1));
        sb.append("\nlinked:");
        while (head != null) {
            sb.append(" ").append(head.value);
            head = head.next;
        }
        System.out.println(sb);
    }
}`,
        JavaScript: code`class Node {
    constructor(value, next) {
        this.value = value;
        this.next = next;
    }
}

const arr = [];   // 實作一：陣列的尾端是頂端
let head = null;  // 實作二：鏈結串列的頭端是頂端
for (const x of [1, 2, 3]) {
    arr.push(x);
    head = new Node(x, head);
}
let out = [];
while (arr.length > 0) {
    out.push(arr.pop());
}
console.log("array:", out.join(" "));
out = [];
while (head !== null) {
    out.push(head.value);
    head = head.next;
}
console.log("linked:", out.join(" "));`,
      },
    },
    {
      id: 'membership', title: '成員查詢：線性搜尋與雜湊集合',
      description: '對每筆查詢，同時用逐一比對與雜湊集合判斷是否存在，最後印出線性搜尋總共比較了幾次。',
      stdin: '5\n4 8 15 16 23\n3\n15 7 23',
      output: '15 yes yes\n7 no no\n23 yes yes\nlist comparisons: 13',
      code: {
        'C++': code`#include <iostream>
#include <unordered_set>
#include <vector>

int main() {
    int n, q;
    std::cin >> n;
    std::vector<int> ids(n);
    for (int& v : ids) std::cin >> v;
    std::unordered_set<int> idSet(ids.begin(), ids.end());
    std::cin >> q;
    long long comparisons = 0;
    for (int k = 0; k < q; ++k) {
        int x;
        std::cin >> x;
        bool inList = false;
        for (int v : ids) {          // 線性搜尋：O(n)
            ++comparisons;
            if (v == x) { inList = true; break; }
        }
        bool inSet = idSet.count(x) > 0;  // 雜湊集合：平均 O(1)
        std::cout << x << " " << (inList ? "yes" : "no") << " " << (inSet ? "yes" : "no") << "\n";
    }
    std::cout << "list comparisons: " << comparisons << "\n";
    return 0;
}`,
        Python: code`n = int(input())
ids = list(map(int, input().split()))
id_set = set(ids)
q = int(input())
comparisons = 0
for x in list(map(int, input().split()))[:q]:
    in_list = False
    for v in ids:          # 線性搜尋：O(n)
        comparisons += 1
        if v == x:
            in_list = True
            break
    in_set = x in id_set   # 雜湊集合：平均 O(1)
    print(x, "yes" if in_list else "no", "yes" if in_set else "no")
print("list comparisons:", comparisons)`,
        Java: code`import java.util.HashSet;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] ids = new int[n];
        HashSet<Integer> idSet = new HashSet<>();
        for (int i = 0; i < n; i++) {
            ids[i] = sc.nextInt();
            idSet.add(ids[i]);
        }
        int q = sc.nextInt();
        long comparisons = 0;
        for (int k = 0; k < q; k++) {
            int x = sc.nextInt();
            boolean inList = false;
            for (int v : ids) {              // 線性搜尋：O(n)
                comparisons++;
                if (v == x) { inList = true; break; }
            }
            boolean inSet = idSet.contains(x);  // 雜湊集合：平均 O(1)
            System.out.println(x + " " + (inList ? "yes" : "no") + " " + (inSet ? "yes" : "no"));
        }
        System.out.println("list comparisons: " + comparisons);
    }
}`,
        JavaScript: code`const t = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = t[0];
const ids = t.slice(1, 1 + n);
const idSet = new Set(ids);
const q = t[1 + n];
let comparisons = 0;
for (const x of t.slice(2 + n, 2 + n + q)) {
    let inList = false;
    for (const v of ids) {        // 線性搜尋：O(n)
        comparisons++;
        if (v === x) {
            inList = true;
            break;
        }
    }
    const inSet = idSet.has(x);   // 雜湊集合：平均 O(1)
    console.log(x, inList ? "yes" : "no", inSet ? "yes" : "no");
}
console.log("list comparisons:", comparisons);`,
      },
    },
    {
      id: 'copy-semantics', title: '複製容器：值語意與參考語意',
      description: '寫 b = a 之後對 b 加入 4，再印出 a 與 b。C++ 複製了一份，Python、Java 與 JavaScript 只複製了參考，因此輸出不同。',
      output: 'a = [1, 2, 3, 4]\nb = [1, 2, 3, 4]',
      outputByLanguage: { 'C++': 'a = [1, 2, 3]\nb = [1, 2, 3, 4]' },
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

std::string show(const std::vector<int>& v) {
    std::string s = "[";
    for (size_t i = 0; i < v.size(); ++i) s += (i ? ", " : "") + std::to_string(v[i]);
    return s + "]";
}

int main() {
    std::vector<int> a = {1, 2, 3};
    std::vector<int> b = a;  // 值語意：複製全部元素，a 與 b 各自獨立
    b.push_back(4);
    std::cout << "a = " << show(a) << "\n";
    std::cout << "b = " << show(b) << "\n";
    return 0;
}`,
        Python: code`a = [1, 2, 3]
b = a  # 只複製參考：a 與 b 是同一個 list；要複製請寫 a.copy()
b.append(4)
print("a =", a)
print("b =", b)`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> a = new ArrayList<>(List.of(1, 2, 3));
        List<Integer> b = a;  // 只複製參考；要複製請寫 new ArrayList<>(a)
        b.add(4);
        System.out.println("a = " + a);
        System.out.println("b = " + b);
    }
}`,
        JavaScript: code`function show(arr) {
    return "[" + arr.join(", ") + "]";
}

const a = [1, 2, 3];
const b = a;  // 只複製參考：a 與 b 是同一個陣列；要複製請寫 [...a]
b.push(4);
console.log("a = " + show(a));
console.log("b = " + show(b));`,
      },
    },
  ],
  visualization: {
    kind: 'ds-comparison', title: '依操作挑結構：六種結構的成本比較',
    operations: [
      { id: 'index', label: '依索引存取' },
      { id: 'add', label: '加入元素' },
      { id: 'front', label: '最前面插入' },
      { id: 'search', label: '依值搜尋' },
      { id: 'remove', label: '刪除指定值' },
      { id: 'min', label: '取得最小值' },
    ],
    structures: [
      { name: '固定陣列', note: 'C++ `std::array`、Java `int[]`：連續儲存，建立後大小不變。', costs: {
        index: { cost: 'O(1)', good: true }, add: { cost: '不支援（大小固定）', good: false }, front: { cost: 'O(n)', good: false },
        search: { cost: 'O(n)', good: false }, remove: { cost: 'O(n)', good: false }, min: { cost: 'O(n)', good: false } } },
      { name: '動態陣列', note: '`std::vector`／`list`／`ArrayList`：連續儲存，容量用完時整批搬到更大的空間。', costs: {
        index: { cost: 'O(1)', good: true }, add: { cost: 'O(1) 攤銷（尾端）', good: true }, front: { cost: 'O(n)', good: false },
        search: { cost: 'O(n)', good: false }, remove: { cost: 'O(n)', good: false }, min: { cost: 'O(n)', good: false } } },
      { name: '鏈結串列', note: '`std::list`／`LinkedList`：節點以指標相連，兩端增刪快，找元素要從頭走。', costs: {
        index: { cost: 'O(n)', good: false }, add: { cost: 'O(1)', good: true }, front: { cost: 'O(1)', good: true },
        search: { cost: 'O(n)', good: false }, remove: { cost: 'O(n)（找到後拔除 O(1)）', good: false }, min: { cost: 'O(n)', good: false } } },
      { name: '雜湊表', note: '`unordered_set`、Python `set`／`dict`、`HashSet`：依雜湊值定位，沒有順序。', costs: {
        index: { cost: '不支援', good: false }, add: { cost: '平均 O(1)', good: true }, front: { cost: '不適用（無順序）', good: false },
        search: { cost: '平均 O(1)，最差 O(n)', good: true }, remove: { cost: '平均 O(1)', good: true }, min: { cost: 'O(n)', good: false } } },
      { name: '平衡 BST', note: '`std::set`／`TreeSet`：元素保持排序，操作 O(log n)；Python 沒有內建。', costs: {
        index: { cost: 'O(n)', good: false }, add: { cost: 'O(log n)', good: true }, front: { cost: '不適用（依大小排）', good: false },
        search: { cost: 'O(log n)', good: true }, remove: { cost: 'O(log n)', good: true }, min: { cost: 'O(log n)', good: true } } },
      { name: '堆積', note: '`priority_queue`／`heapq`／`PriorityQueue`：只保證最小（或最大）在頂端。', costs: {
        index: { cost: '不支援', good: false }, add: { cost: 'O(log n)', good: true }, front: { cost: '不適用', good: false },
        search: { cost: 'O(n)', good: false }, remove: { cost: 'O(n)', good: false }, min: { cost: 'O(1)', good: true } } },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下列哪一項描述的是「抽象資料型別（ADT）」，而不是某種實作？',
      options: [
        '堆疊：可以 push、pop、top，後放入的先取出',
        '用 vector 的尾端存放元素的堆疊',
        '以節點和 next 指標串起來、頭端當頂端的堆疊',
        '`std::stack` 預設以 `std::deque` 當底層容器',
      ],
      answer: 0, explanation: 'ADT 只規定有哪些操作與行為規則（LIFO），不談怎麼存。其餘三項都在說「用什麼擺放資料」：vector 尾端、鏈結串列頭端、deque 底層，都是同一個堆疊 ADT 的不同實作。',
    },
    {
      id: 'q2', prompt: '在長度為 n 的動態陣列（`std::vector`／`list`／`ArrayList`）最前面插入一個元素，時間複雜度是？',
      options: ['O(1)', 'O(1) 攤銷', 'O(log n)', 'O(n)'],
      answer: 3, explanation: '連續儲存的陣列要在最前面空出位置，必須把現有的 n 個元素全部往後搬一格，所以是 O(n)。「O(1) 攤銷」是「尾端」加入的成本，容易和這題混淆；需要頻繁在前端插入時，應考慮 deque 或鏈結串列。',
    },
    {
      id: 'q3', prompt: '程式要不斷加入整數，並且隨時「取出並移除目前最小的一個」，共 2×10^5 次操作。下列哪個結構最適合？',
      options: ['未排序的動態陣列', '雜湊集合', '堆積（優先佇列）', '單向鏈結串列'],
      answer: 2, explanation: '堆積加入 O(log n)、取出最小 O(log n)，總共約 2×10^5 × 18 次。未排序的動態陣列與鏈結串列每次找最小值都要 O(n)；雜湊集合沒有順序，找最小值同樣要 O(n)，而且還會吃掉重複值。平衡 BST 也能做到 O(log n)，但標準的 `std::set`／`TreeSet` 不允許重複（要用 `multiset` 或計數），堆積較簡單。',
    },
    {
      id: 'q4', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'std::vector<int> a = {1, 2, 3};\nstd::vector<int> b = a;\nb.push_back(4);\nstd::cout << a.size() << " " << b.size();' },
      options: ['3 4', '4 4', '3 3', '編譯錯誤'],
      answer: 0, explanation: 'C++ 的容器是值語意：`b = a` 複製了全部元素，b 是獨立的一份。對 b `push_back` 只改 b，所以 a 仍有 3 個、b 有 4 個。選 4 4 是把 Python／Java 的參考語意套到 C++ 上了。',
    },
    {
      id: 'q5', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'a = [1, 2, 3]\nb = a\nc = a.copy()\nb.append(4)\nprint(a, c)' },
      options: ['[1, 2, 3] [1, 2, 3]', '[1, 2, 3, 4] [1, 2, 3]', '[1, 2, 3, 4] [1, 2, 3, 4]', '[1, 2, 3] [1, 2, 3, 4]'],
      answer: 1, explanation: '`b = a` 只讓 b 指向同一個 list，`b.append(4)` 就是改 a，所以 a 變成 [1, 2, 3, 4]。c 是在 append 之前用 `a.copy()` 複製出的新 list，不受影響，仍是 [1, 2, 3]。',
    },
    {
      id: 'q6', prompt: '某同學把 2×10^5 個學號存在 Python `list` 裡，再對 2×10^5 筆查詢各執行一次 `if x in ids:`。答案都對，卻超過時間限制。問題出在哪裡、該怎麼改？',
      options: [
        '`list` 的 `in` 是線性搜尋，最差約 4×10^10 次比較；改用 `set`',
        '`in` 會修改 list 的內容，要先複製一份',
        '改成 `tuple`，`in` 就會變成 O(1)',
        '先 `ids.sort()`，之後 `in` 就自動變成 O(log n)',
      ],
      answer: 0, explanation: '`x in list` 從頭逐一比對，每次 O(n)，n × q 太大。`set` 的 `in` 平均 O(1)。`in` 不會修改容器；`tuple` 的 `in` 一樣是線性搜尋；排序後 `in` 仍然逐一比對，要自己用 `bisect` 做二分搜尋才是 O(log n)。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '名單查詢',
      statement: '門禁系統有一份 n 個學號的名單（可能有重複），接著有 q 次查詢，每次問一個學號是否在名單中，在就輸出 `YES`，否則輸出 `NO`。若 n 或 q 不在 1～200000 的範圍內，或是 n、q 之後實際提供的整數個數不等於 n + q，代表資料損毀，只輸出一行 `Invalid`。',
      inputFormat: '第一行兩個整數 n、q。第二行 n 個整數，是名單上的學號。接下來 q 行，每行一個要查詢的學號。（所有內容都是以空白或換行分隔的整數。）',
      outputFormat: '資料正確時輸出 q 行，依查詢順序為 `YES` 或 `NO`；資料損毀時只輸出一行 `Invalid`。',
      constraints: ['資料正確時 1 ≤ n, q ≤ 2×10^5', '學號的絕對值不超過 10^9', '對每筆查詢掃一次名單（n × q 最多 4×10^10）會太慢'],
      samples: [{ kind: 'normal', input: '5 3\n4 8 15 16 23\n15\n7\n23', output: 'YES\nNO\nYES', note: '15 與 23 在名單中，7 不在' }],
      tests: [
        { kind: 'normal', input: '5 3\n4 8 15 16 23\n15\n7\n23', output: 'YES\nNO\nYES', note: '一般情況' },
        { kind: 'normal', input: '4 4\n10 20 30 40\n40\n10\n25\n30', output: 'YES\nYES\nNO\nYES', note: '查詢順序與名單無關' },
        { kind: 'edge', input: '1 1\n7\n7', output: 'YES', note: '最小規模' },
        { kind: 'edge', input: '3 3\n-5 0 -5\n-5\n5\n0', output: 'YES\nNO\nYES', note: '名單有重複、負數與 0' },
        { kind: 'edge', input: '2 2\n1000000000 -1000000000\n-1000000000\n999999999', output: 'YES\nNO', note: '學號在範圍的兩端' },
        { kind: 'error', input: '3 2\n1 2 3\n5', output: 'Invalid', note: '查詢少了一筆' },
        { kind: 'error', input: '2 1\n1 2 3\n3', output: 'Invalid', note: '名單多了一個數字' },
        { kind: 'error', input: '0 1\n5', output: 'Invalid', note: 'n 不在範圍內' },
      ],
      hints: [
        '先把所有整數讀進來，檢查 n、q 的範圍與總個數是否等於 2 + n + q，再開始處理。',
        '把名單放進雜湊集合（`std::unordered_set`、`set`、`HashSet`、JavaScript 的 `Set`），每次查詢平均 O(1)。',
        '排序名單後用二分搜尋也可以，每次 O(log n)；但不要對每筆查詢從頭掃一遍。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <unordered_set>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<long long> t;
    long long x;
    while (std::cin >> x) t.push_back(x);
    const long long LIMIT = 200000;
    if (t.size() < 2 || t[0] < 1 || t[0] > LIMIT || t[1] < 1 || t[1] > LIMIT
        || static_cast<long long>(t.size()) != 2 + t[0] + t[1]) {
        std::cout << "Invalid\n";
        return 0;
    }
    long long n = t[0], q = t[1];
    std::unordered_set<long long> ids(t.begin() + 2, t.begin() + 2 + n);
    std::string out;
    for (long long k = 0; k < q; ++k) out += ids.count(t[2 + n + k]) ? "YES\n" : "NO\n";
    std::cout << out;
    return 0;
}`,
        Python: code`import sys


def main():
    t = sys.stdin.read().split()
    if len(t) < 2:
        print("Invalid")
        return
    n, q = int(t[0]), int(t[1])
    if not (1 <= n <= 200000 and 1 <= q <= 200000) or len(t) != 2 + n + q:
        print("Invalid")
        return
    ids = set(map(int, t[2:2 + n]))
    out = ["YES" if int(x) in ids else "NO" for x in t[2 + n:]]
    print("\n".join(out))


main()`,
        Java: code`import java.io.IOException;
import java.util.HashSet;

public class Main {
    public static void main(String[] args) throws IOException {
        String text = new String(System.in.readAllBytes()).trim();
        String[] t = text.isEmpty() ? new String[0] : text.split("\\s+");
        final long LIMIT = 200000;
        if (t.length < 2) {
            System.out.println("Invalid");
            return;
        }
        long n = Long.parseLong(t[0]), q = Long.parseLong(t[1]);
        if (n < 1 || n > LIMIT || q < 1 || q > LIMIT || t.length != 2 + n + q) {
            System.out.println("Invalid");
            return;
        }
        HashSet<Long> ids = new HashSet<>();
        for (int i = 2; i < 2 + n; i++) ids.add(Long.parseLong(t[i]));
        StringBuilder out = new StringBuilder();
        for (int i = (int) (2 + n); i < t.length; i++) out.append(ids.contains(Long.parseLong(t[i])) ? "YES\n" : "NO\n");
        System.out.print(out);
    }
}`,
        JavaScript: code`const text = require("fs").readFileSync(0, "utf8").trim();
const t = text === "" ? [] : text.split(/\s+/).map(Number);
const LIMIT = 200000;
const n = t[0], q = t[1];
if (t.length < 2 || n < 1 || n > LIMIT || q < 1 || q > LIMIT || t.length !== 2 + n + q) {
    console.log("Invalid");
} else {
    const ids = new Set(t.slice(2, 2 + n));
    const out = [];
    for (const x of t.slice(2 + n)) {
        out.push(ids.has(x) ? "YES" : "NO");
    }
    console.log(out.join("\n"));
}`,
      },
      judge: 'none',
    },
  ],
};

import type { LessonContent } from '../schema';
import { dynamicArraySteps } from '../simulate';

const code = String.raw;

/** D02 Array 與 Dynamic Array. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const D02: LessonContent = {
  lessonId: 'D02',
  motivation: '成績表、購物車、遊戲裡的子彈清單，資料筆數常常事先不知道，只能邊讀邊加。動態陣列（dynamic array）讓你像用陣列一樣以索引 O(1) 取用，又能隨時在尾端加入新元素，是三種語言最常用的容器：C++ 的 `std::vector`、Python 的 `list`、Java 的 `ArrayList`。但它不是萬能的：在中間或開頭插入、刪除都要搬動後面的元素，資料一多就會變慢；擴容時還會讓舊的參考失效。知道它「為什麼快、什麼時候慢」，才能選對結構、避開陷阱。',
  sections: [
    {
      id: 'fixed-vs-dynamic', title: '固定陣列與動態陣列：size 與 capacity',
      blocks: [
        { type: 'p', text: '陣列把元素一個接一個放在連續（contiguous）的記憶體中。因為每個元素大小相同，第 i 個元素的位置可以直接算出來：「起點 + i × 每個元素的大小」，不必從頭數，所以依索引讀寫是 O(1)。這也是為什麼索引從 0 開始：第 0 個就在起點。' },
        { type: 'p', text: '固定陣列（fixed array）的長度在建立時就決定了，之後不能變長，例如 C++ 的 `int a[5]`、`std::array<int, 5>` 與 Java 的 `new int[5]`。動態陣列則在內部保留一塊可能比目前資料更大的空間，因此有兩個不同的數字：' },
        { type: 'list', items: [
          '長度 size：目前真正放了幾個元素，合法索引是 0～size − 1。',
          '容量 capacity：內部已配置、可以放幾個元素。size 到 capacity 之間的格子已經配置但還沒使用，不能讀取。',
        ] },
        { type: 'p', text: '只要 size < capacity，在尾端加入新元素只是寫進下一個空格，O(1)。下面的範例用三種語言做同樣的操作：尾端加入、在索引 1 插入、刪除索引 0、改寫與讀取。' },
        { type: 'example', id: 'basics' },
        { type: 'p', text: '下方的視覺化逐步執行一段 vector 程式，畫出每一步的 size、capacity 與被讀寫的格子。頁面下方「相關互動實驗」中的 Array 實驗則可以再練習索引的讀取、更新與越界判斷。' },
      ],
    },
    {
      id: 'growth', title: '擴容：重新配置＋複製，與攤銷 O(1)',
      blocks: [
        { type: 'p', text: '容量用完時（size = capacity）再加入元素，動態陣列不能直接「往後長一格」，因為後面的記憶體可能已經被別人使用。它會做三件事：配置一塊更大的新空間、把舊的元素逐一複製（或搬移）過去、釋放舊空間。這一次加入的成本是 O(n)。' },
        { type: 'p', text: '既然偶爾要花 O(n)，為什麼還說尾端加入是 O(1)？關鍵是每次擴容都把容量乘上固定倍數。以「翻倍」為例，從容量 1 開始連續加入 n 個元素，擴容發生在 size 為 1、2、4、8……時，複製的元素總數是 1 + 2 + 4 + … + 2^k，其中 2^k < n。等比級數的和是 2^(k+1) − 1 < 2n。再加上 n 次寫入，總共不到 3n 次操作，平均每次加入只要常數次——這就是攤銷（amortized）O(1)：不是每一次都快，而是「很多次加起來平均很快」。' },
        { type: 'example', id: 'doubling-count' },
        { type: 'p', text: '如果每次只多配置固定的 10 格，擴容就會在 10、20、30……時發生，複製總數約 n²/20，平均每次加入變成 O(n)。所以「乘上倍數」才是攤銷 O(1) 的原因，倍數是 2 還是 1.5 只影響常數：倍數 r > 1 時，總複製次數小於約 r/(r − 1) × n。' },
        { type: 'table', head: ['實作', '成長方式（實作細節，可能隨版本改變）'], rows: [
          ['C++ `std::vector`（GCC 的 libstdc++）', '翻倍；MSVC 的實作約 1.5 倍'],
          ['Java `ArrayList`（OpenJDK）', '約 1.5 倍（新容量 = 舊容量 + 舊容量的一半）'],
          ['Python `list`（CPython）', '約 1.125 倍再加上少量額外空間'],
        ] },
        { type: 'p', text: '語言規格只保證尾端加入是攤銷常數時間，沒有規定倍數。因此本課的動畫標明是「翻倍模型」，所有範例也不印出 `capacity()`：同一段程式在不同編譯器或版本上，容量可能不一樣。' },
        { type: 'callout', tone: 'tip', title: '事先知道筆數就先預留', text: 'C++ 用 `a.reserve(n)`、Java 用 `new ArrayList<>(n)` 先配置足夠容量，之後 n 次加入都不必擴容。Python 沒有 reserve，可以用 `a = [0] * n` 先建好 n 格再依索引填入。' },
        { type: 'callout', tone: 'warning', title: 'reserve 不會增加 size', text: '`a.reserve(10)` 之後 `a.size()` 仍是 0，這時寫 `a[0] = 1` 是越界的未定義行為；要用 `push_back`，或改用 `std::vector<int> a(10)` 直接建立 10 個元素。Java 也一樣：`new ArrayList<>(10)` 的 size 是 0，`list.set(0, x)` 會丟出 `IndexOutOfBoundsException`。' },
      ],
    },
    {
      id: 'middle-ops', title: '中間插入與刪除：搬移的成本',
      blocks: [
        { type: 'p', text: '因為元素必須連續存放，在索引 i 插入，要先把 i 之後的 size − i 個元素各往後移一格，空出位置；刪除索引 i，則要把後面的 size − i − 1 個元素各往前移一格補洞。在尾端操作幾乎不用搬，在開頭操作要搬全部，所以中間插入與刪除是 O(n)。刪除不會縮小容量：vector 與 ArrayList 刪除元素後容量保持不變。' },
        { type: 'table', head: ['操作', 'C++ `std::vector`', 'Python `list`', 'Java `ArrayList`', '時間複雜度'], rows: [
          ['讀寫第 i 個', '`a[i]`、`a.at(i)`', '`a[i]`', '`get(i)`、`set(i, x)`', 'O(1)'],
          ['尾端加入', '`push_back(x)`', '`append(x)`', '`add(x)`', '攤銷 O(1)'],
          ['尾端移除', '`pop_back()`', '`pop()`', '`remove(a.size() - 1)`', 'O(1)'],
          ['在索引 i 插入', '`insert(a.begin() + i, x)`', '`insert(i, x)`', '`add(i, x)`', 'O(n − i)，最差 O(n)'],
          ['刪除索引 i', '`erase(a.begin() + i)`', '`del a[i]`、`pop(i)`', '`remove(i)`', 'O(n − i)，最差 O(n)'],
          ['依值搜尋', '`std::find`', '`x in a`、`index(x)`', '`contains(x)`、`indexOf(x)`', 'O(n)'],
          ['依值刪除', '`std::find` ＋ `erase`', '`remove(x)`', '`remove(Integer.valueOf(x))`', 'O(n)'],
        ] },
        { type: 'p', text: '和其他結構比較：固定陣列不能變長；鏈結串列（linked list）在已經拿到某個節點時插入刪除是 O(1)，但要找到第 i 個得一路走過去，O(n)；雙端佇列（deque）兩端加入移除都快，適合排隊類的問題。如果程式常常在開頭插入或刪除，動態陣列就不是好選擇。這些結構在之後的課程會一一介紹。' },
        { type: 'table', head: ['', '固定陣列', '動態陣列', '鏈結串列', 'deque'], rows: [
          ['依索引存取', 'O(1)', 'O(1)', 'O(n)', 'C++ O(1)；Python 中間 O(n)；Java 不提供'],
          ['尾端加入', '不能（長度固定）', '攤銷 O(1)', 'O(1)（有 tail 指標時）', 'O(1)'],
          ['開頭加入', '不能', 'O(n)', 'O(1)', 'O(1)'],
          ['記憶體', '連續', '連續，可能有未使用的容量', '分散，每個節點多存指標', '分段連續'],
        ] },
      ],
    },
    {
      id: 'languages', title: '三種語言的陣列容器',
      blocks: [
        { type: 'p', text: '三種語言都有動態陣列，但「元素怎麼存」與「複製時發生什麼事」不同：' },
        { type: 'list', items: [
          'C++：`int a[5]`（C 陣列，不記得自己的長度）與 `std::array<int, 5>`（固定長度，會記得 `size()`）是固定陣列；`std::vector<int>` 是動態陣列。vector 有值語意（value semantics）：`b = a` 會複製全部元素，O(n)。`a[i]` 不檢查範圍，`a.at(i)` 會檢查並丟出 `std::out_of_range`。',
          'Python：沒有內建的固定陣列，`list` 永遠是動態的；`tuple` 長度固定但不可變（immutable）。list 的每一格存的是指向物件的參考（reference），所以各格大小相同、索引仍是 O(1)，也能混放不同型別。`b = a` 只是讓兩個名字指向同一個 list。',
          'Java：`int[]` 長度固定，直接存放 int 值，預設為 0。`ArrayList<Integer>` 是動態陣列，但只能存物件：int 會自動裝箱（autoboxing）成 `Integer`，每一格是指向 `Integer` 物件的參考，比 `int[]` 更占記憶體，而且元素可能是 `null`。',
        ] },
        { type: 'p', text: '裝箱還造成一個常見錯誤：`List<Integer>` 有兩個 `remove`。`list.remove(1)` 的參數是 int，呼叫的是 `remove(int index)`，刪除「索引 1」；要刪除「值為 1 的元素」必須寫 `list.remove(Integer.valueOf(1))`，呼叫 `remove(Object o)`。C++ 依值刪除要先用 `std::find` 找到位置；Python 則分得很清楚：`del a[i]`／`a.pop(i)` 依索引，`a.remove(x)` 依值。' },
        { type: 'example', id: 'remove-index-or-value' },
      ],
    },
    {
      id: 'pitfalls', title: '常見陷阱：失效的參考、邊走訪邊修改、共用的列',
      blocks: [
        { type: 'callout', tone: 'warning', title: 'C++：擴容後舊的迭代器與參考失效', text: '`push_back` 或 `insert` 若觸發擴容，元素會搬到新空間，之前取得的迭代器（iterator）、參考（`int& r = a[0]`）與指標全部指向已釋放的舊空間，再使用是未定義行為。即使沒有擴容，`insert` 與 `erase` 也會讓該位置之後的迭代器失效。需要邊走訪邊加入元素時改用索引，或先 `reserve`。' },
        { type: 'callout', tone: 'warning', title: '邊走訪邊刪除', text: 'Python 在 `for x in a:` 裡呼叫 `a.remove(x)` 不會報錯，但刪除後元素往前移，迴圈會跳過下一個元素，結果悄悄出錯。Java 在 for-each 迴圈中用 `list.remove(...)` 修改 `ArrayList`，通常會丟出 `ConcurrentModificationException`。C++ 的 `a.erase(it)` 會讓 `it` 失效，必須接住它的回傳值。' },
        { type: 'p', text: '正確做法是：C++ 用 `it = a.erase(it)` 取得下一個有效的迭代器（或使用 `std::remove_if` 搭配 `erase`）；Python 用串列生成式建立新的 list；Java 用 `removeIf`，或用 `Iterator` 的 `remove()`。' },
        { type: 'example', id: 'erase-while-iterating' },
        { type: 'callout', tone: 'warning', title: 'Python 的 `[[0] * m] * n` 共用同一列', text: '`grid = [[0] * 3] * 2` 看起來是 2 列 3 行，但外層的 `* 2` 複製的是「指向同一個內層 list 的參考」，改 `grid[0][0]` 時 `grid[1][0]` 也跟著變。要建立彼此獨立的列，請寫 `[[0] * 3 for _ in range(2)]`。C++ 的 `std::vector<std::vector<int>> g(2, std::vector<int>(3))` 與 Java 的 `new int[2][3]` 每列都是獨立的。' },
      ],
    },
  ],
  examples: [
    {
      id: 'basics', title: '動態陣列的基本操作', description: '尾端加入、在索引 1 插入、刪除索引 0、改寫與讀取，三種語言的寫法對照。',
      output: '9 8 2\nsize = 3, a[1] = 8',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    std::vector<int> a;          // 空的動態陣列
    a.push_back(5);
    a.push_back(8);
    a.push_back(2);              // 5 8 2
    a.insert(a.begin() + 1, 7);  // 5 7 8 2
    a.erase(a.begin());          // 7 8 2
    a[0] = 9;                    // 9 8 2
    for (std::size_t i = 0; i < a.size(); ++i) {
        std::cout << a[i] << (i + 1 < a.size() ? " " : "\n");
    }
    std::cout << "size = " << a.size() << ", a[1] = " << a[1] << "\n";
    return 0;
}`,
        Python: code`a = []
a.append(5)
a.append(8)
a.append(2)     # [5, 8, 2]
a.insert(1, 7)  # [5, 7, 8, 2]
del a[0]        # [7, 8, 2]
a[0] = 9        # [9, 8, 2]
print(*a)
print(f"size = {len(a)}, a[1] = {a[1]}")`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> a = new ArrayList<>();
        a.add(5);
        a.add(8);
        a.add(2);     // [5, 8, 2]
        a.add(1, 7);  // [5, 7, 8, 2]
        a.remove(0);  // 依索引移除：[7, 8, 2]
        a.set(0, 9);  // [9, 8, 2]
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < a.size(); ++i) {
            sb.append(i > 0 ? " " : "").append(a.get(i));
        }
        System.out.println(sb);
        System.out.println("size = " + a.size() + ", a[1] = " + a.get(1));
    }
}`,
      },
    },
    {
      id: 'doubling-count', title: '翻倍模型的複製次數', description: '自己模擬「容量從 1 開始、滿了就翻倍」的規則，只計算擴容時複製了幾個元素，驗證總數小於 2n。這是模型的計算，不是讀取真實容器的容量。',
      output: 'n=8: copies=7 (2n=16)\nn=1000: copies=1023 (2n=2000)\nn=1025: copies=2047 (2n=2050)\nn=1000000: copies=1048575 (2n=2000000)',
      code: {
        'C++': code`#include <iostream>

// 翻倍模型：容量從 1 開始，滿了就配置兩倍大的空間並複製全部元素
long long copiesFor(long long n) {
    long long size = 0, cap = 1, copies = 0;
    for (long long i = 0; i < n; ++i) {
        if (size == cap) {
            copies += size;
            cap *= 2;
        }
        ++size;
    }
    return copies;
}

int main() {
    const long long ns[] = {8, 1000, 1025, 1000000};
    for (long long n : ns) {
        std::cout << "n=" << n << ": copies=" << copiesFor(n) << " (2n=" << 2 * n << ")\n";
    }
    return 0;
}`,
        Python: code`def copies_for(n):
    """翻倍模型：容量從 1 開始，滿了就配置兩倍大的空間並複製全部元素。"""
    size, cap, copies = 0, 1, 0
    for _ in range(n):
        if size == cap:
            copies += size
            cap *= 2
        size += 1
    return copies


for n in [8, 1000, 1025, 1000000]:
    print(f"n={n}: copies={copies_for(n)} (2n={2 * n})")`,
        Java: code`public class Main {
    // 翻倍模型：容量從 1 開始，滿了就配置兩倍大的空間並複製全部元素
    static long copiesFor(long n) {
        long size = 0, cap = 1, copies = 0;
        for (long i = 0; i < n; ++i) {
            if (size == cap) {
                copies += size;
                cap *= 2;
            }
            ++size;
        }
        return copies;
    }

    public static void main(String[] args) {
        long[] ns = {8, 1000, 1025, 1000000};
        for (long n : ns) {
            System.out.println("n=" + n + ": copies=" + copiesFor(n) + " (2n=" + 2 * n + ")");
        }
    }
}`,
      },
    },
    {
      id: 'remove-index-or-value', title: '依索引刪除還是依值刪除', description: '同一個 [1, 5, 7]：刪除「索引 1」留下 1 7，刪除「值 1」留下 5 7。Java 要用 Integer.valueOf 才會依值刪除。',
      output: 'by index: 1 7\nby value: 5 7',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

void show(const char* label, const std::vector<int>& v) {
    std::cout << label;
    for (int x : v) std::cout << " " << x;
    std::cout << "\n";
}

int main() {
    std::vector<int> a = {1, 5, 7};
    std::vector<int> b = a;  // vector 指定會複製一份
    a.erase(a.begin() + 1);  // 依索引：刪除 a[1]
    auto it = std::find(b.begin(), b.end(), 1);
    if (it != b.end()) b.erase(it);  // 依值：先找到位置再刪除
    show("by index:", a);
    show("by value:", b);
    return 0;
}`,
        Python: code`a = [1, 5, 7]
b = a.copy()  # 獨立的複本
del a[1]      # 依索引（也可以寫 a.pop(1)）
b.remove(1)   # 依值：刪除第一個 1，找不到會丟出 ValueError
print("by index:", *a)
print("by value:", *b)`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static void show(String label, List<Integer> v) {
        StringBuilder sb = new StringBuilder(label);
        for (int x : v) sb.append(" ").append(x);
        System.out.println(sb);
    }

    public static void main(String[] args) {
        List<Integer> a = new ArrayList<>(List.of(1, 5, 7));
        List<Integer> b = new ArrayList<>(a);
        a.remove(1);                   // int：呼叫 remove(int index)
        b.remove(Integer.valueOf(1));  // Integer：呼叫 remove(Object o)
        show("by index:", a);
        show("by value:", b);
    }
}`,
      },
    },
    {
      id: 'erase-while-iterating', title: '安全地刪除所有偶數', description: '邊走訪邊刪除的正確寫法：C++ 接住 erase 的回傳值、Python 建立新 list、Java 用 removeIf。',
      output: '1 3',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    std::vector<int> a = {2, 4, 6, 1, 3, 8};
    for (auto it = a.begin(); it != a.end();) {
        if (*it % 2 == 0) {
            it = a.erase(it);  // erase 回傳被刪元素的下一個位置
        } else {
            ++it;
        }
    }
    for (std::size_t i = 0; i < a.size(); ++i) {
        std::cout << a[i] << (i + 1 < a.size() ? " " : "\n");
    }
    return 0;
}`,
        Python: code`a = [2, 4, 6, 1, 3, 8]
a = [x for x in a if x % 2 != 0]  # 建立新的 list，不在走訪中修改原本的
print(*a)`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> a = new ArrayList<>(List.of(2, 4, 6, 1, 3, 8));
        a.removeIf(x -> x % 2 == 0);  // 不要在 for-each 裡呼叫 a.remove
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < a.size(); ++i) {
            sb.append(i > 0 ? " " : "").append(a.get(i));
        }
        System.out.println(sb);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: 'vector 的擴容、插入與刪除（翻倍模型）', language: 'C++',
    code: code`std::vector<int> a;
a.push_back(5);
a.push_back(8);
a.push_back(2);
a.insert(a.begin() + 1, 7);
a.push_back(4);
a.erase(a.begin());
int x = a[1];`,
    steps: [
      { line: 1, note: '建立空的 vector：size 為 0。這個動畫採用教學用的「翻倍模型」：假設一開始預留 1 格容量，之後每次滿了就配置兩倍大的新空間。（常見實作中空 vector 的容量是 0，成長倍數也由實作決定。）',
        arrays: [{ name: 'a', cells: [], capacity: 1 }], vars: { size: '0', capacity: '1' } },
      ...dynamicArraySteps('a', [
        { line: 2, op: 'push_back', value: '5' },
        { line: 3, op: 'push_back', value: '8' },
        { line: 4, op: 'push_back', value: '2' },
        { line: 5, op: 'insert', index: 1, value: '7' },
        { line: 6, op: 'push_back', value: '4' },
        { line: 7, op: 'erase', index: 0 },
        { line: 8, op: 'get', index: 1 },
      ], 1).map(step => step.note.startsWith('容量已滿')
        ? { ...step, note: `${step.note}這是本動畫的翻倍模型：新容量是舊容量的 2 倍；實際倍數依實作而定（例如 Java 的 ArrayList 約 1.5 倍）。` }
        : step),
    ],
    playground: { structure: 'dynamic-array' },
  },
  quiz: [
    {
      id: 'q1', prompt: '依照本課的翻倍模型（空陣列容量 1，滿了就翻倍），依序執行下列操作後，size 與 capacity 各是多少？',
      code: { language: 'C++', text: 'std::vector<int> a;\nfor (int i = 1; i <= 5; ++i) a.push_back(i);\na.erase(a.begin());\na.erase(a.begin());' },
      options: ['size 3、capacity 8', 'size 3、capacity 4', 'size 3、capacity 3', 'size 5、capacity 8'],
      answer: 0, explanation: '加入第 2、3、5 個元素時容量已滿，容量依序變成 2、4、8，所以 5 次 push_back 後是 size 5、capacity 8。erase 只會把後面的元素往前移、size 減 1，不會縮小容量，最後是 size 3、capacity 8。選「capacity 4」或「3」是誤以為刪除會釋放空間；「size 5」則是忘了 erase 會改變 size。',
    },
    {
      id: 'q2', prompt: '關於動態陣列尾端加入（push_back／append／add）的時間複雜度，哪一個敘述正確？',
      options: [
        '每一次加入都保證是 O(1)',
        '大多數加入是 O(1)，擴容的那次是 O(n)；容量按倍數成長，使 n 次加入的總成本是 O(n)，平均每次 O(1)',
        '每次擴容只多配置 1 格，也能保持攤銷 O(1)',
        '攤銷 O(1) 代表最差的單一次操作也是 O(1)',
      ],
      answer: 1, explanation: '擴容要把所有元素複製到新空間，那一次是 O(n)，所以「每次都 O(1)」與「最差也是 O(1)」都錯；攤銷說的是很多次的平均。以翻倍為例，n 次加入的複製總數 1 + 2 + 4 + … 小於 2n，總成本 O(n)。若每次只多 1 格（或固定幾格），每次加入幾乎都要複製全部元素，總成本是 O(n²)，平均每次 O(n)。',
    },
    {
      id: 'q3', prompt: '下面的 Java 程式執行時會發生什麼事？',
      code: { language: 'Java', text: 'List<Integer> list = new ArrayList<>(List.of(10, 20, 30));\nlist.remove(10);\nSystem.out.println(list);' },
      options: ['印出 [20, 30]', '丟出 IndexOutOfBoundsException', '印出 [10, 20, 30]', '編譯錯誤'],
      answer: 1, explanation: '`10` 是 int，所以呼叫的是 `remove(int index)`：要刪除索引 10，但 list 只有 3 個元素，丟出 `IndexOutOfBoundsException`。想依值刪除 10 要寫 `list.remove(Integer.valueOf(10))`，那樣才會印出 [20, 30]。程式可以編譯，因為 `remove(int)` 是合法的多載。',
    },
    {
      id: 'q4', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'a = [2, 4, 6, 1]\nfor x in a:\n    if x % 2 == 0:\n        a.remove(x)\nprint(a)' },
      options: ['[1]', '[4, 1]', '[2, 4, 6, 1]', 'RuntimeError：迴圈中修改了 list'],
      answer: 1, explanation: 'for 迴圈用內部索引依序走訪。索引 0 是 2，刪掉後 list 變成 [4, 6, 1]；下一輪看索引 1，是 6（4 被跳過了），刪掉後變成 [4, 1]；索引 2 已超出長度，迴圈結束，印出 [4, 1]。Python 不會因此報錯，所以不是 RuntimeError；以為結果是 [1] 正是這個陷阱。正確做法是 `a = [x for x in a if x % 2 != 0]`。',
    },
    {
      id: 'q5', prompt: '關於下面的 C++ 程式，哪一個敘述正確？',
      code: { language: 'C++', text: 'std::vector<int> a = {1, 2, 3};\nint& first = a[0];\na.push_back(4);\nstd::cout << first << "\\n";' },
      options: [
        '一定印出 1，因為 first 是參考',
        '若這次 push_back 觸發擴容，first 指向已釋放的舊空間，使用它是未定義行為',
        '編譯錯誤：不能對 vector 的元素取參考',
        '一定印出 4，因為 first 跟著指向最後一個元素',
      ],
      answer: 1, explanation: '用 3 個元素初始化的 vector，容量常常剛好是 3，push_back 第 4 個就要擴容：元素搬到新空間，舊空間被釋放，first 仍指向舊位置，讀取它是未定義行為，可能「看起來正常」地印出 1，所以「一定印出 1」不對。取元素的參考是合法的，不會編譯錯誤；參考也不會自動改指別的元素。若事先 `a.reserve(4)`，這次加入就不會擴容。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '指令操作的動態陣列',
      statement: '從空的動態陣列開始，依序執行 q 道指令：`push x` 在尾端加入 x；`insert i x` 把 x 插入到索引 i（之後的元素往後移）；`erase i` 刪除索引 i 的元素（之後的元素往前移）；`get i` 輸出索引 i 的元素；`size` 輸出目前元素個數；`print` 輸出全部元素。insert 的合法索引是 0～size（等於 size 時就是加在尾端），erase 與 get 的合法索引是 0～size − 1；索引不合法（包含負數）時輸出 `Error`，陣列保持不變。注意 Python 的 `a[-1]` 與 `a.insert(100, x)` 都不會出錯，要自己檢查範圍。',
      inputFormat: '第一行整數 q；接下來 q 行，每行一道指令，格式如上（指令名稱保證是這六種之一）。',
      outputFormat: '`get`、`size`、`print` 與每個 `Error` 各輸出一行。`print` 以一個空白分隔各元素，陣列為空時輸出 `Empty`。',
      constraints: ['1 ≤ q ≤ 10,000', '−10^9 ≤ x ≤ 10^9', '−10^9 ≤ i ≤ 10^9', '`print` 指令最多 100 道'],
      samples: [{ kind: 'normal', input: '7\npush 5\npush 8\ninsert 1 7\nprint\nerase 0\nget 1\nsize', output: '5 7 8\n8\n2', note: '插入後是 5 7 8；刪除索引 0 後是 7 8，索引 1 是 8，共 2 個' }],
      tests: [
        { kind: 'normal', input: '7\npush 5\npush 8\ninsert 1 7\nprint\nerase 0\nget 1\nsize', output: '5 7 8\n8\n2', note: '範例' },
        { kind: 'normal', input: '8\npush 1\npush 2\npush 3\ninsert 0 9\ninsert 2 4\nprint\nerase 3\nprint', output: '9 1 4 2 3\n9 1 4 3', note: '在開頭與中間插入，再刪除中間' },
        { kind: 'edge', input: '4\npush 1\ninsert 1 2\ninsert 2 3\nprint', output: '1 2 3', note: '插入索引等於 size，等同加在尾端' },
        { kind: 'edge', input: '3\ninsert 0 5\nget 0\nsize', output: '5\n1', note: '對空陣列在索引 0 插入是合法的' },
        { kind: 'edge', input: '5\npush 4\npush 6\nerase 1\nprint\nget 0', output: '4\n4', note: '刪除最後一個元素，不需要搬移' },
        { kind: 'edge', input: '4\nprint\npush 3\nerase 0\nprint', output: 'Empty\nEmpty', note: '空陣列輸出 Empty，刪光後也是' },
        { kind: 'error', input: '6\npush 1\nget 1\ninsert 3 9\nerase -1\nget 0\nsize', output: 'Error\nError\nError\n1\n1', note: '索引等於 size 的 get、超過 size 的 insert、負數索引都不合法，陣列不變' },
        { kind: 'error', input: '2\nerase 0\nsize', output: 'Error\n0', note: '空陣列不能刪除' },
        { kind: 'error', input: '3\npush 7\nget -1\nprint', output: 'Error\n7', note: '負數索引不合法（Python 的 a[-1] 不會報錯，要自己檢查）' },
      ],
      hints: [
        '三種語言都有現成的動態陣列：`std::vector`、`list`、`ArrayList`，題目要你練習的是範圍檢查。',
        '先判斷索引是否合法再操作：insert 允許 `0 <= i <= size`，erase 與 get 允許 `0 <= i < size`。',
        'Java 的 `list.remove(i)` 中 i 是 int，正好是依索引刪除；輸出量大時用 `StringBuilder` 收集再一次印出。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int q;
    std::cin >> q;
    std::vector<int> a;
    for (int k = 0; k < q; ++k) {
        std::string cmd;
        std::cin >> cmd;
        int n = static_cast<int>(a.size());
        if (cmd == "push") {
            int x;
            std::cin >> x;
            a.push_back(x);
        } else if (cmd == "insert") {
            int i, x;
            std::cin >> i >> x;
            if (i < 0 || i > n) std::cout << "Error\n";
            else a.insert(a.begin() + i, x);
        } else if (cmd == "erase") {
            int i;
            std::cin >> i;
            if (i < 0 || i >= n) std::cout << "Error\n";
            else a.erase(a.begin() + i);
        } else if (cmd == "get") {
            int i;
            std::cin >> i;
            if (i < 0 || i >= n) std::cout << "Error\n";
            else std::cout << a[i] << "\n";
        } else if (cmd == "size") {
            std::cout << n << "\n";
        } else if (cmd == "print") {
            if (a.empty()) std::cout << "Empty\n";
            for (int j = 0; j < n; ++j) std::cout << a[j] << (j + 1 < n ? " " : "\n");
        }
    }
    return 0;
}`,
        Python: code`import sys


def main():
    data = sys.stdin.read().split()
    q = int(data[0])
    pos = 1
    a = []
    out = []
    for _ in range(q):
        cmd = data[pos]
        pos += 1
        if cmd == "push":
            a.append(int(data[pos]))
            pos += 1
        elif cmd == "insert":
            i, x = int(data[pos]), int(data[pos + 1])
            pos += 2
            if 0 <= i <= len(a):
                a.insert(i, x)
            else:
                out.append("Error")
        elif cmd in ("erase", "get"):
            i = int(data[pos])
            pos += 1
            if not 0 <= i < len(a):
                out.append("Error")
            elif cmd == "erase":
                del a[i]
            else:
                out.append(str(a[i]))
        elif cmd == "size":
            out.append(str(len(a)))
        else:  # print
            out.append(" ".join(map(str, a)) if a else "Empty")
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int q = Integer.parseInt(br.readLine().trim());
        List<Integer> a = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        for (int k = 0; k < q; ++k) {
            StringTokenizer st = new StringTokenizer(br.readLine());
            String cmd = st.nextToken();
            int n = a.size();
            if (cmd.equals("push")) {
                a.add(Integer.parseInt(st.nextToken()));
            } else if (cmd.equals("insert")) {
                int i = Integer.parseInt(st.nextToken());
                int x = Integer.parseInt(st.nextToken());
                if (i < 0 || i > n) out.append("Error\n");
                else a.add(i, x);
            } else if (cmd.equals("erase")) {
                int i = Integer.parseInt(st.nextToken());
                if (i < 0 || i >= n) out.append("Error\n");
                else a.remove(i);  // i 是 int：依索引刪除
            } else if (cmd.equals("get")) {
                int i = Integer.parseInt(st.nextToken());
                if (i < 0 || i >= n) out.append("Error\n");
                else out.append(a.get(i)).append("\n");
            } else if (cmd.equals("size")) {
                out.append(n).append("\n");
            } else {
                if (a.isEmpty()) out.append("Empty");
                for (int j = 0; j < n; ++j) out.append(j > 0 ? " " : "").append(a.get(j));
                out.append("\n");
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

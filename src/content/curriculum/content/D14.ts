import type { LessonContent, TraceStep } from '../schema';
import { bstSteps, type BstOp } from '../simulate';

const code = String.raw;

/** The trace's tree is built quietly from these keys (lines 7–8), then each operation below is replayed step by step. */
const start = [50, 30, 70, 20, 40, 60, 80];
const traceOps: BstOp[] = [
  { op: 'insert', value: 35, line: 9 },
  { op: 'search', value: 60, line: 3 },
  { op: 'search', value: 65, line: 3 },
  { op: 'remove', value: 30, line: 12 },
  { op: 'remove', value: 80, line: 13 },
];
/** The steps of operation k alone: the simulator is deterministic, so replaying one more operation only adds its steps. */
const upto = (k: number) => bstSteps('root', traceOps.slice(0, k), start);
const [insert35, search60, search65, remove30, remove80] = traceOps.map((_, k) => upto(k + 1).slice(upto(k).length));
const built = bstSteps('root', [{ op: 'search', value: 50, line: 8 }], start)[0].tree!;
const lastTree = remove80[remove80.length - 1].tree!;
const out1 = 'True', out2 = 'True\nFalse', out3 = 'True\nFalse\n20 35 40 50 60 70';
/** Appends an explanation to the last step of an operation. */
const explainLast = (steps: TraceStep[], extra: string, patch: Partial<TraceStep> = {}) =>
  steps.map((s, i) => (i === steps.length - 1 ? { ...s, note: `${s.note}${extra}`, ...patch } : s));

/** Distinct keys inserted 1, 2, …, 1999 (a chain of height 1998), then printed in order: recursion depth must not matter. */
const chainInput = ['2000', ...Array.from({ length: 1999 }, (_, i) => 'insert ' + (i + 1)), 'inorder'].join('\n');
const chainOutput = Array.from({ length: 1999 }, (_, i) => String(i + 1)).join(' ');

/**
 * D14 Binary Search Tree. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); it has no ordered set, so ordered-set uses a sorted array with
 * hand-written lowerBound/upperBound (like Python's bisect), and the exercise's delete is named remove.
 */
export const D14: LessonContent = {
  lessonId: 'D14',
  motivation: '在一堆資料裡找東西，排序陣列可以用二分搜尋在 O(log n) 內找到，但每插入或刪除一筆就要搬動後面的元素，是 O(n)。二元搜尋樹（Binary Search Tree, BST）把「左邊小、右邊大」的規則放進二元樹的每個節點：搜尋、插入、刪除都只沿著一條從根往下的路徑走，而且資料隨時保持有序，可以由小到大輸出，也能回答「大於或等於 x 的最小值」這種雜湊表做不到的問題。成績排名、事件依時間排序、區間預約系統，以及 C++ 的 `std::set`／`std::map`、Java 的 `TreeSet`／`TreeMap`，背後都是平衡過的 BST。它的限制是：所有操作的時間取決於樹高，資料依大小順序插入時，普通 BST 會退化成一條鏈，速度掉到 O(n)；只需要「在不在」時，雜湊表通常更快。',
  sections: [
    {
      id: 'bst-property', title: 'BST 性質：左小右大，看的是整棵子樹',
      blocks: [
        { type: 'p', text: '二元搜尋樹是一棵二元樹（D12），每個節點存一個鍵（key），而且每一個節點都要滿足：它的左子樹裡每一個鍵都比它小，右子樹裡每一個鍵都比它大。本課約定鍵不重複（重複值的處理方式在第三節說明）。' },
        { type: 'p', text: '例如依序插入 50、30、70、20、40、60、80：根是 50；50 的左孩子是 30，30 的下面是 20 與 40；50 的右孩子是 70，70 的下面是 60 與 80。看 40：它在 30 的右子樹，所以必須比 30 大；它也在 50 的左子樹，所以必須比 50 小。也就是說，每個節點的鍵都被它所有的祖先夾在一個範圍內，而不只是和父節點比較。' },
        { type: 'callout', tone: 'warning', title: '只檢查父子關係不夠', text: '考慮這棵樹：根 10 的左孩子是 5，5 的右孩子是 12。每一對父子都「看起來」正確（5 < 10、12 > 5），但 12 位在 10 的左子樹裡卻比 10 大，違反了 BST 性質。後果是搜尋 12 時，從根看到 12 > 10 就往右走，永遠找不到它。正確的檢查有兩種：一是遞迴時傳入允許的範圍 (low, high)，往左走時把上界改成目前的鍵、往右走時把下界改成目前的鍵；二是做一次中序走訪，確認輸出嚴格遞增。' },
        { type: 'p', text: '為什麼要這樣規定？因為在任何一個節點，只要和它比一次，就知道目標只可能在左邊或右邊，另一整棵子樹可以完全不看。這和排序陣列上的二分搜尋（binary search）每次丟掉一半是同一個道理，差別在於樹不必把資料擠在連續的記憶體裡，所以插入時不用搬動其他元素。' },
      ],
    },
    {
      id: 'search-insert', title: '搜尋與插入：從根往下走一條路徑',
      blocks: [
        { type: 'p', text: '搜尋鍵 x 的步驟：' },
        { type: 'list', ordered: true, items: [
          '從根開始，把目前的節點叫做 cur。',
          'x 等於 cur 的鍵：找到了。',
          'x 比較小：往 cur 的左孩子走；x 比較大：往右孩子走。',
          '走到空（C++ 的 `nullptr`、Python 的 `None`、Java 與 JavaScript 的 `null`）：樹中沒有 x。',
        ] },
        { type: 'p', text: '插入 x 用同樣的方式往下走，直到走到空的位置，就把新節點接在那裡。新節點一定是葉子，原有的節點都不必移動。如果途中遇到相同的鍵，依本課的規則不插入。下面的程式印出搜尋時比較過的每一個鍵：找 60 只看了 50、70、60；找不存在的 65 也只看了 3 個節點，走到 60 的右邊發現是空的就停止。' },
        { type: 'example', id: 'search-path' },
        { type: 'p', text: '每比較一次就往下一層，所以最多比較 h + 1 次，h 是樹高（沿用 D11／D12 的約定：葉子的高度是 0，空樹是 −1）。搜尋與插入都是 O(h)，不是 O(n)。h 有多大由樹的形狀決定：本課第四節會看到，它可以小到約 log₂ n，也可以大到 n − 1。' },
        { type: 'callout', tone: 'note', title: '遞迴寫法要把回傳值接回去', text: '常見的遞迴插入寫法是 `root->left = insert(root->left, x)`（Python、Java 與 JavaScript 寫 `root.left = insert(root.left, x)`）：函式回傳「插入後這棵子樹的根」，呼叫端一定要把它接回父節點；只寫 `insert(root->left, x)` 而沒有接回去，新節點就遺失了，最外層也要寫 `root = insert(root, x)` 處理空樹。另外，Python 預設的遞迴深度上限大約是 1000（可用 `sys.getrecursionlimit()` 查看），樹退化成長鏈時遞迴寫法會丟出 `RecursionError`；搜尋與插入用迴圈寫很自然，本課練習的參考解答全部用迴圈。' },
      ],
    },
    {
      id: 'inorder-delete', title: '中序走訪、刪除的三種情況與重複的鍵',
      blocks: [
        { type: 'p', text: '中序走訪（inorder，D13）的順序是「左子樹 → 自己 → 右子樹」。在 BST 中，左子樹全部比自己小、右子樹全部比自己大，所以中序走訪一定由小到大輸出所有鍵，花 O(n) 時間。這也是檢查一棵樹是不是 BST 最簡單的方法。下面的程式建好樹之後印出中序結果與樹高。' },
        { type: 'example', id: 'build-inorder' },
        { type: 'p', text: '刪除比插入麻煩，因為被刪的節點可能在樹的中間，拿掉之後剩下的節點仍要維持 BST 性質。先像搜尋一樣找到要刪的節點（同時記住它的父節點），再依它有幾個孩子分成三種情況：' },
        { type: 'list', items: [
          '葉子（沒有孩子）：直接拿掉，父節點指向它的指標改成空。',
          '只有一個孩子：讓這個孩子（連同它整棵子樹）接到被刪節點的位置。那棵子樹原本就落在正確的範圍內，所以性質不變。',
          '兩個孩子：找它的中序後繼（inorder successor），也就是右子樹中最小的鍵：從右孩子出發，一直往左走到底。把後繼的鍵複製到被刪的節點，再把原本的後繼節點刪掉。後繼不可能有左孩子（否則它就不是最小），所以這次刪除一定是前兩種情況之一。',
        ] },
        { type: 'p', text: '為什麼後繼可以取代被刪的鍵？它在右子樹裡，所以比左子樹的每個鍵都大；它又是右子樹裡最小的，所以比右子樹剩下的鍵都小。放到中間後，左邊仍全部比它小、右邊仍全部比它大。改用左子樹的最大值（中序前驅，predecessor）也同樣正確，本課與視覺化一律用後繼。注意後繼不一定是右孩子：下方視覺化刪除 30 時，30 的右孩子是 40，但 40 還有左孩子 35，所以後繼是 35。' },
        { type: 'callout', tone: 'warning', title: '刪除時最常見的錯誤', text: '第一，刪除根節點時忘了更新 root：根沒有父節點，要改的是 root 變數本身，例如只剩一個節點時刪掉它，root 要變成空。第二，兩個孩子的情況下直接把右子樹接上來，左子樹就沒有地方放而遺失。第三，在 C++ 中移除節點後要 `delete` 它，而且之後不能再透過舊指標讀取它（懸空指標，dangling pointer）；Python、Java 與 JavaScript 只要讓節點不再被指向，垃圾回收會處理。' },
        { type: 'p', text: '重複的鍵：本課的 BST 不存重複值，插入已存在的鍵時什麼也不做（練習題輸出 `Duplicate`），這也是 `std::set` 與 `TreeSet`（以及 JavaScript 的 `Set`）的行為。若真的需要重複，常見做法有兩種：在節點上多存一個計數 count，插入相同的鍵時只把 count 加 1；或規定相等的鍵一律放在同一邊（例如「左邊小於等於、右邊大於」），這時搜尋與刪除都要照同一個規則。C++ 另有允許重複的 `std::multiset`。' },
      ],
    },
    {
      id: 'balance', title: '平衡與退化：樹高決定速度',
      blocks: [
        { type: 'p', text: '搜尋、插入、刪除都是 O(h)。n 個節點時，最好的情況是每一層都排滿，h 約為 log₂ n（例如 7 個節點高度 2、1023 個節點高度 9）；最壞的情況是依遞增（或遞減）順序插入：每個新鍵都比之前的鍵大，永遠接在最右邊，整棵樹退化成一條鏈（每個節點只有右孩子），h = n − 1，搜尋變成 O(n)，和在串列中逐一尋找沒有差別。依隨機順序插入時，期望高度是 O(log n)；但真實資料（與測資）常常已經排好序。' },
        { type: 'example', id: 'sorted-chain' },
        { type: 'p', text: '自平衡二元搜尋樹（self-balancing BST）在插入與刪除之後，用旋轉（rotation）調整形狀，保證 h 一直是 O(log n)。常見的有 AVL 樹（每個節點左右子樹的高度差不超過 1）與紅黑樹（red-black tree，用節點顏色的規則保證從根到葉子的最長路徑不超過最短路徑的兩倍）。旋轉的細節超出本課範圍；實務上幾乎不用自己寫，直接使用語言的函式庫：' },
        { type: 'table', head: ['操作', 'C++ `std::set`／`std::map`', 'Java `TreeSet`／`TreeMap`', 'Python 排序 `list` + `bisect`', 'JavaScript 排序陣列 + 自己寫的二分搜尋'], rows: [
          ['底層', '標準要求 O(log n)；常見實作（libstdc++、libc++、MSVC）都是紅黑樹', '紅黑樹（官方文件明載）', '排好序的 list，不是樹', '排好序的陣列，不是樹'],
          ['搜尋', '`s.find(x)`、`s.count(x)`，O(log n)', '`s.contains(x)`，O(log n)', '`bisect_left` 再檢查該位置，O(log n)', '`lowerBound(keys, x)` 再檢查該位置，O(log n)'],
          ['插入', '`s.insert(x)`，O(log n)', '`s.add(x)`，O(log n)', '`insort(keys, x)`：找位置 O(log n)，搬移元素 O(n)', '`keys.splice(i, 0, x)`：找位置 O(log n)，搬移元素 O(n)'],
          ['刪除', '`s.erase(x)`，O(log n)', '`s.remove(x)`，O(log n)', '找到位置後 `del keys[i]`，O(n)', '找到位置後 `keys.splice(i, 1)`，O(n)'],
          ['≥ x 的最小值', '`s.lower_bound(x)`（> x 用 `upper_bound`），O(log n)', '`s.ceiling(x)`（> x 用 `higher`），O(log n)', '`keys[bisect_left(keys, x)]`，O(log n)', '`keys[lowerBound(keys, x)]`，O(log n)'],
          ['≤ x 的最大值', '`upper_bound(x)` 的前一個，O(log n)', '`s.floor(x)`（< x 用 `lower`），O(log n)', '`keys[bisect_right(keys, x) - 1]`，O(log n)', '`keys[upperBound(keys, x) - 1]`，O(log n)'],
          ['最小／最大', '`*s.begin()`、`*s.rbegin()`，O(1)', '`s.first()`、`s.last()`，O(log n)', '`keys[0]`、`keys[-1]`，O(1)', '`keys[0]`、`keys[keys.length - 1]`，O(1)'],
          ['走訪順序', '由小到大', '由小到大', '由小到大', '由小到大'],
        ] },
        { type: 'p', text: 'C++：`lower_bound` 回傳迭代器，找不到時是 `s.end()`，對 `end()` 取值是未定義行為，一定要先比較。插入不會讓任何迭代器失效，`erase` 只讓指向被刪元素的迭代器失效（iterator invalidation）。`std::map` 的 `m[k]` 在 k 不存在時會插入一個預設值，只想查詢時要用 `find` 或 `count`。' },
        { type: 'p', text: 'Java：`ceiling`、`floor`、`higher`、`lower` 找不到時回傳 `null`，直接指定給 `int` 會因自動拆箱丟出 `NullPointerException`；`first()`、`last()` 在空集合上丟出 `NoSuchElementException`。用 for-each 走訪 `TreeSet` 時同時呼叫 `s.remove(x)`，會丟出 `ConcurrentModificationException`，要改用迭代器自己的 `remove()`。' },
        { type: 'p', text: 'Python：標準函式庫沒有平衡 BST。排序好的 `list` 搭配 `bisect` 模組，查詢是 O(log n)，但插入與刪除要搬移元素，是 O(n)；資料量大又頻繁修改時會變慢。第三方套件 `sortedcontainers` 的 `SortedList` 提供類似 `TreeSet` 的功能，但它不在標準函式庫裡，比賽或檢測環境通常不能使用。另外 `dict` 與 `set` 是雜湊表：`dict` 保留的是插入順序，不是大小順序（D08、D09）。' },
        { type: 'p', text: 'JavaScript：同樣沒有內建的平衡 BST 或有序集合。`Set` 與 `Map` 是雜湊表，走訪順序是插入順序，不是大小順序；需要順序時，用排序好的陣列加上自己寫的二分搜尋（`lowerBound`／`upperBound`），插入與刪除用 `splice`，要搬移元素，是 O(n)。另外陣列的 `sort()` 預設依字串比較，數字要寫 `sort((a, b) => a - b)`。' },
        { type: 'example', id: 'ordered-set' },
      ],
    },
    {
      id: 'compare', title: 'BST、平衡 BST、雜湊表與排序陣列怎麼選',
      blocks: [
        { type: 'table', head: ['結構', '搜尋', '插入／刪除', '由小到大輸出', '≥ x 的最小值'], rows: [
          ['普通 BST（不平衡）', '平均 O(log n)，最壞 O(n)', '平均 O(log n)，最壞 O(n)', 'O(n)', 'O(h)，最壞 O(n)'],
          ['平衡 BST（`std::set`、`TreeSet`）', 'O(log n)', 'O(log n)', 'O(n)', 'O(log n)'],
          ['雜湊表（`unordered_set`、`set`、`HashSet`、`Set`）', '平均 O(1)，最壞 O(n)', '平均 O(1)，最壞 O(n)', '要先排序，O(n log n)', '只能逐一檢查，O(n)'],
          ['排序陣列（`vector`／`list` + 二分搜尋）', 'O(log n)', 'O(n)（要搬移元素）', 'O(n)', 'O(log n)'],
        ] },
        { type: 'p', text: '表中普通 BST 的「平均」指的是鍵依隨機順序插入；遇到已排序的輸入就是最壞情況。' },
        { type: 'list', items: [
          '只需要「在不在」或「對應的值是多少」：雜湊表平均 O(1)，最快（D10）。',
          '需要和順序有關的查詢（最小、最大、≥ x 的最小值、某範圍內的所有鍵、由小到大輸出），而且資料會一直插入與刪除：平衡 BST，也就是 `std::set`／`std::map`、`TreeSet`／`TreeMap`。',
          '資料建好之後幾乎不再變動：排序陣列加二分搜尋，記憶體最省、常數也小。',
          '自己寫的普通 BST：適合學習原理與輸入順序隨機的情況；輸入可能已排序時就會退化，正式使用時請換成函式庫的平衡版本。',
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'search-path', title: '搜尋並印出比較過的鍵', description: '依序插入 50、30、70、20、40、60、80、35，再搜尋 60、65、35，印出每次搜尋從根往下比較過的鍵。',
      output: 'search 60: 50 70 60 -> found\nsearch 65: 50 70 60 -> not found\nsearch 35: 50 30 40 35 -> found',
      code: {
        'C++': code`#include <iostream>
#include <vector>

struct Node { int key; Node* left; Node* right; };

Node* insert(Node* root, int x) {
    if (root == nullptr) return new Node{x, nullptr, nullptr};
    if (x < root->key) root->left = insert(root->left, x);
    else if (x > root->key) root->right = insert(root->right, x);
    return root;
}

// 從根往下走，把比較過的鍵記在 path 裡
bool search(Node* root, int x, std::vector<int>& path) {
    Node* cur = root;
    while (cur != nullptr) {
        path.push_back(cur->key);
        if (x == cur->key) return true;
        cur = x < cur->key ? cur->left : cur->right;
    }
    return false;
}

void destroy(Node* root) {
    if (root == nullptr) return;
    destroy(root->left);
    destroy(root->right);
    delete root;
}

int main() {
    Node* root = nullptr;
    for (int x : {50, 30, 70, 20, 40, 60, 80, 35}) root = insert(root, x);
    for (int x : {60, 65, 35}) {
        std::vector<int> path;
        bool found = search(root, x, path);
        std::cout << "search " << x << ":";
        for (int k : path) std::cout << " " << k;
        std::cout << (found ? " -> found" : " -> not found") << "\n";
    }
    destroy(root);
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(root, x):
    if root is None:
        return Node(x)
    if x < root.key:
        root.left = insert(root.left, x)
    elif x > root.key:
        root.right = insert(root.right, x)
    return root


def search(root, x):
    path = []  # 比較過的鍵
    cur = root
    while cur is not None:
        path.append(cur.key)
        if x == cur.key:
            return True, path
        cur = cur.left if x < cur.key else cur.right
    return False, path


root = None
for x in [50, 30, 70, 20, 40, 60, 80, 35]:
    root = insert(root, x)
for x in [60, 65, 35]:
    found, path = search(root, x)
    print(f"search {x}:", *path, "-> found" if found else "-> not found")`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static class Node {
        int key;
        Node left, right;
        Node(int key) { this.key = key; }
    }

    static Node insert(Node root, int x) {
        if (root == null) return new Node(x);
        if (x < root.key) root.left = insert(root.left, x);
        else if (x > root.key) root.right = insert(root.right, x);
        return root;
    }

    // 從根往下走，把比較過的鍵記在 path 裡
    static boolean search(Node root, int x, List<Integer> path) {
        Node cur = root;
        while (cur != null) {
            path.add(cur.key);
            if (x == cur.key) return true;
            cur = x < cur.key ? cur.left : cur.right;
        }
        return false;
    }

    public static void main(String[] args) {
        Node root = null;
        for (int x : new int[] {50, 30, 70, 20, 40, 60, 80, 35}) root = insert(root, x);
        for (int x : new int[] {60, 65, 35}) {
            List<Integer> path = new ArrayList<>();
            boolean found = search(root, x, path);
            StringBuilder sb = new StringBuilder("search " + x + ":");
            for (int k : path) sb.append(" ").append(k);
            sb.append(found ? " -> found" : " -> not found");
            System.out.println(sb);
        }
    }
}`,
        JavaScript: code`class Node {
    constructor(key) {
        this.key = key;
        this.left = null;
        this.right = null;
    }
}

function insert(root, x) {
    if (root === null) return new Node(x);
    if (x < root.key) root.left = insert(root.left, x);
    else if (x > root.key) root.right = insert(root.right, x);
    return root;
}

// 從根往下走，把比較過的鍵記在 path 裡
function search(root, x, path) {
    let cur = root;
    while (cur !== null) {
        path.push(cur.key);
        if (x === cur.key) return true;
        cur = x < cur.key ? cur.left : cur.right;
    }
    return false;
}

let root = null;
for (const x of [50, 30, 70, 20, 40, 60, 80, 35]) root = insert(root, x);
for (const x of [60, 65, 35]) {
    const path = [];
    const found = search(root, x, path);
    console.log("search " + x + ": " + path.join(" ") + (found ? " -> found" : " -> not found"));
}`,
      },
    },
    {
      id: 'build-inorder', title: '中序走訪得到由小到大的順序', description: '插入 50、30、70、20、40、60、80、35 後做中序走訪並計算樹高（葉子高度 0，空樹 −1）。插入順序是亂的，輸出卻已排序。',
      output: 'inorder: 20 30 35 40 50 60 70 80\nheight: 3',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>

struct Node { int key; Node* left; Node* right; };

Node* insert(Node* root, int x) {
    if (root == nullptr) return new Node{x, nullptr, nullptr};
    if (x < root->key) root->left = insert(root->left, x);
    else if (x > root->key) root->right = insert(root->right, x);
    return root;  // x 已存在：不插入重複值
}

void inorder(Node* root) {  // 左、根、右
    if (root == nullptr) return;
    inorder(root->left);
    std::cout << " " << root->key;
    inorder(root->right);
}

int height(Node* root) {
    if (root == nullptr) return -1;  // 空樹 -1，葉子 0
    return 1 + std::max(height(root->left), height(root->right));
}

void destroy(Node* root) {
    if (root == nullptr) return;
    destroy(root->left);
    destroy(root->right);
    delete root;
}

int main() {
    Node* root = nullptr;
    for (int x : {50, 30, 70, 20, 40, 60, 80, 35}) root = insert(root, x);
    std::cout << "inorder:";
    inorder(root);
    std::cout << "\n";
    std::cout << "height: " << height(root) << "\n";
    destroy(root);
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(root, x):
    if root is None:
        return Node(x)
    if x < root.key:
        root.left = insert(root.left, x)
    elif x > root.key:
        root.right = insert(root.right, x)
    return root  # x 已存在：不插入重複值


def inorder(root, out):  # 左、根、右
    if root is not None:
        inorder(root.left, out)
        out.append(root.key)
        inorder(root.right, out)


def height(root):
    if root is None:
        return -1  # 空樹 -1，葉子 0
    return 1 + max(height(root.left), height(root.right))


root = None
for x in [50, 30, 70, 20, 40, 60, 80, 35]:
    root = insert(root, x)
keys = []
inorder(root, keys)
print("inorder:", *keys)
print("height:", height(root))`,
        Java: code`public class Main {
    static class Node {
        int key;
        Node left, right;
        Node(int key) { this.key = key; }
    }

    static Node insert(Node root, int x) {
        if (root == null) return new Node(x);
        if (x < root.key) root.left = insert(root.left, x);
        else if (x > root.key) root.right = insert(root.right, x);
        return root;  // x 已存在：不插入重複值
    }

    static void inorder(Node root, StringBuilder out) {  // 左、根、右
        if (root == null) return;
        inorder(root.left, out);
        out.append(" ").append(root.key);
        inorder(root.right, out);
    }

    static int height(Node root) {
        if (root == null) return -1;  // 空樹 -1，葉子 0
        return 1 + Math.max(height(root.left), height(root.right));
    }

    public static void main(String[] args) {
        Node root = null;
        for (int x : new int[] {50, 30, 70, 20, 40, 60, 80, 35}) root = insert(root, x);
        StringBuilder out = new StringBuilder("inorder:");
        inorder(root, out);
        System.out.println(out);
        System.out.println("height: " + height(root));
    }
}`,
        JavaScript: code`class Node {
    constructor(key) {
        this.key = key;
        this.left = null;
        this.right = null;
    }
}

function insert(root, x) {
    if (root === null) return new Node(x);
    if (x < root.key) root.left = insert(root.left, x);
    else if (x > root.key) root.right = insert(root.right, x);
    return root;  // x 已存在：不插入重複值
}

function inorder(root, out) {  // 左、根、右
    if (root === null) return;
    inorder(root.left, out);
    out.push(root.key);
    inorder(root.right, out);
}

function height(root) {
    if (root === null) return -1;  // 空樹 -1，葉子 0
    return 1 + Math.max(height(root.left), height(root.right));
}

let root = null;
for (const x of [50, 30, 70, 20, 40, 60, 80, 35]) root = insert(root, x);
const keys = [];
inorder(root, keys);
console.log("inorder: " + keys.join(" "));
console.log("height: " + height(root));`,
      },
    },
    {
      id: 'sorted-chain', title: '插入順序決定樹高', description: '同樣是 1 到 7，依遞增順序插入會排成一條鏈；依 4 2 6 1 3 5 7 插入則是排滿的樹。印出樹高，以及找到 7 要比較幾次。',
      output: 'sorted 1..7: height 6, find 7 in 7 steps\n4 2 6 1 3 5 7: height 2, find 7 in 3 steps',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

struct Node { int key; Node* left; Node* right; };

Node* insert(Node* root, int x) {
    if (root == nullptr) return new Node{x, nullptr, nullptr};
    if (x < root->key) root->left = insert(root->left, x);
    else if (x > root->key) root->right = insert(root->right, x);
    return root;
}

int height(Node* root) {
    if (root == nullptr) return -1;  // 空樹 -1，葉子 0
    return 1 + std::max(height(root->left), height(root->right));
}

int steps(Node* root, int x) {  // 找到 x 要比較幾次
    int count = 0;
    Node* cur = root;
    while (cur != nullptr) {
        ++count;
        if (cur->key == x) break;
        cur = x < cur->key ? cur->left : cur->right;
    }
    return count;
}

void destroy(Node* root) {
    if (root == nullptr) return;
    destroy(root->left);
    destroy(root->right);
    delete root;
}

void report(const char* name, const std::vector<int>& keys) {
    Node* root = nullptr;
    for (int x : keys) root = insert(root, x);
    std::cout << name << ": height " << height(root) << ", find 7 in " << steps(root, 7) << " steps\n";
    destroy(root);
}

int main() {
    report("sorted 1..7", {1, 2, 3, 4, 5, 6, 7});
    report("4 2 6 1 3 5 7", {4, 2, 6, 1, 3, 5, 7});
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(root, x):
    if root is None:
        return Node(x)
    if x < root.key:
        root.left = insert(root.left, x)
    elif x > root.key:
        root.right = insert(root.right, x)
    return root


def height(root):
    if root is None:
        return -1  # 空樹 -1，葉子 0
    return 1 + max(height(root.left), height(root.right))


def steps(root, x):  # 找到 x 要比較幾次
    count, cur = 0, root
    while cur is not None:
        count += 1
        if cur.key == x:
            break
        cur = cur.left if x < cur.key else cur.right
    return count


for name, keys in [("sorted 1..7", [1, 2, 3, 4, 5, 6, 7]), ("4 2 6 1 3 5 7", [4, 2, 6, 1, 3, 5, 7])]:
    root = None
    for x in keys:
        root = insert(root, x)
    print(f"{name}: height {height(root)}, find 7 in {steps(root, 7)} steps")`,
        Java: code`public class Main {
    static class Node {
        int key;
        Node left, right;
        Node(int key) { this.key = key; }
    }

    static Node insert(Node root, int x) {
        if (root == null) return new Node(x);
        if (x < root.key) root.left = insert(root.left, x);
        else if (x > root.key) root.right = insert(root.right, x);
        return root;
    }

    static int height(Node root) {
        if (root == null) return -1;  // 空樹 -1，葉子 0
        return 1 + Math.max(height(root.left), height(root.right));
    }

    static int steps(Node root, int x) {  // 找到 x 要比較幾次
        int count = 0;
        Node cur = root;
        while (cur != null) {
            count++;
            if (cur.key == x) break;
            cur = x < cur.key ? cur.left : cur.right;
        }
        return count;
    }

    static void report(String name, int[] keys) {
        Node root = null;
        for (int x : keys) root = insert(root, x);
        System.out.println(name + ": height " + height(root) + ", find 7 in " + steps(root, 7) + " steps");
    }

    public static void main(String[] args) {
        report("sorted 1..7", new int[] {1, 2, 3, 4, 5, 6, 7});
        report("4 2 6 1 3 5 7", new int[] {4, 2, 6, 1, 3, 5, 7});
    }
}`,
        JavaScript: code`class Node {
    constructor(key) {
        this.key = key;
        this.left = null;
        this.right = null;
    }
}

function insert(root, x) {
    if (root === null) return new Node(x);
    if (x < root.key) root.left = insert(root.left, x);
    else if (x > root.key) root.right = insert(root.right, x);
    return root;
}

function height(root) {
    if (root === null) return -1;  // 空樹 -1，葉子 0
    return 1 + Math.max(height(root.left), height(root.right));
}

function steps(root, x) {  // 找到 x 要比較幾次
    let count = 0;
    let cur = root;
    while (cur !== null) {
        count++;
        if (cur.key === x) break;
        cur = x < cur.key ? cur.left : cur.right;
    }
    return count;
}

function report(name, keys) {
    let root = null;
    for (const x of keys) root = insert(root, x);
    console.log(name + ": height " + height(root) + ", find 7 in " + steps(root, 7) + " steps");
}

report("sorted 1..7", [1, 2, 3, 4, 5, 6, 7]);
report("4 2 6 1 3 5 7", [4, 2, 6, 1, 3, 5, 7]);`,
      },
    },
    {
      id: 'ordered-set', title: '函式庫的有序集合：ceiling 與 floor', description: '插入 40、10、50、30、20、30（第二個 30 不會重複存），由小到大印出，再對 25、30、55、5 查詢「≥ x 的最小值」與「≤ x 的最大值」。C++ 用 std::set 的 lower_bound／upper_bound，Java 用 TreeSet 的 ceiling／floor，Python 用排序 list 加 bisect，JavaScript 用排序陣列加自己寫的二分搜尋。',
      output: 'size: 5\nsorted: 10 20 30 40 50\nx=25 ceiling=30 floor=20\nx=30 ceiling=30 floor=30\nx=55 ceiling=none floor=50\nx=5 ceiling=10 floor=none',
      code: {
        'C++': code`#include <iostream>
#include <iterator>
#include <set>

int main() {
    std::set<int> s;
    for (int x : {40, 10, 50, 30, 20, 30}) s.insert(x);  // 第二個 30 不會插入
    std::cout << "size: " << s.size() << "\n";
    std::cout << "sorted:";
    for (int x : s) std::cout << " " << x;
    std::cout << "\n";
    for (int x : {25, 30, 55, 5}) {
        auto it = s.lower_bound(x);  // 第一個 >= x，沒有就是 end()
        auto up = s.upper_bound(x);  // 第一個 > x，它的前一個就是 <= x 的最大值
        std::cout << "x=" << x << " ceiling=";
        if (it == s.end()) std::cout << "none";
        else std::cout << *it;
        std::cout << " floor=";
        if (up == s.begin()) std::cout << "none";
        else std::cout << *std::prev(up);
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`import bisect

keys = []  # 一直保持由小到大
for x in [40, 10, 50, 30, 20, 30]:
    i = bisect.bisect_left(keys, x)
    if i == len(keys) or keys[i] != x:  # 不存重複值
        keys.insert(i, x)  # 要搬移後面的元素：O(n)
print("size:", len(keys))
print("sorted:", *keys)
for x in [25, 30, 55, 5]:
    i = bisect.bisect_left(keys, x)  # 第一個 >= x 的位置
    ceiling = keys[i] if i < len(keys) else "none"
    j = bisect.bisect_right(keys, x)  # 第一個 > x 的位置
    floor = keys[j - 1] if j > 0 else "none"
    print(f"x={x} ceiling={ceiling} floor={floor}")`,
        Java: code`import java.util.TreeSet;

public class Main {
    public static void main(String[] args) {
        TreeSet<Integer> s = new TreeSet<>();
        for (int x : new int[] {40, 10, 50, 30, 20, 30}) s.add(x);  // 第二個 30 的 add 回傳 false
        System.out.println("size: " + s.size());
        StringBuilder sb = new StringBuilder("sorted:");
        for (int x : s) sb.append(" ").append(x);
        System.out.println(sb);
        for (int x : new int[] {25, 30, 55, 5}) {
            Integer ceiling = s.ceiling(x);  // >= x 的最小值，沒有就是 null
            Integer floor = s.floor(x);      // <= x 的最大值，沒有就是 null
            System.out.println("x=" + x + " ceiling=" + (ceiling == null ? "none" : ceiling)
                + " floor=" + (floor == null ? "none" : floor));
        }
    }
}`,
        JavaScript: code`// JavaScript 沒有內建的有序集合：用排序好的陣列，自己寫二分搜尋
function lowerBound(a, x) {  // 第一個 >= x 的位置
    let lo = 0, hi = a.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (a[mid] < x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function upperBound(a, x) {  // 第一個 > x 的位置
    let lo = 0, hi = a.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (a[mid] <= x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

const keys = [];  // 一直保持由小到大
for (const x of [40, 10, 50, 30, 20, 30]) {
    const i = lowerBound(keys, x);
    if (i === keys.length || keys[i] !== x) keys.splice(i, 0, x);  // 不存重複值；splice 要搬移後面的元素：O(n)
}
console.log("size: " + keys.length);
console.log("sorted: " + keys.join(" "));
for (const x of [25, 30, 55, 5]) {
    const i = lowerBound(keys, x);
    const ceiling = i < keys.length ? keys[i] : "none";
    const j = upperBound(keys, x);
    const floor = j > 0 ? keys[j - 1] : "none";
    console.log("x=" + x + " ceiling=" + ceiling + " floor=" + floor);
}`,
      },
    },
  ],
  visualization: {
    kind: 'tree-traversal', title: 'BST：插入、搜尋與刪除都只走一條路徑', language: 'Python',
    code: code`def search(node, x):
    while node is not None and node.key != x:
        node = node.left if x < node.key else node.right
    return node is not None
# insert、delete、inorder 的寫法見本課各節與練習
root = None
for k in [50, 30, 70, 20, 40, 60, 80]:
    root = insert(root, k)
root = insert(root, 35)
print(search(root, 60))
print(search(root, 65))
root = delete(root, 30)
root = delete(root, 80)
print(inorder(root))`,
    steps: [
      { line: 8, note: '迴圈依序插入 50、30、70、20、40、60、80：50 成為根，之後每個鍵都從根往下比較，小的往左、大的往右，走到空位就接成新葉子。這 7 個鍵剛好排成每層都滿、高度 2 的樹。', tree: { ...built, marks: [] } },
      ...explainLast(insert35, '一路比較了 50、30、40 三個節點，其他節點都不用看；原有的節點也都沒有移動。'),
      ...explainLast(search60.map(s => ({ ...s, vars: { x: '60' } })), '`search` 回傳 True，印出 True。60 的深度是 2，所以比較了 3 次。',
        { line: 10, vars: { x: '60', 'search(root, 60)': 'True' }, output: out1 }),
      ...explainLast(search65.map(s => ({ ...s, vars: { x: '65' }, output: out1 })), '60 的右孩子是 None，while 迴圈結束，回傳 False。樹裡有 8 個節點，只比較了其中 3 個。',
        { line: 11, vars: { x: '65', 'search(root, 65)': 'False' }, output: out2 }),
      ...explainLast(remove30.map(s => ({ ...s, output: out2 })), '現在 35 坐在原本 30 的位置：它比左邊的 20 大、比右邊的 40 小，BST 性質仍然成立。'),
      ...explainLast(remove80.map(s => ({ ...s, output: out2 })), '70 的右孩子改成 None。'),
      { line: 14, note: '中序走訪（左、根、右）依序輸出 20 35 40 50 60 70：刪除兩次之後仍由小到大，代表 BST 性質一直保持著。', output: out3,
        tree: { ...lastTree, marks: lastTree.nodes.map(n => ({ id: n.id, kind: 'visited' as const })) } },
    ],
    playground: { structure: 'bst' },
  },
  quiz: [
    {
      id: 'q-inorder', prompt: '把下列鍵依序用本課的 insert（小的往左、大的往右）插入空的 BST，再做中序走訪，輸出什麼？',
      code: { language: 'Python', text: 'root = None\nfor x in [8, 3, 10, 1, 6, 14, 4, 7, 13]:\n    root = insert(root, x)\nprint(*inorder(root))  # 中序：左、根、右' },
      options: ['8 3 1 6 4 7 10 14 13', '8 3 10 1 6 14 4 7 13', '1 3 4 6 7 8 10 13 14', '1 4 7 6 3 13 14 10 8'],
      answer: 2, explanation: 'BST 的中序走訪一定由小到大，不必畫樹也能確定答案是排序後的 1 3 4 6 7 8 10 13 14。「8 3 1 6 4 7 10 14 13」是前序走訪（根、左、右）；「8 3 10 1 6 14 4 7 13」是插入順序，這棵樹的層序走訪剛好也是它；「1 4 7 6 3 13 14 10 8」是後序走訪（左、右、根）。',
    },
    {
      id: 'q-sorted-height', prompt: '把 10、20、30、40、50、60 依遞增順序插入空的 BST。結果的高度（葉子高度 0）與形狀是什麼？',
      options: ['高度 5：每個節點只有右孩子，排成一條鏈', '高度 2：接近每層都滿的樹', '高度 6：每個節點只有右孩子，排成一條鏈', '高度 5：每個節點只有左孩子，排成一條鏈'],
      answer: 0, explanation: '每個新鍵都比樹中所有鍵大，所以每次都一路往右走到底，接成最右邊節點的右孩子：10 → 20 → … → 60 排成一條鏈。6 個節點的鏈有 5 條邊，高度是 5（不是 6，高度數的是邊）。只有左孩子的鏈要依遞減順序插入才會出現；高度 2 是同樣 6 個鍵以平衡順序插入（例如 40 20 50 10 30 60）時才有的形狀。這就是最壞情況：搜尋 60 要比較 6 次，是 O(n)。',
    },
    {
      id: 'q-delete-two', prompt: '依序插入 50、30、70、20、40、60、80、65 建成 BST，再刪除根 50。依本課的規則（兩個孩子時用中序後繼取代），哪個鍵會移到根的位置？',
      options: ['65', '60', '70', '80'],
      answer: 1, explanation: '後繼是右子樹中最小的鍵：從 50 的右孩子 70 出發一直往左走，70 → 60，60 沒有左孩子，所以後繼是 60。把 60 複製到根，再刪除原本的 60 節點：它只有右孩子 65，讓 65 接到 70 的左邊。70 是右孩子而不是右子樹的最小值；65 比 60 大；80 是右子樹的最大值。用左子樹最大值（前驅 40）取代也能維持 BST 性質，但本課規定用後繼。',
    },
    {
      id: 'q-validate', prompt: '下面的函式想檢查一棵樹是不是 BST，它錯在哪裡？',
      code: { language: 'Python', text: 'def is_bst(node):\n    if node is None:\n        return True\n    if node.left is not None and node.left.key >= node.key:\n        return False\n    if node.right is not None and node.right.key <= node.key:\n        return False\n    return is_bst(node.left) and is_bst(node.right)' },
      options: [
        '只比較節點和它的直接孩子：根 10、左孩子 5、5 的右孩子 12 這棵樹會被誤判為 BST',
        '空樹會被判定為不是 BST',
        '葉子沒有孩子，程式會對 None 取 `.key` 而出錯',
        '遞迴沒有終止條件，會無限遞迴',
      ],
      answer: 0, explanation: 'BST 性質要求左子樹的「每一個」鍵都比自己小，而這個函式只看直接的孩子。在 10 → 5 → 12 的例子中，10 與 5、5 與 12 兩對父子都通過檢查，但 12 在 10 的左子樹裡卻比 10 大，函式卻回傳 True。修正方法是傳入範圍 (low, high) 一路往下檢查，或檢查中序走訪是否嚴格遞增。其他選項都不對：`node is None` 時回傳 True，空樹算 BST，也是遞迴的終止條件；取 `.key` 之前都先檢查了 `is not None`。',
    },
    {
      id: 'q-complexity', prompt: '一棵有 n 個節點、高度 h 的普通 BST（不保證平衡），搜尋一個鍵在最壞情況下要花多少時間？',
      options: ['一律 O(log n)，因為每比較一次就丟掉一半', 'O(1)，和雜湊表一樣', 'O(h)：平衡時約 O(log n)，退化成鏈時是 O(n)', 'O(n log n)'],
      answer: 2, explanation: '搜尋從根往下走一條路徑，每層比較一次，最多比較 h + 1 次，所以是 O(h)。只有樹平衡時 h 才是 O(log n)；依排序順序插入的樹是一條鏈，h = n − 1，搜尋是 O(n)。「每次丟掉一半」只有在左右子樹大小相近時才成立，鏈的每一步只丟掉一個節點。O(1) 是雜湊表的平均情況，BST 做不到；O(n log n) 比逐一檢查全部節點還慢，不是搜尋的成本。',
    },
    {
      id: 'q-choose', prompt: '一個程式要處理 200,000 次交錯出現的操作：加入一個整數、刪除一個整數、查詢「大於或等於 x 的最小整數」。下列哪個選擇最合適？',
      options: ['雜湊表（`unordered_set`、`set`、`HashSet`）', '自己寫的普通 BST', '排序陣列加二分搜尋', '平衡 BST（`std::set`、`TreeSet`）'],
      answer: 3, explanation: '平衡 BST 的加入、刪除與 `lower_bound`／`ceiling` 都是 O(log n)，20 萬次操作輕鬆完成。雜湊表雖然加入與刪除平均 O(1)，但它不維持大小順序，查詢「≥ x 的最小值」只能逐一檢查 O(n)。排序陣列查詢是 O(log n)，但每次加入或刪除要搬移元素 O(n)，最壞要搬動約 n² 量級的元素。普通 BST 遇到遞增的輸入會退化成鏈，每個操作都變 O(n)。Python 的標準函式庫沒有平衡 BST，只能用排序 list 加 `bisect`（插入 O(n)）或第三方的 `sortedcontainers`。',
    },
  ],
  exercises: [
    {
      id: 'e-bst-commands', title: '用指令操作 BST',
      statement: '請自己用節點（C++ 的 struct 加指標、Python、Java 與 JavaScript 的類別）實作一棵存放「不重複整數」的二元搜尋樹，不可以使用 `std::set`、`TreeSet` 等函式庫的有序集合。一開始樹是空的，依序執行 q 個指令：`insert x` 插入 x；`find x` 查詢 x 是否在樹中，輸出 `yes` 或 `no`；`inorder` 以中序走訪由小到大輸出所有鍵，以一個空白分隔，樹是空的就輸出 `empty`；`delete x` 刪除 x，若 x 有兩個孩子，用中序後繼（右子樹的最小值）取代。錯誤處理：`insert` 一個已經存在的鍵時不改變樹，輸出 `Duplicate`；`delete` 一個不存在的鍵時輸出 `Not found`。成功的 `insert` 與 `delete` 不輸出任何東西。',
      inputFormat: '第一行是指令數 q。接下來 q 行，每行一個指令：`insert x`、`find x`、`delete x` 或 `inorder`。',
      outputFormat: '依序輸出 `find`、`inorder` 的結果與錯誤訊息，每個一行。',
      constraints: ['1 ≤ q ≤ 2,000', 'x 是整數，−1,000,000,000 ≤ x ≤ 1,000,000,000', '保證至少有一個指令會輸出', '樹最多有 2,000 個節點，可能退化成高度約 2,000 的鏈：用迴圈實作，或確認遞迴深度足夠（Python 預設約 1,000）'],
      samples: [
        { kind: 'normal', input: '8\ninsert 50\ninsert 30\ninsert 70\nfind 30\nfind 65\ninorder\ndelete 50\ninorder', output: 'yes\nno\n30 50 70\n30 70', note: '刪除根 50（兩個孩子），由後繼 70 取代' },
      ],
      tests: [
        { kind: 'normal', input: '8\ninsert 50\ninsert 30\ninsert 70\nfind 30\nfind 65\ninorder\ndelete 50\ninorder', output: 'yes\nno\n30 50 70\n30 70', note: '範例：基本插入、查詢與刪除根' },
        { kind: 'normal', input: '14\ninsert 50\ninsert 30\ninsert 70\ninsert 20\ninsert 40\ninsert 60\ninsert 80\ninsert 35\ndelete 30\ninorder\nfind 35\nfind 30\ndelete 80\ninorder', output: '20 35 40 50 60 70 80\nyes\nno\n20 35 40 50 60 70', note: '刪除有兩個孩子的 30：後繼是更深的 35，不是右孩子 40；再刪除葉子 80' },
        { kind: 'normal', input: '9\ninsert 10\ninsert 5\ninsert 3\ninsert -5\ninsert 0\ndelete 5\ninorder\nfind 3\nfind -5', output: '-5 0 3 10\nyes\nyes', note: '刪除只有一個孩子的 5，整棵左子樹接上來；含負數' },
        { kind: 'edge', input: '1\ninorder', output: 'empty', note: '空樹的中序走訪' },
        { kind: 'edge', input: '5\ninsert 7\ndelete 7\ninorder\ninsert 7\ninorder', output: 'empty\n7', note: '刪除唯一的節點（根是葉子）後樹變空，再插入同一個鍵' },
        { kind: 'edge', input: '6\ninsert 5\ninsert 8\ninsert 9\ndelete 5\ninorder\nfind 5', output: '8 9\nno', note: '刪除只有一個孩子的根，root 要改指向孩子' },
        { kind: 'edge', input: '8\ninsert 2\ninsert 1\ninsert 3\ndelete 2\ninorder\ndelete 1\ndelete 3\ninorder', output: '1 3\nempty', note: '連續刪除根直到樹變空' },
        { kind: 'edge', input: '10\ninsert 50\ninsert 30\ninsert 70\ninsert 60\ninsert 80\ninsert 65\ndelete 50\ninorder\ndelete 60\ninorder', output: '30 60 65 70 80\n30 65 70 80', note: '後繼 60 有右孩子 65，移走後繼時 65 要接到 70 的左邊' },
        { kind: 'edge', input: chainInput, output: chainOutput, note: '依遞增順序插入 1999 個鍵：樹退化成高度 1998 的鏈' },
        { kind: 'error', input: '4\ninsert 5\ninsert 5\ninorder\nfind 5', output: 'Duplicate\n5\nyes', note: '插入已存在的鍵：輸出 Duplicate，樹不變' },
        { kind: 'error', input: '1\ndelete 3', output: 'Not found', note: '在空樹上刪除' },
        { kind: 'error', input: '7\ninsert 4\ninsert 2\ndelete 3\ninorder\ndelete 2\ndelete 2\ninorder', output: 'Not found\n2 4\nNot found\n4', note: '刪除不存在的鍵，以及重複刪除同一個鍵' },
      ],
      hints: [
        '搜尋、插入、刪除都先用同一個迴圈往下走：`parent` 記住上一個節點，`cur` 是目前的節點，小的往左、大的往右。',
        '插入：走到 cur 是空的位置，就把新節點接成 parent 的左或右孩子；parent 也是空時，代表樹是空的，新節點就是 root。',
        '刪除兩個孩子的節點：從 `cur.right` 一直往左走找到後繼 s（同時記住它的父節點），把 s 的鍵複製到 cur，接下來改成刪除 s。s 沒有左孩子，所以只剩「最多一個孩子」的情況。',
        '最多一個孩子時：child 是那個孩子（或空），讓 parent 原本指向 cur 的那一邊改指向 child；parent 是空時改 root。',
        '中序走訪可以用 D13 的堆疊迭代寫法，避免長鏈造成的深遞迴。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

struct Node { int key; Node* left; Node* right; };

Node* root = nullptr;

bool find(int x) {
    Node* cur = root;
    while (cur != nullptr && cur->key != x) cur = x < cur->key ? cur->left : cur->right;
    return cur != nullptr;
}

bool insert(int x) {
    Node* parent = nullptr;
    Node* cur = root;
    while (cur != nullptr) {
        if (x == cur->key) return false;  // 已存在
        parent = cur;
        cur = x < cur->key ? cur->left : cur->right;
    }
    Node* node = new Node{x, nullptr, nullptr};
    if (parent == nullptr) root = node;
    else if (x < parent->key) parent->left = node;
    else parent->right = node;
    return true;
}

bool erase(int x) {
    Node* parent = nullptr;
    Node* cur = root;
    while (cur != nullptr && cur->key != x) {
        parent = cur;
        cur = x < cur->key ? cur->left : cur->right;
    }
    if (cur == nullptr) return false;  // 不存在
    if (cur->left != nullptr && cur->right != nullptr) {
        // 兩個孩子：找右子樹的最小值（後繼），搬它的鍵過來，改成刪除後繼
        Node* sp = cur;
        Node* s = cur->right;
        while (s->left != nullptr) {
            sp = s;
            s = s->left;
        }
        cur->key = s->key;
        parent = sp;
        cur = s;
    }
    // 現在 cur 最多只有一個孩子：讓孩子接到 cur 的位置
    Node* child = cur->left != nullptr ? cur->left : cur->right;
    if (parent == nullptr) root = child;
    else if (parent->left == cur) parent->left = child;
    else parent->right = child;
    delete cur;
    return true;
}

std::string inorder() {  // 用堆疊迭代：左、根、右
    std::vector<Node*> stack;
    Node* cur = root;
    std::string out;
    while (cur != nullptr || !stack.empty()) {
        while (cur != nullptr) {
            stack.push_back(cur);
            cur = cur->left;
        }
        cur = stack.back();
        stack.pop_back();
        if (!out.empty()) out += ' ';
        out += std::to_string(cur->key);
        cur = cur->right;
    }
    return out.empty() ? "empty" : out;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int q;
    std::cin >> q;
    for (int i = 0; i < q; ++i) {
        std::string cmd;
        std::cin >> cmd;
        if (cmd == "inorder") {
            std::cout << inorder() << "\n";
            continue;
        }
        int x;
        std::cin >> x;
        if (cmd == "insert") {
            if (!insert(x)) std::cout << "Duplicate\n";
        } else if (cmd == "find") {
            std::cout << (find(x) ? "yes" : "no") << "\n";
        } else if (!erase(x)) {
            std::cout << "Not found\n";
        }
    }
    while (root != nullptr) erase(root->key);  // 釋放所有節點
    return 0;
}`,
        Python: code`import sys


class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


class BST:
    def __init__(self):
        self.root = None

    def find(self, x):
        cur = self.root
        while cur is not None and cur.key != x:
            cur = cur.left if x < cur.key else cur.right
        return cur is not None

    def insert(self, x):
        parent, cur = None, self.root
        while cur is not None:
            if x == cur.key:
                return False  # 已存在
            parent, cur = cur, (cur.left if x < cur.key else cur.right)
        node = Node(x)
        if parent is None:
            self.root = node
        elif x < parent.key:
            parent.left = node
        else:
            parent.right = node
        return True

    def delete(self, x):
        parent, cur = None, self.root
        while cur is not None and cur.key != x:
            parent, cur = cur, (cur.left if x < cur.key else cur.right)
        if cur is None:
            return False  # 不存在
        if cur.left is not None and cur.right is not None:
            # 兩個孩子：找右子樹的最小值（後繼），搬它的鍵過來，改成刪除後繼
            sp, s = cur, cur.right
            while s.left is not None:
                sp, s = s, s.left
            cur.key = s.key
            parent, cur = sp, s
        # 現在 cur 最多只有一個孩子：讓孩子接到 cur 的位置
        child = cur.left if cur.left is not None else cur.right
        if parent is None:
            self.root = child
        elif parent.left is cur:
            parent.left = child
        else:
            parent.right = child
        return True

    def inorder(self):  # 用堆疊迭代：左、根、右
        out, stack, cur = [], [], self.root
        while cur is not None or stack:
            while cur is not None:
                stack.append(cur)
                cur = cur.left
            cur = stack.pop()
            out.append(cur.key)
            cur = cur.right
        return out


def main():
    data = sys.stdin.read().split()
    q = int(data[0])
    pos = 1
    tree = BST()
    out = []
    for _ in range(q):
        cmd = data[pos]
        pos += 1
        if cmd == "inorder":
            keys = tree.inorder()
            out.append(" ".join(map(str, keys)) if keys else "empty")
            continue
        x = int(data[pos])
        pos += 1
        if cmd == "insert":
            if not tree.insert(x):
                out.append("Duplicate")
        elif cmd == "find":
            out.append("yes" if tree.find(x) else "no")
        elif not tree.delete(x):
            out.append("Not found")
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.StringTokenizer;

public class Main {
    static class Node {
        int key;
        Node left, right;
        Node(int key) { this.key = key; }
    }

    static Node root = null;

    static boolean find(int x) {
        Node cur = root;
        while (cur != null && cur.key != x) cur = x < cur.key ? cur.left : cur.right;
        return cur != null;
    }

    static boolean insert(int x) {
        Node parent = null, cur = root;
        while (cur != null) {
            if (x == cur.key) return false;  // 已存在
            parent = cur;
            cur = x < cur.key ? cur.left : cur.right;
        }
        Node node = new Node(x);
        if (parent == null) root = node;
        else if (x < parent.key) parent.left = node;
        else parent.right = node;
        return true;
    }

    static boolean delete(int x) {
        Node parent = null, cur = root;
        while (cur != null && cur.key != x) {
            parent = cur;
            cur = x < cur.key ? cur.left : cur.right;
        }
        if (cur == null) return false;  // 不存在
        if (cur.left != null && cur.right != null) {
            // 兩個孩子：找右子樹的最小值（後繼），搬它的鍵過來，改成刪除後繼
            Node sp = cur, s = cur.right;
            while (s.left != null) {
                sp = s;
                s = s.left;
            }
            cur.key = s.key;
            parent = sp;
            cur = s;
        }
        // 現在 cur 最多只有一個孩子：讓孩子接到 cur 的位置
        Node child = cur.left != null ? cur.left : cur.right;
        if (parent == null) root = child;
        else if (parent.left == cur) parent.left = child;
        else parent.right = child;
        return true;
    }

    static String inorder() {  // 用堆疊迭代：左、根、右
        StringBuilder sb = new StringBuilder();
        Deque<Node> stack = new ArrayDeque<>();
        Node cur = root;
        while (cur != null || !stack.isEmpty()) {
            while (cur != null) {
                stack.push(cur);
                cur = cur.left;
            }
            cur = stack.pop();
            if (sb.length() > 0) sb.append(' ');
            sb.append(cur.key);
            cur = cur.right;
        }
        return sb.length() == 0 ? "empty" : sb.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder all = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) all.append(line).append(' ');
        StringTokenizer st = new StringTokenizer(all.toString());
        int q = Integer.parseInt(st.nextToken());
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < q; i++) {
            String cmd = st.nextToken();
            if (cmd.equals("inorder")) {
                out.append(inorder()).append('\n');
                continue;
            }
            int x = Integer.parseInt(st.nextToken());
            if (cmd.equals("insert")) {
                if (!insert(x)) out.append("Duplicate\n");
            } else if (cmd.equals("find")) {
                out.append(find(x) ? "yes\n" : "no\n");
            } else if (!delete(x)) {
                out.append("Not found\n");
            }
        }
        System.out.print(out);
    }
}`,
        JavaScript: code`class Node {
    constructor(key) {
        this.key = key;
        this.left = null;
        this.right = null;
    }
}

let root = null;

function find(x) {
    let cur = root;
    while (cur !== null && cur.key !== x) cur = x < cur.key ? cur.left : cur.right;
    return cur !== null;
}

function insert(x) {
    let parent = null, cur = root;
    while (cur !== null) {
        if (x === cur.key) return false;  // 已存在
        parent = cur;
        cur = x < cur.key ? cur.left : cur.right;
    }
    const node = new Node(x);
    if (parent === null) root = node;
    else if (x < parent.key) parent.left = node;
    else parent.right = node;
    return true;
}

function remove(x) {
    let parent = null, cur = root;
    while (cur !== null && cur.key !== x) {
        parent = cur;
        cur = x < cur.key ? cur.left : cur.right;
    }
    if (cur === null) return false;  // 不存在
    if (cur.left !== null && cur.right !== null) {
        // 兩個孩子：找右子樹的最小值（後繼），搬它的鍵過來，改成刪除後繼
        let sp = cur, s = cur.right;
        while (s.left !== null) {
            sp = s;
            s = s.left;
        }
        cur.key = s.key;
        parent = sp;
        cur = s;
    }
    // 現在 cur 最多只有一個孩子：讓孩子接到 cur 的位置
    const child = cur.left !== null ? cur.left : cur.right;
    if (parent === null) root = child;
    else if (parent.left === cur) parent.left = child;
    else parent.right = child;
    return true;
}

function inorder() {  // 用堆疊迭代：左、根、右
    const keys = [], stack = [];
    let cur = root;
    while (cur !== null || stack.length > 0) {
        while (cur !== null) {
            stack.push(cur);
            cur = cur.left;
        }
        cur = stack.pop();
        keys.push(cur.key);
        cur = cur.right;
    }
    return keys.length === 0 ? "empty" : keys.join(" ");
}

const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/);
const q = Number(data[0]);
let pos = 1;
const out = [];
for (let i = 0; i < q; i++) {
    const cmd = data[pos++];
    if (cmd === "inorder") {
        out.push(inorder());
        continue;
    }
    const x = Number(data[pos++]);
    if (cmd === "insert") {
        if (!insert(x)) out.push("Duplicate");
    } else if (cmd === "find") {
        out.push(find(x) ? "yes" : "no");
    } else if (!remove(x)) {  // delete 是 JavaScript 的保留字，函式改叫 remove
        out.push("Not found");
    }
}
console.log(out.join("\n"));`,
      },
      judge: 'none',
    },
  ],
};

import type { LessonContent, Mark, TraceStep } from '../schema';
import { binaryTree } from '../simulate';

const code = String.raw;

/*
 * The trace tree A(B(D, E), C(F, -)): binaryTree gives ids in preorder, n0 = A, n1 = B, n2 = D, n3 = E, n4 = C, n5 = F.
 * It is a complete binary tree, so the last step also shows it as the array A B C D E F.
 */
const { nodes, root } = binaryTree(['A', ['B', ['D'], ['E']], ['C', ['F'], null]]);
const id = { A: 'n0', B: 'n1', D: 'n2', E: 'n3', C: 'n4', F: 'n5' } as const;
type Label = keyof typeof id;
/** One call of height(): the node it was called on ('None' for an empty subtree), partial results and its return value. */
const call = (node: Label | 'None', parts: Record<string, string> = {}, returns?: string) =>
  ({ name: `height(${node})`, vars: { node: node === 'None' ? 'None' : `Node("${node}")`, ...parts }, ...(returns !== undefined ? { returns } : {}) });
/** A step: the node whose call is running is current, nodes whose height is already known are visited. */
const at = (line: number, note: string, current: Label | null, visited: Label[], frames: TraceStep['frames'], extra: Partial<TraceStep> = {}): TraceStep => ({
  line, note, vars: { root: 'Node("A")' }, ...(frames?.length ? { frames } : {}),
  tree: { name: 'root', nodes, roots: [root], marks: [
    ...visited.map(l => ({ id: id[l], kind: 'visited' as Mark })),
    ...(current ? [{ id: id[current], kind: 'current' as Mark }] : []),
  ] },
  ...extra,
});
const L = 'height(left)', R = 'height(right)';

/** Exercise test: a left chain of n nodes (node i's left child is i + 1). */
const leftChain = (n: number) => `${n}\n` + Array.from({ length: n }, (_, i) => `${i + 1} ${i + 1 < n ? i + 1 : -1} -1`).join('\n');
/** Exercise test: a perfect tree of n = 2^(h+1) - 1 nodes stored like a heap (children 2i+1 and 2i+2). */
const perfect = (n: number) => `${n}\n` + Array.from({ length: n }, (_, i) => `${i * 10} ${2 * i + 1 < n ? 2 * i + 1 : -1} ${2 * i + 2 < n ? 2 * i + 2 : -1}`).join('\n');

/** D12 Binary Tree. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const D12: LessonContent = {
  lessonId: 'D12',
  motivation: '二元樹（binary tree）是最常被拿來當「零件」的樹：C++ 的 `std::map`、Java 的 `TreeMap` 底層是平衡的二元搜尋樹，優先佇列底層是用陣列存的完全二元樹（堆積），編譯器把 `3 + 4 * 2` 拆成運算式樹，壓縮檔用的霍夫曼編碼（Huffman coding）也是一棵二元樹。限制每個節點最多兩個孩子，程式就能用固定的 `left`、`right` 兩個欄位描述，很多問題也能自然地拆成「處理左子樹、處理右子樹」兩半的遞迴。但二元樹本身沒有規定值的大小順序，找一個值仍要整棵看過一遍，是 O(n)；形狀不好（例如退化成一條鏈）時，高度會接近 n，遞迴也會變得很深。本課學節點結構、陣列表示法、幾種特殊形狀與高度和節點數的關係，下一課 D13 再談各種走訪順序，D14 的二元搜尋樹與 D15 的堆積都建立在這一課上。',
  sections: [
    {
      id: 'definition', title: '每個節點最多兩個孩子',
      blocks: [
        { type: 'p', text: 'D11 的一般樹（general tree）中，一個節點可以有任意多個孩子。二元樹多了一條限制：每個節點最多有兩個孩子，而且這兩個位置有名字，分別叫左孩子（left child）與右孩子（right child）。以左孩子為根的整棵子樹稱為左子樹（left subtree），右邊同理。根（root）、葉節點（leaf，沒有孩子的節點）、深度（depth）與高度（height）的意思都和 D11 相同：只有一個節點的樹高度是 0。' },
        { type: 'p', text: '「左」與「右」是不同的位置，不只是排列順序。只有兩個節點時，一般樹只有一種形狀（根帶一個孩子），二元樹卻有兩種：孩子在左邊，或孩子在右邊；它們是不同的二元樹。三個節點的二元樹共有 5 種不同的形狀。所以描述一棵二元樹時，只有一個孩子的節點一定要說清楚它在哪一邊。' },
        { type: 'p', text: '二元樹也可以用遞迴來定義：一棵二元樹要不是空的（沒有任何節點），就是由一個根節點、一棵左子樹、一棵右子樹組成，而左右子樹本身又是二元樹。這個定義直接對應到程式：處理一棵樹，就是處理根，再把同樣的函式用在左子樹和右子樹上；遇到空樹就停。' },
        { type: 'list', items: [
          '每個節點有 0、1 或 2 個孩子；有 2 個孩子時，一個在左、一個在右。',
          '第 k 層（根是第 0 層）最多有 2^k 個節點，因為每往下一層，節點數最多變成兩倍。',
          'n 個節點的二元樹有 n − 1 條邊（除了根，每個節點都恰好有一個父節點），而 2n 個孩子欄位中有 n + 1 個是空的。',
        ] },
      ],
    },
    {
      id: 'nodes', title: '節點結構與遞迴計算',
      blocks: [
        { type: 'p', text: '程式中的二元樹節點存三樣東西：資料 `value`、指向左孩子的 `left`、指向右孩子的 `right`。沒有孩子的那一邊放「空」。整棵樹只要記住根節點；空樹就是根本身為空。' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java'], rows: [
          ['節點的定義', '`struct Node { int value; Node* left = nullptr; Node* right = nullptr; };`', '`class Node:` 在 `__init__` 設定 `self.value`、`self.left`、`self.right`', '`static class Node { int value; Node left, right; }`'],
          ['「空」怎麼寫', '`nullptr`', '`None`', '`null`'],
          ['建立節點', '`new Node{4}`、`new Node{2, a, b}`（回傳指標）', '`Node(4)`、`Node(2, a, b)`', '`new Node(4)`、`new Node(2, a, b)`'],
          ['讀左孩子', '`node->left`', '`node.left`', '`node.left`'],
          ['釋放節點', '自己 `delete`，或改用 `std::unique_ptr<Node>`', '沒有人參考時自動回收', '沒有人參考時由垃圾回收（GC）處理'],
        ] },
        { type: 'p', text: '有了遞迴定義，很多計算都寫成同一個模式：先處理空樹這個基本情況（base case），再用左右子樹的答案組出整棵樹的答案。節點數 `count(node)`：空樹是 0，否則是 1 + 左子樹節點數 + 右子樹節點數。高度 `height(node)`：本課規定空樹的高度是 −1，非空樹的高度是 1 + max(左子樹高度, 右子樹高度)。這樣葉節點的高度是 1 + max(−1, −1) = 0，正好和 D11「只有一個節點的樹高度是 0」一致；若把空樹定成 0，葉節點就會變成 1，算出來的每個高度都多 1。葉節點數 `leaves(node)`：空樹是 0，兩個孩子都是空的節點是 1，否則是左右子樹葉節點數相加。' },
        { type: 'example', id: 'build-measure' },
        { type: 'p', text: '這三個函式都讓每個節點恰好被呼叫一次（再加上 n + 1 次對空孩子的呼叫），所以時間是 O(n)；遞迴同時要佔用的呼叫堆疊層數等於樹的高度加一，額外空間是 O(h)。這種「先往左走到底、再回頭往右」的遞迴就是一種走訪（traversal），前序、中序、後序與層序的差別留到 D13。下方的視覺化逐步追蹤 `height` 在一棵 6 個節點的樹上如何一層層回傳答案。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：空孩子、記憶體與參考', text: '第一，忘了先檢查空樹就讀 `node.left`：C++ 對 `nullptr` 取 `->left` 是未定義行為（undefined behavior），通常當掉；Python 丟出 `AttributeError: \'NoneType\' object has no attribute \'left\'`；Java 丟出 `NullPointerException`。每個遞迴函式的第一行都應該處理空樹。第二，C++ 用 `new` 建立的節點要自己釋放：先釋放左右子樹、最後才 `delete` 自己，否則先刪掉節點就找不到它的孩子；也可以把 `left`、`right` 宣告成 `std::unique_ptr<Node>`，根被釋放時整棵樹自動釋放。第三，Python 與 Java 的變數存的是參考：把節點傳進函式，函式裡的 `node.left = None` 會改到呼叫者的那棵樹；但函式裡的 `node = Node(9)` 只是讓區域變數指向新節點，呼叫者手上的根不會變。C++ 傳 `Node*` 也是複製一份指標，要改呼叫者的指標本身得傳 `Node*&`。' },
        { type: 'p', text: '遞迴的深度等於樹高，形狀很斜的樹會很深：Python 預設的遞迴上限是 1000 層，超過就丟出 `RecursionError`；C++ 與 Java 的呼叫堆疊也有上限，深到數萬、數十萬層時可能溢位（stack overflow）。節點很多又不保證平衡時，改用自己管理的堆疊或佇列，像本課練習題的寫法。' },
      ],
    },
    {
      id: 'shapes', title: '滿、完美與完全二元樹',
      blocks: [
        { type: 'p', text: '有三種特殊形狀的名稱很常出現，但不同教科書的用詞並不一致，讀題目時要看它的定義。本課採用以下說法：' },
        { type: 'table', head: ['名稱', '定義', '例子（以層序列出，`-` 表示空位）'], rows: [
          ['滿二元樹（full binary tree）', '每個節點都有 0 個或 2 個孩子，沒有只有一個孩子的節點', 'A 的孩子 B、C；C 的孩子 F、G；B 是葉節點'],
          ['完美二元樹（perfect binary tree）', '所有內部節點都有 2 個孩子，且所有葉節點都在同一層', 'A B C D E F G（高度 2，每一層都排滿）'],
          ['完全二元樹（complete binary tree）', '除了最後一層，每一層都排滿；最後一層的節點從左邊開始連續排列', 'A B C D E F（最後一層 D E F 靠左，右邊缺 G）'],
        ] },
        { type: 'p', text: '完美二元樹同時是滿的也是完全的，但反過來不一定：A B C D E F 是完全的，卻不是滿的（C 只有左孩子 F）；「A 的孩子 B、C，只有 C 有孩子 F、G」是滿的，卻不是完全的（B 下面的位置空著，右邊的 F、G 卻有節點）。把樹依層序排成一列、空位寫 `null`，完全二元樹的判斷規則就是：第一個 `null` 之後不能再出現任何節點。' },
        { type: 'example', id: 'shape-check' },
        { type: 'p', text: '高度與節點數的關係：高度 h 的完美二元樹第 k 層有 2^k 個節點，全部加起來是 1 + 2 + 4 + … + 2^h = 2^(h+1) − 1 個，其中葉節點有 2^h 個。例如高度 2 有 7 個節點、高度 3 有 15 個。任何高度 h 的二元樹最多就是這麼多節點，因此 n 個節點的二元樹高度至少是 ⌊log2 n⌋（完全二元樹正好達到這個最小值）；最多則是 n − 1，也就是每個節點只有一個孩子、整棵樹退化成一條鏈。100 個節點的二元樹，高度可能小到 6，也可能大到 99；D14 的二元搜尋樹快不快，就取決於高度落在哪一端。' },
        { type: 'table', head: ['高度 h', '完美二元樹的節點數 2^(h+1) − 1', '葉節點數 2^h'], rows: [
          ['0', '1', '1'],
          ['1', '3', '2'],
          ['2', '7', '4'],
          ['3', '15', '8'],
          ['10', '2047', '1024'],
        ] },
      ],
    },
    {
      id: 'array-form', title: '用陣列存完全二元樹',
      blocks: [
        { type: 'p', text: '完全二元樹的節點依層序（由上到下、每層由左到右）編號 0、1、2、…，剛好能放進陣列的連續格子，完全不需要指標。採用從 0 開始的索引（0-based）時，索引 i 的節點：' },
        { type: 'list', items: [
          '左孩子在 `2i + 1`，右孩子在 `2i + 2`；算出的索引 ≥ n 就表示那個孩子不存在。',
          '父節點在 `(i − 1) / 2`（整數除法，向下取整）；根（i = 0）沒有父節點。',
          '若改成從 1 開始編號（1-based，索引 0 空著不用），公式變成左孩子 `2i`、右孩子 `2i + 1`、父節點 `i / 2`，比較好記，有些教科書與題目採用這種寫法。',
        ] },
        { type: 'example', id: 'array-index' },
        { type: 'p', text: '根的父節點要另外處理：C++ 與 Java 的整數除法向 0 截斷，(0 − 1) / 2 得到 0，會誤以為根是自己的父節點；Python 的 `//` 向下取整，(0 − 1) // 2 得到 −1，拿去當索引又會變成「最後一個元素」。所以程式都先判斷 `i > 0`。' },
        { type: 'p', text: '陣列表示法只適合完全（或接近完全）的樹。不完全的樹也能存，但空位必須留著，否則孩子的位置會算錯。最糟的是一條往右延伸的鏈：深度 k 的節點落在索引 2^(k+1) − 2，n 個節點就需要 2^n − 1 格，20 個節點要超過一百萬格，幾乎全是空的。這種稀疏的樹應該用節點加指標。反過來，完全二元樹存成陣列既省下所有指標、又能用 O(1) 的算術找到父節點，D15 的堆積（heap）就是這樣存的：C++ 的 `std::priority_queue`、Python 的 `heapq`、Java 的 `PriorityQueue` 底層都是陣列。' },
      ],
    },
    {
      id: 'compare', title: '比較：二元樹、一般樹與陣列',
      blocks: [
        { type: 'table', head: ['', '二元樹（節點＋左右指標）', '一般樹（孩子串列）', '陣列表示的完全二元樹', '一般陣列'], rows: [
          ['每個節點的孩子', '最多 2 個，固定的 `left`、`right`', '任意個，存在 `children` 串列中', '最多 2 個，由索引算出', '沒有階層，只有前後順序'],
          ['找孩子', 'O(1)', '第 k 個孩子 O(1)', 'O(1)：`2i + 1`、`2i + 2`', '不適用'],
          ['找父節點', 'O(n)，除非每個節點再存 `parent` 指標', 'O(n)，除非另存 `parent`', 'O(1)：`(i − 1) / 2`', '不適用'],
          ['額外空間', '每個節點 2 個指標', '每個節點一個串列', '完全樹不需額外空間；稀疏樹會留下大量空格', '無'],
          ['適合', '任何形狀、會插入刪除節點的樹，例如 D14 的二元搜尋樹', '資料夾、組織圖等孩子數不固定的階層（D11）', '堆積與優先佇列（D15）', '只需要順序與索引的資料'],
        ] },
        { type: 'table', head: ['操作（n 個節點、高度 h）', '時間', '說明'], rows: [
          ['讀左右孩子', 'O(1)', '節點表示讀欄位，陣列表示算索引'],
          ['在已知節點下接上新孩子', 'O(1)', '把空的 `left` 或 `right` 改成新節點'],
          ['搜尋某個值', 'O(n)', '一般二元樹沒有大小順序，最壞要看完每個節點；D14 的 BST 才能沿一條路徑找'],
          ['count、height、leaves', 'O(n) 時間，O(h) 額外空間', '每個節點處理一次；遞迴的呼叫堆疊深度是 h + 1'],
          ['陣列表示中找父節點', 'O(1)', '只有指標的節點表示要從根找起，O(n)'],
        ] },
        { type: 'p', text: '三種語言都沒有叫做「binary tree」的通用容器，題目中的樹通常要自己寫節點類別或用陣列存。標準函式庫裡的二元樹都藏在別的介面後面：C++ 的 `std::set`／`std::map` 與 Java 的 `TreeSet`／`TreeMap` 是平衡的二元搜尋樹（常見實作是紅黑樹，Java 文件明確寫出 `TreeMap` 是紅黑樹），保證高度約為 log n；Python 沒有內建的樹狀容器，`heapq` 則是把一般的 `list` 當成陣列表示的完全二元樹來操作。' },
      ],
    },
  ],
  examples: [
    {
      id: 'build-measure', title: '建立二元樹並計算節點數、高度與葉節點數',
      description: '1 的孩子是 2、3；2 的孩子是 4、5；3 只有右孩子 6。三個遞迴函式都先處理空樹：count 與 leaves 的空樹是 0，height 的空樹是 −1。C++ 版本最後用後序的 destroy 釋放所有節點。',
      output: 'count: 6\nheight: 2\nleaves: 3\nempty height: -1',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>

struct Node {
    int value;
    Node* left = nullptr;
    Node* right = nullptr;
};

int count(const Node* node) {
    if (node == nullptr) return 0;
    return 1 + count(node->left) + count(node->right);
}

int height(const Node* node) {
    if (node == nullptr) return -1;  // 空樹 -1，葉節點才會是 0
    return 1 + std::max(height(node->left), height(node->right));
}

int leaves(const Node* node) {
    if (node == nullptr) return 0;
    if (node->left == nullptr && node->right == nullptr) return 1;
    return leaves(node->left) + leaves(node->right);
}

void destroy(Node* node) {  // 先釋放孩子，最後才釋放自己
    if (node == nullptr) return;
    destroy(node->left);
    destroy(node->right);
    delete node;
}

int main() {
    Node* root = new Node{1, new Node{2, new Node{4}, new Node{5}}, new Node{3, nullptr, new Node{6}}};
    std::cout << "count: " << count(root) << "\n";
    std::cout << "height: " << height(root) << "\n";
    std::cout << "leaves: " << leaves(root) << "\n";
    std::cout << "empty height: " << height(nullptr) << "\n";
    destroy(root);
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, value, left=None, right=None):
        self.value = value
        self.left = left
        self.right = right


def count(node):
    if node is None:
        return 0
    return 1 + count(node.left) + count(node.right)


def height(node):
    if node is None:
        return -1  # 空樹 -1，葉節點才會是 0
    return 1 + max(height(node.left), height(node.right))


def leaves(node):
    if node is None:
        return 0
    if node.left is None and node.right is None:
        return 1
    return leaves(node.left) + leaves(node.right)


root = Node(1, Node(2, Node(4), Node(5)), Node(3, None, Node(6)))
print("count:", count(root))
print("height:", height(root))
print("leaves:", leaves(root))
print("empty height:", height(None))`,
        Java: code`public class Main {
    static class Node {
        int value;
        Node left, right;

        Node(int value, Node left, Node right) {
            this.value = value;
            this.left = left;
            this.right = right;
        }

        Node(int value) {
            this(value, null, null);
        }
    }

    static int count(Node node) {
        if (node == null) return 0;
        return 1 + count(node.left) + count(node.right);
    }

    static int height(Node node) {
        if (node == null) return -1;  // 空樹 -1，葉節點才會是 0
        return 1 + Math.max(height(node.left), height(node.right));
    }

    static int leaves(Node node) {
        if (node == null) return 0;
        if (node.left == null && node.right == null) return 1;
        return leaves(node.left) + leaves(node.right);
    }

    public static void main(String[] args) {
        Node root = new Node(1, new Node(2, new Node(4), new Node(5)), new Node(3, null, new Node(6)));
        System.out.println("count: " + count(root));
        System.out.println("height: " + height(root));
        System.out.println("leaves: " + leaves(root));
        System.out.println("empty height: " + height(null));
    }
}`,
      },
    },
    {
      id: 'shape-check', title: '判斷完全二元樹與滿二元樹',
      description: '每棵樹以層序排成一列，`null` 表示空位（索引 i 的孩子在 2i+1、2i+2，超出長度也算空位）。假設輸入合法：空位底下不會有節點。完全：第一個空位之後沒有節點；滿：每個節點的兩個孩子要嘛都在、要嘛都不在。',
      output: 'A B C D E F -> complete: yes full: no\nA B C D E -> complete: yes full: yes\nA B C null null F G -> complete: no full: yes\nA B C D null F -> complete: no full: no\nA B -> complete: yes full: no',
      code: {
        'C++': code`#include <iostream>
#include <sstream>
#include <string>
#include <vector>

void check(const std::string& s) {
    std::istringstream in(s);
    std::vector<bool> has;
    std::string t;
    while (in >> t) has.push_back(t != "null");
    const int n = static_cast<int>(has.size());
    auto exists = [&](int i) { return i < n && has[i]; };
    bool gap = false, complete = true, full = true;
    for (int i = 0; i < n; i++) {
        if (!has[i]) {
            gap = true;
            continue;
        }
        if (gap) complete = false;  // 空位之後又出現節點
        if (exists(2 * i + 1) != exists(2 * i + 2)) full = false;  // 只有一個孩子
    }
    std::cout << s << " -> complete: " << (complete ? "yes" : "no") << " full: " << (full ? "yes" : "no") << "\n";
}

int main() {
    for (const char* s : {"A B C D E F", "A B C D E", "A B C null null F G", "A B C D null F", "A B"}) check(s);
    return 0;
}`,
        Python: code`def check(tokens):
    n = len(tokens)
    has = [t != "null" for t in tokens]

    def exists(i):
        return i < n and has[i]

    gap = False
    complete = True
    full = True
    for i in range(n):
        if not has[i]:
            gap = True
            continue
        if gap:
            complete = False  # 空位之後又出現節點
        if exists(2 * i + 1) != exists(2 * i + 2):
            full = False  # 只有一個孩子
    return complete, full


for s in ["A B C D E F", "A B C D E", "A B C null null F G", "A B C D null F", "A B"]:
    complete, full = check(s.split())
    print(s, "-> complete:", "yes" if complete else "no", "full:", "yes" if full else "no")`,
        Java: code`public class Main {
    static void check(String s) {
        String[] t = s.split(" ");
        int n = t.length;
        boolean[] has = new boolean[n];
        for (int i = 0; i < n; i++) has[i] = !t[i].equals("null");
        boolean gap = false, complete = true, full = true;
        for (int i = 0; i < n; i++) {
            if (!has[i]) {
                gap = true;
                continue;
            }
            if (gap) complete = false;  // 空位之後又出現節點
            boolean left = 2 * i + 1 < n && has[2 * i + 1];
            boolean right = 2 * i + 2 < n && has[2 * i + 2];
            if (left != right) full = false;  // 只有一個孩子
        }
        System.out.println(s + " -> complete: " + (complete ? "yes" : "no") + " full: " + (full ? "yes" : "no"));
    }

    public static void main(String[] args) {
        for (String s : new String[] {"A B C D E F", "A B C D E", "A B C null null F G", "A B C D null F", "A B"}) check(s);
    }
}`,
      },
    },
    {
      id: 'array-index', title: '陣列表示法：每個索引的父節點與孩子',
      description: '完全二元樹 A B C D E F 依層序存在陣列（字串）中，用 0-based 公式印出每個索引的父節點與左右孩子；不存在的寫 `-`。',
      output: '0 A parent=- left=B right=C\n1 B parent=A left=D right=E\n2 C parent=A left=F right=-\n3 D parent=B left=- right=-\n4 E parent=B left=- right=-\n5 F parent=C left=- right=-',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    const std::string tree = "ABCDEF";
    const int n = static_cast<int>(tree.size());
    auto at = [&](int i) { return i < n ? tree[i] : '-'; };
    for (int i = 0; i < n; i++) {
        char parent = i > 0 ? tree[(i - 1) / 2] : '-';  // 根沒有父節點
        std::cout << i << " " << tree[i] << " parent=" << parent
                  << " left=" << at(2 * i + 1) << " right=" << at(2 * i + 2) << "\n";
    }
    return 0;
}`,
        Python: code`tree = ["A", "B", "C", "D", "E", "F"]
n = len(tree)


def at(i):
    return tree[i] if i < n else "-"


for i in range(n):
    parent = tree[(i - 1) // 2] if i > 0 else "-"  # 根沒有父節點
    print(i, tree[i], "parent=" + parent, "left=" + at(2 * i + 1), "right=" + at(2 * i + 2))`,
        Java: code`public class Main {
    static final String TREE = "ABCDEF";

    static char at(int i) {
        return i < TREE.length() ? TREE.charAt(i) : '-';
    }

    public static void main(String[] args) {
        for (int i = 0; i < TREE.length(); i++) {
            char parent = i > 0 ? TREE.charAt((i - 1) / 2) : '-';  // 根沒有父節點
            System.out.println(i + " " + TREE.charAt(i) + " parent=" + parent
                    + " left=" + at(2 * i + 1) + " right=" + at(2 * i + 2));
        }
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'tree-traversal', title: '遞迴計算高度：空樹回傳 −1，每層加一', language: 'Python',
    code: code`class Node:
    def __init__(self, v, left=None, right=None):
        self.v, self.left, self.right = v, left, right

def height(node):
    if node is None:
        return -1
    return 1 + max(height(node.left), height(node.right))

root = Node("A", Node("B", Node("D"), Node("E")), Node("C", Node("F")))
print(height(root))`,
    steps: [
      at(10, '建立 6 個節點，root 指向 A。B 有兩個孩子 D、E；C 只有左孩子 F，右孩子是 None。接著呼叫 `height(root)`。', null, [], []),
      at(6, '呼叫 `height(A)`：node 不是 None，不走基本情況，到第 8 行先算左子樹 `height(node.left)`。', 'A', [], [call('A')]),
      at(6, '`height(A)` 暫停在第 8 行，呼叫 `height(B)`。B 也不是 None，同樣先往左。呼叫堆疊多了一層。', 'B', [], [call('A'), call('B')]),
      at(6, '`height(B)` 呼叫 `height(D)`。D 是葉節點，但它本身不是 None，所以還要對它的兩個空孩子各呼叫一次。', 'D', [], [call('A'), call('B'), call('D')]),
      at(7, 'D 沒有左孩子：`height(None)` 命中基本情況，直接回傳 −1，不會再讀 `.left`。', 'D', [], [call('A'), call('B'), call('D'), call('None', {}, '-1')]),
      at(7, 'D 的右孩子也是 None，同樣回傳 −1。', 'D', [], [call('A'), call('B'), call('D', { [L]: '-1' }), call('None', {}, '-1')]),
      at(8, '`height(D)` = 1 + max(−1, −1) = 0。只有一個節點的樹高度是 0，和 D11 的定義一致；這正是把空樹定成 −1 的原因。', 'D', [], [call('A'), call('B'), call('D', { [L]: '-1', [R]: '-1' }, '0')]),
      at(8, '回到 `height(B)`，左邊得到 0，接著呼叫 `height(E)`。E 也是葉節點：兩個 None 孩子各回傳 −1（過程和 D 相同，這裡合併成一步），所以回傳 0。', 'E', ['D'], [call('A'), call('B', { [L]: '0' }), call('E', { [L]: '-1', [R]: '-1' }, '0')]),
      at(8, '`height(B)` = 1 + max(0, 0) = 1。左子樹算完了，回到 `height(A)`。', 'B', ['D', 'E'], [call('A'), call('B', { [L]: '0', [R]: '0' }, '1')]),
      at(6, '`height(A)` 左邊得到 1，接著呼叫 `height(C)` 算右子樹。C 不是 None，先往左。', 'C', ['D', 'E', 'B'], [call('A', { [L]: '1' }), call('C')]),
      at(8, '`height(F)`：F 是葉節點，兩個 None 孩子各回傳 −1，所以回傳 1 + max(−1, −1) = 0。', 'F', ['D', 'E', 'B'], [call('A', { [L]: '1' }), call('C'), call('F', { [L]: '-1', [R]: '-1' }, '0')]),
      at(7, 'C 的右孩子是 None：`height(None)` 回傳 −1。如果少了第 6 行的檢查，這裡會對 None 讀 `.left`，丟出 `AttributeError`。', 'C', ['D', 'E', 'B', 'F'], [call('A', { [L]: '1' }), call('C', { [L]: '0' }), call('None', {}, '-1')]),
      at(8, '`height(C)` = 1 + max(0, −1) = 1：只有一邊有孩子時，max 選的是有孩子的那一邊。', 'C', ['D', 'E', 'B', 'F'], [call('A', { [L]: '1' }), call('C', { [L]: '0', [R]: '-1' }, '1')]),
      at(8, '`height(A)` = 1 + max(1, 1) = 2。每個節點恰好被呼叫一次，另外還有 7 次對 None 的呼叫（6 個節點共有 6 + 1 = 7 個空孩子），所以是 O(n)。', 'A', ['D', 'E', 'B', 'F', 'C'], [call('A', { [L]: '1', [R]: '1' }, '2')]),
      at(11, '輸出 2。這棵樹也是完全二元樹（最後一層 D、E、F 從左邊連續排起），所以能依層序存成陣列 A B C D E F：例如 B 在索引 1，它的孩子在 2·1+1 = 3（D）與 2·1+2 = 4（E）。', null, ['D', 'E', 'B', 'F', 'C', 'A'], [], {
        output: '2',
        arrays: [{ name: '同一棵樹的陣列表示', cells: ['A', 'B', 'C', 'D', 'E', 'F'], marks: [{ at: 1, kind: 'read' }, { at: 3, kind: 'found' }, { at: 4, kind: 'found' }] }],
      }),
    ],
  },
  quiz: [
    {
      id: 'q-index', prompt: '一棵完全二元樹用從 0 開始的陣列存放（索引 i 的孩子在 2i+1 與 2i+2）。索引 4 的節點，父節點與兩個孩子的索引分別是多少？',
      options: ['父節點 1，孩子 9 與 10', '父節點 2，孩子 8 與 9', '父節點 1，孩子 8 與 9', '父節點 2，孩子 9 與 10'],
      answer: 0, explanation: '0-based 時父節點是 (4 − 1) / 2 = 1（整數除法），孩子是 2·4 + 1 = 9 與 2·4 + 2 = 10。「父節點 2，孩子 8 與 9」是 1-based 的公式（i / 2、2i、2i + 1），用在 0-based 的陣列上會全部錯位；另外兩個選項各混用了一半的公式。',
    },
    {
      id: 'q-perfect', prompt: '高度為 3 的完美二元樹（只有一個節點的樹高度為 0）共有幾個節點？',
      options: ['7', '8', '15', '16'],
      answer: 2, explanation: '第 0～3 層分別有 1、2、4、8 個節點，共 2^(3+1) − 1 = 15 個。8 是最後一層的葉節點數 2^3；7 是高度 2 的完美二元樹；16 是 2^4，忘了減 1。',
    },
    {
      id: 'q-full-complete', prompt: '樹 X：A 的孩子是 B、C，B 只有左孩子 D，C 沒有孩子。樹 Y：A 的孩子是 B、C，C 的孩子是 F、G，B 沒有孩子。下列哪一個敘述正確？',
      options: ['X 是完全但不是滿；Y 是滿但不是完全', 'X 是滿也是完全；Y 兩者都不是', 'X 兩者都不是；Y 兩者都是', 'X 是滿但不是完全；Y 是完全但不是滿'],
      answer: 0, explanation: 'X 依層序是 A B C D：前兩層排滿，最後一層的 D 在最左邊，所以是完全二元樹；但 B 只有一個孩子，不是滿二元樹。Y 依層序是 A B C - - F G：每個節點都有 0 或 2 個孩子，是滿二元樹；但 B 底下的兩個位置空著、右邊的 F、G 卻有節點，最後一層不是從左邊連續排起，所以不是完全二元樹。這也說明「滿」和「完全」是兩個獨立的性質。',
    },
    {
      id: 'q-output', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: code`class Node:
    def __init__(self, v, left=None, right=None):
        self.v, self.left, self.right = v, left, right

def f(node):
    if node is None:
        return 0
    if node.left is None and node.right is None:
        return node.v
    return f(node.left) + f(node.right)

root = Node(1, Node(2, Node(4)), Node(3, None, Node(5)))
print(f(root))` },
      options: ['9', '15', '2', '12'],
      answer: 0, explanation: 'f 只在葉節點回傳自己的值，其他節點回傳左右子樹的和，所以結果是所有葉節點的值相加。葉節點只有 4（2 的左孩子）與 5（3 的右孩子），答案 4 + 5 = 9。15 是把所有節點都加起來；2 是葉節點的個數，不是值的和；12 把只有一個孩子的 3 也當成葉節點，但 3 還有右孩子 5，不是葉節點。',
    },
    {
      id: 'q-null', prompt: '下面的 Java 方法用來計算節點數。對一棵有 3 個節點的樹呼叫 `count(root)` 會怎樣？',
      code: { language: 'Java', text: code`static int count(Node node) {
    return 1 + count(node.left) + count(node.right);
}` },
      options: ['回傳 3', '丟出 NullPointerException：缺少 node == null 的基本情況', '編譯錯誤：遞迴方法必須有 if', '無窮遞迴，最後丟出 StackOverflowError'],
      answer: 1, explanation: '走到任何一個葉節點時，`count(node.left)` 會以 null 呼叫 count，接著讀 `null.left` 就丟出 NullPointerException。要在第一行加上 `if (node == null) return 0;`。它不是無窮遞迴：遞迴每次都往下一層，很快就碰到 null 而出錯，不會一直呼叫下去；Java 也不要求遞迴方法一定要有 if，所以能通過編譯。',
    },
    {
      id: 'q-height-range', prompt: '一棵二元樹有 100 個節點（只有一個節點的樹高度為 0），它的高度可能的範圍是？',
      options: ['6 到 99', '7 到 100', '6 到 100', '0 到 99'],
      answer: 0, explanation: '高度 h 的二元樹最多有 2^(h+1) − 1 個節點。高度 5 最多 63 個，放不下 100 個；高度 6 最多 127 個，放得下，所以最小高度是 ⌊log2 100⌋ = 6。最大高度是每層只放一個節點的鏈，100 個節點有 99 條邊，高度 99。「7 到 100」是把高度當成層數來算；高度 0 只能放 1 個節點。',
    },
  ],
  exercises: [
    {
      id: 'e-tree-stats', title: '二元樹的節點數、高度與葉節點數',
      statement: '給你一棵以「表格」描述的二元樹：共有 n 個節點，編號 0 到 n − 1，節點 0 是根。每個節點給出它的值、左孩子編號與右孩子編號，沒有孩子用 −1 表示。請輸出節點數、高度（只有一個節點的樹高度為 0）與葉節點數。n 可能大到 100,000，樹也可能退化成一條很長的鏈，所以請用自己的佇列或堆疊走訪，不要依賴深度可能達到 n 的遞迴。若輸入不是一棵合法的二元樹，輸出 `Invalid`。不合法的情況包括：某個孩子編號不是 −1 也不在 0～n − 1 之間；同一個節點被當成孩子超過一次（有兩個父節點，或同時是某節點的左孩子與右孩子）；節點 0 被當成某個節點的孩子；有節點無法從節點 0 走到。',
      inputFormat: '第一行是整數 n。接下來 n 行，第 i 行（i 從 0 開始）是三個整數 `value left right`：節點 i 的值、左孩子編號、右孩子編號。',
      outputFormat: '合法時輸出一行三個整數：節點數、高度、葉節點數，以空白分隔；否則輸出 `Invalid`。',
      constraints: ['1 ≤ n ≤ 100,000', '值與孩子編號都是絕對值不超過 10^9 的整數', '時間限制內應做到 O(n)'],
      samples: [{ kind: 'normal', input: '6\n1 1 2\n2 3 4\n3 -1 5\n4 -1 -1\n5 -1 -1\n6 -1 -1', output: '6 2 3', note: '本課範例的樹：1 的孩子 2、3；2 的孩子 4、5；3 只有右孩子 6' }],
      tests: [
        { kind: 'normal', input: '6\n1 1 2\n2 3 4\n3 -1 5\n4 -1 -1\n5 -1 -1\n6 -1 -1', output: '6 2 3', note: '和範例相同' },
        { kind: 'normal', input: '7\n50 3 5\n20 -1 -1\n70 6 -1\n30 1 4\n40 -1 -1\n60 2 -1\n80 -1 -1', output: '7 3 3', note: '編號不是依層序排列：0 → 5 → 2 → 6 是最深的路徑' },
        { kind: 'normal', input: '4\n-5 -1 1\n0 2 3\n7 -1 -1\n-8 -1 -1', output: '4 2 2', note: '根只有右孩子；值可以是負數，和代表「沒有孩子」的 −1 無關' },
        { kind: 'edge', input: '1\n42 -1 -1', output: '1 0 1', note: '只有一個節點：高度 0，它自己就是葉節點' },
        { kind: 'edge', input: leftChain(5), output: '5 4 1', note: '往左延伸的鏈：高度 n − 1，只有一個葉節點' },
        { kind: 'edge', input: perfect(15), output: '15 3 8', note: '高度 3 的完美二元樹：2^4 − 1 = 15 個節點、2^3 = 8 個葉節點' },
        { kind: 'edge', input: leftChain(2000), output: '2000 1999 1', note: '2000 個節點的鏈：深度超過 Python 預設的遞迴上限 1000，遞迴寫法會出錯' },
        { kind: 'error', input: '3\n1 1 3\n2 -1 -1\n3 -1 -1', output: 'Invalid', note: '孩子編號 3 超出 0～2 的範圍' },
        { kind: 'error', input: '2\n1 -2 -1\n2 -1 -1', output: 'Invalid', note: '−2 不是合法的孩子編號（只有 −1 表示沒有孩子）' },
        { kind: 'error', input: '3\n1 1 2\n2 2 -1\n3 -1 -1', output: 'Invalid', note: '節點 2 同時是節點 0 與節點 1 的孩子：有兩個父節點' },
        { kind: 'error', input: '2\n1 1 1\n2 -1 -1', output: 'Invalid', note: '節點 1 同時是左孩子也是右孩子' },
        { kind: 'error', input: '2\n1 1 -1\n2 0 -1', output: 'Invalid', note: '根 0 被當成節點 1 的孩子，形成環' },
        { kind: 'error', input: '3\n1 -1 -1\n2 2 -1\n3 1 -1', output: 'Invalid', note: '節點 1、2 互為孩子，從根走不到它們' },
      ],
      hints: [
        '先讀完所有節點，存成 left、right 兩個陣列，同時檢查每個孩子編號的範圍，並用 parents 陣列數每個節點被當成孩子幾次。',
        '每個節點最多一個父節點、根沒有父節點時，從根出發的走訪不會繞圈；用佇列做層序走訪，孩子的深度 = 父節點深度 + 1，高度就是最大的深度。',
        '走訪時順便數兩個孩子都是 −1 的節點（葉節點），以及走到的節點總數；總數不等於 n，就表示有節點和根不相連。',
        '本題的值不影響答案，但要讀掉；別把值 −1 和「沒有孩子」的 −1 混在一起，它們在不同的欄位。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n;
    std::cin >> n;
    std::vector<int> left(n), right(n), parents(n, 0);
    bool ok = true;
    for (int i = 0; i < n; i++) {
        long long value;
        std::cin >> value >> left[i] >> right[i];
        for (int c : {left[i], right[i]}) {
            if (c == -1) continue;
            if (c < 0 || c >= n) ok = false;
            else parents[c]++;
        }
    }
    if (parents[0] != 0) ok = false;
    for (int p : parents) {
        if (p > 1) ok = false;
    }
    if (!ok) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<int> queue{0}, depth(n, 0);
    int height = 0, leaves = 0;
    for (std::size_t head = 0; head < queue.size(); head++) {
        int u = queue[head];
        if (depth[u] > height) height = depth[u];
        if (left[u] == -1 && right[u] == -1) leaves++;
        for (int c : {left[u], right[u]}) {
            if (c == -1) continue;
            depth[c] = depth[u] + 1;
            queue.push_back(c);
        }
    }
    if (static_cast<int>(queue.size()) != n) std::cout << "Invalid\n";
    else std::cout << n << " " << height << " " << leaves << "\n";
    return 0;
}`,
        Python: code`import sys
from collections import deque


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    left = [int(data[2 + 3 * i]) for i in range(n)]
    right = [int(data[3 + 3 * i]) for i in range(n)]
    parents = [0] * n
    ok = True
    for c in left + right:
        if c == -1:
            continue
        if c < 0 or c >= n:
            ok = False
        else:
            parents[c] += 1
    if not ok or parents[0] != 0 or max(parents) > 1:
        print("Invalid")
        return
    depth = [0] * n
    queue = deque([0])
    seen = height = leaves = 0
    while queue:
        u = queue.popleft()
        seen += 1
        height = max(height, depth[u])
        if left[u] == -1 and right[u] == -1:
            leaves += 1
        for c in (left[u], right[u]):
            if c != -1:
                depth[c] = depth[u] + 1
                queue.append(c)
    print(f"{n} {height} {leaves}" if seen == n else "Invalid")


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.StreamTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));
        in.nextToken();
        int n = (int) in.nval;
        int[] left = new int[n], right = new int[n], parents = new int[n];
        boolean ok = true;
        for (int i = 0; i < n; i++) {
            in.nextToken();  // 值：不影響答案
            in.nextToken();
            left[i] = (int) in.nval;
            in.nextToken();
            right[i] = (int) in.nval;
            for (int c : new int[] {left[i], right[i]}) {
                if (c == -1) continue;
                if (c < 0 || c >= n) ok = false;
                else parents[c]++;
            }
        }
        if (parents[0] != 0) ok = false;
        for (int p : parents) {
            if (p > 1) ok = false;
        }
        if (!ok) {
            System.out.println("Invalid");
            return;
        }
        int[] queue = new int[n], depth = new int[n];
        int head = 0, tail = 0, height = 0, leaves = 0;
        queue[tail++] = 0;
        while (head < tail) {
            int u = queue[head++];
            height = Math.max(height, depth[u]);
            if (left[u] == -1 && right[u] == -1) leaves++;
            for (int c : new int[] {left[u], right[u]}) {
                if (c == -1) continue;
                depth[c] = depth[u] + 1;
                queue[tail++] = c;
            }
        }
        System.out.println(tail == n ? n + " " + height + " " + leaves : "Invalid");
    }
}`,
      },
      judge: 'none',
    },
  ],
};

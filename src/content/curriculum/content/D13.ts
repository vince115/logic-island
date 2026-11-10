import type { LessonContent, TraceStep } from '../schema';
import { traversalSteps, type Shape } from '../simulate';

const code = String.raw;

/** The tree used throughout the lesson: 10 has only a right child, so the level order shows a skipped `if`. */
const lessonTree: Shape = ['8', ['3', ['1'], ['6', ['4'], ['7']]], ['10', null, ['14']]];

/**
 * The level-order trace. traversalSteps('level') makes one step per visit with the queue after the children were
 * pushed; each visit is split here into the popleft/print step (line 6) and one step per child pushed (lines 8 and 10),
 * so every queue change appears on the line that makes it.
 */
const levelSteps: TraceStep[] = traversalSteps('tree', lessonTree, 'level', 3).flatMap((step, i): TraceStep[] => {
  const tree = step.tree!;
  if (i === 0) return [{ ...step, line: 3, note: '建立佇列 `queue`，先放進根 8。佇列是先進先出：之後每次都從前端（左邊）取出最早放入的節點。' }];
  const label = (id: string) => tree.nodes.find(n => n.id === id)!.label;
  const id = tree.marks!.find(m => m.kind === 'current')!.id;
  const node = tree.nodes.find(n => n.id === id)!;
  const after = step.containers![0].items;
  const kids = [node.left, node.right].filter((c): c is string => !!c);
  let items = after.slice(0, after.length - kids.length);
  const why = !kids.length ? `${node.label} 是葉節點，第 7 行與第 9 行的 if 都不成立，沒有放入任何節點。`
    : !node.left ? `${node.label} 沒有左孩子（node.left 是 None），第 7 行的 if 不成立，只會放入右孩子。` : '';
  const steps: TraceStep[] = [{
    ...step, line: 6, vars: { node: node.label },
    note: `第 5 行 popleft() 取出佇列最前面的 ${node.label}（目前佇列裡最早放入的節點），第 6 行把它印出。輸出序列：${step.output}。${why}`,
    containers: [{ name: '佇列', kind: 'queue', items }],
  }];
  for (const [side, child] of [['左', node.left], ['右', node.right]] as const) {
    if (!child) continue;
    items = [...items, label(child)];
    steps.push({
      ...step, line: side === '左' ? 8 : 10, vars: { node: node.label },
      note: `把 ${node.label} 的${side}孩子 ${label(child)} 放到佇列尾端。它比佇列裡現有的節點晚出來，所以下一層的節點一定排在這一層之後。`,
      tree: { ...tree, marks: [...tree.marks!, { id: child, kind: 'write' }] },
      containers: [{ name: '佇列', kind: 'queue', items, marks: [{ at: items.length - 1, kind: 'write' }] }],
    });
  }
  return steps;
});
const lastLevel = levelSteps.at(-1)!;

/** A left-only chain deeper than Python's default recursion limit (1000), for the exercise. */
const CHAIN = 1500;
const chainInput = `${CHAIN}\n` + Array.from({ length: CHAIN }, (_, i) => `${i + 1} ${i + 1 < CHAIN ? i + 1 : -1} -1`).join('\n');
const chainUp = Array.from({ length: CHAIN }, (_, i) => i + 1).join(' ');
const chainDown = Array.from({ length: CHAIN }, (_, i) => CHAIN - i).join(' ');

/**
 * D13 Tree Traversal. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); level-order queues are arrays with a head index (no shift()).
 */
export const D13: LessonContent = {
  lessonId: 'D13',
  motivation: '檔案總管列出資料夾裡的所有檔案、計算一個資料夾的總大小、把網頁的 DOM 樹畫成畫面、把二元搜尋樹的資料由小到大印出，都要「把樹上每個節點都處理一次」，也就是走訪（traversal）。陣列只有一個方向可以走，樹卻在每個節點分岔，所以先走哪一邊、什麼時候處理根，決定了結果的順序，也決定了它能解決哪一類問題。本課學四種走訪：前序、中序、後序（遞迴與堆疊兩種寫法），以及用佇列的層序，並學會從走訪結果推回樹的形狀。它的限制是：走訪一定要看過全部 n 個節點，是 O(n)；如果只是要找一個值，二元搜尋樹（D14）只需沿一條路徑往下找。',
  sections: [
    {
      id: 'dfs-orders', title: '前序、中序、後序：根在什麼時候拜訪',
      blocks: [
        { type: 'p', text: '走訪是把樹的每個節點都「拜訪」（visit：印出、加總、複製……）剛好一次。最常用的三種順序都是深度優先（DFS，depth-first）：先把一邊的子樹整個走完，再走另一邊，差別只在根什麼時候被拜訪：' },
        { type: 'list', items: [
          '前序（preorder）：根 → 左子樹 → 右子樹。',
          '中序（inorder）：左子樹 → 根 → 右子樹。',
          '後序（postorder）：左子樹 → 右子樹 → 根。',
        ] },
        { type: 'p', text: '遞迴寫法幾乎就是定義本身：遇到空樹（C++ `nullptr`、Python `None`、Java 與 JavaScript `null`）直接返回；否則對左、右子樹各呼叫一次，再把「拜訪根」那一行放在最前、中間或最後。本課一直使用下面這棵 8 個節點的樹（根是 8，注意 10 只有右孩子）：' },
        { type: 'table', head: ['節點', '左孩子', '右孩子'], rows: [
          ['8（根）', '3', '10'],
          ['3', '1', '6'],
          ['6', '4', '7'],
          ['10', '（沒有）', '14'],
          ['1、4、7、14（葉）', '（沒有）', '（沒有）'],
        ] },
        { type: 'example', id: 'three-orders' },
        { type: 'p', text: '讀結果的小技巧：前序的第一個一定是根，後序的最後一個一定是根；中序裡，根把序列切成兩半，左子樹的節點都在根的左邊、右子樹的都在右邊。這棵樹剛好是二元搜尋樹（BST，每個節點左邊都比它小、右邊都比它大，D14），所以中序輸出正好由小到大排好，這是中序最重要的用途。' },
        { type: 'table', head: ['順序', '適合的工作', '原因'], rows: [
          ['前序', '複製一棵樹、把樹序列化（serialize，存成文字或檔案再讀回）、印出目錄結構', '父節點先處理：複製時先建好父節點，才能把孩子接上去'],
          ['中序', 'BST 由小到大輸出（D14）、運算式樹還原成 `a + b` 的寫法', '左子樹全部在根之前、右子樹全部在根之後'],
          ['後序', '釋放記憶體、計算子樹大小或高度（D12 的 height）、運算式樹求值', '要先知道（或先處理完）兩個孩子，才能處理父節點'],
        ] },
        { type: 'callout', tone: 'warning', title: '遞迴一定要先處理空樹', text: '少了函式開頭的 `if (n == nullptr) return;`，走到葉節點的孩子時就會對空指標取值：C++ 是未定義行為（通常當掉），Python 丟出 `AttributeError: \'NoneType\' object has no attribute \'val\'`，Java 丟出 `NullPointerException`，JavaScript 丟出 `TypeError: Cannot read properties of null`。改成「孩子不是空的才呼叫」也可以，但整棵樹本身是空樹時仍會出錯，所以把檢查放在函式開頭最安全。' },
      ],
    },
    {
      id: 'level-order', title: '層序走訪：用佇列一層一層走',
      blocks: [
        { type: 'p', text: '層序（level order）從根開始，先拜訪深度 0，再深度 1、深度 2……，同一層由左到右。這就是廣度優先搜尋（BFS，breadth-first search）在樹上的樣子。關鍵是佇列（queue，D06）的先進先出：先把根放進佇列；然後重複「取出前端的節點、拜訪它、把它存在的左孩子與右孩子放到尾端」，直到佇列為空。下一層的節點都是在這一層的節點被取出時才放進去，而且排在後面，所以一定等這一層全部拜訪完才輪到下一層。下方的視覺化逐步展示佇列的變化。' },
        { type: 'p', text: '如果要一層印一行，就在每一輪開始時先記下佇列的大小 `width`：那一刻佇列裡剛好是完整的一層，連續取出 width 個就是這一層；取出期間放進去的孩子都屬於下一層，留到下一輪。' },
        { type: 'example', id: 'level-by-level' },
        { type: 'table', head: ['語言', '佇列', '放入尾端', '取出前端', '注意'], rows: [
          ['C++', '`std::queue<const Node*>`', '`q.push(x)`', '`q.front()` 再 `q.pop()`', '`pop()` 不回傳值；空佇列上 `front()` 是未定義行為'],
          ['Python', '`collections.deque`', '`q.append(x)`', '`q.popleft()`', '不要用 `list.pop(0)`：每次都要搬動整個 list，是 O(n)'],
          ['Java', '`Queue<Node> q = new ArrayDeque<>()`', '`q.offer(x)`', '`q.poll()`', '`ArrayDeque` 不能放 `null`：放孩子前要先檢查 `!= null`，否則丟出 `NullPointerException`'],
          ['JavaScript', '沒有內建佇列：陣列 `q` 加上前端索引 `head`', '`q.push(x)`', '`q[head++]`', '不要用 `q.shift()`：每次都要搬動整個陣列，是 O(n)；`head < q.length` 表示佇列不是空的'],
        ] },
        { type: 'callout', tone: 'warning', title: '換成堆疊就不是層序了', text: '把 `popleft()` 誤寫成 `pop()`（或把佇列換成堆疊），每次取出的就變成「最後放入」的節點，走訪變成深度優先。以本課的樹會得到 `8 10 14 3 6 7 4 1`：這是「根、右、左」的前序，不再是一層一層。' },
      ],
    },
    {
      id: 'iterative', title: '迭代走訪：自己管理堆疊',
      blocks: [
        { type: 'p', text: '遞迴其實是把「還沒做完的事」交給呼叫堆疊（call stack，D05）保管。樹很深時，呼叫堆疊會用完：例如一條一路往左、10 萬個節點的鏈，高度是 99,999，遞迴就要疊大約 10 萬層。改用自己建立的堆疊（容器的資料放在一般的記憶體裡，只受記憶體總量限制），就能處理很深的樹。' },
        { type: 'callout', tone: 'warning', title: '深樹會讓遞迴爆掉', text: 'Python 預設的遞迴深度上限是 1000（`sys.getrecursionlimit()`），超過就丟出 `RecursionError`；用 `sys.setrecursionlimit` 調高後，仍可能把真正的系統堆疊用完而讓直譯器當掉。Java 丟出 `StackOverflowError`，能容納幾層取決於執行緒的堆疊大小（`-Xss`）。JavaScript（Node.js）丟出 `RangeError: Maximum call stack size exceeded`，能容納幾層取決於 V8 引擎的堆疊大小。C++ 不做檢查，堆疊溢位（stack overflow）通常讓程式直接當掉（例如 segmentation fault）。題目的 n 很大、又沒有保證樹是平衡的時候，就要改用迭代寫法。' },
        { type: 'p', text: '迭代前序：堆疊先放根；每次 pop 一個節點並拜訪它，再先 push 右孩子、後 push 左孩子。後放的先出來，所以左子樹會先被處理完，順序正好是「根、左、右」。' },
        { type: 'p', text: '迭代中序（「一路往左」迴圈）：從 `cur = 根` 開始，先一路往左走，把沿途的節點 push 進堆疊；走到空的時候 pop 出來的節點，左子樹一定已經走完，於是拜訪它，再把 cur 移到它的右孩子，重複同樣的事。外層迴圈的條件是「cur 不是空的，或堆疊不是空的」。下面的程式把遞迴與迭代的中序放在一起，輸出完全相同。' },
        { type: 'example', id: 'stack-walks' },
        { type: 'p', text: '迭代後序常見兩種寫法：用兩個堆疊；或者照前序的做法但「先 push 左、後 push 右」，得到「根、右、左」的序列，最後整個反轉就是「左、右、根」。後者最好寫（本課練習題就用它），代價是要先把整個序列存起來才能反轉。' },
        { type: 'p', text: '空間沒有變少：前序與中序的堆疊裡，同時最多只有大約 h + 1 個節點（從根往下每一層最多留一個等著處理），所以額外空間和遞迴一樣是 O(h)，只是從呼叫堆疊搬到了自己的容器，不再受遞迴深度的限制。' },
      ],
    },
    {
      id: 'rebuild', title: '由走訪結果推回樹',
      blocks: [
        { type: 'p', text: '如果所有節點的值都不相同，前序加上中序可以唯一決定一棵二元樹。做法是遞迴：前序的第一個是根；在中序裡找到根的位置 k，它左邊的 k 個是左子樹、右邊的是右子樹；前序中根後面的 k 個是左子樹的前序，剩下的是右子樹的前序。兩邊各自再做一次。' },
        { type: 'p', text: '例：前序 `A B D E C F`、中序 `D B E A C F`。根是 A；中序裡 A 左邊是 `D B E`（左子樹有 3 個節點），右邊是 `C F`。左子樹的前序是 `B D E`：根 B，再看中序 `D B E`，D 在 B 左邊、E 在右邊。右子樹的前序 `C F`、中序 `C F`：根 C，中序裡 C 左邊沒有東西，所以 F 是 C 的右孩子。下面的程式不真的建立節點，而是在遞迴返回時直接拼出後序（左、右、根）。' },
        { type: 'example', id: 'rebuild-postorder' },
        { type: 'p', text: '為什麼只有前序加後序不夠？這兩種順序只告訴你「父節點在孩子之前或之後」，沒有告訴你孩子在左邊還是右邊。最小的例子：根 A 只有一個孩子 B，不論 B 在左或在右，前序都是 `A B`、後序都是 `B A`；中序卻分別是 `B A` 與 `A B`。上面程式的後兩行也是如此：前序都是 `ABC`、後序都是 `CBA`，樹卻可能一路往右長，也可能一路往左長。只有每個節點都恰好有 0 或 2 個孩子（滿二元樹，full binary tree）時，前序加後序才能唯一決定一棵樹。' },
        { type: 'callout', tone: 'note', title: '值重複與效率', text: '值有重複時，根在中序裡的位置可能有好幾個選擇，不同選擇可能都合法，樹就不唯一。效率方面，範例每一層都用 `index`／`find` 線性搜尋根，又切出新字串，最壞（一條鏈）是 O(n^2)；改成傳索引範圍，並先用雜湊表記下每個值在中序裡的位置，就能降到 O(n)。' },
      ],
    },
    {
      id: 'compare', title: '四種走訪的比較與複雜度',
      blocks: [
        { type: 'table', head: ['走訪', '拜訪順序', '用到的結構', '本課的樹', '常見用途'], rows: [
          ['前序', '根、左、右', '遞迴或堆疊', '`8 3 1 6 4 7 10 14`', '複製、序列化'],
          ['中序', '左、根、右', '遞迴或堆疊', '`1 3 4 6 7 8 10 14`', 'BST 由小到大'],
          ['後序', '左、右、根', '遞迴、兩個堆疊或反轉', '`1 4 7 6 3 14 10 8`', '釋放記憶體、子樹大小與高度'],
          ['層序', '一層一層、同層由左到右', '佇列', '`8 3 10 1 6 14 4 7`', '依深度處理、樹上的最短步數（BFS）'],
        ] },
        { type: 'p', text: '時間：四種走訪都讓每個節點被拜訪剛好一次（遞迴版另外對每個空孩子多一次 O(1) 的呼叫，空孩子共有 n + 1 個），所以都是 O(n)。空間則看樹的形狀：' },
        { type: 'table', head: ['走訪', '時間', '額外空間', '空間最省的樹', '空間最多的樹'], rows: [
          ['前序／中序／後序（遞迴或堆疊）', 'O(n)', 'O(h)', '平衡樹：h 約 log n，O(log n)', '一條鏈：h = n − 1，O(n)'],
          ['層序（佇列）', 'O(n)', 'O(w)，w 是最寬那一層的節點數', '一條鏈：w = 1，O(1)', '完全二元樹：最後一層約 n/2 個，O(n)'],
        ] },
        { type: 'p', text: '這裡的 h 是樹高，沿用 D12 的定義：空樹高度 −1，只有一個節點的樹高度 0。深而窄的樹（鏈）對深度優先不利、對層序有利；淺而寬的樹（完全二元樹）剛好相反。' },
        { type: 'p', text: '語言差異：C++ 的孩子是指標，節點可以放在區域變數，或用 `new` 配置後要自己用後序 `delete`；Python、Java 與 JavaScript 的變數存的是參考（reference），節點物件由垃圾回收（garbage collection）管理，不必手動釋放。C++、Python、Java、JavaScript 的「空」分別是 `nullptr`、`None`、`null`、`null`；堆疊分別用 `std::stack`、`list`（`append`／`pop`）、`ArrayDeque`（`push`／`pop`）、陣列（`push`／`pop`），佇列見上面的表。' },
      ],
    },
  ],
  examples: [
    {
      id: 'three-orders', title: '遞迴的前序、中序、後序', description: '同一棵樹的三種深度優先走訪：三個函式只差「拜訪根」那一行的位置。',
      output: 'preorder: 8 3 1 6 4 7 10 14\ninorder: 1 3 4 6 7 8 10 14\npostorder: 1 4 7 6 3 14 10 8',
      code: {
        'C++': code`#include <iostream>

struct Node {
    int val;
    Node* left;
    Node* right;
};

void preorder(const Node* n) {
    if (n == nullptr) return;    // 空樹：什麼都不做
    std::cout << " " << n->val;  // 根
    preorder(n->left);           // 左
    preorder(n->right);          // 右
}

void inorder(const Node* n) {
    if (n == nullptr) return;
    inorder(n->left);
    std::cout << " " << n->val;
    inorder(n->right);
}

void postorder(const Node* n) {
    if (n == nullptr) return;
    postorder(n->left);
    postorder(n->right);
    std::cout << " " << n->val;
}

int main() {
    Node n1{1, nullptr, nullptr}, n4{4, nullptr, nullptr}, n7{7, nullptr, nullptr}, n14{14, nullptr, nullptr};
    Node n6{6, &n4, &n7}, n3{3, &n1, &n6}, n10{10, nullptr, &n14}, root{8, &n3, &n10};
    std::cout << "preorder:";
    preorder(&root);
    std::cout << "\ninorder:";
    inorder(&root);
    std::cout << "\npostorder:";
    postorder(&root);
    std::cout << "\n";
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, val, left=None, right=None):
        self.val, self.left, self.right = val, left, right


def preorder(n, out):
    if n is None:  # 空樹：什麼都不做
        return
    out.append(n.val)  # 根
    preorder(n.left, out)  # 左
    preorder(n.right, out)  # 右


def inorder(n, out):
    if n is None:
        return
    inorder(n.left, out)
    out.append(n.val)
    inorder(n.right, out)


def postorder(n, out):
    if n is None:
        return
    postorder(n.left, out)
    postorder(n.right, out)
    out.append(n.val)


root = Node(8, Node(3, Node(1), Node(6, Node(4), Node(7))), Node(10, None, Node(14)))
for name, walk in [("preorder", preorder), ("inorder", inorder), ("postorder", postorder)]:
    out = []
    walk(root, out)
    print(name + ":", *out)`,
        Java: code`public class Main {
    static class Node {
        int val;
        Node left, right;
        Node(int val, Node left, Node right) { this.val = val; this.left = left; this.right = right; }
    }

    static void preorder(Node n, StringBuilder sb) {
        if (n == null) return;          // 空樹：什麼都不做
        sb.append(" ").append(n.val);   // 根
        preorder(n.left, sb);           // 左
        preorder(n.right, sb);          // 右
    }

    static void inorder(Node n, StringBuilder sb) {
        if (n == null) return;
        inorder(n.left, sb);
        sb.append(" ").append(n.val);
        inorder(n.right, sb);
    }

    static void postorder(Node n, StringBuilder sb) {
        if (n == null) return;
        postorder(n.left, sb);
        postorder(n.right, sb);
        sb.append(" ").append(n.val);
    }

    static Node leaf(int v) { return new Node(v, null, null); }

    public static void main(String[] args) {
        Node root = new Node(8, new Node(3, leaf(1), new Node(6, leaf(4), leaf(7))), new Node(10, null, leaf(14)));
        StringBuilder pre = new StringBuilder("preorder:"), in = new StringBuilder("inorder:"), post = new StringBuilder("postorder:");
        preorder(root, pre);
        inorder(root, in);
        postorder(root, post);
        System.out.println(pre + "\n" + in + "\n" + post);
    }
}`,
        JavaScript: code`class Node {
    constructor(val, left = null, right = null) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

function preorder(n, out) {
    if (n === null) return;  // 空樹：什麼都不做
    out.push(n.val);         // 根
    preorder(n.left, out);   // 左
    preorder(n.right, out);  // 右
}

function inorder(n, out) {
    if (n === null) return;
    inorder(n.left, out);
    out.push(n.val);
    inorder(n.right, out);
}

function postorder(n, out) {
    if (n === null) return;
    postorder(n.left, out);
    postorder(n.right, out);
    out.push(n.val);
}

const root = new Node(8, new Node(3, new Node(1), new Node(6, new Node(4), new Node(7))), new Node(10, null, new Node(14)));
for (const [name, walk] of [["preorder", preorder], ["inorder", inorder], ["postorder", postorder]]) {
    const out = [];
    walk(root, out);
    console.log(name + ": " + out.join(" "));
}`,
      },
    },
    {
      id: 'level-by-level', title: '層序走訪，一層印一行', description: '用佇列做層序走訪；每一輪先記下佇列大小，取出這麼多個就是完整的一層。',
      output: 'level 0: 8\nlevel 1: 3 10\nlevel 2: 1 6 14\nlevel 3: 4 7',
      code: {
        'C++': code`#include <cstddef>
#include <iostream>
#include <queue>

struct Node {
    int val;
    Node* left;
    Node* right;
};

int main() {
    Node n1{1, nullptr, nullptr}, n4{4, nullptr, nullptr}, n7{7, nullptr, nullptr}, n14{14, nullptr, nullptr};
    Node n6{6, &n4, &n7}, n3{3, &n1, &n6}, n10{10, nullptr, &n14}, root{8, &n3, &n10};
    std::queue<const Node*> q;
    q.push(&root);
    int level = 0;
    while (!q.empty()) {
        std::size_t width = q.size();  // 此刻佇列裡剛好是完整的一層
        std::cout << "level " << level << ":";
        for (std::size_t i = 0; i < width; ++i) {
            const Node* n = q.front();
            q.pop();
            std::cout << " " << n->val;
            if (n->left != nullptr) q.push(n->left);
            if (n->right != nullptr) q.push(n->right);
        }
        std::cout << "\n";
        ++level;
    }
    return 0;
}`,
        Python: code`from collections import deque


class Node:
    def __init__(self, val, left=None, right=None):
        self.val, self.left, self.right = val, left, right


root = Node(8, Node(3, Node(1), Node(6, Node(4), Node(7))), Node(10, None, Node(14)))
queue = deque([root])
level = 0
while queue:
    width = len(queue)  # 此刻佇列裡剛好是完整的一層
    row = []
    for _ in range(width):
        node = queue.popleft()
        row.append(node.val)
        if node.left is not None:
            queue.append(node.left)
        if node.right is not None:
            queue.append(node.right)
    print(f"level {level}:", *row)
    level += 1`,
        Java: code`import java.util.ArrayDeque;
import java.util.Queue;

public class Main {
    static class Node {
        int val;
        Node left, right;
        Node(int val, Node left, Node right) { this.val = val; this.left = left; this.right = right; }
    }

    static Node leaf(int v) { return new Node(v, null, null); }

    public static void main(String[] args) {
        Node root = new Node(8, new Node(3, leaf(1), new Node(6, leaf(4), leaf(7))), new Node(10, null, leaf(14)));
        Queue<Node> queue = new ArrayDeque<>();
        queue.offer(root);
        int level = 0;
        while (!queue.isEmpty()) {
            int width = queue.size();  // 此刻佇列裡剛好是完整的一層
            StringBuilder row = new StringBuilder("level " + level + ":");
            for (int i = 0; i < width; i++) {
                Node node = queue.poll();
                row.append(" ").append(node.val);
                if (node.left != null) queue.offer(node.left);  // ArrayDeque 不能放 null
                if (node.right != null) queue.offer(node.right);
            }
            System.out.println(row);
            level++;
        }
    }
}`,
        JavaScript: code`class Node {
    constructor(val, left = null, right = null) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

const root = new Node(8, new Node(3, new Node(1), new Node(6, new Node(4), new Node(7))), new Node(10, null, new Node(14)));
const queue = [root];  // 陣列當佇列：head 是前端，push 放到尾端
let head = 0, level = 0;
while (head < queue.length) {
    const width = queue.length - head;  // 此刻佇列裡剛好是完整的一層
    const row = [];
    for (let i = 0; i < width; i++) {
        const node = queue[head++];
        row.push(node.val);
        if (node.left !== null) queue.push(node.left);
        if (node.right !== null) queue.push(node.right);
    }
    console.log("level " + level + ": " + row.join(" "));
    level++;
}`,
      },
    },
    {
      id: 'stack-walks', title: '用堆疊做中序與前序', description: '迭代中序用「一路往左」的迴圈，輸出與遞迴版完全相同；迭代前序先放右孩子、再放左孩子。',
      output: 'recursive inorder: 1 3 4 6 7 8 10 14\niterative inorder: 1 3 4 6 7 8 10 14\niterative preorder: 8 3 1 6 4 7 10 14',
      code: {
        'C++': code`#include <iostream>
#include <stack>
#include <vector>

struct Node {
    int val;
    Node* left;
    Node* right;
};

void inorderRecursive(const Node* n, std::vector<int>& out) {
    if (n == nullptr) return;
    inorderRecursive(n->left, out);
    out.push_back(n->val);
    inorderRecursive(n->right, out);
}

std::vector<int> inorderIterative(const Node* root) {
    std::vector<int> out;
    std::stack<const Node*> st;
    const Node* cur = root;
    while (cur != nullptr || !st.empty()) {
        while (cur != nullptr) {  // 一路往左，沿途的節點先放進堆疊
            st.push(cur);
            cur = cur->left;
        }
        cur = st.top();           // 左子樹走完了，拜訪這個節點
        st.pop();
        out.push_back(cur->val);
        cur = cur->right;         // 再去處理右子樹
    }
    return out;
}

std::vector<int> preorderIterative(const Node* root) {
    std::vector<int> out;
    std::stack<const Node*> st;
    st.push(root);
    while (!st.empty()) {
        const Node* n = st.top();
        st.pop();
        out.push_back(n->val);
        if (n->right != nullptr) st.push(n->right);  // 先放右、再放左，左邊才會先被取出
        if (n->left != nullptr) st.push(n->left);
    }
    return out;
}

void print(const char* name, const std::vector<int>& v) {
    std::cout << name << ":";
    for (int x : v) std::cout << " " << x;
    std::cout << "\n";
}

int main() {
    Node n1{1, nullptr, nullptr}, n4{4, nullptr, nullptr}, n7{7, nullptr, nullptr}, n14{14, nullptr, nullptr};
    Node n6{6, &n4, &n7}, n3{3, &n1, &n6}, n10{10, nullptr, &n14}, root{8, &n3, &n10};
    std::vector<int> rec;
    inorderRecursive(&root, rec);
    print("recursive inorder", rec);
    print("iterative inorder", inorderIterative(&root));
    print("iterative preorder", preorderIterative(&root));
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, val, left=None, right=None):
        self.val, self.left, self.right = val, left, right


def inorder_recursive(n, out):
    if n is None:
        return
    inorder_recursive(n.left, out)
    out.append(n.val)
    inorder_recursive(n.right, out)


def inorder_iterative(root):
    out, stack, cur = [], [], root
    while cur is not None or stack:
        while cur is not None:  # 一路往左，沿途的節點先放進堆疊
            stack.append(cur)
            cur = cur.left
        cur = stack.pop()  # 左子樹走完了，拜訪這個節點
        out.append(cur.val)
        cur = cur.right  # 再去處理右子樹
    return out


def preorder_iterative(root):
    out, stack = [], [root]
    while stack:
        node = stack.pop()
        out.append(node.val)
        if node.right is not None:  # 先放右、再放左，左邊才會先被取出
            stack.append(node.right)
        if node.left is not None:
            stack.append(node.left)
    return out


root = Node(8, Node(3, Node(1), Node(6, Node(4), Node(7))), Node(10, None, Node(14)))
rec = []
inorder_recursive(root, rec)
print("recursive inorder:", *rec)
print("iterative inorder:", *inorder_iterative(root))
print("iterative preorder:", *preorder_iterative(root))`,
        Java: code`import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

public class Main {
    static class Node {
        int val;
        Node left, right;
        Node(int val, Node left, Node right) { this.val = val; this.left = left; this.right = right; }
    }

    static void inorderRecursive(Node n, List<Integer> out) {
        if (n == null) return;
        inorderRecursive(n.left, out);
        out.add(n.val);
        inorderRecursive(n.right, out);
    }

    static List<Integer> inorderIterative(Node root) {
        List<Integer> out = new ArrayList<>();
        Deque<Node> stack = new ArrayDeque<>();
        Node cur = root;
        while (cur != null || !stack.isEmpty()) {
            while (cur != null) {  // 一路往左，沿途的節點先放進堆疊
                stack.push(cur);
                cur = cur.left;
            }
            cur = stack.pop();     // 左子樹走完了，拜訪這個節點
            out.add(cur.val);
            cur = cur.right;       // 再去處理右子樹
        }
        return out;
    }

    static List<Integer> preorderIterative(Node root) {
        List<Integer> out = new ArrayList<>();
        Deque<Node> stack = new ArrayDeque<>();
        stack.push(root);
        while (!stack.isEmpty()) {
            Node n = stack.pop();
            out.add(n.val);
            if (n.right != null) stack.push(n.right);  // 先放右、再放左，左邊才會先被取出
            if (n.left != null) stack.push(n.left);
        }
        return out;
    }

    static void print(String name, List<Integer> v) {
        StringBuilder sb = new StringBuilder(name + ":");
        for (int x : v) sb.append(" ").append(x);
        System.out.println(sb);
    }

    static Node leaf(int v) { return new Node(v, null, null); }

    public static void main(String[] args) {
        Node root = new Node(8, new Node(3, leaf(1), new Node(6, leaf(4), leaf(7))), new Node(10, null, leaf(14)));
        List<Integer> rec = new ArrayList<>();
        inorderRecursive(root, rec);
        print("recursive inorder", rec);
        print("iterative inorder", inorderIterative(root));
        print("iterative preorder", preorderIterative(root));
    }
}`,
        JavaScript: code`class Node {
    constructor(val, left = null, right = null) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

function inorderRecursive(n, out) {
    if (n === null) return;
    inorderRecursive(n.left, out);
    out.push(n.val);
    inorderRecursive(n.right, out);
}

function inorderIterative(root) {
    const out = [], stack = [];
    let cur = root;
    while (cur !== null || stack.length > 0) {
        while (cur !== null) {  // 一路往左，沿途的節點先放進堆疊
            stack.push(cur);
            cur = cur.left;
        }
        cur = stack.pop();      // 左子樹走完了，拜訪這個節點
        out.push(cur.val);
        cur = cur.right;        // 再去處理右子樹
    }
    return out;
}

function preorderIterative(root) {
    const out = [], stack = [root];
    while (stack.length > 0) {
        const n = stack.pop();
        out.push(n.val);
        if (n.right !== null) stack.push(n.right);  // 先放右、再放左，左邊才會先被取出
        if (n.left !== null) stack.push(n.left);
    }
    return out;
}

const root = new Node(8, new Node(3, new Node(1), new Node(6, new Node(4), new Node(7))), new Node(10, null, new Node(14)));
const rec = [];
inorderRecursive(root, rec);
console.log("recursive inorder: " + rec.join(" "));
console.log("iterative inorder: " + inorderIterative(root).join(" "));
console.log("iterative preorder: " + preorderIterative(root).join(" "));`,
      },
    },
    {
      id: 'rebuild-postorder', title: '由前序與中序求後序', description: '值都不重複時，前序加中序決定唯一的樹；遞迴切出左右子樹，返回時拼出後序。後兩組的前序都是 ABC，中序不同，後序卻相同。',
      output: 'ABDECF + DBEACF -> DEBFCA\nABC + ABC -> CBA\nABC + CBA -> CBA',
      code: {
        'C++': code`#include <cstddef>
#include <iostream>
#include <string>

// 由前序 pre 與中序 in（值都不重複）推回樹，直接回傳它的後序
std::string postorder(const std::string& pre, const std::string& in) {
    if (pre.empty()) return "";
    char root = pre[0];                       // 前序的第一個是根
    std::size_t k = in.find(root);            // 中序裡根左邊的 k 個屬於左子樹
    std::string left = postorder(pre.substr(1, k), in.substr(0, k));
    std::string right = postorder(pre.substr(k + 1), in.substr(k + 1));
    return left + right + root;               // 後序：左、右、根
}

int main() {
    const char* cases[][2] = {{"ABDECF", "DBEACF"}, {"ABC", "ABC"}, {"ABC", "CBA"}};
    for (const auto& c : cases) {
        std::cout << c[0] << " + " << c[1] << " -> " << postorder(c[0], c[1]) << "\n";
    }
    return 0;
}`,
        Python: code`def postorder(pre, ino):
    """由前序 pre 與中序 ino（值都不重複）推回樹，直接回傳它的後序。"""
    if not pre:
        return ""
    root = pre[0]  # 前序的第一個是根
    k = ino.index(root)  # 中序裡根左邊的 k 個屬於左子樹
    left = postorder(pre[1:k + 1], ino[:k])
    right = postorder(pre[k + 1:], ino[k + 1:])
    return left + right + root  # 後序：左、右、根


for pre, ino in [("ABDECF", "DBEACF"), ("ABC", "ABC"), ("ABC", "CBA")]:
    print(pre, "+", ino, "->", postorder(pre, ino))`,
        Java: code`public class Main {
    // 由前序 pre 與中序 in（值都不重複）推回樹，直接回傳它的後序
    static String postorder(String pre, String in) {
        if (pre.isEmpty()) return "";
        char root = pre.charAt(0);                // 前序的第一個是根
        int k = in.indexOf(root);                 // 中序裡根左邊的 k 個屬於左子樹
        String left = postorder(pre.substring(1, k + 1), in.substring(0, k));
        String right = postorder(pre.substring(k + 1), in.substring(k + 1));
        return left + right + root;               // 後序：左、右、根
    }

    public static void main(String[] args) {
        String[][] cases = {{"ABDECF", "DBEACF"}, {"ABC", "ABC"}, {"ABC", "CBA"}};
        for (String[] c : cases) {
            System.out.println(c[0] + " + " + c[1] + " -> " + postorder(c[0], c[1]));
        }
    }
}`,
        JavaScript: code`// 由前序 pre 與中序 ino（值都不重複）推回樹，直接回傳它的後序
function postorder(pre, ino) {
    if (pre.length === 0) return "";
    const root = pre[0];         // 前序的第一個是根
    const k = ino.indexOf(root);  // 中序裡根左邊的 k 個屬於左子樹
    const left = postorder(pre.slice(1, k + 1), ino.slice(0, k));
    const right = postorder(pre.slice(k + 1), ino.slice(k + 1));
    return left + right + root;  // 後序：左、右、根
}

for (const [pre, ino] of [["ABDECF", "DBEACF"], ["ABC", "ABC"], ["ABC", "CBA"]]) {
    console.log(pre + " + " + ino + " -> " + postorder(pre, ino));
}`,
      },
    },
  ],
  visualization: {
    kind: 'tree-traversal', title: '層序走訪：佇列讓樹一層一層被拜訪', language: 'Python',
    code: code`from collections import deque
def level_order(root):
    queue = deque([root])
    while queue:
        node = queue.popleft()
        print(node.val, end=" ")
        if node.left:
            queue.append(node.left)
        if node.right:
            queue.append(node.right)
    print()`,
    steps: [
      ...levelSteps,
      { ...lastLevel, line: 11, vars: {}, note: '佇列空了，while 結束，印出換行。每個節點剛好進出佇列一次，所以是 O(n)；輸出 `8 3 10 1 6 14 4 7` 正好是第 0、1、2、3 層，每層由左到右。',
        tree: { ...lastLevel.tree!, marks: lastLevel.tree!.nodes.map(n => ({ id: n.id, kind: 'visited' as const })) },
        containers: [{ name: '佇列', kind: 'queue', items: [] }] },
    ],
  },
  quiz: [
    {
      id: 'q-inorder', prompt: '一棵二元樹：根是 6；6 的左孩子是 3、右孩子是 8；3 沒有左孩子，右孩子是 1；8 的左孩子是 9、右孩子是 2。它的中序走訪是什麼？',
      options: ['1 3 6 9 8 2', '6 3 1 8 9 2', '3 1 6 9 8 2', '1 3 9 2 8 6'],
      answer: 2, explanation: '中序是「左、根、右」。根 6 的左子樹是 3（只有右孩子 1）：3 沒有左子樹，先拜訪 3 再拜訪 1，得到 3 1；接著是根 6；右子樹 8 的中序是 9 8 2。合起來 3 1 6 9 8 2。「1 3 6 9 8 2」把 1 當成 3 的左孩子了；「6 3 1 8 9 2」是前序；「1 3 9 2 8 6」是後序。',
    },
    {
      id: 'q-level', prompt: '樹以 (值, 左子樹, 右子樹) 的巢狀 tuple 表示，None 表示沒有。它的層序走訪是什麼？',
      code: { language: 'Python', text: 'tree = (6, (3, None, (1, None, None)), (8, (9, None, None), (2, None, None)))' },
      options: ['6 3 8 1 9 2', '6 3 1 8 9 2', '6 8 3 2 9 1', '1 9 2 3 8 6'],
      answer: 0, explanation: '這和上一題是同一棵樹。層序一層一層、同層由左到右：深度 0 是 6；深度 1 是 3、8；深度 2 是 3 的右孩子 1，以及 8 的孩子 9、2。所以是 6 3 8 1 9 2。「6 3 1 8 9 2」是前序（先把 3 的子樹走完才去 8）；「6 8 3 2 9 1」每層由右到左；「1 9 2 3 8 6」是由下往上。',
    },
    {
      id: 'q-stack-bfs', prompt: '有人想寫層序走訪，卻用 list 的 `pop()` 取出。對上一題同一棵樹（根 6；3 只有右孩子 1；8 的孩子是 9 與 2），回傳的 out 是什麼？',
      code: { language: 'Python', text: 'def bfs(root):\n    todo = [root]\n    out = []\n    while todo:\n        node = todo.pop()\n        out.append(node.val)\n        if node.left:\n            todo.append(node.left)\n        if node.right:\n            todo.append(node.right)\n    return out' },
      options: ['6 3 8 1 9 2', '6 3 1 8 9 2', '1 3 9 2 8 6', '6 8 2 9 3 1'],
      answer: 3, explanation: '`pop()` 取出最後放入的元素，這是堆疊（後進先出），不是佇列。取出 6，放入 3、8；取出 8（最後放的），放入 9、2；取出 2、再取出 9；最後取出 3，放入 1 再取出 1。得到 6 8 2 9 3 1，是「根、右、左」的深度優先順序。「6 3 8 1 9 2」是正確的層序，要用 `collections.deque` 的 `popleft()` 才會得到；「6 3 1 8 9 2」是一般的前序。',
    },
    {
      id: 'q-rebuild', prompt: '一棵二元樹的值都不相同，前序是 `1 2 4 5 3 6`，中序是 `4 2 5 1 3 6`。它的後序是什麼？',
      options: ['4 2 5 6 3 1', '4 5 2 6 3 1', '4 5 2 3 6 1', '6 3 5 4 2 1'],
      answer: 1, explanation: '前序第一個 1 是根。中序裡 1 左邊的 `4 2 5` 是左子樹、右邊的 `3 6` 是右子樹。左子樹的前序是 `2 4 5`：根 2，中序 `4 2 5` 表示 4 在左、5 在右。右子樹的前序 `3 6`、中序 `3 6`：根 3，6 在 3 右邊，是右孩子。後序「左、右、根」：4 5 2，再 6 3，最後 1，得到 4 5 2 6 3 1。「4 2 5 6 3 1」把左子樹照中序抄了；「4 5 2 3 6 1」把 3 放到 6 前面，但 3 是 6 的父節點，後序裡父節點一定在孩子之後；「6 3 5 4 2 1」是把前序倒過來，那是「右、左、根」，不是後序。',
    },
    {
      id: 'q-space', prompt: 'n 個節點、高度 h 的二元樹，用遞迴做中序走訪。除了存放輸出以外，需要的額外空間是多少？',
      options: ['O(1)：程式沒有建立任何容器', 'O(h)：呼叫堆疊同時最多約 h 層', 'O(n)：一定和節點數一樣多', 'O(log n)：二元樹的高度一定是 log n'],
      answer: 1, explanation: '遞迴雖然沒有寫出容器，每一層呼叫都佔一個呼叫堆疊的框架（frame），同時存在的只有從根到目前節點那條路徑上的呼叫，最多約 h + 2 層（含對空孩子的那一次呼叫），所以是 O(h)。只有當樹是一條鏈時 h = n − 1，才變成 O(n)；只有平衡樹的高度才是 O(log n)，一般二元樹不保證平衡。',
    },
    {
      id: 'q-choose', prompt: 'C++ 要用 `delete` 釋放整棵樹的每個節點，而且刪掉一個節點後就不能再讀它的 `left`、`right`。哪一種走訪順序最自然？',
      options: ['前序', '中序', '層序', '後序'],
      answer: 3, explanation: '後序是「左、右、根」：兩個孩子的子樹都釋放完，才刪父節點，刪除時再也不需要讀它的指標。前序先刪根，接著讀 `root->left` 就是使用已釋放的記憶體（use-after-free，未定義行為），除非先把孩子指標另外存起來；中序刪完根後還要去讀它的右孩子，同樣有問題；層序要先把孩子放進佇列再刪，可以做到，但需要額外的佇列，不如後序直接。',
    },
    {
      id: 'q-null', prompt: '下面的前序走訪對只有一個節點的樹 `Node(5)`（left 與 right 都是 None）呼叫 `preorder(root, [])`，會發生什麼事？',
      code: { language: 'Python', text: 'def preorder(node, out):\n    out.append(node.val)\n    if node.left is not None:\n        preorder(node.left, out)\n    preorder(node.right, out)' },
      options: ['正常結束，out 是 [5]', '無限遞迴，最後丟出 RecursionError', '只拜訪左子樹，右子樹被跳過', "丟出 AttributeError：'NoneType' object has no attribute 'val'"],
      answer: 3, explanation: '左孩子有檢查，右孩子卻沒有：拜訪完 5 之後呼叫 `preorder(None, out)`，第一行就讀 `None.val`，丟出 AttributeError。遞迴不會無限下去（第二層就出錯了），也不是「跳過右子樹」。修正方法是在函式開頭加上 `if node is None: return`，這樣連整棵空樹都能正確處理。',
    },
  ],
  exercises: [
    {
      id: 'e-four-orders', title: '四種走訪一次輸出',
      statement: '給一棵用「節點編號」描述的二元樹：共有 n 個節點，編號 0 到 n − 1，節點 0 是根。每個節點有一個整數值，以及左孩子與右孩子的編號（−1 表示沒有）。請依序輸出它的前序、中序、後序與層序走訪的節點值。n 最大是 10^5，而且樹不保證平衡（可能是一條很長的鏈），遞迴可能超過深度上限，所以請用自己的堆疊完成前序、中序、後序，用佇列完成層序。若有任何一個孩子編號不是 −1、又不在 0 到 n − 1 之間，只輸出一行 `Invalid`。',
      inputFormat: '第一行是 n。接下來 n 行，第 i 行（i 從 0 開始）是 `value left right`：節點 i 的值、左孩子編號、右孩子編號。',
      outputFormat: '四行，依序是前序、中序、後序、層序，同一行的值以一個空白分隔；或只有一行 `Invalid`。',
      constraints: [
        '1 ≤ n ≤ 10^5',
        '−10^9 ≤ value ≤ 10^9，值可能重複',
        '除了孩子編號超出範圍的錯誤以外，保證輸入是一棵以節點 0 為根的二元樹：其他每個節點剛好有一個父節點，沒有環',
      ],
      samples: [
        { kind: 'normal', input: '5\n10 2 1\n-3 -1 -1\n7 3 4\n0 -1 -1\n25 -1 -1', output: '10 7 0 25 -3\n0 7 25 10 -3\n0 25 7 -3 10\n10 7 -3 0 25', note: '根 10 的左孩子是節點 2（值 7），右孩子是節點 1（值 −3）；編號不必照走訪順序' },
      ],
      tests: [
        { kind: 'normal', input: '5\n10 2 1\n-3 -1 -1\n7 3 4\n0 -1 -1\n25 -1 -1', output: '10 7 0 25 -3\n0 7 25 10 -3\n0 25 7 -3 10\n10 7 -3 0 25', note: '範例' },
        { kind: 'normal', input: '8\n8 1 2\n3 3 4\n10 -1 5\n1 -1 -1\n6 6 7\n14 -1 -1\n4 -1 -1\n7 -1 -1', output: '8 3 1 6 4 7 10 14\n1 3 4 6 7 8 10 14\n1 4 7 6 3 14 10 8\n8 3 10 1 6 14 4 7', note: '本課的樹：10 只有右孩子；它是 BST，所以中序由小到大' },
        { kind: 'normal', input: '4\n1 -1 1\n2 2 -1\n3 -1 3\n4 -1 -1', output: '1 2 3 4\n1 3 4 2\n4 3 2 1\n1 2 3 4', note: '之字形：右、左、右' },
        { kind: 'normal', input: '3\n5 1 2\n5 -1 -1\n5 -1 -1', output: '5 5 5\n5 5 5\n5 5 5\n5 5 5', note: '值可以重複' },
        { kind: 'edge', input: '1\n42 -1 -1', output: '42\n42\n42\n42', note: '只有一個節點' },
        { kind: 'edge', input: '4\n1 -1 1\n2 -1 2\n3 -1 3\n4 -1 -1', output: '1 2 3 4\n1 2 3 4\n4 3 2 1\n1 2 3 4', note: '只往右的鏈：中序與前序相同' },
        { kind: 'edge', input: '4\n1 1 -1\n2 2 -1\n3 3 -1\n4 -1 -1', output: '1 2 3 4\n4 3 2 1\n4 3 2 1\n1 2 3 4', note: '只往左的鏈：中序與後序相同' },
        { kind: 'edge', input: chainInput, output: [chainUp, chainDown, chainDown, chainUp].join('\n'), note: `${CHAIN} 個節點的左鏈，高度 ${CHAIN - 1}，超過 Python 預設的遞迴上限 1000` },
        { kind: 'error', input: '2\n5 1 2\n7 -1 -1', output: 'Invalid', note: '右孩子編號 2 等於 n，超出範圍' },
        { kind: 'error', input: '3\n1 1 2\n2 -1 -1\n3 5 -1', output: 'Invalid', note: '最後一個節點的左孩子 5 超出範圍：要讀完全部再檢查，不能先輸出' },
        { kind: 'error', input: '1\n9 -1 -2', output: 'Invalid', note: '−2 不是 −1，也不在 0..n−1' },
      ],
      hints: [
        '先把 n 行讀進三個陣列 `val`、`left`、`right`，確認所有孩子編號都合法，再開始走訪與輸出。',
        '前序：堆疊先放 0；每次 pop 一個節點就記下它的值，再先 push 右孩子、後 push 左孩子（是 −1 就不放）。',
        '中序：`cur = 0`；當 cur 不是 −1 或堆疊不是空的：先一路往左 push，再 pop 一個記下值，然後 cur 移到它的右孩子。',
        '後序：照前序的做法但先 push 左、後 push 右，得到「根、右、左」，最後整個反轉。層序：佇列先放 0，取出前端、記下值、把存在的孩子依左右順序放到尾端。',
        'Python 不要用遞迴（預設上限 1000 層），也不要用 `list.pop(0)` 當佇列，改用 `collections.deque`；輸出量大時，把一整行組好再一次印出。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <cstddef>
#include <iostream>
#include <queue>
#include <stack>
#include <vector>

void printLine(const std::vector<int>& v) {
    for (std::size_t i = 0; i < v.size(); ++i) std::cout << (i ? " " : "") << v[i];
    std::cout << "\n";
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n;
    std::cin >> n;
    std::vector<int> val(n), left(n), right(n);
    for (int i = 0; i < n; ++i) std::cin >> val[i] >> left[i] >> right[i];
    for (int i = 0; i < n; ++i) {
        for (int c : {left[i], right[i]}) {
            if (c != -1 && (c < 0 || c >= n)) {
                std::cout << "Invalid\n";
                return 0;
            }
        }
    }

    std::vector<int> pre, in, post, level;
    std::stack<int> st;
    st.push(0);
    while (!st.empty()) {  // 前序：先放右、再放左
        int u = st.top();
        st.pop();
        pre.push_back(val[u]);
        if (right[u] != -1) st.push(right[u]);
        if (left[u] != -1) st.push(left[u]);
    }

    int cur = 0;
    while (cur != -1 || !st.empty()) {  // 中序：一路往左
        while (cur != -1) {
            st.push(cur);
            cur = left[cur];
        }
        cur = st.top();
        st.pop();
        in.push_back(val[cur]);
        cur = right[cur];
    }

    st.push(0);
    while (!st.empty()) {  // 根、右、左，最後反轉成後序
        int u = st.top();
        st.pop();
        post.push_back(val[u]);
        if (left[u] != -1) st.push(left[u]);
        if (right[u] != -1) st.push(right[u]);
    }
    std::reverse(post.begin(), post.end());

    std::queue<int> q;
    q.push(0);
    while (!q.empty()) {  // 層序
        int u = q.front();
        q.pop();
        level.push_back(val[u]);
        if (left[u] != -1) q.push(left[u]);
        if (right[u] != -1) q.push(right[u]);
    }

    printLine(pre);
    printLine(in);
    printLine(post);
    printLine(level);
    return 0;
}`,
        Python: code`import sys
from collections import deque


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    val = [int(x) for x in data[1:3 * n + 1:3]]
    left = [int(x) for x in data[2:3 * n + 1:3]]
    right = [int(x) for x in data[3:3 * n + 1:3]]
    if any(c != -1 and not 0 <= c < n for c in left + right):
        print("Invalid")
        return

    pre, stack = [], [0]
    while stack:  # 前序：先放右、再放左
        u = stack.pop()
        pre.append(val[u])
        if right[u] != -1:
            stack.append(right[u])
        if left[u] != -1:
            stack.append(left[u])

    ino, cur = [], 0
    while cur != -1 or stack:  # 中序：一路往左
        while cur != -1:
            stack.append(cur)
            cur = left[cur]
        cur = stack.pop()
        ino.append(val[cur])
        cur = right[cur]

    post, stack = [], [0]
    while stack:  # 根、右、左，最後反轉成後序
        u = stack.pop()
        post.append(val[u])
        if left[u] != -1:
            stack.append(left[u])
        if right[u] != -1:
            stack.append(right[u])
    post.reverse()

    level, queue = [], deque([0])
    while queue:  # 層序
        u = queue.popleft()
        level.append(val[u])
        for c in (left[u], right[u]):
            if c != -1:
                queue.append(c)

    print("\n".join(" ".join(map(str, seq)) for seq in (pre, ino, post, level)))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Queue;
import java.util.StringTokenizer;

public class Main {
    static String join(int[] v) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < v.length; i++) {
            if (i > 0) sb.append(' ');
            sb.append(v[i]);
        }
        return sb.toString();
    }

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        int[] val = new int[n], left = new int[n], right = new int[n];
        for (int i = 0; i < n; i++) {
            StringTokenizer st = new StringTokenizer(br.readLine());
            val[i] = Integer.parseInt(st.nextToken());
            left[i] = Integer.parseInt(st.nextToken());
            right[i] = Integer.parseInt(st.nextToken());
        }
        for (int i = 0; i < n; i++) {
            for (int c : new int[] {left[i], right[i]}) {
                if (c != -1 && (c < 0 || c >= n)) {
                    System.out.println("Invalid");
                    return;
                }
            }
        }

        int[] pre = new int[n], in = new int[n], post = new int[n], level = new int[n];
        int k = 0;
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(0);
        while (!stack.isEmpty()) {  // 前序：先放右、再放左
            int u = stack.pop();
            pre[k++] = val[u];
            if (right[u] != -1) stack.push(right[u]);
            if (left[u] != -1) stack.push(left[u]);
        }

        k = 0;
        int cur = 0;
        while (cur != -1 || !stack.isEmpty()) {  // 中序：一路往左
            while (cur != -1) {
                stack.push(cur);
                cur = left[cur];
            }
            cur = stack.pop();
            in[k++] = val[cur];
            cur = right[cur];
        }

        k = n;
        stack.push(0);
        while (!stack.isEmpty()) {  // 根、右、左，從陣列尾端往前填，就是反轉後的後序
            int u = stack.pop();
            post[--k] = val[u];
            if (left[u] != -1) stack.push(left[u]);
            if (right[u] != -1) stack.push(right[u]);
        }

        k = 0;
        Queue<Integer> queue = new ArrayDeque<>();
        queue.offer(0);
        while (!queue.isEmpty()) {  // 層序
            int u = queue.poll();
            level[k++] = val[u];
            if (left[u] != -1) queue.offer(left[u]);
            if (right[u] != -1) queue.offer(right[u]);
        }

        System.out.println(join(pre) + "\n" + join(in) + "\n" + join(post) + "\n" + join(level));
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = data[0];
const val = [], left = [], right = [];
for (let i = 0; i < n; i++) {
    val.push(data[1 + 3 * i]);
    left.push(data[2 + 3 * i]);
    right.push(data[3 + 3 * i]);
}
const bad = c => c !== -1 && (c < 0 || c >= n);
if (left.some(bad) || right.some(bad)) {
    console.log("Invalid");
} else {
    const pre = [], ino = [], post = [], level = [];
    let stack = [0];
    while (stack.length > 0) {  // 前序：先放右、再放左
        const u = stack.pop();
        pre.push(val[u]);
        if (right[u] !== -1) stack.push(right[u]);
        if (left[u] !== -1) stack.push(left[u]);
    }

    let cur = 0;
    while (cur !== -1 || stack.length > 0) {  // 中序：一路往左
        while (cur !== -1) {
            stack.push(cur);
            cur = left[cur];
        }
        cur = stack.pop();
        ino.push(val[cur]);
        cur = right[cur];
    }

    stack = [0];
    while (stack.length > 0) {  // 根、右、左，最後反轉成後序
        const u = stack.pop();
        post.push(val[u]);
        if (left[u] !== -1) stack.push(left[u]);
        if (right[u] !== -1) stack.push(right[u]);
    }
    post.reverse();

    const queue = [0];  // 層序：陣列加上 head 索引當佇列
    for (let head = 0; head < queue.length; head++) {
        const u = queue[head];
        level.push(val[u]);
        if (left[u] !== -1) queue.push(left[u]);
        if (right[u] !== -1) queue.push(right[u]);
    }

    console.log([pre, ino, post, level].map(seq => seq.join(" ")).join("\n"));
}`,
      },
      judge: 'none',
    },
  ],
};

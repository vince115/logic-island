import type { LessonContent, TraceStep } from '../schema';

const code = String.raw;

/** The trace's tree as children lists: 0 has children 1, 2, 3; 1 has 4, 5; 3 has 6. */
const vizChildren: number[][] = [[1, 2, 3], [4, 5], [], [6], [], [], []];

/**
 * Steps of height(0) on vizChildren, produced by really running the recursion below (the simulators do not cover
 * general trees), so the frames, returned values and marks cannot disagree with the tree.
 */
function heightSteps(): TraceStep[] {
  const steps: TraceStep[] = [];
  const done = new Map<number, number>();
  type Frame = { u: number; best?: number; c?: number; returns?: number };
  const stack: Frame[] = [];
  const frameVars = (f: Frame): Record<string, string> => ({
    u: String(f.u),
    ...(f.best !== undefined ? { best: String(f.best) } : {}),
    ...(f.c !== undefined ? { c: String(f.c) } : {}),
  });
  const emit = (line: number, note: string, current?: number, output?: string) => {
    const top = stack.at(-1);
    steps.push({
      line, note,
      vars: top ? frameVars(top) : { children: '[[1, 2, 3], [4, 5], [], [6], [], [], []]' },
      tree: {
        name: 'children', roots: ['n0'],
        nodes: vizChildren.map((cs, i) => ({ id: `n${i}`, label: String(i), children: cs.map(c => `n${c}`) })),
        marks: [
          ...(current !== undefined ? [{ id: `n${current}`, kind: 'current' as const }] : []),
          ...[...done.keys()].filter(i => i !== current).map(i => ({ id: `n${i}`, kind: 'visited' as const })),
        ],
      },
      frames: [{ name: 'main', vars: {} }, ...stack.map(f => ({
        name: `height(${f.u})`, vars: frameVars(f), ...(f.returns !== undefined ? { returns: String(f.returns) } : {}),
      }))],
      ...(output !== undefined ? { output } : {}),
    });
  };
  const visit = (u: number, from?: number): number => {
    const frame: Frame = { u };
    stack.push(frame);
    const call = from === undefined
      ? '主程式在第 11 行呼叫 `height(0)`，從根開始。'
      : '`height(' + from + ')` 在第 8 行呼叫 `height(' + u + ')`，自己先暫停，等這個孩子回傳。';
    const kids = vizChildren[u];
    if (!kids.length) {
      frame.returns = 0;
      emit(5, call + '`children[' + u + ']` 是空的，節點 ' + u + ' 是葉子：碰到終止條件，直接回傳 0（單一節點的高度是 0）。', u);
      stack.pop();
      done.set(u, 0);
      return 0;
    }
    frame.best = 0;
    emit(6, call + '節點 ' + u + ' 有 ' + kids.length + ' 個孩子（' + kids.join('、') + '），不是葉子；`best` 先設為 0，接著逐一計算每個孩子的高度。', u);
    kids.forEach((c, i) => {
      frame.c = c;
      const h = visit(c, u);
      const before = frame.best!;
      frame.best = Math.max(before, h);
      const next = i + 1 < kids.length ? '下一個孩子是 ' + kids[i + 1] + '。' : '孩子都算完了。';
      emit(8, '回到 `height(' + u + ')`：`height(' + c + ')` 回傳 ' + h + '，`best = max(' + before + ', ' + h + ') = ' + frame.best + '`。' + next, u);
    });
    frame.returns = frame.best + 1;
    emit(9, '`height(' + u + ')` 回傳 `best + 1 = ' + frame.returns + '`：比最高的孩子多一條邊（從 ' + u + ' 走到那個孩子的邊）。', u);
    stack.pop();
    done.set(u, frame.returns);
    return frame.returns;
  };
  emit(1, '`children[u]` 列出節點 u 的孩子（子節點清單）。根是 0，節點 2、4、5、6 沒有孩子，是葉子。接下來用遞迴算整棵樹的高度。');
  const h = visit(0);
  emit(11, '主程式拿到 ' + h + ' 並輸出：樹的高度就是根的高度，最長的根到葉路徑（例如 0→1→4）有 ' + h + ' 條邊。每個節點只被算一次，所以是 O(n)；呼叫堆疊最深時有「高度 + 1」層，樹若是一條很長的鏈，堆疊就會很深。', undefined, String(h));
  return steps;
}

const chain2000 = '2000\n-1 ' + Array.from({ length: 1999 }, (_, i) => i).join(' ');

/**
 * D11 Tree basics. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); BFS queues are arrays with a head index (no shift()).
 */
export const D11: LessonContent = {
  lessonId: 'D11',
  motivation: '電腦裡的資料夾、公司的組織圖、網頁的 HTML 結構、遊戲的多層選單，都是「一層包一層」的階層資料。陣列與串列只能表達「前一個、後一個」的順序，表達不了「一個主管底下有好幾個部屬、部屬底下又有部屬」。樹（tree）就是為階層而生的結構：每個節點可以有很多孩子，但只有一個父節點。學會樹，接下來的二元樹、走訪、二元搜尋樹與堆積才有共同的語言。它的限制是：每個節點只能有一個父節點、也不能有環，所以像「朋友關係」或「捷運路線」這種多對多、會繞回來的關係，要用圖（graph，D16）。',
  sections: [
    {
      id: 'what-is-tree', title: '什麼是樹：一個根，其餘各有一個父節點',
      blocks: [
        { type: 'p', text: '一棵有根樹（rooted tree）由節點（node）和連接節點的邊（edge）組成，並滿足三件事：' },
        { type: 'list', items: [
          '有一個特別的節點叫做根（root），它沒有父節點。',
          '除了根以外，每個節點都恰好有一個父節點（parent）。',
          '沒有環（cycle）：從任何節點一路往父節點走，最後一定會走到根，不會繞回自己。',
        ] },
        { type: 'p', text: '因為每個非根節點都恰好用一條邊連到它的父節點，所以有 n 個節點的樹一定有 n − 1 條邊。反過來，如果一個連通的結構有 n 個節點卻有 n 條以上的邊，裡面一定有環，就不是樹。好幾棵互不相連的樹放在一起，稱為森林（forest）。' },
        { type: 'p', text: '生活中的樹：' },
        { type: 'list', items: [
          '資料夾：家目錄底下有 docs、code 等資料夾，資料夾裡還有檔案與子資料夾。每個檔案只放在一個資料夾裡。',
          '組織圖：總經理是根，每位員工只有一位直屬主管。',
          'HTML DOM：`<html>` 是根，底下有 `<head>` 與 `<body>`，`<body>` 裡再包 `<div>`、`<p>` 等元素。',
          '遊戲選單：主選單 → 設定 → 音效／畫面，每個子選單只從一個上層選單進入。',
        ] },
        { type: 'p', text: '在程式裡，通常把節點編號成 0 到 n − 1。本課大部分例子用同一棵 8 個節點的樹：0 是根，0 的孩子是 1、2、3；1 的孩子是 4、5；3 的孩子是 6；6 的孩子是 7。' },
      ],
    },
    {
      id: 'terms', title: '名詞：父子、兄弟、葉、子樹、深度與高度',
      blocks: [
        { type: 'table', head: ['名詞', '意思', '在本課的 8 節點樹中'], rows: [
          ['根（root）', '沒有父節點的節點', '0'],
          ['父節點（parent）／子節點（child）', '有邊相連、靠近根的是父，另一個是子', '6 的父節點是 3；1 的孩子是 4、5'],
          ['兄弟（sibling）', '父節點相同的節點', '1、2、3 互為兄弟；4、5 互為兄弟'],
          ['葉子（leaf）', '沒有孩子的節點', '2、4、5、7'],
          ['內部節點（internal node）', '至少有一個孩子的節點', '0、1、3、6'],
          ['子樹（subtree）', '某個節點加上它所有的子孫', '以 3 為根的子樹是 {3, 6, 7}'],
          ['深度（depth）', '從根走到該節點經過的邊數，根的深度是 0', '7 的深度是 3（0→3→6→7）'],
          ['高度（height）', '從該節點往下走到最遠的葉子經過的邊數', '3 的高度是 2；整棵樹的高度是 3'],
        ] },
        { type: 'p', text: '深度是「往上數到根」，高度是「往下數到最遠的葉子」。整棵樹的高度等於根的高度，也等於所有節點中最大的深度。每個葉子的高度都是 0，但葉子的深度不一定相同：本例的 2 深度是 1，7 深度是 3。' },
        { type: 'callout', tone: 'note', title: '本課的高度用「邊數」計算', text: '本課（以及後面的樹課程）一律以邊數計：單一節點的高度是 0，一條 0→1→2 的鏈高度是 2。有些書以「節點數」計，單一節點的高度是 1，算出來會比本課多 1；這種定義下空樹的高度是 0，而以邊數計時，有些教材把空樹的高度定為 −1。看題目或考卷時，先確認它用哪一種定義。' },
        { type: 'p', text: '一個節點有幾個孩子稱為它的分支度（degree，有些書稱為度數）；本例 0 的分支度是 3。本課的樹沒有限制孩子數量，稱為一般樹（general tree）；下一課 D12 的二元樹（binary tree）規定每個節點最多兩個孩子，並且分成左孩子與右孩子。' },
      ],
    },
    {
      id: 'representations', title: '把樹存進程式：三種表示法',
      blocks: [
        { type: 'p', text: '父節點陣列（parent array）：`parent[i]` 存節點 i 的父節點，根存 −1。只要 n 個整數，很多題目的輸入就是這個格式。要往上找父節點很快，但要列出某個節點的孩子，得掃過整個陣列。' },
        { type: 'p', text: '子節點清單（children lists）：每個節點一個清單，存它的孩子。C++ 用 `std::vector<std::vector<int>>`，Python 用 list of lists，Java 用 `List<List<Integer>>`，JavaScript 用陣列的陣列。要從根往下走訪整棵樹，用這個最方便。從父節點陣列建立子節點清單只要掃一次：對每個非根節點 v，把 v 加進 `children[parent[v]]`。' },
        { type: 'example', id: 'build-children' },
        { type: 'callout', tone: 'warning', title: 'Python 的 `[[]] * n` 會讓所有節點共用同一個清單', text: '`children = [[]] * n` 只建立了一個空 list，再把同一個參考（reference）複製 n 次；之後 `children[0].append(1)` 會讓每個 `children[i]` 都看到 1。要寫 `[[] for _ in range(n)]`，每個節點各建一個新的 list。Java 的 `Collections.nCopies(n, new ArrayList<Integer>())` 也是同一個陷阱，要用迴圈各自 `new ArrayList<>()`；JavaScript 的 `new Array(n).fill([])` 同樣只有一個共用的陣列，要寫 `Array.from({ length: n }, () => [])`。C++ 的 `std::vector<std::vector<int>> children(n)` 是值語意（value semantics），n 個內層 vector 彼此獨立，沒有這個問題。' },
        { type: 'p', text: '節點物件（node object）：每個節點是一個物件，裡面存資料與孩子的清單。這最接近資料夾、DOM 的真實樣子，節點可以存名字等任意資料。Python、Java 與 JavaScript 的變數存的是物件的參考，`children` 裡放的是參考，不會複製整棵子樹；沒有孩子時清單是空的，而指向「沒有節點」的參考是 `None`／`null`（Java 與 JavaScript 都是 `null`；C++ 是 `nullptr`）。' },
        { type: 'example', id: 'node-objects' },
        { type: 'p', text: 'C++ 要多想一件事：誰負責釋放節點（所有權，ownership）。例子用 `std::vector<std::unique_ptr<Node>>`，父節點擁有孩子，根被銷毀時整棵樹會自動釋放。`add` 回傳的 `Node*` 只是借用，不負責釋放。如果改成 `std::vector<Node>` 直接存孩子，`push_back` 讓 vector 重新配置記憶體時，先前拿到的指標會失效（iterator／pointer invalidation）；`unique_ptr` 版本搬動的只是指標，節點本身不動，所以 `docs` 仍然有效。另一種常見做法是把所有節點放在一個 vector 裡、用編號互相指，就像子節點清單。' },
        { type: 'table', head: ['操作', '父節點陣列', '子節點清單', '節點物件（存孩子）'], rows: [
          ['找 v 的父節點', 'O(1)：`parent[v]`', 'O(n)：要找誰的清單裡有 v（除非另存 parent）', 'O(n)：同左（除非另存父指標）'],
          ['列出 v 的孩子', 'O(n)：掃整個陣列', 'O(v 的孩子數)', 'O(v 的孩子數)'],
          ['找根', 'O(n)：找值是 −1 的位置', '要另外記住（或由父節點陣列求出）', '通常直接持有根的參考，O(1)'],
          ['走訪整棵樹', '先轉成子節點清單，O(n)', 'O(n)', 'O(n)'],
          ['空間', 'n 個整數', 'n 個清單，共 n − 1 個元素', 'n 個物件加上參考／指標'],
        ] },
      ],
    },
    {
      id: 'recursion', title: '用遞迴計算：子樹大小、高度與每個節點的深度',
      blocks: [
        { type: 'p', text: '樹的定義本身就是遞迴的：一個節點加上它每個孩子的子樹。所以很多量都能寫成「先算出每個孩子，再合併」（F18 的遞迴）：' },
        { type: 'list', items: [
          '子樹大小：`size(u) = 1 + 所有孩子的 size(c) 總和`。葉子的大小是 1。根的子樹大小就是整棵樹的節點數。',
          '高度：葉子是 0（終止條件）；否則 `height(u) = 1 + 所有孩子 height(c) 的最大值`。',
          '深度：方向相反，由父往子傳。`depth(根) = 0`，`depth(c) = depth(u) + 1`。',
        ] },
        { type: 'example', id: 'height-size' },
        { type: 'p', text: '每個節點只被呼叫一次，每條邊只被走過一次，所以三個計算都是 O(n) 時間。遞迴另外需要呼叫堆疊（call stack）的空間：最深時同時有「從根到目前節點」那麼多層，也就是 O(高度)。下方的視覺化逐步追蹤 `height(0)`：每次呼叫都是一層新的框（frame），葉子立刻回傳 0，父節點收齊孩子的結果後才回傳。' },
        { type: 'callout', tone: 'warning', title: '很深的樹會讓遞迴爆掉', text: '如果樹是一條 10^5 個節點的鏈，遞迴就要疊 10^5 層。Python 預設的遞迴深度上限大約是 1000（`sys.getrecursionlimit()`），超過就丟出 `RecursionError`；用 `sys.setrecursionlimit` 調高，仍可能因為真正的堆疊用完而讓直譯器當掉。C++ 與 Java 的呼叫堆疊大小有限（依系統與設定而定），太深時 C++ 可能直接當掉（stack overflow），Java 丟出 `StackOverflowError`，JavaScript（Node.js）丟出 `RangeError: Maximum call stack size exceeded`。題目的 n 很大、樹又可能退化成鏈時，改用迭代：用佇列做 BFS 或自己維護一個堆疊。' },
        { type: 'p', text: '迭代的做法：從根開始用佇列（D06）一層一層處理，處理 u 時把每個孩子的深度設成 `depth[u] + 1` 再放進佇列。這樣得到的處理順序（BFS 順序）有個好性質：父節點一定排在孩子前面。把這個順序倒過來走，每個節點都在孩子之後才被處理，就能不用遞迴算出子樹大小與高度。下面的例子同時處理小樹與一條 100000 個節點的鏈，完全沒有遞迴深度的問題。' },
        { type: 'example', id: 'depths-bfs' },
      ],
    },
    {
      id: 'compare', title: '樹、串列與圖的比較',
      blocks: [
        { type: 'table', head: ['', '鏈結串列（D04）', '樹', '圖（D16）'], rows: [
          ['每個節點往前', '最多 1 個前一個節點', '最多 1 個父節點（根沒有）', '不限'],
          ['每個節點往後', '最多 1 個下一個節點', '任意多個孩子', '不限'],
          ['可以有環嗎', '不行（一般的單向串列）', '不行', '可以'],
          ['n 個節點的邊數', 'n − 1', 'n − 1', '不固定（有向或無向、可多可少）'],
          ['典型用途', '依序排列的資料', '階層：資料夾、組織圖、DOM', '網路、地圖、社群關係'],
        ] },
        { type: 'p', text: '串列可以看成每個節點最多一個孩子的樹（也就是一條鏈）；樹則是連通且沒有環的圖。所以三者是一個比一個寬鬆：需要「一個接一個」用串列或陣列，需要「一層包一層」用樹，關係是多對多或會繞回來就用圖。' },
        { type: 'p', text: '接下來：D12 二元樹限制每個節點最多兩個孩子並分左右；D13 學前序、中序、後序與層序走訪；D14 的二元搜尋樹利用「左小右大」快速搜尋。本課的高度、深度與 n − 1 條邊在這些課都會繼續用到。' },
      ],
    },
  ],
  examples: [
    {
      id: 'build-children', title: '由父節點陣列建立子節點清單', description: '掃一次父節點陣列：根的父節點是 −1，其他節點加進父節點的清單，最後印出每個節點的孩子。',
      output: 'root: 0\n0: 1 2 3\n1: 4 5\n2:\n3: 6\n4:\n5:\n6: 7\n7:',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    std::vector<int> parent = {-1, 0, 0, 0, 1, 1, 3, 6};
    int n = static_cast<int>(parent.size());
    std::vector<std::vector<int>> children(n);
    int root = -1;
    for (int v = 0; v < n; ++v) {
        if (parent[v] == -1) root = v;
        else children[parent[v]].push_back(v);
    }
    std::cout << "root: " << root << "\n";
    for (int v = 0; v < n; ++v) {
        std::cout << v << ":";
        for (int c : children[v]) std::cout << " " << c;
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`parent = [-1, 0, 0, 0, 1, 1, 3, 6]
n = len(parent)
children = [[] for _ in range(n)]  # 不能寫成 [[]] * n
root = -1
for v in range(n):
    if parent[v] == -1:
        root = v
    else:
        children[parent[v]].append(v)
print("root:", root)
for v in range(n):
    print(f"{v}:", *children[v])`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        int[] parent = {-1, 0, 0, 0, 1, 1, 3, 6};
        int n = parent.length;
        List<List<Integer>> children = new ArrayList<>();
        for (int v = 0; v < n; v++) children.add(new ArrayList<>());
        int root = -1;
        for (int v = 0; v < n; v++) {
            if (parent[v] == -1) root = v;
            else children.get(parent[v]).add(v);
        }
        System.out.println("root: " + root);
        for (int v = 0; v < n; v++) {
            StringBuilder line = new StringBuilder(v + ":");
            for (int c : children.get(v)) line.append(" ").append(c);
            System.out.println(line);
        }
    }
}`,
        JavaScript: code`const parent = [-1, 0, 0, 0, 1, 1, 3, 6];
const n = parent.length;
const children = Array.from({ length: n }, () => []);  // 不能寫成 new Array(n).fill([])
let root = -1;
for (let v = 0; v < n; v++) {
    if (parent[v] === -1) root = v;
    else children[parent[v]].push(v);
}
console.log("root: " + root);
for (let v = 0; v < n; v++) {
    console.log([v + ":", ...children[v]].join(" "));
}`,
      },
    },
    {
      id: 'node-objects', title: '節點物件：一棵資料夾樹', description: '每個節點存名字與孩子清單，用遞迴依深度縮排印出整棵樹。',
      output: 'home\n  docs\n    notes.txt\n    plan.txt\n  code\n    main.py\n  photo.png',
      code: {
        'C++': code`#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>

struct Node {
    std::string name;
    std::vector<std::unique_ptr<Node>> children;  // 父節點擁有孩子
    explicit Node(std::string n) : name(std::move(n)) {}
    Node* add(const std::string& childName) {
        children.push_back(std::make_unique<Node>(childName));
        return children.back().get();  // 借用的指標，不負責釋放
    }
};

void show(const Node* u, int depth) {
    std::cout << std::string(depth * 2, ' ') << u->name << "\n";
    for (const auto& c : u->children) show(c.get(), depth + 1);
}

int main() {
    Node root("home");
    Node* docs = root.add("docs");
    Node* code = root.add("code");
    root.add("photo.png");
    docs->add("notes.txt");
    docs->add("plan.txt");
    code->add("main.py");
    show(&root, 0);
    return 0;
}`,
        Python: code`class Node:
    def __init__(self, name):
        self.name = name
        self.children = []

    def add(self, name):
        child = Node(name)
        self.children.append(child)
        return child


def show(u, depth):
    print("  " * depth + u.name)
    for c in u.children:
        show(c, depth + 1)


root = Node("home")
docs = root.add("docs")
code = root.add("code")
root.add("photo.png")
docs.add("notes.txt")
docs.add("plan.txt")
code.add("main.py")
show(root, 0)`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static class Node {
        String name;
        List<Node> children = new ArrayList<>();

        Node(String name) {
            this.name = name;
        }

        Node add(String childName) {
            Node child = new Node(childName);
            children.add(child);
            return child;
        }
    }

    static void show(Node u, int depth) {
        System.out.println("  ".repeat(depth) + u.name);
        for (Node c : u.children) show(c, depth + 1);
    }

    public static void main(String[] args) {
        Node root = new Node("home");
        Node docs = root.add("docs");
        Node code = root.add("code");
        root.add("photo.png");
        docs.add("notes.txt");
        docs.add("plan.txt");
        code.add("main.py");
        show(root, 0);
    }
}`,
        JavaScript: code`class Node {
    constructor(name) {
        this.name = name;
        this.children = [];
    }

    add(childName) {
        const child = new Node(childName);
        this.children.push(child);
        return child;
    }
}

function show(u, depth) {
    console.log("  ".repeat(depth) + u.name);
    for (const c of u.children) show(c, depth + 1);
}

const root = new Node("home");
const docs = root.add("docs");
const code = root.add("code");
root.add("photo.png");
docs.add("notes.txt");
docs.add("plan.txt");
code.add("main.py");
show(root, 0);`,
      },
    },
    {
      id: 'height-size', title: '遞迴算高度與子樹大小', description: '對 8 節點樹用遞迴算出樹的高度，以及每個節點的子樹大小。',
      output: 'height: 3\nsizes: 8 3 1 3 1 1 2 1',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

const std::vector<std::vector<int>> children = {{1, 2, 3}, {4, 5}, {}, {6}, {}, {}, {7}, {}};

int height(int u) {
    if (children[u].empty()) return 0;  // 葉子：高度 0
    int best = 0;
    for (int c : children[u]) best = std::max(best, height(c));
    return best + 1;
}

int subtreeSize(int u) {
    int total = 1;  // 自己
    for (int c : children[u]) total += subtreeSize(c);
    return total;
}

int main() {
    std::cout << "height: " << height(0) << "\n";
    std::cout << "sizes:";
    for (int u = 0; u < static_cast<int>(children.size()); ++u) std::cout << " " << subtreeSize(u);
    std::cout << "\n";
    return 0;
}`,
        Python: code`children = [[1, 2, 3], [4, 5], [], [6], [], [], [7], []]


def height(u):
    if not children[u]:
        return 0  # 葉子：高度 0
    return 1 + max(height(c) for c in children[u])


def size(u):
    return 1 + sum(size(c) for c in children[u])  # 自己加上所有子樹


print("height:", height(0))
print("sizes:", *(size(u) for u in range(len(children))))`,
        Java: code`public class Main {
    static final int[][] children = {{1, 2, 3}, {4, 5}, {}, {6}, {}, {}, {7}, {}};

    static int height(int u) {
        if (children[u].length == 0) return 0;  // 葉子：高度 0
        int best = 0;
        for (int c : children[u]) best = Math.max(best, height(c));
        return best + 1;
    }

    static int subtreeSize(int u) {
        int total = 1;  // 自己
        for (int c : children[u]) total += subtreeSize(c);
        return total;
    }

    public static void main(String[] args) {
        System.out.println("height: " + height(0));
        StringBuilder sizes = new StringBuilder("sizes:");
        for (int u = 0; u < children.length; u++) sizes.append(" ").append(subtreeSize(u));
        System.out.println(sizes);
    }
}`,
        JavaScript: code`const children = [[1, 2, 3], [4, 5], [], [6], [], [], [7], []];

function height(u) {
    if (children[u].length === 0) return 0;  // 葉子：高度 0
    let best = 0;
    for (const c of children[u]) best = Math.max(best, height(c));
    return best + 1;
}

function subtreeSize(u) {
    let total = 1;  // 自己
    for (const c of children[u]) total += subtreeSize(c);
    return total;
}

console.log("height: " + height(0));
console.log("sizes: " + children.map((_, u) => subtreeSize(u)).join(" "));`,
      },
    },
    {
      id: 'depths-bfs', title: '不用遞迴：BFS 求深度，倒序求子樹大小', description: '用佇列由根往下算每個節點的深度；把 BFS 順序倒過來累加子樹大小。最後對一條 100000 個節點的鏈求高度，不會有遞迴深度的問題。',
      output: 'order: 0 1 2 3 4 5 6 7\ndepth: 0 1 1 1 2 2 2 3\nsize: 8 3 1 3 1 1 2 1\nchain height: 99999',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <queue>
#include <vector>

// 由父節點陣列算出 BFS 順序與每個節點的深度（不用遞迴）
void bfs(const std::vector<int>& parent, std::vector<int>& order, std::vector<int>& depth) {
    int n = static_cast<int>(parent.size()), root = 0;
    std::vector<std::vector<int>> children(n);
    for (int v = 0; v < n; ++v) {
        if (parent[v] == -1) root = v;
        else children[parent[v]].push_back(v);
    }
    order.clear();
    depth.assign(n, 0);
    std::queue<int> q;
    q.push(root);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        order.push_back(u);
        for (int c : children[u]) {
            depth[c] = depth[u] + 1;
            q.push(c);
        }
    }
}

int main() {
    std::vector<int> parent = {-1, 0, 0, 0, 1, 1, 3, 6}, order, depth;
    bfs(parent, order, depth);
    std::vector<int> size(parent.size(), 1);
    for (auto it = order.rbegin(); it != order.rend(); ++it) {  // 倒序：孩子先算完
        if (parent[*it] != -1) size[parent[*it]] += size[*it];
    }
    std::cout << "order:";
    for (int u : order) std::cout << " " << u;
    std::cout << "\ndepth:";
    for (int d : depth) std::cout << " " << d;
    std::cout << "\nsize:";
    for (int s : size) std::cout << " " << s;
    std::cout << "\n";
    std::vector<int> chain(100000);  // 0 ← 1 ← 2 ← … 的一條鏈
    for (int i = 0; i < 100000; ++i) chain[i] = i - 1;
    bfs(chain, order, depth);
    std::cout << "chain height: " << *std::max_element(depth.begin(), depth.end()) << "\n";
    return 0;
}`,
        Python: code`from collections import deque


def bfs(parent):
    n = len(parent)
    children = [[] for _ in range(n)]
    for v, p in enumerate(parent):
        if p != -1:
            children[p].append(v)
    depth = [0] * n
    order = []
    queue = deque([parent.index(-1)])
    while queue:
        u = queue.popleft()
        order.append(u)
        for c in children[u]:
            depth[c] = depth[u] + 1
            queue.append(c)
    return order, depth


parent = [-1, 0, 0, 0, 1, 1, 3, 6]
order, depth = bfs(parent)
size = [1] * len(parent)
for u in reversed(order):  # 倒序：孩子先算完
    if parent[u] != -1:
        size[parent[u]] += size[u]
print("order:", *order)
print("depth:", *depth)
print("size:", *size)
chain = [-1] + list(range(99999))  # 0 ← 1 ← 2 ← … 的一條鏈
print("chain height:", max(bfs(chain)[1]))`,
        Java: code`import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

public class Main {
    // 回傳 {BFS 順序, 每個節點的深度}（不用遞迴）
    static int[][] bfs(int[] parent) {
        int n = parent.length, root = 0;
        List<List<Integer>> children = new ArrayList<>();
        for (int v = 0; v < n; v++) children.add(new ArrayList<>());
        for (int v = 0; v < n; v++) {
            if (parent[v] == -1) root = v;
            else children.get(parent[v]).add(v);
        }
        int[] order = new int[n], depth = new int[n];
        int k = 0;
        ArrayDeque<Integer> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            int u = queue.poll();
            order[k++] = u;
            for (int c : children.get(u)) {
                depth[c] = depth[u] + 1;
                queue.add(c);
            }
        }
        return new int[][] {order, depth};
    }

    static String join(int[] a) {
        StringBuilder sb = new StringBuilder();
        for (int x : a) sb.append(" ").append(x);
        return sb.toString();
    }

    public static void main(String[] args) {
        int[] parent = {-1, 0, 0, 0, 1, 1, 3, 6};
        int[][] r = bfs(parent);
        int[] size = new int[parent.length];
        java.util.Arrays.fill(size, 1);
        for (int i = r[0].length - 1; i >= 0; i--) {  // 倒序：孩子先算完
            int u = r[0][i];
            if (parent[u] != -1) size[parent[u]] += size[u];
        }
        System.out.println("order:" + join(r[0]));
        System.out.println("depth:" + join(r[1]));
        System.out.println("size:" + join(size));
        int[] chain = new int[100000];  // 0 ← 1 ← 2 ← … 的一條鏈
        for (int i = 0; i < chain.length; i++) chain[i] = i - 1;
        int best = 0;
        for (int d : bfs(chain)[1]) best = Math.max(best, d);
        System.out.println("chain height: " + best);
    }
}`,
        JavaScript: code`// 由父節點陣列算出 BFS 順序與每個節點的深度（不用遞迴）
function bfs(parent) {
    const n = parent.length;
    const children = Array.from({ length: n }, () => []);
    let root = 0;
    for (let v = 0; v < n; v++) {
        if (parent[v] === -1) root = v;
        else children[parent[v]].push(v);
    }
    const depth = new Array(n).fill(0);
    const queue = [root];  // 陣列當佇列：head 指向下一個要處理的位置
    let head = 0;
    while (head < queue.length) {
        const u = queue[head++];
        for (const c of children[u]) {
            depth[c] = depth[u] + 1;
            queue.push(c);
        }
    }
    return { order: queue, depth };  // 佇列裡依序放的就是 BFS 順序
}

const parent = [-1, 0, 0, 0, 1, 1, 3, 6];
const { order, depth } = bfs(parent);
const size = new Array(parent.length).fill(1);
for (let i = order.length - 1; i >= 0; i--) {  // 倒序：孩子先算完
    const u = order[i];
    if (parent[u] !== -1) size[parent[u]] += size[u];
}
console.log("order: " + order.join(" "));
console.log("depth: " + depth.join(" "));
console.log("size: " + size.join(" "));
const chain = Array.from({ length: 100000 }, (_, i) => i - 1);  // 0 ← 1 ← 2 ← … 的一條鏈
let best = 0;
for (const d of bfs(chain).depth) best = Math.max(best, d);
console.log("chain height: " + best);`,
      },
    },
  ],
  visualization: {
    kind: 'tree-traversal', title: '遞迴計算一般樹的高度', language: 'Python',
    code: code`children = [[1, 2, 3], [4, 5], [], [6], [], [], []]

def height(u):
    if not children[u]:
        return 0
    best = 0
    for c in children[u]:
        best = max(best, height(c))
    return best + 1

print(height(0))`,
    steps: heightSteps(),
  },
  quiz: [
    {
      id: 'q-terms', prompt: '一棵樹的父節點陣列是 `parent = [-1, 0, 0, 1, 1, 2, 5]`（根的父節點是 −1）。它的葉子數、節點 6 的深度、整棵樹的高度分別是多少？（深度與高度都以邊數計）',
      options: ['3 個葉子、深度 3、高度 3', '3 個葉子、深度 4、高度 4', '1 個葉子、深度 3、高度 3', '3 個葉子、深度 3、高度 2'],
      answer: 0, explanation: '孩子關係：0 → 1、2；1 → 3、4；2 → 5；5 → 6。沒有孩子的是 3、4、6，共 3 個葉子。6 的路徑是 0→2→5→6，3 條邊，深度 3；最深的節點就是 6，所以樹高也是 3。「深度 4、高度 4」是數節點而不是數邊；「1 個葉子」誤以為只有最底層才算葉子，其實 3、4 雖然只在深度 2，也沒有孩子；「高度 2」只看了 0→1→3 這一邊。',
    },
    {
      id: 'q-edges', prompt: '某個輸入宣稱描述一棵 10 個節點的樹，卻給了 10 條邊，而且所有節點彼此連通。可以得出什麼結論？',
      options: ['它是樹，只是根有兩條邊', '它不是樹：10 個節點連通卻有 10 條邊，一定有環', '只要畫成一條鏈就是樹', '它是由兩棵樹組成的森林'],
      answer: 1, explanation: '每個非根節點恰好用一條邊連到父節點，所以 n 個節點的樹恰好有 n − 1 = 9 條邊。連通且有 10 條邊，多出來的那條會連起兩個本來就連通的節點，形成環。根有幾個孩子不影響總邊數；一條 10 個節點的鏈也只有 9 條邊；兩棵樹的森林反而更少，只有 8 條邊，而且不連通。',
    },
    {
      id: 'q-parent-array', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'parent = [3, 3, -1, 2, 2, 4]\nn = len(parent)\nchildren = [[] for _ in range(n)]\nfor v in range(n):\n    if parent[v] != -1:\n        children[parent[v]].append(v)\nleaves = [v for v in range(n) if not children[v]]\nprint(parent.index(-1), leaves, children[3])' },
      options: ['2 [0, 1, 5] [0, 1]', '0 [0, 1, 5] [0, 1]', '2 [5] [0, 1]', '2 [0, 1, 5] [2]'],
      answer: 0, explanation: '值為 −1 的位置是 2，所以根是 2（根不一定是 0）。建出的孩子：2 → 3、4；3 → 0、1；4 → 5。沒有孩子的是 0、1、5，`children[3]` 是 `[0, 1]`。「0」是以為根一定在索引 0；`[5]` 是只把最深的節點當葉子（0、1、5 的深度都是 2，全是葉子）；`[2]` 是把 `parent[3]`（3 的父節點）和 `children[3]`（3 的孩子）搞混了。',
    },
    {
      id: 'q-recursion-limit', prompt: '下面的 Python 程式用預設設定執行，會發生什麼事？',
      code: { language: 'Python', text: 'n = 100000\nparent = [-1] + list(range(n - 1))  # 一條鏈：0 ← 1 ← 2 ← …\nchildren = [[] for _ in range(n)]\nfor v in range(1, n):\n    children[parent[v]].append(v)\n\ndef height(u):\n    if not children[u]:\n        return 0\n    return 1 + max(height(c) for c in children[u])\n\nprint(height(0))' },
      options: ['輸出 99999', '輸出 100000', '丟出 RecursionError：超過預設的遞迴深度上限', '進入無窮遞迴，永遠不會結束'],
      answer: 2, explanation: '程式邏輯是對的，終止條件也有，但這棵樹是一條 100000 個節點的鏈，遞迴要疊 100000 層，遠超過 Python 預設約 1000 層的上限，所以丟出 `RecursionError`。如果深度沒有超過上限，答案會是 99999（邊數），不是 100000；它也不是無窮遞迴，每次呼叫都往葉子更近一步。解法是改用 BFS 或自己維護堆疊的迭代寫法。',
    },
    {
      id: 'q-base-case', prompt: '本課的高度以邊數計（葉子的高度是 0）。下面這個沒有寫終止條件的 `height`，輸出什麼？',
      code: { language: 'Python', text: 'children = [[1], [2], []]   # 0 → 1 → 2 的鏈\n\ndef height(u):\n    best = 0\n    for c in children[u]:\n        best = max(best, height(c))\n    return best + 1\n\nprint(height(0), height(2))' },
      options: ['2 0', '3 1', '3 0', '程式會無窮遞迴'],
      answer: 1, explanation: '葉子 2 沒有孩子，迴圈一次都不跑，直接回傳 `0 + 1 = 1`；往上 `height(1) = 2`、`height(0) = 3`，輸出 `3 1`。它不會無窮遞迴（迴圈本身在葉子停下），但算的是「節點數」而不是本課的「邊數」，比正確答案 `2 0` 多 1。要符合本課定義，可以加上「葉子回傳 0」的終止條件，或把 `best` 的初值改成 −1。',
    },
    {
      id: 'q-choose', prompt: '一個公司的人事系統常常要回答：「某位員工往上到總經理，依序經過哪些主管？」很少需要列出某人的所有部屬。哪種表示法最直接？',
      options: ['父節點陣列 `parent[i]`', '子節點清單 `children[i]`', 'n × n 的表格，記錄任兩人是否有直屬關係', '把所有人名排序後存進一個陣列'],
      answer: 0, explanation: '往上走就是不斷做 `v = parent[v]`，每一步 O(1)，總共 O(深度)。子節點清單適合往下走，要找某人的主管就得搜尋誰的清單裡有他，每一步 O(n)；n × n 表格要 O(n²) 空間，找主管也要掃一整列；排序過的名單根本沒有存上下關係。',
    },
  ],
  exercises: [
    {
      id: 'e-height-leaves', title: '由父節點陣列求樹高與葉子數',
      statement: '有 n 個節點，編號 0 到 n − 1。給你父節點陣列：`parent[i]` 是節點 i 的父節點，根的父節點是 −1。請輸出這棵樹的高度（以邊數計，單一節點的高度是 0）與葉子（沒有孩子的節點）的個數。n 最大到 2×10^5，樹可能是一條很長的鏈，所以不能用深度可能達到 n 的遞迴（Python 會超過遞迴上限，C++／Java 可能堆疊溢位），請用 BFS 或自己的堆疊。如果輸入不是一棵合法的樹，輸出 `Invalid`：值為 −1 的位置不是恰好一個（沒有根或有兩個以上的根）、某個 `parent[i]` 不在 −1 到 n − 1 之間，或有節點無法從根走到（例如 `parent[i] = i`，或幾個節點互為父節點形成環）。',
      inputFormat: '第一行是整數 n。第二行有 n 個以空白分隔的整數 parent[0] … parent[n − 1]。',
      outputFormat: '合法時輸出一行兩個整數：樹的高度與葉子數，以一個空白分隔。不合法時輸出 `Invalid`。',
      constraints: ['1 ≤ n ≤ 2×10^5', '每個 parent[i] 是整數，絕對值不超過 10^9', '保證第二行剛好有 n 個整數', '時間 O(n)；不要用深度可能達到 n 的遞迴'],
      samples: [{ kind: 'normal', input: '8\n-1 0 0 0 1 1 3 6', output: '3 4', note: '本課的 8 節點樹：最深的是 7（深度 3），葉子是 2、4、5、7' }],
      tests: [
        { kind: 'normal', input: '8\n-1 0 0 0 1 1 3 6', output: '3 4', note: '本課的 8 節點樹' },
        { kind: 'normal', input: '6\n3 3 -1 2 2 4', output: '2 3', note: '根是 2，不在索引 0；葉子是 0、1、5' },
        { kind: 'normal', input: '7\n-1 0 0 1 1 2 5', output: '3 3', note: '葉子在不同深度：3、4 深度 2，6 深度 3' },
        { kind: 'edge', input: '1\n-1', output: '0 1', note: '只有根：高度 0，根自己就是葉子' },
        { kind: 'edge', input: '2\n1 -1', output: '1 1', note: '兩個節點，根是 1' },
        { kind: 'edge', input: '6\n-1 0 0 0 0 0', output: '1 5', note: '星形：根有 5 個孩子' },
        { kind: 'edge', input: '5\n1 2 3 4 -1', output: '4 1', note: '一條鏈，而且孩子的編號比父節點小' },
        { kind: 'edge', input: chain2000, output: '1999 1', note: '2000 個節點的鏈：深度超過 Python 預設遞迴上限，必須用迭代' },
        { kind: 'error', input: '3\n1 2 0', output: 'Invalid', note: '沒有根（三個節點形成環）' },
        { kind: 'error', input: '4\n-1 0 -1 2', output: 'Invalid', note: '兩個根：這是森林，不是一棵樹' },
        { kind: 'error', input: '3\n-1 0 3', output: 'Invalid', note: 'parent[2] = 3 超出 0 到 n − 1' },
        { kind: 'error', input: '3\n-1 -2 0', output: 'Invalid', note: 'parent[1] = −2，不是 −1 也不是合法編號' },
        { kind: 'error', input: '4\n-1 2 3 1', output: 'Invalid', note: '恰好一個根，但 1 → 2 → 3 → 1 形成環，從根走不到' },
        { kind: 'error', input: '2\n-1 1', output: 'Invalid', note: '節點 1 的父節點是自己' },
      ],
      hints: [
        '先檢查：每個 parent[i] 都在 −1 到 n − 1 之間，而且 −1 恰好出現一次。',
        '把父節點陣列轉成子節點清單，再從根開始用佇列做 BFS：`depth[c] = depth[u] + 1`。樹高就是最大的深度。',
        'BFS 結束時數一數拜訪了幾個節點：不到 n 個，表示有節點在環裡、從根走不到，要輸出 `Invalid`。因為每個節點只有一個父節點，BFS 不會重複拜訪同一個節點。',
        '葉子就是子節點清單為空的節點。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <queue>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n;
    std::cin >> n;
    std::vector<long long> parent(n);
    int root = -1, roots = 0;
    bool inRange = true;
    for (int i = 0; i < n; ++i) {
        std::cin >> parent[i];
        if (parent[i] == -1) {
            root = i;
            ++roots;
        } else if (parent[i] < -1 || parent[i] >= n) {
            inRange = false;
        }
    }
    if (!inRange || roots != 1) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<std::vector<int>> children(n);
    for (int i = 0; i < n; ++i) {
        if (parent[i] != -1) children[parent[i]].push_back(i);
    }
    std::vector<int> depth(n, 0);
    std::queue<int> q;
    q.push(root);
    int visited = 0, height = 0;
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        ++visited;
        height = std::max(height, depth[u]);
        for (int c : children[u]) {
            depth[c] = depth[u] + 1;
            q.push(c);
        }
    }
    if (visited != n) {
        std::cout << "Invalid\n";
        return 0;
    }
    int leaves = 0;
    for (int i = 0; i < n; ++i) {
        if (children[i].empty()) ++leaves;
    }
    std::cout << height << " " << leaves << "\n";
    return 0;
}`,
        Python: code`import sys
from collections import deque


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    parent = [int(x) for x in data[1:1 + n]]
    if parent.count(-1) != 1 or any(p < -1 or p >= n for p in parent):
        print("Invalid")
        return
    children = [[] for _ in range(n)]
    for v, p in enumerate(parent):
        if p != -1:
            children[p].append(v)
    depth = [0] * n
    queue = deque([parent.index(-1)])
    visited = 0
    while queue:
        u = queue.popleft()
        visited += 1
        for c in children[u]:
            depth[c] = depth[u] + 1
            queue.append(c)
    if visited != n:
        print("Invalid")
        return
    leaves = sum(1 for v in range(n) if not children[v])
    print(max(depth), leaves)


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer("");
        st = next(br, st);
        int n = Integer.parseInt(st.nextToken());
        int[] parent = new int[n];
        int root = -1, roots = 0;
        boolean inRange = true;
        for (int i = 0; i < n; i++) {
            st = next(br, st);
            parent[i] = Integer.parseInt(st.nextToken());
            if (parent[i] == -1) {
                root = i;
                roots++;
            } else if (parent[i] < -1 || parent[i] >= n) {
                inRange = false;
            }
        }
        if (!inRange || roots != 1) {
            System.out.println("Invalid");
            return;
        }
        List<List<Integer>> children = new ArrayList<>();
        for (int i = 0; i < n; i++) children.add(new ArrayList<>());
        for (int i = 0; i < n; i++) {
            if (parent[i] != -1) children.get(parent[i]).add(i);
        }
        int[] depth = new int[n];
        ArrayDeque<Integer> queue = new ArrayDeque<>();
        queue.add(root);
        int visited = 0, height = 0;
        while (!queue.isEmpty()) {
            int u = queue.poll();
            visited++;
            height = Math.max(height, depth[u]);
            for (int c : children.get(u)) {
                depth[c] = depth[u] + 1;
                queue.add(c);
            }
        }
        if (visited != n) {
            System.out.println("Invalid");
            return;
        }
        int leaves = 0;
        for (int i = 0; i < n; i++) {
            if (children.get(i).isEmpty()) leaves++;
        }
        System.out.println(height + " " + leaves);
    }

    // 需要時讀下一行，讓數字可以分散在多行
    static StringTokenizer next(BufferedReader br, StringTokenizer st) throws IOException {
        while (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());
        return st;
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = data[0];
const parent = data.slice(1, 1 + n);
let root = -1, roots = 0, inRange = true;
for (let i = 0; i < n; i++) {
    if (parent[i] === -1) {
        root = i;
        roots++;
    } else if (parent[i] < -1 || parent[i] >= n) {
        inRange = false;
    }
}
if (!inRange || roots !== 1) {
    console.log("Invalid");
} else {
    const children = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
        if (parent[i] !== -1) children[parent[i]].push(i);
    }
    const depth = new Array(n).fill(0);
    const queue = [root];
    let head = 0, height = 0;
    while (head < queue.length) {
        const u = queue[head++];
        height = Math.max(height, depth[u]);
        for (const c of children[u]) {
            depth[c] = depth[u] + 1;
            queue.push(c);
        }
    }
    if (queue.length !== n) {  // 有節點從根走不到（在環裡）
        console.log("Invalid");
    } else {
        let leaves = 0;
        for (let i = 0; i < n; i++) {
            if (children[i].length === 0) leaves++;
        }
        console.log(height + " " + leaves);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

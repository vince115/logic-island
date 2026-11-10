import type { LessonContent } from '../schema';
import { containerSteps, type ContainerOp } from '../simulate';

const code = String.raw;

/** The trace's operations for s = "([]{})": the current character, the stack operation and why it happens. */
const traceOps: { c: string; op: ContainerOp; why?: string }[] = [
  { c: '(', op: { op: 'push', value: '(', line: 7 }, why: '`(` 是左括號，先放進堆疊等待之後的右括號。' },
  { c: '[', op: { op: 'push', value: '[', line: 7 }, why: '`[` 也是左括號，疊在 `(` 上面。' },
  { c: ']', op: { op: 'top', line: 8 }, why: '這是 `stack[-1]`：`]` 要配對的是 `[`，頂端正好是 `[`，所以 elif 條件不成立。' },
  { c: ']', op: { op: 'pop', line: 12 }, why: '`[` 和 `]` 配成一對，一起消掉。' },
  { c: '{', op: { op: 'push', value: '{', line: 7 }, why: '`{` 是左括號，放到頂端。' },
  { c: '}', op: { op: 'top', line: 8 }, why: '`}` 要配對 `{`，頂端是 `{`，配對成功。' },
  { c: '}', op: { op: 'pop', line: 12 }, why: '消掉 `{`，頂端又回到 `(`。' },
  { c: ')', op: { op: 'top', line: 8 }, why: '`)` 要配對 `(`，頂端是 `(`：最早放入的左括號最後才被配對，這就是後進先出。' },
  { c: ')', op: { op: 'pop', line: 12 }, why: '消掉 `(`。' },
  { c: ')', op: { op: 'empty', line: 13 }, why: '迴圈結束後堆疊是空的，表示每個左括號都找到了右括號，ok 維持 True。若還剩左括號（例如 `(()`），這裡就會把 ok 改成 False。' },
];

/**
 * D05 Stack. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js): an array with push/pop is the stack; the postfix exercise uses BigInt (values reach 10^18).
 */
export const D05: LessonContent = {
  lessonId: 'D05',
  motivation: '編輯器的「復原」（undo）、瀏覽器的「上一頁」、程式執行時的函式呼叫、編譯器檢查括號有沒有配對，背後都是同一個想法：最後放進去的，最先拿出來。堆疊（stack）只允許在一端（頂端）放入與取出，規則簡單，所以每個操作都是 O(1)，也很難用錯。它的限制同樣明顯：只能看到頂端，不能直接讀中間的元素，也不適合「先來先服務」的排隊問題（那是下一課的佇列）。',
  sections: [
    {
      id: 'lifo', title: '後進先出：push、pop、top',
      blocks: [
        { type: 'p', text: '想像一疊盤子：新洗好的盤子放在最上面，要用時也從最上面拿。堆疊的規則就是後進先出（LIFO，Last In First Out）。它只有幾個操作：' },
        { type: 'list', items: [
          '`push(x)`：把 x 放到頂端（top）。',
          '`pop()`：移除頂端的元素。',
          '`top()`／`peek()`：讀取頂端的元素，但不移除。',
          '`empty()`：是否沒有元素；`size()`：目前有幾個元素。',
        ] },
        { type: 'p', text: '因為所有動作都發生在同一端，不需要移動其他元素，這些操作都是 O(1)。下面的程式依序 push 10、20、30，再一個一個 pop：取出的順序剛好和放入相反。頁面中「相關互動實驗」的 Stack 實驗可以用動畫看 push 與 pop 的過程。' },
        { type: 'example', id: 'basic-ops' },
        { type: 'table', head: ['操作', 'C++ `std::stack`', 'Python `list`', 'Java `ArrayDeque`', 'JavaScript 陣列'], rows: [
          ['放入頂端', '`s.push(x)`，O(1)', '`s.append(x)`，攤銷 O(1)', '`s.push(x)`，攤銷 O(1)', '`s.push(x)`，攤銷 O(1)'],
          ['移除頂端', '`s.pop()`，O(1)，不回傳值', '`s.pop()`，O(1)，回傳該值', '`s.pop()`，O(1)，回傳該值', '`s.pop()`，O(1)，回傳該值'],
          ['讀取頂端', '`s.top()`，O(1)', '`s[-1]`，O(1)', '`s.peek()`，O(1)', '`s[s.length - 1]`，O(1)'],
          ['是否為空／大小', '`s.empty()`、`s.size()`，O(1)', '`not s`、`len(s)`，O(1)', '`s.isEmpty()`、`s.size()`，O(1)', '`s.length === 0`、`s.length`，O(1)'],
          ['找某個值在不在', '沒有提供（只能一路 pop），O(n)', '`x in s`，O(n)', '`s.contains(x)`，O(n)', '`s.includes(x)`，O(n)'],
        ] },
        { type: 'p', text: '「攤銷 O(1)」（amortized）的意思是：底層的動態陣列偶爾要擴容、複製全部元素，那一次是 O(n)，但平均到每次 push 仍是常數時間（D02 動態陣列講過）。' },
      ],
    },
    {
      id: 'languages', title: '各語言的堆疊',
      blocks: [
        { type: 'p', text: 'C++：`std::stack` 是容器配接器（container adaptor），本身不存資料，而是包住另一個容器、只開放頂端的操作；預設底層是 `std::deque`，也可以寫成 `std::stack<int, std::vector<int>>` 改用 vector。要特別記得 `pop()` 的回傳型別是 `void`：想拿到頂端的值，要先 `top()` 讀出來，再 `pop()`。' },
        { type: 'p', text: 'Python：沒有專門的 stack 類別，直接用 `list`：`append(x)` 放入、`pop()` 取出最後一個、`stack[-1]` 讀頂端，三個都作用在 list 的尾端，所以是 O(1)。不要拿 list 的開頭當頂端：`insert(0, x)` 與 `pop(0)` 都要移動所有元素，是 O(n)。`collections.deque` 的 `append`／`pop` 也能當堆疊用。' },
        { type: 'p', text: 'Java：建議用 `Deque<Integer> stack = new ArrayDeque<>();`，搭配 `push`、`pop`、`peek`。舊的 `java.util.Stack` 類別繼承自 `Vector`，每個方法都有同步（synchronized）的額外成本，還能用索引存取中間的元素，破壞了「只看頂端」的規則；Java 官方文件也建議改用 `Deque`。' },
        { type: 'p', text: 'JavaScript：和 Python 一樣沒有專門的 stack 類別，直接用陣列：`push(x)` 放入、`pop()` 取出最後一個並回傳它、`s[s.length - 1]` 讀頂端，三個都作用在陣列的尾端，所以是 O(1)。不要拿陣列的開頭當頂端：`unshift(x)` 與 `shift()` 都要移動所有元素，是 O(n)。' },
        { type: 'callout', tone: 'note', title: 'ArrayDeque 的兩個小細節', text: '第一，`ArrayDeque` 不能放 `null`（`push(null)` 會丟出 `NullPointerException`），因為它用 `null` 表示「沒有元素」：空的時候 `peek()` 回傳 `null`。第二，`push` 其實是放到 deque 的前端，所以直接印出或用 for-each 走訪時，順序是從頂端到底端，例如依序 push 10、20、30 後印出是 `[30, 20, 10]`；舊的 `Stack` 則印出 `[10, 20, 30]`。' },
      ],
    },
    {
      id: 'empty-stack', title: '空堆疊：最常見的錯誤',
      blocks: [
        { type: 'p', text: '對空堆疊 pop 或讀頂端，稱為下溢（underflow）。各語言的反應完全不同：' },
        { type: 'table', head: ['語言', '空堆疊上 pop', '空堆疊上讀頂端'], rows: [
          ['C++ `std::stack`', '未定義行為（undefined behavior）', '`top()` 也是未定義行為'],
          ['Python `list`', '丟出 `IndexError: pop from empty list`', '`s[-1]` 丟出 `IndexError`'],
          ['Java `ArrayDeque`', '丟出 `NoSuchElementException`', '`peek()` 回傳 `null`'],
          ['JavaScript 陣列', '不會出錯，回傳 `undefined`', '`s[s.length - 1]` 也是 `undefined`'],
        ] },
        { type: 'callout', tone: 'warning', title: '先檢查 empty，再 pop 或 top', text: 'C++ 的未定義行為最危險：程式可能當掉、讀到垃圾值，也可能看起來「正常」地繼續跑，錯誤很難追。Java 的 `peek()` 不會出錯，但 `int x = stack.peek();` 在空堆疊上會因為把 `null` 自動拆箱（unboxing）成 int 而丟出 `NullPointerException`。JavaScript 也不會出錯，但拿到的 `undefined` 會被當成值繼續算下去（例如算出 `NaN`），錯誤同樣很難追。所以每次 pop 或讀頂端之前，都先用 `empty()`／`not s`／`isEmpty()`／`s.length === 0` 確認還有元素。' },
        { type: 'p', text: '另一個 C++ 常見錯誤是寫 `int x = s.pop();`：`pop()` 回傳 `void`，這行根本無法編譯。正確寫法是 `int x = s.top(); s.pop();`。Python、Java 與 JavaScript 的 `pop()` 則會回傳被移除的值。' },
      ],
    },
    {
      id: 'applications', title: '堆疊的應用',
      blocks: [
        { type: 'p', text: '括號配對：從左到右讀字串，遇到左括號就 push；遇到右括號，頂端必須是對應的左括號，是就 pop 消掉，不是（或堆疊已空）就失敗；讀完後堆疊必須是空的。後讀到的左括號要先被配對，正好是後進先出。下方的視覺化逐步追蹤 `([]{})`。' },
        { type: 'example', id: 'bracket-check' },
        { type: 'callout', tone: 'tip', title: '先判斷空，再讀頂端', text: '程式中的 `not stack or stack[-1] != pairs[c]` 利用了短路求值（short-circuit）：堆疊是空的時候，`or` 左邊已經成立，右邊的 `stack[-1]` 根本不會執行，所以 `)(` 這種「右括號先出現」的輸入會乖乖得到 NO，而不是丟出 `IndexError`。C++、Java 與 JavaScript 版本的 `st.empty() ||`／`st.isEmpty() ||`／`stack.length === 0 ||` 也是同樣的道理，順序寫反就會在空堆疊上讀頂端。' },
        { type: 'p', text: '反轉順序：把資料依序 push，再全部 pop，順序就反過來了。下面把一行單字反過來輸出：' },
        { type: 'example', id: 'reverse-words' },
        { type: 'list', items: [
          '復原（undo）：每做一個動作就 push 進堆疊，按下復原時 pop 出最近的動作並還原。',
          '函式呼叫堆疊（call stack）：呼叫函式時把它的區域變數與返回位置 push，函式結束時 pop。F18 遞迴裡「先一路往下、再一路回來」的過程就是這個堆疊；遞迴太深時堆疊用完，就是 stack overflow。',
          '後序運算式（postfix）求值：`3 4 + 2 *` 表示 (3 + 4) × 2。遇到數字就 push；遇到運算子就 pop 兩個數計算、再把結果 push 回去。本課的練習題就是它。',
        ] },
      ],
    },
    {
      id: 'vs-queue', title: '堆疊與佇列的比較',
      blocks: [
        { type: 'p', text: '佇列（queue）是先進先出（FIFO，First In First Out）：從尾端放入、從前端取出，像排隊買票。兩者的操作都是 O(1)，差別只在「取出哪一個」。下一課 D06 會詳細介紹佇列，D07 的雙端佇列（deque）則兩端都能進出，可以同時當作堆疊與佇列。' },
        { type: 'table', head: ['', '堆疊 Stack', '佇列 Queue'], rows: [
          ['規則', '後進先出（LIFO）', '先進先出（FIFO）'],
          ['取出的是', '最後放入的元素', '最早放入的元素'],
          ['典型用途', '復原、上一頁、括號配對、遞迴、DFS', '排隊模擬、工作排程、印表機佇列、BFS'],
          ['C++／Python／Java／JavaScript', '`std::stack`／`list`／`ArrayDeque`／陣列', '`std::queue`／`collections.deque`／`ArrayDeque`／陣列加頭端索引'],
        ] },
        { type: 'p', text: '選擇的判斷很簡單：問題要的是「最近的那一個」（最近的動作、最近的未配對括號、剛剛呼叫的函式）就用堆疊；要的是「最早來的那一個」（照順序處理）就用佇列。' },
      ],
    },
  ],
  examples: [
    {
      id: 'basic-ops', title: 'push、top、pop 的基本操作', description: '依序放入 10、20、30，讀頂端與大小，再全部 pop 出來。C++ 的 pop() 不回傳值，所以先用 top() 讀。',
      output: 'top: 30\nsize: 3\npop order: 30 20 10\nempty: yes',
      code: {
        'C++': code`#include <iostream>
#include <stack>

int main() {
    std::stack<int> s;
    s.push(10);
    s.push(20);
    s.push(30);
    std::cout << "top: " << s.top() << "\n";
    std::cout << "size: " << s.size() << "\n";
    std::cout << "pop order:";
    while (!s.empty()) {
        std::cout << " " << s.top();  // pop() 不回傳值，先用 top() 讀
        s.pop();
    }
    std::cout << "\n";
    std::cout << "empty: " << (s.empty() ? "yes" : "no") << "\n";
    return 0;
}`,
        Python: code`stack = []
stack.append(10)
stack.append(20)
stack.append(30)
print("top:", stack[-1])
print("size:", len(stack))
order = []
while stack:
    order.append(stack.pop())
print("pop order:", *order)
print("empty:", "yes" if not stack else "no")`,
        Java: code`import java.util.ArrayDeque;
import java.util.Deque;

public class Main {
    public static void main(String[] args) {
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(10);
        stack.push(20);
        stack.push(30);
        System.out.println("top: " + stack.peek());
        System.out.println("size: " + stack.size());
        StringBuilder order = new StringBuilder("pop order:");
        while (!stack.isEmpty()) order.append(" ").append(stack.pop());
        System.out.println(order);
        System.out.println("empty: " + (stack.isEmpty() ? "yes" : "no"));
    }
}`,
        JavaScript: code`const stack = [];
stack.push(10);
stack.push(20);
stack.push(30);
console.log("top:", stack[stack.length - 1]);
console.log("size:", stack.length);
const order = [];
while (stack.length > 0) {
    order.push(stack.pop());  // pop() 移除頂端並回傳它
}
console.log("pop order:", order.join(" "));
console.log("empty:", stack.length === 0 ? "yes" : "no");`,
      },
    },
    {
      id: 'bracket-check', title: '括號配對', description: '用堆疊檢查只含 ()[]{} 的字串是否正確配對，對四個字串各輸出 YES 或 NO。',
      output: '([]{}) YES\n([)] NO\n(() NO\n)( NO',
      code: {
        'C++': code`#include <iostream>
#include <stack>
#include <string>

bool balanced(const std::string& s) {
    std::stack<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            st.push(c);
        } else {
            char want = c == ')' ? '(' : c == ']' ? '[' : '{';
            if (st.empty() || st.top() != want) return false;
            st.pop();
        }
    }
    return st.empty();
}

int main() {
    for (const char* s : {"([]{})", "([)]", "(()", ")("}) {
        std::cout << s << " " << (balanced(s) ? "YES" : "NO") << "\n";
    }
    return 0;
}`,
        Python: code`def balanced(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for c in s:
        if c in "([{":
            stack.append(c)
        elif not stack or stack[-1] != pairs[c]:
            return False
        else:
            stack.pop()
    return not stack


for s in ["([]{})", "([)]", "(()", ")("]:
    print(s, "YES" if balanced(s) else "NO")`,
        Java: code`import java.util.ArrayDeque;
import java.util.Deque;

public class Main {
    static boolean balanced(String s) {
        Deque<Character> st = new ArrayDeque<>();
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') {
                st.push(c);
            } else {
                char want = c == ')' ? '(' : c == ']' ? '[' : '{';
                if (st.isEmpty() || st.peek() != want) return false;
                st.pop();
            }
        }
        return st.isEmpty();
    }

    public static void main(String[] args) {
        for (String s : new String[] {"([]{})", "([)]", "(()", ")("}) {
            System.out.println(s + " " + (balanced(s) ? "YES" : "NO"));
        }
    }
}`,
        JavaScript: code`function balanced(s) {
    const pairs = { ")": "(", "]": "[", "}": "{" };
    const stack = [];
    for (const c of s) {
        if ("([{".includes(c)) {
            stack.push(c);
        } else if (stack.length === 0 || stack[stack.length - 1] !== pairs[c]) {
            return false;
        } else {
            stack.pop();
        }
    }
    return stack.length === 0;
}

for (const s of ["([]{})", "([)]", "(()", ")("]) {
    console.log(s, balanced(s) ? "YES" : "NO");
}`,
      },
    },
    {
      id: 'reverse-words', title: '用堆疊反轉單字順序', description: '讀入一行單字，全部 push 後再全部 pop，順序就反過來。',
      stdin: 'stacks are really fun', output: 'fun really are stacks',
      code: {
        'C++': code`#include <iostream>
#include <stack>
#include <string>

int main() {
    std::stack<std::string> st;
    std::string w;
    while (std::cin >> w) st.push(w);
    bool first = true;
    while (!st.empty()) {
        std::cout << (first ? "" : " ") << st.top();
        st.pop();
        first = false;
    }
    std::cout << "\n";
    return 0;
}`,
        Python: code`stack = []
for w in input().split():
    stack.append(w)
out = []
while stack:
    out.append(stack.pop())
print(" ".join(out))`,
        Java: code`import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        Deque<String> stack = new ArrayDeque<>();
        while (sc.hasNext()) stack.push(sc.next());
        StringBuilder out = new StringBuilder();
        while (!stack.isEmpty()) {
            if (out.length() > 0) out.append(" ");
            out.append(stack.pop());
        }
        System.out.println(out);
    }
}`,
        JavaScript: code`const text = require("fs").readFileSync(0, "utf8").trim();
const stack = [];
for (const w of text === "" ? [] : text.split(/\s+/)) {
    stack.push(w);
}
const out = [];
while (stack.length > 0) {
    out.push(stack.pop());
}
console.log(out.join(" "));`,
      },
    },
  ],
  visualization: {
    kind: 'stack-queue', title: '括號配對：左括號進堆疊，右括號找頂端配對', language: 'Python',
    code: code`s = "([]{})"
pairs = {")": "(", "]": "[", "}": "{"}
stack = []
ok = True
for c in s:
    if c in "([{":
        stack.append(c)
    elif not stack or stack[-1] != pairs[c]:
        ok = False
        break
    else:
        stack.pop()
if stack:
    ok = False
print("YES" if ok else "NO")`,
    steps: [
      { line: 3, note: '建立空堆疊 stack；pairs 記錄每個右括號要配對的左括號。接著逐字讀 s。', vars: { s: '"([]{})"', ok: 'True' },
        containers: [{ name: 'stack', kind: 'stack', items: [] }] },
      ...containerSteps('stack', 'stack', traceOps.map(t => t.op)).map((step, i) => ({
        ...step,
        note: `${step.note}${traceOps[i].why ?? ''}`,
        vars: { c: `'${traceOps[i].c}'`, ok: 'True', ...step.vars },
      })),
      { line: 15, note: 'ok 是 True，輸出 YES。如果輸入是 `)(`，第一個字元 `)` 就遇到空堆疊：`not stack` 成立，ok 變成 False 並跳出迴圈，不會對空堆疊讀 `stack[-1]`（underflow）。', vars: { c: "')'", ok: 'True' },
        containers: [{ name: 'stack', kind: 'stack', items: [] }], output: 'YES' },
    ],
    playground: { structure: 'stack' },
  },
  quiz: [
    {
      id: 'q-order', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 's = []\nfor x in [1, 2, 3]:\n    s.append(x)\nprint(s.pop(), end=" ")\ns.append(4)\ns.append(5)\nprint(s.pop(), end=" ")\nprint(s.pop(), end=" ")\nprint(s[-1])' },
      options: ['3 5 4 2', '1 4 5 2', '3 4 5 2', '3 5 4 4'],
      answer: 0, explanation: '放入 1、2、3 後 pop 取出最後放入的 3，剩 [1, 2]；放入 4、5 變成 [1, 2, 4, 5]，再 pop 兩次依序得到 5、4；最後 `s[-1]` 讀頂端 2（不移除）。「1 4 5 2」是把它當成先進先出；「3 4 5 2」把 4、5 的取出順序弄反；「3 5 4 4」忘了 4 已經被 pop 掉。',
    },
    {
      id: 'q-cpp-pop', prompt: '下面的 C++ 程式片段會怎樣？',
      code: { language: 'C++', text: 'std::stack<int> s;\ns.push(7);\nint x = s.pop();\nstd::cout << x << "\\n";' },
      options: ['輸出 7', '編譯錯誤：pop() 的回傳型別是 void', '執行時當掉：堆疊是空的', '輸出 0'],
      answer: 1, explanation: '`std::stack::pop()` 只移除頂端、不回傳值（回傳型別 void），所以 `int x = s.pop();` 無法編譯。要先 `int x = s.top();` 再 `s.pop();`。堆疊裡有 7，不是空的，所以不是下溢；「輸出 7」是把它和 Python／Java 的 pop 搞混了。',
    },
    {
      id: 'q-java-empty', prompt: 'Java 中 `Deque<Integer> st = new ArrayDeque<>();` 之後，馬上呼叫 `st.peek()` 與 `st.pop()` 會怎樣？',
      options: ['兩個都回傳 null', 'peek() 回傳 null；pop() 丟出 NoSuchElementException', '兩個都丟出 EmptyStackException', 'peek() 丟出例外；pop() 回傳 null'],
      answer: 1, explanation: '`ArrayDeque` 空的時候 `peek()` 回傳 null，`pop()`（等同 `removeFirst()`）丟出 `NoSuchElementException`。`EmptyStackException` 是舊的 `java.util.Stack` 類別才會丟的例外。另外，若寫成 `int x = st.peek();`，null 自動拆箱會丟出 `NullPointerException`。',
    },
    {
      id: 'q-complexity', prompt: '堆疊裡有 n 個元素，只用堆疊的操作（push、pop、top、empty）時，下列哪一件事不是 O(1)？',
      options: ['push 一個新元素', '讀取頂端元素', '移除頂端元素', '判斷某個值是否在堆疊中'],
      answer: 3, explanation: 'push、top、pop 都只動頂端，不需要移動其他元素，是 O(1)（Python list 與 ArrayDeque 的 push 是攤銷 O(1)）。要找某個值，最壞得把 n 個元素都看過一遍，是 O(n)；堆疊不是為搜尋設計的結構。',
    },
    {
      id: 'q-choose', prompt: '下列哪個情境最適合用堆疊，而不是佇列？',
      options: ['印表機依照送達順序列印文件', '瀏覽器的「上一頁」按鈕', '客服電話依來電順序接聽', '餐廳依取號順序叫號'],
      answer: 1, explanation: '「上一頁」要回到最近一次離開的頁面，最後進入的先出來，是後進先出，用堆疊。其他三個都是「先來先服務」，要先處理最早來的，屬於先進先出，應該用佇列（D06）。',
    },
    {
      id: 'q-brackets', prompt: '用本課的括號配對程式檢查 `([)]`，在讀到哪個字元時判定失敗？當時堆疊的內容（底 → 頂）是什麼？',
      options: ['第 3 個字元 `)`，堆疊是 `(` `[`', '第 4 個字元 `]`，堆疊是 `(`', '第 2 個字元 `[`，堆疊是 `(`', '不會失敗，輸出 YES'],
      answer: 0, explanation: '`(` 與 `[` 依序 push，堆疊是 `(` `[`。第 3 個字元 `)` 要配對 `(`，但頂端是 `[`，立刻失敗，輸出 NO。括號的種類和數量都對，但巢狀順序錯了，所以不是 YES；程式也不會讀到第 4 個字元。',
    },
  ],
  exercises: [
    {
      id: 'e-postfix', title: '後序運算式求值',
      statement: '後序運算式（postfix，也叫逆波蘭表示法）把運算子寫在兩個運算元後面，例如 `3 4 + 2 *` 表示 (3 + 4) × 2 = 14，完全不需要括號。請用堆疊計算一行後序運算式的值：遇到數字就 push；遇到運算子就 pop 出兩個數，先 pop 出來的是右運算元 b、後 pop 出來的是左運算元 a，計算 a 運算子 b 後把結果 push 回去。全部讀完時堆疊必須剛好剩一個數，那就是答案。只支援 `+`、`-`、`*` 三種運算子。若運算式不合法——運算子出現時堆疊裡不到兩個數、結束時堆疊不是剛好一個數、或出現數字與這三種運算子以外的符號（包含 `/` 與負號開頭的數）——輸出 `Error`。',
      inputFormat: '一行，若干個以空白分隔的記號（token）。每個記號是非負整數或運算子。',
      outputFormat: '一行：運算結果（整數，可能是負數），或 `Error`。',
      constraints: ['記號數 1～1,000', '每個數字是 0～1,000,000,000 的整數', '保證計算過程中每個值的絕對值都不超過 10^18（C++ 用 long long、Java 用 long、JavaScript 用 BigInt）'],
      samples: [{ kind: 'normal', input: '3 4 + 2 *', output: '14', note: '(3 + 4) × 2' }],
      tests: [
        { kind: 'normal', input: '3 4 + 2 *', output: '14', note: '(3 + 4) × 2' },
        { kind: 'normal', input: '5 1 2 + 4 * + 3 -', output: '14', note: '5 + (1 + 2) × 4 − 3' },
        { kind: 'normal', input: '2 3 4 * -', output: '-10', note: '2 − 3 × 4，結果是負數' },
        { kind: 'edge', input: '42', output: '42', note: '只有一個數字' },
        { kind: 'edge', input: '7 2 -', output: '5', note: '運算元順序：先 pop 的是右運算元，7 − 2 而不是 2 − 7' },
        { kind: 'edge', input: '1000000000 1000000000 *', output: '1000000000000000000', note: '結果達到 10^18，需要 64 位元整數' },
        { kind: 'edge', input: '1' + ' 1 +'.repeat(499), output: '500', note: '最多 999 個記號：1 再加 499 次 1' },
        { kind: 'error', input: '3 +', output: 'Error', note: '運算子出現時堆疊只有一個數（下溢）' },
        { kind: 'error', input: '+', output: 'Error', note: '第一個記號就是運算子，堆疊是空的' },
        { kind: 'error', input: '1 2', output: 'Error', note: '結束時堆疊剩兩個數' },
        { kind: 'error', input: '2 x +', output: 'Error', note: '不認得的記號' },
        { kind: 'error', input: '8 2 /', output: 'Error', note: '不支援的運算子 /' },
      ],
      hints: [
        '用一個整數堆疊。數字記號 push；運算子記號先檢查堆疊至少有兩個數，再 pop 兩次。',
        '注意順序：`7 2 -` 時先 pop 出 2（b），再 pop 出 7（a），答案是 a − b = 5。',
        '讀完所有記號後再檢查一次：堆疊大小必須正好是 1。',
        '本題刻意不支援除法：C++ 與 Java 的整數除法向 0 截斷（−7 / 2 = −3），Python 的 `//` 向下取整（−7 // 2 = −4），JavaScript 的 `/` 則保留小數（BigInt 的 `/` 向 0 截斷），各語言的結果會不同。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <sstream>
#include <stack>
#include <string>

bool isNumber(const std::string& t) {
    for (char c : t) {
        if (c < '0' || c > '9') return false;
    }
    return !t.empty();
}

int main() {
    std::string line, t;
    std::getline(std::cin, line);
    std::istringstream in(line);
    std::stack<long long> st;
    while (in >> t) {
        if (isNumber(t)) {
            st.push(std::stoll(t));
        } else if (t == "+" || t == "-" || t == "*") {
            if (st.size() < 2) {
                std::cout << "Error\n";
                return 0;
            }
            long long b = st.top();
            st.pop();
            long long a = st.top();
            st.pop();
            st.push(t == "+" ? a + b : t == "-" ? a - b : a * b);
        } else {
            std::cout << "Error\n";
            return 0;
        }
    }
    if (st.size() == 1) std::cout << st.top() << "\n";
    else std::cout << "Error\n";
    return 0;
}`,
        Python: code`stack = []
ok = True
for t in input().split():
    if t.isascii() and t.isdigit():
        stack.append(int(t))
    elif t in ("+", "-", "*"):
        if len(stack) < 2:
            ok = False
            break
        b = stack.pop()
        a = stack.pop()
        stack.append(a + b if t == "+" else a - b if t == "-" else a * b)
    else:
        ok = False
        break
print(stack[0] if ok and len(stack) == 1 else "Error")`,
        Java: code`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.Deque;

public class Main {
    public static void main(String[] args) throws Exception {
        String line = new BufferedReader(new InputStreamReader(System.in)).readLine();
        String text = line == null ? "" : line.trim();
        Deque<Long> st = new ArrayDeque<>();
        boolean ok = true;
        for (String t : text.isEmpty() ? new String[0] : text.split("\\s+")) {
            if (t.matches("[0-9]+")) {
                st.push(Long.parseLong(t));
            } else if (t.equals("+") || t.equals("-") || t.equals("*")) {
                if (st.size() < 2) {
                    ok = false;
                    break;
                }
                long b = st.pop();
                long a = st.pop();
                st.push(t.equals("+") ? a + b : t.equals("-") ? a - b : a * b);
            } else {
                ok = false;
                break;
            }
        }
        System.out.println(ok && st.size() == 1 ? String.valueOf(st.peek()) : "Error");
    }
}`,
        JavaScript: code`// 結果可達 10^18，超過 number 能精確表示的 2^53，所以堆疊裡放 BigInt
const line = require("fs").readFileSync(0, "utf8").split(/\r?\n/)[0].trim();
const stack = [];
let ok = true;
for (const t of line === "" ? [] : line.split(/\s+/)) {
    if (/^[0-9]+$/.test(t)) {
        stack.push(BigInt(t));
    } else if (t === "+" || t === "-" || t === "*") {
        if (stack.length < 2) {
            ok = false;
            break;
        }
        const b = stack.pop();  // 先 pop 出來的是右運算元
        const a = stack.pop();
        stack.push(t === "+" ? a + b : t === "-" ? a - b : a * b);
    } else {
        ok = false;
        break;
    }
}
console.log(ok && stack.length === 1 ? String(stack[0]) : "Error");`,
      },
      judge: 'none',
    },
  ],
};

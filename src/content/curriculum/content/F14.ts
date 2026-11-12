import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * F14 參數與回傳值. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); like Python/Java it changes caller data through an array (no `&`).
 */
export const F14: LessonContent = {
  lessonId: 'F14',
  motivation: '「函式改了我的變數嗎？」是初學者最常卡住的問題之一，而各語言的答案並不相同。弄清楚參數怎麼傳、結果怎麼交回來，才能放心地把程式拆成函式，而不必依賴到處修改的全域變數。',
  sections: [
    {
      id: 'parameters', title: '參數、引數與回傳值',
      blocks: [
        { type: 'p', text: '定義函式時寫的是參數（parameter）：`int gcd(int a, int b)` 的 a、b。呼叫時傳入的是引數（argument）：`gcd(12, 18)` 的 12、18。呼叫時，引數的值依順序交給參數。' },
        { type: 'p', text: '回傳值讓函式把結果交回給呼叫者。一個函式可以有多個 return（例如不同情況提早回傳），但每次呼叫只會執行其中一個。設計函式時先寫下：它需要什麼輸入？它回傳什麼？會不會改到呼叫者的東西？' },
      ],
    },
    {
      id: 'pass-by-value', title: '傳值：函式拿到的是一份複本',
      blocks: [
        { type: 'p', text: '整數、小數、布林這些基本值，各語言都是「傳值」：參數是引數的一份複本，函式裡修改參數，不會影響呼叫者的變數。' },
        { type: 'p', text: 'C++ 另外可以在參數型別後加 `&`，變成「傳參考」：參數就是呼叫者變數的別名，修改它就是修改呼叫者的變數。Python、Java 與 JavaScript 沒有這種寫法；要讓函式改變一個值，可以把它放進 list／陣列，或者讓函式回傳新的值。' },
        { type: 'example', id: 'by-value' },
        { type: 'p', text: '在下方的視覺化中比較：`byValue(n)` 改的是自己的 x，main 的 n 不變；`byRef(n)` 的 x 就是 n 本身。' },
      ],
    },
    {
      id: 'objects', title: '傳入 list 與陣列：可以改內容，不能換掉整個',
      blocks: [
        { type: 'p', text: 'Python 的 list 與 Java、JavaScript 的陣列，傳進函式時傳的是「參考的複本」：函式和呼叫者指向同一份資料。因此在函式裡修改內容（`a[0] = 9`、`lst.append(4)`），呼叫者看得到；但把參數指向另一個新物件（`a = new int[]{7}`、`lst = [0]`），只是讓函式自己的名字換了目標，呼叫者不受影響。' },
        { type: 'p', text: 'C++ 的 `std::vector` 傳值時會複製整份內容（大陣列很慢），所以通常寫成 `const std::vector<int>& a`：用參考避免複製，加 `const` 保證不會改到它。需要修改時就不加 const。' },
        { type: 'example', id: 'swap' },
      ],
    },
    {
      id: 'multiple-results', title: '回傳多個結果',
      blocks: [
        { type: 'p', text: '一個函式要交回兩個值（例如最小值與最大值）時，每種語言都有自然的寫法：C++ 回傳 `std::pair`（或用參考參數），Python 回傳 tuple 再拆開，Java 回傳一個小陣列或 record（Java 16 起支援），JavaScript 回傳陣列再用 `const [lo, hi] = …` 拆開。' },
        { type: 'example', id: 'min-max' },
        { type: 'callout', tone: 'tip', title: '用回傳值代替全域變數', text: '讓函式「讀參數、回傳結果」，而不是偷偷修改全域變數。這樣每個函式都能單獨測試，呼叫的地方也一看就知道值從哪裡來（下一課「變數作用域」會再說明）。' },
      ],
    },
  ],
  examples: [
    {
      id: 'by-value', title: '傳值不會改到呼叫者', description: 'x 是 5。傳值的函式加 1 後，x 仍是 5；用 C++ 的參考（Python／Java／JavaScript 用 list／陣列）才會變成 6。',
      output: '5 6',
      code: {
        'C++': code`#include <iostream>

void addOne(int x) { x += 1; }      // 改的是複本
void addOneRef(int& x) { x += 1; }  // x 是呼叫者變數的別名

int main() {
    int x = 5;
    addOne(x);
    int before = x;
    addOneRef(x);
    std::cout << before << " " << x << "\n";
    return 0;
}`,
        Python: code`def add_one(n):
    n += 1  # 只改了函式自己的名字


def add_one_box(box):
    box[0] += 1  # 改的是 list 的內容，呼叫者看得到


x = 5
add_one(x)
box = [x]
add_one_box(box)
print(x, box[0])`,
        Java: code`public class Main {
    static void addOne(int n) { n += 1; }             // 改的是複本
    static void addOneBox(int[] box) { box[0] += 1; } // 改的是陣列內容

    public static void main(String[] args) {
        int x = 5;
        addOne(x);
        int[] box = {x};
        addOneBox(box);
        System.out.println(x + " " + box[0]);
    }
}`,
        JavaScript: code`function addOne(n) {
    n += 1;  // 只改了函式自己的參數
}

function addOneBox(box) {
    box[0] += 1;  // 改的是陣列內容，呼叫者看得到
}

const x = 5;
addOne(x);
const box = [x];
addOneBox(box);
console.log(x, box[0]);`,
      },
    },
    {
      id: 'swap', title: '交換：參考、回傳 tuple、修改陣列', description: '讀入 a、b 並交換。每種語言用各自慣用的方法；JavaScript 回傳陣列再拆開。',
      stdin: '3 7', output: '7 3',
      code: {
        'C++': code`#include <iostream>

void swapValues(int& a, int& b) {  // 參考：直接交換呼叫者的變數
    int t = a;
    a = b;
    b = t;
}

int main() {
    int a, b;
    std::cin >> a >> b;
    swapValues(a, b);
    std::cout << a << " " << b << "\n";
    return 0;
}`,
        Python: code`def swapped(a, b):
    return b, a  # 回傳 tuple，由呼叫者重新指定


a, b = map(int, input().split())
a, b = swapped(a, b)
print(a, b)`,
        Java: code`import java.util.Scanner;

public class Main {
    static void swap(int[] v, int i, int j) {  // 修改陣列內容
        int t = v[i];
        v[i] = v[j];
        v[j] = t;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int[] v = {sc.nextInt(), sc.nextInt()};
        swap(v, 0, 1);
        System.out.println(v[0] + " " + v[1]);
    }
}`,
        JavaScript: code`function swapped(a, b) {
    return [b, a];  // 回傳陣列，由呼叫者拆開重新指定
}

let [a, b] = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
[a, b] = swapped(a, b);
console.log(a, b);`,
      },
    },
    {
      id: 'min-max', title: '一次回傳最小值與最大值', description: '讀入 n 個整數，函式回傳兩個結果。',
      stdin: '5\n4 9 -2 7 0', output: '-2 9',
      code: {
        'C++': code`#include <iostream>
#include <utility>
#include <vector>

std::pair<int, int> minMax(const std::vector<int>& a) {  // const 參考：不複製也不修改
    int lo = a[0], hi = a[0];
    for (int x : a) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
    }
    return {lo, hi};
}

int main() {
    int n;
    std::cin >> n;
    std::vector<int> a(n);
    for (auto& x : a) std::cin >> x;
    auto [lo, hi] = minMax(a);
    std::cout << lo << " " << hi << "\n";
    return 0;
}`,
        Python: code`def min_max(a):
    lo = hi = a[0]
    for x in a:
        lo = min(lo, x)
        hi = max(hi, x)
    return lo, hi


n = int(input())
a = list(map(int, input().split()))
lo, hi = min_max(a)
print(lo, hi)`,
        Java: code`import java.util.Scanner;

public class Main {
    record Range(int lo, int hi) {}

    static Range minMax(int[] a) {
        int lo = a[0], hi = a[0];
        for (int x : a) {
            lo = Math.min(lo, x);
            hi = Math.max(hi, x);
        }
        return new Range(lo, hi);
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; ++i) a[i] = sc.nextInt();
        Range r = minMax(a);
        System.out.println(r.lo() + " " + r.hi());
    }
}`,
        JavaScript: code`function minMax(a) {
    let lo = a[0], hi = a[0];
    for (const x of a) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
    }
    return [lo, hi];
}

const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = data[0];
const a = data.slice(1, 1 + n);
const [lo, hi] = minMax(a);
console.log(lo, hi);`,
      },
    },
  ],
  visualization: {
    kind: 'function-call', title: '傳值與傳參考（C++）', language: 'C++',
    code: code`void byValue(int x) { x = x + 1; }
void byRef(int& x) { x = x + 1; }
int main() {
    int n = 5;
    byValue(n);
    byRef(n);
    std::cout << n;
}`,
    steps: [
      { line: 4, note: 'main 的 n = 5。', frames: [{ name: 'main', vars: { n: '5' } }] },
      { line: 1, note: '呼叫 byValue(n)：x 是 n 的「複本」，值為 5。', frames: [{ name: 'main', vars: { n: '5' } }, { name: 'byValue', vars: { x: '5（複本）' } }] },
      { line: 1, note: 'x = 6。只改了複本，main 的 n 仍是 5。', frames: [{ name: 'main', vars: { n: '5' } }, { name: 'byValue', vars: { x: '6（複本）' } }] },
      { line: 5, note: '回到 main：n 沒有變。', frames: [{ name: 'main', vars: { n: '5' } }] },
      { line: 2, note: '呼叫 byRef(n)：x 是 n 的「別名」，兩個名字指同一個變數。', frames: [{ name: 'main', vars: { n: '5' } }, { name: 'byRef', vars: { x: '→ main 的 n（5）' } }] },
      { line: 2, note: 'x = x + 1，也就是 n = 6。', frames: [{ name: 'main', vars: { n: '6' } }, { name: 'byRef', vars: { x: '→ main 的 n（6）' } }] },
      { line: 7, note: '回到 main，輸出 6。', frames: [{ name: 'main', vars: { n: '6' } }], output: '6' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'def f(lst):\n    lst.append(4)\n    lst = [0]\n\na = [1, 2, 3]\nf(a)\nprint(a)' },
      options: ['[1, 2, 3]', '[1, 2, 3, 4]', '[0]', '[0, 4]'],
      answer: 1, explanation: 'append 修改的是 a 指向的那份 list，所以 a 多了 4；接著 `lst = [0]` 只是讓函式裡的名字 lst 指向新的 list，不影響 a。',
    },
    {
      id: 'q2', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'void g(int x) { x = 10; }\nint main() {\n    int y = 1;\n    g(y);\n    std::cout << y;\n}' },
      options: ['1', '10', '11', '未定義'],
      answer: 0, explanation: '參數 x 是 y 的複本，函式改的是複本，y 仍然是 1。要讓 g 修改 y，參數要寫成 `int& x`。',
    },
    {
      id: 'q3', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'void h(int& x) { x *= 2; }\nint main() {\n    int y = 5;\n    h(y);\n    h(y);\n    std::cout << y;\n}' },
      options: ['5', '10', '20', '25'],
      answer: 2, explanation: '`int&` 讓 x 成為 y 的別名，每次呼叫都把 y 乘 2：5 → 10 → 20。',
    },
    {
      id: 'q4', prompt: '下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: 'static void change(int[] a) {\n    a[0] = 9;\n    a = new int[]{7};\n}\n// main 中：\nint[] b = {1};\nchange(b);\nSystem.out.println(b[0]);' },
      options: ['1', '7', '9', '編譯錯誤'],
      answer: 2, explanation: '`a[0] = 9` 修改的是 b 指向的那個陣列，所以 b[0] 變成 9；`a = new int[]{7}` 只讓參數 a 指向新陣列，b 不受影響。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '約分',
      statement: '寫一個函式計算兩個整數的最大公因數（輾轉相除法），再寫一個函式把分數 a/b 約成最簡分數並回傳分子與分母。輸出規則：負號放在分子；分母為 1 時只輸出分子；分子為 0 時輸出 `0`；分母為 0 時輸出 `Invalid`。',
      inputFormat: '一行兩個整數 a、b。',
      outputFormat: '一行：`p/q`、`p` 或 `Invalid`。',
      constraints: ['−10⁹ ≤ a, b ≤ 10⁹'],
      samples: [{ kind: 'normal', input: '6 8', output: '3/4', note: 'gcd(6, 8) = 2' }],
      tests: [
        { kind: 'normal', input: '6 8', output: '3/4', note: '一般情況' },
        { kind: 'normal', input: '10 5', output: '2', note: '分母約成 1' },
        { kind: 'normal', input: '-4 6', output: '-2/3', note: '負的分子' },
        { kind: 'edge', input: '4 -6', output: '-2/3', note: '負號在分母時要移到分子' },
        { kind: 'edge', input: '-3 -9', output: '1/3', note: '負負得正' },
        { kind: 'edge', input: '0 7', output: '0', note: '分子為 0' },
        { kind: 'edge', input: '1000000000 999999999', output: '1000000000/999999999', note: '已是最簡分數的大數' },
        { kind: 'error', input: '5 0', output: 'Invalid', note: '分母不能是 0' },
      ],
      hints: ['gcd(a, b)：當 b 不為 0 時，換成 gcd(b, a % b)；先取絕對值，避免負數取餘數在各語言結果不同。', '回傳兩個值：C++ 的 pair、Python 的 tuple、Java 的陣列或 record、JavaScript 的陣列。', '約分後若分母為負，分子分母同乘 −1。'],
      solution: {
        'C++': code`#include <cstdlib>
#include <iostream>
#include <utility>

long long gcd(long long a, long long b) {
    a = std::llabs(a);
    b = std::llabs(b);
    while (b != 0) {
        long long t = a % b;
        a = b;
        b = t;
    }
    return a;
}

std::pair<long long, long long> reduce(long long a, long long b) {
    long long g = gcd(a, b);
    a /= g;
    b /= g;
    if (b < 0) { a = -a; b = -b; }
    return {a, b};
}

int main() {
    long long a, b;
    std::cin >> a >> b;
    if (b == 0) { std::cout << "Invalid\n"; return 0; }
    if (a == 0) { std::cout << "0\n"; return 0; }
    auto [p, q] = reduce(a, b);
    if (q == 1) std::cout << p << "\n";
    else std::cout << p << "/" << q << "\n";
    return 0;
}`,
        Python: code`def gcd(a, b):
    a, b = abs(a), abs(b)
    while b != 0:
        a, b = b, a % b
    return a


def reduce(a, b):
    g = gcd(a, b)
    a, b = a // g, b // g
    if b < 0:
        a, b = -a, -b
    return a, b


a, b = map(int, input().split())
if b == 0:
    print("Invalid")
elif a == 0:
    print(0)
else:
    p, q = reduce(a, b)
    print(p if q == 1 else f"{p}/{q}")`,
        Java: code`import java.util.Scanner;

public class Main {
    static long gcd(long a, long b) {
        a = Math.abs(a);
        b = Math.abs(b);
        while (b != 0) {
            long t = a % b;
            a = b;
            b = t;
        }
        return a;
    }

    static long[] reduce(long a, long b) {
        long g = gcd(a, b);
        a /= g;
        b /= g;
        if (b < 0) { a = -a; b = -b; }
        return new long[]{a, b};
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        long a = sc.nextLong(), b = sc.nextLong();
        if (b == 0) { System.out.println("Invalid"); return; }
        if (a == 0) { System.out.println(0); return; }
        long[] r = reduce(a, b);
        System.out.println(r[1] == 1 ? String.valueOf(r[0]) : r[0] + "/" + r[1]);
    }
}`,
        JavaScript: code`function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
        [a, b] = [b, a % b];
    }
    return a;
}

function reduce(a, b) {
    const g = gcd(a, b);
    a /= g;  // g 整除 a 與 b，結果仍是整數
    b /= g;
    if (b < 0) {
        a = -a;
        b = -b;
    }
    return [a, b];
}

const [a, b] = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
if (b === 0) {
    console.log("Invalid");
} else if (a === 0) {
    console.log(0);
} else {
    const [p, q] = reduce(a, b);
    console.log(q === 1 ? String(p) : p + "/" + q);
}`,
      },
      judge: 'none',
    },
  ],
};

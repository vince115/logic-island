import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * F15 變數作用域. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); `let`/`const` are block scoped, so the `block` example prints 14 like C++/Java.
 */
export const F15: LessonContent = {
  lessonId: 'F15',
  motivation: '「明明改了變數，為什麼外面沒變？」「為什麼這裡說變數不存在？」這些錯誤都來自作用域。知道一個名字在哪裡看得見、活多久，才能避免同名變數互相干擾，也能讀懂 APCS 觀念題中的函式追蹤題。',
  sections: [
    {
      id: 'local-variables', title: '區域變數：只屬於這一次呼叫',
      blocks: [
        { type: 'p', text: '在函式裡建立的變數是區域變數（local variable）：只在這個函式裡看得見，函式結束就消失。不同函式可以有同名的區域變數，它們彼此無關；呼叫者的同名變數也不會被改到。' },
        { type: 'example', id: 'local' },
        { type: 'p', text: '在下方的視覺化中觀察呼叫堆疊：每一層各有自己的變數，函式 return 後，它的區域變數跟著那一層一起消失。' },
      ],
    },
    {
      id: 'blocks', title: '區塊作用域：C++／Java 與 Python 不同',
      blocks: [
        { type: 'p', text: 'C++ 與 Java 中，每一對大括號 `{ }` 都形成一個區塊：在 if、for 或 `{ }` 裡宣告的變數，離開區塊就看不見了。Python 的 if、for、while 不會產生新的作用域，只有函式（和類別）會；在 for 裡建立的變數，迴圈結束後仍然存在。JavaScript 用 `let`、`const` 宣告的變數和 C++／Java 一樣屬於所在的 `{ }` 區塊，離開區塊就看不見。' },
        { type: 'example', id: 'block' },
        { type: 'callout', tone: 'note', title: 'Java 不允許在內層區塊重複宣告同名區域變數', text: 'C++ 與 JavaScript（`let`／`const`）可以在內層區塊再宣告一個同名變數（遮蔽外層的），Java 則會編譯錯誤「variable already defined」。Java 只允許區域變數遮蔽類別的欄位（field）。' },
      ],
    },
    {
      id: 'global', title: '全域變數與 Python 的 global',
      blocks: [
        { type: 'p', text: '寫在所有函式之外的變數是全域變數：C++ 寫在檔案最外層，Java 用類別中的 `static` 欄位，Python 寫在模組最外層，JavaScript 寫在檔案最外層。函式可以讀取它們；JavaScript 的函式也能直接修改它們，不需要額外宣告。' },
        { type: 'p', text: 'Python 有一個重要規則：只要函式裡「指定」了某個名字（包括 `count += 1`），這個名字在整個函式中就被當成區域變數。如果它在指定之前就被讀取，會得到 `UnboundLocalError`。要修改全域變數，必須先宣告 `global count`。' },
        { type: 'example', id: 'counter' },
        { type: 'callout', tone: 'warning', title: '少用全域變數', text: '全域變數讓任何函式都能改它，出錯時很難追是誰改的。比較好的做法是把需要的值當參數傳入、把結果回傳（上一課），或把相關資料放在同一個結構裡。在競賽中為了方便使用全域陣列很常見，但要清楚它的生命週期。' },
      ],
    },
    {
      id: 'shadowing', title: '名稱遮蔽',
      blocks: [
        { type: 'p', text: '內層作用域宣告了和外層同名的變數時，內層的名字會遮蔽（shadow）外層的：在內層裡用這個名字，指的都是內層那一個。這是合法的，但很容易讓人以為自己改的是外層變數。' },
        { type: 'list', items: ['給變數取不同、有意義的名字，例如外層 `total`、內層 `rowTotal`。', '讀程式時遇到同名變數，先找出「最近的那一個宣告」。', 'C++ 編譯時加上 `-Wshadow` 可以讓編譯器提醒遮蔽。'] },
      ],
    },
  ],
  examples: [
    {
      id: 'local', title: '函式的區域變數不會改到呼叫者', description: '函式裡的 n 是自己的區域變數，與 main 的 n 同名但無關。',
      output: '1',
      code: {
        'C++': code`#include <iostream>

void setN() {
    int n = 99;  // 自己的區域變數
    (void)n;
}

int main() {
    int n = 1;
    setN();
    std::cout << n << "\n";
    return 0;
}`,
        Python: code`def set_n():
    n = 99  # 指定 → 這是區域變數


n = 1
set_n()
print(n)`,
        Java: code`public class Main {
    static void setN() {
        int n = 99;  // 自己的區域變數
    }

    public static void main(String[] args) {
        int n = 1;
        setN();
        System.out.println(n);
    }
}`,
        JavaScript: code`function setN() {
    const n = 99;  // 自己的區域變數
}

const n = 1;
setN();
console.log(n);`,
      },
    },
    {
      id: 'block', title: '迴圈裡的變數，迴圈外還在嗎？', description: 'sq 在迴圈內建立。C++／Java／JavaScript 離開迴圈後 sq 不存在，只能印出 sum；Python 的 sq 仍然存在，保留最後一個值 9。',
      output: '14', outputByLanguage: { Python: '14 9' },
      code: {
        'C++': code`#include <iostream>

int main() {
    int sum = 0;
    for (int i = 1; i <= 3; ++i) {
        int sq = i * i;  // 只在這個區塊內有效
        sum += sq;
    }
    // 這裡寫 sq 會編譯錯誤：sq 已經不存在
    std::cout << sum << "\n";
    return 0;
}`,
        Python: code`total = 0
for i in range(1, 4):
    sq = i * i  # Python 的 for 不會產生新的作用域
    total += sq
print(total, sq)  # sq 仍然存在，是最後一輪的 9`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int sum = 0;
        for (int i = 1; i <= 3; ++i) {
            int sq = i * i;  // 只在這個區塊內有效
            sum += sq;
        }
        // 這裡寫 sq 會編譯錯誤：sq 已經不存在
        System.out.println(sum);
    }
}`,
        JavaScript: code`let sum = 0;
for (let i = 1; i <= 3; i++) {
    const sq = i * i;  // let／const 只在這個區塊內有效
    sum += sq;
}
// 這裡寫 sq 會發生 ReferenceError：sq 已經不存在
console.log(sum);`,
      },
    },
    {
      id: 'counter', title: '用全域變數計算呼叫次數', description: 'C++ 的全域變數、Java 的 static 欄位、Python 的 global 宣告、JavaScript 檔案最外層的 let。',
      output: '3',
      code: {
        'C++': code`#include <iostream>

int calls = 0;  // 全域變數

void hit() {
    calls++;
}

int main() {
    hit();
    hit();
    hit();
    std::cout << calls << "\n";
    return 0;
}`,
        Python: code`calls = 0


def hit():
    global calls  # 沒有這一行，calls += 1 會引發 UnboundLocalError
    calls += 1


hit()
hit()
hit()
print(calls)`,
        Java: code`public class Main {
    static int calls = 0;  // 類別的 static 欄位

    static void hit() {
        calls++;
    }

    public static void main(String[] args) {
        hit();
        hit();
        hit();
        System.out.println(calls);
    }
}`,
        JavaScript: code`let calls = 0;  // 檔案最外層的變數

function hit() {
    calls++;  // 直接修改外層的 calls，不需要宣告
}

hit();
hit();
hit();
console.log(calls);`,
      },
    },
  ],
  visualization: {
    kind: 'function-call', title: '全域變數與區域變數（Python）', language: 'Python',
    code: code`calls = 0
def hit(n):
    global calls
    calls += 1
    total = n * 2
    return total
x = hit(5)
y = hit(1)`,
    steps: [
      { line: 1, note: '全域作用域：calls = 0。', frames: [{ name: '全域', vars: { calls: '0' } }] },
      { line: 7, note: '呼叫 hit(5)：堆疊多一層，n 是 hit 的參數（區域變數）。', frames: [{ name: '全域', vars: { calls: '0' } }, { name: 'hit(5)', vars: { n: '5' } }] },
      { line: 4, note: '因為有 global calls，這裡改的是全域的 calls：變成 1。', frames: [{ name: '全域', vars: { calls: '1' } }, { name: 'hit(5)', vars: { n: '5' } }] },
      { line: 5, note: 'total 是 hit 的區域變數：10。', frames: [{ name: '全域', vars: { calls: '1' } }, { name: 'hit(5)', vars: { n: '5', total: '10' } }] },
      { line: 6, note: '回傳 10。這一層連同 n 與 total 一起消失。', frames: [{ name: '全域', vars: { calls: '1' } }, { name: 'hit(5)', vars: { n: '5', total: '10' }, returns: '10' }] },
      { line: 7, note: '全域的 x = 10。全域作用域看不到 total。', frames: [{ name: '全域', vars: { calls: '1', x: '10' } }] },
      { line: 8, note: '呼叫 hit(1)：新的一層，新的 n 與 total；calls 變成 2，回傳 2。', frames: [{ name: '全域', vars: { calls: '2', x: '10' } }, { name: 'hit(1)', vars: { n: '1', total: '2' }, returns: '2' }] },
      { line: 8, note: 'y = 2。程式結束時，全域只有 calls、x、y（以及函式 hit 本身）。', frames: [{ name: '全域', vars: { calls: '2', x: '10', y: '2' } }] },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'x = 10\ndef f():\n    x = 5\n    return x\n\nprint(f(), x)' },
      options: ['5 5', '5 10', '10 10', 'UnboundLocalError'],
      answer: 1, explanation: 'f 裡指定了 x，所以那個 x 是 f 的區域變數；全域的 x 仍是 10。f() 回傳 5。',
    },
    {
      id: 'q2', prompt: '下面的 Python 程式會怎樣？',
      code: { language: 'Python', text: 'count = 0\ndef inc():\n    count += 1\n\ninc()\nprint(count)' },
      options: ['印出 1', '印出 0', 'UnboundLocalError', 'NameError: count 未定義'],
      answer: 2, explanation: '函式裡對 count 做了指定（`+=`），Python 就把 count 當成 inc 的區域變數；`count += 1` 要先讀取它，但區域的 count 還沒有值，因此出錯。加上 `global count` 才能修改全域變數。',
    },
    {
      id: 'q3', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'int x = 1;\nif (true) {\n    int x = 2;\n}\nstd::cout << x;' },
      options: ['1', '2', '編譯錯誤：x 重複宣告', '未定義'],
      answer: 0, explanation: 'if 的區塊中宣告了新的 x，遮蔽了外層的 x，但只在區塊內有效；離開區塊後 x 指的是外層的 1。同樣的寫法在 Java 會編譯錯誤，在 Python 則是同一個變數（會印出 2）。',
    },
    {
      id: 'q4', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'if True:\n    y = 3\nprint(y)' },
      options: ['3', 'NameError：y 只在 if 裡有效', 'None', '語法錯誤'],
      answer: 0, explanation: 'Python 的 if 區塊不會產生新的作用域，y 在 if 之後仍然存在。C++ 與 Java 在 if 的大括號裡宣告的變數，離開後就看不見。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '帳戶餘額（不用全域變數）',
      statement: '模擬一個帳戶：一開始餘額為 0，依序處理 n 筆操作。`D x` 存入 x 元；`W x` 提出 x 元，餘額不足時輸出 `Insufficient` 並忽略這筆；其他指令輸出 `Unknown` 並忽略。全部處理完後輸出餘額。請把存款與提款寫成函式：接收目前餘額與金額、回傳新的餘額，不要使用全域變數。',
      inputFormat: '第一行 n；接下來 n 行，每行一個指令字母與一個非負整數。',
      outputFormat: '依序輸出每一筆 `Insufficient` 或 `Unknown` 訊息（各佔一行），最後一行輸出餘額。',
      constraints: ['0 ≤ n ≤ 1,000', '0 ≤ x ≤ 10⁹（餘額可能超過 32 位元整數）'],
      samples: [{ kind: 'normal', input: '3\nD 50\nW 80\nW 20', output: 'Insufficient\n30', note: '第二筆提款超過餘額 50' }],
      tests: [
        { kind: 'normal', input: '3\nD 100\nW 30\nD 5', output: '75', note: '一般情況' },
        { kind: 'normal', input: '3\nD 50\nW 80\nW 20', output: 'Insufficient\n30', note: '餘額不足的提款被忽略' },
        { kind: 'edge', input: '0', output: '0', note: '沒有操作' },
        { kind: 'edge', input: '2\nD 7\nW 7', output: '0', note: '剛好提領全部' },
        { kind: 'edge', input: '3\nD 1000000000\nD 1000000000\nD 1000000000', output: '3000000000', note: '餘額超過 int 上限' },
        { kind: 'error', input: '2\nX 10\nD 5', output: 'Unknown\n5', note: '不認識的指令' },
      ],
      hints: ['`deposit(balance, x)` 回傳 balance + x。', '`withdraw(balance, x)` 需要同時表達「成功與否」與「新餘額」：可以回傳一對值，或在 main 中先檢查是否足夠再呼叫。'],
      solution: {
        'C++': code`#include <iostream>
#include <utility>

long long deposit(long long balance, long long x) {
    return balance + x;
}

std::pair<bool, long long> withdraw(long long balance, long long x) {
    if (x > balance) return {false, balance};
    return {true, balance - x};
}

int main() {
    int n;
    std::cin >> n;
    long long balance = 0;  // main 的區域變數，透過參數與回傳值傳遞
    for (int i = 0; i < n; ++i) {
        char op;
        long long x;
        std::cin >> op >> x;
        if (op == 'D') {
            balance = deposit(balance, x);
        } else if (op == 'W') {
            auto [ok, next] = withdraw(balance, x);
            if (!ok) std::cout << "Insufficient\n";
            balance = next;
        } else {
            std::cout << "Unknown\n";
        }
    }
    std::cout << balance << "\n";
    return 0;
}`,
        Python: code`import sys


def deposit(balance, x):
    return balance + x


def withdraw(balance, x):
    if x > balance:
        return False, balance
    return True, balance - x


data = sys.stdin.read().split()
n = int(data[0])
balance = 0
for i in range(n):
    op, x = data[1 + 2 * i], int(data[2 + 2 * i])
    if op == "D":
        balance = deposit(balance, x)
    elif op == "W":
        ok, balance = withdraw(balance, x)
        if not ok:
            print("Insufficient")
    else:
        print("Unknown")
print(balance)`,
        Java: code`import java.util.Scanner;

public class Main {
    static long deposit(long balance, long x) {
        return balance + x;
    }

    /** The new balance, or -1 when there is not enough money. */
    static long withdraw(long balance, long x) {
        return x > balance ? -1 : balance - x;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        long balance = 0;
        for (int i = 0; i < n; ++i) {
            String op = sc.next();
            long x = sc.nextLong();
            if (op.equals("D")) {
                balance = deposit(balance, x);
            } else if (op.equals("W")) {
                long next = withdraw(balance, x);
                if (next < 0) System.out.println("Insufficient");
                else balance = next;
            } else {
                System.out.println("Unknown");
            }
        }
        System.out.println(balance);
    }
}`,
        JavaScript: code`function deposit(balance, x) {
    return balance + x;
}

function withdraw(balance, x) {
    if (x > balance) return [false, balance];
    return [true, balance - x];
}

const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/);
const n = Number(data[0]);
const out = [];
let balance = 0;  // 只在這裡使用，透過參數與回傳值傳遞
for (let i = 0; i < n; i++) {
    const op = data[1 + 2 * i];
    const x = Number(data[2 + 2 * i]);
    if (op === "D") {
        balance = deposit(balance, x);
    } else if (op === "W") {
        const [ok, next] = withdraw(balance, x);
        if (!ok) out.push("Insufficient");
        balance = next;
    } else {
        out.push("Unknown");
    }
}
out.push(String(balance));
console.log(out.join("\n"));`,
      },
      judge: 'none',
    },
  ],
};

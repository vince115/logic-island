import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * F11 一維陣列. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also
 * offers JavaScript (Node.js); like Java, `b = a` shares one array, so the alias example prints 99 99 (the default output).
 */
export const F11: LessonContent = {
  lessonId: 'F11',
  motivation: '只用變數，一次只能記住一個值；「先讀完全部分數，再找出高於平均的人」這種需要回頭看資料的問題就做不到。陣列讓你用一個名字存放一整排資料，並用索引隨時取用，是之後所有資料結構的基礎。',
  sections: [
    {
      id: 'why-arrays', title: '一個名字，一整排資料',
      blocks: [
        { type: 'p', text: '陣列（array）把多個同型別的值依序放在一起，用「名字＋索引」取用：`a[0]` 是第一個、`a[n - 1]` 是最後一個。索引從 0 開始，和字串一樣。各語言建立陣列的方式不同：' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java', 'JavaScript'], rows: [
          ['長度 n、全部為 0', '`std::vector<int> a(n);`', '`a = [0] * n`', '`int[] a = new int[n];`', '`const a = new Array(n).fill(0);`'],
          ['直接給值', '`std::vector<int> a = {8, 3, 6};`', '`a = [8, 3, 6]`', '`int[] a = {8, 3, 6};`', '`const a = [8, 3, 6];`'],
          ['長度', '`a.size()`', '`len(a)`', '`a.length`', '`a.length`'],
          ['長度可變嗎', 'vector 可以（`push_back`）', '可以（`append`）', '不行（要用 `ArrayList`）', '可以（`push`）'],
        ] },
        { type: 'callout', tone: 'warning', title: 'C++ 的區域陣列不會自動清為 0', text: '在函式中宣告 `int a[5];`，內容是不確定的殘留值。`std::vector<int> a(5)` 會清為 0，Java 的 `new int[5]` 也會。初學建議 C++ 一律使用 vector。JavaScript 的 `new Array(5)` 則是 5 個空位（讀到 `undefined`），要加 `.fill(0)`。' },
      ],
    },
    {
      id: 'read-and-traverse', title: '讀入、走訪與「需要回頭看」的問題',
      blocks: [
        { type: 'p', text: '常見的輸入格式是「先給 n，再給 n 個數」。先建立長度 n 的陣列，再用迴圈把每個數放進去；之後可以用另一個迴圈依任何順序取用。例如倒序輸出：' },
        { type: 'example', id: 'reverse' },
        { type: 'p', text: '「有幾個人高於平均」必須先知道平均，而平均要等全部讀完才算得出來，所以要把資料存起來再走第二遍——這正是陣列的用途。比較時把「分數 > 總和 ÷ n」改寫成「分數 × n > 總和」，全程使用整數，就不會有浮點誤差。' },
        { type: 'example', id: 'above' },
        { type: 'p', text: '下方的視覺化逐步執行陣列的讀取、寫入與越界存取，每個格子會以文字標示「讀取」「寫入」。' },
      ],
    },
    {
      id: 'bounds', title: '索引越界：各語言的反應不同',
      blocks: [
        { type: 'p', text: '長度 5 的陣列，合法索引是 0～4。存取 `a[5]` 或 `a[-1]` 都是越界（out of bounds），但各語言的反應差很多：' },
        { type: 'list', items: [
          'C++：`a[5]` 不檢查範圍，是未定義行為——可能讀到垃圾值、可能改壞別的變數、也可能當掉，而且不一定每次都一樣。`a.at(5)` 會檢查並丟出 `std::out_of_range`。',
          'Python：丟出 `IndexError`。注意 `a[-1]` 不是越界，它是最後一個元素。',
          'Java：丟出 `ArrayIndexOutOfBoundsException`。',
          'JavaScript：不會出錯，`a[5]` 與 `a[-1]` 都得到 `undefined`（`a.at(-1)` 才是最後一個元素）；寫入 `a[5] = 1` 甚至會讓陣列變長，錯誤更難發現。',
        ] },
        { type: 'callout', tone: 'tip', title: '寫迴圈條件時對照長度', text: '走訪長度 n 的陣列，迴圈寫 `i < n`（或 Python 的 `range(n)`），不要寫 `i <= n`。用 `a[i + 1]` 時，迴圈要停在 `i < n - 1`。' },
      ],
    },
    {
      id: 'copying', title: '複製陣列：C++ 複製內容，Python、Java 與 JavaScript 共用同一份',
      blocks: [
        { type: 'p', text: '`b = a` 之後修改 b，a 會不會跟著變？這是各語言差異最大的地方之一：C++ 的 vector 指定會複製整份內容，兩者互不影響；Python 的 list、Java 與 JavaScript 的陣列變數存的是「參考」，`b = a` 讓兩個名字指向同一份資料，改 b 就是改 a。' },
        { type: 'example', id: 'alias' },
        { type: 'p', text: '需要獨立的副本時：Python 用 `b = a.copy()` 或 `a[:]`，Java 用 `a.clone()` 或 `Arrays.copyOf(a, a.length)`，JavaScript 用 `a.slice()` 或 `[...a]`。這個差異在下一課「參數與回傳值」中，把陣列傳進函式時會再次出現。' },
      ],
    },
  ],
  examples: [
    {
      id: 'reverse', title: '倒序輸出', description: '讀入 n 與 n 個整數，先全部存進陣列，再從最後一個印回第一個。',
      stdin: '5\n1 2 3 4 5', output: '5 4 3 2 1',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int n;
    std::cin >> n;
    std::vector<int> a(n);
    for (int i = 0; i < n; ++i) std::cin >> a[i];
    for (int i = n - 1; i >= 0; --i) {
        std::cout << a[i] << (i > 0 ? " " : "\n");
    }
    return 0;
}`,
        Python: code`n = int(input())
a = list(map(int, input().split()))
print(*a[::-1])  # [::-1] 產生倒序的新 list`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; ++i) a[i] = sc.nextInt();
        StringBuilder out = new StringBuilder();
        for (int i = n - 1; i >= 0; --i) {
            out.append(a[i]).append(i > 0 ? " " : "");
        }
        System.out.println(out);
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = data[0];
const a = data.slice(1, 1 + n);
const out = [];
for (let i = n - 1; i >= 0; --i) out.push(a[i]);
console.log(out.join(" "));`,
      },
    },
    {
      id: 'above', title: '高於平均的人數', description: '先存起來再走第二遍；用「分數 × n > 總和」避開小數。',
      stdin: '5\n60 70 80 90 100', output: '2',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int n;
    std::cin >> n;
    std::vector<long long> a(n);
    long long sum = 0;
    for (auto& x : a) {
        std::cin >> x;
        sum += x;
    }
    int count = 0;
    for (long long x : a) {
        if (x * n > sum) count++;
    }
    std::cout << count << "\n";
    return 0;
}`,
        Python: code`n = int(input())
a = list(map(int, input().split()))
total = sum(a)
print(sum(1 for x in a if x * n > total))`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        long[] a = new long[n];
        long sum = 0;
        for (int i = 0; i < n; ++i) {
            a[i] = sc.nextLong();
            sum += a[i];
        }
        int count = 0;
        for (long x : a) {
            if (x * n > sum) count++;
        }
        System.out.println(count);
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = data[0];
const a = data.slice(1, 1 + n);
let sum = 0;
for (const x of a) sum += x;
let count = 0;
for (const x of a) {
    if (x * n > sum) count++;
}
console.log(count);`,
      },
    },
    {
      id: 'alias', title: 'b = a 之後修改 b', description: '同一段程式在各語言的結果不同：C++ 印出 1 99，Python、Java 與 JavaScript 印出 99 99。',
      output: '99 99', outputByLanguage: { 'C++': '1 99' },
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    std::vector<int> a = {1, 2, 3};
    std::vector<int> b = a;  // 複製一份新的內容
    b[0] = 99;
    std::cout << a[0] << " " << b[0] << "\n";
    return 0;
}`,
        Python: code`a = [1, 2, 3]
b = a  # 兩個名字指向同一個 list
b[0] = 99
print(a[0], b[0])`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int[] a = {1, 2, 3};
        int[] b = a;  // 兩個變數指向同一個陣列
        b[0] = 99;
        System.out.println(a[0] + " " + b[0]);
    }
}`,
        JavaScript: code`const a = [1, 2, 3];
const b = a;  // 兩個變數指向同一個陣列
b[0] = 99;
console.log(a[0], b[0]);`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '讀取、寫入與越界', language: 'C++',
    code: code`std::vector<int> a = {8, 3, 6, 2, 7};
int sum = 0;
for (int i = 0; i < 5; i++) sum += a[i];
a[2] = 9;
std::cout << a[5];`,
    steps: [
      { line: 1, note: '建立長度 5 的陣列，索引 0～4。', arrays: [{ name: 'a', cells: ['8', '3', '6', '2', '7'] }] },
      { line: 2, note: 'sum = 0。', vars: { sum: '0' }, arrays: [{ name: 'a', cells: ['8', '3', '6', '2', '7'] }] },
      { line: 3, note: 'i = 0，讀取 a[0] = 8，sum = 8。', vars: { sum: '8', i: '0' }, loops: [{ label: 'for i', iteration: 1, condition: '0 < 5', holds: true }], arrays: [{ name: 'a', cells: ['8', '3', '6', '2', '7'], marks: [{ at: 0, kind: 'read' }] }] },
      { line: 3, note: 'i = 1，讀取 a[1] = 3，sum = 11。', vars: { sum: '11', i: '1' }, loops: [{ label: 'for i', iteration: 2, condition: '1 < 5', holds: true }], arrays: [{ name: 'a', cells: ['8', '3', '6', '2', '7'], marks: [{ at: 1, kind: 'read' }] }] },
      { line: 3, note: '依序讀到 a[4]，sum = 8 + 3 + 6 + 2 + 7 = 26。', vars: { sum: '26', i: '4' }, loops: [{ label: 'for i', iteration: 5, condition: '4 < 5', holds: true }], arrays: [{ name: 'a', cells: ['8', '3', '6', '2', '7'], marks: [{ at: 4, kind: 'read' }] }] },
      { line: 3, note: 'i = 5，5 < 5 不成立，迴圈在越界之前就停下。', vars: { sum: '26', i: '5' }, loops: [{ label: 'for i', iteration: 6, condition: '5 < 5', holds: false }], arrays: [{ name: 'a', cells: ['8', '3', '6', '2', '7'] }] },
      { line: 4, note: '寫入 a[2]：6 被改成 9，長度不變。', vars: { sum: '26' }, arrays: [{ name: 'a', cells: ['8', '3', '9', '2', '7'], marks: [{ at: 2, kind: 'write' }] }] },
      { line: 5, note: 'a[5] 越界。C++ 的 [] 不會檢查，這是未定義行為：可能印出任意值，也可能當掉。用 a.at(5) 則會丟出 std::out_of_range。', vars: { sum: '26' }, arrays: [{ name: 'a', cells: ['8', '3', '9', '2', '7'], marks: [{ at: 5, kind: 'bad' }] }] },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'a = [10, 20, 30, 40]\nprint(a[len(a) - 1] - a[1])' },
      options: ['10', '20', '30', 'IndexError'],
      answer: 1, explanation: '`len(a) - 1` 是 3，`a[3]` 是 40；`a[1]` 是 20（索引從 0 開始）。40 − 20 = 20。',
    },
    {
      id: 'q2', prompt: '下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: 'int[] a = new int[3];\na[1] = 5;\nSystem.out.println(a[0] + a[2]);' },
      options: ['0', '5', '不確定的值', '編譯錯誤，a[0] 沒有初始值'],
      answer: 0, explanation: 'Java 用 `new int[3]` 建立的陣列，每個元素都會自動設為 0，所以 a[0] + a[2] = 0。C++ 的 `int a[3];`（區域變數）則不會自動清為 0。',
    },
    {
      id: 'q3', prompt: '關於下面的 C++ 程式，哪一個敘述正確？',
      code: { language: 'C++', text: 'std::vector<int> a = {1, 2, 3};\nstd::cout << a[3];' },
      options: ['一定印出 0', '編譯錯誤', '未定義行為：可能印出任意值或當掉', '一定丟出 out_of_range 例外'],
      answer: 2, explanation: '合法索引是 0～2，`a[3]` 越界。C++ 的 `[]` 不檢查範圍，結果是未定義行為，可能「看起來正常」地印出某個值，所以更危險。用 `a.at(3)` 才會丟出 `std::out_of_range`。',
    },
    {
      id: 'q4', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'a = [1, 2, 3]\nb = a\nb.append(4)\nprint(len(a))' },
      options: ['3', '4', '7', 'NameError'],
      answer: 1, explanation: '`b = a` 沒有複製 list，b 和 a 是同一個物件，所以 append 到 b 也就是 append 到 a，長度變成 4。要獨立副本請用 `a.copy()`。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '高於平均的座號',
      statement: '全班 n 人依座號 1～n 給出分數。輸出分數「嚴格高於」全班平均的人數，以及他們的座號（由小到大）。不得使用浮點數比較：請把「分數 > 總和 ÷ n」改寫成整數比較。n 為 0 時輸出 `Empty`。',
      inputFormat: '第一行整數 n；若 n > 0，第二行有 n 個整數分數。',
      outputFormat: '兩行：第一行為人數；第二行為座號，以空白分隔，沒有人時輸出 `None`。n 為 0 時只輸出 `Empty`。',
      constraints: ['0 ≤ n ≤ 100,000', '0 ≤ 分數 ≤ 100'],
      samples: [{ kind: 'normal', input: '5\n60 70 80 90 100', output: '2\n4 5', note: '平均 80，90 與 100 高於平均' }],
      tests: [
        { kind: 'normal', input: '5\n60 70 80 90 100', output: '2\n4 5', note: '一般情況' },
        { kind: 'normal', input: '4\n90 10 50 50', output: '1\n1', note: '平均 50，等於平均的不算' },
        { kind: 'edge', input: '1\n77', output: '0\nNone', note: '只有一人，不可能高於自己' },
        { kind: 'edge', input: '3\n100 100 100', output: '0\nNone', note: '全部相同' },
        { kind: 'edge', input: '6\n0 0 0 0 0 1', output: '1\n6', note: '平均 1/6，不是整數；用整數比較才不會出錯' },
        { kind: 'error', input: '0', output: 'Empty', note: '沒有學生，平均沒有意義' },
      ],
      hints: ['第一遍讀入並加總，第二遍比較。', '`score > sum / n` 等價於 `score * n > sum`（n > 0）。', '座號是索引 + 1。'],
      solution: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int n;
    std::cin >> n;
    if (n == 0) {
        std::cout << "Empty\n";
        return 0;
    }
    std::vector<long long> a(n);
    long long sum = 0;
    for (auto& x : a) {
        std::cin >> x;
        sum += x;
    }
    std::vector<int> seats;
    for (int i = 0; i < n; ++i) {
        if (a[i] * n > sum) seats.push_back(i + 1);
    }
    std::cout << seats.size() << "\n";
    if (seats.empty()) {
        std::cout << "None\n";
    } else {
        for (size_t i = 0; i < seats.size(); ++i) std::cout << seats[i] << (i + 1 < seats.size() ? " " : "\n");
    }
    return 0;
}`,
        Python: code`import sys

data = sys.stdin.read().split()
n = int(data[0])
if n == 0:
    print("Empty")
else:
    a = [int(x) for x in data[1:1 + n]]
    total = sum(a)
    seats = [i + 1 for i in range(n) if a[i] * n > total]
    print(len(seats))
    print(" ".join(map(str, seats)) if seats else "None")`,
        Java: code`import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        if (n == 0) {
            System.out.println("Empty");
            return;
        }
        long[] a = new long[n];
        long sum = 0;
        for (int i = 0; i < n; ++i) {
            a[i] = sc.nextLong();
            sum += a[i];
        }
        List<String> seats = new ArrayList<>();
        for (int i = 0; i < n; ++i) {
            if (a[i] * n > sum) seats.add(String.valueOf(i + 1));
        }
        System.out.println(seats.size());
        System.out.println(seats.isEmpty() ? "None" : String.join(" ", seats));
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = data[0];
if (n === 0) {
    console.log("Empty");
} else {
    const a = data.slice(1, 1 + n);
    let sum = 0;
    for (const x of a) sum += x;
    const seats = [];
    for (let i = 0; i < n; ++i) {
        if (a[i] * n > sum) seats.push(i + 1);  // 座號是索引 + 1
    }
    console.log(seats.length);
    console.log(seats.length === 0 ? "None" : seats.join(" "));
}`,
      },
      judge: 'none',
    },
  ],
};

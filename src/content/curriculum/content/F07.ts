import type { LessonContent } from '../schema';

const code = String.raw;

/** F07 For 迴圈. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F07: LessonContent = {
  lessonId: 'F07',
  motivation: '電腦最擅長的是不厭其煩地重複。有了迴圈，「把 1 到 100 加起來」「找出 10 萬筆資料的最大值」都只要幾行程式；幾乎每一題 APCS 實作題都會用到它。',
  sections: [
    {
      id: 'for-structure', title: 'for 迴圈的三個部分',
      blocks: [
        { type: 'p', text: '當你知道「要重複幾次」或「要走過哪些值」時，就用 for 迴圈。C++ 與 Java 的 for 由三部分組成：初始（只執行一次）、條件（每一輪開始前檢查）、更新（每一輪結束後執行）。' },
        { type: 'list', ordered: true, items: ['初始：`int i = 1`，建立迴圈變數。', '檢查條件 `i <= n`：成立就執行迴圈本體，不成立就離開迴圈。', '執行本體。', '更新：`++i`，然後回到第 2 步。'] },
        { type: 'p', text: 'Python 的 for 則是「依序取出一串值」：`for i in range(1, n + 1)` 讓 i 依序是 1、2、…、n。`range(start, stop, step)` **不包含** stop，所以 `range(1, 6)` 是 1 到 5，`range(5)` 是 0 到 4。' },
        { type: 'example', id: 'sum' },
        { type: 'p', text: '在下方的視覺化中逐步執行一個小迴圈，觀察每一輪的條件檢查、迴圈變數與累加的結果，以及條件不成立時迴圈如何結束。' },
      ],
    },
    {
      id: 'counting', title: '預測迴圈的次數與每一輪的值',
      blocks: [
        { type: 'p', text: '讀迴圈時，先算出它會執行幾次、迴圈變數依序是哪些值。從 a 開始、每次加 1、到 b（含）為止，共 b − a + 1 次；Python 的 `range(a, b)` 則是 b − a 次。步長不是 1 時，例如 `for (int i = 0; i <= 10; i += 2)`，i 依序是 0、2、4、6、8、10，共 6 次。' },
        { type: 'p', text: '步長也可以是負的，用來倒數。注意 Python 倒數時 stop 同樣不包含在內：`range(5, 0, -1)` 是 5、4、3、2、1。' },
        { type: 'example', id: 'countdown' },
      ],
    },
    {
      id: 'patterns', title: '三種常用模式：累加、計數、找最大值',
      blocks: [
        { type: 'p', text: '大部分迴圈題都是這三種模式的組合。關鍵是「迴圈開始前」先把變數設好初始值：' },
        { type: 'table', head: ['模式', '迴圈前', '每一輪'], rows: [
          ['累加', '`total = 0`', '`total += x`'],
          ['計數', '`count = 0`', '符合條件時 `count += 1`'],
          ['最大值', '`best =` 第一個值', '`x > best` 時 `best = x`'],
        ] },
        { type: 'example', id: 'stats' },
        { type: 'callout', tone: 'warning', title: '最大值的初始值不要用 0', text: '如果資料全是負數，把 best 設成 0 會得到錯誤的最大值 0。用「第一筆資料」當初始值，或使用語言提供的最小值（C++ 的 `LLONG_MIN`、Java 的 `Long.MIN_VALUE`、Python 的 `float("-inf")`）。' },
      ],
    },
    {
      id: 'off-by-one', title: '差一錯誤與迴圈變數',
      blocks: [
        { type: 'p', text: '迴圈最常見的錯誤是多跑或少跑一輪，稱為差一錯誤（off-by-one）。例如要加 1 到 n，卻寫成 `i < n`，就漏掉了 n。檢查方法：代入最小的 n（例如 n = 1）手動走一遍，確認第一輪和最後一輪的值。' },
        { type: 'list', items: [
          'C++ 與 Java 在 for 裡宣告的 `i`，離開迴圈後就不存在了；Python 的 `i` 會保留最後一個值。',
          '不要在迴圈本體中修改迴圈變數（例如在本體裡寫 `i++`），這會讓次數難以預測。',
          'Python 的 `range` 在迴圈開始時就決定好了；在迴圈中改變 n 不會改變次數。C++ 與 Java 每一輪都會重新檢查 `i <= n`，在迴圈中改變 n 就會改變次數。',
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'sum', title: '1 加到 n', description: '讀入 n，輸出 1 + 2 + … + n。注意 Python 的 range 要寫到 n + 1。',
      stdin: '5', output: '15',
      code: {
        'C++': code`#include <iostream>

int main() {
    int n;
    std::cin >> n;
    int total = 0;
    for (int i = 1; i <= n; ++i) {
        total += i;
    }
    std::cout << total << "\n";
    return 0;
}`,
        Python: code`n = int(input())
total = 0
for i in range(1, n + 1):
    total += i
print(total)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt();
        int total = 0;
        for (int i = 1; i <= n; ++i) {
            total += i;
        }
        System.out.println(total);
    }
}`,
      },
    },
    {
      id: 'countdown', title: '倒數', description: '從 5 倒數到 1，印在同一行，以空格分隔、行尾不留空格。',
      output: '5 4 3 2 1',
      code: {
        'C++': code`#include <iostream>

int main() {
    for (int i = 5; i >= 1; --i) {
        std::cout << i << (i > 1 ? " " : "\n");
    }
    return 0;
}`,
        Python: code`print(*range(5, 0, -1))  # 5 4 3 2 1，stop 的 0 不包含`,
        Java: code`public class Main {
    public static void main(String[] args) {
        StringBuilder line = new StringBuilder();
        for (int i = 5; i >= 1; --i) {
            if (line.length() > 0) line.append(' ');
            line.append(i);
        }
        System.out.println(line);
    }
}`,
      },
    },
    {
      id: 'stats', title: '計數與最大值', description: '讀入 n 與 n 個整數，輸出偶數的個數與最大值。最大值以第一個數為初始值。',
      stdin: '6\n3 8 -2 7 8 1', output: 'evens: 3\nmax: 8',
      code: {
        'C++': code`#include <iostream>

int main() {
    int n;
    std::cin >> n;
    int evens = 0, best = 0;
    for (int i = 0; i < n; ++i) {
        int x;
        std::cin >> x;
        if (x % 2 == 0) evens++;
        if (i == 0 || x > best) best = x;
    }
    std::cout << "evens: " << evens << "\n" << "max: " << best << "\n";
    return 0;
}`,
        Python: code`n = int(input())
values = map(int, input().split())
evens = 0
best = None
for x in values:
    if x % 2 == 0:
        evens += 1
    if best is None or x > best:
        best = x
print("evens:", evens)
print("max:", best)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int evens = 0, best = 0;
        for (int i = 0; i < n; ++i) {
            int x = sc.nextInt();
            if (x % 2 == 0) evens++;
            if (i == 0 || x > best) best = x;
        }
        System.out.println("evens: " + evens);
        System.out.println("max: " + best);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'loop-execution', title: '逐步執行：total 累加 1 到 3', language: 'C++',
    code: code`int total = 0;
for (int i = 1; i <= 3; ++i) {
    total += i;
}
std::cout << total;`,
    steps: [
      { line: 1, note: '迴圈開始前，先把 total 設為 0。', vars: { total: '0' } },
      { line: 2, note: '初始：i = 1。檢查 1 <= 3，成立，進入第 1 輪。', vars: { total: '0', i: '1' }, loops: [{ label: 'for i', iteration: 1, condition: '1 <= 3', holds: true }] },
      { line: 3, note: 'total = 0 + 1 = 1。', vars: { total: '1', i: '1' }, loops: [{ label: 'for i', iteration: 1, condition: '1 <= 3', holds: true }] },
      { line: 2, note: '更新 ++i，i = 2。檢查 2 <= 3，成立，第 2 輪。', vars: { total: '1', i: '2' }, loops: [{ label: 'for i', iteration: 2, condition: '2 <= 3', holds: true }] },
      { line: 3, note: 'total = 1 + 2 = 3。', vars: { total: '3', i: '2' }, loops: [{ label: 'for i', iteration: 2, condition: '2 <= 3', holds: true }] },
      { line: 2, note: '更新 ++i，i = 3。檢查 3 <= 3，成立，第 3 輪。', vars: { total: '3', i: '3' }, loops: [{ label: 'for i', iteration: 3, condition: '3 <= 3', holds: true }] },
      { line: 3, note: 'total = 3 + 3 = 6。', vars: { total: '6', i: '3' }, loops: [{ label: 'for i', iteration: 3, condition: '3 <= 3', holds: true }] },
      { line: 2, note: '更新 ++i，i = 4。檢查 4 <= 3，不成立，離開迴圈。本體一共執行了 3 次。', vars: { total: '6', i: '4' }, loops: [{ label: 'for i', iteration: 4, condition: '4 <= 3', holds: false }] },
      { line: 5, note: '迴圈結束，i 已不存在（它只在 for 裡面有效）。輸出 6。', vars: { total: '6' }, output: '6' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'for i in range(2, 10, 3):\n    print(i, end=" ")' },
      options: ['2 5 8', '2 5 8 11', '3 6 9', '2 4 6 8'],
      answer: 0, explanation: '從 2 開始、每次加 3：2、5、8；下一個 11 已經不小於 stop 的 10，所以不包含。',
    },
    {
      id: 'q2', prompt: '下面的 C++ 迴圈本體會執行幾次？',
      code: { language: 'C++', text: 'for (int i = 0; i <= 10; i += 2) {\n    // ...\n}' },
      options: ['5 次', '6 次', '10 次', '11 次'],
      answer: 1, explanation: 'i 依序是 0、2、4、6、8、10，條件是 `<=`，所以 10 也算，共 6 次。',
    },
    {
      id: 'q3', prompt: '要計算 1 + 2 + … + n，但 n = 5 時程式輸出 10。最可能的錯誤是？',
      code: { language: 'Java', text: 'int total = 0;\nfor (int i = 1; i < n; i++) {\n    total += i;\n}' },
      options: ['total 的初始值應該是 1', '條件應該是 i <= n', 'i++ 應該寫成 ++i', '應該從 i = 0 開始'],
      answer: 1, explanation: '`i < n` 讓 i 只跑到 4，漏掉了 5：1 + 2 + 3 + 4 = 10。這是差一錯誤，改成 `i <= n`。`i++` 與 `++i` 在 for 的更新部分效果相同；從 0 開始也不會補上漏掉的 5。',
    },
    {
      id: 'q4', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'for i in range(3):\n    pass\nprint(i)' },
      options: ['2', '3', '0', 'NameError，i 不存在'],
      answer: 0, explanation: 'range(3) 是 0、1、2，迴圈結束後 Python 的 i 保留最後一個值 2。C++ 與 Java 在 for 裡宣告的 i 離開迴圈就不存在，同樣的寫法會編譯錯誤。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '成績統計',
      statement: '老師要統計一次小考：讀入 n 個整數分數變化值（可能為負），輸出總和、最大值、最小值，以及大於 0 的數有幾個。n 為 0 時表示沒有資料，只輸出 `Empty`。',
      inputFormat: '第一行一個整數 n；若 n > 0，第二行有 n 個整數，以空白分隔。',
      outputFormat: '四行：`sum`、`max`、`min`、`positive` 各自的值，格式為 `名稱 值`；n 為 0 時只輸出 `Empty`。',
      constraints: ['0 ≤ n ≤ 100,000', '−1,000,000,000 ≤ 每個整數 ≤ 1,000,000,000（總和可能超過 32 位元整數）'],
      samples: [{ kind: 'normal', input: '5\n3 -1 4 1 -5', output: 'sum 2\nmax 4\nmin -5\npositive 3', note: '3 − 1 + 4 + 1 − 5 = 2' }],
      tests: [
        { kind: 'normal', input: '5\n3 -1 4 1 -5', output: 'sum 2\nmax 4\nmin -5\npositive 3', note: '一般情況' },
        { kind: 'normal', input: '4\n10 20 30 40', output: 'sum 100\nmax 40\nmin 10\npositive 4', note: '全是正數' },
        { kind: 'edge', input: '1\n-7', output: 'sum -7\nmax -7\nmin -7\npositive 0', note: '只有一個數，而且是負數（最大值不能用 0 當初始值）' },
        { kind: 'edge', input: '3\n0 0 0', output: 'sum 0\nmax 0\nmin 0\npositive 0', note: '0 不算正數' },
        { kind: 'edge', input: '3\n1000000000 1000000000 1000000000', output: 'sum 3000000000\nmax 1000000000\nmin 1000000000\npositive 3', note: '總和超過 int 上限' },
        { kind: 'edge', input: '2\n-1000000000 -1000000000', output: 'sum -2000000000\nmax -1000000000\nmin -1000000000\npositive 0', note: '最小值' },
        { kind: 'error', input: '0', output: 'Empty', note: '沒有資料，不能輸出最大最小值' },
      ],
      hints: ['最大值與最小值都用第一個數當初始值。', '總和用 64 位元整數（C++ long long、Java long）。', 'n 為 0 時先輸出 Empty 再結束。'],
      solution: {
        'C++': code`#include <iostream>

int main() {
    int n;
    std::cin >> n;
    if (n == 0) {
        std::cout << "Empty\n";
        return 0;
    }
    long long sum = 0, best = 0, worst = 0;
    int positive = 0;
    for (int i = 0; i < n; ++i) {
        long long x;
        std::cin >> x;
        sum += x;
        if (i == 0 || x > best) best = x;
        if (i == 0 || x < worst) worst = x;
        if (x > 0) positive++;
    }
    std::cout << "sum " << sum << "\nmax " << best << "\nmin " << worst << "\npositive " << positive << "\n";
    return 0;
}`,
        Python: code`import sys

data = sys.stdin.read().split()
n = int(data[0])
if n == 0:
    print("Empty")
else:
    values = [int(x) for x in data[1:1 + n]]
    print("sum", sum(values))
    print("max", max(values))
    print("min", min(values))
    print("positive", sum(1 for x in values if x > 0))`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        if (n == 0) {
            System.out.println("Empty");
            return;
        }
        long sum = 0, best = 0, worst = 0;
        int positive = 0;
        for (int i = 0; i < n; ++i) {
            long x = sc.nextLong();
            sum += x;
            if (i == 0 || x > best) best = x;
            if (i == 0 || x < worst) worst = x;
            if (x > 0) positive++;
        }
        System.out.println("sum " + sum);
        System.out.println("max " + best);
        System.out.println("min " + worst);
        System.out.println("positive " + positive);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

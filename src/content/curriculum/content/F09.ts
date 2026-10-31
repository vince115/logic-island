import type { LessonContent } from '../schema';

const code = String.raw;

/** F09 巢狀迴圈. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F09: LessonContent = {
  lessonId: 'F09',
  motivation: '表格、棋盤、圖形、所有的兩兩配對，都有「列與行」或「每一個配上每一個」的結構，要用迴圈裡的迴圈來處理。會算巢狀迴圈的總次數，也是判斷程式會不會超時的第一步。',
  sections: [
    {
      id: 'order', title: '外層跑一次，內層跑完一整輪',
      blocks: [
        { type: 'p', text: '巢狀迴圈是迴圈的本體裡還有另一個迴圈。執行順序是：外層取一個值，內層從頭跑到尾；外層換下一個值，內層再從頭跑到尾。就像時鐘的分針（外層）走一格，秒針（內層）要繞完一整圈。' },
        { type: 'example', id: 'table' },
        { type: 'p', text: '在下方的視覺化中，同時觀察外層 i 與內層 j 的輪次。注意每次外層進入新的一輪，內層的 j 都從 1 重新開始。' },
      ],
    },
    {
      id: 'shapes', title: '用巢狀迴圈印出圖形',
      blocks: [
        { type: 'p', text: '印圖形時，外層負責「第幾列」，內層負責「這一列印什麼」。關鍵是找出每一列要印幾個字元與列號的關係：第 i 列印 i 個星號，就讓內層跑 i 次。' },
        { type: 'example', id: 'triangle' },
        { type: 'p', text: '先在紙上把 n = 3、n = 4 的圖形畫出來，標上每列的空白數與符號數，找出它們和列號的公式，再寫程式。不要用試錯的方式調整 +1、−1。' },
      ],
    },
    {
      id: 'enumerating-pairs', title: '枚舉所有配對',
      blocks: [
        { type: 'p', text: '「找出所有和為 t 的兩個數」「比較每一對選手」都需要列出所有配對。讓內層從外層的下一個值開始（`j = i + 1`），每一對只會出現一次，也不會和自己配對。' },
        { type: 'example', id: 'pairs' },
        { type: 'callout', tone: 'note', title: 'break 只跳出最內層', text: '在內層迴圈中 break，只會結束內層，外層會繼續下一輪。要同時結束兩層，可以用一個旗標變數讓外層也檢查，或把迴圈放進函式中直接 return（函式在後面的課程會學到）。' },
      ],
    },
    {
      id: 'counting-work', title: '估計總執行次數',
      blocks: [
        { type: 'p', text: '外層跑 n 次、內層每次跑 m 次，最內層的本體共執行 n × m 次。內層從 i + 1 開始的配對迴圈，總次數是 n(n − 1) / 2。這兩種都和 n² 同級：n = 10,000 時大約是 10⁸ 次，已經接近一般評測系統一秒能做的量。' },
        { type: 'table', head: ['迴圈', '本體次數（n = 1,000）'], rows: [
          ['單層 `for i in 0..n-1`', '1,000'],
          ['兩層，各 n 次', '1,000,000'],
          ['兩層，`j` 從 `i + 1` 開始', '499,500'],
          ['三層，各 n 次', '1,000,000,000'],
        ] },
        { type: 'callout', tone: 'warning', title: '內外層用不同的變數', text: '內層迴圈不小心更新了外層的變數（例如內層寫成 `i++`），會讓次數完全失控，甚至變成無窮迴圈。內外層的變數名稱要分開，而且各自只在自己的迴圈中更新。' },
      ],
    },
  ],
  examples: [
    {
      id: 'table', title: '乘法表', description: '外層 i 是列、內層 j 是行，印出 3 × 3 的乘法表。用 setw／格式化讓每一格寬度相同。',
      output: '  1  2  3\n  2  4  6\n  3  6  9',
      code: {
        'C++': code`#include <iomanip>
#include <iostream>

int main() {
    for (int i = 1; i <= 3; ++i) {
        for (int j = 1; j <= 3; ++j) {
            std::cout << std::setw(3) << i * j;
        }
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`for i in range(1, 4):
    for j in range(1, 4):
        print(f"{i * j:3d}", end="")
    print()`,
        Java: code`public class Main {
    public static void main(String[] args) {
        for (int i = 1; i <= 3; ++i) {
            for (int j = 1; j <= 3; ++j) {
                System.out.print(String.format("%3d", i * j));
            }
            System.out.println();
        }
    }
}`,
      },
    },
    {
      id: 'triangle', title: '星號三角形', description: '第 i 列印 i 個星號。Python 可以直接用字串乘法，但也寫出內層迴圈的版本以對照。',
      stdin: '4', output: '*\n**\n***\n****',
      code: {
        'C++': code`#include <iostream>

int main() {
    int n;
    std::cin >> n;
    for (int i = 1; i <= n; ++i) {
        for (int j = 1; j <= i; ++j) {
            std::cout << '*';
        }
        std::cout << '\n';
    }
    return 0;
}`,
        Python: code`n = int(input())
for i in range(1, n + 1):
    line = ""
    for j in range(i):  # 內層跑 i 次；也可寫成 "*" * i
        line += "*"
    print(line)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt();
        for (int i = 1; i <= n; ++i) {
            StringBuilder line = new StringBuilder();
            for (int j = 1; j <= i; ++j) {
                line.append('*');
            }
            System.out.println(line);
        }
    }
}`,
      },
    },
    {
      id: 'pairs', title: '和為 t 的所有配對', description: '讀入 n 與 t，列出 1～n 之中所有 a < b 且 a + b = t 的配對，最後一行是配對數。',
      stdin: '6 7', output: '1 6\n2 5\n3 4\n3',
      code: {
        'C++': code`#include <iostream>

int main() {
    int n, t, count = 0;
    std::cin >> n >> t;
    for (int a = 1; a <= n; ++a) {
        for (int b = a + 1; b <= n; ++b) {  // b 從 a + 1 開始：每對只算一次
            if (a + b == t) {
                std::cout << a << " " << b << "\n";
                count++;
            }
        }
    }
    std::cout << count << "\n";
    return 0;
}`,
        Python: code`n, t = map(int, input().split())
count = 0
for a in range(1, n + 1):
    for b in range(a + 1, n + 1):  # b 從 a + 1 開始：每對只算一次
        if a + b == t:
            print(a, b)
            count += 1
print(count)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), t = sc.nextInt(), count = 0;
        for (int a = 1; a <= n; ++a) {
            for (int b = a + 1; b <= n; ++b) {  // b 從 a + 1 開始：每對只算一次
                if (a + b == t) {
                    System.out.println(a + " " + b);
                    count++;
                }
            }
        }
        System.out.println(count);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'loop-execution', title: '逐步執行：外層 i、內層 j', language: 'C++',
    code: code`for (int i = 1; i <= 2; i++) {
    for (int j = 1; j <= 3; j++) {
        std::cout << i * j << " ";
    }
    std::cout << "\n";
}`,
    steps: [
      { line: 1, note: '外層開始：i = 1，1 <= 2 成立。', vars: { i: '1' }, loops: [{ label: '外層 i', iteration: 1, condition: '1 <= 2', holds: true }] },
      { line: 2, note: '內層從頭開始：j = 1，1 <= 3 成立。', vars: { i: '1', j: '1' }, loops: [{ label: '外層 i', iteration: 1, condition: '1 <= 2', holds: true }, { label: '內層 j', iteration: 1, condition: '1 <= 3', holds: true }] },
      { line: 3, note: '印出 1 × 1 = 1。', vars: { i: '1', j: '1' }, output: '1 ', loops: [{ label: '外層 i', iteration: 1, condition: '1 <= 2', holds: true }, { label: '內層 j', iteration: 1, condition: '1 <= 3', holds: true }] },
      { line: 3, note: 'j = 2，印出 2。', vars: { i: '1', j: '2' }, output: '1 2 ', loops: [{ label: '外層 i', iteration: 1, condition: '1 <= 2', holds: true }, { label: '內層 j', iteration: 2, condition: '2 <= 3', holds: true }] },
      { line: 3, note: 'j = 3，印出 3。', vars: { i: '1', j: '3' }, output: '1 2 3 ', loops: [{ label: '外層 i', iteration: 1, condition: '1 <= 2', holds: true }, { label: '內層 j', iteration: 3, condition: '3 <= 3', holds: true }] },
      { line: 2, note: 'j = 4，4 <= 3 不成立，內層結束。外層的 i 仍是 1。', vars: { i: '1', j: '4' }, output: '1 2 3 ', loops: [{ label: '外層 i', iteration: 1, condition: '1 <= 2', holds: true }, { label: '內層 j', iteration: 4, condition: '4 <= 3', holds: false }] },
      { line: 5, note: '換行，外層第 1 輪結束。', vars: { i: '1' }, output: '1 2 3 \n', loops: [{ label: '外層 i', iteration: 1, condition: '1 <= 2', holds: true }] },
      { line: 1, note: 'i = 2，2 <= 2 成立，外層第 2 輪。', vars: { i: '2' }, output: '1 2 3 \n', loops: [{ label: '外層 i', iteration: 2, condition: '2 <= 2', holds: true }] },
      { line: 2, note: '內層重新從 j = 1 開始。', vars: { i: '2', j: '1' }, output: '1 2 3 \n', loops: [{ label: '外層 i', iteration: 2, condition: '2 <= 2', holds: true }, { label: '內層 j', iteration: 1, condition: '1 <= 3', holds: true }] },
      { line: 3, note: '依序印出 2、4、6（j = 1、2、3）。', vars: { i: '2', j: '3' }, output: '1 2 3 \n2 4 6 ', loops: [{ label: '外層 i', iteration: 2, condition: '2 <= 2', holds: true }, { label: '內層 j', iteration: 3, condition: '3 <= 3', holds: true }] },
      { line: 5, note: '內層結束後換行。', vars: { i: '2' }, output: '1 2 3 \n2 4 6 \n', loops: [{ label: '外層 i', iteration: 2, condition: '2 <= 2', holds: true }] },
      { line: 1, note: 'i = 3，3 <= 2 不成立，外層結束。內層本體一共執行 2 × 3 = 6 次。', vars: { i: '3' }, output: '1 2 3 \n2 4 6 \n', loops: [{ label: '外層 i', iteration: 3, condition: '3 <= 2', holds: false }] },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '執行完後 count 是多少？',
      code: { language: 'C++', text: 'int count = 0;\nfor (int i = 0; i < 4; i++)\n    for (int j = 0; j < 3; j++)\n        count++;' },
      options: ['7', '12', '16', '3'],
      answer: 1, explanation: '外層 4 輪，每一輪內層跑 3 次，共 4 × 3 = 12 次。巢狀迴圈的次數是相乘，不是相加。',
    },
    {
      id: 'q2', prompt: '執行完後 c 是多少？',
      code: { language: 'Python', text: 'c = 0\nfor i in range(1, 5):\n    for j in range(i):\n        c += 1' },
      options: ['4', '10', '16', '20'],
      answer: 1, explanation: '內層次數隨 i 改變：i = 1、2、3、4 時分別跑 1、2、3、4 次，共 1 + 2 + 3 + 4 = 10 次。',
    },
    {
      id: 'q3', prompt: '下面的程式會印出幾行？',
      code: { language: 'Python', text: 'for i in range(1, 4):\n    for j in range(1, 4):\n        if j > i:\n            break\n        print(i, j)' },
      options: ['9 行', '6 行', '3 行', '1 行'],
      answer: 1, explanation: 'break 只結束內層：i = 1 時印 (1,1)；i = 2 時印 (2,1)(2,2)；i = 3 時印 3 行。共 1 + 2 + 3 = 6 行，外層每一輪都會繼續。',
    },
    {
      id: 'q4', prompt: '這段 C++ 程式有一個打字錯誤。執行結果會是？',
      code: { language: 'C++', text: 'int c = 0;\nfor (int i = 0; i < 3; i++)\n    for (int j = 0; j < 3; i++)  // 應該是 j++\n        c++;' },
      options: ['c = 9', 'c = 3', '無窮迴圈：j 永遠是 0，內層條件永遠成立', '編譯錯誤'],
      answer: 2, explanation: '內層更新的是 i 而不是 j，所以 `j < 3` 永遠成立，內層永遠不會結束（i 一直增加，最後還會溢位）。程式可以編譯，但會卡住；評測系統會判為超過時間限制。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '數字金字塔',
      statement: '讀入 n，印出 n 層的數字金字塔：第 k 層先印 n − k 個空白，再印 1、2、…、k，接著印 k − 1、…、1，數字之間沒有空白，行尾不留空白。n 不在 1～9 之間時輸出 `Invalid`。',
      inputFormat: '一個整數 n。',
      outputFormat: 'n 行金字塔；n 不合法時只輸出 `Invalid`。',
      constraints: ['−100 ≤ n ≤ 100'],
      samples: [{ kind: 'normal', input: '3', output: '  1\n 121\n12321', note: '第 1 層前面 2 個空白，第 3 層沒有空白' }],
      tests: [
        { kind: 'normal', input: '3', output: '  1\n 121\n12321', note: '一般情況' },
        { kind: 'normal', input: '5', output: '    1\n   121\n  12321\n 1234321\n123454321', note: '一般情況' },
        { kind: 'edge', input: '1', output: '1', note: '最少一層，沒有空白' },
        { kind: 'edge', input: '9', output: '        1\n       121\n      12321\n     1234321\n    123454321\n   12345654321\n  1234567654321\n 123456787654321\n12345678987654321', note: '最多 9 層' },
        { kind: 'error', input: '0', output: 'Invalid', note: '層數不能是 0' },
        { kind: 'error', input: '10', output: 'Invalid', note: '超過 9 層（數字會變成兩位數）' },
      ],
      hints: ['外層 k 從 1 到 n；內層分三段：空白、遞增、遞減。', '先手寫 n = 3 的每一層：空白數是 n − k，遞增段有 k 個，遞減段有 k − 1 個。'],
      solution: {
        'C++': code`#include <iostream>

int main() {
    int n;
    std::cin >> n;
    if (n < 1 || n > 9) {
        std::cout << "Invalid\n";
        return 0;
    }
    for (int k = 1; k <= n; ++k) {
        for (int s = 0; s < n - k; ++s) std::cout << ' ';
        for (int d = 1; d <= k; ++d) std::cout << d;
        for (int d = k - 1; d >= 1; --d) std::cout << d;
        std::cout << '\n';
    }
    return 0;
}`,
        Python: code`n = int(input())
if n < 1 or n > 9:
    print("Invalid")
else:
    for k in range(1, n + 1):
        line = " " * (n - k)
        for d in range(1, k + 1):
            line += str(d)
        for d in range(k - 1, 0, -1):
            line += str(d)
        print(line)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt();
        if (n < 1 || n > 9) {
            System.out.println("Invalid");
            return;
        }
        for (int k = 1; k <= n; ++k) {
            StringBuilder line = new StringBuilder();
            for (int s = 0; s < n - k; ++s) line.append(' ');
            for (int d = 1; d <= k; ++d) line.append(d);
            for (int d = k - 1; d >= 1; --d) line.append(d);
            System.out.println(line);
        }
    }
}`,
      },
      judge: 'none',
    },
  ],
};

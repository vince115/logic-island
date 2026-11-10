import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * F08 While 迴圈. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); digit removal uses Math.trunc(n / 10), and the exercise uses BigInt
 * because N reaches 10^18 (> 2^53).
 */
export const F08: LessonContent = {
  lessonId: 'F08',
  motivation: '很多重複事先不知道要做幾次：「一直讀到輸入結束」「一直除以 10 直到變成 0」「一直猜到答對為止」。while 迴圈處理的就是這種「依條件決定何時停」的工作，也是讀取不定數量測資的標準寫法。',
  sections: [
    {
      id: 'while-structure', title: 'while：條件成立就繼續',
      blocks: [
        { type: 'p', text: 'while 迴圈在每一輪開始前檢查條件，成立就執行本體，不成立就離開。它沒有內建的計數器：本體裡一定要有某件事會讓條件最終變成不成立，否則迴圈永遠不會停。' },
        { type: 'p', text: '一個典型的用途是逐位數處理：`n % 10` 取出個位數，`n / 10`（Python 用 `n // 10`，JavaScript 的 `/` 會留下小數，要寫 `Math.trunc(n / 10)`）去掉個位數，重複到 n 變成 0。位數有幾個事先不知道，所以用 while。' },
        { type: 'example', id: 'digits' },
        { type: 'p', text: '下方的視覺化逐步執行同樣的想法，觀察每一輪的條件檢查、n 如何變小，以及 n 變成 0 時迴圈如何結束。' },
      ],
    },
    {
      id: 'reading-input', title: '讀到特定值或讀到輸入結束',
      blocks: [
        { type: 'p', text: '題目常說「輸入以 0 結束」（哨兵值）或「讀到檔案結尾為止」（EOF）。兩者都不知道有幾筆資料，所以用 while：' },
        { type: 'example', id: 'sentinel' },
        { type: 'list', items: [
          'C++：`while (std::cin >> x)` 讀取成功時條件為 true，讀到結尾（或格式錯誤）時為 false，迴圈自然結束。',
          'Python：`sys.stdin.read().split()` 一次取得所有 token，再用 for 處理；或逐行 `for line in sys.stdin:`。',
          'Java：`while (sc.hasNextInt())` 先確認還有整數，再 `nextInt()`。',
          'JavaScript：`require("fs").readFileSync(0, "utf8").trim().split(/\\s+/)` 一次取得所有 token，再用索引 `i` 搭配 `while (i < tokens.length)` 逐一處理。',
        ] },
        { type: 'example', id: 'eof' },
      ],
    },
    {
      id: 'break-continue', title: 'break 與 continue',
      blocks: [
        { type: 'p', text: '`break` 立刻結束整個迴圈；`continue` 跳過這一輪剩下的部分，直接進入下一輪（while 會回到條件檢查，for 會先執行更新）。四種語言的寫法相同。' },
        { type: 'p', text: '「找到第一個符合的就停」用 break：例如找第一個能被 7 整除的數，找到就不必再往下找。「略過不要的資料」用 continue：例如加總時略過負數。' },
        { type: 'callout', tone: 'warning', title: '在 while 中用 continue 要小心', text: '如果更新寫在 continue 之後，例如 `while (i < n) { if (bad) continue; ... i++; }`，遇到 bad 時 i 永遠不會增加，就變成無窮迴圈。把更新放在 continue 之前，或改用 for。' },
      ],
    },
    {
      id: 'infinite', title: '無窮迴圈與 do-while',
      blocks: [
        { type: 'p', text: '程式卡住不動、或在評測系統中得到「超過時間限制」（TLE），常常是因為無窮迴圈。檢查兩件事：條件裡的變數在本體中有沒有被改變？改變的方向會不會讓條件最終不成立？例如 `while (i < 5)` 本體卻寫了 `i--`。' },
        { type: 'p', text: 'C++、Java 與 JavaScript 還有 do-while：先執行一次本體，再檢查條件，所以本體至少會執行一次。Python 沒有 do-while，通常寫成 `while True:` 搭配條件 break。' },
        { type: 'table', head: ['', '檢查條件的時機', '本體最少執行'], rows: [
          ['`while (c) { … }`', '每一輪之前', '0 次'],
          ['`do { … } while (c);`', '每一輪之後', '1 次'],
          ['Python `while True:` + `break`', '寫在本體中的位置', '依寫法而定'],
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'digits', title: '各位數字的和', description: '讀入一個非負整數，逐位取出個位數相加。',
      stdin: '4096', output: '19',
      code: {
        'C++': code`#include <iostream>

int main() {
    long long n;
    std::cin >> n;
    int sum = 0;
    while (n > 0) {
        sum += n % 10;  // 取出個位數
        n /= 10;        // 去掉個位數
    }
    std::cout << sum << "\n";
    return 0;
}`,
        Python: code`n = int(input())
total = 0
while n > 0:
    total += n % 10  # 取出個位數
    n //= 10         # 去掉個位數（整數除法）
print(total)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        long n = new Scanner(System.in).nextLong();
        int sum = 0;
        while (n > 0) {
            sum += n % 10;  // 取出個位數
            n /= 10;        // 去掉個位數
        }
        System.out.println(sum);
    }
}`,
        JavaScript: code`let n = Number(require("fs").readFileSync(0, "utf8").trim());
let sum = 0;
while (n > 0) {
    sum += n % 10;           // 取出個位數
    n = Math.trunc(n / 10);  // 去掉個位數（/ 會留下小數，取整數部分）
}
console.log(sum);`,
      },
    },
    {
      id: 'sentinel', title: '讀到 0 為止', description: '輸入若干個正整數，以 0 表示結束。輸出共有幾個數與它們的和（0 本身不算）。',
      stdin: '5 3 8 0', output: '3 16',
      code: {
        'C++': code`#include <iostream>

int main() {
    int x, count = 0, sum = 0;
    while (std::cin >> x && x != 0) {
        count++;
        sum += x;
    }
    std::cout << count << " " << sum << "\n";
    return 0;
}`,
        Python: code`import sys

count = total = 0
for token in sys.stdin.read().split():
    x = int(token)
    if x == 0:
        break
    count += 1
    total += x
print(count, total)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int count = 0, sum = 0;
        while (sc.hasNextInt()) {
            int x = sc.nextInt();
            if (x == 0) break;
            count++;
            sum += x;
        }
        System.out.println(count + " " + sum);
    }
}`,
        JavaScript: code`const tokens = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
let count = 0;
let sum = 0;
let i = 0;
while (i < tokens.length && tokens[i] !== 0) {
    count++;
    sum += tokens[i];
    i++;
}
console.log(count + " " + sum);`,
      },
    },
    {
      id: 'eof', title: '讀到輸入結束，找最大值', description: '輸入有不定個整數，分布在任意行。讀到輸入結束為止，輸出最大值。',
      stdin: '7 -3 12\n5', output: '12',
      code: {
        'C++': code`#include <iostream>

int main() {
    long long x, best = 0;
    bool first = true;
    while (std::cin >> x) {  // 讀不到時結束
        if (first || x > best) best = x;
        first = false;
    }
    std::cout << best << "\n";
    return 0;
}`,
        Python: code`import sys

values = [int(t) for t in sys.stdin.read().split()]
print(max(values))`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        long best = 0;
        boolean first = true;
        while (sc.hasNextLong()) {  // 沒有下一個整數時結束
            long x = sc.nextLong();
            if (first || x > best) best = x;
            first = false;
        }
        System.out.println(best);
    }
}`,
        JavaScript: code`const tokens = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
let best = tokens[0];
let i = 1;
while (i < tokens.length) {  // 沒有下一個數時結束
    if (tokens[i] > best) best = tokens[i];
    i++;
}
console.log(best);`,
      },
    },
  ],
  visualization: {
    kind: 'loop-execution', title: '逐步執行：307 的各位數字和', language: 'C++',
    code: code`int n = 307;
int sum = 0;
while (n > 0) {
    sum += n % 10;
    n /= 10;
}
std::cout << sum;`,
    steps: [
      { line: 1, note: 'n = 307。', vars: { n: '307' } },
      { line: 2, note: 'sum = 0。', vars: { n: '307', sum: '0' } },
      { line: 3, note: '檢查 307 > 0，成立，第 1 輪。', vars: { n: '307', sum: '0' }, loops: [{ label: 'while', iteration: 1, condition: '307 > 0', holds: true }] },
      { line: 4, note: '307 % 10 = 7，sum = 7。', vars: { n: '307', sum: '7' }, loops: [{ label: 'while', iteration: 1, condition: '307 > 0', holds: true }] },
      { line: 5, note: '307 / 10 = 30（整數除法），n = 30。', vars: { n: '30', sum: '7' }, loops: [{ label: 'while', iteration: 1, condition: '307 > 0', holds: true }] },
      { line: 3, note: '檢查 30 > 0，成立，第 2 輪。', vars: { n: '30', sum: '7' }, loops: [{ label: 'while', iteration: 2, condition: '30 > 0', holds: true }] },
      { line: 4, note: '30 % 10 = 0，sum 仍是 7。', vars: { n: '30', sum: '7' }, loops: [{ label: 'while', iteration: 2, condition: '30 > 0', holds: true }] },
      { line: 5, note: 'n = 3。', vars: { n: '3', sum: '7' }, loops: [{ label: 'while', iteration: 2, condition: '30 > 0', holds: true }] },
      { line: 3, note: '檢查 3 > 0，成立，第 3 輪。', vars: { n: '3', sum: '7' }, loops: [{ label: 'while', iteration: 3, condition: '3 > 0', holds: true }] },
      { line: 4, note: '3 % 10 = 3，sum = 10。', vars: { n: '3', sum: '10' }, loops: [{ label: 'while', iteration: 3, condition: '3 > 0', holds: true }] },
      { line: 5, note: '3 / 10 = 0，n = 0。', vars: { n: '0', sum: '10' }, loops: [{ label: 'while', iteration: 3, condition: '3 > 0', holds: true }] },
      { line: 3, note: '檢查 0 > 0，不成立，離開迴圈。307 有 3 位數，所以本體執行 3 次。', vars: { n: '0', sum: '10' }, loops: [{ label: 'while', iteration: 4, condition: '0 > 0', holds: false }] },
      { line: 7, note: '輸出 10（3 + 0 + 7）。', vars: { n: '0', sum: '10' }, output: '10' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'int n = 10, c = 0;\nwhile (n > 1) {\n    n /= 2;\n    c++;\n}\nstd::cout << c;' },
      options: ['3', '4', '5', '10'],
      answer: 0, explanation: 'n 依序變成 5、2、1（整數除法），c 加了 3 次；n = 1 時條件 `1 > 1` 不成立，迴圈結束。這也是「一個數能被 2 除幾次」的寫法，與 log₂ n 有關。',
    },
    {
      id: 'q2', prompt: '下面的 Python 程式會怎樣？',
      code: { language: 'Python', text: 'i = 0\nwhile i < 5:\n    print(i)' },
      options: ['印出 0 到 4', '印出 0 到 5', '不停地印出 0（無窮迴圈）', '什麼都不印'],
      answer: 2, explanation: '本體中沒有改變 i，條件 `i < 5` 永遠成立，迴圈不會停。需要在本體中加上 `i += 1`。',
    },
    {
      id: 'q3', prompt: '下面的程式執行後，total 是多少？',
      code: { language: 'Python', text: 'total = 0\nfor x in [1, 2, 3, 4, 5]:\n    if x % 2 == 0:\n        continue\n    total += x' },
      options: ['15', '9', '6', '1'],
      answer: 1, explanation: '`continue` 讓偶數跳過加總，只加奇數 1 + 3 + 5 = 9。如果是 `break`，遇到 2 就整個停止，total 會是 1。',
    },
    {
      id: 'q4', prompt: '下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: 'int k = 10;\ndo {\n    k++;\n} while (k < 5);\nSystem.out.println(k);' },
      options: ['10', '11', '5', '迴圈一次都不執行，編譯錯誤'],
      answer: 1, explanation: 'do-while 先執行本體再檢查條件，所以即使 `k < 5` 一開始就不成立，本體仍執行一次，k 變成 11。換成 while 的話，k 會維持 10。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '數字分析',
      statement: '讀入一個整數 N，輸出它有幾位數、各位數字的和，以及把數字反轉後的值（反轉後去掉開頭的 0，例如 1200 反轉為 21）。N 為負數時輸出 `Invalid`。',
      inputFormat: '一個整數 N。',
      outputFormat: '三行：位數、各位數字和、反轉後的值；N 為負數時只輸出 `Invalid`。',
      constraints: ['−10¹⁸ ≤ N ≤ 10¹⁸（需要 64 位元整數）'],
      samples: [{ kind: 'normal', input: '4096', output: '4\n19\n6904', note: '4 + 0 + 9 + 6 = 19' }],
      tests: [
        { kind: 'normal', input: '4096', output: '4\n19\n6904', note: '一般情況' },
        { kind: 'normal', input: '1200', output: '4\n3\n21', note: '反轉後開頭的 0 消失' },
        { kind: 'edge', input: '0', output: '1\n0\n0', note: '0 有 1 位數（while n > 0 不會執行，要特別處理）' },
        { kind: 'edge', input: '7', output: '1\n7\n7', note: '一位數' },
        { kind: 'edge', input: '1000000000000000000', output: '19\n1\n1', note: '最大值 10¹⁸' },
        { kind: 'edge', input: '999999999999999999', output: '18\n162\n999999999999999999', note: '反轉後仍在 64 位元範圍' },
        { kind: 'error', input: '-5', output: 'Invalid', note: '負數' },
      ],
      hints: ['用 while (n > 0) 逐位處理：`n % 10` 取個位、`n / 10` 去個位。JavaScript 這題的 N 可達 10¹⁸，超過 number 的精確整數範圍（2^53），要用 BigInt（例如 `10n`），而 BigInt 的 `n / 10n` 本身就會捨去小數。', '反轉：`rev = rev * 10 + 個位數`。', 'N = 0 時迴圈一次都不會執行，位數要另外當成 1。'],
      solution: {
        'C++': code`#include <iostream>

int main() {
    long long n;
    std::cin >> n;
    if (n < 0) {
        std::cout << "Invalid\n";
        return 0;
    }
    int digits = (n == 0) ? 1 : 0, sum = 0;
    long long rev = 0;
    while (n > 0) {
        int d = n % 10;
        digits++;
        sum += d;
        rev = rev * 10 + d;
        n /= 10;
    }
    std::cout << digits << "\n" << sum << "\n" << rev << "\n";
    return 0;
}`,
        Python: code`n = int(input())
if n < 0:
    print("Invalid")
else:
    digits = 1 if n == 0 else 0
    total = rev = 0
    while n > 0:
        d = n % 10
        digits += 1
        total += d
        rev = rev * 10 + d
        n //= 10
    print(digits)
    print(total)
    print(rev)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        long n = new Scanner(System.in).nextLong();
        if (n < 0) {
            System.out.println("Invalid");
            return;
        }
        int digits = (n == 0) ? 1 : 0, sum = 0;
        long rev = 0;
        while (n > 0) {
            int d = (int) (n % 10);
            digits++;
            sum += d;
            rev = rev * 10 + d;
            n /= 10;
        }
        System.out.println(digits);
        System.out.println(sum);
        System.out.println(rev);
    }
}`,
        JavaScript: code`let n = BigInt(require("fs").readFileSync(0, "utf8").trim());  // 10^18 超過 2^53，用 BigInt
if (n < 0n) {
    console.log("Invalid");
} else {
    let digits = n === 0n ? 1 : 0;
    let sum = 0;
    let rev = 0n;
    while (n > 0n) {
        const d = n % 10n;
        digits++;
        sum += Number(d);
        rev = rev * 10n + d;
        n /= 10n;  // BigInt 的除法本身就會捨去小數
    }
    console.log(digits);
    console.log(sum);
    console.log(String(rev));
}`,
      },
      judge: 'none',
    },
  ],
};

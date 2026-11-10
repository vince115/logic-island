import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * F18 遞迴入門. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also
 * offers JavaScript (Node.js); factorial, digit sum and the binary exercise use BigInt (values up to 20! and 10¹⁸
 * exceed 2^53), the Fibonacci call count uses plain numbers.
 */
export const F18: LessonContent = {
  lessonId: 'F18',
  motivation: '有些問題用「同樣的問題、但規模小一點」來描述最自然：n! = n × (n − 1)!、資料夾裡還有資料夾。遞迴讓程式直接寫出這種定義；它也是之後樹、圖、分治、回溯與動態規劃的共同基礎。',
  sections: [
    {
      id: 'definition', title: '終止條件與遞迴關係',
      blocks: [
        { type: 'p', text: '遞迴（recursion）是函式呼叫自己。一個正確的遞迴函式一定有兩部分：' },
        { type: 'list', items: [
          '終止條件（base case）：規模夠小、可以直接回答的情況，例如 `n <= 1` 時 n! = 1。',
          '遞迴關係（recursive case）：把問題化成規模更小的同一個問題，例如 `n! = n × (n − 1)!`。每一次呼叫都必須更接近終止條件。',
        ] },
        { type: 'example', id: 'factorial' },
        { type: 'callout', tone: 'warning', title: '少了終止條件就停不下來', text: '沒有終止條件、或遞迴沒有往終止條件前進（例如寫成 `f(n)` 呼叫 `f(n)`），函式會一直呼叫自己直到呼叫堆疊用完：Python 丟出 `RecursionError`，Java 丟出 `StackOverflowError`，JavaScript 丟出 `RangeError: Maximum call stack size exceeded`，C++ 通常直接當掉。' },
      ],
    },
    {
      id: 'stack', title: '呼叫堆疊：先一路往下，再一路回來',
      blocks: [
        { type: 'p', text: '每次遞迴呼叫都會在呼叫堆疊上多一層，各自保存自己的 n。呼叫 fact(3) 會依序疊上 fact(3)、fact(2)、fact(1)；fact(1) 碰到終止條件回傳 1，接著 fact(2) 才能算出 2 × 1、fact(3) 才能算出 3 × 2，這個「往回收」的過程稱為回溯（unwinding）。' },
        { type: 'p', text: '下方的視覺化逐步顯示堆疊如何長高、在終止條件處停下，再一層層帶著回傳值消失。' },
        { type: 'p', text: '「在遞迴呼叫之前」與「在遞迴呼叫之後」做事，順序完全相反。例如把一個數轉成二進位：先遞迴處理 n / 2，回來之後才印出 n % 2，印出的順序就是由高位到低位。' },
      ],
    },
    {
      id: 'relations', title: '把遞迴關係寫成程式',
      blocks: [
        { type: 'p', text: '寫遞迴時，假設「規模小一點的問題已經能正確解決」，只思考這一層要怎麼用它。各位數字和：最後一位加上「去掉最後一位之後的數字和」，終止條件是 n = 0。' },
        { type: 'example', id: 'digit-sum' },
        { type: 'p', text: '費氏數列 F(n) = F(n − 1) + F(n − 2) 直接寫成遞迴非常簡潔，但每次呼叫會再分出兩個呼叫，大量重複計算：算 F(10) 就要呼叫 177 次，F(40) 超過三億次。' },
        { type: 'example', id: 'fibonacci' },
      ],
    },
    {
      id: 'limits', title: '遞迴的限制與何時改用迴圈',
      blocks: [
        { type: 'table', head: ['', 'C++', 'Python', 'Java', 'JavaScript'], rows: [
          ['最大深度', '取決於堆疊大小，通常數萬到數十萬層', '預設約 1,000 層（`sys.setrecursionlimit` 可調整，但仍受系統堆疊限制）', '取決於堆疊大小，通常數千到數萬層', '取決於堆疊大小，Node.js 預設通常約一萬層'],
          ['超過時', '程式當掉（stack overflow）', '`RecursionError`', '`StackOverflowError`', '`RangeError`（Maximum call stack size exceeded）'],
        ] },
        { type: 'p', text: '遞迴深度和 n 一樣大的寫法（例如 fact(n)、走訪一條長鏈），在 n 很大時會超過限制，這時改用迴圈。深度只有 log n 的遞迴（例如每次把 n 減半）則很安全。重複計算的問題（例如費氏數列）可以把算過的結果記下來重複使用，稱為記憶化（memoization），在演算法島的動態規劃中會詳細介紹。' },
      ],
    },
  ],
  examples: [
    {
      id: 'factorial', title: '階乘', description: '讀入 n，遞迴計算 n!。20! 約 2.4 × 10¹⁸，用 64 位元整數；JavaScript 的數字超過 2^53 就不精確，改用 BigInt。',
      stdin: '5', output: '120',
      code: {
        'C++': code`#include <iostream>

long long fact(int n) {
    if (n <= 1) return 1;     // 終止條件
    return n * fact(n - 1);   // 規模更小的同一個問題
}

int main() {
    int n;
    std::cin >> n;
    std::cout << fact(n) << "\n";
    return 0;
}`,
        Python: code`def fact(n):
    if n <= 1:                # 終止條件
        return 1
    return n * fact(n - 1)    # 規模更小的同一個問題


print(fact(int(input())))`,
        Java: code`import java.util.Scanner;

public class Main {
    static long fact(int n) {
        if (n <= 1) return 1;     // 終止條件
        return n * fact(n - 1);   // 規模更小的同一個問題
    }

    public static void main(String[] args) {
        System.out.println(fact(new Scanner(System.in).nextInt()));
    }
}`,
        JavaScript: code`// 20! 超過 2^53，所以用 BigInt（數字後面加 n）
function fact(n) {
    if (n <= 1n) return 1n;    // 終止條件
    return n * fact(n - 1n);   // 規模更小的同一個問題
}

const n = BigInt(require("fs").readFileSync(0, "utf8").trim());
console.log(String(fact(n)));`,
      },
    },
    {
      id: 'digit-sum', title: '遞迴求各位數字和', description: '最後一位，加上「去掉最後一位」之後的數字和。',
      stdin: '4096', output: '19',
      code: {
        'C++': code`#include <iostream>

int digitSum(long long n) {
    if (n == 0) return 0;
    return static_cast<int>(n % 10) + digitSum(n / 10);
}

int main() {
    long long n;
    std::cin >> n;
    std::cout << digitSum(n) << "\n";
    return 0;
}`,
        Python: code`def digit_sum(n):
    if n == 0:
        return 0
    return n % 10 + digit_sum(n // 10)


print(digit_sum(int(input())))`,
        Java: code`import java.util.Scanner;

public class Main {
    static int digitSum(long n) {
        if (n == 0) return 0;
        return (int) (n % 10) + digitSum(n / 10);
    }

    public static void main(String[] args) {
        System.out.println(digitSum(new Scanner(System.in).nextLong()));
    }
}`,
        JavaScript: code`// 用 BigInt 才能精確處理 64 位元範圍的數；BigInt 的 / 會捨去小數
function digitSum(n) {
    if (n === 0n) return 0;
    return Number(n % 10n) + digitSum(n / 10n);
}

const n = BigInt(require("fs").readFileSync(0, "utf8").trim());
console.log(digitSum(n));`,
      },
    },
    {
      id: 'fibonacci', title: '費氏數列與呼叫次數', description: '直接依定義遞迴，同時數一數函式被呼叫了幾次：F(10) = 55，卻呼叫了 177 次。',
      output: '55 177',
      code: {
        'C++': code`#include <iostream>

long long calls = 0;

long long fib(int n) {
    calls++;
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}

int main() {
    long long value = fib(10);
    std::cout << value << " " << calls << "\n";
    return 0;
}`,
        Python: code`calls = 0


def fib(n):
    global calls
    calls += 1
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


value = fib(10)
print(value, calls)`,
        Java: code`public class Main {
    static long calls = 0;

    static long fib(int n) {
        calls++;
        if (n < 2) return n;
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        long value = fib(10);
        System.out.println(value + " " + calls);
    }
}`,
        JavaScript: code`let calls = 0;

function fib(n) {
    calls++;
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}

const value = fib(10);
console.log(value, calls);`,
      },
    },
  ],
  visualization: {
    kind: 'recursion-trace', title: 'fact(3)：往下呼叫、再一路回傳', language: 'C++',
    code: code`long long fact(int n) {
    if (n <= 1) return 1;
    return n * fact(n - 1);
}
int main() {
    std::cout << fact(3);
}`,
    steps: [
      { line: 6, note: 'main 呼叫 fact(3)。', frames: [{ name: 'main', vars: {} }, { name: 'fact(3)', vars: { n: '3' } }] },
      { line: 3, note: 'n = 3 不是終止條件，需要 fact(2)：fact(3) 暫停，等待結果。', frames: [{ name: 'main', vars: {} }, { name: 'fact(3)', vars: { n: '3' } }, { name: 'fact(2)', vars: { n: '2' } }] },
      { line: 3, note: 'n = 2 也需要 fact(1)。堆疊有 4 層，每層的 n 各自獨立。', frames: [{ name: 'main', vars: {} }, { name: 'fact(3)', vars: { n: '3' } }, { name: 'fact(2)', vars: { n: '2' } }, { name: 'fact(1)', vars: { n: '1' } }] },
      { line: 2, note: '終止條件：n <= 1，fact(1) 直接回傳 1，不再往下呼叫。', frames: [{ name: 'main', vars: {} }, { name: 'fact(3)', vars: { n: '3' } }, { name: 'fact(2)', vars: { n: '2' } }, { name: 'fact(1)', vars: { n: '1' }, returns: '1' }] },
      { line: 3, note: '回到 fact(2)：2 × 1 = 2，回傳 2。', frames: [{ name: 'main', vars: {} }, { name: 'fact(3)', vars: { n: '3' } }, { name: 'fact(2)', vars: { n: '2' }, returns: '2' }] },
      { line: 3, note: '回到 fact(3)：3 × 2 = 6，回傳 6。', frames: [{ name: 'main', vars: {} }, { name: 'fact(3)', vars: { n: '3' }, returns: '6' }] },
      { line: 6, note: '回到 main，輸出 6。所有遞迴的層都已移除。', frames: [{ name: 'main', vars: {} }], output: '6' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: 'f(4) 的回傳值是？',
      code: { language: 'Python', text: 'def f(n):\n    if n == 0:\n        return 0\n    return n + f(n - 1)' },
      options: ['4', '10', '24', '無窮遞迴'],
      answer: 1, explanation: 'f(4) = 4 + f(3) = 4 + 3 + f(2) = … = 4 + 3 + 2 + 1 + 0 = 10。終止條件 n == 0 回傳 0。',
    },
    {
      id: 'q2', prompt: '下面的程式呼叫 g(3) 會怎樣？',
      code: { language: 'Python', text: 'def g(n):\n    return n * g(n - 1)\n\nprint(g(3))' },
      options: ['印出 6', '印出 0', 'RecursionError：沒有終止條件', '印出 3'],
      answer: 2, explanation: 'g 沒有終止條件，n 會一直減到負數仍繼續呼叫，直到超過 Python 的遞迴深度上限（約 1,000 層）而丟出 RecursionError。',
    },
    {
      id: 'q3', prompt: 'h(3) 會印出什麼？',
      code: { language: 'Python', text: 'def h(n):\n    if n == 0:\n        return\n    h(n - 1)\n    print(n, end=" ")\n\nh(3)' },
      options: ['3 2 1', '1 2 3', '3', '0 1 2 3'],
      answer: 1, explanation: 'print 在遞迴呼叫之後：h(3) 先呼叫 h(2)、h(2) 先呼叫 h(1)……最深的 h(1) 最先印出 1，回到 h(2) 印 2，最後 h(3) 印 3。如果 print 放在呼叫之前，順序就會是 3 2 1。',
    },
    {
      id: 'q4', prompt: '依定義遞迴計算 fib(5)（fib(n) = fib(n−1) + fib(n−2)，n < 2 時回傳 n），fib 函式一共被呼叫幾次？',
      options: ['5 次', '8 次', '15 次', '32 次'],
      answer: 2, explanation: '呼叫次數 C(n) = 1 + C(n − 1) + C(n − 2)，C(0) = C(1) = 1，所以 C(2) = 3、C(3) = 5、C(4) = 9、C(5) = 15。次數大約隨 n 以 1.6 倍成長，這就是需要記憶化的原因。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '遞迴轉二進位',
      statement: '寫一個遞迴函式，把非負整數 N 轉成二進位字串（先遞迴處理 N / 2，回來之後再處理最後一位），並計算其中 1 的個數。N = 0 時二進位是 `0`。N 為負數時輸出 `Invalid`。',
      inputFormat: '一個整數 N。',
      outputFormat: '兩行：二進位表示、1 的個數；N 為負數時只輸出 `Invalid`。',
      constraints: ['−10¹⁸ ≤ N ≤ 10¹⁸（遞迴深度最多約 60 層）'],
      samples: [{ kind: 'normal', input: '10', output: '1010\n2', note: '10 = 8 + 2' }],
      tests: [
        { kind: 'normal', input: '10', output: '1010\n2', note: '一般情況' },
        { kind: 'normal', input: '255', output: '11111111\n8', note: '全是 1' },
        { kind: 'edge', input: '0', output: '0\n0', note: '0 要特別處理：遞迴的終止條件不能直接回傳空字串' },
        { kind: 'edge', input: '1', output: '1\n1', note: '最小的正數' },
        { kind: 'edge', input: '1024', output: '10000000000\n1', note: '2 的次方' },
        { kind: 'edge', input: '1000000000000000000', output: '110111100000101101101011001110100111011001000000000000000000\n24', note: '最大值 10¹⁸，60 位' },
        { kind: 'error', input: '-6', output: 'Invalid', note: '負數' },
      ],
      hints: ['終止條件：N < 2 時，二進位就是 N 本身這一位。', '遞迴關係：binary(N) = binary(N / 2) 後面接上 N % 2。JavaScript 的數字超過 2^53 就不精確，N 要用 BigInt（`N / 2n` 會捨去小數）。', '1 的個數可以另寫一個遞迴：ones(N) = N % 2 + ones(N / 2)。'],
      solution: {
        'C++': code`#include <iostream>
#include <string>

std::string binary(long long n) {
    if (n < 2) return std::to_string(n);
    return binary(n / 2) + std::to_string(n % 2);
}

int ones(long long n) {
    if (n == 0) return 0;
    return static_cast<int>(n % 2) + ones(n / 2);
}

int main() {
    long long n;
    std::cin >> n;
    if (n < 0) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::cout << binary(n) << "\n" << ones(n) << "\n";
    return 0;
}`,
        Python: code`def binary(n):
    if n < 2:
        return str(n)
    return binary(n // 2) + str(n % 2)


def ones(n):
    if n == 0:
        return 0
    return n % 2 + ones(n // 2)


n = int(input())
if n < 0:
    print("Invalid")
else:
    print(binary(n))
    print(ones(n))`,
        Java: code`import java.util.Scanner;

public class Main {
    static String binary(long n) {
        if (n < 2) return String.valueOf(n);
        return binary(n / 2) + (n % 2);
    }

    static int ones(long n) {
        if (n == 0) return 0;
        return (int) (n % 2) + ones(n / 2);
    }

    public static void main(String[] args) {
        long n = new Scanner(System.in).nextLong();
        if (n < 0) {
            System.out.println("Invalid");
            return;
        }
        System.out.println(binary(n));
        System.out.println(ones(n));
    }
}`,
        JavaScript: code`// N 可達 10^18，超過 2^53，所以用 BigInt；BigInt 的 / 會捨去小數
function binary(n) {
    if (n < 2n) return String(n);
    return binary(n / 2n) + String(n % 2n);
}

function ones(n) {
    if (n === 0n) return 0;
    return Number(n % 2n) + ones(n / 2n);
}

const n = BigInt(require("fs").readFileSync(0, "utf8").trim());
if (n < 0n) {
    console.log("Invalid");
} else {
    console.log(binary(n));
    console.log(ones(n));
}`,
      },
      judge: 'none',
    },
  ],
};

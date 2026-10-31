import type { LessonContent } from '../schema';

const code = String.raw;

/** F13 函式基礎. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F13: LessonContent = {
  lessonId: 'F13',
  motivation: '程式變長之後，最大的敵人是「同一段邏輯複製了好幾份」與「一個 main 寫了兩百行」。函式讓你把一個步驟命名、寫一次、到處使用，也讓大問題可以拆成一個個小問題各自測試。',
  sections: [
    {
      id: 'define-and-call', title: '定義與呼叫',
      blocks: [
        { type: 'p', text: '函式（function）是一段有名字的程式：給它輸入（參數），它做完工作後交回結果（回傳值）。定義一次之後，任何地方都可以呼叫它。' },
        { type: 'example', id: 'square' },
        { type: 'list', items: [
          'C++：寫出回傳型別、名稱與參數：`int square(int x)`。函式要在使用之前定義，或先寫宣告（`int square(int x);`）。',
          'Python：`def square(x):`，不寫型別；函式也要在「被呼叫的那一行執行之前」定義。',
          'Java：函式稱為方法（method），要寫在類別裡。因為 `main` 是 `static`，在 main 中直接呼叫的方法也要加 `static`。',
        ] },
      ],
    },
    {
      id: 'call-flow', title: '呼叫時發生了什麼事',
      blocks: [
        { type: 'p', text: '呼叫函式時，程式暫停目前的位置，把引數的值交給參數，跳到函式裡執行；遇到 `return` 時帶著回傳值回到剛才暫停的地方，繼續往下。每一次呼叫都有自己的一份區域變數，這些「呼叫紀錄」疊成呼叫堆疊（call stack），最上面的是正在執行的那一個。' },
        { type: 'p', text: '在下方的視覺化中觀察：呼叫 `square(3)` 時堆疊多了一層，main 進入等待；return 之後這一層消失，回傳值交回 main。' },
        { type: 'callout', tone: 'note', title: 'return 會立刻結束函式', text: '執行到 return 就離開函式，後面的敘述不會執行。可以利用這一點「提早回傳」：例如判斷質數時，一找到因數就 `return false`。' },
      ],
    },
    {
      id: 'print-vs-return', title: '印出來和回傳回來不一樣',
      blocks: [
        { type: 'p', text: '有些函式只做一件事、不交回結果，例如印出一條分隔線：C++ 與 Java 的回傳型別寫 `void`，Python 不寫 return 時會回傳 `None`。' },
        { type: 'example', id: 'line' },
        { type: 'callout', tone: 'warning', title: '計算型的函式請 return，不要 print', text: '如果 `square` 只是把結果印出來，呼叫的人就拿不到這個值去做下一步計算（例如 `square(3) + square(4)`）。原則：負責「算」的函式回傳結果，由呼叫者決定要不要印。Python 中把只會 print 的函式結果拿去運算，會得到 None 而出錯。' },
      ],
    },
    {
      id: 'decompose', title: '用函式拆解問題',
      blocks: [
        { type: 'p', text: '「列出 1～n 的質數」可以拆成兩個問題：怎麼判斷一個數是不是質數？怎麼走過 1～n？把前者寫成函式 `is_prime`，主程式就變得像一句話：「對每個 k，如果 is_prime(k) 就印出來」。' },
        { type: 'example', id: 'primes' },
        { type: 'p', text: '判斷質數只需要試除到 √n：如果 n 有大於 √n 的因數，就一定有一個對應的、小於 √n 的因數。迴圈條件寫成 `i * i <= n` 可以避免浮點數的平方根。' },
      ],
    },
  ],
  examples: [
    {
      id: 'square', title: '定義並呼叫 square', description: '同一個函式呼叫兩次，回傳值直接參與運算。',
      output: '25',
      code: {
        'C++': code`#include <iostream>

int square(int x) {
    return x * x;
}

int main() {
    std::cout << square(3) + square(4) << "\n";
    return 0;
}`,
        Python: code`def square(x):
    return x * x


print(square(3) + square(4))`,
        Java: code`public class Main {
    static int square(int x) {
        return x * x;
    }

    public static void main(String[] args) {
        System.out.println(square(3) + square(4));
    }
}`,
      },
    },
    {
      id: 'line', title: '不回傳值的函式', description: '印出指定字元與長度的分隔線，呼叫三次。',
      output: '---\n=====\n---',
      code: {
        'C++': code`#include <iostream>
#include <string>

void line(char ch, int n) {
    std::cout << std::string(n, ch) << "\n";
}

int main() {
    line('-', 3);
    line('=', 5);
    line('-', 3);
    return 0;
}`,
        Python: code`def line(ch, n):
    print(ch * n)  # 沒有 return，呼叫結果是 None


line("-", 3)
line("=", 5)
line("-", 3)`,
        Java: code`public class Main {
    static void line(char ch, int n) {
        System.out.println(String.valueOf(ch).repeat(n));
    }

    public static void main(String[] args) {
        line('-', 3);
        line('=', 5);
        line('-', 3);
    }
}`,
      },
    },
    {
      id: 'primes', title: '用 is_prime 列出質數', description: '讀入 n，列出 2～n 的質數，最後一行是個數。判斷質數的細節都藏在函式裡。',
      stdin: '20', output: '2 3 5 7 11 13 17 19\n8',
      code: {
        'C++': code`#include <iostream>
#include <vector>

bool isPrime(int n) {
    if (n < 2) return false;
    for (int i = 2; i * i <= n; ++i) {
        if (n % i == 0) return false;  // 找到因數就提早回傳
    }
    return true;
}

int main() {
    int n;
    std::cin >> n;
    std::vector<int> found;
    for (int k = 2; k <= n; ++k) {
        if (isPrime(k)) found.push_back(k);
    }
    for (size_t i = 0; i < found.size(); ++i) std::cout << found[i] << (i + 1 < found.size() ? " " : "\n");
    std::cout << found.size() << "\n";
    return 0;
}`,
        Python: code`def is_prime(n):
    if n < 2:
        return False
    i = 2
    while i * i <= n:
        if n % i == 0:
            return False  # 找到因數就提早回傳
        i += 1
    return True


n = int(input())
found = [k for k in range(2, n + 1) if is_prime(k)]
print(*found)
print(len(found))`,
        Java: code`import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
    static boolean isPrime(int n) {
        if (n < 2) return false;
        for (int i = 2; i * i <= n; ++i) {
            if (n % i == 0) return false;  // 找到因數就提早回傳
        }
        return true;
    }

    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt();
        List<String> found = new ArrayList<>();
        for (int k = 2; k <= n; ++k) {
            if (isPrime(k)) found.add(String.valueOf(k));
        }
        System.out.println(String.join(" ", found));
        System.out.println(found.size());
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'function-call', title: '呼叫 square 兩次', language: 'C++',
    code: code`int square(int x) {
    int r = x * x;
    return r;
}
int main() {
    int a = square(3);
    int b = square(4);
    std::cout << a + b;
}`,
    steps: [
      { line: 5, note: '程式從 main 開始，堆疊上只有 main。', frames: [{ name: 'main', vars: {} }] },
      { line: 1, note: '呼叫 square(3)：main 暫停在第 6 行，堆疊多一層，參數 x 得到 3。', frames: [{ name: 'main', vars: {} }, { name: 'square(3)', vars: { x: '3' } }] },
      { line: 2, note: 'r 是 square 自己的區域變數：3 × 3 = 9。', frames: [{ name: 'main', vars: {} }, { name: 'square(3)', vars: { x: '3', r: '9' } }] },
      { line: 3, note: 'return 9：square 結束，這一層即將移除。', frames: [{ name: 'main', vars: {} }, { name: 'square(3)', vars: { x: '3', r: '9' }, returns: '9' }] },
      { line: 6, note: '回到 main 第 6 行，a = 9。square 的 x 與 r 已經不存在。', frames: [{ name: 'main', vars: { a: '9' } }] },
      { line: 1, note: '呼叫 square(4)：一個全新的呼叫，有自己的 x，和上一次無關。', frames: [{ name: 'main', vars: { a: '9' } }, { name: 'square(4)', vars: { x: '4' } }] },
      { line: 3, note: 'r = 16，return 16。', frames: [{ name: 'main', vars: { a: '9' } }, { name: 'square(4)', vars: { x: '4', r: '16' }, returns: '16' }] },
      { line: 7, note: '回到 main，b = 16。', frames: [{ name: 'main', vars: { a: '9', b: '16' } }] },
      { line: 8, note: '輸出 9 + 16 = 25。', frames: [{ name: 'main', vars: { a: '9', b: '16' } }], output: '25' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的程式輸出什麼？',
      code: { language: 'Python', text: 'def f(x):\n    return x * 2 + 1\n\nprint(f(f(2)))' },
      options: ['5', '9', '11', '10'],
      answer: 2, explanation: '先算內層 f(2) = 2 × 2 + 1 = 5，再算外層 f(5) = 5 × 2 + 1 = 11。函式的回傳值可以直接當成另一次呼叫的引數。',
    },
    {
      id: 'q2', prompt: '下面的程式輸出什麼？',
      code: { language: 'Python', text: 'def show(x):\n    print(x)\n\nr = show(3)\nprint(r)' },
      options: ['3 與 3', '3 與 None', '只有 None', 'NameError'],
      answer: 1, explanation: 'show 印出 3，但沒有 return，所以呼叫的結果是 None，r 也是 None。「印出」和「回傳」是兩件不同的事。',
    },
    {
      id: 'q3', prompt: '在 Java 的 main 中直接呼叫下面的方法會怎樣？',
      code: { language: 'Java', text: 'public class Main {\n    int square(int x) { return x * x; }\n\n    public static void main(String[] args) {\n        System.out.println(square(3));\n    }\n}' },
      options: ['印出 9', '編譯錯誤：static 的 main 不能直接呼叫非 static 的方法', '執行期錯誤', '印出 0'],
      answer: 1, explanation: 'main 是 static，沒有建立 Main 物件時不能直接呼叫非 static 的方法。初學階段把輔助方法都宣告成 `static int square(int x)` 即可。',
    },
    {
      id: 'q4', prompt: '這段 C++ 程式為什麼無法編譯？',
      code: { language: 'C++', text: 'int main() {\n    std::cout << twice(5);\n}\nint twice(int x) { return x * 2; }' },
      options: ['twice 少了 static', 'main 必須寫在最後', '使用 twice 時它還沒有被宣告', 'return 不能寫在同一行'],
      answer: 2, explanation: 'C++ 由上往下編譯，在 main 中看到 twice 時還不知道它是什麼。把 twice 移到 main 前面，或在前面先寫宣告 `int twice(int x);`。Python 只要「呼叫的那一刻」函式已經定義即可，規則不同。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '質數查詢',
      statement: '寫一個函式判斷一個整數是不是質數（大於 1、且只能被 1 與自己整除），用它回答 T 個查詢。注意數字可達 10⁹，只能試除到平方根；小於 2 的數（包括 0 與負數）都不是質數。',
      inputFormat: '第一行 T；接下來 T 行各一個整數 n。',
      outputFormat: 'T 行，各為 `prime` 或 `not prime`。',
      constraints: ['1 ≤ T ≤ 100', '−10⁹ ≤ n ≤ 10⁹'],
      samples: [{ kind: 'normal', input: '4\n2\n15\n17\n97', output: 'prime\nnot prime\nprime\nprime', note: '15 = 3 × 5' }],
      tests: [
        { kind: 'normal', input: '4\n2\n15\n17\n97', output: 'prime\nnot prime\nprime\nprime', note: '一般情況' },
        { kind: 'normal', input: '3\n49\n91\n101', output: 'not prime\nnot prime\nprime', note: '49 = 7²、91 = 7 × 13：試除要包含平方根本身' },
        { kind: 'edge', input: '2\n1\n2', output: 'not prime\nprime', note: '1 不是質數，2 是最小的質數' },
        { kind: 'edge', input: '1\n999999937', output: 'prime', note: '小於 10⁹ 的最大質數：試除到平方根約 31,623 次' },
        { kind: 'edge', input: '1\n1000000000', output: 'not prime', note: '最大值' },
        { kind: 'error', input: '2\n0\n-7', output: 'not prime\nnot prime', note: '0 與負數不是質數；函式要先擋掉，否則負數取餘數在各語言結果不同' },
      ],
      hints: ['函式開頭先處理 n < 2。', '用 `i * i <= n` 當條件；C++／Java 的 i 用 long long／long 可避免 i * i 溢位。', '找到第一個因數就 return。'],
      solution: {
        'C++': code`#include <iostream>

bool isPrime(long long n) {
    if (n < 2) return false;
    for (long long i = 2; i * i <= n; ++i) {
        if (n % i == 0) return false;
    }
    return true;
}

int main() {
    int t;
    std::cin >> t;
    while (t--) {
        long long n;
        std::cin >> n;
        std::cout << (isPrime(n) ? "prime" : "not prime") << "\n";
    }
    return 0;
}`,
        Python: code`import sys


def is_prime(n):
    if n < 2:
        return False
    i = 2
    while i * i <= n:
        if n % i == 0:
            return False
        i += 1
    return True


data = sys.stdin.read().split()
t = int(data[0])
for token in data[1:1 + t]:
    print("prime" if is_prime(int(token)) else "not prime")`,
        Java: code`import java.util.Scanner;

public class Main {
    static boolean isPrime(long n) {
        if (n < 2) return false;
        for (long i = 2; i * i <= n; ++i) {
            if (n % i == 0) return false;
        }
        return true;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int t = sc.nextInt();
        for (int k = 0; k < t; ++k) {
            System.out.println(isPrime(sc.nextLong()) ? "prime" : "not prime");
        }
    }
}`,
      },
      judge: 'none',
    },
  ],
};

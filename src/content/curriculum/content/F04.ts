import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * F04 運算子與運算順序. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also
 * offers JavaScript (Node.js); integer division uses Math.trunc (like C++/Java), so `division` prints the default output.
 */
export const F04: LessonContent = {
  lessonId: 'F04',
  motivation: '每一個計算、換算與判斷都由運算子組成。搞懂優先順序與整數除法，才能預測程式「真正」算出什麼，而不是你以為它算出什麼。',
  sections: [
    {
      id: 'arithmetic', title: '算術運算子與整數除法',
      blocks: [
        { type: 'p', text: '加 `+`、減 `-`、乘 `*` 的行為各語言都一樣。除法和餘數則要特別小心，因為它們會依「運算元的型別」和「語言」而不同：' },
        { type: 'table', head: ['運算', 'C++／Java（兩個整數）', 'Python', 'JavaScript'], rows: [
          ['7 ÷ 2', '`7 / 2` → 3（整數除法）', '`7 / 2` → 3.5；`7 // 2` → 3', '`7 / 2` → 3.5；`Math.trunc(7 / 2)` → 3'],
          ['7 除以 2 的餘數', '`7 % 2` → 1', '`7 % 2` → 1', '`7 % 2` → 1'],
          ['−7 ÷ 2', '`-7 / 2` → −3（向 0 捨去）', '`-7 // 2` → −4（向下取整）', '`Math.trunc(-7 / 2)` → −3（向 0 捨去）；`Math.floor(-7 / 2)` → −4'],
          ['−7 除以 2 的餘數', '`-7 % 2` → −1（與被除數同號）', '`-7 % 2` → 1（與除數同號）', '`-7 % 2` → −1（與被除數同號）'],
        ] },
        { type: 'example', id: 'division' },
        { type: 'p', text: '不論哪一種語言，「商 × 除數 + 餘數 = 被除數」都成立：C++ 是 (−3) × 2 + (−1) = −7，Python 是 (−4) × 2 + 1 = −7。差別只在商往哪個方向取整。JavaScript 只有一種 `/`（保留小數），它的 `%` 和 C++、Java 一樣與被除數同號，所以範例用 `Math.trunc` 取商，結果與 C++、Java 相同；若要 Python 的向下取整就用 `Math.floor`。被除數與除數都不是負數時，各語言的結果相同。' },
        { type: 'callout', tone: 'warning', title: '用 % 判斷奇數的陷阱', text: 'C++、Java 與 JavaScript 中 `-3 % 2` 等於 −1，所以 `n % 2 == 1` 對負奇數會判斷錯誤。判斷奇數請寫 `n % 2 != 0`，各語言都正確。' },
      ],
    },
    {
      id: 'precedence-rules', title: '優先順序與結合性',
      blocks: [
        { type: 'p', text: '一個運算式有多個運算子時，先算優先順序高的；優先順序相同時，依結合性決定方向（大多數是由左到右）。常用運算子由高到低大致如下：' },
        { type: 'table', head: ['優先順序', '運算子', '說明'], rows: [
          ['1（最高）', '`( )`', '括號內先算'],
          ['2', '`**`（Python 與 JavaScript）', '次方，由右到左：`2 ** 3 ** 2` 是 2⁹ = 512'],
          ['3', '`*` `/` `//` `%`', '乘、除、取餘數，由左到右'],
          ['4', '`+` `-`', '加、減，由左到右'],
          ['5', '`<` `<=` `>` `>=` `==` `!=`', '比較，結果是布林值（JavaScript 判斷相等建議用 `===` `!==`）'],
          ['6', '`&&` `||`（Python：`and` `or`）', '邏輯運算，下一堂課詳細介紹'],
          ['7（最低）', '`=` `+=` `-=` …', '指定，最後才把結果存入變數'],
        ] },
        { type: 'example', id: 'precedence' },
        { type: 'p', text: '`10 - 4 - 3` 由左到右是 (10 − 4) − 3 = 3，不是 10 − (4 − 3) = 9。不確定時就加括號：括號不會讓程式變慢，卻能讓意思更清楚。在下方的視覺化中，逐步看 `2 + 3 * 4 - 6 / 2` 是如何被計算的。' },
        { type: 'callout', tone: 'note', title: 'C++ 與 Java 沒有次方運算子', text: 'C++ 的 `^` 是位元互斥或（XOR），`2 ^ 3` 等於 1 而不是 8。次方要用 `std::pow`（C++）或 `Math.pow`（Java），但它們回傳浮點數；整數次方通常用迴圈連乘，避免誤差。JavaScript 和 Python 一樣有 `**`（`2 ** 3` 是 8），`^` 則和 C++ 一樣是 XOR。' },
      ],
    },
    {
      id: 'comparison', title: '比較運算子與複合指定',
      blocks: [
        { type: 'p', text: '比較運算子的結果是布林值（true／false）。要判斷 x 是否介於 0 到 100：Python 可以直接寫 `0 <= x <= 100`；C++、Java 與 JavaScript 必須拆成兩個比較，寫成 `0 <= x && x <= 100`。' },
        { type: 'callout', tone: 'warning', title: 'C++ 的 0 <= x <= 100 永遠成立', text: '在 C++ 中，`0 <= x <= 100` 會先算 `0 <= x` 得到 true（1）或 false（0），再比較 `1 <= 100` 或 `0 <= 100`，結果一定是 true。編譯器只會給警告，不會阻止你。Java 則會直接編譯錯誤。JavaScript 和 C++ 一樣由左到右計算，`0 <= 150 <= 100` 也是 true，而且不會有任何警告。' },
        { type: 'p', text: '複合指定把「運算後存回」寫得更短：`x += 3` 等於 `x = x + 3`，`x *= 2`、`x %= 10` 依此類推。C++、Java 與 JavaScript 另有 `x++`、`x--`（加 1、減 1）；Python 沒有 `++`，要寫 `x += 1`。' },
        { type: 'example', id: 'compound' },
      ],
    },
    {
      id: 'conversion', title: '應用：用除法和餘數換算單位',
      blocks: [
        { type: 'p', text: '整數除法與餘數最常見的用途是換算：3725 秒是幾小時幾分幾秒？先用 `/ 3600` 求小時，`% 3600` 是剩下不足一小時的秒數，再對它用 `/ 60` 和 `% 60`。JavaScript 的 `/` 會留下小數，求小時、分鐘要寫 `Math.floor(total / 3600)`（秒數不為負）。' },
        { type: 'example', id: 'time' },
        { type: 'p', text: '同樣的方法可以取出一個數的個位數（`n % 10`）、去掉個位數（`n / 10`），或把分鐘數換成「天、時、分」。' },
      ],
    },
  ],
  examples: [
    {
      id: 'division', title: '正數與負數的除法', description: '分別印出 7 與 −7 除以 2 的商與餘數。C++、Java（以及用 `Math.trunc` 的 JavaScript）與 Python 的結果在負數時不同。',
      output: '3 1\n-3 -1', outputByLanguage: { Python: '3 1\n-4 1' },
      code: {
        'C++': code`#include <iostream>

int main() {
    std::cout << 7 / 2 << " " << 7 % 2 << "\n";
    std::cout << -7 / 2 << " " << -7 % 2 << "\n";
    return 0;
}`,
        Python: code`print(7 // 2, 7 % 2)
print(-7 // 2, -7 % 2)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        System.out.println(7 / 2 + " " + 7 % 2);
        System.out.println(-7 / 2 + " " + -7 % 2);
    }
}`,
        JavaScript: code`console.log(Math.trunc(7 / 2), 7 % 2);
console.log(Math.trunc(-7 / 2), -7 % 2);  // 和 C++、Java 一樣向 0 捨去`,
      },
    },
    {
      id: 'precedence', title: '優先順序與由左到右', description: '括號、乘除先於加減，同級由左到右。',
      output: '14\n20\n3\n2',
      code: {
        'C++': code`#include <iostream>

int main() {
    std::cout << 2 + 3 * 4 << "\n";    // 乘法先算
    std::cout << (2 + 3) * 4 << "\n";  // 括號先算
    std::cout << 10 - 4 - 3 << "\n";   // 由左到右
    std::cout << 20 / 5 / 2 << "\n";   // (20 / 5) / 2
    return 0;
}`,
        Python: code`print(2 + 3 * 4)    # 乘法先算
print((2 + 3) * 4)  # 括號先算
print(10 - 4 - 3)   # 由左到右
print(20 // 5 // 2) # (20 // 5) // 2`,
        Java: code`public class Main {
    public static void main(String[] args) {
        System.out.println(2 + 3 * 4);    // 乘法先算
        System.out.println((2 + 3) * 4);  // 括號先算
        System.out.println(10 - 4 - 3);   // 由左到右
        System.out.println(20 / 5 / 2);   // (20 / 5) / 2
    }
}`,
        JavaScript: code`console.log(2 + 3 * 4);    // 乘法先算
console.log((2 + 3) * 4);  // 括號先算
console.log(10 - 4 - 3);   // 由左到右
console.log(20 / 5 / 2);   // (20 / 5) / 2`,
      },
    },
    {
      id: 'compound', title: '複合指定', description: '從 10 開始，依序加 5、乘 2、取除以 7 的餘數，再加 1。',
      output: '15\n30\n2\n3',
      code: {
        'C++': code`#include <iostream>

int main() {
    int x = 10;
    x += 5;  std::cout << x << "\n";
    x *= 2;  std::cout << x << "\n";
    x %= 7;  std::cout << x << "\n";
    x++;     std::cout << x << "\n";
    return 0;
}`,
        Python: code`x = 10
x += 5
print(x)
x *= 2
print(x)
x %= 7
print(x)
x += 1  # Python 沒有 ++
print(x)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int x = 10;
        x += 5;  System.out.println(x);
        x *= 2;  System.out.println(x);
        x %= 7;  System.out.println(x);
        x++;     System.out.println(x);
    }
}`,
        JavaScript: code`let x = 10;
x += 5;  console.log(x);
x *= 2;  console.log(x);
x %= 7;  console.log(x);
x++;     console.log(x);`,
      },
    },
    {
      id: 'time', title: '秒數換算成時、分、秒', description: '讀入總秒數，輸出小時、分鐘、秒。',
      stdin: '3725', output: '1 2 5',
      code: {
        'C++': code`#include <iostream>

int main() {
    int total;
    std::cin >> total;
    int hours = total / 3600;
    int rest = total % 3600;
    std::cout << hours << " " << rest / 60 << " " << rest % 60 << "\n";
    return 0;
}`,
        Python: code`total = int(input())
hours, rest = divmod(total, 3600)
minutes, seconds = divmod(rest, 60)
print(hours, minutes, seconds)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int total = new Scanner(System.in).nextInt();
        int hours = total / 3600;
        int rest = total % 3600;
        System.out.println(hours + " " + rest / 60 + " " + rest % 60);
    }
}`,
        JavaScript: code`const total = Number(require("fs").readFileSync(0, "utf8").trim());
const hours = Math.floor(total / 3600);  // / 會留下小數，要取整數
const rest = total % 3600;
console.log(hours, Math.floor(rest / 60), rest % 60);`,
      },
    },
  ],
  visualization: {
    kind: 'variable-state', title: '逐步計算：2 + 3 * 4 - 6 / 2', language: 'C++',
    code: code`int r = 2 + 3 * 4 - 6 / 2;
// 第 1 步：3 * 4 → 12
// 第 2 步：6 / 2 → 3
// 第 3 步：2 + 12 → 14
// 第 4 步：14 - 3 → 11`,
    steps: [
      { line: 1, note: '從最高優先順序開始：這裡沒有括號，先找乘、除。', vars: { '運算式': '2 + 3 * 4 - 6 / 2' } },
      { line: 2, note: '乘除由左到右，先算 3 * 4 = 12。', vars: { '運算式': '2 + 12 - 6 / 2' } },
      { line: 3, note: '再算 6 / 2 = 3（整數除法，剛好整除）。', vars: { '運算式': '2 + 12 - 3' } },
      { line: 4, note: '乘除都算完，接著加減由左到右：2 + 12 = 14。', vars: { '運算式': '14 - 3' } },
      { line: 5, note: '14 - 3 = 11。最後才執行指定，把 11 存入 r。', vars: { '運算式': '11', r: '11' } },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'int a = 17, b = 5;\nstd::cout << a / b << " " << a % b;' },
      options: ['3.4 2', '3 2', '3 3', '4 2'],
      answer: 1, explanation: '17 ÷ 5 = 3 餘 2。兩個 int 相除是整數除法，得到 3；`%` 取餘數得到 2。驗算：3 × 5 + 2 = 17。',
    },
    {
      id: 'q2', prompt: 'Python 中 `-7 // 2` 的結果是？',
      options: ['-3', '-4', '-3.5', '3'],
      answer: 1, explanation: 'Python 的 `//` 是向下取整（往負無限大方向），−3.5 向下取整是 −4。C++ 與 Java 的整數除法則是向 0 捨去，`-7 / 2` 會得到 −3。',
    },
    {
      id: 'q3', prompt: 'Python 中 `2 + 3 * 4 ** 2` 的結果是？',
      options: ['400', '50', '196', '98'],
      answer: 1, explanation: '次方最先算：4 ** 2 = 16；接著乘法 3 × 16 = 48；最後加法 2 + 48 = 50。',
    },
    {
      id: 'q4', prompt: '在 C++ 中，`int x = 150;` 之後，`(0 <= x <= 100)` 的值是？',
      options: ['false，因為 150 不在 0～100 之間', 'true，因為它先算 0 <= x 得到 1，再算 1 <= 100', '編譯錯誤', '執行期錯誤'],
      answer: 1, explanation: 'C++ 由左到右計算：`0 <= 150` 是 true（數值 1），接著 `1 <= 100` 也是 true。所以不論 x 是多少，結果都是 true。正確寫法是 `0 <= x && x <= 100`。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '時間格式換算',
      statement: '讀入一個總秒數 S，換算成「時:分:秒」的格式輸出。分與秒一律以兩位數表示（不足補 0），小時則不補 0，也可以超過 24。',
      inputFormat: '一個整數 S。',
      outputFormat: '一行 `H:MM:SS`。',
      constraints: ['0 ≤ S ≤ 1,000,000,000'],
      samples: [{ kind: 'normal', input: '3725', output: '1:02:05', note: '3725 秒 = 1 小時 2 分 5 秒' }],
      tests: [
        { kind: 'normal', input: '3725', output: '1:02:05', note: '一般情況' },
        { kind: 'normal', input: '59', output: '0:00:59', note: '不到一分鐘' },
        { kind: 'normal', input: '7260', output: '2:01:00', note: '秒數為 0 也要補成 00' },
        { kind: 'edge', input: '0', output: '0:00:00', note: '最小值' },
        { kind: 'edge', input: '86399', output: '23:59:59', note: '一天的最後一秒' },
        { kind: 'edge', input: '1000000000', output: '277777:46:40', note: '最大值；仍在 int 範圍內' },
      ],
      errorPolicy: '題目保證 0 ≤ S ≤ 1,000,000,000。',
      hints: ['小時 = S / 3600（Python 用 //，JavaScript 用 `Math.floor(S / 3600)`），剩下的秒數 = S % 3600。', '補 0：C++ 用 `std::setw(2) << std::setfill(\'0\')`，Python 用 `f"{m:02d}"`，Java 用 `String.format("%02d", m)`，JavaScript 用 `String(m).padStart(2, "0")`。'],
      solution: {
        'C++': code`#include <iomanip>
#include <iostream>

int main() {
    long long s;
    std::cin >> s;
    long long h = s / 3600, m = s % 3600 / 60, sec = s % 60;
    std::cout << h << ":" << std::setfill('0') << std::setw(2) << m << ":" << std::setw(2) << sec << "\n";
    return 0;
}`,
        Python: code`s = int(input())
h, rest = divmod(s, 3600)
m, sec = divmod(rest, 60)
print(f"{h}:{m:02d}:{sec:02d}")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        long s = new Scanner(System.in).nextLong();
        long h = s / 3600, m = s % 3600 / 60, sec = s % 60;
        System.out.println(String.format("%d:%02d:%02d", h, m, sec));
    }
}`,
        JavaScript: code`const s = Number(require("fs").readFileSync(0, "utf8").trim());
const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
console.log(h + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0"));`,
      },
      judge: 'none',
    },
  ],
};

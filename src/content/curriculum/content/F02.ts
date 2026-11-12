import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * F02 變數與資料型別. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also
 * offers JavaScript (Node.js); its single `number` type holds the lesson's integers exactly (below 2^53), so no BigInt.
 */
export const F02: LessonContent = {
  lessonId: 'F02',
  motivation: '所有程式都在記住並改變資料。選對型別，能避開整數溢位與浮點誤差這兩種最常見、又最難從輸出察覺的錯誤。',
  sections: [
    {
      id: 'variables', title: '變數：有名字的儲存位置',
      blocks: [
        { type: 'p', text: '變數（variable）是一個有名字的儲存位置，用來記住程式執行過程中的資料。`=` 在程式裡是「指定」（assignment）：先算出右邊的值，再存進左邊的變數。它不是數學的「相等」，所以 `x = x + 1` 是合理的敘述，意思是「把 x 目前的值加 1 後存回 x」。' },
        { type: 'example', id: 'declare' },
        { type: 'list', items: [
          'C++ 與 Java 是靜態型別語言：宣告時寫出型別（`int age`），之後這個變數只能存放該型別的值。',
          'Python 是動態型別語言：變數名稱不帶型別，型別跟著「值」走，`x = 5` 之後也可以寫 `x = "five"`。',
          'JavaScript 也是動態型別：用 `let`（之後還會改值）或 `const`（不再改值）宣告變數，不寫型別。',
          '變數名稱要有意義：`total`、`age` 比 `t`、`a1` 容易讀；名稱不能以數字開頭，也不能使用語言的關鍵字。',
        ] },
      ],
    },
    {
      id: 'types', title: '常用資料型別',
      blocks: [
        { type: 'p', text: '型別決定了一個值能存多大、多精確，以及能做哪些運算。初學階段最常用的是下面幾種：' },
        { type: 'table', head: ['用途', 'C++', 'Python', 'Java', 'JavaScript'], rows: [
          ['整數（約 ±21 億）', '`int`', '`int`（不限大小）', '`int`', '`number`（整數可精確到 2⁵³）'],
          ['大整數（約 ±9.2 × 10¹⁸）', '`long long`', '`int`', '`long`', '`BigInt`（如 `10n`，不限大小）'],
          ['小數', '`double`', '`float`', '`double`', '`number`（同一種型別）'],
          ['真假', '`bool`（true／false）', '`bool`（True／False）', '`boolean`（true／false）', '`boolean`（true／false）'],
          ['單一字元', '`char`（`\'A\'`）', '長度 1 的 `str`', '`char`（`\'A\'`）', '長度 1 的 `string`'],
          ['文字', '`std::string`', '`str`', '`String`', '`string`'],
        ] },
        { type: 'callout', tone: 'note', title: '整數與小數是不同的型別', text: '在 C++ 與 Java 中，`7` 是整數，`7.0` 是浮點數；兩個整數運算的結果仍是整數。Python 的 `/` 則一定產生小數，整數除法要用 `//`。JavaScript 的整數和小數都是同一種 `number`（`7 === 7.0`），`/` 也一定保留小數，要取整數得用 `Math.trunc` 或 `Math.floor`（運算子課會詳細比較）。' },
      ],
    },
    {
      id: 'integer-overflow', title: '整數溢位：數字超過型別能存的範圍',
      blocks: [
        { type: 'p', text: 'C++ 與 Java 的 `int` 使用 32 個位元，最大只能存到 2,147,483,647。50,000 × 50,000 = 2,500,000,000 已經超過這個範圍，必須改用 64 位元的 `long long`（C++）或 `long`（Java）。' },
        { type: 'example', id: 'overflow' },
        { type: 'callout', tone: 'warning', title: '型別要在「計算之前」就夠大', text: 'C++ 寫 `long long big = 50000 * 50000;` 仍然會錯：右邊兩個 `int` 先相乘就已經溢位，之後才轉成 `long long`。要讓其中一個運算元先變成 64 位元，例如 `50000LL * 50000`（Java 寫 `50000L * 50000`）。在 C++ 中，有號整數溢位是未定義行為；Java 會繞回成負數；Python 的整數則沒有上限。JavaScript 的 `number` 是 64 位元浮點數，不會繞回，但整數超過 2⁵³（約 9 × 10¹⁵）就不再精確，更大的整數要用 `BigInt`，例如 `50000n * 50000n`。' },
        { type: 'p', text: '解題時先看資料範圍：如果相加、相乘的結果可能超過約 2 × 10⁹，就使用 64 位元整數。這是 APCS 實作題與線上評測常見的失分原因。' },
      ],
    },
    {
      id: 'floating-point', title: '浮點數誤差',
      blocks: [
        { type: 'p', text: '電腦以二進位儲存小數，像 0.1 這樣的數無法被精確表示，只能存一個非常接近的值。因此 `0.1 + 0.2` 不會剛好等於 `0.3`。' },
        { type: 'example', id: 'float' },
        { type: 'list', items: [
          '比較兩個小數是否「相等」時，改用「差距小於一個很小的數」，例如 `abs(x - 0.3) < 1e-9`。',
          '輸出小數時，依題目要求指定小數位數，不要依賴語言預設的輸出格式（各語言的預設格式不同；JavaScript 用 `x.toFixed(2)`）。',
          '能用整數就用整數：金額可以用「分」為單位存成整數，避免累積誤差。',
        ] },
      ],
    },
    {
      id: 'swapping', title: '交換兩個變數',
      blocks: [
        { type: 'p', text: '想交換 `a` 和 `b` 的值，不能直接寫 `a = b; b = a;`：第一行執行後 `a` 原本的值就被覆蓋、消失了。需要一個暫存變數先保存它：' },
        { type: 'example', id: 'swap' },
        { type: 'p', text: '在下方的視覺化中逐步執行，觀察 `temp` 如何保住 `a` 原本的值。Python 也可以寫成 `a, b = b, a`，JavaScript 可以寫成 `[a, b] = [b, a]`，C++ 可以用 `std::swap(a, b)`，但先理解暫存變數的做法，之後追蹤程式才不會出錯。' },
      ],
    },
  ],
  examples: [
    {
      id: 'declare', title: '宣告、指定與更新', description: '建立三個不同型別的變數，再把 age 更新為新的值。',
      output: 'Mia 15 162.5\nMia 16 162.5',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    std::string name = "Mia";
    int age = 15;
    double height = 162.5;
    std::cout << name << " " << age << " " << height << "\n";
    age = age + 1;  // 一年後
    std::cout << name << " " << age << " " << height << "\n";
    return 0;
}`,
        Python: code`name = "Mia"
age = 15
height = 162.5
print(name, age, height)
age = age + 1  # 一年後
print(name, age, height)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        String name = "Mia";
        int age = 15;
        double height = 162.5;
        System.out.println(name + " " + age + " " + height);
        age = age + 1;  // 一年後
        System.out.println(name + " " + age + " " + height);
    }
}`,
        JavaScript: code`const name = "Mia";
let age = 15;
const height = 162.5;
console.log(name, age, height);
age = age + 1;  // 一年後
console.log(name, age, height);`,
      },
    },
    {
      id: 'overflow', title: '32 位元的上限與 64 位元整數', description: '第一行印出 32 位元整數的最大值，第二行用 64 位元整數算出 50000 × 50000。',
      output: '2147483647\n2500000000',
      code: {
        'C++': code`#include <iostream>
#include <limits>

int main() {
    std::cout << std::numeric_limits<int>::max() << "\n";
    long long big = 50000LL * 50000;  // 先轉成 64 位元再相乘
    std::cout << big << "\n";
    return 0;
}`,
        Python: code`print(2**31 - 1)     # C++ / Java 的 int 最大值
big = 50000 * 50000  # Python 的 int 沒有上限
print(big)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        System.out.println(Integer.MAX_VALUE);
        long big = 50000L * 50000;  // 先轉成 64 位元再相乘
        System.out.println(big);
    }
}`,
        JavaScript: code`console.log(2 ** 31 - 1);    // C++ / Java 的 int 最大值
const big = 50000 * 50000;  // number 可精確表示到 2 ** 53
console.log(big);`,
      },
    },
    {
      id: 'float', title: '0.1 + 0.2 與 0.3', description: '以兩位小數輸出結果，並分別用「==」與「差距很小」比較。',
      output: '0.30\ndifferent\nclose',
      code: {
        'C++': code`#include <cmath>
#include <iomanip>
#include <iostream>

int main() {
    double x = 0.1 + 0.2;
    std::cout << std::fixed << std::setprecision(2) << x << "\n";
    std::cout << (x == 0.3 ? "same" : "different") << "\n";
    std::cout << (std::fabs(x - 0.3) < 1e-9 ? "close" : "far") << "\n";
    return 0;
}`,
        Python: code`x = 0.1 + 0.2
print(f"{x:.2f}")
print("same" if x == 0.3 else "different")
print("close" if abs(x - 0.3) < 1e-9 else "far")`,
        Java: code`public class Main {
    public static void main(String[] args) {
        double x = 0.1 + 0.2;
        System.out.printf("%.2f%n", x);
        System.out.println(x == 0.3 ? "same" : "different");
        System.out.println(Math.abs(x - 0.3) < 1e-9 ? "close" : "far");
    }
}`,
        JavaScript: code`const x = 0.1 + 0.2;
console.log(x.toFixed(2));
console.log(x === 0.3 ? "same" : "different");
console.log(Math.abs(x - 0.3) < 1e-9 ? "close" : "far");`,
      },
    },
    {
      id: 'swap', title: '用暫存變數交換', description: '交換前後各印出一次 a 與 b。',
      output: '3 7\n7 3',
      code: {
        'C++': code`#include <iostream>

int main() {
    int a = 3, b = 7;
    std::cout << a << " " << b << "\n";
    int temp = a;
    a = b;
    b = temp;
    std::cout << a << " " << b << "\n";
    return 0;
}`,
        Python: code`a, b = 3, 7
print(a, b)
temp = a
a = b
b = temp
print(a, b)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int a = 3, b = 7;
        System.out.println(a + " " + b);
        int temp = a;
        a = b;
        b = temp;
        System.out.println(a + " " + b);
    }
}`,
        JavaScript: code`let a = 3, b = 7;
console.log(a, b);
const temp = a;
a = b;
b = temp;
console.log(a, b);`,
      },
    },
  ],
  visualization: {
    kind: 'variable-state', title: '逐步執行：用暫存變數交換', language: 'C++',
    code: code`int a = 3;
int b = 7;
int temp = a;
a = b;
b = temp;`,
    steps: [
      { line: 1, note: 'a 存入 3。', vars: { a: '3' } },
      { line: 2, note: 'b 存入 7。', vars: { a: '3', b: '7' } },
      { line: 3, note: '先把 a 的值 3 複製到 temp，保住它。', vars: { a: '3', b: '7', temp: '3' } },
      { line: 4, note: 'a 改成 b 的值 7。a 原本的 3 只剩 temp 裡還有。', vars: { a: '7', b: '7', temp: '3' } },
      { line: 5, note: 'b 改成 temp 的值 3，交換完成。', vars: { a: '7', b: '3', temp: '3' } },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '執行完下面三行後，y 的值是多少？',
      code: { language: 'C++', text: 'int x = 4;\nint y = x;\nx = 10;' },
      options: ['4', '10', '14', '無法確定'],
      answer: 0, explanation: '`y = x` 是把 x 當時的值 4 複製給 y。之後 x 改成 10，不會影響已經存好的 y。指定是「複製當下的值」，不是讓兩個變數永遠相等。',
    },
    {
      id: 'q2', prompt: '在 C++ 中要計算 60000 × 60000 並存起來，下列哪一種寫法正確？',
      options: ['int r = 60000 * 60000;', 'long long r = 60000 * 60000;', 'long long r = 60000LL * 60000;', 'double r = 60000 * 60000;'],
      answer: 2, explanation: '60000 × 60000 = 3,600,000,000，超過 int 的上限 2,147,483,647。B 與 D 的右邊仍是兩個 int 相乘，在轉型之前就已經溢位；C 讓其中一個數先成為 long long，整個乘法才以 64 位元計算。',
    },
    {
      id: 'q3', prompt: '為什麼 `0.1 + 0.2 == 0.3` 的結果是 false？',
      options: ['電腦的加法有錯誤', '0.1 和 0.2 無法以二進位精確表示，相加後與 0.3 有極小差距', '需要先轉成整數才能相加', '只有 Python 會這樣'],
      answer: 1, explanation: '0.1、0.2、0.3 在二進位都是無限小數，電腦只能存近似值，相加後的近似值和 0.3 的近似值差了大約 5.5 × 10⁻¹⁷。C++、Python、Java 都使用相同的浮點數格式，所以三者結果一樣。比較小數應檢查差距是否夠小。',
    },
    {
      id: 'q4', prompt: '下列關於型別的敘述，何者正確？',
      options: ['Python 的變數一旦存了整數，就不能再存字串', 'C++ 的 int 變數可以直接存入 "five"', 'Python 的變數型別跟著值走；C++ 與 Java 的變數在宣告時就決定型別', 'Java 的 int 可以存到 10¹⁸'],
      answer: 2, explanation: 'Python 是動態型別，`x = 5` 之後 `x = "five"` 是合法的；C++ 與 Java 是靜態型別，把字串指定給 int 變數會編譯失敗。Java 的 int 上限約 2.1 × 10⁹，10¹⁸ 要用 long。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '交換與總和',
      statement: '讀入兩個整數 a、b。第一行先輸出交換後的結果（b a），第二行輸出兩數的和。注意兩數的和可能超過 32 位元整數的範圍。讀取輸入的程式碼已經寫好，但它使用的型別不一定夠大——請檢查並修正。',
      inputFormat: '一行，兩個整數 a、b，以空白分隔。',
      outputFormat: '兩行：第一行為「b a」，第二行為 a + b。',
      constraints: ['−2,000,000,000 ≤ a, b ≤ 2,000,000,000'],
      samples: [{ kind: 'normal', input: '3 7', output: '7 3\n10', note: '交換後是 7 3，和為 10' }],
      tests: [
        { kind: 'normal', input: '3 7', output: '7 3\n10', note: '一般情況' },
        { kind: 'normal', input: '-5 12', output: '12 -5\n7', note: '含負數' },
        { kind: 'edge', input: '2000000000 1000000000', output: '1000000000 2000000000\n3000000000', note: '和超過 int 上限 2,147,483,647' },
        { kind: 'edge', input: '-2000000000 -2000000000', output: '-2000000000 -2000000000\n-4000000000', note: '和低於 int 下限' },
        { kind: 'edge', input: '0 0', output: '0 0\n0', note: '兩數相同' },
      ],
      errorPolicy: '題目保證輸入是兩個範圍內的整數。',
      hints: ['2,000,000,000 本身放得進 int，但兩數相加就放不下了。', 'C++ 用 long long、Java 用 long；Python 不需要特別處理；JavaScript 的 `number` 能精確表示這個範圍的整數，也不需要特別處理。'],
      starter: {
        'C++': code`#include <iostream>

int main() {
    int a, b;  // 這個型別夠大嗎？
    std::cin >> a >> b;
    // 輸出交換後的 a、b，以及 a + b
    return 0;
}`,
        Python: code`a, b = map(int, input().split())
# 輸出交換後的 a、b，以及 a + b`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt();  // 這個型別夠大嗎？
        // 輸出交換後的 a、b，以及 a + b
    }
}`,
        JavaScript: code`let [a, b] = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);  // number 夠大嗎？
// 輸出交換後的 a、b，以及 a + b`,
      },
      solution: {
        'C++': code`#include <iostream>

int main() {
    long long a, b;
    std::cin >> a >> b;
    long long temp = a;
    a = b;
    b = temp;
    std::cout << a << " " << b << "\n" << a + b << "\n";
    return 0;
}`,
        Python: code`a, b = map(int, input().split())
a, b = b, a
print(a, b)
print(a + b)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        long a = sc.nextLong(), b = sc.nextLong();
        long temp = a;
        a = b;
        b = temp;
        System.out.println(a + " " + b);
        System.out.println(a + b);
    }
}`,
        JavaScript: code`let [a, b] = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const temp = a;
a = b;
b = temp;
console.log(a, b);
console.log(a + b);`,
      },
      judge: 'none',
    },
  ],
};

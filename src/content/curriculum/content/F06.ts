import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * F06 多重條件與邏輯運算. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); JavaScript uses `&&`, `||`, `!` like C++/Java.
 */
export const F06: LessonContent = {
  lessonId: 'F06',
  motivation: '真實的規則很少只有一個條件：「13 到 19 歲」「週末或國定假日」「有票而且已滿 18 歲」。學會把條件組合起來，並知道電腦實際檢查了哪些部分，才能寫出不會漏判、也不會意外當機的判斷。',
  sections: [
    {
      id: 'logical-operators', title: '且、或、非：把條件組合起來',
      blocks: [
        { type: 'p', text: '邏輯運算子把多個布林值組合成一個：「且」要兩邊都成立，「或」只要一邊成立，「非」把真假反過來。C++、Java 與 JavaScript 寫法相同，Python 用英文單字，意思都一樣：' },
        { type: 'table', head: ['意思', 'C++／Java／JavaScript', 'Python', '何時為 true'], rows: [
          ['且（AND）', '`a && b`', '`a and b`', '兩邊都是 true'],
          ['或（OR）', '`a || b`', '`a or b`', '至少一邊是 true'],
          ['非（NOT）', '`!a`', '`not a`', 'a 是 false'],
        ] },
        { type: 'example', id: 'teen' },
        { type: 'p', text: 'Python 可以把比較連起來寫成 `13 <= age <= 19`，意思就是 `13 <= age and age <= 19`。C++、Java 與 JavaScript 不行（上一課看過，C++ 的連續比較永遠成立；JavaScript 也一樣，`13 <= age` 先得到 true 或 false，再和 19 比較），必須用 `&&` 拆成兩個比較。' },
        { type: 'callout', tone: 'warning', title: '「且」和「或」最容易寫反', text: '「分數在 60 到 100 之間」要用「且」：`score >= 60 && score <= 100`。如果寫成「或」，`score >= 60 || score <= 100` 對任何整數都成立——每個數不是大於等於 60，就是小於等於 100。' },
      ],
    },
    {
      id: 'short-circuit', title: '短路求值：結果確定就不再往下算',
      blocks: [
        { type: 'p', text: '四種語言都由左到右計算邏輯運算，而且一旦結果確定就停止：`A && B` 中如果 A 是 false，整體一定是 false，B 就不會被計算；`A || B` 中如果 A 是 true，B 也不會被計算。這稱為短路求值（short-circuit evaluation）。' },
        { type: 'p', text: '短路求值可以用來「先檢查、再使用」：先確認除數不是 0，才做除法或取餘數。順序反過來，程式就可能在除以 0 時出錯。' },
        { type: 'example', id: 'divisible' },
        { type: 'callout', tone: 'note', title: '除以 0 在各語言的結果不同', text: 'C++ 的整數除以 0 是未定義行為，程式可能直接當掉；Java 會丟出 `ArithmeticException`；Python 會丟出 `ZeroDivisionError`；JavaScript 不會出錯，但 `12 % 0` 的結果是 `NaN`（不是數字），同樣沒有意義。這些都不能當成正常流程，所以要先用條件擋住。' },
        { type: 'p', text: '下方的視覺化會列出複合條件中每一個比較的結果，被短路略過的部分會標示「短路，未計算」。' },
      ],
    },
    {
      id: 'de-morgan', title: '德摩根定律：正確地否定一個組合條件',
      blocks: [
        { type: 'p', text: '要寫「不是（已滿 18 歲且有票）」時，很多人會寫成「未滿 18 歲且沒有票」，這是錯的。德摩根定律說明了否定組合條件的正確方式：' },
        { type: 'list', items: ['`!(A && B)` 等於 `!A || !B`：不是「兩個都成立」，就是「至少一個不成立」。', '`!(A || B)` 等於 `!A && !B`：不是「至少一個成立」，就是「兩個都不成立」。'] },
        { type: 'p', text: '所以「不能入場」的條件是 `age < 18 || !hasTicket`：只要未滿 18 歲，或者沒有票，就不能入場。否定時把每個比較反過來（`>=` 變 `<`），並把「且」「或」互換。' },
      ],
    },
    {
      id: 'precedence-and-nesting', title: '優先順序與巢狀條件',
      blocks: [
        { type: 'p', text: '「非」最先算，接著是「且」，最後是「或」。所以 `a || b && c` 的意思是 `a || (b && c)`。混用「且」與「或」時，請一律加上括號，讓讀程式的人（包括未來的你）不必記優先順序。' },
        { type: 'p', text: '閏年的規則是個好例子：「能被 4 整除但不能被 100 整除，或者能被 400 整除」。直接寫成一個組合條件，比三層巢狀 if 更清楚：' },
        { type: 'example', id: 'leap' },
        { type: 'p', text: '同一個規則也可以寫成由特殊到一般的 if／else if：先判斷「能被 400 整除」→ 閏年，再判斷「能被 100 整除」→ 平年，最後「能被 4 整除」→ 閏年，其餘平年。兩種寫法等價；選擇讀起來最接近題目敘述的那一種。' },
      ],
    },
  ],
  examples: [
    {
      id: 'teen', title: '是否為青少年（13～19 歲）', description: '同一個範圍條件，C++／Java／JavaScript 用 && 拆成兩個比較，Python 可以連寫。',
      stdin: '15', output: 'teen',
      code: {
        'C++': code`#include <iostream>

int main() {
    int age;
    std::cin >> age;
    if (age >= 13 && age <= 19) {
        std::cout << "teen\n";
    } else {
        std::cout << "not teen\n";
    }
    return 0;
}`,
        Python: code`age = int(input())
if 13 <= age <= 19:
    print("teen")
else:
    print("not teen")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int age = new Scanner(System.in).nextInt();
        if (age >= 13 && age <= 19) {
            System.out.println("teen");
        } else {
            System.out.println("not teen");
        }
    }
}`,
        JavaScript: code`const age = Number(require("fs").readFileSync(0, "utf8").trim());
if (age >= 13 && age <= 19) {
    console.log("teen");
} else {
    console.log("not teen");
}`,
      },
    },
    {
      id: 'divisible', title: '先確認除數不是 0', description: '輸入 a 與 b，判斷 b 是否整除 a。b 為 0 時，&& 左邊已經是 false，右邊的 a % b 不會被計算。',
      stdin: '12 0', output: 'no',
      code: {
        'C++': code`#include <iostream>

int main() {
    int a, b;
    std::cin >> a >> b;
    if (b != 0 && a % b == 0) {  // b 為 0 時右邊不會執行
        std::cout << "yes\n";
    } else {
        std::cout << "no\n";
    }
    return 0;
}`,
        Python: code`a, b = map(int, input().split())
if b != 0 and a % b == 0:  # b 為 0 時右邊不會執行
    print("yes")
else:
    print("no")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt();
        if (b != 0 && a % b == 0) {  // b 為 0 時右邊不會執行
            System.out.println("yes");
        } else {
            System.out.println("no");
        }
    }
}`,
        JavaScript: code`const [a, b] = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
if (b !== 0 && a % b === 0) {  // b 為 0 時右邊不會執行
    console.log("yes");
} else {
    console.log("no");
}`,
      },
    },
    {
      id: 'leap', title: '閏年判斷', description: '一個組合條件表達完整的閏年規則；括號讓「且」「或」的關係一目了然。',
      stdin: '1900', output: 'common',
      code: {
        'C++': code`#include <iostream>

int main() {
    int y;
    std::cin >> y;
    bool leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    std::cout << (leap ? "leap" : "common") << "\n";
    return 0;
}`,
        Python: code`y = int(input())
leap = (y % 4 == 0 and y % 100 != 0) or y % 400 == 0
print("leap" if leap else "common")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int y = new Scanner(System.in).nextInt();
        boolean leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
        System.out.println(leap ? "leap" : "common");
    }
}`,
        JavaScript: code`const y = Number(require("fs").readFileSync(0, "utf8").trim());
const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
console.log(leap ? "leap" : "common");`,
      },
    },
  ],
  visualization: {
    kind: 'conditional-branch', title: '票種判斷：哪些比較被短路略過？', variable: 'age', min: -5, max: 130, initial: 15,
    branches: [
      { label: 'age < 0 || age > 120', when: { any: [{ op: '<', value: 0 }, { op: '>', value: 120 }] }, result: '不合法' },
      { label: 'age < 12 || age >= 65', when: { any: [{ op: '<', value: 12 }, { op: '>=', value: 65 }] }, result: '半票' },
      { label: 'age >= 12 && age <= 18', when: { all: [{ op: '>=', value: 12 }, { op: '<=', value: 18 }] }, result: '學生票' },
    ],
    otherwise: '全票',
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'x = 5\nprint(x > 3 and x < 10 or x == 0)' },
      options: ['True', 'False', '5', '語法錯誤'],
      answer: 0, explanation: '`and` 比 `or` 先算：`x > 3 and x < 10` 是 True，`True or (x == 0)` 因短路直接得到 True。Python 的布林值印出來是首字母大寫的 True。',
    },
    {
      id: 'q2', prompt: '下面的 C++ 程式會發生什麼事？',
      code: { language: 'C++', text: 'int b = 0;\nif (b != 0 && 10 / b > 1) {\n    std::cout << "A";\n} else {\n    std::cout << "B";\n}' },
      options: ['輸出 A', '輸出 B', '除以 0，程式當掉', '編譯錯誤'],
      answer: 1, explanation: '`b != 0` 是 false，`&&` 的結果已經確定是 false，右邊的 `10 / b` 不會被計算，所以不會除以 0，直接執行 else 輸出 B。如果把兩個條件的順序對調，就會先除以 0。',
    },
    {
      id: 'q3', prompt: '「不能入場」是「已滿 18 歲且有票」的否定。下列哪一個等價？',
      options: ['age < 18 && !hasTicket', 'age < 18 || !hasTicket', 'age <= 18 || hasTicket', '!(age < 18) && hasTicket'],
      answer: 1, explanation: '依德摩根定律，`!(age >= 18 && hasTicket)` 等於 `age < 18 || !hasTicket`：未滿 18 歲或沒有票，只要一個成立就不能入場。A 要求兩個都不成立才擋下，會讓「未滿 18 但有票」的人進場。',
    },
    {
      id: 'q4', prompt: '想判斷分數是否在 60～100 之間，寫成 `if (score >= 60 || score <= 100)`。錯在哪裡？',
      code: { language: 'Java', text: 'if (score >= 60 || score <= 100) {\n    System.out.println("in range");\n}' },
      options: ['沒有錯，這樣就是 60～100', '應該用 &&，用 || 時任何整數都會成立', '應該寫成 60 <= score <= 100', 'Java 不能在 if 中用 ||'],
      answer: 1, explanation: '任何整數不是 ≥ 60，就是 ≤ 100（例如 −5 滿足後者、500 滿足前者），所以 `||` 永遠成立。範圍判斷要兩個條件同時成立，用 `&&`。選項 C 的連續比較在 Java 會編譯錯誤，在 C++ 永遠為 true。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '閏年判斷（含不合法年份）',
      statement: '西元曆法的閏年規則：能被 4 整除但不能被 100 整除的年份是閏年；能被 400 整除的年份也是閏年；其餘是平年。讀入一個整數年份，年份小於 1 時輸出 `Invalid`，否則輸出 `Leap` 或 `Common`。',
      inputFormat: '一個整數 year。',
      outputFormat: '一行：`Invalid`、`Leap` 或 `Common`。',
      constraints: ['−1,000,000 ≤ year ≤ 1,000,000'],
      samples: [{ kind: 'normal', input: '2024', output: 'Leap', note: '能被 4 整除、不能被 100 整除' }],
      tests: [
        { kind: 'normal', input: '2024', output: 'Leap', note: '一般閏年' },
        { kind: 'normal', input: '2023', output: 'Common', note: '一般平年' },
        { kind: 'normal', input: '2000', output: 'Leap', note: '能被 400 整除' },
        { kind: 'normal', input: '1900', output: 'Common', note: '能被 100 整除但不能被 400 整除' },
        { kind: 'edge', input: '1', output: 'Common', note: '合法的最小年份' },
        { kind: 'edge', input: '4', output: 'Leap', note: '最小的閏年' },
        { kind: 'edge', input: '100', output: 'Common', note: '第一個「整百」' },
        { kind: 'edge', input: '400', output: 'Leap', note: '第一個「整四百」' },
        { kind: 'edge', input: '1000000', output: 'Leap', note: '最大值，能被 400 整除' },
        { kind: 'error', input: '0', output: 'Invalid', note: '年份不能是 0' },
        { kind: 'error', input: '-4', output: 'Invalid', note: '負數年份（也避開了各語言負數取餘數的差異）' },
      ],
      hints: ['先處理 year < 1，後面就不必擔心負數取餘數在 C++／Java／JavaScript 與 Python 中結果不同。', '把規則寫成一個組合條件，並用括號標出「且」「或」的關係。'],
      solution: {
        'C++': code`#include <iostream>

int main() {
    int year;
    std::cin >> year;
    if (year < 1) {
        std::cout << "Invalid\n";
    } else if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) {
        std::cout << "Leap\n";
    } else {
        std::cout << "Common\n";
    }
    return 0;
}`,
        Python: code`year = int(input())
if year < 1:
    print("Invalid")
elif (year % 4 == 0 and year % 100 != 0) or year % 400 == 0:
    print("Leap")
else:
    print("Common")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int year = new Scanner(System.in).nextInt();
        if (year < 1) {
            System.out.println("Invalid");
        } else if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) {
            System.out.println("Leap");
        } else {
            System.out.println("Common");
        }
    }
}`,
        JavaScript: code`const year = Number(require("fs").readFileSync(0, "utf8").trim());
if (year < 1) {
    console.log("Invalid");
} else if ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) {
    console.log("Leap");
} else {
    console.log("Common");
}`,
      },
      judge: 'none',
    },
  ],
};

import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * F05 條件判斷. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: the
 * JavaScript pilot — F05 also offers JavaScript (Node.js), read from standard input with fs.readFileSync(0).
 */
export const F05: LessonContent = {
  lessonId: 'F05',
  motivation: '讓程式依情況做不同的事，是從「計算機」變成「程式」的第一步。條件寫錯幾乎都發生在邊界，這一課教你怎麼設計與測試它們。',
  sections: [
    {
      id: 'if-else', title: 'if 與 else：依條件選擇路徑',
      blocks: [
        { type: 'p', text: '到目前為止，程式都是一行接一行執行。條件判斷讓程式依照條件選擇要執行哪一段：條件成立（true）時執行 if 區塊，不成立時執行 else 區塊（如果有寫的話）。' },
        { type: 'example', id: 'pass' },
        { type: 'list', items: [
          'C++、Java 與 JavaScript：條件寫在小括號 `( )` 裡，區塊用大括號 `{ }` 包起來；多個條件用 `else if`。',
          'Python：條件後面加冒號 `:`，區塊靠「縮排」決定；多個條件用 `elif`。縮排不一致就是語法錯誤。',
          '條件本身就是一個布林運算式，可以直接使用上一課的比較運算子。',
        ] },
        { type: 'callout', tone: 'note', title: 'JavaScript 的範例怎麼執行', text: '本課的 JavaScript 範例以 Node.js 執行（`node main.js`）。標準輸入用 `require("fs").readFileSync(0, "utf8")` 一次讀成字串，再用 `trim()`、`split(/\\s+/)` 拆開，`Number()` 轉成數字。' },
        { type: 'callout', tone: 'tip', title: '一律加上大括號', text: 'C++、Java 與 JavaScript 的 if 區塊只有一行時可以省略大括號，但之後再加第二行時，第二行其實不在 if 裡面。一律寫大括號可以避免這種錯誤。' },
      ],
    },
    {
      id: 'chains', title: '多個條件：順序決定結果',
      blocks: [
        { type: 'p', text: '`if … else if … else` 由上往下檢查，第一個成立的條件會被執行，後面的條件就不再檢查。因此條件的順序很重要。下面依分數給等第：90 以上 A、80～89 B、70～79 C、60～69 D、60 以下 F。' },
        { type: 'example', id: 'grade' },
        { type: 'p', text: '因為是由高分往低分檢查，走到 `score >= 80` 時，已經確定分數不到 90，所以不必再寫 `score < 90`。如果把順序反過來，先檢查 `score >= 60`，那麼 95 分也會在第一個條件就成立，被判成 D。' },
        { type: 'callout', tone: 'note', title: '設計條件區間', text: '把所有可能的值畫在數線上，每一個值都應該剛好落在一個區間：區間不能重疊（否則順序會影響答案），也不能有空隙（否則有些值沒有輸出）。最後的 else 負責接住「其餘所有情況」。' },
        { type: 'p', text: '在下方的視覺化中改變分數，觀察每個條件是否被檢查、檢查結果為何，以及最後走進哪一個分支。特別試試 89、90、59、60 這些邊界值，以及 −1、101 這些不合法的值。' },
      ],
    },
    {
      id: 'boundaries', title: '用邊界值測試條件',
      blocks: [
        { type: 'p', text: '條件寫錯最常發生在邊界：`>` 和 `>=` 差一個等號，結果就差了一整個等第。測試時，每個分界點都要測「剛好在分界上」和「分界的前一個值」：' },
        { type: 'table', head: ['分界', '應該測試', '預期'], rows: [
          ['90', '89、90', 'B、A'],
          ['80', '79、80', 'C、B'],
          ['60', '59、60', 'F、D'],
          ['範圍', '0、100、−1、101', 'F、A、不合法、不合法'],
        ] },
        { type: 'p', text: '另一個常見錯誤是把比較寫成指定。C++ 中 `if (x = 5)` 會把 5 存進 x，而 5 被視為 true，所以這個條件永遠成立（JavaScript 也一樣）；Java 會因為型別不是 boolean 而編譯錯誤，Python 則是語法錯誤。比較相等請用 `==`；JavaScript 建議用 `===`，它不會先轉換型別。' },
        { type: 'example', id: 'max3' },
      ],
    },
    {
      id: 'validation', title: '先檢查輸入是否合法',
      blocks: [
        { type: 'p', text: '真實世界的輸入不一定合法：分數可能是 −5 或 120。把「不合法」的情況放在最前面先處理，後面的條件就可以放心假設輸入在範圍內。' },
        { type: 'p', text: '判斷「小於 0 或大於 100」需要把兩個比較用「或」連起來：C++、Java 與 JavaScript 寫 `score < 0 || score > 100`，Python 寫 `score < 0 or score > 100`。下一堂課會完整介紹 and、or、not 這些邏輯運算子。' },
        { type: 'callout', tone: 'warning', title: '評測題目通常保證輸入合法', text: '線上評測與 APCS 實作題的輸入通常保證符合題目範圍，不需要額外檢查；但題目若要求「不合法時輸出某個訊息」，就一定要處理，而且要測試這些情況。' },
      ],
    },
  ],
  examples: [
    {
      id: 'pass', title: '及格或不及格', description: '60 分以上輸出 pass，否則輸出 fail。',
      stdin: '75', output: 'pass',
      code: {
        'C++': code`#include <iostream>

int main() {
    int score;
    std::cin >> score;
    if (score >= 60) {
        std::cout << "pass\n";
    } else {
        std::cout << "fail\n";
    }
    return 0;
}`,
        Python: code`score = int(input())
if score >= 60:
    print("pass")
else:
    print("fail")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int score = new Scanner(System.in).nextInt();
        if (score >= 60) {
            System.out.println("pass");
        } else {
            System.out.println("fail");
        }
    }
}`,
        JavaScript: code`const score = Number(require("fs").readFileSync(0, "utf8").trim());
if (score >= 60) {
    console.log("pass");
} else {
    console.log("fail");
}`,
      },
    },
    {
      id: 'grade', title: '分數換成等第', description: '由高到低依序檢查，第一個成立的條件決定等第。',
      stdin: '85', output: 'B',
      code: {
        'C++': code`#include <iostream>

int main() {
    int score;
    std::cin >> score;
    char grade;
    if (score >= 90) {
        grade = 'A';
    } else if (score >= 80) {
        grade = 'B';
    } else if (score >= 70) {
        grade = 'C';
    } else if (score >= 60) {
        grade = 'D';
    } else {
        grade = 'F';
    }
    std::cout << grade << "\n";
    return 0;
}`,
        Python: code`score = int(input())
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
elif score >= 70:
    grade = "C"
elif score >= 60:
    grade = "D"
else:
    grade = "F"
print(grade)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int score = new Scanner(System.in).nextInt();
        char grade;
        if (score >= 90) {
            grade = 'A';
        } else if (score >= 80) {
            grade = 'B';
        } else if (score >= 70) {
            grade = 'C';
        } else if (score >= 60) {
            grade = 'D';
        } else {
            grade = 'F';
        }
        System.out.println(grade);
    }
}`,
        JavaScript: code`const score = Number(require("fs").readFileSync(0, "utf8").trim());
let grade;
if (score >= 90) {
    grade = "A";
} else if (score >= 80) {
    grade = "B";
} else if (score >= 70) {
    grade = "C";
} else if (score >= 60) {
    grade = "D";
} else {
    grade = "F";
}
console.log(grade);`,
      },
    },
    {
      id: 'max3', title: '三個數的最大值', description: '先假設第一個最大，再用兩個獨立的 if 逐一比較。',
      stdin: '4 9 2', output: '9',
      code: {
        'C++': code`#include <iostream>

int main() {
    int a, b, c;
    std::cin >> a >> b >> c;
    int best = a;
    if (b > best) {
        best = b;
    }
    if (c > best) {
        best = c;
    }
    std::cout << best << "\n";
    return 0;
}`,
        Python: code`a, b, c = map(int, input().split())
best = a
if b > best:
    best = b
if c > best:
    best = c
print(best)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt(), c = sc.nextInt();
        int best = a;
        if (b > best) {
            best = b;
        }
        if (c > best) {
            best = c;
        }
        System.out.println(best);
    }
}`,
        JavaScript: code`const [a, b, c] = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
let best = a;
if (b > best) {
    best = b;
}
if (c > best) {
    best = c;
}
console.log(best);`,
      },
    },
  ],
  visualization: {
    kind: 'conditional-branch', title: '分數走進哪一個分支？', variable: 'score', min: -10, max: 110, initial: 85,
    branches: [
      { label: 'score < 0 或 score > 100', when: { any: [{ op: '<', value: 0 }, { op: '>', value: 100 }] }, result: 'Invalid' },
      { label: 'score >= 90', when: { all: [{ op: '>=', value: 90 }] }, result: 'A' },
      { label: 'score >= 80', when: { all: [{ op: '>=', value: 80 }] }, result: 'B' },
      { label: 'score >= 70', when: { all: [{ op: '>=', value: 70 }] }, result: 'C' },
      { label: 'score >= 60', when: { all: [{ op: '>=', value: 60 }] }, result: 'D' },
    ],
    otherwise: 'F',
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的程式把條件的順序寫反了。輸入 95 時會輸出什麼？',
      code: { language: 'Python', text: 'if score >= 60:\n    print("D")\nelif score >= 70:\n    print("C")\nelif score >= 90:\n    print("A")\nelse:\n    print("F")' },
      options: ['A', 'C', 'D', 'F'],
      answer: 2, explanation: '條件由上往下檢查，95 >= 60 在第一個條件就成立，於是輸出 D，後面的條件都不會再檢查。由寬到嚴的順序會讓後面的分支永遠走不到，應該由高分往低分檢查。',
    },
    {
      id: 'q2', prompt: '「60 分以上及格」的程式，最能找出 `>` 與 `>=` 寫錯的測試值是哪一組？',
      options: ['30 和 90', '59 和 60', '0 和 100', '75 和 85'],
      answer: 1, explanation: '錯誤只會出現在分界上：如果寫成 `score > 60`，60 分會被判成不及格。測試分界本身（60）和分界前一個值（59），才能確認等號是否正確。',
    },
    {
      id: 'q3', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'int x = 0;\nif (x = 5) {\n    std::cout << "yes";\n} else {\n    std::cout << "no";\n}' },
      options: ['no，因為 x 是 0', 'yes，因為 x = 5 把 5 存進 x，而 5 被視為 true', '編譯錯誤', '執行期錯誤'],
      answer: 1, explanation: '`x = 5` 是指定而不是比較：它把 5 存進 x，整個運算式的值是 5，非 0 在 C++ 中視為 true，所以永遠輸出 yes。比較相等要用 `==`。Java 遇到這種寫法會編譯錯誤，Python 是語法錯誤。',
    },
    {
      id: 'q4', prompt: '要依溫度輸出「冷（低於 15 度）」「舒適（15～27 度）」「熱（高於 27 度）」，下列哪一組條件互斥且涵蓋所有溫度？',
      options: ['t < 15、t > 15 且 t < 27、t > 27', 't < 15、t <= 27、else', 't <= 15、t >= 27、else', 't < 15、t < 27、t > 27'],
      answer: 1, explanation: 'B 由上往下：低於 15 是冷；走到第二個條件時已確定 t ≥ 15，所以 t <= 27 就是 15～27；其餘（高於 27）由 else 處理，沒有空隙也沒有重疊。A 漏掉了剛好 15 與 27 度；C 把 15 度判成冷、27 度判成熱，與題目不符；D 的第三個條件漏掉 27 度。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '成績等第（含不合法輸入）',
      statement: '讀入一個整數分數，依下列規則輸出等第：分數小於 0 或大於 100 時輸出 `Invalid`；90～100 輸出 `A`；80～89 輸出 `B`；70～79 輸出 `C`；60～69 輸出 `D`；0～59 輸出 `F`。',
      inputFormat: '一個整數 score。',
      outputFormat: '一行：`Invalid`、`A`、`B`、`C`、`D` 或 `F`。',
      constraints: ['−1,000 ≤ score ≤ 1,000（可能超出 0～100）'],
      samples: [
        { kind: 'normal', input: '85', output: 'B', note: '80～89' },
        { kind: 'error', input: '101', output: 'Invalid', note: '超過 100' },
      ],
      tests: [
        { kind: 'normal', input: '85', output: 'B', note: '一般情況' },
        { kind: 'normal', input: '95', output: 'A', note: '一般情況' },
        { kind: 'normal', input: '72', output: 'C', note: '一般情況' },
        { kind: 'normal', input: '61', output: 'D', note: '一般情況' },
        { kind: 'normal', input: '30', output: 'F', note: '一般情況' },
        { kind: 'edge', input: '100', output: 'A', note: '合法的最大值' },
        { kind: 'edge', input: '90', output: 'A', note: 'A 的下界' },
        { kind: 'edge', input: '89', output: 'B', note: 'B 的上界' },
        { kind: 'edge', input: '80', output: 'B', note: 'B 的下界' },
        { kind: 'edge', input: '79', output: 'C', note: 'C 的上界' },
        { kind: 'edge', input: '70', output: 'C', note: 'C 的下界' },
        { kind: 'edge', input: '69', output: 'D', note: 'D 的上界' },
        { kind: 'edge', input: '60', output: 'D', note: 'D 的下界' },
        { kind: 'edge', input: '59', output: 'F', note: 'F 的上界' },
        { kind: 'edge', input: '0', output: 'F', note: '合法的最小值' },
        { kind: 'error', input: '-1', output: 'Invalid', note: '小於 0' },
        { kind: 'error', input: '101', output: 'Invalid', note: '大於 100' },
        { kind: 'error', input: '-1000', output: 'Invalid', note: '遠低於範圍' },
      ],
      hints: ['先處理不合法的情況，後面就能假設 0 ≤ score ≤ 100。', '由高分往低分檢查，每個條件只需要寫下界。', '自己測一遍上面表格中的每一個邊界值。'],
      solution: {
        'C++': code`#include <iostream>

int main() {
    int score;
    std::cin >> score;
    if (score < 0 || score > 100) {
        std::cout << "Invalid\n";
    } else if (score >= 90) {
        std::cout << "A\n";
    } else if (score >= 80) {
        std::cout << "B\n";
    } else if (score >= 70) {
        std::cout << "C\n";
    } else if (score >= 60) {
        std::cout << "D\n";
    } else {
        std::cout << "F\n";
    }
    return 0;
}`,
        Python: code`score = int(input())
if score < 0 or score > 100:
    print("Invalid")
elif score >= 90:
    print("A")
elif score >= 80:
    print("B")
elif score >= 70:
    print("C")
elif score >= 60:
    print("D")
else:
    print("F")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int score = new Scanner(System.in).nextInt();
        if (score < 0 || score > 100) {
            System.out.println("Invalid");
        } else if (score >= 90) {
            System.out.println("A");
        } else if (score >= 80) {
            System.out.println("B");
        } else if (score >= 70) {
            System.out.println("C");
        } else if (score >= 60) {
            System.out.println("D");
        } else {
            System.out.println("F");
        }
    }
}`,
        JavaScript: code`const score = Number(require("fs").readFileSync(0, "utf8").trim());
if (score < 0 || score > 100) {
    console.log("Invalid");
} else if (score >= 90) {
    console.log("A");
} else if (score >= 80) {
    console.log("B");
} else if (score >= 70) {
    console.log("C");
} else if (score >= 60) {
    console.log("D");
} else {
    console.log("F");
}`,
      },
      judge: 'none',
    },
  ],
};

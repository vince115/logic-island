import type { LessonContent } from '../schema';

const code = String.raw;

/** F03 輸入與輸出. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F03: LessonContent = {
  lessonId: 'F03',
  sections: [
    {
      id: 'stdin-stdout', title: '標準輸入與標準輸出',
      blocks: [
        { type: 'p', text: '程式從標準輸入（stdin）讀資料，把結果寫到標準輸出（stdout）。在自己的電腦上，標準輸入通常是鍵盤、標準輸出是終端機畫面；在線上評測系統與 APCS 實作題中，系統會把測資送進標準輸入，再把你的輸出和正確答案比對。' },
        { type: 'p', text: '因此「讀對格式」與「印對格式」和演算法本身一樣重要：算對了但多印一句提示文字，在評測系統中仍然是錯的。' },
        { type: 'callout', tone: 'warning', title: '不要印出提示文字', text: '在評測題目中，不要寫 `請輸入一個數字：` 這類提示；評測系統看不到畫面，只會把它當成你的答案的一部分。' },
      ],
    },
    {
      id: 'reading', title: '讀取資料：一個一個 token，或一整行',
      blocks: [
        { type: 'p', text: '大部分題目的輸入是以空白或換行分隔的資料，每一段稱為一個 token。三種語言讀取 token 的方式不同：' },
        { type: 'example', id: 'sum-two' },
        { type: 'list', items: [
          'C++：`std::cin >> a >> b;` 會自動跳過空白與換行，依序讀入 token 並轉成變數的型別。',
          'Python：`input()` 一次讀「一整行」並傳回字串，要自己用 `split()` 切開、用 `int()` 轉型。',
          'Java：`Scanner` 的 `nextInt()`、`next()` 讀 token，同樣會跳過空白與換行。',
        ] },
        { type: 'p', text: '要特別注意 Python：如果兩個數在同一行，寫兩次 `int(input())` 會出錯，因為第一次 `input()` 讀到的是 `"3 5"` 整行；反過來，如果兩個數在不同行，`input().split()` 只會讀到第一行。題目沒說清楚時，可以一次讀完全部輸入再切開，就不必管它們在第幾行：' },
        { type: 'example', id: 'tokens' },
        { type: 'p', text: '讀取字串時也要分清楚「一個單字」和「一整行」。C++ 的 `std::cin >> name` 與 Java 的 `next()` 只讀到下一個空白為止；要讀含空白的整行，使用 `std::getline(std::cin, line)`、Java 的 `nextLine()`，或 Python 的 `input()`。' },
        { type: 'example', id: 'greeting' },
        { type: 'callout', tone: 'note', title: 'C++ 混用 >> 與 getline', text: '`std::cin >> n;` 讀完數字後，換行符號還留在輸入中；緊接著呼叫 `getline` 會讀到一個空行。需要時在中間加上 `std::cin.ignore();` 跳過那個換行。Java 的 `nextInt()` 後接 `nextLine()` 也有同樣的問題。' },
      ],
    },
    {
      id: 'writing', title: '依格式輸出',
      blocks: [
        { type: 'p', text: '輸出要和題目規定的格式完全一致：哪裡空一格、哪裡換行、小數要幾位。題目要求兩位小數時，三種語言的寫法如下：' },
        { type: 'example', id: 'format' },
        { type: 'table', head: ['需求', 'C++', 'Python', 'Java'], rows: [
          ['換行', '`"\\n"`', '`print()` 自動換行', '`println`'],
          ['同一行以空白分隔', '`a << " " << b`', '`print(a, b)`', '`a + " " + b`'],
          ['兩位小數', '`std::fixed << std::setprecision(2)`', '`f"{x:.2f}"`', '`String.format("%.2f", x)`'],
          ['不換行', '不加 `"\\n"`', '`print(x, end="")`', '`print`'],
        ] },
        { type: 'callout', tone: 'warning', title: '整數相除會先捨去小數', text: '要輸出 7 ÷ 2 = 3.50，C++ 與 Java 不能直接寫 `a / b`：兩個整數相除得到 3，再怎麼格式化都是 3.00。先把其中一個轉成小數：`static_cast<double>(a) / b`（C++）、`(double) a / b`（Java）。Python 的 `/` 本來就是小數除法。' },
        { type: 'p', text: '四捨五入的位數由格式化決定。要小心剛好在 .5 的情況：例如 2.675 在二進位中其實略小於 2.675，三種語言都會印成 2.67。題目若有特殊的進位規則，要另外處理。' },
      ],
    },
    {
      id: 'test-data', title: '從題目讀出輸入格式',
      blocks: [
        { type: 'p', text: '動手寫之前，先把題目的「輸入說明」轉成讀取步驟：共有幾行？每行幾個資料？型別是整數、小數還是字串？字串可能含空白嗎？然後用範例測資在本機執行，確認輸出逐字相同。' },
        { type: 'list', ordered: true, items: [
          '把範例輸入存成檔案，例如 `input.txt`。',
          '執行時把檔案導入標準輸入：`./main < input.txt`、`python3 main.py < input.txt`、`java Main < input.txt`。',
          '把輸出和範例輸出逐行比對，包括空白與換行。',
        ] },
        { type: 'p', text: '在下方的視覺化中，觀察程式如何把輸入的 token 依序放進變數，再組成輸出。' },
      ],
    },
  ],
  examples: [
    {
      id: 'sum-two', title: '讀兩個整數並輸出和', description: '輸入同一行的兩個整數，輸出它們的和。',
      stdin: '3 5', output: '8',
      code: {
        'C++': code`#include <iostream>

int main() {
    int a, b;
    std::cin >> a >> b;
    std::cout << a + b << "\n";
    return 0;
}`,
        Python: code`a, b = map(int, input().split())
print(a + b)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}`,
      },
    },
    {
      id: 'tokens', title: '不論在第幾行都讀得到', description: '兩個數分在兩行。C++ 與 Java 本來就會跳過換行；Python 改成一次讀完全部輸入再切開。',
      stdin: '3\n5', output: '8',
      code: {
        'C++': code`#include <iostream>

int main() {
    int a, b;
    std::cin >> a >> b;  // 空白與換行都會被跳過
    std::cout << a + b << "\n";
    return 0;
}`,
        Python: code`import sys

data = sys.stdin.read().split()  # 不管有幾行，切成 token
a, b = int(data[0]), int(data[1])
print(a + b)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();  // 空白與換行都會被跳過
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}`,
      },
    },
    {
      id: 'greeting', title: '讀一個名字與年齡', description: '第一行是名字（一個單字），第二行是年齡。',
      stdin: 'Mia\n15', output: 'Hello, Mia! Next year you will be 16.',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    std::string name;
    int age;
    std::cin >> name >> age;
    std::cout << "Hello, " << name << "! Next year you will be " << age + 1 << ".\n";
    return 0;
}`,
        Python: code`name = input().strip()
age = int(input())
print(f"Hello, {name}! Next year you will be {age + 1}.")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.next();
        int age = sc.nextInt();
        System.out.println("Hello, " + name + "! Next year you will be " + (age + 1) + ".");
    }
}`,
      },
    },
    {
      id: 'format', title: '兩位小數的除法', description: '讀入兩個整數 a、b，以兩位小數輸出 a ÷ b。',
      stdin: '7 2', output: '3.50',
      code: {
        'C++': code`#include <iomanip>
#include <iostream>

int main() {
    int a, b;
    std::cin >> a >> b;
    double q = static_cast<double>(a) / b;  // 先轉成小數再除
    std::cout << std::fixed << std::setprecision(2) << q << "\n";
    return 0;
}`,
        Python: code`a, b = map(int, input().split())
print(f"{a / b:.2f}")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt();
        double q = (double) a / b;  // 先轉成小數再除
        System.out.println(String.format("%.2f", q));
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'variable-state', title: '逐步執行：輸入 Mia 與 15', language: 'Python',
    code: code`name = input().strip()
age = int(input())
next_age = age + 1
print(f"Hello, {name}! Next year you will be {next_age}.")`,
    steps: [
      { line: 1, note: '讀入第一行 "Mia"，去掉前後空白後存進 name（字串）。', vars: { name: '"Mia"' } },
      { line: 2, note: '讀入第二行 "15"，用 int() 轉成整數 15。', vars: { name: '"Mia"', age: '15' } },
      { line: 3, note: '整數才能做加法：15 + 1 = 16。', vars: { name: '"Mia"', age: '15', next_age: '16' } },
      { line: 4, note: '把變數放進字串中輸出。', vars: { name: '"Mia"', age: '15', next_age: '16' }, output: 'Hello, Mia! Next year you will be 16.' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '輸入只有一行 `3 5`。下面的 Python 程式會發生什麼事？',
      code: { language: 'Python', text: 'a = int(input())\nb = int(input())\nprint(a + b)' },
      options: ['輸出 8', '輸出 35', '第一行就出錯，因為 int("3 5") 無法轉換', '輸出 3'],
      answer: 2, explanation: '`input()` 讀的是一整行字串 "3 5"，其中含有空白，不是合法的整數，`int()` 會丟出 ValueError。同一行有多個資料時，要先 `split()` 再逐一轉型，例如 `a, b = map(int, input().split())`。',
    },
    {
      id: 'q2', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'int a = 7, b = 2;\nstd::cout << a / b << "\\n";' },
      options: ['3.5', '3', '4', '3.50'],
      answer: 1, explanation: '兩個 int 相除是整數除法，小數部分直接捨去，得到 3。要得到 3.5，必須先把其中一個運算元轉成 double。',
    },
    {
      id: 'q3', prompt: '在 C++ 中要讀入一整行可能含空白的姓名（例如 "Lin Mei"），應該使用哪一個？',
      options: ['std::cin >> name', 'std::getline(std::cin, name)', 'scanf("%d", &name)', 'std::cout << name'],
      answer: 1, explanation: '`std::cin >> name` 讀到第一個空白就停止，只會得到 "Lin"。`std::getline` 會讀到換行為止，取得整行文字。',
    },
    {
      id: 'q4', prompt: '題目要求輸出平均值，你的程式在答案前多印了「平均是：」。在線上評測或 APCS 實作題中，最可能的結果是？',
      options: ['答案正確，評測系統會自動忽略中文', '判為答案錯誤，因為輸出和正確答案不一致', '只會扣一點分數', '程式無法編譯'],
      answer: 1, explanation: '評測系統把你的輸出和正確答案逐字比對（多數只容許行尾空白之類的差異）。多出的提示文字會讓輸出不一致而被判錯，所以只輸出題目要求的內容。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '成績單格式化',
      statement: '讀入一位學生的名字與三科分數，依指定格式輸出名字、總分與平均（四捨五入到小數點後兩位）。三科分數可能在同一行，也可能分成多行，你的程式都要能正確讀取。',
      inputFormat: '第一行是名字（只含英文字母的一個單字）。接著是三個整數分數，以空白或換行分隔。',
      outputFormat: '三行：`Name: <名字>`、`Total: <總分>`、`Average: <平均，兩位小數>`。',
      constraints: ['名字長度 1～20', '0 ≤ 分數 ≤ 100'],
      samples: [{ kind: 'normal', input: 'Mia\n80 92 77', output: 'Name: Mia\nTotal: 249\nAverage: 83.00', note: '249 ÷ 3 = 83，輸出 83.00' }],
      tests: [
        { kind: 'normal', input: 'Mia\n80 92 77', output: 'Name: Mia\nTotal: 249\nAverage: 83.00', note: '整除時也要兩位小數' },
        { kind: 'normal', input: 'Leo\n90 85 70', output: 'Name: Leo\nTotal: 245\nAverage: 81.67', note: '81.666… 四捨五入為 81.67' },
        { kind: 'normal', input: 'Kai\n60\n70\n81', output: 'Name: Kai\nTotal: 211\nAverage: 70.33', note: '分數分在三行' },
        { kind: 'edge', input: 'A\n0 0 0', output: 'Name: A\nTotal: 0\nAverage: 0.00', note: '最小值、最短名字' },
        { kind: 'edge', input: 'Maximilian\n100 100 100', output: 'Name: Maximilian\nTotal: 300\nAverage: 100.00', note: '最大值' },
        { kind: 'edge', input: 'Ann\n0 0 1', output: 'Name: Ann\nTotal: 1\nAverage: 0.33', note: '平均小於 1' },
      ],
      errorPolicy: '題目保證輸入格式正確；不合法分數的處理在「條件判斷」一課練習。',
      hints: ['C++ 與 Java 用 >> 或 nextInt() 讀分數，自然會跳過換行。', 'Python 可用 `sys.stdin.read().split()` 一次取得所有 token。', '總分是整數，平均要先轉成小數再除以 3。'],
      solution: {
        'C++': code`#include <iomanip>
#include <iostream>
#include <string>

int main() {
    std::string name;
    int a, b, c;
    std::cin >> name >> a >> b >> c;
    int total = a + b + c;
    std::cout << "Name: " << name << "\n";
    std::cout << "Total: " << total << "\n";
    std::cout << "Average: " << std::fixed << std::setprecision(2) << total / 3.0 << "\n";
    return 0;
}`,
        Python: code`import sys

data = sys.stdin.read().split()
name = data[0]
total = sum(int(x) for x in data[1:4])
print(f"Name: {name}")
print(f"Total: {total}")
print(f"Average: {total / 3:.2f}")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.next();
        int total = sc.nextInt() + sc.nextInt() + sc.nextInt();
        System.out.println("Name: " + name);
        System.out.println("Total: " + total);
        System.out.println("Average: " + String.format("%.2f", total / 3.0));
    }
}`,
      },
      judge: 'none',
    },
  ],
};

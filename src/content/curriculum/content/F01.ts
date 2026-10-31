import type { LessonContent } from '../schema';

const code = String.raw;

/** F01 程式與演算法入門. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F01: LessonContent = {
  lessonId: 'F01',
  sections: [
    {
      id: 'what-is-algorithm', title: '演算法：把解法寫成明確的步驟',
      blocks: [
        { type: 'p', text: '演算法（algorithm）是解決一個問題的步驟清單。它不一定和電腦有關：食譜、組裝說明書、找零錢的方法都是演算法。寫程式之前，先把「要怎麼做」想清楚並寫成步驟，是最重要的一件事。' },
        { type: 'p', text: '以「計算三科平均」為例，可以寫成下面的步驟。每一步都清楚、做得到，而且一定會結束：' },
        { type: 'list', ordered: true, items: ['讀入三科分數 a、b、c。', '計算總分 total = a + b + c。', '計算平均 average = total ÷ 3。', '輸出總分與平均。'] },
        { type: 'p', text: '一個好的演算法通常具備五個特性：' },
        { type: 'table', head: ['特性', '意思', '在上例中'], rows: [
          ['輸入', '接受零個或多個資料', '三科分數'],
          ['輸出', '至少產生一個結果', '總分與平均'],
          ['明確性', '每一步只有一種解讀', '「相加」「除以 3」沒有歧義'],
          ['有限性', '有限步驟內一定結束', '只有四步'],
          ['有效性', '每一步都實際做得到', '加法與除法都能計算'],
        ] },
        { type: 'callout', tone: 'tip', title: '先想輸入、處理、輸出', text: '拿到題目時，先寫下三件事：會給我什麼（輸入）、我要算什麼（處理）、要印出什麼（輸出）。這個習慣在 APCS 實作題與往後每一堂課都用得到。' },
      ],
    },
    {
      id: 'program-structure', title: '程式：用程式語言寫下演算法',
      blocks: [
        { type: 'p', text: '程式是用程式語言寫成、電腦能夠執行的演算法。Logic Island 的教材同時提供 C++、Python 與 Java 三種寫法：它們表達的步驟相同，但外觀和規則不同。' },
        { type: 'example', id: 'hello' },
        { type: 'list', items: [
          'C++：`#include <iostream>` 引入輸入輸出功能；程式從 `int main()` 開始執行，每個敘述以分號 `;` 結束。',
          'Python：不需要 main，檔案中的敘述由上往下執行；每行一個敘述，不用分號。',
          'Java：程式碼都寫在類別（class）裡，從 `public static void main(String[] args)` 開始執行，敘述同樣以分號結束。',
        ] },
        { type: 'p', text: '執行方式也不同。C++ 先由編譯器（compiler）把整份程式翻成機器碼，再執行產生的檔案；Python 由直譯器（interpreter）逐行讀取並執行；Java 先編譯成 bytecode，再交給 Java 虛擬機器（JVM）執行。' },
        { type: 'callout', tone: 'note', title: '三種語言，各自的習慣', text: '本課程的三語範例不會逐行翻譯，而是用各語言自然的寫法：例如 Python 直接寫敘述，Java 必須有 Main 類別。比較三者的差異，也是學習的一部分。' },
      ],
    },
    {
      id: 'sequence', title: '循序執行：由上往下，一次一行',
      blocks: [
        { type: 'p', text: '沒有特別指示時，程式一行接一行、由上往下執行，這稱為循序結構。後面的敘述看到的，是前面敘述執行完之後的結果。下面把「計算三科平均」的演算法寫成程式（分數先直接寫在程式裡，下一堂課再學如何從輸入讀取）：' },
        { type: 'example', id: 'average' },
        { type: 'p', text: '在下方的視覺化中逐步執行這段程式，觀察每執行一行，變數表與輸出區如何改變。注意 `total` 必須在 `a`、`b`、`c` 都有值之後才能計算——如果把順序對調，程式就算不出正確答案。' },
      ],
    },
    {
      id: 'errors', title: '三種錯誤',
      blocks: [
        { type: 'p', text: '寫程式一定會遇到錯誤。先學會分辨錯誤的種類，才知道要往哪裡找：' },
        { type: 'table', head: ['種類', '何時發生', '例子'], rows: [
          ['語法錯誤（編譯錯誤）', '程式無法編譯或無法開始執行', 'C++、Java 少寫分號；Python 縮排錯誤'],
          ['執行期錯誤', '程式執行到一半中止', '除以零、陣列索引超出範圍'],
          ['邏輯錯誤', '程式正常結束，但答案不對', '計算平均時忘了除以 3'],
        ] },
        { type: 'callout', tone: 'warning', title: '最難發現的是邏輯錯誤', text: '語法錯誤和執行期錯誤會有訊息提醒你；邏輯錯誤不會。唯一的辦法是先自己算出幾組答案，再和程式的輸出比對——這就是測試。' },
      ],
    },
  ],
  examples: [
    {
      id: 'hello', title: '第一支程式', description: '印出兩行文字：第一行是固定文字，第二行是計算結果。',
      output: 'Hello, Logic Island!\n1 + 2 = 3',
      code: {
        'C++': code`#include <iostream>

int main() {
    std::cout << "Hello, Logic Island!" << "\n";
    std::cout << "1 + 2 = " << 1 + 2 << "\n";
    return 0;
}`,
        Python: code`print("Hello, Logic Island!")
print("1 + 2 =", 1 + 2)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Logic Island!");
        System.out.println("1 + 2 = " + (1 + 2));
    }
}`,
      },
    },
    {
      id: 'average', title: '計算三科總分與平均', description: '把四個步驟依序寫成程式。三科分數相加剛好可以被 3 整除，所以平均是整數。',
      output: 'total = 249\naverage = 83',
      code: {
        'C++': code`#include <iostream>

int main() {
    int a = 80;
    int b = 92;
    int c = 77;
    int total = a + b + c;
    int average = total / 3;
    std::cout << "total = " << total << "\n";
    std::cout << "average = " << average << "\n";
    return 0;
}`,
        Python: code`a = 80
b = 92
c = 77
total = a + b + c
average = total // 3
print("total =", total)
print("average =", average)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int a = 80;
        int b = 92;
        int c = 77;
        int total = a + b + c;
        int average = total / 3;
        System.out.println("total = " + total);
        System.out.println("average = " + average);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'variable-state', title: '逐步執行：計算三科平均', language: 'Python',
    code: code`a = 80
b = 92
c = 77
total = a + b + c
average = total // 3
print("total =", total)
print("average =", average)`,
    steps: [
      { line: 1, note: '建立變數 a，存入 80。', vars: { a: '80' } },
      { line: 2, note: '建立變數 b，存入 92。', vars: { a: '80', b: '92' } },
      { line: 3, note: '建立變數 c，存入 77。', vars: { a: '80', b: '92', c: '77' } },
      { line: 4, note: '先算右邊 80 + 92 + 77 = 249，再存進 total。', vars: { a: '80', b: '92', c: '77', total: '249' } },
      { line: 5, note: '249 // 3 = 83，存進 average。', vars: { a: '80', b: '92', c: '77', total: '249', average: '83' } },
      { line: 6, note: '印出第一行。', vars: { a: '80', b: '92', c: '77', total: '249', average: '83' }, output: 'total = 249' },
      { line: 7, note: '印出第二行，程式結束。', vars: { a: '80', b: '92', c: '77', total: '249', average: '83' }, output: 'total = 249\naverage = 83' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下列何者不是演算法必須具備的特性？',
      options: ['在有限的步驟內結束', '每一步的意思都很明確', '一定要用 C++ 撰寫', '至少產生一個輸出'],
      answer: 2, explanation: '演算法是解決問題的步驟，和用哪一種程式語言無關；同一個演算法可以用 C++、Python、Java，甚至用中文步驟寫出來。其餘三項都是演算法的特性（有限性、明確性、輸出）。',
    },
    {
      id: 'q2', prompt: '下面的程式會輸出什麼？',
      code: { language: 'Python', text: 'x = 5\nx = x + 3\ny = x * 2\nprint(y)' },
      options: ['10', '13', '16', '8'],
      answer: 2, explanation: '程式由上往下執行：x 先是 5，第二行把 x 更新成 5 + 3 = 8，第三行 y = 8 × 2 = 16。後面的敘述看到的是前面執行完後的值。',
    },
    {
      id: 'q3', prompt: '程式能順利執行到結束，但印出的「平均」其實是總分，因為忘了除以 3。這是哪一種錯誤？',
      options: ['語法錯誤', '執行期錯誤', '邏輯錯誤', '編譯器錯誤'],
      answer: 2, explanation: '程式沒有中止、也能編譯，只是結果不正確，這是邏輯錯誤。它不會出現錯誤訊息，必須靠事先算好的答案比對（測試）才找得出來。',
    },
    {
      id: 'q4', prompt: 'Java 程式會從哪裡開始執行？',
      options: ['檔案的第一行', 'public static void main(String[] args)', 'class Main 的第一個變數', '最後一個 System.out.println'],
      answer: 1, explanation: 'Java 執行時會尋找 main 方法並從那裡開始；C++ 從 int main() 開始；Python 則是從檔案第一行依序執行。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '三科總分與平均',
      statement: '依照本課的四個步驟完成程式：讀入三科分數，輸出總分與平均。平均只取整數部分（無條件捨去小數）。讀取輸入的程式碼已經寫好，你只需要完成「處理」與「輸出」。',
      inputFormat: '一行，三個整數 a、b、c，以空白分隔。',
      outputFormat: '兩行：第一行為總分，第二行為平均的整數部分。',
      constraints: ['0 ≤ a, b, c ≤ 100'],
      samples: [{ kind: 'normal', input: '80 92 77', output: '249\n83', note: '80 + 92 + 77 = 249，249 ÷ 3 = 83' }],
      tests: [
        { kind: 'normal', input: '80 92 77', output: '249\n83', note: '剛好整除' },
        { kind: 'normal', input: '60 70 81', output: '211\n70', note: '211 ÷ 3 = 70.33…，只取整數部分' },
        { kind: 'edge', input: '0 0 0', output: '0\n0', note: '最小值' },
        { kind: 'edge', input: '100 100 100', output: '300\n100', note: '最大值' },
        { kind: 'edge', input: '1 1 2', output: '4\n1', note: '4 ÷ 3 = 1.33…，確認不是四捨五入' },
      ],
      errorPolicy: '題目保證輸入是三個 0～100 的整數；處理不合法輸入在「條件判斷」一課練習。',
      hints: ['總分就是三個變數相加。', '整數相除：C++ 與 Java 的 `/`、Python 的 `//`，結果都只留整數部分（本題分數不為負）。'],
      starter: {
        'C++': code`#include <iostream>

int main() {
    int a, b, c;
    std::cin >> a >> b >> c;
    // 在這裡計算總分與平均，並輸出兩行
    return 0;
}`,
        Python: code`a, b, c = map(int, input().split())
# 在這裡計算總分與平均，並輸出兩行`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt(), c = sc.nextInt();
        // 在這裡計算總分與平均，並輸出兩行
    }
}`,
      },
      solution: {
        'C++': code`#include <iostream>

int main() {
    int a, b, c;
    std::cin >> a >> b >> c;
    int total = a + b + c;
    std::cout << total << "\n" << total / 3 << "\n";
    return 0;
}`,
        Python: code`a, b, c = map(int, input().split())
total = a + b + c
print(total)
print(total // 3)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt(), c = sc.nextInt();
        int total = a + b + c;
        System.out.println(total);
        System.out.println(total / 3);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

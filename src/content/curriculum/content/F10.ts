import type { LessonContent } from '../schema';

const code = String.raw;

/** F10 字串基礎. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F10: LessonContent = {
  lessonId: 'F10',
  motivation: '名字、密碼、句子、DNA 序列、一行測資——大量資料其實是文字。學會把字串當成「一格一格的字元」來走訪與判斷，才能做驗證、統計、加密這些日常又常考的處理。',
  sections: [
    {
      id: 'sequence', title: '字串是字元的序列',
      blocks: [
        { type: 'p', text: '字串由一個個字元依序排成。和之後的陣列一樣，位置（索引）從 0 開始：長度為 n 的字串，索引是 0 到 n − 1。`"Logic"` 的長度是 5，`s[0]` 是 `L`，`s[4]` 是 `c`，`s[5]` 已經超出範圍。' },
        { type: 'table', head: ['操作', 'C++（std::string）', 'Python（str）', 'Java（String）'], rows: [
          ['長度', '`s.size()`', '`len(s)`', '`s.length()`'],
          ['第 i 個字元', '`s[i]`（不檢查範圍）、`s.at(i)`', '`s[i]`', '`s.charAt(i)`'],
          ['最後一個字元', '`s.back()`、`s[s.size() - 1]`', '`s[-1]`', '`s.charAt(s.length() - 1)`'],
          ['超出範圍', '`s[i]` 未定義行為；`s.at(i)` 丟出例外', '`IndexError`', '`StringIndexOutOfBoundsException`'],
        ] },
        { type: 'example', id: 'index' },
        { type: 'p', text: '在下方的視覺化中，觀察每個字元的格子與索引，以及讀取 `s[5]` 時為什麼會越界。' },
      ],
    },
    {
      id: 'traverse', title: '走訪字串並統計',
      blocks: [
        { type: 'p', text: '用迴圈從索引 0 走到 n − 1，逐一檢查每個字元，就能統計大寫字母、數字或空白的個數。Python 與 Java 也可以直接「對每個字元」迴圈（`for c in s`、`for (char c : s.toCharArray())`），C++ 則可以寫 `for (char c : s)`。' },
        { type: 'example', id: 'count' },
        { type: 'callout', tone: 'note', title: '讀一整行，而不是一個單字', text: '句子中有空白時，要讀「整行」：C++ 用 `std::getline(std::cin, s)`、Python 用 `input()`、Java 用 `nextLine()`。用 `cin >>` 或 `next()` 只會讀到第一個空白之前。' },
      ],
    },
    {
      id: 'char-codes', title: '字元與字元碼',
      blocks: [
        { type: 'p', text: '每個字元在電腦中都對應一個數字（字元碼）。英文字母與數字使用 ASCII：`\'A\'` 是 65、`\'a\'` 是 97、`\'0\'` 是 48，而且字母與數字的字元碼都是連續的。所以「第幾個字母」是 `c - \'a\'`，「數字字元的值」是 `c - \'0\'`。' },
        { type: 'list', items: [
          'C++ 與 Java 的 `char` 本身就能當整數運算：`\'a\' + 2` 是 99，轉回 `char` 就是 `\'c\'`。',
          'Python 沒有字元型別，單一字元也是長度為 1 的字串，要用 `ord(c)` 取字元碼、`chr(n)` 轉回字元。',
          '單引號與雙引號：C++／Java 的 `\'a\'` 是字元、`"a"` 是字串，兩者不同；Python 兩種引號都是字串。',
        ] },
        { type: 'example', id: 'caesar' },
      ],
    },
    {
      id: 'immutable', title: '可不可以修改？怎麼比較？',
      blocks: [
        { type: 'p', text: 'C++ 的 `std::string` 可以直接修改：`s[0] = \'b\'`。Python 與 Java 的字串是不可變的（immutable），`s[0] = "b"` 在 Python 會出錯，Java 沒有這種寫法；要「修改」就產生一個新字串，例如 Python 的 `"b" + s[1:]`，或 Java 的 `StringBuilder`。' },
        { type: 'callout', tone: 'warning', title: 'Java 比較字串要用 equals', text: 'Java 的 `==` 比較的是「是不是同一個物件」，不是內容。`new String("hi") == "hi"` 是 false，`"hi".equals(new String("hi"))` 才是 true。C++ 與 Python 的 `==` 比較的是內容。' },
        { type: 'p', text: '字串大小比較依字元碼由左到右逐字比較（字典序）：`"Apple" < "apple"` 成立，因為 `A`（65）小於 `a`（97）；`"10" < "9"` 也成立，因為比的是第一個字元 `1` 與 `9`，不是數值大小。' },
      ],
    },
  ],
  examples: [
    {
      id: 'index', title: '長度、第一個與最後一個字元', description: '最後一個字元的索引是「長度 − 1」；Python 可以用 −1。',
      output: '5 L c',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    std::string s = "Logic";
    std::cout << s.size() << " " << s[0] << " " << s[s.size() - 1] << "\n";
    return 0;
}`,
        Python: code`s = "Logic"
print(len(s), s[0], s[-1])`,
        Java: code`public class Main {
    public static void main(String[] args) {
        String s = "Logic";
        System.out.println(s.length() + " " + s.charAt(0) + " " + s.charAt(s.length() - 1));
    }
}`,
      },
    },
    {
      id: 'count', title: '統計大寫、小寫與數字', description: '讀入一整行（可能含空白），逐字元判斷種類。',
      stdin: 'Hello World 2026', output: 'upper 2\nlower 8\ndigits 4',
      code: {
        'C++': code`#include <cctype>
#include <iostream>
#include <string>

int main() {
    std::string s;
    std::getline(std::cin, s);
    int upper = 0, lower = 0, digits = 0;
    for (char c : s) {
        unsigned char u = static_cast<unsigned char>(c);
        if (std::isupper(u)) upper++;
        else if (std::islower(u)) lower++;
        else if (std::isdigit(u)) digits++;
    }
    std::cout << "upper " << upper << "\nlower " << lower << "\ndigits " << digits << "\n";
    return 0;
}`,
        Python: code`s = input()
upper = sum(1 for c in s if c.isupper())
lower = sum(1 for c in s if c.islower())
digits = sum(1 for c in s if c.isdigit())
print("upper", upper)
print("lower", lower)
print("digits", digits)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        String s = new Scanner(System.in).nextLine();
        int upper = 0, lower = 0, digits = 0;
        for (char c : s.toCharArray()) {
            if (Character.isUpperCase(c)) upper++;
            else if (Character.isLowerCase(c)) lower++;
            else if (Character.isDigit(c)) digits++;
        }
        System.out.println("upper " + upper);
        System.out.println("lower " + lower);
        System.out.println("digits " + digits);
    }
}`,
      },
    },
    {
      id: 'caesar', title: '凱撒密碼（位移 3）', description: '把每個小寫字母往後移 3 個，超過 z 就繞回 a。用「字母在第幾個」再取餘數處理繞回。',
      stdin: 'xyzabc', output: 'abcdef',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    std::string s;
    std::cin >> s;
    for (char& c : s) {             // & 讓我們能直接修改 s 裡的字元
        c = 'a' + (c - 'a' + 3) % 26;
    }
    std::cout << s << "\n";
    return 0;
}`,
        Python: code`s = input().strip()
result = ""
for c in s:
    result += chr(ord("a") + (ord(c) - ord("a") + 3) % 26)
print(result)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        String s = new Scanner(System.in).next();
        StringBuilder result = new StringBuilder();
        for (char c : s.toCharArray()) {
            result.append((char) ('a' + (c - 'a' + 3) % 26));
        }
        System.out.println(result);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '字串的索引與越界', language: 'Python',
    code: code`s = "Logic"
print(len(s))
print(s[0], s[4])
print(s[-1])
print(s[5])`,
    steps: [
      { line: 1, note: 's 是 5 個字元的序列，索引 0 到 4。', arrays: [{ name: 's', cells: ['L', 'o', 'g', 'i', 'c'] }] },
      { line: 2, note: '長度是 5，最後一個索引是 5 − 1 = 4。', arrays: [{ name: 's', cells: ['L', 'o', 'g', 'i', 'c'] }], output: '5' },
      { line: 3, note: '讀取索引 0 與 4：第一個與最後一個字元。', arrays: [{ name: 's', cells: ['L', 'o', 'g', 'i', 'c'], marks: [{ at: 0, kind: 'read' }, { at: 4, kind: 'read' }] }], output: '5\nL c' },
      { line: 4, note: 'Python 的負索引從尾端算起：s[-1] 就是 s[4]。C++ 與 Java 沒有負索引。', arrays: [{ name: 's', cells: ['L', 'o', 'g', 'i', 'c'], marks: [{ at: 4, kind: 'read' }] }], output: '5\nL c\nc' },
      { line: 5, note: 's[5] 超出範圍：Python 丟出 IndexError，程式中止。C++ 的 s[5] 是未定義行為，Java 會丟出 StringIndexOutOfBoundsException。', arrays: [{ name: 's', cells: ['L', 'o', 'g', 'i', 'c'], marks: [{ at: 5, kind: 'bad' }] }], output: '5\nL c\nc\nIndexError: string index out of range' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 's = "banana"\nprint(s[1], s[-1], len(s))' },
      options: ['b a 6', 'a a 6', 'a a 5', 'a n 6'],
      answer: 1, explanation: '索引從 0 開始，s[1] 是第二個字元 a；s[-1] 是最後一個字元 a；長度是 6。',
    },
    {
      id: 'q2', prompt: '下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: 'String a = "hi";\nString b = new String("hi");\nSystem.out.println(a == b);\nSystem.out.println(a.equals(b));' },
      options: ['true 與 true', 'false 與 true', 'true 與 false', 'false 與 false'],
      answer: 1, explanation: '`new String("hi")` 建立了一個新物件，`==` 比較兩個變數是否指向同一個物件，所以是 false；`equals` 比較內容，是 true。比較 Java 字串的內容一律用 equals。',
    },
    {
      id: 'q3', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: "char c = 'A';\nc = c + 2;\nstd::cout << c;" },
      options: ['A2', '67', 'C', '編譯錯誤'],
      answer: 2, explanation: "'A' 的字元碼是 65，加 2 得到 67，存回 char 後印出的是字元 C。如果寫成 `std::cout << c + 2;`（沒有存回 char），印出的會是整數 67。",
    },
    {
      id: 'q4', prompt: '下面的 Python 程式會發生什麼事？',
      code: { language: 'Python', text: 's = "cat"\ns[0] = "b"\nprint(s)' },
      options: ['印出 bat', '印出 cat', 'TypeError：字串不能修改', 'IndexError'],
      answer: 2, explanation: 'Python 的字串不可變，不能指定 s[0]，會丟出 TypeError。要得到 "bat"，寫 `s = "b" + s[1:]` 產生新字串。C++ 的 std::string 則可以直接 `s[0] = \'b\'`。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '字元分類統計',
      statement: '讀入一整行文字（可能含空白），統計其中的英文字母、數字、空白與其他字元各有幾個。這一行是空的時候，輸出 `Empty`。',
      inputFormat: '一行文字，只含可列印的 ASCII 字元（含空白）；可能是空行。',
      outputFormat: '四行：`letters`、`digits`、`spaces`、`others` 與各自的個數，以一個空白分隔；空行時只輸出 `Empty`。',
      constraints: ['長度 0～1,000'],
      samples: [{ kind: 'normal', input: 'Hello, World 2026!', output: 'letters 10\ndigits 4\nspaces 2\nothers 2', note: '逗號與驚嘆號算其他' }],
      tests: [
        { kind: 'normal', input: 'Hello, World 2026!', output: 'letters 10\ndigits 4\nspaces 2\nothers 2', note: '一般情況' },
        { kind: 'normal', input: 'APCS 2026/10/31', output: 'letters 4\ndigits 8\nspaces 1\nothers 2', note: '斜線算其他' },
        { kind: 'edge', input: 'a', output: 'letters 1\ndigits 0\nspaces 0\nothers 0', note: '只有一個字元' },
        { kind: 'edge', input: 'a b ', output: 'letters 2\ndigits 0\nspaces 2\nothers 0', note: '行尾的空白也要算（不能先 strip）' },
        { kind: 'edge', input: '@#$%', output: 'letters 0\ndigits 0\nspaces 0\nothers 4', note: '全是其他字元' },
        { kind: 'error', input: '', output: 'Empty', note: '空行：沒有任何字元' },
      ],
      hints: ['讀整行，不要用會略過空白的讀法。', '不要對輸入做 strip／trim，否則行尾的空白會消失。', 'Python 讀到檔尾時 `input()` 會出錯，可以改用 `sys.stdin.readline()`。'],
      solution: {
        'C++': code`#include <cctype>
#include <iostream>
#include <string>

int main() {
    std::string s;
    std::getline(std::cin, s);
    if (s.empty()) {
        std::cout << "Empty\n";
        return 0;
    }
    int letters = 0, digits = 0, spaces = 0, others = 0;
    for (char c : s) {
        unsigned char u = static_cast<unsigned char>(c);
        if (std::isalpha(u)) letters++;
        else if (std::isdigit(u)) digits++;
        else if (c == ' ') spaces++;
        else others++;
    }
    std::cout << "letters " << letters << "\ndigits " << digits << "\nspaces " << spaces << "\nothers " << others << "\n";
    return 0;
}`,
        Python: code`import sys

s = sys.stdin.readline().rstrip("\n")
if s == "":
    print("Empty")
else:
    letters = sum(1 for c in s if c.isalpha())
    digits = sum(1 for c in s if c.isdigit())
    spaces = s.count(" ")
    print("letters", letters)
    print("digits", digits)
    print("spaces", spaces)
    print("others", len(s) - letters - digits - spaces)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.hasNextLine() ? sc.nextLine() : "";
        if (s.isEmpty()) {
            System.out.println("Empty");
            return;
        }
        int letters = 0, digits = 0, spaces = 0, others = 0;
        for (char c : s.toCharArray()) {
            if (Character.isLetter(c)) letters++;
            else if (Character.isDigit(c)) digits++;
            else if (c == ' ') spaces++;
            else others++;
        }
        System.out.println("letters " + letters);
        System.out.println("digits " + digits);
        System.out.println("spaces " + spaces);
        System.out.println("others " + others);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

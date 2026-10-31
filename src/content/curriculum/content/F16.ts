import type { LessonContent } from '../schema';

const code = String.raw;

/** F16 字串與陣列操作. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F16: LessonContent = {
  lessonId: 'F16',
  motivation: '反轉、搜尋、排序、切割、計數——這幾個操作組合起來，就能解決大部分「處理一串資料」的題目。知道哪些該自己寫、哪些直接用標準函式庫，既能寫得快，也能寫得對。',
  sections: [
    {
      id: 'by-hand', title: '自己寫：反轉與搜尋',
      blocks: [
        { type: 'p', text: '原地反轉（in-place）用兩個索引：i 從頭、j 從尾，交換 `a[i]` 與 `a[j]` 後往中間靠，直到 i ≥ j。只需要 n/2 次交換，也不需要第二個陣列。下方的視覺化逐步顯示每一次讀取與寫入。' },
        { type: 'example', id: 'reverse' },
        { type: 'p', text: '線性搜尋從頭找到尾，找到就回傳位置，找不到回傳 −1（或 None）。寫成函式時，「找到就 return」可以省下後面的比較。' },
      ],
    },
    {
      id: 'library', title: '用標準函式庫：排序、反轉、尋找',
      blocks: [
        { type: 'p', text: '常用操作三種語言都有現成的函式，比手寫更快、更不容易錯。排序的函式庫實作是 O(n log n)，遠快於自己寫的 O(n²) 排序（排序的原理在演算法島會學到）。' },
        { type: 'table', head: ['操作', 'C++', 'Python', 'Java'], rows: [
          ['排序（遞增）', '`std::sort(a.begin(), a.end())`', '`a.sort()`、`sorted(a)`', '`Arrays.sort(a)`'],
          ['反轉', '`std::reverse(a.begin(), a.end())`', '`a.reverse()`、`a[::-1]`', '`Collections.reverse(list)`'],
          ['尋找位置', '`s.find(x)`（找不到為 `npos`）', '`s.find(x)`（−1）、`a.index(x)`（例外）', '`s.indexOf(x)`（−1）'],
          ['計數', '`std::count(a.begin(), a.end(), x)`', '`a.count(x)`', '迴圈或 stream'],
        ] },
        { type: 'callout', tone: 'warning', title: 'sorted 與 sort 不一樣', text: 'Python 的 `sorted(a)` 回傳排序好的新 list，a 不變；`a.sort()` 直接排序 a，回傳 None。寫 `a = a.sort()` 會讓 a 變成 None。' },
      ],
    },
    {
      id: 'split-and-convert', title: '切割字串與數字轉換',
      blocks: [
        { type: 'p', text: '一行以逗號分隔的資料，要先切成一段一段，再把每段轉成數字：Python 用 `line.split(",")` 與 `int()`；Java 用 `line.split(",")` 與 `Integer.parseInt()`；C++ 用 `std::stringstream` 搭配 `std::getline(ss, part, \',\')` 與 `std::stoi()`。' },
        { type: 'example', id: 'csv' },
        { type: 'callout', tone: 'note', title: 'split 的細節不同', text: 'Python 的 `"a,,b".split(",")` 得到 `["a", "", "b"]`，保留空字串；Java 的 `split` 會丟掉結尾的空字串（`"a,b,,".split(",")` 只有 2 段）。不帶參數的 Python `split()` 則以任意空白切割並忽略多餘空白。' },
      ],
    },
    {
      id: 'counting', title: '計數陣列',
      blocks: [
        { type: 'p', text: '統計每個字母出現幾次，可以開一個長度 26 的整數陣列，用 `c - \'a\'` 當索引。這比對每個字母各寫一個變數或每次重新搜尋快得多：走一遍字串就統計完成。' },
        { type: 'example', id: 'letters' },
        { type: 'p', text: '注意索引的範圍：`c - \'a\'` 只對小寫字母落在 0～25。輸入含大寫或其他字元時要先轉換或過濾，否則會越界：C++ 是未定義行為、Java 丟出例外；Python 更隱蔽——像 `[`（91）這種字元會得到 −6，負索引不會出錯，而是悄悄改到 `cnt[20]` 那一格。' },
      ],
    },
  ],
  examples: [
    {
      id: 'reverse', title: '原地反轉字串', description: '兩個索引往中間靠、交換兩端。Python 的字串不可變，先轉成 list。',
      stdin: 'logic', output: 'cigol',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <utility>

int main() {
    std::string s;
    std::cin >> s;
    int i = 0, j = static_cast<int>(s.size()) - 1;
    while (i < j) {
        std::swap(s[i], s[j]);
        i++;
        j--;
    }
    std::cout << s << "\n";
    return 0;
}`,
        Python: code`s = list(input().strip())  # str 不可變，轉成 list 才能交換
i, j = 0, len(s) - 1
while i < j:
    s[i], s[j] = s[j], s[i]
    i += 1
    j -= 1
print("".join(s))`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        char[] s = new Scanner(System.in).next().toCharArray();
        int i = 0, j = s.length - 1;
        while (i < j) {
            char t = s[i];
            s[i] = s[j];
            s[j] = t;
            i++;
            j--;
        }
        System.out.println(new String(s));
    }
}`,
      },
    },
    {
      id: 'csv', title: '切割逗號分隔的數字', description: '讀入一行以逗號分隔的整數，輸出總和，以及排序後的結果。',
      stdin: '3,14,-2,7', output: '22\n-2 3 7 14',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

int main() {
    std::string line, part;
    std::getline(std::cin, line);
    std::stringstream ss(line);
    std::vector<int> a;
    while (std::getline(ss, part, ',')) a.push_back(std::stoi(part));
    long long sum = 0;
    for (int x : a) sum += x;
    std::sort(a.begin(), a.end());
    std::cout << sum << "\n";
    for (size_t i = 0; i < a.size(); ++i) std::cout << a[i] << (i + 1 < a.size() ? " " : "\n");
    return 0;
}`,
        Python: code`a = [int(part) for part in input().split(",")]
print(sum(a))
print(*sorted(a))`,
        Java: code`import java.util.Arrays;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        String[] parts = new Scanner(System.in).nextLine().split(",");
        int[] a = new int[parts.length];
        long sum = 0;
        for (int i = 0; i < parts.length; ++i) {
            a[i] = Integer.parseInt(parts[i]);
            sum += a[i];
        }
        Arrays.sort(a);
        StringBuilder sorted = new StringBuilder();
        for (int i = 0; i < a.length; ++i) sorted.append(i > 0 ? " " : "").append(a[i]);
        System.out.println(sum);
        System.out.println(sorted);
    }
}`,
      },
    },
    {
      id: 'letters', title: '字母出現次數', description: '用長度 26 的計數陣列統計小寫字母，依字母順序輸出出現過的字母。',
      stdin: 'banana', output: 'a 3\nb 1\nn 2',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    std::string s;
    std::cin >> s;
    int cnt[26] = {0};
    for (char c : s) cnt[c - 'a']++;
    for (int k = 0; k < 26; ++k) {
        if (cnt[k] > 0) std::cout << static_cast<char>('a' + k) << " " << cnt[k] << "\n";
    }
    return 0;
}`,
        Python: code`s = input().strip()
cnt = [0] * 26
for c in s:
    cnt[ord(c) - ord("a")] += 1
for k in range(26):
    if cnt[k] > 0:
        print(chr(ord("a") + k), cnt[k])`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        String s = new Scanner(System.in).next();
        int[] cnt = new int[26];
        for (char c : s.toCharArray()) cnt[c - 'a']++;
        for (int k = 0; k < 26; ++k) {
            if (cnt[k] > 0) System.out.println((char) ('a' + k) + " " + cnt[k]);
        }
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '原地反轉：兩端交換、往中間靠', language: 'Python',
    code: code`s = list("logic")
i, j = 0, len(s) - 1
while i < j:
    s[i], s[j] = s[j], s[i]
    i += 1; j -= 1
print("".join(s))`,
    steps: [
      { line: 1, note: '把字串轉成 list，才能修改每一格。', arrays: [{ name: 's', cells: ['l', 'o', 'g', 'i', 'c'] }] },
      { line: 2, note: 'i 指向頭（0），j 指向尾（4）。', vars: { i: '0', j: '4' }, arrays: [{ name: 's', cells: ['l', 'o', 'g', 'i', 'c'], marks: [{ at: 0, kind: 'read' }, { at: 4, kind: 'read' }] }] },
      { line: 4, note: '0 < 4，交換 s[0] 與 s[4]。', vars: { i: '0', j: '4' }, loops: [{ label: 'while', iteration: 1, condition: '0 < 4', holds: true }], arrays: [{ name: 's', cells: ['c', 'o', 'g', 'i', 'l'], marks: [{ at: 0, kind: 'write' }, { at: 4, kind: 'write' }] }] },
      { line: 4, note: 'i = 1、j = 3，1 < 3，交換 s[1] 與 s[3]。', vars: { i: '1', j: '3' }, loops: [{ label: 'while', iteration: 2, condition: '1 < 3', holds: true }], arrays: [{ name: 's', cells: ['c', 'i', 'g', 'o', 'l'], marks: [{ at: 1, kind: 'write' }, { at: 3, kind: 'write' }] }] },
      { line: 3, note: 'i = 2、j = 2，2 < 2 不成立：中間的 g 不必和自己交換。只用了 2 次交換。', vars: { i: '2', j: '2' }, loops: [{ label: 'while', iteration: 3, condition: '2 < 2', holds: false }], arrays: [{ name: 's', cells: ['c', 'i', 'g', 'o', 'l'], marks: [{ at: 2, kind: 'read' }] }] },
      { line: 6, note: '接回字串輸出。', vars: { i: '2', j: '2' }, arrays: [{ name: 's', cells: ['c', 'i', 'g', 'o', 'l'] }], output: 'cigol' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'a = [3, 1, 2]\nb = sorted(a)\na.sort(reverse=True)\nprint(a, b)' },
      options: ['[1, 2, 3] [1, 2, 3]', '[3, 2, 1] [1, 2, 3]', '[3, 1, 2] [1, 2, 3]', 'None [1, 2, 3]'],
      answer: 1, explanation: '`sorted(a)` 產生新的遞增 list 給 b，不改 a；接著 `a.sort(reverse=True)` 把 a 原地改成遞減。',
    },
    {
      id: 'q2', prompt: 'Java 中 `"a,b,,c".split(",").length` 是多少？',
      options: ['3', '4', '5', '2'],
      answer: 1, explanation: '切出 "a"、"b"、""、"c" 四段：兩個逗號之間的空字串會保留。Java 只會丟掉「結尾」的空字串，例如 `"a,b,,".split(",")` 只有 2 段。',
    },
    {
      id: 'q3', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'std::string s = "hello";\nstd::reverse(s.begin(), s.end());\nstd::cout << s << " " << s.find(\'l\');' },
      options: ['olleh 2', 'olleh 3', 'hello 2', 'olleh 1'],
      answer: 3, explanation: '反轉後是 "olleh"：o 在索引 0、l 在 1 和 2、e 在 3、h 在 4。`find` 回傳「第一個」符合的位置，所以是 1。',
    },
    {
      id: 'q4', prompt: '用 `cnt[c - \'a\']++` 統計字母，輸入卻含有大寫字母 \'A\'（字元碼 65）。會發生什麼事？',
      options: ['A 被算成 a', '索引是 −32，越界', '自動忽略大寫字母', '編譯錯誤'],
      answer: 1, explanation: "'A' − 'a' = 65 − 97 = −32，這個索引在陣列外：C++ 是未定義行為，Java 丟出 ArrayIndexOutOfBoundsException，Python 丟出 IndexError（長度 26 的 list 只接受 −26～25）。處理前先轉小寫並過濾非字母。",
    },
  ],
  exercises: [
    {
      id: 'e1', title: '字謎判斷（Anagram）',
      statement: '兩個單字如果由完全相同的字母（含每個字母的次數）組成，只是順序不同，就互為字謎，例如 listen 與 silent。讀入兩個單字，不分大小寫判斷是否互為字謎，輸出 `YES` 或 `NO`。任一單字含有英文字母以外的字元時，輸出 `Invalid`。',
      inputFormat: '一行兩個單字，以空白分隔。',
      outputFormat: '一行：`YES`、`NO` 或 `Invalid`。',
      constraints: ['每個單字長度 1～100,000'],
      samples: [{ kind: 'normal', input: 'listen silent', output: 'YES', note: '字母與次數都相同' }],
      tests: [
        { kind: 'normal', input: 'listen silent', output: 'YES', note: '一般情況' },
        { kind: 'normal', input: 'abc abd', output: 'NO', note: '有一個字母不同' },
        { kind: 'normal', input: 'Apple pPlea', output: 'YES', note: '不分大小寫' },
        { kind: 'edge', input: 'a A', output: 'YES', note: '最短，只差大小寫' },
        { kind: 'edge', input: 'aab abb', output: 'NO', note: '字母種類相同但次數不同' },
        { kind: 'edge', input: 'abc abcd', output: 'NO', note: '長度不同' },
        { kind: 'error', input: 'ab1 1ab', output: 'Invalid', note: '含數字' },
      ],
      hints: ['先檢查每個字元都是字母，再全部轉成小寫。', '用兩個長度 26 的計數陣列（或一個：第一個字加、第二個字減），最後比較是否全相等。', '排序兩個字串再比較也可以，但計數陣列只要 O(n)。'],
      solution: {
        'C++': code`#include <cctype>
#include <iostream>
#include <string>

int main() {
    std::string a, b;
    std::cin >> a >> b;
    int cnt[26] = {0};
    for (char c : a + b) {
        if (!std::isalpha(static_cast<unsigned char>(c))) {
            std::cout << "Invalid\n";
            return 0;
        }
    }
    for (char c : a) cnt[std::tolower(static_cast<unsigned char>(c)) - 'a']++;
    for (char c : b) cnt[std::tolower(static_cast<unsigned char>(c)) - 'a']--;
    for (int k = 0; k < 26; ++k) {
        if (cnt[k] != 0) {
            std::cout << "NO\n";
            return 0;
        }
    }
    std::cout << "YES\n";
    return 0;
}`,
        Python: code`a, b = input().split()
if not (a.isascii() and b.isascii() and a.isalpha() and b.isalpha()):
    print("Invalid")
else:
    cnt = [0] * 26
    for c in a.lower():
        cnt[ord(c) - ord("a")] += 1
    for c in b.lower():
        cnt[ord(c) - ord("a")] -= 1
    print("YES" if all(v == 0 for v in cnt) else "NO")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String a = sc.next(), b = sc.next();
        if (!(a + b).matches("[A-Za-z]+")) {
            System.out.println("Invalid");
            return;
        }
        int[] cnt = new int[26];
        for (char c : a.toLowerCase().toCharArray()) cnt[c - 'a']++;
        for (char c : b.toLowerCase().toCharArray()) cnt[c - 'a']--;
        for (int v : cnt) {
            if (v != 0) {
                System.out.println("NO");
                return;
            }
        }
        System.out.println("YES");
    }
}`,
      },
      judge: 'none',
    },
  ],
};

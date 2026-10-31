import type { LessonContent } from '../schema';

const code = String.raw;

/** D03 字串處理. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const D03: LessonContent = {
  lessonId: 'D03',
  motivation: '程式讀到的資料大多先是字串：一行指令、一筆紀錄、一個時間「09:30」。會用計數陣列統計字元、用兩個索引判斷回文、取子字串、把固定格式拆開並檢查，就能處理大部分「讀進來再整理」的題目。更重要的是知道字串操作的成本：在迴圈裡反覆串接，程式可能從 O(n) 變成 O(n²)。本課的技巧以 ASCII 文字為前提；中文、表情符號等 Unicode 文字的「一個字」在三種語言中的意義不同，需要另外處理；格式複雜的資料（巢狀結構、跳脫字元）則該用正規表示式（regular expression）或現成的解析器，而不是手寫 split。',
  sections: [
    {
      id: 'char-array', title: '字串是字元陣列：索引、字元運算與計數',
      blocks: [
        { type: 'p', text: '字串在記憶體中是一排連續的字元，所以它擁有陣列的性質：`s[i]` 是 O(1) 的隨機存取，索引從 0 到 `長度 − 1`，長度本身也是 O(1) 取得（C++ `s.size()`、Python `len(s)`、Java `s.length()`）。D02 學到的連續儲存、越界問題，在字串上完全一樣。' },
        { type: 'p', text: '「字元」與「字串」是不同的型別，三種語言的規則不一樣：' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java'], rows: [
          ['單一字元', '`char`，寫成 `\'a\'`', '沒有字元型別：`"a"` 是長度 1 的 `str`', '`char`，寫成 `\'a\'`'],
          ['字元碼', '`char` 本身就是整數，`c - \'0\'`', '`ord(c)`、`chr(n)`', '`char` 參與運算時變成 `int`，`(char) n` 轉回'],
          ['`\'a\' + 1`', '整數 98', '`TypeError`（`str` 不能加 `int`）', '整數 98；要字元得寫 `(char) (\'a\' + 1)`'],
          ['數字字元轉數值', '`s[i] - \'0\'`', '`int(s[i])` 或 `ord(s[i]) - ord("0")`', '`s.charAt(i) - \'0\'`'],
        ] },
        { type: 'p', text: 'F16 用長度 26 的陣列統計小寫字母。同樣的想法可以推廣：只要字元碼落在已知的小範圍，就開那麼大的計數陣列。ASCII 字元碼是 0～127，開長度 128 的陣列就能統計大小寫、數字與標點。下面的例子走兩遍字串：第一遍計數，第二遍依原本順序找第一個只出現一次的字元。兩遍都是 O(n)，不需要對每個字元重新數一次（那會是 O(n²)）。字元範圍很大或未知時，改用 Python 的 `dict`／`collections.Counter`、Java 的 `HashMap` 或 C++ 的 `std::map`。' },
        { type: 'example', id: 'first-unique' },
        { type: 'callout', tone: 'note', title: '「一個字」不一定是一格', text: '三種語言的字串單位不同：Python 的 `str` 以 Unicode 碼位（code point）為單位，`len("你好")` 是 2；Java 的 `char` 是 16 位元的 UTF-16 單位，大多數中文是一個 `char`，但表情符號要兩個，`length()` 會多算；C++ 的 `std::string` 只是一串位元組，UTF-8 的一個中文字通常佔 3 個位元組，`size()` 回傳的是位元組數。所以計數陣列與索引技巧只對 ASCII 文字直接成立，本課的範例都只用 ASCII。' },
      ],
    },
    {
      id: 'mutability', title: '可變與不可變：串接的真正成本',
      blocks: [
        { type: 'p', text: 'C++ 的 `std::string` 是可變的（mutable）：`s[0] = \'x\'` 直接改那一格，`s += c` 像 `std::vector` 的 `push_back`，容量不夠才重新配置，攤銷 O(1)。Python 的 `str` 與 Java 的 `String` 是不可變的（immutable）：建立之後內容不能改，`s[0] = "x"` 在 Python 是 `TypeError`，Java 的 `String` 根本沒有修改字元的方法。每一個看起來像「修改」的操作，例如 `s = s + "x"`、`s.toUpperCase()`、`s.replace(...)`，都是建立一個新字串，再讓變數指向它。' },
        { type: 'p', text: '這就是串接陷阱的來源。在迴圈中執行 n 次 `s = s + "x"`，第 k 次要把目前長度 k 的內容整個複製到新字串，總共複製 1 + 2 + … + n ≈ n²/2 個字元，是 O(n²)。n = 100,000 時大約 50 億次字元複製，明顯變慢。正確做法是先把片段收集起來，最後一次接好：' },
        { type: 'table', head: ['語言', '逐步建立字串的做法', '成本'], rows: [
          ['C++', '`s += x`（可先 `s.reserve(估計長度)`）或 `std::ostringstream`', '總共 O(總長度)'],
          ['C++（錯誤）', '`s = s + x`：`s + x` 先複製出一個新字串', '每次 O(目前長度)，總共 O(n²)'],
          ['Python', '片段放進 list，最後 `"".join(parts)`', '總共 O(總長度)'],
          ['Python（不建議）', '`s += x`：CPython 有時能原地擴充，但這是實作細節，不保證', '最壞 O(n²)'],
          ['Java', '`StringBuilder sb`，`sb.append(x)`，最後 `sb.toString()`', '總共 O(總長度)'],
          ['Java（錯誤）', '`String s`，迴圈中 `s += x`', '每次建立新 `String`，總共 O(n²)'],
        ] },
        { type: 'example', id: 'builder' },
        { type: 'callout', tone: 'warning', title: '在迴圈裡用 + 串接字串', text: 'Java 的 `s += x` 與 C++ 的 `s = s + x` 每一圈都複製整個字串，輸出 10 萬個數字就可能超時。Java 改用 `StringBuilder`，Python 改用 `"".join(...)`，C++ 改用 `s += x`。另外，C++ 的 `"ab" + \'c\'` 不是串接：兩邊都不是 `std::string`，這是指標加整數，結果指到記憶體的其他位置；至少要有一邊是 `std::string`，例如 `std::string("ab") + \'c\'`。' },
        { type: 'p', text: '各操作的成本整理如下（n 是字串長度，k 是取出的長度）：' },
        { type: 'table', head: ['操作', 'C++ `std::string`', 'Python `str`', 'Java `String`／`StringBuilder`'], rows: [
          ['讀取第 i 個字元', '`s[i]` O(1)', '`s[i]` O(1)', '`s.charAt(i)` O(1)'],
          ['修改第 i 個字元', '`s[i] = c` O(1)', '不能改；建新字串 O(n)', '`String` 不能改；`sb.setCharAt(i, c)` O(1)'],
          ['尾端加一個字元', '`s += c` 攤銷 O(1)', '建新字串 O(n)（不保證原地）', '`String` O(n)；`sb.append(c)` 攤銷 O(1)'],
          ['取長度 k 的子字串', '`s.substr(pos, k)` O(k)', '`s[a:b]` O(k)', '`s.substring(a, b)` O(k)'],
          ['比較兩字串內容', '`==`、`<` O(n)', '`==`、`<` O(n)', '`equals`、`compareTo` O(n)'],
        ] },
      ],
    },
    {
      id: 'palindrome-section', title: '回文：兩個索引往中間靠',
      blocks: [
        { type: 'p', text: '回文（palindrome）是正著讀、反著讀都一樣的字串，例如 level、racecar。F16 反轉字串用了兩個索引；判斷回文也用同一招，但不需要真的反轉：i 從頭、j 從尾，比較 `s[i]` 與 `s[j]`，相同就往中間各走一步，只要有一對不同就立刻回答「不是」。i ≥ j 時所有成對的字元都比過了，奇數長度正中間那個字元不必和自己比。最多比較 n/2 次，O(n) 時間、O(1) 額外空間；先 `s[::-1]` 反轉再比雖然也是 O(n)，卻多用一份 O(n) 的記憶體。下方視覺化逐步比較 level 與 label。' },
        { type: 'p', text: '實際題目常要求「忽略大小寫，只看字母與數字」，例如 `A man, a plan, a canal: Panama` 是回文。做法是在兩個索引移動時跳過不是字母或數字的字元，比較前先轉成小寫。這樣不必先建立一個「清理過」的新字串。' },
        { type: 'example', id: 'palindrome' },
        { type: 'callout', tone: 'tip', title: '跳過字元時別讓索引交錯', text: '跳過字元的迴圈每次只移動一邊、而且仍然要檢查 `i < j`。像範例那樣在同一個 `while (i < j)` 裡「跳過一格就重新判斷」最安全；若寫成內層 `while (!isalnum(s[i])) i++`，全是標點的字串會讓 i 一路跑出字串尾端。C++ 的 `std::isalnum`、`std::tolower` 要先轉成 `unsigned char`，否則非 ASCII 的負值字元是未定義行為。' },
      ],
    },
    {
      id: 'substring-compare', title: '子字串與比較',
      blocks: [
        { type: 'p', text: '取子字串三種語言的參數意義不同，是最常見的差一（off-by-one）錯誤來源：C++ 的 `s.substr(pos, count)` 第二個參數是「長度」；Python 的 `s[a:b]` 與 Java 的 `s.substring(a, b)` 是「起點到終點、不含終點」，長度是 `b − a`。三者都會複製出新字串，成本 O(k)。搜尋子字串時，C++ 的 `find` 找不到回傳 `std::string::npos`，Python 的 `find` 與 Java 的 `indexOf` 回傳 −1。' },
        { type: 'example', id: 'slices' },
        { type: 'p', text: 'C++17 有 `std::string_view`：它只記錄「指向哪裡、長度多少」，不擁有字元，所以 `v.substr(...)` 是 O(1)，適合把唯讀字串傳給函式。代價是它不延長原字串的壽命（lifetime）：`std::string_view v = std::string("ab") + "cd";` 這一行結束時暫時字串就被銷毀，之後讀 v 是未定義行為；回傳指向函式內區域字串的 `string_view` 也一樣。只在確定原字串活得比 view 久時才用它。' },
        { type: 'p', text: '比較字串的內容：C++ 的 `std::string` 與 Python 的 `str` 用 `==`、`<`（字典序，lexicographic order，逐字元比較字元碼，所以大寫字母排在小寫之前：`"Zoo" < "apple"`）。Python 的 `is` 比較的是「是不是同一個物件」，不能用來比內容。' },
        { type: 'callout', tone: 'warning', title: 'Java 的 == 不是比內容', text: 'Java 的 `String` 是參考型別，`a == b` 比較的是兩個變數是否指向同一個物件。程式中寫死的字面值（literal）會共用同一個物件，所以 `"hi" == "hi"` 碰巧是 true；但從 `Scanner` 讀進來、或執行時串接出來的字串是新物件，`input == "quit"` 會是 false，即使內容一樣。比較內容一律用 `a.equals(b)`（不分大小寫用 `equalsIgnoreCase`），比較大小用 `a.compareTo(b)`。' },
      ],
    },
    {
      id: 'parsing', title: '解析固定格式的字串',
      blocks: [
        { type: 'p', text: '像 `HH:MM`、`key=value` 這種格式固定的字串，步驟都是「先檢查格式、再切開、最後轉成數字並檢查範圍」。切開可以用分隔符號的位置：C++ `s.find(\'=\')` 後用 `substr`；Python `s.split("=", 1)`（最多切一次，value 裡的 `=` 會保留）；Java `s.split("=", 2)` 或 `s.indexOf(\'=\')`。格式固定時，也可以直接檢查長度與每個位置的字元。' },
        { type: 'p', text: '轉成數字的函式對壞輸入的反應不同，所以不能只靠它們檢查格式：C++ 的 `std::stoi("12ab")` 會讀出前面的 12、不報錯，`std::stoi("ab")` 則丟出例外；Python 的 `int(" 12 ")` 允許前後空白，`int("12ab")` 丟出 `ValueError`；Java 的 `Integer.parseInt(" 12")` 丟出 `NumberFormatException`。先自己確認每個字元都是 `0`～`9`，再轉換，行為就三語一致。' },
        { type: 'example', id: 'parse-time' },
      ],
    },
  ],
  examples: [
    {
      id: 'first-unique', title: '第一個只出現一次的字元', description: '長度 128 的計數陣列：第一遍統計每個 ASCII 字元出現幾次，第二遍依原順序找第一個次數為 1 的字元，輸出它和它的索引。',
      stdin: 'abracadabra', output: 'c 4',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    std::string s;
    std::getline(std::cin, s);
    int cnt[128] = {0};
    for (unsigned char c : s) cnt[c]++;
    for (size_t i = 0; i < s.size(); ++i) {
        if (cnt[static_cast<unsigned char>(s[i])] == 1) {
            std::cout << s[i] << " " << i << "\n";
            return 0;
        }
    }
    std::cout << "none\n";
    return 0;
}`,
        Python: code`s = input()
cnt = [0] * 128
for c in s:
    cnt[ord(c)] += 1
for i, c in enumerate(s):
    if cnt[ord(c)] == 1:
        print(c, i)
        break
else:
    print("none")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        String s = new Scanner(System.in).nextLine();
        int[] cnt = new int[128];
        for (char c : s.toCharArray()) cnt[c]++;
        for (int i = 0; i < s.length(); ++i) {
            if (cnt[s.charAt(i)] == 1) {
                System.out.println(s.charAt(i) + " " + i);
                return;
            }
        }
        System.out.println("none");
    }
}`,
      },
    },
    {
      id: 'builder', title: '用 O(n) 的方式建立長字串', description: '讀入 n，輸出 1 到 n 以逗號相接的字串與它的長度。C++ 用 +=（可先 reserve），Python 用 join，Java 用 StringBuilder。',
      stdin: '12', output: '1,2,3,4,5,6,7,8,9,10,11,12\n26',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    int n;
    std::cin >> n;
    std::string s;
    s.reserve(8 * n);  // 預先配置，省去中途重新配置（不寫也是攤銷 O(1)）
    for (int i = 1; i <= n; ++i) {
        if (i > 1) s += ',';
        s += std::to_string(i);
    }
    std::cout << s << "\n" << s.size() << "\n";
    return 0;
}`,
        Python: code`n = int(input())
parts = [str(i) for i in range(1, n + 1)]
s = ",".join(parts)  # 一次接好，O(總長度)
print(s)
print(len(s))`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt();
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= n; ++i) {
            if (i > 1) sb.append(',');
            sb.append(i);
        }
        String s = sb.toString();
        System.out.println(s);
        System.out.println(s.length());
    }
}`,
      },
    },
    {
      id: 'palindrome', title: '忽略大小寫與標點的回文判斷', description: '每行一個句子。兩個索引往中間靠，跳過不是字母或數字的字元，比較前轉小寫。',
      stdin: 'A man, a plan, a canal: Panama\nrace a car\nWas it a car or a cat I saw?', output: 'YES\nNO\nYES',
      code: {
        'C++': code`#include <cctype>
#include <iostream>
#include <string>

bool isPal(const std::string& s) {
    int i = 0, j = static_cast<int>(s.size()) - 1;
    while (i < j) {
        unsigned char a = s[i], b = s[j];
        if (!std::isalnum(a)) { ++i; continue; }
        if (!std::isalnum(b)) { --j; continue; }
        if (std::tolower(a) != std::tolower(b)) return false;
        ++i;
        --j;
    }
    return true;
}

int main() {
    std::string line;
    while (std::getline(std::cin, line)) std::cout << (isPal(line) ? "YES" : "NO") << "\n";
    return 0;
}`,
        Python: code`import sys


def is_pal(s):
    i, j = 0, len(s) - 1
    while i < j:
        if not s[i].isalnum():
            i += 1
        elif not s[j].isalnum():
            j -= 1
        elif s[i].lower() != s[j].lower():
            return False
        else:
            i += 1
            j -= 1
    return True


for line in sys.stdin:
    print("YES" if is_pal(line.rstrip("\n")) else "NO")`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

public class Main {
    static boolean isPal(String s) {
        int i = 0, j = s.length() - 1;
        while (i < j) {
            char a = s.charAt(i), b = s.charAt(j);
            if (!Character.isLetterOrDigit(a)) { i++; continue; }
            if (!Character.isLetterOrDigit(b)) { j--; continue; }
            if (Character.toLowerCase(a) != Character.toLowerCase(b)) return false;
            i++;
            j--;
        }
        return true;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) System.out.println(isPal(line) ? "YES" : "NO");
    }
}`,
      },
    },
    {
      id: 'slices', title: '子字串、搜尋與比較', description: '同一個字串 programming：取出 gram 與結尾 3 個字元、搜尋子字串的位置，再組出新字串並比較內容。注意 C++ substr 的第二個參數是長度。',
      output: 'gram\ning\n3\n-1\nprogress equal',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    std::string s = "programming";
    std::cout << s.substr(3, 4) << "\n";           // 從 3 開始取 4 個
    std::cout << s.substr(s.size() - 3) << "\n";   // 從 8 取到結尾
    std::cout << s.find("gram") << "\n";
    std::size_t p = s.find("xyz");
    std::cout << (p == std::string::npos ? -1 : static_cast<int>(p)) << "\n";
    std::string t = s.substr(0, 3) + "gress";
    std::cout << t << " " << (t == "progress" ? "equal" : "different") << "\n";
    return 0;
}`,
        Python: code`s = "programming"
print(s[3:7])          # 索引 3 到 6，不含 7
print(s[-3:])          # 最後 3 個
print(s.find("gram"))
print(s.find("xyz"))
t = s[:3] + "gress"
print(t, "equal" if t == "progress" else "different")`,
        Java: code`public class Main {
    public static void main(String[] args) {
        String s = "programming";
        System.out.println(s.substring(3, 7));          // 索引 3 到 6，不含 7
        System.out.println(s.substring(s.length() - 3));
        System.out.println(s.indexOf("gram"));
        System.out.println(s.indexOf("xyz"));
        String t = s.substring(0, 3) + "gress";         // 執行時產生的新物件
        System.out.println(t + " " + (t.equals("progress") ? "equal" : "different"));
    }
}`,
      },
    },
    {
      id: 'parse-time', title: '解析並檢查 HH:MM', description: '每行一個時間，格式必須剛好是兩位數小時、冒號、兩位數分鐘，小時 00～23、分鐘 00～59。合法就輸出從午夜起算的分鐘數，否則輸出 Invalid。',
      stdin: '09:30\n23:59\n7:05\n24:00\n12:3a', output: '570\n1439\nInvalid\nInvalid\nInvalid',
      code: {
        'C++': code`#include <iostream>
#include <string>

int toMinutes(const std::string& s) {  // -1 表示不合法
    if (s.size() != 5 || s[2] != ':') return -1;
    for (int k = 0; k < 5; ++k) {
        if (k != 2 && (s[k] < '0' || s[k] > '9')) return -1;
    }
    int h = std::stoi(s.substr(0, 2)), m = std::stoi(s.substr(3, 2));
    if (h > 23 || m > 59) return -1;
    return h * 60 + m;
}

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        int t = toMinutes(line);
        if (t < 0) std::cout << "Invalid\n";
        else std::cout << t << "\n";
    }
    return 0;
}`,
        Python: code`import sys


def to_minutes(s):
    if len(s) != 5 or s[2] != ":":
        return None
    if not all("0" <= c <= "9" for c in s[:2] + s[3:]):
        return None
    h, m = int(s[:2]), int(s[3:])
    if h > 23 or m > 59:
        return None
    return h * 60 + m


for line in sys.stdin:
    t = to_minutes(line.rstrip("\n"))
    print("Invalid" if t is None else t)`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

public class Main {
    static int toMinutes(String s) {  // -1 表示不合法
        if (s.length() != 5 || s.charAt(2) != ':') return -1;
        for (int k = 0; k < 5; ++k) {
            char c = s.charAt(k);
            if (k != 2 && (c < '0' || c > '9')) return -1;
        }
        int h = Integer.parseInt(s.substring(0, 2)), m = Integer.parseInt(s.substring(3, 5));
        if (h > 23 || m > 59) return -1;
        return h * 60 + m;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            int t = toMinutes(line);
            System.out.println(t < 0 ? "Invalid" : String.valueOf(t));
        }
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '回文判斷：兩端比較、往中間靠', language: 'Python',
    code: code`def is_pal(s):
    i, j = 0, len(s) - 1
    while i < j:
        if s[i] != s[j]:
            return False
        i += 1
        j -= 1
    return True

print(is_pal("level"))
print(is_pal("label"))`,
    steps: [
      { line: 10, note: '呼叫 is_pal("level")。字串可以看成 5 格的字元陣列，索引 0～4。', vars: { s: '"level"' }, arrays: [{ name: 's', cells: ['l', 'e', 'v', 'e', 'l'] }] },
      { line: 2, note: 'i 指向第一格（0），j 指向最後一格（len(s) − 1 = 4）。', vars: { s: '"level"', i: '0', j: '4' }, arrays: [{ name: 's', cells: ['l', 'e', 'v', 'e', 'l'], marks: [{ at: 0, kind: 'current' }, { at: 4, kind: 'current' }] }] },
      { line: 4, note: '0 < 4 成立，進入迴圈。讀取 s[0] = l 與 s[4] = l，兩者相同，不回傳，繼續往中間。', vars: { s: '"level"', i: '0', j: '4' }, loops: [{ label: 'while', iteration: 1, condition: '0 < 4', holds: true }], arrays: [{ name: 's', cells: ['l', 'e', 'v', 'e', 'l'], marks: [{ at: 0, kind: 'read' }, { at: 4, kind: 'read' }] }] },
      { line: 7, note: 'i 加 1、j 減 1，兩個索引各往中間走一步：i = 1、j = 3。', vars: { s: '"level"', i: '1', j: '3' }, loops: [{ label: 'while', iteration: 1, condition: '0 < 4', holds: true }], arrays: [{ name: 's', cells: ['l', 'e', 'v', 'e', 'l'], marks: [{ at: 1, kind: 'current' }, { at: 3, kind: 'current' }] }] },
      { line: 4, note: '1 < 3 成立。讀取 s[1] = e 與 s[3] = e，相同，繼續。', vars: { s: '"level"', i: '1', j: '3' }, loops: [{ label: 'while', iteration: 2, condition: '1 < 3', holds: true }], arrays: [{ name: 's', cells: ['l', 'e', 'v', 'e', 'l'], marks: [{ at: 1, kind: 'read' }, { at: 3, kind: 'read' }] }] },
      { line: 3, note: 'i = 2、j = 2，2 < 2 不成立，離開迴圈。正中間的 v 不必和自己比較：只比了 2 對。', vars: { s: '"level"', i: '2', j: '2' }, loops: [{ label: 'while', iteration: 3, condition: '2 < 2', holds: false }], arrays: [{ name: 's', cells: ['l', 'e', 'v', 'e', 'l'], marks: [{ at: 2, kind: 'current' }] }] },
      { line: 8, note: '每一對都相同，回傳 True，印出 True。', vars: { s: '"level"', i: '2', j: '2' }, arrays: [{ name: 's', cells: ['l', 'e', 'v', 'e', 'l'], marks: [{ at: 0, kind: 'found' }, { at: 1, kind: 'found' }, { at: 2, kind: 'found' }, { at: 3, kind: 'found' }, { at: 4, kind: 'found' }] }], output: 'True' },
      { line: 11, note: '呼叫 is_pal("label")，i、j 重新從 0 與 4 開始。', vars: { s: '"label"', i: '0', j: '4' }, arrays: [{ name: 's', cells: ['l', 'a', 'b', 'e', 'l'], marks: [{ at: 0, kind: 'current' }, { at: 4, kind: 'current' }] }], output: 'True' },
      { line: 4, note: '0 < 4 成立。讀取 s[0] = l 與 s[4] = l，相同；之後 i = 1、j = 3。', vars: { s: '"label"', i: '0', j: '4' }, loops: [{ label: 'while', iteration: 1, condition: '0 < 4', holds: true }], arrays: [{ name: 's', cells: ['l', 'a', 'b', 'e', 'l'], marks: [{ at: 0, kind: 'read' }, { at: 4, kind: 'read' }] }], output: 'True' },
      { line: 4, note: '1 < 3 成立。讀取 s[1] = a 與 s[3] = e，兩者不同：只要有一對不同就不是回文，不必再看後面。', vars: { s: '"label"', i: '1', j: '3' }, loops: [{ label: 'while', iteration: 2, condition: '1 < 3', holds: true }], arrays: [{ name: 's', cells: ['l', 'a', 'b', 'e', 'l'], marks: [{ at: 1, kind: 'read' }, { at: 3, kind: 'read' }] }], output: 'True' },
      { line: 5, note: '立刻回傳 False，印出 False。第一對相同並不代表整個字串是回文。', vars: { s: '"label"', i: '1', j: '3' }, arrays: [{ name: 's', cells: ['l', 'a', 'b', 'e', 'l'] }], output: 'True\nFalse' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '使用者輸入 quit。下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: 'Scanner sc = new Scanner(System.in);\nString cmd = sc.next();\nif (cmd == "quit") System.out.println("bye");\nelse System.out.println("again");' },
      options: ['bye，因為內容相同', 'again，因為 == 比較的是是否為同一個物件', '編譯錯誤：String 不能用 == 比較', '執行時丟出 NullPointerException'],
      answer: 1, explanation: '`Scanner` 讀進來的字串是執行時建立的新物件，而 `"quit"` 是程式中的字面值物件，兩者內容一樣卻不是同一個物件，所以 `==` 是 false，輸出 again。`==` 用在 String 上可以編譯（比較參考是合法的），也沒有 null，所以不會出錯，正因如此這個錯誤很難發現。要寫 `cmd.equals("quit")`。',
    },
    {
      id: 'q2', prompt: '兩段 C++ 程式都在空字串 s 後面加 n 個字元。兩者的總時間複雜度分別是？',
      code: { language: 'C++', text: '// 寫法 A\nfor (int i = 0; i < n; ++i) s = s + \'x\';\n// 寫法 B\nfor (int i = 0; i < n; ++i) s += \'x\';' },
      options: ['A、B 都是 O(n)', 'A 是 O(n²)，B 是 O(n)', 'A、B 都是 O(n²)', 'A 是 O(n)，B 是 O(n²)'],
      answer: 1, explanation: '`s + \'x\'` 會先建立一個新字串並複製 s 的全部內容（第 i 圈複製 i 個字元），總共約 n²/2 次複製，是 O(n²)。`s += \'x\'` 直接修改 s，像 vector 的 push_back，攤銷 O(1)，總共 O(n)。C++ 的 `std::string` 是可變的，問題出在 `s + x` 這個運算本身會產生新字串，而不是字串不能改。',
    },
    {
      id: 'q3', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'std::string s = "datastructure";\nstd::cout << s.substr(4, 6) << " " << s.substr(9) << "\\n";' },
      options: ['st ture', 'struct ture', 'struc ture', 'struct cture'],
      answer: 1, explanation: 'd a t a s t r u c t u r e 的索引是 0～12。`substr(4, 6)` 從索引 4 開始取「6 個字元」：s t r u c t，得到 struct；`substr(9)` 從索引 9 取到結尾：t u r e。選 st 是把第二個參數當成終點（那是 Python 切片與 Java substring 的規則）；struc 是少算一個；cture 是從 8 開始算錯了位置。',
    },
    {
      id: 'q4', prompt: '下面的 Python 程式執行時會發生什麼事？',
      code: { language: 'Python', text: 's = "cat"\ns[0] = "b"\nprint(s)' },
      options: ['印出 bat', '印出 cat，指定被忽略', "丟出 TypeError: 'str' object does not support item assignment", '印出 bcat'],
      answer: 2, explanation: 'Python 的 `str` 是不可變的，不能修改其中一格，第二行就丟出 TypeError，`print` 不會執行。要得到 bat，得建立新字串：`s = "b" + s[1:]`，或先 `list(s)` 修改再 `"".join(...)`。C++ 的 `std::string` 才允許 `s[0] = \'b\'`；Python 也不會默默忽略錯誤。',
    },
    {
      id: 'q5', prompt: '要把 10 萬個單字的 list `words` 以空白接成一行（Python）。哪一個寫法的總成本是 O(總長度)，而且正確？',
      options: ['`s = ""` 後在迴圈中 `s = s + w + " "`', '`s = " ".join(words)`', '`s = sum(words, "")`', '在迴圈中 `s = f"{s} {w}"`'],
      answer: 1, explanation: '`join` 先算好總長度、配置一次、逐段複製，總共 O(總長度)，而且只在單字之間放空白。迴圈中 `s + w + " "` 與 f-string 每一圈都建立新字串並複製目前的全部內容，最壞是 O(n²)，而且前者尾端多一個空白、後者開頭多一個空白。`sum(words, "")` 根本不能執行：Python 直接丟出 TypeError，錯誤訊息就建議改用 join。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '連續字元壓縮（Run-Length Encoding）',
      statement: '把字串中連續相同的字元寫成「字元＋連續次數」，例如 `aaabcc` 壓縮成 `a3b1c2`。同一個字元不連續出現時要分開記：`aabaa` 是 `a2b1a2`。讀入一行字串，只能由小寫英文字母 a～z 組成；若是空字串或含有其他任何字元（大寫、數字、空白、標點），輸出 `Invalid`。',
      inputFormat: '一行字串 s。',
      outputFormat: '一行：壓縮後的字串，或 `Invalid`。',
      constraints: ['s 的長度 1～100,000', '連續次數可能是多位數（最多 100000）', '輸出長度可達 2 × 100,000，必須以 O(n) 建立'],
      samples: [{ kind: 'normal', input: 'aaabcc', output: 'a3b1c2', note: '三段連續字元' }],
      tests: [
        { kind: 'normal', input: 'aaabcc', output: 'a3b1c2', note: '一般情況' },
        { kind: 'normal', input: 'aabaa', output: 'a2b1a2', note: '同一字元分成兩段，不能合併計數' },
        { kind: 'normal', input: 'zzzzzzzzzzzz', output: 'z12', note: '次數是兩位數' },
        { kind: 'edge', input: 'a', output: 'a1', note: '最短：只有一個字元' },
        { kind: 'edge', input: 'abc', output: 'a1b1c1', note: '沒有任何連續，輸出比輸入長' },
        { kind: 'edge', input: 'a'.repeat(100000), output: 'a100000', note: '最大長度，全部相同：次數是六位數' },
        { kind: 'edge', input: 'ab'.repeat(50000), output: 'a1b1'.repeat(50000), note: '最大長度且完全交錯：輸出 20 萬字元，反覆串接會變成 O(n²)' },
        { kind: 'error', input: 'aa1bb', output: 'Invalid', note: '含數字' },
        { kind: 'error', input: 'Hello', output: 'Invalid', note: '含大寫字母' },
        { kind: 'error', input: 'ab c', output: 'Invalid', note: '含空白' },
      ],
      hints: [
        '先走一遍檢查每個字元都在 a～z 之間，有一個不合法就輸出 Invalid 結束。',
        '用索引 i 指向一段的開頭，j 往右走到第一個和 s[i] 不同的位置，這一段長度就是 j − i；接著令 i = j。每個字元只被 j 走過一次，所以是 O(n)。',
        '輸出用 C++ 的 `+=`、Python 的 list 加 `"".join`、Java 的 `StringBuilder`，不要在迴圈中用 String 的 `+`。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    std::string s;
    std::getline(std::cin, s);
    if (!s.empty() && s.back() == '\r') s.pop_back();
    bool valid = !s.empty();
    for (char c : s) {
        if (c < 'a' || c > 'z') valid = false;
    }
    if (!valid) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::string out;
    out.reserve(2 * s.size());
    std::size_t i = 0;
    while (i < s.size()) {
        std::size_t j = i;
        while (j < s.size() && s[j] == s[i]) ++j;
        out += s[i];
        out += std::to_string(j - i);
        i = j;
    }
    std::cout << out << "\n";
    return 0;
}`,
        Python: code`s = input()
if not s or not all("a" <= c <= "z" for c in s):
    print("Invalid")
else:
    parts = []
    i = 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]:
            j += 1
        parts.append(s[i] + str(j - i))
        i = j
    print("".join(parts))`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

public class Main {
    public static void main(String[] args) throws IOException {
        String s = new BufferedReader(new InputStreamReader(System.in)).readLine();
        boolean valid = s != null && !s.isEmpty();
        for (int k = 0; valid && k < s.length(); ++k) {
            char c = s.charAt(k);
            if (c < 'a' || c > 'z') valid = false;
        }
        if (!valid) {
            System.out.println("Invalid");
            return;
        }
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < s.length()) {
            int j = i;
            while (j < s.length() && s.charAt(j) == s.charAt(i)) j++;
            out.append(s.charAt(i)).append(j - i);
            i = j;
        }
        System.out.println(out);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

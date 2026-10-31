import type { LessonContent } from '../schema';

const code = String.raw;

/** F20 基礎程式島綜合挑戰. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F20: LessonContent = {
  lessonId: 'F20',
  motivation: '真正的題目不會告訴你「這題用迴圈」。綜合挑戰要你自己把一個完整的需求拆成步驟，判斷每一步該用條件、迴圈、陣列、字串還是函式，最後用測資證明整個程式是對的——這正是 APCS 實作題與往後資料結構島的起點。',
  sections: [
    {
      id: 'the-task', title: '挑戰：成績報表',
      blocks: [
        { type: 'p', text: '老師要一份成績報表：每位學生有名字與國文、英文、數學三科分數。有些紀錄打錯了（分數不在 0～100），要先找出來；其餘學生依總分由高到低排名，總分相同時依名字的字典順序；最後列出每一科的最高分。' },
        { type: 'p', text: '這一課不教新語法，而是示範「怎麼拆」。下方的視覺化把整個挑戰分成五個階段，每個階段標出用到的課程。動手前先讀完每個階段的目標，再對照三個範例：它們分別是挑戰中的一塊。' },
        { type: 'callout', tone: 'tip', title: '先寫骨架，再逐步填滿', text: '先寫出「讀入 → 驗證 → 計算 → 排序 → 輸出」的主程式骨架，每一步先呼叫一個還沒寫的函式；然後一個一個完成函式，每完成一個就用小測資驗證。這比一口氣寫完再除錯容易得多。' },
      ],
    },
    {
      id: 'validate-and-compute', title: '階段一與二：驗證每筆紀錄、計算總分與各科最高',
      blocks: [
        { type: 'p', text: '把「這筆紀錄合不合法」寫成一個回傳布林值的函式：三個分數都在 0～100 才合法（兩端都包含）。主程式只要寫 `if (!valid(scores))`，意思一目了然，也方便單獨測試邊界值 0、100、−1、101。' },
        { type: 'example', id: 'validate' },
        { type: 'p', text: '各科最高分是「行優先」的走訪：把每位學生的三科分數看成表格的一列，對每一行找最大值。這和二維陣列一課的「每行總和」是同一個模式。' },
        { type: 'example', id: 'subject-best' },
      ],
    },
    {
      id: 'ranking', title: '階段三與四：排序與同分處理',
      blocks: [
        { type: 'p', text: '排名用標準函式庫的排序，並自訂比較規則：總分高的在前；總分相同時，名字字典順序小的在前。三種語言表達「比較規則」的方式不同：' },
        { type: 'list', items: [
          'C++：傳一個比較函式（lambda）給 `std::sort`，回傳「a 是否應該排在 b 前面」。',
          'Python：用 `key` 產生排序依據，`key=lambda r: (-r[1], r[0])` 表示先依總分遞減、再依名字遞增。',
          'Java：傳一個 `Comparator`，用 `Integer.compare` 比較總分、`compareTo` 比較名字。',
        ] },
        { type: 'example', id: 'rank' },
        { type: 'callout', tone: 'warning', title: '比較函式不要用相減', text: 'Java 常見的 `(a, b) -> b.total - a.total` 在數值很大時會溢位而排錯順序。用 `Integer.compare(b.total, a.total)` 才安全。' },
      ],
    },
    {
      id: 'testing', title: '階段五：測試與複雜度',
      blocks: [
        { type: 'p', text: '完成後依「除錯技巧」一課設計測資：一般情況、同分、全部不合法、沒有學生、分數剛好是 0 與 100、剛好是 −1 與 101。每一組先手算答案再比對。' },
        { type: 'p', text: '複雜度：讀入與驗證 O(n)，計算總分與各科最高 O(n)，排序 O(n log n)，所以整體是 O(n log n)。n = 10⁵ 時約 2 × 10⁶ 次比較，完全可行；如果自己寫 O(n²) 的排序，就會變成約 10¹⁰ 次，很可能超時。' },
      ],
    },
  ],
  examples: [
    {
      id: 'validate', title: '驗證一筆紀錄', description: '讀入一筆紀錄，用函式判斷三科是否都在 0～100。英文 101 分不合法。',
      stdin: 'Ann 90 101 80', output: 'Invalid Ann',
      code: {
        'C++': code`#include <iostream>
#include <string>

bool valid(const int s[3]) {
    for (int i = 0; i < 3; ++i) {
        if (s[i] < 0 || s[i] > 100) return false;
    }
    return true;
}

int main() {
    std::string name;
    int s[3];
    std::cin >> name >> s[0] >> s[1] >> s[2];
    std::cout << (valid(s) ? "Valid " : "Invalid ") << name << "\n";
    return 0;
}`,
        Python: code`def valid(scores):
    return all(0 <= x <= 100 for x in scores)


name, *rest = input().split()
scores = list(map(int, rest))
print("Valid" if valid(scores) else "Invalid", name)`,
        Java: code`import java.util.Scanner;

public class Main {
    static boolean valid(int[] s) {
        for (int x : s) {
            if (x < 0 || x > 100) return false;
        }
        return true;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.next();
        int[] s = {sc.nextInt(), sc.nextInt(), sc.nextInt()};
        System.out.println((valid(s) ? "Valid " : "Invalid ") + name);
    }
}`,
      },
    },
    {
      id: 'subject-best', title: '各科最高分', description: '把學生的分數看成表格，對每一行（科目）找最大值。',
      stdin: '3\n80 90 70\n60 95 88\n85 70 90', output: '85 95 90',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int n;
    std::cin >> n;
    std::vector<std::vector<int>> g(n, std::vector<int>(3));
    for (auto& row : g)
        for (auto& x : row) std::cin >> x;
    for (int c = 0; c < 3; ++c) {
        int best = g[0][c];
        for (int r = 1; r < n; ++r) {
            if (g[r][c] > best) best = g[r][c];
        }
        std::cout << best << (c < 2 ? " " : "\n");
    }
    return 0;
}`,
        Python: code`n = int(input())
g = [list(map(int, input().split())) for _ in range(n)]
print(*[max(g[r][c] for r in range(n)) for c in range(3)])`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[][] g = new int[n][3];
        for (int r = 0; r < n; ++r)
            for (int c = 0; c < 3; ++c) g[r][c] = sc.nextInt();
        StringBuilder line = new StringBuilder();
        for (int c = 0; c < 3; ++c) {
            int best = g[0][c];
            for (int r = 1; r < n; ++r) best = Math.max(best, g[r][c]);
            line.append(c > 0 ? " " : "").append(best);
        }
        System.out.println(line);
    }
}`,
      },
    },
    {
      id: 'rank', title: '依總分排名，同分依名字', description: 'Amy 與 Bob 同為 250 分，依名字排列 Amy 在前。',
      stdin: '3\nBob 250\nAmy 250\nCid 270', output: 'Cid 270\nAmy 250\nBob 250',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

int main() {
    int n;
    std::cin >> n;
    std::vector<std::pair<std::string, int>> rows(n);
    for (auto& [name, total] : rows) std::cin >> name >> total;
    std::sort(rows.begin(), rows.end(), [](const auto& a, const auto& b) {
        if (a.second != b.second) return a.second > b.second;  // 總分高的在前
        return a.first < b.first;                              // 同分：名字小的在前
    });
    for (const auto& [name, total] : rows) std::cout << name << " " << total << "\n";
    return 0;
}`,
        Python: code`n = int(input())
rows = []
for _ in range(n):
    name, total = input().split()
    rows.append((name, int(total)))
rows.sort(key=lambda r: (-r[1], r[0]))  # 總分遞減，同分時名字遞增
for name, total in rows:
    print(name, total)`,
        Java: code`import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
    record Row(String name, int total) {}

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        List<Row> rows = new ArrayList<>();
        for (int i = 0; i < n; ++i) rows.add(new Row(sc.next(), sc.nextInt()));
        rows.sort((a, b) -> a.total() != b.total()
            ? Integer.compare(b.total(), a.total())   // 總分高的在前
            : a.name().compareTo(b.name()));           // 同分：名字小的在前
        for (Row r : rows) System.out.println(r.name() + " " + r.total());
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'challenge-stages', title: '成績報表：五個階段',
    stages: [
      { title: '讀入與驗證', concepts: ['F03', 'F05', 'F06', 'F08'], goal: '讀入 n 筆「名字 + 三科分數」，找出不合法的紀錄。', detail: '依輸入順序逐筆處理；任一科不在 0～100 就輸出 Invalid 與名字，並且不列入後續計算。條件用 || 組合，兩端的 0 與 100 都合法。' },
      { title: '計算總分與各科最高', concepts: ['F07', 'F11', 'F12'], goal: '為每位合法學生算出總分，並找出每一科的最高分。', detail: '合法紀錄存進陣列；總分是一列的和，各科最高是對每一行找最大值（初始值用第一位學生的分數，不要用 0）。' },
      { title: '用函式拆解', concepts: ['F13', 'F14', 'F15'], goal: '把驗證、加總、比較寫成獨立的函式。', detail: 'valid(scores) 回傳布林值、total(scores) 回傳總和；主程式只負責流程。資料透過參數與回傳值傳遞，不使用全域變數。' },
      { title: '排序與同分處理', concepts: ['F10', 'F16'], goal: '依總分遞減排名，同分時依名字字典順序。', detail: '使用標準函式庫的排序並自訂比較規則；名字比較用字串的字典序（大寫字母排在小寫之前）。' },
      { title: '測試與複雜度', concepts: ['F17', 'F19'], goal: '用邊界測資驗證，並確認整體為 O(n log n)。', detail: '測試同分、全部不合法、沒有學生、分數 0／100／−1／101。排序主導複雜度：n = 10⁵ 時約 2 × 10⁶ 次比較。' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: 'Python 中要依總分遞減、同分時名字遞增排序 rows（每個元素是 (name, total)），key 應該寫成？',
      options: ['key=lambda r: (r[1], r[0])', 'key=lambda r: (-r[1], r[0])', 'key=lambda r: (r[0], -r[1])', 'key=lambda r: -r[1]'],
      answer: 1, explanation: 'tuple 會依序比較：先比 −total（總分越高、負值越小，排在前面），相同時再比 name。D 只依總分，同分時保留原本的輸入順序，不符合題目要求的名字順序。',
    },
    {
      id: 'q2', prompt: '有 10⁵ 位學生。自己寫兩層迴圈的排序（O(n²)）與使用標準函式庫排序（O(n log n)），比較次數分別約為？',
      options: ['兩者都約 10⁵', '10¹⁰ 與約 1.7 × 10⁶', '10⁵ 與 10¹⁰', '兩者都約 10¹⁰'],
      answer: 1, explanation: 'n² = 10¹⁰；n log₂ n ≈ 10⁵ × 17 ≈ 1.7 × 10⁶。前者很可能超時，後者輕鬆通過。',
    },
    {
      id: 'q3', prompt: '紀錄 `Eve 100 0 100` 應該如何處理？',
      options: ['不合法，因為有 0 分', '不合法，因為有 100 分', '合法，0 與 100 都在範圍內', '只計算 100 分的科目'],
      answer: 2, explanation: '合法範圍是 0～100（兩端都包含），條件是 `s < 0 || s > 100` 才不合法。這正是邊界測資要確認的地方。',
    },
    {
      id: 'q4', prompt: '為什麼 Java 的比較規則建議寫 `Integer.compare(b.total, a.total)`，而不是 `b.total - a.total`？',
      options: ['相減比較慢', '相減在數值很大（或正負相差很大）時可能溢位，得到相反的正負號', 'Java 不允許在 lambda 中相減', '兩者完全相同，沒有差別'],
      answer: 1, explanation: '例如 b.total = 2,000,000,000、a.total = −2,000,000,000 時，相減超過 int 範圍而溢位成負數，排序方向就錯了。本題總分最多 300 不會出事，但養成用 compare 的習慣比較安全。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '綜合挑戰：成績報表',
      statement: '讀入 n 位學生的名字與三科分數。依輸入順序，對每一筆有任何一科不在 0～100 的紀錄輸出 `Invalid <名字>`。接著輸出 `Students <k>`（k 為合法人數）。若 k > 0，再依總分由高到低（同分時名字字典序小的在前）輸出 `<名次>. <名字> <總分>`，名次依序為 1、2、3…；最後輸出 `Best <國文最高> <英文最高> <數學最高>`。',
      inputFormat: '第一行 n；接下來 n 行，每行「名字 國文 英文 數學」。名字只含英文字母。',
      outputFormat: '如上所述：Invalid 行（可能沒有）、Students 行、排名行與 Best 行（k > 0 時）。',
      constraints: ['0 ≤ n ≤ 100,000', '−1,000 ≤ 分數 ≤ 1,000', '名字長度 1～20'],
      samples: [{ kind: 'normal', input: '4\nBob 80 90 80\nAmy 90 80 80\nZed 101 50 50\nCid 70 70 70', output: 'Invalid Zed\nStudents 3\n1. Amy 250\n2. Bob 250\n3. Cid 210\nBest 90 90 80', note: 'Amy 與 Bob 同為 250 分，Amy 在前' }],
      tests: [
        { kind: 'normal', input: '4\nBob 80 90 80\nAmy 90 80 80\nZed 101 50 50\nCid 70 70 70', output: 'Invalid Zed\nStudents 3\n1. Amy 250\n2. Bob 250\n3. Cid 210\nBest 90 90 80', note: '一般情況，含同分與一筆不合法' },
        { kind: 'normal', input: '3\nmia 60 60 60\nMia 60 60 60\nAl 100 100 100', output: 'Students 3\n1. Al 300\n2. Mia 180\n3. mia 180\nBest 100 100 100', note: '名字字典序：大寫 M 排在小寫 m 之前' },
        { kind: 'edge', input: '1\nEve 100 0 100', output: 'Students 1\n1. Eve 200\nBest 100 0 100', note: '分數剛好是 0 與 100，合法' },
        { kind: 'edge', input: '0', output: 'Students 0', note: '沒有學生' },
        { kind: 'error', input: '2\nAnn -1 50 50\nBen 50 50 101', output: 'Invalid Ann\nInvalid Ben\nStudents 0', note: '全部不合法：沒有排名也沒有 Best' },
      ],
      hints: ['先寫 valid、total 兩個函式並各自測試。', '合法的紀錄存起來；Invalid 在讀入時就依序輸出。', '各科最高的初始值用第一位合法學生的分數。', '排序規則：總分不同比總分（大的在前），相同比名字（小的在前）。'],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

struct Student {
    std::string name;
    int s[3];
    int total;
};

bool valid(const int s[3]) {
    for (int i = 0; i < 3; ++i) {
        if (s[i] < 0 || s[i] > 100) return false;
    }
    return true;
}

int main() {
    int n;
    std::cin >> n;
    std::vector<Student> ok;
    for (int i = 0; i < n; ++i) {
        Student st;
        std::cin >> st.name >> st.s[0] >> st.s[1] >> st.s[2];
        if (!valid(st.s)) {
            std::cout << "Invalid " << st.name << "\n";
            continue;
        }
        st.total = st.s[0] + st.s[1] + st.s[2];
        ok.push_back(st);
    }
    std::cout << "Students " << ok.size() << "\n";
    if (ok.empty()) return 0;
    int best[3] = {ok[0].s[0], ok[0].s[1], ok[0].s[2]};
    for (const auto& st : ok)
        for (int c = 0; c < 3; ++c) best[c] = std::max(best[c], st.s[c]);
    std::sort(ok.begin(), ok.end(), [](const Student& a, const Student& b) {
        if (a.total != b.total) return a.total > b.total;
        return a.name < b.name;
    });
    for (size_t i = 0; i < ok.size(); ++i) std::cout << i + 1 << ". " << ok[i].name << " " << ok[i].total << "\n";
    std::cout << "Best " << best[0] << " " << best[1] << " " << best[2] << "\n";
    return 0;
}`,
        Python: code`import sys


def valid(scores):
    return all(0 <= x <= 100 for x in scores)


data = sys.stdin.read().split()
n = int(data[0])
ok = []
for i in range(n):
    name = data[1 + 4 * i]
    scores = [int(x) for x in data[2 + 4 * i:5 + 4 * i]]
    if not valid(scores):
        print("Invalid", name)
        continue
    ok.append((name, scores, sum(scores)))
print("Students", len(ok))
if ok:
    best = [max(st[1][c] for st in ok) for c in range(3)]
    ok.sort(key=lambda st: (-st[2], st[0]))
    for rank, (name, _, total) in enumerate(ok, start=1):
        print(f"{rank}. {name} {total}")
    print("Best", *best)`,
        Java: code`import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
    record Student(String name, int[] s, int total) {}

    static boolean valid(int[] s) {
        for (int x : s) {
            if (x < 0 || x > 100) return false;
        }
        return true;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        List<Student> ok = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < n; ++i) {
            String name = sc.next();
            int[] s = {sc.nextInt(), sc.nextInt(), sc.nextInt()};
            if (!valid(s)) {
                out.append("Invalid ").append(name).append('\n');
                continue;
            }
            ok.add(new Student(name, s, s[0] + s[1] + s[2]));
        }
        out.append("Students ").append(ok.size()).append('\n');
        if (!ok.isEmpty()) {
            int[] best = ok.get(0).s().clone();
            for (Student st : ok)
                for (int c = 0; c < 3; ++c) best[c] = Math.max(best[c], st.s()[c]);
            ok.sort((a, b) -> a.total() != b.total()
                ? Integer.compare(b.total(), a.total())
                : a.name().compareTo(b.name()));
            for (int i = 0; i < ok.size(); ++i) out.append(i + 1).append(". ").append(ok.get(i).name()).append(' ').append(ok.get(i).total()).append('\n');
            out.append("Best ").append(best[0]).append(' ').append(best[1]).append(' ').append(best[2]).append('\n');
        }
        System.out.print(out);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

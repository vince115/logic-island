import type { LessonContent } from '../schema';

const code = String.raw;

/** F17 基本除錯技巧. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F17: LessonContent = {
  lessonId: 'F17',
  motivation: '寫程式的時間有一大半花在找錯。會除錯的人不是靠運氣改一改再試，而是有系統地讀訊息、縮小範圍、用測資證明錯誤在哪裡。這也是 APCS 實作題拿分與失分的分水嶺。',
  sections: [
    {
      id: 'messages', title: '先讀懂錯誤訊息',
      blocks: [
        { type: 'p', text: '錯誤訊息會告訴你「哪一行」與「哪一種」錯誤，先讀它再改程式：' },
        { type: 'list', items: [
          '編譯錯誤（C++、Java）：從「第一個」錯誤看起，後面的錯誤常常是第一個的連鎖反應。訊息裡的行號是編譯器發現問題的地方，真正的錯可能在前一行（例如少了分號）。',
          'Python 的 Traceback：由下往上讀。最後一行是例外種類與說明（例如 `IndexError: list index out of range`），它上面最近的一個 `File ... line ...` 就是出錯的那一行。',
          'Java 的例外：第一行是例外種類，接著的 `at Main.main(Main.java:12)` 指出位置。',
          'C++ 的執行期錯誤常常沒有訊息（例如越界造成 segmentation fault）。編譯時加 `-g -fsanitize=address,undefined` 可以讓程式在出錯時印出位置。',
        ] },
      ],
    },
    {
      id: 'trace', title: '追蹤：比較「實際」與「預期」',
      blocks: [
        { type: 'p', text: '邏輯錯誤沒有訊息，要靠追蹤找出程式「從哪一行開始和你想的不一樣」。做法是：先用小的輸入手算出每一步的預期值，再讓程式在關鍵位置印出實際值，第一個不一致的地方就是錯誤附近。' },
        { type: 'callout', tone: 'warning', title: '追蹤輸出請印到 stderr', text: '評測系統只比對標準輸出。除錯用的訊息印到標準錯誤，就不會混進答案：C++ 的 `std::cerr`、Python 的 `print(..., file=sys.stderr)`、Java 的 `System.err.println`。交出前仍建議刪掉。' },
        { type: 'example', id: 'stderr' },
        { type: 'p', text: '下方的視覺化追蹤一段「求最大值」的錯誤程式，每一步都列出變數的實際值與預期值。第一步就出現不一致：問題出在初始值那一行，而不是後面的比較。' },
      ],
    },
    {
      id: 'narrow', title: '縮小範圍與邊界測資',
      blocks: [
        { type: 'p', text: '程式在大測資上出錯時，試著找出「最小的會出錯的輸入」：刪掉一半資料看還錯不錯，逐步縮小。小輸入才能手算、才能追蹤。' },
        { type: 'p', text: '很多錯誤只在邊界出現，自己設計測資時一定要包含：n = 1 或 0、全部相同、全部負數、最大值（可能溢位）、剛好在條件分界上的值。下面的程式在一般資料上是對的，只有全部是負數時才露出錯誤：' },
        { type: 'example', id: 'max-bug' },
        { type: 'p', text: '也可以用斷言（assert）把「一定要成立的假設」寫進程式，例如「n 一定大於 0」。假設被違反時程式立刻停下並指出位置，而不是悄悄算出錯的答案。' },
        { type: 'example', id: 'assert' },
        { type: 'callout', tone: 'note', title: 'Java 的 assert 預設是關閉的', text: 'Java 要用 `java -ea Main` 執行才會檢查 assert；C++ 定義 `NDEBUG` 時 assert 會被移除；Python 用 `python -O` 執行時也會略過。所以 assert 是除錯工具，不能拿來處理正式的輸入檢查。' },
      ],
    },
    {
      id: 'verdicts', title: '看懂評測結果',
      blocks: [
        { type: 'table', head: ['結果', '意思', '常見原因'], rows: [
          ['AC（Accepted）', '全部測資正確', '—'],
          ['WA（Wrong Answer）', '輸出和答案不同', '邏輯錯誤、邊界沒處理、溢位、多印或少印空白與換行、印了除錯訊息'],
          ['TLE（Time Limit Exceeded）', '超過時間限制', '複雜度太高（例如 n = 10⁵ 用 O(n²)）、無窮迴圈、讀入太慢'],
          ['RE（Runtime Error）', '執行中當掉', '越界、除以 0、遞迴太深、Python／Java 的例外'],
          ['CE（Compile Error）', '無法編譯', '語法錯誤、Java 類別名稱不是 Main'],
        ] },
        { type: 'p', text: '範例測資通過只代表「沒有明顯錯誤」。拿到 WA 時，先懷疑邊界與溢位；拿到 TLE 時，先算複雜度（下一堂課的主題）。' },
      ],
    },
  ],
  examples: [
    {
      id: 'stderr', title: '除錯訊息印到 stderr', description: '程式把每一步的累加值印到標準錯誤，標準輸出只有答案 15。評測系統只看標準輸出，所以答案不受影響。',
      output: '15',
      code: {
        'C++': code`#include <iostream>

int main() {
    int sum = 0;
    for (int i = 1; i <= 5; ++i) {
        sum += i;
        std::cerr << "i=" << i << " sum=" << sum << "\n";  // 除錯用，不影響答案
    }
    std::cout << sum << "\n";
    return 0;
}`,
        Python: code`import sys

total = 0
for i in range(1, 6):
    total += i
    print(f"i={i} total={total}", file=sys.stderr)  # 除錯用，不影響答案
print(total)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int sum = 0;
        for (int i = 1; i <= 5; ++i) {
            sum += i;
            System.err.println("i=" + i + " sum=" + sum);  // 除錯用，不影響答案
        }
        System.out.println(sum);
    }
}`,
      },
    },
    {
      id: 'max-bug', title: '只在全是負數時才出錯', description: '把最大值的初始值設成 0，一般資料看不出問題；輸入 −5 −2 −9 時錯誤版本輸出 0，正確版本以第一個數為初始值，輸出 −2。',
      stdin: '3\n-5 -2 -9', output: 'wrong max: 0\nright max: -2',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int n;
    std::cin >> n;
    std::vector<int> a(n);
    for (auto& x : a) std::cin >> x;
    int wrong = 0;     // 錯誤：0 可能比所有資料都大
    int right = a[0];  // 正確：從第一個數開始
    for (int x : a) {
        if (x > wrong) wrong = x;
        if (x > right) right = x;
    }
    std::cout << "wrong max: " << wrong << "\nright max: " << right << "\n";
    return 0;
}`,
        Python: code`n = int(input())
a = list(map(int, input().split()))
wrong = 0     # 錯誤：0 可能比所有資料都大
right = a[0]  # 正確：從第一個數開始
for x in a:
    if x > wrong:
        wrong = x
    if x > right:
        right = x
print("wrong max:", wrong)
print("right max:", right)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; ++i) a[i] = sc.nextInt();
        int wrong = 0;     // 錯誤：0 可能比所有資料都大
        int right = a[0];  // 正確：從第一個數開始
        for (int x : a) {
            if (x > wrong) wrong = x;
            if (x > right) right = x;
        }
        System.out.println("wrong max: " + wrong);
        System.out.println("right max: " + right);
    }
}`,
      },
    },
    {
      id: 'assert', title: '用 assert 寫下假設', description: '平均值函式假設 n > 0；資料合法時正常輸出 4。若傳入空的資料，assert 會讓程式立刻停在這一行（Java 需加 -ea）。',
      stdin: '3\n2 4 6', output: '4',
      code: {
        'C++': code`#include <cassert>
#include <iostream>
#include <vector>

int average(const std::vector<int>& a) {
    assert(!a.empty() && "average needs at least one value");
    long long sum = 0;
    for (int x : a) sum += x;
    return static_cast<int>(sum / static_cast<long long>(a.size()));
}

int main() {
    int n;
    std::cin >> n;
    std::vector<int> a(n);
    for (auto& x : a) std::cin >> x;
    std::cout << average(a) << "\n";
    return 0;
}`,
        Python: code`def average(a):
    assert len(a) > 0, "average needs at least one value"
    return sum(a) // len(a)


n = int(input())
a = list(map(int, input().split()))
print(average(a))`,
        Java: code`import java.util.Scanner;

public class Main {
    static int average(int[] a) {
        assert a.length > 0 : "average needs at least one value";  // 用 java -ea 執行才會檢查
        long sum = 0;
        for (int x : a) sum += x;
        return (int) (sum / a.length);
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; ++i) a[i] = sc.nextInt();
        System.out.println(average(a));
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'variable-state', title: '追蹤錯誤的最大值程式：實際與預期', language: 'Python',
    code: code`a = [-5, -2, -9]
best = 0
for x in a:
    if x > best:
        best = x
print(best)`,
    steps: [
      { line: 1, note: '輸入全是負數，正確的最大值應該是 −2。', vars: { a: '[-5, -2, -9]' } },
      { line: 2, note: 'best = 0，但「到目前為止看過的最大值」此時應該是第一個數 −5。第一個不一致就在這一行。', vars: { best: '0' }, expected: { best: '-5' } },
      { line: 4, note: 'x = −5：−5 > 0 不成立，best 仍是 0。', vars: { x: '-5', best: '0' }, expected: { x: '-5', best: '-5' } },
      { line: 4, note: 'x = −2：−2 > 0 不成立，best 仍是 0（預期應更新為 −2）。', vars: { x: '-2', best: '0' }, expected: { x: '-2', best: '-2' } },
      { line: 4, note: 'x = −9：不成立。', vars: { x: '-9', best: '0' }, expected: { x: '-9', best: '-2' } },
      { line: 6, note: '輸出 0，預期 −2。修正方式：把第 2 行改成 best = a[0]。', vars: { best: '0' }, expected: { best: '-2' }, output: '0' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: 'Python 程式當掉，印出很長的 Traceback。最先該看哪裡？',
      options: ['第一行的 Traceback (most recent call last)', '最後一行的例外種類與說明，以及它上方最近的檔案行號', '中間任意一行', '不用看，直接重新執行'],
      answer: 1, explanation: 'Traceback 由外往內列出呼叫過程，最後一行是例外種類與原因，它正上方的 `File ..., line ...` 是實際出錯的位置。',
    },
    {
      id: 'q2', prompt: '程式通過範例測資，送出後 n = 10⁵ 的測資得到 TLE。最可能的原因是？',
      options: ['輸出格式錯誤', '使用了 O(n²) 的做法，約 10¹⁰ 次運算', '變數名稱太長', '沒有寫註解'],
      answer: 1, explanation: 'TLE 表示執行太久。n = 10⁵ 時 O(n²) 約需 10¹⁰ 次基本運算，遠超過一般時間限制。格式錯誤會得到 WA，不是 TLE。',
    },
    {
      id: 'q3', prompt: '為了除錯，你在迴圈中用 `print(i, total)` 印出變數，送出後得到 WA。最好的做法是？',
      options: ['評測系統出錯，重送就好', '把除錯訊息改印到標準錯誤（stderr），或交出前刪除', '把 print 改成大寫', '把迴圈拿掉'],
      answer: 1, explanation: '評測系統比對標準輸出，多印的除錯資訊讓輸出和答案不同。印到 stderr 就不會影響答案。',
    },
    {
      id: 'q4', prompt: '這段 C++ 程式的錯誤是？',
      code: { language: 'C++', text: 'std::vector<int> a(n);\n// ... 讀入 a\nint sum = 0;\nfor (int i = 0; i <= n; i++) sum += a[i];' },
      options: ['sum 應該從 1 開始', 'i <= n 讓迴圈讀到 a[n]，越界', 'vector 不能用 [] 存取', '應該用 i += 2'],
      answer: 1, explanation: '合法索引是 0～n − 1，`i <= n` 最後一輪讀取 a[n]，越界。C++ 不一定當掉，可能悄悄加進一個垃圾值，導致 WA 而不是 RE，更難察覺。改成 `i < n`。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '修正錯誤的程式：最大值與最小值的差',
      statement: '起始程式碼應該讀入 n 個整數並輸出「最大值 − 最小值」，但其中有 3 個錯誤：初始值、讀入資料的迴圈範圍，以及溢位。請用下面的測資找出並修正它們（先別看參考解答）。n 為 0 時輸出 `Empty`。',
      inputFormat: '第一行 n；若 n > 0，第二行有 n 個整數。',
      outputFormat: '一行：最大值減最小值，或 `Empty`。',
      constraints: ['0 ≤ n ≤ 100,000', '−2,000,000,000 ≤ 每個整數 ≤ 2,000,000,000（差可能超過 32 位元整數）'],
      samples: [{ kind: 'normal', input: '5\n3 9 -2 7 1', output: '11', note: '9 − (−2) = 11' }],
      tests: [
        { kind: 'normal', input: '5\n3 9 -2 7 1', output: '11', note: '起始程式碼少讀了一個數，或初始值錯誤都會影響' },
        { kind: 'normal', input: '4\n10 20 30 40', output: '30', note: '全是正數：初始值 0 會讓最小值錯成 0' },
        { kind: 'edge', input: '1\n-5', output: '0', note: '只有一個數' },
        { kind: 'edge', input: '3\n-5 -3 -9', output: '6', note: '全是負數：初始值 0 會讓最大值錯成 0' },
        { kind: 'edge', input: '2\n2000000000 -2000000000', output: '4000000000', note: '差超過 int 上限' },
        { kind: 'error', input: '0', output: 'Empty', note: '沒有資料' },
      ],
      hints: ['先用測資 `4\n10 20 30 40` 手算：起始程式碼的 mn 會是多少？', '數一數讀入的迴圈到底讀了幾個數。', '兩個 int 相減的結果仍是 int；先轉成 64 位元再相減。'],
      starter: {
        'C++': code`#include <iostream>

int main() {
    int n;
    std::cin >> n;
    int mx = 0, mn = 0;
    for (int i = 1; i < n; ++i) {
        int x;
        std::cin >> x;
        if (x > mx) mx = x;
        if (x < mn) mn = x;
    }
    std::cout << mx - mn << "\n";
    return 0;
}`,
        Python: code`n = int(input())
a = list(map(int, input().split())) if n > 0 else []
mx = mn = 0
for i in range(1, n):
    x = a[i]
    if x > mx:
        mx = x
    if x < mn:
        mn = x
print(mx - mn)  # Python 不會溢位，但另外兩個錯誤仍在`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int mx = 0, mn = 0;
        for (int i = 1; i < n; ++i) {
            int x = sc.nextInt();
            if (x > mx) mx = x;
            if (x < mn) mn = x;
        }
        System.out.println(mx - mn);
    }
}`,
      },
      solution: {
        'C++': code`#include <iostream>

int main() {
    int n;
    std::cin >> n;
    if (n == 0) {
        std::cout << "Empty\n";
        return 0;
    }
    long long mx = 0, mn = 0;
    for (int i = 0; i < n; ++i) {   // 修正 2：讀滿 n 個
        long long x;                 // 修正 3：64 位元
        std::cin >> x;
        if (i == 0 || x > mx) mx = x;  // 修正 1：從第一個數開始
        if (i == 0 || x < mn) mn = x;
    }
    std::cout << mx - mn << "\n";
    return 0;
}`,
        Python: code`n = int(input())
if n == 0:
    print("Empty")
else:
    a = list(map(int, input().split()))
    mx = mn = a[0]          # 修正 1：從第一個數開始
    for x in a:             # 修正 2：走過全部 n 個
        mx = max(mx, x)
        mn = min(mn, x)
    print(mx - mn)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        if (n == 0) {
            System.out.println("Empty");
            return;
        }
        long mx = 0, mn = 0;
        for (int i = 0; i < n; ++i) {    // 修正 2：讀滿 n 個
            long x = sc.nextLong();       // 修正 3：64 位元
            if (i == 0 || x > mx) mx = x;  // 修正 1：從第一個數開始
            if (i == 0 || x < mn) mn = x;
        }
        System.out.println(mx - mn);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

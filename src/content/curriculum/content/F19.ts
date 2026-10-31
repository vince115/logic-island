import type { LessonContent } from '../schema';

const code = String.raw;

/** F19 時間與空間複雜度入門. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F19: LessonContent = {
  lessonId: 'F19',
  motivation: '程式答案對了，還要「夠快」才能通過評測。動手寫之前先估計「資料變成 10 倍時要多做幾倍工作」，就能判斷一個做法會不會超時，避免寫完才發現整個方法都要重來。這也是 APCS 觀念題的常見題型。',
  sections: [
    {
      id: 'count-operations', title: '數「做了幾次」，而不是量「花了幾秒」',
      blocks: [
        { type: 'p', text: '同一支程式在不同電腦、不同語言上的秒數都不一樣，但「基本操作的次數」與機器無關。所以分析程式時，我們數的是：當輸入大小為 n 時，最內層的敘述大約執行幾次。' },
        { type: 'example', id: 'count' },
        { type: 'p', text: '單層迴圈跑 n 次；兩層各跑 n 次的巢狀迴圈跑 n² 次；每次把 n 減半的迴圈只跑約 log₂ n 次。n = 16 時分別是 16、256、4；n = 10⁶ 時則是 10⁶、10¹²、20——差距會隨 n 急速拉大。' },
      ],
    },
    {
      id: 'big-o', title: 'Big-O：只看成長最快的部分',
      blocks: [
        { type: 'p', text: 'Big-O 描述「n 很大時，操作次數如何成長」。計算時去掉常數倍與成長較慢的項：3n² + 100n + 5 寫成 O(n²)，因為 n 夠大時 n² 那一項決定了一切。' },
        { type: 'table', head: ['複雜度', '典型程式', 'n = 10⁶ 時約'], rows: [
          ['O(1)', '公式計算、陣列以索引存取', '1 次'],
          ['O(log n)', '每次把範圍減半（如二分搜尋）', '20 次'],
          ['O(n)', '單層迴圈走過全部資料', '10⁶ 次'],
          ['O(n log n)', '標準函式庫排序', '2 × 10⁷ 次'],
          ['O(n²)', '兩層迴圈、所有配對', '10¹² 次'],
        ] },
        { type: 'example', id: 'sum-two-ways' },
        { type: 'p', text: '在下方的示意模型中調整 n，比較各種複雜度的操作次數。注意它們是用公式算出的「次數」，不是實際量測的執行時間。' },
      ],
    },
    {
      id: 'constraints', title: '從資料範圍反推可行的做法',
      blocks: [
        { type: 'p', text: '一個粗略的經驗值：一般評測系統一秒大約能做 10⁸ 次簡單運算（會因語言、機器與運算種類而差好幾倍，Python 通常慢很多）。把題目的資料範圍代入複雜度，就能估計會不會超時：' },
        { type: 'table', head: ['n 的上限', '通常可行的複雜度'], rows: [
          ['≤ 20', 'O(2ⁿ)：枚舉所有子集'],
          ['≤ 2,000～5,000', 'O(n²)'],
          ['≤ 10⁵～10⁶', 'O(n log n) 或 O(n)'],
          ['≥ 10⁹', 'O(log n) 或 O(1)：不能逐一處理每個數'],
        ] },
        { type: 'callout', tone: 'warning', title: '這是估計，不是保證', text: '常數倍、輸入輸出速度與語言差異都會影響實際時間。估計的目的是在動手之前排除明顯不可行的做法，而不是精確預測秒數。' },
      ],
    },
    {
      id: 'space', title: '空間複雜度：記憶體也有上限',
      blocks: [
        { type: 'p', text: '空間複雜度描述程式需要多少額外記憶體。一個長度 n 的 int 陣列約占 4n 個位元組（C++／Java；Python 的 list 每個元素還要更多）。二維陣列很容易超出限制：10⁴ × 10⁴ 的 int 表格就要約 4 × 10⁸ 位元組（約 400 MB），一般題目的記憶體限制只有幾百 MB 甚至更少。' },
        { type: 'example', id: 'memory' },
        { type: 'p', text: '遞迴也會用空間：每一層呼叫都占一份堆疊，所以深度 n 的遞迴需要 O(n) 的空間。' },
      ],
    },
  ],
  examples: [
    {
      id: 'count', title: '數一數三種迴圈的次數', description: '讀入 n，分別數出單層迴圈、兩層巢狀迴圈與「每次減半」迴圈執行了幾次。',
      stdin: '16', output: '16 256 4',
      code: {
        'C++': code`#include <iostream>

int main() {
    long long n;
    std::cin >> n;
    long long single = 0, nested = 0, halving = 0;
    for (long long i = 0; i < n; ++i) single++;
    for (long long i = 0; i < n; ++i)
        for (long long j = 0; j < n; ++j) nested++;
    for (long long m = n; m > 1; m /= 2) halving++;
    std::cout << single << " " << nested << " " << halving << "\n";
    return 0;
}`,
        Python: code`n = int(input())
single = nested = halving = 0
for i in range(n):
    single += 1
for i in range(n):
    for j in range(n):
        nested += 1
m = n
while m > 1:
    m //= 2
    halving += 1
print(single, nested, halving)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        long n = new Scanner(System.in).nextLong();
        long single = 0, nested = 0, halving = 0;
        for (long i = 0; i < n; ++i) single++;
        for (long i = 0; i < n; ++i)
            for (long j = 0; j < n; ++j) nested++;
        for (long m = n; m > 1; m /= 2) halving++;
        System.out.println(single + " " + nested + " " + halving);
    }
}`,
      },
    },
    {
      id: 'sum-two-ways', title: '同一個答案，O(n) 與 O(1)', description: '1 + 2 + … + n：迴圈要做 n 次加法，公式 n(n + 1) / 2 只要一次計算。n = 10⁵ 時結果超過 32 位元整數。',
      stdin: '100000', output: '5000050000 5000050000',
      code: {
        'C++': code`#include <iostream>

int main() {
    long long n;
    std::cin >> n;
    long long byLoop = 0;
    for (long long i = 1; i <= n; ++i) byLoop += i;  // O(n)
    long long byFormula = n * (n + 1) / 2;           // O(1)
    std::cout << byLoop << " " << byFormula << "\n";
    return 0;
}`,
        Python: code`n = int(input())
by_loop = 0
for i in range(1, n + 1):  # O(n)
    by_loop += i
by_formula = n * (n + 1) // 2  # O(1)
print(by_loop, by_formula)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        long n = new Scanner(System.in).nextLong();
        long byLoop = 0;
        for (long i = 1; i <= n; ++i) byLoop += i;  // O(n)
        long byFormula = n * (n + 1) / 2;           // O(1)
        System.out.println(byLoop + " " + byFormula);
    }
}`,
      },
    },
    {
      id: 'memory', title: '估計二維陣列的記憶體', description: '讀入 n，計算 n × n 的 4 位元組整數表格需要多少位元組與多少 MB（1 MB = 10⁶ 位元組）。',
      stdin: '10000', output: '400000000 bytes\n400 MB',
      code: {
        'C++': code`#include <iostream>

int main() {
    long long n;
    std::cin >> n;
    long long bytes = n * n * 4;  // sizeof(int) 通常是 4
    std::cout << bytes << " bytes\n" << bytes / 1000000 << " MB\n";
    return 0;
}`,
        Python: code`n = int(input())
nbytes = n * n * 4  # 以 4 位元組整數估計（Python 的 list 實際更大）
print(nbytes, "bytes")
print(nbytes // 1000000, "MB")`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        long n = new Scanner(System.in).nextLong();
        long bytes = n * n * 4;  // int 是 4 位元組
        System.out.println(bytes + " bytes");
        System.out.println(bytes / 1000000 + " MB");
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'complexity', title: '操作次數比較（示意模型）', min: 1, max: 100000, initial: 1000,
    models: [
      { model: '1', example: '公式：n(n + 1) / 2' },
      { model: 'log n', example: '每次把範圍減半的迴圈' },
      { model: 'n', example: '單層迴圈走過全部資料' },
      { model: 'n log n', example: '標準函式庫排序' },
      { model: 'n^2', example: '兩層迴圈：所有配對' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面這段程式的時間複雜度是？',
      code: { language: 'C++', text: 'for (int i = 0; i < n; i++)\n    for (int j = i; j < n; j++)\n        count++;' },
      options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)'],
      answer: 2, explanation: '內層次數依序是 n、n − 1、…、1，總共 n(n + 1)/2 次。去掉常數 1/2 與較低次項，是 O(n²)。內層從 i 開始只讓次數減半，不改變等級。',
    },
    {
      id: 'q2', prompt: '下面這段程式的時間複雜度是？',
      code: { language: 'Python', text: 'while n > 1:\n    n //= 2\n    steps += 1' },
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
      answer: 1, explanation: '每一輪 n 減半，大約 log₂ n 輪後變成 1。n = 10⁹ 也只需要約 30 輪。',
    },
    {
      id: 'q3', prompt: '題目的 n 最大為 10⁵。你的做法是兩層迴圈枚舉所有配對（O(n²)）。最可能的結果是？',
      options: ['一定通過，n 只有 10⁵', '約 10¹⁰ 次運算，很可能超過時間限制', '會記憶體不足', '會編譯錯誤'],
      answer: 1, explanation: '(10⁵)² = 10¹⁰，以每秒約 10⁸ 次估計要上百秒。需要 O(n log n) 或 O(n) 的做法（例如排序後用雙指標，演算法島會學到）。',
    },
    {
      id: 'q4', prompt: '某程式的操作次數是 3n² + 100n + 5。以 Big-O 表示是？',
      options: ['O(3n²)', 'O(n² + n)', 'O(n²)', 'O(100n)'],
      answer: 2, explanation: 'Big-O 去掉常數倍與成長較慢的項，只留下 n²。n 很小時 100n 可能比 3n² 大，但 n 變大後 n² 一定主導。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '和為目標的配對數（先讀資料範圍）',
      statement: '給定 n 個整數與目標 t，計算有多少對索引 i < j 滿足 a[i] + a[j] = t。這一題 n ≤ 2,000：先估計兩層迴圈的次數（約 2 × 10⁶），確認 O(n²) 可行再動手，並在程式開頭用註解寫下你的複雜度分析。',
      inputFormat: '第一行 n 與 t；第二行 n 個整數（n 為 0 時沒有第二行）。',
      outputFormat: '一個整數：配對的數量。',
      constraints: ['0 ≤ n ≤ 2,000', '−10⁹ ≤ a[i], t ≤ 10⁹（兩數之和可能超過 32 位元整數）'],
      samples: [{ kind: 'normal', input: '5 6\n1 5 3 3 2', output: '2', note: '(1, 5) 與 (3, 3)' }],
      tests: [
        { kind: 'normal', input: '5 6\n1 5 3 3 2', output: '2', note: '一般情況' },
        { kind: 'normal', input: '4 0\n-1 1 -2 2', output: '2', note: '含負數' },
        { kind: 'edge', input: '1 2\n1', output: '0', note: '只有一個數，沒有配對' },
        { kind: 'edge', input: '4 4\n2 2 2 2', output: '6', note: '全部相同：4 個數兩兩配對共 6 對' },
        { kind: 'edge', input: '2 2000000000\n1000000000 1000000000', output: '1', note: '兩數之和為 2 × 10⁹，用 64 位元避免溢位' },
        { kind: 'edge', input: '0 5', output: '0', note: '沒有資料' },
      ],
      errorPolicy: '題目保證輸入格式正確且在範圍內；n = 0 是合法的邊界情況（答案為 0）。',
      hints: ['外層 i、內層 j 從 i + 1 開始，每一對只算一次。', '兩數相加前先轉成 64 位元整數。', '次數 n(n − 1)/2，n = 2,000 時約 2 × 10⁶，很安全。'],
      solution: {
        'C++': code`// 時間複雜度 O(n²)：n ≤ 2,000 時約 2 × 10⁶ 次比較；空間 O(n)
#include <iostream>
#include <vector>

int main() {
    int n;
    long long t;
    std::cin >> n >> t;
    std::vector<long long> a(n);
    for (auto& x : a) std::cin >> x;
    long long count = 0;
    for (int i = 0; i < n; ++i)
        for (int j = i + 1; j < n; ++j)
            if (a[i] + a[j] == t) count++;
    std::cout << count << "\n";
    return 0;
}`,
        Python: code`# 時間複雜度 O(n²)：n ≤ 2,000 時約 2 × 10⁶ 次比較；空間 O(n)
import sys

data = sys.stdin.read().split()
n, t = int(data[0]), int(data[1])
a = [int(x) for x in data[2:2 + n]]
count = 0
for i in range(n):
    for j in range(i + 1, n):
        if a[i] + a[j] == t:
            count += 1
print(count)`,
        Java: code`// 時間複雜度 O(n²)：n ≤ 2,000 時約 2 × 10⁶ 次比較；空間 O(n)
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        long t = sc.nextLong();
        long[] a = new long[n];
        for (int i = 0; i < n; ++i) a[i] = sc.nextLong();
        long count = 0;
        for (int i = 0; i < n; ++i)
            for (int j = i + 1; j < n; ++j)
                if (a[i] + a[j] == t) count++;
        System.out.println(count);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

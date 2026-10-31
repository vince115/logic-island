import type { LessonContent } from '../schema';

const code = String.raw;

/** D20 資料結構島綜合挑戰. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const D20: LessonContent = {
  lessonId: 'D20',
  motivation: '真正的題目不會告訴你「這題用並查集」。它只描述需求：哪些東西要記住、要問哪些問題、資料有多大。這一課把整座資料結構島串起來：讀一份完整的需求，列出它需要的操作，替每個操作選出成本夠低的結構，再把雜湊表、並查集、堆積與排序組合成一支程式，最後用針對每個結構弱點設計的測資證明它是對的、也夠快。這正是寫系統與解實作題時的日常：物流排程、客服工單、網路監控都長成「名稱查詢＋群組關係＋依優先度處理」的樣子。它的限制也要說清楚：選型的結論只在題目的限制下成立，資料量或操作比例一變，最佳組合可能就不同；而組合越多結構，程式越長，每一塊都要能單獨測試。',
  sections: [
    {
      id: 'read-problem', title: '讀題：把需求翻成操作清單',
      blocks: [
        { type: 'p', text: '本課的挑戰是「城市網路維運」：你要依序處理最多 2 × 10⁵ 行指令。城市用名稱（英文小寫字母）表示；兩座城市架線後就在同一個網路裡，連通具有遞移性（A 連 B、B 連 C，則 A 與 C 也在同一個網路）。城市可以提出有優先度的修復請求，維修隊每次處理優先度最高的一筆，優先度相同時先處理最早提出的。最後要能輸出網路數量與每座城市被修復的次數。' },
        { type: 'list', items: [
          '`add 名稱`：加入一座新城市，它自己是一個網路。',
          '`link A B`：在 A 與 B 之間架線，兩者所在的網路合併為一個。',
          '`same A B`：問 A 與 B 是否在同一個網路，輸出 `Yes` 或 `No`。',
          '`request A P`：城市 A 提出優先度 P 的修復請求（P 為 1～10⁹ 的整數）。',
          '`serve`：處理一筆請求並輸出 `城市 優先度`；沒有請求時輸出 `Empty`。',
          '`report`：輸出 `Networks 網路數`，以及 `Served` 後接依名稱排序的 `名稱=修復次數`（沒有任何修復時是 `Served none`）。',
        ] },
        { type: 'p', text: '錯誤有三種，而且要依固定順序判斷：先看這一行的格式（空行、未知指令、參數數量不對、P 不是合法整數）是否正確，不正確就輸出 `Invalid`；格式正確但內容不合理（`add` 已存在的城市，或用到還沒加入的城市）輸出 `Error`；從空的請求佇列 `serve` 輸出 `Empty`。所以 `request ghost 0` 是 `Invalid` 而不是 `Error`：P = 0 的格式錯誤先被發現。出錯的指令不改變任何狀態。' },
        { type: 'callout', tone: 'tip', title: '先列操作與次數，再選結構', text: '動手寫程式之前，像 D19「資料結構選型與複雜度」那樣列一張表：每一種操作是什麼、最多會出現幾次、每次能花多少時間。q = 2 × 10⁵ 時，每個操作必須是 O(log q) 或更快；任何「每次查詢都掃描全部資料」的寫法，最壞會到 10¹⁰ 次運算。' },
        { type: 'p', text: '階段一是解析指令（parsing）。用「以空白切開」取得字詞（token），而不是用固定位置擷取，這樣多餘的空白與 Tab 都不會出錯；再用一張「指令 → 字詞數」的表檢查參數數量；最後檢查優先度：先確認它只由數字組成且不超過 10 位，再轉成整數比較範圍。先檢查字元再轉換，是因為三種語言的轉換函式對壞資料的反應不同：C++ 的 `std::stoll("5x")` 會默默回傳 5，超出範圍的字串則丟出 `std::out_of_range`；Python 的 `int("3.5")` 丟出 `ValueError`；Java 的 `Long.parseLong("5x")` 丟出 `NumberFormatException`。下面的範例逐行讀到檔案結尾，印出整理過的指令或 `Invalid`。' },
        { type: 'example', id: 'parse-command' },
      ],
    },
    {
      id: 'choose-structures', title: '為每個操作選結構',
      blocks: [
        { type: 'p', text: '把操作清單逐一對應到學過的結構。關鍵是「名稱」只用來查詢，內部一律換成 0、1、2… 的整數編號（ID），並查集與陣列才能直接用編號當索引。' },
        { type: 'table', head: ['操作', '需要什麼', '結構（課程）', 'C++17 ／ Python 3 ／ Java 17', '單次成本'], rows: [
          ['`add`、查名稱', '由名稱快速找到編號', '雜湊表（D09、D10）', '`std::unordered_map` ／ `dict` ／ `HashMap`', '平均 O(1)（名稱最多 10 字元）'],
          ['編號 → 名稱', '由編號取回名稱', '動態陣列（D02）', '`std::vector` ／ `list` ／ `ArrayList`', 'O(1)'],
          ['`link`', '合併兩個群組', '並查集（D18）', '`std::vector<int>` ／ `list` ／ `int[]`', '攤銷近乎 O(1)'],
          ['`same`', '兩者是否同一群組', '並查集的 `find`', '同上', '攤銷近乎 O(1)'],
          ['`request`', '加入一筆待修請求', '堆積／優先佇列（D15）', '`std::priority_queue` ／ `heapq` ／ `PriorityQueue`', 'O(log h)，h 為待修筆數'],
          ['`serve`', '取出最高優先、同分最早', '同上', '同上', 'O(log h)'],
          ['`report`', '依名稱列出修復次數', '有序 map，或雜湊表＋排序（D09）', '`std::map` ／ `dict`＋`sorted` ／ `TreeMap`', 'O(s) 或 O(s log s)，s 為修過的城市數'],
        ] },
        { type: 'p', text: '為什麼不用別的？`same` 若每次在鄰接串列（D17）上做一次走訪，單次是 O(n + m)，10⁵ 次查詢就是 10¹⁰ 量級；並查集把「連通」這個唯一需要的資訊壓縮成 parent 陣列，攤銷後幾乎是常數。待修請求若存在排序好的陣列裡，取最大值是 O(1)，但每次插入要搬動元素，是 O(h)；堆積兩者都是 O(log h)。名稱若存在陣列裡逐一比對，每次查詢 O(n)；雜湊表平均 O(1)。這張表的代價是：並查集不能「拆線」、堆積不能快速刪除任意一筆、雜湊表沒有順序——幸好題目都不需要。' },
        { type: 'callout', tone: 'note', title: '三種語言的預設方向不同', text: 'C++ 的 `std::priority_queue` 預設是最大堆積（max-heap），Python 的 `heapq` 與 Java 的 `PriorityQueue` 預設是最小堆積（min-heap）。所以要「優先度大的先出」，C++ 直接放優先度，Python 放 `-P`，Java 傳一個比較器（comparator）。順序方面：`std::unordered_map` 與 `HashMap` 的走訪順序沒有規則；Python 的 `dict` 依放入順序走訪（不是依名稱）；`std::map` 與 `TreeMap` 依鍵排序。參考解答的修復次數在 C++ 用 `std::map`、Java 用 `TreeMap`、Python 用 `dict` 再 `sorted`，三種寫法輸出相同。' },
      ],
    },
    {
      id: 'stage-plan', title: '分階段實作：每完成一塊就測一塊',
      blocks: [
        { type: 'p', text: '階段二：名稱換編號。`add` 時把「名稱 → 編號」放進雜湊表，同時把名稱接到動態陣列尾端（編號 → 名稱），並讓並查集的 `parent`、`size` 陣列各長一格。之後 `link`、`same`、`request` 都先查雜湊表：查不到就輸出 `Error`，查得到就只拿整數編號往下傳。' },
        { type: 'p', text: '階段三：並查集與網路數量。網路數量不必每次重算：`add` 時加 1，`link` 真的把兩個不同的根合併時減 1；兩座城市本來就連通（包括 `link a a`）時什麼都不做。`find` 用迴圈寫：先往上找到根，再走第二趟把沿路的節點直接指向根（路徑壓縮，path compression）；合併時把小樹接到大樹下（按大小合併，union by size）。' },
        { type: 'example', id: 'dsu-count' },
        { type: 'p', text: '階段四：堆積與同分處理。題目要求「優先度相同時先處理最早提出的」，堆積本身不保證這件事，必須把到達序號（arrival sequence）放進比較規則：元素存成（優先度, 到達序號, 城市），比較時先比優先度、再比序號。下面的範例中，b 與 d 都是 9，b 先提出所以先出；a 與 c 都是 5，a 先出。' },
        { type: 'example', id: 'heap-tiebreak' },
        { type: 'p', text: '如果忘了序號會怎樣？C++ 寫成 `std::pair<int, std::string>`，同分時改比名稱，最大堆積會先出名稱較大的；Python 寫成 `(-P, name)` 會先出名稱較小的；Java 的比較器只比優先度時，同分元素的先後由堆積內部的調整過程決定，沒有任何保證。三種語言甚至會彼此不一致，而且只有「同分」的測資才看得出來。' },
        { type: 'p', text: '階段五：依名稱輸出報表。修復次數用雜湊表計數時，輸出前一定要先取出鍵排序；改用有序 map 則走訪時就已經排好。' },
        { type: 'example', id: 'sorted-report' },
        { type: 'p', text: '最後把五塊接起來：讀入全部指令，對每一行「解析 → 依指令分派 → 檢查錯誤 → 操作結構」。輸出最多 2 × 10⁵ 行，先累積在緩衝區（C++ 的 `std::string`、Python 的串列再 `join`、Java 的 `StringBuilder`），最後一次印出；Java 用 `BufferedReader` 讀入，比 `Scanner` 快得多。' },
      ],
    },
    {
      id: 'testing-complexity', title: '測試策略與整體複雜度',
      blocks: [
        { type: 'p', text: '組合多個結構時，測資要「瞄準」每個結構最容易寫錯的角落，而不是只跑一組大範例。每一組測資都先手算答案，並寫下它想抓的錯誤：' },
        { type: 'table', head: ['測資', '類型', '它抓得到的錯誤'], rows: [
          ['a 連 b、c 連 d，再連 b 與 c，問 `same a d`', '一般', '`find` 只看直接父節點、沒有走到根'],
          ['`request a 5`、`request b 5`、`serve`（先到的名稱較小）', '一般', '忘了到達序號：依名稱比較的 C++ 寫法會先出 b'],
          ['`link a a`、對已連通的兩城再 `link`', '邊界', '沒有檢查「同一個根」，網路數量被多減'],
          ['P = 1、10⁹、`0005`；城市名稱剛好叫 `serve`', '邊界', '範圍寫成 `<`；用「整行含有 serve」判斷指令'],
          ['還沒有城市或沒有修復時 `report`', '邊界', '輸出 `Served` 後多了空白或漏了 `none`'],
          ['空行、`SERVE`、`link a`、P = 0、−3、`5x`、`3.5`', '錯誤', '解析時陣列越界；`stoll` 默默接受 `5x`'],
          ['重複 `add`、用到未加入的城市', '錯誤', '雜湊表查不到時，C++ 的 `ids[name]` 偷偷新增一筆'],
          ['空的時候 `serve`', '錯誤', '對空堆積取頂端（見下一節）'],
          ['2 × 10⁵ 行、50000 座城市連成一條鏈', '效能', '遞迴 `find` 爆堆疊、用 `Scanner` 或逐行 `print` 太慢'],
        ] },
        { type: 'p', text: '整體複雜度：設 q 為指令數。解析一行是 O(1)（每行最多 3 個字詞，名稱最多 10 字元）；雜湊表查詢平均 O(1)；並查集在路徑壓縮加按大小合併下，每次操作的攤銷成本是 O(α(q))，α 是反阿克曼函數（inverse Ackermann function），實務上不超過 4；`request` 與 `serve` 是 O(log q)；`report` 是 O(s)（有序 map）或 O(s log s)（雜湊表＋排序），最多 10 次。合計 O(q log q + 10 · s log s)，由堆積主導。q = 2 × 10⁵ 時 log₂ q ≈ 18，大約幾百萬次基本操作，三種語言通常都能在一秒內完成。空間是 O(q)：每座城市與每筆請求各存一次。' },
        { type: 'p', text: '注意 `report` 次數的限制不是裝飾：如果 `report` 可以出現 2 × 10⁵ 次、每次都列出 10⁵ 座城市，光是輸出就有 10¹⁰ 個字，任何結構都救不了。讀限制時，要確認「輸出量」本身也在可接受的範圍內。' },
      ],
    },
    {
      id: 'pitfalls', title: '常見陷阱',
      blocks: [
        { type: 'callout', tone: 'warning', title: '直接走訪雜湊表來輸出', text: '`std::unordered_map`、`HashMap` 的走訪順序取決於雜湊值與桶的數量，換一個編譯器、JDK 版本或資料量就可能不同；本機測資剛好依名稱排好，不代表評測時也是。Python 的 `dict` 雖然有固定順序，但那是放入順序，不是名稱順序。題目要求「依名稱」時，用 `std::map`／`TreeMap`，或把鍵取出來排序。' },
        { type: 'callout', tone: 'warning', title: '對空結構操作', text: '對空的 `std::priority_queue` 呼叫 `top()` 或 `pop()` 是未定義行為（undefined behavior），可能印出垃圾值或直接當掉；Python 的 `heapq.heappop([])` 丟出 `IndexError`；Java 的 `PriorityQueue.poll()` 回傳 `null`，接著取欄位就丟出 `NullPointerException`（`remove()` 則丟出 `NoSuchElementException`）。每次 `serve` 都要先檢查是否為空，並輸出題目規定的 `Empty`。' },
        { type: 'callout', tone: 'warning', title: '0-based 與 1-based 編號混用', text: '本課的編號由雜湊表依加入順序從 0 開始配發，`parent`、`size` 與「編號 → 名稱」陣列都用同一套 0-based 編號。若題目改成「城市編號 1～n」，陣列就要開 n + 1 格（或讀入時減 1），而且每一格都要初始化成 `parent[i] = i`；漏掉第 0 或第 n 格，`find` 會走到一個不屬於任何城市的位置。' },
        { type: 'callout', tone: 'warning', title: '遞迴 find 的深度', text: '只寫 `parent[find(a)] = find(b)`（沒有按大小合併）時，依序 `link x1 x2`、`link x2 x3`… 會讓樹長成一條長鏈，第一次對鏈尾呼叫遞迴版 `find` 的深度就是 n。Python 預設的遞迴上限約 1000，會丟出 `RecursionError`；把 `sys.setrecursionlimit` 調很大可能讓直譯器本身的堆疊溢位而當掉；C++ 可能 segmentation fault，Java 丟出 `StackOverflowError`。用迴圈寫 `find`，或加上按大小合併（樹高不超過 log₂ n），兩者都能避免。' },
        { type: 'callout', tone: 'note', title: 'Java：用 == 比較 Integer', text: '`ids.get(a) == ids.get(b)` 比較的是兩個 `Integer` 物件是否同一個，不是數值。Java 會快取 −128～127 的 `Integer`，所以城市少時測試都通過，城市一多就出錯。先存成 `int`（參考解答的 `int a = find(ia)`）再比較，或用 `equals`。' },
        { type: 'p', text: '完成這個挑戰，代表你能從需求推導結構、把多個結構組合成一支程式，並用測資與複雜度證明它可行。接下來的演算法島會在這些結構上建立 BFS、DFS 與最短路徑等演算法：佇列、堆疊與堆積都會再出現。' },
      ],
    },
  ],
  examples: [
    {
      id: 'parse-command', title: '解析並驗證指令', description: '逐行讀到檔案結尾：格式正確就印出 `OK` 與整理過的字詞，否則印出 `Invalid`。空行、未知指令、P = 0、`12x` 與參數不足都是 `Invalid`；多餘的空白不影響結果。',
      stdin: 'add taipei\nrequest taipei 7\nrequest taipei 0\n\nfly away\n  serve  \nrequest taipei 12x\nlink taipei',
      output: 'OK add taipei\nOK request taipei 7\nInvalid\nInvalid\nInvalid\nOK serve\nInvalid\nInvalid',
      code: {
        'C++': code`#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

bool isPriority(const std::string& s) {
    if (s.empty() || s.size() > 10) return false;
    for (char c : s) if (c < '0' || c > '9') return false;
    long long v = std::stoll(s);
    return v >= 1 && v <= 1000000000;
}

int main() {
    const std::map<std::string, std::size_t> arity = {
        {"add", 2}, {"link", 3}, {"same", 3}, {"request", 3}, {"serve", 1}, {"report", 1}};
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::vector<std::string> w;
        for (std::string t; in >> t;) w.push_back(t);  // >> 會跳過任意多個空白
        auto it = w.empty() ? arity.end() : arity.find(w[0]);
        bool ok = it != arity.end() && w.size() == it->second;
        if (ok && w[0] == "request") ok = isPriority(w[2]);
        if (!ok) { std::cout << "Invalid\n"; continue; }
        std::cout << "OK";
        for (const auto& t : w) std::cout << " " << t;
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`import sys

ARITY = {"add": 2, "link": 3, "same": 3, "request": 3, "serve": 1, "report": 1}


def is_priority(s):
    return s.isascii() and s.isdigit() and len(s) <= 10 and 1 <= int(s) <= 10**9


for line in sys.stdin:
    w = line.split()  # 任意多個空白都當成一個分隔
    ok = bool(w) and len(w) == ARITY.get(w[0], -1)
    if ok and w[0] == "request":
        ok = is_priority(w[2])
    print("OK " + " ".join(w) if ok else "Invalid")`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Map;

public class Main {
    static boolean isPriority(String s) {
        if (s.isEmpty() || s.length() > 10) return false;
        for (char c : s.toCharArray()) if (c < '0' || c > '9') return false;
        long v = Long.parseLong(s);
        return v >= 1 && v <= 1_000_000_000L;
    }

    public static void main(String[] args) throws IOException {
        Map<String, Integer> arity = Map.of("add", 2, "link", 3, "same", 3, "request", 3, "serve", 1, "report", 1);
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        for (String line; (line = br.readLine()) != null;) {
            String t = line.trim();
            String[] w = t.isEmpty() ? new String[0] : t.split("\\s+");  // 空行要特別處理
            Integer need = w.length == 0 ? null : arity.get(w[0]);
            boolean ok = need != null && w.length == need;
            if (ok && w[0].equals("request")) ok = isPriority(w[2]);
            System.out.println(ok ? "OK " + String.join(" ", w) : "Invalid");
        }
    }
}`,
      },
    },
    {
      id: 'dsu-count', title: '並查集與群組數量', description: '6 個元素依序合併五對。群組數只在真的合併兩個不同的根時減 1；最後一對 0 與 2 已經連通（0-1-3-2），所以印出 already，群組數不變。',
      output: '0-1 merged groups=5\n2-3 merged groups=4\n1-3 merged groups=3\n4-5 merged groups=2\n0-2 already groups=2',
      code: {
        'C++': code`#include <iostream>
#include <utility>
#include <vector>

std::vector<int> parent = {0, 1, 2, 3, 4, 5}, sz(6, 1);
int groups = 6;

int find(int x) {
    int root = x;
    while (parent[root] != root) root = parent[root];
    while (parent[x] != root) {  // 路徑壓縮：沿路的節點直接指向根
        int next = parent[x];
        parent[x] = root;
        x = next;
    }
    return root;
}

bool unite(int a, int b) {
    int ra = find(a), rb = find(b);
    if (ra == rb) return false;
    if (sz[ra] < sz[rb]) std::swap(ra, rb);  // 按大小合併：小樹接到大樹下
    parent[rb] = ra;
    sz[ra] += sz[rb];
    --groups;
    return true;
}

int main() {
    const std::vector<std::pair<int, int>> pairs = {{0, 1}, {2, 3}, {1, 3}, {4, 5}, {0, 2}};
    for (const auto& [a, b] : pairs) {
        bool merged = unite(a, b);
        std::cout << a << "-" << b << (merged ? " merged" : " already") << " groups=" << groups << "\n";
    }
    return 0;
}`,
        Python: code`parent = list(range(6))
size = [1] * 6
groups = 6


def find(x):
    root = x
    while parent[root] != root:
        root = parent[root]
    while parent[x] != root:  # 路徑壓縮：沿路的節點直接指向根
        nxt = parent[x]
        parent[x] = root
        x = nxt
    return root


def union(a, b):
    global groups
    ra, rb = find(a), find(b)
    if ra == rb:
        return False
    if size[ra] < size[rb]:  # 按大小合併：小樹接到大樹下
        ra, rb = rb, ra
    parent[rb] = ra
    size[ra] += size[rb]
    groups -= 1
    return True


for a, b in [(0, 1), (2, 3), (1, 3), (4, 5), (0, 2)]:
    merged = union(a, b)
    print(f"{a}-{b} {'merged' if merged else 'already'} groups={groups}")`,
        Java: code`public class Main {
    static int[] parent = {0, 1, 2, 3, 4, 5}, size = {1, 1, 1, 1, 1, 1};
    static int groups = 6;

    static int find(int x) {
        int root = x;
        while (parent[root] != root) root = parent[root];
        while (parent[x] != root) {  // 路徑壓縮：沿路的節點直接指向根
            int next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    }

    static boolean union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;
        if (size[ra] < size[rb]) { int t = ra; ra = rb; rb = t; }  // 按大小合併：小樹接到大樹下
        parent[rb] = ra;
        size[ra] += size[rb];
        --groups;
        return true;
    }

    public static void main(String[] args) {
        int[][] pairs = {{0, 1}, {2, 3}, {1, 3}, {4, 5}, {0, 2}};
        for (int[] p : pairs) {
            boolean merged = union(p[0], p[1]);
            System.out.println(p[0] + "-" + p[1] + (merged ? " merged" : " already") + " groups=" + groups);
        }
    }
}`,
      },
    },
    {
      id: 'heap-tiebreak', title: '優先佇列：大的先，同分先到先處理', description: '五筆請求依序到達。比較規則先比優先度（大的先），再比到達序號（小的先），所以 b 在 d 前、a 在 c 前。',
      output: 'b 9\nd 9\na 5\nc 5\ne 1',
      code: {
        'C++': code`#include <iostream>
#include <queue>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

int main() {
    const std::vector<std::pair<std::string, int>> requests = {{"a", 5}, {"b", 9}, {"c", 5}, {"d", 9}, {"e", 1}};
    // priority_queue 是最大堆積；第二欄放 -seq，同分時 seq 小（先到）的反而比較「大」，先出來
    std::priority_queue<std::tuple<int, int, std::string>> heap;
    for (int seq = 0; seq < static_cast<int>(requests.size()); ++seq)
        heap.emplace(requests[seq].second, -seq, requests[seq].first);
    while (!heap.empty()) {
        std::cout << std::get<2>(heap.top()) << " " << std::get<0>(heap.top()) << "\n";
        heap.pop();
    }
    return 0;
}`,
        Python: code`import heapq

requests = [("a", 5), ("b", 9), ("c", 5), ("d", 9), ("e", 1)]
heap = []
for seq, (city, p) in enumerate(requests):
    heapq.heappush(heap, (-p, seq, city))  # 取負：heapq 是最小堆積；seq：同分時先到先修
while heap:
    neg_p, _, city = heapq.heappop(heap)
    print(city, -neg_p)`,
        Java: code`import java.util.PriorityQueue;

public class Main {
    record Request(String city, int priority, int seq) {}

    public static void main(String[] args) {
        String[] cities = {"a", "b", "c", "d", "e"};
        int[] priorities = {5, 9, 5, 9, 1};
        // PriorityQueue 預設是最小堆積，用比較器改成：優先度大的先，同分時 seq 小（先到）的先
        PriorityQueue<Request> heap = new PriorityQueue<>((x, y) -> x.priority() != y.priority()
            ? Integer.compare(y.priority(), x.priority())
            : Integer.compare(x.seq(), y.seq()));
        for (int i = 0; i < cities.length; ++i) heap.add(new Request(cities[i], priorities[i], i));
        while (!heap.isEmpty()) {
            Request r = heap.poll();
            System.out.println(r.city() + " " + r.priority());
        }
    }
}`,
      },
    },
    {
      id: 'sorted-report', title: '雜湊表計數，排序後輸出', description: '用雜湊表統計每座城市被修復的次數，輸出前把鍵依名稱排序，三種語言的輸出才會一致。',
      output: 'Served hualien=1 keelung=1 tainan=2 taipei=3',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>

int main() {
    const std::vector<std::string> served = {"tainan", "taipei", "keelung", "taipei", "hualien", "tainan", "taipei"};
    std::unordered_map<std::string, int> count;
    for (const auto& city : served) ++count[city];
    std::vector<std::string> keys;  // unordered_map 的走訪順序沒有規則：取出鍵再排序
    for (const auto& [city, k] : count) keys.push_back(city);
    std::sort(keys.begin(), keys.end());
    std::cout << "Served";
    for (const auto& city : keys) std::cout << " " << city << "=" << count[city];
    std::cout << "\n";
    return 0;
}`,
        Python: code`served = ["tainan", "taipei", "keelung", "taipei", "hualien", "tainan", "taipei"]
count = {}
for city in served:
    count[city] = count.get(city, 0) + 1
# dict 依放入順序走訪，不是依名稱；題目要求依名稱，所以先排序鍵
print("Served", " ".join(f"{c}={count[c]}" for c in sorted(count)))`,
        Java: code`import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        String[] served = {"tainan", "taipei", "keelung", "taipei", "hualien", "tainan", "taipei"};
        Map<String, Integer> count = new HashMap<>();
        for (String city : served) count.merge(city, 1, Integer::sum);
        List<String> keys = new ArrayList<>(count.keySet());  // HashMap 沒有順序：取出鍵再排序
        Collections.sort(keys);
        StringBuilder line = new StringBuilder("Served");
        for (String city : keys) line.append(' ').append(city).append('=').append(count.get(city));
        System.out.println(line);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'challenge-stages', title: '城市網路維運：五個階段',
    stages: [
      { title: '讀題與解析指令', concepts: ['F03', 'F10', 'D03', 'D19'], goal: '列出六種指令與三種錯誤，把每一行切成字詞並驗證格式。', detail: '以空白切開而不是固定位置擷取；用「指令 → 字詞數」表檢查參數數量；優先度先確認只含數字且不超過 10 位，再轉成整數比較 1～10⁹。格式錯誤輸出 Invalid，並且比 Error 先判斷。' },
      { title: '名稱換編號', concepts: ['D02', 'D09', 'D10'], goal: '用雜湊表把城市名稱對應到 0、1、2… 的編號，並能由編號取回名稱。', detail: 'add 時同時寫入雜湊表與「編號 → 名稱」的動態陣列；重複 add 輸出 Error。其他指令先查雜湊表，查不到就 Error，不要用 C++ 的 [] 查詢（會偷偷新增）。' },
      { title: '連通與網路數量', concepts: ['D16', 'D18'], goal: '用並查集支援 link 與 same，並隨時知道網路數量。', detail: 'find 用迴圈加路徑壓縮，union 按大小合併。網路數在 add 時加 1，只有合併兩個不同的根時減 1；link a a 與重複 link 不改變任何東西。' },
      { title: '依優先度修復', concepts: ['D15'], goal: '用堆積處理 request 與 serve：優先度大的先，同分時先到的先。', detail: '元素存（優先度, 到達序號, 城市編號）。C++ 最大堆積放 −序號，Python 最小堆積放 −優先度，Java 用比較器。serve 前先檢查是否為空，空的時候輸出 Empty。' },
      { title: '報表、測試與複雜度', concepts: ['D09', 'F17', 'F19'], goal: '依名稱輸出修復次數，用瞄準每個結構弱點的測資驗證，並確認整體 O(q log q)。', detail: '修復次數用 std::map／TreeMap，或 dict 再排序；不要直接走訪雜湊表。測資涵蓋同分、自連、空堆積、格式錯誤、未知城市與 2 × 10⁵ 行的效能測試。' },
    ],
  },
  quiz: [
    {
      id: 'q-structure', prompt: '題目有 2 × 10⁵ 個混在一起的 `link a b` 與 `same a b`，城市之間的線一旦架好就不會拆除。下列哪一種做法最合適？',
      options: ['用鄰接串列存線，每次 `same` 從 a 做一次 BFS', '並查集，搭配路徑壓縮與按大小合併', '鄰接矩陣，`same` 時檢查 `matrix[a][b]`', '把所有線存進陣列，每次 `same` 時排序後二分搜尋'],
      answer: 1, explanation: '並查集只維護「誰和誰同一群」，兩種操作的攤銷成本都近乎 O(1)，而且題目不需要拆線，正好避開它的弱點。每次 BFS 是 O(n + m)，10⁵ 次查詢會到 10¹⁰ 量級；鄰接矩陣的 `matrix[a][b]` 只知道 a、b 之間有沒有直接架線，看不出經過其他城市的遞移連通；排序加二分搜尋同樣只能找「直接的一條線」，而且每次排序就要 O(m log m)。',
    },
    {
      id: 'q-order', prompt: '依序執行 `add a`、`add b`、`request a 4`、`request b 4`、`request a 6`、`serve`、`serve`、`serve`、`serve`，四次 `serve` 的輸出依序是？',
      options: ['a 6／a 4／b 4／Empty', 'a 6／b 4／a 4／Empty', 'a 4／b 4／a 6／Empty', 'a 6／a 4／b 4／a 6'],
      answer: 0, explanation: '先取優先度最大的 a 6；剩下兩筆都是 4，依到達順序 `request a 4` 比 `request b 4` 早，所以先 a 4 再 b 4；第四次堆積已空，輸出 Empty。「b 4 在前」是把同分處理反了；「a 4 先」是把它當成先進先出的一般佇列；最後一個選項以為 `serve` 不會移除元素。',
    },
    {
      id: 'q-complexity', prompt: '參考解答（雜湊表＋路徑壓縮與按大小合併的並查集＋堆積），不計最多 10 次的 `report`，處理 q 個指令的總時間複雜度最接近？',
      options: ['O(q)', 'O(q log q)', 'O(q²)', 'O(q · n)，n 為城市數'],
      answer: 1, explanation: '雜湊表查詢平均 O(1)，並查集每次攤銷 O(α(q))（實務上是常數），但 `request` 與 `serve` 各是 O(log q)，最多 q 次，所以由堆積主導，合計 O(q log q)。O(q) 忽略了堆積的 log；O(q²) 是用排序陣列插入請求、或每次重新排序的結果；O(q · n) 是每次 `same` 都做 BFS 的成本。',
    },
    {
      id: 'q-hash-order', prompt: '有人把參考解答的 Java 版改成下面這樣，本機的測資全部通過，評測時 `report` 那一行卻和預期不同。最可能的原因是？',
      code: { language: 'Java', text: 'Map<String, Integer> served = new HashMap<>();\n// serve 時：served.merge(name, 1, Integer::sum);\n// report 時：\nout.append("Served");\nfor (Map.Entry<String, Integer> e : served.entrySet())\n    out.append(\' \').append(e.getKey()).append(\'=\').append(e.getValue());' },
      options: ['`HashMap` 的走訪順序不保證依名稱排序，資料一多就和預期不同；應改用 `TreeMap` 或先排序鍵', '`merge` 第一次遇到某個名稱時會丟出 `NullPointerException`', '`append(\' \')` 加入的是字元，不能和字串混用', '`entrySet()` 在走訪時會修改 map'],
      answer: 0, explanation: '`HashMap` 依雜湊值分桶，走訪順序和名稱的字典序無關；小測資剛好看起來有序只是巧合，換資料量或 JDK 就不同。`merge(name, 1, Integer::sum)` 在鍵不存在時直接放入 1，不會丟例外；`StringBuilder.append(char)` 完全合法；走訪 `entrySet()` 是唯讀的，不會修改 map。',
    },
    {
      id: 'q-test', prompt: '某人的 C++ 堆積寫成 `std::priority_queue<std::pair<int, std::string>>`，存（優先度, 城市名稱），沒有到達序號。下列哪一組測資能抓到這個錯誤？（每組前面都已 `add a`、`add b`）',
      options: ['`request a 3`、`request b 8`、`serve`', '`request b 5`、`request a 5`、`serve`', '`request a 5`、`request b 5`、`serve`', '直接 `serve`'],
      answer: 2, explanation: '同分時 `pair` 會改比名稱，最大堆積先出名稱較大的 b。第三組正確答案是先到的 a 5，錯誤程式卻印出 b 5，被抓到。第二組先到的剛好是 b，正確答案與錯誤程式都印 b 5，看不出差別；第一組優先度不同，沒有同分；直接 `serve` 只測到空堆積。好的測資要讓「錯誤程式」與「正確答案」產生不同輸出。',
    },
    {
      id: 'q-recursion', prompt: 'Python 版若改用遞迴的 `find`，而且合併寫成 `parent[find(a)] = find(b)`（沒有按大小合併）。輸入是 `add` 10⁵ 座城市後依序 `link x1 x2`、`link x2 x3`…，最後 `same x1 x2`。會發生什麼事？最好的修正是？',
      options: ['正常執行，因為有路徑壓縮，樹永遠很矮', '連線會形成一條長鏈，對 x1 的遞迴 find 深度約 10⁵，超過預設遞迴上限而丟出 RecursionError；改用迴圈 find 或加上按大小合併', '只要 `sys.setrecursionlimit(10**9)` 就一定安全', '改用 dict 存 parent 就能解決'],
      answer: 1, explanation: '每次 `link xi xi+1` 都把 xi 的根接到 xi+1 下，而且這些 `find` 只碰到根，不會觸發壓縮，最後形成長度 10⁵ 的鏈；第一次 `find(x1)` 要遞迴 10⁵ 層，Python 預設上限約 1000。路徑壓縮只在 `find` 走過之後才讓樹變矮，救不了第一次；把上限調大可能讓直譯器本身的堆疊溢位而當掉；換成 dict 不改變樹的形狀。迴圈 find 不用呼叫堆疊，按大小合併讓樹高不超過 log₂ n，兩者都能解決。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '綜合挑戰：城市網路維運',
      statement: '依序處理 q 行指令。`add 名稱`：加入一座新城市，它自成一個網路。`link A B`：在 A 與 B 之間架線，兩者所在的網路合併（A 與 B 可以相同）。`same A B`：A 與 B 在同一個網路時輸出 `Yes`，否則輸出 `No`。`request A P`：城市 A 提出優先度 P 的修復請求。`serve`：處理優先度最高的一筆請求，優先度相同時處理最早提出的，輸出 `城市 優先度`，並把該城市的修復次數加 1。`report`：輸出兩行，第一行 `Networks k`（k 為目前的網路數量），第二行 `Served` 後接所有修復過的城市 `名稱=次數`，依名稱字典序以一個空白分隔；沒有任何修復時輸出 `Served none`。錯誤依下列順序判斷：一行的格式不正確（空行、未知指令、參數數量不對、P 不是只由數字組成且介於 1～10⁹ 的整數）輸出 `Invalid`；格式正確但 `add` 的城市已存在，或其他指令用到尚未加入的城市，輸出 `Error`；`serve` 時沒有待處理的請求輸出 `Empty`。出錯的指令不改變任何狀態。',
      inputFormat: '第一行是整數 q。接下來 q 行各是一個指令；指令與參數之間以一個或多個空白（或 Tab）分隔，行首行尾可能有多餘空白。指令名稱區分大小寫。',
      outputFormat: '依指令順序輸出：`same` 輸出 `Yes`／`No`；`serve` 輸出 `城市 優先度` 或 `Empty`；`report` 輸出兩行；出錯的指令輸出 `Invalid` 或 `Error`。`add`、`link`、`request` 成功時不輸出。',
      constraints: ['1 ≤ q ≤ 2 × 10⁵', '城市名稱為 1～10 個英文小寫字母（可能剛好和指令同名）', '合法的優先度 1 ≤ P ≤ 10⁹；格式錯誤的 P 可能是任意字串', '`report` 最多出現 10 次', '第一行一定是合法的 q，之後恰有 q 行'],
      samples: [{ kind: 'normal', input: '12\nadd taipei\nadd taichung\nadd tainan\nlink taipei taichung\nsame taipei taichung\nsame taipei tainan\nrequest tainan 5\nrequest taipei 9\nrequest taichung 5\nserve\nserve\nreport', output: 'Yes\nNo\ntaipei 9\ntainan 5\nNetworks 2\nServed tainan=1 taipei=1', note: 'taipei 與 taichung 相連；tainan 與 taichung 同為 5，tainan 先提出所以先處理；報表依名稱排序' }],
      tests: [
        { kind: 'normal', input: '12\nadd taipei\nadd taichung\nadd tainan\nlink taipei taichung\nsame taipei taichung\nsame taipei tainan\nrequest tainan 5\nrequest taipei 9\nrequest taichung 5\nserve\nserve\nreport', output: 'Yes\nNo\ntaipei 9\ntainan 5\nNetworks 2\nServed tainan=1 taipei=1', note: '範例：連通、同分先到先處理、排序報表' },
        { kind: 'normal', input: '10\nadd a\nadd b\nadd c\nadd d\nlink a b\nlink c d\nsame a d\nlink b c\nsame a d\nreport', output: 'No\nYes\nNetworks 1\nServed none', note: '遞移連通：b 與 c 相連後 a 與 d 才連通' },
        { kind: 'normal', input: '11\nadd x\nadd y\nrequest x 3\nrequest y 7\nrequest x 7\nrequest x 1\nserve\nserve\nserve\nserve\nreport', output: 'y 7\nx 7\nx 3\nx 1\nNetworks 2\nServed x=3 y=1', note: 'y 7 與 x 7 同分，y 先提出；同一座城市被修三次' },
        { kind: 'edge', input: '3\nreport\nadd solo\nreport', output: 'Networks 0\nServed none\nNetworks 1\nServed none', note: '沒有城市與沒有修復時的報表' },
        { kind: 'edge', input: '7\nadd a\nadd b\nlink a a\nreport\nlink a b\nlink b a\nreport', output: 'Networks 2\nServed none\nNetworks 1\nServed none', note: '自己連自己、重複連線，網路數不能被多減' },
        { kind: 'edge', input: '7\nadd serve\nrequest serve 1\nrequest serve 1000000000\nrequest serve 0005\nserve\nserve\nserve', output: 'serve 1000000000\nserve 5\nserve 1', note: '城市名稱剛好是 serve；優先度 1、10⁹ 與前導零 0005' },
        { kind: 'edge', input: '4\nadd   a\n  add b  \n\tlink a\tb\nsame a b', output: 'Yes', note: '多餘的空白與 Tab' },
        { kind: 'error', input: '7\nfly away\nserve now\nlink a\n\nSERVE\nadd\nadd a b', output: 'Invalid\nInvalid\nInvalid\nInvalid\nInvalid\nInvalid\nInvalid', note: '未知指令、參數數量不對、空行、大小寫不符' },
        { kind: 'error', input: '8\nadd a\nrequest a 0\nrequest a -3\nrequest a 1000000001\nrequest a 5x\nrequest a 3.5\nrequest ghost 0\nrequest zz 5', output: 'Invalid\nInvalid\nInvalid\nInvalid\nInvalid\nInvalid\nError', note: '優先度 0、負數、超過 10⁹、含字母、小數都是 Invalid；Invalid 比 Error 先判斷；未知城市 Error' },
        { kind: 'error', input: '7\nadd a\nadd a\nsame a b\nlink b a\nrequest b 2\nadd b\nsame a b', output: 'Error\nError\nError\nError\nNo', note: '重複 add 與未加入的城市都是 Error，且不改變狀態' },
        { kind: 'error', input: '5\nserve\nadd a\nrequest a 2\nserve\nserve', output: 'Empty\na 2\nEmpty', note: '空的請求佇列 serve 輸出 Empty' },
      ],
      hints: [
        '階段一：先寫「以空白切開 → 查參數數量表 → 檢查優先度字元與範圍」的解析，單獨用 Invalid 的測資測它。',
        '階段二：用雜湊表把名稱換成 0、1、2… 的編號，並用動態陣列存「編號 → 名稱」；之後的結構都只處理整數編號。',
        '階段三：並查集的 parent、size 隨 add 一起長大；網路數在 add 時加 1，只有合併兩個不同的根時減 1。find 用迴圈寫。',
        '階段四：堆積元素存（優先度, 到達序號, 城市編號），讓「大的先、同分先到」由比較規則決定；serve 前先檢查是否為空。',
        '階段五：修復次數用有序 map，或用雜湊表但輸出前排序鍵；所有輸出先放進緩衝區，最後一次印出。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <map>
#include <queue>
#include <sstream>
#include <string>
#include <tuple>
#include <unordered_map>
#include <utility>
#include <vector>

std::vector<int> parent, sz;

int find(int x) {
    int root = x;
    while (parent[root] != root) root = parent[root];
    while (parent[x] != root) {  // 路徑壓縮：沿路的節點直接指向根
        int next = parent[x];
        parent[x] = root;
        x = next;
    }
    return root;
}

bool isPriority(const std::string& s) {
    if (s.empty() || s.size() > 10) return false;
    for (char c : s) if (c < '0' || c > '9') return false;
    long long v = std::stoll(s);
    return v >= 1 && v <= 1000000000;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    const std::map<std::string, std::size_t> arity = {
        {"add", 2}, {"link", 3}, {"same", 3}, {"request", 3}, {"serve", 1}, {"report", 1}};
    std::unordered_map<std::string, int> ids;                    // 城市名稱 → 編號
    std::vector<std::string> names;                              // 編號 → 城市名稱
    std::priority_queue<std::tuple<long long, int, int>> heap;   // (優先度, -到達序號, 城市編號)
    std::map<std::string, int> served;                           // 有序 map：走訪時已依名稱排好
    std::string line, out;
    int networks = 0;
    std::getline(std::cin, line);
    int q = std::stoi(line);
    for (int i = 1; i <= q; ++i) {
        if (!std::getline(std::cin, line)) line.clear();
        std::istringstream in(line);
        std::vector<std::string> w;
        for (std::string t; in >> t;) w.push_back(t);
        auto it = w.empty() ? arity.end() : arity.find(w[0]);
        if (it == arity.end() || w.size() != it->second || (w[0] == "request" && !isPriority(w[2]))) {
            out += "Invalid\n";
            continue;
        }
        const std::string& cmd = w[0];
        if (cmd == "add") {
            if (ids.count(w[1])) { out += "Error\n"; continue; }
            ids[w[1]] = static_cast<int>(names.size());
            names.push_back(w[1]);
            parent.push_back(static_cast<int>(parent.size()));  // 自己是自己的根
            sz.push_back(1);
            ++networks;
        } else if (cmd == "link" || cmd == "same") {
            if (!ids.count(w[1]) || !ids.count(w[2])) { out += "Error\n"; continue; }
            int a = find(ids[w[1]]), b = find(ids[w[2]]);
            if (cmd == "same") {
                out += (a == b ? "Yes\n" : "No\n");
            } else if (a != b) {
                if (sz[a] < sz[b]) std::swap(a, b);
                parent[b] = a;
                sz[a] += sz[b];
                --networks;
            }
        } else if (cmd == "request") {
            if (!ids.count(w[1])) { out += "Error\n"; continue; }
            heap.emplace(std::stoll(w[2]), -i, ids[w[1]]);
        } else if (cmd == "serve") {
            if (heap.empty()) { out += "Empty\n"; continue; }
            long long p = std::get<0>(heap.top());
            int c = std::get<2>(heap.top());
            heap.pop();
            out += names[c] + " " + std::to_string(p) + "\n";
            ++served[names[c]];
        } else {  // report
            out += "Networks " + std::to_string(networks) + "\nServed";
            if (served.empty()) out += " none";
            for (const auto& [name, k] : served) out += " " + name + "=" + std::to_string(k);
            out += "\n";
        }
    }
    std::cout << out;
    return 0;
}`,
        Python: code`import heapq
import sys

ARITY = {"add": 2, "link": 3, "same": 3, "request": 3, "serve": 1, "report": 1}


def is_priority(s):
    return s.isascii() and s.isdigit() and len(s) <= 10 and 1 <= int(s) <= 10**9


def find(parent, x):
    root = x
    while parent[root] != root:
        root = parent[root]
    while parent[x] != root:  # 路徑壓縮：沿路的節點直接指向根
        nxt = parent[x]
        parent[x] = root
        x = nxt
    return root


def main():
    lines = sys.stdin.read().split("\n")
    q = int(lines[0])
    ids = {}            # 城市名稱 → 編號（雜湊表）
    names = []          # 編號 → 城市名稱
    parent, size = [], []
    networks = 0
    heap = []           # (-優先度, 到達序號, 城市編號)
    served = {}         # 城市名稱 → 已修復次數
    out = []
    for i in range(1, q + 1):
        w = lines[i].split() if i < len(lines) else []
        if not w or len(w) != ARITY.get(w[0], -1) or (w[0] == "request" and not is_priority(w[2])):
            out.append("Invalid")
            continue
        cmd = w[0]
        if cmd == "add":
            if w[1] in ids:
                out.append("Error")
                continue
            ids[w[1]] = len(names)
            names.append(w[1])
            parent.append(len(parent))
            size.append(1)
            networks += 1
        elif cmd in ("link", "same"):
            if w[1] not in ids or w[2] not in ids:
                out.append("Error")
                continue
            a, b = find(parent, ids[w[1]]), find(parent, ids[w[2]])
            if cmd == "same":
                out.append("Yes" if a == b else "No")
            elif a != b:
                if size[a] < size[b]:
                    a, b = b, a
                parent[b] = a
                size[a] += size[b]
                networks -= 1
        elif cmd == "request":
            if w[1] not in ids:
                out.append("Error")
                continue
            heapq.heappush(heap, (-int(w[2]), i, ids[w[1]]))
        elif cmd == "serve":
            if not heap:
                out.append("Empty")
                continue
            neg_p, _, c = heapq.heappop(heap)
            out.append(f"{names[c]} {-neg_p}")
            served[names[c]] = served.get(names[c], 0) + 1
        else:  # report：雜湊表沒有順序，先排序再輸出
            out.append(f"Networks {networks}")
            items = " ".join(f"{n}={served[n]}" for n in sorted(served))
            out.append("Served " + (items if items else "none"))
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.TreeMap;

public class Main {
    static int[] parent, size;

    static int find(int x) {
        int root = x;
        while (parent[root] != root) root = parent[root];
        while (parent[x] != root) {  // 路徑壓縮：沿路的節點直接指向根
            int next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    }

    static boolean isPriority(String s) {
        if (s.isEmpty() || s.length() > 10) return false;
        for (char c : s.toCharArray()) if (c < '0' || c > '9') return false;
        long v = Long.parseLong(s);
        return v >= 1 && v <= 1_000_000_000L;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int q = Integer.parseInt(br.readLine().trim());
        Map<String, Integer> arity = Map.of("add", 2, "link", 3, "same", 3, "request", 3, "serve", 1, "report", 1);
        Map<String, Integer> ids = new HashMap<>();      // 城市名稱 → 編號
        List<String> names = new ArrayList<>();          // 編號 → 城市名稱
        parent = new int[q];
        size = new int[q];
        // {優先度, 到達序號, 城市編號}：優先度大的先，相同時到達序號小的先
        PriorityQueue<long[]> heap = new PriorityQueue<>((x, y) -> x[0] != y[0] ? Long.compare(y[0], x[0]) : Long.compare(x[1], y[1]));
        Map<String, Integer> served = new TreeMap<>();   // 有序 map：走訪時已依名稱排好
        StringBuilder out = new StringBuilder();
        int networks = 0;
        for (int i = 1; i <= q; ++i) {
            String line = br.readLine();
            String t = line == null ? "" : line.trim();
            String[] w = t.isEmpty() ? new String[0] : t.split("\\s+");
            Integer need = w.length == 0 ? null : arity.get(w[0]);
            if (need == null || w.length != need || (w[0].equals("request") && !isPriority(w[2]))) {
                out.append("Invalid\n");
                continue;
            }
            String cmd = w[0];
            if (cmd.equals("add")) {
                if (ids.containsKey(w[1])) { out.append("Error\n"); continue; }
                int id = names.size();
                ids.put(w[1], id);
                names.add(w[1]);
                parent[id] = id;  // 自己是自己的根
                size[id] = 1;
                ++networks;
            } else if (cmd.equals("link") || cmd.equals("same")) {
                Integer ia = ids.get(w[1]), ib = ids.get(w[2]);
                if (ia == null || ib == null) { out.append("Error\n"); continue; }
                int a = find(ia), b = find(ib);
                if (cmd.equals("same")) {
                    out.append(a == b ? "Yes\n" : "No\n");
                } else if (a != b) {
                    if (size[a] < size[b]) { int tmp = a; a = b; b = tmp; }
                    parent[b] = a;
                    size[a] += size[b];
                    --networks;
                }
            } else if (cmd.equals("request")) {
                Integer c = ids.get(w[1]);
                if (c == null) { out.append("Error\n"); continue; }
                heap.add(new long[]{Long.parseLong(w[2]), i, c});
            } else if (cmd.equals("serve")) {
                if (heap.isEmpty()) { out.append("Empty\n"); continue; }
                long[] r = heap.poll();
                String name = names.get((int) r[2]);
                out.append(name).append(' ').append(r[0]).append('\n');
                served.merge(name, 1, Integer::sum);
            } else {  // report
                out.append("Networks ").append(networks).append("\nServed");
                if (served.isEmpty()) out.append(" none");
                for (Map.Entry<String, Integer> e : served.entrySet()) out.append(' ').append(e.getKey()).append('=').append(e.getValue());
                out.append('\n');
            }
        }
        System.out.print(out);
    }
}`,
      },
      judge: 'none',
    },
  ],
};

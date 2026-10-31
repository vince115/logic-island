import type { LessonContent } from '../schema';

const code = String.raw;

/** D19 資料結構選型與複雜度. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const D19: LessonContent = {
  lessonId: 'D19',
  motivation: '資料結構島前面的課程，一課介紹一種結構：動態陣列、deque、鏈結串列、集合與 map、雜湊表、樹與 BST、堆積、圖與並查集。真正解題時方向反過來：題目只描述「要做哪些事、做幾次」，要由你決定用哪一種，甚至同時用兩三種。排程系統要「隨時取優先度最高、也能取消」，快取要「用鍵查得到、還要記得誰最久沒用」，社群網站要「不斷加好友、問兩人是否連通」，這些都沒有單一結構能全包。這一課給你一套可以照著做的方法：列出操作與次數、查表估總成本、跟時間預算比較，再學幾種常見的結構組合。它的限制是：Big-O 估算只是粗略預測，常數、語言與評測機都會影響實際秒數；而資料量小的時候，最簡單的正確寫法往往就夠了。',
  sections: [
    {
      id: 'method', title: '選型的方法：操作 × 次數 × 單次成本',
      blocks: [
        { type: 'p', text: '選結構前先別急著寫程式，把題目翻譯成「操作清單」。每一行寫下：需要什麼操作（加入、刪除、找最大、依鍵查詢、找比 x 大的最小值……）、這個操作大概做幾次、做的時候結構裡最多有幾個元素。接著照下面的步驟估算。' },
        { type: 'list', ordered: true, items: [
          '列出操作與次數：例如 n 個元素、q 次查詢，或「最多 2×10^5 條指令，每條是 add／serve／cancel 之一」。',
          '對每個候選結構查出每種操作的單次成本（下一節的總表）。',
          '總成本 ≈ 各操作的「次數 × 單次成本」相加。最慢的那一項通常決定一切。',
          '跟時間預算比較：一個常用的粗略經驗法則是「一秒大約能做 10^8 次簡單運算」。這只是經驗法則，不是保證：常數、記憶體存取、語言（Python 的常數明顯比 C++ 大）與評測機都會影響，估出來接近上限時就要留餘裕。',
          '在夠快的候選裡，選最簡單、語言內建的那一個；不夠快時再考慮組合結構。',
        ] },
        { type: 'table', head: ['資料規模（粗估）', '大約可行的複雜度', '估算'], rows: [
          ['n ≤ 20', 'O(2^n)、O(n × 2^n)', '2^20 ≈ 10^6，20 × 2^20 ≈ 2×10^7'],
          ['n ≤ 5000', 'O(n^2)', '5000^2 = 2.5×10^7'],
          ['n ≤ 2×10^5', 'O(n log n)', '2×10^5 × 18 ≈ 3.6×10^6；O(n^2) 是 4×10^10，太慢'],
          ['n ≤ 10^7', 'O(n)', '10^7；Python 這時已經要注意常數'],
        ] },
        { type: 'p', text: '實例：一個叫號系統最多有 q = 2×10^5 條指令，包含加入（帶優先度）、叫號（取優先度最高的）、取消某人。下表比較三種做法的最差總成本。注意「保持排序的 list」雖然叫號很快，但插入時要搬移元素，總成本仍是 O(q^2) 量級。' },
        { type: 'table', head: ['做法', '加入', '叫號', '取消', '最差總成本（q = 2×10^5）'], rows: [
          ['未排序的動態陣列', 'O(1) 攤銷', 'O(n) 掃描', 'O(n) 搜尋＋搬移', 'O(q^2)，約 10^10 量級，太慢'],
          ['保持排序的動態陣列', 'O(n) 搬移', 'O(1)（從尾端取）', 'O(n)', 'O(q^2)，搬移雖然快仍有風險'],
          ['堆積＋雜湊表（延遲刪除）', 'O(log q)', 'O(log q) 攤銷', '平均 O(1)', 'O(q log q)，約 3.6×10^6'],
          ['平衡 BST＋雜湊表', 'O(log q)', 'O(log q)', 'O(log q)', 'O(q log q)；Python 標準庫沒有平衡 BST'],
        ] },
        { type: 'p', text: '同一個題目、同樣的輸出，結構不同成本就不同。下面的範例找出出現次數最多的前 3 個單字（同次數依字典序）：先用雜湊表計數（n 個單字、m 種不同的單字，平均 O(n)），然後做法一把 m 種全部排序 O(m log m)；做法二建一個堆積再取出 k 次，C++ 用區間建構、Python 用 `heapify` 建堆都是 O(m)，每次取出 O(log m)，Java 逐一 `offer` 建堆則是最差 O(m log m)。k 遠小於 m 時，堆積做的事比較少；兩種做法的輸出完全相同。' },
        { type: 'example', id: 'top-k-words' },
      ],
    },
    {
      id: 'big-table', title: '七種結構 × 八種操作總表',
      blocks: [
        { type: 'p', text: '這張表把整座資料結構島濃縮在一起。「不支援」表示標準容器沒有這個操作（硬做就得整個掃過或自己另外維護資料）；「不適用」表示這個結構本來就沒有那個概念，例如雜湊表沒有「前端」。n 是結構中的元素個數。上方的互動比較可以勾選題目需要的操作，看哪些結構全部符合。' },
        { type: 'table', head: ['操作', '動態陣列', 'deque', '鏈結串列', '雜湊表', '平衡 BST', '堆積', '並查集'], rows: [
          ['依索引存取第 k 個', 'O(1)', 'C++ O(1)；Python 中段 O(n)；Java 不支援', 'O(n)', '不支援', 'O(n)（標準容器沒有依名次存取）', '不支援', '不支援'],
          ['尾端加入／移除', 'O(1) 攤銷', 'O(1)', 'O(1)（雙向或有尾指標）', '不適用（無順序）', '不適用（依鍵排序）', '不適用（只有頂端）', '不支援'],
          ['前端加入／移除', 'O(n)', 'O(1)', 'O(1)', '不適用（無順序）', '不適用（依鍵排序）', '不適用（只有頂端）', '不支援'],
          ['插入／刪除指定元素', 'O(n)（搬移）', 'O(n)', 'O(1)（已握有節點）；找到它 O(n)', '平均 O(1)', 'O(log n)', '加入 O(log n)；刪任意元素標準容器不支援', '只能合併，不能刪除'],
          ['依值／依鍵搜尋', 'O(n)；已排序可二分 O(log n)', 'O(n)', 'O(n)', '平均 O(1)，最差 O(n)', 'O(log n)', 'O(n)', '不支援'],
          ['有序走訪、前驅／後繼', '已排序時二分 O(log n)，但維持排序的插入 O(n)', 'O(n)（需掃描）', 'O(n)', '不支援（無順序）', 'O(log n)', '不支援（只知頂端）', '不支援'],
          ['取得／取出最小值', 'O(n)', 'O(n)', 'O(n)', 'O(n)', 'O(log n)', '查看 O(1)、取出 O(log n)', '不支援'],
          ['合併群組、判斷同群組', '標籤陣列：查 O(1)、合併 O(n)', '不支援', '串接 O(1)、查同群 O(n)', '查平均 O(1)、合併 O(n)', '不支援', '不支援', 'O(α(n)) 攤銷（近乎常數）'],
        ] },
        { type: 'list', items: [
          '動態陣列（D02）：索引與尾端最強，中間與前端要搬移。需要「兩端」改用 deque（D07）。',
          '鏈結串列（D04）：「已握有節點」時插入刪除 O(1)，但找到節點要 O(n)，所以常和雜湊表搭配（見後面的 LRU）。',
          '雜湊表（D08、D09、D10）：依鍵查詢、加入、刪除平均 O(1)，代價是沒有順序。',
          '平衡 BST（D14 的 BST 加上自動平衡）：C++ `std::set`／`std::map`、Java `TreeSet`／`TreeMap`。每樣都 O(log n)，而且多了有序走訪與 `lower_bound`／`ceiling`，是「需要順序」時的首選。',
          '堆積（D15）：只照顧最小（或最大）值；要刪除任意元素或改優先度，標準容器做不到，需要延遲刪除等技巧。',
          '並查集（D18）：只回答「兩個元素是否同一組」與「把兩組合併」，路徑壓縮加按大小合併後近乎常數；不能拆開群組。',
        ] },
        { type: 'callout', tone: 'tip', title: '先找「最難的那個操作」', text: '大多數題目只有一兩個操作決定結構：要「比 x 大的最小值」就需要有序結構（平衡 BST 或排序後二分）；要「隨時取最大」就是堆積或平衡 BST；要「依名字查」就是雜湊表或 map。先用最難的操作淘汰候選，再檢查其他操作是否也夠快。' },
      ],
    },
    {
      id: 'cost-kinds', title: '攤銷、平均、最差：三種「快」不一樣',
      blocks: [
        { type: 'p', text: '表裡同樣寫 O(1) 或 O(log n)，背後的保證可能差很多。最差情況（worst case）是每一次操作都保證不超過；攤銷（amortized）是「一整串操作的總成本」除以次數，個別某一次可能很貴，但總量有保證；平均（average）是在資料分布良好的假設下的期望值，遇到特別構造的輸入可能退化。' },
        { type: 'table', head: ['說法', '例子', '為什麼會不同', '保證到什麼程度'], rows: [
          ['O(1) 攤銷', '動態陣列尾端加入（D02）', '容量用完時那一次要把 n 個元素搬到新空間；翻倍擴容讓總搬移量小於 2n', '對任何操作序列都成立，但單次可能 O(n)'],
          ['平均 O(1)，最差 O(n)', '雜湊表查詢（D10）', '鍵都碰撞到同一個桶時，查詢要走整條鏈', '依賴雜湊函數與負載因子；刻意構造的輸入可能讓它退化'],
          ['平均 O(log n)，最差 O(n)', '沒有自動平衡的 BST（D14）', '依序插入 1, 2, …, n 會長成一條鏈，高度變成 n', '`std::set`／`TreeMap` 用紅黑樹自動平衡，最差也是 O(log n)'],
          ['O(α(n)) 攤銷', '並查集（D18）', '沒做路徑壓縮與按大小合併時，樹可能長成一條鏈，find 變 O(n)', '兩個優化都做時，一整串操作的總成本近乎線性'],
          ['O(log q) 攤銷', '堆積＋延遲刪除', '取消時不立刻刪除，叫號時才把作廢的資料一筆筆丟掉；某一次可能丟很多筆', '每筆資料最多被放入一次、取出一次，總共 O(q log q)'],
        ] },
        { type: 'callout', tone: 'warning', title: '「O(1)」不代表每一次都 O(1)', text: '`push_back`／`append`／`add` 偶爾會有一次 O(n) 的搬移；雜湊表在大量碰撞時單次會到 O(n)；自己寫的 BST 遇到已排序的輸入會變成鏈。如果題目要的是「每一次都要快」（例如即時系統），或測資可能刻意卡雜湊，就要選最差情況有保證的結構，例如平衡 BST 的 O(log n)。另一個常見錯誤是只看單次成本：每次 `pop(0)`／`erase(begin())` 看起來只是一行，在動態陣列上卻是 O(n)，放進迴圈就變成 O(n^2)。' },
        { type: 'p', text: 'Java 8 起的 `HashMap` 會把碰撞過多的桶改成樹，讓最差情況變成 O(log n)；C++ `unordered_map` 與 Python `dict` 沒有這種保證。這些差異平常感覺不到，但在估算「最差會不會超時」時要記得。' },
      ],
    },
    {
      id: 'combining', title: '組合結構：一種不夠時',
      blocks: [
        { type: 'p', text: '題目的操作一多，常常沒有單一結構能全部做快。常見的解法是讓兩個結構分工：一個負責「依鍵找到東西」（通常是雜湊表），另一個負責「維持某種順序」（堆積、鏈結串列、佇列或平衡 BST），兩邊一起更新。' },
        { type: 'list', items: [
          '雜湊表＋堆積（延遲刪除，lazy deletion）：堆積負責「取優先度最高」，但標準堆積不能刪除中間的元素。做法是取消時只在雜湊表裡把它標記為作廢，堆積裡的舊資料先留著；叫號時若堆頂是作廢的，就丟掉再看下一個。本課的練習就是這個組合。',
          '雜湊表＋雙向鏈結串列＝LRU 快取（Least Recently Used）：串列從舊到新排好使用順序，雜湊表把鍵對應到串列中的節點。查詢時用雜湊表 O(1) 找到節點，再 O(1) 把它移到最新端；容量滿了就刪掉最舊端。',
          '佇列＋計數 map：資料流中「目前第一個只出現一次的元素」。佇列依出現順序存放候選，map 記次數；隊頭的次數變成 2 以上就丟掉。每個元素最多進佇列一次、出佇列一次，總共 O(n)。',
          '鄰接串列＋並查集：鄰接串列（D17）適合 BFS／DFS 走訪鄰居、找出路徑；如果只需要回答「加了這些邊之後，兩點是否連通」，並查集（D18）更直接，但它不支援刪邊，也不記得路徑。',
          '兩個堆疊（D05）：復原（undo）堆疊與重做（redo）堆疊。做新動作時要清空 redo 堆疊，否則會重做出不存在的歷史。',
        ] },
        { type: 'example', id: 'lru-cache' },
        { type: 'p', text: '三種語言的 LRU 寫法差很多：C++ 用 `std::list` 加 `unordered_map` 存「指向節點的迭代器」，`splice` 把節點搬到尾端是 O(1)，而且 `std::list` 的迭代器在節點被刪除之前都不會失效；如果換成 `std::vector` 存位置，擴容或搬移之後存起來的位置就錯了。Python 的 `collections.OrderedDict` 內部就是雜湊表加雙向鏈結串列，`move_to_end` 與 `popitem(last=False)` 都是 O(1)。Java 的 `LinkedHashMap` 用建構子的第三個參數 `true` 改成「存取順序」，再覆寫 `removeEldestEntry` 讓它自動淘汰最舊的一筆。' },
        { type: 'example', id: 'first-unique-stream' },
        { type: 'table', head: ['情境', '選用的結構', '理由'], rows: [
          ['復原／重做', '兩個堆疊', '最近的動作最先復原，LIFO 正好符合'],
          ['BFS 的待訪節點', '佇列（`std::queue`／`deque`／`ArrayDeque`）', '先發現的先處理，兩端操作 O(1)'],
          ['依優先度叫號，可以取消', '堆積＋雜湊表（延遲刪除）', '取最高 O(log n)，取消平均 O(1) 記下作廢'],
          ['排行榜依分數排序，找某分數的下一名', '平衡 BST（`std::map`／`TreeMap`）', '有序走訪與 `upper_bound`／`higher` 都是 O(log n)'],
          ['快取：容量滿時淘汰最久沒用的', '雜湊表＋雙向鏈結串列', '查找與「移到最新」都是 O(1)'],
          ['不斷加邊，問兩點是否連通', '並查集', '合併與查詢近乎 O(1) 攤銷；不能刪邊'],
          ['滑動視窗最大值', '單調 deque（D07）', '每個元素進出各一次，總共 O(n)'],
        ] },
        { type: 'callout', tone: 'note', title: '組合結構要一起維護', text: '兩個結構描述的是同一批資料，每個操作都要想清楚兩邊各要改什麼。延遲刪除時，堆積裡同時有有效與作廢的資料，所以「目前有幾筆」要看雜湊表的大小，不能看堆積的大小；同一個名字取消後又重新加入，堆積裡會有新舊兩筆，要用加入的序號（時間戳記）分辨哪一筆才有效。' },
      ],
    },
    {
      id: 'languages', title: '三種語言的容器速查、順序保證與空間',
      blocks: [
        { type: 'table', head: ['需求', 'C++17', 'Python 3', 'Java 17'], rows: [
          ['動態陣列', '`std::vector`', '`list`', '`ArrayList`（基本型別用 `int[]`）'],
          ['兩端操作／佇列', '`std::deque`、`std::queue`', '`collections.deque`', '`ArrayDeque`'],
          ['雜湊集合／對照表', '`std::unordered_set`／`std::unordered_map`', '`set`／`dict`', '`HashSet`／`HashMap`'],
          ['有序集合／對照表', '`std::set`／`std::map`（可重複用 `multiset`）', '標準庫沒有；已排序 `list`＋`bisect`（插入 O(n)）', '`TreeSet`／`TreeMap`'],
          ['堆積（優先佇列）', '`std::priority_queue`（預設最大在頂）', '`heapq`（操作 `list`，最小在頂）', '`PriorityQueue`（預設最小在頂）'],
          ['保留插入順序的對照表', '沒有（`std::map` 依鍵排序）', '`dict`（3.7 起保證插入順序）', '`LinkedHashMap`（插入或存取順序）'],
          ['雙向鏈結串列', '`std::list`', '沒有通用的串列類別；依用途用 `deque` 或 `OrderedDict`', '`LinkedList`'],
          ['並查集', '自己用 `std::vector<int>` 寫', '自己用 `list` 寫', '自己用 `int[]` 寫'],
        ] },
        { type: 'p', text: 'Python 標準庫沒有平衡 BST。常見替代是維持一個已排序的 `list`，用 `bisect_left`／`bisect_right` 在 O(log n) 內找到位置；但 `insort` 插入與 `pop(i)` 刪除要搬移後面的元素，是 O(n)。插入刪除次數不多、或資料可以一次排好時很好用；大量混合插入與有序查詢時，要估算 O(n) 的搬移是否撐得住。下面的範例替每個物品找「容量 ≥ 物品大小的最小箱子」，用完就移除，三種語言各用自己的有序工具。' },
        { type: 'example', id: 'smallest-at-least' },
        { type: 'p', text: '走訪順序的保證也不同，會直接影響輸出是否固定：C++ `std::map`／`std::set` 依鍵由小到大，`unordered_*` 的順序未規定、重新雜湊後還可能改變；Python `dict` 依插入順序，`set` 沒有順序；Java `TreeMap` 依鍵排序，`LinkedHashMap` 依插入（或存取）順序，`HashMap`／`HashSet` 沒有規定順序。題目要求固定順序輸出時，要嘛選有序結構，要嘛輸出前先排序。' },
        { type: 'p', text: '空間也是選型的一部分。鄰接矩陣（D17）需要 n^2 格：n = 10^5 時是 10^10 格，無論如何放不下，而鄰接串列只要 O(n + m)。Java 的 `ArrayList<Integer>`、`HashMap<Integer, Integer>` 存的是指向 `Integer` 物件的參考，每個元素都多了物件標頭與參考，記憶體是 `int[]` 的好幾倍；Python 的整數也都是物件。延遲刪除的堆積會留著作廢的資料，最多存放「加入的總次數」筆，而不是「目前有效的筆數」。' },
        { type: 'callout', tone: 'warning', title: '組合結構時小心失效的位置', text: '把「位置」存進另一個結構前，先確認它會不會失效。C++ `std::vector` 擴容後，之前存下的迭代器、指標與參考全部失效；`unordered_map` 重新雜湊會讓迭代器失效（但指向元素的指標與參考仍有效）；`std::list` 與 `std::map` 的迭代器只有在那個元素被刪除時才失效。Python 與 Java 在走訪 `dict`／`HashMap` 的同時新增或刪除鍵，會丟出 `RuntimeError`／`ConcurrentModificationException`。' },
      ],
    },
  ],
  examples: [
    {
      id: 'top-k-words', title: '前 3 個最常出現的單字：排序與堆積',
      description: '先用雜湊表計數，再用兩種方式取出前 3 名（次數多的先，同次數依字典序）：全部排序，或建堆積後取 3 次。輸出相同，成本不同。',
      stdin: '10\nb a c b a d b c e a',
      output: 'sort: a=3 b=3 c=2\nheap: a=3 b=3 c=2',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <queue>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

using Item = std::pair<int, std::string>;  // (次數, 單字)

// a 排在 b 前面：次數多的先，同次數時字典序小的先
bool before(const Item& a, const Item& b) {
    return a.first != b.first ? a.first > b.first : a.second < b.second;
}

int main() {
    int n;
    const int k = 3;
    std::cin >> n;
    std::unordered_map<std::string, int> count;
    for (int i = 0; i < n; ++i) { std::string w; std::cin >> w; ++count[w]; }
    std::vector<Item> items;
    for (const auto& [w, c] : count) items.push_back({c, w});

    std::vector<Item> sorted = items;                 // 做法一：全部排序 O(m log m)
    std::sort(sorted.begin(), sorted.end(), before);
    std::cout << "sort:";
    for (int i = 0; i < k && i < static_cast<int>(sorted.size()); ++i) std::cout << " " << sorted[i].second << "=" << sorted[i].first;

    auto worse = [](const Item& a, const Item& b) { return before(b, a); };
    std::priority_queue<Item, std::vector<Item>, decltype(worse)> heap(worse, items);  // 做法二：建堆 O(m)
    std::cout << "\nheap:";
    for (int i = 0; i < k && !heap.empty(); ++i) {
        std::cout << " " << heap.top().second << "=" << heap.top().first;
        heap.pop();                                    // 每次 O(log m)
    }
    std::cout << "\n";
    return 0;
}`,
        Python: code`import heapq
from collections import Counter

n = int(input())
count = Counter(input().split()[:n])
k = 3
ranked = sorted(count.items(), key=lambda kv: (-kv[1], kv[0]))  # 做法一：全部排序 O(m log m)
print("sort:", *(f"{w}={c}" for w, c in ranked[:k]))

heap = [(-c, w) for w, c in count.items()]  # 做法二：heapify 建堆 O(m)
heapq.heapify(heap)
top = [heapq.heappop(heap) for _ in range(min(k, len(heap)))]  # 每次 O(log m)
print("heap:", *(f"{w}={-c}" for c, w in top))`,
        Java: code`import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), k = 3;
        HashMap<String, Integer> count = new HashMap<>();
        for (int i = 0; i < n; i++) count.merge(sc.next(), 1, Integer::sum);
        // 次數多的先，同次數時字典序小的先
        Comparator<Map.Entry<String, Integer>> order = (a, b) ->
            !a.getValue().equals(b.getValue()) ? b.getValue() - a.getValue() : a.getKey().compareTo(b.getKey());

        List<Map.Entry<String, Integer>> sorted = new ArrayList<>(count.entrySet());  // 做法一：O(m log m)
        sorted.sort(order);
        StringBuilder sb = new StringBuilder("sort:");
        for (int i = 0; i < k && i < sorted.size(); i++) sb.append(" ").append(sorted.get(i).getKey()).append("=").append(sorted.get(i).getValue());

        PriorityQueue<Map.Entry<String, Integer>> heap = new PriorityQueue<>(order);  // 做法二
        heap.addAll(count.entrySet());                 // 逐一 offer，最差 O(m log m)
        sb.append("\nheap:");
        for (int i = 0; i < k && !heap.isEmpty(); i++) {
            Map.Entry<String, Integer> e = heap.poll();  // 每次 O(log m)
            sb.append(" ").append(e.getKey()).append("=").append(e.getValue());
        }
        System.out.println(sb);
    }
}`,
      },
    },
    {
      id: 'lru-cache', title: 'LRU 快取：雜湊表＋雙向鏈結串列',
      description: '容量 2 的快取：依序 put(1,10)、put(2,20)、get(1)、put(3,30)（淘汰最久沒用的 2）、get(2)、get(3)、put(4,40)（淘汰 1）、get(1)、get(3)、get(4)，最後由舊到新列出剩下的鍵。',
      output: 'get: 10 -1 30 -1 30 40\norder: 3 4',
      code: {
        'C++': code`#include <iostream>
#include <list>
#include <unordered_map>
#include <utility>

struct LRU {
    std::size_t cap;
    std::list<std::pair<int, int>> order;  // (鍵, 值)，前端最舊、尾端最新
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> where;
    explicit LRU(std::size_t c) : cap(c) {}
    int get(int key) {
        auto it = where.find(key);
        if (it == where.end()) return -1;
        order.splice(order.end(), order, it->second);  // O(1) 移到最新端，迭代器仍有效
        return it->second->second;
    }
    void put(int key, int value) {
        if (where.count(key)) { get(key); order.back().second = value; return; }
        if (order.size() == cap) { where.erase(order.front().first); order.pop_front(); }  // 淘汰最舊
        order.emplace_back(key, value);
        where[key] = --order.end();
    }
};

int main() {
    LRU cache(2);
    cache.put(1, 10); cache.put(2, 20);
    std::cout << "get: " << cache.get(1);
    cache.put(3, 30);
    std::cout << " " << cache.get(2);
    std::cout << " " << cache.get(3);
    cache.put(4, 40);
    std::cout << " " << cache.get(1);
    std::cout << " " << cache.get(3);
    std::cout << " " << cache.get(4) << "\norder:";
    for (const auto& [key, value] : cache.order) std::cout << " " << key;
    std::cout << "\n";
    return 0;
}`,
        Python: code`from collections import OrderedDict

class LRU:
    def __init__(self, cap):
        self.cap = cap
        self.data = OrderedDict()  # 前端最舊、尾端最新

    def get(self, key):
        if key not in self.data:
            return -1
        self.data.move_to_end(key)  # O(1) 移到最新端
        return self.data[key]

    def put(self, key, value):
        if key in self.data:
            self.data.move_to_end(key)
        elif len(self.data) == self.cap:
            self.data.popitem(last=False)  # 淘汰最舊
        self.data[key] = value

cache = LRU(2)
cache.put(1, 10); cache.put(2, 20)
got = [cache.get(1)]
cache.put(3, 30)
got += [cache.get(2), cache.get(3)]
cache.put(4, 40)
got += [cache.get(1), cache.get(3), cache.get(4)]
print("get:", *got)
print("order:", *cache.data)`,
        Java: code`import java.util.LinkedHashMap;
import java.util.Map;

public class Main {
    static final int CAP = 2;
    // 第三個參數 true：依「存取順序」排列，最舊的在前面
    static final LinkedHashMap<Integer, Integer> cache = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) {
            return size() > CAP;  // 超過容量就淘汰最舊的一筆
        }
    };

    static int get(int key) {
        Integer v = cache.get(key);  // get 也算一次存取，會移到最新端
        return v == null ? -1 : v;
    }

    public static void main(String[] args) {
        cache.put(1, 10); cache.put(2, 20);
        StringBuilder sb = new StringBuilder("get: ").append(get(1));
        cache.put(3, 30);
        sb.append(" ").append(get(2)).append(" ").append(get(3));
        cache.put(4, 40);
        sb.append(" ").append(get(1)).append(" ").append(get(3)).append(" ").append(get(4));
        sb.append("\norder:");
        for (int key : cache.keySet()) sb.append(" ").append(key);
        System.out.println(sb);
    }
}`,
      },
    },
    {
      id: 'first-unique-stream', title: '資料流中第一個不重複的字元：佇列＋計數 map',
      description: '一個字元一個字元讀入，每讀一個就輸出「到目前為止第一個只出現一次的字元」，沒有就輸出 -。',
      stdin: 'aabcbd',
      output: 'a - b b c c',
      code: {
        'C++': code`#include <iostream>
#include <queue>
#include <string>
#include <unordered_map>

int main() {
    std::string s;
    std::cin >> s;
    std::unordered_map<char, int> count;
    std::queue<char> candidates;  // 出現過一次的候選，依出現先後排隊
    std::string out;
    for (char ch : s) {
        if (++count[ch] == 1) candidates.push(ch);
        while (!candidates.empty() && count[candidates.front()] > 1) candidates.pop();  // 不再唯一就丟掉
        out += candidates.empty() ? '-' : candidates.front();
        out += ' ';
    }
    out.pop_back();
    std::cout << out << "\n";
    return 0;
}`,
        Python: code`from collections import deque

s = input().strip()
count = {}
candidates = deque()  # 出現過一次的候選，依出現先後排隊
out = []
for ch in s:
    count[ch] = count.get(ch, 0) + 1
    if count[ch] == 1:
        candidates.append(ch)
    while candidates and count[candidates[0]] > 1:  # 不再唯一就丟掉
        candidates.popleft()
    out.append(candidates[0] if candidates else "-")
print(" ".join(out))`,
        Java: code`import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        String s = new Scanner(System.in).next();
        HashMap<Character, Integer> count = new HashMap<>();
        ArrayDeque<Character> candidates = new ArrayDeque<>();  // 出現過一次的候選
        StringBuilder out = new StringBuilder();
        for (char ch : s.toCharArray()) {
            if (count.merge(ch, 1, Integer::sum) == 1) candidates.addLast(ch);
            while (!candidates.isEmpty() && count.get(candidates.peekFirst()) > 1) candidates.pollFirst();
            if (out.length() > 0) out.append(' ');
            out.append(candidates.isEmpty() ? '-' : candidates.peekFirst());
        }
        System.out.println(out);
    }
}`,
      },
    },
    {
      id: 'smallest-at-least', title: '找「≥ x 的最小值」：lower_bound、bisect、ceiling',
      description: '箱子容量為 3、8、15、20。物品依序是 8、1、16、9、21，每個物品放進容量 ≥ 它的最小箱子，用過的箱子移除。',
      output: '8 -> 8\n1 -> 3\n16 -> 20\n9 -> 15\n21 -> none',
      code: {
        'C++': code`#include <iostream>
#include <set>

int main() {
    std::set<int> boxes = {3, 8, 15, 20};
    for (int item : {8, 1, 16, 9, 21}) {
        auto it = boxes.lower_bound(item);  // 第一個 >= item 的箱子，O(log n)
        if (it == boxes.end()) {
            std::cout << item << " -> none\n";
        } else {
            std::cout << item << " -> " << *it << "\n";
            boxes.erase(it);  // 用掉就移除
        }
    }
    return 0;
}`,
        Python: code`from bisect import bisect_left

boxes = [3, 8, 15, 20]  # 必須保持排序
for item in [8, 1, 16, 9, 21]:
    i = bisect_left(boxes, item)  # 第一個 >= item 的位置，O(log n)
    if i == len(boxes):
        print(item, "-> none")
    else:
        print(item, "->", boxes.pop(i))  # pop(i) 要搬移後面的元素，O(n)`,
        Java: code`import java.util.List;
import java.util.TreeSet;

public class Main {
    public static void main(String[] args) {
        TreeSet<Integer> boxes = new TreeSet<>(List.of(3, 8, 15, 20));
        for (int item : new int[]{8, 1, 16, 9, 21}) {
            Integer box = boxes.ceiling(item);  // 最小的 >= item，O(log n)；沒有就是 null
            if (box == null) {
                System.out.println(item + " -> none");
            } else {
                System.out.println(item + " -> " + box);
                boxes.remove(box);  // 用掉就移除，O(log n)
            }
        }
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'ds-comparison', title: '勾選題目需要的操作：七種結構的成本總覽',
    operations: [
      { id: 'index', label: '依索引存取第 k 個' },
      { id: 'back', label: '尾端加入／移除' },
      { id: 'front', label: '前端加入／移除' },
      { id: 'insert', label: '插入／刪除指定元素' },
      { id: 'search', label: '依值／依鍵搜尋' },
      { id: 'ordered', label: '有序走訪、前驅／後繼' },
      { id: 'min', label: '取得／取出最小值' },
      { id: 'group', label: '合併群組、判斷同群組' },
    ],
    structures: [
      { name: '動態陣列', note: '`std::vector`／`list`／`ArrayList`：連續儲存，索引與尾端最快，中間與前端要搬移。', costs: {
        index: { cost: 'O(1)', good: true }, back: { cost: 'O(1) 攤銷', good: true }, front: { cost: 'O(n)', good: false },
        insert: { cost: 'O(n)（搬移）', good: false }, search: { cost: 'O(n)；已排序可二分 O(log n)', good: false },
        ordered: { cost: '已排序時二分 O(log n)，但維持排序的插入 O(n)', good: false }, min: { cost: 'O(n)', good: false },
        group: { cost: '標籤陣列：查 O(1)、合併 O(n)', good: false } } },
      { name: 'deque', note: '`std::deque`／`collections.deque`／`ArrayDeque`：兩端都 O(1)；Java 沒有索引存取，Python 中段索引 O(n)。', costs: {
        index: { cost: 'C++ O(1)；Python 中段 O(n)；Java 不支援', good: false }, back: { cost: 'O(1)', good: true }, front: { cost: 'O(1)', good: true },
        insert: { cost: 'O(n)', good: false }, search: { cost: 'O(n)', good: false }, ordered: { cost: 'O(n)（需掃描）', good: false },
        min: { cost: 'O(n)', good: false }, group: { cost: '不支援', good: false } } },
      { name: '鏈結串列', note: '`std::list`／`LinkedList`：握有節點時插入刪除 O(1)，但找節點要從頭走；常與雜湊表搭配（LRU）。', costs: {
        index: { cost: 'O(n)', good: false }, back: { cost: 'O(1)（雙向或有尾指標）', good: true }, front: { cost: 'O(1)', good: true },
        insert: { cost: 'O(1)（已握有節點）；找到它 O(n)', good: true }, search: { cost: 'O(n)', good: false },
        ordered: { cost: 'O(n)', good: false }, min: { cost: 'O(n)', good: false }, group: { cost: '串接 O(1)、查同群 O(n)', good: false } } },
      { name: '雜湊表', note: '`unordered_map`／`dict`／`HashMap`：依鍵操作平均 O(1)，沒有順序；碰撞集中時會退化。', costs: {
        index: { cost: '不支援', good: false }, back: { cost: '不適用（無順序）', good: false }, front: { cost: '不適用（無順序）', good: false },
        insert: { cost: '平均 O(1)', good: true }, search: { cost: '平均 O(1)，最差 O(n)', good: true },
        ordered: { cost: '不支援（無順序）', good: false }, min: { cost: 'O(n)', good: false }, group: { cost: '查平均 O(1)、合併 O(n)', good: false } } },
      { name: '平衡 BST', note: '`std::set`／`std::map`／`TreeMap`：保持排序，各操作 O(log n)；Python 標準庫沒有，用已排序 `list`＋`bisect` 代替。', costs: {
        index: { cost: 'O(n)（標準容器沒有依名次存取）', good: false }, back: { cost: '不適用（依鍵排序）', good: false }, front: { cost: '不適用（依鍵排序）', good: false },
        insert: { cost: 'O(log n)', good: true }, search: { cost: 'O(log n)', good: true }, ordered: { cost: 'O(log n)', good: true },
        min: { cost: 'O(log n)', good: true }, group: { cost: '不支援', good: false } } },
      { name: '堆積', note: '`priority_queue`／`heapq`／`PriorityQueue`：只照顧頂端；要取消任意元素得搭配雜湊表做延遲刪除。', costs: {
        index: { cost: '不支援', good: false }, back: { cost: '不適用（只有頂端）', good: false }, front: { cost: '不適用（只有頂端）', good: false },
        insert: { cost: '加入 O(log n)；刪任意元素標準容器不支援', good: false }, search: { cost: 'O(n)', good: false },
        ordered: { cost: '不支援（只知頂端）', good: false }, min: { cost: '查看 O(1)、取出 O(log n)', good: true }, group: { cost: '不支援', good: false } } },
      { name: '並查集', note: '自己用陣列寫：只回答「是否同一組」與「合併兩組」，路徑壓縮＋按大小合併後近乎常數；不能拆開。', costs: {
        index: { cost: '不支援', good: false }, back: { cost: '不支援', good: false }, front: { cost: '不支援', good: false },
        insert: { cost: '只能合併，不能刪除', good: false }, search: { cost: '不支援', good: false }, ordered: { cost: '不支援', good: false },
        min: { cost: '不支援', good: false }, group: { cost: 'O(α(n)) 攤銷（近乎常數）', good: true } } },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '要實作一個容量固定的快取：`get(key)` 查值，`put(key, value)` 放入；容量滿時淘汰「最久沒被使用」的那一筆。希望兩個操作都是平均 O(1)，該選哪個組合？',
      options: [
        '雜湊表＋雙向鏈結串列',
        '只用堆積，以「最後使用時間」為優先度',
        '只用動態陣列，每次把用到的元素搬到尾端',
        '平衡 BST，依鍵排序',
      ],
      answer: 0, explanation: '雜湊表把鍵對應到串列節點（O(1) 找到），雙向鏈結串列依使用先後排好，把節點移到最新端、刪掉最舊端都是 O(1)。堆積更新某個鍵的時間戳記需要找到它，標準容器做不到，就算用延遲刪除也是 O(log n)；動態陣列把元素搬到尾端要 O(n)；依鍵排序的 BST 不記錄使用先後，而且每次 O(log n)。',
    },
    {
      id: 'q2', prompt: '下列「情境 → 結構」的配對，哪一個不恰當？',
      options: [
        '復原／重做功能 → 兩個堆疊',
        'BFS 的待訪節點 → 佇列',
        '要由小到大輸出，並且常常找「比 x 大的最小值」→ 雜湊集合',
        '只會加邊，常常問兩點是否連通 → 並查集',
      ],
      answer: 2, explanation: '雜湊集合沒有順序，找「比 x 大的最小值」只能掃過全部元素（O(n)），由小到大輸出也得先排序；應該用平衡 BST（`std::set::upper_bound`、`TreeSet.higher`）或 Python 已排序 `list`＋`bisect_right`。其他三個都是自然的選擇：復原是 LIFO、BFS 是 FIFO、只加邊的連通查詢正是並查集的強項。',
    },
    {
      id: 'q3', prompt: '共 2×10^5 條指令：先 10^5 次加入，再 10^5 次「取出最大值」。某人用未排序的 list，每次取出都掃描所有剩下的元素找最大，再刪掉它。估計總比較次數與結論？',
      options: [
        '約 10^5 次，O(n)，很快',
        '約 1.7×10^6 次，O(n log n)，很快',
        '約 5×10^9 次，O(n^2)；以每秒約 10^8 次的粗估要數十秒，太慢',
        '約 10^20 次，O(n^4)，永遠跑不完',
      ],
      answer: 2, explanation: '第 i 次取出時剩下 10^5 − i + 1 個元素，總共掃描 10^5 + (10^5 − 1) + … + 1 ≈ 10^10 / 2 = 5×10^9 次，是 O(n^2)。用「每秒約 10^8 次」的經驗法則粗估要約 50 秒（實際會因常數與語言不同，但一定太慢）。約 1.7×10^6（10^5 × log₂10^5 ≈ 10^5 × 17）是改用堆積後取出那一半的成本，不是這個做法的。',
    },
    {
      id: 'q4', prompt: '題目：不斷加入整數，每次加入後輸出「目前所有數中比 x 大的最小值」，共 2×10^5 次。某同學用 `unordered_set`／`set`（Python）／`HashSet` 存數字，每次查詢都掃過全部元素。答案正確卻超時，最好的修正是？',
      options: [
        '改用平衡 BST：`std::set::upper_bound`、`TreeSet.higher`；Python 可用已排序 `list`＋`bisect_right`',
        '換一個更好的雜湊函數，查詢就會變成 O(1)',
        '把雜湊表的容量開大一點，減少碰撞',
        '每次查詢前先把集合排序一次',
      ],
      answer: 0, explanation: '問題不在雜湊函數或碰撞，而在雜湊表根本沒有順序：「比 x 大的最小值」只能全部掃過，每次 O(n)，總共 O(n^2)。平衡 BST 保持排序，`upper_bound`／`higher` 是 O(log n)。每次查詢前排序是 O(n log n)，比掃描更慢。Python 的 `bisect_right` 查詢 O(log n)，但 `insort` 插入是 O(n)，估算時要記得。',
    },
    {
      id: 'q5', prompt: '下列關於成本的敘述，哪一個正確？',
      options: [
        '`std::vector::push_back` 每一次呼叫都保證是 O(1)',
        '雜湊表的平均 O(1) 對任何輸入都成立',
        '依序插入 1, 2, …, n 到沒有自動平衡的 BST，之後的搜尋最差會變成 O(n)',
        '「O(1) 攤銷」表示每一次操作都不超過常數時間',
      ],
      answer: 2, explanation: '依序插入讓沒有平衡的 BST 長成一條鏈，高度是 n，搜尋最差 O(n)（D14）。`push_back` 是攤銷 O(1)：擴容的那一次要搬 n 個元素；「攤銷」保證的是一整串操作的總成本，不是每一次都便宜，所以第一和第四項都錯。雜湊表的平均 O(1) 依賴鍵分散得夠均勻，刻意構造的碰撞會讓它退化，所以第二項也錯。',
    },
    {
      id: 'q6', prompt: '下面的程式用堆積＋雜湊表做延遲刪除。它輸出什麼？',
      code: { language: 'Python', text: code`import heapq
heap, active = [], {}
def add(name, p, t):            # t：加入的序號
    active[name] = t
    heapq.heappush(heap, (-p, t, name))
def serve():
    while heap:
        _, t, name = heapq.heappop(heap)
        if active.get(name) == t:   # 只認仍有效、最新的那一筆
            del active[name]
            return name
    return "Empty"
add("a", 5, 0); add("b", 9, 1)
del active["b"]                 # 取消 b，堆積裡的舊資料先不動
add("b", 1, 2); add("c", 5, 3)
print(serve(), serve(), serve(), serve())` },
      options: ['b a c Empty', 'a c b Empty', 'a b c Empty', 'a c Empty Empty'],
      answer: 1, explanation: '堆積依 (-優先度, 序號) 排序。第一次叫號先取出 b(9, 序號 1)，但 `active["b"]` 已經是新的序號 2，這筆作廢、丟掉，再取出 a(5, 序號 0)，有效，輸出 a。接著 c(5, 序號 3) 有效；然後 b(1, 序號 2) 是重新加入的有效那筆；最後堆積空了，輸出 Empty。選 b a c Empty 是忘了檢查作廢；選 a c Empty Empty 是以為取消後再加入的 b 也被丟掉了。',
    },
  ],
  exercises: [
    {
      id: 'e-ticket-system', title: '可取消的優先叫號系統',
      statement: '請模擬一個叫號系統，依序處理 q 條指令。`add name p`：名字為 name、優先度為 p 的人加入等候；如果 name 已經在等候中，輸出 `Duplicate`，並忽略這條指令。`serve`：叫出等候中優先度最高的人並輸出他的名字，他離開等候；優先度相同時，叫最早加入的（以他這一次加入的時間為準）；沒有人等候時輸出 `Empty`。`cancel name`：name 取消並離開等候；name 不在等候中（從沒加入、已被叫號或已取消）時輸出 `Not found`。`count`：輸出目前等候的人數。被叫號或取消的人，之後可以再用 `add` 重新加入。指令最多 2×10^5 條，每次都掃描全部等候者會太慢，請組合結構做到 O(q log q)。',
      inputFormat: '第一行一個整數 q。接下來 q 行，每行一條指令，格式是 `add name p`、`serve`、`cancel name` 或 `count` 之一。',
      outputFormat: '只有下列情況會輸出一行：`serve` 輸出名字或 `Empty`；`count` 輸出人數；重複加入輸出 `Duplicate`；取消不在等候中的人輸出 `Not found`。其他指令不輸出。',
      constraints: ['1 ≤ q ≤ 2×10^5', 'name 由 1～10 個小寫英文字母組成', '0 ≤ p ≤ 10^9', '指令格式保證正確'],
      samples: [
        { kind: 'normal', input: '8\nadd amy 5\nadd bob 7\nadd cat 5\ncount\nserve\nserve\ncancel cat\nserve', output: '3\nbob\namy\nEmpty', note: 'bob 優先度最高；amy 與 cat 同分，amy 較早加入；cat 取消後沒有人了' },
      ],
      tests: [
        { kind: 'normal', input: '8\nadd amy 5\nadd bob 7\nadd cat 5\ncount\nserve\nserve\ncancel cat\nserve', output: '3\nbob\namy\nEmpty', note: '範例' },
        { kind: 'normal', input: '7\nadd a 1\nadd b 3\nadd c 2\ncancel b\nserve\ncount\nserve', output: 'c\n1\na', note: '取消優先度最高的人後，叫號要跳過他' },
        { kind: 'normal', input: '10\nadd kim 4\nadd lee 8\nserve\nadd max 6\nadd ned 8\ncancel kim\ncount\nserve\nserve\nserve', output: 'lee\n2\nned\nmax\nEmpty', note: '加入、叫號、取消交錯' },
        { kind: 'edge', input: '7\nadd amy 9\nadd bob 5\ncancel amy\nadd amy 1\nserve\nserve\ncount', output: 'bob\namy\n0', note: '取消後以較低優先度重新加入：堆積裡舊的 amy(9) 必須作廢' },
        { kind: 'edge', input: '5\nadd d 4\nadd c 4\nadd b 4\nserve\nserve', output: 'd\nc', note: '全部同分：依加入先後，不是依名字' },
        { kind: 'edge', input: '5\nadd amy 2\nserve\nadd amy 3\ncount\nserve', output: 'amy\n1\namy', note: '被叫號後可以再加入' },
        { kind: 'edge', input: '6\nadd x 1000000000\nadd y 0\nadd z 999999999\nserve\nserve\nserve', output: 'x\nz\ny', note: '優先度在範圍的兩端' },
        { kind: 'edge', input: '1\ncount', output: '0', note: '沒有任何人時的 count' },
        { kind: 'error', input: '3\nserve\nadd a 1\nserve', output: 'Empty\na', note: '對空的等候叫號' },
        { kind: 'error', input: '4\nadd a 1\ncancel b\ncancel a\ncancel a', output: 'Not found\nNot found', note: '取消從沒加入的人，以及重複取消' },
        { kind: 'error', input: '4\nadd a 1\nadd a 5\nserve\nserve', output: 'Duplicate\na\nEmpty', note: '重複加入被忽略，a 仍是優先度 1 的那一筆' },
        { kind: 'error', input: '3\nadd a 1\nserve\ncancel a', output: 'a\nNot found', note: '已被叫號的人不能再取消' },
      ],
      hints: [
        '先列出操作：加入、取優先度最高（同分取最早）、刪除任意一人、問人數、檢查名字是否在等候中。沒有單一標準容器能把它們全部做快。',
        '堆積負責「取最高」：存 (優先度, 加入序號, 名字)，讓優先度高的在頂端、同分時序號小的在頂端。用指令的編號當序號就不會重複。',
        '雜湊表記「名字 → 目前有效那一筆的序號」。取消時只從雜湊表刪掉；叫號時若堆頂那筆的序號跟雜湊表對不上（或名字不在表中），就是作廢的，丟掉再看下一筆。',
        '人數是雜湊表的大小，不是堆積的大小。只檢查「名字在不在表中」不夠：取消後重新加入時，堆積裡有新舊兩筆，要比對序號。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <queue>
#include <string>
#include <tuple>
#include <unordered_map>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int q;
    std::cin >> q;
    // (優先度, -序號, 名字)：最大堆積的頂端＝優先度最高、同分時最早加入
    std::priority_queue<std::tuple<long long, int, std::string>> heap;
    std::unordered_map<std::string, int> active;  // 名字 -> 目前有效那一筆的序號
    std::string out;
    for (int seq = 0; seq < q; ++seq) {
        std::string cmd, name;
        std::cin >> cmd;
        if (cmd == "add") {
            long long p;
            std::cin >> name >> p;
            if (active.count(name)) { out += "Duplicate\n"; continue; }
            active[name] = seq;
            heap.emplace(p, -seq, name);
        } else if (cmd == "cancel") {
            std::cin >> name;
            if (active.erase(name) == 0) out += "Not found\n";  // 堆積裡的舊資料之後再丟
        } else if (cmd == "serve") {
            bool served = false;
            while (!heap.empty() && !served) {
                int s = -std::get<1>(heap.top());
                name = std::get<2>(heap.top());
                heap.pop();
                auto it = active.find(name);
                if (it != active.end() && it->second == s) {  // 有效的那一筆
                    active.erase(it);
                    out += name + "\n";
                    served = true;
                }
            }
            if (!served) out += "Empty\n";
        } else {  // count
            out += std::to_string(active.size()) + "\n";
        }
    }
    std::cout << out;
    return 0;
}`,
        Python: code`import heapq
import sys


def main():
    data = sys.stdin.read().split()
    q = int(data[0])
    pos = 1
    heap = []    # (-優先度, 序號, 名字)：最小堆積的頂端＝優先度最高、同分最早
    active = {}  # 名字 -> 目前有效那一筆的序號
    out = []
    for seq in range(q):
        cmd = data[pos]
        pos += 1
        if cmd == "add":
            name, p = data[pos], int(data[pos + 1])
            pos += 2
            if name in active:
                out.append("Duplicate")
                continue
            active[name] = seq
            heapq.heappush(heap, (-p, seq, name))
        elif cmd == "cancel":
            name = data[pos]
            pos += 1
            if active.pop(name, None) is None:  # 堆積裡的舊資料之後再丟
                out.append("Not found")
        elif cmd == "serve":
            served = False
            while heap and not served:
                _, s, name = heapq.heappop(heap)
                if active.get(name) == s:  # 有效的那一筆
                    del active[name]
                    out.append(name)
                    served = True
            if not served:
                out.append("Empty")
        else:  # count
            out.append(str(len(active)))
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.PriorityQueue;
import java.util.StringTokenizer;

public class Main {
    record Ticket(long priority, int seq, String name) {}

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int q = Integer.parseInt(br.readLine().trim());
        // 優先度高的先；同分時序號小（較早加入）的先
        PriorityQueue<Ticket> heap = new PriorityQueue<>((a, b) -> a.priority() != b.priority()
            ? Long.compare(b.priority(), a.priority()) : Integer.compare(a.seq(), b.seq()));
        HashMap<String, Integer> active = new HashMap<>();  // 名字 -> 目前有效那一筆的序號
        StringBuilder out = new StringBuilder();
        for (int seq = 0; seq < q; seq++) {
            StringTokenizer st = new StringTokenizer(br.readLine());
            String cmd = st.nextToken();
            if (cmd.equals("add")) {
                String name = st.nextToken();
                long p = Long.parseLong(st.nextToken());
                if (active.containsKey(name)) { out.append("Duplicate\n"); continue; }
                active.put(name, seq);
                heap.add(new Ticket(p, seq, name));
            } else if (cmd.equals("cancel")) {
                if (active.remove(st.nextToken()) == null) out.append("Not found\n");  // 舊資料之後再丟
            } else if (cmd.equals("serve")) {
                boolean served = false;
                while (!heap.isEmpty() && !served) {
                    Ticket t = heap.poll();
                    Integer s = active.get(t.name());
                    if (s != null && s == t.seq()) {  // 有效的那一筆
                        active.remove(t.name());
                        out.append(t.name()).append("\n");
                        served = true;
                    }
                }
                if (!served) out.append("Empty\n");
            } else {  // count
                out.append(active.size()).append("\n");
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

import type { LessonContent, TraceStep } from '../schema';
import { hashSteps, type HashOp } from '../simulate';

const code = String.raw;

/** The trace's operations on the Python chaining set (M = 5): each with the line it runs and why it matters. */
const traceOps: { op: HashOp; why: string }[] = [
  { op: { op: 'add', key: 12, line: 6 }, why: '雜湊就是程式裡的 `x % M`，和本課自己寫的雜湊表一樣。' },
  { op: { op: 'add', key: 7, line: 6 }, why: '7 和 12 的餘數都是 2：鍵不同，桶卻相同，這就是碰撞。' },
  { op: { op: 'add', key: 3, line: 6 }, why: '' },
  { op: { op: 'add', key: 17, line: 6 }, why: '桶 2 的鏈變成 3 個元素。' },
  { op: { op: 'add', key: 10, line: 6 }, why: '' },
  { op: { op: 'add', key: 22, line: 6 }, why: '6 個元素放進 5 個桶，負載因子 6 / 5 = 1.20：鏈結法允許超過 1，但鏈會越來越長；開放定址法則不可能超過 1。' },
  { op: { op: 'contains', key: 17, line: 8 }, why: '要沿著鏈依序比對 12、7、17，第 3 次才找到。鏈越長，比對越多；所有鍵都擠在同一桶時就退化成 O(n)。' },
  { op: { op: 'contains', key: 8, line: 8 }, why: '桶 3 只有一個 3，比對 1 次就知道 8 不在；其他 4 個桶完全不用看，這就是雜湊表快的原因。' },
  { op: { op: 'remove', key: 7, line: 11 }, why: '鏈結法的刪除只是從鏈中拿掉一個元素，12、17、22 的相對順序不變，也不需要墓碑。' },
];

const pyBool = (v: string) => v === 'true' ? 'True' : v === 'false' ? 'False' : v;
const simulated: TraceStep[] = hashSteps('buckets', 5, 'set', traceOps.map(t => t.op)).map((step, i) => ({
  ...step,
  note: `${step.note}${traceOps[i].why}`,
  vars: Object.fromEntries(Object.entries(step.vars ?? {}).map(([k, v]) => [k, pyBool(v)])),
}));
const afterSearch = simulated[7];

/**
 * D10 Hash Table. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); hand-written tables use the same `key mod m` hash (non-negative via
 * `((x % m) + m) % m`), and the custom-key example uses string keys because `Map` compares objects by reference.
 */
export const D10: LessonContent = {
  lessonId: 'D10',
  motivation: 'D08 的 set 與 D09 的 map 能在「平均常數時間」內回答「這個鍵在不在、對應的值是什麼」，背後就是雜湊表（hash table）。編譯器的符號表、網站的快取（cache）、資料庫的雜湊索引、去除重複資料、統計次數，都靠它把「在 n 個資料裡找一個」從 O(n) 變成平均 O(1)。這一課打開黑盒子：雜湊函數怎麼把鍵變成位置、兩個鍵搶同一個位置時怎麼辦、為什麼表要適時變大，以及「平均 O(1)」在什麼情況下會失效。它的限制也要清楚：雜湊表沒有順序（不能直接找最小值或依大小走訪）、最差情況是 O(n)，而且鍵必須有正確的雜湊與相等判斷。',
  sections: [
    {
      id: 'hash-function', title: '雜湊函數：把鍵變成桶的編號',
      blocks: [
        { type: 'p', text: '雜湊表的底層是一個長度為 m 的陣列，每一格叫做桶（bucket）或槽（slot）。要存一個鍵（key）時，先用雜湊函數（hash function）把鍵算成一個整數，稱為雜湊值（hash value），再取除以 m 的餘數，得到桶的編號：`index = hash(key) mod m`。查詢時用同一個公式算出同一個桶，只看那一格，不必掃過整個陣列；這就是雜湊表快的原因。' },
        { type: 'p', text: '本課的範例用最簡單的整數雜湊：`hash(x) = x`，所以桶編號就是 `x mod m`。例如 m = 5 時，12 放進桶 2、3 放進桶 3、10 放進桶 0。' },
        { type: 'callout', tone: 'warning', title: '負數的餘數：C++、Java 與 JavaScript 會得到負的索引', text: 'C++、Java 與 JavaScript 的 `%` 向 0 截斷，`-3 % 5` 是 `-3`，直接拿來當陣列索引會越界（C++ 是未定義行為，Java 丟出 `ArrayIndexOutOfBoundsException`，JavaScript 不報錯，`a[-3]` 只是得到 `undefined`）。要取非負餘數：C++ 與 JavaScript 寫 `((x % m) + m) % m`，Java 用 `Math.floorMod(x, m)`。Python 的 `%` 結果和除數同號，`-3 % 5` 本來就是 `2`。' },
        { type: 'p', text: '好的雜湊函數有三個性質：' },
        { type: 'list', items: [
          '確定性（deterministic）：同一個鍵每次都算出同一個值，否則存進去的東西會找不回來。',
          '分散（uniform）：不同的鍵盡量平均分到各個桶，避免很多鍵擠在少數幾個桶。',
          '快速：計算成本要低，否則省下的搜尋時間又被雜湊本身吃掉。',
        ] },
        { type: 'p', text: '字串是常見的反例：如果把字元碼加總當雜湊，`"abc"`、`"bca"`、`"cab"` 的總和相同，全部撞在一起。Java 的 `String.hashCode()` 改用多項式 `s[0]·31^(n−1) + s[1]·31^(n−2) + … + s[n−1]`，字元的位置也會影響結果，分散得好很多。' },
        { type: 'p', text: '碰撞（collision）是指兩個不同的鍵落在同一個桶。只要可能的鍵比桶多（例如所有整數只配 5 個桶），根據鴿籠原理（pigeonhole principle）就一定有鍵會共用桶，再好的雜湊函數也無法避免。所以雜湊表的設計重點不是「消滅碰撞」，而是「碰撞發生時仍然正確，而且碰撞不要太多」。' },
      ],
    },
    {
      id: 'collisions', title: '碰撞處理：鏈結法與開放定址法',
      blocks: [
        { type: 'p', text: '鏈結法（separate chaining）：每個桶存一串元素（串列或動態陣列）。插入時把鍵接到所屬桶的串列後面；查詢與刪除時只在那一串裡逐一比對。下面的程式自己寫一個鏈結法的 map，鍵是整數、值也是整數。因為雜湊是我們自己定義的 `key mod 5`，每個桶裝什麼、依什麼順序都是確定的，所以可以放心地依桶的編號印出來（函式庫容器的內部順序就不能這樣依賴）。' },
        { type: 'example', id: 'chaining' },
        { type: 'p', text: '注意 `put` 先檢查鍵是否已在鏈中：已存在就更新值，不重複加入，所以 7 最後的值是 77。下方的視覺化用一個 Python 版的鏈結法集合逐步執行，雜湊同樣是本課自己的 `x % M`（M = 5），可以看到碰撞的鍵怎麼排在同一個桶、搜尋時怎麼沿著鏈比對。也可以在「自己試試」放入自己的數字。' },
        { type: 'p', text: '開放定址法（open addressing）：所有元素都直接放在陣列的格子裡，一格最多一個。最簡單的是線性探測（linear probing）：鍵的家在 `i = hash(key) mod m`，如果那一格被別的鍵占了，就試 i + 1、i + 2、…（超過結尾就繞回 0），直到找到空格。查詢走同樣的路線：遇到要找的鍵就成功，遇到空格就代表不存在，因為插入時不可能越過空格。' },
        { type: 'p', text: '刪除是開放定址法最容易出錯的地方。下表用 m = 7、`hash(x) = x mod 7` 手算：10、17、24 的家都是槽 3。' },
        { type: 'table', head: ['操作', '槽 3', '槽 4', '槽 5', '槽 6', '發生了什麼'], rows: [
          ['insert 10', '10', '_', '_', '_', '10 mod 7 = 3，槽 3 是空的，放入。'],
          ['insert 17', '10', '17', '_', '_', '17 mod 7 = 3，槽 3 被占，探測槽 4。'],
          ['insert 24', '10', '17', '24', '_', '24 mod 7 = 3，槽 3、4 都被占，放進槽 5。'],
          ['delete 17（錯誤：直接清空）', '10', '_', '24', '_', '之後找 24：槽 3 是 10，槽 4 是空的，搜尋停止，誤判 24 不存在。'],
          ['delete 17（正確：留墓碑 D）', '10', 'D', '24', '_', '之後找 24：槽 4 是墓碑，繼續往下，在槽 5 找到。'],
          ['insert 31', '10', '31', '24', '_', '先確認 31 不在表中（一路找到槽 6 的空格），再放進第一個墓碑槽 4。'],
        ] },
        { type: 'p', text: '墓碑（tombstone）是「這裡曾經有東西」的標記：搜尋時當作被占用、繼續往下找；插入時可以重複利用。下面的程式重現上表的正確版本。' },
        { type: 'example', id: 'linear-probing' },
        { type: 'callout', tone: 'warning', title: '開放定址法不能直接清空刪除的格子', text: '把被刪除的格子改回「空」，會切斷其他鍵的探測路線，讓明明存在的鍵查不到。必須改放墓碑。墓碑越積越多時，搜尋要走的路也越長，所以實作通常會在重新雜湊時把墓碑一併清掉。另外，線性探測會讓被占的格子連成一大段（primary clustering，主要叢集），新鍵只要落在這一段裡就得走到段尾，叢集因此越長越快。' },
        { type: 'table', head: ['', '鏈結法', '開放定址法（線性探測）'], rows: [
          ['碰撞的鍵放哪裡', '同一個桶的串列裡', '往後找下一個空格'],
          ['負載因子上限', '可以超過 1（鏈變長）', '必須小於 1，實務上通常維持在 0.5～0.75 左右'],
          ['刪除', '從串列移除即可', '要留墓碑'],
          ['記憶體', '每個元素多一個串列節點或指標', '只有一個陣列，快取區域性好'],
          ['使用者', 'C++ `unordered_map`、Java `HashMap`', 'Python `dict`／`set`（探測順序不是單純的 +1）'],
        ] },
      ],
    },
    {
      id: 'load-factor', title: '負載因子、重新雜湊與複雜度',
      blocks: [
        { type: 'p', text: '負載因子（load factor）α = n / m，n 是元素個數、m 是桶數。鏈結法中，若雜湊分散得均勻，每條鏈平均長 α，查詢平均要比對約 1 + α 次。所以只要 α 維持在常數以下，操作就是平均 O(1)；表滿了卻不變大，α 會隨 n 成長，操作就慢慢變成 O(n)。' },
        { type: 'p', text: '重新雜湊（rehashing）：當 α 超過門檻時，配置一個更大的陣列（常見是桶數加倍），再把每個元素用新的 m 重新算一次桶編號、重新放入。不能直接把舊陣列複製過去，因為 `hash(key) mod m` 換了 m 結果就不同。例如 m 從 5 變成 10，12 仍在桶 2（12 mod 10 = 2），但 17 從桶 2 換到桶 7（17 mod 10 = 7）。單次重新雜湊是 O(n)，但因為每次加倍，下一次要再過很久才會發生；和 D02 動態陣列的擴容一樣，平均分攤到每次插入仍是 O(1)，稱為攤銷 O(1)（amortized）。' },
        { type: 'p', text: '各語言的門檻：Java `HashMap` 預設 16 個桶、負載因子門檻 0.75，元素數超過「桶數 × 0.75」就把桶數加倍；C++ `unordered_map` 的 `max_load_factor()` 預設是 1.0，超過時自動重新雜湊；Python `dict` 的門檻與成長方式是 CPython 的實作細節，不寫在語言規格中；JavaScript 的 `Map`／`Set` 也一樣，由引擎（例如 Node.js 用的 V8）決定。' },
        { type: 'table', head: ['操作', '自寫鏈結法', 'C++ `unordered_map`', 'Python `dict`／`set`', 'Java `HashMap`', 'JavaScript `Map`／`Set`', '平衡 BST（`std::map`／`TreeMap`）'], rows: [
          ['插入', '平均 O(1)，最差 O(n)', '平均 O(1)，最差 O(n)', '攤銷平均 O(1)，最差 O(n)', '平均 O(1)，最差 O(log n)～O(n)', '平均 O(1)（規格只要求平均比 O(n) 快）', 'O(log n)'],
          ['查詢', '平均 O(1)，最差 O(n)', '平均 O(1)，最差 O(n)', '平均 O(1)，最差 O(n)', '平均 O(1)，最差 O(log n)～O(n)', '平均 O(1)', 'O(log n)'],
          ['刪除', '平均 O(1)，最差 O(n)', '平均 O(1)，最差 O(n)', '平均 O(1)，最差 O(n)', '平均 O(1)，最差 O(log n)～O(n)', '平均 O(1)', 'O(log n)'],
          ['重新雜湊一次', 'O(n)（攤銷到每次插入 O(1)）', 'O(n)', 'O(n)', 'O(n)', 'O(n)', '不需要'],
          ['依鍵的大小走訪', '先排序 O(n log n)', '先排序 O(n log n)', '先排序 O(n log n)', '先排序 O(n log n)', '先排序 O(n log n)（走訪是插入順序）', 'O(n)'],
        ] },
        { type: 'p', text: '「平均 O(1)」的前提是鍵被分散得夠均勻。最差情況是所有鍵都落在同一個桶：鏈結法變成一條長度 n 的串列，每次查詢都要比對 n 次，O(n)。這不只是理論：攻擊者可以刻意送出大量雜湊值相同的鍵，讓伺服器變慢（hash flooding 攻擊）。Python 從 3.3 起每次啟動都用隨機種子計算字串的雜湊，就是為了讓攻擊者無法事先算出會碰撞的鍵。' },
        { type: 'callout', tone: 'note', title: 'Java 8 的 HashMap 會把長鏈變成樹', text: '從 Java 8 開始，`HashMap` 的某個桶累積到 8 個元素（而且桶數至少 64）時，會把那條鏈改成紅黑樹；桶數還小的時候則優先把表加倍。樹化之後，那個桶的查詢最差約 O(log n)，鍵實作 `Comparable` 時效果最好。C++ 標準、Python 與 JavaScript 都沒有這種保證。' },
      ],
    },
    {
      id: 'languages', title: '四種語言的雜湊表與自訂鍵',
      blocks: [
        { type: 'p', text: 'C++：`std::unordered_map`／`std::unordered_set` 提供桶的介面：`bucket_count()` 是目前桶數、`load_factor()` 是目前的 α、`max_load_factor()` 是門檻、`rehash(n)` 把桶數設為至少 n、`reserve(n)` 預留足以放 n 個元素的桶。桶數的實際數值、成長方式與元素的走訪順序都由實作決定，不同編譯器會不一樣，所以本課的範例不印這些值。重新雜湊會讓所有疊代器（iterator）失效，但指向元素的參考與指標仍然有效；在走訪途中插入元素可能觸發重新雜湊，是常見的錯誤來源。' },
        { type: 'p', text: '自訂鍵在 C++ 需要兩樣東西：判斷相等的 `operator==`，以及雜湊函式。標準庫沒有替 `std::pair` 或你自己的 struct 提供 `std::hash`，所以 `std::unordered_map<std::pair<int, int>, int>` 直接寫會編譯失敗。做法是寫一個雜湊函式物件（functor）當第三個樣板參數（如下面的 `PointHash`），或者為你的型別特化 `std::hash`。組合兩個欄位時不要用 `h1 ^ h2`：(2, 3) 與 (3, 2) 會得到相同的值，(x, x) 則全部變成 0。' },
        { type: 'p', text: 'Python：`dict` 與 `set` 用開放定址法實作，探測順序會依雜湊值的其他位元跳躍，不是單純的 +1。`dict` 從 Python 3.7 起保證依插入順序走訪，但 `set` 沒有任何順序保證。字串、bytes 的 `hash()` 每次啟動程式都不同（由 `PYTHONHASHSEED` 控制），所以同一個 set 在兩次執行可能印出不同的順序：永遠不要依賴雜湊值或 set 的順序，需要固定順序就用 `sorted()`。' },
        { type: 'p', text: 'Python 的鍵必須可雜湊（hashable）：`int`、`str`、`tuple`（內容也可雜湊時）可以，`list`、`dict`、`set` 這些可變的容器不行，`d[[1, 2]] = 0` 會丟出 `TypeError: unhashable type: \'list\'`，改用 `tuple` 即可。自訂類別預設用物件身分（identity）判斷相等與雜湊；要讓「內容相同就相等」，要同時定義 `__eq__` 與 `__hash__`，或用 `@dataclass(frozen=True)` 自動產生。只定義 `__eq__` 而沒有 `__hash__` 時，Python 會把 `__hash__` 設為 `None`，物件就不能當鍵，錯誤會立刻出現。' },
        { type: 'p', text: 'Java：`HashMap` 先用 `hashCode()` 決定桶，再用 `equals()` 在桶裡比對。兩者必須遵守約定（contract）：`a.equals(b)` 為 true 時，`a.hashCode()` 必須等於 `b.hashCode()`；反過來，雜湊值相同不代表相等（那只是碰撞）。Java 16 起的 `record` 會依欄位自動產生正確的 `equals` 與 `hashCode`，是當鍵最省事的寫法。' },
        { type: 'p', text: 'JavaScript：`Map` 與 `Set` 不能自訂雜湊函數與相等判斷。數字、字串這些原始值依值比較；物件與陣列依參考（identity）比較，所以兩個內容相同的 `{ x: 2, y: 3 }` 是兩個不同的鍵。要讓「內容相同就相等」，常見做法是把鍵轉成字串，例如 `x + "," + y`。`Map` 依插入順序走訪，這是規格保證的，和雜湊值無關。' },
        { type: 'example', id: 'custom-key' },
        { type: 'callout', tone: 'warning', title: 'Java：覆寫 equals 卻沒有覆寫 hashCode', text: '只覆寫 `equals` 時，`hashCode` 仍是 `Object` 預設、依物件身分產生的值。兩個內容相同的物件通常會有不同的雜湊值，被分到不同的桶：`put(new Point(1, 2), "A")` 之後 `get(new Point(1, 2))` 通常得到 `null`，`HashSet` 也會收進兩個「相等」的元素。Java 不會在編譯時警告你，所以 `equals` 與 `hashCode` 一定要一起覆寫（或改用 `record`）。' },
        { type: 'callout', tone: 'warning', title: '放進雜湊表之後，不要修改鍵', text: '雜湊表只在插入時算一次桶的位置。如果鍵是可變的物件（例如 Java 把 `ArrayList` 當鍵），放進去之後再修改它，雜湊值改變了，元素卻還留在舊的桶裡：用新內容查詢會去錯桶，用舊內容查詢則 `equals` 不成立，兩種方式都找不到它，它就「遺失」在表裡。Python 禁止 list 當鍵正是為了避免這件事。鍵請用不可變的型別（`String`、`Integer`、`record`、`tuple`、`frozenset`），C++ 的 `unordered_map` 則把鍵設為 `const`，從語法上就不讓你改。' },
      ],
    },
    {
      id: 'vs-bst', title: '雜湊表與平衡 BST 的取捨',
      blocks: [
        { type: 'p', text: '有序的 map／set（C++ `std::map`／`std::set`、Java `TreeMap`／`TreeSet`）用平衡二元搜尋樹實作，每個操作保證 O(log n)，而且鍵永遠依大小排好。雜湊表平均更快，但沒有順序，也沒有最差情況的保證。Python 標準庫沒有平衡 BST，需要順序時通常用 `sorted()`，或維持一個已排序的 list 搭配 `bisect`；JavaScript 也沒有，需要順序時先把鍵 `sort` 好。' },
        { type: 'table', head: ['需求', '雜湊表', '平衡 BST'], rows: [
          ['只問「在不在、值是什麼」', '最適合：平均 O(1)', '可以，O(log n)'],
          ['依鍵的大小輸出、找最小／最大鍵', '要先排序', '直接走訪，最小值 O(log n)'],
          ['找「≥ x 的最小鍵」、範圍查詢', '做不到（只能全部掃過）', '`lower_bound`、`ceilingKey`，O(log n)'],
          ['最差情況保證', '沒有（碰撞集中時 O(n)）', '每次 O(log n)'],
          ['鍵需要什麼', '雜湊函數 + 相等判斷', '比較大小（`<`、`Comparable`）'],
        ] },
        { type: 'p', text: '選擇的原則：題目只需要查詢、計數、去重複，就用雜湊表；題目需要順序（排名、依字典序輸出、找前驅後繼、範圍）就用平衡 BST。輸出時需要固定順序但平常只查詢，也可以用雜湊表存、最後排序一次再輸出。' },
      ],
    },
  ],
  examples: [
    {
      id: 'chaining', title: '自己寫鏈結法的雜湊表', description: '5 個桶、雜湊為 key mod 5（非負餘數）。put 會更新已存在的鍵；最後依桶的編號印出每條鏈。',
      output: 'get 17 = 170\nget 8 = missing\n0: 10=100\n1: -\n2: 7=77 17=170\n3: 3=30\n4: -',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <utility>
#include <vector>

const int M = 5;
std::vector<std::vector<std::pair<int, int>>> table(M);  // 每個桶是一串 (key, value)

int bucketOf(int key) { return (key % M + M) % M; }  // 非負餘數

void put(int key, int value) {
    for (auto& p : table[bucketOf(key)])
        if (p.first == key) { p.second = value; return; }  // 已存在：更新值
    table[bucketOf(key)].push_back({key, value});
}

const int* get(int key) {  // 找不到回傳 nullptr
    for (const auto& p : table[bucketOf(key)])
        if (p.first == key) return &p.second;
    return nullptr;
}

void erase(int key) {
    auto& chain = table[bucketOf(key)];
    for (auto it = chain.begin(); it != chain.end(); ++it)
        if (it->first == key) { chain.erase(it); return; }
}

int main() {
    int data[][2] = {{12, 120}, {7, 70}, {3, 30}, {17, 170}, {10, 100}, {7, 77}};
    for (auto& d : data) put(d[0], d[1]);
    std::cout << "get 17 = " << *get(17) << "\n";
    std::cout << "get 8 = " << (get(8) ? std::to_string(*get(8)) : "missing") << "\n";
    erase(12);
    for (int b = 0; b < M; ++b) {
        std::cout << b << ":";
        if (table[b].empty()) std::cout << " -";
        for (const auto& p : table[b]) std::cout << " " << p.first << "=" << p.second;
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`M = 5
table = [[] for _ in range(M)]  # 每個桶是一串 [key, value]


def put(key, value):
    chain = table[key % M]  # Python 的 % 本來就是非負餘數
    for pair in chain:
        if pair[0] == key:
            pair[1] = value  # 已存在：更新值
            return
    chain.append([key, value])


def get(key):
    for k, v in table[key % M]:
        if k == key:
            return v
    return None


def erase(key):
    table[key % M] = [p for p in table[key % M] if p[0] != key]


for k, v in [(12, 120), (7, 70), (3, 30), (17, 170), (10, 100), (7, 77)]:
    put(k, v)
print("get 17 =", get(17))
value = get(8)
print("get 8 =", "missing" if value is None else value)
erase(12)
for b in range(M):
    print(f"{b}:", " ".join(f"{k}={v}" for k, v in table[b]) or "-")`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static final int M = 5;
    static List<List<int[]>> table = new ArrayList<>();  // 每個桶是一串 {key, value}

    static int bucketOf(int key) { return Math.floorMod(key, M); }  // 非負餘數

    static void put(int key, int value) {
        for (int[] p : table.get(bucketOf(key)))
            if (p[0] == key) { p[1] = value; return; }  // 已存在：更新值
        table.get(bucketOf(key)).add(new int[] {key, value});
    }

    static Integer get(int key) {  // 找不到回傳 null
        for (int[] p : table.get(bucketOf(key))) if (p[0] == key) return p[1];
        return null;
    }

    static void erase(int key) { table.get(bucketOf(key)).removeIf(p -> p[0] == key); }

    public static void main(String[] args) {
        for (int b = 0; b < M; b++) table.add(new ArrayList<>());
        int[][] data = {{12, 120}, {7, 70}, {3, 30}, {17, 170}, {10, 100}, {7, 77}};
        for (int[] d : data) put(d[0], d[1]);
        System.out.println("get 17 = " + get(17));
        Integer v = get(8);
        System.out.println("get 8 = " + (v == null ? "missing" : v));
        erase(12);
        for (int b = 0; b < M; b++) {
            StringBuilder line = new StringBuilder(b + ":");
            if (table.get(b).isEmpty()) line.append(" -");
            for (int[] p : table.get(b)) line.append(" ").append(p[0]).append("=").append(p[1]);
            System.out.println(line);
        }
    }
}`,
        JavaScript: code`const M = 5;
const table = Array.from({ length: M }, () => []);  // 每個桶是一串 [key, value]

function bucketOf(key) {
    return ((key % M) + M) % M;  // 非負餘數：JavaScript 的 % 和 C++／Java 一樣可能是負的
}

function put(key, value) {
    const chain = table[bucketOf(key)];
    for (const pair of chain) {
        if (pair[0] === key) {
            pair[1] = value;  // 已存在：更新值
            return;
        }
    }
    chain.push([key, value]);
}

function get(key) {  // 找不到回傳 undefined
    for (const [k, v] of table[bucketOf(key)]) {
        if (k === key) return v;
    }
    return undefined;
}

function erase(key) {
    const b = bucketOf(key);
    table[b] = table[b].filter(p => p[0] !== key);
}

for (const [k, v] of [[12, 120], [7, 70], [3, 30], [17, 170], [10, 100], [7, 77]]) put(k, v);
console.log("get 17 =", get(17));
const value = get(8);
console.log("get 8 =", value === undefined ? "missing" : value);
erase(12);
for (let b = 0; b < M; b++) {
    const items = table[b].map(([k, v]) => k + "=" + v);
    console.log(b + ":", items.length > 0 ? items.join(" ") : "-");
}`,
      },
    },
    {
      id: 'linear-probing', title: '線性探測與墓碑', description: '7 個槽、雜湊為 key mod 7。10、17、24 都從槽 3 開始；刪除 17 留下墓碑 D，24 仍找得到，31 會重複利用墓碑的位置。find 回傳槽位，找不到回傳 -1。',
      output: 'insert 10 17 24: _ _ _ 10 17 24 _\ndelete 17: _ _ _ 10 D 24 _\nfind 24 -> 5 | find 31 -> -1\ninsert 31: _ _ _ 10 31 24 _',
      code: {
        'C++': code`#include <iostream>
#include <vector>

const int M = 7, EMPTY = -1, DELETED = -2;  // 本例的鍵都是非負整數
std::vector<int> slots(M, EMPTY);

int find(int key) {  // 從 key % M 往後探測；遇到空槽才停，墓碑要跳過
    int i = key % M;
    for (int step = 0; step < M; ++step) {
        if (slots[i] == EMPTY) return -1;
        if (slots[i] == key) return i;
        i = (i + 1) % M;
    }
    return -1;
}

void insert(int key) {  // 確認不存在後，放進第一個空槽或墓碑
    if (find(key) >= 0) return;
    int i = key % M;
    while (slots[i] != EMPTY && slots[i] != DELETED) i = (i + 1) % M;
    slots[i] = key;
}

void show(const char* label) {
    std::cout << label;
    for (int s : slots) {
        if (s == EMPTY) std::cout << " _";
        else if (s == DELETED) std::cout << " D";
        else std::cout << " " << s;
    }
    std::cout << "\n";
}

int main() {
    for (int k : {10, 17, 24}) insert(k);
    show("insert 10 17 24:");
    slots[find(17)] = DELETED;  // 刪除：留下墓碑，不是改回 EMPTY
    show("delete 17:");
    std::cout << "find 24 -> " << find(24) << " | find 31 -> " << find(31) << "\n";
    insert(31);
    show("insert 31:");
    return 0;
}`,
        Python: code`M = 7
EMPTY, DELETED = None, "D"  # 空槽與墓碑（tombstone）
slots = [EMPTY] * M


def find(key):  # 從 key % M 往後探測；遇到空槽才停，墓碑要跳過
    i = key % M
    for _ in range(M):
        if slots[i] is EMPTY:
            return -1
        if slots[i] == key:
            return i
        i = (i + 1) % M
    return -1


def insert(key):  # 確認不存在後，放進第一個空槽或墓碑
    if find(key) >= 0:
        return
    i = key % M
    while slots[i] is not EMPTY and slots[i] != DELETED:
        i = (i + 1) % M
    slots[i] = key


def show(label):
    print(label, " ".join("_" if s is EMPTY else str(s) for s in slots))


for k in [10, 17, 24]:
    insert(k)
show("insert 10 17 24:")
slots[find(17)] = DELETED  # 刪除：留下墓碑，不是改回 EMPTY
show("delete 17:")
print("find 24 ->", find(24), "| find 31 ->", find(31))
insert(31)
show("insert 31:")`,
        Java: code`public class Main {
    static final int M = 7, EMPTY = -1, DELETED = -2;  // 本例的鍵都是非負整數
    static int[] slots = new int[M];

    static int find(int key) {  // 從 key % M 往後探測；遇到空槽才停，墓碑要跳過
        int i = key % M;
        for (int step = 0; step < M; step++) {
            if (slots[i] == EMPTY) return -1;
            if (slots[i] == key) return i;
            i = (i + 1) % M;
        }
        return -1;
    }

    static void insert(int key) {  // 確認不存在後，放進第一個空槽或墓碑
        if (find(key) >= 0) return;
        int i = key % M;
        while (slots[i] != EMPTY && slots[i] != DELETED) i = (i + 1) % M;
        slots[i] = key;
    }

    static void show(String label) {
        StringBuilder sb = new StringBuilder(label);
        for (int s : slots) sb.append(s == EMPTY ? " _" : s == DELETED ? " D" : " " + s);
        System.out.println(sb);
    }

    public static void main(String[] args) {
        java.util.Arrays.fill(slots, EMPTY);
        for (int k : new int[] {10, 17, 24}) insert(k);
        show("insert 10 17 24:");
        slots[find(17)] = DELETED;  // 刪除：留下墓碑，不是改回 EMPTY
        show("delete 17:");
        System.out.println("find 24 -> " + find(24) + " | find 31 -> " + find(31));
        insert(31);
        show("insert 31:");
    }
}`,
        JavaScript: code`const M = 7;
const EMPTY = null;
const DELETED = "D";  // 墓碑（tombstone）
const slots = new Array(M).fill(EMPTY);

function find(key) {  // 從 key % M 往後探測；遇到空槽才停，墓碑要跳過
    let i = key % M;
    for (let step = 0; step < M; step++) {
        if (slots[i] === EMPTY) return -1;
        if (slots[i] === key) return i;
        i = (i + 1) % M;
    }
    return -1;
}

function insert(key) {  // 確認不存在後，放進第一個空槽或墓碑
    if (find(key) >= 0) return;
    let i = key % M;
    while (slots[i] !== EMPTY && slots[i] !== DELETED) i = (i + 1) % M;
    slots[i] = key;
}

function show(label) {
    console.log(label, slots.map(s => (s === EMPTY ? "_" : String(s))).join(" "));
}

for (const k of [10, 17, 24]) insert(k);
show("insert 10 17 24:");
slots[find(17)] = DELETED;  // 刪除：留下墓碑，不是改回 EMPTY
show("delete 17:");
console.log("find 24 ->", find(24), "| find 31 ->", find(31));
insert(31);
show("insert 31:");`,
      },
    },
    {
      id: 'custom-key', title: '用自訂型別當雜湊表的鍵', description: '座標 (x, y) 當鍵：C++ 寫 operator== 與雜湊函式物件，Python 用 frozen dataclass，Java 用 record，JavaScript 把座標轉成字串鍵。只印查詢結果與大小，不印走訪順序。',
      output: '(2, 3) -> cafe\n(3, 2) -> park\n(5, 5) -> (none)\nsize: 3',
      code: {
        'C++': code`#include <cstddef>
#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>

struct Point {
    int x, y;
    bool operator==(const Point& o) const { return x == o.x && y == o.y; }
};

struct PointHash {  // 自訂雜湊函式物件（functor）
    std::size_t operator()(const Point& p) const {
        std::size_t h1 = std::hash<int>{}(p.x), h2 = std::hash<int>{}(p.y);
        return h1 * 31 + h2;  // 不用 h1 ^ h2：那會讓 (2, 3) 與 (3, 2) 碰撞
    }
};

int main() {
    std::unordered_map<Point, std::string, PointHash> places;
    places[{0, 0}] = "home";
    places[{2, 3}] = "shop";
    places[{3, 2}] = "park";
    places[{2, 3}] = "cafe";  // 相等的鍵：覆蓋舊值
    for (Point p : {Point{2, 3}, Point{3, 2}, Point{5, 5}}) {
        auto it = places.find(p);
        std::cout << "(" << p.x << ", " << p.y << ") -> " << (it != places.end() ? it->second : "(none)") << "\n";
    }
    std::cout << "size: " << places.size() << "\n";
    return 0;
}`,
        Python: code`from dataclasses import dataclass


@dataclass(frozen=True)  # 不可變，並自動產生 __eq__ 與 __hash__
class Point:
    x: int
    y: int


places = {}
places[Point(0, 0)] = "home"
places[Point(2, 3)] = "shop"
places[Point(3, 2)] = "park"
places[Point(2, 3)] = "cafe"  # 相等的鍵：覆蓋舊值
for p in [Point(2, 3), Point(3, 2), Point(5, 5)]:
    print(f"({p.x}, {p.y}) ->", places.get(p, "(none)"))
print("size:", len(places))`,
        Java: code`import java.util.HashMap;
import java.util.Map;

public class Main {
    record Point(int x, int y) {}  // record 自動產生 equals 與 hashCode

    public static void main(String[] args) {
        Map<Point, String> places = new HashMap<>();
        places.put(new Point(0, 0), "home");
        places.put(new Point(2, 3), "shop");
        places.put(new Point(3, 2), "park");
        places.put(new Point(2, 3), "cafe");  // 相等的鍵：覆蓋舊值
        for (Point p : new Point[] {new Point(2, 3), new Point(3, 2), new Point(5, 5)}) {
            System.out.println("(" + p.x() + ", " + p.y() + ") -> " + places.getOrDefault(p, "(none)"));
        }
        System.out.println("size: " + places.size());
    }
}`,
        JavaScript: code`// JavaScript 的 Map 不能自訂雜湊與相等判斷，物件鍵依參考比較：兩個 { x: 2, y: 3 } 是不同的鍵。
// 常見做法是把座標轉成字串鍵，相等的座標就得到相同的字串
const key = (x, y) => x + "," + y;
const places = new Map();
places.set(key(0, 0), "home");
places.set(key(2, 3), "shop");
places.set(key(3, 2), "park");
places.set(key(2, 3), "cafe");  // 相等的鍵：覆蓋舊值
for (const [x, y] of [[2, 3], [3, 2], [5, 5]]) {
    console.log("(" + x + ", " + y + ") ->", places.get(key(x, y)) ?? "(none)");
}
console.log("size:", places.size);`,
      },
    },
  ],
  visualization: {
    kind: 'hash-table', title: '鏈結法：5 個桶、雜湊 x % 5，碰撞的鍵排在同一條鏈', language: 'Python',
    code: code`M = 5
buckets = [[] for _ in range(M)]
def add(x):
    b = x % M
    if x not in buckets[b]:
        buckets[b].append(x)
def contains(x):
    return x in buckets[x % M]
def remove(x):
    if x in buckets[x % M]:
        buckets[x % M].remove(x)
for x in [12, 7, 3, 17, 10, 22]:
    add(x)
print(contains(17), contains(8))
remove(7)`,
    steps: [
      { line: 2, note: '建立 M = 5 個空桶，每個桶是一個 list（鏈）。本視覺化的雜湊就是程式裡的 `x % M`，和本課自己寫的雜湊表相同，不是 Python 內建 set 的雜湊。', buckets: { name: 'buckets', buckets: [[], [], [], [], []] }, vars: { size: '0', 負載因子: '0.00' } },
      ...simulated.slice(0, 8),
      { line: 14, note: '印出兩次查詢的結果：`contains(17)` 是 True、`contains(8)` 是 False。', buckets: { name: 'buckets', buckets: afterSearch.buckets!.buckets }, vars: afterSearch.vars, output: 'True False' },
      { ...simulated[8], output: 'True False' },
    ],
    playground: { structure: 'hash-set', buckets: 5 },
  },
  quiz: [
    {
      id: 'q-bucket', prompt: '用本課的雜湊 `index = x mod 5`（取非負餘數），鍵 17 與 -3 分別放進哪個桶？',
      options: ['17 → 桶 2，-3 → 桶 2', '17 → 桶 2，-3 → 桶 -3', '17 → 桶 2，-3 → 桶 3', '17 → 桶 3，-3 → 桶 2'],
      answer: 0, explanation: '17 = 3 × 5 + 2，餘數 2。-3 = (-1) × 5 + 2，非負餘數也是 2，所以兩個鍵碰撞、落在同一個桶。「桶 -3」是 C++／Java 的 `-3 % 5` 直接拿來用的結果，會造成陣列越界；「桶 3」是把負號丟掉後再取餘數，算錯了。',
    },
    {
      id: 'q-load', prompt: '鏈結法雜湊表有 m = 8 個桶、已放入 6 個鍵。規則是「插入後若負載因子 α > 0.75，就把桶數加倍並重新雜湊」。目前的 α 是多少？接著再插入 3 個不同的新鍵，會發生什麼？',
      options: ['α = 0.75；插入第 7 個鍵後擴充成 16 個桶，之後 α = 9 / 16 ≈ 0.56', 'α = 0.75；要等 α 超過 1（第 9 個鍵）才擴充', 'α = 1.33；已經超過門檻，必須馬上擴充', 'α = 0.75；插入第 7 個鍵後擴充成 16 個桶，但 α 仍是 7 / 8'],
      answer: 0, explanation: 'α = n / m = 6 / 8 = 0.75，還沒有「大於」0.75。第 7 個鍵進來後 α = 7 / 8 = 0.875 > 0.75，桶數加倍為 16 並重新放入全部元素；之後再放 2 個，α = 9 / 16 = 0.5625，不再觸發。「1.33」把 m / n 倒過來算；「仍是 7 / 8」忘了重新雜湊後分母變成 16；規則的門檻是 0.75，不是 1。',
    },
    {
      id: 'q-worst', prompt: '鏈結法雜湊表（每個桶是一般的串列）裡有 n 個鍵，但雜湊函數很糟，所有鍵都落在同一個桶。此時查詢一個不存在的鍵，時間複雜度是多少？',
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
      answer: 2, explanation: '所有鍵都在同一條串列，查詢一個不存在的鍵必須把整條長度 n 的串列比對完，是 O(n)。O(1) 是雜湊分散均勻時的平均情況；O(log n) 是 Java 8 起 `HashMap` 把長鏈改成紅黑樹後的結果，但題目說的是一般串列；O(n²) 是連續做 n 次這種查詢的總成本，不是單次。',
    },
    {
      id: 'q-equals', prompt: '下面的 Java 程式最可能輸出什麼？',
      code: { language: 'Java', text: 'class Point {\n    int x, y;\n    Point(int x, int y) { this.x = x; this.y = y; }\n    @Override public boolean equals(Object o) {\n        return o instanceof Point p && p.x == x && p.y == y;\n    }\n}\n// main 中：\nMap<Point, String> m = new HashMap<>();\nm.put(new Point(1, 2), "A");\nSystem.out.println(m.get(new Point(1, 2)));' },
      options: ['一定印出 A，因為 equals 判斷兩個點相等', '通常印出 null，因為沒有覆寫 hashCode', '編譯錯誤：覆寫 equals 就必須覆寫 hashCode', '丟出 NullPointerException'],
      answer: 1, explanation: '`HashMap` 先用 `hashCode()` 找桶。沒有覆寫時，兩個 `new Point(1, 2)` 用的是依物件身分產生的預設雜湊值，通常不同，查詢會去另一個桶，根本輪不到 `equals` 比對，所以得到 null（偶爾雜湊值剛好相同時才找得到，不能依賴）。Java 不會因此編譯失敗，只會留下難找的錯誤；`get` 找不到時回傳 null 而不是丟出例外。修正方法是同時覆寫 `hashCode`，或改用 `record Point(int x, int y)`。',
    },
    {
      id: 'q-probe', prompt: '開放定址法、線性探測，m = 7、`hash(x) = x mod 7`。在空表中依序插入 9、15、8，8 最後放在哪一個槽？',
      options: ['槽 1，和 15 放在一起', '槽 2', '槽 3', '槽 0'],
      answer: 2, explanation: '9 mod 7 = 2，放進槽 2；15 mod 7 = 1，放進槽 1；8 mod 7 = 1，槽 1 被 15 占了，試槽 2，又被 9 占了，再試槽 3，是空的，放進槽 3。開放定址法一格只能放一個鍵，不能和 15 共用（那是鏈結法）；「槽 2」忽略了 9 已經在那裡；線性探測是往後找，不會跳回槽 0 重新開始。',
    },
    {
      id: 'q-choose', prompt: '一個成績系統要存「學號 → 分數」，除了查詢某學號的分數，還要經常「依學號由小到大列出全部」以及「找出學號 ≥ x 的第一位學生」。用 Java 時哪一個最合適？',
      options: ['HashMap', 'TreeMap', 'HashSet', 'ArrayList，每次查詢都從頭掃描'],
      answer: 1, explanation: '`TreeMap` 是平衡 BST，鍵永遠依大小排好：依序走訪是 O(n)，`ceilingKey(x)` 找 ≥ x 的最小鍵是 O(log n)，查詢也是 O(log n)。`HashMap` 查詢平均更快，但沒有順序，每次依序列出都要先排序，也無法直接找 ≥ x 的鍵；`HashSet` 只存鍵、不存分數；`ArrayList` 每次掃描是 O(n)。',
    },
  ],
  exercises: [
    {
      id: 'e-chaining-set', title: '用鏈結法實作整數雜湊集合',
      statement: '請自己實作一個整數的雜湊集合（不可使用語言內建的 set／HashSet 存資料）：有 m 個桶，整數 x 放進桶 `x mod m`，負數要取非負餘數（例如 m = 5 時 -1 放進桶 4）。每個桶是一條鏈，依加入的先後順序存放。支援四種指令：`add x` 把 x 加入集合（已存在就不變，不重複加入）；`remove x` 把 x 移除（不存在就不變），其他元素的順序保持不變；`contains x` 輸出 `yes` 或 `no`；`print` 依桶的編號 0 到 m − 1，每個桶輸出一行 `編號: 元素…`，元素依鏈中順序以空白分隔，空桶輸出 `編號: -`。若指令名稱不是這四種之一，輸出 `Error` 並繼續處理下一行。若 m ≤ 0，整個程式只輸出一行 `Invalid`。',
      inputFormat: '第一行兩個整數 m 與 q。接下來 q 行，每行一個指令：`add x`、`remove x`、`contains x`、`print`，或其他不認得的指令名稱（可能後面帶有參數）。',
      outputFormat: '依序輸出 `contains` 的 `yes`／`no`、`print` 的 m 行，以及不認得的指令的 `Error`；`add` 與 `remove` 不輸出。m ≤ 0 時只輸出 `Invalid`。',
      constraints: ['-10^9 ≤ m ≤ 1,000', '1 ≤ q ≤ 5,000', '-10^9 ≤ x ≤ 10^9', '`print` 最多出現 20 次', '不需要重新雜湊：桶數 m 固定不變'],
      samples: [
        { kind: 'normal', input: '5 9\nadd 10\nadd 5\nadd 7\nadd 12\ncontains 12\ncontains 3\nremove 7\nadd 20\nprint', output: 'yes\nno\n0: 10 5 20\n1: -\n2: 12\n3: -\n4: -', note: '10、5、20 碰撞在桶 0，依加入順序排列' },
      ],
      tests: [
        { kind: 'normal', input: '5 9\nadd 10\nadd 5\nadd 7\nadd 12\ncontains 12\ncontains 3\nremove 7\nadd 20\nprint', output: 'yes\nno\n0: 10 5 20\n1: -\n2: 12\n3: -\n4: -', note: '範例' },
        { kind: 'normal', input: '4 10\nadd 8\nadd 3\nadd 6\nadd 7\nadd 3\nremove 3\nadd 3\ncontains 7\ncontains 4\nprint', output: 'yes\nno\n0: 8\n1: -\n2: 6\n3: 7 3', note: '重複 add 不變；移除後再加入，3 排到鏈的尾端' },
        { kind: 'normal', input: '2 5\nadd 1\nprint\nadd 3\nremove 1\nprint', output: '0: -\n1: 1\n0: -\n1: 3', note: '多次 print，反映每個時間點的狀態' },
        { kind: 'edge', input: '5 6\nadd -1\nadd -6\nadd 4\nadd -10\ncontains -6\nprint', output: 'yes\n0: -10\n1: -\n2: -\n3: -\n4: -1 -6 4', note: '負數取非負餘數：-1、-6 與 4 都在桶 4，-10 在桶 0' },
        { kind: 'edge', input: '3 5\nremove 5\ncontains 5\nadd 5\nremove 8\nprint', output: 'no\n0: -\n1: -\n2: 5', note: '在空集合上 remove、移除不存在的 8（和 5 同桶）都不變' },
        { kind: 'edge', input: '1 6\nadd 3\nadd -2\nadd 100\nremove -2\nadd 0\nprint', output: '0: 3 100 0', note: 'm = 1：所有鍵都在同一個桶，退化成一條串列' },
        { kind: 'edge', input: '7 4\nadd 1000000000\nadd -1000000000\ncontains -1000000000\nprint', output: 'yes\n0: -\n1: -1000000000\n2: -\n3: -\n4: -\n5: -\n6: 1000000000', note: '最大與最小的 x：10^9 mod 7 = 6，-10^9 的非負餘數是 1' },
        { kind: 'edge', input: '2 1\nprint', output: '0: -\n1: -', note: '沒有任何元素時，每個桶都印 -' },
        { kind: 'error', input: '3 4\nadd 1\ninsert 2\ncontains 2\nprint', output: 'Error\nno\n0: -\n1: 1\n2: -', note: '不認得的指令 insert：輸出 Error，2 沒有被加入，繼續處理' },
        { kind: 'error', input: '4 3\nclear\nPRINT\nadd 4', output: 'Error\nError', note: '指令名稱要完全相符（大小寫有別）' },
        { kind: 'error', input: '0 2\nadd 1\nprint', output: 'Invalid', note: 'm = 0：沒有桶可以放，不能計算 x mod 0' },
        { kind: 'error', input: '-3 1\nprint', output: 'Invalid', note: 'm 是負數' },
      ],
      hints: [
        '桶用「串列的串列」：C++ `std::vector<std::vector<int>>`、Python `[[] for _ in range(m)]`、Java `ArrayList<ArrayList<Integer>>`、JavaScript `Array.from({ length: m }, () => [])`。不要寫成 `[[]] * m`（JavaScript 的 `new Array(m).fill([])` 也一樣），那是同一個 list 的 m 個參考。',
        '非負餘數：C++ 與 JavaScript 寫 `((x % m) + m) % m`，Java 用 `Math.floorMod(x, m)`，Python 直接 `x % m`。',
        '一行一行讀，再看第一個字決定指令；不認得的指令後面可能還有參數，逐字讀取會把參數誤當成下一個指令。',
        'Java 的 `ArrayList<Integer>` 有兩個 `remove`：`remove(int index)` 依位置、`remove(Object o)` 依值。傳入 int 變數會呼叫依位置的版本，要先用 `indexOf(x)` 找到位置，或寫 `remove(Integer.valueOf(x))`。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

int main() {
    std::string line;
    std::getline(std::cin, line);
    std::istringstream head(line);
    int m, q;
    head >> m >> q;
    if (m <= 0) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<std::vector<int>> buckets(m);
    for (int i = 0; i < q && std::getline(std::cin, line); ++i) {
        std::istringstream in(line);
        std::string cmd;
        in >> cmd;
        if (cmd == "print") {
            for (int b = 0; b < m; ++b) {
                std::cout << b << ":";
                if (buckets[b].empty()) std::cout << " -";
                for (int v : buckets[b]) std::cout << " " << v;
                std::cout << "\n";
            }
        } else if (cmd == "add" || cmd == "remove" || cmd == "contains") {
            int x;
            in >> x;
            std::vector<int>& chain = buckets[((x % m) + m) % m];
            auto it = std::find(chain.begin(), chain.end(), x);
            if (cmd == "add") {
                if (it == chain.end()) chain.push_back(x);
            } else if (cmd == "remove") {
                if (it != chain.end()) chain.erase(it);
            } else {
                std::cout << (it != chain.end() ? "yes" : "no") << "\n";
            }
        } else {
            std::cout << "Error\n";
        }
    }
    return 0;
}`,
        Python: code`import sys


def main():
    lines = sys.stdin.read().splitlines()
    m, q = map(int, lines[0].split())
    if m <= 0:
        print("Invalid")
        return
    buckets = [[] for _ in range(m)]
    out = []
    for line in lines[1:q + 1]:
        parts = line.split()
        cmd = parts[0] if parts else ""
        if cmd == "print":
            for b, chain in enumerate(buckets):
                out.append(f"{b}: " + (" ".join(map(str, chain)) if chain else "-"))
        elif cmd in ("add", "remove", "contains"):
            x = int(parts[1])
            chain = buckets[x % m]
            if cmd == "add":
                if x not in chain:
                    chain.append(x)
            elif cmd == "remove":
                if x in chain:
                    chain.remove(x)
            else:
                out.append("yes" if x in chain else "no")
        else:
            out.append("Error")
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String[] head = br.readLine().trim().split("\\s+");
        int m = Integer.parseInt(head[0]), q = Integer.parseInt(head[1]);
        if (m <= 0) {
            System.out.println("Invalid");
            return;
        }
        ArrayList<ArrayList<Integer>> buckets = new ArrayList<>();
        for (int b = 0; b < m; b++) buckets.add(new ArrayList<>());
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < q; i++) {
            String line = br.readLine();
            if (line == null) break;
            String[] parts = line.trim().split("\\s+");
            String cmd = parts[0];
            if (cmd.equals("print")) {
                for (int b = 0; b < m; b++) {
                    out.append(b).append(":");
                    if (buckets.get(b).isEmpty()) out.append(" -");
                    for (int v : buckets.get(b)) out.append(" ").append(v);
                    out.append("\n");
                }
            } else if (cmd.equals("add") || cmd.equals("remove") || cmd.equals("contains")) {
                int x = Integer.parseInt(parts[1]);
                ArrayList<Integer> chain = buckets.get(Math.floorMod(x, m));
                int at = chain.indexOf(x);
                if (cmd.equals("add")) {
                    if (at < 0) chain.add(x);
                } else if (cmd.equals("remove")) {
                    if (at >= 0) chain.remove(at);  // 依位置移除
                } else {
                    out.append(at >= 0 ? "yes" : "no").append("\n");
                }
            } else {
                out.append("Error\n");
            }
        }
        System.out.print(out);
    }
}`,
        JavaScript: code`const lines = require("fs").readFileSync(0, "utf8").split("\n");
const [m, q] = lines[0].trim().split(/\s+/).map(Number);
if (m <= 0) {
    console.log("Invalid");
} else {
    const buckets = Array.from({ length: m }, () => []);
    const out = [];
    for (const line of lines.slice(1, q + 1)) {
        const parts = line.trim().split(/\s+/);
        const cmd = parts[0];
        if (cmd === "print") {
            buckets.forEach((chain, b) => out.push(b + ": " + (chain.length > 0 ? chain.join(" ") : "-")));
        } else if (cmd === "add" || cmd === "remove" || cmd === "contains") {
            const x = Number(parts[1]);
            const chain = buckets[((x % m) + m) % m];  // 非負餘數
            const at = chain.indexOf(x);
            if (cmd === "add") {
                if (at < 0) chain.push(x);
            } else if (cmd === "remove") {
                if (at >= 0) chain.splice(at, 1);  // 依位置移除一個
            } else {
                out.push(at >= 0 ? "yes" : "no");
            }
        } else {
            out.push("Error");
        }
    }
    console.log(out.join("\n"));
}`,
      },
      judge: 'none',
    },
  ],
};

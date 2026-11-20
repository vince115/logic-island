import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * PL19 語言設計取捨. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * The blueprint activity (case-study-board) is not built, so the lesson uses comparison tables and step-by-step
 * explanation instead of a visualization (BATCH_4_PLAN §2).
 */
export const PL19: LessonContent = {
  lessonId: 'PL19',
  motivation: '「哪個語言最好？」沒有答案，「這個專案該用哪個語言，代價是什麼？」才有。同一個設計決策，例如 null 怎麼表示、資料預設能不能改、整數超過上限時怎麼辦，在 C++、Java、Python、JavaScript 會造成完全不同的 bug 與成本。看懂這些取捨，才能讀懂新版本特性在修補什麼，並為一個專案寫出有根據、說得出代價的選型理由。',
  sections: [
    {
      id: 'axes', title: '四個比較軸：安全、效能、表達力與學習成本',
      blocks: [
        { type: 'p', text: '語言設計是一連串的取捨（trade-off）：每個決定都讓某些事變容易、讓另一些事變難或變貴。本課不替語言排名，而是用四個軸描述「得到什麼、付出什麼」：安全（語言預設替你擋下哪些錯）、效能（執行快慢、記憶體用量、停頓）、表達力（意圖能寫得多短多清楚）、學習成本（要先理解多少規則才不會寫錯）。下表列出四種語言在各軸上的機制，每一格都是「怎麼做」，不是分數。' },
        { type: 'table', head: ['', 'C++', 'Java', 'Python', 'JavaScript'], rows: [
          ['執行方式', '事先編譯成機器碼（AOT）', '編譯成位元組碼，JVM 直譯並以 JIT 編譯熱點', 'CPython 編譯成位元組碼後直譯（3.13 起另有預設關閉的實驗性 JIT）', '引擎（例如 V8）直譯並以 JIT 編譯熱點'],
          ['記憶體管理（PL08）', '手動或 RAII 與智慧指標，離開範圍就釋放', '追蹤式 GC', '參考計數加上循環收集器', '追蹤式 GC'],
          ['預設的安全保證', '越界、懸空指標、有號整數溢位都是未定義行為，語言不檢查', '陣列越界丟例外、沒有懸空指標；null 仍會造成 `NullPointerException`', '越界丟例外、沒有懸空指標；型別錯誤到執行時才出現', '越界讀到 `undefined` 而不丟例外；隱式轉型多'],
          ['型別檢查時機（PL04）', '編譯時（靜態）', '編譯時（靜態）', '執行時（動態）；標註給工具檢查', '執行時（動態）；TypeScript 另外提供靜態檢查'],
          ['表達力的來源', '模板、運算子多載、`constexpr`', '泛型、介面、lambda、record', '動態型別、串列與字典語法、生成式', '一級函式、物件字面值、解構'],
          ['學習成本主要來自', '未定義行為、記憶體所有權、龐大的規格', '型別與類別體系、較多樣板程式', '入門快；大型程式要靠自律與工具', '隱式轉型、`this`、非同步（PL15）'],
        ] },
        { type: 'p', text: '安全與效能常常直接交換：檢查要花成本。C++ 遵守「不用的東西不付費」（zero-overhead principle），所以 `v[i]` 不檢查索引，要檢查就改用 `v.at(i)`；Java 每次存取陣列都檢查邊界（JIT 能證明不會越界時才省略）。不過「安全」不一定花在執行時：靜態型別在編譯時擋下錯誤，執行時不花成本，付出的是比較長的宣告與比較高的學習成本。' },
        { type: 'p', text: '表達力也有代價。Python 一行 `total = sum(x * x for x in data)` 很清楚，代價是每個數字都是物件、迴圈由直譯器執行；C++ 的運算子多載讓 `a + b` 可以是矩陣相加，代價是讀程式的人看不出這一行有多貴。評估一個特性時，同時問「它讓什麼變短」與「它把什麼藏起來」。' },
        { type: 'callout', tone: 'warning', title: '「最快的語言永遠是正確的選擇」', text: '執行速度只有在瓶頸是 CPU 時才是決定因素。大多數網頁後端、命令列工具與資料腳本大部分時間在等網路、磁碟或資料庫（PL15），換成更快的語言幾乎沒有差別，卻要付出開發時間、記憶體安全的風險與團隊重新學習的成本。先找出真正的限制（延遲上限、記憶體上限、執行環境），再談速度。' },
        { type: 'callout', tone: 'note', title: '本課不使用排行榜與跑分數字', text: '流行度統計與跑分（benchmark）會隨版本、硬體與寫法大幅改變，也回答不了「這個專案適不適合」。本課只比較機制與它造成的後果，例如「這個語言沒有 GC，所以沒有 GC 停頓，但要自己確保不出現懸空指標」。' },
      ],
    },
    {
      id: 'null-safety', title: 'null 安全：「沒有值」寫在哪裡',
      blocks: [
        { type: 'p', text: 'Tony Hoare 把自己在 1965 年為 ALGOL W 加入的 null 參考稱為「十億美元的錯誤」：任何參考都可能是 null，型別卻看不出來，忘了檢查就在執行時出錯。null 安全（null safety）是指型別系統讓「可能沒有值」看得見，並在使用之前強迫處理。四種語言都沒有完整的 null 安全，各自提供了不同程度的補救：' },
        { type: 'table', head: ['語言', '表示「沒有」', '型別看得出來嗎', '沒檢查就使用', '補救工具'], rows: [
          ['C++', '`nullptr`（指標）、`std::nullopt`（C++17 的 `std::optional`）', '指標看不出；`std::optional<T>` 看得出', '解參考空指標、對空的 optional 用 `*`：未定義行為；`.value()` 丟出 `std::bad_optional_access`', '`std::optional`；參考 `T&` 不能是空的'],
          ['Java', '`null`：所有參考型別都可能是', '看不出；`Optional<T>`（Java 8）是程式庫類別與慣例', '`NullPointerException`', '`Optional`、`Objects.requireNonNull`、靜態分析標註'],
          ['Python', '`None`', '執行時看不出；標註 `str | None`（3.10 語法）給 mypy 等工具看', '`AttributeError` 或 `TypeError`', '`is None` 檢查、型別檢查工具'],
          ['JavaScript', '`null` 與 `undefined` 兩種', '看不出；TypeScript 開啟 `strictNullChecks` 才看得出', '`TypeError`', '`?.` 與 `??`（ES2020）'],
        ] },
        { type: 'p', text: '下面四個程式做同一件事：查使用者的暱稱，ann 有、bob 沒有。前兩行四種語言一樣，因為都先處理了「沒有」；第三、四行不同，正是設計決策的後果。' },
        { type: 'example', id: 'null-handling' },
        { type: 'p', text: '逐行比較：C++ 回傳 `std::optional<std::string>`，呼叫者從型別就知道要處理「沒有」，`value_or` 給預設值；同一個程式裡的原始指標 `raw` 則看不出可能是空的，只能靠紀律先檢查，因為解參考 `nullptr` 是未定義行為，不保證會當掉。Java 的 `Map.get` 回傳 null，`"raw: " + raw` 不會出錯，而是把 null 悄悄變成文字 `null`，錯誤延後到更遠的地方才被發現。Python 的 `None` 也能印出，直到呼叫 `.upper()` 才丟出 `AttributeError`。JavaScript 有兩種「沒有」：明確設定的 `null` 與根本不存在的屬性得到的 `undefined`；`?.` 遇到兩者都停下來，不丟出例外。' },
        { type: 'callout', tone: 'warning', title: '「Java 有了 Optional，就沒有 null 問題」', text: '`Optional` 只是 Java 8 加入的程式庫類別，不是型別系統的保證：任何 `String` 變數仍然可能是 null，`Map.get` 仍然回傳 null，連 `Optional` 型別的變數本身都可以是 null。`Optional.of(null)` 會直接丟出 `NullPointerException`，要包可能是 null 的值得用 `Optional.ofNullable`。真正把 null 寫進型別的是 Kotlin 的 `String?`、TypeScript 的 `strictNullChecks`，這些語言在編譯時就拒絕沒檢查的使用。' },
        { type: 'callout', tone: 'tip', title: '用 is None 與 ??，不要用 or 與 ||', text: 'Python 的 `name or "(none)"` 與 JavaScript 的 `name || "(none)"` 會把空字串、0 也當成「沒有」。只想處理「沒有值」時，Python 寫 `name if name is not None else …`，JavaScript 寫 `name ?? …`；`??` 正是 ES2020 為了修正 `||` 的這個問題而加入的。' },
      ],
    },
    {
      id: 'immutability', title: '預設不可變：誰能修改這份資料',
      blocks: [
        { type: 'p', text: '預設不可變（immutable by default）是指變數與資料在沒有特別宣告時不能修改，要修改才另外標示，例如 Rust 的 `let` 與 `let mut`、Kotlin 的 `val` 與 `var`。本課的四種語言剛好相反：預設可變，要不可變才加上 `const`、`final`、tuple 或 `Object.freeze`。後果是忘了加就可以改；共享的可變資料在多執行緒下會產生競爭條件（PL13），而真正不可變的資料可以放心交給多個執行緒同時讀。' },
        { type: 'table', head: ['語言', '寫法', '鎖住什麼', '沒鎖住什麼', '違反時'], rows: [
          ['C++', '`const`', '變數與它「擁有」的成員：`const std::vector` 不能 `push_back`', '指標成員指向的資料', '編譯錯誤'],
          ['Java', '`final` 變數、record 的欄位', '變數不能再指向別的物件', '物件本身的內容：`final List` 仍然可以 `add`', '重新指定是編譯錯誤；`List.of`、`List.copyOf` 的修改丟出 `UnsupportedOperationException`'],
          ['Python', 'tuple、`frozenset`、`@dataclass(frozen=True)`', 'tuple 的每個位置指向哪個物件', '位置上的可變物件，例如 tuple 裡的 list', '`TypeError`；frozen dataclass 丟出 `FrozenInstanceError`'],
          ['JavaScript', '`const`、`Object.freeze`', '`const`：變數不能重新指定；`freeze`：物件第一層的屬性', '巢狀的物件與陣列', '嚴格模式丟出 `TypeError`；非嚴格模式悄悄忽略'],
        ] },
        { type: 'example', id: 'shallow-immutability' },
        { type: 'p', text: '四個程式都在示範「外層鎖住、內層沒鎖住」。C++ 的 `const` 對值語意的成員是深的：`limits.ports` 也變成 const，`push_back` 根本無法編譯（所以寫在註解裡），要修改只能複製一份；但指標成員只有指標本身是 const，`*limits.maxUsers = 200` 合法。Java 的 `final` 與 record 欄位只保證不換成別的清單，清單內容照樣增加；`List.copyOf` 才得到不可修改的複本。Python 的 tuple 不能改位置，裡面的 list 卻能 `append`，連帶讓這個 tuple 不能當字典的鍵。JavaScript 的 `Object.freeze` 擋下 `config.name` 的修改，`config.ports` 這個陣列卻沒有被凍結。' },
        { type: 'callout', tone: 'warning', title: '「Object.freeze 讓物件完全不可變」', text: '`Object.freeze` 是淺的（shallow）：只凍結物件自己的屬性，屬性指向的陣列與物件仍然可以修改，要深層凍結得自己遞迴凍結每一層。另外在非嚴格模式下，修改凍結的屬性不會丟出例外，只是悄悄沒有作用，錯誤更難發現；範例第一行的 `"use strict"` 就是為了讓違反變成 `TypeError`。Java 的 `final`、C++ 的指標成員、Python 的 tuple 都有同樣「只鎖一層」的性質。' },
      ],
    },
    {
      id: 'memory-and-integers', title: '記憶體管理與整數：安全與效能的直接交換',
      blocks: [
        { type: 'p', text: '記憶體管理的方式（PL08）決定了誰在什麼時候釋放物件，也決定了會出現哪一類 bug。沒有一種方式全面勝出：' },
        { type: 'table', head: ['方式', '語言', '得到', '付出'], rows: [
          ['手動與 RAII', 'C++', '釋放時間確定、沒有 GC 停頓、記憶體用量可預測', '懸空指標、重複釋放、洩漏都可能發生，靠智慧指標與紀律避免'],
          ['參考計數＋循環收集', 'Python', '沒有參考時立刻釋放，檔案等資源多半及時關閉', '每次指定都要更新計數；循環參考要靠收集器，收集時會停頓'],
          ['追蹤式 GC', 'Java、JavaScript', '不會有懸空指標與重複釋放；循環參考不是問題', 'GC 停頓與額外的記憶體；何時釋放不確定，資源要用 try-with-resources 等方式關閉'],
        ] },
        { type: 'p', text: '整數超過上限時怎麼辦，是另一個安全與效能的取捨。固定寬度的整數用一條 CPU 指令就能相加，但會溢位；任意精度的整數不會溢位，但每次運算都要檢查大小、配置記憶體：' },
        { type: 'table', head: ['語言', '整數型別', '超過上限', '需要其他行為時'], rows: [
          ['C++', '固定寬度：`int`（常見為 32 位元）、`long long`、`std::uint32_t`', '有號：未定義行為，編譯器可以假設它不會發生；無號：依定義取 2ⁿ 的餘數（繞回）', '先檢查再運算，或改用更寬的型別'],
          ['Java', '`int` 32 位元、`long` 64 位元，寬度由規格固定', '二補數繞回（wraparound），不丟例外', '`Math.addExact` 丟出 `ArithmeticException`；`BigInteger`'],
          ['Python', '`int` 是任意精度', '不會溢位，數字變大、運算變慢', '需要固定寬度時自己取餘數，或用 NumPy 的固定寬度型別'],
          ['JavaScript', '`number` 是 64 位元雙精度浮點數；`BigInt`（ES2020）', '不會繞回，但超過 `Number.MAX_SAFE_INTEGER`（2⁵³ − 1）後無法精確表示每個整數；位元運算先轉成 32 位元整數', '`BigInt`、`Number.isSafeInteger`'],
        ] },
        { type: 'example', id: 'integer-limits' },
        { type: 'p', text: '同樣是「最大的 32 位元整數加 1」：Java 得到 −2147483648 並繼續執行，Python 與 JavaScript 得到 2147483648。C++ 的程式刻意沒有執行這個加法，因為有號整數溢位是未定義行為，不是「會得到負數」；它先用 `addOverflows` 檢查，並示範無號整數的繞回才是有定義的。2⁵³ + 1 在 C++、Java 的 64 位元整數與 Python 都精確，在 JavaScript 的 number 卻變成 9007199254740992，要用 `BigInt` 才正確；Python 把它轉成 `float` 時也一樣會失去精度，這是雙精度浮點數本身的限制，不是 JavaScript 特有的。' },
        { type: 'callout', tone: 'warning', title: '在 C++ 用「加完再檢查」偵測有號溢位', text: '`if (a + b < a)` 這種寫法對有號整數無效：溢位在加法時就已經是未定義行為，編譯器可以假設它不會發生，把整個檢查最佳化掉。正確做法是在運算前比較，例如 `b > 0 && a > INT_MAX - b`，或改用無號整數、更寬的型別。未定義行為讓編譯器能產生更快的程式，這就是 C++ 選擇效能的代價。' },
      ],
    },
    {
      id: 'equality', title: '相等：比較內容，還是比較是不是同一個',
      blocks: [
        { type: 'p', text: '「a 等於 b」有兩種意思：內容相等（value equality），或是同一個物件（identity）。四種語言都兩種都能問，但 `==` 代表哪一種不同，寫錯了程式照樣能執行，只是結果「有時對、有時錯」：' },
        { type: 'table', head: ['語言', '比較內容', '比較是不是同一個', '陷阱'], rows: [
          ['C++', '`==`：由型別定義，`std::string` 比較內容', '比較位址 `&a == &b`', '`const char*` 的 `==` 比較位址，C 字串要用 `std::strcmp`'],
          ['Java', '`equals`：自訂類別要同時覆寫 `equals` 與 `hashCode`，record 自動產生', '`==`（對參考型別）', '字串與 `Integer` 用 `==` 有時剛好是 true（PL05 的快取）'],
          ['Python', '`==`（呼叫 `__eq__`）', '`is`', '`is` 只用來比較 `None`；小整數與字串的 `is` 結果取決於實作'],
          ['JavaScript', '`===` 比較基本型別的值；物件沒有內建的內容比較', '`===`（對物件）', '`==` 先轉型：`"1" == 1`、`null == undefined` 都是 true'],
        ] },
        { type: 'example', id: 'same-or-equal' },
        { type: 'p', text: 'Java 的 `a == b` 是 false，因為 `new String("hi")` 是另一個物件；`equals` 才比較內容。record `Point` 沒有寫任何 `equals`，兩個內容相同的點卻相等，因為 record 依欄位自動產生了 `equals` 與 `hashCode`。JavaScript 保留了會轉型的 `==`，再加上不轉型的 `===`：直接改變 `==` 的意思會讓已經上線的網頁壞掉，這是下一節「向後相容」的典型代價。' },
      ],
    },
    {
      id: 'evolution', title: '向後相容、生態系與新版本特性',
      blocks: [
        { type: 'p', text: '向後相容（backward compatibility）是指舊程式在新版本的語言或執行環境上仍然能執行。相容性保護了既有的程式與投資，但也把早期的錯誤永遠留下；打破相容能修正錯誤，代價是所有人都要遷移。四種語言做了不同的選擇：' },
        { type: 'table', head: ['語言', '相容策略', '例子', '代價'], rows: [
          ['C++', '新標準幾乎不破壞舊程式，只偶爾移除早已棄用的功能', '`std::auto_ptr` 在 C++11 棄用、C++17 移除；GCC 5 的 libstdc++ 為符合 C++11 改變 `std::string` 的實作，新舊編譯出的二進位介面（ABI）不能直接混用', '語言越來越大；原始指標、C 陣列等危險寫法仍然合法'],
          ['Java', '非常重視相容：舊版編譯的 `.class` 檔在新的 JVM 上仍能執行', '泛型採用型別擦除，一個重要原因是讓舊程式與新程式庫互通（PL05）；原始型別至今仍合法', '型別擦除的限制無法收回；null 無法從語言中移除'],
          ['Python', 'Python 3（2008）刻意不相容', '`print` 變成函式、`/` 變成真除法、字串預設為 Unicode 並與 `bytes` 分開；Python 2 在 2020 年停止維護', '整個社群花了十多年遷移，許多函式庫要同時支援兩個版本'],
          ['JavaScript', '「不要破壞網頁」（don\'t break the web）：已上線的網站不能因為新瀏覽器而壞掉', '`typeof null === "object"` 這個早期錯誤保留至今；`==` 保留、另加 `===`；嚴格模式要寫 `"use strict"` 才啟用', '錯誤只能「加新的、不刪舊的」，語言裡同時存在新舊兩套做法'],
        ] },
        { type: 'p', text: '生態系（ecosystem）是語言以外的一切：套件管理、函式庫、工具與社群慣例。JavaScript 有 npm，Python 有 PyPI 與 pip，Java 有 Maven Central 與 Maven、Gradle；C++ 沒有官方的套件管理，常見做法是 CMake 搭配 vcpkg 或 Conan。選型時生態系常常比語法更有決定性：資料分析選 Python 多半是因為 NumPy 與 pandas，瀏覽器前端選 JavaScript 是因為瀏覽器直接執行它。生態系的代價是相依套件的品質、授權與供應鏈安全都要自己把關。' },
        { type: 'p', text: '新版本特性幾乎都是在修補上面看到的痛點。讀一個新特性時問三個問題：以前怎麼寫？它讓哪一類錯誤或樣板消失？它沒有解決什麼？' },
        { type: 'table', head: ['特性', '版本', '以前怎麼寫', '解決的問題', '沒有解決的'], rows: [
          ['`std::optional`、結構化綁定、`if` 帶初始化', 'C++17', '回傳 −1 或用輸出參數；`pair.first`、`pair.second`', '把「可能沒有」寫進型別；一次取出多個值；把變數範圍縮到 `if` 內', '對空的 optional 用 `*` 仍是未定義行為'],
          ['record', 'Java 16', '手寫建構子、存取方法、`equals`、`hashCode`、`toString`', '資料類別的樣板程式；依內容相等', '欄位指向的物件仍可修改；欄位仍可能是 null'],
          ['`instanceof` 模式比對', 'Java 16', '`if (s instanceof Rect) { Rect r = (Rect) s; … }`', '檢查後再轉型的重複，以及轉錯型別', '`switch` 的模式比對要到 Java 21 才正式加入'],
          ['sealed 類別與介面', 'Java 17', '只能在文件寫明有哪些子類別', '限定子型別，讓所有情況可以列舉', '`if` 串仍然不檢查是否涵蓋每一種'],
          ['`match` 結構化模式比對', 'Python 3.10', '`isinstance` 與 `len` 檢查的一長串 `if`／`elif`', '依資料的形狀分支，同時取出欄位', '執行時才比對，不做型別檢查'],
          ['`?.` 與 `??`', 'ES2020', '`a && a.b`、`x || 預設值`', '存取深層屬性不丟出 `TypeError`；`??` 不把 0 與空字串當成沒有', '可能把「資料缺漏」這個 bug 靜靜吞掉'],
          ['`BigInt`', 'ES2020', '用字串或第三方函式庫表示大整數', '超過 2⁵³ 的整數精確運算', '不能和 number 直接混合運算'],
        ] },
        { type: 'example', id: 'modern-features' },
        { type: 'p', text: '四個程式輸出完全相同，各自用了表中的新特性。C++ 的 `area` 回傳 `std::optional<int>`，呼叫端在 `if` 的初始化裡取得結果；Java 的 sealed 介面限定只有三種形狀，`instanceof Rect r` 同時檢查並取得變數，record 省去所有存取方法；Python 的 `match` 依 tuple 的長度與第一個值分支；JavaScript 的 `shape.size?.w` 在圓形沒有 `size` 時得到 `undefined` 而不是丟出例外。注意 `area(shape) ?? "unsupported"`：面積為 0 時 `??` 會保留 0，改用 `||` 就會誤印 unsupported。' },
        { type: 'callout', tone: 'note', title: '本站範例的版本界線', text: '範例以 C++17 與 Java 17 編譯，所以 C++20 的 concepts、C++23 的 `std::expected`、Java 21 的 `switch` 模式比對與 record 模式只在正文提及，不出現在可執行的程式裡。讀新特性時也要確認團隊的編譯器、執行環境與相依套件是否都支援，這本身就是向後相容的一部分成本。' },
      ],
    },
    {
      id: 'choosing', title: '為專案情境選語言：寫出理由與代價',
      blocks: [
        { type: 'p', text: '選型分析的價值不在結論，而在把理由與代價寫清楚，讓別人能檢查、條件改變時能重新評估。一個可重複的步驟如下：' },
        { type: 'list', ordered: true, items: [
          '列出硬性限制（必須）：執行環境（瀏覽器、微控制器、沒有作業系統）、延遲或記憶體的上限、必須整合的既有系統。不符合任何一項的選項直接淘汰，不參與比分。',
          '列出偏好與權重：開發速度、團隊熟悉度、生態系、維護年限、安全要求。權重表示這個專案有多在乎，不同專案的權重不同。',
          '逐項評估每個選項，寫出它「得到什麼」與「付出什麼」，不只寫優點。',
          '做出選擇，寫下被選中的選項的代價與緩解方式，例如選 C++ 就加上 sanitizer、靜態分析與程式碼審查；選 Python 就要有型別檢查與測試。',
        ] },
        { type: 'p', text: '下面是本課練習使用的評分表。每格是 0（不符合）、1（可以）或 2（擅長），代表本課為練習定下的簡化規則，依據前面各節的機制：例如 `latency` 看有沒有 GC 停頓、`static-types` 看是否在編譯時檢查型別、`parallel` 以有 GIL 的預設 CPython 計。' },
        { type: 'table', head: ['需求', '意思', 'C++', 'Java', 'Python', 'JavaScript'], rows: [
          ['`latency`', '低而且可預測的延遲', '2', '1', '0', '1'],
          ['`memory-safety`', '語言保證沒有越界寫入與懸空指標', '0', '2', '2', '2'],
          ['`static-types`', '編譯時檢查型別', '2', '2', '0', '0'],
          ['`prototype`', '快速做出原型、樣板少', '0', '1', '2', '2'],
          ['`learning`', '新手的學習成本低', '0', '1', '2', '1'],
          ['`parallel`', 'CPU 密集工作用多核心平行', '2', '2', '0', '1'],
          ['`startup`', '啟動快（命令列工具、冷啟動）', '2', '0', '1', '1'],
          ['`browser`', '在瀏覽器中直接執行', '0', '0', '0', '2'],
          ['`data`', '資料分析與科學計算的生態系', '1', '1', '2', '1'],
          ['`team-cpp`／`team-java`／`team-python`／`team-js`', '團隊已經熟悉該語言', '對應的語言 2，其他 0', '同左', '同左', '同左'],
        ] },
        { type: 'p', text: '例如一個交易撮合服務：延遲是硬性限制（`latency must`），另外在乎平行（權重 3）、記憶體安全（3），團隊熟悉 Java（2）。Python 的 `latency` 是 0，先被淘汰；Java 得 2×3 + 2×3 + 2×2 = 16，JavaScript 得 1×3 + 2×3 = 9，C++ 得 2×3 = 6。寫成分析就是：選 Java，因為它在平行、記憶體安全與團隊熟悉度都符合；代價是 GC 停頓，必須設定延遲目標並實際量測、選擇低停頓的收集器；如果延遲要求嚴格到不能有任何 GC 停頓，`latency` 的評分就不夠細，結論應該重新檢討。' },
        { type: 'callout', tone: 'warning', title: '把評分表當成語言排名', text: '表格只是把前面各節的機制壓縮成數字，方便練習推理；它不是「哪個語言比較好」的排名。把每個需求權重都設成 1 加總起來沒有意義，因為真實專案不會同樣在乎每一件事。分數接近時，真正決定結果的是寫出來的理由與代價，以及哪一項硬性限制被你漏掉了。' },
      ],
    },
  ],
  examples: [
    {
      id: 'null-handling', title: '查不到的暱稱：四種「沒有值」',
      description: '同樣查兩個使用者，處理過的「沒有」四語相同；沒檢查就使用時，C++ 的 `.value()`、Java、Python、JavaScript 各自以不同的錯誤失敗。',
      output: 'ann: Annie, length 5\nbob: (none), length 0\nraw: null\nunchecked: std::bad_optional_access',
      outputByLanguage: {
        Java: 'ann: Annie, length 5\nbob: (none), length 0\nraw: null\nunchecked: NullPointerException',
        Python: 'ann: Annie, length 5\nbob: (none), length 0\nraw: None\nunchecked: AttributeError',
        JavaScript: 'ann: Annie, length 5\nbob: (none), length 0\nraw: null / undefined\nunchecked: TypeError',
      },
      code: {
        'C++': code`#include <iostream>
#include <map>
#include <optional>
#include <string>

// std::optional（C++17）：「可能沒有值」寫在回傳型別上
std::optional<std::string> nickname(const std::map<std::string, std::string>& users, const std::string& id) {
    auto it = users.find(id);
    if (it == users.end()) return std::nullopt;
    return it->second;
}

int main() {
    const std::map<std::string, std::string> users{{"ann", "Annie"}};
    for (const char* id : {"ann", "bob"}) {
        std::optional<std::string> name = nickname(users, id);
        std::cout << id << ": " << name.value_or("(none)")
                  << ", length " << (name ? name->size() : 0) << "\n";
    }
    const std::string* raw = nullptr;  // 舊式寫法：用空指標表示「沒有」，型別看不出來
    std::cout << "raw: " << (raw ? *raw : std::string("null")) << "\n";  // 解參考 nullptr 是未定義行為
    try {
        std::cout << nickname(users, "bob").value() << "\n";  // 沒檢查就取值
    } catch (const std::bad_optional_access&) {
        std::cout << "unchecked: std::bad_optional_access\n";
    }
    return 0;
}`,
        Java: code`import java.util.Map;
import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        Map<String, String> users = Map.of("ann", "Annie");
        for (String id : new String[] {"ann", "bob"}) {
            // Map.get 找不到時回傳 null；Optional（Java 8）把它包起來
            Optional<String> name = Optional.ofNullable(users.get(id));
            System.out.println(id + ": " + name.orElse("(none)")
                + ", length " + name.map(String::length).orElse(0));
        }
        String raw = users.get("bob");  // 型別是 String，看不出可能是 null
        System.out.println("raw: " + raw);  // 字串串接把 null 悄悄變成文字 "null"
        try {
            System.out.println(users.get("bob").length());  // 沒檢查就使用
        } catch (NullPointerException e) {
            System.out.println("unchecked: NullPointerException");
        }
    }
}`,
        Python: code`users = {"ann": "Annie"}
for user_id in ["ann", "bob"]:
    name = users.get(user_id)  # 找不到時回傳 None
    shown = name if name is not None else "(none)"
    length = len(name) if name is not None else 0
    print(f"{user_id}: {shown}, length {length}")

raw = users.get("bob")
print("raw:", raw)  # None 印出來就是 None，程式繼續往下走
try:
    print(users.get("bob").upper())  # 沒檢查就使用
except AttributeError:
    print("unchecked: AttributeError")`,
        JavaScript: code`const users = new Map([["ann", "Annie"]]);
for (const id of ["ann", "bob"]) {
    const name = users.get(id); // 找不到時回傳 undefined
    // ES2020：?. 遇到 null／undefined 就停下來，?? 只替換 null／undefined
    console.log(id + ": " + (name ?? "(none)") + ", length " + (name?.length ?? 0));
}
const settings = { timeout: null }; // 明確設成 null；retries 根本沒有這個屬性
console.log("raw: " + settings.timeout + " / " + settings.retries);
try {
    console.log(users.get("bob").length); // 沒檢查就使用
} catch (e) {
    console.log("unchecked: " + e.name);
}`,
      },
    },
    {
      id: 'shallow-immutability', title: '外層鎖住、內層沒鎖住',
      description: '`const`、`final` 與 record、tuple、`Object.freeze` 各自鎖住了哪一層。',
      output: 'ports 2, copy 3\nmaxUsers 200',
      outputByLanguage: {
        Java: 'final list: [80, 443, 8080]\nrecord list: [80, 443, 8080, 9090]\ncopyOf add: UnsupportedOperationException',
        Python: 'tuple item: TypeError\nnested list: [80, 443, 8080]\nhash(config): TypeError',
        JavaScript: 'frozen property: TypeError\nnested array: 80 443 8080\nports frozen? false',
      },
      code: {
        'C++': code`#include <iostream>
#include <vector>

struct Limits {
    std::vector<int> ports;
    int* maxUsers;  // 指標成員
};

int main() {
    int maxUsers = 100;
    const Limits limits{{80, 443}, &maxUsers};
    // limits.ports.push_back(8080);  // 編譯錯誤：const 物件擁有的成員也是 const
    *limits.maxUsers = 200;  // 可以：const 的是指標本身，不是它指向的 int
    std::vector<int> copy = limits.ports;  // 要改就複製一份
    copy.push_back(8080);
    std::cout << "ports " << limits.ports.size() << ", copy " << copy.size() << "\n";
    std::cout << "maxUsers " << maxUsers << "\n";
    return 0;
}`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    record Limits(List<Integer> ports) {}  // record 的欄位是 final

    public static void main(String[] args) {
        final List<Integer> ports = new ArrayList<>(List.of(80, 443));
        ports.add(8080);  // final 只鎖住變數，不鎖住物件的內容
        System.out.println("final list: " + ports);
        Limits limits = new Limits(ports);
        limits.ports().add(9090);  // record 也一樣：欄位不能換，清單可以改
        System.out.println("record list: " + limits.ports());
        List<Integer> fixed = List.copyOf(ports);  // 不可修改的複本
        try {
            fixed.add(1);
        } catch (UnsupportedOperationException e) {
            System.out.println("copyOf add: UnsupportedOperationException");
        }
    }
}`,
        Python: code`limits = (80, 443)
try:
    limits[0] = 8080  # tuple 的位置不能重新指定
except TypeError:
    print("tuple item: TypeError")

config = ("prod", [80, 443])  # tuple 裡放了一個 list
config[1].append(8080)  # tuple 沒變，變的是它指向的 list
print("nested list:", config[1])
try:
    hash(config)  # 含有可變的 list，所以不能當 dict 的鍵
except TypeError:
    print("hash(config): TypeError")`,
        JavaScript: code`"use strict";
const config = Object.freeze({ name: "prod", ports: [80, 443] });
try {
    config.name = "dev"; // 凍結的屬性：嚴格模式下丟出 TypeError
} catch (e) {
    console.log("frozen property: " + e.name);
}
config.ports.push(8080); // 但裡面的陣列沒有被凍結
console.log("nested array: " + config.ports.join(" "));
console.log("ports frozen? " + Object.isFrozen(config.ports));`,
      },
    },
    {
      id: 'integer-limits', title: '最大的整數再加 1',
      description: 'C++ 不執行未定義行為，而是先檢查並示範無號繞回；Java 繞回；Python 自動變大；JavaScript 的 number 在 2⁵³ 之後失去精度。',
      output: 'int max + 1: overflow detected\n2^53 + 1: 9007199254740993\nuint32 max + 1: 0',
      outputByLanguage: {
        Java: 'int max + 1: -2147483648\n2^53 + 1: 9007199254740993\naddExact: ArithmeticException',
        Python: 'int max + 1: 2147483648\n2^53 + 1: 9007199254740993\n2^100: 1267650600228229401496703205376\nfloat(2^53 + 1) == float(2^53): True',
        JavaScript: 'int max + 1: 2147483648\n2^53 + 1: 9007199254740992\nsafe? false, MAX_SAFE_INTEGER 9007199254740991\nBigInt 2^53 + 1: 9007199254740993\n(big + 1) | 0: -2147483648',
      },
      code: {
        'C++': code`#include <cstdint>
#include <iostream>
#include <limits>

// 先檢查再加：有號整數溢位是未定義行為，不能「加了再看」
bool addOverflows(int a, int b) {
    return (b > 0 && a > std::numeric_limits<int>::max() - b) ||
           (b < 0 && a < std::numeric_limits<int>::min() - b);
}

int main() {
    int big = std::numeric_limits<int>::max();
    std::cout << "int max + 1: " << (addOverflows(big, 1) ? "overflow detected" : "ok") << "\n";
    long long exact = (1LL << 53) + 1;
    std::cout << "2^53 + 1: " << exact << "\n";
    std::uint32_t u = std::numeric_limits<std::uint32_t>::max();
    u = u + 1;  // 無號整數依定義取 2^32 的餘數
    std::cout << "uint32 max + 1: " << u << "\n";
    return 0;
}`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int big = Integer.MAX_VALUE;
        System.out.println("int max + 1: " + (big + 1));  // 規格明定：二補數繞回
        long exact = (1L << 53) + 1;
        System.out.println("2^53 + 1: " + exact);
        try {
            Math.addExact(big, 1);  // 需要時改用會檢查的版本
        } catch (ArithmeticException e) {
            System.out.println("addExact: ArithmeticException");
        }
    }
}`,
        Python: code`big = 2**31 - 1
print("int max + 1:", big + 1)  # int 沒有上限，需要時自動變大
print("2^53 + 1:", 2**53 + 1)
print("2^100:", 2**100)
print("float(2^53 + 1) == float(2^53):", float(2**53 + 1) == float(2**53))  # 浮點數會失去精度`,
        JavaScript: code`const big = 2147483647;
console.log("int max + 1: " + (big + 1)); // number 是雙精度浮點數，不會繞回負數
console.log("2^53 + 1: " + (2 ** 53 + 1)); // 超過 2^53 的整數不是每個都能精確表示
console.log("safe? " + Number.isSafeInteger(2 ** 53 + 1) + ", MAX_SAFE_INTEGER " + Number.MAX_SAFE_INTEGER);
console.log("BigInt 2^53 + 1: " + (2n ** 53n + 1n)); // ES2020 BigInt：任意精度整數
console.log("(big + 1) | 0: " + ((big + 1) | 0)); // 位元運算先轉成 32 位元整數`,
      },
    },
    {
      id: 'same-or-equal', title: '內容相同，是同一個嗎',
      description: '`==`、`equals`、`is`、`===` 各自比較內容還是身分，以及 JavaScript `==` 的轉型。',
      output: 'a == b: true\np == q: false\nstrcmp(p, q) == 0: true',
      outputByLanguage: {
        Java: 'a == b: false\na.equals(b): true\nPoint equals: true\nObjects.equals(missing, a): false',
        Python: 'a == b: True\na is b: False\n1 == 1.0: True\nvalue is None: True',
        JavaScript: '"1" == 1: true\n"1" === 1: false\nnull == undefined: true\n[1] === [1]: false',
      },
      code: {
        'C++': code`#include <cstring>
#include <iostream>
#include <string>

int main() {
    std::string a = "hi";
    std::string b = "h";
    b += "i";  // 執行時組出來的另一個字串
    std::cout << std::boolalpha;
    std::cout << "a == b: " << (a == b) << "\n";  // std::string 的 == 比較內容
    const char* p = a.c_str();
    const char* q = b.c_str();
    std::cout << "p == q: " << (p == q) << "\n";  // 指標的 == 比較位址
    std::cout << "strcmp(p, q) == 0: " << (std::strcmp(p, q) == 0) << "\n";  // C 字串要逐字比較
    return 0;
}`,
        Java: code`import java.util.Objects;

public class Main {
    record Point(int x, int y) {}  // record 自動產生比較內容的 equals

    public static void main(String[] args) {
        String a = "hi";
        String b = new String("hi");  // 內容相同的另一個物件
        System.out.println("a == b: " + (a == b));  // 參考型別的 == 比較是不是同一個物件
        System.out.println("a.equals(b): " + a.equals(b));  // equals 比較內容
        System.out.println("Point equals: " + new Point(1, 2).equals(new Point(1, 2)));
        String missing = null;
        System.out.println("Objects.equals(missing, a): " + Objects.equals(missing, a));  // 可處理 null
    }
}`,
        Python: code`a = [1, 2]
b = [1, 2]
print("a == b:", a == b)  # == 比較內容（呼叫 __eq__）
print("a is b:", a is b)  # is 比較是不是同一個物件
print("1 == 1.0:", 1 == 1.0)  # 不同的數字型別依數值比較
value = None
print("value is None:", value is None)  # None 只有一個，用 is 檢查`,
        JavaScript: code`console.log('"1" == 1: ' + ("1" == 1)); // == 會先轉型再比較
console.log('"1" === 1: ' + ("1" === 1)); // === 不轉型：型別不同就是 false
console.log("null == undefined: " + (null == undefined));
console.log("[1] === [1]: " + ([1] === [1])); // 物件比較的是不是同一個物件`,
      },
    },
    {
      id: 'modern-features', title: '同一個工作，用新版本特性寫',
      description: 'C++17 的 `std::optional` 與結構化綁定、Java 16／17 的 record、`instanceof` 模式比對與 sealed、Python 3.10 的 `match`、ES2020 的 `?.` 與 `??`。',
      output: 'rect -> 6\nsquare -> 16\ncircle -> unsupported',
      code: {
        'C++': code`#include <iostream>
#include <optional>
#include <string>
#include <vector>

struct Shape {
    std::string kind;
    int a;
    int b;
};

// C++17 std::optional：「算不出來」不必再回傳 -1 之類的特殊值
std::optional<int> area(const std::string& kind, int a, int b) {
    if (kind == "rect") return a * b;
    if (kind == "square") return a * a;
    return std::nullopt;
}

int main() {
    const std::vector<Shape> shapes{{"rect", 2, 3}, {"square", 4, 0}, {"circle", 5, 0}};
    for (const auto& [kind, a, b] : shapes) {  // C++17 結構化綁定
        if (auto r = area(kind, a, b); r.has_value()) {  // C++17 if 帶初始化
            std::cout << kind << " -> " << *r << "\n";
        } else {
            std::cout << kind << " -> unsupported\n";
        }
    }
    return 0;
}`,
        Java: code`import java.util.List;
import java.util.Locale;

public class Main {
    sealed interface Shape permits Rect, Square, Circle {}  // Java 17 sealed：子型別只有這三個
    record Rect(int w, int h) implements Shape {}  // Java 16 record
    record Square(int side) implements Shape {}
    record Circle(int r) implements Shape {}

    static String area(Shape s) {
        if (s instanceof Rect r) return String.valueOf(r.w() * r.h());  // Java 16 instanceof 模式比對
        if (s instanceof Square q) return String.valueOf(q.side() * q.side());
        return "unsupported";
    }

    public static void main(String[] args) {
        List<Shape> shapes = List.of(new Rect(2, 3), new Square(4), new Circle(5));
        for (Shape s : shapes) {
            String kind = s.getClass().getSimpleName().toLowerCase(Locale.ROOT);
            System.out.println(kind + " -> " + area(s));
        }
    }
}`,
        Python: code`shapes = [("rect", 2, 3), ("square", 4), ("circle", 5)]

for shape in shapes:
    match shape:  # Python 3.10 結構化模式比對：依形狀分支並取出欄位
        case ("rect", w, h):
            print(f"rect -> {w * h}")
        case ("square", side):
            print(f"square -> {side * side}")
        case (kind, *_):
            print(f"{kind} -> unsupported")`,
        JavaScript: code`const shapes = [
    { kind: "rect", size: { w: 2, h: 3 } },
    { kind: "square", side: 4 },
    { kind: "circle", radius: 5 },
];

function area(shape) {
    const { kind, side } = shape; // ES2015 解構
    if (kind === "square") return side * side;
    const w = shape.size?.w; // ES2020 ?.：size 不存在時得到 undefined，不丟出 TypeError
    const h = shape.size?.h;
    return w !== undefined && h !== undefined ? w * h : undefined;
}

for (const shape of shapes) {
    console.log(shape.kind + " -> " + (area(shape) ?? "unsupported")); // ES2020 ??
}`,
      },
    },
  ],
  quiz: [
    {
      id: 'q1', prompt: '下面的 Java 程式（已 import java.util.*）執行時會發生什麼事？',
      code: { language: 'Java', text: 'Map<String, String> m = new HashMap<>();\nOptional<String> o = Optional.of(m.get("x"));\nSystem.out.println(o.isPresent());' },
      options: ['輸出 false', '輸出 true', '在 Optional.of 丟出 NullPointerException', '編譯錯誤：Optional.of 不接受可能是 null 的值'],
      answer: 2,
      explanation: '`m.get("x")` 找不到鍵，回傳 null；`Optional.of` 規定引數不能是 null，所以直接丟出 NullPointerException，根本走不到 println，因此不會輸出 false 或 true。編譯器無法知道 `m.get` 會不會回傳 null，所以也不是編譯錯誤，這正是 Java 沒有型別層級 null 安全的後果。要包可能是 null 的值，應該用 `Optional.ofNullable`，那樣才會輸出 false。',
    },
    {
      id: 'q2', prompt: '下面的 JavaScript（Node.js）程式輸出什麼？`"use strict"; const cfg = Object.freeze({ ports: [80] }); cfg.ports.push(443); console.log(cfg.ports.length);`',
      options: ['1', '2', '丟出 TypeError，沒有輸出', 'undefined'],
      answer: 1,
      explanation: '`Object.freeze` 是淺的：它凍結 `cfg` 自己的屬性（`cfg.ports` 不能指向別的陣列），但陣列本身沒有被凍結，所以 `push` 成功，長度是 2。嚴格模式只會讓「修改凍結的屬性」丟出 TypeError，`push` 修改的是沒凍結的陣列，所以不會丟出例外；也不會被悄悄忽略而停在 1。`length` 是陣列一定有的屬性，不會是 undefined。',
    },
    {
      id: 'q3', prompt: '下面的 C++ 程式（已 include iostream）輸出什麼？',
      code: { language: 'C++', text: 'int main() {\n    unsigned int u = 0;\n    u = u - 1;\n    std::cout << (u > 0) << "\\n";\n}' },
      options: ['1', '0', '未定義行為，結果無法預測', '編譯錯誤：無號整數不能減到負數'],
      answer: 0,
      explanation: '無號整數的運算由標準定義為取 2ⁿ 的餘數，0 − 1 繞回最大值（32 位元時是 4294967295），所以 `u > 0` 成立，輸出 1，不是 0。未定義行為的是「有號」整數溢位，例如 `INT_MAX + 1`；無號整數的繞回是有定義的，所以不是無法預測。這段程式完全合法，不會編譯錯誤。',
    },
    {
      id: 'q4', prompt: 'ES2020 加入了 `??`。下面的 JavaScript（Node.js）程式輸出什麼？`const retries = 0; console.log(retries || 3, retries ?? 3);`',
      options: ['3 3', '0 0', '3 0', '0 3'],
      answer: 2,
      explanation: '`||` 把所有「假值」（0、空字串、false、null、undefined、NaN）都換成右邊，所以 `0 || 3` 是 3；`??` 只在左邊是 null 或 undefined 時才換，所以 `0 ?? 3` 保留 0。答案是 3 0。「3 3」是以為兩者相同，「0 0」是以為 `||` 也保留 0，「0 3」則把兩者弄反了。這正是 `??` 要解決的問題：設定值 0 是合法的，不該被當成「沒有設定」。',
    },
    {
      id: 'q5', prompt: 'Java 16 正式加入的 record 主要解決了什麼問題？',
      options: ['讓物件深層不可變：record 欄位裡的清單也不能再修改', '消除 null：record 的欄位不可能是 null', '讓類別可以在執行時新增欄位', '省去資料類別的樣板程式：建構子、存取方法、equals、hashCode 與 toString 由編譯器依欄位產生'],
      answer: 3,
      explanation: 'record 是「只裝資料」的類別，編譯器依欄位自動產生建構子、存取方法與依內容比較的 equals、hashCode、toString，解決的是樣板程式與手寫 equals 寫錯的問題。它的欄位是 final，但只是淺層：欄位指向的 List 仍可修改（本課範例中的 record list 就被加了元素），所以不是深層不可變；欄位也可以是 null；Java 的類別在執行時不能新增欄位，record 也不例外。',
    },
    {
      id: 'q6', prompt: '一個感測器的韌體：微控制器只有 64 KB RAM、沒有作業系統，每 1 毫秒必須完成一次讀值，不允許垃圾回收造成的停頓；團隊目前熟悉 Python 與 Java。依這些限制，哪個選擇最合理？',
      options: ['Python：團隊最熟悉，開發最快', 'C++：不需要 GC 與大型執行環境，能滿足硬性限制；代價是團隊要學習記憶體管理，並以審查、靜態分析與測試降低未定義行為的風險', 'Java：團隊熟悉，而且 JIT 編譯後執行很快', 'JavaScript（Node.js）：事件迴圈適合處理感測器事件'],
      answer: 1,
      explanation: '先套用硬性限制：沒有作業系統，Node.js 無法執行；不允許 GC 停頓，排除依賴 GC 的 Java 與 JavaScript，CPython 除了參考計數也有循環收集器，而且需要執行環境，64 KB RAM 也放不下 JVM 或 CPython。團隊熟悉度是偏好，不能推翻硬性限制，所以 Python 與 Java 的理由都不成立；JIT 快也解決不了停頓與記憶體上限。剩下 C++，而好的答案同時寫出它的代價與緩解方式。',
    },
    {
      id: 'q7', prompt: 'Python 2 執行 `print 7 / 2` 會輸出 3。下面的程式在 Python 3 輸出什麼？',
      code: { language: 'Python', text: 'print(7 / 2, 7 // 2)' },
      options: ['3 3', '3.5 3', '3.5 3.5', 'SyntaxError'],
      answer: 1,
      explanation: 'Python 3 把 `/` 改成真除法（結果是 float），整數除法改用 `//`，所以輸出 3.5 3。「3 3」是 Python 2 的行為；`//` 對兩個整數得到整數 3，不是 3.5；這行程式在 Python 3 完全合法，不會 SyntaxError。這也說明了不相容的改版為什麼代價高：`print 7 / 2` 會直接語法錯誤、容易發現，但寫成 `print(7 / 2)` 的舊程式不會出錯，只是結果悄悄改變。',
    },
    {
      id: 'q8', prompt: '下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: 'record P(int x) {}\n\nP a = new P(1);\nP b = new P(1);\nSystem.out.println((a == b) + " " + a.equals(b));' },
      options: ['true true', 'false false', 'false true', 'true false'],
      answer: 2,
      explanation: '`new` 建立了兩個不同的物件，參考型別的 `==` 比較是不是同一個物件，所以是 false；record 依欄位自動產生 equals，兩者的 x 都是 1，所以 equals 是 true，答案是 false true。Java 不會因為內容相同就讓 `==` 成立（排除兩個 true 開頭的選項）；若 P 是普通類別而沒有覆寫 equals，繼承來的 equals 也只比較身分，才會是 false false。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '依需求為語言評分並排序',
      statement: '把一個專案的需求寫成「名稱 權重」的清單，依固定的評分表計算 C++、Java、Python、JavaScript 的分數並排序，同時列出每個語言的優點與代價。評分表（依序為 C++／Java／Python／JavaScript 的得分）：`latency` 2/1/0/1、`memory-safety` 0/2/2/2、`static-types` 2/2/0/0、`prototype` 0/1/2/2、`learning` 0/1/2/1、`parallel` 2/2/0/1、`startup` 2/0/1/1、`browser` 0/0/0/2、`data` 1/1/2/1、`team-cpp` 2/0/0/0、`team-java` 0/2/0/0、`team-python` 0/0/2/0、`team-js` 0/0/0/2（意思見「為專案情境選語言」一節的表格）。權重是 1～5 的整數，或 `must` 表示硬性限制。規則：(1) 某語言在任何一個 `must` 需求得 0 分，就被淘汰，淘汰原因是依輸入順序第一個得 0 的 `must` 需求；(2) 沒被淘汰的語言，分數是所有「非 must」需求的 權重 × 得分 的總和（`must` 需求不加分）；(3) 優點 pros 是該語言得 2 分的需求、代價 cons 是得 0 分的需求，都依輸入順序、以逗號連接，沒有時寫 `-`（`must` 需求也列入）；(4) 依分數由高到低排序，同分時依 C++、Java、Python、JavaScript 的順序。先檢查完全部輸入，有錯誤時只輸出第一個錯誤：n 為 0 輸出 `No requirements`；逐行依序檢查，名稱不在表中輸出 `Unknown requirement: 名稱`，名稱重複輸出 `Duplicate requirement: 名稱`，權重不是 `1`～`5` 或 `must` 輸出 `Invalid weight: 權重`（同一行先檢查名稱、再檢查重複、最後檢查權重）。',
      inputFormat: '第一行是整數 n；接下來 n 行，每行是需求名稱與權重，以一個空白分隔。',
      outputFormat: '沒有錯誤時，先依排名每行輸出 `#名次 語言 分數 pros=… cons=…`（名次從 1 起連續編號）；若所有語言都被淘汰，改輸出一行 `No language fits`。接著依 C++、Java、Python、JavaScript 的順序，為每個被淘汰的語言輸出 `excluded 語言 by 需求`。有錯誤時只輸出一行錯誤訊息。',
      constraints: ['0 ≤ n ≤ 20', '名稱與權重都不含空白；輸入一定有 n 行', '權重區分大小寫：`MUST` 不是合法的權重'],
      samples: [
        { kind: 'normal', input: '4\nlatency must\nparallel 3\nmemory-safety 3\nteam-java 2', output: '#1 Java 16 pros=parallel,memory-safety,team-java cons=-\n#2 JavaScript 9 pros=memory-safety cons=team-java\n#3 C++ 6 pros=latency,parallel cons=memory-safety,team-java\nexcluded Python by latency', note: '交易撮合：Python 的 latency 為 0 被淘汰；Java = 2×3 + 2×3 + 2×2 = 16' },
        { kind: 'edge', input: '2\nstatic-types 1\nmemory-safety 1', output: '#1 Java 4 pros=static-types,memory-safety cons=-\n#2 C++ 2 pros=static-types cons=memory-safety\n#3 Python 2 pros=memory-safety cons=static-types\n#4 JavaScript 2 pros=memory-safety cons=static-types', note: '三個語言同為 2 分，依表格順序排列' },
      ],
      tests: [
        { kind: 'normal', input: '4\nlatency must\nparallel 3\nmemory-safety 3\nteam-java 2', output: '#1 Java 16 pros=parallel,memory-safety,team-java cons=-\n#2 JavaScript 9 pros=memory-safety cons=team-java\n#3 C++ 6 pros=latency,parallel cons=memory-safety,team-java\nexcluded Python by latency', note: '硬性限制先淘汰，再依權重加總' },
        { kind: 'normal', input: '4\nbrowser must\ndata 2\nteam-python 2\nprototype 3', output: '#1 JavaScript 8 pros=browser,prototype cons=team-python\nexcluded C++ by browser\nexcluded Java by browser\nexcluded Python by browser', note: '瀏覽器前端：只剩 JavaScript，團隊熟悉 Python 成為它的代價' },
        { kind: 'normal', input: '3\ndata 3\nlearning 2\nprototype 2', output: '#1 Python 14 pros=data,learning,prototype cons=-\n#2 JavaScript 9 pros=prototype cons=-\n#3 Java 7 pros=- cons=-\n#4 C++ 3 pros=- cons=learning,prototype', note: '沒有硬性限制，四個語言都列出' },
        { kind: 'edge', input: '2\nstatic-types 1\nmemory-safety 1', output: '#1 Java 4 pros=static-types,memory-safety cons=-\n#2 C++ 2 pros=static-types cons=memory-safety\n#3 Python 2 pros=memory-safety cons=static-types\n#4 JavaScript 2 pros=memory-safety cons=static-types', note: '同分依表格順序' },
        { kind: 'edge', input: '1\nstartup 5', output: '#1 C++ 10 pros=startup cons=-\n#2 Python 5 pros=- cons=-\n#3 JavaScript 5 pros=- cons=-\n#4 Java 0 pros=- cons=startup', note: '只有一個需求，分數為 0 的語言仍然列出' },
        { kind: 'edge', input: '1\nmemory-safety must', output: '#1 Java 0 pros=memory-safety cons=-\n#2 Python 0 pros=memory-safety cons=-\n#3 JavaScript 0 pros=memory-safety cons=-\nexcluded C++ by memory-safety', note: '只有 must：不加分，剩下的語言全部 0 分' },
        { kind: 'edge', input: '2\nbrowser must\nteam-cpp must', output: 'No language fits\nexcluded C++ by browser\nexcluded Java by browser\nexcluded Python by browser\nexcluded JavaScript by team-cpp', note: '全部被淘汰；淘汰原因是第一個得 0 的 must' },
        { kind: 'edge', input: '3\nlatency 5\nstatic-types 4\nteam-cpp must', output: '#1 C++ 18 pros=latency,static-types,team-cpp cons=-\nexcluded Java by team-cpp\nexcluded Python by team-cpp\nexcluded JavaScript by team-cpp', note: 'must 寫在最後一行也一樣淘汰' },
        { kind: 'edge', input: '13\nlatency 1\nmemory-safety 1\nstatic-types 1\nprototype 1\nlearning 1\nparallel 1\nstartup 1\nbrowser 1\ndata 1\nteam-cpp 1\nteam-java 1\nteam-python 1\nteam-js 1', output: '#1 JavaScript 13 pros=memory-safety,prototype,browser,team-js cons=static-types,team-cpp,team-java,team-python\n#2 Java 12 pros=memory-safety,static-types,parallel,team-java cons=startup,browser,team-cpp,team-python,team-js\n#3 C++ 11 pros=latency,static-types,parallel,startup,team-cpp cons=memory-safety,prototype,learning,browser,team-java,team-python,team-js\n#4 Python 11 pros=memory-safety,prototype,learning,data,team-python cons=latency,static-types,parallel,browser,team-cpp,team-java,team-js', note: '每個需求各一次：檢查整張表是否抄對（權重全相同的總分沒有實際意義）' },
        { kind: 'error', input: '0', output: 'No requirements', note: '沒有任何需求' },
        { kind: 'error', input: '2\ndata 2\ngpu 3', output: 'Unknown requirement: gpu', note: '不在表中的需求，即使前面的行合法也只輸出錯誤' },
        { kind: 'error', input: '2\nlatency 2\nlatency 3', output: 'Duplicate requirement: latency', note: '同一個需求寫了兩次' },
        { kind: 'error', input: '1\nlatency 0', output: 'Invalid weight: 0', note: '權重下限是 1' },
        { kind: 'error', input: '1\nlearning 6', output: 'Invalid weight: 6', note: '權重上限是 5' },
        { kind: 'error', input: '1\nprototype high', output: 'Invalid weight: high', note: '權重不是數字也不是 must' },
        { kind: 'error', input: '2\nbrowser MUST\ndata 2', output: 'Invalid weight: MUST', note: 'must 區分大小寫' },
        { kind: 'error', input: '2\ngpu must\nlatency 9', output: 'Unknown requirement: gpu', note: '只輸出第一個錯誤；同一行先檢查名稱' },
      ],
      hints: [
        '先把評分表寫成「名稱 → 四個得分」的對照表；JavaScript 用 `Map` 而不是物件字面值，否則 `constructor` 這類從原型繼承來的名稱會被誤認為合法需求。',
        '先讀完並檢查全部的行，確定沒有錯誤才開始評分，否則可能印出一半結果才發現錯誤。',
        '對每個語言跑一次所有需求：記下第一個得 0 的 must、累加非 must 的 權重 × 得分、收集得 2 與得 0 的名稱。排序時用「分數由高到低，再依語言在表中的位置」當鍵。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

const std::vector<std::string> LANGS{"C++", "Java", "Python", "JavaScript"};
// 每個需求在 C++、Java、Python、JavaScript 的得分：2 擅長、1 可以、0 不符合
const std::map<std::string, std::vector<int>> TABLE{
    {"latency", {2, 1, 0, 1}},       {"memory-safety", {0, 2, 2, 2}},
    {"static-types", {2, 2, 0, 0}},  {"prototype", {0, 1, 2, 2}},
    {"learning", {0, 1, 2, 1}},      {"parallel", {2, 2, 0, 1}},
    {"startup", {2, 0, 1, 1}},       {"browser", {0, 0, 0, 2}},
    {"data", {1, 1, 2, 1}},          {"team-cpp", {2, 0, 0, 0}},
    {"team-java", {0, 2, 0, 0}},     {"team-python", {0, 0, 2, 0}},
    {"team-js", {0, 0, 0, 2}},
};

struct Row {
    int score;
    std::size_t index;
    std::vector<std::string> pros, cons;
};

std::string join(const std::vector<std::string>& items) {
    if (items.empty()) return "-";
    std::string out = items[0];
    for (std::size_t i = 1; i < items.size(); ++i) out += "," + items[i];
    return out;
}

int main() {
    int n = 0;
    std::cin >> n;
    if (n == 0) {
        std::cout << "No requirements\n";
        return 0;
    }
    std::vector<std::pair<std::string, std::string>> reqs;
    std::set<std::string> seen;
    for (int k = 0; k < n; ++k) {
        std::string name, value;
        std::cin >> name >> value;
        bool digit = value.size() == 1 && value[0] >= '1' && value[0] <= '5';
        if (TABLE.count(name) == 0) {
            std::cout << "Unknown requirement: " << name << "\n";
            return 0;
        }
        if (seen.count(name) > 0) {
            std::cout << "Duplicate requirement: " << name << "\n";
            return 0;
        }
        if (value != "must" && !digit) {
            std::cout << "Invalid weight: " << value << "\n";
            return 0;
        }
        seen.insert(name);
        reqs.emplace_back(name, value);
    }
    std::vector<Row> rows;
    std::vector<std::string> excluded;
    for (std::size_t i = 0; i < LANGS.size(); ++i) {
        Row row{0, i, {}, {}};
        std::string blocker;
        for (const auto& [name, value] : reqs) {
            int points = TABLE.at(name)[i];
            if (value == "must" && points == 0 && blocker.empty()) blocker = name;
            if (value != "must") row.score += (value[0] - '0') * points;
            if (points == 2) row.pros.push_back(name);
            if (points == 0) row.cons.push_back(name);
        }
        if (blocker.empty()) rows.push_back(row);
        else excluded.push_back("excluded " + LANGS[i] + " by " + blocker);
    }
    // 分數高的在前，同分依表格順序
    std::sort(rows.begin(), rows.end(), [](const Row& a, const Row& b) {
        return a.score != b.score ? a.score > b.score : a.index < b.index;
    });
    if (rows.empty()) std::cout << "No language fits\n";
    for (std::size_t r = 0; r < rows.size(); ++r) {
        std::cout << "#" << r + 1 << " " << LANGS[rows[r].index] << " " << rows[r].score
                  << " pros=" << join(rows[r].pros) << " cons=" << join(rows[r].cons) << "\n";
    }
    for (const std::string& line : excluded) std::cout << line << "\n";
    return 0;
}`,
        Python: code`import sys

LANGS = ["C++", "Java", "Python", "JavaScript"]
# 每個需求在 C++、Java、Python、JavaScript 的得分：2 擅長、1 可以、0 不符合
TABLE = {
    "latency": (2, 1, 0, 1),
    "memory-safety": (0, 2, 2, 2),
    "static-types": (2, 2, 0, 0),
    "prototype": (0, 1, 2, 2),
    "learning": (0, 1, 2, 1),
    "parallel": (2, 2, 0, 1),
    "startup": (2, 0, 1, 1),
    "browser": (0, 0, 0, 2),
    "data": (1, 1, 2, 1),
    "team-cpp": (2, 0, 0, 0),
    "team-java": (0, 2, 0, 0),
    "team-python": (0, 0, 2, 0),
    "team-js": (0, 0, 0, 2),
}


def read_requirements(tokens):
    """回傳 (需求串列, 錯誤訊息)；先檢查完全部輸入才開始評分。"""
    n = int(tokens[0])
    if n == 0:
        return None, "No requirements"
    reqs, seen = [], set()
    for k in range(n):
        name, value = tokens[1 + 2 * k], tokens[2 + 2 * k]
        if name not in TABLE:
            return None, f"Unknown requirement: {name}"
        if name in seen:
            return None, f"Duplicate requirement: {name}"
        if value != "must" and value not in ("1", "2", "3", "4", "5"):
            return None, f"Invalid weight: {value}"
        seen.add(name)
        reqs.append((name, value))
    return reqs, None


reqs, error = read_requirements(sys.stdin.read().split())
if error:
    print(error)
else:
    rows, excluded = [], []
    for i, lang in enumerate(LANGS):
        blocker = next((name for name, v in reqs if v == "must" and TABLE[name][i] == 0), None)
        if blocker:
            excluded.append(f"excluded {lang} by {blocker}")
            continue
        score = sum(int(v) * TABLE[name][i] for name, v in reqs if v != "must")
        pros = ",".join(name for name, _ in reqs if TABLE[name][i] == 2) or "-"
        cons = ",".join(name for name, _ in reqs if TABLE[name][i] == 0) or "-"
        rows.append((score, i, lang, pros, cons))
    rows.sort(key=lambda row: (-row[0], row[1]))  # 分數高的在前，同分依表格順序
    if not rows:
        print("No language fits")
    for rank, (score, _, lang, pros, cons) in enumerate(rows, 1):
        print(f"#{rank} {lang} {score} pros={pros} cons={cons}")
    for line in excluded:
        print(line)`,
        Java: code`import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
    static final String[] LANGS = {"C++", "Java", "Python", "JavaScript"};
    // 每個需求在 C++、Java、Python、JavaScript 的得分：2 擅長、1 可以、0 不符合
    static final Map<String, int[]> TABLE = Map.ofEntries(
        Map.entry("latency", new int[] {2, 1, 0, 1}),
        Map.entry("memory-safety", new int[] {0, 2, 2, 2}),
        Map.entry("static-types", new int[] {2, 2, 0, 0}),
        Map.entry("prototype", new int[] {0, 1, 2, 2}),
        Map.entry("learning", new int[] {0, 1, 2, 1}),
        Map.entry("parallel", new int[] {2, 2, 0, 1}),
        Map.entry("startup", new int[] {2, 0, 1, 1}),
        Map.entry("browser", new int[] {0, 0, 0, 2}),
        Map.entry("data", new int[] {1, 1, 2, 1}),
        Map.entry("team-cpp", new int[] {2, 0, 0, 0}),
        Map.entry("team-java", new int[] {0, 2, 0, 0}),
        Map.entry("team-python", new int[] {0, 0, 2, 0}),
        Map.entry("team-js", new int[] {0, 0, 0, 2}));

    record Requirement(String name, String value) {}
    record Row(int score, int index, String pros, String cons) {}

    static String join(List<String> items) {
        return items.isEmpty() ? "-" : String.join(",", items);
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        if (n == 0) {
            System.out.println("No requirements");
            return;
        }
        List<Requirement> reqs = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (int k = 0; k < n; k++) {
            String name = sc.next(), value = sc.next();
            if (!TABLE.containsKey(name)) {
                System.out.println("Unknown requirement: " + name);
                return;
            }
            if (!seen.add(name)) {
                System.out.println("Duplicate requirement: " + name);
                return;
            }
            if (!value.equals("must") && !value.matches("[1-5]")) {
                System.out.println("Invalid weight: " + value);
                return;
            }
            reqs.add(new Requirement(name, value));
        }
        List<Row> rows = new ArrayList<>();
        List<String> excluded = new ArrayList<>();
        for (int i = 0; i < LANGS.length; i++) {
            int score = 0;
            String blocker = null;
            List<String> pros = new ArrayList<>(), cons = new ArrayList<>();
            for (Requirement r : reqs) {
                int points = TABLE.get(r.name())[i];
                boolean must = r.value().equals("must");
                if (must && points == 0 && blocker == null) blocker = r.name();
                if (!must) score += Integer.parseInt(r.value()) * points;
                if (points == 2) pros.add(r.name());
                if (points == 0) cons.add(r.name());
            }
            if (blocker == null) rows.add(new Row(score, i, join(pros), join(cons)));
            else excluded.add("excluded " + LANGS[i] + " by " + blocker);
        }
        // 分數高的在前，同分依表格順序
        rows.sort(Comparator.comparingInt(Row::score).reversed().thenComparingInt(Row::index));
        if (rows.isEmpty()) System.out.println("No language fits");
        for (int r = 0; r < rows.size(); r++) {
            Row row = rows.get(r);
            System.out.println("#" + (r + 1) + " " + LANGS[row.index()] + " " + row.score()
                + " pros=" + row.pros() + " cons=" + row.cons());
        }
        for (String line : excluded) System.out.println(line);
    }
}`,
        JavaScript: code`const LANGS = ["C++", "Java", "Python", "JavaScript"];
// 每個需求在 C++、Java、Python、JavaScript 的得分：2 擅長、1 可以、0 不符合
// 用 Map 而不是物件字面值：物件會從原型繼承 "constructor" 之類的鍵
const TABLE = new Map([
    ["latency", [2, 1, 0, 1]], ["memory-safety", [0, 2, 2, 2]],
    ["static-types", [2, 2, 0, 0]], ["prototype", [0, 1, 2, 2]],
    ["learning", [0, 1, 2, 1]], ["parallel", [2, 2, 0, 1]],
    ["startup", [2, 0, 1, 1]], ["browser", [0, 0, 0, 2]],
    ["data", [1, 1, 2, 1]], ["team-cpp", [2, 0, 0, 0]],
    ["team-java", [0, 2, 0, 0]], ["team-python", [0, 0, 2, 0]],
    ["team-js", [0, 0, 0, 2]],
]);

function readRequirements(tokens) {
    const n = Number(tokens[0]);
    if (n === 0) return { error: "No requirements" };
    const reqs = [];
    const seen = new Set();
    for (let k = 0; k < n; k++) {
        const name = tokens[1 + 2 * k];
        const value = tokens[2 + 2 * k];
        if (!TABLE.has(name)) return { error: "Unknown requirement: " + name };
        if (seen.has(name)) return { error: "Duplicate requirement: " + name };
        if (value !== "must" && !/^[1-5]$/.test(value)) return { error: "Invalid weight: " + value };
        seen.add(name);
        reqs.push({ name, value });
    }
    return { reqs };
}

const { reqs, error } = readRequirements(require("fs").readFileSync(0, "utf8").trim().split(/\s+/));
if (error) {
    console.log(error);
} else {
    const rows = [];
    const excluded = [];
    LANGS.forEach((lang, i) => {
        const blocker = reqs.find(r => r.value === "must" && TABLE.get(r.name)[i] === 0);
        if (blocker) {
            excluded.push("excluded " + lang + " by " + blocker.name);
            return;
        }
        const score = reqs.filter(r => r.value !== "must")
            .reduce((sum, r) => sum + Number(r.value) * TABLE.get(r.name)[i], 0);
        const pros = reqs.filter(r => TABLE.get(r.name)[i] === 2).map(r => r.name).join(",") || "-";
        const cons = reqs.filter(r => TABLE.get(r.name)[i] === 0).map(r => r.name).join(",") || "-";
        rows.push({ score, i, lang, pros, cons });
    });
    rows.sort((a, b) => b.score - a.score || a.i - b.i); // 分數高的在前，同分依表格順序
    if (rows.length === 0) console.log("No language fits");
    rows.forEach((row, r) => {
        console.log("#" + (r + 1) + " " + row.lang + " " + row.score + " pros=" + row.pros + " cons=" + row.cons);
    });
    for (const line of excluded) console.log(line);
}`,
      },
      judge: 'none',
    },
  ],
};

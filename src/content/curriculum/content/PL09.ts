import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * PL09 錯誤處理模型 (programming-languages island, course production batch 2). Every example and the reference
 * solutions run in tests/curriculum-code.test.ts in C++17, Java 17, Python 3 and JavaScript (Node.js); every program
 * catches what it throws and exits normally. The quiz programs were run (g++ -std=c++17 -Wall -Werror, javac --release 17,
 * python3, node) when the lesson was written; the one that does not compile (q4) was checked with javac. The blueprint's
 * activity is function-call: the trace follows an exception unwinding the call stack and the destructors it runs.
 */
export const PL09: LessonContent = {
  lessonId: 'PL09',
  motivation: '程式碰到的錯誤大多不是 bug，而是預期中的失敗：使用者打錯字、檔案不存在、網路斷線。錯誤處理沒設計好，輕則錯誤訊息看不懂，重則檔案沒關、資料改到一半、錯誤被默默吞掉。學會比較例外、錯誤碼與 Result／Optional，能預測例外穿過多層呼叫時哪些 finally 與解構子會執行、以什麼順序執行，再把它們集中到清楚的錯誤邊界，程式在失敗時也會照你預期的方式運作。',
  sections: [
    {
      id: 'representations', title: '三種錯誤表示：錯誤碼、例外、Result／Optional',
      blocks: [
        { type: 'p', text: '函式無法完成工作時，要讓呼叫端知道兩件事：失敗了，以及為什麼。程式語言發展出三類做法。錯誤碼（error code）用回傳值或另一個變數表示成功或失敗，例如 C 函式回傳 −1 並設定 `errno`、C++17 的 `std::from_chars` 回傳 `std::errc`。例外（exception）用 `throw`／`raise` 中斷目前的執行，直接跳到最近一個能處理它的 `catch`／`except`，中間每一層都不必寫檢查。第三類把「可能失敗」寫進回傳型別：Optional 只表示「有值或沒有值」（C++17 的 `std::optional`、Java 的 `Optional`、Python 慣用的 `None`）；Result 型別（Result type）再帶上失敗原因，例如 Rust 的 `Result<T, E>`、C++23 的 `std::expected`、JavaScript 常見的 `{ ok, value }`／`{ ok, error }` 物件，以及 Python 偶爾使用的 `(value, error)` tuple。' },
        { type: 'table', head: ['方式', '失敗怎麼傳回', '呼叫端忘了處理時', '適合的情境'], rows: [
          ['錯誤碼', '回傳值、輸出參數或全域的 `errno`', '程式默默繼續，用到錯誤的值', '底層 API、效能敏感或禁止使用例外的環境'],
          ['例外', '`throw` 跳出多層呼叫，直到有 `catch` 接住', '例外一路傳到最外層，程式印出錯誤並結束', '少見而且附近無法處理的錯誤：檔案、網路、程式 bug'],
          ['Optional', '空值：`std::nullopt`、`Optional.empty()`、`None`', 'Java 的 `get()` 丟出 NoSuchElementException；C++ 對空的 optional 用 `*` 是未定義行為', '「找不到」是正常結果，不需要原因'],
          ['Result', '值或錯誤原因其中之一', 'Rust 會在編譯時警告；JavaScript 的物件不檢查，讀到 `undefined`', '預期中的失敗而且要說明原因，例如使用者輸入'],
        ] },
        { type: 'p', text: '下例用四種語言寫同一個 `parseAge`：輸入必須是 0～150 的整數，否則視為無效。C++ 的 `std::from_chars` 本身用錯誤碼回報，函式再把它包成 `std::optional`；Java 的 `Integer.parseInt` 失敗時丟出 NumberFormatException，函式立刻接住並轉成 `Optional.empty()`；Python 的 `int()` 丟出 ValueError，轉成 `None`；JavaScript 先用正規表示式檢查，再回傳 `{ ok, value }`。底層的報錯方式各不相同，但呼叫端看到的都是「有值或沒有值」。' },
        { type: 'example', id: 'optional' },
        { type: 'p', text: '注意 `7x`：`std::from_chars` 讀到 7 就停在 x，回傳的錯誤碼是「成功」，所以還要檢查它是否讀完整個字串，否則 `7x` 會被當成 7。C++ 的 `std::stoi("7x")` 也一樣回傳 7 而不報錯；嚴格的輸入驗證必須確認整個字串都被讀完。' },
        { type: 'callout', tone: 'warning', title: '「沒有值」和「值是 0」不一樣', text: '最後一筆 `0` 是合法的年齡。Python 若寫成 `if not age:`，0、空字串、空串列都會被當成「沒有值」，合法的 0 就被誤判成無效；必須寫 `if age is None:`。JavaScript 的 `if (!r.value)` 有同樣的問題，要檢查 `r.ok`。C++ 的 `if (age)` 檢查的是 optional 有沒有值，不是值本身，所以 0 不會被誤判；但若直接寫 `*age` 而沒先檢查，空的 optional 是未定義行為。' },
      ],
    },
    {
      id: 'unwinding', title: '例外與堆疊回溯：拋出之後發生什麼',
      blocks: [
        { type: 'p', text: '例外被拋出後，執行環境從目前的函式開始找型別相符的 `catch`（Python 是 `except`）。目前的函式沒有，就結束這個函式、彈出它的堆疊框架（PL07 的 stack frame），回到呼叫它的地方繼續找；這個一層一層退出的過程叫堆疊回溯（stack unwinding）。每退出一層，那一層的清理程式都會執行：C++ 是區域物件的解構子（destructor），Java、Python、JavaScript 是 `finally` 區塊。清理的順序從最內層往外，正好和進入的順序相反；拋出點與 `catch` 之間的一般程式碼完全不會執行。' },
        { type: 'example', id: 'unwind' },
        { type: 'list', ordered: true, items: [
          'inner 拋出 disk full。inner 裡沒有 `catch`，所以先執行 inner 的清理（印 close inner），再結束 inner。',
          '回到 middle 呼叫 `inner()` 的那一行。middle 也沒有 `catch`，下一行的 middle done 被跳過，執行 middle 的清理（印 close middle）。',
          '回到 main。main 的 `try` 有型別相符的 `catch`，但進入 `catch` 之前，`try` 區塊裡的清理先執行（印 close main）。',
          '執行 `catch` 區塊（印 caught: disk full），之後從整個 try／catch 的下一行繼續（印 end），程式正常結束。',
        ] },
        { type: 'p', text: '回溯只會結束函式並執行清理，不會撤銷已經發生的副作用：已經印出的文字、已經修改的變數都留著。例如 C++17 的 `std::cout << "port " << parsePort(text)` 由左到右執行，`"port "` 在 parsePort 丟出例外之前就已經輸出，畫面上留下半行；所以要先把結果算完再輸出，需要回復原狀的資料則由錯誤邊界負責。' },
        { type: 'p', text: '四種語言的輸出完全相同，因為清理順序是語言規格保證的，不是巧合：同一段程式每次執行都會得到同樣的順序，所以可以像追蹤一般程式一樣把它推算出來。下方的函式呼叫追蹤用 C++ 版本逐步顯示呼叫堆疊（由舊到新）：例外傳遞時，框架從最上面一個一個被彈出，輸出欄位依序出現解構子印出的 close。' },
        { type: 'callout', tone: 'note', title: '沒有任何 catch 時', text: 'Java、Python 與 Node.js 會把堆疊追蹤（stack trace）印到標準錯誤輸出，以非 0 的結束碼結束程式；堆疊追蹤列出的正是回溯途中經過的呼叫鏈，是除錯最重要的線索。C++ 會呼叫 `std::terminate`，而且在找不到 `catch` 時是否先回溯、執行解構子由實作決定，檔案可能沒被正確關閉，所以 C++ 程式通常在 main 的最外層放一個 `catch`。' },
      ],
    },
    {
      id: 'cleanup', title: 'finally 與 RAII：一定會執行的清理',
      blocks: [
        { type: 'p', text: '檔案、資料庫連線、鎖這類資源取得之後必須釋放，不論函式是正常結束、提早 `return`，還是因為例外離開。Java、Python、JavaScript 用 `finally`：不管 `try` 區塊怎麼結束，`finally` 都會執行。C++ 沒有 `finally`，改用 RAII（Resource Acquisition Is Initialization，資源取得即初始化）：把資源綁在一個區域物件上，建構子取得、解構子釋放；物件離開作用域時（PL07 的生命週期）解構子一定會執行，堆疊回溯時也一樣。`std::unique_ptr`、`std::lock_guard`、`std::ifstream` 都是 RAII 物件，所以 C++ 程式很少需要手寫清理。' },
        { type: 'p', text: '每個資源都手寫 `try`／`finally` 很容易漏，所以 Java 的 try-with-resources 與 Python 的 `with` 讓語言代寫 `finally`：資源在區塊結束時自動關閉，多個資源依取得的相反順序關閉，因為後開的資源（file）可能依賴先開的資源（db）。JavaScript 沒有解構子，最常見的寫法是巢狀的 `try`／`finally`。下例讓同一個函式先成功一次、再失敗一次，兩次的關閉順序完全相同。' },
        { type: 'example', id: 'resources' },
        { type: 'table', head: ['語言', '清理機制', '多個資源的釋放順序', '補充'], rows: [
          ['C++', '解構子（RAII）', '與宣告順序相反', '解構子預設是 `noexcept`；回溯途中解構子再丟出例外會呼叫 `std::terminate`'],
          ['Java', '`finally`、try-with-resources（`AutoCloseable`）', '與宣告順序相反', '`close()` 也丟出例外時，它被附加到原本的例外上（`getSuppressed()`），不會蓋掉原本的錯誤'],
          ['Python', '`finally`、`with`（context manager 的 `__exit__`）', '與宣告順序相反', '`__exit__` 回傳 True 會把例外吞掉，一般要回傳 False 或 None'],
          ['JavaScript', '`finally`', '由巢狀結構決定：內層的 `finally` 先執行', '可以 `throw` 任何值，但建議只丟 `Error` 物件，才有訊息與堆疊追蹤'],
        ] },
        { type: 'callout', tone: 'warning', title: '不要在 finally 裡 return', text: 'Java、Python、JavaScript 的 `finally` 若寫了 `return`，函式會直接回傳這個值，正在傳遞的例外就此消失，呼叫端以為一切正常（測驗第 7 題）。`finally` 只該做清理，不該決定結果。C++ 的對應陷阱是在解構子裡丟出例外：回溯途中同時有兩個例外，程式會直接被終止。' },
      ],
    },
    {
      id: 'checked', title: 'Java 的 checked 與 unchecked 例外',
      blocks: [
        { type: 'p', text: 'Java 把例外分成兩類。checked exception 是 `Exception` 的子類別、但不是 `RuntimeException` 的子類別，例如 `IOException`、`SQLException`：方法裡可能拋出它時，編譯器要求要嘛就地 `catch`，要嘛在方法簽名寫 `throws IOException` 交給呼叫端，否則編譯失敗。unchecked exception 是 `RuntimeException` 的子類別（`IllegalArgumentException`、`NullPointerException`、`ArithmeticException`）與 `Error`，不必宣告，也不強迫任何人處理。' },
        { type: 'p', text: '這個設計的用意：checked 代表「程式寫得再正確也可能發生，呼叫端應該有對策」的情況，例如檔案不存在、網路中斷。把它寫進簽名，它就和回傳型別一樣成為 API 的一部分，編譯器保證沒有呼叫端忘了處理。unchecked 通常代表程式 bug 或呼叫端違反了前置條件，到處宣告只會製造雜訊，該做的是修正程式，而不是 catch 它。' },
        { type: 'example', id: 'checked-unchecked' },
        { type: 'p', text: 'Java 版本裡，拿掉 `catch (IOException e)` 或 `readConfig` 簽名上的 `throws`，程式就無法編譯；拿掉 `catch (IllegalArgumentException e)` 仍然可以編譯，只是例外會一路傳出 main。C++、Python、JavaScript 都沒有 checked exception（C++ 只有 `noexcept` 用來宣告「不會丟」），三個版本都能執行出同樣的結果，但沒有任何工具強迫呼叫端處理讀檔錯誤，函式會丟什麼只能靠文件。JavaScript 的 `catch` 還不能指定型別，它會接到所有被丟出的值，所以要用 `instanceof` 判斷，並把不認得的重新丟出。' },
        { type: 'p', text: 'checked exception 也有代價：每一層都要寫 `throws` 或 `catch`；介面一旦宣告就難以修改；`Function` 這類 lambda 介面不能丟 checked exception，所以在 stream 裡常被包成 unchecked 再丟。C#、Kotlin 等後來的語言因此沒有採用。實務上的折衷是：呼叫端真的能補救的情況用 checked（或 Result），程式錯誤用 unchecked。' },
      ],
    },
    {
      id: 'boundary', title: '設計錯誤邊界',
      blocks: [
        { type: 'p', text: '錯誤邊界（error boundary）是程式裡「把外部的混亂轉成內部秩序」的位置，例如處理每個 HTTP 請求的函式、命令列程式的 main、逐行讀取輸入的迴圈。好的錯誤邊界做三件事：' },
        { type: 'list', ordered: true, items: [
          '在邊緣驗證：外部資料（使用者輸入、檔案、網路）一進來就檢查，通過的資料才交給內部；內部函式可以假設資料合法，不必每層重複檢查。',
          '轉成一種錯誤表示：底層可能丟出 ValueError、NumberFormatException、自訂例外，或回傳錯誤碼；在邊界統一轉成同一種形式（一行錯誤訊息、HTTP 400 與錯誤 JSON、一個 Result），上層只需處理一種格式。',
          '釋放資源並決定後續：用 `finally`、`with` 或 RAII 確保資源釋放，並決定出錯之後要繼續處理下一筆、回復原狀，還是結束程式。',
        ] },
        { type: 'p', text: '下例處理一連串提款請求，餘額從 100 開始。解析與檢查的函式只會丟出本程式自己的錯誤 AppError：Java 把 NumberFormatException、Python 把 ValueError 立刻轉成 AppError。每筆請求外圍的 `try` 就是錯誤邊界，它只接住 AppError，轉成一行 `error: …`，然後繼續下一筆；一筆失敗不會影響餘額，也不會中斷其他請求。' },
        { type: 'example', id: 'request-boundary' },
        { type: 'p', text: '邊界只接住 AppError 是刻意的：如果程式裡有真正的 bug（例如打錯變數名稱造成的 TypeError），它不會被偽裝成 `error: …` 的輸入錯誤，而是照常往外傳、留下堆疊追蹤。JavaScript 版本用 `instanceof` 檢查，不認得的錯誤重新 `throw`，達到同樣的效果。' },
        { type: 'callout', tone: 'warning', title: '吞掉例外與攔得太廣', text: '`catch (Exception e) {}`、Python 的 `except: pass`、JavaScript 空的 `catch {}`，會讓錯誤憑空消失：程式帶著錯誤的狀態繼續執行，問題在很久以後以更難追查的形式出現。Python 不寫型別的 `except:` 連 KeyboardInterrupt（Ctrl+C）與 SystemExit 都會接住，程式甚至關不掉。原則是只 catch 你知道怎麼處理的型別，在邊界記錄或轉換，其他的讓它往外傳；真的要忽略某個錯誤，就寫註解說明為什麼可以忽略。' },
        { type: 'table', head: ['情境', '建議的錯誤表示'], rows: [
          ['使用者輸入的字串轉數字失敗', '預期中的失敗：回傳 Optional／Result，或在邊界 catch 後轉成錯誤訊息'],
          ['查表找不到某個鍵', 'Optional 或 `None`：找不到是正常結果'],
          ['讀檔、網路失敗', '例外（Java 為 checked），在請求的邊界轉成錯誤回應，並確保資源關閉'],
          ['陣列越界、null 參考', '程式 bug：不要 catch 來掩蓋，讓它留下堆疊追蹤，然後修正程式'],
          ['效能關鍵或禁止例外的 C++ 程式', '錯誤碼或 `std::error_code`，並用 `[[nodiscard]]` 讓忽略回傳值時產生警告'],
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'optional', title: '可能沒有值：Optional、None 與 { ok, value }', description: '同一個 parseAge 在四種語言中的慣用寫法：C++ 把 from_chars 的錯誤碼包成 std::optional，Java 把例外轉成 Optional，Python 回傳 None，JavaScript 回傳 { ok, value } 物件。',
      output: '42 -> 42\nabc -> invalid\n7x -> invalid\n200 -> invalid\n0 -> 0',
      code: {
        'C++': code`#include <charconv>
#include <initializer_list>
#include <iostream>
#include <optional>
#include <string>

// from_chars 用錯誤碼回報；這裡把它包成 optional 交給呼叫端
std::optional<int> parseAge(const std::string& text) {
    int value = 0;
    auto [end, ec] = std::from_chars(text.data(), text.data() + text.size(), value);
    if (ec != std::errc() || end != text.data() + text.size()) return std::nullopt;  // 要讀完整個字串
    if (value < 0 || value > 150) return std::nullopt;
    return value;
}

int main() {
    for (std::string text : {"42", "abc", "7x", "200", "0"}) {
        std::optional<int> age = parseAge(text);
        if (age) std::cout << text << " -> " << *age << "\n";  // 先檢查有值，才能用 *age
        else std::cout << text << " -> invalid\n";
    }
    return 0;
}`,
        Java: code`import java.util.Optional;

public class Main {
    static Optional<Integer> parseAge(String text) {
        try {
            int value = Integer.parseInt(text);
            return value >= 0 && value <= 150 ? Optional.of(value) : Optional.empty();
        } catch (NumberFormatException e) {
            return Optional.empty();  // 例外在這裡轉成「沒有值」
        }
    }

    public static void main(String[] args) {
        for (String text : new String[] {"42", "abc", "7x", "200", "0"}) {
            String shown = parseAge(text).map(String::valueOf).orElse("invalid");
            System.out.println(text + " -> " + shown);
        }
    }
}`,
        Python: code`def parse_age(text):
    """回傳 0～150 的整數；無效時回傳 None。"""
    try:
        value = int(text)
    except ValueError:
        return None
    return value if 0 <= value <= 150 else None


for text in ["42", "abc", "7x", "200", "0"]:
    age = parse_age(text)
    shown = "invalid" if age is None else age  # 0 也是有效值，要用 is None 判斷
    print(f"{text} -> {shown}")`,
        JavaScript: code`// 回傳 Result 物件：{ ok: true, value } 或 { ok: false }
function parseAge(text) {
    if (!/^\d+$/.test(text)) return { ok: false };  // Number("") 是 0，所以先檢查格式
    const value = Number(text);
    return value <= 150 ? { ok: true, value } : { ok: false };
}

for (const text of ["42", "abc", "7x", "200", "0"]) {
    const r = parseAge(text);
    console.log(text + " -> " + (r.ok ? r.value : "invalid"));
}`,
      },
    },
    {
      id: 'unwind', title: '堆疊回溯：清理由內往外執行', description: 'main → middle → inner，inner 拋出例外。每一層的清理（C++ 的解構子、其他語言的 finally）在回溯時由內往外執行，middle done 被跳過，最後由 main 的 catch 接住。',
      output: 'open main\nopen middle\nopen inner\nclose inner\nclose middle\nclose main\ncaught: disk full\nend',
      code: {
        'C++': code`#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>

struct Guard {  // RAII：建構時取得、解構時釋放
    std::string name;
    explicit Guard(std::string n) : name(std::move(n)) { std::cout << "open " << name << "\n"; }
    ~Guard() { std::cout << "close " << name << "\n"; }
};

void inner() {
    Guard g("inner");
    throw std::runtime_error("disk full");
}

void middle() {
    Guard g("middle");
    inner();
    std::cout << "middle done\n";  // 不會執行
}

int main() {
    try {
        Guard g("main");
        middle();
    } catch (const std::runtime_error& e) {  // 進入這裡之前，try 區塊裡的 g 已經解構
        std::cout << "caught: " << e.what() << "\n";
    }
    std::cout << "end\n";
    return 0;
}`,
        Java: code`public class Main {
    static void inner() {
        System.out.println("open inner");
        try {
            throw new IllegalStateException("disk full");
        } finally {
            System.out.println("close inner");
        }
    }

    static void middle() {
        System.out.println("open middle");
        try {
            inner();
            System.out.println("middle done");  // 不會執行
        } finally {
            System.out.println("close middle");
        }
    }

    public static void main(String[] args) {
        try {
            System.out.println("open main");
            try {
                middle();
            } finally {
                System.out.println("close main");
            }
        } catch (IllegalStateException e) {
            System.out.println("caught: " + e.getMessage());
        }
        System.out.println("end");
    }
}`,
        Python: code`def inner():
    print("open inner")
    try:
        raise RuntimeError("disk full")
    finally:
        print("close inner")


def middle():
    print("open middle")
    try:
        inner()
        print("middle done")  # 不會執行
    finally:
        print("close middle")


try:
    print("open main")
    try:
        middle()
    finally:
        print("close main")
except RuntimeError as e:
    print(f"caught: {e}")
print("end")`,
        JavaScript: code`function inner() {
    console.log("open inner");
    try {
        throw new Error("disk full");
    } finally {
        console.log("close inner");
    }
}

function middle() {
    console.log("open middle");
    try {
        inner();
        console.log("middle done");  // 不會執行
    } finally {
        console.log("close middle");
    }
}

try {
    console.log("open main");
    try {
        middle();
    } finally {
        console.log("close main");
    }
} catch (e) {
    console.log("caught: " + e.message);
}
console.log("end");`,
      },
    },
    {
      id: 'resources', title: '多個資源：成功或失敗都依相反順序關閉', description: 'copy 先開 db、再開 file。成功與失敗兩次執行，關閉順序都是 file 先、db 後：C++ 靠解構子，Java 用 try-with-resources，Python 用 with，JavaScript 用巢狀 finally。',
      output: 'open db\nopen file\ncopied\nclose file\nclose db\nopen db\nopen file\nclose file\nclose db\nerror: write failed',
      code: {
        'C++': code`#include <initializer_list>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>

struct Resource {
    std::string name;
    explicit Resource(std::string n) : name(std::move(n)) { std::cout << "open " << name << "\n"; }
    ~Resource() { std::cout << "close " << name << "\n"; }
};

void copy(bool fail) {
    Resource db("db");
    Resource file("file");  // 後建立的先解構
    if (fail) throw std::runtime_error("write failed");
    std::cout << "copied\n";
}

int main() {
    for (bool fail : {false, true}) {
        try {
            copy(fail);
        } catch (const std::exception& e) {
            std::cout << "error: " << e.what() << "\n";
        }
    }
    return 0;
}`,
        Java: code`class Resource implements AutoCloseable {
    private final String name;

    Resource(String name) {
        this.name = name;
        System.out.println("open " + name);
    }

    @Override
    public void close() { System.out.println("close " + name); }
}

public class Main {
    static void copy(boolean fail) {
        try (Resource db = new Resource("db"); Resource file = new Resource("file")) {
            if (fail) throw new IllegalStateException("write failed");
            System.out.println("copied");
        }  // 離開時自動 close：file 先、db 後
    }

    public static void main(String[] args) {
        for (boolean fail : new boolean[] {false, true}) {
            try {
                copy(fail);
            } catch (IllegalStateException e) {
                System.out.println("error: " + e.getMessage());
            }
        }
    }
}`,
        Python: code`class Resource:
    def __init__(self, name):
        self.name = name
        print(f"open {name}")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        print(f"close {self.name}")
        return False  # 不吞掉例外


def copy(fail):
    with Resource("db"), Resource("file"):  # 離開時 file 先、db 後
        if fail:
            raise RuntimeError("write failed")
        print("copied")


for fail in (False, True):
    try:
        copy(fail)
    except RuntimeError as e:
        print(f"error: {e}")`,
        JavaScript: code`function open(name) {
    console.log("open " + name);
    return { close: () => console.log("close " + name) };
}

function copy(fail) {
    const db = open("db");
    try {
        const file = open("file");
        try {
            if (fail) throw new Error("write failed");
            console.log("copied");
        } finally {
            file.close();  // 內層的 finally 先執行
        }
    } finally {
        db.close();
    }
}

for (const fail of [false, true]) {
    try {
        copy(fail);
    } catch (e) {
        console.log("error: " + e.message);
    }
}`,
      },
    },
    {
      id: 'checked-unchecked', title: 'checked 與 unchecked：誰被強迫處理', description: 'readConfig 可能遇到讀檔錯誤（Java 的 checked IOException），parsePort 檢查到不合理的值時丟出 unchecked 的 IllegalArgumentException。只有 Java 的編譯器會強迫呼叫端處理前者；其他三種語言寫出相同的流程，但沒有編譯期檢查。',
      output: 'port 8080\nio error: no such file\ninvalid: bad port 70000',
      code: {
        'C++': code`#include <initializer_list>
#include <iostream>
#include <stdexcept>
#include <string>

// C++ 沒有 checked exception：簽名看不出會丟什麼，只能靠文件
std::string readConfig(const std::string& path) {
    if (path.empty()) throw std::runtime_error("no such file");
    return "port=8080";
}

int parsePort(const std::string& text) {
    int port = std::stoi(text.substr(text.find('=') + 1));
    if (port < 1 || port > 65535) throw std::invalid_argument("bad port " + std::to_string(port));
    return port;
}

int main() {
    for (std::string path : {"app.conf", ""}) {
        try {
            int port = parsePort(readConfig(path));  // 先算完再輸出，失敗時不會印出半行
            std::cout << "port " << port << "\n";
        } catch (const std::runtime_error& e) {  // 不寫這個 catch 也能編譯
            std::cout << "io error: " << e.what() << "\n";
        }
    }
    try {
        parsePort("port=70000");
    } catch (const std::invalid_argument& e) {
        std::cout << "invalid: " << e.what() << "\n";
    }
    return 0;
}`,
        Java: code`import java.io.IOException;

public class Main {
    // checked：簽名必須寫 throws，呼叫端必須處理或繼續宣告
    static String readConfig(String path) throws IOException {
        if (path.isEmpty()) throw new IOException("no such file");
        return "port=8080";
    }

    // unchecked：IllegalArgumentException 是 RuntimeException，不必寫在簽名上
    static int parsePort(String text) {
        int port = Integer.parseInt(text.substring(text.indexOf('=') + 1));
        if (port < 1 || port > 65535) throw new IllegalArgumentException("bad port " + port);
        return port;
    }

    public static void main(String[] args) {
        for (String path : new String[] {"app.conf", ""}) {
            try {
                System.out.println("port " + parsePort(readConfig(path)));
            } catch (IOException e) {  // 拿掉這個 catch，編譯就會失敗
                System.out.println("io error: " + e.getMessage());
            }
        }
        try {
            parsePort("port=70000");
        } catch (IllegalArgumentException e) {  // 不寫也能編譯，例外會一路往外傳
            System.out.println("invalid: " + e.getMessage());
        }
    }
}`,
        Python: code`def read_config(path):
    if not path:
        raise FileNotFoundError("no such file")
    return "port=8080"


def parse_port(text):
    port = int(text.split("=", 1)[1])
    if not 1 <= port <= 65535:
        raise ValueError(f"bad port {port}")
    return port


for path in ["app.conf", ""]:
    try:
        print(f"port {parse_port(read_config(path))}")
    except OSError as e:  # FileNotFoundError 是 OSError 的子類別；不寫也能執行
        print(f"io error: {e}")
try:
    parse_port("port=70000")
except ValueError as e:
    print(f"invalid: {e}")`,
        JavaScript: code`class IoError extends Error {}

function readConfig(path) {
    if (path === "") throw new IoError("no such file");
    return "port=8080";
}

function parsePort(text) {
    const port = Number(text.split("=")[1]);
    if (!(port >= 1 && port <= 65535)) throw new RangeError("bad port " + port);
    return port;
}

for (const path of ["app.conf", ""]) {
    try {
        console.log("port " + parsePort(readConfig(path)));
    } catch (e) {
        if (!(e instanceof IoError)) throw e;  // catch 不能指定型別：不認得的就再丟出去
        console.log("io error: " + e.message);
    }
}
try {
    parsePort("port=70000");
} catch (e) {
    if (!(e instanceof RangeError)) throw e;
    console.log("invalid: " + e.message);
}`,
      },
    },
    {
      id: 'request-boundary', title: '錯誤邊界：每筆請求一個 try', description: '從標準輸入讀取提款金額，餘額從 100 開始。內部只丟出本程式的 AppError；每筆請求外圍的 try 是錯誤邊界，把錯誤轉成一行 error 訊息後繼續處理下一筆。',
      stdin: '30\nabc\n500\n-5\n20',
      output: 'ok 70\nerror: not a number\nerror: insufficient funds (70)\nerror: must be positive\nok 50\nfinal 50',
      code: {
        'C++': code`#include <charconv>
#include <iostream>
#include <stdexcept>
#include <string>

struct AppError : std::runtime_error {  // 本程式自己的錯誤；邊界只接住這一族
    using std::runtime_error::runtime_error;
};

int parseAmount(const std::string& text) {
    int amount = 0;
    auto [end, ec] = std::from_chars(text.data(), text.data() + text.size(), amount);
    if (ec != std::errc() || end != text.data() + text.size()) throw AppError("not a number");
    if (amount <= 0) throw AppError("must be positive");
    return amount;
}

int main() {
    int balance = 100;
    std::string line;
    while (std::cin >> line) {
        try {  // 錯誤邊界：每筆請求一個
            int amount = parseAmount(line);
            if (amount > balance) throw AppError("insufficient funds (" + std::to_string(balance) + ")");
            balance -= amount;
            std::cout << "ok " << balance << "\n";
        } catch (const AppError& e) {
            std::cout << "error: " << e.what() << "\n";
        }
    }
    std::cout << "final " << balance << "\n";
    return 0;
}`,
        Java: code`import java.util.Scanner;

class AppError extends Exception {  // checked：邊界必須處理
    AppError(String message) { super(message); }
}

public class Main {
    static int parseAmount(String text) throws AppError {
        int amount;
        try {
            amount = Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw new AppError("not a number");  // 轉成本程式的錯誤
        }
        if (amount <= 0) throw new AppError("must be positive");
        return amount;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int balance = 100;
        while (sc.hasNext()) {
            try {  // 錯誤邊界：每筆請求一個
                int amount = parseAmount(sc.next());
                if (amount > balance) throw new AppError("insufficient funds (" + balance + ")");
                balance -= amount;
                System.out.println("ok " + balance);
            } catch (AppError e) {
                System.out.println("error: " + e.getMessage());
            }
        }
        System.out.println("final " + balance);
    }
}`,
        Python: code`import sys


class AppError(Exception):
    """本程式自己的錯誤；邊界只接住這一族。"""


def parse_amount(text):
    try:
        amount = int(text)
    except ValueError:
        raise AppError("not a number") from None  # 轉成本程式的錯誤
    if amount <= 0:
        raise AppError("must be positive")
    return amount


balance = 100
for line in sys.stdin.read().split():
    try:  # 錯誤邊界：每筆請求一個
        amount = parse_amount(line)
        if amount > balance:
            raise AppError(f"insufficient funds ({balance})")
        balance -= amount
        print(f"ok {balance}")
    except AppError as e:
        print(f"error: {e}")
print(f"final {balance}")`,
        JavaScript: code`class AppError extends Error {}

function parseAmount(text) {
    if (!/^-?\d+$/.test(text)) throw new AppError("not a number");
    const amount = Number(text);
    if (amount <= 0) throw new AppError("must be positive");
    return amount;
}

let balance = 100;
for (const line of require("fs").readFileSync(0, "utf8").split(/\s+/).filter(Boolean)) {
    try {  // 錯誤邊界：每筆請求一個
        const amount = parseAmount(line);
        if (amount > balance) throw new AppError("insufficient funds (" + balance + ")");
        balance -= amount;
        console.log("ok " + balance);
    } catch (e) {
        if (!(e instanceof AppError)) throw e;  // 程式 bug 不在這裡掩蓋
        console.log("error: " + e.message);
    }
}
console.log("final " + balance);`,
      },
    },
  ],
  visualization: {
    kind: 'function-call', title: '例外穿過三層呼叫：堆疊回溯與解構子（C++）', language: 'C++',
    code: code`struct Guard {
    std::string name;
    Guard(std::string n) : name(n) { std::cout << "open " << name << "\n"; }
    ~Guard() { std::cout << "close " << name << "\n"; }
};
void inner() {
    Guard g("inner");
    throw std::runtime_error("disk full");
}
void middle() {
    Guard g("middle");
    inner();
    std::cout << "middle done\n";
}
int main() {
    try {
        Guard g("main");
        middle();
    } catch (const std::runtime_error& e) {
        std::cout << "caught: " << e.what() << "\n";
    }
    std::cout << "end\n";
}`,
    steps: [
      { line: 17, note: '進入 try 區塊，建立區域物件 g，建構子印出 open main。g 的生命週期到 try 區塊結束為止。', frames: [{ name: 'main', vars: { g: 'Guard "main"' } }], output: 'open main' },
      { line: 11, note: 'main 在第 18 行呼叫 middle：middle 的框架壓在堆疊頂端，建立它自己的 g，印出 open middle。', frames: [{ name: 'main', vars: { g: 'Guard "main"' } }, { name: 'middle', vars: { g: 'Guard "middle"' } }], output: 'open main\nopen middle' },
      { line: 7, note: 'middle 在第 12 行呼叫 inner：堆疊上現在有三個框架，三個 g 都還活著。', frames: [{ name: 'main', vars: { g: 'Guard "main"' } }, { name: 'middle', vars: { g: 'Guard "middle"' } }, { name: 'inner', vars: { g: 'Guard "inner"' } }], output: 'open main\nopen middle\nopen inner' },
      { line: 8, note: 'throw 建立例外物件，開始尋找型別相符的 catch。inner 裡沒有 try，所以 inner 必須結束：堆疊回溯開始。', frames: [{ name: 'main', vars: { g: 'Guard "main"' } }, { name: 'middle', vars: { g: 'Guard "middle"' } }, { name: 'inner', vars: { g: 'Guard "inner"', 例外: 'runtime_error("disk full")，傳遞中' } }], output: 'open main\nopen middle\nopen inner' },
      { line: 4, note: '離開 inner 之前，先解構它的區域物件 g：~Guard 印出 close inner。接著 inner 的框架被彈出。', frames: [{ name: 'main', vars: { g: 'Guard "main"' } }, { name: 'middle', vars: { g: 'Guard "middle"', 例外: '傳遞中' } }], output: 'open main\nopen middle\nopen inner\nclose inner' },
      { line: 12, note: '回到 middle 呼叫 inner 的第 12 行。這一行不在任何 try 裡，例外繼續往外傳，所以第 13 行的 middle done 被跳過，middle 也必須結束。', frames: [{ name: 'main', vars: { g: 'Guard "main"' } }, { name: 'middle', vars: { g: 'Guard "middle"', 例外: '傳遞中' } }], output: 'open main\nopen middle\nopen inner\nclose inner' },
      { line: 4, note: '解構 middle 的 g，印出 close middle，middle 的框架被彈出。清理的順序和進入的順序相反。', frames: [{ name: 'main', vars: { g: 'Guard "main"', 例外: '傳遞中' } }], output: 'open main\nopen middle\nopen inner\nclose inner\nclose middle' },
      { line: 4, note: '回到 main 第 18 行，它在 try 裡，第 19 行的 catch 型別相符。進入 catch 之前要先離開 try 區塊，所以 main 的 g 也被解構，印出 close main。', frames: [{ name: 'main', vars: { 例外: '由第 19 行的 catch 接住' } }], output: 'open main\nopen middle\nopen inner\nclose inner\nclose middle\nclose main' },
      { line: 20, note: '執行 catch 區塊：e 參考到被丟出的例外物件，印出 caught: disk full。', frames: [{ name: 'main', vars: { e: 'runtime_error("disk full")' } }], output: 'open main\nopen middle\nopen inner\nclose inner\nclose middle\nclose main\ncaught: disk full' },
      { line: 22, note: 'catch 結束後，從整個 try／catch 的下一行繼續執行，印出 end，程式正常結束。三個 Guard 都已經被釋放，沒有任何資源外洩。', frames: [{ name: 'main', vars: {} }], output: 'open main\nopen middle\nopen inner\nclose inner\nclose middle\nclose main\ncaught: disk full\nend' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Java 程式依序印出哪幾行？',
      code: { language: 'Java', text: code`static void c() {
    try {
        System.out.println("c1");
        throw new RuntimeException("boom");
    } finally {
        System.out.println("c2");
    }
}
static void b() {
    try {
        c();
        System.out.println("b1");
    } catch (IllegalStateException e) {
        System.out.println("b2");
    } finally {
        System.out.println("b3");
    }
}
public static void main(String[] args) {
    try {
        b();
    } catch (RuntimeException e) {
        System.out.println("main " + e.getMessage());
    }
}` },
      options: ['c1、c2、b3、main boom', 'c1、c2、b2、b3、main boom', 'c1、main boom、c2、b3', 'c1、c2、b1、b3、main boom'],
      answer: 0, explanation: 'c 拋出 RuntimeException，先執行 c 的 finally（c2）。回到 b：b1 被跳過；catch 只接 IllegalStateException，而 RuntimeException 不是它的子類別（反過來才是），所以不符合，但 b 的 finally 仍然執行（b3）。最後 main 的 catch 接住，印 main boom。選 b2 的人把子類別與父類別的方向弄反了；「main boom 先印」誤以為 finally 等到外層處理完才執行，其實回溯經過每一層時就執行；印出 b1 則是以為例外處理完會回到拋出點之後繼續。',
    },
    {
      id: 'q2', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: code`struct Log {
    char id;
    explicit Log(char c) : id(c) { std::cout << "+" << id; }
    ~Log() { std::cout << "-" << id; }
};
void work() {
    Log a('a');
    Log b('b');
    throw 1;
}
int main() {
    try {
        Log m('m');
        work();
    } catch (int) {
        std::cout << " caught";
    }
}` },
      options: ['+m+a+b-b-a-m caught', '+m+a+b-a-b-m caught', '+m+a+b caught-b-a-m', '+m+a+b-b-a caught-m'],
      answer: 0, explanation: '回溯時區域物件依建構的相反順序解構：work 裡先解構 b 再解構 a；回到 main 的 try 區塊，進入 catch 之前要先離開 try 區塊，所以 m 也先被解構，最後才印 caught。「-a-b」把解構順序當成和建構相同；「caught 在前」以為解構子等到例外處理完才執行；「-m 在 caught 之後」忽略了 m 的作用域只到 try 區塊結束，catch 區塊已經在它的作用域之外。',
    },
    {
      id: 'q3', prompt: '下面的 Python 程式想找出 "a" 的位置，實際印出什麼？問題在哪裡？',
      code: { language: 'Python', text: code`def find_index(items, target):
    for i, item in enumerate(items):
        if item == target:
            return i
    return None


pos = find_index(["a", "b"], "a")
if not pos:
    print("not found")
else:
    print("at", pos)` },
      options: ['印出 not found：找到的位置是 0，`not pos` 把 0 當成假；應改成 `if pos is None:`', '印出 at 0，程式沒有問題', '印出 not found：enumerate 從 1 開始數，所以永遠找不到第一個元素', '丟出 TypeError：None 不能用在 if 條件'],
      answer: 0, explanation: '"a" 在索引 0，函式回傳 0。用 None 表示「沒有值」時，0 是合法的結果，但 `not 0` 為 True，所以程式誤判成找不到。要區分「沒有值」與「值為假」，必須寫 `pos is None`。程式確實有問題，不會印出 at 0；enumerate 預設從 0 開始；None 可以放在 if 條件中（它被當成假），不會丟出 TypeError。',
    },
    {
      id: 'q4', prompt: '下面四個 Java 方法，哪些會讓 javac 編譯失敗？',
      code: { language: 'Java', text: code`import java.io.IOException;

class Demo {
    static void a() { throw new IllegalArgumentException("x"); }       // (1)
    static void b() { throw new IOException("x"); }                    // (2)
    static void c() throws IOException { throw new IOException("x"); } // (3)
    static void d() { c(); }                                           // (4)
}` },
      options: ['(2) 與 (4)', '只有 (2)', '(1) 與 (2)', '都能編譯，例外要到執行時才檢查'],
      answer: 0, explanation: 'IOException 是 checked exception：(2) 拋出它卻沒有 catch 也沒有宣告 throws；(4) 呼叫宣告了 `throws IOException` 的 c，卻既不 catch 也不宣告，兩者都是 unreported exception 的編譯錯誤。(3) 有宣告，可以編譯。「只有 (2)」漏了 checked 規則也適用於呼叫者；(1) 的 IllegalArgumentException 是 unchecked，不必宣告；Java 的 checked 規則正是在編譯時檢查，不會延到執行時。',
    },
    {
      id: 'q5', prompt: '下面的 Python 函式最大的問題是什麼？（parse 是同一個程式裡的另一個函式）',
      code: { language: 'Python', text: code`def load_settings(path):
    try:
        with open(path) as f:
            return parse(f.read())
    except Exception:
        return {}` },
      options: ['檔案不存在、沒有權限，甚至 parse 裡的程式 bug（KeyError、TypeError）都被變成「空設定」，錯誤被吞掉，問題會在之後以更難追的形式出現', '例外發生時 with 不會關閉檔案，造成資源外洩', '`except Exception` 會接住 Ctrl+C 的 KeyboardInterrupt，讓程式關不掉', 'return 寫在 with 裡面，檔案會在讀取之前就被關閉，所以讀不到內容'],
      answer: 0, explanation: '`except Exception` 攔得太廣，又不記錄、不轉換，等於把所有錯誤吞掉：呼叫端拿到空設定，完全不知道發生過什麼。應該只接住預期的錯誤（例如 FileNotFoundError），在錯誤邊界轉成清楚的訊息，讓程式 bug 照常往外傳。with 在例外離開時也會關閉檔案；KeyboardInterrupt 繼承自 BaseException 而不是 Exception，只有不寫型別的 `except:` 才會接住它；`f.read()` 在 return 之前就已經讀完，之後才關閉檔案。',
    },
    {
      id: 'q6', prompt: 'JavaScript 的 `parsePort(text)` 用 `{ ok, value }` 表示結果：`Number(text)` 不是整數時回傳 `{ ok: false, error: "not a number" }`，否則回傳 `{ ok: true, value: n }`。執行 `const r = parsePort("80a"); console.log(r.value + 1);` 會印出什麼？',
      options: ['NaN', '81', 'TypeError：Cannot read properties of undefined', 'not a number'],
      answer: 0, explanation: '`Number("80a")` 是 NaN，不是整數，所以回傳 `{ ok: false, error: ... }`。r 本身是物件，讀取不存在的 `r.value` 得到 undefined，不會丟出 TypeError；`undefined + 1` 是 NaN。程式沒有印出 error 欄位，所以不會出現 not a number；也不會是 81，因為 "80a" 沒有被解析。這正是 JavaScript Result 物件的弱點：語言不強迫檢查 ok，忘了檢查就帶著 NaN 繼續；Java 對空的 Optional 呼叫 get 至少會立刻丟出例外。',
    },
    {
      id: 'q7', prompt: '下面的 Java 程式印出什麼？',
      code: { language: 'Java', text: code`static int f() {
    try {
        throw new IllegalStateException("lost");
    } finally {
        return 2;
    }
}
public static void main(String[] args) {
    try {
        System.out.println(f());
    } catch (RuntimeException e) {
        System.out.println("caught " + e.getMessage());
    }
}` },
      options: ['2', 'caught lost', '先印 caught lost，再印 2', '編譯錯誤：finally 裡不能寫 return'],
      answer: 0, explanation: 'finally 一定會執行，而它的 `return 2` 讓 f 正常回傳 2，正在傳遞的 IllegalStateException 就被丟棄了，main 的 catch 什麼都收不到。這段程式可以編譯（javac 只在加上 -Xlint 時警告 finally 無法正常結束）。「caught lost」以為例外一定會傳出去；不會兩者都印，因為例外已經消失。這就是為什麼 finally 只該做清理而不該 return。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '設定檔的錯誤邊界',
      statement: '寫一個設定檔載入器。設定有三個鍵，預設值為 port=80、workers=1、timeout=30。輸入的每一行是一筆 `key=value`，依下列順序檢查，第一個不符合的規則就是錯誤原因：沒有 `=` 是 `missing =`；以第一個 `=` 分開後，鍵不是 port、workers、timeout（大小寫有別）是 `unknown key`；值是空的或含有 0～9 以外的字元是 `not a number`；值超出範圍是 `out of range (下限-上限)`，範圍是 port 1～65535、workers 1～64、timeout 1～3600。合法的行更新設定並輸出 `line i: ok key=value`（value 以整數輸出，前導 0 去掉）；不合法的行輸出 `line i: error 原因`，設定不變，然後繼續處理下一行。同一個鍵出現多次時，以最後一個合法的值為準。最後輸出設定與統計。建議把「驗證一行」寫成會丟出例外（或回傳 Result）的函式，在逐行處理的迴圈中設一個錯誤邊界，只接住設定錯誤這一種。',
      inputFormat: '第一行是行數 n；接著 n 行，每行一筆設定。',
      outputFormat: 'n 行 `line i: ok key=value` 或 `line i: error 原因`（i 從 1 開始）；接著一行 `port=P workers=W timeout=T`；最後一行 `loaded A, rejected B`。',
      constraints: ['0 ≤ n ≤ 100', '每行長度 1～40，不含空白', '值若全是數字，最多 18 位（可以存進 64 位元整數）'],
      samples: [{ kind: 'normal', input: '4\nport=8080\nworkers=abc\ntimeout=0\nhost=example', output: 'line 1: ok port=8080\nline 2: error not a number\nline 3: error out of range (1-3600)\nline 4: error unknown key\nport=8080 workers=1 timeout=30\nloaded 1, rejected 3', note: '只有第 1 行合法；其他三行各有不同的錯誤原因，設定保留預設值' }],
      tests: [
        { kind: 'normal', input: '3\nport=443\nworkers=8\ntimeout=120', output: 'line 1: ok port=443\nline 2: ok workers=8\nline 3: ok timeout=120\nport=443 workers=8 timeout=120\nloaded 3, rejected 0', note: '三行都合法' },
        { kind: 'normal', input: '4\nworkers=4\nworkers=100\ntimeout=60\nworkers=2', output: 'line 1: ok workers=4\nline 2: error out of range (1-64)\nline 3: ok timeout=60\nline 4: ok workers=2\nport=80 workers=2 timeout=60\nloaded 3, rejected 1', note: '不合法的行不改變設定；同一個鍵以最後一個合法值為準' },
        { kind: 'edge', input: '0', output: 'port=80 workers=1 timeout=30\nloaded 0, rejected 0', note: '沒有任何設定，全部使用預設值' },
        { kind: 'edge', input: '6\nport=1\nport=65535\nport=0\nport=65536\nworkers=64\ntimeout=3601', output: 'line 1: ok port=1\nline 2: ok port=65535\nline 3: error out of range (1-65535)\nline 4: error out of range (1-65535)\nline 5: ok workers=64\nline 6: error out of range (1-3600)\nport=65535 workers=64 timeout=30\nloaded 3, rejected 3', note: '範圍的兩端可以接受，剛好超出一點就拒絕' },
        { kind: 'edge', input: '3\nport=0080\ntimeout=999999999999999999\nworkers=000000000000000001', output: 'line 1: ok port=80\nline 2: error out of range (1-3600)\nline 3: ok workers=1\nport=80 workers=1 timeout=30\nloaded 2, rejected 1', note: '前導 0 去掉後輸出；18 位數的值超出 32 位元整數，要用 64 位元整數比較' },
        { kind: 'error', input: '7\nport\n=8080\nport=\nport=-1\nport=8=0\nPort=80\ntimeout=12.5', output: 'line 1: error missing =\nline 2: error unknown key\nline 3: error not a number\nline 4: error not a number\nline 5: error not a number\nline 6: error unknown key\nline 7: error not a number\nport=80 workers=1 timeout=30\nloaded 0, rejected 7', note: '缺少 =、空的鍵、空的值、負號、第二個 =、大小寫不同的鍵、小數點' },
        { kind: 'error', input: '3\nhost=localhost\nworkers=two\nverbose', output: 'line 1: error unknown key\nline 2: error not a number\nline 3: error missing =\nport=80 workers=1 timeout=30\nloaded 0, rejected 3', note: '全部不合法，程式仍然正常結束並輸出預設設定' },
      ],
      hints: [
        '先寫 `parseLine(line)`：依規則順序檢查，不合法就丟出自訂的設定錯誤（C++ 繼承 `std::runtime_error`、Java 繼承 `Exception`、Python 繼承 `Exception`），合法就回傳鍵與值；JavaScript 可以改成回傳 `{ ok, key, value }` 或 `{ ok: false, error }`。',
        '「全是數字」要自己檢查再轉換：`std::stoll("12.5")` 會回傳 12、Python 的 `int("-1")` 會成功、JavaScript 的 `Number("")` 是 0，都不能直接當成驗證。',
        '迴圈裡的 try／catch 就是錯誤邊界：只 catch 設定錯誤，輸出 `line i: error 原因` 後繼續下一行；值用 C++ 的 long long、Java 的 long 存。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <utility>

struct ConfigError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

const std::map<std::string, std::pair<long long, long long>> LIMITS = {
    {"port", {1, 65535}}, {"workers", {1, 64}}, {"timeout", {1, 3600}}};

// 驗證一行設定；不合法時丟出 ConfigError
std::pair<std::string, long long> parseLine(const std::string& line) {
    std::size_t eq = line.find('=');
    if (eq == std::string::npos) throw ConfigError("missing =");
    std::string key = line.substr(0, eq), text = line.substr(eq + 1);
    auto limit = LIMITS.find(key);
    if (limit == LIMITS.end()) throw ConfigError("unknown key");
    if (text.empty() || text.find_first_not_of("0123456789") != std::string::npos) throw ConfigError("not a number");
    long long value = std::stoll(text);
    auto [low, high] = limit->second;
    if (value < low || value > high)
        throw ConfigError("out of range (" + std::to_string(low) + "-" + std::to_string(high) + ")");
    return {key, value};
}

int main() {
    std::map<std::string, long long> config = {{"port", 80}, {"workers", 1}, {"timeout", 30}};
    int n, loaded = 0, rejected = 0;
    std::cin >> n;
    for (int i = 1; i <= n; ++i) {
        std::string line;
        std::cin >> line;
        try {  // 錯誤邊界：一行的錯誤不影響其他行
            auto [key, value] = parseLine(line);
            config[key] = value;
            ++loaded;
            std::cout << "line " << i << ": ok " << key << "=" << value << "\n";
        } catch (const ConfigError& e) {
            ++rejected;
            std::cout << "line " << i << ": error " << e.what() << "\n";
        }
    }
    std::cout << "port=" << config["port"] << " workers=" << config["workers"] << " timeout=" << config["timeout"] << "\n";
    std::cout << "loaded " << loaded << ", rejected " << rejected << "\n";
    return 0;
}`,
        Java: code`import java.util.HashMap;
import java.util.Map;
import java.util.Scanner;

class ConfigException extends Exception {  // checked：呼叫端必須處理
    ConfigException(String message) { super(message); }
}

public class Main {
    static final Map<String, long[]> LIMITS = Map.of(
        "port", new long[] {1, 65535}, "workers", new long[] {1, 64}, "timeout", new long[] {1, 3600});

    static Map.Entry<String, Long> parseLine(String line) throws ConfigException {
        int eq = line.indexOf('=');
        if (eq < 0) throw new ConfigException("missing =");
        String key = line.substring(0, eq), text = line.substring(eq + 1);
        long[] limit = LIMITS.get(key);
        if (limit == null) throw new ConfigException("unknown key");
        if (!text.matches("[0-9]+")) throw new ConfigException("not a number");
        long value = Long.parseLong(text);
        if (value < limit[0] || value > limit[1])
            throw new ConfigException("out of range (" + limit[0] + "-" + limit[1] + ")");
        return Map.entry(key, value);
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        Map<String, Long> config = new HashMap<>(Map.of("port", 80L, "workers", 1L, "timeout", 30L));
        int n = sc.nextInt(), loaded = 0, rejected = 0;
        StringBuilder out = new StringBuilder();
        for (int i = 1; i <= n; i++) {
            try {  // 錯誤邊界：一行的錯誤不影響其他行
                Map.Entry<String, Long> entry = parseLine(sc.next());
                config.put(entry.getKey(), entry.getValue());
                loaded++;
                out.append("line ").append(i).append(": ok ").append(entry.getKey()).append("=").append(entry.getValue()).append("\n");
            } catch (ConfigException e) {
                rejected++;
                out.append("line ").append(i).append(": error ").append(e.getMessage()).append("\n");
            }
        }
        out.append("port=").append(config.get("port")).append(" workers=").append(config.get("workers"))
            .append(" timeout=").append(config.get("timeout")).append("\n");
        out.append("loaded ").append(loaded).append(", rejected ").append(rejected);
        System.out.println(out);
    }
}`,
        Python: code`LIMITS = {"port": (1, 65535), "workers": (1, 64), "timeout": (1, 3600)}


class ConfigError(Exception):
    pass


def parse_line(line):
    """驗證一行設定，回傳 (key, value)；不合法時丟出 ConfigError。"""
    key, sep, text = line.partition("=")
    if not sep:
        raise ConfigError("missing =")
    if key not in LIMITS:
        raise ConfigError("unknown key")
    if not (text.isascii() and text.isdigit()):
        raise ConfigError("not a number")
    low, high = LIMITS[key]
    value = int(text)
    if not low <= value <= high:
        raise ConfigError(f"out of range ({low}-{high})")
    return key, value


config = {"port": 80, "workers": 1, "timeout": 30}
loaded = rejected = 0
n = int(input())
for i in range(1, n + 1):
    line = input().strip()
    try:  # 錯誤邊界：一行的錯誤不影響其他行
        key, value = parse_line(line)
    except ConfigError as e:
        rejected += 1
        print(f"line {i}: error {e}")
    else:
        config[key] = value
        loaded += 1
        print(f"line {i}: ok {key}={value}")
print(" ".join(f"{key}={value}" for key, value in config.items()))
print(f"loaded {loaded}, rejected {rejected}")`,
        JavaScript: code`const LIMITS = { port: [1, 65535], workers: [1, 64], timeout: [1, 3600] };

// 回傳 Result：{ ok: true, key, value } 或 { ok: false, error }
function parseLine(line) {
    const eq = line.indexOf("=");
    if (eq < 0) return { ok: false, error: "missing =" };
    const key = line.slice(0, eq), text = line.slice(eq + 1);
    if (!Object.hasOwn(LIMITS, key)) return { ok: false, error: "unknown key" };
    if (!/^[0-9]+$/.test(text)) return { ok: false, error: "not a number" };
    const [low, high] = LIMITS[key];
    const value = Number(text);
    if (value < low || value > high) return { ok: false, error: "out of range (" + low + "-" + high + ")" };
    return { ok: true, key, value };
}

const lines = require("fs").readFileSync(0, "utf8").split("\n").map(s => s.trim());
const n = Number(lines[0]);
const config = { port: 80, workers: 1, timeout: 30 };
let loaded = 0, rejected = 0;
const out = [];
for (let i = 1; i <= n; i++) {
    const r = parseLine(lines[i]);  // 錯誤邊界：每一行都得到一個 Result，先檢查 ok
    if (r.ok) {
        config[r.key] = r.value;
        loaded++;
        out.push("line " + i + ": ok " + r.key + "=" + r.value);
    } else {
        rejected++;
        out.push("line " + i + ": error " + r.error);
    }
}
out.push("port=" + config.port + " workers=" + config.workers + " timeout=" + config.timeout);
out.push("loaded " + loaded + ", rejected " + rejected);
console.log(out.join("\n"));`,
      },
      judge: 'none',
    },
  ],
};

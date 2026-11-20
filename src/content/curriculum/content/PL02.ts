import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * PL02 物件導向：封裝、繼承與介面 (programming-languages island). Every example and the reference solutions run in
 * tests/curriculum-code.test.ts in C++17, Java 17, Python 3 and JavaScript (Node.js). The blueprint's activity
 * memory-model is not built, so the lesson uses the function-call trace (a virtual call through a base reference).
 */
export const PL02: LessonContent = {
  lessonId: 'PL02',
  motivation: '程式一變大，「誰可以改這筆資料」就成了 bug 的主要來源：任何地方都能把餘額改成負數，錯誤就很難追。物件導向把資料和守護它的規則放在同一個類別裡，再用繼承、介面與動態分派讓同一段程式處理不同種類的物件；學會它，也才看得懂四種語言為什麼在 virtual、interface、底線命名與 prototype 上各有不同的寫法。',
  sections: [
    {
      id: 'classes', title: '類別與物件：把資料和規則放在一起',
      blocks: [
        { type: 'p', text: '類別（class）是一張設計圖，描述某種東西有哪些資料（欄位，field）和能做哪些事（方法，method）；物件（object）是照設計圖建立出來的實體，又稱實例（instance）。`Account` 是類別，`acc = Account()` 建立的 acc 是物件；同一個類別可以建立很多物件，各自有自己的欄位值。' },
        { type: 'p', text: '只用一般變數記錄餘額時，程式的任何一行都可以寫 `balance = -500`。封裝（encapsulation）的做法是：把餘額設為類別外面不能直接修改，只能透過 `deposit`、`withdraw` 這些方法改變，而方法在修改前先檢查規則。這條「任何時候都必須成立」的規則叫做不變條件（invariant），例如「餘額永遠不小於 0」。只要每個能改餘額的方法都守住它，整個程式就不可能出現負的餘額，要查錯也只需要看這幾個方法。' },
        { type: 'example', id: 'account' },
        { type: 'p', text: '注意第三次提款：要領 500 但餘額只有 70，方法拒絕並回報 rejected，餘額維持 70，而不是先扣成 −430 再說。檢查放在方法裡，呼叫者就不可能忘記檢查。' },
      ],
    },
    {
      id: 'access', title: '封裝與存取權限：四種語言守得多嚴',
      blocks: [
        { type: 'p', text: '「外面不能改」在四種語言裡的強度不同：C++ 與 Java 由編譯器檢查，JavaScript 的 `#` 欄位由執行環境強制，Python 則只靠命名慣例。' },
        { type: 'table', head: ['語言', '寫法', '從類別外面存取時'], rows: [
          ['C++', '`private:`、`protected:`、`public:` 區段；`class` 預設 private，`struct` 預設 public', '編譯錯誤'],
          ['Java', '每個成員寫 `private`、`protected`、`public`，不寫是同一個套件內可見', '編譯錯誤'],
          ['Python', '單底線 `_balance` 是「內部使用，請勿從外面改」的約定；雙底線 `__balance` 會被改名', '可以存取，語言不阻止'],
          ['JavaScript', '`#balance` 是真正的私有欄位（ES2022）；舊程式用 `_balance` 慣例或閉包', '`#` 欄位寫在類別外是語法錯誤'],
        ] },
        { type: 'p', text: '`protected` 的意思是「子類別可以用，外面不行」，下一節的繼承會用到。對外只提供需要的方法，例如唯讀的 `balance()`、Python 的 `@property` 或 JavaScript 的 `get balance()`，讓外面能讀但不能寫。' },
        { type: 'callout', tone: 'warning', title: 'Python 的雙底線不是私有，也不是安全機制', text: '在類別裡寫 `self.__balance`，Python 會把名字改成 `_Account__balance`（name mangling），目的是避免子類別不小心用同名欄位蓋掉父類別的欄位，不是禁止存取：`acc._Account__balance = -1` 照樣能改。更常見的誤會是在類別外寫 `acc.__balance = 50`：類別外不會改名，這行只是替物件新增一個叫 `__balance` 的屬性，真正的餘額 `_Account__balance` 完全沒變，程式不報錯卻沒有效果。Python 的封裝靠約定與文件，一般用單底線即可。' },
      ],
    },
    {
      id: 'inheritance', title: '繼承、覆寫與動態分派',
      blocks: [
        { type: 'p', text: '繼承（inheritance）讓子類別自動擁有父類別的欄位與方法，再加入自己的部分；子類別可以重新定義父類別的方法，叫做覆寫（override）。關係必須是「是一種」（is-a）：正方形是一種矩形，矩形是一種圖形。' },
        { type: 'p', text: '繼承真正有用的地方是多型（polymorphism）：用父類別型別的參考指向子類別物件，呼叫方法時，執行的是物件實際型別的版本，而不是變數宣告型別的版本。這個「到執行時才決定呼叫哪個方法」的機制叫動態分派（dynamic dispatch）。下例的 `describe` 只寫在 Shape 裡，但它呼叫的 `name()`、`area()` 會依物件實際是 Rect 還是 Square 選到不同的覆寫。' },
        { type: 'example', id: 'override' },
        { type: 'p', text: 'Square 沒有覆寫 `area`，所以沿用 Rect 的版本（5 × 5 = 25），只換掉 `name`。找方法的順序是：先看物件自己的類別，沒有就往父類別找，一路往上。' },
        { type: 'table', head: ['語言', '方法預設可以被動態分派嗎', '標示覆寫'], rows: [
          ['C++', '不行，要在父類別寫 `virtual`；物件必須透過指標或參考使用', '`override`（建議寫，簽名不符時編譯錯誤）'],
          ['Java', '可以，非 static、非 private、非 final 的方法都會', '`@Override`（建議寫，簽名不符時編譯錯誤）'],
          ['Python', '可以，每次呼叫都依物件的類別查找', '沒有關鍵字，同名就覆寫'],
          ['JavaScript', '可以，沿 prototype 鏈查找', '沒有關鍵字，同名就覆寫'],
        ] },
        { type: 'callout', tone: 'warning', title: 'C++ 忘了 virtual，父類別的方法就會被執行', text: '若 Shape 寫成 `int area() const { return 0; }`（沒有 virtual），透過 `Shape&` 或 `Shape*` 呼叫時，編譯器依宣告型別直接選 `Shape::area`，Rect 的面積就永遠算成 0，而且不會有任何錯誤訊息。子類別加上 `override` 可以防止這種錯：父類別沒有對應的 virtual 方法時，編譯會失敗。另一個陷阱是物件切割（object slicing）：`std::vector<Shape>` 或傳值的 `Shape s = rect;` 只複製了 Shape 的部分，子類別的資料與覆寫都不見了，所以多型物件要用 `std::unique_ptr<Shape>` 或參考保存。有 virtual 方法的父類別也要有 virtual 解構子。' },
        { type: 'p', text: '下方的視覺化追蹤 `report(r)`：參數 s 的宣告型別是 `const Shape&`，實際指向的是 Rect，因此 `s.area()` 進入的是 `Rect::area`。' },
      ],
    },
    {
      id: 'interfaces', title: '介面與抽象類別：只規定要做什麼',
      blocks: [
        { type: 'p', text: '有時父類別根本沒有合理的預設行為，例如「通知」要怎麼送，只有 email、簡訊等具體做法才知道。這時用介面（interface）或抽象類別（abstract class）只規定「必須有哪些方法」，不能直接建立物件，實作交給子類別。呼叫端只依賴介面，之後加一種新的通知方式，`broadcast` 一行都不用改。' },
        { type: 'example', id: 'interface' },
        { type: 'table', head: ['語言', '介面與抽象類別', '少實作一個方法時'], rows: [
          ['C++', '含純虛擬函式（`= 0`）的類別就是抽象類別；沒有獨立的 interface 關鍵字', '子類別仍是抽象的，建立它的物件時編譯錯誤'],
          ['Java', '`interface`（可同時實作多個）與 `abstract class`（只能繼承一個，可以有欄位）', '編譯錯誤，除非該類別也宣告為 abstract'],
          ['Python', '`abc` 模組的 `ABC` 與 `@abstractmethod`', '建立物件時才在執行期丟出 TypeError'],
          ['JavaScript', '沒有介面；只要物件有 `send` 方法就能用（鴨子型別，duck typing）', '不會檢查，呼叫時才出現 TypeError：不是函式'],
        ] },
        { type: 'p', text: '例子中的 JavaScript 版本直接用一個物件字面值 `{ send(message) { ... } }` 當第三種通知方式，它沒有繼承任何類別，也能放進 `broadcast`。好處是彈性，代價是錯誤要到執行時才會發現；需要編譯期檢查時，可以改用 TypeScript 的 interface。' },
      ],
    },
    {
      id: 'prototype', title: 'JavaScript 的 class 底下是 prototype',
      blocks: [
        { type: 'p', text: 'C++、Java、Python 的方法屬於類別；JavaScript 原本沒有類別，物件之間用 prototype 串起來。`class` 與 `extends` 是 ES2015 加入的語法，底層仍是 prototype：類別裡定義的方法放在 `Rect.prototype` 這個物件上，`class Square extends Rect` 讓 `Square.prototype` 的 prototype 指向 `Rect.prototype`。' },
        { type: 'list', ordered: true, items: [
          '呼叫 `sq.area()` 時，先找 sq 物件自己有沒有 area 屬性。',
          '沒有就找 `Square.prototype`，再找 `Rect.prototype`、`Shape.prototype`，最後是 `Object.prototype`。',
          '第一個找到的就執行，`this` 仍然是 sq；整條鏈都沒有時，`sq.area` 是 undefined，呼叫它會丟出 TypeError。',
        ] },
        { type: 'p', text: '這就是 JavaScript 的動態分派：每次呼叫都沿 prototype 鏈查找，所以執行中修改 `Rect.prototype.area`，已經建立的物件也會立刻用到新版本（測驗第 4 題）。實務上不要這樣改內建或別人的 prototype，但理解這條鏈，才能讀懂 `Object.getPrototypeOf` 與舊程式裡 `Foo.prototype.bar = function` 的寫法。' },
        { type: 'callout', tone: 'note', title: '# 私有方法不能被覆寫', text: 'JavaScript 的 `#cost()` 這種私有方法不在 prototype 鏈上，子類別無法覆寫它。想讓子類別替換某個步驟（練習題的手續費），那個方法要寫成一般方法；Java 與 C++ 則用 `protected`。' },
      ],
    },
    {
      id: 'composition', title: '組合優於繼承',
      blocks: [
        { type: 'p', text: '繼承把子類別和父類別綁得很緊：父類別的每個公開方法都自動變成子類別的方法。例如 Java 寫 `class Stack extends ArrayList<Integer>`，堆疊就同時有 `add(0, x)`、`get(i)`、`remove(i)`，任何人都能把資料插到底部，「只能從頂端進出」的不變條件就破了。' },
        { type: 'p', text: '組合（composition）是「有一個」（has-a）：堆疊裡面有一個私有的 list，只對外提供 push、pop、size。內部用什麼存都可以換，外面看到的只有需要的操作。這就是常說的「組合優於繼承」：除非真的是「是一種」的關係，而且子類別能完全代替父類別，否則先考慮組合。' },
        { type: 'example', id: 'stack-composition' },
        { type: 'table', head: ['情境', '選擇', '理由'], rows: [
          ['正方形與矩形都要能放進「圖形」清單計算面積', '繼承或介面', '每個都是一種圖形，呼叫端只用共同的方法'],
          ['堆疊需要一個存資料的地方', '組合', '堆疊不是一種 list，不該公開插入中間的操作'],
          ['汽車需要引擎，引擎可以換成電動馬達', '組合', '汽車有一個引擎；換零件不必改類別階層'],
          ['只想重用父類別的幾個工具方法', '組合', '為了重用程式碼而繼承，會連不要的方法一起公開'],
        ] },
        { type: 'callout', tone: 'tip', title: '之後會用到：類別對映到資料表', text: '資料庫島的 DB16 會介紹 ORM（物件關聯對映）：一個類別對應一張資料表，一個物件對應一列，欄位對應欄位。本課的類別、封裝與「有一個」的關係，就是在那裡理解 `customer.orders` 這種寫法的基礎。' },
      ],
    },
  ],
  examples: [
    {
      id: 'account', title: '封裝：只能透過方法改餘額', description: '餘額是私有欄位，存款與提款在修改前先檢查不變條件「餘額不小於 0」；不合規則的操作被拒絕，餘額不變。',
      output: 'ok\nok\nrejected\nbalance = 70',
      code: {
        'C++': code`#include <initializer_list>
#include <iostream>

class Account {
public:
    bool deposit(int amount) {
        if (amount <= 0) return false;
        balance_ += amount;
        return true;
    }
    bool withdraw(int amount) {
        if (amount <= 0 || amount > balance_) return false;  // 守住：餘額不會變負
        balance_ -= amount;
        return true;
    }
    int balance() const { return balance_; }  // 只能讀，不能寫

private:
    int balance_ = 0;  // acc.balance_ = -1; 在類別外會編譯錯誤
};

int main() {
    Account acc;
    for (bool ok : {acc.deposit(100), acc.withdraw(30), acc.withdraw(500)}) std::cout << (ok ? "ok" : "rejected") << "\n";
    std::cout << "balance = " << acc.balance() << "\n";
    return 0;
}`,
        Java: code`class Account {
    private int balance = 0;  // 只有 Account 自己的方法能改

    boolean deposit(int amount) {
        if (amount <= 0) return false;
        balance += amount;
        return true;
    }

    boolean withdraw(int amount) {
        if (amount <= 0 || amount > balance) return false;  // 守住：餘額不會變負
        balance -= amount;
        return true;
    }

    int getBalance() { return balance; }
}

public class Main {
    public static void main(String[] args) {
        Account acc = new Account();
        boolean[] results = {acc.deposit(100), acc.withdraw(30), acc.withdraw(500)};
        for (boolean ok : results) System.out.println(ok ? "ok" : "rejected");
        System.out.println("balance = " + acc.getBalance());
    }
}`,
        Python: code`class Account:
    def __init__(self):
        self._balance = 0  # 單底線：約定「請勿從外面改」

    def deposit(self, amount):
        if amount <= 0:
            return False
        self._balance += amount
        return True

    def withdraw(self, amount):
        if amount <= 0 or amount > self._balance:  # 守住：餘額不會變負
            return False
        self._balance -= amount
        return True

    @property
    def balance(self):  # 唯讀屬性：acc.balance = 5 會丟出 AttributeError
        return self._balance


acc = Account()
for ok in [acc.deposit(100), acc.withdraw(30), acc.withdraw(500)]:
    print("ok" if ok else "rejected")
print(f"balance = {acc.balance}")`,
        JavaScript: code`class Account {
    #balance = 0;  // # 開頭：真正的私有欄位，類別外寫 acc.#balance 是語法錯誤

    deposit(amount) {
        if (amount <= 0) return false;
        this.#balance += amount;
        return true;
    }

    withdraw(amount) {
        if (amount <= 0 || amount > this.#balance) return false;  // 守住：餘額不會變負
        this.#balance -= amount;
        return true;
    }

    get balance() {  // 只有 getter，沒有 setter
        return this.#balance;
    }
}

const acc = new Account();
for (const ok of [acc.deposit(100), acc.withdraw(30), acc.withdraw(500)]) console.log(ok ? "ok" : "rejected");
console.log("balance = " + acc.balance);`,
      },
    },
    {
      id: 'override', title: '覆寫與動態分派：同一行呼叫，不同的方法', description: '清單的元素型別是 Shape，實際放的是 Shape、Rect 與 Square。父類別的 describe 呼叫 name() 與 area()，依物件的實際型別選到覆寫的版本；Square 沿用 Rect 的 area。',
      output: 'shape area=0\nrect area=12\nsquare area=25',
      code: {
        'C++': code`#include <iostream>
#include <memory>
#include <string>
#include <vector>

class Shape {
public:
    virtual ~Shape() = default;
    virtual std::string name() const { return "shape"; }
    virtual int area() const { return 0; }
    std::string describe() const { return name() + " area=" + std::to_string(area()); }
};

class Rect : public Shape {
public:
    Rect(int w, int h) : w_(w), h_(h) {}
    std::string name() const override { return "rect"; }
    int area() const override { return w_ * h_; }

private:
    int w_, h_;
};

class Square : public Rect {
public:
    explicit Square(int side) : Rect(side, side) {}
    std::string name() const override { return "square"; }  // area 沿用 Rect 的
};

int main() {
    std::vector<std::unique_ptr<Shape>> shapes;
    shapes.push_back(std::make_unique<Shape>());
    shapes.push_back(std::make_unique<Rect>(3, 4));
    shapes.push_back(std::make_unique<Square>(5));
    for (const auto& s : shapes) std::cout << s->describe() << "\n";
    return 0;
}`,
        Java: code`import java.util.List;

class Shape {
    String name() { return "shape"; }
    int area() { return 0; }
    String describe() { return name() + " area=" + area(); }
}

class Rect extends Shape {
    private final int w, h;
    Rect(int w, int h) { this.w = w; this.h = h; }
    @Override String name() { return "rect"; }
    @Override int area() { return w * h; }
}

class Square extends Rect {
    Square(int side) { super(side, side); }
    @Override String name() { return "square"; }  // area 沿用 Rect 的
}

public class Main {
    public static void main(String[] args) {
        List<Shape> shapes = List.of(new Shape(), new Rect(3, 4), new Square(5));
        for (Shape s : shapes) System.out.println(s.describe());
    }
}`,
        Python: code`class Shape:
    def name(self):
        return "shape"

    def area(self):
        return 0

    def describe(self):
        return f"{self.name()} area={self.area()}"


class Rect(Shape):
    def __init__(self, w, h):
        self.w, self.h = w, h

    def name(self):
        return "rect"

    def area(self):
        return self.w * self.h


class Square(Rect):
    def __init__(self, side):
        super().__init__(side, side)

    def name(self):  # area 沿用 Rect 的
        return "square"


for s in [Shape(), Rect(3, 4), Square(5)]:
    print(s.describe())`,
        JavaScript: code`class Shape {
    name() { return "shape"; }
    area() { return 0; }
    describe() { return this.name() + " area=" + this.area(); }
}

class Rect extends Shape {
    constructor(w, h) {
        super();
        this.w = w;
        this.h = h;
    }
    name() { return "rect"; }
    area() { return this.w * this.h; }
}

class Square extends Rect {
    constructor(side) { super(side, side); }
    name() { return "square"; }  // area 沿用 Rect 的
}

for (const s of [new Shape(), new Rect(3, 4), new Square(5)]) console.log(s.describe());`,
      },
    },
    {
      id: 'interface', title: '介面與抽象類別：呼叫端只認識介面', description: 'broadcast 只知道「每個通知方式都有 send」。C++ 用純虛擬函式、Java 用 interface、Python 用 ABC；JavaScript 沒有介面，第二個通知方式直接用一個有 send 方法的物件。',
      output: 'email to amy@example.com: server is down\nlog: server is down',
      code: {
        'C++': code`#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>

class Notifier {  // 抽象類別：有純虛擬函式，不能直接建立物件
public:
    virtual ~Notifier() = default;
    virtual std::string send(const std::string& message) const = 0;
};

class EmailNotifier : public Notifier {
public:
    explicit EmailNotifier(std::string address) : address_(std::move(address)) {}
    std::string send(const std::string& message) const override { return "email to " + address_ + ": " + message; }

private:
    std::string address_;
};

class LogNotifier : public Notifier {
public:
    std::string send(const std::string& message) const override { return "log: " + message; }
};

void broadcast(const std::vector<std::unique_ptr<Notifier>>& notifiers, const std::string& message) {
    for (const auto& n : notifiers) std::cout << n->send(message) << "\n";
}

int main() {
    std::vector<std::unique_ptr<Notifier>> notifiers;
    notifiers.push_back(std::make_unique<EmailNotifier>("amy@example.com"));
    notifiers.push_back(std::make_unique<LogNotifier>());
    broadcast(notifiers, "server is down");
    return 0;
}`,
        Java: code`import java.util.List;

interface Notifier {
    String send(String message);  // 只規定要有這個方法，不寫怎麼做
}

class EmailNotifier implements Notifier {
    private final String address;
    EmailNotifier(String address) { this.address = address; }
    @Override public String send(String message) { return "email to " + address + ": " + message; }
}

class LogNotifier implements Notifier {
    @Override public String send(String message) { return "log: " + message; }
}

public class Main {
    static void broadcast(List<Notifier> notifiers, String message) {
        for (Notifier n : notifiers) System.out.println(n.send(message));
    }

    public static void main(String[] args) {
        broadcast(List.of(new EmailNotifier("amy@example.com"), new LogNotifier()), "server is down");
    }
}`,
        Python: code`from abc import ABC, abstractmethod


class Notifier(ABC):  # Notifier() 會丟出 TypeError：不能建立抽象類別的物件
    @abstractmethod
    def send(self, message):
        """回傳送出的文字；子類別必須實作。"""


class EmailNotifier(Notifier):
    def __init__(self, address):
        self._address = address

    def send(self, message):
        return f"email to {self._address}: {message}"


class LogNotifier(Notifier):
    def send(self, message):
        return f"log: {message}"


def broadcast(notifiers, message):
    for n in notifiers:
        print(n.send(message))


broadcast([EmailNotifier("amy@example.com"), LogNotifier()], "server is down")`,
        JavaScript: code`class EmailNotifier {
    #address;
    constructor(address) { this.#address = address; }
    send(message) { return "email to " + this.#address + ": " + message; }
}

// 沒有介面也沒有共同父類別：只要有 send 方法就能用（鴨子型別）
const logNotifier = {
    send(message) { return "log: " + message; },
};

function broadcast(notifiers, message) {
    for (const n of notifiers) console.log(n.send(message));
}

broadcast([new EmailNotifier("amy@example.com"), logNotifier], "server is down");`,
      },
    },
    {
      id: 'stack-composition', title: '組合：堆疊裡面有一個 list', description: '堆疊不繼承 list／ArrayList／vector，而是把它當成私有欄位，只公開 push、pop 與 size，外面無法把資料插到中間。',
      output: 'pop 3\npop 2\nsize 1',
      code: {
        'C++': code`#include <iostream>
#include <vector>

class IntStack {
public:
    void push(int x) { items_.push_back(x); }
    int pop() {
        int top = items_.back();
        items_.pop_back();
        return top;
    }
    std::size_t size() const { return items_.size(); }

private:
    std::vector<int> items_;  // 有一個 vector，但不公開它的 insert、operator[]
};

int main() {
    IntStack s;
    for (int x : {1, 2, 3}) s.push(x);
    std::cout << "pop " << s.pop() << "\n";
    std::cout << "pop " << s.pop() << "\n";
    std::cout << "size " << s.size() << "\n";
    return 0;
}`,
        Java: code`import java.util.ArrayList;

class IntStack {
    private final ArrayList<Integer> items = new ArrayList<>();  // 有一個 ArrayList，不公開 add(0, x)

    void push(int x) { items.add(x); }
    int pop() { return items.remove(items.size() - 1); }
    int size() { return items.size(); }
}

public class Main {
    public static void main(String[] args) {
        IntStack s = new IntStack();
        for (int x : new int[]{1, 2, 3}) s.push(x);
        System.out.println("pop " + s.pop());
        System.out.println("pop " + s.pop());
        System.out.println("size " + s.size());
    }
}`,
        Python: code`class Stack:
    def __init__(self):
        self._items = []  # 有一個 list，不公開 insert

    def push(self, x):
        self._items.append(x)

    def pop(self):
        return self._items.pop()

    def __len__(self):
        return len(self._items)


s = Stack()
for x in [1, 2, 3]:
    s.push(x)
print("pop", s.pop())
print("pop", s.pop())
print("size", len(s))`,
        JavaScript: code`class Stack {
    #items = [];  // 有一個陣列，不公開 splice

    push(x) { this.#items.push(x); }
    pop() { return this.#items.pop(); }
    get size() { return this.#items.length; }
}

const s = new Stack();
for (const x of [1, 2, 3]) s.push(x);
console.log("pop " + s.pop());
console.log("pop " + s.pop());
console.log("size " + s.size);`,
      },
    },
  ],
  visualization: {
    kind: 'function-call', title: '透過父類別參考呼叫 virtual 方法（C++）', language: 'C++',
    code: code`struct Shape {
    virtual int area() const { return 0; }
};
struct Rect : Shape {
    int w, h;
    Rect(int w, int h) : w(w), h(h) {}
    int area() const override { return w * h; }
};
int report(const Shape& s) { return s.area(); }
int main() {
    Rect r(3, 4);
    std::cout << report(r);
}`,
    steps: [
      { line: 11, note: '建立 Rect 物件 r（w = 3、h = 4）。Rect 繼承 Shape，所以 r 也「是一個」Shape。', frames: [{ name: 'main', vars: { r: 'Rect{w=3, h=4}' } }] },
      { line: 9, note: '呼叫 report(r)：參數 s 是參考，沒有複製物件。s 的宣告型別是 Shape，實際指向的是 Rect。', frames: [{ name: 'main', vars: { r: 'Rect{w=3, h=4}' } }, { name: 'report', vars: { s: '→ main 的 r（宣告 Shape&，實際 Rect）' } }] },
      { line: 9, note: '執行 s.area()：area 是 virtual，所以執行時依 s 實際指向的物件型別（Rect）選方法，而不是依宣告型別 Shape。', frames: [{ name: 'main', vars: { r: 'Rect{w=3, h=4}' } }, { name: 'report', vars: { s: '→ main 的 r（宣告 Shape&，實際 Rect）' } }] },
      { line: 7, note: '進入 Rect::area，this 指向 r，計算 3 × 4 = 12。', frames: [{ name: 'main', vars: { r: 'Rect{w=3, h=4}' } }, { name: 'report', vars: { s: '→ main 的 r（宣告 Shape&，實際 Rect）' } }, { name: 'Rect::area', vars: { this: '→ r', w: '3', h: '4' }, returns: '12' }] },
      { line: 9, note: '回到 report，把 12 回傳給 main。若第 2 行沒有 virtual，上一步會進入 Shape::area，這裡就會是 0。', frames: [{ name: 'main', vars: { r: 'Rect{w=3, h=4}' } }, { name: 'report', vars: { s: '→ main 的 r（宣告 Shape&，實際 Rect）' }, returns: '12' }] },
      { line: 12, note: '回到 main，輸出 12。', frames: [{ name: 'main', vars: { r: 'Rect{w=3, h=4}' } }], output: '12' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 C++ 程式輸出什麼？（Animal 的 sound 沒有寫 virtual）',
      code: { language: 'C++', text: 'struct Animal {\n    std::string sound() const { return "..."; }\n};\nstruct Dog : Animal {\n    std::string sound() const { return "woof"; }\n};\nvoid speak(const Animal& a) { std::cout << a.sound() << "\\n"; }\nint main() {\n    Dog d;\n    speak(d);\n    std::cout << d.sound() << "\\n";\n}' },
      options: ['先印 ...，再印 woof', '兩行都是 woof', '兩行都是 ...', '編譯錯誤：Dog 不能有和 Animal 同名的方法'],
      answer: 0, explanation: 'sound 不是 virtual，`a.sound()` 依參數的宣告型別 Animal 在編譯時就選定 Animal::sound，所以印 ...；`d.sound()` 的宣告型別是 Dog，印 woof。「兩行都是 woof」是加了 virtual 之後的結果；「兩行都是 ...」忽略了直接用 Dog 呼叫時會選 Dog 的版本；子類別定義同名方法是合法的（沒有 virtual 時稱為隱藏，不是覆寫），不會編譯錯誤。',
    },
    {
      id: 'q2', prompt: '下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: 'class A {\n    String who() { return "A"; }\n    String hello() { return "I am " + who(); }\n}\nclass B extends A {\n    @Override String who() { return "B"; }\n}\n// main 中：\nA x = new B();\nSystem.out.println(x.hello());' },
      options: ['I am A', 'I am B', 'I am AB', '編譯錯誤：B 沒有定義 hello'],
      answer: 1, explanation: 'B 繼承了 A 的 hello，執行 hello 時呼叫的 `who()` 等於 `this.who()`，而 this 實際是 B 物件；Java 的方法預設動態分派，所以選到 B 的 who，輸出 I am B。「I am A」是以為寫在 A 裡的程式只會呼叫 A 的方法；不會把兩個版本都呼叫，所以不是 AB；B 繼承了 hello，不需要自己定義。',
    },
    {
      id: 'q3', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'class Account:\n    def __init__(self):\n        self.__balance = 0\n\nacc = Account()\nacc.__balance = 50\nprint(acc._Account__balance, acc.__balance)' },
      options: ['0 50', '50 50', '0 0', 'AttributeError：__balance 是私有的'],
      answer: 0, explanation: '類別裡的 `self.__balance` 被改名為 `_Account__balance`，值是 0。類別外的 `acc.__balance = 50` 不會改名，只是新增一個名叫 `__balance` 的屬性，所以兩者分別是 0 與 50。「50 50」以為兩個名字是同一個欄位；「0 0」忽略了第 6 行確實新增了屬性；Python 沒有真正的私有欄位，不會因存取而丟出 AttributeError。',
    },
    {
      id: 'q4', prompt: 'JavaScript：`class Animal { speak() { return "..."; } }`，`class Dog extends Animal {}`（Dog 沒有自己的 speak）。先執行 `const d = new Dog();`，之後才執行 `Animal.prototype.speak = function () { return "hi"; };`。最後 `console.log(d.speak(), Object.getPrototypeOf(Dog.prototype) === Animal.prototype)` 印出什麼？',
      options: ['hi true', '... true', 'hi false', 'TypeError：d.speak is not a function'],
      answer: 0, explanation: 'Dog 沒有自己的 speak，呼叫時沿 prototype 鏈找到 Animal.prototype.speak；查找發生在呼叫的那一刻，所以用的是第 6 行換上的新函式，印 hi。`extends` 讓 Dog.prototype 的 prototype 正是 Animal.prototype，比較結果為 true。「... true」以為物件建立時就把方法複製好了；「hi false」不知道 extends 就是靠這條 prototype 連結；方法在鏈上找得到，不會是 TypeError。',
    },
    {
      id: 'q5', prompt: '下面的 Java 程式哪裡有錯？',
      code: { language: 'Java', text: 'interface Shape {\n    int area();\n}\nclass Square implements Shape {\n    private int side = 2;\n    int area(int scale) { return side * side * scale; }\n}' },
      options: ['編譯錯誤：Square 沒有實作 area()，area(int) 是另一個方法', '沒有錯，area(int) 算是實作了 area', '執行時呼叫 area() 才會丟出例外', '錯在 side 是 private，介面讀不到'],
      answer: 0, explanation: '參數不同的 `area(int)` 是多載（overload），不是覆寫，所以介面規定的 `area()` 仍然沒有實作，而且介面方法實作時還必須是 public；非 abstract 的類別少實作介面方法，Java 在編譯時就拒絕。在方法上寫 `@Override` 能讓這類簽名錯誤的訊息更直接。Java 不會延到執行時才發現（那是 JavaScript 鴨子型別的行為）；private 欄位只在類別內使用，與介面無關。',
    },
    {
      id: 'q6', prompt: '要寫一個「最近瀏覽紀錄」類別：最多保留 10 筆、新的在最前面，不允許從中間插入。哪個設計最好？',
      options: ['類別裡有一個私有的 list，只公開 visit 與 recent 兩個方法', '繼承 ArrayList（或 Python 的 list），覆寫 add 讓它自動刪掉超過 10 筆的資料', '把 list 宣告為公開欄位，請大家呼叫前自己檢查長度', '繼承 ArrayList，並在文件寫明「請勿呼叫 add(index, x)」'],
      answer: 0, explanation: '這是「有一個」的關係，用組合把 list 藏起來，只有 visit 能新增資料，「最多 10 筆、不從中間插入」的不變條件只需要在一個地方維護。繼承 list 會連帶公開 `add(index, x)`、`set`、`addAll` 等方法，只覆寫 add 擋不住其他入口；公開欄位等於把檢查交給每個呼叫者；只靠文件約定，語言不會阻止任何人呼叫。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '有手續費的帳戶',
      statement: '設計帳戶類別：餘額從 0 開始，只能透過 deposit（存款）與 withdraw（提款）改變，任何時候都不能小於 0。一般帳戶 `basic` 提款 x 時扣 x；手續費帳戶 `fee` 繼承一般帳戶，只覆寫「提款要扣多少」這一步，改為扣 x + 1。不合規則的操作被拒絕，餘額不變：存款或提款金額小於等於 0，或要扣的金額超過餘額。主程式依第一行建立對應的帳戶，之後只透過父類別型別（C++ 的 `std::unique_ptr<Account>`、Java 的 `Account`）呼叫方法。每個操作後輸出 `ok 餘額` 或 `rejected 餘額`，最後輸出 `final 餘額`。帳戶種類不是 basic 或 fee 時，只輸出 `Invalid account type`。',
      inputFormat: '第一行是帳戶種類；第二行是操作數 n；接著 n 行，每行是 `deposit x` 或 `withdraw x`。',
      outputFormat: 'n 行 `ok b` 或 `rejected b`（b 是該操作後的餘額），最後一行 `final b`；或只有一行 `Invalid account type`。',
      constraints: ['0 ≤ n ≤ 100', '−10⁹ ≤ x ≤ 10⁹', '操作只會是 deposit 或 withdraw；餘額可能超過 32 位元整數的範圍'],
      samples: [{ kind: 'normal', input: 'fee\n3\ndeposit 50\nwithdraw 20\nwithdraw 29', output: 'ok 50\nok 29\nrejected 29\nfinal 29', note: '提款 20 實際扣 21；再提 29 要扣 30，超過餘額 29' }],
      tests: [
        { kind: 'normal', input: 'basic\n3\ndeposit 100\nwithdraw 30\nwithdraw 80', output: 'ok 100\nok 70\nrejected 70\nfinal 70', note: '一般帳戶，提款超過餘額被拒絕' },
        { kind: 'normal', input: 'fee\n3\ndeposit 50\nwithdraw 20\nwithdraw 28', output: 'ok 50\nok 29\nok 0\nfinal 0', note: '手續費帳戶，剛好扣到 0' },
        { kind: 'edge', input: 'fee\n3\ndeposit 10\nwithdraw 10\nwithdraw 9', output: 'ok 10\nrejected 10\nok 0\nfinal 0', note: '提領全部餘額時還要付手續費，所以被拒絕' },
        { kind: 'edge', input: 'basic\n3\ndeposit 10\nwithdraw 10\nwithdraw 1', output: 'ok 10\nok 0\nrejected 0\nfinal 0', note: '一般帳戶可以剛好領完，之後再領被拒絕' },
        { kind: 'edge', input: 'basic\n0', output: 'final 0', note: '沒有任何操作' },
        { kind: 'edge', input: 'basic\n4\ndeposit 1000000000\ndeposit 1000000000\ndeposit 1000000000\nwithdraw 2500000000', output: 'ok 1000000000\nok 2000000000\nok 3000000000\nok 500000000\nfinal 500000000', note: '餘額超過 32 位元整數，需要 long long／long' },
        { kind: 'error', input: 'fee\n4\ndeposit -5\ndeposit 0\nwithdraw -3\nwithdraw 0', output: 'rejected 0\nrejected 0\nrejected 0\nrejected 0\nfinal 0', note: '金額不是正數，一律拒絕' },
        { kind: 'error', input: 'gold\n1\ndeposit 5', output: 'Invalid account type', note: '不存在的帳戶種類' },
      ],
      hints: [
        '把「提款要扣多少」寫成一個可覆寫的方法（例如 `cost(x)`）；withdraw 寫在父類別，先檢查金額，再呼叫 cost，再檢查餘額。',
        'C++ 的 cost 要寫 `virtual`，子類別寫 `override`；JavaScript 的 cost 不能是 `#` 私有方法，否則子類別無法覆寫。',
        '餘額用 C++ 的 long long、Java 的 long；Python 與 JavaScript 的數值在這個範圍內不會出錯。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <memory>
#include <string>

class Account {
public:
    virtual ~Account() = default;
    bool deposit(long long amount) {
        if (amount <= 0) return false;
        balance_ += amount;
        return true;
    }
    bool withdraw(long long amount) {
        if (amount <= 0) return false;
        long long total = cost(amount);  // 動態分派：FeeAccount 會選到它自己的 cost
        if (total > balance_) return false;
        balance_ -= total;
        return true;
    }
    long long balance() const { return balance_; }

protected:
    virtual long long cost(long long amount) const { return amount; }

private:
    long long balance_ = 0;
};

class FeeAccount : public Account {
protected:
    long long cost(long long amount) const override { return amount + 1; }
};

std::unique_ptr<Account> makeAccount(const std::string& kind) {
    if (kind == "basic") return std::make_unique<Account>();
    if (kind == "fee") return std::make_unique<FeeAccount>();
    return nullptr;
}

int main() {
    std::string kind;
    int n;
    std::cin >> kind >> n;
    std::unique_ptr<Account> account = makeAccount(kind);
    if (!account) {
        std::cout << "Invalid account type\n";
        return 0;
    }
    for (int i = 0; i < n; ++i) {
        std::string op;
        long long amount;
        std::cin >> op >> amount;
        bool ok = op == "deposit" ? account->deposit(amount) : account->withdraw(amount);
        std::cout << (ok ? "ok " : "rejected ") << account->balance() << "\n";
    }
    std::cout << "final " << account->balance() << "\n";
    return 0;
}`,
        Java: code`import java.util.Scanner;

class Account {
    private long balance = 0;

    boolean deposit(long amount) {
        if (amount <= 0) return false;
        balance += amount;
        return true;
    }

    boolean withdraw(long amount) {
        if (amount <= 0) return false;
        long total = cost(amount);  // 動態分派：FeeAccount 會選到它自己的 cost
        if (total > balance) return false;
        balance -= total;
        return true;
    }

    long getBalance() { return balance; }

    protected long cost(long amount) { return amount; }
}

class FeeAccount extends Account {
    @Override protected long cost(long amount) { return amount + 1; }
}

public class Main {
    static Account makeAccount(String kind) {
        if (kind.equals("basic")) return new Account();
        if (kind.equals("fee")) return new FeeAccount();
        return null;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        Account account = makeAccount(sc.next());
        if (account == null) {
            System.out.println("Invalid account type");
            return;
        }
        int n = sc.nextInt();
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < n; i++) {
            String op = sc.next();
            long amount = sc.nextLong();
            boolean ok = op.equals("deposit") ? account.deposit(amount) : account.withdraw(amount);
            out.append(ok ? "ok " : "rejected ").append(account.getBalance()).append("\n");
        }
        out.append("final ").append(account.getBalance());
        System.out.println(out);
    }
}`,
        Python: code`class Account:
    def __init__(self):
        self._balance = 0

    @property
    def balance(self):
        return self._balance

    def _cost(self, amount):
        return amount

    def deposit(self, amount):
        if amount <= 0:
            return False
        self._balance += amount
        return True

    def withdraw(self, amount):
        if amount <= 0:
            return False
        total = self._cost(amount)  # 動態分派：FeeAccount 會選到它自己的 _cost
        if total > self._balance:
            return False
        self._balance -= total
        return True


class FeeAccount(Account):
    def _cost(self, amount):
        return amount + 1


KINDS = {"basic": Account, "fee": FeeAccount}

kind = input().strip()
if kind not in KINDS:
    print("Invalid account type")
else:
    account = KINDS[kind]()
    for _ in range(int(input())):
        op, amount = input().split()
        amount = int(amount)
        ok = account.deposit(amount) if op == "deposit" else account.withdraw(amount)
        print("ok" if ok else "rejected", account.balance)
    print("final", account.balance)`,
        JavaScript: code`class Account {
    #balance = 0;

    get balance() { return this.#balance; }

    cost(amount) { return amount; }  // 一般方法，子類別才能覆寫

    deposit(amount) {
        if (amount <= 0) return false;
        this.#balance += amount;
        return true;
    }

    withdraw(amount) {
        if (amount <= 0) return false;
        const total = this.cost(amount);  // 沿 prototype 鏈找到 FeeAccount 的 cost
        if (total > this.#balance) return false;
        this.#balance -= total;
        return true;
    }
}

class FeeAccount extends Account {
    cost(amount) { return amount + 1; }
}

const KINDS = { basic: Account, fee: FeeAccount };
const lines = require("fs").readFileSync(0, "utf8").trim().split("\n");
const kind = lines[0].trim();
if (!Object.hasOwn(KINDS, kind)) {
    console.log("Invalid account type");
} else {
    const account = new KINDS[kind]();
    const n = Number(lines[1]);
    const out = [];
    for (let i = 0; i < n; i++) {
        const [op, text] = lines[2 + i].trim().split(/\s+/);
        const amount = Number(text);
        const ok = op === "deposit" ? account.deposit(amount) : account.withdraw(amount);
        out.push((ok ? "ok " : "rejected ") + account.balance);
    }
    out.push("final " + account.balance);
    console.log(out.join("\n"));
}`,
      },
      judge: 'none',
    },
  ],
};

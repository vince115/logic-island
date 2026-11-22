import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * AIF01 AI 是什麼. A python-code lesson: every example and the reference solution are Python only and run in
 * tests/curriculum-code.test.ts and tests/python-capability.test.ts. The blueprint activity (case-study-board) is not
 * built; the lesson uses the conditional-branch visualization of the thermostat example (its thresholds are the same
 * as the program's) to show a rule-based decision, and contrasts it with the learned classifier in the text.
 */
export const AIF01: LessonContent = {
  lessonId: 'AIF01',
  motivation: '手機解鎖、垃圾郵件過濾、導航、恆溫器，都被某些廣告稱為「AI」。但一個照著 if 判斷溫度的恆溫器，和一個從上萬封信學會判斷垃圾郵件的過濾器，做事的方式根本不同。本課先建立判斷的依據：AI 有哪四種定義、什麼是理性代理人、圖靈測試證明了什麼又證明不了什麼，以及符號式與資料驅動兩條路線。學完後，你能看著一個系統說出它是規則式程式還是 AI 系統，並講出理由，而不是只看行銷用語。',
  sections: [
    {
      id: 'four-definitions', title: 'AI 的四種定義：像人或理性，思考或行動',
      blocks: [
        { type: 'p', text: '「人工智慧」（artificial intelligence）一詞出自 1955 年 McCarthy、Minsky、Rochester 與 Shannon 提出的研究計畫書，該計畫在 1956 年夏天於達特茅斯學院舉行研討會，通常被視為 AI 成為研究領域的起點。之後半個多世紀，研究者對「AI 要做到什麼」一直沒有單一答案。Russell 與 Norvig 的教科書《Artificial Intelligence: A Modern Approach》把各家定義依兩個問題整理成四類：目標是像人（human），還是理性（rational）？關心的是思考（thinking），還是行動（acting）？' },
        { type: 'table', head: ['', '像人一樣（humanly）', '理性地（rationally）'], rows: [
          ['思考', '像人一樣思考：用電腦模擬人的認知過程，和心理學實驗比對（認知建模，cognitive modeling）', '理性思考：用邏輯規則從前提推出正確結論（「思考的法則」，laws of thought）'],
          ['行動', '像人一樣行動：外在表現讓人分不出是機器，代表是圖靈測試', '理性行動：在已知資訊下選擇能把目標達成得最好的行動，也就是理性代理人'],
        ] },
        { type: 'p', text: '「像人」以人的表現為標準，「理性」以一個可以寫清楚的正確標準為準，例如邏輯是否有效、績效指標是否最高。人不一定理性：會算錯、會受情緒影響，所以兩者不同。「思考」看內部過程，「行動」只看外在行為。現在的 AI 教科書與工程實務多採用「理性行動」：它不要求機器內部像人，只要求行為在目標下是好的，而且「好」可以量化、可以測試。' },
        { type: 'callout', tone: 'note', title: '四種定義不是四種技術', text: '四種定義回答的是「什麼算成功」，不是「用什麼方法做」。同一個下棋程式，可以用「是否像人類棋手」來評估，也可以用「勝率是否最高」來評估。後面要講的符號式與資料驅動，才是「怎麼做」的分類。' },
      ],
    },
    {
      id: 'rational-agent', title: '理性代理人：感知、行動與績效指標',
      blocks: [
        { type: 'p', text: '代理人（agent）是任何能透過感測器（sensor）感知環境、再透過致動器（actuator）對環境採取行動的東西：掃地機器人用碰撞感測器感知、用輪子與吸塵口行動；下棋程式感知棋盤、輸出棋步。代理人函式（agent function）把「到目前為止的感知序列」對應到一個行動。' },
        { type: 'p', text: '理性代理人（rational agent）的定義是：對每一個可能的感知序列，依據感知到的證據與內建的知識，選擇預期能讓績效指標（performance measure）最大的行動。理性取決於四件事：績效指標怎麼定、代理人事先知道什麼、能做哪些行動、到目前為止感知到什麼。' },
        { type: 'example', id: 'vacuum-agent' },
        { type: 'p', text: '範例用 Russell 與 Norvig 書中經典的兩格吸塵世界：績效指標是「每一步、每個乾淨的格子得 1 分」。反射代理人看到髒就吸、乾淨就移到另一格，4 步得 6 分；什麼都不做的代理人得 0 分。判斷誰比較理性，看的是績效指標，不是程式看起來聰不聰明。換一個績效指標，例如每次移動扣分，同一個代理人就可能不再是理性的。' },
        { type: 'callout', tone: 'warning', title: '「理性」不等於「全知」或「結果一定最好」', text: '理性代理人只保證在已知資訊下選擇「預期」最好的行動，不保證實際結果最好。導航依目前路況選了最快的路線，之後前方突然發生車禍，結果變慢，這不代表它不理性；它不可能知道還沒發生的事。把理性當成全知（omniscience），就會用事後才知道的資訊錯怪一個合理的決策。' },
      ],
    },
    {
      id: 'turing-test', title: '圖靈測試：設計與限制',
      blocks: [
        { type: 'p', text: 'Alan Turing 在 1950 年的論文〈Computing Machinery and Intelligence〉中，把「機器能思考嗎？」這個難以定義的問題，換成一個可以操作的模仿遊戲（imitation game）：一位提問者只透過文字和兩個看不見的對象交談，一個是人、一個是機器；如果提問者無法可靠地分辨哪一個是機器，就說這台機器通過測試。這就是圖靈測試（Turing test），它屬於「像人一樣行動」的定義。' },
        { type: 'list', items: [
          '設計的優點：只看可觀察的行為，不必先定義「思考」或「意識」；用文字交談，避免外觀與聲音影響判斷。',
          '要通過測試，機器需要的能力很廣：自然語言處理、知識表示、推理，以及從對話中學習。',
          '延伸版本「完整圖靈測試」（total Turing test）還加上視覺感知與操作物體，需要電腦視覺與機器人技術。',
        ] },
        { type: 'p', text: '限制一：它測的是「騙過人」，不是理解。Joseph Weizenbaum 在 1966 年發表的 ELIZA，只用關鍵字比對與固定的回覆範本扮演心理諮商師，仍有使用者以為它真的懂自己。下面的程式就是同一種做法：依序比對關鍵字表，第一個命中的關鍵字決定回覆，沒有任何理解。' },
        { type: 'example', id: 'rule-chatbot' },
        { type: 'p', text: '限制二：結果取決於提問者與時間長短，沒有客觀的通過門檻。限制三：它要求機器「像人」，連人的錯誤也要模仿，例如故意算慢一點；一個計算比人準確得多的系統，反而可能因此露餡。限制四：John Searle 在 1980 年提出「中文房間」（Chinese Room）論證：一個不懂中文的人照著規則手冊處理中文符號，外面的人看到的回覆完全正確，房間裡的人仍然不懂中文，說明符號操作的行為不足以證明理解。這也是研究者大多改以「理性行動」作為目標的原因之一。' },
        { type: 'callout', tone: 'warning', title: '「聊天機器人對答流暢，就代表它有智慧、懂你在說什麼」', text: '流暢的對話只證明輸出的文字像人寫的。ELIZA 只靠關鍵字與回覆範本就讓人產生被理解的感覺；範例的回覆表在句子同時有 sad 與 because 時，只因為 sad 排在前面就回覆「Why do you feel sad?」，它不知道哪一個詞才是重點。評估系統要看它在明確任務上的表現與失敗方式，不是看它聽起來像不像人。' },
      ],
    },
    {
      id: 'narrow-and-general', title: '弱 AI 與通用 AI',
      blocks: [
        { type: 'p', text: '弱 AI 在日常用法中常指狹義 AI（narrow AI）：只在一個特定任務上表現良好的系統，例如辨識人臉、過濾垃圾郵件、下圍棋。通用人工智慧（artificial general intelligence，AGI）則指能像人一樣在各種不同任務間學習與轉換、處理沒見過的問題的系統。' },
        { type: 'table', head: ['', '狹義 AI（弱 AI 的常見用法）', '通用 AI（AGI）'], rows: [
          ['能力範圍', '一個或一小類任務', '廣泛的任務，能把一處學到的能力用到新問題'],
          ['換一個任務', '通常要重新設計或重新訓練', '能自行學會'],
          ['例子', '1997 年擊敗西洋棋世界冠軍 Kasparov 的 Deep Blue；2016 年擊敗李世乭的 AlphaGo；人臉解鎖', '目前沒有公認已達成的系統'],
        ] },
        { type: 'p', text: 'AlphaGo 的圍棋實力超過世界冠軍，但它不會下西洋棋，也不會回答一句簡單的問題；能力強和能力廣是兩回事。本課要分類的十個日常系統，就算是 AI，也全都是狹義 AI。' },
        { type: 'callout', tone: 'note', title: '「弱 AI／強 AI」在哲學上的另一個意思', text: 'Searle 原本的用法是：弱 AI 主張機器能「表現得像」有智慧，強 AI 主張適當程式化的機器「真的有」心智與理解。這個區分談的是有沒有心智，和能力範圍無關。閱讀資料時要看上下文分辨是哪一種意思；本課的「弱 AI 與通用 AI」指的是能力範圍。' },
      ],
    },
    {
      id: 'symbolic-vs-data', title: '符號式與資料驅動：AI、機器學習與深度學習',
      blocks: [
        { type: 'p', text: '「怎麼做出 AI」有兩條主要路線。符號式 AI（symbolic AI）由人把知識寫成符號、規則與邏輯，再讓程式搜尋或推理：西洋棋程式搜尋可能的棋步、導航用搜尋演算法找最短路線、1970 年代的醫療專家系統 MYCIN 把醫師的知識寫成數百條規則並串連推論。資料驅動（data-driven）的路線則是機器學習（machine learning）：程式不直接寫出判斷規則，而是從資料中學到規則或參數。' },
        { type: 'table', head: ['', '符號式 AI', '機器學習（資料驅動）'], rows: [
          ['知識從哪裡來', '人寫下規則、知識庫或搜尋問題的定義', '從標記好的例子或經驗中學到'],
          ['改變行為的方式', '修改程式或規則', '換資料重新訓練，程式不用改'],
          ['優點', '每一步推理都能解釋、檢查', '能處理人寫不出規則的問題，例如辨識照片中的貓'],
          ['弱點', '規則難以窮舉，遇到規則外的情況就失效', '需要大量資料；可能學到資料中的偏差；難以解釋'],
        ] },
        { type: 'p', text: '三個名詞的關係是包含關係：深度學習（deep learning）是使用多層神經網路的機器學習，機器學習是 AI 的一個子領域，而符號式 AI 屬於 AI 卻不屬於機器學習。兩條路線也會結合：AlphaGo 用深度神經網路評估局面，再用蒙地卡羅樹搜尋（Monte Carlo tree search）挑選棋步。' },
        { type: 'p', text: '下面是最小的資料驅動例子：一個單字頻率分類器。程式裡沒有任何「free 是垃圾郵件」的規則；它從四句訓練資料數出每個字在兩類中出現的比例，再替新訊息加總比例。多加一句「free lunch」的正常信件後，同一則訊息的判斷就從 spam 變成 ham，程式一個字都沒改。' },
        { type: 'example', id: 'learned-classifier' },
        { type: 'callout', tone: 'warning', title: '「AI 一定會從資料學習」', text: 'Deep Blue 主要靠大規模搜尋與人設計的評估函數，MYCIN 靠的是人寫的規則與推論，它們的核心都不是從資料學習，卻都是 AI 史上的代表系統。判斷一個系統是不是 AI，不能只問「有沒有學習」，還要問它有沒有在多個可能的行動或結論之間搜尋、推理。' },
      ],
    },
    {
      id: 'classify', title: '判斷日常系統：規則式程式還是 AI 系統',
      blocks: [
        { type: 'p', text: '規則式程式（rule-based program）由程式設計師直接寫出「什麼輸入給什麼輸出」：恆溫器低於 18 度加熱、高於 26 度開冷氣，否則待機。規則一步就從輸入到輸出，不搜尋其他行動，也不從經驗改變，門檻要改只能由人修改程式。下方的視覺化就是範例程式的同一組規則，拖動溫度可以看到它走進哪一個分支。' },
        { type: 'example', id: 'thermostat' },
        { type: 'p', text: '本課用以下的明確規則判斷（練習題也用它），每一條都能對回前面的定義：' },
        { type: 'table', head: ['系統有這個特徵', '分類', '理由代碼', '對應的定義'], rows: [
          ['從資料學到判斷規則或參數（learns-from-data）', 'AI', '`data`', '資料驅動：機器學習'],
          ['在多個可能的行動或結論間搜尋、串連規則推論（searches-or-infers）', 'AI', '`reasoning`', '符號式：理性思考與理性行動'],
          ['以上都沒有，只照人寫好的條件分支反應（fixed-rules）', '規則式程式', '`rules`', '一步對應，沒有搜尋或學習'],
          ['以上都沒有，只是固定的計算公式', '規則式程式', '`formula`', '一般的計算程式'],
        ] },
        { type: 'table', head: ['系統', '特徵', '分類與理由'], rows: [
          ['恆溫器', '固定門檻', '規則式程式（rules）'],
          ['垃圾郵件過濾器', '從標記過的信件學習，另有人寫的封鎖名單', 'AI（data）：有學習就算，封鎖名單不改變分類'],
          ['單位換算', '固定公式', '規則式程式（formula）'],
          ['導航路線規劃', '在道路圖上搜尋最短路線', 'AI（reasoning）'],
          ['人臉解鎖', '從大量人臉資料訓練的模型', 'AI（data）'],
          ['定時紅綠燈', '固定的時相表', '規則式程式（rules）'],
          ['傳統西洋棋程式', '搜尋棋步並用評估函數比較', 'AI（reasoning）'],
          ['醫療專家系統', '人寫的規則，但由推論引擎串連推出新結論', 'AI（reasoning）'],
          ['AlphaGo 類圍棋程式', '神經網路從對局資料學習，再搭配樹搜尋', 'AI（data+reasoning）'],
          ['自動販賣機', '投幣、選擇、出貨的固定流程', '規則式程式（rules）'],
        ] },
        { type: 'callout', tone: 'warning', title: '「程式裡有 if，就不是 AI」或「有規則就是規則式程式」', text: '分界不在有沒有 if：每個 AI 系統的程式碼裡都有大量 if，專家系統更是由規則組成。差別在規則怎麼被使用：恆溫器的每條規則直接對應一個輸出；專家系統則把規則當成知識，由推論引擎在許多規則間串連，推出沒有被直接寫下的結論。邊界也不是絕對的：依「理性行動」的寬鬆定義，恆溫器可以算最簡單的反射代理人。所以分類時要先寫明判斷規則，再逐條說明理由。' },
      ],
    },
  ],
  examples: [
    {
      id: 'vacuum-agent', title: '兩格吸塵世界：用績效指標比較代理人', description: '同一個環境、同一個績效指標，比較「看到髒就吸」的反射代理人與什麼都不做的代理人。',
      output: '1 Suck A clean: A\n2 Right B clean: A\n3 Suck B clean: AB\n4 Left A clean: AB\nreflex score: 6\n1 Wait A clean: -\n2 Wait A clean: -\n3 Wait A clean: -\n4 Wait A clean: -\nlazy score: 0',
      code: {
        Python: code`def reflex_agent(location, dirty):
    if dirty:
        return "Suck"
    return "Right" if location == "A" else "Left"


def lazy_agent(location, dirty):
    return "Wait"


def run(agent, steps):
    dirty = {"A": True, "B": True}
    location, score = "A", 0
    for step in range(1, steps + 1):
        action = agent(location, dirty[location])
        if action == "Suck":
            dirty[location] = False
        elif action == "Right":
            location = "B"
        elif action == "Left":
            location = "A"
        clean = [square for square in ["A", "B"] if not dirty[square]]
        score += len(clean)  # 績效指標：每一步每個乾淨的格子得 1 分
        print(step, action, location, "clean:", "".join(clean) or "-")
    return score


print("reflex score:", run(reflex_agent, 4))
print("lazy score:", run(lazy_agent, 4))`,
      },
    },
    {
      id: 'rule-chatbot', title: 'ELIZA 式的規則聊天機器人', description: '依序比對關鍵字表，第一個命中的關鍵字決定回覆；沒有命中就用預設句。程式不理解句子，只比對字。',
      stdin: 'Hello there\nI am sad because of work\nBecause my mother called\nThe weather is nice\n',
      output: '> Hello there\nHello! How are you feeling today?\n> I am sad because of work\nWhy do you feel sad?\n> Because my mother called\nTell me more about your family.\n> The weather is nice\nPlease go on.',
      code: {
        Python: code`import sys

# 依序比對的回覆表：第一個出現在句子裡的關鍵字決定回覆
RULES = [
    ("hello", "Hello! How are you feeling today?"),
    ("sad", "Why do you feel sad?"),
    ("mother", "Tell me more about your family."),
    ("because", "Is that the real reason?"),
]
DEFAULT = "Please go on."


def reply(sentence):
    words = sentence.lower().replace(",", " ").replace(".", " ").split()
    for keyword, answer in RULES:
        if keyword in words:
            return answer
    return DEFAULT


for line in sys.stdin.read().splitlines():
    print("> " + line)
    print(reply(line))`,
      },
    },
    {
      id: 'learned-classifier', title: '從資料學習的單字頻率分類器', description: '程式不寫判斷規則，只從訓練資料數出單字比例；多加一筆資料，同一則訊息的判斷就改變。分數用 Fraction 保持精確。',
      output: 'model 1: spam 2/9 1/8\nmodel 2: ham 2/9 2/7',
      code: {
        Python: code`from collections import Counter
from fractions import Fraction


def train(examples):
    counts = {"spam": Counter(), "ham": Counter()}
    for label, text in examples:
        counts[label].update(text.split())
    return counts


def score(counts, label, text):
    total = sum(counts[label].values())
    return sum(Fraction(counts[label][word], total) for word in text.split())


def predict(counts, text):
    spam, ham = score(counts, "spam", text), score(counts, "ham", text)
    return ("spam" if spam > ham else "ham"), spam, ham


data = [
    ("spam", "win a free prize now"),
    ("spam", "free money win now"),
    ("ham", "lunch at noon"),
    ("ham", "see you at the meeting"),
]
message = "free lunch today"
print("model 1:", *predict(train(data), message))
data.append(("ham", "free lunch in the office today"))
print("model 2:", *predict(train(data), message))`,
      },
    },
    {
      id: 'thermostat', title: '規則式恆溫器', description: '門檻由程式設計師寫死：低於 18 度加熱、高於 26 度開冷氣，其餘待機。和視覺化使用同一組規則。',
      output: '12 HEAT\n18 IDLE\n22 IDLE\n26 IDLE\n31 COOL',
      code: {
        Python: code`def thermostat(temp):
    # 規則由程式設計師寫死：門檻 18 與 26 不會因為使用經驗而改變
    if temp < 18:
        return "HEAT"
    elif temp > 26:
        return "COOL"
    else:
        return "IDLE"


for temp in [12, 18, 22, 26, 31]:
    print(temp, thermostat(temp))`,
      },
    },
  ],
  visualization: {
    kind: 'conditional-branch', title: '規則式恆溫器：溫度走進哪一個分支？', variable: 'temp', min: -10, max: 40, initial: 22,
    branches: [
      { label: 'temp < 18', when: { all: [{ op: '<', value: 18 }] }, result: 'HEAT（加熱）' },
      { label: 'temp > 26', when: { all: [{ op: '>', value: 26 }] }, result: 'COOL（冷氣）' },
    ],
    otherwise: 'IDLE（待機）',
  },
  quiz: [
    {
      id: 'q1', prompt: '圖靈測試以「提問者能否分辨對方是人還是機器」作為判準。它屬於 AI 四種定義中的哪一種？',
      options: ['像人一樣思考', '像人一樣行動', '理性思考', '理性行動'],
      answer: 1,
      explanation: '圖靈測試只看外在的對話行為是否和人分不出來，所以是「像人一樣行動」。它不檢查內部過程，因此不是「像人一樣思考」（那是認知建模）；它以人為標準而不是以正確推論或績效指標為標準，因此也不是「理性思考」或「理性行動」。',
    },
    {
      id: 'q2', prompt: '下面的規則聊天機器人會印出什麼？',
      code: { language: 'Python', text: 'RULES = [("hello", "Hi!"), ("bye", "See you."), ("sad", "Why sad?")]\n\ndef reply(text):\n    words = text.lower().split()\n    for keyword, answer in RULES:\n        if keyword in words:\n            return answer\n    return "Go on."\n\nprint(reply("Sad to say bye hello"))' },
      options: ['Why sad?', 'See you.', 'Go on.', 'Hi!'],
      answer: 3,
      explanation: '程式依 RULES 的順序檢查關鍵字，不是依句子中單字的順序。轉小寫後句子包含 sad、bye、hello，而 RULES 第一條 hello 就命中，所以印出 Hi!。Why sad? 是依句子順序比對的誤解；See you. 排在 hello 之後，輪不到；Go on. 只在沒有任何關鍵字命中時才出現。',
    },
    {
      id: 'q3', prompt: '下面的頻率分類器會印出什麼？',
      code: { language: 'Python', text: 'from collections import Counter\n\nspam = Counter("win money now win prize".split())\nham = Counter("lunch at noon see you at lunch".split())\n\ndef label(msg):\n    words = msg.split()\n    s = sum(spam[w] for w in words)\n    h = sum(ham[w] for w in words)\n    return "spam" if s > h else "ham"\n\nprint(label("win lunch at noon"))' },
      options: ['ham', 'spam', '因為 spam 裡沒有 lunch 而丟出 KeyError'],
      answer: 0,
      explanation: 's 只有 win 出現 2 次，所以 s = 2；h 是 lunch 2 次、at 2 次、noon 1 次，h = 5。s > h 不成立，回傳 ham。印出 spam 需要 s 大於 h，這裡不成立；Counter 查不到的字回傳 0 而不是丟出 KeyError，所以第三個選項也錯。',
    },
    {
      id: 'q4', prompt: '關於「理性代理人」，下列哪一個敘述正確？',
      options: ['它的內部推理過程必須和人類一樣', '它的每個決策事後看來都一定是最好的結果', '它依已知的感知與知識，選擇預期能讓績效指標最大的行動', '它只能使用邏輯推論，不能從資料學習'],
      answer: 2,
      explanation: '理性代理人的定義是依感知序列與內建知識，選擇「預期」能最大化績效指標的行動。它不要求內部像人（那是像人一樣思考）；理性不是全知，事後結果不一定最好；理性代理人也可以靠學習改進，定義沒有限制方法。',
    },
    {
      id: 'q5', prompt: '依本課的分類規則，下列哪一個系統是 AI，但不從資料學習？',
      options: ['只依固定時相表切換的紅綠燈', '用搜尋比較棋步並以評估函數選棋的傳統西洋棋程式', '把攝氏換成華氏的換算程式', '依關鍵字表回覆的客服機器人'],
      answer: 1,
      explanation: '傳統西洋棋程式在許多可能的棋步間搜尋並比較，屬於符號式 AI（reasoning），搜尋本身不需要從資料學習。定時紅綠燈與關鍵字客服機器人都只照人寫好的條件直接回應，是規則式程式（rules）；溫度換算是固定公式（formula），也是規則式程式。',
    },
    {
      id: 'q6', prompt: 'AlphaGo 在 2016 年擊敗李世乭，但它不會下西洋棋，也無法回答一般問題。它最適合歸類為哪一種？',
      options: ['狹義 AI（弱 AI 的常見用法）', '通用人工智慧（AGI）', '不是 AI，因為它只會一件事', 'Searle 所說的強 AI，因為它下得比人好'],
      answer: 0,
      explanation: '只在單一任務上表現極強、換任務就不會的系統，是狹義 AI。AGI 要能在各種任務間學習與轉換，AlphaGo 做不到；只會一件事不代表不是 AI，它同時用了學習與搜尋；Searle 的強 AI 談的是有沒有真正的心智，和下棋強弱無關。',
    },
    {
      id: 'q7', prompt: '1966 年的 ELIZA 只用關鍵字比對與回覆範本，卻讓一些使用者覺得它理解自己。這個例子最能說明圖靈測試的哪一個限制？',
      options: ['圖靈測試需要機器人手臂才能進行', '圖靈測試只能用在下棋程式', '圖靈測試必須由多位提問者同時進行才有效', '騙過人的對話行為不等於真正理解'],
      answer: 3,
      explanation: 'ELIZA 沒有任何理解，只靠規則讓對話看起來合理，說明圖靈測試量的是「像不像人」的行為，無法證明理解。原始的圖靈測試只用文字交談，不需要機器人手臂（那是完整圖靈測試的延伸）；它也不限於下棋；提問者的人數不是這個例子要說明的問題。',
    },
    {
      id: 'q8', prompt: '關於 AI、機器學習與深度學習的關係，下列哪一個正確？',
      options: ['三者是同義詞，只是年代不同的稱呼', '所有 AI 都是深度學習，只是有些網路比較淺', '深度學習屬於機器學習，機器學習屬於 AI；符號式 AI 屬於 AI 但不屬於機器學習', '機器學習包含 AI，AI 是機器學習中使用規則的一種'],
      answer: 2,
      explanation: '深度學習是用多層神經網路的機器學習，機器學習是 AI 的子領域，而專家系統、搜尋等符號式 AI 屬於 AI 卻不從資料學習。三者不是同義詞；不是所有 AI 都用神經網路，例如 Deep Blue 與 MYCIN；包含關係也不能倒過來，是 AI 包含機器學習。',
    },
  ],
  exercises: [
    {
      id: 'classify-systems', title: '依明確規則分類日常系統',
      statement: '讀入幾個系統的特徵旗標，依下面的規則判斷每個系統是 AI 系統還是規則式程式，並印出理由代碼。合法的旗標只有三個：`learns-from-data`（從資料學到判斷規則或參數）、`searches-or-infers`（在多個可能的行動或結論間搜尋、或串連規則推論）、`fixed-rules`（只照人寫好的條件分支反應）。規則依序套用：(1) 由左到右檢查旗標，遇到第一個不合法的旗標（包含大小寫不同）就輸出 `INVALID` 與該旗標，這個系統不再判斷；(2) 否則，若有 `learns-from-data` 或 `searches-or-infers`，分類為 `AI`，理由依固定順序列出：有 `learns-from-data` 寫 `data`，有 `searches-or-infers` 寫 `reasoning`，兩者都有時以 `+` 連接成 `data+reasoning`，旗標在輸入中的順序與重複都不影響結果，`fixed-rules` 也不改變 AI 的分類；(3) 否則若有 `fixed-rules`，分類為 `RULE`，理由為 `rules`；(4) 沒有任何旗標時分類為 `RULE`，理由為 `formula`。最後一行印出三種結果的數量。',
      inputFormat: '第一行是整數 n。接下來 n 行，每行是一個系統名稱，後面跟著零個或多個以空白分隔的旗標。',
      outputFormat: 'n 行，每行是「名稱 分類 理由」，分類為 `AI`、`RULE` 或 `INVALID`（INVALID 的理由是第一個不合法的旗標）。最後一行是 `AI a RULE r INVALID i`，a、r、i 是各分類的系統數。',
      constraints: ['1 ≤ n ≤ 20', '名稱是不含空白的非空字串', '每行最多 5 個旗標', '第一行保證是合法的整數，且後面正好有 n 行'],
      samples: [
        {
          kind: 'normal',
          input: '10\nthermostat fixed-rules\nspam-filter learns-from-data fixed-rules\nunit-converter\nroute-planner searches-or-infers\nface-unlock learns-from-data\ntraffic-light fixed-rules\nchess-program searches-or-infers\nexpert-system searches-or-infers fixed-rules\ngo-program learns-from-data searches-or-infers\nvending-machine fixed-rules\n',
          output: 'thermostat RULE rules\nspam-filter AI data\nunit-converter RULE formula\nroute-planner AI reasoning\nface-unlock AI data\ntraffic-light RULE rules\nchess-program AI reasoning\nexpert-system AI reasoning\ngo-program AI data+reasoning\nvending-machine RULE rules\nAI 6 RULE 4 INVALID 0',
          note: '本課表格中的十個日常系統',
        },
      ],
      tests: [
        {
          kind: 'normal',
          input: '10\nthermostat fixed-rules\nspam-filter learns-from-data fixed-rules\nunit-converter\nroute-planner searches-or-infers\nface-unlock learns-from-data\ntraffic-light fixed-rules\nchess-program searches-or-infers\nexpert-system searches-or-infers fixed-rules\ngo-program learns-from-data searches-or-infers\nvending-machine fixed-rules\n',
          output: 'thermostat RULE rules\nspam-filter AI data\nunit-converter RULE formula\nroute-planner AI reasoning\nface-unlock AI data\ntraffic-light RULE rules\nchess-program AI reasoning\nexpert-system AI reasoning\ngo-program AI data+reasoning\nvending-machine RULE rules\nAI 6 RULE 4 INVALID 0',
          note: '十個日常系統，涵蓋四種理由代碼',
        },
        {
          kind: 'normal',
          input: '3\nrecommender fixed-rules learns-from-data\nsmart-speaker searches-or-infers learns-from-data\ncalculator\n',
          output: 'recommender AI data\nsmart-speaker AI data+reasoning\ncalculator RULE formula\nAI 2 RULE 1 INVALID 0',
          note: '旗標順序顛倒時，理由仍依固定順序 data+reasoning',
        },
        {
          kind: 'edge',
          input: '1\ntip-calculator\n',
          output: 'tip-calculator RULE formula\nAI 0 RULE 1 INVALID 0',
          note: '只有一個系統，而且沒有任何旗標',
        },
        {
          kind: 'edge',
          input: '2\nphoto-tagger learns-from-data learns-from-data\nelevator fixed-rules fixed-rules\n',
          output: 'photo-tagger AI data\nelevator RULE rules\nAI 1 RULE 1 INVALID 0',
          note: '重複的旗標不影響結果，理由不會重複',
        },
        {
          kind: 'error',
          input: '3\nrobot-vacuum learns-from-data Fixed-Rules\nlamp fixed-rule\nnavigator searches-or-infers adapts\n',
          output: 'robot-vacuum INVALID Fixed-Rules\nlamp INVALID fixed-rule\nnavigator INVALID adapts\nAI 0 RULE 0 INVALID 3',
          note: '大小寫不同、拼錯與未定義的旗標都不合法，即使前面已有合法的 AI 旗標',
        },
        {
          kind: 'error',
          input: '2\nthermostat fixed-rules\nmood-lamp learns-from-data colorful\n',
          output: 'thermostat RULE rules\nmood-lamp INVALID colorful\nAI 0 RULE 1 INVALID 1',
          note: '不合法的系統不計入 AI 或 RULE，其他系統照常判斷',
        },
      ],
      hints: [
        '用 `name, *flags = input().split()` 一次拆出名稱與旗標串列；沒有旗標時 flags 是空串列。',
        '先跑一次迴圈檢查每個旗標是否合法，全部合法後再判斷分類。',
        '理由要依固定順序產生：走訪一個固定順序的串列（例如 `[("learns-from-data", "data"), ("searches-or-infers", "reasoning")]`），不要走訪輸入的旗標或 set。',
      ],
      solution: {
        Python: code`KNOWN = ["learns-from-data", "searches-or-infers", "fixed-rules"]
AI_REASONS = [("learns-from-data", "data"), ("searches-or-infers", "reasoning")]


def classify(flags):
    for flag in flags:
        if flag not in KNOWN:
            return "INVALID", flag
    reasons = [code for flag, code in AI_REASONS if flag in flags]
    if reasons:
        return "AI", "+".join(reasons)
    if "fixed-rules" in flags:
        return "RULE", "rules"
    return "RULE", "formula"


n = int(input())
counts = {"AI": 0, "RULE": 0, "INVALID": 0}
for _ in range(n):
    name, *flags = input().split()
    kind, reason = classify(flags)
    counts[kind] += 1
    print(name, kind, reason)
print("AI", counts["AI"], "RULE", counts["RULE"], "INVALID", counts["INVALID"])`,
      },
      judge: 'none',
    },
  ],
};

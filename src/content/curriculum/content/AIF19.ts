import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF19 負責任的 AI (python-code: Python only, standard library). Every example and the reference solution run in the
 * curriculum code tests; their outputs and the exercise's expected outputs were produced by running the programs.
 *
 * All data in this lesson is synthetic, written for the lesson: no real person, bank or applicant. The running case is
 * a fictional bank's automated pre-screening of small loan applications: y = 1 means the applicant actually repaid on
 * time (observed in a fictional pilot where every outcome is known), pred = 1 means the model approved.
 *
 * The visualization runs TRACE_CODE: it scans 20 fixed decisions of two groups, fills one confusion matrix per group
 * (TP, FP, FN, TN), computes selection rate, TPR, FPR and PPV per group and prints the gap of each metric.
 * fairnessSteps() repeats that program on the same records and checks its printed lines against TRACE_OUTPUT, which
 * the lesson test compares with Python's real output.
 */
const RECORDS: [string, number, number][] = [
  ['A', 1, 1], ['A', 0, 0], ['A', 1, 1], ['A', 0, 0], ['A', 1, 0],
  ['A', 0, 0], ['A', 1, 1], ['A', 0, 0], ['A', 1, 1], ['A', 0, 0],
  ['B', 0, 1], ['B', 1, 1], ['B', 0, 0], ['B', 1, 0], ['B', 0, 0],
  ['B', 0, 1], ['B', 1, 1], ['B', 0, 0], ['B', 0, 0], ['B', 0, 0],
];
const GROUPS = ['A', 'B'];
const CELLS = ['TP', 'FP', 'FN', 'TN'];
const METRICS = ['selection', 'TPR', 'FPR', 'PPV'];
const TRACE_OUTPUT = 'A: TP=4 FP=0 FN=1 TN=5 base=0.500\n  selection=0.400 TPR=0.800 FPR=0.000 PPV=1.000\nB: TP=2 FP=2 FN=1 TN=5 base=0.300\n  selection=0.400 TPR=0.667 FPR=0.286 PPV=0.500\nselection gap = 0.000\nTPR gap = 0.133\nFPR gap = 0.286\nPPV gap = 0.500';

const TRACE_CODE = code`records = [  # (group, y, pred)；合成資料，y = 1 準時還款，pred = 1 核准
    ('A', 1, 1), ('A', 0, 0), ('A', 1, 1), ('A', 0, 0), ('A', 1, 0),
    ('A', 0, 0), ('A', 1, 1), ('A', 0, 0), ('A', 1, 1), ('A', 0, 0),
    ('B', 0, 1), ('B', 1, 1), ('B', 0, 0), ('B', 1, 0), ('B', 0, 0),
    ('B', 0, 1), ('B', 1, 1), ('B', 0, 0), ('B', 0, 0), ('B', 0, 0),
]
cells = {'A': [0, 0, 0, 0], 'B': [0, 0, 0, 0]}  # TP, FP, FN, TN
for g, y, pred in records:
    k = 0 if pred and y else 1 if pred else 2 if y else 3
    cells[g][k] += 1
rates = {}
for g in sorted(cells):
    tp, fp, fn, tn = cells[g]
    n = tp + fp + fn + tn
    rates[g] = {'selection': (tp + fp) / n, 'TPR': tp / (tp + fn),
                'FPR': fp / (fp + tn), 'PPV': tp / (tp + fp)}
    print(f'{g}: TP={tp} FP={fp} FN={fn} TN={tn} base={(tp + fn) / n:.3f}')
    print('  ' + ' '.join(f'{m}={v:.3f}' for m, v in rates[g].items()))
for m in ['selection', 'TPR', 'FPR', 'PPV']:
    print(f'{m} gap = {abs(rates["A"][m] - rates["B"][m]):.3f}')`;

/** Python's f'{x:.3f}' for the values of this trace (none of them is a rounding tie). */
const f3 = (x: number) => x.toFixed(3);

function fairnessSteps(): TraceStep[] {
  const steps: TraceStep[] = [];
  const cells = GROUPS.map(() => CELLS.map(() => 0));
  const rates: (number | null)[][] = GROUPS.map(() => METRICS.map(() => null));
  const gaps: (number | null)[] = METRICS.map(() => null);
  const lines: string[] = [];
  type GridMark = { at: [number, number]; kind: Mark };
  type CellMark = { at: number; kind: Mark };
  const records = (at: number | null) => ({ name: 'records：(group, y, pred)', cells: RECORDS.map(([g, y, p]) => `${g} ${y} ${p}`),
    marks: at === null ? [] : [{ at, kind: 'current' as Mark }], ...(at === null ? {} : { pointers: { i: at } }) });
  const matrix = (marks: GridMark[]) => ({ name: 'cells：每組的混淆矩陣', cells: cells.map(r => r.map(String)), marks, rowLabels: GROUPS, colLabels: CELLS });
  const rateGrid = (marks: GridMark[]) => ({ name: 'rates：每組的比率', cells: rates.map(r => r.map(v => v === null ? '' : f3(v))), marks, rowLabels: GROUPS, colLabels: METRICS });
  const gapRow = (marks: CellMark[]) => ({ name: '各指標的組間差距 |A − B|', cells: gaps.map(v => v === null ? '' : f3(v)), marks, colLabels: METRICS });
  const push = (line: number, note: string, vars: Record<string, string>, arrays: TraceStep['arrays']) =>
    steps.push({ line, note, vars, arrays, ...(lines.length ? { output: lines.join('\n') } : {}) });

  push(7, '20 筆合成的貸款預審決定（沒有真實的人）：每筆是 (group, y, pred)。y = 1 表示申請人實際準時還款（合格），pred = 1 表示模型核准。假設這是一次所有結果都觀察得到的試辦，所以每一筆都有 y。cells 為 A、B 兩組各準備一個混淆矩陣，四格依序是 TP、FP、FN、TN，一開始都是 0。',
    { 'len(records)': '20' }, [records(null), matrix([])]);
  const meaning = ['核准，而且實際準時還款：真陽性 TP', '核准，但實際沒有準時還款：偽陽性 FP（不合格卻被核准）',
    '拒絕，但其實會準時還款：偽陰性 FN（合格卻被拒絕）', '拒絕，而且實際沒有準時還款：真陰性 TN'];
  for (const [i, [g, y, pred]] of RECORDS.entries()) {
    const k = pred && y ? 0 : pred ? 1 : y ? 2 : 3;
    const r = GROUPS.indexOf(g);
    cells[r][k] += 1;
    push(10, `第 ${i + 1} 筆：group = ${g}、y = ${y}、pred = ${pred}，${meaning[k]}，所以 k = ${k}，cells['${g}'][${k}]（${CELLS[k]}）加 1，變成 ${cells[r][k]}。`,
      { g, y: String(y), pred: String(pred), k: String(k) }, [records(i), matrix([{ at: [r, k], kind: 'write' }])]);
  }
  for (const [r, g] of GROUPS.entries()) {
    const [tp, fp, fn, tn] = cells[r];
    const n = tp + fp + fn + tn;
    rates[r] = [(tp + fp) / n, tp / (tp + fn), fp / (fp + tn), tp / (tp + fp)];
    const [sel, tpr, fpr, ppv] = rates[r] as number[];
    push(15, `group ${g}：tp, fp, fn, tn = ${tp}, ${fp}, ${fn}, ${tn}，n = ${n}。選取率 (TP + FP) / n = ${tp + fp}/${n} = ${f3(sel)}；TPR = TP / (TP + FN) = ${tp}/${tp + fn} = ${f3(tpr)}；FPR = FP / (FP + TN) = ${fp}/${fp + tn} = ${f3(fpr)}；PPV = TP / (TP + FP) = ${tp}/${tp + fp} = ${f3(ppv)}。`,
      { g, tp: String(tp), fp: String(fp), fn: String(fn), tn: String(tn), n: String(n) },
      [matrix(CELLS.map((_, j) => ({ at: [r, j] as [number, number], kind: 'read' as Mark }))), rateGrid(METRICS.map((_, j) => ({ at: [r, j] as [number, number], kind: 'write' as Mark })))]);
    lines.push(`${g}: TP=${tp} FP=${fp} FN=${fn} TN=${tn} base=${f3((tp + fn) / n)}`);
    lines.push('  ' + METRICS.map((m, j) => `${m}=${f3(rates[r][j]!)}`).join(' '));
    push(18, r === 0
      ? `印出 A 組：基本比率（實際合格的比例）(TP + FN) / n = ${tp + fn}/${n} = ${f3((tp + fn) / n)}。A 組沒有任何偽陽性，被核准的人全部合格（PPV = 1），但 5 位合格者中有 1 位被拒絕。`
      : `印出 B 組：基本比率只有 ${f3((tp + fn) / n)}，比 A 組低。B 組 10 人中同樣核准 4 人，可是其中 2 人不合格（PPV = ${f3(ppv)}），3 位合格者中又有 1 位被拒絕。`,
      { g, base: f3((tp + fn) / n) }, [matrix([]), rateGrid(METRICS.map((_, j) => ({ at: [r, j] as [number, number], kind: 'read' as Mark })))]);
  }
  const why = [
    '兩組的選取率都是 0.400：只看人口均等（demographic parity），會以為模型對兩組完全公平。',
    'A 組合格者被核准的機率 0.800，B 組只有 0.667：B 組的合格者比較容易被拒絕，機會均等（equal opportunity）不成立。',
    'A 組沒有人被誤核准，B 組不合格的 7 人中有 2 人被核准：FPR 不同，所以均等勝算（equalized odds）也不成立。',
    '被核准的人裡，A 組全部合格，B 組只有一半合格：預測均等（predictive parity）差距最大。',
  ];
  for (const [j, m] of METRICS.entries()) {
    const a = rates[0][j]!, b = rates[1][j]!;
    gaps[j] = Math.abs(a - b);
    lines.push(`${m} gap = ${f3(gaps[j]!)}`);
    push(20, `m = '${m}'：|${f3(a)} − ${f3(b)}| = ${f3(gaps[j]!)}。${why[j]}`, { m, gap: f3(gaps[j]!) },
      [matrix([]), rateGrid([{ at: [0, j], kind: 'read' }, { at: [1, j], kind: 'read' }]), gapRow([{ at: j, kind: 'write' }])]);
  }
  if (lines.join('\n') !== TRACE_OUTPUT) throw new Error(`AIF19: the trace prints ${lines.join('\n')}, the program prints ${TRACE_OUTPUT}`);
  push(20, '完成。同一組決定，用不同的公平性定義得到不同的結論：選取率完全相同，TPR、FPR、PPV 卻都有差距。兩組的基本比率不同（0.5 與 0.3），而模型又不是完美的，這些指標本來就不可能全部同時相等，所以要依情境決定哪一種錯誤的差距最需要被控制，並把選擇與理由寫進文件。',
    {}, [matrix([]), rateGrid([]), gapRow(METRICS.map((_, j) => ({ at: j, kind: 'found' as Mark })))]);
  return steps;
}

export const AIF19: LessonContent = {
  lessonId: 'AIF19',
  motivation: '一家銀行用模型預審貸款申請，模型的整體準確率很高，可是某一群申請人裡明明會準時還款的人，卻比別人更常被拒絕；申請人收到一封「系統評估未通過」的通知，不知道原因，也不知道能向誰申訴。AIF03 說過，代理人會盡力最大化我們給它的績效度量；負責任的 AI 要問的是：這個度量漏掉了誰的利益、錯誤落在誰身上、資料怎麼收集與保護、出錯時誰負責。這一課以一個虛構的自動審核系統為主線，從資料、標籤、代理變數、回饋迴圈與部署情境找出傷害的來源，用分組混淆矩陣量測偏誤，學會資料最小化、k-匿名與差分隱私，再談可解釋性、穩健性、人類監督、文件化、影響評估，以及歐盟 AI 法「依風險分級」的監管思路。本課所有資料都是為了教學自己寫的合成資料，沒有任何真實的人。',
  sections: [
    {
      id: 'principles', title: '負責任 AI 的原則：不只問「做得到嗎」',
      blocks: [
        { type: 'p', text: '負責任的 AI（responsible AI）指的是在 AI 系統的整個生命週期，從定義問題、收集資料、訓練、評估、部署到退役，都有系統地辨識並降低它對人與社會可能造成的傷害。它不是一個額外的模組，而是一組要在每個階段回答的問題。各國政府、國際組織與企業發表的原則清單用詞不同，核心大致相同，可以整理成下表的五類。' },
        { type: 'table', head: ['原則', '要回答的問題', '本課的工具'], rows: [
          ['公平性與偏誤（fairness）', '不同群體是否承受不合理的不同待遇或不同錯誤？', '分組混淆矩陣、選取率、TPR、FPR、PPV'],
          ['可靠與安全（reliability & safety）', '輸入有誤差、環境改變或遭到攻擊時，系統是否仍然穩健、不造成危險？', '擾動檢查、分組與偏移資料上的評估、上線後監控、退回人工的機制'],
          ['隱私（privacy）', '收集的個人資料是否必要？發布的結果能否反推出某個人？', '資料最小化、k-匿名、差分隱私'],
          ['透明與可解釋（transparency & explainability）', '受影響的人與審查者能否知道系統用了 AI、做了什麼、為什麼這樣決定？', '特徵貢獻、反事實解釋、模型卡、資料表'],
          ['問責與治理（accountability & governance）', '出錯時誰負責？怎麼發現、申訴與修正？', '人類監督、紀錄、影響評估、稽核、風險分級'],
        ] },
        { type: 'p', text: '兩份常被引用的框架：OECD 在 2019 年通過《AI 原則》，是第一份由多國政府共同採納的 AI 原則；美國國家標準與技術研究院（NIST）在 2023 年 1 月發布 AI 風險管理框架 AI RMF 1.0，把可信任 AI 的特徵列為 valid and reliable、safe、secure and resilient、accountable and transparent、explainable and interpretable、privacy-enhanced、fair with harmful bias managed，並用 Govern、Map、Measure、Manage 四個功能組織風險管理的工作。這些框架本身多半是自願採用的指引；具有法律拘束力的是各地的法律，例如本課後面提到的歐盟 GDPR 與 AI 法。' },
        { type: 'callout', tone: 'note', title: '原則之間會互相拉扯', text: '加更多隱私雜訊，統計結果就比較不準；要檢查各組是否公平，就得知道每個人屬於哪一組，這和「少收集敏感資料」互相拉扯；解釋寫得太細，有人就能針對規則鑽漏洞。負責任的做法不是假裝沒有取捨，而是說清楚選了什麼、為什麼、由誰決定，並記錄下來。' },
        { type: 'p', text: '本課的主線案例：一家虛構的銀行用模型預審小額貸款，y = 1 表示申請人實際準時還款，pred = 1 表示模型核准。這是 AIF03 說的代理人：感知是申請資料，動作是核准或拒絕，績效度量如果只有「放款的還款率」，就看不到被錯誤拒絕的人。接下來每一節都回到這個系統，最後做一份完整的風險評估。' },
      ],
    },
    {
      id: 'harm-sources', title: '傷害從哪裡來：資料、標籤、代理變數、回饋迴圈與部署情境',
      blocks: [
        { type: 'p', text: '模型的偏誤很少是因為有人在程式裡寫了「歧視某一群人」。更常見的是，模型忠實地學會了資料裡的模式，而那些模式本身就帶著過去的不公平，或者資料、標籤、使用方式和真實目的之間有落差。下表是六個常見的來源。' },
        { type: 'table', head: ['來源', '怎麼發生', '在貸款預審中的樣子'], rows: [
          ['歷史資料（historical bias）', '資料記錄了過去的決定，而過去的決定本身不公平，模型學會重現它', '某些地區過去被拒絕得特別多，模型學到「這一區風險高」'],
          ['代表性與抽樣（representation bias）', '某些群體在訓練資料中太少，模型在他們身上的誤差比較大', '訓練資料多半來自都市分行，鄉村申請人的錯誤率較高'],
          ['標籤（label bias）', '要預測的目標只是真正目的的替代品，或只有部分人的結果觀察得到', '只有被核准的人才有還款紀錄，被拒絕的人「會不會還」永遠看不到（選擇性標籤）'],
          ['代理變數（proxy）', '刪掉敏感屬性後，其他特徵仍和它高度相關，模型透過它們間接使用敏感屬性', '居住地區、就讀學校、消費地點和族群或收入階層高度相關'],
          ['回饋迴圈（feedback loop）', '模型的決定改變了之後收集到的資料，偏差被一輪一輪放大', '被拒絕的人沒有機會建立信用紀錄，下次更容易被拒'],
          ['部署情境（deployment context）', '系統被用在設計時沒考慮的人群、用途或流程裡', '原本只用來排序、由人審核的分數，被直接拿來自動拒絕'],
        ] },
        { type: 'p', text: '兩個廣為人知的真實案例：2018 年 Reuters 報導，Amazon 停用一個實驗性的履歷評分工具，因為它從過去十年以男性為主的履歷資料中，學會降低含有「women\'s」字樣的履歷分數，這是歷史資料與代理變數的問題。Obermeyer 等人 2019 年在 Science 發表的研究發現，美國一套廣泛使用的醫療風險演算法以「醫療花費」作為「健康需求」的標籤，而在同樣病情下花費較少的黑人病患因此得到較低的分數，這是標籤偏誤的例子。' },
        { type: 'example', id: 'e-proxy' },
        { type: 'p', text: '範例裡的模型完全沒有讀 group，可是 district 猜 group 的準確率有 0.80，於是 district 成了代理變數。兩組實際合格的比例都是 0.60，合格者被核准的比例卻是 0.83 對 0.17：差距全部來自模型從歷史資料學到的地區規則，而不是兩組的還款能力。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：把敏感欄位刪掉，模型就公平了', text: '這種做法叫 fairness through unawareness，通常不夠：只要其他特徵和敏感屬性相關，模型仍然可以透過它們重現差距，就像範例中的 district。更麻煩的是，刪掉敏感欄位之後，連「各組的錯誤率是否不同」都量不出來。實務上常見的做法是在受到保護的條件下保留敏感屬性，只用於稽核與量測，而不是當作模型的輸入。' },
      ],
    },
    {
      id: 'fairness-metrics', title: '以分組混淆矩陣量測偏誤',
      blocks: [
        { type: 'p', text: '量測偏誤的基本工具是「每一組各算一個混淆矩陣」。把核准當作陽性（positive）：TP 是核准而且合格，FP 是核准但不合格，FN 是合格卻被拒絕，TN 是拒絕而且不合格。從四個計數可以算出下表的比率，每一種「各組相等」對應一種常見的公平性定義。' },
        { type: 'table', head: ['比率', '公式', '各組相等時叫做', '在貸款預審中的意思'], rows: [
          ['基本比率 base rate', '(TP + FN) / n', '（這是資料的性質，不是模型的）', '這一組實際合格的比例'],
          ['選取率 selection rate', '(TP + FP) / n', '人口均等 demographic parity', '這一組被核准的比例'],
          ['真陽性率 TPR（recall）', 'TP / (TP + FN)', '機會均等 equal opportunity', '合格的人被核准的機率；1 − TPR 是合格卻被拒絕的機率'],
          ['偽陽性率 FPR', 'FP / (FP + TN)', '均等勝算 equalized odds（TPR 與 FPR 都相等）', '不合格的人被誤核准的機率'],
          ['精確率 PPV（precision）', 'TP / (TP + FP)', '預測均等 predictive parity', '被核准的人真的合格的比例'],
        ] },
        { type: 'p', text: '機會均等與均等勝算由 Hardt、Price 與 Srebro 在 2016 年的論文中提出。上方的視覺化逐筆走過追蹤程式的 20 筆合成決定，把每一筆放進所屬組別的混淆矩陣，再算出各組的比率與差距。結果很有代表性：兩組的選取率都是 0.400，可是 TPR 是 0.800 對 0.667、FPR 是 0.000 對 0.286、PPV 是 1.000 對 0.500。同一個模型，換一個公平性定義，結論就不同。分母為 0 時比率沒有定義，例如一組裡沒有任何合格者，TPR 就無從算起，報告要寫明，而不是當成 0。' },
        { type: 'p', text: '更根本的是一個已經被證明的結果。對任何混淆矩陣都有恆等式 FPR = p / (1 − p) × (1 − PPV) / PPV × TPR，其中 p 是基本比率（Chouldechova 2017）。如果兩組的 p 不同，又要求 PPV 與 TPR 都相同，右邊就不同，FPR 必然不同；除非模型完美（PPV = 1 且 FPR = 0）或者完全退化。Kleinberg、Mullainathan 與 Raghavan 2016 年對風險分數證明了類似的結論：校準（calibration）與兩種錯誤率的平衡，在基本比率不同時無法同時成立。2016 年 ProPublica 分析美國的再犯風險評分工具 COMPAS，指出黑人被告中「沒有再犯卻被評為高風險」的比例比白人被告高；開發商則回應分數在兩組的預測準確度相近。兩邊說的都可以同時為真，正是因為兩組的基本比率不同。' },
        { type: 'example', id: 'e-parity' },
        { type: 'callout', tone: 'warning', title: '常見誤解：只要找到「正確的」公平指標，全部達標就好', text: '基本比率不同而模型又有錯誤時，人口均等、均等勝算與預測均等不可能全部成立，所以「全部達標」本身就做不到。選哪一個要看情境：誰承擔偽陰性（合格者被拒絕、失去機會），誰承擔偽陽性（不合格者被核准、陷入無力償還的債務），以及法律對這個領域的要求。另外，樣本少的組，比率會大幅跳動；報告時要同時列出每組的人數與四個計數，而不只是比率。' },
      ],
    },
    {
      id: 'privacy', title: '隱私：資料最小化、k-匿名與差分隱私',
      blocks: [
        { type: 'p', text: '保護隱私的第一步是不要收集用不到的資料。資料最小化（data minimization）是歐盟《一般資料保護規則》（GDPR，2016 年通過、2018 年 5 月 25 日開始適用）的原則之一：個人資料應該適當、相關，並限於處理目的所必要的範圍。對貸款預審來說，問自己每一個欄位：它和還款能力有關嗎？會不會只是代理變數？保存多久？誰能存取？' },
        { type: 'p', text: '刪掉姓名與身分證字號並不等於匿名。年齡、郵遞區號、性別這類欄位單獨看不出是誰，組合起來卻常常只對應到一個人，這叫準識別欄位（quasi-identifier）。Sweeney 的研究指出，只用郵遞區號、性別與出生日期，就能唯一識別大多數美國人。k-匿名（k-anonymity）要求：依準識別欄位分組後，每一組至少有 k 筆紀錄，所以任何人至少和另外 k − 1 人無法區分。做法是泛化（把 23 歲寫成 `20-29`、把郵遞區號 `10617` 寫成 `106**`）或刪除少數特殊的紀錄。它的限制也很明確：如果一組裡每個人的敏感值都相同（同質性攻擊），或攻擊者有額外的背景知識，k-匿名仍會洩漏資訊；後來的 l-diversity 等方法就是為了補這些缺口。' },
        { type: 'p', text: '差分隱私（differential privacy，Dwork 等人 2006 年提出）換一個角度：不保護資料表本身，而是保證發布的結果幾乎不受任何一個人在不在資料裡影響。正式地說，對只差一筆紀錄的兩份資料 D、D′，以及任何一組可能的輸出 S，隨機機制 M 滿足 P[M(D) ∈ S] ≤ e^ε × P[M(D′) ∈ S]。ε 越小，保證越強。最簡單的做法是 Laplace 機制：計數查詢的敏感度（加入或移除一個人，答案最多改變多少）是 1，所以在真實計數上加上尺度 1/ε 的 Laplace 雜訊。多次查詢會消耗隱私預算，各次的 ε 大致相加。美國人口普查局在 2020 年人口普查的資料發布中採用了差分隱私。' },
        { type: 'example', id: 'e-privacy' },
        { type: 'p', text: '範例中，原始的 (年齡, 郵遞區號) 每一組只有 1 筆（k = 1），泛化之後每一組 3 筆（k = 3）。Laplace(b) 的平均絕對誤差剛好是 b，所以 ε = 0.5、1、2 時誤差約為 2、1、0.5：隱私越強，統計越不準。亂數用固定種子，是為了讓課程的輸出可以重現；真正部署時必須使用無法預測的亂數，否則攻擊者可以重算雜訊。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：去掉姓名就是匿名資料', text: '只刪掉直接識別欄位（姓名、身分證字號、電話）的資料，通常只是「去識別化」的第一步，準識別欄位的組合仍可能把人認出來，和其他公開資料比對就更容易。要宣稱匿名，至少要檢查準識別欄位的組合（例如 k-匿名），對外發布統計時則考慮差分隱私這類有數學保證的方法。' },
      ],
    },
    {
      id: 'transparency-robustness', title: '透明、可解釋與穩健：讓決定看得懂、經得起變動',
      blocks: [
        { type: 'p', text: '透明（transparency）是讓人知道「這裡用了 AI、用來做什麼、資料從哪裡來、有什麼限制」；可解釋（explainability）是讓人理解「這一個決定為什麼是這樣」。解釋分成全域的（整個模型通常看重什麼）與局部的（這一位申請人的分數由哪些因素造成）。線性模型或小的決策樹本身就可以讀；複雜的模型常用事後解釋方法，例如 LIME（2016）與 SHAP（2017）估計各特徵對單一預測的貢獻。反事實解釋（counterfactual explanation）回答「最少要改什麼，結果就會不同」，例如「負債比降到 31% 就會核准」；給的建議應該是申請人做得到的（actionable recourse），不能是年齡或出身這類改不了的特徵。' },
        { type: 'p', text: '文件化是透明的基礎。模型卡（model cards，Mitchell 等人 2019）記錄模型的預期用途、不適用的用途、評估資料，以及分組的表現與限制；資料表（datasheets for datasets，Gebru 等人提出）記錄資料集的動機、組成、收集方式、標註流程與建議用途。兩者讓下游的使用者與稽核者知道系統在哪些條件下可以信任。' },
        { type: 'example', id: 'e-explain' },
        { type: 'p', text: '可靠與安全關心的是系統在不理想的條件下會怎樣。分布偏移（distribution shift）：上線後的申請人和訓練資料不同，例如經濟環境改變，模型的錯誤率悄悄上升。對抗樣本（adversarial examples）：Szegedy 等人在 2014 年指出，影像分類器會被人眼幾乎看不出的微小擾動騙過；有心人也可能污染訓練資料。常見的對策是：分組並在偏移過的資料上評估、做擾動與壓力測試、上線後持續監控輸入分布與錯誤率、對低信心或接近門檻的案例改由人審核，並預先設計停用與回退的機制。範例中乙的分數 26 只比門檻多 1，收入資料差 3 千元決定就會翻轉，這種案例就該送人工覆核。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：有解釋，決定就正當了', text: '一個清楚說明「因為你住在 south 區所以拒絕」的系統依然不公平：解釋讓問題看得見，但不會自動修好它。另外，事後解釋方法只是對模型行為的近似，可能和模型真正的計算不一致；把它當成稽核證據時，要說明方法與它的限制。' },
      ],
    },
    {
      id: 'governance', title: '問責與治理：人類監督、文件化、影響評估與風險分級監管',
      blocks: [
        { type: 'p', text: '問責（accountability）要求每個階段都有明確的負責人：誰決定要用 AI、誰開發、誰部署、誰審核個別案例、誰處理申訴。要能問責，就需要紀錄（輸入、模型版本、輸出、人工是否改判與理由）、定期稽核、讓受影響的人能提出異議並得到回應，以及出事時的通報與修正流程。歐盟 GDPR 第 22 條規定，當事人原則上有權不受「完全基於自動化處理、並對其產生法律效果或類似重大影響」的決定所拘束；在例外允許的情況下，也要提供取得人為介入、表達意見與對決定提出異議等保障措施。' },
        { type: 'table', head: ['人類監督的方式', '意思', '適合的情境'], rows: [
          ['human-in-the-loop', '每一個決定都要由人確認後才生效', '影響重大、數量不多的決定，例如最後的拒貸'],
          ['human-on-the-loop', '系統自動決定，人監看整體運作並能隨時介入或停用', '數量大、單筆影響較小的決定'],
          ['human-in-command', '由人決定是否、何時、以何種方式使用這個系統', '所有系統：導入與停用本身就是治理決定'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：流程裡有人按「同意」，就有人類監督', text: '人很容易過度信任自動化系統的建議，這叫自動化偏誤（automation bias）。如果審核員每件只有幾秒、看不到模型的理由、改判還要額外承擔責任，那麼覆核只是形式。有效的監督需要權限（能推翻決定）、時間、資訊（理由、信心、相似案例）與訓練，並且追蹤改判率：改判率接近 0 可能代表監督沒有發揮作用。' },
        { type: 'p', text: '影響評估是在部署之前，有系統地寫下：目的與替代方案、受影響的人、使用的資料、可能的傷害（公平、隱私、安全）、減輕措施、監控指標與負責人。GDPR 第 35 條要求可能對個人權利造成高風險的處理先做資料保護影響評估（DPIA）；歐盟 AI 法也要求部分高風險系統的部署者（例如公部門，以及做個人信用評估的機構）先做基本權利影響評估。' },
        { type: 'p', text: '風險分級監管的思路是：不一律管制「AI」這項技術，而是依用途可能造成的傷害決定義務的輕重。歐盟 AI 法（Regulation (EU) 2024/1689）在 2024 年通過，同年 8 月生效，並分階段適用：禁止的做法從 2025 年 2 月起適用，其他義務依官方公告的時程陸續適用。它把 AI 系統分成四個層級，另外對通用目的 AI 模型（general-purpose AI models）訂有專門的義務。' },
        { type: 'table', head: ['層級', '規範方式', '例子'], rows: [
          ['不可接受風險', '禁止', '造成重大傷害的操縱或利用弱勢、導致不當不利對待的社會評分、執法機關在公共場所使用即時遠端生物辨識（只有少數例外）'],
          ['高風險', '上市前的符合性評估，以及風險管理、資料治理、技術文件、自動紀錄、透明、人類監督、準確性與穩健性等義務', '個人信用評估、招募與員工管理、教育評量、公共服務資格、執法、移民、司法、關鍵基礎設施，以及受產品安全法規管產品的安全元件'],
          ['有限風險（透明義務）', '告知使用者正在和 AI 互動，標示生成或深偽的內容', '客服聊天機器人、生成影像與聲音'],
          ['最小風險', '沒有高風險或透明義務，鼓勵自願的行為準則', '垃圾信過濾、電玩中的 AI'],
        ] },
        { type: 'example', id: 'e-risk' },
        { type: 'p', text: '範例只是教學用的簡化規則，真正判斷一個系統屬於哪一級，要看條文、附件、例外與主管機關的指引。把整課的工具放在一起，對虛構銀行的貸款預審系統可以做出下面的風險評估：' },
        { type: 'list', ordered: true, items: [
          '風險分級：用於個人信用評估，屬於歐盟 AI 法的高風險用途；在歐盟提供或使用時要符合高風險義務，並由部署者做基本權利影響評估。',
          '偏誤來源：檢查歷史核准資料、只有被核准者才有還款紀錄的選擇性標籤、district 等代理變數，以及拒絕造成的回饋迴圈。',
          '量測：上線前與上線後都依組別計算混淆矩陣與選取率、TPR、FPR、PPV，列出每組人數，事先決定要控制的指標與可接受的差距。',
          '隱私：只收集和還款能力有關的欄位，訂好保存期限；敏感屬性只在受保護的稽核流程中使用；對外發布統計時考慮差分隱私。',
          '透明：告知申請人有使用自動化評估，拒絕時提供主要理由與做得到的反事實建議。',
          '監督與問責：接近門檻或資料不穩定的案例送人工覆核，給審核員權限、時間與資訊，追蹤改判率，並提供申訴管道。',
          '文件與監控：撰寫模型卡與資料表，紀錄每一個決定與模型版本，持續監控分布偏移與組間差距，預先寫好停用與回退的條件。',
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'e-proxy', title: '代理變數：模型沒看 group，結果仍然因 group 而異',
      description: '20 位合成的申請人，兩組實際合格的比例相同。模型只用 district 一個特徵，卻因為 district 和 group 高度相關而對兩組差別待遇。',
      code: { Python: code`# 合成資料（沒有真實的人）：(group, district, y)，y = 1 表示實際會準時還款
people = [
    ('A', 'north', 1), ('A', 'north', 1), ('A', 'north', 0), ('A', 'north', 1),
    ('A', 'north', 0), ('A', 'south', 1), ('A', 'north', 1), ('A', 'north', 0),
    ('A', 'north', 1), ('A', 'south', 0),
    ('B', 'south', 1), ('B', 'south', 0), ('B', 'south', 1), ('B', 'north', 1),
    ('B', 'south', 0), ('B', 'south', 1), ('B', 'south', 0), ('B', 'south', 1),
    ('B', 'north', 0), ('B', 'south', 1),
]

def model(district):
    """完全不看 group；只學到「過去 north 的核准率比較高」。"""
    return 1 if district == 'north' else 0

# 1. district 能多準確地猜出 group？（每個地區猜人數最多的那一組）
correct = 0
for d in ['north', 'south']:
    groups = [g for g, dist, y in people if dist == d]
    correct += max(groups.count('A'), groups.count('B'))
print(f'用 district 猜 group 的準確率 = {correct / len(people):.2f}')

# 2. 模型沒用到 group，但各組的結果呢？
for g in ['A', 'B']:
    rows = [(dist, y) for g2, dist, y in people if g2 == g]
    qualified = [dist for dist, y in rows if y == 1]
    approved = sum(model(dist) for dist, y in rows)
    approved_q = sum(model(dist) for dist in qualified)
    print(f'{g}: 合格比例 {len(qualified) / len(rows):.2f}，核准率 {approved / len(rows):.2f}，'
          f'合格者被核准的比例 {approved_q / len(qualified):.2f}')` },
      output: '用 district 猜 group 的準確率 = 0.80\nA: 合格比例 0.60，核准率 0.80，合格者被核准的比例 0.83\nB: 合格比例 0.60，核准率 0.20，合格者被核准的比例 0.17',
    },
    {
      id: 'e-parity', title: '基本比率不同時，公平性指標無法同時相等',
      description: '先用追蹤程式 B 組的混淆矩陣驗證 Chouldechova 的恆等式，再固定 PPV 與 TPR 看 FPR、固定 TPR 與 FPR 看 PPV；全部用 Fraction 精確計算。',
      code: { Python: code`from fractions import Fraction as F

def fpr_from(p, ppv, tpr):
    """Chouldechova (2017)：任何混淆矩陣都滿足 FPR = p/(1-p) × (1-PPV)/PPV × TPR。"""
    return p / (1 - p) * (1 - ppv) / ppv * tpr

def ppv_from(p, tpr, fpr):
    """反過來：已知基本比率 p、TPR 與 FPR，精確率是多少。"""
    return p * tpr / (p * tpr + (1 - p) * fpr)

tp, fp, fn, tn = 2, 2, 1, 5  # 追蹤程式裡 B 組的混淆矩陣
p, ppv, tpr = F(tp + fn, 10), F(tp, tp + fp), F(tp, tp + fn)
print(f'B 組直接算 FPR = {F(fp, fp + tn)}，用公式算 = {fpr_from(p, ppv, tpr)}')

pa, pb = F(1, 2), F(3, 10)  # 兩組的基本比率不同
print('要求兩組 PPV 與 TPR 都相同：')
for ppv, tpr in [(F(3, 4), F(4, 5)), (F(9, 10), F(4, 5)), (F(1), F(4, 5))]:
    a, b = fpr_from(pa, ppv, tpr), fpr_from(pb, ppv, tpr)
    print(f'  PPV={ppv} TPR={tpr}: FPR_A={a} FPR_B={b} 相等={a == b}')
print('要求兩組 TPR 與 FPR 都相同（equalized odds）：')
for tpr, fpr in [(F(4, 5), F(1, 5)), (F(4, 5), F(1, 20)), (F(4, 5), F(0))]:
    a, b = ppv_from(pa, tpr, fpr), ppv_from(pb, tpr, fpr)
    print(f'  TPR={tpr} FPR={fpr}: PPV_A={a} PPV_B={b} 相等={a == b}')` },
      output: 'B 組直接算 FPR = 2/7，用公式算 = 2/7\n要求兩組 PPV 與 TPR 都相同：\n  PPV=3/4 TPR=4/5: FPR_A=4/15 FPR_B=4/35 相等=False\n  PPV=9/10 TPR=4/5: FPR_A=4/45 FPR_B=4/105 相等=False\n  PPV=1 TPR=4/5: FPR_A=0 FPR_B=0 相等=True\n要求兩組 TPR 與 FPR 都相同（equalized odds）：\n  TPR=4/5 FPR=1/5: PPV_A=4/5 PPV_B=12/19 相等=False\n  TPR=4/5 FPR=1/20: PPV_A=16/17 PPV_B=48/55 相等=False\n  TPR=4/5 FPR=0: PPV_A=1 PPV_B=1 相等=True',
    },
    {
      id: 'e-privacy', title: 'k-匿名與 Laplace 機制',
      description: '檢查合成資料在泛化前後的 k，再對「有幾個人違約」這個計數查詢加上固定種子的 Laplace 雜訊，比較不同 ε 的誤差。',
      code: { Python: code`import math
import random
from collections import Counter

# 合成資料（沒有真實的人）：(年齡, 郵遞區號, 是否違約)；姓名早已刪除
rows = [(23, '10617', 0), (27, '10618', 1), (25, '10617', 0),
        (34, '10652', 0), (38, '10655', 1), (31, '10652', 0),
        (45, '10671', 0), (49, '10673', 1), (42, '10671', 0)]

def generalize(age, zipcode):
    decade = age // 10 * 10
    return f'{decade}-{decade + 9}', zipcode[:3] + '**'

# k-匿名：依準識別欄位（年齡、郵遞區號）分組，最小的組有幾筆
exact = Counter((age, z) for age, z, _ in rows)
coarse = Counter(generalize(age, z) for age, z, _ in rows)
print('原始資料 k =', min(exact.values()))
print('泛化之後 k =', min(coarse.values()), sorted(coarse.items()))

def laplace(rng, scale):
    """Laplace(0, scale) 雜訊：用反函數法從均勻亂數產生。"""
    u = rng.random() - 0.5
    return -scale * math.copysign(1, u) * math.log(1 - 2 * abs(u))

true_count = sum(d for _, _, d in rows)  # 查詢：有幾個人違約？敏感度 = 1
print('真實計數 =', true_count)
for eps in [0.5, 1.0, 2.0]:
    rng = random.Random(2024)  # 固定種子，輸出可以重現
    answers = [true_count + laplace(rng, 1 / eps) for _ in range(10000)]
    err = sum(abs(a - true_count) for a in answers) / len(answers)
    print(f'epsilon={eps}: 發布一次 {answers[0]:.2f}，平均絕對誤差 {err:.2f}'
          f'（理論值 1/epsilon = {1 / eps:.2f}）')` },
      output: '原始資料 k = 1\n泛化之後 k = 3 [((\'20-29\', \'106**\'), 3), ((\'30-39\', \'106**\'), 3), ((\'40-49\', \'106**\'), 3)]\n真實計數 = 3\nepsilon=0.5: 發布一次 2.88，平均絕對誤差 2.03（理論值 1/epsilon = 2.00）\nepsilon=1.0: 發布一次 2.94，平均絕對誤差 1.01（理論值 1/epsilon = 1.00）\nepsilon=2.0: 發布一次 2.97，平均絕對誤差 0.51（理論值 1/epsilon = 0.50）',
    },
    {
      id: 'e-explain', title: '特徵貢獻、反事實解釋與穩定性檢查',
      description: '一個可以直接讀的線性評分模型：列出每個特徵對分數的貢獻，被拒絕時算出只改一個特徵的最小改變，並檢查收入有 ±3 誤差時決定會不會翻轉。',
      code: { Python: code`WEIGHTS = {'income': 1, 'debt': -1, 'late': -15, 'years': 3}  # 線性分數的權重
THRESHOLD = 25
FEATURES = sorted(WEIGHTS)

def score(x):
    return sum(WEIGHTS[f] * x[f] for f in FEATURES)

def explain(name, x):
    s = score(x)
    print(f'{name}: 分數 {s}，{"核准" if s >= THRESHOLD else "拒絕"}（門檻 {THRESHOLD}）')
    order = sorted(FEATURES, key=lambda f: -abs(WEIGHTS[f] * x[f]))
    print('  貢獻：' + '，'.join(f'{f} {WEIGHTS[f] * x[f]:+d}' for f in order))
    if s < THRESHOLD:  # 反事實解釋：只改一個特徵，最少要改多少
        need = THRESHOLD - s
        for f in FEATURES:
            step = -(-need // abs(WEIGHTS[f]))  # 無條件進位
            new = x[f] + step if WEIGHTS[f] > 0 else x[f] - step
            print(f'  反事實：{f} 從 {x[f]} 改成 {new} 就會核准')
    low = score({**x, 'income': x['income'] - 3})
    high = score({**x, 'income': x['income'] + 3})
    stable = (low >= THRESHOLD) == (high >= THRESHOLD)
    print(f'  income 誤差 ±3 時分數 {low}..{high}：'
          + ('決定穩定' if stable else '決定會翻轉，送人工覆核'))

# 合成申請人：月收入（千元）、負債比（%）、近一年遲繳次數、年資
explain('甲', {'income': 62, 'debt': 35, 'late': 1, 'years': 3})
explain('乙', {'income': 46, 'debt': 20, 'late': 0, 'years': 0})` },
      output: '甲: 分數 21，拒絕（門檻 25）\n  貢獻：income +62，debt -35，late -15，years +9\n  反事實：debt 從 35 改成 31 就會核准\n  反事實：income 從 62 改成 66 就會核准\n  反事實：late 從 1 改成 0 就會核准\n  反事實：years 從 3 改成 5 就會核准\n  income 誤差 ±3 時分數 18..24：決定穩定\n乙: 分數 26，核准（門檻 25）\n  貢獻：income +46，debt -20，late +0，years +0\n  income 誤差 ±3 時分數 23..29：決定會翻轉，送人工覆核',
    },
    {
      id: 'e-risk', title: '依用途做簡化的風險分級',
      description: '依歐盟 AI 法的四個層級，對五個用途做教學用的簡化分級，並列出高風險系統的主要義務。',
      code: { Python: code`# 教學用的簡化分級，依歐盟 AI 法的四個風險層級；真正的判斷要看條文、附件與官方指引
PROHIBITED = {'social_scoring', 'manipulation'}
HIGH_RISK_AREAS = {'credit_scoring', 'employment', 'education', 'essential_services',
                   'law_enforcement', 'migration', 'justice', 'critical_infrastructure'}
TRANSPARENCY = {'chatbot', 'synthetic_media'}
HIGH_RISK_DUTIES = ['風險管理', '資料治理', '技術文件', '自動紀錄（logging）',
                    '對部署者透明', '人類監督', '準確性、穩健性與資安']

def tier(purpose, interface):
    if purpose in PROHIBITED:
        return '不可接受風險：禁止'
    if purpose in HIGH_RISK_AREAS:
        return '高風險：上市前與使用中都有義務'
    if interface in TRANSPARENCY:
        return '有限風險：透明義務（告知是 AI、標示生成內容）'
    return '最小風險：沒有高風險或透明義務，鼓勵自願的行為準則'

systems = [  # (名稱, 用途, 介面)
    ('貸款申請自動預審', 'credit_scoring', 'score'),
    ('履歷自動篩選', 'employment', 'ranking'),
    ('銀行官網客服聊天機器人', 'customer_service', 'chatbot'),
    ('電子郵件垃圾信過濾', 'spam_filter', 'filter'),
    ('依社會行為給市民打分數並限制公共服務', 'social_scoring', 'score'),
]
for name, purpose, interface in systems:
    print(f'{name} → {tier(purpose, interface)}')
print('高風險系統的主要義務：' + '、'.join(HIGH_RISK_DUTIES))` },
      output: '貸款申請自動預審 → 高風險：上市前與使用中都有義務\n履歷自動篩選 → 高風險：上市前與使用中都有義務\n銀行官網客服聊天機器人 → 有限風險：透明義務（告知是 AI、標示生成內容）\n電子郵件垃圾信過濾 → 最小風險：沒有高風險或透明義務，鼓勵自願的行為準則\n依社會行為給市民打分數並限制公共服務 → 不可接受風險：禁止\n高風險系統的主要義務：風險管理、資料治理、技術文件、自動紀錄（logging）、對部署者透明、人類監督、準確性、穩健性與資安',
    },
  ],
  exercises: [
    {
      id: 'x-fairness-audit', title: '分組公平性稽核：混淆矩陣、比率與差距標記',
      statement: '讀入一份已標記的決定紀錄（每筆有組別、真實結果 y 與模型決定 pred），為每一組計算混淆矩陣（TP：y = 1 且 pred = 1；FP：y = 0 且 pred = 1；FN：y = 1 且 pred = 0；TN：y = 0 且 pred = 0），以及基本比率 base = (TP + FN) / n、選取率 selection = (TP + FP) / n、TPR = TP / (TP + FN)、FPR = FP / (FP + TN)、PPV = TP / (TP + FP)。分母為 0 的比率沒有定義，印 `n/a`。接著對 selection、TPR、FPR、PPV 四個指標，在「這個指標有定義的組」之間求差距 = 最大值 − 最小值；差距嚴格大於門檻時標記 `FLAG`，否則 `ok`。比較必須精確（用 `fractions.Fraction`），不能用浮點數相減。',
      inputFormat: '第一行是整數 n 與門檻 t，以空白分隔；t 是 0 到 1 之間的非負小數（如 `0.1`、`0`、`1`）。接著 n 行，每行是 `group y pred`：group 是 1–12 個英文字母、數字或底線；y 與 pred 都是單一字元 `0` 或 `1`。結尾的空行會被忽略。',
      outputFormat: '組依名稱以 Python 的 `sorted` 順序（字元碼順序，大寫字母排在小寫之前）輸出，每組兩行：`group 名稱: n=人數 TP=.. FP=.. FN=.. TN=..`，以及兩個空白開頭的 `  base=.. selection=.. TPR=.. FPR=.. PPV=..`。接著依 selection、TPR、FPR、PPV 的順序各印一行：有定義的組少於 2 個時印 `指標 gap=n/a`；差距為 0 時印 `指標 gap=0.000 (all 值) ok`；否則印 `指標 gap=差距 (max 組 值, min 組 值) FLAG` 或 `ok`，最大值或最小值同時出現在多組時取名稱排序在前的組。最後一行印 `flagged: ` 加上被標記的指標（依上面的順序、以空白分隔），沒有就印 `flagged: none`。所有數值四捨五入到小數 3 位（0.0625 印成 0.063）。整份輸入格式錯誤（第一行不是兩個欄位、n 不在 1–1000、t 不是合法的小數或大於 1、紀錄行數和 n 不符、某一行不是三個欄位、組名不合法、y 或 pred 不是 0 或 1、超過 10 個組）時只印一行 `invalid input`。',
      constraints: ['1 ≤ n ≤ 1000，最多 10 個組', '0 ≤ t ≤ 1，以小數寫成（如 0.05），不接受負號或分數', '差距與門檻的比較、四捨五入都以分數精確計算'],
      samples: [
        { kind: 'normal', input: '20 0.1\nA 1 1\nA 0 0\nA 1 1\nA 0 0\nA 1 0\nA 0 0\nA 1 1\nA 0 0\nA 1 1\nA 0 0\nB 0 1\nB 1 1\nB 0 0\nB 1 0\nB 0 0\nB 0 1\nB 1 1\nB 0 0\nB 0 0\nB 0 0\n', output: 'group A: n=10 TP=4 FP=0 FN=1 TN=5\n  base=0.500 selection=0.400 TPR=0.800 FPR=0.000 PPV=1.000\ngroup B: n=10 TP=2 FP=2 FN=1 TN=5\n  base=0.300 selection=0.400 TPR=0.667 FPR=0.286 PPV=0.500\nselection gap=0.000 (all 0.400) ok\nTPR gap=0.133 (max A 0.800, min B 0.667) FLAG\nFPR gap=0.286 (max B 0.286, min A 0.000) FLAG\nPPV gap=0.500 (max A 1.000, min B 0.500) FLAG\nflagged: TPR FPR PPV\n', note: '本課追蹤程式的 20 筆合成決定：選取率相同，但 TPR、FPR、PPV 的差距都超過 0.1' },
        { kind: 'edge', input: '8 0.05\nA 1 1\nA 0 1\nA 1 0\nA 0 0\nC 0 0\nC 0 1\nC 0 0\nC 0 0\n', output: 'group A: n=4 TP=1 FP=1 FN=1 TN=1\n  base=0.500 selection=0.500 TPR=0.500 FPR=0.500 PPV=0.500\ngroup C: n=4 TP=0 FP=1 FN=0 TN=3\n  base=0.000 selection=0.250 TPR=n/a FPR=0.250 PPV=0.000\nselection gap=0.250 (max A 0.500, min C 0.250) FLAG\nTPR gap=n/a\nFPR gap=0.250 (max A 0.500, min C 0.250) FLAG\nPPV gap=0.500 (max A 0.500, min C 0.000) FLAG\nflagged: selection FPR PPV\n', note: 'C 組沒有合格者（y 全是 0）：TPR 的分母是 0，印 n/a，TPR 的差距也只剩一組有定義而印 n/a' },
      ],
      tests: [
        { kind: 'normal', input: '15 0.15\nsouth 1 1\nEast 0 0\nnorth 1 0\nsouth 0 1\nEast 1 1\nnorth 1 1\nsouth 0 0\nEast 0 1\nnorth 0 0\nsouth 1 0\nEast 1 0\nnorth 0 1\nsouth 1 1\nEast 0 0\nnorth 1 1\n', output: 'group East: n=5 TP=1 FP=1 FN=1 TN=2\n  base=0.400 selection=0.400 TPR=0.500 FPR=0.333 PPV=0.500\ngroup north: n=5 TP=2 FP=1 FN=1 TN=1\n  base=0.600 selection=0.600 TPR=0.667 FPR=0.500 PPV=0.667\ngroup south: n=5 TP=2 FP=1 FN=1 TN=1\n  base=0.600 selection=0.600 TPR=0.667 FPR=0.500 PPV=0.667\nselection gap=0.200 (max north 0.600, min East 0.400) FLAG\nTPR gap=0.167 (max north 0.667, min East 0.500) FLAG\nFPR gap=0.167 (max north 0.500, min East 0.333) FLAG\nPPV gap=0.167 (max north 0.667, min East 0.500) FLAG\nflagged: selection TPR FPR PPV\n', note: '三組、輸入順序交錯：組依 Python sorted 的字元碼順序輸出（大寫 E 排在小寫 n 之前）' },
        { kind: 'normal', input: '20 0\nA 1 1\nA 0 0\nA 1 1\nA 0 0\nA 1 0\nA 0 0\nA 1 1\nA 0 0\nA 1 1\nA 0 0\nB 0 1\nB 1 1\nB 0 0\nB 1 0\nB 0 0\nB 0 1\nB 1 1\nB 0 0\nB 0 0\nB 0 0\n', output: 'group A: n=10 TP=4 FP=0 FN=1 TN=5\n  base=0.500 selection=0.400 TPR=0.800 FPR=0.000 PPV=1.000\ngroup B: n=10 TP=2 FP=2 FN=1 TN=5\n  base=0.300 selection=0.400 TPR=0.667 FPR=0.286 PPV=0.500\nselection gap=0.000 (all 0.400) ok\nTPR gap=0.133 (max A 0.800, min B 0.667) FLAG\nFPR gap=0.286 (max B 0.286, min A 0.000) FLAG\nPPV gap=0.500 (max A 1.000, min B 0.500) FLAG\nflagged: TPR FPR PPV\n', note: '門檻 0：任何非零差距都標記；選取率差距剛好是 0，不標記（必須「大於」門檻）' },
        { kind: 'normal', input: '20 1\nA 1 1\nA 0 0\nA 1 1\nA 0 0\nA 1 0\nA 0 0\nA 1 1\nA 0 0\nA 1 1\nA 0 0\nB 0 1\nB 1 1\nB 0 0\nB 1 0\nB 0 0\nB 0 1\nB 1 1\nB 0 0\nB 0 0\nB 0 0\n', output: 'group A: n=10 TP=4 FP=0 FN=1 TN=5\n  base=0.500 selection=0.400 TPR=0.800 FPR=0.000 PPV=1.000\ngroup B: n=10 TP=2 FP=2 FN=1 TN=5\n  base=0.300 selection=0.400 TPR=0.667 FPR=0.286 PPV=0.500\nselection gap=0.000 (all 0.400) ok\nTPR gap=0.133 (max A 0.800, min B 0.667) ok\nFPR gap=0.286 (max B 0.286, min A 0.000) ok\nPPV gap=0.500 (max A 1.000, min B 0.500) ok\nflagged: none\n', note: '門檻 1：差距不可能超過 1，沒有任何標記' },
        { kind: 'normal', input: '120 0.08\neast 0 0\nWest 0 0\neast 0 1\nWest 0 0\neast 0 0\nWest 0 0\nnorth 1 1\nWest 1 1\neast 1 1\nnorth 1 1\nWest 0 0\nWest 0 0\nWest 1 1\nWest 1 1\nWest 1 1\neast 1 1\neast 1 1\nnorth 0 0\nnorth 1 0\neast 1 1\nnorth 0 0\nWest 1 0\nWest 0 0\neast 0 0\nWest 0 0\nnorth 0 0\nWest 0 0\neast 1 1\nWest 0 0\nWest 0 0\neast 0 0\nWest 0 0\nnorth 1 1\neast 1 1\nnorth 0 0\neast 0 1\nnorth 0 0\nWest 0 0\neast 0 1\nWest 1 1\neast 0 1\neast 0 0\neast 0 0\nWest 1 0\neast 0 0\neast 1 0\nWest 0 1\nWest 1 1\nWest 1 1\neast 0 0\neast 0 1\nWest 0 0\neast 1 0\nWest 0 0\neast 0 0\neast 0 0\nWest 1 0\nnorth 0 0\neast 0 1\neast 0 0\neast 0 0\nWest 0 0\neast 1 0\neast 1 0\nnorth 0 0\nWest 0 0\nnorth 1 1\neast 0 1\nnorth 1 1\nWest 0 0\nWest 0 0\neast 0 0\nnorth 1 1\neast 1 0\neast 1 0\neast 0 0\nWest 0 1\neast 1 0\neast 0 0\neast 0 1\nWest 0 0\neast 0 0\nWest 1 1\neast 0 0\nWest 0 0\neast 0 0\neast 1 1\nnorth 0 0\nnorth 0 0\nnorth 1 0\neast 1 1\neast 1 0\neast 0 1\nWest 0 0\neast 0 0\nWest 0 0\neast 0 0\nnorth 1 1\neast 1 1\nnorth 1 1\neast 0 0\nnorth 0 0\nnorth 1 0\neast 1 1\neast 1 0\nWest 0 1\neast 0 0\neast 1 0\neast 1 1\nWest 1 1\nWest 0 0\nnorth 0 0\nnorth 1 1\neast 0 0\neast 1 0\nWest 0 0\nnorth 1 1\nWest 0 0\nnorth 0 0\nWest 1 0\n', output: 'group West: n=41 TP=9 FP=3 FN=4 TN=25\n  base=0.317 selection=0.293 TPR=0.692 FPR=0.107 PPV=0.750\ngroup east: n=54 TP=11 FP=9 FN=11 TN=23\n  base=0.407 selection=0.370 TPR=0.500 FPR=0.281 PPV=0.550\ngroup north: n=25 TP=10 FP=0 FN=3 TN=12\n  base=0.520 selection=0.400 TPR=0.769 FPR=0.000 PPV=1.000\nselection gap=0.107 (max north 0.400, min West 0.293) FLAG\nTPR gap=0.269 (max north 0.769, min east 0.500) FLAG\nFPR gap=0.281 (max east 0.281, min north 0.000) FLAG\nPPV gap=0.450 (max north 1.000, min east 0.550) FLAG\nflagged: selection TPR FPR PPV\n', note: '120 筆以固定種子 LCG 產生的合成決定，三組基本比率不同' },
        { kind: 'edge', input: '10 0.2\nx 1 1\nx 1 1\nx 1 1\nx 1 1\nx 1 0\ny 1 1\ny 1 1\ny 1 1\ny 1 0\ny 1 0\n', output: 'group x: n=5 TP=4 FP=0 FN=1 TN=0\n  base=1.000 selection=0.800 TPR=0.800 FPR=n/a PPV=1.000\ngroup y: n=5 TP=3 FP=0 FN=2 TN=0\n  base=1.000 selection=0.600 TPR=0.600 FPR=n/a PPV=1.000\nselection gap=0.200 (max x 0.800, min y 0.600) ok\nTPR gap=0.200 (max x 0.800, min y 0.600) ok\nFPR gap=n/a\nPPV gap=0.000 (all 1.000) ok\nflagged: none\n', note: '差距 0.8 − 0.6 剛好等於門檻 0.2，不標記；用浮點數相減會得到 0.20000000000000007 而誤標；兩組都沒有不合格者，FPR 是 n/a' },
        { kind: 'edge', input: '33 0.06\nG 1 1\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 0\nG 0 1\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 0 0\nH 1 1\n', output: 'group G: n=16 TP=1 FP=1 FN=0 TN=14\n  base=0.063 selection=0.125 TPR=1.000 FPR=0.067 PPV=0.500\ngroup H: n=17 TP=1 FP=0 FN=0 TN=16\n  base=0.059 selection=0.059 TPR=1.000 FPR=0.000 PPV=1.000\nselection gap=0.066 (max G 0.125, min H 0.059) FLAG\nTPR gap=0.000 (all 1.000) ok\nFPR gap=0.067 (max G 0.067, min H 0.000) FLAG\nPPV gap=0.500 (max H 1.000, min G 0.500) FLAG\nflagged: selection FPR PPV\n', note: 'G 組 base = 1/16 = 0.0625 四捨五入成 0.063、FPR = 1/15；H 組 1/17 ≈ 0.059；選取率差距 1/8 − 1/17 用分數精確相減得 0.066，大於 0.06' },
        { kind: 'edge', input: '4 0.1\nsolo 1 1\nsolo 0 0\nsolo 1 0\nsolo 0 1\n', output: 'group solo: n=4 TP=1 FP=1 FN=1 TN=1\n  base=0.500 selection=0.500 TPR=0.500 FPR=0.500 PPV=0.500\nselection gap=n/a\nTPR gap=n/a\nFPR gap=n/a\nPPV gap=n/a\nflagged: none\n', note: '只有一組：每個差距都需要至少兩組有定義的值，全部印 n/a，flagged: none' },
        { kind: 'edge', input: '6 0.3\nP 1 0\nP 0 0\nP 1 0\nQ 1 1\nQ 1 1\nQ 0 1\n', output: 'group P: n=3 TP=0 FP=0 FN=2 TN=1\n  base=0.667 selection=0.000 TPR=0.000 FPR=0.000 PPV=n/a\ngroup Q: n=3 TP=2 FP=1 FN=0 TN=0\n  base=0.667 selection=1.000 TPR=1.000 FPR=1.000 PPV=0.667\nselection gap=1.000 (max Q 1.000, min P 0.000) FLAG\nTPR gap=1.000 (max Q 1.000, min P 0.000) FLAG\nFPR gap=1.000 (max Q 1.000, min P 0.000) FLAG\nPPV gap=n/a\nflagged: selection TPR FPR\n', note: 'P 組沒有人被核准：PPV 沒有定義（n/a），PPV 差距只剩一組而印 n/a；TPR 差距 1 大於 0.3' },
        { kind: 'edge', input: '32 0.0625\nr 1 1\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\nr 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 0\ns 0 1\n', output: 'group r: n=16 TP=1 FP=0 FN=0 TN=15\n  base=0.063 selection=0.063 TPR=1.000 FPR=0.000 PPV=1.000\ngroup s: n=16 TP=0 FP=1 FN=0 TN=15\n  base=0.000 selection=0.063 TPR=n/a FPR=0.063 PPV=0.000\nselection gap=0.000 (all 0.063) ok\nTPR gap=n/a\nFPR gap=0.063 (max s 0.063, min r 0.000) ok\nPPV gap=1.000 (max r 1.000, min s 0.000) FLAG\nflagged: PPV\n', note: 's 組沒有合格者（TPR n/a）；1/16 = 0.0625 四捨五入印 0.063（Python 的 f"{0.0625:.3f}" 會印 0.062）；FPR 差距 1/16 與門檻 0.0625 相等，不標記' },
        { kind: 'edge', input: '1 0.5\nA 1 1\n\n\n', output: 'group A: n=1 TP=1 FP=0 FN=0 TN=0\n  base=1.000 selection=1.000 TPR=1.000 FPR=n/a PPV=1.000\nselection gap=n/a\nTPR gap=n/a\nFPR gap=n/a\nPPV gap=n/a\nflagged: none\n', note: 'n = 1，結尾有空行：空行忽略；只有一組，差距都是 n/a' },
        { kind: 'error', input: '', output: 'invalid input\n', note: '空的輸入' },
        { kind: 'error', input: '3 0.1\nA 1 1\nA 2 0\nB 0 0\n', output: 'invalid input\n', note: 'y 只能是 0 或 1' },
        { kind: 'error', input: '3 0.1\nA 1 1\nA 0\nB 0 0\n', output: 'invalid input\n', note: '有一行少了 pred 欄位' },
        { kind: 'error', input: '5 0.1\nA 1 1\nA 0 0\nB 1 0\nB 0 0\n', output: 'invalid input\n', note: '宣告 5 筆，只給了 4 筆' },
        { kind: 'error', input: '2 1.5\nA 1 1\nB 0 0\n', output: 'invalid input\n', note: '門檻大於 1' },
        { kind: 'error', input: '2 -0.1\nA 1 1\nB 0 0\n', output: 'invalid input\n', note: '門檻是負數，不是合法的小數格式' },
        { kind: 'error', input: '0 0.1\n', output: 'invalid input\n', note: 'n 必須至少是 1' },
        { kind: 'error', input: '2 0.1\nA 1 1\nB 0 0\nB 1 1\n', output: 'invalid input\n', note: '宣告 2 筆，卻有 3 筆' },
        { kind: 'error', input: '2 abc\nA 1 1\nB 0 0\n', output: 'invalid input\n', note: '門檻不是數字' },
        { kind: 'error', input: '2 0.1\nA 1 01\nB 0 0\n', output: 'invalid input\n', note: 'pred 寫成 01，只接受單一字元 0 或 1' },
        { kind: 'error', input: '2 0.1\nA 1 1\nteam-B 0 0\n', output: 'invalid input\n', note: '組名只能有英文字母、數字與底線' },
        { kind: 'error', input: '11 0.1\ng0 1 1\ng1 1 1\ng2 1 1\ng3 1 1\ng4 1 1\ng5 1 1\ng6 1 1\ng7 1 1\ng8 1 1\ng9 1 1\ng10 1 1\n', output: 'invalid input\n', note: '11 個組，超過上限 10' },
      ],
      hints: [
        '用 `cells.setdefault(g, [0, 0, 0, 0])` 為每一組準備 TP、FP、FN、TN 四個計數，讀完所有紀錄再計算比率。',
        '寫一個 `ratio(a, b)`：b 為 0 時回傳 None，否則回傳 `Fraction(a, b)`；印的時候把 None 印成 n/a。',
        '四捨五入到 3 位可以寫成 `int(x * 1000 + Fraction(1, 2))`，再拆成整數部分與 3 位小數；不要用 `f"{float(x):.3f}"`，它對 0.0625 會印 0.062。',
        '差距只在有定義的組之間計算；先把 (值, 組名) 依組名排序放進串列，再用 max 與 min 找出兩端。',
      ],
      solution: { Python: code`import re
import sys
from fractions import Fraction

METRICS = ['selection', 'TPR', 'FPR', 'PPV']
NAME = re.compile(r'[A-Za-z0-9_]{1,12}')
DECIMAL = re.compile(r'\d+(\.\d+)?')

def fmt(x):
    """非負分數四捨五入到小數 3 位；None（沒有定義）印成 n/a。"""
    if x is None:
        return 'n/a'
    v = int(x * 1000 + Fraction(1, 2))  # 精確的四捨五入，不經過浮點數
    return f'{v // 1000}.{v % 1000:03d}'

def ratio(a, b):
    return Fraction(a, b) if b else None  # 分母是 0：這個比率沒有定義

def parse(lines):
    while lines and not lines[-1].strip():
        lines.pop()
    head = lines[0].split() if lines else []
    if len(head) != 2 or not head[0].isdigit() or not DECIMAL.fullmatch(head[1]):
        return None
    n, threshold = int(head[0]), Fraction(head[1])
    if not 1 <= n <= 1000 or threshold > 1 or len(lines) != n + 1:
        return None
    cells = {}
    for line in lines[1:]:
        parts = line.split()
        if len(parts) != 3 or not NAME.fullmatch(parts[0]) or parts[1] not in ('0', '1') or parts[2] not in ('0', '1'):
            return None
        g, y, pred = parts[0], parts[1] == '1', parts[2] == '1'
        c = cells.setdefault(g, [0, 0, 0, 0])  # TP, FP, FN, TN
        c[0 if pred and y else 1 if pred else 2 if y else 3] += 1
    return threshold, cells

parsed = parse(sys.stdin.read().replace('\r', '').split('\n'))
if parsed is None or len(parsed[1]) > 10:
    print('invalid input')
    sys.exit()
threshold, cells = parsed
rates = {}
for g in sorted(cells):
    tp, fp, fn, tn = cells[g]
    n = tp + fp + fn + tn
    rates[g] = {'selection': ratio(tp + fp, n), 'TPR': ratio(tp, tp + fn),
                'FPR': ratio(fp, fp + tn), 'PPV': ratio(tp, tp + fp)}
    print(f'group {g}: n={n} TP={tp} FP={fp} FN={fn} TN={tn}')
    print(f'  base={fmt(ratio(tp + fn, n))} '
          + ' '.join(f'{m}={fmt(rates[g][m])}' for m in METRICS))
flagged = []
for m in METRICS:
    known = [(rates[g][m], g) for g in sorted(rates) if rates[g][m] is not None]
    if len(known) < 2:
        print(f'{m} gap=n/a')
        continue
    hi = max(known, key=lambda t: t[0])  # 同值時取名稱排序在前的組
    lo = min(known, key=lambda t: t[0])
    gap = hi[0] - lo[0]  # 分數相減，精確
    if gap > threshold:
        flagged.append(m)
    where = f'max {hi[1]} {fmt(hi[0])}, min {lo[1]} {fmt(lo[0])}' if gap else f'all {fmt(hi[0])}'
    print(f'{m} gap={fmt(gap)} ({where}) ' + ('FLAG' if gap > threshold else 'ok'))
print('flagged: ' + (' '.join(flagged) if flagged else 'none'))` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'dp-table', title: '逐筆填入各組的混淆矩陣，再算出選取率、TPR、FPR、PPV 與組間差距', language: 'Python',
    code: TRACE_CODE,
    steps: fairnessSteps(),
  },
  quiz: [
    {
      id: 'q-label-bias', prompt: '一套醫療風險模型以「過去一年的醫療花費」當作「健康需求」的標籤來訓練。結果在病情相同時，就醫機會較少（因此花費較少）的群體得到較低的分數，比較少被轉介到照護計畫。這主要屬於哪一種偏誤來源？',
      options: ['代表性不足：這個群體在訓練資料中太少', '回饋迴圈：模型的決定改變了之後收集到的資料', '標籤偏誤：預測的目標只是真正目的的有偏替代品', '部署情境：模型被用在設計時沒考慮的國家'],
      answer: 2, explanation: '模型準確地預測了花費，問題出在「花費」不等於「需求」：同樣的病情，就醫機會少的人花費較低，所以標籤本身就有偏差，這是 Obermeyer 等人 2019 年研究描述的標籤偏誤。題目沒有說這個群體的資料太少，所以不是代表性不足；也沒有提到模型的決定回頭改變資料，不是回饋迴圈；模型就用在原本設計的情境，不是部署情境的問題。',
    },
    {
      id: 'q-rates-code', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`tp, fp, fn, tn = 6, 2, 3, 9
print(f'{tp / (tp + fn):.2f} {fp / (fp + tn):.2f} {tp / (tp + fp):.2f}')` },
      options: ['0.67 0.18 0.75', '0.75 0.18 0.67', '0.67 0.25 0.75', '0.40 0.18 0.75'],
      answer: 0, explanation: '三個值依序是 TPR = 6 / (6 + 3) = 0.67、FPR = 2 / (2 + 9) = 0.18、PPV = 6 / (6 + 2) = 0.75。0.75 0.18 0.67 把 TPR 與 PPV 的位置對調了；0.25 是 FP / (TP + FP)，也就是 1 − PPV，不是 FPR，FPR 的分母是所有實際為陰性的 FP + TN；0.40 是選取率 (6 + 2) / 20，不是 TPR。',
    },
    {
      id: 'q-parity-not-enough', prompt: '一個貸款模型對 A、B 兩組的選取率都是 0.4，但 A 組合格者被核准的比例是 0.8，B 組只有 0.667。下列敘述何者正確？',
      options: ['兩組選取率相同，所以模型對兩組是公平的', '只要調低 B 組的門檻，所有公平性指標都會同時相等', 'TPR 不同，代表模型一定使用了 group 欄位', 'B 組的合格者比 A 組的合格者更容易被拒絕，機會均等不成立'],
      answer: 3, explanation: 'TPR 是合格者被核准的機率，0.667 < 0.8，表示 B 組合格者被拒絕的機率較高，違反機會均等。選取率相同只代表人口均等成立，不代表其他公平性定義成立；調整門檻可以改變某些比率，但兩組的基本比率不同時，PPV、TPR、FPR 不可能全部相等；TPR 不同也可能來自代理變數、資料或標籤，不一定是模型直接用了 group。',
    },
    {
      id: 'q-impossibility', prompt: 'A 組的基本比率是 0.5，B 組是 0.3，模型會犯錯（不是完美的分類器）。下列哪一組條件「無法」同時成立？',
      options: ['各組的選取率相同，而且各組的 TPR 相同', '各組的 PPV、TPR、FPR 三者全部相同', '各組的 TPR 相同，而且各組的 FPR 相同', '各組的 PPV 相同'],
      answer: 1, explanation: '恆等式 FPR = p / (1 − p) × (1 − PPV) / PPV × TPR 對任何混淆矩陣都成立；p 不同時，PPV 與 TPR 都相同就會讓 FPR 不同，除非模型完美（PPV = 1、FPR = 0），所以三者不能全部相同。其他選項都只是部分條件，可以做到：選取率與 TPR 可以藉由各組不同的 FPR 同時相等；TPR 與 FPR 相同就是均等勝算，此時只是 PPV 會不同；只要求 PPV 相同也有很多分類器能做到。',
    },
    {
      id: 'q-ai-act', prompt: '依歐盟 AI 法的風險分級，下列哪一個用途屬於高風險？',
      options: ['電子郵件的垃圾信過濾', '網站上回答常見問題的客服聊天機器人', '用 AI 評估個人信用，決定是否核貸', '電玩遊戲中控制對手的 AI'],
      answer: 2, explanation: '評估自然人的信用或給出信用分數，列在 AI 法附件三的高風險用途中，因為它決定一個人能否取得重要的金融服務。垃圾信過濾與電玩 AI 是常被舉例的最小風險用途，沒有高風險或透明義務；客服聊天機器人屬於透明義務（常稱有限風險），要告知使用者正在和 AI 互動，但不是高風險。',
    },
    {
      id: 'q-dp-epsilon', prompt: '對一個計數查詢（敏感度 1）使用 Laplace 機制，把 ε 從 1 改成 0.5，會發生什麼事？',
      options: ['雜訊尺度從 1 變成 0.5：答案更準，隱私保證變弱', '雜訊尺度從 1 變成 2：隱私保證更強，答案的誤差變大', '只要固定亂數種子，雜訊就不會影響準確度', 'ε 只影響執行速度，和隱私或準確度無關'],
      answer: 1, explanation: 'Laplace 機制的尺度是敏感度 / ε = 1 / 0.5 = 2，雜訊變大，平均絕對誤差也從 1 變成 2；ε 越小，有沒有某一個人的資料對輸出分布的影響上限 e^ε 越小，隱私保證越強。尺度變成 0.5 是把 ε 的方向弄反了；固定種子只讓結果可以重現，雜訊仍然存在，而且真正部署時不能用可預測的種子；ε 正是隱私與準確度的取捨參數，和速度無關。',
    },
    {
      id: 'q-proxy', prompt: '一家銀行把「族群」欄位從訓練資料中刪掉，模型只用居住地區、收入與職業，可是各族群的核准率仍然差很多。最可能的原因是什麼？',
      options: ['居住地區等特徵和族群高度相關，成了代理變數', '刪掉欄位之後，模型只能隨機猜測', '核准率有差異，一定代表程式寫錯了', '只要訓練資料夠多，代理變數的影響就會自動消失'],
      answer: 0, explanation: '刪掉敏感欄位（fairness through unawareness）擋不住相關的特徵：範例中 district 猜 group 的準確率有 0.80，模型只看 district 就重現了差距。模型仍然可以從其他特徵學到模式，不會變成隨機猜測；核准率差異可能來自資料、標籤或代理變數，不一定是程式錯誤，也不一定不合理，要用分組錯誤率進一步檢查；資料再多，相關性也不會消失，反而會被學得更準。',
    },
    {
      id: 'q-oversight', prompt: '某系統把每一個拒貸建議送給審核員按「同意」。審核員每件只有 5 秒、看不到模型的理由，改判還要另外寫報告，結果 99.8% 的建議都被照單全收。這最接近哪一種問題？',
      options: ['資料最小化做得不夠', '模型的 PPV 太低', '差分隱私的 ε 設得太大', '自動化偏誤：形式上有人類監督，實際上沒有有效的監督'],
      answer: 3, explanation: '審核員沒有時間、沒有資訊，改判又有額外成本，自然傾向接受系統的建議，這就是自動化偏誤讓人類監督流於形式；有效的監督需要權限、時間、資訊與訓練，並追蹤改判率。題目描述的是審核流程，沒有提到收集了不必要的資料，和資料最小化無關；PPV 是模型的錯誤比率，從題目看不出它的高低；ε 是差分隱私發布統計時的參數，和逐件審核無關。',
    },
  ],
};

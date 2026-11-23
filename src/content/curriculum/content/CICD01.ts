import type { LessonContent } from '../schema';
import type { DeploymentHistory, DeploymentRecord } from '@/lib/devops/history';

/**
 * CICD01 DevOps 概念與文化. A devops-explorer lesson (D1 deployment histories, no terminal). A fictional online bookstore
 * (示意資料, not any real company): the same eight changes shipped in one batch or one at a time, and two teams over the
 * same 84 days, A with monthly releases, handoffs to QA and to operations and a night maintenance window, B with small
 * automated deployments and developers on the on-call rotation. The DORA metrics and every exercise answer are computed
 * from these records by src/lib/devops (devopsContentProblems checks them); none is written here.
 */

/** A minute of the period from the day as the explorer shows it (第 1 天 is minute 0–1439) and a clock time. */
const at = (day: number, hh: number, mm = 0) => (day - 1) * 1440 + hh * 60 + mm;

/**
 * The same week, eight changes committed Monday to Friday. Batch: all of them go out together on Friday at 16:00; the
 * release breaks checkout, and finding which of the eight changes did it takes hours. Split: each change is deployed by
 * the pipeline soon after it is merged; the fifth one fails, is noticed by an alert and rolled back at once.
 */
const WEEK_COMMITS = [at(1, 10), at(1, 15), at(2, 11), at(2, 16), at(3, 10, 30), at(4, 14), at(5, 9, 30), at(5, 13)];
const batch: DeploymentHistory = {
  service: '會員服務', days: 7, deployments: [
    { id: 'r1', commitAt: WEEK_COMMITS, deployedAt: at(5, 16), failure: { detectedAt: at(5, 16, 30), restoredAt: at(5, 20) } },
  ],
};
/** Minutes from each change's commit to its own deployment (tests and deployment run in the pipeline). */
const SPLIT_LEADS = [60, 45, 50, 70, 40, 55, 60, 65];
const split: DeploymentHistory = {
  service: '會員服務', days: 7,
  deployments: WEEK_COMMITS.map((c, i): DeploymentRecord => ({
    id: `c${i + 1}`, commitAt: [c], deployedAt: c + SPLIT_LEADS[i],
    ...(i === 4 ? { failure: { detectedAt: c + SPLIT_LEADS[i] + 10, restoredAt: c + SPLIT_LEADS[i] + 20 } } : {}),
  })),
};

/**
 * Team A, 84 days: a release every four weeks at 22:00 in the maintenance window, after a code freeze and a week of
 * manual testing; two of the releases fail and are fixed by hotfix deployments, which count as deployments too.
 */
const teamA: DeploymentHistory = {
  service: '會員服務', days: 84, deployments: [
    { id: 'release-1', deployedAt: at(26, 22),
      commitAt: [at(2, 15), at(5, 11), at(9, 16), at(11, 10), at(15, 14), at(16, 17), at(18, 11), at(19, 16)],
      failure: { detectedAt: at(27, 9, 30), restoredAt: at(27, 16) } },
    { id: 'hotfix-1', deployedAt: at(27, 16), commitAt: [at(27, 11)] },
    { id: 'release-2', deployedAt: at(54, 22),
      commitAt: [at(29, 10), at(31, 15), at(34, 11), at(37, 16), at(40, 14), at(42, 10), at(44, 17), at(46, 11), at(47, 15)] },
    { id: 'release-3', deployedAt: at(82, 22),
      commitAt: [at(57, 11), at(60, 16), at(63, 10), at(66, 14), at(69, 15), at(71, 11), at(73, 16), at(75, 10)],
      failure: { startedAt: at(83, 8), detectedAt: at(83, 8, 40), restoredAt: at(83, 14) } },
    { id: 'hotfix-3', deployedAt: at(83, 14), commitAt: [at(83, 10, 30)] },
  ],
};

/**
 * Team B, the same 84 days: one deployment every weekday (day 1 is a Monday), each with one small change or two, most of
 * them merged and deployed within a few hours (some the next morning). Three deployments fail; the alert fires within
 * minutes and the developer on call rolls the change back.
 */
const B_TIMES = [[10, 30], [14, 0], [11, 0], [15, 30], [10, 0]] as const;
const B_LEADS: number[][] = [
  [90], [45], [120], [60], [35],
  [75], [150], [50], [1110], [40],
  [65], [95], [55], [180], [30],
  [85], [45, 120], [70], [60], [240],
  [50], [100], [40], [75], [1050],
  [65], [35], [90], [55], [130],
  [45], [80], [60, 25], [110], [40],
  [70], [55], [95], [1200], [50],
  [60], [85], [40], [140], [35],
  [75], [65], [50], [105], [45],
  [90], [55, 70], [30], [160], [60],
  [80], [45], [120], [50], [65],
];
/** The failed deployments (by index): minutes from the deployment to detection and to recovery. */
const B_FAILURES: Record<number, [detect: number, restore: number]> = { 11: [5, 18], 30: [12, 40], 47: [4, 25] };
const teamB: DeploymentHistory = {
  service: '購物車服務', days: 84,
  deployments: B_LEADS.map((leads, i): DeploymentRecord => {
    const week = Math.floor(i / 5), weekday = i % 5, [hh, mm] = B_TIMES[weekday];
    const deployedAt = at(week * 7 + weekday + 1, hh, mm), f = B_FAILURES[i];
    return { id: `b${String(i + 1).padStart(2, '0')}`, deployedAt, commitAt: leads.map(l => deployedAt - l),
      ...(f ? { failure: { detectedAt: deployedAt + f[0], restoredAt: deployedAt + f[1] } } : {}) };
  }),
};

export const CICD01: LessonContent = {
  lessonId: 'CICD01',
  motivation: '同一家線上書店裡，A 團隊每個月熬夜上線一次大版本，上線後常常要緊急修補；B 團隊每天上線好幾個小變更，出了問題幾分鐘就恢復。兩個團隊的工程師一樣認真，差別在於工作的方式：誰負責上線後的服務、一次交付多少變更、哪些步驟交給自動化、用什麼數字判斷自己有沒有進步。DevOps 就是在回答這些問題。本課先看開發與維運之間為什麼會有一道牆，再用部署紀錄看出小批量交付為什麼比較安全，最後用 DORA 的四個指標，把「交付得好不好」從感覺變成可以比較、可以追蹤的數字。後面的 CI/CD 課程，都是在把本課的想法做成實際的流程。',
  sections: [
    {
      id: 'cicd01-gap', title: '開發與維運之間的那道牆',
      blocks: [
        { type: 'p', text: '傳統的軟體組織常把工作分成兩邊：開發（Development）負責寫出新功能，維運（Operations）負責讓正式環境的服務穩定運作。分工本身沒有錯，問題在於兩邊被要求的目標互相拉扯：開發以「交付了多少功能」被評價，每一次變更都是成果；維運以「系統多穩定」被評價，每一次變更都是風險。於是開發想多上線，維運想少上線，兩邊之間只靠交接單與會議連接。這種開發與維運的隔閡，常被形容成一道「混亂之牆」（wall of confusion）：程式丟過牆，出了問題再丟回來。' },
        { type: 'p', text: '本課的例子是一家虛構的線上書店（示意資料）。A 團隊負責會員服務，沿用分工明確的舊流程；B 團隊負責購物車服務，已經改成 DevOps 的做法。兩個團隊人數相近、程式一樣複雜，差別在工作方式：' },
        { type: 'table', head: ['環節', 'A 團隊（會員服務）', 'B 團隊（購物車服務）'], rows: [
          ['一次上線多少', '每四週一個大版本，一次帶八、九個變更', '每個工作天上線一次，每次一兩個小變更'],
          ['測試', '程式凍結後交給測試團隊，人工測一週', '每次合併都由流水線自動跑測試，十幾分鐘就有結果'],
          ['上線', '填變更申請、等審核會議，由維運人員在晚上的維護時段手動部署', '測試通過後由部署流程自動上線，白天進行'],
          ['上線後出問題', '維運人員值班，看不懂新程式，要等隔天聯絡開發人員', '開發人員也輪值 on-call，告警直接通知寫程式的人'],
          ['事後檢討', '追究是誰的疏失', '不追究個人，找出流程哪裡讓錯誤溜過去'],
        ] },
        { type: 'p', text: 'A 團隊的每一道交接都要排隊：等測試團隊有空、等審核會議、等維護時段。等待讓一次上線的變更越積越多，而變更越多，上線越可怕，大家就越想把上線的次數壓低，形成惡性循環。牆的兩邊都很努力，卻是在不同的目標下努力，沒有人看得到從「寫好程式」到「使用者用得到」的整條路。' },
      ],
    },
    {
      id: 'cicd01-devops', title: 'DevOps：文化、做法與工具',
      blocks: [
        { type: 'p', text: 'DevOps 這個詞大約在 2009 年出現（同一年在比利時根特舉辦了第一場 DevOpsDays 研討會），指的是讓開發與維運一起為「軟體從寫好到在正式環境中可靠運作」的整條流程負責的一套文化與做法。它不是單一的規範或標準，沒有官方的定義；常見的整理方式是 CALMS：文化（Culture）、自動化（Automation）、精實（Lean，例如小批量、減少等待）、量測（Measurement）與分享（Sharing）。' },
        { type: 'p', text: '其中最根本的是共同責任：開發人員不只要讓程式通過測試，也要關心它在正式環境裡跑得好不好；維運的知識（監控、容量、部署方式）也提早進到開發流程中。常見的說法是「you build it, you run it」：誰寫的服務，就由誰一起負責它的上線與值班。B 團隊的開發人員輪值 on-call，半夜被告警叫醒的是寫程式的人，他們自然會把告警寫清楚、把容易出錯的地方修好。' },
        { type: 'table', head: ['DevOps 的面向', '在 B 團隊的樣子'], rows: [
          ['文化與共同責任', '開發與維運同一個目標：功能要上線，服務也要穩定；開發人員輪值 on-call'],
          ['自動化', '測試、部署、環境建置都由程式執行，不靠人手照文件操作'],
          ['精實與小批量', '一次只上線一兩個變更，減少排隊與等待'],
          ['量測', '用 DORA 指標與服務的監控資料判斷流程有沒有變好'],
          ['分享', '事後檢討公開寫下原因與改進，不追究個人，其他團隊也能學到'],
        ] },
        { type: 'p', text: '不追究個人的事後檢討（blameless postmortem）是共同責任的另一面：發生事故時，問的是「流程為什麼讓這個錯誤上線、為什麼這麼晚才發現」，而不是「是誰按錯了」。一旦犯錯會被懲罰，大家就會隱瞞問題、避免上線，流程反而更危險。' },
        { type: 'callout', tone: 'warning', title: '「DevOps 是一個職稱，或是買一套工具就有」', text: '不是。把幾個人改名叫「DevOps 工程師」、組成一個專門負責部署的新部門，只是在開發與維運之間多砌一道牆；買了 CI/CD 工具，流程卻照舊要等測試團隊與審核會議，交付也不會變快。工具是實踐 DevOps 的手段，關鍵在於團隊的目標、責任與工作方式是否一起改變。' },
      ],
    },
    {
      id: 'cicd01-small-batch', title: '小批量與快速回饋：為什麼小步比較安全',
      blocks: [
        { type: 'p', text: '直覺上，上線次數越少越安全：每次上線都可能出錯，少上線就少出錯。但實際的風險不只看「上線幾次」，還要看每次上線帶了多少變更、出錯時多快發現、多快恢復。下面兩份紀錄是同一週的同樣八個變更（示意資料）：第一份把八個變更累積到週五下午一次上線，第二份在每個變更合併、通過自動測試後就各自上線。兩份紀錄裡，真正有錯的都是同一個變更（週三提交的第五個）。' },
        { type: 'example', id: 'cicd01-batch' },
        { type: 'example', id: 'cicd01-split' },
        { type: 'p', text: '在探索器裡選擇部署、比較兩份紀錄，可以看到小批量帶來的四個差別：' },
        { type: 'list', ordered: true, items: [
          '等待較短：一次上線時，週一提交的變更要等到週五才上線；分開上線時，每個變更大約一小時就到使用者手上。這就是變更前置時間的差別。',
          '出錯的範圍較小：一次上線失敗，整個版本都算失敗；分開上線時，只有帶著錯誤的那一次失敗，其他七次照常上線。',
          '比較容易找到原因：剛上線的只有一個變更，出錯時要懷疑的就只有它；八個變更一起上線，要先花時間找出是哪一個。',
          '比較容易恢復：只要撤回那一個小變更；一次上線的版本要整個撤回，連帶撤掉另外七個沒問題的功能，有時還卡著資料庫的變更撤不回去。',
        ] },
        { type: 'p', text: '快速回饋是小批量的另一半。B 團隊每次合併後十幾分鐘就知道測試有沒有通過，上線後幾分鐘就從監控知道服務是否正常，寫程式的人還記得自己剛改了什麼，修正很快；A 團隊要等一週後的人工測試、甚至上線隔天的客訴，才知道幾週前寫的程式有問題，修正的成本高得多。回饋越快，錯誤越早被抓到，每一步也就越敢往前走。' },
        { type: 'callout', tone: 'warning', title: '「部署越頻繁，風險越大」', text: '只有在每次部署都很大、很難測、很難撤回時才是如此。頻繁部署的前提是每次只帶很少的變更，並由自動測試、監控與一鍵回滾保護；這時每次部署的風險很小，而且出錯時影響範圍小、恢復得快。DORA 的研究長期觀察到，交付表現好的團隊通常在速度與穩定兩方面同時表現好，兩者不必互相取捨。' },
      ],
    },
    {
      id: 'cicd01-automation', title: '自動化：讓小批量做得到',
      blocks: [
        { type: 'p', text: '小批量的代價是上線次數變多。如果每次上線都要人工測一週、開一次審核會議、在晚上由維運人員照文件一步一步操作，一天上線一次根本不可能。自動化把這些重複的步驟交給程式：同樣的步驟每次都以同樣的方式執行，不會漏做、不會因為人累了而出錯，也讓每一次上線的成本低到可以天天做。' },
        { type: 'table', head: ['自動化的環節', '取代了什麼', '帶來的回饋'], rows: [
          ['自動建置與測試（持續整合，continuous integration）', '程式凍結後的人工測試', '每次合併後幾分鐘內知道有沒有弄壞東西'],
          ['自動部署', '維運人員在維護時段照文件手動操作', '上線變成一個按鈕或自動觸發，可以在白天、隨時進行'],
          ['環境以程式描述（基礎設施即程式碼）', '每台伺服器各自手動設定、彼此不一致', '測試環境與正式環境一致，「在我這裡可以跑」的問題變少'],
          ['監控與告警', '使用者打電話來才知道出事', '上線後幾分鐘內知道服務是否正常'],
        ] },
        { type: 'p', text: '這條自動化的路線就是本島後面的主題 CI/CD。持續整合（continuous integration，CI）是開發人員頻繁地把變更合併回主線，每次都自動建置與測試；持續交付（continuous delivery）是讓主線隨時保持在可以上線的狀態，上線只差一個決定；持續部署（continuous deployment）則更進一步，通過所有自動檢查的變更不經人工核准就直接上線。B 團隊的做法接近持續部署。' },
        { type: 'callout', tone: 'note', title: '自動化不等於不檢查', text: '自動化的流程照樣有關卡，只是關卡由測試、程式碼審查與監控的條件組成，而不是排隊等人。需要人工核准的步驟（例如正式環境的上線）也可以保留在流程中，後面的課會在 CI/CD 流水線裡實際設定。' },
      ],
    },
    {
      id: 'cicd01-dora', title: 'DORA 指標：把交付表現變成數字',
      blocks: [
        { type: 'p', text: '「我們交付得好不好」需要量測，才不會各說各話。DORA（DevOps Research and Assessment）是一個長期研究軟體交付表現的研究計畫，每年以問卷調查發表 State of DevOps 報告。它整理出四個描述軟體交付表現的指標，前兩個描述速度（throughput），後兩個描述穩定（stability）：' },
        { type: 'table', head: ['指標', '問的是', '本課的算法'], rows: [
          ['deployment frequency（部署頻率）', '多常把變更部署到正式環境', '期間內的部署次數 × 7 ÷ 天數，得到平均每週幾次，四捨五入到小數點後一位'],
          ['change lead time（變更前置時間）', '一個變更從提交到在正式環境上線要多久', '每個變更（不是每次部署）的上線時間減提交時間，取中位數'],
          ['change fail rate（變更失敗率）', '部署有多少比例在正式環境造成故障', '造成故障的部署次數 ÷ 部署次數，整數百分比，四捨五入'],
          ['failed deployment recovery time（失敗部署復原時間）', '部署造成故障後，多久恢復服務', '每次失敗部署從故障開始到恢復的時間，取中位數'],
        ] },
        { type: 'p', text: '幾個算法上的約定：修正故障的部署（hotfix）也是一次部署，要算進部署次數；中位數是把數值由小到大排好後取正中間的那個，個數是偶數時取中間兩個的平均，再四捨五入到整數分鐘（82.5 變成 83）。用中位數而不是平均數，是因為少數特別久的變更（例如放了一個月的功能）會把平均數拉得很高，中位數比較能代表「一般的變更」。時間一律以分鐘計。失敗部署復原時間在較早的報告中稱為恢復服務的時間（time to restore service），也常見 MTTR 的說法。' },
        { type: 'p', text: '下面是 A、B 兩個團隊在同一季（84 天）的部署紀錄（示意資料）。每張指標卡片都寫出了算式；選擇一次部署，可以看到它帶了幾個變更、每個變更等了多久、是否造成故障。A 團隊的修正部署 hotfix-1、hotfix-3 也記在紀錄裡。' },
        { type: 'example', id: 'cicd01-team-a' },
        { type: 'example', id: 'cicd01-team-b' },
        { type: 'callout', tone: 'note', title: '效能分級與本課的算法', text: 'DORA 的報告會依問卷結果把團隊分成幾個表現群組（例如 elite、high、medium、low），但群組的數目與每個群組的門檻會隨每年的資料調整，所以本課不替團隊分級。報告收集的是問卷中的區間回答，並沒有規定中位數或四捨五入的算法；本課的算法是為了讓每個數字都能手算驗證而固定的約定。' },
        { type: 'callout', tone: 'warning', title: '「用 DORA 指標替個人或團隊排名」', text: 'DORA 指標描述的是整個團隊與流程的交付表現，適合拿來和自己的過去比較、找出下一步要改進的瓶頸，不適合拿來評比個人或互相比較的團隊。一旦數字變成考核的目標，大家就會開始操作數字，例如把一個變更拆成好幾次無意義的部署來衝高部署頻率，或不把故障記下來壓低變更失敗率；這種「量測一變成目標，就不再是好的量測」的現象常被稱為古德哈特定律（Goodhart\'s law）。另外，不同服務的風險、規模與限制不同，同樣的數字代表的意義也不同。' },
      ],
    },
    {
      id: 'cicd01-read', title: '讀懂兩個團隊的數字',
      blocks: [
        { type: 'p', text: '四個指標要一起讀。只看部署頻率，可能鼓勵沒有測試保護的頻繁上線；只看變更失敗率，可能鼓勵乾脆不上線。比較 A、B 兩個團隊時，可以照下面的順序問：' },
        { type: 'list', ordered: true, items: [
          '速度：多常上線？一個變更從提交到使用者手上要等多久？等待主要花在哪一段（凍結後的人工測試、審核會議、維護時段）？',
          '穩定：上線有多少比例出問題？出問題後多久偵測到、多久恢復？偵測慢是因為沒有監控，還是告警通知的人看不懂程式？',
          '因果：慢與不穩是不是同一個原因造成的？例如一次上線的變更太多，同時讓前置時間變長、失敗的影響變大、找原因變慢。',
          '下一步：先改善哪個環節最有幫助？例如先把人工測試改成自動測試，或讓開發人員加入 on-call，再觀察指標的變化。',
        ] },
        { type: 'p', text: 'A 團隊的數字指向同一個根本原因：交接與等待讓變更積成大批量。前置時間以「週」計，主要花在等下一個版本、等人工測試；大版本出錯時影響整個版本，而且是維運人員值班、隔天早上才從客訴發現，恢復要等開發人員找原因、寫修正、再走一次緊急上線。B 團隊的前置時間以「小時」計，故障在幾分鐘內被告警發現，由輪值的開發人員撤回那個小變更。' },
        { type: 'p', text: '改善 A 團隊不需要一次照抄 B 團隊的全部做法。DevOps 的轉變通常是漸進的：先挑一個最痛的環節（例如把最常出錯的測試自動化、讓開發人員加入值班），改完後用同樣的指標觀察是否變好，再挑下一個。指標的意義在於讓團隊看見自己的進步，而不是給團隊打分數。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd01-q-wall', prompt: 'A 團隊的開發人員抱怨上線太慢，維運人員抱怨每次上線都出事。最根本的原因是什麼？',
      options: ['維運人員的技術不夠好，看不懂開發人員寫的程式，所以上線後才會一直出事', '開發人員不寫文件，交接給測試與維運時資訊不完整，才會每次上線都出事', '兩邊被要求的目標相反，又只靠交接單連接，沒有人負責整條流程', '公司使用的部署工具太舊，只要換一套新的部署工具就能解決兩邊的問題'],
      answer: 2, explanation: '開發以交付功能被評價、維運以穩定被評價，目標互相拉扯，中間只靠交接，這就是開發與維運的隔閡。把問題歸給維運人員的能力或開發人員的文件，都是在追究個人，換了人或補了文件，相反的目標與交接仍在；換新工具也一樣，流程與責任沒改，交付不會變好。',
    },
    {
      id: 'cicd01-q-devops', prompt: '下列哪一句最符合 DevOps 的意思？',
      options: ['開發與維運一起為服務從寫程式到上線運作負責，並以自動化與量測改進流程', '成立一個名叫 DevOps 的新部門，專門替開發團隊部署與維護所有伺服器', '導入一套 CI/CD 工具並完成設定後，團隊就算完成了 DevOps 的轉型', '讓每位開發人員都取得正式環境的全部權限，取消所有上線前的審查'],
      answer: 0, explanation: 'DevOps 的核心是共同責任，再加上自動化與量測讓流程持續改進。另設一個專門部署的部門，只是在開發與維運之間多一道牆；工具是手段，流程與責任不變就不算轉型；取消所有審查不是 DevOps，自動化的流程照樣有測試與審查的關卡。',
    },
    {
      id: 'cicd01-q-batch', prompt: '同樣八個變更，分成八次小部署比一次大部署安全，下列哪一個理由最正確？',
      options: ['小部署不需要經過測試，所以不會因為測試不完整或測試環境不同而出錯', '部署次數變多以後，每一次失敗所占的比例變小，失敗就不必再記錄下來', '小部署只改很少的程式，一定不會失敗，所以變更失敗率永遠是零', '出錯時只牽涉一個變更，容易找到原因，也只需要撤回那一個'],
      answer: 3, explanation: '小批量讓每次出錯的範圍小、原因明顯、撤回簡單，所以恢復得快。小部署仍然要測試，自動測試正是讓它可行的前提；每一次失敗的部署照樣要記錄並計入變更失敗率，比例變小不是不記錄的理由；改得少也會失敗，探索器裡分開上線的紀錄就有一次失敗，只是影響小、恢復快。',
    },
    {
      id: 'cicd01-q-cd', prompt: '持續交付（continuous delivery）與持續部署（continuous deployment）的差別是什麼？',
      options: ['持續交付只用在網站這類能隨時更新的服務，持續部署只用在要經過商店審核的手機 App', '持續交付讓主線隨時可上線、由人決定時機；持續部署讓通過檢查的變更自動上線', '持續交付在上線前不跑自動測試而靠人工驗收，持續部署才會在每次合併後跑自動測試', '兩者完全相同，只是不同公司、不同工具習慣使用的不同說法，沒有實質差別'],
      answer: 1, explanation: '兩者都建立在持續整合與自動測試之上，差別只在最後一步：持續交付讓每個變更都處於可上線的狀態，由人決定上線的時機；持續部署連這一步也自動化。它們與網站或 App 無關；兩者都需要自動測試；兩個詞的意思確實不同，不是同義詞。',
    },
    {
      id: 'cicd01-q-stability', prompt: '下列哪一組的兩個 DORA 指標，都是描述穩定（stability）的？',
      options: ['deployment frequency 與 change lead time', 'deployment frequency 與 change fail rate', 'deployment frequency 與 failed deployment recovery time', 'change fail rate 與 failed deployment recovery time'],
      answer: 3, explanation: '變更失敗率問上線有多少比例出問題，失敗部署復原時間問出問題後多久恢復，兩者都描述穩定。部署頻率與變更前置時間描述的是速度（throughput），所以第一組兩個都是速度；第二組與第三組都是部署頻率這個速度指標，配上一個穩定指標。',
    },
    {
      id: 'cicd01-q-rank', prompt: '主管打算每季依 DORA 指標替工程師排名，部署頻率最高的人加薪。最可能發生什麼事？',
      options: ['大家開始操作數字，例如把變更拆成無意義的小部署，指標變好看但交付沒有改善', '每個人都會專心改善自動測試與交付流程，所以整個團隊的交付表現一定會跟著進步', '部署頻率反而會下降，因為大家怕被排在後面，變得比較不敢把變更上線', '指標不會受到任何影響，因為 DORA 指標是自動算出來的，數字無法被刻意改變'],
      answer: 0, explanation: '數字一變成考核目標，就會被刻意操作，這正是古德哈特定律描述的情況。排名鼓勵的是衝高數字，不是改善流程，所以不能保證進步；依部署頻率加薪會讓大家拼命增加部署，不會減少；自動計算只能算紀錄裡的資料，而部署次數、是否記錄故障都是人可以改變的，所以指標當然會被影響。',
    },
    {
      id: 'cicd01-q-hotfix', prompt: 'A 團隊在 84 天內有 3 次大版本與 2 次修正部署，2 個大版本造成故障。如果有人把兩次修正部署從紀錄中刪掉，變更失敗率會怎樣？',
      options: ['下降，因為紀錄中的部署次數變少了，失敗所占的比例也跟著變小', '不變，因為造成故障的部署一樣是 2 次，所以比例不受影響', '上升到約 67%：分子仍是 2，分母從 5 變成 3', '無法再計算，因為沒有修正部署，就不知道故障是什麼時候恢復的'],
      answer: 2, explanation: '變更失敗率是造成故障的部署 ÷ 全部部署，刪掉兩次正常的修正部署，比例從 2 ÷ 5 = 40% 變成 2 ÷ 3 ≈ 67%。部署變少不會讓比例下降，分母變小只會讓它上升；分母改變了，比例不可能不變；恢復時間記在故障本身，修正部署不在紀錄中仍然可以計算失敗率。',
    },
    {
      id: 'cicd01-q-oncall', prompt: 'B 團隊讓開發人員也輪值 on-call。這個做法最主要的作用是什麼？',
      options: ['減少維運團隊需要的人數，讓公司在值班人力與加班費上節省大筆成本', '讓寫程式的人直接面對問題：修得更快，也更有動機預防同樣的錯誤', '讓開發人員有理由拒絕上線新功能，因為上線後出事要由自己處理', '讓開發人員取代監控與告警系統，由人隨時盯著服務的各項狀態'],
      answer: 1, explanation: '輪值 on-call 是共同責任的具體做法：告警通知的是最懂程式的人，恢復得快，也會把告警與容易出錯的地方改好。它的目的不是裁減人力；讓開發人員負責服務是為了讓上線更安全，不是讓他們拒絕上線；監控與告警照樣需要，值班的人是回應告警，不是取代監控。',
    },
  ],
  devops: {
    histories: [
      {
        id: 'cicd01-batch', title: '一週的八個變更：週五一次上線',
        description: '會員服務一週內提交了八個變更，全部累積到週五 16:00 一起上線。這個版本造成故障：半小時後才發現，又花了幾個小時找出是哪一個變更出錯並修好。選擇部署 r1，看每個變更等了多久。',
        history: batch,
      },
      {
        id: 'cicd01-split', title: '同樣八個變更：每個各自上線',
        description: '同樣的八個變更，每一個合併、通過自動測試後就各自上線（c1–c8）。第五個變更 c5 一樣有錯，但告警在 10 分鐘內發現，撤回這一個變更就恢復了，其他七次部署照常上線。',
        history: split,
      },
      {
        id: 'cicd01-team-a', title: 'A 團隊：每四週一個大版本',
        description: 'A 團隊（會員服務）在 84 天內的部署紀錄：程式凍結、人工測試一週、審核會議後，在晚上 22:00 的維護時段上線大版本；release-1 與 release-3 造成故障，分別由 hotfix-1、hotfix-3 修正。',
        history: teamA,
      },
      {
        id: 'cicd01-team-b', title: 'B 團隊：每個工作天的小變更',
        description: 'B 團隊（購物車服務）在同樣 84 天內的部署紀錄：每個工作天上線一次，每次一兩個小變更，由自動測試與自動部署完成；開發人員輪值 on-call，失敗的部署在幾分鐘內被告警發現並撤回。',
        history: teamB,
      },
    ],
    exercises: [
      {
        id: 'cicd01-x-batch', kind: 'table', title: '一次上線與分開上線',
        statement: '比較「週五一次上線」與「每個各自上線」兩份紀錄：算出兩者的變更前置時間中位數（分鐘），以及分開上線的變更失敗率（整數百分比，四捨五入）。',
        blanks: [
          { id: 'batch-lead', label: '一次上線：變更前置時間中位數（分鐘）', query: { task: 'dora', history: 'cicd01-batch', metric: 'lead-time-median' } },
          { id: 'split-lead', label: '分開上線：變更前置時間中位數（分鐘）', query: { task: 'dora', history: 'cicd01-split', metric: 'lead-time-median' } },
          { id: 'split-cfr', label: '分開上線：變更失敗率（%）', query: { task: 'dora', history: 'cicd01-split', metric: 'change-fail-rate' } },
        ],
        hints: [
          '前置時間以每個變更計算：一次上線的紀錄雖然只有一次部署，仍有八個變更、八個前置時間。',
          '八個是偶數個，中位數是排序後第 4 與第 5 個的平均，再四捨五入到整數分鐘。',
          '分開上線有八次部署，其中一次造成故障；1 ÷ 8 換成百分比後四捨五入。',
        ],
        explanation: '一次上線時，八個變更的前置時間由小到大是 180、390、1560、3210、4320、4620、5820、6120 分鐘，中位數是 (3210 + 4320) ÷ 2 = 3765 分鐘，超過兩天半。分開上線時是 40、45、50、55、60、60、65、70，中位數 (55 + 60) ÷ 2 = 57.5，四捨五入為 58 分鐘。分開上線的失敗率是 1 ÷ 8 = 12.5%，四捨五入為 13%；一次上線的失敗率則是 1 ÷ 1 = 100%：同樣一個有錯的變更，在大批量裡讓整個版本失敗。',
        mistakes: [
          { answer: { 'batch-lead': '3278', 'split-lead': '56', 'split-cfr': '13' }, why: '算成平均數而不是中位數：平均數會被等最久的幾個變更拉動' },
          { answer: { 'batch-lead': '3765', 'split-lead': '57', 'split-cfr': '12' }, why: '57.5 與 12.5 直接捨去小數；本課的四捨五入是 .5 一律進位' },
          { answer: { 'batch-lead': '6120', 'split-lead': '70', 'split-cfr': '13' }, why: '只算等最久的那個變更（最大值），不是中位數' },
        ],
      },
      {
        id: 'cicd01-x-recover', kind: 'choice', title: '哪一種恢復得快',
        statement: '比較「週五一次上線」與「每個各自上線」兩份紀錄的失敗部署復原時間中位數，哪一份比較短？',
        query: { task: 'dora-best', histories: ['cicd01-batch', 'cicd01-split'], metric: 'recovery-median' },
        options: [
          { value: 'cicd01-batch', label: '週五一次上線：部署次數少，出事的機會也少' },
          { value: 'cicd01-split', label: '每個各自上線：出事時只要撤回一個小變更' },
          { value: 'same', label: '兩者一樣：有錯的是同一個變更，修好它的時間相同' },
        ],
        hints: ['在兩個探索器裡看「失敗部署復原時間」卡片，或在表格的「復原（分鐘）」欄找出造成故障的那一次。'],
        explanation: '分開上線時，c5 造成的故障 20 分鐘就恢復；一次上線時，r1 的故障要 240 分鐘才恢復。錯誤是同一個變更，差別在於大批量要先從八個變更中找出元兇，而且撤回整個版本會連帶撤掉另外七個功能，只能修好後再上線。部署次數少不代表恢復快。',
        mistakes: [
          { answer: { choice: '0' }, why: '把「出事的次數」和「恢復的速度」混在一起：一次上線只出事一次，但這一次恢復得很慢' },
          { answer: { choice: '2' }, why: '以為恢復時間只取決於錯誤本身；找出原因與撤回的難度也算在恢復時間裡' },
        ],
      },
      {
        id: 'cicd01-x-a-frequency', kind: 'number', title: 'A 團隊的部署頻率',
        statement: 'A 團隊在 84 天內平均每週部署幾次？（四捨五入到小數點後一位）',
        blank: { id: 'per-week', label: 'A 團隊每週部署次數', query: { task: 'dora', history: 'cicd01-team-a', metric: 'per-week' } },
        hints: ['部署次數 × 7 ÷ 天數。', '修正部署（hotfix）也是部署，要算進去。'],
        explanation: 'A 團隊有 3 次大版本與 2 次修正部署，共 5 次；5 × 7 ÷ 84 ≈ 0.417，四捨五入到小數點後一位是 0.4 次，也就是大約每兩個半星期才上線一次。',
        mistakes: [
          { answer: { value: '5' }, why: '寫的是 84 天的總次數，沒有換算成每週' },
          { answer: { value: '0.3' }, why: '只算了 3 次大版本，漏掉兩次修正部署（3 × 7 ÷ 84 = 0.25，四捨五入為 0.3）' },
          { answer: { value: '0.42' }, why: '多寫了一位小數；題目要四捨五入到小數點後一位' },
        ],
      },
      {
        id: 'cicd01-x-a-stability', kind: 'table', title: 'A 團隊的穩定',
        statement: '從 A 團隊的部署紀錄算出：造成故障的部署次數、變更失敗率（%），以及失敗部署復原時間的中位數（分鐘）。',
        blanks: [
          { id: 'failed', label: '造成故障的部署（次）', query: { task: 'dora', history: 'cicd01-team-a', metric: 'failed' } },
          { id: 'cfr', label: '變更失敗率（%）', query: { task: 'dora', history: 'cicd01-team-a', metric: 'change-fail-rate' } },
          { id: 'recovery', label: '失敗部署復原時間中位數（分鐘）', query: { task: 'dora', history: 'cicd01-team-a', metric: 'recovery-median' } },
        ],
        hints: [
          '變更失敗率的分母是全部的部署，包括兩次修正部署。',
          '復原時間從故障開始算起：release-3 的故障是隔天早上流量上來時才開始，不是從 22:00 上線時開始。',
          '兩個值的中位數就是它們的平均。',
        ],
        explanation: 'release-1 與 release-3 造成故障，共 2 次；2 ÷ 5 = 40%。release-1 從第 26 天 22:00 上線就故障，到第 27 天 16:00 hotfix-1 上線才恢復，共 1080 分鐘（18 小時）；release-3 的故障從第 83 天 08:00 開始，14:00 恢復，共 360 分鐘。中位數是 (360 + 1080) ÷ 2 = 720 分鐘，也就是 12 小時。',
        mistakes: [
          { answer: { failed: '2', cfr: '67', recovery: '720' }, why: '分母只算 3 次大版本，漏掉了修正部署' },
          { answer: { failed: '2', cfr: '40', recovery: '1440' }, why: '把兩次的復原時間加總，不是取中位數' },
          { answer: { failed: '2', cfr: '40', recovery: '1020' }, why: 'release-3 的復原時間從 22:00 上線算起（960 分鐘，和 1080 的平均是 1020），但它的故障是隔天 08:00 才開始' },
        ],
      },
      {
        id: 'cicd01-x-b-metrics', kind: 'table', title: 'B 團隊的四個指標',
        statement: '從 B 團隊的部署紀錄讀出四個 DORA 指標：每週部署次數（小數點後一位）、變更前置時間中位數（分鐘）、變更失敗率（%）、失敗部署復原時間中位數（分鐘）。',
        blanks: [
          { id: 'per-week', label: '每週部署次數', query: { task: 'dora', history: 'cicd01-team-b', metric: 'per-week' } },
          { id: 'lead', label: '變更前置時間中位數（分鐘）', query: { task: 'dora', history: 'cicd01-team-b', metric: 'lead-time-median' } },
          { id: 'cfr', label: '變更失敗率（%）', query: { task: 'dora', history: 'cicd01-team-b', metric: 'change-fail-rate' } },
          { id: 'recovery', label: '失敗部署復原時間中位數（分鐘）', query: { task: 'dora', history: 'cicd01-team-b', metric: 'recovery-median' } },
        ],
        hints: [
          '指標卡片下方的小字寫出了算式，可以用來核對自己的計算。',
          '有幾次部署帶了兩個變更，所以變更的個數比部署次數多；前置時間的中位數以變更為單位。',
          '復原時間的中位數：把三次失敗部署的復原時間排序，取正中間的一個。',
        ],
        explanation: 'B 團隊 84 天內有 60 次部署：60 × 7 ÷ 84 = 5.0 次／週。63 個變更的前置時間排序後，正中間（第 32 個）是 65 分鐘。60 次部署中有 3 次造成故障，3 ÷ 60 = 5%。三次的復原時間是 18、25、40 分鐘，中位數 25 分鐘。和 A 團隊相比，B 團隊上線得更頻繁、更快，失敗率更低、恢復也更快：速度與穩定同時更好。',
        mistakes: [
          { answer: { 'per-week': '60', lead: '65', cfr: '5', recovery: '25' }, why: '寫的是 84 天的總部署次數，沒有換算成每週' },
          { answer: { 'per-week': '5.0', lead: '65', cfr: '5', recovery: '28' }, why: '把三次復原時間取平均（83 ÷ 3 ≈ 27.7），不是中位數' },
          { answer: { 'per-week': '5.0', lead: '65', cfr: '3', recovery: '25' }, why: '寫的是失敗的次數，不是失敗的比例' },
        ],
      },
      {
        id: 'cicd01-x-lead', kind: 'choice', title: '誰的變更等得比較久',
        statement: '比較 A、B 兩個團隊的變更前置時間中位數，哪一個團隊的變更從提交到上線等得比較短？',
        query: { task: 'dora-best', histories: ['cicd01-team-a', 'cicd01-team-b'], metric: 'lead-time-median' },
        options: [
          { value: 'cicd01-team-a', label: 'A 團隊：每個版本都經過一週人工測試，變更準備得比較完整' },
          { value: 'cicd01-team-b', label: 'B 團隊：每個變更合併後由自動流程在幾小時內上線' },
        ],
        hints: ['看兩個探索器的「變更前置時間（中位數）」卡片，注意單位是天還是分鐘。'],
        explanation: 'A 團隊的中位數是 19,140 分鐘，大約 13 天，因為變更要等下一個版本、程式凍結與一週的人工測試；B 團隊的中位數只有 65 分鐘。前置時間量的是等待，不是準備得多完整：A 團隊的變更大部分時間都在排隊，沒有人在處理它們。',
        mistakes: [
          { answer: { choice: '0' }, why: '把「測得比較久」當成優點；前置時間越短越好，它量的是變更等了多久才到使用者手上' },
        ],
      },
    ],
  },
};

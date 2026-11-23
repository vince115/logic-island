import type { LessonContent } from '@/content/curriculum/schema';
import type { DeploymentHistory } from '@/lib/devops/history';
import type { RolloutScenario } from '@/lib/devops/rollout';
import type { DevopsExercise, DevopsLessonContent, HistoryExplorer, RolloutExplorer } from '@/lib/devops/types';

/*
 * CICD-0: devops-explorer data checked by hand (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md), and a synthetic CICD10-shaped
 * lesson (deployment-simulator) that passes validateContent and the publish gate. No real lesson file uses it.
 */
const day = (d: number, hh: number, mm = 0) => d * 1440 + hh * 60 + mm;

/**
 * team-a, 14 days, 5 deployments, 8 changes. Lead times (minutes): d1 120 and 60, d2 300, d3 30, 90 and 600, d4 240,
 * d5 120 → sorted 30 60 90 120 120 240 300 600, median (120 + 120) ÷ 2 = 120 (the mean would be 195). d2 fails at its
 * deployment, detected after 15 and restored after 45 minutes; d4's failure starts 60 minutes after it, detected 20
 * and restored 120 minutes after it starts. Frequency 5 × 7 ÷ 14 = 2.5 a week on 5 days; fail rate 2 ÷ 5 = 40%;
 * recovery median (45 + 120) ÷ 2 = 82.5 → 83 (half up); detection median (15 + 20) ÷ 2 = 17.5 → 18.
 */
export const teamA = (): DeploymentHistory => ({
  service: 'checkout', days: 14, deployments: [
    { id: 'd1', deployedAt: day(0, 10), commitAt: [day(0, 8), day(0, 9)] },
    { id: 'd2', deployedAt: day(1, 10), commitAt: [day(1, 5)], failure: { detectedAt: day(1, 10, 15), restoredAt: day(1, 10, 45) } },
    { id: 'd3', deployedAt: day(3, 10), commitAt: [day(3, 9, 30), day(3, 8, 30), day(3, 0)] },
    { id: 'd4', deployedAt: day(7, 14), commitAt: [day(7, 10)], failure: { startedAt: day(7, 15), detectedAt: day(7, 15, 20), restoredAt: day(7, 17) } },
    { id: 'd5', deployedAt: day(10, 10), commitAt: [day(10, 8)] },
  ],
});
/**
 * team-b, 14 days, 10 small deployments (one change each) on days 1–10 at 10:00. Lead times 60 45 30 60 90 60 30 45 60
 * 120 → median 60; one failure (recovered in 20 minutes) → 10%; 10 × 7 ÷ 14 = 5.0 a week.
 */
export const teamB = (): DeploymentHistory => {
  const leads = [60, 45, 30, 60, 90, 60, 30, 45, 60, 120];
  return { service: 'checkout', days: 14, deployments: leads.map((lead, d) => ({ id: `b${d + 1}`, deployedAt: day(d, 10), commitAt: [day(d, 10) - lead],
    ...(d === 4 ? { failure: { detectedAt: day(d, 10, 5), restoredAt: day(d, 10, 20) } } : {}) })) };
};

/**
 * 4 instances of 300 requests a minute, 1,000 requests a minute, both versions ready 90 s (two minutes) after they
 * start; v1 fails 1 ‰, v2 2 ‰. Rolling (maxSurge 1, maxUnavailable 0): one extra instance from minute 0, an old one
 * goes each time a new one is ready (minutes 2, 4, 6, 8); complete at 8, peak 5, 8 extra instance-minutes, nothing
 * dropped; v1 serves 5,000 requests (5 errors) and v2 5,000 (10 errors).
 */
export const checkout = (): RolloutScenario => ({
  fleet: { instances: 4, capacityRpm: 300, rpm: 1000 },
  from: { id: 'v1', label: 'v1', errorPermille: 1, p95Ms: 180, startSeconds: 90 },
  to: { id: 'v2', label: 'v2', errorPermille: 2, p95Ms: 200, startSeconds: 90 },
  strategy: { kind: 'rolling', maxSurge: 1, maxUnavailable: 0 },
  gate: { metric: 'error-rate', max: 5, minRequests: 400 },
  minutes: 10,
});
/** The same fleet with a faulty v2 (50 ‰) released as a canary 25% → 100%: the first gate fails and it rolls back. */
export const badCanary = (): RolloutScenario => ({ ...checkout(), to: { ...checkout().to, errorPermille: 50 },
  strategy: { kind: 'canary', steps: [{ weight: 25, holdMinutes: 2 }, { weight: 100, holdMinutes: 2 }] } });
/** v2 reads full_name instead of name: expand at 0, but the contract (drop name) at 5 comes while v1 still serves. */
export const schemaChange = (): RolloutScenario => ({ ...checkout(),
  from: { ...checkout().from, errorPermille: 0, requires: ['name'] }, to: { ...checkout().to, errorPermille: 0, requires: ['full_name'] },
  schema: ['id', 'name'], migrations: [{ at: 0, kind: 'expand', columns: ['full_name'] }, { at: 5, kind: 'contract', columns: ['name'] }] });
/** A flag in v2 (100 ‰ on its path) stays off during the rollout and opens to 20% at minute 6: 4 × 200 requests, 80 errors. */
export const flagged = (): RolloutScenario => ({
  fleet: { instances: 2, capacityRpm: 1000, rpm: 1000 },
  from: { id: 'v1', label: 'v1', errorPermille: 0, p95Ms: 150, startSeconds: 60 },
  to: { id: 'v2', label: 'v2', errorPermille: 0, p95Ms: 150, startSeconds: 60 },
  strategy: { kind: 'rolling', maxSurge: 1, maxUnavailable: 0 },
  flags: [{ id: 'new-checkout', label: '新結帳流程', version: 'v2', errorPermille: 100, exposure: [{ at: 0, percent: 0 }, { at: 6, percent: 20 }] }],
  minutes: 10,
});

export const histories = (): HistoryExplorer[] => [
  { id: 'team-a', title: 'A 團隊：一週部署兩三次', description: '一次部署帶好幾個變更，等得比較久。', history: teamA() },
  { id: 'team-b', title: 'B 團隊：每天小批量部署', description: '每次只帶一個變更。', history: teamB() },
];
export const rollouts = (): RolloutExplorer[] => [
  { id: 'checkout', title: '結帳服務從 v1 更新到 v2', description: '切換策略，看執行個體、請求與錯誤怎麼變化。', scenario: checkout() },
  { id: 'bad-canary', title: '有問題的 v2 以金絲雀發布', description: '閘門在第一步就擋下錯誤率太高的新版本。', scenario: badCanary() },
  { id: 'schema', title: '資料庫結構的擴充與收縮', description: '收縮得太早，舊版本就讀不到它需要的欄位。', scenario: schemaChange() },
  { id: 'flag', title: '部署與發布分開：功能旗標', description: '新程式先上線但不開放，第 6 分鐘才開放 20%。', scenario: flagged() },
];

export const exercises = (): DevopsExercise[] => [
  { id: 'x-per-week', kind: 'number', title: '部署頻率', statement: 'A 團隊平均每週部署幾次？（四捨五入到小數點後一位）',
    blank: { id: 'f', label: '每週部署次數', query: { task: 'dora', history: 'team-a', metric: 'per-week' } },
    hints: ['部署次數 × 7 ÷ 天數。'], explanation: '5 次 × 7 ÷ 14 天 = 2.5 次。',
    mistakes: [{ answer: { value: '5' }, why: '寫的是兩週的總次數' }, { answer: { value: '2' }, why: '直接捨去小數' }] },
  { id: 'x-dora', kind: 'table', title: 'A 團隊的三個指標', statement: '算出 A 團隊的變更前置時間中位數、變更失敗率與失敗部署復原時間中位數（分鐘，四捨五入到整數）。',
    blanks: [
      { id: 'lead', label: '變更前置時間中位數（分鐘）', query: { task: 'dora', history: 'team-a', metric: 'lead-time-median' } },
      { id: 'cfr', label: '變更失敗率（%）', query: { task: 'dora', history: 'team-a', metric: 'change-fail-rate' } },
      { id: 'rec', label: '失敗部署復原時間中位數（分鐘）', query: { task: 'dora', history: 'team-a', metric: 'recovery-median' } },
    ],
    hints: ['前置時間以每個變更計算，不是每次部署。', '中位數個數是偶數時取中間兩個的平均，四捨五入。'],
    explanation: '8 個變更排序後中間兩個都是 120；2 ÷ 5 = 40%；復原時間 45 與 120 的平均 82.5 四捨五入為 83。',
    mistakes: [{ answer: { lead: '195', cfr: '40', rec: '83' }, why: '算成平均數，不是中位數' }, { answer: { lead: '120', cfr: '40', rec: '82' }, why: '82.5 直接捨去' },
      { answer: { lead: '120', cfr: '0.4', rec: '83' }, why: '失敗率要寫百分比' }, { answer: { lead: '120', cfr: '40', rec: '165' }, why: '把兩次的復原時間加總' }] },
  { id: 'x-best', kind: 'choice', title: '誰的前置時間短', statement: '哪一個團隊的變更前置時間中位數比較短？',
    query: { task: 'dora-best', histories: ['team-a', 'team-b'], metric: 'lead-time-median' },
    options: [{ value: 'team-a', label: 'A 團隊' }, { value: 'team-b', label: 'B 團隊' }],
    hints: ['分別排序兩個團隊的前置時間，取中位數。'], explanation: 'B 團隊的中位數 60 分鐘，A 團隊 120 分鐘：小批量讓變更更快上線。',
    mistakes: [{ answer: { choice: '0' }, why: '只看部署次數少的一方' }] },
  { id: 'x-dropped', kind: 'number', title: '少一個就少一份容量', statement: '同一個結帳服務改用 maxSurge 0、maxUnavailable 1 的滾動更新，整個過程丟棄了幾個請求？',
    blank: { id: 'dropped', label: '丟棄的請求', query: { task: 'rollout', rollout: 'checkout', metric: 'dropped', strategy: { kind: 'rolling', maxSurge: 0, maxUnavailable: 1 } } },
    hints: ['同時只有 3 個執行個體承接請求，每個最多 300 個。', '數一數有幾分鐘容量不足。'],
    explanation: '更新期間（第 0–7 分鐘）只有 3 個就緒，容量 900，每分鐘丟棄 100 個，共 800 個。',
    mistakes: [{ answer: { value: '100' }, why: '只算了一分鐘' }, { answer: { value: '0' }, why: '以為容量永遠足夠' }] },
  { id: 'x-canary', kind: 'table', title: '閘門擋下的金絲雀', statement: '有問題的 v2 以 25% → 100% 的金絲雀發布：第 1 步的閘門看到幾個錯誤？第幾分鐘回滾？在第幾步中止？',
    blanks: [
      { id: 'errors', label: '第 1 步觀察期間 v2 的錯誤', query: { task: 'rollout', rollout: 'bad-canary', metric: 'gate-errors', step: 1 } },
      { id: 'at', label: '回滾的分鐘', query: { task: 'rollout', rollout: 'bad-canary', metric: 'rolled-back-at' } },
      { id: 'step', label: '中止的步驟', query: { task: 'rollout', rollout: 'bad-canary', metric: 'aborted-step' } },
    ],
    hints: ['v2 第 2 分鐘才就緒，觀察期間是第 2、3 分鐘，每分鐘 250 個請求。'], explanation: '500 個請求的 50‰ 是 25 個錯誤，超過 5‰；第 4 分鐘流量切回 v1。',
    mistakes: [{ answer: { errors: '12', at: '4', step: '1' }, why: '只算了一分鐘的錯誤' }, { answer: { errors: '25', at: '2', step: '1' }, why: '以為一就緒就判定' }] },
  { id: 'x-outcome', kind: 'field', title: '結果', statement: '有問題的 v2 這次部署的結果是什麼？',
    blank: { id: 'o', label: '結果（完成或回滾）', query: { task: 'rollout', rollout: 'bad-canary', metric: 'outcome' } },
    hints: ['看閘門的判定。'], explanation: '第 1 步就未通過，所以回滾。', mistakes: [{ answer: { value: '完成' }, why: '沒有看閘門' }] },
  { id: 'x-strategy', kind: 'choice', title: '哪個策略最省', statement: '滾動更新（1／0）、藍綠部署（驗證 1 分鐘、保留 3 分鐘）、金絲雀（25% → 100%，各 2 分鐘）中，哪一個額外的執行個體分鐘最少？',
    query: { task: 'rollout-best', rollout: 'checkout', metric: 'extra-instance-minutes', candidates: [
      { id: 'rolling', strategy: { kind: 'rolling', maxSurge: 1, maxUnavailable: 0 } },
      { id: 'blue-green', strategy: { kind: 'blue-green', verifyMinutes: 1, keepBlueMinutes: 3 } },
      { id: 'canary', strategy: { kind: 'canary', steps: [{ weight: 25, holdMinutes: 2 }, { weight: 100, holdMinutes: 2 }] } }] },
    options: [{ value: 'rolling', label: '滾動更新' }, { value: 'blue-green', label: '藍綠部署' }, { value: 'canary', label: '金絲雀發布' }],
    hints: ['藍綠部署同時跑兩套完整的環境。'], explanation: '滾動 8、金絲雀 20、藍綠 24 個執行個體分鐘。',
    mistakes: [{ answer: { choice: '1' }, why: '以為切換最快就最省' }] },
  { id: 'x-plan', kind: 'rollout-plan', title: '不丟請求的滾動更新', statement: '設定滾動更新的參數：不能丟棄任何請求、同時最多 5 個執行個體，並在第 8 分鐘以前完成。',
    plan: { rollout: 'checkout', strategy: 'rolling', constraints: { maxDropped: 0, maxPeakInstances: 5, completeBy: 8 }, reference: { kind: 'rolling', maxSurge: 1, maxUnavailable: 0 } },
    hints: ['少掉任何一個執行個體，容量就不夠。'], explanation: '多開一個、不減少可用的執行個體：maxSurge 1、maxUnavailable 0。',
    mistakes: [{ answer: { maxSurge: '0', maxUnavailable: '1' }, why: '少一個就丟棄請求' }, { answer: { maxSurge: '2', maxUnavailable: '0' }, why: '同時跑 6 個，超過上限' }] },
];

export const devopsContent = (): DevopsLessonContent => ({ histories: histories(), rollouts: rollouts(), exercises: exercises() });

const p = (text: string) => ({ type: 'p' as const, text });
/** A complete CICD10-shaped lesson (devops-explorer, deployment-simulator) that passes validateContent and publishProblems. */
export const devopsLesson = (): LessonContent => ({
  lessonId: 'CICD10' as LessonContent['lessonId'],
  motivation: '同一個新版本，用不同的部署策略上線，影響的使用者、需要的機器與出錯時能多快回頭都不一樣；先在模擬器裡比較，再決定正式環境怎麼做。',
  sections: [
    { id: 'dora', title: '先量測：交付表現', blocks: [
      p('部署頻率、變更前置時間、變更失敗率與失敗部署復原時間，是描述交付表現的四個 DORA 指標。下面兩個團隊的紀錄都是示意資料，指標由瀏覽器依固定的規則計算。'),
      { type: 'example', id: 'team-a' }, { type: 'example', id: 'team-b' }] },
    { id: 'strategies', title: '滾動更新、藍綠部署與金絲雀發布', blocks: [
      p('滾動更新一次換掉幾個執行個體，maxSurge 決定能多開幾個、maxUnavailable 決定能少幾個；藍綠部署先準備一整套新環境再做流量切換；金絲雀發布先讓一小部分流量試用新版本，閘門通過才擴大。'),
      { type: 'example', id: 'checkout' }, { type: 'example', id: 'bad-canary' }] },
    { id: 'compat', title: '資料庫相容性與功能旗標', blocks: [
      p('新舊版本會同時上線一段時間，所以資料庫結構要先擴充、等舊版本完全下線才收縮，這就是資料庫相容性的要求；功能旗標則讓程式先部署、功能之後才開放。'),
      { type: 'example', id: 'schema' }, { type: 'example', id: 'flag' }] },
  ],
  examples: [], exercises: [],
  quiz: [
    { id: 'q1', prompt: 'maxUnavailable 設為 1、maxSurge 設為 0 時，更新期間會怎樣？', options: ['同時少一個執行個體，容量變小', '同時多一個執行個體', '所有執行個體一起重新啟動'], answer: 0, explanation: '不能多開，只能先停掉一個舊的再啟動新的，所以更新期間的容量比平常少一個執行個體。' },
    { id: 'q2', prompt: '藍綠部署的主要成本是什麼？', options: ['短時間內要準備兩套完整的環境', '每次都會丟棄請求', '不能回滾'], answer: 0, explanation: '綠色環境要和藍色一樣大，切換後還要保留藍色一段時間以便立即回滾，所以要付出額外的機器。' },
    { id: 'q3', prompt: '金絲雀發布的閘門為什麼要求最少的請求數？', options: ['樣本太少時錯誤率不可靠', '為了讓部署更快', '為了減少執行個體'], answer: 0, explanation: '只有幾十個請求時，一兩個錯誤就會讓錯誤率大幅跳動，判斷不可靠，所以樣本不足就不放行。' },
    { id: 'q4', prompt: '刪除舊欄位（收縮）應該在什麼時候做？', options: ['舊版本完全下線、不再需要回滾之後', '部署開始的同時', '新增欄位之前'], answer: 0, explanation: '舊版本還在服務時刪掉它需要的欄位，舊版本承接的請求會全部失敗，回滾也救不回來。' },
  ],
  devops: devopsContent(),
});

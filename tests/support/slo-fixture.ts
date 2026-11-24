import type { LessonContent } from '@/content/curriculum/schema';
import type { SloScenario } from '@/lib/devops/slo';
import type { DevopsExercise, DevopsLessonContent, SloExplorer } from '@/lib/devops/types';

/*
 * CICD-0 D6: SLO data checked by hand (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.6). Only for tests; no real lesson
 * file uses it.
 *
 * tiny: 12 one-minute buckets of 1,000 events, 99% over a 12-minute window (the period), bad per bucket
 *   2 3 5 40 50 30 5 2 20 3 2 2 (164 in all), incident [3, 6).
 * - Budget ⌊12,000 × 100 ÷ 10,000⌋ = 120. Consumed: 2, 5, 10, 50, 100, 130 (≥ 120: used up at bucket 5, minute 5) … 164.
 *   After bucket 4: 100 ÷ 120 = 83.3%, remaining 16.7%; at the end 164 ÷ 120 = 136.7%, remaining −44 events, −36.7%.
 * - SLI 11,836 ÷ 12,000 = 98.633% (missed); buckets 0–2: 2,990 ÷ 3,000 = 99.667%.
 * - Burn rate (bad ÷ total ÷ 1%): one bucket = bad ÷ 10 (bucket 3: 4.0, bucket 8: 2.0); buckets 2–4: 95 ÷ 3,000 = 3.2;
 *   5-bucket sums from bucket 4: 100, 128, 130, 127, 107, 60, 32, 29 → 2.0, 2.6, 2.6, 2.5, 2.1, 1.2, 0.6, 0.6;
 *   3-bucket sums from bucket 2: 10, 48, 95, 120, 85, 37, 27, 25, 25, 7 → 0.3, 1.6, 3.2, 4.0, 2.8, 1.2, 0.9, 0.8, 0.8, 0.2.
 * - 5 min / 1 min ≥ 2.0 (`page`): fires at 4–5 (2.0 ≥ 2.0 exactly) and 8 (2.1 and 2.0): 2 notifications, 1 false alert,
 *   delay 1. 3 min / 1 min ≥ 2.0: fires at 4–5 only (bucket 8's 3-minute burn is 0.9). 1 / 1 ≥ 2.0: 3–5 and 8, delay 0,
 *   1 false alert. 5 / 1 ≥ 3.0: never (the 5-minute burn peaks at 2.6), the incident is missed.
 * - SLA 98.5% (below 98.5%: 10%, below 95%: 25%, below 90%: 100%): 98.633% → 0; buckets 3–5: 2,880 ÷ 3,000 = 96% → 10%.
 *
 * month: 720 hourly buckets (30 days, the window), 10,000 events an hour, 99.9%; bad 5 an hour, 605 in hours 300–303,
 *   10 from hour 500 on (generated from shapes without noise). Incidents [300, 304) and [500, 720).
 * - Bad 300 × 5 + 4 × 605 + 196 × 5 + 220 × 10 = 1,500 + 2,420 + 980 + 2,200 = 7,100; budget ⌊7,200,000 × 10 ÷ 10,000⌋
 *   = 7,200; consumed 98.6%, remaining 100 (1.4%); SLI 7,192,900 ÷ 7,200,000 = 99.901% (met). Burn 0.5, 60.5, 1.0.
 * - After hour 303: consumed 3,920 (54.4%); hours left at the last hour's rate 3,280 × 60 ÷ (605 × 60) = 5.4, at the last
 *   6 hours' 3,280 × 360 ÷ (2,430 × 60) = 8.1; after hour 719 at the last day's 100 × 1,440 ÷ (240 × 60) = 10.0.
 * - `fast` 1 h / 1 h ≥ 14.4: 300–303, misses the slow burn. `ticket` 24 h / 6 h ≥ 1.0: 300–308 (the 6-hour window holds
 *   the spike until 308), then from 523 (the first 24 hours all at 10: 1.0 ≥ 1.0) to the end: delays 0 and 23 h = 1,380 min.
 * - SLA 99.5% (below 99.5%: 10%, below 99%: 25%, below 95%: 50%): hours 300–323: 2,520 bad of 240,000 = 98.95% → 25%.
 */

const bad = [2, 3, 5, 40, 50, 30, 5, 2, 20, 3, 2, 2];
export const tiny = (): SloScenario => ({
  service: 'checkout', sli: '回應碼不是 5xx 的請求', bucketMinutes: 1, buckets: 12,
  total: { values: Array(12).fill(1000) }, bad: { values: bad },
  objective: { targetPermyriad: 9900, windowMinutes: 12 },
  sla: { targetPermyriad: 9850, credits: [{ belowPermyriad: 9850, creditPercent: 10 }, { belowPermyriad: 9500, creditPercent: 25 }, { belowPermyriad: 9000, creditPercent: 100 }] },
  incidents: [{ id: 'i1', label: '結帳錯誤', start: 3, end: 6 }],
  alerts: [{ id: 'page', label: '快速消耗（5 分鐘／1 分鐘）', longMinutes: 5, shortMinutes: 1, factorTenths: 20, severity: 'critical' }],
});

export const month = (): SloScenario => ({
  service: 'payments', sli: '300 ms 內成功回應的請求', bucketMinutes: 60, buckets: 720,
  total: { shape: { seed: 1, baseline: 10000 } },
  bad: { shape: { seed: 2, baseline: 5, changes: [{ kind: 'spike', at: 300, minutes: 4, delta: 600 }, { kind: 'step', at: 500, delta: 5 }] } },
  objective: { targetPermyriad: 9990, windowMinutes: 43200 },
  sla: { targetPermyriad: 9950, credits: [{ belowPermyriad: 9950, creditPercent: 10 }, { belowPermyriad: 9900, creditPercent: 25 }, { belowPermyriad: 9500, creditPercent: 50 }] },
  incidents: [{ id: 'spike', label: '付款服務逾時', start: 300, end: 304 }, { id: 'slow', label: '新版本的緩慢錯誤', start: 500, end: 720 }],
  alerts: [
    { id: 'fast', label: '快速消耗（1 小時）', longMinutes: 60, shortMinutes: 60, factorTenths: 144, severity: 'critical' },
    { id: 'ticket', label: '緩慢消耗（24 小時／6 小時）', longMinutes: 1440, shortMinutes: 360, factorTenths: 10, severity: 'warning' },
  ],
});

/** A day of 5-minute buckets with noise, the first day of a 30-day window (windowTotal stated). */
export const shopDay = (): SloScenario => ({
  service: 'shop', sli: '成功的結帳', bucketMinutes: 5, buckets: 288,
  total: { shape: { seed: 7, baseline: 3000, noise: 300 } },
  bad: { shape: { seed: 8, baseline: 2, noise: 2, changes: [{ kind: 'spike', at: 100, minutes: 6, delta: 150 }] } },
  objective: { targetPermyriad: 9990, windowMinutes: 43200, windowTotal: 25_920_000 },
  incidents: [{ id: 'cart', label: '購物車服務重啟', start: 100, end: 106 }],
});

export const sloExplorers = (): SloExplorer[] => [
  { id: 'checkout-slo', title: '結帳的 SLO', description: '十二分鐘、每分鐘 1,000 個請求，目標 99%。', slo: tiny() },
  { id: 'monthly-slo', title: '付款服務的一個月', description: '30 天、每小時一個時段，目標 99.9%，有 SLA。', slo: month() },
  { id: 'shop-slo', title: '商店的第一天', description: '每 5 分鐘一個時段，30 天視窗的第一天。', slo: shopDay() },
];

export const sloExercises = (): DevopsExercise[] => [
  { id: 's-budget', kind: 'table', title: '錯誤預算', statement: '結帳的 SLO 是 99%，這 12 分鐘有 12,000 個請求。',
    blanks: [
      { id: 'budget', label: '錯誤預算（個事件）', query: { task: 'slo', slo: 'checkout-slo', metric: 'budget-events' } },
      { id: 'sli', label: '整段的 SLI（%，三位小數）', query: { task: 'slo', slo: 'checkout-slo', metric: 'sli' } },
      { id: 'used', label: '第 4 分鐘結束時用掉的預算（%，一位小數）', query: { task: 'slo', slo: 'checkout-slo', metric: 'consumed-pct', at: 4 } },
      { id: 'out', label: '預算在第幾分鐘用完', query: { task: 'slo', slo: 'checkout-slo', metric: 'exhausted-at' } },
    ],
    hints: ['錯誤預算 = 全部事件 × (1 − 目標)。'], explanation: '12,000 × 1% = 120；第 5 分鐘累計 130 個壞事件，超過 120。',
    mistakes: [{ answer: { budget: '1200', sli: '98.633', used: '83.3', out: '5' }, why: '把 1% 算成 10%' },
      { answer: { budget: '120', sli: '98.633', used: '83.3', out: '6' }, why: '寫成用完之後的下一分鐘' }] },
  { id: 's-burn', kind: 'table', title: '消耗率', statement: '算出結帳在不同視窗的消耗率。',
    blanks: [
      { id: 'b1', label: '第 3 分鐘、1 分鐘視窗', query: { task: 'slo', slo: 'checkout-slo', metric: 'burn-rate-at', at: 3, window: 1 } },
      { id: 'b3', label: '第 4 分鐘、3 分鐘視窗', query: { task: 'slo', slo: 'checkout-slo', metric: 'burn-rate-at', at: 4, window: 3 } },
      { id: 'b5', label: '第 4 分鐘、5 分鐘視窗', query: { task: 'slo', slo: 'checkout-slo', metric: 'burn-rate-at', at: 4, window: 5 } },
    ],
    hints: ['消耗率 = 錯誤率 ÷ (1 − 目標)。'], explanation: '40 ÷ 1,000 ÷ 1% = 4.0；95 ÷ 3,000 ÷ 1% = 3.2；100 ÷ 5,000 ÷ 1% = 2.0。',
    mistakes: [{ answer: { b1: '0.04', b3: '0.032', b5: '0.02' }, why: '只算了錯誤率，沒有除以允許的比例' }] },
  { id: 's-hours', kind: 'number', title: '預算還能撐多久', statement: '付款服務第 303 小時結束時，照最近 1 小時的壞事件速率，剩下的預算還能撐幾小時？',
    blank: { id: 'h', label: '小時（一位小數）', query: { task: 'slo', slo: 'monthly-slo', metric: 'hours-left', at: 303, window: 60 } },
    hints: ['剩下的預算 ÷ 每小時的壞事件。'], explanation: '(7,200 − 3,920) ÷ 605 = 5.4 小時。', mistakes: [{ answer: { value: '11.9' }, why: '用了整個預算，忘了扣掉已經用掉的' }] },
  { id: 's-credit', kind: 'choice', title: 'SLA 的補償', statement: '如果 SLA 只看第 300–323 小時這一天，補償是多少？',
    query: { task: 'slo', slo: 'monthly-slo', metric: 'sla-credit', from: 300, to: 324 },
    options: [{ value: '0', label: '不用補償' }, { value: '10', label: '10%' }, { value: '25', label: '25%' }, { value: '50', label: '50%' }],
    hints: ['先算這一天的可用度，再對照補償表。'], explanation: '2,520 ÷ 240,000 = 1.05% 的壞事件，可用度 98.95%，落在「低於 99%」。',
    mistakes: [{ answer: { choice: '1' }, why: '只對照了第一段' }] },
  { id: 's-alert', kind: 'table', title: '課程的消耗率告警', statement: '結帳的「快速消耗」告警（5 分鐘與 1 分鐘的消耗率都 ≥ 2）。',
    blanks: [
      { id: 'n', label: '通知（次）', query: { task: 'burn', slo: 'checkout-slo', rule: 'page', metric: 'notifications' } },
      { id: 'f', label: '誤報（次）', query: { task: 'burn', slo: 'checkout-slo', rule: 'page', metric: 'false-alerts' } },
      { id: 'd', label: '偵測延遲（分鐘）', query: { task: 'burn', slo: 'checkout-slo', rule: 'page', metric: 'detection-delay', incident: 'i1' } },
    ],
    hints: ['兩個視窗都要達到門檻才觸發。'], explanation: '第 4–5 分鐘與第 8 分鐘觸發；第 8 分鐘不在事故期間，是誤報。',
    mistakes: [{ answer: { n: '1', f: '0', d: '1' }, why: '只看了事故期間' }] },
  { id: 's-ticket', kind: 'number', title: '緩慢的消耗', statement: '付款服務的「緩慢消耗」告警，偵測到「新版本的緩慢錯誤」花了幾分鐘？',
    blank: { id: 'd', label: '偵測延遲（分鐘）', query: { task: 'burn', slo: 'monthly-slo', rule: 'ticket', metric: 'detection-delay', incident: 'slow' } },
    hints: ['24 小時的視窗要整個都是新的錯誤率，消耗率才到 1.0。'], explanation: '第 523 小時才觸發：23 小時 = 1,380 分鐘。',
    mistakes: [{ answer: { value: '23' }, why: '答成小時' }] },
  { id: 's-plan', kind: 'burn-alert', title: '設計消耗率告警', statement: '為結帳設計一個消耗率告警：事故開始後 1 分鐘內觸發，不能有誤報。',
    burn: { slo: 'checkout-slo', constraints: { detectWithin: 1, maxFalseAlerts: 0 }, reference: { longMinutes: 3, shortMinutes: 1, factorTenths: 20 } },
    hints: ['長視窗太長會讓事故後的小尖峰也觸發。', '門檻太高會漏掉事故。'], explanation: '3 分鐘與 1 分鐘、門檻 2：第 4 分鐘觸發，第 8 分鐘的 3 分鐘消耗率只有 0.9。',
    mistakes: [
      { answer: { long: '5', short: '1', factor: '2' }, why: '5 分鐘的視窗在第 8 分鐘仍有 2.1，誤報一次' },
      { answer: { long: '5', short: '1', factor: '3' }, why: '門檻太高，漏掉事故' },
      { answer: { long: '1', short: '1', factor: '2' }, why: '只有一個視窗，小尖峰也觸發' },
    ] },
];

export const sloContent = (): DevopsLessonContent => ({ slos: sloExplorers(), exercises: sloExercises() });

const p = (text: string) => ({ type: 'p' as const, text });
/** A monitoring-dashboard lesson's devops-explorer part with SLOs only (KUB14's concepts). */
export const sloLesson = (): LessonContent => ({
  lessonId: 'CICD11' as LessonContent['lessonId'],
  motivation: '「可靠」要有數字：SLI 量測使用者感受到的好壞，SLO 是目標，兩者之間的差距就是可以花的錯誤預算。',
  sections: [
    { id: 'budget', title: 'SLI、SLO 與錯誤預算', blocks: [
      p('SLI 是好事件占全部事件的比例；SLO 是 SLI 在一段視窗內的目標；錯誤預算是目標允許的壞事件，用完了就該把心力從新功能移到可靠度。'),
      { type: 'example', id: 'checkout-slo' }] },
    { id: 'burn', title: '消耗率與多視窗告警', blocks: [
      p('消耗率 1 代表剛好在視窗結束時用完預算；消耗率 14.4 代表一個 30 天的預算，大約兩天就會用完。告警同時看長、短兩個視窗：長視窗確認問題夠大、值得叫醒人，短視窗讓問題停止之後告警很快恢復，不會一直響。'),
      { type: 'example', id: 'monthly-slo' }] },
    { id: 'sla', title: 'SLA', blocks: [
      p('SLA 是對客戶的承諾，通常寫在合約裡，目標比內部的 SLO 寬鬆；可用度低於承諾時，依補償表退還一部分的費用。內部的 SLO 比較嚴格，讓團隊在違反對客戶的承諾之前，就先看到錯誤預算快用完了。'),
      { type: 'example', id: 'shop-slo' }] },
  ],
  examples: [], exercises: [],
  quiz: [
    { id: 'q1', prompt: '99.9% 的 SLO、一個月 1,000,000 個請求，錯誤預算是多少？', options: ['1,000 個壞請求', '999,000 個', '100 個'], answer: 0, explanation: '1,000,000 × 0.1% = 1,000。' },
    { id: 'q2', prompt: '消耗率 2 代表什麼？', options: ['照這個速率，預算在半個視窗內用完', '錯誤率是 2%', '已經用掉兩倍的預算'], answer: 0, explanation: '消耗率是錯誤率除以允許的比例；2 倍的速度，半個視窗就用完。' },
    { id: 'q3', prompt: '為什麼消耗率告警要同時看長、短兩個視窗？', options: ['長視窗確認問題夠大，短視窗讓告警很快恢復', '為了多發一次通知', '短視窗比較便宜'], answer: 0, explanation: '只看長視窗，問題停止後還會一直觸發；只看短視窗，小尖峰也會觸發。' },
    { id: 'q4', prompt: 'SLA 和 SLO 的關係通常是？', options: ['SLA 的目標比 SLO 寬鬆', 'SLA 比 SLO 嚴格', '兩者一定相同'], answer: 0, explanation: '內部的 SLO 較嚴格，在違反對客戶的承諾之前就先處理。' },
  ],
  devops: sloContent(),
});

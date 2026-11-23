import type { LessonContent } from '@/content/curriculum/schema';
import type { Dashboard } from '@/lib/devops/dashboard';
import type { DashboardExplorer, DevopsExercise, DevopsLessonContent } from '@/lib/devops/types';

/*
 * CICD-0 D3: monitoring-dashboard data checked by hand (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.3). Only for tests;
 * no real lesson file uses it.
 */

/**
 * tiny, 12 minutes, one errors series written out: 1 1 2 9 9 9 1 1 8 1 1 1 (‰), one incident [3, 6).
 * - spike: errors > 5, for 0 → firing 3–5, resolved 6, firing 8, resolved 9: 2 notifications, 1 false alert (8),
 *   the incident detected at 3 (delay 0).
 * - patient: errors > 5, for 2 → pending 3, 4, firing 5, resolved 6; pending 8 never fires: 1 notification, delay 2.
 * - smooth: 3-minute average > 5 → sums 4 (t 2), 12, 20, 27, 19, 11, 10, 10, 10, 3: holds at 4, 5, 6 (20 ÷ 3 = 6.7,
 *   9, 6.3): firing 4–6, resolved 7, delay 1, the spike at 8 is averaged away (10 ÷ 3 = 3.3). No value at minutes 0, 1.
 */
export const tiny = (): Dashboard => ({
  service: 'checkout', minutes: 12,
  series: [{ id: 'err', label: '錯誤率', unit: '‰', signal: 'errors', values: [1, 1, 2, 9, 9, 9, 1, 1, 8, 1, 1, 1] }],
  incidents: [{ id: 'i1', label: '結帳失敗', start: 3, end: 6 }],
  rules: [
    { id: 'spike', label: '錯誤率一超過就告警', series: 'err', op: '>', threshold: 5, forMinutes: 0, severity: 'critical' },
    { id: 'patient', label: '錯誤率持續 2 分鐘', series: 'err', op: '>', threshold: 5, forMinutes: 2, severity: 'warning' },
    { id: 'smooth', label: '錯誤率 3 分鐘平均', series: 'err', op: '>', threshold: 5, window: { agg: 'avg', minutes: 3 }, forMinutes: 0, severity: 'critical' },
  ],
});

/**
 * api, 180 minutes, four generated series (one per golden signal). Incident A [60, 68): a bad release, errors +40 ‰,
 * latency +220 ms, traffic −300. Incident B [130, 145): the database connection pool runs out, errors ramp up by 20 ‰
 * over 130–135, CPU ramps up from 120. At minute 100 a one-minute blip (+25 ‰) that is not an incident.
 */
export const api = (): Dashboard => ({
  service: 'api', minutes: 180,
  series: [
    { id: 'p95', label: 'p95 延遲', unit: 'ms', signal: 'latency', shape: { seed: 11, baseline: 180, noise: 12, changes: [
      { kind: 'spike', at: 60, minutes: 8, delta: 220 }, { kind: 'ramp', from: 130, to: 140, delta: 150 }, { kind: 'step', at: 145, delta: -150 }] } },
    { id: 'rpm', label: '每分鐘請求', unit: '個', signal: 'traffic', shape: { seed: 12, baseline: 1200, noise: 60, changes: [{ kind: 'spike', at: 60, minutes: 8, delta: -300 }] } },
    { id: 'errors', label: '錯誤率', unit: '‰', signal: 'errors', shape: { seed: 13, baseline: 3, noise: 2, changes: [
      { kind: 'spike', at: 60, minutes: 8, delta: 40 }, { kind: 'spike', at: 100, minutes: 1, delta: 25 },
      { kind: 'ramp', from: 130, to: 136, delta: 20 }, { kind: 'step', at: 145, delta: -20 }] } },
    { id: 'cpu', label: '資料庫 CPU', unit: '%', signal: 'saturation', shape: { seed: 14, baseline: 45, noise: 4, changes: [
      { kind: 'ramp', from: 120, to: 140, delta: 45 }, { kind: 'step', at: 145, delta: -45 }] } },
  ],
  incidents: [
    { id: 'a', label: '有問題的版本', start: 60, end: 68, usersPercent: 40, events: [
      { at: 62, kind: 'detected', text: '錯誤率告警觸發' }, { at: 65, kind: 'acknowledged', text: '值班工程師接手' },
      { at: 68, kind: 'mitigated', text: '回滾到上一版' }, { at: 90, kind: 'resolved', text: '確認恢復後結案' }] },
    { id: 'b', label: '資料庫連線耗盡', start: 130, end: 145, usersPercent: 3, events: [
      { at: 134, kind: 'detected', text: '錯誤率告警觸發' }, { at: 138, kind: 'acknowledged', text: '值班工程師接手' },
      { at: 140, kind: 'note', text: '發現連線池滿了' }, { at: 145, kind: 'mitigated', text: '重新啟動並調大連線池' }, { at: 170, kind: 'resolved', text: '結案' }] },
  ],
  rules: [
    { id: 'noisy', label: '錯誤率超過 10‰ 立即告警', series: 'errors', op: '>', threshold: 10, forMinutes: 0, severity: 'critical' },
    { id: 'slow', label: '錯誤率 10 分鐘平均超過 10‰', series: 'errors', op: '>', threshold: 10, window: { agg: 'avg', minutes: 10 }, forMinutes: 5, severity: 'critical' },
  ],
  severity: {
    rows: [{ label: '大量使用者（30% 以上）', minUsersPercent: 30 }, { label: '部分使用者（5% 以上）', minUsersPercent: 5 }, { label: '少數使用者', minUsersPercent: 0 }],
    columns: [{ label: '30 分鐘以上', minMinutes: 30 }, { label: '10–29 分鐘', minMinutes: 10 }, { label: '10 分鐘以內', minMinutes: 0 }],
    levels: [['SEV1', 'SEV1', 'SEV2'], ['SEV2', 'SEV2', 'SEV3'], ['SEV3', 'SEV3', 'SEV4']],
  },
});

export const dashboards = (): DashboardExplorer[] => [
  { id: 'tiny', title: '十二分鐘的錯誤率', description: '同一段資料，三條規則：立即、持續 2 分鐘、3 分鐘平均。', dashboard: tiny() },
  { id: 'api', title: 'API 服務的三個小時', description: '四個黃金訊號、兩次事故與一次短暫的尖峰。', dashboard: api() },
  { id: 'api-slow', title: '同一段資料，慢一點的規則', description: '從 10 分鐘平均、持續 5 分鐘的規則開始：沒有誤報，但偵測慢了。', dashboard: { ...api(), rules: [...api().rules!].reverse() } },
];

/**
 * Exercises on the two dashboards. api's rules (computed values, checked in tests/devops-capability.test.ts):
 * - noisy (errors > 10, for 0): fires 60–67, 100 (the blip), 131–144 → 3 notifications, 1 false alert, delays 0 and 1.
 * - slow (10-minute average > 10, for 5): fires 66–75, 140–150 → 2 notifications, no false alert, delays 6 and 10.
 * - errors > 10 for 1 (the alert-rule reference): fires 61–67, 132–144 → delays 1 and 2, no false alert.
 */
export const dashboardExercises = (): DevopsExercise[] => [
  { id: 'x-noisy', kind: 'table', title: '一超過就告警', statement: '用「錯誤率超過 10‰ 立即告警」這條規則：一共發出幾次通知？其中幾次是誤報？「資料庫連線耗盡」的偵測延遲是幾分鐘？',
    blanks: [
      { id: 'n', label: '通知次數', query: { task: 'alert', dashboard: 'api', rule: 'noisy', metric: 'notifications' } },
      { id: 'f', label: '誤報次數', query: { task: 'alert', dashboard: 'api', rule: 'noisy', metric: 'false-alerts' } },
      { id: 'd', label: '「資料庫連線耗盡」的偵測延遲（分鐘）', query: { task: 'alert', dashboard: 'api', rule: 'noisy', metric: 'detection-delay', incident: 'b' } },
    ],
    hints: ['看狀態列：每一段觸發中是一次通知。', '觸發期間沒有和任何事故重疊，就是誤報。'],
    explanation: '第 60、100、131 分鐘各觸發一次；第 100 分鐘的尖峰只有一分鐘，不是事故。錯誤率在第 131 分鐘才超過 10‰，事故第 130 分鐘開始。',
    mistakes: [{ answer: { n: '2', f: '0', d: '1' }, why: '漏算了第 100 分鐘的尖峰' }, { answer: { n: '3', f: '1', d: '0' }, why: '以為事故一開始就觸發' }] },
  { id: 'x-pending', kind: 'field', title: '等待中', statement: '十二分鐘的錯誤率：「錯誤率持續 2 分鐘」這條規則在第 4 分鐘是什麼狀態？',
    blank: { id: 's', label: '第 4 分鐘的狀態', query: { task: 'alert', dashboard: 'tiny', rule: 'patient', metric: 'state-at', minute: 4 } },
    hints: ['條件從第 3 分鐘開始成立。'], explanation: '條件成立了 2 分鐘（第 3、4 分鐘），還沒超過「持續 2 分鐘」，所以是等待中；第 5 分鐘才觸發。',
    mistakes: [{ answer: { value: '觸發中' }, why: '忘了持續時間' }] },
  { id: 'x-average', kind: 'number', title: '視窗平均', statement: '「錯誤率 3 分鐘平均」在第 4 分鐘的值是多少？（四捨五入到小數點後一位）',
    blank: { id: 'v', label: '第 4 分鐘的 3 分鐘平均（‰）', query: { task: 'alert', dashboard: 'tiny', rule: 'smooth', metric: 'value-at', minute: 4 } },
    hints: ['視窗是第 2、3、4 分鐘。'], explanation: '(2 + 9 + 9) ÷ 3 = 6.67，四捨五入為 6.7。',
    mistakes: [{ answer: { value: '9' }, why: '只看了第 4 分鐘' }, { answer: { value: '6.6' }, why: '直接捨去' }] },
  { id: 'x-signals', kind: 'table', title: '黃金訊號', statement: '把 API 服務的四條時間序列各歸到一個黃金訊號（延遲、流量、錯誤、飽和度）。',
    blanks: [
      { id: 'p95', label: 'p95 延遲', query: { task: 'series', dashboard: 'api', series: 'p95', metric: 'signal' } },
      { id: 'rpm', label: '每分鐘請求', query: { task: 'series', dashboard: 'api', series: 'rpm', metric: 'signal' } },
      { id: 'errors', label: '錯誤率', query: { task: 'series', dashboard: 'api', series: 'errors', metric: 'signal' } },
      { id: 'cpu', label: '資料庫 CPU', query: { task: 'series', dashboard: 'api', series: 'cpu', metric: 'signal' } },
    ],
    hints: ['飽和度是資源被用掉了多少。'], explanation: '回應時間是延遲、請求量是流量、失敗的比例是錯誤、資源使用率是飽和度。',
    mistakes: [{ answer: { p95: '延遲', rpm: '流量', errors: '錯誤', cpu: '流量' }, why: '把 CPU 當成流量' }] },
  { id: 'x-cpu', kind: 'choice', title: 'CPU 是哪一種訊號', statement: '「資料庫 CPU」屬於哪一個黃金訊號？',
    query: { task: 'series', dashboard: 'api', series: 'cpu', metric: 'signal' },
    options: [{ value: 'latency', label: '延遲' }, { value: 'traffic', label: '流量' }, { value: 'errors', label: '錯誤' }, { value: 'saturation', label: '飽和度' }],
    hints: ['資源快滿了，服務就會變慢。'], explanation: 'CPU 使用率描述資源有多滿，是飽和度。', mistakes: [{ answer: { choice: '1' }, why: '請求越多 CPU 越高，但它量的是資源' }] },
  { id: 'x-incident', kind: 'table', title: '事故時間線', statement: '從「有問題的版本」的事件算出偵測時間與恢復時間，並依矩陣判定嚴重等級。',
    blanks: [
      { id: 'ttd', label: '偵測時間（分鐘）', query: { task: 'incident', dashboard: 'api', incident: 'a', metric: 'time-to-detect' } },
      { id: 'ttr', label: '恢復時間（分鐘）', query: { task: 'incident', dashboard: 'api', incident: 'a', metric: 'time-to-recover' } },
      { id: 'sev', label: '嚴重等級', query: { task: 'incident', dashboard: 'api', incident: 'a', metric: 'severity' } },
    ],
    hints: ['恢復時間是影響使用者的期間，不是結案的時間。'], explanation: '第 60 分鐘開始、第 62 分鐘偵測到：2 分鐘；第 68 分鐘恢復：8 分鐘；40% 的使用者、10 分鐘以內：SEV2。',
    mistakes: [{ answer: { ttd: '2', ttr: '30', sev: 'SEV2' }, why: '把結案當成恢復' }, { answer: { ttd: '2', ttr: '8', sev: 'SEV1' }, why: '只看影響的人數' }] },
  { id: 'x-rule', kind: 'alert-rule', title: '有行動意義的告警', statement: '寫一條告警規則：每個事故都要在開始後 3 分鐘內觸發，而且不能有任何誤報。',
    plan: { dashboard: 'api', constraints: { detectWithin: 3, maxFalseAlerts: 0 }, reference: { series: 'errors', op: '>', threshold: 10, forMinutes: 1 } },
    hints: ['第 100 分鐘的尖峰只有一分鐘。', '平均的視窗太長，偵測就會太慢。'],
    explanation: '錯誤率超過 10‰ 並持續 1 分鐘：一分鐘的尖峰不會觸發，兩次事故分別延遲 1 與 2 分鐘。',
    mistakes: [
      { answer: { series: 'errors', op: '>', threshold: '10', agg: 'none', window: '', for: '0' }, why: '一超過就告警，尖峰也會叫醒人' },
      { answer: { series: 'errors', op: '>', threshold: '10', agg: 'avg', window: '10', for: '5' }, why: '視窗太長、等太久，偵測太慢' },
      { answer: { series: 'cpu', op: '>', threshold: '70', agg: 'none', window: '', for: '2' }, why: 'CPU 只看得到資料庫的事故' },
    ] },
];

export const dashboardContent = (): DevopsLessonContent => ({ dashboards: dashboards(), exercises: dashboardExercises() });

const p = (text: string) => ({ type: 'p' as const, text });
/** A complete CICD11-shaped lesson (devops-explorer, monitoring-dashboard) that passes validateContent and publishProblems. */
export const dashboardLesson = (): LessonContent => ({
  lessonId: 'CICD11' as LessonContent['lessonId'],
  motivation: '服務出問題時，最好是告警先通知你，而不是使用者；但告警太多、太吵，值班的人就會開始忽略它們。先在儀表板上練習讀指標、調整告警門檻。',
  sections: [
    { id: 'signals', title: '指標與四大黃金訊號', blocks: [
      p('指標是每分鐘量一次的數字。延遲、流量、錯誤與飽和度是常用的四大黃金訊號：先看這四個，就知道使用者有沒有受影響、系統還剩多少餘裕。儀表板把它們畫在同一條時間軸上。'),
      { type: 'example', id: 'api' }] },
    { id: 'alerts', title: '告警門檻與告警疲勞', blocks: [
      p('告警門檻決定什麼時候叫醒人：門檻太低、一超過就告警，短暫的尖峰也會發出通知，久了造成告警疲勞；持續時間與視窗平均能過濾雜訊，但會讓偵測變慢。'),
      { type: 'example', id: 'tiny' }] },
    { id: 'fatigue', title: '偵測速度與誤報的取捨', blocks: [
      p('同一段資料換一條規則：視窗越長、持續時間越久，誤報越少，偵測延遲也越長。好的告警門檻讓每一次通知都需要有人採取行動，又不會讓事故拖太久才被發現。'),
      { type: 'example', id: 'api-slow' }] },
  ],
  examples: [], exercises: [],
  quiz: [
    { id: 'q1', prompt: '每分鐘請求數屬於哪一個黃金訊號？', options: ['流量', '延遲', '飽和度'], answer: 0, explanation: '請求數描述系統收到多少工作量，是流量；延遲是每個請求花多久，飽和度是資源有多滿。' },
    { id: 'q2', prompt: '告警規則加上「持續 2 分鐘才觸發」的主要好處是什麼？', options: ['過濾只有一分鐘的尖峰，減少誤報', '讓偵測更快', '讓門檻自動調整'], answer: 0, explanation: '條件要連續成立超過持續時間才觸發，一分鐘的尖峰會停在等待中，不發通知；代價是偵測慢了幾分鐘。' },
    { id: 'q3', prompt: '為什麼告警太多是危險的？', options: ['值班的人開始忽略通知，真正的事故也被忽略', '監控系統會變慢', '儀表板會畫不出來'], answer: 0, explanation: '大量沒有行動意義的通知造成告警疲勞，值班的人習慣性地略過，真正需要處理的事故反而晚了才被發現。' },
    { id: 'q4', prompt: '偵測延遲是怎麼算的？', options: ['第一次觸發的分鐘減去事故開始的分鐘', '事故結束減去事故開始', '通知次數乘以持續時間'], answer: 0, explanation: '事故開始後，告警第一次進入觸發中的那一分鐘就是偵測到的時刻，兩者相減就是偵測延遲。' },
  ],
  devops: dashboardContent(),
});

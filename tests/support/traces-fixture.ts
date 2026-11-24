import type { LessonContent } from '@/content/curriculum/schema';
import type { LogSet } from '@/lib/devops/logs';
import type { TraceSet } from '@/lib/devops/traces';
import type { DevopsExercise, DevopsLessonContent, TracesExplorer } from '@/lib/devops/types';

/*
 * CICD-0 D5: distributed-trace data checked by hand (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.5). Only for tests; no
 * real lesson file uses it.
 */

export const T_OK = '4bf92f3577b34da6a3ce929d0e0e4736';
export const T_FAIL = '0af7651916cd43dd8448eb211c80319c';
export const T_PAR = 'f1e2d3c4b5a697887766554433221100';

/**
 * T_OK, a checkout of 400 ms (7 spans, ms from the start):
 *   a gateway POST /checkout [0, 400) · g auth auth.verify [2, 8) · b orders POST /orders [10, 310)
 *   · c orders db.query [20, 70) · f orders cache.get [30, 90) (overlaps c) · d payments POST /charge [80, 280)
 *   · e payments provider.charge [90, 270).
 * - Self time: a 400 − (6 + 300) = 94; b 300 − |[20, 90) ∪ [80, 280)| = 300 − 260 = 40; c 50; f 60; d 200 − 180 = 20; e 180; g 6.
 * - Critical path (back from 400): a 310–400 (90) → b 280–310 (30) → d 270–280 (10) → e 90–270 (180) → d 80–90 (10)
 *   → f 30–80 (50, clipped at d's start) → c 20–30 (10) → b 10–20 (10) → a 8–10 (2) → g 2–8 (6) → a 0–2 (2); 400 in all.
 *   By service: payments 200, orders 100, gateway 94, auth 6, so the bottleneck is payments; path services by start:
 *   gateway → auth → orders → payments.
 * T_FAIL, a checkout that times out (4 spans, all errors): a gateway [0, 5200) · b orders [5, 5155) · c payments
 *   [10, 5110) · d payments provider.charge [15, 5015). Self: 50, 50, 100, 5000; payments 5100 on the path.
 * T_PAR, a search with three calls in parallel: a search [0, 100) · b catalog [10, 70) · c pricing [10, 90) · d reviews
 *   [20, 70). Self a = 100 − 80 = 20; path a 90–100 → c 10–90 → a 0–10: search → pricing, pricing 80 ms, the bottleneck.
 * Head digits (the last 8 hex digits, r; kept when r × 1000 < ratio‰ × 2^32 = ratio‰ × 4,294,967,296):
 * - T_OK 0e0e4736 = 235,816,758: 235,816,758,000 < 100 × 2^32 = 429,496,729,600, kept by a 10% head.
 * - T_FAIL 1c80319c = 478,163,356: 478,163,356,000 ≥ 429,496,729,600 (dropped by 10%), < 200 × 2^32 = 858,993,459,200 (kept by 20%).
 * - T_PAR 33221100 = 857,870,592: 857,870,592,000 < 858,993,459,200, kept by 20% (just), dropped by 19.9%
 *   (199 × 2^32 = 854,698,491,904).
 * Tail digits (the first 8): T_FAIL 0af76519 = 183,985,433 (kept by a 5% rest: 183,985,433,000 < 50 × 2^32 = 214,748,364,800),
 * T_OK 4bf92f35 = 1,274,621,749 (dropped by 5%).
 */
export const written = (): TraceSet['traces'] => [
  { id: T_OK, spans: [
    { id: 'a000000000000001', service: 'gateway', name: 'POST /checkout', start: 0, duration: 400, kind: 'server', attributes: { 'http.route': '/checkout', user_id: 'u-7' } },
    { id: 'a000000000000007', parent: 'a000000000000001', service: 'auth', name: 'auth.verify', start: 2, duration: 6, kind: 'client' },
    { id: 'a000000000000002', parent: 'a000000000000001', service: 'orders', name: 'POST /orders', start: 10, duration: 300, kind: 'server' },
    { id: 'a000000000000003', parent: 'a000000000000002', service: 'orders', name: 'db.query', start: 20, duration: 50, kind: 'client' },
    { id: 'a000000000000006', parent: 'a000000000000002', service: 'orders', name: 'cache.get', start: 30, duration: 60, kind: 'client' },
    { id: 'a000000000000004', parent: 'a000000000000002', service: 'payments', name: 'POST /charge', start: 80, duration: 200, kind: 'server' },
    { id: 'a000000000000005', parent: 'a000000000000004', service: 'payments', name: 'provider.charge', start: 90, duration: 180, kind: 'client' },
  ] },
  { id: T_FAIL, spans: [
    { id: 'b000000000000001', service: 'gateway', name: 'POST /checkout', start: 0, duration: 5200, status: 'error', kind: 'server', attributes: { 'http.route': '/checkout', user_id: 'u-9' } },
    { id: 'b000000000000002', parent: 'b000000000000001', service: 'orders', name: 'POST /orders', start: 5, duration: 5150, status: 'error', kind: 'server' },
    { id: 'b000000000000003', parent: 'b000000000000002', service: 'payments', name: 'POST /charge', start: 10, duration: 5100, status: 'error', kind: 'server' },
    { id: 'b000000000000004', parent: 'b000000000000003', service: 'payments', name: 'provider.charge', start: 15, duration: 5000, status: 'error', kind: 'client', attributes: { timeout_ms: 5000 } },
  ] },
  { id: T_PAR, spans: [
    { id: 'c000000000000001', service: 'search', name: 'GET /search', start: 0, duration: 100, kind: 'server' },
    { id: 'c000000000000002', parent: 'c000000000000001', service: 'catalog', name: 'GET /items', start: 10, duration: 60, kind: 'client' },
    { id: 'c000000000000003', parent: 'c000000000000001', service: 'pricing', name: 'GET /prices', start: 10, duration: 80, kind: 'client' },
    { id: 'c000000000000004', parent: 'c000000000000001', service: 'reviews', name: 'GET /reviews', start: 20, duration: 50, kind: 'client' },
  ] },
];

/**
 * shop: the three written traces and 300 generated ones (seed 2026): gateway GET /products calls auth, then catalog
 * (which queries its database: 3% of the queries are 900 ms slow, 2% of catalog calls fail), then pricing; five spans
 * each, 5,000 users. 2,000,000 requests a day.
 */
export const shop = (): TraceSet => ({
  traces: written(),
  generate: { seed: 2026, count: 300, users: 5000, root: { service: 'gateway', name: 'GET /products', kind: 'server', selfMs: { min: 4, max: 12 }, calls: [
    { service: 'auth', name: 'auth.verify', kind: 'client', selfMs: { min: 2, max: 6 } },
    { service: 'catalog', name: 'GET /items', kind: 'server', selfMs: { min: 10, max: 30 }, errorPermille: 20, calls: [
      { service: 'catalog', name: 'db.query', kind: 'client', selfMs: { min: 5, max: 40 }, slowPermille: 30, slowMs: 900 },
    ] },
    { service: 'pricing', name: 'GET /prices', kind: 'client', selfMs: { min: 8, max: 20 } },
  ] } },
  perDay: 2_000_000,
  exemplars: [{ series: 'p95', minute: 4, trace: T_FAIL }, { series: 'p95', minute: 1, trace: T_OK }],
});

/** Logs whose records carry trace ids (correlation field trace_id): two for T_FAIL, one for T_OK. */
export const traceLogs = (): LogSet => ({
  correlationField: 'trace_id',
  records: [
    { ts: '4:01', service: 'orders', host: 'orders-1', level: 'info', message: 'order B-2001 created', fields: { trace_id: T_OK } },
    { ts: '4:05', service: 'payments', host: 'payments-1', level: 'error', message: 'provider timeout after 5000 ms', fields: { trace_id: T_FAIL } },
    { ts: '4:06', service: 'gateway', host: 'gateway-1', level: 'error', message: 'POST /checkout 504', fields: { trace_id: T_FAIL, status: 504 } },
  ],
});

export const traceExplorers = (): TracesExplorer[] => [
  { id: 'shop-traces', title: '商店的追蹤', description: '三個課程寫的追蹤與 300 個依呼叫結構產生的追蹤。', traces: shop(),
    links: { logs: 'trace-logs', dashboard: 'latency' } },
  { id: 'checkout', title: '一次結帳', description: '只有課程寫的三個追蹤。', traces: { traces: written() }, labels: ['service', 'status'] },
];

/** The content around the traces: the linked logs and a ten-minute latency dashboard for the exemplars. */
export const tracesContent = (): DevopsLessonContent => ({
  traces: traceExplorers(),
  logs: [{ id: 'trace-logs', title: '帶著 trace_id 的日誌', description: '三筆紀錄，關聯欄位是 trace_id。', logs: traceLogs() }],
  dashboards: [{ id: 'latency', title: '延遲', description: '十分鐘的 p95 延遲。', dashboard: { service: 'shop', minutes: 10,
    series: [{ id: 'p95', label: 'p95 延遲', unit: 'ms', signal: 'latency', values: [120, 400, 130, 125, 5200, 140, 118, 122, 130, 127] }] } }],
  exercises: traceExercises(),
});

export const traceExercises = (): DevopsExercise[] => [
  { id: 't-trace', kind: 'table', title: '讀一個追蹤', statement: '看「一次結帳」裡成功的那一個追蹤（4bf92f35…）。',
    blanks: [
      { id: 'dur', label: '追蹤的時間（ms）', query: { task: 'trace', traces: 'checkout', trace: T_OK, metric: 'duration' } },
      { id: 'self', label: 'orders 的 POST /orders 的自身時間（ms）', query: { task: 'trace', traces: 'checkout', trace: T_OK, metric: 'self-time', span: 'POST /orders' } },
      { id: 'path', label: '關鍵路徑依序經過的服務', query: { task: 'trace', traces: 'checkout', trace: T_OK, metric: 'critical-services' } },
      { id: 'neck', label: '瓶頸的服務', query: { task: 'trace', traces: 'checkout', trace: T_OK, metric: 'bottleneck' } },
    ],
    hints: ['自身時間要扣掉子 span 的聯集，重疊的部分只扣一次。'], explanation: '300 − |[20, 90) ∪ [80, 280)| = 40；付款在關鍵路徑上 200 ms。',
    mistakes: [{ answer: { dur: '400', self: '-10', path: 'gateway, auth, orders, payments', neck: 'payments' }, why: '把重疊的子 span 扣了兩次' },
      { answer: { dur: '400', self: '40', path: 'gateway, orders, payments', neck: 'payments' }, why: '漏了在訂單之前、依序執行的驗證' }] },
  { id: 't-p95', kind: 'number', title: '追蹤時間的 p95', statement: '商店所有追蹤的時間，p95 是多少毫秒？（最近排名法）',
    blank: { id: 'p', label: 'p95（ms）', query: { task: 'trace', traces: 'shop-traces', metric: 'percentile', p: 95 } },
    hints: ['排序後取第 ⌈0.95 × N⌉ 個。'], explanation: '303 個追蹤，第 288 個。', mistakes: [{ answer: { value: '5200' }, why: '取了最大值' }] },
  { id: 't-head', kind: 'table', title: '頭部取樣 10%', statement: '只用 10% 的頭部取樣，商店的追蹤會留下多少？',
    blanks: [
      { id: 'kept', label: '保留的追蹤', query: { task: 'sampling', traces: 'shop-traces', metric: 'kept', policy: { headPermille: 100 } } },
      { id: 'errs', label: '保留的有錯誤的追蹤', query: { task: 'sampling', traces: 'shop-traces', metric: 'kept-errors', policy: { headPermille: 100 } } },
      { id: 'all', label: '不取樣時每天的 span', query: { task: 'sampling', traces: 'shop-traces', metric: 'spans-per-day' } },
    ],
    hints: ['頭部取樣在知道結果之前就決定了。'], explanation: '頭部取樣依 trace id 決定，有錯誤的追蹤也只留下約一成。',
    mistakes: [{ answer: { kept: '303', errs: '0', all: '0' }, why: '以為頭部取樣會保留全部' }] },
  { id: 't-card', kind: 'table', title: '加上 user_id 之後', statement: '一個依 service、name、status 計數的指標最多有幾條序列？再加上 5,000 個使用者的 user_id 呢？',
    blanks: [
      { id: 'base', label: '三個標籤（條）', query: { task: 'cardinality', traces: 'checkout', labels: ['service', 'name', 'status'], metric: 'series' } },
      { id: 'users', label: '加上 user_id（條）', query: { task: 'cardinality', traces: 'checkout', labels: ['service', 'name', 'status', { name: 'user_id', values: 5000 }], metric: 'series' } },
    ],
    hints: ['把每個標籤不同值的個數乘起來。'], explanation: '8 個服務 × 11 個操作 × 2 種狀態 = 176；× 5,000 = 880,000。',
    mistakes: [{ answer: { base: '21', users: '5021' }, why: '把個數加起來，而不是相乘' }] },
  { id: 't-logs', kind: 'number', title: '日誌裡的 trace_id', statement: '失敗的那個結帳追蹤（0af76519…），有幾筆日誌帶著它的 trace_id？',
    blank: { id: 'n', label: '日誌的筆數', query: { task: 'trace', traces: 'shop-traces', trace: T_FAIL, metric: 'log-records' } },
    hints: ['看探索器下方「帶著這個 trace id 的日誌」。'], explanation: '付款的逾時與閘道的 504。', mistakes: [{ answer: { value: '3' }, why: '把成功的那筆也算進去' }] },
  { id: 't-exemplar', kind: 'field', title: '從儀表板跳到追蹤', statement: '延遲儀表板第 4 分鐘的範例追蹤是哪一個？（trace id，可以只填前 8 碼）',
    blank: { id: 'id', label: 'trace id', query: { task: 'trace', traces: 'shop-traces', metric: 'exemplar', series: 'p95', minute: 4 } },
    hints: ['看範例追蹤的清單。'], explanation: '第 4 分鐘的尖峰就是那次逾時。', mistakes: [{ answer: { value: '4bf92f35' }, why: '選了第 1 分鐘的範例' }] },
  { id: 't-neck', kind: 'choice', title: '平行呼叫的瓶頸', statement: '搜尋的追蹤裡，三個平行的呼叫哪一個是瓶頸？',
    query: { task: 'trace', traces: 'checkout', trace: T_PAR, metric: 'bottleneck' },
    options: [{ value: 'catalog', label: 'catalog' }, { value: 'pricing', label: 'pricing' }, { value: 'reviews', label: 'reviews' }],
    hints: ['最晚結束的那一個決定了等待的時間。'], explanation: 'pricing 到 90 ms 才結束，其他兩個早就做完了。', mistakes: [{ answer: { choice: '0' }, why: '以為最先開始的就是瓶頸' }] },
  { id: 't-plan', kind: 'sampling-plan', title: '留下該留的追蹤', statement: '設計取樣：所有有錯誤的與慢於 800 ms 的追蹤都要留下，每天最多 1,200,000 個 span。',
    sampling: { traces: 'shop-traces', constraints: { keepAllErrors: true, keepSlowerThan: 800, maxSpansPerDay: 1_200_000 },
      reference: { headPermille: 1000, tail: { keepErrors: true, slowerThanMs: 800, restPermille: 50 } } },
    hints: ['頭部取樣在知道結果之前就決定了，留不住全部的錯誤。', '尾端取樣在追蹤完成後才決定。'],
    explanation: '頭部全收，尾端保留錯誤、慢的追蹤，其餘留 5%。',
    mistakes: [
      { answer: { head: '10', tail: 'off' }, why: '只用頭部取樣，錯誤與慢的追蹤只留下一成' },
      { answer: { head: '100', tail: 'on', errors: 'yes', slower: '800', rest: '100' }, why: '其餘的也全部留下，超過每天的上限' },
      { answer: { head: '50', tail: 'on', errors: 'yes', slower: '800', rest: '5' }, why: '頭部先丟掉一半，尾端看不到那些錯誤' },
    ] },
];

const p = (text: string) => ({ type: 'p' as const, text });
/** A monitoring-dashboard lesson's devops-explorer part with traces (and the logs and dashboard they link to). */
export const tracesLesson = (): LessonContent => ({
  lessonId: 'CICD11' as LessonContent['lessonId'],
  motivation: '指標告訴你「變慢了」，日誌告訴你「哪裡出錯」，追蹤則把一個請求經過的每個服務畫在同一條時間軸上，看得出時間花在哪裡。',
  sections: [
    { id: 'traces', title: '分散式追蹤與關鍵路徑', blocks: [
      p('一個追蹤是一棵 span 的樹：每個 span 記下服務、操作、開始與持續的時間。自身時間扣掉子 span，關鍵路徑決定了使用者等多久。'),
      { type: 'example', id: 'checkout' }] },
    { id: 'sampling', title: '取樣與基數', blocks: [
      p('每個請求都留下追蹤太貴；頭部取樣便宜但看不到結果，尾端取樣可以留下錯誤與慢的追蹤。指標的每個標籤都會讓序列數相乘，user_id 這種高基數的標籤要避免。'),
      { type: 'example', id: 'shop-traces' }] },
    { id: 'pillars', title: '三大支柱的連結', blocks: [
      p('指標、日誌與追蹤是可觀測性的三大支柱，各回答不同的問題（OpenTelemetry 是產生與傳送它們的開放標準，SDK 與 Collector 的設定在課文說明）：日誌帶著 trace_id，儀表板某一分鐘的範例追蹤也能直接連到那個請求。'),
      { type: 'example', id: 'trace-logs' }, { type: 'example', id: 'latency' }] },
  ],
  examples: [], exercises: [],
  quiz: [
    { id: 'q1', prompt: 'span 的自身時間是什麼？', options: ['持續時間扣掉子 span 所佔的時間', '整個追蹤的時間', '第一個子 span 的時間'], answer: 0, explanation: '子 span 的時間重疊時只扣一次；剩下的才是這個服務自己做事的時間。' },
    { id: 'q2', prompt: '關鍵路徑上的服務代表什麼？', options: ['它變快，整個請求才會變快', '它出錯最多', '它最先開始'], answer: 0, explanation: '關鍵路徑決定了整個請求的時間；不在路徑上的平行呼叫變快，使用者等的時間不變。' },
    { id: 'q3', prompt: '為什麼尾端取樣能保留所有錯誤？', options: ['它在追蹤完成後才決定', '它保留全部的追蹤', '它只看 trace id'], answer: 0, explanation: '頭部取樣在請求一開始就決定，還不知道會不會出錯；尾端取樣等整個追蹤完成才看結果。' },
    { id: 'q4', prompt: '在指標加上 user_id 標籤會怎樣？', options: ['序列數乘上使用者數', '序列數加一', '沒有影響'], answer: 0, explanation: '基數是各標籤不同值個數的乘積；一個有幾千個值的標籤會讓序列數乘上幾千倍。' },
  ],
  devops: tracesContent(),
});

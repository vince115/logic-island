import type { Dashboard } from '@/lib/devops/dashboard';
import type { LogRecordInput, LogSet } from '@/lib/devops/logs';
import type { CallShape, SpanInput, TraceSet } from '@/lib/devops/traces';
import type { LessonContent } from '../schema';

/*
 * KUB13 可觀測性：指標、日誌與追蹤 (KUB-4, monitoring-dashboard: the devops-explorer's dashboards D3, logs D4 and traces
 * D5; no terminal). The made-up shop team's checkout on its Kubernetes cluster: storefront → checkout → inventory and
 * payments, one afternoon from 14:00 (minute 0). At 14:36 inventory v2.3 replaces a batched stock query with one query per
 * cart item (an N+1 loop); p95 latency jumps from about 160 ms to over a second until the rollback at 14:48, while errors
 * stay flat and the inventory database's connections climb. The lesson's four written traces are the normal checkout
 * (T_OK), the N+1 checkout (T_N1, 40 sequential stock queries of 20 ms), an order-history page waiting on one slow query
 * (T_SLOWDB, a missing index) and a checkout whose card provider call times out after 1,500 ms (T_TIMEOUT, order K-2093);
 * 200 generated checkouts surround them. The logs carry the trace id in trace_id (D4's correlation field), the dashboard's
 * p95 has exemplars at minutes 12, 22 and 41. A second set of 500 generated checkouts (3,000,000 a day) is for sampling
 * and cardinality. OpenTelemetry (SDK, Collector, OTLP, traceparent) and real backends are prose only; the sampling rule
 * and the bottleneck definition are this course's own (CICD0_DEVOPS_CAPABILITY.md §10.5). Every exercise answer is
 * computed by src/lib/devops from these data (none is written here). Team, services, pods, orders and values are made up.
 */

// ---------------------------------------------------------------------------------------------------- the dashboard
/** p95 latency (ms) of POST /checkout per minute from 14:00; inventory v2.3 from minute 36, rolled back at minute 48. */
const P95 = [
  158, 162, 155, 160, 166, 158, 152, 161, 169, 163,
  157, 160, 164, 171, 159, 156, 162, 168, 160, 155,
  158, 163, 174, 161, 157, 160, 166, 159, 154, 162,
  165, 158, 161, 167, 160, 163, 640, 990, 1120, 1150,
  1170, 1190, 1160, 1140, 1175, 1130, 1150, 870, 260, 175,
  166, 160, 171, 163, 158, 161, 165, 159, 162, 157,
];
const board = (): Dashboard => ({
  service: 'storefront（商店前台的結帳 API）', minutes: 60,
  series: [
    { id: 'p95', label: '結帳的 p95 延遲', unit: 'ms', signal: 'latency', values: P95 },
    { id: 'rpm', label: '每分鐘結帳請求數', unit: '個', signal: 'traffic', shape: { seed: 1301, baseline: 540, noise: 30 } },
    { id: 'errors', label: '結帳的錯誤率', unit: '‰', signal: 'errors', shape: { seed: 1302, baseline: 3, noise: 1 } },
    { id: 'db-conn', label: 'inventory 資料庫連線使用率', unit: '%', signal: 'saturation', shape: { seed: 1303, baseline: 30, noise: 3, changes: [
      { kind: 'spike', at: 36, minutes: 12, delta: 45 }] } },
  ],
  incidents: [{ id: 'n-plus-one', label: '結帳變慢（inventory v2.3）', start: 36, end: 48 }],
  rules: [
    { id: 'p95-slow', label: '結帳的 p95 延遲超過 800 ms，持續 2 分鐘', series: 'p95', op: '>', threshold: 800, forMinutes: 2, severity: 'critical' },
  ],
});

// ---------------------------------------------------------------------------------------------------- the traces
const T_OK = '5d2f8c1a9e7b4036b8a1c4e2f9d70b13';
const T_N1 = 'c3a91e5f0b7d4c28a6e2f1b9d8047e5a';
const T_SLOWDB = '7e14b9c2d05a4f6e9b3c8a1f2e6d4c97';
const T_TIMEOUT = '9b06e3d7a4c1452f8e7d0c6b3a19f284';

type Extra = Pick<SpanInput, 'status' | 'kind' | 'attributes'>;
/** A span id: a four-digit prefix per trace and a running number. */
const sid = (prefix: string, n: number) => `${prefix}${n.toString(16).padStart(12, '0')}`;
const span = (prefix: string, n: number, parent: number | undefined, service: string, name: string, start: number, duration: number, extra: Extra = {}): SpanInput =>
  ({ id: sid(prefix, n), ...parent === undefined ? {} : { parent: sid(prefix, parent) }, service, name, start, duration, ...extra });

/** A normal checkout: one batched stock query, the card provider in 60 ms (142 ms in all). */
const okSpans = (): SpanInput[] => {
  const s = (n: number, parent: number | undefined, service: string, name: string, start: number, duration: number, extra: Extra = {}) => span('a0a0', n, parent, service, name, start, duration, extra);
  return [
    s(1, undefined, 'storefront', 'POST /checkout', 0, 142, { kind: 'server', attributes: { 'http.route': '/checkout', user_id: 'u-20417', order_id: 'K-2031' } }),
    s(2, 1, 'checkout', 'POST /orders', 4, 132, { kind: 'server' }),
    s(3, 2, 'checkout', 'SELECT cart', 6, 7, { kind: 'client' }),
    s(4, 2, 'inventory', 'POST /reserve', 14, 38, { kind: 'server', attributes: { items: 3 } }),
    s(5, 4, 'inventory', 'SELECT stock WHERE sku IN (?)', 18, 28, { kind: 'client' }),
    s(6, 2, 'payments', 'POST /charge', 54, 70, { kind: 'server' }),
    s(7, 6, 'payments', 'provider.authorize', 58, 60, { kind: 'client' }),
    s(8, 2, 'checkout', 'INSERT orders', 125, 8, { kind: 'client' }),
  ];
};
/**
 * inventory v2.3: one stock query per cart item, 40 items, each 20 ms with 2 ms between them (an N+1 loop). POST /reserve
 * [20, 910): its own time is 890 − 40 × 20 = 90 ms; on the critical path inventory has all 890 ms. 1,130 ms in all.
 */
const n1Spans = (): SpanInput[] => {
  const s = (n: number, parent: number | undefined, service: string, name: string, start: number, duration: number, extra: Extra = {}) => span('b1b1', n, parent, service, name, start, duration, extra);
  return [
    s(1, undefined, 'storefront', 'POST /checkout', 0, 1130, { kind: 'server', attributes: { 'http.route': '/checkout', user_id: 'u-31877', order_id: 'K-2081' } }),
    s(2, 1, 'checkout', 'POST /orders', 6, 1114, { kind: 'server' }),
    s(3, 2, 'checkout', 'SELECT cart', 10, 8, { kind: 'client' }),
    s(4, 2, 'inventory', 'POST /reserve', 20, 890, { kind: 'server', attributes: { items: 40, 'service.version': '2.3.0' } }),
    ...Array.from({ length: 40 }, (_, k) => s(16 + k, 4, 'inventory', 'SELECT stock WHERE sku = ?', 25 + 22 * k, 20, { kind: 'client', attributes: { sku: `SKU-${4101 + k}` } })),
    s(6, 2, 'payments', 'POST /charge', 915, 180, { kind: 'server' }),
    s(7, 6, 'payments', 'provider.authorize', 920, 160, { kind: 'client' }),
    s(8, 2, 'checkout', 'INSERT orders', 1100, 12, { kind: 'client' }),
  ];
};
/** The order-history page: one query on orders without an index on customer_id takes 2,160 ms (2,215 ms in all). */
const slowDbSpans = (): SpanInput[] => {
  const s = (n: number, parent: number | undefined, service: string, name: string, start: number, duration: number, extra: Extra = {}) => span('c2c2', n, parent, service, name, start, duration, extra);
  return [
    s(1, undefined, 'storefront', 'GET /account/orders', 0, 2215, { kind: 'server', attributes: { 'http.route': '/account/orders', user_id: 'u-10288' } }),
    s(2, 1, 'checkout', 'GET /orders', 6, 2199, { kind: 'server' }),
    s(3, 2, 'checkout', 'SELECT orders WHERE customer_id = ?', 10, 2160, { kind: 'client', attributes: { 'db.rows_examined': 1840000 } }),
    s(4, 2, 'checkout', 'SELECT order_items WHERE order_id IN (?)', 2172, 20, { kind: 'client' }),
  ];
};
/** Order K-2093: the card provider does not answer; provider.authorize gives up after 1,500 ms (1,600 ms in all, 4 error spans). */
const timeoutSpans = (): SpanInput[] => {
  const s = (n: number, parent: number | undefined, service: string, name: string, start: number, duration: number, extra: Extra = {}) => span('d3d3', n, parent, service, name, start, duration, extra);
  return [
    s(1, undefined, 'storefront', 'POST /checkout', 0, 1600, { kind: 'server', status: 'error', attributes: { 'http.route': '/checkout', user_id: 'u-27730', order_id: 'K-2093' } }),
    s(2, 1, 'checkout', 'POST /orders', 5, 1585, { kind: 'server', status: 'error' }),
    s(3, 2, 'checkout', 'SELECT cart', 8, 7, { kind: 'client' }),
    s(4, 2, 'inventory', 'POST /reserve', 16, 44, { kind: 'server', attributes: { items: 3 } }),
    s(5, 4, 'inventory', 'SELECT stock WHERE sku IN (?)', 20, 32, { kind: 'client' }),
    s(6, 2, 'payments', 'POST /charge', 62, 1518, { kind: 'server', status: 'error' }),
    s(7, 6, 'payments', 'provider.authorize', 66, 1500, { kind: 'client', status: 'error', attributes: { timeout_ms: 1500 } }),
  ];
};

/** A normal checkout as the generator builds it: eight spans, one after another. */
const checkoutShape = (slow: boolean): CallShape => ({
  service: 'storefront', name: 'POST /checkout', kind: 'server', selfMs: { min: 4, max: 10 }, attributes: { 'http.route': '/checkout' }, calls: [
    { service: 'checkout', name: 'POST /orders', kind: 'server', selfMs: { min: 6, max: 14 }, calls: [
      { service: 'checkout', name: 'SELECT cart', kind: 'client', selfMs: { min: 3, max: 8 } },
      { service: 'inventory', name: 'POST /reserve', kind: 'server', selfMs: { min: 4, max: 10 }, calls: [
        { service: 'inventory', name: 'SELECT stock WHERE sku IN (?)', kind: 'client', selfMs: { min: 12, max: 30 }, ...slow ? { slowPermille: 25, slowMs: 900 } : {} },
      ] },
      { service: 'payments', name: 'POST /charge', kind: 'server', selfMs: { min: 4, max: 10 }, calls: [
        { service: 'payments', name: 'provider.authorize', kind: 'client', selfMs: { min: 40, max: 110 }, errorPermille: 12 },
      ] },
      { service: 'checkout', name: 'INSERT orders', kind: 'client', selfMs: { min: 4, max: 9 } },
    ] },
  ],
});

const checkoutTraces = (): TraceSet => ({
  traces: [{ id: T_OK, spans: okSpans() }, { id: T_N1, spans: n1Spans() }, { id: T_SLOWDB, spans: slowDbSpans() }, { id: T_TIMEOUT, spans: timeoutSpans() }],
  generate: { seed: 1312, count: 200, users: 80000, root: checkoutShape(false) },
  perDay: 3_000_000,
  exemplars: [{ series: 'p95', minute: 12, trace: T_OK }, { series: 'p95', minute: 22, trace: T_SLOWDB }, { series: 'p95', minute: 41, trace: T_N1 }],
});
/** A sample of an ordinary day: 500 generated checkouts (2.5% with one slow stock query, 1.2% with a failed authorization). */
const fleetTraces = (): TraceSet => ({ generate: { seed: 1313, count: 500, users: 80000, root: checkoutShape(true) }, perDay: 3_000_000 });

// ---------------------------------------------------------------------------------------------------- the logs
type Level = LogRecordInput['level'];
const rec = (ts: string, service: string, host: string, level: Level, message: string, fields: Record<string, string | number>): LogRecordInput =>
  ({ ts, service, host, level, message, fields });
const SF = 'storefront-7d9c5b8f6-k2x8p', CO = 'checkout-5f7b9d6c4-q8m2t', IV1 = 'inventory-6c8d7f9b5-h4n7w', IV2 = 'inventory-84b6f5c9d-r2v6j', PY = 'payments-9a7c6d5e4-t3k9z';
/** The afternoon's records that matter (times from 14:00:00), each with the trace id of its request in trace_id. */
const checkoutLogs = (): LogSet => ({
  correlationField: 'trace_id',
  records: [
    rec('12:07', 'storefront', SF, 'info', 'POST /checkout received', { trace_id: T_OK, user_id: 'u-20417' }),
    rec('12:07', 'checkout', CO, 'info', 'order created', { trace_id: T_OK, order_id: 'K-2031' }),
    rec('12:07', 'storefront', SF, 'info', 'POST /checkout 200', { trace_id: T_OK, status: 200, duration_ms: 142 }),
    rec('22:40', 'storefront', SF, 'info', 'GET /account/orders received', { trace_id: T_SLOWDB, user_id: 'u-10288' }),
    rec('22:42', 'checkout', CO, 'warn', 'slow query', { trace_id: T_SLOWDB, table: 'orders', duration_ms: 2160 }),
    rec('22:42', 'storefront', SF, 'info', 'GET /account/orders 200', { trace_id: T_SLOWDB, status: 200, duration_ms: 2215 }),
    rec('36:02', 'inventory', IV2, 'info', 'inventory 2.3.0 started', { version: '2.3.0' }),
    rec('41:15', 'storefront', SF, 'info', 'POST /checkout received', { trace_id: T_N1, user_id: 'u-31877' }),
    rec('41:15', 'checkout', CO, 'info', 'order created', { trace_id: T_N1, order_id: 'K-2081' }),
    rec('41:16', 'inventory', IV2, 'warn', 'reserve slower than 500 ms', { trace_id: T_N1, order_id: 'K-2081', items: 40, duration_ms: 890 }),
    rec('41:16', 'storefront', SF, 'info', 'POST /checkout 200', { trace_id: T_N1, status: 200, duration_ms: 1130 }),
    rec('48:05', 'inventory', IV1, 'info', 'inventory 2.2.4 serving again (rollback)', { version: '2.2.4' }),
    rec('52:30', 'storefront', SF, 'info', 'POST /checkout received', { trace_id: T_TIMEOUT, user_id: 'u-27730' }),
    rec('52:30', 'checkout', CO, 'info', 'order created', { trace_id: T_TIMEOUT, order_id: 'K-2093' }),
    rec('52:30', 'inventory', IV1, 'info', 'stock reserved', { trace_id: T_TIMEOUT, order_id: 'K-2093', items: 3 }),
    rec('52:31', 'payments', PY, 'error', 'card provider timeout', { trace_id: T_TIMEOUT, order_id: 'K-2093', status: 504, duration_ms: 1500 }),
    rec('52:31', 'checkout', CO, 'error', 'order failed: payment error', { trace_id: T_TIMEOUT, order_id: 'K-2093', status: 502 }),
    rec('52:31', 'storefront', SF, 'error', 'POST /checkout 502', { trace_id: T_TIMEOUT, status: 502, duration_ms: 1600 }),
  ],
});

// ---------------------------------------------------------------------------------------------------- the lesson
const fleetHead10 = { headPermille: 100 };

export const KUB13: LessonContent = {
  lessonId: 'KUB13',
  motivation: '上一課的叢集監控告訴你節點與 Pod 是否健康、資源夠不夠用；但叢集再健康，使用者仍可能覺得結帳很慢。某天下午 14:36，商店團隊的結帳 API 的 p95 延遲從 160 ms 左右跳到超過一秒，錯誤率卻完全沒動，所有 Pod 都是 Running、沒有重啟。儀表板清楚地說「變慢了」，卻說不出「為什麼」：請求依序經過 storefront、checkout、inventory 與 payments 四個服務，時間到底花在哪一段？這是事先沒有想到要問的問題，沒有任何一張現成的圖能回答。本課從監控與可觀測性的差別談起，看指標、日誌與分散式追蹤這三大支柱各自回答什麼，用追蹤的瀑布圖找出一個慢請求的瓶頸，再沿著範例追蹤與日誌裡的 trace_id 把三者串起來；最後認識與廠商無關的 OpenTelemetry，以及讓追蹤負擔得起的取樣、讓指標失控的高基數標籤。',
  sections: [
    {
      id: 'kub13-observe', title: '監控與可觀測性',
      blocks: [
        { type: 'p', text: '監控（monitoring）是事先決定要看哪些數字，畫成儀表板，再為它們寫告警規則：p95 延遲超過 800 ms、錯誤率超過 10‰、連線池用掉九成。它回答的是「已知的未知」（known unknowns）：你知道要問什麼，只是不知道答案什麼時候會變壞。監控是必要的，值班的人靠它在使用者之前發現問題。' },
        { type: 'p', text: '可觀測性（observability）是系統本身的一種性質：只靠系統送出來的資料，能不能理解它內部發生了什麼，而且能回答事先沒想到的新問題，不必為了這個問題再改程式、重新部署。這個詞來自控制理論，用在軟體上指的是面對「未知的未知」（unknown unknowns）的能力：一種從沒見過的故障發生時，你能不能從現有的資料一路追到原因，例如「只有購物車超過 30 項的結帳變慢」或「只有新版 inventory 的 Pod 在多查資料庫」。' },
        { type: 'table', head: ['', '監控', '可觀測性'], rows: [
          ['回答的問題', '事先想到的問題：有沒有壞、多嚴重、從什麼時候開始', '事先沒想到的問題：為什麼壞、只影響誰、時間花在哪裡'],
          ['依賴的資料', '少數聚合好的指標與門檻', '帶有豐富欄位的事件：追蹤的 span、結構化日誌，加上指標'],
          ['典型的動作', '看儀表板、收告警', '依任意欄位切分、從一個請求追到另一個服務'],
          ['在這個下午', '告警在第 39 分鐘觸發：p95 超過 800 ms 已持續 2 分鐘', '找出 inventory 對 40 項商品逐一查庫存，總共花了 890 ms'],
        ] },
        { type: 'p', text: '商店團隊的服務都跑在 Kubernetes 上：storefront 是使用者面對的結帳 API，它呼叫 checkout 建立訂單，checkout 再呼叫 inventory 保留庫存、呼叫 payments 向外部的卡片服務請款。下面是 14:00 起一小時的儀表板（示意資料，第 0 分鐘是 14:00）。用步進器看看第 36 分鐘之後：延遲跳高、inventory 資料庫的連線使用率同時升高，錯誤率與流量則沒有變化。' },
        { type: 'example', id: 'kub13-board' },
        { type: 'p', text: '儀表板已經盡了它的責任：規則「p95 超過 800 ms，持續 2 分鐘」在第 39 分鐘觸發，偵測延遲 3 分鐘；資料庫連線的面板也暗示問題和 inventory 有關。但它無法說出是哪一段程式、為什麼變慢。團隊不可能事先為「每個請求查了幾次資料庫」準備一張圖；這個問題要靠可觀測性的資料回答。' },
        { type: 'callout', tone: 'warning', title: '「儀表板與告警夠多，就有可觀測性了」', text: '再多的儀表板也只回答事先想好的問題，而且每多一張圖就多一份維護；新的故障常常落在所有圖的縫隙之間。可觀測性來自資料的內容與連結：每個請求的追蹤帶著服務、版本、路由等屬性，日誌帶著 trace_id，指標能連到範例追蹤。少數幾張回答「有沒有壞」的儀表板，加上能任意切分、能從一處追到另一處的資料，比幾百張圖更有用。' },
        { type: 'callout', tone: 'note', title: '本課的資料與模型', text: '本課的儀表板、日誌與追蹤都是示意資料，部分由固定種子的產生器算出。追蹤的自身時間、關鍵路徑、瓶頸與取樣規則是本課程為了能手算而定的教學模型，不代表任何追蹤產品、SDK 或 Collector 的行為。' },
      ],
    },
    {
      id: 'kub13-pillars', title: '三大支柱：指標、日誌與追蹤',
      blocks: [
        { type: 'p', text: '指標、日誌與分散式追蹤常被稱為可觀測性的三大支柱（three pillars）。三者記下同一個系統，但資料的形狀不同，回答的問題也不同；只收其中一種，總有某類問題答不出來。' },
        { type: 'table', head: ['', '指標（metrics）', '日誌（logs）', '追蹤（traces）'], rows: [
          ['資料的形狀', '每個時間點一個聚合後的數字，依標籤分成多條序列', '每個事件一筆紀錄，帶有欄位', '每個請求一棵 span 的樹，每個 span 有開始、持續時間與屬性'],
          ['最擅長回答', '有沒有壞、多嚴重、趨勢如何、要不要叫醒人', '這個事件的細節：錯誤訊息、哪一筆訂單、哪個參數', '這個請求經過哪些服務、時間花在哪一段、誰呼叫了誰'],
          ['成本', '低：和流量幾乎無關，但和標籤組合的數量成正比', '高：流量越大筆數越多', '高：每個請求好幾個到幾十個 span，所以通常取樣'],
          ['能放高基數的值嗎', '不行：user_id 這種標籤會讓序列數爆增', '可以：放在欄位裡', '可以：放在 span 的屬性裡'],
          ['在這個下午', 'p95 從 160 ms 跳到 1,190 ms', 'inventory 記下「reserve slower than 500 ms」與 items 40', '40 個依序執行的 SELECT stock，每個 20 ms'],
        ] },
        { type: 'p', text: '三者真正的價值在於能互相連結。指標的某一分鐘可以帶著範例追蹤（exemplar），從圖上的尖峰直接打開當時的一個請求；日誌的每一筆都帶著 trace_id，從錯誤訊息跳到整個請求的瀑布圖，也能從追蹤列出它留下的日誌；三種資料都帶著相同的資源屬性（服務名稱、版本、Pod、namespace），可以用同一組條件切分。一次典型的調查是這樣的：' },
        { type: 'list', ordered: true, items: [
          '指標：告警或儀表板說「結帳的 p95 從第 36 分鐘起超過一秒」，同時看到錯誤率沒變、inventory 的資料庫連線升高。',
          '範例追蹤：點開第 41 分鐘的範例，得到一個當時的慢請求。',
          '追蹤：瀑布圖顯示時間幾乎都在 inventory，而且是 40 個很短的查詢一個接一個。',
          '日誌：用同一個 trace_id 找到 inventory 的警告「reserve slower than 500 ms」與 items 40，再依 version 欄位發現 2.3.0 在第 36 分鐘上線。',
          '回到指標：回滾之後確認 p95 回到 160 ms 左右。',
        ] },
        { type: 'callout', tone: 'tip', title: '在 Kubernetes 上，資料從哪裡來', text: 'Pod 與節點的資源指標來自每個節點的 kubelet，上一課的叢集監控看過；應用程式的請求指標、追蹤與結構化日誌則要由應用程式自己產生。容器寫到標準輸出的日誌留在它所在的節點上，kubectl logs 只讀得到還存在的 Pod，Pod 被刪除後這些檔案也跟著清掉，所以通常在每個節點跑一個收集代理程式（DaemonSet），把日誌與追蹤送到集中的地方，並替每一筆加上 Pod、namespace 與節點的名稱。' },
      ],
    },
    {
      id: 'kub13-tracing', title: '分散式追蹤：瀑布圖、關鍵路徑與瓶頸',
      blocks: [
        { type: 'p', text: '分散式追蹤（distributed tracing）把一個請求在每個服務做的事記成一棵樹。整棵樹是一個追蹤（trace），以 32 個十六進位數字的 trace id 識別；樹上的每個節點是一個 span，代表一段有開始與結束的工作，例如「checkout 處理 POST /orders」或「inventory 查一次資料庫」，以 16 個十六進位數字的 span id 識別，並記下它的父 span、服務、操作名稱、開始時間、持續時間、狀態（正常或錯誤）、種類與屬性。' },
        { type: 'table', head: ['span 的種類', '代表什麼', '例子'], rows: [
          ['server（伺服器端）', '收到並處理一個遠端呼叫', 'checkout 的 POST /orders'],
          ['client（用戶端）', '發出一個遠端呼叫並等待回應', 'inventory 的 SELECT stock、payments 的 provider.authorize'],
          ['internal（內部）', '服務內部的一段工作，沒有跨出行程', '計算折扣、組出回應'],
          ['producer／consumer（生產者／消費者）', '把訊息送進佇列，以及之後從佇列取出處理', '下單後送出「寄發收據」的訊息'],
        ] },
        { type: 'p', text: '把每個 span 畫成共用時間軸上的一條長條，依父子關係縮排，就是瀑布圖（waterfall）。讀瀑布圖時要分清三個數字：持續時間是 span 從開始到結束的時間，一定包含它等待子 span 的時間，所以根 span 永遠最長；自身時間（self time）是持續時間扣掉子 span 所佔的時間（重疊的部分只扣一次），也就是這個 span 自己在做事的時間；關鍵路徑（critical path）是決定整個請求多久的那一串工作，從根 span 的結束往回走，每次走進最晚結束的子 span。本課把各服務在關鍵路徑上的時間加總，最多的服務稱為瓶頸。' },
        { type: 'example', id: 'kub13-traces' },
        { type: 'p', text: '先打開最慢的追蹤（7e14b9c2…，訂單紀錄頁，2,215 ms）。它只有 4 個 span，其中 checkout 的 SELECT orders WHERE customer_id = ? 一個就佔了 2,160 ms，屬性 db.rows_examined 是 1,840,000：資料表沒有 customer_id 的索引，每次都要掃過整張表。這是最容易認的形狀：一條很長的子 span，自身時間幾乎等於持續時間，瓶頸就是發出它的服務，下游的資料庫要補索引或改寫查詢。' },
        { type: 'p', text: '再打開 c3a91e5f…（第 41 分鐘的結帳，1,130 ms）。這次沒有任何一個 span 特別長：inventory 的 POST /reserve 底下有 40 個 SELECT stock WHERE sku = ?，每個只要 20 ms，卻一個接一個執行，像一道階梯。這就是 N+1 查詢：先拿到購物車的 N 項商品，再對每一項各查一次，而不是用一個 WHERE sku IN (…) 一次查完。POST /reserve 的自身時間只有 90 ms，但 inventory 在關鍵路徑上佔了 890 ms；只看「最慢的單一 span」或「自身時間最大的 span」，會完全錯過它。' },
        { type: 'table', head: ['瀑布圖上的樣子', '常見的原因', '下一步'], rows: [
          ['一條很長的子 span，自身時間接近持續時間', '慢查詢（缺索引、鎖等待）、慢的下游服務', '看這個 span 的屬性與它的服務的日誌'],
          ['很多相同名稱的短 span 依序排成階梯', 'N+1 查詢、迴圈裡的遠端呼叫', '改成批次查詢、JOIN 或快取；計數比時間更能說明問題'],
          ['父 span 的自身時間很大，底下卻沒有子 span', '服務自己在計算、等鎖、記憶體回收，或缺少 instrumentation', '看這個服務的 CPU 指標，或替它補上 span'],
          ['幾個子 span 同時開始', '平行呼叫', '只有最晚結束的那一個在關鍵路徑上，優化其他的不會變快'],
          ['一條剛好停在某個整數的錯誤 span', '逾時（timeout）', '看下游為什麼沒有回應，以及逾時與重試的設定'],
        ] },
        { type: 'callout', tone: 'warning', title: '「最長的 span 就是瓶頸」', text: '根 span 的持續時間永遠最長，因為它包含了所有子 span；父 span 也一樣。判斷瓶頸要看自身時間與關鍵路徑：自身時間說明誰自己在花時間，關鍵路徑說明誰的時間真的讓使用者多等。平行呼叫中先結束的那些不在路徑上，把它們變快不會讓請求變快；N+1 迴圈則相反，每個 span 都很短，加起來卻是全部。本課以「服務在關鍵路徑上的時間加總」定義瓶頸，有的工具用其他定義，看工具的說明再下結論。' },
      ],
    },
    {
      id: 'kub13-correlate', title: '把指標、日誌與追蹤串起來',
      blocks: [
        { type: 'p', text: '上面的追蹤探索器連結了這一課的儀表板與日誌。「範例追蹤」列出 p95 序列上的三個範例：第 12 分鐘是一次 142 ms 的正常結帳，第 41 分鐘是 N+1 的那次結帳，第 22 分鐘是 2,215 ms 的訂單紀錄頁。注意第 22 分鐘的 p95 只有 174 ms：一分鐘有五百多個請求，一個非常慢的請求落在最慢的 5% 裡，不會讓 p95 移動。百分位數適合看「多數使用者」的感受，個別的慢請求要從追蹤找。' },
        { type: 'p', text: '日誌是另一個入口。下面是同一個下午與這幾個請求有關的 18 筆結構化日誌，關聯欄位是 trace_id：寫日誌的函式庫從目前的 span 取得 trace id，自動加進每一筆，所以同一個請求在每個服務留下的紀錄都帶著同一個值。在「關聯」裡選一個 trace_id，就能看到這個請求在各服務的紀錄。' },
        { type: 'example', id: 'kub13-logs' },
        { type: 'p', text: '14:52 客服轉來一則客訴：訂單 K-2093 結帳失敗。在日誌篩選 order_id = K-2093，四筆紀錄都帶著 trace_id 9b06e3d7…；依這個 trace_id 關聯，請求依序經過 storefront → checkout → inventory → payments → checkout → storefront，第一個 error 是 payments 的「card provider timeout」。日誌說出了「發生什麼」，但說不出時間怎麼分配；回到追蹤探索器打開 9b06e3d7…，瀑布圖顯示 provider.authorize 等了整整 1,500 ms 才放棄，前面的庫存保留只花了 44 ms，四個 span 標成錯誤，一路傳回 storefront。' },
        { type: 'p', text: '反方向也一樣有用：在追蹤探索器選定一個追蹤，下方會列出帶著它的 trace_id 的日誌。N+1 那次結帳的日誌裡，inventory 記下 items 40 與 duration_ms 890，和瀑布圖的 40 個查詢、890 ms 對得上；inventory 在 36:02 記下「inventory 2.3.0 started」，追蹤的 POST /reserve 也帶著 service.version 2.3.0，兩邊都指向同一次部署。' },
        { type: 'table', head: ['從', '到', '靠什麼連結'], rows: [
          ['儀表板的一分鐘', '當時的一個追蹤', '指標上的範例追蹤（exemplar）記下 trace id'],
          ['一筆日誌', '它所屬的追蹤', '日誌的 trace_id 欄位'],
          ['一個追蹤', '它留下的日誌', '用 trace_id 篩選日誌'],
          ['一個 span', '同一個 Pod、同一個版本的指標', '相同的資源屬性：服務名稱、版本、Pod、namespace'],
        ] },
        { type: 'callout', tone: 'tip', title: '讓連結真的存在', text: '連結不會自己出現：日誌要用和追蹤相同的函式庫或橋接，才會自動帶上 trace_id；三種資料的服務名稱要寫成同一個值（storefront 不能在指標叫 web、在日誌叫 frontend）；版本號要放進資源屬性，事故時才能把「新版本的 Pod」與「舊版本的 Pod」分開比較。這些都是在平時、在部署設定裡就要做好的事。' },
      ],
    },
    {
      id: 'kub13-otel', title: 'OpenTelemetry：與廠商無關的標準',
      blocks: [
        { type: 'p', text: '產生、收集與傳送這些資料，過去每家監控或追蹤產品都有自己的函式庫與格式，換一個後端就要改每個服務的程式。OpenTelemetry（常簡稱 OTel）是 CNCF 的開源專案，在 2019 年由 OpenTracing 與 OpenCensus 兩個專案合併而成，為追蹤、指標與日誌提供一套與廠商無關（vendor-neutral）的 API、SDK、資料格式與傳輸協定：應用程式只要用 OpenTelemetry 產生資料，要送到哪一個後端，由設定決定。' },
        { type: 'table', head: ['元件', '做什麼', '在商店團隊的叢集裡'], rows: [
          ['API', '程式碼用來建立 span、記錄指標的介面', 'checkout 的程式在處理訂單時建立 span、加上 order_id 屬性'],
          ['SDK', 'API 的實作：取樣、批次處理、匯出', '在每個服務的行程裡執行，決定頭部取樣、把 span 分批送出'],
          ['自動 instrumentation', '替常見的 HTTP 框架、資料庫驅動程式自動產生 span 並傳遞上下文', 'SELECT stock 這些資料庫 span 不必手寫'],
          ['OTLP', 'OpenTelemetry 的傳輸協定，經由 gRPC 或 HTTP 傳送', 'SDK 以 OTLP 送到同一個節點上的 Collector'],
          ['Collector', '獨立執行的收集程式：receiver 接收、processor 處理（批次、補上屬性、取樣）、exporter 送出', '每個節點一個（DaemonSet），再加上一組集中的 Collector（Deployment）'],
          ['語意慣例（semantic conventions）', '屬性的標準名稱', 'service.name、service.version、http.route 在每種資料中都同名'],
        ] },
        { type: 'p', text: '分散式追蹤能串起不同的服務，靠的是上下文傳遞（context propagation）：storefront 呼叫 checkout 時，把目前的 trace id 與自己的 span id 放進請求標頭；checkout 收到後建立的 span 就以它為父 span，並沿用同一個 trace id。W3C 的 Trace Context 規格定義了這個標頭 traceparent，它有四段，以連字號分開：' },
        { type: 'table', head: ['欄位', '例子', '意思'], rows: [
          ['version', '00', '格式的版本'],
          ['trace-id', '9b06e3d7a4c1452f8e7d0c6b3a19f284', '整個追蹤的 id，32 個十六進位數字，每一段都相同'],
          ['parent-id', 'd3d3000000000002', '呼叫端這個 span 的 id，16 個十六進位數字，每一段都換成發出呼叫的那個 span'],
          ['trace-flags', '01', '旗標；最低位元是 sampled，表示呼叫端決定記錄這個追蹤'],
        ] },
        { type: 'p', text: '所以 checkout 呼叫 payments 時送出的標頭是 traceparent: 00-9b06e3d7a4c1452f8e7d0c6b3a19f284-d3d3000000000002-01。同一套規格還有 tracestate 標頭，讓各家系統附上自己的資料；要跨服務傳遞業務上的鍵值（例如客戶等級），則用另一個 baggage 標頭。訊息佇列的訊息也要帶著同樣的上下文，否則消費者那一端會開始一個新的追蹤。' },
        { type: 'p', text: '在 Kubernetes 上常見的部署方式是兩層：每個節點跑一個 Collector（DaemonSet），應用程式把 OTLP 送到本機的這一個，延遲低、不怕集中的端點暫時忙不過來；節點的 Collector 替資料補上 Pod、namespace、節點等屬性，再送到一組集中的 Collector（Deployment），在那裡做尾端取樣、遮蔽敏感屬性，最後由 exporter 送到一個或多個後端。換後端只改 exporter 的設定，服務的程式與映像檔都不用動。' },
        { type: 'callout', tone: 'warning', title: '「裝了 SDK，追蹤就會自動連起來」', text: '只要中間有一段沒有傳遞上下文，追蹤就在那裡斷成兩個：自己寫的 HTTP 用戶端沒有加上 traceparent、閘道或代理伺服器把不認得的標頭丟掉、背景工作從佇列取出訊息時沒有讀回上下文。症狀是瀑布圖在某個服務突然結束，下游卻出現一個沒有父 span、自成一棵樹的追蹤。導入時要逐一確認每一種呼叫方式都有傳遞。' },
      ],
    },
    {
      id: 'kub13-sampling', title: '取樣與高基數',
      blocks: [
        { type: 'p', text: '追蹤的資料量很大。商店的一次結帳至少 8 個 span，購物車大時更多；正式環境每天約 3,000,000 次結帳，全部保留就是每天 24,000,000 個 span，要傳輸、儲存與建立索引。而絕大多數的追蹤長得一模一樣：正常、一兩百毫秒。取樣（sampling）只保留其中一部分，問題是要保留哪一部分。' },
        { type: 'table', head: ['', '頭部取樣（head sampling）', '尾端取樣（tail sampling）'], rows: [
          ['什麼時候決定', '請求一進來、根 span 開始時', '整個追蹤完成之後'],
          ['知道結果嗎', '不知道：還不曉得會不會出錯、會不會慢', '知道：可以依錯誤、時間、屬性決定'],
          ['決定怎麼傳下去', '寫進 traceparent 的 sampled 旗標，下游照著做', '各服務先把 span 全部送出，由 Collector 決定'],
          ['成本', '低：沒保留的追蹤從一開始就不產生、不傳送', '高：要先暫存每個追蹤的所有 span，同一個追蹤的 span 還要送到同一個 Collector'],
          ['會失去什麼', '罕見的錯誤與慢請求，被隨機丟掉', '暫存的時間與記憶體；設定比較複雜'],
        ] },
        { type: 'p', text: '本課的模型以 trace id 決定比例：頭部取樣看 trace id 的最後 8 個十六進位數字，尾端取樣的「其餘的比例」看最前面 8 個，所以同一個追蹤在每個服務都得到相同的決定。尾端取樣依序檢查：有錯誤的保留、慢於門檻的保留，其餘依比例保留。下面的探索器是一天裡的 500 次結帳（示意資料），其中 7 次的卡片授權失敗、16 次慢於 800 ms；試著只用 10% 的頭部取樣，看看錯誤與慢的追蹤還剩幾個，再改用尾端取樣。' },
        { type: 'example', id: 'kub13-fleet' },
        { type: 'p', text: '取樣之後，追蹤的數量就不再等於請求的數量：保留 5% 的正常追蹤，不代表正常請求只有 5%。所以請求數、錯誤率與延遲的百分位數要由所有請求計算成指標（或在取樣之前由 span 算出），不要拿取樣後的追蹤來數；追蹤負責回答「為什麼」，指標負責回答「多少」。' },
        { type: 'p', text: '高基數（high cardinality）是指一個標籤有非常多種不同的值。指標的每一種標籤組合都是一條獨立的時間序列，要分別儲存與計算，所以序列數最多是各標籤不同值個數的乘積。依 service、name、status 計數 span 的指標，在上面的 500 次結帳裡最多是 4 × 8 × 2 = 64 條；加上一個有 80,000 位使用者的 user_id 標籤，就變成最多 5,120,000 條，記憶體與費用跟著暴增，查詢也變慢。實際出現的組合通常少於這個上限，但 user_id、order_id、trace_id 這類幾乎每個請求都不同的值，仍會讓序列數失控。' },
        { type: 'table', head: ['值', '放在指標的標籤', '放在 span 屬性或日誌欄位'], rows: [
          ['service、http.route、status、customer.tier', '可以：值的種類少而且固定', '也可以'],
          ['user_id、order_id', '不行：每位使用者、每筆訂單一條序列', '應該：查單一使用者或訂單時用它篩選追蹤與日誌'],
          ['trace_id', '不行', '放在日誌欄位；從指標連到追蹤用範例追蹤（exemplar），不用標籤'],
          ['完整的 URL、SQL 參數', '不行', '屬性可以，但先遮蔽個資；span 名稱也要用樣板（SELECT stock WHERE sku = ?），不要放參數值'],
        ] },
        { type: 'callout', tone: 'warning', title: '「把 user_id 加到指標的標籤，才能查單一使用者的延遲」', text: '這樣做會讓序列數乘上使用者人數，常常是監控系統記憶體不夠或帳單暴增的原因，而且絕大多數的序列只有零星幾個點，畫不出有意義的圖。要查某位使用者，到追蹤或日誌依 user_id 屬性篩選；要比較不同族群，改用種類少的標籤，例如 customer.tier（free、plus、business 三種）。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'kub13-q-observe', prompt: '下列哪一句最能說明監控與可觀測性的差別？',
      options: ['監控用在開發環境，可觀測性用在正式環境', '監控回答想好的問題，可觀測性能回答新問題', '可觀測性就是把儀表板的數量增加到能涵蓋每個指標', '監控只看日誌，可觀測性則只看分散式追蹤'],
      answer: 1, explanation: '監控針對已知的未知：事先決定的指標、儀表板與告警；可觀測性是能從資料回答未知的未知，不必為新問題改程式。兩者都用在正式環境，不是依環境區分；儀表板再多也只回答事先想好的問題；監控大多依賴指標，而可觀測性需要指標、日誌、追蹤三者並用。',
    },
    {
      id: 'kub13-q-pillar', prompt: '使用者抱怨某次結帳很慢，你想知道時間花在哪一個服務的哪一段。最適合回答這個問題的是哪一種資料？',
      options: ['依服務分組的錯誤率指標', '節點的 CPU 與記憶體使用率', '這個請求的分散式追蹤', '各服務 Pod 的重啟次數'],
      answer: 2, explanation: '追蹤把一個請求在每個服務的每一段工作畫在同一條時間軸上，看得出時間花在哪裡。錯誤率是聚合後的數字，看不到個別請求，而且慢不一定有錯；節點資源與重啟次數說明叢集是否健康，不會告訴你這個請求在哪一段等待。',
    },
    {
      id: 'kub13-q-n1', prompt: '一個追蹤裡，inventory 的 POST /reserve 底下有 40 個名稱相同的 SELECT stock span，每個 20 ms，一個接一個執行。最可能的修正是什麼？',
      options: ['把 40 次查詢改成一次批次查詢（例如 WHERE sku IN (…)）', '把每次查詢的逾時設定從 20 ms 調高到 100 ms', '增加 inventory 的副本數，讓 40 次查詢分散到不同的 Pod', '把 SELECT stock 的 span 從追蹤中移除'],
      answer: 0, explanation: '這是 N+1 查詢：每一項商品各查一次，時間是 40 次來回加起來，改成一次批次查詢或 JOIN 就只剩一次來回。查詢沒有逾時，調高逾時沒有意義；同一個請求的 40 次查詢依序在同一個 Pod 裡執行，多開副本不會讓它們平行；移除 span 只是看不到問題，請求一樣慢。',
    },
    {
      id: 'kub13-q-traceparent', prompt: '`traceparent` 標頭在服務之間傳遞的主要目的是什麼？',
      options: ['驗證呼叫端的身分，取代服務之間的 API 金鑰', '告訴下游服務要用哪一種日誌格式與欄位名稱', '讓負載平衡器依標頭把請求送到固定的 Pod', '讓下游 span 沿用同一個 trace id 並接上父 span'],
      answer: 3, explanation: 'traceparent 帶著 trace id、呼叫端的 span id 與取樣旗標，下游建立的 span 才能接在同一個追蹤上，這就是上下文傳遞。它不含任何憑證，不能用來驗證身分；它和日誌格式無關；負載平衡也不依它分流，它的值每個請求都不同。',
    },
    {
      id: 'kub13-q-tail', prompt: '團隊要求「每一個有錯誤的追蹤都要保留」，但只能負擔約一成的追蹤量。應該怎麼取樣？',
      options: ['頭部取樣 10%，因為錯誤的請求會比較容易被選中', '尾端取樣：追蹤完成後保留有錯誤的，其餘依比例保留', '頭部取樣 100%，再把正常的追蹤在儲存端手動刪除', '只保留 trace id 開頭是 0 的追蹤，大約就是十六分之一'],
      answer: 1, explanation: '只有尾端取樣在追蹤完成後才決定，知道它有沒有錯誤，所以能全部留下錯誤、只對其餘的取比例。頭部取樣在請求開始時決定，錯誤與否和是否被選中無關，大約只留下一成的錯誤；全部保留再手動刪除，傳輸與儲存的成本一點也沒省；依 trace id 開頭挑選和頭部取樣一樣是隨機的，同樣會丟掉錯誤。',
    },
    {
      id: 'kub13-q-cardinality', prompt: '有人想在請求延遲的指標加上 `user_id` 標籤，方便查單一使用者的延遲。比較好的做法是什麼？',
      options: ['照做，只要把這個指標的保留期限縮短就不會有問題', '改用 order_id 當標籤，因為訂單比使用者少', '把 user_id 改成雜湊值再當標籤，序列數就不會增加', '指標只用種類少的標籤，user_id 放到追蹤與日誌'],
      answer: 3, explanation: '指標的序列數是各標籤值個數的乘積，user_id 會讓它乘上使用者人數；查單一使用者應該依 span 屬性或日誌欄位篩選。縮短保留期限不會減少同時存在的序列數；訂單通常比使用者還多，而且一樣幾乎每筆不同；雜湊後的值仍是一人一個，基數完全沒變。',
    },
    {
      id: 'kub13-q-self', prompt: '在 N+1 的那次結帳裡，POST /reserve 的自身時間只有 90 ms，inventory 在關鍵路徑上卻有 890 ms。為什麼兩者差這麼多？',
      options: ['自身時間扣掉了 40 個同在 inventory 的子 span', '自身時間只計算 CPU 時間，等待資料庫的時間另外算在 checkout', '890 ms 也包含了 payments 向卡片服務請款所花的時間', '探索器把 inventory 底下的時間重複計算了兩次'],
      answer: 0, explanation: '自身時間是持續時間 890 ms 扣掉子 span 所佔的 800 ms，剩下 90 ms；而 40 個 SELECT stock 也屬於 inventory，而且一個接一個都在關鍵路徑上，所以 inventory 在路徑上共有 890 ms。自身時間不是 CPU 時間，也不會把時間算給呼叫端 checkout；payments 的 180 ms 另外算在 payments；關鍵路徑上的每一段時間只屬於一個 span，加總恰好等於整個請求的 1,130 ms，沒有重複。',
    },
  ],
  devops: {
    dashboards: [
      {
        id: 'kub13-board', title: '結帳 API 的一小時：延遲、流量、錯誤與資料庫連線',
        description: '商店團隊的 storefront 結帳 API 14:00 起 60 分鐘的四大黃金訊號（示意資料，第 0 分鐘是 14:00）。inventory v2.3 在第 36 分鐘上線、第 48 分鐘回滾；規則是「p95 超過 800 ms，持續 2 分鐘」。',
        dashboard: board(),
      },
    ],
    logs: [
      {
        id: 'kub13-logs', title: '結帳的日誌：帶著 trace_id 的 18 筆紀錄',
        description: '同一個下午與幾個請求有關的結構化日誌（示意資料，時間從 14:00:00 起算），來自 storefront、checkout、inventory 與 payments 的 Pod；關聯欄位是 trace_id，和追蹤探索器的 trace id 相同。',
        logs: checkoutLogs(),
      },
    ],
    traces: [
      {
        id: 'kub13-traces', title: '結帳的追蹤：4 個課程寫的追蹤與 200 次一般的結帳',
        description: '同一個下午的追蹤（示意資料）：正常的結帳、N+1 的結帳、等待慢查詢的訂單紀錄頁、卡片服務逾時的結帳，加上 200 次依呼叫結構產生的一般結帳。連結到結帳的日誌（trace_id）與儀表板的範例追蹤。',
        traces: checkoutTraces(), links: { logs: 'kub13-logs', dashboard: 'kub13-board' },
      },
      {
        id: 'kub13-fleet', title: '一天的樣本：500 次結帳的取樣與基數',
        description: '500 次依呼叫結構產生的結帳（示意資料，每次 8 個 span；正式環境每天約 3,000,000 次）：約 2.5% 的庫存查詢慢了 900 ms，約 1.2% 的卡片授權失敗。用它試頭部與尾端取樣，並計算標籤的基數。',
        traces: fleetTraces(), labels: ['service', 'name', 'status'],
      },
    ],
    exercises: [
      {
        id: 'kub13-x-slowest', kind: 'table', title: '最慢的請求慢在哪裡',
        statement: '在「結帳的追蹤」的所有追蹤裡，找出時間最長的那一個（trace id 可以只填前 8 碼），打開它的瀑布圖：瓶頸是哪個服務？其中最長的那個資料庫查詢 span 自身時間是幾毫秒？',
        blanks: [
          { id: 'trace', label: '最慢的追蹤（trace id）', query: { task: 'trace', traces: 'kub13-traces', metric: 'slowest' } },
          { id: 'neck', label: '瓶頸的服務', query: { task: 'trace', traces: 'kub13-traces', trace: T_SLOWDB, metric: 'bottleneck' } },
          { id: 'self', label: 'SELECT orders WHERE customer_id = ? 的自身時間（ms）', query: { task: 'trace', traces: 'kub13-traces', trace: T_SLOWDB, metric: 'self-time', span: 'SELECT orders WHERE customer_id = ?' } },
        ],
        hints: ['選追蹤的選單裡，課程寫的追蹤寫出了每一個的時間；也可以看產生的追蹤中「最慢的 10 個」確認沒有更慢的。', '瓶頸看各服務在關鍵路徑上的時間加總，不是看哪個 span 最長。', '資料庫的 span 由發出查詢的服務記錄。'],
        explanation: '最慢的是訂單紀錄頁 7e14b9c2…，2,215 ms。它的 4 個 span 中，checkout 的 SELECT orders WHERE customer_id = ? 沒有子 span，自身時間就是它的持續時間 2,160 ms；加上 SELECT order_items 的 20 ms 與 GET /orders 自己的 19 ms，checkout 在關鍵路徑上有 2,199 ms，是瓶頸。storefront 的根 span 最長，但它的自身時間只有 16 ms，它只是在等。屬性 db.rows_examined 1,840,000 指出原因：沒有索引而掃描整張表，該做的是替 customer_id 建索引，而不是增加 storefront 的副本。',
        mistakes: [
          { answer: { trace: '7e14b9c2', neck: 'storefront', self: '2160' }, why: '把持續時間最長的根 span 當成瓶頸：storefront 的 2,215 ms 幾乎都在等 checkout，自己只做了 16 ms' },
          { answer: { trace: '9b06e3d7', neck: 'payments', self: '2160' }, why: '以為有錯誤的那一個最慢：卡片服務逾時的結帳是 1,600 ms，訂單紀錄頁的 2,215 ms 更久' },
          { answer: { trace: '7e14b9c2', neck: 'checkout', self: '2199' }, why: '填了 checkout 在關鍵路徑上的總時間；題目問的是那一個查詢 span 自己的時間' },
        ],
      },
      {
        id: 'kub13-x-exemplar', kind: 'table', title: '從儀表板的尖峰到瀑布圖',
        statement: '在儀表板上找出結帳的 p95 延遲最高的那一分鐘，打開那一分鐘的範例追蹤（trace id 可以只填前 8 碼）。這個追蹤的瓶頸是哪個服務？它在關鍵路徑上佔了幾毫秒？',
        blanks: [
          { id: 'minute', label: 'p95 最高的分鐘（第幾分鐘）', query: { task: 'series', dashboard: 'kub13-board', series: 'p95', metric: 'max-at' } },
          { id: 'trace', label: '那一分鐘的範例追蹤', query: { task: 'trace', traces: 'kub13-traces', metric: 'exemplar', series: 'p95', minute: 41 } },
          { id: 'neck', label: '瓶頸的服務', query: { task: 'trace', traces: 'kub13-traces', trace: T_N1, metric: 'bottleneck' } },
          { id: 'ms', label: '瓶頸在關鍵路徑上的時間（ms）', query: { task: 'trace', traces: 'kub13-traces', trace: T_N1, metric: 'bottleneck-time' } },
        ],
        hints: ['p95 的圖下方有每 10 分鐘一列的表格；最大值也寫在圖的說明裡。', '追蹤探索器的「範例追蹤」依分鐘列出，按下就會開啟。', '瀑布圖上方寫出各服務在關鍵路徑上的時間。'],
        explanation: 'p95 在第 41 分鐘最高（1,190 ms），那一分鐘的範例是 c3a91e5f…，一次 1,130 ms 的結帳。瀑布圖裡 inventory 的 POST /reserve 底下有 40 個 SELECT stock WHERE sku = ?，每個 20 ms、依序執行；這些查詢與 POST /reserve 自己的 90 ms 都在關鍵路徑上，inventory 合計 890 ms，是瓶頸。payments 的 180 ms 排第二。這是 inventory v2.3 的 N+1 查詢，回滾後 p95 回到 160 ms 左右。',
        mistakes: [
          { answer: { minute: '36', trace: 'c3a91e5f', neck: 'inventory', ms: '890' }, why: '填了延遲開始上升的分鐘；題目問的是 p95 最高的那一分鐘' },
          { answer: { minute: '41', trace: 'c3a91e5f', neck: 'inventory', ms: '20' }, why: '只看了一個 SELECT stock 的時間：N+1 的問題在於 40 個加起來，而不是任何一個特別慢' },
          { answer: { minute: '41', trace: 'c3a91e5f', neck: 'storefront', ms: '1130' }, why: '把根 span 的持續時間當成瓶頸：storefront 自己只做了 16 ms，其餘時間都在等下游' },
        ],
      },
      {
        id: 'kub13-x-reserve', kind: 'choice', title: 'N+1 迴圈裡的自身時間',
        statement: '在 N+1 的那次結帳（c3a91e5f…）裡，inventory 的 POST /reserve 自身時間是多少？',
        query: { task: 'trace', traces: 'kub13-traces', trace: T_N1, metric: 'self-time', span: 'POST /reserve' },
        options: [{ value: '20', label: '20 ms' }, { value: '90', label: '90 ms' }, { value: '890', label: '890 ms' }, { value: '1130', label: '1,130 ms' }],
        hints: ['自身時間 = 持續時間 − 子 span 所佔的時間（重疊的部分只扣一次）。', 'POST /reserve 持續 890 ms，底下有 40 個不重疊的 20 ms 查詢。'],
        explanation: 'POST /reserve 從第 20 ms 到第 910 ms，持續 890 ms；40 個查詢依序執行、彼此不重疊，共佔 800 ms，所以自身時間是 890 − 800 = 90 ms，也就是查詢之間的空檔與它自己的處理。20 ms 是一個查詢的時間，890 ms 是它的持續時間，1,130 ms 是整個請求。自身時間小不代表這個服務沒問題：時間在它發出的查詢裡。',
        mistakes: [
          { answer: { choice: '2' }, why: '把持續時間當成自身時間，沒有扣掉 40 個子 span' },
          { answer: { choice: '0' }, why: '選了單一查詢的時間；自身時間屬於 POST /reserve 本身，不是它的子 span' },
        ],
      },
      {
        id: 'kub13-x-follow', kind: 'table', title: '從客訴的日誌追到追蹤',
        statement: '客服轉來客訴：訂單 K-2093 結帳失敗。在「結帳的日誌」篩選 order_id = K-2093，找到它的 trace_id，再用「關聯」與追蹤探索器回答：第一個記下錯誤的是哪個服務？帶著這個 trace_id 的日誌有幾筆？這個追蹤有幾個錯誤的 span？瓶頸在關鍵路徑上佔了幾毫秒？',
        blanks: [
          { id: 'first', label: '第一個出錯的服務', query: { task: 'correlate', logs: 'kub13-logs', id: T_TIMEOUT, metric: 'first-error-service' } },
          { id: 'records', label: '帶著這個 trace_id 的日誌（筆）', query: { task: 'trace', traces: 'kub13-traces', trace: T_TIMEOUT, metric: 'log-records' } },
          { id: 'errors', label: '錯誤的 span（個）', query: { task: 'trace', traces: 'kub13-traces', trace: T_TIMEOUT, metric: 'error-spans' } },
          { id: 'ms', label: '瓶頸在關鍵路徑上的時間（ms）', query: { task: 'trace', traces: 'kub13-traces', trace: T_TIMEOUT, metric: 'bottleneck-time' } },
        ],
        hints: ['篩選的欄位選 order_id、比較選 =、值填 K-2093；四筆紀錄的 trace_id 相同。', '在「關聯」選這個 trace_id：第一筆 error 等級的紀錄是哪個服務寫的？', '在追蹤探索器選同一個追蹤，下方會列出帶著它的日誌；瀑布圖上方寫出各服務在關鍵路徑上的時間。'],
        explanation: 'order_id = K-2093 的四筆紀錄都帶著 trace_id 9b06e3d7…，依它關聯共有 6 筆：storefront → checkout → inventory → payments → checkout → storefront，第一筆 error 是 payments 的 card provider timeout。追蹤裡 provider.authorize 等了 1,500 ms 才逾時，加上 POST /charge 自己的 18 ms，payments 在關鍵路徑上佔 1,518 ms；從 provider.authorize 到 storefront 共 4 個 span 標成錯誤。使用者看到的是 storefront 的 502，但源頭是外部卡片服務沒有回應：下一步要看逾時與重試的設定，以及卡片服務的狀態。',
        mistakes: [
          { answer: { first: 'storefront', records: '6', errors: '4', ms: '1518' }, why: '把回給使用者 502 的 storefront 當成源頭：它只是轉達下游的失敗，payments 更早記下錯誤' },
          { answer: { first: 'payments', records: '4', errors: '4', ms: '1518' }, why: '只數了篩選 order_id 後的紀錄；storefront 的兩筆沒有 order_id 欄位，卻帶著同一個 trace_id' },
          { answer: { first: 'payments', records: '6', errors: '1', ms: '1500' }, why: '只看了逾時的那一個 span：錯誤一路傳回 storefront，四個 span 都標成錯誤，payments 在路徑上還有 POST /charge 自己的 18 ms' },
        ],
      },
      {
        id: 'kub13-x-head', kind: 'table', title: '只用頭部取樣 10%',
        statement: '在「一天的樣本」的 500 次結帳上只用 10% 的頭部取樣（不用尾端取樣）。會保留幾個追蹤？樣本裡有錯誤的追蹤有幾個，其中保留了幾個？慢於 800 ms 的追蹤保留了幾個？',
        blanks: [
          { id: 'kept', label: '保留的追蹤（個）', query: { task: 'sampling', traces: 'kub13-fleet', metric: 'kept', policy: fleetHead10 } },
          { id: 'errors', label: '有錯誤的追蹤（個）', query: { task: 'sampling', traces: 'kub13-fleet', metric: 'error-traces' } },
          { id: 'keptErrors', label: '保留的有錯誤的追蹤（個）', query: { task: 'sampling', traces: 'kub13-fleet', metric: 'kept-errors', policy: fleetHead10 } },
          { id: 'keptSlow', label: '保留的慢於 800 ms 的追蹤（個）', query: { task: 'sampling', traces: 'kub13-fleet', metric: 'kept-slow', policy: fleetHead10, slowerThan: 800 } },
        ],
        hints: ['在探索器的取樣表單把頭部比例設成 10%、尾端取樣選「不用」，「列為慢的門檻」填 800。', '結果的表格列出全部、保留與比例。', '頭部取樣依 trace id 決定，和結果無關，所以不會剛好是 50 個。'],
        explanation: '頭部取樣 10% 保留了 57 個追蹤（依 trace id 決定，期望值約 50，實際會有起伏）。7 個有錯誤的追蹤只留下 2 個，16 個慢於 800 ms 的也只留下 2 個：頭部取樣在請求開始時就決定了，不知道它之後會出錯或變慢，所以這些最值得看的追蹤和一般的追蹤一樣，大約只留下一成。估計每天保留的 span 是 2,736,000 個，量是省下來了，代價是大部分的錯誤看不到。',
        mistakes: [
          { answer: { kept: '57', errors: '7', keptErrors: '7', keptSlow: '16' }, why: '以為頭部取樣會優先保留錯誤與慢的追蹤；它在知道結果之前就決定了' },
          { answer: { kept: '50', errors: '7', keptErrors: '2', keptSlow: '2' }, why: '直接用 500 × 10% 算保留的數量；每個追蹤依 trace id 個別決定，實際保留的是 57 個' },
        ],
      },
      {
        id: 'kub13-x-sampling', kind: 'sampling-plan', title: '留下該留的追蹤',
        statement: '為「一天的樣本」設計取樣：每一個有錯誤的追蹤、每一個慢於 800 ms 的追蹤都要保留，而估計每天保留的 span 最多 2,400,000 個（不取樣時是 24,000,000 個）。',
        sampling: { traces: 'kub13-fleet', constraints: { keepAllErrors: true, keepSlowerThan: 800, maxSpansPerDay: 2_400_000 },
          reference: { headPermille: 1000, tail: { keepErrors: true, slowerThanMs: 800, restPermille: 50 } } },
        hints: ['頭部取樣丟掉的追蹤，尾端取樣就看不到了；要保留全部的錯誤，頭部要先全收。', '尾端取樣依序檢查：有錯誤、慢於門檻，最後才是其餘的比例。', '其餘的比例決定了大部分的量：先試 5%，再看每天的 span 有沒有超過上限。'],
        explanation: '頭部取樣 100%（全部交給尾端決定），尾端保留有錯誤的追蹤與慢於 800 ms 的追蹤，其餘保留 5%：共保留 46 個追蹤、368 個 span，估計每天 2,208,000 個 span，7 個錯誤與 16 個慢的追蹤全部留下。其餘的比例提高到 10% 就會超過上限；頭部先丟掉一半，尾端就只看得到一半的錯誤。代價是每個 span 都要先送到 Collector 暫存，等追蹤完成才決定。',
        mistakes: [
          { answer: { head: '10', tail: 'off', errors: 'no', slower: '', rest: '' }, why: '只用頭部取樣：7 個錯誤只留下 2 個，16 個慢的也只留下 2 個，每天的量還超過上限' },
          { answer: { head: '100', tail: 'on', errors: 'yes', slower: '', rest: '5' }, why: '沒有設定慢的門檻：慢於 800 ms 的追蹤大多沒有錯誤，只能靠 5% 的比例碰運氣' },
          { answer: { head: '100', tail: 'on', errors: 'yes', slower: '800', rest: '10' }, why: '其餘的比例太高：估計每天 2,976,000 個 span，超過上限' },
          { answer: { head: '50', tail: 'on', errors: 'yes', slower: '800', rest: '5' }, why: '頭部先丟掉約一半的追蹤，尾端看不到那些錯誤與慢的追蹤' },
        ],
      },
      {
        id: 'kub13-x-cardinality', kind: 'table', title: '修好一個高基數的指標',
        statement: '團隊依 span 產生一個計數指標，標籤是 service、name、status。依「一天的樣本」的 span 計算：它最多有幾條序列？有人加上 user_id 標籤（正式環境約 80,000 位使用者）之後最多幾條？改成拿掉 user_id、加上 customer.tier（free、plus、business 三種）呢？',
        blanks: [
          { id: 'base', label: 'service、name、status（條）', query: { task: 'cardinality', traces: 'kub13-fleet', labels: ['service', 'name', 'status'], metric: 'series' } },
          { id: 'users', label: '再加上 user_id（條）', query: { task: 'cardinality', traces: 'kub13-fleet', labels: ['service', 'name', 'status', { name: 'user_id', values: 80000 }], metric: 'series' } },
          { id: 'tier', label: '改成加上 customer.tier（條）', query: { task: 'cardinality', traces: 'kub13-fleet', labels: ['service', 'name', 'status', { name: 'customer.tier', values: 3 }], metric: 'series' } },
        ],
        hints: ['在探索器的基數表格勾選 service、name、status，看各有幾個不同的值。', '序列數最多是各標籤不同值個數的乘積，不是相加。', '用「假設再加一個標籤」填入名稱與個數。'],
        explanation: '樣本裡有 4 個服務、8 種操作名稱、2 種狀態，所以最多 4 × 8 × 2 = 64 條序列。加上 80,000 個值的 user_id，上限變成 64 × 80,000 = 5,120,000 條，是原本的 80,000 倍；改用只有 3 個值的 customer.tier 是 64 × 3 = 192 條。實際出現的組合會少於上限，但 user_id 讓它跟著使用者人數成長。查單一使用者時，用追蹤與日誌的 user_id 屬性篩選即可。',
        mistakes: [
          { answer: { base: '14', users: '80014', tier: '17' }, why: '把各標籤的值個數相加；每一種組合都是一條序列，要相乘' },
          { answer: { base: '64', users: '5120000', tier: '15360000' }, why: '只把 customer.tier 加上去而沒有拿掉 user_id，序列數又乘了 3；題目是用 customer.tier 取代 user_id' },
        ],
      },
    ],
  },
};

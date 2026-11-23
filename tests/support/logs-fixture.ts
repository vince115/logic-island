import type { LessonContent } from '@/content/curriculum/schema';
import type { LogSet } from '@/lib/devops/logs';
import type { DevopsExercise, DevopsLessonContent, LogsExplorer } from '@/lib/devops/types';

/*
 * CICD-0 D4: centralized-log data checked by hand (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.4). Only for tests; no
 * real lesson file uses it.
 */

/**
 * small: nine written records, no generated traffic (written out of order once: r-2 at 0:02 comes after 0:03 here).
 * In time order (n): 1 0:00 gateway info r-1 · 2 0:01 orders info r-1 · 3 0:02 gateway info r-2 · 4 0:03 payments error
 * r-1 · 5 0:04 orders warn r-1 · 6 0:05 gateway error r-1 · 7 0:06 gateway info r-3 · 8 0:08 auth debug r-4 ·
 * 9 0:09 gateway info r-4.
 * - warn and above: 4, 5, 6 (3); gateway: 1, 3, 6, 7, 9 (5); status >= 500: 4, 6 (2); 0:02 to 0:06 (not included): 3–6 (4).
 * - largest duration_ms 5000 (n 6, r-1); most frequent user_id u-7 (1, 2, 6, 7); 3 distinct users, 4 request ids.
 * - status: 200 ×4, 502 ×2, missing on 2, 5, 8 (3).
 * - r-1: gateway → orders → payments → orders → gateway, Δ —, +1, +2, +1, +1, 5 seconds, first error in payments.
 * - Sensitive: amy@example.com (payments' message and user_email, raw line l1), the card 4111 1111 1111 1111 (message),
 *   the token tok_9f8e7d6c5b4a (authorization), the password hunter2 (auth's debug record).
 */
export const small = (): LogSet => ({
  records: [
    { ts: 0, service: 'gateway', host: 'gw-1', level: 'info', message: 'POST /checkout received', fields: { request_id: 'r-1', user_id: 'u-7', path: '/checkout', status: 200, duration_ms: 900 } },
    { ts: '0:01', service: 'orders', host: 'ord-1', level: 'info', message: 'order A-1001 created', fields: { request_id: 'r-1', user_id: 'u-7', order_id: 'A-1001' } },
    { ts: 3, service: 'payments', host: 'pay-1', level: 'error', message: 'charge failed for amy@example.com card 4111 1111 1111 1111',
      fields: { request_id: 'r-1', user_email: 'amy@example.com', authorization: 'Bearer tok_9f8e7d6c5b4a', status: 502, duration_ms: 2000 } },
    { ts: 2, service: 'gateway', host: 'gw-2', level: 'info', message: 'GET /products 200', fields: { request_id: 'r-2', user_id: 'u-8', path: '/products', status: 200, duration_ms: 40 } },
    { ts: 4, service: 'orders', host: 'ord-1', level: 'warn', message: 'payment failed, order A-1001 cancelled', fields: { request_id: 'r-1', order_id: 'A-1001' } },
    { ts: 5, service: 'gateway', host: 'gw-1', level: 'error', message: 'POST /checkout 502', fields: { request_id: 'r-1', user_id: 'u-7', path: '/checkout', status: 502, duration_ms: 5000 } },
    { ts: 6, service: 'gateway', host: 'gw-2', level: 'info', message: 'GET /products 200', fields: { request_id: 'r-3', user_id: 'u-7', path: '/products', status: 200, duration_ms: 35 } },
    { ts: 8, service: 'auth', host: 'auth-1', level: 'debug', message: 'login ok', fields: { request_id: 'r-4', user_id: 'u-9', password: 'hunter2', duration_ms: 15 } },
    { ts: '0:09', service: 'gateway', host: 'gw-1', level: 'info', message: 'POST /login 200', fields: { request_id: 'r-4', user_id: 'u-9', path: '/login', status: 200, duration_ms: 60 } },
  ],
  raw: [
    { id: 'l1', text: '2026-11-24 10:00:03 ERROR payment failed for amy@example.com' },
    { id: 'l2', text: '{"ts":3,"level":"error","service":"payments","request_id":"r-1"}' },
    { id: 'l3', text: 'level=error service=payments request_id=r-1 msg="charge failed"' },
    { id: 'l4', text: '付款失敗，請稍後再試' },
  ],
  perDay: 2_000_000,
});

/**
 * shop: 400 generated records (seed 2026, 0:00–15:00, gateway/catalog/orders, info, 20–400 ms) and nine written ones:
 * chk-501 at 10:01–10:09 (gateway → orders → payments → orders → gateway, warn at 10:03, first error in payments at
 * 10:08, 8 seconds, 8000 ms at the gateway) and chk-502 at 10:40–10:46 (gateway → payments → gateway, 6000 ms).
 * Errors: 10:08, 10:09 ×2, 10:41, 10:46 (5; the generated records are all info), warn and above 6; the slowest request is
 * chk-501 (generated durations are at most 400 ms).
 */
export const shop = (): LogSet => ({
  records: [
    { ts: '10:01', service: 'gateway', host: 'gateway-1', level: 'info', message: 'POST /checkout received', fields: { request_id: 'chk-501', user_id: 'u-1042', path: '/checkout' } },
    { ts: '10:02', service: 'orders', host: 'orders-1', level: 'info', message: 'order B-2001 created', fields: { request_id: 'chk-501', order_id: 'B-2001' } },
    { ts: '10:03', service: 'payments', host: 'payments-1', level: 'warn', message: 'payment provider slow, retrying', fields: { request_id: 'chk-501', attempt: 1 } },
    { ts: '10:08', service: 'payments', host: 'payments-1', level: 'error', message: 'payment provider timeout after 5s', fields: { request_id: 'chk-501', attempt: 2 } },
    { ts: '10:09', service: 'orders', host: 'orders-1', level: 'error', message: 'order B-2001 failed: payment error', fields: { request_id: 'chk-501', order_id: 'B-2001' } },
    { ts: '10:09', service: 'gateway', host: 'gateway-1', level: 'error', message: 'POST /checkout 504', fields: { request_id: 'chk-501', user_id: 'u-1042', path: '/checkout', status: 504, duration_ms: 8000 } },
    { ts: '10:40', service: 'gateway', host: 'gateway-2', level: 'info', message: 'POST /checkout received', fields: { request_id: 'chk-502', user_id: 'u-1077', path: '/checkout' } },
    { ts: '10:41', service: 'payments', host: 'payments-1', level: 'error', message: 'payment provider timeout after 5s', fields: { request_id: 'chk-502', attempt: 1 } },
    { ts: '10:46', service: 'gateway', host: 'gateway-2', level: 'error', message: 'POST /checkout 504', fields: { request_id: 'chk-502', user_id: 'u-1077', path: '/checkout', status: 504, duration_ms: 6000 } },
  ],
  traffic: { seed: 2026, count: 400, from: 0, to: 900, services: ['gateway', 'catalog', 'orders'], paths: ['/products', '/products/42', '/cart', '/checkout'], users: 200, durationMs: { min: 20, max: 400 } },
  perDay: 1_500_000,
});

const checks = { mustHide: ['amy@example.com', '4111 1111 1111 1111', 'tok_9f8e7d6c5b4a', 'hunter2'], mustKeep: ['r-1', 'A-1001', '/checkout', 'u-7'] };
export const logExplorers = (): LogsExplorer[] => [
  { id: 'small', title: '一次失敗的結帳', description: '九筆紀錄、四個服務，加上四行程式直接印出的日誌。', logs: small(), masking: ['field password'], checks },
  { id: 'shop', title: '商店的十五分鐘', description: '400 筆一般流量與兩次付款逾時。', logs: shop() },
  { id: 'masking', title: '遮蔽之前與之後', description: '同一次失敗的結帳，從四條遮蔽規則開始。', logs: small(), masking: ['pattern email', 'pattern card', 'pattern token', 'field password'], checks },
];

export const logExercises = (): DevopsExercise[] => [
  { id: 'l-errors', kind: 'number', title: '有幾筆錯誤', statement: '商店的十五分鐘裡，等級是錯誤（error）的紀錄有幾筆？',
    blank: { id: 'n', label: '錯誤紀錄的筆數', query: { task: 'logs', logs: 'shop', metric: 'count', filter: { minLevel: 'error' } } },
    hints: ['把最低等級設成錯誤。'], explanation: '一般流量都是資訊等級；兩次付款逾時一共留下 5 筆錯誤。',
    mistakes: [{ answer: { value: '6' }, why: '把警告也算進去了' }] },
  { id: 'l-first', kind: 'field', title: '第一個錯誤', statement: '第一筆錯誤紀錄是什麼時候？（分:秒）',
    blank: { id: 't', label: '第一筆錯誤的時間', query: { task: 'logs', logs: 'shop', metric: 'first-ts', filter: { minLevel: 'error' } } },
    hints: ['篩選後看第一筆。'], explanation: '10:03 是警告；第一個錯誤是 10:08 付款服務的逾時。',
    mistakes: [{ answer: { value: '10:03' }, why: '把重試的警告當成錯誤' }] },
  { id: 'l-slowest', kind: 'field', title: '最慢的請求', statement: '哪一個 request_id 的 duration_ms 最大？',
    blank: { id: 'id', label: 'request_id', query: { task: 'logs', logs: 'shop', metric: 'max-by', field: 'duration_ms' } },
    hints: ['用 duration_ms 排序，或篩選 duration_ms > 1000。'], explanation: '閘道記下 chk-501 花了 8000 ms。',
    mistakes: [{ answer: { value: 'chk-502' }, why: '只看了最後一次逾時' }] },
  { id: 'l-trace', kind: 'table', title: '追蹤一個請求', statement: '用 request_id r-1 把「一次失敗的結帳」串起來。',
    blanks: [
      { id: 'path', label: '依序經過的服務', query: { task: 'correlate', logs: 'small', id: 'r-1', metric: 'services' } },
      { id: 'secs', label: '從第一筆到最後一筆（秒）', query: { task: 'correlate', logs: 'small', id: 'r-1', metric: 'elapsed' } },
      { id: 'first', label: '第一個出錯的服務', query: { task: 'correlate', logs: 'small', id: 'r-1', metric: 'first-error-service' } },
    ],
    hints: ['同一個 request_id 的紀錄依時間排好。'], explanation: '閘道 → 訂單 → 付款 → 訂單 → 閘道，0:00 到 0:05；付款在 0:03 先出錯，閘道最後回 502。',
    mistakes: [{ answer: { path: 'gateway, orders, payments', secs: '5', first: 'payments' }, why: '同一個服務只寫了一次' }, { answer: { path: 'gateway orders payments orders gateway', secs: '5', first: 'gateway' }, why: '把最後回應錯誤的閘道當成源頭' }] },
  { id: 'l-format', kind: 'choice', title: '結構化的日誌', statement: '原始行 l3 是結構化的日誌嗎？',
    query: { task: 'log-format', logs: 'small', line: 'l3', metric: 'format' },
    options: [{ value: 'structured', label: '是：每個值都有欄位名稱' }, { value: 'unstructured', label: '不是：只是一行文字' }],
    hints: ['key=value 也是結構。'], explanation: '每一段都是「欄位=值」，可以直接依欄位篩選。', mistakes: [{ answer: { choice: '1' }, why: '以為只有 JSON 才算結構化' }] },
  { id: 'l-retention', kind: 'table', title: '保留要多少空間', statement: '每天 1,500,000 筆、平均每筆 300 位元組，保留 30 天。',
    blanks: [
      { id: 'day', label: '每天的位元組', query: { task: 'retention', logs: 'shop', avgBytes: 300, days: 30, metric: 'bytes-per-day' } },
      { id: 'gb', label: '30 天共幾 GB（小數一位）', query: { task: 'retention', logs: 'shop', avgBytes: 300, days: 30, metric: 'total-gb' } },
    ],
    hints: ['1 GB 是 10 億位元組。'], explanation: '1,500,000 × 300 = 450,000,000 位元組；× 30 = 13,500,000,000 = 13.5 GB。',
    mistakes: [{ answer: { day: '450000000', gb: '0.5' }, why: '忘了乘以天數' }] },
  { id: 'l-redact', kind: 'redact', title: '送出前先遮蔽', statement: '寫遮蔽規則：電子郵件、卡號、權杖與密碼都不能出現，但除錯需要的 ID 與路徑要留下。',
    redact: { logs: 'small', ...checks, reference: ['pattern email', 'pattern card', 'pattern token', 'field password'] },
    hints: ['訊息裡也有電子郵件與卡號。', '太寬的樣式會連訂單編號一起遮掉。'],
    explanation: '欄位規則只遮那個欄位；訊息裡的個資要靠樣式。digits 會把 A-1001 也遮掉。',
    mistakes: [
      { answer: { rules: 'field user_email\nfield authorization\nfield password' }, why: '只遮欄位，訊息裡的電子郵件與卡號還在' },
      { answer: { rules: 'pattern digits\npattern email\npattern token\nfield password' }, why: '數字樣式太寬，訂單編號也被遮掉' },
      { answer: { rules: 'pattern email\npattern card\npattern token' }, why: '忘了除錯紀錄裡的密碼' },
    ] },
];

export const logsContent = (): DevopsLessonContent => ({ logs: logExplorers(), exercises: logExercises() });

const p = (text: string) => ({ type: 'p' as const, text });
/**
 * The devops-explorer part of a CICD12-shaped lesson (monitoring-dashboard, logs only), passing validateContent and
 * publishProblems for a meta with devops-explorer alone (the real CICD12 adds a terminal part, written by the lesson writer).
 */
export const logsLesson = (): LessonContent => ({
  lessonId: 'CICD12' as LessonContent['lessonId'],
  motivation: '服務出錯時，指標告訴你「有問題」，日誌告訴你「哪裡、為什麼」。把每個服務的日誌集中起來、用同一個 ID 串起一個請求，才能在幾分鐘內找到源頭。',
  sections: [
    { id: 'structured', title: '結構化日誌與集中收集', blocks: [
      p('結構化日誌把每一筆寫成有欄位的紀錄（時間、服務、等級、訊息與 request_id 等欄位）；日誌收集再把每個服務的紀錄送到同一個地方。有欄位就能依欄位篩選與分組，不必在純文字裡猜。'),
      { type: 'example', id: 'small' }] },
    { id: 'correlate', title: '用關聯 ID 追蹤請求與保留期限', blocks: [
      p('同一個請求經過的每個服務都記下同一個關聯 ID（這裡是 request_id），依時間排好就是這個請求的路徑；最先出錯的服務通常才是源頭。保留期限決定了要準備多少儲存空間。'),
      { type: 'example', id: 'shop' }] },
    { id: 'redaction', title: '遮蔽敏感資料', blocks: [
      p('日誌集中之後，很多人與工具都讀得到它，也會保留很久。敏感資料遮蔽要在送出之前做：密碼、權杖、電子郵件與卡號換成 ***；但遮得太多，除錯需要的 ID 也會不見。'),
      { type: 'example', id: 'masking' }] },
  ],
  examples: [], exercises: [],
  quiz: [
    { id: 'q1', prompt: '結構化日誌最大的好處是什麼？', options: ['可以依欄位篩選與分組', '檔案比較小', '不需要時間'], answer: 0, explanation: '每個值都有名稱，工具可以直接依欄位篩選、分組與計數；純文字只能用字串搜尋。' },
    { id: 'q2', prompt: 'request_id 這類關聯 ID 的用途是什麼？', options: ['把同一個請求在各服務的紀錄串起來', '加密日誌', '決定保留天數'], answer: 0, explanation: '每個服務都記下同一個 ID，依時間排好就看得到請求經過的路徑與每一段花的時間。' },
    { id: 'q3', prompt: '為什麼送出日誌前要遮蔽敏感資料？', options: ['集中的日誌有很多人看得到，也會保留很久', '讓日誌變短', '讓查詢變快'], answer: 0, explanation: '日誌被集中保存、很多人與工具都讀得到；密碼、權杖與個資一旦寫進去就很難收回。' },
    { id: 'q4', prompt: '保留空間大約怎麼估？', options: ['每天筆數 × 平均大小 × 保留天數', '服務數 × 天數', '錯誤筆數 × 天數'], answer: 0, explanation: '先估每天的量，再乘上保留的天數；壓縮與副本在這之上另外計算。' },
  ],
  devops: logsContent(),
});

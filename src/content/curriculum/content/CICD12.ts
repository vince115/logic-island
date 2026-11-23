import type { LogRecordInput, LogSet } from '@/lib/devops/logs';
import type { TerminalExample, TerminalExercise, TerminalFile, TerminalMachine, TerminalRemote, TerminalVariant } from '@/lib/terminal/lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

/*
 * CICD12 集中式日誌 (monitoring-dashboard: the devops-explorer's logs, D4, plus a terminal part on the scripting profile,
 * engine stages E2 text tools, E7 ssh and E8 the Bash interpreter). A made-up online tea shop, Lantern Tea (lantern.example),
 * with three services: gateway → orders → payments. One morning the card provider times out; the on-call engineer (the
 * learner) follows the failing checkout chk-3a97 through the centrally collected logs. The same written records feed the
 * explorers (time = seconds from 10:00:00 UTC) and the JSON Lines files on the log host logs-01 (ISO 8601 UTC times with
 * milliseconds, keeping the order inside a second), so the explorer and grep agree. A variant morning (ANOTHER_MORNING)
 * changes three checkouts so the terminal exercises' answers cannot be typed in. Some records leak a demo e-mail address, the well-known test card number 4111 1111 1111 1111
 * and a demo token. Every exercise answer of the explorer part is computed by src/lib/devops (none is written here);
 * every transcript output was produced by replaying it on the engine. Organisation, people, hosts and values are made up.
 */

// ---------------------------------------------------------------------------------------------------- the records
type Level = LogRecordInput['level'];
type Fields = Record<string, string | number>;
/** Whole seconds from 10:00:00 UTC. */
const rec = (ts: number, service: string, host: string, level: Level, message: string, fields: Fields): LogRecordInput => ({ ts, service, host, level, message, fields });
const gw = (ts: number, host: string, level: Level, message: string, fields: Fields) => rec(ts, 'gateway', host, level, message, fields);
const ord = (ts: number, level: Level, message: string, fields: Fields) => rec(ts, 'orders', 'orders-1', level, message, fields);
const pay = (ts: number, level: Level, message: string, fields: Fields) => rec(ts, 'payments', 'payments-1', level, message, fields);

interface Checkout { id: string; user: string; order: string; host: string; start: number }
/** A browsing request: only the gateway writes it. */
const browse = (id: string, ts: number, host: string, path: string, user: string, ms: number) =>
  [gw(ts, host, 'info', `GET ${path} 200`, { request_id: id, user_id: user, path, status: 200, duration_ms: ms })];
/** A checkout that succeeds (with a retried 503 from the card provider when retryAt is set). */
function paid(c: Checkout, at: number, payMs: number, totalMs: number, retryAt?: number): LogRecordInput[] {
  const id = { request_id: c.id };
  return [
    gw(c.start, c.host, 'info', 'POST /checkout received', { ...id, user_id: c.user, path: '/checkout' }),
    ord(c.start, 'info', `order ${c.order} created`, { ...id, order_id: c.order }),
    ...retryAt === undefined ? [] : [pay(retryAt, 'warn', 'card provider returned 503, retrying', { ...id, order_id: c.order, status: 503, attempt: 1 })],
    pay(at, 'info', 'charge approved', { ...id, order_id: c.order, status: 200, duration_ms: payMs }),
    ord(at, 'info', `order ${c.order} paid`, { ...id, order_id: c.order }),
    gw(at, c.host, 'info', 'POST /checkout 200', { ...id, user_id: c.user, path: '/checkout', status: 200, duration_ms: totalMs }),
  ];
}
/** A checkout whose charge times out after 5 seconds. */
function timedOut(c: Checkout, at: number, totalMs: number): LogRecordInput[] {
  const id = { request_id: c.id };
  return [
    gw(c.start, c.host, 'info', 'POST /checkout received', { ...id, user_id: c.user, path: '/checkout' }),
    ord(c.start, 'info', `order ${c.order} created`, { ...id, order_id: c.order }),
    pay(at, 'error', 'charge failed: card provider timeout', { ...id, order_id: c.order, status: 504, duration_ms: 5000, attempt: 1 }),
    ord(at, 'error', `order ${c.order} failed: payment error`, { ...id, order_id: c.order, status: 502 }),
    gw(at, c.host, 'error', 'POST /checkout 502', { ...id, user_id: c.user, path: '/checkout', status: 502, duration_ms: totalMs }),
  ];
}

const DEMO_EMAIL = 'mei.lin@example.com';
const DEMO_CARD = '4111 1111 1111 1111';
const DEMO_TOKEN = 'tok_demo7c41e9b2';
/** chk-3a97, the request the lesson follows: retried, timed out, and logged the customer's e-mail, card and the token. */
const TRACED: LogRecordInput[] = [
  gw(70, 'gateway-2', 'info', 'POST /checkout received', { request_id: 'chk-3a97', user_id: 'u-3107', path: '/checkout' }),
  ord(70, 'info', 'order T-5007 created', { request_id: 'chk-3a97', order_id: 'T-5007' }),
  pay(70, 'debug', 'calling card provider', { request_id: 'chk-3a97', order_id: 'T-5007', authorization: `Bearer ${DEMO_TOKEN}` }),
  pay(71, 'warn', 'card provider slow, retrying', { request_id: 'chk-3a97', order_id: 'T-5007', attempt: 1 }),
  pay(76, 'error', `charge failed for ${DEMO_EMAIL} card ${DEMO_CARD}: provider timeout`, { request_id: 'chk-3a97', order_id: 'T-5007', user_email: DEMO_EMAIL, status: 504, duration_ms: 5200, attempt: 2 }),
  ord(77, 'error', 'order T-5007 failed: payment error', { request_id: 'chk-3a97', order_id: 'T-5007', status: 502 }),
  gw(77, 'gateway-2', 'error', 'POST /checkout 502', { request_id: 'chk-3a97', user_id: 'u-3107', path: '/checkout', status: 502, duration_ms: 7300 }),
];
const H: Checkout = { id: 'chk-3a98', user: 'u-1550', order: 'T-5008', host: 'gateway-1', start: 90 };
const J: Checkout = { id: 'chk-3aa0', user: 'u-2048', order: 'T-5009', host: 'gateway-2', start: 140 };
/**
 * The five minutes from 10:00 (37 records): chk-3a91, 3a93, 3a95 (one 503 retried) and 3aa0 pay; chk-3a97 and 3a98 time
 * out; 3a92, 3a94, 3a96 and 3a99 only browse. status ≥ 500: gateway 2, orders 2, payments 3 (7); errors 6, warn 2.
 * The variant (another morning, for the terminal exercises): chk-3a95 runs on gateway-2 and waits longer, chk-3a98 pays
 * after a 503 and chk-3aa0 times out instead (status ≥ 500: gateway 2, orders 2, payments 4).
 */
function checkoutRecords(variant = false): LogRecordInput[] {
  return [
    ...paid({ id: 'chk-3a91', user: 'u-2048', order: 'T-5001', host: 'gateway-1', start: 12 }, 13, 640, 1180),
    ...browse('chk-3a92', 25, 'gateway-2', '/teas', 'u-1877', 35),
    ...paid({ id: 'chk-3a93', user: 'u-1877', order: 'T-5002', host: 'gateway-2', start: 40 }, 41, 710, 1240),
    ...browse('chk-3a94', 58, 'gateway-1', '/teas/oolong', 'u-2210', 41),
    ...variant
      ? paid({ id: 'chk-3a95', user: 'u-2210', order: 'T-5003', host: 'gateway-2', start: 62 }, 67, 2200, 4900, 64)
      : paid({ id: 'chk-3a95', user: 'u-2210', order: 'T-5003', host: 'gateway-1', start: 62 }, 65, 1900, 3050, 63),
    ...browse('chk-3a96', 68, 'gateway-1', '/cart', 'u-3107', 28),
    ...TRACED,
    ...variant ? paid({ ...H, host: 'gateway-2' }, 94, 2600, 4100, 91) : timedOut(H, 95, 5400),
    ...browse('chk-3a99', 110, 'gateway-2', '/teas', 'u-1550', 33),
    ...variant ? timedOut({ ...J, host: 'gateway-1' }, 145, 5300) : paid(J, 141, 690, 1210),
  ];
}

const RAW = [
  { id: 'legacy', text: `2026-11-24 10:01:16 ERROR charge failed for ${DEMO_EMAIL}, provider timeout` },
  { id: 'zh', text: '付款失敗：卡片服務逾時（第 2 次嘗試）' },
  { id: 'kv', text: 'level=error service=payments request_id=chk-3a97 order_id=T-5007 msg="provider timeout"' },
  { id: 'json', text: '{"ts":"2026-11-24T10:01:16Z","service":"payments","level":"error","request_id":"chk-3a97","status":504}' },
];
const checkoutLogs = (): LogSet => ({ records: checkoutRecords(), raw: RAW, perDay: 1_800_000 });
/** The same five minutes in the whole ten minutes of logs: 1,200 generated browsing requests (all info, status 200). */
const tenMinutes = (): LogSet => ({
  records: checkoutRecords(),
  traffic: { seed: 1224, count: 1200, from: 0, to: 600, services: ['gateway'], hosts: 2, paths: ['/teas', '/teas/oolong', '/teas/sencha', '/cart'], users: 400, durationMs: { min: 20, max: 450 } },
  perDay: 1_800_000,
});
const MUST_HIDE = [DEMO_EMAIL, DEMO_CARD, DEMO_TOKEN];
const MUST_KEEP = ['chk-3a97', 'T-5007', 'u-3107', '/checkout'];

// ---------------------------------------------------------------------------------------------------- the terminal
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const HOME = '/home/learner';
const DAY = '/srv/logs/2026-11-24';
const START = Date.UTC(2026, 10, 24, 10, 0, 0);
/**
 * The records as the collector stores them, one JSON line each: ts (ISO 8601, UTC, with milliseconds), service, host,
 * level, message, then the fields in order. The explorer keeps whole seconds; the files keep the order inside a second
 * as milliseconds (the k-th record of a second gets 120 + 210 × k ms), so sorting the lines gives the same order.
 */
function jsonLines(records: readonly LogRecordInput[]): { service: string; line: string }[] {
  const sorted = records.map((r, i) => ({ r, i })).sort((a, b) => (a.r.ts as number) - (b.r.ts as number) || a.i - b.i);
  return sorted.map(({ r }, k) => {
    const sameSecond = sorted.slice(0, k).filter(x => x.r.ts === r.ts).length;
    if (sameSecond > 4) throw new Error('at most five records in one second');
    const ts = new Date(START + (r.ts as number) * 1000 + 120 + 210 * sameSecond).toISOString();
    return { service: r.service, line: JSON.stringify({ ts, service: r.service, host: r.host, level: r.level, message: r.message, ...r.fields }) };
  });
}
/** Each service's records, as the collector appends them, one file per service. */
const collected = (variant: boolean) => ['gateway', 'orders', 'payments'].map(s =>
  file(`${DAY}/${s}.jsonl`, jsonLines(checkoutRecords(variant)).filter(x => x.service === s).map(x => `${x.line}\n`).join('')));

const LEARNER_KEY = keyPair('cicd12:learner', 'learner@oncall-pc');
const LOG_HOST_SEED = 'cicd12-logs-01';
const knownHosts = `logs-01 ${hostKey(LOG_HOST_SEED, 'logs-01').publicLine.split(' ').slice(0, 2).join(' ')}\n`;
const logHost = (variant: boolean): TerminalRemote => ({
  host: 'logs-01', title: '集中日誌主機 logs-01', address: '10.30.0.40', hostKey: LOG_HOST_SEED,
  accounts: { users: [{ name: 'oncall', uid: 1001 }] },
  files: [
    dir('/etc'), file('/etc/motd', 'logs-01: Lantern Tea collected logs (hot: 7 days, then archived)\n'),
    dir('/home'), dir('/home/oncall', 'oncall', 0o750), dir('/home/oncall/.ssh', 'oncall', 0o700),
    file('/home/oncall/.ssh/authorized_keys', `${LEARNER_KEY.publicLine}\n`, 'oncall', 0o600),
    dir('/srv'), dir('/srv/logs'), dir(DAY), ...collected(variant),
  ],
});

/** A small job the on-call team runs by hand; it writes one JSON line per step and passes the caller's request id on. */
const REFUND_SH = [
  '#!/bin/bash',
  '# Usage: REQUEST_ID=<id> ./refund.sh ORDER',
  'set -eu',
  'order="$1"',
  'log() {',
  '  printf \'{"ts":"%s","service":"refunds","level":"%s","message":"%s","request_id":"%s","order_id":"%s"}\\n\' \\',
  '    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "${REQUEST_ID:-none}" "$order"',
  '}',
  'log info "refund requested"',
  'log info "refund sent to card provider"',
  '',
].join('\n');

/** What the collector has not picked up yet from the refunds job's file (an earlier refund this morning). */
const EARLIER_REFUND = '{"ts":"2026-11-24T09:12:40Z","service":"refunds","level":"info","message":"refund requested","request_id":"chk-39f0","order_id":"T-4990"}\n';
const ONCALL: TerminalMachine = {
  id: 'cicd12-oncall', title: 'oncall-pc（Lantern Tea 值班工程師的筆電）', user: 'learner', cwd: HOME, host: 'oncall-pc', profile: 'scripting',
  now: '2026-11-24 10:20:00', boot: '2026-11-24 08:00:00', address: '10.30.0.5',
  files: [
    dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700),
    file(`${HOME}/.ssh/id_ed25519`, LEARNER_KEY.privateText, 'learner', 0o600), file(`${HOME}/.ssh/id_ed25519.pub`, `${LEARNER_KEY.publicLine}\n`, 'learner'),
    file(`${HOME}/.ssh/known_hosts`, knownHosts, 'learner'),
    dir(`${HOME}/ops`, 'learner'), file(`${HOME}/ops/refund.sh`, REFUND_SH, 'learner', 0o755), file(`${HOME}/ops/refund.jsonl`, EARLIER_REFUND, 'learner'),
  ],
  remotes: [logHost(false)],
};
const ANOTHER_MORNING: TerminalVariant = { label: '另一個早上的日誌', files: [], remotes: [logHost(true)] };

const LOGIN = { command: 'ssh oncall@logs-01', output: 'logs-01: Lantern Tea collected logs (hot: 7 days, then archived)' };
const TO_DAY = { command: 'cd /srv/logs/2026-11-24', output: '' };
const LOGOUT = { command: 'exit', output: 'logout\nConnection to logs-01 closed.' };
const EXAMPLES: TerminalExample[] = [
  {
    id: 'cicd12-collected', title: '集中日誌主機上的 JSON Lines', machine: 'cicd12-oncall',
    description: '以 ssh 登入 logs-01，看收集器替每個服務、每一天寫的檔案：每一行是一筆完整的 JSON 紀錄，最前面是時間。再以 wc 數出筆數與位元組數，估計每筆的平均大小。',
    steps: [
      LOGIN,
      { command: 'ls /srv/logs/2026-11-24', output: 'gateway.jsonl  orders.jsonl  payments.jsonl' },
      TO_DAY,
      { command: 'head -n 2 payments.jsonl', output: "{\"ts\":\"2026-11-24T10:00:13.120Z\",\"service\":\"payments\",\"host\":\"payments-1\",\"level\":\"info\",\"message\":\"charge approved\",\"request_id\":\"chk-3a91\",\"order_id\":\"T-5001\",\"status\":200,\"duration_ms\":640}\n{\"ts\":\"2026-11-24T10:00:41.120Z\",\"service\":\"payments\",\"host\":\"payments-1\",\"level\":\"info\",\"message\":\"charge approved\",\"request_id\":\"chk-3a93\",\"order_id\":\"T-5002\",\"status\":200,\"duration_ms\":710}" },
      { command: 'wc -l *.jsonl', output: "  16 gateway.jsonl\n  12 orders.jsonl\n   9 payments.jsonl\n  37 total" },
      { command: 'wc -c *.jsonl', output: "3218 gateway.jsonl\n2000 orders.jsonl\n1914 payments.jsonl\n7132 total" },
      LOGOUT,
    ],
  },
  {
    id: 'cicd12-grep', title: '用 grep、cut、sort、uniq 查結構化的行', machine: 'cicd12-oncall',
    description: '每一行的欄位順序都相同，所以 grep 可以用「欄位名稱加值」精確比對，cut 以雙引號切開後，第 4、8、20 段就是時間、服務與訊息。',
    steps: [
      LOGIN, TO_DAY,
      { command: 'grep -c \'"level":"error"\' *.jsonl', output: "gateway.jsonl:2\norders.jsonl:2\npayments.jsonl:2" },
      { command: 'grep -h \'"level":"error"\' *.jsonl | cut -d \'"\' -f 8 | sort | uniq -c', output: "      2 gateway\n      2 orders\n      2 payments" },
      { command: 'grep -h \'"level":"error"\' *.jsonl | cut -d \'"\' -f 4,8,20 | tr \'"\' \' \'', output: "2026-11-24T10:01:17.330Z gateway POST /checkout 502\n2026-11-24T10:01:35.540Z gateway POST /checkout 502\n2026-11-24T10:01:17.120Z orders order T-5007 failed: payment error\n2026-11-24T10:01:35.330Z orders order T-5008 failed: payment error\n2026-11-24T10:01:16.120Z payments charge failed for mei.lin@example.com card 4111 1111 1111 1111: provider timeout\n2026-11-24T10:01:35.120Z payments charge failed: card provider timeout" },
      LOGOUT,
    ],
  },
  {
    id: 'cicd12-trace', title: '跨三個檔案追蹤 chk-3a97', machine: 'cicd12-oncall',
    description: '同一個 request_id 散在三個服務的檔案裡。grep -h 不印檔名、把它們全部找出來，sort 依行首的時間排好，就是這個請求的完整經過。',
    steps: [
      LOGIN, TO_DAY,
      { command: 'grep -h chk-3a97 *.jsonl | wc -l', output: "7" },
      { command: 'grep -h chk-3a97 *.jsonl | sort | cut -d \'"\' -f 4,8,16,20 | tr \'"\' \' \'', output: "2026-11-24T10:01:10.120Z gateway info POST /checkout received\n2026-11-24T10:01:10.330Z orders info order T-5007 created\n2026-11-24T10:01:10.540Z payments debug calling card provider\n2026-11-24T10:01:11.120Z payments warn card provider slow, retrying\n2026-11-24T10:01:16.120Z payments error charge failed for mei.lin@example.com card 4111 1111 1111 1111: provider timeout\n2026-11-24T10:01:17.120Z orders error order T-5007 failed: payment error\n2026-11-24T10:01:17.330Z gateway error POST /checkout 502" },
      LOGOUT,
    ],
  },
  {
    id: 'cicd12-propagate', title: '讓指令稿也寫出關聯 ID', machine: 'cicd12-oncall',
    description: '值班團隊手動執行的退款指令稿也寫 JSON Lines。它從環境變數 REQUEST_ID 取得呼叫者的關聯 ID；沒有傳進來時只能寫 none，這筆退款就和原本的請求斷了線。',
    steps: [
      { command: 'cat ops/refund.sh', output: "#!/bin/bash\n# Usage: REQUEST_ID=<id> ./refund.sh ORDER\nset -eu\norder=\"$1\"\nlog() {\n  printf '{\"ts\":\"%s\",\"service\":\"refunds\",\"level\":\"%s\",\"message\":\"%s\",\"request_id\":\"%s\",\"order_id\":\"%s\"}\\n' \\\n    \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" \"$1\" \"$2\" \"${REQUEST_ID:-none}\" \"$order\"\n}\nlog info \"refund requested\"\nlog info \"refund sent to card provider\"" },
      { command: './ops/refund.sh T-5007', output: "{\"ts\":\"2026-11-24T10:20:00Z\",\"service\":\"refunds\",\"level\":\"info\",\"message\":\"refund requested\",\"request_id\":\"none\",\"order_id\":\"T-5007\"}\n{\"ts\":\"2026-11-24T10:20:00Z\",\"service\":\"refunds\",\"level\":\"info\",\"message\":\"refund sent to card provider\",\"request_id\":\"none\",\"order_id\":\"T-5007\"}" },
      { command: 'REQUEST_ID=chk-3a97 ./ops/refund.sh T-5007', output: "{\"ts\":\"2026-11-24T10:20:00Z\",\"service\":\"refunds\",\"level\":\"info\",\"message\":\"refund requested\",\"request_id\":\"chk-3a97\",\"order_id\":\"T-5007\"}\n{\"ts\":\"2026-11-24T10:20:00Z\",\"service\":\"refunds\",\"level\":\"info\",\"message\":\"refund sent to card provider\",\"request_id\":\"chk-3a97\",\"order_id\":\"T-5007\"}" },
    ],
  },
  {
    id: 'cicd12-leaks', title: '掃描集中的日誌有沒有個資與權杖', machine: 'cicd12-oncall',
    description: '用 grep 找電子郵件地址與 Bearer 權杖：付款服務各有一筆。cut 只印出時間、服務、等級與 request_id，掃描時不再把敏感的值印到終端機上。',
    steps: [
      LOGIN, TO_DAY,
      { command: 'grep -c -E \'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[a-z]+\' *.jsonl', output: "gateway.jsonl:0\norders.jsonl:0\npayments.jsonl:1" },
      { command: 'grep -c Bearer *.jsonl', output: "gateway.jsonl:0\norders.jsonl:0\npayments.jsonl:1" },
      { command: 'grep -h -E \'@|Bearer\' *.jsonl | cut -d \'"\' -f 4,8,16,24 | tr \'"\' \' \'', output: "2026-11-24T10:01:10.540Z payments debug chk-3a97\n2026-11-24T10:01:16.120Z payments error chk-3a97" },
      LOGOUT,
    ],
  },
];

const REFUND_LINES = (id: string) => ['refund requested', 'refund sent to card provider']
  .map(m => `{"ts":"2026-11-24T10:20:00Z","service":"refunds","level":"info","message":"${m}","request_id":"${id}","order_id":"T-5007"}\n`).join('');
const EXERCISES: TerminalExercise[] = [
  {
    id: 'cicd12-x-grep-trace', title: '用 grep 追蹤一次重試的結帳', machine: 'cicd12-oncall',
    statement: 'chk-3a95 這次結帳成功了，但花了好幾秒。在 logs-01 的 /srv/logs/2026-11-24 裡，把 chk-3a95 在三個服務留下的紀錄依時間先後印出來：每一行是完整的 JSON 行，前面不要有檔名。檢查時會換成另一個早上的日誌再執行一次你的指令。',
    checks: [{ kind: 'output', fromCommand: 'grep' }],
    solution: ['ssh oncall@logs-01', 'cd /srv/logs/2026-11-24', 'grep -h chk-3a95 *.jsonl | sort'],
    variants: [ANOTHER_MORNING],
    mistakes: [
      { commands: ['ssh oncall@logs-01', 'cd /srv/logs/2026-11-24', 'grep -h chk-3a95 *.jsonl'], why: '沒有排序：grep 依檔案的順序輸出，閘道的兩行都排在最前面，看起來像是閘道先回應了才建立訂單' },
      { commands: ['ssh oncall@logs-01', 'cd /srv/logs/2026-11-24', 'grep chk-3a95 *.jsonl | sort'], why: '少了 -h：有多個檔案時 grep 在每行前面加上檔名，sort 變成依檔名排序，時間順序又亂了' },
      { commands: ['ssh oncall@logs-01', 'cd /srv/logs/2026-11-24', 'grep -h chk-3a9 *.jsonl | sort'], why: '樣式太短：chk-3a91 到 chk-3a99 都含有 chk-3a9，別的請求也被印出來了' },
    ],
    hints: [
      '先 ssh oncall@logs-01，再 cd 到當天的資料夾；*.jsonl 會展開成三個檔案。',
      'grep 搜尋多個檔案時會在每行前加上檔名，-h 可以拿掉它。',
      '每一行都以 {"ts":"2026-11-24T10:… 開頭，ISO 8601 的時間依文字排序就是依時間排序。',
    ],
    explanation: 'grep -h chk-3a95 *.jsonl 從三個檔案找出這個請求的每一筆紀錄而不加檔名，sort 依行首的時間排列，就看得出經過：閘道收到請求、訂單服務建立訂單、付款服務第一次收到 503 而重試、第二次扣款成功、訂單標成已付款、閘道回 200。這個做法有效，是因為每一行都把時間放在最前面，而且格式固定（UTC、毫秒、補零）；如果有的服務寫本地時間、有的寫 UTC，或時間不在行首，文字排序就不等於時間排序。',
  },
  {
    id: 'cicd12-x-grep-5xx', title: '每個服務有幾筆 5xx', machine: 'cicd12-oncall',
    statement: '在 logs-01 的 /srv/logs/2026-11-24 裡，用一個 grep -c 指令列出三個檔案各有幾筆 status 是 5xx（500–599）的紀錄，輸出是 grep -c 對多個檔案的格式「檔名:筆數」。檢查時會換成另一個早上的日誌再執行一次你的指令。',
    checks: [{ kind: 'output', fromCommand: 'grep' }],
    solution: ['ssh oncall@logs-01', 'cd /srv/logs/2026-11-24', 'grep -c \'"status":5\' *.jsonl'],
    variants: [ANOTHER_MORNING],
    mistakes: [
      { commands: ['ssh oncall@logs-01', 'cd /srv/logs/2026-11-24', 'grep -c error *.jsonl'], why: '數的是含有 error 字樣的行：付款服務收到 503 而重試的那筆是警告（warn）等級，訊息裡也沒有 error，所以漏掉了' },
      { commands: ['ssh oncall@logs-01', 'cd /srv/logs/2026-11-24', 'grep -c 5 *.jsonl'], why: '只搜尋數字 5：時間、訂單編號、duration_ms 裡的 5 都會符合，幾乎每一行都被算進去' },
      { commands: ['ssh oncall@logs-01', 'cd /srv/logs/2026-11-24', 'grep -h \'"status":5\' *.jsonl | wc -l'], why: '算出的是三個服務合計的筆數，看不出各服務的分布；題目要每個檔案各自的數字' },
    ],
    hints: [
      '狀態碼是 status 欄位的值，在 JSON 行裡寫成 "status":502 這樣，沒有引號。',
      '把欄位名稱一起放進樣式，才不會比對到其他地方的數字；樣式裡有雙引號，整個樣式用單引號括起來。',
      'grep -c 搜尋多個檔案時，每個檔案印一行「檔名:筆數」。',
    ],
    explanation: 'grep -c \'"status":5\' *.jsonl 只算 status 欄位以 5 開頭的行：閘道與訂單服務各 2 筆 502，付款服務有 2 筆 504 加上 1 筆 503。注意 503 那筆是警告等級：狀態碼與等級是不同的欄位，用等級篩選會少算它。這個樣式能用，是因為 status 一律是三位數；寫成 \'"status":5[0-9][0-9]\' 更精確。結構化的欄位名稱讓最簡單的 grep 也能精確比對，純文字的訊息就做不到。',
  },
  {
    id: 'cicd12-x-propagate', title: '把關聯 ID 傳給退款指令稿', machine: 'cicd12-oncall',
    statement: '客服要替 chk-3a97 那次失敗的結帳（訂單 T-5007）確認退款。執行 ~/ops/refund.sh T-5007，讓它寫出的兩行都帶著 request_id chk-3a97，並把這兩行附加到 ~/ops/refund.jsonl 的最後（收集器會從這個檔案收走日誌；檔案裡還沒收走的那一行必須留著）。',
    checks: [{ kind: 'content', path: `${HOME}/ops/refund.jsonl`, content: EARLIER_REFUND + REFUND_LINES('chk-3a97') }],
    solution: ['REQUEST_ID=chk-3a97 ./ops/refund.sh T-5007 >> ops/refund.jsonl'],
    mistakes: [
      { commands: ['./ops/refund.sh T-5007 >> ops/refund.jsonl'], why: '沒有傳入關聯 ID：指令稿寫出 "request_id":"none"，這筆退款和原本失敗的結帳串不起來' },
      { commands: ['REQUEST_ID=chk-3a97', './ops/refund.sh T-5007 >> ops/refund.jsonl'], why: '只設定了 Shell 變數而沒有 export：指令稿是子行程，看不到沒有匯出的變數，仍然寫出 none' },
      { commands: ['REQUEST_ID=chk-3a97 ./ops/refund.sh T-5007 > ops/refund.jsonl'], why: '用了 > 而不是 >>：檔案被截斷，收集器還沒收走的那一行日誌就這樣消失了' },
    ],
    hints: [
      '先執行 cat ops/refund.sh：它從哪個環境變數讀關聯 ID？',
      '寫在指令前面的 NAME=value 只對這一個指令生效，而且會成為它的環境變數；另一種寫法是先 export。',
      '附加到檔案最後用 >>，> 會先把檔案清空。',
    ],
    explanation: 'REQUEST_ID=chk-3a97 ./ops/refund.sh T-5007 >> ops/refund.jsonl 把關聯 ID 放進這一個指令的環境，指令稿的 ${REQUEST_ID:-none} 就取得 chk-3a97，兩行附加在既有那一行之後。之後在集中日誌查 chk-3a97，除了結帳的七筆，也會看到這次退款。關聯 ID 只有在每一段都主動傳下去時才有用：服務之間經由請求標頭，背景工作與指令稿經由參數或環境變數；任何一段沒有傳，追蹤就在那裡斷掉。',
  },
];

export const CICD12: LessonContent = {
  lessonId: 'CICD12',
  motivation: '上一課的儀表板與告警能告訴值班的人「結帳的錯誤率升高了」，卻說不出是哪一筆訂單、在哪個服務、為什麼失敗。這些答案在日誌裡，但日誌散在每一台主機、每一個服務各自的檔案中，格式還各寫各的；半夜被叫醒的人要一台一台登入、用肉眼比對時間，常常查了半小時還串不起一個請求。本課以一家虛構的網路茶葉店 Lantern Tea 為例：它的結帳經過閘道、訂單與付款三個服務，某天早上卡片服務開始逾時。你會把日誌改成結構化的 JSON Lines、把三個服務的日誌集中到同一台主機，用篩選、分組與關聯 ID 找出失敗的請求與第一個出錯的服務，再處理日誌裡外洩的電子郵件、卡號與權杖，最後估算這些日誌要保留多久、需要多少空間。',
  sections: [
    {
      id: 'cicd12-why', title: '為什麼要把日誌集中起來',
      blocks: [
        { type: 'p', text: '日誌（log）是程式在執行時為每一個事件寫下的一筆紀錄：收到了哪個請求、建立了哪一張訂單、呼叫外部服務花了多久、哪裡失敗了。它和上一課的指標互相補充：指標把大量事件聚合成每分鐘一個數字，便宜、適合畫圖與告警，但看不到個別的請求；日誌保留每一個事件的細節，適合回答「是哪一筆、為什麼」。' },
        { type: 'table', head: ['', '指標（metric）', '日誌（log）', '分散式追蹤（tracing）'], rows: [
          ['記下什麼', '每分鐘聚合後的數字', '每個事件一筆紀錄，帶有欄位', '一個請求在每個服務花的每一段時間（span）'],
          ['回答的問題', '有沒有問題、多嚴重、從什麼時候開始', '哪一個請求、哪個服務、錯誤訊息是什麼', '時間花在哪一段、誰呼叫了誰'],
          ['成本', '低：資料量和流量幾乎無關', '高：流量越大，筆數越多', '中：通常只取樣一部分請求'],
        ] },
        { type: 'p', text: 'Lantern Tea 的結帳請求依序經過三個服務：閘道（gateway，在 gateway-1、gateway-2 兩台主機上）、訂單服務（orders）與付款服務（payments，它再呼叫外部的卡片服務）。以前每個服務把日誌寫在自己主機的檔案裡，要查一次失敗的結帳，得登入四台主機、在四個檔案裡用時間對照。服務與主機越多，這種做法越不可行；更糟的是主機被重建或自動縮減時，留在上面的日誌也跟著消失。' },
        { type: 'p', text: '日誌收集（log collection）把這件事自動化：每台主機上執行一個收集代理程式，讀取應用程式寫到標準輸出或檔案的日誌，加上主機名稱等資訊，送到集中的日誌儲存；儲存端建立索引，提供篩選與搜尋，並依保留期限刪除或封存舊的資料。應用程式本身只負責「把每一筆寫好」，送到哪裡、保存多久由收集與儲存決定。' },
        { type: 'list', ordered: true, items: [
          '應用程式：每個事件寫一行結構化的紀錄到標準輸出或檔案。',
          '收集代理程式：在每台主機上讀取這些行，補上主機、服務等欄位，批次送出；網路中斷時先暫存、之後補送。',
          '集中儲存：依時間與欄位建立索引，保留一段時間後封存或刪除。',
          '查詢介面：依服務、等級、欄位與時間篩選，分組計數，以關聯 ID 追蹤請求。',
        ] },
        { type: 'callout', tone: 'note', title: '本課的資料與模型', text: '本課的日誌是示意資料。探索器沒有查詢語言，只有篩選控制項與固定的運算，時間以整數秒表示，從 10:00:00（UTC）起算並寫成「分:秒」。終端機裡的 logs-01 保存同一批紀錄的 JSON Lines 檔案，時間寫成含毫秒的 UTC 時間。兩者都不代表任何特定的日誌產品。' },
      ],
    },
    {
      id: 'cicd12-structured', title: '結構化日誌：每個值都有名字',
      blocks: [
        { type: 'p', text: '同一個「付款失敗」的事件，可以寫成很多樣子。自由格式的文字對人好讀，但程式只能用字串搜尋去猜：「failed」後面那串是訂單編號還是使用者？不同工程師、不同版本的寫法不一樣，改一個字，之前寫好的搜尋就失效了。結構化日誌（structured logging）把每個值放進有名稱的欄位，查詢時直接說「service 是 payments、status 大於或等於 500」。' },
        { type: 'table', head: ['寫法', '例子', '可以依欄位篩選嗎'], rows: [
          ['自由格式的文字', '2026-11-24 10:01:16 ERROR charge failed for …, provider timeout', '不行，只能搜尋字串'],
          ['key=value（常稱為 logfmt）', 'level=error service=payments request_id=chk-3a97 msg="provider timeout"', '可以：每一段都是「名稱=值」'],
          ['JSON Lines', '{"ts":"2026-11-24T10:01:16Z","service":"payments","level":"error","request_id":"chk-3a97","status":504}', '可以：一行一個 JSON 物件，值有型別'],
        ] },
        { type: 'p', text: 'JSON Lines 是本課採用的格式：每一行是一個完整的 JSON 物件，行與行之間以換行分隔。每一行各自獨立，所以收集代理程式可以一行一行讀、一行一行送；程式只要在檔案最後附加，不必改寫前面的內容。一筆好的紀錄通常包含下列欄位：' },
        { type: 'table', head: ['欄位', '例子', '用途'], rows: [
          ['ts', '2026-11-24T10:01:16.120Z', '時間：一律用 UTC 的 ISO 8601，含毫秒；放在最前面，依文字排序就是依時間排序'],
          ['service、host', 'payments、payments-1', '哪個服務、哪一台主機寫的'],
          ['level', 'debug、info、warn、error', '等級：正式環境通常只收 info 以上'],
          ['message', 'charge failed: card provider timeout', '固定的簡短說明，變動的值不要拼進來'],
          ['request_id', 'chk-3a97', '關聯 ID：同一個請求在每個服務都一樣'],
          ['其他欄位', 'order_id、user_id、status、duration_ms', '查問題需要的值，各自一個欄位，數字就寫成數字'],
        ] },
        { type: 'p', text: '等級（level）由低到高是 debug、info、warn、error。debug 寫得最詳細，常常包含請求的標頭與參數，所以正式環境通常不收集它；下面的資料裡，付款服務就在一筆 debug 紀錄中寫下了整個 authorization 標頭。打開「結帳的五分鐘」：開頭的事實列出筆數、時間範圍與各等級的筆數；在「原始行」裡可以看到同一次失敗的四種寫法，展開「解析的結果」看哪些能被拆成欄位。' },
        { type: 'example', id: 'cicd12-checkout' },
        { type: 'callout', tone: 'warning', title: '「訊息寫清楚就好，欄位是多餘的」', text: '把值拼進訊息，例如「charge for order T-5007 failed after 5200 ms」，人看得懂，查詢卻要靠正規表示式把數字挖出來，換個寫法就挖不到；也沒辦法回答「付款超過 3000 ms 的有幾筆」。訊息保持固定的簡短文字，變動的值各自放進欄位（order_id、duration_ms），搜尋、篩選、分組與計數才可靠。' },
      ],
    },
    {
      id: 'cicd12-collect', title: '集中之後：篩選、分組，以及用文字工具查',
      blocks: [
        { type: 'p', text: '日誌集中之後，筆數會很快變多：Lantern Tea 這十分鐘裡，閘道光是一般的瀏覽請求就有 1,200 筆，值班的人要看的只是其中和結帳時段有關的 37 筆。一頁只列 20 筆的表格不可能逐頁看完，要靠篩選縮小範圍，再用分組計數看出分布。探索器的篩選全部可以同時使用：' },
        { type: 'list', items: [
          '服務：只看某個服務寫的紀錄。',
          '最低等級：選「警告」就包含警告與錯誤。',
          '欄位條件：例如 status >= 500、duration_ms > 3000、request_id = chk-3a97。=、!= 比較文字；>、>=、<、<= 只比較數字。沒有這個欄位的紀錄不符合任何條件，連 != 也不符合，例如沒有 status 欄位的「order created」紀錄永遠不會出現在 status != 200 的結果裡。',
          '時間範圍：從「從」到「到」之前（不含「到」）。',
        ] },
        { type: 'p', text: '篩選後的「分組計數」依服務、等級、主機或任何欄位計算筆數，筆數多的在前。例如先篩選最低等級「錯誤」，再依服務分組，就看得出錯誤平均分布在三個服務，還是集中在其中一個。注意狀態碼與等級是兩個不同的欄位：付款服務收到卡片服務的 503 後重試成功，那一筆的等級是警告，status 卻是 503。' },
        { type: 'example', id: 'cicd12-ten' },
        { type: 'p', text: '結構化的好處不只在查詢介面裡。Lantern Tea 的收集器同時把每個服務每一天的紀錄寫成一個 JSON Lines 檔案，放在日誌主機 logs-01 的 /srv/logs/日期/ 底下。登入看看：每一行都是一筆完整的紀錄，用 wc 數一數，三個檔案共 37 行、7,132 位元組，平均每筆約 193 位元組，這個數字在最後一節估算容量時會用到。' },
        { type: 'example', id: 'cicd12-collected' },
        { type: 'p', text: '因為每一行的欄位順序都一樣，最普通的文字工具就很好用：grep 以「"level":"error"」這種含欄位名稱的樣式精確比對，不會誤中訊息裡剛好出現的字；cut -d \'"\' 以雙引號切開一行，第 4 段是時間、第 8 段是服務、第 16 段是等級、第 20 段是訊息；再接 sort 與 uniq -c 就是分組計數。' },
        { type: 'example', id: 'cicd12-grep' },
        { type: 'callout', tone: 'tip', title: '文字工具的前提', text: '用 cut 依位置取欄位，前提是每一行的欄位順序固定，而且值裡沒有雙引號；這在日誌由同一個函式庫寫出時成立，換了寫法就不成立。真實環境有專門解析 JSON 的命令列工具（例如 jq），本課的模擬環境沒有提供。平常查問題用集中儲存的查詢介面；文字工具適合查詢介面暫時不能用、或只需要快速確認一個檔案的時候。' },
      ],
    },
    {
      id: 'cicd12-correlate', title: '關聯 ID：把一個請求串起來',
      blocks: [
        { type: 'p', text: '集中之後，三個服務的紀錄都在一起了，但同一秒裡有好幾個請求在進行，光靠時間仍然分不出哪幾筆屬於同一次結帳。關聯 ID（correlation ID，本課的欄位是 request_id）解決這個問題：請求一進入系統，最外層的閘道就替它產生一個唯一的 ID；呼叫下一個服務時把 ID 放在請求標頭裡傳下去，每個服務寫日誌時都帶上它。之後只要用這個 ID 篩選，就能把一個請求在每個服務留下的紀錄全部找出來。' },
        { type: 'table', head: ['做法', '結果'], rows: [
          ['閘道產生一次，每一段都原樣傳下去並寫進日誌', '一個 ID 串起整個請求，也串起它觸發的背景工作與指令稿'],
          ['每個服務各自產生自己的 ID', '每段都有 ID，卻彼此無關，仍然串不起來'],
          ['只有閘道記錄 ID', '只知道閘道回了 502，不知道是哪個下游服務、哪一步出錯'],
        ] },
        { type: 'p', text: '傳遞的標頭名稱各家不同，X-Request-ID 是常見的慣例名稱，但不是正式的標準；分散式追蹤則有 W3C 的 Trace Context 規格，以 traceparent 標頭傳遞追蹤的 ID。不論用哪一種，重點都是「產生一次、每一段都傳」。' },
        { type: 'p', text: '在「結帳的五分鐘」的「關聯」裡選 chk-3a97：它依序經過閘道 → 訂單 → 付款 → 訂單 → 閘道。付款服務在 1:11 先記下一筆「卡片服務很慢，重試」的警告，1:16 第一次記下錯誤（卡片服務逾時，504）；訂單服務在 1:17 把訂單標成失敗，閘道接著回給使用者 502。使用者看到的是閘道的 502，第一個出錯的卻是付款服務：從第一個 error 往前看，才找得到源頭。' },
        { type: 'p', text: '從第一筆到最後一筆相差 7 秒，閘道自己量的 duration_ms 卻是 7300。兩者量的是不同的東西：紀錄的時間只到秒，而且只代表「寫下這一筆的時刻」；duration_ms 是閘道從收到請求到送出回應實際量到的時間。要回答「使用者等了多久」，看閘道的 duration_ms；要知道「每一段花了多少」，看相鄰紀錄的時間差（Δ），或使用分散式追蹤。' },
        { type: 'p', text: '在 logs-01 上，同樣的追蹤是一行管線：grep -h 把三個檔案裡帶 chk-3a97 的行找出來，sort 依行首的時間排列。檔案裡的時間精確到毫秒，所以同一秒內的先後也排得出來：10:01:17 先是訂單服務（.120）、再是閘道（.330）。' },
        { type: 'example', id: 'cicd12-trace' },
        { type: 'p', text: '關聯 ID 也要傳給不是網路服務的程式。值班團隊用 ops/refund.sh 手動處理退款，它把呼叫者給的 REQUEST_ID 環境變數寫進每一行日誌；沒有傳的時候只能寫 none，這次退款在集中日誌裡就和原本的結帳斷了線。' },
        { type: 'example', id: 'cicd12-propagate' },
        { type: 'callout', tone: 'warning', title: '「依時間排好，就是請求真正的順序」', text: '依時間排列的前提是每台主機的時鐘都已同步（例如以 NTP 校時），而且時間夠精確。只到秒的紀錄，同一秒內的先後無法分辨：本課的探索器依日誌原本的順序排列，終端機的檔案則靠毫秒。不同主機的時鐘差個幾百毫秒，跨服務的順序就可能顛倒；時間只用來排序與估計，判斷「誰呼叫誰」要靠關聯 ID 與每段的內容。' },
      ],
    },
    {
      id: 'cicd12-sensitive', title: '敏感資料遮蔽：日誌不是保險箱',
      blocks: [
        { type: 'p', text: '日誌一旦集中，讀得到它的人與系統就變多了：值班工程師、客服、分析報表、備份與封存，保存的時間也比應用程式裡的資料更長、存取控制更寬鬆。寫進日誌的密碼、權杖、卡號與個人資料，等於被複製到許多地方，而且很難全部收回。仔細看 chk-3a97：付款服務的錯誤訊息裡有顧客的電子郵件 mei.lin@example.com 與卡號 4111 1111 1111 1111（許多支付服務在測試時使用的示範卡號），debug 紀錄的 authorization 欄位裡有權杖 tok_demo7c41e9b2，舊版程式印出的原始行裡也有同一個電子郵件。用 grep 掃描集中的檔案，付款服務的檔案裡正好各有一筆電子郵件與權杖。' },
        { type: 'example', id: 'cicd12-leaks' },
        { type: 'p', text: '最根本的做法是一開始就不要寫：記 user_id 而不是電子郵件；卡號頂多記末四碼；不要把整個請求標頭或請求內容寫進日誌；正式環境不收集 debug。支付卡產業的資料安全標準（PCI DSS）不允許以明文保存完整的卡號，許多個資法規也要求個人資料只在必要的範圍內處理。敏感資料遮蔽（masking）是第二層防護：在日誌離開服務或進入集中儲存之前，依規則把敏感的值換成 ***，接住程式漏網的部分。' },
        { type: 'table', head: ['規則', '遮掉什麼', '遮不到或遮太多'], rows: [
          ['field user_email', 'user_email 欄位的整個值', '遮不到訊息與原始行裡同一個電子郵件'],
          ['field authorization', 'authorization 欄位（含權杖）', '權杖若出現在別的欄位或訊息裡就遮不到'],
          ['pattern email', '任何地方的電子郵件地址', '只認常見的寫法'],
          ['pattern card', '13–19 位、可夾空格或連字號的數字', '不檢查是不是真的卡號'],
          ['pattern token', 'Bearer 之後的字串，或 sk_、tok_ 開頭的長字串', '其他格式的權杖'],
          ['pattern digits', '任何連續 4 位以上的數字', '太寬：訂單編號 T-5007、使用者 u-3107 也被遮掉'],
        ] },
        { type: 'p', text: '欄位規則只遮那一個欄位，同一個值被拼進訊息或印在原始行時遮不到；樣式規則掃描每一筆的訊息、欄位值與原始行，但樣式只涵蓋常見的寫法。反過來，遮得太多也是錯：查問題需要的 request_id、訂單編號、使用者 ID 與路徑被遮掉，日誌就失去了用途。下面的探索器從一條 field user_email 開始，結果列出哪些必須隱藏的值仍看得到、哪些必須保留的值被遮掉；試著加上或改寫規則。' },
        { type: 'example', id: 'cicd12-masking' },
        { type: 'callout', tone: 'warning', title: '「日誌只有內部的人看得到，寫進去沒關係」', text: '內部也有很多人與系統讀得到集中日誌，備份與封存還會保存好幾個月；外包、權限設定錯誤或帳號被盜，都會讓日誌裡的個資與權杖外流。已經寫進日誌的權杖要當成外洩處理：撤銷並換一把新的，再依保留規則清除或限制那段日誌的存取，同時修好寫出它的程式。遮蔽規則只是補救，不能取代「不要寫」。' },
      ],
    },
    {
      id: 'cicd12-retention', title: '保留期限與容量',
      blocks: [
        { type: 'p', text: '保留期限（retention）決定日誌留多久。留太短，事故後幾天才發現的問題已經查不到；留太長，儲存費用一直增加，日誌裡的個人資料也保存得比需要的更久。常見的做法是分層：最近幾天放在有索引、查得快但昂貴的「熱」儲存，之後壓縮後移到便宜但查得慢的封存，期限到了就刪除。logs-01 的登入訊息寫著「hot: 7 days, then archived」，就是這種安排。稽核用的日誌有時有法規或合約規定的最短保存期間，個人資料則有不能保存過久的要求，兩者都要先問清楚。' },
        { type: 'p', text: '估算需要多少空間，用三個數字相乘：每天的筆數 × 每筆的平均大小 × 保留的天數。平均大小可以從實際的日誌量出來，例如 logs-01 上的 7,132 位元組 ÷ 37 行 ≈ 193 位元組（每行含換行）。Lantern Tea 正式環境每天大約 1,800,000 筆：' },
        { type: 'table', head: ['項目', '算式', '結果'], rows: [
          ['每天', '1,800,000 筆 × 193 位元組', '347,400,000 位元組 ≈ 347 MB'],
          ['熱儲存 7 天', '每天的位元組 × 7', '約 2.4 GB'],
          ['90 天', '每天的位元組 × 90', '約 31.3 GB'],
        ] },
        { type: 'p', text: '本課的 MB、GB 用十進位（1 GB = 10 億位元組）。這是未壓縮的原始大小：日誌的文字重複性高，壓縮後通常小很多；但集中儲存的索引與副本又會增加用量，實際的數字要以系統的計量為準。這個估算的用處是看出量級，以及哪個因素影響最大：把 debug 打開，筆數可能變成好幾倍；每筆多帶一個很長的欄位，每天就多出幾百 MB。' },
        { type: 'callout', tone: 'tip', title: '降低日誌量的方法', text: '正式環境只收 info 以上；健康檢查這類大量而重複的成功請求只取樣一部分，錯誤則全部保留；不要把整個請求或回應的內容寫進日誌；欄位名稱與訊息保持簡短。先量出哪個服務、哪種訊息佔了最多筆數（分組計數就能做到），再決定從哪裡下手。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd12-q-structured', prompt: '為什麼把日誌寫成 JSON Lines 這類結構化日誌，比自由格式的文字好查？',
      options: ['JSON 的檔案比純文字小，收集與保存都比較省空間', '每個值都有欄位名稱，可以直接依欄位篩選與分組', '結構化日誌會自動把密碼與個資遮蔽起來', '只有結構化的日誌才能依照時間排序'],
      answer: 1, explanation: '結構化日誌的每個值都有名稱，工具可以直接比對「status >= 500」、依服務分組計數；自由格式只能用字串搜尋去猜。JSON 每行都帶欄位名稱，通常比純文字更大；它不會自動遮蔽任何東西，寫進去的密碼一樣看得到；純文字只要時間格式固定也能排序。',
    },
    {
      id: 'cicd12-q-correlate', prompt: '付款服務在 10:01:16 記下一筆錯誤，閘道在 10:01:17 回了一個 502。要確認這兩筆屬於同一次結帳，最可靠的依據是什麼？',
      options: ['兩筆的時間只差一秒，前後緊接著發生', '兩筆都是由同一台主機寫的', '兩筆有相同的 request_id', '兩筆紀錄的 user_id 是同一個人'],
      answer: 2, explanation: '同一個請求在每個服務都帶著同一個關聯 ID，request_id 相同才能確定是同一次結帳。同一秒內有很多請求在進行，時間接近不代表有關；兩筆分別由付款服務與閘道寫的，本來就在不同的主機上；同一個使用者可能同時有好幾個請求，例如一邊瀏覽一邊結帳。',
    },
    {
      id: 'cicd12-q-generate', prompt: '關聯 ID 應該在哪裡產生、怎麼使用？',
      options: ['由閘道產生一次，經標頭傳下去，各服務都記下它', '每個服務收到請求時各自產生一個新的，寫進自己的日誌', '由集中儲存在收到日誌時依時間自動編號', '用收到請求的時間當作 ID，各服務自己換算'],
      answer: 0, explanation: '只有同一個 ID 一路傳下去，各服務的紀錄才串得起來，所以由最外層產生一次、經由標頭（或參數、環境變數）傳遞。各自產生的 ID 彼此無關；集中儲存收到時才編號已經太晚，它分不出哪幾筆屬於同一個請求；時間不唯一，同一刻可能有很多請求。',
    },
    {
      id: 'cicd12-q-elapsed', prompt: '追蹤 chk-3a97 時，第一筆到最後一筆紀錄相差 7 秒，閘道記下的 duration_ms 卻是 7300。為什麼兩者不同？',
      options: ['閘道主機的時鐘比其他主機快了 300 毫秒左右', '收集代理程式把日誌送出時又多花了 300 毫秒', 'duration_ms 也把閘道寫日誌所花的時間算進去了', '紀錄時間只到秒，duration_ms 是實測的毫秒數'],
      answer: 3, explanation: '探索器的紀錄時間是整數秒，只代表寫下每筆的時刻；duration_ms 是閘道從收到請求到送出回應量到的時間，兩者量的不是同一件事。題目沒有任何時鐘不同步的跡象；收集的延遲不會改變紀錄上的時間；寫一行日誌只要極短的時間，不會差到 300 毫秒。',
    },
    {
      id: 'cicd12-q-mask', prompt: '要避免完整的卡號出現在集中日誌裡，下列哪一種做法最根本？',
      options: ['程式一開始就不寫完整卡號，收集端再以遮蔽規則把關', '只讓值班工程師有讀取集中日誌的權限', '把日誌的保留期限縮短成一天', '加上 pattern digits，把所有數字都遮掉'],
      answer: 0, explanation: '不寫進日誌才是根本，遮蔽規則是接住漏網之魚的第二層。限制權限與縮短保留期限只能減少外洩的機會，卡號仍然被寫下、被複製到備份；pattern digits 會連訂單編號、使用者 ID 一起遮掉，查問題需要的值也沒了。',
    },
    {
      id: 'cicd12-q-over', prompt: '加上 `pattern digits` 規則之後，卡號確實不見了，但值班的同事抱怨查不到問題。最可能的原因是什麼？',
      options: ['遮蔽規則讓每一筆紀錄都變成了非結構化的文字', '時間欄位也被遮掉了，紀錄無法再依時間排序', '訂單編號與使用者 ID 也一起被遮掉了', '規則太多，集中儲存因此拒收這些日誌'],
      answer: 2, explanation: 'pattern digits 遮掉任何連續 4 位以上的數字，T-5007 變成 T-***，查問題需要的編號就不見了，這是過度遮蔽。遮蔽只換掉值，紀錄的欄位結構不變；時間、服務、主機與等級不會被遮蔽；規則的數量不會讓日誌被拒收。',
    },
    {
      id: 'cicd12-q-retention', prompt: '為什麼常把日誌在可快速查詢的熱儲存只留幾天，之後移到封存？',
      options: ['因為封存的日誌會自動移除裡面的個人資料', '多數查詢只看最近幾天，熱儲存比封存貴', '因為熱儲存的格式只能保存 7 天以內的資料', '因為封存後就不必再設定任何保留期限'],
      answer: 1, explanation: '查問題時大多只看最近幾天，有索引的熱儲存昂貴，舊的日誌移到便宜的封存，需要時仍找得到。封存不會自動移除個人資料，所以仍要遮蔽；保存幾天是設定的選擇，不是格式的限制；封存也要有期限，到期就刪除，否則費用與個資風險會一直累積。',
    },
    {
      id: 'cicd12-q-sort', prompt: '在 logs-01 上執行 `grep -h chk-3a97 *.jsonl | sort` 為什麼能得到依時間排列的結果？',
      options: ['grep 會自動依照時間順序讀取每一個檔案', 'sort 看得懂 JSON 格式，會依照 ts 欄位的值來排序', '收集器已經把三個檔案合併成同一個檔案', '每行以固定格式的 UTC 時間開頭，文字順序即時間順序'],
      answer: 3, explanation: 'sort 只依整行的文字排序；每一行都以 {"ts":" 加上補零、同一個時區的 ISO 8601 時間開頭，所以文字的順序就等於時間的順序。grep 依檔案的順序輸出，沒有排序；sort 不解析 JSON；檔案仍是每個服務一個，所以才需要 *.jsonl 與 sort。',
    },
  ],
  terminal: { machines: [ONCALL], examples: EXAMPLES, exercises: EXERCISES },
  devops: {
    logs: [
      {
        id: 'cicd12-checkout', title: '結帳的五分鐘：三個服務、37 筆紀錄',
        description: 'Lantern Tea 某天早上 10:00 起五分鐘的結帳日誌（示意資料）：閘道、訂單與付款服務的 37 筆結構化紀錄，其中兩次結帳因卡片服務逾時而失敗；另有四行程式直接印出的原始行。',
        logs: checkoutLogs(),
      },
      {
        id: 'cicd12-ten', title: '完整的十分鐘：1,237 筆',
        description: '同一段時間的完整日誌（示意資料）：「結帳的五分鐘」的 37 筆，加上閘道 10:00–10:10 的 1,200 筆瀏覽請求（由固定種子產生，全部是資訊等級、status 200）。用篩選與分組找出要看的那幾筆。',
        logs: tenMinutes(),
      },
      {
        id: 'cicd12-masking', title: '遮蔽之前與之後',
        description: '「結帳的五分鐘」的同一批紀錄與原始行（示意資料），從一條 field user_email 規則開始。結果列出必須隱藏的電子郵件、卡號與權杖，以及查問題必須保留的 request_id、訂單編號、使用者 ID 與路徑。',
        logs: checkoutLogs(), masking: ['field user_email'], checks: { mustHide: MUST_HIDE, mustKeep: MUST_KEEP },
      },
    ],
    exercises: [
      {
        id: 'cicd12-x-needle', kind: 'table', title: '在一千多筆裡找出問題',
        statement: '「完整的十分鐘」有 1,237 筆紀錄。用篩選與分組回答：status 大於或等於 500 的紀錄有幾筆？這些紀錄最多來自哪個服務？整段日誌裡 duration_ms 最大的是哪一個 request_id？',
        blanks: [
          { id: 'n', label: 'status ≥ 500 的筆數', query: { task: 'logs', logs: 'cicd12-ten', metric: 'count', filter: { fields: [{ name: 'status', op: '>=', value: 500 }] } } },
          { id: 'top', label: '其中最多的服務', query: { task: 'logs', logs: 'cicd12-ten', metric: 'top', group: 'service', filter: { fields: [{ name: 'status', op: '>=', value: 500 }] } } },
          { id: 'slow', label: 'duration_ms 最大的 request_id', query: { task: 'logs', logs: 'cicd12-ten', metric: 'max-by', field: 'duration_ms' } },
        ],
        hints: ['欄位選 status、比較選 >=、值填 500。', '篩選之後，分組依據選「服務」。', '再清除篩選，改用 duration_ms > 3000 縮小範圍，看哪一筆最大。'],
        explanation: 'status ≥ 500 的有 7 筆：閘道與訂單服務各 2 筆 502，付款服務 2 筆 504 加上 1 筆重試前收到的 503，所以付款服務最多。最低等級選「錯誤」只會得到 6 筆，因為 503 那筆是警告：狀態碼與等級是兩個欄位。1,200 筆瀏覽請求都在 450 ms 以內，最慢的是 chk-3a97，閘道記下它花了 7300 ms（付款服務先重試，再逾時）。',
        mistakes: [
          { answer: { n: '6', top: 'payments', slow: 'chk-3a97' }, why: '用最低等級「錯誤」篩選：付款服務收到 503 後重試的那一筆是警告等級，status 卻是 503' },
          { answer: { n: '7', top: 'gateway', slow: 'chk-3a97' }, why: '分組時沒有套用篩選：閘道的瀏覽請求最多，但它們都是 200' },
          { answer: { n: '7', top: 'payments', slow: 'chk-3a98' }, why: '只看了最後一次逾時：chk-3a98 花了 5400 ms，chk-3a97 先重試再逾時，花了 7300 ms' },
        ],
      },
      {
        id: 'cicd12-x-trace', kind: 'table', title: '追蹤另一次失敗的結帳',
        statement: '在「結帳的五分鐘」的「關聯」裡選 chk-3a98。它依序經過哪些服務？從第一筆到最後一筆經過幾秒？第一個出錯的是哪個服務？',
        blanks: [
          { id: 'path', label: '依序經過的服務（用逗號或 → 分開）', query: { task: 'correlate', logs: 'cicd12-checkout', id: 'chk-3a98', metric: 'services' } },
          { id: 'secs', label: '第一筆到最後一筆（秒）', query: { task: 'correlate', logs: 'cicd12-checkout', id: 'chk-3a98', metric: 'elapsed' } },
          { id: 'first', label: '第一個出錯的服務', query: { task: 'correlate', logs: 'cicd12-checkout', id: 'chk-3a98', metric: 'first-error-service' } },
        ],
        hints: ['同一個服務在中間換過別的服務之後再出現，要再寫一次。', '經過時間看「距第一筆」那一欄的最後一列，單位是秒。', '第一筆錯誤（error）等級的紀錄是哪個服務寫的？'],
        explanation: 'chk-3a98 在 1:30 進入閘道、訂單服務建立訂單 T-5008，1:35 付款服務記下卡片服務逾時（504），接著訂單服務把訂單標成失敗、閘道回 502：閘道 → 訂單 → 付款 → 訂單 → 閘道，經過 5 秒，第一個出錯的是付款服務。閘道的 duration_ms 是 5400，那是它量到的毫秒數，不是紀錄之間的秒數。',
        mistakes: [
          { answer: { path: 'gateway, orders, payments', secs: '5', first: 'payments' }, why: '每個服務只寫了一次：回應沿原路回到訂單服務與閘道，它們在中間換過別的服務之後要再列一次' },
          { answer: { path: 'gateway → orders → payments → orders → gateway', secs: '5400', first: 'payments' }, why: '填了閘道的 duration_ms（毫秒）；題目問的是紀錄之間經過的秒數' },
          { answer: { path: 'gateway → orders → payments → orders → gateway', secs: '5', first: 'gateway' }, why: '把回給使用者 502 的閘道當成源頭；閘道只是轉達下游的失敗，付款服務更早記下錯誤' },
        ],
      },
      {
        id: 'cicd12-x-redact', kind: 'redact', title: '送出前先遮蔽',
        statement: '替「結帳的五分鐘」寫遮蔽規則（一行一條）：顧客的電子郵件、卡號與權杖在任何訊息、欄位與原始行都不能再出現；查問題需要的 request_id chk-3a97、訂單編號 T-5007、使用者 u-3107 與路徑 /checkout 必須完整保留。',
        redact: { logs: 'cicd12-checkout', mustHide: MUST_HIDE, mustKeep: MUST_KEEP, reference: ['pattern email', 'pattern card', 'field authorization'] },
        hints: ['電子郵件同時出現在 user_email 欄位、錯誤訊息與一行原始行裡。', '卡號只出現在訊息裡，欄位規則遮不到它。', '太寬的樣式會連訂單編號與使用者 ID 一起遮掉。'],
        explanation: 'pattern email 遮掉每一處的電子郵件（欄位、訊息、原始行），pattern card 遮掉訊息裡的卡號，field authorization 遮掉整個 authorization 欄位（也可以用 pattern token）。只用 field user_email 遮不到訊息與原始行裡的同一個地址；pattern digits 雖然也能遮掉卡號，卻把 T-5007 與 u-3107 一起遮成 ***。最好的修正仍是改程式，不再把這些值寫進日誌。',
        mistakes: [
          { answer: { rules: 'field user_email\nfield authorization' }, why: '只遮欄位：錯誤訊息裡的電子郵件與卡號、原始行裡的電子郵件都還在' },
          { answer: { rules: 'pattern digits\npattern email\npattern token' }, why: '數字樣式太寬：卡號是遮掉了，訂單編號 T-5007 與使用者 u-3107 也被遮掉' },
          { answer: { rules: 'pattern email\npattern token' }, why: '忘了卡號：它在付款服務的錯誤訊息裡，不在任何欄位中' },
        ],
      },
      {
        id: 'cicd12-x-retention', kind: 'table', title: '保留要準備多少空間',
        statement: 'Lantern Tea 正式環境每天約 1,800,000 筆日誌，平均每筆 193 位元組（在 logs-01 上以 wc 量得）。每天產生多少位元組？熱儲存保留 7 天要幾 GB？如果改成保留 30 天呢？（未壓縮，1 GB = 10 億位元組，四捨五入到小數點後一位。）',
        blanks: [
          { id: 'day', label: '每天的位元組', query: { task: 'retention', perDay: 1_800_000, avgBytes: 193, days: 7, metric: 'bytes-per-day' } },
          { id: 'hot', label: '7 天（GB）', query: { task: 'retention', perDay: 1_800_000, avgBytes: 193, days: 7, metric: 'total-gb' } },
          { id: 'month', label: '30 天（GB）', query: { task: 'retention', perDay: 1_800_000, avgBytes: 193, days: 30, metric: 'total-gb' } },
        ],
        hints: ['每天的位元組 = 每天的筆數 × 平均大小。', '再乘以天數，除以 1,000,000,000 就是 GB。'],
        explanation: '1,800,000 × 193 = 347,400,000 位元組；× 7 = 2,431,800,000 位元組 ≈ 2.4 GB；× 30 = 10,422,000,000 位元組 ≈ 10.4 GB。保留天數和容量成正比：熱儲存從 7 天拉長到 30 天，需要的空間超過四倍，所以通常只把最近幾天放在熱儲存，更久的壓縮後封存。',
        mistakes: [
          { answer: { day: '347400000', hot: '2.3', month: '9.7' }, why: '用 1024³ 換算（GiB）；題目的 GB 是十進位的 10 億位元組' },
          { answer: { day: '347400000', hot: '0.3', month: '0.3' }, why: '忘了乘以保留的天數，算的是一天的量' },
        ],
      },
    ],
  },
};

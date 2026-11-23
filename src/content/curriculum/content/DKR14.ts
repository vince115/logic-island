/*
 * DKR14 Health Checks, Resource Limits and Graceful Shutdown (DKR-5, terminal-sim). A terminal lesson on the runtime
 * profile (engine stage E24, with E23's health checks): getting an order API (Node.js) ready for production. HEALTHCHECK in
 * a Dockerfile and the --health-* flags (interval, timeout, retries, start period; exit 0 or 1, `|| exit 1`), (health:
 * starting), (healthy) and (unhealthy) in docker ps and .State.Health in docker inspect, and plain Docker only reporting an
 * unhealthy container (RestartCount stays 0 even with --restart always); --memory and --cpus sized with docker stats
 * --no-stream, memory past the limit OOM-killed (137, OOMKilled, the oom event) while CPU over its share is only
 * throttled, docker update; restart policies no, on-failure[:N], always and unless-stopped with moby's back-off
 * (Restarting (1) …, RestartCount), docker stop cancelling them and the daemon-restart difference between always and
 * unless-stopped (text only); SIGTERM, docker stop's grace period (-t, --stop-timeout), STOPSIGNAL, the application
 * closing its listener and finishing in-flight requests, shell form versus exec form and PID 1 (sh -c does not pass
 * SIGTERM on: 137 after 10 s; exec form: node handles it in 2 s and exits 0; --init: docker-init forwards it, sh dies of
 * it: 143), and the twelve-factor ideas behind them (config in the environment, stateless processes, disposability, logs
 * to stdout). Machines: the Docker host dawn-01 (user kai in the docker group; node:22, which has curl, and the
 * orders-api program: needs DATABASE_URL, ready after 3 s, 80 MiB growing 2 MiB a second to 200 MiB, 35% of a CPU,
 * a 2-second SIGTERM handler) with ~/orders (a shell-form Dockerfile with a HEALTHCHECK), the same host with a built
 * orders-api:1.1 (exec form, no HEALTHCHECK), and the host with an orders container running for 20 seconds without a
 * memory limit. The host, user, company, URL and password are made up (the password is an obviously fake lesson value).
 * Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalDocker, TerminalImage, TerminalProgram } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const MIB = 1024 * 1024;
const dir = (path: string, owner = 'kai', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'kai', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n';
// The full node:22 image (Debian bookworm) has curl; node:22-slim does not (the text says so).
const TOOLS = ['ls', 'cat', 'echo', 'env', 'sh', 'bash', 'sleep', 'true', 'false', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'head', 'tail', 'grep', 'wc', 'hostname', 'id', 'whoami', 'uname', 'ps', 'curl', 'node'];
const NODE_ENV = [PATH_ENV, 'NODE_VERSION=22.11.0', 'YARN_VERSION=1.22.22'];
const NODE: TerminalImage = {
  name: 'node:22', size: 1_120_000_000, created: '2026-11-12 10:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'], env: NODE_ENV, layers: 8, pulled: true, osRelease: DEBIAN,
  commands: TOOLS, output: 'Welcome to Node.js v22.11.0.\n',
};

const DB_URL = 'postgres://orders:lesson-demo-pw@db.internal:5432/orders';
const START_LOG = 'orders-api 1.1 listening on :3000';
// What the order API does in a container (lesson data: the simulation does not run node).
const RUNTIME = {
  needsEnv: ['DATABASE_URL'], missingEnv: { output: 'Error: DATABASE_URL is not set\n    at loadConfig (/app/config.js:4:11)', exit: 1 },
  signals: { TERM: { seconds: 2, logs: ['SIGTERM received: closing the listener, 3 requests in flight', 'all requests finished, database pool closed, exiting'], exit: 0 } },
  memory: { start: 80 * MIB, growth: 2 * MIB, max: 200 * MIB }, cpu: 35, pids: 11,
} satisfies Partial<TerminalProgram>;
const PROGRAM: TerminalProgram = { command: ['node', 'server.js'], needs: ['server.js', 'config.js'], service: true, http: { port: 3000, responder: 'orders' }, ready: 3, logs: [START_LOG], ...RUNTIME };

const SERVER_JS = `const http = require('node:http');
const { loadConfig } = require('./config');
const { createPool } = require('./db');
const routes = require('./routes');

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const server = http.createServer(routes(pool));
let inFlight = 0;
server.on('request', (req, res) => { inFlight++; res.on('close', () => inFlight--); });
server.listen(config.port, () => console.log(\`orders-api 1.1 listening on :\${config.port}\`));

process.on('SIGTERM', () => {
  console.log(\`SIGTERM received: closing the listener, \${inFlight} requests in flight\`);
  server.close(async () => {
    await pool.end();
    console.log('all requests finished, database pool closed, exiting');
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 8000).unref();
});
`;
const CONFIG_JS = `function loadConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  return { databaseUrl, port: Number(process.env.PORT ?? 3000) };
}
module.exports = { loadConfig };
`;
const HEALTHCHECK = 'HEALTHCHECK --interval=5s --timeout=3s --retries=3 CMD curl -fsS http://localhost:3000/health || exit 1';
const dockerfile = (cmd: string, health = true) => `FROM node:22\nWORKDIR /app\nCOPY package.json ./\nCOPY . .\nEXPOSE 3000\n${health ? `${HEALTHCHECK}\n` : ''}${cmd}\n`;
const SHELL_DOCKERFILE = dockerfile('CMD node server.js');
const EXEC_DOCKERFILE = dockerfile('CMD ["node", "server.js"]', false);

const ordersFiles = (df: string): TerminalFile[] => [
  dir('/home/kai/orders'), file('/home/kai/orders/Dockerfile', df), file('/home/kai/orders/.dockerignore', 'node_modules\n.git\n.env\n'),
  file('/home/kai/orders/package.json', '{\n  "name": "orders-api",\n  "version": "1.1.0",\n  "main": "server.js"\n}\n'),
  file('/home/kai/orders/server.js', SERVER_JS), file('/home/kai/orders/config.js', CONFIG_JS),
];

const host = (id: string, title: string, files: TerminalFile[], docker: TerminalDocker): TerminalMachine => ({
  id, title, user: 'kai', host: 'dawn-01', cwd: '/home/kai', profile: 'runtime', cpus: 2, now: '2026-11-22 10:00:00', boot: '2026-11-22 06:00:00',
  files: [dir('/home'), dir('/home/kai', 'kai', 0o750), ...files],
  accounts: { groups: [{ name: 'sudo', members: ['kai'] }, { name: 'docker', gid: 988, members: ['kai'] }] },
  responders: [{
    id: 'orders', server: 'node', routes: [
      { path: '/', body: '{"service":"orders-api","version":"1.1.0"}\n', type: 'application/json' },
      { path: '/health', body: '{"status":"ok"}\n', type: 'application/json' },
    ],
  }],
  docker,
});

// The image CI built from EXEC_DOCKERFILE (exec form, no HEALTHCHECK); its own main process is the order API.
const BUILT: TerminalImage = {
  name: 'orders-api:1.1', size: 1_120_004_200, created: '2026-11-21 16:00:00', cmd: ['node', 'server.js'], entrypoint: ['docker-entrypoint.sh'], workdir: '/app', env: NODE_ENV, expose: [3000],
  pulled: true, registry: false, osRelease: DEBIAN, commands: TOOLS, service: true, http: { port: 3000, responder: 'orders' }, ready: 3, logs: [START_LOG], ...RUNTIME,
  files: [{ path: '/app/server.js', content: SERVER_JS }, { path: '/app/config.js', content: CONFIG_JS }],
};

const MAIN = host('dkr14-dawn', 'dawn-01（~/orders：Shell 形式的 CMD 與 HEALTHCHECK）', ordersFiles(SHELL_DOCKERFILE), { images: [NODE], programs: [PROGRAM] });
const READY = host('dkr14-ready', 'dawn-01（CI 建置好的 orders-api:1.1：exec 形式，沒有 HEALTHCHECK）', ordersFiles(EXEC_DOCKERFILE), { images: [NODE, BUILT], programs: [PROGRAM] });
const SIZING = host('dkr14-sizing', 'dawn-01（orders 容器已執行 20 秒，還沒有記憶體上限）', ordersFiles(EXEC_DOCKERFILE), {
  images: [NODE, BUILT], programs: [PROGRAM],
  containers: [{ name: 'orders', image: 'orders-api:1.1', state: 'running', created: '2026-11-22 09:59:40', started: '2026-11-22 09:59:40', env: [`DATABASE_URL=${DB_URL}`], ports: ['8080:3000'] }],
});

const RUN_ENV = `-e DATABASE_URL=${DB_URL}`;

export const DKR14: LessonContent = {
  lessonId: 'DKR14',
  motivation: '晨光便當的訂單 API 已經包成 Image，在 dawn-01 上 `docker run` 也跑得起來，下週就要正式上線。可是「跑得起來」離「可以上線」還有一段距離：程式卡住、只會回 500 時，`docker ps` 照樣顯示 Up，沒有人知道它其實壞了；某天記憶體慢慢漲上去，把同一台主機上的資料庫一起拖垮；半夜因為資料庫短暫連不上而當掉，沒有人去把它叫起來；每次部署新版本，`docker stop` 都要卡 10 秒，正在處理的訂單被硬生生切斷，客人看到錯誤頁面。這一課替訂單 API 補上上線前的四件事：用 HEALTHCHECK 讓 Docker 知道服務是否真的健康，用 `docker stats` 量出用量再設定合理的記憶體與 CPU 上限，依服務的性質選擇重新啟動策略，並讓程式在收到 SIGTERM 時停止接新請求、把手上的請求做完再結束。最後把這些做法對照十二要素應用（Twelve-Factor App）的幾條原則，看懂它們為什麼是同一件事的不同面向。',
  sections: [
    {
      id: 'dkr14-s-why', title: '從「跑得起來」到「可以上線」',
      blocks: [
        { type: 'p', text: '上線前，維運的同事會問四個問題。每個問題 Docker 都有對應的工具，但它們預設都是關閉或很寬鬆的：沒有健康檢查、沒有資源上限、不會自動重新啟動、停止時只等 10 秒。這一課逐一把它們設定好，並在 dawn-01 上看清楚每個設定改變了什麼。' },
        { type: 'table', head: ['要回答的問題', 'Docker 的工具', '沒有設定時'], rows: [
          ['服務真的能用嗎？', '`HEALTHCHECK`、`docker run --health-*`', '只要主程式還在，`docker ps` 就顯示 Up，就算它已經無法回應'],
          ['會不會吃光主機的資源？', '`--memory`（`-m`）、`--cpus`、`docker stats`、`docker update`', '沒有上限，一個記憶體洩漏的容器可以拖垮整台主機'],
          ['當掉之後誰把它叫起來？', '`--restart no|on-failure[:N]|always|unless-stopped`', '`no`：結束就停在 Exited，等人發現'],
          ['停止或更新時會不會切斷請求？', 'SIGTERM、`docker stop -t`、`STOPSIGNAL`、exec 形式、`--init`', '10 秒後 SIGKILL（137），處理到一半的請求直接中斷'],
        ] },
        { type: 'p', text: 'dawn-01 的 `~/orders` 是訂單 API 的專案：`server.js` 是用 Node.js 寫的 HTTP 服務，`config.js` 從環境變數讀設定，Dockerfile 以官方的 `node:22` 為基底。下面幾節的範例都從這個資料夾建置 Image。程式需要環境變數 `DATABASE_URL`（範例裡的密碼 lesson-demo-pw 是課程用的假值），啟動約 3 秒後才開始接受連線；這些行為是課程為模擬環境宣告的資料，模擬環境不會真的執行 node。' },
      ],
    },
    {
      id: 'dkr14-s-health', title: 'HEALTHCHECK：讓 Docker 知道服務是否健康',
      blocks: [
        { type: 'p', text: '容器的狀態 Up 只代表主程式（PID 1）還活著。程式可能卡在死結、資料庫連線池耗盡、每個請求都回 500，行程卻一直都在。健康檢查（health check）讓 Docker 定期在容器裡執行一個指令來探測：結束碼 0 代表健康，非 0 代表這次失敗，連續失敗 `retries` 次就標成 unhealthy。Docker 文件規定這個指令的結束碼只該是 0（健康）或 1（不健康），2 保留不用；`curl -f` 遇到 HTTP 錯誤會以 22 結束，所以慣例是在後面加 `|| exit 1`，把各種失敗統一成 1。' },
        { type: 'table', head: ['Dockerfile 的 HEALTHCHECK 選項', '`docker run` 的旗標', '意義（括號內是預設值）'], rows: [
          ['`--interval=5s`', '`--health-interval 5s`', '多久探測一次（30s）；第一次探測在啟動後一個 interval'],
          ['`--timeout=3s`', '`--health-timeout 3s`', '一次探測最多等多久，超過算失敗（30s）'],
          ['`--retries=3`', '`--health-retries 3`', '連續失敗幾次才標成 unhealthy（3）'],
          ['`--start-period=20s`', '`--health-start-period 20s`', '啟動後的寬限期：這段時間的失敗不計入 retries，但成功就立刻算健康（0s）'],
          ['`--start-interval=2s`', '`--health-start-interval 2s`', '寬限期內探測的間隔（5s；Docker 25 起）'],
          ['`CMD 指令…`', '`--health-cmd "指令"`', '探測的指令；Dockerfile 寫 `HEALTHCHECK NONE`、run 加 `--no-healthcheck` 可以關掉 Image 的健康檢查'],
        ] },
        { type: 'p', text: '`~/orders/Dockerfile` 已經寫了 `HEALTHCHECK --interval=5s --timeout=3s --retries=3 CMD curl -fsS http://localhost:3000/health || exit 1`。探測是在容器裡面執行的，所以網址是容器自己的 localhost 與容器埠 3000，不是主機上公開的 8080；它也要求 Image 裡有 curl：完整的 `node:22`（Debian bookworm）附有 curl，精簡的 `node:22-slim` 沒有，用 slim 時要自己安裝 curl，或改用不需要 curl 的檢查（例如用 node 寫一個小腳本）。容器剛啟動時是 `(health: starting)`，5 秒後第一次探測成功就變成 `(healthy)`；`docker inspect` 的 `.State.Health` 記錄狀態、連續失敗次數（FailingStreak）與最近 5 次探測的時間、結束碼與輸出：' },
        { type: 'example', id: 'dkr14-health' },
        { type: 'p', text: '`/health` 這個端點要回答「這個行程能不能處理請求」：設定讀到了、能連上它必須依賴的東西。它應該輕量、快速，不要在裡面做昂貴的查詢；探測每 5 秒一次，太重的檢查本身就會造成負擔。下面的容器把健康檢查的網址打成了 `/healthz`，服務根本沒有這個路徑，每次探測都是 404。連續失敗 3 次之後狀態變成 `(unhealthy)`，但它加了 `--restart always`，`RestartCount` 仍然是 0，容器照樣 Up：' },
        { type: 'example', id: 'dkr14-unhealthy' },
        { type: 'callout', tone: 'warning', title: 'Docker 不會重新啟動不健康的容器', text: '很多人以為加了 HEALTHCHECK 再加 `--restart always`，容器不健康時 Docker 就會自動重新啟動它。單獨執行的 Docker 不會：重新啟動策略只在主程式結束時才起作用，unhealthy 只是一個被回報的狀態，顯示在 `docker ps`、`docker inspect` 與 `docker events` 的 health_status 事件裡。會依健康狀態採取行動的是上層的工具：Compose 的 `depends_on` 的 `condition: service_healthy` 等它健康才啟動相依的服務（DKR09），Swarm 的服務會替換不健康的工作，Kubernetes 用自己的 liveness probe 重新啟動、readiness probe 決定是否導入流量，負載平衡器也會把不健康的後端移出。單機上若要自動處理，得另外有監控去讀這個狀態。' },
      ],
    },
    {
      id: 'dkr14-s-limits', title: 'CPU 與記憶體限制：先量測，再設定上限',
      blocks: [
        { type: 'p', text: '容器預設沒有資源上限，可以用到整台主機的 CPU 與記憶體。在同一台主機上跑好幾個服務時，一個記憶體洩漏或陷入無窮迴圈的容器就能讓其他服務（包括資料庫）一起變慢或被核心的 OOM killer 結束。`docker run` 的 `-m`（`--memory`）與 `--cpus` 透過 cgroup 替容器設定上限；已經在跑的容器可以用 `docker update` 調整，立刻生效。' },
        { type: 'table', head: ['選項', '例子', '超過時會怎樣'], rows: [
          ['`-m`、`--memory`', '`-m 256m`（單位 b、k、m、g，以 1024 計；最小 6MB）', '核心的 OOM killer 結束容器裡的行程；主程式被結束，容器以 137 結束，`.State.OOMKilled` 是 true'],
          ['`--memory-swap`', '沒寫時是 `-m` 的兩倍（主機有 swap 才有意義）；設成和 `-m` 一樣就是不用 swap', '記憶體加 swap 的總上限'],
          ['`--cpus`', '`--cpus 0.5`：每個排程週期最多用半顆 CPU 的時間（等同 `--cpu-period=100000 --cpu-quota=50000`）', '被節流（throttle）：程式變慢，不會被結束'],
          ['`-c`、`--cpu-shares`', '預設 1024 的相對權重', '只在 CPU 不夠分時決定比例，不是上限'],
        ] },
        { type: 'p', text: '記憶體與 CPU 超過上限的後果完全不同。CPU 是可以「等」的資源：用完這個週期的配額，程式就停下來等下一個週期，結果是變慢、延遲變長，容器照樣執行。記憶體沒辦法等：容器要再多一點而 cgroup 已經滿了，核心只能結束行程。所以記憶體上限要留足餘裕，CPU 上限則是在「這個服務最多可以變多慢」與「不要搶別人的 CPU」之間取捨。' },
        { type: 'p', text: '上限要從量測來，不是用猜的。`docker stats --no-stream` 印出每個容器當下的 CPU %、記憶體用量與上限、MEM %（真實的 `docker stats` 不加 `--no-stream` 會持續更新畫面）。下面同時啟動兩個訂單 API：orders 設 256MiB 與四分之一顆 CPU，small 只給 128MiB。程式需要 35% 的 CPU，所以 orders 被節流在 25.00%；它的記憶體從 80MiB 起每秒增加約 2MiB，到 200MiB 才穩定。small 剛啟動時看起來完全正常，24 秒後越過 128MiB，被 OOM killer 結束：' },
        { type: 'example', id: 'dkr14-limits' },
        { type: 'callout', tone: 'warning', title: '「測試時好好的」不代表上限夠', text: 'small 在啟動後的前 20 秒，`docker stats` 只顯示 93.75%，一切正常；等用量隨著快取、連線與流量長上去，它才在 24 秒時被結束。只在剛啟動時看一眼就設定上限，是記憶體上限最常見的錯誤。正確的做法是讓服務跑到穩定（或做過負載測試），用穩定或尖峰時的用量再加上餘裕；被結束時用 `docker inspect -f \'{{.State.OOMKilled}}\'` 與 `docker events` 的 oom 事件確認原因，而不是只看到 137 就以為是被人 kill 掉。' },
        { type: 'p', text: '設定上限之後，`docker inspect` 的 `HostConfig.Memory` 是位元組（268435456 就是 256MiB），`HostConfig.NanoCpus` 是十億分之一顆 CPU（250000000 就是 0.25）。沒有 swap 的主機上，`MemorySwap` 顯示的兩倍值沒有實際作用。' },
      ],
    },
    {
      id: 'dkr14-s-restart', title: '重新啟動策略：no、on-failure、always 與 unless-stopped',
      blocks: [
        { type: 'p', text: '`--restart` 決定主程式結束之後 Docker 要不要再啟動它。它只看「主程式結束」這件事：程式自己以錯誤結束、被 OOM killer 結束都算；被 `docker stop` 手動停止的容器不會被重新啟動。' },
        { type: 'table', head: ['策略', '什麼時候重新啟動', '適合'], rows: [
          ['`no`（預設）', '從不', '一次性的工作、正在除錯的容器'],
          ['`on-failure[:N]`', '結束碼不是 0 時；`:N` 是最多重試幾次', '批次工作、偶爾因外部原因失敗的程式；N 次後放棄，讓真正的錯誤停下來被人看到'],
          ['`always`', '一律重新啟動；手動停止的容器在 Docker daemon 重新啟動（例如主機重開機）後也會再被啟動', '必須一直執行、而且不希望有人能讓它停著的服務'],
          ['`unless-stopped`', '和 always 相同，但手動停止過的容器在 daemon 重新啟動後維持停止', '大多數長期執行的服務'],
        ] },
        { type: 'p', text: '為了避免一個一啟動就當掉的容器把主機占滿，Docker 在每次重新啟動前等待一段遞增的時間：從 100 毫秒開始，每次加倍，最多一分鐘；某一次執行超過 10 秒，等待時間就回到 100 毫秒。等待中的容器狀態是 restarting，`docker ps` 不加 `-a` 也會列出，STATUS 是 `Restarting (1) 1 second ago`（上一次的結束碼與結束了多久），`RestartCount` 記錄重新啟動了幾次。下面的容器忘了傳 `DATABASE_URL`，程式一啟動就以 1 結束：always 讓它不停地重新啟動，on-failure:3 試了 3 次就放棄，`docker stop` 取消 always 的重新啟動：' },
        { type: 'example', id: 'dkr14-restart' },
        { type: 'p', text: '重新啟動不會修好設定錯誤：每次啟動都印出同一行 `DATABASE_URL is not set`。這也是 on-failure 加上次數常常比 always 適合程式錯誤的原因：幾次之後容器停在 `Exited (1)`，監控與值班的人看得到它；always 則讓它永遠在 Restarting 之間打轉，日誌裡重複著同樣的錯誤。對長期執行的網路服務，暫時的失敗（資料庫重新開機、網路短暫中斷）在重試後會自己恢復，unless-stopped 是常見的選擇。已經在跑的容器可以用 `docker update --restart unless-stopped 容器` 改策略；`--restart always` 這類策略不能和 `--rm` 一起用（docker run 回報 Conflicting options）。' },
        { type: 'callout', tone: 'warning', title: 'always 會把你刻意停掉的容器再叫起來', text: '`docker stop` 之後，always 與 unless-stopped 的容器都會停著，看起來沒有差別。差別出現在 Docker daemon 重新啟動時（主機重開機、升級 Docker）：always 的容器不管之前是不是被人手動停止，都會再被啟動；unless-stopped 的容器如果之前是手動停止的，就維持停止。所以為了維護而停掉的服務，如果是 always，下一次主機重開機它就自己回來了，可能正好在你還沒準備好的時候。這個情境模擬環境沒有模擬（它的 daemon 不會重新啟動），請記住文件上的這條規則。' },
      ],
    },
    {
      id: 'dkr14-s-stop', title: 'SIGTERM 處理與優雅關閉：PID 1 是誰很重要',
      blocks: [
        { type: 'p', text: '`docker stop` 先送 StopSignal（預設 SIGTERM）給容器的 PID 1，等它自己結束，最多等寬限期（預設 10 秒，可用 `docker stop -t 30`、`docker run --stop-timeout 30` 調整），時間到還沒結束就送 SIGKILL，容器以 137（128 + 9）結束。部署新版本、主機維護、Compose 的 `down` 都是這樣停止容器的。優雅關閉（graceful shutdown）的意思是：收到 SIGTERM 後先停止接受新連線，把手上正在處理的請求做完，關閉資料庫連線池等資源，在寬限期內自己以 0 結束。' },
        { type: 'p', text: '`~/orders/server.js` 就是這樣寫的：`process.on(\'SIGTERM\', …)` 裡 `server.close()` 停止接受新連線並在既有的請求結束後呼叫回呼，`closeIdleConnections()` 關掉閒置的 keep-alive 連線，回呼裡關閉連線池後 `process.exit(0)`；另外設一個 8 秒的計時器，萬一有請求一直不結束，程式自己先放棄，不必等到 Docker 的 SIGKILL。但光是程式寫對還不夠：Linux 核心對 PID 1 不套用訊號的預設動作，PID 1 沒有註冊處理函式的訊號會被忽略；而且訊號只送給 PID 1，PID 1 是誰決定了程式能不能收到它。`node:22` 的 ENTRYPOINT 是 `docker-entrypoint.sh`，它最後以 `exec "$@"` 把 PID 1 交給 CMD 組出來的指令（所以 `docker ps` 的 COMMAND 欄顯示 `docker-entrypoint.s…`），PID 1 最後是什麼仍由 CMD 的寫法決定。' },
        { type: 'table', head: ['Dockerfile 的寫法', 'PID 1', 'docker stop 的結果'], rows: [
          ['`CMD node server.js`（Shell 形式）', '`/bin/sh -c`', 'sh 不轉送 SIGTERM，node 收不到；10 秒後 SIGKILL，137'],
          ['`CMD ["node", "server.js"]`（exec 形式）', 'node', 'node 的處理函式執行，做完請求後以 0 結束'],
          ['Shell 形式，但寫成 `CMD exec node server.js`，或 entrypoint 指令稿最後 `exec "$@"`', 'node（sh 被 exec 取代）', '和 exec 形式相同'],
          ['`docker run --init`（exec 形式）', 'docker-init', 'docker-init 把訊號轉給 node；沒有處理函式的程式也會因 SIGTERM 結束（143），並清掉殭屍行程'],
          ['`docker run --init`（Shell 形式）', 'docker-init，底下是 sh', '訊號轉給 sh，sh 因此結束（143），node 沒有機會收尾'],
        ] },
        { type: 'p', text: '下面先以 Shell 形式的 Image 啟動容器：`docker exec … ps` 看到 PID 1 是 sh、node 在 PID 7；`docker stop` 讓時鐘走了整整 10 秒，結果是 137，日誌裡沒有任何 SIGTERM 的訊息。同一個 Image 在 `docker run` 時直接給 exec 形式的指令 `node server.js`，node 成為 PID 1，2 秒就以 0 結束，日誌印出收尾的兩行。最後加 `--init` 但 CMD 仍是 Shell 形式：docker-init 把 SIGTERM 轉給 sh，sh 被結束（143），node 一樣沒有收尾：' },
        { type: 'example', id: 'dkr14-stop' },
        { type: 'callout', tone: 'warning', title: 'Shell 形式的 CMD 讓 docker stop 卡 10 秒', text: '`CMD node server.js` 看起來和 `CMD ["node", "server.js"]` 一樣，其實前者是 `/bin/sh -c "node server.js"`：PID 1 是 sh，它不會把 SIGTERM 轉給 node，所以 node 寫得再好的處理函式也不會執行，每次停止都等滿寬限期再被 SIGKILL，正在處理的請求被切斷。實際上，有些 Shell（例如 bash）在 `-c` 只有一個簡單指令時會直接 exec 它，這時症狀不一定出現在你的主機上；但那只是 Shell 的最佳化，不是保證，換一個基底 Image 或在指令前後多加一段就失效，所以不要依賴它：CMD 與 ENTRYPOINT 一律用 exec 形式，需要指令稿時在最後一行用 `exec`。BuildKit 對 Shell 形式的 CMD 也會提出 JSONArgsRecommended 警告（DKR05）。' },
        { type: 'p', text: '有些程式用別的訊號表示「優雅地停止」：官方的 nginx Image 在 Dockerfile 寫了 `STOPSIGNAL SIGQUIT`（nginx 收到 SIGQUIT 會等連線處理完再結束，SIGTERM 則是快速結束），`docker stop` 就改送 SIGQUIT。也可以在執行時用 `--stop-signal` 覆寫。寬限期要比程式最長的收尾時間長：訂單 API 自己最多等 8 秒，預設的 10 秒剛好夠；如果有長時間的請求（例如匯出報表），就要一起拉長程式的計時器與 `-t`。Compose 裡對應的鍵是 `stop_grace_period` 與 `stop_signal`。' },
      ],
    },
    {
      id: 'dkr14-s-twelve', title: '十二要素應用：這些設定背後的原則',
      blocks: [
        { type: 'p', text: '十二要素應用（The Twelve-Factor App）是一份由 Heroku 的工程師整理、描述「適合部署在雲端平台的應用」的十二條原則。這一課做的事情對應到其中幾條；它們不是 Docker 專屬的規則，而是讓任何平台（Docker、Kubernetes、PaaS）都能放心地啟動、停止、搬移你的程式的前提。' },
        { type: 'table', head: ['原則', '內容', '在訂單 API 上的做法'], rows: [
          ['III. 設定（Config）', '會隨部署環境改變的設定放在環境變數，不寫死在程式碼或 Image 裡', '`DATABASE_URL` 用 `-e` 傳入，同一個 Image 用在測試與正式環境；缺了就在啟動時明確失敗'],
          ['VI. 行程（Processes）', '行程是無狀態的、不共享任何東西；需要保存的資料放在資料庫等後端服務', '訂單寫進資料庫，不存在容器的檔案或記憶體裡，所以被 OOM 結束、重新啟動或換一台主機都不會遺失'],
          ['IX. 可拋棄性（Disposability）', '行程可以隨時啟動或停止：啟動要快，收到 SIGTERM 要優雅地結束', '3 秒就能接受連線；exec 形式讓 node 收到 SIGTERM，在寬限期內做完請求並以 0 結束'],
          ['XI. 日誌（Logs）', '把日誌當成事件串流寫到標準輸出，由執行環境收集與保存', '只用 `console.log` 寫到 stdout，`docker logs` 與日誌收集系統就看得到，不在容器裡寫日誌檔'],
        ] },
        { type: 'p', text: '這幾條原則互相支撐。因為行程是無狀態的，Docker 才能放心地在 OOM 之後重新啟動它、部署時直接換掉舊容器；因為能優雅地關閉，換掉舊容器時才不會切斷客人的訂單；因為設定來自環境變數，健康檢查、資源上限與重新啟動策略這些「怎麼執行」的決定，才能留給部署的人在 `docker run`（或 Compose、Kubernetes 的設定）裡決定，而不必重新建置 Image。上線前最後的檢查清單就是：exec 形式的 CMD、輕量的 `/health` 與 HEALTHCHECK、量測過的 `-m` 與 `--cpus`、符合服務性質的 `--restart`、能在寬限期內完成的 SIGTERM 處理。' },
        { type: 'list', items: [
          '在 Compose 裡，同樣的設定寫成服務的 `healthcheck`、`restart`、`stop_grace_period`、`stop_signal`，資源上限寫在 `deploy.resources.limits`（memory、cpus）。',
          '在 Kubernetes 裡，資源上限是 `resources.limits`，健康檢查拆成決定是否重新啟動的 liveness probe 與決定是否導入流量的 readiness probe，Pod 停止時同樣先送 SIGTERM、等 `terminationGracePeriodSeconds`（預設 30 秒）。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [MAIN, READY, SIZING],
    examples: [
      {
        id: 'dkr14-health', title: 'HEALTHCHECK：從 starting 到 healthy', machine: 'dkr14-dawn',
        description: '建置有 HEALTHCHECK 的 Image 並啟動；docker ps 先顯示 (health: starting)，第一次探測後是 (healthy)；從 .State.Health 讀出探測的紀錄。',
        steps: [
          { command: 'cd orders', output: "" },
          { command: 'cat Dockerfile', output: "FROM node:22\nWORKDIR /app\nCOPY package.json ./\nCOPY . .\nEXPOSE 3000\nHEALTHCHECK --interval=5s --timeout=3s --retries=3 CMD curl -fsS http://localhost:3000/health || exit 1\nCMD node server.js" },
          { command: 'docker build -q -t orders-api:1.0 .', output: "sha256:279ed3fe0f6097eb4ea0b051fd1805c063191e335ef93ff19c954f3dd01465e5" },
          { command: `docker run -d --name orders -p 8080:3000 ${RUN_ENV} orders-api:1.0`, output: "7ce600f14952ffab18813d389191c16845bfa0f2832df1f311f6d3d5d67a6e47" },
          { command: 'docker ps', output: "CONTAINER ID   IMAGE            COMMAND                  CREATED                  STATUS                                     PORTS                                         NAMES\n7ce600f14952   orders-api:1.0   \"docker-entrypoint.s…\"   Less than a second ago   Up Less than a second (health: starting)   0.0.0.0:8080->3000/tcp, [::]:8080->3000/tcp   orders" },
          { command: 'sleep 5', output: "" },
          { command: "docker ps --format '{{.Names}}: {{.Status}}'", output: "orders: Up 5 seconds (healthy)" },
          { command: "docker inspect -f '{{.State.Health.Status}} {{.State.Health.FailingStreak}}' orders", output: "healthy 0" },
          { command: "docker inspect -f '{{json .State.Health}}' orders", output: "{\"Status\":\"healthy\",\"FailingStreak\":0,\"Log\":[{\"Start\":\"2026-11-22T10:00:05.000000000Z\",\"End\":\"2026-11-22T10:00:05.000000000Z\",\"ExitCode\":0,\"Output\":\"{\\\"status\\\":\\\"ok\\\"}\\n\"}]}" },
          { command: 'curl -s localhost:8080/health', output: "{\"status\":\"ok\"}" },
        ],
      },
      {
        id: 'dkr14-unhealthy', title: '不健康的容器不會被重新啟動', machine: 'dkr14-dawn',
        description: '用 --health-cmd 覆寫成錯的路徑 /healthz：連續 3 次 404 之後是 (unhealthy)，但加了 --restart always 的容器照樣 Up，RestartCount 是 0。',
        steps: [
          { command: 'cd orders', output: "" },
          { command: 'docker build -q -t orders-api:1.0 .', output: "sha256:279ed3fe0f6097eb4ea0b051fd1805c063191e335ef93ff19c954f3dd01465e5" },
          { command: `docker run -d --name orders --restart always --health-cmd "curl -fsS http://localhost:3000/healthz || exit 1" --health-interval 5s --health-retries 3 ${RUN_ENV} orders-api:1.0`, output: "7ce600f14952ffab18813d389191c16845bfa0f2832df1f311f6d3d5d67a6e47" },
          { command: 'sleep 10', output: "" },
          { command: "docker ps --format '{{.Names}}: {{.Status}}'", output: "orders: Up 10 seconds (health: starting)" },
          { command: 'sleep 10', output: "" },
          { command: "docker ps --format '{{.Names}}: {{.Status}}'", output: "orders: Up 20 seconds (unhealthy)" },
          { command: "docker inspect -f '{{.State.Health.Status}} streak={{.State.Health.FailingStreak}} restarts={{.RestartCount}}' orders", output: "unhealthy streak=4 restarts=0" },
          { command: "docker inspect -f '{{range .State.Health.Log}}{{.ExitCode}} {{.Output}}{{end}}' orders", output: "1 curl: (22) The requested URL returned error: 404\n1 curl: (22) The requested URL returned error: 404\n1 curl: (22) The requested URL returned error: 404\n1 curl: (22) The requested URL returned error: 404\n" },
        ],
      },
      {
        id: 'dkr14-limits', title: '記憶體被 OOM 結束、CPU 只被節流', machine: 'dkr14-dawn',
        description: 'orders 有 256MiB 與 0.25 顆 CPU，small 只有 128MiB；docker stats 看用量，small 在 24 秒時越過上限被結束（137、OOMKilled、oom 事件），orders 的 CPU 被節流在 25%。',
        steps: [
          { command: 'cd orders', output: "" },
          { command: 'docker build -q -t orders-api:1.0 .', output: "sha256:279ed3fe0f6097eb4ea0b051fd1805c063191e335ef93ff19c954f3dd01465e5" },
          { command: `docker run -d --name orders -m 256m --cpus 0.25 ${RUN_ENV} orders-api:1.0`, output: "7ce600f14952ffab18813d389191c16845bfa0f2832df1f311f6d3d5d67a6e47" },
          { command: `docker run -d --name small -m 128m ${RUN_ENV} orders-api:1.0`, output: "58f7c2ffd30d6a5ec30070d2ce5776b7599f70b7438f3951f8a7d3e17524192f" },
          { command: 'docker stats --no-stream', output: "CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O   BLOCK I/O   PIDS\n58f7c2ffd30d   small     35.00%    80MiB / 128MiB      62.50%    0B / 0B   0B / 0B     11\n7ce600f14952   orders    25.00%    80MiB / 256MiB      31.25%    0B / 0B   0B / 0B     11" },
          { command: 'sleep 20', output: "" },
          { command: 'docker stats --no-stream', output: "CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O   BLOCK I/O   PIDS\n58f7c2ffd30d   small     35.00%    120MiB / 128MiB     93.75%    0B / 0B   0B / 0B     11\n7ce600f14952   orders    25.00%    120MiB / 256MiB     46.88%    0B / 0B   0B / 0B     11" },
          { command: 'sleep 5', output: "" },
          { command: "docker ps -a --format '{{.Names}}: {{.Status}}'", output: "small: Exited (137) 1 second ago\norders: Up 25 seconds (healthy)" },
          { command: "docker inspect -f 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}} Memory={{.HostConfig.Memory}}' small", output: "OOMKilled=true ExitCode=137 Memory=134217728" },
          { command: 'docker events --since 1m --until 0s --filter container=small', output: "2026-11-22T10:00:00.000000000Z container create 58f7c2ffd30d6a5ec30070d2ce5776b7599f70b7438f3951f8a7d3e17524192f (image=orders-api:1.0, name=small)\n2026-11-22T10:00:00.000000000Z container start 58f7c2ffd30d6a5ec30070d2ce5776b7599f70b7438f3951f8a7d3e17524192f (image=orders-api:1.0, name=small)\n2026-11-22T10:00:05.000000000Z container health_status: healthy 58f7c2ffd30d6a5ec30070d2ce5776b7599f70b7438f3951f8a7d3e17524192f (image=orders-api:1.0, name=small)\n2026-11-22T10:00:24.000000000Z container oom 58f7c2ffd30d6a5ec30070d2ce5776b7599f70b7438f3951f8a7d3e17524192f (image=orders-api:1.0, name=small)\n2026-11-22T10:00:24.000000000Z container die 58f7c2ffd30d6a5ec30070d2ce5776b7599f70b7438f3951f8a7d3e17524192f (execDuration=24, exitCode=137, image=orders-api:1.0, name=small)" },
          { command: "docker inspect -f 'Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}}' orders", output: "Memory=268435456 NanoCpus=250000000" },
          { command: 'sleep 60', output: "" },
          { command: 'docker stats --no-stream orders', output: "CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O   BLOCK I/O   PIDS\n7ce600f14952   orders    25.00%    200MiB / 256MiB     78.13%    0B / 0B   0B / 0B     11" },
        ],
      },
      {
        id: 'dkr14-restart', title: '重新啟動策略與退避', machine: 'dkr14-dawn',
        description: '忘了 DATABASE_URL 的容器一啟動就以 1 結束：always 一直在 Restarting，on-failure:3 重試 3 次後停在 Exited (1)；docker stop 取消 always 的重新啟動。',
        steps: [
          { command: 'cd orders', output: "" },
          { command: 'docker build -q -t orders-api:1.0 .', output: "sha256:279ed3fe0f6097eb4ea0b051fd1805c063191e335ef93ff19c954f3dd01465e5" },
          { command: 'docker run -d --name crashy --restart always orders-api:1.0', output: "05e4bc6a866f60d4edb6040188506653f4110b0d5d6fc554dcaf68851fb9897d" },
          { command: 'docker run -d --name limited --restart on-failure:3 orders-api:1.0', output: "da88e82aa404995c77a19f5197b5d829baa1de160acee761b13e33d3dd57f9f8" },
          { command: 'docker ps', output: "CONTAINER ID   IMAGE            COMMAND                  CREATED                  STATUS                                  PORTS     NAMES\nda88e82aa404   orders-api:1.0   \"docker-entrypoint.s…\"   Less than a second ago   Restarting (1) Less than a second ago             limited\n05e4bc6a866f   orders-api:1.0   \"docker-entrypoint.s…\"   Less than a second ago   Restarting (1) Less than a second ago             crashy" },
          { command: 'sleep 3', output: "" },
          { command: "docker ps -a --format '{{.Names}}: {{.Status}}'", output: "limited: Exited (1) 2 seconds ago\ncrashy: Restarting (1) 1 second ago" },
          { command: 'docker logs --tail 2 crashy', output: "Error: DATABASE_URL is not set\n    at loadConfig (/app/config.js:4:11)" },
          { command: "docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy}} restarts={{.RestartCount}} {{.State.Status}}' crashy limited", output: "/crashy {always 0} restarts=5 restarting\n/limited {on-failure 3} restarts=3 exited" },
          { command: 'sleep 60', output: "" },
          { command: "docker inspect -f '{{.Name}} restarts={{.RestartCount}} {{.State.Status}}' crashy limited", output: "/crashy restarts=10 restarting\n/limited restarts=3 exited" },
          { command: 'docker stop crashy', output: "crashy" },
          { command: "docker ps -a --format '{{.Names}}: {{.Status}}'", output: "limited: Exited (1) About a minute ago\ncrashy: Exited (1) 11 seconds ago" },
        ],
      },
      {
        id: 'dkr14-stop', title: 'PID 1、SIGTERM 與 docker stop 的寬限期', machine: 'dkr14-dawn',
        description: 'server.js 的 SIGTERM 處理；Shell 形式的 PID 1 是 sh，docker stop 等滿 10 秒（137）；exec 形式的 node 是 PID 1，2 秒做完請求以 0 結束；--init 底下仍是 sh 時 sh 因 SIGTERM 結束（143）。',
        steps: [
          { command: 'cd orders', output: "" },
          { command: 'tail -n 10 server.js', output: "process.on('SIGTERM', () => {\n  console.log(`SIGTERM received: closing the listener, ${inFlight} requests in flight`);\n  server.close(async () => {\n    await pool.end();\n    console.log('all requests finished, database pool closed, exiting');\n    process.exit(0);\n  });\n  server.closeIdleConnections();\n  setTimeout(() => process.exit(1), 8000).unref();\n});" },
          { command: 'tail -n 1 Dockerfile', output: "CMD node server.js" },
          { command: 'docker build -q -t orders-api:1.0 .', output: "sha256:279ed3fe0f6097eb4ea0b051fd1805c063191e335ef93ff19c954f3dd01465e5" },
          { command: `docker run -d --name shellform ${RUN_ENV} orders-api:1.0`, output: "c95dc4899106eaa37a9fd0522d76de9d70b255d21ac66e2d205a19732738882b" },
          { command: 'docker exec shellform ps', output: "    PID TTY          TIME CMD\n      1 ?        00:00:00 sh\n      7 ?        00:00:00 node\n      8 ?        00:00:00 ps" },
          { command: 'date', output: "Sun Nov 22 10:00:00 UTC 2026" },
          { command: 'docker stop shellform', output: "shellform" },
          { command: 'date', output: "Sun Nov 22 10:00:10 UTC 2026" },
          { command: 'docker logs shellform', output: "orders-api 1.1 listening on :3000" },
          { command: `docker run -d --name execform ${RUN_ENV} orders-api:1.0 node server.js`, output: "1f6bb9d24f449956c99cdce2e222b9895e73056aa3c8d390432b9e39e0062731" },
          { command: 'docker exec execform ps', output: "    PID TTY          TIME CMD\n      1 ?        00:00:00 node\n      7 ?        00:00:00 ps" },
          { command: 'docker stop execform', output: "execform" },
          { command: 'date', output: "Sun Nov 22 10:00:12 UTC 2026" },
          { command: 'docker logs execform', output: "orders-api 1.1 listening on :3000\nSIGTERM received: closing the listener, 3 requests in flight\nall requests finished, database pool closed, exiting" },
          { command: `docker run -d --name withinit --init ${RUN_ENV} orders-api:1.0`, output: "1de83987fe63e9b032da569fc78edb7765fd6a89c89787ca965042ea92cd832a" },
          { command: 'docker exec withinit ps', output: "    PID TTY          TIME CMD\n      1 ?        00:00:00 docker-init\n      7 ?        00:00:00 sh\n      8 ?        00:00:00 node\n      9 ?        00:00:00 ps" },
          { command: 'docker stop withinit', output: "withinit" },
          { command: "docker ps -a --format '{{.Names}}: {{.Status}}'", output: "withinit: Exited (143) Less than a second ago\nexecform: Exited (0) Less than a second ago\nshellform: Exited (137) 2 seconds ago" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr14-ex-exec', title: '讓 docker stop 在幾秒內以 0 結束', machine: 'dkr14-dawn',
        statement: 'dawn-01 的 `~/orders/Dockerfile` 最後一行是 Shell 形式的 `CMD node server.js`，所以每次 `docker stop` 都要等 10 秒，最後以 137 結束，server.js 的 SIGTERM 處理從來沒有執行。請把這一行改成 exec 形式（JSON 陣列）`CMD ["node", "server.js"]`，其他內容不變，建置成 `orders-api:1.1`；接著以環境變數 `DATABASE_URL=postgres://orders:lesson-demo-pw@db.internal:5432/orders` 在背景執行名為 `orders` 的容器，最後用 `docker stop` 停止它，讓它優雅地結束（結束碼 0）。',
        checks: [
          { kind: 'image', name: 'orders-api:1.1', cmd: ['node', 'server.js'] },
          { kind: 'container', name: 'orders', image: 'orders-api:1.1', state: 'exited', exitCode: 0 },
        ],
        solution: [
          'cd orders',
          'sed -i \'s/^CMD node server.js$/CMD ["node", "server.js"]/\' Dockerfile',
          'docker build -t orders-api:1.1 .',
          `docker run -d --name orders ${RUN_ENV} orders-api:1.1`,
          'docker stop orders',
        ],
        mistakes: [
          { commands: ['cd orders', 'docker build -t orders-api:1.1 .', `docker run -d --name orders ${RUN_ENV} orders-api:1.1`, 'docker stop orders'], why: 'Dockerfile 沒有改：PID 1 仍是 /bin/sh -c，它不轉送 SIGTERM，10 秒後被 SIGKILL，結束碼 137' },
          { commands: ['cd orders', 'docker build -t orders-api:1.1 .', `docker run -d --name orders --init ${RUN_ENV} orders-api:1.1`, 'docker stop orders'], why: '只加了 --init：docker-init 把 SIGTERM 轉給 sh，sh 因此結束（143），node 的處理函式沒有執行；Image 的 CMD 也仍是 Shell 形式' },
          { commands: ['cd orders', 'docker build -t orders-api:1.1 .', `docker run -d --name orders ${RUN_ENV} orders-api:1.1 node server.js`, 'docker stop orders'], why: '只在 docker run 時覆寫成 exec 形式，這次停得很漂亮，但 Image 的 CMD 還是 Shell 形式，下一個照常 docker run 的人又會遇到 137' },
          { commands: ['cd orders', 'sed -i \'s/^CMD node server.js$/CMD ["node", "server.js"]/\' Dockerfile', 'docker build -t orders-api:1.1 .', 'docker run -d --name orders orders-api:1.1', 'docker stop orders'], why: '忘了傳 DATABASE_URL：程式一啟動就印出 DATABASE_URL is not set 並以 1 結束，根本沒有機會優雅地關閉' },
        ],
        hints: [
          '`tail -n 1 Dockerfile` 看最後一行；`docker exec 容器 ps` 可以確認 PID 1 是 sh 還是 node。',
          '`sed -i \'s/^CMD node server.js$/CMD ["node", "server.js"]/\' Dockerfile` 把那一行換成 exec 形式。',
          '`docker build -t orders-api:1.1 .`，再 `docker run -d --name orders -e DATABASE_URL=… orders-api:1.1`。',
          '`docker stop orders` 之後用 `docker ps -a` 確認是 `Exited (0)`，`docker logs orders` 看得到收尾的兩行。',
        ],
        explanation: 'Shell 形式的 `CMD node server.js` 會變成 `/bin/sh -c "node server.js"`，PID 1 是 sh；docker stop 的 SIGTERM 只送給 PID 1，sh 不轉送，node 收不到，寬限期 10 秒一到就被 SIGKILL（137）。改成 exec 形式 `CMD ["node", "server.js"]` 之後 node 自己就是 PID 1，它註冊了 SIGTERM 的處理函式：停止接受新連線、做完手上的 3 個請求、關閉連線池，2 秒後以 0 結束。`--init` 只是讓 docker-init 當 PID 1 並轉送訊號，底下仍是 sh 時收到訊號的是 sh（143）；只在 docker run 覆寫指令則沒有修好 Image 本身。Shell 形式寫成 `CMD exec node server.js` 在原理上也行，但這題要求的是 exec 形式，也是建議的寫法。',
      },
      {
        id: 'dkr14-ex-prod', title: '以健康檢查、資源上限與重新啟動策略執行 API', machine: 'dkr14-ready',
        statement: 'CI 已經在 dawn-01 建置好 `orders-api:1.1`（exec 形式的 CMD，但 Image 沒有 HEALTHCHECK）。請在背景執行名為 `orders` 的正式容器：主機的 8080 埠對應容器的 3000 埠；`DATABASE_URL=postgres://orders:lesson-demo-pw@db.internal:5432/orders`；記憶體上限 256MiB（`256m`）、CPU 上限 0.5 顆；重新啟動策略 `unless-stopped`；用 `docker run` 的旗標加上健康檢查：每 5 秒在容器裡以 `curl -fsS http://localhost:3000/health || exit 1` 探測，逾時 3 秒，連續失敗 3 次算不健康。最後等到它的健康狀態是 healthy。',
        checks: [
          { kind: 'container', name: 'orders', image: 'orders-api:1.1', state: 'running', port: '8080:3000', health: 'healthy', memory: 256 * MIB, cpus: 0.5, restartPolicy: 'unless-stopped' },
          { kind: 'http', url: 'http://localhost:8080/health', status: 200 },
        ],
        solution: [
          `docker run -d --name orders -p 8080:3000 ${RUN_ENV} -m 256m --cpus 0.5 --restart unless-stopped --health-cmd "curl -fsS http://localhost:3000/health || exit 1" --health-interval 5s --health-timeout 3s --health-retries 3 orders-api:1.1`,
          'sleep 6',
          "docker ps --format '{{.Names}}: {{.Status}}'",
        ],
        mistakes: [
          {
            commands: [`docker run -d --name orders -p 8080:3000 ${RUN_ENV} -m 256m --cpus 0.5 --restart unless-stopped --health-cmd "curl -fsS http://localhost:3000/health || exit 1" --health-interval 5s --health-timeout 3s --health-retries 3 orders-api:1.1`, 'docker ps'],
            why: '沒有等第一次探測：剛啟動時是 (health: starting)，要過一個 interval（5 秒）才會變成 healthy',
          },
          {
            commands: [`docker run -d --name orders -p 8080:3000 ${RUN_ENV} -m 256m --cpus 0.5 --restart always --health-cmd "curl -fsS http://localhost:3000/health || exit 1" --health-interval 5s --health-timeout 3s --health-retries 3 orders-api:1.1`, 'sleep 6'],
            why: '策略是 always 而不是 unless-stopped：手動停掉的容器在 Docker daemon 重新啟動後也會被叫起來',
          },
          {
            commands: [`docker run -d --name orders -p 8080:3000 ${RUN_ENV} -m 256m --cpus 0.5 --restart unless-stopped --health-cmd "curl -fsS http://localhost:8080/health || exit 1" --health-interval 5s --health-timeout 3s --health-retries 3 orders-api:1.1`, 'sleep 20'],
            why: '健康檢查在容器裡執行，容器裡沒有人在 8080 監聽（那是主機的埠）：每次探測都失敗，3 次後是 unhealthy',
          },
          {
            commands: [`docker run -d --name orders -p 8080:3000 ${RUN_ENV} -m 128m --cpus 0.5 --restart unless-stopped --health-cmd "curl -fsS http://localhost:3000/health || exit 1" --health-interval 5s --health-timeout 3s --health-retries 3 orders-api:1.1`, 'sleep 30'],
            why: '記憶體上限只有 128MiB：用量在 24 秒時越過上限被 OOM 結束，unless-stopped 讓它重新啟動（RestartCount 變成 1），之後每過約 24 秒又會被結束一次，正在處理的請求跟著中斷',
          },
          {
            commands: [`docker run -d --name orders ${RUN_ENV} -m 256m --cpus 0.5 --restart unless-stopped --health-cmd "curl -fsS http://localhost:3000/health || exit 1" --health-interval 5s --health-timeout 3s --health-retries 3 orders-api:1.1`, 'sleep 6'],
            why: '忘了 -p 8080:3000：容器是健康的，但主機的 8080 埠連不到它',
          },
        ],
        hints: [
          '健康檢查的旗標：`--health-cmd "…"`、`--health-interval 5s`、`--health-timeout 3s`、`--health-retries 3`。',
          '資源與策略：`-m 256m --cpus 0.5 --restart unless-stopped`；別忘了 `-p 8080:3000` 與 `-e DATABASE_URL=…`。',
          '探測在容器裡執行，網址用容器自己的 localhost 與容器埠 3000。',
          '第一次探測在啟動 5 秒後：`sleep 6` 再用 `docker ps` 看是不是 `(healthy)`。',
        ],
        explanation: '`--health-cmd` 與 `--health-interval`、`--health-timeout`、`--health-retries` 在執行時替沒有 HEALTHCHECK 的 Image 加上健康檢查；探測在容器裡執行，所以要連容器自己的 localhost:3000，連 8080 會一直失敗。第一次探測在啟動後一個 interval，所以要等 5 秒以上才會從 (health: starting) 變成 (healthy)。`-m 256m` 對這個穩定在約 200MiB 的服務留了餘裕，128m 會在 24 秒時被 OOM 結束；`--cpus 0.5` 讓它最多用半顆 CPU，超過只會被節流。長期執行的服務用 unless-stopped：程式當掉或被 OOM 結束會重新啟動，被人刻意停止的則在 daemon 重新啟動後維持停止；always 會把它叫回來。',
      },
      {
        id: 'dkr14-ex-size', title: '依量測的用量設定記憶體上限', machine: 'dkr14-sizing',
        statement: 'dawn-01 上的 `orders` 容器 20 秒前才啟動，目前沒有記憶體上限。這個服務啟動後記憶體會增長約一分鐘才穩定下來。團隊的規則是：記憶體上限取「穩定時的用量 × 1.5」，再無條件進位到 64MiB 的倍數。請先用 `docker stats` 觀察到它的用量穩定，依規則算出上限，在不刪除容器的情況下套用到 `orders`（例如 `docker update`），並確認之後它一直在執行、沒有被 OOM 結束。',
        checks: [
          { kind: 'container', name: 'orders', state: 'running', oomKilled: false, memory: 320 * MIB },
        ],
        solution: [
          'docker stats --no-stream orders',
          'sleep 30',
          'docker stats --no-stream orders',
          'sleep 60',
          'docker stats --no-stream orders',
          'docker update -m 320m orders',
          'sleep 60',
          "docker ps --format '{{.Names}}: {{.Status}}'",
        ],
        mistakes: [
          { commands: ['docker stats --no-stream orders', 'docker update -m 192m orders', 'sleep 60'], why: '用剛啟動時的 120MiB 算出 192MiB：用量繼續增長，在越過 192MiB 時被 OOM 結束（137）' },
          { commands: ['docker stats --no-stream orders', 'sleep 90', 'docker stats --no-stream orders', 'docker update -m 2g orders'], why: '上限 2g 遠超過需要，等於沒有保護主機上的其他服務，也不符合團隊的規則（200MiB × 1.5 進位是 320MiB）' },
          { commands: ['docker stats --no-stream orders', 'sleep 90', 'docker stats --no-stream orders', 'docker update -m 320 orders'], why: '`-m 320` 沒有單位是 320 位元組，低於 Docker 允許的最小值 6MB，被 daemon 拒絕，上限沒有改變' },
          { commands: ['sleep 90', 'docker stats --no-stream orders', 'docker update --cpus 0.5 orders'], why: '量到了用量，卻設定了 CPU 上限，記憶體仍然沒有上限' },
        ],
        hints: [
          '`docker stats --no-stream orders` 的 MEM USAGE 是當下的用量；隔一段時間（例如 `sleep 30`）再看一次，直到數字不再變化。',
          '穩定在 200MiB 時：200 × 1.5 = 300MiB，進位到 64MiB 的倍數是 320MiB。',
          '`docker update -m 320m orders` 立刻套用到執行中的容器；記得加單位 m。',
          '套用後 `sleep 60` 再看 `docker ps`，或 `docker inspect -f \'{{.State.OOMKilled}}\' orders`。',
        ],
        explanation: '這個服務從 80MiB 起每秒增加約 2MiB，在啟動一分鐘後穩定在 200MiB；20 秒時看到的 120MiB 不是它真正需要的量。依規則 200 × 1.5 = 300MiB，進位到 64MiB 的倍數是 320MiB（335544320 位元組）；`docker update -m 320m orders` 立刻套用，不必重建容器，之後 MEM % 約 62.5%，留有餘裕。用剛啟動時的數字算出 192MiB，容器會在用量越過時被 OOM 結束；2g 則大到失去意義；`-m 320` 少了單位只有 320 位元組，被 daemon 以最小值 6MB 拒絕；`--cpus` 限制的是 CPU，不是記憶體。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr14-q1', prompt: '一個以 `--restart always` 執行、有 HEALTHCHECK 的容器，`docker ps` 顯示 `Up 2 minutes (unhealthy)`。單獨執行的 Docker（沒有 Swarm、Compose 或 Kubernetes）接下來會怎麼做？',
      options: ['立刻送 SIGTERM 並重新啟動它，因為 always 也涵蓋不健康的情形', '只回報不健康的狀態，容器繼續執行，`RestartCount` 不變', '等它連續不健康 retries 次之後刪除容器', '停止它並把狀態改成 `Exited (1)`，等人手動啟動'],
      answer: 1,
      explanation: '重新啟動策略只在主程式結束時才作用，unhealthy 只是顯示在 docker ps、inspect 與 health_status 事件裡的狀態，所以容器照樣執行、RestartCount 不變。always 不涵蓋不健康；Docker 不會因為健康檢查刪除或停止容器，retries 只決定何時標成 unhealthy；要依健康狀態自動處理需要 Swarm、Kubernetes 或另外的監控。',
    },
    {
      id: 'dkr14-q2', prompt: '容器以 `-m 256m` 執行，程式的記憶體持續增長，用量越過了 256MiB（主機沒有 swap）。最可能看到什麼？',
      options: ['程式被節流而變慢，記憶體用量停在上限，但容器繼續執行', '容器開始使用主機的磁碟當作額外的記憶體，不受上限限制', 'Docker 自動把上限放寬成原本的兩倍，並在容器的日誌裡印出警告', '主程式被 OOM killer 結束，`Exited (137)`'],
      answer: 3,
      explanation: '記憶體無法像 CPU 那樣等待，cgroup 滿了核心就以 OOM killer 結束行程，主程式被 SIGKILL 所以是 137，inspect 的 OOMKilled 是 true，events 有 oom 事件。被節流是 CPU 超過配額的行為；沒有 swap 時不會拿磁碟補；Docker 不會自動放寬上限，`--memory-swap` 的兩倍是設定時就決定的總量，不是事後放寬。',
    },
    {
      id: 'dkr14-q3', prompt: '程式平常需要約 1.5 顆 CPU，你以 `--cpus 0.5` 執行它。會發生什麼事？',
      options: ['程式被節流，每個排程週期最多用半顆 CPU 的時間，處理變慢但容器照樣執行', '程式一超過 0.5 顆 CPU 就被結束，結束碼 137', 'docker run 拒絕啟動，因為上限小於程式需要的量', '`--cpus` 只在主機 CPU 不夠分時才作用，平常程式照樣用到 1.5 顆'],
      answer: 0,
      explanation: '`--cpus 0.5` 是 CFS 的配額上限：用完這個週期的時間就要等下一個週期，所以是變慢（延遲變長），不會被結束；docker stats 的 CPU % 會停在 50%。被結束是記憶體超過上限的後果；Docker 不知道程式「需要」多少，不會拒絕啟動；只在搶 CPU 時才作用的是 `--cpu-shares` 這種相對權重，不是 `--cpus`。',
    },
    {
      id: 'dkr14-q4', prompt: 'Dockerfile 最後一行是 `CMD node server.js`，server.js 有處理 SIGTERM。可是每次 `docker stop` 都等了 10 秒，最後是 `Exited (137)`。原因是什麼？',
      options: ['node 處理 SIGTERM 的收尾工作需要超過 10 秒，所以被強制結束', '`docker stop` 預設直接送 SIGKILL，根本不會先送 SIGTERM', 'Shell 形式讓 sh 成為 PID 1，它不把 SIGTERM 轉給 node', '10 秒是健康檢查的間隔，docker stop 要等下一次探測失敗才會停止'],
      answer: 2,
      explanation: 'Shell 形式的 CMD 實際執行 `/bin/sh -c "node server.js"`，SIGTERM 只送給 PID 1 的 sh，它沒有轉送，node 的處理函式從未執行，10 秒的寬限期一到就送 SIGKILL（128+9=137）。改成 exec 形式後同一個程式 2 秒就以 0 結束，所以不是處理太慢；docker stop 先送 SIGTERM（或 STOPSIGNAL）；寬限期與健康檢查的 interval 無關。',
    },
    {
      id: 'dkr14-q5', prompt: '訂單 API 是長期執行的服務：當掉或主機重開機後要自動回來，但維運人員為了維護而 `docker stop` 它時，主機重開機後要維持停止。應該選哪個重新啟動策略？',
      options: ['`no`', '`on-failure:3`', '`unless-stopped`', '`always`'],
      answer: 2,
      explanation: 'unless-stopped 在程式結束時重新啟動，daemon 重新啟動時也會啟動它，唯獨被手動停止過的容器維持停止，正好符合需求。always 連手動停止過的容器也會在 daemon 重新啟動後叫回來；no 從不重新啟動；on-failure:3 只在非 0 結束時重試三次，主機重開機後不會啟動已經被停止的容器。',
    },
    {
      id: 'dkr14-q6', prompt: '`docker ps -a` 顯示某個容器是 `Exited (143) 5 seconds ago`。143 最可能代表什麼？',
      options: ['主程式死於 SIGTERM（128+15），沒有自己處理它', '主程式用量超過記憶體上限，被 OOM killer 結束', '主程式等滿 10 秒的寬限期之後被 SIGKILL 結束', '程式自己呼叫 `process.exit(143)` 表示正常結束'],
      answer: 0,
      explanation: '大於 128 的結束碼通常是 128 加上訊號編號，143 就是死於 SIGTERM（15）：程式沒有處理它而採用預設動作，例如 `--init` 把 SIGTERM 轉給沒有處理函式的程式或 sh。OOM 與寬限期後的 SIGKILL 都是 137（128+9）；有處理 SIGTERM 的程式通常自己以 0 結束，用 143 表示正常結束不合慣例。',
    },
    {
      id: 'dkr14-q7', prompt: '依十二要素應用的原則，下列哪個做法最能讓容器被放心地停止、替換與重新啟動？',
      options: ['把還沒寫進資料庫的訂單暫存在容器的檔案裡，重新啟動後再補寫', '啟動時先花三分鐘預熱快取，收到 SIGTERM 時立刻結束以免拖延部署', '把正式環境的資料庫網址寫死在 Image 裡，避免部署時忘記設定', '啟動要快；SIGTERM 時做完手上的請求再結束；狀態放資料庫'],
      answer: 3,
      explanation: '可拋棄性（Disposability）要求快速啟動與優雅關閉，行程（Processes）要求無狀態、資料放在後端服務，這個選項同時做到。暫存在容器檔案裡違反無狀態，被替換就遺失；三分鐘的啟動與直接結束違反可拋棄性；把設定寫死在 Image 違反「設定放在環境變數」，同一個 Image 無法用在不同環境。',
    },
    {
      id: 'dkr14-q8', prompt: '一個 `--restart always` 的容器，主程式每次一啟動就以 1 結束。過了幾秒，`docker ps`（不加 `-a`）最可能顯示什麼？',
      options: ['`Up Less than a second`，因為 Docker 每次都立刻把它重新啟動了', '`Restarting (1) 1 second ago`，重試間隔越來越長', '`Exited (1) 3 seconds ago`，Docker 試過一次就放棄', '什麼都不列，因為已經停止的容器只有加上 `-a` 才會出現在清單裡'],
      answer: 1,
      explanation: '等待下一次重新啟動的容器狀態是 restarting，`docker ps` 不加 -a 也會列出，STATUS 顯示上一次的結束碼與多久前結束；等待時間從 100 毫秒起每次加倍、最多一分鐘。always 不會放棄，所以不會停在 Exited；它大部分時間在等待而不是執行，看到 Up 的機會很小；restarting 不算停止的容器，所以會被列出。',
    },
  ],
};

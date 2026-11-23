/*
 * DKR13 Debugging Containers (DKR-5, terminal-sim; the blueprint's container-playground activity as terminal content). A
 * terminal lesson on the runtime profile (engine stage E24): an on-call morning on the made-up Docker host harbor-07 (user
 * mei in the docker group) where several containers are broken at once, and one systematic method: docker ps -a (state and
 * exit code), docker logs (--tail, --since, -t), docker inspect (State, ExitCode, Error, OOMKilled, RestartCount, Config.Env,
 * Cmd and Path, HostConfig.RestartPolicy and Memory, with --format templates), fix, verify. Exit codes: 0, 1, 125 (docker
 * run itself), 127 (a command or path that does not exist; the container stays Created with State.Error), 128+n (137
 * SIGKILL, 143 SIGTERM). billing gave up after on-failure:5 because PAYMENT_API_URL is missing (a live --restart always copy
 * shows Restarting (1) … and a growing RestartCount); reports is in an OOM restart loop under -m 256m (OOMKilled true,
 * oom events, back-off up to a minute); 137 from an OOM kill versus docker kill versus a stop timeout (docker events with
 * --since/--until); docker stats --no-stream and docker top while reports climbs to its limit. A second host, harbor-09,
 * has three containers that all ended with 137 overnight; its variants move the OOM kill to another one. What the simulator
 * does not model is said in the text: NET I/O and BLOCK I/O (always 0B), the daemon restarting, exit code 126, the host-wide
 * OOM killer and its kernel log. Hosts, users, images and the payment URL are made up. Every transcript output was produced
 * by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalContainer, TerminalDocker, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'mei', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'mei', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const MIB = 1024 * 1024;
const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\nID=debian\n';
const TOOLS = ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'bash', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'id', 'whoami', 'hostname'];

const NGINX: TerminalImage = {
  name: 'nginx:1.27', size: 192_000_000, created: '2026-11-10 08:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], expose: [80], service: true, layers: 7, pulled: true,
  osRelease: DEBIAN, http: { port: 80, responder: 'edge', accessLog: 'nginx' }, commands: TOOLS, stopSignal: 'SIGQUIT',
  logs: ['/docker-entrypoint.sh: Configuration complete; ready for start up', '[notice] 1#1: start worker processes'],
  memory: { start: 9_437_184 }, pids: 3,
  signals: { QUIT: { seconds: 1, logs: ['[notice] 1#1: gracefully shutting down'], exit: 0 }, TERM: { exit: 0 } },
};
// billing needs PAYMENT_API_URL: without it, it prints the error and exits 1 at once.
const BILLING: TerminalImage = {
  name: 'ops/billing:2.3', size: 231_000_000, created: '2026-11-21 16:40:00', cmd: ['node', 'server.js'], workdir: '/app', env: [PATH_ENV, 'NODE_VERSION=22.11.0', 'NODE_ENV=production'],
  expose: [3000], service: true, layers: 6, pulled: true, registry: false, osRelease: DEBIAN, commands: TOOLS,
  logs: ['billing 2.3 listening on :3000'], needsEnv: ['PAYMENT_API_URL'],
  missingEnv: { output: 'Error: PAYMENT_API_URL is not set\n    at loadConfig (/app/config.js:14:11)', exit: 1 },
  memory: { start: 62_914_560 }, cpu: 1.2, signals: { TERM: { seconds: 1, logs: ['billing: SIGTERM received, draining'], exit: 0 } },
};
// reports builds the monthly report: from 90 MB it grows 25 MB a second up to 310 MB, more than -m 256m allows.
const REPORTS: TerminalImage = {
  name: 'ops/reports:1.8', size: 268_000_000, created: '2026-11-20 11:00:00', cmd: ['python3', 'worker.py'], workdir: '/app', env: [PATH_ENV, 'PYTHON_VERSION=3.12.7'],
  service: true, layers: 5, pulled: true, registry: false, osRelease: DEBIAN, commands: TOOLS,
  logs: ['reports: worker ready, building monthly report'], memory: { start: 90_000_000, growth: 25_000_000, max: 310_000_000 }, cpu: 85, pids: 2,
  signals: { TERM: { seconds: 0, exit: 0 } },
};
// thumbs has no SIGTERM handler (as PID 1 it ignores SIGTERM): docker stop kills it after 10 seconds.
const THUMBS: TerminalImage = {
  name: 'ops/thumbs:3.1', size: 154_000_000, created: '2026-11-18 09:00:00', cmd: ['node', 'thumbs.js'], workdir: '/app', env: [PATH_ENV, 'NODE_VERSION=22.11.0'],
  service: true, layers: 5, pulled: true, registry: false, osRelease: DEBIAN, commands: TOOLS,
  logs: ['thumbs: watching /data/uploads'], memory: { start: 41_943_040 }, signals: {},
};
// etl is a batch job: python3 etl.py exports and exits 0 (version 0.8 had /app/bin/export, which 0.9 no longer has).
const ETL: TerminalImage = {
  name: 'ops/etl:0.9', size: 131_000_000, created: '2026-11-19 14:00:00', cmd: ['python3', 'etl.py'], workdir: '/app', env: [PATH_ENV, 'PYTHON_VERSION=3.12.7'],
  layers: 4, pulled: true, registry: false, osRelease: DEBIAN, commands: TOOLS, files: [{ path: '/app/etl.py', content: '# nightly export\n' }],
  output: 'etl: exported 1284 rows to /data/export.csv\n', exit: 0,
};

const billingLogs = Array.from({ length: 6 }, () => [{ text: 'Error: PAYMENT_API_URL is not set', stream: 2 as const }, { text: '    at loadConfig (/app/config.js:14:11)', stream: 2 as const }]).flat();
const RUNBOOK = `# billing 部署紀錄
- 2026-11-22 09:41 重新部署 ops/billing:2.3（docker rm 舊容器、docker run 新容器）
- 必要設定：PAYMENT_API_URL=http://payments.internal:8080
- 選用設定：LOG_LEVEL=info
- 重新啟動策略：on-failure:5
`;
const HARBOR_DOCKER: TerminalDocker = {
  images: [NGINX, BILLING, REPORTS, THUMBS, ETL],
  containers: [
    { name: 'edge', image: 'nginx:1.27', state: 'running', created: '2026-11-21 18:00:00', started: '2026-11-21 18:00:00', ports: ['8080:80'], restart: 'unless-stopped' },
    { name: 'thumbs', image: 'ops/thumbs:3.1', state: 'exited', created: '2026-11-21 18:01:00', started: '2026-11-21 18:01:00', finished: '2026-11-22 09:40:10', exitCode: 137, restart: 'no' },
    // Redeployed at 09:41 without PAYMENT_API_URL: it failed six times (the first run and five restarts) and on-failure:5 gave up.
    {
      name: 'billing', image: 'ops/billing:2.3', state: 'exited', created: '2026-11-22 09:41:00', started: '2026-11-22 09:41:03', finished: '2026-11-22 09:41:03', exitCode: 1,
      env: ['LOG_LEVEL=info'], restart: 'on-failure:5', restartCount: 5, logs: billingLogs,
    },
    // Started at 09:52 under -m 256m with --restart always: OOM-killed about seven seconds into every run since.
    { name: 'reports', image: 'ops/reports:1.8', state: 'running', created: '2026-11-22 09:52:00', started: '2026-11-22 09:52:00', restart: 'always', memory: '256m' },
  ],
};
const host = (id: string, title: string, hostName: string, now: string, files: TerminalFile[], docker: TerminalDocker): TerminalMachine => ({
  id, title, user: 'mei', host: hostName, cwd: '/home/mei', profile: 'runtime', cpus: 2, memory: { total: 4096 }, now, boot: '2026-11-15 06:00:00',
  files: [dir('/home'), dir('/home/mei', 'mei', 0o750), ...files],
  accounts: { groups: [{ name: 'sudo', members: ['mei'] }, { name: 'docker', gid: 988, members: ['mei'] }] },
  responders: [{ id: 'edge', server: 'nginx/1.27.3', routes: [{ path: '/', body: 'harbor edge\n', type: 'text/html' }] }],
  docker,
});
const HARBOR = host('dkr13-harbor', 'harbor-07（值班的早上：billing 放棄重啟、reports 反覆重啟、thumbs 以 137 結束）', 'harbor-07', '2026-11-22 10:00:00',
  [dir('/home/mei/runbook'), file('/home/mei/runbook/billing.md', RUNBOOK)], HARBOR_DOCKER);

// harbor-09: three containers ended with 137 during the night; only one of them was OOM-killed (the variants move it).
const INDEXER: TerminalImage = {
  name: 'ops/indexer:4.0', size: 246_000_000, created: '2026-11-17 10:00:00', cmd: ['node', 'indexer.js'], workdir: '/app', env: [PATH_ENV, 'NODE_VERSION=22.11.0'],
  service: true, layers: 6, pulled: true, registry: false, osRelease: DEBIAN, commands: TOOLS, logs: ['indexer: rebuilding the search index'], memory: { start: 120_000_000 }, signals: {},
};
const MAILER: TerminalImage = {
  name: 'ops/mailer:1.2', size: 118_000_000, created: '2026-11-16 15:00:00', cmd: ['node', 'mailer.js'], workdir: '/app', env: [PATH_ENV, 'NODE_VERSION=22.11.0'],
  service: true, layers: 5, pulled: true, registry: false, osRelease: DEBIAN, commands: TOOLS, logs: ['mailer: connected to the queue'], memory: { start: 48_000_000 }, signals: {},
};
type NightName = 'indexer' | 'mailer' | 'thumbs';
const nightDocker = (oom: NightName): TerminalDocker => {
  const ended = (name: NightName, image: string, finished: string, memory: string): TerminalContainer => ({
    name, image, state: 'exited', created: '2026-11-21 20:00:00', started: '2026-11-21 20:00:00', finished, exitCode: 137, restart: 'no', memory, ...name === oom ? { oomKilled: true } : {},
  });
  return {
    images: [NGINX, INDEXER, MAILER, THUMBS],
    containers: [
      { name: 'edge', image: 'nginx:1.27', state: 'running', created: '2026-11-21 19:00:00', started: '2026-11-21 19:00:00', ports: ['8080:80'], restart: 'unless-stopped' },
      ended('indexer', 'ops/indexer:4.0', '2026-11-22 03:12:44', '512m'), ended('mailer', 'ops/mailer:1.2', '2026-11-22 06:30:02', '128m'),
      ended('thumbs', 'ops/thumbs:3.1', '2026-11-22 07:45:10', '1g'),
    ],
  };
};
const NIGHT = host('dkr13-night', 'harbor-09（夜班之後：indexer、mailer、thumbs 都以 137 結束）', 'harbor-09', '2026-11-22 08:10:00', [], nightDocker('indexer'));

export const DKR13: LessonContent = {
  lessonId: 'DKR13',
  motivation: '早上九點五十分，值班的 mei 收到三則告警：帳務服務 billing 從 09:41 的部署之後就沒有回應、報表服務 reports 的監控圖一直斷斷續續、縮圖服務 thumbs 停了。打開 harbor-07，`docker ps` 只列出兩個容器，其中一個寫著 `Restarting (137)`，另外兩個根本不在清單上。這種早上最容易犯的錯，是看到容器停了就 `docker restart`、看到 137 就怪程式寫壞了、看到記憶體不夠就隨手改個數字——問題被蓋住一陣子，然後在更糟的時間點回來。容器停止或反覆重啟時，Docker 其實已經把原因記下來了：結束碼記在 `docker ps -a` 與 `State.ExitCode`，程式最後說的話在 `docker logs`，是不是被記憶體上限殺掉記在 `State.OOMKilled`，重新啟動了幾次記在 `RestartCount`，每一次啟動與結束的時間點記在 `docker events`。這堂課用 harbor-07 的一個早上，練習一套固定的步驟：先用 `docker ps -a` 看狀態與結束碼，再用 `docker logs` 看程式說了什麼，再用 `docker inspect` 核對設定與 State，找到原因才修，修完再驗證。學完之後，你能從結束碼判斷容器為什麼停止，用 logs 與 inspect 找出缺少的環境變數或寫錯的指令路徑，並分辨「程式當掉的重啟迴圈」與「記憶體不足造成的重啟」，知道各自該怎麼修。',
  sections: [
    {
      id: 'dkr13-s-method', title: '值班的步驟：狀態 → 日誌 → 設定 → 修正 → 驗證',
      blocks: [
        { type: 'p', text: '除錯最怕的是一開始就動手改。容器出問題時，先照固定的順序收集證據，每一步回答一個問題，確定原因之後才修，修完再用同樣的指令確認結果。這套步驟和 LNX11 讀系統日誌的思路一樣：先縮小範圍（哪個容器、什麼時候），再看細節。' },
        { type: 'table', head: ['步驟', '指令', '回答的問題'], rows: [
          ['1. 狀態', '`docker ps -a`', '哪些容器在執行、哪些停了、停的結束碼是多少、是不是 Restarting'],
          ['2. 日誌', '`docker logs --tail 20 容器`、`--since 10m`、`-t`', '程式結束前最後印了什麼（錯誤訊息常常直接說出原因）'],
          ['3. 設定與 State', '`docker inspect 容器`、`-f \'{{.State.OOMKilled}}\'`', 'ExitCode、Error、OOMKilled、RestartCount、環境變數、指令、重新啟動策略、記憶體上限'],
          ['4. 時間線', '`docker events --since … --until …`', '什麼時候啟動、被誰送了什麼訊號、是不是 oom、重啟了幾次'],
          ['5. 現況', '`docker stats --no-stream`、`docker top 容器`', '執行中的容器現在用多少記憶體與 CPU、裡面跑著哪些行程'],
          ['6. 修正與驗證', '`docker rm` + `docker run`、`docker update`，再回到步驟 1', '原因消失了嗎？過一段時間後還在執行、RestartCount 不再增加嗎？'],
        ] },
        { type: 'p', text: '第一步一定要加 `-a`。`docker ps` 只列出執行中（以及等待重新啟動）的容器，已經停止的容器不會出現；billing 在 on-failure:5 用完五次重新啟動之後停在 Exited，`docker ps` 完全看不到它，`docker ps -a` 的 STATUS 才寫著 `Exited (1) 18 minutes ago`。`--format` 可以只留下需要的欄位，`--filter status=exited`、`status=restarting` 可以只看某一種狀態。' },
        { type: 'example', id: 'dkr13-triage' },
        { type: 'callout', tone: 'warning', title: '只看 docker ps 不夠', text: '`docker ps` 看不到已經停止的容器，就算加了 `-a`，STATUS 也只告訴你「停了、結束碼是多少、多久以前」，不會告訴你為什麼。同樣是 `Exited (137)`，可能是記憶體不足被核心殺掉，也可能是有人 `docker kill`，或是 `docker stop` 等了十秒之後強制結束；同樣是 `Exited (1)`，可能是少了環境變數，也可能是連不上資料庫。只看 ps 就決定「重啟看看」，等於沒有診斷。結束碼是線索的開頭，原因要從 logs、inspect 與 events 確認。' },
      ],
    },
    {
      id: 'dkr13-s-exit', title: '讀懂結束碼：0、1、125–127 與 128＋N',
      blocks: [
        { type: 'p', text: '容器的結束碼就是它的主程式（PID 1）的結束碼，規則和 LNX08 在 Shell 用 `$?` 讀到的一樣：0 是成功，1 到 125 多半是程式自己決定的錯誤。Docker 另外保留了 125、126、127，用來表示問題出在「容器根本沒有把程式跑起來」；而 128 以上通常表示程式是被訊號結束的，128 加上訊號編號。' },
        { type: 'table', head: ['結束碼', '意義', '常見原因與下一步'], rows: [
          ['0', '主程式正常結束', '一次性的工作（備份、匯出）做完了；如果它應該是常駐服務，表示它「以為自己做完了」，查 CMD 是否正確'],
          ['1（或其他 1–124）', '程式自己回報錯誤', '缺少設定、連不上資料庫、程式例外；看 `docker logs` 最後幾行'],
          ['125', '`docker run` 本身失敗（Docker 的錯誤）', '選項寫錯（`-m abc`）、記憶體上限太小、名稱衝突；容器沒有被建立或沒有啟動，訊息直接印在你的終端機'],
          ['126', '指令找到了但不能執行', '檔案沒有執行權限、不是可執行的格式；本課的模擬環境不模擬這一種，只在這裡說明'],
          ['127', '指令或路徑不存在', 'CMD／ENTRYPOINT 寫錯路徑（`stat /app/bin/export: no such file or directory`）或名稱不在 PATH（`executable file not found in $PATH`）；容器停在 Created，原因記在 `State.Error`'],
          ['130', '128＋2：SIGINT', '在前景執行時按了 Ctrl+C'],
          ['137', '128＋9：SIGKILL', '記憶體不足被 OOM killer 結束、`docker kill`、或 `docker stop` 等待逾時後強制結束；要用 OOMKilled 與 events 分辨'],
          ['143', '128＋15：SIGTERM', '程式收到 SIGTERM 後依預設動作結束（沒有自己處理）；有處理 SIGTERM 的程式通常會自己以 0 結束'],
        ] },
        { type: 'p', text: '127 的兩種訊息要分清楚。主程式寫成路徑（含有 `/`）時，runc 去找那個檔案，找不到就是 `stat /app/bin/export: no such file or directory`，常見於 README 還寫著舊版本的路徑、或 Dockerfile 的 COPY 沒有把檔案放到 ENTRYPOINT 指的位置；只寫名稱時，它在 PATH 裡找，找不到就是 `executable file not found in $PATH`，常見於 Image 裡只有 `python3` 卻打了 `python`。這類錯誤發生在啟動那一刻，`docker run` 直接把錯誤印出來並以 127 結束，容器建立了但從來沒有執行，`docker ps -a` 顯示 Created。對照 `docker image inspect -f \'{{.Config.Cmd}}\'` 看 Image 原本的指令，通常就知道哪裡寫錯了。' },
        { type: 'example', id: 'dkr13-exit' },
        { type: 'callout', tone: 'note', title: 'docker run 的結束碼就是容器的', text: '不加 `-d` 執行時，`docker run` 會等容器結束，並以容器的結束碼結束，所以 `echo $?` 直接讀得到；加了 `-d` 時 `docker run` 印出容器 ID 就以 0 結束，容器之後的結束碼要用 `docker ps -a`、`docker inspect -f \'{{.State.ExitCode}}\'` 或 `docker wait` 讀取。125 是例外：那時錯誤在 Docker 這一層，容器的程式根本沒有機會執行。' },
      ],
    },
    {
      id: 'dkr13-s-config', title: '用 docker logs 與 docker inspect 找出設定錯誤',
      blocks: [
        { type: 'p', text: '`docker logs` 印出主程式寫到標準輸出與標準錯誤的內容。`--tail N`（或 `-n N`）只看最後 N 行；`--since 10m` 只看最近十分鐘，也可以寫成 `--since 2026-11-22T09:40:00Z` 這樣的絕對時間，`--until` 是結束點；`-t` 在每行前面加上時間。容器每次重新啟動，日誌是接著寫的，所以反覆重啟的容器會看到同一段啟動訊息或錯誤重複很多次——數一數重複幾次，也是在數它跑了幾次。' },
        { type: 'p', text: '`docker inspect` 印出容器完整的 JSON，`-f`（`--format`）用 Go template 只取出需要的欄位。除錯時最常用的欄位如下；寫成一行 template，就能一次回答「為什麼停、停了幾次、設定是什麼」。' },
        { type: 'table', head: ['欄位', 'template', '用途'], rows: [
          ['狀態', '`{{.State.Status}}`', 'created、running、restarting、exited'],
          ['結束碼', '`{{.State.ExitCode}}`', '最後一次執行的結束碼'],
          ['啟動錯誤', '`{{.State.Error}}`', '127 這類「沒有跑起來」的原因（Created 的容器）'],
          ['被 OOM 結束', '`{{.State.OOMKilled}}`', '最後一次執行是否因為超過記憶體上限被核心結束'],
          ['時間', '`{{.State.StartedAt}}`、`{{.State.FinishedAt}}`', '最後一次啟動與結束的時間（相減就是它跑了多久）'],
          ['重新啟動次數', '`{{.RestartCount}}`', 'Docker 依重新啟動策略自動重啟了幾次'],
          ['環境變數', '`{{range .Config.Env}}{{println .}}{{end}}`', '容器實際拿到的變數（`-e` 加上 Image 的 ENV）'],
          ['指令', '`{{.Path}} {{.Args}}`、`{{.Config.Cmd}}`', '實際執行的主程式與參數'],
          ['策略與上限', '`{{.HostConfig.RestartPolicy.Name}}`、`{{.HostConfig.Memory}}`', '重新啟動策略、記憶體上限（位元組，0 是沒有上限）'],
        ] },
        { type: 'p', text: 'template 也能做判斷：`{{if .State.OOMKilled}}OOM{{else}}not OOM{{end}}`；`{{json .State}}` 把整個 State 印成一行 JSON。配合 `$(docker ps -aq)` 一次檢查所有容器，例如 `docker inspect -f \'{{.Name}} {{.State.ExitCode}} {{.State.OOMKilled}}\' $(docker ps -aq)`，就是一張「所有容器為什麼停」的表。' },
        { type: 'p', text: '回到 billing。它的日誌六次都是 `Error: PAYMENT_API_URL is not set`；inspect 顯示 ExitCode 1、RestartCount 5、策略是 on-failure:5，環境變數只有 `LOG_LEVEL=info` 與 Image 自己的 ENV，沒有 PAYMENT_API_URL。部署紀錄寫著它是必要設定——09:41 重新部署時，`docker run` 少打了一個 `-e`。容器的環境變數在建立時就決定了，不能對既有的容器修改，所以修法是 `docker rm billing`，再用完整的 `-e` 與原本的 `--restart on-failure:5` 重新 `docker run`。' },
        { type: 'example', id: 'dkr13-env' },
        { type: 'callout', tone: 'note', title: 'inspect 看得到所有環境變數', text: '`docker inspect` 會原封不動地印出 `Config.Env`，包含密碼與 Token。docker 群組的成員都能執行它（DKR02：docker 群組等於 root），所以真正的密碼不要放在環境變數裡給不該看的人看到，把 inspect 的輸出貼到聊天室或工單之前也要先遮掉。本課的變數都是虛構的內部網址。' },
      ],
    },
    {
      id: 'dkr13-s-restart', title: '重啟迴圈：Restarting (1) 與 RestartCount',
      blocks: [
        { type: 'p', text: '有重新啟動策略（`--restart`，DKR09 的 Compose 是 `restart:`）的容器結束時，Docker 會依策略決定要不要再啟動它：`always` 一律重新啟動；`unless-stopped` 除非是被手動停止的；`on-failure[:N]` 只在結束碼不是 0 時重新啟動，最多 N 次。每次重新啟動之前會等待一段時間：從 100 毫秒開始，每次加倍，最多一分鐘；如果這一次已經執行了 10 秒以上，等待時間回到 100 毫秒。等待中的容器 `docker ps` 顯示 `Restarting (1) 2 seconds ago`——括號裡是上一次的結束碼，後面是它結束了多久——`State.Status` 是 restarting，`RestartCount` 每重新啟動一次加一。' },
        { type: 'table', head: ['看到的現象', '代表什麼', '下一步'], rows: [
          ['`Restarting (1) …`，RestartCount 一直增加', '程式一啟動就失敗，策略讓它一直重來（重啟迴圈）', '`docker logs --tail` 看錯誤；修正設定後重建容器'],
          ['`Restarting (137) …`，OOMKilled 是 true', '每次都在記憶體越過上限時被核心結束', '看 `docker stats` 的用量與 `HostConfig.Memory`，決定提高上限或修正記憶體洩漏'],
          ['`Exited (1)`、RestartCount 等於 N、策略 on-failure:N', '重新啟動 N 次之後放棄了', '和重啟迴圈同樣處理；它已經不在 `docker ps` 裡'],
          ['`docker exec` 回答 `is restarting, wait until the container is running`', '容器在兩次執行之間，沒有行程可以進入', '不要等 exec，改看 logs 與 inspect'],
          ['`Up 3 seconds`、`Up 5 seconds` 反覆出現', '每次都跑一陣子才結束（例如跑了十幾秒才當掉）', '`docker logs -t` 看每次的時間點，`docker events` 看 die 的頻率'],
        ] },
        { type: 'p', text: '重新啟動策略只是讓服務在偶發的錯誤後自己回來，它不會修好任何東西。billing 缺環境變數，重新啟動一百次也是一百次同樣的錯誤；用 `docker restart` 或 `docker start` 也一樣，只是把計數歸零、再跑一輪。兩件事只在課文說明、模擬環境不重現：Docker daemon 本身重新啟動（例如 `systemctl restart docker`）之後，always 的容器會被啟動，而 unless-stopped 且之前被手動停止的不會，這正是兩者的差別；健康檢查回報 unhealthy 的容器，Docker 本身不會重新啟動它，只回報狀態（DKR14 會再談健康檢查）。' },
        { type: 'callout', tone: 'warning', title: '重啟不是修復', text: '看到容器停了就 `docker restart`，是最常見也最危險的「修法」。如果原因是缺少環境變數、指令路徑錯誤或記憶體上限太低，重新啟動只會得到同樣的結束碼，而且會把 RestartCount 歸零、把錯誤訊息淹沒在更多重複的日誌裡，讓下一個值班的人更難判斷。先讀 logs 與 inspect，確定原因並修正設定，再重建或重新啟動。' },
      ],
    },
    {
      id: 'dkr13-s-oom', title: 'OOMKilled：辨認記憶體不足造成的重啟',
      blocks: [
        { type: 'p', text: '`docker run -m 256m`（`--memory`）透過 cgroup 替容器設定記憶體上限。容器裡的行程用量越過上限時，核心的 OOM killer 會以 SIGKILL 結束它：結束碼是 137，`State.OOMKilled` 是 true，`docker events` 先記一筆 `oom` 再記 `die`。SIGKILL 無法被攔截，程式來不及印出任何錯誤，所以 OOM 的日誌常常「什麼也沒說」，最後一行就是正常工作時的訊息——這正是很多人以為「程式自己掛了」的原因。主機沒有 swap 時，越過 `-m` 就會被結束；主機有 swap 時上限是 `--memory-swap`（沒有寫時是 `-m` 的兩倍）。' },
        { type: 'p', text: 'reports 在 09:52 以 `-m 256m --restart always` 啟動，產生月報時用量從 90MB 開始每秒增加約 25MB、最多到 310MB，大約七秒就越過 256MiB。每一次都被結束、等待、再啟動；因為每次都不到 10 秒，等待時間一路加倍到一分鐘，所以 `docker ps` 大部分時間看到的是 `Restarting (137) 30 seconds ago`。同樣是 137，要靠下面這張表分辨原因：' },
        { type: 'table', head: ['137 的來源', 'OOMKilled', 'docker events 的線索', '修法'], rows: [
          ['記憶體越過 `-m` 上限', 'true', '`oom` 緊接著 `die`（exitCode=137）', '提高上限、或修正程式的記憶體用量'],
          ['`docker kill`（預設 SIGKILL）', 'false', '`kill`（signal=9）緊接著 `die`', '問清楚是誰、為什麼手動結束'],
          ['`docker stop` 逾時', 'false', '`kill`（signal=15），約 10 秒後 `kill`（signal=9）、`die`、`stop`', '讓程式處理 SIGTERM（exec 形式、`--init`），DKR14 詳談'],
        ] },
        { type: 'p', text: '`docker stop` 先送 SIGTERM，等最多 10 秒（`-t` 可以改），程式還沒結束就送 SIGKILL。PID 1 沒有處理 SIGTERM 時，核心不會對 PID 1 套用預設動作，訊號等於被忽略，於是每次 stop 都等滿十秒、以 137 結束；Shell 形式的 CMD 讓 `/bin/sh -c` 當 PID 1，它不轉送 SIGTERM，也是同樣的結果。真實主機上有些 Shell 會在只有一個簡單指令時直接 exec 它，症狀不一定出現，所以更不能依賴這個巧合。thumbs 在 09:40 的部署中被 stop，就是這種 137；它沒有記憶體上限（`HostConfig.Memory` 是 0），OOMKilled 是 false。另外，主機整體記憶體不足時，核心也可能結束沒有上限的容器裡的行程，那時要到主機的核心日誌（LNX11 的 Out of memory 訊息）找證據；模擬環境不模擬這種情形。' },
        { type: 'example', id: 'dkr13-137' },
        { type: 'p', text: '確定是 OOM 之後，修法有兩種，要先判斷是哪一種情況。如果程式的用量會停在某個高點（reports 產生月報最多用到約 310MB），就是上限設得太低：把上限提高到高點之上並留一些餘裕，例如 512m。執行中或等待重啟中的容器可以用 `docker update -m 512m reports` 直接修改上限，設定立刻生效，再用 `docker restart reports` 讓它馬上以新上限重新開始（否則要等下一次重啟的時間到）；也可以 `docker rm -f` 之後用新的 `-m` 重新 `docker run`，但要記得帶上原本的 `--restart` 等選項。容器原本有設定 `--memory-swap` 時，`-m` 不能大於它，要一起修改，否則會得到 `Memory limit should be smaller than already set memoryswap limit`。上限的單位要寫清楚：`-m 512` 是 512 位元組，Docker 會以 `Minimum memory limit allowed is 6MB` 拒絕。' },
        { type: 'p', text: '如果用量沒有上限地一直增加（記憶體洩漏），提高上限只是延後被殺的時間，真正要修的是程式；這時先維持一個合理的上限，讓問題以 OOMKilled 的形式清楚地出現，而不是拿掉上限讓它吃光整台主機的記憶體、拖垮其他容器。無論哪一種，都不該把上限調得更低。' },
        { type: 'callout', tone: 'warning', title: '137 不等於程式有 bug', text: '看到 `Exited (137)` 或 `Restarting (137)` 就去翻程式碼找 bug，常常白忙一場：137 只說明行程是被 SIGKILL 結束的，送出 SIGKILL 的可能是 OOM killer、`docker kill` 或 `docker stop` 的逾時，程式本身可能完全正常。先看 `{{.State.OOMKilled}}` 與 `docker events`：OOMKilled 是 true 就是記憶體上限的問題，要比較用量與 `HostConfig.Memory`；是 false 再查是誰送了訊號。反過來，看到 OOM 就把上限調低「限制它」，只會讓它更早被殺。' },
      ],
    },
    {
      id: 'dkr13-s-timeline', title: '重建時間線、觀察現況，然後驗證',
      blocks: [
        { type: 'p', text: '`docker events` 是 daemon 記下的事件流：create、start、die（附 exitCode 與 execDuration，也就是跑了幾秒）、kill（附 signal）、oom、stop、restart、destroy 與健康狀態的變化。真實的 `docker events` 預設會一直等待新的事件；值班時要回顧發生過的事，要用 `--since` 與 `--until` 指定時間範圍（`--since 10m --until 0s` 是最近十分鐘到現在），再用 `--filter container=reports`、`--filter event=oom` 縮小。模擬環境的 `docker events` 一律印到現在就結束，不會等待。把 events、logs 的 `-t` 時間與 `State.FinishedAt` 對起來，就能說出「09:41 部署、09:41:03 第六次失敗後放棄」或「每次啟動約七秒後 oom」這樣的時間線。' },
        { type: 'p', text: '執行中的容器用 `docker stats --no-stream` 看現在的資源用量：CPU %、MEM USAGE / LIMIT（用量與上限）、MEM %、PIDS。真實的 `docker stats` 不加 `--no-stream` 會持續更新畫面，加了才只印一次；NET I/O 與 BLOCK I/O 在模擬環境一律是 `0B / 0B`，不要拿來判斷。`docker top 容器` 以主機的 PID 列出容器裡的行程（`ps -ef` 的欄位），可以確認 PID 1 是誰、有沒有多出不該有的行程。用量接近上限、MEM % 一路往 100% 走，就是 OOM 即將發生的徵兆。' },
        { type: 'example', id: 'dkr13-live' },
        { type: 'p', text: '修正之後一定要驗證，而且要隔一段時間再看一次：重啟迴圈的容器剛啟動時也是 `Up Less than a second`，幾秒後才會再倒下。驗證的清單：' },
        { type: 'list', items: [
          '`docker ps` 顯示 `Up …`，而且過了幾十秒之後仍然是 Up，時間持續增加。',
          '`docker inspect -f \'{{.RestartCount}} {{.State.OOMKilled}}\'` 的 RestartCount 不再增加，OOMKilled 是 false。',
          '`docker logs --since 1m` 看得到正常的啟動訊息，沒有新的錯誤。',
          '`docker inspect` 確認修正真的生效：環境變數在 `Config.Env` 裡、上限在 `HostConfig.Memory` 裡、重新啟動策略沒有在重建時遺漏。',
          '在值班紀錄寫下原因、證據（結束碼、OOMKilled、日誌的那一行）與修法，下次同樣的告警就不必從頭查。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [HARBOR, NIGHT],
    examples: [
      {
        id: 'dkr13-triage', title: '第一步：docker ps 與 docker ps -a', machine: 'dkr13-harbor',
        description: 'docker ps 只看到 edge 與正在等待重新啟動的 reports；加上 -a 才看到停止的 billing 與 thumbs 和它們的結束碼。用 --format 與 --filter 整理成一張表。',
        steps: [
          { command: "docker ps", output: "CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS                            PORTS                                     NAMES\n9128eaee18fd   ops/reports:1.8   \"python3 worker.py\"      8 minutes ago   Restarting (137) 30 seconds ago                                             reports\nd55d273aa4b3   nginx:1.27        \"/docker-entrypoint.…\"   16 hours ago    Up 16 hours                       0.0.0.0:8080->80/tcp, [::]:8080->80/tcp   edge" },
          { command: "docker ps -a", output: "CONTAINER ID   IMAGE             COMMAND                  CREATED          STATUS                            PORTS                                     NAMES\n9128eaee18fd   ops/reports:1.8   \"python3 worker.py\"      8 minutes ago    Restarting (137) 30 seconds ago                                             reports\nc2da99b41702   ops/billing:2.3   \"node server.js\"         19 minutes ago   Exited (1) 18 minutes ago                                                   billing\n59726372bc92   ops/thumbs:3.1    \"node thumbs.js\"         16 hours ago     Exited (137) 19 minutes ago                                                 thumbs\nd55d273aa4b3   nginx:1.27        \"/docker-entrypoint.…\"   16 hours ago     Up 16 hours                       0.0.0.0:8080->80/tcp, [::]:8080->80/tcp   edge" },
          { command: "docker ps -a --format 'table {{.Names}}\\t{{.Status}}'", output: "NAMES     STATUS\nreports   Restarting (137) 30 seconds ago\nbilling   Exited (1) 18 minutes ago\nthumbs    Exited (137) 19 minutes ago\nedge      Up 16 hours" },
          { command: "docker ps -a --filter status=exited --format '{{.Names}}: {{.Status}}'", output: "billing: Exited (1) 18 minutes ago\nthumbs: Exited (137) 19 minutes ago" },
          { command: "docker ps --filter status=restarting --format '{{.Names}}: {{.Status}}'", output: "reports: Restarting (137) 30 seconds ago" },
        ],
      },
      {
        id: 'dkr13-exit', title: '結束碼 0、125、127 與 State.Error', machine: 'dkr13-harbor',
        description: '照 0.9 版的 CMD 執行得到 0；照舊 README 的路徑 /app/bin/export 與打成 python 都是 127，容器停在 Created；-m 512 是 docker run 自己的錯誤 125。',
        steps: [
          { command: "docker run --name etl ops/etl:0.9", output: "etl: exported 1284 rows to /data/export.csv" },
          { command: "echo $?", output: "0" },
          { command: "docker run --name etl-old ops/etl:0.9 /app/bin/export", output: "docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: \"/app/bin/export\": stat /app/bin/export: no such file or directory: unknown." },
          { command: "echo $?", output: "127" },
          { command: "docker run --name etl-py ops/etl:0.9 python etl.py", output: "docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: \"python\": executable file not found in $PATH: unknown." },
          { command: "echo $?", output: "127" },
          { command: "docker run -m 512 ops/etl:0.9", output: "docker: Error response from daemon: Minimum memory limit allowed is 6MB.\nSee 'docker run --help'." },
          { command: "echo $?", output: "125" },
          { command: "docker ps -a --filter name=etl --format '{{.Names}}: {{.Status}}'", output: "etl-py: Created\netl-old: Created\netl: Exited (0) Less than a second ago" },
          { command: "docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' etl-old", output: "created 127" },
          { command: "docker inspect -f '{{.State.Error}}' etl-old", output: "failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: \"/app/bin/export\": stat /app/bin/export: no such file or directory: unknown" },
          { command: "docker image inspect -f '{{.Config.Cmd}} {{.Config.WorkingDir}}' ops/etl:0.9", output: "[python3 etl.py] /app" },
        ],
      },
      {
        id: 'dkr13-env', title: 'billing：日誌、inspect 與一個重啟迴圈', machine: 'dkr13-harbor',
        description: 'billing 的日誌與 inspect 指向缺少的 PAYMENT_API_URL；用 --restart always 另外跑一個沒有這個變數的副本，看它進入重啟迴圈（Restarting (1)、RestartCount 增加、exec 進不去）。',
        steps: [
          { command: "docker logs --tail 2 billing", output: "Error: PAYMENT_API_URL is not set\n    at loadConfig (/app/config.js:14:11)" },
          { command: "docker inspect -f '{{.State.ExitCode}} {{.RestartCount}} {{.HostConfig.RestartPolicy.Name}}:{{.HostConfig.RestartPolicy.MaximumRetryCount}}' billing", output: "1 5 on-failure:5" },
          { command: "docker inspect -f '{{.State.StartedAt}} {{.State.FinishedAt}}' billing", output: "2026-11-22T09:41:03Z 2026-11-22T09:41:03Z" },
          { command: "docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' billing", output: "LOG_LEVEL=info\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nNODE_VERSION=22.11.0\nNODE_ENV=production\n" },
          { command: "cat runbook/billing.md", output: "# billing 部署紀錄\n- 2026-11-22 09:41 重新部署 ops/billing:2.3（docker rm 舊容器、docker run 新容器）\n- 必要設定：PAYMENT_API_URL=http://payments.internal:8080\n- 選用設定：LOG_LEVEL=info\n- 重新啟動策略：on-failure:5" },
          { command: "docker run -d --name billing-try --restart always ops/billing:2.3", output: "3a413e1db3d0ebb3a7899d036ffc541fb51c97a7570b180de56ecab09888ebdc" },
          { command: "sleep 5", output: "" },
          { command: "docker ps --filter name=billing-try --format '{{.Names}}: {{.Status}}'", output: "billing-try: Restarting (1) 1 second ago" },
          { command: "docker inspect -f '{{.State.Status}} {{.RestartCount}}' billing-try", output: "restarting 6" },
          { command: "docker exec billing-try env", output: "Error response from daemon: Container 3a413e1db3d0ebb3a7899d036ffc541fb51c97a7570b180de56ecab09888ebdc is restarting, wait until the container is running" },
          { command: "docker logs billing-try 2>&1 | grep -c 'not set'", output: "6" },
          { command: "docker rm -f billing-try", output: "billing-try" },
        ],
      },
      {
        id: 'dkr13-137', title: '三種 137：OOM、docker stop 逾時、docker kill', machine: 'dkr13-harbor',
        description: 'reports 的 OOMKilled 是 true，events 裡每次都有 oom；用 thumbs 的 Image 另外啟動兩個容器，一個 docker stop（不處理 SIGTERM，等滿 10 秒）、一個 docker kill，結束碼都是 137，但 OOMKilled 是 false，events 留下的是 kill 與它的 signal。',
        steps: [
          { command: "docker ps --filter name=reports --format '{{.Names}}: {{.Status}}'", output: "reports: Restarting (137) 30 seconds ago" },
          { command: "docker inspect -f '{{.State.ExitCode}} OOMKilled={{.State.OOMKilled}} restarts={{.RestartCount}} limit={{.HostConfig.Memory}}' reports", output: "137 OOMKilled=true restarts=15 limit=268435456" },
          { command: "docker logs -t --tail 3 reports", output: "2026-11-22T09:57:07.956000000Z reports: worker ready, building monthly report\n2026-11-22T09:58:15.094000000Z reports: worker ready, building monthly report\n2026-11-22T09:59:22.232000000Z reports: worker ready, building monthly report" },
          { command: "docker events --since 3m --until 0s --filter container=reports --filter event=oom", output: "2026-11-22T09:57:15.094000000Z container oom 9128eaee18fd9014a67f385cd7a5d1cb2c8717485e5e7e56a55d72a801e701f4 (image=ops/reports:1.8, name=reports)\n2026-11-22T09:58:22.232000000Z container oom 9128eaee18fd9014a67f385cd7a5d1cb2c8717485e5e7e56a55d72a801e701f4 (image=ops/reports:1.8, name=reports)\n2026-11-22T09:59:29.370000000Z container oom 9128eaee18fd9014a67f385cd7a5d1cb2c8717485e5e7e56a55d72a801e701f4 (image=ops/reports:1.8, name=reports)" },
          { command: "docker inspect -f '{{.State.ExitCode}} OOMKilled={{.State.OOMKilled}} limit={{.HostConfig.Memory}}' thumbs", output: "137 OOMKilled=false limit=0" },
          { command: "docker run -d --name thumbs-stop ops/thumbs:3.1", output: "b7e10ae3c02d59baa223320173e353340db92b391249aaaed17e6bb87314d28b" },
          { command: "docker stop thumbs-stop", output: "thumbs-stop" },
          { command: "docker run -d --name thumbs-kill ops/thumbs:3.1", output: "37e90a3f1625a92a60eefcb1c728b27d7cbfcc71481b690ec2548d7a10968c13" },
          { command: "docker kill thumbs-kill", output: "thumbs-kill" },
          { command: "docker inspect -f '{{.Name}} {{.State.ExitCode}} OOMKilled={{.State.OOMKilled}}' thumbs-stop thumbs-kill", output: "/thumbs-stop 137 OOMKilled=false\n/thumbs-kill 137 OOMKilled=false" },
          { command: "docker events --since 1m --until 0s --filter container=thumbs-stop", output: "2026-11-22T10:00:00.000000000Z container create b7e10ae3c02d59baa223320173e353340db92b391249aaaed17e6bb87314d28b (image=ops/thumbs:3.1, name=thumbs-stop)\n2026-11-22T10:00:00.000000000Z container start b7e10ae3c02d59baa223320173e353340db92b391249aaaed17e6bb87314d28b (image=ops/thumbs:3.1, name=thumbs-stop)\n2026-11-22T10:00:00.000000000Z container kill b7e10ae3c02d59baa223320173e353340db92b391249aaaed17e6bb87314d28b (image=ops/thumbs:3.1, name=thumbs-stop, signal=15)\n2026-11-22T10:00:10.000000000Z container kill b7e10ae3c02d59baa223320173e353340db92b391249aaaed17e6bb87314d28b (image=ops/thumbs:3.1, name=thumbs-stop, signal=9)\n2026-11-22T10:00:10.000000000Z container die b7e10ae3c02d59baa223320173e353340db92b391249aaaed17e6bb87314d28b (execDuration=10, exitCode=137, image=ops/thumbs:3.1, name=thumbs-stop)\n2026-11-22T10:00:10.000000000Z container stop b7e10ae3c02d59baa223320173e353340db92b391249aaaed17e6bb87314d28b (image=ops/thumbs:3.1, name=thumbs-stop)" },
          { command: "docker events --since 1m --until 0s --filter container=thumbs-kill", output: "2026-11-22T10:00:10.000000000Z container create 37e90a3f1625a92a60eefcb1c728b27d7cbfcc71481b690ec2548d7a10968c13 (image=ops/thumbs:3.1, name=thumbs-kill)\n2026-11-22T10:00:10.000000000Z container start 37e90a3f1625a92a60eefcb1c728b27d7cbfcc71481b690ec2548d7a10968c13 (image=ops/thumbs:3.1, name=thumbs-kill)\n2026-11-22T10:00:10.000000000Z container kill 37e90a3f1625a92a60eefcb1c728b27d7cbfcc71481b690ec2548d7a10968c13 (image=ops/thumbs:3.1, name=thumbs-kill, signal=9)\n2026-11-22T10:00:10.000000000Z container die 37e90a3f1625a92a60eefcb1c728b27d7cbfcc71481b690ec2548d7a10968c13 (execDuration=0, exitCode=137, image=ops/thumbs:3.1, name=thumbs-kill)" },
        ],
      },
      {
        id: 'dkr13-live', title: '看著 reports 的記憶體爬向上限', machine: 'dkr13-harbor',
        description: 'reports 在等待重啟時 docker stats 沒有用量；它重新啟動之後，用量每秒增加約 25MB，幾秒內接近 256MiB 的上限，接著又以 137 結束。docker top 列出 edge 容器裡的行程。',
        steps: [
          { command: "docker stats --no-stream", output: "CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O   BLOCK I/O   PIDS\n9128eaee18fd   reports   0.00%     0B / 0B             0.00%     0B / 0B   0B / 0B     0\nd55d273aa4b3   edge      0.00%     9MiB / 4GiB         0.22%     0B / 0B   0B / 0B     3" },
          { command: "sleep 31", output: "" },
          { command: "docker stats --no-stream reports", output: "CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O   BLOCK I/O   PIDS\n9128eaee18fd   reports   85.00%    124.7MiB / 256MiB   48.71%    0B / 0B   0B / 0B     2" },
          { command: "sleep 4", output: "" },
          { command: "docker stats --no-stream --format '{{.Name}}: {{.MemUsage}} ({{.MemPerc}})' reports", output: "reports: 220.1MiB / 256MiB (85.96%)" },
          { command: "sleep 2", output: "" },
          { command: "docker ps --filter name=reports --format '{{.Names}}: {{.Status}}'", output: "reports: Restarting (137) Less than a second ago" },
          { command: "docker events --since 10s --until 0s --filter container=reports", output: "2026-11-22T10:00:29.370000000Z container start 9128eaee18fd9014a67f385cd7a5d1cb2c8717485e5e7e56a55d72a801e701f4 (image=ops/reports:1.8, name=reports)\n2026-11-22T10:00:36.508000000Z container oom 9128eaee18fd9014a67f385cd7a5d1cb2c8717485e5e7e56a55d72a801e701f4 (image=ops/reports:1.8, name=reports)\n2026-11-22T10:00:36.508000000Z container die 9128eaee18fd9014a67f385cd7a5d1cb2c8717485e5e7e56a55d72a801e701f4 (execDuration=7, exitCode=137, image=ops/reports:1.8, name=reports)" },
          { command: "docker top edge", output: "UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD\nroot                903                 902                 0                   Nov21               ?                   00:00:00            nginx -g daemon off;" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr13-ex-env', title: '讓 billing 帶著必要的設定重新上線', machine: 'dkr13-harbor',
        statement: 'harbor-07 的 billing 從 09:41 的部署之後就停了。先查出它停止的原因，再依 `~/runbook/billing.md` 的部署紀錄修好它：容器名稱仍是 billing、使用 `ops/billing:2.3`，要帶著紀錄裡的必要設定與選用設定，並維持紀錄裡的重新啟動策略。完成時 billing 要在執行中。',
        checks: [
          { kind: 'container', name: 'billing', state: 'running', image: 'ops/billing:2.3', env: 'PAYMENT_API_URL=http://payments.internal:8080' },
          { kind: 'container', name: 'billing', env: 'LOG_LEVEL=info', restartPolicy: 'on-failure:5' },
        ],
        solution: [
          'docker logs --tail 2 billing',
          'cat runbook/billing.md',
          'docker rm billing',
          'docker run -d --name billing --restart on-failure:5 -e PAYMENT_API_URL=http://payments.internal:8080 -e LOG_LEVEL=info ops/billing:2.3',
          'sleep 5',
          'docker ps --filter name=billing',
        ],
        mistakes: [
          { commands: ['docker restart billing'], why: '沒有修正設定就重新啟動：容器還是沒有 PAYMENT_API_URL，馬上又以 1 結束，on-failure:5 從頭再重試一輪' },
          { commands: ['docker start billing', 'sleep 5'], why: 'docker start 用的是同一個容器、同一份環境變數，錯誤不會消失' },
          { commands: ['docker rm billing', 'docker run -d --name billing -e PAYMENT_API_URL=http://payments.internal:8080 -e LOG_LEVEL=info ops/billing:2.3'], why: '設定補齊了，但重建時漏了 --restart on-failure:5，之後當掉就不會自動重新啟動' },
          { commands: ['docker rm billing', 'docker run -d --name billing --restart on-failure:5 -e PAYMENT_API_URL -e LOG_LEVEL=info ops/billing:2.3'], why: '`-e PAYMENT_API_URL` 沒有寫值，Docker 會從目前的 Shell 取值，而 Shell 沒有這個變數：容器還是缺少它' },
          { commands: ['docker rm billing', 'docker run -d --name billing --restart on-failure:5 -e PAYMENT_URL=http://payments.internal:8080 -e LOG_LEVEL=info ops/billing:2.3'], why: '變數名稱打錯成 PAYMENT_URL，程式要的是 PAYMENT_API_URL' },
        ],
        hints: [
          '`docker ps -a` 看 billing 的狀態與結束碼，`docker logs --tail 2 billing` 看它最後說了什麼。',
          '`docker inspect -f \'{{range .Config.Env}}{{println .}}{{end}}\' billing` 列出它拿到的環境變數；`cat runbook/billing.md` 是部署紀錄。',
          '環境變數不能對既有的容器修改：先 `docker rm billing`，再用 `docker run -d --name billing --restart on-failure:5 -e 名稱=值 -e 名稱=值 ops/billing:2.3` 重建。',
        ],
        explanation: '`docker ps -a` 顯示 billing 是 `Exited (1)`，日誌重複六次 `Error: PAYMENT_API_URL is not set`，inspect 的 RestartCount 是 5、策略 on-failure:5：它啟動就失敗，重試五次後放棄，而 `Config.Env` 裡確實沒有 PAYMENT_API_URL。環境變數在建立容器時就固定了，`docker restart`、`docker start` 只會用同一份設定再失敗一次，所以要 `docker rm billing` 再以完整的 `-e PAYMENT_API_URL=http://payments.internal:8080 -e LOG_LEVEL=info` 與原本的 `--restart on-failure:5` 重新 `docker run`。過幾秒再看 `docker ps`，billing 是 `Up 5 seconds`，日誌是正常的 listening 訊息。只寫 `-e PAYMENT_API_URL` 不寫值時，Docker 取的是執行 docker 那個 Shell 的變數，這台主機的 Shell 沒有它，等於沒有設定。',
      },
      {
        id: 'dkr13-ex-oomfind', title: '三個 137 之中，哪一個是 OOM', machine: 'dkr13-night',
        statement: 'harbor-09 的 indexer、mailer、thumbs 夜裡都以 137 結束了。查出其中被 OOM killer 結束的那一個，用 `docker inspect` 以 `{{.Name}} {{.HostConfig.Memory}}` 的格式只印出它這一行（例如 `/web 268435456`）。請寫成不寫死容器名稱的指令：同一串指令會在另外兩台夜班主機上重播，那裡被 OOM 結束的是別的容器。',
        checks: [{ kind: 'output', fromCommand: '^(sudo )?docker (container )?inspect\\b' }],
        solution: ['docker inspect -f \'{{if .State.OOMKilled}}{{.Name}} {{.HostConfig.Memory}}{{end}}\' $(docker ps -aq) | grep .'],
        mistakes: [
          { commands: ['docker ps -a --filter status=exited --format \'{{.Names}} {{.Status}}\''], why: '三個都是 Exited (137)，ps 看不出哪一個是 OOM，也沒有印出記憶體上限' },
          { commands: ['docker inspect -f \'{{.Name}} {{.HostConfig.Memory}}\' $(docker ps -aq)'], why: '印出了每一個容器的上限，沒有篩出被 OOM 結束的那一個' },
          { commands: ['docker inspect -f \'{{.Name}} {{.HostConfig.Memory}}\' thumbs'], why: '只挑了最後停止的 thumbs；它的 137 不是 OOM，而且寫死了名稱' },
          { commands: ['echo "/indexer 536870912"'], why: '直接打出答案，沒有查詢；換一台主機答案就不同了' },
        ],
        variants: [
          { label: '被 OOM 結束的是 mailer 的 harbor-09', files: [], docker: nightDocker('mailer') },
          { label: '被 OOM 結束的是 thumbs 的 harbor-09', files: [], docker: nightDocker('thumbs') },
        ],
        hints: [
          '`docker inspect -f \'{{.Name}} {{.State.ExitCode}} {{.State.OOMKilled}}\' $(docker ps -aq)` 一次看所有容器的結束碼與 OOMKilled。',
          '`docker events --since 12h --until 0s --filter event=oom` 也會告訴你是哪一個容器。',
          'template 可以判斷：`{{if .State.OOMKilled}}…{{end}}` 只對 OOMKilled 是 true 的容器印出內容，其他容器印出空行；接上 `| grep .` 去掉空行。',
        ],
        explanation: '三個容器的 STATUS 都是 `Exited (137)`，結束碼只說明它們都死於 SIGKILL。`State.OOMKilled` 才分得出是不是記憶體上限造成的：`{{if .State.OOMKilled}}{{.Name}} {{.HostConfig.Memory}}{{end}}` 只對 OOM 的容器印出名稱與上限，`$(docker ps -aq)` 讓 inspect 一次檢查所有容器，`grep .` 去掉其他容器的空行。這台是 `/indexer 536870912`（512MiB）；另外兩台分別是 mailer（128MiB）與 thumbs（1GiB）。其他兩個 137 是 `docker kill` 或 `docker stop` 逾時，OOMKilled 是 false；`docker events --filter event=oom` 也只會列出被 OOM 結束的那一個。',
      },
      {
        id: 'dkr13-ex-oomfix', title: '停止 reports 的 OOM 重啟迴圈', machine: 'dkr13-harbor',
        statement: 'harbor-07 的 reports 一直在重新啟動。確認原因之後，把它的記憶體上限改成 512MB（`512m`；它產生月報最多用到約 310MB），讓它立刻以新的上限重新執行，並確認 30 秒之後它仍在執行。容器名稱、Image 與 `--restart always` 都要維持。',
        checks: [
          { kind: 'container', name: 'reports', state: 'running', image: 'ops/reports:1.8', memory: 512 * MIB, oomKilled: false },
          { kind: 'container', name: 'reports', restartPolicy: 'always' },
        ],
        solution: [
          'docker inspect -f \'{{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}} {{.HostConfig.Memory}}\' reports',
          'docker update -m 512m reports',
          'docker restart reports',
          'sleep 30',
          'docker ps --filter name=reports',
        ],
        mistakes: [
          { commands: ['docker restart reports', 'sleep 30'], why: '沒有改上限就重新啟動：用量照樣在七秒左右越過 256MiB，又被 OOM 結束' },
          { commands: ['docker update -m 128m reports', 'docker restart reports', 'sleep 30'], why: '把上限調得更低，它只會更早被 OOM killer 結束' },
          { commands: ['docker update -m 512 reports', 'docker restart reports', 'sleep 30'], why: '`-m 512` 是 512 位元組，Docker 以 Minimum memory limit allowed is 6MB 拒絕，上限沒有改變' },
          { commands: ['docker rm -f reports', 'docker run -d --name reports -m 512m ops/reports:1.8', 'sleep 30'], why: '重建時漏了 --restart always，重新啟動策略變成 no' },
        ],
        hints: [
          '`docker ps` 的 `Restarting (137)` 加上 `docker inspect -f \'{{.State.OOMKilled}} {{.HostConfig.Memory}}\' reports` 告訴你原因與目前的上限。',
          '`docker update -m 512m reports` 直接修改既有容器的記憶體上限，不必重建。',
          '`docker restart reports` 讓它立刻以新上限重新開始；`sleep 30` 之後再 `docker ps` 確認。',
        ],
        explanation: 'reports 的 STATUS 是 `Restarting (137)`，inspect 顯示 OOMKilled 是 true、RestartCount 一直增加、上限 268435456（256MiB），events 裡每次啟動約七秒後就有一筆 oom：它產生月報需要約 310MB，256MiB 不夠。`docker update -m 512m reports` 立刻把上限改成 536870912 位元組，`docker restart reports` 讓它馬上以新上限開始（同時把 RestartCount 歸零），30 秒後它仍是 Up，用量停在約 296MiB、低於上限，OOMKilled 是 false。也可以 `docker rm -f` 後以 `-m 512m --restart always` 重新 `docker run`，但漏了 `--restart always` 就改變了原本的行為；把上限調低或只重新啟動都不會停止迴圈。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr13-q1', prompt: '依舊的 README 執行 `docker run --name job ops/etl:0.9 /app/bin/export`，終端機印出 `stat /app/bin/export: no such file or directory`，`echo $?` 是 127，`docker ps -a` 顯示 job 是 `Created`。這代表什麼？',
      options: ['程式執行了一段時間，最後自己以 127 結束，要看 `docker logs job`', '容器的記憶體上限太小，啟動時就被 OOM killer 結束', '主程式路徑在 Image 裡不存在，程式從未啟動', '`docker run` 的選項寫錯，Docker 拒絕建立容器'],
      answer: 2,
      explanation: '127 表示要執行的指令或路徑找不到：建立行程時找不到 `/app/bin/export`，容器已經建立但程式從未執行，所以停在 Created，原因寫在 `{{.State.Error}}`，`docker logs` 是空的。OOM 的結束碼是 137，而且容器會是 Exited；選項寫錯是 125，那時容器根本不會被建立或啟動。',
    },
    {
      id: 'dkr13-q2', prompt: '`docker inspect -f \'{{.State.ExitCode}} {{.State.OOMKilled}} {{.HostConfig.Memory}}\' worker` 印出 `137 true 134217728`。下列哪個判斷正確？',
      options: ['worker 越過 128MiB 上限，被 OOM killer 以 SIGKILL 結束', '有人對 worker 執行了 `docker kill`，137 就是 kill 的意思', 'worker 的程式有 bug，在處理到一半時自己以 137 結束', '`docker stop` 等了 10 秒，worker 沒有結束才被強制終止'],
      answer: 0,
      explanation: 'OOMKilled 是 true 表示最後一次執行是因為越過記憶體上限被核心結束，134217728 位元組就是 `-m 128m`；SIGKILL 是 9，所以結束碼是 128＋9＝137。`docker kill` 與 `docker stop` 逾時也會得到 137，但 OOMKilled 是 false，events 裡是 kill 而不是 oom；程式自己結束時也不會把 OOMKilled 設成 true。',
    },
    {
      id: 'dkr13-q3', prompt: 'api 容器（`--restart always`）的 STATUS 一直是 `Restarting (1) …`，日誌重複著 `Error: DATABASE_URL is not set`。哪一個做法真的能修好它？',
      options: ['`docker restart api`，讓它用同一份設定重新開始一次', '`docker exec api sh` 進去以後執行 `export DATABASE_URL=…` 補上變數', '`docker update --restart no api`，讓它不要再一直重新啟動', '`docker rm -f api` 後加上 `-e DATABASE_URL=…` 重新 `docker run`'],
      answer: 3,
      explanation: '原因是建立容器時少了環境變數，而容器的環境變數在建立後不能修改，所以要刪除並以正確的 `-e` 重建，同時保留原本的重新啟動策略。restart 用的是同一份設定，只會再失敗；restarting 的容器 exec 不進去，就算進得去，在 exec 的 Shell 裡 export 也影響不到主程式；把策略改成 no 只是讓它停在 Exited，問題還在。',
    },
    {
      id: 'dkr13-q4', prompt: '同事說 billing 一定存在，但 `docker ps` 的清單裡沒有它。最可能的原因是什麼？',
      options: ['billing 已經被 `docker rm` 刪除了，只能從 Image 重新建立', 'billing 已經停止，`docker ps` 要加 `-a` 才列出', '`docker ps` 只列出有用 `-p` 公開連接埠的容器', '`docker ps` 只列出目前登入的使用者自己建立的容器'],
      answer: 1,
      explanation: '`docker ps` 不加 `-a` 只顯示執行中的容器（restarting 的也會列出），停止的容器仍然存在、日誌與設定都還在，只是要 `docker ps -a` 才會列出。沒有證據說它被刪除了；PORTS 欄可以是空的，與是否列出無關；Docker 也不依使用者區分容器，docker 群組的成員看到的是同一個 daemon 的所有容器。',
    },
    {
      id: 'dkr13-q5', prompt: 'reports（`--restart always`）每次啟動約七秒就被 OOM 結束。早上看到它的 STATUS 是 `Restarting (137) 30 seconds ago`，RestartCount 是 15。為什麼兩次啟動之間要等這麼久？',
      options: ['等待從 100 毫秒起每次加倍、最多一分鐘，執行不到 10 秒不會重設', 'Docker 在每次 OOM 之後固定等待 30 秒，讓核心回收記憶體', 'always 策略只會每分鐘檢查一次，看容器是否需要重新啟動', 'RestartCount 超過 10 之後，Docker 改成固定每 30 秒重新啟動一次'],
      answer: 0,
      explanation: 'Docker 的重新啟動等待時間從 100 毫秒開始每次加倍，上限一分鐘；只有一次執行了 10 秒以上才會回到 100 毫秒。reports 每次只跑約七秒，十幾次之後就到了一分鐘的上限，`30 seconds ago` 是它上一次結束到現在的時間。並沒有「OOM 後固定等 30 秒」的規則，always 也不是每分鐘輪詢，次數本身不會切換到固定間隔。',
    },
    {
      id: 'dkr13-q6', prompt: 'thumbs 是 `Exited (137)`，OOMKilled 是 false。`docker events` 顯示：`kill`（signal=15），10 秒後 `kill`（signal=9）、`die`、`stop`。發生了什麼？',
      options: ['它的記憶體越過了上限，在第二筆 kill 之前被 OOM killer 結束', '有人執行了 `docker kill thumbs`，先送 SIGTERM 再送 SIGKILL', '有人 `docker stop` 它，PID 1 沒處理 SIGTERM，10 秒後被 SIGKILL', '程式在收到 SIGTERM 之後自己以 137 結束，Docker 只是記錄下來'],
      answer: 2,
      explanation: '`docker stop` 先送 SIGTERM（15），等最多 10 秒，程式沒有結束就送 SIGKILL（9），最後記一筆 stop；兩筆 kill 相隔 10 秒正是逾時的特徵，137 來自 SIGKILL。OOM 會有 oom 事件而且 OOMKilled 是 true；`docker kill` 預設直接送 signal=9，只有一筆 kill、也沒有 stop 事件；如果程式自己處理了 SIGTERM，它會在第二筆 kill 之前結束，通常是 0。',
    },
    {
      id: 'dkr13-q7', prompt: 'reports 產生月報時最多用到約 310MB，但上限是 `-m 256m`，於是陷入 OOM 重啟迴圈。下列哪個做法最恰當？',
      options: ['`docker update -m 128m reports`，讓它學會用少一點記憶體', '`docker update -m 512m reports`，再 restart 它', '`docker restart reports`，清掉累積的記憶體之後重新開始', '`docker update -m 512 reports`，把記憶體上限提高到 512'],
      answer: 1,
      explanation: '用量有一個明確的高點，表示上限設得太低：把上限提高到高點之上並留餘裕（512m）才能讓它跑完，`docker update` 立刻生效，`docker restart` 讓它不必等下一次重啟。調到 128m 只會更早被殺；單純重新啟動不改變上限，七秒後又被 OOM；`-m 512` 沒有單位是 512 位元組，Docker 會以 Minimum memory limit allowed is 6MB 拒絕。',
    },
    {
      id: 'dkr13-q8', prompt: '值班時想知道 reports 在 09:50 到 10:00 之間每次啟動、被 OOM 結束的時間點。哪一個指令最合適？',
      options: ['`docker events --filter container=reports --filter event=oom`', "`docker inspect -f '{{.State.StartedAt}} {{.State.FinishedAt}}' reports`", '`docker logs --since 2026-11-22T09:50:00Z reports`', '`docker events --since 2026-11-22T09:50:00Z --until 2026-11-22T10:00:00Z --filter container=reports`'],
      answer: 3,
      explanation: 'docker events 記錄每一次 start、oom、die 與它們的時間，`--since` 與 `--until` 限定範圍並讓指令印完就結束。沒有 `--since` 的 docker events 只會等待之後的新事件，看不到過去；inspect 只有最後一次的 StartedAt、FinishedAt 與 OOMKilled；logs 只有程式印出的內容，OOM 的 SIGKILL 不會讓程式留下任何一行。',
    },
  ],
};

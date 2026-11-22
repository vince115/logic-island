import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalContainer, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

/*
 * DKR03 Images and the Container Lifecycle (DKR-1, terminal-sim; the blueprint's container-playground). A terminal lesson
 * on the containers profile (engine stage E20): an image as a read-only template of layers and a container as an instance
 * with its own writable layer (overlay2, copy-on-write and the union view are text only); several containers from one
 * image; the states created, running and exited and removal (docker create is not simulated: a container a teammate
 * created and never started is lesson data, and docker run is explained as create plus start); exit codes 0, 1, 125-127,
 * 137 and 143, with docker stop's SIGTERM (or the image's STOPSIGNAL), the 10-second grace period and SIGKILL for a PID 1
 * that ignores SIGTERM; the writable layer and the logs surviving stop and start but not rm; and cleanup with docker rm,
 * docker rmi (the conflict while any container, even a created one, uses the image; -f deletes an image only stopped or
 * created containers use, leaving them pointing at a missing image, and only untags one a running container uses) and docker container
 * prune. Machines: ship-01 with nginx, alpine and redis (a created draft and a running ticker), the same host after a week
 * of report jobs (python:3.12-slim used only by stopped containers), and an on-call host with a stopped toolbox container
 * and a backup job's container that exited 3. Host names, the backup image and files are made up. Every transcript output
 * was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const HOME = '/home/learner';
const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const SHELL_TOOLS = ['ls', 'cat', 'echo', 'env', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'head', 'tail', 'grep', 'wc', 'hostname'];

const NGINX_PAGE = '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body><h1>Welcome to nginx!</h1></body>\n</html>\n';
const NGINX_50X = '<!DOCTYPE html>\n<html>\n<head><title>Error</title></head>\n<body><h1>An error occurred.</h1></body>\n</html>\n';
const NGINX: TerminalImage = {
  name: 'nginx:1.27', size: 191968432, created: '2026-11-05 09:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'],
  env: [PATH_ENV, 'NGINX_VERSION=1.27.3'], expose: [80], service: true, layers: 7, pulled: true,
  logs: [
    '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
    '/docker-entrypoint.sh: Configuration complete; ready for start up',
    { text: '2026/11/22 10:00:00 [notice] 1#1: nginx/1.27.3', stream: 2 },
    { text: '2026/11/22 10:00:00 [notice] 1#1: start worker processes', stream: 2 },
  ],
  commands: [...SHELL_TOOLS, 'bash'],
  files: [{ path: '/usr/share/nginx/html/index.html', content: NGINX_PAGE }, { path: '/usr/share/nginx/html/50x.html', content: NGINX_50X }, { path: '/etc/nginx/conf.d/default.conf', content: 'server {\n    listen 80;\n    root /usr/share/nginx/html;\n}\n' }],
};
const ALPINE: TerminalImage = {
  name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1, commands: [...SHELL_TOOLS, 'ps'],
  osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n',
};
const REDIS: TerminalImage = {
  name: 'redis:7.4', size: 117000000, created: '2026-11-10 06:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['redis-server'], expose: [6379], service: true, layers: 6, pulled: true,
  logs: ['1:C 22 Nov 2026 10:00:00.000 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo', '1:M 22 Nov 2026 10:00:00.001 * Ready to accept connections tcp'],
};
const PYTHON: TerminalImage = {
  name: 'python:3.12-slim', size: 124617216, created: '2026-11-12 03:00:00', cmd: ['python3'], env: [PATH_ENV, 'PYTHON_VERSION=3.12.8'], output: '', layers: 4, pulled: true,
};

const host = (id: string, title: string, images: TerminalImage[], containers: TerminalContainer[]): TerminalMachine => ({
  id, title, user: 'learner', cwd: HOME, host: 'ship-01', profile: 'containers',
  files: [dir('/home'), dir(HOME, 'learner'), file(`${HOME}/notes.txt`, '容器練習筆記\n', 'learner')],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, { name: 'docker', gid: 988, members: ['learner'] }] },
  docker: { images, containers },
});

/** draft: made by a teammate with docker create, never started; ticker: a long-running helper. */
const DRAFT: TerminalContainer = { name: 'draft', image: 'nginx:1.27', state: 'created', created: '2026-11-22 09:40:00' };
const TICKER: TerminalContainer = { name: 'ticker', image: 'alpine:3.21', command: ['sleep', 'infinity'], state: 'running', created: '2026-11-22 09:30:00', started: '2026-11-22 09:30:00' };
const lab = host('dkr03-lab', 'ship-01（Docker 主機）', [NGINX, ALPINE, REDIS], [DRAFT, TICKER]);

/** A host after a week of report jobs and experiments: one live site, three stopped containers, an image only they use. */
const SHOP_WEB: TerminalContainer = { name: 'shop-web', image: 'nginx:1.27', state: 'running', created: '2026-11-20 08:00:00', started: '2026-11-20 08:00:00' };
const reportJob = (name: string, day: string, finished: string, exitCode: number, csv: string): TerminalContainer => ({
  name, image: 'python:3.12-slim', command: ['python3', '/app/report.py'], state: 'exited', created: `${day} 02:00:00`, started: `${day} 02:00:00`, finished: `${day} ${finished}`, exitCode,
  files: [{ path: `/app/out/report-${day}.csv`, content: csv }],
});
const tidy = host('dkr03-tidy', 'ship-01（跑了一週報表的 Docker 主機）', [NGINX, PYTHON, ALPINE], [
  SHOP_WEB,
  reportJob('report-1', '2026-11-21', '02:03:10', 0, 'date,orders\n2026-11-20,184\n'),
  reportJob('report-2', '2026-11-22', '02:00:41', 1, 'date,orders\n'),
  { name: 'shell-test', image: 'alpine:3.21', state: 'exited', created: '2026-11-21 15:10:00', started: '2026-11-21 15:10:00', finished: '2026-11-21 15:10:00', exitCode: 0 },
]);

/** toolbox: kept alive with sleep infinity for docker exec, stopped last night (137); nightly-backup: a job that exited 3. */
const backupImage = (output: string, exit: number): TerminalImage => ({
  name: 'ship/backup-job:1.4', size: 9126400, created: '2026-11-18 16:20:00', cmd: ['/usr/local/bin/backup.sh'], output, exit, layers: 2, pulled: true, registry: false,
});
const BACKUP_LOCKED = backupImage('backup: copying /data to /backup\nbackup: /data/orders.db is locked by another process\n', 3);
const toolbox = (note: string): TerminalContainer => ({
  name: 'toolbox', image: 'alpine:3.21', command: ['sleep', 'infinity'], state: 'exited', created: '2026-11-20 09:00:00', started: '2026-11-20 09:00:00', finished: '2026-11-21 23:00:00', exitCode: 137,
  files: [{ path: '/root/handover.txt', content: note }],
});
const nightly = (exitCode: number): TerminalContainer => ({ name: 'nightly-backup', image: 'ship/backup-job:1.4', state: 'exited', created: '2026-11-22 02:00:00', started: '2026-11-22 02:00:00', finished: '2026-11-22 02:00:07', exitCode });
const opsDocker = (note: string, backup: TerminalImage, exitCode: number) => ({ images: [ALPINE, backup], containers: [toolbox(note), nightly(exitCode)] });
const OPS = opsDocker('交接：週四 22:00 更新 nginx，先通知客服\n', BACKUP_LOCKED, 3);
const ops = host('dkr03-ops', 'ship-01（值班交接用的 Docker 主機）', OPS.images, OPS.containers);

/** Exercise 2's variant (another note) and exercise 4's (another night's result). */
const OPS_OTHER_NOTE = opsDocker('交接：備份磁碟剩 12%，週五前清理 /backup\n', BACKUP_LOCKED, 3);
const OPS_READONLY = opsDocker('交接：週四 22:00 更新 nginx，先通知客服\n', backupImage('backup: copying /data to /backup\nbackup: cannot write /backup: Read-only file system\n', 1), 1);

export const DKR03: LessonContent = {
  lessonId: 'DKR03',
  motivation: '「我把容器停掉再開，設定檔還在；同事把容器刪掉重開，資料全沒了。」「明明沒有在跑任何容器，為什麼 docker rmi 說 Image 還在使用中？」「容器顯示 Exited (137)，是不是記憶體爆了？」這些問題都來自同一件事：沒有分清楚 Image 和 Container，也不知道容器在每個 Docker 操作之後會進入哪個狀態。這一課在一台 Docker 主機上，從同一個 Image 啟動好幾個容器，跟著一個容器走過 created、running、exited 到刪除，讀懂結束碼 0、1 與 137 的來由，親手證明可寫層與日誌撐得過 stop、撐不過 rm，最後學會依正確的順序用 docker rm、docker rmi 與 docker container prune 清理主機。學完之後，你應該能在按下 Enter 之前，就說出容器接下來的狀態與它的資料會不會留下來。',
  sections: [
    {
      id: 'dkr03-s-image', title: 'Image 是範本，Container 是執行個體',
      blocks: [
        { type: 'p', text: 'Image 是一份唯讀的範本：裡面有執行一個程式需要的檔案（程式本身、函式庫、設定檔），以及啟動時的預設設定，例如預設指令（CMD）、進入點（ENTRYPOINT）、環境變數與工作目錄。Image 由好幾層唯讀的檔案層疊起來，`docker pull` 時看到的一行行 `Pull complete` 就是在下載這些層。Image 本身從不執行，也從不改變。' },
        { type: 'p', text: 'Container（容器）是由 Image 建立出來的執行個體。建立容器時，Docker 在 Image 的唯讀層上方替這個容器加一層專屬的可寫層，容器裡的程式看到的檔案系統，是「可寫層疊在 Image 各層之上」合起來的樣子。程式寫入、修改或刪除檔案，都只發生在可寫層裡；Image 的層由所有容器共用，誰也改不到。這就是為什麼同一個 Image 可以同時啟動很多個容器，而且彼此不會互相干擾。' },
        { type: 'table', head: ['', 'Image', 'Container'], rows: [
          ['是什麼', '唯讀的範本（多層檔案加上預設設定）', '由 Image 建立的執行個體：Image 的層加上自己的可寫層與執行狀態'],
          ['會不會改變', '不會；要改就建立新的 Image（DKR05 的 docker build）', '會；程式寫入的檔案都在可寫層，狀態也會變（created、running、exited）'],
          ['有幾個', '一個 Image 在主機上只存一份', '同一個 Image 可以建立任意多個容器，每個都有自己的 ID、名稱與可寫層'],
          ['怎麼列出', '`docker images`', '`docker ps`（執行中）、`docker ps -a`（全部）'],
          ['怎麼刪除', '`docker rmi`（沒有容器使用時）', '`docker rm`（停止之後，或加 `-f`）'],
        ] },
        { type: 'p', text: '可以用程式語言的類別與物件來類比：Image 像類別，Container 像用 new 建立的物件，每個物件有自己的欄位值。不過容器多了「狀態」與「可寫層」兩件事，這正是本課的重點。' },
        { type: 'p', text: '在核心層面，Ubuntu 上的 Docker 預設用 overlay2 儲存驅動把這些層合起來：Image 的各層是 overlayfs 的下層（lowerdir，唯讀），容器的可寫層是上層（upperdir），容器看到的是兩者合併後的檢視（merged）。容器要修改一個來自 Image 的檔案時，overlayfs 先把整個檔案複製到可寫層再修改（copy-on-write，寫入時複製）；刪除 Image 裡的檔案時，則在可寫層留下一個「已刪除」的標記（whiteout），Image 本身仍然完整。模擬環境不模擬 overlayfs，只呈現 docker 指令看得到的結果。' },
        { type: 'table', head: ['層', '內容', '誰可以寫'], rows: [
          ['容器的可寫層（upperdir）', '這個容器建立、修改或刪除的檔案', '只有這個容器'],
          ['Image 的第 N 層 … 第 1 層（lowerdir）', 'Image 的檔案，例如 nginx 的程式與預設網頁', '沒有人（唯讀，所有容器共用）'],
          ['合併後的檢視（merged）', '容器裡的程式看到的完整檔案系統', '寫入時實際落在可寫層'],
        ] },
        { type: 'p', text: '本課的主機 ship-01 已經拉取了 nginx:1.27、alpine:3.21 與 redis:7.4 三個 Image，learner 在 docker 群組裡。下面先看 Image 與容器各有哪些，再由同一個 nginx:1.27 啟動 web-a 與 web-b 兩個容器：' },
        { type: 'example', id: 'dkr03-one-image' },
        { type: 'p', text: '啟動兩個容器之後，`docker images nginx` 仍然只有一列、IMAGE ID 也沒有變：容器並沒有複製一份 Image。兩個容器各有自己的 CONTAINER ID，容器的主機名稱預設就是 ID 的前 12 個字，所以 `hostname` 在 web-a 與 web-b 裡印出不同的值；PORTS 欄的 `80/tcp` 是 Image 宣告會用到的埠（還沒有對應到主機，DKR04 再談 `-p`）。' },
      ],
    },
    {
      id: 'dkr03-s-states', title: '容器的狀態：created、running、exited 與刪除',
      blocks: [
        { type: 'p', text: '一個容器從出生到消失，會經過下面這幾個狀態。`docker ps -a` 的 STATUS 欄與 `docker inspect -f "{{.State.Status}}"` 都看得到目前的狀態：' },
        { type: 'table', head: ['狀態', 'STATUS 欄的樣子', '意思', '怎麼進入'], rows: [
          ['created', '`Created`', '容器（含可寫層與設定）已經建立，程式還沒執行過', '`docker create`；或 `docker run` 建立之後啟動失敗（例如連接埠被占用、找不到執行檔）'],
          ['running', '`Up 30 minutes`', '容器的主程式（PID 1）正在執行', '`docker run`、`docker start`、`docker restart`'],
          ['exited', '`Exited (0) 5 minutes ago`', '主程式已經結束；括號裡是結束碼，可寫層與日誌都還在', '程式自己結束，或 `docker stop` 讓它結束'],
          ['（已刪除）', '`docker ps -a` 不再列出', 'daemon 不再記得這個容器，可寫層與日誌一起消失', '`docker rm`、`docker container prune`、`--rm` 的容器結束時'],
        ] },
        { type: 'p', text: '`docker run` 其實是好幾個動作的組合：本機沒有 Image 時先拉取（pull），接著建立容器（create），再啟動它（start）；沒有 `-d` 時還會把終端機接到容器的輸出上，等它結束。真實的 Docker 也可以把建立與啟動分開：`docker create` 只建立、不啟動，容器停在 created，之後再用 `docker start` 啟動。本課的模擬環境不支援 `docker create`（輸入時會提示改用 `docker run`），所以主機上的 draft 是事先準備好的：它是同事前一刻用 `docker create --name draft nginx:1.27` 建立、還沒啟動的容器。' },
        { type: 'example', id: 'dkr03-states' },
        { type: 'p', text: 'draft 一開始是 created，StartedAt 還是空的；`docker start draft` 之後變成 running，StartedAt 記下啟動的時間；`docker stop draft` 讓它變成 exited、結束碼 0；`docker rm draft` 之後，`docker inspect` 回答 `No such object`：容器已經不存在，不再有任何狀態。注意 start、stop、rm 成功時都只印出你打的名稱，要確認狀態得另外看 `docker ps -a` 或 `docker inspect`。' },
        { type: 'p', text: '每個 docker 指令只接受某些狀態的容器，不符合時 daemon 會回報錯誤：' },
        { type: 'table', head: ['指令', '接受的狀態', '之後的狀態', '其他狀態時'], rows: [
          ['`docker start 容器`', 'created、exited', 'running（同一個容器、同樣的可寫層）', '已經在執行時什麼都不做'],
          ['`docker stop 容器`', 'running', 'exited', '已經停止時什麼都不做'],
          ['`docker restart 容器`', '任何狀態', 'running（先 stop 再 start）', '—'],
          ['`docker exec 容器 指令`', 'running', '不變', '`Error response from daemon: container … is not running`'],
          ['`docker rm 容器`', 'created、exited', '刪除', '執行中：`cannot remove container "/web": container is running`，要先 stop 或加 `-f`'],
          ['`docker logs 容器`', '任何還存在的容器', '不變', '刪除之後：`No such container`'],
        ] },
        { type: 'p', text: '`docker ps` 只列出 running 的容器，created 與 exited 的要加 `-a` 才看得到，這是「容器明明建立了卻找不到」最常見的原因。`docker run --rm` 則讓容器在主程式結束時自動刪除，適合跑一次就丟的指令，例如 `docker run --rm alpine:3.21 echo hello`。' },
      ],
    },
    {
      id: 'dkr03-s-exit', title: '結束碼：容器為什麼停下來',
      blocks: [
        { type: 'p', text: '容器的生命跟著它的主程式（容器裡的 PID 1）走：主程式結束，容器就進入 exited，主程式的結束碼（exit status）就是容器的結束碼，顯示在 `Exited (N)` 的括號裡，也可以用 `docker inspect -f "{{.State.ExitCode}}" 容器` 單獨取出。沒有 `-d` 的 `docker run` 會等容器結束，並把容器的結束碼當成自己的結束碼，所以接著執行 `echo $?` 也看得到它。常見的值：' },
        { type: 'table', head: ['結束碼', '意思', '常見的情況'], rows: [
          ['0', '正常結束', '一次性的工作做完了；伺服器收到停止訊號後正常關閉'],
          ['1（以及程式自訂的其他值，例如 2、3）', '程式自己回報失敗；值的意義由程式決定', '`false`、腳本裡的錯誤、程式捕捉到例外後退出'],
          ['125', '`docker run` 本身失敗，容器的程式沒有執行', '名稱衝突、不認得的選項、找不到 Image'],
          ['126', '找到了指令但無法執行', '檔案沒有執行權限'],
          ['127', '找不到指令', 'Image 裡沒有這個執行檔，或 `sh -c` 裡打錯指令名稱'],
          ['137', '128 + 9：被 SIGKILL 強制結束', '`docker stop` 等不到程式結束、改送 SIGKILL；記憶體不足被核心結束（DKR13）'],
          ['143', '128 + 15：被 SIGTERM 結束，程式沒有自己處理這個訊號', '不是 PID 1 的程式收到 SIGTERM 時的預設行為'],
        ] },
        { type: 'p', text: '大於 128 的結束碼表示「被訊號結束」，減去 128 就是訊號編號：9 是 SIGKILL，15 是 SIGTERM。`docker stop` 的流程是：先送停止訊號給容器的 PID 1（預設 SIGTERM；Image 可以用 STOPSIGNAL 指定別的，例如官方 nginx Image 用 SIGQUIT 讓 nginx 優雅關閉），等待寬限期（預設 10 秒），程式還沒結束就送 SIGKILL。' },
        { type: 'p', text: '137 常出現在 `sleep infinity` 這類容器上，原因在 PID 1 的特殊規則：Linux 核心不會替一個 PID 命名空間（namespace）裡的 PID 1 執行訊號的預設動作，除非程式自己安裝了處理函式。nginx、redis 這類伺服器會處理停止訊號，收到後關閉連線、以 0 結束；`sleep` 沒有處理 SIGTERM，當它是 PID 1 時就等於忽略了這個訊號，於是 `docker stop` 要等滿 10 秒才用 SIGKILL 結束它，結束碼是 137。真實的主機上你會感覺到這 10 秒的停頓；模擬環境不讓時鐘前進，所以 `Exited (137) Less than a second ago`。' },
        { type: 'example', id: 'dkr03-exit-codes' },
        { type: 'p', text: 'once 的 `echo done` 印完就結束（0）；check 的 `false` 沒有輸出、以 1 結束，`docker run` 把 1 當成自己的結束碼，所以 `echo $?` 印出 1。web-a 的 nginx 處理了停止訊號、以 0 結束；ticker 的 `sleep infinity` 忽略 SIGTERM，被 SIGKILL 結束而是 137。draft 從沒啟動過，仍然是 Created，沒有結束碼可言。' },
        { type: 'callout', tone: 'warning', title: 'Exited (137) 不等於記憶體不足', text: '137 只說明程式被 SIGKILL 結束，至少有三種來源：`docker stop` 的寬限期到了（最常見，例如 PID 1 不處理 SIGTERM）、有人執行了 `docker kill`、程式超過記憶體限制被核心結束。看到 137 先回想有沒有人 stop 過它，再看 `docker inspect -f "{{.State.OOMKilled}}" 容器` 是否為 true；記憶體限制與 OOMKilled 在 DKR13 才會詳談。另一個常見的混淆是 `echo $?`：它印的是「上一個指令」的結束碼，`docker logs` 或 `docker ps` 成功執行就是 0，和容器的結束碼無關。' },
      ],
    },
    {
      id: 'dkr03-s-layer', title: '可寫層與日誌：資料什麼時候會消失',
      blocks: [
        { type: 'p', text: '容器的可寫層屬於容器本身，不屬於它裡面正在執行的程式。所以只要容器還存在，可寫層就在：`docker stop` 只是結束主程式，`docker start` 在同一個容器、同一層可寫層上再執行一次主程式，之前寫入的檔案都還在。只有 `docker rm` 刪除容器時，可寫層才跟著刪除。日誌也一樣：Docker 把主程式寫到標準輸出與標準錯誤的內容存成這個容器的日誌（預設的 json-file 驅動），stop 之後 `docker logs` 照樣讀得到，start 之後新的輸出接在後面，rm 之後就沒了。' },
        { type: 'example', id: 'dkr03-writable-layer' },
        { type: 'p', text: '`note.txt` 寫在 web-a 的可寫層：`ls` 看到它和 Image 原有的 50x.html、index.html 並列，stop 再 start 之後 `cat` 仍然讀得到。`docker logs web-a 2>/dev/null` 只留下標準輸出，兩次啟動各留下兩行 entrypoint 的訊息（nginx 自己的 `[notice]` 行寫在標準錯誤，被 `2>/dev/null` 丟掉了）。`docker rm -f web-a` 之後日誌讀不到了；用同樣的名字 web-a 重建的是一個全新的容器（ID 不同），它的可寫層是空的，`note.txt` 不存在。最後用 `--rm` 執行一個一次性的容器看 Image 本身：裡面只有原本的兩個檔案，從頭到尾沒有被改過。' },
        { type: 'table', head: ['操作', '主程式', '可寫層的檔案', '日誌', '容器 ID'], rows: [
          ['`docker stop`', '結束（exited）', '保留', '保留', '不變'],
          ['`docker start`', '在同一個容器裡再執行', '保留（接著用）', '保留，新的輸出接在後面', '不變'],
          ['`docker restart`', '先結束再執行', '保留', '保留並累積', '不變'],
          ['`docker rm`（或 `rm -f`）', '（先被結束）', '刪除', '刪除', '不再存在'],
          ['`docker rm` 後再 `docker run --name` 同名', '新的主程式', '全新的空可寫層', '全新的日誌', '新的 ID'],
        ] },
        { type: 'callout', tone: 'warning', title: '「停掉沒事」不代表「重建沒事」', text: '很多人以為容器停止時資料就會消失，其實 stop 與 start 都不會動可寫層；真正讓資料消失的是 rm。反過來，升級版本、改設定時常見的做法是「刪除舊容器、用新 Image 建立同名的新容器」，這時可寫層裡的資料一定會消失，名字相同也沒有用。所以重要的資料（資料庫的檔案、使用者上傳的檔案）不能只放在容器的可寫層，要放在容器之外的 Volume 或 bind mount，DKR07 會學怎麼做。' },
        { type: 'p', text: '可寫層也會占用主機的磁碟（在 `/var/lib/docker` 底下）。長期執行、不斷寫入暫存檔或日誌檔的容器，可寫層會越來越大；停止的容器雖然不再執行，可寫層與日誌仍然占著空間，直到它被刪除。這就是下一節要清理的東西。' },
      ],
    },
    {
      id: 'dkr03-s-cleanup', title: '清理：docker rm、docker rmi 與 docker container prune',
      blocks: [
        { type: 'p', text: '一台用了一陣子的 Docker 主機，常會累積一堆跑完就結束的容器，以及不再使用的 Image。清理的工具：' },
        { type: 'table', head: ['指令', '做什麼', '注意'], rows: [
          ['`docker rm 容器…`', '刪除停止（created 或 exited）的容器，連同可寫層與日誌', '執行中的容器要先 `docker stop`，或用 `docker rm -f`（先強制結束再刪除）'],
          ['`docker rmi Image…`', '移除 Image 的標籤；沒有其他標籤時刪除 Image 與它的層（印出 `Untagged:` 與 `Deleted:`）', '任何容器（包括停止的、從未啟動的）還在使用它時拒絕：`conflict: unable to remove repository reference … (must force)`'],
          ['`docker container prune`', '刪除所有不在執行中的容器（exited 與 created），印出刪除的 ID 與回收的空間', '會先問 `[y/N]`；腳本裡用 `-f` 跳過確認；執行中的容器不受影響'],
          ['`docker rmi -f Image`', '只有停止（或從未啟動）的容器使用時，照樣刪除 Image 與它的層；有執行中的容器使用時只移除標籤，Image 留在磁碟上（`<none>`）', '停止的容器不會被刪除，卻指向一個已經不存在的 Image，`docker ps -a` 的 IMAGE 欄改顯示 Image ID'],
        ] },
        { type: 'p', text: '順序很重要：Image 被容器使用時刪不掉，所以先清容器、再刪 Image。容易忽略的是「使用」包括所有還存在的容器，不只執行中的：一個停止很久、甚至從未啟動過的 created 容器，都會讓 `docker rmi` 拒絕。下面回到 ship-01 的初始狀態，清掉不需要的 redis:7.4 與 nginx:1.27：' },
        { type: 'example', id: 'dkr03-cleanup' },
        { type: 'p', text: 'redis:7.4 沒有任何容器使用，直接刪除：先 Untagged 標籤與 digest，再 Deleted Image 與它的每一層。nginx:1.27 被拒絕，錯誤訊息指出是容器 02f3ba6f50c3（也就是從未啟動的 draft）在使用它。`docker container prune` 不加 `-f` 會停在 `[y/N]` 的確認（模擬環境沒有鍵盤可以回答，也可以寫成 `echo y | docker container prune`）；加上 `-f` 之後刪除了 draft，執行中的 ticker 不受影響。這時 nginx:1.27 已經沒有容器使用，`docker rmi` 就成功了。' },
        { type: 'p', text: '`docker rmi -f` 看起來能繞過衝突，但它不會刪除容器。只有停止（或從未啟動）的容器使用這個 Image 時，`-f` 照樣把 Image 與它的層刪掉，那些容器卻還在，指向一個已經不存在的 Image，`docker ps -a` 的 IMAGE 欄從名稱變成一串 Image ID；有執行中的容器使用時，`-f` 只移除標籤，Image 留在磁碟上成為 `<none>`，空間沒有省下來。兩種情況都留下爛攤子，所以乾淨的順序仍然是先刪除那些容器，再刪除 Image。刪除前用 `docker ps -a --filter status=exited` 先看清楚會刪掉哪些容器，養成習慣比事後補救容易。' },
        { type: 'callout', tone: 'tip', title: '一次性的容器用 --rm', text: '跑一次就結束的工作（測試指令、轉檔、一次性的腳本）加上 `--rm`，容器結束就自動刪除，不會在主機上留下 exited 的容器。長期執行的服務則不要加，這樣它停止之後還能用 `docker logs` 看最後的輸出、用結束碼判斷原因。' },
      ],
    },
    {
      id: 'dkr03-s-predict', title: '在按下 Enter 之前預測結果',
      blocks: [
        { type: 'p', text: '把前面幾節合起來，就能在執行每個 Docker 操作之前預測容器的狀態，以及資料會不會留下。下表假設容器 web 由 nginx:1.27 建立：' },
        { type: 'table', head: ['目前狀態', '操作', '之後', '可寫層與日誌', 'Image'], rows: [
          ['（不存在）', '`docker run -d --name web nginx:1.27`', 'running', '新的、空的可寫層', '被 web 使用'],
          ['（不存在）', '`docker run --rm alpine:3.21 echo hi`', '執行完就刪除', '一起消失', '不變'],
          ['created', '`docker start web`', 'running', '保留', '被使用'],
          ['running', '`docker stop web`', 'exited（伺服器 0，忽略 SIGTERM 的 PID 1 是 137）', '保留', '被使用'],
          ['exited', '`docker start web`', 'running（同一個容器）', '保留，日誌往後加', '被使用'],
          ['running', '`docker rm web`', '不變（錯誤：container is running）', '保留', '被使用'],
          ['exited', '`docker rm web`', '刪除', '刪除', '不再被 web 使用'],
          ['created 或 exited', '`docker container prune -f`', '刪除', '刪除', '不再被 web 使用'],
          ['任何狀態（仍存在）', '`docker rmi nginx:1.27`', '不變（錯誤：conflict … must force）', '保留', '仍在'],
        ] },
        { type: 'p', text: '遇到不確定的情況，就用 `docker ps -a` 看所有容器的狀態，用 `docker inspect -f "{{.State.Status}} {{.State.ExitCode}}" 容器` 看單一容器的狀態與結束碼，用 `docker logs 容器` 看它最後說了什麼。這三個指令都只讀取資訊、不改變任何東西，是排查容器問題的第一步。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '本課的 docker 指令照 Docker CE 27.5.1 的輸出格式模擬。`docker create`、`docker kill`、`docker stop -t` 與 `docker ps -s`（顯示可寫層大小）不在這個階段；overlay2、命名空間與 cgroup 等核心機制只在課文說明。容器裡的程式不真正執行，nginx 日誌裡的時間是固定的文字，`docker stop` 的 10 秒寬限期也不讓時鐘前進。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'dkr03-q1', prompt: '你用 `docker run -d` 以 nginx:1.27 啟動了三個容器。接著執行 `docker images nginx`，會看到什麼？',
      options: ['三列 nginx:1.27，每個容器各複製了一份 Image', '一列 nginx:1.27；三個容器共用同一個唯讀的 Image，各自只多了一層可寫層', '沒有任何一列，Image 在建立容器時被用掉了', '要等三個容器都停止之後，Image 才會出現在清單上'],
      answer: 1,
      explanation: 'Image 是唯讀的範本，主機上只存一份；每個容器在它上面加一層自己的可寫層，所以 `docker images` 仍然只有一列、IMAGE ID 也不變。容器不會複製 Image，建立容器也不會用掉 Image；Image 的清單和容器在不在執行無關。',
    },
    {
      id: 'dkr03-q2', prompt: '容器 web 正在執行，你用 `docker exec web sh -c "echo hi > /tmp/a.txt"` 建立了一個檔案，接著執行 `docker stop web` 與 `docker start web`。`/tmp/a.txt` 現在如何？',
      options: ['不見了，因為停止容器會清空可寫層', '被寫回 nginx 的 Image，之後用同一個 Image 建立的新容器也看得到', '只有改用 `docker restart` 才會保留', '還在，因為 stop 只結束主程式，可寫層屬於容器，要到 `docker rm` 才刪除'],
      answer: 3,
      explanation: '可寫層屬於容器本身，stop 只結束主程式，start 在同一個容器、同一層可寫層上再執行，所以檔案還在。容器不會把變更寫回 Image（Image 是唯讀的）；stop 不會清空可寫層；restart 等於先 stop 再 start，和分開執行的結果相同。',
    },
    {
      id: 'dkr03-q3', prompt: '容器 ticker 執行的是 `sleep infinity`。`docker stop ticker` 之後，`docker ps -a` 顯示 `Exited (137)`。最合理的解釋是什麼？',
      options: ['sleep 是容器的 PID 1、沒有處理 SIGTERM，docker stop 等完寬限期後送出 SIGKILL，128 + 9 = 137', 'sleep 用光了容器的記憶體，被核心結束', 'Image 損壞，sleep 找不到執行檔', 'docker stop 失敗，容器其實還在執行'],
      answer: 0,
      explanation: '核心不替 PID 1 執行訊號的預設動作，sleep 又沒有處理 SIGTERM，所以 docker stop 等滿 10 秒後改送 SIGKILL，結束碼 128 + 9 = 137。137 只說明被 SIGKILL 結束，沒有證據指向記憶體不足；找不到執行檔是 127，而且容器根本不會啟動；Exited 表示容器已經停止，不是還在執行。',
    },
    {
      id: 'dkr03-q4', prompt: '`docker rmi python:3.12-slim` 回報 `conflict: unable to remove repository reference "python:3.12-slim" (must force) - container 370ea4d443ba is using its referenced image`，而 `docker ps` 沒有列出任何 python 的容器。要真正刪除這個 Image、回收空間，應該怎麼做？',
      options: ['改用 `docker rmi -f python:3.12-slim`，它會連同容器一起刪除', '重新開機，讓 daemon 忘記那個容器', '先用 `docker ps -a` 找出使用它的停止容器並刪除（例如 `docker container prune -f`），再執行 `docker rmi python:3.12-slim`', '等一段時間，停止的容器會自動釋放 Image'],
      answer: 2,
      explanation: '停止的容器仍然存在，也仍然使用它的 Image；`docker ps` 只列出執行中的，要 `docker ps -a` 才看得到。刪掉那些容器之後 rmi 就會成功並刪除各層。`rmi -f` 不會刪除容器：這裡只有停止的容器使用它，`-f` 會把 Image 刪掉，但 report-1 這些容器還在，指向一個已經不存在的 Image（有執行中的容器使用時，`-f` 則只移除標籤）；重新開機與等待都不會刪除容器。',
    },
    {
      id: 'dkr03-q5', prompt: 'draft 是用 `docker create` 建立、從未啟動過的容器（STATUS 是 `Created`）。執行 `docker container prune -f` 之後，draft 會怎樣？',
      options: ['保留，因為它從來沒有執行過，不算停止的容器', '變成 running，prune 會先啟動未啟動的容器', '保留，但它的可寫層被清空', '被刪除，因為 prune 刪除所有不在執行中的容器，created 也算'],
      answer: 3,
      explanation: '`docker container prune` 刪除所有不在執行中的容器，created 與 exited 都在內，所以從未啟動的 draft 也被刪除；它不會啟動任何容器。prune 刪除的是整個容器，可寫層與日誌一起消失，不會只清空可寫層而保留容器。',
    },
    {
      id: 'dkr03-q6', prompt: '下列哪一個操作之後，`docker logs web` 仍然讀得到 web 之前的輸出？',
      options: ['`docker stop web` 之後', '`docker rm -f web` 之後', '`docker rm web` 再用 `docker run --name web` 重建同名容器之後', '`docker stop web` 再 `docker container prune -f` 之後'],
      answer: 0,
      explanation: '日誌和可寫層一樣屬於容器，stop 只結束主程式，日誌還在。rm -f 刪除了容器，日誌一起消失；同名重建的是 ID 不同的新容器，日誌從頭開始；停止之後 prune 會刪除這個容器，日誌也就沒了。',
    },
    {
      id: 'dkr03-q7', prompt: '你執行 `docker run --name check alpine:3.21 false`，沒有任何輸出；接著 `docker ps` 也找不到 check。最可能的原因是什麼？',
      options: ['check 因為沒有輸出而被自動刪除了', 'alpine 的 Image 裡沒有 false，容器沒有建立成功', '`false` 立刻以結束碼 1 結束，check 已經是 exited；`docker ps` 只列出執行中的容器，要用 `docker ps -a` 才看得到', '容器在背景執行，要等幾秒才會出現在 docker ps'],
      answer: 2,
      explanation: '容器跟著主程式結束，false 立刻以 1 結束，check 進入 exited，而 docker ps 只列 running 的容器。沒有加 `--rm` 的容器不會自動刪除；找不到執行檔會得到 127 與錯誤訊息，而不是安靜地結束；沒有 `-d` 的 docker run 會等容器結束，也不是在背景執行。',
    },
  ],
  terminal: {
    machines: [lab, tidy, ops],
    examples: [
      {
        id: 'dkr03-one-image', title: '一個 Image，兩個 Container', machine: 'dkr03-lab',
        description: '先看本機有哪些 Image 與 Container，再由 nginx:1.27 啟動 web-a 與 web-b：Image 仍然只有一個，容器各有自己的 ID 與主機名稱。',
        steps: [
          { command: 'docker images', output: 'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nredis        7.4       cd9ffb7978f9   12 days ago   117MB\nnginx        1.27      ec863f3501ad   2 weeks ago   192MB\nalpine       3.21      62550e7b9f25   6 weeks ago   7.83MB' },
          { command: 'docker ps -a', output: 'CONTAINER ID   IMAGE         COMMAND                  CREATED          STATUS          PORTS     NAMES\n02f3ba6f50c3   nginx:1.27    "/docker-entrypoint.…"   20 minutes ago   Created                   draft\n5d1de03923bc   alpine:3.21   "sleep infinity"         30 minutes ago   Up 30 minutes             ticker' },
          { command: 'docker run -d --name web-a nginx:1.27', output: '977f8754885e4d8d1b76266ec439909e8f9a63ef77fdde1a0bfe7f2ee043e060' },
          { command: 'docker run -d --name web-b nginx:1.27', output: 'b32e905159e97bc5c2bb8413d5f758a75af5fd0d1c4098ef1358064a2f695f33' },
          { command: 'docker ps', output: 'CONTAINER ID   IMAGE         COMMAND                  CREATED                  STATUS                  PORTS     NAMES\nb32e905159e9   nginx:1.27    "/docker-entrypoint.…"   Less than a second ago   Up Less than a second   80/tcp    web-b\n977f8754885e   nginx:1.27    "/docker-entrypoint.…"   Less than a second ago   Up Less than a second   80/tcp    web-a\n5d1de03923bc   alpine:3.21   "sleep infinity"         30 minutes ago           Up 30 minutes                     ticker' },
          { command: 'docker images nginx', output: 'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nnginx        1.27      ec863f3501ad   2 weeks ago   192MB' },
          { command: 'docker exec web-a hostname', output: '977f8754885e' },
          { command: 'docker exec web-b hostname', output: 'b32e905159e9' },
        ],
      },
      {
        id: 'dkr03-states', title: '從 created 走到刪除', machine: 'dkr03-lab',
        description: '同事用 docker create 建立、還沒啟動的 draft：start 讓它執行，stop 讓它結束，rm 之後 daemon 再也找不到它。',
        steps: [
          { command: 'docker ps -a --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}"', output: 'NAMES     IMAGE         STATUS\ndraft     nginx:1.27    Created\nticker    alpine:3.21   Up 30 minutes' },
          { command: 'docker inspect -f "{{.State.Status}}" draft', output: 'created' },
          { command: 'docker start draft', output: 'draft' },
          { command: 'docker inspect -f "{{.State.Status}} {{.State.StartedAt}}" draft', output: 'running 2026-11-22T10:00:00Z' },
          { command: 'docker stop draft', output: 'draft' },
          { command: 'docker inspect -f "{{.State.Status}} {{.State.ExitCode}}" draft', output: 'exited 0' },
          { command: 'docker rm draft', output: 'draft' },
          { command: 'docker inspect draft', output: 'Error: No such object: draft' },
        ],
      },
      {
        id: 'dkr03-exit-codes', title: '結束碼：0、1 與 137', machine: 'dkr03-lab',
        description: '程式正常結束是 0、回報失敗是 1；docker stop 讓處理停止訊號的 nginx 以 0 結束，忽略 SIGTERM 的 sleep 被 SIGKILL 強制結束而是 137。',
        steps: [
          { command: 'docker run --name once alpine:3.21 echo done', output: 'done' },
          { command: 'docker run --name check alpine:3.21 false', output: '' },
          { command: 'echo $?', output: '1' },
          { command: 'docker run -d --name web-a nginx:1.27', output: '97a0c77eaa1456e954127ddebc95d9b2b7e458e8e4c0d374b19c47f5f4bfcb97' },
          { command: 'docker stop web-a ticker', output: 'web-a\nticker' },
          { command: 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"', output: 'NAMES     STATUS\nweb-a     Exited (0) Less than a second ago\ncheck     Exited (1) Less than a second ago\nonce      Exited (0) Less than a second ago\ndraft     Created\nticker    Exited (137) Less than a second ago' },
          { command: 'docker inspect -f "{{.State.ExitCode}}" ticker', output: '137' },
        ],
      },
      {
        id: 'dkr03-writable-layer', title: '可寫層撐過 stop，撐不過 rm', machine: 'dkr03-lab',
        description: '在 web-a 裡寫一個檔案，停止再啟動之後還在，日誌也累積了兩次啟動；刪除容器再用同名重建，檔案與日誌都不見了，Image 本身從頭到尾沒有改變。',
        steps: [
          { command: 'docker run -d --name web-a nginx:1.27', output: '977f8754885e4d8d1b76266ec439909e8f9a63ef77fdde1a0bfe7f2ee043e060' },
          { command: 'docker exec web-a sh -c "echo \'draft v2\' > /usr/share/nginx/html/note.txt"', output: '' },
          { command: 'docker exec web-a ls /usr/share/nginx/html', output: '50x.html\nindex.html\nnote.txt' },
          { command: 'docker stop web-a', output: 'web-a' },
          { command: 'docker start web-a', output: 'web-a' },
          { command: 'docker exec web-a cat /usr/share/nginx/html/note.txt', output: 'draft v2' },
          { command: 'docker logs web-a 2>/dev/null', output: '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration\n/docker-entrypoint.sh: Configuration complete; ready for start up\n/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration\n/docker-entrypoint.sh: Configuration complete; ready for start up' },
          { command: 'docker rm -f web-a', output: 'web-a' },
          { command: 'docker logs web-a', output: 'Error response from daemon: No such container: web-a' },
          { command: 'docker run -d --name web-a nginx:1.27', output: '0e718b2ec520cf104bd91b32a51f54e56d313dcc05dcc5afd4ecc0b83a0a5358' },
          { command: 'docker exec web-a cat /usr/share/nginx/html/note.txt', output: 'cat: /usr/share/nginx/html/note.txt: No such file or directory' },
          { command: 'docker run --rm nginx:1.27 ls /usr/share/nginx/html', output: '50x.html\nindex.html' },
        ],
      },
      {
        id: 'dkr03-cleanup', title: '刪除 Image 前先處理容器', machine: 'dkr03-lab',
        description: '沒有容器使用的 redis:7.4 可以直接刪除；nginx:1.27 被從未啟動過的 draft 使用，要先用 docker container prune 清掉停止的容器。',
        steps: [
          { command: 'docker rmi redis:7.4', output: 'Untagged: redis:7.4\nUntagged: redis@sha256:a73ecd0338576ee75786d737ae9ad564670a95fff2b0b2f7b132382f7f83825b\nDeleted: sha256:cd9ffb7978f937f87420b8c843a9b0b8ec8d791931e745c37f3620d43bae9bf5\nDeleted: sha256:2f846fd69764d69bea128070e4bfdd4b229f02d878774e2971cc7c0c6bc1c745\nDeleted: sha256:c56c8c583eed007171cddd64e7524cb76391888e2ff03841bb9fb25b99b566a6\nDeleted: sha256:ef8797c252e6ed4f8c2ac8f09357ede2d285d62dcec0c21c740af5505b8be29b\nDeleted: sha256:44960b606d1856ff9cdeb13a176b5e5a7f6ae924a3ff31a940cf5a6e0d8e9b16\nDeleted: sha256:b3f7359147b0fa6e38194a3e615a43a971f041a7ada0cb7b7abbad800fb0a19f\nDeleted: sha256:ee113b1134ee144bbb388818030dec1f67308f848098abfa8e51df2b710ba6bd' },
          { command: 'docker rmi nginx:1.27', output: 'Error response from daemon: conflict: unable to remove repository reference "nginx:1.27" (must force) - container 02f3ba6f50c3 is using its referenced image ec863f3501ad' },
          { command: 'docker container prune', output: 'WARNING! This will remove all stopped containers.\nAre you sure you want to continue? [y/N] \n（模擬環境沒有鍵盤可以回答；請加 -f，或寫成 echo y | docker container prune）' },
          { command: 'docker container prune -f', output: 'Deleted Containers:\n02f3ba6f50c3e6a6e95d5fdd1e20494e2624eaefd1963428299747567cd80a46\n\nTotal reclaimed space: 0B' },
          { command: 'docker rmi nginx:1.27', output: 'Untagged: nginx:1.27\nUntagged: nginx@sha256:7026a3599da8c8b94bbd5673cc251297a41fde09aeba27312571c77785b9ddcd\nDeleted: sha256:ec863f3501ad0c7269f1eb8028b8057a35d77d9ed1cce61fe3cb3a2227535d76\nDeleted: sha256:a2c519d575bf653a38153ecba8589c23cb567532eb469f0c372af0664ec1799e\nDeleted: sha256:52068adf25b06a55c6f10ea9ec36b4ee4fca5ddde8310eca82a62de84cfc3444\nDeleted: sha256:e14d9f9b8ed9e885ba37baa58e6bd3b57dfe305aa822a531cfb4f051879d7e8e\nDeleted: sha256:62c47e55d26aa39cc73dd5a1e96ef646472047d02511772ac00b3198d6f7936e\nDeleted: sha256:9b1b9827186aac60e7fdf35edc523d6bcee7ca7eb84a578e527894d599efd41e\nDeleted: sha256:0b7aaf81c426647e5b420c7a8d9ce0f5b6c61c404b2e804b0b4a3e143cec03c8\nDeleted: sha256:473c1ae759f98276c970d7eb2d901ace22fbaaf66e94ecc6e9c0000ce4c24ebb' },
          { command: 'docker images', output: 'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nalpine       3.21      62550e7b9f25   6 weeks ago   7.83MB' },
          { command: 'docker ps -a', output: 'CONTAINER ID   IMAGE         COMMAND            CREATED          STATUS          PORTS     NAMES\n5d1de03923bc   alpine:3.21   "sleep infinity"   30 minutes ago   Up 30 minutes             ticker' },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr03-two-from-one', title: '同一個 Image 的兩個容器', machine: 'dkr03-lab',
        statement: '用 nginx:1.27 在背景啟動兩個容器，分別命名為 web-a 與 web-b；然後只停止 web-b，讓 web-a 繼續執行。主機上原本的 draft（Created）與 ticker（執行中）保持原樣。',
        checks: [
          { kind: 'container', name: 'web-a', state: 'running', image: 'nginx:1.27' },
          { kind: 'container', name: 'web-b', state: 'exited', image: 'nginx:1.27', exitCode: 0 },
          { kind: 'container', name: 'ticker', state: 'running' },
          { kind: 'container', name: 'draft', state: 'created' },
        ],
        solution: ['docker run -d --name web-a nginx:1.27', 'docker run -d --name web-b nginx:1.27', 'docker stop web-b', 'docker ps -a'],
        mistakes: [
          { commands: ['docker run -d --name web-a nginx:1.27', 'docker run -d --name web-b nginx:1.27', 'docker stop web-a'], why: '停錯了容器：web-a 變成 exited，web-b 反而還在執行。' },
          { commands: ['docker run -d --name web-a nginx:1.27', 'docker run -d --name web-b nginx:1.27', 'docker rm -f web-b'], why: '`docker rm -f` 是刪除，不是停止：web-b 連同可寫層與日誌都不存在了，題目要的是 exited 的 web-b。' },
          { commands: ['docker run -d --name web-a nginx:1.27', 'docker run -d --name web-b alpine:3.21', 'docker stop web-b'], why: 'web-b 用錯了 Image：alpine:3.21 的預設指令是沒有 -i 的 sh，一啟動就結束；它也不是由 nginx:1.27 建立的。' },
          { commands: ['docker run -d --name web-a nginx:1.27', 'docker run -d --name web-b nginx:1.27', 'docker stop $(docker ps -q)'], why: '`docker ps -q` 列出所有執行中的容器，結果 web-a 與 ticker 也一起被停止了。' },
        ],
        hints: [
          '`docker run -d --name 名稱 Image` 在背景建立並啟動一個容器；同一個 Image 可以執行兩次，只要名稱不同。',
          '`docker stop 名稱` 只停止你指定的容器。',
          '最後用 `docker ps -a` 確認：web-a 是 Up、web-b 是 Exited (0)，draft 與 ticker 沒有變。',
        ],
        explanation: '兩次 `docker run -d --name … nginx:1.27` 由同一個 Image 建立了兩個容器，各有自己的 ID 與可寫層，Image 仍然只有一份。`docker stop web-b` 讓 web-b 的 nginx 收到停止訊號並正常結束，所以是 Exited (0)；web-a 不受影響、繼續執行。stop 只結束主程式，web-b 仍然存在，之後可以用 `docker start web-b` 再啟動同一個容器；用 rm 就回不來了。',
      },
      {
        id: 'dkr03-restart-toolbox', title: '讓停止的容器帶著資料回來', machine: 'dkr03-ops',
        statement: 'toolbox 是值班同事放交接筆記的容器，平常以 `sleep infinity` 一直執行，方便用 `docker exec` 進去查東西；昨晚主機維護時它被停止了（Exited (137)）。請讓「同一個」toolbox 容器重新執行（不要刪除重建），再從容器裡印出 `/root/handover.txt` 的內容。檢查時，你的指令也會在另一份交接筆記上重新執行一次，所以內容要從容器裡讀出來。',
        checks: [
          { kind: 'container', name: 'toolbox', state: 'running', image: 'alpine:3.21' },
          { kind: 'output', fromCommand: '^docker (container )?exec ' },
        ],
        solution: ['docker ps -a', 'docker start toolbox', 'docker exec toolbox cat /root/handover.txt'],
        mistakes: [
          { commands: ['docker exec toolbox cat /root/handover.txt'], why: '容器還是 exited：`docker exec` 只能在執行中的容器裡執行，得到 `container … is not running`。' },
          { commands: ['docker rm toolbox', 'docker run -d --name toolbox alpine:3.21 sleep infinity', 'docker exec toolbox cat /root/handover.txt'], why: '刪除再重建：同名的新容器有全新、空的可寫層，交接筆記跟著舊容器一起消失了（`No such file or directory`）。' },
          { commands: ['docker run -d --name toolbox2 alpine:3.21 sleep infinity', 'docker exec toolbox2 cat /root/handover.txt'], why: '另外建立的 toolbox2 是由 Image 建立的新容器，Image 裡沒有交接筆記；原本的 toolbox 也還停著。' },
          { commands: ['docker start toolbox', "echo '交接：週四 22:00 更新 nginx，先通知客服'"], why: '用 echo 打出筆記內容，不是從容器裡讀出來的；換一份筆記就對不上了。' },
        ],
        variants: [{ label: '另一份交接筆記', files: [], docker: OPS_OTHER_NOTE }],
        hints: [
          '`docker ps -a` 看 toolbox 的狀態：Exited 的容器仍然存在，可寫層也還在。',
          '`docker start 容器` 在同一個容器上再執行它的指令（這裡是 `sleep infinity`）。',
          '容器執行之後，用 `docker exec toolbox cat /root/handover.txt` 讀檔案。',
        ],
        explanation: 'Exited (137) 表示 toolbox 的 `sleep infinity` 在維護時被 SIGKILL 結束，但容器本身沒有被刪除，交接筆記還在它的可寫層裡。`docker start toolbox` 讓同一個容器再執行 `sleep infinity`（STATUS 回到 Up），接著 `docker exec toolbox cat /root/handover.txt` 就讀得到筆記。若刪除再用同名重建，新容器的可寫層是空的，筆記就永遠消失了：這正是重要資料不能只放在可寫層的原因。',
      },
      {
        id: 'dkr03-tidy-up', title: '清理跑了一週的主機', machine: 'dkr03-tidy',
        statement: 'ship-01 跑了一週的報表工作，留下好幾個停止的容器，只有它們使用的 python:3.12-slim 也占了 125MB。請刪除所有停止的容器，並刪除 python:3.12-slim 這個 Image；正在執行的網站容器 shop-web，以及 nginx:1.27 與 alpine:3.21 這兩個 Image 都要留著。',
        checks: [
          { kind: 'container', name: 'report-1', absent: true },
          { kind: 'container', name: 'report-2', absent: true },
          { kind: 'container', name: 'shell-test', absent: true },
          { kind: 'image', name: 'python:3.12-slim', absent: true },
          { kind: 'container', name: 'shop-web', state: 'running', image: 'nginx:1.27' },
          { kind: 'image', name: 'nginx:1.27' },
          { kind: 'image', name: 'alpine:3.21' },
        ],
        solution: ['docker ps -a --filter status=exited', 'docker container prune -f', 'docker rmi python:3.12-slim', 'docker images'],
        mistakes: [
          { commands: ['docker rmi python:3.12-slim'], why: '先刪 Image：report-1 與 report-2 雖然已經停止，仍然使用它，得到 `conflict: unable to remove repository reference … (must force)`。' },
          { commands: ['docker container prune', 'docker rmi python:3.12-slim'], why: '`docker container prune` 會先問 `[y/N]`，沒有回答就什麼都沒刪；容器還在，rmi 也就失敗了。' },
          { commands: ['docker container prune -f'], why: '只清了容器，忘了刪除 python:3.12-slim，125MB 還在磁碟上。' },
          { commands: ['docker rm -f $(docker ps -aq)', 'docker rmi python:3.12-slim'], why: '`docker ps -aq` 包含執行中的容器，`rm -f` 把正在服務的 shop-web 也刪掉了。' },
          { commands: ['docker rm report-1 report-2', 'docker rmi python:3.12-slim'], why: '只刪了報表的容器，忘了同樣停止的 shell-test。' },
          { commands: ['docker rmi -f python:3.12-slim'], why: '`rmi -f` 確實刪除了 python:3.12-slim（只有停止的容器使用它），但三個停止的容器都還在，report-1 與 report-2 還指向一個已經不存在的 Image；乾淨的順序是先刪容器、再刪 Image。' },
        ],
        hints: [
          '`docker ps -a --filter status=exited` 列出停止的容器，先確認會刪掉哪些。',
          '`docker container prune` 刪除所有不在執行中的容器；在不能互動回答的地方加 `-f`。',
          'Image 要等沒有任何容器使用它才能刪除，所以順序是先容器、後 Image。',
        ],
        explanation: '`docker ps -a --filter status=exited` 顯示三個停止的容器：report-1、report-2（使用 python:3.12-slim）與 shell-test（使用 alpine:3.21）。`docker container prune -f` 一次刪除它們，連同可寫層裡的報表檔案（Total reclaimed space 算的就是這些），執行中的 shop-web 不受影響。這時 python:3.12-slim 已經沒有容器使用，`docker rmi python:3.12-slim` 移除標籤並刪除它的每一層；alpine:3.21 雖然不再有容器使用，題目要求保留，所以不刪。',
      },
      {
        id: 'dkr03-exit-code', title: '查出備份工作的結束碼', machine: 'dkr03-ops',
        statement: 'nightly-backup 是每天凌晨 2 點執行一次的備份容器（Image 是 ship/backup-job:1.4），今天執行完就結束了。值班交接需要它的結束碼：請用 Docker 指令查出來，印出只有結束碼數字的一行（例如 `0`）。檢查時，你的指令也會在另一個晚上的結果上重新執行一次，所以要查，不能猜。',
        checks: [{ kind: 'output', fromCommand: '^docker ' }],
        solution: ['docker ps -a --filter name=nightly-backup', 'docker inspect -f "{{.State.ExitCode}}" nightly-backup'],
        mistakes: [
          { commands: ['echo 3'], why: '照著 `docker ps -a` 的 `Exited (3)` 用 echo 打出來，不是 Docker 指令印出的；另一個晚上的結果不同就錯了。' },
          { commands: ['docker logs nightly-backup', 'echo $?'], why: '`echo $?` 印的是上一個指令 `docker logs` 的結束碼（成功就是 0），不是容器的結束碼。' },
          { commands: ['docker inspect -f "{{.State.Status}}" nightly-backup'], why: '`.State.Status` 是狀態（exited），結束碼在 `.State.ExitCode`。' },
          { commands: ['docker ps -a --filter name=nightly-backup --format "{{.Status}}"'], why: '`{{.Status}}` 印出整段 `Exited (3) 8 hours ago`，題目要的是只有數字的一行。' },
        ],
        variants: [{ label: '另一個晚上：/backup 無法寫入', files: [], docker: OPS_READONLY }],
        hints: [
          '`docker ps -a` 的 STATUS 欄 `Exited (N)` 括號裡就是結束碼，但它和其他文字在同一欄。',
          '`docker inspect -f` 可以只取出一個欄位：結束碼在 `{{.State.ExitCode}}`。',
          '想知道為什麼是這個數字，用 `docker logs nightly-backup` 看它最後印了什麼。',
        ],
        explanation: '`docker inspect -f "{{.State.ExitCode}}" nightly-backup` 只印出容器的結束碼。這個晚上是 3：`docker logs nightly-backup` 顯示 `/data/orders.db is locked by another process`，備份腳本以 3 回報失敗；另一個晚上是 1（`/backup` 無法寫入）。結束碼的意義由程式決定，大於 128 才表示被訊號結束（例如 137 是 SIGKILL）。不要用 `docker start` 再跑一次來看結果，那會真的再執行一次備份。',
      },
    ],
  },
};

import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalContainer, TerminalDocker, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

/*
 * DKR04 Docker CLI Essentials (DKR-1, terminal-sim). A terminal lesson on the containers profile (engine stage E20): docker
 * run's options (-d, --name, -p host:container, -e, --rm, -it and the interactive case, -w; options before the image, a
 * command after it replaces CMD; forgetting -d), publishing ports (the container's own network namespace and the default
 * bridge as text, docker-proxy on the host port seen with ss -tlnp, curl through the host port, the access log from
 * 172.17.0.1, the reversed -p and curl-ing the container port, ports released when a container stops), docker ps's
 * columns, -a, -q, --filter status=/name= and --format, stop/start/rm, docker logs (--tail, -t, standard error), docker
 * exec (-w, missing executables, a stopped container), the common errors (name conflict, port already allocated, address
 * already in use, pull access denied, executable not found with 127; the Created container left behind) and docker
 * inspect -f, and a troubleshooting order. Machines: the Docker host pier-01 (user kai in the docker group; nginx, a local
 * shop-api and admin-ui image, alpine and ubuntu; api on 9000->3000, blog on 8081->80 with an access log, an exited
 * old-web) and the same host where the shop container failed to start on a taken 8080. Kernel mechanisms are text only.
 * The host, user, images other than the official nginx, alpine and ubuntu, and the sites are made up. Every transcript
 * output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const WELCOME = '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body><h1>Welcome to nginx!</h1></body>\n</html>\n';
/** What nginx prints when it starts (the time is fixed text: a container started now prints the machine's clock). */
const nginxStart = (time: string) => [
  '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
  '/docker-entrypoint.sh: Configuration complete; ready for start up',
  { text: `2026/11/22 ${time} [notice] 1#1: nginx/1.27.3`, stream: 2 as const },
  { text: `2026/11/22 ${time} [notice] 1#1: start worker processes`, stream: 2 as const },
];
const SHELL_TOOLS = ['ls', 'cat', 'echo', 'env', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'head', 'tail', 'grep', 'wc', 'hostname'];
const SHOP_CONFIG = '{\n  "listen": ":3000",\n  "database": "db.pier.internal:5432",\n  "currency": "TWD"\n}\n';

const IMAGES: TerminalImage[] = [
  {
    name: 'nginx', size: 191968432, created: '2026-11-05 09:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'],
    env: [PATH_ENV, 'NGINX_VERSION=1.27.3'], expose: [80], http: { port: 80, responder: 'nginx-site', accessLog: 'nginx' }, service: true, logs: nginxStart('10:00:00'), layers: 7, pulled: true,
    commands: [...SHELL_TOOLS, 'bash'],
    files: [{ path: '/usr/share/nginx/html/index.html', content: WELCOME }, { path: '/etc/nginx/conf.d/default.conf', content: 'server {\n    listen       80;\n    server_name  localhost;\n    root   /usr/share/nginx/html;\n}\n' }],
  },
  {
    name: 'pier/shop-api:1.4', size: 48213504, created: '2026-11-18 14:30:00', cmd: ['/app/shop-api'], workdir: '/app', env: [PATH_ENV, 'PORT=3000'], expose: [3000],
    http: { port: 3000, responder: 'shop-api' }, service: true, logs: ['shop-api 1.4.0 starting', 'listening on 0.0.0.0:3000'], layers: 4, pulled: true, registry: false,
    commands: SHELL_TOOLS, files: [{ path: '/app/shop-api', content: '' }, { path: '/app/config.json', content: SHOP_CONFIG }],
    osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n',
  },
  {
    name: 'pier/admin-ui:2.0', size: 31457280, created: '2026-11-12 03:00:00', cmd: ['/srv/admin-ui', '--port', '9000'], workdir: '/srv', env: [PATH_ENV], expose: [9000],
    http: { port: 9000, responder: 'admin-ui' }, service: true, logs: ['admin-ui 2.0.3 ready on :9000'], layers: 3, pulled: true, registry: false, commands: SHELL_TOOLS,
  },
  {
    name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1, commands: [...SHELL_TOOLS, 'ps'],
    osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n',
  },
  { name: 'ubuntu:24.04', size: 78118263, created: '2026-10-15 08:00:00', cmd: ['/bin/bash'], pulled: true, layers: 1, osRelease: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n' },
];

const access = (time: string, request: string, status: number, size: number, agent = 'curl/8.5.0') => `172.17.0.1 - - [22/Nov/2026:${time} +0000] "${request} HTTP/1.1" ${status} ${size} "-" "${agent}" "-"`;
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const blogLogs = (tail: (string | { text: string; stream: 2 })[]) => [
  ...nginxStart('08:30:01'),
  access('09:41:07', 'GET /', 200, 117, BROWSER),
  access('09:41:08', 'GET /favicon.ico', 404, 153, BROWSER),
  access('09:52:30', 'GET /', 200, 117),
  ...tail,
];
const notFound = (time: string, path: string) => ({ text: `2026/11/22 ${time} [error] 29#29: *7 open() "/usr/share/nginx/html${path}" failed (2: No such file or directory), client: 172.17.0.1, server: localhost, request: "GET ${path} HTTP/1.1", host: "localhost:8081"`, stream: 2 as const });

const API: TerminalContainer = { name: 'api', image: 'pier/shop-api:1.4', state: 'running', created: '2026-11-22 09:20:00', started: '2026-11-22 09:20:01', ports: ['9000:3000'] };
const BLOG: TerminalContainer = {
  name: 'blog', image: 'nginx', state: 'running', created: '2026-11-22 08:30:00', started: '2026-11-22 08:30:01', ports: ['8081:80'],
  logs: blogLogs([notFound('09:58:12', '/feed.xml'), access('09:58:12', 'GET /feed.xml', 404, 153, BROWSER)]),
};
const OLD_WEB: TerminalContainer = { name: 'old-web', image: 'nginx', state: 'exited', created: '2026-11-21 16:00:00', started: '2026-11-21 16:00:02', finished: '2026-11-21 18:30:00', exitCode: 0, ports: ['8080:80'] };

const pier = (id: string, title: string, docker: TerminalDocker): TerminalMachine => ({
  id, title, user: 'kai', host: 'pier-01', cwd: '/home/kai', profile: 'containers', now: '2026-11-22 10:00:00', boot: '2026-11-22 06:00:00',
  files: [dir('/home'), dir('/home/kai', 'kai', 0o750), file('/home/kai/todo.txt', '把商店 API 換到新的連接埠\n', 'kai')],
  accounts: { groups: [{ name: 'sudo', members: ['kai'] }, { name: 'docker', gid: 988, members: ['kai'] }] },
  responders: [
    { id: 'nginx-site', server: 'nginx/1.27.3', routes: [{ path: '/', body: WELCOME }] },
    { id: 'admin-ui', routes: [{ path: '/', body: '<h1>Pier 後台</h1>\n' }] },
    { id: 'shop-api', routes: [{ path: '/health', body: 'ok\n', type: 'text/plain' }, { path: '/api/items', body: '[{"id":1,"name":"帆布袋","price":390}]\n', type: 'application/json' }] },
  ],
  docker,
});

const MAIN = pier('dkr04-pier', 'pier-01（Docker 主機：api、blog 在執行）', { images: IMAGES, containers: [OLD_WEB, BLOG, API] });

// Exercise 2: shop failed to start (Created) because host port 8080 is taken: by the web container, or (variant) by a host program.
const SHOP_FAILED: TerminalContainer = { name: 'shop', image: 'pier/shop-api:1.4', state: 'created', created: '2026-11-22 09:59:30', ports: ['8080:3000'] };
const webOn = (port: number): TerminalContainer => ({ name: 'web', image: 'nginx', state: 'running', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:01', ports: [`${port}:80`] });
const CONFLICT = pier('dkr04-conflict', 'pier-01（shop 啟動失敗，停在 Created）', { images: IMAGES, containers: [webOn(8080), SHOP_FAILED] });


// Exercise 3: who publishes host port 9000? Other containers (an admin UI whose container port is 9000, a newer container first).
const FIND_ADMIN: TerminalDocker = { images: IMAGES, containers: [
  OLD_WEB, BLOG,
  { name: 'shop-v2', image: 'pier/shop-api:1.4', state: 'running', created: '2026-11-22 09:10:00', started: '2026-11-22 09:10:01', ports: ['9000:3000'] },
  { name: 'admin', image: 'pier/admin-ui:2.0', state: 'running', created: '2026-11-22 09:40:00', started: '2026-11-22 09:40:01', ports: ['9090:9000'] },
] };
const FIND_CART: TerminalDocker = { images: IMAGES, containers: [
  BLOG,
  { ...API, state: 'exited', finished: '2026-11-22 09:31:00', exitCode: 0 },
  { name: 'cart', image: 'pier/shop-api:1.4', state: 'running', created: '2026-11-22 09:32:00', started: '2026-11-22 09:32:01', ports: ['9000:3000'] },
] };

// Exercise 4: other last requests in blog's log.
const blogWith = (tail: (string | { text: string; stream: 2 })[]): TerminalDocker => ({ images: IMAGES, containers: [OLD_WEB, { ...BLOG, logs: blogLogs(tail) }, API] });
const FORBIDDEN = blogWith([
  { text: '2026/11/22 09:57:40 [error] 29#29: *6 directory index of "/usr/share/nginx/html/drafts/" is forbidden, client: 172.17.0.1, server: localhost, request: "GET /drafts/ HTTP/1.1", host: "localhost:8081"', stream: 2 },
  access('09:57:40', 'GET /drafts/', 403, 153, BROWSER),
]);
const NOT_ALLOWED = blogWith([notFound('09:55:02', '/feed.xml'), access('09:55:02', 'GET /feed.xml', 404, 153, BROWSER), access('09:59:21', 'POST /subscribe', 405, 157)]);

// Exercise 5: another database in api's writable layer.
const API_DB2: TerminalDocker = { images: IMAGES, containers: [OLD_WEB, BLOG, { ...API, files: [{ path: '/app/config.json', content: SHOP_CONFIG.replace('db.pier.internal:5432', 'db-replica.pier.internal:6432') }] }] };

export const DKR04: LessonContent = {
  lessonId: 'DKR04',
  motivation: '上一課看懂了 Container 從建立、執行到刪除的生命週期；這一課把它變成每天在終端機上的動作。架一個網站，只要一行 `docker run -d --name web -p 8080:80 nginx`，但每個選項都有它的意思：少了 `-d`，終端機被容器的輸出占住；少了 `-p`，瀏覽器根本連不到；把 `-p 80:8080` 寫反，主機上有程式在監聽，卻得到空的回應。服務出問題時，`docker ps` 告訴你誰在執行、公開了哪些埠，`docker logs` 讓你看到程式印出的錯誤與存取紀錄，`docker exec` 讓你進到執行中的容器裡看設定檔，`docker inspect -f` 取出單一個欄位。這一課在一台 Docker 主機 pier-01 上，啟動、停止與刪除容器，用連接埠對應讓瀏覽器連進容器，並學會讀懂名稱衝突、連接埠被占用、找不到 Image 與找不到執行檔這幾個最常見的錯誤。',
  sections: [
    {
      id: 'dkr04-s-run', title: 'docker run 的選項',
      blocks: [
        { type: 'p', text: '`docker run` 一次做完兩件事：用 Image 建立一個 Container，再啟動它（本機沒有這個 Image 時，還會先拉取）。寫法是 `docker run [選項] IMAGE [指令 參數…]`。選項一定寫在 IMAGE 前面；IMAGE 後面的東西全部交給容器，取代 Image 預設的指令（CMD）。所以 `docker run alpine:3.21 echo hi` 在容器裡執行 `echo hi`，而 `docker run nginx -d` 裡的 `-d` 已經不是 docker 的選項，而是交給容器的指令。' },
        { type: 'table', head: ['選項', '意思', '什麼時候用'], rows: [
          ['`-d`（`--detach`）', '在背景執行：印出完整的 Container ID 就回到提示字元', '網站、API 這類一直執行的服務'],
          ['`--name 名稱`', '指定名稱；沒有指定時 Docker 自動取一個「形容詞_科學家」的名字', '之後用名稱操作它（`docker logs web`），名稱不能重複'],
          ['`-p 主機埠:容器埠`', '連接埠對應：主機的埠轉到容器的埠（下一節）', '要讓瀏覽器或其他機器連進來'],
          ['`-e 名稱=值`', '設定容器裡的環境變數，可以寫很多次', '傳設定給程式，例如 `-e APP_MODE=dev`'],
          ['`--rm`', '容器結束時自動刪除（連同可寫層與日誌）', '只執行一次的指令，避免留下一堆 Exited 的容器'],
          ['`-i`、`-t`（合寫 `-it`）', '`-i` 讓標準輸入保持開啟，`-t` 配一個虛擬終端機（TTY）', '在容器裡開一個互動式 Shell'],
          ['`-w 目錄`（`--workdir`）', '容器裡指令的工作目錄，取代 Image 設定的 WORKDIR', '指令要在某個目錄下執行'],
        ] },
        { type: 'p', text: '短選項可以合寫，`-dit` 等於 `-d -i -t`，`-p8080:80` 等於 `-p 8080:80`。互動的情況要多想一步：`docker run -it ubuntu:24.04` 讓你看到 `root@3f2a…:/#` 這樣的提示字元，因為 ubuntu 的預設指令是 bash，而這個 bash 就是容器的主程式（PID 1）。打 `exit` 結束 bash，主程式結束，容器就變成 Exited (0)。少了 `-i`，bash 的標準輸入沒有接上，一啟動就讀到結尾而結束；少了 `-t`，沒有終端機，看不到提示字元，也不能編輯指令列。想讓 Shell 留在背景，用 `-dit` 啟動，之後再用 `docker exec` 進去。' },
        { type: 'p', text: '忘了 `-d` 是最常見的小失誤：`docker run --name web nginx` 會把終端機接到容器的輸出上，nginx 的啟動訊息一行行印出來，提示字元卻不回來。真實的終端機按 Ctrl-C 時，docker 把訊號轉給容器的主程式，nginx 收到就結束，容器跟著停止。所以服務一律用 `-d` 啟動，要看輸出再用 `docker logs`。模擬環境沒有鍵盤也沒有 Ctrl-C：前景啟動的伺服器會留在背景繼續執行，`-it` 的 Shell 會立刻收到 exit，兩者都會印一行說明。' },
        { type: 'example', id: 'dkr04-run-options' },
        { type: 'p', text: '`--rm` 的兩個容器執行完就刪除了，所以最後的 `docker ps -a` 看不到它們。`env` 印出的 HOSTNAME 是容器 ID 的前 12 個字，`-e` 設定的 APP_MODE 也在裡面。`-it` 啟動的那個沒有指定名稱，Docker 自動取了 admiring_mccarthy，它的 Shell 已經結束（Exited (0)）；`-dit` 啟動的 box 還在執行，`docker exec` 才能在裡面讀 `/etc/os-release`。' },
      ],
    },
    {
      id: 'dkr04-s-ports', title: '連接埠對應：讓瀏覽器連到 Container',
      blocks: [
        { type: 'p', text: '每個 Container 有自己的網路命名空間（network namespace，核心的隔離機制）：自己的網路介面、自己的 IP 位址，也有自己的一套連接埠。預設的網路是 bridge：主機上有一個 docker0 介面（172.17.0.1），每個執行中的容器拿到 172.17.0.2、172.17.0.3 這樣的位址。nginx 在容器裡監聽的是「容器的 80 埠」，不是主機的 80 埠；外面的電腦也連不到 172.17 開頭的這個內部位址。所以要讓瀏覽器連進來，必須在 `docker run` 時用 `-p` 做連接埠對應。' },
        { type: 'p', text: '`-p 8080:80` 的意思是「主機的 8080 埠 → 容器的 80 埠」：冒號左邊是主機，右邊是容器。容器埠由 Image 裡的程式決定（nginx 是 80，本課的 shop-api 是 3000），主機埠由你挑一個沒有被占用的。同一台主機可以跑十個 nginx 容器，它們的容器埠都是 80，但主機埠必須各不相同。' },
        { type: 'table', head: ['寫法', '主機上誰在監聽', '誰連得到'], rows: [
          ['`-p 8080:80`', '0.0.0.0:8080 與 [::]:8080', '任何能連到這台主機的人：`http://主機:8080/`'],
          ['`-p 127.0.0.1:8080:80`', '只有 127.0.0.1:8080', '只有主機自己，例如前面還有一個反向代理'],
          ['`-p 80:8080`（寫反）', '主機的 80，轉到容器的 8080', '連得上主機的 80，但容器的 8080 沒有程式在聽，得到空的回應或連線被重設'],
          ['沒有 `-p`', '主機上沒有對應的埠', '外面連不到；只有主機本身（以及同一個網路上的其他容器）能用容器的 172.17 位址連'],
        ] },
        { type: 'p', text: '主機那一邊是誰在接連線？dockerd 為每個公開的埠啟動一個 docker-proxy 行程，它在主機埠監聽，把連線轉給容器的位址與容器埠。真實的 Docker 主要靠核心的 iptables（NAT）規則轉送封包，docker-proxy 負責規則處理不到的情況（例如連到 localhost）；模擬環境只模擬 docker-proxy。下面的紀錄在 pier-01 上啟動 nginx，再從主機用 `curl` 驗證：' },
        { type: 'example', id: 'dkr04-publish' },
        { type: 'p', text: '`docker ps` 的 PORTS 欄寫成 `0.0.0.0:8080->80/tcp, [::]:8080->80/tcp`：主機的 IPv4 與 IPv6 位址的 8080 都轉到容器的 80。`curl localhost:8080` 拿到 nginx 的歡迎頁，`curl localhost:80` 卻是 `(7) Failed to connect`：主機的 80 埠沒有任何程式在監聽，80 只是容器裡的埠。`sudo ss -tlnp` 在 8080 看到的是 docker-proxy，不是 nginx。最後一行是容器的存取日誌，來源位址是 bridge 的閘道 172.17.0.1：在容器看來，連線是從主機那一邊進來的。' },
        { type: 'callout', tone: 'warning', title: '主機埠在左、容器埠在右', text: '`-p 80:8080` 不是「把容器的 80 開到 8080」，而是主機的 80 轉到容器的 8080；nginx 在容器的 80 監聽，8080 沒有人，連線得到空的回應。另一個常見的誤會是驗證時連容器埠：`-p 8080:80` 之後該連的是 `curl localhost:8080`，`curl localhost:80` 連的是主機自己的 80 埠。記法：先寫「外面看到的」，再寫「程式真正聽的」。' },
        { type: 'p', text: '連接埠只屬於執行中的容器。容器停止時 docker-proxy 也跟著結束，主機埠立刻空出來；所以 pier-01 上 old-web 雖然當初公開過 8080，它已經停止，web 仍然可以用 8080。反過來，停止的容器再 `docker start` 時，如果那個主機埠已經被別人拿走，就會啟動失敗。' },
      ],
    },
    {
      id: 'dkr04-s-ps', title: 'docker ps：列出、過濾、停止與刪除',
      blocks: [
        { type: 'p', text: '`docker ps` 只列出執行中的容器，`-a` 連停止與建立失敗的也列出來，新的排在前面。每一欄的意思：' },
        { type: 'table', head: ['欄位', '內容'], rows: [
          ['CONTAINER ID', '容器 ID 的前 12 個字；指令裡寫 ID 的開頭幾個字或名稱都可以'],
          ['IMAGE', '建立它時打的 Image 名稱'],
          ['COMMAND', '主程式與參數（太長時截斷，以 … 結尾）'],
          ['CREATED', '多久以前建立'],
          ['STATUS', '`Up 39 minutes`（執行中）、`Exited (0) 16 hours ago`（括號裡是結束碼）、`Created`（建立了但沒有成功啟動）'],
          ['PORTS', '連接埠對應；停止的容器是空的'],
          ['NAMES', '容器名稱'],
        ] },
        { type: 'p', text: '容器多了以後，用選項縮小範圍：`-q` 只印 ID（方便交給其他指令）；`--filter status=exited`（也可以是 running、created）依狀態過濾；`--filter name=web` 列出名稱含有 web 的；`--format` 用 Go 的樣板語法只印想要的欄位，例如 `{{.Names}}`、`{{.Status}}`、`{{.Ports}}`、`{{.Image}}`、`{{.ID}}`，開頭寫 `table` 會加上標題列並對齊，`\\t` 是 Tab。真實的 Docker 還有 `--filter publish=8080`、`ancestor=nginx` 等條件；模擬環境只支援 status= 與 name=，其他的會說明不支援。' },
        { type: 'p', text: '生命週期的指令都接受名稱或 ID，可以一次寫好幾個：`docker stop` 先送 SIGTERM 讓主程式正常結束，等 10 秒還沒結束才送 SIGKILL；`docker start` 重新啟動同一個容器（同樣的 ID、名稱、連接埠設定與可寫層）；`docker restart` 是兩者連著做；`docker rm` 刪除停止的容器，執行中的要先 stop，或用 `docker rm -f` 強制刪除。' },
        { type: 'example', id: 'dkr04-ps' },
        { type: 'p', text: 'stop 之後 api 的 docker-proxy 也結束了，`curl` 的結束碼是 7（連不上）；start 之後同一個容器回來，ID 還是 841565e637e5。old-web 已經停止，`docker rm` 直接刪除；api 在執行，`docker rm` 被拒絕，錯誤訊息直接告訴你兩個選擇：先 stop，或強制刪除。' },
        { type: 'callout', tone: 'note', title: '停止的容器還占著名稱', text: '`docker ps` 看不到的容器不代表不存在。停止（Exited）或建立失敗（Created）的容器仍然保留它的名稱、日誌與可寫層，直到 `docker rm`。找不到的時候，先用 `docker ps -a`。' },
      ],
    },
    {
      id: 'dkr04-s-logs-exec', title: 'docker logs 與 docker exec',
      blocks: [
        { type: 'p', text: '容器的主程式印到標準輸出與標準錯誤的東西，Docker 都替你收起來（預設的 logging driver 是 json-file），`docker logs 容器` 把它們印出來：原本的標準輸出印到標準輸出、標準錯誤印到標準錯誤。官方 nginx Image 把存取日誌連到 /dev/stdout、錯誤日誌連到 /dev/stderr，所以 `2>/dev/null` 只留下存取紀錄。日誌在容器停止後還在，`docker rm` 之後才消失。' },
        { type: 'table', head: ['寫法', '作用'], rows: [
          ['`docker logs web`', '從頭印出全部的日誌'],
          ['`docker logs --tail 20 web`（`-n 20`）', '只印最後 20 行，找最近發生的事'],
          ['`docker logs -t web`', '每行前面加上 Docker 收到它的時間（UTC，RFC 3339 格式）'],
          ['`docker logs -f web`', '印完之後繼續等新的輸出（按 Ctrl-C 離開；模擬環境不等待）'],
          ['`docker logs web 2>/dev/null`', '只看標準輸出（nginx 的存取日誌）'],
        ] },
        { type: 'p', text: 'nginx 的一行存取日誌依序是：用戶端位址、-、登入的使用者（沒有時也是 -）、時間（含時區，中間有一個空白）、請求列（方法、路徑、HTTP 版本）、狀態碼、回應的位元組數、Referer、User-Agent。以空白切開時狀態碼是第 9 欄，所以 `docker logs --tail 1 web 2>/dev/null | cut -d " " -f 9` 印出最近一次請求的狀態碼。' },
        { type: 'p', text: '`docker exec 容器 指令` 在一個執行中的容器裡另外啟動一個行程：它看到的是容器的檔案系統、網路與環境變數，主程式照常執行。常見用法是讀容器裡的設定檔、確認環境變數，或用 `docker exec -it web bash` 開一個 Shell 進去看看（模擬環境沒有互動式 Shell，請直接寫要執行的指令）。`-w` 指定工作目錄，`-e` 加環境變數。停止的容器不能 exec；而精簡的 Image 常常沒有 ps、bash，甚至沒有 curl，這時錯誤是 `executable file not found in $PATH`，結束碼 127。' },
        { type: 'example', id: 'dkr04-logs-exec' },
        { type: 'p', text: '最後三行裡，標準錯誤那一行是 nginx 的錯誤日誌（找不到 /feed.xml），緊接著的存取日誌記錄了同一個請求的 404。api 的 Image 設定了 WORKDIR /app，所以 `ls` 與 `cat config.json` 都從 /app 開始；blog 用 `-w` 換到 /etc/nginx/conf.d。api 的 Image 沒有 ps，old-web 已經停止，兩個 exec 各自失敗，錯誤訊息說得很清楚。' },
        { type: 'callout', tone: 'tip', title: 'exec 的修改不會永久保存', text: '用 `docker exec` 改容器裡的檔案只會寫進這個容器的可寫層，`docker rm` 之後就不見了，用同一個 Image 重新建立的容器也不會有。exec 適合查看與臨時排查；要長久的改變，應該寫進 Image（DKR05 的 Dockerfile）或放在 Volume（DKR07）。' },
      ],
    },
    {
      id: 'dkr04-s-errors', title: '讀懂常見錯誤與 docker inspect -f',
      blocks: [
        { type: 'p', text: 'docker 的錯誤訊息很長，但結構固定：`docker: Error response from daemon: …` 表示 daemon（dockerd）拒絕了請求，重點在冒號後面那一句。`docker run` 自己的結束碼也有意思：125 是 Docker 這一邊的錯誤（名稱衝突、連接埠、找不到 Image），126 是容器裡的指令無法執行，127 是容器裡找不到這個指令；其他的值是容器主程式自己的結束碼。' },
        { type: 'table', head: ['錯誤的關鍵句', '原因', '怎麼修'], rows: [
          ['`Conflict. The container name "/web" is already in use`', '已經有同名的容器，停止的或建立失敗的也算', '`docker rm` 舊的，或換一個名稱'],
          ['`Bind for 0.0.0.0:8081 failed: port is already allocated`', '另一個執行中的容器已經公開了這個主機埠', '換一個沒有被占用的主機埠；容器埠不用改'],
          ['`Error starting userland proxy: listen tcp4 0.0.0.0:8080: bind: address already in use`', '主機上另一個程式（不是容器）在監聽這個埠', '`sudo ss -tlnp` 找出是誰，再決定換埠或停掉它'],
          ['`pull access denied for ngnix, repository does not exist or may require \'docker login\'`', 'Docker Hub 上沒有這個儲存庫：多半是名稱打錯，或是私有 Registry 還沒登入', '檢查拼字，`docker images` 看本機有哪些 Image'],
          ['`exec: "bash": executable file not found in $PATH`（127）', 'Image 裡沒有這個程式', '改用 Image 裡有的程式，例如 alpine 用 sh'],
        ] },
        { type: 'p', text: '注意連接埠與執行檔這兩種錯誤發生在「啟動」階段：容器已經建立了，只是沒有啟動成功，所以它留在 Created 狀態、占著名稱。修正選項之後用同一個名稱再 `docker run`，會變成名稱衝突；要先 `docker rm` 那個 Created 的容器。下面的紀錄依序重現這些錯誤：' },
        { type: 'example', id: 'dkr04-errors' },
        { type: 'p', text: 'old-web 早已停止，名稱仍然被占用；8081 被執行中的 blog 公開，web 停在 Created，刪掉之後才能重用 web 這個名稱。ngnix 是 nginx 的錯字，Docker Hub 沒有這個儲存庫。alpine 只有 sh 沒有 bash，`--rm` 讓失敗的容器自動刪除，`$?` 是 127。' },
        { type: 'p', text: '`docker inspect` 印出容器（或 Image）的完整設定與狀態，是很長的 JSON。`-f`（`--format`）用和 `docker ps --format` 一樣的 Go 樣板只取出需要的欄位：`{{.State.Status}}`（created、running、exited）、`{{.State.ExitCode}}`、`{{.State.StartedAt}}`、`{{.State.FinishedAt}}`、`{{.NetworkSettings.IPAddress}}`（bridge 上的位址）、`{{.Config.Image}}`、`{{.Config.Env}}`；`{{json .NetworkSettings.Ports}}` 把一整個欄位印成 JSON。寫腳本時它比解析 `docker ps` 的表格可靠得多。' },
      ],
    },
    {
      id: 'dkr04-s-checklist', title: '服務連不到時的檢查順序',
      blocks: [
        { type: 'p', text: '「容器啟動了，網頁卻打不開」是最常見的求救。依下面的順序，每一步都用指令的輸出證明，不要用猜的：' },
        { type: 'list', ordered: true, items: [
          '`docker ps -a`：容器在執行嗎？是 Exited 就先看 `docker logs` 找它結束的原因；是 Created 就是啟動失敗，回頭看 `docker run` 的錯誤。',
          '看 PORTS 欄：有沒有公開？主機埠與容器埠有沒有寫反？容器埠是不是程式真正監聽的埠？',
          '`sudo ss -tlnp`：主機埠上是 docker-proxy，還是另一個程式？',
          '`curl -v localhost:主機埠`：`(7) Failed to connect` 表示主機埠沒有人在聽（沒有公開、容器停了或埠寫錯）；`(52) Empty reply from server`（也可能是 `(56) Connection reset by peer`）表示連上了 docker-proxy，但容器埠沒有程式在聽。',
          '`docker logs --tail 20 容器`：程式自己有沒有印出錯誤；存取日誌裡有沒有你的請求、狀態碼是多少。',
          '`docker exec 容器 cat 設定檔`：程式讀到的設定是不是你以為的那一份。',
        ] },
        { type: 'table', head: ['看到的現象', '最可能的原因'], rows: [
          ['`curl` 得到 (7)，`docker ps` 沒有這個容器', '容器停止了，或從來沒有啟動成功（`docker ps -a`）'],
          ['`curl` 得到 (7)，容器在執行但 PORTS 是空的或只寫 `80/tcp`', '啟動時沒有加 `-p`；要刪掉重建，`-p` 不能事後加'],
          ['`curl` 得到 (52)，PORTS 是 `0.0.0.0:8080->8080/tcp`', '容器埠寫錯：nginx 聽的是 80'],
          ['存取日誌有請求，狀態碼是 404', '連線沒問題，是網站內容或路徑的問題'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [MAIN, CONFLICT],
    examples: [
      {
        id: 'dkr04-run-options', title: 'docker run 的選項', machine: 'dkr04-pier',
        description: '--rm、-w、-e 執行一次就結束的指令；-it 的 Shell 收到 exit；-dit 讓 Shell 留在背景，再用 docker exec 進去。',
        steps: [
          { command: "docker run --rm alpine:3.21 echo 'hello from a container'", output: "hello from a container" },
          { command: "docker run --rm -w /tmp alpine:3.21 pwd", output: "/tmp" },
          { command: "docker run --rm -e APP_MODE=dev alpine:3.21 env", output: "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOSTNAME=2933b5084f4c\nAPP_MODE=dev\nHOME=/root" },
          { command: "docker run -it ubuntu:24.04", output: "（模擬環境沒有鍵盤：容器裡的互動式 Shell 立刻收到 exit 而結束（Exited (0)）；要讓它留著，請用 docker run -dit，再用 docker exec admiring_mccarthy 指令）" },
          { command: "docker run -dit --name box ubuntu:24.04", output: "bb4a68ea5c552f4901af3266a21bc43d8670f888e67f74d44d9cb1b81eca97af" },
          { command: "docker exec box head -n 1 /etc/os-release", output: "PRETTY_NAME=\"Ubuntu 24.04.1 LTS\"" },
          { command: "docker ps -a --format \"{{.Names}}\\t{{.Image}}\\t{{.Status}}\"", output: "box\tubuntu:24.04\tUp Less than a second\nadmiring_mccarthy\tubuntu:24.04\tExited (0) Less than a second ago\napi\tpier/shop-api:1.4\tUp 39 minutes\nblog\tnginx\tUp About an hour\nold-web\tnginx\tExited (0) 16 hours ago" },
        ],
      },
      {
        id: 'dkr04-publish', title: '公開 nginx 的 80 埠', machine: 'dkr04-pier',
        description: '-p 8080:80 讓主機的 8080 轉到容器的 80；curl 連主機埠，ss 看到 docker-proxy，存取日誌記下這次請求。',
        steps: [
          { command: "docker run -d --name web -p 8080:80 nginx", output: "b87fcfa32a1bdae65fa94a108189cddf1be50e8191bb273d33d98dabd70846ee" },
          { command: "docker ps --filter name=web", output: "CONTAINER ID   IMAGE     COMMAND                  CREATED                  STATUS                  PORTS                                     NAMES\nb87fcfa32a1b   nginx     \"/docker-entrypoint.…\"   Less than a second ago   Up Less than a second   0.0.0.0:8080->80/tcp, [::]:8080->80/tcp   web" },
          { command: "curl -s localhost:8080 | head -n 3", output: "<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>" },
          { command: "curl localhost:80", output: "curl: (7) Failed to connect to localhost port 80 after 0 ms: Couldn't connect to server" },
          { command: "sudo ss -tlnp sport = :8080", output: "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      4096         0.0.0.0:8080      0.0.0.0:*    users:((\"docker-proxy\",pid=903,fd=4))" },
          { command: "docker port web", output: "80/tcp -> 0.0.0.0:8080\n80/tcp -> [::]:8080" },
          { command: "docker logs web 2>/dev/null | tail -n 1", output: "172.17.0.1 - - [22/Nov/2026:10:00:00 +0000] \"GET / HTTP/1.1\" 200 117 \"-\" \"curl/8.5.0\" \"-\"" },
        ],
      },
      {
        id: 'dkr04-ps', title: '列出、過濾、停止與刪除', machine: 'dkr04-pier',
        description: 'ps 與 ps -a、--filter 與 --format；stop 讓連接埠消失，start 讓同一個容器回來；rm 只刪停止的容器。',
        steps: [
          { command: "docker ps", output: "CONTAINER ID   IMAGE               COMMAND                  CREATED          STATUS             PORTS                                         NAMES\n841565e637e5   pier/shop-api:1.4   \"/app/shop-api\"          40 minutes ago   Up 39 minutes      0.0.0.0:9000->3000/tcp, [::]:9000->3000/tcp   api\n5d1297261771   nginx               \"/docker-entrypoint.…\"   2 hours ago      Up About an hour   0.0.0.0:8081->80/tcp, [::]:8081->80/tcp       blog" },
          { command: "docker ps -a", output: "CONTAINER ID   IMAGE               COMMAND                  CREATED          STATUS                    PORTS                                         NAMES\n841565e637e5   pier/shop-api:1.4   \"/app/shop-api\"          40 minutes ago   Up 39 minutes             0.0.0.0:9000->3000/tcp, [::]:9000->3000/tcp   api\n5d1297261771   nginx               \"/docker-entrypoint.…\"   2 hours ago      Up About an hour          0.0.0.0:8081->80/tcp, [::]:8081->80/tcp       blog\n56e9ad7e222f   nginx               \"/docker-entrypoint.…\"   18 hours ago     Exited (0) 16 hours ago                                                 old-web" },
          { command: "docker ps -a --filter status=exited", output: "CONTAINER ID   IMAGE     COMMAND                  CREATED        STATUS                    PORTS     NAMES\n56e9ad7e222f   nginx     \"/docker-entrypoint.…\"   18 hours ago   Exited (0) 16 hours ago             old-web" },
          { command: "docker ps --format \"table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\"", output: "NAMES     STATUS             PORTS\napi       Up 39 minutes      0.0.0.0:9000->3000/tcp, [::]:9000->3000/tcp\nblog      Up About an hour   0.0.0.0:8081->80/tcp, [::]:8081->80/tcp" },
          { command: "docker stop api", output: "api" },
          { command: "curl -s localhost:9000/health; echo $?", output: "7" },
          { command: "docker ps -a --filter name=api --format \"{{.Names}}: {{.Status}}\"", output: "api: Exited (0) Less than a second ago" },
          { command: "docker start api", output: "api" },
          { command: "docker rm old-web", output: "old-web" },
          { command: "docker rm api", output: "Error response from daemon: cannot remove container \"/api\": container is running: stop the container before removing or force remove" },
          { command: "docker ps -aq", output: "841565e637e5\n5d1297261771" },
        ],
      },
      {
        id: 'dkr04-logs-exec', title: '看日誌、進容器', machine: 'dkr04-pier',
        description: 'docker logs 的 --tail、-t 與標準錯誤；docker exec 在容器的檔案系統裡執行指令，-w 換工作目錄；兩種 exec 失敗。',
        steps: [
          { command: "docker logs --tail 3 blog", output: "172.17.0.1 - - [22/Nov/2026:09:52:30 +0000] \"GET / HTTP/1.1\" 200 117 \"-\" \"curl/8.5.0\" \"-\"\n2026/11/22 09:58:12 [error] 29#29: *7 open() \"/usr/share/nginx/html/feed.xml\" failed (2: No such file or directory), client: 172.17.0.1, server: localhost, request: \"GET /feed.xml HTTP/1.1\", host: \"localhost:8081\"\n172.17.0.1 - - [22/Nov/2026:09:58:12 +0000] \"GET /feed.xml HTTP/1.1\" 404 153 \"-\" \"Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0\" \"-\"" },
          { command: "docker logs --tail 3 blog 2>/dev/null", output: "172.17.0.1 - - [22/Nov/2026:09:52:30 +0000] \"GET / HTTP/1.1\" 200 117 \"-\" \"curl/8.5.0\" \"-\"\n172.17.0.1 - - [22/Nov/2026:09:58:12 +0000] \"GET /feed.xml HTTP/1.1\" 404 153 \"-\" \"Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0\" \"-\"" },
          { command: "docker logs -t --tail 2 api", output: "2026-11-22T09:20:01.000000000Z shop-api 1.4.0 starting\n2026-11-22T09:20:01.000000000Z listening on 0.0.0.0:3000" },
          { command: "docker exec api ls", output: "config.json\nshop-api" },
          { command: "docker exec api cat config.json", output: "{\n  \"listen\": \":3000\",\n  \"database\": \"db.pier.internal:5432\",\n  \"currency\": \"TWD\"\n}" },
          { command: "docker exec -w /etc/nginx/conf.d blog cat default.conf", output: "server {\n    listen       80;\n    server_name  localhost;\n    root   /usr/share/nginx/html;\n}" },
          { command: "docker exec api ps; echo $?", output: "OCI runtime exec failed: exec failed: unable to start container process: exec: \"ps\": executable file not found in $PATH: unknown\n127" },
          { command: "docker exec old-web ls; echo $?", output: "Error response from daemon: container 56e9ad7e222f873888c99cf114c5c1926e5420b8ec550b7f7c729836dc6c7838 is not running\n1" },
        ],
      },
      {
        id: 'dkr04-errors', title: '常見錯誤與 inspect -f', machine: 'dkr04-pier',
        description: '名稱衝突、連接埠已被占用（容器留在 Created）、Image 名稱打錯、找不到執行檔（127），最後用 docker inspect -f 取出欄位。',
        steps: [
          { command: "docker run -d --name old-web -p 8082:80 nginx", output: "docker: Error response from daemon: Conflict. The container name \"/old-web\" is already in use by container \"56e9ad7e222f873888c99cf114c5c1926e5420b8ec550b7f7c729836dc6c7838\". You have to remove (or rename) that container to be able to reuse that name.\nSee 'docker run --help'." },
          { command: "docker run -d --name web -p 8081:80 nginx", output: "docker: Error response from daemon: driver failed programming external connectivity on endpoint web (05db95e7ad82e51740c18c27c29033153c2b04769fb1a848f80af04f123738bb): Bind for 0.0.0.0:8081 failed: port is already allocated." },
          { command: "docker ps -a --filter status=created --format \"{{.Names}} {{.Status}}\"", output: "web Created" },
          { command: "docker rm web", output: "web" },
          { command: "docker run -d --name web -p 8082:80 ngnix", output: "Unable to find image 'ngnix:latest' locally\ndocker: Error response from daemon: pull access denied for ngnix, repository does not exist or may require 'docker login': denied: requested access to the resource is denied.\nSee 'docker run --help'." },
          { command: "docker run --rm alpine:3.21 bash; echo $?", output: "docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: \"bash\": executable file not found in $PATH: unknown.\n127" },
          { command: "docker run -d --name web -p 8082:80 nginx", output: "e067b875e37007e5766a4d146433fcbce6055f15593e63fb665bbc1ea0cc3b71" },
          { command: "docker inspect -f \"{{.State.Status}} {{.State.ExitCode}} {{.NetworkSettings.IPAddress}}\" web", output: "running 0 172.17.0.4" },
          { command: "docker inspect -f \"{{json .NetworkSettings.Ports}}\" web", output: "{\"80/tcp\":[{\"HostIp\":\"0.0.0.0\",\"HostPort\":\"8082\"},{\"HostIp\":\"::\",\"HostPort\":\"8082\"}]}" },
          { command: "docker inspect -f \"{{.State.ExitCode}} {{.State.FinishedAt}}\" old-web", output: "0 2026-11-21T18:30:00Z" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr04-run-web', title: '在 8080 公開 nginx', machine: 'dkr04-pier',
        statement: '在 pier-01 上用 nginx 這個 Image，在背景啟動一個名為 `web` 的容器，讓主機的 8080 埠對應到容器的 80 埠，然後用 `curl` 確認 `http://localhost:8080/` 回應了 nginx 的歡迎頁。',
        checks: [
          { kind: 'container', name: 'web', state: 'running', image: 'nginx', port: '8080:80' },
          { kind: 'http', url: 'http://localhost:8080/', status: 200, body: 'Welcome to nginx!' },
        ],
        solution: ['docker run -d --name web -p 8080:80 nginx', 'curl -s localhost:8080 | head -n 3'],
        mistakes: [
          { commands: ['docker run -d --name web -p 80:8080 nginx', 'curl localhost:8080'], why: '主機埠與容器埠寫反了：主機的 80 轉到容器的 8080，nginx 聽的是 80，主機的 8080 也沒有人在聽' },
          { commands: ['docker run -d --name web nginx', 'curl localhost:80'], why: '沒有 -p，主機上沒有任何埠轉到容器；curl 主機的 80 也連不到容器的 80' },
          { commands: ['docker run -d -p 8080:80 nginx'], why: '沒有 --name，Docker 自動取了別的名字，之後也沒辦法用 web 操作它' },
          { commands: ['docker run -d --name web -p 8080:80 nginx', 'docker stop web'], why: '容器停止後 docker-proxy 跟著結束，8080 不再回應' },
        ],
        hints: ['`-d` 在背景執行，`--name` 指定名稱，都寫在 Image 名稱前面。', '`-p 主機埠:容器埠`：左邊是外面連的 8080，右邊是 nginx 聽的 80。', '驗證時連主機埠：`curl localhost:8080`。'],
        explanation: '`docker run -d --name web -p 8080:80 nginx` 在背景建立並啟動容器，dockerd 在主機的 8080 啟動 docker-proxy，把連線轉到容器的 80，所以 `curl localhost:8080` 拿到 nginx 的歡迎頁。old-web 雖然曾經公開 8080，但它已經停止，主機埠早就釋放了。寫反成 `-p 80:8080` 時主機的 8080 沒有人在聽；少了 `-p` 外面根本連不進來；少了 `--name` 則是另一個名字的容器。',
      },
      {
        id: 'dkr04-port-taken', title: '換一個主機埠', machine: 'dkr04-conflict',
        statement: '同事用 `docker run -d --name shop -p 8080:3000 pier/shop-api:1.4` 啟動商店 API 時出錯了，shop 停在 Created：主機的 8080 已經被占用（先用 `docker ps -a` 與 `sudo ss -tlnp` 看看是誰）。web 容器正在服務，不能動它。請讓 shop 改用主機的 8090 埠（容器埠仍是 3000）在背景執行，並確認 `http://localhost:8090/health` 回應 `ok`。',
        checks: [
          { kind: 'container', name: 'shop', state: 'running', image: 'pier/shop-api:1.4', port: '8090:3000' },
          { kind: 'container', name: 'web', state: 'running' },
          { kind: 'http', url: 'http://localhost:8090/health', status: 200, body: 'ok' },
        ],
        solution: ['docker rm shop', 'docker run -d --name shop -p 8090:3000 pier/shop-api:1.4', 'curl -s localhost:8090/health'],
        mistakes: [
          { commands: ['docker run -d --name shop -p 8090:3000 pier/shop-api:1.4'], why: '建立失敗的 shop 還占著名稱，新的 docker run 得到名稱衝突' },
          { commands: ['docker start shop'], why: 'shop 的設定仍是 8080，再啟動一次還是同樣的錯誤；連接埠對應要刪掉重建才能改' },
          { commands: ['docker rm shop', 'docker run -d --name shop -p 3000:8090 pier/shop-api:1.4'], why: '主機埠與容器埠寫反了：主機的 8090 沒有人在聽' },
          { commands: ['docker rm shop', 'docker run -d --name shop -p 8090:80 pier/shop-api:1.4'], why: '照抄 nginx 的 80：shop-api 聽的是容器的 3000，8090 只得到空的回應' },
          { commands: ['docker stop web', 'docker start shop'], why: '為了搶 8080 把正在服務的 web 停掉了（另一台機器上 8080 是主機的程式占用，停掉 web 也沒用）' },
        ],
        variants: [{
          label: '8080 被主機上的 python3 http.server 占用、web 在 8088 的 pier-01', files: [],
          processes: [{ pid: 1432, user: 'kai', command: 'python3 -m http.server 8080', listen: [{ port: 8080 }] }],
          docker: { images: IMAGES, containers: [webOn(8088), SHOP_FAILED] },
        }],
        hints: [
          '`docker ps -a` 看 shop 的狀態；`sudo ss -tlnp` 看 8080 上是 docker-proxy 還是別的程式。',
          '連接埠對應在建立時就決定了，不能對既有的容器修改：先 `docker rm shop`，再用新的 `-p` 重新 `docker run`。',
          'shop-api 在容器裡聽 3000，所以是 `-p 8090:3000`。',
        ],
        explanation: '連接埠錯誤發生在啟動階段，shop 已經建立，停在 Created 並占著名稱；它的 `-p 8080:3000` 寫在容器的設定裡，`docker start` 只會重複同樣的錯誤。所以先 `docker rm shop`，再 `docker run -d --name shop -p 8090:3000 pier/shop-api:1.4`，主機的 8090 轉到容器的 3000，`curl localhost:8090/health` 得到 ok。這台機器上 8080 是被 web 容器占用（port is already allocated）；另一台是主機上的 python3 程式（address already in use），修法相同：換一個空著的主機埠，容器埠不變，也不去停掉正在服務的程式。',
      },
      {
        id: 'dkr04-who-port', title: '誰公開了 9000 埠', machine: 'dkr04-pier',
        statement: '監控說主機的 9000 埠有流量。查出是哪一個執行中的容器公開了主機的 9000 埠，只印出那個容器的名稱（一行，例如 `blog`）。答案要由 `docker ps` 或 `docker port` 這類實際查詢的指令印出來。',
        checks: [{ kind: 'output', fromCommand: '^(sudo )?docker (ps|container ls|port)\\b' }],
        solution: ['docker ps --format "{{.Names}} {{.Ports}}" | grep ":9000->" | cut -d " " -f 1'],
        mistakes: [
          { commands: ['echo api'], why: '直接打出答案，沒有查詢；換一台機器答案就不同了' },
          { commands: ['docker ps --format "{{.Names}}" | head -n 1'], why: '只取最新的容器，不一定是公開 9000 的那個' },
          { commands: ['docker ps --format "{{.Names}} {{.Ports}}" | grep 9000 | cut -d " " -f 1'], why: 'grep 9000 也比對到容器埠是 9000 的 `9090->9000/tcp`，多印了一個名稱' },
          { commands: ['docker ps'], why: '印出整張表，而不是只有名稱' },
        ],
        variants: [
          { label: 'shop-v2 公開 9000、admin 的容器埠是 9000 的 pier-01', files: [], docker: FIND_ADMIN },
          { label: 'api 已停止、cart 公開 9000 的 pier-01', files: [], docker: FIND_CART },
        ],
        hints: [
          '`docker ps --format "{{.Names}} {{.Ports}}"` 一行印出名稱與連接埠。',
          '主機埠寫在 `->` 的左邊：找 `:9000->`，而不是任何含有 9000 的字。',
          '`cut -d " " -f 1` 取出以空白分隔的第一欄。',
        ],
        explanation: '`docker ps --format "{{.Names}} {{.Ports}}"` 把每個執行中容器的名稱與 PORTS 印在同一行；PORTS 的寫法是「主機位址:主機埠->容器埠/協定」，所以 `grep ":9000->"` 只留下主機埠是 9000 的那一行，`cut` 取出名稱。在這台機器上是 api；另一台是 shop-v2（admin 的 `9090->9000/tcp` 是容器埠 9000，不算）；第三台的 api 已經停止、不占用連接埠，公開 9000 的是 cart。也可以先 `docker ps` 找到候選，再用 `docker port 名稱` 確認。',
      },
      {
        id: 'dkr04-log-status', title: '從日誌找出失敗的請求', machine: 'dkr04-pier',
        statement: '有讀者回報 blog 網站（主機的 8081 埠）剛才有一頁打不開，blog 的日誌裡最後一筆存取紀錄就是那一次請求。用 `docker logs` 查出它的 HTTP 狀態碼，只印出那個數字（例如 `200`）。',
        checks: [{ kind: 'output', fromCommand: '^(sudo )?docker (logs|container logs) ' }],
        solution: ['docker logs --tail 1 blog 2>/dev/null | cut -d " " -f 9'],
        mistakes: [
          { commands: ['docker logs --tail 1 blog'], why: '印出整行存取紀錄，而不是只有狀態碼' },
          { commands: ['docker logs blog 2>/dev/null | head -n 4 | tail -n 1 | cut -d " " -f 9'], why: '從頭數取到的是比較早的請求，不是最後一筆' },
          { commands: ['curl -s -o /dev/null -w "%{http_code}" localhost:8081'], why: '重新請求首頁得到的是現在首頁的狀態碼，不是讀者那一次失敗的請求' },
          { commands: ['echo 404'], why: '直接打出數字，沒有讀日誌' },
        ],
        variants: [
          { label: '最後一筆是 GET /drafts/ 的 blog', files: [], docker: FORBIDDEN },
          { label: '最後一筆是 POST /subscribe 的 blog', files: [], docker: NOT_ALLOWED },
        ],
        hints: [
          '`docker logs --tail 3 blog` 先看最後幾行長什麼樣子。',
          'nginx 的錯誤日誌在標準錯誤，`2>/dev/null` 只留下存取日誌。',
          '存取日誌以空白切開，狀態碼是第 9 欄：`cut -d " " -f 9`。',
        ],
        explanation: '`docker logs --tail 1 blog` 取最後一行；nginx 的錯誤日誌寫在標準錯誤，存取日誌寫在標準輸出，`2>/dev/null` 之後剩下的就是最後一筆存取紀錄，第 9 欄是狀態碼。這台機器上是找不到 /feed.xml 的 404；另一台是目錄沒有 index 而被拒絕的 403；第三台是對靜態網站送 POST 的 405。用 curl 重新請求只能看到現在的狀態，日誌才記得剛剛發生了什麼。',
      },
      {
        id: 'dkr04-exec-config', title: '讀容器裡的設定檔', machine: 'dkr04-pier',
        statement: 'api 容器的程式讀取容器裡的 `/app/config.json`。用 `docker exec` 查出它設定的資料庫，只印出設定檔裡含有 `database` 的那一行（照檔案原樣，包括前面的空白）。',
        checks: [{ kind: 'output', fromCommand: '^(sudo )?docker exec ' }],
        solution: ['docker exec api grep database /app/config.json'],
        mistakes: [
          { commands: ['grep database /app/config.json'], why: '在主機上找檔案；/app/config.json 只存在於容器的檔案系統裡' },
          { commands: ['docker exec blog grep database /app/config.json'], why: '進錯容器了：blog 是 nginx，沒有這個檔案' },
          { commands: ['docker exec api cat /app/config.json'], why: '印出整個檔案，而不是只有 database 那一行' },
        ],
        variants: [{ label: 'api 改連備援資料庫的 pier-01', files: [], docker: API_DB2 }],
        hints: ['`docker exec api 指令` 在 api 容器裡執行指令。', '容器裡也有 grep：`grep database 檔案`。'],
        explanation: '`docker exec api grep database /app/config.json` 在 api 容器裡執行 grep，讀的是容器自己的檔案系統，所以印出 `"database": "db.pier.internal:5432",` 那一行；另一台機器上同一個容器的設定被改成連備援資料庫，同樣的指令印出不同的值。主機上沒有 /app，直接 grep 只會得到 No such file or directory；寫成 `docker exec api cat /app/config.json | grep database` 也可以，因為管線後面的 grep 在主機上處理 exec 印出的內容。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr04-q1', prompt: '在主機 pier-01 上執行 `docker run -d --name web -p 8080:80 nginx` 之後，同一個網路上的另一台電腦要用瀏覽器看到這個網站，網址應該是什麼？',
      options: ['`http://pier-01:80/`', '`http://pier-01:8080/`', '`http://172.17.0.2:80/`', '`http://pier-01:8080:80/`'],
      answer: 1,
      explanation: '`-p 8080:80` 是主機的 8080 轉到容器的 80，外面要連主機埠 8080。主機的 80 沒有程式在聽；172.17.0.2 是 bridge 網路上的內部位址，只有主機本身連得到；網址裡也不能同時寫兩個埠，`8080:80` 只是 `-p` 的寫法。',
    },
    {
      id: 'dkr04-q2', prompt: '用 `docker run -it --name box ubuntu:24.04` 進到容器的 bash，打了 `exit` 之後，`docker ps -a` 裡 box 的狀態是什麼？',
      options: ['`Up`，容器在背景繼續執行', '容器被自動刪除，`docker ps -a` 看不到它', '`Exited (0)`', '`Created`'],
      answer: 2,
      explanation: '這個 bash 就是容器的主程式（PID 1），exit 讓它以 0 結束，容器跟著變成 Exited (0)。要讓 Shell 留在背景得用 `-dit` 啟動；只有加了 `--rm` 才會自動刪除；Created 是建立後從來沒有成功啟動的狀態，box 已經啟動過了。',
    },
    {
      id: 'dkr04-q3', prompt: '`docker ps` 裡看不到任何叫 web 的容器，但 `docker run -d --name web nginx` 卻失敗：`Conflict. The container name "/web" is already in use…`。最可能的原因是什麼？',
      options: ['有一個停止或建立失敗的 web 容器還在，`docker ps -a` 才看得到', 'nginx 這個 Image 已經有人在用', 'Docker Hub 上已經有叫 web 的儲存庫', '主機上有一個叫 web 的行程'],
      answer: 0,
      explanation: '容器名稱在 `docker rm` 之前一直被占用，Exited 與 Created 的也一樣，而 `docker ps` 預設只列執行中的。同一個 Image 可以建立任意多個容器；容器名稱和 Docker Hub 的儲存庫名稱無關；主機上的行程名稱也不影響容器名稱。',
    },
    {
      id: 'dkr04-q4', prompt: '`docker run -d --name api2 -p 9000:3000 pier/shop-api:1.4` 失敗：`Bind for 0.0.0.0:9000 failed: port is already allocated`。下列哪一個是正確的修法？',
      options: ['把容器埠改掉：`-p 9000:3001`', '刪掉 pier/shop-api:1.4 這個 Image 再拉一次', '重新啟動 docker.service', '`docker rm api2`，再用另一個主機埠：`-p 9001:3000`'],
      answer: 3,
      explanation: '被占用的是主機的 9000（另一個執行中的容器公開了它），所以換主機埠，容器埠 3000 是程式真正監聽的，不能改；失敗的 api2 留在 Created、占著名稱，要先刪掉。只改容器埠時主機的 9000 仍然被占用，錯誤一樣，而且 3001 也沒有程式在聽；Image 與 docker.service 都和這個錯誤無關。',
    },
    {
      id: 'dkr04-q5', prompt: '想看 web 容器最近的 20 行輸出，而且每一行要附上 Docker 收到它的時間。應該用哪一個指令？',
      options: ['`docker logs -f web | head -n 20`', '`docker logs -t --tail 20 web`', '`docker exec web tail -n 20 /var/log/nginx/access.log`', '`docker ps --tail 20 web`'],
      answer: 1,
      explanation: '`--tail 20` 取最後 20 行，`-t` 在每行前面加上時間。`-f` 加 `head` 取的是最前面的 20 行，也沒有時間；官方 nginx Image 的 access.log 是連到 /dev/stdout 的符號連結，紀錄不在檔案裡，而且也沒有時間戳記；`docker ps` 沒有 `--tail` 這個選項。',
    },
    {
      id: 'dkr04-q6', prompt: '`docker exec api ps` 印出 `exec: "ps": executable file not found in $PATH`，結束碼 127。這代表什麼？',
      options: ['api 的 Image 裡沒有 ps 這個程式', 'api 容器已經停止', '要加 sudo 才能執行', '`ps` 必須搭配 `-it` 才能執行'],
      answer: 0,
      explanation: '容器只看得到 Image 裡的檔案，精簡的 Image 常常沒有 ps，所以在 PATH 裡找不到，結束碼 127。容器停止時的錯誤是 `container … is not running`；權限不足是連不上 docker.sock 的 permission denied；`-it` 只影響互動與終端機，不會讓不存在的程式出現。',
    },
    {
      id: 'dkr04-q7', prompt: '`sudo ss -tlnp` 顯示 docker-proxy 在 0.0.0.0:8080 監聽，但 `curl localhost:8080` 得到 `(52) Empty reply from server`。最可能的原因是什麼？',
      options: ['容器已經停止', '主機上沒有程式監聽 8080', '對應到的容器埠沒有程式在聽，例如 nginx 卻寫了 `-p 8080:8080`', '要用 `sudo curl` 才能連到容器'],
      answer: 2,
      explanation: '有 docker-proxy 代表容器在執行、主機埠已公開，連線也接上了；但它轉到的容器埠沒有程式，所以回應是空的。容器停止時 docker-proxy 會跟著結束，curl 得到的是 (7)；ss 已經證明 8080 有人在監聽；連線到公開的埠不需要 root 權限。',
    },
  ],
};

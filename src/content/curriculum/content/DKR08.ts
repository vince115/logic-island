import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalContainer, TerminalDocker, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

/*
 * DKR08 Container Networking (DKR-3, terminal-sim). A terminal lesson on the storage-net profile (engine stage E22): the
 * built-in networks (bridge, host, none), the default bridge (172.17 addresses, reachable by address, no name resolution,
 * the host's name servers in resolv.conf; --link as legacy, text only), user-defined networks and Docker's embedded DNS
 * (127.0.0.11: names, NAME.network, short IDs, aliases), container-to-container traffic on the container port (api:3000)
 * while -p is only for the host and the outside, localhost inside a container, isolation between networks (timeouts even
 * by address), docker network connect/disconnect for a front and a back network, which ports to publish, --network host
 * (-p discarded, port conflicts) and none, and reading docker network inspect and docker inspect's networks and addresses.
 * Machines: the Docker host lantern-01 (user yu in the docker group; nginx, postgres, a made-up api, worker and toolbox
 * image) in six states. iptables, NAT, veth and docker0 are text only. The host, user, team images and sites are made up.
 * Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\nID=debian\n';
const SHELL_TOOLS = ['ls', 'cat', 'echo', 'env', 'sh', 'bash', 'sleep', 'true', 'false', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'head', 'tail', 'grep', 'wc', 'hostname', 'id', 'whoami'];
const SHOP_PAGE = '<!DOCTYPE html>\n<html><head><title>Lantern 書店</title></head><body><h1>Lantern 書店</h1></body></html>\n';

const IMAGES: TerminalImage[] = [
  {
    name: 'nginx:1.27', size: 191968432, created: '2026-11-05 09:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], env: [PATH_ENV, 'NGINX_VERSION=1.27.3'], expose: [80],
    http: { port: 80, responder: 'shop-front', accessLog: 'nginx' }, service: true, layers: 7, pulled: true, osRelease: DEBIAN, commands: [...SHELL_TOOLS, 'getent'],
    logs: ['/docker-entrypoint.sh: Configuration complete; ready for start up'],
  },
  {
    name: 'postgres:17', size: 438_000_000, created: '2026-11-08 08:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['postgres'], env: [PATH_ENV, 'PGDATA=/var/lib/postgresql/data'], expose: [5432],
    service: true, layers: 5, pulled: true, osRelease: DEBIAN, volumes: ['/var/lib/postgresql/data'], commands: [...SHELL_TOOLS, 'getent'],
    logs: ['LOG:  database system is ready to accept connections'],
    files: [{ path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash\npostgres:x:999:999::/var/lib/postgresql:/bin/bash\n' }, { path: '/etc/group', content: 'root:x:0:\npostgres:x:999:\n' }],
  },
  {
    name: 'lantern/api:2.3', size: 61_000_000, created: '2026-11-19 15:00:00', cmd: ['node', 'server.js'], workdir: '/app', env: [PATH_ENV, 'NODE_ENV=production', 'DB_HOST=db', 'DB_PORT=5432'], expose: [3000],
    http: { port: 3000, responder: 'api', accessLog: 'nginx' }, service: true, pulled: true, registry: false, osRelease: DEBIAN, commands: [...SHELL_TOOLS, 'getent'],
    logs: ['lantern-api 2.3.0 listening on :3000'],
  },
  {
    name: 'lantern/worker:1.1', size: 58_000_000, created: '2026-11-19 15:10:00', cmd: ['node', 'worker.js'], workdir: '/app', env: [PATH_ENV, 'NODE_ENV=production'],
    service: true, pulled: true, registry: false, osRelease: DEBIAN, commands: [...SHELL_TOOLS, 'getent'], logs: ['lantern-worker 1.1.0 started'],
  },
  {
    name: 'lantern/toolbox:1.0', size: 96_000_000, created: '2026-11-12 10:00:00', cmd: ['sleep', 'infinity'], service: true, stopExit: 137, pulled: true, registry: false, osRelease: DEBIAN,
    commands: [...SHELL_TOOLS, 'getent', 'ping', 'curl', 'nc'],
  },
];

const host = (id: string, title: string, docker: TerminalDocker): TerminalMachine => ({
  id, title, user: 'yu', host: 'lantern-01', cwd: '/home/yu', profile: 'storage-net', now: '2026-11-22 10:00:00', boot: '2026-11-22 06:00:00',
  files: [dir('/home'), dir('/home/yu', 'yu', 0o750), file('/etc/resolv.conf', 'nameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n')],
  accounts: { groups: [{ name: 'sudo', members: ['yu'] }, { name: 'docker', gid: 988, members: ['yu'] }] },
  responders: [
    { id: 'shop-front', server: 'nginx/1.27.3', routes: [{ path: '/', body: SHOP_PAGE }] },
    { id: 'api', routes: [{ path: '/health', body: '{"status":"ok"}\n', type: 'application/json' }, { path: '/api/books', body: '[{"id":7,"title":"海風與燈塔"}]\n', type: 'application/json' }] },
  ],
  docker,
});

const PGDATA = { name: 'pgdata', created: '2026-11-20 09:00:00', files: [{ path: '/PG_VERSION', content: '17\n', owner: '999' }] };
const DB: TerminalContainer = { name: 'db', image: 'postgres:17', state: 'running', created: '2026-11-20 09:00:00', started: '2026-11-20 09:00:01', volumes: ['pgdata:/var/lib/postgresql/data'] };

const MAIN = host('dkr08-lantern', 'lantern-01（Docker 主機：db 在預設 bridge）', { images: IMAGES, volumes: [PGDATA], containers: [DB] });

// Example 3 and exercise 4: shop-net with db, api (published on 8080) and a probe container.
const on = (c: TerminalContainer, network: string): TerminalContainer => ({ ...c, network });
const API: TerminalContainer = { name: 'api', image: 'lantern/api:2.3', state: 'running', created: '2026-11-21 14:00:00', started: '2026-11-21 14:00:01', ports: ['8080:3000'] };
const PROBE: TerminalContainer = { name: 'probe', image: 'lantern/toolbox:1.0', state: 'running', created: '2026-11-22 09:30:00', started: '2026-11-22 09:30:01' };
const shopDocker = (subnet?: string, containers?: TerminalContainer[]): TerminalDocker => ({
  images: IMAGES, volumes: [PGDATA], networks: [{ name: 'shop-net', created: '2026-11-21 13:55:00', ...subnet ? { subnet } : {} }],
  containers: containers ?? [on(DB, 'shop-net'), on(API, 'shop-net'), on(PROBE, 'shop-net')],
});
const SHOP = host('dkr08-shop', 'lantern-01（shop-net：db、api、probe）', shopDocker());

// Example 4: a proxy on front-net, api and db on back-net.
const PROXY: TerminalContainer = { name: 'proxy', image: 'nginx:1.27', state: 'running', created: '2026-11-21 14:05:00', started: '2026-11-21 14:05:01', ports: ['8080:80'] };
const TIERS = host('dkr08-tiers', 'lantern-01（front-net：proxy；back-net：api、db）', {
  images: IMAGES, volumes: [PGDATA], networks: [{ name: 'front-net', created: '2026-11-21 13:50:00' }, { name: 'back-net', created: '2026-11-21 13:51:00' }],
  containers: [on(DB, 'back-net'), on({ ...API, ports: undefined }, 'back-net'), on(PROXY, 'front-net')],
});

// Exercise 1: api and db on the default bridge; api cannot resolve db.
const DNS_FIX = host('dkr08-dns', 'lantern-01（api 與 db 都在預設 bridge）', { images: IMAGES, volumes: [PGDATA], containers: [DB, {
  ...API, logs: ['lantern-api 2.3.0 listening on :3000', { text: 'database connection failed: getaddrinfo ENOTFOUND db', stream: 2 }, { text: 'database connection failed: getaddrinfo ENOTFOUND db', stream: 2 }],
}] });

// Exercise 2: worker calls the api through the published port on localhost.
const WORKER: TerminalContainer = {
  name: 'worker', image: 'lantern/worker:1.1', state: 'running', created: '2026-11-22 09:40:00', started: '2026-11-22 09:40:01', env: ['API_URL=http://localhost:8080'],
  logs: ['lantern-worker 1.1.0 started', { text: 'job poll failed: connect ECONNREFUSED 127.0.0.1:8080', stream: 2 }, { text: 'job poll failed: connect ECONNREFUSED 127.0.0.1:8080', stream: 2 }],
};
const PORT_FIX = host('dkr08-port', 'lantern-01（worker 用 localhost:8080 找 api）', shopDocker(undefined, [on(DB, 'shop-net'), on(API, 'shop-net'), WORKER]));

// Exercise 3: proxy, api and db all on shop-net.
const ISOLATE = host('dkr08-flat', 'lantern-01（proxy、api、db 都在 shop-net）', shopDocker(undefined, [on(DB, 'shop-net'), on({ ...API, ports: undefined }, 'shop-net'), on(PROXY, 'shop-net')]));


// Exercise 4: the variants move api to another subnet, or give it another address on shop-net.
const IP_OTHER_SUBNET = shopDocker('10.30.0.0/24');
const IP_LATER = shopDocker(undefined, [on(DB, 'shop-net'), on(PROBE, 'shop-net'), on({ ...API, created: '2026-11-22 09:45:00', started: '2026-11-22 09:45:01' }, 'shop-net')]);

export const DKR08: LessonContent = {
  lessonId: 'DKR08',
  motivation: 'Lantern 書店的後端由三個容器組成：nginx 做反向代理、Node.js 寫的 api、postgres 資料庫。每個容器單獨跑都沒問題，接在一起卻處處卡住：api 的日誌一直印 `getaddrinfo ENOTFOUND db`，明明 db 就在同一台主機上；排程用的 worker 照著筆電上的習慣連 `localhost:8080`，得到 `ECONNREFUSED`；為了「方便除錯」，資料庫被 `-p 5432:5432` 開到了主機外面。這些問題都出在同一件事：容器之間怎麼找到彼此、走哪一個埠、誰能連到誰。這一課在 Docker 主機 lantern-01 上，從預設的 bridge 網路開始，看它為什麼只認位址不認名稱；再建立自訂網路，讓 Docker 的內建 DNS（127.0.0.11）用容器名稱回答查詢；分清楚容器埠與公開到主機的埠；用 `docker network connect` 把前端與後端分成兩個網路，讓資料庫只對 api 開放；最後認識 `--network host` 與 `--network none` 的取捨，並學會從 `docker network inspect` 與 `docker inspect` 讀出容器在哪個網路、拿到哪個位址。',
  sections: [
    {
      id: 'dkr08-s-bridge', title: '預設的 bridge 網路：只認位址',
      blocks: [
        { type: 'p', text: '安裝好 Docker，`docker network ls` 就列出三個內建的網路：bridge、host 與 none。`docker run` 沒有指定網路時，容器接上的是預設的 bridge 網路。它的做法是在主機上建立一個名為 docker0 的虛擬交換器（Linux bridge，位址 172.17.0.1），每個容器啟動時拿到一對 veth 虛擬網卡：一端在容器裡變成 eth0，另一端插在 docker0 上。所以容器各自有 172.17.0.2、172.17.0.3 這樣的位址，彼此透過 docker0 互通，對外則經由主機的 iptables（NAT 的 MASQUERADE 規則）把來源位址換成主機的位址再送出去。veth、docker0 與 iptables 規則是核心的物件，模擬環境只呈現它們在 docker 指令上看得到的結果。' },
        { type: 'table', head: ['內建網路', '驅動程式', '容器拿到什麼'], rows: [
          ['bridge', 'bridge', '在 docker0 上的私有位址（172.17.0.0/16），閘道 172.17.0.1；不加 `--network` 時的預設'],
          ['host', 'host', '沒有自己的網路，直接用主機的網卡與連接埠（本課最後一節）'],
          ['none', 'null', '只有 loopback（lo），完全沒有對外的網路'],
        ] },
        { type: 'p', text: '預設 bridge 有一個常被忽略的限制：它不提供容器名稱的解析。同一個預設 bridge 上的兩個容器用位址互連沒問題，但用名稱找對方會失敗：`getent hosts db` 什麼也不印、結束碼是 2，`nc` 說 `Name or service not known`，`curl` 是 `(6) Could not resolve host`。容器的 `/etc/resolv.conf` 只是依主機的設定產生的名稱伺服器清單（主機只寫了 127.0.0.53 這類本機位址時，Docker 改用 systemd-resolved 背後的上游伺服器，找不到時用公用的名稱伺服器；下面的紀錄是後者），那些伺服器當然不認識 db 這個容器。下面在 lantern-01 上啟動一個排查用的 probe 容器，從它去找預設 bridge 上的 db：' },
        { type: 'example', id: 'dkr08-bridge' },
        { type: 'p', text: '`docker inspect -f` 取出的 `.NetworkSettings.IPAddress` 就是容器在預設 bridge 上的位址：db 是 172.17.0.2，新的 probe 拿到下一個空號 172.17.0.3，閘道都是 172.17.0.1。用位址 ping 與 `nc -zv` 都通，用名稱就查不到。把 172.17.0.2 寫進應用程式的設定看似能解決，但位址是容器啟動時才分配的，停止後就釋放：重建或重開機之後，db 可能拿到別的位址，設定就默默壞掉。' },
        { type: 'callout', tone: 'note', title: '--link 是舊的做法', text: '早期的 Docker 用 `docker run --link db` 讓容器在預設 bridge 上認得另一個容器的名稱（Docker 把名稱寫進 /etc/hosts 並傳入環境變數）。官方文件早已把它列為舊功能（legacy），之後可能移除。新的設定請一律改用自訂網路；模擬環境沒有模擬 `--link`（輸入它會得到 unknown flag，真實的 Docker 27 仍然接受它）。' },
      ],
    },
    {
      id: 'dkr08-s-usernet', title: '自訂網路與內建 DNS',
      blocks: [
        { type: 'p', text: '`docker network create shop-net` 建立一個自訂網路（user-defined bridge）。和預設的 bridge 網路比起來，它一樣是 bridge 驅動程式，只是 Docker 另外分配一段子網路（第一個自訂網路通常是 172.18.0.0/16，下一個 172.19.0.0/16，也可以用 `--subnet` 指定），並替它多做了一件關鍵的事：在這個網路上的容器，`/etc/resolv.conf` 指向 Docker 的內建 DNS 伺服器 `127.0.0.11`。這個 DNS 由 dockerd 提供，它知道同一個網路上每一個執行中容器的名稱與位址；不認識的外部名稱，它再轉給主機設定的名稱伺服器。' },
        { type: 'table', head: ['在自訂網路上查得到的名稱', '例子', '說明'], rows: [
          ['容器名稱', '`db`', '`--name` 指定的名稱，最常用'],
          ['名稱加網路名稱', '`db.shop-net`', '連在好幾個網路時，明確指出要哪一個網路上的位址'],
          ['Container ID 前 12 個字', '`d1695973a87c`', '也是容器預設的 hostname'],
          ['網路別名', '`database`', '`docker run --network-alias database` 或 `docker network connect --alias database` 給的名稱，同一個網路上可以有好幾個容器共用'],
        ] },
        { type: 'p', text: '名稱只在「共同的自訂網路」上查得到：容器必須和對方至少接在同一個自訂網路，查詢才會成功。既有的容器不必重建，`docker network connect shop-net db` 讓執行中的 db 立刻多一張網卡、多一個位址，原本在預設 bridge 上的位址不變。新的容器在 `docker run` 時用 `--network shop-net` 直接接上：' },
        { type: 'example', id: 'dkr08-usernet' },
        { type: 'p', text: 'db 接上 shop-net 之後拿到 172.18.0.2，api 與 probe 依序是 .3 與 .4。從 probe 查 db 與 db.shop-net 都得到 172.18.0.2，`nc -zv db 5432` 連上了資料庫，`curl http://api:3000/health` 拿到 api 的回應；probe 的 resolv.conf 寫的是 `nameserver 127.0.0.11`，最後的註解說明 Docker 會把外部查詢轉給主機原本的 127.0.0.53。`docker ps` 的 NETWORKS 欄看得出 db 同時在 bridge 與 shop-net 上。api 的存取日誌裡，請求的來源是 probe 在 shop-net 上的位址 172.18.0.4：容器之間是直接連線，沒有經過主機。' },
        { type: 'p', text: '這就是應用程式應該加入自訂網路的理由：設定檔可以寫 `DB_HOST=db` 這種穩定的名稱，位址怎麼變都由 Docker 的 DNS 跟著更新；網路也只包含彼此需要溝通的容器，不像預設 bridge 是「沒指定網路的容器都擠在一起」；容器還可以在執行中加入或離開網路。Docker Compose（DKR09）替每個專案自動建立一個自訂網路，也是同樣的道理。' },
        { type: 'callout', tone: 'warning', title: '預設 bridge 不會替你解析名稱', text: '很多人以為「同一台主機上的容器本來就能用名字互連」，於是在預設 bridge 上把 api 設定成連 `db`，結果得到 `ENOTFOUND db` 或 `Could not resolve host`。容器名稱的解析是自訂網路的內建 DNS 才有的功能，預設 bridge 只能用位址互連。看到名稱查不到，第一件事是 `docker ps --format "{{.Names}} {{.Networks}}"`：兩個容器是不是在同一個自訂網路上。' },
      ],
    },
    {
      id: 'dkr08-s-ports', title: '容器間通訊用容器埠，-p 只給主機',
      blocks: [
        { type: 'p', text: 'DKR04 用 `-p 8080:3000` 讓主機的 8080 轉到容器的 3000。這個「公開」是給主機與主機以外的世界用的：dockerd 在主機埠啟動 docker-proxy（並設定 iptables 的 DNAT 規則），瀏覽器連 `http://lantern-01:8080` 才進得來。容器與容器之間不經過這一層：同一個自訂網路上的容器直接連對方的位址，連的是對方程式真正監聽的容器埠。Docker 的文件也這樣說：同一個自訂網路上的容器，彼此之間等於開放了所有的埠，不需要 `-p`，也不看 Dockerfile 的 EXPOSE（EXPOSE 只是說明）。' },
        { type: 'table', head: ['誰要連 api', '該用的網址', '為什麼'], rows: [
          ['同一個自訂網路上的另一個容器', '`http://api:3000`', '名稱由內建 DNS 解析，3000 是 api 在容器裡監聽的埠'],
          ['主機上的程式（例如 curl）', '`http://localhost:8080`', '經過 `-p 8080:3000` 公開的主機埠'],
          ['網路上的其他電腦', '`http://lantern-01:8080`', '同上，連主機的位址與主機埠'],
          ['容器裡寫 `localhost`', '不會連到 api', '每個容器有自己的網路命名空間，localhost 是容器自己'],
          ['另一個網路上的容器', '連不到', '不同的自訂網路彼此隔離，用位址也一樣'],
        ] },
        { type: 'example', id: 'dkr08-ports' },
        { type: 'p', text: '主機上的 `curl localhost:8080/health` 經由 docker-proxy 拿到回應；probe 用 `api:3000` 也拿到同樣的回應。probe 連 `api:8080` 得到 `Connection refused`：名稱查得到、位址也到得了，但 api 容器裡沒有任何程式在 8080 監聽，8080 只存在主機那一邊。probe 連 `localhost:3000` 也被拒絕，因為那是 probe 自己。最後啟動在預設 bridge 上的 stray：名稱查不到（6），改用 api 在 shop-net 的位址 172.18.0.3 則一直等到逾時。api 的日誌裡，從主機來的請求來源是 shop-net 的閘道 172.18.0.1，從 probe 來的是 probe 的位址。' },
        { type: 'p', text: '不同網路之間連不到，是 Docker 用 iptables 規則（DOCKER-ISOLATION 系列的鏈）刻意擋掉的：每個自訂網路是一個獨立的 bridge，封包不會在兩個 bridge 之間轉送。這就是網路隔離的基礎：把不該互相連線的容器放在不同的網路上，比在每個服務上設定防火牆更簡單也更不容易漏掉。反過來，該連的兩個容器至少要有一個共同的網路。' },
        { type: 'callout', tone: 'warning', title: '容器裡的 localhost 不是主機，公開埠也不是給容器用的', text: '把應用程式從筆電搬進容器時，最常見的錯誤是保留 `http://localhost:8080` 這類設定：在筆電上所有程式共用一個 localhost，但每個容器都有自己的 localhost，它只指向容器自己。另一個錯誤是改成 `http://api:8080`，把主機上公開的埠拿來給容器用。容器之間永遠是「服務名稱＋容器埠」：`http://api:3000`、`db:5432`。' },
      ],
    },
    {
      id: 'dkr08-s-connect', title: '一個容器接多個網路：前端與後端分開',
      blocks: [
        { type: 'p', text: '一個容器可以同時接在好幾個網路上，每個網路給它一張網卡與一個位址。`docker network connect 網路 容器` 讓執行中的容器加入一個網路，`docker network disconnect 網路 容器` 讓它離開，都不必重新啟動；容器的 /etc/hosts 與能查到的名稱跟著改變。這讓我們可以把系統切成幾層：面對外界的反向代理在前端網路（front-net），資料庫在後端網路（back-net），只有確實需要跨越兩層的容器才同時接上兩個網路。' },
        { type: 'p', text: 'lantern-01 上已經有 front-net（proxy）與 back-net（api、db）。proxy 要把請求轉給 api，但兩者沒有共同的網路，連名稱都查不到。最直覺的修法是把 proxy 也接到 back-net，可是這樣 proxy 也連得到 db 了；比較好的做法是讓 api 加入 front-net，由 api 當作唯一跨越兩層的容器：' },
        { type: 'example', id: 'dkr08-connect' },
        { type: 'p', text: '接上 back-net 之後，proxy 有兩個位址（front-net 的 172.18.0.2 與 back-net 的 172.19.0.4），而且 db 也查得到了：一旦 proxy 被攻破，攻擊者離資料庫只差一步。把 proxy 從 back-net 斷開、改讓 api 加入 front-net 之後，proxy 查得到 api、查不到 db，api 仍然在 back-net 上找得到 db。注意網路名稱含有連字號時，`{{.NetworkSettings.Networks.back-net.IPAddress}}` 會被 Go 樣板當成減號而解析失敗，要改用 `index`。' },
        { type: 'p', text: '同樣的思路決定連接埠公開的範圍：哪些容器需要 `-p`？判斷的問題只有一個：「主機以外（或主機上不在容器裡的程式）需不需要直接連它？」' },
        { type: 'table', head: ['容器', '要不要 `-p`', '理由'], rows: [
          ['proxy（nginx）', '要，例如 `-p 80:80`、`-p 443:443`', '它是對外的唯一入口'],
          ['api', '不用', 'proxy 在共同的網路上用 `api:3000` 連它；除錯時可以暫時用 `-p 127.0.0.1:8080:3000` 只開給主機自己'],
          ['db（postgres）', '不要', '只有 api 需要連它；`-p 5432:5432` 會把資料庫直接開到主機的所有網卡上'],
          ['worker', '不用', '它主動連 api，沒有人需要連進它'],
        ] },
        { type: 'callout', tone: 'tip', title: '公開的埠越少越好', text: '每個 `-p` 都是一個對外的入口，而 Docker 的公開埠由它自己的 iptables 規則處理，主機上 ufw 之類的防火牆規則不一定擋得住它。只公開真正需要被外界連的服務；其他容器靠自訂網路與服務名稱互連。' },
      ],
    },
    {
      id: 'dkr08-s-host-none', title: 'host 網路與 none 網路',
      blocks: [
        { type: 'p', text: '`--network host` 讓容器不建立自己的網路命名空間，直接使用主機的網卡、位址與連接埠：容器裡的 nginx 在 80 埠監聽，就是主機的 80 埠在監聽，不需要也不能 `-p`（Docker 會印出 `WARNING: Published ports are discarded when using host network mode` 並忽略它）。少了 NAT 與 docker-proxy，網路效能稍好，也適合需要看到主機所有網卡的監控或網路工具；代價是失去網路隔離，而且連接埠直接和主機上的其他程式搶。host 網路是 Linux 主機上的功能，Docker Desktop（Mac、Windows）的行為不同。' },
        { type: 'example', id: 'dkr08-host-none' },
        { type: 'p', text: 'edge 的 PORTS 欄是空的，`-p 9000:80` 被丟掉了，所以 `curl localhost:9000` 連不上（7），而 `ss` 在 80 埠看到的是 nginx 本身，不是 docker-proxy。edge 的 hostname 也是主機的 lantern-01。第二個 host 網路的 nginx 要搶同一個 80 埠，主程式無法監聽而結束（Exited (1)）；用 bridge 網路時每個容器有自己的 80 埠，這種衝突不會發生。最後的 `--network none` 容器只有 loopback，連名稱都查不到。' },
        { type: 'table', head: ['網路', '好處', '代價'], rows: [
          ['自訂 bridge', '名稱解析、網路隔離、可以隨時 connect／disconnect', '對外要靠 `-p`（多一層 NAT 轉送）'],
          ['預設 bridge', '不用設定', '沒有名稱解析；所有沒指定網路的容器擠在一起'],
          ['host', '沒有 NAT，效能稍好；看得到主機的網卡', '沒有隔離；`-p` 無效；埠會和主機與其他 host 容器衝突；不能再 connect 其他網路'],
          ['none', '完全斷網，最安全', '只有 lo，適合只處理本機檔案的批次工作'],
        ] },
      ],
    },
    {
      id: 'dkr08-s-inspect', title: '讀 docker network inspect 與排查順序',
      blocks: [
        { type: 'p', text: '`docker network inspect 網路` 印出網路的 JSON：`IPAM.Config` 有子網路（Subnet）與閘道（Gateway），`Containers` 列出目前接在上面、正在執行的每個容器，以及它在這個網路上的 `IPv4Address`（帶著 /16 這樣的前綴長度）與 MAC 位址。從容器那一邊看，`docker inspect 容器` 的 `NetworkSettings.Networks` 依網路名稱列出它的位址、閘道、別名（Aliases）與 DNS 名稱（DNSNames）。' },
        { type: 'table', head: ['想知道的事', '指令'], rows: [
          ['某個網路上有哪些容器、各自的位址', '`docker network inspect -f \'{{range .Containers}}{{.Name}}={{.IPv4Address}} {{end}}\' shop-net`'],
          ['容器接在哪些網路、各自的位址', '`docker inspect -f \'{{range $k, $v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}\' api`'],
          ['容器在某個網路上的位址', '`docker inspect -f \'{{(index .NetworkSettings.Networks "shop-net").IPAddress}}\' api`'],
          ['只在預設 bridge 上的位址', '`docker inspect -f \'{{.NetworkSettings.IPAddress}}\' db`（只在自訂網路上的容器印出空字串）'],
          ['一眼看全部容器的網路', '`docker ps --format "table {{.Names}}\\t{{.Networks}}\\t{{.Ports}}"`'],
        ] },
        { type: 'p', text: '`.NetworkSettings.IPAddress` 是舊的欄位，只記錄預設 bridge 上的位址；容器只接在自訂網路上時它是空的，這不代表容器沒有位址。要用 `range` 走過 `.NetworkSettings.Networks`，或用 `index` 指定網路名稱。' },
        { type: 'p', text: '「容器 A 連不到容器 B」時，依下面的順序用指令的輸出證明，每一步都排除一類原因：' },
        { type: 'list', ordered: true, items: [
          '`docker ps --format "{{.Names}} {{.Networks}}"`：兩個容器都在執行嗎？有沒有共同的自訂網路？只在預設 bridge 上就沒有名稱解析。',
          '`docker exec A getent hosts B`：名稱查得到嗎？查不到是網路的問題（不同網路、預設 bridge、none），不是程式的問題。',
          '`docker exec A nc -zv B 埠`：`Connection refused` 表示位址到得了，但那個埠沒有程式在聽，常常是寫成了主機的公開埠；逾時表示兩者不在同一個網路。',
          '看設定：A 的環境變數或設定檔裡是不是寫了 `localhost`、IP 位址或公開埠，而不是「服務名稱＋容器埠」。',
          '`docker logs B`：請求到了沒有、來源位址是誰。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [MAIN, SHOP, TIERS, DNS_FIX, PORT_FIX, ISOLATE],
    examples: [
      {
        id: 'dkr08-bridge', title: '預設 bridge：位址通、名稱不通', machine: 'dkr08-lantern',
        description: '三個內建網路；db 與 probe 在預設 bridge 上各有 172.17 的位址，用位址連得到，用名稱查不到，resolv.conf 是主機的名稱伺服器。',
        steps: [
          { command: 'docker network ls', output: "NETWORK ID     NAME      DRIVER    SCOPE\nb9d7c79c8bc5   bridge    bridge    local\n0ba38d897ac3   host      host      local\n2c56178f9334   none      null      local" },
          { command: "docker inspect -f '{{.NetworkSettings.IPAddress}}' db", output: "172.17.0.2" },
          { command: 'docker run -d --name probe lantern/toolbox:1.0', output: "65588bccc0098866a55a5bb246e5aec8042a5170d49defbc89d68546f52a5e7f" },
          { command: "docker inspect -f '{{.NetworkSettings.IPAddress}} {{.NetworkSettings.Gateway}}' probe", output: "172.17.0.3 172.17.0.1" },
          { command: 'docker exec probe ping -c 1 172.17.0.2', output: "PING 172.17.0.2 (172.17.0.2) 56(84) bytes of data.\n64 bytes from 172.17.0.2: icmp_seq=1 ttl=64 time=0.064 ms\n\n--- 172.17.0.2 ping statistics ---\n1 packets transmitted, 1 received, 0% packet loss, time 0ms\nrtt min/avg/max/mdev = 0.064/0.064/0.064/0.000 ms" },
          { command: 'docker exec probe nc -zv 172.17.0.2 5432', output: "Connection to 172.17.0.2 5432 port [tcp/*] succeeded!" },
          { command: 'docker exec probe getent hosts db; echo $?', output: "2" },
          { command: 'docker exec probe nc -zv db 5432', output: "nc: getaddrinfo for host \"db\" port 5432: Name or service not known" },
          { command: 'docker exec probe cat /etc/resolv.conf', output: "# Generated by Docker Engine.\n# This file can be edited; Docker Engine will not make further changes once it\n# has been modified.\n\nnameserver 8.8.8.8\nnameserver 8.8.4.4\n\n# Based on host file: '/etc/resolv.conf' (legacy)\n# Overrides: []" },
        ],
      },
      {
        id: 'dkr08-usernet', title: '自訂網路：用名稱互連', machine: 'dkr08-lantern',
        description: '建立 shop-net，把執行中的 db 接上去，api 與 probe 直接在 shop-net 上啟動；內建 DNS 127.0.0.11 回答容器名稱。',
        steps: [
          { command: 'docker network create shop-net', output: "ee8c38a69138f1ab209ffb3ed3b20ae92b7f61606aa6d06d664a2495d67d41e5" },
          { command: 'docker network ls --filter type=custom', output: "NETWORK ID     NAME       DRIVER    SCOPE\nee8c38a69138   shop-net   bridge    local" },
          { command: 'docker network connect shop-net db', output: "" },
          { command: 'docker run -d --name api --network shop-net lantern/api:2.3', output: "328abfef11e879bcd897629d30b7de5bbd88f6b66b1bf1cdd297db6f8a50757f" },
          { command: 'docker run -d --name probe --network shop-net lantern/toolbox:1.0', output: "818d1aea4002505a906788dc4f5d97f5181db7d791f5db3527deb7e0dff40bf1" },
          { command: 'docker exec probe getent hosts db', output: "172.18.0.2      db" },
          { command: 'docker exec probe getent hosts db.shop-net', output: "172.18.0.2      db.shop-net" },
          { command: 'docker exec probe nc -zv db 5432', output: "Connection to db (172.18.0.2) 5432 port [tcp/*] succeeded!" },
          { command: 'docker exec probe curl -s http://api:3000/health', output: "{\"status\":\"ok\"}" },
          { command: 'docker exec probe cat /etc/resolv.conf', output: "# Generated by Docker Engine.\n# This file can be edited; Docker Engine will not make further changes once it\n# has been modified.\n\nnameserver 127.0.0.11\noptions ndots:0\n\n# Based on host file: '/etc/resolv.conf' (internal resolver)\n# ExtServers: [host(127.0.0.53)]\n# Overrides: []\n# Option ndots from: internal" },
          { command: "docker ps --format 'table {{.Names}}\\t{{.Networks}}'", output: "NAMES     NETWORKS\nprobe     shop-net\napi       shop-net\ndb        bridge,shop-net" },
          { command: 'docker logs api', output: "lantern-api 2.3.0 listening on :3000\n172.18.0.4 - - [22/Nov/2026:10:00:00 +0000] \"GET /health HTTP/1.1\" 200 16 \"-\" \"curl/8.5.0\" \"-\"" },
        ],
      },
      {
        id: 'dkr08-ports', title: '容器埠、公開埠與 localhost', machine: 'dkr08-shop',
        description: 'api 以 -p 8080:3000 公開：主機連 8080，容器之間連 api:3000；api:8080 與容器裡的 localhost 都被拒絕；另一個網路的容器查不到名稱，用位址也逾時。',
        steps: [
          { command: "docker ps --format 'table {{.Names}}\\t{{.Ports}}\\t{{.Networks}}'", output: "NAMES     PORTS                                         NETWORKS\nprobe                                                   shop-net\napi       0.0.0.0:8080->3000/tcp, [::]:8080->3000/tcp   shop-net\ndb        5432/tcp                                      shop-net" },
          { command: 'curl -s localhost:8080/health', output: "{\"status\":\"ok\"}" },
          { command: 'docker exec probe curl -s http://api:3000/health', output: "{\"status\":\"ok\"}" },
          { command: 'docker exec probe curl http://api:8080/health', output: "curl: (7) Failed to connect to api port 8080 after 0 ms: Couldn't connect to server" },
          { command: 'docker exec probe curl http://localhost:3000/health', output: "curl: (7) Failed to connect to localhost port 3000 after 0 ms: Couldn't connect to server" },
          { command: 'docker run -d --name stray lantern/toolbox:1.0', output: "bb04d4e35e333281e40935ccbebe4a3b08f051650c683fe6796935c274d12411" },
          { command: 'docker exec stray curl http://api:3000/health', output: "curl: (6) Could not resolve host: api" },
          { command: 'docker exec stray curl http://172.18.0.3:3000/health', output: "curl: (7) Failed to connect to 172.18.0.3 port 3000 after 127000 ms: Couldn't connect to server" },
          { command: 'docker logs api', output: "lantern-api 2.3.0 listening on :3000\n172.18.0.1 - - [22/Nov/2026:10:00:00 +0000] \"GET /health HTTP/1.1\" 200 16 \"-\" \"curl/8.5.0\" \"-\"\n172.18.0.4 - - [22/Nov/2026:10:00:00 +0000] \"GET /health HTTP/1.1\" 200 16 \"-\" \"curl/8.5.0\" \"-\"" },
        ],
      },
      {
        id: 'dkr08-connect', title: '前端與後端兩個網路', machine: 'dkr08-tiers',
        description: 'proxy 在 front-net、api 與 db 在 back-net。先把 proxy 接上 back-net（連 db 也看得到），再改成讓 api 加入 front-net；用 inspect 的樣板讀出各網路的位址。',
        steps: [
          { command: "docker ps --format 'table {{.Names}}\\t{{.Ports}}\\t{{.Networks}}'", output: "NAMES     PORTS                                     NETWORKS\nproxy     0.0.0.0:8080->80/tcp, [::]:8080->80/tcp   front-net\napi       3000/tcp                                  back-net\ndb        5432/tcp                                  back-net" },
          { command: 'docker exec proxy getent hosts api; echo $?', output: "2" },
          { command: 'docker network connect back-net proxy', output: "" },
          { command: 'docker exec proxy getent hosts api', output: "172.19.0.3      api" },
          { command: "docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}' proxy", output: "back-net=172.19.0.4 front-net=172.18.0.2 " },
          { command: "docker inspect -f '{{.NetworkSettings.Networks.back-net.IPAddress}}' proxy", output: "template parsing error: template: :1: bad character U+002D '-'" },
          { command: "docker inspect -f '{{(index .NetworkSettings.Networks \"back-net\").IPAddress}}' proxy", output: "172.19.0.4" },
          { command: "docker network inspect -f '{{range .Containers}}{{.Name}}={{.IPv4Address}} {{end}}' back-net", output: "proxy=172.19.0.4/16 api=172.19.0.3/16 db=172.19.0.2/16 " },
          { command: 'docker exec proxy getent hosts db', output: "172.19.0.2      db" },
          { command: 'docker network disconnect back-net proxy', output: "" },
          { command: 'docker network connect front-net api', output: "" },
          { command: 'docker exec proxy getent hosts api', output: "172.18.0.3      api" },
          { command: 'docker exec proxy getent hosts db; echo $?', output: "2" },
          { command: 'docker exec api getent hosts db', output: "172.19.0.2      db" },
        ],
      },
      {
        id: 'dkr08-host-none', title: 'host 網路與 none 網路', machine: 'dkr08-lantern',
        description: 'host 網路的 nginx 直接在主機的 80 埠監聽，-p 被忽略，第二個搶同一個埠就結束；none 網路只有 loopback。',
        steps: [
          { command: 'docker run -d --name edge --network host -p 9000:80 nginx:1.27', output: "WARNING: Published ports are discarded when using host network mode\n051be8bdf1d51fb68801509001b90467faff920eea965cabe4dbb29b0cc3f8af" },
          { command: "docker ps --format '{{.Names}} [{{.Ports}}] {{.Networks}}'", output: "edge [] host\ndb [5432/tcp] bridge" },
          { command: 'sudo ss -tlnp sport = :80', output: "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      4096         0.0.0.0:80        0.0.0.0:*    users:((\"nginx\",pid=904,fd=3))" },
          { command: 'curl -s localhost:80 | head -n 1', output: "<!DOCTYPE html>" },
          { command: 'curl -s localhost:9000; echo $?', output: "7" },
          { command: 'docker exec edge hostname', output: "lantern-01" },
          { command: "docker inspect -f '{{.HostConfig.NetworkMode}}' edge", output: "host" },
          { command: 'docker run -d --name edge2 --network host nginx:1.27', output: "8a52af2109c42d8f2dac2ba728be0b89b2bdaa23a2fcc08dee843f95205055db" },
          { command: "docker ps -a --filter name=edge2 --format '{{.Status}}'", output: "Exited (1) Less than a second ago" },
          { command: 'docker run --rm --network none lantern/toolbox:1.0 getent hosts db; echo $?', output: "2" },
          { command: 'docker run --rm --network none lantern/toolbox:1.0 cat /etc/hosts', output: "127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\nfe00::\tip6-localnet\nff00::\tip6-mcastprefix\nff02::1\tip6-allnodes\nff02::2\tip6-allrouters" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr08-ex-dns', title: '讓 api 以名稱找到 db', machine: 'dkr08-dns',
        statement: 'lantern-01 上的 api 與 db 都是不加 `--network` 啟動的，api 的日誌一直印 `getaddrinfo ENOTFOUND db`（先用 `docker logs api` 看看）。db 裡有正在使用的資料，請不要刪除或重建它。建立一個名為 `shop-net` 的自訂網路，讓 api 與 db 都接上它，使 api 能以名稱 `db` 連到資料庫的 5432 埠。',
        checks: [
          { kind: 'network', name: 'shop-net', container: 'db', driver: 'bridge' },
          { kind: 'network', name: 'shop-net', container: 'api' },
          { kind: 'container', name: 'db', state: 'running', image: 'postgres:17' },
          { kind: 'container', name: 'api', state: 'running' },
          { kind: 'reach', container: 'api', to: 'db', port: 5432, result: 'succeeded' },
        ],
        solution: ['docker network create shop-net', 'docker network connect shop-net db', 'docker network connect shop-net api', 'docker exec api getent hosts db'],
        mistakes: [
          { commands: ['docker restart api'], why: '重新啟動不會改變網路：api 仍在預設 bridge 上，那裡沒有名稱解析' },
          { commands: ['docker network create shop-net', 'docker network connect shop-net api'], why: '只有 api 接上 shop-net，db 不在上面，內建 DNS 不知道 db' },
          { commands: ['docker rm -f api', 'docker run -d --name api -e DB_HOST=172.17.0.2 lantern/api:2.3'], why: '把位址寫死在設定裡：仍然查不到 db 這個名稱，db 重新啟動換了位址就會再壞一次' },
          { commands: ['docker network create shop-net', 'docker network connect shop-net db', 'docker run -d --name api2 --network shop-net lantern/api:2.3'], why: '另外啟動了 api2，題目的 api 還留在預設 bridge 上' },
        ],
        hints: [
          '`docker ps --format "{{.Names}} {{.Networks}}"` 看兩個容器在哪個網路上。',
          '`docker network create shop-net` 建立自訂網路。',
          '`docker network connect shop-net 容器` 讓執行中的容器加入網路，不用重建；兩個容器都要接上。',
        ],
        explanation: '預設 bridge 只能用位址互連，api 設定的 `DB_HOST=db` 在那裡查不到。`docker network create shop-net` 建立自訂網路後，用 `docker network connect` 把執行中的 db 與 api 都接上：兩者有了共同的自訂網路，api 的 /etc/resolv.conf 指向 Docker 的內建 DNS 127.0.0.11，`db` 解析成 db 在 shop-net 上的位址，5432 就連得到了。db 沒有重建，資料與原本的位址都保留。只接其中一個、重新啟動、或把位址寫死在設定裡，都沒有解決名稱解析。',
      },
      {
        id: 'dkr08-ex-port', title: 'worker 不該連 localhost:8080', machine: 'dkr08-port',
        statement: 'api 在 shop-net 上，並以 `-p 8080:3000` 公開給主機。同事把在筆電上測試的設定照搬，worker 容器的 `API_URL` 是 `http://localhost:8080`，日誌一直印 `connect ECONNREFUSED 127.0.0.1:8080`。請以 lantern/worker:1.1 重新建立名為 `worker` 的容器（背景執行），接在 shop-net 上，並把環境變數 `API_URL` 設成 worker 在容器之間應該使用的網址，讓它以名稱連到 api 的服務。不要用 host 網路，也不要動 api。',
        checks: [
          { kind: 'container', name: 'worker', state: 'running', image: 'lantern/worker:1.1', env: 'API_URL=http://api:3000' },
          { kind: 'network', name: 'shop-net', container: 'worker' },
          { kind: 'reach', container: 'worker', to: 'api', port: 3000, result: 'succeeded' },
          { kind: 'container', name: 'api', state: 'running', port: '8080:3000' },
        ],
        solution: ['docker rm -f worker', 'docker run -d --name worker --network shop-net -e API_URL=http://api:3000 lantern/worker:1.1'],
        mistakes: [
          { commands: ['docker network connect shop-net worker'], why: '接上了 shop-net，但 API_URL 仍是 localhost:8080：容器裡的 localhost 是 worker 自己' },
          { commands: ['docker rm -f worker', 'docker run -d --name worker --network shop-net -e API_URL=http://api:8080 lantern/worker:1.1'], why: '8080 是公開到主機的埠，api 容器裡監聽的是 3000，容器之間連 api:8080 會被拒絕' },
          { commands: ['docker rm -f worker', 'docker run -d --name worker --network shop-net -e API_URL=http://localhost:3000 lantern/worker:1.1'], why: '容器埠對了，但 localhost 仍然是 worker 自己，不是 api' },
          { commands: ['docker rm -f worker', 'docker run -d --name worker -e API_URL=http://api:3000 lantern/worker:1.1'], why: '少了 --network shop-net：worker 在預設 bridge 上，查不到 api 這個名稱' },
          { commands: ['docker rm -f worker', 'docker run -d --name worker --network host -e API_URL=http://localhost:8080 lantern/worker:1.1'], why: '用 host 網路繞經主機的公開埠：能連上，但失去隔離，而且 api 的 -p 一拿掉就壞了' },
        ],
        hints: [
          '`docker logs worker` 與 `docker inspect -f "{{.Config.Env}}" worker` 看它現在的設定。',
          '環境變數在建立容器時就決定了：先 `docker rm -f worker`，再用新的 `-e` 重新 `docker run`。',
          '容器之間用「服務名稱＋容器埠」：api 在容器裡聽 3000。',
        ],
        explanation: '`-p 8080:3000` 只在主機那一邊開了 8080；容器裡的 localhost 是容器自己，所以 worker 連 `localhost:8080` 被拒絕。環境變數不能對既有的容器修改，要刪掉重建：`docker run -d --name worker --network shop-net -e API_URL=http://api:3000 lantern/worker:1.1` 讓 worker 和 api 在同一個自訂網路上，內建 DNS 把 api 解析成它的位址，3000 是 api 真正監聽的容器埠。寫成 `api:8080` 會被拒絕（那是主機埠），寫成 `localhost:3000` 仍然連到自己，少了 `--network` 則查不到名稱。',
      },
      {
        id: 'dkr08-ex-isolate', title: '讓資料庫只對 api 開放', machine: 'dkr08-flat',
        statement: 'proxy（對外的 nginx）、api 與 db 現在全都在 shop-net 上，所以 proxy 也連得到資料庫。請建立名為 `back-net` 的自訂網路，調整網路的連接（不要刪除或重建任何容器），使得：api 能以名稱 `db` 連到 5432 埠；proxy 仍能以名稱 `api` 連到 3000 埠；proxy 再也連不到 db。',
        checks: [
          { kind: 'network', name: 'back-net', container: 'db', driver: 'bridge' },
          { kind: 'reach', container: 'api', to: 'db', port: 5432, result: 'succeeded' },
          { kind: 'reach', container: 'proxy', to: 'api', port: 3000, result: 'succeeded' },
          { kind: 'reach', container: 'proxy', to: 'db', port: 5432, result: 'unresolved' },
          { kind: 'container', name: 'db', state: 'running' },
          { kind: 'container', name: 'proxy', state: 'running', port: '8080:80' },
        ],
        solution: ['docker network create back-net', 'docker network connect back-net db', 'docker network connect back-net api', 'docker network disconnect shop-net db'],
        mistakes: [
          { commands: ['docker network create back-net', 'docker network connect back-net db', 'docker network connect back-net api'], why: 'db 還留在 shop-net 上，proxy 照樣查得到、連得到它' },
          { commands: ['docker network create back-net', 'docker network connect back-net db', 'docker network disconnect shop-net db'], why: '忘了讓 api 加入 back-net：api 和 db 沒有共同的網路，查不到 db' },
          { commands: ['docker network create back-net', 'docker network connect back-net db', 'docker network connect back-net api', 'docker network connect back-net proxy', 'docker network disconnect shop-net db'], why: '把 proxy 也接上 back-net，它又能連到 db 了' },
          { commands: ['docker network create back-net', 'docker network connect back-net db', 'docker network connect back-net api', 'docker network disconnect shop-net api'], why: '斷開的是 api 而不是 db：proxy 連不到 api，卻仍然連得到 db' },
        ],
        hints: [
          '先畫出目標：shop-net 上有 proxy 與 api，back-net 上有 api 與 db；api 是唯一同時在兩個網路上的容器。',
          '`docker network connect back-net 容器` 加入，`docker network disconnect shop-net 容器` 離開，都不用重新啟動。',
          '驗證：`docker exec api getent hosts db`、`docker exec proxy getent hosts db; echo $?`。',
        ],
        explanation: '名稱只在共同的自訂網路上查得到，不同網路之間用位址也連不過去。讓 db 與 api 加入 back-net、再把 db 從 shop-net 斷開之後，proxy 只和 api 共享 shop-net，api 同時在兩個網路上：proxy 連 `api:3000` 成功，api 連 `db:5432` 成功，proxy 查 db 則找不到。db 沒有 `-p`，也就沒有從主機進來的路。忘了斷開 db、忘了讓 api 加入 back-net、或把 proxy 也接上 back-net，都會留下一條不該有的路或少了一條該有的路。',
      },
      {
        id: 'dkr08-ex-ip', title: '查出 api 的位址', machine: 'dkr08-shop',
        statement: '排查時需要 api 容器在它所在網路上的 IP 位址。用 `docker inspect`（或 `docker network inspect`）查出來，只印出位址本身（一行，例如 `172.18.0.9`，不含 /16）。',
        checks: [{ kind: 'output', fromCommand: '^(sudo )?docker (container |network )?inspect ' }],
        solution: ["docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' api"],
        mistakes: [
          { commands: ["docker inspect -f '{{.NetworkSettings.IPAddress}}' api"], why: '這個舊欄位只記錄預設 bridge 上的位址；api 只在 shop-net 上，所以印出空字串' },
          { commands: ['echo 172.18.0.3'], why: '直接打出答案，沒有查詢；換一台機器位址就不同了' },
          { commands: ["docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' probe"], why: '查成 probe 容器的位址了' },
          { commands: ["docker network inspect -f '{{range .Containers}}{{.IPv4Address}} {{end}}' shop-net"], why: '印出網路上所有容器的位址，而且帶著 /16' },
        ],
        variants: [
          { label: 'shop-net 的子網路是 10.30.0.0/24 的 lantern-01', files: [], docker: IP_OTHER_SUBNET },
          { label: 'api 比 probe 晚啟動的 lantern-01', files: [], docker: IP_LATER },
        ],
        hints: [
          '`docker inspect -f` 的樣板可以取出 `.NetworkSettings.Networks` 底下每個網路的 `.IPAddress`。',
          '`{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}` 走過每一個網路；api 只在一個網路上，所以只印一個位址。',
          '`.NetworkSettings.IPAddress` 只有預設 bridge 的位址。',
        ],
        explanation: '`docker inspect -f \'{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}\' api` 走過 api 接上的每一個網路並印出位址；api 只在 shop-net 上，所以得到一個位址。這台機器上是 172.18.0.3；子網路是 10.30.0.0/24 的那台是 10.30.0.3；api 比 probe 晚啟動的那台，api 拿到的是下一個空號 172.18.0.4。位址由啟動順序與子網路決定，所以設定檔裡不該寫它。舊的 `.NetworkSettings.IPAddress` 只記錄預設 bridge 的位址，對只在自訂網路上的容器是空的；也可以寫 `{{(index .NetworkSettings.Networks "shop-net").IPAddress}}` 指定網路。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr08-q1', prompt: '兩個容器都是不加 `--network` 啟動的。從 web 容器執行 `getent hosts db` 什麼也沒印、結束碼是 2，但 `ping` db 的位址是通的。原因是什麼？',
      options: ['db 容器沒有用 `-p` 公開 5432 埠', '預設的 bridge 網路不提供容器名稱的解析，只能用位址互連', 'db 的防火牆擋掉了 DNS 查詢', 'web 容器的 Image 裡沒有 getent'],
      answer: 1,
      explanation: '兩個容器都在預設 bridge 上，位址互通，但那裡的 /etc/resolv.conf 是主機的名稱伺服器，沒有人認識容器名稱；名稱解析是自訂網路的內建 DNS 才有的。`-p` 只和主機有關，與名稱查詢無關；題目沒有任何防火牆的跡象；Image 沒有 getent 時錯誤是 executable file not found，而不是靜靜地回傳 2。',
    },
    {
      id: 'dkr08-q2', prompt: '容器接在自訂網路 shop-net 上，`cat /etc/resolv.conf` 裡的 `nameserver 127.0.0.11` 是什麼？',
      options: ['主機的 systemd-resolved', 'shop-net 的閘道', '另一個專門跑 DNS 的容器', 'Docker 的內建 DNS 伺服器，回答同一個網路上容器的名稱與別名'],
      answer: 3,
      explanation: '127.0.0.11 是 dockerd 在每個接上自訂網路的容器裡提供的內建 DNS，它知道同網路上執行中容器的名稱、別名與 名稱.網路，外部名稱再轉給主機的名稱伺服器。主機的 systemd-resolved 是 127.0.0.53；閘道是 172.18.0.1 這類位址；Docker 不需要額外的 DNS 容器。',
    },
    {
      id: 'dkr08-q3', prompt: 'api 以 `docker run -d --name api --network shop-net -p 8080:3000 lantern/api:2.3` 啟動。同在 shop-net 上的 worker 容器應該用哪個網址連 api？',
      options: ['`http://api:3000`', '`http://api:8080`', '`http://localhost:8080`', '`http://172.17.0.1:3000`'],
      answer: 0,
      explanation: '容器之間直接連對方的容器埠，名稱由內建 DNS 解析，所以是 `api:3000`。8080 是公開在主機上的埠，api 容器裡沒有程式聽 8080，連線會被拒絕；worker 裡的 localhost 是 worker 自己；172.17.0.1 是預設 bridge 的閘道（主機那一邊），不是 api。',
    },
    {
      id: 'dkr08-q4', prompt: '容器 a 在 front-net、容器 b 在 back-net（兩個不同的自訂網路），a 用 b 的位址連 b 的服務。會發生什麼事？',
      options: ['成功，因為用的是位址而不是名稱', '被拒絕，因為 b 沒有用 `-p` 公開', '連不到（逾時）：不同的網路彼此隔離，用位址也過不去', '成功，但要經過 docker-proxy'],
      answer: 2,
      explanation: 'Docker 以 iptables 規則隔離不同的 bridge 網路，封包不會在兩個網路之間轉送，所以用位址也一樣到不了，模擬環境表現為逾時。名稱與位址的差別只在解析那一步；`-p` 是給主機與外界的，不是打通網路的方法；docker-proxy 只處理主機埠的連線。',
    },
    {
      id: 'dkr08-q5', prompt: 'proxy 在 front-net、api 在 back-net，現在 proxy 查不到 api。不重建任何容器，要讓 proxy 能以名稱連到 api，應該用哪個指令？',
      options: ['`docker network connect front-net api`', '`docker restart proxy`', '`docker run --link api proxy`', '`docker network create front-net`'],
      answer: 0,
      explanation: '`docker network connect` 讓執行中的 api 加入 front-net，兩者有了共同的自訂網路，proxy 就能用名稱 api 找到它，而且 db 仍留在只有 api 進得去的 back-net。重新啟動不改變網路；`--link` 是舊功能而且需要新建容器；front-net 已經存在，再建立一次只會得到 already exists 的錯誤。',
    },
    {
      id: 'dkr08-q6', prompt: '用 `docker run -d --network host -p 9000:80 nginx:1.27` 啟動容器後，下列敘述何者正確？',
      options: ['主機的 9000 轉到容器的 80', 'nginx 直接在主機的 80 埠監聽，`-p` 被忽略', '容器有自己的 172.17 位址', '可以再用 `docker network connect` 讓它加入 shop-net'],
      answer: 1,
      explanation: 'host 網路的容器直接用主機的網路，nginx 聽 80 就是主機的 80；Docker 印出 Published ports are discarded 的警告並忽略 `-p`，所以 9000 沒有任何轉送。它沒有自己的位址；host 網路的容器也不能再接到其他網路，connect 會得到錯誤。',
    },
    {
      id: 'dkr08-q7', prompt: 'api 只接在自訂網路 shop-net 上。`docker inspect -f \'{{.NetworkSettings.IPAddress}}\' api` 印出空行，代表什麼？',
      options: ['api 已經停止，位址被釋放了', 'api 沒有任何網路', 'shop-net 沒有設定子網路', '這個舊欄位只記錄預設 bridge 的位址；要從 `.NetworkSettings.Networks` 讀 shop-net 上的位址'],
      answer: 3,
      explanation: '`.NetworkSettings.IPAddress` 只對應預設 bridge，只在自訂網路上的容器在這裡是空的，位址要用 range 或 index 從 `.NetworkSettings.Networks` 讀出來。題目說 api 接在 shop-net 上，所以它有網路；停止的容器確實會釋放位址，但空行本身不能證明這一點；自訂網路一定有子網路（沒指定時 Docker 自動分配）。',
    },
  ],
};

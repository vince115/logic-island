/*
 * DKR07 Volumes and Persistent Data (DKR-3, terminal-sim). A terminal lesson on the storage-net profile (engine stage
 * E22): why the container's writable layer is the wrong place for data (lost on docker rm, tied to one container, the
 * storage driver's copy-on-write); named volumes (docker volume create, ls, inspect and the Mountpoint under
 * /var/lib/docker/volumes, root-only on the host, surviving docker rm, shared between containers, in use, copy-up into an
 * empty volume and only then); bind mounts (the host's files both ways and live, typical for development, :ro, no copy-up,
 * -v creating a missing source as root while --mount refuses it, a name without ./ or / being a volume); tmpfs for scratch
 * and secret data (emptied when the container stops); --mount versus -v; anonymous volumes from an image's VOLUME, docker
 * rm -v and docker volume prune (anonymous only, -a for all unused); backing up and restoring a volume with a throwaway
 * container and tar (-C so that the archive's paths are relative; stopping the database first); owners as numbers (the
 * container's root writing root-owned files, a non-root USER with UID 10001 and a root-owned bind mount; chown to that UID
 * or -u, never chmod 777). Machine: the Docker host cellar-07 (user yu in the docker group; nginx, postgres 17.1 and 17.2
 * with a VOLUME, alpine, debian and two team images, shop/ledger without a volume and shop/export running as UID 10001;
 * a shopdata volume used by the running shop-db; the folders site, notes, backups and a root-owned exports). Storage
 * drivers, overlay2 and volume drivers other than local are text only. The host, user, team images and data are made up.
 * Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalDocker, TerminalImage, TerminalVolume } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n';
const ALPINE = 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n';
const WELCOME = '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body><h1>Welcome to nginx!</h1></body>\n</html>\n';

const postgres = (tag: string, created: string): TerminalImage => ({
  name: `postgres:${tag}`, size: 438_200_000, created, entrypoint: ['docker-entrypoint.sh'], cmd: ['postgres'],
  env: [PATH_ENV, 'PG_MAJOR=17', `PG_VERSION=${tag}-1.pgdg120+1`, 'PGDATA=/var/lib/postgresql/data'], expose: [5432], service: true, layers: 5, pulled: true, osRelease: DEBIAN,
  volumes: ['/var/lib/postgresql/data'], logs: ['LOG:  database system is ready to accept connections'],
  files: [
    { path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash\npostgres:x:999:999::/var/lib/postgresql:/bin/bash\n' }, { path: '/etc/group', content: 'root:x:0:\npostgres:x:999:\n' },
    { path: '/var/lib/postgresql/data/PG_VERSION', content: '17\n' },
  ],
});

const ORDERS = 'id,item,qty\n1,matcha,2\n2,oolong,1\n';
const REPORT = 'date,orders\n2026-11-22,41\n';

const images = (report = REPORT): TerminalImage[] => [
  {
    name: 'nginx:1.27', size: 191968432, created: '2026-11-05 09:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], env: [PATH_ENV, 'NGINX_VERSION=1.27.3'],
    expose: [80], http: { port: 80, responder: 'nginx-files', accessLog: 'nginx' }, service: true, layers: 7, pulled: true, osRelease: DEBIAN,
    logs: ['/docker-entrypoint.sh: Configuration complete; ready for start up'],
    files: [{ path: '/usr/share/nginx/html/index.html', content: WELCOME }, { path: '/usr/share/nginx/html/50x.html', content: '<h1>An error occurred.</h1>\n' }],
  },
  postgres('17.1', '2026-11-08 08:00:00'),
  postgres('17.2', '2026-11-21 08:00:00'),
  {
    // A team image that keeps its data in /srv/data and declares no VOLUME: the data lands in the writable layer.
    name: 'shop/ledger:2.1', size: 61_400_000, created: '2026-11-20 12:00:00', cmd: ['/srv/ledger'], workdir: '/srv', expose: [8000], service: true, pulled: true, registry: false,
    osRelease: DEBIAN, logs: ['ledger 2.1 using /srv/data/ledger.csv'], files: [{ path: '/srv/ledger', content: '' }, { path: '/srv/data/ledger.csv', content: 'id,item,qty\n1,matcha,2\n' }],
  },
  {
    // A team image whose USER is app (UID 10001); it copies its report into a mounted folder.
    name: 'shop/export:1.0', size: 29_800_000, created: '2026-11-20 12:00:00', cmd: ['sh'], pulled: true, registry: false, osRelease: DEBIAN, user: 'app',
    files: [
      { path: '/srv/report.csv', content: report }, { path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/sh\napp:x:10001:10001::/home/app:/bin/sh\n' },
      { path: '/etc/group', content: 'root:x:0:\napp:x:10001:\n' },
    ],
  },
  { name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1, osRelease: ALPINE },
  { name: 'debian:12', size: 116_500_000, created: '2026-10-20 12:00:00', cmd: ['bash'], pulled: true, layers: 1, osRelease: DEBIAN },
];

const shopdata = (orders: string): TerminalVolume => ({
  name: 'shopdata', created: '2026-11-21 09:00:00', files: [{ path: '/PG_VERSION', content: '17\n', owner: '999' }, { path: '/orders.csv', content: orders, owner: '999' }],
});
const docker = (orders = ORDERS, report = REPORT): TerminalDocker => ({
  images: images(report), volumes: [shopdata(orders)],
  containers: [{ name: 'shop-db', image: 'postgres:17.1', state: 'running', created: '2026-11-21 09:00:00', started: '2026-11-21 09:00:01', volumes: ['shopdata:/var/lib/postgresql/data'] }],
});

const CELLAR: TerminalMachine = {
  id: 'dkr07-cellar', title: 'cellar-07（Docker 主機：茶行的帳本、資料庫與網站）', user: 'yu', host: 'cellar-07', cwd: '/home/yu', profile: 'storage-net',
  now: '2026-11-23 10:00:00', boot: '2026-11-23 06:00:00',
  files: [
    dir('/home'), dir('/home/yu', 'yu'),
    dir('/home/yu/site', 'yu'), file('/home/yu/site/index.html', '<h1>今日茶單：煎茶、烏龍</h1>\n', 'yu'),
    dir('/home/yu/notes', 'yu'), dir('/home/yu/backups', 'yu'),
    // Made by an earlier `docker run -v ~/exports:/data …` before the folder existed: Docker created it as root.
    dir('/home/yu/exports'),
  ],
  accounts: { groups: [{ name: 'sudo', members: ['yu'] }, { name: 'docker', gid: 988, members: ['yu'] }] },
  responders: [{ id: 'nginx-files', server: 'nginx/1.27.3', routes: [{ path: '/*', root: '/usr/share/nginx/html' }] }],
  docker: docker(),
};

const PG_DATA = '/var/lib/postgresql/data';
const MENU = "<h1>今日茶單：煎茶、烏龍、東方美人</h1>";
const EXPORT = 'docker run --rm -v ~/exports:/data shop/export:1.0 cp /srv/report.csv /data/report.csv';

export const DKR07: LessonContent = {
  lessonId: 'DKR07',
  motivation: 'DKR03 證明過：容器的可寫層撐得過 docker stop，撐不過 docker rm。可是在真實的維運裡，刪除容器是家常便飯——升級 Image 的版本、改一個環境變數、換一個連接埠，做法都是刪掉舊容器、用新的設定再 docker run 一個。如果資料庫把資料寫在可寫層，每次升級就是一次刪庫。Docker 的答案是把資料放到容器「外面」，再掛載（mount）進容器：Docker 自己管理的 Volume、主機上的一個資料夾（bind mount），或只存在記憶體裡的 tmpfs。這一課在茶行的 Docker 主機 cellar-07 上，先親眼看可寫層裡的帳本隨容器消失，再用具名 Volume 讓資料撐過 docker rm、在容器之間共用、以 tar 備份與還原；用 bind mount 讓主機上改好的網頁立刻上線；用 tmpfs 放不該落地的秘密；最後處理最常見的掛載問題——容器以 UID 10001 執行，卻寫不進主機上屬於 root 的資料夾。學完之後，你能讓容器化的資料庫重建、升級之後資料一筆都不少。',
  sections: [
    {
      id: 'dkr07-s-layer', title: '可寫層留不住資料',
      blocks: [
        { type: 'p', text: '容器的檔案系統是 Image 的唯讀層加上一層屬於這個容器的可寫層（DKR03、DKR06）。容器裡新增或修改的檔案都寫進可寫層，所以它有三個問題：第一，可寫層和容器同生共死，`docker rm` 一下就和日誌一起消失，而升級、改設定都要刪掉容器重建；第二，它綁在一個容器上，別的容器讀不到，主機上也沒有一個方便的路徑可以備份；第三，寫入要經過儲存驅動程式（overlay2）的 copy-on-write——第一次修改 Image 裡的檔案時要先把整個檔案複製到可寫層，資料庫這種大量寫入的工作負載會比直接寫在主機的檔案系統上慢。' },
        { type: 'p', text: '下面的 shop/ledger:2.1 是茶行自己的帳本服務，它把資料寫在容器裡的 /srv/data/ledger.csv，Image 沒有宣告任何 Volume。先讓它記一筆帳，刪掉容器再重建，看那筆帳還在不在；再改用具名 Volume ledgerdata 掛在 /srv/data，重做一次：' },
        { type: 'example', id: 'dkr07-layer-volume' },
        { type: 'p', text: '第一次重建之後，2,oolong,1 那一筆不見了：它在舊容器的可寫層裡，跟著 `docker rm -f` 一起被刪除，新容器從 Image 的原始內容開始。改用 `-v ledgerdata:/srv/data` 之後，容器在 /srv/data 看到的是 Volume 的內容，寫入直接進到 Volume；容器刪掉了，`docker volume ls` 仍列出 ledgerdata，資料就在主機的 /var/lib/docker/volumes/ledgerdata/_data，新容器掛上同一個 Volume 就接著用。注意兩件事：一般使用者連 /var/lib/docker/volumes 都列不出來，要 `sudo` 才看得到（這個資料夾屬於 root，也不該直接去改它）；有容器正在使用的 Volume 不能刪除，`docker volume rm` 會列出使用它的容器 ID。' },
        { type: 'table', head: ['掛載方式', '資料在主機的哪裡', '由誰管理', '撐得過 docker rm', '典型用途'], rows: [
          ['具名 Volume（`-v 名稱:/路徑`）', '/var/lib/docker/volumes/名稱/_data', 'Docker（`docker volume` 指令）', '是，直到 `docker volume rm`', '資料庫、上傳的檔案等正式環境的資料'],
          ['Bind mount（`-v /主機路徑:/路徑`）', '你指定的任何資料夾或檔案', '你自己（一般的檔案操作）', '是，它本來就是主機的檔案', '開發時的原始碼、設定檔、要和主機交換的檔案'],
          ['tmpfs（`--tmpfs /路徑`）', '不在磁碟上，只在記憶體裡', 'Docker', '否，容器一停止就清空', '暫存檔、不該寫到磁碟的秘密'],
          ['可寫層（不掛載）', '儲存驅動程式的內部資料夾', 'Docker', '否', '只放執行期間的暫存，不放任何要保留的東西'],
        ] },
      ],
    },
    {
      id: 'dkr07-s-volume', title: '具名 Volume：交給 Docker 管理',
      blocks: [
        { type: 'p', text: 'Volume 是 Docker 管理的一塊儲存空間，用預設的 local 驅動程式時就是主機上的一個資料夾。它有自己的名稱與生命週期，和任何容器都無關：容器刪了 Volume 還在，Volume 也可以同時掛進好幾個容器。常用的指令如下：' },
        { type: 'table', head: ['指令', '作用'], rows: [
          ['`docker volume create 名稱`', '建立 Volume（已存在也只是印出名稱）；`docker run -v 名稱:/路徑` 遇到不存在的名稱也會自動建立'],
          ['`docker volume ls`', '列出 Volume；`-f dangling=true` 只列沒有任何容器使用的'],
          ['`docker volume inspect 名稱`', '印出 JSON：Mountpoint（主機上的路徑）、Driver、CreatedAt；`-f \'{{.Mountpoint}}\'` 只取一個欄位'],
          ['`docker volume rm 名稱`', '刪除 Volume 與裡面的資料；有容器（不論是否執行中）在用時拒絕'],
          ['`docker volume prune`', '刪除沒有容器使用的匿名 Volume（第四節）'],
        ] },
        { type: 'p', text: 'Volume 還有一個 bind mount 沒有的特性：copy-up。把一個空的 Volume 掛到容器裡某個路徑時，如果 Image 在那個路徑本來就有檔案，Docker 會先把它們（連同資料夾的擁有者與權限）複製進 Volume。上一個範例裡新建的 ledgerdata 一掛上就有 ledger.csv，就是這個原因。bind mount 永遠不複製：掛上一個空資料夾，容器在那個路徑就只看到空的資料夾，Image 原本的檔案被整個蓋住。' },
        { type: 'example', id: 'dkr07-copy-up' },
        { type: 'p', text: 'notice-html 是新的 Volume，所以 nginx 的 index.html 與 50x.html 被 copy-up 進去，在主機的 _data 裡看得到。接著另一個 alpine 容器掛上同一個 Volume 改寫 index.html，nginx 的下一個回應就是新的內容——兩個容器共用同一份資料。`docker ps --format \'{{.Names}}\\t{{.Mounts}}\'` 列出每個容器掛了哪些 Volume。最後兩行是對照：`./blank` 是 bind mount，掛上空資料夾，容器裡什麼都沒有；`site` 前面沒有 `./` 也沒有 `/`，Docker 把它當成 Volume 的名稱，悄悄建立了一個叫 site 的新 Volume，還 copy-up 了 nginx 的預設網頁，主機上的 ~/site 根本沒有被用到。' },
        { type: 'callout', tone: 'warning', title: 'copy-up 只在 Volume 是空的時候發生', text: '常見的誤會是「換了新版的 Image，Volume 裡的檔案也會跟著更新」。copy-up 只發生在第一次掛上空的 Volume 時；之後 Volume 裡已經有檔案，Docker 就完全以 Volume 為準，新 Image 在同一個路徑的檔案被蓋住、看不到。這正是資料庫要的行為（升級 Image 不會覆蓋資料），但如果你把網站的靜態檔案或預設設定放在 Volume 裡，升級 Image 之後容器看到的仍是舊版的檔案。程式碼與靜態檔案應該在 Image 裡（或用 bind mount），Volume 只放執行時產生、要保留的資料。' },
      ],
    },
    {
      id: 'dkr07-s-bind', title: 'Bind mount、tmpfs 與 --mount',
      blocks: [
        { type: 'p', text: 'Bind mount 把主機上一個已經存在的資料夾或檔案直接掛進容器，兩邊看到的是同一份檔案：主機上改了，容器立刻看到；容器裡寫的，主機上立刻出現。這讓它成為開發時的首選：原始碼留在主機上用編輯器修改，容器裡的開發伺服器馬上讀到新版本，不必每改一行就重新建置 Image。設定檔也常以 bind mount 唯讀地掛進去。加上 `:ro` 讓掛載唯讀，容器裡的寫入一律被拒絕（Read-only file system），只想讓容器讀的東西都該這樣掛。' },
        { type: 'example', id: 'dkr07-bind-tmpfs' },
        { type: 'p', text: '主機上的 echo 一改，`curl` 拿到的就是新的茶單，不用重新啟動 nginx；`docker inspect` 的 Mounts 顯示 Type 是 bind、Mode 是 ro、RW 是 false。範例中段是 `-v` 與 `--mount` 最實際的差別：主機上沒有 ~/drafts 時，`--mount type=bind` 直接報錯，`-v` 卻默默以 root 的身分建立一個空資料夾——這常常是「容器裡怎麼是空的」與「這個資料夾怎麼屬於 root」的源頭。' },
        { type: 'table', head: ['', '`-v`／`--volume`', '`--mount`'], rows: [
          ['寫法', '以冒號分隔：`名稱:/路徑`、`/主機路徑:/路徑:ro`', '逗號分隔的鍵值：`type=volume,source=名稱,target=/路徑`、`type=bind,source=/主機路徑,target=/路徑,readonly`'],
          ['Volume 或 bind mount', '由第一段判斷：以 `/` 或 `./` 開頭是主機路徑，否則是 Volume 名稱', '由 `type=` 明寫：volume、bind、tmpfs'],
          ['來源資料夾不存在', '以 root 建立一個空資料夾', '錯誤：bind source path does not exist'],
          ['相對路徑', 'Docker 23 起接受 `./site`；更舊的版本要寫 `$(pwd)/site`', '建議一律寫絕對路徑，例如 `source=$(pwd)/site`'],
          ['tmpfs', '另一個選項 `--tmpfs /路徑`', '`type=tmpfs,target=/路徑`'],
        ] },
        { type: 'p', text: '兩種寫法的效果相同，`--mount` 較長但每個欄位的意思都寫在字面上，Docker 文件一般建議使用這種較明確的寫法；`-v` 短、在網路上的範例裡最常見。重要的是讀得懂兩種寫法，並記得 `-v` 的那兩個陷阱：沒有 `/` 或 `./` 的來源是 Volume 名稱，不存在的主機路徑會被自動建立。' },
        { type: 'p', text: 'tmpfs 掛載把一個路徑放在記憶體裡：寫得快、不佔磁碟，而且容器一停止（`docker stop`、程式結束、`docker restart`）內容就全部消失，也不會寫進主機的檔案系統或容器的可寫層（只有記憶體不足時，核心可能把它換出到 swap）。適合放大量的暫存檔，以及 token、解密後的金鑰這類不該留下痕跡的秘密——範例裡的 token 在 `docker restart` 之後就不見了。tmpfs 不能在容器之間共用，也只在 Linux 主機上有。' },
        { type: 'callout', tone: 'warning', title: '`-v site:/路徑` 不是主機上的 site 資料夾', text: '在 ~ 裡打 `docker run -v site:/usr/share/nginx/html nginx`，本意是掛主機的 ~/site，結果卻是一個名為 site 的新 Volume：nginx 照樣啟動、照樣回應（copy-up 來的預設網頁），沒有任何錯誤訊息，你在主機上改 ~/site 怎麼改都不會生效。寫 bind mount 時，來源一律用絕對路徑（`/home/yu/site`、`~/site` 由 Shell 展開成絕對路徑）或以 `./` 開頭；用 `--mount type=bind` 則根本不會有這個歧義。' },
      ],
    },
    {
      id: 'dkr07-s-backup', title: '匿名 Volume、清理與資料備份',
      blocks: [
        { type: 'p', text: 'Dockerfile 的 `VOLUME /路徑` 宣告「這個路徑的資料不該留在可寫層」。用這種 Image 啟動容器而沒有在那個路徑掛任何東西時，Docker 自動建立一個匿名 Volume：名稱是 64 個十六進位字，資料一樣在 /var/lib/docker/volumes 底下。官方的 postgres、mysql、redis 等 Image 都這樣宣告了資料目錄，所以「忘了加 -v」的資料庫其實沒有寫在可寫層，而是寫進了一個沒人記得名字的匿名 Volume。' },
        { type: 'table', head: ['動作', '匿名 Volume', '具名 Volume'], rows: [
          ['`docker rm 容器`', '留下，成為沒有容器使用的 dangling Volume', '留下'],
          ['`docker rm -v 容器`、以 `--rm` 啟動的容器結束', '一起刪除', '留下（`-v` 不刪具名 Volume）'],
          ['`docker volume prune`', '刪除沒有容器使用的', '不刪（Docker 23 起；舊版連具名的也刪）'],
          ['`docker volume prune -a`', '刪除沒有容器使用的', '刪除沒有容器使用的'],
          ['新容器再用同一份資料', '要先查出它的 64 字名稱，再以 `-v 名稱:/路徑` 掛上', '直接用名稱'],
        ] },
        { type: 'p', text: '所以正式環境的資料庫一定要給資料目錄一個具名 Volume：用 `-v shopdata:/var/lib/postgresql/data` 蓋過 Image 的 VOLUME，資料才有名字可以找回、備份與交接。下面先看匿名 Volume 怎麼產生與清除，再為 shopdata 做一份資料備份。' },
        { type: 'p', text: '備份 Volume 的標準做法是開一個用完即丟的容器（`--rm`）：同時掛上要備份的 Volume（唯讀）與主機上存放備份的資料夾，在容器裡用 tar 打包。這樣不必知道 Volume 在主機上的實際路徑，也不需要在主機上用 root 讀 /var/lib/docker。`-C /data .` 讓 tar 先切換到 Volume 的根目錄再打包「.」，封存檔裡的路徑是 ./orders.csv 這種相對路徑，日後可以解開到任何掛載點；寫成 `tar czf /backup/x.tgz /data` 的話，路徑會帶著 data/ 這一層。' },
        { type: 'example', id: 'dkr07-anon-backup' },
        { type: 'p', text: 'trial 沒有 `-v`，postgres 的 VOLUME 讓它得到一個匿名 Volume；`docker rm -f` 之後它成為 dangling，`docker volume prune -f` 把它清掉，shopdata 因為有名字（而且 shop-db 正在用）不受影響。備份前先 `docker stop shop-db`、備份後再 `docker start`：資料庫執行中的資料檔隨時在變，直接複製可能得到不一致的內容。`tar tvzf` 顯示封存檔保留了數字的擁有者 999（容器裡的 postgres 使用者），主機上沒有這個帳號，所以只顯示數字。' },
        { type: 'p', text: '還原是同一個模式反過來：建立新的 Volume，用另一個用完即丟的容器把封存檔解開進去——`docker volume create shopdata-test`，再 `docker run --rm -v shopdata-test:/data -v ~/backups:/backup:ro debian:12 tar xzf /backup/shopdata.tgz -C /data`。以 root 執行的 tar 解開時保留封存檔裡的擁有者，所以 postgres 的檔案仍屬於 999。還原到新的 Volume、再用它啟動一個測試用的資料庫，就是驗證備份真的可用的方法；沒有還原過的備份，不算有備份。' },
        { type: 'callout', tone: 'tip', title: '資料庫的備份還有另一條路', text: '停機備份資料檔最簡單，也最容易驗證，但會有幾秒的停機。不能停機時，改用資料庫自己的備份工具，例如在執行中的 PostgreSQL 容器裡 `docker exec shop-db pg_dump -U postgres shop > shop.sql`，它在一個一致的快照上匯出 SQL；還原時用 psql 匯入到新的資料庫。兩種方法都要定期把備份檔複製到另一台機器——備份和資料放在同一顆磁碟上，磁碟壞了就一起沒了。' },
      ],
    },
    {
      id: 'dkr07-s-uid', title: '權限：真正的擁有者是 UID',
      blocks: [
        { type: 'p', text: '掛載目錄最常見的權限問題，都來自同一件事：核心判斷權限只看數字。每個檔案記錄的是擁有者的 UID 與群組的 GID，名稱只是 /etc/passwd 與 /etc/group 對照出來的顯示。容器和主機共用同一個核心，卻各有自己的 /etc/passwd，所以同一個檔案在兩邊可能顯示成不同的名稱，權限卻完全照數字算。Docker 預設不重新對應 UID（沒有啟用 user namespace，DKR01）：容器裡的 root 就是主機上的 UID 0，容器裡 UID 10001 的使用者寫出的檔案，在主機上就屬於 10001。' },
        { type: 'example', id: 'dkr07-uid' },
        { type: 'p', text: 'alpine 預設以 root 執行，它寫進 bind mount 的 check.txt 在主機上屬於 root，yu 想補一行就被拒絕——開發時最常見的困擾之一。`-u 1000:1000` 讓容器以 yu 的 UID 與 GID 執行，寫出的檔案在主機上就是 yu 的。shop/export:1.0 的 Dockerfile 寫了 `USER app`，`id` 顯示它是 UID 10001；它看 ~/notes 的檔案時，自己的 /etc/passwd 裡沒有 UID 1000，所以只顯示數字 1000。~/notes 屬於 yu、權限 755，對 10001 來說是「其他人」，只能讀不能寫，touch 得到 Permission denied。' },
        { type: 'table', head: ['做法', '什麼時候用', '注意'], rows: [
          ['主機上 `sudo chown 10001:10001 資料夾`', '容器必須以 Image 的使用者執行（正式環境、別人做好的 Image）', '先用 `docker run --rm Image id` 查出它的 UID 與 GID；主機上沒有這個帳號沒關係，chown 接受數字'],
          ['`docker run -u 1000:1000 …`', '開發時希望容器寫出的檔案屬於自己', '只寫 UID 而 Image 沒有這個帳號時，GID 會是 0（root）；程式也可能需要 Image 裡那個使用者的家目錄'],
          ['具名 Volume 而不是 bind mount', '資料不需要在主機上直接編輯', 'Image 若已建立好屬於那個使用者的資料夾，copy-up 會連擁有者一起帶入新的 Volume，不用另外處理'],
          ['`chmod 777`', '不要用', '任何帳號（包括被入侵的其他容器）都能讀寫、刪除裡面的檔案'],
        ] },
        { type: 'callout', tone: 'warning', title: '別用 chmod 777 打發 Permission denied', text: '`sudo chmod -R 777 資料夾` 一打錯誤就消失，所以網路上到處是這個「解法」。它真正做的是把資料夾開放給主機上的每一個帳號與每一個容器：任何人都能改寫、刪除、塞進檔案，日誌與上傳目錄更可能因此被利用。Permission denied 是在告訴你擁有者不對，正確的修法是讓擁有者正確：查出容器使用者的 UID，`chown` 給它，權限維持 755（資料夾）與 644（檔案）；或讓容器以合適的 `-u` 執行。另一個要避免的捷徑是 `-u 0` 讓容器以 root 執行——Image 特意用非 root 使用者，就是為了讓容器被攻破時損害有限。' },
        { type: 'p', text: '還有一個常見的 root 資料夾來源，上一節已經看過：`-v ~/exports:/data` 的主機資料夾不存在時，dockerd（以 root 執行）會替你建立它，於是資料夾屬於 root，非 root 的容器寫不進去。先用自己的身分 `mkdir`，或改用 `--mount` 讓不存在的路徑直接報錯，都能避開這個問題。' },
      ],
    },
    {
      id: 'dkr07-s-choose', title: '怎麼選：一張檢查清單',
      blocks: [
        { type: 'table', head: ['要放的東西', '選擇', '寫法範例'], rows: [
          ['資料庫的資料目錄', '具名 Volume', '`-v shopdata:/var/lib/postgresql/data`'],
          ['使用者上傳的檔案、要保留的產出', '具名 Volume（要在主機上處理時用 bind mount）', '`-v uploads:/srv/uploads`'],
          ['開發中的原始碼', 'Bind mount', '`-v ./src:/app/src`'],
          ['設定檔、憑證', '唯讀的 bind mount', '`-v /etc/shop/app.conf:/etc/app.conf:ro`'],
          ['暫存檔、秘密', 'tmpfs', '`--tmpfs /run/secrets`'],
          ['程式碼與靜態檔案的正式版本', '放在 Image 裡，不掛載', 'Dockerfile 的 `COPY`'],
        ] },
        { type: 'list', items: [
          '`docker inspect -f \'{{json .Mounts}}\' 容器` 確認容器實際掛了什麼：Type 是 volume 還是 bind、Source、Destination、RW。',
          '`docker volume ls -f dangling=true` 找出沒有容器使用的 Volume，確認不需要再 `docker volume prune`。',
          '升級或重建容器之前，先確認資料在 Volume 裡，而不是在可寫層或沒有名字的匿名 Volume 裡。',
          '定期以用完即丟的容器加 tar 備份 Volume，並把備份還原到新的 Volume 試一次。',
          'Permission denied 時先比較兩邊的數字：容器裡 `id`，主機上 `ls -l`。',
        ] },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '本課的 Volume、bind mount、tmpfs 與 tar 依 Docker CE 27.5.1 與 GNU tar 1.35 模擬，Volume 只有預設的 local 驅動程式。NFS、雲端儲存等其他 Volume 驅動程式、`volume-nocopy`、bind propagation、tmpfs 的大小限制，以及 overlay2 的實際資料夾結構只在課文說明；`docker cp` 不支援（請用掛載或 `docker exec 容器 cat`）。容器裡的 PostgreSQL 不會真的執行 SQL，pg_dump 只在課文出現；真實的 postgres Image 在資料目錄裡沒有檔案，第一次啟動時由 docker-entrypoint.sh 執行 initdb 建立資料庫，模擬環境的 Image 在那裡放了一個 PG_VERSION 代表它們，所以新的匿名 Volume 會 copy-up 這個檔案。tar 的封存檔大小不是真實的位元組數。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [CELLAR],
    examples: [
      {
        id: 'dkr07-layer-volume', title: '可寫層與具名 Volume', machine: 'dkr07-cellar',
        description: '帳本寫在可寫層時，重建容器就少了一筆；改用具名 Volume ledgerdata 之後，資料撐過 docker rm，留在 /var/lib/docker/volumes。',
        steps: [
          { command: "docker run -d --name ledger shop/ledger:2.1", output: "cb7908321797294cdac26ddad59be87c86084ed96b9d479af82855449dc35d3d" },
          { command: "docker exec ledger sh -c 'echo 2,oolong,1 >> /srv/data/ledger.csv'", output: "" },
          { command: "docker exec ledger cat /srv/data/ledger.csv", output: "id,item,qty\n1,matcha,2\n2,oolong,1" },
          { command: "docker rm -f ledger", output: "ledger" },
          { command: "docker run -d --name ledger shop/ledger:2.1", output: "cd2a991d7d08e6ac17ce0fdfb26d926ce733208918ba8f330cf8f4c668a89fb1" },
          { command: "docker exec ledger cat /srv/data/ledger.csv", output: "id,item,qty\n1,matcha,2" },
          { command: "docker rm -f ledger", output: "ledger" },
          { command: "docker volume create ledgerdata", output: "ledgerdata" },
          { command: "docker volume ls", output: "DRIVER    VOLUME NAME\nlocal     ledgerdata\nlocal     shopdata" },
          { command: "docker volume inspect ledgerdata", output: "[\n    {\n        \"CreatedAt\": \"2026-11-23T10:00:00Z\",\n        \"Driver\": \"local\",\n        \"Labels\": null,\n        \"Mountpoint\": \"/var/lib/docker/volumes/ledgerdata/_data\",\n        \"Name\": \"ledgerdata\",\n        \"Options\": null,\n        \"Scope\": \"local\"\n    }\n]" },
          { command: "docker run -d --name ledger -v ledgerdata:/srv/data shop/ledger:2.1", output: "b289b9f352d7f3fdd54bf8157d28c8fedf71f262dc59c902eca00ccf160363e4" },
          { command: "docker exec ledger sh -c 'echo 2,oolong,1 >> /srv/data/ledger.csv'", output: "" },
          { command: "docker rm -f ledger", output: "ledger" },
          { command: "docker volume ls", output: "DRIVER    VOLUME NAME\nlocal     ledgerdata\nlocal     shopdata" },
          { command: "ls /var/lib/docker/volumes", output: "ls: cannot access '/var/lib/docker/volumes': Permission denied" },
          { command: "sudo cat /var/lib/docker/volumes/ledgerdata/_data/ledger.csv", output: "id,item,qty\n1,matcha,2\n2,oolong,1" },
          { command: "docker run -d --name ledger -v ledgerdata:/srv/data shop/ledger:2.1", output: "1bf4e26ccc6797a7ded6d5ed7e5caad0a835b2505f06537a8ff7508e5a007eec" },
          { command: "docker exec ledger cat /srv/data/ledger.csv", output: "id,item,qty\n1,matcha,2\n2,oolong,1" },
          { command: "docker volume rm ledgerdata", output: "Error response from daemon: remove ledgerdata: volume is in use - [1bf4e26ccc6797a7ded6d5ed7e5caad0a835b2505f06537a8ff7508e5a007eec]" },
        ],
      },
      {
        id: 'dkr07-copy-up', title: 'copy-up、共用與名稱的陷阱', machine: 'dkr07-cellar',
        description: '新的空 Volume 會複製 Image 原有的檔案，兩個容器共用同一個 Volume；空資料夾的 bind mount 什麼都沒有，沒寫 ./ 的 site 變成一個 Volume。',
        steps: [
          { command: "docker run -d --name notice -p 8080:80 -v notice-html:/usr/share/nginx/html nginx:1.27", output: "92769295eabbf0cc89dffd83db31dff36480ab4f12ff27931df22c62bcfcdd3b" },
          { command: "sudo ls -l /var/lib/docker/volumes/notice-html/_data", output: "-rw-r--r-- root    root       28 50x.html\n-rw-r--r-- root    root      117 index.html" },
          { command: "docker run --rm -v notice-html:/html alpine:3.21 sh -c 'echo \"<h1>今日公休</h1>\" > /html/index.html'", output: "" },
          { command: "curl -s localhost:8080", output: "<h1>今日公休</h1>" },
          { command: "docker ps --format '{{.Names}}\\t{{.Mounts}}'", output: "notice\tnotice-html\nshop-db\tshopdata" },
          { command: "mkdir blank", output: "" },
          { command: "docker run --rm -v ./blank:/usr/share/nginx/html nginx:1.27 ls /usr/share/nginx/html", output: "" },
          { command: "docker run --rm -v site:/usr/share/nginx/html nginx:1.27 ls /usr/share/nginx/html", output: "50x.html\nindex.html" },
          { command: "docker volume ls", output: "DRIVER    VOLUME NAME\nlocal     notice-html\nlocal     shopdata\nlocal     site" },
          { command: "docker volume rm site", output: "site" },
        ],
      },
      {
        id: 'dkr07-bind-tmpfs', title: 'Bind mount、唯讀、--mount 與 tmpfs', machine: 'dkr07-cellar',
        description: '主機改網頁，nginx 立刻回應新內容；:ro 拒絕寫入；--mount 不建立不存在的來源，-v 會；tmpfs 的內容在重新啟動後消失。',
        steps: [
          { command: "cat site/index.html", output: "<h1>今日茶單：煎茶、烏龍</h1>" },
          { command: "docker run -d --name board -p 8081:80 -v ~/site:/usr/share/nginx/html:ro nginx:1.27", output: "a6c456bfe1f87b5127e137aaebef2d343886b4debc51d7a4abd6caf7f7a46f20" },
          { command: "curl -s localhost:8081", output: "<h1>今日茶單：煎茶、烏龍</h1>" },
          { command: "echo '<h1>今日茶單：煎茶、烏龍、東方美人</h1>' > site/index.html", output: "" },
          { command: "curl -s localhost:8081", output: "<h1>今日茶單：煎茶、烏龍、東方美人</h1>" },
          { command: "docker exec board touch /usr/share/nginx/html/x", output: "touch: cannot touch '/usr/share/nginx/html/x': Read-only file system" },
          { command: "docker inspect -f '{{json .Mounts}}' board", output: "[{\"Type\":\"bind\",\"Source\":\"/home/yu/site\",\"Destination\":\"/usr/share/nginx/html\",\"Mode\":\"ro\",\"RW\":false,\"Propagation\":\"rprivate\"}]" },
          { command: "docker run --rm --mount type=bind,source=/home/yu/drafts,target=/w alpine:3.21 true", output: "docker: Error response from daemon: invalid mount config for type \"bind\": bind source path does not exist: /home/yu/drafts.\nSee 'docker run --help'." },
          { command: "docker run --rm -v /home/yu/drafts:/w alpine:3.21 true", output: "" },
          { command: "ls -ld drafts", output: "drwxr-xr-x root    root     4096 drafts/" },
          { command: "docker run -d --name worker --tmpfs /run/secrets debian:12 sleep infinity", output: "75bbcef993bd1ac4beeb3676254b0a00b75d0d4508dff071293265ff4932e8fa" },
          { command: "docker exec worker sh -c 'echo s3cr3t > /run/secrets/token; ls /run/secrets'", output: "token" },
          { command: "docker restart worker", output: "worker" },
          { command: "docker exec worker ls /run/secrets", output: "" },
        ],
      },
      {
        id: 'dkr07-anon-backup', title: '匿名 Volume、prune 與備份', machine: 'dkr07-cellar',
        description: 'postgres 的 VOLUME 產生匿名 Volume，刪除容器後由 prune 清除；停下資料庫，用用完即丟的容器把 shopdata 打包成 tgz。',
        steps: [
          { command: "docker inspect -f '{{json .Config.Volumes}}' postgres:17.1", output: "{\"/var/lib/postgresql/data\":{}}" },
          { command: "docker run -d --name trial postgres:17.1", output: "754b5f58fee0ab3e71984373e27a83a2261e384ae10cc0f0b9884e97760aaa97" },
          { command: "docker volume ls", output: "DRIVER    VOLUME NAME\nlocal     90c721b13b492704b279476f42d4d1651f8a146af76447057cbf136f6afbc5a9\nlocal     shopdata" },
          { command: "docker rm -f trial", output: "trial" },
          { command: "docker volume ls -q -f dangling=true", output: "90c721b13b492704b279476f42d4d1651f8a146af76447057cbf136f6afbc5a9" },
          { command: "docker volume prune -f", output: "Deleted Volumes:\n90c721b13b492704b279476f42d4d1651f8a146af76447057cbf136f6afbc5a9\n\nTotal reclaimed space: 3B" },
          { command: "docker stop shop-db", output: "shop-db" },
          { command: "docker run --rm -v shopdata:/data:ro -v ~/backups:/backup debian:12 tar czf /backup/shopdata.tgz -C /data .", output: "" },
          { command: "docker start shop-db", output: "shop-db" },
          { command: "ls -l backups", output: "-rw-r--r-- root    root      541 shopdata.tgz" },
          { command: "tar tvzf backups/shopdata.tgz", output: "drwxr-xr-x root/root         0 2026-11-23 10:00 ./\n-rw-r--r-- 999/999           3 2026-11-23 10:00 ./PG_VERSION\n-rw-r--r-- 999/999          34 2026-11-23 10:00 ./orders.csv" },
        ],
      },
      {
        id: 'dkr07-uid', title: '數字的擁有者', machine: 'dkr07-cellar',
        description: '容器的 root 寫出 root 的檔案，-u 讓檔案屬於自己；以 UID 10001 執行的 shop/export 寫不進 yu 的資料夾。',
        steps: [
          { command: "docker run --rm -v ~/notes:/notes alpine:3.21 sh -c 'echo 盤點完成 > /notes/check.txt'", output: "" },
          { command: "ls -l notes", output: "-rw-r--r-- root    root       13 check.txt" },
          { command: "echo 補記 >> notes/check.txt", output: "bash: notes/check.txt: Permission denied" },
          { command: "docker run --rm -u 1000:1000 -v ~/notes:/notes alpine:3.21 sh -c 'echo 盤點完成 > /notes/check2.txt'", output: "" },
          { command: "ls -l notes", output: "-rw-r--r-- root    root       13 check.txt\n-rw-r--r-- yu      yu         13 check2.txt" },
          { command: "docker run --rm shop/export:1.0 id", output: "uid=10001(app) gid=10001(app) groups=10001(app)" },
          { command: "docker run --rm -v ~/notes:/notes shop/export:1.0 ls -l /notes", output: "-rw-r--r-- root    root       13 check.txt\n-rw-r--r-- 1000    1000       13 check2.txt" },
          { command: "docker run --rm -v ~/notes:/notes shop/export:1.0 touch /notes/x", output: "touch: cannot touch '/notes/x': Permission denied" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr07-upgrade-db', title: '升級資料庫而不遺失資料', machine: 'dkr07-cellar',
        statement: 'shop-db 是茶行的 PostgreSQL，目前以 postgres:17.1 執行，資料目錄 /var/lib/postgresql/data 掛的是具名 Volume shopdata。請把它升級到 postgres:17.2（同一個主版本，資料目錄可以直接沿用）：先停止並刪除舊的 shop-db，再以 postgres:17.2 啟動新的 shop-db（背景執行），讓它沿用 shopdata。最後用 `docker exec shop-db cat /var/lib/postgresql/data/orders.csv` 印出訂單，確認資料都還在。',
        checks: [
          { kind: 'container', name: 'shop-db', state: 'running', image: 'postgres:17.2' },
          { kind: 'volume', name: 'shopdata', file: '/orders.csv', content: 'id,item,qty' },
          { kind: 'output', fromCommand: '^docker exec ' },
        ],
        solution: ['docker stop shop-db', 'docker rm shop-db', `docker run -d --name shop-db -v shopdata:${PG_DATA} postgres:17.2`, `docker exec shop-db cat ${PG_DATA}/orders.csv`],
        mistakes: [
          { commands: ['docker rm -f shop-db', 'docker run -d --name shop-db postgres:17.2', `docker exec shop-db cat ${PG_DATA}/orders.csv`], why: '沒有掛 shopdata：postgres 的 VOLUME 讓新容器得到一個全新的匿名 Volume，PostgreSQL 在裡面建立的是一個沒有任何訂單的空資料庫' },
          { commands: ['docker rm -f shop-db', 'docker volume rm shopdata', `docker run -d --name shop-db -v shopdata:${PG_DATA} postgres:17.2`, `docker exec shop-db cat ${PG_DATA}/orders.csv`], why: '把 Volume 也刪了：-v shopdata 建立的是一個同名的新 Volume，資料已經沒有了' },
          { commands: ['docker stop shop-db', `docker run -d --name shop-db -v shopdata:${PG_DATA} postgres:17.2`], why: '只停止沒有刪除，名稱 shop-db 仍被舊容器占用，docker run 因名稱衝突失敗，跑的還是 17.1' },
          { commands: [`docker run -d --name shop-db-new -v shopdata:${PG_DATA} postgres:17.2`, `docker exec shop-db-new cat ${PG_DATA}/orders.csv`], why: '舊的 shop-db 還在執行，新容器又掛上同一個資料目錄：兩個 PostgreSQL 同時寫同一份資料檔可能毀損資料，而且 shop-db 仍是 17.1' },
          { commands: ["echo 'id,item,qty'"], why: '直接打出內容，沒有從新容器讀出來；換一台訂單不同的主機答案就不同' },
        ],
        variants: [{ label: '訂單比較多的 cellar-07', files: [], docker: docker('id,item,qty\n1,matcha,2\n2,oolong,1\n3,sencha,4\n4,puer,1\n') }],
        hints: [
          '`docker inspect -f \'{{json .Mounts}}\' shop-db` 看目前掛的 Volume 名稱與路徑。',
          '先 `docker stop shop-db` 讓資料庫正常關閉，再 `docker rm shop-db`；具名 Volume 不會跟著被刪。',
          '新的容器用同一個 `-v shopdata:/var/lib/postgresql/data`，只換 Image 的標籤。',
        ],
        explanation: '資料在具名 Volume shopdata 裡，和容器的生命週期無關，所以升級就是「刪掉舊容器、用新 Image 與同一個 Volume 建立新容器」。先 `docker stop` 讓 PostgreSQL 正常關閉、把資料寫完，再 `docker rm`；`docker rm` 不會刪除具名 Volume（`-v` 也只刪匿名的）。新容器以 `-v shopdata:/var/lib/postgresql/data` 掛上原來的資料，因為 Volume 不是空的，不會發生 copy-up，資料原封不動。忘了 `-v` 時，postgres 的 VOLUME 讓新容器拿到一個全新的匿名 Volume；刪掉 Volume 再以同名建立，得到的是空的新 Volume；只停止不刪除會撞名；讓兩個容器同時使用同一個資料目錄會毀損資料。17.1 到 17.2 是同一個主版本，資料格式相容；跨主版本（例如 16 到 17）則要先用 pg_dump 或 pg_upgrade 轉換。',
      },
      {
        id: 'dkr07-live-menu', title: '主機上改網頁，立刻上線', machine: 'dkr07-cellar',
        statement: '茶行的菜單網頁在主機的 ~/site/index.html。請以 nginx:1.27 啟動名為 menu 的容器（背景執行、主機的 8080 埠對應容器的 80 埠），用 bind mount 把 ~/site 掛到 /usr/share/nginx/html（建議加上 `:ro`：容器只需要讀網頁）。接著只在主機上修改檔案：`echo \'<h1>今日茶單：煎茶、烏龍、東方美人</h1>\' > ~/site/index.html`，不要重新啟動容器，用 `curl -s localhost:8080` 確認網頁已經是新的茶單。',
        checks: [
          { kind: 'container', name: 'menu', state: 'running', image: 'nginx:1.27', port: '8080:80' },
          { kind: 'content', path: '/home/yu/site/index.html', content: `${MENU}\n` },
          { kind: 'http', url: 'http://localhost:8080/', status: 200, body: '東方美人' },
        ],
        solution: ['docker run -d --name menu -p 8080:80 -v ~/site:/usr/share/nginx/html:ro nginx:1.27', `echo '${MENU}' > ~/site/index.html`, 'curl -s localhost:8080'],
        mistakes: [
          { commands: ['docker run -d --name menu -p 8080:80 -v site:/usr/share/nginx/html:ro nginx:1.27', `echo '${MENU}' > ~/site/index.html`, 'curl -s localhost:8080'], why: 'site 前面沒有 ./ 或 /，Docker 建立了一個名為 site 的 Volume（裡面是 copy-up 的 nginx 預設網頁），主機上的 ~/site 根本沒有掛進去' },
          { commands: ['docker run -d --name menu -p 8080:80 nginx:1.27', `docker exec menu sh -c "echo '${MENU}' > /usr/share/nginx/html/index.html"`, 'curl -s localhost:8080'], why: '把網頁直接寫進執行中容器的可寫層：網頁看起來更新了，但主機上的檔案沒變，容器一重建就回到 nginx 的預設網頁' },
          { commands: ['docker run -d --name menu -p 8080:80 nginx:1.27', `echo '${MENU}' > ~/site/index.html`, 'curl -s localhost:8080'], why: '沒有掛載 ~/site，nginx 回應的是 Image 裡的預設網頁，主機上改什麼都看不到' },
          { commands: ['docker run -d --name menu -p 80:8080 -v ~/site:/usr/share/nginx/html:ro nginx:1.27', `echo '${MENU}' > ~/site/index.html`], why: '-p 的順序是「主機埠:容器埠」，寫反了：nginx 在容器的 80 埠，主機的 8080 沒有對應' },
        ],
        hints: [
          'bind mount 的來源要寫成主機路徑：`~/site`（Shell 會展開成 /home/yu/site）、`./site` 或 `/home/yu/site`。',
          '`-v 主機路徑:/usr/share/nginx/html:ro`，`:ro` 讓容器只能讀。',
          '改完主機上的檔案直接 `curl`，bind mount 兩邊是同一份檔案，不需要重新啟動容器。',
        ],
        explanation: 'bind mount 把主機的 ~/site 直接掛在 nginx 讀取網頁的 /usr/share/nginx/html，兩邊是同一份檔案，所以主機上一改，nginx 的下一個回應就是新內容，不必重新建置 Image 或重新啟動容器；`:ro` 讓容器即使被攻破也改不了網頁。寫成 `-v site:…` 會建立名為 site 的 Volume；沒有掛載時 nginx 只有 Image 裡的預設網頁；用 docker exec 把檔案寫進容器，改的是可寫層，主機上的原始檔沒變，容器重建就消失，也無法版本控管。',
      },
      {
        id: 'dkr07-restore', title: '備份並還原到新的 Volume', machine: 'dkr07-cellar',
        statement: '請為 shopdata 做一份備份並驗證它：先停止 shop-db，用一個用完即丟的 debian:12 容器把 shopdata 的內容以 tar 打包成主機上的 ~/backups/shopdata.tgz（封存檔裡要是相對於 Volume 根目錄的路徑），再啟動 shop-db。接著建立新的 Volume shopdata-test，用另一個用完即丟的容器把封存檔解開進去，最後以 postgres:17.1 啟動名為 shop-db-test 的容器（背景執行），把 shopdata-test 掛在 /var/lib/postgresql/data。',
        checks: [
          { kind: 'exists', path: '/home/yu/backups/shopdata.tgz', type: 'file' },
          { kind: 'volume', name: 'shopdata-test', file: '/orders.csv', content: '2,oolong,1' },
          { kind: 'container', name: 'shop-db-test', state: 'running', image: 'postgres:17.1' },
          { kind: 'container', name: 'shop-db', state: 'running' },
        ],
        solution: [
          'docker stop shop-db',
          'docker run --rm -v shopdata:/data:ro -v ~/backups:/backup debian:12 tar czf /backup/shopdata.tgz -C /data .',
          'docker start shop-db',
          'docker volume create shopdata-test',
          'docker run --rm -v shopdata-test:/data -v ~/backups:/backup:ro debian:12 tar xzf /backup/shopdata.tgz -C /data',
          `docker run -d --name shop-db-test -v shopdata-test:${PG_DATA} postgres:17.1`,
        ],
        mistakes: [
          {
            commands: ['docker stop shop-db', 'docker run --rm -v shopdata:/data:ro -v ~/backups:/backup debian:12 tar czf /backup/shopdata.tgz /data', 'docker start shop-db', 'docker volume create shopdata-test',
              'docker run --rm -v shopdata-test:/data -v ~/backups:/backup:ro debian:12 tar xzf /backup/shopdata.tgz -C /data', `docker run -d --name shop-db-test -v shopdata-test:${PG_DATA} postgres:17.1`],
            why: '打包時沒有 -C /data .，封存檔裡的路徑是 data/orders.csv，解開後在 Volume 裡多了一層 data/，PostgreSQL 找不到它的資料檔',
          },
          {
            commands: ['docker stop shop-db', 'docker run --rm -v shopdata:/data:ro debian:12 tar czf /backup/shopdata.tgz -C /data .', 'docker start shop-db'],
            why: '沒有把主機的 ~/backups 掛進容器：容器裡沒有 /backup，就算寫成了，封存檔也只在容器的可寫層，--rm 一結束就消失',
          },
          {
            commands: ['tar czf backups/shopdata.tgz /var/lib/docker/volumes/shopdata/_data', 'docker volume create shopdata-test'],
            why: '在主機上以一般使用者打包 Volume 的資料夾：/var/lib/docker 只有 root 進得去，tar 回報 Permission denied，留下的是一個沒有內容的封存檔',
          },
          {
            commands: ['docker stop shop-db', 'docker run --rm -v shopdata:/data:ro -v ~/backups:/backup debian:12 tar czf /backup/shopdata.tgz -C /data .', 'docker start shop-db',
              `docker run -d --name shop-db-test -v shopdata:${PG_DATA} postgres:17.1`],
            why: '測試用的資料庫直接掛上正式的 shopdata：沒有驗證到備份，還讓兩個 PostgreSQL 同時使用同一份資料檔',
          },
        ],
        hints: [
          '打包：`docker run --rm -v shopdata:/data:ro -v ~/backups:/backup debian:12 tar czf /backup/shopdata.tgz -C /data .`',
          '`tar tvzf ~/backups/shopdata.tgz` 可以先看封存檔裡的路徑是不是 ./ 開頭。',
          '還原是反過來：新的 Volume 掛在 /data，封存檔所在的資料夾唯讀地掛在 /backup，`tar xzf … -C /data`。',
        ],
        explanation: '用完即丟的容器同時掛上 Volume 與主機的備份資料夾，tar 在容器裡讀 Volume、把封存檔寫到主機上，不需要知道 /var/lib/docker 的路徑，也不必以 root 在主機上操作。`-C /data .` 讓封存檔裡是相對路徑，才能解開到任何 Volume 的根目錄；少了它，還原後會多出一層 data/。打包前停止 shop-db，資料檔才是一致的狀態。還原到新的 shopdata-test 並以它啟動 shop-db-test，證明這份備份真的能用，又不碰到正式的資料；以 root 執行的 tar 也保留了 postgres（999）的擁有者。',
      },
      {
        id: 'dkr07-export-perm', title: '讓 UID 10001 寫得進去', machine: 'dkr07-cellar',
        statement: `每天的匯出工作是 \`${EXPORT}\`：shop/export:1.0 以 Image 的使用者 app（UID 10001）執行，把報表複製到主機的 ~/exports。現在它失敗了，cp 回報 Permission denied。請在主機上修正 ~/exports 的權限問題，讓這個指令原封不動地執行成功（容器仍以 Image 的使用者執行，不要加 -u；也不要用 chmod 777，資料夾維持 755）。最後用 \`ls -l ~/exports\` 列出匯出的報表。`,
        checks: [
          { kind: 'exists', path: '/home/yu/exports/report.csv', type: 'file' },
          { kind: 'mode', path: '/home/yu/exports', mode: 0o755 },
          { kind: 'output', fromCommand: '^(sudo )?ls\\b' },
        ],
        solution: ['sudo chown 10001:10001 ~/exports', EXPORT, 'ls -l ~/exports'],
        mistakes: [
          { commands: ['sudo chmod 777 ~/exports', EXPORT, 'ls -l ~/exports'], why: 'chmod 777 讓錯誤消失，卻把資料夾開放給主機上的每個帳號與每個容器' },
          { commands: ['docker run --rm -u 0 -v ~/exports:/data shop/export:1.0 cp /srv/report.csv /data/report.csv', 'ls -l ~/exports'], why: '以 -u 0 讓容器用 root 執行：報表變成 root 的，也違背了 Image 以非 root 使用者執行的用意' },
          { commands: ['sudo chown yu:yu ~/exports', EXPORT, 'ls -l ~/exports'], why: '把資料夾交給主機的 yu（UID 1000）：容器的使用者是 10001，對它來說仍是「其他人」，照樣 Permission denied' },
          { commands: ['sudo touch ~/exports/report.csv', 'ls -l ~/exports'], why: '自己在主機上做出一個 report.csv：匯出工作根本沒有成功' },
          { commands: ["echo '-rw-r--r-- 10001   10001      26 report.csv'"], why: '直接打出列表，沒有真的修好、也沒有執行；報表的內容不同時大小也不同' },
        ],
        variants: [{ label: '報表比較長的一天', files: [], docker: docker(ORDERS, 'date,orders\n2026-11-22,41\n2026-11-23,57\n') }],
        hints: [
          '`docker run --rm shop/export:1.0 id` 查出容器使用者的 UID 與 GID；`ls -ld ~/exports` 看資料夾現在屬於誰。',
          '主機上沒有 UID 10001 的帳號也沒關係，`chown` 接受數字。',
          '`sudo chown 10001:10001 ~/exports`，再執行原本的匯出指令。',
        ],
        explanation: '~/exports 是當初 `-v` 遇到不存在的資料夾時由 dockerd 以 root 建立的，權限 755：只有 root 能寫。容器以 UID 10001 執行，核心只比對數字，10001 不是擁有者也不在群組裡，所以被拒絕。把資料夾的擁有者改成 10001:10001（主機上沒有這個帳號也可以），容器的使用者就是擁有者，權限仍是 755，其他帳號照樣只能讀；報表在主機上顯示為 10001 的檔案。chmod 777 開放給所有人；chown 給 yu 對 10001 沒有幫助；-u 0 讓容器以 root 執行，報表變成 root 的。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr07-q1', prompt: '`docker run -d --name db -v pgdata:/var/lib/postgresql/data postgres:17.1` 啟動的容器，之後執行了 `docker rm -f db`。pgdata 裡的資料會怎麼樣？',
      options: ['跟著容器一起被刪除', '變成唯讀，只能由新容器讀取', '仍然留在 pgdata 裡，直到有人執行 `docker volume rm pgdata`', '移到 Docker 的資源回收區，30 天後刪除'],
      answer: 2,
      explanation: '具名 Volume 有自己的生命週期，`docker rm`（連 `docker rm -v` 也是）不會刪除它，資料留在 /var/lib/docker/volumes/pgdata/_data，新容器掛上同一個名稱就能繼續用。它不會跟著容器刪除，不會變成唯讀，Docker 也沒有資源回收區。',
    },
    {
      id: 'dkr07-q2', prompt: '~/blank 是空的資料夾。在家目錄執行 `docker run --rm -v ./blank:/usr/share/nginx/html nginx:1.27 ls /usr/share/nginx/html` 會印出什麼？',
      options: ['什麼都不印：bind mount 不做 copy-up，Image 原本的檔案被空資料夾蓋住', 'nginx 的 index.html 與 50x.html，並複製到主機的 ~/blank', 'nginx 的 index.html 與 50x.html，但主機的 ~/blank 仍是空的', '錯誤：掛載點必須是空的資料夾'],
      answer: 0,
      explanation: 'copy-up 只發生在空的 Volume 上；bind mount 直接用主機的資料夾蓋住容器裡的那個路徑，空資料夾就看到空的。主機的資料夾不會被寫入 Image 的檔案，容器裡也看不到原本的 index.html；掛載點本來有檔案也不是錯誤，只是被蓋住。',
    },
    {
      id: 'dkr07-q3', prompt: '在家目錄執行 `docker run -d -p 8080:80 -v site:/usr/share/nginx/html nginx:1.27`，想讓 nginx 提供 ~/site 的網頁。結果會是什麼？',
      options: ['Docker 回報 site 不是絕對路徑，容器沒有啟動', 'nginx 提供 ~/site 的網頁，和寫 `./site` 完全相同', 'nginx 提供 ~/site 的網頁，但唯讀', 'Docker 建立了一個名為 site 的具名 Volume，nginx 提供的是 copy-up 進來的預設網頁'],
      answer: 3,
      explanation: '`-v` 的來源沒有以 `/` 或 `./` 開頭時被當成 Volume 名稱，Docker 默默建立名為 site 的新 Volume，空的 Volume 又 copy-up 了 nginx 的預設網頁，沒有任何錯誤訊息。它不會報錯，也不會掛到主機的 ~/site，唯讀要另外寫 `:ro`。',
    },
    {
      id: 'dkr07-q4', prompt: '容器以 Image 的使用者 UID 10001 執行，寫入 bind mount 的 /data 時得到 Permission denied；主機上的資料夾屬於 root，權限 755。最合適的修法是哪一個？',
      options: ['`sudo chmod -R 777 資料夾`', '`sudo chown 10001:10001 資料夾`，權限維持 755', '`docker run -u 0` 讓容器以 root 執行', '改用 `--mount type=bind`，權限問題就會消失'],
      answer: 1,
      explanation: '核心只比對 UID，把擁有者改成容器使用者的 10001 就能寫，權限維持 755，其他帳號仍只能讀；主機上沒有這個帳號也可以 chown 數字。chmod 777 把資料夾開放給所有人；-u 0 讓容器以 root 執行，失去非 root 的保護；`--mount` 只是另一種寫法，擁有者與權限不變。',
    },
    {
      id: 'dkr07-q5', prompt: '`docker run -d --tmpfs /run/secrets app` 的容器把 token 寫進 /run/secrets。`docker stop` 再 `docker start` 之後，token 在哪裡？',
      options: ['不見了：tmpfs 在記憶體裡，容器停止時內容清空，也不會寫進主機的檔案系統', '還在 /run/secrets，因為容器沒有被刪除', '被移到容器的可寫層', '被寫到主機的 /var/lib/docker/volumes 底下'],
      answer: 0,
      explanation: 'tmpfs 只存在記憶體裡，容器一停止就清空，內容不會寫進主機的檔案系統或容器的可寫層，所以適合放秘密與暫存檔。stop 與 start 不刪除容器，但 tmpfs 照樣清空；它不會被移到可寫層，也不是 Volume，不在 /var/lib/docker/volumes。',
    },
    {
      id: 'dkr07-q6', prompt: '備份指令 `docker run --rm -v shopdata:/data:ro -v ~/backups:/backup debian:12 tar czf /backup/shopdata.tgz -C /data .` 裡的 `-C /data .` 有什麼作用？',
      options: ['只打包 /data 底下的隱藏檔', '讓 tar 以唯讀模式開啟 Volume', '先切換到 Volume 的根目錄再打包「.」，封存檔裡是 ./orders.csv 這種相對路徑，可以解開到任何掛載點', '指定封存檔要壓縮成 gzip'],
      answer: 2,
      explanation: '`-C /data` 讓 tar 先切換目錄，`.` 打包目前目錄的全部，所以成員名稱是相對的 ./…，還原時 `-C 新的掛載點` 就會解到正確的位置；少了它，路徑會帶著 data/ 這一層。它不是只選隱藏檔；唯讀來自 `:ro`；gzip 壓縮是 `z` 選項。',
    },
    {
      id: 'dkr07-q7', prompt: '在 Docker 27 上執行 `docker volume prune -f`，哪些 Volume 會被刪除？',
      options: ['所有 Volume，包括正在使用的', '沒有任何容器使用的匿名 Volume；具名的要加 `-a` 才會刪', '所有具名 Volume，匿名的保留', '只刪除超過 30 天沒有被掛載的 Volume'],
      answer: 1,
      explanation: '從 Docker 23 起，`docker volume prune` 預設只刪沒有容器使用的匿名 Volume，`-a` 才包括沒有容器使用的具名 Volume；任何容器（即使已停止）在用的 Volume 都不會被刪。它不會刪除使用中的 Volume，也不是只刪具名的，Docker 不依時間判斷。',
    },
    {
      id: 'dkr07-q8', prompt: '主機上沒有 ~/drafts 這個資料夾。`-v ~/drafts:/w` 與 `--mount type=bind,source=/home/yu/drafts,target=/w` 的行為有什麼不同？',
      options: ['兩者都回報 bind source path does not exist', '兩者都自動建立資料夾，擁有者是目前的使用者', '`-v` 回報錯誤，`--mount` 自動建立資料夾', '`-v` 由 dockerd 以 root 建立一個空資料夾，`--mount` 回報 bind source path does not exist'],
      answer: 3,
      explanation: '`-v` 遇到不存在的主機路徑時由以 root 執行的 dockerd 建立空資料夾，所以它屬於 root，非 root 的容器常因此寫不進去；`--mount type=bind` 則直接報錯，讓打錯的路徑早點被發現。兩者行為不同，自動建立的資料夾也不屬於目前的使用者，更不是反過來。',
    },
  ],
};

/*
 * DKR09 Multi-Container Apps with Docker Compose (DKR-4, terminal-sim). A terminal lesson on the compose profile (engine
 * stage E23): from the network create / volume create / three docker run commands of DKR07 and DKR08 to one compose.yaml
 * (services, image versus build, ports, environment, a named volume declared at the top level); interpolation (${VAR},
 * the project folder's .env, :- defaults, :? required variables, the shell winning over .env) and .env not becoming a
 * container's environment; docker compose config (-q, --services, -p) catching a missing variable, a mistyped key and the
 * obsolete version; the project name and the names it gives (shop-app-1, shop_default, shop_pgdata, shop-app); service
 * names as DNS names on the default network and localhost inside a container; short depends_on (only service_started)
 * versus a healthcheck with pg_isready and condition: service_healthy (Waiting / Healthy, the clock moving while up
 * waits); up -d, ps, logs, exec, stop, start, restart, a second up (Running), up -d --build (Recreate), down and down -v
 * (the database volume deleted). Machines: the Docker host tidal-01 (user rin in the docker group; postgres:17 with
 * pg_isready, redis:7.4 on the simulated Docker Hub, python:3.12-slim with pip packages, a gunicorn program) as the shop
 * project with a drafts folder, a teammate's broken compose.yaml, a second day with last week's shop-app image and data in
 * shop_pgdata, and a Dockerfile bumped to APP_VERSION 1.1. The TTY progress screen, scaling, profiles, docker compose run
 * and restart policies are text only. The host, user, project, password and data are made up (the password is an
 * obviously fake lesson value). Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalDocker, TerminalImage, TerminalProgram, TerminalVolume } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'rin', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'rin', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const PY_PATH = 'PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n';
const SHELL_TOOLS = ['ls', 'cat', 'echo', 'env', 'sh', 'bash', 'sleep', 'true', 'false', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'head', 'tail', 'grep', 'wc', 'hostname', 'id', 'whoami', 'uname'];

const PIP: NonNullable<TerminalImage['packages']>['pip'] = [
  { name: 'flask', version: '3.0.3', size: 360_000, depends: ['werkzeug>=3.0.0', 'jinja2>=3.1.2', 'itsdangerous>=2.1.2', 'click>=8.1.3', 'blinker>=1.6.2'] },
  { name: 'werkzeug', version: '3.1.3', size: 900_000, depends: ['MarkupSafe>=2.1.1'] }, { name: 'jinja2', version: '3.1.4', size: 800_000, depends: ['MarkupSafe>=2.0'] },
  { name: 'MarkupSafe', version: '3.0.2', size: 50_000 }, { name: 'itsdangerous', version: '2.2.0', size: 60_000 }, { name: 'click', version: '8.1.7', size: 400_000 },
  { name: 'blinker', version: '1.9.0', size: 40_000 }, { name: 'gunicorn', version: '23.0.0', size: 450_000, depends: ['packaging'] }, { name: 'packaging', version: '24.2', size: 260_000 },
  { name: 'psycopg', version: '3.2.3', size: 1_100_000, depends: ['typing-extensions>=4.6'] }, { name: 'typing-extensions', version: '4.12.2', size: 140_000 },
  { name: 'redis', version: '5.2.1', size: 1_000_000 },
];

const POSTGRES: TerminalImage = {
  name: 'postgres:17', size: 438_200_000, created: '2026-11-08 08:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['postgres'],
  env: [PATH_ENV, 'PG_MAJOR=17', 'PGDATA=/var/lib/postgresql/data'], expose: [5432], service: true, layers: 5, pulled: true, osRelease: DEBIAN,
  volumes: ['/var/lib/postgresql/data'], ready: 4, commands: [...SHELL_TOOLS, 'pg_isready'],
  logs: ['LOG:  database system is ready to accept connections'],
  files: [{ path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash\npostgres:x:999:999::/var/lib/postgresql:/bin/bash\n' }, { path: '/etc/group', content: 'root:x:0:\npostgres:x:999:\n' }],
};
const REDIS: TerminalImage = {
  name: 'redis:7.4', size: 117_400_000, created: '2026-11-03 10:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['redis-server'], expose: [6379], service: true, layers: 6, osRelease: DEBIAN,
  commands: SHELL_TOOLS, logs: ['1:M 22 Nov 2026 10:00:00.000 * Ready to accept connections tcp'],
};
const SLIM: TerminalImage = {
  name: 'python:3.12-slim', size: 124_500_000, created: '2026-11-12 03:00:00', cmd: ['python3'], pulled: true, layers: 4, osRelease: DEBIAN,
  env: [PY_PATH, 'LANG=C.UTF-8', 'PYTHON_VERSION=3.12.7'], packages: { pip: PIP },
  commands: [...SHELL_TOOLS, 'getent', 'nc'],
};

const SITE = '/usr/local/lib/python3.12/site-packages';
const GUNICORN = ['gunicorn', '--bind', '0.0.0.0:8000', 'app:app'];
const gunicornLogs = ['[1] [INFO] Starting gunicorn 23.0.0', '[1] [INFO] Listening at: http://0.0.0.0:8000 (1)', '[1] [INFO] Using worker: sync', '[7] [INFO] Booting worker with pid: 7']
  .map(text => ({ text: `[2026-11-22 10:00:00 +0000] ${text}`, stream: 2 as const }));
const PROGRAMS: TerminalProgram[] = [{
  command: GUNICORN, needs: ['app.py', `${SITE}/flask/__init__.py`, `${SITE}/gunicorn/__init__.py`], service: true, stopExit: 0, logs: gunicornLogs,
  http: { port: 8000, responder: 'shop-app' },
}];

const DOCKERFILE = (version: string) => `FROM python:3.12-slim\nENV APP_VERSION=${version}\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]\n`;
const REQUIREMENTS = 'flask==3.0.3\ngunicorn==23.0.0\npsycopg==3.2.3\nredis==5.2.1\n';
const APP_PY = "import os\n\nfrom flask import Flask\n\napp = Flask(__name__)\nDATABASE_URL = os.environ['DATABASE_URL']\nREDIS_URL = os.environ['REDIS_URL']\n\n\n@app.get('/')\ndef index():\n    return '潮汐咖啡訂單服務\\n'\n\n\n@app.get('/health')\ndef health():\n    return {'status': 'ok'}\n";
const ENV = 'DB_PASSWORD=lesson-demo-pw\n';

const composeYaml = (opts: { dbHost?: string; dependsShort?: boolean } = {}) => `services:
  app:
    build: .
    ports:
      - "8080:8000"
    environment:
      DATABASE_URL: postgres://shop:\${DB_PASSWORD}@${opts.dbHost ?? 'db'}:5432/\${DB_NAME:-shop}
      REDIS_URL: redis://cache:6379/0
    depends_on:
${opts.dependsShort ? '      - db\n      - cache' : '      db:\n        condition: service_healthy\n      cache:\n        condition: service_started'}

  db:
    image: postgres:17
    environment:
      POSTGRES_USER: shop
      POSTGRES_PASSWORD: \${DB_PASSWORD:?set DB_PASSWORD in .env}
      POSTGRES_DB: \${DB_NAME:-shop}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shop"]
      interval: 5s
      timeout: 3s
      retries: 5

  cache:
    image: redis:7.4

volumes:
  pgdata:
`;
const DRAFT = `version: "3.8"
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD:?set DB_PASSWORD in .env}
  app:
    build: ../shop
    depend_on:
      - db
`;

const shopFiles = (compose: string, dockerfile = DOCKERFILE('1.0')): TerminalFile[] => [
  dir('/home/rin/shop'), file('/home/rin/shop/compose.yaml', compose), file('/home/rin/shop/.env', ENV, 'rin', 0o600), file('/home/rin/shop/Dockerfile', dockerfile),
  file('/home/rin/shop/.dockerignore', '.env\n.git\n__pycache__/\n'), file('/home/rin/shop/requirements.txt', REQUIREMENTS), file('/home/rin/shop/app.py', APP_PY),
];

const host = (id: string, title: string, files: TerminalFile[], docker: TerminalDocker): TerminalMachine => ({
  id, title, user: 'rin', host: 'tidal-01', cwd: '/home/rin', profile: 'compose', now: '2026-11-22 10:00:00', boot: '2026-11-22 06:00:00',
  files: [dir('/home'), dir('/home/rin', 'rin', 0o750), ...files, file('/etc/resolv.conf', 'nameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n', 'root')],
  accounts: { groups: [{ name: 'sudo', members: ['rin'] }, { name: 'docker', gid: 988, members: ['rin'] }] },
  responders: [{ id: 'shop-app', server: 'gunicorn', routes: [{ path: '/', body: '潮汐咖啡訂單服務\n', type: 'text/html; charset=utf-8' }, { path: '/health', body: '{"status":"ok"}\n', type: 'application/json' }] }],
  docker,
});

const DOCKER: TerminalDocker = { images: [POSTGRES, REDIS, SLIM], programs: PROGRAMS };
const MAIN = host('dkr09-tidal', 'tidal-01（~/shop：app、db、cache 的 Compose 專案）', [...shopFiles(composeYaml()), dir('/home/rin/drafts'), file('/home/rin/drafts/compose.yaml', DRAFT)], DOCKER);

// Last week's shop-app image (APP_VERSION 1.0) is still local, and the database volume kept its data after docker compose down.
const OLD_APP: TerminalImage = {
  name: 'shop-app:latest', size: 131_800_000, created: '2026-11-15 17:20:00', cmd: GUNICORN, workdir: '/app', env: [PY_PATH, 'LANG=C.UTF-8', 'PYTHON_VERSION=3.12.7', 'APP_VERSION=1.0'],
  expose: [8000], service: true, stopExit: 0, logs: gunicornLogs, http: { port: 8000, responder: 'shop-app' }, pulled: true, registry: false, osRelease: DEBIAN, commands: SLIM.commands,
  files: [{ path: '/app/app.py', content: APP_PY }, { path: `${SITE}/flask/__init__.py`, content: '' }, { path: `${SITE}/gunicorn/__init__.py`, content: '' }],
};
const PGDATA: TerminalVolume = {
  name: 'shop_pgdata', created: '2026-11-15 17:21:00',
  files: [{ path: '/PG_VERSION', content: '17\n', owner: '999' }, { path: '/base/16384/16397', content: 'orders: 1,284 rows\n', owner: '999', mode: 0o600 }],
};
const FIX = host('dkr09-fix', 'tidal-01（同事寫的 compose.yaml：localhost 與簡短的 depends_on）', shopFiles(composeYaml({ dbHost: 'localhost', dependsShort: true })),
  { images: [POSTGRES, { ...REDIS, pulled: true }, SLIM, OLD_APP], programs: PROGRAMS });
const DAY2 = host('dkr09-day2', 'tidal-01（第二天：shop-app 已建置，shop_pgdata 裡有資料）', shopFiles(composeYaml()),
  { images: [POSTGRES, { ...REDIS, pulled: true }, SLIM, OLD_APP], programs: PROGRAMS, volumes: [PGDATA] });
// Exercise 2: a teammate bumped APP_VERSION to 1.1 in the Dockerfile; the old image and the data are still there.
const REBUILD = host('dkr09-rebuild', 'tidal-01（舊的 shop-app Image 與保留著資料的 shop_pgdata）', shopFiles(composeYaml(), DOCKERFILE('1.1')),
  { images: [POSTGRES, { ...REDIS, pulled: true }, SLIM, OLD_APP], programs: PROGRAMS, volumes: [PGDATA] });

// Exercise 3: the variants have another .env (another password, another database name).
const envFile = (content: string): TerminalFile => file('/home/rin/shop/.env', content, 'rin', 0o600);

export const DKR09: LessonContent = {
  lessonId: 'DKR09',
  motivation: '潮汐咖啡的訂單服務由三個部分組成：用 Flask 寫的 app、存訂單的 postgres 資料庫、放購物車與快取的 redis。照 DKR07 與 DKR08 的做法，在 tidal-01 上把它跑起來要先 `docker network create`、`docker volume create`，再打三個又長又容易打錯的 `docker run`（每個都要記得 `--network`、`-v`、`-e`、`-p`），還得照順序：資料庫先起來，app 才能連。新同事照著 README 一行行貼，少了一個 `-e` 就得從頭查；下班要收掉時又得記得刪哪些容器、哪個網路、哪個 Volume 不能刪。Docker Compose 把這些全部寫進一個 `compose.yaml`：有哪些服務、各用哪個 Image 或從哪個 Dockerfile 建置、公開哪些埠、環境變數與密碼從哪裡來、資料放在哪個 Volume、誰要等誰。之後只要 `docker compose up -d` 一個指令就能拉 Image、建置、建立網路與 Volume，並依相依順序啟動。這一課在 tidal-01 上讀懂 compose.yaml 的每個欄位與 `.env` 的變數，用 `docker compose config` 在啟動前抓出錯字與漏掉的變數，看懂專案名稱如何決定容器、網路與 Volume 的名字，弄清楚為什麼簡短的 `depends_on` 只等容器啟動、不等資料庫準備好，用健康檢查與 `condition: service_healthy` 修好它，最後熟悉 `ps`、`logs`、`exec`、`stop`、`down` 與 `--build` 這些日常操作，並避開 `down -v` 刪掉資料庫的陷阱。',
  sections: [
    {
      id: 'dkr09-s-why', title: '從一串 docker run 到一個 compose.yaml',
      blocks: [
        { type: 'p', text: '先回顧沒有 Compose 時要做的事。用 DKR07 的 Volume 與 DKR08 的自訂網路，啟動潮汐咖啡的三個服務需要下面這些指令，而且順序不能亂：網路與 Volume 要先存在，資料庫要先啟動，app 的 Image 要先建置。' },
        { type: 'list', ordered: true, items: [
          '`docker network create shop-net`',
          '`docker volume create pgdata`',
          '`docker run -d --name db --network shop-net -v pgdata:/var/lib/postgresql/data -e POSTGRES_USER=shop -e POSTGRES_PASSWORD=… -e POSTGRES_DB=shop postgres:17`',
          '`docker run -d --name cache --network shop-net redis:7.4`',
          '`docker build -t shop-app .`',
          '`docker run -d --name app --network shop-net -p 8080:8000 -e DATABASE_URL=postgres://shop:…@db:5432/shop -e REDIS_URL=redis://cache:6379/0 shop-app`',
        ] },
        { type: 'p', text: '這些指令沒有一個是錯的，問題在於它們只存在某個人的記憶或 README 裡：參數散在好幾行，換一台電腦就得重打；密碼直接出現在命令列與 Shell 的歷史紀錄；收拾時要自己記得刪哪些容器與網路。Docker Compose 的做法是把「應用由哪些容器組成、各自怎麼設定」寫成一個宣告式的檔案，放在專案的資料夾裡和程式碼一起進版本控制。檔名建議用 `compose.yaml`（Compose 也認得 `compose.yml`、`docker-compose.yaml` 與 `docker-compose.yml`），內容依 Compose Specification。指令是 Docker CLI 的外掛 `docker compose`（Compose v2，中間是空白）；舊的 Python 版 `docker-compose`（v1，中間是連字號）在 2023 年已停止維護，網路上的舊教學常用它，觀念相通，但請改用新的寫法。' },
        { type: 'table', head: ['docker run 的寫法', 'compose.yaml 的寫法（在服務底下）', '說明'], rows: [
          ['`--name db`', '服務的鍵 `db:`', '服務名稱；容器名稱由 Compose 依專案名稱產生（`shop-db-1`）'],
          ['`postgres:17`', '`image: postgres:17`', '直接用現成的 Image（Docker Hub 或其他 Registry）'],
          ['`docker build -t shop-app .`', '`build: .`', '從這個資料夾的 Dockerfile 建置；Image 名稱預設是 `專案-服務`（`shop-app`）'],
          ['`-p 8080:8000`', '`ports:` 底下 `- "8080:8000"`', '主機埠:容器埠；建議加引號，避免 YAML 把冒號數字當成別的型別'],
          ['`-e KEY=value`', '`environment:` 底下 `KEY: value`', '也可以寫成 `- KEY=value` 的清單'],
          ['`-v pgdata:/var/lib/postgresql/data`', '`volumes:` 底下 `- pgdata:/var/lib/postgresql/data`', '具名 Volume 必須在檔案最外層的 `volumes:` 宣告'],
          ['`--network shop-net`', '（不用寫）', 'Compose 自動替專案建立一個預設網路，所有服務都接在上面'],
        ] },
        { type: 'p', text: '下面是 tidal-01 上 `~/shop` 的專案：compose.yaml、`.env`、Dockerfile 與程式。最外層的 `services:` 列出三個服務（app、db、cache），`volumes:` 宣告 db 用的具名 Volume pgdata。app 用 `build: .` 從同一個資料夾的 Dockerfile 建置，db 與 cache 用 `image:` 直接取用官方 Image。`docker compose config --services` 列出服務名稱，`docker compose config` 印出 Compose 讀完、代換完變數、補上預設值之後真正要執行的設定：' },
        { type: 'example', id: 'dkr09-config' },
        { type: 'p', text: '比對兩份輸出就能看出 Compose 替我們做了什麼：`${DB_PASSWORD}` 換成了 `.env` 裡的值，`${DB_NAME:-shop}` 因為沒有設定而用了預設值 shop；`build: .` 展開成絕對路徑的 context 與預設的 Dockerfile；簡寫的 `"8080:8000"` 變成長格式的 target 與 published；每個服務都多了 `networks: default`，最後還列出網路 `shop_default` 與 Volume `shop_pgdata` 的真實名稱。最上面的 `name: shop` 是專案名稱，來自資料夾的名字。' },
      ],
    },
    {
      id: 'dkr09-s-vars', title: '環境變數、.env 與 docker compose config',
      blocks: [
        { type: 'p', text: 'compose.yaml 會進版本控制，所以密碼不該直接寫在裡面。Compose 在讀檔時會做變數代換：值裡的 `${變數}` 由執行 `docker compose` 的 Shell 中已匯出（export）的環境變數，或專案資料夾裡 `.env` 檔的 `名稱=值` 取代；兩邊都有時 Shell 的優先。`.env` 只留在各自的電腦或伺服器上，並寫進 `.gitignore`；這個專案也在 `.dockerignore` 排除它，免得 `COPY . .` 把密碼打包進 Image（DKR05）。' },
        { type: 'table', head: ['寫法', '變數沒有設定時', '用途'], rows: [
          ['`${DB_PASSWORD}`', '印出 WARN 並代換成空字串，照樣繼續', '一般的代換'],
          ['`${DB_NAME:-shop}`', '用預設值 shop（設成空字串也一樣）', '大多數環境相同、少數要改的設定'],
          ['`${DB_PASSWORD:?訊息}`', '停止並印出 `required variable DB_PASSWORD is missing a value: 訊息`（空字串也算沒有值）', '必填的值，例如密碼，寧可失敗也不要用空密碼啟動'],
          ['`$$`', '代表一個字面上的 `$`', '要把 `$` 原封不動交給容器裡的 Shell 時'],
        ] },
        { type: 'p', text: '`docker compose config` 是啟動前最好的檢查：它讀取檔案、代換變數、依 Compose 的規格驗證每個鍵與型別，再印出最後的結果；加 `-q` 只驗證、沒問題就什麼都不印（結束碼 0）。它只讀取與驗證檔案，不會建立或改變任何容器，很適合在 CI 裡、或每次修改 compose.yaml 之後先跑一次。下面的草稿是同事從舊教學複製來的，`docker compose config -q` 依序抓出三個問題：資料夾裡沒有 `.env` 所以必填的 DB_PASSWORD 沒有值、`depends_on` 打成了 `depend_on`、還有已經過時的 `version:`：' },
        { type: 'example', id: 'dkr09-errors' },
        { type: 'p', text: '錯字 `depend_on` 被回報為 `additional properties \'depend_on\' not allowed`：Compose 的規格不認得這個鍵，所以整個檔案被拒絕，而不是默默忽略它。這正是先跑 config 的價值，否則你會以為設定了相依關係，其實什麼都沒有。最外層的 `version: "3.8"` 是 v1 時代的寫法，現在的 Compose 只印警告並忽略它，刪掉即可。最後的 `-p demo` 示範專案名稱可以在命令列指定，下一節會看到它決定所有資源的名字。' },
        { type: 'callout', tone: 'warning', title: '.env 不會自動變成容器的環境變數', text: '很多人以為把 `DB_PASSWORD=…` 寫進 `.env`，容器裡就有 DB_PASSWORD 這個環境變數。其實專案資料夾的 `.env` 只用來代換 compose.yaml 裡的 `${…}`；容器拿到哪些環境變數，只由服務的 `environment:`（或明確寫出的 `env_file:`）決定。所以 db 服務要寫 `POSTGRES_PASSWORD: ${DB_PASSWORD:?…}`，app 也要在 `DATABASE_URL` 裡引用 `${DB_PASSWORD}`，兩邊才會拿到同一個密碼。不確定時，用 `docker compose config` 看代換後的值，或 `docker compose exec app env` 看容器裡實際的環境。' },
      ],
    },
    {
      id: 'dkr09-s-up', title: 'docker compose up：專案名稱與服務名稱',
      blocks: [
        { type: 'p', text: '`docker compose up -d` 在背景啟動整個專案（不加 `-d` 會附在前景輸出所有服務的日誌）。它依序做這些事：拉取還不在本機的 Image（cache 用的 redis:7.4）、建置有 `build:` 而 Image 還不存在的服務（app，下面是 BuildKit 的建置過程）、建立專案的網路與 Volume、依相依順序建立並啟動容器；app 要求 db 健康，所以 Compose 停在 `Waiting`，等 db 的健康檢查通過（`Healthy`）才啟動 app。Compose 的進度印在標準錯誤：在真正的終端機上它會以 `[+] Running 6/6` 與一列列打勾的畫面原地更新，輸出不是終端機時（例如寫進 CI 的紀錄）則是下面這種一行一個事件的格式，內容相同。' },
        { type: 'example', id: 'dkr09-up' },
        { type: 'p', text: '所有資源的名字都由專案名稱決定。專案名稱預設是 compose.yaml 所在資料夾的名稱（轉成小寫，只留英數字、`-` 與 `_`），也可以用 `docker compose -p 名稱`、環境變數 `COMPOSE_PROJECT_NAME` 或檔案最外層的 `name:` 指定。所以同一份 compose.yaml 複製到兩個資料夾，就是兩個互不干擾的專案；反過來，資料夾改名後再 `up`，Compose 會當成新專案，建立新的 Volume，看起來就像資料不見了。' },
        { type: 'table', head: ['資源', '命名規則', '這個專案'], rows: [
          ['容器', '`專案-服務-編號`', '`shop-app-1`、`shop-db-1`、`shop-cache-1`'],
          ['預設網路', '`專案_default`', '`shop_default`'],
          ['具名 Volume', '`專案_鍵`', '`shop_pgdata`'],
          ['建置的 Image', '`專案-服務`（服務有 `image:` 時用那個名稱）', '`shop-app:latest`'],
        ] },
        { type: 'p', text: '每個服務都接在專案的預設網路上，而且 Compose 把服務名稱登記成這個網路上的別名：從 app 容器裡查 `db`，Docker 的內建 DNS（DKR08）就回答 db 容器的位址。這就是 `DATABASE_URL` 寫 `@db:5432`、`REDIS_URL` 寫 `cache:6379` 的原因：用服務名稱加容器埠，而不是 IP 位址或主機上公開的埠。db 與 cache 沒有 `ports:`，只有同一個網路上的 app 連得到，主機外面連不進去，這正是我們要的。' },
        { type: 'callout', tone: 'warning', title: '容器裡的 localhost 不是資料庫', text: '在筆電上開發時，資料庫與程式都在同一台電腦，`DATABASE_URL` 寫 `localhost:5432` 理所當然。搬進 Compose 之後，app 容器裡的 localhost 只指向 app 容器自己，那裡沒有任何程式在 5432 監聽，所以連線被拒絕（Connection refused）。在 Compose 專案裡，連其他服務一律用服務名稱：`db:5432`、`cache:6379`。' },
      ],
    },
    {
      id: 'dkr09-s-health', title: 'depends_on 與健康檢查：等資料庫真的準備好',
      blocks: [
        { type: 'p', text: '`depends_on` 決定啟動順序。最常見的簡短寫法是一個清單：`depends_on: [db, cache]`（或分行的 `- db`、`- cache`）。它的意思只是「db 與 cache 的容器啟動之後，再啟動 app」，等同 `condition: service_started`。問題在於「容器啟動」不等於「服務可以用」：postgres 的容器一啟動就算 started，但它還要初始化或復原資料，幾秒後才開始接受連線。app 如果一啟動就連資料庫，正好落在這段空窗裡。' },
        { type: 'p', text: '下面是同事寫的版本：`depends_on` 用簡短的清單，`DATABASE_URL` 還留著筆電上的 localhost。`docker compose up -d` 沒有任何 `Waiting`，三個容器幾乎同時啟動；`docker compose ps` 裡 db 還是 `(health: starting)`，`pg_isready` 回答 `no response`，從 app 連 db 的 5432 被拒絕。過了幾秒資料庫才準備好，但 app 早就啟動了；而且它設定的是 localhost，就算資料庫好了也連不到：' },
        { type: 'example', id: 'dkr09-depends' },
        { type: 'p', text: '真實的應用在這種情況常常直接以錯誤結束，或在日誌裡不斷印出連線失敗；更麻煩的是它只在某些時候發生，取決於資料庫那天啟動得快不快。修法有兩部分。第一，替 db 加上健康檢查（healthcheck），讓 Docker 有辦法判斷「準備好了沒」；postgres 的 Image 附有 `pg_isready`，它檢查伺服器是否接受連線，回傳 0 表示 accepting connections、2 表示 no response。第二，把 app 的 `depends_on` 改成長格式，對 db 寫 `condition: service_healthy`。' },
        { type: 'table', head: ['healthcheck 的鍵', '這個專案', '意義（括號內是預設值）'], rows: [
          ['`test`', '`["CMD-SHELL", "pg_isready -U shop"]`', '探測的指令；`CMD` 直接執行，`CMD-SHELL` 交給容器的 `/bin/sh -c`；結束碼 0 代表健康'],
          ['`interval`', '`5s`', '每隔多久探測一次（30s）'],
          ['`timeout`', '`3s`', '一次探測最多等多久，超過算失敗（30s）'],
          ['`retries`', '`5`', '連續失敗幾次才標成 unhealthy（3）'],
          ['`start_period`', '（沒寫）', '啟動後的寬限期，這段時間的失敗不計入 retries（0s）'],
        ] },
        { type: 'table', head: ['depends_on 的 condition', 'Compose 等到什麼時候', '適合'], rows: [
          ['`service_started`（簡短寫法的意思）', '相依的容器已經啟動', '只在乎順序、對方啟動就能用的服務，例如這裡的 cache'],
          ['`service_healthy`', '相依的容器健康檢查通過；對方沒有 healthcheck 時是錯誤', '資料庫、訊息佇列這類要一段時間才能接受連線的服務'],
          ['`service_completed_successfully`', '相依的容器執行完畢且結束碼是 0', '先跑完才能開始的一次性工作，例如資料庫遷移（migration）'],
        ] },
        { type: 'p', text: '改好之後的寫法就是 `~/shop` 的 compose.yaml：`depends_on:` 底下 `db:` 再縮排 `condition: service_healthy`，`cache:` 縮排 `condition: service_started`。長格式是一個 mapping，所以兩個相依都要改成這種寫法，不能一個用 `- cache` 清單、一個用 `db:` 鍵（YAML 會回報 `did not find expected key`）。前面的 `docker compose up -d` 輸出中的 ` Container shop-db-1  Waiting`、` Container shop-db-1  Healthy` 兩行，就是 Compose 在等健康檢查。健康狀態也會出現在 `docker ps` 與 `docker compose ps` 的 STATUS，例如 `Up 5 seconds (healthy)`，或從 `docker inspect -f \'{{.State.Health.Status}}\' shop-db-1` 讀出。' },
        { type: 'callout', tone: 'note', title: 'depends_on 只管啟動那一刻', text: '`condition: service_healthy` 只在 `docker compose up`（與 start）啟動 app 之前等一次。之後資料庫重新啟動、網路短暫中斷，app 仍然得自己處理：連線失敗時重試、使用有重新連線能力的連線池。應用程式這一側怎麼用 `DATABASE_URL` 連線、處理交易與連線池，可以接著讀推薦的 DB16（程式串接資料庫與 ORM）。' },
      ],
    },
    {
      id: 'dkr09-s-ops', title: '日常操作：ps、logs、exec、stop、down 與 --build',
      blocks: [
        { type: 'p', text: '專案啟動之後，日常的操作都在 compose.yaml 所在的資料夾執行（或用 `-f` 指定檔案），對象是服務名稱，不必記容器名稱。' },
        { type: 'table', head: ['指令', '做什麼', '注意'], rows: [
          ['`docker compose ps`', '列出這個專案的容器、狀態（含健康狀態）與公開的埠', '只列執行中的，`-a` 連停止的也列'],
          ['`docker compose logs [服務]`', '各服務的日誌，每行前面加上 `db-1  |` 這樣的前綴', '`--tail N` 只看最後幾行，`-f` 持續追蹤'],
          ['`docker compose exec 服務 指令`', '在執行中的服務容器裡執行指令（例如 `pg_isready`、`env`）', '預設配置 TTY；在腳本裡用 `-T` 關掉'],
          ['`docker compose stop` ／ `start`', '停止／再啟動容器，容器與可寫層都保留', 'start 一樣依相依順序並等待健康檢查'],
          ['`docker compose restart [服務]`', '重新啟動容器', '不會套用 compose.yaml 的修改，改了設定要再 `up -d`'],
          ['`docker compose up -d`（再一次）', '比對設定：沒變的顯示 Running，改過的重建（Recreate）', '不會重新建置已存在的 Image'],
          ['`docker compose up -d --build`', '先重新建置有 `build:` 的服務，Image 變了就重建容器', '改了程式或 Dockerfile 之後用它'],
          ['`docker compose down`', '停止並刪除容器與網路', '具名 Volume 保留，資料還在'],
          ['`docker compose down -v`', '連 compose.yaml 宣告的 Volume 一起刪除', '資料庫的資料會永久消失'],
        ] },
        { type: 'p', text: '下面是第二天的 tidal-01：昨天已經建置過 shop-app，shop_pgdata 裡有訂單資料。再跑一次 `up -d`，已經在執行的服務只顯示 Running；`stop` 與 `start` 保留容器；改了 app.py 之後單純的 `up -d` 什麼也沒重建，因為 shop-app 的 Image 已經存在，Compose 不會自己去比對原始碼，要加 `--build` 才會重新建置並重建（Recreate）app 的容器，db 與 cache 不受影響。最後 `down` 刪掉容器與網路，Volume 仍在；`down -v` 才把它刪除：' },
        { type: 'example', id: 'dkr09-day2' },
        { type: 'callout', tone: 'warning', title: 'down -v 會刪掉資料庫', text: '`docker compose down -v` 的 `-v` 不是「詳細輸出」（verbose），而是 volumes：它會刪除 compose.yaml 宣告的具名 Volume，postgres 的整個資料目錄跟著消失，下次 `up` 得到的是一個全新的空資料庫，而且無法復原。想重新整理環境時，先問自己是否真的要清空資料；平常收工用 `docker compose down`（或 `stop`），要刪資料之前先用 DKR07 的方法備份 Volume。若有些 Volume 絕對不能被 `down -v` 刪掉，可以自己建立後在 compose.yaml 標成 `external: true`，Compose 就不會管理它的生命週期。' },
      ],
    },
    {
      id: 'dkr09-s-limits', title: 'Compose 適合什麼、不適合什麼',
      blocks: [
        { type: 'p', text: 'Compose 最適合「一台主機上的一組容器」：開發環境（新同事 clone 專案、準備好 `.env`、`docker compose up -d` 就能開始寫程式）、CI 裡的整合測試（測試前啟動真的資料庫，測完 `down -v` 清掉）、以及小型服務的單機部署。它還有一些本課沒有操作、可以之後再查的功能：同一個服務啟動多個容器、只在需要時啟動部分服務的 profiles、拆成多個檔案再合併或 include、跑一次性指令的 `docker compose run`、以及 `restart:` 重新啟動策略（DKR13 會看到容器反覆重啟的情形）。' },
        { type: 'list', items: [
          '它只管理一台主機：主機掛了，整個應用就停了，沒有自動搬到其他機器。',
          '它只在你下指令時做事：容器結束或不健康時，沒有一個持續運作的控制迴圈去修復（需要時要靠 `restart:` 策略）。',
          '更新時要停舊容器、起新容器，沒有內建的滾動更新與流量切換。',
        ] },
        { type: 'p', text: '當需求變成多台主機、自動修復與不中斷的更新，就是容器編排（例如 Kubernetes）登場的時候，那是之後的課程主題；但在那之前，大多數專案用 Compose 描述開發與測試環境就已經非常足夠，而且 compose.yaml 本身就是一份最準確的「這個系統由什麼組成」的文件。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [MAIN, FIX, DAY2, REBUILD],
    examples: [
      {
        id: 'dkr09-config', title: '讀懂 compose.yaml 與 config 的結果', machine: 'dkr09-tidal',
        description: '~/shop 的檔案、compose.yaml 與 .env；config --services 列出服務，config 印出代換變數與補上預設值之後的完整設定。',
        steps: [
          { command: 'cd shop', output: "" },
          { command: 'ls -a', output: ".  ..  .dockerignore  .env  Dockerfile  app.py  compose.yaml  requirements.txt" },
          { command: 'cat compose.yaml', output: "services:\n  app:\n    build: .\n    ports:\n      - \"8080:8000\"\n    environment:\n      DATABASE_URL: postgres://shop:${DB_PASSWORD}@db:5432/${DB_NAME:-shop}\n      REDIS_URL: redis://cache:6379/0\n    depends_on:\n      db:\n        condition: service_healthy\n      cache:\n        condition: service_started\n\n  db:\n    image: postgres:17\n    environment:\n      POSTGRES_USER: shop\n      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}\n      POSTGRES_DB: ${DB_NAME:-shop}\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    healthcheck:\n      test: [\"CMD-SHELL\", \"pg_isready -U shop\"]\n      interval: 5s\n      timeout: 3s\n      retries: 5\n\n  cache:\n    image: redis:7.4\n\nvolumes:\n  pgdata:" },
          { command: 'cat .env', output: "DB_PASSWORD=lesson-demo-pw" },
          { command: 'docker compose config --services', output: "app\ncache\ndb" },
          { command: 'docker compose config', output: "name: shop\nservices:\n  app:\n    build:\n      context: /home/rin/shop\n      dockerfile: Dockerfile\n    depends_on:\n      cache:\n        condition: service_started\n        required: true\n      db:\n        condition: service_healthy\n        required: true\n    environment:\n      DATABASE_URL: postgres://shop:lesson-demo-pw@db:5432/shop\n      REDIS_URL: redis://cache:6379/0\n    networks:\n      default: null\n    ports:\n      - mode: ingress\n        target: 8000\n        published: \"8080\"\n        protocol: tcp\n  cache:\n    image: redis:7.4\n    networks:\n      default: null\n  db:\n    environment:\n      POSTGRES_DB: shop\n      POSTGRES_PASSWORD: lesson-demo-pw\n      POSTGRES_USER: shop\n    healthcheck:\n      test:\n        - CMD-SHELL\n        - pg_isready -U shop\n      timeout: 3s\n      interval: 5s\n      retries: 5\n    image: postgres:17\n    networks:\n      default: null\n    volumes:\n      - type: volume\n        source: pgdata\n        target: /var/lib/postgresql/data\n        volume: {}\nnetworks:\n  default:\n    name: shop_default\nvolumes:\n  pgdata:\n    name: shop_pgdata" },
        ],
      },
      {
        id: 'dkr09-errors', title: '用 docker compose config 抓出錯誤', machine: 'dkr09-tidal',
        description: '草稿沒有 .env（必填變數沒有值）、depends_on 打錯字、還有過時的 version；逐一修正直到 config -q 沒有輸出，最後用 -p 指定專案名稱。',
        steps: [
          { command: 'cd drafts', output: "" },
          { command: 'cat compose.yaml', output: "version: \"3.8\"\nservices:\n  db:\n    image: postgres:17\n    environment:\n      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}\n  app:\n    build: ../shop\n    depend_on:\n      - db" },
          { command: 'docker compose config -q', output: "error while interpolating services.db.environment.POSTGRES_PASSWORD: required variable DB_PASSWORD is missing a value: set DB_PASSWORD in .env" },
          { command: 'cp ../shop/.env .', output: "" },
          { command: 'docker compose config -q', output: "WARN[0000] /home/rin/drafts/compose.yaml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion\nvalidating /home/rin/drafts/compose.yaml: services.app additional properties 'depend_on' not allowed" },
          { command: "sed -i 's/depend_on/depends_on/' compose.yaml", output: "" },
          { command: "sed -i '/^version/d' compose.yaml", output: "" },
          { command: 'docker compose config -q', output: "" },
          { command: 'docker compose config --services', output: "app\ndb" },
          { command: 'docker compose -p demo config | head -n 1', output: "name: demo" },
        ],
      },
      {
        id: 'dkr09-up', title: '一個指令啟動整個應用', machine: 'dkr09-tidal',
        description: 'up -d 拉取 redis、建置 app、建立 shop_default 與 shop_pgdata、依序啟動並等 db 健康；之後看 ps、logs、網路、Volume，並從 app 以服務名稱找到 db。',
        steps: [
          { command: 'cd shop', output: "" },
          { command: 'docker compose up -d', output: " cache  Pulling\n cache  Pulled\n#0 building with \"default\" instance using docker driver\n\n#1 [internal] load build definition from Dockerfile\n#1 transferring dockerfile: 205B done\n#1 DONE 0.0s\n\n#2 [internal] load metadata for docker.io/library/python:3.12-slim\n#2 DONE 0.5s\n\n#3 [internal] load .dockerignore\n#3 transferring context: 23B done\n#3 DONE 0.0s\n\n#4 [1/5] FROM docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5\n#4 resolve docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5 done\n#4 DONE 0.0s\n\n#5 [internal] load build context\n#5 transferring context: 1.253kB done\n#5 DONE 0.0s\n\n#6 [2/5] WORKDIR /app\n#6 DONE 0.0s\n\n#7 [3/5] COPY requirements.txt .\n#7 DONE 0.0s\n\n#8 [4/5] RUN pip install --no-cache-dir -r requirements.txt\n#8 0.420 Collecting flask==3.0.3 (from -r requirements.txt (line 1))\n#8 0.740 Collecting werkzeug>=3.0.0 (from flask==3.0.3)\n#8 1.060 Collecting MarkupSafe>=2.1.1 (from werkzeug==3.1.3)\n#8 1.380 Collecting jinja2>=3.1.2 (from flask==3.0.3)\n#8 1.700 Collecting itsdangerous>=2.1.2 (from flask==3.0.3)\n#8 2.020 Collecting click>=8.1.3 (from flask==3.0.3)\n#8 2.340 Collecting blinker>=1.6.2 (from flask==3.0.3)\n#8 2.660 Collecting gunicorn==23.0.0 (from -r requirements.txt (line 2))\n#8 2.980 Collecting packaging (from gunicorn==23.0.0)\n#8 3.300 Collecting psycopg==3.2.3 (from -r requirements.txt (line 3))\n#8 3.620 Collecting typing-extensions>=4.6 (from psycopg==3.2.3)\n#8 3.940 Collecting redis==5.2.1 (from -r requirements.txt (line 4))\n#8 4.260 Installing collected packages: MarkupSafe, werkzeug, jinja2, itsdangerous, click, blinker, flask, packaging, gunicorn, typing-extensions, psycopg, redis\n#8 4.580 Successfully installed blinker-1.9.0 click-8.1.7 flask-3.0.3 gunicorn-23.0.0 itsdangerous-2.2.0 jinja2-3.1.4 MarkupSafe-3.0.2 packaging-24.2 psycopg-3.2.3 redis-5.2.1 typing-extensions-4.12.2 werkzeug-3.1.3\n#8 DONE 5.0s\n\n#9 [5/5] COPY . .\n#9 DONE 0.0s\n\n#10 exporting to image\n#10 exporting layers 0.4s done\n#10 writing image sha256:3949f83736c92cdbd934365e7a21c73747b147c5f502009187dd5e4b26e2e147 done\n#10 naming to docker.io/library/shop-app:latest done\n#10 DONE 0.4s\n Service app  Built\n Network shop_default  Creating\n Network shop_default  Created\n Volume \"shop_pgdata\"  Creating\n Volume \"shop_pgdata\"  Created\n Container shop-cache-1  Creating\n Container shop-cache-1  Created\n Container shop-db-1  Creating\n Container shop-db-1  Created\n Container shop-app-1  Creating\n Container shop-app-1  Created\n Container shop-cache-1  Starting\n Container shop-cache-1  Started\n Container shop-db-1  Starting\n Container shop-db-1  Started\n Container shop-db-1  Waiting\n Container shop-db-1  Healthy\n Container shop-app-1  Starting\n Container shop-app-1  Started" },
          { command: 'docker compose ps', output: "NAME           IMAGE         COMMAND                  SERVICE   CREATED         STATUS                   PORTS\nshop-app-1     shop-app      \"gunicorn --bind 0.0…\"   app       5 seconds ago   Up Less than a second    0.0.0.0:8080->8000/tcp, [::]:8080->8000/tcp\nshop-cache-1   redis:7.4     \"docker-entrypoint.s…\"   cache     5 seconds ago   Up 5 seconds             6379/tcp\nshop-db-1      postgres:17   \"docker-entrypoint.s…\"   db        5 seconds ago   Up 5 seconds (healthy)   5432/tcp" },
          { command: 'curl -s localhost:8080/', output: "潮汐咖啡訂單服務" },
          { command: 'docker compose logs app', output: "app-1  | [2026-11-22 10:00:00 +0000] [1] [INFO] Starting gunicorn 23.0.0\napp-1  | [2026-11-22 10:00:00 +0000] [1] [INFO] Listening at: http://0.0.0.0:8000 (1)\napp-1  | [2026-11-22 10:00:00 +0000] [1] [INFO] Using worker: sync\napp-1  | [2026-11-22 10:00:00 +0000] [7] [INFO] Booting worker with pid: 7" },
          { command: 'docker network ls', output: "NETWORK ID     NAME           DRIVER    SCOPE\nb9d7c79c8bc5   bridge         bridge    local\n0ba38d897ac3   host           host      local\n2c56178f9334   none           null      local\na2344e88df9b   shop_default   bridge    local" },
          { command: 'docker volume ls', output: "DRIVER    VOLUME NAME\nlocal     shop_pgdata" },
          { command: 'docker compose exec app getent hosts db', output: "172.18.0.3      db" },
          { command: 'docker compose exec app env | grep _URL', output: "DATABASE_URL=postgres://shop:lesson-demo-pw@db:5432/shop\nREDIS_URL=redis://cache:6379/0" },
          { command: 'docker compose exec db pg_isready -U shop', output: "/var/run/postgresql:5432 - accepting connections" },
          { command: 'docker compose ls', output: "NAME      STATUS       CONFIG FILES\nshop      running(3)   /home/rin/shop/compose.yaml" },
        ],
      },
      {
        id: 'dkr09-depends', title: '簡短的 depends_on 不等資料庫', machine: 'dkr09-fix',
        description: '同事的 compose.yaml：depends_on 是簡短的清單、DATABASE_URL 寫 localhost。up 沒有 Waiting，app 啟動時 db 還沒準備好；幾秒後 db 健康了，但 localhost 仍然連不到。',
        steps: [
          { command: 'cd shop', output: "" },
          { command: 'grep -n -A 2 depends_on compose.yaml', output: "9:    depends_on:\n10-      - db\n11-      - cache" },
          { command: 'grep -n DATABASE_URL compose.yaml', output: "7:      DATABASE_URL: postgres://shop:${DB_PASSWORD}@localhost:5432/${DB_NAME:-shop}" },
          { command: 'docker compose up -d', output: " Network shop_default  Creating\n Network shop_default  Created\n Volume \"shop_pgdata\"  Creating\n Volume \"shop_pgdata\"  Created\n Container shop-cache-1  Creating\n Container shop-cache-1  Created\n Container shop-db-1  Creating\n Container shop-db-1  Created\n Container shop-app-1  Creating\n Container shop-app-1  Created\n Container shop-cache-1  Starting\n Container shop-cache-1  Started\n Container shop-db-1  Starting\n Container shop-db-1  Started\n Container shop-app-1  Starting\n Container shop-app-1  Started" },
          { command: 'docker compose ps', output: "NAME           IMAGE         COMMAND                  SERVICE   CREATED                  STATUS                                     PORTS\nshop-app-1     shop-app      \"gunicorn --bind 0.0…\"   app       Less than a second ago   Up Less than a second                      0.0.0.0:8080->8000/tcp, [::]:8080->8000/tcp\nshop-cache-1   redis:7.4     \"docker-entrypoint.s…\"   cache     Less than a second ago   Up Less than a second                      6379/tcp\nshop-db-1      postgres:17   \"docker-entrypoint.s…\"   db        Less than a second ago   Up Less than a second (health: starting)   5432/tcp" },
          { command: 'docker compose exec db pg_isready -U shop', output: "/var/run/postgresql:5432 - no response" },
          { command: 'docker compose exec app nc -zv db 5432', output: "nc: connect to db (172.18.0.3) port 5432 (tcp) failed: Connection refused" },
          { command: 'sleep 5', output: "" },
          { command: "docker compose ps --format '{{.Service}} {{.Status}}'", output: "app Up 5 seconds\ncache Up 5 seconds\ndb Up 5 seconds (healthy)" },
          { command: 'docker compose exec app nc -zv db 5432', output: "Connection to db (172.18.0.3) 5432 port [tcp/*] succeeded!" },
          { command: 'docker compose exec app env | grep DATABASE_URL', output: "DATABASE_URL=postgres://shop:lesson-demo-pw@localhost:5432/shop" },
          { command: 'docker compose exec app nc -zv localhost 5432', output: "nc: connect to localhost (127.0.0.1) port 5432 (tcp) failed: Connection refused" },
        ],
      },
      {
        id: 'dkr09-day2', title: '日常操作與重新建置', machine: 'dkr09-day2',
        description: '已建置過的專案：up 與再一次 up、stop 與 start、restart、logs --tail；改了程式後 up 不會重建，up --build 才會；down 保留 Volume，down -v 刪除它。',
        steps: [
          { command: 'cd shop', output: "" },
          { command: 'docker compose up -d', output: " Network shop_default  Creating\n Network shop_default  Created\n Container shop-cache-1  Creating\n Container shop-cache-1  Created\n Container shop-db-1  Creating\n Container shop-db-1  Created\n Container shop-app-1  Creating\n Container shop-app-1  Created\n Container shop-cache-1  Starting\n Container shop-cache-1  Started\n Container shop-db-1  Starting\n Container shop-db-1  Started\n Container shop-db-1  Waiting\n Container shop-db-1  Healthy\n Container shop-app-1  Starting\n Container shop-app-1  Started" },
          { command: 'docker compose up -d', output: " Container shop-cache-1  Running\n Container shop-db-1  Running\n Container shop-app-1  Running" },
          { command: 'docker compose stop', output: " Container shop-app-1  Stopping\n Container shop-app-1  Stopped\n Container shop-db-1  Stopping\n Container shop-db-1  Stopped\n Container shop-cache-1  Stopping\n Container shop-cache-1  Stopped" },
          { command: "docker compose ps -a --format 'table {{.Name}}\\t{{.Status}}'", output: "NAME           STATUS\nshop-app-1     Exited (0) Less than a second ago\nshop-cache-1   Exited (0) Less than a second ago\nshop-db-1      Exited (0) Less than a second ago" },
          { command: 'docker compose start', output: " Container shop-cache-1  Starting\n Container shop-cache-1  Started\n Container shop-db-1  Starting\n Container shop-db-1  Started\n Container shop-db-1  Waiting\n Container shop-db-1  Healthy\n Container shop-app-1  Starting\n Container shop-app-1  Started" },
          { command: 'docker compose restart cache', output: " Container shop-cache-1  Restarting\n Container shop-cache-1  Started" },
          { command: 'docker compose logs --tail 1 db', output: "db-1  | LOG:  database system is ready to accept connections" },
          { command: 'echo "# v1.1" >> app.py', output: "" },
          { command: 'docker compose up -d', output: " Container shop-cache-1  Running\n Container shop-db-1  Running\n Container shop-app-1  Running" },
          { command: 'docker compose up -d --build', output: "#0 building with \"default\" instance using docker driver\n\n#1 [internal] load build definition from Dockerfile\n#1 transferring dockerfile: 205B done\n#1 DONE 0.0s\n\n#2 [internal] load metadata for docker.io/library/python:3.12-slim\n#2 DONE 0.5s\n\n#3 [internal] load .dockerignore\n#3 transferring context: 23B done\n#3 DONE 0.0s\n\n#4 [1/5] FROM docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5\n#4 resolve docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5 done\n#4 DONE 0.0s\n\n#5 [internal] load build context\n#5 transferring context: 1.26kB done\n#5 DONE 0.0s\n\n#6 [2/5] WORKDIR /app\n#6 DONE 0.0s\n\n#7 [3/5] COPY requirements.txt .\n#7 DONE 0.0s\n\n#8 [4/5] RUN pip install --no-cache-dir -r requirements.txt\n#8 0.420 Collecting flask==3.0.3 (from -r requirements.txt (line 1))\n#8 0.740 Collecting werkzeug>=3.0.0 (from flask==3.0.3)\n#8 1.060 Collecting MarkupSafe>=2.1.1 (from werkzeug==3.1.3)\n#8 1.380 Collecting jinja2>=3.1.2 (from flask==3.0.3)\n#8 1.700 Collecting itsdangerous>=2.1.2 (from flask==3.0.3)\n#8 2.020 Collecting click>=8.1.3 (from flask==3.0.3)\n#8 2.340 Collecting blinker>=1.6.2 (from flask==3.0.3)\n#8 2.660 Collecting gunicorn==23.0.0 (from -r requirements.txt (line 2))\n#8 2.980 Collecting packaging (from gunicorn==23.0.0)\n#8 3.300 Collecting psycopg==3.2.3 (from -r requirements.txt (line 3))\n#8 3.620 Collecting typing-extensions>=4.6 (from psycopg==3.2.3)\n#8 3.940 Collecting redis==5.2.1 (from -r requirements.txt (line 4))\n#8 4.260 Installing collected packages: MarkupSafe, werkzeug, jinja2, itsdangerous, click, blinker, flask, packaging, gunicorn, typing-extensions, psycopg, redis\n#8 4.580 Successfully installed blinker-1.9.0 click-8.1.7 flask-3.0.3 gunicorn-23.0.0 itsdangerous-2.2.0 jinja2-3.1.4 MarkupSafe-3.0.2 packaging-24.2 psycopg-3.2.3 redis-5.2.1 typing-extensions-4.12.2 werkzeug-3.1.3\n#8 DONE 5.0s\n\n#9 [5/5] COPY . .\n#9 DONE 0.0s\n\n#10 exporting to image\n#10 exporting layers 0.4s done\n#10 writing image sha256:db51c0e824569f92cb510165337d2878be62e33951d73c2d83fd141f5bd56b84 done\n#10 naming to docker.io/library/shop-app:latest done\n#10 DONE 0.4s\n Service app  Built\n Container shop-cache-1  Running\n Container shop-db-1  Running\n Container shop-app-1  Recreate\n Container shop-app-1  Recreated\n Container shop-db-1  Waiting\n Container shop-db-1  Healthy\n Container shop-app-1  Starting\n Container shop-app-1  Started" },
          { command: 'docker compose down', output: " Container shop-app-1  Stopping\n Container shop-app-1  Stopped\n Container shop-db-1  Stopping\n Container shop-db-1  Stopped\n Container shop-cache-1  Stopping\n Container shop-cache-1  Stopped\n Container shop-app-1  Removing\n Container shop-app-1  Removed\n Container shop-db-1  Removing\n Container shop-db-1  Removed\n Container shop-cache-1  Removing\n Container shop-cache-1  Removed\n Network shop_default  Removing\n Network shop_default  Removed" },
          { command: 'docker volume ls', output: "DRIVER    VOLUME NAME\nlocal     shop_pgdata" },
          { command: 'docker compose down -v', output: " Volume shop_pgdata  Removing\n Volume shop_pgdata  Removed" },
          { command: 'docker volume ls', output: "DRIVER    VOLUME NAME" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr09-ex-healthy', title: '讓 app 等資料庫健康，再一次啟動整個應用', machine: 'dkr09-fix',
        statement: 'tidal-01 的 `~/shop/compose.yaml` 是同事寫的，有兩個問題：app 的 `depends_on` 是簡短的清單（`- db`、`- cache`），不會等資料庫準備好；`DATABASE_URL` 的主機寫成了 `localhost`。請修改 compose.yaml（例如用 `sed -i`）：把 app 的相依改成長格式，對 db 使用 `condition: service_healthy`、對 cache 使用 `condition: service_started`；並讓 `DATABASE_URL` 以服務名稱 `db` 連到 5432 埠。然後用一個指令在背景啟動整個專案，使 db 健康、app 執行中，並能從主機的 8080 埠連到 app。',
        checks: [
          { kind: 'compose', project: 'shop', service: 'db', state: 'running', health: 'healthy' },
          { kind: 'compose', project: 'shop', service: 'cache', state: 'running' },
          { kind: 'compose', project: 'shop', service: 'app', state: 'running' },
          { kind: 'container', name: 'shop-app-1', env: 'DATABASE_URL=postgres://shop:lesson-demo-pw@db:5432/shop' },
          { kind: 'http', url: 'http://localhost:8080/health', status: 200 },
        ],
        solution: [
          'cd shop',
          "sed -i 's/@localhost:5432/@db:5432/' compose.yaml",
          "sed -i 's/^      - db$/      db:\\n        condition: service_healthy/' compose.yaml",
          "sed -i 's/^      - cache$/      cache:\\n        condition: service_started/' compose.yaml",
          'docker compose config -q',
          'docker compose up -d',
        ],
        mistakes: [
          { commands: ['cd shop', "sed -i 's/@localhost:5432/@db:5432/' compose.yaml", 'docker compose up -d'], why: '只修了主機名稱，depends_on 仍是簡短寫法：up 不等健康檢查，啟動完 db 還在 health: starting' },
          {
            commands: ['cd shop', "sed -i 's/^      - db$/      db:\\n        condition: service_healthy/' compose.yaml", "sed -i 's/^      - cache$/      cache:\\n        condition: service_started/' compose.yaml", 'docker compose up -d'],
            why: '會等 db 健康了，但 DATABASE_URL 還是 localhost：app 容器裡的 localhost 是它自己',
          },
          {
            commands: ['cd shop', "sed -i 's/@localhost:5432/@db:5432/' compose.yaml", "sed -i 's/^      - db$/      db:\\n        condition: service_healthy/' compose.yaml", 'docker compose up -d'],
            why: '只把 db 改成長格式，`- cache` 還是清單：同一個 depends_on 混用 mapping 與清單，YAML 解析失敗，什麼也沒啟動',
          },
          {
            commands: ['cd shop', "sed -i 's/@localhost:5432/@db:5432/' compose.yaml", "sed -i 's/^      - db$/      db:\\n        condition: service_healthy/' compose.yaml", "sed -i 's/^      - cache$/      cache:\\n        condition: service_started/' compose.yaml", 'docker compose up -d db'],
            why: '只啟動了 db 服務，app 與 cache 沒有啟動',
          },
        ],
        hints: [
          '`grep -n -A 2 depends_on compose.yaml` 與 `grep -n DATABASE_URL compose.yaml` 先看清楚要改的行。',
          '`sed -i \'s/@localhost:5432/@db:5432/\' compose.yaml` 換掉主機名稱。',
          'sed 的取代字串可以用 `\\n` 換行：`sed -i \'s/^      - db$/      db:\\n        condition: service_healthy/\' compose.yaml`，cache 那行同理（service_started）。',
          '改完先 `docker compose config -q` 確認沒有錯誤，再 `docker compose up -d`。',
        ],
        explanation: '簡短的 `depends_on: [db, cache]` 等同 `condition: service_started`，只等容器啟動，postgres 還沒接受連線時 app 就啟動了。長格式的 `db: {condition: service_healthy}` 讓 `docker compose up -d` 先等 db 的 healthcheck（`pg_isready -U shop`）通過，輸出裡會出現 `Waiting` 與 `Healthy`；長格式是 mapping，所以 cache 也要改成 `cache:` 加 `condition: service_started`，混用清單會讓 YAML 解析失敗。`DATABASE_URL` 的主機改成服務名稱 `db`，由專案預設網路的內建 DNS 解析成 db 容器的位址；localhost 在 app 容器裡指的是它自己。最後一個 `docker compose up -d` 就依序啟動整個專案，只啟動 db 則 app 與 cache 都不在。',
      },
      {
        id: 'dkr09-ex-rebuild', title: '套用新版程式，但保留資料庫的資料', machine: 'dkr09-rebuild',
        statement: '上週 tidal-01 已經用 Compose 跑過 `~/shop`，下班前以 `docker compose down` 收掉；本機還留著當時建置的 shop-app Image（APP_VERSION 1.0），Volume `shop_pgdata` 裡有上週的訂單資料。同事已把 Dockerfile 的 `APP_VERSION` 改成 1.1。請在背景啟動整個專案，讓 app 跑的是依目前 Dockerfile 建置的新版（容器的 `APP_VERSION=1.1`），db 健康，而且資料庫原有的資料必須保留。',
        checks: [
          { kind: 'compose', project: 'shop', service: 'app', state: 'running' },
          { kind: 'container', name: 'shop-app-1', env: 'APP_VERSION=1.1' },
          { kind: 'compose', project: 'shop', service: 'db', state: 'running', health: 'healthy' },
          { kind: 'volume', name: 'shop_pgdata', file: '/base/16384/16397' },
          { kind: 'http', url: 'http://localhost:8080/health', status: 200 },
        ],
        solution: ['cd shop', 'docker compose up -d --build'],
        mistakes: [
          { commands: ['cd shop', 'docker compose up -d'], why: 'shop-app 的 Image 已經存在，up 不會重新建置：app 跑的仍是 APP_VERSION 1.0 的舊 Image' },
          { commands: ['cd shop', 'docker compose down -v', 'docker compose up -d --build'], why: '新版跑起來了，但 down -v 刪掉了 shop_pgdata，上週的資料全部消失，db 拿到的是新的空 Volume' },
          { commands: ['cd shop', 'docker compose build'], why: '只建置了新的 Image，沒有啟動任何服務' },
          { commands: ['cd shop', 'docker compose restart'], why: '專案目前沒有容器，restart 沒有東西可以重新啟動；它也不會重新建置 Image' },
        ],
        hints: [
          '`docker images shop-app` 看得到上週建置的 Image；`docker compose up -d` 遇到已存在的 Image 會直接使用它。',
          '`docker compose up -d --build` 先依目前的 Dockerfile 重新建置，再建立或重建容器。',
          '不要加 `-v`：Volume 裡是資料庫的資料。',
        ],
        explanation: 'Compose 只在 Image 不存在時才自動建置，所以單純的 `docker compose up -d` 會沿用上週的 shop-app（APP_VERSION 1.0）。`docker compose up -d --build` 先依目前的 Dockerfile 重新建置，再啟動整個專案；db 照樣掛上既有的 `shop_pgdata`，資料原封不動，並等健康檢查通過才啟動 app。`docker compose down -v` 會刪除宣告的 Volume，資料無法復原；`build` 只建置不啟動；`restart` 不會建置，而且專案裡沒有容器可以重啟。',
      },
      {
        id: 'dkr09-ex-env', title: '查出 app 實際拿到的 DATABASE_URL', machine: 'dkr09-tidal',
        statement: '`~/shop/.env` 由維運同事管理，你不確定裡面設了哪些變數。不要啟動任何服務，用 `docker compose config` 查出代換變數之後，app 服務的 `DATABASE_URL` 那一行（例如接上 `| grep DATABASE_URL`，只印出那一行）。',
        checks: [{ kind: 'output', fromCommand: '^(sudo )?docker compose (-f \\S+ |--project-directory \\S+ )?config\\b' }],
        solution: ['cd shop', 'docker compose config | grep DATABASE_URL'],
        mistakes: [
          { commands: ['cd shop', 'grep DATABASE_URL compose.yaml'], why: '印出的是 compose.yaml 的原文，`${DB_PASSWORD}` 與 `${DB_NAME:-shop}` 都還沒有代換' },
          { commands: ['cd shop', 'cat .env'], why: '只看到 .env 的內容，看不出代換與預設值套用之後的結果' },
          { commands: ['echo "      DATABASE_URL: postgres://shop:lesson-demo-pw@db:5432/shop"'], why: '直接打出答案，沒有查詢；.env 換了內容答案就不同' },
          { commands: ['cd shop', 'docker compose exec app env | grep DATABASE_URL'], why: '專案還沒有啟動，app 沒有在執行；題目也要求不要啟動服務' },
        ],
        variants: [
          { label: '.env 另外設定了 DB_NAME 的 tidal-01', files: [envFile('DB_PASSWORD=lesson-staging-pw\nDB_NAME=shop_staging\n')] },
          { label: '.env 是另一組密碼的 tidal-01', files: [envFile('# rotated 2026-11-20\nDB_PASSWORD=demo-rotated-pw-2\n')] },
        ],
        hints: [
          '`docker compose config` 印出代換變數之後的完整設定，不需要啟動任何服務。',
          '在 `~/shop` 執行，或用 `docker compose -f shop/compose.yaml config`。',
          '`docker compose config | grep DATABASE_URL` 只留下那一行。',
        ],
        explanation: '`docker compose config` 會讀取 compose.yaml、用 Shell 匯出的變數與專案資料夾的 `.env` 代換 `${…}`、套用 `${DB_NAME:-shop}` 這類預設值，再印出最後的設定，所以它看到的就是 app 容器會拿到的值，而且不需要啟動服務。這台的 .env 只設了 DB_PASSWORD，所以資料庫名稱用預設值 shop；另一台的 .env 設了 DB_NAME=shop_staging，結果就變成 `@db:5432/shop_staging`。直接 grep compose.yaml 只看到未代換的原文，cat .env 則看不出預設值套用後的結果。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr09-q1', prompt: 'app 服務寫了 `depends_on: [db]`（簡短寫法），db 是 postgres。`docker compose up -d` 會等到什麼時候才啟動 app？',
      options: ['等 db 的健康檢查回報 healthy，確認資料庫已經可以接受連線', '等 db 的容器啟動，不管資料庫是否已經接受連線', '等 db 的程式執行完畢並以 0 結束', '完全不等，app 與 db 同時建立並啟動'],
      answer: 1,
      explanation: '簡短寫法等同 `condition: service_started`：只保證 db 的容器先啟動，postgres 是否已經接受連線不在考慮之內。等健康檢查是 `service_healthy` 的行為；等結束碼 0 是 `service_completed_successfully`；depends_on 確實會影響順序，所以不是完全不等。',
    },
    {
      id: 'dkr09-q2', prompt: '在同一個 Compose 專案裡，app 容器要連 db 服務的 postgres（容器埠 5432，沒有 `ports:`）。`DATABASE_URL` 的主機與埠應該寫什麼？',
      options: ['`localhost:5432`', '`127.0.0.1:5432`', '主機的位址加 `:5432`', '`db:5432`'],
      answer: 3,
      explanation: 'Compose 把服務名稱登記在專案的預設網路上，內建 DNS 會把 `db` 解析成 db 容器的位址，5432 是它在容器裡監聽的埠。localhost 與 127.0.0.1 在 app 容器裡都是 app 自己；db 沒有 `ports:`，主機上根本沒有公開 5432，用主機位址也連不到。',
    },
    {
      id: 'dkr09-q3', prompt: '`~/shop/compose.yaml` 沒有 `name:`，最外層宣告了 `volumes: pgdata:`。在 `~/shop` 執行 `docker compose up -d` 之後，`docker volume ls` 會看到哪個 Volume？',
      options: ['`shop_pgdata`', '`pgdata`', '`shop-pgdata-1`', '`shop_default`'],
      answer: 0,
      explanation: '專案名稱預設是資料夾名稱 shop，具名 Volume 的實際名稱是「專案_鍵」，所以是 shop_pgdata。只有標成 `external: true` 或另外寫 `name:` 時才會是 pgdata；`專案-服務-編號` 是容器的命名方式；shop_default 是預設網路的名稱。',
    },
    {
      id: 'dkr09-q4', prompt: '專案在執行中，你執行 `docker compose down -v`。下列敘述何者正確？',
      options: ['只停止容器，容器、網路與 Volume 都保留，之後可以 start', '刪除容器與 Compose 建立的網路，具名 Volume 一律保留，資料還在', '刪除容器、網路與 compose.yaml 宣告的 Volume，資料庫的資料跟著消失', '`-v` 是 verbose 的意思，只會多印出每個資源被停止與刪除的詳細過程'],
      answer: 2,
      explanation: '`-v` 是 volumes 的意思：down 原本就刪除容器與預設網路，加上 `-v` 還會刪掉宣告的具名 Volume（與匿名 Volume），postgres 的資料目錄就此消失。只停止容器是 `docker compose stop`；保留 Volume 是不加 `-v` 的 `down`；它並不是 verbose。',
    },
    {
      id: 'dkr09-q5', prompt: 'compose.yaml 寫著 `POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}`，但 Shell 沒有匯出 DB_PASSWORD，專案資料夾也沒有 `.env`。執行 `docker compose up -d` 會怎樣？',
      options: ['印出 `variable is not set` 的警告，用空字串當密碼照樣建立並啟動容器', '用預設值 `set DB_PASSWORD in .env` 當作密碼', '跳出提示要你輸入密碼', 'Compose 回報 DB_PASSWORD 是必填變數而停止，什麼都不建立'],
      answer: 3,
      explanation: '`:?` 表示必填：變數沒有設定或是空字串時，Compose 在代換階段就以錯誤停止，訊息帶上冒號後面的文字。印警告並代換成空字串是 `${DB_PASSWORD}` 的行為；用預設值是 `:-`；Compose 不會互動式地詢問變數。',
    },
    {
      id: 'dkr09-q6', prompt: '同事把服務的 `depends_on` 打成了 `depend_on`。執行 `docker compose config -q` 會得到什麼？',
      options: ['沒有輸出，Compose 忽略不認得的鍵', '一個驗證錯誤，指出 `depend_on` 是不允許的額外屬性，整個檔案不被接受', '一個 YAML 語法錯誤 `did not find expected key`', '印出一個警告，接著自動把 `depend_on` 當成 `depends_on` 繼續處理'],
      answer: 1,
      explanation: 'Compose 依規格驗證每個服務的鍵，不認得的鍵會得到 `additional properties \'depend_on\' not allowed` 而失敗，不會被默默忽略，也不會自動更正。這個檔案的 YAML 語法本身沒有問題（縮排正確），所以不是 `did not find expected key` 那種解析錯誤。',
    },
    {
      id: 'dkr09-q7', prompt: '你改了 app.py，接著執行 `docker compose up -d`，輸出只有三行 `Running`，網站還是舊版。原因與做法是什麼？',
      options: ['Compose 不會因為原始碼改變而重新建置已存在的 Image，要用 `docker compose up -d --build`', 'Image 其實已經重建了，只是 app 容器還要再執行 `docker compose restart app` 才會載入新程式', '要先 `docker compose down -v` 清掉舊的容器與資料，再 up 一次才會用到新程式', 'app.py 要放進 Volume 才會生效'],
      answer: 0,
      explanation: '有 `build:` 的服務只在 Image 不存在時才自動建置；Image 已經在本機，up 只比對設定，所以顯示 Running。`--build` 會重新建置，Image 變了就重建容器。restart 只是重新啟動同一個舊 Image 的容器；down -v 會刪掉資料庫資料而且同樣不建置；把程式掛進 Volume 是開發時的 bind mount 做法，不是這裡的問題所在。',
    },
    {
      id: 'dkr09-q8', prompt: '專案資料夾的 `.env` 裡有 `DB_PASSWORD=…`，compose.yaml 的 db 服務沒有 `environment:` 也沒有 `env_file:`。db 容器裡會有 DB_PASSWORD 這個環境變數嗎？',
      options: ['會，Compose 讀到 .env 之後，會把裡面的每一個變數都自動傳進專案裡的每一個容器', '只有 db 服務會拿到，因為它是資料庫', '不會：.env 只用來代換 `${…}`；容器的環境看 environment／env_file', '會，但要先執行一次 `docker compose config` 把 .env 寫進設定之後才生效'],
      answer: 2,
      explanation: '專案資料夾的 .env 是給 Compose 自己做變數代換用的，不會自動成為任何容器的環境變數；要讓容器拿到值，必須在 `environment:` 引用 `${DB_PASSWORD}`，或用 `env_file:` 明確指定檔案。沒有哪個服務會特別自動取得它；`docker compose config` 只是顯示結果，不會改變行為。',
    },
  ],
};

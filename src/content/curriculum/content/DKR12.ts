/*
 * DKR12 Container Security (DKR-5, terminal-sim; the blueprint's case-study-board activity, like LNX01 and SRV13). A terminal
 * lesson on the runtime profile (engine stage E24, §14) built as a security review: the case file of the ledger team's
 * ledger-api:1.4 on the Docker host audit-07 (user yuting in the docker group). The image was built on the full node:22
 * base, runs as root, bakes an API key into ENV, used an npm token through ARG and --build-arg (docker history keeps it in
 * the RUN rows) and copied a .env that a later RUN deletes; the running container has --privileged, the Docker socket
 * mounted and a writable root file system. The learner reads the evidence (docker history --no-trunc, docker image inspect,
 * docker inspect's User, Privileged, ReadonlyRootfs, CapAdd, CapDrop, SecurityOpt and Mounts), tries each restriction on
 * test containers (-u, --cap-drop, --read-only with and without --tmpfs) and rebuilds 1.5.0 hardened: node:22-slim, USER
 * node, the key in a read-only mounted file, --read-only with a tmpfs /tmp, --cap-drop ALL, no-new-privileges. Vulnerability
 * scanning is not simulated: the case file has two scan reports in a generic, lesson-made format (no scanner's output; the
 * IDs are placeholders). ledger-api:1.4 is a declared image whose history was produced by building the team's Dockerfile on
 * this machine (only its ARG row is written as the Dockerfile declares it, ARG NPM_TOKEN, where the engine's own build prints
 * the --build-arg value; the RUN rows carry the value either way). The host, team,
 * user, keys and tokens are made up (every credential contains "demo" and "lesson"). Every transcript output was produced by
 * replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalDocker, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const mine = (path: string, content: string, mode = 0o644) => file(path, content, 'yuting', mode);
const mineDir = (path: string, mode = 0o755) => dir(path, 'yuting', mode);

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false', 'id', 'whoami', 'chmod', 'chown'];
const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const NODE_ENV = [PATH_ENV, 'NODE_VERSION=22.11.0', 'YARN_VERSION=1.22.22'];
const PASSWD = 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\nnode:x:1000:1000::/home/node:/bin/bash\n';
const GROUP = 'root:x:0:\ndaemon:x:1:\nnogroup:x:65534:\nnode:x:1000:\n';
const NODE_FILES = [{ path: '/etc/passwd', content: PASSWD }, { path: '/etc/group', content: GROUP }, { path: '/usr/local/bin/node', content: '' }];
const NPM = [
  { name: 'express', version: '4.21.1', size: 220_000, depends: ['body-parser'] },
  { name: 'body-parser', version: '1.20.3', size: 60_000 },
  { name: 'pino', version: '9.5.0', size: 640_000 },
];
const NODE_USER = { createdBy: 'RUN /bin/sh -c groupadd --gid 1000 node   && useradd --uid 1000 --gid node --shell /bin/bash --create-home node # buildkit', size: 8_910 };
const NODE_INSTALL = 'RUN /bin/sh -c dpkgArch="$(dpkg --print-architecture)"   && curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"   && tar -xJf "node-v$NODE_VERSION-linux-x64.tar.xz" -C /usr/local --strip-components=1 # buildkit';
const NODE_TOP = [
  { createdBy: 'ENV YARN_VERSION=1.22.22' },
  { createdBy: 'RUN /bin/sh -c set -ex   && curl -fsSLO --compressed "https://yarnpkg.com/downloads/$YARN_VERSION/yarn-v$YARN_VERSION.tar.gz"   && tar -xzf yarn-v$YARN_VERSION.tar.gz -C /opt/ # buildkit', size: 5_590_702 },
  { createdBy: 'COPY docker-entrypoint.sh /usr/local/bin/ # buildkit', size: 388 },
  { createdBy: 'ENTRYPOINT ["docker-entrypoint.sh"]' },
  { createdBy: 'CMD ["node"]' },
];

/** The official full image: Debian with buildpack-deps' tools (curl, git, ssh, compilers, -dev libraries, ImageMagick) and Node.js. */
const NODE_FULL: TerminalImage = {
  name: 'node:22', size: 1_120_000_000, created: '2026-11-12 03:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'], env: NODE_ENV, pulled: true, osRelease: DEBIAN,
  commands: [...BASIC, 'node'], files: NODE_FILES, packages: { npm: NPM }, output: 'Welcome to Node.js v22.11.0.\n',
  history: [
    { createdBy: '# debian.sh --arch \'amd64\' out/ \'bookworm\' \'@1731283200\'', size: 117_000_000 },
    { createdBy: 'CMD ["bash"]' },
    { createdBy: 'RUN /bin/sh -c set -eux;  apt-get update;  apt-get install -y --no-install-recommends   ca-certificates   curl   gnupg   netbase   wget  ;  rm -rf /var/lib/apt/lists/* # buildkit', size: 24_000_000 },
    { createdBy: 'RUN /bin/sh -c set -eux;  apt-get update;  apt-get install -y --no-install-recommends   git   mercurial   openssh-client   subversion   procps  ;  rm -rf /var/lib/apt/lists/* # buildkit', size: 64_400_000 },
    { createdBy: 'RUN /bin/sh -c set -ex;  apt-get update;  apt-get install -y --no-install-recommends   autoconf   automake   bzip2   default-libmysqlclient-dev   g++   gcc   imagemagick   libcurl4-openssl-dev   libpq-dev   libssl-dev   make   xz-utils   zlib1g-dev  ;  rm -rf /var/lib/apt/lists/* # buildkit', size: 769_000_000 },
    NODE_USER, { createdBy: 'ENV NODE_VERSION=22.11.0' }, { createdBy: NODE_INSTALL, size: 140_000_000 }, ...NODE_TOP,
  ],
};
/** The slim image: debian:bookworm-slim and Node.js only. */
const NODE_SLIM: TerminalImage = {
  name: 'node:22-slim', size: 226_400_000, created: '2026-11-12 03:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'], env: NODE_ENV, pulled: true, osRelease: DEBIAN,
  commands: [...BASIC, 'node'], files: NODE_FILES, packages: { npm: NPM }, output: 'Welcome to Node.js v22.11.0.\n',
  history: [
    { createdBy: '# debian.sh --arch \'amd64\' out/ \'bookworm\' \'@1731283200\'', size: 74_800_000 },
    { createdBy: 'CMD ["bash"]' },
    NODE_USER, { createdBy: 'ENV NODE_VERSION=22.11.0' },
    { createdBy: NODE_INSTALL.replace(' # buildkit', '   && apt-get purge -y --auto-remove # buildkit'), size: 146_000_000 }, ...NODE_TOP,
  ],
};

const PACKAGE_JSON = '{\n  "name": "ledger-api",\n  "version": "1.5.0",\n  "private": true,\n  "dependencies": {\n    "express": "^4.21.1",\n    "pino": "^9.5.0"\n  }\n}\n';
const LOCK = '{\n  "name": "ledger-api",\n  "lockfileVersion": 3\n}\n';
const SERVER_14 = "const express = require('express');\n\nconst key = process.env.LEDGER_API_KEY;\nconst app = express();\napp.get('/healthz', (req, res) => res.send('ok\\n'));\napp.get('/version', (req, res) => res.send('1.4.2\\n'));\napp.listen(8080, () => console.log('ledger-api 1.4.2 listening on :8080'));\n";
const SERVER_15 = "const fs = require('fs');\nconst express = require('express');\n\n// 1.5.0: the key comes from a mounted file, not from the image\nconst key = fs.readFileSync('/run/secrets/ledger_api_key', 'utf8').trim();\nfs.mkdirSync('/tmp/ledger-receipts', { recursive: true });\n\nconst app = express();\napp.get('/healthz', (req, res) => res.send('ok\\n'));\napp.get('/version', (req, res) => res.send('1.5.0\\n'));\napp.listen(8080, () => console.log('ledger-api 1.5.0 listening on :8080'));\n";
const TEAM_DOCKERFILE = 'FROM node:22\nARG NPM_TOKEN\nENV LEDGER_API_KEY=demo-ledger-key-lesson-01\nWORKDIR /app\nCOPY . .\nRUN echo "//npm.example.com/:_authToken=${NPM_TOKEN}" > .npmrc && npm ci --omit=dev && rm .npmrc\nRUN rm -f .env\nEXPOSE 8080\nCMD ["node", "server.js"]\n';
const RUN_SCRIPT = '#!/bin/sh\n# 帳務組目前的啟動方式（ledger-api:1.4，2026-11-03 起）\n# --privileged 與 docker.sock：「讓服務可以自己更新」\ndocker run -d --name ledger --privileged \\\n  -v /run/docker.sock:/var/run/docker.sock \\\n  -p 8080:8080 ledger-api:1.4\n';
const BRIEF = [
  '審查案件 SEC-2026-118：帳務組 ledger-api',
  '請求：1.5.0 上線前，審查 Image 的建置方式與容器的啟動方式。',
  '背景：npm.example.com 的稽核紀錄顯示，帳務組的 npm Token 在 11/20 被不明來源用來下載內部套件（Token 已撤銷）。',
  '帳務組的說法：Token 只在建置時用過，RUN 最後已經 rm .npmrc；.env 也在下一個 RUN 刪掉了。',
  '證物：執行中的容器 ledger（ledger-api:1.4）、run-ledger.sh、兩份弱點掃描報告。',
  '程式碼：~/ledger（server.js 已是 1.5.0：金鑰改從 /run/secrets/ledger_api_key 讀取；Dockerfile 還是舊的）。',
  '新的 API 金鑰：~/secrets/ledger_api_key（1.4 裡的那一把已撤銷）。',
].join('\n') + '\n';
const REPORT_HEAD = (target: string) => [
  '# 弱點掃描報告（課程資料：一般格式，不是任何掃描工具的實際輸出）',
  `# target: ${target}`,
  '# scanned: 2026-11-23 13:05 UTC; IDs are lesson placeholders (real reports list CVE or GHSA IDs)',
  '# only CRITICAL and HIGH rows are listed',
  'SEVERITY  PACKAGE              FOUND IN                  FIX AVAILABLE  ID',
];
const SCAN_FULL = [
  ...REPORT_HEAD('ledger-api:1.4 (base node:22, Debian 12)'),
  'CRITICAL  imagemagick          base: build tools         yes            LESSON-0007',
  'CRITICAL  libde265-0           base: build tools         no             LESSON-0012',
  'HIGH      git                  base: scm tools           yes            LESSON-0021',
  'HIGH      openssh-client       base: scm tools           yes            LESSON-0023',
  'HIGH      libpq-dev            base: build tools         yes            LESSON-0026',
  'HIGH      gcc-12               base: build tools         no             LESSON-0028',
  'HIGH      libssl3              base: debian              yes            LESSON-0031',
  'HIGH      perl-base            base: debian              no             LESSON-0044',
  '(11 more HIGH rows in build tools and scm tools)',
  'summary: critical=2 high=19 medium=71 low=95; os packages=437, npm packages=3',
].join('\n') + '\n';
const SCAN_SLIM = [
  ...REPORT_HEAD('node:22-slim (Debian 12)'),
  'HIGH      libssl3              base: debian              yes            LESSON-0031',
  'HIGH      perl-base            base: debian              no             LESSON-0044',
  'summary: critical=0 high=2 medium=9 low=18; os packages=92, npm packages=0',
].join('\n') + '\n';

const RESPONDERS = [
  { id: 'ledger-14', server: 'express', routes: [{ path: '/healthz', body: 'ok\n', type: 'text/html; charset=utf-8' }, { path: '/version', body: '1.4.2\n', type: 'text/html; charset=utf-8' }] },
  { id: 'ledger-15', server: 'express', routes: [{ path: '/healthz', body: 'ok\n', type: 'text/html; charset=utf-8' }, { path: '/version', body: '1.5.0\n', type: 'text/html; charset=utf-8' }] },
];
const RECEIPTS = { writes: ['/tmp/ledger-receipts'], readOnlyError: { output: "Error: EROFS: read-only file system, mkdir '/tmp/ledger-receipts'", exit: 1 } };

/** The ledger team's image 1.4, built from TEAM_DOCKERFILE with --build-arg NPM_TOKEN=<token> (its history is that build's). */
const ledger14 = (token: string): TerminalImage => ({
  name: 'ledger-api:1.4', size: 1_120_920_561, created: '2026-11-03 09:12:00', registry: false, pulled: true, osRelease: DEBIAN,
  entrypoint: ['docker-entrypoint.sh'], cmd: ['node', 'server.js'], env: [...NODE_ENV, 'LEDGER_API_KEY=demo-ledger-key-lesson-01'], workdir: '/app', expose: [8080],
  commands: [...BASIC, 'node'],
  files: [...NODE_FILES, { path: '/app/server.js', content: SERVER_14 }, { path: '/app/package.json', content: PACKAGE_JSON.replace('1.5.0', '1.4.2') }, { path: '/app/package-lock.json', content: LOCK },
    { path: '/app/Dockerfile', content: TEAM_DOCKERFILE }, ...['express', 'body-parser', 'pino'].map(n => ({ path: `/app/node_modules/${n}/package.json`, content: `{"name":"${n}"}\n` }))],
  history: [...NODE_FULL.history!,
    { createdBy: 'ARG NPM_TOKEN' },
    { createdBy: 'ENV LEDGER_API_KEY=demo-ledger-key-lesson-01' },
    { createdBy: 'WORKDIR /app', size: 0, layer: true },
    { createdBy: 'COPY . . # buildkit', size: 561 },
    { createdBy: `RUN |1 NPM_TOKEN=${token} /bin/sh -c echo "//npm.example.com/:_authToken=\${NPM_TOKEN}" > .npmrc && npm ci --omit=dev && rm .npmrc # buildkit`, size: 920_000 },
    { createdBy: `RUN |1 NPM_TOKEN=${token} /bin/sh -c rm -f .env # buildkit`, size: 0, layer: true },
    { createdBy: 'EXPOSE map[8080/tcp:{}]' },
    { createdBy: 'CMD ["node" "server.js"]' },
  ],
  service: true, http: { port: 8080, responder: 'ledger-14' }, logs: ['ledger-api 1.4.2 listening on :8080'], stopExit: 0, ...RECEIPTS,
});
const dockerOf = (token: string): TerminalDocker => ({
  images: [NODE_FULL, NODE_SLIM, ledger14(token)],
  programs: [{
    command: ['node', 'server.js'], needs: ['server.js', '/run/secrets/ledger_api_key'], service: true, http: { port: 8080, responder: 'ledger-15' }, logs: ['ledger-api 1.5.0 listening on :8080'], stopExit: 0,
    missing: { output: "Error: ENOENT: no such file or directory, open '/run/secrets/ledger_api_key'", exit: 1 }, ...RECEIPTS,
  }],
  containers: [{
    name: 'ledger', image: 'ledger-api:1.4', state: 'running', created: '2026-11-03 09:30:00', started: '2026-11-03 09:30:00', ports: ['8080:8080'],
    privileged: true, volumes: ['/run/docker.sock:/var/run/docker.sock'],
  }],
});

const AUDIT: TerminalMachine = {
  id: 'dkr12-audit', title: 'audit-07（審查用的 Docker 主機：帳務組的 ledger-api）', user: 'yuting', host: 'audit-07', cwd: '/home/yuting/case', profile: 'runtime',
  now: '2026-11-23 14:20:00', boot: '2026-11-23 08:00:00',
  files: [
    dir('/var'), { path: '/var/run', kind: 'link', mode: 0o777, owner: 'root', target: '/run' },
    dir('/home'), mineDir('/home/yuting', 0o750),
    mineDir('/home/yuting/case'), mine('/home/yuting/case/brief.txt', BRIEF), mine('/home/yuting/case/run-ledger.sh', RUN_SCRIPT, 0o755),
    mine('/home/yuting/case/scan-ledger-api-1.4.txt', SCAN_FULL), mine('/home/yuting/case/scan-node-22-slim.txt', SCAN_SLIM),
    mineDir('/home/yuting/ledger'), mine('/home/yuting/ledger/Dockerfile', TEAM_DOCKERFILE), mine('/home/yuting/ledger/.env', 'LEDGER_DB_PASSWORD=demo-db-password-lesson\n', 0o600),
    mine('/home/yuting/ledger/package.json', PACKAGE_JSON), mine('/home/yuting/ledger/package-lock.json', LOCK), mine('/home/yuting/ledger/server.js', SERVER_15),
    mineDir('/home/yuting/secrets', 0o700), mine('/home/yuting/secrets/ledger_api_key', 'demo-ledger-key-lesson-rotated\n', 0o600),
  ],
  accounts: { groups: [{ name: 'sudo', members: ['yuting'] }, { name: 'docker', gid: 988, members: ['yuting'] }] },
  responders: RESPONDERS,
  docker: dockerOf('demo-npm-token-lesson-4d1'),
};

/** Writes a whole file in one command (the way the exercise's solution rewrites a Dockerfile). */
const rewrite = (name: string, text: string) => `printf '${text.replace(/\n/g, '\\n')}' > ${name}`;
const HARDENED = 'FROM node:22-slim\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev\nCOPY server.js ./\nUSER node\nEXPOSE 8080\nCMD ["node", "server.js"]\n';
const CHMOD_777 = 'FROM node:22-slim\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev\nCOPY server.js ./\nRUN chmod -R 777 /app\nEXPOSE 8080\nCMD ["node", "server.js"]\n';
const FULL_BASE = HARDENED.replace('node:22-slim', 'node:22');
const NO_USER = CHMOD_777.replace('RUN chmod -R 777 /app\n', '');
const IGNORE = '.env\n.git\nnode_modules\n';
const SECRET_MOUNT = '-v ~/secrets/ledger_api_key:/run/secrets/ledger_api_key:ro';
const run15 = (flags: string) => `docker run -d --name ledger ${flags} -p 8080:8080 ledger-api:1.5`;
const HARD_FLAGS = `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges ${SECRET_MOUNT}`;
const prepare = (dockerfile: string) => ['cd ~/ledger', rewrite('Dockerfile', dockerfile), rewrite('.dockerignore', IGNORE), 'docker build -q -t ledger-api:1.5 .', 'docker rm -f ledger'];

export const DKR12: LessonContent = {
  lessonId: 'DKR12',
  motivation: '帳務組的 ledger-api 準備上線 1.5.0，安全組卻先收到一則警訊：外部套件庫的稽核紀錄顯示，帳務組的 npm Token 被不明來源拿去下載內部套件。帳務組的說法是「Token 只在建置時用過，用完就刪了」，而且容器「本來就是隔離的」。這一課把你放在審查者的位置：手上有一個案件資料夾、一台跑著 ledger-api:1.4 的 Docker 主機，以及帳務組的 Dockerfile 與啟動指令稿。審查不靠口頭說明，而是靠證物：Image 的歷史與設定、執行中容器的 docker inspect，以及在測試容器上實際試出來的結果。你會看到常見的安全問題一次出現在同一個服務上：以 root 執行、1.12GB 的完整基底、寫進 ENV 的金鑰、經由 ARG 留在歷史裡的 Token、後面的 RUN 才刪掉的 .env、--privileged、掛進容器的 docker.sock，以及可以任意改寫的根檔案系統。最後你要把它改成非 root、唯讀、只保留必要能力、機密在執行時才提供的 1.5.0，並且確認服務照樣回應。',
  sections: [
    {
      id: 'dkr12-s-case', title: '審查案件：以證物為準',
      blocks: [
        { type: 'p', text: '審查一個容器化的服務，要看兩樣東西：Image 裡有什麼（它怎麼建置、帶著哪些檔案與設定），以及容器怎麼被執行（docker run 給了它哪些權限）。Dockerfile 只是線索，不是證物：倉庫裡的 Dockerfile 可能在 Image 建置之後又改過，`--build-arg` 傳入的值根本不會出現在 Dockerfile 裡，啟動時的選項也只寫在某個指令稿或部署設定裡。所以審查從主機上實際存在的 Image 與容器開始，用 docker 自己的指令讀出證據。' },
        { type: 'p', text: 'audit-07 是安全組的審查主機，~/case 是案件資料夾：審查請求、帳務組的啟動指令稿與兩份弱點掃描報告。~/ledger 是帳務組的程式碼，其中 server.js 已經是 1.5.0（金鑰改從檔案讀取），Dockerfile 還是建置 1.4 時的那一份。主機上的容器 ledger 正以 ledger-api:1.4 執行：' },
        { type: 'example', id: 'dkr12-case' },
        { type: 'p', text: '只讀這幾個檔案就能列出一張待查清單。接下來的每一節各自取得證據並說明修正方式：' },
        { type: 'table', head: ['發現', '證據從哪裡來', '風險', '修正'], rows: [
          ['以 root 執行（沒有 USER）', '`docker exec ledger id`、`.Config.User` 是空的', '程式一旦被攻破，攻擊者就是容器裡的 root，可以改寫程式、配合其他設定逃到主機', '`USER node` 或數字 UID'],
          ['完整的 node:22 基底', '`docker images` 的 1.12GB、`docker history` 的編譯器與開發函式庫', '執行時用不到的套件也帶著它們的弱點，攻擊者手邊有現成的工具', 'node:22-slim，或多階段建置（DKR10）'],
          ['API 金鑰寫在 ENV', '`docker image inspect` 的 Config.Env', '拉得到 Image 的人都讀得到', '撤銷金鑰，改在執行時以檔案提供'],
          ['npm Token 經由 ARG 傳入', '`docker history --no-trunc` 的 RUN 列', '同上，而且讀 Dockerfile 看不出來', '撤銷 Token，改用 BuildKit 的 secret 掛載'],
          ['`COPY . .` 帶進 .env', 'history 裡 561B 的 COPY 層與之後 0B 的 `rm -f .env`', '檔案仍在 COPY 那一層', '.dockerignore 與只複製需要的檔案'],
          ['--privileged 與掛載 docker.sock', '`.HostConfig.Privileged`、`.Mounts`', '兩者都等於把主機的 root 交給容器', '全部拿掉'],
          ['可寫的根檔案系統、預設的能力', '`ReadonlyRootfs=false`、`CapDrop` 是 null', '攻擊者可以改寫程式、留下工具', '`--read-only` 加 `--tmpfs`、`--cap-drop ALL`'],
        ] },
        { type: 'callout', tone: 'tip', title: '審查的習慣', text: '每一項發現都記下「哪個指令、印出什麼」。這樣的紀錄可以重現、可以交給別人複查，修正之後也能用同一個指令證明問題已經消失。只寫「Image 裡好像有金鑰」的報告，很容易被一句「我們已經刪掉了」打發。' },
      ],
    },
    {
      id: 'dkr12-s-secrets', title: '機密不進 Image：ENV、ARG 與每一層都讀得到',
      blocks: [
        { type: 'p', text: 'Image 是拿來分發的：它會被推到 Registry、拉到每一台主機、留在 CI 的快取與同事的筆電裡。任何拿到 Image 的人，不必啟動容器就能讀它的設定與歷史，也能把每一層的檔案解開來看。所以「機密不進 Image」不是建議，而是唯一安全的做法。下面從 ledger-api:1.4 讀出三種寫法留下的痕跡：' },
        { type: 'example', id: 'dkr12-secrets' },
        { type: 'p', text: 'ENV 的值存在 Image 的設定（Config.Env），每個由它建立的容器都繼承它，所以 `docker image inspect`、`docker inspect` 與容器裡的 `env` 都看得到。ARG 不進入設定，但 BuildKit 把每個 RUN 執行時的建置參數寫進那一步的歷史：`RUN |1 NPM_TOKEN=demo-npm-token-lesson-4d1 /bin/sh -c …`，連後面的 `rm -f .env` 那一步也帶著它。至於 .env，`docker run … ls -a /app` 確實看不到它，但 history 裡的 `COPY . .` 是一個 561B 的層，`rm -f .env` 是之後另一個 0B 的層：Image 的層只會往上疊，後面的層只是標記「這個檔案已刪除」，蓋住了下面的檔案，下面那一層的內容一個位元組也沒有少。真實環境用 `docker save ledger-api:1.4 -o ledger.tar` 匯出 Image，再解開 COPY 那一層的 tar，就能讀到 .env 的內容（模擬環境沒有 docker save，這一步只在課文說明）。順帶一提，`COPY . .` 也把 Dockerfile 本身帶進了 /app。' },
        { type: 'table', head: ['寫法', '機密留在哪裡', '誰讀得到'], rows: [
          ['`ENV KEY=…`', 'Image 的 Config.Env，以及每個容器的環境', '用 `docker image inspect`、`docker inspect` 或容器裡的 `env`'],
          ['`ARG` 加 `--build-arg`', '之後每個 RUN 的歷史（`RUN |1 名稱=值 …`）', '用 `docker history --no-trunc`'],
          ['`COPY` 進來的 .env、.npmrc、私鑰', '那一步的層，後面刪除也還在', '解開 Image 的層（`docker save` 再 `tar`）'],
          ['同一個 RUN 建立又刪除的檔案', '不在層裡，但指令與參數在歷史裡', '用 `docker history --no-trunc`'],
          ['RUN 把機密印到輸出', 'CI 的建置紀錄', '看得到 CI 日誌的人'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：後面的 RUN 刪掉，機密就不在 Image 裡了', text: '「我們在下一個 RUN 刪掉 .env 了」「Token 用完就 rm 了」是最常見的說法。容器裡看不到檔案，不代表 Image 裡沒有：刪除只是在上面多一層遮住它（DKR06 學過，這也是 Image 不會變小的原因），ARG 的值則一直留在歷史裡。正確的做法是從一開始就不讓機密進入建置：用 .dockerignore 排除 .env，或只 COPY 需要的檔案。已經進過 Image 的機密，就要當成已經公開：立刻撤銷、換一把新的。重新建置一個乾淨的 Image 並不會收回別人早已拉走的那一份。' },
      ],
    },
    {
      id: 'dkr12-s-runtime-secrets', title: '把機密留到執行時再提供',
      blocks: [
        { type: 'p', text: '乾淨的 Image 只放程式與相依套件，同一個 Image 在測試與正式環境配上不同的金鑰；金鑰在啟動容器時才由外部提供，換金鑰也不必重新建置。提供的方式有好幾種，安全程度不同：' },
        { type: 'table', head: ['方式', '寫法', '要注意的地方'], rows: [
          ['唯讀掛載的檔案', '`-v ~/secrets/ledger_api_key:/run/secrets/ledger_api_key:ro`', '不出現在 Config.Env；程式從檔案讀取；權限依數字 UID 判斷（DKR07），容器裡的使用者要讀得到它'],
          ['`-e` 環境變數', '`docker run -e LEDGER_API_KEY=…`', '值會出現在 `docker inspect` 的 Config.Env 與容器裡每個行程的環境，可能被除錯頁或錯誤回報印出，命令列還會留在 Shell 的歷史'],
          ['`--env-file`', '`docker run --env-file 檔案`', '不留在命令列，但結果一樣放進 Config.Env；模擬環境沒有這個選項'],
          ['建置期的 secret', 'Dockerfile 的 `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci`，建置時 `docker build --secret id=npmrc,src=$HOME/.npmrc .`', '只在那一個 RUN 執行期間掛載，不進層也不進歷史；模擬環境不支援 `RUN --mount`'],
          ['編排工具的 secret', 'Compose 與 Swarm 的 `secrets:`、Kubernetes 的 Secret', 'Compose 與 Swarm 預設掛成 /run/secrets/名稱 的檔案；Kubernetes 可以掛成檔案或環境變數'],
        ] },
        { type: 'p', text: '帳務組在 1.5.0 已經把程式改成從 /run/secrets/ledger_api_key 讀金鑰，所以啟動時只要把主機上權限 600 的檔案以 `:ro` 掛進去。這也是許多官方 Image 支援的慣例：例如 postgres 的 Image 除了 POSTGRES_PASSWORD，也接受指向檔案的 POSTGRES_PASSWORD_FILE。建置時真的需要私有套件庫的 Token，就用 BuildKit 的 secret 掛載，不要用 ARG。' },
        { type: 'p', text: '別忘了建置內容本身：`COPY . .` 會把資料夾裡的一切送進 Image。寫一個 .dockerignore 排除 .env、.git 與本機的 node_modules，更穩當的做法是像 1.5.0 那樣只複製需要的檔案（package.json、package-lock.json 與 server.js），新出現的檔案就不會不小心跟著進去。較新的 BuildKit 也有一項建置檢查 SecretsUsedInArgOrEnv，看到名稱像 TOKEN、KEY、PASSWORD 的 ARG 或 ENV 就提出警告（模擬環境不印這項警告）：建置時出現它，就該回頭檢查 Dockerfile。' },
      ],
    },
    {
      id: 'dkr12-s-root', title: '容器裡的 root 與危險的執行選項',
      blocks: [
        { type: 'p', text: '容器以 Image 設定的 USER 執行，Dockerfile 沒有 USER 就是 root（UID 0）。Docker 預設沒有啟用 user namespace（`userns-remap` 或 rootless 模式要另外設定），所以容器裡的 UID 0 就是主機核心眼中的 UID 0，只是被 namespace、能力（capability）、seccomp 與 AppArmor 這幾層限制圍住。這些限制擋得住大部分的事，但只要執行選項把它們拆掉，或核心與容器執行環境出現漏洞，root 就是最直接的突破口。下面讀出 ledger 容器實際擁有的權限：' },
        { type: 'example', id: 'dkr12-inspect' },
        { type: 'p', text: '結果很清楚：程式以 root 執行、`User` 是空的，root 可以在程式的資料夾裡建立檔案（`touch /app/backdoor.js` 成功，結束碼 0），攻擊者同樣能改寫 server.js、把後門寫進程式。`Privileged=true` 讓容器拿到所有的 Linux 能力與主機的所有裝置，seccomp 與 AppArmor 的限制也不再套用，等於把主機交出去；`CapAdd`、`CapDrop` 與 `SecurityOpt` 都是 null，代表其他設定全是預設值。`.Mounts` 裡有主機的 /run/docker.sock（Ubuntu 的 /var/run 是指向 /run 的連結，兩個路徑是同一個 socket）：在容器裡它的群組顯示成 988（容器的 /etc/group 沒有 docker 這個群組），容器裡的 root 一樣讀寫得到。能連上 Docker 的 API，就能叫以 root 執行的 dockerd 做任何事，例如啟動一個掛載主機根目錄的特權容器，所以這和 DKR02 說的「docker 群組等於 root」是同一件事。' },
        { type: 'table', head: ['執行選項', '它拿掉的保護'], rows: [
          ['`--privileged`', '所有能力、主機的所有裝置、seccomp 與 AppArmor 的限制'],
          ['`-v /var/run/docker.sock:…`', '容器可以操作 Docker daemon，等於主機的 root'],
          ['`--cap-add SYS_ADMIN`', '一大類系統管理操作（例如掛載檔案系統），接近 --privileged'],
          ['`-v /:/host` 或掛載 /etc 等主機目錄', '容器裡的 root 可以改寫主機的檔案'],
          ['`--pid host`、`--network host`', '看得到主機的行程、直接使用主機的網路'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：容器本來就隔離了，裡面用 root 沒關係', text: '容器的隔離是同一個核心上的幾層限制，不是虛擬機那種獨立的核心（DKR01）。以 root 執行讓每一個其他的錯誤都變得更嚴重：多掛了一個主機目錄，root 就能改寫它；多給了 --privileged 或 docker.sock，就直接是主機的 root；容器執行環境出現逃逸漏洞時，root 往往是利用它的前提。非 root 執行不能取代其他設定，但能讓攻擊者在每一步都少一些籌碼。帳務組「讓服務自己更新」的需求，應該交給部署流程（CI 或編排工具），不是把 daemon 交給服務。' },
      ],
    },
    {
      id: 'dkr12-s-limits', title: '讓容器只能做它該做的事：USER、能力與唯讀',
      blocks: [
        { type: 'p', text: '第一步是讓 Image 本身以非 root 執行：在 Dockerfile 寫 `USER node`。官方的 node Image 已經建立了 UID 1000 的 node 使用者；其他基底可以用 `useradd`（Alpine 是 `adduser`）建立，或直接寫數字 `USER 10001`。COPY 進來的檔案預設屬於 root，node 只能讀、不能改——這正是我們要的：程式不能改寫自己。真的需要寫入的資料夾，再用 `COPY --chown` 或 `chown` 只交給那一個資料夾。`docker run -u node` 也能指定使用者，但它只影響那一次的執行，Image 本身仍是 root。' },
        { type: 'example', id: 'dkr12-limits' },
        { type: 'p', text: '三個限制各擋下一類動作。`-u node` 之後，在 root 擁有的 /app 建立檔案是 Permission denied。`--cap-drop ALL` 之後，就算還是 root，`chown` 也是 Operation not permitted：Linux 把 root 的特權拆成一個個能力，Docker 預設只給容器 14 個（CHOWN、DAC_OVERRIDE、FSETID、FOWNER、MKNOD、NET_RAW、SETGID、SETUID、SETFCAP、SETPCAP、NET_BIND_SERVICE、SYS_CHROOT、KILL、AUDIT_WRITE），一般的 Web 服務一個也用不到，所以先全部拿掉，真的需要再用 `--cap-add` 加回那一個（例如官方 nginx Image 的主行程要 CHOWN、SETUID、SETGID 才能切換到 nginx 使用者）。`--read-only` 讓容器的根目錄成為唯讀檔案系統，t1 卻立刻結束了：程式啟動時要在 /tmp 建立收據資料夾，得到 EROFS；t2 加上 `--tmpfs /tmp`，只有 /tmp 是可寫的記憶體檔案系統（容器停止就清空），服務正常執行，而在 /app 寫入仍然得到 Read-only file system。需要長久保存的資料則放在 Volume（DKR07）。' },
        { type: 'p', text: '關於連接埠：1.5.0 在容器裡監聽 8080，`-p 80:8080` 時主機的 80 由 Docker 負責，容器不需要任何能力。即使程式在容器裡綁定 1024 以下的埠，Docker 20.10 起預設網路的容器也把 `net.ipv4.ip_unprivileged_port_start` 設為 0，不需要 NET_BIND_SERVICE；只有 `--network host` 這類共用主機網路的情況才需要。習慣上仍讓非 root 的服務使用高埠，設定最單純。' },
        { type: 'p', text: '`--security-opt no-new-privileges` 讓容器裡的行程不能再透過 setuid 程式（例如 su、sudo）或檔案能力提升權限；模擬環境沒有 setuid 程式，只在 docker inspect 的 SecurityOpt 記錄它。Docker 預設的 seccomp 設定檔也會擋下一批危險的系統呼叫，不要用 `--security-opt seccomp=unconfined` 拿掉它。把這些組合起來，就是 1.5.0 的啟動方式：' },
        { type: 'list', items: [
          '`USER node`（寫在 Image 裡）與 node:22-slim 基底',
          '`--read-only --tmpfs /tmp`：只有暫存可寫',
          '`--cap-drop ALL`，需要時才 `--cap-add` 單一能力',
          '`--security-opt no-new-privileges`',
          '`-v ~/secrets/ledger_api_key:/run/secrets/ledger_api_key:ro`：金鑰在執行時以唯讀檔案提供',
          '沒有 `--privileged`、沒有 docker.sock、沒有其他主機目錄',
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：權限不夠就 chmod 777', text: '程式寫不進某個資料夾時，`RUN chmod -R 777 /app` 看起來一勞永逸，其實是雙重的退步：如果沒有同時加上 USER，程式照樣以 root 執行，777 什麼也沒改善；如果有 USER，777 讓任何使用者都能改寫程式碼。正確的做法是找出程式真正要寫的路徑，用 tmpfs 或 Volume 提供，或把那一個資料夾 chown 給執行的 UID。同樣地，看到 EROFS 就把 --read-only 拿掉也是錯的方向：加上那一個路徑的 tmpfs 就好。' },
      ],
    },
    {
      id: 'dkr12-s-scan', title: '最小基底與弱點掃描',
      blocks: [
        { type: 'p', text: '基底 Image 裡的每個套件都可能有已知的弱點。node:22 以 Debian 加上一整套建置工具（curl、git、ssh 用戶端、gcc、開發函式庫、ImageMagick）為基礎，方便在裡面編譯原生模組，卻讓執行用的 Image 背著幾百個用不到的套件；node:22-slim 只有精簡的 Debian 與 Node.js。DKR10 的最小基底（slim、alpine、distroless）在這裡的意義是：套件越少，要追蹤與修補的弱點越少，攻擊者手邊的工具也越少。弱點掃描工具讀出 Image 裡的套件清單，和弱點資料庫比對，列出每個已知弱點、嚴重度與是否已有修正版。安全組在案件資料夾裡放了兩份報告：' },
        { type: 'example', id: 'dkr12-scan' },
        { type: 'p', text: '完整基底有 2 個 CRITICAL、19 個 HIGH，列出的 8 列裡有 4 列在建置工具（ImageMagick、libde265、libpq-dev、gcc），其餘在版本控制工具與 Debian 本身；node:22-slim 只剩 2 個 HIGH，都在 Debian 的基本套件裡。換成 slim 一口氣消掉大部分的發現，但不是零：libssl3 已有修正版，做法是在基底 Image 更新之後重新建置（`docker build --pull` 會先拉取最新的基底）並重新部署，而不是在執行中的容器裡 `apt-get upgrade`——容器會被重新建立，而且唯讀的容器也改不了。perl-base 還沒有修正版，就要評估它在這個服務裡是否用得到、能否被觸發，記錄下來並持續追蹤。' },
        { type: 'p', text: '弱點掃描是一個流程，不是一次性的檢查：在 CI 建置之後、推送之前掃描，有修正版的 CRITICAL 與 HIGH 就讓建置失敗；Registry 裡已經上線的 Image 也要定期重新掃描，因為新的弱點每天都在公布，Image 不變也會冒出新的發現；每一項例外都要有理由與到期日。真實的掃描工具使用不同的弱點資料庫、比對方式與輸出格式，同一個 Image 的結果可能不同；本課的兩份報告是課程寫好的一般格式資料，編號是課程的代號（真實的報告列出 CVE 或 GHSA 編號），模擬環境不執行任何掃描工具。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '本課依 Docker CE 27.5.1 的 runtime profile 模擬。docker save、`--env-file`、`RUN --mount=type=secret` 與弱點掃描工具沒有模擬，只在課文說明；`no-new-privileges`、seccomp 與 AppArmor 的設定只記錄在 docker inspect，能力只模擬 CHOWN 與程式宣告需要的部分；user namespace 與 rootless Docker 不模擬。ledger-api:1.4 的歷史是在這台主機上以帳務組的 Dockerfile 建置所得，Image 的大小、套件數與報告的數字是課程資料。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [AUDIT],
    examples: [
      {
        id: 'dkr12-case', title: '案件資料：簡報、啟動指令與 Dockerfile', machine: 'dkr12-audit',
        description: '讀審查請求、帳務組的啟動指令稿與目前的 Dockerfile，再看主機上執行中的容器與 Image。',
        steps: [
          { command: 'cat brief.txt', output: "審查案件 SEC-2026-118：帳務組 ledger-api\n請求：1.5.0 上線前，審查 Image 的建置方式與容器的啟動方式。\n背景：npm.example.com 的稽核紀錄顯示，帳務組的 npm Token 在 11/20 被不明來源用來下載內部套件（Token 已撤銷）。\n帳務組的說法：Token 只在建置時用過，RUN 最後已經 rm .npmrc；.env 也在下一個 RUN 刪掉了。\n證物：執行中的容器 ledger（ledger-api:1.4）、run-ledger.sh、兩份弱點掃描報告。\n程式碼：~/ledger（server.js 已是 1.5.0：金鑰改從 /run/secrets/ledger_api_key 讀取；Dockerfile 還是舊的）。\n新的 API 金鑰：~/secrets/ledger_api_key（1.4 裡的那一把已撤銷）。" },
          { command: 'cat run-ledger.sh', output: "#!/bin/sh\n# 帳務組目前的啟動方式（ledger-api:1.4，2026-11-03 起）\n# --privileged 與 docker.sock：「讓服務可以自己更新」\ndocker run -d --name ledger --privileged \\\n  -v /run/docker.sock:/var/run/docker.sock \\\n  -p 8080:8080 ledger-api:1.4" },
          { command: 'cat ~/ledger/Dockerfile', output: "FROM node:22\nARG NPM_TOKEN\nENV LEDGER_API_KEY=demo-ledger-key-lesson-01\nWORKDIR /app\nCOPY . .\nRUN echo \"//npm.example.com/:_authToken=${NPM_TOKEN}\" > .npmrc && npm ci --omit=dev && rm .npmrc\nRUN rm -f .env\nEXPOSE 8080\nCMD [\"node\", \"server.js\"]" },
          { command: 'docker ps', output: "CONTAINER ID   IMAGE            COMMAND                  CREATED       STATUS       PORTS                                       NAMES\nc328710224e7   ledger-api:1.4   \"docker-entrypoint.s…\"   2 weeks ago   Up 2 weeks   0.0.0.0:8080->8080/tcp, :::8080->8080/tcp   ledger" },
          { command: 'docker images', output: "REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nnode         22        077277d05e1d   11 days ago   1.12GB\nnode         22-slim   c36327bb3ff8   11 days ago   226MB\nledger-api   1.4       59f52d1a4625   2 weeks ago   1.12GB" },
        ],
      },
      {
        id: 'dkr12-secrets', title: '從 Image 讀出機密：ENV、ARG 與被刪掉的 .env', machine: 'dkr12-audit',
        description: '機密不必進到容器裡也讀得到：Image 的設定、docker history 的每一列，以及看似已刪除的檔案所在的層。',
        steps: [
          { command: "docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' ledger-api:1.4", output: "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nNODE_VERSION=22.11.0\nYARN_VERSION=1.22.22\nLEDGER_API_KEY=demo-ledger-key-lesson-01\n" },
          { command: 'docker history ledger-api:1.4 | head -n 9', output: "IMAGE          CREATED       CREATED BY                                      SIZE      COMMENT\n59f52d1a4625   2 weeks ago   CMD [\"node\" \"server.js\"]                        0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago   EXPOSE map[8080/tcp:{}]                         0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago   RUN |1 NPM_TOKEN=demo-npm-token-lesson-4d1 /…   0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago   RUN |1 NPM_TOKEN=demo-npm-token-lesson-4d1 /…   920kB     buildkit.dockerfile.v0\n<missing>      2 weeks ago   COPY . . # buildkit                             561B      buildkit.dockerfile.v0\n<missing>      2 weeks ago   WORKDIR /app                                    0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago   ENV LEDGER_API_KEY=demo-ledger-key-lesson-01    0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago   ARG NPM_TOKEN                                   0B        buildkit.dockerfile.v0" },
          { command: "docker history --no-trunc --format '{{.CreatedBy}}' ledger-api:1.4 | grep 'rm -f .env'", output: "RUN |1 NPM_TOKEN=demo-npm-token-lesson-4d1 /bin/sh -c rm -f .env # buildkit" },
          { command: 'docker run --rm ledger-api:1.4 ls -a /app', output: ".\n..\nDockerfile\nnode_modules\npackage-lock.json\npackage.json\nserver.js" },
          { command: 'docker exec ledger env | grep KEY', output: "LEDGER_API_KEY=demo-ledger-key-lesson-01" },
        ],
      },
      {
        id: 'dkr12-inspect', title: '執行中的容器有多少權限', machine: 'dkr12-audit',
        description: '以 docker exec 與 docker inspect 讀出使用者、--privileged、能力、安全選項、唯讀與掛載，並確認容器裡的 root 能改寫程式、碰得到 Docker 的 socket。',
        steps: [
          { command: 'docker exec ledger id', output: "uid=0(root) gid=0(root) groups=0(root)" },
          { command: "docker inspect -f 'User=\"{{.Config.User}}\" Privileged={{.HostConfig.Privileged}} ReadonlyRootfs={{.HostConfig.ReadonlyRootfs}}' ledger", output: "User=\"\" Privileged=true ReadonlyRootfs=false" },
          { command: "docker inspect -f 'CapAdd={{json .HostConfig.CapAdd}} CapDrop={{json .HostConfig.CapDrop}} SecurityOpt={{json .HostConfig.SecurityOpt}}' ledger", output: "CapAdd=null CapDrop=null SecurityOpt=null" },
          { command: "docker inspect -f '{{json .Mounts}}' ledger", output: "[{\"Type\":\"bind\",\"Source\":\"/run/docker.sock\",\"Destination\":\"/var/run/docker.sock\",\"Mode\":\"\",\"RW\":true,\"Propagation\":\"rprivate\"}]" },
          { command: 'docker exec ledger ls -l /var/run/docker.sock', output: "-rw-rw---- root    988         0 /var/run/docker.sock" },
          { command: 'docker exec ledger touch /app/backdoor.js', output: "" },
          { command: 'echo $?', output: "0" },
        ],
      },
      {
        id: 'dkr12-limits', title: '一次加一個限制：非 root、能力、唯讀與 tmpfs', machine: 'dkr12-audit',
        description: '在測試容器上分別試 -u、--cap-drop、--read-only 與 --tmpfs，看每一項擋下什麼、又讓什麼失敗。',
        steps: [
          { command: 'docker run --rm -u node ledger-api:1.4 id', output: "uid=1000(node) gid=1000(node) groups=1000(node)" },
          { command: 'docker run --rm -u node ledger-api:1.4 touch /app/backdoor.js', output: "touch: cannot touch '/app/backdoor.js': Permission denied" },
          { command: 'docker run --rm --cap-drop ALL ledger-api:1.4 chown node /app/server.js', output: "chown: changing ownership of '/app/server.js': Operation not permitted" },
          { command: 'docker run -d --name t1 --read-only ledger-api:1.4', output: "342ffdcc3d8c8d5e45499e7edb7c4182b6b38ef23c455c44e269d7cc7789ab52" },
          { command: 'docker logs t1', output: "Error: EROFS: read-only file system, mkdir '/tmp/ledger-receipts'" },
          { command: 'docker run -d --name t2 --read-only --tmpfs /tmp ledger-api:1.4', output: "8542eb0e0b5ed1431c8a677f14ba16a1f22562a7db6a4c288307c971e5233b4c" },
          { command: 'docker exec t2 touch /app/backdoor.js', output: "touch: cannot touch '/app/backdoor.js': Read-only file system" },
          { command: "docker ps -a --format '{{.Names}} {{.Status}}'", output: "t2 Up Less than a second\nt1 Exited (1) Less than a second ago\nledger Up 2 weeks" },
        ],
      },
      {
        id: 'dkr12-scan', title: '弱點報告與基底的大小', machine: 'dkr12-audit',
        description: '比較兩份掃描報告的摘要與發現的位置，再對照兩個基底 Image 的大小。',
        steps: [
          { command: 'tail -n 3 scan-ledger-api-1.4.txt', output: "HIGH      perl-base            base: debian              no             LESSON-0044\n(11 more HIGH rows in build tools and scm tools)\nsummary: critical=2 high=19 medium=71 low=95; os packages=437, npm packages=3" },
          { command: "grep -c 'base: build tools' scan-ledger-api-1.4.txt", output: "4" },
          { command: 'cat scan-node-22-slim.txt', output: "# 弱點掃描報告（課程資料：一般格式，不是任何掃描工具的實際輸出）\n# target: node:22-slim (Debian 12)\n# scanned: 2026-11-23 13:05 UTC; IDs are lesson placeholders (real reports list CVE or GHSA IDs)\n# only CRITICAL and HIGH rows are listed\nSEVERITY  PACKAGE              FOUND IN                  FIX AVAILABLE  ID\nHIGH      libssl3              base: debian              yes            LESSON-0031\nHIGH      perl-base            base: debian              no             LESSON-0044\nsummary: critical=0 high=2 medium=9 low=18; os packages=92, npm packages=0" },
          { command: 'docker images node', output: "REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nnode         22        077277d05e1d   11 days ago   1.12GB\nnode         22-slim   c36327bb3ff8   11 days ago   226MB" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr12-token-layer', title: '找出留下 npm Token 的那一步', machine: 'dkr12-audit',
        statement: 'npm.example.com 的稽核紀錄顯示帳務組的 npm Token 外洩，帳務組堅持 Token 只在建置時用過，而且同一個 RUN 的最後已經 `rm .npmrc`。~/ledger/Dockerfile 只寫了 `ARG NPM_TOKEN`，Token 的值是 CI 用 `--build-arg` 傳進去的，所以讀 Dockerfile 看不到它。請從主機上的 ledger-api:1.4 找出證據：用 `docker history --no-trunc --format \'{{.CreatedBy}}\'` 讀這個 Image 的歷史，只印出「把 Token 寫進 .npmrc」的那一步（完整的一列，可以接 `| grep` 篩選）。',
        checks: [{ kind: 'output', fromCommand: '^docker (image )?history ' }],
        solution: ["docker history --no-trunc --format '{{.CreatedBy}}' ledger-api:1.4 | grep _authToken"],
        variants: [{ label: '另一次 CI 建置（另一個 Token）', files: [], docker: dockerOf('demo-npm-token-lesson-9b6') }],
        mistakes: [
          { commands: ['grep -n npmrc ~/ledger/Dockerfile'], why: 'Dockerfile 只有 ${NPM_TOKEN} 這個變數；Token 的值是建置時傳入的，只留在 Image 的歷史裡' },
          { commands: ['docker history ledger-api:1.4 | grep NPM_TOKEN'], why: '沒有 --no-trunc：CREATED BY 被截成 45 個字，而且 Token 出現在兩個 RUN 列，印出的不是題目要的那一列' },
          { commands: ["docker history --no-trunc --format '{{.CreatedBy}}' ledger-api:1.4 | grep NPM_TOKEN"], why: 'ARG 之後的每個 RUN 都帶著 |1 NPM_TOKEN=…，加上 ARG 那一列，一共印出三列；要篩出寫入 .npmrc 的那一步' },
          { commands: ["docker image inspect -f '{{.Config.Env}}' ledger-api:1.4"], why: 'Image 的 Env 裡是 ENV 寫入的 API 金鑰；ARG 不會留在 Image 的設定裡，而是留在使用它的 RUN 的歷史' },
        ],
        hints: [
          '`docker history --no-trunc --format \'{{.CreatedBy}}\' ledger-api:1.4` 由新到舊列出每一步的完整指令。',
          'BuildKit 把 RUN 當時的建置參數記在列的開頭：`RUN |1 NPM_TOKEN=… /bin/sh -c …`。',
          '寫入 .npmrc 的那一行有 `_authToken`，用 `| grep _authToken` 只留下那一列。',
        ],
        explanation: 'ARG 的值不會進入 Image 的設定，但 BuildKit 會把每個 RUN 執行時的建置參數記進那一步的歷史（`RUN |1 NPM_TOKEN=… /bin/sh -c …`），任何拉得到這個 Image 的人用 `docker history --no-trunc` 都讀得到；同一個 RUN 最後的 `rm .npmrc` 只讓檔案不留在層裡，擋不住歷史裡的值。讀 Dockerfile 只看到變數名稱；不加 --no-trunc 的表格會截斷；只用 NPM_TOKEN 篩會連 ARG 與 `rm -f .env` 那一步一起印出；`Config.Env` 裡是 ENV 的金鑰而不是 Token。這兩者都要撤銷並改用執行期或建置期的 secret。',
      },
      {
        id: 'dkr12-harden', title: '以非 root、唯讀與最少能力重新部署 ledger', machine: 'dkr12-audit',
        statement: '把 ledger 換成強化過的 1.5.0。(1) 改寫 ~/ledger/Dockerfile：基底用 node:22-slim；在 /app 先複製 package.json 與 package-lock.json 並執行 `npm ci --omit=dev`，再只複製 server.js；不放任何 ENV 或 ARG 的機密；以 `USER node` 執行；`EXPOSE 8080`；exec 形式的 `CMD ["node", "server.js"]`。另外寫一個 ~/ledger/.dockerignore 排除 .env、.git 與 node_modules。(2) 建置成 ledger-api:1.5（不能超過 300MB）。(3) 刪除舊的 ledger 容器，以同樣的名稱在背景執行 ledger-api:1.5：主機的 8080 對應容器的 8080；根檔案系統唯讀，但 /tmp 用 tmpfs；`--cap-drop ALL` 並加上 `--security-opt no-new-privileges`；不要 --privileged，也不要掛載 docker.sock；把 ~/secrets/ledger_api_key 以唯讀方式掛載成容器裡的 /run/secrets/ledger_api_key。完成後 `curl -s localhost:8080/version` 要回 1.5.0。可以用 `printf \'…\' > Dockerfile` 一次寫好整個檔案。',
        checks: [
          { kind: 'image', name: 'ledger-api:1.5', user: 'node', cmd: ['node', 'server.js'], maxSize: 300_000_000 },
          { kind: 'container', name: 'ledger', state: 'running', image: 'ledger-api:1.5', port: '8080:8080', user: 'node', readOnly: true, capDrop: ['ALL'], privileged: false, dockerSocket: false },
          { kind: 'http', url: 'http://localhost:8080/version', status: 200, body: '1.5.0' },
        ],
        solution: [...prepare(HARDENED), run15(HARD_FLAGS)],
        mistakes: [
          { commands: [...prepare(HARDENED), run15(`--read-only --cap-drop ALL --security-opt no-new-privileges ${SECRET_MOUNT}`)], why: '只加 --read-only 沒有 --tmpfs /tmp：程式啟動時要在 /tmp 建立資料夾，得到 EROFS 而結束' },
          { commands: [...prepare(CHMOD_777), run15(HARD_FLAGS)], why: '用 chmod -R 777 取代 USER：程式仍以 root 執行，還讓任何使用者都能改寫 /app' },
          { commands: [...prepare(HARDENED), run15(HARD_FLAGS.replace(` ${SECRET_MOUNT}`, ' -e LEDGER_API_KEY=demo-ledger-key-lesson-rotated'))], why: '用 -e 傳金鑰：1.5.0 從 /run/secrets/ledger_api_key 讀取，找不到檔案就結束；而且 -e 的值會出現在 docker inspect 裡' },
          { commands: [...prepare(FULL_BASE), run15(HARD_FLAGS)], why: '基底還是 node:22：Image 有 1.12GB，編譯器、git、ImageMagick 與它們的弱點都還在' },
          { commands: [...prepare(NO_USER), run15(`-u node ${HARD_FLAGS}`)], why: '只在 docker run 加 -u node：這次的容器不是 root，但 Image 本身沒有 USER，下一個忘了加 -u 的人又會以 root 執行' },
          { commands: [...prepare(HARDENED), run15(`--read-only --tmpfs /tmp --security-opt no-new-privileges ${SECRET_MOUNT}`)], why: '沒有 --cap-drop ALL：容器仍有 Docker 預設的 14 個能力' },
          { commands: [...prepare(HARDENED), run15(`--privileged -v /run/docker.sock:/var/run/docker.sock ${HARD_FLAGS}`)], why: '照抄舊的執行指令留下 --privileged 與 docker.sock：其他設定再嚴，容器仍能指揮 daemon、擁有主機的所有裝置，等於主機的 root' },
        ],
        hints: [
          '先 `cd ~/ledger`，用 `printf \'FROM node:22-slim\\nWORKDIR /app\\n…\' > Dockerfile` 寫好檔案，再 `docker build -q -t ledger-api:1.5 .`。',
          '舊的容器占著名稱與 8080：`docker rm -f ledger`。',
          '`docker run -d --name ledger --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -v ~/secrets/ledger_api_key:/run/secrets/ledger_api_key:ro -p 8080:8080 ledger-api:1.5`，再用 `docker inspect` 與 `curl` 確認。',
        ],
        explanation: '強化分成 Image 與執行兩部分。Image：node:22-slim 讓大小從 1.12GB 降到 227MB，也拿掉了建置工具與它們的弱點；先複製 package.json 與 lock 檔再 `npm ci --omit=dev`，最後只複製 server.js，加上 .dockerignore，.env 與 Dockerfile 都不會進 Image；`USER node` 寫進 Image 的設定，任何人執行它都不是 root。執行：`--read-only` 讓程式改不了自己，`--tmpfs /tmp` 給它唯一需要寫的地方；`--cap-drop ALL` 拿掉 Docker 預設的 14 個能力（這個服務一個也不需要），`no-new-privileges` 擋住再提升權限；金鑰以唯讀檔案掛到 /run/secrets/ledger_api_key，不在 Image 也不在 Config.Env。只加 --read-only 會讓程式在 /tmp 得到 EROFS；chmod 777 不改變以 root 執行的事實；-e 傳金鑰時 1.5.0 找不到檔案，而且值會出現在 docker inspect；基底留在 node:22 會超過大小限制；只靠 `-u` 而 Image 沒有 USER，下一次就又是 root；少了 `--cap-drop ALL` 就還留著預設的能力。檢查無法看出 --privileged，所以完成後再用 `docker inspect` 確認 Privileged 是 false、Mounts 裡沒有 docker.sock。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr12-q1', prompt: 'Dockerfile 先 `COPY . .`（把 .env 一起帶進去），下一個指令是 `RUN rm -f .env`。容器裡 `ls -a /app` 已經看不到 .env，這個 Image 安全了嗎？',
      options: ['安全：RUN rm 之後 Image 已經不含這個檔案，Image 也因此變小了', '不安全：.env 仍在 COPY 那一層，解開 Image 的層就讀得到它', '不安全，但只有能用 docker exec 進入執行中容器的人才讀得到它', '安全，只要再執行一次 `docker image prune` 清掉舊的層'],
      answer: 1,
      explanation: 'Image 的層只會往上疊，`rm` 只是在新的一層標記刪除、遮住下面的檔案，COPY 那一層原封不動，`docker save` 匯出後解開那一層的 tar 就能讀到 .env，Image 也不會變小。進入容器反而看不到它，因為上面的層遮住了；`docker image prune` 只刪除沒有標籤的 Image，不會改寫這個 Image 的層。',
    },
    {
      id: 'dkr12-q2', prompt: 'Dockerfile 寫 `ARG NPM_TOKEN`，CI 以 `--build-arg NPM_TOKEN=…` 建置，同一個 RUN 寫入 .npmrc、執行 `npm ci`、再 `rm .npmrc`。拿到這個 Image 的人在哪裡讀得到 Token？',
      options: ['哪裡都讀不到：.npmrc 在同一個 RUN 刪掉了，ARG 也不會進入 Image', '`docker image inspect` 的 Config.Env，和 ENV 寫入的變數放在一起', '只在 CI 主機的 Shell 歷史裡，Image 本身沒有留下任何紀錄', '`docker history --no-trunc` 裡那一個 RUN 的列'],
      answer: 3,
      explanation: 'BuildKit 把 RUN 執行時的建置參數記進那一步的歷史，所以 `docker history --no-trunc` 讀得到 Token。同一個 RUN 刪掉 .npmrc 只讓檔案不進層，擋不住歷史；ARG 不會進入 Config.Env，那裡只有 ENV 的值；CI 的紀錄也可能留著它，但 Image 本身就已經帶著它了。建置期的機密要用 BuildKit 的 secret 掛載。',
    },
    {
      id: 'dkr12-q3', prompt: 'ledger-api 1.5.0 需要一把 API 金鑰。下列哪一種提供方式最適合？',
      options: ['執行時把主機上權限受限的檔案以唯讀掛載進容器，程式從檔案讀取', '寫成 Dockerfile 的 `ENV`，再把 Image 推到只有公司內部能存取的私有 Registry', '用 `ARG` 宣告，建置時以 `--build-arg` 傳入，執行時由程式讀取這個變數', '寫進 .env 一起 COPY 進 Image，程式啟動讀完之後再把檔案刪掉'],
      answer: 0,
      explanation: '唯讀掛載的檔案只在執行時存在，不進 Image、不出現在 Config.Env，換金鑰也不必重新建置。ENV 會留在 Image 的設定，私有 Registry 只是縮小了讀得到的人，並沒有消除外洩；ARG 的值留在 RUN 的歷史，而且執行時根本沒有這個變數；COPY 進來的 .env 留在層裡，執行時刪除只改容器的可寫層。',
    },
    {
      id: 'dkr12-q4', prompt: '加上 `--read-only` 之後容器立刻結束，`docker logs` 是 `Error: EROFS: read-only file system, mkdir \'/tmp/ledger-receipts\'`。最恰當的修正是什麼？',
      options: ['拿掉 `--read-only`，因為這個程式顯然需要寫入檔案系統', '在 Dockerfile 加上 `RUN chmod -R 777 /tmp` 再重新建置', '加上 `--tmpfs /tmp`，只讓程式需要寫入的路徑可寫', '改回以 root 執行容器，root 不受唯讀檔案系統的限制'],
      answer: 2,
      explanation: '程式只需要寫 /tmp，加上 `--tmpfs /tmp` 讓那個路徑成為可寫的記憶體檔案系統，其他地方維持唯讀。拿掉 `--read-only` 等於放棄整項保護；唯讀是掛載層級的限制，chmod 改不了它（777 本身也是壞習慣）；root 一樣得到 Read-only file system，唯讀不看使用者。',
    },
    {
      id: 'dkr12-q5', prompt: '帳務組為了「讓服務可以自己更新」，把主機的 docker.sock 掛進容器。為什麼這很危險？',
      options: ['它會讓容器改用主機的網路堆疊，`-p` 公開連接埠的設定因此失效', '容器能透過 Docker API 指揮 daemon，例如啟動特權容器', '它只讓容器讀得到其他容器的日誌，風險只在於日誌裡的資訊外洩', '只有再加上 `--privileged` 時才危險，單獨掛載 socket 沒有問題'],
      answer: 1,
      explanation: 'docker.sock 是 Docker Engine API 的入口，而 dockerd 以 root 執行；能連上它，就能建立 `-v /:/host --privileged` 的容器，等於主機的 root。掛載 socket 和網路模式無關；它能做的遠不只讀日誌；它本身就足以接管主機，不需要 --privileged。自動更新應該交給部署流程。',
    },
    {
      id: 'dkr12-q6', prompt: '以 `USER node` 執行的服務在容器裡監聽 8080，啟動時用 `docker run --cap-drop ALL -p 80:8080 …`。需要用 `--cap-add NET_BIND_SERVICE` 加回能力嗎？',
      options: ['需要：主機的 80 是 1024 以下的特權埠，容器裡必須有 NET_BIND_SERVICE', '需要：拿掉全部能力之後，容器裡的程式不能接受任何網路連線', '不需要，但要改用 `--privileged`，Docker 才能替容器綁定主機的 80', '不需要：容器裡綁定的是 8080，主機的 80 由 Docker 負責'],
      answer: 3,
      explanation: '程式在容器裡綁定的是 8080 這個高埠，主機那一端的 80 由 Docker 處理，容器不需要任何能力。拿掉能力不影響一般的連線；改用 --privileged 是完全相反的方向。NET_BIND_SERVICE 只和容器裡綁定 1024 以下的埠有關，而且 Docker 20.10 起預設網路的容器連這種情況也不需要它（--network host 才需要）。',
    },
    {
      id: 'dkr12-q7', prompt: '`docker inspect -f \'{{.Config.User}}\' ledger` 印出空字串，`docker exec ledger id` 是 uid=0(root)。哪一個做法讓這個 Image 預設就以非 root 執行？',
      options: ['在 Dockerfile 加上 `USER node` 重新建置', '請每個部署的人在 `docker run` 時都記得加上 `-u node`', '在 Dockerfile 加上 `RUN chmod -R 777 /app`，讓所有使用者都能寫入', '執行時加上 `--security-opt no-new-privileges`'],
      answer: 0,
      explanation: 'USER 寫進 Image 的設定（Config.User），每個由它建立的容器預設都以那個使用者執行。`-u` 只影響那一次的執行，有人忘了加就又是 root；chmod 777 不改變執行的使用者，還讓任何人都能改寫程式；no-new-privileges 只阻止之後再提升權限，已經是 root 的行程仍是 root。',
    },
    {
      id: 'dkr12-q8', prompt: '三週前以 node:22-slim 建置的 Image，今天的掃描報告多了一列 HIGH：libssl3，Debian 基本套件，已有修正版。最恰當的處理是什麼？',
      options: ['服務沒有直接呼叫 OpenSSL，可以直接忽略這一列，不必記錄', '在每個執行中的容器裡執行 `apt-get upgrade`，不必重新建置', '拉取更新的 node:22-slim 重建、重新掃描後部署', '把基底改成 `node:latest`，以後就會一直拿到最新的套件'],
      answer: 2,
      explanation: '基底已有修正版，就以 `docker build --pull` 取得更新後的基底重新建置、掃描確認，再部署新的 Image；Image 不變也會出現新的弱點，所以要定期重新掃描。沒有評估與紀錄就忽略不是處理；在容器裡升級會在重建容器時消失，唯讀的容器也改不了；latest 會在不知不覺中換成新的大版本，部署無法重現（DKR11）。',
    },
  ],
};

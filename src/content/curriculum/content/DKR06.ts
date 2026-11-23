/*
 * DKR06 Image Layers and the Build Cache (DKR-2, terminal-sim). A terminal lesson on the images profile (engine stage E21):
 * layers (RUN, COPY, ADD and a WORKDIR that makes a folder each add one; ENV, ARG, LABEL, EXPOSE, USER, CMD, ENTRYPOINT only
 * change the config), docker history (newest first, <missing> rows, CREATED BY cut at 45, --no-trunc, --human=false,
 * --format) and RootFS.Layers, the build cache (the key is the parent's key plus the step's definition and the copied
 * files' checksums; CACHED, a miss that reruns every later step, --no-cache, apt-get update cached forever), instruction
 * order (the dependency manifest and its install before COPY . .; ARG and ENV values invalidate later RUN steps), image size
 * (cleanup in the same RUN, 126MB vs 145MB; pip --no-cache-dir; deleting in a later layer does not shrink; base images) and
 * .dockerignore (secrets, .git, the transfer, patterns from the context root, files that change by themselves busting the
 * cache). Machine: the Docker host harbor-07 (user mei in the docker group; python:3.12-slim with apt and pip tables,
 * python:3.12, python:3.12-alpine, node:20-slim with an npm table, a team image harbor/report-worker:3.2 with a declared
 * history; the projects tide, gauge, berth, ledger and lab). overlay2 and whiteouts are text only. The host, user, projects
 * and the team image are made up. Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalDocker, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const mine = (path: string, content: string) => file(path, content, 'mei');
const mineDir = (path: string) => dir(path, 'mei');

const PY_PATH = 'PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n';
const ALPINE = 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n';

const PY_HISTORY = (rootfs: number, python: number) => [
  { createdBy: '# debian.sh --arch \'amd64\' out/ \'bookworm\' \'@1731283200\'', size: rootfs },
  { createdBy: `ENV ${PY_PATH}` },
  { createdBy: 'ENV LANG=C.UTF-8' },
  { createdBy: 'RUN /bin/sh -c set -eux;  apt-get update;  apt-get install -y --no-install-recommends   ca-certificates  netbase  tzdata  ; rm -rf /var/lib/apt/lists/* # buildkit', size: 3_500_000 },
  { createdBy: 'ENV GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305' },
  { createdBy: 'ENV PYTHON_VERSION=3.12.7' },
  { createdBy: 'RUN /bin/sh -c set -eux;   savedAptMark="$(apt-mark showmanual)"; … # buildkit', size: python },
  { createdBy: 'RUN /bin/sh -c set -eux;  for src in idle3 pip3 pydoc3 python3 python3-config; do  dst="$(echo "$src" | tr -d 3)"; … # buildkit', size: 0, layer: true },
  { createdBy: 'CMD ["python3"]' },
];

interface Sizes { curl: number; libcurl: number; aptLists: number }
const BASE_SIZES: Sizes = { curl: 500_000, libcurl: 1_100_000, aptLists: 19_300_000 };
const slim = (s: Sizes): TerminalImage => ({
  name: 'python:3.12-slim', size: 74_800_000 + 3_500_000 + 46_200_000, created: '2026-11-12 03:00:00', cmd: ['python3'], pulled: true,
  env: [PY_PATH, 'LANG=C.UTF-8', 'GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305', 'PYTHON_VERSION=3.12.7'], osRelease: DEBIAN,
  history: PY_HISTORY(74_800_000, 46_200_000),
  packages: {
    apt: [
      { name: 'curl', version: '7.88.1-10+deb12u8', size: s.curl, depends: ['libcurl4'] },
      { name: 'libcurl4', version: '7.88.1-10+deb12u8', size: s.libcurl, files: [{ path: '/usr/lib/x86_64-linux-gnu/libcurl.so.4', content: '' }] },
    ],
    pip: [
      { name: 'flask', version: '3.0.3', size: 360_000, depends: ['werkzeug>=3.0.0', 'jinja2>=3.1.2', 'itsdangerous>=2.1.2', 'click>=8.1.3', 'blinker>=1.6.2'] },
      { name: 'werkzeug', version: '3.1.3', size: 900_000, depends: ['MarkupSafe>=2.1.1'] }, { name: 'jinja2', version: '3.1.4', size: 800_000, depends: ['MarkupSafe>=2.0'] },
      { name: 'MarkupSafe', version: '3.0.2', size: 50_000 }, { name: 'itsdangerous', version: '2.2.0', size: 60_000 }, { name: 'click', version: '8.1.7', size: 400_000 },
      { name: 'blinker', version: '1.9.0', size: 40_000 },
      { name: 'requests', version: '2.32.3', size: 250_000, depends: ['charset-normalizer>=2', 'idna>=2.5', 'urllib3>=1.21.1', 'certifi>=2017.4.17'] },
      { name: 'charset-normalizer', version: '3.4.0', size: 520_000 }, { name: 'idna', version: '3.10', size: 610_000 },
      { name: 'urllib3', version: '2.2.3', size: 880_000 }, { name: 'certifi', version: '2024.8.30', size: 310_000 },
      { name: 'gunicorn', version: '23.0.0', size: 450_000, depends: ['packaging'] }, { name: 'packaging', version: '24.2', size: 210_000 },
    ],
    aptLists: s.aptLists,
  },
});
const FULL: TerminalImage = { name: 'python:3.12', size: 1_018_700_000, created: '2026-11-12 03:00:00', cmd: ['python3'], pulled: true, layers: 7, env: [PY_PATH, 'LANG=C.UTF-8', 'PYTHON_VERSION=3.12.7'], osRelease: DEBIAN };
const ALPINE_PY: TerminalImage = { name: 'python:3.12-alpine', size: 51_400_000, created: '2026-11-12 03:00:00', cmd: ['python3'], pulled: true, layers: 5, env: [PY_PATH, 'LANG=C.UTF-8', 'PYTHON_VERSION=3.12.7'], osRelease: ALPINE };

const NODE: TerminalImage = {
  name: 'node:20-slim', size: 200_100_000, created: '2026-11-13 05:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'], pulled: true, layers: 4, osRelease: DEBIAN,
  env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_VERSION=20.18.1', 'YARN_VERSION=1.22.22'],
  files: [{ path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash\nnode:x:1000:1000::/home/node:/bin/bash\n' }, { path: '/etc/group', content: 'root:x:0:\nnode:x:1000:\n' }],
  packages: { npm: [
    { name: 'express', version: '4.21.1', size: 220_000, depends: ['body-parser', 'cookie'] }, { name: 'body-parser', version: '1.20.3', size: 60_000 }, { name: 'cookie', version: '0.7.1', size: 25_000 },
    { name: 'nodemon', version: '3.1.7', size: 1_900_000 },
  ] },
};

/** A team image built elsewhere: docker history tells which instruction made it heavy. */
const worker = (rows: { createdBy: string; size?: number; layer?: boolean }[]): TerminalImage => {
  const history = [...PY_HISTORY(74_800_000, 46_200_000), ...rows];
  return {
    name: 'harbor/report-worker:3.2', size: history.reduce((s, h) => s + (h.size ?? 0), 0), created: '2026-11-20 16:40:00', cmd: ['python', 'worker.py'], workdir: '/srv', pulled: true, registry: false,
    env: [PY_PATH, 'LANG=C.UTF-8', 'GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305', 'PYTHON_VERSION=3.12.7'], osRelease: DEBIAN, history,
  };
};
const WORKER_ROWS = [
  { createdBy: 'WORKDIR /srv', size: 0, layer: true },
  { createdBy: 'RUN /bin/sh -c apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/* # buildkit', size: 98_400_000 },
  { createdBy: 'COPY requirements.txt . # buildkit', size: 120 },
  { createdBy: 'RUN /bin/sh -c pip install --no-cache-dir -r requirements.txt # buildkit', size: 61_700_000 },
  { createdBy: 'COPY samples/ /srv/samples/ # buildkit', size: 412_000_000 },
  { createdBy: 'COPY . . # buildkit', size: 640_000 },
  { createdBy: 'CMD ["python" "worker.py"]' },
];

const TIDE_APP = "from flask import Flask\n\napp = Flask(__name__)\n\n@app.get('/')\ndef index():\n    return '今日滿潮 06:42、乾潮 12:58\\n'\n\nif __name__ == '__main__':\n    app.run(host='0.0.0.0', port=5000)\n";
const TIDE_SLOW = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY . .\nRUN pip install --no-cache-dir -r requirements.txt\nEXPOSE 5000\nCMD ["python", "app.py"]\n';
const GAUGE_PROBE = "import requests\n\nr = requests.get('http://tide:5000/', timeout=3)\nprint(r.status_code)\n";
const GAUGE_BIG = 'FROM python:3.12-slim\nRUN apt-get update\nRUN apt-get install -y curl\nRUN rm -rf /var/lib/apt/lists/*\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY probe.py .\nCMD ["python", "probe.py"]\n';
const SPLIT = 'FROM python:3.12-slim\nRUN apt-get update\nRUN apt-get install -y curl\nRUN rm -rf /var/lib/apt/lists/*\n';
const JOINED = 'FROM python:3.12-slim\nRUN apt-get update && \\\n    apt-get install -y curl && \\\n    rm -rf /var/lib/apt/lists/*\n';
const LEDGER_APP = "from flask import Flask\n\napp = Flask(__name__)\n\n@app.get('/')\ndef index():\n    return 'ledger ok\\n'\n";
const LEDGER_DOCKERFILE = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nCMD ["python", "app.py"]\n';
const LEDGER_LOG = '2026-11-23 09:12:04 INFO GET / 200\n2026-11-23 09:12:09 INFO GET /entries 200\n';

const BERTH_SERVER = "const express = require('express');\n\nconst app = express();\napp.get('/berths', (req, res) => res.json([{ id: 'A3', free: true }]));\napp.listen(3000);\n";
const BERTH_PACKAGE = '{\n  "name": "berth",\n  "version": "1.0.0",\n  "dependencies": { "express": "^4.21.1" },\n  "devDependencies": { "nodemon": "^3.1.7" }\n}\n';
const BERTH_LOCK = '{\n  "name": "berth",\n  "version": "1.0.0",\n  "lockfileVersion": 3,\n  "requires": true,\n  "packages": {}\n}\n';
const BERTH_SLOW = 'FROM node:20-slim\nWORKDIR /srv\nCOPY . .\nRUN npm ci --omit=dev\nEXPOSE 3000\nCMD ["node", "server.js"]\n';
const REV = 'FROM python:3.12-slim\nARG GIT_REV=dev\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nLABEL org.opencontainers.image.revision=$GIT_REV\n';
const REV_LATE = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nARG GIT_REV=dev\nLABEL org.opencontainers.image.revision=$GIT_REV\n';

const docker = (s: Sizes, rows = WORKER_ROWS): TerminalDocker => ({ images: [slim(s), FULL, ALPINE_PY, NODE, worker(rows)] });

const HARBOR: TerminalMachine = {
  id: 'dkr06-harbor', title: 'harbor-07（Docker 主機：tide、gauge、ledger 三個專案）', user: 'mei', host: 'harbor-07', cwd: '/home/mei/tide', profile: 'images',
  now: '2026-11-23 09:30:00', boot: '2026-11-23 06:00:00',
  files: [
    dir('/home'), dir('/home/mei', 'mei', 0o750),
    mineDir('/home/mei/tide'), mine('/home/mei/tide/app.py', TIDE_APP), mine('/home/mei/tide/requirements.txt', 'flask==3.0.3\n'), mine('/home/mei/tide/Dockerfile', TIDE_SLOW),
    mineDir('/home/mei/tide/.git'), mine('/home/mei/tide/.git/HEAD', 'ref: refs/heads/main\n'), mine('/home/mei/tide/.git/config', '[core]\n\trepositoryformatversion = 0\n\tbare = false\n'),
    mineDir('/home/mei/tide/__pycache__'), mine('/home/mei/tide/__pycache__/app.cpython-312.pyc', 'x'.repeat(980)), mine('/home/mei/tide/.env', 'TIDE_API_KEY=dev-only-key\n'),
    mineDir('/home/mei/gauge'), mine('/home/mei/gauge/probe.py', GAUGE_PROBE), mine('/home/mei/gauge/requirements.txt', 'requests==2.32.3\n'), mine('/home/mei/gauge/Dockerfile', GAUGE_BIG),
    mineDir('/home/mei/lab'), mine('/home/mei/lab/split.Dockerfile', SPLIT), mine('/home/mei/lab/joined.Dockerfile', JOINED),
    mine('/home/mei/lab/rev.Dockerfile', REV), mine('/home/mei/lab/rev-late.Dockerfile', REV_LATE), mine('/home/mei/lab/requirements.txt', 'flask==3.0.3\n'),
    mineDir('/home/mei/berth'), mine('/home/mei/berth/server.js', BERTH_SERVER), mine('/home/mei/berth/package.json', BERTH_PACKAGE), mine('/home/mei/berth/package-lock.json', BERTH_LOCK),
    mine('/home/mei/berth/Dockerfile', BERTH_SLOW),
    mineDir('/home/mei/ledger'), mine('/home/mei/ledger/app.py', LEDGER_APP), mine('/home/mei/ledger/requirements.txt', 'flask==3.0.3\n'), mine('/home/mei/ledger/Dockerfile', LEDGER_DOCKERFILE),
    mine('/home/mei/ledger/.dockerignore', '*.log\n.git\n'), mineDir('/home/mei/ledger/logs'), mine('/home/mei/ledger/logs/app.log', LEDGER_LOG),
    mineDir('/home/mei/ledger/.git'), mine('/home/mei/ledger/.git/HEAD', 'ref: refs/heads/main\n'),
  ],
  accounts: { groups: [{ name: 'sudo', members: ['mei'] }, { name: 'docker', gid: 988, members: ['mei'] }] },
  docker: docker(BASE_SIZES),
};


/** Writes a whole Dockerfile in one command (the way the exercises' solutions rewrite it). */
const rewrite = (text: string) => `printf '${text.replace(/\n/g, '\\n')}' > Dockerfile`;

// Exercise 1: berth (Node.js) installs after copying only its manifests.
const BERTH_FAST = 'FROM node:20-slim\nWORKDIR /srv\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]\n';
const BERTH_NO_MANIFEST = 'FROM node:20-slim\nWORKDIR /srv\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]\n';
const BERTH_NO_LOCK = 'FROM node:20-slim\nWORKDIR /srv\nCOPY package.json ./\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]\n';
const BERTH_BOTH_FIRST = 'FROM node:20-slim\nWORKDIR /srv\nCOPY package*.json ./\nCOPY . .\nRUN npm ci --omit=dev\nEXPOSE 3000\nCMD ["node", "server.js"]\n';

// Exercise 2: gauge in one apt RUN that cleans up, and pip without its cache.
const GAUGE_SLIM = 'FROM python:3.12-slim\nRUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY probe.py .\nCMD ["python", "probe.py"]\n';
const GAUGE_PIP_ONLY = GAUGE_BIG.replace('pip install -r', 'pip install --no-cache-dir -r');
const GAUGE_RM_APART = 'FROM python:3.12-slim\nRUN apt-get update && apt-get install -y curl\nRUN rm -rf /var/lib/apt/lists/*\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY probe.py .\nCMD ["python", "probe.py"]\n';
const GAUGE_APT_ONLY = GAUGE_SLIM.replace('pip install --no-cache-dir -r', 'pip install -r');
const SIZE = "docker images --format '{{.Size}}' gauge:slim";

// Exercise 3: other versions of the team's image, where another layer is the largest.
const WORKER_NO_SAMPLES = WORKER_ROWS.filter(r => !r.createdBy.startsWith('COPY samples/'));
const WORKER_HEAVY_PIP = [
  { createdBy: 'WORKDIR /srv', size: 0, layer: true },
  { createdBy: 'COPY requirements.txt . # buildkit', size: 160 },
  { createdBy: 'RUN /bin/sh -c pip install --no-cache-dir -r requirements.txt # buildkit', size: 287_000_000 },
  { createdBy: 'COPY samples/ /srv/samples/ # buildkit', size: 9_800_000 },
  { createdBy: 'COPY . . # buildkit', size: 655_000 },
  { createdBy: 'CMD ["python" "worker.py"]' },
];
const LARGEST = "docker history --no-trunc --human=false --format '{{.Size}} {{.CreatedBy}}' harbor/report-worker:3.2 | sort -n | tail -n 1 | cut -d ' ' -f 2-";

export const DKR06: LessonContent = {
  lessonId: 'DKR06',
  motivation: '上一課寫出了建置得起來的 Dockerfile；這一課讓它建置得快、體積小。同一份 Dockerfile 只換一下指令的順序，改一行程式碼之後的重新建置就能從重新安裝全部套件變成幾乎瞬間完成；同樣是裝一個 curl，寫成三個 RUN 的 Image 比寫成一個 RUN 的多了將近 20MB。這些差別都來自兩個機制：Image 是一層一層疊起來的，每個會寫入檔案的指令留下一層，而且下一層刪掉的東西仍然留在下面那一層；docker build 替每一步記下快取，只要這一步和它之前的每一步都沒有變，就直接取用上一次的結果（CACHED），一旦有一步變了，它之後的每一步都要重新執行。這一課在 Docker 主機 harbor-07 上，用 docker history 讀出每一層的來源與大小，觀察建置輸出裡的 CACHED 什麼時候出現、什麼時候消失，調整指令順序讓依賴套件的安裝命中快取，在同一個 RUN 裡清掉暫存檔把 Image 變小，並用 .dockerignore 把秘密、版本庫與會自己變動的檔案擋在建置內容之外。',
  sections: [
    {
      id: 'dkr06-s-layers', title: '每個指令一層',
      blocks: [
        { type: 'p', text: 'Image 不是一個大檔案，而是一疊唯讀的層（layer）加上一份設定（config）。FROM 帶進基底 Image 的全部的層；之後每個會寫入檔案的指令——RUN、COPY、ADD，以及建立了新資料夾的 WORKDIR——在上面再疊一層，這一層只記錄「這一步新增、改變或刪除了哪些檔案」。ENV、ARG、LABEL、EXPOSE、USER、CMD、ENTRYPOINT 只修改設定，不產生層，但會在 Image 的歷史裡留下一列 0B 的紀錄。啟動容器時，Docker 把這些層由下往上疊成一個完整的檔案系統，最上面再加上容器自己的可寫層（DKR03）。' },
        { type: 'table', head: ['指令', '建置時是一個步驟（[k/N]）嗎', '產生層嗎', 'docker history 的 SIZE'], rows: [
          ['FROM', '是，永遠是 [1/N]', '帶進基底 Image 的每一層', '基底各列原本的大小'],
          ['RUN', '是', '是：指令寫入或改變的檔案', '新增或改變的檔案的大小（刪除算 0）'],
          ['COPY、ADD', '是', '是：複製進來的檔案', '複製進來的位元組數'],
          ['WORKDIR', '是', '建立了新資料夾時是一層', '0B'],
          ['ENV、ARG、LABEL、EXPOSE、USER、CMD、ENTRYPOINT', '不是', '不產生層，只改設定', '0B'],
        ] },
        { type: 'p', text: '每一層以內容來識別：由這一層的變化算出一個 sha256（diff ID），`docker image inspect -f "{{.RootFS.Layers}}" Image` 依序列出它們，基底的層在最前面。因為以內容識別，兩個 Image 用同一個基底時，基底的層在主機上只存一份、只拉取一次——本課的 tide 和 gauge 都從 python:3.12-slim 開始，那 4 層是共用的。層建好之後就不再改變，後面的指令只能在上面「蓋」新的一層：真實的 Docker 用 overlay2 儲存驅動把每一層存成一個資料夾，以聯合掛載（union mount）疊成一個目錄樹；上層刪除檔案時，只是放一個 whiteout 標記把下層的檔案遮住，下層的內容一個位元組也沒有少。這就是本課後面「刪除不會讓 Image 變小」的原因。模擬環境只模擬 docker 指令看得到的結果，overlay2 的資料夾與 whiteout 檔案只在課文說明。' },
        { type: 'p', text: '下面在 harbor-07 的 ~/tide（一個 Flask 小網站）建置第一個版本，再看它的歷史與層數。建置輸出是 DKR05 學過的 BuildKit plain 格式，寫在標準錯誤：' },
        { type: 'example', id: 'dkr06-first-build' },
        { type: 'p', text: 'Dockerfile 有六個指令，建置輸出卻只有 [1/4] 到 [4/4]：FROM、WORKDIR、COPY、RUN 是步驟，EXPOSE 和 CMD 只寫進設定。`docker history` 由新到舊列出 14 列，最上面 5 列屬於這份 Dockerfile：CMD 與 EXPOSE 是 0B，`RUN pip install` 裝進 2.61MB 的 Flask 與它的相依套件，`COPY . .` 是 1.41kB 的原始碼，WORKDIR 是 0B；下面 9 列是 python:3.12-slim 自己的歷史，其中只有 4 列是層。所以 RootFS 從基底的 4 層變成 7 層：WORKDIR、COPY 與 RUN 各多了一層。' },
      ],
    },
    {
      id: 'dkr06-s-history', title: '讀懂 docker history',
      blocks: [
        { type: 'p', text: '`docker history Image` 是找出「Image 為什麼這麼大」的第一個工具。它由新到舊列出 Image 的每一筆歷史，包括基底 Image 的；每一列對應 Dockerfile 的一個指令（基底的部分則是基底那份 Dockerfile 的指令）。' },
        { type: 'table', head: ['欄位', '內容'], rows: [
          ['IMAGE', '只有最上面一列是 Image 本身的 ID，其他都是 `<missing>`'],
          ['CREATED', '這一列是多久以前建置的；命中快取的步驟保留當初建置的時間'],
          ['CREATED BY', 'BuildKit 記下的指令：`RUN /bin/sh -c pip install … # buildkit`、`COPY . . # buildkit`、`EXPOSE map[5000/tcp:{}]`、`CMD ["python" "app.py"]`；超過 45 個字就截斷，以 … 結尾'],
          ['SIZE', '這一層的大小（Go 的十進位單位，三位有效數字）；只改設定的列是 0B'],
          ['COMMENT', '`buildkit.dockerfile.v0`：由 BuildKit 依 Dockerfile 建置'],
        ] },
        { type: 'p', text: '`<missing>` 常讓人以為 Image 壞了，其實那些層都在，只是沒有自己的 Image ID。舊的建置器會替每一步留下一個中間 Image，在本機建置的那幾列因此有 ID；BuildKit 不產生中間 Image，從 Registry 拉取的 Image 也只帶著最終的那一個 ID，其他列就沒有 ID 可以顯示。要確認層確實存在，看 `docker image inspect -f "{{.RootFS.Layers}}"` 列出的 diff ID。' },
        { type: 'table', head: ['寫法', '用途'], rows: [
          ['`docker history --no-trunc 名稱`', 'CREATED BY 印出完整的指令，IMAGE 印出完整的 sha256 ID'],
          ['`docker history --human=false 名稱`', 'SIZE 印成位元組數，CREATED 印成 RFC 3339 的時間'],
          ['`docker history -q 名稱`', '只印 IMAGE 欄（第一列的 ID 與一串 `<missing>`）'],
          ['`docker history --format "{{.Size}}\\t{{.CreatedBy}}" 名稱`', '只印需要的欄位；可用 `.ID`、`.CreatedSince`、`.CreatedAt`、`.CreatedBy`、`.Size`、`.Comment`'],
        ] },
        { type: 'p', text: '要找出最大的一層，用位元組數排序：`docker history --no-trunc --human=false --format "{{.Size}} {{.CreatedBy}}" 名稱 | sort -n | tail -n 1`。兩個選項都不能少。`sort -n` 只讀每行開頭的數字，`640kB` 的 640 會排在 `412MB` 的 412 後面，所以人看的單位不能拿來排序；改用 `--human=false` 之後，沒有 `-n` 的 `sort` 又是逐字比較，`98400000` 會排在 `412000000` 後面（9 大於 4）。`--no-trunc` 則讓最後印出的指令是完整的，才知道到底是哪一行 Dockerfile。' },
        { type: 'callout', tone: 'tip', title: '大的層通常是這三種', text: '一個 Image 突然變胖，九成是下面三種之一：RUN 安裝了大量套件或編譯工具、還留下了套件管理器的快取；COPY 把不該進 Image 的東西帶了進去（測試資料、模型檔、.git、node_modules）；或是基底 Image 本身就很大。docker history 的 SIZE 欄直接告訴你是哪一種，再回頭改那一行 Dockerfile。' },
      ],
    },
    {
      id: 'dkr06-s-cache', title: '建置快取：CACHED 與失效',
      blocks: [
        { type: 'p', text: 'docker build 每完成一步，就把結果（這一步之後的檔案系統與層）記在 daemon 的建置快取裡，用一把「快取鍵」找回來。每一步的鍵由兩部分組成：前一步的鍵，加上這一步自己的定義；FROM 的鍵是基底 Image 的 ID。下一次建置時，同樣的鍵在快取裡找得到，這一步就印 `CACHED` 直接取用，連指令都不執行；找不到才真正執行，並把新的結果記下來。' },
        { type: 'table', head: ['步驟', '鍵裡有什麼（任何一項改變就失效）', '鍵裡沒有的'], rows: [
          ['RUN', '指令的原文、當時的環境變數（ENV 與已宣告的 ARG 的值）、WORKDIR 與 USER', '指令執行的「結果」會不會不同，例如套件庫有了新版'],
          ['COPY、ADD', '每個複製的檔案的內容 checksum、權限、目的地與旗標（`--chown` 等）', '檔案的修改時間'],
          ['WORKDIR', '路徑', '—'],
        ] },
        { type: 'p', text: '因為每一步的鍵都包含前一步的鍵，快取是一條鏈：某一步失效之後，它的鍵變了，後面每一步的鍵也跟著變，全部重新執行——即使後面那些指令本身一個字都沒改。這就是快取命中與失效的全部規則。下面在 ~/tide 原本的 Dockerfile（先 `COPY . .` 再 `pip install`）上觀察：`2>&1` 把建置輸出接到管線，`grep -A 1 -E \'^#[0-9]+ \\[[0-9]\'` 只留下每個步驟的標題和它的下一行——下一行是 `CACHED` 就是命中快取，否則就是重新執行了。' },
        { type: 'example', id: 'dkr06-cache-miss' },
        { type: 'p', text: '什麼都沒改時，每一步都是 CACHED，建置出來的是同一個 Image ID，不會多出新的 Image。在 app.py 加了一行之後，`COPY . .` 複製的檔案 checksum 變了，這一步重新執行（`DONE`）；`RUN pip install` 的指令和 requirements.txt 都沒變，卻因為它的前一步變了而跟著重新安裝。`--no-cache` 讓 BuildKit 不查快取、每一步都重新執行（`grep -c CACHED` 數到 0 行），執行結果仍會記進快取。另外要知道：建置失敗時，已經成功的步驟仍留在快取裡，修好錯誤再建置時，前面那些步驟會直接 CACHED。' },
        { type: 'callout', tone: 'warning', title: 'RUN apt-get update 的快取不會自己過期', text: '常見的誤會是「套件庫有新版時，Docker 會發現而重新執行」。快取鍵只看指令的文字，不看外面的世界：單獨一行 `RUN apt-get update` 一旦被快取，之後幾個月的建置都沿用當時下載的套件清單；下一行 `RUN apt-get install -y 新套件` 改了文字而重新執行時，用的仍是舊清單，可能裝到舊版本，甚至因為舊清單指向已經不存在的檔案而下載失敗。所以 update 和 install 一定寫在同一個 RUN；想確定拿到最新的安全更新時，用 `docker build --no-cache` 重新建置。' },
      ],
    },
    {
      id: 'dkr06-s-order', title: '指令順序：不常變的放前面',
      blocks: [
        { type: 'p', text: '既然一步失效會連帶後面全部，Dockerfile 的原則就是：越少改變的越往前放，越常改變的越往後放。應用程式通常是「依賴清單很少變、原始碼天天變」，所以先只複製依賴清單、安裝套件，最後才 `COPY . .` 複製原始碼。這樣改程式時只有最後一步重新執行，耗時的安裝維持 CACHED；只有依賴清單真的改了，安裝才重新執行。' },
        { type: 'table', head: ['語言', '先複製', '再安裝', '最後'], rows: [
          ['Python（pip）', '`COPY requirements.txt .`', '`RUN pip install --no-cache-dir -r requirements.txt`', '`COPY . .`'],
          ['Node.js（npm）', '`COPY package.json package-lock.json ./`', '`RUN npm ci --omit=dev`', '`COPY . .`'],
          ['Go', '`COPY go.mod go.sum ./`', '`RUN go mod download`', '`COPY . .`'],
        ] },
        { type: 'example', id: 'dkr06-order' },
        { type: 'p', text: '換成新的順序之後，改 app.py 只讓 [5/5] `COPY . .` 重新執行，[4/5] 的 pip install 維持 CACHED；在 requirements.txt 加上 gunicorn，才讓 [3/5] 複製依賴清單失效，連帶安裝與後面的 `COPY . .` 重新執行——這正是我們想要的：依賴真的變了才重新安裝。' },
        { type: 'p', text: 'ARG 與 ENV 也會讓快取失效。ARG 一宣告，它的值就成為之後每個 RUN 的環境變數，所以值一變，宣告之後的 RUN 全部失效，即使那個 RUN 根本沒用到它；ENV 也一樣，值改了，之後的 RUN 都重新執行。rev.Dockerfile 在第二行宣告每次建置都不同的 GIT_REV，換了版本號，pip install 就重新安裝；rev-late.Dockerfile 把 ARG 移到安裝之後，只有最後的 LABEL 用到它，安裝維持 CACHED，Image 的標籤仍然是新的版本號。在 BuildKit 裡，ENV、ARG 的值不影響 COPY 的鍵，所以範例裡 `COPY requirements.txt .` 兩次都是 CACHED。' },
        { type: 'callout', tone: 'warning', title: '把 COPY . . 寫在安裝之前', text: '「先把整個專案複製進去，再安裝依賴」最直覺，也最常見。這樣寫建置結果完全正確，只是每改一個字都要重新安裝全部套件，CI 上每次建置多等好幾分鐘。另一個相關的錯誤是只複製 package.json 就執行 `npm ci`：`npm ci` 依 package-lock.json 安裝，少了它就直接失敗；用 `COPY package*.json ./` 或把兩個檔名都寫出來。' },
      ],
    },
    {
      id: 'dkr06-s-size', title: 'Image 大小：找出變胖的那一層',
      blocks: [
        { type: 'p', text: 'Image 的大小是每一層大小的總和。因為層只能往上疊，後面的層刪掉檔案只是把它遮住，前面那一層的內容一點都沒有少：在第一個 RUN 下載了 20MB 的暫存檔，第二個 RUN 再刪除，Image 仍然多了 20MB，還多了一個 0B 的層。所以清理一定要寫在產生垃圾的同一個 RUN 裡，用 `&&` 串起來，讓暫存檔在這一層結束之前就消失。下面的 split 與 joined 兩個 Dockerfile 都安裝 curl，也都刪除 apt 的套件清單：' },
        { type: 'example', id: 'dkr06-size' },
        { type: 'p', text: 'split 版本 145MB，joined 版本 126MB。split 的 history 說明了原因：`apt-get update` 那一層有 19.3MB（下載到 /var/lib/apt/lists/ 的套件清單），`rm -rf` 那一層是 0B，清單仍躺在下面那一層。joined 把三件事寫成一個 RUN，清單在這一層結束前就刪掉了，這一層只剩 curl 與 libcurl4 的 1.6MB。也注意 CREATED BY 裡的 `&&     apt-get`：行尾的 `\\` 續行讓反斜線與換行直接被拿掉，下一行的縮排就留在指令裡。' },
        { type: 'table', head: ['做法', '為什麼有效'], rows: [
          ['`RUN apt-get update && apt-get install -y … && rm -rf /var/lib/apt/lists/*`', '套件清單只在這一層執行的過程中存在，不會留在任何一層'],
          ['`apt-get install -y --no-install-recommends …`', '只裝相依套件，不裝「推薦」的額外套件'],
          ['`pip install --no-cache-dir …`', 'pip 預設把下載的套件留在 ~/.cache/pip，Image 裡永遠用不到；本課的 gauge 只因為這個選項就差了將近 0.9MB'],
          ['`.dockerignore` 排除不需要的檔案（下一節）', '`COPY . .` 不會把 .git、測試資料、node_modules 複製進來'],
          ['選擇合適的基底 Image', '基底的層占了 Image 的大部分，換基底的效果通常最大'],
        ] },
        { type: 'p', text: '基底 Image 的選擇影響最大。`docker images python` 在 harbor-07 上列出同一個 Python 版本的三種基底：python:3.12 是完整的 Debian，含有編譯器與大量開發套件，約 1.02GB，適合需要在建置時編譯擴充模組的情況；python:3.12-slim 只留執行 Python 需要的部分，約 125MB，是大多數服務的預設選擇；python:3.12-alpine 以 Alpine Linux 為底，約 51.4MB，但它的 C 函式庫是 musl 而不是 glibc、套件管理器是 apk 而不是 apt，有些 Python 套件沒有預先為 musl 編譯好的版本，安裝時得先裝編譯工具自己編譯，結果可能反而更慢、更大。這些是模擬主機上的數字，真實的大小隨版本與平台而異，但三者的差距大致如此。' },
        { type: 'callout', tone: 'warning', title: '後面的 RUN rm 不會讓 Image 變小', text: '`RUN rm -rf /var/lib/apt/lists/*`、`RUN pip cache purge`、`RUN rm -rf /tmp/build` 單獨寫成一行，看起來清理了，實際上只是多了一個遮住檔案的 0B 層，檔案仍在前面的層裡，Image 一樣大，推送與拉取時也照樣傳送。判斷方法很簡單：`docker history` 裡那一行的 SIZE 是 0B，而前面某一層仍然很大。正確的做法是把清理和產生檔案的指令寫在同一個 RUN。同理，COPY 進去的大檔案也不能靠之後的 RUN rm 消除，要在 .dockerignore 裡就把它排除。' },
      ],
    },
    {
      id: 'dkr06-s-ignore', title: '.dockerignore：建置內容與快取',
      blocks: [
        { type: 'p', text: '`docker build .` 的那個點是建置內容（build context）：docker 把這個資料夾裡的檔案傳給 BuildKit，COPY 與 ADD 只能從這裡取檔案。資料夾根目錄的 `.dockerignore` 列出不要傳送的檔案，被排除的檔案有三個效果：傳送的內容變少（輸出裡的 `transferring context` 變小）；`COPY . .` 不會把它們放進 Image，像 .env 這種含有密碼或 API Key 的檔案就不會跟著 Image 被推到 Registry；它們的變化也不再影響 `COPY . .` 的 checksum，不會讓快取失效。' },
        { type: 'example', id: 'dkr06-ignore' },
        { type: 'p', text: '加上 .dockerignore 之前，tide 的 Image 裡有 .env（裡面是 API Key）、整個 .git 與 Python 的位元組碼快取 __pycache__；任何人只要拉取這個 Image，就能讀到 .env。加上之後，建置內容從 1.413kB 變成 358B，Image 裡只剩執行需要的檔案（.dockerignore 本身也會被複製；要的話可以把它也列進去）。' },
        { type: 'table', head: ['.dockerignore 的一行', '排除什麼'], rows: [
          ['`.git`', '建置內容根目錄的 .git 資料夾與它裡面的一切'],
          ['`*.log`', '只有根目錄的 .log 檔：`*` 不跨過 `/`，`logs/app.log` 不符合'],
          ['`**/*.log`', '任何一層資料夾裡的 .log 檔'],
          ['`logs/`', '根目錄的 logs 資料夾（結尾的 `/` 可寫可不寫）'],
          ['`node_modules` 與 `**/node_modules`', '前者只有根目錄的那一個，後者是每一層的'],
          ['`!README.md`', '把前面排除的檔案重新納入；同一個路徑以最後一個符合的樣式為準'],
        ] },
        { type: 'p', text: '樣式一律從建置內容的根目錄算起，這是最容易出錯的地方：`*.log` 看起來會排除所有日誌，其實只排除根目錄的。漏掉的檔案如果會自己變動——開發伺服器一直寫的日誌、測試產生的覆蓋率報告、本機的 SQLite 資料庫——每次建置 `COPY . .` 的 checksum 都不同，這一步與之後的每一步永遠不會 CACHED，每次都得到新的 Image ID 和一個要推送的新層，即使根本沒有人改程式。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '本課的 docker build 依 Docker CE 27.5.1 預設的 BuildKit 模擬，輸出一律是 plain 格式，秒數由步驟與輸出的行數算出，不是真實的耗時，時鐘也不前進（所以範例的 CREATED 都是 Less than a second ago）。真實的 BuildKit 第二次建置只傳送改變的檔案，模擬環境每次報告建置內容的總大小。多階段建置（`COPY --from`）在 DKR10，VOLUME 在 DKR07；`docker builder prune` 與 RUN 期間的網路不模擬，apt、pip、npm 只從課程宣告的套件表安裝。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [HARBOR],
    examples: [
      {
        id: 'dkr06-first-build', title: '第一次建置：步驟、歷史與層', machine: 'dkr06-harbor',
        description: '建置 tide:1.0，對照 Dockerfile、建置步驟、docker history 的每一列與 RootFS 的層數。',
        steps: [
          { command: "cat Dockerfile", output: "FROM python:3.12-slim\nWORKDIR /app\nCOPY . .\nRUN pip install --no-cache-dir -r requirements.txt\nEXPOSE 5000\nCMD [\"python\", \"app.py\"]" },
          { command: "docker build -t tide:1.0 .", output: "#0 building with \"default\" instance using docker driver\n\n#1 [internal] load build definition from Dockerfile\n#1 transferring dockerfile: 132B done\n#1 DONE 0.0s\n\n#2 [internal] load metadata for docker.io/library/python:3.12-slim\n#2 DONE 0.5s\n\n#3 [internal] load .dockerignore\n#3 transferring context: 2B done\n#3 DONE 0.0s\n\n#4 [1/4] FROM docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5\n#4 resolve docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5 done\n#4 DONE 0.0s\n\n#5 [internal] load build context\n#5 transferring context: 1.413kB done\n#5 DONE 0.0s\n\n#6 [2/4] WORKDIR /app\n#6 DONE 0.0s\n\n#7 [3/4] COPY . .\n#7 DONE 0.0s\n\n#8 [4/4] RUN pip install --no-cache-dir -r requirements.txt\n#8 0.380 Collecting flask==3.0.3 (from -r requirements.txt (line 1))\n#8 0.660 Collecting werkzeug>=3.0.0 (from flask==3.0.3)\n#8 0.940 Collecting MarkupSafe>=2.1.1 (from werkzeug==3.1.3)\n#8 1.220 Collecting jinja2>=3.1.2 (from flask==3.0.3)\n#8 1.500 Collecting itsdangerous>=2.1.2 (from flask==3.0.3)\n#8 1.780 Collecting click>=8.1.3 (from flask==3.0.3)\n#8 2.060 Collecting blinker>=1.6.2 (from flask==3.0.3)\n#8 2.340 Installing collected packages: MarkupSafe, werkzeug, jinja2, itsdangerous, click, blinker, flask\n#8 2.620 Successfully installed blinker-1.9.0 click-8.1.7 flask-3.0.3 itsdangerous-2.2.0 jinja2-3.1.4 MarkupSafe-3.0.2 werkzeug-3.1.3\n#8 DONE 3.0s\n\n#9 exporting to image\n#9 exporting layers 0.3s done\n#9 writing image sha256:606380ad862de9d644a32cf57be5e288a4bc7a817cb24a91a07ef0f04ae9045a done\n#9 naming to docker.io/library/tide:1.0 done\n#9 DONE 0.3s" },
          { command: "docker history tide:1.0", output: "IMAGE          CREATED                  CREATED BY                                      SIZE      COMMENT\n606380ad862d   Less than a second ago   CMD [\"python\" \"app.py\"]                         0B        buildkit.dockerfile.v0\n<missing>      Less than a second ago   EXPOSE map[5000/tcp:{}]                         0B        buildkit.dockerfile.v0\n<missing>      Less than a second ago   RUN /bin/sh -c pip install --no-cache-dir -r…   2.61MB    buildkit.dockerfile.v0\n<missing>      Less than a second ago   COPY . . # buildkit                             1.41kB    buildkit.dockerfile.v0\n<missing>      Less than a second ago   WORKDIR /app                                    0B        buildkit.dockerfile.v0\n<missing>      11 days ago              CMD [\"python3\"]                                 0B        buildkit.dockerfile.v0\n<missing>      11 days ago              RUN /bin/sh -c set -eux;  for src in idle3 p…   0B        buildkit.dockerfile.v0\n<missing>      11 days ago              RUN /bin/sh -c set -eux;   savedAptMark=\"$(a…   46.2MB    buildkit.dockerfile.v0\n<missing>      11 days ago              ENV PYTHON_VERSION=3.12.7                       0B        buildkit.dockerfile.v0\n<missing>      11 days ago              ENV GPG_KEY=7169605F62C751356D054A26A821E680…   0B        buildkit.dockerfile.v0\n<missing>      11 days ago              RUN /bin/sh -c set -eux;  apt-get update;  a…   3.5MB     buildkit.dockerfile.v0\n<missing>      11 days ago              ENV LANG=C.UTF-8                                0B        buildkit.dockerfile.v0\n<missing>      11 days ago              ENV PATH=/usr/local/bin:/usr/local/sbin:/usr…   0B        buildkit.dockerfile.v0\n<missing>      11 days ago              # debian.sh --arch 'amd64' out/ 'bookworm' '…   74.8MB    buildkit.dockerfile.v0" },
          { command: "docker image inspect -f '{{.RootFS.Layers}}' python:3.12-slim | wc -w", output: "4" },
          { command: "docker image inspect -f '{{.RootFS.Layers}}' tide:1.0 | wc -w", output: "7" },
        ],
      },
      {
        id: 'dkr06-cache-miss', title: '快取命中與失效', machine: 'dkr06-harbor',
        description: '原本的順序：不改東西全部 CACHED；改了 app.py，COPY . . 與之後的 pip install 都重新執行；--no-cache 不用快取。',
        steps: [
          { command: "docker build -q -t tide:1.0 .", output: "sha256:606380ad862de9d644a32cf57be5e288a4bc7a817cb24a91a07ef0f04ae9045a" },
          { command: "docker build -t tide:1.0 . 2>&1 | grep -A 1 -E '^#[0-9]+ \\[[0-9]'", output: "#4 [1/4] FROM docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5\n#4 resolve docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5 done\n--\n#6 [2/4] WORKDIR /app\n#6 CACHED\n--\n#7 [3/4] COPY . .\n#7 CACHED\n--\n#8 [4/4] RUN pip install --no-cache-dir -r requirements.txt\n#8 CACHED" },
          { command: "echo '# 潮汐站：基隆' >> app.py", output: "" },
          { command: "docker build -t tide:1.1 . 2>&1 | grep -A 1 -E '^#[0-9]+ \\[[0-9]'", output: "#4 [1/4] FROM docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5\n#4 resolve docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5 done\n--\n#6 [2/4] WORKDIR /app\n#6 CACHED\n--\n#7 [3/4] COPY . .\n#7 DONE 0.0s\n--\n#8 [4/4] RUN pip install --no-cache-dir -r requirements.txt\n#8 0.380 Collecting flask==3.0.3 (from -r requirements.txt (line 1))" },
          { command: "docker images tide", output: "REPOSITORY   TAG       IMAGE ID       CREATED                  SIZE\ntide         1.0       606380ad862d   Less than a second ago   127MB\ntide         1.1       ed306fd293a7   Less than a second ago   127MB" },
          { command: "docker build --no-cache -t tide:1.1 . 2>&1 | grep -c CACHED", output: "0" },
        ],
      },
      {
        id: 'dkr06-order', title: '先安裝依賴，再複製原始碼', machine: 'dkr06-harbor',
        description: '調整指令順序後，改程式只重新複製原始碼、改依賴才重新安裝；宣告在前面的 ARG 讓安裝失效，移到後面就不會。',
        steps: [
          { command: "printf 'FROM python:3.12-slim\\nWORKDIR /app\\nCOPY requirements.txt .\\nRUN pip install --no-cache-dir -r requirements.txt\\nCOPY . .\\nEXPOSE 5000\\nCMD [\"python\", \"app.py\"]\\n' > Dockerfile", output: "" },
          { command: "docker build -q -t tide:2.0 .", output: "sha256:90613057f93c8a7fafafacc4ed6a7a1fc433426745cf4edd896fee316206a25c" },
          { command: "echo '# 潮汐站：基隆' >> app.py", output: "" },
          { command: "docker build -t tide:2.1 . 2>&1 | grep -A 1 -E '^#[0-9]+ \\[[0-9]'", output: "#4 [1/5] FROM docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5\n#4 resolve docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5 done\n--\n#6 [2/5] WORKDIR /app\n#6 CACHED\n--\n#7 [3/5] COPY requirements.txt .\n#7 CACHED\n--\n#8 [4/5] RUN pip install --no-cache-dir -r requirements.txt\n#8 CACHED\n--\n#9 [5/5] COPY . .\n#9 DONE 0.0s" },
          { command: "echo 'gunicorn==23.0.0' >> requirements.txt", output: "" },
          { command: "docker build -t tide:2.2 . 2>&1 | grep -A 1 -E '^#[0-9]+ \\[[0-9]'", output: "#4 [1/5] FROM docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5\n#4 resolve docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5 done\n--\n#6 [2/5] WORKDIR /app\n#6 CACHED\n--\n#7 [3/5] COPY requirements.txt .\n#7 DONE 0.0s\n--\n#8 [4/5] RUN pip install --no-cache-dir -r requirements.txt\n#8 0.400 Collecting flask==3.0.3 (from -r requirements.txt (line 1))\n--\n#9 [5/5] COPY . .\n#9 DONE 0.0s" },
          { command: "cd ../lab", output: "" },
          { command: "cat rev.Dockerfile", output: "FROM python:3.12-slim\nARG GIT_REV=dev\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nLABEL org.opencontainers.image.revision=$GIT_REV" },
          { command: "docker build -q -f rev.Dockerfile --build-arg GIT_REV=4f1c2ab -t rev .", output: "sha256:77e774f4c6e1ca6f6a4b4d4be7b1e37fd3becf58c35fc27200a0cea84d5a37d1" },
          { command: "docker build -f rev.Dockerfile --build-arg GIT_REV=9d03e7c -t rev . 2>&1 | grep -A 1 -E '^#[0-9]+ \\[[0-9]' | tail -n 5", output: "#7 [3/4] COPY requirements.txt .\n#7 CACHED\n--\n#8 [4/4] RUN pip install --no-cache-dir -r requirements.txt\n#8 0.380 Collecting flask==3.0.3 (from -r requirements.txt (line 1))" },
          { command: "docker build -q -f rev-late.Dockerfile --build-arg GIT_REV=4f1c2ab -t rev .", output: "sha256:bf3f1a79def7b92db87221166a5f6d20060e56d201dd7c50cd30ca6e0585870a" },
          { command: "docker build -f rev-late.Dockerfile --build-arg GIT_REV=9d03e7c -t rev . 2>&1 | grep -A 1 -E '^#[0-9]+ \\[[0-9]' | tail -n 5", output: "#7 [3/4] COPY requirements.txt .\n#7 CACHED\n--\n#8 [4/4] RUN pip install --no-cache-dir -r requirements.txt\n#8 CACHED" },
          { command: "docker image inspect -f '{{.Config.Labels}}' rev", output: "map[org.opencontainers.image.revision:9d03e7c]" },
        ],
      },
      {
        id: 'dkr06-size', title: '清理寫在同一個 RUN', machine: 'dkr06-harbor',
        description: '三種 Python 基底的大小；apt-get update、install 與 rm 分成三個 RUN 和寫成一個 RUN 的差別。',
        steps: [
          { command: "docker images python", output: "REPOSITORY   TAG           IMAGE ID       CREATED       SIZE\npython       3.12          a81fd185e273   11 days ago   1.02GB\npython       3.12-alpine   b0f3b7323220   11 days ago   51.4MB\npython       3.12-slim     2f6dcae1cf7e   11 days ago   125MB" },
          { command: "cd ../lab", output: "" },
          { command: "cat split.Dockerfile", output: "FROM python:3.12-slim\nRUN apt-get update\nRUN apt-get install -y curl\nRUN rm -rf /var/lib/apt/lists/*" },
          { command: "docker build -q -f split.Dockerfile -t curl:split .", output: "sha256:36d162fb124214331fb725b85e87d95da11082fa22d755666ad523f9f68aee89" },
          { command: "docker build -q -f joined.Dockerfile -t curl:joined .", output: "sha256:0716eedf85f0c086c196374c27efcaabe825e4e06fb61553a62278e377999ed7" },
          { command: "docker images curl", output: "REPOSITORY   TAG       IMAGE ID       CREATED                  SIZE\ncurl         joined    0716eedf85f0   Less than a second ago   126MB\ncurl         split     36d162fb1242   Less than a second ago   145MB" },
          { command: "docker history --format '{{.Size}}\\t{{.CreatedBy}}' curl:split | head -n 4", output: "0B\tRUN /bin/sh -c rm -rf /var/lib/apt/lists/* #…\n1.6MB\tRUN /bin/sh -c apt-get install -y curl # bui…\n19.3MB\tRUN /bin/sh -c apt-get update # buildkit\n0B\tCMD [\"python3\"]" },
          { command: "docker history --format '{{.Size}}\\t{{.CreatedBy}}' curl:joined | head -n 2", output: "1.6MB\tRUN /bin/sh -c apt-get update &&     apt-get…\n0B\tCMD [\"python3\"]" },
        ],
      },
      {
        id: 'dkr06-ignore', title: '.dockerignore 擋下秘密與雜物', machine: 'dkr06-harbor',
        description: '沒有 .dockerignore 時 .env、.git 與 __pycache__ 都進了 Image；加上之後建置內容變小，Image 只剩需要的檔案。',
        steps: [
          { command: "ls -a", output: ".  ..  .env  .git/  Dockerfile  __pycache__/  app.py  requirements.txt" },
          { command: "docker build -t tide:1.0 . 2>&1 | grep transferring", output: "#1 transferring dockerfile: 132B done\n#3 transferring context: 2B done\n#5 transferring context: 1.413kB done" },
          { command: "docker run --rm tide:1.0 ls -a /app", output: ".\n..\n.env\n.git\nDockerfile\n__pycache__\napp.py\nrequirements.txt" },
          { command: "printf '.git\\n__pycache__\\n.env\\n' > .dockerignore", output: "" },
          { command: "docker build -t tide:1.0 . 2>&1 | grep transferring", output: "#1 transferring dockerfile: 132B done\n#3 transferring context: 22B done\n#5 transferring context: 358B done" },
          { command: "docker run --rm tide:1.0 ls -a /app", output: ".\n..\n.dockerignore\nDockerfile\napp.py\nrequirements.txt" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr06-cache-order', title: '讓 npm ci 命中快取', machine: 'dkr06-harbor',
        statement: '~/berth 是一個 Node.js（Express）服務，它的 Dockerfile 先 `COPY . .` 再 `RUN npm ci --omit=dev`，每改一行 server.js 都要重新安裝全部套件。請改寫 ~/berth/Dockerfile 的指令順序：先只複製 package.json 與 package-lock.json 並安裝，原始碼仍用 `COPY . .` 放在安裝之後（FROM、WORKDIR、EXPOSE、CMD 不變）。完成後，改了 server.js 再建置時，`RUN npm ci` 必須是 CACHED，`COPY . .` 重新執行。可以用 `printf \'…\' > Dockerfile` 一次寫好整個檔案。',
        checks: [{ kind: 'build', context: '/home/mei/berth', change: 'server.js', cached: ['RUN npm ci'], rebuilt: ['COPY . .'] }],
        solution: ['cd ~/berth', rewrite(BERTH_FAST), 'docker build -q -t berth:1.1 .'],
        mistakes: [
          { commands: ['cd ~/berth', 'docker build -t berth:1.1 .'], why: '沒有改 Dockerfile，只是再建置一次；改了 server.js 之後 COPY . . 失效，npm ci 仍然跟著重新執行' },
          { commands: ['cd ~/berth', rewrite(BERTH_NO_MANIFEST)], why: '把 npm ci 移到最前面，但執行時容器裡還沒有 package.json 與 package-lock.json，建置失敗' },
          { commands: ['cd ~/berth', rewrite(BERTH_NO_LOCK)], why: '只複製了 package.json：npm ci 依 package-lock.json 安裝，沒有 lock 檔就直接失敗（EUSAGE）' },
          { commands: ['cd ~/berth', rewrite(BERTH_BOTH_FIRST)], why: '先複製了依賴清單，卻在安裝之前又 COPY . .，改 server.js 一樣讓 npm ci 失效' },
        ],
        hints: [
          '先在 ~/berth 建置一次，改 server.js 後再建置，用 `2>&1 | grep -A 1 -E \'^#[0-9]+ \\[[0-9]\'` 看哪一步沒有 CACHED。',
          '`npm ci` 需要 package.json 和 package-lock.json 兩個檔案：`COPY package.json package-lock.json ./`（或 `COPY package*.json ./`）。',
          '順序是 FROM、WORKDIR、複製兩個依賴清單、`RUN npm ci --omit=dev`、`COPY . .`、EXPOSE、CMD。',
        ],
        explanation: '每一步的快取鍵包含前一步的鍵，所以 `COPY . .` 寫在安裝之前時，任何原始碼的變化都讓它的 checksum 改變，連帶 `RUN npm ci` 失效。先 `COPY package.json package-lock.json ./` 再 `RUN npm ci --omit=dev`，安裝這一步只依賴兩個清單檔，server.js 改了也不影響它的鍵，於是維持 CACHED；最後的 `COPY . .` 才因為 server.js 改變而重新執行，只花不到一秒。只複製 package.json 會讓 `npm ci` 因為沒有 lock 檔而失敗；依賴清單先複製了卻又在安裝前 `COPY . .`，效果和原本一樣。',
      },
      {
        id: 'dkr06-slim', title: '把 gauge 變小', machine: 'dkr06-harbor',
        statement: '~/gauge 是一個用 curl 和 requests 做健康檢查的小工具，它的 Image 大約 150MB。請改寫 ~/gauge/Dockerfile 讓 Image 變小：apt 的套件清單不能留在任何一層，pip 也不要留下下載快取；仍然安裝 curl 與 requirements.txt 的套件，CMD 不變。用 `docker build -t gauge:slim .` 建置，最後用 `docker images --format \'{{.Size}}\' gauge:slim` 印出它的大小。',
        checks: [
          { kind: 'image', name: 'gauge:slim', cmd: ['python', 'probe.py'] },
          { kind: 'output', fromCommand: '^(sudo )?docker (images|image ls)\\b' },
        ],
        solution: ['cd ~/gauge', rewrite(GAUGE_SLIM), 'docker build -q -t gauge:slim .', SIZE],
        mistakes: [
          { commands: ['cd ~/gauge', rewrite(GAUGE_RM_APART), 'docker build -q -t gauge:slim .', SIZE], why: 'rm 寫在另一個 RUN：套件清單仍留在 update 那一層，rm 只多了一個 0B 的層' },
          { commands: ['cd ~/gauge', rewrite(GAUGE_PIP_ONLY), 'docker build -q -t gauge:slim .', SIZE], why: '只加了 --no-cache-dir，apt 仍是三個 RUN，19MB 以上的套件清單留在 Image 裡' },
          { commands: ['cd ~/gauge', rewrite(GAUGE_APT_ONLY), 'docker build -q -t gauge:slim .', SIZE], why: 'apt 合併得很好，但 pip install 沒有 --no-cache-dir，~/.cache/pip 的下載快取留在那一層' },
          { commands: ['cd ~/gauge', 'docker build -q -t gauge:slim .', SIZE], why: '沒有改 Dockerfile，只是換了一個標籤，大小和原本一樣' },
          { commands: ['echo 129MB'], why: '直接打出數字，沒有建置也沒有查詢；換一台套件大小不同的機器答案就不同了' },
        ],
        variants: [{ label: 'curl 與 libcurl4 較大、套件清單 21.7MB 的 harbor-07', files: [], docker: docker({ curl: 600_000, libcurl: 3_400_000, aptLists: 21_700_000 }) }],
        hints: [
          '先 `docker history --format \'{{.Size}}\\t{{.CreatedBy}}\' 名稱` 看原本的 Image 哪幾層最大。',
          '把 `apt-get update`、`apt-get install -y curl` 與 `rm -rf /var/lib/apt/lists/*` 用 `&&` 寫在同一個 RUN。',
          'pip 加上 `--no-cache-dir`；其餘的指令與順序不用改。',
        ],
        explanation: '原本的 Dockerfile 有兩個浪費：`apt-get update` 自成一層，套件清單永遠留在那一層，後面的 `RUN rm -rf` 只是遮住它；`pip install` 沒有 `--no-cache-dir`，下載快取留在 pip 那一層。把 apt 的三件事寫成 `RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*`，清單在這一層結束前就刪掉；pip 加上 `--no-cache-dir`。這台機器上 Image 從 149MB 變成 129MB，另一台套件與清單大小不同的機器上數字也跟著不同，所以要真的建置並查詢才會得到正確的答案。只修其中一項都還不夠小。',
      },
      {
        id: 'dkr06-largest-layer', title: '找出最大的一層', machine: 'dkr06-harbor',
        statement: 'harbor-07 上的 `harbor/report-worker:3.2` 是隊友建好的 Image，體積大得不尋常。用 `docker history` 查出它哪一個指令產生了最大的一層，只印出那一層完整的 CREATED BY（不能被截斷，一行，例如 `COPY . . # buildkit`）。',
        checks: [{ kind: 'output', fromCommand: '^(sudo )?docker (image )?history\\b' }],
        solution: [LARGEST],
        mistakes: [
          { commands: ["docker history --format '{{.Size}} {{.CreatedBy}}' harbor/report-worker:3.2 | sort -n | tail -n 1 | cut -d ' ' -f 2-"], why: '用人看的大小排序：sort -n 只讀數字，640kB 的 640 比 412MB 的 412 大' },
          { commands: ["docker history --no-trunc --human=false --format '{{.Size}} {{.CreatedBy}}' harbor/report-worker:3.2 | sort | tail -n 1 | cut -d ' ' -f 2-"], why: '沒有 -n 的 sort 逐字比較，98400000 排在 412000000 後面' },
          { commands: ["docker history --human=false --format '{{.Size}} {{.CreatedBy}}' harbor/report-worker:3.2 | sort -n | tail -n 1 | cut -d ' ' -f 2-"], why: '沒有 --no-trunc，長的指令被截斷成 45 個字' },
          { commands: ['docker history harbor/report-worker:3.2 | head -n 2'], why: '最上面一列是最新的指令，不一定是最大的一層，而且印出了整列與標題' },
          { commands: ["echo 'COPY samples/ /srv/samples/ # buildkit'"], why: '直接打出答案，沒有查詢；另一個版本的 Image 最大的層不同' },
        ],
        variants: [
          { label: 'samples 已移出 Image 的 report-worker', files: [], docker: docker(BASE_SIZES, WORKER_NO_SAMPLES) },
          { label: '相依套件很大的 report-worker', files: [], docker: docker(BASE_SIZES, WORKER_HEAVY_PIP) },
        ],
        hints: [
          '`docker history --no-trunc --human=false --format \'{{.Size}} {{.CreatedBy}}\' 名稱` 每行印出位元組數與完整的指令。',
          '`sort -n` 依數字排序，`tail -n 1` 取最大的那一行。',
          '`cut -d \' \' -f 2-` 去掉第一欄的大小，留下後面的整個指令。',
        ],
        explanation: '`--human=false` 讓 SIZE 成為位元組數，`sort -n` 才能正確比較；`--no-trunc` 讓 CREATED BY 是完整的指令；`tail -n 1` 取最大的一行，`cut -d \' \' -f 2-` 去掉開頭的數字。這台機器上最大的是 412MB 的 `COPY samples/ /srv/samples/ # buildkit`：範例資料被 COPY 進了 Image，該用 .dockerignore 排除或改放 Volume。另外兩個版本分別是安裝 fonts-noto-cjk 的 RUN 與安裝相依套件的 RUN。用人看的單位排序時 640kB 會勝過 412MB；不加 -n 時 98400000 會勝過 412000000；不加 --no-trunc 時長的 RUN 會被截斷。',
      },
      {
        id: 'dkr06-ignore-logs', title: '日誌讓快取永遠失效', machine: 'dkr06-harbor',
        statement: 'ledger 的 CI 每次建置都重新執行 `COPY . .`，每次都得到新的 Image ID，即使沒有人改程式。開發伺服器一直在寫 ~/ledger/logs/app.log。先在 ~/ledger 建置一次，在 logs/app.log 加一行之後再建置，從輸出找出哪一步沒有命中快取、想想為什麼；然後只修改 ~/ledger/.dockerignore（不要改 Dockerfile，也不要刪除日誌），讓日誌改變之後重新建置時，`COPY . .` 與前面的 `RUN pip install` 都是 CACHED。',
        checks: [
          { kind: 'build', context: '/home/mei/ledger', change: 'logs/app.log', cached: ['RUN pip install', 'COPY . .'] },
          { kind: 'unchanged', path: '/home/mei/ledger/Dockerfile' },
        ],
        solution: ['cd ~/ledger', "echo 'logs/' >> .dockerignore", 'docker build -q -t ledger .'],
        mistakes: [
          { commands: ['cd ~/ledger', "echo '*.log' >> .dockerignore"], why: '`*.log` 已經在裡面了：它只符合建置內容根目錄的檔案，`*` 不跨過 `/`，logs/app.log 不受影響' },
          { commands: ['cd ~/ledger', 'rm logs/app.log'], why: '刪掉日誌只撐到開發伺服器下一次寫入；題目要的是讓日誌不再進入建置內容' },
          { commands: ['cd ~/ledger', "echo 'logs/' >> .gitignore"], why: '.gitignore 是給 git 的，docker build 只讀 .dockerignore' },
          { commands: ['cd ~/ledger', 'docker build --no-cache -t ledger .'], why: '--no-cache 只是這次不用快取，日誌仍在建置內容裡，下一次照樣失效' },
        ],
        hints: [
          '建置兩次，中間 `echo … >> logs/app.log`，再用 `2>&1 | grep -A 1 -E \'^#[0-9]+ \\[[0-9]\'` 看哪一步不是 CACHED。',
          '`docker run --rm 名稱 ls /app/logs` 可以確認日誌被複製進了 Image。',
          '.dockerignore 的樣式從建置內容的根目錄算起：`logs/` 或 `**/*.log`。',
        ],
        explanation: 'Dockerfile 的順序沒有問題，問題在建置內容：.dockerignore 的 `*.log` 只排除根目錄的 .log 檔，logs/app.log 仍被 `COPY . .` 複製，日誌每多一行，這一步的 checksum 就不同，`COPY . .` 重新執行，產生新的層與新的 Image ID（後面若還有步驟也會跟著重新執行）。在 .dockerignore 加上 `logs/`（或 `**/*.log`），日誌不再屬於建置內容，`COPY . .` 的 checksum 不受它影響而維持 CACHED，Image 裡也不再有日誌。刪掉日誌、改 .gitignore 或用 --no-cache 都沒有處理根本原因。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr06-q1', prompt: 'Dockerfile 裡的哪一個指令不會產生新的層，只在 `docker history` 留下一列 0B 的紀錄？',
      options: ['`RUN pip install -r requirements.txt`', '`COPY . .`', '`ENV APP_ENV=production`', '`ADD config.json /etc/app/`'],
      answer: 2,
      explanation: 'ENV 只修改 Image 的設定（之後的 RUN 與容器的環境變數），不寫入檔案，所以不產生層，history 裡是 0B 的一列。RUN 會留下指令寫入的檔案；COPY 與 ADD 把建置內容的檔案複製進一個新的層，三者都會產生層。',
    },
    {
      id: 'dkr06-q2', prompt: 'Dockerfile 依序是 `FROM python:3.12-slim`、`WORKDIR /app`、`COPY . .`、`RUN pip install --no-cache-dir -r requirements.txt`。只改了 app.py 的一行再建置，哪些步驟會重新執行？',
      options: ['`COPY . .` 與之後的 `RUN pip install`', '只有 `COPY . .`', '只有 `RUN pip install`，因為它要重新讀 requirements.txt', '全部重新執行，包括 FROM 與 WORKDIR'],
      answer: 0,
      explanation: 'app.py 改了，`COPY . .` 的 checksum 改變而失效；每一步的快取鍵包含前一步的鍵，所以之後的 pip install 也跟著重新執行，即使 requirements.txt 沒變。只有 COPY 重新執行是錯的，因為快取是一條鏈；FROM 與 WORKDIR 在失效的步驟之前，它們的鍵沒變，仍然 CACHED。',
    },
    {
      id: 'dkr06-q3', prompt: 'Dockerfile 寫成三行：`RUN apt-get update`、`RUN apt-get install -y curl`、`RUN rm -rf /var/lib/apt/lists/*`。關於 Image 的大小，哪一個說法正確？',
      options: ['最後的 rm 刪掉了清單，Image 和寫成同一個 RUN 一樣大', '套件清單仍留在 `apt-get update` 那一層，rm 只多了一個 0B 的層把它遮住，Image 沒有變小', 'rm 那一層的大小是負的，正好抵銷 update 那一層', 'docker build 結束時會自動合併連續的 RUN，所以大小沒有差別'],
      answer: 1,
      explanation: '層建好就不再改變，後面的層刪除檔案只是加上遮住它的標記，update 那一層的清單一個位元組都沒少，所以 Image 比寫成同一個 RUN 大了一份清單。層的大小沒有負數；docker build 也不會自動合併 RUN，每個 RUN 都是獨立的一層。',
    },
    {
      id: 'dkr06-q4', prompt: '`docker history app:1.0` 除了第一列之外，IMAGE 欄都是 `<missing>`。這代表什麼？',
      options: ['那些層已經被 `docker image prune` 刪除了', 'Image 損壞，需要重新 `docker pull`', '只有第一列對應真正的層，其他列都是空的', '這些層都在，只是 BuildKit 不替中間的每一步產生獨立的 Image，所以沒有 ID 可以顯示'],
      answer: 3,
      explanation: '`<missing>` 只表示那一列沒有自己的 Image ID：BuildKit 不產生中間 Image，拉取來的 Image 也只有最終的 ID，層本身完整存在，RootFS.Layers 列得出來。prune 不會刪除仍被 Image 使用的層；Image 沒有損壞，不需要重新拉取；SIZE 欄也顯示那些列有各自的大小。',
    },
    {
      id: 'dkr06-q5', prompt: '為了在 Image 上標記版本，Dockerfile 的第二行寫了 `ARG GIT_REV`，每次建置都傳入不同的 `--build-arg GIT_REV=…`。結果每次建置 `RUN pip install` 都重新執行。原因是什麼？',
      options: ['只要有 `--build-arg`，docker build 就自動加上 `--no-cache`', 'pip 偵測到版本號改變，主動重新安裝', 'ARG 的值是之後每個 RUN 的環境變數，值一變，宣告之後的 RUN 全部失效', 'ARG 會產生一層，讓之後每一層的大小改變'],
      answer: 2,
      explanation: '宣告之後，ARG 的值成為之後每個 RUN 的環境變數，是 RUN 快取鍵的一部分，即使 pip install 沒用到它也會失效；把 ARG 移到安裝之後就能解決。`--build-arg` 不會關閉快取；pip 根本沒有執行到可以「偵測」的時候；ARG 只是設定，不產生層。',
    },
    {
      id: 'dkr06-q6', prompt: '.dockerignore 裡寫了 `*.log`，但 `logs/app.log` 仍被複製進 Image，而且它每次改變都讓 `COPY . .` 重新執行。應該怎麼改？',
      options: ['把 `*.log` 改成 `*.LOG`', '加上 `**/*.log` 或 `logs/`：`*` 不跨過 `/`，`*.log` 只符合建置內容根目錄的檔案', '把 `logs/` 加進 .gitignore', '在 Dockerfile 最後加一行 `RUN rm -rf logs`'],
      answer: 1,
      explanation: '.dockerignore 的樣式從建置內容的根目錄算起，`*` 不跨過 `/`，所以要用 `**/*.log` 或直接排除 `logs/`。大小寫改了只會什麼都不符合；docker build 不讀 .gitignore；最後的 `RUN rm` 刪不掉前面 COPY 那一層的日誌，`COPY . .` 也照樣因為日誌改變而失效。',
    },
    {
      id: 'dkr06-q7', prompt: '什麼時候適合用 `docker build --no-cache`？',
      options: ['每次建置都該加，Image 才會最小', '想讓 `COPY . .` 不要重新執行的時候', '想刪除主機上沒有用到的舊 Image 的時候', '想讓 `RUN apt-get update` 這類「指令沒變、外面的資料變了」的步驟真的重新執行，例如要拿到套件的安全更新'],
      answer: 3,
      explanation: '快取鍵只看指令的文字與輸入的檔案，看不到套件庫的更新，所以要拿最新的套件時用 `--no-cache` 讓每一步重新執行。它不會讓 Image 變小，只會讓建置變慢；它讓所有步驟都重新執行，正好和「不要重新執行」相反；刪除舊 Image 是 `docker image prune` 或 `docker rmi` 的工作。',
    },
  ],
};

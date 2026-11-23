import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalDocker, TerminalImage, TerminalProgram } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

/*
 * DKR05 Writing Dockerfiles (DKR-2, terminal-sim). A terminal lesson on the images profile (engine stage E21): the
 * Dockerfile's instructions and docker build -t with BuildKit's plain output; FROM and choosing a base image (official
 * images, a version tag instead of latest, the full, slim and alpine variants); RUN with apt-get update, install and
 * cleanup in one RUN (the error without update, the size of a split RUN in docker history); COPY rather than ADD, WORKDIR
 * before COPY, ENV and ARG, LABEL; CMD and ENTRYPOINT in exec and shell form, how they combine with docker run's arguments
 * and why exec form lets PID 1 receive SIGTERM (the JSONArgsRecommended warning); EXPOSE as documentation; .dockerignore
 * keeping .env, .git and .venv out of the context and the image; USER with useradd. Machines: the Docker host kiln-01
 * (user mei in the docker group; python:3.12-slim pulled with apt and pip tables, python:3.12-alpine and python:latest on
 * the simulated Docker Hub; projects notes, board, lab, greet and report; declared programs for gunicorn, greet.py and
 * report.py), the same host with a broken notes Dockerfile and with a working one. Gunicorn's boot failure omits the
 * Python traceback lines. Layers, overlay2 and the kernel's PID 1 signal rule are text only. The host, user, projects,
 * secrets and data are made up. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'mei', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'mei', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const PATH_ENV = 'PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const BOOKWORM = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n';
const ALPINE = 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n';
const PIP: NonNullable<TerminalImage['packages']>['pip'] = [
  { name: 'flask', version: '3.0.3', size: 360_000, depends: ['werkzeug>=3.0.0', 'jinja2>=3.1.2', 'itsdangerous>=2.1.2', 'click>=8.1.3', 'blinker>=1.6.2'] },
  { name: 'werkzeug', version: '3.1.3', size: 900_000, depends: ['MarkupSafe>=2.1.1'] }, { name: 'jinja2', version: '3.1.4', size: 800_000, depends: ['MarkupSafe>=2.0'] },
  { name: 'MarkupSafe', version: '3.0.2', size: 50_000 }, { name: 'itsdangerous', version: '2.2.0', size: 60_000 }, { name: 'click', version: '8.1.7', size: 400_000 },
  { name: 'blinker', version: '1.9.0', size: 40_000 }, { name: 'gunicorn', version: '23.0.0', size: 450_000, depends: ['packaging'] }, { name: 'packaging', version: '24.2', size: 260_000 },
];

const SLIM: TerminalImage = {
  name: 'python:3.12-slim', size: 124_500_000, created: '2026-11-12 03:00:00', cmd: ['python3'], pulled: true,
  env: [PATH_ENV, 'LANG=C.UTF-8', 'GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305', 'PYTHON_VERSION=3.12.7'], osRelease: BOOKWORM,
  history: [
    { createdBy: '# debian.sh --arch \'amd64\' out/ \'bookworm\' \'@1731283200\'', size: 74_800_000 },
    { createdBy: 'ENV PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' },
    { createdBy: 'ENV LANG=C.UTF-8' },
    { createdBy: 'RUN /bin/sh -c set -eux;  apt-get update;  apt-get install -y --no-install-recommends   ca-certificates  netbase  tzdata  ; rm -rf /var/lib/apt/lists/* # buildkit', size: 3_500_000 },
    { createdBy: 'ENV GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305' },
    { createdBy: 'ENV PYTHON_VERSION=3.12.7' },
    { createdBy: 'RUN /bin/sh -c set -eux;   savedAptMark="$(apt-mark showmanual)"; … # buildkit', size: 46_200_000 },
    { createdBy: 'RUN /bin/sh -c set -eux;  for src in idle3 pip3 pydoc3 python3 python3-config; do  dst="$(echo "$src" | tr -d 3)"; … # buildkit', size: 0, layer: true },
    { createdBy: 'CMD ["python3"]' },
  ],
  packages: {
    apt: [
      { name: 'curl', version: '7.88.1-10+deb12u8', size: 500_000, depends: ['libcurl4'] },
      { name: 'libcurl4', version: '7.88.1-10+deb12u8', size: 1_100_000, files: [{ path: '/usr/lib/x86_64-linux-gnu/libcurl.so.4', content: '' }] },
    ],
    pip: PIP, aptLists: 19_300_000,
  },
};
const ALPINE_PY: TerminalImage = {
  name: 'python:3.12-alpine', size: 57_300_000, created: '2026-11-12 03:10:00', cmd: ['python3'], layers: 5, osRelease: ALPINE,
  env: [PATH_ENV, 'LANG=C.UTF-8', 'GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305', 'PYTHON_VERSION=3.12.7'],
};
const LATEST: TerminalImage = {
  name: 'python:latest', size: 1_020_000_000, created: '2026-11-12 02:40:00', cmd: ['python3'], layers: 8, osRelease: BOOKWORM,
  env: [PATH_ENV, 'LANG=C.UTF-8', 'GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305', 'PYTHON_VERSION=3.13.1'], packages: { pip: PIP },
};
const IMAGES = [SLIM, ALPINE_PY, LATEST];

const SITE = '/usr/local/lib/python3.12/site-packages';
const gunicornLogs = (port: number) => [`[1] [INFO] Starting gunicorn 23.0.0`, `[1] [INFO] Listening at: http://0.0.0.0:${port} (1)`, '[1] [INFO] Using worker: sync', '[7] [INFO] Booting worker with pid: 7']
  .map(text => ({ text: `[2026-11-22 10:00:00 +0000] ${text}`, stream: 2 as const }));
const bootFailure = (port: number, module: string) => [
  ...gunicornLogs(port).map(l => l.text),
  '[2026-11-22 10:00:00 +0000] [7] [ERROR] Exception in worker process',
  `ModuleNotFoundError: No module named '${module}'`,
  '[2026-11-22 10:00:00 +0000] [7] [INFO] Worker exiting (pid: 7)',
  '[2026-11-22 10:00:00 +0000] [1] [ERROR] Worker (pid:7) exited with code 3',
  '[2026-11-22 10:00:00 +0000] [1] [ERROR] Shutting down: Master',
  '[2026-11-22 10:00:00 +0000] [1] [ERROR] Reason: Worker failed to boot.',
].join('\n');
const gunicorn = (module: string, port: number, responder: string): TerminalProgram => ({
  command: ['gunicorn', '--bind', `0.0.0.0:${port}`, `${module}:app`], needs: [`${module}.py`, `${SITE}/flask/__init__.py`, `${SITE}/gunicorn/__init__.py`],
  missing: { output: bootFailure(port, module), exit: 3 }, service: true, logs: gunicornLogs(port), stopExit: 0, http: { port, responder },
});
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** What report.py prints for the last row of orders.csv: the date, the number of orders and the revenue. */
const reportPrograms = (date: string, orders: number, revenue: number): TerminalProgram[] => {
  const json = `{"date": "${date}", "orders": ${orders}, "revenue": ${revenue}}`, needs = ['report.py', 'orders.csv'];
  return [
    { command: ['python', 'report.py', '--format', 'text'], needs, output: `日期 ${date}\n訂單 ${orders} 筆\n營收 NT$${thousands(revenue)}` },
    { command: ['python', 'report.py', '--format', 'json'], needs, output: json },
    // argparse keeps the last value of a repeated option: an ENTRYPOINT that already says --format text, followed by --format json.
    { command: ['python', 'report.py', '--format', 'text', '--format', 'json'], needs, output: json },
  ];
};
const programs = (report: TerminalProgram[]): TerminalProgram[] => [
  gunicorn('board', 8000, 'board-app'),
  gunicorn('app', 5000, 'notes-app'),
  { command: ['python', 'greet.py', '--name', 'world'], needs: ['greet.py'], output: 'Hello, world!' },
  { command: ['python', 'greet.py', '--name', 'Mei'], needs: ['greet.py'], output: 'Hello, Mei!' },
  ...report,
];
const DOCKER: TerminalDocker = { images: IMAGES, programs: programs(reportPrograms('2026-11-21', 42, 18960)) };

const BOARD_PY = "from flask import Flask\n\napp = Flask(__name__)\n\n\n@app.get('/')\ndef index():\n    return '留言板運作中\\n'\n";
const NOTES_PY = "from flask import Flask\n\napp = Flask(__name__)\n\n\n@app.get('/')\ndef index():\n    return '筆記服務運作中\\n'\n";
const REQUIREMENTS = 'flask==3.0.3\ngunicorn==23.0.0\n';
const BOARD_DOCKERFILE = '# syntax=docker/dockerfile:1\nFROM python:3.12-slim\nARG APP_VERSION=1.0\nLABEL org.opencontainers.image.title="board" org.opencontainers.image.version=$APP_VERSION\nENV PYTHONUNBUFFERED=1\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["gunicorn", "--bind", "0.0.0.0:8000", "board:app"]\n';
/** A made-up file of `lines` lines standing for a local virtualenv's or Git's data: only its size matters to the build context. */
const filler = (label: string, lines: number) => Array.from({ length: lines }, (_, i) => `# ${label} ${String(i + 1).padStart(4, '0')}`).join('\n') + '\n';
const project = (name: string, py: string, code: string, secret: string, root = `/home/mei/${name}`) => [
  dir(root), file(`${root}/${py}`, code), file(`${root}/requirements.txt`, REQUIREMENTS), file(`${root}/README.md`, `# ${name}\n\n本機開發：python -m venv .venv\n`),
  file(`${root}/.env`, `SECRET_KEY=${secret}\nDATABASE_URL=postgres://${name}:devpass@localhost:5432/${name}\n`, 'mei', 0o600),
  dir(`${root}/.git`), file(`${root}/.git/HEAD`, 'ref: refs/heads/main\n'), file(`${root}/.git/config`, '[core]\n\trepositoryformatversion = 0\n\tbare = false\n'),
  dir(`${root}/.git/objects`), dir(`${root}/.git/objects/pack`), file(`${root}/.git/objects/pack/pack-3e1d.pack`, filler('pack', 180)), file(`${root}/.git/index`, filler('index', 120)),
  dir(`${root}/.venv`), file(`${root}/.venv/pyvenv.cfg`, 'home = /usr/bin\ninclude-system-site-packages = false\nversion = 3.12.3\n'),
  dir(`${root}/.venv/lib`), dir(`${root}/.venv/lib/python3.12`), dir(`${root}/.venv/lib/python3.12/site-packages`),
  ...['flask', 'werkzeug', 'jinja2', 'gunicorn'].flatMap(pkg => [dir(`${root}/.venv/lib/python3.12/site-packages/${pkg}`),
    file(`${root}/.venv/lib/python3.12/site-packages/${pkg}/__init__.py`, filler(pkg, 160))]),
  dir(`${root}/__pycache__`), file(`${root}/__pycache__/${py.replace('.py', '')}.cpython-312.pyc`, filler('bytecode', 40)),
];

const LAB_NOUPDATE = 'FROM python:3.12-slim\nRUN apt-get install -y curl\n';
const LAB_SPLIT = 'FROM python:3.12-slim\nRUN apt-get update\nRUN apt-get install -y curl\nRUN rm -rf /var/lib/apt/lists/*\n';
const LAB_ONERUN = 'FROM python:3.12-slim\nRUN apt-get update && \\\n    apt-get install -y --no-install-recommends curl && \\\n    rm -rf /var/lib/apt/lists/*\n';
const GREET_PY = "import argparse\n\nparser = argparse.ArgumentParser()\nparser.add_argument('--name', default='world')\nprint(f'Hello, {parser.parse_args().name}!')\n";
const GREET_DOCKERFILE = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY greet.py .\nENTRYPOINT ["python", "greet.py"]\nCMD ["--name", "world"]\n';
const GREET_CMD = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY greet.py .\nCMD ["python", "greet.py", "--name", "world"]\n';
const GREET_SHELL = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY greet.py .\nCMD python greet.py --name world\n';
const REPORT_PY = "import argparse, csv, json\n\nparser = argparse.ArgumentParser()\nparser.add_argument('--format', choices=['text', 'json'], default='text')\nargs = parser.parse_args()\nwith open('orders.csv', newline='') as f:\n    row = list(csv.DictReader(f))[-1]\nreport = {'date': row['date'], 'orders': int(row['orders']), 'revenue': int(row['revenue'])}\nif args.format == 'json':\n    print(json.dumps(report))\nelse:\n    print(f\"日期 {report['date']}\\n訂單 {report['orders']} 筆\\n營收 NT${report['revenue']:,}\")\n";
const REPORT_DOCKERFILE = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY report.py orders.csv ./\nCMD ["python", "report.py", "--format", "text"]\n';
const ORDERS = (rows: [string, number, number][]) => 'date,orders,revenue\n' + rows.map(r => r.join(',')).join('\n') + '\n';

const NOTES_DOCKERFILE = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 5000\nCMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]\n';
const NOTES_BROKEN = 'FROM python:3.12-slim\nWORKDIR /app\nRUN apt-get install -y --no-install-recommends curl\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 5000\nCMD gunicorn --bind 0.0.0.0:5000 app:app\n';

const kiln = (id: string, title: string, notesDockerfile: string | null): TerminalMachine => ({
  id, title, user: 'mei', host: 'kiln-01', cwd: '/home/mei/notes', profile: 'images', now: '2026-11-22 10:00:00', boot: '2026-11-22 06:00:00',
  files: [
    dir('/home', 'root'), dir('/home/mei', 'mei', 0o750),
    ...project('notes', 'app.py', NOTES_PY, 'local-dev-7f3a9c'), ...notesDockerfile ? [file('/home/mei/notes/Dockerfile', notesDockerfile)] : [],
    ...project('board', 'board.py', BOARD_PY, 'local-dev-b81e04'), file('/home/mei/board/Dockerfile', BOARD_DOCKERFILE),
    dir('/home/mei/lab'), file('/home/mei/lab/Dockerfile.noupdate', LAB_NOUPDATE), file('/home/mei/lab/Dockerfile.split', LAB_SPLIT), file('/home/mei/lab/Dockerfile.onerun', LAB_ONERUN),
    dir('/home/mei/greet'), file('/home/mei/greet/greet.py', GREET_PY), file('/home/mei/greet/Dockerfile', GREET_DOCKERFILE), file('/home/mei/greet/Dockerfile.cmd', GREET_CMD), file('/home/mei/greet/Dockerfile.shell', GREET_SHELL),
    dir('/home/mei/report'), file('/home/mei/report/report.py', REPORT_PY), file('/home/mei/report/Dockerfile', REPORT_DOCKERFILE),
    file('/home/mei/report/orders.csv', ORDERS([['2026-11-20', 38, 15420], ['2026-11-21', 42, 18960]])),
  ],
  accounts: { groups: [{ name: 'sudo', members: ['mei'] }, { name: 'docker', gid: 988, members: ['mei'] }] },
  responders: [
    { id: 'board-app', server: 'gunicorn', routes: [{ path: '/', body: '留言板運作中\n', type: 'text/html; charset=utf-8' }] },
    { id: 'notes-app', server: 'gunicorn', routes: [{ path: '/', body: '筆記服務運作中\n', type: 'text/html; charset=utf-8' }] },
  ],
  docker: DOCKER,
});

const MAIN = kiln('dkr05-kiln', 'kiln-01（Docker 主機：notes 還沒有 Dockerfile）', null);
const BROKEN = kiln('dkr05-broken', 'kiln-01（notes 的 Dockerfile 建置失敗）', NOTES_BROKEN);
const READY = kiln('dkr05-ready', 'kiln-01（notes 有可用的 Dockerfile）', NOTES_DOCKERFILE);

// The exercises' Dockerfiles (the terminal has no editor: a Dockerfile is written with printf).
const write = (path: string, text: string) => `printf '${text.replace(/\n/g, '\\n')}' > ${path}`;
const EXEC_CMD = 'CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]';
const SHELL_CMD = 'CMD gunicorn --bind 0.0.0.0:5000 app:app';
const NOTES_FIXED = 'FROM python:3.12-slim\nWORKDIR /app\nRUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 5000\n' + EXEC_CMD + '\n';
const NOTES_USER = 'FROM python:3.12-slim\nRUN useradd -r app\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nUSER app\nEXPOSE 5000\n' + EXEC_CMD + '\n';
const IGNORE = '.env\n.git\n.venv\n__pycache__\n';
const REPORT_FIXED = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY report.py orders.csv ./\nENTRYPOINT ["python", "report.py"]\nCMD ["--format", "text"]\n';
const NOTES_HTTP = { kind: 'http', url: 'http://localhost:5000/', status: 200, body: '筆記服務運作中' } as const;

export const DKR05: LessonContent = {
  lessonId: 'DKR05',
  motivation: '上一課用 `docker run` 執行別人做好的 Image：nginx、alpine、ubuntu。可是你自己的應用呢？把原始碼複製到伺服器、手動 `pip install`、記得設定環境變數、再用正確的指令啟動，每一步都可能和你的電腦不一樣。Dockerfile 把這些步驟寫成一個檔案：從哪個基底開始、裝哪些套件、複製哪些檔案、用什麼指令啟動。`docker build` 照著它一步步做出 Image，之後任何一台有 Docker 的主機都能用同一個 Image 啟動一模一樣的環境。寫 Dockerfile 不難，難的是寫對：忘了 `apt-get update` 讓建置失敗、用 `latest` 讓下個月建出不同的 Python、把 `.env` 裡的密鑰一起打包進 Image、用 shell 形式的 CMD 讓程式收不到 `docker stop` 的 SIGTERM、等 10 秒後被強制結束、以為 EXPOSE 就能讓瀏覽器連進來。這一課在 Docker 主機 kiln-01 上，替一個 Flask 應用寫 Dockerfile、建置、執行，修好一個壞掉的 Dockerfile，用 .dockerignore 擋住密鑰，並讓容器以非 root 的使用者執行。',
  sections: [
    {
      id: 'dkr05-s-dockerfile', title: 'Dockerfile 與 docker build',
      blocks: [
        { type: 'p', text: 'Dockerfile 是一個純文字檔，每一行是一個指令（instruction）加上它的參數，習慣上指令寫成大寫。Docker 由上往下讀：第一個指令通常是 FROM（從哪個 Image 開始），接著是改變檔案系統的步驟（RUN、COPY、WORKDIR），以及只改變 Image 設定的指令（ENV、EXPOSE、USER、CMD 等）。幾乎每個 Dockerfile 都會用到 FROM、RUN、COPY 這三個指令：選基底、執行安裝、放進自己的檔案。`#` 開頭的行是註解；第一行的 `# syntax=docker/dockerfile:1` 是給建置器看的 parser directive，指定用哪一版 Dockerfile 語法，可以省略。' },
        { type: 'table', head: ['指令', '作用', '建置時是一步嗎'], rows: [
          ['`FROM python:3.12-slim`', '以這個 Image 為基底（基底 Image）', '是，第一步'],
          ['`RUN 指令`', '在建置容器裡執行指令（安裝套件、建立帳號），結果成為新的一層', '是'],
          ['`COPY 來源 目的地`', '把建置內容裡的檔案複製進 Image', '是'],
          ['`WORKDIR /app`', '之後的 RUN、COPY、CMD 的工作目錄（不存在就建立）', '是'],
          ['`ENV 名稱=值`', '環境變數，建置時與容器執行時都有', '否，只改設定'],
          ['`ARG 名稱=預設值`', '只在建置時有的變數，可用 `--build-arg` 改', '否'],
          ['`EXPOSE 5000`', '說明程式會聽哪個埠（文件，不會公開）', '否'],
          ['`USER app`', '之後的 RUN 與容器的主程式以這個使用者執行', '否'],
          ['`LABEL 鍵=值`', 'Image 的中繼資料（版本、說明、來源）', '否'],
          ['`CMD [...]`、`ENTRYPOINT [...]`', '容器啟動時執行什麼（第五節）', '否'],
        ] },
        { type: 'p', text: '建置的指令是 `docker build -t 名稱:標籤 資料夾`。最後的資料夾叫建置內容（build context），通常是 `.`，也就是目前所在的專案資料夾：Dockerfile 預設就是這個資料夾裡名為 Dockerfile 的檔案（`-f` 可以指定別的檔案），COPY 的來源路徑也都相對於它。`-t` 替建出來的 Image 加上名稱與標籤，可以寫好幾個；`-q` 只印出 Image ID。Docker 23 起預設的建置器是 BuildKit，`docker build` 其實就是 `docker buildx build`。' },
        { type: 'example', id: 'dkr05-build-run' },
        { type: 'p', text: '讀 BuildKit 的輸出：`#1` 讀 Dockerfile，`#2` 查基底的資料，`#3` 讀 .dockerignore（這裡沒有，所以只有 2B），`#5` 傳送建置內容（14.56kB，後面會看到裡面多半是不該傳的東西）。真正的步驟標成 `[1/5]` 到 `[5/5]`：FROM、WORKDIR、兩個 COPY 與 RUN。ARG、LABEL、ENV、EXPOSE、CMD 沒有編號，因為它們只寫進 Image 的設定，不改變檔案。RUN 那一步印出 pip 的輸出，最後 `exporting to image` 寫出 Image 並命名為 board:1.0。這一課的 plain 格式是真實終端機上 `--progress=plain` 的樣子；直接在終端機執行時，BuildKit 會畫一個會收合的進度畫面。' },
        { type: 'p', text: '建出來的 Image 和上一課拉取的 Image 用法完全一樣：`docker run -d -p 8000:8000` 啟動，`curl` 連主機的 8000 得到應用的回應。COMMAND 欄是 Dockerfile 的 CMD，日誌是 gunicorn 寫到標準錯誤的啟動訊息，`docker image inspect -f \'{{.Config.Labels}}\'` 印出 LABEL，其中的版本號來自 ARG 的預設值 1.0。最後的 `docker stop` 得到 Exited (0)：gunicorn 是容器的 PID 1，收到 SIGTERM 就正常關閉，第五節會說明為什麼這和 CMD 的寫法有關。' },
      ],
    },
    {
      id: 'dkr05-s-from', title: 'FROM：選擇基底 Image',
      blocks: [
        { type: 'p', text: 'FROM 決定了 Image 裡有什麼作業系統檔案、哪一版的語言執行環境、有哪些工具。基底 Image 選擇要看三件事：來源可不可信、版本固不固定、大小與相容性合不合用。Docker Hub 上的官方 Image（Docker Official Images，例如 python、node、nginx、debian）有公開的建置方式並定期更新安全修補，是一般應用最穩當的起點；來路不明的個人 Image 可能過期，甚至被放了惡意程式。' },
        { type: 'p', text: '同一個 python 儲存庫有很多標籤。`python:3.12` 是以 Debian 為基礎、附帶編譯器與許多開發套件的完整版，大約 1GB；`python:3.12-slim` 拿掉了大部分開發工具，只留執行 Python 需要的東西；`python:3.12-alpine` 改用 Alpine Linux，最小。' },
        { type: 'table', head: ['標籤', '基礎', '大小（約）', '取捨'], rows: [
          ['`python:3.12`', 'Debian（glibc）', '1GB', '工具最齊全，需要編譯 C 擴充套件時最省事；Image 大、下載慢、漏洞掃描的項目多'],
          ['`python:3.12-slim`', 'Debian（glibc）', '125MB', '大部分應用的好選擇：仍是 Debian 與 apt-get，PyPI 上為 glibc 編好的 wheel 可以直接安裝'],
          ['`python:3.12-alpine`', 'Alpine（musl libc、BusyBox）', '57MB', '最小；但套件管理是 apk 不是 apt，有些套件沒有 musl 版的 wheel，要從原始碼編譯，建置變慢甚至更大'],
        ] },
        { type: 'example', id: 'dkr05-base' },
        { type: 'p', text: '`docker images python` 顯示兩個 Image 的大小：slim 是 125MB，alpine 是 57.3MB。兩者的 /etc/os-release 分別是 Debian 12 與 Alpine 3.21：基底不同，可用的工具也不同，在 Alpine 裡執行 `apt-get` 直接得到 executable file not found（127）。所以「換成 alpine 讓 Image 變小」不只是改一個標籤，Dockerfile 裡的 `apt-get install` 也得改成 `apk add`，還要確認每個套件在 musl 上能裝。' },
        { type: 'callout', tone: 'warning', title: '不寫標籤就是 latest，而 latest 會移動', text: '`FROM python` 等於 `FROM python:latest`。latest 不是「最穩定的版本」，只是儲存庫維護者指向最新版本的一個標籤，新版本發布時它就移到新的 Image：同一個 Dockerfile，這個月建出 Python 3.12，下個月可能就是 3.13，相依套件跟著出錯；而且 python:latest 是約 1GB 的完整版。寫出版本與變體（`python:3.12-slim`），需要完全一樣的位元組時再加上 digest（`python:3.12-slim@sha256:…`，DKR11 會再談）。' },
      ],
    },
    {
      id: 'dkr05-s-run', title: 'RUN：在建置時執行指令',
      blocks: [
        { type: 'p', text: 'RUN 在一個以「到目前為止的 Image」為檔案系統的建置容器裡執行指令，執行完把改變的檔案存成新的一層（layer）。`RUN 指令` 是 shell 形式，等於 `/bin/sh -c "指令"`，所以可以用 `&&`、`$變數`、管線；`RUN ["程式", "參數"]` 是 exec 形式，直接執行、不經過 Shell。RUN 只在 `docker build` 時執行一次，結果固定在 Image 裡；容器啟動時不會再跑。' },
        { type: 'p', text: '最常見的 RUN 是用 apt-get 安裝套件。官方的 Debian 與 Ubuntu 基底 Image 為了變小，刪掉了套件清單（/var/lib/apt/lists），所以直接 `apt-get install` 會找不到任何套件。正確的寫法是在同一個 RUN 裡依序做三件事：`apt-get update` 下載清單、`apt-get install -y` 安裝（建置時沒有人能回答 Y/n，所以一定要 `-y`；`--no-install-recommends` 不裝建議的額外套件）、`rm -rf /var/lib/apt/lists/*` 刪掉清單。長的 RUN 用行尾的 `\\` 換行。' },
        { type: 'example', id: 'dkr05-apt' },
        { type: 'p', text: '第一個建置在 `[2/2]` 失敗：`E: Unable to locate package curl`，apt-get 的結束碼 100 讓整個建置停止，BuildKit 印出那一步的最後幾行輸出，並在 Dockerfile 片段裡用 `>>>` 標出出錯的那一行。另外兩個 Dockerfile 都裝好了 curl，但大小差了快 20MB：split 版把更新、安裝、清理寫成三個 RUN，`docker history` 顯示 `apt-get update` 那一層有 19.3MB 的清單，後面的 `rm -rf` 只是新增一個 0B 的層、把檔案標成刪除，下面那一層的 19.3MB 仍然在 Image 裡。寫在同一個 RUN，清單在這一層結束前就刪了，從來沒有被存進任何一層。' },
        { type: 'p', text: '分開寫還有一個更隱蔽的問題：建置快取。Docker 依指令的文字判斷一步能不能重用上次的結果（DKR06 的主題）。`RUN apt-get update` 這行字永遠不變，所以幾個月後它仍然命中快取、用舊的清單；這時你在下一行加了一個新套件，安裝的就可能是過期的版本，甚至因為舊版已從鏡像站移除而失敗。update 與 install 寫在同一行，改了要裝的套件，整個 RUN 連同 update 一起重新執行。' },
        { type: 'callout', tone: 'tip', title: 'RUN 失敗時先讀最後幾行', text: 'BuildKit 的錯誤訊息很長，但結構固定：`#N ERROR:` 那一行說明是哪個程序以哪個結束碼失敗（apt-get 是 100、找不到指令是 127），`------` 之間是那一步最後的輸出，`Dockerfile:行號` 下面用 `>>>` 標出出錯的指令。失敗時不會產生 Image，`-t` 的標籤也不會移動。' },
      ],
    },
    {
      id: 'dkr05-s-files', title: 'COPY、WORKDIR、ENV、ARG 與 LABEL',
      blocks: [
        { type: 'p', text: '`COPY 來源… 目的地` 把建置內容裡的檔案或資料夾複製進 Image；來源相對於建置內容，不能用 `../` 跑到外面。目的地是相對路徑時，從當時的 WORKDIR 算起；複製好幾個來源時，目的地必須是以 `/` 結尾的資料夾（例如 `COPY report.py orders.csv ./`）。`--chown=使用者:群組` 可以順便改擁有者。' },
        { type: 'p', text: 'ADD 也能從建置內容複製，另外還會自動解開本機的 tar 壓縮檔，並能從網址下載。正因為它會「多做事」，官方的最佳實務建議一般情況一律用 COPY：讀 Dockerfile 的人一眼就知道只是複製；需要解開壓縮檔或下載時，才明確地用 ADD（或在 RUN 裡用 curl 下載並驗證 checksum）。模擬環境的 ADD 只支援複製本機的一般檔案。' },
        { type: 'p', text: 'WORKDIR 設定之後的 RUN、COPY、CMD、ENTRYPOINT 的工作目錄，資料夾不存在就建立，可以寫好幾次（相對路徑接在上一個 WORKDIR 後面）。python 這類基底 Image 沒有設定工作目錄，預設是 `/`。所以 WORKDIR 要寫在 COPY 之前：如果先 `COPY . .` 再 `WORKDIR /app`，程式碼被複製到根目錄 `/`，`/app` 卻是空的；容器啟動時 gunicorn 在 /app 找不到 app 模組，日誌印出 `ModuleNotFoundError: No module named \'app\'` 與 `Worker failed to boot`，以結束碼 3 結束。不要用 `RUN cd /app` 代替 WORKDIR：每個 RUN 是獨立的 Shell，cd 只在那一行有效。' },
        { type: 'table', head: ['', 'ENV', 'ARG'], rows: [
          ['寫法', '`ENV PYTHONUNBUFFERED=1`', '`ARG APP_VERSION=1.0`'],
          ['建置時', '之後的 RUN 看得到', '宣告之後的 RUN 看得到，可用 `docker build --build-arg APP_VERSION=1.1` 改值'],
          ['容器執行時', '有，寫在 Image 的設定裡，`docker run -e` 可以覆蓋', '沒有'],
          ['典型用途', '程式需要的設定：`PYTHONUNBUFFERED=1`（Python 不緩衝輸出，日誌立刻出現）、`PORT=5000`', '建置參數：版本號、要裝的套件版本'],
        ] },
        { type: 'p', text: 'ENV 與 ARG 都不適合放密碼：ENV 會留在 Image 的設定裡，任何拿到 Image 的人用 `docker image inspect` 就看得到；ARG 雖然不在執行環境，但使用它的 RUN 會把值記在 `docker history` 裡。密碼應該在執行時才給（`-e` 或之後課程的 secrets）。ENV 的舊寫法 `ENV 名稱 值`（中間是空白）仍然可用，但 BuildKit 會印出 LegacyKeyValueFormat 警告，請用 `名稱=值`。' },
        { type: 'p', text: 'LABEL 替 Image 加上中繼資料，例如 `LABEL org.opencontainers.image.title="board" org.opencontainers.image.version=$APP_VERSION`。`org.opencontainers.image.*` 是 OCI 規格建議的標準鍵名（title、version、source、licenses 等），工具與 Registry 會讀它們；值可以用 ARG 與 ENV 的變數。LABEL 不影響程式的執行，用 `docker image inspect -f \'{{.Config.Labels}}\'` 查看。' },
      ],
    },
    {
      id: 'dkr05-s-cmd', title: 'CMD、ENTRYPOINT 與 EXPOSE',
      blocks: [
        { type: 'p', text: 'CMD 與 ENTRYPOINT 都在容器啟動時才生效，決定主程式（PID 1）是什麼。兩者都有兩種寫法：exec 形式是 JSON 陣列，`CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]`，Docker 直接執行這個程式，字串要用雙引號；shell 形式是一般的文字，`CMD gunicorn --bind 0.0.0.0:5000 app:app`，Docker 會把它變成 `["/bin/sh", "-c", "gunicorn …"]`，讓 Shell 去執行。shell 形式可以展開 `$變數`，exec 形式不會（`["echo", "$HOME"]` 印出的就是 $HOME 這幾個字）。一個 Dockerfile 只有最後一個 CMD（與最後一個 ENTRYPOINT）有效。' },
        { type: 'p', text: '寫法的差別在 `docker stop`。stop 先送 SIGTERM 給容器的 PID 1，等 10 秒還沒結束就送 SIGKILL（結束碼 137）。exec 形式時 PID 1 就是 gunicorn，它收到 SIGTERM 會等處理中的請求完成再結束（結束碼 0）。shell 形式時 PID 1 是 `/bin/sh`，Docker 的文件說明這時程式不是 PID 1、收不到訊號：Shell 不會把 SIGTERM 轉送給它，程式沒有機會正常關閉，10 秒後被一起砍掉。有些 Shell 遇到單一指令會直接以 exec 取代自己，但這依 Shell 與指令的寫法而定，不能依賴。另外要知道，PID 1 在 Linux 上很特別：程式沒有自己處理 SIGTERM 時，預設動作不會套用在 PID 1 上，所以用 exec 形式之外，程式本身也要處理 SIGTERM（gunicorn、nginx 都有）。BuildKit 看到 shell 形式的 CMD 或 ENTRYPOINT，會在建置後印出 JSONArgsRecommended 警告。' },
        { type: 'table', head: ['Dockerfile', '`docker run IMAGE`', '`docker run IMAGE --name Mei`'], rows: [
          ['只有 `CMD ["python", "greet.py", "--name", "world"]`', '`python greet.py --name world`', '`--name Mei`：後面的字取代整個 CMD，`--name` 被當成程式名稱'],
          ['`ENTRYPOINT ["python", "greet.py"]` 加 `CMD ["--name", "world"]`', '`python greet.py --name world`', '`python greet.py --name Mei`：只取代 CMD，ENTRYPOINT 留著'],
          ['shell 形式的 `ENTRYPOINT python greet.py`', '`/bin/sh -c "python greet.py"`', '後面的參數與 CMD 都被忽略（它們變成 sh 的位置參數，指令裡沒有用到）'],
        ] },
        { type: 'p', text: '所以兩者的分工是：ENTRYPOINT 固定「這個 Image 就是這個程式」，CMD 提供「沒有指定時的預設參數」，使用者在 `docker run IMAGE` 後面寫的字取代 CMD。只有 CMD 的 Image 則像一般的環境，後面寫什麼就執行什麼（`docker run greet:cmd python greet.py --name Mei`）。要換掉 ENTRYPOINT 本身，`docker run` 有 `--entrypoint` 選項（模擬環境不支援）。下面的紀錄比較三種寫法：' },
        { type: 'example', id: 'dkr05-entrypoint' },
        { type: 'p', text: 'greet 的 ENTRYPOINT 是 `python greet.py`，所以 `--name Mei` 接在後面成為參數；greet:cmd 只有 CMD，`--name Mei` 取代了整個 CMD，runc 找不到名為 `--name` 的程式，結束碼 127，寫出完整的指令才行。shell 形式的 greet:shell 建置成功，但最後印出 1 個警告，`docker image inspect` 顯示它的 Cmd 是 `["/bin/sh","-c","python greet.py --name world"]`，Entrypoint 是 null。' },
        { type: 'p', text: '`EXPOSE 5000` 只是在 Image 的設定裡記下「程式會在 5000 埠監聽」：容器沒有用 `-p` 公開時，`docker ps` 的 PORTS 欄只寫 `5000/tcp`；`docker run -P`（大寫）會把所有 EXPOSE 的埠對應到主機上隨機的埠（模擬環境不支援 -P）。它不會在主機上開任何埠，也不會讓程式改聽 5000；程式聽哪個埠由程式自己決定（這裡是 gunicorn 的 `--bind`）。' },
        { type: 'callout', tone: 'warning', title: 'EXPOSE 不會公開連接埠', text: '常見的誤會是「Dockerfile 寫了 EXPOSE 5000，`docker run -d notes:1.0` 之後瀏覽器就能連 5000」。實際上沒有 `-p`，主機上沒有任何埠轉到容器，`curl localhost:5000` 得到 Failed to connect。EXPOSE 是寫給人與工具看的文件；真正公開連接埠的永遠是執行時的 `-p 主機埠:容器埠`，而且容器埠要和 EXPOSE、程式實際監聽的埠一致。' },
      ],
    },
    {
      id: 'dkr05-s-ignore-user', title: '.dockerignore 與 USER',
      blocks: [
        { type: 'p', text: '`COPY . .` 很方便，但「.」是整個建置內容：Git 的歷史（.git）、本機的虛擬環境（.venv）、編譯快取（__pycache__），還有最危險的 `.env`，裡面是本機開發用的密鑰與資料庫密碼。它們全部會被送給建置器、複製進 Image。之後任何能 `docker pull` 這個 Image 的人，用 `docker run --rm IMAGE cat .env` 就讀得到。' },
        { type: 'p', text: '`.dockerignore` 放在建置內容的根目錄，每行一個樣式，被符合的檔案不會傳給建置器：COPY 不到，也不會進入 Image。BuildKit 只傳送 COPY 與 ADD 用得到的檔案，`COPY . .` 用到整個資料夾，所以 .dockerignore 直接決定傳送多少。' },
        { type: 'table', head: ['樣式', '意思'], rows: [
          ['`.env`', '建置內容根目錄的 .env（開頭的 `/` 寫不寫都一樣）'],
          ['`.git`、`.venv`', '整個資料夾與裡面的一切'],
          ['`*.log`', '根目錄下副檔名 .log 的檔案（`*` 不跨過 `/`）'],
          ['`**/__pycache__`', '任何一層的 __pycache__ 資料夾'],
          ['`!keep.log`', '重新納入：前面排除了、但這個要留；最後一個符合的樣式決定結果'],
          ['`# 說明`', '註解'],
        ] },
        { type: 'p', text: 'Node.js 專案最典型的是 `node_modules`：相依套件應該在 Image 裡用 `npm ci` 依 lock 檔安裝，主機上的 node_modules 可能有為另一個作業系統編譯的原生模組，而且動輒數百 MB，傳送它只會讓每次建置變慢。Python 專案對應的是 .venv。' },
        { type: 'example', id: 'dkr05-ignore' },
        { type: 'p', text: '沒有 .dockerignore 時，`load .dockerignore` 只有 2B，建置內容是 14.56kB，Image 的 /app 裡有 .env、.git、.venv 與 __pycache__，`cat .env` 直接印出密鑰。加上四行的 .dockerignore 之後，建置內容剩 563B，Image 裡只剩程式需要的檔案，`cat .env` 找不到檔案。注意 .dockerignore 本身與 Dockerfile 仍然被複製了：它們沒有被排除，也不是秘密。' },
        { type: 'callout', tone: 'note', title: '在後面的 RUN 刪掉，密鑰還在', text: '`COPY . .` 之後再 `RUN rm .env` 救不回來：.env 已經存在 COPY 那一層裡，後面的層只是把它標成刪除，拿到 Image 的人仍然可以從那一層取出原本的內容（和 apt 清單的道理相同）。密鑰要在進入建置內容之前就排除。已經推送出去的 Image 若含有密鑰，要當作密鑰已外洩、立刻更換。' },
        { type: 'p', text: '沒有 USER 時，容器的主程式以 root（UID 0）執行。Docker 預設不會重新對應使用者（DKR01），容器裡的 root 就是主機核心眼中的 UID 0；namespace 與 capability 限制了它，但一旦程式有漏洞、又遇上設定錯誤或核心的漏洞，root 能造成的傷害大得多。所以服務類的 Image 應該建立一個一般帳號並切換過去：' },
        { type: 'list', items: [
          '`RUN useradd -r app`：在建置時建立系統帳號 app（`-r` 是系統帳號，UID 小於 1000；Alpine 的 BusyBox 改用 `adduser -S app`）。',
          '`USER app`：之後的 RUN 與容器的主程式都以 app 執行。通常寫在安裝套件、複製檔案之後，因為 apt-get 與寫入 /usr/local 需要 root。',
          'COPY 進來的檔案預設屬於 root、權限 644，app 讀得到但改不了；程式需要寫入的資料夾，用 `COPY --chown=app:app` 或 `RUN chown` 交給它。',
          '只寫 `USER app` 卻沒有建立帳號，建置可以成功，`docker run` 卻失敗：`unable to find user app: no matching entries in passwd file`，容器停在 Created。',
        ] },
        { type: 'p', text: '切換之後，`docker exec 容器 env` 看到的 HOME 是 /home/app；在主機上 `ps -e -o user,args` 會看到 gunicorn 的使用者是 999，而不是 root：主機的 /etc/passwd 裡沒有 app，所以只顯示 UID。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [MAIN, BROKEN, READY],
    examples: [
      {
        id: "dkr05-base", title: "比較基底 Image", machine: "dkr05-kiln",
        description: "本機已有 python:3.12-slim，再拉取 python:3.12-alpine 比較大小；兩者的 /etc/os-release 不同，Alpine 沒有 apt-get。",
        steps: [
          { command: "docker images python", output: "REPOSITORY   TAG         IMAGE ID       CREATED       SIZE\npython       3.12-slim   2f6dcae1cf7e   10 days ago   125MB" },
          { command: "docker pull python:3.12-alpine", output: "3.12-alpine: Pulling from library/python\n5697d329dea8: Pull complete\n5ef5a0e65e45: Pull complete\n528d638a9d61: Pull complete\n96eb67a1fd98: Pull complete\nd9da3de332a7: Pull complete\nDigest: sha256:ad97fcd6435daf4bbe2ffe98368645bee203e236fce7cf89ac328dc06140965d\nStatus: Downloaded newer image for python:3.12-alpine\ndocker.io/library/python:3.12-alpine" },
          { command: "docker images python", output: "REPOSITORY   TAG           IMAGE ID       CREATED       SIZE\npython       3.12-alpine   a634c19a6993   10 days ago   57.3MB\npython       3.12-slim     2f6dcae1cf7e   10 days ago   125MB" },
          { command: "docker run --rm python:3.12-slim grep PRETTY_NAME /etc/os-release", output: "PRETTY_NAME=\"Debian GNU/Linux 12 (bookworm)\"" },
          { command: "docker run --rm python:3.12-alpine grep PRETTY_NAME /etc/os-release", output: "PRETTY_NAME=\"Alpine Linux v3.21\"" },
          { command: "docker run --rm python:3.12-alpine apt-get --version; echo $?", output: "docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: \"apt-get\": executable file not found in $PATH: unknown.\n127" },
        ],
      },
      {
        id: "dkr05-build-run", title: "建置並執行 board", machine: "dkr05-kiln",
        description: "讀 board 的 Dockerfile，用 docker build -t 建置（BuildKit 的 plain 輸出），再以 -p 執行並用 curl 驗證；exec 形式的 gunicorn 收到 SIGTERM 後正常結束。",
        steps: [
          { command: "cd ../board", output: "" },
          { command: "cat Dockerfile", output: "# syntax=docker/dockerfile:1\nFROM python:3.12-slim\nARG APP_VERSION=1.0\nLABEL org.opencontainers.image.title=\"board\" org.opencontainers.image.version=$APP_VERSION\nENV PYTHONUNBUFFERED=1\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD [\"gunicorn\", \"--bind\", \"0.0.0.0:8000\", \"board:app\"]" },
          { command: "docker build -t board:1.0 .", output: "#0 building with \"default\" instance using docker driver\n\n#1 [internal] load build definition from Dockerfile\n#1 transferring dockerfile: 350B done\n#1 DONE 0.0s\n\n#2 [internal] load metadata for docker.io/library/python:3.12-slim\n#2 DONE 0.5s\n\n#3 [internal] load .dockerignore\n#3 transferring context: 2B done\n#3 DONE 0.0s\n\n#4 [1/5] FROM docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5\n#4 resolve docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5 done\n#4 DONE 0.0s\n\n#5 [internal] load build context\n#5 transferring context: 14.56kB done\n#5 DONE 0.0s\n\n#6 [2/5] WORKDIR /app\n#6 DONE 0.0s\n\n#7 [3/5] COPY requirements.txt .\n#7 DONE 0.0s\n\n#8 [4/5] RUN pip install --no-cache-dir -r requirements.txt\n#8 0.400 Collecting flask==3.0.3 (from -r requirements.txt (line 1))\n#8 0.700 Collecting werkzeug>=3.0.0 (from flask==3.0.3)\n#8 1.000 Collecting MarkupSafe>=2.1.1 (from werkzeug==3.1.3)\n#8 1.300 Collecting jinja2>=3.1.2 (from flask==3.0.3)\n#8 1.600 Collecting itsdangerous>=2.1.2 (from flask==3.0.3)\n#8 1.900 Collecting click>=8.1.3 (from flask==3.0.3)\n#8 2.200 Collecting blinker>=1.6.2 (from flask==3.0.3)\n#8 2.500 Collecting gunicorn==23.0.0 (from -r requirements.txt (line 2))\n#8 2.800 Collecting packaging (from gunicorn==23.0.0)\n#8 3.100 Installing collected packages: MarkupSafe, werkzeug, jinja2, itsdangerous, click, blinker, flask, packaging, gunicorn\n#8 3.400 Successfully installed blinker-1.9.0 click-8.1.7 flask-3.0.3 gunicorn-23.0.0 itsdangerous-2.2.0 jinja2-3.1.4 MarkupSafe-3.0.2 packaging-24.2 werkzeug-3.1.3\n#8 DONE 3.8s\n\n#9 [5/5] COPY . .\n#9 DONE 0.0s\n\n#10 exporting to image\n#10 exporting layers 0.4s done\n#10 writing image sha256:8abe3b0efdd517ecb6533bb7a84330aa53fc1684e1553e702e48227036f3c084 done\n#10 naming to docker.io/library/board:1.0 done\n#10 DONE 0.4s" },
          { command: "docker images board", output: "REPOSITORY   TAG       IMAGE ID       CREATED                  SIZE\nboard        1.0       8abe3b0efdd5   Less than a second ago   128MB" },
          { command: "docker run -d --name board -p 8000:8000 board:1.0", output: "000d4d26cfb23f77b092b04d9f71336c9bcd1f703fadb925dbd66ba94828f6b6" },
          { command: "curl -s localhost:8000", output: "留言板運作中" },
          { command: "docker ps --format '{{.Names}} {{.Command}} {{.Ports}}'", output: "board \"gunicorn --bind 0.0…\" 0.0.0.0:8000->8000/tcp, :::8000->8000/tcp" },
          { command: "docker logs board", output: "[2026-11-22 10:00:00 +0000] [1] [INFO] Starting gunicorn 23.0.0\n[2026-11-22 10:00:00 +0000] [1] [INFO] Listening at: http://0.0.0.0:8000 (1)\n[2026-11-22 10:00:00 +0000] [1] [INFO] Using worker: sync\n[2026-11-22 10:00:00 +0000] [7] [INFO] Booting worker with pid: 7" },
          { command: "docker image inspect -f '{{.Config.Labels}}' board:1.0", output: "map[org.opencontainers.image.title:board org.opencontainers.image.version:1.0]" },
          { command: "docker stop board", output: "board" },
          { command: "docker ps -a --format '{{.Names}} {{.Status}}'", output: "board Exited (0) Less than a second ago" },
        ],
      },
      {
        id: "dkr05-apt", title: "apt-get 寫在同一個 RUN", machine: "dkr05-kiln",
        description: "沒有 apt-get update 的安裝失敗；把更新、安裝、清理分成三個 RUN 和寫在同一個 RUN 的 Image 大小不同。",
        steps: [
          { command: "cd ../lab", output: "" },
          { command: "cat Dockerfile.noupdate", output: "FROM python:3.12-slim\nRUN apt-get install -y curl" },
          { command: "docker build -f Dockerfile.noupdate -t tools:broken .", output: "#0 building with \"default\" instance using docker driver\n\n#1 [internal] load build definition from Dockerfile.noupdate\n#1 transferring dockerfile: 50B done\n#1 DONE 0.0s\n\n#2 [internal] load metadata for docker.io/library/python:3.12-slim\n#2 DONE 0.5s\n\n#3 [internal] load .dockerignore\n#3 transferring context: 2B done\n#3 DONE 0.0s\n\n#4 [1/2] FROM docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5\n#4 resolve docker.io/library/python:3.12-slim@sha256:4d149e714356bd8635b7a0269e2e6179b38d77ae054fdd2915a537de312deac5 done\n#4 DONE 0.0s\n\n#5 [2/2] RUN apt-get install -y curl\n#5 0.120 Reading package lists...\n#5 0.140 Building dependency tree...\n#5 0.160 Reading state information...\n#5 0.180 E: Unable to locate package curl\n#5 ERROR: process \"/bin/sh -c apt-get install -y curl\" did not complete successfully: exit code: 100\n\n------\n > [2/2] RUN apt-get install -y curl:\n0.120 Reading package lists...\n0.140 Building dependency tree...\n0.160 Reading state information...\n0.180 E: Unable to locate package curl\n------\nDockerfile.noupdate:2\n--------------------\n   1 |     FROM python:3.12-slim\n   2 | >>> RUN apt-get install -y curl\n   3 |     \n--------------------\nERROR: failed to solve: process \"/bin/sh -c apt-get install -y curl\" did not complete successfully: exit code: 100" },
          { command: "cat Dockerfile.onerun", output: "FROM python:3.12-slim\nRUN apt-get update && \\\n    apt-get install -y --no-install-recommends curl && \\\n    rm -rf /var/lib/apt/lists/*" },
          { command: "docker build -q -f Dockerfile.split -t tools:split .", output: "sha256:4941be82c7a8de9cccfeea2de5f26ec26ead9d995458625053779f80df1a8b0f" },
          { command: "docker build -q -f Dockerfile.onerun -t tools:onerun .", output: "sha256:43187b3348b592fb29a78a0b680141f2e4280f337e5dc31db860677562351aab" },
          { command: "docker images tools", output: "REPOSITORY   TAG       IMAGE ID       CREATED                  SIZE\ntools        onerun    43187b3348b5   Less than a second ago   126MB\ntools        split     4941be82c7a8   Less than a second ago   145MB" },
          { command: "docker history --format '{{.Size}}\t{{.CreatedBy}}' tools:split | head -n 3", output: "0B\tRUN /bin/sh -c rm -rf /var/lib/apt/lists/* #…\n1.6MB\tRUN /bin/sh -c apt-get install -y curl # bui…\n19.3MB\tRUN /bin/sh -c apt-get update # buildkit" },
          { command: "docker history --format '{{.Size}}\t{{.CreatedBy}}' tools:onerun | head -n 1", output: "1.6MB\tRUN /bin/sh -c apt-get update &&     apt-get…" },
        ],
      },
      {
        id: "dkr05-entrypoint", title: "ENTRYPOINT 加上 CMD", machine: "dkr05-kiln",
        description: "ENTRYPOINT 固定程式、CMD 提供預設參數；只有 CMD 時 docker run 後面的字取代整個 CMD；shell 形式的 CMD 讓建置印出警告，Cmd 變成 /bin/sh -c。",
        steps: [
          { command: "cd ../greet", output: "" },
          { command: "cat Dockerfile", output: "FROM python:3.12-slim\nWORKDIR /app\nCOPY greet.py .\nENTRYPOINT [\"python\", \"greet.py\"]\nCMD [\"--name\", \"world\"]" },
          { command: "docker build -q -t greet .", output: "sha256:167328205610345c1b96ff8029de29613209158f3eb8a16fb1828a6ef72e6b39" },
          { command: "docker run --rm greet", output: "Hello, world!" },
          { command: "docker run --rm greet --name Mei", output: "Hello, Mei!" },
          { command: "docker build -q -f Dockerfile.cmd -t greet:cmd .", output: "sha256:fb26700760a8827324c0d721866885a67c17ef61f63ccd8915ff3d6458ba241d" },
          { command: "docker run --rm greet:cmd --name Mei; echo $?", output: "docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: \"--name\": executable file not found in $PATH: unknown.\n127" },
          { command: "docker run --rm greet:cmd python greet.py --name Mei", output: "Hello, Mei!" },
          { command: "docker build -f Dockerfile.shell -t greet:shell . 2>&1 | tail -n 2", output: " 1 warning found (use docker --debug to expand):\n - JSONArgsRecommended: JSON arguments recommended for CMD to prevent unintended behavior related to OS signals (line 4)" },
          { command: "docker image inspect -f '{{json .Config.Entrypoint}} {{json .Config.Cmd}}' greet greet:cmd greet:shell", output: "[\"python\",\"greet.py\"] [\"--name\",\"world\"]\nnull [\"python\",\"greet.py\",\"--name\",\"world\"]\nnull [\"/bin/sh\",\"-c\",\"python greet.py --name world\"]" },
        ],
      },
      {
        id: "dkr05-ignore", title: ".dockerignore 擋住密鑰", machine: "dkr05-kiln",
        description: "沒有 .dockerignore 時 COPY . . 把 .env、.git、.venv 都複製進 Image；加上 .dockerignore 之後建置內容變小，Image 裡也沒有 .env。",
        steps: [
          { command: "cd ../board", output: "" },
          { command: "docker build -t board:1.0 . 2>&1 | grep 'transferring context'", output: "#3 transferring context: 2B done\n#5 transferring context: 14.56kB done" },
          { command: "docker run --rm board:1.0 ls -a", output: ".\n..\n.env\n.git\n.venv\nDockerfile\nREADME.md\n__pycache__\nboard.py\nrequirements.txt" },
          { command: "docker run --rm board:1.0 cat .env", output: "SECRET_KEY=local-dev-b81e04\nDATABASE_URL=postgres://board:devpass@localhost:5432/board" },
          { command: "printf '.git\\n.venv\\n__pycache__\\n.env\\n' > .dockerignore", output: "" },
          { command: "docker build -t board:1.1 . 2>&1 | grep 'transferring context'", output: "#3 transferring context: 28B done\n#5 transferring context: 563B done" },
          { command: "docker run --rm board:1.1 ls -a", output: ".\n..\n.dockerignore\nDockerfile\nREADME.md\nboard.py\nrequirements.txt" },
          { command: "docker run --rm board:1.1 cat .env; echo $?", output: "cat: .env: No such file or directory\n1" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr05-write', title: '替 notes 寫 Dockerfile', machine: 'dkr05-kiln',
        statement: '替 ~/notes 的 Flask 應用寫 `~/notes/Dockerfile`：基底用 `python:3.12-slim`，工作目錄 `/app`，先複製 `requirements.txt` 並以 `pip install --no-cache-dir -r requirements.txt` 安裝，再複製其餘檔案，宣告容器的 5000 埠，主程式以 exec 形式執行 `gunicorn --bind 0.0.0.0:5000 app:app`。建置成 `notes:1.0`，在背景啟動名為 `notes` 的容器、把主機的 5000 埠對應到容器的 5000 埠，最後用 `curl` 確認首頁。終端機沒有編輯器：用 `printf \'第一行\\n第二行\\n\' > Dockerfile` 寫檔，`cat Dockerfile` 檢查。',
        checks: [
          { kind: 'image', name: 'notes:1.0', env: 'PYTHON_VERSION=3.12.7', workdir: '/app', port: 5000, cmd: ['gunicorn', '--bind', '0.0.0.0:5000', 'app:app'] },
          { kind: 'container', name: 'notes', state: 'running', image: 'notes:1.0', port: '5000:5000' },
          NOTES_HTTP,
        ],
        solution: [write('Dockerfile', NOTES_DOCKERFILE), 'docker build -t notes:1.0 .', 'docker run -d --name notes -p 5000:5000 notes:1.0', 'curl -s localhost:5000'],
        mistakes: [
          { commands: [write('Dockerfile', NOTES_DOCKERFILE.replace('python:3.12-slim', 'python')), 'docker build -t notes:1.0 .', 'docker run -d --name notes -p 5000:5000 notes:1.0'], why: '`FROM python` 就是 python:latest：基底變成 Python 3.13、約 1GB 的完整版，不是題目要的 3.12-slim，日後還會隨 latest 移動' },
          { commands: [write('Dockerfile', NOTES_DOCKERFILE.replace(EXEC_CMD, SHELL_CMD)), 'docker build -t notes:1.0 .', 'docker run -d --name notes -p 5000:5000 notes:1.0'], why: 'shell 形式的 CMD 讓 Image 的 Cmd 變成 /bin/sh -c "gunicorn …"，PID 1 是 Shell，docker stop 的 SIGTERM 不一定送得到 gunicorn' },
          { commands: [write('Dockerfile', 'FROM python:3.12-slim\nCOPY . .\nRUN pip install --no-cache-dir -r requirements.txt\nWORKDIR /app\nEXPOSE 5000\n' + EXEC_CMD + '\n'), 'docker build -t notes:1.0 .', 'docker run -d --name notes -p 5000:5000 notes:1.0'], why: 'COPY 寫在 WORKDIR 之前：檔案被複製到 /，/app 是空的，gunicorn 找不到 app 模組，容器以結束碼 3 結束' },
          { commands: [write('Dockerfile', NOTES_DOCKERFILE), 'docker build -t notes:1.0 .', 'docker run -d --name notes notes:1.0', 'curl localhost:5000'], why: '以為 EXPOSE 5000 就公開了連接埠：沒有 -p，主機的 5000 沒有人在聽，curl 連不上' },
        ],
        hints: [
          '指令的順序：FROM、WORKDIR、COPY requirements.txt、RUN pip install、COPY . .、EXPOSE、CMD。',
          'exec 形式的 CMD 是 JSON 陣列，每個字一個雙引號字串：`CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]`；整段用單引號包住交給 printf。',
          '建置用 `docker build -t notes:1.0 .`，執行用 `docker run -d --name notes -p 5000:5000 notes:1.0`。',
        ],
        explanation: 'Dockerfile 由 `python:3.12-slim` 開始，WORKDIR /app 讓之後的相對路徑都在 /app；先複製 requirements.txt 再 pip install，最後 `COPY . .` 複製程式碼（DKR06 會說明這個順序讓改程式碼時不必重裝套件）。EXPOSE 5000 只是記錄，exec 形式的 CMD 讓 gunicorn 成為 PID 1。`docker build -t notes:1.0 .` 以目前的資料夾為建置內容，`-p 5000:5000` 才真正把主機的 5000 轉到容器。寫成 `FROM python` 會拿到 latest 的 3.13；shell 形式的 CMD 檢查不通過；先 COPY 再 WORKDIR，程式不在 /app；少了 `-p` 連不進去。這個 Image 還把 .env 也複製進去了，第三個練習會處理。',
      },
      {
        id: 'dkr05-fix', title: '修好建置失敗的 Dockerfile', machine: 'dkr05-broken',
        statement: '`docker build -t notes:1.1 .` 在 ~/notes 失敗了（先執行一次，讀錯誤訊息）。修好 `~/notes/Dockerfile`：把安裝 curl 的那一行改成在同一個 RUN 裡先 `apt-get update`、再安裝、最後 `rm -rf /var/lib/apt/lists/*`（不要另外加 RUN 指令，也不要拿掉 curl），並把最後一行的 CMD 改成 exec 形式。建置成 `notes:1.1`，在背景啟動名為 `notes` 的容器（主機的 5000 對應容器的 5000），用 `curl` 確認首頁。',
        checks: [
          { kind: 'image', name: 'notes:1.1', cmd: ['gunicorn', '--bind', '0.0.0.0:5000', 'app:app'], layers: 9 },
          { kind: 'container', name: 'notes', state: 'running', image: 'notes:1.1', port: '5000:5000' },
          NOTES_HTTP,
        ],
        solution: [write('Dockerfile', NOTES_FIXED), 'docker build -t notes:1.1 .', 'docker run -d --name notes -p 5000:5000 notes:1.1', 'curl -s localhost:5000'],
        mistakes: [
          { commands: [write('Dockerfile', NOTES_FIXED.replace('RUN apt-get update && apt-get install', 'RUN apt-get update\nRUN apt-get install')), 'docker build -t notes:1.1 .', 'docker run -d --name notes -p 5000:5000 notes:1.1'], why: 'update 另寫一個 RUN：19MB 的套件清單留在它自己的層裡，之後的 rm 刪不掉，而且這一步會一直命中快取、用到過期的清單（Image 多了一層）' },
          { commands: [write('Dockerfile', NOTES_FIXED.replace(EXEC_CMD, SHELL_CMD)), 'docker build -t notes:1.1 .', 'docker run -d --name notes -p 5000:5000 notes:1.1'], why: '只修了 apt-get，CMD 仍是 shell 形式，主程式是 /bin/sh -c' },
          { commands: [write('Dockerfile', NOTES_FIXED.replace(/RUN apt-get update[^\n]*\n/, '')), 'docker build -t notes:1.1 .', 'docker run -d --name notes -p 5000:5000 notes:1.1'], why: '把安裝 curl 的那一行刪掉雖然建得起來，但 Image 裡沒有題目要的 curl（少了一層）' },
        ],
        hints: [
          '錯誤是 `E: Unable to locate package curl`：基底 Image 沒有套件清單，要先 `apt-get update`。',
          '同一個 RUN 用 `&&` 串起三件事：`apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*`。',
          '整個 Dockerfile 用 printf 重寫一次最簡單，寫完 `cat Dockerfile` 檢查，再重新建置。',
        ],
        explanation: '官方的 Debian 基底 Image 刪掉了 apt 的套件清單，沒有 `apt-get update` 就 `apt-get install`，apt-get 以 100 結束，建置停在那一步，也不會產生 notes:1.1。把 update、install 與清理寫在同一個 RUN：清單在這一層結束前就刪掉，不會留在任何一層；改了套件時 update 也一起重跑。CMD 改成 `["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]`，gunicorn 成為 PID 1，收得到 docker stop 的 SIGTERM。修好之後 Image 有 9 層（基底的 4 層加上 WORKDIR、apt、兩個 COPY 與 pip install），另寫 RUN 會多一層，刪掉 curl 則少一層。',
      },
      {
        id: 'dkr05-ignore-secret', title: '用 .dockerignore 擋住 .env', machine: 'dkr05-ready',
        statement: '~/notes 的 Dockerfile 用 `COPY . .` 複製整個資料夾，連 `.env`（本機的密鑰）、`.git`、`.venv` 與 `__pycache__` 都進了 Image。新增 `~/notes/.dockerignore`，排除這四項（只排除這四項：Dockerfile 與 .dockerignore 本身照樣複製），建置成 `notes:1.2`，再用 `docker run --rm notes:1.2 ls -a /app` 列出 Image 裡 /app 的內容。.env 本機開發還要用，不能刪掉或修改。',
        checks: [
          { kind: 'exists', path: '/home/mei/notes/.dockerignore', type: 'file' },
          { kind: 'unchanged', path: '/home/mei/notes/.env' },
          { kind: 'image', name: 'notes:1.2' },
          { kind: 'output', fromCommand: '^(sudo )?docker (run|container run) ' },
        ],
        solution: [write('.dockerignore', IGNORE), 'docker build -t notes:1.2 .', 'docker run --rm notes:1.2 ls -a /app'],
        mistakes: [
          { commands: ['rm .env', 'docker build -t notes:1.2 .', 'docker run --rm notes:1.2 ls -a /app'], why: '把 .env 刪掉了：本機開發還要用它，該做的是讓建置內容排除它' },
          { commands: [write('.dockerignore', '.env\n'), 'docker build -t notes:1.2 .', 'docker run --rm notes:1.2 ls -a /app'], why: '只排除了 .env，.git、.venv、__pycache__ 仍然被送進建置內容並複製進 Image' },
          { commands: [write('../.dockerignore', IGNORE), 'docker build -t notes:1.2 .', 'docker run --rm notes:1.2 ls -a /app'], why: '.dockerignore 寫在 ~ 而不是建置內容（~/notes）的根目錄，建置時根本不會讀它' },
          { commands: [write('.dockerignore', IGNORE), 'docker run --rm notes:1.2 ls -a /app'], why: '寫好 .dockerignore 卻沒有重新建置，本機還沒有 notes:1.2' },
        ],
        variants: [{ label: '多了 templates 資料夾的 notes', files: [dir('/home/mei/notes/templates'), file('/home/mei/notes/templates/index.html', '<h1>筆記</h1>\n')] }],
        hints: [
          '`.dockerignore` 和 Dockerfile 放在同一個資料夾（建置內容的根目錄），每行一個樣式。',
          '`printf \'.env\\n.git\\n.venv\\n__pycache__\\n\' > .dockerignore`，再 `cat .dockerignore` 確認。',
          '改了 .dockerignore 要重新 `docker build -t notes:1.2 .`，Image 才會不一樣。',
        ],
        explanation: '.dockerignore 讓這四項不進入建置內容，`COPY . .` 就複製不到它們，Image 的 /app 只剩 .dockerignore、Dockerfile、README.md、app.py 與 requirements.txt（有 templates 資料夾的那台也照樣複製它），建置內容也小了很多。刪掉 .env 會破壞本機開發；只排除 .env 還留著 Git 歷史與虛擬環境；放在上一層的 .dockerignore 不會被讀到；沒有重新建置，Image 就還是舊的（這台甚至還沒有 notes:1.2）。',
      },
      {
        id: 'dkr05-non-root', title: '讓 notes 以非 root 執行', machine: 'dkr05-ready',
        statement: '讓 notes 的容器不再以 root 執行：修改 `~/notes/Dockerfile`，在建置時用 `useradd -r app` 建立系統帳號 app，並在 CMD 之前用 USER 切換成它（安裝與複製仍以 root 進行）。建置成 `notes:1.3`，在背景啟動名為 `notes` 的容器（主機的 5000 對應容器的 5000），用 `curl` 確認首頁。',
        checks: [
          { kind: 'image', name: 'notes:1.3', user: 'app' },
          { kind: 'container', name: 'notes', state: 'running', image: 'notes:1.3', port: '5000:5000' },
          NOTES_HTTP,
        ],
        solution: [write('Dockerfile', NOTES_USER), 'docker build -t notes:1.3 .', 'docker run -d --name notes -p 5000:5000 notes:1.3', 'curl -s localhost:5000'],
        mistakes: [
          { commands: [write('Dockerfile', NOTES_USER.replace('RUN useradd -r app\n', '')), 'docker build -t notes:1.3 .', 'docker run -d --name notes -p 5000:5000 notes:1.3'], why: '只寫了 USER app 而沒有建立帳號：建置成功，但 docker run 找不到 app 這個使用者，容器停在 Created' },
          { commands: [write('Dockerfile', NOTES_USER.replace('FROM python:3.12-slim\nRUN useradd -r app\n', 'FROM python:3.12-slim\nUSER app\nRUN useradd -r app\n').replace('USER app\nEXPOSE', 'EXPOSE')), 'docker build -t notes:1.3 .'], why: 'USER app 寫在 useradd 之前：建立帳號的 RUN 已經要以 app 執行，帳號卻還不存在，建置失敗' },
          { commands: [write('Dockerfile', NOTES_USER.replace('USER app\n', '')), 'docker build -t notes:1.3 .', 'docker run -d --name notes -p 5000:5000 notes:1.3'], why: '建立了帳號卻沒有用 USER 切換，主程式仍以 root 執行' },
        ],
        hints: [
          '`RUN useradd -r app` 要寫在 USER 之前，例如緊接在 FROM 之後；USER 寫在 CMD 之前。',
          'pip install 要寫入 /usr/local，所以 USER app 放在安裝與 COPY 之後。',
          '`docker image inspect -f \'{{.Config.User}}\' notes:1.3` 應該印出 app。',
        ],
        explanation: '`RUN useradd -r app` 在 Image 的 /etc/passwd 加上系統帳號 app，`USER app` 讓之後的步驟與容器的主程式都以它執行；它寫在 pip install 與 COPY 之後，安裝套件時仍是 root。COPY 進來的程式碼屬於 root、權限 644，app 讀得到，gunicorn 照常在 5000 服務，主機的 ps 看到它的使用者是 UID 999。只有 USER 沒有帳號，docker run 回報 unable to find user；USER 寫在 useradd 之前，連建置都失敗；只建帳號不切換，等於沒做。',
      },
      {
        id: 'dkr05-entrypoint-cmd', title: '用 ENTRYPOINT 固定報表程式', machine: 'dkr05-kiln',
        statement: '~/report 的報表工具 Dockerfile 只寫了 `CMD ["python", "report.py", "--format", "text"]`，所以 `docker run --rm report:1.0 --format json` 會失敗。改寫 `~/report/Dockerfile`：用 ENTRYPOINT 固定 `python report.py`，用 CMD 提供預設參數 `--format text`（兩者都用 exec 形式），建置成 `report:1.0`，再用 `docker run --rm report:1.0 --format json` 印出 JSON 格式的報表。',
        checks: [
          { kind: 'image', name: 'report:1.0', entrypoint: ['python', 'report.py'], cmd: ['--format', 'text'] },
          { kind: 'output', fromCommand: '^(sudo )?docker (run|container run) ' },
        ],
        solution: ['cd ../report', write('Dockerfile', REPORT_FIXED), 'docker build -t report:1.0 .', 'docker run --rm report:1.0 --format json'],
        mistakes: [
          { commands: ['cd ../report', 'docker build -t report:1.0 .', 'docker run --rm report:1.0 --format json'], why: 'Dockerfile 沒改：只有 CMD 時 `--format json` 取代整個 CMD，Docker 去找一個叫 --format 的程式（127）' },
          { commands: ['cd ../report', write('Dockerfile', REPORT_FIXED.replace('ENTRYPOINT ["python", "report.py"]\nCMD ["--format", "text"]', 'ENTRYPOINT ["python", "report.py", "--format", "text"]')), 'docker build -t report:1.0 .', 'docker run --rm report:1.0 --format json'], why: '預設參數寫死在 ENTRYPOINT 裡：這次 argparse 剛好取最後一個 --format，但預設值不能再被 CMD 換掉，也不是題目要的分工' },
          { commands: ['cd ../report', write('Dockerfile', REPORT_FIXED), 'docker build -t report:1.0 .', 'docker run --rm report:1.0'], why: '沒有加參數，印出的是預設的文字格式，不是 JSON' },
        ],
        variants: [{
          label: '前一天有 57 筆訂單的 orders.csv', files: [file('/home/mei/report/orders.csv', ORDERS([['2026-11-20', 42, 18960], ['2026-11-21', 57, 24310]]))],
          docker: { images: IMAGES, programs: programs(reportPrograms('2026-11-21', 57, 24310)) },
        }],
        hints: [
          'ENTRYPOINT 放不變的部分：`ENTRYPOINT ["python", "report.py"]`。',
          'CMD 放可以被換掉的預設參數：`CMD ["--format", "text"]`。',
          '`docker run --rm report:1.0 --format json` 後面的字取代 CMD，接在 ENTRYPOINT 後面。',
        ],
        explanation: 'ENTRYPOINT `["python", "report.py"]` 讓這個 Image 就是報表程式，CMD `["--format", "text"]` 是沒有指定時的預設參數；`docker run --rm report:1.0` 執行 `python report.py --format text`，`docker run --rm report:1.0 --format json` 只取代 CMD，執行 `python report.py --format json`，印出 orders.csv 最後一天的 JSON（另一台機器的資料不同，答案也不同）。只有 CMD 時參數會取代整個指令；把 `--format text` 寫進 ENTRYPOINT，預設值就無法再用 CMD 調整。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr05-q1', prompt: 'Dockerfile 裡寫了 `RUN apt-get update` 與下一行的 `RUN apt-get install -y curl`。和寫成一行 `RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*` 相比，分開寫的主要問題是什麼？',
      options: ['兩個 RUN 不能連續寫，建置會失敗', '第二個 RUN 看不到第一個 RUN 下載的套件清單', 'update 那一步之後會一直命中快取而用到過期的清單，清單也永遠留在那一層讓 Image 變大', '分開寫時 apt-get 一定要加 `--no-install-recommends`'],
      answer: 2,
      explanation: '`RUN apt-get update` 的文字不變，之後的建置都命中快取，新加的套件可能裝到過期版本；它下載的清單存在自己的層裡，後面再刪也只是標成刪除。RUN 可以連續寫，後面的步驟也看得到前面的檔案（建置才會成功）；`--no-install-recommends` 是減少套件的選擇，和分不分開無關。',
    },
    {
      id: 'dkr05-q2', prompt: 'Image 的 Dockerfile 是 `ENTRYPOINT ["python", "greet.py"]` 與 `CMD ["--name", "world"]`。執行 `docker run --rm greet --name Kai` 時，容器實際執行的是什麼？',
      options: ['`python greet.py --name Kai`', '`python greet.py --name world --name Kai`', '`--name Kai`', '`python greet.py --name world`，後面的參數被忽略'],
      answer: 0,
      explanation: 'Image 名稱後面的字取代 CMD，接在 ENTRYPOINT 後面，所以是 `python greet.py --name Kai`。CMD 是被取代而不是被附加；只有沒有 ENTRYPOINT 時，後面的字才會取代整個指令變成 `--name Kai`；參數被忽略是 shell 形式 ENTRYPOINT 的行為，這裡是 exec 形式。',
    },
    {
      id: 'dkr05-q3', prompt: 'notes:1.0 的 Dockerfile 有 `EXPOSE 5000`。執行 `docker run -d --name notes notes:1.0` 之後，主機上的 `curl localhost:5000` 會怎樣？',
      options: ['得到應用的首頁，EXPOSE 已經把 5000 公開了', '連不上：EXPOSE 只是說明，沒有 `-p 5000:5000` 主機上沒有埠轉到容器', '得到首頁，但只能用 IPv6 連', '要先 `docker restart notes` 讓 EXPOSE 生效'],
      answer: 1,
      explanation: 'EXPOSE 只在 Image 的設定裡記下程式監聽的埠，不在主機上開任何埠；公開要在 docker run 時加 `-p`（或 `-P` 對應到隨機埠）。所以 curl 是 Failed to connect，和 IPv6 無關，重新啟動容器也不會讓沒有的對應出現。',
    },
    {
      id: 'dkr05-q4', prompt: '為什麼服務類 Image 的 CMD 建議寫成 exec 形式 `CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]`，而不是 `CMD gunicorn --bind 0.0.0.0:5000 app:app`？',
      options: ['exec 形式讓 Image 比較小', 'exec 形式的建置比較快', 'exec 形式才能在指令裡使用 `$PORT` 這類變數', '程式直接成為 PID 1，docker stop 的 SIGTERM 送得到它，可以正常關閉'],
      answer: 3,
      explanation: 'shell 形式的 PID 1 是 /bin/sh，SIGTERM 不一定轉送給程式，10 秒後被 SIGKILL；exec 形式的程式就是 PID 1，直接收到訊號。兩種寫法都不改變 Image 的大小或建置速度；變數展開反而是 shell 形式才有，exec 形式不經過 Shell，`$PORT` 會原樣傳給程式。',
    },
    {
      id: 'dkr05-q5', prompt: '專案資料夾裡的 `.env` 有本機的資料庫密碼，Dockerfile 用 `COPY . .`。下列哪一個做法能讓密碼不進入 Image？',
      options: ['在 Dockerfile 最後加 `RUN rm .env`', '在建置內容根目錄的 `.dockerignore` 寫一行 `.env`，再重新建置', '把 `.dockerignore` 放到 `/etc/docker/`', '把 `COPY . .` 改成 `ADD . .`，ADD 會自動略過隱藏檔'],
      answer: 1,
      explanation: '.dockerignore 讓 .env 不被送給建置器，COPY 拿不到它，Image 裡就沒有。RUN rm 只是在新的層把它標成刪除，COPY 那一層仍保有內容；.dockerignore 只在建置內容的根目錄才有效；ADD 和 COPY 一樣會複製隱藏檔，還多了解壓縮與下載的行為。',
    },
    {
      id: 'dkr05-q6', prompt: '把 `FROM python:3.12-slim` 簡寫成 `FROM python` 會有什麼後果？',
      options: ['兩者完全相同，latest 永遠指向最穩定的版本', '建置失敗，FROM 一定要寫標籤', '等於 `python:latest`：標籤會隨新版本移動，同一個 Dockerfile 日後可能建出不同的 Python 版本，而且是約 1GB 的完整版', '會自動選擇 Docker Hub 上最小的變體'],
      answer: 2,
      explanation: '沒寫標籤就是 latest，而 latest 只是指向最新版本的標籤，會移動，也不是 slim。latest 不保證穩定；不寫標籤不會失敗，只是預設成 latest；Docker 不會替你挑選最小的變體，要自己寫 `-slim` 或 `-alpine`。',
    },
    {
      id: 'dkr05-q7', prompt: 'Dockerfile 先寫 `COPY . .` 再寫 `WORKDIR /app`，CMD 是 `["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]`。容器啟動後立刻結束，日誌有 `No module named \'app\'`。原因是什麼？',
      options: ['COPY 時工作目錄還是 `/`，檔案被複製到根目錄，gunicorn 卻在空的 /app 裡找 app 模組', 'WORKDIR 會刪掉之前複製的檔案', 'gunicorn 不能在 /app 這個目錄執行', '`COPY . .` 不會複製 .py 檔'],
      answer: 0,
      explanation: '基底沒有設定工作目錄，COPY 的目的地 `.` 是 `/`；之後的 WORKDIR /app 建立了一個空資料夾，主程式在那裡找不到 app.py。WORKDIR 不會刪除任何檔案；gunicorn 可以在任何目錄執行；`COPY . .` 會複製建置內容裡所有沒被排除的檔案，包括 .py。',
    },
  ],
};

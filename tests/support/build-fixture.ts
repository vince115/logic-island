import type { TerminalExercise, TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import { IMAGES } from './docker-fixture';

/*
 * A synthetic machine for engine stage E21 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §11), only for tests: build-01,
 * an Ubuntu host with Docker CE (the images profile) where learner is in the docker group. python:3.12-slim is pulled
 * (with an apt table and a pip table), node:20-slim is only on the simulated Docker Hub (an npm table), and the E20
 * images (nginx, alpine…) are there too. ~/app is a Flask application with a Dockerfile that copies the source before
 * installing the requirements (the cache lesson's starting point); a program declares what `python app.py` does.
 */
const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const PATH_ENV = 'PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

export const PYTHON: TerminalImage = {
  name: 'python:3.12-slim', size: 124_500_000, created: '2026-11-12 03:00:00', cmd: ['python3'], pulled: true,
  env: [PATH_ENV, 'LANG=C.UTF-8', 'GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305', 'PYTHON_VERSION=3.12.7'],
  osRelease: 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n',
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
    apt: [{ name: 'curl', version: '7.88.1-10+deb12u8', size: 500_000, depends: ['libcurl4'] }, { name: 'libcurl4', version: '7.88.1-10+deb12u8', size: 1_100_000, files: [{ path: '/usr/lib/x86_64-linux-gnu/libcurl.so.4', content: '' }] },
      { name: 'git', version: '1:2.39.5-0+deb12u1', size: 38_000_000 }],
    pip: [
      { name: 'flask', version: '3.0.3', size: 360_000, depends: ['werkzeug>=3.0.0', 'jinja2>=3.1.2', 'itsdangerous>=2.1.2', 'click>=8.1.3', 'blinker>=1.6.2'] },
      { name: 'werkzeug', version: '3.1.3', size: 900_000, depends: ['MarkupSafe>=2.1.1'] }, { name: 'jinja2', version: '3.1.4', size: 800_000, depends: ['MarkupSafe>=2.0'] },
      { name: 'MarkupSafe', version: '3.0.2', size: 50_000 }, { name: 'itsdangerous', version: '2.2.0', size: 60_000 }, { name: 'click', version: '8.1.7', size: 400_000 },
      { name: 'blinker', version: '1.9.0', size: 40_000 }, { name: 'gunicorn', version: '23.0.0', size: 450_000 },
    ],
    aptLists: 19_300_000,
  },
};
export const NODE: TerminalImage = {
  name: 'node:20-slim', size: 200_100_000, created: '2026-11-13 05:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'], env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_VERSION=20.18.1', 'YARN_VERSION=1.22.22'],
  layers: 4, osRelease: 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n',
  files: [{ path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash\nnode:x:1000:1000::/home/node:/bin/bash\n' }, { path: '/etc/group', content: 'root:x:0:\nnode:x:1000:\n' }],
  packages: { npm: [{ name: 'express', version: '4.21.1', size: 220_000, depends: ['body-parser'] }, { name: 'body-parser', version: '1.20.3', size: 60_000 }, { name: 'nodemon', version: '3.1.7', size: 1_900_000 }] },
};

export const APP_PY = "from flask import Flask\n\napp = Flask(__name__)\n\n@app.get('/')\ndef index():\n    return 'Hello from Flask!\\n'\n\nif __name__ == '__main__':\n    app.run(host='0.0.0.0', port=5000)\n";
/** The order that misses the cache: the source is copied before the requirements are installed. */
export const SLOW_DOCKERFILE = '# syntax=docker/dockerfile:1\nFROM python:3.12-slim\nWORKDIR /app\nCOPY . .\nRUN pip install --no-cache-dir -r requirements.txt\nEXPOSE 5000\nCMD ["python", "app.py"]\n';
/** The cache-friendly order: the requirements first, then the source. */
export const FAST_DOCKERFILE = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 5000\nCMD ["python", "app.py"]\n';

export const buildLab: TerminalMachine = {
  id: 'build-01', title: 'build-01（Docker 主機）', user: 'learner', cwd: '/home/learner/app', host: 'build-01', profile: 'images',
  files: [dir('/home'), dir('/home/learner'), dir('/home/learner/app'), file('/home/learner/app/app.py', APP_PY), file('/home/learner/app/requirements.txt', 'flask==3.0.3\n'),
    file('/home/learner/app/Dockerfile', SLOW_DOCKERFILE), dir('/home/learner/app/.git'), file('/home/learner/app/.git/HEAD', 'ref: refs/heads/main\n'),
    dir('/home/learner/app/__pycache__'), file('/home/learner/app/__pycache__/app.cpython-312.pyc', 'x'.repeat(1200)), file('/home/learner/app/.env', 'SECRET_KEY=dev-only\n'),
    dir('/home/learner/web'), file('/home/learner/web/package.json', '{\n  "name": "web",\n  "dependencies": { "express": "^4.21.1" },\n  "devDependencies": { "nodemon": "^3.1.7" }\n}\n'),
    file('/home/learner/web/server.js', "const express = require('express');\nexpress().get('/', (q, r) => r.send('hi\\n')).listen(3000);\n")],
  accounts: { groups: [{ name: 'docker', gid: 988, members: ['learner'] }] },
  responders: [{ id: 'nginx-site', server: 'nginx/1.27.3', routes: [{ path: '/', body: '<h1>nginx</h1>\n' }] }, { id: 'flask-app', server: 'Werkzeug/3.1.3 Python/3.12.7', routes: [{ path: '/', body: 'Hello from Flask!\n', type: 'text/html; charset=utf-8' }] }],
  docker: {
    images: [...IMAGES.filter(i => i.name !== 'redis:7.4'), PYTHON, NODE],
    programs: [
      { command: ['python', 'app.py'], needs: ['app.py', '/usr/local/lib/python3.12/site-packages/flask/__init__.py'], service: true, stopExit: 137,
        missing: { output: 'Traceback (most recent call last):\n  File "/app/app.py", line 1, in <module>\n    from flask import Flask\nModuleNotFoundError: No module named \'flask\'', exit: 1 },
        logs: [' * Serving Flask app \'app\'', ' * Debug mode: off', { text: ' * Running on all addresses (0.0.0.0)', stream: 2 }], http: { port: 5000, responder: 'flask-app' } },
    ],
  },
};

/** DKR06-like: reorder the Dockerfile so that changing app.py keeps the dependency install cached. */
export const cacheExercise: TerminalExercise = {
  id: 'cache-order', title: '讓安裝步驟命中快取', machine: 'build-01',
  statement: '改寫 ~/app/Dockerfile 的指令順序：改了 app.py 之後重新建置時，pip install 那一步要命中快取。',
  checks: [{ kind: 'build', context: '/home/learner/app', change: 'app.py', cached: ['RUN pip install'], rebuilt: ['COPY . .'] }],
  solution: [`printf '${FAST_DOCKERFILE.replace(/\n/g, '\\n')}' > Dockerfile`],
  mistakes: [{ commands: [], why: '原本的順序先 COPY . .，改了 app.py 就讓之後的步驟全部重新執行' }],
  hints: ['先只複製 requirements.txt'], explanation: '依賴清單很少改變，先複製它並安裝，原始碼放在最後。',
};

import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { CONTAINERS_PROFILE, E20_COMMANDS, IMAGES_PROFILE, run } from '@/lib/terminal/shell';
import { IMAGES_MANUAL } from '@/lib/terminal/manual';
import { ignoredBy, parseDockerfile, substitute } from '@/lib/terminal/build';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { APP_PY, buildLab, cacheExercise, FAST_DOCKERFILE, NODE, PYTHON } from './support/build-fixture';
import { dockFresh, dockLab } from './support/docker-fixture';

/*
 * Engine stage E21 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §11): the images profile — docker build with BuildKit's
 * plain progress on the simulated daemon of E20: the Dockerfile's parsing, RUN in the build container (apt-get, pip,
 * npm, useradd and the file commands), COPY and ADD from the context and .dockerignore, layers with sizes, the build cache
 * (CACHED, and a change that misses its step and every later one), docker history, the image config at run time, tags
 * and dangling images, docker image prune, the host's view of container processes, the image and build checks; below the
 * profile docker build and docker history say engine stage E21.
 */
function session(from: FsState | TerminalMachine, profile = IMAGES_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const lab = (...commands: string[]) => session(buildLab, IMAGES_PROFILE, ...commands);
const write = (path: string, text: string) => `printf '${text.replace(/\n/g, '\\n').replace(/%/g, '%%')}' > ${path}`;
const steps = (err: readonly string[]) => err.filter(l => /^#\d+ (\[|CACHED|DONE|ERROR)/.test(l));
const ID = /^sha256:[0-9a-f]{64}$/;

describe('the images profile', () => {
  it('is the containers profile with the images feature and no new commands; below it build and history say E21', () => {
    expect([...IMAGES_PROFILE.commands]).toEqual([...CONTAINERS_PROFILE.commands]);
    expect(IMAGES_PROFILE.features).toEqual([...CONTAINERS_PROFILE.features!, 'images']);
    expect(E20_COMMANDS).toEqual(['docker']);
    expect(profileOf(buildLab)).toBe(IMAGES_PROFILE);
    expect(machineProblems(buildLab)).toEqual([]);
    const low = session(dockLab, CONTAINERS_PROFILE, 'docker build -t app .', 'docker history nginx', 'docker image build .', 'docker buildx build .', 'docker image prune -f').log;
    expect(low[0].err).toEqual(['docker build：模擬環境在引擎階段 E21（Dockerfile、建置、分層與快取） 才支援']);
    expect(low[1].err).toEqual(['docker history：模擬環境在引擎階段 E21（Dockerfile、建置、分層與快取） 才支援']);
    expect(low[2].err).toEqual(['docker image build：模擬環境在引擎階段 E21（Dockerfile、建置、分層與快取） 才支援']);
    expect(low[3].err).toEqual(['docker buildx：模擬環境在引擎階段 E21（Dockerfile、建置、分層與快取） 才支援']);
    expect(low[4].err).toEqual(["docker: 'image prune' is not a docker command.", "See 'docker --help'"]);
    // The E21 data needs the images profile.
    const below = { ...buildLab, profile: 'containers' as const };
    expect(machineProblems(below).join('\n')).toContain('image python:3.12-slim: user, labels, packages and history need the images profile (engine stage E21)');
    expect(machineProblems(below).join('\n')).toContain('docker.programs needs the images profile (engine stage E21)');
  });
  it('has its manual and help line; docker commit is said, not faked', () => {
    expect(lab('docker --help').last.out[0]).toBe(`用法：${IMAGES_MANUAL.usage}`);
    expect(lab('help').last.out).toContain('  docker build|history|run|ps|images|pull|logs|exec|stop|start|rm|rmi|port|inspect …  建置與管理 Image 與 Container（需要 docker 群組或 sudo）');
    expect(lab('docker').last.out).toEqual(expect.arrayContaining(['  build       Build an image from a Dockerfile', '  history     Show the history of an image']));
    expect(session(dockLab, CONTAINERS_PROFILE, 'docker').last.out.join('\n')).not.toMatch(/build|history/);
    expect(lab('docker commit x y').last.err).toEqual(['docker commit：模擬環境不支援（請寫成 Dockerfile，用 docker build 建置）']);
    expect(session(dockLab, CONTAINERS_PROFILE, 'help').last.out).toContain('  docker run|ps|images|pull|logs|exec|stop|start|rm|rmi|port|inspect …  管理 Image 與 Container（需要 docker 群組或 sudo）');
  });
});

describe('the Dockerfile', () => {
  it('drops directives and comments, joins continuations, reads JSON and shell forms and flags', () => {
    const p = parseDockerfile('# syntax=docker/dockerfile:1\n# escape=\\\n\n# a comment\nFROM python:3.12-slim AS app\nRUN apt-get update && \\\n    # inside\n    apt-get install -y curl\nCOPY --chown=app:app . /app\nCMD ["python", "app.py"]\nENTRYPOINT top -b\n');
    expect('instructions' in p && p.instructions.map(i => [i.keyword, i.args, i.line, i.json ?? null, i.flags])).toEqual([
      ['FROM', 'python:3.12-slim AS app', 5, null, {}],
      ['RUN', 'apt-get update &&     apt-get install -y curl', 6, null, {}],
      ['COPY', '. /app', 9, null, { chown: 'app:app' }],
      ['CMD', '["python", "app.py"]', 10, ['python', 'app.py'], {}],
      ['ENTRYPOINT', 'top -b', 11, null, {}],
    ]);
    expect(parseDockerfile('FROM x\nRUNN y\n')).toEqual({ error: 'dockerfile parse error on line 2: unknown instruction: RUNN', line: 2 });
    expect(parseDockerfile('FROM x\nRUN <<EOF\necho\nEOF\n')).toMatchObject({ line: 2 });
  });
  it('substitutes variables as the Dockerfile does', () => {
    const v = new Map([['A', 'one'], ['EMPTY', '']]);
    expect(substitute('$A ${A} ${A:-x} ${EMPTY:-def} ${A:+set} ${EMPTY:+set} \\$A $NONE.', v)).toBe('one one one def set  $A .');
  });
  it('.dockerignore: patterns from the context root, ** for any folder, ! re-includes, the last match wins', () => {
    const p = ['node_modules', '**/*.log', '*.md', '!README.md', '/build/', '.git'];
    expect(['node_modules/x/y.js', 'web/node_modules/a', 'a.log', 'deep/er/b.log', 'CHANGES.md', 'README.md', 'docs/x.md', 'build/out', '.git/HEAD', 'app.py']
      .map(rel => ignoredBy(p, rel))).toEqual([true, false, true, true, true, false, false, true, true, false]);
  });
});

describe('docker build', () => {
  it('prints BuildKit\'s plain progress: the definition, the base\'s metadata, .dockerignore, FROM, the context, each step, the export', () => {
    const r = lab('docker build -t app:1.0 .', 'echo $?');
    expect(r.log[0].out).toEqual([]);
    const e = r.log[0].err, id = /writing image sha256:([0-9a-f]{64}) done/.exec(e.join('\n'))![1];
    expect(e).toEqual([
      '#0 building with "default" instance using docker driver', '',
      '#1 [internal] load build definition from Dockerfile', '#1 transferring dockerfile: 161B done', '#1 DONE 0.0s', '',
      '#2 [internal] load metadata for docker.io/library/python:3.12-slim', '#2 DONE 0.5s', '',
      '#3 [internal] load .dockerignore', '#3 transferring context: 2B done', '#3 DONE 0.0s', '',
      expect.stringMatching(/^#4 \[1\/4\] FROM docker\.io\/library\/python:3\.12-slim@sha256:[0-9a-f]{64}$/), expect.stringMatching(/^#4 resolve docker\.io\/library\/python:3\.12-slim@sha256:[0-9a-f]{64} done$/), '#4 DONE 0.0s', '',
      '#5 [internal] load build context', '#5 transferring context: 1.59kB done', '#5 DONE 0.0s', '',
      '#6 [2/4] WORKDIR /app', '#6 DONE 0.0s', '',
      '#7 [3/4] COPY . .', '#7 DONE 0.0s', '',
      '#8 [4/4] RUN pip install --no-cache-dir -r requirements.txt',
      expect.stringMatching(/^#8 \d\.\d{3} Collecting flask==3\.0\.3 \(from -r requirements\.txt \(line 1\)\)$/),
      expect.stringMatching(/^#8 \d\.\d{3} Collecting werkzeug>=3\.0\.0 \(from flask==3\.0\.3\)$/),
      expect.stringMatching(/^#8 \d\.\d{3} Collecting MarkupSafe>=2\.1\.1 \(from werkzeug==3\.1\.3\)$/),
      expect.stringMatching(/Collecting jinja2>=3\.1\.2/), expect.stringMatching(/Collecting itsdangerous/), expect.stringMatching(/Collecting click/), expect.stringMatching(/Collecting blinker/),
      expect.stringMatching(/^#8 \d\.\d{3} Installing collected packages: MarkupSafe, werkzeug, jinja2, itsdangerous, click, blinker, flask$/),
      expect.stringMatching(/^#8 \d\.\d{3} Successfully installed blinker-1\.9\.0 click-8\.1\.7 flask-3\.0\.3 itsdangerous-2\.2\.0 jinja2-3\.1\.4 MarkupSafe-3\.0\.2 werkzeug-3\.1\.3$/),
      expect.stringMatching(/^#8 DONE \d\.\ds$/), '',
      '#9 exporting to image', '#9 exporting layers 0.3s done', `#9 writing image sha256:${id} done`, '#9 naming to docker.io/library/app:1.0 done', '#9 DONE 0.3s',
    ]);
    expect(r.log[1].out).toEqual(['0']);
    // The step lines' timestamps grow.
    const stamps = e.filter(l => /^#8 \d/.test(l)).map(l => Number(l.split(' ')[1]));
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
    expect(lab('docker build -t app:1.0 .', 'docker images app').last.out).toEqual(['REPOSITORY   TAG       IMAGE ID       CREATED                  SIZE', `app          1.0       ${id.slice(0, 12)}   Less than a second ago   127MB`]);
  });
  it('-q prints only the image ID; a rebuild that changes nothing is all CACHED and gives the same ID and CREATED', () => {
    const r = lab('docker build -q -t app:1.0 .', 'sleep 120', 'docker build -t app:1.0 .', 'docker images --format "{{.ID}} {{.CreatedSince}}" app').log;
    expect(r[0]).toEqual({ out: [expect.stringMatching(ID)], err: [] });
    expect(steps(r[2].err).filter(l => /^#[6-8] /.test(l))).toEqual(['#6 [2/4] WORKDIR /app', '#6 CACHED', '#7 [3/4] COPY . .', '#7 CACHED', '#8 [4/4] RUN pip install --no-cache-dir -r requirements.txt', '#8 CACHED']);
    expect(r[2].err).toContain('#9 exporting layers done');
    expect(r[2].err).toContain(`#9 writing image ${r[0].out[0]} done`);
    expect(r[3].out).toEqual([`${r[0].out[0].slice(7, 19)} 2 minutes ago`]);
  });
  it('the cache: a changed file misses its COPY and every later step; copying the requirements first keeps the install CACHED', () => {
    const slow = lab('docker build -q -t app .', 'echo "# v2" >> app.py', 'docker build -t app .').log[2].err;
    expect(steps(slow).filter(l => /^#[6-8] /.test(l))).toEqual(['#6 [2/4] WORKDIR /app', '#6 CACHED', '#7 [3/4] COPY . .', '#7 DONE 0.0s', '#8 [4/4] RUN pip install --no-cache-dir -r requirements.txt',
      expect.stringMatching(/^#8 DONE/)]);
    const fast = lab(write('Dockerfile', FAST_DOCKERFILE), 'docker build -q -t app .', 'echo "# v2" >> app.py', 'docker build -t app .').log[3].err;
    expect(steps(fast).filter(l => /^#[6-9] /.test(l))).toEqual(['#6 [2/5] WORKDIR /app', '#6 CACHED', '#7 [3/5] COPY requirements.txt .', '#7 CACHED',
      '#8 [4/5] RUN pip install --no-cache-dir -r requirements.txt', '#8 CACHED', '#9 [5/5] COPY . .', '#9 DONE 0.0s']);
    // A changed requirements file misses the install; --no-cache runs every step.
    const req = lab(write('Dockerfile', FAST_DOCKERFILE), 'docker build -q -t app .', 'echo gunicorn==23.0.0 >> requirements.txt', 'docker build -t app .', 'docker build --no-cache -t app .').log;
    expect(steps(req[3].err).filter(l => / CACHED$| DONE/.test(l) && /^#[7-9]/.test(l))).toEqual(['#7 DONE 0.0s', expect.stringMatching(/^#8 DONE/), '#9 DONE 0.0s']);
    expect(req[3].err.join('\n')).toContain('Collecting gunicorn==23.0.0 (from -r requirements.txt (line 2))');
    expect(req[4].err.filter(l => l.endsWith('CACHED'))).toEqual([]);
  });
  it('ENV and build args are part of a RUN step\'s definition; a COPY before them stays cached', () => {
    const df = 'FROM python:3.12-slim\nCOPY requirements.txt /tmp/\nARG MODE=dev\nRUN echo $MODE > /mode\n';
    const r = lab(write('Dockerfile', df), 'docker build -q -t m .', 'docker build -t m --build-arg MODE=prod .', 'docker run --rm m cat /mode', 'docker history --no-trunc --format "{{.CreatedBy}}" m').log;
    expect(steps(r[2].err).filter(l => /^#[67] /.test(l))).toEqual(['#6 [2/3] COPY requirements.txt /tmp/', '#6 CACHED', '#7 [3/3] RUN echo $MODE > /mode', '#7 DONE 0.3s']);
    expect(r[3].out).toEqual(['prod']);
    expect(r[4].out.slice(0, 2)).toEqual(['RUN |1 MODE=prod /bin/sh -c echo $MODE > /mode # buildkit', 'ARG MODE=prod']);
  });
  it('.dockerignore keeps files out of the context: the transfer is smaller and they are not in the image', () => {
    const r = lab(write('.dockerignore', '.git\n__pycache__\n*.env\n.env\n'), 'docker build -t app .', 'docker run --rm app ls -a /app').log;
    expect(r[1].err).toContain('#3 transferring context: 28B done');
    expect(r[1].err).toContain('#5 transferring context: 377B done');
    expect(r[2].out).toEqual(['.', '..', '.dockerignore', 'Dockerfile', 'app.py', 'requirements.txt']);
    expect(lab('docker build -q -t app .', 'docker run --rm app ls -a /app').last.out).toEqual(['.', '..', '.env', '.git', 'Dockerfile', '__pycache__', 'app.py', 'requirements.txt']);
  });
  it('COPY: single files, folders (their contents), globs, --chown and --chmod; ADD of local files', () => {
    const df = 'FROM alpine:3.21\nCOPY app.py requirements.txt /srv/\nCOPY .git /meta\nCOPY *.txt /txt/\nCOPY --chown=nobody --chmod=600 app.py /secret.py\nADD requirements.txt /r.txt\n';
    const r = lab(write('Dockerfile', df), 'docker build -q -t c .', 'docker run --rm c ls /srv /meta /txt', 'docker run --rm c ls -l /secret.py /r.txt').log.slice(1);
    expect(r[1].out).toEqual(['/meta:', 'HEAD', '', '/srv:', 'app.py', 'requirements.txt', '', '/txt:', 'requirements.txt']);
    expect(r[2].out).toEqual([expect.stringMatching(/^-rw-r--r-- .*root .*\/r\.txt$/), expect.stringMatching(/^-rw------- .*nobody .*\/secret\.py$/)]);
    const multi = lab(write('Dockerfile', 'FROM alpine:3.21\nCOPY app.py requirements.txt /srv\n'), 'docker build .').last.err;
    expect(multi.at(-1)).toBe('ERROR: failed to solve: When using COPY with more than one source file, the destination must be a directory and end with a /');
    expect(lab(write('Dockerfile', 'FROM alpine:3.21\nADD https://example.com/x.tgz /\n'), 'docker build .').last.err.at(-1)).toMatch(/^ERROR: failed to solve: ADD：模擬環境只支援複製本機的一般檔案/);
  });
});

describe('RUN in the build container', () => {
  it('apt-get: no lists until apt-get update (E: Unable to locate package, exit 100), BuildKit\'s error layout', () => {
    const r = lab(write('Dockerfile', 'FROM python:3.12-slim\nRUN apt-get install -y curl\n'), 'docker build -t x .; echo $?').log[1];
    expect(r.out).toEqual(['1']);
    expect(r.err.slice(r.err.indexOf('#5 [2/2] RUN apt-get install -y curl'))).toEqual([
      '#5 [2/2] RUN apt-get install -y curl', '#5 0.120 Reading package lists...', '#5 0.140 Building dependency tree...', '#5 0.160 Reading state information...', '#5 0.180 E: Unable to locate package curl',
      '#5 ERROR: process "/bin/sh -c apt-get install -y curl" did not complete successfully: exit code: 100', '',
      '------', ' > [2/2] RUN apt-get install -y curl:', '0.120 Reading package lists...', '0.140 Building dependency tree...', '0.160 Reading state information...', '0.180 E: Unable to locate package curl', '------',
      'Dockerfile:2', '--------------------', '   1 |     FROM python:3.12-slim', '   2 | >>> RUN apt-get install -y curl', '   3 |     ', '--------------------',
      'ERROR: failed to solve: process "/bin/sh -c apt-get install -y curl" did not complete successfully: exit code: 100',
    ]);
    // No image is made and no tag moves.
    expect(lab(write('Dockerfile', 'FROM python:3.12-slim\nRUN apt-get install -y curl\n'), 'docker build -t x .', 'docker images -q x').last.out).toEqual([]);
  });
  it('apt-get update && install: the packages and their dependencies; the lists weigh in the layer unless removed in the same RUN', () => {
    const r = lab(write('Dockerfile', 'FROM python:3.12-slim\nRUN apt-get update && \\\\\n    apt-get install -y curl\n'), 'docker build -t c .', 'docker history --format "{{.Size}} {{.CreatedBy}}" c').log;
    const run = r[1].err.filter(l => /^#5 \d/.test(l)).map(l => l.slice(l.indexOf(' ', 3) + 1));
    expect(run).toEqual(['Get:1 http://deb.debian.org/debian bookworm InRelease', 'Get:2 http://deb.debian.org/debian bookworm-updates InRelease', 'Get:3 http://deb.debian.org/debian-security bookworm-security InRelease',
      'Reading package lists...', 'Reading package lists...', 'Building dependency tree...', 'Reading state information...', 'The following additional packages will be installed:', '  libcurl4',
      'The following NEW packages will be installed:', '  curl libcurl4', '0 upgraded, 2 newly installed, 0 to remove and 0 not upgraded.', 'Selecting previously unselected package libcurl4.',
      'Preparing to unpack .../libcurl4_7.88.1-10+deb12u8_amd64.deb ...', 'Unpacking libcurl4 (7.88.1-10+deb12u8) ...', 'Selecting previously unselected package curl.',
      'Preparing to unpack .../curl_7.88.1-10+deb12u8_amd64.deb ...', 'Unpacking curl (7.88.1-10+deb12u8) ...', 'Setting up libcurl4 (7.88.1-10+deb12u8) ...', 'Setting up curl (7.88.1-10+deb12u8) ...']);
    expect(r[2].out[0]).toBe('20.9MB RUN /bin/sh -c apt-get update &&     apt-get…');
    const sizes = lab(write('Dockerfile', 'FROM python:3.12-slim\nRUN apt-get update\nRUN apt-get install -y curl\nRUN rm -rf /var/lib/apt/lists/*\n'), 'docker build -q -t big .',
      write('Dockerfile', 'FROM python:3.12-slim\nRUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*\n'), 'docker build -q -t small .',
      'docker images --format "{{.Repository}} {{.Size}}" big', 'docker images --format "{{.Repository}} {{.Size}}" small', 'docker history --format "{{.Size}}" big').log;
    expect([sizes[4].out, sizes[5].out]).toEqual([['big 145MB'], ['small 126MB']]);
    expect(sizes[6].out.slice(0, 3)).toEqual(['0B', '1.6MB', '19.3MB']);
  });
  it('pip and npm install from the declared tables (pip keeps its cache without --no-cache-dir); npm ci needs a lock file', () => {
    const pip = lab(write('Dockerfile', 'FROM python:3.12-slim\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\n'), 'docker build -q -t p .', 'docker history --format "{{.Size}}" p').log;
    expect(pip[2].out[0]).toBe('3.48MB');
    const missing = lab(write('requirements.txt', 'flask==9.9\n'), 'docker build -t p .').last.err;
    expect(missing).toContain('ERROR: failed to solve: process "/bin/sh -c pip install --no-cache-dir -r requirements.txt" did not complete successfully: exit code: 1');
    expect(missing.filter(l => /^#8 \d/.test(l)).map(l => l.slice(l.indexOf(' ', 3) + 1))).toEqual(['Collecting flask==9.9 (from -r requirements.txt (line 1))',
      'ERROR: Could not find a version that satisfies the requirement flask==9.9 (from versions: 3.0.3)', 'ERROR: No matching distribution found for flask==9.9']);
    const npm = session(buildLab, IMAGES_PROFILE, 'cd ../web', write('Dockerfile', 'FROM node:20-slim\nWORKDIR /srv\nCOPY package*.json ./\nRUN npm ci\nRUN npm install --omit=dev\n'), 'docker build -t web .', 'docker build -t web .').log;
    expect(npm[2].err.filter(l => /^#\d+ \d/.test(l)).map(l => l.slice(l.indexOf(' ', 3) + 1)).slice(0, 2)).toEqual(['npm error code EUSAGE', 'npm error']);
    const ok = session(buildLab, IMAGES_PROFILE, 'cd ../web', write('Dockerfile', 'FROM node:20-slim\nWORKDIR /srv\nCOPY package.json ./\nRUN npm install --omit=dev\n'), 'docker build -t web .', 'docker run --rm web ls /srv/node_modules').log;
    expect(ok[2].err.filter(l => /^#\d+ \d/.test(l)).map(l => l.slice(l.indexOf(' ', 3) + 1))).toEqual(['added 2 packages, and audited 3 packages in 1s', '', 'found 0 vulnerabilities']);
    expect(ok[3].out).toEqual(['body-parser', 'express']);
  });
  it('a base only on Docker Hub is downloaded into the build cache (not a local image); a missing command is sh\'s 127', () => {
    const r = session(buildLab, IMAGES_PROFILE, 'cd ../web', write('Dockerfile', 'FROM node:20-slim\nRUN nosuch --flag\n'), 'docker build .', 'docker images -q node', 'docker build .').log;
    expect(r[2].err.filter(l => l.startsWith('#4 ')).map(l => l.replace(/[0-9a-f]{64}/g, 'H'))).toEqual(['#4 [1/2] FROM docker.io/library/node:20-slim@sha256:H',
      '#4 resolve docker.io/library/node:20-slim@sha256:H done', '#4 sha256:H 50.02MB / 50.02MB 0.4s done', '#4 extracting sha256:H 0.2s done', '#4 sha256:H 50.02MB / 50.02MB 0.4s done',
      '#4 extracting sha256:H 0.2s done', '#4 sha256:H 50.02MB / 50.02MB 0.4s done', '#4 extracting sha256:H 0.2s done', '#4 sha256:H 50.02MB / 50.02MB 0.4s done', '#4 extracting sha256:H 0.2s done', '#4 DONE 2.4s']);
    expect(r[2].err).toContain('#5 0.150 /bin/sh: 1: nosuch: not found');
    expect(r[2].err.at(-1)).toBe('ERROR: failed to solve: process "/bin/sh -c nosuch --flag" did not complete successfully: exit code: 127');
    expect(r[3].out).toEqual([]);
    expect(r[4].err.filter(l => l.startsWith('#4 ')).length).toBe(3);
  });
  it('USER: later RUN steps run as that user (permission denied in root\'s folders); useradd -m; a missing user fails the step', () => {
    const r = lab(write('Dockerfile', 'FROM python:3.12-slim\nRUN useradd -m app\nUSER app\nWORKDIR /home/app\nRUN echo hi > note && touch /etc/x\n'), 'docker build -t u .').last.err;
    expect(r).toContain('#7 0.150 touch: cannot touch \'/etc/x\': Permission denied');
    expect(r.at(-1)).toBe('ERROR: failed to solve: process "/bin/sh -c echo hi > note && touch /etc/x" did not complete successfully: exit code: 1');
    const ok = lab(write('Dockerfile', 'FROM python:3.12-slim\nRUN useradd -m app\nUSER app\nWORKDIR /home/app\nRUN echo hi > note\n'), 'docker build -q -t u .', 'docker run --rm u ls -l note', 'docker run --rm u env').log.slice(1);
    expect(ok[1].out).toEqual([expect.stringMatching(/^-rw-r--r-- .*app .*app .* note$/)]);
    expect(ok[2].out).toContain('HOME=/home/app');
    expect(lab(write('Dockerfile', 'FROM python:3.12-slim\nUSER ghost\nRUN true\n'), 'docker build .').last.err.at(-1))
      .toBe('ERROR: failed to solve: process "/bin/sh -c true" did not complete successfully: unable to find user ghost: no matching entries in passwd file');
    // Alpine's BusyBox has adduser -S, not useradd.
    expect(lab(write('Dockerfile', 'FROM alpine:3.21\nRUN useradd app\n'), 'docker build .').last.err).toContain('#5 0.150 /bin/sh: useradd: not found');
    expect(lab(write('Dockerfile', 'FROM alpine:3.21\nRUN apt-get update\n'), 'docker build .').last.err).toContain('#5 0.150 /bin/sh: apt-get: not found');
    expect(lab(write('Dockerfile', 'FROM alpine:3.21\nRUN addgroup -S app && adduser -S -G app app\nUSER app\n'), 'docker build -q -t a .', 'docker image inspect -f "{{.Config.User}}" a').last.out).toEqual(['app']);
  });
  it('the shell\'s lists (&&, ||, ;), exit, cd and variables', () => {
    const df = 'FROM alpine:3.21\nENV DIR=/data\nRUN mkdir $DIR; cd $DIR && echo in > f || echo never; false || echo rescued > /r\nRUN exit 3\n';
    const r = lab(write('Dockerfile', df), 'docker build -t s .').last.err;
    expect(r.at(-1)).toBe('ERROR: failed to solve: process "/bin/sh -c exit 3" did not complete successfully: exit code: 3');
    const ok = lab(write('Dockerfile', df.replace('RUN exit 3\n', '')), 'docker build -q -t s .', 'docker run --rm s cat /data/f /r').last.out;
    expect(ok).toEqual(['in', 'rescued']);
  });
});

describe('build errors', () => {
  it('arguments, tags, the context, the Dockerfile, its syntax, a missing source, a missing base, scratch without a shell', () => {
    const usage = lab('docker build; echo $?').last;
    expect(usage.err).toEqual(['ERROR: "docker buildx build" requires exactly 1 argument.', "See 'docker buildx build --help'.", '', 'Usage:  docker buildx build [OPTIONS] PATH | URL | -', '', 'Start a build']);
    expect(usage.out).toEqual(['1']);
    expect(lab('docker build -t App .').last.err).toEqual(['ERROR: invalid tag "App": repository name must be lowercase']);
    expect(lab('docker build nowhere').last.err).toEqual(['ERROR: unable to prepare context: path "nowhere" not found']);
    expect(lab('docker build -f Dockerfile.dev .').last.err.at(-1)).toBe('ERROR: failed to solve: failed to read dockerfile: open Dockerfile.dev: no such file or directory');
    expect(lab('docker build --bogus .').last.err).toEqual(['unknown flag: --bogus', "See 'docker buildx build --help'."]);
    const parse = lab(write('Dockerfile', 'FROM python:3.12-slim\nRUNN x\n'), 'docker build .').last.err;
    expect(parse.slice(-7)).toEqual(['Dockerfile:2', '--------------------', '   1 |     FROM python:3.12-slim', '   2 | >>> RUNN x', '   3 |     ', '--------------------', 'ERROR: failed to solve: dockerfile parse error on line 2: unknown instruction: RUNN']);
    const copy = lab(write('Dockerfile', 'FROM python:3.12-slim\nCOPY nope.txt /\n'), 'docker build .').last.err;
    expect(copy).toContain('#5 transferring context: 0B done');
    expect(copy.at(-1)).toMatch(/^ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref [0-9a-f-]{36}::[0-9a-z]{25}: "\/nope\.txt": not found$/);
    const base = lab(write('Dockerfile', 'FROM python:3.13\n'), 'docker build .').last.err;
    expect(base).toContain('#2 ERROR: docker.io/library/python:3.13: not found');
    expect(base.at(-1)).toBe('ERROR: failed to solve: python:3.13: failed to resolve source metadata for docker.io/library/python:3.13: docker.io/library/python:3.13: not found');
    expect(lab(write('Dockerfile', 'FROM nosuch\n'), 'docker build .').last.err.at(-1)).toMatch(/: pull access denied, repository does not exist or may require authorization/);
    expect(lab(write('Dockerfile', 'FROM scratch\nRUN echo hi\n'), 'docker build .').last.err.at(-1)).toMatch(/exec: "\/bin\/sh": stat \/bin\/sh: no such file or directory: unknown$/);
    expect(lab(write('Dockerfile', 'RUN echo\n'), 'docker build .').last.err.at(-1)).toBe('ERROR: failed to solve: no build stage in current context');
  });
  it('later stages\' instructions say which engine stage brings them; the socket\'s permission applies', () => {
    expect(lab(write('Dockerfile', 'FROM alpine:3.21 AS b\nFROM alpine:3.21\nCOPY --from=b / /\n'), 'docker build .').last.err.at(-1)).toBe('ERROR: failed to solve: COPY --from（多階段建置）：模擬環境在引擎階段 E23 才支援');
    expect(lab(write('Dockerfile', 'FROM alpine:3.21\nVOLUME /data\n'), 'docker build .').last.err.at(-1)).toBe('ERROR: failed to solve: VOLUME：模擬環境在引擎階段 E22（Volume 與網路） 才支援');
    expect(lab(write('Dockerfile', 'FROM alpine:3.21\nHEALTHCHECK CMD true\n'), 'docker build .').last.err.at(-1)).toContain('E24');
    const fresh = session({ ...dockFresh, profile: 'images' }, IMAGES_PROFILE, 'docker build .; echo $?').last;
    expect(fresh.out).toEqual(['1']);
    expect(fresh.err[0]).toMatch(/^ERROR: permission denied while trying to connect to the Docker daemon socket at unix:\/\/\/var\/run\/docker\.sock: .*connect: permission denied$/);
  });
  it('multi-stage: only the target stage is built (--target), named in the steps; build checks are listed after the build', () => {
    const df = 'FROM debian AS base\nRUN echo base\nFROM python:3.12-slim AS app\nCMD python app.py\nENV MODE debug\n';
    const r = lab(write('Dockerfile', df), 'docker build -t t --target app .').last.err;
    expect(r.filter(l => /^#\d+ \[/.test(l))).toEqual(['#1 [internal] load build definition from Dockerfile', '#2 [internal] load metadata for docker.io/library/python:3.12-slim', '#3 [internal] load .dockerignore',
      expect.stringMatching(/^#4 \[app 1\/1\] FROM /)]);
    expect(r.slice(-3)).toEqual([' 2 warnings found (use docker --debug to expand):',
      ' - JSONArgsRecommended: JSON arguments recommended for CMD to prevent unintended behavior related to OS signals (line 4)',
      ' - LegacyKeyValueFormat: "ENV key=value" should be used instead of legacy "ENV key value" format (line 5)']);
    expect(lab(write('Dockerfile', df), 'docker build --target nope .').last.err.at(-1)).toBe('ERROR: failed to solve: target stage "nope" could not be found');
  });
});

describe('layers, docker history and inspect', () => {
  it('docker history: newest first, only the image has an ID, BuildKit\'s CREATED BY cut at 45, Go sizes, the base\'s rows', () => {
    const r = lab('docker build -q -t app:1.0 .', 'docker history app:1.0').log;
    expect(r[1].out).toEqual([
      'IMAGE          CREATED                  CREATED BY                                      SIZE      COMMENT',
      `${r[0].out[0].slice(7, 19)}   Less than a second ago   CMD ["python" "app.py"]                         0B        buildkit.dockerfile.v0`,
      '<missing>      Less than a second ago   EXPOSE map[5000/tcp:{}]                         0B        buildkit.dockerfile.v0',
      '<missing>      Less than a second ago   RUN /bin/sh -c pip install --no-cache-dir -r…   2.61MB    buildkit.dockerfile.v0',
      '<missing>      Less than a second ago   COPY . . # buildkit                             1.59kB    buildkit.dockerfile.v0',
      '<missing>      Less than a second ago   WORKDIR /app                                    0B        buildkit.dockerfile.v0',
      '<missing>      10 days ago              CMD ["python3"]                                 0B        buildkit.dockerfile.v0',
      '<missing>      10 days ago              RUN /bin/sh -c set -eux;  for src in idle3 p…   0B        buildkit.dockerfile.v0',
      '<missing>      10 days ago              RUN /bin/sh -c set -eux;   savedAptMark="$(a…   46.2MB    buildkit.dockerfile.v0',
      '<missing>      10 days ago              ENV PYTHON_VERSION=3.12.7                       0B        buildkit.dockerfile.v0',
      '<missing>      10 days ago              ENV GPG_KEY=7169605F62C751356D054A26A821E680…   0B        buildkit.dockerfile.v0',
      '<missing>      10 days ago              RUN /bin/sh -c set -eux;  apt-get update;  a…   3.5MB     buildkit.dockerfile.v0',
      '<missing>      10 days ago              ENV LANG=C.UTF-8                                0B        buildkit.dockerfile.v0',
      '<missing>      10 days ago              ENV PATH=/usr/local/bin:/usr/local/sbin:/usr…   0B        buildkit.dockerfile.v0',
      '<missing>      10 days ago              # debian.sh --arch \'amd64\' out/ \'bookworm\' \'…   74.8MB    buildkit.dockerfile.v0',
    ]);
    const more = lab('docker build -q -t app:1.0 .', 'docker history --no-trunc -q app:1.0', 'docker history --human=false --format "{{.Size}} {{.CreatedSince}}" app:1.0', 'docker history --no-trunc --format "{{.CreatedBy}}" python:3.12-slim', 'docker history nope').log;
    expect(more[1].out.slice(0, 2)).toEqual([more[0].out[0], '<missing>']);
    expect(more[2].out.slice(2, 4)).toEqual(['2610000 2026-11-22T10:00:00Z', '1590 2026-11-22T10:00:00Z']);
    expect(more[3].out.at(-1)).toBe('# debian.sh --arch \'amd64\' out/ \'bookworm\' \'@1731283200\'');
    expect(more[4].err).toEqual(['Error response from daemon: No such image: nope:latest']);
    // An image without declared history: one row per layer (the first is the root file system) and its config.
    expect(lab('docker history --format "{{.CreatedBy}} {{.Size}}" alpine:3.21').last.out).toEqual(['CMD ["/bin/sh"] 0B', 'ADD rootfs.tar.xz / # buildkit 7.83MB']);
  });
  it('RootFS.Layers: one per step that changed files (a RUN that changes nothing is an empty layer); the base\'s come first', () => {
    const df = 'FROM python:3.12-slim\nWORKDIR /app\nRUN echo nothing changes\nCOPY app.py .\n';
    const r = lab(write('Dockerfile', df), 'docker build -q -t l .', 'docker image inspect -f "{{.RootFS.Layers}}" l', 'docker image inspect -f "{{.RootFS.Layers}}" python:3.12-slim').log;
    const layers = (i: number) => r[i].out[0].slice(1, -1).split(' ');
    expect(layers(2)).toHaveLength(6);
    expect(layers(2).slice(0, 4)).toEqual(layers(3));
    expect(layers(2).every(l => /^sha256:[0-9a-f]{64}$/.test(l))).toBe(true);
    expect(lab(write('Dockerfile', df), 'docker build -q -t l .', 'docker history --format "{{.Size}} {{.CreatedBy}}" l').last.out.slice(0, 3)).toEqual(['175B COPY app.py . # buildkit', '0B RUN /bin/sh -c echo nothing changes # buildk…', '0B WORKDIR /app']);
  });
  it('the image config: Env, Cmd, Entrypoint (an ENTRYPOINT resets the base\'s CMD), WorkingDir, ExposedPorts, User, Labels', () => {
    const df = 'FROM python:3.12-slim\nLABEL org.opencontainers.image.title="demo app" version=1\nENV APP_ENV=production PORT=5000\nWORKDIR /srv\nEXPOSE 5000 8000/tcp\nUSER nobody\nENTRYPOINT ["python"]\n';
    const r = lab(write('Dockerfile', df), 'docker build -q -t cfg .', "docker image inspect -f '{{.Config.Labels}}|{{.Config.Env}}|{{json .Config.Cmd}}|{{json .Config.Entrypoint}}|{{.Config.WorkingDir}}|{{json .Config.ExposedPorts}}|{{.Config.User}}' cfg",
      'docker image inspect nope', 'docker image inspect -f "{{.Id}} {{.RepoDigests}}" cfg').log.slice(1);
    expect(r[1].out).toEqual(['map[org.opencontainers.image.title:demo app version:1]|[PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305 PYTHON_VERSION=3.12.7 APP_ENV=production PORT=5000]|null|["python"]|/srv|{"5000/tcp":{},"8000/tcp":{}}|nobody']);
    expect(r[2].err).toEqual(['Error response from daemon: No such image: nope:latest']);
    expect(r[3].out).toEqual([`${r[0].out[0]} []`]);
  });
});

describe('running built images', () => {
  it('the config applies: a declared program serves through -p, logs, env, the working directory, the exposed port in docker ps', () => {
    const r = lab('docker build -q -t app:1.0 .', 'docker run -d --name web -p 8080:5000 app:1.0', 'docker ps --format "{{.Image}} {{.Command}} {{.Ports}}"', 'curl -s localhost:8080',
      'docker logs web', 'docker exec web pwd', 'docker exec -e X=1 web env', 'docker run -d --name other app:1.0', 'docker ps --filter name=other --format "{{.Ports}}"', 'docker stop web', 'docker ps -a --filter name=web --format "{{.Status}}"').log;
    expect(r[2].out).toEqual(['app:1.0 "python app.py" 0.0.0.0:8080->5000/tcp, [::]:8080->5000/tcp']);
    expect(r[3].out).toEqual(['Hello from Flask!']);
    expect(r[4]).toEqual({ out: [' * Serving Flask app \'app\'', ' * Debug mode: off'], err: [' * Running on all addresses (0.0.0.0)'] });
    expect(r[5].out).toEqual(['/app']);
    expect(r[6].out).toEqual(expect.arrayContaining(['PYTHON_VERSION=3.12.7', 'X=1', 'HOME=/root']));
    expect(r[8].out).toEqual(['5000/tcp']);
    // The lesson says the program does not handle SIGTERM as PID 1: killed after 10 s.
    expect(r[10].out).toEqual(['Exited (137) Less than a second ago']);
  });
  it('a program missing what it needs exits with its error; an image without a command; a USER the image does not have', () => {
    const noReq = lab(write('requirements.txt', ''), write('Dockerfile', 'FROM python:3.12-slim\nWORKDIR /app\nCOPY app.py .\nCMD ["python", "app.py"]\n'), 'docker build -q -t bare .', 'docker run --name b bare; echo $?').last;
    expect(noReq).toEqual({ out: ['1'], err: ['Traceback (most recent call last):', '  File "/app/app.py", line 1, in <module>', '    from flask import Flask', 'ModuleNotFoundError: No module named \'flask\''] });
    const none = lab(write('Dockerfile', 'FROM scratch\nCOPY app.py /\n'), 'docker build -q -t s .', 'docker run s; echo $?').last;
    expect(none).toEqual({ out: ['125'], err: ['docker: Error response from daemon: no command specified.', "See 'docker run --help'."] });
    const ghost = lab(write('Dockerfile', 'FROM alpine:3.21\nUSER ghost\n'), 'docker build -q -t g .', 'docker run g; echo $?').last;
    expect(ghost).toEqual({ out: ['125'], err: ['docker: Error response from daemon: unable to find user ghost: no matching entries in passwd file.'] });
    // A command after the image replaces CMD; an image whose CMD is its base's behaves as the base (nginx serves).
    expect(lab(write('Dockerfile', 'FROM python:3.12-slim\nENTRYPOINT ["echo"]\nCMD ["hello"]\n'), 'docker build -q -t e .', 'docker run --rm e', 'docker run --rm e bye').log.slice(2).map(x => x.out)).toEqual([['hello'], ['bye']]);
    const site = lab('mkdir site', 'echo "<h1>mine</h1>" > site/index.html', write('site/Dockerfile', 'FROM nginx\nCOPY index.html /usr/share/nginx/html/\n'), 'docker build -q -t site site', 'docker run -d -p 8081:80 site', 'docker exec $(docker ps -q | head -n 1) cat /usr/share/nginx/html/index.html', 'curl -s -o /dev/null -w "%{http_code}" localhost:8081').log;
    expect(site[5].out).toEqual(['<h1>mine</h1>']);
    expect(site[6].out).toEqual(['200']);
  });
  it('from the images profile up the host sees the containers\' processes (host PIDs, the shim); the containers profile is unchanged', () => {
    const r = lab('docker run -d --name w nginx', 'ps -e -o pid,ppid,user,args', 'docker stop w', 'ps -e -o args | grep -c "[c]ontainerd-shim"').log;
    expect(r[1].out.slice(-3, -1)).toEqual([expect.stringMatching(/^ {4}901 +1 root +\/usr\/bin\/containerd-shim-runc-v2 -namespace moby -id [0-9a-f]{64} -address \/run\/containerd\/containerd\.sock$/), '    902     901 root     nginx -g daemon off;']);
    expect(r[3].out).toEqual(['0']);
    expect(session(dockLab, CONTAINERS_PROFILE, 'docker run -d --name w nginx', 'ps -e -o args | grep -c "[c]ontainerd-shim"').last.out).toEqual(['0']);
  });
});

describe('tags, dangling images, rmi and prune', () => {
  it('a rebuild moves the tag and leaves the old image dangling; several tags share an ID; rmi by tag and by ID; image prune', () => {
    const r = lab('docker build -q -t app:1.0 -t app:latest .', 'docker images app --format "{{.Tag}} {{.ID}}"', 'echo "# v2" >> app.py', 'docker build -q -t app:1.0 -t app:latest .',
      'docker images --filter dangling=true --format "{{.Repository}} {{.Tag}} {{.ID}}"', 'docker rmi app:1.0', 'docker rmi $(docker images -q app); echo $?', 'docker image prune -f', 'docker images -q --filter dangling=true | wc -l').log;
    const [a, b] = [r[0].out[0].slice(7, 19), r[3].out[0].slice(7, 19)];
    expect(r[1].out).toEqual([`1.0 ${a}`, `latest ${a}`]);
    expect(r[4].out).toEqual([`<none> <none> ${a}`]);
    expect(r[5].out).toEqual(['Untagged: app:1.0']);
    expect(r[6]).toEqual({ out: ['Untagged: app:latest', `Deleted: ${r[3].out[0]}`, expect.stringMatching(/^Deleted: sha256:[0-9a-f]{64}$/), expect.stringMatching(/^Deleted: sha256:[0-9a-f]{64}$/), '0'], err: [] });
    // rmi deleted the new image's own layers (its COPY and the RUN on top of it: chain IDs), not WORKDIR's, which the old image shares; prune then deletes the old image's WORKDIR, COPY and RUN layers.
    expect(r[7].out).toEqual(['Deleted Images:', `deleted: sha256:${a.padEnd(12)}`.replace(a, r[0].out[0].slice(7)), expect.stringMatching(/^deleted: sha256:[0-9a-f]{64}$/), expect.stringMatching(/^deleted: sha256:[0-9a-f]{64}$/), expect.stringMatching(/^deleted: sha256:[0-9a-f]{64}$/), '', 'Total reclaimed space: 2.612MB']);
    expect(r[8].out).toEqual(['0']);
    expect(lab('docker build -q -t a:1 -t a:2 .', 'docker image inspect -f "{{.RepoTags}}" a:2').last.out).toEqual(['[a:1 a:2]']);
    expect(lab('docker build -q -t a:1 -t a:2 .', 'docker rmi $(docker images -q a:1)').last.err).toEqual([expect.stringMatching(/^Error response from daemon: conflict: unable to delete [0-9a-f]{12} \(must be forced\) - image is referenced in multiple repositories$/)]);
    expect(lab('docker image prune').last).toEqual({ out: ['WARNING! This will remove all dangling images.', 'Are you sure you want to continue? [y/N] '], err: ['（模擬環境沒有鍵盤可以回答；請加 -f，或寫成 echo y | docker image prune）'] });
  });
  it('an untagged build is a dangling image; docker info counts images by ID', () => {
    const r = lab('docker build -q .', 'docker images --format "{{.Repository}}:{{.Tag}}" | head -n 1', 'docker build -q -t x -t y .', 'docker info --format "{{.Images}}"').log;
    expect(r[1].out).toEqual(['<none>:<none>']);
    expect(r[2].out).toEqual(r[0].out);
    expect(r[3].out).toEqual(['5']);
  });
});

describe('lesson data and checks', () => {
  it('validates the E21 image data and programs', () => {
    const bad = (images: TerminalMachine['docker']) => machineProblems({ ...buildLab, docker: images }).join('\n');
    expect(bad({ images: [{ ...PYTHON, history: [{ createdBy: 'ADD x /', size: 5 }] }] })).toContain('the sizes of history\'s layer rows must add up to size');
    expect(bad({ images: [{ ...PYTHON, layers: 3 }] })).toContain('layers (3) must be the number of layer rows of history (4)');
    expect(bad({ images: [{ ...PYTHON, user: 'Bad User' }] })).toContain('user is a user name or uid');
    expect(bad({ images: [{ ...PYTHON, packages: { pip: [{ name: 'flask', version: '3', size: 1, depends: ['nope'] }] } }] })).toContain('depends on a package of the same table');
    expect(bad({ images: [NODE], programs: [{ command: [], service: true }] })).toContain('command needs 1..20 one-line words');
    expect(bad({ images: [NODE], programs: [{ command: ['node'], http: { port: 3000, responder: 'none' } }] })).toContain('http needs a port 1..65535, a responder of the machine');
  });
  it('the image check reads the config and the layers', () => {
    const x = (checks: TerminalExercise['checks'], solution: string[]): TerminalExercise => ({ id: 'img', title: 'Image', machine: 'build-01', statement: '建置。', checks, solution, mistakes: [], hints: [], explanation: '。' });
    const ok = checkTerminalExercise(x([{ kind: 'image', name: 'app:1.0', cmd: ['python', 'app.py'], port: 5000, workdir: '/app', env: 'PYTHON_VERSION=3.12.7', layers: 7 }], ['docker build -t app:1.0 .']), [buildLab], ['docker build -t app:1.0 .']);
    expect(ok.ok).toBe(true);
    const v = checkTerminalExercise(x([{ kind: 'image', name: 'app:1.0', user: 'app' }, { kind: 'image', name: 'app:1.0', label: 'version=2' }, { kind: 'image', name: 'app:1.0', layers: 3 }, { kind: 'image', name: 'nope:1' }], []), [buildLab], ['docker build -t app:1.0 .']);
    expect(v.results.map(r => r.message)).toEqual([
      '本機應該有 Image app:1.0（USER app），但它沒有設定 USER（以 root 執行）', '本機應該有 Image app:1.0（標籤 version=2），但它沒有標籤 version', '本機應該有 Image app:1.0（3 層），但它有 7 層',
      '本機應該有 Image nope:1，但本機沒有 nope:1（先 docker pull 或 docker build -t nope:1）',
    ]);
  });
  it('the build check: the cache-friendly order passes, the starting order and a broken Dockerfile do not', () => {
    expect(checkTerminalExercise(cacheExercise, [buildLab], cacheExercise.solution).ok).toBe(true);
    const start = checkTerminalExercise(cacheExercise, [buildLab], []);
    expect(start.results[0].message).toBe('建置 /home/learner/app，改了 app.py 之後再建置一次時，「RUN pip install」命中快取（CACHED），「COPY . .」重新執行，但改了 app.py 之後，「RUN pip install --no-cache-dir -r requirements.txt」沒有命中快取，又執行了一次');
    expect(checkTerminalExercise(cacheExercise, [buildLab], ['echo "RUNN x" >> Dockerfile']).results[0].message).toMatch(/但建置失敗：dockerfile parse error on line 8: unknown instruction: RUNN$/);
    expect(checkTerminalExercise(cacheExercise, [buildLab], [write('Dockerfile', 'FROM python:3.12-slim\nCOPY . .\n')]).results[0].message).toMatch(/但Dockerfile 沒有「RUN pip install」這個步驟$/);
  });
  it('a whole synthetic lesson validates (a build transcript replays exactly); check data is validated', () => {
    const r = lab('docker build -q -t app:1.0 .', 'docker images --format "{{.Repository}}:{{.Tag}} {{.Size}}" app');
    const content = {
      machines: [buildLab],
      examples: [{ id: 'b', title: '建置', description: '建置並列出。', machine: 'build-01', steps: [{ command: 'docker build -q -t app:1.0 .', output: r.log[0].out[0] }, { command: 'docker images --format "{{.Repository}}:{{.Tag}} {{.Size}}" app', output: 'app:1.0 127MB' }] }],
      exercises: [cacheExercise],
    };
    expect(r.last.out).toEqual(['app:1.0 127MB']);
    expect(terminalContentProblems(content)).toEqual([]);
    const broken = { ...content, exercises: [{ ...cacheExercise, checks: [{ kind: 'build' as const, context: 'app', change: '/abs', cached: [] }, { kind: 'image' as const, name: 'x', absent: true as const, layers: 2 }] }] };
    expect(terminalContentProblems(broken).join('\n')).toContain('a build check needs an absolute context folder');
    expect(terminalContentProblems(broken).join('\n')).toContain('and nothing else with absent');
    const low = { ...content, machines: [{ ...buildLab, profile: 'containers' as const, docker: { images: [] } }], examples: [] };
    expect(terminalContentProblems(low).join('\n')).toContain('a build check needs an images machine (engine stage E21)');
  });
  it('commands never change the state they were given; the source file of the exercise is untouched by the check', () => {
    const start = machineState(buildLab), before = JSON.stringify([...start.nodes]), images = JSON.stringify(start.docker?.images.map(i => [i.repo, i.tag, i.local]));
    run(start, 'docker build -t app .', IMAGES_PROFILE);
    run(start, 'docker build -q -t app . && docker rmi app', IMAGES_PROFILE);
    expect(JSON.stringify([...start.nodes])).toBe(before);
    expect(JSON.stringify(start.docker?.images.map(i => [i.repo, i.tag, i.local]))).toBe(images);
    expect(start.nodes.get('/home/learner/app/app.py')?.content).toBe(APP_PY);
  });
});

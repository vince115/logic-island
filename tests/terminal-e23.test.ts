import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { COMPOSE_PROFILE, run, STORAGE_NET_PROFILE } from '@/lib/terminal/shell';
import { COMPOSE_MANUAL } from '@/lib/terminal/manual';
import { parseYaml, YamlError } from '@/lib/terminal/yaml';
import { durationText, parseDuration } from '@/lib/terminal/health';
import { checkTerminalExercise, machineProblems, machineState, profileOf, replay, terminalContentProblems, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { CI_TOKEN, composeLab, composeUpExercise, pushExercise } from './support/compose-fixture';
import { storageNetLab } from './support/storage-net-fixture';

/*
 * Engine stage E23 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §13): the compose profile — docker compose (the YAML
 * subset, interpolation, validation, config, up with depends_on and health checks, down, ps, logs, exec, build, pull,
 * start, stop, restart, ls), health checks (Compose's, HEALTHCHECK, --health-*; docker ps and inspect), multi-stage builds
 * (COPY --from a stage or an image, FROM a stage, --target, FROM scratch, distroless), and registries (docker tag, login
 * with --password-stdin and its warning, push, pull by tag and digest, logout, denied, unauthorized, immutable tags), and
 * the compose, registry and image-digest checks. Below the profile docker compose, COPY --from, push and login say E23.
 */
function session(from: FsState | TerminalMachine, profile = COMPOSE_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; status?: number }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), status: r.state.status });
  }
  return { state, log, last: log.at(-1)! };
}
const lab = (...commands: string[]) => session(composeLab, COMPOSE_PROFILE, ...commands);
const LOGIN = `cat ci-token.txt | docker login registry.example.com:5000 -u ci --password-stdin`;
const events = (lines: string[]) => lines.filter(l => /^ (Network|Volume|Container|Service) |^ \w+  /.test(l));

describe('the compose profile', () => {
  it('is the storage-net profile with the compose feature and no new commands', () => {
    expect([...COMPOSE_PROFILE.commands]).toEqual([...STORAGE_NET_PROFILE.commands]);
    expect(COMPOSE_PROFILE.features).toEqual([...STORAGE_NET_PROFILE.features!, 'compose']);
    expect(profileOf(composeLab)).toBe(COMPOSE_PROFILE);
    expect(machineProblems(composeLab)).toEqual([]);
  });
  it('below it, docker compose, COPY --from, push, login, tag and pull by digest say engine stage E23', () => {
    const low = session({ ...composeLab, profile: 'storage-net', docker: { ...composeLab.docker, registries: undefined, tools: undefined, images: storageNetLab.docker!.images } }, STORAGE_NET_PROFILE,
      'cd shop', 'docker compose up -d', 'docker push alpine:3.21', 'docker login registry.example.com:5000', 'docker tag alpine:3.21 a:1', 'docker logout',
      'docker pull alpine@sha256:795053282f9683237df3941280bfcf2e2cb4a10ce0737fc614ba80c7be6585ec', "printf 'FROM alpine:3.21 AS a\\nFROM alpine:3.21\\nCOPY --from=a /etc/os-release /x\\n' > D",
      'docker build -f D .', "printf 'FROM alpine:3.21\\nHEALTHCHECK CMD true\\n' > H", 'docker build -f H .', 'docker run --health-cmd true alpine:3.21').log;
    expect(low[1].err).toEqual(['docker compose：模擬環境在引擎階段 E23（Compose、多階段建置與 Registry） 才支援']);
    expect(low[2].err).toEqual(['docker push：模擬環境在引擎階段 E23（Compose、多階段建置與 Registry） 才支援']);
    expect(low[3].err).toEqual(['docker login：模擬環境在引擎階段 E23（Compose、多階段建置與 Registry） 才支援']);
    expect(low[4].err).toEqual(['docker tag：模擬環境在引擎階段 E23（Compose、多階段建置與 Registry） 才支援']);
    expect(low[5].err).toEqual(['docker logout：模擬環境在引擎階段 E23（Compose、多階段建置與 Registry） 才支援']);
    expect(low[6].err).toEqual(['docker pull：模擬環境以標籤拉取 Image；以 digest 鎖定版本在引擎階段 E23（Registry）才支援']);
    expect(low[8].err).toContain('ERROR: failed to solve: COPY --from（多階段建置）：模擬環境在引擎階段 E23 才支援');
    expect(low[10].err).toContain('ERROR: failed to solve: HEALTHCHECK：模擬環境在引擎階段 E24（健康檢查、資源限制與重新啟動） 才支援');
    expect(low[11].err).toEqual(['unknown flag: --health-cmd', "See 'docker run --help'."]);
    // The E23 data needs the profile.
    const p = machineProblems({ ...composeLab, profile: 'storage-net' }).join('\n');
    expect(p).toContain('registries and tools need the compose profile (engine stage E23)');
    expect(p).toContain('image postgres:17: healthcheck, ready and tags need the compose profile (engine stage E23)');
    expect(p).toContain("a program's ready needs the compose profile (engine stage E23)");
  });
  it('has its manual page and help line; docker lists compose, push, login, logout and tag', () => {
    expect(lab('docker --help').last.out[0]).toBe(`用法：${COMPOSE_MANUAL.usage}`);
    expect(lab('help').last.out).toContain('  docker compose|tag|push|login|logout|volume|network|build|history|run|ps|images|pull|logs|exec|stop|start|rm|rmi|port|inspect …  Compose、Registry、Volume、網路、Image 與 Container（需要 docker 群組或 sudo）');
    const top = lab('docker').last.out;
    expect(top).toEqual(expect.arrayContaining(['  push        Upload an image to a registry', '  login       Log in to a registry', '  logout      Log out from a registry',
      '  tag         Create a tag TARGET_IMAGE that refers to SOURCE_IMAGE', '  compose     Docker Compose']));
    expect(lab('docker compose version').last.out).toEqual(['Docker Compose version v2.32.4']);
    expect(lab('docker compose').last.out).toContain('  up          Create and start containers');
    expect(lab('docker compose run web').last.err[0]).toMatch(/^docker compose run：模擬環境不支援/);
    expect(lab('docker compose bogus').last.err).toEqual(['unknown docker command: "compose bogus"']);
    expect(lab('docker search nginx').last.err[0]).toMatch(/^docker search：模擬環境不支援/);
  });
});

describe('the YAML subset', () => {
  it('reads block mappings and sequences, flow collections, quotes, comments and block scalars', () => {
    const y = parseYaml('---\na: 1 # c\nb:\n- x\n- "y: z"\nc: [1, \'two\', {k: v}]\nd:\n  - k: v\n    l: w\ne: |\n  line1\n  line2\nf: >-\n  one\n  two\ng:\nh: ~\n');
    expect(y.t).toBe('map');
    const m = (y as Extract<typeof y, { t: 'map' }>).m;
    expect(m.map(([k]) => k)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(m[1][1]).toMatchObject({ t: 'seq', a: [{ t: 'str', v: 'x' }, { t: 'str', v: 'y: z', q: true }] });
    expect(m[2][1]).toMatchObject({ t: 'seq', a: [{ v: '1' }, { v: 'two' }, { t: 'map', m: [['k', { v: 'v' }]] }] });
    expect(m[3][1]).toMatchObject({ t: 'seq', a: [{ t: 'map', m: [['k', { v: 'v' }], ['l', { v: 'w' }]] }] });
    expect(m[4][1]).toMatchObject({ t: 'str', v: 'line1\nline2\n' });
    expect(m[5][1]).toMatchObject({ t: 'str', v: 'one two' });
    expect(m[6][1].t).toBe('null');
    expect(m[7][1].t).toBe('null');
  });
  it('gives yaml.v3 errors, and says what the subset does not support', () => {
    const err = (t: string) => { try { parseYaml(t); return ''; } catch (e) { return (e as YamlError).message; } };
    expect(err('a:\n  b: 1\n c: 2\n')).toBe('yaml: line 3: did not find expected key');
    expect(err('a: 1\na: 2\n')).toBe('yaml: line 2: mapping key "a" already defined at line 1');
    expect(err('a:\n\tb: 1\n')).toBe('yaml: line 2: found character that cannot start any token');
    expect(err('a b\n')).toBe("yaml: line 1: could not find expected ':'");
    expect(err('a: &x 1\n')).toMatch(/^yaml: line 1: 模擬環境的 YAML 子集不支援錨點與別名/);
    expect(err('a:\n  <<: *b\n')).toMatch(/合併鍵/);
    expect(err('a: one\n  two\n')).toMatch(/跨行的純量/);
  });
  it('Go durations', () => {
    expect([parseDuration('5s'), parseDuration('1m30s'), parseDuration('500ms'), parseDuration('1h'), parseDuration('x')]).toEqual([5, 90, 0.5, 3600, null]);
    expect([durationText(5), durationText(90), durationText(0.5), durationText(3600), durationText(0)]).toEqual(['5s', '1m30s', '500ms', '1h0m0s', '0s']);
  });
});

describe('docker compose config', () => {
  it('prints the normalized project (interpolated, sorted, long syntax)', () => {
    const out = lab('cd shop', 'docker compose config').last.out;
    expect(out.slice(0, 4)).toEqual(['name: shop', 'services:', '  app:', '    build:']);
    expect(out).toEqual(expect.arrayContaining(['      context: /home/learner/shop', '      dockerfile: Dockerfile', '        condition: service_healthy', '        required: true',
      '      DATABASE_URL: postgres://postgres@db:5432/shop', '      - mode: ingress', '        target: 8000', '        published: "8080"', '        protocol: tcp',
      '        - CMD-SHELL', '        - pg_isready -U postgres', '      timeout: 3s', '      interval: 5s', '      retries: 5', '      POSTGRES_PASSWORD: example',
      '      - type: volume', '        source: pgdata', '        target: /var/lib/postgresql/data', '        volume: {}', '      default: null', 'networks:', '  default:', '    name: shop_default',
      'volumes:', '  pgdata:', '    name: shop_pgdata']));
    expect(lab('cd shop', 'docker compose config --services').last.out).toEqual(['app', 'cache', 'db']);
    expect(lab('cd shop', 'docker compose config -q').last).toMatchObject({ out: [], err: [] });
  });
  it('takes variables from the shell and .env, warns about unset ones and the obsolete version', () => {
    const r = lab('cd shop', "printf 'POSTGRES_PASSWORD=from-file\\n' > .env", 'docker compose config', 'export POSTGRES_PASSWORD=from-shell', 'docker compose config',
      "printf 'version: \"3.8\"\\nservices:\\n  web:\\n    image: alpine:${TAG}\\n    command: echo $$HOME ${MODE:-dev}\\n' > compose.yaml", 'docker compose config',
      "printf 'services:\\n  web:\\n    image: alpine:${TAG:?set TAG first}\\n' > compose.yaml", 'docker compose config').log;
    expect(r[2].out).toContain('      POSTGRES_PASSWORD: from-file');
    expect(r[4].out).toContain('      POSTGRES_PASSWORD: from-shell');
    expect(r[6].err).toEqual(['WARN[0000] The "TAG" variable is not set. Defaulting to a blank string.',
      'WARN[0000] /home/learner/shop/compose.yaml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion']);
    expect(r[6].out).toEqual(expect.arrayContaining(['      - echo', '      - $HOME', '      - dev', '    image: "alpine:"']));
    expect(r[8].err).toEqual(['error while interpolating services.web.image: required variable TAG is missing a value: set TAG first']);
  });
  it('validation errors', () => {
    const cfg = (yaml: string) => lab('mkdir p && cd p', `printf '${yaml}' > compose.yaml`, 'docker compose config').last;
    expect(lab('docker compose ps').last.err).toEqual(['no configuration file provided: not found']);
    expect(cfg('services:\\n  web:\\n    imgae: nginx\\n').err).toEqual(["validating /home/learner/p/compose.yaml: services.web additional properties 'imgae' not allowed"]);
    expect(cfg('servics:\\n  web:\\n    image: nginx\\n').err).toEqual(["validating /home/learner/p/compose.yaml: additional properties 'servics' not allowed"]);
    expect(cfg('services:\\n  web:\\n    image: alpine:3.21\\n    deploy:\\n      replicas: 2\\n').err[0]).toMatch(/^docker compose：模擬環境不支援 services\.web\.deploy/);
    expect(cfg('services:\\n  web:\\n    image: alpine:3.21\\n    depends_on: [dbb]\\n').err).toEqual(['service "web" depends on undefined service "dbb": invalid compose project']);
    expect(cfg('services:\\n  web:\\n    image: alpine:3.21\\n    volumes:\\n      - data:/data\\n').err).toEqual(['service "web" refers to undefined volume data: invalid compose project']);
    expect(cfg('services:\\n  web:\\n    image: alpine:3.21\\n    networks: [back]\\n').err).toEqual(['service "web" refers to undefined network back: invalid compose project']);
    expect(cfg('services:\\n  web:\\n    command: x\\n').err).toEqual(['service "web" has neither an image nor a build context specified: invalid compose project']);
    expect(cfg('services:\\n  a:\\n    image: x\\n    depends_on: [b]\\n  b:\\n    image: x\\n    depends_on: [a]\\n').err).toEqual(['dependency cycle detected: a -> b -> a']);
    expect(cfg('services:\\n  a:\\n    image: x\\n    depends_on:\\n      b:\\n        condition: healthy\\n  b:\\n    image: x\\n').err[0]).toMatch(/condition must be one of the following: "service_started", "service_healthy", "service_completed_successfully"$/);
    expect(cfg('services:\\n  web:\\n    image: x\\n   command: y\\n').err).toEqual(['yaml: line 4: did not find expected key']);
    expect(cfg('services:\\n  web:\\n    image: x\\n    ports:\\n      - "80"\\n').err[0]).toMatch(/模擬環境需要指定主機的連接埠/);
    expect(lab('mkdir p && cd p', "printf 'name: Demo\\nservices:\\n  web:\\n    image: x\\n' > compose.yaml", 'docker compose config').last.err[0]).toMatch(/^invalid project name "Demo": must consist only of lowercase/);
  });
  it('names the project after -p, COMPOSE_PROJECT_NAME, name: or the folder (normalized)', () => {
    expect(lab('mkdir My.App && cd My.App', "printf 'services:\\n  web:\\n    image: x\\n' > compose.yaml", 'docker compose config').last.out[0]).toBe('name: myapp');
    expect(lab('cd shop', 'docker compose -p demo config').last.out[0]).toBe('name: demo');
    expect(lab('cd shop', 'export COMPOSE_PROJECT_NAME=env1', 'docker compose config').last.out[0]).toBe('name: env1');
    expect(lab('docker compose -f shop/compose.yaml config --services').last.out).toEqual(['app', 'cache', 'db']);
  });
});

describe('docker compose up, ps, logs, down', () => {
  it('builds, pulls, creates the network and volume, and starts in dependency order, waiting for db to be healthy', () => {
    const r = lab('cd shop', 'docker compose up -d', 'docker compose ps', 'curl -s localhost:8080/', 'docker compose logs', 'date +%T');
    expect(events(r.log[1].err)).toEqual([' cache  Pulling', ' cache  Pulled', ' Service app  Built', ' Network shop_default  Creating', ' Network shop_default  Created',
      ' Volume "shop_pgdata"  Creating', ' Volume "shop_pgdata"  Created', ' Container shop-cache-1  Creating', ' Container shop-cache-1  Created', ' Container shop-db-1  Creating', ' Container shop-db-1  Created',
      ' Container shop-app-1  Creating', ' Container shop-app-1  Created', ' Container shop-cache-1  Starting', ' Container shop-cache-1  Started', ' Container shop-db-1  Starting', ' Container shop-db-1  Started',
      ' Container shop-db-1  Waiting', ' Container shop-db-1  Healthy', ' Container shop-app-1  Starting', ' Container shop-app-1  Started']);
    expect(r.log[1].err).toContain('#8 naming to docker.io/library/shop-app:latest done');
    expect(r.log[2].out).toEqual([
      'NAME           IMAGE         COMMAND                  SERVICE   CREATED         STATUS                                     PORTS',
      'shop-app-1     shop-app      "python app.py"          app       5 seconds ago   Up Less than a second (health: starting)   0.0.0.0:8080->8000/tcp, [::]:8080->8000/tcp',
      'shop-cache-1   redis:7.4     "docker-entrypoint.s…"   cache     5 seconds ago   Up 5 seconds                               6379/tcp',
      'shop-db-1      postgres:17   "docker-entrypoint.s…"   db        5 seconds ago   Up 5 seconds (healthy)                     5432/tcp',
    ]);
    expect(r.log[3].out).toEqual(['shop']);
    expect(r.log[4].out).toEqual(['cache-1  | * Ready to accept connections tcp', 'db-1     | LOG:  database system is ready to accept connections', 'app-1    | Listening at: http://0.0.0.0:8000']);
    // Waiting for the health check moved the clock (postgres needs 4 s; the first probe runs after the 5 s interval).
    expect(r.log[5].out).toEqual(['10:00:05']);
  });
  it('a second up leaves running containers; a change recreates; --build rebuilds', () => {
    const r = lab('cd shop', 'docker compose up -d', 'docker compose up -d', "sed -i 's/8080:8000/8081:8000/' compose.yaml", 'docker compose up -d', 'echo "print(2)" > app.py', 'docker compose up -d --build app').log;
    expect(events(r[2].err)).toEqual([' Container shop-cache-1  Running', ' Container shop-db-1  Running', ' Container shop-app-1  Running']);
    expect(events(r[4].err)).toEqual([' Container shop-cache-1  Running', ' Container shop-db-1  Running', ' Container shop-app-1  Recreate', ' Container shop-app-1  Recreated',
      ' Container shop-db-1  Waiting', ' Container shop-db-1  Healthy', ' Container shop-app-1  Starting', ' Container shop-app-1  Started']);
    expect(r[6].err).toContain('#7 [3/3] COPY app.py .');
    expect(events(r[6].err)).toContain(' Container shop-app-1  Recreated');
  });
  it('the default network resolves service names; volumes and containers are named after the project', () => {
    const r = lab('cd shop', 'docker compose up -d', 'docker run --rm --network shop_default alpine:3.21 getent hosts db', 'docker network ls --format "{{.Name}}"', 'docker volume ls -q',
      "docker inspect -f '{{json .NetworkSettings.Networks.shop_default.Aliases}} {{index .Config.Labels \"com.docker.compose.service\"}}' shop-db-1", 'docker compose exec app env').log;
    expect(r[2].out[0]).toMatch(/^172\.18\.0\.\d+\s+db$/);
    expect(r[3].out).toEqual(['bridge', 'host', 'none', 'shop_default']);
    expect(r[4].out).toEqual(['shop_pgdata']);
    expect(r[5].out).toEqual(['["shop-db-1","db"] db']);
    expect(r[6].out).toEqual(expect.arrayContaining(['DATABASE_URL=postgres://postgres@db:5432/shop', 'TERM=xterm']));
  });
  it('up without -d attaches: the logs, then the simulation says the services keep running', () => {
    const r = lab('cd shop', 'docker compose up');
    expect(r.last.out).toEqual(['Attaching to app-1, cache-1, db-1', 'cache-1  | * Ready to accept connections tcp', 'db-1     | LOG:  database system is ready to accept connections', 'app-1    | Listening at: http://0.0.0.0:8000']);
    expect(r.last.err.at(-1)).toMatch(/^（模擬環境沒有 Ctrl-C/);
  });
  it('logs --tail and -t, ps -a, --services, -q; stop, start, restart; exec errors and exit codes', () => {
    const r = lab('cd shop', 'docker compose up -d db', 'docker compose logs -t --tail 1 db', 'docker compose stop', 'docker compose ps', 'docker compose ps -a --services',
      'docker compose exec db ls', 'docker compose start', 'docker compose restart db', 'docker compose exec db sh -c "exit 4"', 'echo $?', 'docker compose exec web ls', 'docker compose ls').log;
    expect(r[2].out).toEqual(['db-1  | 2026-11-22T10:00:00.000000000Z LOG:  database system is ready to accept connections']);
    expect(events(r[3].err)).toEqual([' Container shop-db-1  Stopping', ' Container shop-db-1  Stopped']);
    expect(r[4].out).toEqual(['NAME      IMAGE     COMMAND   SERVICE   CREATED   STATUS    PORTS']);
    expect(r[5].out).toEqual(['db']);
    expect(r[6].err).toEqual(['service "db" is not running']);
    expect(events(r[7].err)).toEqual([' Container shop-db-1  Starting', ' Container shop-db-1  Started']);
    expect(events(r[8].err)).toEqual([' Container shop-db-1  Restarting', ' Container shop-db-1  Started']);
    expect(r[10].out).toEqual(['4']);
    expect(r[11].err).toEqual(['service "web" is not running']);
    expect(r[12].out).toEqual(['NAME      STATUS       CONFIG FILES', 'shop      running(1)   /home/learner/shop/compose.yaml']);
  });
  it('down removes containers and networks; -v the volumes too; nothing left is a warning', () => {
    const r = lab('cd shop', 'docker compose up -d', 'docker compose down', 'docker volume ls -q', 'docker compose down -v', 'docker compose down').log;
    expect(events(r[2].err)).toEqual([' Container shop-app-1  Stopping', ' Container shop-app-1  Stopped', ' Container shop-db-1  Stopping', ' Container shop-db-1  Stopped', ' Container shop-cache-1  Stopping',
      ' Container shop-cache-1  Stopped', ' Container shop-app-1  Removing', ' Container shop-app-1  Removed', ' Container shop-db-1  Removing', ' Container shop-db-1  Removed', ' Container shop-cache-1  Removing',
      ' Container shop-cache-1  Removed', ' Network shop_default  Removing', ' Network shop_default  Removed']);
    expect(r[3].out).toEqual(['shop_pgdata']);
    expect(events(r[4].err)).toEqual([' Volume shop_pgdata  Removing', ' Volume shop_pgdata  Removed']);
    expect(r[5].err).toEqual(['WARN[0000] Warning: No resource found to remove for project "shop".']);
  });
  it('pull and build, and the daemon permission', () => {
    const r = lab('cd shop', 'docker compose pull', 'docker compose build', 'docker images shop-app --format "{{.Repository}}:{{.Tag}}"').log;
    expect(events(r[1].err)).toEqual([' db  Pulling', ' db  Pulled', ' cache  Pulling', ' cache  Pulled', ' app  Skipped - No image to be pulled']);
    expect(events(r[2].err)).toEqual([' Service app  Built']);
    expect(r[3].out).toEqual(['shop-app:latest']);
    const outsider = session({ ...composeLab, accounts: { groups: [{ name: 'docker', gid: 988, members: [] }] } }, COMPOSE_PROFILE, 'cd shop', 'docker compose ps', 'docker compose config --services').log;
    expect(outsider[1].err[0]).toMatch(/^permission denied while trying to connect to the Docker daemon socket/);
    expect(outsider[2].out).toEqual(['app', 'cache', 'db']);
  });
});

describe('depends_on conditions and health checks', () => {
  const project = (yaml: string, ...more: string[]) => lab('mkdir p && cd p', `printf '${yaml}' > compose.yaml`, ...more);
  it('an unhealthy dependency stops up; no health check is an error; service_completed_successfully waits for exit 0', () => {
    const bad = project('services:\\n  app:\\n    image: alpine:3.21\\n    command: sleep infinity\\n    depends_on:\\n      db:\\n        condition: service_healthy\\n  db:\\n    image: postgres:17\\n    healthcheck:\\n      test: ["CMD", "curl", "-f", "http://localhost/"]\\n      interval: 3s\\n      retries: 2\\n',
      'docker compose up -d', "docker inspect -f '{{json .State.Health}}' p-db-1", 'docker compose ps -a --format "{{.Name}} {{.Status}}"');
    expect(bad.log[2].err.slice(-2)).toEqual([' Container p-db-1  Error', 'dependency failed to start: container p-db-1 is unhealthy']);
    expect(bad.log[2].status).toBe(1);
    expect(JSON.parse(bad.log[3].out[0])).toEqual({ Status: 'unhealthy', FailingStreak: 2, Log: [
      { Start: '2026-11-22T10:00:03.000000000Z', End: '2026-11-22T10:00:03.000000000Z', ExitCode: -1, Output: 'OCI runtime exec failed: exec failed: unable to start container process: exec: "curl": executable file not found in $PATH: unknown' },
      { Start: '2026-11-22T10:00:06.000000000Z', End: '2026-11-22T10:00:06.000000000Z', ExitCode: -1, Output: 'OCI runtime exec failed: exec failed: unable to start container process: exec: "curl": executable file not found in $PATH: unknown' }] });
    expect(bad.log[4].out).toEqual(['p-app-1 Created', 'p-db-1 Up 6 seconds (unhealthy)']);
    const none = project('services:\\n  app:\\n    image: alpine:3.21\\n    depends_on:\\n      db:\\n        condition: service_healthy\\n  db:\\n    image: alpine:3.21\\n    command: sleep infinity\\n', 'docker compose up -d');
    expect(none.last.err.at(-1)).toBe('dependency failed to start: container p-db-1 has no healthcheck configured');
    const migrate = (cmd: string) => project(`services:\\n  app:\\n    image: alpine:3.21\\n    command: sleep infinity\\n    depends_on:\\n      migrate:\\n        condition: service_completed_successfully\\n  migrate:\\n    image: alpine:3.21\\n    command: ${cmd}\\n`, 'docker compose up -d', 'date +%T');
    const ok = migrate('sleep 4');
    expect(events(ok.log[2].err).slice(-6)).toEqual([' Container p-migrate-1  Starting', ' Container p-migrate-1  Started', ' Container p-migrate-1  Waiting', ' Container p-migrate-1  Exited', ' Container p-app-1  Starting', ' Container p-app-1  Started']);
    expect(ok.log[3].out).toEqual(['10:00:04']);
    expect(migrate('["sh", "-c", "exit 3"]').log[2].err.at(-1)).toBe('service "migrate" didn\'t complete successfully: exit 3');
  });
  it('health in docker ps and inspect: starting, healthy after sleep; a container without one has no State.Health', () => {
    const r = lab('cd shop', 'docker compose up -d db', 'docker ps --format "{{.Names}} {{.Status}}"', 'docker compose exec db pg_isready -U postgres', 'sleep 5', 'docker ps --format "{{.Names}} {{.Status}}"',
      "docker inspect -f '{{.State.Health.Status}} {{.State.Health.FailingStreak}}' shop-db-1", 'docker compose exec db pg_isready', 'docker run -d --name w alpine:3.21 sleep infinity', "docker inspect -f '{{.State.Health.Status}}' w",
      "docker inspect -f '{{json .Config.Healthcheck}}' shop-db-1").log;
    expect(r[2].out).toEqual(['shop-db-1 Up Less than a second (health: starting)']);
    expect(r[3]).toMatchObject({ out: ['/var/run/postgresql:5432 - no response'], status: 2 });
    expect(r[5].out).toEqual(['shop-db-1 Up 5 seconds (healthy)']);
    expect(r[6].out).toEqual(['healthy 0']);
    expect(r[7].out).toEqual(['/var/run/postgresql:5432 - accepting connections']);
    expect(r[9].err).toEqual(['template: :1:2: executing "" at <.State.Health.Status>: nil pointer evaluating interface {}.Status']);
    expect(JSON.parse(r[10].out[0])).toEqual({ Test: ['CMD-SHELL', 'pg_isready -U postgres'], Interval: 5e9, Timeout: 3e9, Retries: 5 });
  });
  it('pg_isready -h over the network, and an image without pg_isready', () => {
    const r = lab('cd shop', 'docker compose up -d', 'docker compose exec db pg_isready -h db', 'docker compose exec app pg_isready -h db').log;
    expect(r[2].out).toEqual(['db:5432 - accepting connections']);
    expect(r[3].out[0]).toBe('OCI runtime exec failed: exec failed: unable to start container process: exec: "pg_isready": executable file not found in $PATH: unknown');
  });
  it('docker run --health-cmd and the other flags; HEALTHCHECK in a Dockerfile (history, inspect, NONE)', () => {
    const r = lab('docker run -d --name h --health-cmd "ls /" --health-interval 2s --health-retries 1 alpine:3.21 sleep infinity', 'docker ps --format "{{.Status}}"', 'sleep 2', 'docker ps --format "{{.Status}}"',
      'docker run -d --name f --health-cmd "false" --health-interval 1s --health-retries 2 alpine:3.21 sleep infinity', 'sleep 2', 'docker ps -f name=f --format "{{.Status}}"',
      "printf 'FROM alpine:3.21\\nHEALTHCHECK --interval=5s --retries=2 CMD ls /tmp || exit 1\\nCMD [\"sleep\", \"infinity\"]\\n' > Dockerfile", 'docker build -q -t hc .',
      'docker history --no-trunc --format "{{.CreatedBy}}" hc', "docker inspect -f '{{json .Config.Healthcheck}}' hc", 'docker run -d --name hc1 hc', 'sleep 5', 'docker ps -f name=hc1 --format "{{.Status}}"',
      'docker run -d --name hc2 --no-healthcheck hc', 'docker ps -f name=hc2 --format "{{.Status}}"', 'docker run --health-interval x alpine:3.21').log;
    expect(r[1].out).toEqual(['Up Less than a second (health: starting)']);
    expect(r[3].out).toEqual(['Up 2 seconds (healthy)']);
    expect(r[6].out).toEqual(['Up 2 seconds (unhealthy)']);
    expect(r[9].out[1]).toBe('HEALTHCHECK &{["CMD-SHELL" "ls /tmp || exit 1"] "5s" "0s" "0s" "0s" \'\\x02\'}');
    expect(JSON.parse(r[10].out[0])).toEqual({ Test: ['CMD-SHELL', 'ls /tmp || exit 1'], Interval: 5e9, Retries: 2 });
    expect(r[13].out).toEqual(['Up 5 seconds (healthy)']);
    expect(r[15].out).toEqual(['Up Less than a second']);
    expect(r[16].err).toEqual(['invalid argument "x" for "--health-interval" flag: time: invalid duration "x"', "See 'docker run --help'."]);
  });
});

describe('multi-stage builds', () => {
  it('builds the stages the target needs; only the final stage\'s layers are in the image', () => {
    const r = lab('cd api', 'docker build -t api:slim .', 'docker build -f Dockerfile.single -t api:fat .', 'docker images api --format "{{.Tag}} {{.Size}}"', 'docker history api:slim --format "{{.CreatedBy}}|{{.Size}}"',
      "docker image inspect -f '{{len .RootFS.Layers}}' api:slim").log;
    expect(r[1].err).toEqual(expect.arrayContaining(['#2 [internal] load metadata for docker.io/library/golang:1.23', '#3 [internal] load metadata for gcr.io/distroless/static-debian12:latest',
      '#11 [build 5/5] RUN go build -o /out/api ./cmd/api', '#11 DONE 6.4s', '#12 [stage-1 2/2] COPY --from=build /out/api /api', '#13 naming to docker.io/library/api:slim done']));
    expect(r[1].err.filter(l => / FROM /.test(l) && !l.includes('resolve'))).toEqual([
      '#5 [build 1/5] FROM docker.io/library/golang:1.23@sha256:75c2ce4495540d6fd34c717548bcc9851d55530dca4c58aedc3d3b2e10a304ec',
      '#6 [stage-1 1/2] FROM gcr.io/distroless/static-debian12:latest@sha256:6aab7c09555b5cc5bb4059f58367093e4e6dfb9f2cddde25bd1fedb05f397b7d']);
    // The single-stage build reuses the build cache of the same steps.
    expect(r[2].err).toContain('#9 CACHED');
    expect(r[3].out).toEqual(['fat 831MB', 'slim 10.4MB']);
    expect(r[4].out).toEqual(['ENTRYPOINT ["/api"]|0B', 'EXPOSE map[8000/tcp:{}]|0B', 'COPY --from=build /out/api /api # buildkit|8.4MB', '（模擬：課程沒有宣告第 2 層的指令）|1MB', 'ADD rootfs.tar.xz / # buildkit|1MB']);
  });
  it('a distroless image has no shell: docker exec sh is OCI\'s error; its program serves', () => {
    const r = lab('docker build -q -t api:slim api', 'docker run -d --name api -p 8000:8000 api:slim', 'curl -s localhost:8000/', 'docker exec api sh', 'echo $?', 'docker exec api ls /').log;
    expect(r[2].out).toEqual(['api']);
    expect(r[3].out).toEqual(['OCI runtime exec failed: exec failed: unable to start container process: exec: "sh": executable file not found in $PATH: unknown']);
    expect(r[4].out).toEqual(['127']);
  });
  it('--target, ARG before FROM, FROM a stage, COPY --from an image, FROM scratch, and the errors', () => {
    const r = lab('cd api', 'docker build -q --target build -t api:build .', 'docker images api:build --format "{{.Size}}"', 'docker build -q --build-arg GO_VERSION=9.9 .',
      "printf 'FROM alpine:3.21 AS a\\nRUN echo hi > /hi.txt\\nFROM a AS b\\nRUN cat /hi.txt\\nFROM scratch\\nCOPY --from=b /hi.txt /\\nCOPY --from=alpine:3.21 /etc/os-release /etc/\\n' > D2",
      'docker build -f D2 -t s .', 'docker images s --format "{{.Size}}"', 'docker run --rm s',
      "printf 'FROM alpine:3.21 AS a\\nFROM alpine:3.21\\nCOPY --from=a /missing /y\\n' > D3", 'docker build -f D3 .', "printf 'FROM alpine:3.21\\nADD --from=x a b\\n' > D4", 'docker build -f D4 .').log;
    expect(r[2].out).toEqual(['831MB']);
    expect(r[3].err.at(-1)).toBe('ERROR: failed to solve: golang:9.9: failed to resolve source metadata for docker.io/library/golang:9.9: docker.io/library/golang:9.9: not found');
    expect(r[5].err).toEqual(expect.arrayContaining(['#4 [a 1/2] FROM docker.io/library/alpine:3.21@sha256:795053282f9683237df3941280bfcf2e2cb4a10ce0737fc614ba80c7be6585ec', '#5 [stage-2 1/3] FROM scratch',
      '#6 [a 2/2] RUN echo hi > /hi.txt', '#7 [b 2/2] RUN cat /hi.txt', '#7 0.150 hi', '#8 [stage-2 2/3] COPY --from=b /hi.txt /', '#9 [stage-2 3/3] COPY --from=alpine:3.21 /etc/os-release /etc/']));
    // The image has the two copied files only (3 + 81 bytes).
    expect(r[6].out).toEqual(['84B']);
    expect(r[7].err).toEqual(['docker: Error response from daemon: no command specified.', "See 'docker run --help'."]);
    expect(r[9].err.at(-1)).toMatch(/^ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref [0-9a-f-]+::[0-9a-z]+: "\/missing": not found$/);
    expect(r[11].err.at(-1)).toBe('ERROR: failed to solve: 模擬環境的多階段建置請用 COPY --from（ADD 不支援 --from）');
  });
  it('a build tool that misses what it needs fails the RUN step', () => {
    const r = lab('rm api/go.mod', "printf 'FROM golang:1.23\\nWORKDIR /src\\nCOPY . .\\nRUN go build -o /out/api ./cmd/api\\n' > api/D", 'docker build -f api/D api').log;
    expect(r[2].err).toEqual(expect.arrayContaining(['#8 0.250 （模擬環境：go build -o /out/api ./cmd/api 需要的 go.mod 不存在）', 'ERROR: failed to solve: process "/bin/sh -c go build -o /out/api ./cmd/api" did not complete successfully: exit code: 1']));
  });
});

describe('registries', () => {
  it('login with --password-stdin stores the token in ~/.docker/config.json with Docker\'s warning; logout forgets it', () => {
    const r = lab(LOGIN, 'cat .docker/config.json', 'ls -l .docker/config.json', 'docker logout registry.example.com:5000', 'docker logout registry.example.com:5000', 'cat .docker/config.json').log;
    expect(r[0]).toMatchObject({ out: ['Login Succeeded'], err: ['WARNING! Your password will be stored unencrypted in /home/learner/.docker/config.json.', 'Configure a credential helper to remove this warning. See', 'https://docs.docker.com/go/credential-store/', ''] });
    expect(r[1].out).toEqual(['{', '\t"auths": {', '\t\t"registry.example.com:5000": {', `\t\t\t"auth": "${btoa(`ci:${CI_TOKEN}`)}"`, '\t\t}', '\t}', '}']);
    expect(r[2].out[0]).toMatch(/^-rw------- learner learner /);
    expect(r[3].out).toEqual(['Removing login credentials for registry.example.com:5000']);
    expect(r[4].out).toEqual(['Not logged in to registry.example.com:5000']);
    expect(r[5].out).toEqual(['{', '\t"auths": {}', '}']);
  });
  it('login errors', () => {
    const r = lab('docker login registry.example.com:5000 -u ci -p wrong-lesson-token', 'docker login registry.example.com:5000 -u ci', 'docker login registry.example.com:5000 --password-stdin',
      'docker login nope.example:5000 -u ci -p lesson-x-123', 'docker login', `docker login registry.example.com:5000 -u ci -p ${CI_TOKEN}`).log;
    expect(r[0].err).toEqual(['WARNING! Using --password via the CLI is insecure. Use --password-stdin.', 'Error response from daemon: Get "https://registry.example.com:5000/v2/": unauthorized: incorrect username or password']);
    expect(r[1].err).toEqual(['Error: Cannot perform an interactive login from a non TTY device']);
    expect(r[2].err).toEqual(['Error: Must provide --username with --password-stdin']);
    expect(r[3].err.at(-1)).toBe('Error response from daemon: Get "https://nope.example:5000/v2/": dial tcp: lookup nope.example on 127.0.0.53:53: no such host');
    expect(r[4].err[0]).toMatch(/^docker login：模擬環境的 Docker Hub 不需要登入/);
    expect(r[5].out).toEqual(['Login Succeeded']);
  });
  it('push: unauthorized, then Pushed, Layer already exists, Mounted from, the digest line; denied by repository; Docker Hub denies', () => {
    const r = lab('docker build -q -t registry.example.com:5000/team/api:1.0 api', 'docker push registry.example.com:5000/team/api:1.0', LOGIN, 'docker push registry.example.com:5000/team/api:1.0',
      'docker push registry.example.com:5000/team/api:1.0', 'docker tag registry.example.com:5000/team/api:1.0 registry.example.com:5000/team/api2:1.0', 'docker push registry.example.com:5000/team/api2:1.0',
      'docker tag registry.example.com:5000/team/api:1.0 registry.example.com:5000/other/api:1.0', 'docker push registry.example.com:5000/other/api:1.0', 'docker tag alpine:3.21 myapp:1', 'docker push myapp:1',
      'docker push registry.example.com:5000/team/nope', 'docker push registry.example.com:5000/team/api@sha256:' + '0'.repeat(64)).log;
    expect(r[1]).toMatchObject({ out: ['The push refers to repository [registry.example.com:5000/team/api]', '354d479d92a0: Preparing', '5105c79bdb32: Preparing', 'ffbf8714c573: Preparing'], err: ['unauthorized: authentication required'], status: 1 });
    const digest = 'sha256:548575ca036c099bd5e8169273a2caeb0135416f84a4ed90f4ee15065957cca2';
    expect(r[3].out).toEqual(['The push refers to repository [registry.example.com:5000/team/api]', '354d479d92a0: Pushed', '5105c79bdb32: Pushed', 'ffbf8714c573: Pushed', `1.0: digest: ${digest} size: 949`]);
    expect(r[4].out.slice(1, 4)).toEqual(['354d479d92a0: Layer already exists', '5105c79bdb32: Layer already exists', 'ffbf8714c573: Layer already exists']);
    expect(r[4].out[4]).toBe(`1.0: digest: ${digest} size: 949`);
    // The same content has the same digest under another name; the registry mounts the layers it has.
    expect(r[6].out).toEqual(['The push refers to repository [registry.example.com:5000/team/api2]', '354d479d92a0: Mounted from team/api', '5105c79bdb32: Mounted from team/api', 'ffbf8714c573: Mounted from team/api', `1.0: digest: ${digest} size: 949`]);
    expect(r[8].err).toEqual(['denied: requested access to the resource is denied']);
    expect(r[10]).toMatchObject({ out: ['The push refers to repository [docker.io/library/myapp]', '9551ee57b3e5: Preparing'], err: ['denied: requested access to the resource is denied'] });
    expect(r[11]).toMatchObject({ out: ['Using default tag: latest'], err: ['An image does not exist locally with the tag: registry.example.com:5000/team/nope'] });
    expect(r[12].err).toEqual(['cannot push a digest reference']);
  });
  it('a rebuilt image has a new digest; the tag moves unless the registry is immutable', () => {
    const r = lab('cat ghcr-token.txt | docker login ghcr.example -u ci --password-stdin', 'docker build -q -t ghcr.example/team/api:1.0 api', 'docker push ghcr.example/team/api:1.0',
      'echo "// v2" >> api/cmd/api/main.go', 'docker build -q -t ghcr.example/team/api:1.0 api', 'docker push ghcr.example/team/api:1.0', 'docker tag ghcr.example/team/api:1.0 ghcr.example/team/api:1.1',
      'docker push ghcr.example/team/api:1.1', LOGIN, 'docker tag ghcr.example/team/api:1.1 registry.example.com:5000/team/api:latest', 'docker push registry.example.com:5000/team/api:latest').log;
    expect(r[5].err).toEqual(["tag invalid: The image tag '1.0' already exists in the 'team/api' repository and cannot be overwritten because the repository is immutable."]);
    expect(r[5].out.slice(1)).toEqual(['ead09289a084: Pushed', '5105c79bdb32: Layer already exists', 'ffbf8714c573: Layer already exists']);
    expect(r[7].out.at(-1)).toBe('1.1: digest: sha256:4d64edb8398324534e2803c2c2b43af308f72e4a967a1edbaf97cc280fcfccd7 size: 949');
    expect(r[10].out.at(-1)).toBe('latest: digest: sha256:4d64edb8398324534e2803c2c2b43af308f72e4a967a1edbaf97cc280fcfccd7 size: 949');
  });
  it('pull from the registry by tag and by digest; unauthorized without login; manifest unknown; docker images --digests', () => {
    const web = 'registry.example.com:5000/team/web';
    const r = lab(`docker pull ${web}:1.0`, LOGIN, `docker pull ${web}:1.0`, `docker pull ${web}`, `docker images --digests ${web}`, `docker pull ${web}:9`, 'docker rmi registry.example.com:5000/team/web:1.0 registry.example.com:5000/team/web:latest',
      `docker pull ${web}@sha256:384cfbf52427989ae0d47dba36f7fb79e945e9e2995bd908379af6f528e8278e`, `docker images ${web}`, `docker run -d --name w -p 8090:80 ${web}@sha256:384cfbf52427989ae0d47dba36f7fb79e945e9e2995bd908379af6f528e8278e`,
      'curl -s localhost:8090/', 'docker ps --format "{{.Image}}"').log;
    expect(r[0].err).toEqual([`Error response from daemon: Head "https://registry.example.com:5000/v2/team/web/manifests/1.0": unauthorized: authentication required`]);
    expect(r[2].out).toEqual(['1.0: Pulling from team/web', '786b18f3190f: Pull complete', '5b24d9a28107: Pull complete', '9bd8ee1b29ea: Pull complete',
      'Digest: sha256:384cfbf52427989ae0d47dba36f7fb79e945e9e2995bd908379af6f528e8278e', `Status: Downloaded newer image for ${web}:1.0`, `${web}:1.0`]);
    expect(r[3].out).toEqual(['Using default tag: latest', 'latest: Pulling from team/web', '786b18f3190f: Already exists', '5b24d9a28107: Already exists', '9bd8ee1b29ea: Already exists',
      'Digest: sha256:384cfbf52427989ae0d47dba36f7fb79e945e9e2995bd908379af6f528e8278e', `Status: Downloaded newer image for ${web}:latest`, `${web}:latest`]);
    expect(r[4].out[1]).toMatch(/^registry\.example\.com:5000\/team\/web   1\.0       sha256:384cfbf52427989ae0d47dba36f7fb79e945e9e2995bd908379af6f528e8278e   [0-9a-f]{12}   7 days ago   40MB$/);
    expect(r[5].err).toEqual([`Error response from daemon: manifest for ${web}:9 not found: manifest unknown: manifest unknown`]);
    expect(r[6].out.slice(0, 3)).toEqual([`Untagged: ${web}:1.0`, `Untagged: ${web}:latest`, `Untagged: ${web}@sha256:384cfbf52427989ae0d47dba36f7fb79e945e9e2995bd908379af6f528e8278e`]);
    expect(r[6].out.slice(3).every(l => /^Deleted: sha256:[0-9a-f]{64}$/.test(l))).toBe(true);
    expect(r[7].out[0]).toBe('sha256:384cfbf52427989ae0d47dba36f7fb79e945e9e2995bd908379af6f528e8278e: Pulling from team/web');
    expect(r[8].out[1]).toMatch(/^registry\.example\.com:5000\/team\/web   <none>    [0-9a-f]{12}   7 days ago   40MB$/);
    expect(r[10].out).toEqual(['web 1.0']);
    expect(r[11].out).toEqual([`${web}@sha256:384cfbf52427989ae0d47dba36f7fb79e945e9e2995bd908379af6f528e8278e`]);
  });
  it('Docker Hub by digest; docker tag errors', () => {
    const r = lab('docker pull alpine@sha256:795053282f9683237df3941280bfcf2e2cb4a10ce0737fc614ba80c7be6585ec', 'docker pull redis@sha256:' + 'a'.repeat(64), 'docker tag alpine:3.21 App', 'docker tag nope:1 x', 'docker tag alpine:3.21').log;
    expect(r[0].out).toEqual(['sha256:795053282f9683237df3941280bfcf2e2cb4a10ce0737fc614ba80c7be6585ec: Pulling from library/alpine', 'Digest: sha256:795053282f9683237df3941280bfcf2e2cb4a10ce0737fc614ba80c7be6585ec',
      'Status: Image is up to date for alpine@sha256:795053282f9683237df3941280bfcf2e2cb4a10ce0737fc614ba80c7be6585ec', 'docker.io/library/alpine@sha256:795053282f9683237df3941280bfcf2e2cb4a10ce0737fc614ba80c7be6585ec']);
    expect(r[1].err).toEqual([`Error response from daemon: manifest for redis@sha256:${'a'.repeat(64)} not found: manifest unknown: manifest unknown`]);
    expect(r[2].err).toEqual(['Error parsing reference: "App" is not a valid repository/tag: invalid reference format: repository name (library/App) must be lowercase']);
    expect(r[3].err).toEqual(['Error response from daemon: No such image: nope:1']);
    expect(r[4].err[0]).toBe('"docker tag" requires exactly 2 arguments.');
  });
});

describe('checks and lesson data', () => {
  const x = (checks: TerminalExercise['checks']): TerminalExercise => ({ id: 'x', title: 'x', machine: 'cmp-01', statement: 's', checks, solution: ['true'], mistakes: [], hints: [], explanation: 'e' });
  it('compose, registry, image digest and container health checks', () => {
    const v = checkTerminalExercise(x([
      { kind: 'compose', project: 'shop', service: 'db', state: 'running', health: 'healthy' }, { kind: 'compose', project: 'shop', service: 'web', absent: true }, { kind: 'compose', project: 'shop', service: 'app', image: 'alpine:3.21' },
      { kind: 'registry', registry: 'registry.example.com:5000', repository: 'team/api', tag: '1.0', image: 'registry.example.com:5000/team/api:1.0' },
      { kind: 'registry', registry: 'registry.example.com:5000', repository: 'team/web', tag: 'latest', digest: 'sha256:384cfbf52427989ae0d47dba36f7fb79e945e9e2995bd908379af6f528e8278e' },
      { kind: 'registry', registry: 'registry.example.com:5000', repository: 'team/web', tag: '2.0', absent: true },
      { kind: 'image', name: 'registry.example.com:5000/team/api:1.0', digest: 'sha256:548575ca036c099bd5e8169273a2caeb0135416f84a4ed90f4ee15065957cca2', maxSize: 20_000_000 },
      { kind: 'container', name: 'shop-db-1', health: 'healthy' }, { kind: 'container', name: 'shop-app-1', health: 'healthy' },
    ]), [composeLab], ['docker build -q -t registry.example.com:5000/team/api:1.0 api', LOGIN, 'docker push registry.example.com:5000/team/api:1.0', 'cd shop', 'docker compose up -d']);
    expect(v.results.map(r => r.ok)).toEqual([true, true, false, true, true, true, true, true, false]);
    expect(v.results[2].message).toMatch(/shop-app-1 是由 shop-app 建立的$/);
    expect(v.results[8].message).toMatch(/它的健康狀態是 health: starting$/);
    expect(checkTerminalExercise(composeUpExercise, [composeLab], composeUpExercise.solution).ok).toBe(true);
    for (const m of composeUpExercise.mistakes) expect(checkTerminalExercise(composeUpExercise, [composeLab], m.commands).ok, m.why).toBe(false);
    expect(checkTerminalExercise(pushExercise, [composeLab], pushExercise.solution).ok).toBe(true);
    for (const m of pushExercise.mistakes) expect(checkTerminalExercise(pushExercise, [composeLab], m.commands).ok, m.why).toBe(false);
  });
  it('validates registries (fake lesson tokens only), tools, health checks and the E23 checks', () => {
    const bad: TerminalMachine = {
      ...composeLab, docker: {
        ...composeLab.docker,
        registries: [{ host: 'docker.io', users: [] }, { host: 'r.example', users: [{ name: 'ci', token: 'ghp_lessonABCDEFGHIJKLMNOP' }, { name: 'u2', token: 'abcdefgh12345678' }] }],
        tools: [{ command: [], writes: [{ path: '../x', size: -1 }] }],
        images: [...composeLab.docker!.images!, { name: 'x:1', size: 1, created: '2026-01-01 00:00:00', cmd: ['x'], healthcheck: { test: ['BAD'] }, ready: 99999, tags: ['2'] }],
      },
    };
    const p = machineProblems(bad).join('\n');
    expect(p).toContain('registry docker.io: a host name with a dot or a port (not Docker Hub), listed once');
    expect(p).toContain('registry r.example: user ci: the token must be an obviously fake lesson token');
    expect(p).toContain('registry r.example: user u2: the token must be an obviously fake lesson token');
    expect(p).toContain('tool ?: command needs 1..20 one-line words');
    expect(p).toContain('image golang:1.23: commands are among');
    expect(p).toContain('writes are at most 8 files');
    expect(p).toContain('image x:1: healthcheck.test is ["CMD", executable, …], ["CMD-SHELL", "line"] or ["NONE"]');
    expect(p).toContain('image x:1: ready is 0..3600 seconds');
    expect(p).toContain('image x:1: tags are other tags of an image of a registry the lesson declares');
    const r = replay(composeLab, ['cd shop', 'docker compose config --services', 'docker compose up -d db', 'docker compose ps --format "{{.Name}} {{.Status}}"']);
    const content = {
      machines: [composeLab],
      examples: [{ id: 'c', title: 'Compose', description: '啟動資料庫。', machine: 'cmp-01', steps: r.steps.map(s => ({ command: s.command, output: s.output })) }],
      exercises: [composeUpExercise, pushExercise],
    };
    expect(terminalContentProblems(content)).toEqual([]);
    const broken = { ...content, exercises: [{ ...composeUpExercise, checks: [{ kind: 'compose' as const, project: 'Bad', service: 'db' }, { kind: 'registry' as const, registry: 'x', repository: 'a', tag: '1', digest: 'nope' }] }] };
    expect(terminalContentProblems(broken).join('\n')).toContain('a compose check needs a project name');
    expect(terminalContentProblems(broken).join('\n')).toContain('a registry check needs a registry host');
    const low = { ...content, machines: [{ ...storageNetLab, id: 'cmp-01' }], examples: [] };
    expect(terminalContentProblems(low).join('\n')).toContain('a compose check needs a compose machine (engine stage E23)');
    expect(terminalContentProblems(low).join('\n')).toContain('a registry check needs a compose machine (engine stage E23)');
  });
  it('commands never change the state they were given', () => {
    const start = machineState(composeLab), nodes = JSON.stringify([...start.nodes]), docker = JSON.stringify(start.docker, (k, v) => v instanceof Map ? [...v] : v);
    run(start, 'cd shop && docker compose up -d', COMPOSE_PROFILE);
    run(start, LOGIN, COMPOSE_PROFILE);
    run(start, 'docker build -q -t registry.example.com:5000/team/api:1.0 api', COMPOSE_PROFILE);
    expect(JSON.stringify([...start.nodes])).toBe(nodes);
    expect(JSON.stringify(start.docker, (k, v) => v instanceof Map ? [...v] : v)).toBe(docker);
  });
});

import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { COMPOSE_PROFILE, run, RUNTIME_PROFILE } from '@/lib/terminal/shell';
import { RUNTIME_MANUAL } from '@/lib/terminal/manual';
import { afterExit, bytesText, normalizeCap, parseBytes, restartProblem, timeArg } from '@/lib/terminal/runtime';
import { checkTerminalExercise, machineProblems, machineState, profileOf, replay, terminalContentProblems, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import type { DockerContainer } from '@/lib/terminal/docker';
import { gracefulExercise, MIB, runtimeLab } from './support/runtime-fixture';
import { composeLab } from './support/compose-fixture';

/*
 * Engine stage E24 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §14): the runtime profile — what a container's main process
 * does over time (needed environment variables, its own exit, memory, signals, writes and capabilities, as the lesson
 * declares them), exit codes and docker logs --since, memory limits and the OOM kill (137, OOMKilled), restart policies
 * (moby's backoff, on-failure:N, Restarting (1) …), docker stop's grace period and PID 1 (shell form, exec form, --init),
 * STOPSIGNAL, docker kill, stats, top, update, wait and events, the runtime fields of docker inspect and Go's template
 * functions, --read-only, --cap-drop and the other security options, the three E23 carry-over fixes, and the checks.
 * Below the profile the new flags and commands say E24.
 */
function session(from: FsState | TerminalMachine, profile = RUNTIME_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; status?: number }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), status: r.state.status });
  }
  return { state, log, last: log.at(-1)! };
}
const lab = (...commands: string[]) => session(runtimeLab, RUNTIME_PROFILE, ...commands);
const BUILD_EXEC = 'docker build -q -t api:exec -f api/Dockerfile.exec api', BUILD_SHELL = 'docker build -q -t api:shell api';
const STATUS = 'docker ps -a --format "{{.Names}} {{.Status}}"';
const OCI = 'docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec:';

describe('the runtime profile', () => {
  it('is the compose profile with the runtime feature and no new commands', () => {
    expect([...RUNTIME_PROFILE.commands]).toEqual([...COMPOSE_PROFILE.commands]);
    expect(RUNTIME_PROFILE.features).toEqual([...COMPOSE_PROFILE.features!, 'runtime']);
    expect(profileOf(runtimeLab)).toBe(RUNTIME_PROFILE);
    expect(machineProblems(runtimeLab)).toEqual([]);
  });
  it('below it, the new flags and commands say engine stage E24 and the old messages stay', () => {
    const low = session(composeLab, COMPOSE_PROFILE, 'docker run -m 64m alpine:3.21 true', 'docker run --memory=64m alpine:3.21 true', 'docker run --restart always alpine:3.21 true',
      'docker run --read-only alpine:3.21 true', 'docker run --cap-drop ALL alpine:3.21 true', 'docker run --init alpine:3.21 true', 'docker run --cpus 1 alpine:3.21 true', 'docker run -dc 512 alpine:3.21 true',
      'docker stats', 'docker kill x', 'docker top x', 'docker events', 'docker update x', 'docker wait x', 'docker pause x', 'docker logs --since 1m x',
      "printf 'FROM alpine:3.21\\nSTOPSIGNAL SIGQUIT\\n' > S", 'docker build -f S .', 'docker container kill x', 'docker scout cves alpine:3.21').log;
    const stage = 'E24（健康檢查、資源限制與重新啟動）';
    expect(low[0].err).toEqual([`docker run -m：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[0].status).toBe(125);
    expect(low[1].err).toEqual([`docker run --memory：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[2].err).toEqual([`docker run --restart：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[3].err).toEqual([`docker run --read-only：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[4].err).toEqual([`docker run --cap-drop：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[5].err).toEqual([`docker run --init：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[6].err).toEqual([`docker run --cpus：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[7].err).toEqual([`docker run -c：模擬環境在引擎階段 ${stage} 才支援`]);
    for (const [k, cmd] of [[8, 'stats'], [9, 'kill'], [10, 'top'], [11, 'events'], [12, 'update'], [13, 'wait'], [14, 'pause']] as const) expect(low[k].err).toEqual([`docker ${cmd}：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[15].err).toEqual([`docker logs --since：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[17].err).toContain(`ERROR: failed to solve: STOPSIGNAL：模擬環境在引擎階段 ${stage} 才支援`);
    expect(low[18].err).toEqual([`docker container kill：模擬環境在引擎階段 ${stage} 才支援`]);
    expect(low[19].err).toEqual(["docker: 'scout' is not a docker command.", "See 'docker --help'"]);
    // The E24 data needs the profile.
    const p = machineProblems({ ...runtimeLab, profile: 'compose' }).join('\n');
    expect(p).toContain('image nginx:1.27: stopSignal and the runtime fields (needsEnv, missingEnv, exitAfter, memory, cpu, pids, signals, writes, readOnlyError, caps, capMissing) need the runtime profile (engine stage E24)');
    expect(p).toContain('program node server.js: the runtime fields');
    expect(p).toContain('container old-worker: restart, memory, memorySwap, cpus, init, readOnly, tmpfs, capAdd, capDrop, securityOpt, privileged, stopSignal, stopTimeout, restartCount and oomKilled need the runtime profile (engine stage E24)');
  });
  it('has its manual page and help line; docker lists events, kill, stats, top, update and wait', () => {
    expect(lab('docker --help').last.out[0]).toBe(`用法：${RUNTIME_MANUAL.usage}`);
    expect(lab('help').last.out.find(l => l.startsWith('  docker '))).toMatch(/^ {2}docker stats\|top\|kill\|update\|wait\|events\|compose\|/);
    const top = lab('docker').last.out;
    const commands = top.slice(top.indexOf('Commands:') + 1, top.indexOf('', top.indexOf('Commands:'))).map(l => l.trim().split(/\s+/)[0]);
    expect(commands).toEqual(['events', 'history', 'inspect', 'kill', 'logs', 'port', 'restart', 'rm', 'rmi', 'start', 'stats', 'stop', 'tag', 'top', 'update', 'wait']);
    expect(lab('docker pause web').last.err[0]).toMatch(/^docker pause：模擬環境不支援/);
    expect(lab('docker scout cves nginx:1.27').last.err[0]).toMatch(/^docker scout：模擬環境不模擬弱點掃描工具/);
  });
});

describe('exit codes, logs and the main process at its start', () => {
  it('a program without the environment variable it needs prints its error and exits 1', () => {
    const r = lab(BUILD_SHELL, 'docker run -d --name api api:shell', STATUS, 'docker logs api', 'docker inspect -f "{{.State.ExitCode}} {{.State.Status}} {{.State.OOMKilled}}" api', 'docker run --name api2 api:shell').log;
    expect(r[2].out).toEqual(['api Exited (1) Less than a second ago', 'old-worker Exited (137) 59 minutes ago']);
    expect(r[3].err).toEqual(['Error: DATABASE_URL is not set', '    at main (/app/server.js:3:11)']);
    expect(r[4].out).toEqual(['1 exited false']);
    expect(r[5].err).toEqual(['Error: DATABASE_URL is not set', '    at main (/app/server.js:3:11)']);
    expect(r[5].status).toBe(1);
    // With it, the server runs.
    expect(lab(BUILD_SHELL, 'docker run -d --name api -e DATABASE_URL=postgres://db/app api:shell', 'docker ps --format "{{.Names}} {{.Status}}"').last.out).toEqual(['api Up Less than a second']);
  });
  it('a program that dies later: attached, docker run waits for it (the clock moves); docker logs --since, --until and -t', () => {
    const r = lab(BUILD_EXEC, 'docker run --name c api:exec node crash.js', 'date', 'docker logs -t c', 'docker logs --since 2s c', 'docker logs --until 2s c', 'docker logs --since 2026-11-22T10:00:02Z c', 'docker logs --since x c').log;
    expect(r[1].out).toEqual(['connecting to the database']);
    expect(r[1].err).toEqual(['Error: connect ECONNREFUSED 10.0.0.5:5432']);
    expect(r[1].status).toBe(1);
    expect(r[2].out).toEqual(['Sun Nov 22 10:00:03 UTC 2026']);
    expect(r[3].out).toEqual(['2026-11-22T10:00:00.000000000Z connecting to the database']);
    expect(r[3].err).toEqual(['2026-11-22T10:00:03.000000000Z Error: connect ECONNREFUSED 10.0.0.5:5432']);
    expect([r[4].out, r[4].err]).toEqual([[], ['Error: connect ECONNREFUSED 10.0.0.5:5432']]);
    expect([r[5].out, r[5].err]).toEqual([['connecting to the database'], []]);
    expect(r[6].err).toEqual(['Error: connect ECONNREFUSED 10.0.0.5:5432']);
    expect(r[7].err).toEqual(['Error response from daemon: invalid value for "since": failed to parse value as time or duration: "x"']);
    // Detached, it runs until then.
    const d = lab(BUILD_EXEC, 'docker run -d --name c api:exec node crash.js', 'sleep 2', STATUS, 'sleep 1', STATUS).log;
    expect(d[3].out[0]).toBe('c Up 2 seconds');
    expect(d[5].out[0]).toBe('c Exited (1) Less than a second ago');
  });
  it('the exit codes: 0, 1, 137 (SIGKILL), 143 (SIGTERM)', () => {
    const r = lab(BUILD_EXEC, 'docker run --name ok alpine:3.21 true', 'docker run --name one api:exec node boom.js', 'docker run -d --name k api:exec node plain.js', 'docker kill k',
      'docker run -d --init --name t api:exec node plain.js', 'docker stop t', STATUS).log;
    expect(r[2].err).toEqual(['Error: boom']);
    expect(r[4].out).toEqual(['k']);
    expect(r[7].out).toEqual(['t Exited (143) Less than a second ago', 'k Exited (137) Less than a second ago', 'one Exited (1) Less than a second ago', 'ok Exited (0) Less than a second ago', 'old-worker Exited (137) 59 minutes ago']);
  });
});

describe('resource limits and the OOM kill', () => {
  it('memory that grows past -m is OOM-killed (137, OOMKilled) when it crosses the limit; without a limit it runs', () => {
    const r = lab(BUILD_EXEC, 'docker run -d --name w -m 64m api:exec node worker.js', 'docker run -d --name free api:exec node worker.js', 'sleep 3', STATUS, 'sleep 1', STATUS,
      'docker inspect -f "{{.State.OOMKilled}} {{.State.ExitCode}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}}" w', 'docker inspect -f "{{.State.FinishedAt}}" w').log;
    expect(r[4].out.slice(0, 2)).toEqual(['free Up 3 seconds', 'w Up 3 seconds']);
    expect(r[6].out.slice(0, 2)).toEqual(['free Up 4 seconds', 'w Exited (137) Less than a second ago']);
    expect(r[7].out).toEqual(['true 137 67108864 134217728']);
    // (64 MiB − 30 MB) / 10 MB a second, to the millisecond.
    expect(r[8].out).toEqual(['2026-11-22T10:00:03.711Z']);
    // Over the limit at its start: killed at once; attached, docker run returns 137.
    const now = lab(BUILD_EXEC, 'docker run -m 16m api:exec node worker.js').last;
    expect([now.out, now.status]).toEqual([['worker started'], 137]);
    const lesson = lab('docker inspect -f "{{.State.OOMKilled}} {{.State.ExitCode}} {{.HostConfig.Memory}}" old-worker').last.out;
    expect(lesson).toEqual(['true 137 67108864']);
  });
  it('docker stats --no-stream: CPU %, MEM USAGE / LIMIT, MEM %, NET I/O, BLOCK I/O, PIDS', () => {
    const r = lab(BUILD_EXEC, 'docker run -d --name a -m 256m --cpus 0.5 -e DATABASE_URL=x api:exec', 'docker run -d --name w -m 128m api:exec node worker.js', 'docker run -d --name web nginx:1.27',
      'docker stats --no-stream', 'sleep 5', 'docker stats --no-stream --format "{{.Name}}: {{.MemUsage}} {{.MemPerc}} {{.CPUPerc}} {{.PIDs}}"', 'docker stats -a --no-stream old-worker', 'docker stats').log;
    expect(r[4].out).toEqual([
      'CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O   BLOCK I/O   PIDS',
      expect.stringMatching(/^[0-9a-f]{12} {3}web {7}0\.00% {5}7\.598MiB \/ 2GiB {5}0\.37% {5}0B \/ 0B {3}0B \/ 0B {5}3$/),
      expect.stringMatching(/^[0-9a-f]{12} {3}w {9}25\.00% {4}28\.61MiB \/ 128MiB {3}22\.35% {4}0B \/ 0B {3}0B \/ 0B {5}1$/),
      expect.stringMatching(/^[0-9a-f]{12} {3}a {9}1\.50% {5}50MiB \/ 256MiB {6}19\.53% {4}0B \/ 0B {3}0B \/ 0B {5}1$/),
    ]);
    expect(r[6].out).toEqual(['web: 7.598MiB / 2GiB 0.37% 0.00% 3', 'w: 76.29MiB / 128MiB 59.60% 25.00% 1', 'a: 50MiB / 256MiB 19.53% 1.50% 1']);
    expect(r[7].out[1]).toMatch(/^[0-9a-f]{12} {3}old-worker {3}0\.00% {5}0B \/ 0B {13}0\.00% {5}0B \/ 0B {3}0B \/ 0B {5}0$/);
    expect(r[8].err).toEqual(['（模擬環境：docker stats 不會持續更新畫面，只印出一次；要讀一次的數字請加 --no-stream）']);
    // --cpus caps the CPU %.
    expect(lab(BUILD_EXEC, 'docker run -d --name w --cpus 0.1 api:exec node worker.js', 'docker stats --no-stream --format "{{.CPUPerc}}"').last.out).toEqual(['10.00%']);
  });
  it('docker update changes limits at once (an OOM kill comes later, or now) and checks them', () => {
    const r = lab(BUILD_EXEC, 'docker run -d --name w -m 64m api:exec node worker.js', 'docker update -m 1g --memory-swap 2g w', 'sleep 30', STATUS, 'docker update -m 3g w',
      'docker update -m 300m w', STATUS, 'docker update --cpus 3 w', 'docker update w', 'docker update --restart sometimes w', 'docker update --restart on-failure:2 w',
      'docker inspect -f "{{.HostConfig.RestartPolicy}} {{.HostConfig.Memory}} {{.State.FinishedAt}}" w').log;
    expect(r[2].out).toEqual(['w']);
    expect(r[4].out[0]).toBe('w Up 30 seconds');
    expect(r[5].err[0]).toMatch(/^Error response from daemon: Cannot update container [0-9a-f]{64}: Memory limit should be smaller than already set memoryswap limit, update the memoryswap at the same time$/);
    // It already uses 330 MB: over 300 MiB, it is killed now.
    expect(r[7].out[0]).toBe('w Exited (137) Less than a second ago');
    expect(r[8].err).toEqual(['Error response from daemon: Range of CPUs is from 0.01 to 2.00, as there are only 2 CPUs available']);
    expect(r[9].err).toEqual(['You must provide one or more flags when using this command.']);
    expect(r[10].err[0]).toMatch(/^Error response from daemon: invalid restart policy: unknown policy 'sometimes'/);
    expect(r[12].out).toEqual(['{on-failure 2} 314572800 2026-11-22T10:00:30Z']);
  });
  it('docker run checks the flags (the CLI first, then the daemon)', () => {
    const r = lab('docker run -m 1m alpine:3.21 true', 'docker run -m abc alpine:3.21 true', 'docker run --memory-swap 1g alpine:3.21 true', 'docker run -m 64m --memory-swap 32m alpine:3.21 true',
      'docker run --cpus 4 alpine:3.21 true', 'docker run --cpus abc alpine:3.21 true', 'docker run --restart sometimes alpine:3.21 true', 'docker run --restart always:3 alpine:3.21 true',
      'docker run --restart on-failure:x alpine:3.21 true', 'docker run --rm --restart always alpine:3.21 true', 'docker run --cap-add FOO alpine:3.21 true', 'docker run --stop-signal SIGFOO alpine:3.21 true',
      'docker run --security-opt x alpine:3.21 true', 'docker run --stop-timeout x alpine:3.21 true').log;
    const see = "See 'docker run --help'.";
    expect(r[0].err).toEqual(['docker: Error response from daemon: Minimum memory limit allowed is 6MB.', see]);
    expect(r[1].err).toEqual(['invalid argument "abc" for "-m, --memory" flag: invalid size: \'abc\'', see]);
    expect(r[2].err).toEqual(['docker: Error response from daemon: You should always set the Memory limit when using Memoryswap limit, see usage.', see]);
    expect(r[3].err).toEqual(['docker: Error response from daemon: Minimum memoryswap limit should be larger than memory limit, see usage.', see]);
    expect(r[4].err).toEqual(['docker: Error response from daemon: Range of CPUs is from 0.01 to 2.00, as there are only 2 CPUs available.', see]);
    expect(r[5].err).toEqual(['invalid argument "abc" for "--cpus" flag: failed to parse abc as a rational number', see]);
    expect(r[6].err).toEqual(["docker: Error response from daemon: invalid restart policy: unknown policy 'sometimes'; use one of 'no', 'always', 'on-failure', or 'unless-stopped'.", see]);
    expect(r[7].err).toEqual(["docker: Error response from daemon: invalid restart policy: maximum retry count can only be used with 'on-failure'.", see]);
    expect(r[8].err).toEqual(['docker: invalid restart policy format: maximum retry count must be an integer.', see]);
    expect(r[9].err).toEqual(['docker: Conflicting options: --restart and --rm.', see]);
    expect(r[10].err).toEqual(['docker: Error response from daemon: invalid CapAdd: unknown capability: "CAP_FOO".', see]);
    expect(r[11].err).toEqual(['docker: Error response from daemon: Invalid signal: SIGFOO.', see]);
    expect(r[12].err).toEqual(['docker: Error response from daemon: invalid --security-opt 2: "x".', see]);
    expect(r[13].err).toEqual(['invalid argument "x" for "--stop-timeout" flag: strconv.ParseInt: parsing "x": invalid syntax', see]);
    for (const x of r) expect(x.status).toBe(125);
  });
});

describe('restart policies', () => {
  it('always: Restarting (1) …, RestartCount grows with moby\'s backoff (100 ms doubled, at most a minute)', () => {
    const r = lab(BUILD_EXEC, 'docker run -d --name b --restart always api:exec node boom.js', 'docker ps', 'sleep 2', 'docker ps --format "{{.Status}} {{.State}}"',
      'docker inspect -f "{{.RestartCount}} {{.State.Status}} {{.State.Running}} {{.State.Restarting}} {{.State.StartedAt}} {{.State.FinishedAt}}" b', 'sleep 100',
      'docker inspect -f "{{.RestartCount}}" b', 'docker ps -f status=restarting -q | wc -l', 'docker rm b', 'docker stop b', STATUS, 'docker rm b').log;
    expect(lab(BUILD_EXEC, 'docker run -d --name b --restart always api:exec node boom.js', 'docker exec b ls').last.err[0]).toMatch(/^Error response from daemon: Container [0-9a-f]{64} is restarting, wait until the container is running$/);
    expect(r[2].out[1]).toMatch(/^[0-9a-f]{12} {3}api:exec {3}"node boom\.js" {3}Less than a second ago {3}Restarting \(1\) Less than a second ago {13}b$/);
    expect(r[4].out).toEqual(['Restarting (1) Less than a second ago restarting']);
    // Restarts at 0.1, 0.3, 0.7 and 1.5 s; each run ended at once.
    expect(r[5].out).toEqual(['5 restarting true true 2026-11-22T10:00:01.5Z 2026-11-22T10:00:01.5Z']);
    // Then 3.1, 6.3, 12.7, 25.5 and 51.1 s; the next one is at 102.3 s.
    expect(r[7].out).toEqual(['10']);
    expect(r[8].out).toEqual(['1']);
    expect(r[9].err).toEqual(['Error response from daemon: cannot remove container "/b": container is restarting: stop the container before removing or force remove']);
    expect(r[10].out).toEqual(['b']);
    expect(r[11].out[0]).toBe('b Exited (1) 50 seconds ago');
    expect(r[12].out).toEqual(['b']);
  });
  it('on-failure:N gives up after N restarts; a run of ten seconds resets the backoff; exit 0 is not restarted', () => {
    const r = lab(BUILD_EXEC, 'docker run -d --name c --restart on-failure:3 api:exec node crash.js', 'sleep 60', STATUS, 'docker inspect -f "{{.RestartCount}} {{.State.ExitCode}} {{.HostConfig.RestartPolicy}}" c',
      'docker logs c', 'docker run -d --name z --restart on-failure alpine:3.21 true', 'sleep 1', 'docker inspect -f "{{.RestartCount}} {{.State.Status}}" z').log;
    expect(r[3].out[0]).toBe('c Exited (1) 47 seconds ago');
    expect(r[4].out).toEqual(['3 1 {on-failure 3}']);
    expect(r[5].out).toEqual(Array(4).fill('connecting to the database'));
    expect(r[8].out).toEqual(['0 exited']);
    const base: DockerContainer = { id: 'x', name: 'x', ref: 'x', image: 'x', path: 'x', args: [], cmd: [], custom: false, created: 0, started: 0, status: 'exited', exitCode: 1, ports: [], env: [], workdir: '/', rm: false, tty: false, interactive: false, logs: [], nodes: new Map(), execs: 0, restart: 'always' };
    expect(afterExit({ ...base, backoff: 800 }, 5)).toMatchObject({ backoff: 1600, restartAt: 6.6, restartCount: 1 });
    expect(afterExit({ ...base, backoff: 800 }, 12)).toMatchObject({ backoff: 100, restartAt: 12.1 });
    expect(afterExit({ ...base, backoff: 60_000 }, 5)).toMatchObject({ backoff: 60_000, restartAt: 65 });
    expect(afterExit({ ...base, restart: 'unless-stopped', manualStop: true }, 5).restartAt).toBeUndefined();
    expect(afterExit({ ...base, restart: 'on-failure', exitCode: 0 }, 5).restartAt).toBeUndefined();
  });
  it('docker kill restarts an always container, not an unless-stopped one; docker stop never; an unhealthy container is not restarted', () => {
    const r = lab('docker run -d --name a --restart always nginx:1.27', 'docker run -d --name u --restart unless-stopped nginx:1.27', 'docker kill a u', 'sleep 1', STATUS,
      'docker stop a', 'sleep 5', STATUS, 'docker start u', 'docker inspect -f "{{.RestartCount}}" a',
      'docker run -d --name h --restart always --health-cmd false --health-interval 1s --health-retries 1 nginx:1.27', 'sleep 5', 'docker ps -f name=h --format "{{.Status}}"', 'docker inspect -f "{{.RestartCount}}" h').log;
    expect(r[4].out.slice(0, 2)).toEqual(['u Exited (137) 1 second ago', 'a Up Less than a second']);
    expect(r[7].out.slice(0, 2)).toEqual(['u Exited (137) 7 seconds ago', 'a Exited (0) 5 seconds ago']);
    expect(r[8].out).toEqual(['u']);
    expect(r[9].out).toEqual(['1']);
    expect(r[12].out).toEqual(['Up 5 seconds (unhealthy)']);
    expect(r[13].out).toEqual(['0']);
  });
  it('Compose\'s restart: is honoured', () => {
    const r = lab('mkdir p', 'cd p', "printf 'services:\\n  job:\\n    image: alpine:3.21\\n    command: [\"false\"]\\n    restart: on-failure:2\\n' > compose.yaml", 'docker compose up -d', 'sleep 5',
      'docker inspect -f "{{.RestartCount}} {{.HostConfig.RestartPolicy}} {{.State.ExitCode}}" p-job-1').log;
    expect(r[5].out).toEqual(['2 {on-failure 2} 1']);
  });
});

describe('stopping, signals and PID 1', () => {
  it('a shell-form CMD: sh is PID 1 and does not pass SIGTERM on, so docker stop waits 10 s and kills it (137); the exec form stops in 2 s (0)', () => {
    const r = lab(BUILD_SHELL, BUILD_EXEC, 'docker run -d --name s -e DATABASE_URL=x api:shell', 'docker run -d --name e -e DATABASE_URL=x api:exec', 'docker exec s ps', 'docker exec e ps',
      'docker stop s', 'date', 'docker stop e', 'date', STATUS, 'docker logs e', 'docker events --since 1m --until 0s --filter container=s').log;
    expect(r[4].out).toEqual(['    PID TTY          TIME CMD', '      1 ?        00:00:00 sh', '      7 ?        00:00:00 node', '      8 ?        00:00:00 ps']);
    expect(r[5].out).toEqual(['    PID TTY          TIME CMD', '      1 ?        00:00:00 node', '      7 ?        00:00:00 ps']);
    expect(r[7].out).toEqual(['Sun Nov 22 10:00:10 UTC 2026']);
    expect(r[9].out).toEqual(['Sun Nov 22 10:00:12 UTC 2026']);
    expect(r[10].out.slice(0, 2)).toEqual(['e Exited (0) Less than a second ago', 's Exited (137) 2 seconds ago']);
    expect(r[11].out).toEqual(['api listening on :3000', 'SIGTERM received, closing connections']);
    expect(r[12].out.map(l => l.replace(/ [0-9a-f]{64} /, ' ID ').replace(/ \(.*\)$/, ''))).toEqual(['2026-11-22T10:00:00.000000000Z container create ID', '2026-11-22T10:00:00.000000000Z container start ID',
      '2026-11-22T10:00:00.000000000Z container kill ID', '2026-11-22T10:00:10.000000000Z container kill ID', '2026-11-22T10:00:10.000000000Z container die ID', '2026-11-22T10:00:10.000000000Z container stop ID']);
    expect(r[12].out[2]).toMatch(/\(image=api:shell, name=s, signal=15\)$/);
    expect(r[12].out[4]).toMatch(/\(execDuration=10, exitCode=137, image=api:shell, name=s\)$/);
  });
  it('docker stop -t and -s, docker kill -s, docker restart; a PID 1 without a handler ignores SIGTERM', () => {
    const r = lab(BUILD_EXEC, 'docker run -d --name p api:exec node plain.js', 'docker kill -s TERM p', 'docker ps --format "{{.Names}} {{.Status}}"', 'docker stop -t 2 p', 'date',
      'docker run -d --name e -e DATABASE_URL=x api:exec', 'docker kill -s SIGTERM e', 'sleep 2', STATUS, 'docker run -d --name n nginx:1.27', 'docker stop -s KILL n', 'docker stop -t x n', 'docker stop -s FOO n',
      'docker kill old-worker', 'docker kill -s FOO n', 'docker restart e', 'docker inspect -f "{{.RestartCount}} {{.State.Status}}" e', 'date').log;
    expect(r[2].out).toEqual(['p']);
    expect(r[3].out).toEqual(['p Up Less than a second']);
    expect(r[5].out).toEqual(['Sun Nov 22 10:00:02 UTC 2026']);
    expect(r[9].out[0]).toBe('e Exited (0) Less than a second ago');
    expect(r[11].out).toEqual(['n']);
    expect(r[12].err).toEqual(['invalid argument "x" for "-t, --timeout" flag: strconv.ParseInt: parsing "x": invalid syntax', "See 'docker stop --help'."]);
    expect(r[13].err).toEqual(['Error response from daemon: Invalid signal: FOO']);
    expect(r[14].err[0]).toMatch(/^Error response from daemon: cannot kill container: old-worker: container [0-9a-f]{64} is not running$/);
    expect(r[16].out).toEqual(['e']);
    expect(r[17].out).toEqual(['0 running']);
  });
  it('--init: docker-init is PID 1 and passes signals on (a program without a handler dies of SIGTERM: 143; under sh -c, sh dies of it)', () => {
    const r = lab(BUILD_SHELL, BUILD_EXEC, 'docker run -d --name i --init -e DATABASE_URL=x api:exec', 'docker exec i ps', 'docker top i', 'docker stop i', 'docker run -d --name is --init -e DATABASE_URL=x api:shell',
      'docker exec is ps', 'docker stop is', STATUS, 'docker inspect -f "{{.HostConfig.Init}} {{.Path}}" i', 'ps -ef | grep docker-init').log;
    expect(r[3].out).toEqual(['    PID TTY          TIME CMD', '      1 ?        00:00:00 docker-init', '      7 ?        00:00:00 node', '      8 ?        00:00:00 ps']);
    expect(r[4].out).toEqual([
      'UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD',
      'root                902                 901                 0                   10:00               ?                   00:00:00            /sbin/docker-init -- node server.js',
      'root                903                 902                 0                   10:00               ?                   00:00:00            node server.js',
    ]);
    expect(r[7].out).toEqual(['    PID TTY          TIME CMD', '      1 ?        00:00:00 docker-init', '      7 ?        00:00:00 sh', '      8 ?        00:00:00 node', '      9 ?        00:00:00 ps']);
    expect(r[9].out.slice(0, 2)).toEqual(['is Exited (143) Less than a second ago', 'i Exited (0) Less than a second ago']);
    expect(r[10].out).toEqual(['true node']);
  });
  it('STOPSIGNAL (the image\'s, a Dockerfile\'s, --stop-signal) and --stop-timeout', () => {
    const r = lab('docker run -d --name n nginx:1.27', 'docker inspect -f "{{.Config.StopSignal}}" n', 'docker image inspect -f "{{.Config.StopSignal}}" nginx:1.27', 'docker stop n', 'docker logs n', 'date',
      "printf 'FROM api:exec\\nSTOPSIGNAL SIGINT\\n' > api/D", BUILD_EXEC, 'docker build -q -t api:int -f api/D api', 'docker history --format "{{.CreatedBy}}" api:int',
      'docker run -d --name x -e DATABASE_URL=x api:int', 'docker stop x', 'date', 'docker run -d --name y --stop-signal TERM --stop-timeout 1 -e DATABASE_URL=x api:exec', 'docker stop y', 'date',
      'docker inspect -f "{{.Config.StopSignal}} {{.Config.StopTimeout}}" y').log;
    expect(r[1].out).toEqual(['SIGQUIT']);
    expect(r[2].out).toEqual(['SIGQUIT']);
    expect(r[4].out.at(-1)).toBe('2026/11/22 10:00:00 [notice] 1#1: gracefully shutting down');
    expect(r[5].out).toEqual(['Sun Nov 22 10:00:01 UTC 2026']);
    expect(r[9].out[0]).toBe('STOPSIGNAL SIGINT');
    // The server handles SIGTERM only: SIGINT is ignored by PID 1, so it is killed after 10 s.
    expect(r[12].out).toEqual(['Sun Nov 22 10:00:11 UTC 2026']);
    // Its handler takes 2 s, more than --stop-timeout 1: SIGKILL after 1 s.
    expect(r[15].out).toEqual(['Sun Nov 22 10:00:12 UTC 2026']);
    expect(r[16].out).toEqual(['TERM 1']);
    expect(lab('docker run -d --name y --stop-timeout 1 -e DATABASE_URL=x api:exec').log.length).toBe(1);
  });
  it('docker wait blocks until the exit (the clock moves) and prints the exit code', () => {
    const r = lab(BUILD_EXEC, 'docker run -d --name w -m 64m api:exec node worker.js', 'docker wait w', 'date', 'docker wait w old-worker', 'docker run -d --name n nginx:1.27', 'docker wait n').log;
    expect(r[2].out).toEqual(['137']);
    expect(r[3].out).toEqual(['Sun Nov 22 10:00:03 UTC 2026']);
    expect(r[4].out).toEqual(['137', '137']);
    expect(r[6].err[0]).toMatch(/^（模擬環境：n 一直在執行/);
  });
});

describe('docker inspect, top and events', () => {
  it('the runtime fields of docker inspect, in JSON and through Go templates (range, println, if, json, len, join)', () => {
    const r = lab(BUILD_EXEC, 'docker run -d --name a -m 256m --cpus 0.5 --restart unless-stopped --security-opt no-new-privileges --cap-drop ALL --cap-add net_bind_service -e DATABASE_URL=x api:exec',
      'docker inspect a', 'docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" a', 'docker inspect -f "{{if .State.OOMKilled}}OOM{{else}}not OOM{{end}} {{.HostConfig.NanoCpus}} {{json .HostConfig.SecurityOpt}} {{json .HostConfig.CapAdd}}" a',
      'docker inspect -f "{{json .State}}" a', 'docker inspect -f "{{.State}}" a', 'docker inspect -f "{{len .Config.Env}} {{join .Config.Cmd \\" \\"}} {{upper .State.Status}} {{eq .State.Status \\"running\\"}}" a',
      'docker inspect -f "{{.State.Pid}}" a', 'ps -o pid,cmd -p $(docker inspect -f "{{.State.Pid}}" a)', 'docker run -d --privileged --name priv nginx:1.27', 'docker inspect priv', 'docker inspect -f "{{.Nope}}" a',
      'docker inspect -f "{{printf \\"%s\\" .Name}}" a').log;
    const json = JSON.parse(r[2].out.join('\n'))[0];
    expect(json.State).toEqual({ Status: 'running', Running: true, Paused: false, Restarting: false, OOMKilled: false, Dead: false, Pid: 902, ExitCode: 0, Error: '', StartedAt: '2026-11-22T10:00:00Z', FinishedAt: '0001-01-01T00:00:00Z' });
    expect(json.RestartCount).toBe(0);
    expect(json.HostConfig).toMatchObject({ RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 }, CapAdd: ['CAP_NET_BIND_SERVICE'], CapDrop: ['ALL'], Privileged: false, ReadonlyRootfs: false,
      SecurityOpt: ['no-new-privileges'], CpuShares: 0, Memory: 268435456, NanoCpus: 500000000, MemorySwap: 536870912 });
    expect(Object.keys(json)).toEqual(['Id', 'Created', 'Path', 'Args', 'State', 'Image', 'Name', 'RestartCount', 'HostConfig', 'Config', 'NetworkSettings', 'Mounts']);
    expect(r[3].out).toEqual(['DATABASE_URL=x', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_VERSION=22.11.0', '']);
    expect(r[4].out).toEqual(['not OOM 500000000 ["no-new-privileges"] ["CAP_NET_BIND_SERVICE"]']);
    expect(r[5].out).toEqual(['{"Status":"running","Running":true,"Paused":false,"Restarting":false,"OOMKilled":false,"Dead":false,"Pid":902,"ExitCode":0,"Error":"","StartedAt":"2026-11-22T10:00:00Z","FinishedAt":"0001-01-01T00:00:00Z"}']);
    expect(r[6].out).toEqual(['{running true false false false false 902 0  2026-11-22T10:00:00Z 0001-01-01T00:00:00Z <nil>}']);
    expect(r[7].out).toEqual(['3 node server.js RUNNING true']);
    expect(r[8].out).toEqual(['902']);
    expect(r[9].out).toEqual(['    PID CMD', '    902 node server.js']);
    expect(JSON.parse(r[11].out.join('\n'))[0].HostConfig.Privileged).toBe(true);
    expect(r[11].err).toContain('（注意：HostConfig.Privileged 是 true：這個容器有所有的 Linux 能力與主機的裝置，等於主機的 root；只在確實需要時才用 --privileged）');
    expect(r[12].err[0]).toMatch(/^template: :1: executing "" at <\.Nope>: 模擬環境沒有 \.Nope 這個欄位/);
    expect(r[13].err[0]).toMatch(/^docker inspect：模擬環境的 --format 只支援 .*（不支援 \{\{printf "%s" \.Name\}\}）$/);
  });
  it('a start error is State.Error; restarting is State.Status restarting with Running true', () => {
    const r = lab('docker run --name nope alpine:3.21 nope', 'docker inspect -f "{{.State.Status}} {{.State.ExitCode}} {{.State.Error}}" nope').last.out;
    expect(r).toEqual(['created 127 failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "nope": executable file not found in $PATH: unknown']);
  });
  it('docker top lists the container\'s processes with host PIDs (ps -ef\'s columns)', () => {
    const r = lab('docker run -d --name n nginx:1.27', 'docker top n', 'docker top old-worker', 'docker top n aux', 'docker top x').log;
    expect(r[1].out).toEqual(['UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD',
      'root                902                 901                 0                   10:00               ?                   00:00:00            nginx -g daemon off;']);
    expect(r[2].err[0]).toMatch(/^Error response from daemon: container [0-9a-f]{64} is not running$/);
    expect(r[3].err[0]).toMatch(/^docker top：模擬環境只支援不加 ps 選項/);
    expect(r[4].err).toEqual(['Error response from daemon: No such container: x']);
  });
  it('docker events --since … --until …: the containers\' events with their attributes, filtered', () => {
    const r = lab(BUILD_EXEC, 'docker run -d --name w -m 64m api:exec node worker.js', 'sleep 5', 'docker rm w', 'docker events --since 1m --until 0s',
      'docker events --since 2h --filter container=old-worker --filter event=oom', 'docker events', 'docker events --since x', 'docker events --since 1m --filter image=x', 'docker events --since 1m --format x',
      'docker events --since 2026-11-22T09:00:03Z --until 2026-11-22T09:00:05Z').log;
    expect(r[4].out.map(l => l.replace(/ [0-9a-f]{64} /, ' ID '))).toEqual([
      '2026-11-22T10:00:00.000000000Z container create ID (image=api:exec, name=w)', '2026-11-22T10:00:00.000000000Z container start ID (image=api:exec, name=w)',
      '2026-11-22T10:00:03.711000000Z container oom ID (image=api:exec, name=w)', '2026-11-22T10:00:03.711000000Z container die ID (execDuration=3, exitCode=137, image=api:exec, name=w)',
      '2026-11-22T10:00:05.000000000Z container destroy ID (image=api:exec, name=w)']);
    expect(r[5].out.map(l => l.replace(/ [0-9a-f]{64} /, ' ID '))).toEqual(['2026-11-22T09:00:04.000000000Z container oom ID (image=team/worker:1.0, name=old-worker)']);
    expect(r[5].err).toEqual(['（模擬環境：沒有 --until 時真實的 docker events 會繼續等待新的事件；模擬環境印出到現在為止的事件就結束）']);
    expect(r[6].err[0]).toMatch(/^（模擬環境：沒有 --since 的 docker events 只會等待之後的事件/);
    expect(r[7].err).toEqual(['Error response from daemon: invalid value for "since": failed to parse value as time or duration: "x"']);
    expect(r[8].err).toEqual(['docker events：模擬環境的 --filter 只支援 container=、event= 與 type=container']);
    expect(r[9].err).toEqual(['docker events：模擬環境不支援 --format（只印出預設的格式）']);
    expect(r[10].out.map(l => l.split(' ')[2])).toEqual(['oom', 'die']);
  });
  it('health_status, kill, stop, restart and Compose\'s containers are events too', () => {
    const r = lab('docker run -d --name h --health-cmd true --health-interval 2s nginx:1.27', 'sleep 3', 'docker restart h', 'docker events --since 1m --until 0s --filter event=health_status',
      'docker events --since 1m --until 0s --filter container=h').log;
    expect(r[3].out.map(l => l.replace(/ [0-9a-f]{64} /, ' ID '))).toEqual(['2026-11-22T10:00:02.000000000Z container health_status: healthy ID (image=nginx:1.27, name=h)']);
    expect(r[4].out.map(l => l.split(' ')[2])).toEqual(['create', 'start', 'health_status:', 'kill', 'die', 'stop', 'start', 'restart']);
  });
});

describe('security options', () => {
  it('--read-only: writes to the root file system fail; --tmpfs and volumes stay writable; a program that writes at its start exits', () => {
    const r = lab('docker run -d --name ro --read-only nginx:1.27', 'docker logs ro', 'docker run -d --name ro2 --read-only --tmpfs /var/cache/nginx --tmpfs /var/run -v data:/data nginx:1.27',
      'docker ps --format "{{.Names}} {{.Status}}"', 'docker exec ro2 touch /etc/x', 'docker exec ro2 touch /var/run/x', 'docker exec ro2 sh -c "echo hi > /tmp/a"', 'docker exec ro2 touch /data/ok',
      'docker exec ro2 ls /var/run /data', 'docker inspect -f "{{.HostConfig.ReadonlyRootfs}}" ro2').log;
    expect(r[1].err).toEqual(['nginx: [emerg] mkdir() "/var/cache/nginx/client_temp" failed (30: Read-only file system)']);
    expect(r[3].out).toEqual(['ro2 Up Less than a second']);
    expect([r[4].err, r[4].status]).toEqual([["touch: cannot touch '/etc/x': Read-only file system"], 1]);
    expect(r[5].status).toBe(0);
    expect(r[6].err).toEqual(['sh: 1: cannot create /tmp/a: Read-only file system']);
    expect(r[7].status).toBe(0);
    expect(r[8].out).toEqual(['/data:', 'ok', '', '/var/run:', 'x']);
    expect(r[9].out).toEqual(['true']);
  });
  it('--cap-drop: a program that needs a capability exits; root\'s chown fails without CAP_CHOWN; --cap-add gives one back', () => {
    const r = lab('docker run -d --name cd --cap-drop ALL nginx:1.27', 'docker logs cd', 'docker run --rm --cap-drop chown alpine:3.21 chown nobody /etc/os-release', 'docker run --rm --cap-drop chown alpine:3.21 id',
      'docker run -d --name ok --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID nginx:1.27', 'docker ps --format "{{.Names}}"', 'docker inspect -f "{{.HostConfig.CapDrop}} {{.HostConfig.CapAdd}}" ok',
      'docker run --rm --cap-drop chown -u 1000 alpine:3.21 id').log;
    expect(r[1].err).toEqual(['nginx: [emerg] chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)']);
    expect([r[2].err, r[2].status]).toEqual([["chown: changing ownership of '/etc/os-release': Operation not permitted"], 1]);
    expect(r[3].out).toEqual(['uid=0(root) gid=0(root) groups=0(root)']);
    expect(r[5].out).toEqual(['ok']);
    expect(r[6].out).toEqual(['[ALL] [CAP_CHOWN CAP_SETUID CAP_SETGID]']);
    expect(normalizeCap('net_admin')).toBe('CAP_NET_ADMIN');
    expect(normalizeCap('all')).toBe('ALL');
    expect(normalizeCap('nope')).toBeNull();
  });
  it('the secrets of an image: ENV in its config, ARG and the RUN lines in docker history', () => {
    const r = lab('docker build -q -t sec secrets', 'docker history --no-trunc --format "{{.CreatedBy}}" sec', 'docker image inspect -f "{{range .Config.Env}}{{println .}}{{end}}" sec').log;
    expect(r[1].out.slice(0, 4)).toEqual(['CMD ["sh"]', 'RUN |1 NPM_TOKEN=lesson-npm-token-demo /bin/sh -c echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > /root/.npmrc && rm /root/.npmrc # buildkit',
      'ENV API_KEY=lesson-api-key-demo', 'ARG NPM_TOKEN=lesson-npm-token-demo']);
    expect(r[2].out).toEqual(['API_KEY=lesson-api-key-demo', '']);
  });
});

describe('E23 carry-over fixes (from the runtime profile up)', () => {
  it('a shell-form CMD on an image without /bin/sh fails to start (runc\'s stat error, 127, Created)', () => {
    const steps = ["printf 'FROM gcr.io/distroless/static-debian12\\nCOPY server.js /src/server.js\\nCMD node /src/server.js\\n' > static/D", 'docker build -q -t d1 -f static/D static', 'docker run -d --name d1 d1', STATUS];
    const r = lab(...steps).log;
    expect(r[2].err).toEqual([`${OCI} "/bin/sh": stat /bin/sh: no such file or directory: unknown.`]);
    expect(r[2].status).toBe(127);
    expect(r[3].out[0]).toBe('d1 Created');
    // On the compose profile the declared program started anyway (E23's known difference, kept there).
    expect(session({ ...runtimeLab, profile: 'compose' }, COMPOSE_PROFILE, ...steps).last.out[0]).toBe('d1 Up Less than a second');
  });
  it('a missing absolute (or relative) path is runc\'s stat error; a missing name is "executable file not found in $PATH"', () => {
    const r = lab('mkdir d', "printf 'FROM gcr.io/distroless/static-debian12\\nENTRYPOINT [\"/app/server\"]\\n' > d/Dockerfile", 'docker build -q -t d2 d', 'docker run d2', 'docker run alpine:3.21 /usr/local/bin/nope',
      'docker run alpine:3.21 ./nope', 'docker run alpine:3.21 nope').log;
    expect(r[3].err).toEqual([`${OCI} "/app/server": stat /app/server: no such file or directory: unknown.`]);
    expect(r[4].err).toEqual([`${OCI} "/usr/local/bin/nope": stat /usr/local/bin/nope: no such file or directory: unknown.`]);
    expect(r[5].err).toEqual([`${OCI} "./nope": stat ./nope: no such file or directory: unknown.`]);
    expect(r[6].err).toEqual([`${OCI} "nope": executable file not found in $PATH: unknown.`]);
  });
  it('COPY --from=build / / carries the base image\'s size', () => {
    const r = lab('docker build -q -t st static', 'docker images st', 'docker history st').log;
    expect(r[1].out[1]).toMatch(/^st {11}latest {4}[0-9a-f]{12} {3}Less than a second ago {3}220MB$/);
    expect(r[2].out[2]).toMatch(/COPY --from=build \/ \/ # buildkit {3}220MB/);
    // On the compose profile only the files' bytes.
    const low = session({ ...composeLab, files: [...composeLab.files, ...runtimeLab.files.filter(f => f.path.startsWith('/home/learner/static'))], docker: { ...composeLab.docker, images: [...composeLab.docker!.images!, runtimeLab.docker!.images![1]] } },
      COMPOSE_PROFILE, 'docker build -q -t st static', 'docker images st --format "{{.Size}}"').last.out;
    expect(low).toEqual(['131B']);
  });
});

describe('lesson data and checks', () => {
  it('validates the runtime fields of images, programs and containers', () => {
    const bad: TerminalMachine = {
      ...runtimeLab, docker: {
        ...runtimeLab.docker,
        images: [...runtimeLab.docker!.images!, { name: 'x:1', size: 1, created: '2026-01-01 00:00:00', cmd: ['x'], stopSignal: 'SIGFOO', memory: { start: -1 }, signals: { KILL: {} }, caps: ['NOPE'], exitAfter: { seconds: -1 } }],
        containers: [...runtimeLab.docker!.containers!, { name: 'y', image: 'alpine:3.21', state: 'running', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:00', restart: 'sometimes', memory: '1m', cpus: 0, capDrop: ['NOPE'], oomKilled: true, stopTimeout: 99999 }],
      },
    };
    const p = machineProblems(bad).join('\n');
    expect(p).toContain('image x:1: stopSignal is a signal (SIGTERM, SIGQUIT…)');
    expect(p).toContain('image x:1: exitAfter is { seconds 0..86400, exit 0..255, one-line logs }');
    expect(machineProblems({ ...bad, docker: { ...bad.docker, images: [...runtimeLab.docker!.images!, { name: 'x:1', size: 1, created: '2026-01-01 00:00:00', cmd: ['x'], memory: { start: -1 } }] } }).join('\n'))
      .toContain('image x:1: memory is { start bytes, growth bytes per second, max ≥ start }');
    for (const why of ['restart is no, always, unless-stopped or on-failure[:N]', 'memory is a size of at least 6MB', 'cpus is 0.01..64', 'capAdd and capDrop are capabilities', 'stopTimeout is -1..3600 seconds', 'an OOM-killed container is exited with exit code 137'])
      expect(p).toContain(`container y: ${why}`);
    expect(parseBytes('64m')).toBe(64 * MIB);
    expect(parseBytes('1.5g')).toBe(1610612736);
    expect(parseBytes('512')).toBe(512);
    expect(parseBytes('x')).toBeNull();
    expect(bytesText(7_967_000)).toBe('7.598MiB');
    expect(restartProblem('on-failure:3')).toBeNull();
    expect(timeArg('10m', 1000)).toBe(400);
    expect(timeArg('2026-11-22T10:00:00Z', 0)).toBe(Date.UTC(2026, 10, 22, 10) / 1000);
  });
  it('the container check: restarting, oomKilled, restartCount, restartPolicy, memory, cpus, readOnly, user and capDrop', () => {
    const ex = (checks: TerminalExercise['checks']): TerminalExercise => ({ id: 'x', title: 'x', machine: 'rt-01', statement: 'x', checks, solution: [], mistakes: [], hints: [], explanation: 'x' });
    const cmds = [BUILD_EXEC, 'docker run -d --name w -m 64m --restart on-failure:5 --read-only --cap-drop ALL -u 1000 api:exec node worker.js', 'sleep 5'];
    const v = checkTerminalExercise(ex([
      { kind: 'container', name: 'w', state: 'running', restartCount: 1 }, { kind: 'container', name: 'w', oomKilled: false }, { kind: 'container', name: 'w', restartPolicy: 'on-failure:5' },
      { kind: 'container', name: 'w', memory: 64 * MIB, readOnly: true, user: '1000', capDrop: ['chown'] }, { kind: 'container', name: 'w', restartCount: 3 }, { kind: 'container', name: 'w', cpus: 1 },
      { kind: 'container', name: 'old-worker', state: 'exited', exitCode: 137, oomKilled: true }, { kind: 'container', name: 'old-worker', restartPolicy: 'always' },
    ]), [runtimeLab], cmds);
    expect(v.results.map(r => r.ok)).toEqual([true, true, true, true, false, false, true, false]);
    expect(v.results[4].message).toMatch(/它只重新啟動了 1 次$/);
    expect(v.results[5].message).toMatch(/它沒有 CPU 上限$/);
    expect(v.results[7].message).toMatch(/它的重新啟動策略是 no$/);
    const loop = checkTerminalExercise(ex([{ kind: 'container', name: 'b', state: 'restarting' }, { kind: 'container', name: 'b', state: 'exited' }]), [runtimeLab],
      [BUILD_EXEC, 'docker run -d --name b --restart always api:exec node boom.js']);
    expect(loop.results.map(r => r.ok)).toEqual([true, false]);
    expect(loop.results[1].message).toMatch(/它的狀態是 restarting$/);
    expect(checkTerminalExercise(gracefulExercise, [runtimeLab], gracefulExercise.solution).ok).toBe(true);
    for (const m of gracefulExercise.mistakes) expect(checkTerminalExercise(gracefulExercise, [runtimeLab], m.commands).ok, m.why).toBe(false);
  });
  it('a synthetic lesson passes terminalContentProblems; the E24 checks need a runtime machine', () => {
    const r = replay(runtimeLab, [BUILD_EXEC, 'docker run -d --name w -m 64m api:exec node worker.js', 'sleep 5', STATUS, 'docker inspect -f "{{.State.OOMKilled}}" w']);
    const content = { machines: [runtimeLab], examples: [{ id: 'oom', title: 'OOM', description: '記憶體不足。', machine: 'rt-01', steps: r.steps.map(s => ({ command: s.command, output: s.output })) }], exercises: [gracefulExercise] };
    expect(terminalContentProblems(content)).toEqual([]);
    const broken = { ...content, exercises: [{ ...gracefulExercise, checks: [{ kind: 'container' as const, name: 'api', restartPolicy: 'sometimes' }, { kind: 'container' as const, name: 'api', absent: true as const, oomKilled: true }] }] };
    expect(terminalContentProblems(broken).join('\n')).toContain('a container check needs oomKilled true or false');
    const low = { ...content, machines: [{ ...composeLab, id: 'rt-01' }], examples: [] };
    expect(terminalContentProblems(low).join('\n')).toContain('state restarting, oomKilled, restartCount, restartPolicy, memory, cpus, readOnly, user and capDrop of a container check need a runtime machine (engine stage E24)');
  });
  it('commands never change the state they were given', () => {
    const start = machineState(runtimeLab), nodes = JSON.stringify([...start.nodes]), docker = JSON.stringify(start.docker, (k, v) => v instanceof Map ? [...v] : v);
    run(start, `${BUILD_EXEC} && docker run -d --name w -m 64m --restart always api:exec node worker.js && sleep 30 && docker stop w`, RUNTIME_PROFILE);
    run(start, 'docker run -d --name n nginx:1.27 && docker kill -s QUIT n && docker update -m 64m n', RUNTIME_PROFILE);
    expect(JSON.stringify([...start.nodes])).toBe(nodes);
    expect(JSON.stringify(start.docker, (k, v) => v instanceof Map ? [...v] : v)).toBe(docker);
  });
});

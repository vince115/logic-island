import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { CONTAINERS_PROFILE, DIAGNOSTICS_PROFILE, E19_COMMANDS, E20_COMMANDS, EDGE_PROFILE, run, SCHEDULING_PROFILE } from '@/lib/terminal/shell';
import { CONTAINER_MANUAL } from '@/lib/terminal/manual';
import { displayPorts, humanDuration, humanSize, parseRef, type DockerContainer } from '@/lib/terminal/docker';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { cleanupExercise, dockFresh, dockLab, HELLO, IMAGES, NGINX_PAGE, publishExercise } from './support/docker-fixture';
import { diagLaptop } from './support/cdn-fixture';

/*
 * Engine stage E20 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §5–§6): the containers profile — Docker CE 27.5.1's CLI on
 * a simulated daemon: images (local and on the simulated Docker Hub), the container lifecycle (created, running, exited,
 * removed; the writable layer and the logs), docker run's options and errors, ps's columns and times from the clock,
 * logs, exec, published ports (docker-proxy, curl through it, the container's access log), the docker group, the lesson
 * data and the checks container and image; below the profile docker does not exist.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, CONTAINERS_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const lab = (...commands: string[]) => session(dockLab, ...commands);
const ID = /^[0-9a-f]{64}$/;

describe('the containers profile', () => {
  it('is the diagnostics profile plus docker; below it docker is not a command and the lower lists stay', () => {
    expect([...CONTAINERS_PROFILE.commands].sort()).toEqual([...DIAGNOSTICS_PROFILE.commands, ...E20_COMMANDS].sort());
    expect(CONTAINERS_PROFILE.features).toEqual([...DIAGNOSTICS_PROFILE.features!, 'containers']);
    expect(profileOf(dockLab)).toBe(CONTAINERS_PROFILE);
    expect(machineProblems(dockLab)).toEqual([]);
    expect(machineProblems(dockFresh)).toEqual([]);
    for (const [profile, machine] of [[DIAGNOSTICS_PROFILE, diagLaptop], [EDGE_PROFILE, { ...diagLaptop, profile: 'edge' as const, paths: undefined, captures: undefined }]] as const) {
      const line = run(machineState(machine), 'docker ps', profile).lines[0].text;
      expect(line).toMatch(/^bash: docker: command not found（模擬環境支援：/);
      expect(line.slice(line.indexOf('支援：') + 3).split(/[、）]/)).not.toContain('docker');
    }
    expect(run(machineState({ ...dockLab, profile: 'scheduling', docker: undefined, responders: undefined }), 'docker ps', SCHEDULING_PROFILE).lines[0].text).toMatch(/^bash: docker: command not found/);
    // Lower machines carry no daemon and refuse the field.
    expect(machineState(diagLaptop).docker).toBeUndefined();
    expect(machineProblems({ ...dockLab, profile: 'diagnostics' }).join('\n')).toContain('docker needs the containers profile (engine stage E20)');
    expect(E19_COMMANDS).not.toContain('docker');
  });
  it('has its manual, help line and the not-installed message', () => {
    expect(lab('docker --help').last.out[0]).toBe(`用法：${CONTAINER_MANUAL.docker.usage}`);
    expect(lab('man docker').last.out[3]).toBe(`       docker - ${CONTAINER_MANUAL.docker.summary}`);
    expect(lab('help').last.out).toContain('  docker run|ps|images|pull|logs|exec|stop|start|rm|rmi|port|inspect …  管理 Image 與 Container（需要 docker 群組或 sudo）');
    const none = session({ ...dockLab, docker: undefined }, 'docker ps; echo $?').last;
    expect(none).toEqual({ out: ['127'], err: ["Command 'docker' not found, but can be installed with:", '', 'sudo apt install docker.io'] });
  });
});

describe('the installation', () => {
  it('adds what docker-ce installs: the docker group, the socket root:docker 0660, the units, containerd and dockerd', () => {
    const s = machineState(dockFresh);
    expect(s.nodes.get('/run/docker.sock')).toMatchObject({ kind: 'file', mode: 0o660, owner: 'root', group: 'docker' });
    expect(s.accounts!.groups.find(g => g.name === 'docker')).toMatchObject({ gid: 988, members: [] });
    expect(s.nodes.get('/etc/systemd/system/multi-user.target.wants/docker.service')).toMatchObject({ kind: 'link', target: '/usr/lib/systemd/system/docker.service' });
    const r = session(dockFresh, 'ps -e -o pid,comm', 'systemctl is-active docker').log;
    expect(r[0].out).toEqual(expect.arrayContaining(['    850 containerd', '    900 dockerd']));
    expect(r[1].out).toEqual(['active']);
  });
  it('needs the docker group (or sudo): permission denied, then usermod -aG and newgrp', () => {
    const r = session(dockFresh, 'docker ps; echo $?', 'docker run hello-world; echo $?', 'sudo docker ps -q', 'sudo usermod -aG docker learner', 'docker images -q; echo $?', 'newgrp docker', 'docker images -q').log;
    expect(r[0]).toEqual({ out: ['1'], err: ['permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/containers/json": dial unix /var/run/docker.sock: connect: permission denied'] });
    expect(r[1].err[0]).toMatch(/^docker: permission denied while trying to connect to the Docker daemon socket at unix:\/\/\/var\/run\/docker\.sock: .*connect: permission denied\.$/);
    expect(r[1]).toMatchObject({ out: ['125'] });
    expect(r[1].err[1]).toBe("See 'docker run --help'.");
    expect(r[2].out).toHaveLength(1);
    expect(r[4].out).toEqual(['1']);
    expect(r[6].out).toHaveLength(3);
    // Opening the socket to everyone works too (the lesson's point: it is root for anyone).
    expect(session(dockFresh, 'sudo chmod 666 /run/docker.sock', 'docker ps -q').last.out).toHaveLength(1);
  });
  it('docker version and docker info (abbreviated); the client half prints without the daemon', () => {
    const v = lab('docker version').last.out;
    expect(v.slice(0, 3)).toEqual(['Client: Docker Engine - Community', ' Version:           27.5.1', ' API version:       1.47']);
    expect(v).toContain('  API version:      1.47 (minimum version 1.24)');
    expect(lab('docker --version').last.out).toEqual(['Docker version 27.5.1, build 9f9e405']);
    const denied = session(dockFresh, 'docker version').last;
    expect(denied.out).toHaveLength(6);
    expect(denied.err[0]).toContain('v1.47/version');
    const info = lab('docker info').last.out;
    expect(info).toEqual(expect.arrayContaining([' Containers: 2', '  Running: 1', '  Stopped: 1', ' Images: 3', ' Storage Driver: overlay2', ' Name: dock-01', ' Total Memory: 2GiB']));
  });
});

describe('images and the simulated Docker Hub', () => {
  it('docker images: tabwriter columns, newest first, Go units and durations', () => {
    expect(lab('docker images').last.out).toEqual([
      'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE',
      'nginx        latest    6b80bc54ac19   2 weeks ago   192MB',
      'ubuntu       24.04     1ab7d251cec8   5 weeks ago   78.1MB',
      'alpine       3.21      62550e7b9f25   6 weeks ago   7.83MB',
    ]);
    expect(lab('docker image ls alpine').last.out).toHaveLength(2);
    expect(lab('docker images -q').last.out).toEqual(['6b80bc54ac19', '1ab7d251cec8', '62550e7b9f25']);
    expect([humanSize(10072, 3), humanSize(191968432, 3), humanSize(0), humanSize(1093)]).toEqual(['10.1kB', '192MB', '0B', '1.093kB']);
    expect([0.5, 1, 59, 60, 119, 3599, 3600, 5400, 86400 * 3, 86400 * 20, 86400 * 400].map(humanDuration))
      .toEqual(['Less than a second', '1 second', '59 seconds', 'About a minute', 'About a minute', '59 minutes', 'About an hour', '2 hours', '3 days', '2 weeks', '13 months']);
  });
  it('docker pull: the layers, the digest and the fully qualified name; up to date; denied; unknown tag', () => {
    const r = lab('docker pull redis:7.4', 'docker pull redis:7.4', 'docker pull hello-world', 'docker pull nope; echo $?', 'docker pull redis:9', 'docker pull Nginx').log;
    expect(r[0].out[0]).toBe('7.4: Pulling from library/redis');
    expect(r[0].out.slice(1, 7).every(l => /^[0-9a-f]{12}: Pull complete$/.test(l))).toBe(true);
    expect(r[0].out.slice(7)).toEqual([expect.stringMatching(/^Digest: sha256:[0-9a-f]{64}$/), 'Status: Downloaded newer image for redis:7.4', 'docker.io/library/redis:7.4']);
    expect(r[1].out).toEqual(['7.4: Pulling from library/redis', r[0].out[7], 'Status: Image is up to date for redis:7.4', 'docker.io/library/redis:7.4']);
    expect(r[2].out[0]).toBe('Using default tag: latest');
    expect(r[2].out.at(-1)).toBe('docker.io/library/hello-world:latest');
    expect(r[3]).toEqual({ out: ['1'], err: ["Error response from daemon: pull access denied for nope, repository does not exist or may require 'docker login': denied: requested access to the resource is denied"] });
    expect(r[4].err).toEqual(['Error response from daemon: manifest for redis:9 not found: manifest unknown: manifest unknown']);
    expect(r[5].err).toEqual(['invalid reference format']);
    expect(parseRef('docker.io/library/nginx:1.27')).toEqual({ repo: 'nginx', tag: '1.27' });
    expect(parseRef('bitnami/redis')).toEqual({ repo: 'bitnami/redis', tag: 'latest' });
    expect(parseRef('Nginx')).toBeNull();
  });
});

describe('the container lifecycle', () => {
  it('docker ps and ps -a: the real columns, COMMAND quoted and cut with …, Up / Exited (N) … ago from the clock', () => {
    expect(lab('docker ps -a').last.out).toEqual([
      'CONTAINER ID   IMAGE         COMMAND                  CREATED             STATUS                     PORTS     NAMES',
      '3e875839f1d9   alpine:3.21   "sleep infinity"         3 minutes ago       Up 3 minutes                         worker',
      '6d2f14683c9e   nginx         "/docker-entrypoint.…"   About an hour ago   Exited (0) 5 minutes ago             old-web',
    ]);
    expect(lab('docker ps').last.out).toHaveLength(2);
    // sleep moves the clock (edge and above): the times follow.
    expect(lab('sleep 180', 'docker ps --format "{{.Names}} {{.Status}} {{.RunningFor}}"').last.out).toEqual(['worker Up 6 minutes 6 minutes ago']);
  });
  it('docker run: pulls first (on standard error), runs the program attached, exits with its status; the output stays in the logs', () => {
    const r = lab('docker run hello-world', 'docker ps -a --format "{{.Image}} {{.Status}}"', 'docker logs $(docker ps -aq | head -n 1)').log;
    expect(r[0].err).toEqual(["Unable to find image 'hello-world:latest' locally", 'latest: Pulling from library/hello-world', expect.stringMatching(/^[0-9a-f]{12}: Pull complete$/),
      expect.stringMatching(/^Digest: sha256:/), 'Status: Downloaded newer image for hello-world:latest']);
    expect(r[0].out).toEqual(HELLO.replace(/\n$/, '').split('\n'));
    expect(r[1].out[0]).toBe('hello-world Exited (0) Less than a second ago');
    expect(r[2].out).toEqual(HELLO.replace(/\n$/, '').split('\n'));
  });
  it('-d prints the full ID; created → running → exited → removed; logs survive stop but not rm; the writable layer survives stop but not rm', () => {
    const r = lab('docker run -d --name web -p 8080:80 nginx', 'docker inspect -f "{{.State.Status}}" web', 'docker exec web sh -c "echo saved > /tmp/note"', 'docker stop web',
      'docker inspect -f "{{.State.Status}} {{.State.ExitCode}}" web', 'docker logs web', 'docker start web', 'docker exec web cat /tmp/note', 'docker rm web; echo $?', 'docker rm -f web',
      'docker logs web; echo $?', 'docker run -d --name web -p 8080:80 nginx', 'docker exec web cat /tmp/note').log;
    expect(r[0].out).toEqual([expect.stringMatching(ID)]);
    expect(r[1].out).toEqual(['running']);
    expect(r[3].out).toEqual(['web']);
    expect(r[4].out).toEqual(['exited 0']);
    expect(r[5].out).toEqual(['/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration', '/docker-entrypoint.sh: Configuration complete; ready for start up']);
    expect(r[5].err).toEqual(['2026/11/22 10:00:00 [notice] 1#1: nginx/1.27.3', '2026/11/22 10:00:00 [notice] 1#1: start worker processes']);
    expect(r[7].out).toEqual(['saved']);
    expect(r[8]).toEqual({ out: ['1'], err: ['Error response from daemon: cannot remove container "/web": container is running: stop the container before removing or force remove'] });
    expect(r[9].out).toEqual(['web']);
    expect(r[10]).toEqual({ out: ['1'], err: ['Error response from daemon: No such container: web'] });
    expect(r[12].err).toEqual(['cat: /tmp/note: No such file or directory']);
  });
  it('a command after the image replaces CMD; --rm removes it; -e sets the environment; sleep N exits by the clock', () => {
    const r = lab('docker run --rm alpine:3.21 echo hello', 'docker ps -aq | wc -l', 'docker run -e GREETING=hi --name e1 alpine:3.21 env', 'docker run -d --name nap alpine:3.21 sleep 60',
      'sleep 61', 'docker ps -a --filter name=nap --format "{{.Status}}"').log;
    expect(r[0].out).toEqual(['hello']);
    expect(r[1].out).toEqual(['2']);
    expect(r[2].out).toEqual(['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', expect.stringMatching(/^HOSTNAME=[0-9a-f]{12}$/), 'GREETING=hi', 'HOME=/root']);
    expect(r[5].out).toEqual(['Exited (0) 1 second ago']);
  });
  it('docker stop: a server exits 0, a sleep that ignores SIGTERM as PID 1 is killed (137)', () => {
    const r = lab('docker run -d --name web nginx', 'docker stop web worker', 'docker ps -a --format "{{.Names}} {{.Status}}"').log;
    expect(r[1].out).toEqual(['web', 'worker']);
    expect(r[2].out).toEqual(['web Exited (0) Less than a second ago', 'worker Exited (137) Less than a second ago', 'old-web Exited (0) 5 minutes ago']);
  });
  it('interactive shells: -it gets exit (no keyboard), -dit keeps running, a shell without -i exits at once', () => {
    const r = lab('docker run -it --name s1 ubuntu:24.04', 'docker run -dit --name s2 ubuntu:24.04', 'docker run --name s3 ubuntu:24.04', 'docker ps -a --format "{{.Names}} {{.Status}}" --filter name=s').log;
    expect(r[0].err[0]).toMatch(/^（模擬環境沒有鍵盤：容器裡的互動式 Shell 立刻收到 exit/);
    expect(r[1].out).toEqual([expect.stringMatching(ID)]);
    expect(r[3].out).toEqual(['s3 Exited (0) Less than a second ago', 's2 Up Less than a second', 's1 Exited (0) Less than a second ago']);
    expect(lab('docker run nginx').last.err.at(-1)).toMatch(/^（模擬環境沒有 Ctrl-C：容器 \S+ 留在背景繼續執行/);
  });
  it('docker run errors: name conflict, port already allocated (left Created), executable not found (127), bad flags and arguments', () => {
    const r = lab('docker run -d --name web -p 8080:80 nginx', 'docker run -d --name web nginx; echo $?', 'docker run -d --name web2 -p 8080:80 nginx; echo $?',
      'docker ps -a --filter status=created --format "{{.Names}} {{.Status}}"', 'docker run alpine:3.21 nosuch; echo $?', 'docker run -x nginx; echo $?', 'docker run', 'docker run nope; echo $?').log;
    const web = r[0].out[0];
    expect(r[1]).toEqual({ out: ['125'], err: [`docker: Error response from daemon: Conflict. The container name "/web" is already in use by container "${web}". You have to remove (or rename) that container to be able to reuse that name.`, "See 'docker run --help'."] });
    expect(r[2].out).toEqual(['125']);
    expect(r[2].err).toEqual([expect.stringMatching(/^docker: Error response from daemon: driver failed programming external connectivity on endpoint web2 \([0-9a-f]{64}\): Bind for 0\.0\.0\.0:8080 failed: port is already allocated\.$/)]);
    expect(r[3].out).toEqual(['web2 Created']);
    expect(r[4]).toEqual({ out: ['127'], err: ['docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "nosuch": executable file not found in $PATH: unknown.'] });
    expect(r[5]).toEqual({ out: ['125'], err: ["unknown shorthand flag: 'x' in -x", "See 'docker run --help'."] });
    expect(r[6].err).toEqual(['"docker run" requires at least 1 argument.', "See 'docker run --help'.", '', 'Usage:  docker run [OPTIONS] IMAGE [COMMAND] [ARG...]', '', 'Create and run a new container from an image']);
    expect(r[7]).toEqual({ out: ['125'], err: ["Unable to find image 'nope:latest' locally", "docker: Error response from daemon: pull access denied for nope, repository does not exist or may require 'docker login': denied: requested access to the resource is denied.", "See 'docker run --help'."] });
    // A host program on the port: the userland proxy cannot listen.
    const busy = session({ ...dockLab, processes: [{ pid: 1500, user: 'learner', command: 'python3 -m http.server 9090', listen: [{ port: 9090 }] }] }, 'docker run -d --name x -p 9090:80 nginx').last;
    expect(busy.err[0]).toMatch(/: Error starting userland proxy: listen tcp4 0\.0\.0\.0:9090: bind: address already in use\.$/);
  });
  it('commands that later stages bring, and unknown commands', () => {
    expect(lab('docker build -t app .').last.err).toEqual(['docker build：模擬環境在引擎階段 E21（Dockerfile、建置、分層與快取） 才支援']);
    expect(lab('docker volume ls').last.err[0]).toContain('E22');
    expect(lab('docker compose up').last.err[0]).toContain('E23');
    expect(lab('docker stats').last.err[0]).toContain('E24');
    expect(lab('docker foo').last.err).toEqual(["docker: 'foo' is not a docker command.", "See 'docker --help'"]);
  });
});

describe('published ports', () => {
  it('-p 8080:80: docker ps shows both families, ss shows docker-proxy, curl reaches the image\'s service and the request is in docker logs', () => {
    const r = lab('docker run -d --name web -p 8080:80 nginx', 'docker ps --format "{{.Ports}}"', 'sudo ss -tlnp sport = :8080', 'curl -s localhost:8080/', 'curl -sI http://127.0.0.1:8080/health',
      'docker logs web 2>/dev/null | tail -n 2', 'docker port web', 'docker port web 80', 'docker port web 81').log;
    expect(r[1].out[0]).toBe('0.0.0.0:8080->80/tcp, [::]:8080->80/tcp');
    expect(r[2].out[1]).toMatch(/^LISTEN 0 +4096 +0\.0\.0\.0:8080 +0\.0\.0\.0:\* +users:\(\("docker-proxy",pid=\d+,fd=4\)\)$/);
    expect(r[3].out.join('\n')).toBe(NGINX_PAGE.replace(/\n$/, ''));
    expect(r[4].out.slice(0, 2)).toEqual(['HTTP/1.1 200 OK', 'Server: nginx/1.27.3']);
    expect(r[5].out).toEqual([`172.17.0.1 - - [22/Nov/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 ${new TextEncoder().encode(NGINX_PAGE).length} "-" "curl/8.5.0" "-"`,
      '172.17.0.1 - - [22/Nov/2026:10:00:00 +0000] "HEAD /health HTTP/1.1" 200 0 "-" "curl/8.5.0" "-"']);
    expect(r[6].out).toEqual(['80/tcp -> 0.0.0.0:8080', '80/tcp -> [::]:8080']);
    expect(r[7].out).toEqual(['0.0.0.0:8080', '[::]:8080']);
    expect(r[8].err).toEqual(["Error: No public port '81/tcp' published for web"]);
  });
  it('a stopped container stops answering (the proxy is gone); the wrong container port gets an empty reply; 127.0.0.1 binds only loopback', () => {
    const r = lab('docker run -d --name web -p 8080:80 nginx', 'docker stop web', 'curl -s localhost:8080; echo $?', 'ss -tln sport = :8080 | wc -l', 'docker start web', 'curl -s -o /dev/null -w "%{http_code}" localhost:8080',
      'docker run -d --name wrong -p 8082:8080 nginx', 'curl localhost:8082', 'docker run -d --name loc -p 127.0.0.1:8083:80 nginx', 'docker ps --filter name=loc --format "{{.Ports}}"', 'curl -s -o /dev/null -w "%{http_code}" 10.0.0.10:8083; echo " $?"').log;
    expect(r[2].out).toEqual(['7']);
    expect(r[3].out).toEqual(['1']);
    expect(r[5].out).toEqual(['200']);
    expect(r[7].err).toEqual(['curl: (52) Empty reply from server']);
    expect(r[9].out).toEqual(['127.0.0.1:8083->80/tcp']);
    expect(r[10].out).toEqual(['000 7']);
  });
  it('DisplayablePorts: same ports grouped (:::80 written by concatenation), exposed ports, mappings last', () => {
    const c = { status: 'running', ports: [{ hostIp: '0.0.0.0', host: 8080, container: 80, proto: 'tcp' }, { hostIp: '0.0.0.0', host: 443, container: 443, proto: 'tcp' }] } as unknown as DockerContainer;
    expect(displayPorts(c, undefined)).toBe('0.0.0.0:443->443/tcp, :::443->443/tcp, 0.0.0.0:8080->80/tcp, [::]:8080->80/tcp');
    expect(displayPorts({ ...c, ports: [] }, { expose: [80, 81, 6379] } as never)).toBe('80-81/tcp, 6379/tcp');
    expect(displayPorts({ ...c, status: 'exited' }, undefined)).toBe('');
  });
});

describe('exec, logs, inspect, rm, rmi and prune', () => {
  it('docker exec: the container\'s files and hostname, env, ps where the image has it, missing executables, not running', () => {
    const r = lab('docker run -d --name web nginx', 'docker exec web cat /etc/hostname', 'docker exec web ls /usr/share/nginx/html', 'docker exec worker ps', 'docker exec web ps; echo $?',
      'docker exec -it web bash', 'docker exec old-web ls; echo $?', 'docker exec web sh -c "nosuch arg"; echo $?', 'docker exec -e MODE=debug web env').log;
    const id = r[0].out[0];
    expect(r[1].out).toEqual([id.slice(0, 12)]);
    expect(r[2].out).toEqual(['index.html']);
    expect(r[3].out).toEqual(['    PID TTY          TIME CMD', '      1 ?        00:00:00 sleep', '      7 ?        00:00:00 ps']);
    expect(r[4].out).toEqual(['OCI runtime exec failed: exec failed: unable to start container process: exec: "ps": executable file not found in $PATH: unknown', '127']);
    expect(r[5].err[0]).toMatch(/^docker exec：模擬環境沒有容器裡的互動式 Shell/);
    expect(r[6]).toEqual({ out: ['1'], err: [`Error response from daemon: container ${session(dockLab, 'docker inspect -f "{{.Id}}" old-web').last.out[0]} is not running`] });
    expect(r[7]).toEqual({ out: ['127'], err: ['sh: 1: nosuch: not found'] });
    expect(r[8].out).toContain('MODE=debug');
  });
  it('docker logs --tail and -t; the access log counts requests', () => {
    const r = lab('docker logs --tail 1 old-web', 'docker logs -t -n 1 old-web', 'docker logs --tail 0 old-web').log;
    expect(r[0].err).toEqual(['2026/11/22 10:00:00 [notice] 1#1: start worker processes']);
    expect(r[1].err).toEqual(['2026-11-22T09:00:01.000000000Z 2026/11/22 10:00:00 [notice] 1#1: start worker processes']);
    expect(r[2]).toEqual({ out: [], err: [] });
  });
  it('docker inspect -f with the modelled fields, {{json}}, the image, an unknown field and an unknown object', () => {
    const r = lab('docker run -d --name web -p 8080:80 nginx', 'docker inspect -f "{{.Name}} {{.State.Running}} {{.Config.Image}} {{.Config.Cmd}} {{.NetworkSettings.IPAddress}}" web',
      'docker inspect --format "{{json .HostConfig.PortBindings}}" web', 'docker inspect -f "{{.State.StartedAt}} {{.State.FinishedAt}}" old-web', 'docker inspect -f "{{.Id}}" nginx',
      'docker inspect -f "{{.State.Health}}" web; echo $?', 'docker inspect nosuch; echo $?').log;
    expect(r[1].out).toEqual(['/web true nginx [nginx -g daemon off;] 172.17.0.3']);
    expect(r[2].out).toEqual(['{"80/tcp":[{"HostIp":"","HostPort":"8080"}]}']);
    expect(r[3].out).toEqual(['2026-11-22T09:00:01Z 2026-11-22T09:55:00Z']);
    expect(r[4].out[0]).toMatch(/^sha256:6b80bc54ac19[0-9a-f]{52}$/);
    expect(r[5].out).toEqual(['1']);
    expect(r[5].err[0]).toMatch(/^docker inspect：模擬環境沒有 \.State\.Health 這個欄位/);
    expect(r[6]).toEqual({ out: ['1'], err: ['Error: No such object: nosuch'] });
  });
  it('docker rmi: in use (must force), untag and delete, -f deletes an image only a stopped container uses; then ps shows the image ID', () => {
    const r = lab('docker rmi nginx; echo $?', 'docker rmi ubuntu:24.04', 'docker images -q | wc -l', 'docker rmi -f nginx', 'docker ps -a --format "{{.Image}}" --filter name=old-web', 'docker rmi nosuch').log;
    expect(r[0]).toEqual({ out: ['1'], err: ['Error response from daemon: conflict: unable to remove repository reference "nginx" (must force) - container 6d2f14683c9e is using its referenced image 6b80bc54ac19'] });
    expect(r[1].out.slice(0, 3)).toEqual(['Untagged: ubuntu:24.04', expect.stringMatching(/^Untagged: ubuntu@sha256:[0-9a-f]{64}$/), expect.stringMatching(/^Deleted: sha256:1ab7d251cec8/)]);
    expect(r[2].out).toEqual(['2']);
    // Only the stopped old-web uses nginx: -f ignores that (soft) conflict and deletes the image and its 7 layers.
    expect(r[3].out.slice(0, 3)).toEqual(['Untagged: nginx:latest', expect.stringMatching(/^Untagged: nginx@sha256:/), expect.stringMatching(/^Deleted: sha256:6b80bc54ac19/)]);
    expect(r[3].out).toHaveLength(10);
    expect(r[4].out).toEqual(['6b80bc54ac19']);
    expect(r[5].err).toEqual(['Error response from daemon: No such image: nosuch:latest']);
  });
  it('docker container prune: asks (no keyboard: says so), echo y answers, -f does not ask; only stopped containers go', () => {
    const r = lab('docker run -d --name tmp alpine:3.21 sh -c "echo data > /tmp/d"', 'docker container prune', 'echo y | docker container prune', 'docker ps -aq | wc -l', 'docker container prune -f').log;
    expect(r[1]).toEqual({ out: ['WARNING! This will remove all stopped containers.', 'Are you sure you want to continue? [y/N] '], err: ['（模擬環境沒有鍵盤可以回答；請加 -f，或寫成 echo y | docker container prune）'] });
    expect(r[2].out).toEqual(['WARNING! This will remove all stopped containers.', 'Are you sure you want to continue? [y/N] Deleted Containers:', expect.stringMatching(ID), expect.stringMatching(ID), '', 'Total reclaimed space: 5B']);
    expect(r[3].out).toEqual(['1']);
    expect(r[4].out).toEqual(['Total reclaimed space: 0B']);
  });
});

describe('lesson data and checks', () => {
  it('validates the docker data', () => {
    const bad = (docker: TerminalMachine['docker']) => machineProblems({ ...dockLab, docker }).join('\n');
    expect(bad({ images: [{ ...IMAGES[0], name: 'Nginx' }] })).toContain('image Nginx: not an image reference');
    expect(bad({ images: [IMAGES[0], IMAGES[0]] })).toContain('image nginx: listed twice');
    expect(bad({ images: [{ ...IMAGES[0], created: '2027-01-01 00:00:00' }] })).toContain('created must be a time');
    expect(bad({ images: [{ ...IMAGES[0], http: { port: 80, responder: 'none' } }] })).toContain('http needs a port 1..65535, a responder of the machine');
    expect(bad({ images: [{ ...IMAGES[0], commands: ['vim'] }] })).toContain('commands are among');
    expect(bad({ images: [{ ...IMAGES[2], registry: false, pulled: false }] })).toContain('must be pulled');
    expect(bad({ images: IMAGES, containers: [{ name: 'x', image: 'redis:7.4', state: 'running', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:00' }] })).toContain('image redis:7.4 is not a pulled image');
    expect(bad({ images: IMAGES, containers: [{ name: 'x', image: 'nginx', state: 'running', created: '2026-11-22 09:00:00' }] })).toContain('a running container has started and no finished');
    expect(bad({ images: IMAGES, containers: [{ name: 'x', image: 'nginx', state: 'exited', created: '2026-11-22 09:00:00', started: '2026-11-22 08:00:00', finished: '2026-11-22 09:30:00' }] })).toContain('created ≤ started ≤ finished ≤ now');
    expect(bad({ images: IMAGES, containers: [
      { name: 'a', image: 'nginx', state: 'running', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:00', ports: ['8080:80'] },
      { name: 'b', image: 'nginx', state: 'running', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:00', ports: ['8080:80'] },
    ] })).toContain('port 8080 is already published by a');
  });
  it('a running container declared by the lesson is published from the start (its proxy and its responder)', () => {
    const m: TerminalMachine = { ...dockLab, docker: { images: IMAGES, containers: [{ name: 'site', image: 'nginx', state: 'running', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:00', ports: ['8080:80'] }] } };
    expect(machineProblems(m)).toEqual([]);
    const r = session(m, 'docker ps --format "{{.Names}} {{.Status}} {{.Ports}}"', 'curl -s localhost:8080/health').log;
    expect(r[0].out).toEqual(['site Up About an hour 0.0.0.0:8080->80/tcp, [::]:8080->80/tcp']);
    expect(r[1].out).toEqual(['ok']);
  });
  it('the container, image and http checks: the solution passes, the start and the mistakes do not', () => {
    const machines = [dockLab];
    for (const x of [publishExercise, cleanupExercise]) {
      expect(checkTerminalExercise(x, machines, x.solution).ok, x.id).toBe(true);
      expect(checkTerminalExercise(x, machines, []).ok, x.id).toBe(false);
      for (const m of x.mistakes) expect(checkTerminalExercise(x, machines, m.commands).ok, m.why).toBe(false);
    }
    const v = checkTerminalExercise(publishExercise, machines, ['docker run -d --name web -p 80:8080 nginx']);
    expect(v.results[0].message).toBe('應該有名為 web 的容器（狀態是 running，由 nginx 建立，公開連接埠 8080:80），但它公開的連接埠是 80:8080');
    expect(v.results[1].message).toMatch(/^GET http:\/\/localhost:8080\/ 應該回應狀態碼 200、內容包含「Welcome to nginx!」，但/);
  });
  it('a whole synthetic lesson validates, with a docker variant for an output check; check data is validated', () => {
    const output: TerminalExercise = {
      id: 'count', title: '數一數', machine: 'dock-01', statement: '印出目前正在執行的容器有幾個。', checks: [{ kind: 'output', fromCommand: '^docker ' }],
      solution: ['docker ps -q | wc -l'], mistakes: [{ commands: ['echo 1'], why: '用 echo 猜的' }],
      variants: [{ label: '兩個在執行', files: [], docker: { images: IMAGES, containers: [
        { name: 'a', image: 'alpine:3.21', command: ['sleep', 'infinity'], state: 'running', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:00' },
        { name: 'b', image: 'alpine:3.21', command: ['sleep', 'infinity'], state: 'running', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:00' },
      ] } }], hints: ['-q'], explanation: 'docker ps -q 一行一個 ID。',
    };
    const content = {
      machines: [dockLab],
      examples: [{ id: 'imgs', title: 'Image', description: '本機的 Image。', machine: 'dock-01', steps: [{ command: 'docker images -q', output: '6b80bc54ac19\n1ab7d251cec8\n62550e7b9f25' }] }],
      exercises: [publishExercise, cleanupExercise, output],
    };
    expect(terminalContentProblems(content)).toEqual([]);
    const broken = { ...content, exercises: [{ ...cleanupExercise, checks: [{ kind: 'container' as const, name: 'old web' }, { kind: 'image' as const, name: 'Bad' }] }] };
    expect(terminalContentProblems(broken).join('\n')).toContain('a container check needs a container name');
    expect(terminalContentProblems(broken).join('\n')).toContain('an image check needs an image reference');
    const low = { ...content, machines: [{ ...diagLaptop, id: 'dock-01' }], examples: [], exercises: [{ ...cleanupExercise, solution: ['docker rm old-web'] }] };
    expect(terminalContentProblems(low).join('\n')).toContain('docker is not in the diagnostics profile of machine dock-01');
    expect(terminalContentProblems(low).join('\n')).toContain('a container check needs a containers machine (engine stage E20)');
  });
  it('commands never change the state they were given', () => {
    const start = machineState(dockLab), before = JSON.stringify([...start.nodes], null, 0), docker = JSON.stringify(start.docker?.containers.map(c => [c.name, c.status]));
    run(start, 'docker run -d --name web -p 8080:80 nginx', CONTAINERS_PROFILE);
    run(start, 'docker rm -f worker', CONTAINERS_PROFILE);
    expect(JSON.stringify([...start.nodes], null, 0)).toBe(before);
    expect(JSON.stringify(start.docker?.containers.map(c => [c.name, c.status]))).toBe(docker);
  });
});

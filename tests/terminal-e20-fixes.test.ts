import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { CONTAINERS_PROFILE, run } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineState, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { dockLab, IMAGES } from './support/docker-fixture';

/*
 * Fixes to engine stage E20 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §10), one test per fix, against Docker CE
 * 27.5.1's behaviour: docker info --format, uname in a container, ps as a container's main process, the exit builtin of
 * sh -c, docker start -a's exit status, untagged (dangling) images with --digests and -f dangling=, docker ps --filter
 * publish= and expose=, and docker inspect's Config.Env.
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
/** dock-01 with a real kernel release and an Alpine image that ships uname (BusyBox). */
const kernelLab: TerminalMachine = {
  ...dockLab, system: { release: '6.8.0-49-generic', version: '#49-Ubuntu SMP PREEMPT_DYNAMIC' },
  docker: { ...dockLab.docker, images: IMAGES.map(i => i.name === 'alpine:3.21' ? { ...i, commands: [...i.commands ?? [], 'uname'] } : i) },
};

describe('fix 1: docker info --format', () => {
  it('prints the template with the fields docker info shows, and Go template errors for unknown fields', () => {
    const k = session(kernelLab, "docker info --format '{{.KernelVersion}}'", 'echo $?').log;
    expect(k[0]).toEqual({ out: ['6.8.0-49-generic'], err: [] });
    expect(k[1].out).toEqual(['0']);
    expect(lab("docker info -f '{{.OperatingSystem}} | {{.ServerVersion}} | {{.Driver}} | {{.CgroupDriver}} | {{.CgroupVersion}}'").last.out)
      .toEqual(['Ubuntu 24.04.1 LTS | 27.5.1 | overlay2 | systemd | 2']);
    // Containers and images as docker info counts them (old-web exited, worker running; nginx, alpine, ubuntu local).
    expect(lab('docker info --format "{{.Containers}} {{.ContainersRunning}} {{.ContainersStopped}} {{.Images}} {{.Name}} {{.DockerRootDir}}"').last.out)
      .toEqual(['2 1 1 3 dock-01 /var/lib/docker']);
    const ncpu = lab('docker info --format "{{.NCPU}} {{.MemTotal}}"').last.out[0].split(' ');
    expect(ncpu[0]).toMatch(/^\d+$/);
    expect(ncpu[1]).toMatch(/^\d+$/);
    // The plain output is unchanged: the same values, the client section first.
    expect(lab('docker info').last.out).toContain(' Kernel Version: 6.8.0-sim');
    const bad = lab("docker info --format 'kernel {{.Kernel}}'", 'echo $?').log;
    expect(bad[0]).toEqual({ out: ['kernel '], err: ['template: :1:9: executing "" at <.Kernel>: can\'t evaluate field Kernel in type system.dockerInfo'] });
    expect(bad[1].out).toEqual(['1']);
    // Real fields the simulation does not model are said, not faked.
    expect(lab("docker info --format '{{.Swarm}}'").last.err[0]).toMatch(/^docker info：模擬環境沒有模擬 \.Swarm/);
  });
});

describe('fix 2: uname in a container', () => {
  it('prints the host kernel and the container hostname unless the image declares its executables without uname', () => {
    const r = session(kernelLab, 'docker run --name u ubuntu:24.04 uname -r', 'docker run --rm ubuntu:24.04 uname -s -m', 'docker run -d --name box ubuntu:24.04 sleep infinity',
      'docker exec box uname -n', 'docker exec box hostname', 'docker exec box uname -a', 'docker exec worker uname -a', 'docker exec worker sh -c "uname -o"').log;
    expect(r[0].out).toEqual(['6.8.0-49-generic']);
    expect(r[1].out).toEqual(['Linux x86_64']);
    expect(r[3].out).toEqual(r[4].out);
    expect(r[3].out[0]).toMatch(/^[0-9a-f]{12}$/);
    expect(r[5].out).toEqual([`Linux ${r[3].out[0]} 6.8.0-49-generic #49-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`]);
    // Alpine's uname is BusyBox's: the operating system is Linux.
    expect(r[6].out[0]).toMatch(/^Linux [0-9a-f]{12} 6\.8\.0-49-generic #49-Ubuntu SMP PREEMPT_DYNAMIC x86_64 Linux$/);
    expect(r[7].out).toEqual(['Linux']);
    // nginx's image lists its executables without uname: OCI's error, as before.
    const n = lab('docker run -d --name web nginx', 'docker exec web uname -r; echo $?').last;
    expect(n.out).toEqual(['OCI runtime exec failed: exec failed: unable to start container process: exec: "uname": executable file not found in $PATH: unknown', '127']);
  });
});

describe('fix 3: ps as the main process', () => {
  it('shows only itself as PID 1; docker exec ps still shows the main process and itself', () => {
    expect(lab('docker run --rm alpine:3.21 ps').last.out).toEqual(['    PID TTY          TIME CMD', '      1 ?        00:00:00 ps']);
    expect(lab('docker run --rm ubuntu:24.04 sh -c ps').last.out).toEqual(['    PID TTY          TIME CMD', '      1 ?        00:00:00 ps']);
    expect(lab('docker exec worker ps').last.out).toEqual(['    PID TTY          TIME CMD', '      1 ?        00:00:00 sleep', '      7 ?        00:00:00 ps']);
  });
});

describe('fix 4: exit in sh -c', () => {
  it('is a builtin: the status is N, alone or after other commands', () => {
    const r = lab('docker run --name e3 alpine:3.21 sh -c "exit 3"; echo $?', 'docker ps -a --filter name=e3 --format "{{.Status}}"', 'docker inspect -f "{{.State.ExitCode}}" e3').log;
    expect(r[0]).toEqual({ out: ['3'], err: [] });
    expect(r[1].out).toEqual(['Exited (3) Less than a second ago']);
    expect(r[2].out).toEqual(['3']);
    expect(lab('docker run --rm alpine:3.21 sh -c "echo bye; exit 7"; echo $?').last.out).toEqual(['bye', '7']);
    expect(lab('docker exec worker sh -c "exit"; echo $?').last.out).toEqual(['0']);
    expect(lab('docker exec worker sh -c "exit 300"; echo $?').last.out).toEqual(['44']);
    expect(lab('docker exec worker sh -c "exit x"; echo $?').last).toEqual({ out: ['2'], err: ['sh: 1: exit: Illegal number: x'] });
    expect(lab('docker run --rm ubuntu:24.04 bash -c "exit x"; echo $?').last).toEqual({ out: ['2'], err: ['bash: line 1: exit: x: numeric argument required'] });
  });
});

describe('fix 5: docker start -a', () => {
  it("exits with the container's exit code", () => {
    const r = lab('docker run --name job alpine:3.21 sh -c "echo working; exit 4"', 'docker start -a job; echo $?', 'docker start job; echo $?', 'docker start -a job worker; echo $?').log;
    expect(r[1]).toEqual({ out: ['working', '4'], err: [] });
    expect(r[2].out).toEqual(['job', '0']);
    expect(r[3]).toEqual({ out: ['1'], err: ['you cannot start and attach multiple containers at once'] });
  });
});

describe('fix 6: untagged images, --digests and -f dangling=', () => {
  it('lists an image untagged by rmi -f while a container uses it as <none> <none>', () => {
    const r = lab('docker rmi -f alpine:3.21', 'docker images', 'docker images -f dangling=true', 'docker images --filter dangling=false -q', 'docker images alpine', 'docker info --format "{{.Images}}"').log;
    expect(r[0].out).toEqual(['Untagged: alpine:3.21', expect.stringMatching(/^Untagged: alpine@sha256:[0-9a-f]{64}$/)]);
    expect(r[1].out).toEqual([
      'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE',
      expect.stringMatching(/^nginx        latest    [0-9a-f]{12}   2 weeks ago   192MB$/),
      expect.stringMatching(/^ubuntu       24\.04     [0-9a-f]{12}   5 weeks ago   78\.1MB$/),
      expect.stringMatching(/^<none>       <none>    [0-9a-f]{12}   6 weeks ago   7\.83MB$/),
    ]);
    const id = r[1].out[3].split(/\s+/)[2];
    expect(r[2].out).toEqual(['REPOSITORY   TAG       IMAGE ID       CREATED       SIZE', `<none>       <none>    ${id}   6 weeks ago   7.83MB`]);
    expect(r[3].out).toHaveLength(2);
    expect(r[3].out).not.toContain(id);
    expect(r[4].out).toEqual(['REPOSITORY   TAG       IMAGE ID   CREATED   SIZE']);
    expect(r[5].out).toEqual(['3']);
    // --digests adds the DIGEST column (an untagged image has none).
    const g = lab('docker rmi -f alpine:3.21', 'docker images --digests').last.out;
    expect(g[0]).toBe('REPOSITORY   TAG       DIGEST                                                                    IMAGE ID       CREATED       SIZE');
    expect(g[1]).toMatch(/^nginx        latest    sha256:[0-9a-f]{64}   [0-9a-f]{12}   2 weeks ago   192MB$/);
    expect(g[3]).toMatch(/^<none>       <none>    <none>                                                                    [0-9a-f]{12}   6 weeks ago   7\.83MB$/);
    // The image check no longer finds the tag; a running container's untagged image cannot be removed even with -f.
    const s = lab('docker rmi -f alpine:3.21', `docker rmi -f ${id}`);
    expect(s.last.err).toEqual([expect.stringMatching(new RegExp(`^Error response from daemon: conflict: unable to delete ${id} \\(cannot be forced\\) - image is being used by running container [0-9a-f]{12}$`))]);
    const x: TerminalExercise = { id: 'x', machine: dockLab.id, title: 't', statement: 's', hints: [], explanation: 'e', checks: [{ kind: 'image', name: 'alpine:3.21', absent: true }], solution: ['docker rmi -f alpine:3.21'], mistakes: [] };
    expect(checkTerminalExercise(x, [dockLab], ['docker rmi -f alpine:3.21']).ok).toBe(true);
    // Once nothing uses it, rmi by ID deletes it; pulling the tag again tags the untagged copy.
    const del = lab('docker rmi -f alpine:3.21', 'docker rm -f worker', `docker rmi ${id}`, 'docker images -f dangling=true -q').log;
    expect(del[2].out[0]).toMatch(/^Deleted: sha256:[0-9a-f]{64}$/);
    expect(del[3].out).toEqual([]);
    const again = lab('docker rmi -f alpine:3.21', 'docker pull alpine:3.21', 'docker images -f dangling=true -q', 'docker ps --format "{{.Image}}"').log;
    expect(again[1].out).toEqual(['3.21: Pulling from library/alpine', expect.stringMatching(/^[0-9a-f]{12}: Already exists$/), expect.stringMatching(/^Digest: sha256:/), 'Status: Downloaded newer image for alpine:3.21', 'docker.io/library/alpine:3.21']);
    expect(again[2].out).toEqual([]);
    expect(again[3].out).toEqual(['alpine:3.21']);
    expect(lab('docker images -f dangling=maybe').last.err).toEqual(["Error response from daemon: invalid filter 'dangling=maybe'"]);
  });
});

describe('fix 7: docker ps --filter publish= and expose=', () => {
  it('matches host ports (publish) and the container ports exposed or published (expose), with ranges and protocols', () => {
    const base = ['docker run -d --name web -p 8080:80 nginx', 'docker run -d --name cache -p 127.0.0.1:6380:6379 redis:7.4'];
    const names = (filter: string) => lab(...base, `docker ps -a ${filter} --format "{{.Names}}"`).last.out;
    expect(names('--filter publish=8080')).toEqual(['web']);
    expect(names('--filter publish=8080/tcp')).toEqual(['web']);
    expect(names('--filter publish=8080/udp')).toEqual([]);
    expect(names('--filter publish=80')).toEqual([]);
    // The exited old-web keeps its binding (HostConfig.PortBindings), so -a lists it.
    expect(names('--filter publish=8081')).toEqual(['old-web']);
    expect(names('--filter publish=6000-8080')).toEqual(['cache', 'web']);
    expect(names('-f publish=8080 -f publish=6380')).toEqual(['cache', 'web']);
    expect(names('--filter expose=80')).toEqual(['web', 'old-web']);
    expect(names('--filter expose=6379')).toEqual(['cache']);
    expect(names('--filter expose=80 --filter status=running')).toEqual(['web']);
    expect(lab('docker ps --filter publish=8080:80').last.err).toEqual(["Error response from daemon: filter for 'publish' should not contain ':': 8080:80"]);
    expect(lab('docker ps --filter expose=web').last.err).toEqual(['Error response from daemon: error while looking up for expose web: strconv.ParseUint: parsing "web": invalid syntax']);
  });
});

describe('fix 8: docker inspect Config.Env', () => {
  it('has the -e values, the image ENV and PATH, but not HOSTNAME or HOME (env in the container still has them)', () => {
    const r = lab('docker run -d --name web -e MODE=dev -e NGINX_VERSION=x nginx', 'docker inspect -f "{{.Config.Env}}" web', 'docker exec web env',
      'docker run -d --name box ubuntu:24.04 sleep infinity', 'docker inspect -f "{{json .Config.Env}}" box').log;
    expect(r[1].out).toEqual(['[MODE=dev NGINX_VERSION=x PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin]']);
    expect(r[2].out[1]).toMatch(/^HOSTNAME=[0-9a-f]{12}$/);
    expect(r[2].out.at(-1)).toBe('HOME=/root');
    expect(r[4].out).toEqual(['["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"]']);
  });
});

describe('BusyBox ls in Alpine images', () => {
  it("names a missing path as BusyBox does; other images keep GNU's text", () => {
    expect(lab('docker exec worker ls /nope').last.err).toEqual(['ls: /nope: No such file or directory']);
    expect(lab('docker exec worker sh -c "ls /nope | wc -l"').last.err).toEqual(['ls: /nope: No such file or directory']);
    expect(lab('docker run --rm ubuntu:24.04 ls /nope').last.err).toEqual(["ls: cannot access '/nope': No such file or directory"]);
  });
});

describe('docker rmi -f of the last tag', () => {
  it('deletes an image only stopped containers use, and only untags one a running container uses', () => {
    // Stopped: old-web (exited) is the only user of nginx. The image and its layers go; old-web stays and shows the old ID.
    const stopped = lab('docker rmi -f nginx; echo $?', 'docker images --format "{{.Repository}}:{{.Tag}}"', 'docker images -f dangling=true -q', 'docker ps -a --filter name=old-web --format "{{.Image}} {{.Status}}"').log;
    expect(stopped[0].out.slice(0, 3)).toEqual(['Untagged: nginx:latest', expect.stringMatching(/^Untagged: nginx@sha256:[0-9a-f]{64}$/), expect.stringMatching(/^Deleted: sha256:6b80bc54ac19[0-9a-f]{52}$/)]);
    expect(stopped[0].out.slice(3, -1)).toHaveLength(7);
    expect(stopped[0].out.slice(3, -1).every(l => /^Deleted: sha256:[0-9a-f]{64}$/.test(l))).toBe(true);
    expect(stopped[0].out.at(-1)).toBe('0');
    expect(stopped[1].out).toEqual(['ubuntu:24.04', 'alpine:3.21']);
    expect(stopped[2].out).toEqual([]);
    expect(stopped[3].out).toEqual(['6b80bc54ac19 Exited (0) 5 minutes ago']);
    // A created container (left by a port conflict) counts as stopped too.
    const created = lab('docker run -d --name a -p 9000:80 nginx', 'docker run -d --name blocked -p 9000:80 ubuntu:24.04 sleep infinity', 'docker ps -a --filter name=blocked --format "{{.Status}}"', 'docker rmi -f ubuntu:24.04').log;
    expect(created[2].out).toEqual(['Created']);
    expect(created[3].out.slice(2)).toEqual([expect.stringMatching(/^Deleted: sha256:1ab7d251cec8/), expect.stringMatching(/^Deleted: sha256:/)]);
    // Running: worker (sleep infinity) uses alpine. Only the tags go; the image stays as <none> <none>.
    const running = lab('docker rmi -f alpine:3.21', 'docker images -f dangling=true --format "{{.Repository}} {{.Tag}} {{.ID}}"', 'docker ps --filter name=worker --format "{{.Image}}"').log;
    expect(running[0].out).toEqual(['Untagged: alpine:3.21', expect.stringMatching(/^Untagged: alpine@sha256:[0-9a-f]{64}$/)]);
    expect(running[1].out).toEqual([`<none> <none> ${running[2].out[0]}`]);
    // Without -f the conflict message is unchanged.
    expect(lab('docker rmi nginx').last.err).toEqual(['Error response from daemon: conflict: unable to remove repository reference "nginx" (must force) - container 6d2f14683c9e is using its referenced image 6b80bc54ac19']);
  });
});

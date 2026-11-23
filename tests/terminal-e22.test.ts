import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { E22_COMMANDS, IMAGES_PROFILE, run, STORAGE_NET_PROFILE } from '@/lib/terminal/shell';
import { STORAGE_MANUAL, STORAGE_NET_MANUAL } from '@/lib/terminal/manual';
import { decodeTar } from '@/lib/terminal/tar';
import { parseDockerfile } from '@/lib/terminal/build';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { connectExercise, keepDataExercise, NGINX_PAGE, storageNetLab } from './support/storage-net-fixture';
import { buildLab } from './support/build-fixture';

/*
 * Engine stage E22 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §12): the storage-net profile — docker volume (named and
 * anonymous volumes under /var/lib/docker/volumes, copy-up, in use, prune), -v / --mount / --tmpfs (bind mounts shown live
 * both ways, read-only mounts, tmpfs emptied on stop), owners by number (the non-root USER and a root-owned bind mount),
 * tar for the backup pattern, docker network (bridge, host, none, user-defined networks with Docker's DNS, connect and
 * disconnect), what a container reaches (names, ports, other networks), --network host and none, docker inspect's mounts
 * and networks, and the volume, network and reach checks. Below the profile volume, network and -v say engine stage E22.
 */
function session(from: FsState | TerminalMachine, profile = STORAGE_NET_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const lab = (...commands: string[]) => session(storageNetLab, STORAGE_NET_PROFILE, ...commands);
const ID = /^[0-9a-f]{64}$/;

describe('the storage-net profile', () => {
  it('is the images profile with tar and the storage-net feature', () => {
    expect([...STORAGE_NET_PROFILE.commands]).toEqual([...IMAGES_PROFILE.commands.filter(c => !['man', 'clear', 'help'].includes(c)), 'tar', 'man', 'clear', 'help']);
    expect(STORAGE_NET_PROFILE.features).toEqual([...IMAGES_PROFILE.features!, 'storage-net']);
    expect(E22_COMMANDS).toEqual(['tar']);
    expect(profileOf(storageNetLab)).toBe(STORAGE_NET_PROFILE);
    expect(machineProblems(storageNetLab)).toEqual([]);
  });
  it('below it, docker volume, docker network, -v, --mount and --network say engine stage E22, and tar is not a command', () => {
    const low = session({ ...buildLab }, IMAGES_PROFILE, 'docker volume ls', 'docker network ls', 'docker run --rm -v data:/data alpine:3.21 true', 'echo $?',
      'docker run --rm --mount type=tmpfs,target=/x alpine:3.21 true', 'docker run --rm --network host alpine:3.21 true', 'docker run --rm -dv x:/y alpine:3.21 true', 'tar tzf x.tgz', 'docker cp a b').log;
    expect(low[0].err).toEqual(['docker volume：模擬環境在引擎階段 E22（Volume 與網路） 才支援']);
    expect(low[1].err).toEqual(['docker network：模擬環境在引擎階段 E22（Volume 與網路） 才支援']);
    expect(low[2].err).toEqual(['docker run -v：模擬環境在引擎階段 E22（Volume 與網路） 才支援']);
    expect(low[3].out).toEqual(['125']);
    expect(low[4].err).toEqual(['docker run --mount：模擬環境在引擎階段 E22（Volume 與網路） 才支援']);
    expect(low[5].err).toEqual(['docker run --network：模擬環境在引擎階段 E22（Volume 與網路） 才支援']);
    expect(low[6].err).toEqual(['docker run -v：模擬環境在引擎階段 E22（Volume 與網路） 才支援']);
    expect(low[7].err[0]).toMatch(/^bash: tar: command not found（模擬環境支援：/);
    expect(low[8].err).toEqual(['docker cp：模擬環境在引擎階段 E22（Volume 與網路） 才支援']);
    // The E22 data needs the profile.
    const below = { ...storageNetLab, profile: 'images' as const };
    expect(machineProblems(below).join('\n')).toContain("volumes, networks and the containers' volumes, network, aliases and user need the storage-net profile (engine stage E22)");
    expect(machineProblems(below).join('\n')).toContain('image postgres:17: volumes need the storage-net profile (engine stage E22)');
    // VOLUME in a Dockerfile is still E22 on the images profile.
    expect(session(buildLab, IMAGES_PROFILE, "printf 'FROM python:3.12-slim\\nVOLUME /data\\n' > Dockerfile", 'docker build -t v .').last.err).toContain('ERROR: failed to solve: VOLUME：模擬環境在引擎階段 E22（Volume 與網路） 才支援');
  });
  it('has its manual pages and help lines; docker lists the management commands', () => {
    expect(lab('docker --help').last.out[0]).toBe(`用法：${STORAGE_NET_MANUAL.usage}`);
    expect(lab('tar --help').last.out[0]).toBe(`用法：${STORAGE_MANUAL.tar.usage}`);
    expect(lab('help').last.out).toEqual(expect.arrayContaining([
      '  docker volume|network|build|history|run|ps|images|pull|logs|exec|stop|start|rm|rmi|port|inspect …  Volume、網路、Image 與 Container（需要 docker 群組或 sudo）',
      '  tar czf 封存檔 [-C 目錄] 路徑… | tzf 封存檔 | xzf 封存檔 [-C 目錄]  建立、列出與解開 tar（.tgz）封存檔',
    ]));
    expect(lab('docker').last.out).toEqual(expect.arrayContaining(['Management Commands:', '  network     Manage networks', '  volume      Manage volumes']));
    expect(lab('docker volume').last.out).toEqual(['', 'Usage:  docker volume COMMAND', '', 'Manage volumes', '', 'Commands:', '  create      Create a volume', '  inspect     Display detailed information on one or more volumes',
      '  ls          List volumes', '  prune       Remove unused local volumes', '  rm          Remove one or more volumes', '', "Run 'docker volume COMMAND --help' for more information on a command."]);
    expect(lab('docker network x').last.err).toEqual(["docker: 'network x' is not a docker command.", "See 'docker --help'"]);
    expect(lab('docker cp db:/x .').last.err[0]).toMatch(/^docker cp：模擬環境不支援/);
  });
});

describe('volumes', () => {
  it('docker volume ls, inspect, create (named or not), rm and its errors', () => {
    const r = lab('docker volume ls', 'docker volume inspect pgdata', 'docker volume create cache', 'docker volume create cache', 'docker volume create', 'docker volume ls -q',
      'docker volume inspect -f "{{.Mountpoint}} {{.Driver}}" cache', 'docker volume rm cache nope', 'docker volume rm pgdata', 'docker volume create Bad/x', 'docker volume create -d nfs x1', 'sudo ls -la /var/lib/docker/volumes').log;
    expect(r[0].out).toEqual(['DRIVER    VOLUME NAME', 'local     pgdata']);
    expect(JSON.parse(r[1].out.join('\n'))).toEqual([{ CreatedAt: '2026-11-22T09:00:00Z', Driver: 'local', Labels: null, Mountpoint: '/var/lib/docker/volumes/pgdata/_data', Name: 'pgdata', Options: null, Scope: 'local' }]);
    expect(r[2].out).toEqual(['cache']);
    expect(r[3].out).toEqual(['cache']);
    expect(r[4].out[0]).toMatch(ID);
    expect(r[5].out).toEqual([r[4].out[0], 'cache', 'pgdata'].sort());
    expect(r[6].out).toEqual(['/var/lib/docker/volumes/cache/_data local']);
    expect(r[7]).toEqual({ out: ['cache'], err: ['Error response from daemon: get nope: no such volume'] });
    expect(r[8].err).toEqual([expect.stringMatching(/^Error response from daemon: remove pgdata: volume is in use - \[[0-9a-f]{64}\]$/)]);
    expect(r[9].err).toEqual(['Error response from daemon: create Bad/x: "Bad/x" includes invalid characters for a local volume name, only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use absolute path']);
    expect(r[10].err).toEqual(['Error response from daemon: create x1: error looking up volume plugin nfs: plugin "nfs" not found']);
    expect(r[11].out.join('\n')).toMatch(/pgdata/);
  });
  it('a named volume keeps its data after docker rm and is shared by containers; the host sees it under /var/lib/docker/volumes', () => {
    const r = lab('docker exec db ls -l /var/lib/postgresql/data', "docker exec db sh -c 'echo 2,coffee >> /var/lib/postgresql/data/orders.csv'", 'docker rm -f db', 'docker volume ls -q',
      'sudo cat /var/lib/docker/volumes/pgdata/_data/orders.csv', 'sudo ls -l /var/lib/docker/volumes/pgdata/_data', 'docker run -d --name db2 -v pgdata:/var/lib/postgresql/data postgres:17',
      'docker run --rm -v pgdata:/mnt alpine:3.21 cat /mnt/orders.csv', 'ls /var/lib/docker/volumes').log;
    expect(r[0].out).toEqual(['-rw-r--r-- postgres postgres     3 PG_VERSION', '-rw-r--r-- postgres postgres    14 orders.csv']);
    expect(r[3].out).toEqual(['pgdata']);
    expect(r[4].out).toEqual(['id,item', '1,tea', '2,coffee']);
    expect(r[5].out).toEqual(['-rw-r--r-- 999     999         3 PG_VERSION', '-rw-r--r-- 999     999        23 orders.csv']);
    expect(r[7].out).toEqual(['id,item', '1,tea', '2,coffee']);
    // /var/lib/docker is root's (0710): learner cannot even look.
    expect(r[8].err).toEqual(["ls: cannot access '/var/lib/docker/volumes': Permission denied"]);
  });
  it('a new empty volume is filled from the image (copy-up); a bind mount never is', () => {
    const r = lab('docker run -d --name a -v fresh:/usr/share/nginx/html nginx:1.27', 'sudo ls /var/lib/docker/volumes/fresh/_data', 'mkdir empty',
      'docker run -d --name b -v ./empty:/usr/share/nginx/html nginx:1.27', 'docker exec b ls /usr/share/nginx/html', 'ls empty', 'docker exec a cat /usr/share/nginx/html/index.html').log;
    expect(r[1].out).toEqual(['index.html']);
    expect(r[4].out).toEqual([]);
    expect(r[5].out).toEqual([]);
    expect(r[6].out.join('\n')).toBe(NGINX_PAGE.trimEnd());
  });
  it('the image\'s VOLUME is an anonymous volume; docker rm -v and --rm remove it, docker rm does not; prune takes anonymous ones (-a: all unused)', () => {
    const r = lab('docker run -d --name pg postgres:17', 'docker volume ls -q', 'docker inspect -f "{{range .Mounts}}{{.Type}} {{.Destination}}{{end}}" pg', 'docker rm -f pg', 'docker volume ls -q',
      'docker volume prune -f', 'docker volume ls -q', 'docker run -d --name pg3 postgres:17', 'docker rm -fv pg3', 'docker volume ls -q', 'docker run --rm -v /scratch alpine:3.21 true', 'docker volume ls -q',
      'docker volume create spare', 'docker volume prune -f', 'docker volume prune -af', 'echo y | docker volume prune').log;
    const anon = r[1].out.find(v => v !== 'pgdata')!;
    expect(anon).toMatch(ID);
    expect(r[2].out).toEqual(['volume /var/lib/postgresql/data']);
    expect(r[4].out).toContain(anon);
    expect(r[5].out).toEqual(['Deleted Volumes:', anon, '', 'Total reclaimed space: 3B']);
    expect(r[6].out).toEqual(['pgdata']);
    expect(r[9].out).toEqual(['pgdata']);
    expect(r[11].out).toEqual(['pgdata']);
    expect(r[13].out).toEqual(['Total reclaimed space: 0B']);
    expect(r[14].out).toEqual(['Deleted Volumes:', 'spare', '', 'Total reclaimed space: 0B']);
    expect(r[15].out).toEqual(['WARNING! This will remove anonymous local volumes not used by at least one container.', 'Are you sure you want to continue? [y/N] Total reclaimed space: 0B']);
    expect(lab('docker volume prune').last.err).toEqual(['（模擬環境沒有鍵盤可以回答；請加 -f，或寫成 echo y | docker volume prune）']);
  });
  it('a bind mount shows the host\'s files live, both ways; nginx serves them; :ro refuses writes', () => {
    const r = lab('docker run -d --name web -p 8080:80 -v ./site:/usr/share/nginx/html:ro nginx:1.27', 'curl -s localhost:8080', "echo '<h1>v2</h1>' > site/index.html", 'curl -s localhost:8080',
      'docker exec web cat /usr/share/nginx/html/index.html', 'docker exec web touch /usr/share/nginx/html/x', 'echo $?', "docker exec web sh -c 'echo hi > /usr/share/nginx/html/x'", 'docker exec web rm /usr/share/nginx/html/index.html',
      'ls site', 'docker run --rm -v ./site:/w alpine:3.21 sh -c "echo from-container > /w/note.txt"', 'cat site/note.txt', 'ls -l site/note.txt').log;
    expect(r[1].out).toEqual(['<h1>v1</h1>']);
    expect(r[3].out).toEqual(['<h1>v2</h1>']);
    expect(r[4].out).toEqual(['<h1>v2</h1>']);
    expect(r[5].err).toEqual(["touch: cannot touch '/usr/share/nginx/html/x': Read-only file system"]);
    expect(r[6].out).toEqual(['1']);
    expect(r[7].err).toEqual(['sh: 1: cannot create /usr/share/nginx/html/x: Read-only file system']);
    expect(r[8].err).toEqual(["rm: cannot remove '/usr/share/nginx/html/index.html': Read-only file system"]);
    expect(r[9].out).toEqual(['index.html']);
    expect(r[11].out).toEqual(['from-container']);
    // The container's root wrote it: root owns it on the host.
    expect(r[12].out).toEqual(['-rw-r--r-- root    root       15 site/note.txt']);
  });
  it('--mount type=volume|bind|tmpfs, readonly, and the errors of -v and --mount', () => {
    const r = lab('docker run --rm --mount type=volume,source=pgdata,target=/d,readonly alpine:3.21 touch /d/x', 'docker run --rm --mount type=bind,src=./site,dst=/s alpine:3.21 ls /s',
      'docker run --rm --mount type=bind,source=/nope,target=/x alpine:3.21 true', 'docker run --rm --mount type=volume,src=v1 alpine:3.21 true', 'docker run --rm -v data:app alpine:3.21 true',
      'docker run --rm -v Bad/x:/x alpine:3.21 true', 'docker run --rm -v aa:/x -v bb:/x alpine:3.21 true', 'docker run --rm --mount type=npipe,target=/x alpine:3.21 true').log;
    expect(r[0].err).toEqual(["touch: cannot touch '/d/x': Read-only file system"]);
    expect(r[1].out).toEqual(['index.html']);
    expect(r[2].err).toEqual(['docker: Error response from daemon: invalid mount config for type "bind": bind source path does not exist: /nope.', "See 'docker run --help'."]);
    expect(r[3].err).toEqual(['invalid argument "type=volume,src=v1" for "--mount" flag: target is required', "See 'docker run --help'."]);
    expect(r[4].err).toEqual(["docker: Error response from daemon: invalid volume specification: 'data:app': invalid mount config for type \"volume\": invalid mount path: 'app' mount path must be absolute.", "See 'docker run --help'."]);
    expect(r[5].err[0]).toMatch(/^docker: Error response from daemon: create Bad\/x: "Bad\/x" includes invalid characters/);
    expect(r[6].err).toEqual(['docker: Error response from daemon: Duplicate mount point: /x.', "See 'docker run --help'."]);
    expect(r[7].err[0]).toMatch(/^invalid argument "type=npipe,target=\/x" for "--mount" flag: invalid type 'npipe'/);
    // -v with a missing host folder makes it (root's); a name without ./ is a volume.
    const m = lab('docker run --rm -v ./made:/m alpine:3.21 true', 'ls -ld made', 'docker run --rm -v site:/m alpine:3.21 ls /m', 'docker volume ls -q').log;
    expect(m[1].out).toEqual(['drwxr-xr-x root    root     4096 made/']);
    expect(m[2].out).toEqual([]);
    expect(m[3].out).toEqual(['pgdata', 'site']);
  });
  it('tmpfs lives in memory: what is written there is gone when the container stops', () => {
    const r = lab('docker run -d --name t --tmpfs /cache debian:12 sleep infinity', "docker exec t sh -c 'echo x > /cache/a; ls /cache'", 'docker stop t', 'docker start t', 'docker exec t ls /cache',
      "docker inspect -f '{{json .Mounts}}' t").log;
    expect(r[1].out).toEqual(['a']);
    expect(r[4].out).toEqual([]);
    expect(r[5].out).toEqual(['[{"Type":"tmpfs","Source":"","Destination":"/cache","Mode":"","RW":true,"Propagation":""}]']);
  });
  it('owners are numbers: a non-root USER cannot write to a root-owned bind mount; chown on the host or -u fixes it', () => {
    const r = lab('docker run --rm -v ./data:/data team/app:1.0 touch /data/ok', 'echo $?', 'docker run --rm -v ./data:/data team/app:1.0 id', 'docker run --rm -v ./data:/data team/app:1.0 ls -ld /data',
      'sudo chown 10001:10001 data', 'ls -ld data', 'docker run --rm -v ./data:/data team/app:1.0 touch /data/ok', 'ls -l data', 'docker run --rm -v ./data:/data team/app:1.0 ls -l /data').log;
    expect(r[0].err).toEqual(["touch: cannot touch '/data/ok': Permission denied"]);
    expect(r[1].out).toEqual(['1']);
    expect(r[2].out).toEqual(['uid=10001(app) gid=10001(app) groups=10001(app)']);
    expect(r[3].out).toEqual(['drwxr-xr-x root    root     4096 /data']);
    expect(r[5].out).toEqual(['drwxr-xr-x 10001   10001    4096 data/']);
    expect(r[6].err).toEqual([]);
    expect(r[7].out).toEqual(['-rw-r--r-- 10001   10001       0 ok']);
    expect(r[8].out).toEqual(['-rw-r--r-- app     app         0 ok']);
    // -u: a number no account has runs with group 0; learner's uid 1000 owns what it writes on the host.
    const u = lab('docker run --rm -u 1000 -v ./app-data:/data alpine:3.21 sh -c "touch /data/hello; id"', 'ls -l app-data', 'docker run --rm -u 1000:1000 alpine:3.21 id', 'docker run --rm -u ghost alpine:3.21 id').log;
    expect(u[0].out).toEqual(['uid=1000 gid=0(root) groups=0(root)']);
    expect(u[1].out).toEqual(['-rw-r--r-- learner root        0 hello']);
    expect(u[2].out).toEqual(['uid=1000 gid=1000 groups=1000']);
    expect(u[3].err).toEqual(['docker: Error response from daemon: unable to find user ghost: no matching entries in passwd file.']);
    // A file of learner (uid 1000) is uid 1000 in a container whose /etc/passwd has no 1000.
    expect(lab('docker run --rm -v ./site:/s alpine:3.21 ls -l /s').last.out).toEqual(['-rw-r--r-- 1000    1000       12 index.html']);
  });
  it('backs a volume up with tar and restores it into another volume', () => {
    const r = lab('docker run --rm -v pgdata:/data -v $(pwd):/backup alpine:3.21 tar czf /backup/pgdata.tgz -C /data .', 'ls', 'tar tzf pgdata.tgz', 'tar tvzf pgdata.tgz', 'docker volume create restored',
      'docker run --rm -v restored:/data -v $(pwd):/backup alpine:3.21 tar xzf /backup/pgdata.tgz -C /data', 'docker run --rm -v restored:/data alpine:3.21 cat /data/orders.csv',
      'mkdir out', 'tar xvzf pgdata.tgz -C out', 'ls -l out').log;
    expect(r[0]).toEqual({ out: [], err: [] });
    expect(r[1].out).toEqual(['app-data/  data/  pgdata.tgz  site/']);
    expect(r[2].out).toEqual(['./', './PG_VERSION', './orders.csv']);
    expect(r[3].out).toEqual([
      'drwxr-xr-x root/root         0 2026-11-22 10:00 ./',
      '-rw-r--r-- 999/999           3 2026-11-22 10:00 ./PG_VERSION',
      '-rw-r--r-- 999/999          14 2026-11-22 10:00 ./orders.csv',
    ]);
    expect(r[6].out).toEqual(['id,item', '1,tea']);
    expect(r[8].out).toEqual(['./', './PG_VERSION', './orders.csv']);
    // learner extracts as learner.
    expect(r[9].out).toEqual(['-rw-r--r-- learner learner     3 PG_VERSION', '-rw-r--r-- learner learner    14 orders.csv']);
    const archive = decodeTar(r && session(storageNetLab, STORAGE_NET_PROFILE, 'docker run --rm -v pgdata:/data -v $(pwd):/backup alpine:3.21 tar czf /backup/b.tgz -C /data .').state.nodes.get('/home/learner/b.tgz')!.content!);
    expect(archive?.gzip).toBe(true);
    expect(archive?.members.map(m => [m.name, m.uid])).toEqual([['./', 0], ['./PG_VERSION', 999], ['./orders.csv', 999]]);
  });
  it('tar: options, the old style, -v on create, and GNU tar\'s errors', () => {
    const r = lab('tar cvf s.tar site', 'tar tf s.tar', 'tar czf', 'tar tzf nope.tgz', 'tar cf x.tar nope', 'echo $?', 'tar tf site/index.html', 'tar x', 'tar -c -f e.tar', 'tar cf /etc/x.tar site',
      'tar --create --gzip --file=a.tgz /home/learner/site', 'tar -tzf a.tgz').log;
    expect(r[0].out).toEqual(['site/', 'site/index.html']);
    expect(r[1].out).toEqual(['site/', 'site/index.html']);
    expect(r[2].err).toEqual(["tar: option requires an argument -- 'f'", "Try 'tar --help' or 'tar --usage' for more information."]);
    expect(r[3].err).toEqual(['tar: nope.tgz: Cannot open: No such file or directory', 'tar: Error is not recoverable: exiting now']);
    expect(r[4].err).toEqual(['tar: nope: Cannot stat: No such file or directory', 'tar: Exiting with failure status due to previous errors']);
    expect(r[5].out).toEqual(['2']);
    expect(r[6].err).toEqual(['tar: This does not look like a tar archive', 'tar: Exiting with failure status due to previous errors']);
    expect(r[7].err).toEqual(['tar：模擬環境的 tar 需要 -f 封存檔（不讀標準輸入）']);
    expect(r[8].err).toEqual(['tar: Cowardly refusing to create an empty archive', "Try 'tar --help' or 'tar --usage' for more information."]);
    expect(r[9].err).toEqual(['tar: /etc/x.tar: Cannot open: Permission denied', 'tar: Error is not recoverable: exiting now']);
    expect(r[10].err).toEqual(["tar: Removing leading `/' from member names"]);
    expect(r[11].out).toEqual(['home/learner/site/', 'home/learner/site/index.html']);
  });
  it('VOLUME in a Dockerfile (storage-net): the image\'s Config.Volumes, history, and an anonymous volume per container', () => {
    const p = parseDockerfile('FROM alpine:3.21\nVOLUME ["/data", "/logs"]\nVOLUME /cache\n');
    expect('instructions' in p && p.instructions.map(i => [i.keyword, i.json ?? i.args])).toEqual([['FROM', 'alpine:3.21'], ['VOLUME', ['/data', '/logs']], ['VOLUME', '/cache']]);
    const r = lab('mkdir v', "printf 'FROM alpine:3.21\\nVOLUME [\"/data\"]\\nCMD [\"sleep\", \"infinity\"]\\n' > v/Dockerfile", 'docker build -q -t vol:1 v', 'docker inspect -f "{{json .Config.Volumes}}" vol:1',
      'docker history --format "{{.CreatedBy}}" vol:1', 'docker run -d --name v1 vol:1', 'docker inspect -f "{{range .Mounts}}{{.Name}} {{.Destination}}{{end}}" v1').log;
    expect(r[3].out).toEqual(['{"/data":{}}']);
    expect(r[4].out.slice(0, 2)).toEqual(['CMD ["sleep" "infinity"]', 'VOLUME [/data]']);
    expect(r[6].out[0]).toMatch(/^[0-9a-f]{64} \/data$/);
  });
  it('the volume check', () => {
    const x = (checks: TerminalExercise['checks']): TerminalExercise => ({ ...keepDataExercise, checks });
    const v = checkTerminalExercise(x([{ kind: 'volume', name: 'pgdata', file: '/orders.csv', content: '2,coffee' }, { kind: 'volume', name: 'gone', absent: true }, { kind: 'volume', name: 'pgdata', file: '/nope' }, { kind: 'volume', name: 'x1' }]),
      [storageNetLab], ["docker exec db sh -c 'echo 2,coffee >> /var/lib/postgresql/data/orders.csv'"]);
    expect(v.results.map(r => r.ok)).toEqual([true, true, false, false]);
    expect(v.results[2].message).toMatch(/Volume pgdata 裡沒有 \/nope$/);
    expect(v.results[3].message).toMatch(/沒有名為 x1 的 Volume$/);
  });
});

describe('networks', () => {
  it('docker network ls, create (subnets), inspect, rm, prune and their errors', () => {
    const r = lab('docker network ls', 'docker network create backend', 'docker network create --subnet 10.10.0.0/24 lab', 'docker network create --subnet 172.18.5.0/24 clash', 'docker network create backend',
      'docker network create -d overlay ov', 'docker network create -d host h2', 'docker network ls --filter type=custom --format "{{.Name}}"', 'docker network inspect -f "{{range .IPAM.Config}}{{.Subnet}} {{.Gateway}}{{end}}" backend lab',
      'docker network rm bridge', 'docker network rm app-net', 'docker network rm nope', 'docker network prune -f', 'docker network ls -q', 'docker network inspect nope').log;
    expect(r[0].out).toEqual([
      'NETWORK ID     NAME      DRIVER    SCOPE', expect.stringMatching(/^[0-9a-f]{12}   app-net   bridge    local$/), expect.stringMatching(/^[0-9a-f]{12}   bridge    bridge    local$/),
      expect.stringMatching(/^[0-9a-f]{12}   host      host      local$/), expect.stringMatching(/^[0-9a-f]{12}   none      null      local$/),
    ]);
    expect(r[1].out[0]).toMatch(ID);
    expect(r[3].err).toEqual(['Error response from daemon: invalid pool request: Pool overlaps with other one on this address space']);
    expect(r[4].err).toEqual(['Error response from daemon: network with name backend already exists']);
    expect(r[5].err).toEqual(['Error response from daemon: This node is not a swarm manager. Use "docker swarm init" or "docker swarm join" to connect this node to swarm and try again.']);
    expect(r[6].err).toEqual(['Error response from daemon: only one instance of "host" network is allowed']);
    expect(r[7].out).toEqual(['app-net', 'backend', 'lab']);
    expect(r[8].out).toEqual(['172.19.0.0/16 172.19.0.1', '10.10.0.0/24 10.10.0.1']);
    expect(r[9].err).toEqual(['Error response from daemon: bridge is a pre-defined network and cannot be removed']);
    expect(r[10].err).toEqual([expect.stringMatching(/^Error response from daemon: error while removing network: network app-net has active endpoints \(name:"db" id:"[0-9a-f]{12}"\)$/)]);
    expect(r[11].err).toEqual(['Error response from daemon: network nope not found']);
    expect(r[12].out).toEqual(['Deleted Networks:', 'backend', 'lab']);
    expect(r[13].out).toHaveLength(4);
    expect(r[14]).toEqual({ out: ['[]'], err: ['Error response from daemon: network nope not found'] });
    const inspect = JSON.parse(lab('docker network inspect app-net').last.out.join('\n'))[0];
    expect(Object.keys(inspect)).toEqual(['Name', 'Id', 'Created', 'Scope', 'Driver', 'EnableIPv6', 'IPAM', 'Internal', 'Attachable', 'Ingress', 'ConfigFrom', 'ConfigOnly', 'Containers', 'Options', 'Labels']);
    expect(inspect.IPAM).toEqual({ Driver: 'default', Options: {}, Config: [{ Subnet: '172.18.0.0/16', Gateway: '172.18.0.1' }] });
    expect(Object.values(inspect.Containers)).toEqual([{ Name: 'db', EndpointID: expect.stringMatching(ID), MacAddress: '02:42:ac:12:00:02', IPv4Address: '172.18.0.2/16', IPv6Address: '' }]);
  });
  it('a user-defined network has Docker\'s DNS: names, short IDs and NAME.network; the default bridge resolves no names', () => {
    const r = lab('docker run -d --name api --network app-net team/api:1.0', 'docker run -d --name tool --network app-net debian:12 sleep infinity', 'docker exec tool getent hosts db', 'docker exec tool getent hosts db.app-net',
      'docker exec tool ping -c 2 db', 'docker exec tool curl -s http://api:3000/health', 'docker exec tool cat /etc/resolv.conf', 'docker run -d --name lone debian:12 sleep infinity', 'docker exec lone getent hosts db',
      'echo $?', 'docker exec lone curl -s http://api:3000/', 'echo $?', 'docker exec lone cat /etc/resolv.conf', 'docker logs api').log;
    expect(r[2].out).toEqual(['172.18.0.2      db']);
    expect(r[3].out).toEqual(['172.18.0.2      db.app-net']);
    expect(r[4].out).toEqual(['PING db (172.18.0.2) 56(84) bytes of data.', '64 bytes from db.app-net (172.18.0.2): icmp_seq=1 ttl=64 time=0.061 ms', '64 bytes from db.app-net (172.18.0.2): icmp_seq=2 ttl=64 time=0.061 ms', '',
      '--- db ping statistics ---', '2 packets transmitted, 2 received, 0% packet loss, time 1001ms', 'rtt min/avg/max/mdev = 0.061/0.061/0.061/0.000 ms']);
    expect(r[5].out).toEqual(['{"status":"ok"}']);
    expect(r[6].out).toEqual(['# Generated by Docker Engine.', '# This file can be edited; Docker Engine will not make further changes once it', '# has been modified.', '', 'nameserver 127.0.0.11', 'options ndots:0', '',
      "# Based on host file: '/etc/resolv.conf' (internal resolver)", '# ExtServers: [host(127.0.0.53)]', '# Overrides: []', '# Option ndots from: internal']);
    expect(r[8]).toEqual({ out: [], err: [] });
    expect(r[9].out).toEqual(['2']);
    expect(r[11].out).toEqual(['6']);
    expect(r[12].out).toEqual(['# Generated by Docker Engine.', '# This file can be edited; Docker Engine will not make further changes once it', '# has been modified.', '', 'nameserver 8.8.8.8', 'nameserver 8.8.4.4', '',
      "# Based on host file: '/etc/resolv.conf' (legacy)", '# Overrides: []']);
    // The request came from tool's address on app-net.
    expect(r[13].out).toEqual(['api listening on :3000', '172.18.0.4 - - [22/Nov/2026:10:00:00 +0000] "GET /health HTTP/1.1" 200 16 "-" "curl/8.5.0" "-"']);
  });
  it('other networks are unreachable even by address; containers use the container port, not the published one', () => {
    const r = lab('docker run -d --name api --network app-net -p 8081:3000 team/api:1.0', 'docker run -d --name lone debian:12 sleep infinity', 'docker exec lone curl http://172.18.0.3:3000/',
      'docker run -d --name tool --network app-net debian:12 sleep infinity', 'docker exec tool curl -s http://api:8081/', 'echo $?', 'docker exec tool curl -s http://api:3000/', 'curl -s localhost:8081',
      'docker logs api', 'docker exec tool nc -zv db 5432', 'docker exec tool nc -zv db 80').log;
    expect(r[2].err).toEqual(["curl: (7) Failed to connect to 172.18.0.3 port 3000 after 127000 ms: Couldn't connect to server"]);
    expect(r[5].out).toEqual(['7']);
    expect(r[6].out).toEqual(['api ok']);
    expect(r[7].out).toEqual(['api ok']);
    // docker-proxy reaches a container of a user-defined network from that network's gateway.
    expect(r[8].out.slice(1).map(l => l.split(' ')[0])).toEqual(['172.18.0.4', '172.18.0.1']);
    expect(r[9].err).toEqual(['Connection to db (172.18.0.2) 5432 port [tcp/*] succeeded!']);
    expect(r[10].err).toEqual(['nc: connect to db (172.18.0.2) port 80 (tcp) failed: Connection refused']);
  });
  it('connect and disconnect: a second network, its address, /etc/hosts and the inspect templates', () => {
    const r = lab('docker run -d --name web debian:12 sleep infinity', 'docker network connect app-net web', 'docker exec web getent hosts db', 'docker exec web cat /etc/hosts',
      'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}" web', "docker inspect -f '{{.NetworkSettings.Networks}}' web", "docker inspect -f '{{(index .NetworkSettings.Networks \"app-net\").IPAddress}}' web",
      "docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}};{{end}}' web", "docker inspect -f '{{.NetworkSettings.Networks.app-net.IPAddress}}' web", 'docker inspect -f "{{.NetworkSettings.IPAddress}}" db',
      'docker network connect app-net web', 'docker network disconnect app-net web', 'docker exec web getent hosts db', 'docker network disconnect app-net web', 'docker network connect --alias x bridge db',
      'docker ps --format "{{.Names}} {{.Networks}} {{.Mounts}}"', 'docker ps --filter network=app-net --format "{{.Names}}"', 'docker ps --filter volume=pgdata --format "{{.Names}}"').log;
    expect(r[2].out).toEqual(['172.18.0.2      db']);
    expect(r[3].out.slice(-2)).toEqual([expect.stringMatching(/^172\.17\.0\.2\t[0-9a-f]{12}$/), expect.stringMatching(/^172\.18\.0\.3\t[0-9a-f]{12}$/)]);
    expect(r[4].out).toEqual(['172.18.0.3 172.17.0.2 ']);
    expect(r[5].out[0]).toMatch(/^map\[app-net:0xc000[0-9a-f]{5}0 bridge:0xc000[0-9a-f]{5}0\]$/);
    expect(r[6].out).toEqual(['172.18.0.3']);
    expect(r[7].out).toEqual(['app-net=172.18.0.3;bridge=172.17.0.2;']);
    expect(r[8].err).toEqual(["template parsing error: template: :1: bad character U+002D '-'"]);
    expect(r[9].out).toEqual(['']);
    expect(r[10].err).toEqual(['Error response from daemon: endpoint with name web already exists in network app-net']);
    expect(r[12].out).toEqual([]);
    expect(r[13].err).toEqual([expect.stringMatching(/^Error response from daemon: container [0-9a-f]{64} is not connected to network app-net$/)]);
    expect(r[14].err).toEqual(['Error response from daemon: network-scoped alias is supported only for containers in user defined networks']);
    expect(r[15].out).toEqual(['web bridge ', 'db app-net pgdata']);
    expect(r[16].out).toEqual(['db']);
    expect(r[17].out).toEqual(['db']);
  });
  it('--network host shares the host\'s ports (-p is discarded); a port taken stops the second; --network none has no network', () => {
    const r = lab('docker run -d --name hostweb --network host -p 9000:80 nginx:1.27', 'sudo ss -tlnp', 'curl -s localhost:80', 'docker ps --format "{{.Names}} [{{.Ports}}]"',
      'docker run -d --name hostweb2 --network host nginx:1.27', 'docker ps -a --filter name=hostweb2 --format "{{.Status}}"', 'docker logs hostweb2', 'docker exec hostweb hostname', 'docker logs hostweb',
      'docker inspect -f "{{.HostConfig.NetworkMode}}" hostweb', 'docker run --rm --network none debian:12 getent hosts db', 'echo $?', 'docker network connect app-net hostweb', 'docker stop hostweb', 'sudo ss -tln').log;
    expect(r[0].err).toEqual(['WARNING: Published ports are discarded when using host network mode']);
    expect(r[1].out.join('\n')).toMatch(/0\.0\.0\.0:80 +0\.0\.0\.0:\* +users:\(\("nginx",pid=\d+,fd=3\)\)/);
    expect(r[2].out.join('\n')).toBe(NGINX_PAGE.trimEnd());
    expect(r[3].out).toEqual(['hostweb []', 'db [5432/tcp]']);
    expect(r[5].out).toEqual(['Exited (1) Less than a second ago']);
    expect(r[6].err).toEqual(['（模擬環境：主機的 80 埠已經有程式在監聽，容器的主程式無法監聽而結束）']);
    expect(r[7].out).toEqual(['vol-01']);
    expect(r[8].out.at(-1)).toBe('127.0.0.1 - - [22/Nov/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 69 "-" "curl/8.5.0" "-"');
    expect(r[9].out).toEqual(['host']);
    expect(r[11].out).toEqual(['2']);
    expect(r[12].err).toEqual(['Error response from daemon: container cannot be disconnected from host network or connected to host network']);
    expect(r[14].out.join('\n')).not.toMatch(/:80 /);
  });
  it('addresses per network: 172.17.0.0/16 for the default bridge, 172.18.0.0/16 for the first user network; docker-proxy forwards to it', () => {
    const r = lab('docker run -d --name a nginx:1.27', 'docker run -d --name b --network app-net -p 8080:80 nginx:1.27', 'docker inspect -f "{{.NetworkSettings.IPAddress}}" a', 'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" b',
      'ps -eo args | grep docker-proxy').log;
    expect(r[2].out).toEqual(['172.17.0.2']);
    expect(r[3].out).toEqual(['172.18.0.3']);
    expect(r[4].out[0]).toBe('/usr/bin/docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 8080 -container-ip 172.18.0.3 -container-port 80');
  });
  it('the network and reach checks', () => {
    const x = (checks: TerminalExercise['checks']): TerminalExercise => ({ ...connectExercise, checks });
    const v = checkTerminalExercise(x([{ kind: 'network', name: 'app-net', container: 'db', driver: 'bridge', subnet: '172.18.0.0/16' }, { kind: 'network', name: 'gone', absent: true }, { kind: 'network', name: 'app-net', container: 'api' },
      { kind: 'reach', container: 'api', to: 'db', port: 5432, result: 'unresolved' }, { kind: 'reach', container: 'api', to: '172.18.0.2', port: 5432, result: 'timeout' }, { kind: 'reach', container: 'db', to: 'db', port: 80, result: 'refused' },
      { kind: 'reach', container: 'db', to: 'db', port: 80, result: 'succeeded' }]), [storageNetLab], ['docker run -d --name api team/api:1.0']);
    expect(v.results.map(r => r.ok)).toEqual([true, true, false, true, true, true, false]);
    expect(v.results[2].message).toMatch(/容器 api 連在 bridge$/);
    expect(v.results[6].message).toMatch(/結果是被拒絕$/);
    expect(checkTerminalExercise(connectExercise, [storageNetLab], connectExercise.solution).ok).toBe(true);
    for (const m of connectExercise.mistakes) expect(checkTerminalExercise(connectExercise, [storageNetLab], m.commands).ok, m.why).toBe(false);
  });
});

describe('lesson data', () => {
  it('validates volumes, networks and the containers\' E22 fields', () => {
    const bad: TerminalMachine = {
      ...storageNetLab, docker: {
        ...storageNetLab.docker, volumes: [{ name: 'x' }, { name: 'ok', files: [{ path: 'rel', content: '' }] }], networks: [{ name: 'bridge' }, { name: 'n1', subnet: '172.17.5.0/24' }],
        containers: [{ name: 'c', image: 'alpine:3.21', state: 'created', created: '2026-11-22 09:00:00', network: 'nope' }, { name: 'd', image: 'alpine:3.21', state: 'created', created: '2026-11-22 09:00:00', network: 'bridge', aliases: ['a'] }, { name: 'h', image: 'alpine:3.21', state: 'created', created: '2026-11-22 09:00:00', network: 'host', ports: ['80:80'] }],
      },
    };
    const p = machineProblems(bad).join('\n');
    expect(p).toContain('volume x: a name of [a-zA-Z0-9][a-zA-Z0-9_.-]+, listed once');
    expect(p).toContain("volume ok: at most 40 files with paths from the volume's root (/…)");
    expect(p).toContain('network bridge: a name of [a-zA-Z0-9][a-zA-Z0-9_.-], not bridge, host or none, listed once');
    expect(p).toContain("network n1: its subnet overlaps another network's");
    expect(p).toContain('container c: network nope is not bridge, host, none or a network of the lesson');
    expect(p).toContain('container d: aliases need a user-defined network');
    expect(p).toContain('container h: a container on the host network publishes no ports');
  });
  it('a whole synthetic lesson validates (transcripts replay exactly); check data is validated', () => {
    const r = lab('docker volume ls', 'docker exec db ls /var/lib/postgresql/data');
    const content = {
      machines: [storageNetLab],
      examples: [{ id: 'v', title: 'Volume', description: '列出 Volume。', machine: 'vol-01', steps: [{ command: 'docker volume ls', output: r.log[0].out.join('\n') }, { command: 'docker exec db ls /var/lib/postgresql/data', output: r.log[1].out.join('\n') }] }],
      exercises: [keepDataExercise, connectExercise],
    };
    expect(terminalContentProblems(content)).toEqual([]);
    const broken = { ...content, exercises: [{ ...keepDataExercise, checks: [{ kind: 'volume' as const, name: 'pgdata', absent: true as const, file: '/x' }, { kind: 'reach' as const, container: 'api', to: 'db', port: 0, result: 'succeeded' as const }] }] };
    expect(terminalContentProblems(broken).join('\n')).toContain('a volume check needs a volume name');
    expect(terminalContentProblems(broken).join('\n')).toContain('a reach check from a container needs a container name');
    const low = { ...content, machines: [{ ...buildLab, id: 'vol-01' }], examples: [] };
    expect(terminalContentProblems(low).join('\n')).toContain('a volume check needs a storage-net machine (engine stage E22)');
    expect(terminalContentProblems(low).join('\n')).toContain('a reach check from a container needs a storage-net machine (engine stage E22)');
  });
  it('commands never change the state they were given', () => {
    const start = machineState(storageNetLab), nodes = JSON.stringify([...start.nodes]), docker = JSON.stringify(start.docker, (k, v) => v instanceof Map ? [...v] : v);
    run(start, 'docker rm -f db', STORAGE_NET_PROFILE);
    run(start, 'docker run --rm -v pgdata:/d alpine:3.21 rm /d/orders.csv', STORAGE_NET_PROFILE);
    run(start, 'docker volume rm pgdata', STORAGE_NET_PROFILE);
    run(start, 'docker network create x', STORAGE_NET_PROFILE);
    expect(JSON.stringify([...start.nodes])).toBe(nodes);
    expect(JSON.stringify(start.docker, (k, v) => v instanceof Map ? [...v] : v)).toBe(docker);
  });
});

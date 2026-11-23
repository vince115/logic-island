import type { TerminalExercise, TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';

/*
 * A synthetic machine for engine stage E22 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §12), only for tests: vol-01, an
 * Ubuntu host with Docker CE (the storage-net profile) where learner is in the docker group. nginx serves its html folder
 * from the container's files (a bind mount shows), postgres has a VOLUME and keeps its data there, api answers HTTP on
 * 3000, app runs as a non-root user (uid 10001), alpine and debian are small shells. ~/site is a web page, ~/data is a
 * root-owned folder (the permission problem), ~/app-data is learner's. A pgdata volume with a file exists, and app-net, a
 * user-defined network, with a running db container on it.
 */
const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\nID=debian\n';
export const NGINX_PAGE = '<!DOCTYPE html>\n<html><body><h1>Welcome to nginx!</h1></body></html>\n';

export const SN_IMAGES: TerminalImage[] = [
  {
    name: 'nginx:1.27', size: 191968432, created: '2026-11-05 09:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], env: [PATH_ENV, 'NGINX_VERSION=1.27.3'], expose: [80],
    http: { port: 80, responder: 'nginx-files', accessLog: 'nginx' }, service: true, layers: 7, pulled: true, osRelease: DEBIAN,
    logs: ['/docker-entrypoint.sh: Configuration complete; ready for start up'], files: [{ path: '/usr/share/nginx/html/index.html', content: NGINX_PAGE }],
  },
  {
    name: 'postgres:17', size: 438_000_000, created: '2026-11-08 08:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['postgres'], env: [PATH_ENV, 'PGDATA=/var/lib/postgresql/data'], expose: [5432],
    service: true, layers: 5, pulled: true, osRelease: DEBIAN, volumes: ['/var/lib/postgresql/data'],
    logs: ['LOG:  database system is ready to accept connections'],
    files: [{ path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash\npostgres:x:999:999::/var/lib/postgresql:/bin/bash\n' }, { path: '/etc/group', content: 'root:x:0:\npostgres:x:999:\n' },
      { path: '/var/lib/postgresql/data/PG_VERSION', content: '17\n' }],
  },
  {
    name: 'team/api:1.0', size: 52_000_000, created: '2026-11-20 12:00:00', cmd: ['/app/api'], expose: [3000], http: { port: 3000, responder: 'api', accessLog: 'nginx' }, service: true, pulled: true, registry: false,
    osRelease: DEBIAN, logs: ['api listening on :3000'],
  },
  {
    name: 'team/app:1.0', size: 30_000_000, created: '2026-11-20 12:00:00', cmd: ['sleep', 'infinity'], pulled: true, registry: false, osRelease: DEBIAN, user: 'app',
    files: [{ path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/sh\napp:x:10001:10001::/home/app:/bin/sh\n' }, { path: '/etc/group', content: 'root:x:0:\napp:x:10001:\n' }],
  },
  { name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1, osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n' },
  { name: 'debian:12', size: 116_500_000, created: '2026-10-20 12:00:00', cmd: ['bash'], pulled: true, layers: 1, osRelease: DEBIAN },
];

export const storageNetLab: TerminalMachine = {
  id: 'vol-01', title: 'vol-01（Docker 主機）', user: 'learner', cwd: '/home/learner', host: 'vol-01', profile: 'storage-net',
  files: [dir('/home'), dir('/home/learner'), dir('/home/learner/site'), file('/home/learner/site/index.html', '<h1>v1</h1>\n'),
    dir('/home/learner/data', 'root'), dir('/home/learner/app-data'), file('/etc/resolv.conf', 'nameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n', 'root')],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, { name: 'docker', gid: 988, members: ['learner'] }] },
  responders: [
    { id: 'nginx-files', server: 'nginx/1.27.3', routes: [{ path: '/*', root: '/usr/share/nginx/html' }] },
    { id: 'api', server: 'api/1.0', routes: [{ path: '/', body: 'api ok\n', type: 'text/plain' }, { path: '/health', body: '{"status":"ok"}\n', type: 'application/json' }] },
  ],
  docker: {
    images: SN_IMAGES,
    volumes: [{ name: 'pgdata', created: '2026-11-22 09:00:00', files: [{ path: '/PG_VERSION', content: '17\n', owner: '999' }, { path: '/orders.csv', content: 'id,item\n1,tea\n', owner: '999' }] }],
    networks: [{ name: 'app-net' }],
    containers: [{ name: 'db', image: 'postgres:17', state: 'running', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:01', network: 'app-net', volumes: ['pgdata:/var/lib/postgresql/data'] }],
  },
};

/** DKR07-like: recreate the database container without losing its data (the named volume stays). */
export const keepDataExercise: TerminalExercise = {
  id: 'keep-data', title: '重建資料庫容器', machine: 'vol-01',
  statement: '刪除 db 容器，再以同一個 pgdata Volume 建立一個新的 db2（postgres:17，連在 app-net 上），確認 orders.csv 還在。',
  checks: [{ kind: 'container', name: 'db', absent: true }, { kind: 'container', name: 'db2', state: 'running', image: 'postgres:17' }, { kind: 'volume', name: 'pgdata', file: '/orders.csv', content: '1,tea' },
    { kind: 'network', name: 'app-net', container: 'db2' }],
  solution: ['docker rm -f db', 'docker run -d --name db2 --network app-net -v pgdata:/var/lib/postgresql/data postgres:17'],
  mistakes: [
    { commands: ['docker rm -f db', 'docker volume rm pgdata', 'docker run -d --name db2 --network app-net -v pgdata:/var/lib/postgresql/data postgres:17'], why: '把 Volume 也刪了，資料不見了' },
    { commands: ['docker rm -f db', 'docker run -d --name db2 -v pgdata:/var/lib/postgresql/data postgres:17'], why: '沒有連到 app-net' },
  ],
  hints: ['docker rm 不會刪除具名 Volume'], explanation: '具名 Volume 的資料在 /var/lib/docker/volumes 裡，和容器的生命週期分開。',
};
/** DKR08-like: put api on app-net so that it reaches db by name. */
export const connectExercise: TerminalExercise = {
  id: 'connect-api', title: '以名稱互連', machine: 'vol-01',
  statement: '在 app-net 上以 team/api:1.0 啟動名為 api 的容器（背景執行），讓它能以名稱 db 連到資料庫的 5432 埠。',
  checks: [{ kind: 'container', name: 'api', state: 'running' }, { kind: 'reach', container: 'api', to: 'db', port: 5432, result: 'succeeded' }],
  solution: ['docker run -d --name api --network app-net team/api:1.0'],
  mistakes: [
    { commands: ['docker run -d --name api team/api:1.0'], why: '預設的 bridge 沒有名稱解析，也不在 app-net 上' },
    { commands: ['docker run -d --name api -p 5432:5432 team/api:1.0'], why: '-p 是給主機的；容器之間要在同一個網路上' },
  ],
  hints: ['--network app-net'], explanation: '自訂網路有內建 DNS（127.0.0.11），同一個網路上的容器以名稱互連。',
};

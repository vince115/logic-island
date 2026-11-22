import type { TerminalExercise, TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';

/*
 * Synthetic machines for engine stage E20 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §5–§6), only for tests: dock-01,
 * an Ubuntu host with Docker CE where learner is in the docker group (nginx, alpine and ubuntu pulled; hello-world and
 * redis only on the simulated Docker Hub; an exited web container and a running alpine container at the start), and
 * fresh-01, the same host where learner is not in the docker group yet.
 */
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

export const NGINX_PAGE = '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body><h1>Welcome to nginx!</h1></body>\n</html>\n';
export const HELLO = 'Hello from Docker!\nThis message shows that your installation appears to be working correctly.\n\nTo generate this message, Docker took the following steps:\n 1. The Docker client contacted the Docker daemon.\n 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.\n 3. The Docker daemon created a new container from that image which runs the\n    executable that produces the output you are currently reading.\n 4. The Docker daemon streamed that output to the Docker client, which sent it\n    to your terminal.\n';
const NGINX_LOGS = [
  '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
  '/docker-entrypoint.sh: Configuration complete; ready for start up',
  { text: '2026/11/22 10:00:00 [notice] 1#1: nginx/1.27.3', stream: 2 as const },
  { text: '2026/11/22 10:00:00 [notice] 1#1: start worker processes', stream: 2 as const },
];
const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

export const IMAGES: TerminalImage[] = [
  {
    name: 'nginx', size: 191968432, created: '2026-11-05 09:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'],
    env: [PATH_ENV, 'NGINX_VERSION=1.27.3'], expose: [80], http: { port: 80, responder: 'nginx-site', accessLog: 'nginx' }, service: true, logs: NGINX_LOGS, layers: 7, pulled: true,
    commands: ['ls', 'cat', 'echo', 'env', 'sh', 'bash', 'sleep', 'true', 'false', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'head', 'tail', 'grep', 'wc', 'hostname'],
    files: [{ path: '/usr/share/nginx/html/index.html', content: NGINX_PAGE }, { path: '/etc/nginx/conf.d/default.conf', content: 'server {\n    listen 80;\n    root /usr/share/nginx/html;\n}\n' }],
  },
  { name: 'hello-world', size: 10072, created: '2025-01-21 23:32:32', cmd: ['/hello'], output: HELLO, commands: [], layers: 1 },
  { name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1,
    commands: ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'head', 'tail', 'grep', 'wc', 'hostname'],
    osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n' },
  { name: 'ubuntu:24.04', size: 78118263, created: '2026-10-15 08:00:00', cmd: ['/bin/bash'], pulled: true, layers: 1,
    osRelease: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n' },
  { name: 'redis:7.4', size: 117000000, created: '2026-11-10 06:00:00', cmd: ['redis-server'], entrypoint: ['docker-entrypoint.sh'], expose: [6379], service: true,
    logs: ['1:C 22 Nov 2026 10:00:00.000 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo', '1:M 22 Nov 2026 10:00:00.001 * Ready to accept connections tcp'], layers: 6 },
];

const base = (id: string, host: string, docker: boolean): TerminalMachine => ({
  id, title: `${host}（Docker 主機）`, user: 'learner', cwd: '/home/learner', host, profile: 'containers',
  files: [dir('/home'), dir('/home/learner', 'learner'), file('/home/learner/notes.txt', 'docker 練習\n', 'learner')],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, ...docker ? [{ name: 'docker', gid: 988, members: ['learner'] }] : []] },
  responders: [{ id: 'nginx-site', server: 'nginx/1.27.3', routes: [{ path: '/', body: NGINX_PAGE }, { path: '/health', body: 'ok\n', type: 'text/plain' }] }],
  docker: {
    images: IMAGES,
    containers: [
      { name: 'old-web', image: 'nginx', state: 'exited', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:01', finished: '2026-11-22 09:55:00', exitCode: 0, ports: ['8081:80'] },
      { name: 'worker', image: 'alpine:3.21', command: ['sleep', 'infinity'], state: 'running', created: '2026-11-22 09:57:00', started: '2026-11-22 09:57:00' },
    ],
  },
});
/** learner is in the docker group (and sudo). */
export const dockLab: TerminalMachine = base('dock-01', 'dock-01', true);
/** learner is in sudo but not yet in the docker group. */
export const dockFresh: TerminalMachine = base('fresh-01', 'fresh-01', false);

/** DKR04-like: publish nginx on 8080 as web and see it answer. */
export const publishExercise: TerminalExercise = {
  id: 'publish-web', title: '公開網站', machine: 'dock-01',
  statement: '以 nginx 在背景啟動一個名為 web 的容器，把主機的 8080 埠對應到容器的 80 埠，並確認 http://localhost:8080/ 回應 200。',
  checks: [{ kind: 'container', name: 'web', state: 'running', image: 'nginx', port: '8080:80' }, { kind: 'http', url: 'http://localhost:8080/', status: 200, body: 'Welcome to nginx!' }],
  solution: ['docker run -d --name web -p 8080:80 nginx', 'curl -s localhost:8080 | head -n 3'],
  mistakes: [
    { commands: ['docker run -d --name web nginx'], why: '沒有 -p，主機的 8080 埠沒有人監聽' },
    { commands: ['docker run -d --name web -p 80:8080 nginx'], why: '主機埠與容器埠寫反了' },
    { commands: ['docker run -d --name web -p 8080:80 nginx', 'docker stop web'], why: '容器停止之後就不再回應' },
  ],
  hints: ['-p 主機埠:容器埠', '-d 讓容器在背景執行'], explanation: 'docker run -d --name web -p 8080:80 nginx 在背景啟動容器；主機上的 docker-proxy 監聽 8080，把連線轉給容器的 80 埠。',
};
/** DKR03-like: clean up the exited container and remove an image no container uses. */
export const cleanupExercise: TerminalExercise = {
  id: 'cleanup', title: '清理', machine: 'dock-01',
  statement: '刪除已經停止的 old-web 容器，並刪除 ubuntu:24.04 這個 Image；正在執行的 worker 要留著。',
  checks: [{ kind: 'container', name: 'old-web', absent: true }, { kind: 'image', name: 'ubuntu:24.04', absent: true }, { kind: 'container', name: 'worker', state: 'running' }],
  solution: ['docker rm old-web', 'docker rmi ubuntu:24.04'],
  mistakes: [
    { commands: ['docker rmi ubuntu:24.04'], why: 'old-web 還在' },
    { commands: ['docker rm -f old-web worker', 'docker rmi ubuntu:24.04'], why: '把執行中的 worker 也刪掉了' },
  ],
  hints: ['docker ps -a 看所有容器'], explanation: 'docker rm 刪除停止的容器；docker rmi 刪除沒有容器使用的 Image。',
};

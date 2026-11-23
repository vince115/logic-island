import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import { CLUSTER_PROFILE } from '@/lib/terminal/shell';
import { session } from './environments-fixture';

/*
 * A synthetic machine for engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md), only for tests: kub-32, a workstation
 * (the cluster profile) with kubectl and the admin kubeconfig of the default three-node cluster (cp-01 tainted, node-01,
 * node-02; 2 CPUs and 3911796Ki each), created 30 days before 2026-11-24 10:00:00 UTC.
 * - Docker Hub: nginx:1.27 (a server, pulled in 3 s), busybox:1.36 (sh, sleep, echo…), team/crash:1.0 (exits 1 after 5 s),
 *   team/job:1.0 (prints "job done" and exits 0), team/hungry:1.0 (memory 50 MB + 20 MB/s), team/api:1.0 (needs DATABASE_URL).
 * - ~/k8s: web.yaml (a Pod), two.yaml (two Pods in one file), bad.yaml (a misspelt field), big.yaml (requests 3 CPUs),
 *   init.yaml (an init container before nginx), dev.yaml (a Namespace and a Pod in it).
 * - At boot (09:58): the Pod hello (busybox printing two lines and sleeping an hour) from hello.yaml.
 */
const dir = (path: string): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner: 'learner' });
const file = (path: string, content: string): TerminalFile => ({ path, kind: 'file', mode: 0o644, owner: 'learner', content });
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false'];
const yaml = (...lines: string[]) => [...lines, ''].join('\n');

export const WEB_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: web', '  labels:', '    app: web', 'spec:', '  containers:', '  - name: web', '    image: nginx:1.27', '    ports:', '    - containerPort: 80');
export const TWO_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: a', '  labels:', '    app: shop', 'spec:', '  containers:', '  - name: main', '    image: busybox:1.36', '    command: ["sh", "-c", "echo a; sleep 3600"]',
  '---', 'apiVersion: v1', 'kind: Pod', 'metadata:', '  name: b', '  labels:', '    app: shop', '    tier: back', 'spec:', '  containers:', '  - name: main', '    image: busybox:1.36', '    command: ["sleep", "3600"]');
export const BAD_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: typo', 'spec:', '  containers:', '  - name: web', '    imagee: nginx:1.27');
export const BIG_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: big', 'spec:', '  containers:', '  - name: big', '    image: nginx:1.27', '    resources:', '      requests:', '        cpu: "3"');
export const INIT_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: boot', 'spec:', '  initContainers:', '  - name: wait', '    image: busybox:1.36', '    command: ["sleep", "10"]',
  '  containers:', '  - name: web', '    image: nginx:1.27');
export const DEV_YAML = yaml('apiVersion: v1', 'kind: Namespace', 'metadata:', '  name: dev', '---', 'apiVersion: v1', 'kind: Pod', 'metadata:', '  name: tool', '  namespace: dev', 'spec:', '  containers:', '  - name: tool', '    image: busybox:1.36', '    args: ["sleep", "600"]');
const HELLO_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: hello', 'spec:', '  containers:', '  - name: hello', '    image: busybox:1.36', '    command: ["sh", "-c", "echo hello from the cluster; echo second line; sleep 3600"]');

export const KUBE_IMAGES: TerminalImage[] = [
  { name: 'nginx:1.27', size: 72_099_410, created: '2026-11-10 08:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], expose: [80], service: true, layers: 7, osRelease: DEBIAN,
    commands: [...BASIC], logs: ['/docker-entrypoint.sh: Configuration complete; ready for start up'], env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NGINX_VERSION=1.27.3'],
    files: [{ path: '/usr/share/nginx/html/index.html', content: '<h1>Welcome to nginx!</h1>\n' }] },
  { name: 'busybox:1.36', size: 4_270_000, created: '2026-10-01 00:00:00', cmd: ['sh'], layers: 1, osRelease: DEBIAN, commands: [...BASIC] },
  { name: 'team/crash:1.0', size: 50_000_000, created: '2026-11-20 10:00:00', cmd: ['./crash'], service: true, layers: 3, osRelease: DEBIAN, commands: [...BASIC], logs: ['starting'], exitAfter: { seconds: 5, exit: 1, logs: ['panic: config missing'] } },
  { name: 'team/job:1.0', size: 20_000_000, created: '2026-11-20 10:00:00', cmd: ['./job'], layers: 2, osRelease: DEBIAN, commands: [...BASIC], output: 'job done\n' },
  { name: 'team/hungry:1.0', size: 30_000_000, created: '2026-11-20 10:00:00', cmd: ['./hungry'], service: true, layers: 2, osRelease: DEBIAN, commands: [...BASIC], logs: ['allocating'], memory: { start: 50_000_000, growth: 20_000_000 } },
  { name: 'team/api:1.0', size: 60_000_000, created: '2026-11-20 10:00:00', cmd: ['./api'], service: true, layers: 3, osRelease: DEBIAN, commands: [...BASIC], logs: ['api listening on :8080'],
    needsEnv: ['DATABASE_URL'], missingEnv: { output: 'Error: DATABASE_URL is not set', exit: 1 } },
];

export const kubeLab: TerminalMachine = {
  id: 'kub-32', title: 'kub-32（Kubernetes 叢集的工作站）', user: 'learner', cwd: '/home/learner', host: 'kub-32', profile: 'cluster', now: '2026-11-24 10:00:00',
  files: [dir('/home'), dir('/home/learner'), dir('/home/learner/k8s'), file('/home/learner/k8s/web.yaml', WEB_YAML), file('/home/learner/k8s/two.yaml', TWO_YAML), file('/home/learner/k8s/bad.yaml', BAD_YAML),
    file('/home/learner/k8s/big.yaml', BIG_YAML), file('/home/learner/k8s/init.yaml', INIT_YAML), file('/home/learner/k8s/dev.yaml', DEV_YAML)],
  docker: { images: KUBE_IMAGES },
  kube: { images: [{ name: 'nginx:1.27', seconds: 3 }], manifests: [{ text: HELLO_YAML, at: '2026-11-24 09:58:00', file: 'hello.yaml' }] },
};

export const kube = (...commands: string[]) => session(kubeLab, CLUSTER_PROFILE, ...commands);
export const kubeOn = (m: TerminalMachine, ...commands: string[]) => session(m, CLUSTER_PROFILE, ...commands);

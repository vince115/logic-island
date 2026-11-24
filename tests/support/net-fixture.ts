import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import { KUBE_NET_PROFILE } from '@/lib/terminal/shell';
import { session } from './environments-fixture';
import { deployment, WORKLOAD_IMAGES, workloadsLab } from './workloads-fixture';

/*
 * A synthetic machine for engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md), only for tests: kub-35, the E34
 * machine (workloads-fixture.ts) on the kube-net profile, with two more images on Docker Hub (already on the workers):
 * - team/whoami:1.0 — answers HTTP on 8080 (responder whoami: / says "Hostname: <pod>" and "IP: <address>"; /health).
 * - team/toolbox:1.0 — a client: sh, sleep, curl, getent, nc, nslookup, wget; its main process sleeps.
 * ~/k8s has who.yaml (a Deployment of three whoami pods, container port 8080 named http), svc.yaml (a ClusterIP Service
 * who: port 80 → targetPort http), client.yaml (a toolbox pod) and np.yaml (a NodePort Service who-np: 80 → 8080, 30080).
 * The lesson pool for LoadBalancers is 10.0.0.200–10.0.0.201 (lbLab).
 */
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false'];
export const NET_IMAGES: TerminalImage[] = [...WORKLOAD_IMAGES,
  { name: 'team/whoami:1.0', size: 8_000_000, created: '2026-11-20 10:00:00', cmd: ['./whoami'], expose: [8080], service: true, layers: 2, osRelease: DEBIAN, commands: [...BASIC], logs: ['listening on :8080'], http: { port: 8080, responder: 'whoami' } },
  { name: 'team/toolbox:1.0', size: 9_000_000, created: '2026-11-20 10:00:00', cmd: ['sleep', '86400'], service: true, layers: 2, osRelease: DEBIAN, commands: [...BASIC, 'curl', 'getent', 'nc', 'nslookup', 'wget'] },
];
const y = (...lines: string[]) => [...lines, ''].join('\n');
export const WHO_YAML = deployment('who', 'team/whoami:1.0', 3, [], ['ports:', '- name: http', '  containerPort: 8080']);
export const SVC_YAML = y('apiVersion: v1', 'kind: Service', 'metadata:', '  name: who', '  labels:', '    app: who', 'spec:', '  selector:', '    app: who', '  ports:', '  - name: web', '    port: 80', '    targetPort: http');
export const NP_YAML = y('apiVersion: v1', 'kind: Service', 'metadata:', '  name: who-np', 'spec:', '  type: NodePort', '  selector:', '    app: who', '  ports:', '  - port: 80', '    targetPort: 8080', '    nodePort: 30080');
export const CLIENT_YAML = y('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: client', 'spec:', '  containers:', '  - name: client', '    image: team/toolbox:1.0');
const file = (n: string, content: string): TerminalFile => ({ path: `/home/learner/k8s/${n}`, kind: 'file', mode: 0o644, owner: 'learner', content });
export const netLab: TerminalMachine = {
  ...workloadsLab, id: 'kub-35', title: 'kub-35（Service 與叢集網路）', host: 'kub-35', profile: 'kube-net',
  responders: [...workloadsLab.responders ?? [], { id: 'whoami', server: 'whoami/1.0', routes: [{ path: '/', body: 'Hostname: {{hostname}}\nIP: {{ip}}\n', type: 'text/plain' }, { path: '/health', body: 'ok\n', type: 'text/plain' }] }],
  files: [...workloadsLab.files ?? [], file('who.yaml', WHO_YAML), file('svc.yaml', SVC_YAML), file('np.yaml', NP_YAML), file('client.yaml', CLIENT_YAML)],
  docker: { images: NET_IMAGES },
  kube: { ...workloadsLab.kube, images: [...workloadsLab.kube?.images ?? [], { name: 'team/whoami:1.0', nodes: ['node-01', 'node-02'] }, { name: 'team/toolbox:1.0', nodes: ['node-01', 'node-02'] }] },
};
export const lbLab: TerminalMachine = { ...netLab, kube: { ...netLab.kube, lbPool: ['10.0.0.200-10.0.0.201'] } };
/** The lab with these files in ~/k8s. */
export const withNetFiles = (m: TerminalMachine, files: Record<string, string>): TerminalMachine => ({ ...m, files: [...m.files ?? [], ...Object.entries(files).map(([n, c]) => file(n, c))] });
/** The usual start: the Deployment, the Service and the client pod, applied and running. */
export const UP = ['kubectl apply -f k8s/who.yaml -f k8s/svc.yaml -f k8s/client.yaml', 'sleep 5'];
export const net = (...commands: string[]) => session(netLab, KUBE_NET_PROFILE, ...commands);
export const netOn = (m: TerminalMachine, ...commands: string[]) => session(m, KUBE_NET_PROFILE, ...commands);

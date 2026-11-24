import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import { KUBE_CONFIG_PROFILE } from '@/lib/terminal/shell';
import { certPem, keyPem, skiOf, serialFrom, type Cert } from '@/lib/terminal/tls';
import { parseTime } from '@/lib/terminal/clock';
import { session } from './environments-fixture';
import { NET_IMAGES, netLab } from './net-fixture';

/*
 * A synthetic machine for engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md), only for tests: kub-36, the E35
 * machine (net-fixture.ts) on the kube-config profile, with six of its images and two more (on the workers unless private):
 * - team/app:1.0 — a service that needs DB_PASSWORD (else "Error: DB_PASSWORD is not set", exit 1); it has printenv.
 * - registry.example.com:5000/team/private:1.0 — a private registry's image (users ci-bot and other, fake lesson tokens).
 * ~/k8s: cm.yaml (ConfigMap app-config: LOG_LEVEL and config.yaml), secret.yaml (Secret db-secret with stringData),
 * env.yaml (pod env: envFrom app-config, DB_PASSWORD from the Secret), vol.yaml (pod vol: the ConfigMap at /etc/app, the
 * Secret at /etc/creds, config.yaml by subPath at /etc/sub/config.yaml), and web.crt / web.key / other.key (E13 PEM files).
 * Every secret value is an obviously fake lesson value.
 */
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false'];
export const PRIVATE = 'registry.example.com:5000/team/private:1.0';
export const CONFIG_IMAGES: TerminalImage[] = [...NET_IMAGES.filter(i => ['nginx:1.27', 'nginx:1.28', 'busybox:1.36', 'team/web:1.0', 'team/whoami:1.0', 'team/toolbox:1.0'].includes(i.name)),
  { name: 'team/app:1.0', size: 10_000_000, created: '2026-11-20 10:00:00', cmd: ['./app'], service: true, layers: 2, osRelease: DEBIAN, commands: [...BASIC, 'printenv'], logs: ['app ready'],
    needsEnv: ['DB_PASSWORD'], missingEnv: { output: 'Error: DB_PASSWORD is not set', exit: 1 } },
  { name: PRIVATE, size: 5_000_000, created: '2026-11-20 10:00:00', cmd: ['sleep', '86400'], service: true, layers: 1, osRelease: DEBIAN, commands: [...BASIC] },
];
const y = (...lines: string[]) => [...lines, ''].join('\n');
/** A pod named `name` (image, more container lines, more spec lines). */
export const pod = (name: string, image: string, container: string[] = [], spec: string[] = []) =>
  y('apiVersion: v1', 'kind: Pod', 'metadata:', `  name: ${name}`, 'spec:', '  containers:', `  - name: ${name}`, `    image: ${image}`, ...container.map(l => `    ${l}`), ...spec.map(l => `  ${l}`));
export const CM_YAML = y('apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: app-config', 'data:', '  LOG_LEVEL: debug', '  config.yaml: |', '    mode: lesson', '    replicas: 2');
export const SECRET_YAML = y('apiVersion: v1', 'kind: Secret', 'metadata:', '  name: db-secret', 'type: Opaque', 'stringData:', '  DB_PASSWORD: lesson-pass-123', '  DB_USER: demo');
export const ENV_YAML = pod('env', 'team/app:1.0', ['envFrom:', '- configMapRef:', '    name: app-config', 'env:', '- name: DB_PASSWORD', '  valueFrom:', '    secretKeyRef:', '      name: db-secret', '      key: DB_PASSWORD']);
export const VOL_YAML = pod('vol', 'busybox:1.36', ['command: ["sleep", "3600"]', 'volumeMounts:', '- name: config', '  mountPath: /etc/app', '- name: creds', '  mountPath: /etc/creds', '  readOnly: true',
  '- name: config', '  mountPath: /etc/sub/config.yaml', '  subPath: config.yaml'], ['volumes:', '- name: config', '  configMap:', '    name: app-config', '- name: creds', '  secret:', '    secretName: db-secret']);

const DN = [['CN', 'web.lesson.example']] as const;
const cert = (seed: string): Cert => ({ serial: serialFrom(seed), subject: DN, issuer: DN, notBefore: parseTime('2026-11-01 00:00:00')!, notAfter: parseTime('2027-11-01 00:00:00')!, key: 'ec256', ski: skiOf(seed), sans: ['web.lesson.example'], ca: false });
export const WEB_CRT = certPem(cert('lesson-web-key')), WEB_KEY = keyPem({ type: 'ec256', seed: 'lesson-web-key' }), OTHER_KEY = keyPem({ type: 'ec256', seed: 'lesson-other-key' });

const file = (n: string, content: string): TerminalFile => ({ path: `/home/learner/k8s/${n}`, kind: 'file', mode: 0o644, owner: 'learner', content });
export const configLab: TerminalMachine = {
  ...netLab, id: 'kub-36', title: 'kub-36（ConfigMap 與 Secret）', host: 'kub-36', profile: 'kube-config',
  files: [...netLab.files ?? [], file('cm.yaml', CM_YAML), file('secret.yaml', SECRET_YAML), file('env.yaml', ENV_YAML), file('vol.yaml', VOL_YAML),
    file('web.crt', WEB_CRT), file('web.key', WEB_KEY), file('other.key', OTHER_KEY)],
  docker: { images: CONFIG_IMAGES, registries: [{ host: 'registry.example.com:5000', users: [{ name: 'ci-bot', token: 'lesson-fake-token-1' }, { name: 'other', token: 'lesson-fake-token-2', repos: ['other/*'] }] }] },
  kube: { ...netLab.kube, images: [...netLab.kube?.images ?? [], { name: 'team/app:1.0', nodes: ['node-01', 'node-02'] }] },
};
/** The lab with these files in ~/k8s. */
export const withConfigFiles = (m: TerminalMachine, files: Record<string, string>): TerminalMachine => ({ ...m, files: [...m.files ?? [], ...Object.entries(files).map(([n, c]) => file(n, c))] });
/** ConfigMap and Secret applied. */
export const BOTH = 'kubectl apply -f k8s/cm.yaml -f k8s/secret.yaml';
export const cfg = (...commands: string[]) => session(configLab, KUBE_CONFIG_PROFILE, ...commands);
export const cfgOn = (m: TerminalMachine, ...commands: string[]) => session(m, KUBE_CONFIG_PROFILE, ...commands);

import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import { KUBE_STORAGE_PROFILE } from '@/lib/terminal/shell';
import { session } from './environments-fixture';
import { CONFIG_IMAGES } from './config-fixture';
import { ingressLab } from './ingress-fixture';

/*
 * A synthetic machine for engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md), only for tests: kub-38, the E37
 * machine (ingress-fixture.ts) on the kube-storage profile with two provisioners — local.example.com/local-path (node-local) and
 * disk.csi.example.com (attachable network disks) — and the StorageClass local-path (default, WaitForFirstConsumer) at
 * boot. Images: team/db:1.0 (sleeps; sh, tar…; pulled in 2 s, on no node yet) and team/pg:1.0 (its program writes
 * /var/lib/pg/data/PG_VERSION when it starts). ~/k8s has fast.yaml (class fast: disk.csi.example.com, Immediate,
 * expansion), keep.yaml (class keep: Retain), pvc.yaml (claim data: fast, 1Gi RWO), pv.yaml (static NFS volume pv-nfs:
 * 5Gi RWX Retain, no class) with claim.yaml (claim shared: "" class, 2Gi RWX), writer.yaml (pod writer: data at /data),
 * and sts.yaml (headless Service web and StatefulSet web: 3 replicas of team/db:1.0, claims data from the default class).
 */
const y = (...lines: string[]) => [...lines, ''].join('\n');
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false', 'tar', 'getent'];
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n';
export const STORAGE_IMAGES: TerminalImage[] = [...CONFIG_IMAGES,
  { name: 'team/db:1.0', size: 6_000_000, created: '2026-11-20 10:00:00', cmd: ['sleep', '86400'], service: true, layers: 1, osRelease: DEBIAN, commands: BASIC },
  { name: 'team/pg:1.0', size: 7_000_000, created: '2026-11-20 10:00:00', cmd: ['./pg'], service: true, layers: 1, osRelease: DEBIAN, commands: BASIC, logs: ['database ready'],
    writes: ['/var/lib/pg/data/PG_VERSION'], readOnlyError: { output: 'FATAL: could not write PG_VERSION: Read-only file system', exit: 1 } },
];
export const sc = (name: string, provisioner: string, more: string[] = [], annotations: string[] = []) =>
  y('apiVersion: storage.k8s.io/v1', 'kind: StorageClass', 'metadata:', `  name: ${name}`, ...annotations.length ? ['  annotations:', ...annotations.map(a => `    ${a}`)] : [], `provisioner: ${provisioner}`, ...more);
export const pvc = (name: string, cls: string | null, size = '1Gi', modes = ['ReadWriteOnce'], more: string[] = []) =>
  y('apiVersion: v1', 'kind: PersistentVolumeClaim', 'metadata:', `  name: ${name}`, 'spec:', '  accessModes:', ...modes.map(m => `  - ${m}`), ...cls === null ? [] : [`  storageClassName: "${cls}"`],
    '  resources:', '    requests:', `      storage: ${size}`, ...more.map(l => `  ${l}`));
/** A pod of team/db:1.0 mounting claims (volume name → claim, mount path) and more container lines. */
export const user = (name: string, mounts: [string, string, string][], container: string[] = [], image = 'team/db:1.0', spec: string[] = []) =>
  y('apiVersion: v1', 'kind: Pod', 'metadata:', `  name: ${name}`, 'spec:', ...spec.map(l => `  ${l}`), '  containers:', `  - name: ${name}`, `    image: ${image}`, ...container.map(l => `    ${l}`),
    '    volumeMounts:', ...mounts.flatMap(([v, , at]) => [`    - name: ${v}`, `      mountPath: ${at}`]), '  volumes:', ...mounts.flatMap(([v, c]) => [`  - name: ${v}`, '    persistentVolumeClaim:', `      claimName: ${c}`]));
export const LOCAL_SC = sc('local-path', 'local.example.com/local-path', ['reclaimPolicy: Delete', 'volumeBindingMode: WaitForFirstConsumer'], ['storageclass.kubernetes.io/is-default-class: "true"']);
export const PV_YAML = y('apiVersion: v1', 'kind: PersistentVolume', 'metadata:', '  name: pv-nfs', '  labels:', '    tier: shared', 'spec:', '  capacity:', '    storage: 5Gi', '  accessModes:', '  - ReadWriteMany',
  '  persistentVolumeReclaimPolicy: Retain', '  nfs:', '    server: 10.0.0.60', '    path: /exports/shared');
/** A StatefulSet (replicas, more spec lines; the claim template data of the default class, 1Gi RWO). */
export const sts = (replicas: number, more: string[] = [], image = 'team/db:1.0') => y('apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', 'spec:', '  clusterIP: None', '  selector:', '    app: web',
  '  ports:', '  - port: 80', '---', 'apiVersion: apps/v1', 'kind: StatefulSet', 'metadata:', '  name: web', 'spec:', '  serviceName: web', `  replicas: ${replicas}`, '  selector:', '    matchLabels:', '      app: web', ...more.map(l => `  ${l}`),
  '  template:', '    metadata:', '      labels:', '        app: web', '    spec:', '      containers:', '      - name: web', `        image: ${image}`, '        volumeMounts:', '        - name: data', '          mountPath: /data',
  '  volumeClaimTemplates:', '  - metadata:', '      name: data', '    spec:', '      accessModes: ["ReadWriteOnce"]', '      resources:', '        requests:', '          storage: 1Gi');
const file = (n: string, content: string): TerminalFile => ({ path: `/home/learner/k8s/${n}`, kind: 'file', mode: 0o644, owner: 'learner', content });
export const storageLab: TerminalMachine = {
  ...ingressLab, id: 'kub-38', title: 'kub-38（儲存與 StatefulSet）', host: 'kub-38', profile: 'kube-storage',
  files: [...ingressLab.files ?? [], file('fast.yaml', sc('fast', 'disk.csi.example.com', ['allowVolumeExpansion: true'])), file('keep.yaml', sc('keep', 'disk.csi.example.com', ['reclaimPolicy: Retain'])),
    file('pvc.yaml', pvc('data', 'fast')), file('pv.yaml', PV_YAML), file('claim.yaml', pvc('shared', '', '2Gi', ['ReadWriteMany'])), file('writer.yaml', user('writer', [['d', 'data', '/data']])), file('sts.yaml', sts(3))],
  docker: { ...ingressLab.docker, images: STORAGE_IMAGES },
  kube: { ...ingressLab.kube, images: [...ingressLab.kube?.images ?? [], { name: 'team/db:1.0', seconds: 2 }, { name: 'team/pg:1.0', nodes: ['node-01', 'node-02'] }],
    manifests: [...ingressLab.kube?.manifests ?? [], { text: LOCAL_SC, at: '2026-11-01 00:00:00', file: 'local-path.yaml' }],
    storage: { provisioners: [{ name: 'local.example.com/local-path', local: true }, { name: 'disk.csi.example.com' }] } },
};
/** The lab with these files in ~/k8s, or its kube data changed. */
export const withStorageFiles = (m: TerminalMachine, files: Record<string, string>): TerminalMachine => ({ ...m, files: [...m.files ?? [], ...Object.entries(files).map(([n, c]) => file(n, c))] });
export const withStorageKube = (m: TerminalMachine, kube: Partial<NonNullable<TerminalMachine['kube']>>): TerminalMachine => ({ ...m, kube: { ...m.kube, ...kube } });
export const sto = (...commands: string[]) => session(storageLab, KUBE_STORAGE_PROFILE, ...commands);
export const stoOn = (m: TerminalMachine, ...commands: string[]) => session(m, KUBE_STORAGE_PROFILE, ...commands);

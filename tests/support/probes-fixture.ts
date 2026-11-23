import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKubeHealth } from '@/lib/terminal/kube-health';
import { PROBES_PROFILE } from '@/lib/terminal/shell';
import { session } from './environments-fixture';
import { KUBE_IMAGES, kubeLab } from './kube-fixture';

/*
 * A synthetic machine for engine stage E33 (docs/curriculum/KUB0_E33_PROBES.md), only for tests: kub-33, the E32 machine
 * (kube-fixture.ts) on the probes profile, with three more images on Docker Hub:
 * - team/web:1.0 — answers HTTP on 8080 (responder web: /, /healthz, /ready), handles SIGTERM in 3 s ("shutting down").
 * - team/slow:1.0 — the same service, accepting connections only 20 s after its start (E23 ready).
 * - team/stubborn:1.0 — the same service, ignoring SIGTERM (killed at the end of the grace period).
 * The boot pod hello is the E32 one. ~/k8s has no probe manifests: tests add them with withFiles() and pod(); health() gives a kube.health list.
 */
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false'];
const service = (name: string, more: Partial<TerminalImage>): TerminalImage => ({ name, size: 40_000_000, created: '2026-11-20 10:00:00', cmd: ['./web'], expose: [8080], service: true, layers: 3, osRelease: DEBIAN,
  commands: [...BASIC], logs: ['listening on :8080'], http: { port: 8080, responder: 'web' }, ...more });
export const PROBE_IMAGES: TerminalImage[] = [
  ...KUBE_IMAGES,
  service('team/web:1.0', { signals: { TERM: { seconds: 3, logs: ['shutting down'], exit: 0 } } }),
  service('team/slow:1.0', { ready: 20, signals: { TERM: { seconds: 0, exit: 0 } } }),
  service('team/stubborn:1.0', { stopExit: 137 }),
];
export const probesLab: TerminalMachine = {
  ...kubeLab, id: 'kub-33', title: 'kub-33（探針與優雅終止）', host: 'kub-33', profile: 'probes',
  responders: [{ id: 'web', server: 'web/1.0', routes: [{ path: '/', body: 'hello\n', type: 'text/plain' }, { path: '/healthz', body: 'ok\n', type: 'text/plain' }, { path: '/ready', body: 'ready\n', type: 'text/plain' }] }],
  docker: { images: PROBE_IMAGES },
  kube: { ...kubeLab.kube, images: [{ name: 'nginx:1.27', seconds: 3 }, { name: 'team/web:1.0', nodes: ['node-01', 'node-02'] }, { name: 'team/slow:1.0', nodes: ['node-01', 'node-02'] }, { name: 'team/stubborn:1.0', nodes: ['node-01', 'node-02'] }] },
};
/** The lab with the lesson's kube.health. */
export const health = (list: TerminalKubeHealth[], m: TerminalMachine = probesLab): TerminalMachine => ({ ...m, kube: { ...m.kube, health: list } });
/** The lab with these files in ~/k8s. */
export const withFiles = (m: TerminalMachine, files: Record<string, string>): TerminalMachine =>
  ({ ...m, files: [...m.files ?? [], ...Object.entries(files).map(([n, content]): TerminalFile => ({ path: `/home/learner/k8s/${n}`, kind: 'file', mode: 0o644, owner: 'learner', content }))] });

/** A one-container pod manifest (name, image) with extra container lines and pod spec lines (YAML, indented for their place). */
export function pod(name: string, image: string, container: string[] = [], spec: string[] = []): string {
  return ['apiVersion: v1', 'kind: Pod', 'metadata:', `  name: ${name}`, '  labels:', `    app: ${name}`, 'spec:', ...spec.map(l => `  ${l}`), '  containers:', `  - name: ${name}`, `    image: ${image}`,
    ...container.map(l => `    ${l}`), ''].join('\n');
}
export const probes = (...commands: string[]) => session(probesLab, PROBES_PROFILE, ...commands);
export const probesOn = (m: TerminalMachine, ...commands: string[]) => session(m, PROBES_PROFILE, ...commands);

import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import { WORKLOADS_PROFILE } from '@/lib/terminal/shell';
import { session } from './environments-fixture';
import { KUBE_IMAGES } from './kube-fixture';
import { PROBE_IMAGES, probesLab } from './probes-fixture';

/*
 * A synthetic machine for engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md), only for tests: kub-34, the E33
 * machine (probes-fixture.ts) on the workloads profile, with nginx:1.28 on Docker Hub as well (pulled in 2 s; nginx:1.27
 * in 3 s, team/web:1.0 already on the workers). The boot pod hello is the E32 one (no controller). ~/k8s has web.yaml, a
 * Deployment of three nginx:1.27 pods (app=web); tests add others with withFiles() and deployment().
 */
const nginx = KUBE_IMAGES[0];
export const WORKLOAD_IMAGES = [...PROBE_IMAGES, { ...nginx, name: 'nginx:1.28', created: '2026-11-20 08:00:00' }];

/** A Deployment manifest: name, image, replicas, extra lines under spec (indented for spec) and under the container. */
export function deployment(name: string, image: string, replicas = 3, spec: string[] = [], container: string[] = [], kind = 'Deployment'): string {
  return ['apiVersion: apps/v1', `kind: ${kind}`, 'metadata:', `  name: ${name}`, 'spec:', `  replicas: ${replicas}`, '  selector:', '    matchLabels:', `      app: ${name}`, ...spec.map(l => `  ${l}`),
    '  template:', '    metadata:', '      labels:', `        app: ${name}`, '    spec:', '      containers:', `      - name: ${name}`, `        image: ${image}`, ...container.map(l => `        ${l}`), ''].join('\n');
}
export const workloadsLab: TerminalMachine = {
  ...probesLab, id: 'kub-34', title: 'kub-34（Deployment 與滾動更新）', host: 'kub-34', profile: 'workloads',
  files: [...probesLab.files ?? [], { path: '/home/learner/k8s/deploy.yaml', kind: 'file', mode: 0o644, owner: 'learner', content: deployment('web', 'nginx:1.27') }],
  docker: { images: WORKLOAD_IMAGES },
  kube: { ...probesLab.kube, images: [{ name: 'nginx:1.27', seconds: 3 }, { name: 'nginx:1.28', seconds: 2 }, { name: 'team/web:1.0', nodes: ['node-01', 'node-02'] }] },
};
/** The lab with these files in ~/k8s. */
export const withFiles = (m: TerminalMachine, files: Record<string, string>): TerminalMachine =>
  ({ ...m, files: [...m.files ?? [], ...Object.entries(files).map(([n, content]): TerminalFile => ({ path: `/home/learner/k8s/${n}`, kind: 'file', mode: 0o644, owner: 'learner', content }))] });
export const work = (...commands: string[]) => session(workloadsLab, WORKLOADS_PROFILE, ...commands);
export const workOn = (m: TerminalMachine, ...commands: string[]) => session(m, WORKLOADS_PROFILE, ...commands);

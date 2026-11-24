import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalKubeLoad } from '@/lib/terminal/kube-metrics-lesson';
import { AUTOSCALING_PROFILE } from '@/lib/terminal/shell';
import { session } from './environments-fixture';
import { WORKLOAD_IMAGES, workloadsLab } from './workloads-fixture';

/*
 * A synthetic machine for engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md), only for tests: kub-40, the E34
 * images (team/web:1.0 answers HTTP on 8080 and is already on the workers; team/hungry:1.0 grows 20 MB/s from 50 MB) plus
 * team/busy:1.0 (a service using 25% of a CPU) on the autoscaling profile, with metrics-server. At boot (09:50) the
 * Deployment web (2 pods of team/web:1.0, requests cpu 100m and memory 64Mi) and its Service web (80 → 8080). Tests add a
 * load (withLoad) and manifests in ~/k8s (withFiles); hpa() writes an autoscaling/v2 HPA for web.
 */
const y = (...lines: string[]) => `${lines.join('\n')}\n`;
const busy = { ...WORKLOAD_IMAGES.find(i => i.name === 'team/web:1.0')!, name: 'team/busy:1.0', cpu: 25 };
/** A Deployment of team/web:1.0 (app=NAME, port 8080) with these lines under resources (none: no resources). */
export function web(name = 'web', replicas = 2, resources: string[] | null = ['requests:', '  cpu: 100m', '  memory: 64Mi'], image = 'team/web:1.0'): string {
  return y('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: ${name}`, 'spec:', `  replicas: ${replicas}`, '  selector:', '    matchLabels:', `      app: ${name}`, '  template:', '    metadata:', '      labels:',
    `        app: ${name}`, '    spec:', '      containers:', `      - name: ${name}`, `        image: ${image}`, '        ports:', '        - containerPort: 8080', ...resources ? ['        resources:', ...resources.map(l => `          ${l}`)] : []);
}
export const SERVICE = y('apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', 'spec:', '  selector:', '    app: web', '  ports:', '  - port: 80', '    targetPort: 8080');
/** An autoscaling/v2 HPA of the Deployment web: min, max, cpu utilization target, and lines under spec (behavior…). */
export function hpa(min = 2, max = 10, cpu: number | null = 50, more: string[] = [], name = 'web'): string {
  return y('apiVersion: autoscaling/v2', 'kind: HorizontalPodAutoscaler', 'metadata:', `  name: ${name}`, 'spec:', '  scaleTargetRef:', '    apiVersion: apps/v1', '    kind: Deployment', `    name: ${name}`,
    `  minReplicas: ${min}`, `  maxReplicas: ${max}`, ...cpu === null ? [] : ['  metrics:', '  - type: Resource', '    resource:', '      name: cpu', '      target:', '        type: Utilization', `        averageUtilization: ${cpu}`],
    ...more.map(l => `  ${l}`));
}
export const scaleLab: TerminalMachine = {
  ...workloadsLab, id: 'kub-40', title: 'kub-40（資源與自動擴展）', host: 'kub-40', profile: 'autoscaling',
  docker: { images: [...WORKLOAD_IMAGES, busy] },
  kube: { images: [{ name: 'nginx:1.27', seconds: 3 }, { name: 'team/web:1.0', nodes: ['node-01', 'node-02'] }, { name: 'team/busy:1.0', nodes: ['node-01', 'node-02'] }],
    manifests: [{ text: `${web()}---\n${SERVICE}`, at: '2026-11-24 09:50:00', file: 'web.yaml' }], metricsServer: true },
};
/** The lab with a load on the Service web from 10:00 (requests per second per minute; 1m of CPU per request per second). */
export const withLoad = (rps: TerminalKubeLoad['rps'], more: Partial<TerminalKubeLoad> = {}, m: TerminalMachine = scaleLab): TerminalMachine =>
  ({ ...m, kube: { ...m.kube, load: [{ service: 'web', start: '2026-11-24 10:00:00', minutes: Array.isArray(rps) ? rps.length : 60, rps, cpuPerRequest: '1m', ...more }] } });
/** The lab with these files in ~/k8s. */
export const withFiles = (m: TerminalMachine, files: Record<string, string>): TerminalMachine =>
  ({ ...m, files: [...m.files ?? [], ...Object.entries(files).map(([n, content]): TerminalFile => ({ path: `/home/learner/k8s/${n}`, kind: 'file', mode: 0o644, owner: 'learner', content }))] });
export const as = (...commands: string[]) => session(scaleLab, AUTOSCALING_PROFILE, ...commands);
export const asOn = (m: TerminalMachine, ...commands: string[]) => session(m, AUTOSCALING_PROFILE, ...commands);

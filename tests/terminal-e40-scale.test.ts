import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, describeCheck, terminalContentProblems, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { as, asOn, hpa, scaleLab, withFiles, withLoad } from './support/autoscale-fixture';
import { helmLab } from './support/helm-fixture';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §4, §6, §9): kubectl autoscale (v1 written, v2 read), the
 * HPA's defaults and validation in manifests, get all, delete, the check kube-hpa, and an hour of HPA syncs staying fast.
 */
const cells = (line: string) => line.trim().split(/\s{2,}/);

describe('kubectl autoscale and HPA manifests', () => {
  it('creates an HPA (v1 on the wire, read as v2 with the defaults)', () => {
    const s = as('kubectl autoscale deploy web --min=2 --max=6 --cpu-percent=60', 'kubectl autoscale deployment/web --max=4 --name=other', 'kubectl get hpa', 'kubectl get hpa other -o yaml',
      'kubectl autoscale deploy web --max=3', 'kubectl get all --no-headers', 'kubectl delete hpa other', 'kubectl autoscale deploy web --max=3 --min=2 --cpu-percent=70 --name=x --dry-run=client -o yaml');
    expect(s.log[0].out).toEqual(['horizontalpodautoscaler.autoscaling/web autoscaled']);
    expect(s.log[2].out.slice(1).map(l => cells(l).slice(0, 6))).toEqual([['other', 'Deployment/web', 'cpu: 1%/80%', '1', '4', '2'], ['web', 'Deployment/web', 'cpu: 1%/60%', '2', '6', '2']]);
    expect(s.log[3].out.slice(0, 2)).toEqual(['apiVersion: autoscaling/v2', 'kind: HorizontalPodAutoscaler']);
    expect(s.log[3].out).toEqual(expect.arrayContaining(['  maxReplicas: 4', '  metrics:', '  - resource:', '      name: cpu', '      target:', '        averageUtilization: 80', '        type: Utilization', '    type: Resource', '  minReplicas: 1']));
    expect(s.log[3].out.some(l => l.includes('behavior'))).toBe(false);
    expect(s.log[4].err).toEqual(['Error from server (AlreadyExists): horizontalpodautoscalers.autoscaling "web" already exists']);
    expect(s.log[5].out.filter(l => l.startsWith('horizontalpodautoscaler')).map(l => cells(l)[0])).toEqual(['horizontalpodautoscaler.autoscaling/other', 'horizontalpodautoscaler.autoscaling/web']);
    expect(s.log[6].out).toEqual(['horizontalpodautoscaler.autoscaling "other" deleted']);
    expect(s.log[7].out).toEqual(['apiVersion: autoscaling/v1', 'kind: HorizontalPodAutoscaler', 'metadata:', '  creationTimestamp: null', '  name: x', 'spec:', '  maxReplicas: 3', '  minReplicas: 2',
      '  scaleTargetRef:', '    apiVersion: apps/v1', '    kind: Deployment', '    name: web', '  targetCPUUtilizationPercentage: 70', 'status:', '  currentReplicas: 0', '  desiredReplicas: 0']);
  });
  it('says what is wrong with the command', () => {
    const s = as('kubectl autoscale deploy web', 'kubectl autoscale deploy web --min=5 --max=3', 'kubectl autoscale deploy web --max=lots', 'kubectl autoscale deploy nope --max=3', 'kubectl autoscale pod/x --max=3',
      'kubectl run x --image=nginx:1.27', 'kubectl autoscale pod/x --max=3', 'kubectl autoscale --max=3', 'kubectl autoscale deploy web --max=3 --min=0');
    expect(s.log.map(l => l.err[0])).toEqual(['error: --max=MAXPODS is required and must be at least 1, max: -1', 'error: --max=MAXPODS must be larger or equal to --min=MINPODS, max: 3, min: 5',
      'error: invalid argument "lots" for "--max" flag: strconv.ParseInt: parsing "lots": invalid syntax', 'Error from server (NotFound): deployments.apps "nope" not found', 'Error from server (NotFound): pods "x" not found',
      undefined, 'error: cannot autoscale a Pod: cannot autoscale a Pod', 'error: You must provide one or more resources by argument or filename.',
      'The HorizontalPodAutoscaler "web" is invalid: spec.minReplicas: Invalid value: 0: must be greater than or equal to 1']);
  });
  it('decodes and validates HPA manifests strictly; other metric types and autoscaling/v1 are prose', () => {
    const v1 = 'apiVersion: autoscaling/v1\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: web\nspec:\n  scaleTargetRef:\n    kind: Deployment\n    name: web\n  maxReplicas: 3\n  targetCPUUtilizationPercentage: 50\n';
    const m = withFiles(scaleLab, { 'v1.yaml': v1, 'typo.yaml': hpa(2, 10, 50, ['minReplica: 2']), 'bad.yaml': hpa(5, 3, 0, ['behavior:', '  scaleUp:', '    selectPolicy: Fast', '    policies:', '    - type: Pods', '      value: 0', '      periodSeconds: 2000']),
      'pods.yaml': hpa(2, 10, null, ['metrics:', '- type: Pods', '  pods:', '    metric:', '      name: rps']), 'gpu.yaml': hpa(2, 10, null, ['metrics:', '- type: Resource', '  resource:', '    name: nvidia.com/gpu', '    target:', '      type: Utilization', '      averageUtilization: 50']),
      'ok.yaml': hpa(2, 10, 50, ['behavior:', '  scaleDown:', '    stabilizationWindowSeconds: 60']), 'ok2.yaml': hpa(2, 8, 50, ['behavior:', '  scaleDown:', '    stabilizationWindowSeconds: 60']) });
    const s = asOn(m, 'kubectl apply -f k8s/v1.yaml', 'kubectl apply -f k8s/typo.yaml', 'kubectl apply -f k8s/bad.yaml', 'kubectl apply -f k8s/pods.yaml', 'kubectl apply -f k8s/gpu.yaml',
      'kubectl apply -f k8s/ok.yaml', 'kubectl apply -f k8s/ok.yaml', 'kubectl apply -f k8s/ok2.yaml', 'kubectl get hpa web -o custom-columns=GEN:.metadata.generation,MAX:.spec.maxReplicas,UP:.spec.behavior.scaleUp.selectPolicy');
    expect(s.log[0].err).toEqual(['（模擬環境：manifest 只模擬 autoscaling/v2 的 HorizontalPodAutoscaler；請把 targetCPUUtilizationPercentage 寫成 v2 的 metrics）']);
    expect(s.log[1].err[0]).toBe('Error from server (BadRequest): error when creating "k8s/typo.yaml": HorizontalPodAutoscaler in version "v1" cannot be handled as a HorizontalPodAutoscaler: strict decoding error: unknown field "spec.minReplica"');
    expect(s.log[2].err.join('\n').split('\n')).toEqual(['The HorizontalPodAutoscaler "web" is invalid: ', '* spec.maxReplicas: Invalid value: 3: must be greater than or equal to `minReplicas`',
      '* spec.metrics[0].resource.target.averageUtilization: Invalid value: 0: must be greater than 0', '* spec.behavior.scaleUp.selectPolicy: Unsupported value: "Fast": supported values: "Disabled", "Max", "Min"',
      '* spec.behavior.scaleUp.policies[0].value: Invalid value: 0: must be greater than zero', '* spec.behavior.scaleUp.policies[0].periodSeconds: Invalid value: 2000: must be less than or equal to 1800']);
    expect(s.log[3].err).toEqual(['（模擬環境：spec.metrics[0] 的 Pods 指標只在課文說明；模擬環境的 HPA 只讀 metrics-server 的 cpu 與 memory）']);
    expect(s.log[4].err).toEqual(['（模擬環境：spec.metrics[0].resource.name 只模擬 cpu 與 memory）']);
    expect(s.log.slice(5, 8).map(l => l.out[0])).toEqual(['horizontalpodautoscaler.autoscaling/web created', 'horizontalpodautoscaler.autoscaling/web unchanged', 'horizontalpodautoscaler.autoscaling/web configured']);
    expect(cells(s.log[8].out[1])).toEqual(['2', '8', 'Max']);
  });
});

describe('an HPA at boot', () => {
  it('syncs from its manifest\'s time, and its events name it', () => {
    const m = withLoad([300, 300, 300, 300], { start: '2026-11-24 09:58:00' }, { ...scaleLab, kube: { ...scaleLab.kube, manifests: [...scaleLab.kube!.manifests!, { text: hpa(), at: '2026-11-24 09:58:00', file: 'hpa.yaml' }] } });
    const s = asOn(m, 'kubectl get hpa web --no-headers', 'kubectl events --for hpa/web');
    expect(cells(s.log[0].out[0]).slice(1, 7)).toEqual(['Deployment/web', 'cpu: 44%/50%', '2', '10', '7', '2m']);
    expect(s.log[1].out.slice(1).map(l => cells(l).slice(1))).toEqual([['Normal', 'SuccessfulRescale', 'HorizontalPodAutoscaler/web', 'New size: 4; reason: cpu resource utilization (percentage of request) above target'],
      ['Normal', 'SuccessfulRescale', 'HorizontalPodAutoscaler/web', 'New size: 7; reason: cpu resource utilization (percentage of request) above target']]);
  });
});

describe('the check kube-hpa', () => {
  const lab = withFiles(withLoad([300, 300]), { 'hpa.yaml': hpa() });
  const ex = (checks: TerminalCheck[], solution: string[], m: TerminalMachine = lab) => ({ id: 'x', title: 'x', machine: m.id, statement: 'x', checks, solution, mistakes: [{ commands: ['true'], why: 'x' }], hints: [], explanation: 'x' });
  const run = (checks: TerminalCheck[], solution: string[]) => checkTerminalExercise(ex(checks, solution), [lab], solution).results.map(r => r.ok ? 'ok' : r.message.split('，但')[1]);
  const check: TerminalCheck = { kind: 'kube-hpa', name: 'web', target: 'Deployment/web', minReplicas: 2, maxReplicas: 10, metric: { resource: 'cpu', utilization: 50 }, currentReplicas: 7, desiredReplicas: 7,
    condition: { type: 'ScalingActive', status: 'True', reason: 'ValidMetricFound' }, scaledAtLeast: 7, scaledAtMost: 8 };
  it('reads the HPA, its status and the extremes it scaled to, and says what differs', () => {
    expect(run([check], ['kubectl apply -f k8s/hpa.yaml', 'sleep 60'])).toEqual(['ok']);
    expect(run([check], ['kubectl apply -f k8s/hpa.yaml'])).toEqual(['它目前有 2 個副本']);
    expect(run([{ kind: 'kube-hpa', name: 'web', scaledAtLeast: 8 }, { kind: 'kube-hpa', name: 'web', scaledAtMost: 5 }], ['kubectl apply -f k8s/hpa.yaml', 'sleep 60'])).toEqual(['它最多只擴展到 7 個副本', '它曾經擴展到 7 個副本']);
    expect(run([{ kind: 'kube-hpa', name: 'web', metric: { resource: 'cpu', utilization: 70 } }, { kind: 'kube-hpa', name: 'web', scaledAtLeast: 1 }], ['kubectl autoscale deploy web --min=2 --max=3 --cpu-percent=500'])).toEqual(['它的 cpu 目標使用率是 500%', '它沒有改變過副本數']);
    expect(run([{ kind: 'kube-hpa', name: 'web', absent: true }, { kind: 'kube-hpa', name: 'api' }], ['kubectl apply -f k8s/hpa.yaml'])).toEqual(['仍然有名為 web 的 HorizontalPodAutoscaler', '沒有名為 api 的 HorizontalPodAutoscaler']);
    expect(describeCheck(check)).toBe('default 命名空間應該有名為 web 的 HorizontalPodAutoscaler（目標 Deployment/web、minReplicas 2、maxReplicas 10、cpu 的目標使用率 50%、目前 7 個副本、期望 7 個副本、條件 ScalingActive=True（ValidMetricFound）、曾經擴展到至少 7 個副本、擴展時不曾超過 8 個副本）');
  });
  it('keeps kube-workload and kube-pod working on what the HPA scaled', () => {
    expect(run([{ kind: 'kube-workload', name: 'web', replicas: 7, readyReplicas: 7 }, { kind: 'kube-pod', selector: 'app=web', count: 7, status: 'Running' }], ['kubectl apply -f k8s/hpa.yaml', 'sleep 60'])).toEqual(['ok', 'ok']);
  });
  it('checks the checks', () => {
    const problems = (c: TerminalCheck, m: TerminalMachine = lab) => terminalContentProblems({ machines: [m], examples: [], exercises: [ex([c], ['kubectl apply -f k8s/hpa.yaml'], m)] });
    expect(problems({ kind: 'kube-hpa', name: 'web', absent: true, minReplicas: 2 })).toContain('exercise x: a kube-hpa check with absent checks nothing else');
    expect(problems({ kind: 'kube-hpa', name: 'web', target: 'web' })).toContain('exercise x: a kube-hpa check\'s target is Kind/name (Deployment, ReplicaSet or StatefulSet)');
    expect(problems({ kind: 'kube-hpa', name: 'web', metric: { resource: 'cpu', utilization: 50, averageValue: '1' } })).toContain('exercise x: a kube-hpa check\'s metric is { resource: cpu | memory, utilization | averageValue }');
    expect(problems({ kind: 'kube-hpa', name: 'web', condition: { type: 'Ready', status: 'True' } })[0]).toMatch(/condition is \{ type: AbleToScale \| ScalingActive \| ScalingLimited/);
    expect(problems({ kind: 'kube-hpa', name: 'web', maxReplicas: -1 })).toContain('exercise x: a kube-hpa check\'s replica counts are whole numbers 0..1000');
    expect(problems({ kind: 'kube-hpa', name: 'web' }, helmLab)).toContain('exercise x: a kube-hpa check needs an autoscaling machine (engine stage E40)');
  });
});

describe('long runs', () => {
  it('plays an hour of HPA syncs under a changing load quickly and deterministically', () => {
    const shape = { seed: 40, baseline: 60, noise: 20, changes: [{ kind: 'ramp' as const, from: 5, to: 20, delta: 500 }, { kind: 'step' as const, at: 40, delta: -500 }] };
    const m = withFiles(withLoad(shape, { minutes: 60 }), { 'hpa.yaml': hpa(2, 10) });
    const t0 = Date.now(), a = asOn(m, 'kubectl apply -f k8s/hpa.yaml', 'sleep 3600', 'kubectl get hpa web --no-headers', 'kubectl describe hpa web');
    expect(Date.now() - t0).toBeLessThan(3000);
    const b = asOn(m, 'kubectl apply -f k8s/hpa.yaml', 'sleep 3600', 'kubectl get hpa web --no-headers', 'kubectl describe hpa web');
    expect(a.log.map(l => l.out)).toEqual(b.log.map(l => l.out));
    expect(cells(a.log[2].out[0]).slice(2, 6)).toEqual(['cpu: 1%/50%', '2', '10', '2']);
    expect(a.log[3].out.filter(l => l.includes('SuccessfulRescale')).length).toBeGreaterThan(3);
  });
});

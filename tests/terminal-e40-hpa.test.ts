import { describe, expect, it } from 'vitest';
import { asOn, hpa, scaleLab, web, withFiles, withLoad } from './support/autoscale-fixture';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §5): the HPA controller — a sync when the HPA is created and
 * every 15 s; desired = ⌈ready pods × utilization ÷ target⌉ outside the 0.1 tolerance; min..max; the default scale-up
 * limit max(2 × current, 4); the 300 s scale-down stabilization; spec.behavior's windows and policies; pods without
 * metrics, unready and Pending pods; missing requests, no metrics-server and a missing target as the controller's events.
 */
const cells = (line: string) => line.trim().split(/\s{2,}/);
/** The Deployment web's spec.replicas after each command (the HPA's REPLICAS column is its status). */
const replicas = (s: ReturnType<typeof asOn>, at: number[]) => at.map(i => cells(s.log[i].out[1] ?? s.log[i].out[0])[3]);
const rescales = (lines: string[]) => lines.filter(l => l.includes('SuccessfulRescale')).map(l => l.replace(/^.*horizontal-pod-autoscaler\s+/, ''));

describe('the replica count', () => {
  it('stays within the tolerance and scales by ⌈ready pods × ratio⌉ outside it', () => {
    const m = withFiles(withLoad([100, 112]), { 'hpa.yaml': hpa() });
    const s = asOn(m, 'kubectl apply -f k8s/hpa.yaml', 'kubectl get hpa web', 'sleep 59', 'kubectl get hpa web', 'sleep 1', 'kubectl get hpa web', 'kubectl describe hpa web');
    expect(cells(s.log[1].out[1])).toEqual(['web', 'Deployment/web', 'cpu: 51%/50%', '2', '10', '2', '0s']);
    expect(cells(s.log[3].out[1])[2]).toBe('cpu: 51%/50%');
    expect(cells(s.log[5].out[1]).slice(2, 6)).toEqual(['cpu: 57%/50%', '2', '10', '2']);
    expect(rescales(s.log[6].out)).toEqual(['New size: 3; reason: cpu resource utilization (percentage of request) above target']);
    expect(s.log[6].out).toContain('Deployment pods:                                       2 current / 3 desired');
  });
  it('limits a scale-up to max(2 × current, 4) per sync and clamps at maxReplicas', () => {
    const m = withFiles(withLoad([1000, 1000]), { 'hpa.yaml': hpa() });
    const s = asOn(m, 'kubectl apply -f k8s/hpa.yaml', 'kubectl get deploy web', 'sleep 15', 'kubectl get deploy web', 'sleep 15', 'kubectl get deploy web', 'sleep 15', 'kubectl describe hpa web', 'kubectl get hpa web -o yaml');
    expect([1, 3, 5].map(i => cells(s.log[i].out[1])[0] && cells(s.log[i].out[1])[1].split('/')[1])).toEqual(['4', '8', '10']);
    expect(rescales(s.log[7].out)).toEqual(['New size: 4; reason: cpu resource utilization (percentage of request) above target', 'New size: 8; reason: cpu resource utilization (percentage of request) above target',
      'New size: 10; reason: cpu resource utilization (percentage of request) above target']);
    expect(s.log[7].out).toContain('  ScalingLimited  True    TooManyReplicas   the desired replica count is more than the maximum replica count');
    expect(s.log[8].out).toEqual(expect.arrayContaining(['  - lastTransitionTime: "2026-11-24T10:00:00Z"', '    reason: TooManyReplicas', '  currentReplicas: 10', '  desiredReplicas: 10', '  lastScaleTime: "2026-11-24T10:00:30Z"']));
  });
  it('holds a scale-down for the 300-second stabilization window, then goes to minReplicas', () => {
    const m = withFiles(withLoad([300, 300]), { 'hpa.yaml': hpa() });
    const s = asOn(m, 'kubectl apply -f k8s/hpa.yaml', 'sleep 419', 'kubectl get deploy web', 'sleep 1', 'kubectl get deploy web', 'kubectl describe hpa web');
    expect(replicas({ log: [s.log[2], s.log[4]] } as never, [0, 1])).toEqual(['7', '2']);
    expect(rescales(s.log[5].out)).toEqual(['New size: 4; reason: cpu resource utilization (percentage of request) above target', 'New size: 7; reason: cpu resource utilization (percentage of request) above target',
      'New size: 2; reason: All metrics below target']);
    expect(s.log[5].out).toContain('  ScalingLimited  True    TooFewReplicas    the desired replica count is less than the minimum replica count');
  });
  it('flaps with a load that comes and goes when behavior drops the window, and stays calm by default', () => {
    const load = [300, 20, 300, 20, 300, 20];
    const sample = ['sleep 90', 'kubectl get deploy web --no-headers', 'sleep 60', 'kubectl get deploy web --no-headers', 'sleep 60', 'kubectl get deploy web --no-headers', 'sleep 60', 'kubectl get deploy web --no-headers'];
    const count = (behavior: string[]) => {
      const s = asOn(withFiles(withLoad(load), { 'hpa.yaml': hpa(2, 10, 50, behavior) }), 'kubectl apply -f k8s/hpa.yaml', ...sample);
      return [2, 4, 6, 8].map(i => cells(s.log[i].out[0])[1].split('/')[1]);
    };
    expect(count([])).toEqual(['7', '7', '7', '7']);
    expect(count(['behavior:', '  scaleDown:', '    stabilizationWindowSeconds: 0'])).toEqual(['2', '6', '2', '6']);
  });
  it('applies behavior policies: scale-up at most one pod a minute, scale-down disabled', () => {
    const m = withFiles(withLoad([1000, 1000, 0, 0]), { 'hpa.yaml': hpa(2, 10, 50, ['behavior:', '  scaleUp:', '    policies:', '    - type: Pods', '      value: 1', '      periodSeconds: 60', '  scaleDown:', '    selectPolicy: Disabled']) });
    const s = asOn(m, 'kubectl apply -f k8s/hpa.yaml', 'sleep 59', 'kubectl get deploy web --no-headers', 'sleep 1', 'kubectl get deploy web --no-headers', 'sleep 600', 'kubectl get deploy web --no-headers', 'kubectl describe hpa web', 'kubectl get hpa web -o yaml');
    expect([2, 4, 6].map(i => cells(s.log[i].out[0])[1].split('/')[1])).toEqual(['3', '4', '4']);
    expect(s.log[7].out).toEqual(expect.arrayContaining(['Behavior:', '  Scale Up:', '    Stabilization Window: 0 seconds', '    Select Policy: Max', '    Policies:', '      - Type=Pods  Value=1  Period=60 seconds',
      '  Scale Down:', '    Select Policy: Disabled', '      - Type=Percent  Value=100  Period=15 seconds']));
    expect(s.log[8].out).toEqual(expect.arrayContaining(['  behavior:', '    scaleDown:', '      policies:', '      - periodSeconds: 15', '        type: Percent', '        value: 100', '      selectPolicy: Disabled']));
  });
  it('brings the count into min..max first', () => {
    const m = withFiles(withLoad([100, 100]), { 'hpa.yaml': hpa(3, 5) });
    const s = asOn(m, 'kubectl apply -f k8s/hpa.yaml', 'sleep 15', 'kubectl scale deploy web --replicas=9', 'sleep 15', 'kubectl describe hpa web');
    expect(rescales(s.log[4].out)).toEqual(['New size: 3; reason: Current number of replicas below Spec.MinReplicas', 'New size: 5; reason: Current number of replicas above Spec.MaxReplicas']);
  });
});

describe('pods the calculation sets aside, and failures', () => {
  it('keeps scaling with Pending pods on a full cluster (node autoscaling is prose)', () => {
    const m = withFiles(withLoad([3000, 3000, 3000]), { 'big.yaml': web('web', 2, ['requests:', '  cpu: 500m']), 'hpa.yaml': hpa(2, 12) });
    const s = asOn(m, 'kubectl apply -f k8s/big.yaml', 'sleep 30', 'kubectl apply -f k8s/hpa.yaml', 'sleep 120', 'kubectl get hpa web --no-headers', 'kubectl get pods -l app=web --field-selector status.phase=Pending --no-headers');
    expect(cells(s.log[4].out[0]).slice(3, 6)).toEqual(['2', '12', '12']);
    expect(s.log[5].out).toHaveLength(5);
  });
  it('reports a target without CPU requests, no metrics-server, and a missing target', () => {
    const m = withFiles(scaleLab, { 'nr.yaml': web('nr', 2, null), 'nrh.yaml': hpa(1, 5, 50, [], 'nr'), 'ghost.yaml': hpa(1, 5, 50, [], 'ghost') });
    const s = asOn(m, 'kubectl apply -f k8s/nr.yaml', 'sleep 40', 'kubectl apply -f k8s/nrh.yaml -f k8s/ghost.yaml', 'kubectl get hpa', 'kubectl describe hpa nr', 'kubectl describe hpa ghost');
    expect(s.log[3].out.map(l => cells(l).slice(0, 3))).toEqual([['NAME', 'REFERENCE', 'TARGETS'], ['ghost', 'Deployment/ghost', 'cpu: <unknown>/50%'], ['nr', 'Deployment/nr', 'cpu: <unknown>/50%']]);
    expect(s.log[4].out).toEqual(expect.arrayContaining([expect.stringMatching(/^ {2}ScalingActive {2}False {3}FailedGetResourceMetric {2}the HPA was unable to compute the replica count: failed to get cpu utilization: missing request for cpu in container nr of Pod nr-\S+$/),
      expect.stringMatching(/^ {2}Warning {2}FailedComputeMetricsReplicas {2}0s {4}horizontal-pod-autoscaler {2}invalid metrics \(1 invalid out of 1\), first error is: failed to get cpu resource metric value: failed to get cpu utilization: missing request for cpu in container nr of Pod nr-\S+$/)]));
    expect(s.log[5].out).toEqual(expect.arrayContaining(['  AbleToScale  False   FailedGetScale  the HPA controller was unable to get the target\'s current scale: deployments.apps "ghost" not found',
      '  Warning  FailedGetScale  0s    horizontal-pod-autoscaler  deployments.apps "ghost" not found']));
    const off = asOn(withFiles({ ...scaleLab, kube: { ...scaleLab.kube, metricsServer: false } }, { 'hpa.yaml': hpa() }), 'kubectl apply -f k8s/hpa.yaml', 'kubectl describe hpa web');
    expect(off.log[1].out).toContain('  Warning  FailedGetResourceMetric       0s    horizontal-pod-autoscaler  failed to get cpu utilization: unable to get metrics for resource cpu: unable to fetch metrics from resource metrics API: the server could not find the requested resource (get pods.metrics.k8s.io)');
  });
  it('scales on average values of cpu and memory', () => {
    const avg = (name: string, value: string) => ['metrics:', '- type: Resource', '  resource:', `    name: ${name}`, '    target:', '      type: AverageValue', `      averageValue: ${value}`];
    const m = withFiles(withLoad([100, 100], { memoryPerRequest: '1Mi' }), { 'mem.yaml': hpa(2, 10, null, avg('memory', '40Mi')), 'cpu.yaml': hpa(2, 10, null, avg('cpu', '100m')) });
    const s = asOn(m, 'kubectl apply -f k8s/mem.yaml', 'kubectl get hpa web --no-headers', 'kubectl describe hpa web');
    expect(cells(s.log[1].out[0]).slice(2, 6)).toEqual(['memory: 60817408/40Mi', '2', '10', '2']);
    expect(s.log[2].out).toContain('  resource memory on pods:  60817408 / 40Mi');
    expect(s.log[2].out[0]).toBe('Name:                       web');
    expect(rescales(s.log[2].out)).toEqual(['New size: 3; reason: memory resource above target']);
    expect(cells(asOn(m, 'kubectl apply -f k8s/cpu.yaml', 'kubectl get hpa web --no-headers').log[1].out[0]).slice(2, 6)).toEqual(['cpu: 51m/100m', '2', '10', '2']);
  });
});

import { describe, expect, it } from 'vitest';
import { terminalContentProblems } from '@/lib/terminal/lesson';
import { AUTOSCALING_PROFILE, HELM_PROFILE } from '@/lib/terminal/shell';
import { hmOn } from './support/helm-fixture';
import { as, asOn, hpa, scaleLab, web, withFiles, withLoad } from './support/autoscale-fixture';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §1–§3, §7): the autoscaling profile and its boundary, the
 * lesson data (metricsServer, load), requests and limits (QoS classes, scheduling by requests and Pending on a full
 * cluster, describe node's Allocated resources, OOMKilled at the memory limit) and metrics-server's kubectl top.
 */
const cells = (line: string) => line.trim().split(/\s{2,}/);
const problems = (m: object) => terminalContentProblems({ machines: [m as never], examples: [], exercises: [] });
const pod = (name: string, image: string, resources: string[] = []) => ['apiVersion: v1', 'kind: Pod', 'metadata:', `  name: ${name}`, 'spec:', '  containers:', `  - name: ${name}`, `    image: ${image}`,
  ...resources.length ? ['    resources:', ...resources.map(l => `      ${l}`)] : [], ''].join('\n');

describe('the autoscaling profile and its boundary', () => {
  it('adds no command above helm; below it top, autoscale, HPAs, the data and the check name E40', () => {
    expect(AUTOSCALING_PROFILE.commands).toEqual(HELM_PROFILE.commands);
    expect(AUTOSCALING_PROFILE.features).toEqual([...HELM_PROFILE.features!, 'autoscaling']);
    const below = { ...withFiles(scaleLab, { 'hpa.yaml': hpa() }), profile: 'helm' as const, kube: { ...scaleLab.kube, metricsServer: undefined } };
    const s = hmOn(below, 'kubectl top nodes', 'kubectl autoscale deploy web --max=3', 'kubectl apply -f k8s/hpa.yaml', 'kubectl get hpa');
    expect(s.log.map(l => l.err[0])).toEqual(['（模擬環境：kubectl top 要到引擎階段 E40 才模擬）', '（模擬環境：kubectl autoscale 要到引擎階段 E40 才模擬）',
      '（模擬環境：HorizontalPodAutoscaler 要到引擎階段 E40 才模擬）', '（模擬環境：hpa 要到引擎階段 E40 才模擬）']);
    expect(problems({ ...scaleLab, profile: 'helm' })).toContain('machine kub-40: kube: metricsServer needs the autoscaling profile (engine stage E40)');
    expect(problems({ ...withLoad([10]), profile: 'helm' })).toContain('machine kub-40: kube: load needs the autoscaling profile (engine stage E40)');
    expect(problems(scaleLab)).toEqual([]);
  });
  it('checks the load data', () => {
    const bad = (load: object, more: object = {}) => problems({ ...scaleLab, kube: { ...scaleLab.kube, ...more, load: [{ service: 'web', minutes: 2, rps: [1, 2], cpuPerRequest: '1m', ...load }] } });
    expect(bad({ deployment: 'web' })).toEqual(['machine kub-40: kube: load[0]: names a service or a deployment (one of them)']);
    expect(bad({ minutes: 0 })).toEqual(['machine kub-40: kube: load[0]: minutes is 1..360']);
    expect(bad({ rps: [1] })).toEqual(['machine kub-40: kube: load[0]: rps has 1 values for 2 minutes']);
    expect(bad({ rps: { seed: 1, baseline: -1 } })).toEqual(['machine kub-40: kube: load[0]: rps the baseline is a whole number 0…10000000']);
    expect(bad({ cpuPerRequest: 'lots', memoryPerRequest: '1Xi' })).toEqual(['machine kub-40: kube: load[0]: cpuPerRequest is a cpu quantity such as 2m', 'machine kub-40: kube: load[0]: memoryPerRequest is a memory quantity such as 1Mi']);
    expect(bad({ start: '2026-12-31 00:00:00' })).toEqual(['machine kub-40: kube: load[0]: start is a UTC time between created and a day after now']);
    expect(bad({}, { metricsServer: 'yes' })).toEqual(['machine kub-40: kube: metricsServer is true or false']);
  });
  it('installs metrics-server in kube-system and lists the Metrics API', () => {
    const s = as('kubectl get deploy,pods -n kube-system -l k8s-app=metrics-server', 'kubectl api-resources');
    expect(cells(s.log[0].out[1])).toEqual(['deployment.apps/metrics-server', '1/1', '1', '1', '30d']);
    expect(cells(s.log[0].out[4]).slice(0, 3)).toEqual(['pod/metrics-server-hbpxwnlhk8-4d7r6', '1/1', 'Running']);
    expect(s.log[1].out.filter(l => l.includes('metrics.k8s.io')).map(cells)).toEqual([['nodes', 'metrics.k8s.io/v1beta1', 'false', 'NodeMetrics'], ['pods', 'metrics.k8s.io/v1beta1', 'true', 'PodMetrics']]);
  });
});

describe('requests and limits', () => {
  it('gives each pod its QoS class', () => {
    const m = withFiles(scaleLab, { 'qos.yaml': [pod('g', 'nginx:1.27', ['limits:', '  cpu: 200m', '  memory: 64Mi']), pod('b', 'nginx:1.27', ['requests:', '  cpu: 100m']), pod('e', 'nginx:1.27')].join('---\n') });
    const s = asOn(m, 'kubectl apply -f k8s/qos.yaml', 'kubectl get pods g b e -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass --no-headers', 'kubectl describe pod g');
    expect(s.log[1].out.map(cells)).toEqual([['g', 'Guaranteed'], ['b', 'Burstable'], ['e', 'BestEffort']]);
    expect(s.log[2].out).toContain('QoS Class:                   Guaranteed');
    expect(s.log[2].out).toEqual(expect.arrayContaining(['    Limits:', '      cpu:        200m', '      memory:     64Mi']));
  });
  it('schedules by requests: describe node adds them up, and a full cluster leaves pods Pending (Insufficient cpu)', () => {
    const m = withFiles(scaleLab, { 'big.yaml': web('big', 8, ['requests:', '  cpu: 500m']) });
    const s = asOn(m, 'kubectl describe node node-02', 'kubectl apply -f k8s/big.yaml', 'sleep 10', 'kubectl get pods -l app=big --field-selector status.phase=Pending --no-headers', 'kubectl describe node node-02', 'kubectl events --types=Warning');
    const allocated = (lines: string[]) => lines.slice(lines.indexOf('Allocated resources:') + 4, lines.indexOf('Allocated resources:') + 6).map(cells);
    expect(allocated(s.log[0].out)).toEqual([['cpu', '200m (10%)', '0 (0%)'], ['memory', '128Mi (3%)', '0 (0%)']]);
    expect(s.log[3].out.map(l => cells(l)[2])).toEqual(['Pending', 'Pending']);
    expect(allocated(s.log[4].out)[0]).toEqual(['cpu', '1700m (85%)', '0 (0%)']);
    expect(s.log[5].out.at(-1)).toMatch(/FailedScheduling\s+Pod\/big-\S+\s+0\/3 nodes are available: 1 node\(s\) had untolerated taint \{node-role\.kubernetes\.io\/control-plane: \}, 2 Insufficient cpu\. preemption: 0\/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod\.$/);
  });
  it('kills a container whose memory reaches its limit (OOMKilled, exit 137) and restarts it', () => {
    const m = withFiles(scaleLab, { 'oom.yaml': pod('oom', 'team/hungry:1.0', ['limits:', '  memory: 100Mi']) });
    const s = asOn(m, 'kubectl apply -f k8s/oom.yaml', 'sleep 4', 'kubectl get pod oom --no-headers', 'sleep 2', 'kubectl get pod oom -o jsonpath={.status.containerStatuses[0].lastState.terminated.reason}/{.status.containerStatuses[0].lastState.terminated.exitCode}/{.status.containerStatuses[0].restartCount}',
      'kubectl describe pod oom');
    expect(cells(s.log[2].out[0]).slice(1, 3)).toEqual(['1/1', 'Running']);
    expect(s.log[4].out).toEqual(['OOMKilled/137/1']);
    expect(s.log[5].out).toEqual(expect.arrayContaining(['      Reason:       OOMKilled', '      Exit Code:    137', '      Started:      Tue, 24 Nov 2026 10:00:02 +0000', '      Finished:     Tue, 24 Nov 2026 10:00:05 +0000', 'QoS Class:                   Burstable']));
  });
});

describe('metrics-server and kubectl top', () => {
  it('needs metrics-server', () => {
    const s = asOn({ ...scaleLab, kube: { ...scaleLab.kube, metricsServer: false } }, 'kubectl top nodes', 'kubectl top pods', 'kubectl get pods -n kube-system -l k8s-app=metrics-server');
    expect(s.log.map(l => l.err)).toEqual([['error: Metrics API not available'], ['error: Metrics API not available'], ['No resources found in kube-system namespace.']]);
  });
  it('shows nodes (usage of their allocatable) and pods with the real columns', () => {
    const s = as('kubectl top nodes', 'kubectl top node node-02 --no-headers', 'kubectl top pods', 'kubectl top pods -A --sort-by=memory', 'kubectl top pods --containers', 'kubectl top', 'kubectl top node nope', 'kubectl top pods --sort-by=disk');
    expect(s.log[0].out).toEqual(['NAME      CPU(cores)   CPU%      MEMORY(bytes)   MEMORY%', 'cp-01     159m         7%        1128Mi          29%', 'node-01   35m          1%        438Mi           11%', 'node-02   33m          1%        434Mi           11%']);
    expect(s.log[1].out).toEqual(['node-02   33m       1%        434Mi     11%']);
    expect(s.log[2].out).toEqual(['NAME                   CPU(cores)   MEMORY(bytes)', 'web-x9pgdg8s62-7qqsz   1m           8Mi', 'web-x9pgdg8s62-sj8mv   1m           8Mi']);
    expect(cells(s.log[3].out[0])).toEqual(['NAMESPACE', 'NAME', 'CPU(cores)', 'MEMORY(bytes)']);
    expect(cells(s.log[3].out[1])).toEqual(['kube-system', 'kube-apiserver-cp-01', '50m', '260Mi']);
    expect(s.log[3].out).toHaveLength(13);
    expect(s.log[4].out.map(cells)).toEqual([['POD', 'NAME', 'CPU(cores)', 'MEMORY(bytes)'], ['web-x9pgdg8s62-7qqsz', 'web', '1m', '8Mi'], ['web-x9pgdg8s62-sj8mv', 'web', '1m', '8Mi']]);
    expect(s.log[5].out[0]).toBe('Display resource (CPU/memory) usage.');
    expect(s.log[6].err).toEqual(['Error from server (NotFound): nodemetrics.metrics.k8s.io "nope" not found']);
    expect(s.log[7].err).toEqual(['error: --sort-by accepts only cpu or memory']);
  });
  it('reports a new pod after two scrapes, and names a missing one', () => {
    const m = withFiles(scaleLab, { 'p.yaml': pod('p', 'team/web:1.0') });
    const s = asOn(m, 'sleep 7', 'kubectl apply -f k8s/p.yaml', 'kubectl top pod p', 'kubectl top pods -l app=none', 'sleep 22', 'kubectl top pod p', 'sleep 1', 'kubectl top pod p --no-headers', 'kubectl top pod nope', 'kubectl delete deploy web', 'kubectl delete pod p', 'kubectl top pods');
    expect(s.log[2].err).toEqual(['error: Metrics not available for pod default/p, age: 0s']);
    expect(s.log[3].err).toEqual(['No resources found in default namespace.']);
    expect(s.log[5].err).toEqual(['error: Metrics not available for pod default/p, age: 22s']);
    expect(s.log[7].out).toEqual(['p         1m        8Mi']);
    expect(s.log[8].err).toEqual(['Error from server (NotFound): pods "nope" not found']);
    expect(s.log[11].err).toEqual(['No resources found in default namespace.']);
  });
  it('turns the declared load into CPU (by the share of ready endpoints, up to the CPU limit) and memory, at each 15-second scrape', () => {
    const m = withLoad([100, 300], { memoryPerRequest: '1Mi' });
    const s = asOn(m, 'kubectl top pods --no-headers', 'sleep 59', 'kubectl top pods --no-headers', 'sleep 1', 'kubectl top pods --no-headers', 'sleep 60', 'kubectl top pods --no-headers');
    expect(s.log.filter((_, i) => i % 2 === 0).map(l => cells(l.out[0]).slice(1))).toEqual([['51m', '58Mi'], ['51m', '58Mi'], ['151m', '158Mi'], ['1m', '8Mi']]);
    const busy = withFiles(scaleLab, { 'b.yaml': [pod('fast', 'team/busy:1.0'), pod('slow', 'team/busy:1.0', ['limits:', '  cpu: 100m'])].join('---\n') });
    expect(asOn(busy, 'kubectl apply -f k8s/b.yaml', 'sleep 30', 'kubectl top pods fast --no-headers', 'kubectl top pods slow --no-headers').log.slice(2).map(l => cells(l.out[0])[1])).toEqual(['250m', '100m']);
  });
  it('spreads a Deployment\'s load over its ready pods; a D3 shape generates the requests', () => {
    const m = withLoad({ seed: 7, baseline: 100, changes: [{ kind: 'step', at: 1, delta: 100 }] }, { service: undefined, deployment: 'web', minutes: 3, cpuPerRequest: '2m' });
    const s = asOn(m, 'kubectl top pods --no-headers', 'sleep 60', 'kubectl top pods --no-headers', 'kubectl scale deploy web --replicas=4', 'sleep 30', 'kubectl top pods --no-headers');
    expect(cells(s.log[0].out[0])[1]).toBe('101m');
    expect(cells(s.log[2].out[0])[1]).toBe('201m');
    expect(s.log[5].out.map(l => cells(l)[1])).toEqual(['101m', '101m', '101m', '101m']);
  });
});

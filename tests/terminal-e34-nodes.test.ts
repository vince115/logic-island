import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, describeCheck, machineState, terminalContentProblems, variantMachine, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { nextKubeTime, settleKube, waitStep } from '@/lib/terminal/kube-settle';
import { sameJ, sortJ, type J } from '@/lib/terminal/kube-model';
import { probesLab } from './support/probes-fixture';
import { deployment, withFiles, workloadsLab, workOn } from './support/workloads-fixture';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §8–§11): kubectl cordon, uncordon and drain (the filters and
 * their real errors), a lesson-declared node failure (NotReady after 50 s, eviction after the 300 s toleration, pods
 * left Terminating, replacements on the other nodes), the checks kube-workload and kube-rollout, variants, determinism.
 */
const FAIL = '2026-11-24 10:01:00';
const lab = withFiles(workloadsLab, { 'dl.yaml': deployment('dl', 'nginx:1.27', 3, ['progressDeadlineSeconds: 30']) });
const failing: TerminalMachine = { ...lab, kube: { ...lab.kube, failures: [{ node: 'node-02', at: FAIL }] } };
const go = (...commands: string[]) => workOn(lab, ...commands);
const col = (out: string[], n: number) => out.slice(1).map(l => l.split(/\s+/)[n]);
const exercise = (checks: TerminalCheck[], solution: string[], machine: TerminalMachine = lab) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: machine.id, statement: '', checks, solution: [], mistakes: [], hints: [], explanation: '' }, [machine], solution);
const content = (checks: TerminalCheck[], machine: TerminalMachine = lab) => terminalContentProblems({ machines: [machine], examples: [], exercises: [
  { id: 'w', title: 'x', machine: machine.id, statement: 'x', checks, solution: ['kubectl apply -f k8s/deploy.yaml', 'kubectl rollout status deploy/web'], mistakes: [{ commands: ['kubectl get pods'], why: 'x' }], hints: [], explanation: 'x' }] });

describe('cordon, uncordon and drain', () => {
  it('cordon makes a node unschedulable; the scheduler says so and retries after uncordon', () => {
    const s = go('kubectl cordon node-01 node-02', 'kubectl cordon node-01', 'kubectl cordon node-09', 'kubectl get nodes', 'kubectl apply -f k8s/deploy.yaml', 'kubectl get pods -l app=web', 'kubectl events --types=Warning',
      'kubectl describe node node-01', 'kubectl uncordon node-01', 'kubectl uncordon node-01', 'kubectl get pods -l app=web -o wide');
    expect(s.log[0].out).toEqual(['node/node-01 cordoned', 'node/node-02 cordoned']);
    expect([s.log[1].out, s.log[2].err]).toEqual([['node/node-01 already cordoned'], ['Error from server (NotFound): nodes "node-09" not found']]);
    expect(col(s.log[3].out, 1)).toEqual(['Ready', 'Ready,SchedulingDisabled', 'Ready,SchedulingDisabled']);
    expect(col(s.log[5].out, 2)).toEqual(['Pending', 'Pending', 'Pending']);
    expect(s.log[6].out[1]).toMatch(/FailedScheduling\s+Pod\/web-\S+\s+0\/3 nodes are available: 1 node\(s\) had untolerated taint \{node-role\.kubernetes\.io\/control-plane: \}, 2 node\(s\) were unschedulable\. preemption: 0\/3 nodes are available: 3 Preemption is not helpful for scheduling\.$/);
    expect(s.log[7].out).toEqual(expect.arrayContaining(['Taints:             node.kubernetes.io/unschedulable:NoSchedule', 'Unschedulable:      true', '  Normal  NodeNotSchedulable  0s    kubelet  Node node-01 status is now: NodeNotSchedulable']));
    expect([s.log[8].out, s.log[9].out]).toEqual([['node/node-01 uncordoned'], ['node/node-01 already uncordoned']]);
    expect(col(s.log[10].out, 6)).toEqual(['node-01', 'node-01', 'node-01']);
  });
  it('drain refuses DaemonSet pods without --ignore-daemonsets and lone pods without --force', () => {
    const s = go('kubectl drain node-01', 'kubectl drain node-01 --ignore-daemonsets');
    const proxy = s.log[0].err[0].match(/kube-system\/kube-proxy-\w+/)![0];
    expect([s.log[0].out, s.log[0].err, s.log[0].status]).toEqual([['node/node-01 cordoned'], [`error: unable to drain node "node-01" due to error: [cannot delete DaemonSet-managed Pods (use --ignore-daemonsets to ignore): ${proxy}, cannot delete cannot delete Pods that declare no controller (use --force to override): default/hello], continuing command...`,
      'There are pending nodes to be drained:', ' node-01', `error: [cannot delete DaemonSet-managed Pods (use --ignore-daemonsets to ignore): ${proxy}, cannot delete cannot delete Pods that declare no controller (use --force to override): default/hello]`], 1]);
    expect(s.log[1].err[0]).toBe('error: unable to drain node "node-01" due to error: cannot delete cannot delete Pods that declare no controller (use --force to override): default/hello, continuing command...');
  });
  it('drain evicts the rest and waits until they are gone; their ReplicaSet puts them elsewhere', () => {
    const s = go('kubectl apply -f k8s/deploy.yaml', 'kubectl rollout status deploy/web', 'kubectl drain node-02 --ignore-daemonsets --delete-emptydir-data', 'date', 'kubectl get pods -o wide', 'kubectl drain node-01 --ignore-daemonsets --force', 'date');
    const evicted = s.log[2].out.filter(l => l.startsWith('evicting'));
    expect(evicted).toHaveLength(2);
    expect(s.log[2].out).toEqual(['node/node-02 cordoned', ...evicted, ...evicted.map(l => `pod/${l.split('/')[1]} evicted`), 'node/node-02 drained']);
    expect(s.log[2].err).toEqual([expect.stringMatching(/^Warning: ignoring DaemonSet-managed Pods: kube-system\/kube-proxy-\w+$/)]);
    expect(s.log[3].out).toEqual(['Tue Nov 24 10:00:03 UTC 2026']);
    expect(col(s.log[4].out, 6)).toEqual(['node-01', 'node-01', 'node-01', 'node-01']);
    expect(s.log[5].err[0]).toMatch(/^Warning: deleting Pods that declare no controller: default\/hello; ignoring DaemonSet-managed Pods: kube-system\/kube-proxy-\w+$/);
    expect(s.log[5].out.slice(-2)).toEqual(['pod/hello evicted', 'node/node-01 drained']);
    expect(s.log[6].out).toEqual(['Tue Nov 24 10:00:33 UTC 2026']);
  });
});

describe('a node failure', () => {
  it('is NotReady 50 s after the kubelet stops; its pods are evicted after the 300 s toleration and stay Terminating', () => {
    const s = workOn(failing, 'kubectl apply -f k8s/deploy.yaml', 'kubectl rollout status deploy/web', 'sleep 106', 'kubectl get nodes node-02', 'sleep 1', 'kubectl get nodes node-02', 'kubectl get deploy web',
      'kubectl get pods -o wide', "kubectl get pod web-lsqv6sj66d-b8fhb -o jsonpath='{.status.conditions[2].status} {.status.conditions[3].status}'", 'kubectl events --for pod/web-lsqv6sj66d-b8fhb --types=Warning',
      'sleep 299', 'kubectl get pods', 'sleep 1', 'kubectl get pods -o wide', 'kubectl get deploy web', 'sleep 3600', 'kubectl get pods', 'kubectl describe node node-02', 'kubectl get pod hello -o jsonpath={.spec.nodeName}');
    expect(col(s.log[3].out, 1)).toEqual(['Ready']);
    expect(col(s.log[5].out, 1)).toEqual(['NotReady']);
    expect(s.log[6].out[1]).toMatch(/^web\s+1\/3\s+3\s+1\s+110s$/);
    expect(s.log[7].out.slice(1).map(l => l.split(/\s+/).slice(1, 3).join(' '))).toEqual(['1/1 Running', '1/1 Running', '1/1 Running', '1/1 Running']);
    expect(s.log[8].out).toEqual(['False True']);
    expect(s.log[9].out[1]).toMatch(/Warning\s+NodeNotReady\s+Pod\/web-lsqv6sj66d-b8fhb\s+Node is not ready$/);
    expect(col(s.log[11].out, 2)).toEqual(['Running', 'Running', 'Running', 'Running']);
    expect(s.log[13].out.slice(1).map(l => l.split(/\s+/).filter((_, i) => i === 2 || i === 6).join(' ')).sort()).toEqual(['Running node-01', 'Running node-01', 'Running node-01', 'Running node-01', 'Terminating node-02', 'Terminating node-02']);
    expect(s.log[14].out[1]).toMatch(/^web\s+3\/3\s+3\s+3\s+6m50s$/);
    expect(col(s.log[16].out, 2).filter(x => x === 'Terminating')).toHaveLength(2);
    expect(s.log[17].out).toEqual(expect.arrayContaining(['Taints:             node.kubernetes.io/unreachable:NoSchedule', '                    node.kubernetes.io/unreachable:NoExecute',
      '  Ready            Unknown   Tue, 24 Nov 2026 10:01:00 +0000   Tue, 24 Nov 2026 10:01:50 +0000   NodeStatusUnknown   Kubelet stopped posting node status.']));
    expect(s.log[18].out).toEqual(['node-01']);
  });
  it('is deterministic and the same for a variant\'s own failures', () => {
    expect(JSON.stringify(settleKube(machineState(failing)).kube)).toBe(JSON.stringify(settleKube(machineState(failing)).kube));
    const v = variantMachine(failing, { label: 'node-01 fails', files: [], kube: { ...failing.kube, failures: [{ node: 'node-01', at: FAIL }] } });
    const s = workOn(v, 'sleep 110', 'kubectl get nodes');
    expect(col(s.log[1].out, 1)).toEqual(['Ready', 'NotReady', 'Ready']);
  });
});

describe('long runs', () => {
  it('a week of a crash-looping Deployment settles in few steps; a paused rollout status stops at the simulation\'s cap', () => {
    const s = go('kubectl create deployment c --image=team/crash:1.0 --replicas=3', 'sleep 604800', 'kubectl get deploy c', 'kubectl apply -f k8s/deploy.yaml', 'kubectl wait --for=condition=Available deploy/web --timeout=60s',
      'kubectl rollout pause deploy/web', 'kubectl set image deploy/web web=nginx:1.28', 'kubectl rollout status deploy/web', 'date');
    expect(s.log[2].out[1]).toMatch(/^c\s+0\/3\s+3\s+0\s+7d$/);
    expect(s.log[4].out).toEqual(['deployment.apps/web condition met']);
    expect([s.log[7].out, s.log[7].err, s.log[8].out]).toEqual([['Waiting for deployment "web" rollout to finish: 0 out of 3 new replicas have been updated...'],
      ['（模擬環境：kubectl rollout status 最多等待 3600 秒；請加上 --timeout）'], ['Tue Dec  1 11:00:03 UTC 2026']]);
  });
});

describe('the checks kube-workload and kube-rollout', () => {
  const done = ['kubectl apply -f k8s/deploy.yaml', 'kubectl rollout status deploy/web'];
  it('pass on what the commands made and say why not otherwise', () => {
    const checks: TerminalCheck[] = [{ kind: 'kube-workload', name: 'web', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, image: 'nginx:1.27', revision: 1, paused: false, condition: { type: 'Progressing', status: 'True', reason: 'NewReplicaSetAvailable' } },
      { kind: 'kube-rollout', name: 'web', complete: true, revision: 1, changeCause: '<none>', history: 1 }, { kind: 'kube-workload', resource: 'ReplicaSet', name: 'web-lsqv6sj66d', replicas: 3, readyReplicas: 3 }];
    expect(exercise(checks, done).ok).toBe(true);
    const early = exercise(checks, ['kubectl apply -f k8s/deploy.yaml']).results.map(r => r.message.split('，但')[1]);
    expect(early).toEqual(['web 的 就緒的 Pod 是 0', 'web 的滾動更新還沒完成：Waiting for deployment "web" rollout to finish: 0 of 3 updated replicas are available...', 'web-lsqv6sj66d 的 就緒的 Pod 是 0']);
    const later = exercise([{ kind: 'kube-rollout', name: 'web', revision: 2, changeCause: 'v2', history: 2 }, { kind: 'kube-workload', name: 'web', image: 'nginx:1.28', container: 'web', paused: true }],
      [...done, 'kubectl set image deploy/web web=nginx:1.28', "kubectl annotate deploy web kubernetes.io/change-cause=v2", 'kubectl rollout pause deploy/web']);
    expect(later.ok).toBe(true);
    const none = exercise([{ kind: 'kube-rollout', name: 'api', complete: true }, { kind: 'kube-workload', name: 'web', image: 'x', container: 'side' }, { kind: 'kube-workload', name: 'web', condition: { type: 'Progressing', status: 'False' } }], done);
    expect(none.results.map(r => r.message.split('，但')[1])).toEqual(['沒有名為 api 的 Deployment', 'web 沒有名為 side 的容器', 'web 的 Progressing 是 True（NewReplicaSetAvailable）']);
    const stuck = exercise([{ kind: 'kube-rollout', name: 'dl', complete: false }, { kind: 'kube-workload', name: 'dl', condition: { type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded' } }],
      ['kubectl apply -f k8s/dl.yaml', 'kubectl rollout status deploy/dl', 'kubectl set image deploy/dl dl=nginx:9.9', 'sleep 30']);
    expect(stuck.ok).toBe(true);
  });
  it('are described in words and validated', () => {
    expect(describeCheck({ kind: 'kube-workload', name: 'web', replicas: 3, image: 'nginx:1.28', revision: 2 })).toBe('default 命名空間應該有名為 web 的 Deployment（spec.replicas 3、Image nginx:1.28、revision 2）');
    expect(describeCheck({ kind: 'kube-rollout', name: 'web', complete: true, changeCause: 'v2', history: 2 })).toBe('default 命名空間的 Deployment web 應該滾動更新已完成、CHANGE-CAUSE 是「v2」、歷史有 2 筆');
    expect(content([{ kind: 'kube-rollout', name: 'web' }])).toContain('exercise w: a kube-rollout check checks complete, revision, changeCause or history');
    expect(content([{ kind: 'kube-workload', resource: 'ReplicaSet', name: 'x', paused: true }])).toContain('exercise w: a ReplicaSet has no updatedReplicas or paused');
    expect(content([{ kind: 'kube-workload', name: 'web', condition: { type: 'Ready', status: 'True' } }])).toContain('exercise w: a kube-workload check\'s condition is { type: Available|Progressing|ReplicaFailure, status: True|False|Unknown, reason? }');
    expect(content([{ kind: 'kube-workload', name: 'web', replicas: 3 }], { ...probesLab, files: lab.files })).toContain('exercise w: a kube-workload check needs a workloads machine (engine stage E34)');
    expect(content([{ kind: 'kube-workload', name: 'web', replicas: 3 }, { kind: 'kube-rollout', name: 'web', complete: true }])).toEqual([]);
  });
});

describe('the settle loop\'s speed-ups (KUB-1)', () => {
  it('sameJ answers as the sorted JSON text did (key order, undefined keys and items, non-finite numbers)', () => {
    const old = (a: J | undefined, b: J | undefined) => JSON.stringify(sortJ(a ?? null)) === JSON.stringify(sortJ(b ?? null));
    const u = undefined as unknown as J;
    const cases: [J | undefined, J | undefined][] = [[{ a: 1, b: [1, { c: 2, d: 'x' }] }, { b: [1, { d: 'x', c: 2 }], a: 1 }], [{ a: 1, b: u }, { a: 1 }], [{ a: 1 }, { a: 1, b: 2 }],
      [[1, u], [1, null]], [[1, 2], [2, 1]], [NaN, null], [Infinity, null], [0, -0], ['1', 1], [null, undefined], [{}, []], [[], []], [{ a: [] }, { a: {} }], [{ a: null }, {}], [true, 'true']];
    for (const [a, b] of cases) expect([sameJ(a, b), sameJ(b, a)], JSON.stringify([a, b])).toEqual([old(a, b), old(b, a)]);
  });
  it('a waiting command moves to the next step of the cluster, at least 1 s and never past what is left', () => {
    const s = settleKube(workOn(lab, 'kubectl create deployment c --image=team/crash:1.0 --replicas=1', 'sleep 30').state);
    const next = nextKubeTime(s)!, now = s.clock!.now;
    expect(next).toBeGreaterThan(now);
    expect(waitStep(s, 10_000)).toBe(next - now);
    expect(waitStep(s, 1)).toBe(1);
    expect(nextKubeTime({ ...s, kube: undefined })).toBeUndefined();
  });
});

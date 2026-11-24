import { describe, expect, it } from 'vitest';
import { PROBES_PROFILE, PROFILES, WORKLOADS_PROFILE } from '@/lib/terminal/shell';
import { machineProblems, profileOf } from '@/lib/terminal/lesson';
import { fenceposts, templateHash } from '@/lib/terminal/kube-workload-spec';
import { rankForDeletion, type PodFacts } from '@/lib/terminal/kube-replicaset';
import { probesOn } from './support/probes-fixture';
import { session } from './support/environments-fixture';
import { deployment, withFiles, workloadsLab, workOn } from './support/workloads-fixture';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md): the workloads profile — Deployment and ReplicaSet objects and
 * their validation, the ReplicaSet controller (claim, adopt, release, scale-down ranking), the Deployment controller
 * (RollingUpdate within maxSurge/maxUnavailable, Recreate, minReadySeconds, progressDeadlineSeconds, revisions and
 * history), kubectl create deployment, scale, set image, rollout and delete --cascade. Nodes and checks are in
 * terminal-e34-nodes.test.ts.
 */
const lab = withFiles(workloadsLab, {
  'surge.yaml': deployment('sg', 'nginx:1.27', 4, ['strategy:', '  rollingUpdate:', '    maxSurge: 2', '    maxUnavailable: 1']),
  'min.yaml': deployment('mr', 'nginx:1.27', 2, ['minReadySeconds: 10']),
  'dl.yaml': deployment('dl', 'nginx:1.27', 3, ['progressDeadlineSeconds: 30']),
  'rc.yaml': deployment('rc', 'team/web:1.0', 2, ['strategy:', '  type: Recreate']),
  'rs.yaml': deployment('solo', 'nginx:1.27', 2, [], [], 'ReplicaSet'),
  'wrong.yaml': deployment('bad', 'nginx:1.27', -1, ['strategy:', '  rollingUpdate:', '    maxSurge: 0', '    maxUnavailable: 0']).replace('matchLabels:\n      app: bad', 'matchLabels:\n      app: other').replace('    spec:\n', '    spec:\n      restartPolicy: Never\n'),
  'typo.yaml': deployment('typo', 'nginx:1.27', 1, ['replica: 2']),
  'moved.yaml': deployment('web', 'nginx:1.27').replace(/app: web/g, 'app: web2'),
  'recreate.yaml': deployment('web', 'nginx:1.27', 3, ['strategy:', '  type: Recreate']),
  'hist.yaml': deployment('h', 'team/web:1.0', 1, ['revisionHistoryLimit: 1']),
});
const go = (...commands: string[]) => workOn(lab, ...commands);
const events = (lines: string[]) => lines.slice(1).map(l => l.replace(/^\S+\s+Normal\s+\S+\s+\S+\s+/, ''));

describe('the workloads profile', () => {
  it('is the probes profile with the workloads feature and no new commands', () => {
    expect(WORKLOADS_PROFILE.commands).toEqual(PROBES_PROFILE.commands);
    expect(WORKLOADS_PROFILE.features).toEqual([...PROBES_PROFILE.features!, 'workloads']);
    expect(PROFILES.workloads).toBe(WORKLOADS_PROFILE);
    expect(profileOf(lab)).toBe(WORKLOADS_PROFILE);
    expect(machineProblems(lab)).toEqual([]);
  });
  it('below it Deployments, ReplicaSets and the new verbs and flags are later stages, as before', () => {
    const s = probesOn({ ...lab, profile: 'probes' }, 'kubectl apply -f k8s/deploy.yaml', 'kubectl get rs', 'kubectl rollout status deploy/web', 'kubectl scale deploy/x --replicas=2', 'kubectl drain node-01',
      'kubectl create deployment w --image=nginx:1.27', 'kubectl delete pod hello --cascade=orphan', 'kubectl get all', 'kubectl get rs -n kube-system');
    expect(s.log.map(l => l.err[0])).toEqual(['（模擬環境：Deployment 要到引擎階段 E34 才模擬）', '（模擬環境：rs 要到引擎階段 E34 才模擬）', '（模擬環境：kubectl rollout 要到引擎階段 E34 才模擬）',
      '（模擬環境：kubectl scale 要到引擎階段 E34 才模擬）', '（模擬環境：kubectl drain 要到引擎階段 E34 才模擬）', '（模擬環境：kubectl create deployment 要到引擎階段 E34 才模擬）',
      'error: unknown flag: --cascade', '（模擬環境：all 要到引擎階段 E34 才模擬）', '（模擬環境：rs 要到引擎階段 E34 才模擬）']);
    expect(machineProblems({ ...lab, profile: 'probes', kube: { ...lab.kube, failures: [{ node: 'node-02', at: '2026-11-24 10:01:00' }] } })).toEqual(['machine kub-34: kube: failures needs the workloads profile (engine stage E34)']);
  });
  it('validates the lesson\'s node failures', () => {
    const bad = { ...lab, kube: { ...lab.kube, failures: [{ node: 'node-09', at: '2026-11-24 10:01:00' }, { node: 'node-01', at: '2026-12-31 00:00:00' }] } };
    expect(machineProblems(bad)).toEqual(['machine kub-34: kube: failures: no node node-09', 'machine kub-34: kube: failures: node-01 at is a UTC time between created and a day after now']);
  });
});

describe('Deployment and ReplicaSet objects', () => {
  it('decodes strictly, validates as apps/v1 does and keeps the selector immutable', () => {
    const s = go('kubectl apply -f k8s/typo.yaml', 'kubectl apply -f k8s/wrong.yaml', 'kubectl apply -f k8s/deploy.yaml', 'kubectl apply -f k8s/moved.yaml', 'kubectl apply -f k8s/recreate.yaml');
    expect(s.log[0].err).toEqual(['Error from server (BadRequest): error when creating "k8s/typo.yaml": Deployment in version "v1" cannot be handled as a Deployment: strict decoding error: unknown field "spec.replica"']);
    expect(s.log[1].err).toEqual(['The Deployment "bad" is invalid: ', '* spec.replicas: Invalid value: -1: must be greater than or equal to 0',
      '* spec.template.metadata.labels: Invalid value: map[string]string{"app":"bad"}: `selector` does not match template `labels`', '* spec.template.spec.restartPolicy: Unsupported value: "Never": supported values: "Always"',
      '* spec.strategy.rollingUpdate.maxUnavailable: Invalid value: intstr.IntOrString{Type:0, IntVal:0, StrVal:""}: may not be 0 when `maxSurge` is 0']);
    expect(s.log[3].err).toEqual(['The Deployment "web" is invalid: spec.selector: Invalid value: v1.LabelSelector{MatchLabels:map[string]string{"app":"web2"}, MatchExpressions:[]v1.LabelSelectorRequirement(nil)}: field is immutable']);
    expect(s.log[4].err).toEqual(['The Deployment "web" is invalid: spec.strategy.rollingUpdate: Forbidden: may not be specified when strategy `type` is \'Recreate\'']);
  });
  it('defaults the spec, creates the ReplicaSet and its pods, and names them from SHA-256', () => {
    const s = go('kubectl apply -f k8s/deploy.yaml', 'kubectl get deploy,rs,pods', "kubectl get deploy web -o jsonpath='{.spec.strategy} {.spec.progressDeadlineSeconds} {.spec.revisionHistoryLimit} {.metadata.generation}'",
      'kubectl get pods -l app=web -o jsonpath={.items[0].metadata.ownerReferences}', 'kubectl get rs -o wide');
    const hash = templateHash({ metadata: { creationTimestamp: null, labels: { app: 'web' } }, spec: { containers: [{ image: 'nginx:1.27', imagePullPolicy: 'IfNotPresent', name: 'web', resources: {}, terminationMessagePath: '/dev/termination-log',
      terminationMessagePolicy: 'File' }], dnsPolicy: 'ClusterFirst', restartPolicy: 'Always', schedulerName: 'default-scheduler', securityContext: {}, terminationGracePeriodSeconds: 30 } });
    expect(hash).toMatch(/^[bcdfghjklmnpqrstvwxz2456789]{10}$/);
    expect(s.log[1].out.slice(0, 6)).toEqual(['NAME                  READY     UP-TO-DATE   AVAILABLE   AGE', 'deployment.apps/web   0/3       3            0           0s', '',
      'NAME                             DESIRED   CURRENT   READY     AGE', `replicaset.apps/web-${hash}   3         3         0         0s`, '']);
    expect(s.log[1].out.filter(l => l.startsWith(`pod/web-${hash}-`))).toHaveLength(3);
    expect(s.log[2].out).toEqual(['{"rollingUpdate":{"maxSurge":"25%","maxUnavailable":"25%"},"type":"RollingUpdate"} 600 10 1']);
    expect(JSON.parse(s.log[3].out[0])).toEqual([{ apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind: 'ReplicaSet', name: `web-${hash}`, uid: expect.any(String) }]);
    expect(s.log[4].out[1]).toMatch(new RegExp(`^web-${hash}\\s+3\\s+3\\s+0\\s+0s\\s+web\\s+nginx:1.27\\s+app=web,pod-template-hash=${hash}$`));
  });
  it('kubectl create deployment generates kubectl\'s object; scale and set image change the spec', () => {
    const s = go('kubectl create deployment api --image=team/web:1.0 --image=busybox:1.36 --replicas=2 --port=8080 --dry-run=client -o yaml', 'kubectl create deployment api --image=team/web:1.0 --port=8080',
      'kubectl create deployment api --image=nginx:1.27', 'kubectl scale deploy/api --replicas=3', 'kubectl scale deploy api', 'kubectl set image deployment/api web=nginx:1.28', 'kubectl set image deploy/api nope=x',
      "kubectl get deploy api -o jsonpath='{.metadata.generation} {.spec.replicas} {.spec.template.spec.containers[0].image}'", 'kubectl scale pod/hello --replicas=2');
    expect(s.log[0].out).toEqual(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  creationTimestamp: null', '  labels:', '    app: api', '  name: api', 'spec:', '  replicas: 2', '  selector:', '    matchLabels:',
      '      app: api', '  strategy: {}', '  template:', '    metadata:', '      creationTimestamp: null', '      labels:', '        app: api', '    spec:', '      containers:', '      - image: team/web:1.0', '        name: web',
      '        ports:', '        - containerPort: 8080', '        resources: {}', '      - image: busybox:1.36', '        name: busybox', '        resources: {}', 'status: {}']);
    expect(s.log.slice(1, 8).map(l => [...l.out, ...l.err])).toEqual([['deployment.apps/api created'], ['error: failed to create deployment: deployments.apps "api" already exists'], ['deployment.apps/api scaled'],
      ['error: required flag(s) "replicas" not set'], ['deployment.apps/api image updated'], ['error: unable to find container named "nope"'], ['3 3 nginx:1.28']]);
    expect(s.log[8].err).toEqual(['（模擬環境：kubectl scale 只模擬 Deployment 與 ReplicaSet）']);
  });
});

describe('the ReplicaSet controller', () => {
  it('adopts a matching orphan, releases a relabeled pod and replaces it', () => {
    const a = go('kubectl apply -f k8s/rs.yaml', 'sleep 5', 'kubectl run x1 --image=nginx:1.27 --labels=app=solo', 'kubectl get pods -l app=solo', 'kubectl events --for rs/solo');
    const names = a.log[3].out.slice(1).map(l => l.split(/\s+/)[0]);
    expect(names).toHaveLength(2);
    expect(events(a.log[4].out)).toEqual([...names.map(n => `Created pod: ${n}`), 'Deleted pod: x1']);
    const s = session(a.state, WORKLOADS_PROFILE, `kubectl label pod ${names[0]} app=debug --overwrite`, 'kubectl get pods -l app', `kubectl get pod ${names[0]} -o jsonpath={.metadata.ownerReferences}`, `kubectl describe pod ${names[1]}`, 'kubectl get rs solo');
    expect(s.log[1].out.slice(1).map(l => l.split(/\s+/).slice(0, 3).join(' '))).toHaveLength(3);
    expect(s.log[1].out.find(l => l.startsWith(names[0]))).toMatch(/1\/1\s+Running/);
    expect(s.log[2].out).toEqual([]);
    expect(s.log[3].out).toContain('Controlled By:  ReplicaSet/solo');
    expect(s.log[4].out[1]).toMatch(/^solo\s+2\s+2\s+2\s+5s$/);
  });
  it('ranks the pods to delete: unscheduled, pending, not ready, more restarts, newer, then by name', () => {
    const f = (name: string, more: Partial<PodFacts>): PodFacts => ({ pod: { metadata: { name } }, ready: true, since: 0, phase: 'Running', deleting: false, node: 'node-01', restarts: 0, created: 100, ...more });
    const pods = [f('a', {}), f('b', { node: undefined, phase: 'Pending', ready: false }), f('c', { phase: 'Pending', ready: false }), f('d', { ready: false }), f('e', { restarts: 2 }), f('f', { created: 200 }), f('g', {})];
    expect([...pods].sort(rankForDeletion).map(p => p.pod.metadata && (p.pod.metadata as { name: string }).name)).toEqual(['b', 'c', 'd', 'e', 'f', 'a', 'g']);
    const s = go('kubectl apply -f k8s/deploy.yaml', 'sleep 5', 'kubectl scale deploy web --replicas=5', 'kubectl scale deploy web --replicas=2', 'kubectl events --for rs/web-lsqv6sj66d');
    // The two new pods (newer) go first, then the oldest three tie and the first name goes.
    const made = events(s.log[4].out).filter(e => e.startsWith('Created')).map(e => e.slice(13)), gone = events(s.log[4].out).filter(e => e.startsWith('Deleted')).map(e => e.slice(13));
    expect(gone).toEqual([...made.slice(3).sort(), [...made.slice(0, 3)].sort()[0]]);
  });
});

describe('rolling updates', () => {
  it('rounds maxSurge up and maxUnavailable down (resolveRolling), and never both 0', () => {
    const d = (replicas: number, maxSurge: unknown, maxUnavailable: unknown, type = 'RollingUpdate') => fenceposts({ spec: { replicas, strategy: { type, rollingUpdate: { maxSurge, maxUnavailable } } } } as never);
    expect([d(10, '25%', '25%'), d(3, '25%', '25%'), d(4, 2, 1), d(1, '0%', '10%'), d(4, 0, '30%'), d(5, '100%', '100%'), d(3, '25%', '25%', 'Recreate')]).toEqual([
      { surge: 3, unavailable: 2 }, { surge: 1, unavailable: 0 }, { surge: 2, unavailable: 1 }, { surge: 0, unavailable: 1 }, { surge: 0, unavailable: 1 }, { surge: 5, unavailable: 5 }, { surge: 0, unavailable: 0 }]);
  });
  it('scales the new ReplicaSet within maxSurge and the old one within maxUnavailable', () => {
    const s = go('kubectl apply -f k8s/surge.yaml', 'kubectl rollout status deploy/sg', 'kubectl set image deploy/sg sg=nginx:1.28', 'kubectl get rs', 'kubectl rollout status deploy/sg', 'kubectl events --for deploy/sg');
    expect(s.log[3].out).toEqual(['NAME            DESIRED   CURRENT   READY     AGE', 'sg-2wwxsbn28c   3         3         3         3s', 'sg-wzjpqsksdn   3         3         0         0s']);
    expect(s.log[4].out).toEqual(['Waiting for deployment "sg" rollout to finish: 3 out of 4 new replicas have been updated...', 'deployment "sg" successfully rolled out']);
    expect(events(s.log[5].out)).toEqual(['Scaled up replica set sg-2wwxsbn28c from 0 to 4', 'Scaled up replica set sg-wzjpqsksdn from 0 to 2', 'Scaled down replica set sg-2wwxsbn28c from 4 to 3',
      'Scaled up replica set sg-wzjpqsksdn from 2 to 3', 'Scaled down replica set sg-2wwxsbn28c from 3 to 2', 'Scaled up replica set sg-wzjpqsksdn from 3 to 4', 'Scaled down replica set sg-2wwxsbn28c from 2 to 1',
      'Scaled down replica set sg-2wwxsbn28c from 1 to 0']);
  });
  it('rollout status prints each new message of the status viewer while the clock moves', () => {
    const s = go('kubectl apply -f k8s/deploy.yaml', 'kubectl rollout status deploy/web', 'kubectl set image deploy/web web=nginx:1.28', 'kubectl rollout status deploy/web', 'date', 'kubectl rollout status deploy/web --watch=false');
    expect(s.log[1].out).toEqual(['Waiting for deployment "web" rollout to finish: 0 of 3 updated replicas are available...', 'deployment "web" successfully rolled out']);
    expect(s.log[3].out).toEqual(['Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...', 'Waiting for deployment "web" rollout to finish: 2 out of 3 new replicas have been updated...',
      'deployment "web" successfully rolled out']);
    expect(s.log[4].out).toEqual(['Tue Nov 24 10:00:07 UTC 2026']);
    expect(s.log[5].out).toEqual(['deployment "web" successfully rolled out']);
  });
  it('minReadySeconds holds a ready pod back from available', () => {
    const s = go('kubectl apply -f k8s/surge.yaml', 'kubectl rollout status deploy/sg', 'kubectl apply -f k8s/min.yaml', 'kubectl rollout status deploy/mr', 'kubectl set image deploy/mr mr=nginx:1.28', 'sleep 11',
      'kubectl get deploy mr', 'sleep 1', 'kubectl get deploy mr', 'kubectl rollout status deploy/mr', 'kubectl events --for deploy/mr');
    // nginx:1.28 is pulled in 2 s, then ready; available 10 s later, at 12 s.
    expect(s.log[6].out[1]).toMatch(/^mr\s+3\/2\s+1\s+2\s+21s$/);
    expect(s.log[8].out[1]).toMatch(/^mr\s+3\/2\s+2\s+2\s+22s$/);
    expect(s.log[9].out).toEqual(['Waiting for deployment "mr" rollout to finish: 1 old replicas are pending termination...', 'deployment "mr" successfully rolled out']);
    expect(s.log[10].out.slice(1).map(l => l.split(/\s{3,}/)[0])).toEqual(['32s', '22s', '10s', '10s', '0s']);
  });
  it('a rollout that makes no progress for progressDeadlineSeconds is ProgressDeadlineExceeded', () => {
    const s = go('kubectl apply -f k8s/dl.yaml', 'kubectl rollout status deploy/dl', 'kubectl set image deploy/dl dl=nginx:9.9', 'sleep 29', 'kubectl get deploy dl -o jsonpath={.status.conditions[1].reason}', 'sleep 1',
      'kubectl get deploy dl -o jsonpath={.status.conditions[1].message}', 'kubectl rollout status deploy/dl', 'kubectl set image deploy/dl dl=nginx:9.8', 'kubectl rollout status deploy/dl --timeout=10s', 'date');
    expect(s.log[4].out).toEqual(['ReplicaSetUpdated']);
    expect(s.log[6].out).toEqual(['ReplicaSet "dl-pwrhg8gpbx" has timed out progressing.']);
    expect([s.log[7].out, s.log[7].err, s.log[7].status]).toEqual([[], ['error: deployment "dl" exceeded its progress deadline'], 1]);
    expect([s.log[9].out, s.log[9].err, s.log[10].out]).toEqual([['Waiting for deployment "dl" rollout to finish: 1 out of 3 new replicas have been updated...'], ['error: timed out waiting for the condition'], ['Tue Nov 24 10:00:43 UTC 2026']]);
  });
  it('Recreate stops every old pod before the new ReplicaSet starts', () => {
    const s = go('kubectl apply -f k8s/rc.yaml', 'kubectl set image deploy/rc rc=nginx:1.28', 'kubectl get pods -l app=rc', 'kubectl rollout status deploy/rc', 'kubectl events --for deploy/rc', 'kubectl describe deploy rc');
    expect(s.log[2].out.slice(1).map(l => l.split(/\s+/)[2])).toEqual(['Terminating', 'Terminating']);
    expect(s.log[3].out).toEqual(['Waiting for deployment "rc" rollout to finish: 0 out of 2 new replicas have been updated...', 'Waiting for deployment "rc" rollout to finish: 0 of 2 updated replicas are available...',
      'deployment "rc" successfully rolled out']);
    expect(s.log[4].out.slice(1).map(l => l.split(/\s{3,}/).slice(0, 1).concat(l.split(/\s{3,}/).slice(-1)).join(' '))).toEqual(['5s Scaled up replica set rc-bdtm9v7bct from 0 to 2', '5s Scaled down replica set rc-bdtm9v7bct from 2 to 0',
      '2s Scaled up replica set rc-x9dkcv9xgd from 0 to 2']);
    expect(s.log[5].out).toEqual(expect.arrayContaining(['StrategyType:       Recreate', 'OldReplicaSets:  <none>', 'NewReplicaSet:   rc-x9dkcv9xgd (2/2 replicas created)']));
    expect(s.log[5].out).not.toContain('RollingUpdateStrategy');
  });
});

describe('kubectl rollout', () => {
  it('history lists the revisions with their change-cause; --revision prints a template', () => {
    const s = go('kubectl apply -f k8s/deploy.yaml', 'kubectl rollout status deploy/web', 'kubectl annotate deploy web kubernetes.io/change-cause="first"', 'kubectl set image deploy/web web=nginx:1.28',
      'kubectl annotate deploy web kubernetes.io/change-cause="to 1.28" --overwrite', 'kubectl rollout history deploy/web', 'kubectl rollout history deploy/web --revision=1', 'kubectl rollout history deploy/web --revision=7');
    expect(s.log[5].out).toEqual(['deployment.apps/web ', 'REVISION  CHANGE-CAUSE', '1         first', '2         to 1.28', '']);
    expect(s.log[6].out).toEqual(['deployment.apps/web with revision #1', 'Pod Template:', '  Labels:  app=web', '           pod-template-hash=lsqv6sj66d', '  Containers:', '   web:',
      '    Image:         nginx:1.27', '    Port:          <none>', '    Host Port:     <none>', '    Environment:   <none>', '    Mounts:        <none>', '  Volumes:         <none>', '  Node-Selectors:  <none>', '  Tolerations:     <none>', '']);
    expect(s.log[7].err).toEqual(['error: unable to find the specified revision']);
  });
  it('undo puts a revision back as the newest; revisionHistoryLimit drops old ReplicaSets', () => {
    const s = go('kubectl apply -f k8s/hist.yaml', 'kubectl set image deploy/h h=nginx:1.27', 'kubectl rollout status deploy/h', 'kubectl set image deploy/h h=nginx:1.28', 'kubectl rollout status deploy/h', 'kubectl get rs',
      'kubectl rollout history deploy/h', 'kubectl rollout undo deploy/h --to-revision=1', 'kubectl rollout undo deploy/h', 'kubectl rollout undo deploy/h --to-revision=4', 'kubectl rollout history deploy/h',
      'kubectl get deploy h -o jsonpath={.spec.template.spec.containers[0].image}');
    expect(s.log[5].out.slice(1).map(l => l.split(/\s+/).slice(1, 3).join(' '))).toEqual(['1 1', '0 0']);
    expect(s.log[6].out.slice(1, 4)).toEqual(['REVISION  CHANGE-CAUSE', '2         <none>', '3         <none>']);
    expect([...s.log[7].err, ...s.log[8].out, ...s.log[9].out]).toEqual(['error: unable to find specified revision 1 in history', 'deployment.apps/h rolled back', 'deployment.apps/h skipped rollback (current template already matches revision 4)']);
    expect(s.log[10].out.slice(2, 4)).toEqual(['3         <none>', '4         <none>']);
    expect(s.log[11].out).toEqual(['nginx:1.27']);
  });
  it('pause holds the template back, resume rolls it out, restart stamps the template', () => {
    const s = go('kubectl apply -f k8s/deploy.yaml', 'kubectl rollout status deploy/web', 'kubectl rollout pause deploy/web', 'kubectl rollout pause deploy/web', 'kubectl set image deploy/web web=nginx:1.28',
      'kubectl get deploy web', 'kubectl rollout restart deploy/web', 'kubectl rollout undo deploy/web', "kubectl get deploy web -o jsonpath='{.status.conditions[1].reason} {.spec.paused}'", 'kubectl rollout resume deploy/web',
      'kubectl rollout resume deploy/web', 'kubectl rollout status deploy/web', 'kubectl rollout restart deploy/web', 'kubectl get deploy web -o jsonpath={.spec.template.metadata.annotations}', 'kubectl rollout status deploy/web', 'kubectl rollout history deploy/web');
    expect([s.log[2].out, s.log[3].err]).toEqual([['deployment.apps/web paused'], ['error: deployments.apps "web" is already paused']]);
    expect(s.log[5].out[1]).toMatch(/^web\s+3\/3\s+0\s+3\s+3s$/);
    expect([...s.log[6].err, ...s.log[7].err]).toEqual(['error: deployments.apps "web" can\'t restart paused deployment (run rollout resume first)', "error: you cannot rollback a paused deployment; resume it first with 'kubectl rollout resume deployment.apps/web' and try again"]);
    expect(s.log[8].out).toEqual(['DeploymentPaused true']);
    expect([s.log[9].out, s.log[10].err, s.log[11].out.at(-1)]).toEqual([['deployment.apps/web resumed'], ['error: deployments.apps "web" is not paused'], 'deployment "web" successfully rolled out']);
    expect([s.log[12].out, s.log[13].out]).toEqual([['deployment.apps/web restarted'], ['{"kubectl.kubernetes.io/restartedAt":"2026-11-24T10:00:07Z"}']]);
    expect(s.log[15].out.slice(2, 5).map(l => l.split(' ')[0])).toEqual(['1', '2', '3']);
  });
  it('delete cascades in the background unless --cascade=orphan; get all shows the workloads', () => {
    const s = go('kubectl apply -f k8s/deploy.yaml', 'kubectl get all', 'kubectl delete deploy web --cascade=orphan', 'kubectl get rs -o jsonpath={.items[0].metadata.ownerReferences}', 'kubectl delete rs --all',
      'kubectl get rs,pods', 'kubectl delete deploy nope --cascade=sideways');
    expect(s.log[1].out.filter(l => /^(pod|service|deployment\.apps|replicaset\.apps)\//.test(l)).map(l => l.split('/')[0])).toEqual(['pod', 'pod', 'pod', 'pod', 'service', 'deployment.apps', 'replicaset.apps']);
    expect([s.log[2].out, s.log[3].out, s.log[4].out]).toEqual([['deployment.apps "web" deleted'], [], ['replicaset.apps "web-lsqv6sj66d" deleted']]);
    expect(s.log[5].out).toEqual(['NAME        READY     STATUS    RESTARTS   AGE', 'pod/hello   1/1       Running   0          2m']);
    expect(s.log[6].err).toEqual(['error: invalid cascade value (sideways). Must be "background", "foreground", or "orphan".']);
  });
});

describe('group-qualified type names', () => {
  it('accepts the names -o name prints (replicaset.apps/x, deployment.apps/x) and keeps refusing core types with a group', () => {
    const s = go('kubectl apply -f k8s/rs.yaml', 'kubectl apply -f k8s/deploy.yaml', 'sleep 5', 'kubectl get rs solo -o name', 'kubectl scale replicaset.apps/solo --replicas=3',
      'kubectl scale $(kubectl get deploy web -o name) --replicas=1', 'kubectl get pods.apps');
    expect(s.log[3].out).toEqual(['replicaset.apps/solo']);
    expect(s.log[4].out).toEqual(['replicaset.apps/solo scaled']);
    expect(s.log[5].out).toEqual(['deployment.apps/web scaled']);
    expect(s.log[6].err).toEqual(['error: the server doesn\'t have a resource type "pods.apps"']);
  });
});

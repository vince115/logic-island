import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, describeCheck, terminalContentProblems, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { ingressLab } from './support/ingress-fixture';
import { sto, stoOn, storageLab, sts, withStorageFiles } from './support/storage-fixture';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §6): the StatefulSet controller — OrderedReady (each pod
 * after the one before is Running and Ready) and Parallel, stable names, labels, hostnames and DNS through the headless
 * Service, a claim per volumeClaimTemplate kept across pod deletion, scale-down (highest ordinal first) and deletion
 * unless the retention policy says Delete, RollingUpdate in reverse ordinal order down to the partition, OnDelete,
 * kubectl get/describe/scale/rollout status/restart, the API server's validation, the kube-workload check, determinism.
 */
const cols = (line: string) => line.trim().split(/\s{2,}/);
const msgs = (lines: string[]) => lines.slice(1).map(l => cols(l).at(-1));
const lab = withStorageFiles(storageLab, {
  'par.yaml': sts(3, ['podManagementPolicy: Parallel']),
  'gone.yaml': sts(3, ['persistentVolumeClaimRetentionPolicy:', '  whenScaled: Delete', '  whenDeleted: Delete']),
  'v2.yaml': sts(3, ['updateStrategy:', '  rollingUpdate:', '    partition: 1'], 'team/pg:1.0'),
  'v3.yaml': sts(3, [], 'team/pg:1.0'),
  'ondel.yaml': sts(3, ['updateStrategy:', '  type: OnDelete']), 'ondel2.yaml': sts(3, ['updateStrategy:', '  type: OnDelete'], 'team/pg:1.0'),
  'svc2.yaml': sts(3).replace('serviceName: web', 'serviceName: other'),
  'bad.yaml': sts(2, ['podManagementPolicy: Fast', 'updateStrategy:', '  type: Later', '  rollingUpdate:', '    partition: -1']).replace('storage: 1Gi', 'storage: lots'),
});
const UP = ['kubectl apply -f k8s/sts.yaml', 'sleep 6'];

describe('StatefulSet pods: order, names, DNS and claims', () => {
  it('creates web-0, web-1, web-2 one at a time (each after the one before is Ready); Parallel creates them at once', () => {
    const s = sto('kubectl apply -f k8s/sts.yaml', 'sleep 1', 'kubectl get pods -l app=web', 'sleep 2', 'kubectl get pods -l app=web', 'kubectl get sts', 'kubectl rollout status sts/web', 'kubectl get sts -o wide', 'kubectl events --for sts/web');
    expect(s.log[2].out.slice(1).map(l => cols(l).slice(0, 3))).toEqual([['web-0', '0/1', 'ContainerCreating']]);
    expect(s.log[4].out.slice(1).map(l => cols(l).slice(0, 3))).toEqual([['web-0', '1/1', 'Running'], ['web-1', '0/1', 'ContainerCreating']]);
    expect(s.log[5].out).toEqual(['NAME      READY     AGE', 'web       1/3       3s']);
    // web-1 is Ready at 4 s and web-2 at once after it (node-01 has the image by then): one message less.
    expect(s.log[6].out).toEqual(['Waiting for 2 pods to be ready...', 'partitioned roll out complete: 3 new pods have been updated...']);
    expect(s.log[7].out).toEqual(['NAME      READY     AGE       CONTAINERS   IMAGES', 'web       3/3       4s        web          team/db:1.0']);
    expect(msgs(s.log[8].out)).toEqual(['create Claim data-web-0 Pod web-0 in StatefulSet web success', 'create Pod web-0 in StatefulSet web successful', 'create Claim data-web-1 Pod web-1 in StatefulSet web success',
      'create Pod web-1 in StatefulSet web successful', 'create Claim data-web-2 Pod web-2 in StatefulSet web success', 'create Pod web-2 in StatefulSet web successful']);
    const p = stoOn(lab, 'kubectl apply -f k8s/par.yaml', 'kubectl get pods -l app=web', 'kubectl get pvc');
    expect(p.log[1].out.slice(1).map(l => cols(l).slice(0, 3))).toEqual([['web-0', '0/1', 'ContainerCreating'], ['web-1', '0/1', 'ContainerCreating'], ['web-2', '0/1', 'ContainerCreating']]);
    expect(p.log[2].out.slice(1).map(l => cols(l).slice(0, 2))).toEqual([['data-web-0', 'Bound'], ['data-web-1', 'Bound'], ['data-web-2', 'Bound']]);
  });
  it('gives each pod its labels, hostname and subdomain, and a DNS name through the headless Service', () => {
    const s = sto(...UP, 'kubectl apply -f k8s/client.yaml', 'sleep 2', 'kubectl get pod web-1 -o jsonpath={.metadata.labels}', 'kubectl get pod web-1 -o jsonpath={.spec.hostname}/{.spec.subdomain}/{.spec.volumes[0].persistentVolumeClaim.claimName}',
      'kubectl exec client -- getent hosts web-1.web', 'kubectl exec client -- nslookup web-0.web.default.svc.cluster.local', 'kubectl exec web-2 -- cat /etc/hosts', 'kubectl exec web-2 -- hostname');
    expect(s.log[4].out[0]).toMatch(/^\{"app":"web","apps\.kubernetes\.io\/pod-index":"1","controller-revision-hash":"web-[a-z0-9]{10}","statefulset\.kubernetes\.io\/pod-name":"web-1"\}$/);
    expect(s.log[5].out).toEqual(['web-1/web/data-web-1']);
    const ip1 = cols(s.log[6].out[0])[0];
    expect(s.log[6].out).toEqual([`${ip1}      web-1.web.default.svc.cluster.local`]);
    expect(s.log[7].out.slice(3, 5)).toEqual(['Name:\tweb-0.web.default.svc.cluster.local', expect.stringMatching(/^Address: 10\.244\.\d+\.\d+$/)]);
    expect(s.log[8].out.at(-1)).toMatch(/^10\.244\.\d+\.\d+\tweb-2\.web\.default\.svc\.cluster\.local\tweb-2$/);
    expect(s.log[9].out).toEqual(['web-2']);
  });
  it('makes a deleted pod again with the same name, node and claim: its data is still there', () => {
    const s = sto(...UP, "kubectl exec web-0 -- sh -c 'echo zero > /data/id'", 'kubectl get pod web-0 -o wide', 'kubectl delete pod web-0', 'kubectl get pods -l app=web', 'kubectl get pod web-0 -o wide', 'kubectl exec web-0 -- cat /data/id');
    expect(s.log[5].out.slice(1).map(l => cols(l)[0])).toEqual(['web-0', 'web-1', 'web-2']);
    expect(cols(s.log[6].out[1])[6]).toBe(cols(s.log[3].out[1])[6]);
    expect(cols(s.log[6].out[1])[5]).not.toBe(cols(s.log[3].out[1])[5].replace(/./, 'x'));
    expect(s.log[7].out).toEqual(['zero']);
  });
  it('scales down from the highest ordinal and keeps the claims; scaling up again finds the data', () => {
    const s = sto(...UP, "kubectl exec web-2 -- sh -c 'echo two > /data/id'", 'kubectl scale sts web --replicas=1', 'kubectl get pods -l app=web', 'kubectl get pvc', 'kubectl events --for sts/web --types=Normal',
      'kubectl scale statefulset/web --replicas=3', 'sleep 4', 'kubectl exec web-2 -- cat /data/id');
    expect(s.log[3].out).toEqual(['statefulset.apps/web scaled']);
    expect(s.log[4].out.slice(1).map(l => cols(l)[0])).toEqual(['web-0']);
    expect(s.log[5].out.slice(1).map(l => cols(l).slice(0, 2))).toEqual([['data-web-0', 'Bound'], ['data-web-1', 'Bound'], ['data-web-2', 'Bound']]);
    expect(msgs(s.log[6].out).slice(-2)).toEqual(['delete Pod web-2 in StatefulSet web successful', 'delete Pod web-1 in StatefulSet web successful']);
    expect(s.log[9].out).toEqual(['two']);
  });
  it('deletes the claims with the pods when persistentVolumeClaimRetentionPolicy says Delete (and their volumes by Delete)', () => {
    const s = stoOn(lab, 'kubectl apply -f k8s/gone.yaml', 'sleep 6', 'kubectl get pvc data-web-0 -o jsonpath={.metadata.ownerReferences[0].kind}', 'kubectl scale sts web --replicas=1', 'sleep 1', 'kubectl get pvc',
      'kubectl delete sts web', 'sleep 1', 'kubectl get pvc,pv');
    expect(s.log[2].out).toEqual(['StatefulSet']);
    expect(s.log[5].out.slice(1).map(l => cols(l)[0])).toEqual(['data-web-0']);
    expect(s.log[8].err).toEqual(['No resources found in default namespace.']);
  });
});

describe('StatefulSet updates', () => {
  it('rolls pods in reverse ordinal order down to the partition; the status counts each revision', () => {
    const s = stoOn(lab, ...UP, 'kubectl get sts web -o jsonpath={.status.currentRevision}', 'kubectl apply -f k8s/v2.yaml', 'kubectl rollout status sts/web', 'kubectl get pods -l app=web -L controller-revision-hash',
      'kubectl get sts web -o jsonpath={.status}', 'kubectl events --for sts/web', 'kubectl apply -f k8s/v3.yaml', 'kubectl rollout status sts/web', 'kubectl get sts web -o jsonpath={.status.currentRevision}={.status.updateRevision}');
    const v1 = s.log[2].out[0];
    expect(s.log[4].out).toEqual(['partitioned roll out complete: 2 new pods have been updated...']);
    const revs = s.log[5].out.slice(1).map(l => cols(l).at(-1));
    expect(revs[0]).toBe(v1);
    expect(revs[1]).toBe(revs[2]);
    expect(revs[1]).not.toBe(v1);
    expect(JSON.parse(s.log[6].out[0])).toEqual({ availableReplicas: 3, collisionCount: 0, currentReplicas: 1, currentRevision: v1, observedGeneration: 2, readyReplicas: 3, replicas: 3, updateRevision: revs[1], updatedReplicas: 2 });
    // web-2 first, then web-1 (web-0 is below the partition); the creations count up on the events of the first ones.
    expect(msgs(s.log[7].out).slice(-2)).toEqual(['delete Pod web-2 in StatefulSet web successful', 'delete Pod web-1 in StatefulSet web successful']);
    expect(s.log[10].out).toEqual([`${revs[1]}=${revs[1]}`]);
  });
  it('OnDelete waits for the learner to delete pods; rollout restart and scale act on a StatefulSet; history is prose', () => {
    const s = stoOn(lab, 'kubectl apply -f k8s/ondel.yaml', 'sleep 6', 'kubectl apply -f k8s/ondel2.yaml', 'sleep 2', 'kubectl get pods -l app=web -o jsonpath={.items[*].spec.containers[0].image}', 'kubectl delete pod web-1', 'sleep 2',
      'kubectl get pods -l app=web -o jsonpath={.items[*].spec.containers[0].image}', 'kubectl rollout status sts/web');
    expect(s.log[4].out).toEqual(['team/db:1.0 team/db:1.0 team/db:1.0']);
    expect(s.log[7].out).toEqual(['team/db:1.0 team/pg:1.0 team/db:1.0']);
    expect(s.log[8].err).toEqual(['error: rollout status is only available for RollingUpdate strategy type']);
    const r = sto(...UP, 'kubectl rollout restart sts/web', 'kubectl rollout status sts/web', 'kubectl rollout history sts/web', 'kubectl rollout undo statefulset/web');
    expect(r.log[2].out).toEqual(['statefulset.apps/web restarted']);
    expect(r.log[3].out.at(-1)).toBe('partitioned roll out complete: 3 new pods have been updated...');
    expect([r.log[4].err, r.log[5].err]).toEqual([['（模擬環境：kubectl rollout history 只模擬 Deployment；StatefulSet 只模擬 status 與 restart）'], ['（模擬環境：kubectl rollout undo 只模擬 Deployment；StatefulSet 只模擬 status 與 restart）']]);
  });
  it('validates a StatefulSet and refuses changes to its fixed fields', () => {
    const s = stoOn(lab, 'kubectl apply -f k8s/bad.yaml', ...UP, 'kubectl apply -f k8s/svc2.yaml');
    expect(s.log[0].out).toEqual(['service/web created']);
    expect(s.log[0].err).toEqual(['The StatefulSet "web" is invalid: ', '* spec.podManagementPolicy: Invalid value: "Fast": must be \'OrderedReady\' or \'Parallel\'',
      '* spec.updateStrategy: Invalid value: apps.StatefulSetUpdateStrategy{Type:"Later", RollingUpdate:(*apps.RollingUpdateStatefulSetStrategy)(nil)}: must be \'RollingUpdate\' or \'OnDelete\'',
      '* spec.updateStrategy.rollingUpdate.partition: Invalid value: -1: must be greater than or equal to 0',
      '* spec.volumeClaimTemplates[0].spec.resources.requests[storage]: Invalid value: "lots": quantities must match the regular expression \'^([+-]?[0-9.]+)([eEinumkKMGTP]*[-+]?[0-9]*)$\'']);
    expect(s.log[3].err).toEqual(["The StatefulSet \"web\" is invalid: spec: Forbidden: updates to statefulset spec for fields other than 'replicas', 'ordinals', 'template', 'updateStrategy', 'revisionHistoryLimit', 'persistentVolumeClaimRetentionPolicy' and 'minReadySeconds' are forbidden"]);
  });
  it('describes a StatefulSet and lists it in get all', () => {
    const s = sto(...UP, 'kubectl describe sts web', 'kubectl get all');
    expect(s.log[2].out.slice(0, 12)).toEqual(['Name:               web', 'Namespace:          default', 'CreationTimestamp:  Tue, 24 Nov 2026 10:00:00 +0000', 'Selector:           app=web', 'Labels:             <none>',
      'Annotations:        <none>', 'Replicas:           3 desired | 3 total', 'Update Strategy:    RollingUpdate', '  Partition:        0', 'Pods Status:        3 Running / 0 Waiting / 0 Succeeded / 0 Failed', 'Pod Template:', '  Labels:  app=web']);
    const claims = s.log[2].out.indexOf('Volume Claims:');
    expect(s.log[2].out.slice(claims, claims + 7)).toEqual(['Volume Claims:', '  Name:          data', '  StorageClass:  ', '  Labels:        <none>', '  Annotations:   <none>', '  Capacity:      1Gi', '  Access Modes:  [ReadWriteOnce]']);
    expect(s.log[3].out.slice(-2)).toEqual(['NAME                   READY     AGE', 'statefulset.apps/web   3/3       6s']);
  });
  it('replays the same way', () => {
    const run = () => JSON.stringify(sto(...UP, 'kubectl apply -f k8s/v3.yaml', 'sleep 2', 'kubectl get pods,pvc,pv -o wide', 'kubectl describe sts web').log);
    expect(run()).toBe(run());
  });
});

describe('the kube-workload check of a StatefulSet', () => {
  const ex = (checks: TerminalCheck[], solution: string[], m: TerminalMachine = storageLab) => ({ id: 'x', title: 'x', machine: m.id, statement: 'x', checks, solution, mistakes: [{ commands: ['true'], why: 'x' }], hints: [], explanation: 'x' });
  const run = (checks: TerminalCheck[], solution: string[]) => checkTerminalExercise(ex(checks, solution, lab), [lab], solution).results.map(r => r.ok ? 'ok' : r.message.split('，但')[1]);
  it('reads replicas, ready pods and whether every pod has the new revision', () => {
    const c: TerminalCheck[] = [{ kind: 'kube-workload', resource: 'StatefulSet', name: 'web', replicas: 3, readyReplicas: 3, rolledOut: true }];
    expect(run(c, UP)).toEqual(['ok']);
    expect(run(c, ['kubectl apply -f k8s/sts.yaml', 'sleep 1'])).toEqual(['web 的 就緒的 Pod 是 0']);
    expect(run(c, [...UP, 'kubectl apply -f k8s/v2.yaml'])[0]).toMatch(/^web 還有 Pod 是舊的 revision（currentRevision web-[a-z0-9]{10}，updateRevision web-[a-z0-9]{10}）$/);
    expect(describeCheck(c[0])).toBe('default 命名空間應該有名為 web 的 StatefulSet（spec.replicas 3、就緒的 Pod 3、所有 Pod 都是新的 revision）');
    const problems = (k: TerminalCheck, m: TerminalMachine = storageLab) => terminalContentProblems({ machines: [m], examples: [], exercises: [ex([k], ['true'], m)] });
    expect(problems({ kind: 'kube-workload', resource: 'StatefulSet', name: 'web', paused: true })).toContain('exercise x: a StatefulSet has no revision number, paused or condition (use currentRevision, updateRevision, rolledOut)');
    expect(problems({ kind: 'kube-workload', resource: 'StatefulSet', name: 'web' }, ingressLab)).toContain('exercise x: a kube-workload check of a StatefulSet needs a kube-storage machine (engine stage E38)');
  });
});

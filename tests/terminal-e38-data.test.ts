import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, type TerminalCheck } from '@/lib/terminal/lesson';
import { pvc, sc, sto, stoOn, storageLab, user, withStorageFiles } from './support/storage-fixture';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §4, §5, §7): what pods see of their volumes — a claim's
 * file tree that outlives the pod, an emptyDir that dies with it, read-only mounts, the E24 program's writes and the main
 * shell line's — the scheduler's volume messages (a missing or unbound claim, node affinity, ReadWriteOncePod), the
 * Multi-Attach error of an attachable ReadWriteOnce volume and its release, backups with tar through kubectl exec and
 * restores from standard input, kubectl cp both ways, and the kube-pod check's file inside a volume.
 */
const cols = (line: string) => line.trim().split(/\s{2,}/);
const events = (lines: string[]) => lines.slice(lines.findIndex(l => l.startsWith('Events:')) + 3).map(l => l.trim().split(/\s{2,}/).join(' | '));
const FAST = 'kubectl apply -f k8s/fast.yaml -f k8s/pvc.yaml';
const pinned = (name: string, node: string, claim = 'data', more: string[] = []) => user(name, [['d', claim, '/data']], [], 'team/db:1.0', [`nodeName: ${node}`, ...more]);
const lab = withStorageFiles(storageLab, {
  'a.yaml': pinned('a', 'node-01'), 'b.yaml': pinned('b', 'node-02'), 'ro.yaml': user('ro', [['d', 'data', '/data']]).replace('mountPath: /data', 'mountPath: /data\n      readOnly: true'),
  'pg.yaml': user('pg', [['d', 'data', '/var/lib/pg/data']], [], 'team/pg:1.0'), 'pgro.yaml': user('pgro', [['d', 'data', '/var/lib/pg/data']], [], 'team/pg:1.0').replace('claimName: data', 'claimName: data\n      readOnly: true'),
  'boot.yaml': user('boot', [['d', 'data', '/data']], ['command: ["sh", "-c", "echo booted > /data/boot; sleep 3600"]']),
  'ed.yaml': ['apiVersion: v1', 'kind: Pod', 'metadata:', '  name: ed', 'spec:', '  containers:', '  - name: ed', '    image: team/db:1.0', '    volumeMounts:', '    - name: cache', '      mountPath: /cache', '  volumes:',
    '  - name: cache', '    emptyDir: {}', ''].join('\n'),
  'nope.yaml': user('n', [['d', 'nope', '/data']]), 'nope-pvc.yaml': pvc('nope', 'fast'), 'ext.yaml': sc('ext', 'ext.example.com') + '---\n' + pvc('ext', 'ext') + '---\n' + user('e', [['d', 'ext', '/data']]),
  'wext.yaml': sc('wext', 'ext.example.com', ['volumeBindingMode: WaitForFirstConsumer']) + '---\n' + pvc('wext', 'wext') + '---\n' + user('w', [['d', 'wext', '/data']]),
  'once.yaml': pvc('once', 'fast', '1Gi', ['ReadWriteOncePod']) + '---\n' + user('o1', [['d', 'once', '/data']]), 'o2.yaml': user('o2', [['d', 'once', '/data']]),
  'busy.yaml': ['apiVersion: v1', 'kind: Pod', 'metadata:', '  name: busy', 'spec:', '  containers:', '  - name: busy', '    image: busybox:1.36', '    command: ["sleep", "3600"]', ''].join('\n'),
});

describe('data in volumes', () => {
  it('keeps a claim\'s files when the pod is deleted; an emptyDir lives and dies with its pod', () => {
    const s = stoOn(lab, FAST, 'kubectl apply -f k8s/writer.yaml -f k8s/ed.yaml', 'sleep 3', "kubectl exec writer -- sh -c 'mkdir /data/db; echo hello > /data/db/x.txt'", "kubectl exec ed -- sh -c 'echo tmp > /cache/t'",
      'kubectl exec ed -- ls -ld /cache', 'kubectl delete pod writer ed', 'kubectl apply -f k8s/writer.yaml -f k8s/ed.yaml', 'sleep 3', 'kubectl exec writer -- cat /data/db/x.txt', 'kubectl exec ed -- ls /cache');
    expect(s.log[5].out).toEqual(['drwxrwxrwx root    root     4096 /cache']);
    expect([s.log[9].out, s.log[10].out, s.log[10].status]).toEqual([['hello'], [], 0]);
  });
  it('writes the main shell line\'s files and the E24 program\'s writes to the volume; a read-only mount refuses them', () => {
    // One pod at a time: data is a ReadWriteOnce network disk (two nodes would be Multi-Attach).
    const s = stoOn(lab, FAST, 'kubectl apply -f k8s/boot.yaml', 'sleep 3', 'kubectl delete pod boot', 'kubectl apply -f k8s/pg.yaml', 'sleep 3', 'kubectl exec pg -- ls /var/lib/pg/data', 'kubectl delete pod pg',
      'kubectl apply -f k8s/ro.yaml', 'sleep 3', 'kubectl exec ro -- ls /data', "kubectl exec ro -- sh -c 'echo x > /data/y'", 'kubectl exec ro -- touch /data/z', 'kubectl delete pod ro', 'kubectl apply -f k8s/pgro.yaml', 'sleep 3',
      'kubectl logs pgro', 'kubectl get pod pgro');
    expect(s.log[6].out).toEqual(['PG_VERSION', 'boot']);
    expect(s.log[10].out).toEqual(['PG_VERSION', 'boot']);
    expect([s.log[11].err, s.log[11].status]).toEqual([['sh: 1: cannot create /data/y: Read-only file system', 'command terminated with exit code 1'], 1]);
    expect(s.log[12].err[0]).toBe("touch: cannot touch '/data/z': Read-only file system");
    expect(s.log[16].out).toEqual(['FATAL: could not write PG_VERSION: Read-only file system']);
    expect(cols(s.log[17].out[1]).slice(0, 3)).toEqual(['pgro', '0/1', expect.stringMatching(/^(Error|CrashLoopBackOff)$/)]);
    expect(stoOn(lab, FAST, 'kubectl apply -f k8s/ro.yaml', 'sleep 3', 'kubectl describe pod ro').log[3].out.filter(l => /\/data from|ClaimName|ReadOnly/.test(l)).map(l => l.trim()))
      .toEqual(['/data from d (ro)', 'ClaimName:  data', 'ReadOnly:   false']);
  });
  it('the kube-pod check reads a file inside a pod\'s volume', () => {
    const c: TerminalCheck[] = [{ kind: 'kube-pod', name: 'writer', file: { path: '/data/x.txt', content: 'hello' } }];
    const ex = (solution: string[]) => checkTerminalExercise({ id: 'x', title: 'x', machine: lab.id, statement: 'x', checks: c, solution, mistakes: [{ commands: ['true'], why: 'x' }], hints: [], explanation: 'x' }, [lab], solution)
      .results.map(r => r.ok ? 'ok' : r.message.split('，但')[1]);
    expect(ex([FAST, 'kubectl apply -f k8s/writer.yaml', 'sleep 3', "kubectl exec writer -- sh -c 'echo hello > /data/x.txt'"])).toEqual(['ok']);
    expect(ex([FAST, 'kubectl apply -f k8s/writer.yaml', 'sleep 3'])).toEqual(['writer 的容器裡沒有 /data/x.txt']);
  });
});

describe('scheduling and attaching volumes', () => {
  it('cannot schedule a pod whose claim is missing or unbound (Immediate) until it is there', () => {
    const s = stoOn(lab, 'kubectl apply -f k8s/fast.yaml -f k8s/nope.yaml', 'kubectl describe pod n', 'kubectl apply -f k8s/nope-pvc.yaml', 'sleep 3', 'kubectl get pod n', 'kubectl apply -f k8s/ext.yaml', 'kubectl describe pod e');
    expect(events(s.log[1].out)).toEqual(['Warning | FailedScheduling | 0s | default-scheduler | 0/3 nodes are available: persistentvolumeclaim "nope" not found. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling.']);
    expect(cols(s.log[4].out[1]).slice(0, 3)).toEqual(['n', '1/1', 'Running']);
    expect(events(s.log[6].out)).toEqual(['Warning | FailedScheduling | 0s | default-scheduler | 0/3 nodes are available: pod has unbound immediate PersistentVolumeClaims. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling.']);
  });
  it('follows a local volume\'s node affinity (a cordoned node: the pod waits); a ReadWriteOncePod claim takes one pod', () => {
    const s = sto('kubectl apply -f k8s/sts.yaml', 'sleep 10', 'kubectl get pod web-0 -o wide', 'kubectl cordon node-01', 'kubectl delete pod web-0', 'kubectl describe pod web-0');
    expect(cols(s.log[2].out[1])[6]).toBe('node-01');
    expect(events(s.log[5].out)).toEqual(['Warning | FailedScheduling | 0s | default-scheduler | 0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 1 node(s) had volume node affinity conflict, 1 node(s) were unschedulable. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling.']);
    const r = stoOn(lab, 'kubectl apply -f k8s/fast.yaml -f k8s/once.yaml', 'sleep 3', 'kubectl apply -f k8s/o2.yaml', 'kubectl describe pod o2');
    expect(events(r.log[3].out)).toEqual(['Warning | FailedScheduling | 0s | default-scheduler | 0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 node has pod using PersistentVolumeClaim with the same name and ReadWriteOncePod access mode. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod.']);
  });
  it('waits, unscheduled, for a WaitForFirstConsumer claim whose provisioner is not running', () => {
    const s = stoOn(lab, 'kubectl apply -f k8s/wext.yaml', 'sleep 30', 'kubectl get pod w', 'kubectl describe pvc wext', 'kubectl describe pod w');
    expect(cols(s.log[2].out[1]).slice(0, 3)).toEqual(['w', '0/1', 'Pending']);
    expect(s.log[3].out.find(l => l.includes('selected-node'))?.trim()).toMatch(/^volume\.kubernetes\.io\/selected-node: node-0[12]$/);
    expect(events(s.log[3].out)).toEqual(['Normal | WaitForPodScheduled | 30s | persistentvolume-controller | waiting for pod w to be scheduled', "Normal | ExternalProvisioning | 30s | persistentvolume-controller | Waiting for a volume to be created either by the external provisioner 'ext.example.com' or manually by the system administrator. If volume creation is delayed, please verify that the provisioner is running and correctly registered."]);
    expect(s.log[4].out.at(-1)).toMatch(/^Events:\s+<none>$/);
  });
  it('gives a second node the Multi-Attach error for a ReadWriteOnce network disk, and attaches it once the first pod is gone', () => {
    const s = stoOn(lab, FAST, 'kubectl apply -f k8s/a.yaml -f k8s/b.yaml', 'sleep 5', 'kubectl get pods a b', 'kubectl describe pod b', 'kubectl describe pod a', 'kubectl delete pod a', 'sleep 3', 'kubectl get pod b', 'kubectl describe pod b');
    expect(s.log[3].out.slice(1).map(l => cols(l).slice(0, 3))).toEqual([['a', '1/1', 'Running'], ['b', '0/1', 'ContainerCreating']]);
    const pv = /pvc-[0-9a-f-]{36}/.exec(s.log[4].out.join('\n'))![0];
    expect(events(s.log[4].out)).toEqual([`Warning | FailedAttachVolume | 5s | attachdetach-controller | Multi-Attach error for volume "${pv}" Volume is already used by pod(s) a`]);
    expect(events(s.log[5].out)[0]).toBe(`Normal | SuccessfulAttachVolume | 5s | attachdetach-controller | AttachVolume.Attach succeeded for volume "${pv}"`);
    expect(cols(s.log[8].out[1]).slice(0, 3)).toEqual(['b', '1/1', 'Running']);
    expect(events(s.log[9].out).slice(1, 3)).toEqual([`Normal | SuccessfulAttachVolume | 3s | attachdetach-controller | AttachVolume.Attach succeeded for volume "${pv}"`, 'Normal | Pulling | 3s | kubelet | Pulling image "team/db:1.0"']);
  });
});

describe('backups: tar through kubectl exec, and kubectl cp', () => {
  const up = [FAST, 'kubectl apply -f k8s/writer.yaml', 'sleep 3', "kubectl exec writer -- sh -c 'mkdir /data/db; echo row1 > /data/db/t1'"];
  it('streams tar czf - to the workstation and restores it from standard input with -i', () => {
    const s = stoOn(lab, ...up, 'kubectl exec writer -- tar czf - /data > backup.tgz', 'tar tzvf backup.tgz', "kubectl exec writer -- sh -c 'rm -r /data/db'", 'kubectl exec -i writer -- tar xzvf - -C / < backup.tgz',
      'kubectl exec writer -- cat /data/db/t1', 'kubectl exec writer -- tar xzf - -C /');
    expect([s.log[4].out, s.log[4].err]).toEqual([[], ["tar: Removing leading `/' from member names"]]);
    expect(s.log[5].out.map(l => l.replace(/ \d{4}-\d\d-\d\d \d\d:\d\d /, ' T '))).toEqual(['drwxr-xr-x root/root         0 T data/', 'drwxr-xr-x root/root         0 T data/db/', '-rw-r--r-- root/root         5 T data/db/t1']);
    expect([s.log[7].out, s.log[7].err]).toEqual([['data/', 'data/db/', 'data/db/t1'], []]);
    expect(s.log[8].out).toEqual(['row1']);
    expect([s.log[9].err, s.log[9].status]).toEqual([['tar: This does not look like a tar archive', 'tar: Exiting with failure status due to previous errors', 'command terminated with exit code 2'], 2]);
  });
  it('kubectl cp copies files and folders both ways, with tar\'s warning and kubectl\'s errors', () => {
    const s = stoOn(lab, ...up, 'kubectl cp writer:/data/db/t1 ./t1.txt', 'cat t1.txt', 'kubectl cp writer:/data ./bk', 'ls bk bk/db', 'echo hi > hi.txt', 'kubectl cp hi.txt writer:/data/db/hi.txt', 'kubectl exec writer -- ls /data/db',
      'kubectl cp hi.txt writer:/nowhere/x', 'kubectl cp nope.txt writer:/data/x', 'kubectl cp writer:/data/nope ./x', 'kubectl cp a b', 'kubectl cp writer:/a writer:/b', 'kubectl cp hi.txt ghost:/x', 'kubectl cp hi.txt');
    expect([s.log[4].err, s.log[5].out]).toEqual([["tar: Removing leading `/' from member names"], ['row1']]);
    expect(s.log[7].out).toEqual(['bk:', 'db/', '', 'bk/db:', 't1']);
    expect(s.log[10].out).toEqual(['hi.txt', 't1']);
    expect(s.log.slice(11).map(l => l.err)).toEqual([['tar: /nowhere: Cannot open: No such file or directory', 'tar: Error is not recoverable: exiting now', 'command terminated with exit code 2'],
      ["error: nope.txt doesn't exist in local filesystem"], ["tar: Removing leading `/' from member names", 'tar: /data/nope: Cannot stat: No such file or directory', 'tar: Exiting with failure status due to previous errors'],
      ['error: one of src or dest must be a remote file specification'], ['error: one of src or dest must be a local file specification'], ['Error from server (NotFound): pods "ghost" not found'], ['error: source and destination are required']]);
    const ro = stoOn(lab, FAST, 'kubectl apply -f k8s/ro.yaml -f k8s/busy.yaml', 'sleep 3', 'echo hi > hi.txt', 'kubectl cp hi.txt ro:/data/hi.txt', 'kubectl cp hi.txt busy:/tmp/hi.txt');
    expect(ro.log[4].err).toEqual(['tar: hi.txt: Cannot open: Read-only file system', 'tar: Exiting with failure status due to previous errors', 'command terminated with exit code 2']);
    expect(ro.log[5].err[0]).toMatch(/^error: Internal error occurred: .*exec: "tar": executable file not found in \$PATH: unknown$/);
  });
});

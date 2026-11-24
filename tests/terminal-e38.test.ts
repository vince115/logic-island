import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, describeCheck, terminalContentProblems, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { INGRESS_PROFILE } from '@/lib/terminal/shell';
import { ingOn, ingressLab, withIngressFiles } from './support/ingress-fixture';
import { PV_YAML, pvc, sc, sto, stoOn, storageLab, user, withStorageFiles, withStorageKube } from './support/storage-fixture';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §1–§3, §8–§10): the kube-storage profile and its
 * boundary, the lesson's storage data, StorageClass, PersistentVolume and PersistentVolumeClaim (get, describe, the
 * DefaultStorageClass admission and the retroactive default), the binding controller (static and dynamic, Immediate and
 * WaitForFirstConsumer, the real Pending events), reclaim (Retain, Delete, a static Delete's Failed, Recycle), the
 * protection finalizers, expansion, the API server's validation, and the check kube-volume.
 */
const cols = (line: string) => line.trim().split(/\s{2,}/);
const events = (lines: string[]) => lines.slice(lines.findIndex(l => l.startsWith('Events:')) + 3).map(l => l.trim().split(/\s{2,}/).join(' | '));
const PROV = "Waiting for a volume to be created either by the external provisioner 'disk.csi.example.com' or manually by the system administrator. If volume creation is delayed, please verify that the provisioner is running and correctly registered.";
const FAST = ['kubectl apply -f k8s/fast.yaml -f k8s/pvc.yaml'];

describe('the kube-storage profile and its boundary', () => {
  it('adds no command; below it the kinds, types, kubectl cp, claim volumes and the lesson data name E38', () => {
    const files = { 'pvc.yaml': pvc('data', null), 'vol.yaml': user('v', [['d', 'data', '/data']]), 'sts.yaml': ['apiVersion: apps/v1', 'kind: StatefulSet', 'metadata:', '  name: web', ''].join('\n') };
    const s = ingOn(withIngressFiles(ingressLab, files), 'kubectl apply -f k8s/pvc.yaml', 'kubectl get pvc', 'kubectl get sc,pv', 'kubectl cp a b:/c', 'kubectl apply -f k8s/vol.yaml', 'kubectl apply -f k8s/sts.yaml', 'kubectl get sts');
    expect(s.log.map(l => l.err[0])).toEqual(['（模擬環境：PersistentVolumeClaim 要到引擎階段 E38 才模擬）', '（模擬環境：pvc 要到引擎階段 E38 才模擬）', '（模擬環境：sc 要到引擎階段 E38 才模擬）',
      '（模擬環境：kubectl cp 要到引擎階段 E38 才模擬）', '（模擬環境：spec.volumes[0] 要到引擎階段 E38 才模擬）', '（模擬環境：StatefulSet 要到引擎階段 E38 才模擬）', '（模擬環境：sts 要到引擎階段 E38 才模擬）']);
    const below = { ...storageLab, profile: 'ingress' as const };
    expect(terminalContentProblems({ machines: [below], examples: [], exercises: [] }, INGRESS_PROFILE)).toContain('machine kub-38: kube: storage needs the kube-storage profile (engine stage E38)');
    expect(terminalContentProblems({ machines: [storageLab], examples: [], exercises: [] })).toEqual([]);
  });
  it('checks the lesson data: provisioners and the PVs\' files', () => {
    const bad = (storage: object) => terminalContentProblems({ machines: [withStorageKube(storageLab, { storage } as never)], examples: [], exercises: [] });
    expect(bad({ provisioners: [{ name: 'Bad Name' }] })).toContain('machine kub-38: kube: storage.provisioners are at most 4 of { name: a provisioner such as local.example.com/local-path, local?: boolean }, each name once');
    expect(bad({ files: { 'pv-x': { '../x': 'a' } } })[0]).toMatch(/storage\.files maps at most 8 PersistentVolume names/);
    expect(bad({ files: { 'pv-x': { 'a.txt': 'a' } } })).toContain('machine kub-38: kube: storage.files: no PersistentVolume pv-x among the boot manifests');
  });
});

describe('StorageClasses, claims and dynamic provisioning', () => {
  it('prints the classes (the default one marked) and provisions an Immediate claim at once', () => {
    const s = sto(...FAST, 'kubectl get sc', 'kubectl get pvc,pv', 'kubectl describe pvc data', 'kubectl get pv -o wide');
    expect(s.log[1].out).toEqual(['NAME                   PROVISIONER                    RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE',
      'fast                   disk.csi.example.com           Delete          Immediate              true                   0s',
      'local-path (default)   local.example.com/local-path   Delete          WaitForFirstConsumer   false                  23d']);
    const [claims, , vols] = [s.log[2].out.slice(0, 2), '', s.log[2].out.slice(3)], pv = cols(claims[1])[2];
    expect(pv).toMatch(/^pvc-[0-9a-f-]{36}$/);
    expect(cols(claims[0])).toEqual(['NAME', 'STATUS', 'VOLUME', 'CAPACITY', 'ACCESS MODES', 'STORAGECLASS', 'VOLUMEATTRIBUTESCLASS', 'AGE']);
    expect(cols(claims[1])).toEqual(['persistentvolumeclaim/data', 'Bound', pv, '1Gi', 'RWO', 'fast', '<unset>', '0s']);
    expect(cols(vols[0])).toEqual(['NAME', 'CAPACITY', 'ACCESS MODES', 'RECLAIM POLICY', 'STATUS', 'CLAIM', 'STORAGECLASS', 'VOLUMEATTRIBUTESCLASS', 'REASON', 'AGE']);
    expect(cols(vols[1])).toEqual([`persistentvolume/${pv}`, '1Gi', 'RWO', 'Delete', 'Bound', 'default/data', 'fast', '<unset>', '0s']);
    expect(s.log[3].out.slice(0, 16)).toEqual(['Name:          data', 'Namespace:     default', 'StorageClass:  fast', 'Status:        Bound', `Volume:        ${pv}`, 'Labels:        <none>',
      'Annotations:   pv.kubernetes.io/bind-completed: yes', '               pv.kubernetes.io/bound-by-controller: yes', '               volume.beta.kubernetes.io/storage-provisioner: disk.csi.example.com',
      '               volume.kubernetes.io/storage-provisioner: disk.csi.example.com', 'Finalizers:    [kubernetes.io/pvc-protection]', 'Capacity:      1Gi', 'Access Modes:  RWO', 'VolumeMode:    Filesystem', 'Used By:       <none>', 'Events:']);
    expect(events(s.log[3].out)).toEqual([`Normal | ExternalProvisioning | 0s | persistentvolume-controller | ${PROV}`,
      'Normal | Provisioning | 0s | disk.csi.example.com_disk-provisioner-0 | External provisioner is provisioning volume for claim "default/data"',
      `Normal | ProvisioningSucceeded | 0s | disk.csi.example.com_disk-provisioner-0 | Successfully provisioned volume ${pv}`]);
    expect(cols(s.log[4].out[1]).at(-1)).toBe('Filesystem');
  });
  it('describes a provisioned volume (CSI) and a class', () => {
    const s = sto(...FAST, 'kubectl describe pv', 'kubectl describe sc local-path');
    expect(s.log[1].out.slice(1, 20).map(l => l.replace(/pvc-[0-9a-f-]{36}/, 'PV'))).toEqual(['Labels:          <none>', 'Annotations:     pv.kubernetes.io/provisioned-by: disk.csi.example.com', 'Finalizers:      [kubernetes.io/pv-protection]',
      'StorageClass:    fast', 'Status:          Bound', 'Claim:           default/data', 'Reclaim Policy:  Delete', 'Access Modes:    RWO', 'VolumeMode:      Filesystem', 'Capacity:        1Gi',
      'Node Affinity:   <none>', 'Message:         ', 'Source:', '    Type:              CSI (a Container Storage Interface (CSI) volume source)', '    Driver:            disk.csi.example.com',
      '    FSType:            ext4', '    VolumeHandle:      PV', '    ReadOnly:          false', '    VolumeAttributes:  <none>']);
    // labels.FormatLabels of every annotation: the last-applied JSON ends with a newline, so the next one starts a line.
    expect(s.log[2].out.slice(0, 10)).toEqual(['Name:                  local-path', 'IsDefaultClass:        Yes', expect.stringMatching(/^Annotations:           kubectl\.kubernetes\.io\/last-applied-configuration=\{"apiVersion":"storage\.k8s\.io\/v1".*\}$/), ',storageclass.kubernetes.io/is-default-class=true',
      'Provisioner:           local.example.com/local-path', 'Parameters:            <none>', 'AllowVolumeExpansion:  <unset>', 'MountOptions:          <none>', 'ReclaimPolicy:         Delete', 'VolumeBindingMode:     WaitForFirstConsumer']);
  });
  it('waits with the real events: no class, a missing class, a provisioner that is not running, no-provisioner', () => {
    const lab = withStorageFiles(storageLab, { 'a.yaml': pvc('none', ''), 'b.yaml': pvc('lost', 'gold'), 'c.yaml': sc('ext', 'ext.example.com') + '---\n' + pvc('ext', 'ext'),
      'd.yaml': sc('manual', 'kubernetes.io/no-provisioner') + '---\n' + pvc('man', 'manual') });
    const s = stoOn(lab, 'kubectl apply -f k8s/a.yaml -f k8s/b.yaml -f k8s/c.yaml -f k8s/d.yaml', 'sleep 30', 'kubectl get pvc', ...['none', 'lost', 'ext', 'man'].map(n => `kubectl describe pvc ${n}`));
    expect(s.log[2].out.slice(1).map(l => cols(l).slice(0, 3))).toEqual([['ext', 'Pending', 'ext'], ['lost', 'Pending', 'gold'], ['man', 'Pending', 'manual'], ['none', 'Pending', '<unset>']]);
    expect([3, 4, 5, 6].map(i => events(s.log[i].out))).toEqual([['Normal | FailedBinding | 30s | persistentvolume-controller | no persistent volumes available for this claim and no storage class is set'],
      ['Warning | ProvisioningFailed | 30s | persistentvolume-controller | storageclass.storage.k8s.io "gold" not found'],
      [`Normal | ExternalProvisioning | 30s | persistentvolume-controller | ${PROV.replace('disk.csi.example.com', 'ext.example.com')}`],
      ['Warning | ProvisioningFailed | 30s | persistentvolume-controller | no volume plugin matched name: kubernetes.io/no-provisioner']]);
  });
  it('gives a claim without storageClassName the default class at creation, and later when one appears', () => {
    const nodefault = withStorageKube(storageLab, { manifests: storageLab.kube!.manifests!.slice(0, -1) });
    const lab = withStorageFiles(nodefault, { 'c.yaml': pvc('c', null, '1Gi'), 'def.yaml': sc('std', 'disk.csi.example.com', [], ['storageclass.kubernetes.io/is-default-class: "true"']) });
    const s = stoOn(lab, 'kubectl apply -f k8s/c.yaml', 'kubectl get pvc c', 'kubectl apply -f k8s/def.yaml', 'kubectl get pvc c');
    expect(cols(s.log[1].out[1]).slice(0, 3)).toEqual(['c', 'Pending', '<unset>']);
    expect(cols(s.log[3].out[1]).slice(0, 2).concat(cols(s.log[3].out[1]).slice(4, 6))).toEqual(['c', 'Bound', 'RWO', 'std']);
    expect(cols(sto('kubectl apply -f k8s/sts.yaml', 'kubectl get pvc data-web-0').log[1].out[1])[5]).toBe('local-path');
  });
  it('binds a WaitForFirstConsumer claim when a pod of it is scheduled (selected-node, a local volume with node affinity)', () => {
    const lab = withStorageFiles(storageLab, { 'wf.yaml': pvc('wf', null), 'pod.yaml': user('p', [['d', 'wf', '/data']]) });
    const s = stoOn(lab, 'kubectl apply -f k8s/wf.yaml', 'kubectl describe pvc wf', 'kubectl apply -f k8s/pod.yaml', 'kubectl get pvc wf', 'kubectl describe pv', 'kubectl get pod p -o wide');
    expect(events(s.log[1].out)).toEqual(['Normal | WaitForFirstConsumer | 0s | persistentvolume-controller | waiting for first consumer to be created before binding']);
    expect(cols(s.log[3].out[1]).slice(0, 2)).toEqual(['wf', 'Bound']);
    const pv = s.log[4].out, node = cols(s.log[5].out[1])[6], at = pv.findIndex(l => l.startsWith('Node Affinity:'));
    expect(pv.slice(at, at + 8).map(l => l.replace(/pvc-[0-9a-f-]{36}/, 'PV').trimEnd())).toEqual(['Node Affinity:', '  Required Terms:', `    Term 0:        kubernetes.io/hostname in [${node}]`,
      'Message:', 'Source:', '    Type:          HostPath (bare host directory volume)', '    Path:          /opt/local-path-provisioner/PV_default_wf', '    HostPathType:  DirectoryOrCreate']);
  });
});

describe('static volumes, reclaim and protection', () => {
  const lab = withStorageFiles(storageLab, {
    'del.yaml': ['apiVersion: v1', 'kind: PersistentVolume', 'metadata:', '  name: pv-del', 'spec:', '  capacity:', '    storage: 1Gi', '  accessModes: ["ReadWriteOnce"]', '  persistentVolumeReclaimPolicy: Delete',
      '  hostPath:', '    path: /mnt/del', '---', pvc('cd', '', '1Gi')].join('\n'),
    'rec.yaml': ['apiVersion: v1', 'kind: PersistentVolume', 'metadata:', '  name: pv-rec', 'spec:', '  capacity:', '    storage: 3Gi', '  accessModes: ["ReadWriteMany"]', '  persistentVolumeReclaimPolicy: Recycle',
      '  storageClassName: slow', '  nfs:', '    server: 10.0.0.61', '    path: /r', '---', pvc('cr', 'slow', '1Gi', ['ReadWriteMany'])].join('\n'),
    'big.yaml': pvc('big', '', '10Gi', ['ReadWriteMany']), 'sel.yaml': pvc('sel', '', '1Gi', ['ReadWriteMany'], ['selector:', '  matchLabels:', '    tier: other']),
  });
  it('binds a "" claim to the smallest Available volume that fits; one too big or with another label stays Pending', () => {
    const s = stoOn(lab, 'kubectl apply -f k8s/pv.yaml -f k8s/big.yaml -f k8s/sel.yaml -f k8s/claim.yaml', 'kubectl get pv,pvc', 'kubectl describe pv pv-nfs');
    expect(s.log[1].out.filter(l => l.includes('pv-nfs') || l.includes('claim/')).map(l => cols(l).slice(0, 6))).toEqual([['persistentvolume/pv-nfs', '5Gi', 'RWX', 'Retain', 'Bound', 'default/shared'],
      ['persistentvolumeclaim/big', 'Pending', '<unset>', '0s'], ['persistentvolumeclaim/sel', 'Pending', '<unset>', '0s'], ['persistentvolumeclaim/shared', 'Bound', 'pv-nfs', '5Gi', 'RWX', '<unset>']]);
    expect(s.log[2].out.slice(0, 4)).toEqual(['Name:            pv-nfs', 'Labels:          tier=shared', 'Annotations:     pv.kubernetes.io/bound-by-controller: yes', 'Finalizers:      [kubernetes.io/pv-protection]']);
    expect(s.log[2].out.slice(12, 18)).toEqual(['Message:         ', 'Source:', '    Type:      NFS (an NFS mount)', '    Server:    10.0.0.60', '    Path:      /exports/shared', '    ReadOnly:  false']);
  });
  it('reclaims: Retain is Released (re-applied without claimRef it is Available), a static Delete Fails, Recycle empties it', () => {
    const noRef = PV_YAML.replace('spec:\n', 'spec:\n  claimRef: null\n');
    const s = stoOn(withStorageFiles(lab, { 'free.yaml': noRef }), 'kubectl apply -f k8s/pv.yaml -f k8s/claim.yaml -f k8s/del.yaml -f k8s/rec.yaml', 'kubectl delete pvc shared cd cr', 'kubectl get pv',
      'kubectl describe pv pv-del', 'kubectl apply -f k8s/free.yaml', 'kubectl get pv pv-nfs');
    expect(s.log[1].out).toEqual(['persistentvolumeclaim "shared" deleted', 'persistentvolumeclaim "cd" deleted', 'persistentvolumeclaim "cr" deleted']);
    expect(s.log[2].out.slice(1).map(l => cols(l).slice(0, 6))).toEqual([['pv-del', '1Gi', 'RWO', 'Delete', 'Failed', 'default/cd'], ['pv-nfs', '5Gi', 'RWX', 'Retain', 'Released', 'default/shared'],
      ['pv-rec', '3Gi', 'RWX', 'Recycle', 'Available', 'slow']]);
    expect(s.log[3].out.find(l => l.startsWith('Message:'))).toBe('Message:         error getting deleter volume plugin for volume "pv-del": no deletable volume plugin matched');
    expect(events(s.log[3].out)).toEqual(['Warning | VolumeFailedDelete | 0s | persistentvolume-controller | error getting deleter volume plugin for volume "pv-del": no deletable volume plugin matched']);
    expect(cols(s.log[5].out[1]).slice(0, 6)).toEqual(['pv-nfs', '5Gi', 'RWX', 'Retain', 'Available', '<unset>']);
  });
  it('deletes a provisioned volume (Delete) with its claim; keeps it Released with Retain', () => {
    const s = stoOn(withStorageFiles(lab, { 'k.yaml': pvc('k', 'keep') }), ...FAST, 'kubectl apply -f k8s/keep.yaml -f k8s/k.yaml', 'kubectl delete pvc data k', 'kubectl get pv');
    expect(s.log[3].out.slice(1).map(l => cols(l).slice(1, 5))).toEqual([['1Gi', 'RWO', 'Retain', 'Released']]);
  });
  it('keeps a claim a pod uses (and a volume still bound) Terminating until it is free', () => {
    const s = sto(...FAST, 'kubectl apply -f k8s/writer.yaml', 'sleep 3', 'kubectl delete pvc data', 'kubectl get pvc', 'kubectl describe pvc data', 'kubectl delete pod writer', 'kubectl get pvc,pv');
    expect(s.log[3].err).toEqual(['（模擬環境：Pod writer 還在使用 data，它會停在 Terminating 直到這些 Pod 刪除；真實的 kubectl delete 會一直等待）']);
    expect(cols(s.log[4].out[1]).slice(0, 2)).toEqual(['data', 'Terminating']);
    expect(s.log[5].out.slice(3, 4).concat(s.log[5].out.slice(14, 15))).toEqual(['Status:        Terminating (lasts 0s)', 'Used By:       writer']);
    expect(s.log[7].err).toEqual(['No resources found in default namespace.']);
    const p = sto(...FAST, 'kubectl delete pv --all', 'kubectl get pv', 'kubectl delete pvc data', 'kubectl get pv');
    expect(p.log[1].err[0]).toMatch(/^（模擬環境：pvc-[0-9a-f-]+ 還綁定著 PVC，它會停在 Terminating 直到 PVC 刪除；真實的 kubectl delete 會一直等待）$/);
    expect(cols(p.log[2].out[1])[4]).toBe('Terminating');
    expect(p.log[4].err).toEqual(['No resources found']);
  });
});

describe('validation, updates and expansion', () => {
  it('lists every error of a class, a volume and a claim; refuses what may not change', () => {
    const lab = withStorageFiles(storageLab, {
      'bad.yaml': ['apiVersion: storage.k8s.io/v1', 'kind: StorageClass', 'metadata:', '  name: bad', 'reclaimPolicy: Keep', 'volumeBindingMode: Later', '---', 'apiVersion: v1', 'kind: PersistentVolume', 'metadata:', '  name: pv-bad', 'spec:',
        '  accessModes: ["ReadWriteOncePod", "ReadWriteOnce"]', '  persistentVolumeReclaimPolicy: Keep', '  local:', '    path: /mnt', '---', pvc('c-bad', '', 'lots', ['Sometimes']), '---',
        'apiVersion: v1', 'kind: PersistentVolumeClaim', 'metadata:', '  name: blank', 'spec:', '  resources: {}', ''].join('\n'),
      'fast2.yaml': sc('fast', 'other.example.com', ['volumeBindingMode: WaitForFirstConsumer']), 'mode.yaml': pvc('data', 'fast', '1Gi', ['ReadWriteMany']),
      'grow.yaml': pvc('data', 'fast', '5Gi'), 'shrink.yaml': pvc('data', 'fast', '1Mi'), 'kgrow.yaml': pvc('k', 'keep', '2Gi'), 'k.yaml': pvc('k', 'keep'),
      'odd.yaml': pvc('odd', '', '1Gi', ['ReadWriteOnce'], ['volumeMode: Block']),
    });
    const s = stoOn(lab, 'kubectl apply -f k8s/bad.yaml', ...FAST, 'kubectl apply -f k8s/fast2.yaml', 'kubectl apply -f k8s/mode.yaml', 'kubectl apply -f k8s/grow.yaml', 'kubectl get pvc data -o jsonpath={.status.capacity.storage}',
      'kubectl apply -f k8s/shrink.yaml', 'kubectl apply -f k8s/keep.yaml -f k8s/k.yaml', 'kubectl apply -f k8s/kgrow.yaml', 'kubectl apply -f k8s/odd.yaml');
    expect(s.log[0].err).toEqual(['The StorageClass "bad" is invalid: ', '* provisioner: Required value', '* reclaimPolicy: Unsupported value: "Keep": supported values: "Delete", "Retain"',
      '* volumeBindingMode: Unsupported value: "Later": supported values: "Immediate", "WaitForFirstConsumer"', 'The PersistentVolume "pv-bad" is invalid: ', '* spec.capacity: Required value',
      '* spec.accessModes: Forbidden: may not use ReadWriteOncePod with other access modes', '* spec.persistentVolumeReclaimPolicy: Unsupported value: "Keep": supported values: "Delete", "Recycle", "Retain"',
      '* spec.nodeAffinity: Required value: Local volume requires node affinity', 'The PersistentVolumeClaim "c-bad" is invalid: ',
      '* spec.accessModes: Unsupported value: "Sometimes": supported values: "ReadOnlyMany", "ReadWriteMany", "ReadWriteOnce", "ReadWriteOncePod"',
      '* spec.resources.requests[storage]: Invalid value: "lots": quantities must match the regular expression \'^([+-]?[0-9.]+)([eEinumkKMGTP]*[-+]?[0-9]*)$\'', 'The PersistentVolumeClaim "blank" is invalid: ',
      '* spec.accessModes: Required value: at least 1 access mode is required', '* spec.resources[storage]: Required value']);
    expect(s.log[2].err).toEqual(['The StorageClass "fast" is invalid: ', '* provisioner: Forbidden: updates to provisioner are forbidden.', '* volumeBindingMode: Invalid value: "WaitForFirstConsumer": field is immutable']);
    expect(s.log[3].err).toEqual(['The PersistentVolumeClaim "data" is invalid: spec: Forbidden: spec is immutable after creation except resources.requests and volumeAttributesClassName for bound claims']);
    expect([s.log[4].out, s.log[5].out]).toEqual([['persistentvolumeclaim/data configured'], ['5Gi']]);
    expect(s.log[6].err).toEqual(['The PersistentVolumeClaim "data" is invalid: spec.resources.requests.storage: Forbidden: field can not be less than status.capacity']);
    expect(s.log[8].err).toEqual(['Error from server (Forbidden): error when patching "k8s/kgrow.yaml": persistentvolumeclaims "k" is forbidden: only dynamically provisioned pvc can be resized and the storageclass that provisions the pvc must support resize']);
    expect(s.log[9].err).toEqual(['（模擬環境：PersistentVolumeClaim 的 spec.volumeMode Block 只在課文說明）']);
  });
  it('decodes strictly and keeps other pod volumes in prose', () => {
    const lab = withStorageFiles(storageLab, { 'x.yaml': pvc('x', '', '1Gi', ['ReadWriteOnce'], ['sizeLimit: 1Gi']),
      'h.yaml': ['apiVersion: v1', 'kind: Pod', 'metadata:', '  name: h', 'spec:', '  containers:', '  - name: h', '    image: team/db:1.0', '  volumes:', '  - name: h', '    hostPath:', '      path: /tmp', ''].join('\n') });
    const s = stoOn(lab, 'kubectl apply -f k8s/x.yaml', 'kubectl apply -f k8s/h.yaml');
    expect(s.log[0].err).toEqual(['Error from server (BadRequest): error when creating "k8s/x.yaml": PersistentVolumeClaim in version "v1" cannot be handled as a PersistentVolumeClaim: strict decoding error: unknown field "spec.sizeLimit"']);
    expect(s.log[1].err).toEqual(['（模擬環境：spec.volumes[0] 要到引擎階段 （課文說明） 才模擬）']);
  });
});

describe('the check kube-volume', () => {
  const ex = (checks: TerminalCheck[], solution: string[], m: TerminalMachine = storageLab) => ({ id: 'x', title: 'x', machine: m.id, statement: 'x', checks, solution, mistakes: [{ commands: ['true'], why: 'x' }], hints: [], explanation: 'x' });
  const run = (checks: TerminalCheck[], solution: string[]) => checkTerminalExercise(ex(checks, solution), [storageLab], solution).results.map(r => r.ok ? 'ok' : r.message.split('，但')[1]);
  const checks: TerminalCheck[] = [
    { kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'shared', phase: 'Bound', storageClass: '', capacity: '5120Mi', accessModes: ['ReadWriteMany'], boundTo: 'pv-nfs', reclaimPolicy: 'Retain' },
    { kind: 'kube-volume', resource: 'PersistentVolume', name: 'pv-nfs', phase: 'Bound', boundTo: 'default/shared' },
    { kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'gone', absent: true },
  ];
  it('reads a claim and a volume, and says what differs', () => {
    expect(run(checks, ['kubectl apply -f k8s/pv.yaml -f k8s/claim.yaml'])).toEqual(['ok', 'ok', 'ok']);
    expect(run(checks, ['kubectl apply -f k8s/pv.yaml'])).toEqual(['沒有名為 shared 的 PersistentVolumeClaim', '它的狀態是 Available', 'ok']);
    expect(run([{ kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'shared', capacity: '1Gi' }], ['kubectl apply -f k8s/claim.yaml'])).toEqual(['它還沒有容量（還沒有綁定）']);
    expect(describeCheck(checks[0])).toBe('default 命名空間應該有名為 shared 的 PersistentVolumeClaim（狀態 Bound、StorageClass ""（不使用 StorageClass）、容量 5120Mi、存取模式 ReadWriteMany、綁定到 pv-nfs、回收策略 Retain）');
    expect(describeCheck(checks[1])).toBe('叢集應該有名為 pv-nfs 的 PersistentVolume（狀態 Bound、綁定到 default/shared）');
  });
  it('checks the checks', () => {
    const problems = (c: TerminalCheck, m: TerminalMachine = storageLab) => terminalContentProblems({ machines: [m], examples: [], exercises: [ex([c], ['true'], m)] });
    expect(problems({ kind: 'kube-volume', resource: 'PersistentVolume', name: 'x', namespace: 'default' })).toContain('exercise x: a kube-volume check needs a name (and a namespace only for a PersistentVolumeClaim)');
    expect(problems({ kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'x', phase: 'Ready' })[0]).toMatch(/phase is one of Pending, Bound/);
    expect(problems({ kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'x', accessModes: ['RWO'] })[0]).toMatch(/accessModes are among ReadWriteOnce/);
    expect(problems({ kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'x', absent: true, phase: 'Bound' })).toContain('exercise x: a kube-volume check with absent checks nothing else');
    const below = { ...ingressLab };
    expect(problems({ kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'x' }, below)).toContain('exercise x: a kube-volume check needs a kube-storage machine (engine stage E38)');
  });
});

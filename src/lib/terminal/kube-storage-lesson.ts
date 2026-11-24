import type { FsNode } from './fs';
import { affinityNode, findIn, sourceKey, withData } from './kube-storage-model';
import { obj, type KubeState } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §10): the lesson's storage data. provisioners names the
 * provisioners running in the cluster (a StorageClass whose provisioner is not among them is never provisioned: its claims
 * stay Pending with ExternalProvisioning); local marks node-local ones (local-path: a hostPath under
 * /opt/local-path-provisioner with the node's affinity), the others give attachable network disks (CSI). files puts
 * files on the boot manifests' PersistentVolumes (a hostPath one without node affinity has them on every node).
 */

export interface StorageLesson { provisioners?: { name: string; local?: boolean }[]; files?: Record<string, Record<string, string>> }
const NAME = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?(\/[A-Za-z0-9._-]+)?$/;
const REL = (p: string) => /^[^/]/.test(p) && !p.split('/').includes('..') && !p.split('/').includes('') && p.length <= 200;

export function storageProblems(s: StorageLesson): string[] {
  const out: string[] = [], fail = (t: string) => out.push(`kube: ${t}`);
  if (typeof s !== 'object' || s === null) return ['kube: storage is { provisioners?, files? }'];
  const ps = s.provisioners ?? [];
  if (!Array.isArray(ps) || ps.length > 4 || ps.some(p => typeof p?.name !== 'string' || !NAME.test(p.name) || p.name.length > 63 || (p.local !== undefined && typeof p.local !== 'boolean'))
    || new Set(ps.map(p => p.name)).size !== ps.length) fail('storage.provisioners are at most 4 of { name: a provisioner such as local.example.com/local-path, local?: boolean }, each name once');
  const files = Object.entries(s.files ?? {});
  if (typeof (s.files ?? {}) !== 'object' || files.length > 8 || files.some(([, f]) => typeof f !== 'object' || f === null || Object.keys(f).length > 20
    || Object.entries(f).some(([p, c]) => !REL(p) || typeof c !== 'string' || c.length > 4000))) fail('storage.files maps at most 8 PersistentVolume names to at most 20 files each (a relative path → text of at most 4000 characters)');
  return out;
}

const fileNode = (content: string): FsNode => ({ kind: 'file', mode: 0o644, owner: 'root', content });
/** The volume's files with their folders (paths relative to the volume's root). */
export function treeOf(files: Readonly<Record<string, string>>): Record<string, FsNode> {
  const out: Record<string, FsNode> = {};
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) out[parts.slice(0, i).join('/')] ??= { kind: 'dir', mode: 0o755, owner: 'root' };
    out[path] = fileNode(content);
  }
  return out;
}
/** The boot PVs' files (a missing PV is a problem of the lesson's data). */
export function seedFiles(k0: KubeState, files: Readonly<Record<string, Record<string, string>>>, problems: string[]): KubeState {
  let k = k0;
  for (const [name, f] of Object.entries(files)) {
    const pv = findIn(k, 'PersistentVolume', undefined, name);
    if (!pv) { problems.push(`storage.files: no PersistentVolume ${name} among the boot manifests`); continue; }
    const node = affinityNode(pv), keys = obj(pv.spec).hostPath && !node ? k.nodes.map(n => sourceKey(pv, n.name)) : [sourceKey(pv, node ?? '')];
    for (const key of keys) k = withData(k, key, treeOf(f));
  }
  return k;
}

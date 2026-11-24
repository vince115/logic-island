import type { Seconds } from './clock';
import { resolvePath, type FsNode } from './fs';
import { programFor, type DockerImage, type DockerState, type LogLine } from './docker';
import { argvOf } from './kube-image';
import { boundVolume, findIn, mountPoint, sourceKey, withData } from './kube-storage-model';
import { arr, nsOf, obj, str, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §5): what a container sees of its persistentVolumeClaim and
 * emptyDir volumes, and what it writes there. A mount shows the volume's file tree (or its subPath folder) and hides the
 * image's files under the mount point; what a command or the main process changes under it is written back to the
 * volume, never to the container's writable layer — through a read-only mount the change is refused, as Linux's EROFS.
 * The E24 program's `writes` create their files when the container starts (or it fails on a read-only volume).
 */

export interface StorageMount { at: string; key: string; prefix: string; readOnly: boolean }
/** The container's storage mounts (a claim not bound yet has none). */
export function storageMounts(k: KubeState, pod: JObj, spec: J): StorageMount[] {
  const sim = k.pods[uidOf(pod)], out: StorageMount[] = [];
  if (!sim || !k.storage) return out;
  const vols = arr(obj(pod.spec).volumes).map(obj);
  for (const m of arr(obj(spec).volumeMounts).map(obj)) {
    const v = vols.find(x => str(x.name) === str(m.name)), at = str(m.mountPath) ?? '';
    if (!v || !at.startsWith('/')) continue;
    const claim = v.persistentVolumeClaim ? obj(v.persistentVolumeClaim) : undefined;
    let key: string | undefined;
    if (v.emptyDir) key = `emptyDir/${uidOf(pod)}/${str(v.name)}`;
    else if (claim) { const pvc = findIn(k, 'PersistentVolumeClaim', nsOf(pod) ?? 'default', str(claim.claimName) ?? ''), pv = pvc ? boundVolume(k, pvc) : undefined; if (pv) key = sourceKey(pv, sim.node); }
    if (key) out.push({ at: at.replace(/\/+$/, '') || '/', key, prefix: (str(m.subPath) ?? '').replace(/\/+$/, ''), readOnly: m.readOnly === true || claim?.readOnly === true });
  }
  return out;
}
const dir = (mode = 0o755): FsNode => ({ kind: 'dir', mode, owner: 'root' });
const under = (rel: string, prefix: string) => !prefix || rel === prefix || rel.startsWith(`${prefix}/`);
/** The files a container sees of its storage volumes (the folders above the mount points too). */
export function storageNodes(k: KubeState, pod: JObj, spec: J): Map<string, FsNode> {
  const nodes = new Map<string, FsNode>();
  for (const m of storageMounts(k, pod, spec)) {
    const parts = m.at.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) { const p = `/${parts.slice(0, i).join('/')}`; if (!nodes.has(p)) nodes.set(p, dir()); }
    nodes.set(m.at, mountPoint(dir(m.key.startsWith('emptyDir/') ? 0o777 : 0o755)));
    for (const [rel, n] of Object.entries(k.storage!.data[m.key] ?? {})) if (under(rel, m.prefix) && rel !== m.prefix) nodes.set(`${m.at}/${m.prefix ? rel.slice(m.prefix.length + 1) : rel}`, n);
  }
  return nodes;
}
const same = (a: FsNode | undefined, b: FsNode | undefined) => !!a && !!b && a.kind === b.kind && a.mode === b.mode && a.owner === b.owner && (a.group ?? '') === (b.group ?? '') && (a.content ?? '') === (b.content ?? '') && (a.target ?? '') === (b.target ?? '');

/**
 * What a command left in the container's files under its storage mounts goes back to the volumes (a read-only mount
 * refuses: refused is the first path it would have changed); owned tells the paths that are not the writable layer's.
 */
export function commitStorage(k0: KubeState, pod: JObj, spec: J, nodes: ReadonlyMap<string, FsNode>): { k: KubeState; refused?: string; owned: (path: string) => boolean } {
  const mounts = storageMounts(k0, pod, spec);
  let k = k0, refused: string | undefined;
  for (const m of mounts) {
    const old = k.storage!.data[m.key] ?? {}, pre = m.prefix ? `${m.prefix}/` : '', mine: Record<string, FsNode> = {};
    for (const [p, n] of nodes) if (p.startsWith(`${m.at}/`)) mine[pre + p.slice(m.at.length + 1)] = n;
    if (m.prefix) mine[m.prefix] = old[m.prefix] ?? dir();
    const before = Object.entries(old).filter(([r]) => under(r, m.prefix));
    const differs = before.find(([r, n]) => !same(n, mine[r]))?.[0] ?? Object.keys(mine).find(r => !same(old[r], mine[r]));
    if (differs === undefined) continue;
    if (m.readOnly) { refused ??= `${m.at}/${m.prefix ? differs.slice(pre.length) : differs}`; continue; }
    k = withData(k, m.key, { ...Object.fromEntries(Object.entries(old).filter(([r]) => !under(r, m.prefix))), ...mine });
  }
  return { k, ...refused ? { refused } : {}, owned: (p: string) => mounts.some(m => p === m.at || p.startsWith(`${m.at}/`)) };
}

/** E24's writes when the container starts: files created on its storage volumes, or the program's failure on a read-only one. */
export function startWrites(d: DockerState | undefined, k: KubeState, pod: JObj, spec: J, img: DockerImage, t: Seconds): { k: KubeState; fail?: { lines: LogLine[]; exit: { exit: number } } } {
  const s = obj(spec), own = !s.command && !s.args && !img.ownMain, rt = own ? img.runtime : d ? programFor(d, argvOf(img, spec))?.runtime : undefined;
  if (!rt?.writes?.length) return { k };
  const mounts = storageMounts(k, pod, spec), nodes = storageNodes(k, pod, spec), workdir = str(s.workingDir) ?? (img.workdir || '/');
  for (const w of rt.writes) {
    const abs = resolvePath({ cwd: workdir, home: '/' }, w), m = mounts.find(x => abs.startsWith(`${x.at}/`));
    if (!m) continue;
    if (m.readOnly) {
      const text = rt.readOnlyError?.output ?? `（模擬環境：程式要寫入 ${abs}，但 Volume 以唯讀掛載）`;
      return { k, fail: { lines: text.replace(/\n$/, '').split('\n').map(line => ({ t, stream: 2 as const, text: line })), exit: { exit: rt.readOnlyError?.exit ?? 1 } } };
    }
    const parts = abs.slice(m.at.length + 1).split('/');
    for (let i = 1; i < parts.length; i++) { const p = `${m.at}/${parts.slice(0, i).join('/')}`; if (!nodes.has(p)) nodes.set(p, dir()); }
    if (!nodes.has(abs)) nodes.set(abs, { kind: 'file', mode: 0o644, owner: 'root', content: '' });
  }
  return { k: commitStorage(k, pod, spec, nodes).k };
}

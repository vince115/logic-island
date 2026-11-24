import { hex } from './docker';
import type { FsNode } from './fs';
import { about, find, record } from './kube-api';
import { cfgKey, secretText } from './kube-config-spec';
import { arr, CONFIG_SYNC_SECONDS, nsOf, obj, str, uidOf, type CSim, type J, type JObj, type KubeState, type PodSim, type VolSync } from './kube-model';
import type { Seconds } from './clock';
import { storageNodes } from './kube-storage-mount';
import { attachVolumes } from './kube-storage-sched';
import { WAIT } from './kube-storage-model';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md §5): configMap and secret volumes. When the pod is bound the
 * kubelet mounts its volumes before any container starts: a missing source (or item key) is a FailedMount event and the
 * mount is tried again after 1 s, doubling up to 122 s (the pod stays ContainerCreating), unless the volume is optional
 * (then it is empty). A volume is written like the kubelet's atomic writer: the files in a timestamped folder
 * (..2026_11_24_10_00_00.123456789), the link ..data to it, and a link per top-level name to ..data/name. When a
 * ConfigMap or Secret changes, the volumes that mount it show the change CONFIG_SYNC_SECONDS later (the kubelet's sync
 * model); a subPath mount is the file as it was when the container started and never changes, like the environment.
 */

type Files = Record<string, { content: string; mode: number }>;
const SOURCE = (v: JObj) => v.configMap ? { kind: 'ConfigMap', name: str(obj(v.configMap).name) ?? '', src: obj(v.configMap) } : v.secret ? { kind: 'Secret', name: str(obj(v.secret).secretName) ?? '', src: obj(v.secret) } : undefined;
const volumesOf = (pod: JObj) => arr(obj(pod.spec).volumes).map(obj).filter(v => SOURCE(v));

/** A volume's files now, or the kubelet's error (missing source or key, unless optional). */
function filesOf(k: KubeState, ns: string, v: JObj): { files: Files } | { error: string } {
  const s = SOURCE(v)!, o = find(k, s.kind, ns, s.name), optional = s.src.optional === true, mode = typeof s.src.defaultMode === 'number' ? s.src.defaultMode : 0o644;
  if (!o) return optional ? { files: {} } : { error: `${s.kind.toLowerCase()} "${s.name}" not found` };
  const data = obj(o.data), text = (key: string) => s.kind === 'Secret' ? secretText(data[key]) : str(data[key]) ?? '', files: Files = {};
  const items = arr(s.src.items).map(obj);
  if (!items.length) { for (const key of Object.keys(data).sort()) files[key] = { content: text(key), mode }; return { files }; }
  for (const it of items) {
    const key = str(it.key) ?? '';
    if (!(key in data)) { if (optional) continue; return { error: s.kind === 'Secret' ? `references non-existent secret key: ${key}` : `configmap references non-existent config key: ${key}` }; }
    files[str(it.path) ?? key] = { content: text(key), mode: typeof it.mode === 'number' ? it.mode : mode };
  }
  return { files };
}
const two = (n: number) => String(n).padStart(2, '0');
/** The atomic writer's folder for a write at t (..YYYY_MM_DD_hh_mm_ss.N). */
function dirName(seed: string, t: Seconds): string {
  const d = new Date(Math.floor(t) * 1000);
  return `..${d.getUTCFullYear()}_${two(d.getUTCMonth() + 1)}_${two(d.getUTCDate())}_${two(d.getUTCHours())}_${two(d.getUTCMinutes())}_${two(d.getUTCSeconds())}.${parseInt(hex(`atomic/${seed}/${t}`).slice(0, 8), 16) % 1_000_000_000}`;
}
const sync = (seed: string, files: Files, t: Seconds): VolSync => ({ files, at: t, dir: dirName(seed, t) });

/** The pod's configMap and secret volumes mounted at t (or what still waits, with its FailedMount events). */
export function mountPod(k0: KubeState, pod: JObj, sim0: PodSim, t: Seconds): { k: KubeState; sim: PodSim } {
  let k = k0;
  const vols: Record<string, VolSync> = { ...sim0.vols }, ns = nsOf(pod) ?? 'default';
  let failed = false;
  for (const v of volumesOf(pod)) {
    const name = str(v.name) ?? '';
    if (vols[name]) continue;
    const r = filesOf(k, ns, v);
    if ('error' in r) { failed = true; k = record(k, t, about(pod), 'Warning', 'FailedMount', `MountVolume.SetUp failed for volume "${name}" : ${r.error}`); continue; }
    vols[name] = sync(`${uidOf(pod)}/${name}`, r.files, t);
  }
  // E38: the attach/detach controller attaches the pod's volumes (or it waits: Multi-Attach), tried again by the storage controller.
  const att = k.storage ? attachVolumes(k, pod, sim0, t) : undefined;
  if (att) k = att.k;
  const fails = (sim0.mount?.fails ?? 0) + 1, { mount: _m, ...rest } = sim0;
  void _m;
  if (failed || att?.wait) return { k, sim: { ...rest, vols, mount: { next: failed ? t + Math.min(2 ** (fails - 1), 122) : WAIT, fails } } };
  // Mounted: the containers' first steps happen now.
  const now = (c: CSim): CSim => c.next !== undefined && c.next < t ? { ...c, next: t } : c;
  return { k, sim: { ...rest, vols, ...sim0.mount ? { init: sim0.init.map(now), main: sim0.main.map(now) } : {} } };
}

/** When the kubelet next syncs one of the pod's volumes (a source changed CONFIG_SYNC_SECONDS before). */
export function volumeTimes(k: KubeState, pod: JObj, sim: PodSim): { t: Seconds; vol: string }[] {
  const out: { t: Seconds; vol: string }[] = [], ns = nsOf(pod) ?? 'default';
  for (const v of volumesOf(pod)) {
    const name = str(v.name) ?? '', s = SOURCE(v)!, at = k.cfgAt?.[cfgKey(ns, s.kind, s.name)], vol = sim.vols?.[name];
    if (vol && at !== undefined && at + CONFIG_SYNC_SECONDS > vol.at) out.push({ t: at + CONFIG_SYNC_SECONDS, vol: name });
  }
  return out;
}
/** The sync at t: the volume's files as the source has them now (a deleted source leaves them as they were). */
export function syncVolume(k: KubeState, pod: JObj, sim: PodSim, name: string, t: Seconds): PodSim {
  const v = volumesOf(pod).find(x => str(x.name) === name), old = sim.vols?.[name];
  if (!v || !old) return sim;
  const r = filesOf(k, nsOf(pod) ?? 'default', v);
  const next = 'error' in r || JSON.stringify(r.files) === JSON.stringify(old.files) ? { ...old, at: t } : sync(`${uidOf(pod)}/${name}`, r.files, t);
  return { ...sim, vols: { ...sim.vols, [name]: next } };
}

const dirNode = (mode = 0o755): FsNode => ({ kind: 'dir', mode, owner: 'root' });
const fileNode = (f: { content: string; mode: number }): FsNode => ({ kind: 'file', mode: f.mode, owner: 'root', content: f.content });
/** A container's subPath mounts as they are now (kept in its CSim when it starts). */
export function subPathFiles(sim: PodSim, spec: J): Record<string, { content: string; mode: number }> {
  const out: Record<string, { content: string; mode: number }> = {};
  for (const m of arr(obj(spec).volumeMounts).map(obj)) {
    const vol = sim.vols?.[str(m.name) ?? ''], sub = str(m.subPath);
    if (vol && sub && vol.files[sub]) out[str(m.mountPath) ?? ''] = vol.files[sub];
  }
  return out;
}
/** The files a container sees of its configMap and secret volumes (the folders above them too). */
export function mountNodes(pod: JObj, sim: PodSim | undefined, spec: J, c: CSim | undefined, k?: KubeState): Map<string, FsNode> {
  const nodes = new Map<string, FsNode>(), secretVol = new Set(volumesOf(pod).filter(v => v.secret).map(v => str(v.name)));
  const parents = (path: string) => { const parts = path.split('/').filter(Boolean); for (let i = 1; i < parts.length; i++) { const p = `/${parts.slice(0, i).join('/')}`; if (!nodes.has(p)) nodes.set(p, dirNode()); } };
  for (const m of arr(obj(spec).volumeMounts).map(obj)) {
    const name = str(m.name) ?? '', vol = sim?.vols?.[name], at = str(m.mountPath) ?? '', sub = str(m.subPath);
    if (!vol || !at.startsWith('/')) continue;
    parents(at);
    if (sub) { const f = c?.subs?.[at]; nodes.set(at, f ? fileNode(f) : dirNode()); continue; }
    nodes.set(at, dirNode(secretVol.has(name) ? 0o1777 : 0o777));
    nodes.set(`${at}/${vol.dir}`, dirNode());
    nodes.set(`${at}/..data`, { kind: 'link', mode: 0o777, owner: 'root', target: vol.dir });
    for (const [path, f] of Object.entries(vol.files)) {
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) nodes.set(`${at}/${vol.dir}/${parts.slice(0, i).join('/')}`, dirNode());
      nodes.set(`${at}/${vol.dir}/${path}`, fileNode(f));
      nodes.set(`${at}/${parts[0]}`, { kind: 'link', mode: 0o777, owner: 'root', target: `..data/${parts[0]}` });
    }
  }
  // E38: persistentVolumeClaim and emptyDir volumes (their file trees).
  if (k?.storage) for (const [p, n] of storageNodes(k, pod, spec)) nodes.set(p, n);
  return nodes;
}

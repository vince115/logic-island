import { imageNodes, runIn, type DockerImage } from './docker';
import { parentOf, resolvePath, type FsNode } from './fs';
import { find } from './kube-api';
import { podContainer, resolveImage } from './kube-image';
import { podExec } from './kube-pod-net';
import { mountNodes } from './kube-volumes';
import { commitStorage } from './kube-storage-mount';
import { cOf, type Ref } from './kube-kubelet';
import { decodeTar } from './tar';
import { arr, meta, nameOf, obj, str, uidOf, type CSim, type J, type JObj, type KubeState } from './kube-model';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §7): moving data in and out of pods. kubectl exec … -- tar
 * with the archive "-" streams it: c writes it to kubectl's standard output (… > backup.tgz on the workstation; the
 * listing and warnings go to standard error) and x reads it from kubectl's standard input (-i … < backup.tgz). kubectl cp
 * is tar in the container too: pod:path → local runs tar c there (GNU tar's "Removing leading `/'" warning), local →
 * pod extracts as tar -xmf - does. Both write what changed back to the pod's volumes, or to the container's layer.
 */

const STREAM = '/.kubectl-tar-stream';
type Lines = readonly { stream: 1 | 2; text: string }[];
/** A tar whose archive is "-": its words with the archive in a file, and whether it creates (else extracts). */
export function tarStream(argv: readonly string[]): { argv: string[]; create: boolean } | undefined {
  if ((argv[0] ?? '').replace(/^.*\//, '') !== 'tar') return undefined;
  const words = [...argv];
  let at = -1, create = words.includes('--create');
  words.slice(1).forEach((w, j) => {
    const i = j + 1, group = /^-?([A-Za-z]+)$/.exec(w), first = i === 1 && !w.startsWith('-');
    if (group && (first || w.startsWith('-')) && !w.startsWith('--')) { if (group[1].includes('c')) create = true; if (group[1].endsWith('f') && words[i + 1] === '-') at = i + 1; }
    if (w === '--file=-') { words[i] = `--file=${STREAM}`; at = i; }
    if (w === '--file' && words[i + 1] === '-') at = i + 1;
  });
  if (at < 0) return undefined;
  if (words[at] === '-') words[at] = STREAM;
  return { argv: words, create };
}
/** x: the archive kubectl reads from its standard input (-i), as a file the container's tar opens. */
export const streamInput = (nodes: Map<string, FsNode>, text: string) => { nodes.set(STREAM, { kind: 'file', mode: 0o600, owner: 'root', content: text }); };
/** After the run: the archive out of the container's files (c: kubectl's output; the listing to standard error). */
export function tarFinish(s: { create: boolean }, nodes: ReadonlyMap<string, FsNode>, lines: Lines): { nodes: Map<string, FsNode>; lines: Lines; raw?: string } {
  const out = new Map(nodes), archive = out.get(STREAM);
  out.delete(STREAM);
  return s.create ? { nodes: out, lines: lines.map(l => ({ ...l, stream: 2 as const })), ...archive?.kind === 'file' ? { raw: archive.content ?? '' } : {} } : { nodes: out, lines };
}

/** The container's files after a command: its volumes get what changed under them, its writable layer the rest. */
export function commitPod(k: KubeState, pod: JObj, r: Ref, c: CSim, spec: J, img: DockerImage, base0: ReadonlyMap<string, FsNode>, nodes: ReadonlyMap<string, FsNode>): { k: KubeState; refused?: string } {
  const base = new Map(imageNodes(img, c.cid ?? '')), layer = new Map<string, FsNode>();
  for (const [path, n] of base0) base.set(path, n);
  const st = k.storage ? commitStorage(k, pod, spec, nodes) : undefined, k2 = st?.k ?? k;
  for (const [path, n] of nodes) if (!st?.owned(path) && base.get(path) !== n && JSON.stringify(base.get(path)) !== JSON.stringify(n)) layer.set(path, n);
  const id = uidOf(pod), sim = k2.pods[id];
  return { k: { ...k2, pods: { ...k2.pods, [id]: { ...sim, [r.init ? 'init' : 'main']: (r.init ? sim.init : sim.main).map((y, i) => i === r.i ? { ...y, layer } : y) } } }, ...st?.refused ? { refused: st.refused } : {} };
}

const fail = (x: Kx, line: string, status = 1): KubeResult => { x.io.err(line); return { state: x.state, status }; };
const REMOTE = /^(?:([a-z0-9][-a-z0-9.]*)\/)?([a-z0-9][-a-z0-9.]*):(.*)$/;
export function storageVerb(x: Kx): KubeResult | undefined {
  if (x.verb !== 'cp') return undefined;
  if (x.pos.length !== 2) return fail(x, 'error: source and destination are required');
  const [src, dst] = x.pos.map(w => REMOTE.exec(w)), [a, b] = x.pos;
  if (src && dst) return fail(x, 'error: one of src or dest must be a local file specification');
  if (!src && !dst) return fail(x, 'error: one of src or dest must be a remote file specification');
  const remote = (src ?? dst)!, ns = remote[1] ?? x.ns, path = remote[3], local = src ? b : a;
  if (!path || !local) return fail(x, 'error: filepath can not be empty');
  const pod = find(x.k, 'Pod', ns, remote[2]);
  if (!pod) return fail(x, `Error from server (NotFound): pods "${remote[2]}" not found`);
  const mains = arr(obj(pod.spec).containers).map(c => str(obj(c).name) ?? ''), want = flag(x, 'container') ?? str(obj(meta(pod).annotations)['kubectl.kubernetes.io/default-container']) ?? mains[0];
  if (!mains.includes(want)) return fail(x, `error: container ${want} is not valid for pod ${remote[2]}`);
  if (!flag(x, 'container') && mains.length > 1) x.io.err(`Defaulted container "${want}" out of: ${mains.join(', ')}`);
  const r: Ref = { init: false, i: mains.indexOf(want) }, sim = x.k.pods[uidOf(pod)], c = sim ? cOf(sim, r) : undefined, spec = arr(obj(pod.spec).containers)[r.i];
  if (!sim || !c || c.state !== 'running') return fail(x, `error: unable to upgrade connection: container not found ("${want}")`);
  const res = resolveImage(x.state.docker, c.image, 'pulled');
  if ('error' in res) return fail(x, `error: unable to upgrade connection: container not found ("${want}")`);
  if (!(res.img.commands ?? []).includes('tar')) return fail(x, `error: Internal error occurred: Internal error occurred: error executing command in container: failed to exec in container: failed to start exec "${(c.cid ?? '').slice(0, 64)}": OCI runtime exec failed: exec failed: unable to start container process: exec: "tar": executable file not found in $PATH: unknown`);
  const mounts = mountNodes(pod, sim, spec, c, x.k), box = podContainer(res.img, spec, nameOf(pod), c.cid ?? '', x.now, c.layer, mounts), net = podExec(x.state, pod, box, c.layer);
  const run = (argv: string[]) => runIn(box, res.img, argv, { tty: false, env: [], now: x.now, view: net.view });
  if (src) {
    // pod → local: tar c in the container, the archive's members written under the local name.
    const out = run(['tar', 'cf', STREAM, path]);
    if ('notFound' in out) return fail(x, 'error: tar not found');
    out.lines.forEach(l => x.io.err(l.text));
    const archive = decodeTar(out.nodes.get(STREAM)?.content ?? '');
    if (out.status !== 0 || !archive) return { state: x.state, status: 1 };
    const strip = path.replace(/^\/+/, '').replace(/\/+$/, ''), dest = resolvePath(x.state, local), nodes = new Map(x.state.nodes);
    const ensure = (p: string) => { const parts = p.split('/').filter(Boolean); for (let i = 1; i <= parts.length; i++) { const d = `/${parts.slice(0, i).join('/')}`; if (!nodes.has(d)) nodes.set(d, { kind: 'dir', mode: 0o755, owner: x.state.user }); } };
    for (const m of archive.members) {
      const name = m.name.replace(/\/$/, ''), rest = name === strip ? '' : name.startsWith(`${strip}/`) ? name.slice(strip.length) : null;
      if (rest === null) continue;
      const at = `${dest}${rest}`;
      if (m.kind !== 'dir' && nodes.get(at)?.kind === 'dir') return fail(x, `error: open ${local}: is a directory`);
      ensure(parentOf(at));
      nodes.set(at, m.kind === 'dir' ? { kind: 'dir', mode: m.mode, owner: x.state.user } : m.kind === 'link' ? { kind: 'link', mode: 0o777, owner: x.state.user, target: m.target ?? '' } : { kind: 'file', mode: m.mode, owner: x.state.user, content: m.content ?? '', mtime: m.mtime });
    }
    return { state: { ...x.state, nodes }, status: 0 };
  }
  // local → pod: the local file or folder at the pod's path, as tar -xmf - leaves it there (owned by root).
  const from = resolvePath(x.state, local), top = x.state.nodes.get(from);
  if (!top) return fail(x, `error: ${local} doesn't exist in local filesystem`);
  const dest = resolvePath({ cwd: str(obj(spec).workingDir) ?? (res.img.workdir || '/'), home: '/' }, path), nodes = new Map(box.nodes);
  if (nodes.get(parentOf(dest))?.kind !== 'dir') { x.io.err(`tar: ${parentOf(dest)}: Cannot open: No such file or directory`); x.io.err('tar: Error is not recoverable: exiting now'); x.io.err('command terminated with exit code 2'); return { state: x.state, status: 1 }; }
  for (const [p, n] of x.state.nodes) {
    if (p !== from && !p.startsWith(`${from}/`)) continue;
    nodes.set(`${dest}${p.slice(from.length)}`, { kind: n.kind, mode: n.mode, owner: 'root', ...n.kind === 'file' ? { content: n.content ?? '' } : {}, ...n.kind === 'link' ? { target: n.target ?? '' } : {} });
  }
  const base = new Map([...mounts, ...net.files.filter(([p]) => !c.layer?.has(p))]), done = commitPod(x.k, pod, r, c, spec, res.img, base, nodes);
  if (done.refused) { x.io.err(`tar: ${dest.slice(parentOf(dest).length).replace(/^\//, '')}: Cannot open: Read-only file system`); x.io.err('tar: Exiting with failure status due to previous errors'); x.io.err('command terminated with exit code 2'); return { state: x.state, status: 1 }; }
  return { state: { ...x.state, kube: done.k }, status: 0 };
}

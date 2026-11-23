import { DAY, parseTime, type Seconds } from './clock';
import type { FsState } from './fs';
import { clockOf } from './processes';
import { isIPv4 } from './sockets';
import { parseRef } from './docker';
import type { TerminalFile, TerminalMachine } from './lesson';
import { bootstrap, kubeconfigText, nodesOf, parseTaint, type TerminalKubeNode } from './kube-system';
import { readManifests, validLabelName } from './kube-manifest';
import { applyDoc } from './kube-write';
import { bytesOf, cpuMilli, KUBE_LIMITS, nsOf, obj, str, type KubeState } from './kube-model';

/*
 * Engine stage E32 as lesson data (docs/curriculum/KUB0_E32_CLUSTER.md §14). A machine of the cluster profile with `kube`
 * is a learner's workstation with kubectl and the admin kubeconfig of a fictional kubeadm cluster: its nodes (default
 * cp-01, node-01, node-02), when the cluster was created, how long image pulls take (and which images nodes already have),
 * manifests applied at boot (each at its time, as kubectl apply would), and the namespace of the kubeconfig's context.
 * Images are the machine's docker.images (the simulated Docker Hub) and docker.registries.
 */

export interface TerminalKube {
  nodes?: TerminalKubeNode[];
  /** When the cluster was created (UTC 'YYYY-MM-DD HH:MM:SS'; default 30 days before the machine's now). */
  created?: string;
  /** Seconds a pull takes (default 2), and per image: its seconds and the nodes that already have it. */
  pullSeconds?: number;
  images?: { name: string; seconds?: number; nodes?: string[] }[];
  /** Manifests applied in order at boot (at: UTC, between created and now; default now). */
  manifests?: { text: string; at?: string; file?: string }[];
  /** The namespace of the kubeconfig's context (kubectl config set-context --current --namespace). */
  namespace?: string;
}

const homeOf = (m: TerminalMachine) => m.home ?? (m.user === 'root' ? '/root' : `/home/${m.user}`);
const nowOf = (m: TerminalMachine, state?: FsState) => state ? clockOf(state).now : parseTime(m.now ?? '') ?? clockOf({}).now;

/** E32: ~/.kube and its config (kubeadm's admin.conf copied for the user, 0600). */
export function expandKube(m: TerminalMachine, cluster: boolean, add: { file(f: TerminalFile): void }): void {
  if (!cluster || !m.kube) return;
  const home = homeOf(m), base = home === '/' ? '' : home;
  const parts = home.split('/').filter(Boolean);
  for (let k = 1; k <= parts.length; k++) { const d = `/${parts.slice(0, k).join('/')}`; add.file({ path: d, kind: 'dir', mode: 0o755, owner: d === home ? m.user : 'root' }); }
  add.file({ path: `${base}/.kube`, kind: 'dir', mode: 0o755, owner: m.user });
  add.file({ path: `${base}/.kube/config`, kind: 'file', mode: 0o600, owner: m.user, content: kubeconfigText(m.kube.namespace) });
}

/** The cluster at the machine's start: its nodes and system objects, then the boot manifests in order. */
export function buildKube(m: TerminalMachine, now: Seconds): { k: KubeState; problems: string[] } {
  const kube = m.kube!, created = parseTime(kube.created ?? '') ?? now - 30 * DAY;
  const nodes = nodesOf(kube.nodes ?? [{ name: 'cp-01', control: true }, { name: 'node-01' }, { name: 'node-02' }], created, t => cpuMilli(t) ?? 0, t => bytesOf(t) ?? 0);
  const boot = bootstrap(nodes, created), pull: Record<string, number> = {}, cache: Record<string, string[]> = Object.fromEntries(Object.entries(boot.cache).map(([n, l]) => [n, [...l]]));
  for (const img of kube.images ?? []) {
    if (img.seconds !== undefined) pull[img.name] = img.seconds;
    for (const n of img.nodes ?? []) cache[n]?.push(img.name);
  }
  let k: KubeState = { created, nodes, objects: boot.objects, pods: boot.pods, events: [], rv: 1000, seq: 0, settled: created, cache, pull, pullSeconds: kube.pullSeconds ?? 2, unscheduled: {} };
  const problems: string[] = [];
  (kube.manifests ?? []).forEach((mf, i) => {
    const at = parseTime(mf.at ?? '') ?? now, file = mf.file ?? `manifest-${i + 1}.yaml`;
    const docs = readManifests(mf.text, file);
    if ('error' in docs) { problems.push(`kube.manifests[${i}]: ${docs.error}`); return; }
    for (const d of docs) {
      if ('error' in d) { problems.push(`kube.manifests[${i}]: ${d.error}`); continue; }
      const r = applyDoc(k, d.doc, str(obj(d.doc.metadata).namespace) ?? 'default', at, file);
      if ('error' in r) problems.push(`kube.manifests[${i}]: ${r.error}`); else k = r.k;
    }
  });
  return { k, problems };
}

/** E32: the state's cluster (the local machine of the cluster profile only). */
export function kubeState(m: TerminalMachine, state: FsState, cluster: boolean): FsState {
  if (!cluster || !m.kube || kubeProblems(m, cluster).length) return state;
  return { ...state, kube: buildKube(m, nowOf(m, state)).k };
}

const LINE = (t: unknown, max = 64) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
/** E32: the problems of a machine's cluster data. */
export function kubeProblems(m: TerminalMachine, cluster: boolean): string[] {
  if (m.kube === undefined) return [];
  if (!cluster) return ['kube needs the cluster profile (engine stage E32)'];
  const out: string[] = [], kube = m.kube, now = nowOf(m), fail = (s: string) => out.push(`kube: ${s}`);
  if (typeof kube !== 'object' || kube === null) return ['kube: the cluster is an object'];
  const nodes = kube.nodes ?? [];
  if (kube.nodes !== undefined && (!nodes.length || nodes.length > KUBE_LIMITS.nodes)) fail(`1..${KUBE_LIMITS.nodes} nodes`);
  const names = new Set<string>(), addrs = new Set<string>();
  for (const n of nodes) {
    const at = `node ${n.name}`;
    if (!LINE(n.name) || !validLabelName(n.name) || names.has(n.name)) fail(`${at}: a unique lowercase name (RFC 1123 label)`);
    names.add(n.name);
    if (n.address !== undefined && (!isIPv4(n.address) || addrs.has(n.address))) fail(`${at}: address is a unique IPv4 address`);
    if (n.address) addrs.add(n.address);
    if (n.cpu !== undefined && !(cpuMilli(n.cpu) ?? 0)) fail(`${at}: cpu is a quantity such as 2 or 1500m`);
    if (n.memory !== undefined && !(bytesOf(n.memory) ?? 0)) fail(`${at}: memory is a quantity such as 4Gi or 3911796Ki`);
    if (n.pods !== undefined && (!Number.isInteger(n.pods) || n.pods < 1 || n.pods > 250)) fail(`${at}: pods is 1..250`);
    for (const [key, v] of Object.entries(n.labels ?? {})) if (!LINE(key, 253) || typeof v !== 'string' || v.length > 63 || !/^(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?$/.test(v)) fail(`${at}: label ${key} is not a valid label`);
    for (const t of n.taints ?? []) if (!parseTaint(t)) fail(`${at}: taint ${t} is not key[=value]:NoSchedule|PreferNoSchedule|NoExecute`);
  }
  const created = kube.created === undefined ? now - 30 * DAY : parseTime(kube.created);
  if (created === undefined || created > now) fail('created is a UTC time (YYYY-MM-DD HH:MM:SS) not after now');
  if (kube.pullSeconds !== undefined && (!Number.isInteger(kube.pullSeconds) || kube.pullSeconds < 0 || kube.pullSeconds > 600)) fail('pullSeconds is 0..600');
  const nodeNames = kube.nodes ? names : new Set(['cp-01', 'node-01', 'node-02']);
  for (const img of kube.images ?? []) {
    if (!LINE(img.name, 200) || !parseRef(img.name.split('@')[0])) fail(`image ${String(img.name)}: an image reference`);
    if (img.seconds !== undefined && (!Number.isInteger(img.seconds) || img.seconds < 0 || img.seconds > 600)) fail(`image ${img.name}: seconds is 0..600`);
    for (const n of img.nodes ?? []) if (!nodeNames.has(n)) fail(`image ${img.name}: no node ${n}`);
  }
  if (kube.namespace !== undefined && (!LINE(kube.namespace) || !validLabelName(kube.namespace))) fail('namespace is a namespace name');
  if ((kube.manifests ?? []).length > 12) fail('at most 12 manifests');
  for (const [i, mf] of (kube.manifests ?? []).entries()) {
    if (typeof mf.text !== 'string' || mf.text.length > 4000) fail(`manifests[${i}]: text of at most 4000 characters`);
    const at = mf.at === undefined ? now : parseTime(mf.at);
    if (at === undefined || at > now || (created !== undefined && at < created)) fail(`manifests[${i}]: at is a UTC time between created and now`);
    if (mf.file !== undefined && !LINE(mf.file)) fail(`manifests[${i}]: file is a name`);
  }
  if (out.length) return out;
  const built = buildKube(m, now);
  if (built.k.objects.filter(o => o.kind === 'Pod' && nsOf(o) !== 'kube-system').length > KUBE_LIMITS.pods) out.push(`kube: at most ${KUBE_LIMITS.pods} pods`);
  return [...out, ...built.problems.map(p => `kube: ${p}`)];
}

import { DAY, parseTime, type Seconds } from './clock';
import type { FsState } from './fs';
import { clockOf } from './processes';
import { ipNumber, ipText, isIPv4, networkOf } from './sockets';
import { parseRef } from './docker';
import type { TerminalFile, TerminalMachine } from './lesson';
import { bootstrap, kubeconfigText, nodesOf, parseTaint, type TerminalKubeNode } from './kube-system';
import { readManifests, validLabelName } from './kube-manifest';
import { applyDoc } from './kube-write';
import { healthProblems, type TerminalKubeHealth } from './kube-health';
import { bytesOf, cpuMilli, KUBE_LIMITS, nsOf, obj, str, type KubeState } from './kube-model';
import { systemWorkloads } from './kube-controllers';
import { rootCa, rootCas } from './kube-config-spec';
import { installNginx, type NginxLesson } from './kube-ingress';
import { seedFiles, storageProblems, type StorageLesson } from './kube-storage-lesson';

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
  /**
   * E33 (probes profile): how an image's service behaves over time since its container started — listenAfter (seconds
   * before its ports accept connections), paths answering another status in a window (after/until; e.g. /healthz 500 after
   * 60 s), exec commands' exit status in a window. kube-health.ts.
   */
  health?: TerminalKubeHealth[];
  /**
   * E34 (workloads profile): nodes that fail at a time (UTC; may be after now): the kubelet stops, the node is NotReady 50 s
   * later and its pods are evicted when their 300 s toleration runs out (kube-controllers.ts).
   */
  failures?: { node: string; at: string }[];
  /**
   * E35 (kube-net profile): the LoadBalancer address pool of a MetalLB-like provider — addresses, ranges (a.b.c.d-a.b.c.e)
   * or CIDRs, at most 32 addresses; without it a LoadBalancer's EXTERNAL-IP stays <pending> (kube-endpoints.ts).
   */
  lbPool?: string[];
  /**
   * E37 (ingress profile): ingress-nginx installed when the cluster was created — its Service a LoadBalancer (an address
   * from lbPool) or a NodePort (nodePorts: http, https), the IngressClass nginx (defaultClass: the default class). kube-ingress.ts.
   */
  ingressController?: NginxLesson;
  /** E37: the Gateway API's CRDs (standard channel), and the controllerName of the lesson's Gateway controller (controller: false — the CRDs only). kube-gateway.ts. */
  gatewayApi?: { controllerName?: string; controller?: boolean };
  /**
   * E38 (kube-storage profile): the provisioners running in the cluster (local: node-local volumes like local-path, else
   * network disks attached to one node at a time) and the files already on the boot manifests' PersistentVolumes.
   */
  storage?: StorageLesson;
}
export const GATEWAY_CONTROLLER = 'example.com/gateway-controller';
/** E35: the pool's addresses in order (null: not a pool of at most 32 IPv4 addresses). */
export function poolAddresses(pool: readonly string[]): string[] | null {
  const out: string[] = [];
  for (const p of pool) {
    const range = /^([\d.]+)-([\d.]+)$/.exec(p), cidr = /^([\d.]+)\/(\d+)$/.exec(p);
    const [a, b] = range ? [range[1], range[2]] : cidr ? [cidr[1], ''] : [p, p];
    if (!isIPv4(a) || (range && !isIPv4(b)) || (cidr && (Number(cidr[2]) < 27 || Number(cidr[2]) > 32))) return null;
    const from = ipNumber(cidr ? networkOf(a, Number(cidr[2])) : a), to = cidr ? from + 2 ** (32 - Number(cidr[2])) - 1 : ipNumber(b);
    if (to < from || to - from >= 32) return null;
    for (let n = from; n <= to; n++) out.push(ipText(n));
  }
  return out.length <= 32 && new Set(out).size === out.length ? out : null;
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
export function buildKube(m: TerminalMachine, now: Seconds, probes = false, workloads = false, net = false, config = false, ingress = false, storage = false): { k: KubeState; problems: string[] } {
  const kube = m.kube!, created = parseTime(kube.created ?? '') ?? now - 30 * DAY;
  const nodes = nodesOf(kube.nodes ?? [{ name: 'cp-01', control: true }, { name: 'node-01' }, { name: 'node-02' }], created, t => cpuMilli(t) ?? 0, t => bytesOf(t) ?? 0);
  const boot = bootstrap(nodes, created), pull: Record<string, number> = {}, cache: Record<string, string[]> = Object.fromEntries(Object.entries(boot.cache).map(([n, l]) => [n, [...l]]));
  for (const img of kube.images ?? []) {
    if (img.seconds !== undefined) pull[img.name] = img.seconds;
    for (const n of img.nodes ?? []) cache[n]?.push(img.name);
  }
  let k: KubeState = { created, nodes, objects: boot.objects, pods: boot.pods, events: [], rv: 1000, seq: 0, settled: created, cache, pull, pullSeconds: kube.pullSeconds ?? 2, unscheduled: {},
    ...probes ? { probes: true as const, ...kube.health ? { health: kube.health.map(h => ({ ...h })) } : {} } : {} };
  // E34: the controllers, kube-system's ReplicaSet, the lesson's node failures.
  if (workloads) k = { ...systemWorkloads(k), workloads: true, failures: (kube.failures ?? []).map(f => ({ node: f.node, at: parseTime(f.at) ?? now })) };
  // E35: Services, Endpoints, kube-proxy and CoreDNS; the LoadBalancer pool.
  if (net) k = { ...k, net: true, ...kube.lbPool ? { lb: poolAddresses(kube.lbPool) ?? [] } : {} };
  // E36: ConfigMaps and Secrets; every namespace's kube-root-ca.crt.
  if (config) k = rootCas({ ...k, config: true });
  // E37: Ingress and IngressClass; the lesson's ingress-nginx; the Gateway API's CRDs and controller.
  if (ingress) k = { ...k, ingress: kube.gatewayApi ? { gateway: kube.gatewayApi.controller === false ? {} : { controller: kube.gatewayApi.controllerName ?? GATEWAY_CONTROLLER } } : {} };
  if (ingress && kube.ingressController) { k = installNginx(k, kube.ingressController, created); if (config) k = rootCa(k, 'ingress-nginx', created); }
  // E38: StorageClasses, PVs, PVCs and StatefulSets; the lesson's provisioners.
  if (storage) k = { ...k, storage: { provisioners: (kube.storage?.provisioners ?? []).map(p => ({ name: p.name, local: p.local === true })), data: {} } };
  const problems: string[] = [];
  (kube.manifests ?? []).forEach((mf, i) => {
    const at = parseTime(mf.at ?? '') ?? now, file = mf.file ?? `manifest-${i + 1}.yaml`;
    const docs = readManifests(mf.text, file, config);
    if ('error' in docs) { problems.push(`kube.manifests[${i}]: ${docs.error}`); return; }
    for (const d of docs) {
      if ('error' in d) { problems.push(`kube.manifests[${i}]: ${d.error}`); continue; }
      const r = applyDoc(k, d.doc, str(obj(d.doc.metadata).namespace) ?? 'default', at, file);
      if ('error' in r) problems.push(`kube.manifests[${i}]: ${r.error}`);
      else k = { ...r.k, ...workloads ? { dirty: Math.min(r.k.dirty ?? at, at) } : {}, ...net ? { netDirty: Math.min(r.k.netDirty ?? at, at) } : {} };
    }
  });
  if (storage && kube.storage?.files) k = seedFiles(k, kube.storage.files, problems);
  return { k, problems };
}

/** E32: the state's cluster (the local machine of the cluster profile only). */
export function kubeState(m: TerminalMachine, state: FsState, cluster: boolean, probes = false, workloads = false, net = false, config = false, ingress = false, storage = false): FsState {
  if (!cluster || !m.kube || kubeProblems(m, cluster, probes, workloads, net, config, ingress, storage).length) return state;
  return { ...state, kube: buildKube(m, nowOf(m, state), probes, workloads, net, config, ingress, storage).k };
}


const LINE = (t: unknown, max = 64) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
/** E32: the problems of a machine's cluster data. */
export function kubeProblems(m: TerminalMachine, cluster: boolean, probes = false, workloads = false, net = false, config = false, ingress = false, storage = false): string[] {
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
  // E33: the lesson's health of images.
  if (kube.health !== undefined) {
    if (!probes) fail('health needs the probes profile (engine stage E33)');
    else out.push(...healthProblems(kube.health, (m.docker?.images ?? []).map(i => i.name)));
  }
  // E34: the lesson's node failures.
  if (kube.failures !== undefined) {
    if (!workloads) fail('failures needs the workloads profile (engine stage E34)');
    else if (!Array.isArray(kube.failures) || kube.failures.length > KUBE_LIMITS.nodes || new Set(kube.failures.map(f => f.node)).size !== kube.failures.length) fail(`failures is at most ${KUBE_LIMITS.nodes} of { node, at }, one per node`);
    else for (const f of kube.failures) {
      if (!nodeNames.has(f.node)) fail(`failures: no node ${String(f.node)}`);
      const at = typeof f.at === 'string' ? parseTime(f.at) : undefined;
      if (at === undefined || (created !== undefined && at < created) || at > now + DAY) fail(`failures: ${String(f.node)} at is a UTC time between created and a day after now`);
    }
  }
  // E35: the LoadBalancer pool.
  if (kube.lbPool !== undefined) {
    if (!net) fail('lbPool needs the kube-net profile (engine stage E35)');
    else if (!Array.isArray(kube.lbPool) || !poolAddresses(kube.lbPool)) fail('lbPool is at most 32 IPv4 addresses: a.b.c.d, a.b.c.d-a.b.c.e or a.b.c.d/27..32');
    else if (poolAddresses(kube.lbPool)!.some(a => addrs.has(a) || (!kube.nodes && ['10.0.0.50', '10.0.0.51', '10.0.0.52'].includes(a)))) fail('lbPool overlaps a node address');
  }
  // E37: ingress-nginx and the Gateway API.
  out.push(...ingressProblems(kube, ingress));
  // E38: the provisioners and the PVs' files.
  if (kube.storage !== undefined) out.push(...storage ? storageProblems(kube.storage) : ['kube: storage needs the kube-storage profile (engine stage E38)']);
  if (out.length) return out;
  const built = buildKube(m, now, probes, workloads, net, config, ingress, storage);
  if (built.k.objects.filter(o => o.kind === 'Pod' && nsOf(o) !== 'kube-system').length > KUBE_LIMITS.pods) out.push(`kube: at most ${KUBE_LIMITS.pods} pods`);
  return [...out, ...built.problems.map(p => `kube: ${p}`)];
}

/** E37: the problems of the lesson's ingress-nginx and Gateway API. */
function ingressProblems(kube: TerminalKube, ingress: boolean): string[] {
  const out: string[] = [], ic = kube.ingressController, ga = kube.gatewayApi;
  if (ic === undefined && ga === undefined) return out;
  if (!ingress) return [`kube: ${ic !== undefined ? 'ingressController' : 'gatewayApi'} needs the ingress profile (engine stage E37)`];
  if (ic !== undefined) {
    if (typeof ic !== 'object' || ic === null || (ic.service !== undefined && !['LoadBalancer', 'NodePort'].includes(ic.service))) out.push('kube: ingressController.service is LoadBalancer or NodePort');
    const ports = Object.values(ic?.nodePorts ?? {});
    if (ic?.nodePorts !== undefined && (ic.service !== 'NodePort' || ports.some(p => !Number.isInteger(p) || p < 30000 || p > 32767) || new Set(ports).size !== ports.length)) out.push('kube: ingressController.nodePorts (http, https) are two different ports in 30000-32767 of a NodePort controller');
    if (ic?.defaultClass !== undefined && typeof ic.defaultClass !== 'boolean') out.push('kube: ingressController.defaultClass is true or false');
  }
  if (ga !== undefined && (typeof ga !== 'object' || ga === null || (ga.controllerName !== undefined && !/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?\/[A-Za-z0-9/._-]+$/.test(ga.controllerName)) || (ga.controller !== undefined && typeof ga.controller !== 'boolean'))) {
    out.push('kube: gatewayApi is { controllerName?: a domain-prefixed path such as example.com/gateway-controller, controller?: boolean }');
  }
  return out;
}

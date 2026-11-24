import { NAMESPACED } from './kube-api';
import { eventJson, nodeJson, table } from './kube-print';
import { printObjects } from './kube-output';
import { fieldSelector, parseSelector, selects } from './kube-select';
import { evalPath, parsePath, scalar } from './kube-jsonpath';
import { describeObject } from './kube-describe';
import { describeWorkload } from './kube-describe-workload';
import { describeEndpoints, describeService } from './kube-describe-service';
import { describeConfig } from './kube-describe-config';
import { describeGeneric, describeIngress } from './kube-describe-ingress';
import { describeStorage } from './kube-storage-print';
import { STORAGE_KINDS } from './kube-storage-model';
import { GATEWAY_KINDS, INGRESS_KINDS } from './kube-ingress-spec';
import { WORKLOAD_KINDS } from './kube-workload-spec';
import { HPA } from './kube-hpa-spec';
import { describeHpa } from './kube-hpa-print';
import { kindOf, nameOf, nsOf, type JObj } from './kube-model';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §9): kubectl get and describe. A target is a type (pods, po,
 * pod), type/name, a type and names, or types joined with commas; the system's services, deployments and daemonsets can be
 * read; the types of later stages say which stage simulates them. Lists are in name order (namespace first with -A;
 * events in the order they happened), filtered by -l and --field-selector, sorted by --sort-by.
 */

export const TYPES: { kind: string; names: string[]; plural: string }[] = [
  { kind: 'Pod', names: ['pods', 'pod', 'po'], plural: 'pods' }, { kind: 'Node', names: ['nodes', 'node', 'no'], plural: 'nodes' },
  { kind: 'Namespace', names: ['namespaces', 'namespace', 'ns'], plural: 'namespaces' }, { kind: 'Event', names: ['events', 'event', 'ev'], plural: 'events' },
  { kind: 'Service', names: ['services', 'service', 'svc'], plural: 'services' }, { kind: 'Deployment', names: ['deployments', 'deployment', 'deploy', 'deployments.apps'], plural: 'deployments.apps' },
  { kind: 'DaemonSet', names: ['daemonsets', 'daemonset', 'ds', 'daemonsets.apps'], plural: 'daemonsets.apps' },
  { kind: 'ReplicaSet', names: ['replicasets', 'replicaset', 'rs', 'replicasets.apps'], plural: 'replicasets.apps' },
  { kind: 'Endpoints', names: ['endpoints', 'ep'], plural: 'endpoints' },
  { kind: 'EndpointSlice', names: ['endpointslices', 'endpointslice', 'endpointslices.discovery.k8s.io'], plural: 'endpointslices.discovery.k8s.io' },
  { kind: 'ConfigMap', names: ['configmaps', 'configmap', 'cm'], plural: 'configmaps' }, { kind: 'Secret', names: ['secrets', 'secret'], plural: 'secrets' },
  // E37: Ingress and IngressClass; the Gateway API (its CRDs' names).
  { kind: 'Ingress', names: ['ingresses', 'ingress', 'ing', 'ingresses.networking.k8s.io'], plural: 'ingresses.networking.k8s.io' },
  { kind: 'IngressClass', names: ['ingressclasses', 'ingressclass', 'ingressclasses.networking.k8s.io'], plural: 'ingressclasses.networking.k8s.io' },
  { kind: 'GatewayClass', names: ['gatewayclasses', 'gatewayclass', 'gc', 'gatewayclasses.gateway.networking.k8s.io'], plural: 'gatewayclasses.gateway.networking.k8s.io' },
  { kind: 'Gateway', names: ['gateways', 'gateway', 'gtw', 'gateways.gateway.networking.k8s.io'], plural: 'gateways.gateway.networking.k8s.io' },
  { kind: 'HTTPRoute', names: ['httproutes', 'httproute', 'httproutes.gateway.networking.k8s.io'], plural: 'httproutes.gateway.networking.k8s.io' },
  // E38: storage and StatefulSets.
  { kind: 'StorageClass', names: ['storageclasses', 'storageclass', 'sc', 'storageclasses.storage.k8s.io'], plural: 'storageclasses.storage.k8s.io' },
  { kind: 'PersistentVolume', names: ['persistentvolumes', 'persistentvolume', 'pv'], plural: 'persistentvolumes' },
  { kind: 'PersistentVolumeClaim', names: ['persistentvolumeclaims', 'persistentvolumeclaim', 'pvc'], plural: 'persistentvolumeclaims' },
  { kind: 'StatefulSet', names: ['statefulsets', 'statefulset', 'sts', 'statefulsets.apps'], plural: 'statefulsets.apps' },
  // E40: HorizontalPodAutoscaler.
  { kind: HPA, names: ['horizontalpodautoscalers', 'horizontalpodautoscaler', 'hpa', 'horizontalpodautoscalers.autoscaling'], plural: 'horizontalpodautoscalers.autoscaling' },
];
/** E34: kubectl get all (the kinds of the simulation that the "all" category holds, in kubectl's order; E38: StatefulSet too). */
const ALL = ['Pod', 'Service', 'DaemonSet', 'Deployment', 'ReplicaSet'], ALL_E38 = [...ALL, 'StatefulSet'], ALL_E40 = [...ALL_E38, HPA];
const LATER_TYPES: Record<string, string> = { replicasets: 'E34', replicaset: 'E34', rs: 'E34', endpoints: 'E35', ep: 'E35', endpointslices: 'E35', configmaps: 'E36', configmap: 'E36', cm: 'E36', secrets: 'E36', secret: 'E36',
  ingresses: 'E37', ingress: 'E37', ing: 'E37', ingressclasses: 'E37', gateways: 'E37', httproutes: 'E37', persistentvolumes: 'E38', pv: 'E38', persistentvolumeclaims: 'E38', pvc: 'E38', storageclasses: 'E38', sc: 'E38',
  statefulsets: 'E38', sts: 'E38', horizontalpodautoscalers: 'E40', hpa: 'E40', all: 'E34' };
const APPS = ['Deployment', 'DaemonSet', 'ReplicaSet', 'StatefulSet'];
/** A type word: its names, and for the apps kinds also any name qualified with the group (`replicaset.apps`, as -o name prints). */
const anyType = (word: string) => {
  const w = word.toLowerCase(), base = w.endsWith('.apps') ? w.slice(0, -5) : undefined;
  return TYPES.find(t => t.names.includes(w)) ?? (base ? TYPES.find(t => APPS.includes(t.kind) && t.names.includes(base)) : undefined);
};
/** The kind a word names (pods, deploy, rs…), for kubectl events --for. */
export const kindOfWord = (word: string, k?: Pick<Kx['k'], 'ingress'>) => { const t = anyType(word); return t && (INGRESS_KINDS.includes(t.kind) || GATEWAY_KINDS.includes(t.kind)) && !k?.ingress ? undefined : t?.kind; };
export type Target = { kind: string; plural: string; names: string[] };

/** The targets of get, describe, delete, label…: a type and names, type/name words, or types joined with commas. */
export function targets(x: Kx, words: readonly string[]): Target[] | { error: string } {
  // E34: ReplicaSets and "all" exist on the workloads profile only.
  // E35: Endpoints and EndpointSlices on the kube-net profile only.
  // E36: ConfigMaps and Secrets on the kube-config profile only.
  // E37: Ingress and IngressClass on the ingress profile, the Gateway API with the lesson's CRDs (without them: the server has no such type).
  const typeOf = (w: string) => { const t = anyType(w); return t && (t.kind === 'ReplicaSet' ? x.k.workloads : t.kind === 'Endpoints' || t.kind === 'EndpointSlice' ? x.k.net : t.kind === 'ConfigMap' || t.kind === 'Secret' ? x.k.config
    : INGRESS_KINDS.includes(t.kind) ? x.k.ingress : GATEWAY_KINDS.includes(t.kind) ? x.k.ingress?.gateway : STORAGE_KINDS.includes(t.kind) ? x.k.storage : t.kind === HPA ? x.k.autoscale : true) ? t : undefined; };
  if (!words.length) return { error: 'error: you must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.' };
  const out: Target[] = [], unknown = (w: string) => LATER_TYPES[w.toLowerCase()] && !(x.k.ingress && GATEWAY_KINDS.includes(anyType(w)?.kind ?? '')) ? { error: `（模擬環境：${w} 要到引擎階段 ${LATER_TYPES[w.toLowerCase()]} 才模擬）` } : { error: `error: the server doesn't have a resource type "${w}"` };
  if (words[0].includes('/')) {
    for (const w of words) {
      const [t, n] = w.split('/'), type = typeOf(t);
      if (!n) return { error: 'error: arguments in resource/name form must have a single resource and name' };
      if (!type) return unknown(t);
      const same = out.find(o => o.kind === type.kind);
      if (same) same.names.push(n); else out.push({ kind: type.kind, plural: type.plural, names: [n] });
    }
    return out;
  }
  for (const w of words[0].split(',')) {
    if (w === 'all' && x.k.workloads) { out.push(...(x.k.autoscale ? ALL_E40 : x.k.storage ? ALL_E38 : ALL).map(kind => ({ kind, plural: TYPES.find(t => t.kind === kind)!.plural, names: [] }))); continue; }
    const type = typeOf(w); if (!type) return unknown(w); out.push({ kind: type.kind, plural: type.plural, names: [] });
  }
  if (words.length > 1 && out.length > 1) return { error: 'error: arguments in resource/name form may not have more than one slash' };
  if (words.length > 1) out[0].names.push(...words.slice(1));
  return out;
}

/** Every object of the kind as the API returns it (nodes and events are built from the cluster's records). */
export function objectsOf(x: Kx, kind: string): JObj[] {
  if (kind === 'Node') return x.k.nodes.map(n => nodeJson(x.k, n, x.now));
  if (kind === 'Event') return x.k.events.map(eventJson);
  const list = x.k.objects.filter(o => kindOf(o) === kind);
  return [...list].sort((a, b) => (nsOf(a) ?? '').localeCompare(nsOf(b) ?? '') || nameOf(a).localeCompare(nameOf(b)));
}
const inScope = (x: Kx, kind: string, o: JObj) => !NAMESPACED[kind] || x.all || nsOf(o) === x.ns;
const notFound = (x: Kx, t: Target, name: string) => `Error from server (NotFound): ${t.plural} "${name}" not found`;

/** The objects a target names (in scope, selected), and the not-found errors. */
export function pick(x: Kx, t: Target): { items: JObj[]; errors: string[] } | { error: string } {
  const all = objectsOf(x, t.kind).filter(o => inScope(x, t.kind, o));
  if (t.names.length) {
    const items: JObj[] = [], errors: string[] = [];
    for (const n of t.names) { const o = all.find(a => nameOf(a) === n && (!NAMESPACED[t.kind] || nsOf(a) === x.ns)); if (o) items.push(o); else errors.push(notFound(x, t, n)); }
    return { items, errors };
  }
  let items = all;
  const sel = flag(x, 'selector'), fs = flag(x, 'field-selector');
  if (sel !== undefined) { const r = parseSelector(sel); if ('error' in r) return { error: `error: ${r.error}` }; items = items.filter(o => selects(r, o)); }
  if (fs !== undefined) { const f = fieldSelector(fs, t.kind); if ('error' in f) return f; items = items.filter(f); }
  const by = flag(x, 'sort-by');
  if (by !== undefined) {
    const p = parsePath(by.replace(/^\{|\}$/g, ''));
    if ('error' in p) return { error: `error: ${p.error}` };
    const key = (o: JObj) => { const v = evalPath([o], p)[0]; return v === undefined ? '' : typeof v === 'number' ? v : scalar(v); };
    items = [...items].sort((a, b) => { const ka = key(a), kb = key(b); return typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka) < String(kb) ? -1 : String(ka) > String(kb) ? 1 : 0; });
  }
  return { items, errors: [] };
}
export const noneText = (x: Kx, kind: string) => !NAMESPACED[kind] || x.all ? 'No resources found' : `No resources found in ${x.ns} namespace.`;

export function getCommand(x: Kx): KubeResult {
  const ts = targets(x, x.pos);
  if ('error' in ts) { x.io.err(ts.error); return { state: x.state, status: 1 }; }
  const mode = flag(x, 'output'), wide = mode === 'wide', errors: string[] = [], groups: { t: Target; items: JObj[] }[] = [];
  for (const t of ts) { const r = pick(x, t); if ('error' in r) { x.io.err(r.error); return { state: x.state, status: 1 }; } groups.push({ t, items: r.items }); errors.push(...r.errors); }
  const items = groups.flatMap(g => g.items), single = ts.length === 1 && ts[0].names.length === 1;
  if (mode && !wide) {
    // Fix (E33): --no-headers leaves out custom-columns' header line too (the column widths come from the rows), as for the tables.
    const p = printObjects(mode, items, single, x.flags.bools.has('no-headers'));
    if ('error' in p) { x.io.err(p.error); return { state: x.state, status: 1 }; }
    if ('raw' in p) x.io.raw(p.raw); else if (items.length || !('lines' in p && mode === 'name')) p.lines.forEach(l => x.io.out(l));
  } else {
    const shown = groups.filter(g => g.items.length), several = ts.length > 1;
    shown.forEach((g, i) => {
      if (i) x.io.out('');
      const rows = table(x.k, g.t.kind, g.items, { wide, all: x.all, labels: x.flags.bools.has('show-labels'), now: x.now, prefix: several, columns: (x.flags.values['label-columns'] ?? []).flatMap(v => v.split(',')) });
      (x.flags.bools.has('no-headers') ? rows.slice(1) : rows).forEach(l => x.io.out(l));
    });
    if (!items.length && !errors.length) x.io.err(noneText(x, ts[0].kind));
    if (x.flags.bools.has('watch')) x.io.err('（模擬環境：沒有持續監看，-w 只印出目前的狀態）');
  }
  errors.forEach(e => x.io.err(e));
  return { state: x.state, status: errors.length ? 1 : 0 };
}
export function describeCommand(x: Kx): KubeResult {
  const ts = targets(x, x.pos);
  if ('error' in ts) { x.io.err(ts.error); return { state: x.state, status: 1 }; }
  const out: string[][] = [], errors: string[] = [];
  for (const t of ts) {
    const r = pick(x, t);
    if ('error' in r) { x.io.err(r.error); return { state: x.state, status: 1 }; }
    for (const o of r.items) out.push(x.k.workloads && WORKLOAD_KINDS.includes(t.kind) ? describeWorkload(x.k, o, x.now)
      : x.k.net && t.kind === 'Service' ? describeService(x.k, o, x.now) : x.k.net && t.kind === 'Endpoints' ? describeEndpoints(x.k, o, x.now)
      : x.k.config && (t.kind === 'ConfigMap' || t.kind === 'Secret') ? describeConfig(x.k, o, x.now) : STORAGE_KINDS.includes(t.kind) ? describeStorage(x.k, o, x.now)
      : t.kind === HPA && x.k.autoscale ? describeHpa(x.k, o, x.now) : t.kind === 'Ingress' ? describeIngress(x.k, o, x.now) : x.k.ingress && (INGRESS_KINDS.includes(t.kind) || GATEWAY_KINDS.includes(t.kind)) ? describeGeneric(x.k, o, x.now) : describeObject(x.k, t.kind, o, x.now));
    errors.push(...r.errors);
  }
  out.forEach((lines, i) => { if (i) { x.io.out(''); x.io.out(''); } lines.forEach(l => x.io.out(l)); });
  if (!out.length && !errors.length) x.io.err(noneText(x, ts[0].kind));
  errors.forEach(e => x.io.err(e));
  return { state: x.state, status: errors.length ? 1 : 0 };
}

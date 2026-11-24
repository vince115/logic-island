import { goJson, kubeYaml } from './kube-output';
import { createDoc } from './kube-write';
import { parseSelector } from './kube-select';
import { portsOf, selectorOf } from './kube-service-spec';
import { arr, labelsOf, nameOf, obj, str, type J, type JObj } from './kube-model';
import { pick, targets } from './kubectl-get';
import { portForwardCommand } from './kubectl-forward';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §7): the kube-net profile's verbs — kubectl expose (a pod, a
 * Deployment, a ReplicaSet or a Service: its labels as the selector, its container ports unless --port, the generated
 * object as kubectl writes it), create service clusterip|nodeport|loadbalancer NAME --tcp=port[:targetPort] (labels and
 * selector app=NAME, ports named port-targetPort; --clusterip=None, --node-port) and port-forward (kubectl-forward.ts).
 */

export function netVerb(x: Kx): KubeResult | undefined {
  if (x.verb === 'expose') return exposeCommand(x);
  if (x.verb === 'create' && (x.pos[0] === 'service' || x.pos[0] === 'svc')) return createService(x);
  if (x.verb === 'port-forward') return portForwardCommand(x);
  return undefined;
}
const fail = (x: Kx, line: string): KubeResult => { x.io.err(line); return { state: x.state, status: 1 }; };
const NOT_INT = (flagName: string, v: string) => `error: invalid argument "${v}" for "--${flagName}" flag: strconv.ParseInt: parsing "${v}": invalid syntax`;

/** Prints the generated object (--dry-run=client) or creates it ("service/web exposed"). */
function emit(x: Kx, doc: JObj, verb: string, already: (e: string) => string): KubeResult {
  const dry = flag(x, 'dry-run'), out = flag(x, 'output');
  if (dry === 'client') {
    if (out === 'yaml') kubeYaml(doc).forEach(l => x.io.out(l));
    else if (out === 'json') goJson(doc).split('\n').forEach(l => x.io.out(l));
    else x.io.out(`service/${nameOf(doc)} ${verb} (dry run)`);
    return { state: x.state, status: 0 };
  }
  const r = createDoc(x.k, doc, x.ns, x.now, 'STDIN');
  if ('error' in r) return fail(x, r.error.includes('(AlreadyExists)') ? already(r.error.replace('error when creating "STDIN": ', '')) : r.error.replace('error when creating "STDIN": ', ''));
  x.io.out(`service/${nameOf(doc)} ${verb}`);
  return { state: { ...x.state, kube: r.k }, status: 0 };
}

function exposeCommand(x: Kx): KubeResult {
  const ts = targets(x, x.pos);
  if ('error' in ts) return fail(x, ts.error);
  const t = ts[0];
  if (!t.names.length) return fail(x, 'error: resource(s) were provided, but no name was specified');
  if (!['Pod', 'Service', 'Deployment', 'ReplicaSet'].includes(t.kind)) return fail(x, `error: cannot expose a ${t.kind}`);
  const r = pick(x, { ...t, names: [t.names[0]] });
  if ('error' in r) return fail(x, r.error);
  if (!r.items.length) return fail(x, r.errors[0]);
  const o = r.items[0], spec = obj(o.spec), given = flag(x, 'selector');
  let selector: Record<string, string> | undefined;
  if (given !== undefined) {
    const p = parseSelector(given);
    if ('error' in p || p.some(q => q.op !== '=')) return fail(x, `error: couldn't retrieve selectors via --selector flag or introspection: 模擬環境的 --selector 只接受 key=value`);
    selector = Object.fromEntries(p.map(q => [q.key, q.values[0]]));
  } else if (t.kind === 'Pod') selector = labelsOf(o);
  else if (t.kind === 'Service') selector = selectorOf(o);
  else {
    const s = obj(spec.selector);
    if (arr(s.matchExpressions).length) return fail(x, `error: couldn't retrieve selectors via --selector flag or introspection: the ${t.kind} "${nameOf(o)}" has a selector with matchExpressions (模擬環境只用 matchLabels)`);
    selector = Object.fromEntries(Object.entries(obj(s.matchLabels)).map(([a, b]) => [a, String(b)]));
  }
  if (!selector || !Object.keys(selector).length) return fail(x, `error: couldn't retrieve selectors via --selector flag or introspection: the ${t.kind === 'Pod' ? 'pod has no labels' : 'object has no selector'} and cannot be exposed`);
  const portFlag = flag(x, 'port'), target = flag(x, 'target-port'), proto = flag(x, 'protocol'), type = flag(x, 'type');
  if (portFlag !== undefined && !/^\d+$/.test(portFlag)) return fail(x, NOT_INT('port', portFlag));
  // Without --port, the container ports (a Service's own ports); several are named port-1, port-2…
  const podSpec = t.kind === 'Pod' ? spec : obj(obj(spec.template).spec);
  const found: { port: number; protocol: string; target?: J }[] = portFlag !== undefined ? [{ port: Number(portFlag), protocol: proto ?? 'TCP' }]
    : t.kind === 'Service' ? portsOf(o).map(p => ({ port: Number(p.port), protocol: str(p.protocol) ?? 'TCP', target: p.targetPort ?? p.port }))
    : arr(podSpec.containers).flatMap(c => arr(obj(c).ports).map(obj)).filter(p => typeof p.containerPort === 'number').map(p => ({ port: p.containerPort as number, protocol: proto ?? str(p.protocol) ?? 'TCP' }));
  if (!found.length) return fail(x, "error: couldn't find port via --port flag or introspection");
  const tp = (p: typeof found[number]): J => target !== undefined ? (/^\d+$/.test(target) ? Number(target) : target) : p.target ?? p.port;
  const ports = found.map((p, i) => ({ ...found.length > 1 ? { name: `port-${i + 1}` } : {}, port: p.port, protocol: p.protocol, targetPort: tp(p) }));
  const labels = labelsOf(o), name = flag(x, 'name') ?? nameOf(o);
  const doc: JObj = { apiVersion: 'v1', kind: 'Service', metadata: { creationTimestamp: null, ...Object.keys(labels).length ? { labels } : {}, name },
    spec: { ports, selector, ...type !== undefined ? { type } : {} }, status: { loadBalancer: {} } };
  return emit(x, doc, 'exposed', e => e);
}

const KINDS: Record<string, string> = { clusterip: 'ClusterIP', nodeport: 'NodePort', loadbalancer: 'LoadBalancer' };
function createService(x: Kx): KubeResult {
  const [, sub, name, ...more] = x.pos;
  if (sub === 'externalname') return fail(x, '（模擬環境：ExternalName 的 Service 只在課文說明）');
  const type = sub === undefined ? undefined : KINDS[sub];
  if (!type) return fail(x, sub === undefined ? 'error: 模擬環境的 kubectl create service 需要 clusterip、nodeport 或 loadbalancer' : `error: unknown command "${sub}" for "kubectl create service"`);
  if (!name || more.length) return fail(x, `error: exactly one NAME is required, got ${name ? 1 + more.length : 0}`);
  const headless = flag(x, 'clusterip') === 'None', np = flag(x, 'node-port');
  if (np !== undefined && !/^\d+$/.test(np)) return fail(x, NOT_INT('node-port', np));
  const specs = (x.flags.values.tcp ?? []).flatMap(v => v.split(',')).filter(Boolean);
  if (!specs.length && !headless) return fail(x, 'error: at least one tcp port specifier must be provided');
  const ports: J[] = [];
  for (const sp of specs) {
    const [a, b = a] = sp.split(':');
    if (!/^\d+$/.test(a) || !/^[\w-]+$/.test(b)) return fail(x, `error: invalid port: ${sp}`);
    ports.push({ name: `${a}-${b}`, ...np !== undefined && type !== 'ClusterIP' ? { nodePort: Number(np) } : {}, port: Number(a), protocol: 'TCP', targetPort: /^\d+$/.test(b) ? Number(b) : b });
  }
  const cip = flag(x, 'clusterip');
  const doc: JObj = { apiVersion: 'v1', kind: 'Service', metadata: { creationTimestamp: null, labels: { app: name }, name },
    spec: { ...cip !== undefined ? { clusterIP: cip } : {}, ...ports.length ? { ports } : {}, selector: { app: name }, type }, status: { loadBalancer: {} } };
  return emit(x, doc, 'created', e => `error: failed to create ${type} service: ${e.replace(/^Error from server \(AlreadyExists\): /, '')}`);
}

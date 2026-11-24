import { put } from './kube-api';
import { goJson, kubeYaml, resourceName } from './kube-output';
import { createDoc } from './kube-write';
import { suffix, meta, obj, arr, str, kindOf, type J, type JObj, type KubeState } from './kube-model';
import { pick, targets, type Target } from './kubectl-get';
import { rolloutCommand } from './kubectl-rollout';
import { nodeCommand } from './kubectl-node';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §6): the workloads profile's verbs — kubectl create
 * deployment (the object kubectl generates: labels app=NAME, a container per --image named after the image), scale
 * (Deployments and ReplicaSets), set image (container=image, * for every container), rollout (kubectl-rollout.ts) and
 * cordon, uncordon, drain (kubectl-node.ts). A change of the template or the replicas is a new generation.
 */

export function workloadVerb(x: Kx): KubeResult | undefined {
  if (x.verb === 'create' && (x.pos[0] === 'deployment' || x.pos[0] === 'deploy')) return createDeployment(x);
  if (x.verb === 'scale') return scaleCommand(x);
  if (x.verb === 'set') return setCommand(x);
  if (x.verb === 'rollout') return rolloutCommand(x);
  if (x.verb === 'cordon' || x.verb === 'uncordon' || x.verb === 'drain') return nodeCommand(x);
  return undefined;
}
const fail = (x: Kx, line: string): KubeResult => { x.io.err(line); return { state: x.state, status: 1 }; };
/** A changed Deployment or ReplicaSet: its new spec is a new generation. */
export function respec(k: KubeState, o: JObj, spec: JObj): KubeState {
  return put(k, { ...o, metadata: { ...meta(o), generation: Number(meta(o).generation ?? 1) + 1 }, spec });
}
/** The Deployments and ReplicaSets the words name (type/name or a type and names). */
export function workloadTargets(x: Kx, words: readonly string[], verb: string): { items: JObj[]; errors: string[] } | { error: string } {
  const ts = targets(x, words);
  if ('error' in ts) return ts;
  const items: JObj[] = [], errors: string[] = [];
  for (const t of ts as Target[]) {
    // E38: and StatefulSets on the kube-storage profile.
    if (t.kind !== 'Deployment' && t.kind !== 'ReplicaSet' && !(t.kind === 'StatefulSet' && x.k.storage)) return { error: `（模擬環境：kubectl ${verb} 只模擬 Deployment${x.k.storage ? '、ReplicaSet 與 StatefulSet' : ' 與 ReplicaSet'}）` };
    if (!t.names.length && !x.flags.bools.has('all') && !x.flags.values.selector) return { error: 'error: resource(s) were provided, but no name was specified' };
    const r = pick(x, t);
    if ('error' in r) return r;
    items.push(...r.items.filter(o => kindOf(o) === t.kind));
    errors.push(...r.errors);
  }
  return { items, errors };
}

function createDeployment(x: Kx): KubeResult {
  const name = x.pos[1], images = x.flags.values.image ?? [], replicas = flag(x, 'replicas') ?? '1', port = flag(x, 'port');
  if (!name || x.pos.length > 2) return fail(x, `error: exactly one NAME is required, got ${Math.max(0, x.pos.length - 1)}`);
  if (!images.length) return fail(x, 'error: required flag(s) "image" not set');
  if (!/^\d+$/.test(replicas)) return fail(x, `error: invalid argument "${replicas}" for "-r, --replicas" flag: strconv.ParseInt: parsing "${replicas}": invalid syntax`);
  if (port !== undefined && !/^\d+$/.test(port)) return fail(x, `error: invalid argument "${port}" for "--port" flag: strconv.ParseInt: parsing "${port}": invalid syntax`);
  const seen = new Set<string>();
  const containers: J[] = images.map((image, i) => {
    let cn = (image.split('/').at(-1) ?? image).split(':')[0].split('@')[0].replace(/_/g, '-');
    if (seen.has(cn)) cn = `${cn}-${suffix(`${name}/${image}/${i}`)}`;
    seen.add(cn);
    return { image, name: cn, ...i === 0 && port !== undefined ? { ports: [{ containerPort: Number(port) }] } : {}, resources: {} };
  });
  const doc: JObj = { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { creationTimestamp: null, labels: { app: name }, name },
    spec: { replicas: Number(replicas), selector: { matchLabels: { app: name } }, strategy: {}, template: { metadata: { creationTimestamp: null, labels: { app: name } }, spec: { containers } } }, status: {} };
  const dry = flag(x, 'dry-run'), out = flag(x, 'output');
  if (dry === 'client') {
    if (out === 'yaml') kubeYaml(doc).forEach(l => x.io.out(l));
    else if (out === 'json') goJson(doc).split('\n').forEach(l => x.io.out(l));
    else x.io.out(`deployment.apps/${name} created (dry run)`);
    return { state: x.state, status: 0 };
  }
  const r = createDoc(x.k, doc, x.ns, x.now, 'STDIN');
  if ('error' in r) return fail(x, r.error.includes('(AlreadyExists)') ? `error: failed to create deployment: deployments.apps "${name}" already exists` : r.error.replace('error when creating "STDIN": ', ''));
  x.io.out(r.line);
  return { state: { ...x.state, kube: r.k }, status: 0 };
}

function scaleCommand(x: Kx): KubeResult {
  const want = flag(x, 'replicas');
  if (want === undefined) return fail(x, 'error: required flag(s) "replicas" not set');
  if (!/^\d+$/.test(want)) return fail(x, 'error: The --replicas=COUNT flag is required, and COUNT must be greater than or equal to 0');
  const r = workloadTargets(x, x.pos, 'scale');
  if ('error' in r) return fail(x, r.error);
  let k = x.k;
  for (const o of r.items) {
    const live = k.objects.find(y => y === o) ?? o;
    if (Number(obj(live.spec).replicas ?? 1) !== Number(want)) k = respec(k, live, { ...obj(live.spec), replicas: Number(want) });
    x.io.out(`${resourceName(o)} scaled`);
  }
  r.errors.forEach(e => x.io.err(e));
  return { state: { ...x.state, kube: k }, status: r.errors.length ? 1 : 0 };
}

function setCommand(x: Kx): KubeResult {
  if (x.pos[0] !== 'image') return fail(x, x.pos[0] ? `（模擬環境：kubectl set ${x.pos[0]} 不模擬；請修改 YAML 後執行 kubectl apply）` : 'error: Required resource not specified.');
  const words = x.pos.slice(1).filter(w => !w.includes('=')), pairs = x.pos.slice(1).filter(w => w.includes('='));
  if (!pairs.length) return fail(x, 'error: at least one image update is required');
  const r = workloadTargets(x, words, 'set image');
  if ('error' in r) return fail(x, r.error);
  let k = x.k;
  for (const o of r.items) {
    const spec = obj(o.spec), tpl = obj(spec.template), ps = { ...obj(tpl.spec) };
    let containers = arr(ps.containers).map(obj);
    for (const pair of pairs) {
      const at = pair.indexOf('='), cn = pair.slice(0, at), image = pair.slice(at + 1);
      if (cn !== '*' && !containers.some(c => str(c.name) === cn) && !arr(ps.initContainers).some(c => str(obj(c).name) === cn)) return fail(x, `error: unable to find container named "${cn}"`);
      containers = containers.map(c => cn === '*' || str(c.name) === cn ? { ...c, image } : c);
      if (ps.initContainers) ps.initContainers = arr(ps.initContainers).map(obj).map(c => cn === '*' || str(c.name) === cn ? { ...c, image } : c);
    }
    const next = { ...spec, template: { ...tpl, spec: { ...ps, containers } } };
    if (JSON.stringify(next) === JSON.stringify(spec)) continue;
    k = respec(k, k.objects.find(y => y === o) ?? o, next);
    x.io.out(`${resourceName(o)} image updated`);
  }
  r.errors.forEach(e => x.io.err(e));
  return { state: { ...x.state, kube: k }, status: r.errors.length ? 1 : 0 };
}

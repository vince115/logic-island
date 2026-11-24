import { put } from './kube-api';
import { resourceName } from './kube-output';
import { parseTaint } from './kube-system';
import { validLabelName } from './kube-manifest';
import { pick, targets } from './kubectl-get';
import { changed, kindOf, meta, nameOf, obj, type JObj, type KubeNode, type KubeState, type Taint } from './kube-model';
import type { KubeResult, Kx } from './kubectl';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §12): kubectl label and annotate (key=value, key- to remove,
 * --overwrite) on pods, namespaces and nodes, and kubectl taint on nodes (key[=value]:Effect, a trailing - removes). A
 * node's labels and taints change where the scheduler may put pods, so a pending pod is tried again at once.
 */

export function metaCommand(x: Kx): KubeResult {
  const fail = (line: string) => { x.io.err(line); return { state: x.state, status: 1 }; };
  const at = x.pos.findIndex((w, i) => i > 0 && (w.includes('=') || w.endsWith('-') || (x.verb === 'taint' && w.includes(':'))));
  const words = at < 0 ? x.pos : x.pos.slice(0, at), changes = at < 0 ? [] : x.pos.slice(at);
  if (!changes.length) return fail(`error: at least one ${x.verb === 'annotate' ? 'annotation' : x.verb} update is required`);
  const ts = targets(x, words);
  if ('error' in ts) return fail(ts.error);
  if (x.verb === 'taint' && ts.some(t => t.kind !== 'Node')) return fail(`error: invalid resource type ${ts[0].plural}, only node types are supported`);
  let k = x.k;
  const errors: string[] = [];
  for (const t of ts) {
    if (!t.names.length && !x.flags.bools.has('all') && !x.flags.values.selector) return fail('error: resource(s) were provided, but no name was specified');
    const r = pick({ ...x, k }, t);
    if ('error' in r) return fail(r.error);
    errors.push(...r.errors);
    for (const o of r.items) {
      const done = x.verb === 'taint' ? taint(k, nameOf(o), changes, x.flags.bools.has('overwrite')) : relabel(k, o, changes, x.verb === 'annotate', x.flags.bools.has('overwrite'));
      if ('error' in done) { errors.push(done.error); continue; }
      done.notes.forEach(n => x.io.out(n));
      x.io.out(`${resourceName(o)} ${done.word}`);
      k = kindOf(o) === 'Node' ? changed(done.k, x.now) : done.k;
    }
  }
  errors.forEach(e => x.io.err(e));
  return { state: { ...x.state, kube: k }, status: errors.length ? 1 : 0 };
}

type Done = { k: KubeState; word: string; notes: string[] } | { error: string };
function relabel(k: KubeState, o: JObj, changes: readonly string[], annotate: boolean, overwrite: boolean): Done {
  const field = annotate ? 'annotations' : 'labels', node = kindOf(o) === 'Node' ? k.nodes.find(n => n.name === nameOf(o)) : undefined;
  const now: Record<string, string> = { ...node ? node.labels : Object.fromEntries(Object.entries(obj(meta(o)[field])).map(([a, b]) => [a, String(b)])) };
  const notes: string[] = [];
  let added = false, removed = false;
  for (const c of changes) {
    if (c.endsWith('-') && !c.includes('=')) {
      const key = c.slice(0, -1);
      if (key in now) { delete now[key]; removed = true; } else notes.push(`${annotate ? 'annotation' : 'label'} "${key}" not found.`);
      continue;
    }
    const eq = c.indexOf('='), key = c.slice(0, eq), value = c.slice(eq + 1);
    if (eq <= 0 || (!annotate && (!validKey(key) || !/^(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?$/.test(value)))) return { error: `error: invalid ${annotate ? 'annotation' : 'label'} spec: ${c}` };
    if (key in now && now[key] !== value && !overwrite) return { error: annotate ? `error: --overwrite is false but found the following declared annotation(s): '${key}' already has a value (${now[key]})` : `error: '${key}' already has a value (${now[key]}), and --overwrite is false` };
    if (now[key] !== value) { now[key] = value; added = true; }
  }
  const word = added ? annotate ? 'annotated' : 'labeled' : removed ? annotate ? 'annotated' : 'unlabeled' : annotate ? 'not annotated' : 'not labeled';
  if (!added && !removed) return { k, word, notes };
  if (node) return { k: { ...k, rv: k.rv + 1, nodes: k.nodes.map(n => n === node ? { ...n, labels: now } : n) }, word, notes };
  const live = k.objects.find(x => x === o) ?? o;
  return { k: put(k, { ...live, metadata: { ...meta(live), [field]: now } }), word, notes };
}
const validKey = (key: string) => { const [a, b] = key.includes('/') ? key.split('/') : ['', key]; return (!a || /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(a)) && validName(b); };
const validName = (s: string) => s.length <= 63 && (/^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/.test(s) || validLabelName(s));

function taint(k: KubeState, name: string, changes: readonly string[], overwrite: boolean): Done {
  const node = k.nodes.find(n => n.name === name)!;
  let taints: Taint[] = [...node.taints], word = '';
  for (const c of changes) {
    if (c.endsWith('-')) {
      const body = c.slice(0, -1), [key, effect] = body.split(':'), keep = taints.filter(t => !(t.key === key && (!effect || t.effect === effect)));
      if (keep.length === taints.length) return { error: `error: taint "${body}" not found` };
      taints = keep; word ||= 'untainted';
      continue;
    }
    const t = parseTaint(c);
    if (!t) return { error: `error: invalid taint spec: ${c}, unknown effect` };
    const same = taints.findIndex(x => x.key === t.key && x.effect === t.effect);
    if (same >= 0 && !overwrite) return { error: `error: node ${name} already has ${t.key} taint(s) with same effect(s) and --overwrite is false` };
    taints = same >= 0 ? taints.map((x, i) => i === same ? t : x) : [...taints, t];
    word = 'tainted';
  }
  return { k: { ...k, rv: k.rv + 1, nodes: k.nodes.map((n: KubeNode) => n === node ? { ...n, taints } : n) }, word, notes: [] };
}

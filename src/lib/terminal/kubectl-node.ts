import type { Seconds } from './clock';
import { record } from './kube-api';
import { UNSCHEDULABLE } from './kube-sched';
import { beginDelete } from './kube-stop';
import { deleteObject } from './kube-write';
import { controllerOf } from './kube-replicaset';
import { changed, systemNs, kindOf, meta, nameOf, nsOf, obj, str, uidOf, type JObj, type KubeState } from './kube-model';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §8): kubectl cordon, uncordon and drain. Cordoning sets
 * spec.unschedulable and the node.kubernetes.io/unschedulable:NoSchedule taint (SchedulingDisabled in get nodes); drain
 * cordons, then sorts the node's pods with kubectl's filters — mirror (static) pods are skipped, DaemonSet pods need
 * --ignore-daemonsets, pods without a controller need --force, finished pods are always deleted — and evicts the rest
 * (graceful deletion), waiting until they are gone; their ReplicaSets put replacements on the other nodes.
 */

const fail = (x: Kx, line: string): KubeResult => { x.io.err(line); return { state: x.state, status: 1 }; };
const nodeEvent = (k: KubeState, node: string, t: Seconds, reason: string) =>
  record(k, t, { kind: 'Node', name: node, ns: 'default', uid: `node/${node}` }, 'Normal', reason, `Node ${node} status is now: ${reason}`);

/** Cordons or uncordons a node (the scheduler tries the pending pods again when it becomes schedulable). */
function setCordon(k: KubeState, node: string, on: boolean, t: Seconds): KubeState {
  const nodes = k.nodes.map(n => n.name !== node ? n : on
    ? { ...n, unschedulable: true as const, taints: [...n.taints.filter(x => x.key !== UNSCHEDULABLE.key), UNSCHEDULABLE] }
    : { ...n, unschedulable: undefined, taints: n.taints.filter(x => x.key !== UNSCHEDULABLE.key) });
  const next = nodeEvent({ ...k, rv: k.rv + 1, nodes }, node, t, on ? 'NodeNotSchedulable' : 'NodeSchedulable');
  return on ? next : changed(next, t);
}

export function nodeCommand(x: Kx): KubeResult {
  if (!x.pos.length) { x.io.err(`error: USAGE: ${x.verb} NODE [flags]`); return fail(x, `See 'kubectl ${x.verb} -h' for help and examples`); }
  let k = x.k, status = 0, advance = 0;
  for (const name of x.pos.map(w => w.replace(/^(nodes?|no)\//, ''))) {
    const node = k.nodes.find(n => n.name === name);
    if (!node) { x.io.err(`Error from server (NotFound): nodes "${name}" not found`); status = 1; continue; }
    const want = x.verb !== 'uncordon';
    if (!!node.unschedulable === want) x.io.out(`node/${name} already ${want ? 'cordoned' : 'uncordoned'}`);
    else { k = setCordon(k, name, want, x.now); x.io.out(`node/${name} ${want ? 'cordoned' : 'uncordoned'}`); }
    if (x.verb !== 'drain') continue;
    const r = drain(x, k, name);
    k = r.k; advance = Math.max(advance, r.wait);
    if (r.failed) status = 1;
  }
  return { state: { ...x.state, kube: k }, status, ...advance > 0 ? { advance } : {} };
}

const DS_FATAL = 'DaemonSet-managed Pods (use --ignore-daemonsets to ignore)', DS_WARN = 'ignoring DaemonSet-managed Pods';
const LONE_FATAL = 'cannot delete Pods that declare no controller (use --force to override)', LONE_WARN = 'deleting Pods that declare no controller';
function drain(x: Kx, k0: KubeState, node: string): { k: KubeState; wait: number; failed?: true } {
  let k = k0;
  const pods = k.objects.filter(o => kindOf(o) === 'Pod' && k.pods[uidOf(o)]?.node === node && !meta(o).deletionTimestamp)
    .sort((a, b) => (nsOf(a) ?? '').localeCompare(nsOf(b) ?? '') || nameOf(a).localeCompare(nameOf(b)));
  const fatal = new Map<string, string[]>(), warn = new Map<string, string[]>(), evict: JObj[] = [];
  const add = (m: Map<string, string[]>, msg: string, p: JObj) => m.set(msg, [...m.get(msg) ?? [], `${nsOf(p)}/${nameOf(p)}`]);
  for (const p of pods) {
    const owner = str(controllerOf(p)?.kind), phase = str(obj(p.status).phase);
    if (owner === 'Node') continue;
    if (owner === 'DaemonSet') { if (x.flags.bools.has('ignore-daemonsets')) add(warn, DS_WARN, p); else add(fatal, DS_FATAL, p); continue; }
    if (phase !== 'Succeeded' && phase !== 'Failed' && !owner) { if (x.flags.bools.has('force')) { add(warn, LONE_WARN, p); } else { add(fatal, LONE_FATAL, p); continue; } }
    evict.push(p);
  }
  if (fatal.size) {
    const errs = [...fatal].map(([m, ps]) => `cannot delete ${m}: ${ps.join(', ')}`).sort(), msg = errs.length > 1 ? `[${errs.join(', ')}]` : errs[0];
    [`error: unable to drain node "${node}" due to error: ${msg}, continuing command...`, 'There are pending nodes to be drained:', ` ${node}`, `error: ${msg}`].forEach(l => x.io.err(l));
    return { k, wait: 0, failed: true };
  }
  if (warn.size) x.io.err(`Warning: ${[...warn].map(([m, ps]) => `${m}: ${ps.join(', ')}`).sort().join('; ')}`);
  const gone: { name: string; at: number }[] = [], g = flag(x, 'grace-period'), grace = g !== undefined && /^\d+$/.test(g) ? Number(g) : undefined;
  for (const p of evict) {
    x.io.out(`evicting pod ${nsOf(p)}/${nameOf(p)}`);
    if (systemNs(k, nsOf(p))) { k = deleteObject(k, p, x.now); gone.push({ name: nameOf(p), at: x.now }); continue; }
    const r = beginDelete(x.state.docker, k, k.objects.find(o => uidOf(o) === uidOf(p)) ?? p, grace ?? Number(obj(p.spec).terminationGracePeriodSeconds ?? 30), x.now);
    k = r.k; gone.push({ name: nameOf(p), at: r.until });
  }
  gone.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name)).forEach(p => x.io.out(`pod/${p.name} evicted`));
  x.io.out(`node/${node} drained`);
  return { k, wait: Math.max(0, ...gone.map(p => p.at - x.now)) };
}

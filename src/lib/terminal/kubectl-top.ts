import { usageAt, type Usage } from './kube-metrics';
import { parseSelector, selects } from './kube-select';
import { createdOf, goDuration, goTab, kindOf, nameOf, nsOf, type JObj } from './kube-model';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §3): kubectl top node|pod, reading the Metrics API that the
 * lesson's metrics-server serves (kube-metrics.ts; the last 15-second scrape). Nodes: NAME CPU(cores) CPU% MEMORY(bytes)
 * MEMORY% of their allocatable; pods: NAME CPU(cores) MEMORY(bytes) (-A adds NAMESPACE, --containers a row per container
 * after POD), only the pods metrics-server reports. CPU in millicores, memory in whole Mi; --sort-by cpu|memory.
 */

const MI = 1024 * 1024;
const fail = (x: Kx, line: string): KubeResult => { x.io.err(line); return { state: x.state, status: 1 }; };
const HELP = ['Display resource (CPU/memory) usage.', '', 'The top command allows you to see the resource consumption for nodes or pods.', '',
  'This command requires Metrics Server to be correctly configured and working on the server.', '', 'Available Commands:', '  node          Display resource (CPU/memory) usage of nodes',
  '  pod           Display resource (CPU/memory) usage of pods', '', 'Usage:', '  kubectl top [flags] [options]'];

export function topCommand(x: Kx): KubeResult {
  const [what, ...names] = x.pos, sort = flag(x, 'sort-by');
  if (!what) { HELP.forEach(l => x.io.out(l)); return { state: x.state, status: 0 }; }
  const nodes = ['node', 'nodes', 'no'].includes(what), pods = ['pod', 'pods', 'po'].includes(what);
  if (!nodes && !pods) return fail(x, `error: unknown command "${what}" for "kubectl top"`);
  if (sort !== undefined && sort !== 'cpu' && sort !== 'memory') return fail(x, 'error: --sort-by accepts only cpu or memory');
  if (names.length > 1) return fail(x, `error: ${nodes ? 'only one node name may be given' : 'only one pod name may be given'}`);
  if (!x.k.autoscale?.metrics) return fail(x, 'error: Metrics API not available');
  const sel = flag(x, 'selector'), reqs = sel === undefined ? undefined : parseSelector(sel);
  if (reqs && 'error' in reqs) return fail(x, `error: ${reqs.error}`);
  const u = usageAt(x.state.docker, x.k, x.now), order = <T extends { cpu: number; memory: number }>(rows: T[]) => sort ? [...rows].sort((a, b) => b[sort] - a[sort]) : rows;
  // --no-headers: the column widths come from the rows alone.
  const print = (lines: string[]) => { goTab(x.flags.bools.has('no-headers') ? lines.slice(1) : lines).forEach(l => x.io.out(l)); return { state: x.state, status: 0 }; };
  if (nodes) {
    let list = [...x.k.nodes].sort((a, b) => a.name.localeCompare(b.name));
    if (names[0] !== undefined) { list = list.filter(n => n.name === names[0]); if (!list.length) return fail(x, `Error from server (NotFound): nodemetrics.metrics.k8s.io "${names[0]}" not found`); }
    if (reqs) list = list.filter(n => selects(reqs as Exclude<typeof reqs, { error: string }>, { metadata: { labels: { ...n.labels } } }));
    if (!list.length) return fail(x, 'No resources found');
    const rows = order(list.map(n => ({ n, ...u.node(n) })));
    return print(['NAME\tCPU(cores)\tCPU%\tMEMORY(bytes)\tMEMORY%', ...rows.map(r => `${r.n.name}\t${r.cpu}m\t${Math.floor(r.cpu * 100 / r.n.cpu)}%\t${Math.floor(r.memory / MI)}Mi\t${Math.floor(r.memory * 100 / r.n.memory)}%`)]);
  }
  const all = x.all && names[0] === undefined;
  let list = x.k.objects.filter(o => kindOf(o) === 'Pod' && (all || nsOf(o) === x.ns)).sort((a, b) => (nsOf(a) ?? '').localeCompare(nsOf(b) ?? '') || nameOf(a).localeCompare(nameOf(b)));
  if (names[0] !== undefined) {
    const p = list.find(o => nameOf(o) === names[0]);
    if (!p) return fail(x, `Error from server (NotFound): pods "${names[0]}" not found`);
    if (!u.pod(p)) return fail(x, `error: Metrics not available for pod ${x.ns}/${names[0]}, age: ${goDuration(x.now - (createdOf(p) ?? x.now))}`);
    list = [p];
  }
  if (reqs) list = list.filter(o => selects(reqs as Exclude<typeof reqs, { error: string }>, o));
  const measured = list.map(p => ({ p, c: u.pod(p) })).filter((r): r is { p: JObj; c: Usage[] } => !!r.c);
  if (!measured.length) return fail(x, list.length ? 'error: metrics not available yet' : all ? 'No resources found' : `No resources found in ${x.ns} namespace.`);
  const rows = order(measured.map(r => ({ ...r, cpu: r.c.reduce((t, c) => t + c.cpu, 0), memory: r.c.reduce((t, c) => t + c.memory, 0) })));
  const ns = (p: JObj) => all ? `${nsOf(p)}\t` : '', mem = (b: number) => `${Math.floor(b / MI)}Mi`;
  if (x.flags.bools.has('containers')) return print([`${all ? 'NAMESPACE\t' : ''}POD\tNAME\tCPU(cores)\tMEMORY(bytes)`, ...rows.flatMap(r => r.c.map(c => `${ns(r.p)}${nameOf(r.p)}\t${c.name}\t${c.cpu}m\t${mem(c.memory)}`))]);
  return print([`${all ? 'NAMESPACE\t' : ''}NAME\tCPU(cores)\tMEMORY(bytes)`, ...rows.map(r => `${ns(r.p)}${nameOf(r.p)}\t${r.cpu}m\t${mem(r.memory)}`)]);
}

import type { Seconds } from './clock';
import { podRequests } from './kube-api';
import { podsOnNode } from './kube-sched';
import { rolesOf } from './kube-print';
import { taintText } from './kube-system';
import {
  arr, bytesOf, cpuMilli, createdOf, goTab, humanDuration, nameOf, nsOf, obj, parseStamp, quantityText, rfc1123, str, uidOf,
  type J, type JObj, type KubeEvent, type KubeState,
} from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §9): kubectl describe for pods, nodes and namespaces (other kinds:
 * their metadata). The text is written the way kubectl's describers write it — "Field:\tvalue" lines, two spaces per
 * level, Conditions rows with a space before each tab — through one tabwriter (minwidth 0, padding 2), so columns line up
 * per block of consecutive lines as they do in kubectl. Events of the object come last (Age: "3m (x4 over 5m)").
 */

const multi = (head: string, values: string[], level = '') => values.length ? [`${level}${head}\t${values[0]}`, ...values.slice(1).map(v => `${level}\t${v}`)] : [`${level}${head}\t<none>`];
/** A map's entries, one per line (describe skips the last-applied-configuration annotation, as kubectl does). */
const mapLines = (m: J | undefined, sep: string) => Object.keys(obj(m)).filter(k => k !== 'kubectl.kubernetes.io/last-applied-configuration').sort().map(k => `${k}${sep}${String(obj(m)[k])}`);
const when = (s: J | undefined) => { const t = parseStamp(str(s)); return t === undefined ? '' : rfc1123(t); };

/** The Events section of an object (by uid), oldest first. */
export function eventLines(k: KubeState, id: string, now: Seconds): string[] {
  const list = k.events.filter(e => e.uid === id);
  if (!list.length) return ['Events:\t<none>'];
  const age = (e: KubeEvent) => e.count > 1 ? `${humanDuration(now - e.last)} (x${e.count} over ${humanDuration(now - e.first)})` : humanDuration(now - e.first);
  return ['Events:', '  Type\tReason\tAge\tFrom\tMessage', '  ----\t------\t----\t----\t-------', ...list.map(e => `  ${e.type}\t${e.reason}\t${age(e)}\t${e.source}\t${e.message}`)];
}

function stateLines(st0: J | undefined, head: string): string[] {
  const st = obj(st0), [kind] = Object.keys(st), v = obj(st[kind]);
  if (!kind) return [`    ${head}:\tWaiting`];
  if (kind === 'running') return [`    ${head}:\tRunning`, `      Started:\t${when(v.startedAt)}`];
  if (kind === 'waiting') return [`    ${head}:\tWaiting`, ...str(v.reason) ? [`      Reason:\t${str(v.reason)}`] : []];
  return [`    ${head}:\tTerminated`, `      Reason:\t${str(v.reason) ?? ''}`, ...str(v.message) ? [`      Message:\t${str(v.message)}`] : [], `      Exit Code:\t${String(v.exitCode ?? 0)}`, `      Started:\t${when(v.startedAt)}`, `      Finished:\t${when(v.finishedAt)}`];
}
function containerLines(c0: J, cs0: J | undefined): string[] {
  const c = obj(c0), cs = obj(cs0), r = obj(c.resources), ports = arr(c.ports).map(obj), lines = [`  ${str(c.name)}:`];
  if (str(cs.containerID)) lines.push(`    Container ID:\t${str(cs.containerID)}`);
  lines.push(`    Image:\t${str(c.image) ?? ''}`, ...str(cs.imageID) ? [`    Image ID:\t${str(cs.imageID)}`] : []);
  if (ports.length) lines.push(`    Port:\t${ports.map(p => `${String(p.containerPort)}/${str(p.protocol) ?? 'TCP'}`).join(', ')}`, `    Host Port:\t${ports.map(p => `${String(p.hostPort ?? 0)}/${str(p.protocol) ?? 'TCP'}`).join(', ')}`);
  else lines.push('    Port:\t<none>', '    Host Port:\t<none>');
  const cmd = arr(c.command), args = arr(c.args);
  if (cmd.length) lines.push('    Command:', ...cmd.map(a => `      ${String(a)}`));
  if (args.length) lines.push('    Args:', ...args.map(a => `      ${String(a)}`));
  if (cs0 !== undefined) {
    lines.push(...stateLines(cs.state, 'State'));
    if (Object.keys(obj(cs.lastState)).length) lines.push(...stateLines(cs.lastState, 'Last State'));
    lines.push(`    Ready:\t${cs.ready === true ? 'True' : 'False'}`, `    Restart Count:\t${String(cs.restartCount ?? 0)}`);
  }
  for (const [head, m] of [['Limits', r.limits], ['Requests', r.requests]] as const) if (Object.keys(obj(m)).length) lines.push(`    ${head}:`, ...Object.keys(obj(m)).sort().map(k => `      ${k}:\t${quantityText(obj(m)[k]) ?? ''}`));
  const env = arr(c.env).map(obj);
  lines.push(...env.length ? ['    Environment:', ...env.map(e => `      ${str(e.name)}:\t${str(e.value) ?? ''}`)] : ['    Environment:\t<none>']);
  const mounts = arr(c.volumeMounts).map(obj);
  lines.push(...mounts.length ? ['    Mounts:', ...mounts.map(m => `      ${str(m.mountPath)} from ${str(m.name)} (${m.readOnly ? 'ro' : 'rw'})`)] : ['    Mounts:\t<none>']);
  return lines;
}

function describePod(k: KubeState, o: JObj, now: Seconds): string[] {
  const m = obj(o.metadata), spec = obj(o.spec), status = obj(o.status), node = k.nodes.find(n => n.name === str(spec.nodeName));
  const csByName = (list: J | undefined) => new Map(arr(list).map(x => [str(obj(x).name) ?? '', x]));
  const main = csByName(status.containerStatuses), inits = csByName(status.initContainerStatuses);
  const lines = [`Name:\t${nameOf(o)}`, `Namespace:\t${nsOf(o) ?? 'default'}`, `Priority:\t${String(spec.priority ?? 0)}`, ...str(spec.priorityClassName) ? [`Priority Class Name:\t${str(spec.priorityClassName)}`] : [],
    `Service Account:\t${str(spec.serviceAccountName) ?? 'default'}`, `Node:\t${node ? `${node.name}/${node.address}` : '<none>'}`, ...status.startTime ? [`Start Time:\t${when(status.startTime)}`] : [],
    ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': ')), `Status:\t${str(status.phase) ?? 'Pending'}`];
  const ip = str(status.podIP);
  lines.push(`IP:\t${ip ?? ''}`, ...ip ? ['IPs:', `  IP:\t${ip}`] : ['IPs:\t<none>']);
  if (arr(spec.initContainers).length) lines.push('Init Containers:', ...arr(spec.initContainers).flatMap(c => containerLines(c, inits.get(str(obj(c).name) ?? ''))));
  lines.push('Containers:', ...arr(spec.containers).flatMap(c => containerLines(c, main.get(str(obj(c).name) ?? ''))));
  const conds = arr(status.conditions).map(obj);
  if (conds.length) lines.push('Conditions:', '  Type \tStatus', ...conds.map(c => `  ${str(c.type)} \t${str(c.status)} `));
  const vols = arr(spec.volumes).map(obj);
  lines.push(...vols.length ? ['Volumes:', ...vols.flatMap(v => [`  ${str(v.name)}:`, '    Type:\tProjected (a volume that contains injected data from multiple sources)', '    TokenExpirationSeconds:\t3607',
    '    ConfigMapName:\tkube-root-ca.crt', '    Optional:\tfalse', '    DownwardAPI:\ttrue'])] : ['Volumes:\t<none>']);
  const tol = arr(spec.tolerations).map(obj).map(t => `${str(t.key) ?? ''}${str(t.value) ? `=${str(t.value)}` : ''}${str(t.effect) ? `:${str(t.effect)}` : ''} op=${str(t.operator) ?? 'Equal'}${typeof t.tolerationSeconds === 'number' ? ` for ${t.tolerationSeconds}s` : ''}`);
  lines.push(`QoS Class:\t${str(status.qosClass) ?? 'BestEffort'}`, ...multi('Node-Selectors:', mapLines(spec.nodeSelector, '=')), ...multi('Tolerations:', tol), ...eventLines(k, uidOf(o), now));
  return lines;
}

const cpuText = (m: number) => m % 1000 === 0 ? String(m / 1000) : `${m}m`;
const memText = (b: number) => { for (const [u, f] of [['Gi', 1024 ** 3], ['Mi', 1024 ** 2], ['Ki', 1024]] as const) if (b && b % f === 0) return `${b / f}${u}`; return String(b); };
const pct = (v: number, all: number) => `${Math.floor(all ? v * 100 / all : 0)}%`;
function describeNode(k: KubeState, o: JObj, now: Seconds): string[] {
  const n = k.nodes.find(x => x.name === nameOf(o))!, s = obj(o.status), info = obj(s.nodeInfo), m = obj(o.metadata);
  const lines = [`Name:\t${n.name}`, `Roles:\t${rolesOf(n.labels)}`, ...multi('Labels:', mapLines(n.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': ')),
    `CreationTimestamp:\t${rfc1123(n.created)}`, ...multi('Taints:', n.taints.map(taintText)), `Unschedulable:\t${obj(o.spec).unschedulable ? 'true' : 'false'}`,
    'Conditions:', '  Type\tStatus\tLastHeartbeatTime\tLastTransitionTime\tReason\tMessage', '  ----\t------\t-----------------\t------------------\t------\t-------',
    ...arr(s.conditions).map(obj).map(c => `  ${str(c.type)} \t${str(c.status)} \t${when(c.lastHeartbeatTime)} \t${when(c.lastTransitionTime)} \t${str(c.reason)} \t${str(c.message)}`),
    'Addresses:', `  InternalIP:\t${n.address}`, `  Hostname:\t${n.name}`];
  for (const head of ['Capacity', 'Allocatable']) lines.push(`${head}:`, ...mapLines(s.capacity, ':\t').map(l => `  ${l}`));
  lines.push('System Info:', `  Machine ID:\t${str(info.machineID)}`, `  System UUID:\t${str(info.systemUUID)}`, `  Boot ID:\t${str(info.bootID)}`, `  Kernel Version:\t${str(info.kernelVersion)}`, `  OS Image:\t${str(info.osImage)}`,
    `  Operating System:\t${str(info.operatingSystem)}`, `  Architecture:\t${str(info.architecture)}`, `  Container Runtime Version:\t${str(info.containerRuntimeVersion)}`, `  Kubelet Version:\t${str(info.kubeletVersion)}`,
    `  Kube-Proxy Version:\t${str(info.kubeProxyVersion)}`, `PodCIDR:\t${n.cidr}`, `PodCIDRs:\t${n.cidr}`);
  const pods = podsOnNode(k, n.name).sort((a, b) => (nsOf(a) ?? '').localeCompare(nsOf(b) ?? '') || nameOf(a).localeCompare(nameOf(b)));
  const lim = (p: JObj, key: 'cpu' | 'memory') => arr(obj(p.spec).containers).reduce<number>((t, c) => { const v = quantityText(obj(obj(obj(c).resources).limits)[key]); return t + (v ? (key === 'cpu' ? cpuMilli(v) : bytesOf(v)) ?? 0 : 0); }, 0);
  lines.push(`Non-terminated Pods:\t(${pods.length} in total)`, '  Namespace\tName\tCPU Requests\tCPU Limits\tMemory Requests\tMemory Limits\tAge', '  ---------\t----\t------------\t----------\t---------------\t-------------\t---',
    ...pods.map(p => { const r = podRequests(p); return `  ${nsOf(p)}\t${nameOf(p)}\t${cpuText(r.cpu)} (${pct(r.cpu, n.cpu)})\t${cpuText(lim(p, 'cpu'))} (${pct(lim(p, 'cpu'), n.cpu)})\t${memText(r.memory)} (${pct(r.memory, n.memory)})\t${memText(lim(p, 'memory'))} (${pct(lim(p, 'memory'), n.memory)})\t${humanDuration(now - (createdOf(p) ?? now))}`; }));
  const sum = (f: (p: JObj) => number) => pods.reduce((t, p) => t + f(p), 0), rc = sum(p => podRequests(p).cpu), rm = sum(p => podRequests(p).memory), lc = sum(p => lim(p, 'cpu')), lm = sum(p => lim(p, 'memory'));
  lines.push('Allocated resources:', '  (Total limits may be over 100 percent, i.e., overcommitted.)', '  Resource\tRequests\tLimits', '  --------\t--------\t------',
    `  cpu\t${cpuText(rc)} (${pct(rc, n.cpu)})\t${cpuText(lc)} (${pct(lc, n.cpu)})`, `  memory\t${memText(rm)} (${pct(rm, n.memory)})\t${memText(lm)} (${pct(lm, n.memory)})`,
    '  ephemeral-storage\t0 (0%)\t0 (0%)', '  hugepages-1Gi\t0 (0%)\t0 (0%)', '  hugepages-2Mi\t0 (0%)\t0 (0%)', ...eventLines(k, `node/${n.name}`, now));
  return lines;
}

export function describeObject(k: KubeState, kind: string, o: JObj, now: Seconds): string[] {
  const m = obj(o.metadata);
  let lines: string[];
  if (kind === 'Pod') lines = describePod(k, o, now);
  else if (kind === 'Node') lines = describeNode(k, o, now);
  else if (kind === 'Namespace') lines = [`Name:\t${nameOf(o)}`, ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': ')), `Status:\t${str(obj(o.status).phase) ?? 'Active'}`, '', 'No resource quota.', '', 'No LimitRange resource.'];
  else lines = [`Name:\t${nameOf(o)}`, ...nsOf(o) ? [`Namespace:\t${nsOf(o)}`] : [], ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': ')), `（模擬環境：${kind} 的其他欄位在之後的引擎階段才模擬）`];
  return goTab(lines, 0, 2);
}

import type { FsState } from './fs';
import { find } from './kube-api';
import { settleKube } from './kube-settle';
import { clusterView, podView } from './kube-net';
import { kubeResolver, podHostsFile, resolvConf } from './kube-dns';
import { reach } from './sockets';
import { netFailure, type NetCheck } from './net-lesson';
import { externalIp, isHeadless, portsOf, selectorOf, typeOfSvc } from './kube-service-spec';
import { arr, kindOf, nameOf, nsOf, obj, str, uidOf, type JObj } from './kube-model';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §9): the check kube-service (a Service's type, whether it has a
 * ClusterIP, its ports, selector, EXTERNAL-IP and the ready addresses of its Endpoints) and the place a check's request
 * comes from: the existing http and reach checks with pod (ns/name or name in default) are made from inside that pod
 * (cluster DNS, ClusterIPs); without pod, on a kube-net machine, from the learner's machine with the cluster's outside
 * (NodePorts, LoadBalancers). All read the cluster settled to the clock and never move it.
 */

export interface ServiceCheckPort { port: number; targetPort?: number | string; nodePort?: number; protocol?: 'TCP' | 'UDP' | 'SCTP' }
export type ServiceCheck = { kind: 'kube-service'; name: string; namespace?: string; type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer'; clusterIP?: boolean; ports?: ServiceCheckPort[];
  selector?: Record<string, string>; readyEndpoints?: number; addresses?: string[]; externalIP?: string };
export const SERVICE_CHECK_KINDS = ['kube-service'] as const;
const LINE = (t: unknown, max = 253) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const PORT = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 65535;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

export function serviceCheckProblems(c: ServiceCheck, net: boolean): string | null {
  if (!net) return 'a kube-service check needs a kube-net machine (engine stage E35)';
  if (!LINE(c.name, 63) || (c.namespace !== undefined && !LINE(c.namespace, 63))) return 'a kube-service check needs a name (and a namespace name)';
  if (c.type !== undefined && !['ClusterIP', 'NodePort', 'LoadBalancer'].includes(c.type)) return 'a kube-service check\'s type is ClusterIP, NodePort or LoadBalancer';
  if (c.clusterIP !== undefined && typeof c.clusterIP !== 'boolean') return 'a kube-service check\'s clusterIP is true (a ClusterIP) or false (headless)';
  if (c.ports !== undefined && (!Array.isArray(c.ports) || !c.ports.length || c.ports.some(p => !PORT(p.port) || (p.nodePort !== undefined && !PORT(p.nodePort))
    || (p.targetPort !== undefined && !PORT(p.targetPort) && !LINE(p.targetPort, 15)) || (p.protocol !== undefined && !['TCP', 'UDP', 'SCTP'].includes(p.protocol)))))
    return 'a kube-service check\'s ports are { port, targetPort?, nodePort?, protocol? } with ports 1..65535';
  if (c.selector !== undefined && (typeof c.selector !== 'object' || Object.values(c.selector).some(v => typeof v !== 'string'))) return 'a kube-service check\'s selector is a map of labels';
  if (c.readyEndpoints !== undefined && !(Number.isInteger(c.readyEndpoints) && c.readyEndpoints >= 0)) return 'a kube-service check\'s readyEndpoints is a whole number';
  if (c.addresses !== undefined && (!Array.isArray(c.addresses) || c.addresses.some(a => typeof a !== 'string' || !IPV4.test(a)))) return 'a kube-service check\'s addresses are IPv4 addresses';
  if (c.externalIP !== undefined && !(c.externalIP === '<pending>' || IPV4.test(c.externalIP))) return 'a kube-service check\'s externalIP is an IPv4 address or <pending>';
  if ([c.type, c.clusterIP, c.ports, c.selector, c.readyEndpoints, c.addresses, c.externalIP].every(v => v === undefined)) return 'a kube-service check checks type, clusterIP, ports, selector, readyEndpoints, addresses or externalIP';
  return null;
}
/** E35: an http or reach check's pod (ns/name or name): only on a kube-net machine. */
export const podCheckProblem = (pod: unknown, net: boolean): string | null =>
  !net ? 'pod needs a kube-net machine (engine stage E35)' : typeof pod !== 'string' || !/^([a-z0-9-]{1,63}\/)?[a-z0-9.-]{1,253}$/.test(pod) ? 'pod is a pod name (or namespace/name)' : null;

const labels = (m: Record<string, string>) => Object.keys(m).sort().map(k => `${k}=${m[k]}`).join(',');
export function describeServiceCheck(c: ServiceCheck): string {
  const parts = [c.type ? `類型 ${c.type}` : '', c.clusterIP === false ? 'headless（clusterIP: None）' : c.clusterIP ? '有 ClusterIP' : '',
    ...(c.ports ?? []).map(p => `${p.port} 埠${p.targetPort !== undefined ? `轉到 ${p.targetPort}` : ''}${p.nodePort !== undefined ? `（NodePort ${p.nodePort}）` : ''}`),
    c.selector ? `selector ${labels(c.selector)}` : '', c.readyEndpoints !== undefined ? `${c.readyEndpoints} 個就緒的端點` : '', c.addresses ? `就緒的端點是 ${c.addresses.join('、') || '無'}` : '',
    c.externalIP ? `EXTERNAL-IP ${c.externalIP}` : ''].filter(Boolean);
  return `${c.namespace ?? 'default'} 命名空間應該有名為 ${c.name} 的 Service（${parts.join('、')}）`;
}

/** The ready addresses of a Service's Endpoints (unique, in order). */
export function readyAddresses(end: FsState, svc: JObj): string[] {
  const ep = end.kube!.objects.find(o => kindOf(o) === 'Endpoints' && nameOf(o) === nameOf(svc) && nsOf(o) === nsOf(svc));
  return [...new Set(arr(ep?.subsets).flatMap(s => arr(obj(s).addresses).map(a => str(obj(a).ip) ?? '')))];
}
export function serviceCheckFailure(c: ServiceCheck, end0: FsState): string | null {
  const end = settleKube(end0), k = end.kube;
  if (!k) return '這台機器沒有叢集';
  const svc = find(k, 'Service', c.namespace ?? 'default', c.name);
  if (!svc) return `沒有名為 ${c.name} 的 Service`;
  if (c.type && typeOfSvc(svc) !== c.type) return `${c.name} 的類型是 ${typeOfSvc(svc)}`;
  if (c.clusterIP === true && isHeadless(svc)) return `${c.name} 是 headless（clusterIP: None）`;
  if (c.clusterIP === false && !isHeadless(svc)) return `${c.name} 的 ClusterIP 是 ${str(obj(svc.spec).clusterIP) ?? ''}`;
  for (const w of c.ports ?? []) {
    const p = portsOf(svc).find(x => x.port === w.port && (w.protocol === undefined || (str(x.protocol) ?? 'TCP') === w.protocol));
    if (!p) return `${c.name} 沒有 ${w.port} 埠`;
    if (w.targetPort !== undefined && String(p.targetPort ?? p.port) !== String(w.targetPort)) return `${c.name} 的 ${w.port} 埠轉到 ${String(p.targetPort ?? p.port)}`;
    if (w.nodePort !== undefined && p.nodePort !== w.nodePort) return `${c.name} 的 ${w.port} 埠的 NodePort 是 ${typeof p.nodePort === 'number' ? p.nodePort : '沒有'}`;
  }
  const sel = selectorOf(svc) ?? {};
  if (c.selector && labels(sel) !== labels(c.selector)) return `${c.name} 的 selector 是 ${labels(sel) || '<none>'}`;
  const ready = readyAddresses(end, svc);
  if (c.readyEndpoints !== undefined && ready.length !== c.readyEndpoints) return `${c.name} 有 ${ready.length} 個就緒的端點`;
  if (c.addresses && [...ready].sort().join(',') !== [...c.addresses].sort().join(',')) return `${c.name} 的就緒端點是 ${ready.join('、') || '（沒有）'}`;
  if (c.externalIP && externalIp(svc) !== c.externalIP) return `${c.name} 的 EXTERNAL-IP 是 ${externalIp(svc)}`;
  return null;
}

/** The state a check acts from: inside a pod (its files for /etc/hosts, its network view), or the learner's machine with the cluster's outside. */
export function checkPlace(end0: FsState, pod?: string): FsState | { error: string } {
  const end = settleKube(end0), k = end.kube;
  if (pod === undefined) return k?.net ? clusterView(end) : end0;
  if (!k) return { error: '這台機器沒有叢集' };
  const [ns, name] = pod.includes('/') ? pod.split('/') : ['default', pod], o = find(k, 'Pod', ns, name), sim = o ? k.pods[uidOf(o)] : undefined;
  if (!o) return { error: `沒有名為 ${pod} 的 Pod` };
  if (!sim?.ip || sim.main.every(c => c.state !== 'running')) return { error: `${pod} 沒有在執行` };
  const file = (content: string) => ({ kind: 'file' as const, mode: 0o644, owner: 'root', content });
  return { nodes: new Map([['/etc/hosts', file(podHostsFile(sim.ip, name))], ['/etc/resolv.conf', file(resolvConf(ns))]]), cwd: '/', user: 'root', home: '/root', host: name,
    ...end.clock ? { clock: end.clock } : {}, ...podView(end, o) };
}

/** E35: a reach check on a kube-net machine: from a pod (cluster DNS), or from the learner's machine with the cluster's outside. */
export function kubeReachFailure(c: Extract<NetCheck, { kind: 'reach' }>, end: FsState): string | null {
  const place = checkPlace(end, c.pod);
  if ('error' in place) return place.error;
  if (c.pod === undefined) return netFailure(c, place);
  const r0 = kubeResolver(place, c.to, 4);
  if ('error' in r0) return `Pod ${c.pod} 查不到 ${c.to}`;
  const r = reach(place, r0.found.address, c.port), got = r.result === 'ok' ? 'succeeded' : r.result === 'refused' ? 'refused' : 'timeout';
  const word = { succeeded: '成功', refused: '被拒絕', timeout: '逾時' } as const;
  return got === c.result ? null : `結果是${word[got]}`;
}

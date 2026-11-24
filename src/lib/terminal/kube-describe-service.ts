import type { Seconds } from './clock';
import { eventLines, mapLines, multi } from './kube-describe';
import { formatEndpoints } from './kube-endpoints';
import { lbIpOf, portsOf, selectorOf } from './kube-service-spec';
import { arr, goTab, kindOf, nameOf, nsOf, obj, str, uidOf, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §4): kubectl describe service and endpoints as kubectl's
 * describers write them — Selector, Type, IP Family Policy, IP Families, IP, IPs, LoadBalancer Ingress, then per port its
 * Port, TargetPort, NodePort and Endpoints (the ready addresses of that port, at most three), Session Affinity, the
 * traffic policies and the Events (the LoadBalancer pool's IPAllocated); Endpoints: its Subsets with Addresses,
 * NotReadyAddresses and a Ports table.
 */

export function describeService(k: KubeState, svc: JObj, now: Seconds): string[] {
  const m = obj(svc.metadata), spec = obj(svc.spec), sel = selectorOf(svc) ?? {};
  const ep = k.objects.find(o => kindOf(o) === 'Endpoints' && nameOf(o) === nameOf(svc) && nsOf(o) === nsOf(svc));
  const ips = arr(spec.clusterIPs).map(String), fams = arr(spec.ipFamilies).map(String), lb = lbIpOf(svc);
  const lines = [`Name:\t${nameOf(svc)}`, `Namespace:\t${nsOf(svc) ?? 'default'}`, ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': ')),
    `Selector:\t${Object.keys(sel).sort().map(x => `${x}=${sel[x]}`).join(',') || '<none>'}`, `Type:\t${str(spec.type) ?? 'ClusterIP'}`,
    ...str(spec.ipFamilyPolicy) ? [`IP Family Policy:\t${str(spec.ipFamilyPolicy)}`] : [], `IP Families:\t${fams.join(',') || '<none>'}`,
    `IP:\t${str(spec.clusterIP) ?? ''}`, `IPs:\t${ips.join(',') || '<none>'}`,
    ...str(spec.loadBalancerIP) ? [`Desired LoadBalancer IP:\t${str(spec.loadBalancerIP)}`] : [], ...lb ? [`LoadBalancer Ingress:\t${lb} (VIP)`] : []];
  for (const p of portsOf(svc)) {
    const name = str(p.name) || '<unset>', proto = str(p.protocol) ?? 'TCP';
    lines.push(`Port:\t${name}\t${String(p.port)}/${proto}`, `TargetPort:\t${String(p.targetPort ?? p.port)}/${proto}`);
    if (typeof p.nodePort === 'number') lines.push(`NodePort:\t${name}\t${p.nodePort}/${proto}`);
    lines.push(`Endpoints:\t${ep ? formatEndpoints(ep, str(p.name) ?? '') : '<none>'}`);
  }
  lines.push(`Session Affinity:\t${str(spec.sessionAffinity) ?? 'None'}`, ...str(spec.externalTrafficPolicy) ? [`External Traffic Policy:\t${str(spec.externalTrafficPolicy)}`] : [],
    ...str(spec.internalTrafficPolicy) ? [`Internal Traffic Policy:\t${str(spec.internalTrafficPolicy)}`] : [], ...eventLines(k, uidOf(svc), now));
  return goTab(lines, 0, 2);
}

export function describeEndpoints(k: KubeState, ep: JObj, now: Seconds): string[] {
  const m = obj(ep.metadata), ips = (list: unknown) => arr(list as never).map(a => str(obj(a).ip) ?? '').join(',') || '<none>';
  const lines = [`Name:\t${nameOf(ep)}`, `Namespace:\t${nsOf(ep) ?? 'default'}`, ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': ')), 'Subsets:'];
  for (const s0 of arr(ep.subsets)) {
    const s = obj(s0), ports = arr(s.ports).map(obj);
    lines.push(`  Addresses:\t${ips(s.addresses)}`, `  NotReadyAddresses:\t${ips(s.notReadyAddresses)}`);
    if (ports.length) lines.push('  Ports:', '    Name\tPort\tProtocol', '    ----\t----\t--------', ...ports.map(p => `    ${str(p.name) || '<unset>'}\t${String(p.port)}\t${str(p.protocol) ?? 'TCP'}`));
    lines.push('');
  }
  lines.push(...eventLines(k, uidOf(ep), now));
  return goTab(lines, 0, 2);
}

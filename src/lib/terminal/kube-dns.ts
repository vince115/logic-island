import type { FsState } from './fs';
import { hostsLookup, isIPv4, type Resolver } from './sockets';
import { endpointsOf } from './kube-endpoints';
import { isHeadless } from './kube-service-spec';
import { kindOf, nameOf, nsOf, obj, str, type KubeState } from './kube-model';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §5): cluster DNS as CoreDNS answers it and as a pod's glibc
 * asks. Every Service has <name>.<namespace>.svc.cluster.local: its ClusterIP, or (headless) the addresses of its ready
 * pods in address order (publishNotReadyAddresses: all of them); pods have <a-b-c-d>.<namespace>.pod.cluster.local. A pod's
 * /etc/resolv.conf is the kubelet's (search <ns>.svc.cluster.local svc.cluster.local cluster.local, nameserver 10.96.0.10,
 * options ndots:5): a name with fewer than five dots is tried with each search domain first, then as it is; a name ending
 * in a dot only as it is. Names outside cluster.local are not found (the simulated cluster has no upstream resolver).
 */

export const CLUSTER_DOMAIN = 'cluster.local';
export const DNS_IP = '10.96.0.10';
/** What CoreDNS answers (FQDN → A records) and the pod's search list and ndots. */
export interface KubeDns { search: readonly string[]; ndots: number; records: Readonly<Record<string, readonly string[]>> }

export const searchOf = (ns: string) => [`${ns}.svc.${CLUSTER_DOMAIN}`, `svc.${CLUSTER_DOMAIN}`, CLUSTER_DOMAIN];
/** The kubelet's /etc/resolv.conf for a pod of the namespace (dnsPolicy ClusterFirst). */
export const resolvConf = (ns: string) => `search ${searchOf(ns).join(' ')}\nnameserver ${DNS_IP}\noptions ndots:5\n`;
/** The kubelet's /etc/hosts for a pod. */
export const podHostsFile = (ip: string, pod: string) =>
  `# Kubernetes-managed hosts file.\n127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\nfe00::0\tip6-localnet\nfe00::0\tip6-mcastprefix\nfe00::1\tip6-allnodes\nfe00::2\tip6-allrouters\n${ip}\t${pod}\n`;

/** CoreDNS's records of the cluster now, and the search list of a pod of the namespace. */
export function kubeDns(k: KubeState, ns: string): KubeDns {
  const records: Record<string, string[]> = {};
  for (const svc of k.objects) {
    if (kindOf(svc) !== 'Service') continue;
    const fqdn = `${nameOf(svc)}.${nsOf(svc) ?? 'default'}.svc.${CLUSTER_DOMAIN}`;
    if (isHeadless(svc)) {
      const publish = obj(svc.spec).publishNotReadyAddresses === true, ips = endpointsOf(k, svc).filter(e => publish ? !e.terminating : e.ready).map(e => e.ip);
      if (ips.length) records[fqdn] = [...new Set(ips)];
    } else { const ip = str(obj(svc.spec).clusterIP); if (ip) records[fqdn] = [ip]; }
  }
  return { search: searchOf(ns), ndots: 5, records };
}

/** The names a lookup tries, in order (glibc's res_search with ndots). */
export function candidates(name: string, dns: Pick<KubeDns, 'search' | 'ndots'>): string[] {
  const lower = name.toLowerCase();
  if (lower.endsWith('.')) return [lower.slice(0, -1)];
  const dots = lower.split('.').length - 1, searched = dns.search.map(s => `${lower}.${s}`);
  return dots >= dns.ndots ? [lower, ...searched] : [...searched, lower];
}
/** CoreDNS's answer for an FQDN (a Service, or a pod's dashed address), or none. */
export function answer(dns: KubeDns, fqdn: string): readonly string[] {
  const own = dns.records[fqdn];
  if (own) return own;
  const pod = /^(\d+)-(\d+)-(\d+)-(\d+)\.[a-z0-9-]+\.pod\.cluster\.local$/.exec(fqdn);
  const ip = pod ? pod.slice(1, 5).join('.') : '';
  return pod && isIPv4(ip) ? [ip] : [];
}
/** A pod's lookup: its /etc/hosts, then cluster DNS through the search list (getent prints every address of a headless name). */
export const kubeResolver: Resolver = (state, name, family) => {
  if (family === 4 && isIPv4(name)) return { state, found: { address: name, name, aliases: [] } };
  const e = hostsLookup(state, name, family);
  if (e) return { state, found: { address: e.address, name: e.names[0], aliases: e.names.slice(1) } };
  const dns = state.kubeNet?.dns;
  if (!dns || family === 6) return { state, error: 'notfound' };
  for (const c of candidates(name, dns)) {
    const ips = answer(dns, c);
    if (ips.length) return { state, found: { address: ips[0], name: c, aliases: [], ...ips.length > 1 ? { addresses: [...ips] } : {} } };
  }
  return { state, error: 'notfound' };
};

/**
 * nslookup NAME [SERVER] in a pod, as Ubuntu's bind9-dnsutils prints it: the cluster's name server, then each A record
 * of the first search-list name that has any (NXDOMAIN: ** server can't find, exit 1). It asks DNS only (not /etc/hosts).
 */
export function nslookup(state: FsState, args: readonly string[]): { out: string[]; err: string[]; status: number } {
  const words = args.filter(a => !a.startsWith('-')), [name, server] = words;
  if (!name) return { out: [], err: ['nslookup：模擬環境的 nslookup 需要一個名稱（nslookup 名稱 [伺服器]）'], status: 1 };
  if (server !== undefined && server !== DNS_IP && !candidates(server, state.kubeNet?.dns ?? { search: [], ndots: 5 }).some(c => c === `kube-dns.kube-system.svc.${CLUSTER_DOMAIN}`)) return { out: [';; connection timed out; no servers could be reached', ''], err: [], status: 1 };
  const head = [`Server:\t\t${DNS_IP}`, `Address:\t${DNS_IP}#53`, ''];
  if (isIPv4(name)) return { out: [...head, `** server can't find ${name.split('.').reverse().join('.')}.in-addr.arpa: NXDOMAIN`, ''], err: [], status: 1 };
  const dns = state.kubeNet?.dns;
  for (const c of dns ? candidates(name, dns) : []) {
    const ips = answer(dns!, c);
    if (ips.length) return { out: [...head, ...ips.flatMap(ip => [`Name:\t${c}`, `Address: ${ip}`]), ''], err: [], status: 0 };
  }
  return { out: [...head, `** server can't find ${name.replace(/\.$/, '')}: NXDOMAIN`, ''], err: [], status: 1 };
}

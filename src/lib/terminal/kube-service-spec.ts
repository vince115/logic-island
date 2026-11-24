import { hex } from './docker';
import { ipNumber, ipText, isIPv4 } from './sockets';
import { arr, kindOf, nameOf, nsOf, obj, str, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §2): Service v1 objects. The API server's defaults (type
 * ClusterIP, sessionAffinity None, the policies, ipFamilies, protocol TCP, targetPort = port), its validation (DNS-1035
 * names, ports, named targetPorts as IANA service names, nodePort only for NodePort and LoadBalancer, headless only for
 * ClusterIP) and its allocators: a ClusterIP in 10.96.0.0/12 and NodePorts in 30000–32767, each hashed from the
 * Service's namespace and name into the range's dynamic band, the next free one on a collision (the real allocators pick
 * at random). An explicit address or port is checked against the range and the others. The ClusterIP never changes.
 */

export const SERVICE_CIDR = '10.96.0.0/12';
const CIDR_BASE = ipNumber('10.96.0.0'), CIDR_SIZE = 2 ** 20, IP_BAND = 256;
export const NODE_PORT_MIN = 30000, NODE_PORT_MAX = 32767;
const PORT_BAND = 86;
export const SERVICE_TYPES = ['ClusterIP', 'ExternalName', 'LoadBalancer', 'NodePort'];
export const typeOfSvc = (svc: JObj) => str(obj(svc.spec).type) ?? 'ClusterIP';
export const isHeadless = (svc: JObj) => str(obj(svc.spec).clusterIP) === 'None';
export const hasNodePorts = (svc: JObj) => typeOfSvc(svc) === 'NodePort' || (typeOfSvc(svc) === 'LoadBalancer' && obj(svc.spec).allocateLoadBalancerNodePorts !== false);
export const portsOf = (svc: JObj) => arr(obj(svc.spec).ports).map(obj);
export const selectorOf = (svc: JObj): Record<string, string> | undefined => {
  const s = obj(svc.spec).selector;
  return s && typeof s === 'object' && !Array.isArray(s) ? Object.fromEntries(Object.entries(s).filter((e): e is [string, string] => typeof e[1] === 'string')) : undefined;
};
/** A Service port's key for kube-proxy's turn (namespace/name/port name or number). */
export const portKey = (svc: JObj, p: JObj) => `${nsOf(svc) ?? 'default'}/${nameOf(svc)}/${str(p.name) || String(p.port)}`;

const DNS1035 = /^[a-z]([-a-z0-9]*[a-z0-9])?$/;
const DNS1035_TEXT = "a DNS-1035 label must consist of lower case alphanumeric characters or '-', start with an alphabetic character, and end with an alphanumeric character (e.g. 'my-name',  or 'abc-123', regex used for validation is '[a-z]([-a-z0-9]*[a-z0-9])?')";
const LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const LABEL_TEXT = "a lowercase RFC 1123 label must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character (e.g. 'my-name',  or '123-abc', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?')";
const RANGE_TEXT = 'must be between 1 and 65535, inclusive';
const PROTOCOLS = ['SCTP', 'TCP', 'UDP'];

/** validation.IsValidPortName: an IANA service name (null: valid). */
export function portNameProblem(name: string): string | null {
  if (name.length > 15) return 'must be no more than 15 characters';
  if (!/^[-a-z0-9]+$/.test(name)) return 'must contain only alpha-numeric characters (a-z, 0-9), and hyphens (-)';
  if (!/[a-z]/.test(name)) return 'must contain at least one letter (a-z)';
  if (name.includes('--')) return 'must not contain consecutive hyphens';
  if (name.startsWith('-') || name.endsWith('-')) return 'must not begin or end with a hyphen';
  return null;
}

/** Fields of real Services the simulation leaves to the lesson's prose (the first one the document uses). */
export function serviceLater(doc: JObj): { path: string; stage: string } | null {
  const spec = obj(doc.spec), prose = '（課文說明）';
  if (str(spec.type) === 'ExternalName' || spec.externalName !== undefined) return { path: 'spec.type: ExternalName', stage: prose };
  for (const k of ['externalIPs', 'loadBalancerSourceRanges', 'sessionAffinityConfig', 'loadBalancerClass', 'healthCheckNodePort', 'trafficDistribution']) if (spec[k] !== undefined) return { path: `spec.${k}`, stage: prose };
  for (const k of ['externalTrafficPolicy', 'internalTrafficPolicy']) if (str(spec[k]) === 'Local') return { path: `spec.${k}: Local`, stage: prose };
  if (arr(spec.ipFamilies).some(f => f !== 'IPv4') || (spec.ipFamilyPolicy !== undefined && spec.ipFamilyPolicy !== 'SingleStack')) return { path: 'spec.ipFamilies', stage: prose };
  return null;
}

/** The API server's defaults of a Service (idempotent). */
export function defaultService(doc: JObj): JObj {
  const spec = { ...obj(doc.spec) }, type = str(spec.type) ?? 'ClusterIP';
  spec.type = type;
  spec.sessionAffinity ??= 'None';
  spec.internalTrafficPolicy ??= 'Cluster';
  spec.ipFamilies ??= ['IPv4'];
  spec.ipFamilyPolicy ??= 'SingleStack';
  if (str(spec.clusterIP) === 'None') spec.clusterIPs = ['None'];
  if (spec.ports !== undefined) spec.ports = arr(spec.ports).map(p0 => { const p = obj(p0); return { protocol: 'TCP', ...p, targetPort: p.targetPort ?? p.port ?? null }; });
  // The API server drops the fields of another type (an apply that changes the type keeps the old ones in the live object).
  if (type === 'NodePort' || type === 'LoadBalancer') spec.externalTrafficPolicy ??= 'Cluster'; else delete spec.externalTrafficPolicy;
  if (type === 'LoadBalancer') spec.allocateLoadBalancerNodePorts ??= true; else delete spec.allocateLoadBalancerNodePorts;
  return { ...doc, spec, status: doc.status && Object.keys(obj(doc.status)).length ? doc.status : { loadBalancer: {} } };
}

/** The field errors of a defaulted Service (validation before the allocators). */
export function serviceErrors(doc: JObj): string[] {
  const out: string[] = [], name = nameOf(doc), spec = obj(doc.spec), type = typeOfSvc(doc), ports = portsOf(doc), headless = isHeadless(doc);
  if (!name) out.push('metadata.name: Required value: name or generateName is required');
  else if (name.length > 63 || !DNS1035.test(name)) out.push(`metadata.name: Invalid value: "${name}": ${DNS1035_TEXT}`);
  if (!SERVICE_TYPES.includes(type)) out.push(`spec.type: Unsupported value: "${type}": supported values: ${SERVICE_TYPES.map(t => `"${t}"`).join(', ')}`);
  if (!ports.length && !headless) out.push('spec.ports: Required value');
  const names = new Set<string>();
  ports.forEach((p, i) => {
    const at = `spec.ports[${i}]`, pn = str(p.name) ?? '';
    if (ports.length > 1 && !pn) out.push(`${at}.name: Required value`);
    else if (pn && !LABEL.test(pn)) out.push(`${at}.name: Invalid value: "${pn}": ${LABEL_TEXT}`);
    else if (pn && names.has(pn)) out.push(`${at}.name: Duplicate value: "${pn}"`);
    names.add(pn);
    if (typeof p.port !== 'number' || p.port < 1 || p.port > 65535) out.push(p.port === undefined ? `${at}.port: Required value` : `${at}.port: Invalid value: ${String(p.port)}: ${RANGE_TEXT}`);
    const proto = str(p.protocol) ?? 'TCP';
    if (!PROTOCOLS.includes(proto)) out.push(`${at}.protocol: Unsupported value: "${proto}": supported values: ${PROTOCOLS.map(x => `"${x}"`).join(', ')}`);
    const tp = p.targetPort;
    if (typeof tp === 'number' && (tp < 1 || tp > 65535)) out.push(`${at}.targetPort: Invalid value: ${tp}: ${RANGE_TEXT}`);
    if (typeof tp === 'string') { const why = portNameProblem(tp); if (why) out.push(`${at}.targetPort: Invalid value: "${tp}": ${why}`); }
    if (p.nodePort !== undefined && p.nodePort !== null && type === 'ClusterIP') out.push(`${at}.nodePort: Forbidden: may not be used when \`type\` is 'ClusterIP'`);
  });
  if (headless && (type === 'NodePort' || type === 'LoadBalancer')) out.push(`spec.clusterIPs[0]: Invalid value: "None": may not be set to 'None' for ${type} services`);
  const ip = str(spec.clusterIP);
  if (ip !== undefined && ip !== '' && ip !== 'None' && !isIPv4(ip)) out.push(`spec.clusterIPs[0]: Invalid value: "${ip}": must be a valid IP address, (e.g. 10.9.8.7 or 2001:db8::ffff)`);
  const aff = str(spec.sessionAffinity) ?? 'None';
  if (!['ClientIP', 'None'].includes(aff)) out.push(`spec.sessionAffinity: Unsupported value: "${aff}": supported values: "ClientIP", "None"`);
  return out;
}

const others = (k: KubeState, svc: JObj) => k.objects.filter(o => kindOf(o) === 'Service' && !(nameOf(o) === nameOf(svc) && nsOf(o) === nsOf(svc)));
const hashed = (seed: string, size: number) => parseInt(hex(seed).slice(0, 12), 16) % size;
/** The ClusterIPs and NodePorts the other Services hold. */
export function allocated(k: KubeState, svc: JObj): { ips: Set<string>; ports: Set<number> } {
  const ips = new Set<string>(), ports = new Set<number>();
  for (const o of others(k, svc)) {
    const ip = str(obj(o.spec).clusterIP);
    if (ip && ip !== 'None') ips.add(ip);
    for (const p of portsOf(o)) if (typeof p.nodePort === 'number') ports.add(p.nodePort);
  }
  return { ips, ports };
}
/** A free ClusterIP hashed into the dynamic band of 10.96.0.0/12 (the next one on a collision). */
function freeIp(seed: string, taken: Set<string>): string {
  const band = CIDR_SIZE - IP_BAND - 1;
  for (let n = 0, at = hashed(seed, band); n < band; n++, at = (at + 1) % band) { const ip = ipText(CIDR_BASE + IP_BAND + at); if (!taken.has(ip)) return ip; }
  return ipText(CIDR_BASE + IP_BAND);
}
function freePort(seed: string, taken: Set<number>): number {
  const band = NODE_PORT_MAX - NODE_PORT_MIN - PORT_BAND + 1;
  for (let n = 0, at = hashed(seed, band); n < band; n++, at = (at + 1) % band) { const p = NODE_PORT_MIN + PORT_BAND + at; if (!taken.has(p)) return p; }
  return NODE_PORT_MIN;
}
const inCidr = (ip: string) => isIPv4(ip) && ipNumber(ip) >= CIDR_BASE && ipNumber(ip) < CIDR_BASE + CIDR_SIZE;

/**
 * The allocators: the Service with its ClusterIP and NodePorts (live: the object an apply updates — its ClusterIP and the
 * NodePorts of the same port and protocol are kept), or the errors the API server returns.
 */
export function allocate(k: KubeState, svc: JObj, live?: JObj): { o: JObj } | { errors: string[] } {
  const spec = { ...obj(svc.spec) }, taken = allocated(k, svc), errors: string[] = [], seed = `${nsOf(svc) ?? 'default'}/${nameOf(svc)}`;
  const liveIp = live ? str(obj(live.spec).clusterIP) : undefined, want = str(spec.clusterIP);
  if (live && liveIp !== undefined && want !== undefined && want !== '' && want !== liveIp) errors.push(`spec.clusterIPs[0]: Invalid value: []string{"${want}"}: may not change once set`);
  else if (liveIp !== undefined) { spec.clusterIP = liveIp; spec.clusterIPs = [liveIp]; }
  else if (want === undefined || want === '') { const ip = freeIp(`clusterip/${seed}`, taken.ips); spec.clusterIP = ip; spec.clusterIPs = [ip]; }
  else if (want !== 'None') {
    if (!inCidr(want)) errors.push(`spec.clusterIPs: Invalid value: []string{"${want}"}: failed to allocate IP ${want}: provided IP is not in the valid range. The range of valid IPs is ${SERVICE_CIDR}`);
    else if (taken.ips.has(want)) errors.push(`spec.clusterIPs: Invalid value: []string{"${want}"}: failed to allocate IP ${want}: provided IP is already allocated`);
    spec.clusterIPs = [want];
  }
  const mine = new Set<number>(), withPorts = hasNodePorts({ ...svc, spec });
  const livePorts = live ? portsOf(live) : [];
  spec.ports = portsOf({ ...svc, spec }).map((p, i): J => {
    if (!withPorts) { const { nodePort: _n, ...rest } = p; void _n; return rest; }
    let np = typeof p.nodePort === 'number' ? p.nodePort : undefined;
    if (np !== undefined) {
      const kept = livePorts.some(l => l.nodePort === np);
      if (np < NODE_PORT_MIN || np > NODE_PORT_MAX) errors.push(`spec.ports[${i}].nodePort: Invalid value: ${np}: provided port is not in the valid range. The range of valid ports is ${NODE_PORT_MIN}-${NODE_PORT_MAX}`);
      else if ((taken.ports.has(np) || mine.has(np)) && !kept) errors.push(`spec.ports[${i}].nodePort: Invalid value: ${np}: provided port is already allocated`);
    } else {
      np = livePorts.find(l => l.port === p.port && (str(l.protocol) ?? 'TCP') === (str(p.protocol) ?? 'TCP') && typeof l.nodePort === 'number')?.nodePort as number | undefined;
      np ??= freePort(`nodeport/${seed}/${i}`, new Set([...taken.ports, ...mine]));
    }
    mine.add(np);
    return { ...p, nodePort: np };
  });
  return errors.length ? { errors } : { o: { ...svc, spec } };
}

/** The ports as kubectl get svc prints them (80/TCP, 80:30080/TCP). */
export const portsText = (svc: JObj) => portsOf(svc).map(p => `${String(p.port)}${typeof p.nodePort === 'number' ? `:${p.nodePort}` : ''}/${str(p.protocol) ?? 'TCP'}`).join(',') || '<none>';
/** EXTERNAL-IP: a LoadBalancer's address (or <pending>), else <none>. */
export function externalIp(svc: JObj): string {
  if (typeOfSvc(svc) !== 'LoadBalancer') return '<none>';
  const ing = arr(obj(obj(svc.status).loadBalancer).ingress).map(x => str(obj(x).ip)).filter(Boolean);
  return ing.length ? ing.join(',') : '<pending>';
}
/** The LoadBalancer address of a Service, if the pool gave it one. */
export const lbIpOf = (svc: JObj) => str(obj(arr(obj(obj(svc.status).loadBalancer).ingress)[0]).ip);

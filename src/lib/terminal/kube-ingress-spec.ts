import { isIPv4 } from './sockets';
import { SUBDOMAIN, SUBDOMAIN_TEXT } from './kube-manifest';
import { arr, createdOf, kindOf, nameOf, obj, str, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §2): Ingress and IngressClass (networking.k8s.io/v1) as the API
 * server checks them — hosts are DNS names (a wildcard *.example.test allowed, never an IP), every path has a pathType
 * (Exact, Prefix, ImplementationSpecific) and an absolute path, a backend is a Service with a port name or number (a
 * resource backend is prose), and an Ingress has rules or a defaultBackend. The DefaultIngressClass admission plugin gives
 * a new Ingress without ingressClassName the class annotated as the default. Also kubectl's columns of both kinds.
 */

export const INGRESS_KINDS = ['Ingress', 'IngressClass'];
export const GATEWAY_KINDS = ['GatewayClass', 'Gateway', 'HTTPRoute'];
export const NGINX_CONTROLLER = 'k8s.io/ingress-nginx';
export const DEFAULT_CLASS = 'ingressclass.kubernetes.io/is-default-class';
export const PATH_TYPES = ['Exact', 'ImplementationSpecific', 'Prefix'];
const WILDCARD = /^\*\.[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const WILDCARD_TEXT = "a wildcard DNS-1123 subdomain must start with '*.', followed by a valid DNS subdomain, which must consist of lower case alphanumeric characters, '-' or '.' and end with an alphanumeric character (e.g. '*.example.com', regex used for validation is '\\*\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*')";

/** A host of an Ingress rule or TLS entry: its error, or null. */
export function hostProblem(host: string, at: string): string | null {
  if (isIPv4(host)) return `${at}: Invalid value: "${host}": must be a DNS name, not an IP address`;
  if (host.startsWith('*')) return WILDCARD.test(host) && host.length <= 253 ? null : `${at}: Invalid value: "${host}": ${WILDCARD_TEXT}`;
  return SUBDOMAIN.test(host) && host.length <= 253 ? null : `${at}: Invalid value: "${host}": ${SUBDOMAIN_TEXT}`;
}
function backendErrors(b0: J | undefined, at: string): string[] {
  const b = obj(b0), svc = b.service === undefined ? undefined : obj(b.service);
  if (!svc) return b.resource !== undefined ? [] : [`${at}: Invalid value: "": one backend (\`service\` or \`resource\`) must be specified`];
  const out: string[] = [], port = obj(svc.port), name = str(svc.name) ?? '';
  if (!name) out.push(`${at}.service.name: Required value`);
  else if (!/^[a-z]([-a-z0-9]*[a-z0-9])?$/.test(name) || name.length > 63) out.push(`${at}.service.name: Invalid value: "${name}": a DNS-1035 label must consist of lower case alphanumeric characters or '-', start with an alphabetic character, and end with an alphanumeric character (e.g. 'my-name',  or 'abc-123', regex used for validation is '[a-z]([-a-z0-9]*[a-z0-9])?')`);
  const hasName = !!str(port.name), hasNumber = typeof port.number === 'number' && port.number !== 0;
  if (hasName && hasNumber) out.push(`${at}.service.port: Invalid value: "${str(port.name)}": cannot set both port name & port number`);
  else if (!hasName && !hasNumber) out.push(`${at}.service.port: Invalid value: "": port name or number is required`);
  else if (hasNumber && ((port.number as number) < 1 || (port.number as number) > 65535)) out.push(`${at}.service.port.number: Invalid value: ${String(port.number)}: must be between 1 and 65535, inclusive`);
  return out;
}
/** The field errors of an Ingress or IngressClass (the name is checked by fieldErrors). */
export function ingressErrors(o: JObj): string[] {
  const spec = obj(o.spec), out: string[] = [];
  if (kindOf(o) === 'IngressClass') {
    const c = str(spec.controller) ?? '';
    if (!c) out.push('spec.controller: Required value');
    else if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?\/[^\s]+$/.test(c) || c.length > 250) out.push(`spec.controller: Invalid value: "${c}": must be a domain-prefixed path (such as "acme.io/foo")`);
    return out;
  }
  const cls = str(spec.ingressClassName);
  if (cls !== undefined && !SUBDOMAIN.test(cls)) out.push(`spec.ingressClassName: Invalid value: "${cls}": ${SUBDOMAIN_TEXT}`);
  if (spec.defaultBackend === undefined && !arr(spec.rules).length) out.push('spec: Invalid value: []networking.IngressRule(nil): either `defaultBackend` or `rules` must be specified');
  if (spec.defaultBackend !== undefined) out.push(...backendErrors(spec.defaultBackend, 'spec.defaultBackend'));
  arr(spec.rules).forEach((r0, i) => {
    const r = obj(r0), at = `spec.rules[${i}]`, host = str(r.host);
    if (host) { const p = hostProblem(host, `${at}.host`); if (p) out.push(p); }
    const paths = arr(obj(r.http).paths);
    if (r.http !== undefined && !paths.length) out.push(`${at}.http.paths: Required value`);
    paths.forEach((p0, j) => {
      const p = obj(p0), pa = `${at}.http.paths[${j}]`, type = str(p.pathType), path = str(p.path) ?? '';
      if (type === undefined) out.push(`${pa}.pathType: Required value: pathType must be specified`);
      else if (!PATH_TYPES.includes(type)) out.push(`${pa}.pathType: Unsupported value: "${type}": supported values: ${PATH_TYPES.map(x => `"${x}"`).join(', ')}`);
      if ((type !== 'ImplementationSpecific' || path) && !path.startsWith('/')) out.push(`${pa}.path: Invalid value: "${path}": must be an absolute path`);
      out.push(...backendErrors(p.backend, `${pa}.backend`));
    });
  });
  arr(spec.tls).forEach((t, i) => arr(obj(t).hosts).forEach((h, j) => { const p = hostProblem(String(h), `spec.tls[${i}].hosts[${j}]`); if (p) out.push(p); }));
  return out;
}
/** A field E37 leaves to the prose (a resource backend). */
export function ingressProse(doc: JObj): string | null {
  const spec = obj(doc.spec);
  if (obj(spec.defaultBackend).resource !== undefined) return '（模擬環境：spec.defaultBackend.resource 只在課文說明；後端請用 Service）';
  for (const [i, r] of arr(spec.rules).entries()) for (const [j, p] of arr(obj(obj(r).http).paths).entries()) {
    if (obj(obj(p).backend).resource !== undefined) return `（模擬環境：spec.rules[${i}].http.paths[${j}].backend.resource 只在課文說明；後端請用 Service）`;
  }
  return null;
}
/** An update the API server refuses: an IngressClass's controller is immutable. */
export function ingressUpdateErrors(live: JObj, next: JObj): string[] {
  const a = str(obj(live.spec).controller), b = str(obj(next.spec).controller);
  return kindOf(live) === 'IngressClass' && a !== b ? [`spec.controller: Invalid value: "${b ?? ''}": field is immutable`] : [];
}
/** The DefaultIngressClass admission plugin: a new Ingress without a class gets the (newest) default IngressClass. */
export function defaultIngressClass(k: KubeState, doc: JObj): JObj {
  if (kindOf(doc) !== 'Ingress' || str(obj(doc.spec).ingressClassName) !== undefined) return doc;
  const defaults = k.objects.filter(o => kindOf(o) === 'IngressClass' && str(obj(obj(o.metadata).annotations)[DEFAULT_CLASS]) === 'true')
    .sort((a, b) => (createdOf(b) ?? 0) - (createdOf(a) ?? 0) || nameOf(a).localeCompare(nameOf(b)));
  return defaults.length ? { ...doc, spec: { ...obj(doc.spec), ingressClassName: nameOf(defaults[0]) } } : doc;
}

/** A backend as kubectl writes it (web:80, web:http). */
export function backendText(b0: J | undefined): string {
  const s = obj(obj(b0).service), p = obj(s.port);
  return `${str(s.name) ?? ''}:${str(p.name) || String(p.number ?? '')}`;
}
/** kubectl's HOSTS (at most three, then "+ N more..."; none: *). */
export function hostsText(o: JObj): string {
  const rules = arr(obj(o.spec).rules).map(obj), list: string[] = [];
  let more = false;
  for (const r of rules) { if (list.length === 3) more = true; if (!more && str(r.host)) list.push(str(r.host)!); }
  return !list.length ? '*' : more ? `${list.join(',')} + ${rules.length - 3} more...` : list.join(',');
}
/** kubectl's ADDRESS (the status's addresses, sorted; at most 16 characters unless wide). */
export function addressText(o: JObj, wide: boolean): string {
  const set = [...new Set(arr(obj(obj(o.status).loadBalancer).ingress).map(obj).map(x => str(x.ip) || str(x.hostname) || '').filter(Boolean))].sort();
  const r = set.join(',');
  return !wide && r.length > 16 ? `${r.slice(0, 13)}...` : r;
}
export const portsColumn = (o: JObj) => arr(obj(o.spec).tls).length ? '80, 443' : '80';

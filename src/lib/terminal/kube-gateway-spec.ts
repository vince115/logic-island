import type { Seconds } from './clock';
import { hostProblem } from './kube-ingress-spec';
import { arr, kindOf, obj, stamp, str, type J, type JObj } from './kube-model';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §5): the Gateway API's standard channel (v1.2.1) as its CRDs
 * define it — the defaults the API server writes from their schemas (a Gateway's and a GatewayClass's status waiting for
 * a controller, allowedRoutes from Same, an HTTPRoute's PathPrefix / match and backendRefs of kind Service with weight 1),
 * a subset of their validation rules (the CEL messages), the fields left to the prose, conditions as controllers write
 * them (lastTransitionTime kept while the status stays), and kubectl's columns (the CRDs' additionalPrinterColumns).
 */

export const GATEWAY_GROUP = 'gateway.networking.k8s.io';
export const GROUP_OF: Record<string, string> = { Ingress: 'networking.k8s.io', IngressClass: 'networking.k8s.io', GatewayClass: GATEWAY_GROUP, Gateway: GATEWAY_GROUP, HTTPRoute: GATEWAY_GROUP };
export const PLURAL_OF: Record<string, string> = { Ingress: 'ingresses', IngressClass: 'ingressclasses', GatewayClass: 'gatewayclasses', Gateway: 'gateways', HTTPRoute: 'httproutes' };
const EPOCH = '1970-01-01T00:00:00Z';
const pending = (type: string): J => ({ lastTransitionTime: EPOCH, message: 'Waiting for controller', reason: 'Pending', status: 'Unknown', type });

/** The CRDs' defaults (on create and on every update, as the API server applies a schema's defaults). */
export function defaultGateway(doc: JObj): JObj {
  const spec = obj(doc.spec), kind = kindOf(doc);
  if (kind === 'GatewayClass') return { ...doc, status: doc.status ?? { conditions: [pending('Accepted')] } };
  if (kind === 'Gateway') {
    const listeners = arr(spec.listeners).map(l0 => {
      const l = obj(l0), tls = l.tls === undefined ? undefined : obj(l.tls);
      return { ...l, allowedRoutes: { ...obj(l.allowedRoutes), namespaces: { from: 'Same', ...obj(obj(l.allowedRoutes).namespaces) } },
        ...tls ? { tls: { mode: 'Terminate', ...tls, ...tls.certificateRefs ? { certificateRefs: arr(tls.certificateRefs).map(r => ({ group: '', kind: 'Secret', ...obj(r) })) } : {} } } : {} };
    });
    return { ...doc, spec: { ...spec, listeners }, status: doc.status ?? { conditions: [pending('Accepted'), pending('Programmed')] } };
  }
  if (kind !== 'HTTPRoute') return doc;
  const path = (m: J): J => ({ ...obj(m), path: { type: 'PathPrefix', value: '/', ...obj(obj(m).path) } });
  const rules = (spec.rules === undefined ? [{}] : arr(spec.rules)).map(r0 => {
    const r = obj(r0);
    return { ...r, matches: (r.matches === undefined ? [{}] : arr(r.matches)).map(path), ...r.backendRefs ? { backendRefs: arr(r.backendRefs).map(b => ({ group: '', kind: 'Service', weight: 1, ...obj(b) })) } : {} };
  });
  return { ...doc, spec: { ...spec, ...spec.parentRefs ? { parentRefs: arr(spec.parentRefs).map(p => ({ group: GATEWAY_GROUP, kind: 'Gateway', ...obj(p) })) } : {}, rules } };
}

/** The validation errors of a defaulted object (a subset of the CRDs' rules and messages). */
export function gatewayErrors(o: JObj, live?: JObj): string[] {
  const spec = obj(o.spec), out: string[] = [], kind = kindOf(o);
  if (kind === 'GatewayClass') {
    const c = str(spec.controllerName) ?? '';
    if (!c) out.push('spec.controllerName: Required value');
    else if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?\/[A-Za-z0-9/\-._~%!$&'()*+,;=:]+$/.test(c)) out.push(`spec.controllerName: Invalid value: "${c}": spec.controllerName in body should match '^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*\\/[A-Za-z0-9\\/\\-._~%!$&'()*+,;=:]+$'`);
    else if (live && str(obj(live.spec).controllerName) !== c) out.push('spec.controllerName: Invalid value: "string": Value is immutable');
    return out;
  }
  if (kind === 'Gateway') {
    if (!str(spec.gatewayClassName)) out.push('spec.gatewayClassName: Required value');
    const ls = arr(spec.listeners).map(obj);
    if (!ls.length) out.push('spec.listeners: Required value');
    ls.forEach((l, i) => {
      const at = `spec.listeners[${i}]`, port = l.port, from = str(obj(obj(l.allowedRoutes).namespaces).from);
      if (!str(l.name)) out.push(`${at}.name: Required value`);
      if (!str(l.protocol)) out.push(`${at}.protocol: Required value`);
      if (typeof port !== 'number') out.push(`${at}.port: Required value`);
      else if (port < 1 || port > 65535) out.push(`${at}.port: Invalid value: ${port}: ${at}.port in body should be ${port < 1 ? 'greater than or equal to 1' : 'less than or equal to 65535'}`);
      if (str(l.hostname)) { const p = hostProblem(str(l.hostname)!, `${at}.hostname`); if (p) out.push(p); }
      if (from !== undefined && !['All', 'Selector', 'Same'].includes(from)) out.push(`${at}.allowedRoutes.namespaces.from: Unsupported value: "${from}": supported values: "All", "Selector", "Same"`);
    });
    if (new Set(ls.map(l => str(l.name))).size !== ls.length) out.push('spec.listeners: Invalid value: "array": Listener name must be unique within the Gateway');
    if (ls.some(l => ['HTTPS', 'TLS'].includes(str(l.protocol) ?? '') && !arr(obj(l.tls).certificateRefs).length)) out.push("spec.listeners: Invalid value: \"array\": tls must be specified for protocols ['HTTPS', 'TLS']");
    if (ls.some(l => ['HTTP', 'TCP', 'UDP'].includes(str(l.protocol) ?? '') && l.tls !== undefined)) out.push("spec.listeners: Invalid value: \"array\": tls must not be specified for protocols ['HTTP', 'TCP', 'UDP']");
    return out;
  }
  if (kind !== 'HTTPRoute') return out;
  arr(spec.hostnames).forEach((h, i) => { const p = hostProblem(String(h), `spec.hostnames[${i}]`); if (p) out.push(p); });
  if (arr(spec.parentRefs).length > 32) out.push('spec.parentRefs: Too many: 33: must have at most 32 items');
  arr(spec.rules).forEach((r, i) => {
    arr(obj(r).matches).forEach((m, j) => {
      const p = obj(obj(m).path), type = str(p.type) ?? '', at = `spec.rules[${i}].matches[${j}].path`;
      if (!['Exact', 'PathPrefix', 'RegularExpression'].includes(type)) out.push(`${at}.type: Unsupported value: "${type}": supported values: "Exact", "PathPrefix", "RegularExpression"`);
      else if (type !== 'RegularExpression' && !(str(p.value) ?? '').startsWith('/')) out.push(`${at}: Invalid value: "object": value must be an absolute path and start with '/' when type one of ['Exact', 'PathPrefix']`);
    });
    arr(obj(r).backendRefs).forEach((b0, j) => {
      const b = obj(b0), at = `spec.rules[${i}].backendRefs[${j}]`, w = b.weight;
      if (!str(b.name)) out.push(`${at}.name: Required value`);
      if ((str(b.kind) ?? 'Service') === 'Service' && (str(b.group) ?? '') === '' && typeof b.port !== 'number') out.push(`${at}: Invalid value: "object": Must have port for Service reference`);
      if (typeof w === 'number' && (w < 0 || w > 1000000)) out.push(`${at}.weight: Invalid value: ${w}: ${at}.weight in body should be ${w < 0 ? 'greater than or equal to 0' : 'less than or equal to 1000000'}`);
    });
  });
  return out;
}

/** A field the simulation leaves to the prose (other matches, filters, address requests, a namespace selector, regular expressions). */
export function gatewayProse(doc: JObj): string | null {
  const spec = obj(doc.spec), say = (path: string) => `（模擬環境：${path} 只在課文說明）`;
  if (kindOf(doc) === 'Gateway') {
    for (const k of ['addresses', 'infrastructure', 'backendTLS']) if (spec[k] !== undefined) return say(`spec.${k}`);
    for (const [i, l] of arr(spec.listeners).entries()) if (obj(obj(obj(l).allowedRoutes).namespaces).selector !== undefined || obj(obj(l).allowedRoutes).kinds !== undefined) return say(`spec.listeners[${i}].allowedRoutes 的 selector 與 kinds`);
  }
  if (kindOf(doc) === 'HTTPRoute') for (const [i, r0] of arr(spec.rules).entries()) {
    const r = obj(r0);
    for (const k of ['filters', 'timeouts', 'retry', 'sessionPersistence']) if (r[k] !== undefined) return say(`spec.rules[${i}].${k}`);
    for (const [j, m] of arr(r.matches).entries()) for (const k of ['headers', 'queryParams', 'method']) if (obj(m)[k] !== undefined) return say(`spec.rules[${i}].matches[${j}].${k}`);
    for (const [j, m] of arr(r.matches).entries()) if (str(obj(obj(m).path).type) === 'RegularExpression') return say(`spec.rules[${i}].matches[${j}].path 的 RegularExpression`);
    for (const [j, b] of arr(r.backendRefs).entries()) if (obj(b).filters !== undefined) return say(`spec.rules[${i}].backendRefs[${j}].filters`);
  }
  return null;
}

/** A condition as a controller writes it (observedGeneration: the generation it saw). */
export const condition = (type: string, status: 'True' | 'False' | 'Unknown', reason: string, message: string, generation: number, t: Seconds): JObj =>
  ({ lastTransitionTime: stamp(t), message, observedGeneration: generation, reason, status, type });
/** New conditions, each keeping its old lastTransitionTime while its status stays the same. */
export function keepTimes(old: J | undefined, next: readonly JObj[]): JObj[] {
  const prev = arr(old).map(obj);
  return next.map(c => { const p = prev.find(x => str(x.type) === str(c.type)); return p && str(p.status) === str(c.status) && str(p.lastTransitionTime) ? { ...c, lastTransitionTime: p.lastTransitionTime } : c; });
}
/** The status of a condition (of status.conditions, or a list of them). */
export const conditionOf = (list: J | undefined, type: string) => arr(list).map(obj).find(c => str(c.type) === type);

/** The columns of kubectl get (the CRDs' printer columns; HOSTNAMES prints the list as JSON). */
export function gatewayRow(o: JObj): string[] {
  const spec = obj(o.spec), s = obj(o.status), cond = (type: string) => str(conditionOf(s.conditions, type)?.status) ?? '';
  if (kindOf(o) === 'GatewayClass') return [str(spec.controllerName) ?? '', cond('Accepted')];
  if (kindOf(o) === 'Gateway') return [str(spec.gatewayClassName) ?? '', arr(s.addresses).map(a => str(obj(a).value) ?? '').join(' '), cond('Programmed')];
  return [spec.hostnames === undefined ? '' : JSON.stringify(arr(spec.hostnames))];
}
export const GATEWAY_HEADS: Record<string, string[]> = { GatewayClass: ['CONTROLLER', 'ACCEPTED'], Gateway: ['CLASS', 'ADDRESS', 'PROGRAMMED'], HTTPRoute: ['HOSTNAMES'] };

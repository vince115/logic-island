import type { Seconds } from './clock';
import { put } from './kube-api';
import { lbIpOf } from './kube-service-spec';
import { condition, conditionOf, GATEWAY_GROUP, keepTimes } from './kube-gateway-spec';
import { arr, createdOf, kindOf, meta, nameOf, nsOf, obj, sameJ, str, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §6): the lesson's Gateway API controller. It accepts the
 * GatewayClasses that name it (spec.controllerName); a Gateway of such a class gets an address from the lesson's
 * LoadBalancer pool (shared with LoadBalancer Services, in creation order; none left: Programmed False,
 * AddressNotAssigned) and a status for each listener (HTTP and HTTPS are supported; an HTTPS listener's certificateRefs
 * must name a kubernetes.io/tls Secret of the Gateway's namespace). An HTTPRoute attaches to the listeners its parentRefs
 * name (sectionName, port) that allow its namespace (Same, All) and share a hostname with it; its status has one entry
 * per parentRef this controller owns: Accepted (or NoMatchingParent, NotAllowedByListeners, NoMatchingListenerHostname)
 * and ResolvedRefs (or BackendNotFound, InvalidKind, RefNotPermitted). Messages are this simulated controller's.
 */

export const gwGen = (o: JObj) => Number(meta(o).generation ?? 1);
const ours = (k: KubeState, cls: string | undefined) => {
  const ctl = k.ingress?.gateway?.controller;
  return !!ctl && !!cls && k.objects.some(o => kindOf(o) === 'GatewayClass' && nameOf(o) === cls && str(obj(o.spec).controllerName) === ctl);
};
/** The Gateways the controller programs (their class names it), oldest first. */
export const ourGateways = (k: KubeState) => k.objects.filter(o => kindOf(o) === 'Gateway' && ours(k, str(obj(o.spec).gatewayClassName)))
  .sort((a, b) => (createdOf(a) ?? 0) - (createdOf(b) ?? 0) || (nsOf(a) ?? '').localeCompare(nsOf(b) ?? '') || nameOf(a).localeCompare(nameOf(b)));
export const listenersOf = (gw: JObj) => arr(obj(gw.spec).listeners).map(obj);
export const gatewayAddress = (gw: JObj) => str(obj(arr(obj(gw.status).addresses)[0]).value);

/** Whether two hostnames (none: any; *.x: a suffix) can name the same host. */
export function hostsMeet(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return true;
  const wild = (w: string, h: string) => h.endsWith(w.slice(1)) && h.length > w.length - 1;
  if (a.startsWith('*.') && b.startsWith('*.')) return a.endsWith(b.slice(1)) || b.endsWith(a.slice(1)) || a === b;
  return a === b || (a.startsWith('*.') && wild(a, b)) || (b.startsWith('*.') && wild(b, a));
}
/** An HTTPS listener's certificate Secret (the problem, when it cannot be used). */
export function listenerSecret(k: KubeState, gw: JObj, l: JObj): { secret: JObj } | { reason: string; message: string } {
  const ref = obj(arr(obj(l.tls).certificateRefs)[0]), ns = str(ref.namespace) ?? nsOf(gw), name = str(ref.name) ?? '';
  if ((str(ref.kind) ?? 'Secret') !== 'Secret' || (str(ref.group) ?? '') !== '') return { reason: 'InvalidCertificateRef', message: `Unsupported reference kind ${str(ref.kind)}` };
  if (ns !== nsOf(gw)) return { reason: 'RefNotPermitted', message: `Certificate ref to Secret ${ns}/${name} is not permitted by any ReferenceGrant` };
  const secret = k.objects.find(o => kindOf(o) === 'Secret' && nsOf(o) === ns && nameOf(o) === name);
  if (!secret) return { reason: 'InvalidCertificateRef', message: `Secret ${ns}/${name} does not exist` };
  if (str(secret.type) !== 'kubernetes.io/tls') return { reason: 'InvalidCertificateRef', message: `Secret ${ns}/${name} is not of type kubernetes.io/tls` };
  return { secret };
}
const supported = (l: JObj) => ['HTTP', 'HTTPS'].includes(str(l.protocol) ?? '');
const listenerOk = (k: KubeState, gw: JObj, l: JObj) => supported(l) && (str(l.protocol) !== 'HTTPS' || 'secret' in listenerSecret(k, gw, l));

export interface Attached { route: JObj; gw: JObj; listeners: string[] }
/** Each parentRef of each HTTPRoute that names a Gateway of the controller: the listeners it attached to, or why it did not. */
export function parentsOf(k: KubeState, route: JObj): { ref: JObj; gw: JObj; listeners: string[]; reason?: string; message?: string }[] {
  const out: ReturnType<typeof parentsOf> = [], hosts = arr(obj(route.spec).hostnames).map(String);
  for (const ref of arr(obj(route.spec).parentRefs).map(obj)) {
    if ((str(ref.group) ?? GATEWAY_GROUP) !== GATEWAY_GROUP || (str(ref.kind) ?? 'Gateway') !== 'Gateway') continue;
    const ns = str(ref.namespace) ?? nsOf(route), gw = ourGateways(k).find(g => nsOf(g) === ns && nameOf(g) === str(ref.name));
    if (!gw) continue;
    let ls = listenersOf(gw).filter(l => (str(ref.sectionName) === undefined || str(l.name) === str(ref.sectionName)) && (typeof ref.port !== 'number' || l.port === ref.port));
    if (!ls.length) { out.push({ ref, gw, listeners: [], reason: 'NoMatchingParent', message: 'No listeners match this parent ref' }); continue; }
    ls = ls.filter(l => supported(l) && (str(obj(obj(l.allowedRoutes).namespaces).from) === 'All' || nsOf(gw) === nsOf(route)));
    if (!ls.length) { out.push({ ref, gw, listeners: [], reason: 'NotAllowedByListeners', message: 'No listeners included by this parent ref allowed this attachment.' }); continue; }
    ls = ls.filter(l => !hosts.length || hosts.some(h => hostsMeet(str(l.hostname), h)));
    if (!ls.length) { out.push({ ref, gw, listeners: [], reason: 'NoMatchingListenerHostname', message: 'There were no hostname intersections between the HTTPRoute and this parent ref\'s Listener(s).' }); continue; }
    out.push({ ref, gw, listeners: ls.map(l => str(l.name) ?? '') });
  }
  return out;
}
/** A backendRef's Service (the problem, when it cannot be resolved). */
export function backendOf(k: KubeState, route: JObj, b: JObj): { svc: JObj } | { reason: string; message: string } {
  const ns = str(b.namespace) ?? nsOf(route), name = str(b.name) ?? '';
  if ((str(b.kind) ?? 'Service') !== 'Service' || (str(b.group) ?? '') !== '') return { reason: 'InvalidKind', message: `Unsupported backend kind ${str(b.group) ?? ''}/${str(b.kind)}` };
  if (ns !== nsOf(route)) return { reason: 'RefNotPermitted', message: `Backend ref to Service ${ns}/${name} not permitted by any ReferenceGrant` };
  const svc = k.objects.find(o => kindOf(o) === 'Service' && nsOf(o) === ns && nameOf(o) === name);
  return svc ? { svc } : { reason: 'BackendNotFound', message: `Service "${name}" not found` };
}
/** The routes attached to the Gateways (accepted parentRefs only), oldest route first. */
export function attachments(k: KubeState): Attached[] {
  const routes = k.objects.filter(o => kindOf(o) === 'HTTPRoute').sort((a, b) => (createdOf(a) ?? 0) - (createdOf(b) ?? 0) || (nsOf(a) ?? '').localeCompare(nsOf(b) ?? '') || nameOf(a).localeCompare(nameOf(b)));
  return routes.flatMap(route => parentsOf(k, route).filter(p => !p.reason).map(p => ({ route, gw: p.gw, listeners: p.listeners })));
}

/** The controller's sync at t: GatewayClasses accepted, Gateways' addresses and listeners, HTTPRoutes' parents. */
export function syncGateways(k0: KubeState, t: Seconds, pool: readonly string[]): KubeState {
  const ctl = k0.ingress?.gateway?.controller;
  if (!ctl) return k0;
  let k = k0;
  const write = (o: JObj, status: JObj) => { if (!sameJ(o.status, status)) k = put(k, { ...k.objects.find(x => kindOf(x) === kindOf(o) && nameOf(x) === nameOf(o) && nsOf(x) === nsOf(o)) ?? o, status }); };
  for (const c of k0.objects.filter(o => kindOf(o) === 'GatewayClass' && str(obj(o.spec).controllerName) === ctl && (createdOf(o) ?? 0) <= t)) {
    write(c, { conditions: keepTimes(obj(c.status).conditions, [condition('Accepted', 'True', 'Accepted', 'Valid GatewayClass', gwGen(c), t)]) });
  }
  // Addresses: kept while in the pool, else the next free one (LoadBalancer Services' and other Gateways' are taken).
  const gws = ourGateways(k).filter(g => (createdOf(g) ?? 0) <= t);
  const used = new Set([...k.objects.filter(o => kindOf(o) === 'Service').map(lbIpOf), ...gws.map(gatewayAddress)].filter((x): x is string => !!x && pool.includes(x)));
  const attached = attachments(k);
  for (const gw of gws) {
    let ip = gatewayAddress(gw);
    if (!ip || !pool.includes(ip)) { ip = pool.find(a => !used.has(a)); if (ip) used.add(ip); }
    const gen = gwGen(gw), old = obj(gw.status), ls = listenersOf(gw);
    const listeners: J[] = ls.map(l => {
      const name = str(l.name) ?? '', prev = arr(old.listeners).map(obj).find(x => str(x.name) === name);
      const sec = str(l.protocol) === 'HTTPS' ? listenerSecret(k, gw, l) : undefined, bad = sec && 'reason' in sec ? sec : undefined, ok = supported(l) && !bad;
      const conds = [
        supported(l) ? condition('Accepted', 'True', 'Accepted', 'Listener is accepted', gen, t) : condition('Accepted', 'False', 'UnsupportedProtocol', `Protocol ${str(l.protocol)} is unsupported`, gen, t),
        ok ? condition('Programmed', 'True', 'Programmed', 'Listener is programmed', gen, t) : condition('Programmed', 'False', 'Invalid', 'Listener is invalid', gen, t),
        bad ? condition('ResolvedRefs', 'False', bad.reason, bad.message, gen, t) : condition('ResolvedRefs', 'True', 'ResolvedRefs', 'Resolved all the Object references for the Listener', gen, t)];
      return { attachedRoutes: ok ? attached.filter(a => a.gw === gw && a.listeners.includes(name)).length : 0, conditions: keepTimes(prev?.conditions, conds), name,
        supportedKinds: supported(l) ? [{ group: GATEWAY_GROUP, kind: 'HTTPRoute' }] : [] };
    });
    const valid = ls.every(l => listenerOk(k, gw, l));
    const conds = [condition('Accepted', 'True', valid ? 'Accepted' : 'ListenersNotValid', valid ? 'Gateway is accepted' : 'Some listeners are not valid', gen, t),
      ip && ls.some(l => listenerOk(k, gw, l)) ? condition('Programmed', 'True', 'Programmed', 'Gateway is programmed', gen, t)
        : ip ? condition('Programmed', 'False', 'Invalid', 'No listener is valid', gen, t) : condition('Programmed', 'False', 'AddressNotAssigned', 'No addresses have been assigned to the Gateway', gen, t)];
    write(gw, { ...ip ? { addresses: [{ type: 'IPAddress', value: ip }] } : {}, conditions: keepTimes(old.conditions, conds), listeners });
  }
  for (const route of k.objects.filter(o => kindOf(o) === 'HTTPRoute' && (createdOf(o) ?? 0) <= t)) {
    const gen = gwGen(route), old = arr(obj(route.status).parents).map(obj);
    const refs = arr(obj(route.spec).rules).flatMap(r => arr(obj(r).backendRefs).map(obj)).map(b => backendOf(k, route, b)), bad = refs.find(r => 'reason' in r) as { reason: string; message: string } | undefined;
    const parents: J[] = parentsOf(k, route).map(p => {
      const prev = old.find(x => sameJ(x.parentRef, p.ref))?.conditions;
      const conds = [p.reason ? condition('Accepted', 'False', p.reason, p.message!, gen, t) : condition('Accepted', 'True', 'Accepted', 'Route is accepted', gen, t),
        bad ? condition('ResolvedRefs', 'False', bad.reason, bad.message, gen, t) : condition('ResolvedRefs', 'True', 'ResolvedRefs', 'Resolved all the Object references for the Route', gen, t)];
      return { conditions: keepTimes(prev, conds), controllerName: ctl, parentRef: p.ref };
    });
    if (parents.length || old.length) write(route, { parents });
  }
  return k;
}
/** Whether a condition of an object's status (or of its route parents) is True. */
export const isTrue = (list: J | undefined, type: string) => str(conditionOf(list, type)?.status) === 'True';

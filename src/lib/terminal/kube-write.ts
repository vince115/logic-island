import type { Seconds } from './clock';
import { created, defaultPod, find, namespaceExists, NAMESPACED, put, remove } from './kube-api';
import { API_VERSION, decodeProblem, fieldErrors, invalidText, KIND_STAGE, laterField, served } from './kube-manifest';
import { defaultWorkload, immutableSelector, WORKLOAD_KINDS, workloadErrors, workloadLater } from './kube-workload-spec';
import { allocate, defaultService, serviceErrors, serviceLater } from './kube-service-spec';
import { changeImage } from './kube-kubelet';
import { CONFIG_KINDS, configDecode, configErrors, configProse, configUpdateErrors, defaultConfig, rootCa, touched } from './kube-config-spec';
import { podConfigErrors } from './kube-pod-config';
import { defaultIngressClass, GATEWAY_KINDS, INGRESS_KINDS, ingressErrors, ingressProse, ingressUpdateErrors } from './kube-ingress-spec';
import { defaultGateway, gatewayErrors, gatewayProse, GROUP_OF, PLURAL_OF } from './kube-gateway-spec';
import { goJson } from './kube-output';
import { defaultStorage, podStorageErrors, storageErrors, storageProse, storageUpdateErrors } from './kube-storage-spec';
import { markDeleting, STORAGE_KINDS } from './kube-storage-model';
import { arr, changed, clone, systemNs, KUBE_LIMITS, kindOf, meta, nameOf, nsOf, obj, sameJ, sortJ, stamp, str, suffix, uid, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §12): what the API server does with a manifest. create makes a new
 * object (AlreadyExists otherwise); apply is client-side apply: a new object gets the last-applied-configuration
 * annotation (the manifest as compact JSON, keys sorted), an existing one gets the three-way merge of that annotation,
 * the live object and the manifest — maps are merged key by key (a key the last apply had and this one drops is removed),
 * lists are replaced whole (strategic merge of lists is prose). A Pod's spec is immutable except its images (and a few
 * fields); a new image makes the kubelet restart that container. delete removes at once (Terminating is E33's).
 */

export const LAST_APPLIED = 'kubectl.kubernetes.io/last-applied-configuration';
export type Written = { k: KubeState; line: string; warn?: string } | { error: string };
const SERVER_META = ['uid', 'resourceVersion', 'creationTimestamp', 'managedFields', 'generation', 'selfLink'];
/** E38: StatefulSet is apps', StorageClass storage.k8s.io's. */
const STORAGE_GROUP: Record<string, [string, string]> = { StatefulSet: ['statefulsets', 'apps'], StorageClass: ['storageclasses', 'storage.k8s.io'] };
const plural = (kind: string) => STORAGE_GROUP[kind] ? STORAGE_GROUP[kind].join('.') : GROUP_OF[kind] ? `${PLURAL_OF[kind]}.${GROUP_OF[kind]}` : WORKLOAD_KINDS.includes(kind) ? `${kind.toLowerCase()}s.apps` : `${kind.toLowerCase()}s`;
/** E37: what the profile's API server serves of Ingress and the Gateway API (its CRDs only when the lesson installs them). */
export const ingressApi = (k: KubeState) => k.ingress ? (k.ingress.gateway ? 'gateway' as const : 'ingress' as const) : undefined;
const isRoute = (k: KubeState, kind: string) => !!k.ingress && (INGRESS_KINDS.includes(kind) || GATEWAY_KINDS.includes(kind));
const routeErrors = (o: JObj, live?: JObj) => INGRESS_KINDS.includes(kindOf(o)) ? [...ingressErrors(o), ...live ? ingressUpdateErrors(live, o) : []] : gatewayErrors(o, live);
const isWorkload = (k: KubeState, kind: string) => !!k.workloads && WORKLOAD_KINDS.includes(kind);
const isStorage = (k: KubeState, kind: string) => !!k.storage && STORAGE_KINDS.includes(kind);
/** kind/name as kubectl prints it after a write (deployment.apps/web). */
export const lineName = (kind: string) => STORAGE_GROUP[kind] ? `${kind.toLowerCase()}.${STORAGE_GROUP[kind][1]}` : GROUP_OF[kind] ? `${kind.toLowerCase()}.${GROUP_OF[kind]}` : WORKLOAD_KINDS.includes(kind) ? `${kind.toLowerCase()}.apps` : kind.toLowerCase();

function merge3(last: J | undefined, live: J | undefined, want: J): J {
  const isMap = (v: J | undefined): v is JObj => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isMap(want) || !isMap(live)) return want;
  const out: JObj = { ...live };
  if (isMap(last)) for (const k of Object.keys(last)) if (!(k in want)) delete out[k];
  for (const [k, v] of Object.entries(want)) out[k] = merge3(isMap(last) ? last[k] : undefined, live[k], v);
  return out;
}
/** The spec without what a Pod may change (images, activeDeadlineSeconds, tolerations, terminationGracePeriodSeconds). */
const frozen = (spec: JObj): JObj => {
  const strip = (cs: J | undefined) => arr(cs).map(c => { const { image: _i, ...rest } = obj(c); void _i; return rest; });
  const { activeDeadlineSeconds: _a, tolerations: _t, terminationGracePeriodSeconds: _g, ...rest } = spec;
  void _a; void _t; void _g;
  return { ...rest, containers: strip(spec.containers), ...spec.initContainers ? { initContainers: strip(spec.initContainers) } : {} };
};
const FORBIDDEN = 'spec: Forbidden: pod updates may not change fields other than `spec.containers[*].image`,`spec.initContainers[*].image`,`spec.activeDeadlineSeconds`,`spec.tolerations` (only additions to existing tolerations),`spec.terminationGracePeriodSeconds` (allow it to be set to 1 if it was previously negative)';

/** Checks a manifest document and its namespace (ns: the object's, or the command's). */
export function checkDoc(k: KubeState, doc: JObj, ns: string, file: string): string | null {
  const kind = kindOf(doc), name = nameOf(doc), api = str(doc.apiVersion) ?? '', workload = isWorkload(k, kind), service = !!k.net && kind === 'Service';
  // E36 (kube-config): ConfigMaps and Secrets, and the pods' configuration fields.
  const config = !!k.config, cfg = config && CONFIG_KINDS.includes(kind);
  // E35: Endpoints and EndpointSlices are the controllers' (a Service without a selector and its own Endpoints is prose).
  if (k.net && (kind === 'Endpoints' || kind === 'EndpointSlice')) return `（模擬環境：${kind} 由控制器依 Service 的 selector 維護；手動建立的 ${kind} 只在課文說明）`;
  // E37: Ingress on the ingress profile; without the lesson's Gateway API CRDs their kinds are unknown to the API server.
  const route = isRoute(k, kind), store = isStorage(k, kind), storage = !!k.storage;
  if (!served(kind, !!k.workloads, !!k.net, config, ingressApi(k), storage) || API_VERSION[kind] !== api) {
    if (KIND_STAGE[kind] && API_VERSION[kind] === api && !(k.ingress && GATEWAY_KINDS.includes(kind))) return `（模擬環境：${kind} 要到引擎階段 ${KIND_STAGE[kind]} 才模擬）`;
    return `error: resource mapping not found for name: "${name}" namespace: "${NAMESPACED[kind] && (storage || !STORAGE_KINDS.includes(kind)) ? ns : ''}" from "${file}": no matches for kind "${kind}" in version "${api}"\nensure CRDs are installed first`;
  }
  const decode = decodeProblem(doc, !!k.probes, !!k.workloads, !!k.net, config, ingressApi(k), storage) ?? (cfg ? configDecode(doc) : null);
  if (decode) return `Error from server (BadRequest): error when creating "${file}": ${kind} in version "v1" cannot be handled as a ${kind}: ${decode}`;
  const prose = cfg ? configProse(doc) : route ? ingressProse(doc) ?? gatewayProse(doc) : store ? storageProse(doc) : null;
  if (prose) return prose;
  // E38: a StatefulSet's template as a workload's; PVs, PVCs and classes have no later fields.
  const later = route ? null : service ? serviceLater(doc) : workload || kind === 'StatefulSet' ? workloadLater(doc, config, storage) : store ? null : laterField(doc, !!k.probes, config, storage);
  if (later) return `（模擬環境：${later.path} 要到引擎階段 ${later.stage} 才模擬）`;
  const own = config && (kind === 'Pod' || workload) ? [...podConfigErrors(doc), ...storage ? podStorageErrors(doc) : []] : [];
  const errors = store ? storageErrors(defaultStorage(k, doc, 0)) : route ? [...fieldErrors(doc), ...routeErrors(GATEWAY_KINDS.includes(kind) ? defaultGateway(doc) : doc)] : service ? serviceErrors(defaultService(doc)) : workload ? [...workloadErrors(defaultWorkload(doc)), ...own] : cfg ? [...fieldErrors(doc), ...configErrors(defaultConfig(doc))] : [...fieldErrors(doc, !!k.probes), ...own];
  if (errors.length) return invalidText(kind, name, errors);
  if (NAMESPACED[kind] && !namespaceExists(k, ns)) return `Error from server (NotFound): error when creating "${file}": namespaces "${ns}" not found`;
  return null;
}

/** The object a manifest describes, cleaned of what the server sets (status, uid…) and placed in its namespace. */
function cleaned(doc: JObj, ns: string): JObj {
  const m = { ...meta(doc) };
  for (const key of SERVER_META) delete m[key];
  const { status: _s, ...rest } = doc;
  void _s;
  return { ...rest, metadata: { ...m, ...NAMESPACED[kindOf(doc)] ? { namespace: ns } : {} } };
}

export function createDoc(k0: KubeState, doc0: JObj, ns: string, t: Seconds, file: string, lastApplied = false): Written {
  const why = checkDoc(k0, doc0, ns, file);
  if (why) return { error: why };
  const kind = kindOf(doc0), doc = cleaned(doc0, ns), space = NAMESPACED[kind] ? ns : undefined;
  if (kind === 'Pod' && k0.objects.filter(o => kindOf(o) === 'Pod' && nsOf(o) !== 'kube-system').length >= KUBE_LIMITS.pods) return { error: `（模擬環境：叢集最多 ${KUBE_LIMITS.pods} 個 Pod）` };
  if (kind === 'Deployment' && k0.objects.filter(o => kindOf(o) === 'Deployment' && nsOf(o) !== 'kube-system').length >= KUBE_LIMITS.deployments) return { error: `（模擬環境：叢集最多 ${KUBE_LIMITS.deployments} 個 Deployment）` };
  if (kind === 'Service' && k0.objects.filter(o => kindOf(o) === 'Service').length >= KUBE_LIMITS.services) return { error: `（模擬環境：叢集最多 ${KUBE_LIMITS.services} 個 Service）` };
  if (CONFIG_KINDS.includes(kind) && k0.objects.filter(o => CONFIG_KINDS.includes(kindOf(o)) && nameOf(o) !== 'kube-root-ca.crt').length >= KUBE_LIMITS.configs) return { error: `（模擬環境：叢集最多 ${KUBE_LIMITS.configs} 個 ConfigMap 與 Secret）` };
  if (isRoute(k0, kind) && k0.objects.filter(o => isRoute(k0, kindOf(o))).length >= 30) return { error: '（模擬環境：叢集最多 30 個 Ingress、IngressClass 與 Gateway API 物件）' };
  if (isStorage(k0, kind) && k0.objects.filter(o => STORAGE_KINDS.includes(kindOf(o))).length >= 40) return { error: '（模擬環境：叢集最多 40 個 StorageClass、PV、PVC 與 StatefulSet）' };
  if (find(k0, kind, space, nameOf(doc))) return { error: `Error from server (AlreadyExists): error when creating "${file}": ${plural(kind)} "${nameOf(doc)}" already exists` };
  const annotations: JObj = { ...obj(meta(doc).annotations) };
  if (lastApplied) annotations[LAST_APPLIED] = `${goJson(sortJ({ ...doc, metadata: { ...meta(doc), annotations: { ...obj(meta(doc).annotations) } } }), false)}\n`;
  const r = created(k0, { ...doc, metadata: { ...meta(doc), ...Object.keys(annotations).length ? { annotations } : {} } }, space, t);
  // E34: a Deployment or ReplicaSet gets its defaults and generation 1; the controllers take it from there.
  let o = isWorkload(k0, kind) ? { ...defaultWorkload(r.o), metadata: { ...meta(r.o), generation: 1 }, status: {} } : r.o;
  // E35: a Service gets its defaults, its ClusterIP and its NodePorts (or the allocators' errors).
  if (k0.net && kind === 'Service') { const a = allocate(k0, defaultService({ ...o, status: {} })); if ('errors' in a) return { error: invalidText(kind, nameOf(doc), a.errors) }; o = a.o; }
  // E36: a Secret's stringData merged into data; a new namespace gets its kube-root-ca.crt.
  if (k0.config && CONFIG_KINDS.includes(kind)) o = defaultConfig(o);
  // E37: an Ingress gets the default IngressClass (admission) and an empty status; the Gateway API's objects their CRDs' defaults.
  if (isRoute(k0, kind)) o = { ...kind === 'Ingress' ? { ...defaultIngressClass(k0, o), status: { loadBalancer: {} } } : defaultGateway(o), metadata: { ...meta(o), generation: 1 } };
  // E38: a storage object's defaults, the DefaultStorageClass admission and the protection finalizers; a StatefulSet's generation 1.
  if (isStorage(k0, kind)) o = kind === 'StatefulSet' ? { ...defaultStorage(k0, o, t, true), metadata: { ...meta(o), generation: 1 }, status: { availableReplicas: 0, replicas: 0 } } : defaultStorage(k0, o, t, true);
  let k = touched(put(r.k, o), o, t);
  if (k0.config && kind === 'Namespace') k = rootCa(k, nameOf(doc), t);
  return { k, line: `${lineName(kind)}/${nameOf(doc)} created` };
}

export function applyDoc(k0: KubeState, doc0: JObj, ns: string, t: Seconds, file: string): Written {
  const why = checkDoc(k0, doc0, ns, file);
  if (why) return { error: why };
  const kind = kindOf(doc0), doc = cleaned(doc0, ns), space = NAMESPACED[kind] ? ns : undefined, live = find(k0, kind, space, nameOf(doc));
  if (!live) return createDoc(k0, doc0, ns, t, file, true);
  const lastText = str(obj(meta(live).annotations)[LAST_APPLIED]);
  const warn = lastText ? undefined : `Warning: resource ${plural(kind)}/${nameOf(doc)} is missing the ${LAST_APPLIED} annotation which is required by kubectl apply. kubectl apply should only be used on resources created declaratively by either kubectl create --save-config or kubectl apply. The missing annotation will be patched automatically.`;
  let last: J | undefined;
  try { last = lastText ? JSON.parse(lastText) as J : undefined; } catch { last = undefined; }
  const annotations = { ...obj(meta(doc).annotations) }, newLast = `${goJson(sortJ({ ...doc, metadata: { ...meta(doc), annotations } }), false)}\n`;
  const want: JObj = { ...doc, metadata: { ...meta(doc), annotations: { ...annotations, [LAST_APPLIED]: newLast } } };
  const { status, ...liveRest } = live;
  let merged = merge3(last, liveRest, want) as JObj;
  if (kind === 'Pod') merged = defaultPod(merged);
  if (kind === 'Pod' && !sameJ(frozen(obj(liveRest.spec)), frozen(obj(merged.spec)))) return { error: invalidText('Pod', nameOf(doc), [FORBIDDEN]) };
  if (isWorkload(k0, kind)) {
    // E34: defaults, the selector cannot change, a new spec is a new generation.
    merged = defaultWorkload(merged);
    const errs = [...workloadErrors(merged), ...immutableSelector(live, merged)];
    if (errs.length) return { error: invalidText(kind, nameOf(doc), errs) };
    if (!sameJ(obj(liveRest.spec), obj(merged.spec))) merged = { ...merged, metadata: { ...meta(merged), generation: Number(meta(live).generation ?? 1) + 1 } };
  }
  if (k0.net && kind === 'Service') {
    // E35: defaults again, the ClusterIP and the NodePorts kept (new ones for a new type), the type's fields dropped.
    merged = defaultService({ ...merged, status: status ?? {} });
    const errs = serviceErrors(merged), a = errs.length ? undefined : allocate(k0, merged, live);
    if (errs.length || (a && 'errors' in a)) return { error: invalidText(kind, nameOf(doc), errs.length ? errs : (a as { errors: string[] }).errors) };
    const { status: _st, ...spec0 } = (a as { o: JObj }).o;
    void _st;
    merged = spec0;
  }
  if (k0.config && CONFIG_KINDS.includes(kind)) {
    // E36: stringData merged again (the last apply's keys stay in data), the keys and an immutable object checked.
    merged = defaultConfig(merged);
    const errs = [...configErrors(merged), ...configUpdateErrors(live, merged)];
    if (errs.length) return { error: invalidText(kind, nameOf(doc), errs) };
  }
  if (isRoute(k0, kind)) {
    // E37: the CRDs' defaults again, the validation (an IngressClass's controller and a GatewayClass's controllerName are immutable), a new spec is a new generation.
    if (GATEWAY_KINDS.includes(kind)) merged = defaultGateway(merged);
    const errs = routeErrors({ ...merged, kind }, live);
    if (errs.length) return { error: invalidText(kind, nameOf(doc), errs) };
    if (!sameJ(obj(liveRest.spec), obj(merged.spec))) merged = { ...merged, metadata: { ...meta(merged), generation: Number(meta(live).generation ?? 1) + 1 } };
  }
  if (isStorage(k0, kind)) {
    // E38: the defaults again, the validation and what may not change (a claim grows only through a class that allows it).
    merged = defaultStorage(k0, { ...merged, kind }, t);
    const u = storageUpdateErrors(k0, live, merged), errs = [...storageErrors(merged), ...u.errors];
    if (errs.length) return { error: invalidText(kind, nameOf(doc), errs) };
    if (u.forbidden) return { error: `Error from server (Forbidden): error when patching "${file}": ${plural(kind)} "${nameOf(doc)}" is forbidden: ${u.forbidden}` };
    if (kind === 'StatefulSet' && !sameJ(obj(liveRest.spec), obj(merged.spec))) merged = { ...merged, metadata: { ...meta(merged), generation: Number(meta(live).generation ?? 1) + 1 } };
  }
  const next: JObj = { ...merged, ...status !== undefined ? { status } : {} };
  if (sameJ({ ...next, metadata: { ...meta(next), resourceVersion: null } }, { ...live, metadata: { ...meta(live), resourceVersion: null } })) return { k: k0, line: `${lineName(kind)}/${nameOf(doc)} unchanged`, ...warn ? { warn } : {} };
  let k = touched(put(k0, next), next, t);
  if (kind === 'Pod') k = imagesChanged(k, next, t);
  return { k, line: `${lineName(kind)}/${nameOf(doc)} configured`, ...warn ? { warn } : {} };
}
/** The kubelet restarts each container whose image the update changed. */
function imagesChanged(k0: KubeState, pod: JObj, t: Seconds): KubeState {
  const id = uidOf(pod);
  let k = k0, sim = k.pods[id];
  if (!sim) return k;
  for (const init of [true, false]) arr(obj(pod.spec)[init ? 'initContainers' : 'containers']).forEach((c, i) => {
    const r = changeImage(k, pod, sim, { init, i }, str(obj(c).image) ?? '', t);
    k = r.k; sim = r.sim;
  });
  return { ...k, pods: { ...k.pods, [id]: sim } };
}

/** Deletes the object (a namespace with everything in it); kube-system's pods come back at once, as their controllers make them. */
export function deleteObject(k0: KubeState, o: JObj, t: Seconds): KubeState {
  // E38: a claim or volume stays Terminating until the storage controller removes its protection finalizer.
  if (k0.storage && (kindOf(o) === 'PersistentVolumeClaim' || kindOf(o) === 'PersistentVolume')) return markDeleting(k0, o, t);
  let k = touched(remove(k0, o), o, t);
  if (kindOf(o) === 'Namespace') for (const x of k.objects.filter(y => nsOf(y) === nameOf(o))) k = remove(k, x);
  if (kindOf(o) === 'Pod' && systemNs(k0, nsOf(o))) k = recreateSystemPod(k, o, k0.pods[uidOf(o)], t);
  return changed(k, t);
}
function recreateSystemPod(k: KubeState, o: JObj, sim: KubeState['pods'][string] | undefined, t: Seconds): KubeState {
  if (!sim) return k;
  const owner = str(obj(arr(meta(o).ownerReferences)[0]).kind), staticPod = owner === 'Node', seq = k.seq + 1;
  const name = staticPod ? nameOf(o) : nameOf(o).replace(/-[a-z0-9]{5}$/, `-${suffix(`${nameOf(o)}/${seq}`)}`);
  const id = uid(`${seq}/Pod/kube-system/${name}`);
  const pod = clone({ ...o, metadata: { ...meta(o), name, uid: id, creationTimestamp: stamp(t) } });
  return put({ ...k, seq, pods: { ...k.pods, [id]: { ...sim, bound: t, main: sim.main.map(c => ({ ...c, started: t, restarts: 0 })) } } }, pod);
}

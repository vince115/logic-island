import type { Seconds } from './clock';
import { about, defaultPod, put, record } from './kube-api';
import { allocate, defaultService, lbIpOf, typeOfSvc } from './kube-service-spec';
import { freeIp } from './kube-sched';
import { DEFAULT_CLASS, NGINX_CONTROLLER } from './kube-ingress-spec';
import {
  arr, containerId, createdOf, kindOf, labelsOf, meta, nameOf, nsOf, obj, sameJ, stamp, str, suffix, uid, uidOf,
  type CSim, type J, type JObj, type KubeState,
} from './kube-model';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §3): the lesson's ingress-nginx (controller v1.12.0), installed
 * when the cluster was created as its static deploy manifests leave it — the namespace ingress-nginx, the Deployment
 * ingress-nginx-controller (one pod on the first worker, running, never pulled; the system's like kube-system's), the
 * Services ingress-nginx-controller (LoadBalancer from the lesson's pool, or NodePort) and -admission, and the
 * IngressClass nginx (the default class when the lesson says so). Its status sync: an Ingress of class nginx gets the
 * controller's address (the LoadBalancer's, or the node's of the controller pod for a NodePort) and a Sync event for each
 * new generation it sees; one of another class (or none) is left alone, its ADDRESS empty.
 */

export const NGINX_NS = 'ingress-nginx', NGINX_NAME = 'ingress-nginx-controller', NGINX_VERSION_TAG = 'v1.12.0';
export const NGINX_IMAGE = `registry.k8s.io/ingress-nginx/controller:${NGINX_VERSION_TAG}`;
export const NGINX_SOURCE = 'nginx-ingress-controller';
const SELECTOR = { 'app.kubernetes.io/component': 'controller', 'app.kubernetes.io/instance': 'ingress-nginx', 'app.kubernetes.io/name': 'ingress-nginx' };
const LABELS = { ...SELECTOR, 'app.kubernetes.io/part-of': 'ingress-nginx', 'app.kubernetes.io/version': NGINX_VERSION_TAG.slice(1) };
export interface NginxLesson { service?: 'LoadBalancer' | 'NodePort'; nodePorts?: { http?: number; https?: number }; defaultClass?: boolean }

/** Whether a pod is the lesson's ingress-nginx controller. */
export const isNginxPod = (k: KubeState, pod: JObj) => !!k.ingress?.nginx && nsOf(pod) === NGINX_NS && Object.entries(SELECTOR).every(([a, b]) => labelsOf(pod)[a] === b);
const ctr = (lb: boolean): J => ({ args: ['/nginx-ingress-controller', ...lb ? [`--publish-service=$(POD_NAMESPACE)/${NGINX_NAME}`] : [], '--election-id=ingress-nginx-leader', `--controller-class=${NGINX_CONTROLLER}`,
  '--ingress-class=nginx', `--configmap=$(POD_NAMESPACE)/${NGINX_NAME}`, '--validating-webhook=:8443'], image: NGINX_IMAGE, name: 'controller',
  ports: [{ containerPort: 80, name: 'http', protocol: 'TCP' }, { containerPort: 443, name: 'https', protocol: 'TCP' }, { containerPort: 8443, name: 'webhook', protocol: 'TCP' }] });

/** The cluster with ingress-nginx installed at t (its Service through the allocators, its pod on the first worker). */
export function installNginx(k0: KubeState, lesson: NginxLesson, t: Seconds): KubeState {
  const type = lesson.service ?? 'LoadBalancer', lb = type === 'LoadBalancer', hash = suffix('ingress-nginx-template', 10), m = (name: string, more: JObj = {}): JObj =>
    ({ creationTimestamp: stamp(t), labels: { ...LABELS }, name, namespace: NGINX_NS, uid: uid(`ingress-nginx/${name}`), ...more });
  let k: KubeState = { ...k0, ingress: { ...k0.ingress, nginx: type } };
  k = put(k, { apiVersion: 'v1', kind: 'Namespace', metadata: { creationTimestamp: stamp(t), labels: { 'app.kubernetes.io/instance': 'ingress-nginx', 'app.kubernetes.io/name': 'ingress-nginx', 'kubernetes.io/metadata.name': NGINX_NS }, name: NGINX_NS, uid: uid('ns/ingress-nginx') },
    spec: { finalizers: ['kubernetes'] }, status: { phase: 'Active' } });
  const tpl = { metadata: { labels: { ...LABELS } }, spec: { containers: [ctr(lb)], dnsPolicy: 'ClusterFirst', serviceAccountName: 'ingress-nginx', terminationGracePeriodSeconds: 300 } };
  const dep = { apiVersion: 'apps/v1', kind: 'Deployment', metadata: m(NGINX_NAME, { annotations: { 'deployment.kubernetes.io/revision': '1' }, generation: 1 }),
    spec: { minReadySeconds: 0, progressDeadlineSeconds: 600, replicas: 1, revisionHistoryLimit: 10, selector: { matchLabels: SELECTOR }, strategy: { rollingUpdate: { maxSurge: '25%', maxUnavailable: 1 }, type: 'RollingUpdate' }, template: tpl },
    status: { availableReplicas: 1, conditions: ['Available:MinimumReplicasAvailable:Deployment has minimum availability.', `Progressing:NewReplicaSetAvailable:ReplicaSet "${NGINX_NAME}-${hash}" has successfully progressed.`]
      .map(c => { const [type, reason, message] = c.split(/:(.*?):(.*)/s); return { lastTransitionTime: stamp(t), lastUpdateTime: stamp(t), message, reason, status: 'True', type }; }),
    observedGeneration: 1, readyReplicas: 1, replicas: 1, updatedReplicas: 1 } };
  const plabels = { ...LABELS, 'pod-template-hash': hash }, rsName = `${NGINX_NAME}-${hash}`;
  const rs = { apiVersion: 'apps/v1', kind: 'ReplicaSet', metadata: m(rsName, { annotations: { 'deployment.kubernetes.io/desired-replicas': '1', 'deployment.kubernetes.io/max-replicas': '2', 'deployment.kubernetes.io/revision': '1' }, generation: 1, labels: plabels,
    ownerReferences: [{ apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind: 'Deployment', name: NGINX_NAME, uid: uid(`ingress-nginx/${NGINX_NAME}`) }] }),
    spec: { replicas: 1, selector: { matchLabels: { ...SELECTOR, 'pod-template-hash': hash } }, template: { ...tpl, metadata: { labels: plabels } } },
    status: { availableReplicas: 1, fullyLabeledReplicas: 1, observedGeneration: 1, readyReplicas: 1, replicas: 1 } };
  k = put(put(k, dep), rs);
  const node = k.nodes.find(n => !n.control) ?? k.nodes[0], name = `${rsName}-${suffix('ingress-nginx/pod')}`, id = uid(`ingress-nginx/pod/${name}`);
  const pod = defaultPod({ apiVersion: 'v1', kind: 'Pod', metadata: { ...m(name, { labels: plabels, uid: id }), ownerReferences: [{ apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind: 'ReplicaSet', name: rsName, uid: uid(`ingress-nginx/${rsName}`) }] },
    spec: { ...tpl.spec, nodeName: node.name } });
  const c: CSim = { name: 'controller', image: NGINX_IMAGE, init: false, state: 'running', started: t, restarts: 0, crashes: 0, pullFails: 0, logs: [], prev: [], cid: containerId(`ingress-nginx/${name}`), imageId: `${NGINX_IMAGE.split(':')[0]}@sha256:${containerId(`img/${NGINX_IMAGE}`)}` };
  k = { ...put(k, { ...pod, status: { phase: 'Pending', qosClass: 'BestEffort' } }), pods: { ...k.pods, [id]: { node: node.name, bound: t, ip: freeIp(k, node), init: [], main: [c] } }, cache: { ...k.cache, [node.name]: [...k.cache[node.name] ?? [], NGINX_IMAGE] } };
  const svc = (name: string, spec: JObj): JObj => defaultService({ apiVersion: 'v1', kind: 'Service', metadata: m(name), spec: { ...spec, selector: SELECTOR } });
  const np = (key: 'http' | 'https'): JObj => { const n = lesson.nodePorts?.[key]; return !lb && n !== undefined ? { nodePort: n } : {}; };
  for (const s of [svc(NGINX_NAME, { type, ports: [{ appProtocol: 'http', name: 'http', port: 80, protocol: 'TCP', targetPort: 'http', ...np('http') }, { appProtocol: 'https', name: 'https', port: 443, protocol: 'TCP', targetPort: 'https', ...np('https') }] }),
    svc(`${NGINX_NAME}-admission`, { type: 'ClusterIP', ports: [{ appProtocol: 'https', name: 'https-webhook', port: 443, targetPort: 'webhook' }] })]) {
    const a = allocate(k, s);
    if ('o' in a) k = put(k, a.o);
  }
  return put(k, { apiVersion: 'networking.k8s.io/v1', kind: 'IngressClass', metadata: { ...lesson.defaultClass ? { annotations: { [DEFAULT_CLASS]: 'true' } } : {}, creationTimestamp: stamp(t), generation: 1, labels: { ...LABELS }, name: 'nginx', uid: uid('ingressclass/nginx') },
    spec: { controller: NGINX_CONTROLLER } });
}

/** The running controller pod (if any) and the address ingress-nginx publishes: its LoadBalancer's, or (NodePort) its node's. */
export function nginxAddress(k: KubeState): { pod?: JObj; address?: string } {
  if (!k.ingress?.nginx) return {};
  const pod = k.objects.find(o => kindOf(o) === 'Pod' && isNginxPod(k, o) && !meta(o).deletionTimestamp && k.pods[uidOf(o)]?.main.some(c => c.state === 'running'));
  const svc = k.objects.find(o => kindOf(o) === 'Service' && nsOf(o) === NGINX_NS && nameOf(o) === NGINX_NAME);
  if (!pod || !svc) return pod ? { pod } : {};
  const address = typeOfSvc(svc) === 'LoadBalancer' ? lbIpOf(svc) : k.nodes.find(n => n.name === k.pods[uidOf(pod)]?.node)?.address;
  return { pod, ...address ? { address } : {} };
}
/** Whether ingress-nginx serves this Ingress: its class exists and names ingress-nginx's controller. */
export function nginxServes(k: KubeState, ing: JObj): boolean {
  const cls = str(obj(ing.spec).ingressClassName);
  return !!k.ingress?.nginx && cls !== undefined && k.objects.some(o => kindOf(o) === 'IngressClass' && nameOf(o) === cls && str(obj(o.spec).controller) === NGINX_CONTROLLER);
}
/** ingress-nginx's sync at t: the status of the Ingresses it serves (and of those it stopped serving), a Sync event per new generation. */
export function syncIngress(k0: KubeState, t: Seconds): KubeState {
  if (!k0.ingress?.nginx) return k0;
  let k = k0;
  const { pod, address } = nginxAddress(k), seen: Record<string, number> = { ...k.ingress?.seen };
  for (const ing of k0.objects.filter(o => kindOf(o) === 'Ingress' && (createdOf(o) ?? 0) <= t)) {
    const serves = !!pod && nginxServes(k, ing), want: J = { loadBalancer: serves && address ? { ingress: [{ ip: address }] } : {} };
    if (!sameJ(ing.status, want)) k = put(k, { ...ing, status: want });
    const gen = Number(meta(ing).generation ?? 1);
    if (serves && seen[uidOf(ing)] !== gen) { k = record(k, t, about(ing), 'Normal', 'Sync', 'Scheduled for sync', NGINX_SOURCE); seen[uidOf(ing)] = gen; }
  }
  return sameJ(seen, obj(k0.ingress?.seen) as J) ? k : { ...k, ingress: { ...k.ingress, seen } };
}
/** The Ingresses ingress-nginx serves now (oldest first, then by namespace and name: the order its servers are merged in). */
export const servedIngresses = (k: KubeState) => k.objects.filter(o => kindOf(o) === 'Ingress' && nginxServes(k, o))
  .sort((a, b) => (createdOf(a) ?? 0) - (createdOf(b) ?? 0) || (nsOf(a) ?? '').localeCompare(nsOf(b) ?? '') || nameOf(a).localeCompare(nameOf(b)));
export const ingressRules = (ing: JObj) => arr(obj(ing.spec).rules).map(obj);

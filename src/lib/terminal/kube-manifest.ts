import { parseYamlDocuments, YamlError, type Y } from './yaml';
import { bytesOf, cpuMilli, type J, type JObj, obj, arr, str } from './kube-model';
import { probeErrors, probeLater } from './kube-probe-spec';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §3): manifests. A file is YAML with several documents (yaml.ts's
 * parseYamlDocuments); each document becomes JSON the way sigs.k8s.io/yaml reads it (true/false, numbers, null; quoted
 * scalars stay strings). Decoding is strict, as the API server's field validation is by default: an unknown field is
 * "strict decoding error: unknown field …", a string where an integer belongs is json's unmarshal error. Fields of real
 * Kubernetes that later stages simulate (probes E33, valueFrom/envFrom E36, volumes E36/E38…) are named with their stage.
 */

/** A field's type: a string, integer, boolean, string map, quantity map, anything, an object or a list. */
type F = 'str' | 'int' | 'bool' | 'smap' | 'qmap' | 'any' | 'intstr' | { go: string; fields: Record<string, F> } | { list: F };
const LATER: Record<string, string> = {
  livenessProbe: 'E33', readinessProbe: 'E33', startupProbe: 'E33', lifecycle: 'E33', envFrom: 'E36', valueFrom: 'E36',
  volumes: 'E36/E38', volumeMounts: 'E36/E38', affinity: '（課文說明）', topologySpreadConstraints: '（課文說明）', imagePullSecrets: 'E36',
};
const META: F = { go: 'ObjectMeta', fields: { name: 'str', generateName: 'str', namespace: 'str', labels: 'smap', annotations: 'smap', uid: 'str', resourceVersion: 'str', creationTimestamp: 'any', generation: 'int', managedFields: 'any', ownerReferences: 'any', finalizers: 'any' } };
const CONTAINER_FIELDS: Record<string, F> = {
  name: 'str', image: 'str', command: { list: 'str' }, args: { list: 'str' }, workingDir: 'str', imagePullPolicy: 'str', terminationMessagePath: 'str', terminationMessagePolicy: 'str',
  env: { list: { go: 'EnvVar', fields: { name: 'str', value: 'str', valueFrom: 'any' } } },
  ports: { list: { go: 'ContainerPort', fields: { containerPort: 'int', name: 'str', protocol: 'str', hostPort: 'int' } } },
  resources: { go: 'ResourceRequirements', fields: { requests: 'qmap', limits: 'qmap' } },
  securityContext: 'any', stdin: 'bool', tty: 'bool', livenessProbe: 'any', readinessProbe: 'any', startupProbe: 'any', lifecycle: 'any', envFrom: 'any', volumeMounts: 'any',
};
const CONTAINER: F = { go: 'Container', fields: CONTAINER_FIELDS };
/** E33: the probes and hooks decoded strictly (below the probes profile they are a later stage's fields). */
const HTTP_GET: F = { go: 'HTTPGetAction', fields: { path: 'str', port: 'intstr', host: 'str', scheme: 'str', httpHeaders: { list: { go: 'HTTPHeader', fields: { name: 'str', value: 'str' } } } } };
const TCP: F = { go: 'TCPSocketAction', fields: { port: 'intstr', host: 'str' } }, EXEC: F = { go: 'ExecAction', fields: { command: { list: 'str' } } };
const PROBE: F = { go: 'Probe', fields: { exec: EXEC, httpGet: HTTP_GET, tcpSocket: TCP, grpc: 'any', initialDelaySeconds: 'int', timeoutSeconds: 'int', periodSeconds: 'int', successThreshold: 'int', failureThreshold: 'int', terminationGracePeriodSeconds: 'int' } };
const HANDLER: F = { go: 'LifecycleHandler', fields: { exec: EXEC, httpGet: HTTP_GET, tcpSocket: TCP, sleep: { go: 'SleepAction', fields: { seconds: 'int' } } } };
const CONTAINER_E33: F = { go: 'Container', fields: { ...CONTAINER_FIELDS, livenessProbe: PROBE, readinessProbe: PROBE, startupProbe: PROBE, lifecycle: { go: 'Lifecycle', fields: { preStop: HANDLER, postStart: HANDLER } } } };
const podSpec = (container: F): F => ({ go: 'PodSpec', fields: {
  containers: { list: container }, initContainers: { list: container }, restartPolicy: 'str', nodeSelector: 'smap', nodeName: 'str',
  tolerations: { list: { go: 'Toleration', fields: { key: 'str', operator: 'str', value: 'str', effect: 'str', tolerationSeconds: 'int' } } },
  terminationGracePeriodSeconds: 'int', activeDeadlineSeconds: 'int', dnsPolicy: 'str', enableServiceLinks: 'bool', schedulerName: 'str', serviceAccountName: 'str', serviceAccount: 'str',
  securityContext: 'any', priority: 'int', preemptionPolicy: 'str', hostname: 'str', volumes: 'any', affinity: 'any', topologySpreadConstraints: 'any', imagePullSecrets: 'any',
} });
const NAMESPACE: F = { go: 'Namespace', fields: { apiVersion: 'str', kind: 'str', metadata: META, spec: 'any', status: 'any' } };
export const SCHEMAS: Record<string, F> = {
  Pod: { go: 'Pod', fields: { apiVersion: 'str', kind: 'str', metadata: META, spec: podSpec(CONTAINER), status: 'any' } },
  Namespace: NAMESPACE,
};
const SCHEMAS_E33: Record<string, F> = { Pod: { go: 'Pod', fields: { apiVersion: 'str', kind: 'str', metadata: META, spec: podSpec(CONTAINER_E33), status: 'any' } }, Namespace: NAMESPACE };
/** E34: Deployment and ReplicaSet (apps/v1), their pod template decoded as E33's pods are. */
const SELECTOR: F = { go: 'LabelSelector', fields: { matchLabels: 'smap', matchExpressions: { list: { go: 'LabelSelectorRequirement', fields: { key: 'str', operator: 'str', values: { list: 'str' } } } } } };
const TEMPLATE: F = { go: 'PodTemplateSpec', fields: { metadata: META, spec: podSpec(CONTAINER_E33) } };
const STRATEGY: F = { go: 'DeploymentStrategy', fields: { type: 'str', rollingUpdate: { go: 'RollingUpdateDeployment', fields: { maxSurge: 'intstr', maxUnavailable: 'intstr' } } } };
const SCHEMAS_E34: Record<string, F> = { ...SCHEMAS_E33,
  Deployment: { go: 'Deployment', fields: { apiVersion: 'str', kind: 'str', metadata: META, status: 'any', spec: { go: 'DeploymentSpec', fields: {
    replicas: 'int', selector: SELECTOR, template: TEMPLATE, strategy: STRATEGY, minReadySeconds: 'int', revisionHistoryLimit: 'int', paused: 'bool', progressDeadlineSeconds: 'int' } } } },
  ReplicaSet: { go: 'ReplicaSet', fields: { apiVersion: 'str', kind: 'str', metadata: META, status: 'any', spec: { go: 'ReplicaSetSpec', fields: { replicas: 'int', minReadySeconds: 'int', selector: SELECTOR, template: TEMPLATE } } } },
};
/** Whether the profile's API server serves the kind (E34: Deployment and ReplicaSet on the workloads profile). */
export const served = (kind: string, workloads: boolean) => !!(workloads ? SCHEMAS_E34 : SCHEMAS)[kind];
/** The kinds E32 creates and the stage that simulates the others (a known kind of a later stage is not an unknown kind). */
export const KIND_STAGE: Record<string, string> = {
  Deployment: 'E34', ReplicaSet: 'E34', Service: 'E35', Endpoints: 'E35', ConfigMap: 'E36', Secret: 'E36', Ingress: 'E37', IngressClass: 'E37',
  Gateway: 'E37', HTTPRoute: 'E37', PersistentVolume: 'E38', PersistentVolumeClaim: 'E38', StorageClass: 'E38', StatefulSet: 'E38', HorizontalPodAutoscaler: 'E40',
};
export const API_VERSION: Record<string, string> = { Pod: 'v1', Namespace: 'v1', Deployment: 'apps/v1', ReplicaSet: 'apps/v1', StatefulSet: 'apps/v1', Service: 'v1', ConfigMap: 'v1', Secret: 'v1',
  Endpoints: 'v1', PersistentVolume: 'v1', PersistentVolumeClaim: 'v1', Ingress: 'networking.k8s.io/v1', IngressClass: 'networking.k8s.io/v1', StorageClass: 'storage.k8s.io/v1',
  Gateway: 'gateway.networking.k8s.io/v1', HTTPRoute: 'gateway.networking.k8s.io/v1', HorizontalPodAutoscaler: 'autoscaling/v2' };

/** YAML as sigs.k8s.io/yaml reads it into JSON (a documented subset: only true and false are booleans). */
export function toJson(y: Y): J {
  switch (y.t) {
    case 'map': return Object.fromEntries(y.m.map(([k, v]) => [k, toJson(v)]));
    case 'seq': return y.a.map(toJson);
    case 'null': return null;
    case 'str':
      if (y.q) return y.v;
      if (y.v === 'true' || y.v === 'false') return y.v === 'true';
      if (/^-?\d+$/.test(y.v) && Math.abs(Number(y.v)) <= Number.MAX_SAFE_INTEGER) return Number(y.v);
      if (/^-?\d+\.\d+$/.test(y.v)) return Number(y.v);
      return y.v;
  }
}

export type Manifest = { doc: JObj } | { error: string };
/** The documents of a file (each a JSON object, or the error kubectl prints for it). */
export function readManifests(text: string, file: string): Manifest[] | { error: string } {
  let docs: Y[];
  try { docs = parseYamlDocuments(text); } catch (e) {
    if (e instanceof YamlError) return { error: `error: error parsing ${file}: error converting YAML to JSON: ${e.message}` };
    throw e;
  }
  return docs.map(y => {
    const doc = toJson(y);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { error: `error: error validating "${file}": error validating data: invalid object to validate; if you choose to ignore these errors, turn validation off with --validate=false` };
    const missing = [!str(doc.apiVersion) ? 'apiVersion not set' : '', !str(doc.kind) ? 'kind not set' : ''].filter(Boolean);
    if (missing.length) return { error: `error: error validating "${file}": error validating data: [${missing.join(', ')}]; if you choose to ignore these errors, turn validation off with --validate=false` };
    return { doc };
  });
}

/** Strict decoding: the unknown fields (all of them) or the first type error, as the API server reports it. */
export function decodeProblem(doc: JObj, probes = false, workloads = false): string | null {
  const kind = str(doc.kind)!, unknown: string[] = [];
  let typeError: string | null = null;
  const walk = (v: J, f: F, path: string, go: string, dotted: string) => {
    if (v === null || f === 'any') return;
    const bad = (want: string) => { typeError ??= `json: cannot unmarshal ${jsonType(v)} into Go struct field ${go}.${dotted} of type ${want}`; };
    if (f === 'str') { if (typeof v !== 'string') bad('string'); return; }
    if (f === 'int') { if (typeof v !== 'number' || !Number.isInteger(v)) bad(go === 'PodSpec' || go === 'Toleration' || go === 'SleepAction' || (go === 'Probe' && dotted.endsWith('terminationGracePeriodSeconds')) ? 'int64' : 'int32'); return; }
    if (f === 'intstr') { if (typeof v !== 'string' && !(typeof v === 'number' && Number.isInteger(v))) bad('intstr.IntOrString'); return; }
    if (f === 'bool') { if (typeof v !== 'boolean') bad('bool'); return; }
    if (f === 'smap' || f === 'qmap') {
      if (typeof v !== 'object' || Array.isArray(v)) { bad(f === 'smap' ? 'map[string]string' : 'v1.ResourceList'); return; }
      for (const x of Object.values(v)) if (f === 'smap' ? typeof x !== 'string' : typeof x !== 'string' && typeof x !== 'number') { bad(f === 'smap' ? 'string' : 'resource.Quantity'); return; }
      return;
    }
    if ('list' in f) { if (!Array.isArray(v)) { bad(`[]${typeof f.list === 'object' && 'go' in f.list ? `v1.${f.list.go}` : 'string'}`); return; } v.forEach((x, i) => walk(x, f.list, `${path}[${i}]`, go, dotted)); return; }
    if (typeof v !== 'object' || Array.isArray(v)) { bad(`v1.${f.go}`); return; }
    for (const [k, x] of Object.entries(v)) {
      const sub = f.fields[k];
      if (!sub) { unknown.push(`${path ? `${path}.` : ''}${k}`); continue; }
      walk(x, sub, `${path ? `${path}.` : ''}${k}`, f.go, dotted ? `${dotted}.${k}` : k);
    }
  };
  walk(doc, (workloads ? SCHEMAS_E34 : probes ? SCHEMAS_E33 : SCHEMAS)[kind], '', kind, '');
  if (unknown.length) return `strict decoding error: ${unknown.map(u => `unknown field "${u}"`).join(', ')}`;
  return typeError;
}
const jsonType = (v: J) => typeof v === 'string' ? 'string' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : Array.isArray(v) ? 'array' : 'object';

/** The first field of a later stage the document uses (its path and the stage), or null. */
export function laterField(doc: JObj, probes = false): { path: string; stage: string } | null {
  const spec = obj(doc.spec);
  for (const k of ['affinity', 'topologySpreadConstraints', 'imagePullSecrets']) if (spec[k] !== undefined) return { path: `spec.${k}`, stage: LATER[k] };
  for (const [i, v] of arr(spec.volumes).entries()) if (!/^kube-api-access-/.test(str(obj(v).name) ?? '')) return { path: `spec.volumes[${i}]`, stage: LATER.volumes };
  for (const list of ['initContainers', 'containers']) for (const [i, c] of arr(spec[list]).entries()) {
    const at = `spec.${list}[${i}]`, x = obj(c);
    for (const k of probes ? ['envFrom'] : ['livenessProbe', 'readinessProbe', 'startupProbe', 'lifecycle', 'envFrom']) if (x[k] !== undefined) return { path: `${at}.${k}`, stage: LATER[k] };
    for (const [j, e] of arr(x.env).entries()) if (obj(e).valueFrom !== undefined) return { path: `${at}.env[${j}].valueFrom`, stage: LATER.valueFrom };
    for (const [j, m] of arr(x.volumeMounts).entries()) if (!/^kube-api-access-/.test(str(obj(m).name) ?? '')) return { path: `${at}.volumeMounts[${j}]`, stage: LATER.volumeMounts };
  }
  return probes ? probeLater(doc) : null;
}

const LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const SUBDOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
export const LABEL_TEXT = "a lowercase RFC 1123 label must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character (e.g. 'my-name',  or '123-abc', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?')";
const SUBDOMAIN_TEXT = "a lowercase RFC 1123 subdomain must consist of lower case alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character (e.g. 'example.com', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*')";
export const validLabelName = (s: string) => s.length <= 63 && LABEL.test(s);

/** The field errors of a decoded Pod or Namespace (the API server's validation, a subset). */
export function fieldErrors(doc: JObj, probes = false): string[] {
  const kind = str(doc.kind)!, name = str(obj(doc.metadata).name) ?? '', out: string[] = [];
  if (!name) out.push('metadata.name: Required value: name or generateName is required');
  else if (kind === 'Namespace' ? !validLabelName(name) : name.length > 253 || !SUBDOMAIN.test(name)) out.push(`metadata.name: Invalid value: "${name}": ${kind === 'Namespace' ? LABEL_TEXT : SUBDOMAIN_TEXT}`);
  if (kind !== 'Pod') return out;
  const spec = obj(doc.spec), restart = str(spec.restartPolicy);
  if (!arr(spec.containers).length) out.push('spec.containers: Required value');
  for (const list of ['initContainers', 'containers']) {
    const seen = new Set<string>();
    arr(spec[list]).forEach((c0, i) => {
      const c = obj(c0), at = `spec.${list}[${i}]`, cn = str(c.name) ?? '';
      if (!cn) out.push(`${at}.name: Required value`);
      else if (!validLabelName(cn)) out.push(`${at}.name: Invalid value: "${cn}": ${LABEL_TEXT}`);
      else if (seen.has(cn)) out.push(`${at}.name: Duplicate value: "${cn}"`);
      seen.add(cn);
      if (!str(c.image)) out.push(`${at}.image: Required value`);
      const r = obj(c.resources), req = obj(r.requests), lim = obj(r.limits);
      for (const [k, v] of [...Object.entries(req), ...Object.entries(lim)]) {
        const t = typeof v === 'number' ? String(v) : str(v) ?? '';
        if (k !== 'cpu' && k !== 'memory') out.push(`${at}.resources: Invalid value: "${k}": 模擬環境只支援 cpu 與 memory`);
        else if ((k === 'cpu' ? cpuMilli(t) : bytesOf(t)) === null) out.push(`${at}.resources: Invalid value: "${t}": quantities must match the regular expression '^([+-]?[0-9.]+)([eEinumkKMGTP]*[-+]?[0-9]*)$'`);
      }
      for (const k of ['cpu', 'memory'] as const) {
        const q = (v: J | undefined) => v === undefined ? null : k === 'cpu' ? cpuMilli(String(v)) : bytesOf(String(v));
        const a = q(req[k]), b = q(lim[k]);
        if (a !== null && b !== null && a > b) out.push(`${at}.resources.requests: Invalid value: "${String(req[k])}": must be less than or equal to ${k} limit of ${String(lim[k])}`);
      }
    });
  }
  if (restart !== undefined && !['Always', 'OnFailure', 'Never'].includes(restart)) out.push(`spec.restartPolicy: Unsupported value: "${restart}": supported values: "Always", "OnFailure", "Never"`);
  return probes ? [...out, ...probeErrors(doc)] : out;
}
/** "The Pod "web" is invalid: …" with one error, or a list of them. */
export function invalidText(kind: string, name: string, errors: readonly string[]): string {
  return errors.length === 1 ? `The ${kind} "${name}" is invalid: ${errors[0]}` : `The ${kind} "${name}" is invalid: \n${errors.map(e => `* ${e}`).join('\n')}`;
}

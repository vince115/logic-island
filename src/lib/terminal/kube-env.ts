import { find } from './kube-api';
import { secretText } from './kube-config-spec';
import { validEnvName } from './kube-pod-config';
import type { RegCred } from './kube-image';
import { arr, nsOf, obj, str, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md §4): what the kubelet reads from ConfigMaps and Secrets when it
 * creates a container. The environment: each envFrom source in order (its keys sorted, with the prefix; a key that is
 * not a valid variable name is skipped and named in an InvalidEnvironmentVariableNames event), then env (a value, or a
 * configMapKeyRef / secretKeyRef); a later one replaces an earlier one with the same name. A missing source or key is
 * the kubelet's error (CreateContainerConfigError) unless the reference is optional. Registry logins come from the
 * pod's imagePullSecrets (kubernetes.io/dockerconfigjson Secrets); a missing one is a FailedToRetrieveImagePullSecret.
 */

export interface Skipped { kind: 'configMap' | 'secret'; ns: string; name: string; keys: string[] }
export type EnvResult = { env: [string, string][]; skipped: Skipped[] } | { error: string };
const KIND = { configMap: 'ConfigMap', secret: 'Secret' } as const;

/** The data of a ConfigMap or Secret as text (undefined: it does not exist). */
function source(k: KubeState, ns: string, kind: 'configMap' | 'secret', name: string): Record<string, string> | undefined {
  const o = find(k, KIND[kind], ns, name);
  if (!o) return undefined;
  const data = obj(o.data);
  return Object.fromEntries(Object.keys(data).map(key => [key, kind === 'secret' ? secretText(data[key]) : str(data[key]) ?? '']));
}
const notFound = (kind: 'configMap' | 'secret', name: string) => `${kind === 'configMap' ? 'configmap' : 'secret'} "${name}" not found`;

/** The container's variables from env and envFrom, or the kubelet's error. */
export function resolveEnv(k: KubeState, pod: JObj, spec0: J): EnvResult {
  const spec = obj(spec0), ns = nsOf(pod) ?? 'default', vars = new Map<string, string>(), skipped: Skipped[] = [];
  for (const e of arr(spec.envFrom).map(obj)) {
    const kind = e.configMapRef ? 'configMap' : 'secret', ref = obj(kind === 'configMap' ? e.configMapRef : e.secretRef), name = str(ref.name) ?? '';
    const data = source(k, ns, kind, name);
    if (!data) { if (ref.optional === true) continue; return { error: notFound(kind, name) }; }
    const bad: string[] = [];
    for (const key of Object.keys(data).sort()) {
      const n = `${str(e.prefix) ?? ''}${key}`;
      if (!validEnvName(n)) { bad.push(n); continue; }
      vars.set(n, data[key]);
    }
    if (bad.length) skipped.push({ kind, ns, name, keys: bad.sort() });
  }
  for (const e of arr(spec.env).map(obj)) {
    const name = str(e.name) ?? '', from = obj(e.valueFrom);
    if (!name) continue;
    if (e.valueFrom === undefined || e.valueFrom === null) { vars.set(name, str(e.value) ?? ''); continue; }
    const kind = from.configMapKeyRef ? 'configMap' : from.secretKeyRef ? 'secret' : undefined;
    if (!kind) continue;
    const ref = obj(kind === 'configMap' ? from.configMapKeyRef : from.secretKeyRef), src = str(ref.name) ?? '', key = str(ref.key) ?? '', optional = ref.optional === true;
    const data = source(k, ns, kind, src);
    if (!data) { if (optional) continue; return { error: notFound(kind, src) }; }
    if (!(key in data)) { if (optional) continue; return { error: `couldn't find key ${key} in ${KIND[kind]} ${ns}/${src}` }; }
    vars.set(name, data[key]);
  }
  return { env: [...vars], skipped };
}
/** The kubelet's event for the keys an envFrom source could not give. */
export const skippedText = (s: Skipped) => `Keys [${s.keys.join(', ')}] from the EnvFrom ${s.kind} ${s.ns}/${s.name} were skipped since they are considered invalid environment variable names.`;

/** A registry name in a docker config (https://registry.example.com:5000/v1/ → registry.example.com:5000). */
const hostOfServer = (server: string) => server.replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '');
/** The registry logins of a pod's imagePullSecrets, and the names of the ones that do not exist. */
export function pullCreds(k: KubeState, pod: JObj): { creds: RegCred[]; missing: string[] } {
  const ns = nsOf(pod) ?? 'default', creds: RegCred[] = [], missing: string[] = [];
  for (const r of arr(obj(pod.spec).imagePullSecrets).map(obj)) {
    const name = str(r.name) ?? '', s = find(k, 'Secret', ns, name);
    if (!s) { missing.push(name); continue; }
    if (str(s.type) !== 'kubernetes.io/dockerconfigjson') continue;
    let auths: Record<string, unknown> = {};
    try { auths = obj((JSON.parse(secretText(obj(s.data)['.dockerconfigjson'])) as { auths?: J }).auths); } catch { continue; }
    for (const [server, v] of Object.entries(auths)) {
      const e = obj(v as J), auth = str(e.auth);
      let user = str(e.username), token = str(e.password);
      if ((!user || token === undefined) && auth) { const t = secretText(auth), at = t.indexOf(':'); if (at > 0) { user = t.slice(0, at); token = t.slice(at + 1); } }
      if (user && token !== undefined) creds.push({ host: hostOfServer(server), user, token });
    }
  }
  return { creds, missing };
}
export const missingPullText = (names: readonly string[]) => `Unable to retrieve some image pull secrets (${names.join(', ')}); attempting to pull the image may not succeed.`;

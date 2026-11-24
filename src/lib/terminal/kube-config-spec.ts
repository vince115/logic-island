import { DAY, type Seconds } from './clock';
import { base64 } from './ssh';
import { certPem, serialFrom, skiOf } from './tls';
import { put } from './kube-api';
import { kindOf, nameOf, nsOf, obj, sameJ, stamp, str, uid, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md §2): ConfigMap and Secret v1 objects. A Secret's data is base64
 * as the API stores it ([]byte in JSON): a value that is not base64 is Go's "illegal base64 data at input byte N";
 * stringData is write-only — the API server merges it into data (encoded) and never stores it. Types: Opaque (the
 * default), kubernetes.io/tls (tls.crt and tls.key required) and kubernetes.io/dockerconfigjson (.dockerconfigjson, JSON).
 * Keys are config keys ([-._a-zA-Z0-9]+). immutable: true freezes data (and itself); a Secret's type never changes. Every
 * namespace has the root CA publisher's kube-root-ca.crt. cfgAt records when each one changed (the kubelet's sync).
 */

export const CONFIG_KINDS = ['ConfigMap', 'Secret'];
export const SECRET_TYPES = ['Opaque', 'kubernetes.io/tls', 'kubernetes.io/dockerconfigjson'];
const KEY = /^[-._a-zA-Z0-9]+$/;
export const KEY_TEXT = "a valid config key must consist of alphanumeric characters, '-', '_' or '.' (e.g. 'key.name',  or 'KEY_NAME',  or 'key-name', regex used for validation is '[-._a-zA-Z0-9]+')";
export const validKey = (k: string) => k.length <= 253 && KEY.test(k);
const utf8 = (s: string) => new TextEncoder().encode(s);
/** Text as base64 (Go's StdEncoding of its UTF-8 bytes). */
export const b64 = (text: string) => base64(utf8(text));
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Go's base64.StdEncoding.DecodeString: the bytes, or the CorruptInputError offset (newlines are skipped). */
export function goUnbase64(s: string): { bytes: Uint8Array } | { at: number } {
  const out: number[] = [], nl = (c: string | undefined) => c === '\n' || c === '\r';
  let si = 0;
  for (;;) {
    const q: number[] = [];
    let end = false;
    while (q.length < 4) {
      if (si === s.length) { if (!q.length) return { bytes: new Uint8Array(out) }; return { at: si - q.length }; }
      const c = s[si++];
      if (nl(c)) continue;
      const v = ALPHA.indexOf(c);
      if (v >= 0) { q.push(v); continue; }
      if (c !== '=' || q.length < 2) return { at: si - 1 };
      if (q.length === 2) {
        while (si < s.length && nl(s[si])) si++;
        if (si === s.length) return { at: s.length };
        if (s[si] !== '=') return { at: si - 1 };
        si++;
      }
      while (si < s.length && nl(s[si])) si++;
      if (si < s.length) return { at: si };
      end = true;
      break;
    }
    const n = (q[0] << 18) | (q[1] << 12) | ((q[2] ?? 0) << 6) | (q[3] ?? 0);
    out.push((n >> 16) & 255);
    if (q.length > 2) out.push((n >> 8) & 255);
    if (q.length > 3) out.push(n & 255);
    if (end) return { bytes: new Uint8Array(out) };
  }
}
/** A Secret value as text (its decoded UTF-8; '' when it is not base64). */
export const secretText = (v: J | undefined) => { const r = goUnbase64(str(v) ?? ''); return 'bytes' in r ? new TextDecoder().decode(r.bytes) : ''; };
/** The keys of a ConfigMap or Secret and each value as text (a Secret's decoded). */
export function configValues(o: JObj): Record<string, string> {
  const data = obj(o.data), secret = kindOf(o) === 'Secret';
  return Object.fromEntries(Object.keys(data).sort().map(k => [k, secret ? secretText(data[k]) : str(data[k]) ?? '']));
}

/** A field kube-config leaves to the prose (binaryData, other Secret types), as the simulation says it. */
export function configProse(doc: JObj): string | null {
  if (kindOf(doc) === 'ConfigMap' && doc.binaryData !== undefined) return '（模擬環境：ConfigMap 的 binaryData 只在課文說明；請把文字放在 data）';
  const type = str(doc.type);
  if (kindOf(doc) === 'Secret' && type !== undefined && type !== '' && !SECRET_TYPES.includes(type)) return `（模擬環境：Secret 的 type ${type} 只在課文說明；模擬的類型是 ${SECRET_TYPES.join('、')}）`;
  return null;
}
/** Decoding a Secret's data as the API server's JSON decoder does ([]byte is base64). */
export function configDecode(doc: JObj): string | null {
  if (kindOf(doc) !== 'Secret') return null;
  for (const k of Object.keys(obj(doc.data)).sort()) { const r = goUnbase64(str(obj(doc.data)[k]) ?? ''); if ('at' in r) return `illegal base64 data at input byte ${r.at}`; }
  return null;
}
/** The API server's defaults: a Secret's stringData merged into data (and dropped) and type Opaque. */
export function defaultConfig(doc: JObj): JObj {
  if (kindOf(doc) !== 'Secret') return doc;
  const { stringData, ...rest } = doc, data: JObj = { ...obj(doc.data) };
  for (const [k, v] of Object.entries(obj(stringData))) data[k] = b64(str(v) ?? '');
  return { ...rest, ...Object.keys(data).length || doc.data !== undefined ? { data } : {}, type: str(doc.type) || 'Opaque' };
}
/** The field errors of a defaulted ConfigMap or Secret (its name is checked by fieldErrors). */
export function configErrors(o: JObj): string[] {
  const out: string[] = [], data = obj(o.data);
  for (const k of Object.keys(data).sort()) if (!validKey(k)) out.push(`data[${k}]: Invalid value: "${k}": ${KEY_TEXT}`);
  const type = str(o.type);
  if (type === 'kubernetes.io/tls') for (const k of ['tls.crt', 'tls.key']) if (data[k] === undefined) out.push(`data[${k}]: Required value`);
  if (type === 'kubernetes.io/dockerconfigjson') {
    if (data['.dockerconfigjson'] === undefined) out.push('data[.dockerconfigjson]: Required value');
    else { try { JSON.parse(secretText(data['.dockerconfigjson'])); } catch { out.push('data[.dockerconfigjson]: Invalid value: "<secret contents redacted>": invalid character in JSON'); } }
  }
  return out;
}
/** An update of an immutable ConfigMap or Secret (and a Secret's type) as the API server refuses it. */
export function configUpdateErrors(live: JObj, next: JObj): string[] {
  const out: string[] = [];
  if (kindOf(live) === 'Secret' && str(live.type) !== str(next.type)) out.push(`type: Invalid value: "${str(next.type) ?? ''}": field is immutable`);
  if (live.immutable === true) {
    if (next.immutable !== true) out.push('immutable: Forbidden: field is immutable when `immutable` is set');
    if (!sameJ(obj(live.data), obj(next.data))) out.push('data: Forbidden: field is immutable when `immutable` is set');
  }
  return out;
}
/** The data part of a ConfigMap or Secret changed (or it appeared or went away) at t: the kubelet syncs the volumes later. */
export function touched(k: KubeState, o: JObj, t: Seconds): KubeState {
  if (!k.config || !CONFIG_KINDS.includes(kindOf(o))) return k;
  return { ...k, cfgAt: { ...k.cfgAt, [cfgKey(nsOf(o) ?? 'default', kindOf(o), nameOf(o))]: t } };
}
export const cfgKey = (ns: string, kind: string, name: string) => `${ns}/${kind}/${name}`;

const CA_NOTE = 'Contains a CA bundle that can be used to verify the kube-apiserver when using internal endpoints such as the internal service IP or kubernetes.default.svc. No other usage is guaranteed across distributions of Kubernetes clusters.';
/** The cluster CA's certificate (a simulated PEM, E13's record; issued when the cluster was created, valid ten years). */
export function clusterCaPem(created: Seconds): string {
  const dn = [['CN', 'kubernetes']] as const;
  return certPem({ serial: serialFrom('kube-ca'), subject: dn, issuer: dn, notBefore: created, notAfter: created + 3650 * DAY, key: 'rsa2048', ski: skiOf('kube-ca'), sans: ['kubernetes'], ca: true });
}
/** The root CA publisher's ConfigMap kube-root-ca.crt in a namespace. */
export function rootCa(k: KubeState, ns: string, t: Seconds): KubeState {
  return put(k, { apiVersion: 'v1', kind: 'ConfigMap', data: { 'ca.crt': clusterCaPem(k.created) },
    metadata: { annotations: { 'kubernetes.io/description': CA_NOTE }, creationTimestamp: stamp(t), name: 'kube-root-ca.crt', namespace: ns, uid: uid(`cm/${ns}/kube-root-ca.crt`) } });
}
/** Every namespace's kube-root-ca.crt (a cluster on the kube-config profile at its start). */
export function rootCas(k0: KubeState): KubeState {
  let k = k0;
  for (const o of k0.objects) if (kindOf(o) === 'Namespace') k = rootCa(k, nameOf(o), k0.created);
  return k;
}

import { baseName, childrenOf, physicalPath, resolvePath } from './fs';
import { goJson, kubeYaml } from './kube-output';
import { createDoc } from './kube-write';
import { b64, validKey, KEY_TEXT } from './kube-config-spec';
import { ENV_TEXT, validEnvName } from './kube-pod-config';
import { pemBlocks, keyMatches } from './tls';
import type { JObj } from './kube-model';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md §6): kubectl create configmap NAME and create secret
 * generic|tls|docker-registry NAME. Sources: --from-literal=key=value (quotes around the value trimmed, as kubectl does),
 * --from-file=[key=]path (a file, its base name the key; a folder: each regular file in it), --from-env-file=path
 * (KEY=VALUE lines, # comments; not with the other two). tls reads --cert and --key (E13's simulated PEM files) and
 * checks them as Go's tls.X509KeyPair does; docker-registry writes the .dockerconfigjson of --docker-server (default
 * Docker Hub's), --docker-username, --docker-password and --docker-email. --dry-run=client -o yaml|json prints the object.
 */

const fail = (x: Kx, line: string): KubeResult => { x.io.err(line); return { state: x.state, status: 1 }; };
type Data = { data: Record<string, string> } | { error: string };

export function configVerb(x: Kx): KubeResult | undefined {
  if (x.verb !== 'create') return undefined;
  if (x.pos[0] === 'configmap' || x.pos[0] === 'cm') return createConfigMap(x);
  if (x.pos[0] === 'secret') return createSecret(x);
  return undefined;
}

/** The data of the --from-* flags (secret: the keys' messages for a Secret). */
function sources(x: Kx, name: string, secret: boolean): Data {
  const literals = x.flags.values['from-literal'] ?? [], files = x.flags.values['from-file'] ?? [], envs = x.flags.values['from-env-file'] ?? [];
  if (envs.length && (files.length || literals.length)) return { error: 'error: from-env-file cannot be combined with from-file or from-literal' };
  const data: Record<string, string> = {};
  const add = (key: string, value: string): string | null => {
    if (!validKey(key)) return secret ? `error: "${key}" is not valid key name for a Secret ${KEY_TEXT}` : `error: "${key}" is not a valid key name for a ConfigMap: ${KEY_TEXT}`;
    if (key in data) return secret ? `error: cannot add key ${key}, another key by that name already exists` : `error: cannot add key "${key}", another key by that name already exists in Data for ConfigMap "${name}"`;
    data[key] = value;
    return null;
  };
  for (const f of files) {
    const at = f.indexOf('='), key = at > 0 ? f.slice(0, at) : undefined, path = at > 0 ? f.slice(at + 1) : f;
    if (at === 0) return { error: `error: key name for file path ${f} missing` };
    if (!path) return { error: `error: file path for key name ${key} missing` };
    const r = x.io.read(path);
    if ('error' in r && r.error === 'EISDIR') {
      if (key) return { error: 'error: cannot give a key name for a directory path' };
      const dir = physicalPath(x.state.nodes, resolvePath(x.state, path), true);
      for (const child of childrenOf(x.state.nodes, dir)) {
        if (x.state.nodes.get(child)?.kind !== 'file') continue;
        const c = x.io.read(`${path.replace(/\/$/, '')}/${baseName(child)}`);
        if ('error' in c) return { error: `error: error reading ${path}/${baseName(child)}: permission denied` };
        const e = add(baseName(child), c.text);
        if (e) return { error: e };
      }
      continue;
    }
    if ('error' in r) return { error: `error: error reading ${path}: ${r.error === 'ENOENT' ? 'no such file or directory' : 'permission denied'}` };
    const e = add(key ?? baseName(path), r.text);
    if (e) return { error: e };
  }
  for (const l of literals) {
    const at = l.indexOf('=');
    if (at <= 0) return { error: `error: invalid literal source ${l}, expected key=value` };
    const e = add(l.slice(0, at), l.slice(at + 1).replace(/^["']+|["']+$/g, ''));
    if (e) return { error: e };
  }
  for (const path of envs) {
    const r = x.io.read(path);
    if ('error' in r) return { error: `error: open ${path}: ${r.error === 'ENOENT' ? 'no such file or directory' : r.error === 'EISDIR' ? 'is a directory' : 'permission denied'}` };
    const lines = r.text.split('\n');
    for (const [i, raw] of lines.entries()) {
      const line = raw.replace(/\r$/, '').replace(/^\s+/, '');
      if (!line || line.startsWith('#')) continue;
      const at = line.indexOf('='), key = at < 0 ? line : line.slice(0, at);
      if (!validEnvName(key)) return { error: `error: env file ${path}, line ${i + 1}: "${key}" is not a valid key name: ${ENV_TEXT}` };
      const e = add(key, at < 0 ? '' : line.slice(at + 1));
      if (e) return { error: e };
    }
  }
  return { data };
}

/** Prints the object (--dry-run=client) or creates it. */
function emit(x: Kx, doc: JObj, word: 'configmap' | 'secret'): KubeResult {
  const dry = flag(x, 'dry-run'), out = flag(x, 'output'), name = String((doc.metadata as JObj).name);
  if (dry === 'client') {
    if (out === 'yaml') kubeYaml(doc).forEach(l => x.io.out(l));
    else if (out === 'json') goJson(doc).split('\n').forEach(l => x.io.out(l));
    else x.io.out(`${word}/${name} created (dry run)`);
    return { state: x.state, status: 0 };
  }
  const r = createDoc(x.k, doc, x.ns, x.now, 'STDIN');
  if ('error' in r) {
    const e = r.error.replace('error when creating "STDIN": ', '').replace(/^Error from server \(\w+\): /, '').replace(/^The /, '');
    return fail(x, /^（/.test(e) ? e : word === 'configmap' ? `error: failed to create configmap: ${e}` : `error: failed to create secret ${e}`);
  }
  x.io.out(`${word}/${name} created`);
  return { state: { ...x.state, kube: r.k }, status: 0 };
}
const metaFor = (x: Kx, name: string): JObj => ({ creationTimestamp: null, name, ...x.nsGiven ? { namespace: x.ns } : {} });
const named = (x: Kx, at: number) => x.pos.length === at + 1 ? x.pos[at] : undefined;

function createConfigMap(x: Kx): KubeResult {
  const name = named(x, 1);
  if (!name) return fail(x, `error: exactly one NAME is required, got ${Math.max(0, x.pos.length - 1)}`);
  const d = sources(x, name, false);
  if ('error' in d) return fail(x, d.error);
  return emit(x, { apiVersion: 'v1', kind: 'ConfigMap', ...Object.keys(d.data).length ? { data: d.data } : {}, metadata: metaFor(x, name) }, 'configmap');
}

function createSecret(x: Kx): KubeResult {
  const sub = x.pos[1], name = named(x, 2);
  if (!['generic', 'tls', 'docker-registry'].includes(sub ?? '')) return fail(x, sub ? `error: unknown command "${sub}" for "kubectl create secret"` : 'error: must specify the type of secret: generic, tls or docker-registry');
  if (!name) return fail(x, `error: exactly one NAME is required, got ${Math.max(0, x.pos.length - 2)}`);
  const secret = (data: Record<string, string>, type: string): JObj => ({ apiVersion: 'v1', kind: 'Secret', ...Object.keys(data).length ? { data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, b64(v)])) } : {}, metadata: metaFor(x, name), type });
  if (sub === 'generic') {
    const d = sources(x, name, true);
    if ('error' in d) return fail(x, d.error);
    return emit(x, secret(d.data, flag(x, 'type') ?? 'Opaque'), 'secret');
  }
  if (sub === 'tls') {
    const certPath = flag(x, 'cert'), keyPath = flag(x, 'key');
    if (!certPath || !keyPath) return fail(x, 'error: key and cert must be specified');
    const cert = x.io.read(certPath), key = x.io.read(keyPath);
    if ('error' in cert) return fail(x, `error: open ${certPath}: ${cert.error === 'ENOENT' ? 'no such file or directory' : 'permission denied'}`);
    if ('error' in key) return fail(x, `error: open ${keyPath}: ${key.error === 'ENOENT' ? 'no such file or directory' : 'permission denied'}`);
    const why = keyPairProblem(cert.text, key.text);
    if (why) return fail(x, `error: ${why}`);
    return emit(x, secret({ 'tls.crt': cert.text, 'tls.key': key.text }, 'kubernetes.io/tls'), 'secret');
  }
  const user = flag(x, 'docker-username'), password = flag(x, 'docker-password'), server = flag(x, 'docker-server') ?? 'https://index.docker.io/v1/', email = flag(x, 'docker-email');
  if (!user || !password || !server) return fail(x, 'error: either --from-file or the combination of --docker-username, --docker-password and --docker-server is required');
  const entry = { username: user, password, ...email ? { email } : {}, auth: b64(`${user}:${password}`) };
  return emit(x, secret({ '.dockerconfigjson': JSON.stringify({ auths: { [server]: entry } }) }, 'kubernetes.io/dockerconfigjson'), 'secret');
}

/** Go's tls.X509KeyPair on the simulation's PEM files: the first error, or null when the key matches the certificate. */
export function keyPairProblem(certText: string, keyText: string): string | null {
  const cb = pemBlocks(certText), certs = cb.filter(b => b.kind === 'cert' || (b.kind === 'bad' && b.label === 'CERTIFICATE'));
  if (!cb.length) return 'tls: failed to find any PEM data in certificate input';
  if (!certs.length) {
    const skipped = cb.map(b => b.kind === 'key' ? 'PRIVATE KEY' : b.kind === 'bad' ? b.label : 'CERTIFICATE');
    return skipped.length === 1 && skipped[0].endsWith('PRIVATE KEY') ? 'tls: failed to find certificate PEM data in certificate input, but did find a private key; PEM inputs may have been switched'
      : `tls: failed to find "CERTIFICATE" PEM block in certificate input after skipping PEM blocks of the following types: [${skipped.join(' ')}]`;
  }
  const kb = pemBlocks(keyText), at = kb.findIndex(b => b.kind === 'key' || (b.kind === 'bad' && /(^| )PRIVATE KEY$/.test(b.label)));
  if (!kb.length) return 'tls: failed to find any PEM data in key input';
  if (at < 0) {
    const skipped = kb.map(b => b.kind === 'cert' ? 'CERTIFICATE' : b.kind === 'bad' ? b.label : 'PRIVATE KEY');
    return skipped.length === 1 && skipped[0] === 'CERTIFICATE' ? 'tls: found a certificate rather than a key in the PEM for the private key'
      : `tls: failed to find PEM block with type ending in "PRIVATE KEY" in key input after skipping PEM blocks of the following types: [${skipped.join(' ')}]`;
  }
  const first = certs[0], key = kb[at];
  if (first.kind !== 'cert') return 'x509: malformed certificate';
  if (key.kind !== 'key') return 'tls: failed to parse private key';
  return keyMatches(key.key, first.cert) ? null : 'tls: private key does not match public key';
}

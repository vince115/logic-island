import { arr, kindOf, obj, str, type J, type JObj } from './kube-model';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md §3): the API server's validation of a pod's configuration
 * fields (a Pod's spec, or a Deployment's and ReplicaSet's template) — configMap and secret volumes (items, modes), the
 * containers' volumeMounts (an existing volume, unique mount paths, relative subPaths), env valueFrom (one source, a key)
 * and envFrom (one source, a valid prefix) — and the defaults of those volumes (defaultMode 0644, written 420).
 */

const KEY = /^[-._a-zA-Z0-9]+$/, ENV = /^[-._a-zA-Z][-._a-zA-Z0-9]*$/;
const KEY_TEXT = "a valid config key must consist of alphanumeric characters, '-', '_' or '.' (e.g. 'key.name',  or 'KEY_NAME',  or 'key-name', regex used for validation is '[-._a-zA-Z0-9]+')";
export const ENV_TEXT = "a valid environment variable name must consist of alphabetic characters, digits, '_', '-', or '.', and must not start with a digit (e.g. 'my.env-name',  or 'MY_ENV.NAME',  or 'MyEnvName1', regex used for validation is '[-._a-zA-Z][-._a-zA-Z0-9]*')";
const LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
/** The kubelet's (and the API server's) environment variable names (the strict rule; see the doc's 沒有把握). */
export const validEnvName = (n: string) => ENV.test(n);
const MODE_TEXT = 'must be a number between 0 and 0777 (octal), both inclusive';
const modeOk = (v: J | undefined) => v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0o777);
const pathErrors = (p: string, at: string) => p.startsWith('/') ? [`${at}: Invalid value: "${p}": must be a relative path`] : p.split('/').includes('..') ? [`${at}: Invalid value: "${p}": must not contain '..'`] : [];

/** A configMap or secret volume with the API server's defaultMode (420); other volumes unchanged. */
export function defaultConfigVolume(v: J): J {
  const o = obj(v);
  for (const k of ['configMap', 'secret']) if (o[k] !== undefined && o[k] !== null) return { ...o, [k]: { defaultMode: 420, ...obj(o[k]) } };
  return v;
}

/** The configuration errors of a Pod or of a workload's pod template. */
export function podConfigErrors(doc: JObj): string[] {
  const pod = kindOf(doc) === 'Pod', spec = pod ? obj(doc.spec) : obj(obj(obj(doc.spec).template).spec), base = pod ? 'spec' : 'spec.template.spec', out: string[] = [];
  const names = new Set<string>();
  arr(spec.volumes).forEach((v0, i) => {
    const v = obj(v0), at = `${base}.volumes[${i}]`, name = str(v.name) ?? '';
    if (!name) out.push(`${at}.name: Required value`);
    else if (!LABEL.test(name) || name.length > 63) out.push(`${at}.name: Invalid value: "${name}": a lowercase RFC 1123 label must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character (e.g. 'my-name',  or '123-abc', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?')`);
    else if (names.has(name)) out.push(`${at}.name: Duplicate value: "${name}"`);
    names.add(name);
    for (const [k, ref] of [['configMap', 'name'], ['secret', 'secretName']] as const) {
      if (v[k] === undefined || v[k] === null) continue;
      const src = obj(v[k]), here = `${at}.${k}`;
      if (!str(src[ref])) out.push(`${here}.${ref}: Required value`);
      if (!modeOk(src.defaultMode)) out.push(`${here}.defaultMode: Invalid value: ${String(src.defaultMode)}: ${MODE_TEXT}`);
      arr(src.items).forEach((it0, j) => {
        const it = obj(it0), ia = `${here}.items[${j}]`, key = str(it.key) ?? '', path = str(it.path) ?? '';
        if (!key) out.push(`${ia}.key: Required value`);
        if (!path) out.push(`${ia}.path: Required value`); else out.push(...pathErrors(path, `${ia}.path`));
        if (!modeOk(it.mode)) out.push(`${ia}.mode: Invalid value: ${String(it.mode)}: ${MODE_TEXT}`);
      });
    }
  });
  for (const list of ['initContainers', 'containers']) arr(spec[list]).forEach((c0, i) => {
    const c = obj(c0), at = `${base}.${list}[${i}]`, paths = new Set<string>();
    arr(c.volumeMounts).forEach((m0, j) => {
      const m = obj(m0), ma = `${at}.volumeMounts[${j}]`, name = str(m.name) ?? '', path = str(m.mountPath) ?? '', sub = str(m.subPath);
      if (/^kube-api-access-/.test(name)) return;
      if (!name) out.push(`${ma}.name: Required value`); else if (!names.has(name)) out.push(`${ma}.name: Not found: "${name}"`);
      if (!path) out.push(`${ma}.mountPath: Required value`); else if (paths.has(path)) out.push(`${ma}.mountPath: Invalid value: "${path}": must be unique`);
      paths.add(path);
      if (sub) out.push(...pathErrors(sub, `${ma}.subPath`));
    });
    arr(c.env).forEach((e0, j) => {
      const e = obj(e0), ea = `${at}.env[${j}]`;
      if (e.valueFrom === undefined || e.valueFrom === null) return;
      const from = obj(e.valueFrom), set = ['fieldRef', 'resourceFieldRef', 'configMapKeyRef', 'secretKeyRef'].filter(k => from[k] !== undefined && from[k] !== null);
      if (str(e.value)) out.push(`${ea}.valueFrom: Invalid value: "": may not be specified when \`value\` is not empty`);
      if (!set.length) out.push(`${ea}.valueFrom: Invalid value: "": must specify one of: \`fieldRef\`, \`resourceFieldRef\`, \`configMapKeyRef\` or \`secretKeyRef\``);
      else if (set.length > 1) out.push(`${ea}.valueFrom: Invalid value: "": may not have more than one field specified at a time`);
      for (const k of ['configMapKeyRef', 'secretKeyRef']) {
        if (!set.includes(k)) continue;
        const r = obj(from[k]), key = str(r.key) ?? '';
        if (!str(r.name)) out.push(`${ea}.valueFrom.${k}.name: Required value`);
        if (!key) out.push(`${ea}.valueFrom.${k}.key: Required value`); else if (!KEY.test(key)) out.push(`${ea}.valueFrom.${k}.key: Invalid value: "${key}": ${KEY_TEXT}`);
      }
    });
    arr(c.envFrom).forEach((e0, j) => {
      const e = obj(e0), ea = `${at}.envFrom[${j}]`, set = ['configMapRef', 'secretRef'].filter(k => e[k] !== undefined && e[k] !== null), prefix = str(e.prefix);
      if (prefix && !ENV.test(prefix)) out.push(`${ea}.prefix: Invalid value: "${prefix}": ${ENV_TEXT}`);
      if (!set.length) out.push(`${ea}: Invalid value: "": must specify one of: \`configMapRef\` or \`secretRef\``);
      else if (set.length > 1) out.push(`${ea}: Invalid value: "": may not have more than one field specified at a time`);
      else if (!str(obj(e[set[0]]).name)) out.push(`${ea}.${set[0]}.name: Required value`);
    });
  });
  return out;
}

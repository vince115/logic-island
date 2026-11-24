import { goTab, kindOf, nameOf, sortJ, type J, type JObj } from './kube-model';
import { evalPath, parsePath, parseTemplate, runTemplate, scalar } from './kube-jsonpath';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §9): kubectl's output modes. -o json is Go's json.MarshalIndent
 * with four spaces (keys sorted, <>& escaped as \u003c…); -o yaml is sigs.k8s.io/yaml (go-yaml v2: keys sorted, lists
 * at their key's indentation, strings that would read as another type double-quoted, multi-line strings as | blocks);
 * several objects are a List; -o name is kind/name (deployment.apps/…); -o jsonpath and -o custom-columns use
 * kube-jsonpath.ts.
 */

const HTML = (s: string) => s.replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const quote = (s: string) => HTML(JSON.stringify(s));
/** Go's json.Marshal (compact) or MarshalIndent with four spaces; keys sorted as Go sorts a map's. */
export function goJson(v: J, indent = true): string {
  const go = (x: J, pad: string): string => {
    if (x === null || typeof x !== 'object') return typeof x === 'string' ? quote(x) : JSON.stringify(x);
    const inner = indent ? `${pad}    ` : '', nl = indent ? '\n' : '', sep = indent ? ': ' : ':';
    if (Array.isArray(x)) return x.length ? `[${nl}${x.map(y => inner + go(y, inner)).join(`,${nl}`)}${nl}${indent ? pad : ''}]` : '[]';
    const keys = Object.keys(x).sort();
    return keys.length ? `{${nl}${keys.map(k => `${inner}${quote(k)}${sep}${go(x[k], inner)}`).join(`,${nl}`)}${nl}${indent ? pad : ''}}` : '{}';
  };
  return go(v, '');
}

const RESOLVES = /^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE|y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF|[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o?[0-7]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)|\d{4}-\d\d?-\d\d?(?:[Tt ]\d\d?:\d\d:\d\d(?:\.\d*)?(?:Z|[-+]\d\d?(?::\d\d)?)?)?|\d+(?::[0-5]?\d)+(?:\.\d*)?)$/;
/** How go-yaml v2 writes a string scalar (null: as a literal block). */
function yamlScalar(s: string): string | null {
  if (s.includes('\n')) return null;
  if (s === '' || RESOLVES.test(s)) return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const plain = !/^[-?:,[\]{}#&*!|>'"%@`\s]/.test(s) && !/\s$/.test(s) && !/: |:$| #|\t/.test(s) && !/^-( |$)/.test(s);
  return plain ? s : `'${s.replace(/'/g, "''")}'`;
}
/** kubectl -o yaml: the lines of a JSON value (keys sorted). */
export function kubeYaml(v: J): string[] {
  const out: string[] = [];
  const scalarText = (x: J) => x === null ? 'null' : typeof x === 'string' ? yamlScalar(x) : String(x);
  const block = (s: string, pad: string) => { const body = s.endsWith('\n') ? s.slice(0, -1) : s; return { head: s.endsWith('\n') ? '|' : '|-', lines: body.split('\n').map(l => l ? pad + l : '') }; };
  const value = (prefix: string, x: J, pad: string) => {
    if (Array.isArray(x)) { if (!x.length) out.push(`${prefix} []`); else { out.push(prefix); seq(x, pad); } return; }
    if (x && typeof x === 'object') { if (!Object.keys(x).length) out.push(`${prefix} {}`); else { out.push(prefix); map(x, `${pad}  `); } return; }
    const t = scalarText(x);
    if (t === null) { const b = block(x as string, `${pad}  `); out.push(`${prefix} ${b.head}`, ...b.lines); } else out.push(`${prefix} ${t}`);
  };
  const map = (m: JObj, pad: string) => { for (const k of Object.keys(m).sort()) value(`${pad}${yamlScalar(k) ?? k}:`, m[k], pad); };
  const seq = (a: J[], pad: string) => {
    for (const x of a) {
      if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length) {
        const at = out.length;
        map(x, `${pad}  `);
        out[at] = `${pad}- ${out[at].slice(pad.length + 2)}`;
      } else if (Array.isArray(x) && x.length) { out.push(`${pad}-`); seq(x, `${pad}  `); }
      else value(`${pad}-`, x, pad);
    }
  };
  if (v && typeof v === 'object' && !Array.isArray(v)) map(v, ''); else value('', v, '');
  return out;
}

/** A List of the objects (kubectl prints one object as itself, several as a List). */
export const asList = (items: readonly JObj[]): JObj => ({ apiVersion: 'v1', items: [...items], kind: 'List', metadata: { resourceVersion: '' } });
const GROUP: Record<string, string> = { Deployment: 'deployment.apps', ReplicaSet: 'replicaset.apps', DaemonSet: 'daemonset.apps', StatefulSet: 'statefulset.apps' };
export const resourceName = (o: JObj) => `${GROUP[kindOf(o)] ?? kindOf(o).toLowerCase()}/${nameOf(o)}`;

/** Lines, or (jsonpath) the text as it is: kubectl prints no newline after a template. */
export type Printed = { lines: string[] } | { raw: string } | { error: string };
/** -o json|yaml|name|jsonpath=…|custom-columns=… for these objects (single: one object was asked for by name). */
export function printObjects(mode: string, items: readonly JObj[], single: boolean, noHeaders = false): Printed {
  const data: J = single && items.length === 1 ? items[0] : asList(items);
  if (mode === 'json') return { lines: goJson(sortJ(data)).split('\n') };
  if (mode === 'yaml') return { lines: kubeYaml(data) };
  if (mode === 'name') return { lines: items.map(resourceName) };
  const jp = /^jsonpath=(.*)$/s.exec(mode) ?? /^jsonpath='(.*)'$/s.exec(mode);
  if (jp) {
    const t = parseTemplate(jp[1]);
    if ('error' in t) return { error: `error: error parsing jsonpath ${jp[1]}, ${t.error}` };
    return { raw: runTemplate(t, data) };
  }
  const cc = /^custom-columns=(.*)$/s.exec(mode);
  if (cc) {
    const cols = cc[1].split(',').map(c => { const at = c.indexOf(':'); return at < 0 ? null : { head: c.slice(0, at), path: parsePath(c.slice(at + 1).replace(/^\{|\}$/g, '')) }; });
    if (cols.some(c => !c)) return { error: 'error: custom-columns format specified but no custom columns given' };
    const bad = cols.find(c => 'error' in c!.path);
    if (bad) return { error: `error: ${(bad.path as { error: string }).error}` };
    const rows = items.map(o => cols.map(c => { const v = evalPath([o], c!.path as Exclude<ReturnType<typeof parsePath>, { error: string }>); return v.length ? v.map(scalar).join(',') : '<none>'; }).join('\t'));
    return { lines: goTab(noHeaders ? rows : [cols.map(c => c!.head).join('\t'), ...rows]) };
  }
  return { error: `error: unable to match a printer suitable for the output format "${mode}", allowed formats are: custom-columns,custom-columns-file,go-template,go-template-file,json,jsonpath,jsonpath-as-json,jsonpath-file,name,template,templatefile,wide,yaml` };
}

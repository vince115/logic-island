import { kubeYaml, goJson } from './kube-output';
import type { J } from './kube-model';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §2): the values Helm's Go templates work with. Values read from YAML
 * are what sigs.k8s.io/yaml gives (through JSON): numbers are float64 (a JS number), so {{ .Values.n }} of 1000000 prints
 * 1e+06 and printf "%d" of it prints %!d(float64=…); integers come from --set (int64), from len and from constants (int)
 * and are a GoInt. Structs (.Chart, .Capabilities, .Files) are a GoStruct with fields and methods. Printing follows fmt's %v.
 */

/** An integer of a Go integer type (int from constants and len, int64 from --set). */
export class GoInt { constructor(readonly n: number, readonly type: 'int' | 'int64' = 'int') {} }
/** A Go struct (pointer) value: its type's name, its fields and its methods (each takes the evaluated arguments). */
export class GoStruct {
  constructor(readonly type: string, readonly fields: Readonly<Record<string, V>>, readonly methods: Readonly<Record<string, (args: V[]) => V>> = {}, readonly text?: string) {}
}
export type V = null | boolean | string | number | GoInt | GoStruct | V[] | VMap;
export interface VMap { [k: string]: V }

export const isMap = (v: V | undefined): v is VMap => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof GoInt) && !(v instanceof GoStruct);
/** Go's dynamic type of a value (an interface holding nil: interface {}). */
export function dynType(v: V): string {
  if (v === null) return 'interface {}';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'number') return 'float64';
  if (v instanceof GoInt) return v.type;
  if (v instanceof GoStruct) return v.type;
  return Array.isArray(v) ? '[]interface {}' : 'map[string]interface {}';
}
/** text/template's truth: false, 0, "", nil and empty collections are false; a struct is true. */
export function truth(v: V | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > 0;
  if (typeof v === 'number') return v !== 0;
  if (v instanceof GoInt) return v.n !== 0;
  if (v instanceof GoStruct) return true;
  return Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0;
}

/** fmt's %v of a float64 (strconv's 'g' with the shortest digits): %e when the exponent is below -4 or at least 6 (1e+06). */
export function goFloat(f: number): string {
  if (Number.isNaN(f)) return 'NaN';
  if (!Number.isFinite(f)) return f > 0 ? '+Inf' : '-Inf';
  if (f === 0) return Object.is(f, -0) ? '-0' : '0';
  const [mant, ex] = f.toExponential().split('e'), x = Number(ex);
  if (x < -4 || x >= 6) return `${mant}e${x < 0 ? '-' : '+'}${String(Math.abs(x)).padStart(2, '0')}`;
  return String(f);
}
/** fmt.Sprint of one value (%v): nil inside a collection is <nil>, maps print sorted as map[k:v]. */
export function goPrint(v: V): string {
  if (v === null) return '<nil>';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return goFloat(v);
  if (v instanceof GoInt) return String(v.n);
  if (v instanceof GoStruct) return v.text ?? `&{${Object.values(v.fields).map(goPrint).join(' ')}}`;
  if (Array.isArray(v)) return `[${v.map(goPrint).join(' ')}]`;
  return `map[${Object.keys(v).sort().map(k => `${k}:${goPrint(v[k])}`).join(' ')}]`;
}
/** sprig's strval: a string as itself, anything else as %v. */
export const strval = (v: V): string => typeof v === 'string' ? v : goPrint(v);
/** Go's strconv.Quote (printable characters kept, the usual escapes). */
export function goQuote(s: string): string {
  const esc: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\t': '\\t', '\r': '\\r', '\x07': '\\a', '\b': '\\b', '\f': '\\f', '\v': '\\v' };
  return `"${[...s].map(c => esc[c] ?? (c.charCodeAt(0) < 0x20 || c === '\x7f' ? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}` : c)).join('')}"`;
}
/** fmt.Sprint: a space between operands when neither is a string. */
export function goSprint(args: readonly V[]): string {
  let out = '';
  args.forEach((a, i) => { if (i > 0 && typeof a !== 'string' && typeof args[i - 1] !== 'string') out += ' '; out += goPrint(a); });
  return out;
}

/** fmt.Sprintf with the verbs charts use (%s %v %d %q %t %f %x %%, flags - 0 +, width and precision); Go's %!verb(type=value) on a mismatch. */
export function goSprintf(format: string, args: readonly V[]): string {
  let out = '', n = 0;
  const bad = (verb: string, a: V) => a === null ? `%!${verb}(<nil>)` : `%!${verb}(${dynType(a)}=${goPrint(a)})`;
  const pad = (s: string, width: number | undefined, left: boolean, zero: boolean) => width === undefined || s.length >= width ? s : left ? s.padEnd(width) : zero ? (s.startsWith('-') ? `-${s.slice(1).padStart(width - 1, '0')}` : s.padStart(width, '0')) : s.padStart(width);
  for (let i = 0; i < format.length; i++) {
    if (format[i] !== '%') { out += format[i]; continue; }
    const m = /^([-+0 #]*)(\d+)?(?:\.(\d+))?([a-zA-Z%])/.exec(format.slice(i + 1));
    if (!m) { out += '%!(NOVERB)'; break; }
    i += m[0].length;
    const [, flags, w, p, verb] = m, width = w ? Number(w) : undefined, prec = p !== undefined ? Number(p) : undefined, left = flags.includes('-'), zero = flags.includes('0') && !left;
    if (verb === '%') { out += '%'; continue; }
    if (n >= args.length) { out += `%!${verb}(MISSING)`; continue; }
    const a = args[n++];
    let s: string;
    switch (verb) {
      case 'v': s = goPrint(a); break;
      case 's': s = typeof a === 'string' ? (prec !== undefined ? a.slice(0, prec) : a) : Array.isArray(a) || isMap(a) ? goPrint(a) : bad('s', a); break;
      case 'q': s = typeof a === 'string' ? goQuote(a) : bad('q', a); break;
      case 'd': s = a instanceof GoInt ? `${flags.includes('+') && a.n >= 0 ? '+' : ''}${a.n}` : bad('d', a); break;
      case 't': s = typeof a === 'boolean' ? String(a) : bad('t', a); break;
      case 'f': case 'F': s = typeof a === 'number' ? a.toFixed(prec ?? 6) : bad(verb, a); break;
      case 'x': s = typeof a === 'string' ? [...new TextEncoder().encode(a)].map(b => b.toString(16).padStart(2, '0')).join('') : a instanceof GoInt ? a.n.toString(16) : bad('x', a); break;
      default: s = bad(verb, a);
    }
    out += pad(s, width, left, zero && verb !== 's');
  }
  if (n < args.length) out += `%!(EXTRA ${args.slice(n).map(a => a === null ? '<nil>' : `${dynType(a)}=${goPrint(a)}`).join(', ')})`;
  return out;
}

/** JSON (as the API store and sigs.k8s.io/yaml hold it) as template values: numbers are float64. */
export function fromJ(j: J): V {
  if (j === null || typeof j !== 'object') return j;
  if (Array.isArray(j)) return j.map(fromJ);
  const out: VMap = {};
  for (const [k, v] of Object.entries(j)) out[k] = fromJ(v);
  return out;
}
/** Template values as JSON (ints and floats both numbers; a struct as its fields). */
export function toJ(v: V): J {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof GoInt) return v.n;
  if (v instanceof GoStruct) return Object.fromEntries(Object.entries(v.fields).map(([k, x]) => [k, toJ(x)]));
  if (Array.isArray(v)) return v.map(toJ);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJ(x)]));
}
/** sprig's toYaml: sigs.k8s.io/yaml.Marshal without the last newline (keys sorted, lists at their key's indentation). */
export function toYamlText(v: V): string {
  const j = toJ(v);
  if (j === null) return 'null';
  if (typeof j !== 'object') { const [first, ...rest] = kubeYaml({ x: j }); return [first.slice(3), ...rest].join('\n'); }
  if (Array.isArray(j) ? !j.length : !Object.keys(j).length) return Array.isArray(j) ? '[]' : '{}';
  return kubeYaml(j).join('\n');
}
/** sprig's toJson: encoding/json (keys sorted, <>& escaped). */
export const toJsonText = (v: V) => goJson(toJ(v), false);
/** A deep copy (values are never shared between renders and the release store). */
export const copyV = (v: V): V => fromJ(toJ(v));

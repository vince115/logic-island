import { hex } from './docker';
import { b64 } from './kube-config-spec';
import { FuncError, type FuncSpec, type TV } from './helm-tpl-exec';
import { dynType, GoInt, goPrint, goQuote, goSprint, goSprintf, isMap, strval, toJsonText, toYamlText, truth, type V, type VMap } from './helm-value';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §2): the functions a chart's templates may call — text/template's
 * builtins (and or not len index print printf println eq ne lt le gt ge), the subset of sprig v3 this simulation has
 * (default required toYaml toJson nindent indent trunc trimSuffix trimPrefix trim upper lower replace contains b64enc
 * sha256sum toString int quote list dict hasKey empty ternary join fail) and Helm's include, tpl and required. Each has
 * its Go signature, because the executor converts and checks arguments by it; any other function is Go's parse error
 * `function "x" not defined`.
 */

const s = (x: TV) => x.v as string;
const n = (x: TV) => (x.v as GoInt).n;
/** Go's basicKind (after digging a nil interface out: invalid). */
type Kind = 'bool' | 'int' | 'float' | 'string' | 'invalid' | 'other';
const kind = (x: TV): Kind => {
  if (x.bad || x.v === null) return 'invalid';
  const v = x.v;
  return typeof v === 'boolean' ? 'bool' : v instanceof GoInt ? 'int' : typeof v === 'number' ? 'float' : typeof v === 'string' ? 'string' : 'other';
};
const scalar = (x: TV) => x.v instanceof GoInt ? x.v.n : x.v;
function eq(a: TV, rest: TV[]): boolean {
  if (!rest.length) throw new FuncError('missing argument for comparison');
  const k1 = kind(a);
  for (const b of rest) {
    const k2 = kind(b);
    if (k1 !== k2) { if (k1 !== 'invalid' && k2 !== 'invalid') throw new FuncError('incompatible types for comparison'); continue; }
    if (k1 === 'invalid') return true;
    if (k1 === 'other') {
      if (Array.isArray(b.v) || isMap(b.v)) throw new FuncError(`non-comparable type ${goPrint(b.v)}: ${dynType(b.v)}`);
      if (a.v === b.v) return true;
      continue;
    }
    if (scalar(a) === scalar(b)) return true;
  }
  return false;
}
function lt(a: TV, b: TV): boolean {
  const k1 = kind(a), k2 = kind(b);
  if (k1 === 'invalid' || k1 === 'other' || k2 === 'invalid' || k2 === 'other') throw new FuncError('invalid type for comparison');
  if (k1 !== k2) throw new FuncError('incompatible types for comparison');
  if (k1 === 'bool') throw new FuncError('invalid type for comparison');
  return (scalar(a) as number | string) < (scalar(b) as number | string);
}
function len(x: TV): number {
  if (x.bad) throw new FuncError('reflect: call of reflect.Value.Type on zero Value');
  const v = x.v;
  if (v === null) throw new FuncError('len of nil pointer');
  if (typeof v === 'string') return new TextEncoder().encode(v).length;
  if (Array.isArray(v)) return v.length;
  if (isMap(v)) return Object.keys(v).length;
  throw new FuncError(`len of type ${dynType(v)}`);
}
function index(item0: TV, idx: TV[]): TV {
  if (item0.bad || item0.v === null) throw new FuncError('index of untyped nil');
  let item = item0;
  for (const i of idx) {
    const v = item.v;
    if (v === null) throw new FuncError('index of nil pointer');
    if (Array.isArray(v) || typeof v === 'string') {
      if (i.bad || i.v === null) throw new FuncError('cannot index slice/array with nil');
      if (!(i.v instanceof GoInt)) throw new FuncError(`cannot index slice/array with type ${dynType(i.v)}`);
      const size = typeof v === 'string' ? new TextEncoder().encode(v).length : v.length;
      if (i.v.n < 0 || i.v.n >= size) throw new FuncError(`index out of range: ${i.v.n}`);
      item = typeof v === 'string' ? { v: new GoInt(new TextEncoder().encode(v)[i.v.n]), t: 'uint8' } : { v: v[i.v.n], t: 'interface {}' };
    } else if (isMap(v)) {
      if (i.bad || i.v === null) throw new FuncError('value is nil; should be of type string');
      if (typeof i.v !== 'string') throw new FuncError(`value has type ${dynType(i.v)}; should be string`);
      item = { v: Object.hasOwn(v, i.v) ? v[i.v] : null, t: 'interface {}' };
    } else throw new FuncError(`can't index item of type ${dynType(v)}`);
  }
  return item;
}
const vals = (xs: TV[]) => xs.map(x => x.bad ? null : x.v);
/** cast.ToInt (what sprig's int does). */
function toInt(v: V): number {
  if (v instanceof GoInt) return v.n;
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') { const t = v.trim(), m = /^[+-]?(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9]\d*)$/.test(t); return m ? Number(t.startsWith('0') && !/^0[xX]/.test(t) && t.length > 1 ? parseInt(t, 8) : t) : 0; }
  return 0;
}
const strslice = (v: V): string[] => v === null ? [] : Array.isArray(v) ? v.filter(x => x !== null).map(strval) : [strval(v)];
const warnRequired = (warn: string) => new FuncError(warn, warn);
const STR: FuncSpec['params'] = ['string'];

const TO_STRING: FuncSpec = { params: ['interface {}'], ret: 'string', call: ([a]) => strval(a.v) };

export const FUNCS: Record<string, FuncSpec> = {
  // text/template's builtins.
  and: { params: ['reflect.Value'], variadic: 'reflect.Value', ret: 'reflect.Value', call: a => a[a.length - 1] },
  or: { params: ['reflect.Value'], variadic: 'reflect.Value', ret: 'reflect.Value', call: a => a[a.length - 1] },
  not: { params: ['reflect.Value'], ret: 'bool', call: ([a]) => !(!a.bad && truth(a.v)) },
  len: { params: ['reflect.Value'], ret: 'int', call: ([a]) => new GoInt(len(a)) },
  index: { params: ['reflect.Value'], variadic: 'reflect.Value', ret: 'reflect.Value', call: ([a, ...i]) => index(a, i) },
  print: { params: [], variadic: 'interface {}', ret: 'string', call: a => goSprint(vals(a)) },
  println: { params: [], variadic: 'interface {}', ret: 'string', call: a => `${vals(a).map(goPrint).join(' ')}\n` },
  printf: { params: ['string'], variadic: 'interface {}', ret: 'string', call: ([f, ...a]) => goSprintf(s(f), vals(a)) },
  eq: { params: ['reflect.Value'], variadic: 'reflect.Value', ret: 'bool', call: ([a, ...b]) => eq(a, b) },
  ne: { params: ['reflect.Value', 'reflect.Value'], ret: 'bool', call: ([a, b]) => !eq(a, [b]) },
  lt: { params: ['reflect.Value', 'reflect.Value'], ret: 'bool', call: ([a, b]) => lt(a, b) },
  le: { params: ['reflect.Value', 'reflect.Value'], ret: 'bool', call: ([a, b]) => lt(a, b) || eq(a, [b]) },
  gt: { params: ['reflect.Value', 'reflect.Value'], ret: 'bool', call: ([a, b]) => !(lt(a, b) || eq(a, [b])) },
  ge: { params: ['reflect.Value', 'reflect.Value'], ret: 'bool', call: ([a, b]) => !lt(a, b) },
  // sprig v3 (the subset).
  default: { params: ['interface {}'], variadic: 'interface {}', ret: 'interface {}', call: ([d, ...g]) => !g.length || !truth(g[0].v) ? d.v : g[0].v },
  empty: { params: ['interface {}'], ret: 'bool', call: ([g]) => !truth(g.v) },
  quote: { params: [], variadic: 'interface {}', ret: 'string', call: a => vals(a).filter(x => x !== null).map(x => goQuote(strval(x))).join(' ') },
  toYaml: { params: ['interface {}'], ret: 'string', call: ([v]) => toYamlText(v.v) },
  toJson: { params: ['interface {}'], ret: 'string', call: ([v]) => toJsonText(v.v) },
  indent: { params: ['int', 'string'], ret: 'string', call: ([c, v]) => { const pad = ' '.repeat(Math.max(0, n(c))); return pad + s(v).replace(/\n/g, `\n${pad}`); } },
  nindent: { params: ['int', 'string'], ret: 'string', call: ([c, v]) => { const pad = ' '.repeat(Math.max(0, n(c))); return `\n${pad}${s(v).replace(/\n/g, `\n${pad}`)}`; } },
  trunc: { params: ['int', 'string'], ret: 'string', call: ([c, v]) => { const k = n(c), t = s(v); return k < 0 && t.length + k > 0 ? t.slice(t.length + k) : k >= 0 && t.length > k ? t.slice(0, k) : t; } },
  trimSuffix: { params: ['string', 'string'], ret: 'string', call: ([a, b]) => s(a) && s(b).endsWith(s(a)) ? s(b).slice(0, -s(a).length) : s(b) },
  trimPrefix: { params: ['string', 'string'], ret: 'string', call: ([a, b]) => s(b).startsWith(s(a)) ? s(b).slice(s(a).length) : s(b) },
  trim: { params: STR, ret: 'string', call: ([a]) => s(a).trim() },
  upper: { params: STR, ret: 'string', call: ([a]) => s(a).toUpperCase() },
  lower: { params: STR, ret: 'string', call: ([a]) => s(a).toLowerCase() },
  replace: { params: ['string', 'string', 'string'], ret: 'string', call: ([o, w, src]) => s(o) === '' ? s(src) : s(src).split(s(o)).join(s(w)) },
  contains: { params: ['string', 'string'], ret: 'bool', call: ([sub, str]) => s(str).includes(s(sub)) },
  b64enc: { params: STR, ret: 'string', call: ([a]) => b64(s(a)) },
  sha256sum: { params: STR, ret: 'string', call: ([a]) => hex(s(a)) },
  toString: TO_STRING,
  int: { params: ['interface {}'], ret: 'int', call: ([a]) => new GoInt(toInt(a.v)) },
  list: { params: [], variadic: 'interface {}', ret: '[]interface {}', call: a => vals(a) },
  dict: { params: [], variadic: 'interface {}', ret: 'map[string]interface {}', call: a => { const out: VMap = {}, v = vals(a); for (let i = 0; i < v.length; i += 2) out[strval(v[i])] = i + 1 < v.length ? v[i + 1] : ''; return out; } },
  hasKey: { params: ['map[string]interface {}', 'string'], ret: 'bool', call: ([d, k]) => isMap(d.v) && Object.hasOwn(d.v, s(k)) },
  ternary: { params: ['interface {}', 'interface {}', 'bool'], ret: 'interface {}', call: ([t, f, c]) => c.v === true ? t.v : f.v },
  join: { params: ['string', 'interface {}'], ret: 'string', call: ([sep, v]) => strslice(v.v).join(s(sep)) },
  fail: { params: STR, ret: 'string', call: ([m], env) => { if (env.lint) return ''; throw warnRequired(s(m)); } },
  // Helm's own.
  required: { params: ['string', 'interface {}'], ret: 'interface {}', call: ([w, v], env) => (v.v === null || v.v === '') ? (env.lint ? '' : (() => { throw warnRequired(s(w)); })()) : v.v },
  include: { params: ['string', 'interface {}'], ret: 'string', call: ([name, data], env) => env.include(s(name), data) },
  tpl: { params: ['string', 'interface {}'], ret: 'string', call: ([text, data], env) => env.tpl(s(text), data) },
};
export const FUNC_NAMES: ReadonlySet<string> = new Set(Object.keys(FUNCS));

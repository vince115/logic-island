import { goJson } from './kube-output';
import type { J } from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §9): the subset of client-go's JSONPath kubectl's -o jsonpath and
 * custom-columns use. Text outside braces is printed as is; inside: a path of .field (\. escapes a dot in a key such as
 * kubectl\.kubernetes\.io/…), [N], [*], ..field (recursive descent), [?(@.a.b=="x")] (== and !=), the quoted literals
 * {"\n"} and {'\t'}, and {range …}…{end}. A missing key prints nothing (kubectl allows missing keys); several results of
 * one expression are joined with a space; maps and lists print as JSON.
 */

type Seg = { key: string } | { index: number } | { all: true } | { deep: string } | { filter: { path: Seg[]; op: '==' | '!='; value: string } };
type Node = { text: string } | { path: Seg[] } | { range: Seg[]; body: Node[] };

/** A path such as .status.conditions[?(@.type=="Ready")].status (a leading @ or $ is allowed). */
export function parsePath(src: string): Seg[] | { error: string } {
  const segs: Seg[] = [];
  let i = src.startsWith('$') || src.startsWith('@') ? 1 : 0;
  const name = () => { let out = ''; while (i < src.length && !'.[]'.includes(src[i])) { if (src[i] === '\\' && i + 1 < src.length) i++; out += src[i++]; } return out; };
  while (i < src.length) {
    if (src.startsWith('..', i)) { i += 2; segs.push({ deep: name() }); continue; }
    if (src[i] === '.') { i++; const k = name(); if (k) segs.push({ key: k }); continue; }
    if (src[i] === '[') {
      const end = src.indexOf(']', i);
      if (end < 0) return { error: 'unterminated array' };
      const inner = src.slice(i + 1, end).trim();
      i = end + 1;
      if (inner === '*') segs.push({ all: true });
      else if (/^-?\d+$/.test(inner)) segs.push({ index: Number(inner) });
      else if (/^'[^']*'$|^"[^"]*"$/.test(inner)) segs.push({ key: inner.slice(1, -1) });
      else {
        const m = /^\?\(@((?:\.[^=!]+?)+)\s*(==|!=)\s*(?:"([^"]*)"|'([^']*)'|(\S+))\)$/.exec(inner);
        if (!m) return { error: `unrecognized character in action: U+005B '['` };
        const p = parsePath(m[1]);
        if ('error' in p) return p;
        segs.push({ filter: { path: p, op: m[2] as '==' | '!=', value: m[3] ?? m[4] ?? m[5] } });
      }
      continue;
    }
    return { error: `unrecognized character in action: U+${src.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')} '${src[i]}'` };
  }
  return segs;
}

export function evalPath(roots: J[], segs: readonly Seg[]): J[] {
  let cur = roots;
  for (const s of segs) {
    const next: J[] = [];
    for (const v of cur) {
      if ('key' in s) { if (v && typeof v === 'object' && !Array.isArray(v) && s.key in v) next.push(v[s.key]); }
      else if ('index' in s) { if (Array.isArray(v)) { const x = v[s.index < 0 ? v.length + s.index : s.index]; if (x !== undefined) next.push(x); } }
      else if ('all' in s) { if (Array.isArray(v)) next.push(...v); else if (v && typeof v === 'object') next.push(...Object.values(v)); }
      else if ('deep' in s) next.push(...deep(v, s.deep));
      else if (Array.isArray(v)) next.push(...v.filter(x => { const got = evalPath([x], s.filter.path); const eq = got.length > 0 && scalar(got[0]) === s.filter.value; return s.filter.op === '==' ? eq : !eq; }));
    }
    cur = next;
  }
  return cur;
}
function deep(v: J, key: string): J[] {
  const out: J[] = [];
  const walk = (x: J) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) { if (k === key || key === '') out.push(y); walk(y); }
  };
  walk(v);
  return out;
}
/** How a result prints: strings as they are, other scalars as text, maps and lists as JSON. */
export const scalar = (v: J): string => typeof v === 'string' ? v : v === null ? '' : typeof v === 'object' ? goJson(v, false) : String(v);

/** Parses a template ({.a}{"\n"}{range .items[*]}…{end}); the error is client-go's sentence. */
export function parseTemplate(text: string): Node[] | { error: string } {
  const root: Node[] = [], stack: { range: Seg[]; body: Node[] }[] = [];
  const out = () => stack.length ? stack[stack.length - 1].body : root;
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) { out().push({ text: text.slice(i) }); break; }
    if (open > i) out().push({ text: text.slice(i, open) });
    let close = -1, q: string | null = null;
    for (let j = open + 1; j < text.length; j++) { const ch = text[j]; if (q) { if (ch === '\\') j++; else if (ch === q) q = null; continue; } if (ch === '"' || ch === "'") q = ch; else if (ch === '}') { close = j; break; } }
    if (close < 0) return { error: `unclosed action` };
    const act = text.slice(open + 1, close).trim();
    i = close + 1;
    if (/^(["']).*\1$/s.test(act)) { out().push({ text: act.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\(["'\\])/g, '$1') }); continue; }
    if (act === 'end') { const r = stack.pop(); if (!r) return { error: 'not in range, nothing to end' }; out().push(r); continue; }
    const range = /^range\s+(.+)$/.exec(act);
    const p = parsePath(range ? range[1] : act);
    if ('error' in p) return p;
    if (range) stack.push({ range: p, body: [] }); else out().push({ path: p });
  }
  if (stack.length) return { error: 'unclosed range' };
  return root;
}
export function runTemplate(nodes: readonly Node[], data: J): string {
  return nodes.map(n => 'text' in n ? n.text : 'path' in n ? evalPath([data], n.path).map(scalar).join(' ') : evalPath([data], n.range).map(x => runTemplate(n.body, x)).join('')).join('');
}

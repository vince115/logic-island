import { compare, looseEq, prop, truthy, type Val } from './expr-value';
import { callFunction, FUNCTIONS, type EvalContext } from './expr-fn';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §5): the expressions inside ${{ }} (and the whole text of an
 * if:). Literals (null, true, false, numbers, 'strings' with '' for a quote), named values (the contexts github, env, vars,
 * secrets, inputs, matrix, needs, steps, runner, job, strategy), property access (.name, ['name'], [0], .* and [*]),
 * function calls, ! < <= > >= == != && || and parentheses, with GitHub's precedence. Parse errors use the runner's texts
 * ("Unrecognized named-value: 'secret'. Located at position 1 within expression: secret.TOKEN").
 */

export const CONTEXTS = ['github', 'env', 'vars', 'secrets', 'inputs', 'matrix', 'needs', 'steps', 'runner', 'job', 'strategy'] as const;
export type ExprNode =
  | { k: 'lit'; v: Val }
  | { k: 'ctx'; name: string }
  | { k: 'prop'; of: ExprNode; name: string }
  | { k: 'index'; of: ExprNode; index: ExprNode }
  | { k: 'star'; of: ExprNode }
  | { k: 'not'; x: ExprNode }
  | { k: 'bin'; op: string; a: ExprNode; b: ExprNode }
  | { k: 'call'; name: string; args: ExprNode[] };

export class ExprError extends Error {}
type Tok = { t: 'num' | 'str' | 'id' | 'op' | 'end'; s: string; v?: Val; at: number };

function lex(src: string): Tok[] | ExprError {
  const out: Tok[] = [];
  let i = 0;
  const bad = (at: number, s: string) => new ExprError(`Unexpected symbol: '${s}'. Located at position ${at + 1} within expression: ${src}`);
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { out.push({ t: 'op', s: two, at: i }); i += 2; continue; }
    if ('()[],.!<>*'.includes(ch)) { out.push({ t: 'op', s: ch, at: i }); i++; continue; }
    if (ch === "'") {
      let j = i + 1, text = '';
      for (; j < src.length; j++) { if (src[j] === "'") { if (src[j + 1] === "'") { text += "'"; j++; continue; } break; } text += src[j]; }
      if (j >= src.length) return bad(i, src.slice(i));
      out.push({ t: 'str', s: src.slice(i, j + 1), v: text, at: i });
      i = j + 1;
      continue;
    }
    const num = /^(?:0x[0-9a-fA-F]+|0o[0-7]+|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
    if (num && /[\d.]/.test(ch === '-' || ch === '+' ? src[i + 1] ?? '' : ch) && !(out.length && out[out.length - 1].s === '.' && out[out.length - 1].t === 'op')) {
      const s = num[0], v = /^0x/.test(s) ? parseInt(s.slice(2), 16) : /^0o/.test(s) ? parseInt(s.slice(2), 8) : Number(s);
      out.push({ t: 'num', s, v, at: i });
      i += s.length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(src.slice(i));
    if (id) { out.push({ t: 'id', s: id[0], at: i }); i += id[0].length; continue; }
    return bad(i, ch);
  }
  out.push({ t: 'end', s: '', at: src.length });
  return out;
}

export interface ExprRules {
  /** The named values allowed here (default: every context). */
  names?: readonly string[];
  /** Extra functions allowed here besides the general ones (success, failure, always, cancelled for if:, hashFiles for steps). */
  functions?: readonly string[];
}
const GENERAL = ['contains', 'startswith', 'endswith', 'format', 'join', 'tojson', 'fromjson'];

/** Parses an expression (the text inside ${{ }}); throws ExprError with the runner's message. */
export function parseExpr(text: string, rules: ExprRules = {}): ExprNode {
  const src = text.trim(), lexed = lex(src);
  if (lexed instanceof ExprError) throw lexed;
  const toks = lexed;
  let p = 0;
  const names = (rules.names ?? CONTEXTS).map(n => n.toLowerCase());
  const fns = [...GENERAL, ...(rules.functions ?? []).map(f => f.toLowerCase())];
  const fail = (kind: string, t: Tok) => new ExprError(`${kind}: '${t.t === 'end' ? toks[Math.max(0, p - 1)]?.s ?? '' : t.s}'. Located at position ${(t.t === 'end' ? toks[Math.max(0, p - 1)]?.at ?? 0 : t.at) + 1} within expression: ${src}`);
  const peek = () => toks[p];
  const take = (s: string) => { if (peek().t === 'op' && peek().s === s) { p++; return true; } return false; };
  const need = (s: string) => { if (!take(s)) throw fail(peek().t === 'end' ? 'Unexpected end of expression' : 'Unexpected symbol', peek()); };
  const binary = (ops: string[], next: () => ExprNode) => (): ExprNode => {
    let a = next();
    while (peek().t === 'op' && ops.includes(peek().s)) { const op = toks[p++].s; a = { k: 'bin', op, a, b: next() }; }
    return a;
  };
  const primary = (): ExprNode => {
    const t = peek();
    if (t.t === 'end') throw fail('Unexpected end of expression', t);
    if (t.t === 'num' || t.t === 'str') { p++; return { k: 'lit', v: t.v! }; }
    if (t.t === 'op' && t.s === '(') { p++; const e = or(); need(')'); return e; }
    if (t.t === 'id') {
      p++;
      const lower = t.s.toLowerCase();
      if (take('(')) {
        const spec = FUNCTIONS[lower];
        if (!spec || !fns.includes(lower)) throw fail('Unrecognized function', t);
        const args: ExprNode[] = [];
        if (!take(')')) { do args.push(or()); while (take(',')); need(')'); }
        if (args.length < spec.min) throw fail('Too few parameters supplied', t);
        if (args.length > spec.max) throw fail('Too many parameters supplied', t);
        return { k: 'call', name: lower, args };
      }
      if (lower === 'true' || lower === 'false') return { k: 'lit', v: lower === 'true' };
      if (lower === 'null') return { k: 'lit', v: null };
      if (!names.includes(lower)) throw fail('Unrecognized named-value', t);
      return { k: 'ctx', name: lower };
    }
    throw fail('Unexpected symbol', t);
  };
  const postfix = (): ExprNode => {
    let e = primary();
    for (;;) {
      if (take('.')) {
        const t = peek();
        if (t.t === 'op' && t.s === '*') { p++; e = { k: 'star', of: e }; continue; }
        if (t.t !== 'id') throw fail(t.t === 'end' ? 'Unexpected end of expression' : 'Unexpected symbol', t);
        p++;
        e = { k: 'prop', of: e, name: t.s };
        continue;
      }
      if (take('[')) {
        if (take('*')) { need(']'); e = { k: 'star', of: e }; continue; }
        const index = or();
        need(']');
        e = { k: 'index', of: e, index };
        continue;
      }
      return e;
    }
  };
  const unary = (): ExprNode => (take('!') ? { k: 'not', x: unary() } : postfix());
  const cmp = binary(['<', '<=', '>', '>='], unary), eq = binary(['==', '!='], cmp), and = binary(['&&'], eq), or = binary(['||'], and);
  if (peek().t === 'end') throw new ExprError('An expression was expected');
  const e = or();
  if (peek().t !== 'end') throw fail('Unexpected symbol', peek());
  return e;
}

/** Whether an expression calls one of the status functions (then if: does not add the implicit success()). */
export function usesStatus(e: ExprNode): boolean {
  switch (e.k) {
    case 'call': return ['success', 'failure', 'always', 'cancelled'].includes(e.name) || e.args.some(usesStatus);
    case 'not': return usesStatus(e.x);
    case 'bin': return usesStatus(e.a) || usesStatus(e.b);
    case 'prop': case 'star': return usesStatus(e.of);
    case 'index': return usesStatus(e.of) || usesStatus(e.index);
    default: return false;
  }
}

const elements = (v: Val): Val[] => (Array.isArray(v) ? v : v !== null && typeof v === 'object' ? Object.values(v) : []);
const has = (v: Val, name: string) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).some(k => k.toLowerCase() === name.toLowerCase());

/** Evaluates with the runner's filtered arrays: after .* or [*], property access and indexing apply to each element (missing ones are left out). */
function ev(e: ExprNode, ctx: EvalContext): { v: Val; filtered: boolean } {
  const plain = (v: Val) => ({ v, filtered: false });
  switch (e.k) {
    case 'lit': return plain(e.v);
    case 'ctx': return plain(prop(ctx.contexts as Val, e.name));
    case 'star': { const o = ev(e.of, ctx); return { v: o.filtered ? (o.v as Val[]).flatMap(elements) : elements(o.v), filtered: true }; }
    case 'prop': {
      const o = ev(e.of, ctx);
      return o.filtered ? { v: (o.v as Val[]).filter(x => has(x, e.name)).map(x => prop(x, e.name)), filtered: true } : plain(prop(o.v, e.name));
    }
    case 'index': {
      const o = ev(e.of, ctx), i = evaluate(e.index, ctx);
      const at = (of: Val): Val | undefined => {
        if (Array.isArray(of)) { const n = typeof i === 'number' ? Math.trunc(i) : NaN; return Number.isInteger(n) && n >= 0 && n < of.length ? of[n] : undefined; }
        return typeof i === 'string' && has(of, i) ? prop(of, i) : undefined;
      };
      if (o.filtered) return { v: (o.v as Val[]).map(at).filter((x): x is Val => x !== undefined), filtered: true };
      return plain(at(o.v) ?? null);
    }
    case 'not': return plain(!truthy(evaluate(e.x, ctx)));
    case 'bin': {
      const a = evaluate(e.a, ctx);
      if (e.op === '&&') return plain(truthy(a) ? evaluate(e.b, ctx) : a);
      if (e.op === '||') return plain(truthy(a) ? a : evaluate(e.b, ctx));
      const b = evaluate(e.b, ctx);
      if (e.op === '==') return plain(looseEq(a, b));
      if (e.op === '!=') return plain(!looseEq(a, b));
      return plain(compare(e.op as '<', a, b));
    }
    case 'call': return plain(callFunction(e.name, e.args.map(x => evaluate(x, ctx)), ctx));
  }
}
/** Evaluates a parsed expression. */
export const evaluate = (e: ExprNode, ctx: EvalContext): Val => ev(e, ctx).v;

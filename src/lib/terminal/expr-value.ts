/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §5): the values of GitHub Actions expressions and their
 * coercions — null, booleans, numbers, strings, arrays and objects; loose equality (different types compare as numbers,
 * strings without regard to case), truthiness, conversion to text and toJSON's indented JSON.
 */

export type Val = null | boolean | number | string | Val[] | { [key: string]: Val };
export type Obj = { [key: string]: Val };

export const isObj = (v: Val): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isComposite = (v: Val) => v !== null && typeof v === 'object';

/** false, 0, -0, '', null and NaN are falsy; everything else (arrays and objects too) is truthy. */
export function truthy(v: Val): boolean {
  if (v === null || v === false || v === '') return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  return true;
}

/** A string as a number: '' is 0, JSON-like numbers, 0x hex and 0o octal; anything else NaN. */
export function parseNumber(s: string): number {
  const t = s.trim();
  if (t === '') return 0;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) return Number(t);
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t.slice(2), 16);
  if (/^0o[0-7]+$/.test(t)) return parseInt(t.slice(2), 8);
  return NaN;
}

export function toNum(v: Val): number {
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseNumber(v);
  return NaN;
}

/** A number as text (at most 15 significant digits, -0 as 0). */
export function numberText(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  if (Object.is(n, -0) || n === 0) return '0';
  return String(Number(n.toPrecision(15)));
}

/** A value as text (what ${{ }} puts into a string): null is '', arrays and objects are 'Array' and 'Object'. */
export function toStr(v: Val): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return numberText(v);
  if (typeof v === 'string') return v;
  return Array.isArray(v) ? 'Array' : 'Object';
}

const fold = (s: string) => s.toUpperCase();

/** ==: the same type compares directly (strings ignoring case, arrays and objects by identity); different types as numbers. */
export function looseEq(a: Val, b: Val): boolean {
  if (a === null && b === null) return true;
  if (isComposite(a) || isComposite(b)) return a === b;
  if (typeof a === 'string' && typeof b === 'string') return fold(a) === fold(b);
  if (typeof a === typeof b) return a === b;
  return toNum(a) === toNum(b);
}

/** <, <=, >, >=: strings ignoring case, otherwise as numbers (NaN never compares). */
export function compare(op: '<' | '<=' | '>' | '>=', a: Val, b: Val): boolean {
  if (isComposite(a) || isComposite(b)) return false;
  let x: number | string, y: number | string;
  if (typeof a === 'string' && typeof b === 'string') { x = fold(a); y = fold(b); }
  else { x = toNum(a); y = toNum(b); if (Number.isNaN(x) || Number.isNaN(y)) return false; }
  return op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : x >= y;
}

/** A property of an object, by name without regard to case (null when absent or not an object). */
export function prop(v: Val, name: string): Val {
  if (!isObj(v)) return null;
  if (Object.prototype.hasOwnProperty.call(v, name)) return v[name];
  const lower = name.toLowerCase(), key = Object.keys(v).find(k => k.toLowerCase() === lower);
  return key === undefined ? null : v[key];
}

/** toJSON: JSON with two-space indentation (numbers as numberText). */
export function toJson(v: Val, indent = ''): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? numberText(v) : 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  const inner = `${indent}  `;
  if (Array.isArray(v)) return v.length ? `[\n${v.map(x => inner + toJson(x, inner)).join(',\n')}\n${indent}]` : '[]';
  const keys = Object.keys(v);
  return keys.length ? `{\n${keys.map(k => `${inner}${JSON.stringify(k)}: ${toJson(v[k], inner)}`).join(',\n')}\n${indent}}` : '{}';
}

/** A JSON value from plain JavaScript data (undefined dropped). */
export function fromPlain(x: unknown): Val {
  if (x === null || x === undefined) return null;
  if (typeof x === 'boolean' || typeof x === 'number' || typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(fromPlain);
  if (typeof x === 'object') {
    const out: Obj = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) if (v !== undefined) out[k] = fromPlain(v);
    return out;
  }
  return null;
}

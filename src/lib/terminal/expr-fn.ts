import { sha256 } from './ssh';
import { utf8 } from './git';
import { fromPlain, looseEq, toJson, toStr, type Val } from './expr-value';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §5): the functions of GitHub Actions expressions — contains,
 * startsWith, endsWith (without regard to case), format, join, toJSON, fromJSON, hashFiles and the status functions
 * success, failure, always and cancelled. hashFiles hashes each matching workspace file with SHA-256 (in path order) and
 * then the concatenated digests; the runner's exact traversal order is noted as uncertain.
 */

/** What an evaluation can see: the contexts, the job's status so far and (for hashFiles) the workspace's files. */
export interface EvalContext {
  contexts: Readonly<Record<string, Val>>;
  /** A step or job before this one failed, or the run was cancelled (default: neither). */
  status?: { failure?: boolean; cancelled?: boolean };
  /** The workspace's files, by path relative to the workspace. */
  files?: ReadonlyMap<string, string>;
}

/** Each function's name (lower case, as the runner matches them) and how many arguments it takes. */
export const FUNCTIONS: Readonly<Record<string, { min: number; max: number }>> = {
  contains: { min: 2, max: 2 }, startswith: { min: 2, max: 2 }, endswith: { min: 2, max: 2 }, format: { min: 1, max: 255 }, join: { min: 1, max: 2 },
  tojson: { min: 1, max: 1 }, fromjson: { min: 1, max: 1 }, hashfiles: { min: 1, max: 255 },
  success: { min: 0, max: 0 }, failure: { min: 0, max: 0 }, always: { min: 0, max: 0 }, cancelled: { min: 0, max: 0 },
};

export class ExprEvalError extends Error {}
const lower = (v: Val) => toStr(v).toLowerCase();

/** format('{0} and {1}', a, b): {N} is argument N as text, {{ and }} are braces. */
export function format(text: string, args: readonly Val[]): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ((ch === '{' || ch === '}') && text[i + 1] === ch) { out += ch; i++; continue; }
    if (ch === '{') {
      const m = /^\{(\d+)\}/.exec(text.slice(i));
      if (!m) throw new ExprEvalError(`The following format string is invalid: ${text}`);
      const n = Number(m[1]);
      if (n >= args.length) throw new ExprEvalError(`The following format string references more arguments than were supplied: ${text}`);
      out += toStr(args[n]);
      i += m[0].length - 1;
      continue;
    }
    if (ch === '}') throw new ExprEvalError(`The following format string is invalid: ${text}`);
    out += ch;
  }
  return out;
}

const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const GLOB_SPECIAL = /[.^$|(){}\\/+]/;
/** A hashFiles pattern (the glob of @actions/glob: * within a folder, ** any folders, ? one character, [set]) as a RegExp. */
export function hashGlob(pattern: string): RegExp {
  let re = '';
  const p = pattern.replace(/^\.\//, '');
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*' && p[i + 1] === '*') {
      const folder = p[i + 2] === '/' && (i === 0 || p[i - 1] === '/');
      re += folder ? '(?:[^/]+/)*' : '.*';
      i += folder ? 2 : 1;
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '[') { const end = p.indexOf(']', i + 1); if (end > i + 1) { re += `[${p.slice(i + 1, end).replace(/^!/, '^')}]`; i = end; } else re += '\\['; }
    else re += GLOB_SPECIAL.test(ch) ? `\\${ch}` : ch;
  }
  return new RegExp(`^${re}$`);
}

/** hashFiles: the files any pattern matches and no !pattern excludes, sorted by path; '' when none match. */
export function hashFiles(patterns: readonly string[], files: ReadonlyMap<string, string>): string {
  const include = patterns.filter(p => !p.startsWith('!')).map(hashGlob), exclude = patterns.filter(p => p.startsWith('!')).map(p => hashGlob(p.slice(1)));
  const matched = [...files.keys()].filter(f => include.some(r => r.test(f)) && !exclude.some(r => r.test(f))).sort();
  if (!matched.length) return '';
  const digests = matched.map(f => sha256(utf8(files.get(f)!)));
  const all = new Uint8Array(digests.length * 32);
  digests.forEach((d, i) => all.set(d, i * 32));
  return hex(sha256(all));
}

/** Calls a function (its name in lower case) on evaluated arguments. */
export function callFunction(name: string, args: readonly Val[], ctx: EvalContext): Val {
  const failed = !!ctx.status?.failure, cancelled = !!ctx.status?.cancelled;
  switch (name) {
    case 'success': return !failed && !cancelled;
    case 'failure': return failed;
    case 'always': return true;
    case 'cancelled': return cancelled;
    case 'contains': return Array.isArray(args[0]) ? args[0].some(x => looseEq(x, args[1])) : lower(args[0]).includes(lower(args[1]));
    case 'startswith': return lower(args[0]).startsWith(lower(args[1]));
    case 'endswith': return lower(args[0]).endsWith(lower(args[1]));
    case 'format': return format(toStr(args[0]), args.slice(1));
    case 'join': return Array.isArray(args[0]) ? args[0].map(toStr).join(args.length > 1 ? toStr(args[1]) : ',') : toStr(args[0]);
    case 'tojson': return toJson(args[0]);
    case 'fromjson': {
      try { return fromPlain(JSON.parse(toStr(args[0]))); } catch { throw new ExprEvalError(`Error parsing fromJson: ${toStr(args[0])}`); }
    }
    case 'hashfiles': return hashFiles(args.map(toStr), ctx.files ?? new Map());
    default: throw new ExprEvalError(`Unrecognized function: '${name}'`);
  }
}

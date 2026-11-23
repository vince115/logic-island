import type { Y, YamlPos } from './yaml';
import { CONTEXTS, type ExprRules } from './expr';
import { hasExpression, ifProblem, templateProblem } from './expr-template';
import type { Obj, Val } from './expr-value';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §3): reading a workflow's YAML nodes with GitHub's validation
 * texts — "Unexpected value 'x'" for an unknown key or a bad value, "A sequence was not expected", "A mapping was not
 * expected" — each at the line and column of the node, and the contexts each place of a workflow may use in ${{ }}.
 */

export interface WfError { line?: number; col?: number; message: string }
export class Issues {
  readonly list: WfError[] = [];
  add(at: YamlPos | undefined, message: string) { this.list.push(at ? { line: at.line, col: at.col, message } : { message }); }
}
export type MapNode = Extract<Y, { t: 'map' }>;
export interface Entry { key: string; at: YamlPos; node: Y }

const shown = (y: Y) => (y.t === 'str' ? y.v : y.t === 'null' ? '' : '');
/** A mapping's entries (null is an empty mapping); unknown keys are reported where they are written. */
export function entries(y: Y, issues: Issues, allowed?: readonly string[]): Entry[] | undefined {
  if (y.t === 'null') return [];
  if (y.t === 'seq') { issues.add(y, 'A sequence was not expected'); return undefined; }
  if (y.t === 'str') { issues.add(y, `Unexpected value '${y.v}'`); return undefined; }
  const out: Entry[] = [];
  y.m.forEach(([key, node], i) => {
    if (allowed && !allowed.includes(key)) issues.add(y.keys[i], `Unexpected value '${key}'`);
    else out.push({ key, at: y.keys[i], node });
  });
  return out;
}
/** A scalar's text (a mapping or sequence is reported; null is ''). */
export function scalar(y: Y, issues: Issues): string | undefined {
  if (y.t === 'map') { issues.add(y, 'A mapping was not expected'); return undefined; }
  if (y.t === 'seq') { issues.add(y, 'A sequence was not expected'); return undefined; }
  return shown(y);
}
/** A string or a sequence of strings. */
export function stringList(y: Y, issues: Issues): string[] | undefined {
  if (y.t === 'seq') { const out = y.a.map(x => scalar(x, issues)); return out.every(x => x !== undefined) ? out as string[] : undefined; }
  const s = scalar(y, issues);
  return s === undefined ? undefined : y.t === 'null' ? [] : [s];
}
/** A boolean, or (where allowed) an expression. */
export function booleanText(y: Y, issues: Issues, expression: boolean): string | undefined {
  const s = scalar(y, issues);
  if (s === undefined) return undefined;
  if (s === 'true' || s === 'false' || (expression && hasExpression(s))) return s;
  issues.add(y, `Unexpected value '${s}'`);
  return undefined;
}
/** A number, or (where allowed) an expression. */
export function numberText(y: Y, issues: Issues, expression: boolean): string | undefined {
  const s = scalar(y, issues);
  if (s === undefined) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(s) || (expression && hasExpression(s))) return s;
  issues.add(y, `Unexpected value '${s}'`);
  return undefined;
}
/** A mapping of names to scalar texts (env, with, outputs). */
export function stringMap(y: Y, issues: Issues): [string, string][] {
  const out: [string, string][] = [];
  for (const e of entries(y, issues) ?? []) { const v = scalar(e.node, issues); if (v !== undefined) out.push([e.key, v]); }
  return out;
}

/** A YAML node as an expression value: unquoted true/false and numbers keep their type, null is null. */
export function toVal(y: Y): Val {
  if (y.t === 'null') return null;
  if (y.t === 'seq') return y.a.map(toVal);
  if (y.t === 'map') { const o: Obj = {}; for (const [k, v] of y.m) o[k] = toVal(v); return o; }
  if (!y.q && /^(true|false)$/.test(y.v)) return y.v === 'true';
  if (!y.q && /^-?\d+(\.\d+)?$/.test(y.v)) return Number(y.v);
  return y.v;
}

// --------------------------------------------------------------------------------------- where ${{ }} may be used

const ALL_STEP = ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'secrets', 'steps', 'inputs'];
/** GitHub's context availability: the named values (and extra functions) each place allows. */
export const PLACES: Readonly<Record<string, ExprRules>> = {
  'run-name': { names: ['github', 'inputs', 'vars'] },
  concurrency: { names: ['github', 'inputs', 'vars'] },
  env: { names: ['github', 'secrets', 'inputs', 'vars'] },
  'job.if': { names: ['github', 'needs', 'vars', 'inputs'] },
  'job.name': { names: ['github', 'needs', 'strategy', 'matrix', 'vars', 'inputs'] },
  'job.runs-on': { names: ['github', 'needs', 'strategy', 'matrix', 'vars', 'inputs'] },
  'job.env': { names: ['github', 'needs', 'strategy', 'matrix', 'vars', 'secrets', 'inputs'] },
  'job.environment': { names: ['github', 'needs', 'strategy', 'matrix', 'vars', 'inputs'] },
  'job.environment.url': { names: ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'steps', 'inputs'] },
  'job.concurrency': { names: ['github', 'needs', 'strategy', 'matrix', 'inputs', 'vars'] },
  'job.outputs': { names: ALL_STEP },
  'job.strategy': { names: ['github', 'needs', 'vars', 'inputs'] },
  'job.timeout-minutes': { names: ['github', 'needs', 'strategy', 'matrix', 'vars', 'inputs'] },
  'job.continue-on-error': { names: ['github', 'needs', 'strategy', 'vars', 'matrix', 'inputs'] },
  'job.defaults.run': { names: ['github', 'needs', 'strategy', 'matrix', 'env', 'vars', 'inputs'] },
  'step.if': { names: ALL_STEP.filter(n => n !== 'secrets'), functions: ['hashFiles'] },
  step: { names: ALL_STEP, functions: ['hashFiles'] },
};
export const ANY_CONTEXT: ExprRules = { names: CONTEXTS };

/** Reports the first expression problem of a value at a place (templates; if: is an expression). */
export function checkExpr(text: string | undefined, at: YamlPos, place: string, issues: Issues, isIf = false) {
  if (text === undefined || (!isIf && !hasExpression(text))) return;
  const problem = isIf ? ifProblem(text, PLACES[place]) : templateProblem(text, PLACES[place]);
  if (problem) issues.add(at, problem);
}

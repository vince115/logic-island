import type { Y, YamlPos } from './yaml';
import type { Obj, Val } from './expr-value';
import { looseEq } from './expr-value';
import { hasExpression } from './expr-template';
import { parsePermissions, type PermissionsSpec } from './workflow-perms';
import { booleanText, checkExpr, entries, numberText, scalar, stringList, stringMap, toVal, type Issues } from './workflow-read';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §3): a workflow's jobs and steps. Values that may hold
 * expressions are kept as written (E28 evaluates them when it runs the job); here they are checked against the contexts
 * each place allows. A matrix expands as GitHub does: the product of its vectors, then exclude, then include (which adds
 * keys to combinations it does not contradict, or makes a new combination).
 */

export interface WorkflowStep {
  at: YamlPos; id?: string; name?: string; uses?: string; run?: string; if?: string; shell?: string; workingDirectory?: string;
  with: [string, string][]; env: [string, string][]; continueOnError: string; timeoutMinutes?: string;
}
export interface MatrixSpec { vectors: [string, Val[]][]; include: Obj[]; exclude: Obj[]; /** A matrix written as one ${{ }}. */ expression?: string }
export interface WorkflowJob {
  id: string; at: YamlPos; name?: string;
  /** runs-on labels (one expression stays as written). */
  runsOn: string[]; needs: string[]; if?: string; env: [string, string][]; permissions?: PermissionsSpec; outputs: [string, string][];
  strategy?: { matrix?: MatrixSpec; failFast: string; maxParallel?: string };
  timeoutMinutes: string; continueOnError: string; environment?: { name: string; url?: string };
  concurrency?: { group: string; cancelInProgress: string };
  defaults: { shell?: string; workingDirectory?: string };
  steps: WorkflowStep[];
  /** A reusable workflow the job calls (not run by the simulation). */
  uses?: string;
}

export const ID = /^[A-Za-z_][A-Za-z0-9_-]{0,98}$/;
export const badId = (id: string) => `The identifier '${id}' is invalid. IDs may only contain alphanumeric characters, '_', and '-'. IDs must start with a letter or '_' and must be less than 100 characters.`;
const USES = /^(?:\.\/\S*|docker:\/\/\S+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[^@\s]+)?@[^@\s]+)$/;

/** defaults.run (shell, working-directory) of the workflow or a job. */
export function parseDefaults(y: Y, issues: Issues, place: string): { shell?: string; workingDirectory?: string } {
  const out: { shell?: string; workingDirectory?: string } = {};
  for (const d of entries(y, issues, ['run']) ?? []) for (const e of entries(d.node, issues, ['shell', 'working-directory']) ?? []) {
    const v = scalar(e.node, issues);
    if (v === undefined) continue;
    checkExpr(v, e.node, place, issues);
    if (e.key === 'shell') out.shell = v; else out.workingDirectory = v;
  }
  return out;
}
/** concurrency: a group string or { group, cancel-in-progress } (parsed here, enforced in E30). */
export function parseConcurrency(y: Y, issues: Issues, place: string): { group: string; cancelInProgress: string } | undefined {
  if (y.t === 'str') { checkExpr(y.v, y, place, issues); return { group: y.v, cancelInProgress: 'false' }; }
  let group: string | undefined, cancel = 'false';
  for (const e of entries(y, issues, ['group', 'cancel-in-progress']) ?? []) {
    if (e.key === 'group') { group = scalar(e.node, issues); checkExpr(group, e.node, place, issues); }
    else cancel = booleanText(e.node, issues, true) ?? cancel;
  }
  if (group === undefined) { issues.add(y, 'Required property is missing: group'); return undefined; }
  return { group, cancelInProgress: cancel };
}

function parseMatrix(y: Y, issues: Issues): MatrixSpec | undefined {
  if (y.t === 'str') { if (hasExpression(y.v)) { checkExpr(y.v, y, 'job.strategy', issues); return { vectors: [], include: [], exclude: [], expression: y.v }; } issues.add(y, `Unexpected value '${y.v}'`); return undefined; }
  const m: MatrixSpec = { vectors: [], include: [], exclude: [] };
  for (const e of entries(y, issues) ?? []) {
    if (e.key === 'include' || e.key === 'exclude') {
      if (e.node.t === 'str' && hasExpression(e.node.v)) continue;
      if (e.node.t !== 'seq') { issues.add(e.node, e.node.t === 'map' ? 'A mapping was not expected' : `Unexpected value '${e.node.t === 'str' ? e.node.v : ''}'`); continue; }
      for (const item of e.node.a) { if (item.t === 'map') m[e.key].push(toVal(item) as Obj); else issues.add(item, item.t === 'seq' ? 'A sequence was not expected' : `Unexpected value '${item.t === 'str' ? item.v : ''}'`); }
      continue;
    }
    if (e.node.t === 'str' && hasExpression(e.node.v)) { checkExpr(e.node.v, e.node, 'job.strategy', issues); continue; }
    if (e.node.t !== 'seq') { issues.add(e.node, e.node.t === 'map' ? 'A mapping was not expected' : `Unexpected value '${e.node.t === 'str' ? e.node.v : ''}'`); continue; }
    if (!e.node.a.length) { issues.add(e.node, `Matrix vector '${e.key}' does not contain any values`); continue; }
    m.vectors.push([e.key, e.node.a.map(toVal)]);
  }
  for (const x of m.exclude) for (const k of Object.keys(x)) if (!m.vectors.some(([v]) => v === k)) issues.add(y, `Matrix exclude key '${k}' does not match any key within the matrix`);
  return m;
}

/** The job combinations of a matrix (GitHub's order: the first vector varies slowest). */
export function expandMatrix(m: MatrixSpec): Obj[] {
  let combos: Obj[] = m.vectors.length ? [{}] : [];
  for (const [key, values] of m.vectors) combos = combos.flatMap(c => values.map(v => ({ ...c, [key]: v })));
  combos = combos.filter(c => !m.exclude.some(x => Object.entries(x).every(([k, v]) => k in c && looseEq(c[k], v))));
  const original = new Set(m.vectors.map(([k]) => k)), out = combos.map(c => ({ base: c, added: {} as Obj })), matrix = out.slice();
  for (const inc of m.include) {
    let used = false;
    for (const o of matrix) {
      const keeps = Object.entries(inc).every(([k, v]) => !original.has(k) || looseEq(o.base[k], v));
      if (keeps) { Object.assign(o.added, Object.fromEntries(Object.entries(inc).filter(([k]) => !original.has(k)))); used = true; }
    }
    if (!used) out.push({ base: { ...inc }, added: {} });
  }
  return out.map(o => ({ ...o.base, ...o.added }));
}

function parseStep(y: Y, issues: Issues): WorkflowStep | undefined {
  const es = entries(y, issues, ['id', 'if', 'name', 'uses', 'run', 'working-directory', 'shell', 'with', 'env', 'continue-on-error', 'timeout-minutes']);
  if (!es) return undefined;
  const s: WorkflowStep = { at: { line: y.line, col: y.col }, with: [], env: [], continueOnError: 'false' };
  for (const e of es) {
    if (e.key === 'with' || e.key === 'env') { s[e.key] = stringMap(e.node, issues); s[e.key].forEach(([, v]) => checkExpr(v, e.node, 'step', issues)); continue; }
    if (e.key === 'continue-on-error') { s.continueOnError = booleanText(e.node, issues, true) ?? 'false'; checkExpr(s.continueOnError, e.node, 'step', issues); continue; }
    if (e.key === 'timeout-minutes') { s.timeoutMinutes = numberText(e.node, issues, true); checkExpr(s.timeoutMinutes, e.node, 'step', issues); continue; }
    const v = scalar(e.node, issues);
    if (v === undefined) continue;
    if (e.key === 'id') { if (ID.test(v)) s.id = v; else issues.add(e.node, badId(v)); }
    else if (e.key === 'uses') { if (USES.test(v)) s.uses = v; else issues.add(e.node, `Expected format {org}/{repo}[/path]@ref. Actual '${v}'`); }
    else if (e.key === 'if') { s.if = v; checkExpr(v, e.node, 'step.if', issues, true); }
    else {
      checkExpr(v, e.node, 'step', issues);
      if (e.key === 'run') s.run = v; else if (e.key === 'name') s.name = v; else if (e.key === 'shell') s.shell = v; else s.workingDirectory = v;
    }
  }
  const has = (k: string) => es.some(e => e.key === k);
  if (!has('uses') && !has('run')) issues.add(y, 'Every step must define a `uses` or `run` key');
  if (has('uses') && has('run')) issues.add(y, 'A step cannot have both the `uses` and `run` keys');
  return s;
}

export const JOB_KEYS = ['name', 'permissions', 'needs', 'if', 'runs-on', 'environment', 'concurrency', 'outputs', 'env', 'defaults', 'steps', 'timeout-minutes',
  'strategy', 'continue-on-error', 'container', 'services', 'uses', 'with', 'secrets'];

/** One job (its id at the key's position). */
export function parseJob(id: string, at: YamlPos, y: Y, issues: Issues): WorkflowJob | undefined {
  if (!ID.test(id)) issues.add(at, badId(id));
  const es = entries(y, issues, JOB_KEYS);
  if (!es) return undefined;
  const job: WorkflowJob = { id, at, runsOn: [], needs: [], env: [], outputs: [], timeoutMinutes: '360', continueOnError: 'false', defaults: {}, steps: [] };
  for (const e of es) {
    const n = e.node;
    switch (e.key) {
      case 'name': job.name = scalar(n, issues); checkExpr(job.name, n, 'job.name', issues); break;
      case 'permissions': job.permissions = parsePermissions(n, issues); break;
      case 'needs': job.needs = stringList(n, issues) ?? []; break;
      case 'if': job.if = scalar(n, issues); checkExpr(job.if, n, 'job.if', issues, true); break;
      case 'runs-on': {
        if (n.t === 'map') { for (const r of entries(n, issues, ['group', 'labels']) ?? []) if (r.key === 'labels') job.runsOn = stringList(r.node, issues) ?? []; break; }
        job.runsOn = stringList(n, issues) ?? [];
        job.runsOn.forEach(l => checkExpr(l, n, 'job.runs-on', issues));
        break;
      }
      case 'environment': {
        if (n.t === 'str') { job.environment = { name: n.v }; checkExpr(n.v, n, 'job.environment', issues); break; }
        let name: string | undefined, url: string | undefined;
        for (const v of entries(n, issues, ['name', 'url']) ?? []) {
          const text = scalar(v.node, issues);
          if (v.key === 'name') { name = text; checkExpr(text, v.node, 'job.environment', issues); } else { url = text; checkExpr(text, v.node, 'job.environment.url', issues); }
        }
        if (name !== undefined) job.environment = { name, ...url !== undefined ? { url } : {} }; else issues.add(n, 'Required property is missing: name');
        break;
      }
      case 'concurrency': job.concurrency = parseConcurrency(n, issues, 'job.concurrency'); break;
      case 'outputs': job.outputs = stringMap(n, issues); job.outputs.forEach(([, v]) => checkExpr(v, n, 'job.outputs', issues)); break;
      case 'env': job.env = stringMap(n, issues); job.env.forEach(([, v]) => checkExpr(v, n, 'job.env', issues)); break;
      case 'defaults': job.defaults = parseDefaults(n, issues, 'job.defaults.run'); break;
      case 'timeout-minutes': job.timeoutMinutes = numberText(n, issues, true) ?? '360'; checkExpr(job.timeoutMinutes, n, 'job.timeout-minutes', issues); break;
      case 'continue-on-error': job.continueOnError = booleanText(n, issues, true) ?? 'false'; checkExpr(job.continueOnError, n, 'job.continue-on-error', issues); break;
      case 'strategy': {
        const st: NonNullable<WorkflowJob['strategy']> = { failFast: 'true' };
        for (const v of entries(n, issues, ['matrix', 'fail-fast', 'max-parallel']) ?? []) {
          if (v.key === 'matrix') st.matrix = parseMatrix(v.node, issues);
          else if (v.key === 'fail-fast') st.failFast = booleanText(v.node, issues, true) ?? 'true';
          else st.maxParallel = numberText(v.node, issues, true);
        }
        job.strategy = st;
        break;
      }
      case 'steps': {
        if (n.t !== 'seq') { if (n.t !== 'null') issues.add(n, n.t === 'map' ? 'A mapping was not expected' : `Unexpected value '${n.t === 'str' ? n.v : ''}'`); break; }
        const ids = new Set<string>();
        for (const item of n.a) {
          const s = parseStep(item, issues);
          if (!s) continue;
          if (s.id !== undefined) { if (ids.has(s.id)) issues.add(item, `The identifier '${s.id}' may not be used more than once within the same scope.`); ids.add(s.id); }
          job.steps.push(s);
        }
        break;
      }
      case 'uses': job.uses = scalar(n, issues); break;
    }
  }
  if (!job.uses && !es.some(e => e.key === 'runs-on')) issues.add(y, 'Required property is missing: runs-on');
  return job;
}

import { parseYaml, YamlError, type Y } from './yaml';
import { readTree, sortPaths, utf8, type Objects, type Sha } from './git';
import { sha256 } from './ssh';
import { parseOn, type Triggers } from './workflow-on';
import { parsePermissions, type PermissionsSpec } from './workflow-perms';
import { parseConcurrency, parseDefaults, parseJob, type WorkflowJob } from './workflow-job';
import { checkExpr, entries, Issues, scalar, stringMap, type WfError } from './workflow-read';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md): a GitHub Actions workflow file (.github/workflows/*.yml or
 * *.yaml, just a file in the repository that git commits) parsed and validated as a pure model — no job runs here (E28
 * runs them). Errors are rendered as GitHub shows them: "Invalid workflow file: .github/workflows/ci.yml#L12" and then
 * "You have an error in your yaml syntax on line 12" or "The workflow is not valid. … (Line: 12, Col: 5): Unexpected value 'stepz'".
 */

export interface Workflow {
  path: string; name?: string; runName?: string; on: Triggers; permissions?: PermissionsSpec; env: [string, string][];
  defaults: { shell?: string; workingDirectory?: string };
  /** Parsed here, enforced in E30. */
  concurrency?: { group: string; cancelInProgress: string };
  jobs: WorkflowJob[];
}
export type WorkflowParse = { ok: true; workflow: Workflow } | { ok: false; errors: WfError[]; /** A YAML syntax error (not a schema error). */ yaml: boolean };

export const isWorkflowPath = (p: string) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p);
const TOP = ['name', 'run-name', 'on', 'permissions', 'env', 'defaults', 'concurrency', 'jobs'];

function needsProblems(jobs: WorkflowJob[], issues: Issues) {
  const ids = new Set(jobs.map(j => j.id));
  for (const j of jobs) for (const n of j.needs) if (!ids.has(n)) issues.add(undefined, `Job '${j.id}' depends on unknown job '${n}'.`);
  const state = new Map<string, 'visiting' | 'done'>(), byId = new Map(jobs.map(j => [j.id, j]));
  const visit = (j: WorkflowJob): boolean => {
    state.set(j.id, 'visiting');
    for (const n of j.needs) {
      const next = byId.get(n);
      if (!next) continue;
      if (state.get(n) === 'visiting') { issues.add(undefined, `Job '${j.id}' depends on job '${n}' which creates a cycle in the dependency graph.`); return false; }
      if (!state.has(n) && !visit(next)) return false;
    }
    state.set(j.id, 'done');
    return true;
  };
  for (const j of jobs) if (!state.has(j.id) && !visit(j)) break;
}

/** Parses a workflow file's text; the errors (sorted by position) when it is not valid. */
export function parseWorkflow(path: string, text: string): WorkflowParse {
  let root: Y;
  try { root = parseYaml(text); } catch (e) {
    if (!(e instanceof YamlError)) throw e;
    if (e.code === 'syntax') return { ok: false, yaml: true, errors: [{ line: e.line, col: e.column, message: `You have an error in your yaml syntax on line ${e.line}` }] };
    return { ok: false, yaml: false, errors: [{ line: e.line, col: e.column, message: e.code === 'duplicate-key' ? `'${e.detail}' is already defined` : e.detail }] };
  }
  const issues = new Issues(), top = entries(root, issues, TOP) ?? [];
  const wf: Partial<Workflow> & { env: [string, string][]; defaults: Workflow['defaults']; jobs: WorkflowJob[] } = { path, env: [], defaults: {}, jobs: [] };
  for (const e of top) {
    const n = e.node;
    switch (e.key) {
      case 'name': wf.name = scalar(n, issues); break;
      case 'run-name': wf.runName = scalar(n, issues); checkExpr(wf.runName, n, 'run-name', issues); break;
      case 'on': wf.on = parseOn(n, issues); break;
      case 'permissions': wf.permissions = parsePermissions(n, issues); break;
      case 'env': wf.env = stringMap(n, issues); wf.env.forEach(([, v]) => checkExpr(v, n, 'env', issues)); break;
      case 'defaults': wf.defaults = parseDefaults(n, issues, 'env'); break;
      case 'concurrency': wf.concurrency = parseConcurrency(n, issues, 'concurrency'); break;
      case 'jobs': {
        const js = entries(n, issues);
        for (const j of js ?? []) { const job = parseJob(j.key, j.at, j.node, issues); if (job) wf.jobs.push(job); }
        if (js && !js.length) issues.add(n, 'Required property is missing: jobs');
        break;
      }
    }
  }
  const at = root.t === 'map' ? { line: root.line, col: root.col } : { line: 1, col: 1 };
  if (root.t === 'map' || root.t === 'null') {
    if (!top.some(e => e.key === 'on')) issues.add(at, 'Required property is missing: on');
    if (!top.some(e => e.key === 'jobs')) issues.add(at, 'Required property is missing: jobs');
  }
  // GitHub checks the jobs' dependencies and steps after the file itself is valid.
  if (!issues.list.length) needsProblems(wf.jobs, issues);
  const empty = wf.jobs.filter(j => !j.uses && !j.steps.length).map(j => j.id);
  if (!issues.list.length && empty.length) issues.add(undefined, `No steps defined in \`steps\` and no workflow called in \`uses\` for the following jobs: ${empty.join(', ')}`);
  if (issues.list.length) return { ok: false, yaml: false, errors: sortErrors(issues.list) };
  return { ok: true, workflow: { ...wf, on: wf.on! } as Workflow };
}
function sortErrors(list: readonly WfError[]): WfError[] {
  const key = (e: WfError) => e.line === undefined ? Infinity : e.line * 10000 + (e.col ?? 0);
  const seen = new Set<string>();
  return [...list].sort((a, b) => key(a) - key(b)).filter(e => { const k = `${e.line}:${e.col}:${e.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The lines GitHub shows for an invalid workflow file. */
export function workflowErrorLines(path: string, errors: readonly WfError[], yaml: boolean): string[] {
  const first = errors.find(e => e.line !== undefined);
  const head = `Invalid workflow file: ${path}${first ? `#L${first.line}` : ''}`;
  if (yaml) return [head, errors[0].message];
  const where = (e: WfError) => (e.line === undefined ? `${path}: ${e.message}` : `${path} (Line: ${e.line}, Col: ${e.col}): ${e.message}`);
  return [head, `The workflow is not valid. ${where(errors[0])}`, ...errors.slice(1).map(where)];
}
/** The message a parse gives (the error lines joined), '' when it is valid. */
export const workflowMessage = (p: WorkflowParse, path: string) => (p.ok ? '' : workflowErrorLines(path, p.errors, p.yaml).join('\n'));

/** The workflow files of a commit (path order) with their text. */
export function workflowFiles(objects: Pick<Objects, 'get'>, commit: Sha | undefined): { path: string; text: string }[] {
  const c = commit ? objects.get(commit) : undefined;
  if (c?.type !== 'commit') return [];
  const files = readTree(objects, c.tree);
  return sortPaths([...files.keys()].filter(isWorkflowPath)).map(path => {
    const b = objects.get(files.get(path)!.id);
    return { path, text: b?.type === 'blob' ? b.data : '' };
  });
}
/** The name GitHub shows: the workflow's name, else (and for an invalid file) its path. */
export const workflowName = (path: string, p: WorkflowParse) => (p.ok && p.workflow.name ? p.workflow.name : path);
/** A workflow's ID on the simulated github.example: derived from the repository and the path, so it does not change. */
export function workflowId(repoUrl: string, path: string): number {
  const d = sha256(utf8(`${repoUrl}\n${path}`));
  return 100000000 + (((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0) % 900000000;
}

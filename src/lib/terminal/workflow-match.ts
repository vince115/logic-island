import { mergeBases, readTree, type Objects, type Sha } from './git';
import { nextCron, parseCron, UTC_ZONE } from './calendar';
import { parseNumber, type Val } from './expr-value';
import { filterMatches } from './workflow-filter';
import type { DispatchInput, RefFilters, Triggers } from './workflow-on';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §4): which events start a workflow — pure functions of the
 * workflow's triggers and the event. push: branch or tag filters on the pushed ref (a workflow with only branch filters
 * ignores tags and the other way round), path filters on the changed files (not for tags). pull_request: the activity
 * type, branch filters on the base branch, path filters on the three-dot diff; none while the pull request conflicts.
 * workflow_dispatch: any ref that has the workflow. schedule: the default branch only, at the cron times in UTC.
 */

export type WorkflowEvent =
  | { name: 'push'; ref: string; /** The changed files (two-dot diff); undefined: path filters are not applied. */ changed?: readonly string[] }
  | { name: 'pull_request' | 'pull_request_target'; base: string; action?: string; changed?: readonly string[]; conflict?: boolean }
  | { name: 'workflow_dispatch'; ref: string }
  | { name: 'schedule'; ref: string; defaultBranch: string; cron?: string }
  | { name: 'other'; event: string };

const branchOf = (ref: string) => ref.replace(/^refs\/heads\//, '');
function pathsPass(f: RefFilters, changed: readonly string[] | undefined): boolean {
  if (!f.paths && !f.pathsIgnore) return true;
  if (changed === undefined) return true;
  if (!changed.length) return false;
  if (f.paths) return changed.some(p => filterMatches(f.paths!, p));
  return changed.some(p => !filterMatches(f.pathsIgnore!, p));
}
function namePasses(include: string[] | undefined, ignore: string[] | undefined, name: string): boolean {
  if (include) return filterMatches(include, name);
  if (ignore) return !filterMatches(ignore, name);
  return true;
}

/** Whether the event starts a workflow with these triggers. */
export function triggers(t: Triggers, e: WorkflowEvent): boolean {
  if (e.name === 'other') return t.events.includes(e.event);
  if (!t.events.includes(e.name)) return false;
  switch (e.name) {
    case 'push': {
      const f = t.push ?? {}, tag = e.ref.startsWith('refs/tags/'), name = e.ref.replace(/^refs\/(heads|tags)\//, '');
      const branchFilters = !!(f.branches || f.branchesIgnore), tagFilters = !!(f.tags || f.tagsIgnore);
      if (tag) return !(branchFilters && !tagFilters) && namePasses(f.tags, f.tagsIgnore, name);
      return !(tagFilters && !branchFilters) && namePasses(f.branches, f.branchesIgnore, name) && pathsPass(f, e.changed);
    }
    case 'pull_request': case 'pull_request_target': {
      const f = (e.name === 'pull_request' ? t.pullRequest : t.pullRequestTarget)!;
      if (e.conflict && e.name === 'pull_request') return false;
      return f.types.includes(e.action ?? 'opened') && namePasses(f.branches, f.branchesIgnore, branchOf(e.base)) && pathsPass(f, e.changed);
    }
    case 'workflow_dispatch': return true;
    case 'schedule': return branchOf(e.ref) === branchOf(e.defaultBranch) && (e.cron === undefined || t.schedule.includes(e.cron));
  }
}

/** The files that differ between two commits (from undefined: every file of to), sorted. */
export function changedPaths(objects: Pick<Objects, 'get'>, from: Sha | undefined, to: Sha): string[] {
  const tree = (c: Sha | undefined) => {
    const o = c ? objects.get(c) : undefined;
    return o?.type === 'commit' ? readTree(objects, o.tree) : new Map();
  };
  const a = tree(from), b = tree(to), out = new Set<string>();
  for (const [p, x] of b) if (a.get(p)?.id !== x.id || a.get(p)?.mode !== x.mode) out.add(p);
  for (const p of a.keys()) if (!b.has(p)) out.add(p);
  return [...out].sort();
}
/** A pull request's changed files: the three-dot diff from the merge base of base and head to head. */
export const pullChangedPaths = (objects: Pick<Objects, 'get'>, base: Sha, head: Sha) => changedPaths(objects, mergeBases(objects, base, head)[0], head);

/** The next times (Unix seconds, UTC) the schedule starts the workflow after a time, with the cron line of each. */
export function nextScheduled(t: Triggers, after: number, count: number): { at: number; cron: string }[] {
  const all = t.schedule.flatMap(cron => {
    const spec = parseCron(cron.trim().split(/\s+/));
    return 'error' in spec ? [] : nextCron(spec, UTC_ZONE, after, count).map(at => ({ at, cron }));
  });
  return all.sort((a, b) => a.at - b.at).slice(0, count);
}

/** workflow_dispatch's inputs from given texts: typed values (booleans and numbers), defaults, and GitHub's 422 messages. */
export function dispatchInputs(inputs: readonly DispatchInput[], given: Readonly<Record<string, string>>): { values: Record<string, Val> } | { error: string } {
  const unexpected = Object.keys(given).filter(k => !inputs.some(i => i.name === k));
  if (unexpected.length) return { error: `Unexpected inputs provided: ${JSON.stringify(unexpected)}` };
  const values: Record<string, Val> = {};
  for (const i of inputs) {
    const v = given[i.name] ?? i.default;
    if (v === undefined) {
      if (i.required) return { error: `Required input '${i.name}' not provided` };
      values[i.name] = i.type === 'boolean' ? false : '';
      continue;
    }
    if (i.type === 'choice' && !i.options.includes(v)) return { error: `Provided value '${v}' for input '${i.name}' not in the list of allowed values` };
    if (i.type === 'boolean') {
      if (v !== 'true' && v !== 'false') return { error: `Provided value '${v}' for input '${i.name}' is not a valid boolean` };
      values[i.name] = v === 'true';
    } else if (i.type === 'number') {
      const n = parseNumber(v);
      if (Number.isNaN(n) || v.trim() === '') return { error: `Provided value '${v}' for input '${i.name}' is not a valid number` };
      values[i.name] = n;
    } else values[i.name] = v;
  }
  return { values };
}

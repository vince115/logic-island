import type { Y } from './yaml';
import { parseCron } from './calendar';
import { entries, scalar, stringList, type Issues } from './workflow-read';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §4): a workflow's `on` — a string, a list of event names or a
 * mapping. push (branches, branches-ignore, tags, tags-ignore, paths, paths-ignore), pull_request and pull_request_target
 * (branches, branches-ignore, paths, paths-ignore, types), workflow_dispatch (typed inputs) and schedule (cron, UTC) are
 * modelled; every other GitHub event may be declared (its settings are not checked).
 */

export const EVENTS = ['branch_protection_rule', 'check_run', 'check_suite', 'create', 'delete', 'deployment', 'deployment_status', 'discussion', 'discussion_comment',
  'fork', 'gollum', 'issue_comment', 'issues', 'label', 'merge_group', 'milestone', 'page_build', 'public', 'pull_request', 'pull_request_review',
  'pull_request_review_comment', 'pull_request_target', 'push', 'registry_package', 'release', 'repository_dispatch', 'schedule', 'status', 'watch',
  'workflow_call', 'workflow_dispatch', 'workflow_run'] as const;
export const PR_TYPES = ['assigned', 'unassigned', 'labeled', 'unlabeled', 'opened', 'edited', 'closed', 'reopened', 'synchronize', 'converted_to_draft',
  'ready_for_review', 'locked', 'unlocked', 'review_requested', 'review_request_removed', 'auto_merge_enabled', 'auto_merge_disabled', 'milestoned',
  'demilestoned', 'enqueued', 'dequeued'];
export const DEFAULT_PR_TYPES = ['opened', 'synchronize', 'reopened'];
export const INPUT_TYPES = ['string', 'boolean', 'choice', 'number', 'environment'] as const;

export interface RefFilters { branches?: string[]; branchesIgnore?: string[]; tags?: string[]; tagsIgnore?: string[]; paths?: string[]; pathsIgnore?: string[] }
export interface DispatchInput { name: string; type: typeof INPUT_TYPES[number]; required: boolean; default?: string; options: string[]; description: string }
export interface Triggers {
  /** The declared events, in order. */
  events: string[];
  push?: RefFilters;
  pullRequest?: RefFilters & { types: string[] };
  pullRequestTarget?: RefFilters & { types: string[] };
  dispatch?: { inputs: DispatchInput[] };
  /** The cron lines of schedule (UTC). */
  schedule: string[];
}

const FILTER_KEYS: Record<string, keyof RefFilters> = { branches: 'branches', 'branches-ignore': 'branchesIgnore', tags: 'tags', 'tags-ignore': 'tagsIgnore', paths: 'paths', 'paths-ignore': 'pathsIgnore' };
function filters(y: Y, issues: Issues, allowed: string[]): (RefFilters & { types?: string[] }) | undefined {
  const es = entries(y, issues, allowed);
  if (!es) return undefined;
  const out: RefFilters & { types?: string[] } = {};
  for (const e of es) {
    const list = stringList(e.node, issues);
    if (!list) continue;
    if (e.key === 'types') {
      const bad = e.node.t === 'seq' ? e.node.a.find(x => x.t === 'str' && !PR_TYPES.includes(x.v)) : list.find(t => !PR_TYPES.includes(t)) ? e.node : undefined;
      if (bad) { issues.add(bad, `Unexpected value '${bad.t === 'str' ? bad.v : ''}'`); continue; }
      out.types = list;
    } else out[FILTER_KEYS[e.key]] = list;
  }
  for (const [a, b] of [['branches', 'branchesIgnore'], ['tags', 'tagsIgnore'], ['paths', 'pathsIgnore']] as const) {
    if (out[a] && out[b]) issues.add(y, `you may only define one of \`${a}\` and \`${a}-ignore\` for a single event`);
  }
  return out;
}

function dispatch(y: Y, issues: Issues): { inputs: DispatchInput[] } {
  const inputs: DispatchInput[] = [];
  for (const e of entries(y, issues, ['inputs']) ?? []) {
    for (const i of entries(e.node, issues) ?? []) {
      const d: DispatchInput = { name: i.key, type: 'string', required: false, options: [], description: '' };
      let optionsAt: Y | undefined;
      for (const f of entries(i.node, issues, ['description', 'required', 'default', 'type', 'options', 'deprecationMessage']) ?? []) {
        if (f.key === 'options') { optionsAt = f.node; d.options = stringList(f.node, issues) ?? []; continue; }
        const v = scalar(f.node, issues);
        if (v === undefined) continue;
        if (f.key === 'type') { if ((INPUT_TYPES as readonly string[]).includes(v)) d.type = v as DispatchInput['type']; else issues.add(f.node, `Unexpected value '${v}'`); }
        else if (f.key === 'required') { if (v === 'true' || v === 'false') d.required = v === 'true'; else issues.add(f.node, `Unexpected value '${v}'`); }
        else if (f.key === 'default') d.default = v;
        else if (f.key === 'description') d.description = v;
      }
      if (d.type === 'choice' && !d.options.length) issues.add(optionsAt ?? i.node, 'Required property is missing: options');
      if (d.type === 'boolean' && d.default !== undefined && d.default !== 'true' && d.default !== 'false') issues.add(i.node, `Unexpected value '${d.default}'`);
      inputs.push(d);
    }
  }
  return { inputs };
}

/** GitHub's cron: five fields (names allowed), no @daily and the like. */
export function validCron(text: string): boolean {
  const fields = text.trim().split(/\s+/);
  return fields.length === 5 && !('error' in parseCron(fields));
}

/** Parses `on`; reports unknown events and settings with GitHub's texts. */
export function parseOn(y: Y, issues: Issues): Triggers {
  const t: Triggers = { events: [], schedule: [] }, before = issues.list.length;
  const known = (name: string, at: Y | { line: number; col: number }) => {
    if ((EVENTS as readonly string[]).includes(name)) { t.events.push(name); return true; }
    issues.add(at, `Unexpected value '${name}'`);
    return false;
  };
  if (y.t === 'str') known(y.v, y);
  else if (y.t === 'seq') for (const x of y.a) { const s = scalar(x, issues); if (s !== undefined) known(s, x); }
  else if (y.t === 'map') {
    y.m.forEach(([name, node], i) => {
      if (!known(name, y.keys[i])) return;
      if (name === 'push') t.push = filters(node, issues, ['branches', 'branches-ignore', 'tags', 'tags-ignore', 'paths', 'paths-ignore']);
      else if (name === 'pull_request' || name === 'pull_request_target') {
        const f = filters(node, issues, ['branches', 'branches-ignore', 'paths', 'paths-ignore', 'types']);
        if (f) t[name === 'pull_request' ? 'pullRequest' : 'pullRequestTarget'] = { ...f, types: f.types ?? DEFAULT_PR_TYPES };
      } else if (name === 'workflow_dispatch') t.dispatch = dispatch(node, issues);
      else if (name === 'schedule') {
        if (node.t !== 'seq') { issues.add(node, node.t === 'map' ? 'A mapping was not expected' : `Unexpected value '${node.t === 'str' ? node.v : ''}'`); return; }
        for (const item of node.a) for (const e of entries(item, issues, ['cron']) ?? []) {
          const c = scalar(e.node, issues);
          if (c === undefined) continue;
          if (validCron(c)) t.schedule.push(c); else issues.add(e.node, `Invalid cron expression '${c}'`);
        }
      }
    });
  }
  if (!t.events.length && issues.list.length === before) issues.add(y, 'No event triggers defined in `on`');
  if (t.events.includes('workflow_dispatch') && !t.dispatch) t.dispatch = { inputs: [] };
  if (t.events.includes('pull_request') && !t.pullRequest) t.pullRequest = { types: DEFAULT_PR_TYPES };
  if (t.events.includes('pull_request_target') && !t.pullRequestTarget) t.pullRequestTarget = { types: DEFAULT_PR_TYPES };
  return t;
}

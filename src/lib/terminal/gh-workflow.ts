import { baseRepo, flag, on, parseFlags, type Gh } from './gh';
import { table } from './gh-pr';
import { defaultBranch } from './forge';
import type { Forge } from './git-core';
import type { Objects } from './git';
import { parseWorkflow, workflowErrorLines, workflowFiles, workflowId, workflowName } from './workflow';
import { dispatchInputs } from './workflow-match';
import { dispatchRun } from './actions-events';
import { listRow } from './gh-run-view';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §8): gh workflow list and gh workflow view (workflows
 * profile). The workflows are the files .github/workflows/*.yml|yaml on the repository's default branch (view --ref
 * reads another branch); their IDs come from the repository and the path. Runs start in E28, so every workflow has
 * no runs yet. An invalid file is listed by its path; view prints GitHub's error lines for it (the simulation's choice).
 */

const base = (path: string) => path.slice(path.lastIndexOf('/') + 1);
interface Listed { path: string; name: string; id: number; text: string; errors?: string[] }

function listed(forge: Forge, objects: Pick<Objects, 'get'>, ref: string): Listed[] | undefined {
  const tip = forge.refs.get(`refs/heads/${ref}`) ?? forge.refs.get(`refs/tags/${ref}`);
  if (!tip) return undefined;
  return workflowFiles(objects, tip).map(f => {
    const p = parseWorkflow(f.path, f.text);
    return { path: f.path, name: workflowName(f.path, p), id: workflowId(forge.url, f.path), text: f.text, ...p.ok ? {} : { errors: workflowErrorLines(f.path, p.errors, p.yaml) } };
  });
}

function listCommand(h: Gh, args: string[]): number {
  const { g } = h, f = parseFlags(g, 'workflow list', args, ['a|all', 'L|limit=', 'R|repo=']);
  if (!f) return 1;
  if (f.rest.length) { g.err(`unknown argument "${f.rest[0]}"; please quote all values that have spaces`); return 1; }
  const limit = flag(f, 'limit') === undefined ? 50 : Number(flag(f, 'limit'));
  if (!Number.isInteger(limit) || limit < 1) { g.err(`invalid limit: ${flag(f, 'limit')}`); return 1; }
  const repo = baseRepo(g, flag(f, 'repo'));
  if (!repo) return 1;
  const all = listed(repo.forge, g.store, defaultBranch(repo.forge)) ?? [];
  // E28: workflows disabled with gh workflow disable are listed with -a only.
  const disabled = repo.forge.site?.disabled ?? [], shown = all.filter(w => on(f, 'all') || !disabled.includes(w.path));
  if (!shown.length) { g.err('no workflows found'); return 0; }
  g.out(...table([['NAME', 'STATE', 'ID'], ...shown.slice(0, limit).map(w => [w.name, disabled.includes(w.path) ? 'disabled_manually' : 'active', String(w.id)])]));
  return 0;
}

/** The workflow an argument names (ID, file name or path, name, name in any case) among the listed ones, with gh's errors. */
function pick(h: Gh, all: Listed[], want: string): Listed | undefined {
  let hits = /^\d+$/.test(want) ? all.filter(w => String(w.id) === want) : all.filter(w => base(w.path) === want || w.path === want);
  if (!hits.length) hits = all.filter(w => w.name === want);
  if (!hits.length) hits = all.filter(w => w.name.toLowerCase() === want.toLowerCase());
  if (!hits.length) { h.g.err(`could not find any workflows named ${want}`); return undefined; }
  if (hits.length > 1) { h.g.err(`could not resolve to a unique workflow; found: ${hits.map(w => base(w.path)).join(' ')}`); return undefined; }
  return hits[0];
}

function viewCommand(h: Gh, args: string[]): number {
  const { g } = h, f = parseFlags(g, 'workflow view [<workflow-id> | <workflow-name> | <filename>]', args, ['y|yaml', 'r|ref=', 'w|web', 'R|repo=']);
  if (!f) return 1;
  if (on(f, 'web')) { g.err('gh workflow view --web：模擬環境沒有瀏覽器'); return 1; }
  if (!f.rest.length) { g.err('workflow argument required when not running interactively'); return 1; }
  if (f.rest.length > 1) { g.err(`accepts at most 1 arg(s), received ${f.rest.length}`); return 1; }
  const repo = baseRepo(g, flag(f, 'repo'));
  if (!repo) return 1;
  const ref = flag(f, 'ref') ?? defaultBranch(repo.forge), all = listed(repo.forge, g.store, ref);
  if (!all) { g.err(`HTTP 404: Not Found (https://github.example/api/v3/repos/${repo.forge.url.replace(/^https:\/\/github\.example\//, '').replace(/\.git$/, '')}/contents?ref=${ref})`); return 1; }
  const w = pick(h, all, f.rest[0]);
  if (!w) return 1;
  const file = base(w.path);
  g.out(`${w.name} - ${file}`, `ID: ${w.id}`, '');
  if (on(f, 'yaml')) { g.out(...w.text.replace(/\n$/, '').split('\n')); return 0; }
  if (w.errors) g.out(...w.errors, '');
  // E28: the actions profile has runs (the five most recent).
  const runs = h.ci ? [...repo.forge.site?.runs ?? []].filter(r => r.path === w.path && r.createdAt <= g.now).sort((a, b) => b.createdAt - a.createdAt || b.id - a.id) : [];
  if (runs.length) {
    g.out(`Total runs ${runs.length}`, 'Recent runs', ...table([['STATUS', 'TITLE', 'WORKFLOW', 'BRANCH', 'EVENT', 'ID'], ...runs.slice(0, 5).map(r => listRow(r, g.now).slice(0, 6))]), '',
      `To see more runs for this workflow, try: gh run list --workflow ${file}`, `To see the YAML for this workflow, try: gh workflow view ${file} --yaml`);
    return 0;
  }
  g.out('Total runs 0', '', `To see more runs for this workflow, try: gh run list --workflow ${file}`, `To see the YAML for this workflow, try: gh workflow view ${file} --yaml`);
  return 0;
}

const NEED = 'workflow ID, name, or filename required when not running interactively';
/** E28: gh workflow run — a workflow_dispatch event on a ref (default the default branch) with -f/-F inputs. */
function dispatchCommand(h: Gh, args: string[]): number {
  const { g, account } = h, f = parseFlags(g, 'workflow run [<workflow-id> | <workflow-name>]', args, ['r|ref=', 'f|raw-field=', 'F|field=', 'json', 'R|repo=']);
  if (!f) return 1;
  if (on(f, 'json')) { g.err('gh workflow run --json：模擬環境不支援，請用 -f 鍵=值'); return 1; }
  if (!f.rest.length) { g.err(NEED); return 1; }
  const repo = baseRepo(g, flag(f, 'repo'));
  if (!repo) return 1;
  const ref = flag(f, 'ref') ?? defaultBranch(repo.forge), full = repo.forge.refs.has(`refs/heads/${ref}`) ? `refs/heads/${ref}` : `refs/tags/${ref}`, sha = repo.forge.refs.get(full);
  const url = (id: number) => `https://github.example/api/v3/repos/${repo.forge.url.replace(/^https:\/\/github\.example\//, '').replace(/\.git$/, '')}/actions/workflows/${id}/dispatches`;
  const w = pick(h, listed(repo.forge, g.store, sha ? ref : defaultBranch(repo.forge)) ?? [], f.rest[0]);
  if (!w) return 1;
  const fail = (why: string) => { g.err(`could not create workflow dispatch event: HTTP 422: ${why} (${url(w.id)})`); return 1; };
  if (!sha) return fail(`No ref found for: ${ref}`);
  if (repo.forge.site?.disabled?.includes(w.path)) return fail("Cannot trigger a 'workflow_dispatch' on a disabled workflow");
  const p = parseWorkflow(w.path, w.text);
  if (!p.ok || !p.workflow.on.dispatch) return fail("Workflow does not have 'workflow_dispatch' trigger");
  const given: Record<string, string> = {};
  for (const kv of [...f.values.get('raw-field') ?? [], ...f.values.get('field') ?? []]) {
    const eq = kv.indexOf('=');
    if (eq < 1) { g.err(`field "${kv}" requires a value separated by an '=' sign`); return 1; }
    given[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  const inputs = dispatchInputs(p.workflow.on.dispatch.inputs, given);
  if ('error' in inputs) return fail(inputs.error);
  dispatchRun({ g, ci: h.ci! }, repo.forge, w.path, w.text, full, sha, inputs.values, g.now, account.login);
  g.out(`✓ Created workflow_dispatch event for ${base(w.path)} at ${ref}`, '', `To see runs for this workflow, try: gh run list --workflow="${base(w.path)}"`);
  return 0;
}

/** E28: gh workflow enable | disable (a disabled workflow starts no runs). */
function enableCommand(h: Gh, args: string[], enable: boolean): number {
  const { g } = h, f = parseFlags(g, `workflow ${enable ? 'enable' : 'disable'} [<workflow-id> | <workflow-name>]`, args, ['R|repo=']);
  if (!f) return 1;
  if (!f.rest.length) { g.err(NEED); return 1; }
  const repo = baseRepo(g, flag(f, 'repo'));
  if (!repo) return 1;
  const disabled = repo.forge.site?.disabled ?? [], all = (listed(repo.forge, g.store, defaultBranch(repo.forge)) ?? []).filter(w => disabled.includes(w.path) === enable);
  const w = pick(h, all, f.rest[0]);
  if (!w) return 1;
  repo.forge.site = { ...repo.forge.site!, disabled: enable ? disabled.filter(p => p !== w.path) : [...disabled, w.path] };
  g.out(`✓ ${enable ? 'Enabled' : 'Disabled'} ${w.name}`);
  return 0;
}

/** gh workflow list | view (the workflows profile); E28 (the actions profile) adds run, enable and disable. */
export function workflowCommand(h: Gh, args: string[]): number {
  const { g } = h, sub = args[0], rest = args.slice(1);
  if (sub === 'list' || sub === 'ls') return listCommand(h, rest);
  if (sub === 'view') return viewCommand(h, rest);
  if (h.ci && sub === 'run') return dispatchCommand(h, rest);
  if (h.ci && (sub === 'enable' || sub === 'disable')) return enableCommand(h, rest, sub === 'enable');
  if (sub === 'run' || sub === 'enable' || sub === 'disable') { g.err(`gh workflow ${sub}：模擬環境還不支援（Actions 的執行在 E28），這裡只有 gh workflow list 與 view`); return 1; }
  g.err(sub === undefined ? 'gh workflow：要加子指令，例如 gh workflow list' : `unknown command "${sub}" for "gh workflow"`);
  return 1;
}

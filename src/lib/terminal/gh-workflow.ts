import { baseRepo, flag, on, parseFlags, type Gh } from './gh';
import { table } from './gh-pr';
import { defaultBranch } from './forge';
import type { Forge } from './git-core';
import type { Objects } from './git';
import { parseWorkflow, workflowErrorLines, workflowFiles, workflowId, workflowName } from './workflow';

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
  if (!all.length) { g.err('no workflows found'); return 0; }
  g.out(...table([['NAME', 'STATE', 'ID'], ...all.slice(0, limit).map(w => [w.name, 'active', String(w.id)])]));
  return 0;
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
  const want = f.rest[0];
  let hits = /^\d+$/.test(want) ? all.filter(w => String(w.id) === want) : all.filter(w => base(w.path) === want || w.path === want);
  if (!hits.length) hits = all.filter(w => w.name === want);
  if (!hits.length) hits = all.filter(w => w.name.toLowerCase() === want.toLowerCase());
  if (!hits.length) { g.err(`could not find any workflows named ${want}`); return 1; }
  if (hits.length > 1) { g.err(`could not resolve to a unique workflow; found: ${hits.map(w => base(w.path)).join(' ')}`); return 1; }
  const w = hits[0], file = base(w.path);
  g.out(`${w.name} - ${file}`, `ID: ${w.id}`, '');
  if (on(f, 'yaml')) { g.out(...w.text.replace(/\n$/, '').split('\n')); return 0; }
  if (w.errors) g.out(...w.errors, '');
  g.out('Total runs 0', '', `To see more runs for this workflow, try: gh run list --workflow ${file}`, `To see the YAML for this workflow, try: gh workflow view ${file} --yaml`);
  return 0;
}

/** gh workflow list | view (the workflows profile); run, enable and disable come with E28. */
export function workflowCommand(h: Gh, args: string[]): number {
  const { g } = h, sub = args[0], rest = args.slice(1);
  if (sub === 'list' || sub === 'ls') return listCommand(h, rest);
  if (sub === 'view') return viewCommand(h, rest);
  if (sub === 'run' || sub === 'enable' || sub === 'disable') { g.err(`gh workflow ${sub}：模擬環境還不支援（Actions 的執行在 E28），這裡只有 gh workflow list 與 view`); return 1; }
  g.err(sub === undefined ? 'gh workflow：要加子指令，例如 gh workflow list' : `unknown command "${sub}" for "gh workflow"`);
  return 1;
}

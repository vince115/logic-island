import type { Git } from './git-core';
import type { RunnerToken } from './git-state';
import { API_BASE } from './forge-state';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md §8): gh on a runner of an artifacts machine. It needs GH_TOKEN
 * (or GITHUB_TOKEN) in the environment, set to the job's GITHUB_TOKEN (${{ github.token }}); each command needs a scope of
 * the token's permissions (pull-requests for gh pr, actions for gh run, gh workflow and gh cache, contents for gh repo
 * and gh api). Without it GitHub answers 403 Resource not accessible by integration. The runner sees a copy of the
 * repository taken when the run started, so commands that would write are refused even when the token may.
 */

type Need = { scope: string; write: boolean; path: string };
const WRITE: Record<string, readonly string[]> = {
  pr: ['create', 'merge', 'review', 'close', 'comment', 'edit', 'reopen', 'ready'], run: ['rerun', 'cancel', 'delete'], workflow: ['run', 'enable', 'disable'], cache: ['delete'],
};
/** The scope (and access) a gh command needs on a runner, or undefined when it needs none (gh auth status, --version). */
function need(name: string, args: readonly string[]): Need | undefined {
  const sub = args[0] ?? '', write = (WRITE[name] ?? []).includes(sub);
  if (name === 'pr') return { scope: 'pull-requests', write, path: 'pulls' };
  if (name === 'run' || name === 'workflow' || name === 'cache') return { scope: 'actions', write, path: name === 'cache' ? 'actions/caches' : name === 'run' ? 'actions/runs' : 'actions/workflows' };
  if (name === 'repo') return { scope: 'contents', write: false, path: '' };
  if (name === 'api') {
    const i = args.findIndex(a => a === '-X' || a === '--method'), method = i >= 0 ? (args[i + 1] ?? 'GET').toUpperCase() : args.some(a => /^-(f|F|-field|-raw-field)$/.test(a)) ? 'POST' : 'GET';
    return { scope: 'contents', write: method !== 'GET', path: '' };
  }
  return undefined;
}

/** Why gh may not run this command on the runner (printed), as its exit status; undefined: it may. */
export function runnerGate(g: Git, token: RunnerToken, repo: string | undefined, name: string, args: readonly string[], env: Readonly<Record<string, string>>): number | undefined {
  if (name === 'secret' || name === 'variable') return undefined;
  const given = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!given) { g.err('gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable. Example:', '  env:', '    GH_TOKEN: ${{ github.token }}'); return 4; }
  if (given !== '***') { g.err(`HTTP 401: Bad credentials (${API_BASE}/user)`, '（模擬環境：runner 上的 gh 只認得這個 job 的 GITHUB_TOKEN，即 ${{ github.token }}）'); return 1; }
  const n = need(name, args);
  if (!n) return undefined;
  const have = token.permissions[n.scope] ?? 'none';
  if (have === 'none' || (n.write && have !== 'write')) {
    g.err(`HTTP 403: Resource not accessible by integration (${API_BASE}/repos/${repo ?? ''}${n.path ? `/${n.path}` : ''})`);
    return 1;
  }
  if (n.write) { g.err(`gh ${name} ${args[0] ?? ''}：模擬環境的 runner 上只支援讀取的 gh 指令（runner 看到的是 run 開始時的儲存庫副本，寫入不會回到 github.example）`); return 1; }
  return undefined;
}

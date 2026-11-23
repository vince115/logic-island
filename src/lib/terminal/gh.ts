import type { FsState } from './fs';
import { readTree } from './git';
import { Git, type Forge, type GitIo, type Repo } from './git-core';
import { FORGE_HOST } from './git-state';
import { repoPath, webUrl } from './forge';
import { API_BASE, type ForgeAccount } from './forge-state';
import { prCommand } from './gh-pr';
import { apiCommand } from './gh-api';
import { workflowCommand } from './gh-workflow';
import { runCommand } from './gh-run';
import type { CiState } from './actions-model';

/*
 * Engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md): the GitHub CLI (gh about 2.65) against the simulated
 * github.example, already logged in (the simulation's gh defaults to that host, as with GH_HOST). Output is gh's terminal
 * format without colour; interactive prompts are not simulated (flags are needed instead). This file holds the flag parser,
 * repository resolution from the git remotes, gh auth and gh repo view; pull requests are in gh-pr.ts, gh api in gh-api.ts.
 */

export const GH_VERSION = ['gh version 2.65.0 (2025-01-06)', 'https://github.com/cli/cli/releases/tag/v2.65.0'];
export const GH_SUPPORTED = 'auth status、repo view、pr create|list|view|diff|checkout|review|merge|checks|close、api';
/** E27: the workflows profile adds gh workflow list and view. */
export const GH_SUPPORTED_WORKFLOWS = `${GH_SUPPORTED}、workflow list|view`;
/** E28: the actions profile adds gh workflow run|enable|disable and gh run. */
export const GH_SUPPORTED_ACTIONS = `${GH_SUPPORTED}、workflow list|view|run|enable|disable、run list|view|watch|rerun|cancel`;
const UNSUPPORTED = ['issue', 'release', 'run', 'workflow', 'secret', 'variable', 'gist', 'browse', 'codespace', 'label', 'search', 'cache', 'project', 'ruleset', 'org',
  'ssh-key', 'gpg-key', 'config', 'extension', 'alias', 'status', 'completion', 'attestation', 'copilot'];

export interface Gh {
  g: Git; account: ForgeAccount; /** Runs git steps whose output gh does not show. */ quiet<T>(fn: () => T): T;
  /** E28 (actions profile): the machine's CI state (run and job counters), and how far gh run watch moves the clock. */
  ci?: { state: CiState }; advance?: number;
}
export type Flags = { values: Map<string, string[]>; rest: string[] };
export const flag = (f: Flags, name: string) => f.values.get(name)?.at(-1);
export const on = (f: Flags, name: string) => f.values.has(name);

/** pflag's parsing: 't|title=' takes a value (--title x, --title=x, -t x, -tx), 'd|delete-branch' is a switch; operands may come anywhere. */
export function parseFlags(g: Git, usage: string, args: readonly string[], spec: readonly string[]): Flags | undefined {
  const longs = new Map<string, { canon: string; value: boolean }>(), shorts = new Map<string, { canon: string; value: boolean }>();
  for (const s of spec) {
    const value = s.endsWith('='), names = (value ? s.slice(0, -1) : s).split('|'), canon = names.at(-1)!;
    for (const n of names) (n.length === 1 ? shorts : longs).set(n, { canon, value });
  }
  const f: Flags = { values: new Map(), rest: [] };
  const set = (canon: string, v: string) => f.values.set(canon, [...f.values.get(canon) ?? [], v]);
  const bad = (line: string) => { g.err(line, '', `Usage:  gh ${usage} [flags]`); return undefined; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { f.rest.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('='), name = eq < 0 ? a.slice(2) : a.slice(2, eq), n = longs.get(name);
      if (!n) return bad(`unknown flag: --${name}`);
      if (!n.value) { set(n.canon, eq < 0 ? 'true' : a.slice(eq + 1)); continue; }
      const v = eq >= 0 ? a.slice(eq + 1) : args[++i];
      if (v === undefined) return bad(`flag needs an argument: --${name}`);
      set(n.canon, v);
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let k = 1; k < a.length; k++) {
        const n = shorts.get(a[k]);
        if (!n) return bad(`unknown shorthand flag: '${a[k]}' in ${a}`);
        if (!n.value) { set(n.canon, 'true'); continue; }
        const v = k + 1 < a.length ? a.slice(k + 1) : args[++i];
        if (v === undefined) return bad(`flag needs an argument: '${a[k]}' in -${a[k]}`);
        set(n.canon, v);
        break;
      }
      continue;
    }
    f.rest.push(a);
  }
  return f;
}

/** gh's relative times (text.FuzzyAgo). */
export function fuzzyAgo(now: number, then: number): string {
  const s = Math.max(0, now - then), about = (n: number, unit: string) => `about ${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (s < 60) return 'less than a minute ago';
  if (s < 3600) return about(Math.floor(s / 60), 'minute');
  if (s < 86400) return about(Math.floor(s / 3600), 'hour');
  if (s < 30 * 86400) return about(Math.floor(s / 86400), 'day');
  if (s < 365 * 86400) return about(Math.floor(s / 86400 / 30), 'month');
  return about(Math.floor(s / 86400 / 365), 'year');
}

/** The forge repository a -R value names ([HOST/]OWNER/REPO or its URL), with gh's errors. */
function namedRepo(g: Git, spec: string): Forge | undefined {
  const m = /^(?:https:\/\/)?(?:([^/]+)\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(spec);
  if (!m) { g.err(`expected the "[HOST/]OWNER/REPO" format, got "${spec}"`); return undefined; }
  if ((m[1] ?? FORGE_HOST) !== FORGE_HOST) { g.err(`${m[1]}：模擬環境的 gh 只登入了 ${FORGE_HOST}`); return undefined; }
  const f = g.forge.find(x => repoPath(x).toLowerCase() === `${m[2]}/${m[3]}`.toLowerCase());
  if (!f) g.err(`GraphQL: Could not resolve to a Repository with the name '${m[2]}/${m[3]}'. (repository)`);
  return f;
}
/** The base repository: -R, else the git remotes of the working directory's repository (upstream, github, origin, then the rest). */
export function baseRepo(g: Git, spec: string | undefined): { forge: Forge; repo?: Repo } | undefined {
  const r = g.find();
  if (spec !== undefined) { const forge = namedRepo(g, spec); return forge ? { forge, repo: r } : undefined; }
  if (!r) { g.err('failed to run git: fatal: not a git repository (or any of the parent directories): .git'); return undefined; }
  const remotes = [...r.config].filter(([k, v]) => /^remote\..+\.url$/.test(k) && /^https:\/\/github\.example\//.test(v)).map(([k, v]) => ({ name: k.slice(7, -4), url: v }));
  const rank = (n: string) => ['upstream', 'github', 'origin'].indexOf(n) + 1 || 9;
  const pick = remotes.sort((a, b) => rank(a.name) - rank(b.name))[0];
  if (!pick) { g.err('none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`'); return undefined; }
  const forge = namedRepo(g, pick.url);
  return forge ? { forge, repo: r } : undefined;
}

function authCommand(h: Gh, args: string[]): number {
  const { g, account } = h, sub = args[0];
  if (sub === 'status') {
    g.out(FORGE_HOST, `  ✓ Logged in to ${FORGE_HOST} account ${account.login} (keyring)`, '  - Active account: true', '  - Git operations protocol: https',
      `  - Token: gho_${'*'.repeat(36)}`, "  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'");
    return 0;
  }
  if (sub === 'login' || sub === 'logout' || sub === 'token' || sub === 'refresh' || sub === 'switch' || sub === 'setup-git') {
    g.err(`gh auth ${sub}：模擬環境的 gh 已經以 ${account.login} 登入 ${FORGE_HOST}（Token 是秘密，不會顯示），只支援 gh auth status`);
    return 1;
  }
  g.err(sub === undefined ? 'gh auth：要加子指令，例如 gh auth status' : `unknown command "${sub}" for "gh auth"`);
  return 1;
}

function repoCommand(h: Gh, args: string[]): number {
  const { g } = h;
  if (args[0] !== 'view') { g.err(args[0] === undefined ? 'gh repo：要加子指令，例如 gh repo view' : `gh repo ${args[0]}：模擬環境只支援 gh repo view`); return 1; }
  const f = parseFlags(g, 'repo view [<repository>]', args.slice(1), ['b|branch=', 'w|web']);
  if (!f) return 1;
  if (on(f, 'web')) { g.err('gh repo view --web：模擬環境沒有瀏覽器'); return 1; }
  const base = baseRepo(g, f.rest[0]);
  if (!base) return 1;
  const forge = base.forge, branch = flag(f, 'branch') ?? forge.head.replace(/^refs\/heads\//, ''), tip = forge.refs.get(`refs/heads/${branch}`);
  if (flag(f, 'branch') !== undefined && !tip) { g.err(`HTTP 404: Not Found (${API_BASE}/repos/${repoPath(forge)}/readme?ref=${branch})`); return 1; }
  const files = tip ? readTree(g.store, g.commit(tip).tree) : new Map();
  const readme = [...files.keys()].find(p => /^readme(\.md|\.txt)?$/i.test(p));
  g.out(repoPath(forge), forge.site?.description || 'No description provided', '');
  if (readme) g.out(...g.store.blobText(files.get(readme)!.id).replace(/\n$/, '').split('\n'));
  else g.out('This repository does not have a README');
  g.out('', `View this repository on GitHub: ${webUrl(forge)}`);
  return 0;
}

function usage(g: Git, supported: string) {
  g.out('Work seamlessly with GitHub from the command line.', '', 'USAGE', '  gh <command> <subcommand> [flags]', '', `模擬環境支援的指令：${supported}`);
}

/** gh 指令 子指令 …: runs one gh command on the machine (needs the forge profile's account; E27: workflows adds gh workflow). */
export function gh(state: FsState, args: readonly string[], io: GitIo & { workflows?: boolean; actions?: boolean }): { state: FsState; status: number; advance?: number } {
  let muted = false;
  const g = new Git(state, { ...io, out: l => { if (!muted) io.out(l); }, err: l => { if (!muted) io.err(l); } }), account = state.git?.account;
  const name = args[0];
  const supported = io.actions ? GH_SUPPORTED_ACTIONS : io.workflows ? GH_SUPPORTED_WORKFLOWS : GH_SUPPORTED;
  if (name === undefined || name === 'help' || name === '-h' || name === '--help') { usage(g, supported); return { state, status: 0 }; }
  if (name === '--version' || name === 'version') { g.out(...GH_VERSION); return { state, status: 0 }; }
  if (!account) { g.err('To get started with GitHub CLI, please run:  gh auth login', 'Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.'); return { state, status: 4 }; }
  const quiet = <T>(fn: () => T): T => { const was = muted; muted = true; try { return fn(); } finally { muted = was; } };
  const h: Gh = { g, account, quiet, ...io.actions && state.ci ? { ci: { state: state.ci } } : {} }, rest = [...args.slice(1)];
  let status: number;
  if (name === 'auth') status = authCommand(h, rest);
  else if (name === 'repo') status = repoCommand(h, rest);
  else if (name === 'pr') status = prCommand(h, rest);
  else if (name === 'api') status = apiCommand(h, rest);
  else if (name === 'workflow' && io.workflows) status = workflowCommand(h, rest);
  else if (name === 'run' && h.ci) status = runCommand(h, rest);
  else if (UNSUPPORTED.includes(name)) { g.err(`gh ${name}：模擬環境不支援這個指令（支援的指令：${supported}）`); status = 1; }
  else { g.err(`unknown command "${name}" for "gh"`, '', 'Usage:  gh <command> <subcommand> [flags]'); status = 1; }
  const result = g.result();
  return { state: h.ci ? { ...result, ci: h.ci.state } : result, status, ...h.advance ? { advance: h.advance } : {} };
}

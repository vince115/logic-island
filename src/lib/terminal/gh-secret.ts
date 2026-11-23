import { baseRepo, flag, fuzzyAgo, on, parseFlags, type Flags, type Gh } from './gh';
import { table } from './gh-pr';
import { repoPath } from './forge';
import type { Forge } from './git-core';
import { API_BASE } from './forge-state';
import { nameProblem } from './artifacts-lesson';
import type { ActionsValue } from './artifacts-model';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md §6): gh secret set|list|delete and gh variable
 * set|list|get|delete on the simulated github.example, for a repository or one of its environments (-e). A secret's value
 * comes from --body or standard input (gh secret set NAME < file) and is never shown again; names are kept upper case.
 * Managing them needs admin rights on the repository (a runner's GITHUB_TOKEN may not at all).
 */

type Kind = 'secret' | 'variable';
const field = (k: Kind) => (k === 'secret' ? 'secrets' : 'variables');
const api = (forge: Forge, env: string | undefined, path: string) => `${API_BASE}/repos/${repoPath(forge)}/${env ? `environments/${env}/` : ''}${path}`;

/** The repository and environment a command names, with gh's errors (admin rights, an unknown environment). */
function target(h: Gh, kind: Kind, f: Flags): { forge: Forge; env?: string } | undefined {
  const { g } = h, repo = baseRepo(g, flag(f, 'repo'));
  if (!repo) return undefined;
  const forge = repo.forge, env = flag(f, 'env'), site = forge.site;
  const what = kind === 'secret' ? 'failed to fetch public key: ' : '';
  if (h.token) { g.err(`${what}HTTP 403: Resource not accessible by integration (${api(forge, env, `actions/${field(kind)}`)})`); return undefined; }
  if (!site || site.permission !== 'admin') { g.err(`${what}HTTP 403: Must have admin rights to Repository. (${api(forge, env, `actions/${field(kind)}`)})`); return undefined; }
  if (env !== undefined && !(site.environments ?? []).includes(env)) { g.err(`${what}HTTP 404: Not Found (${api(forge, env, `${field(kind)}`)})`); return undefined; }
  return { forge, ...env !== undefined ? { env } : {} };
}
const listOf = (forge: Forge, kind: Kind) => (kind === 'secret' ? forge.site?.secrets : forge.site?.variables) ?? [];
function save(forge: Forge, kind: Kind, list: ActionsValue[]) { forge.site = { ...forge.site!, [field(kind)]: list }; }

function setCommand(h: Gh, kind: Kind, args: string[]): number {
  const { g } = h, f = parseFlags(g, `${kind} set <${kind}-name> [flags]`, args, ['b|body=', 'e|env=', 'R|repo=', 'o|org=', 'f|env-file=', 'v|visibility=', 'a|app=', 'u|user=', 'r|repos=', 'no-store']);
  if (!f) return 1;
  if (on(f, 'org') || on(f, 'env-file') || on(f, 'user') || on(f, 'app') || on(f, 'no-store')) { g.err(`gh ${kind} set：模擬環境只支援儲存庫與 environment 的 ${kind}（--body、標準輸入、-e、-R）`); return 1; }
  const raw = f.rest[0];
  if (raw === undefined) { g.err('must pass name argument'); return 1; }
  const name = raw.toUpperCase(), problem = nameProblem(name);
  if (problem) {
    g.err(/GITHUB_/.test(problem) ? `${kind === 'secret' ? 'Secret' : 'Variable'} names must not start with GITHUB_.`
      : `${kind === 'secret' ? 'Secret' : 'Variable'} names can only contain alphanumeric characters ([a-z], [A-Z], [0-9]) or underscores (_). Spaces are not allowed. Must start with a letter ([a-z], [A-Z]) or underscores (_).`);
    return 1;
  }
  let value = flag(f, 'body');
  if (value === undefined) {
    if (h.stdin === undefined || h.stdin === null) { g.err(`gh ${kind} set：要用 --body 給值，或從標準輸入給（gh ${kind} set ${name} < 檔案）；模擬環境沒有互動輸入`); return 1; }
    value = h.stdin.replace(/[\r\n]+$/, '');
  }
  const t = target(h, kind, f);
  if (!t) return 1;
  if (kind === 'secret' && !value) { g.err(`failed to set secret "${name}": HTTP 422: Secret value can't be blank (${api(t.forge, t.env, `actions/secrets/${name}`)})`); return 1; }
  const list = [...listOf(t.forge, kind)], i = list.findIndex(v => v.name === name && v.env === t.env), entry: ActionsValue = { name, value, ...t.env !== undefined ? { env: t.env } : {}, updatedAt: g.now };
  if (i >= 0) list[i] = entry; else list.push(entry);
  save(t.forge, kind, list);
  const repo = repoPath(t.forge);
  g.out(kind === 'secret' ? `✓ Set Actions secret ${name} for ${repo}` : `✓ ${i >= 0 ? 'Updated' : 'Created'} variable ${name} for ${repo}`);
  return 0;
}

function listCommand(h: Gh, kind: Kind, args: string[]): number {
  const { g } = h, f = parseFlags(g, `${kind} list [flags]`, args, ['e|env=', 'R|repo=', 'o|org=', 'json=', 'q|jq=', 't|template=']);
  if (!f) return 1;
  if (on(f, 'org') || on(f, 'json') || on(f, 'jq') || on(f, 'template')) { g.err(`gh ${kind} list：模擬環境不支援 --org、--json、--jq、--template`); return 1; }
  const t = target(h, kind, f);
  if (!t) return 1;
  const rows = listOf(t.forge, kind).filter(v => v.env === t.env).sort((a, b) => (a.name < b.name ? -1 : 1));
  if (!rows.length) { g.err(`no ${kind}s found`); return 0; }
  g.out(...table(kind === 'secret' ? [['NAME', 'UPDATED'], ...rows.map(v => [v.name, fuzzyAgo(g.now, v.updatedAt)])]
    : [['NAME', 'VALUE', 'UPDATED'], ...rows.map(v => [v.name, v.value.split('\n')[0], fuzzyAgo(g.now, v.updatedAt)])]));
  return 0;
}

function getOrDelete(h: Gh, kind: Kind, sub: 'get' | 'delete', args: string[]): number {
  const { g } = h, f = parseFlags(g, `${kind} ${sub} <${kind}-name> [flags]`, args, ['e|env=', 'R|repo=', 'o|org=', 'json=']);
  if (!f) return 1;
  if (on(f, 'org') || on(f, 'json')) { g.err(`gh ${kind} ${sub}：模擬環境不支援 --org、--json`); return 1; }
  const raw = f.rest[0];
  if (raw === undefined) { g.err(`must pass name argument`); return 1; }
  const t = target(h, kind, f);
  if (!t) return 1;
  const name = raw.toUpperCase(), list = listOf(t.forge, kind), found = list.find(v => v.name === name && v.env === t.env), repo = repoPath(t.forge);
  if (sub === 'get') {
    if (!found) { g.err(`variable ${name} was not found`); return 1; }
    g.out(...found.value.split('\n'));
    return 0;
  }
  if (!found) { g.err(`failed to delete ${kind} ${name}: HTTP 404: Not Found (${api(t.forge, t.env, `actions/${field(kind)}/${name}`)})`); return 1; }
  save(t.forge, kind, list.filter(v => v !== found));
  g.out(kind === 'secret' ? `✓ Deleted Actions secret ${name} from ${repo}` : `✓ Deleted variable ${name} from ${repo}`);
  return 0;
}

/** gh secret set|list|delete and gh variable set|list|get|delete (the artifacts profile). */
export function valuesCommand(h: Gh, kind: Kind, args: string[]): number {
  const { g } = h, sub = args[0], rest = args.slice(1);
  if (sub === 'set') return setCommand(h, kind, rest);
  if (sub === 'list' || sub === 'ls') return listCommand(h, kind, rest);
  if (sub === 'delete' || sub === 'remove') return getOrDelete(h, kind, 'delete', rest);
  if (sub === 'get' && kind === 'variable') return getOrDelete(h, kind, 'get', rest);
  g.err(sub === undefined ? `gh ${kind}：要加子指令，例如 gh ${kind} list` : `unknown command "${sub}" for "gh ${kind}"`);
  return 1;
}

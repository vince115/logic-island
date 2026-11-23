import { parentOf, resolvePath } from './fs';
import { baseRepo, flag, fuzzyAgo, on, parseFlags, type Gh } from './gh';
import { table } from './gh-pr';
import { repoPath } from './forge';
import { API_BASE } from './forge-state';
import { matchName } from './glob';
import { sizeText, type ArtifactEntry } from './artifacts-model';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md §6): gh run download (a run's artifacts into the learner's
 * folder: one named artifact straight into it, otherwise each into a folder of its name) and gh cache list|delete. What
 * they see follows the machine's clock (an artifact exists once its upload step ended, until it expires).
 */

/** gh run download <run-id> [-n name]… [-p pattern]… [-D dir]. */
export function downloadCommand(h: Gh, args: string[]): number {
  const { g } = h, f = parseFlags(g, 'run download [<run-id>]', args, ['n|name=', 'p|pattern=', 'D|dir=', 'R|repo=']);
  if (!f) return 1;
  const repo = baseRepo(g, flag(f, 'repo'));
  if (!repo) return 1;
  const id = f.rest[0];
  if (id === undefined) { g.err('gh run download：模擬環境要寫 run 的 ID（gh run download <run-id> -n 名稱）'); return 1; }
  const run = (repo.forge.site?.runs ?? []).find(r => String(r.id) === id && r.createdAt <= g.now);
  if (!run) { g.err(`failed to get run: HTTP 404: Not Found (${API_BASE}/repos/${repoPath(repo.forge)}/actions/runs/${id})`); return 1; }
  const names = f.values.get('name') ?? [], patterns = f.values.get('pattern') ?? [];
  const all = (repo.forge.site?.artifacts ?? []).filter(a => a.runId === run.id && a.at <= g.now);
  const valid = all.filter(a => a.expiresAt > g.now);
  const wanted = (a: ArtifactEntry) => (!names.length && !patterns.length) || names.includes(a.name) || patterns.some(p => matchName(p, a.name));
  const chosen = valid.filter(wanted).sort((a, b) => a.id - b.id);
  if (!chosen.length) { g.err(valid.length || !all.length ? 'no artifact matches any of the names or patterns provided' : 'no valid artifacts found to download'); return 1; }
  const dest = resolvePath({ cwd: g.cwd, home: g.state.home }, flag(f, 'dir') ?? '.'), isolate = names.length !== 1 || patterns.length > 0;
  const owner = g.state.user, mkdirs = (d: string) => { const missing: string[] = []; for (let at = d; !g.nodes.has(at); at = parentOf(at)) missing.push(at); for (const x of missing.reverse()) g.nodes.set(x, { kind: 'dir', mode: 0o755, owner }); };
  for (const a of chosen) {
    const root = isolate ? `${dest === '/' ? '' : dest}/${a.name}` : dest;
    for (const file of a.files) {
      const path = `${root === '/' ? '' : root}/${file.path}`;
      if (g.nodes.has(path)) { g.err(`error downloading ${a.name}: error extracting zip archive: open ${path}: file exists`); return 1; }
      mkdirs(parentOf(path));
      g.nodes.set(path, { kind: 'file', mode: 0o644, owner, content: file.content ?? '' });
    }
  }
  return 0;
}

/** gh cache list [-k key] [-r ref] [-L n] and gh cache delete <id|key> | --all. */
export function cacheCommand(h: Gh, args: string[]): number {
  const { g } = h, sub = args[0];
  if (sub === 'list' || sub === 'ls') {
    const f = parseFlags(g, 'cache list [flags]', args.slice(1), ['k|key=', 'r|ref=', 'L|limit=', 'S|sort=', 'O|order=', 'R|repo=', 'json=']);
    if (!f) return 1;
    if (on(f, 'json') || on(f, 'sort') || on(f, 'order')) { g.err('gh cache list：模擬環境不支援 --json、--sort、--order（新的在前）'); return 1; }
    const repo = baseRepo(g, flag(f, 'repo'));
    if (!repo) return 1;
    const key = flag(f, 'key'), ref = flag(f, 'ref'), limit = Number(flag(f, 'limit') ?? 30), name = repoPath(repo.forge);
    const all = (repo.forge.site?.caches ?? []).filter(c => c.at <= g.now && (!key || c.key.startsWith(key)) && (!ref || c.ref === ref)).sort((a, b) => b.at - a.at || b.id - a.id);
    if (!all.length) { g.err(`No caches found in ${name}`); return 0; }
    const shown = all.slice(0, limit);
    g.out(`Showing ${shown.length} of ${all.length} cache${all.length === 1 ? '' : 's'} in ${name}`, '',
      ...table([['ID', 'KEY', 'SIZE', 'CREATED', 'ACCESSED'], ...shown.map(c => [String(c.id), c.key, sizeText(c.size), fuzzyAgo(g.now, c.at), fuzzyAgo(g.now, c.at)])]));
    return 0;
  }
  if (sub === 'delete') {
    const f = parseFlags(g, 'cache delete [<cache-id> | <cache-key> | --all] [flags]', args.slice(1), ['a|all', 'R|repo=']);
    if (!f) return 1;
    const repo = baseRepo(g, flag(f, 'repo'));
    if (!repo) return 1;
    const site = repo.forge.site, name = repoPath(repo.forge), what = f.rest[0];
    if (!site || site.permission === 'read') { g.err(`HTTP 403: Must have admin rights to Repository. (${API_BASE}/repos/${name}/actions/caches)`); return 1; }
    const caches = (site.caches ?? []).filter(c => c.at <= g.now);
    const gone = on(f, 'all') ? caches : caches.filter(c => String(c.id) === what || c.key === what);
    if (!on(f, 'all') && what === undefined) { g.err('must provide either cache id, cache key, or use --all'); return 1; }
    if (!gone.length) { g.err(on(f, 'all') ? `No caches to delete` : `X Could not find a cache matching ${what} in ${name}`); return 1; }
    repo.forge.site = { ...site, caches: (site.caches ?? []).filter(c => !gone.includes(c)) };
    g.out(`✓ Deleted ${gone.length} cache${gone.length === 1 ? '' : 's'} from ${name}`);
    return 0;
  }
  g.err(sub === undefined ? 'gh cache：要加子指令，例如 gh cache list' : `unknown command "${sub}" for "gh cache"`);
  return 1;
}

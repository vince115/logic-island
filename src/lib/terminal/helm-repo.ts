import { parentOf, resolvePath, type FsNode, type FsState } from './fs';
import { hex } from './docker';
import { parseYaml } from './yaml';
import { toJson } from './kube-manifest';
import { kubeYaml } from './kube-output';
import { arr, obj, stamp, str, type J, type JObj } from './kube-model';
import { chartArchive, compareSemver, loadChart } from './helm-chart';
import { toJ } from './helm-value';
import { uiTable } from './helm-release';
import { fail, flag, locateChart, type HelmResult, type Hx } from './helm';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §9): chart repositories. The only repository host is the fictional
 * https://charts.example.test, which serves the lesson's charts (each published at a time). helm repo add writes
 * ~/.config/helm/repositories.yaml and caches the index as it is then (~/.cache/helm/repository/NAME-index.yaml);
 * search, pull, show and install read that cache, so a chart published later needs helm repo update. pull writes
 * NAME-VERSION.tgz (an E22 archive, so tar can read it) or, with --untar, the chart's folder.
 */

export const REPO_URL = 'https://charts.example.test';
export const repoFile = (s: Pick<FsState, 'home'>) => `${s.home}/.config/helm/repositories.yaml`;
export const indexFile = (s: Pick<FsState, 'home'>, name: string) => `${s.home}/.cache/helm/repository/${name}-index.yaml`;
const readJ = (s: FsState, path: string): JObj | null => {
  const n = s.nodes.get(path);
  if (n?.kind !== 'file') return null;
  try { return obj(toJson(parseYaml(n.content ?? ''))); } catch { return null; }
};
/** The repositories in repositories.yaml. */
export const reposOf = (s: FsState) => arr(readJ(s, repoFile(s))?.repositories).map(obj).map(r => ({ name: str(r.name) ?? '', url: str(r.url) ?? '' }));
/** Writes files, making the folders they need (the user's). */
export function writeFiles(s: FsState, files: readonly [string, string, number][]): FsState {
  const nodes = new Map(s.nodes), mk = (d: string) => { const parts = d.split('/').filter(Boolean); for (let i = 1; i <= parts.length; i++) { const p = `/${parts.slice(0, i).join('/')}`; if (!nodes.has(p)) nodes.set(p, { kind: 'dir', mode: 0o755, owner: s.user }); } };
  for (const [path, content, mode] of files) { mk(parentOf(path)); nodes.set(path, { kind: 'file', mode, owner: s.user, content } as FsNode); }
  return { ...s, nodes };
}
export const reposYaml = (repos: readonly { name: string; url: string }[]) => `${kubeYaml({ apiVersion: '', generated: '0001-01-01T00:00:00Z',
  repositories: repos.map(r => ({ caFile: '', certFile: '', insecure_skip_tls_verify: false, keyFile: '', name: r.name, pass_credentials_all: false, password: '', url: r.url, username: '' })) }).join('\n')}\n`;
/** The repository's index as it is at the state's time (versions newest first). */
export function indexYaml(charts: readonly { files: Readonly<Record<string, string>>; published: number }[], now: number, url: string): string {
  const entries: Record<string, J[]> = {};
  for (const c of charts) {
    if (c.published > now) continue;
    const ch = loadChart(c.files);
    if ('error' in ch) continue;
    (entries[ch.name] ??= []).push({ apiVersion: ch.apiVersion, appVersion: ch.appVersion, created: stamp(c.published), description: ch.description, digest: hex(chartArchive(ch.name, c.files, 'root', c.published)),
      name: ch.name, type: ch.type, urls: [`${url}/${ch.name}-${ch.version}.tgz`], version: ch.version });
  }
  for (const list of Object.values(entries)) list.sort((a, b) => compareSemver(str(obj(b).version) ?? '', str(obj(a).version) ?? ''));
  return `${kubeYaml({ apiVersion: 'v1', entries, generated: stamp(now) }).join('\n')}\n`;
}
const unreachable = (url: string) => { const host = url.replace(/^[a-z]+:\/\//, '').split(/[/:]/)[0]; return `looks like "${url}" is not a valid chart repository or cannot be reached: Get "${url}/index.yaml": dial tcp: lookup ${host} on 127.0.0.53:53: no such host`; };
/** A cached index's entries: chart name → versions (newest first). */
const cached = (s: FsState, repo: string) => { const j = readJ(s, indexFile(s, repo)); return j ? Object.fromEntries(Object.entries(obj(j.entries)).map(([n, l]) => [n, arr(l).map(obj)])) : null; };

/** REPO/NAME (and --version) from the cached index, as the lesson's chart files. */
export function repoChart(x: Hx, ref: string, version?: string): { files: Record<string, string> } | { error: string } {
  const [repo, name, ...more] = ref.split('/');
  if (!name || more.length) return { error: `non-absolute URLs should be in form of repo_name/path_to_chart, got: ${ref}` };
  if (!reposOf(x.state).some(r => r.name === repo)) return { error: `repo ${repo} not found` };
  const idx = cached(x.state, repo);
  if (!idx) return { error: `no cached repo found. (try 'helm repo update'): open ${indexFile(x.state, repo)}: no such file or directory` };
  const list = idx[name] ?? [], hit = version ? list.find(e => str(e.version) === version) : list.find(e => !(str(e.version) ?? '').includes('-'));
  if (!hit) return { error: `chart "${name}" matching ${version ?? ''} not found in ${repo} index. (try 'helm repo update'): no chart ${version ? `version found for ${name}-${version}` : 'name found'}` };
  const files = (x.state.kube?.helm?.charts ?? []).find(c => { const ch = loadChart(c.files); return !('error' in ch) && ch.name === name && ch.version === str(hit.version); })?.files;
  return files ? { files: { ...files } } : { error: `failed to fetch ${str(arr(hit.urls)[0])} : 404 Not Found` };
}

export function repoCommand(x: Hx): HelmResult {
  const [sub, ...args] = x.pos, repos = reposOf(x.state), ok = (lines: string[], state = x.state) => { lines.forEach(l => x.io.out(l)); return { state, status: 0 }; };
  switch (sub) {
    case 'add': {
      if (args.length !== 2) { x.io.err('Error: "helm repo add" requires 2 arguments'); x.io.err(''); x.io.err('Usage:  helm repo add [NAME] [URL] [flags]'); return { state: x.state, status: 1 }; }
      const [name, url0] = args, url = url0.replace(/\/+$/, ''), had = repos.find(r => r.name === name);
      if (had) return had.url === url ? ok([`"${name}" already exists with the same configuration, skipping`]) : fail(x, `repository name (${name}) already exists, please specify a different name`);
      if (url !== REPO_URL || !x.state.kube?.helm) return fail(x, unreachable(url));
      return ok([`"${name}" has been added to your repositories`], writeFiles(x.state, [[repoFile(x.state), reposYaml([...repos, { name, url }]), 0o600], [indexFile(x.state, name), indexYaml(x.state.kube?.helm?.charts ?? [], x.now, url), 0o644]]));
    }
    case 'list': case 'ls':
      return repos.length ? ok(uiTable([['NAME', 'URL'], ...repos.map(r => [r.name, r.url])])) : fail(x, 'no repositories to show');
    case 'update': case 'up': {
      if (!repos.length) return fail(x, 'no repositories found. You must add one before updating');
      const pickd = args.length ? repos.filter(r => args.includes(r.name)) : repos, missing = args.find(a => !repos.some(r => r.name === a));
      if (missing) return fail(x, `no repositories found matching '${missing}'.  Nothing will be updated`);
      return ok(['Hang tight while we grab the latest from your chart repositories...', ...pickd.map(r => `...Successfully got an update from the "${r.name}" chart repository`), 'Update Complete. ⎈Happy Helming!⎈'],
        writeFiles(x.state, pickd.map(r => [indexFile(x.state, r.name), indexYaml(x.state.kube?.helm?.charts ?? [], x.now, r.url), 0o644] as [string, string, number])));
    }
    case 'remove': case 'rm': {
      const gone = args.find(a => !repos.some(r => r.name === a));
      if (!args.length || gone) return fail(x, gone ? `no repo named "${gone}" found` : '"helm repo remove" requires at least 1 argument');
      const nodes = new Map(x.state.nodes);
      for (const a of args) nodes.delete(indexFile(x.state, a));
      return ok(args.map(a => `"${a}" has been removed from your repositories`), writeFiles({ ...x.state, nodes }, [[repoFile(x.state), reposYaml(repos.filter(r => !args.includes(r.name))), 0o600]]));
    }
  }
  x.io.err(sub ? `Error: unknown command "${sub}" for "helm repo"` : 'Error: "helm repo" requires a subcommand');
  return { state: x.state, status: 1 };
}

export function searchCommand(x: Hx): HelmResult {
  const [where, term = ''] = x.pos;
  if (where === 'hub') return fail(x, '（模擬環境沒有 Artifact Hub：請用 helm search repo）');
  if (where !== 'repo') { x.io.err(where ? `Error: unknown command "${where}" for "helm search"` : 'Error: "helm search" requires a subcommand'); return { state: x.state, status: 1 }; }
  const repos = reposOf(x.state);
  if (!repos.length) return fail(x, 'no repositories configured');
  const rows: string[][] = [], t = term.toLowerCase(), all = x.flags.bools.has('versions'), want = flag(x, 'version');
  for (const r of repos) for (const [name, list] of Object.entries(cached(x.state, r.name) ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const id = `${r.name}/${name}`, hits = list.filter(e => (all || !(str(e.version) ?? '').includes('-')) && (!want || str(e.version) === want));
    if (t && !`${id} ${str(list[0]?.description) ?? ''}`.toLowerCase().includes(t)) continue;
    for (const e of all ? hits : hits.slice(0, 1)) rows.push([id, str(e.version) ?? '', str(e.appVersion) ?? '', str(e.description) ?? '']);
  }
  if (!rows.length) { x.io.out('No results found'); return { state: x.state, status: 0 }; }
  uiTable([['NAME', 'CHART VERSION', 'APP VERSION', 'DESCRIPTION'], ...rows], 50).forEach(l => x.io.out(l));
  return { state: x.state, status: 0 };
}

export function pullCommand(x: Hx): HelmResult {
  if (x.pos.length !== 1) { x.io.err('Error: "helm pull" requires 1 argument'); x.io.err(''); x.io.err('Usage:  helm pull [chart URL | repo/chartname] [...] [flags]'); return { state: x.state, status: 1 }; }
  const got = repoChart(x, x.pos[0], flag(x, 'version'));
  if ('error' in got) return fail(x, got.error);
  const files = got.files, ch = loadChart(files);
  if ('error' in ch) return fail(x, ch.error);
  if (x.flags.bools.has('untar')) {
    const dir = resolvePath(x.state, `${flag(x, 'untardir') ?? '.'}/${ch.name}`);
    if (x.state.nodes.has(dir)) return fail(x, `failed to untar: a file or directory with the name ${ch.name} already exists`);
    return { state: writeFiles(x.state, Object.entries(files).map(([p, c]) => [`${dir}/${p}`, c, 0o644])), status: 0 };
  }
  const path = resolvePath(x.state, `${flag(x, 'destination') ?? '.'}/${ch.name}-${ch.version}.tgz`);
  return { state: writeFiles(x.state, [[path, chartArchive(ch.name, files, x.state.user, x.now), 0o644]]), status: 0 };
}

export function showCommand(x: Hx): HelmResult {
  const [what, ref] = x.pos;
  if (!['values', 'chart', 'readme', 'all'].includes(what ?? '')) {
    if (what === 'crds') return fail(x, '（模擬環境：CRD 只在課文說明）');
    x.io.err(what ? `Error: unknown command "${what}" for "helm show"` : 'Error: "helm show" requires a subcommand'); return { state: x.state, status: 1 };
  }
  if (!ref || x.pos.length > 2) { x.io.err(`Error: "helm show ${what}" requires 1 argument`); x.io.err(''); x.io.err(`Usage:  helm show ${what} [CHART] [flags]`); return { state: x.state, status: 1 }; }
  const c = locateChart(x, ref);
  if ('error' in c) return fail(x, c.error);
  const chart = kubeYaml(toJ(c.chart.meta)), values = c.chart.valuesText.replace(/\n$/, '').split('\n'), readme = (c.chart.files['README.md'] ?? '').replace(/\n$/, '').split('\n');
  const lines = what === 'chart' ? chart : what === 'values' ? values : what === 'readme' ? readme : [...chart, '---', ...values, ...c.chart.files['README.md'] ? ['---', ...readme] : []];
  lines.forEach(l => x.io.out(l));
  return { state: x.state, status: 0 };
}

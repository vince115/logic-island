import { baseName, resolvePath } from './fs';
import { SUBDOMAIN, SUBDOMAIN_TEXT } from './kube-manifest';
import { obj, str, type JObj } from './kube-model';
import { chartArchive, folderFiles, loadChart, validSemver } from './helm-chart';
import { readDoc, renderChart, renderTemplates, splitDocs } from './helm-render';
import { coalesce, parseValues } from './helm-values';
import { toJ, type VMap } from './helm-value';
import { scaffold } from './helm-scaffold';
import { writeFiles } from './helm-repo';
import { API_VERSIONS, fail, flag, locateChart, TEMPLATE_KUBE_VERSION, userValues, type HelmResult, type Hx } from './helm';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §10): the client-side commands — helm create (the scaffold),
 * package (NAME-VERSION.tgz), template (the manifests as install would render them, with helm template's default
 * capabilities and release name, --show-only) and lint (Chart.yaml, values.yaml, rendering with required not failing,
 * each manifest's YAML and metadata.name; INFO, WARNING and ERROR lines, then the summary).
 */

export function createCommand(x: Hx): HelmResult {
  if (x.pos.length !== 1) { x.io.err('Error: "helm create" requires 1 argument'); x.io.err(''); x.io.err('Usage:  helm create NAME [flags]'); return { state: x.state, status: 1 }; }
  const dir = resolvePath(x.state, x.pos[0]), name = baseName(dir), node = x.state.nodes.get(dir);
  if (node && node.kind !== 'dir') return fail(x, `file '${x.pos[0]}' already exists and is not a directory`);
  x.io.out(`Creating ${x.pos[0]}`);
  const files = scaffold(name);
  for (const p of Object.keys(files)) if (x.state.nodes.has(`${dir}/${p}`)) x.io.err(`WARNING: File "${x.pos[0]}/${p}" already exists. Overwriting.`);
  const s = writeFiles(x.state, Object.entries(files).map(([p, c]) => [`${dir}/${p}`, c, 0o644]));
  const nodes = new Map(s.nodes);
  if (!nodes.has(`${dir}/charts`)) nodes.set(`${dir}/charts`, { kind: 'dir', mode: 0o755, owner: x.state.user });
  return { state: { ...s, nodes }, status: 0 };
}

export function packageCommand(x: Hx): HelmResult {
  if (!x.pos.length) { x.io.err('Error: need at least one argument, the path to the chart'); return { state: x.state, status: 1 }; }
  let state = x.state;
  for (const word of x.pos) {
    const dir = resolvePath(state, word), files = folderFiles(state, dir);
    if (!files) return fail(x, `stat ${word}: no such file or directory`, state);
    const c = loadChart(files);
    if ('error' in c) return fail(x, c.error, state);
    const path = resolvePath(state, `${flag(x, 'destination') ?? '.'}/${c.name}-${c.version}.tgz`);
    state = writeFiles(state, [[path, chartArchive(c.name, files, state.user, x.now), 0o644]]);
    x.io.out(`Successfully packaged chart and saved it to: ${path}`);
  }
  return { state, status: 0 };
}

export function templateCommand(x: Hx): HelmResult {
  if (!x.pos.length || x.pos.length > 2) { x.io.err(`Error: "helm template" requires ${x.pos.length ? 'at most 2 arguments' : 'at least 1 argument'}`); x.io.err(''); x.io.err('Usage:  helm template [NAME] [CHART] [flags]'); return { state: x.state, status: 1 }; }
  const [name, ref] = x.pos.length === 2 ? x.pos : ['release-name', x.pos[0]];
  const c = locateChart(x, ref);
  if ('error' in c) return fail(x, c.error);
  const v = userValues(x);
  if ('error' in v) return fail(x, v.error as string);
  const r = renderChart(c.chart, coalesce(c.chart.values, v as VMap), { name, namespace: x.ns, revision: 1, install: true, kubeVersion: TEMPLATE_KUBE_VERSION, apiVersions: API_VERSIONS });
  if ('error' in r) return fail(x, r.error);
  let ms = r.manifests;
  const only = x.flags.values['show-only'];
  if (only) {
    const want = only.map(o => `${c.chart.name}/${o}`), missing = want.find(w => !ms.some(m => m.source === w));
    if (missing) return fail(x, `could not find template ${missing.slice(c.chart.name.length + 1)} in chart`);
    ms = ms.filter(m => want.includes(m.source));
  }
  const text = ms.map(m => `---\n# Source: ${m.source}\n${m.text}\n`).join('').trim();
  if (text) text.split('\n').forEach(l => x.io.out(l));
  return { state: x.state, status: 0 };
}

const LINT_SUFFIX = (n: number, f: number) => `${n} chart(s) linted, ${f} chart(s) failed`;
export function lintCommand(x: Hx): HelmResult {
  const words = x.pos.length ? x.pos : ['.'];
  let failed = 0;
  for (const word of words) {
    const msgs: string[] = [], err = (m: string) => msgs.push(`[ERROR] ${m}`), dir = resolvePath(x.state, word), files = folderFiles(x.state, dir) ?? {};
    x.io.out(`==> Linting ${word}`);
    if (files['Chart.yaml'] === undefined) err(`Chart.yaml: unable to check Chart.yaml file in chart: stat ${word}/Chart.yaml: no such file or directory`);
    else {
      const parsed = parseValues(files['Chart.yaml'], 'Chart.yaml: unable to parse YAML'), meta = 'error' in parsed ? null : parsed;
      if ('error' in parsed) err(parsed.error as string);
      const m = (meta ? toJ(meta) : {}) as JObj, ver = str(m.version) ?? (typeof m.version === 'number' ? String(m.version) : '');
      if (!str(m.name)) err('Chart.yaml: name is required');
      if (!['v1', 'v2'].includes(str(m.apiVersion) ?? '')) err('Chart.yaml: apiVersion is required. The value must be either "v1" or "v2"');
      if (!ver) err('Chart.yaml: version is required'); else if (!validSemver(ver)) err(`Chart.yaml: version '${ver}' is not a valid SemVer`);
      if (meta && !str(m.icon)) msgs.push('[INFO] Chart.yaml: icon is recommended');
    }
    const values = files['values.yaml'] === undefined ? {} : parseValues(files['values.yaml'], 'values.yaml: unable to parse YAML');
    if (files['values.yaml'] === undefined && files['Chart.yaml'] !== undefined) msgs.push('[INFO] values.yaml: file does not exist');
    if ('error' in values) err(values.error as string);
    const chart = loadChart(files), user = userValues(x);
    if (!Object.keys(files).some(p => p.startsWith('templates/')) && files['Chart.yaml'] !== undefined) msgs.push('[WARNING] templates/: directory does not exist');
    else if (!('error' in chart) && !('error' in user)) {
      const r = renderTemplates(chart, coalesce(chart.values, user as VMap), { name: 'test-release', namespace: x.ns, revision: 1, install: true, kubeVersion: TEMPLATE_KUBE_VERSION, apiVersions: API_VERSIONS, lint: true });
      if ('error' in r) err(`templates/: ${r.error}`);
      else for (const [source, text] of Object.entries(r.out).sort()) {
        if (source.endsWith('/NOTES.txt')) continue;
        const short = source.slice(chart.name.length + 1);
        for (const doc of splitDocs(text)) {
          const d = readDoc(doc, source);
          if ('error' in d) { err(`${short}: unable to parse YAML: ${d.error.replace(/^YAML parse error on [^:]+: /, '')}`); continue; }
          const name = str(obj(d.doc.metadata).name) ?? '';
          if (name && !SUBDOMAIN.test(name)) err(`${short}: object name does not conform to Kubernetes naming requirements: "${name}": metadata.name: Invalid value: "${name}": ${SUBDOMAIN_TEXT}`);
        }
      }
    }
    msgs.forEach(l => x.io.out(l));
    x.io.out('');
    if (msgs.some(l => l.startsWith('[ERROR]'))) failed++;
  }
  if (failed) return fail(x, LINT_SUFFIX(words.length, failed));
  x.io.out(LINT_SUFFIX(words.length, 0));
  return { state: x.state, status: 0 };
}

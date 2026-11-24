import { describe, expect, it } from 'vitest';
import { terminalContentProblems } from '@/lib/terminal/lesson';
import { HELM_PROFILE, KUBE_STORAGE_PROFILE } from '@/lib/terminal/shell';
import { decodeRelease } from '@/lib/terminal/helm-release';
import { stoOn } from './support/storage-fixture';
import { chartYaml, helmLab, hm, hmOn, WEB_010, withHelm } from './support/helm-fixture';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §1, §6–§8, §11): the helm profile and its boundary, the lesson's
 * Helm data and boot releases, helm install/list/status/history/get with Helm's output, releases as Secrets, the objects'
 * ownership metadata, upgrade (values: -f, --set, reuse and reset), rollback, uninstall (--keep-history) and the errors.
 */
const STATUS = (name: string, rev: number, at = '10:00:00', ns = 'default', status = 'deployed') =>
  [`NAME: ${name}`, `LAST DEPLOYED: Tue Nov 24 ${at} 2026`, `NAMESPACE: ${ns}`, `STATUS: ${status}`, `REVISION: ${rev}`, 'TEST SUITE: None'];
const NOTES = (name: string) => ['NOTES:', `Visit ${name} on port 80.`];
const cells = (line: string) => line.split('\t').map(c => c.trimEnd());

describe('the helm profile and its boundary', () => {
  it('adds helm above kube-storage only; below it helm is not a command and the data and check name E39', () => {
    expect(HELM_PROFILE.commands).toEqual([...KUBE_STORAGE_PROFILE.commands.filter(c => !['man', 'clear', 'help'].includes(c)), 'helm', 'man', 'clear', 'help']);
    const below = { ...helmLab, profile: 'kube-storage' as const };
    expect(stoOn(below, 'helm version').last.err[0]).toMatch(/^bash: helm: command not found（模擬環境支援：/);
    expect(terminalContentProblems({ machines: [below], examples: [], exercises: [] }, KUBE_STORAGE_PROFILE)).toContain('machine kub-39: kube: helm needs the helm profile (engine stage E39)');
    expect(terminalContentProblems({ machines: [helmLab], examples: [], exercises: [] })).toEqual([]);
    expect(hm('helm version', 'helm version --short', 'helm --help').log.map(l => l.out[0])).toEqual(['version.BuildInfo{Version:"v3.16.4", GitCommit:"7877b45b63f95635153b29a42c0c2f4273ec45ca", GitTreeState:"clean", GoVersion:"go1.22.7"}',
      'v3.16.4+g7877b45', expect.stringMatching(/^用法：helm install\|upgrade/)]);
  });
  it('checks the lesson data: charts, repositories and boot releases', () => {
    const bad = (helm: object) => terminalContentProblems({ machines: [withHelm(helmLab, helm as never)], examples: [], exercises: [] });
    expect(bad({ charts: [{ files: { 'Chart.yaml': 'apiVersion: v2\nname: web\n' } }] })).toContain('machine kub-39: kube: helm.charts[0]: validation: chart.metadata.version is required');
    expect(bad({ repos: [{ name: 'x', url: 'https://elsewhere.test' }] })[0]).toMatch(/helm\.repos are at most 4 of \{ name, url: https:\/\/charts\.example\.test \}/);
    expect(bad({ charts: [{ files: WEB_010 }], releases: [{ name: 'a', chart: 'nope' }] })).toContain('machine kub-39: kube: helm.releases[0]: no chart nope among helm.charts');
    expect(bad({ charts: [{ files: { ...WEB_010, 'templates/x.yaml': '{{ .Values.a.b }}' } }], releases: [{ name: 'a', chart: 'web' }] })[0])
      .toBe('machine kub-39: kube: helm.releases[0]: INSTALLATION FAILED: template: web/templates/x.yaml:1:10: executing "web/templates/x.yaml" at <.Values.a.b>: nil pointer evaluating interface {}.b');
  });
  it('installs the boot releases in time order (the same name again is an upgrade) and adds the repositories', () => {
    const lab = withHelm(helmLab, { ...helmLab.kube!.helm, repos: [{ name: 'example', url: 'https://charts.example.test' }],
      releases: [{ name: 'shop', chart: 'web', version: '0.1.0', values: 'replicaCount: 3\n', at: '2026-11-24 09:30:00' }, { name: 'shop', chart: 'web', version: '0.1.0', at: '2026-11-24 09:00:00' }] });
    const s = hmOn(lab, 'helm history shop', 'helm get values shop', 'kubectl get deploy shop-web', 'helm repo list', 'helm search repo web', 'ls -la .config/helm');
    expect(s.log[0].out.map(cells)).toEqual([['REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION', 'DESCRIPTION'], ['1', 'Tue Nov 24 09:00:00 2026', 'superseded', 'web-0.1.0', '1.27', 'Install complete'],
      ['2', 'Tue Nov 24 09:30:00 2026', 'deployed', 'web-0.1.0', '1.27', 'Upgrade complete']]);
    expect(s.log[1].out).toEqual(['USER-SUPPLIED VALUES:', 'replicaCount: 3']);
    expect(s.log[2].out[1]).toMatch(/^shop-web\s+3\/3\s+3\s+3\s+60m$/);
    expect(s.log[3].out).toEqual(['NAME   \tURL                        ', 'example\thttps://charts.example.test']);
    expect(s.log[4].out.map(cells)).toEqual([['NAME', 'CHART VERSION', 'APP VERSION', 'DESCRIPTION'], ['example/web', '0.1.0', '1.27', 'A demo web chart']]);
    expect(s.log[5].out.at(-1)).toMatch(/^-rw------- learner learner .* repositories\.yaml$/);
  });
});

describe('install, list, status and the release Secrets', () => {
  it('prints the status block and lists the release with uitable columns', () => {
    const s = hm('helm install web ./web', 'helm list', 'helm status web', 'helm list -A -q', 'helm ls -n other');
    expect(s.log[0].out).toEqual([...STATUS('web', 1), ...NOTES('web')]);
    expect(s.log[1].out).toEqual(['NAME\tNAMESPACE\tREVISION\tUPDATED                      \tSTATUS  \tCHART    \tAPP VERSION', 'web \tdefault  \t1       \t2026-11-24 10:00:00 +0000 UTC\tdeployed\tweb-0.1.0\t1.27       ']);
    expect(s.log[2].out).toEqual(s.log[0].out);
    expect(s.log[3].out).toEqual(['web']);
    expect(s.log[4].out).toEqual(['NAME\tNAMESPACE\tREVISION\tUPDATED\tSTATUS\tCHART\tAPP VERSION']);
  });
  it('stores each revision as a Secret and marks the objects as the release\'s', () => {
    const s = hm('helm install web ./web', 'kubectl get secrets --show-labels', 'kubectl get deploy,svc,cm -l app.kubernetes.io/managed-by=Helm -o name', "kubectl get deploy web -o jsonpath='{.metadata.annotations}'",
      'kubectl get secret sh.helm.release.v1.web.v1 -o jsonpath={.data.release}');
    expect(s.log[1].out.map(l => l.split(/\s{2,}/))).toEqual([['NAME', 'TYPE', 'DATA', 'AGE', 'LABELS'], ['sh.helm.release.v1.web.v1', 'helm.sh/release.v1', '1', '0s', 'createdAt=1795514400,modifiedAt=1795514400,name=web,owner=helm,status=deployed,version=1']]);
    expect(s.log[2].out).toEqual(['deployment.apps/web', 'service/web', 'configmap/web-config']);
    expect(s.log[3].out).toEqual(['{"deployment.kubernetes.io/revision":"1","meta.helm.sh/release-name":"web","meta.helm.sh/release-namespace":"default"}']);
    expect(s.log[4].out[0]).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const secret = s.state.kube!.objects.find(o => (o.metadata as { name: string }).name === 'sh.helm.release.v1.web.v1')!;
    expect(decodeRelease(secret)).toMatchObject({ name: 'web', namespace: 'default', version: 1, info: { status: 'deployed', description: 'Install complete' }, chart: { metadata: { name: 'web', version: '0.1.0' } } });
  });
  it('refuses what Helm refuses', () => {
    const s = hm('helm install web ./web', 'helm install web ./web', 'helm install Web ./web', 'helm install x ./web -n prod', 'helm install ./web', 'helm install', 'helm install x ./nope', 'helm install x k8s', 'helm install x example/web', 'helm status nope', 'helm wat');
    expect(s.log.slice(1).map(l => l.err.join('|'))).toEqual(['Error: INSTALLATION FAILED: cannot re-use a name that is still in use',
      'Error: INSTALLATION FAILED: release name "Web": invalid release name, must match regex ^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$ and the length must not be longer than 53',
      'Error: INSTALLATION FAILED: create: failed to create: namespaces "prod" not found', 'Error: INSTALLATION FAILED: must either provide a name or specify --generate-name',
      'Error: "helm install" requires at least 1 argument||Usage:  helm install [NAME] [CHART] [flags]', 'Error: INSTALLATION FAILED: path "./nope" not found',
      'Error: INSTALLATION FAILED: Chart.yaml file is missing', 'Error: INSTALLATION FAILED: repo example not found', 'Error: release: not found', 'Error: unknown command "wat" for "helm"|Run \'helm --help\' for usage.']);
    const other = hm('kubectl create configmap web-config --from-literal=a=b', 'helm install web ./web');
    expect(other.last.err).toEqual(['Error: INSTALLATION FAILED: Unable to continue with install: ConfigMap "web-config" in namespace "default" exists and cannot be imported into the current release: invalid ownership metadata; label validation error: missing key "app.kubernetes.io/managed-by": must be set to "Helm"; annotation validation error: missing key "meta.helm.sh/release-name": must be set to "web"; annotation validation error: missing key "meta.helm.sh/release-namespace": must be set to "default"']);
    expect(hmOn({ ...helmLab, kube: undefined }, 'helm list').last.err).toEqual(['Error: Kubernetes cluster unreachable: Get "http://localhost:8080/version": dial tcp 127.0.0.1:8080: connect: connection refused']);
  });
  it('creates the namespace with --create-namespace, names a release with --generate-name, and renders template errors', () => {
    const s = hm('helm install x ./web -n prod --create-namespace', 'kubectl get ns prod --show-labels', 'helm install ./web --generate-name', 'helm list -A -q', 'helm install y ./web --set image=nginx');
    expect(s.log[0].out.slice(0, 3)).toEqual(['NAME: x', 'LAST DEPLOYED: Tue Nov 24 10:00:00 2026', 'NAMESPACE: prod']);
    expect(s.log[1].out[1]).toMatch(/^prod\s+Active\s+0s\s+kubernetes\.io\/metadata\.name=prod,name=prod$/);
    expect(s.log[3].out).toEqual(['web-1795514400', 'x']);
    expect(s.log[4].err).toEqual(['Error: INSTALLATION FAILED: template: web/templates/deployment.yaml:19:28: executing "web/templates/deployment.yaml" at <.Values.image.repository>: can\'t evaluate field repository in type interface {}']);
  });
});

describe('upgrade, rollback, history and uninstall', () => {
  it('upgrades with -f and --set over the chart\'s values, reusing the previous values only when none are given', () => {
    const s = hm('helm install web ./web --set replicaCount=1', 'helm upgrade web ./web -f prod.yaml --set image.tag=1.27', 'helm get values web', 'helm get values web --all', 'helm upgrade web ./web',
      'helm get values web', 'helm upgrade web ./web --reset-values', 'helm get values web', 'helm upgrade web ./web --set greeting=hi --reuse-values', 'helm get values web -o json', 'helm history web --max 2');
    expect(s.log[1].out).toEqual(['Release "web" has been upgraded. Happy Helming!', ...STATUS('web', 2), ...NOTES('web')]);
    expect(s.log[2].out).toEqual(['USER-SUPPLIED VALUES:', 'image:', '  tag: "1.27"', 'replicaCount: 3']);
    expect(s.log[3].out).toEqual(['COMPUTED VALUES:', 'greeting: hello', 'image:', '  repository: nginx', '  tag: "1.27"', 'replicaCount: 3', 'service:', '  port: 80', '  type: ClusterIP']);
    expect(s.log[5].out).toEqual(s.log[2].out);
    expect(s.log[7].out).toEqual(['USER-SUPPLIED VALUES:', 'null']);
    expect(s.log[9].out).toEqual(['{"greeting":"hi"}']);
    expect(s.log[10].out.map(l => cells(l)[0])).toEqual(['REVISION', '4', '5']);
  });
  it('deletes what the new chart no longer has and rolls back to a revision (a new one)', () => {
    const lab = withHelm(helmLab, helmLab.kube!.helm, []);
    const s = hmOn(lab, 'helm install web ./web', 'helm repo add example https://charts.example.test', 'sleep 60', 'helm repo update', 'helm upgrade web example/web', 'kubectl get cm web-config',
      'helm list', 'helm rollback web', 'kubectl get cm web-config -o name', 'helm history web', 'helm rollback web 9', 'helm rollback web x');
    expect(s.log[5].err).toEqual(['Error from server (NotFound): configmaps "web-config" not found']);
    expect(cells(s.log[6].out[1])).toEqual(['web', 'default', '2', '2026-11-24 10:01:00 +0000 UTC', 'deployed', 'web-0.2.0', '1.28']);
    expect(s.log[7].out).toEqual(['Rollback was a success! Happy Helming!']);
    expect(s.log[8].out).toEqual(['configmap/web-config']);
    expect(s.log[9].out.slice(1).map(cells)).toEqual([['1', 'Tue Nov 24 10:00:00 2026', 'superseded', 'web-0.1.0', '1.27', 'Install complete'], ['2', 'Tue Nov 24 10:01:00 2026', 'superseded', 'web-0.2.0', '1.28', 'Upgrade complete'],
      ['3', 'Tue Nov 24 10:01:00 2026', 'deployed', 'web-0.1.0', '1.27', 'Rollback to 1']]);
    expect([s.log[10].err, s.log[11].err]).toEqual([['Error: release has no 9 version'], ['Error: could not convert revision to a number: strconv.Atoi: parsing "x": invalid syntax']]);
    expect(hm('helm upgrade nope ./web', 'helm upgrade nope ./web --install').log.map(l => [...l.out.slice(0, 2), ...l.err])).toEqual([['Error: UPGRADE FAILED: "nope" has no deployed releases'], ['Release "nope" does not exist. Installing it now.', 'NAME: nope']]);
  });
  it('uninstalls (deleting the objects and the history, or keeping it) and lists uninstalled releases with -a', () => {
    const s = hm('helm install web ./web', 'helm uninstall web --keep-history', 'kubectl get deploy,svc,cm -l app.kubernetes.io/managed-by=Helm', 'helm list', 'helm list -a', 'helm status web',
      'helm uninstall web --keep-history', 'helm uninstall web', 'kubectl get secrets', 'helm uninstall web');
    expect(s.log[1].out).toEqual(['release "web" uninstalled']);
    expect(s.log[2].err).toEqual(['No resources found in default namespace.']);
    expect(s.log[3].out).toHaveLength(1);
    expect(cells(s.log[4].out[1])).toEqual(['web', 'default', '1', '2026-11-24 10:00:00 +0000 UTC', 'uninstalled', 'web-0.1.0', '1.27']);
    expect(s.log[5].out).toEqual([...STATUS('web', 1, '10:00:00', 'default', 'uninstalled'), ...NOTES('web')]);
    expect(s.log[6].err).toEqual(['Error: the release named "web" is already deleted']);
    expect(s.log[7].out).toEqual(['release "web" uninstalled']);
    expect(s.log[8].err).toEqual(['No resources found in default namespace.']);
    expect(s.log[9].err).toEqual(['Error: uninstall: Release not loaded: web: release: not found']);
  });
  it('gets the manifest and the notes; dry runs change nothing', () => {
    const s = hm('helm install web ./web --dry-run', 'helm list -q', 'helm install web ./web', 'helm get manifest web', 'helm get notes web');
    expect(s.log[0].out.slice(0, 9)).toEqual([...STATUS('web', 1, '10:00:00', 'default', 'pending-install'), 'HOOKS:', 'MANIFEST:', '---']);
    expect(s.log[0].out.slice(-3)).toEqual(['', ...NOTES('web')]);
    expect(s.log[1].out).toEqual([]);
    expect(s.log[3].out.filter(l => l.startsWith('# Source:'))).toEqual(['# Source: web/templates/configmap.yaml', '# Source: web/templates/service.yaml', '# Source: web/templates/deployment.yaml']);
    expect(s.log[3].out.at(-1)).toBe('');
    expect(s.log[4].out).toEqual([...NOTES('web'), '']);
    expect(chartYaml('1.0.0', '2')).toContain('version: 1.0.0');
  });
});

import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, describeCheck, terminalContentProblems, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { storageLab } from './support/storage-fixture';
import { chartFolder, chartYaml, helmLab, hm, hmOn, WEB_010 } from './support/helm-fixture';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §9–§12): helm create (the scaffold, which lints, renders and
 * installs), lint's messages, template (--show-only), package, the repository charts.example.test (repo add, list,
 * update, remove; search, pull, --untar, show) and the check helm-release.
 */
const cells = (line: string) => line.split('\t').map(c => c.trimEnd());

describe('create, lint, template and package', () => {
  it('scaffolds a chart that lints and renders like Helm\'s', () => {
    const s = hm('helm create demo', 'ls -a demo demo/templates', 'helm lint demo', 'helm template demo -s templates/service.yaml', 'helm template rel demo --set service.type=NodePort -s templates/service.yaml');
    expect(s.log[0].out).toEqual(['Creating demo']);
    expect(s.log[1].out).toEqual(['demo:', '.  ..  .helmignore  Chart.yaml  charts/  templates/  values.yaml', '', 'demo/templates:', '.  ..  NOTES.txt  _helpers.tpl  deployment.yaml  service.yaml']);
    expect(s.log[2].out).toEqual(['==> Linting demo', '[INFO] Chart.yaml: icon is recommended', '', '1 chart(s) linted, 0 chart(s) failed']);
    expect(s.log[3].out).toEqual(['---', '# Source: demo/templates/service.yaml', 'apiVersion: v1', 'kind: Service', 'metadata:', '  name: release-name-demo', '  labels:', '    helm.sh/chart: demo-0.1.0',
      '    app.kubernetes.io/name: demo', '    app.kubernetes.io/instance: release-name', '    app.kubernetes.io/version: "1.16.0"', '    app.kubernetes.io/managed-by: Helm', 'spec:', '  type: ClusterIP', '  ports:',
      '    - port: 80', '      targetPort: http', '      protocol: TCP', '      name: http', '  selector:', '    app.kubernetes.io/name: demo', '    app.kubernetes.io/instance: release-name']);
    expect(s.log[4].out[5]).toBe('  name: rel-demo');
    const run = hm('helm create demo', 'helm install demo ./demo --set image.tag=1.27 --wait', 'kubectl get deploy demo --no-headers');
    expect(run.log[1].out.slice(-6)).toEqual(['NOTES:', '1. Get the application URL by running these commands:',
      '  export POD_NAME=$(kubectl get pods --namespace default -l "app.kubernetes.io/name=demo,app.kubernetes.io/instance=demo" -o jsonpath="{.items[0].metadata.name}")',
      '  export CONTAINER_PORT=$(kubectl get pod --namespace default $POD_NAME -o jsonpath="{.spec.containers[0].ports[0].containerPort}")', '  echo "Visit http://127.0.0.1:8080 to use your application"',
      '  kubectl --namespace default port-forward $POD_NAME 8080:$CONTAINER_PORT']);
    expect(run.log[2].out[0]).toMatch(/^demo\s+1\/1\s+1\s+1\s+4s$/);
  });
  it('lints Chart.yaml, values.yaml and every rendered manifest', () => {
    const bad = { ...WEB_010, 'Chart.yaml': 'apiVersion: v2\nname: web\nversion: one\n', 'values.yaml': 'a: b\n c: d\n', 'templates/x.yaml': 'kind: ConfigMap\nmetadata:\n  name: Bad_Name\n' };
    const broken = { ...WEB_010, 'templates/y.yaml': 'a: {{ required "a is required" .Values.a }}\nb: c\n d: e\n' };
    const s = hmOn({ ...helmLab, files: [...helmLab.files ?? [], ...chartFolder('bad', bad), ...chartFolder('broken', broken)] }, 'helm lint bad', 'helm lint broken', 'helm lint nope', 'helm lint web broken');
    expect(s.log[0].out).toEqual(['==> Linting bad', '[ERROR] Chart.yaml: version \'one\' is not a valid SemVer', '[INFO] Chart.yaml: icon is recommended', '[ERROR] values.yaml: unable to parse YAML: error converting YAML to JSON: yaml: line 2: mapping values are not allowed in this context', '']);
    expect(s.log[0].err).toEqual(['Error: 1 chart(s) linted, 1 chart(s) failed']);
    expect(s.log[1].out).toEqual(['==> Linting broken', '[INFO] Chart.yaml: icon is recommended', '[ERROR] templates/y.yaml: unable to parse YAML: error converting YAML to JSON: yaml: line 3: mapping values are not allowed in this context', '']);
    expect(s.log[2].out).toEqual(['==> Linting nope', '[ERROR] Chart.yaml: unable to check Chart.yaml file in chart: stat nope/Chart.yaml: no such file or directory', '']);
    expect([s.log[3].out.at(-1), s.log[3].err]).toEqual(['', ['Error: 2 chart(s) linted, 1 chart(s) failed']]);
    expect(hm('helm template web -s templates/nope.yaml', 'helm template web --set image=x').log.map(l => l.err[0])).toEqual(['Error: could not find template templates/nope.yaml in chart',
      'Error: template: web/templates/deployment.yaml:19:28: executing "web/templates/deployment.yaml" at <.Values.image.repository>: can\'t evaluate field repository in type interface {}']);
  });
  it('packages a chart folder into an archive tar can read and helm can install', () => {
    const s = hm('helm package web', 'tar tzf web-0.1.0.tgz', 'helm install arc ./web-0.1.0.tgz', 'helm package nope', 'helm install x ./prod.yaml');
    expect(s.log[0].out).toEqual(['Successfully packaged chart and saved it to: /home/learner/web-0.1.0.tgz']);
    expect(s.log[1].out).toEqual(['web/Chart.yaml', 'web/templates/NOTES.txt', 'web/templates/_helpers.tpl', 'web/templates/configmap.yaml', 'web/templates/deployment.yaml', 'web/templates/service.yaml', 'web/values.yaml']);
    expect(s.log[2].out[0]).toBe('NAME: arc');
    expect(s.log[3].err).toEqual(['Error: stat nope: no such file or directory']);
    expect(s.log[4].err).toEqual(['Error: INSTALLATION FAILED: file \'./prod.yaml\' does not appear to be a gzipped archive; got \'text/plain; charset=utf-8\'']);
  });
});

describe('the repository charts.example.test', () => {
  it('adds, lists, updates and removes repositories; the index is cached until helm repo update', () => {
    const s = hm('helm repo list', 'helm search repo web', 'helm repo add example https://charts.example.test/', 'helm repo add example https://charts.example.test', 'helm repo add other https://charts.example.test/x',
      'helm repo list', 'helm search repo', 'sleep 60', 'helm search repo web', 'helm repo update', 'helm search repo web --versions', 'helm search repo nothing', 'helm repo remove example', 'helm repo update');
    expect(s.log.map(l => l.err[0] ?? l.out[0])).toEqual(['Error: no repositories to show', 'Error: no repositories configured', '"example" has been added to your repositories', '"example" already exists with the same configuration, skipping',
      'Error: looks like "https://charts.example.test/x" is not a valid chart repository or cannot be reached: Get "https://charts.example.test/x/index.yaml": dial tcp: lookup charts.example.test on 127.0.0.53:53: no such host',
      'NAME   \tURL                        ', 'NAME       \tCHART VERSION\tAPP VERSION\tDESCRIPTION     ', undefined, 'NAME       \tCHART VERSION\tAPP VERSION\tDESCRIPTION     ',
      'Hang tight while we grab the latest from your chart repositories...', 'NAME       \tCHART VERSION\tAPP VERSION\tDESCRIPTION     ', 'No results found', '"example" has been removed from your repositories',
      'Error: no repositories found. You must add one before updating']);
    expect(s.log[8].out.slice(1).map(cells)).toEqual([['example/web', '0.1.0', '1.27', 'A demo web chart']]);
    expect(s.log[9].out.slice(1)).toEqual(['...Successfully got an update from the "example" chart repository', 'Update Complete. ⎈Happy Helming!⎈']);
    expect(s.log[10].out.slice(1).map(cells)).toEqual([['example/web', '0.2.0', '1.28', 'A demo web chart'], ['example/web', '0.1.0', '1.27', 'A demo web chart']]);
  });
  it('pulls, untars, shows and installs repository charts by version', () => {
    const s = hm('helm repo add example https://charts.example.test', 'sleep 60', 'helm repo update', 'helm pull example/web', 'helm pull example/web --version 0.1.0 --untar --untardir charts', 'ls charts/web',
      'helm show chart example/web', 'helm show values example/web --version 0.1.0', 'helm install shop example/web --version 0.1.0', 'helm pull example/web --version 9.9.9', 'helm pull nope/web', 'helm install x example/nope', 'ls web-0.2.0.tgz');
    expect(s.log[5].out).toEqual(['Chart.yaml  templates/  values.yaml']);
    expect(s.log[6].out).toEqual(['apiVersion: v2', 'appVersion: "1.28"', 'description: A demo web chart', 'name: web', 'type: application', 'version: 0.2.0']);
    expect(s.log[7].out).toEqual(WEB_010['values.yaml'].trimEnd().split('\n'));
    expect(s.log[8].out[0]).toBe('NAME: shop');
    expect(s.log.slice(9, 12).map(l => l.err[0])).toEqual(['Error: chart "web" matching 9.9.9 not found in example index. (try \'helm repo update\'): no chart version found for web-9.9.9', 'Error: repo nope not found',
      'Error: INSTALLATION FAILED: chart "nope" matching  not found in example index. (try \'helm repo update\'): no chart name found']);
    expect(s.log[12].out).toEqual(['web-0.2.0.tgz']);
    expect(chartYaml('0.3.0', '2.0')).toContain('appVersion: "2.0"');
  });
});

describe('the check helm-release', () => {
  const ex = (checks: TerminalCheck[], solution: string[], m: TerminalMachine = helmLab) => ({ id: 'x', title: 'x', machine: m.id, statement: 'x', checks, solution, mistakes: [{ commands: ['true'], why: 'x' }], hints: [], explanation: 'x' });
  const run = (checks: TerminalCheck[], solution: string[]) => checkTerminalExercise(ex(checks, solution), [helmLab], solution).results.map(r => r.ok ? 'ok' : r.message.split('，但')[1]);
  const check: TerminalCheck = { kind: 'helm-release', name: 'web', status: 'deployed', revision: 2, chart: 'web', chartVersion: '0.1.0', appVersion: '1.27', values: { 'image.tag': '1.28', replicaCount: 3, 'service.port': 80 }, revisionsAtLeast: 2 };
  it('reads the latest revision and the computed values, and says what differs', () => {
    expect(run([check], ['helm install web ./web', 'helm upgrade web ./web -f prod.yaml'])).toEqual(['ok']);
    expect(run([check], ['helm install web ./web -f prod.yaml'])).toEqual(['它的 revision 是 1']);
    expect(run([check], ['helm install web ./web', 'helm upgrade web ./web --set image.tag=1.28'])).toEqual(['它的值 replicaCount 是 2']);
    expect(run([{ kind: 'helm-release', name: 'web', status: 'deployed' }], ['helm install web ./web --set image.tag=9.9 --wait --timeout 10s'])).toEqual(['它的狀態是 failed']);
    expect(run([{ kind: 'helm-release', name: 'web', absent: true }, { kind: 'helm-release', name: 'web', namespace: 'prod' }], ['helm install web ./web'])).toEqual(['仍然有名為 web 的 Helm release', '沒有名為 web 的 Helm release']);
    expect(describeCheck(check)).toBe('default 命名空間應該有名為 web 的 Helm release（狀態 deployed、revision 2、chart web 0.1.0、appVersion 1.27、值 image.tag=1.28、值 replicaCount=3、值 service.port=80、至少 2 個 revision）');
  });
  it('keeps kube-object and kube-workload working on what Helm created', () => {
    const checks: TerminalCheck[] = [{ kind: 'kube-workload', resource: 'Deployment', name: 'web', readyReplicas: 3, image: 'nginx:1.28' }, { kind: 'kube-object', resource: 'ConfigMap', name: 'web-config', labels: { 'app.kubernetes.io/managed-by': 'Helm' } }];
    expect(run(checks, ['helm install web ./web -f prod.yaml --wait'])).toEqual(['ok', 'ok']);
  });
  it('checks the checks', () => {
    const problems = (c: TerminalCheck, m: TerminalMachine = helmLab) => terminalContentProblems({ machines: [m], examples: [], exercises: [ex([c], ['true'], m)] });
    expect(problems({ kind: 'helm-release', name: 'web', absent: true, status: 'deployed' })).toContain('exercise x: a helm-release check with absent checks nothing else');
    expect(problems({ kind: 'helm-release', name: 'web', status: 'running' as never })[0]).toMatch(/status is one of deployed, failed, superseded/);
    expect(problems({ kind: 'helm-release', name: 'web', values: { 'a..b': 1 } })[0]).toMatch(/values map dotted paths/);
    expect(problems({ kind: 'helm-release', name: 'web', revision: 0 })[0]).toMatch(/whole numbers from 1/);
    expect(problems({ kind: 'helm-release', name: 'web' }, storageLab)).toContain('exercise x: a helm-release check needs a helm machine (engine stage E39)');
  });
});

import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, describeCheck, terminalContentProblems, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { KUBE_CONFIG_PROFILE } from '@/lib/terminal/shell';
import { session } from './support/environments-fixture';
import { deployment } from './support/workloads-fixture';
import { BOTH, cfgOn, configLab, pod, PRIVATE, withConfigFiles } from './support/config-fixture';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md §4–§5, §9): ConfigMaps and Secrets in pods — env valueFrom
 * and envFrom (prefix, invalid keys, optional, CreateContainerConfigError and its retry), configMap and secret volumes
 * (the atomic writer's layout, items, modes, subPath, FailedMount and its back-off), updates (60 s for volumes; never
 * for subPath and the environment until a new container), imagePullSecrets against the private registry, pod field
 * validation, describe, the checks kube-config, kube-pod (env, file) and kube-object, and determinism.
 */
const y = (...l: string[]) => [...l, ''].join('\n');
const cm = (name: string, more: string[]) => y('apiVersion: v1', 'kind: ConfigMap', 'metadata:', `  name: ${name}`, ...more);
const SLEEP = 'command: ["sleep", "3600"]';
const lab = withConfigFiles(configLab, {
  'cm2.yaml': cm('app-config', ['data:', '  LOG_LEVEL: info', '  config.yaml: |', '    mode: changed']),
  'nums.yaml': cm('nums', ['data:', '  1st: one', '  ok.name: two']),
  'pre.yaml': pod('pre', 'busybox:1.36', [SLEEP, 'envFrom:', '- configMapRef:', '    name: nums', '- prefix: APP_', '  configMapRef:', '    name: nums', '- secretRef:', '    name: missing', '    optional: true',
    'env:', '- name: OPT', '  valueFrom:', '    configMapKeyRef:', '      name: nums', '      key: nope', '      optional: true', '- name: PLAIN', '  value: lesson']),
  'nokey.yaml': pod('nokey', 'busybox:1.36', [SLEEP, 'env:', '- name: X', '  valueFrom:', '    secretKeyRef:', '      name: db-secret', '      key: nope']),
  'items.yaml': pod('items', 'busybox:1.36', [SLEEP, 'volumeMounts:', '- name: c', '  mountPath: /etc/c', '- name: o', '  mountPath: /etc/o'], ['volumes:', '- name: c', '  configMap:', '    name: app-config', '    defaultMode: 0400',
    '    items:', '    - key: LOG_LEVEL', '      path: conf/level', '      mode: 0600', '- name: o', '  secret:', '    secretName: nothing', '    optional: true']),
  'badkey.yaml': pod('badkey', 'busybox:1.36', [SLEEP, 'volumeMounts:', '- name: c', '  mountPath: /etc/c'], ['volumes:', '- name: c', '  configMap:', '    name: app-config', '    items:', '    - key: nope', '      path: x']),
  'dep.yaml': deployment('cfg', 'busybox:1.36', 1, [], [SLEEP, 'envFrom:', '- configMapRef:', '    name: app-config']),
  'priv.yaml': pod('priv', PRIVATE, [], ['imagePullSecrets:', '- name: regcred']),
  'invalid.yaml': pod('inv', 'busybox:1.36', ['volumeMounts:', '- name: nope', '  mountPath: /a', '- name: c', '  mountPath: /b', '  subPath: /abs', 'env:', '- name: A', '  value: x', '  valueFrom:', '    configMapKeyRef:', '      name: c',
    '      key: k', 'envFrom:', '- prefix: "1x"'], ['volumes:', '- name: c', '  configMap:', '    name: c', '    defaultMode: 1000']),
  'empty.yaml': pod('e', 'busybox:1.36', [], ['volumes:', '- name: d', '  emptyDir: {}']),
  'field.yaml': pod('f', 'busybox:1.36', ['env:', '- name: N', '  valueFrom:', '    fieldRef:', '      fieldPath: metadata.name']),
});
const go = (...commands: string[]) => cfgOn(lab, ...commands);
const events = (lines: string[]) => lines.slice(lines.findIndex(l => l.startsWith('Events:')) + 3).map(l => l.trim().replace(/\s{2,}/g, ' | '));

describe('the environment from ConfigMaps and Secrets', () => {
  it('resolves envFrom and secretKeyRef when the container is created, so the program that needs them runs', () => {
    const s = go(BOTH, 'kubectl apply -f k8s/env.yaml', 'sleep 2', 'kubectl logs env', 'kubectl exec env -- printenv DB_PASSWORD LOG_LEVEL', 'kubectl exec env -- printenv NOPE', 'kubectl exec env -- env');
    expect(s.log[3].out).toEqual(['app ready']);
    expect(s.log[4].out).toEqual(['lesson-pass-123', 'debug']);
    expect([s.log[5].out, s.log[5].err, s.log[5].status]).toEqual([[], ['command terminated with exit code 1'], 1]);
    expect(s.log[6].out.slice(0, 5)).toEqual(['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOSTNAME=env', 'LOG_LEVEL=debug', 'config.yaml=mode: lesson', 'replicas: 2']);
  });
  it('is CreateContainerConfigError while a source is missing, tried again every 10 s', () => {
    const s = go('kubectl apply -f k8s/env.yaml', 'sleep 25', 'kubectl get pod env', 'kubectl describe pod env', 'kubectl logs env', 'kubectl apply -f k8s/cm.yaml', 'sleep 10', 'kubectl describe pod env',
      'kubectl apply -f k8s/secret.yaml', 'sleep 10', 'kubectl get pod env');
    expect(s.log[2].out[1]).toMatch(/^env\s+0\/1\s+CreateContainerConfigError\s+0\s+25s$/);
    expect(events(s.log[3].out)).toEqual(['Normal | Scheduled | 25s | default-scheduler | Successfully assigned default/env to node-02',
      'Normal | Pulled | 5s (x3 over 25s) | kubelet | Container image "team/app:1.0" already present on machine', 'Warning | Failed | 5s (x3 over 25s) | kubelet | Error: configmap "app-config" not found']);
    expect(s.log[4].err).toEqual(['Error from server (BadRequest): container "env" in pod "env" is waiting to start: CreateContainerConfigError']);
    expect(events(s.log[7].out).at(-1)).toBe('Warning | Failed | 5s | kubelet | Error: secret "db-secret" not found');
    expect(s.log[10].out[1]).toMatch(/^env\s+1\/1\s+Running\s+0\s+45s$/);
    expect(events(go(BOTH, 'kubectl apply -f k8s/nokey.yaml', 'sleep 3', 'kubectl describe pod nokey').log[3].out).at(-1)).toBe("Warning | Failed | 1s | kubelet | Error: couldn't find key nope in Secret default/db-secret");
  });
  it('applies the prefix, skips invalid names with the kubelet\'s event, and leaves out optional references', () => {
    const s = go('kubectl apply -f k8s/nums.yaml -f k8s/pre.yaml', 'sleep 3', 'kubectl exec pre -- env', 'kubectl events --for pod/pre --types=Warning');
    expect(s.log[2].out.slice(2, 6)).toEqual(['ok.name=two', 'APP_1st=one', 'APP_ok.name=two', 'PLAIN=lesson']);
    expect(s.log[2].out.some(l => /^(1st|OPT)=/.test(l))).toBe(false);
    expect(s.log[3].out[1]).toMatch(/InvalidEnvironmentVariableNames\s+Pod\/pre\s+Keys \[1st\] from the EnvFrom configMap default\/nums were skipped since they are considered invalid environment variable names\.$/);
  });
});

describe('configMap and secret volumes', () => {
  it('writes the files like the atomic writer (a timestamped folder, ..data, links), with items, modes and subPath', () => {
    const s = go(BOTH, 'kubectl apply -f k8s/vol.yaml -f k8s/items.yaml', 'sleep 3', 'kubectl exec vol -- ls -a /etc/app', 'kubectl exec vol -- cat /etc/app/config.yaml /etc/creds/DB_USER /etc/sub/config.yaml',
      'kubectl exec items -- ls -l /etc/c/..data/conf', 'kubectl exec items -- cat /etc/c/conf/level', 'kubectl exec items -- ls -a /etc/o', "kubectl get pod items -o jsonpath='{.spec.volumes[0].configMap.defaultMode} {.spec.volumes[1].secret.defaultMode}'");
    expect(s.log[3].out).toEqual(['.', '..', s.log[3].out[2], '..data', 'LOG_LEVEL', 'config.yaml']);
    expect(s.log[3].out[2]).toMatch(/^\.\.2026_11_24_10_00_00\.\d{1,9}$/);
    expect(s.log[4].out).toEqual(['mode: lesson', 'replicas: 2', 'demomode: lesson', 'replicas: 2']);
    expect(s.log[5].out[0]).toMatch(/^-rw------- +root +root +5 /);
    expect(s.log[6].out).toEqual(['debug']);
    expect(s.log[7].out).toEqual(['.', '..', `..${s.log[7].out[2].slice(2)}`, '..data']);
    expect(s.log[8].out).toEqual(['256 420']);
  });
  it('waits in ContainerCreating with FailedMount events (back-off 1, 2, 4… s) until the source exists, or names a missing item key', () => {
    const s = go('kubectl apply -f k8s/vol.yaml', 'sleep 10', 'kubectl get pod vol', 'kubectl describe pod vol', 'kubectl apply -f k8s/cm.yaml -f k8s/secret.yaml', 'sleep 4', 'kubectl get pod vol', 'sleep 3', 'kubectl get pod vol');
    expect(s.log[2].out[1]).toMatch(/^vol\s+0\/1\s+ContainerCreating\s+0\s+10s$/);
    expect(events(s.log[3].out)).toEqual(['Normal | Scheduled | 10s | default-scheduler | Successfully assigned default/vol to node-02',
      'Warning | FailedMount | 3s (x4 over 10s) | kubelet | MountVolume.SetUp failed for volume "config" : configmap "app-config" not found',
      'Warning | FailedMount | 3s (x4 over 10s) | kubelet | MountVolume.SetUp failed for volume "creds" : secret "db-secret" not found']);
    expect(s.log[6].out[1]).toMatch(/ContainerCreating/);
    expect(s.log[8].out[1]).toMatch(/^vol\s+1\/1\s+Running\s+0\s+17s$/);
    expect(events(go(BOTH, 'kubectl apply -f k8s/badkey.yaml', 'sleep 1', 'kubectl describe pod badkey').log[3].out).at(-1)).toBe('Warning | FailedMount | 0s (x2 over 1s) | kubelet | MountVolume.SetUp failed for volume "c" : configmap references non-existent config key: nope');
  });
  it('shows a change 60 s later in a mounted volume, never in a subPath file or the environment; a new container gets it', () => {
    const s = go(BOTH, 'kubectl apply -f k8s/vol.yaml -f k8s/env.yaml -f k8s/dep.yaml', 'sleep 5', 'kubectl apply -f k8s/cm2.yaml', 'sleep 59', 'kubectl exec vol -- cat /etc/app/LOG_LEVEL', 'sleep 1',
      'kubectl exec vol -- cat /etc/app/LOG_LEVEL /etc/sub/config.yaml', 'kubectl exec vol -- ls -a /etc/app', 'kubectl exec env -- printenv LOG_LEVEL', 'kubectl rollout restart deploy/cfg', 'sleep 40',
      'kubectl get pods -l app=cfg -o name');
    expect(s.log[5].out).toEqual(['debug']);
    expect(s.log[7].out).toEqual(['infomode: lesson', 'replicas: 2']);
    expect(s.log[8].out[2]).toMatch(/^\.\.2026_11_24_10_01_05\.\d{1,9}$/);
    expect(s.log[9].out).toEqual(['debug']);
    expect(s.log[12].out).toHaveLength(1);
    const env = session(s.state, KUBE_CONFIG_PROFILE, `kubectl exec ${s.log[12].out[0].slice(4)} -- env`);
    expect(env.log.at(-1)!.out).toContain('LOG_LEVEL=info');
  });
});

describe('imagePullSecrets against the private registry', () => {
  const pull = (...setup: string[]) => go(...setup, 'kubectl apply -f k8s/priv.yaml', 'sleep 3', 'kubectl describe pod priv');
  const failed = (lines: string[]) => events(lines).find(l => l.includes('Failed to pull'))!.split(' | ').at(-1);
  it('fails without a login, with a wrong token or a user without the repository, and pulls with the right one', () => {
    const none = pull();
    expect(events(none.log[2].out).slice(1, 3)).toEqual(['Warning | FailedToRetrieveImagePullSecret | 3s | kubelet | Unable to retrieve some image pull secrets (regcred); attempting to pull the image may not succeed.',
      `Normal | Pulling | 3s | kubelet | Pulling image "${PRIVATE}"`]);
    const ref = `failed to pull and unpack image "${PRIVATE}": failed to resolve reference "${PRIVATE}"`;
    expect(failed(none.log[2].out)).toBe(`Failed to pull image "${PRIVATE}": rpc error: code = Unknown desc = ${ref}: pull access denied, repository does not exist or may require authorization: authorization failed: no basic auth credentials`);
    const reg = (user: string, token: string) => `kubectl create secret docker-registry regcred --docker-server=registry.example.com:5000 --docker-username=${user} --docker-password=${token}`;
    expect(failed(pull(reg('ci-bot', 'lesson-wrong-token')).log[3].out)).toBe(`Failed to pull image "${PRIVATE}": rpc error: code = Unknown desc = ${ref}: unexpected status from HEAD request to https://registry.example.com:5000/v2/team/private/manifests/1.0: 401 Unauthorized`);
    expect(failed(pull(reg('other', 'lesson-fake-token-2')).log[3].out)).toBe(`Failed to pull image "${PRIVATE}": rpc error: code = Unknown desc = ${ref}: pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed`);
    const ok = pull(reg('ci-bot', 'lesson-fake-token-1'));
    expect(events(ok.log[3].out).slice(1)).toEqual([`Normal | Pulling | 3s | kubelet | Pulling image "${PRIVATE}"`, `Normal | Pulled | 1s | kubelet | Successfully pulled image "${PRIVATE}" in 2s (2s including waiting). Image size: 5000000 bytes.`,
      'Normal | Created | 1s | kubelet | Created container: priv', 'Normal | Started | 1s | kubelet | Started container priv']);
    const later = go('kubectl apply -f k8s/priv.yaml', 'sleep 2', reg('ci-bot', 'lesson-fake-token-1'), 'sleep 20', 'kubectl get pod priv');
    expect(later.log[4].out[1]).toMatch(/^priv\s+1\/1\s+Running\s+0\s+22s$/);
  });
});

describe('pod fields and describe', () => {
  it('validates volumes, mounts, env and envFrom; other volumes and the downward API are later or prose', () => {
    const s = go('kubectl apply -f k8s/invalid.yaml', 'kubectl apply -f k8s/empty.yaml', 'kubectl apply -f k8s/field.yaml');
    expect(s.log[0].err).toEqual(['The Pod "inv" is invalid: ', '* spec.volumes[0].configMap.defaultMode: Invalid value: 1000: must be a number between 0 and 0777 (octal), both inclusive',
      '* spec.containers[0].volumeMounts[0].name: Not found: "nope"', '* spec.containers[0].volumeMounts[1].subPath: Invalid value: "/abs": must be a relative path',
      '* spec.containers[0].env[0].valueFrom: Invalid value: "": may not be specified when `value` is not empty',
      '* spec.containers[0].envFrom[0].prefix: Invalid value: "1x": a valid environment variable name must consist of alphabetic characters, digits, \'_\', \'-\', or \'.\', and must not start with a digit (e.g. \'my.env-name\',  or \'MY_ENV.NAME\',  or \'MyEnvName1\', regex used for validation is \'[-._a-zA-Z][-._a-zA-Z0-9]*\')',
      '* spec.containers[0].envFrom[0]: Invalid value: "": must specify one of: `configMapRef` or `secretRef`']);
    expect(s.log[1].err).toEqual(['（模擬環境：spec.volumes[0] 要到引擎階段 E38 才模擬）']);
    expect(s.log[2].err).toEqual(['（模擬環境：spec.containers[0].env[0].valueFrom.fieldRef 要到引擎階段 （課文說明） 才模擬）']);
  });
});

const exercise = (checks: TerminalCheck[], solution: string[], machine: TerminalMachine = lab) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: machine.id, statement: '', checks, solution: [], mistakes: [], hints: [], explanation: '' }, [machine], solution);
const content = (checks: TerminalCheck[], machine: TerminalMachine = lab) => terminalContentProblems({ machines: [machine], examples: [], exercises: [
  { id: 'w', title: 'x', machine: machine.id, statement: 'x', checks, solution: [BOTH], mistakes: [{ commands: ['kubectl get cm'], why: 'x' }], hints: [], explanation: 'x' }] });
const SECRET_FILE = '/home/learner/k8s/secret.yaml';

describe('the checks kube-config, kube-pod and kube-object', () => {
  it('pass on what the commands made and say why not otherwise, never printing a Secret\'s value', () => {
    const checks: TerminalCheck[] = [{ kind: 'kube-config', resource: 'Secret', name: 'db-secret', type: 'Opaque', keys: ['DB_PASSWORD'], values: [{ key: 'DB_USER', equals: 'demo' }], immutable: false },
      { kind: 'kube-config', resource: 'ConfigMap', name: 'app-config', values: [{ key: 'LOG_LEVEL', equals: 'debug' }] }, { kind: 'kube-pod', name: 'env', env: ['DB_PASSWORD', 'lesson-pass-123'] },
      { kind: 'kube-pod', name: 'vol', file: { path: '/etc/app/LOG_LEVEL', content: 'debug' } }, { kind: 'kube-object', resource: 'ConfigMap', name: 'app-config', fields: [{ path: '.data.LOG_LEVEL', equals: 'debug' }] }];
    expect(exercise(checks, [BOTH, 'kubectl apply -f k8s/env.yaml -f k8s/vol.yaml', 'sleep 5']).results.filter(r => !r.ok)).toEqual([]);
    const early = exercise(checks, ['kubectl apply -f k8s/env.yaml -f k8s/vol.yaml -f k8s/cm2.yaml', 'sleep 5']).results.map(r => r.ok ? 'ok' : r.message.split('，但')[1]);
    expect(early).toEqual(['沒有名為 db-secret 的 Secret', 'app-config 的 LOG_LEVEL 是「info」', 'env 沒有環境變數 DB_PASSWORD', 'vol 的容器沒有在執行', '它的 .data.LOG_LEVEL 是 info']);
    const more = exercise([{ kind: 'kube-config', resource: 'Secret', name: 'db-secret', values: [{ key: 'DB_PASSWORD', equals: 'x' }] }, { kind: 'kube-config', resource: 'Secret', name: 'db-secret', immutable: true },
      { kind: 'kube-config', resource: 'Secret', name: 'db-secret', notPlainIn: { file: SECRET_FILE } }, { kind: 'kube-config', resource: 'Secret', name: 'db-secret', type: 'kubernetes.io/tls' },
      { kind: 'kube-config', resource: 'ConfigMap', name: 'app-config', absent: true }, { kind: 'kube-config', resource: 'Secret', name: 'db-secret', keys: ['nope'] }], [BOTH]);
    expect(more.results.map(r => r.message.split('，但')[1])).toEqual(['db-secret 的 DB_PASSWORD 不是題目要的值', 'db-secret 不是不可變更的（沒有 immutable: true）', `${SECRET_FILE} 裡有 DB_PASSWORD 的明文值`,
      'db-secret 的類型是 Opaque', '仍然有名為 app-config 的 ConfigMap', 'db-secret 沒有 nope']);
    expect(exercise([{ kind: 'kube-config', resource: 'Secret', name: 'db', notPlainIn: { file: SECRET_FILE } }], ['kubectl create secret generic db --from-literal=pw=lesson-only-here']).results[0].ok).toBe(true);
  });
  it('are described in words and validated', () => {
    expect(describeCheck({ kind: 'kube-config', resource: 'Secret', name: 'db', type: 'Opaque', keys: ['pw'], values: [{ key: 'user', equals: 'demo' }], immutable: true, notPlainIn: { file: SECRET_FILE } }))
      .toBe(`default 命名空間應該有名為 db 的 Secret（類型 Opaque、有 pw、user 的值是「demo」、不可變更（immutable）、${SECRET_FILE} 裡沒有它的明文值）`);
    expect(describeCheck({ kind: 'kube-config', resource: 'ConfigMap', name: 'c', namespace: 'dev', absent: true })).toBe('dev 命名空間應該沒有名為 c 的 ConfigMap');
    expect(content([{ kind: 'kube-config', resource: 'ConfigMap', name: 'c', type: 'Opaque' }])).toContain('exercise w: a kube-config check\'s type is a Secret\'s: Opaque, kubernetes.io/tls, kubernetes.io/dockerconfigjson');
    expect(content([{ kind: 'kube-config', resource: 'Secret', name: 'c', notPlainIn: { file: 'k8s/s.yaml' } }])).toContain('exercise w: a kube-config check\'s notPlainIn is a Secret\'s { file: an absolute path, keys? }');
    expect(content([{ kind: 'kube-config', resource: 'Secret', name: 'c', absent: true, keys: ['a'] }])).toContain('exercise w: a kube-config check with absent checks nothing else');
    const lower: TerminalMachine = { ...lab, profile: 'kube-net', docker: { images: lab.docker!.images!.filter(i => i.name !== 'team/app:1.0'), registries: lab.docker!.registries } };
    expect(content([{ kind: 'kube-config', resource: 'Secret', name: 'c' }, { kind: 'kube-object', resource: 'Secret', name: 'c' }], lower)).toEqual(expect.arrayContaining([
      'exercise w: a kube-config check needs a kube-config machine (engine stage E36)', 'exercise w: a kube-object check of a Secret needs a kube-config machine (engine stage E36)']));
    expect(content([{ kind: 'kube-config', resource: 'Secret', name: 'db-secret', keys: ['DB_USER'] }, { kind: 'kube-object', resource: 'Secret', name: 'db-secret' }])).toEqual([]);
  });
  it('is deterministic: the same commands give the same cluster', () => {
    const run = () => go(BOTH, 'kubectl apply -f k8s/vol.yaml', 'sleep 3', 'kubectl apply -f k8s/cm2.yaml', 'sleep 61', 'kubectl exec vol -- ls -a /etc/app', 'kubectl get cm,secret,pods -o yaml');
    expect(run().log.map(l => l.out)).toEqual(run().log.map(l => l.out));
  });
});

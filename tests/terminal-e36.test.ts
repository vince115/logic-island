import { describe, expect, it } from 'vitest';
import { COMPOSE_PROFILE, E36_COMMANDS, KUBE_CONFIG_PROFILE, KUBE_NET_PROFILE, PROFILES } from '@/lib/terminal/shell';
import { machineProblems, profileOf } from '@/lib/terminal/lesson';
import { goUnbase64 } from '@/lib/terminal/kube-config-spec';
import { readManifests, toJson } from '@/lib/terminal/kube-manifest';
import { parseYaml, parseYamlDocuments } from '@/lib/terminal/yaml';
import { session } from './support/environments-fixture';
import { composeLab, COMPOSE_YAML } from './support/compose-fixture';
import { BOTH, cfg, cfgOn, configLab, WEB_CRT, WEB_KEY, withConfigFiles } from './support/config-fixture';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md): the kube-config profile — ConfigMap and Secret objects
 * (stringData, base64 data, types, keys, immutable, kube-root-ca.crt), get and describe, kubectl create configmap and
 * create secret generic|tls|docker-registry, and the base64 command. Pods (env, volumes, updates, imagePullSecrets) and
 * the checks are in terminal-e36-pods.test.ts.
 */
const y = (...l: string[]) => [...l, ''].join('\n');
const cm = (name: string, more: string[]) => y('apiVersion: v1', 'kind: ConfigMap', 'metadata:', `  name: ${name}`, ...more);
const secret = (name: string, more: string[]) => y('apiVersion: v1', 'kind: Secret', 'metadata:', `  name: ${name}`, ...more);
const lab0 = withConfigFiles(configLab, {
  'frozen.yaml': cm('frozen', ['immutable: true', 'data:', '  a: "1"']), 'frozen2.yaml': cm('frozen', ['immutable: true', 'data:', '  a: "2"']), 'thaw.yaml': cm('frozen', ['data:', '  a: "1"']),
  'bad64.yaml': secret('b', ['data:', '  x: "abc!"']), 'pad.yaml': secret('p', ['data:', '  x: "YQ="']), 'num.yaml': cm('n', ['data:', '  port: 8080']), 'nums.yaml': secret('n', ['data:', '  port: 8080']),
  'bin.yaml': cm('bin', ['binaryData:', '  x: AAEC']), 'basic.yaml': secret('ba', ['type: kubernetes.io/basic-auth', 'stringData:', '  username: demo']),
  'tls.yaml': secret('t', ['type: kubernetes.io/tls', 'data:', '  tls.crt: ""']), 'dcj.yaml': secret('d', ['type: kubernetes.io/dockerconfigjson', 'stringData:', '  .dockerconfigjson: "{not json"']),
  'keys.yaml': cm('k', ['data:', '  "bad key": x']), 'Bad.yaml': cm('Bad_Name', ['data:', '  a: b']), 'retype.yaml': secret('db-secret', ['type: kubernetes.io/tls', 'stringData:', '  tls.crt: x', '  tls.key: y']),
  'secret2.yaml': secret('db-secret', ['type: Opaque', 'stringData:', '  DB_PASSWORD: lesson-pass-456']),
  'app.env': '# lesson settings\nLOG_LEVEL=info\n  MODE="quoted"\n\nEMPTY\n', 'bad.env': 'GOOD=1\n1BAD=2\n',
  'conf/a.txt': 'alpha\n', 'conf/b.txt': 'beta\n',
});
const lab = { ...lab0, files: [...configLab.files!, { path: '/home/learner/k8s/conf', kind: 'dir' as const, mode: 0o755, owner: 'learner' }, ...lab0.files!.slice(configLab.files!.length)] };
const go = (...commands: string[]) => cfgOn(lab, ...commands);
const errs = (s: ReturnType<typeof cfg>) => s.log.map(l => l.err.join('\n'));

describe('the kube-config profile', () => {
  it('is the kube-net profile with base64 and the kube-config feature', () => {
    expect(E36_COMMANDS).toEqual(['base64']);
    expect(KUBE_CONFIG_PROFILE.commands).toEqual([...KUBE_NET_PROFILE.commands.filter(c => !['man', 'clear', 'help'].includes(c)), 'base64', 'man', 'clear', 'help']);
    expect(KUBE_CONFIG_PROFILE.features).toEqual([...KUBE_NET_PROFILE.features!, 'kube-config']);
    expect(PROFILES['kube-config']).toBe(KUBE_CONFIG_PROFILE);
    expect(profileOf(configLab)).toBe(KUBE_CONFIG_PROFILE);
    expect(machineProblems(configLab)).toEqual([]);
  });
  it('below it ConfigMaps, Secrets, their pod fields, the new flags and base64 are later stages, as before', () => {
    const s = session({ ...configLab, profile: 'kube-net' }, KUBE_NET_PROFILE, 'kubectl apply -f k8s/cm.yaml', 'kubectl apply -f k8s/secret.yaml', 'kubectl get cm', 'kubectl get secrets', 'kubectl create configmap x',
      'kubectl create secret generic x', 'kubectl apply -f k8s/env.yaml', 'kubectl apply -f k8s/vol.yaml', 'kubectl run x --image=busybox:1.36 --from-literal=a=b', 'echo hi | base64');
    expect(errs(s)).toEqual(['（模擬環境：ConfigMap 要到引擎階段 E36 才模擬）', '（模擬環境：Secret 要到引擎階段 E36 才模擬）', '（模擬環境：cm 要到引擎階段 E36 才模擬）', '（模擬環境：secrets 要到引擎階段 E36 才模擬）',
      '（模擬環境：kubectl create configmap 要到引擎階段 E36 才模擬）', '（模擬環境：kubectl create secret 要到引擎階段 E36 才模擬）', '（模擬環境：spec.containers[0].envFrom 要到引擎階段 E36 才模擬）',
      '（模擬環境：spec.volumes[0] 要到引擎階段 E36/E38 才模擬）', "error: unknown flag: --from-literal\nSee 'kubectl run --help' for usage.", s.log[9].err[0]]);
    expect(s.log[9].err[0]).toMatch(/^bash: base64: command not found/);
    expect(machineProblems({ ...configLab, profile: 'kube-net' })[0]).toMatch(/^machine kub-36: image team\/app:1.0: commands are among .* nslookup wget$/);
  });
});

describe('octal integers (0644) only in kube-config manifests', () => {
  it('reads 0644 as 420 in a kube-config manifest and leaves every other YAML reader as before', () => {
    // The shared parser (Compose files and workflows read its scalars) keeps the text; kubeconfig and lower profiles stay decimal.
    const first = (y0: ReturnType<typeof parseYaml>) => y0.t === 'map' ? y0.m[0][1] : y0;
    expect(first(parseYaml('mode: 0644'))).toMatchObject({ t: 'str', v: '0644', q: false });
    expect(first(parseYamlDocuments('a: 0644\n---\nb: 1\n')[0])).toMatchObject({ t: 'str', v: '0644', q: false });
    expect(toJson(parseYaml('mode: 0644'))).toEqual({ mode: 644 });
    const doc = (octal: boolean) => (readManifests('apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: x\nmode: 0644\n', 'x.yaml', octal) as { doc: object }[])[0].doc;
    expect([doc(false), doc(true)].map(d => (d as { mode: number }).mode)).toEqual([644, 420]);
    const grace = (profile: 'kube-net' | 'kube-config') => session({ ...withConfigFiles(configLab, { 'g.yaml': y('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: g', 'spec:', '  terminationGracePeriodSeconds: 030', '  containers:', '  - name: g', '    image: busybox:1.36') }), profile },
      profile === 'kube-net' ? KUBE_NET_PROFILE : KUBE_CONFIG_PROFILE, 'kubectl apply -f k8s/g.yaml', "kubectl get pod g -o jsonpath='{.spec.terminationGracePeriodSeconds}'").log[1].out;
    expect([grace('kube-net'), grace('kube-config')]).toEqual([['30'], ['24']]);
    const compose = { ...composeLab, files: composeLab.files!.map(f => f.path.endsWith('compose.yaml') ? { ...f, content: COMPOSE_YAML.replace('    image: redis:7.4', '    image: redis:7.4\n    environment:\n      UMASK: 0644') } : f) };
    expect(session(compose, COMPOSE_PROFILE, 'cd shop', 'docker compose config').last.out.filter(l => l.includes('UMASK'))).toEqual(['      UMASK: "0644"']);
  });
});

describe('ConfigMap and Secret objects', () => {
  it('stores a Secret\'s stringData base64-encoded in data (write-only), lists and describes them, never printing a value', () => {
    const s = go(BOTH, 'sleep 60', 'kubectl get cm', 'kubectl get secret', 'kubectl get secret db-secret -o yaml', 'kubectl describe secret db-secret', 'kubectl describe cm app-config',
      "kubectl get secret db-secret -o jsonpath='{.data.DB_PASSWORD}'", "kubectl get secret db-secret -o jsonpath='{.data.DB_PASSWORD}' | base64 -d", 'kubectl get cm,secret -o name');
    expect(s.log[0].out).toEqual(['configmap/app-config created', 'secret/db-secret created']);
    expect(s.log[2].out).toEqual(['NAME               DATA      AGE', 'app-config         2         60s', 'kube-root-ca.crt   1         30d']);
    expect(s.log[3].out).toEqual(['NAME        TYPE      DATA      AGE', 'db-secret   Opaque    2         60s']);
    expect(s.log[4].out.filter(l => !/^ {2}(creationTimestamp|resourceVersion|uid):/.test(l))).toEqual(['apiVersion: v1', 'data:', '  DB_PASSWORD: bGVzc29uLXBhc3MtMTIz', '  DB_USER: ZGVtbw==', 'kind: Secret', 'metadata:', '  annotations:',
      '    kubectl.kubernetes.io/last-applied-configuration: |',
      '      {"apiVersion":"v1","kind":"Secret","metadata":{"annotations":{},"name":"db-secret","namespace":"default"},"stringData":{"DB_PASSWORD":"lesson-pass-123","DB_USER":"demo"},"type":"Opaque"}',
      '  name: db-secret', '  namespace: default', 'type: Opaque']);
    expect(s.log[5].out).toEqual(['Name:         db-secret', 'Namespace:    default', 'Labels:       <none>', 'Annotations:  <none>', '', 'Type:  Opaque', '', 'Data', '====', 'DB_PASSWORD:  15 bytes', 'DB_USER:      4 bytes']);
    expect(s.log[6].out).toEqual(['Name:         app-config', 'Namespace:    default', 'Labels:       <none>', 'Annotations:  <none>', '', 'Data', '====', 'LOG_LEVEL:', '----', 'debug', '', 'config.yaml:', '----',
      'mode: lesson', 'replicas: 2', '', '', '', 'BinaryData', '====', '', 'Events:  <none>']);
    expect(s.log[7].out).toEqual(['bGVzc29uLXBhc3MtMTIz']);
    expect(s.log[8].out).toEqual(['lesson-pass-123']);
    expect(s.log[9].out).toEqual(['configmap/app-config', 'configmap/kube-root-ca.crt', 'secret/db-secret']);
  });
  it('merges stringData again on apply (a key the last apply had stays in data) and keeps a Secret\'s type', () => {
    const s = go(BOTH, 'kubectl apply -f k8s/secret2.yaml', "kubectl get secret db-secret -o jsonpath='{.data}'", 'kubectl apply -f k8s/retype.yaml');
    expect(s.log[1].out).toEqual(['secret/db-secret configured']);
    expect(s.log[2].out).toEqual(['{"DB_PASSWORD":"bGVzc29uLXBhc3MtNDU2","DB_USER":"ZGVtbw=="}']);
    expect(s.log[3].err).toEqual(['The Secret "db-secret" is invalid: type: Invalid value: "kubernetes.io/tls": field is immutable']);
  });
  it('refuses data changes of an immutable ConfigMap, and making it mutable again', () => {
    const s = go('kubectl apply -f k8s/frozen.yaml', 'kubectl apply -f k8s/frozen2.yaml', 'kubectl apply -f k8s/thaw.yaml', 'kubectl apply -f k8s/frozen.yaml', 'kubectl delete cm frozen', 'kubectl apply -f k8s/frozen2.yaml');
    expect(s.log.map(l => [...l.out, ...l.err].join('\n'))).toEqual(['configmap/frozen created', 'The ConfigMap "frozen" is invalid: data: Forbidden: field is immutable when `immutable` is set',
      'The ConfigMap "frozen" is invalid: immutable: Forbidden: field is immutable when `immutable` is set', 'configmap/frozen unchanged',
      'configmap "frozen" deleted', 'configmap/frozen created']);
  });
  it('decodes strictly and validates as the API server does', () => {
    expect(errs(go('kubectl apply -f k8s/bad64.yaml', 'kubectl apply -f k8s/pad.yaml', 'kubectl apply -f k8s/num.yaml', 'kubectl apply -f k8s/nums.yaml', 'kubectl apply -f k8s/keys.yaml', 'kubectl apply -f k8s/Bad.yaml',
      'kubectl apply -f k8s/tls.yaml', 'kubectl apply -f k8s/dcj.yaml', 'kubectl apply -f k8s/bin.yaml', 'kubectl apply -f k8s/basic.yaml'))).toEqual([
      'Error from server (BadRequest): error when creating "k8s/bad64.yaml": Secret in version "v1" cannot be handled as a Secret: illegal base64 data at input byte 3',
      'Error from server (BadRequest): error when creating "k8s/pad.yaml": Secret in version "v1" cannot be handled as a Secret: illegal base64 data at input byte 3',
      'Error from server (BadRequest): error when creating "k8s/num.yaml": ConfigMap in version "v1" cannot be handled as a ConfigMap: json: cannot unmarshal number into Go struct field ConfigMap.data of type string',
      'Error from server (BadRequest): error when creating "k8s/nums.yaml": Secret in version "v1" cannot be handled as a Secret: json: cannot unmarshal number into Go struct field Secret.data of type []uint8',
      'The ConfigMap "k" is invalid: data[bad key]: Invalid value: "bad key": a valid config key must consist of alphanumeric characters, \'-\', \'_\' or \'.\' (e.g. \'key.name\',  or \'KEY_NAME\',  or \'key-name\', regex used for validation is \'[-._a-zA-Z0-9]+\')',
      'The ConfigMap "Bad_Name" is invalid: metadata.name: Invalid value: "Bad_Name": a lowercase RFC 1123 subdomain must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character (e.g. \'example.com\', regex used for validation is \'[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*\')',
      'The Secret "t" is invalid: data[tls.key]: Required value', 'The Secret "d" is invalid: data[.dockerconfigjson]: Invalid value: "<secret contents redacted>": invalid character in JSON',
      '（模擬環境：ConfigMap 的 binaryData 只在課文說明；請把文字放在 data）', '（模擬環境：Secret 的 type kubernetes.io/basic-auth 只在課文說明；模擬的類型是 Opaque、kubernetes.io/tls、kubernetes.io/dockerconfigjson）']);
    expect([goUnbase64('YWJj'), goUnbase64('YW\nJj'), goUnbase64('YQ=='), goUnbase64('YQ'), goUnbase64('YQ==x'), goUnbase64('Y===')]).toEqual([
      { bytes: new Uint8Array([97, 98, 99]) }, { bytes: new Uint8Array([97, 98, 99]) }, { bytes: new Uint8Array([97]) }, { at: 0 }, { at: 4 }, { at: 1 }]);
  });
  it('gives every namespace kube-root-ca.crt, a new one too', () => {
    const s = go('kubectl create namespace dev', 'kubectl get cm -A', "kubectl get cm kube-root-ca.crt -n dev -o jsonpath='{.data.ca\\.crt}'");
    expect(s.log[1].out).toEqual(['NAMESPACE         NAME               DATA      AGE', 'default           kube-root-ca.crt   1         30d', 'dev               kube-root-ca.crt   1         0s',
      'kube-node-lease   kube-root-ca.crt   1         30d', 'kube-public       kube-root-ca.crt   1         30d', 'kube-system       kube-root-ca.crt   1         30d']);
    expect(s.log[2].out[0]).toMatch(/^-----BEGIN CERTIFICATE-----$/);
    expect(cfg('kubectl get secrets').log[0].err).toEqual(['No resources found in default namespace.']);
  });
});

describe('kubectl create configmap and create secret', () => {
  it('builds a ConfigMap from literals, files, a folder and an env file', () => {
    const s = go("kubectl create configmap a --from-literal=greeting='hello there' --from-literal=n=1 --from-file=k8s/web.crt --from-file=extra=k8s/conf/a.txt --dry-run=client -o yaml",
      'kubectl create cm conf --from-file=k8s/conf', 'kubectl get cm conf -o jsonpath={.data}', 'kubectl create configmap env --from-env-file=k8s/app.env -n default --dry-run=client -o yaml');
    expect(s.log[0].out.slice(0, 5)).toEqual(['apiVersion: v1', 'data:', '  extra: |', '    alpha', '  greeting: hello there']);
    expect(s.log[0].out.slice(5)).toContain('  "n": "1"');
    expect(s.log[0].out.slice(-4)).toEqual(['kind: ConfigMap', 'metadata:', '  creationTimestamp: null', '  name: a']);
    expect(s.log[1].out).toEqual(['configmap/conf created']);
    expect(s.log[2].out).toEqual(['{"a.txt":"alpha\\n","b.txt":"beta\\n"}']);
    expect(s.log[3].out).toEqual(['apiVersion: v1', 'data:', '  EMPTY: ""', '  LOG_LEVEL: info', '  MODE: \'"quoted"\'', 'kind: ConfigMap', 'metadata:', '  creationTimestamp: null', '  name: env', '  namespace: default']);
  });
  it('reports kubectl\'s errors', () => {
    expect(errs(go('kubectl create configmap', 'kubectl create cm x --from-literal=novalue', 'kubectl create cm x --from-literal=a=1 --from-literal=a=2', "kubectl create cm x --from-literal='bad key=1'",
      'kubectl create cm x --from-file=k8s/nope.txt', 'kubectl create cm x --from-env-file=k8s/app.env --from-literal=a=1', 'kubectl create cm x --from-env-file=k8s/bad.env', 'kubectl create cm x --from-file=k=k8s/conf',
      'kubectl create cm app --from-literal=a=1', 'kubectl create cm app --from-literal=a=2', 'kubectl create secret', 'kubectl create secret opaque x', 'kubectl create secret generic s --from-literal=a=1 --from-literal=a=2'))).toEqual([
      'error: exactly one NAME is required, got 0', 'error: invalid literal source novalue, expected key=value', 'error: cannot add key "a", another key by that name already exists in Data for ConfigMap "x"',
      'error: "bad key" is not a valid key name for a ConfigMap: a valid config key must consist of alphanumeric characters, \'-\', \'_\' or \'.\' (e.g. \'key.name\',  or \'KEY_NAME\',  or \'key-name\', regex used for validation is \'[-._a-zA-Z0-9]+\')',
      'error: error reading k8s/nope.txt: no such file or directory', 'error: from-env-file cannot be combined with from-file or from-literal',
      'error: env file k8s/bad.env, line 2: "1BAD" is not a valid key name: a valid environment variable name must consist of alphabetic characters, digits, \'_\', \'-\', or \'.\', and must not start with a digit (e.g. \'my.env-name\',  or \'MY_ENV.NAME\',  or \'MyEnvName1\', regex used for validation is \'[-._a-zA-Z][-._a-zA-Z0-9]*\')',
      'error: cannot give a key name for a directory path', '', 'error: failed to create configmap: configmaps "app" already exists', 'error: must specify the type of secret: generic, tls or docker-registry',
      'error: unknown command "opaque" for "kubectl create secret"', 'error: cannot add key a, another key by that name already exists']);
  });
  it('creates generic, tls and docker-registry Secrets', () => {
    const s = go('kubectl create secret generic db --from-literal=password=lesson-pass --dry-run=client -o yaml', 'kubectl create secret tls web-tls --cert=k8s/web.crt --key=k8s/web.key',
      'kubectl get secret web-tls', 'kubectl describe secret web-tls',
      'kubectl create secret docker-registry regcred --docker-server=registry.example.com:5000 --docker-username=ci-bot --docker-password=lesson-fake-token-1 --docker-email=ci@example.com',
      "kubectl get secret regcred -o jsonpath='{.data.\\.dockerconfigjson}' | base64 -d", 'kubectl create secret generic db --from-literal=password=lesson-pass', 'kubectl create secret generic db --from-literal=password=x');
    expect(s.log[0].out).toEqual(['apiVersion: v1', 'data:', '  password: bGVzc29uLXBhc3M=', 'kind: Secret', 'metadata:', '  creationTimestamp: null', '  name: db', 'type: Opaque']);
    expect(s.log[1].out).toEqual(['secret/web-tls created']);
    expect(s.log[2].out).toEqual(['NAME      TYPE                DATA      AGE', 'web-tls   kubernetes.io/tls   2         0s']);
    expect(s.log[3].out.slice(5)).toEqual(['Type:  kubernetes.io/tls', '', 'Data', '====', `tls.crt:  ${WEB_CRT.length} bytes`, `tls.key:  ${WEB_KEY.length} bytes`]);
    expect(s.log[5].out).toEqual(['{"auths":{"registry.example.com:5000":{"username":"ci-bot","password":"lesson-fake-token-1","email":"ci@example.com","auth":"Y2ktYm90Omxlc3Nvbi1mYWtlLXRva2VuLTE="}}}']);
    expect(s.log[7].err).toEqual(['error: failed to create secret secrets "db" already exists']);
  });
  it('checks a tls key pair as Go\'s tls.X509KeyPair does', () => {
    expect(errs(go('kubectl create secret tls t --cert=k8s/web.crt', 'kubectl create secret tls t --cert=k8s/nope.crt --key=k8s/web.key', 'kubectl create secret tls t --cert=k8s/web.crt --key=k8s/other.key',
      'kubectl create secret tls t --cert=k8s/web.key --key=k8s/web.key', 'kubectl create secret tls t --cert=k8s/web.crt --key=k8s/web.crt', 'kubectl create secret tls t --cert=k8s/app.env --key=k8s/web.key',
      'kubectl create secret docker-registry r --docker-username=ci-bot'))).toEqual([
      'error: key and cert must be specified', 'error: open k8s/nope.crt: no such file or directory', 'error: tls: private key does not match public key',
      'error: tls: failed to find certificate PEM data in certificate input, but did find a private key; PEM inputs may have been switched',
      'error: tls: found a certificate rather than a key in the PEM for the private key', 'error: tls: failed to find any PEM data in certificate input',
      'error: either --from-file or the combination of --docker-username, --docker-password and --docker-server is required']);
  });
});

describe('base64 (GNU coreutils 9.4)', () => {
  it('encodes wrapped at 76 columns, -w 0 on one line without a newline, and decodes', () => {
    const s = cfg('printf "%0100d" 0 | base64', 'printf "%0100d" 0 | base64 -w 0; echo', 'printf "%0100d" 0 | base64 --wrap=20', 'echo -n lesson-pass | base64', 'echo lesson-pass | base64',
      'echo bGVzc29uLXBhc3M= | base64 -d', 'echo bGVzc29uLXBhc3M= | base64 --decode; echo', "printf '' | base64", 'echo -n é | base64');
    expect(s.log[0].out).toEqual(['MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw', 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA==']);
    expect(s.log[1].out).toEqual(['MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA==']);
    expect(s.log[2].out.length).toBe(7);
    expect(s.log.slice(3).map(l => l.out)).toEqual([['bGVzc29uLXBhc3M='], ['bGVzc29uLXBhc3MK'], ['lesson-pass'], ['lesson-pass'], [], ['w6k=']]);
  });
  it('reports invalid input after what it decoded, skips garbage with -i, and refuses bad options', () => {
    const s = cfg('echo aGk | base64 -d', 'echo "aGk=%" | base64 -d', 'echo "a%Gk=" | base64 -di', 'base64 -w x', 'base64 -w', 'base64 a b', 'base64 nope', 'base64 -q', 'base64 --nope', 'base64 --version', 'base64');
    expect(s.log.map(l => [l.out.join('|'), l.err.join('|'), l.status])).toEqual([['hi', 'base64: invalid input', 1], ['hi', 'base64: invalid input', 1], ['hi', '', 0],
      ['', "base64: invalid wrap size: 'x'", 1], ['', "base64: option requires an argument -- 'w'|Try 'base64 --help' for more information.", 1],
      ['', "base64: extra operand 'b'|Try 'base64 --help' for more information.", 1], ['', 'base64: nope: No such file or directory', 1], ['', "base64: invalid option -- 'q'|Try 'base64 --help' for more information.", 1],
      ['', "base64: unrecognized option '--nope'|Try 'base64 --help' for more information.", 1], [s.log[9].out.join('|'), '', 0], ['', 'base64: 模擬環境沒有鍵盤輸入：請指定檔案，或用管線（|）、< 提供輸入', 1]]);
    expect(s.log[9].out[0]).toBe('base64 (GNU coreutils) 9.4');
    expect(cfg('base64 --help').log[0].out[0]).toMatch(/base64/);
  });
});

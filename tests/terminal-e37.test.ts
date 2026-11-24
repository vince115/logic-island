import { describe, expect, it } from 'vitest';
import { machineState, terminalContentProblems, type TerminalMachine } from '@/lib/terminal/lesson';
import { INGRESS_PROFILE, KUBE_CONFIG_PROFILE } from '@/lib/terminal/shell';
import { pathMatches } from '@/lib/terminal/kube-route-serve';
import { cfgOn, configLab } from './support/config-fixture';
import { APPS, ing, ingOn, ingress, ingressLab, path, withIngressFiles, withKube } from './support/ingress-fixture';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §1–§4, §8, §9): the ingress profile and its boundary, the
 * lesson's ingress-nginx (objects, LoadBalancer and NodePort, the default class, pending addresses, a deleted controller
 * pod), Ingress routing (Exact, Prefix by path elements, the longest match, hosts and one-label wildcards, the default
 * backend's 404, a catch-all defaultBackend, 503 without endpoints, 502 when no endpoint answers, round-robin, the
 * headers ingress-nginx adds), kubectl get, describe and create ingress, and the API server's validation.
 */
const p4 = (lines: string[]) => lines.map(l => `    ${l}`);
const rule = (host: string | null, paths: string[]) => [...host === null ? ['- http:'] : [`- host: "${host}"`, '  http:'], '    paths:', ...p4(paths)];
const routes = ingress('r', ['ingressClassName: nginx', 'rules:', ...rule('app.example.test', [...path('/foo', 'Prefix', 'web'), ...path('/foo/bar', 'Prefix', 'api'), ...path('/foo/bar', 'Exact', 'web'),
  ...path('/x', 'ImplementationSpecific', 'api'), ...path('/echo', 'Prefix', 'echo')]), ...rule('*.example.test', path('/', 'Prefix', 'api'))]);
const extra = ['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: echo', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: echo', '  template:', '    metadata:', '      labels:', '        app: echo',
  '    spec:', '      containers:', '      - name: echo', '        image: team/echo:1.0', '---', 'apiVersion: v1', 'kind: Service', 'metadata:', '  name: echo', 'spec:', '  selector:', '    app: echo', '  ports:', '  - port: 80', '    targetPort: 8080',
  '---', 'apiVersion: v1', 'kind: Service', 'metadata:', '  name: deaf', 'spec:', '  selector:', '    app: web', '  ports:', '  - port: 80', '    targetPort: 9999', ''].join('\n');
const lab = withIngressFiles(ingressLab, { 'routes.yaml': routes, 'extra.yaml': extra,
  'catch.yaml': ingress('catch', ['ingressClassName: nginx', 'defaultBackend:', '  service:', '    name: api', '    port:', '      number: 80']),
  'deaf.yaml': ingress('deaf', ['ingressClassName: nginx', 'rules:', ...rule('deaf.example.test', path('/', 'Prefix', 'deaf'))]) });
const go = (...c: string[]) => ingOn(lab, ...APPS, 'kubectl apply -f k8s/extra.yaml -f k8s/routes.yaml', 'sleep 2', ...c);
const get = (host: string, p: string) => `curl -s -H 'Host: ${host}' http://10.0.0.200${p}`;
const who = (out: string[]) => out[0]?.startsWith('Hostname: ') ? out[0].slice(10).replace(/-[a-z0-9]+-[a-z0-9]+$/, '') : out.find(l => l.startsWith('<head>'))?.slice(13, -15) ?? out.join('|');

describe('the ingress profile and its boundary', () => {
  it('adds no command; below it Ingress, create ingress, its flags and the lesson data name E37', () => {
    expect(INGRESS_PROFILE.commands).toEqual(KUBE_CONFIG_PROFILE.commands);
    expect(INGRESS_PROFILE.features).toEqual([...KUBE_CONFIG_PROFILE.features!, 'ingress']);
    const below = withIngressFiles(configLab, { 'i.yaml': ingress('a', ['defaultBackend:', '  service:', '    name: web', '    port:', '      number: 80']) });
    const s = cfgOn(below, 'kubectl get ing', 'kubectl apply -f k8s/i.yaml', 'kubectl create ingress a', 'kubectl create ingress a --rule=h/=w:80', 'kubectl get gateways', 'kubectl get gatewayclasses');
    expect(s.log.map(l => l.err[0])).toEqual(['（模擬環境：ing 要到引擎階段 E37 才模擬）', '（模擬環境：Ingress 要到引擎階段 E37 才模擬）', '（模擬環境：kubectl create ingress 要到引擎階段 E37 才模擬）',
      'error: unknown flag: --rule', '（模擬環境：gateways 要到引擎階段 E37 才模擬）', 'error: the server doesn\'t have a resource type "gatewayclasses"']);
    const data = (kube: object): TerminalMachine => ({ ...configLab, kube: { ...configLab.kube, ...kube } });
    expect(terminalContentProblems({ machines: [data({ ingressController: {} })], examples: [], exercises: [] })).toContain('machine kub-36: kube: ingressController needs the ingress profile (engine stage E37)');
    expect(terminalContentProblems({ machines: [data({ gatewayApi: {} })], examples: [], exercises: [] })).toContain('machine kub-36: kube: gatewayApi needs the ingress profile (engine stage E37)');
  });
  it('validates the lesson data of ingress-nginx and the Gateway API', () => {
    const bad = (kube: object) => terminalContentProblems({ machines: [withKube(ingressLab, kube)], examples: [], exercises: [] });
    expect(bad({})).toEqual([]);
    expect(bad({ ingressController: { service: 'ClusterIP' } })).toContain('machine kub-37: kube: ingressController.service is LoadBalancer or NodePort');
    expect(bad({ ingressController: { service: 'LoadBalancer', nodePorts: { http: 30080 } } })).toContain('machine kub-37: kube: ingressController.nodePorts (http, https) are two different ports in 30000-32767 of a NodePort controller');
    expect(bad({ ingressController: { service: 'NodePort', nodePorts: { http: 30080, https: 30080 } } })).toHaveLength(1);
    expect(bad({ gatewayApi: { controllerName: 'nope' } })).toContain('machine kub-37: kube: gatewayApi is { controllerName?: a domain-prefixed path such as example.com/gateway-controller, controller?: boolean }');
  });
  it('without a controller accepts Ingresses that nothing serves (no class, no address, no Sync)', () => {
    const s = ingOn(withKube(ingressLab, { ingressController: undefined }), 'kubectl get ingressclass', 'kubectl apply -f k8s/ing.yaml', 'kubectl get ing', 'kubectl get events', 'kubectl get ns');
    expect(s.log[0].err).toEqual(['No resources found']);
    expect(s.log[2].out).toEqual(['NAME      CLASS     HOSTS              ADDRESS   PORTS     AGE', 'app       nginx     app.example.test             80        0s']);
    expect(s.log[3].out.join('\n')).not.toContain('Sync');
    expect(s.log[4].out.join('\n')).not.toContain('ingress-nginx');
  });
});

describe('ingress-nginx as the lesson installs it', () => {
  it('runs in ingress-nginx with its Services, Deployment and IngressClass; the LoadBalancer takes the pool\'s first address', () => {
    const s = ing('kubectl get all -n ingress-nginx', 'kubectl get ingressclass', 'kubectl get pod -n ingress-nginx -o wide', 'kubectl get pod -n ingress-nginx -o jsonpath={.items[0].spec.containers[0].image}');
    expect(s.log[0].out).toEqual([
      'NAME                                            READY     STATUS    RESTARTS   AGE', 'pod/ingress-nginx-controller-pfbkkfnfbv-xvrp5   1/1       Running   0          30d', '',
      'NAME                                         TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE',
      'service/ingress-nginx-controller             LoadBalancer   10.102.97.149   10.0.0.200    80:32016/TCP,443:30160/TCP   30d',
      'service/ingress-nginx-controller-admission   ClusterIP      10.97.97.167    <none>        443/TCP                      30d', '',
      'NAME                                       READY     UP-TO-DATE   AVAILABLE   AGE', 'deployment.apps/ingress-nginx-controller   1/1       1            1           30d', '',
      'NAME                                                  DESIRED   CURRENT   READY     AGE', 'replicaset.apps/ingress-nginx-controller-pfbkkfnfbv   1         1         1         30d']);
    expect(s.log[1].out).toEqual(['NAME      CONTROLLER             PARAMETERS   AGE', 'nginx     k8s.io/ingress-nginx   <none>       30d']);
    expect(s.log[2].out[1]).toMatch(/^ingress-nginx-controller-pfbkkfnfbv-xvrp5\s+1\/1\s+Running\s+0\s+30d\s+10\.244\.1\.2\s+node-01\s/);
    expect(s.log[3].out).toEqual(['registry.k8s.io/ingress-nginx/controller:v1.12.0']);
  });
  it('a NodePort controller publishes its node\'s address; a LoadBalancer without a pool leaves ADDRESS empty', () => {
    const np = ingOn(withKube(ingressLab, { ingressController: { service: 'NodePort', nodePorts: { http: 30080, https: 30443 } } }), ...APPS, 'kubectl apply -f k8s/ing.yaml', 'kubectl get ing', get('app.example.test', '/').replace('10.0.0.200', '10.0.0.52:30080'));
    expect(np.log[3].out[1]).toMatch(/^app\s+nginx\s+app\.example\.test\s+10\.0\.0\.51\s+80\s+0s$/);
    expect(who(np.log[4].out)).toBe('web');
    const pending = ingOn(withKube(ingressLab, { lbPool: undefined }), 'kubectl apply -f k8s/ing.yaml', 'kubectl get svc -n ingress-nginx ingress-nginx-controller', 'kubectl get ing');
    expect(pending.log[1].out[1]).toMatch(/LoadBalancer\s+\S+\s+<pending>/);
    expect(pending.log[2].out[1]).toMatch(/^app\s+nginx\s+app\.example\.test\s+80\s+0s$/);
  });
  it('gives the default IngressClass to an Ingress without one (only when it is created)', () => {
    const noClass = ingress('plain', ['rules:', ...rule('app.example.test', path('/', 'Prefix', 'web'))]);
    const s = ingOn(withIngressFiles(withKube(ingressLab, { ingressController: { defaultClass: true } }), { 'plain.yaml': noClass }), 'kubectl get ingressclass nginx -o jsonpath={.metadata.annotations}', 'kubectl apply -f k8s/plain.yaml', 'kubectl get ing plain -o jsonpath={.spec.ingressClassName}');
    expect(s.log[0].out).toEqual(['{"ingressclass.kubernetes.io/is-default-class":"true"}']);
    expect(s.log[2].out).toEqual(['nginx']);
    const none = ingOn(withIngressFiles(ingressLab, { 'plain.yaml': noClass }), 'kubectl apply -f k8s/plain.yaml', 'kubectl get ing plain', get('app.example.test', '/'));
    expect(none.log[1].out[1]).toMatch(/^plain\s+<none>\s+app\.example\.test\s+80\s+0s$/);
    expect(who(none.log[2].out)).toBe('404 Not Found');
  });
  it('comes back when its pod is deleted (the system\'s, as kube-system\'s pods are)', () => {
    const s = ing('kubectl delete pod -n ingress-nginx ingress-nginx-controller-pfbkkfnfbv-xvrp5', 'kubectl get pods -n ingress-nginx');
    expect(s.log[0].out).toEqual(['pod "ingress-nginx-controller-pfbkkfnfbv-xvrp5" deleted']);
    expect(s.log[1].out[1]).toMatch(/^ingress-nginx-controller-pfbkkfnfbv-\w{5}\s+1\/1\s+Running\s+0\s+0s$/);
    expect(s.log[1].out[1]).not.toContain('xvrp5');
  });
});

describe('Ingress routing at ingress-nginx', () => {
  it('matches Exact before Prefix, the longest path, by path elements (/foo is not /foobar), hosts and one-label wildcards', () => {
    const s = go(get('app.example.test', '/foo'), get('app.example.test', '/foo/'), get('app.example.test', '/foo/bar'), get('app.example.test', '/foo/bar/baz'), get('app.example.test', '/foobar'),
      get('app.example.test', '/x/y'), get('a.example.test', '/anything'), get('a.b.example.test', '/'), get('example.test', '/'), get('APP.example.test:80', '/foo'));
    expect(s.log.slice(4).map(l => who(l.out))).toEqual(['web', 'web', 'web', 'api', '404 Not Found', 'api', 'api', '404 Not Found', '404 Not Found', 'web']);
    expect(s.log[8].out.at(-3)).toBe('<hr><center>nginx</center>');
    expect([pathMatches({ path: '/foo/', exact: false }, '/foo'), pathMatches({ path: '/', exact: false }, '/a'), pathMatches({ path: '/foo', exact: true }, '/foo/')]).toEqual([true, true, false]);
  });
  it('sends requests to the ready endpoints in turn; 503 without endpoints, 502 when none answers; a rule-less defaultBackend catches all', () => {
    const s = go(get('app.example.test', '/foo'), get('app.example.test', '/foo'), get('app.example.test', '/foo'), 'kubectl apply -f k8s/catch.yaml -f k8s/deaf.yaml', get('nohost.test', '/'),
      'kubectl scale deploy api --replicas=0', 'sleep 40', 'curl -si -H "Host: a.example.test" http://10.0.0.200/', get('deaf.example.test', '/'));
    const pods = s.log.slice(4, 7).map(l => l.out[0]);
    expect([pods[0] === pods[2], pods[0] === pods[1]]).toEqual([true, false]);
    expect(who(s.log[8].out)).toBe('api');
    expect(s.log[11].out.slice(0, 7)).toEqual(['HTTP/1.1 503 Service Temporarily Unavailable', 'Server: nginx', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: text/html', 'Content-Length: 183', 'Connection: keep-alive', '']);
    expect(who(s.log[12].out)).toBe('502 Bad Gateway');
  });
  it('proxies with nginx\'s Server and the X-Forwarded headers; the backend sees the controller pod', () => {
    const s = go('curl -si -H "Host: app.example.test" http://10.0.0.200/echo/a?b=1');
    expect(s.log[4].out).toEqual(['HTTP/1.1 200 OK', 'Server: nginx', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: text/plain', 'Content-Length: 277', 'Connection: keep-alive', '',
      'remote_addr: 10.244.1.2', 'GET /echo/a?b=1 HTTP/1.1', 'Host: app.example.test', 'X-Real-IP: 10.244.1.2', 'X-Forwarded-For: 10.244.1.2', 'X-Forwarded-Host: app.example.test', 'X-Forwarded-Port: 80',
      'X-Forwarded-Proto: http', 'X-Forwarded-Scheme: http', 'X-Scheme: http', 'User-Agent: curl/8.5.0', 'Accept: */*']);
  });
  it('is reachable from pods through the controller Service\'s ClusterIP and DNS name', () => {
    const s = go('kubectl apply -f k8s/client.yaml', 'sleep 2', 'kubectl exec client -- curl -s -H "Host: app.example.test" http://ingress-nginx-controller.ingress-nginx/foo/bar/baz');
    expect(who(s.log[6].out)).toBe('api');
  });
});

describe('TLS at ingress-nginx', () => {
  const secure = ingress('secure', ['ingressClassName: nginx', 'tls:', '- hosts:', '  - app.example.test', '  secretName: app-tls', '- hosts:', '  - nosecret.example.test', '  secretName: nope',
    'rules:', ...rule('app.example.test', path('/', 'Prefix', 'web')), ...rule('nosecret.example.test', path('/', 'Prefix', 'api'))]);
  const tls = (...c: string[]) => ingOn(withIngressFiles(ingressLab, { 'secure.yaml': secure }), ...APPS, 'kubectl create secret tls app-tls --cert=k8s/app.crt --key=k8s/app.key', 'kubectl apply -f k8s/secure.yaml', ...c);
  const R = (host: string, port = 443) => `--resolve ${host}:${port}:10.0.0.200`;
  it('terminates with the Secret\'s certificate (SNI), adds HSTS and redirects HTTP with 308', () => {
    const s = tls(`curl -s ${R('app.example.test')} --cacert k8s/ca.crt https://app.example.test/`, `curl -sI ${R('app.example.test')} --cacert k8s/ca.crt https://app.example.test/`,
      `curl -si ${R('app.example.test', 80)} http://app.example.test/a/b?c=1`, `curl -sL ${R('app.example.test', 80)} ${R('app.example.test')} --cacert k8s/ca.crt http://app.example.test/`, 'kubectl get ing secure');
    expect(s.log[4].out[0]).toMatch(/^Hostname: web-/);
    expect(s.log[5].out).toEqual(['HTTP/1.1 200 OK', 'Server: nginx', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: text/plain', 'Content-Length: 46', 'Connection: keep-alive', 'Strict-Transport-Security: max-age=31536000; includeSubDomains', '']);
    expect(s.log[6].out).toEqual(['HTTP/1.1 308 Permanent Redirect', 'Server: nginx', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: text/html', 'Content-Length: 157', 'Connection: keep-alive',
      'Location: https://app.example.test/a/b?c=1', '', '<html>', '<head><title>308 Permanent Redirect</title></head>', '<body>', '<center><h1>308 Permanent Redirect</h1></center>', '<hr><center>nginx</center>', '</body>', '</html>']);
    expect(s.log[7].out[0]).toMatch(/^Hostname: web-/);
    expect(s.log[8].out[1]).toMatch(/^secure\s+nginx\s+app\.example\.test,nosecret\.example\.test\s+10\.0\.0\.200\s+80, 443\s+0s$/);
  });
  it('serves the Fake Certificate without the Secret, for other names and by address; curl refuses it unless -k', () => {
    const s = tls(`curl -s ${R('nosecret.example.test')} https://nosecret.example.test/`, `curl -sk ${R('nosecret.example.test')} https://nosecret.example.test/`, 'curl -vk https://10.0.0.200/',
      `curl -sS ${R('other.test')} https://other.test/`, 'curl -s http://10.0.0.200:443/');
    expect([s.log[4].err, s.log[4].status]).toEqual([[], 60]);
    expect(s.log[5].out[0]).toMatch(/^Hostname: api-/);
    expect(s.log[6].err.filter(l => /subject:|issuer:|verify result/.test(l))).toEqual(['*  subject: O=Acme Co; CN=Kubernetes Ingress Controller Fake Certificate',
      '*  issuer: O=Acme Co; CN=Kubernetes Ingress Controller Fake Certificate', '*  SSL certificate verify result: self-signed certificate (18), continuing anyway.']);
    expect(s.log[7].err[0]).toBe('curl: (60) SSL certificate problem: self-signed certificate');
    expect(s.log[8].out.slice(0, 4)).toEqual(['<html>', '<head><title>400 The plain HTTP request was sent to HTTPS port</title></head>', '<body>', '<center><h1>400 Bad Request</h1></center>']);
  });
});

describe('kubectl and the API server', () => {
  it('describes an Ingress: address, class, TLS, its rules with backends and endpoints, the Sync event', () => {
    const one = ingress('one', ['ingressClassName: nginx', 'defaultBackend:', '  service:', '    name: api', '    port:', '      name: web', 'tls:', '- hosts:', '  - app.example.test', '  secretName: app-tls',
      'rules:', ...rule('app.example.test', [...path('/', 'Prefix', 'web'), ...path('/v2', 'Exact', 'gone', 'http')]), ...rule(null, path('/any', 'Prefix', 'api'))], ['labels:', '  team: shop']);
    const s = ingOn(withIngressFiles(ingressLab, { 'one.yaml': one }), ...APPS, 'kubectl apply -f k8s/one.yaml', 'kubectl describe ingress one');
    expect(s.log[3].out).toEqual(['Name:             one', 'Labels:           team=shop', 'Namespace:        default', 'Address:          10.0.0.200', 'Ingress Class:    nginx',
      'Default backend:  api:web (<none>)', 'TLS:', '  app-tls terminates app.example.test', 'Rules:', '  Host              Path  Backends', '  ----              ----  --------', '  app.example.test  ',
      '                    /     web:80 (10.244.1.3:8080,10.244.2.3:8080)', '                    /v2   gone:http (<error: services "gone" not found>)', '  *                 ',
      '                    /any   api:80 (10.244.1.4:8080)', 'Annotations:        <none>', 'Events:', '  Type    Reason  Age   From                      Message', '  ----    ------  ----  ----                      -------',
      '  Normal  Sync    0s    nginx-ingress-controller  Scheduled for sync']);
  });
  it('creates an Ingress as kubectl\'s generator builds it, and says why it cannot', () => {
    const s = ing(...APPS, "kubectl create ingress web --class=nginx --rule='app.example.test/*=web:80' --rule='app.example.test/api*=api:http,tls=app-tls' --rule='/exact=web:80' --annotation=team=shop --dry-run=client -o yaml",
      "kubectl create ingress web --class=nginx --rule='app.example.test/*=web:80'", 'kubectl get ing web -o name', "kubectl create ingress web --rule='a.test/=web:80'", 'kubectl create ingress web',
      'kubectl create ingress x --rule=nope', 'kubectl create ingress x --default-backend=web', "kubectl create ingress x --rule='a.test/=web:80' --annotation=bad", "kubectl create ingress x --rule='10.0.0.1/=web:80'");
    expect(s.log[2].out).toEqual(['apiVersion: networking.k8s.io/v1', 'kind: Ingress', 'metadata:', '  annotations:', '    team: shop', '  creationTimestamp: null', '  name: web', 'spec:', '  ingressClassName: nginx', '  rules:',
      '  - host: app.example.test', '    http:', '      paths:', '      - backend:', '          service:', '            name: web', '            port:', '              number: 80', '        path: /', '        pathType: Prefix',
      '      - backend:', '          service:', '            name: api', '            port:', '              name: http', '        path: /api', '        pathType: Prefix', '  - http:', '      paths:', '      - backend:', '          service:',
      '            name: web', '            port:', '              number: 80', '        path: /exact', '        pathType: Exact', '  tls:', '  - hosts:', '    - app.example.test', '    secretName: app-tls', 'status:', '  loadBalancer: {}']);
    expect(s.log[3].out).toEqual(['ingress.networking.k8s.io/web created']);
    expect(s.log[4].out).toEqual(['ingress.networking.k8s.io/web']);
    expect(s.log.slice(5).map(l => l.err[0])).toEqual(['error: failed to create ingress: ingresses.networking.k8s.io "web" already exists',
      'error: not enough information provided: every ingress has to either specify a default-backend (which catches all traffic) or a list of rules (which catch specific paths)',
      'error: rule nope is invalid and should be in format host/path=svcname:svcport[,tls[=secret]]', 'error: default-backend should be in format servicename:serviceport',
      'error: annotation bad is invalid and should be in format key=[value]', 'error: failed to create ingress: Ingress.networking.k8s.io "x" is invalid: spec.rules[0].host: Invalid value: "10.0.0.1": must be a DNS name, not an IP address']);
  });
  it('validates Ingresses and IngressClasses as the API server does; a new spec is a new generation the controller syncs', () => {
    const lines = ['rules:', '- host: "*.*.test"', '  http:', '    paths:', '    - path: api', '      pathType: Fuzzy', '      backend:', '        service:', '          name: web', '          port:', '            name: http', '            number: 80'];
    const bad = ingress('bad', [...lines, '    - path: /x', '      backend:', '        resource:', '          kind: Bucket', '          name: b']);
    const cls = 'apiVersion: networking.k8s.io/v1\nkind: IngressClass\nmetadata:\n  name: nginx\nspec:\n  controller: example.com/other\n';
    const s = ingOn(withIngressFiles(ingressLab, { 'bad.yaml': bad, 'empty.yaml': ingress('empty', []), 'cls.yaml': cls, 'nopath.yaml': ingress('np', ['rules:', '- host: a.test', '  http:', '    paths:', '    - path: /', '      backend:', '        service:', '          name: web', '          port:', '            number: 80']) }),
      'kubectl apply -f k8s/bad.yaml', 'kubectl apply -f k8s/empty.yaml', 'kubectl apply -f k8s/cls.yaml', 'kubectl apply -f k8s/nopath.yaml', 'kubectl apply -f k8s/ing.yaml', "sed -i 's/exact/precise/' k8s/ing.yaml", 'sleep 10',
      'kubectl apply -f k8s/ing.yaml', 'kubectl get ing app -o jsonpath={.metadata.generation}', 'kubectl events --for ingress/app');
    expect(s.log[0].err).toEqual(['（模擬環境：spec.rules[0].http.paths[1].backend.resource 只在課文說明；後端請用 Service）']);
    expect(s.log[1].err).toEqual(['The Ingress "empty" is invalid: spec: Invalid value: []networking.IngressRule(nil): either `defaultBackend` or `rules` must be specified']);
    expect(s.log[2].err).toEqual(['The IngressClass "nginx" is invalid: spec.controller: Invalid value: "example.com/other": field is immutable']);
    expect(s.log[3].err).toEqual(['The Ingress "np" is invalid: spec.rules[0].http.paths[0].pathType: Required value: pathType must be specified']);
    expect(s.log[8].out).toEqual(['2']);
    expect(s.log[9].out.slice(1).map(l => l.replace(/\s+/g, ' '))).toEqual(['0s (x2 over 10s) Normal Sync Ingress/app Scheduled for sync']);
    const many = ingOn(withIngressFiles(ingressLab, { 'bad.yaml': ingress('bad', lines) }), 'kubectl apply -f k8s/bad.yaml');
    expect(many.log[0].err).toEqual(['The Ingress "bad" is invalid: ', '* spec.rules[0].host: Invalid value: "*.*.test": a wildcard DNS-1123 subdomain must start with \'*.\', followed by a valid DNS subdomain, which must consist of lower case alphanumeric characters, \'-\' or \'.\' and end with an alphanumeric character (e.g. \'*.example.com\', regex used for validation is \'\\*\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*\')',
      '* spec.rules[0].http.paths[0].pathType: Unsupported value: "Fuzzy": supported values: "Exact", "ImplementationSpecific", "Prefix"', '* spec.rules[0].http.paths[0].path: Invalid value: "api": must be an absolute path',
      '* spec.rules[0].http.paths[0].backend.service.port: Invalid value: "http": cannot set both port name & port number']);
  });
  it('is deterministic: the same session gives the same cluster and output', () => {
    const run = () => go(get('app.example.test', '/foo'), 'kubectl get ing -o yaml');
    const a = run(), b = run();
    expect(a.log).toEqual(b.log);
    expect(JSON.stringify(a.state.kube)).toBe(JSON.stringify(b.state.kube));
    expect(machineState(lab).kube?.ingress).toEqual({ nginx: 'LoadBalancer', gateway: { controller: 'example.com/gateway-controller' } });
  });
});

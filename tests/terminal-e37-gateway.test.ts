import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, describeCheck, terminalContentProblems, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { weightedPick } from '@/lib/terminal/kube-route-serve';
import { APPS, ingOn, ingressLab, route, withIngressFiles, withKube } from './support/ingress-fixture';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §5–§7, §10): the Gateway API — its CRDs (absent, or present
 * without a controller), the lesson's controller (GatewayClass Accepted, a Gateway's address from the pool, its
 * listeners' status, AddressNotAssigned), HTTPRoutes (attachment, NoMatchingListenerHostname, NoMatchingParent,
 * NotAllowedByListeners, BackendNotFound), routing (listener and route hostnames, Exact and PathPrefix, weighted splits
 * by smooth weighted round robin, 404 / 500 / 503), an HTTPS listener's certificate, pods, and the checks kube-object
 * (conditions) and http (a Host header) on Ingresses and Gateways.
 */
const backend = (name: string, weight?: number) => [`  - name: ${name}`, '    port: 80', ...weight === undefined ? [] : [`    weight: ${weight}`]];
const files = {
  'split.yaml': route('split', ['parentRefs:', '- name: gw', 'hostnames:', '- shop.example.test', 'rules:', '- backendRefs:', ...backend('web', 3), ...backend('api', 1)]),
  'paths.yaml': route('paths', ['parentRefs:', '- name: gw', '  sectionName: http', 'hostnames:', '- "*.example.test"', 'rules:', '- matches:', '  - path:', '      type: PathPrefix', '      value: /v1', '  backendRefs:', ...backend('api'),
    '- matches:', '  - path:', '      type: Exact', '      value: /v1/web', '  - path:', '      type: PathPrefix', '      value: /web', '  backendRefs:', ...backend('web')]),
  'far.yaml': route('far', ['parentRefs:', '- name: gw', 'hostnames:', '- other.test', 'rules:', '- backendRefs:', ...backend('web')]),
  'nosec.yaml': route('nosec', ['parentRefs:', '- name: gw', '  sectionName: https', 'rules:', '- backendRefs:', ...backend('web')]),
  'miss.yaml': route('miss', ['parentRefs:', '- name: gw', 'hostnames:', '- miss.example.test', 'rules:', '- backendRefs:', ...backend('nope')]),
  'zero.yaml': route('zero', ['parentRefs:', '- name: gw', 'hostnames:', '- zero.example.test', 'rules:', '- backendRefs:', ...backend('web', 0)]),
  'other-ns.yaml': route('elsewhere', ['parentRefs:', '- name: gw', '  namespace: default', 'rules:', '- backendRefs:', ...backend('web')]).replace('metadata:\n', 'metadata:\n  namespace: dev\n'),
  'tls-gw.yaml': ['apiVersion: gateway.networking.k8s.io/v1', 'kind: Gateway', 'metadata:', '  name: secure', 'spec:', '  gatewayClassName: lesson', '  listeners:', '  - name: https', '    protocol: HTTPS', '    port: 443',
    '    hostname: app.example.test', '    tls:', '      certificateRefs:', '      - name: app-tls', '    allowedRoutes:', '      namespaces:', '        from: All', ''].join('\n'),
  'secure.yaml': route('secure', ['parentRefs:', '- name: secure', 'rules:', '- backendRefs:', ...backend('web')]),
};
const lab = withIngressFiles(ingressLab, files);
const go = (...c: string[]) => ingOn(lab, ...APPS, 'kubectl apply -f k8s/gw.yaml', ...c);
const get = (host: string, p = '/') => `curl -s -H 'Host: ${host}' http://10.0.0.201${p}`;
const who = (out: string[]) => out[0]?.startsWith('Hostname: ') ? out[0].slice(10).replace(/-[a-z0-9]+-[a-z0-9]+$/, '') : out.join('|') || '(empty)';
const conds = (out: string[]) => JSON.parse(out[0] || '[]').map((c: { type: string; status: string; reason: string }) => `${c.type}=${c.status}/${c.reason}`);

describe('the Gateway API CRDs and the lesson\'s controller', () => {
  it('without the CRDs the kinds are unknown; with them but no controller everything waits for one', () => {
    const none = ingOn(withKube(lab, { gatewayApi: undefined }), 'kubectl get gateways', 'kubectl apply -f k8s/split.yaml');
    expect(none.log[0].err).toEqual(['error: the server doesn\'t have a resource type "gateways"']);
    expect(none.log[1].err).toEqual(['error: resource mapping not found for name: "split" namespace: "default" from "k8s/split.yaml": no matches for kind "HTTPRoute" in version "gateway.networking.k8s.io/v1"', 'ensure CRDs are installed first']);
    const idle = ingOn(withKube(lab, { gatewayApi: { controller: false } }), 'kubectl apply -f k8s/gw.yaml', 'kubectl get gc,gtw', 'kubectl get gtw gw -o jsonpath={.status.conditions}');
    expect(idle.log[1].out).toEqual(['NAME                                            CONTROLLER                       ACCEPTED   AGE', 'gatewayclass.gateway.networking.k8s.io/lesson   example.com/gateway-controller   Unknown    0s', '',
      'NAME                                   CLASS     ADDRESS   PROGRAMMED   AGE', 'gateway.gateway.networking.k8s.io/gw   lesson              Unknown      0s']);
    expect(conds(idle.log[2].out)).toEqual(['Accepted=Unknown/Pending', 'Programmed=Unknown/Pending']);
  });
  it('accepts its class, gives the Gateway an address from the pool and writes each listener\'s status', () => {
    const s = go('kubectl get gatewayclass,gateway', 'kubectl get gtw gw -o jsonpath={.status.listeners[0].conditions}', 'kubectl apply -f k8s/split.yaml -f k8s/paths.yaml', 'kubectl get gtw gw -o jsonpath={.status.listeners[0].attachedRoutes}',
      'kubectl get httproute', 'kubectl api-resources | grep gateway');
    expect(s.log[3].out).toEqual(['NAME                                            CONTROLLER                       ACCEPTED   AGE', 'gatewayclass.gateway.networking.k8s.io/lesson   example.com/gateway-controller   True       0s', '',
      'NAME                                   CLASS     ADDRESS      PROGRAMMED   AGE', 'gateway.gateway.networking.k8s.io/gw   lesson    10.0.0.201   True         0s']);
    expect(conds(s.log[4].out)).toEqual(['Accepted=True/Accepted', 'Programmed=True/Programmed', 'ResolvedRefs=True/ResolvedRefs']);
    expect(s.log[6].out).toEqual(['2']);
    expect(s.log[7].out).toEqual(['NAME      HOSTNAMES               AGE', 'paths     ["*.example.test"]      0s', 'split     ["shop.example.test"]   0s']);
    expect(s.log[8].out).toHaveLength(3);
  });
  it('reports why a route did not attach or cannot resolve its backends', () => {
    const s = go('kubectl create namespace dev', 'kubectl apply -f k8s/far.yaml -f k8s/nosec.yaml -f k8s/miss.yaml -f k8s/other-ns.yaml',
      ...['far', 'nosec', 'miss', 'elsewhere -n dev'].map(r => `kubectl get httproute ${r} -o jsonpath={.status.parents[0].conditions}`), 'kubectl get httproute miss -o jsonpath={.status.parents[0].conditions[1].message}');
    expect(s.log.slice(5, 9).map(l => conds(l.out))).toEqual([['Accepted=False/NoMatchingListenerHostname', 'ResolvedRefs=True/ResolvedRefs'], ['Accepted=False/NoMatchingParent', 'ResolvedRefs=True/ResolvedRefs'],
      ['Accepted=True/Accepted', 'ResolvedRefs=False/BackendNotFound'], ['Accepted=False/NotAllowedByListeners', 'ResolvedRefs=False/BackendNotFound']]);
    expect(s.log[9].out).toEqual(['Service "nope" not found']);
  });
  it('leaves a Gateway without an address when the pool is used up (AddressNotAssigned)', () => {
    const s = ingOn(withKube(lab, { lbPool: ['10.0.0.200'] }), 'kubectl apply -f k8s/gw.yaml', 'kubectl get gtw gw', 'kubectl get gtw gw -o jsonpath={.status.conditions}');
    expect(s.log[1].out[1]).toMatch(/^gw\s+lesson\s+False\s+0s$/);
    expect(conds(s.log[2].out)).toEqual(['Accepted=True/Accepted', 'Programmed=False/AddressNotAssigned']);
  });
});

describe('routing at a Gateway', () => {
  it('splits by weight with the smooth weighted round robin (3:1 is web web api web), endpoints in turn within a backend', () => {
    const s = go('kubectl apply -f k8s/split.yaml', ...Array.from({ length: 8 }, () => get('shop.example.test')));
    expect(s.log.slice(4).map(l => who(l.out))).toEqual(['web', 'web', 'api', 'web', 'web', 'web', 'api', 'web']);
    expect(new Set(s.log.slice(4).map(l => l.out[0])).size).toBe(3);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => weightedPick([90, 10], n))).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect([weightedPick([0, 0], 3), weightedPick([5, 0, 1], 2)]).toEqual([undefined, 0]);
  });
  it('matches the listener and route hostnames, Exact before PathPrefix and the longest prefix; 404, 500 and 503 otherwise', () => {
    const s = go('kubectl apply -f k8s/paths.yaml -f k8s/miss.yaml -f k8s/zero.yaml', get('a.example.test', '/v1'), get('a.b.example.test', '/v1/x'), get('a.example.test', '/v1/web'), get('a.example.test', '/web/1'),
      get('a.example.test', '/v10'), get('example.test', '/v1'), `curl -si -H 'Host: miss.example.test' http://10.0.0.201/`, get('zero.example.test'), 'kubectl scale deploy api --replicas=0', 'sleep 40', `curl -si -H 'Host: a.example.test' http://10.0.0.201/v1`);
    expect(s.log.slice(4, 10).map(l => who(l.out))).toEqual(['api', 'api', 'web', 'web', '(empty)', '(empty)']);
    expect(s.log[10].out).toEqual(['HTTP/1.1 500 Internal Server Error', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: text/plain', 'Content-Length: 0', 'Connection: keep-alive', '']);
    expect(who(s.log[11].out)).toBe('(empty)');
    expect(s.log[14].out.slice(0, 1).concat(s.log[14].out.slice(-1))).toEqual(['HTTP/1.1 503 Service Unavailable', 'no healthy upstream']);
  });
  it('terminates TLS with the listener\'s certificate; without its Secret the listener is not programmed', () => {
    const s = go('kubectl apply -f k8s/tls-gw.yaml -f k8s/secure.yaml', 'kubectl get gtw secure -o jsonpath={.status.listeners[0].conditions}', 'kubectl create secret tls app-tls --cert=k8s/app.crt --key=k8s/app.key',
      'sleep 1', 'kubectl get gtw secure', 'curl -s --resolve app.example.test:443:10.0.0.202 --cacert k8s/ca.crt https://app.example.test/', 'curl -s --resolve other.test:443:10.0.0.202 -k https://other.test/');
    expect(conds(s.log[4].out)).toEqual(['Accepted=True/Accepted', 'Programmed=False/Invalid', 'ResolvedRefs=False/InvalidCertificateRef']);
    expect(s.log[7].out[1]).toMatch(/^secure\s+lesson\s+10\.0\.0\.202\s+True\s+1s$/);
    expect(who(s.log[8].out)).toBe('web');
    expect(s.log[9].status).toBe(35);
  });
  it('is reachable from pods at its address', () => {
    const s = go('kubectl apply -f k8s/split.yaml -f k8s/client.yaml', 'sleep 2', "kubectl exec client -- curl -s -H 'Host: shop.example.test' http://10.0.0.201/");
    expect(who(s.log[5].out)).toBe('web');
  });
});

describe('checks on Ingresses and Gateways', () => {
  const ex = (checks: TerminalCheck[], solution: string[], m: TerminalMachine = lab) => ({ id: 'x', title: 'x', machine: m.id, statement: 'x', checks, solution, mistakes: [{ commands: ['true'], why: 'x' }], hints: [], explanation: 'x' });
  const run = (checks: TerminalCheck[], solution: string[], m: TerminalMachine = lab) => checkTerminalExercise(ex(checks, solution, m), [m], solution).results.map(r => r.ok ? 'ok' : r.message.split('，但')[1]);
  it('kube-object reads Ingress, Gateway and HTTPRoute fields and conditions; http sends a Host header', () => {
    const checks: TerminalCheck[] = [
      { kind: 'kube-object', resource: 'Ingress', name: 'app', fields: [{ path: '.status.loadBalancer.ingress[0].ip', equals: '10.0.0.200' }] },
      { kind: 'kube-object', resource: 'Gateway', name: 'gw', conditions: [{ type: 'Programmed', status: 'True' }] },
      { kind: 'kube-object', resource: 'HTTPRoute', name: 'split', conditions: [{ type: 'Accepted', status: 'True', reason: 'Accepted' }, { type: 'ResolvedRefs', status: 'True' }] },
      { kind: 'http', url: 'http://10.0.0.200/exact', requestHeaders: [['Host', 'app.example.test']], status: 200, body: 'Hostname: api-' },
      { kind: 'http', url: 'http://10.0.0.201/', requestHeaders: [['Host', 'nothing.example.test']], status: 404 },
    ];
    const ok = run(checks, [...APPS, 'kubectl apply -f k8s/ing.yaml -f k8s/gw.yaml -f k8s/split.yaml']);
    expect(ok).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(run(checks, [...APPS, 'kubectl apply -f k8s/gw.yaml -f k8s/miss.yaml'])).toEqual(['沒有名為 app 的 Ingress', 'ok', '沒有名為 split 的 HTTPRoute', '狀態碼是 404', 'ok']);
    expect(describeCheck({ kind: 'kube-object', resource: 'HTTPRoute', name: 'split', conditions: [{ type: 'Accepted', status: 'False', reason: 'NoMatchingParent' }] }))
      .toBe('default 命名空間應該有名為 split 的 HTTPRoute（Accepted 條件是 False（NoMatchingParent））');
  });
  it('names the wrong condition, and checks the checks', () => {
    const r = run([{ kind: 'kube-object', resource: 'HTTPRoute', name: 'miss', conditions: [{ type: 'ResolvedRefs', status: 'True' }] }], [...APPS, 'kubectl apply -f k8s/gw.yaml -f k8s/miss.yaml']);
    expect(r).toEqual(['它的 ResolvedRefs 條件是 False（BackendNotFound）']);
    const problems = (c: TerminalCheck, m: TerminalMachine = lab) => terminalContentProblems({ machines: [m], examples: [], exercises: [ex([c], ['true'], m)] });
    expect(problems({ kind: 'kube-object', resource: 'Gateway', name: 'gw', conditions: [{ type: 'Programmed', status: 'Yes' }] })).toContain('exercise x: a kube-object check\'s conditions are { type, status: True|False|Unknown, reason? }');
    const below = { ...lab, profile: 'kube-config' as const, kube: { ...lab.kube, ingressController: undefined, gatewayApi: undefined } };
    expect(problems({ kind: 'kube-object', resource: 'Ingress', name: 'app' }, below)).toContain('exercise x: a kube-object check of an Ingress needs an ingress machine (engine stage E37)');
  });
});

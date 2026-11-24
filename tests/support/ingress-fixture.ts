import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import { INGRESS_PROFILE } from '@/lib/terminal/shell';
import { certPem, keyPem, serialFrom, skiOf, type Cert } from '@/lib/terminal/tls';
import { parseTime } from '@/lib/terminal/clock';
import { session } from './environments-fixture';
import { CONFIG_IMAGES, configLab } from './config-fixture';
import { deployment } from './workloads-fixture';

/*
 * A synthetic machine for engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md), only for tests: kub-37, the E36 machine
 * (config-fixture.ts) on the ingress profile with the LoadBalancer pool 10.0.0.200–10.0.0.203, ingress-nginx (its Service
 * a LoadBalancer: 10.0.0.200) and the Gateway API with the controller example.com/gateway-controller. ~/k8s has
 * apps.yaml (Deployments web ×2 and api ×1 of team/whoami:1.0, container port 8080 named http, and their Services web
 * and api: 80 → http), ing.yaml (Ingress app: app.example.test / Prefix → web, /api Prefix → api, /exact Exact → api),
 * gw.yaml (GatewayClass lesson, Gateway gw: listener http on 80 for *.example.test), app.crt / app.key (a certificate for
 * app.example.test and *.example.test signed by the lesson CA ca.crt). The workers already have the images; whoami answers
 * every path here (Hostname, IP) and team/echo:1.0 every path on 8080 with the request it received (responder echo).
 */
const y = (...lines: string[]) => [...lines, ''].join('\n');
const app = (name: string, replicas: number) => [deployment(name, 'team/whoami:1.0', replicas, [], ['ports:', '- name: http', '  containerPort: 8080']),
  y('---', 'apiVersion: v1', 'kind: Service', 'metadata:', `  name: ${name}`, 'spec:', '  selector:', `    app: ${name}`, '  ports:', '  - port: 80', '    targetPort: http')].join('');
export const APPS_YAML = app('web', 2) + '---\n' + app('api', 1);
/** An Ingress (name, more spec lines, more metadata lines). */
export const ingress = (name: string, spec: string[], metadata: string[] = []) => y('apiVersion: networking.k8s.io/v1', 'kind: Ingress', 'metadata:', `  name: ${name}`, ...metadata.map(l => `  ${l}`), 'spec:', ...spec.map(l => `  ${l}`));
export const path = (p: string, type: string, svc: string, port: number | string = 80) => [`- path: ${p}`, `  pathType: ${type}`, '  backend:', '    service:', `      name: ${svc}`, '      port:', `        ${typeof port === 'number' ? 'number' : 'name'}: ${port}`];
export const ING_YAML = ingress('app', ['ingressClassName: nginx', 'rules:', '- host: app.example.test', '  http:', '    paths:', ...[...path('/', 'Prefix', 'web'), ...path('/api', 'Prefix', 'api'), ...path('/exact', 'Exact', 'api')].map(l => `    ${l}`)]);
export const GW_YAML = y('apiVersion: gateway.networking.k8s.io/v1', 'kind: GatewayClass', 'metadata:', '  name: lesson', 'spec:', '  controllerName: example.com/gateway-controller', '---',
  'apiVersion: gateway.networking.k8s.io/v1', 'kind: Gateway', 'metadata:', '  name: gw', 'spec:', '  gatewayClassName: lesson', '  listeners:', '  - name: http', '    protocol: HTTP', '    port: 80', '    hostname: "*.example.test"');
/** An HTTPRoute (name, spec lines). */
export const route = (name: string, spec: string[]) => y('apiVersion: gateway.networking.k8s.io/v1', 'kind: HTTPRoute', 'metadata:', `  name: ${name}`, 'spec:', ...spec.map(l => `  ${l}`));

const CA_DN = [['O', 'Logic Island Lesson'], ['CN', 'Lesson Test CA']] as const, LEAF_DN = [['CN', 'app.example.test']] as const;
const at = (t: string) => parseTime(t)!;
const CA: Cert = { serial: serialFrom('lesson-ca'), subject: CA_DN, issuer: CA_DN, notBefore: at('2026-01-01 00:00:00'), notAfter: at('2036-01-01 00:00:00'), key: 'ec256', ski: skiOf('lesson-ca'), sans: [], ca: true };
const LEAF: Cert = { serial: serialFrom('lesson-app'), subject: LEAF_DN, issuer: CA_DN, notBefore: at('2026-11-01 00:00:00'), notAfter: at('2027-11-01 00:00:00'), key: 'ec256', ski: skiOf('lesson-app'), aki: skiOf('lesson-ca'),
  sans: ['app.example.test', '*.example.test'], ca: false };
export const CA_CRT = certPem(CA), APP_CRT = certPem(LEAF), APP_KEY = keyPem({ type: 'ec256', seed: 'lesson-app' });

const file = (n: string, content: string): TerminalFile => ({ path: `/home/learner/k8s/${n}`, kind: 'file', mode: 0o644, owner: 'learner', content });
const ECHO = { ...CONFIG_IMAGES.find(i => i.name === 'team/whoami:1.0')!, name: 'team/echo:1.0', cmd: ['./echo'], logs: ['echo on :8080'], http: { port: 8080, responder: 'echo' } };
export const ingressLab: TerminalMachine = {
  ...configLab, id: 'kub-37', title: 'kub-37（Ingress 與 Gateway API）', host: 'kub-37', profile: 'ingress',
  files: [...configLab.files ?? [], file('apps.yaml', APPS_YAML), file('ing.yaml', ING_YAML), file('gw.yaml', GW_YAML), file('ca.crt', CA_CRT), file('app.crt', APP_CRT), file('app.key', APP_KEY)],
  responders: [...(configLab.responders ?? []).map(r => r.id === 'whoami' ? { ...r, routes: [{ path: '/*', body: 'Hostname: {{hostname}}\nIP: {{ip}}\n', type: 'text/plain' }] } : r),
    { id: 'echo', server: 'echo/1.0', routes: [{ path: '/*', echo: true }] }],
  docker: { ...configLab.docker, images: [...configLab.docker?.images ?? [], ECHO] },
  kube: { ...configLab.kube, images: [...configLab.kube?.images ?? [], { name: 'team/echo:1.0', nodes: ['node-01', 'node-02'] }], lbPool: ['10.0.0.200-10.0.0.203'], ingressController: { service: 'LoadBalancer' }, gatewayApi: {} },
};
/** The lab with these files in ~/k8s, or its kube data changed. */
export const withIngressFiles = (m: TerminalMachine, files: Record<string, string>): TerminalMachine => ({ ...m, files: [...m.files ?? [], ...Object.entries(files).map(([n, c]) => file(n, c))] });
export const withKube = (m: TerminalMachine, kube: Partial<NonNullable<TerminalMachine['kube']>>): TerminalMachine => ({ ...m, kube: { ...m.kube, ...kube } });
/** The apps applied and running. */
export const APPS = ['kubectl apply -f k8s/apps.yaml', 'sleep 5'];
export const ing = (...commands: string[]) => session(ingressLab, INGRESS_PROFILE, ...commands);
export const ingOn = (m: TerminalMachine, ...commands: string[]) => session(m, INGRESS_PROFILE, ...commands);

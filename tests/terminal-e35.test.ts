import { describe, expect, it } from 'vitest';
import { KUBE_NET_PROFILE, PROFILES, WORKLOADS_PROFILE } from '@/lib/terminal/shell';
import { machineProblems, profileOf } from '@/lib/terminal/lesson';
import { allocate } from '@/lib/terminal/kube-service-spec';
import { poolAddresses } from '@/lib/terminal/kube-lesson';
import { session } from './support/environments-fixture';
import { deployment } from './support/workloads-fixture';
import { lbLab, netLab, netOn, UP, withNetFiles } from './support/net-fixture';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md): the kube-net profile — Service objects (defaults, validation,
 * the ClusterIP and NodePort allocators), the Endpoints and EndpointSlice controllers (readiness, named targetPorts,
 * terminating pods), get, describe, expose and create service, and the LoadBalancer pool. The network (kube-proxy,
 * DNS, port-forward, curl from pods and from outside) and the checks are in terminal-e35-net.test.ts.
 */
const y = (...l: string[]) => [...l, ''].join('\n');
const svc = (name: string, spec: string[], meta: string[] = []) => y('apiVersion: v1', 'kind: Service', 'metadata:', `  name: ${name}`, ...meta, 'spec:', ...spec.map(l => `  ${l}`));
const lab = withNetFiles(netLab, {
  'bad.yaml': svc('Bad_1', ['type: Foo', 'ports:', '- port: 0', '  protocol: HTTP', '  targetPort: web_port', '- port: 81', '  nodePort: 30001']),
  'np2.yaml': svc('np2', ['type: NodePort', 'selector:', '  app: who', 'ports:', '- port: 80', '  nodePort: 30080']),
  'np3.yaml': svc('np3', ['type: NodePort', 'selector:', '  app: who', 'ports:', '- port: 80', '  nodePort: 80']),
  'cip.yaml': svc('cip', ['clusterIP: 10.0.0.5', 'ports:', '- port: 80']),
  'dns.yaml': svc('dns', ['clusterIP: 10.96.0.10', 'ports:', '- port: 80']),
  'hn.yaml': svc('hn', ['type: NodePort', 'clusterIP: None', 'ports:', '- port: 80']),
  'cnp.yaml': svc('cnp', ['ports:', '- port: 80', '  nodePort: 30500']),
  'typo.yaml': svc('t', ['port:', '- port: 80']),
  'ext.yaml': svc('ext', ['type: ExternalName', 'externalName: example.com']),
  'local.yaml': svc('loc', ['type: NodePort', 'externalTrafficPolicy: Local', 'ports:', '- port: 80']),
  'moved.yaml': svc('who', ['clusterIP: 10.96.50.50', 'selector:', '  app: who', 'ports:', '- name: web', '  port: 80', '  targetPort: http']),
  'ep.yaml': y('apiVersion: v1', 'kind: Endpoints', 'metadata:', '  name: who', 'subsets: []'),
  'rd.yaml': deployment('rd', 'team/web:1.0', 2, [], ['readinessProbe:', '  httpGet:', '    path: /ready', '    port: 8080', '  periodSeconds: 5']),
  'rd-svc.yaml': svc('rd', ['selector:', '  app: rd', 'ports:', '- port: 80', '  targetPort: 8080']),
  'odd.yaml': y('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: odd', '  labels:', '    app: who', 'spec:', '  containers:', '  - name: odd', '    image: team/whoami:1.0'),
  'lb.yaml': svc('lb1', ['type: LoadBalancer', 'selector:', '  app: who', 'ports:', '- port: 80', '  targetPort: 8080']),
});
const health = { ...lab, kube: { ...lab.kube, health: [{ image: 'team/web:1.0', paths: [{ path: '/ready', status: 503, until: 20 }] }] } };
const go = (...commands: string[]) => netOn(lab, ...commands);

describe('the kube-net profile', () => {
  it('is the workloads profile with the kube-net feature and no new commands', () => {
    expect(KUBE_NET_PROFILE.commands).toEqual(WORKLOADS_PROFILE.commands);
    expect(KUBE_NET_PROFILE.features).toEqual([...WORKLOADS_PROFILE.features!, 'kube-net']);
    expect(PROFILES['kube-net']).toBe(KUBE_NET_PROFILE);
    expect(profileOf(netLab)).toBe(KUBE_NET_PROFILE);
    expect(machineProblems(netLab)).toEqual([]);
    expect(machineProblems(lbLab)).toEqual([]);
  });
  it('below it Services, Endpoints, expose, port-forward and the new flags are later stages, as before', () => {
    const s = session({ ...netLab, profile: 'workloads' }, WORKLOADS_PROFILE, 'kubectl apply -f k8s/svc.yaml', 'kubectl expose deploy who --port=80', 'kubectl get ep', 'kubectl get endpointslices',
      'kubectl create service clusterip x --tcp=80', 'kubectl port-forward pod/x 80', 'kubectl create svc x', 'kubectl describe svc kubernetes', 'kubectl get svc -A');
    expect(s.log.slice(0, 7).map(l => l.err[0])).toEqual(['（模擬環境：Service 要到引擎階段 E35 才模擬）', '（模擬環境：kubectl expose 要到引擎階段 E35 才模擬）', '（模擬環境：ep 要到引擎階段 E35 才模擬）',
      '（模擬環境：endpointslices 要到引擎階段 E35 才模擬）', 'error: unknown flag: --tcp', '（模擬環境：kubectl port-forward 要到引擎階段 E35 才模擬）', '（模擬環境：kubectl create svc 要到引擎階段 E35 才模擬）']);
    expect(s.log[7].out.at(-1)).toBe('（模擬環境：Service 的其他欄位在之後的引擎階段才模擬）');
    expect(s.log[8].out[2]).toMatch(/^kube-system\s+kube-dns\s+ClusterIP\s+10\.96\.0\.10\s+<none>\s+53\/UDP,53\/TCP,9153\/TCP\s+30d$/);
    expect(machineProblems({ ...lbLab, profile: 'workloads' })).toContain('machine kub-35: kube: lbPool needs the kube-net profile (engine stage E35)');
    expect(machineProblems({ ...netLab, profile: 'workloads' })[0]).toMatch(/^machine kub-35: image team\/toolbox:1.0: commands are among .* nc pg_isready$/);
  });
  it('validates the LoadBalancer pool', () => {
    expect(machineProblems({ ...lbLab, kube: { ...lbLab.kube, lbPool: ['10.0.0.0/24'] } })).toEqual(['machine kub-35: kube: lbPool is at most 32 IPv4 addresses: a.b.c.d, a.b.c.d-a.b.c.e or a.b.c.d/27..32']);
    expect(machineProblems({ ...lbLab, kube: { ...lbLab.kube, lbPool: ['10.0.0.51'] } })).toEqual(['machine kub-35: kube: lbPool overlaps a node address']);
    expect(poolAddresses(['10.0.0.200-10.0.0.202', '10.1.0.8/30'])).toEqual(['10.0.0.200', '10.0.0.201', '10.0.0.202', '10.1.0.8', '10.1.0.9', '10.1.0.10', '10.1.0.11']);
    expect(poolAddresses(['10.0.0.9-10.0.0.1'])).toBeNull();
  });
});

describe('Service objects', () => {
  it('get the API server\'s defaults, a hashed ClusterIP and the columns of kubectl get svc', () => {
    const s = go(...UP, 'kubectl get svc', 'kubectl get svc who -o yaml', 'kubectl get svc -o wide', 'kubectl get svc who -o jsonpath={.spec.clusterIP}');
    expect(s.log[2].out).toEqual(['NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE', 'kubernetes   ClusterIP   10.96.0.1      <none>        443/TCP   30d', 'who          ClusterIP   10.99.237.60   <none>        80/TCP    5s']);
    const yaml = s.log[3].out.join('\n');
    expect(yaml).toContain(['spec:', '  clusterIP: 10.99.237.60', '  clusterIPs:', '  - 10.99.237.60', '  internalTrafficPolicy: Cluster', '  ipFamilies:', '  - IPv4', '  ipFamilyPolicy: SingleStack', '  ports:',
      '  - name: web', '    port: 80', '    protocol: TCP', '    targetPort: http', '  selector:', '    app: who', '  sessionAffinity: None', '  type: ClusterIP', 'status:', '  loadBalancer: {}'].join('\n'));
    expect(s.log[4].out[2]).toMatch(/^who\s+ClusterIP\s+10\.99\.237\.60\s+<none>\s+80\/TCP\s+5s\s+app=who$/);
    expect(s.log[5].out).toEqual(['10.99.237.60']);
  });
  it('decodes strictly and validates as the API server does', () => {
    const s = go('kubectl apply -f k8s/typo.yaml', 'kubectl apply -f k8s/bad.yaml', 'kubectl apply -f k8s/hn.yaml', 'kubectl apply -f k8s/cnp.yaml', 'kubectl apply -f k8s/ext.yaml', 'kubectl apply -f k8s/local.yaml', 'kubectl apply -f k8s/ep.yaml');
    expect(s.log[0].err).toEqual(['Error from server (BadRequest): error when creating "k8s/typo.yaml": Service in version "v1" cannot be handled as a Service: strict decoding error: unknown field "spec.port"']);
    expect(s.log[1].err).toEqual(['The Service "Bad_1" is invalid: ',
      '* metadata.name: Invalid value: "Bad_1": a DNS-1035 label must consist of lower case alphanumeric characters or \'-\', start with an alphabetic character, and end with an alphanumeric character (e.g. \'my-name\',  or \'abc-123\', regex used for validation is \'[a-z]([-a-z0-9]*[a-z0-9])?\')',
      '* spec.type: Unsupported value: "Foo": supported values: "ClusterIP", "ExternalName", "LoadBalancer", "NodePort"', '* spec.ports[0].name: Required value', '* spec.ports[0].port: Invalid value: 0: must be between 1 and 65535, inclusive',
      '* spec.ports[0].protocol: Unsupported value: "HTTP": supported values: "SCTP", "TCP", "UDP"', '* spec.ports[0].targetPort: Invalid value: "web_port": must contain only alpha-numeric characters (a-z, 0-9), and hyphens (-)', '* spec.ports[1].name: Required value']);
    expect(s.log.slice(2).map(l => l.err[0])).toEqual(['The Service "hn" is invalid: spec.clusterIPs[0]: Invalid value: "None": may not be set to \'None\' for NodePort services',
      'The Service "cnp" is invalid: spec.ports[0].nodePort: Forbidden: may not be used when `type` is \'ClusterIP\'', '（模擬環境：spec.type: ExternalName 要到引擎階段 （課文說明） 才模擬）',
      '（模擬環境：spec.externalTrafficPolicy: Local 要到引擎階段 （課文說明） 才模擬）', '（模擬環境：Endpoints 由控制器依 Service 的 selector 維護；手動建立的 Endpoints 只在課文說明）']);
  });
  it('allocates: explicit addresses and ports are checked, hashed ones take the next free, the ClusterIP never changes', () => {
    const s = go('kubectl apply -f k8s/cip.yaml', 'kubectl apply -f k8s/dns.yaml', 'kubectl apply -f k8s/np.yaml', 'kubectl apply -f k8s/np2.yaml', 'kubectl apply -f k8s/np3.yaml', 'kubectl apply -f k8s/svc.yaml', 'kubectl apply -f k8s/moved.yaml',
      'kubectl apply -f k8s/svc.yaml', 'kubectl get svc who-np');
    expect(s.log.map(l => l.err[0] ?? l.out[0]).slice(0, 8)).toEqual([
      'The Service "cip" is invalid: spec.clusterIPs: Invalid value: []string{"10.0.0.5"}: failed to allocate IP 10.0.0.5: provided IP is not in the valid range. The range of valid IPs is 10.96.0.0/12',
      'The Service "dns" is invalid: spec.clusterIPs: Invalid value: []string{"10.96.0.10"}: failed to allocate IP 10.96.0.10: provided IP is already allocated', 'service/who-np created',
      'The Service "np2" is invalid: spec.ports[0].nodePort: Invalid value: 30080: provided port is already allocated',
      'The Service "np3" is invalid: spec.ports[0].nodePort: Invalid value: 80: provided port is not in the valid range. The range of valid ports is 30000-32767', 'service/who created',
      'The Service "who" is invalid: spec.clusterIPs[0]: Invalid value: []string{"10.96.50.50"}: may not change once set', 'service/who unchanged']);
    expect(s.log[8].out[1]).toMatch(/^who-np\s+NodePort\s+10\.104\.89\.179\s+<none>\s+80:30080\/TCP\s+0s$/);
    // The allocators are deterministic and skip what others hold.
    const k = s.state.kube!, who = k.objects.find(o => o.kind === 'Service' && (o.metadata as { name: string }).name === 'who')!;
    const held = { ...k, objects: k.objects.map(o => o === who ? { ...o, metadata: { ...o.metadata as object, name: 'other' } } : o) };
    const again = allocate(held, { apiVersion: 'v1', kind: 'Service', metadata: { name: 'who', namespace: 'default' }, spec: { ports: [{ port: 80 }], type: 'ClusterIP' } });
    if (!('o' in again)) throw new Error('not allocated');
    expect((again.o.spec as { clusterIP: string }).clusterIP).toBe('10.99.237.61');
    // An explicit free address is kept as it is.
    expect(allocate(k, again.o)).toEqual({ o: again.o });
  });
});

describe('the endpoints and EndpointSlice controllers', () => {
  it('list the ready pods\' addresses with the named targetPort resolved in each pod; a pod without it is left out', () => {
    const s = go(...UP, 'kubectl apply -f k8s/odd.yaml', 'sleep 1', 'kubectl get ep', 'kubectl get endpointslices', 'kubectl get ep who -o yaml', 'kubectl get endpointslice who-bfcfp -o jsonpath={.endpoints[*].conditions.ready}');
    expect(s.log[4].out).toEqual(['NAME         ENDPOINTS                                         AGE', 'kubernetes   10.0.0.50:6443                                    30d', 'who          10.244.1.3:8080,10.244.1.4:8080,10.244.2.3:8080   6s']);
    expect(s.log[5].out).toEqual(['NAME         ADDRESSTYPE   PORTS     ENDPOINTS                          AGE', 'kubernetes   IPv4          6443      10.0.0.50                          30d', 'who-bfcfp    IPv4          8080      10.244.1.3,10.244.1.4,10.244.2.3   6s']);
    const yaml = s.log[6].out.join('\n');
    expect(yaml).toContain(['    endpoints.kubernetes.io/last-change-trigger-time: "2026-11-24T10:00:00Z"', '  creationTimestamp: "2026-11-24T10:00:00Z"', '  labels:', '    app: who', '  name: who'].join('\n'));
    expect(yaml).toContain(['  - ip: 10.244.2.3', '    nodeName: node-02', '    targetRef:', '      kind: Pod', '      name: who-9dj5vld8d2-9jpxl', '      namespace: default'].join('\n'));
    expect(yaml).toContain(['  ports:', '  - name: web', '    port: 8080', '    protocol: TCP'].join('\n'));
    expect(yaml).not.toContain('odd');
    expect(s.log[7].out).toEqual(['true true true']);
  });
  it('move pods between notReadyAddresses and addresses as their readiness changes (E33), and drop terminating ones (E34)', () => {
    const s = netOn(health, 'kubectl apply -f k8s/rd.yaml -f k8s/rd-svc.yaml', 'kubectl get ep rd', 'kubectl get ep rd -o jsonpath={.subsets[0].notReadyAddresses[*].ip}', 'sleep 25', 'kubectl get ep rd',
      'kubectl get ep rd -o jsonpath={.metadata.annotations}', 'kubectl scale deploy rd --replicas=1', 'kubectl get ep rd', `kubectl get endpointslices -l kubernetes.io/service-name=rd -o 'jsonpath={range .items[0].endpoints[*]}{.addresses[0]} {.conditions}{"\\n"}{end}'`);
    expect(s.log[1].out).toEqual(['NAME      ENDPOINTS   AGE', 'rd                    0s']);
    expect(s.log[2].out).toEqual(['10.244.1.3 10.244.2.2']);
    expect(s.log[4].out).toEqual(['NAME      ENDPOINTS                         AGE', 'rd        10.244.1.3:8080,10.244.2.2:8080   25s']);
    expect(s.log[5].out).toEqual(['{"endpoints.kubernetes.io/last-change-trigger-time":"2026-11-24T10:00:20Z"}']);
    expect(s.log[7].out).toEqual(['NAME      ENDPOINTS         AGE', 'rd        10.244.1.3:8080   25s']);
    expect(s.log[8].out).toEqual(['10.244.1.3 {"ready":true,"serving":true,"terminating":false}', '10.244.2.2 {"ready":false,"serving":true,"terminating":true}']);
  });
  it('drop the pods of a failed node once it is NotReady (E34)', () => {
    const failing = { ...lab, kube: { ...lab.kube, failures: [{ node: 'node-02', at: '2026-11-24 10:01:00' }] } };
    const s = netOn(failing, ...UP, 'kubectl get ep who', 'sleep 120', 'kubectl get ep who -o jsonpath={.subsets[0].notReadyAddresses[*].ip}', 'kubectl get ep who');
    expect(s.log[2].out[1]).toMatch(/^who\s+10\.244\.1\.3:8080,10\.244\.1\.4:8080,10\.244\.2\.3:8080\s/);
    expect(s.log[4].out).toEqual(['10.244.2.3']);
    expect(s.log[5].out[1]).toMatch(/^who\s+10\.244\.1\.3:8080,10\.244\.1\.4:8080\s/);
  });
  it('remove the objects with the Service, and describe them as kubectl does', () => {
    const s = go(...UP, 'kubectl describe svc who', 'kubectl describe ep who', 'kubectl delete svc who', 'kubectl get ep,endpointslices');
    expect(s.log[2].out).toEqual(['Name:                     who', 'Namespace:                default', 'Labels:                   app=who', 'Annotations:              <none>', 'Selector:                 app=who', 'Type:                     ClusterIP',
      'IP Family Policy:         SingleStack', 'IP Families:              IPv4', 'IP:                       10.99.237.60', 'IPs:                      10.99.237.60', 'Port:                     web  80/TCP', 'TargetPort:               http/TCP',
      'Endpoints:                10.244.1.3:8080,10.244.1.4:8080,10.244.2.3:8080', 'Session Affinity:         None', 'Internal Traffic Policy:  Cluster', 'Events:                   <none>']);
    expect(s.log[3].out).toEqual(['Name:         who', 'Namespace:    default', 'Labels:       app=who', 'Annotations:  endpoints.kubernetes.io/last-change-trigger-time: 2026-11-24T10:00:00Z', 'Subsets:',
      '  Addresses:          10.244.1.3,10.244.1.4,10.244.2.3', '  NotReadyAddresses:  <none>', '  Ports:', '    Name  Port  Protocol', '    ----  ----  --------', '    web   8080  TCP', '', 'Events:  <none>']);
    expect(s.log[4].out).toEqual(['service "who" deleted']);
    expect(s.log[5].out.join('\n')).not.toMatch(/^who/m);
  });
});

describe('expose and create service', () => {
  it('generate the objects kubectl writes', () => {
    const s = go(...UP, 'kubectl expose deploy who --port=80 --target-port=8080 --dry-run=client -o yaml', 'kubectl create service nodeport web --tcp=80:8080 --node-port=30111 --dry-run=client -o yaml',
      'kubectl expose pod client', 'kubectl expose deploy who --name=who2 --type=NodePort', 'kubectl get svc who2', 'kubectl expose deploy who', 'kubectl create service clusterip db --clusterip=None',
      'kubectl create service clusterip db --tcp=5432', 'kubectl create service externalname x', 'kubectl expose node node-01 --port=80', 'kubectl create service clusterip who --tcp=80');
    expect(s.log[2].out).toEqual(['apiVersion: v1', 'kind: Service', 'metadata:', '  creationTimestamp: null', '  name: who', 'spec:', '  ports:', '  - port: 80', '    protocol: TCP',
      '    targetPort: 8080', '  selector:', '    app: who', 'status:', '  loadBalancer: {}']);
    expect(s.log[3].out).toEqual(['apiVersion: v1', 'kind: Service', 'metadata:', '  creationTimestamp: null', '  labels:', '    app: web', '  name: web', 'spec:', '  ports:', '  - name: 80-8080', '    nodePort: 30111',
      '    port: 80', '    protocol: TCP', '    targetPort: 8080', '  selector:', '    app: web', '  type: NodePort', 'status:', '  loadBalancer: {}']);
    expect(s.log[4].err).toEqual(["error: couldn't retrieve selectors via --selector flag or introspection: the pod has no labels and cannot be exposed"]);
    expect(s.log[5].out).toEqual(['service/who2 exposed']);
    expect(s.log[6].out[1]).toMatch(/^who2\s+NodePort\s+\S+\s+<none>\s+8080:3\d{4}\/TCP\s+0s$/);
    expect(s.log.slice(7).map(l => l.err[0] ?? l.out[0])).toEqual(['Error from server (AlreadyExists): services "who" already exists', 'service/db created', 'error: failed to create ClusterIP service: services "db" already exists',
      '（模擬環境：ExternalName 的 Service 只在課文說明）', 'error: cannot expose a Node', 'error: failed to create ClusterIP service: services "who" already exists']);
  });
});

describe('LoadBalancer Services', () => {
  it('stay <pending> without a pool; with one they get its addresses in order (IPAllocated), until it runs out', () => {
    const none = go(...UP, 'kubectl apply -f k8s/lb.yaml', 'kubectl get svc lb1');
    expect(none.log[3].out[1]).toMatch(/^lb1\s+LoadBalancer\s+\S+\s+<pending>\s+80:3\d{4}\/TCP\s+0s$/);
    const s = netOn(lbLab, ...UP, 'kubectl expose deploy who --name=a --type=LoadBalancer --port=80', 'kubectl expose deploy who --name=b --type=LoadBalancer --port=80', 'kubectl expose deploy who --name=c --type=LoadBalancer --port=80',
      'kubectl get svc a b c', 'kubectl events --for svc/c', 'kubectl describe svc a', 'kubectl delete svc a', 'kubectl get svc c');
    expect(s.log[5].out.map(l => l.split(/\s+/).slice(0, 4).join(' '))).toEqual(['NAME TYPE CLUSTER-IP EXTERNAL-IP', expect.stringMatching(/^a LoadBalancer \S+ 10\.0\.0\.200$/), expect.stringMatching(/^b LoadBalancer \S+ 10\.0\.0\.201$/), expect.stringMatching(/^c LoadBalancer \S+ <pending>$/)]);
    expect(s.log[6].out[1]).toMatch(/Warning\s+AllocationFailed\s+Service\/c\s+Failed to allocate IP for "default\/c": no available IPs$/);
    expect(s.log[7].out).toContain('LoadBalancer Ingress:     10.0.0.200 (VIP)');
    expect(s.log[7].out.slice(-3)).toEqual(['  Type    Reason       Age   From                Message', '  ----    ------       ----  ----                -------', '  Normal  IPAllocated  0s    metallb-controller  Assigned IP ["10.0.0.200"]']);
    expect(s.log[9].out[1]).toMatch(/^c\s+LoadBalancer\s+\S+\s+10\.0\.0\.200\s/);
  });
});

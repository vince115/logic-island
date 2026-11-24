import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, describeCheck, machineState, terminalContentProblems, variantMachine, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { candidates } from '@/lib/terminal/kube-dns';
import { lbLab, netLab, netOn, UP, withNetFiles } from './support/net-fixture';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §5–§9): the cluster's network — CoreDNS and a pod's resolver
 * (search list, ndots:5, headless names), kube-proxy's round-robin over ready endpoints in address order (across execs and
 * inside a loop), refused Services, NodePorts and LoadBalancers from the learner's machine and unreachable ClusterIPs and
 * pod addresses, kubectl port-forward as a job, nslookup and wget in pods, the kube-service check and http/reach from a
 * pod, variants and determinism.
 */
const y = (...l: string[]) => [...l, ''].join('\n');
const svc = (name: string, spec: string[]) => y('apiVersion: v1', 'kind: Service', 'metadata:', `  name: ${name}`, 'spec:', ...spec.map(l => `  ${l}`));
const lab = withNetFiles(lbLab, {
  'hl.yaml': svc('hl', ['clusterIP: None', 'selector:', '  app: who', 'ports:', '- port: 8080']),
  'none.yaml': svc('none', ['selector:', '  app: nobody', 'ports:', '- port: 80']),
  'deaf.yaml': svc('deaf', ['selector:', '  app: who', 'ports:', '- port: 80', '  targetPort: 9999']),
});
const go = (...commands: string[]) => netOn(lab, ...commands);
const ex = (cmd: string) => `kubectl exec client -- ${cmd}`;
const host = (out: string[]) => out[0]?.replace('Hostname: ', '');
const [A, B, C] = ['who-9dj5vld8d2-n4gps', 'who-9dj5vld8d2-lmf8x', 'who-9dj5vld8d2-9jpxl'];

describe('cluster DNS in pods', () => {
  it('has the kubelet\'s files and resolves Services through the search list with ndots:5', () => {
    const s = go(...UP, ex('cat /etc/resolv.conf'), ex('cat /etc/hosts'), ex('getent hosts who'), ex('getent hosts who.default'), ex('getent hosts who.default.svc'), ex('getent hosts who.default.svc.cluster.local.'),
      ex('getent hosts kubernetes'), ex('getent hosts kube-dns.kube-system'), ex('getent hosts 10-244-1-3.default.pod.cluster.local'), ex('getent hosts nope'), ex('getent hosts client'));
    expect(s.log[2].out).toEqual(['search default.svc.cluster.local svc.cluster.local cluster.local', 'nameserver 10.96.0.10', 'options ndots:5']);
    expect(s.log[3].out).toEqual(['# Kubernetes-managed hosts file.', '127.0.0.1\tlocalhost', '::1\tlocalhost ip6-localhost ip6-loopback', 'fe00::0\tip6-localnet', 'fe00::0\tip6-mcastprefix', 'fe00::1\tip6-allnodes', 'fe00::2\tip6-allrouters', '10.244.2.2\tclient']);
    expect(s.log.slice(4, 11).map(l => l.out[0])).toEqual(['10.99.237.60    who.default.svc.cluster.local', '10.99.237.60    who.default.svc.cluster.local', '10.99.237.60    who.default.svc.cluster.local', '10.99.237.60    who.default.svc.cluster.local',
      '10.96.0.1       kubernetes.default.svc.cluster.local', '10.96.0.10      kube-dns.kube-system.svc.cluster.local', '10.244.1.3      10-244-1-3.default.pod.cluster.local']);
    expect([s.log[11].out, s.log[11].err, s.log[11].status]).toEqual([[], ['command terminated with exit code 2'], 2]);
    expect(s.log[12].out).toEqual(['10.244.2.2      client']);
    // The writable layer is untouched by the kubelet's files.
    expect([...s.state.kube!.pods[Object.keys(s.state.kube!.pods).find(id => s.state.kube!.pods[id].ip === '10.244.2.2')!].main[0].layer?.keys() ?? []]).not.toContain('/etc/resolv.conf');
  });
  it('a pod of another namespace finds short names in its own namespace only', () => {
    const s = go(...UP, 'kubectl create namespace dev', 'kubectl run t -n dev --image=team/toolbox:1.0', 'sleep 1', 'kubectl exec -n dev t -- cat /etc/resolv.conf', 'kubectl exec -n dev t -- getent hosts who', 'kubectl exec -n dev t -- getent hosts who.default');
    expect(s.log[5].out[0]).toBe('search dev.svc.cluster.local svc.cluster.local cluster.local');
    expect([s.log[6].out, s.log[6].status]).toEqual([[], 2]);
    expect(s.log[7].out).toEqual(['10.99.237.60    who.default.svc.cluster.local']);
    expect(candidates('who', { search: ['dev.svc.cluster.local', 'svc.cluster.local', 'cluster.local'], ndots: 5 })).toEqual(['who.dev.svc.cluster.local', 'who.svc.cluster.local', 'who.cluster.local', 'who']);
    expect(candidates('a.b.c.d.e.f', { search: ['x'], ndots: 5 })).toEqual(['a.b.c.d.e.f', 'a.b.c.d.e.f.x']);
  });
  it('a headless Service names its ready pods; nslookup prints each record', () => {
    const s = go(...UP, 'kubectl apply -f k8s/hl.yaml', 'kubectl get svc hl', ex('getent hosts hl'), ex('nslookup hl'), ex('nslookup who'), ex('nslookup nope'));
    expect(s.log[3].out[1]).toMatch(/^hl\s+ClusterIP\s+None\s+<none>\s+8080\/TCP\s+0s$/);
    expect(s.log[4].out).toEqual(['10.244.1.3      hl.default.svc.cluster.local', '10.244.1.4      hl.default.svc.cluster.local', '10.244.2.3      hl.default.svc.cluster.local']);
    expect(s.log[5].out).toEqual(['Server:\t\t10.96.0.10', 'Address:\t10.96.0.10#53', '', 'Name:\thl.default.svc.cluster.local', 'Address: 10.244.1.3', 'Name:\thl.default.svc.cluster.local', 'Address: 10.244.1.4',
      'Name:\thl.default.svc.cluster.local', 'Address: 10.244.2.3', '']);
    expect(s.log[6].out.slice(3, 5)).toEqual(['Name:\twho.default.svc.cluster.local', 'Address: 10.99.237.60']);
    expect([s.log[7].out.slice(3), s.log[7].status]).toEqual([["** server can't find nope: NXDOMAIN", ''], 1]);
  });
});

describe('kube-proxy', () => {
  it('sends each new connection to the next ready endpoint in address order, across execs and in a loop', () => {
    const s = go(...UP, ex('curl -s who'), ex('curl -s who'), ex('curl -s who'), ex('curl -s who'), ex("sh -c 'for i in 1 2 3; do curl -s who.default; done'"), ex('wget -qO- http://who'), ex('curl -s who who'));
    expect(s.log.slice(2, 6).map(l => host(l.out))).toEqual([A, B, C, A]);
    expect(s.log[2].out).toEqual([`Hostname: ${A}`, 'IP: 10.244.1.3']);
    expect(s.log[6].out.filter(l => l.startsWith('Hostname')).map(l => l.slice(10))).toEqual([B, C, A]);
    expect(host(s.log[7].out)).toBe(B);
    // One connection reused for both URLs: the same endpoint answers twice.
    expect(s.log[8].out.filter(l => l.startsWith('Hostname')).map(l => l.slice(10))).toEqual([C, C]);
    expect(s.state.kube!.turns).toEqual({ 'default/who/web': 9 });
  });
  it('refuses a Service without ready endpoints (or whose endpoint does not listen); pod addresses answer directly', () => {
    const s = go(...UP, 'kubectl apply -f k8s/none.yaml -f k8s/deaf.yaml', ex('curl -sS none'), ex('curl -sS deaf'), ex('curl -s 10.244.2.3:8080/health'), ex('nc -zv who 80'), ex('nc -zv none 80'));
    expect(s.log[3].err).toEqual(['curl: (7) Failed to connect to none port 80 after 0 ms: Couldn\'t connect to server', 'command terminated with exit code 7']);
    expect(s.log[4].err[0]).toBe('curl: (7) Failed to connect to deaf port 80 after 0 ms: Couldn\'t connect to server');
    expect(s.log[5].out).toEqual(['ok']);
    expect(s.log[6].err).toEqual(['Connection to who (10.99.237.60) 80 port [tcp/*] succeeded!']);
    expect(s.log[7].err[0]).toMatch(/^nc: connect to none \(10\.\d+\.\d+\.\d+\) port 80 \(tcp\) failed: Connection refused$/);
  });
  it('from the learner\'s machine: NodePorts on every node and LoadBalancer addresses answer; ClusterIPs and pod addresses time out', () => {
    const s = go(...UP, 'kubectl apply -f k8s/np.yaml', 'kubectl expose deploy who --name=lb --type=LoadBalancer --port=80 --target-port=8080', 'curl -s 10.0.0.50:30080', 'curl -s 10.0.0.51:30080', 'curl -s 10.0.0.52:30080', 'curl -s 10.0.0.200',
      'curl -sS --connect-timeout 2 10.99.237.60', 'curl -sS --connect-timeout 2 10.244.1.3:8080', 'nc -zv 10.0.0.51 30080', 'nc -zv 10.0.0.51 30081', 'curl -sS --connect-timeout 2 10.0.0.201');
    expect([4, 5, 6, 7].map(i => host(s.log[i].out))).toEqual([A, B, C, A]);
    expect(s.log[8].err).toEqual(['curl: (28) Failed to connect to 10.99.237.60 port 80 after 2000 ms: Timeout was reached']);
    expect(s.log[9].err).toEqual(['curl: (28) Failed to connect to 10.244.1.3 port 8080 after 2000 ms: Timeout was reached']);
    expect(s.log[10].err).toEqual(['Connection to 10.0.0.51 30080 port [tcp/*] succeeded!']);
    expect(s.log[11].err).toEqual(['nc: connect to 10.0.0.51 port 30081 (tcp) failed: Connection refused']);
    expect(s.log[12].status).toBe(28);
    expect(s.state.net!.hosts).toEqual([]);
    expect(s.state.kube!.turns).toEqual({ 'default/lb/80': 1, 'default/who-np/80': 4 });
  });
});

describe('kubectl port-forward', () => {
  it('with & is a job listening on 127.0.0.1 until it ends; kubectl says it handles each connection', () => {
    const s = go(...UP, 'kubectl port-forward svc/who 8080:80 &', 'curl -s localhost:8080', 'curl -s 127.0.0.1:8080/health', 'ss -tlnp', 'jobs', 'kill %1', 'curl -sS localhost:8080', 'kubectl port-forward pod/client 9090:9090 &', 'curl -sS localhost:9090');
    expect(s.log[2].out).toEqual(['[1] 901', 'Forwarding from 127.0.0.1:8080 -> 8080', 'Forwarding from [::1]:8080 -> 8080']);
    expect([s.log[3].out, s.log[3].err]).toEqual([[`Hostname: ${C}`, 'IP: 10.244.2.3'], ['Handling connection for 8080']]);
    expect([s.log[4].out, s.log[4].err]).toEqual([['ok'], ['Handling connection for 8080']]);
    expect(s.log[5].out.at(-1)).toBe('LISTEN 0      4096       127.0.0.1:8080      0.0.0.0:*    users:(("kubectl",pid=901,fd=8))');
    expect(s.log[6].out).toEqual(['[1]+  Running                 kubectl port-forward svc/who 8080:80 &']);
    expect(s.log[7].out).toEqual(['[1]+  Terminated              kubectl port-forward svc/who 8080:80']);
    expect(s.log[8].err).toEqual(['curl: (7) Failed to connect to localhost port 8080 after 0 ms: Couldn\'t connect to server']);
    expect(s.log[10].err).toEqual(['Handling connection for 9090', 'curl: (52) Empty reply from server']);
  });
  it('without & prints the lines and a note; errors are kubectl\'s', () => {
    const s = go(...UP, 'kubectl port-forward deploy/who 8081:http', 'kubectl port-forward svc/who 8080:81', 'kubectl port-forward pod/nope 80', 'kubectl port-forward svc/who', 'kubectl port-forward pod/client :80',
      'kubectl port-forward pod/client 8080:web', 'kubectl port-forward pod/client 80:80 &', 'kubectl port-forward pod/client 8080:80 &', 'kubectl port-forward pod/client 8080:80 &');
    expect(s.log[2].out).toEqual(['Forwarding from 127.0.0.1:8081 -> 8080', 'Forwarding from [::1]:8081 -> 8080']);
    expect(s.log[2].err[0]).toMatch(/^（模擬環境：kubectl port-forward 會一直執行到按 Ctrl\+C/);
    expect(s.log.slice(3, 9).map(l => l.err[0])).toEqual(['error: Service who does not have a service port 81', 'Error from server (NotFound): pods "nope" not found', 'error: TYPE/NAME and list of ports are required for port-forward',
      '（模擬環境：port-forward 需要寫出本機的埠，例如 8080:80，不能讓系統挑一個隨機的埠）', "error: Pod 'client' does not have a named port 'web'",
      'Unable to listen on port 80: Listeners failed to create with the following errors: [unable to create listener: Error listen tcp4 127.0.0.1:80: bind: permission denied unable to create listener: Error listen tcp6 [::1]:80: bind: permission denied]']);
    expect(s.log[10].err).toEqual(['Unable to listen on port 8080: Listeners failed to create with the following errors: [unable to create listener: Error listen tcp4 127.0.0.1:8080: bind: address already in use unable to create listener: Error listen tcp6 [::1]:8080: bind: address already in use]',
      'error: unable to listen on any of the requested ports: [{8080 80}]']);
  });
  it('stops listening when its pod is gone', () => {
    const s = go(...UP, 'kubectl port-forward pod/client 8080:80 &', 'kubectl delete pod client --grace-period=0 --force', 'curl -sS localhost:8080');
    expect(s.log[4].err).toEqual(['curl: (7) Failed to connect to localhost port 8080 after 0 ms: Couldn\'t connect to server']);
  });
});

describe('nslookup and wget in pods', () => {
  it('wget is BusyBox\'s: -qO-, its messages and errors', () => {
    const s = go(...UP, 'kubectl apply -f k8s/none.yaml', ex('wget -O- who/health'), ex('wget -qO- none'), ex('wget -qO- nope'), ex('wget -q -O /tmp/x who'), ex('wget -qO- http://who/missing'), 'kubectl exec hello -- wget -qO- who');
    expect([s.log[3].out, s.log[3].err]).toEqual([['ok'], ['Connecting to who (10.99.237.60:80)', 'writing to stdout', 'written to stdout']]);
    expect(s.log[4].err[0]).toMatch(/^wget: can't connect to remote host \(10\.\d+\.\d+\.\d+\): Connection refused$/);
    expect(s.log[5].err).toEqual(["wget: bad address 'nope'", 'command terminated with exit code 1']);
    expect(s.log[6].err[0]).toBe('wget：模擬環境的 wget 只把內容印到標準輸出，請加上 -O -（例如 wget -qO- http://web）');
    expect(s.log[7].err[0]).toBe('wget: server returned error: HTTP/1.1 404 Not Found');
    expect(s.log[8].err[0]).toMatch(/exec: "wget": executable file not found in \$PATH: unknown$/);
  });
});

const exercise = (checks: TerminalCheck[], solution: string[], machine: TerminalMachine = lab) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: machine.id, statement: '', checks, solution: [], mistakes: [], hints: [], explanation: '' }, [machine], solution);
const content = (checks: TerminalCheck[], machine: TerminalMachine = lab) => terminalContentProblems({ machines: [machine], examples: [], exercises: [
  { id: 'w', title: 'x', machine: machine.id, statement: 'x', checks, solution: [...UP], mistakes: [{ commands: ['kubectl get pods'], why: 'x' }], hints: [], explanation: 'x' }] });

describe('the kube-service check and http/reach from a pod', () => {
  it('pass on what the commands made and say why not otherwise', () => {
    const checks: TerminalCheck[] = [{ kind: 'kube-service', name: 'who', type: 'ClusterIP', clusterIP: true, ports: [{ port: 80, targetPort: 'http' }], selector: { app: 'who' }, readyEndpoints: 3, addresses: ['10.244.2.3', '10.244.1.3', '10.244.1.4'] },
      { kind: 'kube-service', name: 'who-np', type: 'NodePort', ports: [{ port: 80, nodePort: 30080 }] },
      { kind: 'http', url: 'http://who/health', pod: 'client', body: 'ok' }, { kind: 'http', url: 'http://10.0.0.51:30080/health', status: 200 }, { kind: 'reach', to: 'who', port: 80, pod: 'client', result: 'succeeded' },
      { kind: 'reach', to: '10.99.237.60', port: 80, result: 'timeout' }, { kind: 'reach', to: 'who.default.svc.cluster.local', port: 81, pod: 'default/client', result: 'refused' }];
    expect(exercise(checks, [...UP, 'kubectl apply -f k8s/np.yaml']).results.filter(r => !r.ok).map(r => r.message)).toEqual([]);
    const early = exercise(checks, ['kubectl apply -f k8s/svc.yaml']).results.map(r => r.ok ? 'ok' : r.message.split('，但')[1]);
    expect(early).toEqual(['who 有 0 個就緒的端點', '沒有名為 who-np 的 Service', '沒有名為 client 的 Pod', '連不到 10.0.0.51', '沒有名為 client 的 Pod', 'ok', '沒有名為 default/client 的 Pod']);
    const wrong = exercise([{ kind: 'kube-service', name: 'who', type: 'NodePort' }, { kind: 'kube-service', name: 'who', clusterIP: false }, { kind: 'kube-service', name: 'who', ports: [{ port: 80, targetPort: 8080 }] },
      { kind: 'kube-service', name: 'who', selector: { app: 'web' } }, { kind: 'kube-service', name: 'who', externalIP: '10.0.0.200' }, { kind: 'http', url: 'http://who/', pod: 'client', body: 'zzz' }], UP);
    expect(wrong.results.map(r => r.message.split('，但')[1])).toEqual(['who 的類型是 ClusterIP', 'who 的 ClusterIP 是 10.99.237.60', 'who 的 80 埠轉到 http', 'who 的 selector 是 app=who', 'who 的 EXTERNAL-IP 是 <none>', '內容不包含題目要的文字']);
  });
  it('are described in words and validated', () => {
    expect(describeCheck({ kind: 'kube-service', name: 'web', type: 'NodePort', ports: [{ port: 80, targetPort: 8080, nodePort: 30080 }], readyEndpoints: 3 })).toBe('default 命名空間應該有名為 web 的 Service（類型 NodePort、80 埠轉到 8080（NodePort 30080）、3 個就緒的端點）');
    expect(describeCheck({ kind: 'http', url: 'http://web/', pod: 'client', status: 200 })).toBe('從 Pod client GET http://web/ 應該回應狀態碼 200');
    expect(describeCheck({ kind: 'reach', to: 'web', port: 80, pod: 'client', result: 'refused' })).toBe('從 Pod client 連到 web 的 80 埠應該被拒絕（Connection refused）');
    expect(content([{ kind: 'kube-service', name: 'web' }])).toContain('exercise w: a kube-service check checks type, clusterIP, ports, selector, readyEndpoints, addresses or externalIP');
    expect(content([{ kind: 'kube-service', name: 'web', ports: [{ port: 0 }] }])).toContain('exercise w: a kube-service check\'s ports are { port, targetPort?, nodePort?, protocol? } with ports 1..65535');
    expect(content([{ kind: 'http', url: 'http://web/', pod: 'Client!' }])).toContain('exercise w: pod is a pod name (or namespace/name)');
    expect(content([{ kind: 'reach', from: 'x', to: 'web', port: 80, pod: 'client', result: 'succeeded' }])).toContain('exercise w: a reach check has a from or a pod, not both');
    const lower: TerminalMachine = { ...lab, profile: 'workloads', kube: { ...lab.kube, lbPool: undefined }, docker: { images: lab.docker!.images!.filter(i => i.name !== 'team/toolbox:1.0') } };
    expect(content([{ kind: 'kube-service', name: 'web', type: 'NodePort' }, { kind: 'http', url: 'http://web/', pod: 'client' }], lower)).toEqual(expect.arrayContaining(['exercise w: a kube-service check needs a kube-net machine (engine stage E35)', 'exercise w: pod needs a kube-net machine (engine stage E35)']));
    expect(content([{ kind: 'kube-service', name: 'who', readyEndpoints: 3 }, { kind: 'reach', to: 'who', port: 80, pod: 'client', result: 'succeeded' }])).toEqual([]);
  });
});

describe('variants and determinism', () => {
  it('a variant\'s cluster has its own pool; the same commands give the same cluster', () => {
    const v = variantMachine(lab, { label: 'v', files: [], kube: { ...lab.kube, lbPool: ['10.0.0.210'] } });
    const s = netOn(v, ...UP, 'kubectl expose deploy who --name=lb --type=LoadBalancer --port=80', 'kubectl get svc lb -o jsonpath={.status.loadBalancer.ingress[0].ip}');
    expect(s.log[3].out).toEqual(['10.0.0.210']);
    const a = go(...UP, ex('curl -s who')), b = go(...UP, ex('curl -s who'));
    expect(JSON.stringify(a.state.kube)).toBe(JSON.stringify(b.state.kube));
    expect(machineState(netLab).kube!.net).toBe(true);
  });
});

describe('the cluster machine\'s clock (KUB-4)', () => {
  it('responses from pods carry the Date of the machine the cluster runs on, and it moves with sleep', () => {
    const s = go(...UP, 'date', ex('curl -sI who'), 'sleep 60', ex('curl -sI who'));
    const date = (out: string[]) => out.find(l => l.startsWith('Date: '));
    expect(s.log[2].out[0]).toMatch(/^Tue Nov 24 /);
    expect(date(s.log[3].out)).toMatch(/^Date: Tue, 24 Nov 2026 \d\d:\d\d:\d\d GMT$/);
    expect(date(s.log[5].out)).not.toBe(date(s.log[3].out));
  });
});

import { describe, expect, it } from 'vitest';
import { CLUSTER_PROFILE, PROBES_PROFILE, PROFILES } from '@/lib/terminal/shell';
import { checkTerminalExercise, describeCheck, machineProblems, machineState, profileOf, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { settleKube } from '@/lib/terminal/kube-settle';
import { kubeOn } from './support/kube-fixture';
import { health, pod, probes, probesLab, probesOn, withFiles } from './support/probes-fixture';

/*
 * Engine stage E33 (docs/curriculum/KUB0_E33_PROBES.md): the probes profile — liveness, readiness and startup probes
 * (httpGet, tcpSocket, exec) with their thresholds over the clock, the lesson's time-dependent health, the READY column,
 * the Ready condition, Unhealthy and Killing events, liveness restarts with the kubelet's back-off, preStop hooks, SIGTERM
 * and the grace period, Terminating, kubectl delete waiting, kubectl wait, the kube-pod checks ready and restartsAtLeast,
 * the boundary below the profile, and the custom-columns --no-headers fix.
 */
const LIVE = ['livenessProbe:', '  httpGet:', '    path: /healthz', '    port: 8080', '  periodSeconds: 5'];
const READY = ['readinessProbe:', '  httpGet:', '    path: /ready', '    port: 8080', '  periodSeconds: 5'];
const sick = health([{ image: 'team/web:1.0', paths: [{ path: '/healthz', status: 500, after: 30 }, { path: '/ready', status: 503 }] }]);
const lab = withFiles(sick, {
  'live.yaml': pod('live', 'team/web:1.0', LIVE), 'never.yaml': pod('never', 'team/web:1.0', READY), 'once.yaml': pod('once', 'team/web:1.0', LIVE, ['restartPolicy: Never']),
  'slow.yaml': pod('slow', 'team/slow:1.0', ['ports:', '- name: http', '  containerPort: 8080', 'startupProbe:', '  tcpSocket:', '    port: http', '  periodSeconds: 5', '  failureThreshold: 10',
    'livenessProbe:', '  tcpSocket:', '    port: 8080', 'readinessProbe:', '  httpGet:', '    path: /', '    port: http']),
  'late.yaml': pod('late', 'team/slow:1.0', ['startupProbe:', '  tcpSocket:', '    port: 8080', '  periodSeconds: 5', '  failureThreshold: 2']),
  'ex.yaml': pod('ex', 'busybox:1.36', ['command: ["sh", "-c", "touch /tmp/healthy; sleep 3600"]', 'livenessProbe:', '  exec:', '    command: ["cat", "/tmp/healthy"]', '  periodSeconds: 5', '  failureThreshold: 1']),
  'stub.yaml': pod('stub', 'team/stubborn:1.0', ['lifecycle:', '  preStop:', '    exec:', '      command: ["sh", "-c", "sleep 5"]']),
  'hook.yaml': pod('hook', 'team/web:1.0', ['lifecycle:', '  preStop:', '    httpGet:', '      path: /drain', '      port: 8080'], ['terminationGracePeriodSeconds: 10']),
  'wrong.yaml': pod('wrong', 'team/web:1.0', ['livenessProbe:', '  periodSeconds: -1', '  successThreshold: 2', 'readinessProbe:', '  httpGet:', '    port: 0', '  tcpSocket:', '    port: 80', 'startupProbe:', '  exec: {}', 'lifecycle:', '  preStop: {}']),
});
const go = (...commands: string[]) => probesOn(lab, ...commands);
const row = (out: string[], name: string) => out.find(l => l.startsWith(`${name} `)) ?? '';
const exercise = (checks: TerminalCheck[], solution: string[]) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: lab.id, statement: '', checks, solution: [], mistakes: [], hints: [], explanation: '' }, [lab], solution);

describe('the probes profile', () => {
  it('is the cluster profile with the probes feature and no new commands', () => {
    expect(PROBES_PROFILE.commands).toEqual(CLUSTER_PROFILE.commands);
    expect(PROBES_PROFILE.features).toEqual([...CLUSTER_PROFILE.features!, 'probes']);
    expect(PROFILES.probes).toBe(PROBES_PROFILE);
    expect(profileOf(lab)).toBe(PROBES_PROFILE);
    expect(machineProblems(lab)).toEqual([]);
  });
  it('below it the probe fields are a later stage, health is refused and deleting is immediate', () => {
    const low = { ...lab, profile: 'cluster' as const };
    expect(machineProblems(low)).toEqual(['machine kub-33: kube: health needs the probes profile (engine stage E33)']);
    const s = kubeOn({ ...low, kube: { ...low.kube, health: undefined } }, 'kubectl apply -f k8s/live.yaml', 'kubectl run w --image=team/web:1.0', 'sleep 1', 'kubectl delete pod w', 'date');
    expect(s.log[0].err).toEqual(['（模擬環境：spec.containers[0].livenessProbe 要到引擎階段 E33 才模擬）']);
    expect(s.log[4].out).toEqual(['Tue Nov 24 10:00:01 UTC 2026']);
  });
  it('validates probes and hooks in the API server\'s words, strictly decoded', () => {
    const s = go('kubectl apply -f k8s/wrong.yaml', "printf 'livenessProbe:\\n  httpGet:\\n    pth: /x\\n    port: 8080\\n' > t", "printf 'livenessProbe:\\n  grpc:\\n    port: 9000\\n' > g",
      "printf 'apiVersion: v1\\nkind: Pod\\nmetadata:\\n  name: i\\nspec:\\n  initContainers:\\n  - name: i\\n    image: busybox:1.36\\n    readinessProbe:\\n      exec:\\n        command: [\"true\"]\\n  containers:\\n  - name: m\\n    image: busybox:1.36\\n' > i.yaml",
      'kubectl apply -f i.yaml', "printf 'apiVersion: v1\\nkind: Pod\\nmetadata:\\n  name: p\\nspec:\\n  containers:\\n  - name: m\\n    image: team/web:1.0\\n    livenessProbe:\\n      periodSeconds: \"10\"\\n      tcpSocket:\\n        port: 80\\n' > p.yaml", 'kubectl apply -f p.yaml');
    expect(s.log[0].err).toEqual(['The Pod "wrong" is invalid: ', '* spec.containers[0].livenessProbe: Required value: must specify a handler type', '* spec.containers[0].livenessProbe.periodSeconds: Invalid value: -1: must be greater than or equal to 0',
      '* spec.containers[0].livenessProbe.successThreshold: Invalid value: 2: must be 1', '* spec.containers[0].readinessProbe: Forbidden: may not specify more than 1 handler type', '* spec.containers[0].startupProbe.exec.command: Required value',
      '* spec.containers[0].lifecycle.preStop: Required value: must specify a handler type']);
    expect(s.log[4].err).toEqual(['The Pod "i" is invalid: spec.initContainers[0].readinessProbe: Forbidden: may not be set for init containers without restartPolicy=Always']);
    expect(s.log[6].err[0]).toBe('Error from server (BadRequest): error when creating "p.yaml": Pod in version "v1" cannot be handled as a Pod: json: cannot unmarshal string into Go struct field Probe.spec.containers.livenessProbe.periodSeconds of type int32');
    const t = probesOn(withFiles(sick, { 'typo.yaml': pod('typo', 'team/web:1.0', ['livenessProbe:', '  httpGet:', '    pth: /x', '    port: 8080']), 'grpc.yaml': pod('grpc', 'team/web:1.0', ['livenessProbe:', '  grpc:', '    port: 9000']) }),
      'kubectl apply -f k8s/typo.yaml', 'kubectl apply -f k8s/grpc.yaml');
    expect(t.log[0].err).toEqual(['Error from server (BadRequest): error when creating "k8s/typo.yaml": Pod in version "v1" cannot be handled as a Pod: strict decoding error: unknown field "spec.containers[0].livenessProbe.httpGet.pth"']);
    expect(t.log[1].err).toEqual(['（模擬環境：spec.containers[0].livenessProbe.grpc 要到引擎階段 （課文說明） 才模擬）']);
  });
  it('validates the lesson\'s health', () => {
    expect(machineProblems(health([{ image: 'team/nope:1.0' }, { image: 'team/web:1.0', listenAfter: -1, paths: [{ path: 'x', status: 9 }], exec: [{ command: [], after: 5, until: 5 }] }]))).toEqual([
      'machine kub-33: kube: health team/nope:1.0: image is one of the machine\'s docker images', 'machine kub-33: kube: health team/web:1.0: listenAfter is 0..3600 seconds',
      'machine kub-33: kube: health team/web:1.0: paths are at most 8 of { path: /…, status 100..599, delay 0..600, after, until > after (seconds since the start) }',
      'machine kub-33: kube: health team/web:1.0: exec is at most 8 of { command: words, exit 0..255, output (one line), seconds 0..600, after, until > after }']);
  });
  it('defaults the probes as the API server does and describes them', () => {
    const s = go('kubectl apply -f k8s/slow.yaml', 'kubectl get pod slow -o jsonpath={.spec.containers[0].readinessProbe}', 'kubectl describe pod slow');
    expect(s.log[1].out).toEqual(['{"failureThreshold":3,"httpGet":{"path":"/","port":"http","scheme":"HTTP"},"periodSeconds":10,"successThreshold":1,"timeoutSeconds":1}']);
    expect(s.log[2].out).toEqual(expect.arrayContaining(['    Liveness:       tcp-socket :8080 delay=0s timeout=1s period=10s #success=1 #failure=3', '    Readiness:      http-get http://:http/ delay=0s timeout=1s period=10s #success=1 #failure=3',
      '    Startup:        tcp-socket :http delay=0s timeout=1s period=5s #success=1 #failure=10']));
  });
});

describe('liveness', () => {
  it('kills at exactly failureThreshold failures in a row, then restarts with the back-off', () => {
    // /healthz answers 500 from 30 s: failures at 30, 35 (below the threshold) and 40 (Killing; SIGTERM handled in 3 s).
    const s = go('kubectl apply -f k8s/live.yaml', 'sleep 39', 'kubectl get pod live', 'sleep 1', 'kubectl events --for pod/live', 'sleep 3', 'kubectl get pod live', 'kubectl logs live --previous', 'sleep 157', 'kubectl get pod live', 'kubectl events --for pod/live --types=Warning');
    expect(row(s.log[2].out, 'live')).toMatch(/^live\s+1\/1\s+Running\s+0\s+39s$/);
    expect(s.log[4].out.slice(-2)).toEqual([expect.stringMatching(/^0s \(x3 over 10s\)\s+Warning\s+Unhealthy\s+Pod\/live\s+Liveness probe failed: HTTP probe failed with statuscode: 500$/),
      expect.stringMatching(/^0s\s+Normal\s+Killing\s+Pod\/live\s+Container live failed liveness probe, will be restarted$/)]);
    expect(row(s.log[6].out, 'live')).toMatch(/^live\s+1\/1\s+Running\s+1 \(0s ago\)\s+43s$/);
    expect(s.log[7].out).toEqual(['listening on :8080', 'shutting down']);
    // Runs of 43 s: restarts at 43 (at once), 96 (exit 86, 10 s back-off), 159 (exit 139, 20 s back-off).
    expect(row(s.log[9].out, 'live')).toMatch(/^live\s+1\/1\s+Running\s+3 \(61s ago\)\s+3m20s$/);
    expect(s.log[10].out).toEqual(expect.arrayContaining([expect.stringMatching(/Warning\s+BackOff\s+Pod\/live\s+Back-off restarting failed container live in pod live_default/)]));
    expect(exercise([{ kind: 'kube-pod', name: 'live', restartsAtLeast: 2 }], ['kubectl apply -f k8s/live.yaml', 'sleep 120']).ok).toBe(true);
    expect(exercise([{ kind: 'kube-pod', name: 'live', restartsAtLeast: 2 }], ['kubectl apply -f k8s/live.yaml', 'sleep 60']).results[0].message).toMatch(/live 重新啟動了 1 次$/);
  });
  it('with restartPolicy Never the container is not started again', () => {
    const s = go('kubectl apply -f k8s/once.yaml', 'sleep 60', 'kubectl get pod once', 'kubectl events --for pod/once');
    expect(row(s.log[2].out, 'once')).toMatch(/^once\s+0\/1\s+Completed\s+0\s+60s$/);
    expect(s.log[3].out.at(-1)).toMatch(/Killing\s+Pod\/once\s+Container once failed liveness probe$/);
  });
  it('runs exec probes in the container\'s files: removing the file kills it', () => {
    const s = go('kubectl apply -f k8s/ex.yaml', 'sleep 5', 'kubectl get pod ex', 'kubectl exec ex -- rm /tmp/healthy', 'sleep 5', 'kubectl events --for pod/ex --types=Warning', 'sleep 30', 'kubectl get pod ex');
    expect(row(s.log[2].out, 'ex')).toMatch(/^ex\s+1\/1\s+Running\s+0/);
    expect(s.log[5].out[1]).toMatch(/Unhealthy\s+Pod\/ex\s+Liveness probe failed: cat: \/tmp\/healthy: No such file or directory$/);
    // busybox's sh -c ignores SIGTERM: killed after the 30 s grace period, then a new run with the file again.
    expect(row(s.log[7].out, 'ex')).toMatch(/^ex\s+1\/1\s+Running\s+1 \(\d+s ago\)/);
  });
});

describe('readiness and startup', () => {
  it('a pod that never becomes ready: READY 0/1, the Ready condition, events counted, kubectl wait times out', () => {
    const s = go('kubectl apply -f k8s/never.yaml', 'sleep 600', 'kubectl get pod never', 'kubectl events --for pod/never --types=Warning', 'kubectl get pod never -o jsonpath={.status.conditions[2]}', 'kubectl wait --for=condition=Ready pod/never --timeout=10s', 'date');
    expect(row(s.log[2].out, 'never')).toMatch(/^never\s+0\/1\s+Running\s+0\s+10m$/);
    expect(s.log[3].out[1]).toMatch(/^0s \(x121 over 10m\)\s+Warning\s+Unhealthy\s+Pod\/never\s+Readiness probe failed: HTTP probe failed with statuscode: 503$/);
    expect(s.log[4].out[0]).toBe('{"lastProbeTime":null,"lastTransitionTime":"2026-11-24T10:00:00Z","message":"containers with unready status: [never]","reason":"ContainersNotReady","status":"False","type":"Ready"}');
    expect(s.log[5]).toMatchObject({ err: ['error: timed out waiting for the condition on pods/never'], status: 1 });
    expect(s.log[6].out).toEqual(['Tue Nov 24 10:10:10 UTC 2026']);
    const checks: TerminalCheck[] = [{ kind: 'kube-pod', name: 'never', ready: true }];
    expect(exercise(checks, ['kubectl apply -f k8s/never.yaml', 'sleep 30']).results[0].message).toMatch(/never 就緒的容器是 0\/1$/);
    expect(exercise([{ kind: 'kube-pod', name: 'never', ready: false, status: 'Running' }], ['kubectl apply -f k8s/never.yaml', 'sleep 30']).ok).toBe(true);
    expect(describeCheck(checks[0])).toBe('default 命名空間應該有名為 never 的 Pod（容器都就緒）');
  });
  it('the startup probe holds liveness and readiness back until it passes; kubectl wait then sees Ready', () => {
    const s = go('kubectl apply -f k8s/slow.yaml', 'sleep 10', 'kubectl get pod slow -o jsonpath={.status.containerStatuses[0].started}', 'kubectl wait --for=condition=Ready pod/slow --timeout=60s', 'date', 'kubectl events --for pod/slow --types=Warning');
    expect(s.log[2].out).toEqual(['false']);
    expect(s.log[3].out).toEqual(['pod/slow condition met']);
    expect(s.log[4].out).toEqual(['Tue Nov 24 10:00:20 UTC 2026']);
    // Only the startup probe probed while the port was closed (0, 5, 10, 15 s); liveness and readiness waited.
    expect(s.log[5].out.slice(1)).toEqual([expect.stringMatching(/^5s \(x4 over 20s\)\s+Warning\s+Unhealthy\s+Pod\/slow\s+Startup probe failed: dial tcp 10\.244\.2\.2:8080: connect: connection refused$/)]);
  });
  it('a startup probe that runs out of failures kills the container', () => {
    const s = go('kubectl apply -f k8s/late.yaml', 'sleep 5', 'kubectl events --for pod/late', 'sleep 1', 'kubectl get pod late');
    expect(s.log[2].out.at(-1)).toMatch(/Killing\s+Pod\/late\s+Container late failed startup probe, will be restarted$/);
    expect(row(s.log[4].out, 'late')).toMatch(/^late\s+0\/1\s+Running\s+1 \(\d+s ago\)/);
  });
  it('time-outs, named ports that do not exist and a closed port have the kubelet\'s messages', () => {
    const m = withFiles(health([{ image: 'team/web:1.0', paths: [{ path: '/slow', delay: 2 }] }]), {
      'probe.yaml': pod('p', 'team/web:1.0', ['readinessProbe:', '  httpGet:', '    path: /slow', '    port: 8080', 'livenessProbe:', '  tcpSocket:', '    port: 9090', '  failureThreshold: 5', 'startupProbe:', '  httpGet:', '    port: web']) });
    const s = probesOn(m, 'kubectl apply -f k8s/probe.yaml', 'kubectl events --for pod/p --types=Warning');
    expect(s.log[1].out.slice(1)).toEqual([expect.stringMatching(/Startup probe errored: unable to find port "web" in container p$/)]);
    const ok = probesOn(withFiles(m, { 'q.yaml': pod('q', 'team/web:1.0', ['readinessProbe:', '  httpGet:', '    path: /slow', '    port: 8080', 'livenessProbe:', '  tcpSocket:', '    port: 9090', '  failureThreshold: 5']) }), 'kubectl apply -f k8s/q.yaml', 'sleep 10', 'kubectl events --for pod/q --types=Warning');
    expect(ok.log[2].out.slice(1).map(l => l.replace(/^.*Pod\/q\s+/, ''))).toEqual(['Liveness probe failed: dial tcp 10.244.2.2:9090: connect: connection refused',
      'Readiness probe failed: Get "http://10.244.2.2:8080/slow": context deadline exceeded (Client.Timeout exceeded while awaiting headers)']);
  });
});

describe('termination', () => {
  it('Terminating while the grace period runs: the preStop hook uses it up, SIGTERM is ignored, SIGKILL at the end', () => {
    const s = go('kubectl apply -f k8s/stub.yaml', 'sleep 3', 'kubectl delete pod stub --wait=false', 'kubectl get pod stub', 'kubectl describe pod stub', 'sleep 29', 'kubectl get pod stub', 'sleep 1', 'kubectl get pod stub');
    expect(s.log[2].out).toEqual(['pod "stub" deleted']);
    expect(row(s.log[3].out, 'stub')).toMatch(/^stub\s+1\/1\s+Terminating\s+0\s+3s$/);
    expect(s.log[4].out).toEqual(expect.arrayContaining(['Status:                    Terminating (lasts 30s)', 'Termination Grace Period:  30s', expect.stringMatching(/^ {2}Normal {2}Killing {4}0s {4}kubelet {12}Stopping container stub$/)]));
    // The hook takes 5 s of the 30, the program ignores SIGTERM: SIGKILL at 3 + 30 s.
    expect(row(s.log[6].out, 'stub')).toMatch(/Terminating/);
    expect(s.log[8].err).toEqual(['Error from server (NotFound): pods "stub" not found']);
  });
  it('kubectl delete waits until the pod is gone; SIGTERM handled ends it sooner; --grace-period; a pending pod goes at once', () => {
    const s = go('kubectl apply -f k8s/stub.yaml', 'kubectl run w --image=team/web:1.0', 'kubectl run b --image=busybox:1.36 -- sleep 3600', 'kubectl run z --image=busybox:1.36 -- sleep 3600', 'kubectl run p --image=nginx:9.99', 'sleep 3',
      'kubectl delete pod w', 'date', 'kubectl delete pod b --grace-period=5', 'date', 'kubectl delete pod z --grace-period=0', 'date', 'kubectl delete pod p', 'date', 'kubectl delete pod stub --timeout=10s', 'date');
    expect(s.log[7].out).toEqual(['Tue Nov 24 10:00:06 UTC 2026']);
    expect(s.log[9].out).toEqual(['Tue Nov 24 10:00:11 UTC 2026']);
    // --grace-period=0 without --force is 1 s, and the kubelet always gives 2 s.
    expect(s.log[11].out).toEqual(['Tue Nov 24 10:00:13 UTC 2026']);
    expect(s.log[13].out).toEqual(['Tue Nov 24 10:00:13 UTC 2026']);
    expect(s.log[14]).toMatchObject({ out: ['pod "stub" deleted'], err: ['error: timed out waiting for the condition'], status: 1 });
    expect(s.log[15].out).toEqual(['Tue Nov 24 10:00:23 UTC 2026']);
    const f = go('kubectl run w --image=team/web:1.0', 'sleep 1', 'kubectl delete pod w --grace-period=0 --force', 'date', 'kubectl get pods');
    expect(f.log[2].out).toEqual(['pod "w" force deleted']);
    expect(f.log[3].out).toEqual(['Tue Nov 24 10:00:01 UTC 2026']);
  });
  it('a failing preStop hook is an event; kube-system pods still come back at once', () => {
    const s = go('kubectl apply -f k8s/hook.yaml', 'sleep 2', 'kubectl delete -f k8s/hook.yaml', 'date', 'kubectl events --for pod/hook', 'kubectl delete pod etcd-cp-01 -n kube-system', 'date');
    expect(s.log[3].out).toEqual(['Tue Nov 24 10:00:05 UTC 2026']);
    expect(s.log[4].out.slice(-2).map(l => l.replace(/^\S+\s+/, ''))).toEqual([expect.stringMatching(/^Normal\s+Killing\s+Pod\/hook\s+Stopping container hook$/), expect.stringMatching(/^Warning\s+FailedPreStopHook\s+Pod\/hook\s+PreStopHook failed$/)]);
    expect(s.log[6].out).toEqual(['Tue Nov 24 10:00:05 UTC 2026']);
  });
});

describe('long runs, determinism and the custom-columns fix', () => {
  it('a pod probed for a week settles quickly and the same way every time', () => {
    const m = { ...lab, kube: { ...lab.kube, manifests: [{ text: pod('old', 'team/web:1.0', ['livenessProbe:', '  tcpSocket:', '    port: 8080', ...READY]), at: '2026-11-17 10:00:00' }] } };
    const t0 = Date.now(), a = probesOn(m, 'kubectl get pod old', 'kubectl events --for pod/old --types=Warning');
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(row(a.log[0].out, 'old')).toMatch(/^old\s+0\/1\s+Running\s+0\s+7d$/);
    // One readiness probe every 5 s for 7 days: 120961 failures, played in a few steps.
    expect(a.log[1].out[1]).toMatch(/^0s \(x120961 over 7d\)\s+Warning\s+Unhealthy\s+Pod\/old\s+Readiness probe failed: HTTP probe failed with statuscode: 503$/);
    expect(JSON.stringify(settleKube(machineState(m)).kube)).toBe(JSON.stringify(settleKube(machineState(m)).kube));
  });
  it('--no-headers leaves out the custom-columns header, sized by the rows', () => {
    const s = probes('kubectl get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName --no-headers', 'kubectl get pod hello -o custom-columns=NODE:.spec.nodeName --no-headers', 'kubectl get pod hello -o custom-columns=NODE:.spec.nodeName');
    expect(s.log[0].out).toEqual(['hello     node-01']);
    expect(s.log[1].out).toEqual(['node-01']);
    expect(s.log[2].out).toEqual(['NODE', 'node-01']);
    expect(kubeOn(probesLab, 'kubectl get pod hello -o custom-columns=NODE:.spec.nodeName --no-headers').last.out).toEqual(['node-01']);
  });
});

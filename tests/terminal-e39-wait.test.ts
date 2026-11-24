import { describe, expect, it } from 'vitest';
import { hm } from './support/helm-fixture';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §7): helm --wait (the clock moves on Helm's 2-second polls to the
 * moment Helm's ready checks hold, or to --timeout: "context deadline exceeded" and a failed revision) and --atomic (a
 * failed install is uninstalled, a failed upgrade rolled back to the last successful revision).
 */
const cells = (line: string) => line.split('\t').map(c => c.trimEnd());

describe('helm --wait', () => {
  it('waits until the Deployment\'s new ReplicaSet is ready, on 2-second polls', () => {
    const s = hm('helm install web ./web --wait', 'date', 'kubectl get deploy web', 'helm upgrade web ./web --set image.tag=1.28 --wait', 'date', 'helm rollback web 1 --wait', 'date');
    expect(s.log[0].out.slice(0, 4)).toEqual(['NAME: web', 'LAST DEPLOYED: Tue Nov 24 10:00:00 2026', 'NAMESPACE: default', 'STATUS: deployed']);
    expect(s.log[1].out).toEqual(['Tue Nov 24 10:00:04 UTC 2026']);
    expect(s.log[2].out[1]).toMatch(/^web\s+2\/2\s+2\s+2\s+4s$/);
    expect(s.log[3].out[2]).toBe('LAST DEPLOYED: Tue Nov 24 10:00:04 2026');
    expect(s.log[4].out).toEqual(['Tue Nov 24 10:00:06 UTC 2026']);
    expect(s.log[6].out).toEqual(['Tue Nov 24 10:00:06 UTC 2026']);
  });
  it('fails the revision at the timeout when the pods never become ready', () => {
    const s = hm('helm install web ./web --set image.tag=9.9 --wait --timeout 30s', 'date', 'helm list', 'helm history web', 'kubectl get pods -l app.kubernetes.io/instance=web --no-headers',
      'helm upgrade web ./web --set image.tag=1.27 --wait --timeout 1m', 'helm list', 'helm install x ./web --wait --timeout soon');
    expect(s.log[0].err).toEqual(['Error: INSTALLATION FAILED: context deadline exceeded']);
    expect(s.log[1].out).toEqual(['Tue Nov 24 10:00:30 UTC 2026']);
    expect(cells(s.log[2].out[1])).toEqual(['web', 'default', '1', '2026-11-24 10:00:00 +0000 UTC', 'failed', 'web-0.1.0', '1.27']);
    expect(cells(s.log[3].out[1]).at(-1)).toBe('Release "web" failed: context deadline exceeded');
    expect(s.log[4].out.map(l => l.split(/\s+/)[2])).toEqual(['ErrImagePull', 'ErrImagePull']);
    // A failed release can be upgraded (it is the current one); without values the failed tag would be reused, so the upgrade sets a good one.
    expect(s.log[5].out[0]).toBe('Release "web" has been upgraded. Happy Helming!');
    expect(cells(s.log[6].out[1]).slice(2, 5)).toEqual(['2', '2026-11-24 10:00:30 +0000 UTC', 'deployed']);
    expect(s.log[7].err).toEqual(['Error: invalid argument "soon" for "--timeout" flag: time: invalid duration "soon"']);
  });
  it('waits for a LoadBalancer Service\'s address', () => {
    const s = hm('helm install web ./web --set service.type=LoadBalancer --wait', 'kubectl get svc web --no-headers');
    expect(s.log[0].out[3]).toBe('STATUS: deployed');
    expect(s.log[1].out[0]).toMatch(/^web\s+LoadBalancer\s+[\d.]+\s+10\.0\.0\.20\d\s+80:3\d{4}\/TCP/);
  });
});

describe('helm --atomic', () => {
  it('uninstalls a failed install', () => {
    const s = hm('helm install web ./web --set image.tag=9.9 --atomic --timeout 20s', 'helm list -a', 'kubectl get deploy,svc,cm -l app.kubernetes.io/managed-by=Helm', 'kubectl get secrets', 'date');
    expect(s.log[0].err).toEqual(['Error: INSTALLATION FAILED: release web failed, and has been uninstalled due to atomic being set: context deadline exceeded']);
    expect(s.log[1].out).toHaveLength(1);
    expect(s.log[2].err).toEqual(['No resources found in default namespace.']);
    expect(s.log[3].err).toEqual(['No resources found in default namespace.']);
    expect(s.log[4].out).toEqual(['Tue Nov 24 10:00:20 UTC 2026']);
  });
  it('rolls a failed upgrade back to the last successful revision', () => {
    const s = hm('helm install web ./web --wait', 'helm upgrade web ./web --set image.tag=9.9 --atomic --timeout 20s', 'helm history web', 'kubectl get deploy web -o jsonpath={.spec.template.spec.containers[0].image}', 'helm list');
    expect(s.log[1].err).toEqual(['Error: UPGRADE FAILED: release web failed, and has been rolled back due to atomic being set: context deadline exceeded']);
    expect(s.log[2].out.slice(1).map(l => cells(l).slice(0, 3).concat(cells(l).slice(5)))).toEqual([['1', 'Tue Nov 24 10:00:00 2026', 'superseded', 'Install complete'],
      ['2', 'Tue Nov 24 10:00:04 2026', 'failed', 'Upgrade "web" failed: context deadline exceeded'], ['3', 'Tue Nov 24 10:00:24 2026', 'deployed', 'Rollback to 1']]);
    expect(s.log[3].out).toEqual(['nginx:1.27']);
    expect(cells(s.log[4].out[1]).slice(2, 5)).toEqual(['3', '2026-11-24 10:00:24 +0000 UTC', 'deployed']);
  });
});

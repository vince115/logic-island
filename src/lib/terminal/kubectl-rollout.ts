import { find, put } from './kube-api';
import { settleKube } from './kube-settle';
import { advanceClock } from './shell';
import { resourceName } from './kube-output';
import { changeCauseOf, historyOf, revisionOf, rolloutStatus } from './kube-deployment';
import { historyTemplate } from './kube-describe-workload';
import { HISTORY, MAX_REPLICAS, DESIRED, REVISION, RESTARTED, withoutHash } from './kube-workload-spec';
import { LAST_APPLIED } from './kube-write';
import { goTab, meta, nameOf, nsOf, obj, sameJ, stamp, type JObj, type KubeState } from './kube-model';
import { workloadTargets, respec } from './kubectl-workload';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §6): kubectl rollout for Deployments. status blocks the way
 * kubectl's watch does — the clock moves a second at a time and each new message of the status viewer is printed, until
 * the rollout completes, its progress deadline is exceeded, or --timeout. history lists the revisions of the
 * ReplicaSets (CHANGE-CAUSE from kubernetes.io/change-cause) or prints one revision's template; undo puts an older
 * revision's template back (that ReplicaSet becomes the newest revision); pause, resume and restart change the spec.
 */

const SUBS = ['status', 'history', 'undo', 'pause', 'resume', 'restart'];
/** The longest a rollout status without --timeout waits in the simulation. */
export const STATUS_CAP = 3600;
const fail = (x: Kx, line: string): KubeResult => { x.io.err(line); return { state: x.state, status: 1 }; };

export function rolloutCommand(x: Kx): KubeResult {
  const [sub, ...words] = x.pos;
  if (!SUBS.includes(sub ?? '')) return fail(x, sub ? `error: unknown command "${sub}" for "kubectl rollout"` : 'error: Required resource not specified.');
  const r = workloadTargets(x, words, `rollout ${sub}`);
  if ('error' in r) return fail(x, r.error);
  if (r.items.some(o => o.kind !== 'Deployment')) return fail(x, `（模擬環境：kubectl rollout ${sub} 只模擬 Deployment）`);
  if (!r.items.length) return fail(x, r.errors[0] ?? 'error: Required resource not specified.');
  if (sub === 'status') return statusCommand(x, r.items[0]);
  let k = x.k, bad = r.errors.length > 0;
  for (const d of r.items) {
    const live = k.objects.find(o => o === d) ?? d, spec = obj(live.spec), id = resourceName(live), paused = spec.paused === true;
    if (sub === 'history') { history(x, k, live); continue; }
    if (sub === 'pause' || sub === 'resume') {
      if (paused === (sub === 'pause')) { x.io.err(`error: deployments.apps "${nameOf(live)}" is ${sub === 'pause' ? 'already paused' : 'not paused'}`); bad = true; continue; }
      k = respec(k, live, { ...spec, paused: sub === 'pause' });
      x.io.out(`${id} ${sub === 'pause' ? 'paused' : 'resumed'}`);
    } else if (sub === 'restart') {
      if (paused) { x.io.err(`error: deployments.apps "${nameOf(live)}" can't restart paused deployment (run rollout resume first)`); bad = true; continue; }
      const tpl = obj(spec.template), tm = obj(tpl.metadata);
      k = respec(k, live, { ...spec, template: { ...tpl, metadata: { ...tm, annotations: { ...obj(tm.annotations), [RESTARTED]: stamp(x.now) } } } });
      x.io.out(`${id} restarted`);
    } else {
      const u = undo(x, k, live);
      if ('error' in u) { x.io.err(u.error); bad = true; continue; }
      k = u.k;
      x.io.out(`${id} ${u.word}`);
    }
  }
  r.errors.forEach(e => x.io.err(e));
  return { state: { ...x.state, kube: k }, status: bad ? 1 : 0 };
}

function statusCommand(x: Kx, d0: JObj): KubeResult {
  const t = flag(x, 'timeout'), m = t === undefined ? null : /^(\d+)(s|m)?$/.exec(t);
  if (t !== undefined && !m) return fail(x, `error: invalid argument "${t}" for "--timeout" flag: time: invalid duration "${t}"`);
  const limit = m && Number(m[1]) > 0 ? Number(m[1]) * (m[2] === 'm' ? 60 : 1) : STATUS_CAP, once = x.flags.off?.has('watch');
  let s = x.state, last = '';
  for (let waited = 0; ; waited++) {
    if (waited) s = settleKube(advanceClock(s, 1));
    const d = find(s.kube!, 'Deployment', nsOf(d0), nameOf(d0));
    if (!d) { x.io.err(`error: deployment "${nameOf(d0)}" was deleted`); return { state: x.state, status: 1, advance: waited }; }
    const v = rolloutStatus(d);
    if ('error' in v) { x.io.err(v.error); return { state: x.state, status: 1, advance: waited }; }
    if (v.msg !== last) x.io.out(v.msg);
    last = v.msg;
    if (v.done || once) return { state: x.state, status: 0, advance: waited };
    if (waited >= limit) {
      x.io.err(m && Number(m[1]) > 0 ? 'error: timed out waiting for the condition' : `（模擬環境：kubectl rollout status 最多等待 ${STATUS_CAP} 秒；請加上 --timeout）`);
      return { state: x.state, status: 1, advance: waited };
    }
  }
}

function history(x: Kx, k: KubeState, d: JObj) {
  const list = historyOf(k, d), want = flag(x, 'revision');
  if (want !== undefined && want !== '0') {
    const rs = list.find(r => String(revisionOf(r)) === want);
    if (!rs) { x.io.err('error: unable to find the specified revision'); return; }
    [`${resourceName(d)} with revision #${want}`, ...historyTemplate(rs), ''].forEach(l => x.io.out(l));
    return;
  }
  x.io.out(`${resourceName(d)} `);
  if (!list.length) { x.io.out('No rollout history found.'); return; }
  goTab(['REVISION\tCHANGE-CAUSE', ...list.map(rs => `${revisionOf(rs)}\t${changeCauseOf(rs) ?? '<none>'}`)], 0, 2).forEach(l => x.io.out(l));
  x.io.out('');
}

const SKIP = [LAST_APPLIED, REVISION, HISTORY, DESIRED, MAX_REPLICAS, 'deprecated.deployment.rollback.to'];
/** rollout undo: the revision's template (and its change-cause) back into the Deployment. */
function undo(x: Kx, k: KubeState, d: JObj): { k: KubeState; word: string } | { error: string } {
  if (obj(d.spec).paused === true) return { error: `error: you cannot rollback a paused deployment; resume it first with 'kubectl rollout resume ${resourceName(d)}' and try again` };
  const to = Number(flag(x, 'to-revision') ?? 0), list = historyOf(k, d);
  if (!Number.isInteger(to) || to < 0) return { error: `error: invalid argument "${flag(x, 'to-revision')}" for "--to-revision" flag` };
  const rs = to ? list.find(r => revisionOf(r) === to) : list.length > 1 ? list[list.length - 2] : undefined;
  if (!rs) return { error: to ? `error: unable to find specified revision ${to} in history` : `error: no rollout history found for deployment "${nameOf(d)}"` };
  const template = withoutHash(obj(rs.spec).template);
  if (sameJ(template, withoutHash(obj(d.spec).template))) return { k, word: `skipped rollback (current template already matches revision ${to})` };
  const keep = Object.fromEntries(Object.entries(obj(meta(d).annotations)).filter(([a]) => SKIP.includes(a)));
  const restored = Object.fromEntries(Object.entries(obj(meta(rs).annotations)).filter(([a]) => !SKIP.includes(a)));
  const k2 = respec(k, d, { ...obj(d.spec), template });
  const live = k2.objects.find(o => nameOf(o) === nameOf(d) && nsOf(o) === nsOf(d) && o.kind === 'Deployment')!;
  return { k: put(k2, { ...live, metadata: { ...meta(live), annotations: { ...keep, ...restored } } }), word: 'rolled back' };
}

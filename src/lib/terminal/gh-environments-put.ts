import type { Forge } from './git-core';
import type { Gh } from './gh';
import { fail, invalid, isBool, type Json, type Reply } from './gh-api';
import { environmentJson, usersOf } from './environments-json';
import { MAX_REVIEWERS, MAX_WAIT_TIMER, type EnvRules } from './environments-model';

/*
 * Engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md §6): changing environments through gh api (admin only) —
 * PUT …/environments/{name} with wait_timer, prevent_self_review, reviewers ([{ type: 'User', id }]) and
 * deployment_branch_policy ({ protected_branches, custom_branch_policies } or null), creating the environment when the
 * repository does not have it; and the custom branch patterns under …/deployment-branch-policies.
 */

const DOCS = 'https://docs.github.com/rest';
const DOC = `${DOCS}/deployments/environments#create-or-update-an-environment`, DOC_POLICY = `${DOCS}/deployments/branch-policies`;
export const ENV_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const admin = (f: Forge) => f.site!.permission === 'admin';
const nextId = (h: Gh, k: 'environment' | 'policy') => { const st = h.ci!.state.env!, n = st[k]; h.ci!.state = { ...h.ci!.state, env: { ...st, [k]: n + 1 } }; return n; };
function save(f: Forge, rules: EnvRules) {
  const site = f.site!, list = site.envRules ?? [];
  f.site = { ...site, envRules: list.some(e => e.id === rules.id) ? list.map(e => (e.id === rules.id ? rules : e)) : [...list, rules],
    environments: site.environments?.includes(rules.name) ? site.environments : [...site.environments ?? [], rules.name] };
}

/** PUT …/environments/{name}: GitHub's validation of the body, then the created or updated environment (omitted fields stay). */
export function putEnvironment(h: Gh, f: Forge, name: string, e: EnvRules | undefined, b: Record<string, Json>): Reply {
  if (!admin(f)) return fail(403, 'Must have admin rights to Repository.', DOC);
  if (!e && !ENV_NAME.test(name)) return fail(422, 'Validation Failed', DOC);
  const now = h.g.now;
  let next: EnvRules = e ?? { id: nextId(h, 'environment'), name, createdAt: now, updatedAt: now, reviewers: [], preventSelfReview: false, waitTimer: 0 };
  if ('wait_timer' in b) {
    const w = b.wait_timer;
    if (typeof w !== 'number' || !Number.isInteger(w)) return invalid(DOC, `For 'properties/wait_timer', ${JSON.stringify(w)} is not an integer.`);
    if (w < 0 || w > MAX_WAIT_TIMER) return invalid(DOC, `For 'properties/wait_timer', ${w} is ${w < 0 ? 'less than the minimum of 0' : `greater than the maximum of ${MAX_WAIT_TIMER}`}.`);
    next = { ...next, waitTimer: w };
  }
  if ('prevent_self_review' in b) {
    if (!isBool(b.prevent_self_review)) return invalid(DOC, `For 'properties/prevent_self_review', ${JSON.stringify(b.prevent_self_review)} is not a boolean.`);
    next = { ...next, preventSelfReview: b.prevent_self_review as boolean };
  }
  if ('reviewers' in b) {
    const list = b.reviewers ?? [], users = usersOf(f, h.account.login);
    if (!Array.isArray(list)) return invalid(DOC, `For 'properties/reviewers', ${JSON.stringify(list)} is not an array or null.`);
    if (list.length > MAX_REVIEWERS) return invalid(DOC, `For 'properties/reviewers', the array has more than ${MAX_REVIEWERS} items.`);
    const logins: string[] = [];
    for (const r of list) {
      const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
      if (o.type === 'Team') return fail(422, 'Teams are only available to organization repositories', DOC);
      const u = o.type === 'User' ? users.find(x => x.id === o.id) : undefined;
      if (!u) return fail(422, 'Reviewers must be a User or Team that has access to the repository', DOC);
      if (!logins.includes(u.login)) logins.push(u.login);
    }
    next = { ...next, reviewers: logins };
  }
  if ('deployment_branch_policy' in b) {
    const p = b.deployment_branch_policy;
    if (p === null) next = { ...next, policy: undefined };
    else {
      if (typeof p !== 'object' || Array.isArray(p)) return invalid(DOC, `For 'properties/deployment_branch_policy', ${JSON.stringify(p)} is not an object or null.`);
      for (const k of ['protected_branches', 'custom_branch_policies']) {
        if (!(k in p)) return invalid(DOC, `"${k}" wasn't supplied.`);
        if (!isBool(p[k])) return invalid(DOC, `For 'properties/${k}', ${JSON.stringify(p[k])} is not a boolean.`);
      }
      if (p.protected_branches === p.custom_branch_policies) return fail(422, 'Exactly one of protected_branches or custom_branch_policies must be true', DOC);
      const protectedBranches = p.protected_branches as boolean;
      next = { ...next, policy: { protectedBranches, patterns: protectedBranches ? [] : e?.policy && !e.policy.protectedBranches ? e.policy.patterns : [] } };
    }
  }
  if (e) next = { ...next, updatedAt: now };
  save(f, next);
  return { status: 200, body: environmentJson(f, next, h.account.login) };
}

const policyJson = (p: { id: number; name: string }) => ({ id: p.id, name: p.name, type: 'branch' });
/** …/environments/{name}/deployment-branch-policies[/{id}]: the custom branch patterns (GET, POST, DELETE). */
export function policyRoute(h: Gh, f: Forge, e: EnvRules | undefined, method: string, body: Record<string, Json> | undefined, id: string | undefined): Reply {
  if (!e) return fail(404, 'Not Found', DOC_POLICY);
  const patterns = e.policy && !e.policy.protectedBranches ? e.policy.patterns : undefined;
  if (method === 'GET' && id === undefined) return { status: 200, body: { total_count: patterns?.length ?? 0, branch_policies: (patterns ?? []).map(policyJson) } };
  if (method === 'GET') { const p = patterns?.find(x => String(x.id) === id); return p ? { status: 200, body: policyJson(p) } : fail(404, 'Not Found', DOC_POLICY); }
  if (method !== 'POST' && method !== 'DELETE') return fail(404, 'Not Found', DOC_POLICY);
  if (!admin(f)) return fail(403, 'Must have admin rights to Repository.', DOC_POLICY);
  if (!patterns) return fail(404, 'Not Found', DOC_POLICY);
  if (method === 'DELETE') {
    if (id === undefined || !patterns.some(x => String(x.id) === id)) return fail(404, 'Not Found', DOC_POLICY);
    save(f, { ...e, updatedAt: h.g.now, policy: { protectedBranches: false, patterns: patterns.filter(x => String(x.id) !== id) } });
    return { status: 204 };
  }
  const b = body ?? {};
  if (id !== undefined) return fail(404, 'Not Found', DOC_POLICY);
  if (typeof b.name !== 'string' || !b.name || b.name.length > 255) return invalid(DOC_POLICY, `"name" wasn't supplied.`);
  if (b.type !== undefined && b.type !== 'branch') return fail(422, '模擬環境的 deployment branch policy 只支援 type branch', DOC_POLICY);
  if (patterns.some(x => x.name === b.name)) return fail(422, 'Validation Failed', DOC_POLICY);
  const p = { id: nextId(h, 'policy'), name: b.name };
  save(f, { ...e, updatedAt: h.g.now, policy: { protectedBranches: false, patterns: [...patterns, p] } });
  return { status: 200, body: policyJson(p) };
}

import type { Forge, Git } from './git-core';
import { API_BASE, protectionJson, type ForgeSite, type Protection } from './forge-state';
import { defaultBranch, repoPath, webUrl } from './forge';
import { baseRepo, flag, on, parseFlags, type Gh } from './gh';
import { envApi, ENV_ENDPOINTS } from './gh-environments';

/*
 * Engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md): gh api against github.example's REST API (GitHub Enterprise's
 * https://github.example/api/v3): user, repos/{owner}/{repo} (GET, PATCH of the merge settings) and
 * repos/{owner}/{repo}/branches/{branch}/protection (GET, PUT with the real JSON body, DELETE). {owner}, {repo} and {branch}
 * come from the current repository. Responses are printed as indented JSON; an error prints its body and gh's
 * "gh: message (HTTP status)" line.
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
/** E30: a body may be a JSON array (pending deployments, deployment statuses). */
export type Reply = { status: number; body?: Record<string, unknown> | unknown[] };
export const DOCS = 'https://docs.github.com/rest';
export const fail = (status: number, message: string, doc = DOCS): Reply => ({ status, body: { message, documentation_url: doc, status: String(status) } });

/** -F / -f fields as gh builds the JSON body: key[sub]=v nests, key[]=v appends; -F converts true, false, null, integers and @file. */
function fieldsBody(g: Git, typed: readonly string[], raw: readonly string[]): Record<string, Json> | string {
  const body: Record<string, Json> = {};
  const add = (spec: string, convert: boolean): string | undefined => {
    const eq = spec.indexOf('=');
    if (eq < 0) return `field "${spec}" requires a value separated by an '=' sign`;
    const m = /^([^[\]]+)((?:\[[^\]]*\])*)$/.exec(spec.slice(0, eq));
    if (!m) return `invalid key: "${spec.slice(0, eq)}"`;
    let v: Json = spec.slice(eq + 1);
    if (convert) {
      if (v === 'true' || v === 'false') v = v === 'true'; else if (v === 'null') v = null; else if (/^-?\d+$/.test(v)) v = Number(v);
      else if (v.startsWith('@')) { const text = readText(g, v.slice(1)); if (text === undefined) return `open ${v.slice(1)}: no such file or directory`; v = text; }
    }
    const keys = [m[1], ...[...m[2].matchAll(/\[([^\]]*)\]/g)].map(x => x[1])];
    let at: Record<string, Json> | Json[] = body;
    keys.forEach((k, i) => {
      const last = i === keys.length - 1, next = keys[i + 1];
      if (Array.isArray(at)) { if (last) at.push(v); else { const o: Record<string, Json> | Json[] = next === '' ? [] : {}; at.push(o); at = o; } return; }
      if (last) { at[k] = v; return; }
      if (typeof at[k] !== 'object' || at[k] === null) at[k] = next === '' ? [] : {};
      at = at[k] as Record<string, Json> | Json[];
    });
    return undefined;
  };
  for (const s of typed) { const e = add(s, true); if (e) return e; }
  for (const s of raw) { const e = add(s, false); if (e) return e; }
  return body;
}
function readText(g: Git, path: string): string | undefined { const n = g.nodes.get(g.abs(path)); return n?.kind === 'file' ? n.content ?? '' : undefined; }

export const isBool = (v: unknown) => typeof v === 'boolean';
export const invalid = (doc: string, why: string) => fail(422, `Invalid request.\n\n${why}`, doc);
const notBool = (doc: string, k: string, v: unknown) => invalid(doc, `For 'properties/${k}', ${JSON.stringify(v)} is not a boolean.`);

/** PUT …/protection: GitHub's validation of the body, then the new protection. */
function putProtection(body: Record<string, Json>, doc: string): Protection | Reply {
  for (const k of ['required_status_checks', 'enforce_admins', 'required_pull_request_reviews', 'restrictions']) if (!(k in body)) return invalid(doc, `"${k}" wasn't supplied.`);
  const rsc = body.required_status_checks, rpr = body.required_pull_request_reviews;
  let checks: Protection['checks'];
  if (rsc !== null) {
    if (typeof rsc !== 'object' || Array.isArray(rsc)) return invalid(doc, `For 'properties/required_status_checks', ${JSON.stringify(rsc)} is not an object or null.`);
    if (!('strict' in rsc)) return invalid(doc, '"strict" wasn\'t supplied.');
    if (!isBool(rsc.strict)) return notBool(doc, 'strict', rsc.strict);
    const list = Array.isArray(rsc.contexts) ? rsc.contexts : Array.isArray(rsc.checks) ? rsc.checks.map(c => (c as { context?: Json })?.context ?? null) : undefined;
    if (!list) return invalid(doc, '"contexts" wasn\'t supplied.');
    if (list.some(c => typeof c !== 'string' || !c)) return invalid(doc, `For 'items', ${JSON.stringify(list.find(c => typeof c !== 'string' || !c))} is not a string.`);
    checks = { strict: rsc.strict as boolean, contexts: [...new Set(list as string[])] };
  }
  let reviews: Protection['reviews'];
  if (rpr !== null) {
    if (typeof rpr !== 'object' || Array.isArray(rpr)) return invalid(doc, `For 'properties/required_pull_request_reviews', ${JSON.stringify(rpr)} is not an object or null.`);
    const n = rpr.required_approving_review_count ?? 1, stale = rpr.dismiss_stale_reviews ?? false;
    if (typeof n !== 'number' || !Number.isInteger(n)) return invalid(doc, `For 'properties/required_approving_review_count', ${JSON.stringify(n)} is not an integer.`);
    if (n < 0 || n > 6) return invalid(doc, `For 'properties/required_approving_review_count', ${n} is ${n < 0 ? 'less than the minimum of 0' : 'greater than the maximum of 6'}.`);
    if (!isBool(stale)) return notBool(doc, 'dismiss_stale_reviews', stale);
    reviews = { approvals: n, dismissStale: stale as boolean };
  }
  if (body.restrictions !== null) return invalid(doc, 'Only organization repositories can have users and team restrictions');
  const flags: Record<string, boolean> = {};
  for (const k of ['enforce_admins', 'required_linear_history', 'allow_force_pushes', 'allow_deletions']) {
    const v = body[k] ?? null;
    if (v !== null && !isBool(v)) return notBool(doc, k, v);
    flags[k] = v === true;
  }
  return { reviews, checks, linear: flags.required_linear_history, forcePush: flags.allow_force_pushes, deletions: flags.allow_deletions, enforceAdmins: flags.enforce_admins };
}

function repoJson(h: Gh, f: Forge): Record<string, unknown> {
  const s = f.site!, [owner, name] = repoPath(f).split('/'), admin = s.permission === 'admin', push = admin || s.permission === 'write';
  return {
    id: s.id, name, full_name: repoPath(f), private: false, owner: { login: owner, type: owner === h.account.login ? 'User' : 'Organization' }, html_url: webUrl(f),
    description: s.description || null, url: `${API_BASE}/repos/${repoPath(f)}`, default_branch: defaultBranch(f),
    permissions: { admin, maintain: admin, push, triage: push, pull: true },
    allow_squash_merge: s.methods.squash, allow_merge_commit: s.methods.merge, allow_rebase_merge: s.methods.rebase, delete_branch_on_merge: s.deleteBranchOnMerge,
  };
}

function route(h: Gh, f: Forge, rest: string, method: string, body: Record<string, Json> | undefined): Reply | undefined {
  const s: ForgeSite = f.site!, admin = s.permission === 'admin';
  if (rest === '') {
    if (method === 'GET') return { status: 200, body: repoJson(h, f) };
    if (method !== 'PATCH') return fail(404, 'Not Found');
    if (!admin) return fail(403, 'Must have admin rights to Repository.', `${DOCS}/repos/repos#update-a-repository`);
    const b = body ?? {}, map = { allow_merge_commit: 'merge', allow_squash_merge: 'squash', allow_rebase_merge: 'rebase' } as const, methods = { ...s.methods };
    for (const [k, m] of Object.entries(map)) if (k in b) { if (!isBool(b[k])) return notBool(`${DOCS}/repos/repos#update-a-repository`, k, b[k]); methods[m] = b[k] as boolean; }
    if ('delete_branch_on_merge' in b && !isBool(b.delete_branch_on_merge)) return notBool(`${DOCS}/repos/repos#update-a-repository`, 'delete_branch_on_merge', b.delete_branch_on_merge);
    if ('default_branch' in b && !f.refs.has(`refs/heads/${String(b.default_branch)}`)) return fail(422, 'Validation Failed', `${DOCS}/repos/repos#update-a-repository`);
    f.site = { ...s, methods, ...'delete_branch_on_merge' in b ? { deleteBranchOnMerge: b.delete_branch_on_merge as boolean } : {}, ...typeof b.description === 'string' ? { description: b.description } : {} };
    if ('default_branch' in b) f.head = `refs/heads/${String(b.default_branch)}`;
    return { status: 200, body: repoJson(h, f) };
  }
  const m = /^\/branches\/([^/]+)\/protection$/.exec(rest);
  if (!m) return undefined;
  const branch = decodeURIComponent(m[1]), anchor = { GET: 'get', PUT: 'update', DELETE: 'delete' }[method] ?? 'get';
  const doc = `${DOCS}/branches/branch-protection#${anchor}-branch-protection`;
  if (!['GET', 'PUT', 'DELETE'].includes(method)) return fail(404, 'Not Found');
  if (s.permission === 'read' || (method !== 'GET' && !admin)) return method === 'GET' ? fail(404, 'Not Found', doc) : fail(403, 'Must have admin rights to Repository.', doc);
  if (!f.refs.has(`refs/heads/${branch}`)) return fail(404, 'Branch not found', doc);
  const now = s.protection.get(branch);
  if (method === 'GET') return now ? { status: 200, body: protectionJson(repoPath(f), branch, now) } : fail(404, 'Branch not protected', doc);
  if (method === 'DELETE') {
    if (!now) return fail(404, 'Branch not protected', doc);
    const next = new Map(s.protection); next.delete(branch); f.site = { ...s, protection: next };
    return { status: 204 };
  }
  const p = putProtection(body ?? {}, doc);
  if ('status' in p) return p;
  f.site = { ...s, protection: new Map(s.protection).set(branch, p) };
  return { status: 200, body: protectionJson(repoPath(f), branch, p) };
}

/** gh api 端點 [-X 方法] [-F 欄位=值]… [-f 欄位=值]… [--input 檔案] */
export function apiCommand(h: Gh, args: string[]): number {
  const { g, account } = h;
  const fl = parseFlags(g, 'api <endpoint>', args, ['X|method=', 'F|field=', 'f|raw-field=', 'input=', 'H|header=', 'i|include', 'silent', 'q|jq=', 't|template=', 'paginate', 'hostname=', 'verbose']);
  if (!fl) return 1;
  if (fl.rest.length !== 1) { g.err(`accepts 1 arg(s), received ${fl.rest.length}`); return 1; }
  if (on(fl, 'jq') || on(fl, 'template') || on(fl, 'include') || on(fl, 'verbose')) { g.err('gh api：模擬環境不支援 --jq、--template、--include、--verbose（輸出是排版過的 JSON）'); return 1; }
  // E30: the deployments list reads its query (environment, sha, ref).
  const query = new URLSearchParams(/\?(.*)$/.exec(fl.rest[0])?.[1] ?? '');
  let endpoint = fl.rest[0].replace(/^https:\/\/github\.example\/api\/v3\//, '').replace(/^\//, '').replace(/\?.*$/, '');
  let forge: Forge | undefined;
  if (/\{(owner|repo|branch)\}/.test(endpoint)) {
    const base = baseRepo(g, undefined);
    if (!base) return 1;
    forge = base.forge;
    const branch = base.repo ? g.branch(base.repo) : undefined;
    if (endpoint.includes('{branch}') && !branch) { g.err('unable to determine an appropriate value for the \'branch\' placeholder'); return 1; }
    const [owner, repo] = repoPath(forge).split('/');
    endpoint = endpoint.replace(/\{owner\}/g, owner).replace(/\{repo\}/g, repo).replace(/\{branch\}/g, branch ?? '');
  }
  let body: Record<string, Json> | undefined;
  const input = flag(fl, 'input'), typed = fl.values.get('field') ?? [], raw = fl.values.get('raw-field') ?? [];
  if (input !== undefined) {
    if (input === '-') { g.err('gh api --input -：模擬環境不支援從標準輸入讀取，請寫成檔案'); return 1; }
    const text = readText(g, input);
    if (text === undefined) { g.err(`open ${input}: no such file or directory`); return 1; }
    try { const v = JSON.parse(text) as Json; body = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return print(h, fail(400, 'Problems parsing JSON'), false); }
  } else if (typed.length || raw.length) {
    const b = fieldsBody(g, typed, raw);
    if (typeof b === 'string') { g.err(b); return 1; }
    body = b;
  }
  const method = (flag(fl, 'method') ?? (body ? 'POST' : 'GET')).toUpperCase();
  let reply: Reply | undefined;
  if (endpoint === 'user' && method === 'GET') reply = { status: 200, body: { login: account.login, id: 1001, type: 'User', name: account.name, html_url: `https://github.example/${account.login}` } };
  const m = /^repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(endpoint);
  if (m) {
    forge = g.forge.find(x => repoPath(x).toLowerCase() === `${m[1]}/${m[2]}`.toLowerCase());
    reply = forge ? (h.environments ? envApi(h, forge, m[3] ?? '', method, body, query) : undefined) ?? route(h, forge, m[3] ?? '', method, body) : fail(404, 'Not Found');
  }
  // E30 (environments profile): users/{login}.
  const user = /^users\/([^/]+)$/.exec(endpoint);
  if (h.environments && user && method === 'GET') reply = envApi(h, undefined, endpoint, method, body, query);
  if (!reply) { g.err(`gh api：模擬環境只支援 user、repos/{owner}/{repo}（GET、PATCH）與 repos/{owner}/{repo}/branches/{branch}/protection（GET、PUT、DELETE）${h.environments ? `；environments profile 另有 ${ENV_ENDPOINTS}` : ''}`); return 1; }
  return print(h, reply, on(fl, 'silent'));
}

function print(h: Gh, r: Reply, silent: boolean): number {
  const { g } = h;
  if (r.body && !silent) g.out(...JSON.stringify(r.body, null, 2).split('\n'));
  if (r.status < 400) return 0;
  g.err(...`gh: ${String((r.body as { message?: unknown } | undefined)?.message)} (HTTP ${r.status})`.split('\n'));
  return 1;
}

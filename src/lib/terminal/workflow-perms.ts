import type { Y } from './yaml';
import { entries, scalar, type Issues } from './workflow-read';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §6): the GITHUB_TOKEN's permissions. A job's permissions
 * replace the workflow's, which replace the repository's default (restricted: contents and packages read; permissive:
 * every scope write). Naming any scope sets every scope not named to none; read-all and write-all set them all; {} sets
 * them all to none. metadata is always read.
 */

export const SCOPES = ['actions', 'attestations', 'checks', 'contents', 'deployments', 'discussions', 'id-token', 'issues', 'packages', 'pages',
  'pull-requests', 'repository-projects', 'security-events', 'statuses'] as const;
export type Scope = typeof SCOPES[number];
export type Access = 'read' | 'write' | 'none';
export type PermissionsSpec = 'read-all' | 'write-all' | Partial<Record<Scope, Access>>;
/** Every scope's access plus metadata (always read). */
export type TokenPermissions = Record<Scope, Access> & { metadata: 'read' };
/** The repository's "Workflow permissions" setting: read is restricted, write is permissive. */
export type DefaultPermissions = 'read' | 'write';

/** permissions: read-all, write-all or a mapping of scopes to read, write or none. */
export function parsePermissions(y: Y, issues: Issues): PermissionsSpec | undefined {
  if (y.t === 'str' || y.t === 'null') {
    const s = scalar(y, issues) ?? '';
    if (y.t === 'null') return {};
    if (s === 'read-all' || s === 'write-all') return s;
    issues.add(y, `Unexpected value '${s}'`);
    return undefined;
  }
  const out: Partial<Record<Scope, Access>> = {};
  for (const e of entries(y, issues, SCOPES) ?? []) {
    const v = scalar(e.node, issues);
    if (v === undefined) continue;
    if (v !== 'read' && v !== 'write' && v !== 'none') { issues.add(e.node, `Unexpected value '${v}'`); continue; }
    out[e.key as Scope] = v;
  }
  return out;
}

const all = (a: Access): TokenPermissions => ({ ...Object.fromEntries(SCOPES.map(s => [s, a])) as Record<Scope, Access>, metadata: 'read' });
/** What a permissions value gives every scope. */
export function resolvePermissions(spec: PermissionsSpec): TokenPermissions {
  if (spec === 'read-all') return { ...all('read'), 'id-token': 'none' };
  if (spec === 'write-all') return all('write');
  return { ...all('none'), ...spec, metadata: 'read' };
}
/** The repository's default when neither the workflow nor the job says. */
export function defaultPermissions(d: DefaultPermissions): TokenPermissions {
  return d === 'write' ? { ...all('write'), 'id-token': 'none' } : { ...all('none'), contents: 'read', packages: 'read' };
}
/** A job's effective GITHUB_TOKEN permissions: the job's, else the workflow's, else the repository default. */
export function effectivePermissions(workflow: PermissionsSpec | undefined, job: PermissionsSpec | undefined, repo: DefaultPermissions): TokenPermissions {
  const spec = job ?? workflow;
  return spec === undefined ? defaultPermissions(repo) : resolvePermissions(spec);
}
/** The scopes that are not none, as scope: access (metadata left out), in SCOPES order. */
export function grantedScopes(p: TokenPermissions): string[] {
  return SCOPES.filter(s => p[s] !== 'none').map(s => `${s}: ${p[s]}`);
}

const SHOWN: Record<Scope | 'metadata', string> = {
  actions: 'Actions', attestations: 'Attestations', checks: 'Checks', contents: 'Contents', deployments: 'Deployments', discussions: 'Discussions',
  'id-token': 'IdToken', issues: 'Issues', metadata: 'Metadata', packages: 'Packages', pages: 'Pages', 'pull-requests': 'PullRequests',
  'repository-projects': 'RepositoryProjects', 'security-events': 'SecurityEvents', statuses: 'Statuses',
};
/** The runner's "GITHUB_TOKEN Permissions" group (for E28's Set up job): each scope that is not none, by display name. */
export function permissionLines(p: TokenPermissions): string[] {
  return (Object.keys(SHOWN) as (Scope | 'metadata')[]).filter(s => p[s] !== 'none').map(s => `${SHOWN[s]}: ${p[s]}`).sort();
}

import type { FsState } from './fs';
import { parseTime, DEFAULT_NOW } from './clock';
import type { TerminalMachine } from './lesson';
import type { TerminalDocker } from './docker-lesson';
import { FAKE_TOKEN } from './docker-lesson';
import { NAME, type ActionsValue } from './artifacts-model';

/*
 * Engine stage E29 as lesson data (docs/curriculum/CICD0_E29_ARTIFACTS.md §7). Per forge repository a lesson may declare
 * Actions secrets and variables (at repository level, or an environment's) and the environments' names; a CI tool may
 * name a folder it fills (cache, e.g. ~/.npm) and a case may say how long it takes when that folder is already there
 * (cachedSeconds), so a restored cache visibly shortens a run. Secret values must be obviously fake lesson values (the
 * FAKE_TOKEN rule of E23). The runners of an artifacts machine have the machine's Docker Hub images and registries.
 */

export interface TerminalSecret {
  /** Upper case like GitHub keeps it: letters, digits and _, not starting with a digit or GITHUB_. */
  name: string;
  /** An obviously fake lesson value (one line: E23's FAKE_TOKEN; several lines: each without a real token's shape). */
  value: string;
  /** An environment's secret (one of environments). */
  env?: string;
  /** When it was set (UTC 'YYYY-MM-DD HH:MM:SS', default the machine's now). */
  updated?: string;
}
export interface TerminalVariable { name: string; value: string; env?: string; updated?: string }

export const ARTIFACTS_LIMITS = { secrets: 20, variables: 20, environments: 6, value: 4000 } as const;
const ENV_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const REAL = /^(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|dckr_pat_|xox[abprs]-|AKIA|ASIA|sk-|AIza|ya29\.|-----BEGIN [A-Z ]*PRIVATE KEY)/;
/** E29: a secret value a lesson may hold — E23's fake token, or several lines that say they are fake and look like no real token. */
export function fakeSecret(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  if (!v.includes('\n')) return FAKE_TOKEN(v);
  return v.length <= ARTIFACTS_LIMITS.value && /lesson|fake|example|demo/i.test(v) && v.split('\n').every(l => !REAL.test(l.trim()) && !/[\0\r]/.test(l));
}
/** Why a secret or variable name is not one GitHub accepts (null: it is). */
export function nameProblem(name: unknown): string | null {
  if (typeof name !== 'string' || !NAME.test(name) || name.length > 100) return 'names are letters, digits and _ (not starting with a digit, at most 100)';
  if (/^GITHUB_/i.test(name)) return 'names must not start with GITHUB_';
  return null;
}

/** E29: the problems of a machine's artifacts data (secrets, variables, environments, cache and cachedSeconds need the profile). */
export function artifactsProblems(m: TerminalMachine, artifacts: boolean): string[] {
  const out: string[] = [];
  for (const r of m.forge?.repos ?? []) {
    const at = `forge repo ${r.url}`;
    if (r.secrets === undefined && r.variables === undefined && r.environments === undefined) continue;
    if (!artifacts) { out.push(`${at}: secrets, variables and environments need the artifacts profile (engine stage E29)`); continue; }
    const envs = r.environments ?? [];
    if (!Array.isArray(envs) || envs.length > ARTIFACTS_LIMITS.environments || envs.some(e => typeof e !== 'string' || !ENV_NAME.test(e)) || new Set(envs).size !== envs.length)
      out.push(`${at}: environments are at most ${ARTIFACTS_LIMITS.environments} distinct names of [A-Za-z0-9_.-]`);
    for (const [kind, list, max] of [['secret', r.secrets, ARTIFACTS_LIMITS.secrets], ['variable', r.variables, ARTIFACTS_LIMITS.variables]] as const) {
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.length > max) { out.push(`${at}: at most ${max} ${kind}s`); continue; }
      const seen = new Set<string>();
      for (const v of list) {
        const p = nameProblem(v?.name), where = `${at}: ${kind} ${v?.name}`;
        if (p) out.push(`${where}: ${p}`);
        if (seen.has(`${String(v?.name).toUpperCase()}\n${v?.env ?? ''}`)) out.push(`${where}: declared twice`);
        seen.add(`${String(v?.name).toUpperCase()}\n${v?.env ?? ''}`);
        if (v.env !== undefined && !envs.includes(v.env)) out.push(`${where}: env must be one of environments`);
        if (v.updated !== undefined && parseTime(v.updated) === undefined) out.push(`${where}: updated is a time YYYY-MM-DD HH:MM:SS`);
        if (kind === 'secret' && !fakeSecret(v.value))
          out.push(`${where}: the value must be an obviously fake lesson value (E23's fake token rule: containing lesson, fake, example or demo, and not shaped like a real provider's token)`);
        if (kind === 'variable' && (typeof v.value !== 'string' || v.value.length > ARTIFACTS_LIMITS.value)) out.push(`${where}: the value is a text of at most ${ARTIFACTS_LIMITS.value} characters`);
      }
    }
  }
  for (const t of m.actions?.tools ?? []) {
    const cached = t.cache !== undefined || (t.cases ?? []).some(c => c?.cachedSeconds !== undefined);
    if (!cached) continue;
    const at = `actions: tool ${t.command}`;
    if (!artifacts) { out.push(`${at}: cache and cachedSeconds need the artifacts profile (engine stage E29)`); continue; }
    if (typeof t.cache !== 'string' || !/^(?:~\/|\/)?[A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@+-]+)*$/.test(t.cache) || t.cache.split('/').includes('..'))
      out.push(`${at}: cache is the folder it fills (relative to the working folder, ~/… or absolute) and cachedSeconds needs it`);
    if ((t.cases ?? []).some(c => c?.cachedSeconds !== undefined && !(Number.isInteger(c.cachedSeconds) && c.cachedSeconds >= 0 && c.cachedSeconds <= 3600)))
      out.push(`${at}: cachedSeconds are 0..3600`);
  }
  return out;
}

/** E29: what a runner's Docker has — the machine's Docker Hub and registry images (none local yet), its registries and build tools. */
export function runnerDocker(m: TerminalMachine): TerminalDocker | undefined {
  const d = m.docker;
  if (!d) return undefined;
  return {
    images: (d.images ?? []).filter(i => i.registry !== false).map(i => ({ ...i, pulled: false })),
    ...d.registries ? { registries: d.registries } : {}, ...d.tools ? { tools: d.tools } : {}, ...d.programs ? { programs: d.programs } : {},
  };
}

/** E29: the forge repositories' secrets, variables and environments, and the CI state's counters (artifacts profile). */
export function artifactsState(m: TerminalMachine, state: FsState, artifacts: boolean): FsState {
  if (!artifacts || !state.ci || artifactsProblems(m, artifacts).length) return state;
  const now = parseTime(m.now ?? DEFAULT_NOW)!;
  const values = (list: readonly (TerminalSecret | TerminalVariable)[] | undefined): ActionsValue[] =>
    (list ?? []).map(v => ({ name: v.name.toUpperCase(), value: v.value, ...v.env !== undefined ? { env: v.env } : {}, updatedAt: v.updated !== undefined ? parseTime(v.updated)! : now }));
  const git = state.git && {
    ...state.git,
    forge: state.git.forge.map(f => {
      const d = m.forge?.repos?.find(r => r.url === f.url);
      if (!f.site || !d) return f;
      return { ...f, site: { ...f.site, secrets: values(d.secrets), variables: values(d.variables), environments: [...d.environments ?? []] } };
    }),
  };
  return { ...state, ...git ? { git } : {}, ci: { ...state.ci, art: { artifact: 5100000001, cache: 1, pending: [] } } };
}

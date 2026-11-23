import type { FsState } from '@/lib/terminal/fs';
import { ARTIFACTS_PROFILE, run, type ShellProfile } from '@/lib/terminal/shell';
import { machineState, type TerminalMachine } from '@/lib/terminal/lesson';
import type { WorkflowRun } from '@/lib/terminal/actions-model';
import { ARTIFACTS_COMMITS, artifactsLab, SHOP } from './artifacts-fixture';

/* Helpers for the E29 tests: sessions on the artifacts lab, a lab with extra workflow files, the runs and logs. */

const MEI = { name: 'Mei Lin', email: 'mei@example.com' };
export interface Logged { out: string[]; err: string[]; status?: number }
export function session(from: FsState | TerminalMachine, profile: ShellProfile = ARTIFACTS_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: Logged[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), status: r.state.status });
  }
  return { state, log, last: log.at(-1)! };
}
export const lab = (...commands: string[]) => session(artifactsLab, ARTIFACTS_PROFILE, ...commands);
export const runsOf = (s: FsState, url = SHOP): readonly WorkflowRun[] => s.git!.forge.find(f => f.url === url)!.site!.runs ?? [];
export const siteOf = (s: FsState, url = SHOP) => s.git!.forge.find(f => f.url === url)!.site!;
export const wf = (...lines: string[]) => [...lines, ''].join('\n');
/** The lab with a third commit on main adding these files (~/shop is its clone). */
export function labWith(files: Record<string, string | null>, extra: Partial<TerminalMachine> = {}): TerminalMachine {
  return {
    ...artifactsLab, ...extra,
    git: { ...artifactsLab.git!, commits: [...ARTIFACTS_COMMITS, { id: 'c3', message: 'More workflows', files, author: MEI, time: '2026-11-22 01:00:00' }], remotes: [{ url: SHOP, branches: { main: 'c3' } }] },
  };
}
/** A run's log lines without the job and the timestamp (job<Tab>step<Tab>stamp text → step<Tab>text). */
export function logOf(s: FsState, id: number, profile: ShellProfile = ARTIFACTS_PROFILE): string[] {
  return session(s, profile, `gh run view ${id} --log`).last.out.map(l => { const [, step, rest] = l.split('\t'); return `${step}\t${rest.replace(/^\S+Z /, '')}`; });
}
/** The log lines of one step. */
export const stepLog = (s: FsState, id: number, step: string) => logOf(s, id).filter(l => l.startsWith(`${step}\t`)).map(l => l.slice(step.length + 1));

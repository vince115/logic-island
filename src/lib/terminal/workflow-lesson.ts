import type { FsState } from './fs';
import type { TerminalMachine } from './lesson';

/*
 * Engine stage E27 as lesson data (docs/curriculum/CICD0_E27_WORKFLOWS.md §7). Workflow files are ordinary files of the
 * git data's commits or of a repository's folder, so a lesson writes them there. Per forge repository the lesson may set
 * the repository's "Workflow permissions" (workflowPermissions: read is restricted, the default; write is permissive),
 * which is the GITHUB_TOKEN's default when neither the workflow nor the job names permissions.
 */

/** E27: the problems of a machine's workflow data (workflowPermissions needs the workflows profile). */
export function workflowProblems(m: TerminalMachine, workflows: boolean): string[] {
  const problems: string[] = [];
  for (const r of m.forge?.repos ?? []) {
    if (r.workflowPermissions === undefined) continue;
    if (!workflows) problems.push(`forge repo ${r.url}: workflowPermissions needs the workflows profile (engine stage E27)`);
    else if (r.workflowPermissions !== 'read' && r.workflowPermissions !== 'write') problems.push(`forge repo ${r.url}: workflowPermissions must be read or write`);
  }
  return problems;
}

/** E27: the forge repositories' workflow permissions on the machine's state (only those the lesson declares; read otherwise). */
export function workflowState(m: TerminalMachine, state: FsState, workflows: boolean): FsState {
  const declared = (m.forge?.repos ?? []).filter(r => r.workflowPermissions !== undefined);
  if (!workflows || !declared.length || !state.git || workflowProblems(m, workflows).length) return state;
  const forge = state.git.forge.map(f => {
    const d = declared.find(r => r.url === f.url);
    return d && f.site ? { ...f, site: { ...f.site, workflowPermissions: d.workflowPermissions } } : f;
  });
  return { ...state, git: { ...state.git, forge } };
}

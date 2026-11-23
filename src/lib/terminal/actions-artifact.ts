import { childrenOf, parentOf, type FsState } from './fs';
import { matchName } from './glob';
import { inputLines, keep, relativeTo, stepPath, writeKept, type ArtPlan } from './artifacts-job';
import { sizeOf, type ArtifactEntry, type KeptFile } from './artifacts-model';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md §3): actions/upload-artifact@v4 and download-artifact@v4.
 * An upload keeps the files of its paths (folders whole; * and ? within a path segment) relative to their least common
 * folder; names are unique within a run (v4's artifacts are immutable: the same name again is a 409 Conflict unless
 * overwrite: true). A download (a later job of the same run) writes one artifact's files into its path, or every
 * artifact into a folder of its name.
 */

export interface ArtifactStep { state: FsState; lines: string[]; ok: boolean; outputs: Record<string, string>; seconds: number; entry?: ArtifactEntry; replaces?: number }
type Withs = readonly (readonly [string, string])[];
const input = (withs: Withs, k: string) => withs.find(w => w[0] === k)?.[1]?.trim();
const BAD = [['"', 'Double quote "'], [':', 'Colon :'], ['<', 'Less than <'], ['>', 'Greater than >'], ['|', 'Vertical bar |'], ['*', 'Asterisk *'], ['?', 'Question mark ?'],
  ['\r', 'Carriage return \\r'], ['\n', 'Line feed \\n'], ['\\', 'Backslash \\'], ['/', 'Forward slash /']] as const;

/** The paths a pattern names (segments may hold * and ?), and the folder before its first wildcard. */
function expand(state: FsState, abs: string): { found: string[]; base: string } {
  const parts = abs.split('/').filter(Boolean), wild = parts.findIndex(p => /[*?]/.test(p));
  if (wild < 0) return { found: state.nodes.has(abs) ? [abs] : [], base: state.nodes.get(abs)?.kind === 'dir' ? abs : parentOf(abs) };
  let at = [`/${parts.slice(0, wild).join('/')}`];
  for (const seg of parts.slice(wild)) at = at.flatMap(d => childrenOf(state.nodes, d === '/' ? '/' : d).filter(c => matchName(seg, c.slice(c.lastIndexOf('/') + 1))));
  return { found: at, base: `/${parts.slice(0, wild).join('/')}` };
}
const common = (dirs: string[]) => dirs.reduce((a, b) => { let x = a; while (!(b === x || b.startsWith(`${x === '/' ? '' : x}/`))) x = parentOf(x); return x; });

export function uploadArtifact(state: FsState, withs: Withs, plan: ArtPlan, workspace: string, job: { id: number; attempt: number }, t: number): ArtifactStep {
  const name = input(withs, 'name') || 'artifact', paths = inputLines(withs.find(w => w[0] === 'path')?.[1]), mode = input(withs, 'if-no-files-found') || 'warn';
  const fail = (line: string): ArtifactStep => ({ state, lines: [`##[error]${line}`], ok: false, outputs: {}, seconds: 0 });
  if (!paths.length) return fail('Input required and not supplied: path');
  const bad = BAD.find(([c]) => name.includes(c));
  if (bad) return fail(`The artifact name is not valid: ${name}. Contains the following character:  ${bad[1]}`);
  const days = input(withs, 'retention-days') ? Number(input(withs, 'retention-days')) : plan.retention;
  if (!Number.isInteger(days) || days < 1 || days > 90) return fail(`Invalid retention-days: ${input(withs, 'retention-days')}. Must be between 1 and 90.`);
  const sets = paths.map(p => expand(state, stepPath(workspace, p)));
  const roots = sets.flatMap(s => s.found.length ? [s.base] : []);
  const all: KeptFile[] = keep(state, sets.flatMap(s => s.found)), files = roots.length ? relativeTo(all, common(roots)).filter(f => f.kind === 'file') : [];
  if (!files.length) {
    const line = `No files were found with the provided path: ${paths.join(', ')}. No artifacts will be uploaded.`;
    if (mode === 'error') return fail(line);
    return { state, lines: [mode === 'ignore' ? line : `##[warning]${line}`], ok: true, outputs: {}, seconds: 0 };
  }
  const same = plan.artifacts.find(a => a.name === name && a.at <= t);
  if (same && input(withs, 'overwrite') !== 'true') return fail('Failed to CreateArtifact: Received non-retryable error: Failed request: (409) Conflict: an artifact with this name already exists on the workflow run');
  const size = sizeOf(files), id = plan.ids.artifact++, url = `${plan.web}/actions/runs/${plan.runId}/artifacts/${id}`;
  const entry: ArtifactEntry = { id, name, runId: plan.runId, attempt: job.attempt, jobId: job.id, files, size, at: t + 1, expiresAt: t + 1 + days * 86400 };
  return {
    state, ok: true, seconds: 1, entry, ...same ? { replaces: same.id } : {}, outputs: { 'artifact-id': String(id), 'artifact-url': url },
    lines: [`With the provided path, there will be ${files.length} file${files.length === 1 ? '' : 's'} uploaded`, 'Artifact name is valid!', 'Root directory input is valid!',
      ...same ? [`Deleting existing artifact ${name} (ID: ${same.id})`] : [], 'Beginning upload of artifact content to blob storage', `Uploaded bytes ${size}`, 'Finished uploading artifact content to blob storage!',
      'Finalizing artifact upload', `Artifact ${name}.zip successfully finalized. Artifact ID ${id}`, `Artifact ${name} has been successfully uploaded! Final size is ${size} bytes. Artifact ID is ${id}`, `Artifact download URL: ${url}`],
  };
}

export function downloadArtifact(state: FsState, withs: Withs, plan: ArtPlan, workspace: string, t: number): ArtifactStep {
  const name = input(withs, 'name'), pattern = input(withs, 'pattern'), merge = input(withs, 'merge-multiple') === 'true';
  const dest = stepPath(workspace, input(withs, 'path') || '.');
  if (input(withs, 'run-id') || input(withs, 'github-token')) return { state, lines: ['##[error]模擬環境的 download-artifact 只能下載同一個 run 的 artifact（run-id 與 github-token 不支援）'], ok: false, outputs: {}, seconds: 0 };
  const visible = plan.artifacts.filter(a => a.at <= t && a.expiresAt > t);
  const row = (a: ArtifactEntry) => `- ${a.name} (ID: ${a.id}, Size: ${a.size})`;
  if (name) {
    const a = visible.find(x => x.name === name);
    if (!a) return { state, lines: [`##[error]Unable to download artifact(s): Artifact not found for name: ${name}`], ok: false, outputs: {}, seconds: 0 };
    return {
      state: writeKept(state, a.files, dest), ok: true, seconds: 1, outputs: { 'download-path': dest },
      lines: ['Downloading single artifact', 'Preparing to download the following artifacts:', row(a), `Starting download of artifact to: ${dest}`, 'Artifact download completed successfully.', 'Total of 1 artifact(s) downloaded', 'Download artifact has finished successfully'],
    };
  }
  const chosen = visible.filter(a => !pattern || matchName(pattern, a.name)).sort((a, b) => a.id - b.id);
  let next = state;
  for (const a of chosen) next = writeKept(next, a.files, merge ? dest : `${dest === '/' ? '' : dest}/${a.name}`);
  return {
    state: next, ok: true, seconds: 1, outputs: { 'download-path': dest },
    lines: ['No input name specified, downloading all artifacts', ...chosen.length ? ['Preparing to download the following artifacts:', ...chosen.map(row)] : [], ...chosen.map(a => `Starting download of artifact to: ${merge ? dest : `${dest}/${a.name}`}`),
      `Total of ${chosen.length} artifact(s) downloaded`, 'Download artifact has finished successfully'],
  };
}

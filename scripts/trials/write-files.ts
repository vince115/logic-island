import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';

/*
 * T.1.1 (acceptance I2): the import CLI writes three files that must agree — the generated questions, the published
 * hashes and the generated index. Each new content goes to a temporary file first; only when all are written are the
 * originals moved aside and the new files renamed into place. If any step fails, every original is put back and the
 * temporary files are removed, so the folder is left as it was. (Renames are atomic one file at a time; the rollback
 * covers the moment between them.)
 */
export interface FileWrite { path: string; content: string }

export function writeAllOrNothing(files: FileWrite[], tag = `${process.pid}`): void {
  const staged: { path: string; temp: string; backup?: string; placed?: boolean }[] = [];
  try {
    for (const f of files) {
      const temp = `${f.path}.tmp-${tag}`;
      staged.push({ path: f.path, temp });
      writeFileSync(temp, f.content);
    }
    for (const s of staged) {
      // Recorded only once the original has really moved, so a failed move is never "restored" over it.
      if (existsSync(s.path)) { const backup = `${s.path}.bak-${tag}`; renameSync(s.path, backup); s.backup = backup; }
      renameSync(s.temp, s.path);
      s.placed = true;
    }
  } catch (error) {
    for (const s of staged) {
      if (s.placed) rmSync(s.path, { force: true });
      if (s.backup && existsSync(s.backup)) renameSync(s.backup, s.path);
      rmSync(s.temp, { force: true });
    }
    throw error;
  }
  for (const s of staged) if (s.backup) rmSync(s.backup, { force: true });
}

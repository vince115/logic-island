import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trialBank } from '@/content/trials';
import { trialContext } from '@/content/trials/context';
import { hasPrivateBank, privateFile } from '@/content/trials/private-bank';
import { publicBatches } from '@/content/trials/generated';
import type { GeneratedBatch, Question, TrialBank } from '@/content/trials/schema';
import { batchFileOf, planImport } from '@/lib/trials/import';
import type { Manifest } from '@/lib/trials/integrity';
import { checkLedger, examResolver, type Ledger } from '@/lib/trials/lifecycle';
import type { FileWrite } from './write-files';

/*
 * Shared Trial System T.2C: what the review and publish CLIs share. Both change the ledger and nothing else by hand;
 * the generated questions and published-hashes.json are then rebuilt by the same import plan the importer uses, so a
 * status can only come from the ledger. The caller writes the returned files all or none (writeAllOrNothing).
 */
export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TRIALS = path.join(ROOT, 'src/content/trials');
export const LEDGER = path.join(TRIALS, 'ledger.json');
const GENERATED = path.join(TRIALS, 'generated');
const HASHES = path.join(TRIALS, 'published-hashes.json');

const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'));
export const readLedger = () => read<Ledger>(LEDGER);
export const readHashes = () => read<Record<string, string>>(HASHES);
export const ledgerJson = (l: Ledger) => `${JSON.stringify(l, null, 1)}\n`;
const ids = (dir: string) => readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
/** The batch ids that have generated output, in file order: this repository's and the private bank's (T.3J). */
export const batchIds = () => [...ids(GENERATED), ...hasPrivateBank ? ids(privateFile('generated')) : []].sort();
/** T.3J: a batch's generated file and batch file are in this repository (published questions) or in the private bank. */
const located = (rel: string) => existsSync(path.join(ROOT, rel)) ? path.join(ROOT, rel) : privateFile(rel.replace(/^src\/content\/trials\//, ''));
export const generatedFileOf = (id: string) => located(`src/content/trials/generated/${id}.json`);
export const batchPathOf = (id: string) => located(batchFileOf(id));
export const generatedOf = (id: string) => read<GeneratedBatch>(generatedFileOf(id));
export const bankQuestions = (): Question[] => trialBank.questions;

/*
 * T.3J: the assessment manifest is two files. This repository's holds the entries of its own (published) questions;
 * the private bank's holds the rest, since a manifest entry hashes each part on its own and an answer's hash could be
 * matched against the few answers a question has. Read together; written back each to its own file.
 */
export const MANIFEST = path.join(TRIALS, 'assessment-manifest.json');
export const PRIVATE_MANIFEST = privateFile('assessment-manifest.json');
const publicIds = new Set(publicBatches.flatMap(b => b.questions.map(q => q.id)));
const isPublicKey = (key: string) => publicIds.has(key.slice(0, key.lastIndexOf('@')));
export function readManifest(): Manifest | undefined {
  if (!existsSync(MANIFEST)) return undefined;
  const own = read<Manifest>(MANIFEST);
  if (!hasPrivateBank || !existsSync(PRIVATE_MANIFEST)) return own;
  return { ...own, entries: { ...own.entries, ...read<Manifest>(PRIVATE_MANIFEST).entries } };
}
export function manifestWrites(m: Manifest): FileWrite[] {
  const part = (own: boolean): Manifest => ({ ...m, entries: Object.fromEntries(Object.entries(m.entries).filter(([k]) => isPublicKey(k) === own)) });
  const text = (x: Manifest) => `${JSON.stringify(x, null, 1)}\n`;
  const rest = part(false);
  if (!hasPrivateBank && Object.keys(rest.entries).length) throw new Error('entries of unpublished questions belong in the private bank, which is not checked out');
  return [{ path: MANIFEST, content: text(part(true)) }, ...hasPrivateBank ? [{ path: PRIVATE_MANIFEST, content: text(rest) }] : []];
}

export interface Rebuild { ok: boolean; errors: string[]; files: FileWrite[]; statuses: Map<string, string> }

/**
 * Re-plans every batch with `ledger` (in batch order, each seeing the hashes the earlier ones added) and returns the
 * files that change. Before anything, each batch must re-plan unchanged with the committed ledger: a bank out of sync
 * with its batch files is never published or reviewed on top of.
 */
export function rebuild(ledger: Ledger, committed: Ledger): Rebuild {
  const errors: string[] = [], files: FileWrite[] = [], statuses = new Map<string, string>();
  const ctx = trialContext();
  let hashes = readHashes(), bank: TrialBank = trialBank;
  const ledgerProblems = checkLedger(ledger, trialBank.questions, examResolver(trialBank), hashes);
  if (ledgerProblems.length) return { ok: false, errors: ledgerProblems, files, statuses };
  for (const id of batchIds()) {
    const file = batchFileOf(id), out = generatedFileOf(id), at = batchPathOf(id);
    if (!existsSync(at)) { errors.push(`${id}: no batch file at ${file} or in the private bank`); continue; }
    const raw = read<unknown>(at), previous = generatedOf(id);
    const before = planImport(raw, bank, ctx, previous, hashes, file, undefined, committed);
    if (!before.ok || JSON.stringify(before.output) !== JSON.stringify(previous)) { errors.push(`${id}: the generated file is not in sync with its batch file; run the importer first`); continue; }
    const after = planImport(raw, bank, ctx, previous, hashes, file, undefined, ledger);
    if (!after.ok) { errors.push(...after.errors.map(e => `${id}: ${e}`), ...after.bankProblems.map(e => `${id}: ${e}`)); continue; }
    for (const l of after.lines) statuses.set(l.id, l.status);
    const text = `${JSON.stringify(after.output, null, 1)}\n`;
    if (text !== readFileSync(out, 'utf8')) files.push({ path: out, content: text });
    hashes = after.hashes!;
    bank = { ...bank, questions: [...bank.questions.filter(q => !after.output!.questions.some(o => o.id === q.id)), ...after.output!.questions] };
  }
  const hashText = `${JSON.stringify(hashes, null, 1)}\n`;
  if (hashText !== readFileSync(HASHES, 'utf8')) files.push({ path: HASHES, content: hashText });
  files.push({ path: LEDGER, content: ledgerJson(ledger) });
  return { ok: !errors.length, errors, files, statuses };
}

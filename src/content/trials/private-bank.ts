import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { GeneratedBatch } from './schema';

/*
 * T.3J (docs/exam-system/34): the private question bank. Every question not yet published — its text, answers and
 * explanations — and the files that describe it (review queues, the volatility register, its assessment manifest
 * entries, its batch files) live in a private repository, checked out at private/question-bank (git-ignored) or at
 * LOGIC_ISLAND_PRIVATE_BANK. Without it the bank holds the published questions only, which is how the public
 * repository, its CI and a deployment from it see the bank. Server and Node only: the files are read, never bundled.
 */
export const PRIVATE_BANK_DIR = path.resolve(process.env.LOGIC_ISLAND_PRIVATE_BANK || path.join(process.cwd(), 'private/question-bank'));
/** Whether the private bank is checked out (its generated questions are there). */
export const hasPrivateBank = existsSync(path.join(PRIVATE_BANK_DIR, 'generated'));
/** A file of the private bank, by its path inside it (e.g. data/ccarf-review-queue.json). */
export const privateFile = (rel: string) => path.join(PRIVATE_BANK_DIR, rel);

if (!hasPrivateBank && process.env.LOGIC_ISLAND_REQUIRE_PRIVATE_BANK === '1')
  throw new Error(`LOGIC_ISLAND_REQUIRE_PRIVATE_BANK=1 but there is no private bank at ${PRIVATE_BANK_DIR}`);

/** The generated question files of the private bank, in file order. */
export const privateBatches: GeneratedBatch[] = hasPrivateBank
  ? readdirSync(privateFile('generated')).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(privateFile(`generated/${f}`), 'utf8')))
  : [];

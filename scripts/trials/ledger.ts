import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { trialBank } from '@/content/trials';
import { ledgerAppendOnlyFailures, nextSeq } from '@/lib/trials/ledger-order';
import { replayLedger, replayMismatches } from '@/lib/trials/ledger-replay';
import { checkLedger, examResolver, type Ledger } from '@/lib/trials/lifecycle';
import { readHashes, readLedger } from './ledger-io';

/*
 * Shared Trial System T.3G: the ledger check (docs/exam-system/31 §9). Reads only; never repairs or rewrites a record.
 *
 *   ledger.ts [--json report.json] [--base earlier-ledger.json]
 *
 * Checks src/content/trials/ledger.json against the bank (records, exams, references, the event sequence), replays it
 * event by event and compares the result with the lifecycle, and with --base also checks that the ledger only grew:
 * every earlier record unchanged and in place, every appended one sequenced after them. Reports name questions,
 * revisions, hashes and event ids only. Exit codes: 0 pass, 1 fail, 2 usage.
 */
const args = process.argv.slice(2);
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const unknown = args.filter((a, i) => a.startsWith('--') ? !['--json', '--base'].includes(a) : !['--json', '--base'].includes(args[i - 1]));
if (unknown.length) { console.error(`unknown argument ${unknown[0]}`); process.exit(2); }

const ledger = readLedger(), hashes = readHashes(), examOf = examResolver(trialBank);
const problems = checkLedger(ledger, trialBank.questions, examOf, hashes);
const replay = replayLedger(ledger, trialBank.questions, hashes, examOf);
const mismatches = replayMismatches(ledger, trialBank.questions, replay, hashes);
const failures = [...problems, ...replay.violations.map(v => `replay: ${v}`), ...mismatches.map(m => `replay: ${m}`)];
const baseFile = opt('--base');
let base: { file: string; records: number; failures: string[] } | undefined;
if (baseFile) {
  if (!existsSync(baseFile)) { console.error(`no base ledger at ${baseFile}`); process.exit(2); }
  const b = JSON.parse(readFileSync(baseFile, 'utf8')) as Ledger;
  base = { file: baseFile, records: b.reviews.length + b.publications.length + (b.revocations?.length ?? 0), failures: ledgerAppendOnlyFailures(b, ledger) };
  failures.push(...base.failures);
}
const counts = { reviews: ledger.reviews.length, publications: ledger.publications.length, revocations: ledger.revocations?.length ?? 0 };
const live = [...replay.states.values()].filter(s => s.live).length, withdrawn = [...replay.states.values()].filter(s => !s.live && s.withdrawals).length;
const json = opt('--json');
if (json) writeFileSync(json, `${JSON.stringify({ format: 'logic-island.trials-ledger-check/1', ok: !failures.length, counts, events: replay.events, sequenced: replay.sequenced,
  lastSeq: nextSeq(ledger) - 1, revisions: replay.states.size, live, withdrawn, base, failures }, null, 1)}\n`);
console.log(`ledger: ${counts.reviews} review(s), ${counts.publications} publication(s), ${counts.revocations} withdrawal(s); ${replay.sequenced}/${replay.events} event(s) sequenced (last ${nextSeq(ledger) - 1})`);
console.log(`replay: ${replay.states.size} revision(s) with records, ${live} live through the ledger, ${withdrawn} withdrawn${base ? `; ${base.records} record(s) of ${base.file} kept` : ''}`);
if (failures.length) { console.error(['LEDGER CHECK FAILED (nothing was changed):', ...failures.map(f => `- ${f}`)].join('\n')); process.exit(1); }
console.log('the ledger is consistent and in order; nothing was written');

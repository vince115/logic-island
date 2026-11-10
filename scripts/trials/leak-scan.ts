import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { publicBatches } from '@/content/trials/generated';
import { hasPrivateBank, privateBatches } from '@/content/trials/private-bank';
import { contentText, type Content, type Question } from '@/content/trials/schema';
import { ROOT } from './ledger-io';

/*
 * T.3J (docs/exam-system/34 §5): what the public repository may never hold — the text, answers and explanations of
 * the private bank's questions. Needs the private bank (that is what it looks for) and reads only.
 *
 *   leak-scan.ts                         every file git tracks in this checkout (as it is on disk)
 *   leak-scan.ts --history <range>       every blob and commit message reachable in a git range (e.g. origin/main..HEAD)
 *   leak-scan.ts ... --json report.json
 *
 * A hit is a run of at least K characters (whitespace and case ignored) of a private question's stem, options,
 * explanation or option explanations, unless the published questions share it; or a line naming a private question
 * next to an answer word. Reports name paths, counts and question ids, never the text. Exit 0 clean, 1 hits, 2 usage.
 */
const K = 24, STRIDE = 8;
const args = process.argv.slice(2);
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
if (!hasPrivateBank) { console.error('no private bank checked out: there is nothing to look for (see docs/exam-system/34)'); process.exit(2); }

const flat = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const blocks = (c: Content | undefined) => c ? contentText(c) : '';
const textsOf = (q: Question) => q.revisions.flatMap(r => [blocks(r.stem), ...(r.options ?? []).map(o => blocks(o.body)), blocks(r.explanation?.body),
  ...(r.explanation?.options ?? []).map(e => blocks(e.body))]).map(flat).filter(t => t.length >= K);
const grams = (t: string, stride: number) => { const out: string[] = []; for (let i = 0; i + K <= t.length; i += stride) out.push(t.slice(i, i + K)); return out; };

const shared = new Set(publicBatches.flatMap(b => b.questions).flatMap(textsOf).flatMap(t => grams(t, 1)));
const needles = new Map<string, string>();
for (const q of privateBatches.flatMap(b => b.questions)) for (const t of textsOf(q)) for (const g of grams(t, STRIDE)) if (!shared.has(g)) needles.set(g, q.id);
const ids = privateBatches.flatMap(b => b.questions.map(q => q.id));
const idPattern = new RegExp(`\\b(${ids.map(i => i.replace(/-/g, '\\-')).join('|')})\\b`);
const answerWords = /(答案|正解|正確選項|correct|answer)\s*[:：（(]?\s*[A-Fa-f]\b|[（(][A-F][)）]\s*(正確|為正解)/;

interface Hit { path: string; text: number; answerLines: number; questions: string[] }
function scan(where: string, content: string): Hit | undefined {
  const f = flat(content), found = new Set<string>();
  let text = 0;
  for (let i = 0; i + K <= f.length; i++) { const q = needles.get(f.slice(i, i + K)); if (q) { text++; found.add(q); } }
  let answerLines = 0;
  for (const line of content.split('\n')) { const m = line.match(idPattern); if (m && answerWords.test(line)) { answerLines++; found.add(m[1]); } }
  return text || answerLines ? { path: where, text, answerLines, questions: [...found].sort().slice(0, 8) } : undefined;
}
const binary = (b: Buffer) => b.subarray(0, 8000).includes(0);

const hits: Hit[] = [];
let scanned = 0;
const range = opt('--history');
if (range) {
  // Every blob reachable in the range (each path it was seen at), and every commit message.
  const objects = execFileSync('git', ['rev-list', '--objects', range], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 30 }).trim().split('\n').filter(Boolean);
  const commits = execFileSync('git', ['rev-list', range], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 30 }).trim().split('\n').filter(Boolean);
  const named = new Map<string, string>();
  for (const line of objects) { const [sha, ...p] = line.split(' '); if (p.length) named.set(sha, p.join(' ')); }
  for (const [sha, where] of named) {
    if (execFileSync('git', ['cat-file', '-t', sha], { cwd: ROOT, encoding: 'utf8' }).trim() !== 'blob') continue;
    const body = execFileSync('git', ['cat-file', 'blob', sha], { cwd: ROOT, maxBuffer: 1 << 30 });
    if (binary(body)) continue;
    scanned++;
    const h = scan(`${where} (${sha.slice(0, 10)})`, body.toString('utf8'));
    if (h) hits.push(h);
  }
  for (const c of commits) { scanned++; const h = scan(`commit ${c.slice(0, 10)} message`, execFileSync('git', ['log', '-1', '--format=%B', c], { cwd: ROOT, encoding: 'utf8' })); if (h) hits.push(h); }
} else {
  for (const rel of execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 30 }).split('\0').filter(Boolean)) {
    let body: Buffer;
    try { body = readFileSync(path.join(ROOT, rel)); } catch { continue; } // deleted in the working tree
    if (binary(body)) continue;
    scanned++;
    const h = scan(rel, body.toString('utf8'));
    if (h) hits.push(h);
  }
}

const json = opt('--json');
if (json) writeFileSync(json, `${JSON.stringify({ format: 'logic-island.trials-leak-scan/1', range: range ?? 'working tree', needles: needles.size, privateQuestions: ids.length, scanned, ok: !hits.length, hits }, null, 1)}\n`);
console.log(`leak scan (${range ?? 'tracked files'}): ${scanned} texts against ${needles.size} fragments of ${ids.length} private questions`);
for (const h of hits) console.log(`- ${h.path}: ${h.text} text fragment(s), ${h.answerLines} answer line(s); ${h.questions.join(', ')}`);
console.log(hits.length ? `LEAK: ${hits.length} file(s) hold private question content` : 'clean: no private question content found');
process.exit(hits.length ? 1 : 0);

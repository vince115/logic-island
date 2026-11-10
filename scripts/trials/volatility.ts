import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { trialBank } from '@/content/trials';
import { examResolver } from '@/lib/trials/lifecycle';
import { FLAGS, VOLATILITY_REGISTERS as REGISTERS, volatilityFailures, volatilityReport, type Register } from '@/lib/trials/volatility';
import { privateFile } from '@/content/trials/private-bank';

/*
 * Shared Trial System T.3F: version-sensitive question check (docs/exam-system/30 §8). Reads only: it never changes a
 * question, an answer, a revision or the register.
 *
 *   volatility.ts --exam ccarf [--today YYYY-MM-DD] [--due-soon 30] [--json report.json] [--check-sources] [--list]
 *
 * Flags each volatile question as overdue, due soon, missing a source or a review date, resting on the Exam Guide only,
 * with an unavailable source (only with --check-sources, which asks each reference URL over HTTPS), or verified on other
 * content than its current revision. Source availability and technical correctness are reported apart: a page that
 * answers never makes a claim verified. Exit 1 when the register does not match the bank (see volatilityFailures),
 * 2 on a usage error, 0 otherwise (warnings included). The JSON report leaves out the reason of an unpublished question.
 */
const args = process.argv.slice(2);
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const exam = opt('--exam');
if (!exam || !trialBank.exams.some(e => e.id === exam)) { console.error(`usage: volatility.ts --exam <${trialBank.exams.map(e => e.id).join('|')}> [--today YYYY-MM-DD] [--due-soon N] [--json file] [--check-sources] [--list]`); process.exit(2); }
const today = opt('--today') ?? new Date().toISOString().slice(0, 10);
const dueSoonDays = Number(opt('--due-soon') ?? 30);
if (!Number.isInteger(dueSoonDays) || dueSoonDays < 0) { console.error('--due-soon is a whole number of days'); process.exit(2); }
const registerFile = REGISTERS[exam] && privateFile(REGISTERS[exam]);
const register = registerFile && existsSync(registerFile) ? JSON.parse(readFileSync(registerFile, 'utf8')) as Register : undefined;
// T.3J: the register is in the private bank; without it, it is needed only if the bank holds questions of the exam.
const examQuestions = trialBank.questions.filter(q => examResolver(trialBank)(q) === exam).length;
if (registerFile && !register && examQuestions) { console.error(`no volatility register at ${REGISTERS[exam]} in the private bank`); process.exit(1); }

let availability: Map<string, boolean> | undefined;
const failedSources: { url: string; status: number | string }[] = [];
if (args.includes('--check-sources')) {
  availability = new Map();
  const urls = [...new Set(trialBank.questions.flatMap(q => q.references ?? []).map(r => r.url))].filter(u => u.startsWith('https://'));
  await Promise.all(urls.map(async url => {
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      if (res.status === 405 || res.status === 403) res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      availability!.set(url, res.ok);
      if (!res.ok) failedSources.push({ url, status: res.status });
    } catch (e) { availability!.set(url, false); failedSources.push({ url, status: (e as Error).name }); }
  }));
}

const report = volatilityReport(trialBank.questions, examResolver(trialBank), exam, register, today, { dueSoonDays, availability });
const failures = volatilityFailures(report);
const json = opt('--json');
// T.3I (docs/exam-system/33 §4): the JSON is a CI artifact. A reason names the technical terms a question turns on, which
// its options may share: for a question not yet published it is left out (the register and the bank keep it).
const rows = report.rows.map(r => r.status === 'published' ? r : { ...r, reason: undefined });
if (json) writeFileSync(json, `${JSON.stringify({ format: 'logic-island.trials-volatility/1', ok: !failures.length, ...report, rows, sourcesChecked: !!availability, failedSources, failures }, null, 1)}\n`);

const c = report.counts;
console.log(`# ${exam} 版本敏感題（${today}）\n`);
console.log(`- 版本敏感題 ${c.questions} 題；技術查證待辦（pending-verification）${c.pending} 題`);
console.log(`- 逾期 ${c.overdue}、${dueSoonDays} 天內到期 ${c['due-soon']}、缺來源 ${c['missing-source']}、僅依 Exam Guide ${c['exam-guide-only']}、缺複查日 ${c['missing-review-date']}`);
console.log(`- 官方文件可用性：${availability ? `本次檢查 ${availability.size} 個網址，無法取得 ${failedSources.length} 個` : '本次未檢查（--check-sources）'}；版本已變更 ${c['revision-changed']}、未登記 ${c.unregistered}`);
console.log(`- 技術正確性：${['ai-checked', 'human-verified', 'pending-verification'].map(s => `${s} ${report.rows.filter(r => r.technical === s).length}`).join('、')}（AI 查證不是人工審核；網址可連線不等於主張仍正確）`);
const byProduct = new Map<string, number>();
for (const r of report.rows) for (const p of r.products) byProduct.set(p, (byProduct.get(p) ?? 0) + 1);
console.log(`- 產品：${[...byProduct].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join('、')}`);
const due = report.rows.filter(r => r.daysLeft !== undefined).sort((a, b) => a.daysLeft! - b.daysLeft!)[0];
if (due) console.log(`- 最近複查日：${due.reviewBy}（${due.id}，${due.daysLeft} 天後）`);
for (const f of failedSources) console.log(`- 無法取得：${f.url}（${f.status}）`);
if (args.includes('--list')) {
  console.log(`\n| 題號 | 版本 | 產品 | 查證日 | 複查日 | 技術查證 | 文件可用性 | 標記 |\n|---|---:|---|---|---|---|---|---|`);
  for (const r of report.rows) console.log(`| ${r.id} | r${r.revision} | ${r.products.join('、') || '—'} | ${r.checkedAt ?? '—'} | ${r.reviewBy ?? '—'} | ${r.technical} | ${r.availability} | ${r.flags.filter(f => (FLAGS as readonly string[]).includes(f)).join(', ') || '—'} |`);
}
if (failures.length) { console.error(['\nVOLATILITY CHECK FAILED (nothing was changed):', ...failures.map(f => `- ${f}`)].join('\n')); process.exit(1); }
console.log('\nnothing was changed');

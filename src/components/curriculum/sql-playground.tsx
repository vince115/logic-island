'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Play, RotateCcw, X } from 'lucide-react';
import { DATASETS, type DatasetId } from '@/lib/sql/datasets';
import { SQL_LIMITS, type CheckOutcome, type ProbeOutcome, type RunResult, type SqlCheckSpec } from '@/lib/sql/engine';
import { isPlanTable, planSteps, PLAN_KIND_TEXT } from '@/lib/sql/plan';
import { SqlSession, TimeoutError } from '@/lib/sql/client';
import { DatasetSchema, SqlResultTable } from './sql-table';
import base from './curriculum.module.css';
import styles from './sql.module.css';

/*
 * Phase F.1a SQL playground and SQL exercise checker. SQL runs in this browser only (SQLite in a Web Worker,
 * src/lib/sql): nothing is sent anywhere, and each playground has its own worker and database.
 */

/** One session per component; stopped when the component goes away. */
function useSession() {
  const ref = useRef<SqlSession | null>(null);
  useEffect(() => () => ref.current?.dispose(), []);
  return () => (ref.current ??= new SqlSession());
}

const TIMEOUT_TEXT = `執行超過 ${SQL_LIMITS.timeoutMs / 1000} 秒，已停止這次查詢；練習場的資料也重設回原始狀態。`;

/** The SQL editor: a plain textarea (Tab still moves focus), Ctrl/⌘ + Enter runs. */
function Editor({ id, label, value, onChange, onRun }: { id: string; label: string; value: string; onChange: (v: string) => void; onRun: () => void }) {
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun(); }
  };
  return <div className={styles.editor}>
    <label htmlFor={id}>{label}</label>
    <textarea id={id} value={value} onChange={e => onChange(e.target.value)} onKeyDown={key} rows={Math.min(12, Math.max(4, value.split('\n').length + 1))}
      spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off" aria-describedby={`${id}-help`}/>
    <p id={`${id}-help`} className={styles.help}>Ctrl＋Enter（Mac：⌘＋Enter）執行。最多 {SQL_LIMITS.maxStatements} 個敘述，每次結果最多顯示 {SQL_LIMITS.maxRows} 列。</p>
  </div>;
}

/** F.1c: an EXPLAIN QUERY PLAN result as an indented list of steps, each named (全表掃描、索引搜尋…), then the raw table. */
function PlanView({ table }: { table: RunResult extends infer R ? R extends { ok: true; results: (infer T)[] } ? T : never : never }) {
  const steps = planSteps(table), depth = new Map<number, number>();
  return <div className={styles.plan}>
    <p className={styles.help}>查詢計畫（SQLite 的 EXPLAIN QUERY PLAN；其他資料庫的格式不同）：</p>
    <ol>{steps.map(s => { const d = s.parent ? (depth.get(s.parent) ?? 0) + 1 : 0; depth.set(s.id, d);
      return <li key={s.id} style={{ marginInlineStart: `${d * 1.25}em` }} data-kind={s.kind}><span className={styles.planKind}>{PLAN_KIND_TEXT[s.kind]}</span><code>{s.detail}</code></li>; })}</ol>
  </div>;
}

function RunView({ result }: { result: RunResult & { elapsedMs?: number } }) {
  if (!result.ok) return <div className={styles.error} role="alert">
    <strong>SQLite 錯誤</strong><code>{result.error}</code>{result.hint && <p>{result.hint}</p>}
  </div>;
  return <>
    {result.elapsedMs !== undefined && <p className={styles.help}>SQLite 執行時間約 {result.elapsedMs < 1 ? '不到 1' : Math.round(result.elapsedMs)} 毫秒（在你的瀏覽器裡量的；同一台電腦前後比較才有意義）。</p>}
    {result.results.map((table, i) => <div key={i}>{isPlanTable(table) && <PlanView table={table}/>}<SqlResultTable table={table} truncated={table.truncated}
      caption={result.results.length > 1 ? `第 ${i + 1} 個查詢結果` : '查詢結果'}/></div>)}
    {result.changes > 0 && <p className={styles.help}>已修改 {result.changes} 列資料（只在這個練習場，按「重設資料」可以還原）。</p>}
    {!result.results.length && !result.changes && <p className={styles.help}>敘述執行完成，沒有回傳資料列。</p>}
  </>;
}

const summary = (r: RunResult) => !r.ok ? `錯誤：${r.error}` : r.results.length
  ? `查詢完成，${r.results.map(t => `${t.rows.length} 列`).join('、')}${r.results.some(t => t.truncated) ? '（已截斷）' : ''}` : `執行完成${r.changes ? `，修改 ${r.changes} 列` : ''}`;

export interface SqlPreset { label: string; sql: string }

/** /curriculum/[slug] SQL lessons: an editor on a fixed dataset, preset queries, a result table and a reset. */
/**
 * F.1d: parameter values for `?` placeholders, one per line: a number is a number, NULL is NULL, anything else is text
 * taken exactly as typed (quotes included), the way a driver passes it.
 */
export const parseParams = (text: string) => text.split('\n').filter(line => line.length).map(line =>
  line === 'NULL' ? null : /^-?\d+(\.\d+)?$/.test(line.trim()) ? Number(line) : line);

export function SqlPlayground({ dataset, presets, initial, params: withParams }: { dataset: DatasetId; presets: SqlPreset[]; initial?: string; params?: boolean }) {
  const id = useId(), session = useSession();
  const [sql, setSql] = useState(initial ?? presets[0]?.sql ?? '');
  const [paramText, setParamText] = useState('');
  const [result, setResult] = useState<RunResult & { elapsedMs?: number }>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  async function run() {
    if (busy) return;
    setBusy(true);
    try { const r = await session().run(dataset, sql, withParams && paramText.trim() ? parseParams(paramText) : undefined); setResult(r); setStatus(summary(r)); }
    catch (e) { setResult({ ok: false, error: e instanceof TimeoutError ? 'timeout' : String(e), hint: e instanceof TimeoutError ? TIMEOUT_TEXT : undefined }); setStatus('查詢逾時，已停止'); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    try { await session().reset(dataset); setResult(undefined); setStatus('資料已重設為原始狀態'); }
    catch { setStatus('重設失敗，請再試一次'); }
    finally { setBusy(false); }
  }
  return <div className={styles.playground}>
    <DatasetSchema dataset={dataset}/>
    {presets.length > 0 && <div className={styles.presets} role="group" aria-label="範例查詢（載入到編輯器）">
      {presets.map(p => <button key={p.label} type="button" onClick={() => setSql(p.sql)}>{p.label}</button>)}
    </div>}
    <Editor id={`${id}-sql`} label="SQL" value={sql} onChange={setSql} onRun={run}/>
    {withParams && <div className={styles.editor}>
      <label htmlFor={`${id}-params`}>參數值（每行一個，依序對應 SQL 裡的 ?；數字當數字、NULL 當空值，其他照原樣當文字）</label>
      <textarea id={`${id}-params`} value={paramText} onChange={e => setParamText(e.target.value)} rows={3} spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off"/>
      <p className={styles.help}>參數值由驅動程式另外傳給資料庫，不會拼進 SQL 文字裡：值裡的引號、OR、分號都只是資料。</p>
    </div>}
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={run} disabled={busy} aria-busy={busy}><Play size={14} aria-hidden/>{busy ? '執行中…' : '執行'}</button>
      <button type="button" onClick={reset} disabled={busy}><RotateCcw size={14} aria-hidden/>重設資料</button>
    </div>
    <p className={styles.status} aria-live="polite">{status}</p>
    {result && <RunView result={result}/>}
  </div>;
}

const describe = (o: ProbeOutcome) => o.kind === 'rejected' ? `被拒絕（${o.error}）` : o.kind === 'accepted' ? '執行成功'
  : o.kind === 'plan' ? `查詢計畫：${o.steps.map(s => s.detail).join('；')}` : `查詢結果 ${o.table.rows.length} 列`;

/**
 * A SQL exercise's answer box: the learner's query and the reference solution run on fresh copies of every check
 * dataset and the result tables are compared, so any correct query passes. Hidden checks report pass or fail only.
 */
export function SqlChecker({ id, dataset, spec, starter }: { id: string; dataset: DatasetId; spec: SqlCheckSpec; starter?: string }) {
  const session = useSession();
  const [sql, setSql] = useState(starter ?? '');
  const [outcomes, setOutcomes] = useState<CheckOutcome[]>();
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  async function check() {
    if (busy) return;
    setBusy(true); setProblem('');
    try { setOutcomes(await session().check(spec, sql)); }
    catch (e) { setOutcomes(undefined); setProblem(e instanceof TimeoutError ? TIMEOUT_TEXT : `無法檢查：${String(e)}`); }
    finally { setBusy(false); }
  }
  const passed = outcomes?.every(o => o.verdict.ok);
  return <div className={styles.checker}>
    <Editor id={`${id}-answer`} label="你的 SQL" value={sql} onChange={setSql} onRun={check}/>
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={check} disabled={busy} aria-busy={busy}><Check size={14} aria-hidden/>{busy ? '檢查中…' : '檢查答案'}</button>
      <span className={styles.help}>{spec.probes?.length
        ? `用 ${spec.checks.length} 組資料，比對執行後每個檢查敘述的結果${spec.atomic ? '，並模擬在每個敘述之後當機' : ''}；起始資料：${DATASETS[dataset].title}`
        : `用 ${spec.checks.length} 組資料${spec.paramSets?.length ? `、每組各試 ${spec.paramSets.filter(p => !p.hidden).length} 組參數（隱藏測試另有參數）` : ''}比對結果（${spec.ordered ? '順序也要相同' : '不看順序'}）；資料表：${DATASETS[dataset].title}`}</span>
    </div>
    <div aria-live="polite">
      {problem && <p className={styles.error} role="alert">{problem}</p>}
      {outcomes && <>
        <p className={styles.verdict} data-ok={passed}>{passed ? <><Check size={16} aria-hidden/>全部通過：你的查詢在每組資料上都得到正確結果。</> : <><X size={16} aria-hidden/>還沒通過：看看下面哪一組資料的結果不同。</>}</p>
        <ol className={styles.checks}>{outcomes.map((o, i) => <li key={i} data-ok={o.verdict.ok}>
          <strong>{o.hidden ? `隱藏測試 ${i + 1}（${DATASETS[o.dataset].title}）` : `範例資料（${DATASETS[o.dataset].title}）`}：{o.verdict.ok ? '通過' : '未通過'}</strong>
          {!o.verdict.ok && <p>{o.verdict.message}</p>}
          {o.probe && o.probe.actual.kind === 'plan' && <p className={styles.help}>檢查敘述 <code>{o.probe.sql}</code> 的{describe(o.probe.actual)}</p>}
          {o.probe && o.probe.expected.kind !== 'table' && o.probe.expected.kind !== 'plan' && <p className={styles.help}>檢查敘述 <code>{o.probe.sql}</code>：預期{describe(o.probe.expected)}，你的資料庫{describe(o.probe.actual)}。</p>}
          {!o.verdict.ok && !o.hidden && o.actual && o.expected && <div className={styles.compare}>
            <SqlResultTable table={o.actual} caption="你的結果"/>
            <SqlResultTable table={o.expected} caption="預期結果"/>
          </div>}
        </li>)}</ol>
      </>}
    </div>
  </div>;
}

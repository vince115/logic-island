'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Play, RotateCcw, X } from 'lucide-react';
import { Highlighted } from '@/components/highlighted';
import type { HlLines } from '@/lib/highlight/kinds';
import { runInFrame } from '@/lib/webcode/frame';
import { checkWebExercise, describeAction, fileKinds, isWebCheck, mergeFiles, treeLines, webDocument, WEB_FILE_LABELS, WEB_FILE_NAMES, WEB_LIMITS, WEB_SANDBOX, WEB_VIEWPORT,
  type WebExample, type WebExercise, type WebFileKind, type WebFiles, type WebFilesPart, type WebReport, type WebRunner, type WebVerdict } from '@/lib/webcode/lesson';
import { shownText } from './pre-text';
import { Rich } from './rich';
import base from './curriculum.module.css';
import activities from './db-activities.module.css';
import styles from './webcode-lesson.module.css';

/*
 * WEB-0 web-code capability (src/lib/webcode/lesson.ts). An example is a page: its files as code, and the page itself
 * running in a sandboxed frame in this browser (scripts and forms allowed; no access to this site, no network), with
 * the DOM the browser built shown as an outline, the console's output, and where a link or a form would have gone.
 * The learner can edit an example's files and run it again. An exercise adds the files to complete and Check, which
 * loads the edited page into a fresh off-screen frame of a fixed size and runs the listed steps there, so a result does
 * not depend on the size of this screen or on what was clicked in the preview. Nothing is sent anywhere. Nothing here
 * animates, so there is nothing to reduce for prefers-reduced-motion (a page's own CSS sees the reader's setting).
 */

export type WebTokens = Partial<Record<WebFileKind, HlLines>>;

/** A file as code (highlighted on the server), named the way the lesson refers to it. */
function FileCode({ kind, text, tokens, note }: { kind: WebFileKind; text: string; tokens?: HlLines; note?: string }) {
  const lines = text.split('\n');
  return <figure className={styles.file}>
    <figcaption>{WEB_FILE_NAMES[kind]}{note ? `（${note}）` : ''}</figcaption>
    <pre className={styles.code}><code>{lines.map((line, i) => <span key={i}>{i > 0 && '\n'}<Highlighted text={line} pieces={tokens?.[i]}/></span>)}</code></pre>
  </figure>;
}

const noSubscription = () => () => {};
/** False while the server renders and during hydration, true in the browser afterwards. */
const useInBrowser = () => useSyncExternalStore(noSubscription, () => true, () => false);

/**
 * The page running in its frame, and what the frame reports about it. `files` changes only when the learner runs the
 * page (never per keystroke), and each run gets a new frame with its own nonce. The frame is made in the browser only:
 * its document carries the harness, which there is no reason to send with the lesson's HTML.
 */
function LivePage({ files, title, height, run }: { files: WebFiles; title: string; height?: number; run: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const inBrowser = useInBrowser();
  // A frame is believed by being the frame (event.source); the nonce only tells this run's document from the last one's.
  const nonce = `${useId().replace(/[^a-zA-Z0-9]/g, '')}r${run}`;
  const html = useMemo(() => webDocument(files, nonce, true), [files, nonce]);
  const [reported, setReported] = useState<{ nonce: string; report: WebReport }>();
  // A layout effect: the listener is in place before the browser starts loading the frame.
  useLayoutEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as (WebReport & { li?: string }) | null;
      if (event.source !== frame.current?.contentWindow || !data || data.li !== nonce) return;
      setReported({ nonce, report: { console: data.console, tree: data.tree, height: data.height, navigations: data.navigations, submissions: data.submissions, title: data.title, standards: data.standards } });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [nonce]);
  const report = reported?.nonce === nonce ? reported.report : undefined;
  const shownHeight = height ?? Math.min(WEB_LIMITS.maxHeight, Math.max(WEB_LIMITS.minHeight, (report?.height ?? 120) + 2));
  const link = report?.navigations.at(-1), sent = report?.submissions.at(-1);
  return <div className={styles.live}>
    <figure className={styles.preview}>
      <figcaption>瀏覽器裡的結果{report?.title ? <span className={styles.pageTitle}>分頁標題：{report.title}</span> : null}</figcaption>
      {inBrowser ? <iframe key={nonce} ref={frame} className={styles.frame} title={`${title}：頁面預覽`} sandbox={WEB_SANDBOX} srcDoc={html} style={{ height: shownHeight }}/>
        : <div className={styles.frame} style={{ height: shownHeight }} aria-hidden/>}
    </figure>
    <div aria-live="polite">
      {link && <p className={styles.note}>連結「{link.text || link.href}」會前往 <code>{link.href}</code>{link.target ? `（target="${link.target}"）` : ''}；預覽不會離開這一頁。</p>}
      {sent && <p className={styles.note}>表單送出了（{sent.method.toUpperCase()}{sent.action ? ` ${sent.action}` : ''}）：{sent.data.length ? sent.data.map(([k, v]) => `${k}=${v}`).join('、') : '沒有任何欄位資料'}；預覽不會真的送出。</p>}
    </div>
    {report && report.console.length > 0 && <figure className={styles.file}>
      <figcaption>主控台（console）</figcaption>
      <div className={styles.console} role="log" aria-label={`${title}：主控台輸出`}>
        {report.console.map((l, i) => <div key={i} data-kind={l.kind}>{l.kind === 'error' ? '✕ ' : l.kind === 'warn' ? '⚠ ' : ''}{shownText(l.text) || ' '}</div>)}
      </div>
    </figure>}
    <details className={styles.dom}>
      <summary>瀏覽器建立的 DOM 樹</summary>
      {report ? <pre className={styles.tree}>{shownText(treeLines(report.tree).join('\n'))}</pre> : <p className={styles.note}>頁面載入後會顯示。</p>}
      {report && !report.standards && <p className={styles.note}>這份文件沒有 <code>&lt;!DOCTYPE html&gt;</code>，瀏覽器以相容模式（quirks mode）顯示它。</p>}
    </details>
  </div>;
}

/** A labelled editor for one file. The Tab key keeps moving focus (no keyboard trap); indentation is typed with spaces. */
function Editor({ id, kind, label, value, onChange }: { id: string; kind: WebFileKind; label: string; value: string; onChange: (text: string) => void }) {
  return <div className={styles.editor}>
    <label htmlFor={id}>{WEB_FILE_NAMES[kind]}<span className={styles.kind}>{WEB_FILE_LABELS[kind]}</span></label>
    <textarea id={id} value={value} onChange={e => onChange(e.target.value)} rows={Math.min(22, Math.max(6, value.split('\n').length + 1))} maxLength={WEB_LIMITS.file}
      spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off" wrap="off" aria-label={label}/>
  </div>;
}

export function WebExampleView({ example, tokens }: { example: WebExample; tokens?: WebTokens }) {
  const id = useId();
  const kinds = fileKinds(example.files);
  const [edited, setEdited] = useState<WebFilesPart>(example.files);
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState<WebFiles>(example.files);
  const changed = kinds.some(k => edited[k] !== example.files[k]);
  const facts = example.observe.filter(isWebCheck);
  return <div className={base.example} data-web-example={example.id}>
    <h3>{example.title}</h3>
    <p className={base.muted}><Rich text={example.description}/></p>
    <div className={styles.split}>
      <div className={styles.files}>{kinds.map(k => <FileCode key={k} kind={k} text={example.files[k]!} tokens={tokens?.[k]}/>)}</div>
      <LivePage files={shown} title={example.title} height={example.height} run={run}/>
    </div>
    <details className={styles.facts}>
      <summary>這個頁面在瀏覽器裡的事實（{facts.length}）</summary>
      <ul>{facts.map((f, i) => <li key={i}><Rich text={f.label}/></li>)}</ul>
      <p className={styles.note}>以上每一項都由自動測試在真實的瀏覽器（Chromium）裡對原本的範例驗證過。</p>
    </details>
    <details className={styles.tryIt}>
      <summary>動手改這個範例</summary>
      {kinds.map(k => <Editor key={k} id={`${id}-${k}`} kind={k} label={`${example.title}：${WEB_FILE_LABELS[k]}`} value={edited[k] ?? ''} onChange={text => setEdited(f => ({ ...f, [k]: text }))}/>)}
      <div className={base.vizControls}>
        <button type="button" className={base.primaryButton} onClick={() => { setShown(mergeFiles(undefined, edited)); setRun(n => n + 1); }}><Play size={14} aria-hidden/>執行</button>
        <button type="button" disabled={!changed && shown === example.files} onClick={() => { setEdited(example.files); setShown(example.files); setRun(n => n + 1); }}><RotateCcw size={14} aria-hidden/>還原</button>
      </div>
      <p className={styles.note}>修改只存在這個頁面；按「執行」後，上方的預覽、主控台與 DOM 樹會換成你改過的版本。</p>
    </details>
  </div>;
}

export function WebExerciseBox({ exercise, tokens, run = runInFrame }: { exercise: WebExercise; tokens?: WebTokens; run?: WebRunner }) {
  const id = useId();
  const editable = fileKinds(exercise.starter), fixed = fileKinds(exercise.fixed ?? {});
  const [edited, setEdited] = useState<WebFilesPart>(exercise.starter);
  const [shown, setShown] = useState<WebFiles>(() => mergeFiles(exercise.fixed, exercise.starter));
  const [runs, setRuns] = useState(0);
  const [verdict, setVerdict] = useState<WebVerdict>();
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState('');
  const latest = useRef(edited);
  const viewport = exercise.viewport ?? WEB_VIEWPORT;

  function change(kind: WebFileKind, text: string) {
    latest.current = { ...latest.current, [kind]: text };
    setEdited(latest.current);
    setVerdict(undefined);
    setAnnounce('');
  }
  function preview() {
    setShown(mergeFiles(exercise.fixed, latest.current));
    setRuns(n => n + 1);
  }
  async function check() {
    if (busy) return;
    setBusy(true); setAnnounce(''); setVerdict(undefined);
    preview();
    const answer = latest.current;
    const result = await checkWebExercise(exercise, answer, run);
    // An edit made while the check ran makes its result stale.
    if (latest.current === answer) setVerdict(result);
    setBusy(false);
  }
  function reset() {
    latest.current = exercise.starter;
    setEdited(exercise.starter); setVerdict(undefined);
    setShown(mergeFiles(exercise.fixed, exercise.starter)); setRuns(n => n + 1);
    setAnnounce('已重設：檔案回到練習開始時的內容。');
  }

  let checkIndex = -1;
  return <div className={activities.builder} data-web-exercise={exercise.id}>
    {fixed.length > 0 && <div className={styles.files}>{fixed.map(k => <FileCode key={k} kind={k} text={exercise.fixed![k]!} tokens={tokens?.[k]} note="固定，不能修改"/>)}</div>}
    {editable.map(k => <Editor key={k} id={`${id}-${k}`} kind={k} label={`${exercise.title}：${WEB_FILE_LABELS[k]}`} value={edited[k] ?? ''} onChange={text => change(k, text)}/>)}
    <div className={base.vizControls}>
      <button type="button" onClick={preview}><Play size={14} aria-hidden/>執行</button>
      {/* aria-disabled, not disabled: a disabled button would drop the keyboard focus to the page while the check runs. */}
      <button type="button" className={base.primaryButton} onClick={check} aria-disabled={busy || undefined}><Check size={14} aria-hidden/>{busy ? '檢查中…' : '檢查'}</button>
      <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden/>重設</button>
    </div>
    <LivePage files={shown} title={exercise.title} run={runs}/>
    <div className={styles.steps}>
      <h4 id={`${id}-steps`}>檢查的步驟</h4>
      <p className={styles.note}>「檢查」會把你目前的檔案載入一份全新的頁面（寬 {viewport.width}px、高 {viewport.height}px），依序做下面的事，只看結果，不看寫法。</p>
      <ol aria-labelledby={`${id}-steps`}>{exercise.steps.map((step, i) => {
        if (!isWebCheck(step)) return <li key={i} data-step="action"><span>操作：<Rich text={describeAction(step)}/></span></li>;
        const result = verdict?.results[++checkIndex];
        return <li key={i} data-step="check" data-ok={result ? result.ok : undefined}>
          {result ? result.ok ? <Check size={14} aria-hidden/> : <X size={14} aria-hidden/> : null}
          <span>{result ? `${result.ok ? '通過' : '未通過'}：` : '檢查：'}<Rich text={step.label}/>{result && !result.ok && result.message ? <span className={styles.found}>　<Rich text={result.message}/></span> : null}</span>
        </li>;
      })}</ol>
      {(exercise.variants?.length ?? 0) > 0 && <ul className={styles.hidden}>{exercise.variants!.map((v, i) => {
        const result = verdict?.hidden[i];
        return <li key={v.title} data-ok={result ? result.ok : undefined}>
          {result ? result.ok ? <Check size={14} aria-hidden/> : <X size={14} aria-hidden/> : null}
          <span>{result ? `${result.ok ? '通過' : '未通過'}：` : ''}隱藏的檢查：換一份頁面資料（{v.title}）再做一次，只顯示通過與否。</span>
        </li>;
      })}</ul>}
    </div>
    <div aria-live="polite">
      {announce && <p className={styles.note}>{announce}</p>}
      {verdict && <p className={activities.verdict} data-ok={verdict.ok}>{verdict.ok ? <><Check size={16} aria-hidden/>全部通過。</>
        : <><X size={16} aria-hidden/>還沒通過：{verdict.results.filter(r => !r.ok).length + verdict.hidden.filter(h => !h.ok).length} 項未通過。</>}</p>}
      {verdict && verdict.console.some(l => l.kind === 'error') && <p className={styles.note}>檢查用的頁面在主控台有錯誤：<code>{verdict.console.find(l => l.kind === 'error')!.text}</code></p>}
    </div>
  </div>;
}

/** A reference solution's files, as code. */
export function WebSolution({ exercise, tokens }: { exercise: WebExercise; tokens?: WebTokens }) {
  return <div className={styles.files}>{fileKinds(exercise.solution).map(k => <FileCode key={k} kind={k} text={exercise.solution[k]!} tokens={tokens?.[k]}/>)}</div>;
}

'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Play, RotateCcw, X } from 'lucide-react';
import { Highlighted } from '@/components/highlighted';
import type { HlLines } from '@/lib/highlight/kinds';
import { runInFrame } from '@/lib/webcode/frame';
import { checkWebExercise, describeAction, fileKinds, isWebCheck, mergeFiles, treeLines, webDocument, WEB_FILE_LABELS, WEB_FILE_NAMES, WEB_LIMITS, WEB_SANDBOX, WEB_VIEWPORT,
  type WebExample, type WebExercise, type WebFileKind, type WebFiles, type WebFilesPart, type WebReport, type WebRunner, type WebSetup, type WebStored, type WebVerdict } from '@/lib/webcode/lesson';
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
function LivePage({ files, title, height, run, setup, widths }: { files: WebFiles; title: string; height?: number; run: number; setup?: WebSetup; widths?: number[] }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const inBrowser = useInBrowser();
  // A frame is believed by being the frame (event.source); the nonce only tells this run's document from the last one's.
  const [reported, setReported] = useState<{ nonce: string; report: WebReport }>();
  // W4: what the page stored is still there when it is run again, as it would be after a reload; the lesson's setup is
  // the first visit's state. `cleared` counts the times the learner emptied it (each is a fresh frame too).
  const [carried, setCarried] = useState<{ run: number; cleared: number; stored?: WebStored }>({ run, cleared: 0 });
  if (carried.run !== run) setCarried({ run, cleared: carried.cleared, stored: reported?.report.storage ?? carried.stored });
  const nonce = `${useId().replace(/[^a-zA-Z0-9]/g, '')}r${run}c${carried.cleared}`;
  const html = useMemo(() => webDocument(files, nonce, true, { ...setup, ...(carried.stored ? { storage: carried.stored.local, cookies: carried.stored.cookies } : {}) }),
    [files, nonce, setup, carried.stored]);
  // A layout effect: the listener is in place before the browser starts loading the frame.
  useLayoutEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as (WebReport & { li?: string }) | null;
      if (event.source !== frame.current?.contentWindow || !data || data.li !== nonce) return;
      setReported({ nonce, report: { console: data.console, tree: data.tree, height: data.height, navigations: data.navigations, submissions: data.submissions, title: data.title, standards: data.standards,
        requests: data.requests ?? [], storage: data.storage ?? { local: {}, session: {}, cookies: {} } } });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [nonce]);
  const report = reported?.nonce === nonce ? reported.report : undefined;
  // RWD-0: a preview at a chosen viewport width. The frame is that wide and drawn smaller when its column is narrower,
  // so the page inside really is laid out at the chosen width (its media queries see it).
  const [width, setWidth] = useState<number | undefined>(widths?.[0]);
  const room = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useLayoutEffect(() => {
    const el = room.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = width && available ? Math.min(1, available / width) : 1;
  const shownHeight = height ?? Math.min(WEB_LIMITS.maxHeight, Math.max(WEB_LIMITS.minHeight, (report?.height ?? 120) + 2));
  const link = report?.navigations.at(-1), sent = report?.submissions.at(-1);
  const stored: [string, string, string][] = report ? [...Object.entries(report.storage.local).map(([k, v]): [string, string, string] => ['localStorage', k, v]),
    ...Object.entries(report.storage.session).map(([k, v]): [string, string, string] => ['sessionStorage', k, v]), ...Object.entries(report.storage.cookies).map(([k, v]): [string, string, string] => ['Cookie', k, v])] : [];
  return <div className={styles.live}>
    <figure className={styles.preview}>
      <figcaption>瀏覽器裡的結果{report?.title ? <span className={styles.pageTitle}>分頁標題：{report.title}</span> : null}</figcaption>
      {widths && <div className={styles.widths} role="group" aria-label={`${title}：預覽寬度`}>
        {widths.map(w => <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}>{w}px</button>)}
        <button type="button" aria-pressed={width === undefined} onClick={() => setWidth(undefined)}>填滿欄位</button>
        {width !== undefined && <span className={styles.note}>頁面寬 {width}px{scale < 1 ? `，縮小成 ${Math.round(scale * 100)}% 顯示` : ''}</span>}
      </div>}
      <div ref={room} className={styles.room} style={width ? { height: shownHeight * scale } : undefined}>
        {inBrowser ? <iframe key={nonce} ref={frame} className={styles.frame} title={`${title}：頁面預覽`} sandbox={WEB_SANDBOX} srcDoc={html}
          style={width ? { height: shownHeight, width, transform: `scale(${scale})`, transformOrigin: '0 0' } : { height: shownHeight }}/>
          : <div className={styles.frame} style={{ height: shownHeight }} aria-hidden/>}
      </div>
    </figure>
    <div aria-live="polite">
      {link && <p className={styles.note}>連結「{link.text || link.href}」會前往 <code>{link.href}</code>{link.target ? `（target="${link.target}"）` : ''}；預覽不會離開這一頁。</p>}
      {sent && <p className={styles.note}>表單送出了（{sent.method.toUpperCase()}{sent.action ? ` ${sent.action}` : ''}）：{sent.data.length ? sent.data.map(([k, v]) => `${k}=${v}`).join('、') : '沒有任何欄位資料'}；預覽不會真的送出。</p>}
    </div>
    {report && report.requests.length > 0 && <figure className={styles.file}>
      <figcaption>網路請求（由課程模擬的伺服器回應，沒有真的連線）</figcaption>
      <ol className={styles.requests} aria-label={`${title}：網路請求`}>
        {report.requests.map((r, i) => <li key={i} data-status={r.status}><code>{r.method} {r.path}</code> → {r.status === 0 ? '等待回應…' : r.status < 0 ? '連線失敗' : r.status}</li>)}
      </ol>
    </figure>}
    {stored.length > 0 && <figure className={styles.file}>
      <figcaption>儲存的資料（只在這個預覽裡，重新執行後仍然保留）</figcaption>
      <ul className={styles.requests} aria-label={`${title}：儲存的資料`}>
        {stored.map(([area, key, value]) => <li key={`${area} ${key}`}><code>{area}</code> <code>{key}</code> = <code>{shownText(value)}</code></li>)}
      </ul>
      <div className={base.vizControls}>
        <button type="button" onClick={() => setCarried(c => ({ run: c.run, cleared: c.cleared + 1, stored: { local: {}, session: {}, cookies: {} } }))}>清除儲存的資料並重新載入</button>
      </div>
    </figure>}
    {report && report.console.length > 0 && <figure className={styles.file}>
      <figcaption>主控台（console）</figcaption>
      <div className={styles.console} role="log" aria-label={`${title}：主控台輸出`}>
        {report.console.map((l, i) => <div key={i} data-kind={l.kind}>{l.kind === 'error' ? '✕ ' : l.kind === 'warn' ? '⚠ ' : ''}{shownText(l.text) || ' '}</div>)}
      </div>
    </figure>}
    <details className={styles.dom}>
      <summary>瀏覽器建立的 DOM 樹</summary>
      {report ? <pre className={styles.tree}>{shownText(treeLines(report.tree).join('\n'))}</pre> : <p className={styles.note}>頁面載入後會顯示。</p>}
      {/* A srcdoc frame is always in standards mode, so the note is about the file opened on its own. */}
      {report && !report.standards && <p className={styles.note}>這份文件沒有 <code>&lt;!DOCTYPE html&gt;</code>：直接用瀏覽器開啟這樣的檔案時，會以相容模式（quirks mode）顯示；這裡的預覽一律是標準模式。</p>}
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
      <LivePage files={shown} title={example.title} height={example.height} run={run} setup={example.setup} widths={example.widths}/>
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
    <LivePage files={shown} title={exercise.title} run={runs} setup={exercise.setup} widths={exercise.widths}/>
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

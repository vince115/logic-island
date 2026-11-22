import { HARNESS_LIVE, HARNESS_NONCE, HARNESS_SCRIPT_AT, HARNESS_SCRIPT_LINES, HARNESS_SETUP, HARNESS_SOURCE } from './harness';
import { guardInlineScripts, guardLoops } from './loop-guard';

/*
 * WEB-0 (2026-11-22): the web-code lesson capability (docs/curriculum/WEB0_WEB_CODE_CAPABILITY.md). A lesson's examples
 * and exercises are small web pages: HTML, with optional CSS and JavaScript, shown in a sandboxed frame in the learner's
 * own browser. A page is checked by steps: actions (click, type, submit…) and checks that read the page the browser
 * built (DOM queries, computed styles, box sizes, console output, recorded form submissions and link targets). The same
 * steps run in the frame for the learner and in a real Chromium for the tests (tests/curriculum-webcode.test.ts), so a
 * reference solution is known to pass and a typical mistake to fail. Nothing here touches the DOM: this module builds
 * the frame's document and judges the raw results the frame's harness (./harness.ts) posts back.
 */

export const WEB_FILE_KINDS = ['html', 'css', 'js'] as const;
export type WebFileKind = typeof WEB_FILE_KINDS[number];
export const WEB_FILE_LABELS: Record<WebFileKind, string> = { html: 'HTML', css: 'CSS', js: 'JavaScript' };
/** The name each file goes by in a lesson (`<link href="style.css">`, `<script src="script.js">`). */
export const WEB_FILE_NAMES: Record<WebFileKind, string> = { html: 'index.html', css: 'style.css', js: 'script.js' };
/** A page: its HTML (a whole document or a body fragment), and optionally one style sheet and one script. */
export interface WebFiles { html: string; css?: string; js?: string }
export type WebFilesPart = Partial<WebFiles>;

/**
 * W3: one fixed answer of the page's pretend server. The frame has no network; `fetch` in the page is answered from the
 * routes after `delay` ms on the page's clock (100 by default). A path without a query matches any query; an address
 * with no route answers 404; `fail` is a network error (fetch rejects). A string body is text, anything else JSON.
 */
export interface WebRoute { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; status?: number; body?: unknown; delay?: number; fail?: boolean; headers?: Record<string, string> }
/** What exists around a page before it loads: its server's routes (W3), and what an earlier visit left in localStorage and the cookies (W4). */
export interface WebSetup { api?: WebRoute[]; storage?: Record<string, string>; cookies?: Record<string, string> }

/** What happens to the page before the next check. A script-made event: see the harness for what it does and does not emulate. */
export type WebAction =
  | { do: 'click'; selector: string }
  /** Sets a field's value and fires input and change. */
  | { do: 'input'; selector: string; value: string }
  | { do: 'select'; selector: string; value: string }
  /** Sets a checkbox or radio button by clicking it when it differs. */
  | { do: 'check'; selector: string; checked: boolean }
  /** keydown and keyup on the element; Enter and Space activate a button, Enter in a field submits its form. */
  | { do: 'key'; selector: string; key: string }
  /** Submits a form the way its submit button does (validation first, then the submit event). */
  | { do: 'submit'; selector: string }
  /** Scrolls the page (`selector: ':page'`) or a scrolling element to a vertical offset in pixels. */
  | { do: 'scroll'; selector: string; top: number }
  /** Changes the check page's viewport (RWD-0): the same page is then laid out at another width (and height), so one answer is checked at several sizes. */
  | { do: 'resize'; width: number; height?: number }
  /** Presses Tab (W5): focus moves to the next element in tab order (Shift+Tab: the previous one), unless the page cancels the key. */
  | { do: 'tab'; shift?: boolean }
  /** Fires an event of this type on the element (mouseover, dblclick, a custom event…); it bubbles unless the type never does. */
  | { do: 'dispatch'; selector: string; event: string }
  /** Lets the page's timers run for this long. In a check the clock is virtual: no real waiting, and timers fire in order. */
  | { do: 'wait'; ms: number };

/** One thing checked on the page; `label` says it in the learner's words and is always shown. */
export type WebCheck = { label: string } & (
  /** How many elements match (op: eq by default, min = at least, max = at most). */
  | { check: 'count'; selector: string; count: number; op?: 'eq' | 'min' | 'max' }
  /** The first match's text, whitespace collapsed. */
  | { check: 'text'; selector: string; text: string; match?: 'equals' | 'includes' }
  /** The first match's attribute: present (no value), equal, containing, or absent. */
  | { check: 'attr'; selector: string; name: string; value?: string; match?: 'equals' | 'includes' | 'absent' }
  /** The first match's computed style; the value may be written any way the browser resolves to the same thing (red, #f00). */
  | { check: 'style'; selector: string; property: string; value: string | string[]; pseudo?: '::before' | '::after' }
  /** A box measurement in CSS pixels at the exercise's viewport, from the page's top-left corner, from the viewport's (`from: ':viewport'`, after a scroll) or from another element's. */
  | { check: 'box'; selector: string; measure: 'width' | 'height' | 'left' | 'top' | 'right' | 'bottom'; value: number; tolerance?: number; from?: string }
  /** What is drawn on top at the centre of `selector`: the element `top` (or something inside it). For stacking order and overlap. */
  | { check: 'hit'; selector: string; top: string }
  /** A form control's value, or whether it is checked. */
  | { check: 'value'; selector: string; value: string | boolean }
  /** A form control's label as assistive technology reads it: aria-labelledby, then aria-label, then its `<label>` (for=, or wrapped around it). */
  | { check: 'label'; selector: string; text: string; match?: 'equals' | 'includes' }
  /** The element's accessible name (W5, a simplified reading of the rules): aria-labelledby, aria-label, then what the element provides itself (alt, label, legend, caption, its text), then title. */
  | { check: 'name'; selector: string; text: string; match?: 'equals' | 'includes' }
  /** The element's role (W5): its `role` attribute, or the one its tag implies (button, link, heading, navigation, textbox, checkbox…; `generic` for none). */
  | { check: 'role'; selector: string; role: string }
  /** The page's headings form an outline: one h1, first, and no heading more than one level deeper than the one before it. */
  | { check: 'headings' }
  /** The element that has focus matches. */
  | { check: 'focus'; selector: string }
  /** Everything logged so far (equals), or these lines in this order among it (includes). */
  | { check: 'console'; lines: string[]; match?: 'equals' | 'includes' }
  /** Form submissions so far: how many, and/or the data of the last one. Without either: at least one. */
  | { check: 'submitted'; count?: number; data?: Record<string, string> }
  /** Requests the page made with fetch (W3): at least one to this method (GET by default) and path, or exactly `count`; `body` is the JSON the last one sent. */
  | { check: 'request'; path: string; method?: WebRoute['method']; count?: number; body?: unknown }
  /** A localStorage (or sessionStorage) item (W4): present, equal to `value`, or absent. */
  | { check: 'storage'; key: string; value?: string; area?: 'local' | 'session'; match?: 'absent' }
  /** A cookie the page can read (W4): present, equal to `value`, or absent. */
  | { check: 'cookie'; name: string; value?: string; match?: 'absent' }
  /** The last link followed (recorded, never navigated to). */
  | { check: 'navigated'; href: string }
  /** The page has <!DOCTYPE html>. (A srcdoc frame renders in standards mode with or without it, so the doctype itself is what is checked.) */
  | { check: 'doctype' }
);
export type WebStep = WebAction | WebCheck;
export const isWebCheck = (step: WebStep): step is WebCheck => 'check' in step;

export interface WebViewport { width: number; height: number }
/** The size a page is checked at, whatever the size of the preview on the learner's screen. */
export const WEB_VIEWPORT: WebViewport = { width: 600, height: 400 };

/** A page shown in a section. `observe` states what is true of it in a browser; the tests hold the example to it. */
export interface WebExample {
  id: string; title: string; description: string;
  files: WebFiles;
  /** Checks (and the actions leading to them) that all pass on this page: the example's claims, verified in Chromium. */
  observe: WebStep[];
  /** The preview's height in CSS pixels; by default it follows the page (within limits). */
  height?: number;
  /** The page logs errors on purpose (an example about an error). Otherwise an uncaught error fails the example. */
  expectErrors?: boolean;
  viewport?: WebViewport;
  setup?: WebSetup;
  /** RWD-0: widths (CSS px) the learner can switch the preview to; the first is shown at the start. Without it the preview fills its column. */
  widths?: number[];
}

/**
 * A page the learner completes. `starter` holds the files they edit (as first shown) and `fixed` the files they cannot
 * change; `solution` and each mistake replace the starter's files. The steps run on a fresh copy of the page.
 */
export interface WebExercise {
  id: string; title: string; statement: string; hints: string[]; explanation: string;
  fixed?: WebFilesPart;
  starter: WebFilesPart;
  solution: WebFilesPart;
  steps: WebStep[];
  /** Typical wrong answers; each must fail a check (tested), and `why` explains it. */
  mistakes: { files: WebFilesPart; why: string }[];
  /** The answer is also run with other fixed files (different data in the page), so it cannot be typed in by hand. Only pass or fail is shown. */
  variants?: { title: string; fixed?: WebFilesPart; steps: WebStep[]; setup?: WebSetup }[];
  viewport?: WebViewport;
  /** The page's server routes and stored data; a variant may bring its own (other data from the server, a returning visitor). */
  setup?: WebSetup;
  /** RWD-0: widths (CSS px) the learner can switch the preview to; the first is shown at the start. */
  widths?: number[];
}

export interface WebLessonContent { examples: WebExample[]; exercises: WebExercise[] }

export const WEB_LIMITS = { file: 20_000, steps: 60, waitStep: 10_000, waitTotal: 60_000, timeoutMs: 6000, minHeight: 80, maxHeight: 640 } as const;

// ---- the frame's document ---------------------------------------------------------------------------------------
/** What the sandboxed frame may do: run scripts and submit forms (to be recorded); no same-origin access, no popups, no top navigation. */
export const WEB_SANDBOX = 'allow-scripts allow-forms';
/** No network at all from the page: only inline styles and scripts and data: images, media and fonts. */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; form-action 'none'; base-uri 'none'";

const isDocument = (html: string) => /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html);
const LINK = /<link\b[^>]*\bhref\s*=\s*(["'])(?:\.\/)?style\.css\1[^>]*>/i;
const SCRIPT = /<script\b[^>]*\bsrc\s*=\s*(["'])(?:\.\/)?script\.js\1[^>]*>\s*<\/script\s*>/i;

/**
 * The document a page becomes in the frame. The harness goes first (after the doctype, at the start of the head) and
 * removes itself, so the tree is the page's own. The style sheet takes the place of `<link rel="stylesheet"
 * href="style.css">` and the script of `<script src="script.js"></script>` where the HTML has them; otherwise the style
 * sheet is added at the start of the head and the script at the end of the body. An HTML fragment (no doctype, html,
 * head or body tag) is wrapped in a document with a doctype; a whole document is kept as written, doctype or not (the
 * frame cannot show quirks mode: the HTML standard puts every srcdoc document in standards mode).
 * The frame starts each line of the script file one line down (the opening tag's line), which only shifts line numbers.
 */
export function webDocument(files: WebFiles, nonce: string, live = false, setup: WebSetup = {}): string {
  const harness = HARNESS_SOURCE.replace(HARNESS_NONCE, nonce.replace(/[^\w-]/g, '')).replace(HARNESS_LIVE, live ? 'true' : 'false');
  const style = files.css === undefined ? '' : `<style data-file="style.css">\n${files.css.replace(/<\/style/gi, '<\\/style')}\n</style>`;
  // Loops are guarded (./loop-guard.ts) in the script file and in the page's inline scripts, so an endless one stops with an error.
  const guarded = files.js === undefined ? '' : guardLoops(files.js).replace(/<\/script/gi, '<\\/script');
  const scriptTag = (asModule: boolean) => files.js === undefined ? '' : `<script${asModule ? ' type="module"' : ''} data-file="script.js">\n${guarded}\n</script>`;
  let html = guardInlineScripts(files.html), styled = false, scripted = false;
  // A replacement function, so `$&` and the like in the learner's code are not read as patterns.
  if (style && LINK.test(html)) { html = html.replace(LINK, () => style); styled = true; }
  let last = scriptTag(false);
  const linked = files.js === undefined ? null : SCRIPT.exec(html);
  if (linked) {
    // W1: where the page loads script.js decides when it runs. A plain <script src> runs where it stands (the elements
    // after it do not exist yet); type="module" is deferred by the browser itself; `defer` is emulated by running the
    // script at the end of the body, after the whole document has been parsed.
    const attrs = /<script\b([^>]*)>/i.exec(linked[0])![1];
    const asModule = /\btype\s*=\s*(["']?)module\1/i.test(attrs), deferred = !asModule && /\bdefer\b/i.test(attrs);
    html = html.replace(SCRIPT, () => deferred ? '' : scriptTag(asModule));
    scripted = !deferred;
  }
  if (scripted) last = '';
  const first = `<meta data-li-harness http-equiv="Content-Security-Policy" content="${CSP}"><script data-li-harness>${harness}</script>${styled ? '' : style}`;
  let doc: string;
  if (!isDocument(html)) doc = `<!DOCTYPE html>\n<html lang="zh-Hant">\n<head>${first}</head>\n<body>\n${html}\n${last}</body>\n</html>`;
  else {
    const head = /<head\b[^>]*>/i.exec(html), root = /<html\b[^>]*>/i.exec(html), doctype = /<!doctype[^>]*>/i.exec(html);
    if (head) html = `${html.slice(0, head.index + head[0].length)}${first}${html.slice(head.index + head[0].length)}`;
    else if (root) html = `${html.slice(0, root.index + root[0].length)}<head>${first}</head>${html.slice(root.index + root[0].length)}`;
    else if (doctype) html = `${html.slice(0, doctype.index + doctype[0].length)}<head>${first}</head>${html.slice(doctype.index + doctype[0].length)}`;
    else html = `<head>${first}</head>${html}`;
    const end = html.toLowerCase().lastIndexOf('</body');
    doc = !last ? html : end < 0 ? `${html}\n${last}` : `${html.slice(0, end)}${last}\n${html.slice(end)}`;
  }
  // The harness reports an uncaught error with its line in script.js: where the file's first line is in the document.
  const at = doc.search(/<script(?: type="module")? data-file="script\.js">\n/);
  const scriptAt = at < 0 ? 0 : doc.slice(0, at).split('\n').length + 1;
  // The setup travels as JSON inside the harness script: `<` is escaped so no value can close the script element.
  const json = JSON.stringify(setup).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  return doc.replace(HARNESS_SCRIPT_AT, String(scriptAt)).replace(HARNESS_SCRIPT_LINES, String(guarded.split('\n').length)).replace(HARNESS_SETUP, () => json);
}

/** The page an exercise shows: its fixed files with the edited ones on top. */
export function mergeFiles(fixed: WebFilesPart | undefined, edited: WebFilesPart): WebFiles {
  const merged = { ...fixed, ...edited };
  return { html: merged.html ?? '', ...(merged.css !== undefined ? { css: merged.css } : {}), ...(merged.js !== undefined ? { js: merged.js } : {}) };
}
/** The files of a page that exist, in display order. */
export const fileKinds = (files: WebFilesPart): WebFileKind[] => WEB_FILE_KINDS.filter(k => files[k] !== undefined);

// ---- what the frame reports ------------------------------------------------------------------------------------
export interface WebRawResult { ok: boolean; actual?: string; missing?: boolean; absent?: boolean; from?: boolean; sent?: boolean; error?: string; detail?: string }
export interface WebConsoleLine { kind: 'log' | 'warn' | 'error'; text: string }
/** One element of the page's outline: depth, tag, id, classes, other attributes and its own text. */
export interface WebTreeRow { d: number; t: string; i: string; c: string[]; a: [string, string][]; x: string }
export interface WebNavigation { href: string; target: string; text: string }
export interface WebSubmission { form: string; handled: boolean; method: string; action: string; data: [string, string][] }
export interface WebRequest { method: string; path: string; body: string; status: number }
export interface WebStored { local: Record<string, string>; session: Record<string, string>; cookies: Record<string, string> }
export interface WebReport {
  console: WebConsoleLine[]; tree: WebTreeRow[]; height: number; navigations: WebNavigation[]; submissions: WebSubmission[]; title: string; standards: boolean;
  /** W3: the requests the page made, with the status each was answered with (0 while waiting, -1 for a network error). W4: what the page has stored. */
  requests: WebRequest[]; storage: WebStored;
}
/** A page loaded and its steps run: one raw result per step (actions included), and the page's final report. */
export interface WebRun extends WebReport { results: WebRawResult[] }
/** Loads a page at a viewport, runs the steps and resolves with what the frame reports (rejects on a timeout). */
export type WebRunner = (page: { files: WebFiles; steps: WebStep[]; viewport: WebViewport; setup?: WebSetup }) => Promise<WebRun>;

/** The page's outline as indented text: `tag#id.class [attr="value"]  "text"`. */
export function treeLines(tree: WebTreeRow[]): string[] {
  return tree.map(r => {
    const name = `${r.t}${r.i ? `#${r.i}` : ''}${r.c.map(c => `.${c}`).join('')}`;
    const attrs = r.a.map(([k, v]) => v === '' ? k : `${k}="${v}"`).join(' ');
    return `${'  '.repeat(r.d)}${name}${attrs ? ` [${attrs}]` : ''}${r.x ? `  "${r.x}"` : ''}`;
  });
}

// ---- judging ----------------------------------------------------------------------------------------------------
export interface WebCheckResult { label: string; ok: boolean; message: string }
export interface WebVerdict {
  ok: boolean;
  /** The shown checks, in order. */
  results: WebCheckResult[];
  /** Each variant: only whether every check passed. */
  hidden: { title: string; ok: boolean }[];
  /** Console lines of the shown run (errors help the learner). */
  console: WebConsoleLine[];
}

const quote = (s: string) => `「${s}」`;
const actionText = (a: WebAction) => a.do === 'click' ? `點擊 \`${a.selector}\`` : a.do === 'input' ? `在 \`${a.selector}\` 輸入${quote(a.value)}`
  : a.do === 'select' ? `在 \`${a.selector}\` 選擇${quote(a.value)}` : a.do === 'check' ? `${a.checked ? '勾選' : '取消勾選'} \`${a.selector}\``
  : a.do === 'scroll' ? `把${a.selector === ':page' ? '頁面' : ` \`${a.selector}\` `}往下捲到 ${a.top}px`
  : a.do === 'resize' ? `把頁面的寬度改成 ${a.width}px${a.height ? `、高度 ${a.height}px` : ''}`
  : a.do === 'tab' ? `按下 ${a.shift ? 'Shift+Tab' : 'Tab'}`
  : a.do === 'dispatch' ? `在 \`${a.selector}\` 觸發 ${a.event} 事件`
  : a.do === 'key' ? `在 \`${a.selector}\` 按下 ${a.key === ' ' ? 'Space' : a.key}` : a.do === 'submit' ? `送出 \`${a.selector}\`` : `等待 ${a.ms} 毫秒`;
/** What a list of steps does before its checks, for the exercise's "how it is checked" note. */
export const describeAction = actionText;

/** Why a check failed, from the raw result, in words (never the expected answer itself beyond what the label says). */
function failure(step: WebCheck, raw: WebRawResult): string {
  if (raw.error === 'selector') return `選擇器 \`${'selector' in step ? step.selector : ''}\` 無法使用。`;
  if (raw.error) return '這個檢查無法執行。';
  if (raw.missing) return `頁面上找不到 \`${raw.from && step.check === 'box' ? step.from : raw.from && step.check === 'hit' ? step.top : 'selector' in step ? step.selector : ''}\`。`;
  switch (step.check) {
    case 'count': return `目前有 ${raw.actual} 個 \`${step.selector}\`。`;
    case 'text': return `\`${step.selector}\` 目前的文字是${quote(raw.actual ?? '')}。`;
    case 'attr': return step.match === 'absent' ? `\`${step.selector}\` 仍然有 ${step.name} 屬性。` : raw.absent ? `\`${step.selector}\` 沒有 ${step.name} 屬性。` : `\`${step.selector}\` 的 ${step.name} 目前是${quote(raw.actual ?? '')}。`;
    case 'style': return `\`${step.selector}\`${step.pseudo ?? ''} 的 ${step.property} 計算後是 ${raw.actual || '（空白）'}。`;
    case 'hit': return raw.actual ? `\`${step.selector}\` 的中心點上，畫在最上面的是 ${raw.actual}。` : `\`${step.selector}\` 的中心點不在畫面內。`;
    case 'box': return `\`${step.selector}\` 的${BOX[step.measure]}目前是 ${raw.actual}px。`;
    case 'value': return typeof step.value === 'boolean' ? `\`${step.selector}\` 目前${raw.actual === 'true' ? '已勾選' : '沒有勾選'}。` : `\`${step.selector}\` 目前的值是${quote(raw.actual ?? '')}。`;
    case 'name': return raw.actual ? `\`${step.selector}\` 目前的無障礙名稱是${quote(raw.actual)}。` : `\`${step.selector}\` 沒有無障礙名稱（螢幕閱讀器唸不出它是什麼）。`;
    case 'role': return `\`${step.selector}\` 目前的角色是 ${raw.actual}。`;
    case 'label': return raw.actual ? `\`${step.selector}\` 目前的標籤文字是${quote(raw.actual)}。` : `\`${step.selector}\` 沒有標籤（沒有對應的 label，也沒有 aria-label）。`;
    case 'headings': return raw.actual ? `頁面的標題依序是 ${raw.actual.split(' ').join('、')}。` : '頁面沒有任何標題。';
    case 'focus': return raw.actual ? `目前的焦點在 ${raw.actual}。` : '目前沒有元素取得焦點。';
    case 'console': return raw.actual ? `主控台目前的輸出：${raw.actual.split('\n').map(quote).join('、')}。` : '主控台目前沒有任何輸出。';
    case 'submitted': return step.data && raw.actual !== '0' && raw.actual?.startsWith('{') ? `最後一次送出的資料是 ${raw.actual}。` : `表單目前送出了 ${raw.actual ?? 0} 次。`;
    case 'request': return raw.sent ? `最後一次 ${step.method ?? 'GET'} ${step.path} 送出的內容是 ${raw.actual || '（空白）'}。` : raw.actual ? `頁面目前送出的請求：${raw.actual}。` : '頁面還沒有送出任何請求。';
    case 'storage': return step.match === 'absent' ? `${step.area === 'session' ? 'sessionStorage' : 'localStorage'} 仍然有 ${step.key}，值是${quote(raw.actual ?? '')}。` : raw.absent ? `${step.area === 'session' ? 'sessionStorage' : 'localStorage'} 裡沒有 ${step.key}。` : `${step.area === 'session' ? 'sessionStorage' : 'localStorage'} 的 ${step.key} 目前是${quote(raw.actual ?? '')}。`;
    case 'cookie': return step.match === 'absent' ? `Cookie ${step.name} 還在，值是${quote(raw.actual ?? '')}。` : raw.absent ? `沒有名為 ${step.name} 的 Cookie。` : `Cookie ${step.name} 目前是${quote(raw.actual ?? '')}。`;
    case 'navigated': return raw.actual ? `最後點擊的連結前往${quote(raw.actual)}。` : '還沒有點擊任何連結。';
    case 'doctype': return raw.actual ? '頁面沒有以標準模式顯示。' : '頁面沒有 <!DOCTYPE html>。';
  }
}
const BOX: Record<Extract<WebCheck, { check: 'box' }>['measure'], string> = { width: '寬度', height: '高度', left: '左邊位置', top: '上邊位置', right: '右邊位置', bottom: '下邊位置' };

/** The shown results of a run: one per check; an action that found no element fails the checks after it with a note. */
export function judge(steps: WebStep[], raw: WebRawResult[]): WebCheckResult[] {
  const results: WebCheckResult[] = [];
  let blocked = '', unsized = '';
  steps.forEach((step, i) => {
    const r = raw[i] ?? { ok: false, error: 'missing' };
    if (!isWebCheck(step)) {
      // RWD-0: a check after a resize that did not happen would measure the page at another width, so it is not believed
      // (until a later resize succeeds).
      if (step.do === 'resize') unsized = r.ok ? '' : `無法${actionText(step)}：這個操作無法執行。`;
      else if (!r.ok && !blocked) blocked = `無法${actionText(step)}：${r.missing ? '頁面上找不到這個元素' : '這個操作無法執行'}。`;
      return;
    }
    const ok = r.ok && !unsized;
    results.push({ label: step.label, ok, message: ok ? '' : unsized || blocked || failure(step, r) });
  });
  return results;
}

/**
 * Checks an exercise's page as edited: the steps on the page itself, then on each variant. A run that times out (an
 * endless loop, a page that never loads) fails every check with that reason.
 */
export async function checkWebExercise(exercise: WebExercise, edited: WebFilesPart, run: WebRunner): Promise<WebVerdict> {
  const viewport = exercise.viewport ?? WEB_VIEWPORT;
  let results: WebCheckResult[], lines: WebConsoleLine[] = [];
  try {
    const shown = await run({ files: mergeFiles(exercise.fixed, edited), steps: exercise.steps, viewport, setup: exercise.setup });
    results = judge(exercise.steps, shown.results);
    lines = shown.console;
  } catch {
    results = exercise.steps.filter(isWebCheck).map(s => ({ label: s.label, ok: false, message: TIMEOUT_MESSAGE }));
  }
  const hidden: WebVerdict['hidden'] = [];
  for (const variant of exercise.variants ?? []) {
    try {
      const r = await run({ files: mergeFiles({ ...exercise.fixed, ...variant.fixed }, edited), steps: variant.steps, viewport, setup: variant.setup ?? exercise.setup });
      hidden.push({ title: variant.title, ok: judge(variant.steps, r.results).every(c => c.ok) });
    } catch { hidden.push({ title: variant.title, ok: false }); }
  }
  return { ok: results.every(r => r.ok) && hidden.every(h => h.ok), results, hidden, console: lines };
}
export const TIMEOUT_MESSAGE = '頁面沒有在時間內完成載入與檢查（可能有不會結束的迴圈）。';

// ---- validation -------------------------------------------------------------------------------------------------
const ACTIONS = ['click', 'input', 'select', 'check', 'key', 'submit', 'scroll', 'dispatch', 'tab', 'resize', 'wait'];
const CHECKS = ['name', 'role', 'request', 'storage', 'cookie', 'count', 'text', 'attr', 'style', 'box', 'hit', 'value', 'label', 'headings', 'focus', 'console', 'submitted', 'navigated', 'doctype'];

function stepProblems(steps: WebStep[], where: string): string[] {
  const problems: string[] = [];
  if (!Array.isArray(steps) || !steps.some(isWebCheck)) problems.push(`${where} needs at least one check`);
  if (steps.length > WEB_LIMITS.steps) problems.push(`${where} has more than ${WEB_LIMITS.steps} steps`);
  let waited = 0;
  steps.forEach((s, i) => {
    const at = `${where}: step ${i + 1}`;
    if (isWebCheck(s)) {
      if (!CHECKS.includes(s.check)) problems.push(`${at} is an unknown check ${s.check}`);
      if (!s.label?.trim()) problems.push(`${at} needs a label`);
      if ('selector' in s && !s.selector.trim()) problems.push(`${at} needs a selector`);
      if (s.check === 'count' && (!Number.isInteger(s.count) || s.count < 0)) problems.push(`${at} needs a count of 0 or more`);
      if (s.check === 'box' && !Number.isFinite(s.value)) problems.push(`${at} needs a number`);
      if (s.check === 'hit' && !s.top?.trim()) problems.push(`${at} needs the element expected on top`);
      if (s.check === 'style' && (!s.property.trim() || ![s.value].flat().every(v => v.trim()))) problems.push(`${at} needs a property and a value`);
      if (s.check === 'console' && !Array.isArray(s.lines)) problems.push(`${at} needs its lines`);
      if (s.check === 'attr' && !s.name.trim()) problems.push(`${at} needs an attribute name`);
      if (s.check === 'role' && !s.role?.trim()) problems.push(`${at} needs a role`);
      if (s.check === 'request' && !s.path?.startsWith('/')) problems.push(`${at} needs a path starting with /`);
      if (s.check === 'storage' && !s.key?.trim()) problems.push(`${at} needs a key`);
      if (s.check === 'cookie' && !s.name?.trim()) problems.push(`${at} needs a cookie name`);
    } else {
      if (!ACTIONS.includes(s.do)) problems.push(`${at} is an unknown action ${(s as { do: string }).do}`);
      if (s.do === 'wait') { waited += s.ms; if (!(s.ms > 0 && s.ms <= WEB_LIMITS.waitStep)) problems.push(`${at} waits 1–${WEB_LIMITS.waitStep} ms`); }
      else if (s.do === 'dispatch' && !/^[a-zA-Z][\w:-]*$/.test(s.event ?? '')) problems.push(`${at} needs an event type`);
      else if (s.do === 'scroll' && !(Number.isFinite(s.top) && s.top >= 0)) problems.push(`${at} scrolls to an offset of 0 or more`);
      else if (s.do === 'resize') { if (!(Number.isInteger(s.width) && s.width >= 240 && s.width <= 1600) || (s.height !== undefined && !(Number.isInteger(s.height) && s.height >= 200 && s.height <= 1200))) problems.push(`${at} resizes to a width of 240–1600 (and a height of 200–1200)`); }
      else if (s.do !== 'tab' && !s.selector?.trim()) problems.push(`${at} needs a selector`);
    }
  });
  if (waited > WEB_LIMITS.waitTotal) problems.push(`${where} waits more than ${WEB_LIMITS.waitTotal} ms in all`);
  return problems;
}
function fileProblems(files: WebFilesPart, where: string): string[] {
  const problems: string[] = [];
  for (const [kind, text] of Object.entries(files)) {
    if (!(WEB_FILE_KINDS as readonly string[]).includes(kind)) problems.push(`${where} has an unknown file ${kind}`);
    else if (typeof text !== 'string') problems.push(`${where}: ${kind} is not text`);
    else if (text.length > WEB_LIMITS.file) problems.push(`${where}: ${kind} is longer than ${WEB_LIMITS.file} characters`);
  }
  return problems;
}
const viewportProblems = (v: WebViewport | undefined, where: string) =>
  v && !(Number.isInteger(v.width) && Number.isInteger(v.height) && v.width >= 240 && v.width <= 1600 && v.height >= 200 && v.height <= 1200) ? [`${where} has a viewport outside 240–1600 × 200–1200`] : [];
function setupProblems(setup: WebSetup | undefined, where: string): string[] {
  const problems: string[] = [];
  for (const [i, r] of (setup?.api ?? []).entries()) {
    if (!r.path?.startsWith('/')) problems.push(`${where}: route ${i + 1} needs a path starting with /`);
    if (r.status !== undefined && !(Number.isInteger(r.status) && r.status >= 200 && r.status <= 599)) problems.push(`${where}: route ${r.path} has a status outside 200–599`);
    if (r.delay !== undefined && !(r.delay >= 0 && r.delay <= WEB_LIMITS.waitStep)) problems.push(`${where}: route ${r.path} has a delay outside 0–${WEB_LIMITS.waitStep} ms`);
  }
  for (const [k, v] of [...Object.entries(setup?.storage ?? {}), ...Object.entries(setup?.cookies ?? {})]) if (typeof v !== 'string') problems.push(`${where}: stored ${k} is not text`);
  return problems;
}
const widthProblems = (widths: number[] | undefined, where: string) =>
  widths && (!widths.length || widths.length > 5 || widths.some(w => !(Number.isInteger(w) && w >= 240 && w <= 1600))) ? [`${where} offers 1–5 preview widths of 240–1600`] : [];
const sameKeys = (a: WebFilesPart, b: WebFilesPart) => fileKinds(a).join() === fileKinds(b).join();

/**
 * What can be told about web-code content without a browser: every example is a page with at least one stated check;
 * every exercise has files to edit, a solution and mistakes for exactly those files (each different from the starter),
 * fixed files that do not overlap them, an HTML file in all, and well-formed steps. Whether the pages behave as stated
 * is tests/curriculum-webcode.test.ts (Chromium).
 */
export function webContentProblems(content: WebLessonContent): string[] {
  const problems: string[] = [];
  for (const e of content.examples) {
    const at = `example ${e.id}`;
    if (!e.description?.trim()) problems.push(`${at} needs a description`);
    if (!e.files?.html?.trim()) problems.push(`${at} needs HTML`);
    problems.push(...fileProblems(e.files ?? {}, at), ...stepProblems(e.observe, at), ...viewportProblems(e.viewport, at), ...setupProblems(e.setup, at), ...widthProblems(e.widths, at));
    if (e.height !== undefined && !(e.height >= WEB_LIMITS.minHeight && e.height <= WEB_LIMITS.maxHeight)) problems.push(`${at} has a height outside ${WEB_LIMITS.minHeight}–${WEB_LIMITS.maxHeight}`);
  }
  for (const x of content.exercises) {
    const at = `exercise ${x.id}`, editable = fileKinds(x.starter ?? {});
    if (!x.explanation?.trim()) problems.push(`${at} needs an explanation`);
    if (!editable.length) problems.push(`${at} needs a file to edit`);
    if (editable.some(k => x.fixed?.[k] !== undefined)) problems.push(`${at}: a file is either fixed or edited, not both`);
    if (mergeFiles(x.fixed, x.starter ?? {}).html.trim() === '' && !editable.includes('html')) problems.push(`${at} needs HTML`);
    if (!sameKeys(x.starter ?? {}, x.solution ?? {})) problems.push(`${at}: the solution has the files the learner edits (${editable.join(', ')}), no others`);
    else if (editable.every(k => x.starter[k] === x.solution[k])) problems.push(`${at}: the solution is the starter`);
    if (!mergeFiles(x.fixed, x.solution ?? {}).html.trim()) problems.push(`${at}: the solved page has no HTML`);
    problems.push(...fileProblems(x.fixed ?? {}, at), ...fileProblems(x.starter ?? {}, at), ...fileProblems(x.solution ?? {}, at), ...stepProblems(x.steps, at), ...viewportProblems(x.viewport, at), ...setupProblems(x.setup, at), ...widthProblems(x.widths, at));
    if (!x.mistakes?.length) problems.push(`${at} needs at least one typical mistake`);
    for (const [i, m] of (x.mistakes ?? []).entries()) {
      if (!m.why?.trim()) problems.push(`${at}: mistake ${i + 1} needs its explanation`);
      if (!sameKeys(x.starter ?? {}, m.files ?? {})) problems.push(`${at}: mistake ${i + 1} has the files the learner edits (${editable.join(', ')}), no others`);
      problems.push(...fileProblems(m.files ?? {}, `${at}: mistake ${i + 1}`));
    }
    for (const v of x.variants ?? []) {
      if (!v.title?.trim()) problems.push(`${at}: a variant needs a title`);
      if ((!fileKinds(v.fixed ?? {}).length && !v.setup) || fileKinds(v.fixed ?? {}).some(k => editable.includes(k))) problems.push(`${at}: variant ${v.title} replaces fixed files (or the setup) only`);
      problems.push(...setupProblems(v.setup, `${at}: variant ${v.title}`));
      problems.push(...fileProblems(v.fixed ?? {}, `${at}: variant ${v.title}`), ...stepProblems(v.steps, `${at}: variant ${v.title}`));
    }
  }
  return problems;
}

/**
 * What a browser must confirm about web-code content, given a runner: every example's observed steps pass, and without
 * an uncaught error unless the example says so; every exercise's solution passes all checks and variants; its starter
 * and each typical mistake fail. Used by the tests with Chromium.
 */
export async function webBehaviourProblems(content: WebLessonContent, run: WebRunner): Promise<string[]> {
  const problems: string[] = [];
  for (const e of content.examples) {
    try {
      const r = await run({ files: e.files, steps: e.observe, viewport: e.viewport ?? WEB_VIEWPORT, setup: e.setup });
      for (const c of judge(e.observe, r.results)) if (!c.ok) problems.push(`example ${e.id}: "${c.label}" does not hold: ${c.message}`);
      const errors = r.console.filter(l => l.kind === 'error');
      if (errors.length && !e.expectErrors) problems.push(`example ${e.id} logs an error: ${errors[0].text}`);
    } catch (x) { problems.push(`example ${e.id} did not run: ${(x as Error).message}`); }
  }
  for (const x of content.exercises) {
    const solved = await checkWebExercise(x, x.solution, run);
    for (const c of solved.results) if (!c.ok) problems.push(`exercise ${x.id}: the solution fails "${c.label}": ${c.message}`);
    for (const h of solved.hidden) if (!h.ok) problems.push(`exercise ${x.id}: the solution fails the variant ${h.title}`);
    if (solved.console.some(l => l.kind === 'error')) problems.push(`exercise ${x.id}: the solution logs an error: ${solved.console.find(l => l.kind === 'error')!.text}`);
    if ((await checkWebExercise(x, x.starter, run)).ok) problems.push(`exercise ${x.id}: the starter already passes`);
    for (const m of x.mistakes) if ((await checkWebExercise(x, m.files, run)).ok) problems.push(`exercise ${x.id}: the typical mistake "${m.why}" passes the check`);
  }
  return problems;
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkWebExercise, judge, treeLines, webBehaviourProblems, webDocument, WEB_SANDBOX, WEB_VIEWPORT, type WebFiles, type WebRun, type WebStep } from '@/lib/webcode/lesson';
import { openWebBrowser, type WebBrowser } from './support/webcode-browser';
import { badgeExercise, greetExercise, headingExercise, webContent } from './support/webcode-fixture';

/*
 * WEB-0: the web-code harness in a real browser (headless Chromium; skipped and reported as Not Executed where it is
 * not installed, required in CI). Pages load in the same sandboxed frame the lesson page uses, with the same document
 * and the same parent-side function. Covered: every check and action, what the frame records (console, links, form
 * submissions), the outline of the DOM the browser built, isolation (no network, no access to the parent), and a page
 * that never finishes.
 */
let browser: WebBrowser | null = null;
beforeAll(async () => { browser = await openWebBrowser(); }, 60_000);
afterAll(async () => { await browser?.close(); });
const page = (files: WebFiles, steps: WebStep[] = []): Promise<WebRun> => browser!.run({ files, steps, viewport: WEB_VIEWPORT });
const inBrowser = (name: string, fn: () => Promise<void>, timeout = 30_000) => it(name, async ctx => { if (!browser) return ctx.skip(); await fn(); }, timeout);

describe('the document in the frame', () => {
  inBrowser('wraps a fragment in a standards-mode document and leaves no trace of the harness in the tree', async () => {
    const r = await page({ html: '<h1 id="t" class="big title">島</h1>\n<p>文字 <a href="https://example.com/a">連結</a></p>', css: 'h1 { color: red; }', js: 'console.log(document.querySelectorAll("script").length)' });
    expect(r.standards).toBe(true);
    expect(treeLines(r.tree)).toEqual([
      'html [lang="zh-Hant"]',
      '  head',
      '    style [data-file="style.css"]',
      '  body',
      '    h1#t.big.title  "島"',
      '    p  "文字"',
      '      a [href="https://example.com/a"]  "連結"',
      '    script [data-file="script.js"]',
    ]);
    // The page's own script sees one script element: its own.
    expect(r.console).toEqual([{ kind: 'log', text: '1' }]);
  });
  inBrowser('keeps a whole document as written: its head, its title, and a missing doctype stays missing (a srcdoc frame is in standards mode either way)', async () => {
    const full = await page({ html: '<!DOCTYPE html>\n<html lang="en">\n<head><title>Hi</title></head>\n<body><main><p>x</p></main></body>\n</html>', css: 'p { margin: 0 }' },
      [{ check: 'doctype', label: 'doctype' }, { check: 'count', selector: 'head > title', count: 1, label: 'title in head' }]);
    expect(full.results.map(r => r.ok)).toEqual([true, true]);
    expect(full.title).toBe('Hi');
    expect(treeLines(full.tree).slice(0, 4)).toEqual(['html [lang="en"]', '  head', '    style [data-file="style.css"]', '    title  "Hi"']);
    const quirks = await page({ html: '<html><head><title>Old</title></head><body><p id="m">x</p><script>document.querySelector("#m").textContent = document.compatMode</script></body></html>' },
      [{ check: 'doctype', label: 'doctype' }, { check: 'text', selector: '#m', text: 'CSS1Compat', label: 'standards mode all the same' }]);
    expect(quirks.results.map(r => r.ok)).toEqual([false, true]);
    expect(quirks.standards).toBe(false);
  });
  inBrowser('puts the style sheet and the script where the page links them', async () => {
    const r = await page({ html: '<!DOCTYPE html><html><head><title>t</title><link rel="stylesheet" href="style.css"><style>p { color: blue }</style></head><body><p>x</p><script src="script.js"></script><footer>f</footer></body></html>',
      css: 'p { color: red }', js: 'console.log(!!document.querySelector("footer"))' }, [{ check: 'style', selector: 'p', property: 'color', value: 'blue', label: 'the later rule wins' }]);
    expect(r.results[0].ok).toBe(true);
    // The script ran where the page put it: before the footer existed.
    expect(r.console).toEqual([{ kind: 'log', text: 'false' }]);
    expect(treeLines(r.tree).filter(l => /style|script|link/.test(l))).toEqual(['    style [data-file="style.css"]', '    style', '    script [data-file="script.js"]']);
  });
  inBrowser('shows what the browser built, not what was typed: implied tbody, and a paragraph closed by a block', async () => {
    const r = await page({ html: '<table><tr><td>1</td></tr></table>\n<p>一<div>二</div>' });
    expect(treeLines(r.tree).slice(3)).toEqual(['    table', '      tbody', '        tr', '          td  "1"', '    p  "一"', '    div  "二"']);
  });
  inBrowser('does not let closing tags in the style sheet or the script end their elements', async () => {
    const r = await page({ html: '<p id="a">x</p>', css: '/* </style><p id="leak">leak</p> */ #a { color: red }', js: 'console.log("</script><p id=leak2>".length)' },
      [{ check: 'count', selector: '#leak, #leak2', count: 0, label: 'nothing leaked' }, { check: 'style', selector: '#a', property: 'color', value: 'red', label: 'style applied' }]);
    expect(r.results.map(x => x.ok)).toEqual([true, true]);
    expect(r.console).toEqual([{ kind: 'log', text: '21' }]);
  });
});

describe('checks', () => {
  const html = '<ul id="list"><li class="done">買 牛奶</li><li>寫   作業</li><li>運動</li></ul>\n<img id="logo" alt="標誌" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">\n<input id="name" value="小安" required>\n<input id="agree" type="checkbox" checked>';
  const css = 'body { margin: 0; font-size: 16px; }\n#list { margin: 0; padding: 0; list-style: none; width: 200px; }\nli { height: 20px; color: rgb(0, 128, 0); }\n.done { text-decoration-line: line-through; }\n.done::before { content: "v"; color: gray; }';
  inBrowser('count, text, attr, value: pass and fail with what was found', async () => {
    const steps: WebStep[] = [
      { check: 'count', selector: 'li', count: 3, label: 'c1' }, { check: 'count', selector: 'li', count: 4, label: 'c2' },
      { check: 'count', selector: 'li', count: 2, op: 'min', label: 'c3' }, { check: 'count', selector: 'li', count: 2, op: 'max', label: 'c4' },
      { check: 'text', selector: 'li:nth-child(2)', text: '寫 作業', label: 't1' }, { check: 'text', selector: 'li', text: '牛奶', match: 'includes', label: 't2' }, { check: 'text', selector: 'li', text: '牛奶', label: 't3' },
      { check: 'attr', selector: '#logo', name: 'alt', label: 'a1' }, { check: 'attr', selector: '#logo', name: 'alt', value: '標誌', label: 'a2' }, { check: 'attr', selector: '#logo', name: 'alt', value: '圖', label: 'a3' },
      { check: 'attr', selector: '#logo', name: 'title', label: 'a4' }, { check: 'attr', selector: '#logo', name: 'title', match: 'absent', label: 'a5' }, { check: 'attr', selector: '#logo', name: 'src', value: 'data:image', match: 'includes', label: 'a6' },
      { check: 'value', selector: '#name', value: '小安', label: 'v1' }, { check: 'value', selector: '#agree', value: true, label: 'v2' }, { check: 'value', selector: '#agree', value: false, label: 'v3' },
      { check: 'text', selector: '#nope', text: 'x', label: 'm1' }, { check: 'count', selector: 'li:::bad', count: 1, label: 'bad selector' },
    ];
    const r = await page({ html, css }, steps);
    expect(r.results.map(x => x.ok)).toEqual([true, false, true, false, true, true, false, true, true, false, false, true, true, true, true, false, false, false]);
    const shown = judge(steps, r.results);
    expect(shown.find(s => s.label === 'c2')!.message).toBe('目前有 3 個 `li`。');
    expect(shown.find(s => s.label === 't3')!.message).toBe('`li` 目前的文字是「買 牛奶」。');
    expect(shown.find(s => s.label === 'a3')!.message).toBe('`#logo` 的 alt 目前是「標誌」。');
    expect(shown.find(s => s.label === 'a4')!.message).toBe('`#logo` 沒有 title 屬性。');
    expect(shown.find(s => s.label === 'v3')!.message).toBe('`#agree` 目前已勾選。');
    expect(shown.find(s => s.label === 'm1')!.message).toBe('頁面上找不到 `#nope`。');
    expect(shown.find(s => s.label === 'bad selector')!.message).toBe('選擇器 `li:::bad` 無法使用。');
  });
  inBrowser('style compares what the browser computed, however the expected value is written; box measures at the check viewport', async () => {
    const steps: WebStep[] = [
      { check: 'style', selector: 'li', property: 'color', value: 'green', label: 's1' }, { check: 'style', selector: 'li', property: 'color', value: '#008000', label: 's2' },
      { check: 'style', selector: 'li', property: 'color', value: 'rgb(0,128,0)', label: 's3' }, { check: 'style', selector: 'li', property: 'color', value: 'red', label: 's4' },
      { check: 'style', selector: 'li', property: 'color', value: ['red', 'green'], label: 's5' },
      { check: 'style', selector: '.done', property: 'text-decoration-line', value: 'line-through', label: 's6' },
      { check: 'style', selector: '.done', property: 'content', value: '"v"', pseudo: '::before', label: 's7' }, { check: 'style', selector: '.done', property: 'color', value: 'gray', pseudo: '::before', label: 's8' },
      { check: 'box', selector: '#list', measure: 'width', value: 200, label: 'b1' }, { check: 'box', selector: '#list', measure: 'height', value: 60, label: 'b2' },
      { check: 'box', selector: 'li:nth-child(3)', measure: 'top', value: 40, label: 'b3' }, { check: 'box', selector: 'li:nth-child(3)', measure: 'top', value: 20, from: 'li:nth-child(2)', label: 'b4' },
      { check: 'box', selector: '#list', measure: 'width', value: 180, label: 'b5' }, { check: 'box', selector: '#list', measure: 'width', value: 180, tolerance: 20, label: 'b6' },
      { check: 'box', selector: 'li', measure: 'right', value: 200, label: 'b7' }, { check: 'box', selector: 'li', measure: 'left', value: 0, from: '#gone', label: 'b8' },
    ];
    const r = await page({ html, css }, steps);
    expect(r.results.map(x => x.ok)).toEqual([true, true, true, false, true, true, true, true, true, true, true, true, false, true, true, false]);
    const shown = judge(steps, r.results);
    expect(shown.find(s => s.label === 's4')!.message).toBe('`li` 的 color 計算後是 rgb(0, 128, 0)。');
    expect(shown.find(s => s.label === 'b5')!.message).toBe('`#list` 的寬度目前是 200px。');
    expect(shown.find(s => s.label === 'b8')!.message).toBe('頁面上找不到 `#gone`。');
  });
  inBrowser('a percentage width is measured at the exercise viewport, whatever the size of the outer page', async () => {
    const steps: WebStep[] = [{ check: 'box', selector: 'div', measure: 'width', value: 300, label: 'half of 600' }];
    expect((await page({ html: '<div style="width:50%;height:10px"></div>', css: 'body{margin:0}' }, steps)).results[0].ok).toBe(true);
    const narrow = await browser!.run({ files: { html: '<div style="width:50%;height:10px"></div>', css: 'body{margin:0}' }, steps, viewport: { width: 320, height: 400 } });
    expect(narrow.results[0]).toMatchObject({ ok: false, actual: '160' });
  });
});

describe('structure checks', () => {
  inBrowser('label reads a control\'s label the way assistive technology does; headings checks the outline', async () => {
    const html = '<h1>報名</h1><h2>聯絡方式</h2><label for="email">電子郵件</label><input id="email"><label>姓名 <input id="name"></label><input id="bare" placeholder="電話">'
      + '<span id="hint">搜尋 站內</span><input id="q" aria-labelledby="hint"><input id="x" aria-label="關閉" title="t"><h3>備註</h3><h2>送出</h2>';
    const steps: WebStep[] = [
      { check: 'label', selector: '#email', text: '電子郵件', label: 'l1' }, { check: 'label', selector: '#name', text: '姓名', label: 'l2' }, { check: 'label', selector: '#bare', text: '電話', label: 'l3' },
      { check: 'label', selector: '#q', text: '搜尋 站內', label: 'l4' }, { check: 'label', selector: '#x', text: '關', match: 'includes', label: 'l5' }, { check: 'label', selector: '#email', text: '姓名', label: 'l6' },
      { check: 'headings', label: 'outline' },
    ];
    const r = await page({ html }, steps);
    expect(r.results.map(x => x.ok)).toEqual([true, true, false, true, true, false, true]);
    const shown = judge(steps, r.results);
    expect(shown.find(s => s.label === 'l3')!.message).toBe('`#bare` 沒有標籤（沒有對應的 label，也沒有 aria-label）。');
    expect(shown.find(s => s.label === 'l6')!.message).toBe('`#email` 目前的標籤文字是「電子郵件」。');
    const outline: WebStep[] = [{ check: 'headings', label: 'outline' }];
    for (const [page_, ok, said] of [['<h1>a</h1><h3>b</h3>', false, '頁面的標題依序是 h1、h3。'], ['<h2>a</h2><h1>b</h1>', false, '頁面的標題依序是 h2、h1。'], ['<h1>a</h1><h2>b</h2><h1>c</h1>', false, '頁面的標題依序是 h1、h2、h1。'],
      ['<p>x</p>', false, '頁面沒有任何標題。'], ['<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2><h3>e</h3><h4>f</h4><h2>g</h2>', true, '']] as const) {
      const shownOutline = judge(outline, (await page({ html: page_ }, outline)).results)[0];
      expect([shownOutline.ok, shownOutline.message], page_).toEqual([ok, said]);
    }
  });
});

describe('actions and what the frame records', () => {
  inBrowser('click, input, select, check, key and wait drive the page; focus follows', async () => {
    const html = '<input id="q"><select id="s"><option value="a">A</option><option value="b">B</option></select><input id="c" type="checkbox"><button id="b" type="button">go</button><p id="out"></p>';
    const js = "const out = document.querySelector('#out');\nconst say = t => { out.textContent += t + ';'; };\n"
      + "document.querySelector('#q').addEventListener('input', e => say('input ' + e.target.value));\n"
      + "document.querySelector('#s').addEventListener('change', e => say('change ' + e.target.value));\n"
      + "document.querySelector('#c').addEventListener('change', e => say('checked ' + e.target.checked));\n"
      + "document.querySelector('#b').addEventListener('click', () => { say('click'); setTimeout(() => say('later'), 50); });\n"
      + "document.addEventListener('keydown', e => say('key ' + e.key));";
    const steps: WebStep[] = [
      { do: 'input', selector: '#q', value: '海' }, { do: 'select', selector: '#s', value: 'b' }, { do: 'check', selector: '#c', checked: true }, { do: 'check', selector: '#c', checked: true },
      { do: 'key', selector: '#q', key: 'Escape' }, { check: 'focus', selector: '#q', label: 'focus on the field' },
      { do: 'key', selector: '#b', key: 'Enter' }, { check: 'text', selector: '#out', text: 'input 海;change b;checked true;key Escape;key Enter;click;', label: 'before the timer' },
      { do: 'wait', ms: 120 }, { check: 'text', selector: '#out', text: 'later;', match: 'includes', label: 'after the timer' },
      { check: 'value', selector: '#s', value: 'b', label: 'selected' }, { check: 'focus', selector: '#q', label: 'focus moved' }, { do: 'click', selector: '#missing' }, { check: 'count', selector: 'p', count: 1, label: 'after a failed action' },
    ];
    const r = await page({ html, js }, steps);
    const shown = judge(steps, r.results);
    expect(shown.map(s => s.ok)).toEqual([true, true, true, true, false, true]);
    expect(shown[4].message).toBe('目前的焦點在 <button#b>。');
    // The check after an action that found nothing still runs; an earlier failed action explains a later failed check.
    expect(r.results.at(-2)).toEqual({ ok: false, missing: true });
    expect(judge([{ do: 'click', selector: '#missing' }, { check: 'count', selector: 'p', count: 9, label: 'x' }], [{ ok: false, missing: true }, { ok: false, actual: '1' }])[0].message)
      .toBe('無法點擊 `#missing`：頁面上找不到這個元素。');
  });
  inBrowser('records console output in order, with values shown the way a console shows them, and uncaught errors', async () => {
    const js = "console.log('a', 1, true, null, undefined);\nconsole.log([1, 'x'], { k: [2] });\nconsole.warn('careful');\nconsole.error('bad');\nconsole.log(document.querySelector('p'));\n"
      + "const o = {}; o.self = o; console.log(o);\nPromise.resolve().then(() => console.log('micro'));\nsetTimeout(() => console.log('macro'), 0);\nconsole.log('sync');\nundefinedFunction();";
    const steps: WebStep[] = [{ do: 'wait', ms: 30 }, { check: 'console', lines: ['sync', 'micro', 'macro'], match: 'includes', label: 'order' }, { check: 'console', lines: ['a 1 true null undefined'], label: 'not all' }];
    const r = await page({ html: '<p id="x" class="y">p</p>', js }, steps);
    expect(r.console.slice(0, 7)).toEqual([
      { kind: 'log', text: 'a 1 true null undefined' }, { kind: 'log', text: '[1,"x"] {"k":[2]}' }, { kind: 'warn', text: 'careful' }, { kind: 'error', text: 'bad' },
      { kind: 'log', text: '<p#x.y>' }, { kind: 'log', text: '{"self":"[Circular]"}' }, { kind: 'log', text: 'sync' }]);
    expect(r.console[7]).toMatchObject({ kind: 'error' });
    expect(r.console[7].text).toMatch(/^Uncaught ReferenceError: undefinedFunction/);
    expect(r.console.slice(8).map(l => l.text)).toEqual(['micro', 'macro']);
    expect(r.results.slice(1).map(x => x.ok)).toEqual([true, false]);
  });
  inBrowser('a link is recorded, never followed; a fragment link scrolls on the same page', async () => {
    const html = '<a id="out" href="https://example.com/next" target="_blank">外部</a> <a id="in" href="#bottom">往下</a><div style="height:2000px"></div><p id="bottom">底</p>';
    const steps: WebStep[] = [{ do: 'click', selector: '#out' }, { check: 'navigated', href: 'https://example.com/next', label: 'n1' }, { check: 'count', selector: '#bottom', count: 1, label: 'still here' },
      { do: 'click', selector: '#in' }, { check: 'navigated', href: '#bottom', label: 'n2' }, { check: 'navigated', href: '#top', label: 'n3' }, { check: 'box', selector: '#bottom', measure: 'top', value: 2000, tolerance: 60, label: 'document position' }];
    const r = await page({ html, css: 'body{margin:0}' }, steps);
    expect(judge(steps, r.results).map(s => s.ok)).toEqual([true, true, true, false, true]);
    expect(r.navigations).toEqual([{ href: 'https://example.com/next', target: '_blank', text: '外部' }, { href: '#bottom', target: '', text: '往下' }]);
  });
  inBrowser('a form submission is recorded with its data after native validation, and never leaves the page', async () => {
    const html = '<form id="f" action="/signup" method="post"><input name="email" type="email" required><input name="plan" type="radio" value="free" checked><input name="plan" type="radio" value="pro"><button id="send" name="via" value="button">送出</button></form>';
    const steps: WebStep[] = [
      { do: 'click', selector: '#send' }, { check: 'submitted', count: 0, label: 'empty required field: not submitted' }, { check: 'count', selector: 'input:invalid', count: 1, label: 'the field is invalid' },
      { do: 'input', selector: '[name=email]', value: 'not-an-email' }, { do: 'submit', selector: '#f' }, { check: 'submitted', count: 0, label: 'wrong format: not submitted' },
      { do: 'input', selector: '[name=email]', value: 'a@example.com' }, { do: 'click', selector: '#send' }, { check: 'submitted', count: 1, label: 'submitted once' },
      { check: 'submitted', data: { email: 'a@example.com', plan: 'free', via: 'button' }, label: 'with the data' }, { check: 'submitted', data: { email: 'a@example.com' }, label: 'not only the email' },
      { do: 'key', selector: '[name=email]', key: 'Enter' }, { check: 'submitted', count: 2, label: 'Enter submits too' }, { check: 'count', selector: '#f', count: 1, label: 'still on the page' },
    ];
    const r = await page({ html }, steps);
    expect(judge(steps, r.results).map(s => s.ok)).toEqual([true, true, true, true, true, false, true, true]);
    expect(r.submissions[0]).toEqual({ form: '<form#f>', handled: false, method: 'post', action: '/signup', data: [['email', 'a@example.com'], ['plan', 'free'], ['via', 'button']] });
  });
});

describe('isolation', () => {
  inBrowser('the page cannot reach the network, the parent page or its storage', async () => {
    const js = "const report = [];\n"
      + "try { parent.document.title; report.push('parent readable'); } catch (e) { report.push('parent blocked'); }\n"
      + "try { localStorage.setItem('a', '1'); report.push('storage ok'); } catch (e) { report.push('storage blocked'); }\n"
      + "try { document.cookie = 'a=1'; report.push('cookie ' + (document.cookie ? 'set' : 'empty')); } catch (e) { report.push('cookie blocked'); }\n"
      + "fetch('https://example.com/').then(() => report.push('fetch ok'), () => report.push('fetch blocked')).then(() => { document.querySelector('#r').textContent = report.join(', '); });";
    const r = await page({ html: '<p id="r"></p><img id="i" src="https://example.com/x.png" alt="x">', js }, [{ do: 'wait', ms: 200 }, { check: 'text', selector: '#r', text: 'parent blocked, storage blocked, cookie blocked, fetch blocked', label: 'isolated' }]);
    expect(r.results[1]).toMatchObject({ ok: true });
  });
  inBrowser('an endless loop is stopped with an error instead of freezing the page, in the script file, an inline script and a handler', async () => {
    for (const js of ['while (true) {}', 'for (;;) {}', 'let i = 0;\ndo { i++; } while (i > 0);', 'for (let i = 0; i >= 0; i++) { /* never ends */ }']) {
      const r = await page({ html: '<p>x</p>', js }, [{ check: 'count', selector: 'p', count: 1, label: 'p' }]);
      expect(r.console, js).toEqual([{ kind: 'error', text: 'Uncaught Error: 迴圈執行太久，已被停止（可能是不會結束的迴圈）' }]);
      expect(r.results[0].ok, js).toBe(true);
    }
    const inline = await page({ html: '<p id="a">x</p><script>while (true) {}</script><p id="b">y</p>' }, [{ check: 'count', selector: 'p', count: 2, label: 'both paragraphs' }]);
    expect(inline.console[0].text).toMatch(/迴圈執行太久/);
    expect(inline.results[0].ok).toBe(true);
    // A loop that ends is not disturbed, and the budget is per task: a later click starts afresh.
    const fine = await page({ html: '<button id="b" type="button">go</button><p id="n"></p>',
      js: "let total = 0;\nfor (let i = 0; i < 200000; i++) total += i;\nconsole.log(total);\ndocument.querySelector('#b').addEventListener('click', () => { let k = 0; while (k < 50000) k++; document.querySelector('#n').textContent = String(k); });" },
      [{ do: 'click', selector: '#b' }, { check: 'text', selector: '#n', text: '50000', label: 'the handler ran' }]);
    expect(fine.console).toEqual([{ kind: 'log', text: '19999900000' }]);
    expect(fine.results[1].ok).toBe(true);
    const verdict = await checkWebExercise(greetExercise(), { js: "document.querySelector('#go').addEventListener('click', () => { while (true) {} });" }, browser!.run);
    expect(verdict.ok).toBe(false);
    expect(verdict.console.some(l => /迴圈執行太久/.test(l.text))).toBe(true);
  }, 90_000);
  inBrowser('a frame that never answers is a timeout: the frame is removed, focus stays where it was, and the next page still runs', async () => {
    // The harness only answers with its own nonce; a job that expects another one hears nothing.
    const job = { sandbox: WEB_SANDBOX, srcdoc: webDocument({ html: '<p>x</p>' }, 'one'), nonce: 'another', steps: [], width: 600, height: 400, timeoutMs: 400 };
    await expect(browser!.job(job)).rejects.toThrow(/timeout/);
    expect((await page({ html: '<p>x</p>' }, [{ check: 'count', selector: 'p', count: 1, label: 'p' }])).results[0].ok).toBe(true);
  });
  it('a run that times out fails every check of the exercise with that reason, and its variants', async () => {
    const verdict = await checkWebExercise(greetExercise(), greetExercise().solution, () => Promise.reject(new Error('timeout')));
    expect(verdict.ok).toBe(false);
    expect(verdict.results.map(c => c.label)).toEqual(['按下之前是空的', '按下之後向輸入框裡的名字打招呼', '改了名字再按，招呼跟著改']);
    expect(verdict.results.every(c => !c.ok && c.message === '頁面沒有在時間內完成載入與檢查（可能有不會結束的迴圈）。')).toBe(true);
    expect(verdict.hidden).toEqual([{ title: '另一個預設名字', ok: false }]);
  });
});

describe('exercises', () => {
  inBrowser('a solution passes every check and variant; the starter and each typical mistake fail; the fixture behaves as it states', async () => {
    for (const exercise of [headingExercise(), badgeExercise(), greetExercise()]) {
      const solved = await checkWebExercise(exercise, exercise.solution, browser!.run);
      expect(solved.ok, exercise.id).toBe(true);
      expect(solved.results.every(r => r.message === ''), exercise.id).toBe(true);
      expect((await checkWebExercise(exercise, exercise.starter, browser!.run)).ok, exercise.id).toBe(false);
      for (const m of exercise.mistakes) expect((await checkWebExercise(exercise, m.files, browser!.run)).ok, m.why).toBe(false);
    }
    expect(await webBehaviourProblems(webContent(), browser!.run)).toEqual([]);
  }, 60_000);
  inBrowser('an answer typed in by hand passes the shown page and fails the variant, which shows only that it failed', async () => {
    const typed = await checkWebExercise(greetExercise(), { js: "let n = 0;\ndocument.querySelector('#go').addEventListener('click', () => { document.querySelector('#hello').textContent = n++ ? '你好，阿明！' : '你好，小安！'; });" }, browser!.run);
    expect(typed.results.every(r => r.ok)).toBe(true);
    expect(typed.hidden).toEqual([{ title: '另一個預設名字', ok: false }]);
    expect(typed.ok).toBe(false);
  });
  inBrowser('behaviour problems name the example or exercise and what went wrong', async () => {
    const content = webContent();
    content.examples[0].observe.push({ check: 'count', selector: 'h2', count: 1, label: '有一個 h2' });
    content.examples[2].files.js += '\nnope();';
    content.exercises[0].solution = { html: '<h1>別的標題</h1><p>x</p>' };
    content.exercises[1].mistakes[0].files = content.exercises[1].solution;
    content.exercises[2].starter = content.exercises[2].solution;
    const problems = (await webBehaviourProblems(content, browser!.run)).join('\n');
    expect(problems).toMatch(/example structure: "有一個 h2" does not hold: 目前有 0 個 `h2`。/);
    expect(problems).toMatch(/example counter logs an error: Uncaught ReferenceError: nope/);
    expect(problems).toMatch(/exercise heading: the solution fails "h1 的文字是「我的網站」": `h1` 目前的文字是「別的標題」。/);
    expect(problems).toMatch(/exercise badge: the typical mistake "少了 `display: inline-block`，行內元素的 `width` 與 `height` 不會生效。" passes the check/);
    expect(problems).toMatch(/exercise greet: the starter already passes/);
  }, 60_000);
});

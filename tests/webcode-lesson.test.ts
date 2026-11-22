import { describe, expect, it } from 'vitest';
import { fileKinds, isWebCheck, judge, mergeFiles, treeLines, webContentProblems, webDocument, WEB_LIMITS, WEB_SANDBOX, type WebStep } from '@/lib/webcode/lesson';
import { LOOP_GUARD } from '@/lib/webcode/loop-guard';
import { webContent } from './support/webcode-fixture';

/*
 * WEB-0: what the web-code module does without a browser: the document it builds for the frame, the files of an
 * exercise, the words of a failed check, and the shape checks on lesson content. What a browser does with the document
 * is tests/webcode-runner.test.ts.
 */
describe('webDocument', () => {
  it('wraps a fragment in a standards-mode document: harness first in the head, style sheet after it, script last in the body', () => {
    const doc = webDocument({ html: '<p>x</p>', css: 'p { color: red }', js: 'go()' }, 'abc');
    expect(doc.startsWith('<!DOCTYPE html>\n<html lang="zh-Hant">\n<head><meta data-li-harness http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc.indexOf('<script data-li-harness>')).toBeLessThan(doc.indexOf('<style data-file="style.css">'));
    expect(doc.indexOf('<style data-file="style.css">')).toBeLessThan(doc.indexOf('</head>'));
    expect(doc).toMatch(/<p>x<\/p>\n<script data-file="script\.js">\ngo\(\)\n<\/script><\/body>\n<\/html>$/);
    expect(doc).toContain("var NONCE = 'abc', LIVE = false;");
    expect(webDocument({ html: '<p>x</p>' }, 'abc', true)).toContain("var NONCE = 'abc', LIVE = true;");
    // No file, no element: a page without CSS or JavaScript gets neither.
    expect(webDocument({ html: '<p>x</p>' }, 'abc')).not.toMatch(/data-file/);
  });
  it('allows no network: inline styles and scripts and data: images only; the frame may run scripts and submit forms, nothing more', () => {
    const doc = webDocument({ html: '<p>x</p>' }, 'n');
    expect(doc).toContain(`content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; form-action 'none'; base-uri 'none'"`);
    expect(WEB_SANDBOX).toBe('allow-scripts allow-forms');
  });
  it('keeps a whole document as written and puts the harness at the start of its head', () => {
    const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<title>T</title>\n</head>\n<body>\n<p>x</p>\n</body>\n</html>';
    const doc = webDocument({ html, css: 'p{}', js: 'go()' }, 'n');
    expect(doc.startsWith('<!DOCTYPE html>\n<html lang="en">\n<head><meta data-li-harness')).toBe(true);
    expect(doc).toMatch(/<\/style>\n<title>T<\/title>/);
    expect(doc).toMatch(/<p>x<\/p>\n<script data-file="script\.js">\ngo\(\)\n<\/script>\n<\/body>\n<\/html>$/);
    // No doctype is added to a document that has none (the lesson may be about exactly that).
    expect(webDocument({ html: '<html><body><p>x</p></body></html>' }, 'n').startsWith('<html><head><meta data-li-harness')).toBe(true);
    expect(webDocument({ html: '<body><p>x</p></body>' }, 'n').startsWith('<head><meta data-li-harness')).toBe(true);
    expect(webDocument({ html: '<!doctype html><p>x</p>' }, 'n').startsWith('<!doctype html><head><meta data-li-harness')).toBe(true);
  });
  it('puts the style sheet and the script where the page links style.css and script.js', () => {
    const page = (script: string) => `<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"><title>T</title></head><body>${script}<p>x</p></body></html>`;
    const doc = webDocument({ html: page('<script src="./script.js"></script>'), css: 'p{}', js: 'go()' }, 'n');
    expect(doc).toContain('<head><meta data-li-harness');
    expect(doc).toMatch(/<\/script><style data-file="style\.css">\np\{\}\n<\/style><title>T<\/title>/);
    expect(doc).toMatch(/<body><script data-file="script\.js">\ngo\(\)\n<\/script><p>x<\/p><\/body>/);
    expect(doc.match(/data-file="style\.css"/g)).toHaveLength(1);
    expect(doc.match(/data-file="script\.js"/g)).toHaveLength(1);
  });
  it('runs a deferred script after the document (W1): defer moves it to the end of the body, a module stays a module in place', () => {
    const page = (script: string) => `<!DOCTYPE html><html><head><title>T</title>${script}</head><body><p>x</p></body></html>`;
    const deferred = webDocument({ html: page('<script src="script.js" defer></script>'), js: 'go()' }, 'n');
    expect(deferred).toMatch(/<title>T<\/title><\/head><body><p>x<\/p><script data-file="script\.js">\ngo\(\)\n<\/script>\n<\/body>/);
    const asModule = webDocument({ html: page('<script type="module" src="script.js"></script>'), js: 'go()' }, 'n');
    expect(asModule).toMatch(/<title>T<\/title><script type="module" data-file="script\.js">\ngo\(\)\n<\/script><\/head>/);
    const plain = webDocument({ html: page('<script src="script.js"></script>'), js: 'go()' }, 'n');
    expect(plain).toMatch(/<title>T<\/title><script data-file="script\.js">\ngo\(\)\n<\/script><\/head>/);
  });
  it('adds no line of its own before the page, and tells the harness where script.js starts', () => {
    // The harness is one line: a whole document keeps its line numbers, a fragment starts on line 5 of the wrapper.
    const fragment = webDocument({ html: '<p>a</p>\n<p>b</p>', css: 'p{}\na{}', js: 'one();\ntwo();' }, 'n');
    const lines = fragment.split('\n');
    expect(lines[0]).toBe('<!DOCTYPE html>');
    expect(lines.indexOf('<p>a</p>')).toBe(7);
    const at = lines.indexOf('one();') + 1;
    expect(fragment).toContain(`var SCRIPT_AT = ${at}, SCRIPT_LINES = 2;`);
    expect(webDocument({ html: '<p>a</p>' }, 'n')).toContain('var SCRIPT_AT = 0, SCRIPT_LINES = 1;');
    const whole = webDocument({ html: '<!DOCTYPE html>\n<html>\n<head>\n<title>T</title>\n</head>\n<body>\n<p>x</p>\n</body>\n</html>' }, 'n');
    expect(whole.split('\n').indexOf('<p>x</p>')).toBe(6);
  });
  it('keeps the learner\'s text out of the markup around it: closing tags are escaped, `$` patterns are not expanded, the nonce is plain', () => {
    const doc = webDocument({ html: '<link rel="stylesheet" href="style.css"><script src="script.js"></script>', css: "a::after { content: '$&</style>' }", js: "const s = '$1 </script> $&';" }, 'a"b<c>');
    expect(doc).toContain("content: '$&<\\/style>'");
    expect(doc).toContain("const s = '$1 <\\/script> $&';");
    expect(doc).toContain("var NONCE = 'abc', LIVE = false;");
  });
  it('guards the loops of the script file and of inline scripts', () => {
    const doc = webDocument({ html: '<script>while (a) {}</script>', js: 'for (;;) {}' }, 'n');
    expect(doc).toContain(`<script>while (${LOOP_GUARD}()&&(a)) {}</script>`);
    expect(doc).toContain(`for (;${LOOP_GUARD}();) {}`);
  });
});

describe('files, outline and messages', () => {
  it('merges an exercise\'s fixed files with the edited ones and lists the files a page has', () => {
    expect(mergeFiles({ html: '<p>x</p>', css: 'a{}' }, { css: 'b{}' })).toEqual({ html: '<p>x</p>', css: 'b{}' });
    expect(mergeFiles(undefined, { js: 'x' })).toEqual({ html: '', js: 'x' });
    expect(fileKinds({ js: '', html: '' })).toEqual(['html', 'js']);
  });
  it('writes the outline as indented text with ids, classes, attributes and text', () => {
    expect(treeLines([{ d: 0, t: 'html', i: '', c: [], a: [['lang', 'zh-Hant']], x: '' }, { d: 1, t: 'body', i: '', c: [], a: [], x: '' },
      { d: 2, t: 'input', i: 'q', c: ['big', 'wide'], a: [['required', ''], ['name', 'q']], x: '' }, { d: 2, t: 'p', i: '', c: [], a: [], x: '你好' }]))
      .toEqual(['html [lang="zh-Hant"]', '  body', '    input#q.big.wide [required name="q"]', '    p  "你好"']);
  });
  it('gives one result per check, in order, and explains the checks after an action that could not be done', () => {
    const steps: WebStep[] = [{ check: 'count', selector: 'li', count: 2, label: 'two items' }, { do: 'submit', selector: 'form' }, { check: 'submitted', count: 1, label: 'sent' }, { check: 'count', selector: 'li', count: 3, label: 'three' }];
    expect(steps.filter(isWebCheck)).toHaveLength(3);
    expect(judge(steps, [{ ok: true, actual: '2' }, { ok: false, missing: true }, { ok: false, actual: '0' }, { ok: true, actual: '3' }])).toEqual([
      { label: 'two items', ok: true, message: '' }, { label: 'sent', ok: false, message: '無法送出 `form`：頁面上找不到這個元素。' }, { label: 'three', ok: true, message: '' }]);
    expect(judge(steps, [{ ok: true }, { ok: true }, { ok: false, actual: '0' }])).toEqual([
      { label: 'two items', ok: true, message: '' }, { label: 'sent', ok: false, message: '表單目前送出了 0 次。' }, { label: 'three', ok: false, message: '這個檢查無法執行。' }]);
    const say = (step: WebStep, raw: object) => judge([step], [{ ok: false, ...raw }])[0].message;
    expect(say({ check: 'attr', selector: 'img', name: 'alt', match: 'absent', label: 'x' }, { actual: 'a' })).toBe('`img` 仍然有 alt 屬性。');
    expect(say({ check: 'style', selector: 'a', property: 'content', value: '"x"', pseudo: '::after', label: 'x' }, { actual: 'none' })).toBe('`a`::after 的 content 計算後是 none。');
    expect(say({ check: 'value', selector: '#n', value: 'a', label: 'x' }, { actual: '' })).toBe('`#n` 目前的值是「」。');
    expect(say({ check: 'focus', selector: '#n', label: 'x' }, { actual: '' })).toBe('目前沒有元素取得焦點。');
    expect(say({ check: 'console', lines: ['a'], label: 'x' }, { actual: 'b\nc' })).toBe('主控台目前的輸出：「b」、「c」。');
    expect(say({ check: 'console', lines: ['a'], label: 'x' }, { actual: '' })).toBe('主控台目前沒有任何輸出。');
    expect(say({ check: 'submitted', data: { a: '1' }, label: 'x' }, { actual: '{"a":"2"}' })).toBe('最後一次送出的資料是 {"a":"2"}。');
    expect(say({ check: 'navigated', href: '/a', label: 'x' }, { actual: '' })).toBe('還沒有點擊任何連結。');
    expect(say({ check: 'doctype', label: 'x' }, { actual: '' })).toBe('頁面沒有 <!DOCTYPE html>。');
  });
});

describe('webContentProblems', () => {
  it('accepts the fixture', () => { expect(webContentProblems(webContent())).toEqual([]); });
  it('requires every example to be a page with a description and at least one stated check', () => {
    const c = webContent();
    c.examples[0].files.html = ' '; c.examples[1].description = ''; c.examples[2].observe = [{ do: 'click', selector: '#add' }]; c.examples[1].height = 20;
    c.examples[0].viewport = { width: 100, height: 400 };
    expect(webContentProblems(c)).toEqual(['example structure needs HTML', 'example structure has a viewport outside 240–1600 × 200–1200', 'example styled needs a description',
      `example styled has a height outside ${WEB_LIMITS.minHeight}–${WEB_LIMITS.maxHeight}`, 'example counter needs at least one check']);
  });
  it('requires an exercise to have files to edit, a solution and mistakes for exactly those files, and no overlap with the fixed ones', () => {
    const c = webContent();
    const [heading, badge, greet] = c.exercises;
    heading.solution = { html: heading.solution.html!, css: 'p{}' };
    heading.mistakes[0].files = { css: 'x' };
    heading.mistakes[1].why = '';
    badge.fixed = { ...badge.fixed, css: 'x' };
    badge.mistakes = [];
    greet.starter = {}; greet.explanation = '';
    greet.variants![0].fixed = { js: 'x' };
    const problems = webContentProblems(c);
    expect(problems).toContain('exercise heading: the solution has the files the learner edits (html), no others');
    expect(problems).toContain('exercise heading: mistake 1 has the files the learner edits (html), no others');
    expect(problems).toContain('exercise heading: mistake 2 needs its explanation');
    expect(problems).toContain('exercise badge: a file is either fixed or edited, not both');
    expect(problems).toContain('exercise badge needs at least one typical mistake');
    expect(problems).toContain('exercise greet needs a file to edit');
    expect(problems).toContain('exercise greet needs an explanation');
  });
  it('requires well-formed steps: known checks and actions, labels, selectors, bounded waits and sizes', () => {
    const c = webContent();
    c.exercises[0].steps = [
      { check: 'count', selector: 'h1', count: 1, label: '' }, { check: 'count', selector: ' ', count: -1, label: 'x' }, { check: 'box', selector: 'h1', measure: 'width', value: NaN, label: 'x' },
      { check: 'style', selector: 'h1', property: 'color', value: ['red', ' '], label: 'x' }, { check: 'attr', selector: 'h1', name: ' ', label: 'x' },
      { do: 'wait', ms: 50_000 }, { do: 'click', selector: '' }, { check: 'nope', label: 'x' } as unknown as WebStep, { do: 'hover', selector: 'a' } as unknown as WebStep,
    ];
    c.exercises[1].steps = Array.from({ length: 7 }, () => ({ do: 'wait' as const, ms: 10_000 })).concat([{ check: 'count', selector: 'p', count: 1, label: 'x' }] as never);
    c.exercises[2].fixed = { html: 'x'.repeat(WEB_LIMITS.file + 1) };
    expect(webContentProblems(c)).toEqual([
      'exercise heading: step 1 needs a label', 'exercise heading: step 2 needs a selector', 'exercise heading: step 2 needs a count of 0 or more', 'exercise heading: step 3 needs a number',
      'exercise heading: step 4 needs a property and a value', 'exercise heading: step 5 needs an attribute name', `exercise heading: step 6 waits 1–${WEB_LIMITS.waitStep} ms`, 'exercise heading: step 7 needs a selector',
      'exercise heading: step 8 is an unknown check nope', 'exercise heading: step 9 is an unknown action hover',
      `exercise badge waits more than ${WEB_LIMITS.waitTotal} ms in all`, `exercise greet: html is longer than ${WEB_LIMITS.file} characters`,
    ]);
  });
  it('accepts resize steps and preview widths within bounds, and names the ones outside them (RWD-0)', () => {
    const c = webContent();
    const check: WebStep = { check: 'count', selector: 'h1', count: 1, label: 'x' };
    c.examples[0].widths = [360, 768, 1024];
    c.exercises[0].widths = [360];
    c.exercises[0].steps = [check, { do: 'resize', width: 240 }, check, { do: 'resize', width: 1600, height: 1200 }, check];
    expect(webContentProblems(c)).toEqual([]);
    c.examples[0].widths = [];
    c.examples[1].widths = [200, 360];
    c.exercises[0].widths = [320, 360, 480, 768, 1024, 1280];
    c.exercises[1].widths = [360.5];
    c.exercises[0].steps = [{ do: 'resize', width: 239 }, { do: 'resize', width: 1601 }, { do: 'resize', width: 800.5 }, { do: 'resize', width: 800, height: 199 }, { do: 'resize', width: 800, height: 1201 }, check];
    const [first, second] = c.examples.map(e => e.id);
    expect(webContentProblems(c)).toEqual([
      `example ${first} offers 1–5 preview widths of 240–1600`, `example ${second} offers 1–5 preview widths of 240–1600`,
      ...[1, 2, 3, 4, 5].map(n => `exercise heading: step ${n} resizes to a width of 240–1600 (and a height of 200–1200)`),
      'exercise heading offers 1–5 preview widths of 240–1600', 'exercise badge offers 1–5 preview widths of 240–1600',
    ]);
  });
  it('does not believe a check made after a resize that did not happen, until a later resize succeeds (RWD-0)', () => {
    const steps: WebStep[] = [{ do: 'resize', width: 1024, height: 700 }, { check: 'count', selector: 'h1', count: 1, label: 'wide' }, { do: 'resize', width: 360 }, { check: 'count', selector: 'h1', count: 1, label: 'narrow' }];
    expect(judge(steps, [{ ok: true }, { ok: true, actual: '1' }, { ok: true }, { ok: true, actual: '1' }]).map(r => r.ok)).toEqual([true, true]);
    // The first resize failed: the check after it would have measured the page at the old width.
    expect(judge(steps, [{ ok: false }, { ok: true, actual: '1' }, { ok: true }, { ok: false, actual: '2' }])).toEqual([
      { label: 'wide', ok: false, message: '無法把頁面的寬度改成 1024px、高度 700px：這個操作無法執行。' }, { label: 'narrow', ok: false, message: '目前有 2 個 `h1`。' }]);
    expect(judge(steps, [{ ok: true }, { ok: true, actual: '1' }, { ok: false }, { ok: true, actual: '1' }]).map(r => [r.ok, r.message])).toEqual([
      [true, ''], [false, '無法把頁面的寬度改成 360px：這個操作無法執行。']]);
  });
});

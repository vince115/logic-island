import { describe, expect, it } from 'vitest';
import { guardInlineScripts, guardLoops, LOOP_GUARD } from '@/lib/webcode/loop-guard';

/*
 * WEB-0: loop protection as a source transform. Loop conditions are wrapped in place (no line moves); what is not a loop
 * header (strings, templates, comments, regular expressions, property names) is left alone; source the tokenizer cannot
 * follow comes back unchanged. That a guarded endless loop really stops is tests/webcode-runner.test.ts (Chromium).
 */
const G = `${LOOP_GUARD}()`;
/** Runs guarded code with a guard that counts its calls and stops the loop after `limit` of them. */
function runGuarded(source: string, limit = 1e6) {
  let calls = 0;
  const guard = () => { if (++calls > limit) throw new Error('stopped'); return true; };
  const value = new Function(LOOP_GUARD, `${guardLoops(source)}`)(guard);
  return { value, calls };
}

describe('guardLoops', () => {
  it('wraps the condition of while, do…while and classic for loops, in place', () => {
    expect(guardLoops('while (i < 3) i++;')).toBe(`while (${G}&&(i < 3)) i++;`);
    expect(guardLoops('do { i++; } while (i < 3);')).toBe(`do { i++; } while (${G}&&(i < 3));`);
    expect(guardLoops('for (let i = 0; i < n; i++) {}')).toBe(`for (let i = 0;${G}&&( i < n); i++) {}`);
    expect(guardLoops('for (;;) {}')).toBe(`for (;${G};) {}`);
    expect(guardLoops('for (let i = 0; ; i++) { if (i > 3) break; }')).toBe(`for (let i = 0; ${G}; i++) { if (i > 3) break; }`);
    expect(guardLoops('while(a){while(b){}}')).toBe(`while(${G}&&(a)){while(${G}&&(b)){}}`);
    expect(guardLoops('a\nwhile (x)\n  y();\nb').split('\n')).toHaveLength(4);
  });
  it('leaves for…of, for…in and for await alone, and code without loops untouched', () => {
    for (const s of ['for (const x of xs) {}', 'for (const k in o) {}', 'for await (const x of stream()) {}', 'const a = 1;\nfunction f(x) { return x / 2; }', ''])
      expect(guardLoops(s)).toBe(s);
  });
  it('does not mistake strings, templates, comments, regular expressions or property names for loops', () => {
    for (const s of [
      "const s = 'while (true) {}';", 'const s = "for (;;) {}";', 'const t = `while (${x}) {}`;', '// while (true) {}', '/* for (;;) {} */ let a;',
      'const r = /while (a)/.test(s);', 'steps.for(1); o.while(2); o?.for(3);', 'const o = { while: 1, for: 2 }; use(o.while);',
      'const t = `a ${ `b ${c}` } d`;', "const q = a / b / c; const r = x++ / 2; const u = (a) / (b);",
    ]) expect(guardLoops(s), s).toBe(s);
  });
  it('finds loops after such text, inside functions, arrow bodies, template expressions and object methods', () => {
    expect(guardLoops("const s = ')'; while (ok) step();")).toBe(`const s = ')'; while (${G}&&(ok)) step();`);
    expect(guardLoops('const r = /[/)]/; while (r.test(s)) s = s.slice(1);')).toBe(`const r = /[/)]/; while (${G}&&(r.test(s))) s = s.slice(1);`);
    expect(guardLoops('const f = () => { for (let i = 0; i < 2; i++) g(i); };')).toBe(`const f = () => { for (let i = 0;${G}&&( i < 2); i++) g(i); };`);
    expect(guardLoops('const t = `${(() => { while (x) x--; return x; })()}`;')).toBe('const t = `${(() => { while (' + G + '&&(x)) x--; return x; })()}`;');
    expect(guardLoops('for (let i = 0, o = { a: [1; 2] }; i < f(1, (2)); i++) {}')).toContain(`${G}&&( i < f(1, (2)))`);
    expect(guardLoops('if (a) /x/.test(b); while (c) d();')).toBe(`if (a) /x/.test(b); while (${G}&&(c)) d();`);
    expect(guardLoops('const half = n / 2; while (n / 2 > 1) n = n / 2;')).toBe(`const half = n / 2; while (${G}&&(n / 2 > 1)) n = n / 2;`);
  });
  it('returns source it cannot follow unchanged (the browser reports the syntax error)', () => {
    for (const s of ["const s = 'open; while (x) {}", 'while (x {', 'const t = `open ${ while (x) {}', '/* open while (x) {}', 'while (x)) {}', 'const r = /open; while (x) {}\n'])
      expect(guardLoops(s), s).toBe(s);
  });
  it('keeps the meaning of guarded code: the same results, and the guard is called once per condition check', () => {
    expect(runGuarded('let n = 0; for (let i = 0; i < 5; i++) n += i; return n;')).toEqual({ value: 10, calls: 6 });
    expect(runGuarded('let n = 0; while (n < 3) n++; return n;')).toEqual({ value: 3, calls: 4 });
    expect(runGuarded('let n = 0; do { n++; } while (n < 3); return n;')).toEqual({ value: 3, calls: 3 });
    expect(runGuarded('let n = 0; for (;;) { if (++n === 4) break; } return n;')).toEqual({ value: 4, calls: 4 });
    expect(runGuarded('let s = ""; outer: for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { if (j === 1) continue outer; s += i; } } return s;').value).toBe('012');
    expect(runGuarded('let n = 0; for (const x of [1, 2, 3]) n += x; return n;')).toEqual({ value: 6, calls: 0 });
    expect(runGuarded('const xs = [3, 1, 2]; let i = 0, out = []; while (i < xs.length && xs[i] !== 2) out.push(xs[i++]); return out.join();').value).toBe('3,1');
    expect(() => runGuarded('while (true) {}', 1000)).toThrow('stopped');
    expect(() => runGuarded('for (;;) {}', 1000)).toThrow('stopped');
    expect(() => runGuarded('let i = 0; do { i++; } while (i > 0);', 1000)).toThrow('stopped');
  });
});

describe('guardInlineScripts', () => {
  it('guards classic and module inline scripts, and leaves external scripts, data blocks and the markup alone', () => {
    expect(guardInlineScripts('<p>while (x)</p><script>while (x) {}</script>')).toBe(`<p>while (x)</p><script>while (${G}&&(x)) {}</script>`);
    expect(guardInlineScripts('<script type="module">for (;;) {}</script>')).toBe(`<script type="module">for (;${G};) {}</script>`);
    for (const s of ['<script src="script.js"></script>', '<script type="application/json">{"while (x)": 1}</script>', '<script type="text/template">while (x) {}</script>', '<button onclick="go()">x</button>'])
      expect(guardInlineScripts(s)).toBe(s);
  });
});

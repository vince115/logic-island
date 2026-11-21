import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { shownText } from '@/components/curriculum/pre-text';
import { curriculum } from '@/content/curriculum';

/* AIF-4 (2026-11-22): AIF16 has a test input starting with \r\n; shown raw in a <pre>, its first line break was lost
 * by the HTML parser and the page failed hydration (React #418). Text in a <pre> is shown with plain newlines. */
describe('text shown in a <pre>', () => {
  it('writes Windows line endings as newlines, so React keeps a leading line break', () => {
    expect(shownText('\r\nstates a\r\n\r\nend\r\n')).toBe('\nstates a\n\nend\n');
    expect(shownText('a\rb')).toBe('a\nb');
    // React's server render adds the newline an HTML parser drops after <pre> only when the text starts with \n.
    expect(renderToString(createElement('pre', null, shownText('\r\nx')))).toBe('<pre>\n\nx</pre>');
  });
  it('covers the lessons whose tests use Windows line endings', () => {
    const crlf = Object.entries(curriculum.contents).filter(([, c]) => c?.exercises.some(x => [...x.samples, ...x.tests].some(t => t.input.includes('\r'))));
    expect(crlf.map(([id]) => id)).toContain('AIF16');
  });
});

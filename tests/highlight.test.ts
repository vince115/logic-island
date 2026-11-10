import { describe, expect, it } from 'vitest';
import { LAB_LANGUAGES, courses } from '../src/content/courses';
import { curriculum } from '../src/content/curriculum';
import { TOKEN_KINDS } from '../src/lib/highlight/kinds';
import { highlight, type HighlightLanguage } from '../src/lib/highlight/server';

/*
 * 2026-11-02 syntax highlighting: the pieces must spell every line exactly (highlighting never changes the code or its
 * line numbers, which the labs' step highlights and the traces rely on), and each language gets real colours.
 */
const programs: [string, HighlightLanguage, string][] = [
  ...courses.flatMap(c => LAB_LANGUAGES.map(l => [`lab ${c.slug} ${l}`, l, c.codeExamples[l].code] as [string, HighlightLanguage, string])),
  ...Object.entries(curriculum.contents).flatMap(([id, content]) => [
    ...content!.examples.flatMap(e => Object.entries(e.code).map(([l, code]) => [`${id} ${e.id} ${l}`, l, code] as [string, HighlightLanguage, string])),
    ...content!.exercises.flatMap(x => [x.solution, x.starter ?? {}].flatMap(code => Object.entries(code).map(([l, c]) => [`${id} ${x.id} ${l}`, l, c] as [string, HighlightLanguage, string]))),
    ...content!.quiz.flatMap(q => q.code ? [[`${id} ${q.id}`, q.code.language, q.code.text] as [string, HighlightLanguage, string]] : []),
    // Phase F.1a: SQL lessons' examples, presets, solutions, alternatives, mistakes and starters.
    ...(content!.sql ? [...content!.sql.examples.map(e => [`${id} ${e.id}`, e.sql]), ...content!.sql.presets.map(p => [`${id} preset ${p.label}`, p.sql]),
      ...content!.sql.exercises.flatMap(x => [x.solution, ...x.alternatives, ...x.mistakes.map(m => m.sql), ...(x.starter ? [x.starter] : [])].map((s, i) => [`${id} ${x.id} ${i}`, s]))]
      .map(([name, code]) => [name, 'SQL', code] as [string, HighlightLanguage, string]) : []),
  ]),
];

describe('syntax highlighting', () => {
  // T.2F: one test per language (the same programs and assertions). As one test the 1904 programs took 2.5–3.8 s of the
  // 5 s limit and timed out once while other suites loaded the machine (docs/exam-system/22 §3.2).
  const languages = [...new Set(programs.map(p => p[1]))];
  it.each(languages)(`spells every line of the %s programs exactly`, language => {
    for (const [name, , code] of programs.filter(p => p[1] === language)) {
      const lines = code.split('\n'), pieces = highlight(code, language);
      expect(pieces.length, name).toBe(lines.length);
      pieces.forEach((line, i) => expect(line.map(p => p[0]).join(''), `${name} line ${i + 1}`).toBe(lines[i]));
    }
  });

  it('colours keywords, types, functions, strings, numbers, comments and operators in each language', () => {
    const kinds = (code: string, language: HighlightLanguage) =>
      new Set(highlight(code, language).flat().filter(p => p[1]).map(p => TOKEN_KINDS[p[1]]));
    const samples: Record<HighlightLanguage, string> = {
      'C++': 'int main() {\n    std::string s = "hi"; // note\n    return s.size() + 1;\n}',
      Java: 'public class Main {\n    static int f(String s) { return s.length() + 1; } // note\n    static String g() { return "hi"; }\n}',
      Python: 'def f(s):\n    return len(s) + 1  # note\nprint(f("hi"), True)',
      JavaScript: 'function f(s) {\n    return s.length + 1; // note\n}\nconsole.log(f("hi"), true);',
      SQL: "SELECT name, COUNT(*) + 1 FROM students -- note\nWHERE grade >= 10 AND email = 'x'\nGROUP BY name;",
    };
    for (const [language, code] of Object.entries(samples) as [HighlightLanguage, string][]) {
      const found = kinds(code, language);
      // SQL: COUNT and the other functions are the grammar's built-ins.
      for (const kind of ['keyword', language === 'SQL' ? 'builtin' : 'function', 'string', 'number', 'comment', 'operator']) expect(found, `${language} ${kind}`).toContain(kind);
    }
    expect(kinds(samples['C++'], 'C++')).toContain('type');
    expect(kinds(samples.Python, 'Python')).toContain('builtin');
    expect(kinds(samples.Python, 'Python')).toContain('constant');
    // Lower-case identifiers the SQL grammar lists as keywords (name) stay plain; upper-case keywords are coloured.
    expect(highlight('SELECT name FROM students;', 'SQL')[0]).toEqual([['SELECT ', 1], ['name ', 0], ['FROM', 1], [' students;', 0]]);
  });
});

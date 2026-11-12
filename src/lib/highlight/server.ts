import { createHighlighter, type ThemeRegistration } from 'shiki';
import { TOKEN_KINDS, type HlLines, type TokenKind } from './kinds';

/*
 * Build-time syntax highlighting (2026-11-02). Shiki parses the code with the TextMate grammars VS Code uses; a theme
 * of placeholder colours maps grammar scopes to our token kinds, and the real colours live in CSS (globals.css), so
 * every code view shares one palette. Only server components import this file; the pages are generated statically,
 * so it runs during the build.
 */
// Phase F.1a: SQL for the database island's examples, exercises and quiz snippets.
const LANGS = { 'C++': 'cpp', Java: 'java', Python: 'python', JavaScript: 'javascript', SQL: 'sql' } as const;
export type HighlightLanguage = keyof typeof LANGS;

/** A unique placeholder colour per kind: #00000k. */
const colour = (kind: TokenKind) => `#${TOKEN_KINDS.indexOf(kind).toString(16).padStart(6, '0')}`;
/** Scopes per kind; TextMate picks the most specific match, so e.g. `storage.type.primitive` (a type) beats `storage.type` (a keyword). */
const SCOPES: Partial<Record<TokenKind, string[]>> = {
  comment: ['comment', 'punctuation.definition.comment'],
  string: ['string', 'punctuation.definition.string', 'constant.character.escape', 'string.quoted', 'string.template'],
  number: ['constant.numeric'],
  // Not `variable.other.constant`: JavaScript gives that to every name declared with const.
  constant: ['constant.language', 'constant.other', 'variable.other.enummember', 'support.constant'],
  keyword: [
    'keyword', 'storage.type', 'storage.modifier', 'keyword.control', 'variable.language', 'keyword.other.using', 'keyword.other.typedef',
    // Word operators read as keywords: static_cast, new, delete, typeof, instanceof, in, not, and, or.
    'keyword.operator.cast', 'keyword.operator.wordlike', 'keyword.operator.new', 'keyword.operator.delete', 'keyword.operator.expression',
    'keyword.operator.logical.python', 'keyword.operator.instanceof',
  ],
  type: [
    'storage.type.primitive', 'storage.type.built-in', 'storage.type.built-in.primitive', 'support.type.primitive',
    'support.type.builtin', 'support.type.python', 'storage.type.java', 'storage.type.generic.java', 'storage.type.object.array.java',
    'entity.name.type.numeric', 'support.type.posix-reserved', 'storage.type.numeric',
  ],
  operator: ['keyword.operator', 'punctuation.accessor', 'punctuation.separator.dot-access'],
  function: ['entity.name.function', 'meta.function-call.generic', 'support.function.magic'],
  class: ['entity.name.type', 'entity.name.class', 'entity.other.inherited-class', 'support.class', 'entity.name.type.class', 'entity.name.namespace', 'entity.name.scope-resolution'],
  builtin: ['support.function', 'support.class.console', 'support.variable', 'support.function.builtin', 'support.type.object.console', 'variable.other.object.console'],
  variable: ['variable', 'variable.parameter', 'variable.other', 'meta.definition.variable'],
};
const THEME: ThemeRegistration = {
  name: 'logic-island-kinds',
  type: 'dark',
  fg: colour('plain'),
  bg: '#000000',
  settings: [
    { settings: { foreground: colour('plain') } },
    ...Object.entries(SCOPES).map(([kind, scope]) => ({ scope, settings: { foreground: colour(kind as TokenKind) } })),
  ],
};
const KEYWORD = TOKEN_KINDS.indexOf('keyword');
const highlighter = await createHighlighter({ themes: [THEME], langs: Object.values(LANGS) });
const kindOf = (hex: string | undefined) => {
  const index = hex ? parseInt(hex.slice(1, 7), 16) : 0;
  return index < TOKEN_KINDS.length ? index : 0;
};

/** `code` as lines of [text, kind] pieces (neighbouring pieces of the same kind merged), one line per `code.split('\n')`. */
export function highlight(code: string, language: HighlightLanguage): HlLines {
  const lines = highlighter.codeToTokensBase(code, { lang: LANGS[language], theme: THEME });
  const out: HlLines = lines.map(tokens => {
    const pieces: HlLines[number] = [];
    for (const token of tokens) {
      let kind = /^\s*$/.test(token.content) ? 0 : kindOf(token.color);
      // SQL: the grammar also lists common column names (name, status…) as keywords; lessons write keywords in upper
      // case, so a word with a lower-case letter is an identifier.
      if (language === 'SQL' && kind === KEYWORD && /[a-z]/.test(token.content)) kind = 0;
      const last = pieces.at(-1);
      if (last && (last[1] === kind || kind === 0 && /^\s*$/.test(token.content))) last[0] += token.content;
      else pieces.push([token.content, kind]);
    }
    return pieces;
  });
  // Callers index lines by `code.split('\n')`; pad if the tokenizer dropped a trailing empty line.
  while (out.length < code.split('\n').length) out.push([]);
  return out;
}

/** Highlighting for every language of a block, for the client components' `tokens` prop. */
export function highlightAll<L extends HighlightLanguage>(code: Partial<Record<L, string>>): Partial<Record<L, HlLines>> {
  return Object.fromEntries(Object.entries(code).filter(([, text]) => typeof text === 'string')
    .map(([language, text]) => [language, highlight(text as string, language as L)])) as Partial<Record<L, HlLines>>;
}

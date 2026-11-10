/*
 * 2026-11-02: syntax highlighting shared by every code view (lessons, labs, traces, quiz snippets). The server turns
 * code into lines of [text, kind] pieces (./server.ts, Shiki at build time); the client only renders them as spans with
 * a `tk-<kind>` class, coloured by the --hl-* variables in globals.css. No highlighter code reaches the browser.
 */
export const TOKEN_KINDS = [
  'plain', 'keyword', 'type', 'function', 'variable', 'string', 'number', 'comment', 'operator', 'class', 'constant', 'builtin',
] as const;
export type TokenKind = typeof TOKEN_KINDS[number];
/** One piece of a line: its text and an index into TOKEN_KINDS. */
export type HlPiece = [text: string, kind: number];
/** A highlighted program: one array of pieces per line, in the same order as `code.split('\n')`. */
export type HlLines = HlPiece[][];

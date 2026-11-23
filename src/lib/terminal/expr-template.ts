import { evaluate, ExprError, parseExpr, usesStatus, type ExprNode, type ExprRules } from './expr';
import { toStr, truthy, type Val } from './expr-value';
import type { EvalContext } from './expr-fn';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §5): ${{ }} inside workflow values. A value with expressions
 * is a template: each expression is replaced by its value as text before anything else reads the value — for run: before
 * Bash parses the script, which is why untrusted text in ${{ }} is a script injection (CICD08). An if: is an expression
 * even without ${{ }}, and has an implicit success() && unless it calls a status function.
 */

export type TemplatePart = string | { expr: string; at: number };
export const NOT_CLOSED = 'The expression is not closed. An unescaped ${{ sequence was found, but the closing }} sequence was not found.';

/** Splits a value into text and expressions (the closing }} is searched outside 'strings'). */
export function scanTemplate(text: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let i = 0, plain = '';
  while (i < text.length) {
    const open = text.indexOf('${{', i);
    if (open < 0) { plain += text.slice(i); break; }
    plain += text.slice(i, open);
    let j = open + 3, quoted = false, close = -1;
    for (; j < text.length; j++) {
      if (text[j] === "'") quoted = !quoted;
      else if (!quoted && text.startsWith('}}', j)) { close = j; break; }
    }
    if (close < 0) throw new ExprError(NOT_CLOSED);
    if (plain) parts.push(plain);
    plain = '';
    parts.push({ expr: text.slice(open + 3, close), at: open });
    i = close + 2;
  }
  if (plain) parts.push(plain);
  return parts;
}
export const hasExpression = (text: string) => text.includes('${{');

/** The first problem of a template's expressions under these rules (null: none). */
export function templateProblem(text: string, rules: ExprRules): string | null {
  try {
    for (const p of scanTemplate(text)) if (typeof p !== 'string') parseExpr(p.expr, rules);
    return null;
  } catch (e) {
    if (e instanceof ExprError) return e.message;
    throw e;
  }
}

/** A template's text with each expression replaced by its value as text. */
export function interpolate(text: string, ctx: EvalContext, rules: ExprRules = {}): string {
  return scanTemplate(text).map(p => (typeof p === 'string' ? p : toStr(evaluate(parseExpr(p.expr, rules), ctx)))).join('');
}
/** A value that is exactly one ${{ }} keeps the expression's type; otherwise it is the interpolated text. */
export function templateValue(text: string, ctx: EvalContext, rules: ExprRules = {}): Val {
  const parts = scanTemplate(text.trim());
  if (parts.length === 1 && typeof parts[0] !== 'string') return evaluate(parseExpr(parts[0].expr, rules), ctx);
  return interpolate(text, ctx, rules);
}

/** An if: as an expression: its text, or what a single ${{ }} around all of it holds; null when other text surrounds ${{ }} (a non-empty string). */
export function ifSource(text: string): string | null {
  const t = text.trim();
  if (!hasExpression(t)) return t;
  const parts = scanTemplate(t);
  return parts.length === 1 && typeof parts[0] !== 'string' ? parts[0].expr : null;
}
const IF_FUNCTIONS = ['success', 'failure', 'always', 'cancelled'];
/** Parses an if: (the status functions are allowed); null for a template (it is always a non-empty string). */
export function parseIf(text: string, rules: ExprRules): ExprNode | null {
  const src = ifSource(text), r = { ...rules, functions: [...rules.functions ?? [], ...IF_FUNCTIONS] };
  if (src === null) { for (const p of scanTemplate(text)) if (typeof p !== 'string') parseExpr(p.expr, r); return null; }
  return parseExpr(src, r);
}
export function ifProblem(text: string, rules: ExprRules): string | null {
  try { parseIf(text, rules); return null; } catch (e) { if (e instanceof ExprError) return e.message; throw e; }
}
/** Whether an if: lets its job or step run: success() && (expression) unless the expression calls a status function. */
export function evalIf(text: string, ctx: EvalContext, rules: ExprRules = {}): boolean {
  const e = parseIf(text, rules);
  if (e === null) return truthy(interpolate(text, ctx, { ...rules, functions: [...rules.functions ?? [], ...IF_FUNCTIONS] }));
  if (!usesStatus(e) && (ctx.status?.failure || ctx.status?.cancelled)) return false;
  return truthy(evaluate(e, ctx));
}

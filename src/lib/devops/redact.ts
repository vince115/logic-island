import { isFieldName, type FieldValue, type LogRecord } from './logs';

/*
 * CICD-0 D4 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.4): masking sensitive data before logs leave the service.
 * A rule is one line:
 *   field <name>     the whole value of that field becomes *** (wherever the field appears; not its copies in messages)
 *   pattern <name>   every match of a named pattern in messages, string and number field values and raw lines becomes ***
 * (`field:name` and `pattern:name` are accepted too; empty lines and lines starting with # are ignored). Rules apply in
 * order. The patterns are fixed (no regular expressions from the learner): see PATTERNS. Service, host, level and time
 * are never masked.
 */

export const MASK = '***';
export const PATTERNS = {
  email: { label: '電子郵件地址', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  card: { label: '像卡號的數字（13–19 位，可夾空格或連字號）', re: /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g },
  token: { label: '存取權杖（Bearer 之後的字串，或 sk_、tok_ 開頭的長字串）', re: /Bearer\s+[A-Za-z0-9._~+/-]+=*|\b(?:sk|tok)_[A-Za-z0-9]{8,}\b/g },
  ipv4: { label: 'IPv4 位址', re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g },
  digits: { label: '任何連續 4 位以上的數字', re: /\d{4,}/g },
} as const;
export type PatternName = keyof typeof PATTERNS;
export type MaskRule = { kind: 'field'; name: string } | { kind: 'pattern'; name: PatternName };
export const MAX_RULES = 20;

export const ruleText = (r: MaskRule) => `${r.kind} ${r.name}`;

/** The rules in a text (one a line), with the problems of the lines that cannot be read (by line number). */
export function parseMaskRules(text: string, knownFields: readonly string[]): { rules: MaskRule[]; issues: string[] } {
  const rules: MaskRule[] = [], issues: string[] = [];
  text.normalize('NFKC').split('\n').forEach((raw, i) => {
    const line = raw.trim(), at = `第 ${i + 1} 行`;
    if (!line || line.startsWith('#')) return;
    const m = /^(field|pattern)\s*[:\s]\s*(\S+)$/i.exec(line);
    if (!m) { issues.push(`${at}「${line}」看不懂：要寫成「field 欄位名稱」或「pattern 樣式名稱」。`); return; }
    const kind = m[1].toLowerCase() as MaskRule['kind'], name = m[2];
    if (kind === 'pattern') {
      if (!(name.toLowerCase() in PATTERNS)) { issues.push(`${at}：沒有「${name}」這個樣式，可以用 ${Object.keys(PATTERNS).join('、')}。`); return; }
      rules.push({ kind, name: name.toLowerCase() as PatternName });
    } else {
      if (!isFieldName(name)) { issues.push(`${at}：「${name}」不是可以遮蔽的欄位名稱（時間、服務、主機、等級與訊息不遮蔽）。`); return; }
      if (!knownFields.includes(name)) { issues.push(`${at}：沒有任何紀錄有「${name}」這個欄位。`); return; }
      rules.push({ kind, name });
    }
    if (rules.slice(0, -1).some(r => ruleText(r) === ruleText(rules[rules.length - 1]))) { rules.pop(); issues.push(`${at}：和前面的規則重複。`); }
  });
  if (rules.length > MAX_RULES) issues.push(`規則最多 ${MAX_RULES} 條。`);
  return { rules, issues };
}

const maskText = (text: string, rules: readonly MaskRule[]) => rules.reduce((t, r) => r.kind === 'pattern' ? t.replace(PATTERNS[r.name].re, MASK) : t, text);

/** A record with the rules applied; a masked number becomes text. */
export function redactRecord(r: LogRecord, rules: readonly MaskRule[]): LogRecord {
  const fields: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(r.fields)) {
    if (rules.some(x => x.kind === 'field' && x.name === k)) { fields[k] = MASK; continue; }
    const masked = maskText(String(v), rules);
    fields[k] = masked === String(v) ? v : masked;
  }
  return { ...r, message: maskText(r.message, rules), fields };
}
export const redactLine = (text: string, rules: readonly MaskRule[]) => maskText(text, rules);

/** Where a value can be seen: every message, field value and raw line, as text, with where it is. */
export function textsOf(records: readonly LogRecord[], raw: readonly { id: string; text: string }[] = []): { where: string; text: string }[] {
  return [
    ...records.flatMap(r => [{ where: `第 ${r.n} 筆紀錄的 message`, text: r.message },
      ...Object.entries(r.fields).map(([k, v]) => ({ where: `第 ${r.n} 筆紀錄的 ${k}`, text: String(v) }))]),
    ...raw.map(l => ({ where: `原始行 ${l.id}`, text: l.text })),
  ];
}
const occurrences = (text: string, value: string) => { let n = 0; for (let i = text.indexOf(value); i >= 0; i = text.indexOf(value, i + value.length)) n++; return n; };
export const countOf = (texts: readonly { text: string }[], value: string) => texts.reduce((n, t) => n + occurrences(t.text, value), 0);

export interface RedactOutcome { masked: number; leaks: { value: string; where: string }[]; lost: { value: string; before: number; after: number }[] }
/**
 * The redact check: no value of mustHide may be seen anywhere after masking (the first place it is still seen is
 * reported), and every occurrence of each value of mustKeep must still be there (masking it, even once, is over-masking).
 * `masked` counts the values the rules changed (messages, fields and raw lines).
 */
export function redactOutcome(records: readonly LogRecord[], raw: readonly { id: string; text: string }[], rules: readonly MaskRule[], mustHide: readonly string[], mustKeep: readonly string[]): RedactOutcome {
  const before = textsOf(records, raw);
  const after = textsOf(records.map(r => redactRecord(r, rules)), raw.map(l => ({ id: l.id, text: redactLine(l.text, rules) })));
  const masked = after.filter((t, i) => t.text !== before[i].text).length;
  const leaks = mustHide.flatMap(value => { const hit = after.find(t => t.text.includes(value)); return hit ? [{ value, where: hit.where }] : []; });
  const lost = mustKeep.flatMap(value => { const b = countOf(before, value), a = countOf(after, value); return a < b ? [{ value, before: b, after: a }] : []; });
  return { masked, leaks, lost };
}
export function redactMessages(o: RedactOutcome): string[] {
  return [
    ...o.leaks.map(l => `遮蔽後，${l.where}仍看得到必須隱藏的「${l.value}」。`),
    ...o.lost.map(l => `「${l.value}」被遮掉了（原本出現 ${l.before} 次，剩 ${l.after} 次）：它是查問題需要的值，必須保留。`),
  ];
}

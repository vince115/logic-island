import type { ManualEntry } from './manual';
import { ERROR_TEXT, noInput, type ReadResult } from './text';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md §8): GNU coreutils 9.4's base64 [-d] [-i] [-w COLS] [FILE].
 * Encoding writes the input's bytes (UTF-8) as base64, a newline after every 76 characters and at the end (-w 0: one line
 * and no newline at all); decoding skips newlines, writes what it decoded, and stops at anything else with "base64:
 * invalid input" (exit 1) — -i skips characters outside the alphabet. One FILE at most ('-' or none: standard input).
 */

export interface Base64Io { out(text: string): void; err(line: string): void; read(name: string): ReadResult }
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const TRY = "Try 'base64 --help' for more information.";
const VERSION = ['base64 (GNU coreutils) 9.4', 'Copyright (C) 2023 Free Software Foundation, Inc.', 'License GPLv3+: GNU GPL version 3 or later <https://gnu.org/licenses/gpl.html>.',
  'This is free software: you are free to change and redistribute it.', 'There is NO WARRANTY, to the extent permitted by law.', '', 'Written by Simon Josefsson.'];

export const BASE64_MANUAL: Record<'base64', ManualEntry> = {
  base64: {
    usage: 'base64 [-d] [-i] [-w 欄數] [檔案]', summary: '以 base64 編碼或解碼（GNU coreutils 9.4）',
    description: ['沒有檔案或檔案是 - 時讀標準輸入。編碼時每 76 個字元換行，最後也換行；-w 0 不換行（連最後的換行也沒有）。',
      '-d（--decode）解碼：略過換行，遇到其他不是 base64 的字元時印出 base64: invalid input 並以 1 結束；-i 略過字母表以外的字元。',
      'base64 只是編碼，不是加密：任何人都能用 base64 -d 還原。echo 會在結尾加上換行，所以編碼一個值時請用 echo -n 或 printf。'],
    options: [['-d, --decode', '解碼'], ['-i, --ignore-garbage', '解碼時略過字母表以外的字元'], ['-w, --wrap=欄數', '每幾個字元換行（0 不換行）']],
  },
};

/** The bytes as base64 lines of `wrap` characters (0: one line). */
export function encode(bytes: Uint8Array, wrap: number): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0), left = bytes.length - i;
    s += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63] + (left > 1 ? ALPHA[(n >> 6) & 63] : '=') + (left > 2 ? ALPHA[n & 63] : '=');
  }
  if (!wrap) return s;
  let out = '';
  for (let i = 0; i < s.length; i += wrap) out += `${s.slice(i, i + wrap)}\n`;
  return out;
}
/** GNU's decoding: the bytes it could decode, and whether the input was valid. */
export function decode(text: string, ignore: boolean): { bytes: Uint8Array; ok: boolean } {
  const out: number[] = [];
  let q: number[] = [], pad = 0;
  const flush = () => {
    const n = (q[0] << 18) | (q[1] << 12) | ((q[2] ?? 0) << 6) | (q[3] ?? 0);
    out.push((n >> 16) & 255);
    if (q.length > 2) out.push((n >> 8) & 255);
    if (q.length > 3) out.push(n & 255);
    q = []; pad = 0;
  };
  for (const c of text) {
    if (c === '\n') continue;
    const v = ALPHA.indexOf(c);
    if (c === '=' && q.length >= 2 && q.length + pad < 4) { pad++; if (q.length + pad === 4) flush(); continue; }
    if (v < 0 || pad) { if (ignore && c !== '=') continue; return { bytes: new Uint8Array(out), ok: false }; }
    q.push(v);
    if (q.length === 4) flush();
  }
  if (pad || q.length === 1) return { bytes: new Uint8Array(out), ok: false };
  if (q.length) { flush(); return { bytes: new Uint8Array(out), ok: false }; }
  return { bytes: new Uint8Array(out), ok: true };
}

/** base64's options and operand (getopt_long: -d, -i, -w COLS, -wCOLS, --decode, --ignore-garbage, --wrap=COLS). */
export function base64Command(args: readonly string[], io: Base64Io): number {
  let dec = false, ignore = false, wrap = 76;
  const files: string[] = [];
  const wrapOf = (v: string | undefined): boolean => {
    if (v === undefined) { io.err("base64: option requires an argument -- 'w'"); io.err(TRY); return false; }
    if (!/^\d+$/.test(v)) { io.err(`base64: invalid wrap size: '${v}'`); return false; }
    wrap = Number(v);
    return true;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { files.push(...args.slice(i + 1)); break; }
    if (a === '--version') { VERSION.forEach(l => io.out(`${l}\n`)); return 0; }
    if (a === '--decode') { dec = true; continue; }
    if (a === '--ignore-garbage') { ignore = true; continue; }
    const long = /^--wrap(?:=(.*))?$/.exec(a);
    if (long) { if (!wrapOf(long[1] ?? args[++i])) return 1; continue; }
    if (a.startsWith('--')) { io.err(`base64: unrecognized option '${a}'`); io.err(TRY); return 1; }
    if (a.startsWith('-') && a !== '-') {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (ch === 'd') dec = true;
        else if (ch === 'i') ignore = true;
        else if (ch === 'w') { if (!wrapOf(a.slice(j + 1) || args[++i])) return 1; break; }
        else { io.err(`base64: invalid option -- '${ch}'`); io.err(TRY); return 1; }
      }
      continue;
    }
    files.push(a);
  }
  if (files.length > 1) { io.err(`base64: extra operand '${files[1]}'`); io.err(TRY); return 1; }
  const name = files[0] ?? '-', r = io.read(name);
  if ('error' in r) { io.err(r.error === 'NOINPUT' ? noInput('base64') : `base64: ${name}: ${ERROR_TEXT[r.error]}`); return 1; }
  if (!dec) { io.out(encode(new TextEncoder().encode(r.text), wrap)); return 0; }
  const d = decode(r.text, ignore);
  if (d.bytes.length) io.out(new TextDecoder().decode(d.bytes));
  if (!d.ok) { io.err('base64: invalid input'); return 1; }
  return 0;
}

/*
 * Engine stage E4 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §12): the machine's fixed clock. A simulated machine has
 * no real clock: a lesson declares its "now" and its boot time as text ('2026-11-22 10:00:00', always UTC), and every
 * time the engine prints — ps START, top's header, uptime, date, systemctl's "since …; 1h ago", journal timestamps and
 * journalctl's --since/--until — is computed from those numbers. Nothing here reads Date.now() or the host's time zone:
 * Date is only used with UTC getters on fixed numbers, so the same machine prints the same text everywhere.
 */

/** Seconds since 1970 (UTC) of the machine's clock. */
export type Seconds = number;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAY = 86400;
/** The clock of a machine that declares none. */
export const DEFAULT_NOW = '2026-11-22 10:00:00';

const two = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD HH:MM[:SS]' or 'YYYY-MM-DD' (midnight) as seconds; undefined when it is not a real date and time. */
export function parseTime(text: string): Seconds | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!m) return undefined;
  const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1).map(x => x === undefined ? undefined : Number(x)) as number[];
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return undefined;
  return ms / 1000;
}

/** The calendar fields of a time (UTC). */
export function fields(t: Seconds) {
  const d = new Date(Math.floor(t) * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), weekday: d.getUTCDay() };
}

/** 2026-11-22 10:00:00 */
export function isoText(t: Seconds): string {
  const f = fields(t);
  return `${f.year}-${two(f.month + 1)}-${two(f.day)} ${two(f.hour)}:${two(f.minute)}:${two(f.second)}`;
}
/** 10:00:00 */
export const clockText = (t: Seconds) => { const f = fields(t); return `${two(f.hour)}:${two(f.minute)}:${two(f.second)}`; };
/** journalctl's short format: Nov 22 09:00:00 (day zero-padded). */
export const journalStamp = (t: Seconds) => { const f = fields(t); return `${MONTHS[f.month]} ${two(f.day)} ${clockText(t)}`; };
/** journalctl -o short-iso: 2026-11-22T09:00:00+0000. */
export const isoStamp = (t: Seconds) => `${isoText(t).replace(' ', 'T')}+0000`;
/** systemctl status: Sun 2026-11-22 09:00:00 UTC. */
export const systemdStamp = (t: Seconds) => `${WEEKDAYS[fields(t).weekday]} ${isoText(t)} UTC`;
/** date: Sun Nov 22 10:00:00 UTC 2026 (the C locale's %a %b %e %H:%M:%S %Z %Y; the day is space-padded). */
export const dateText = (t: Seconds) => { const f = fields(t); return `${WEEKDAYS[f.weekday]} ${MONTHS[f.month]} ${String(f.day).padStart(2)} ${clockText(t)} UTC ${f.year}`; };

/**
 * ps START / STIME: HH:MM when the process started less than 24 hours before now, MonDD in the same year, else the year
 * (procps-ng's rule).
 */
export function startLabel(start: Seconds, now: Seconds): string {
  const f = fields(start);
  if (now - start < DAY) return `${two(f.hour)}:${two(f.minute)}`;
  return fields(now).year === f.year ? `${MONTHS[f.month]}${two(f.day)}` : String(f.year);
}

/** systemd's relative time (format_timestamp_relative): 1h 4min ago, 58min ago, 2 days ago, now. */
export function relativeText(seconds: Seconds): string {
  const d = Math.max(0, Math.floor(seconds));
  const MONTH = 2629800, YEAR = 31557600, WEEK = 7 * DAY, HOUR = 3600, MIN = 60;
  if (d >= YEAR) return `${Math.floor(d / YEAR)} years ${Math.floor((d % YEAR) / MONTH)} months ago`;
  if (d >= MONTH) return `${Math.floor(d / MONTH)} months ${Math.floor((d % MONTH) / DAY)} days ago`;
  if (d >= WEEK) return `${Math.floor(d / WEEK)} weeks ${Math.floor((d % WEEK) / DAY)} days ago`;
  if (d >= 2 * DAY) return `${Math.floor(d / DAY)} days ago`;
  if (d >= 25 * HOUR) return `1 day ${Math.floor((d - DAY) / HOUR)}h ago`;
  if (d >= 6 * HOUR) return `${Math.floor(d / HOUR)}h ago`;
  if (d >= HOUR) return `${Math.floor(d / HOUR)}h ${Math.floor((d % HOUR) / MIN)}min ago`;
  if (d >= 5 * MIN) return `${Math.floor(d / MIN)}min ago`;
  if (d >= MIN) return `${Math.floor(d / MIN)}min ${d % MIN}s ago`;
  if (d >= 1) return `${d}s ago`;
  return 'now';
}

/** procps' uptime text after "up ": "2 days,  1:00," or "1:00," or "5 min,". */
export function uptimeText(seconds: Seconds): string {
  const total = Math.max(0, Math.floor(seconds)), days = Math.floor(total / DAY), hours = Math.floor((total % DAY) / 3600), minutes = Math.floor((total % 3600) / 60);
  const dayPart = days ? `${days} day${days === 1 ? '' : 's'}, ` : '';
  return `${dayPart}${hours ? `${String(hours).padStart(2)}:${two(minutes)}` : `${minutes} min`},`;
}

const UNITS: [RegExp, number][] = [
  [/^(?:s|sec|secs|second|seconds)$/, 1], [/^(?:m|min|mins|minute|minutes)$/, 60], [/^(?:h|hr|hour|hours)$/, 3600],
  [/^(?:d|day|days)$/, DAY], [/^(?:w|week|weeks)$/, 7 * DAY],
];

/**
 * journalctl --since/--until: an absolute time ('2026-11-22 09:00:00', '2026-11-22 09:00', '2026-11-22', '09:30' or
 * '09:30:15' today), a word (now, today, yesterday, tomorrow) or a relative time against the machine's now ('-1h',
 * '-30min', '1 hour ago', '2 days ago', '+5min', '1h 30min ago'). Undefined when systemd would not parse it.
 */
export function parseWhen(text: string, now: Seconds): Seconds | undefined {
  const t = text.trim(), midnight = now - (now % DAY);
  if (t === 'now') return now;
  if (t === 'today') return midnight;
  if (t === 'yesterday') return midnight - DAY;
  if (t === 'tomorrow') return midnight + DAY;
  const absolute = parseTime(t);
  if (absolute !== undefined) return absolute;
  const clock = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (clock) {
    const [h, m, s = 0] = clock.slice(1).map(x => x === undefined ? undefined : Number(x)) as number[];
    return h < 24 && m < 60 && s < 60 ? midnight + h * 3600 + m * 60 + s : undefined;
  }
  let body = t, sign = 0;
  if (body.startsWith('-')) { sign = -1; body = body.slice(1); }
  else if (body.startsWith('+')) { sign = 1; body = body.slice(1); }
  if (/\sago$/.test(body)) { if (sign) return undefined; sign = -1; body = body.replace(/\s+ago$/, ''); }
  if (!sign) return undefined;
  const parts = body.trim().match(/\d+\s*[a-z]+/g);
  if (!parts || parts.join('').replace(/\s/g, '') !== body.replace(/\s/g, '')) return undefined;
  let span = 0;
  for (const part of parts) {
    const m = /^(\d+)\s*([a-z]+)$/.exec(part)!;
    const unit = UNITS.find(([re]) => re.test(m[2]));
    if (!unit) return undefined;
    span += Number(m[1]) * unit[1];
  }
  return now + sign * span;
}

/** A systemd time span (RestartSec=, StartLimitIntervalSec=): '5', '5s', '100ms', '1min 30s'; undefined when invalid. */
export function parseSpan(text: string): number | undefined {
  const t = text.trim();
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);
  const parts = t.match(/\d+(?:\.\d+)?\s*[a-z]+/g);
  if (!parts || parts.join('').replace(/\s/g, '') !== t.replace(/\s/g, '')) return undefined;
  let total = 0;
  for (const part of parts) {
    const m = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(part)!;
    if (m[2] === 'ms' || m[2] === 'msec') { total += Number(m[1]) / 1000; continue; }
    const unit = UNITS.find(([re]) => re.test(m[2]));
    if (!unit) return undefined;
    total += Number(m[1]) * unit[1];
  }
  return total;
}

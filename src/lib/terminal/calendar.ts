import { DAY, MONTHS, WEEKDAYS, type Seconds } from './clock';
import type { FsState } from './fs';

/*
 * Engine stage E9 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §17): time zones, cron expressions and systemd calendar
 * expressions, all pure. A machine's clock is UTC seconds (clock.ts); a time zone only changes how a time is shown and
 * which UTC instants a wall-clock schedule names. The zones are a fixed table (no tz database, no Intl): fixed offsets
 * for the Asian zones and the EU / US daylight-saving rules (since 1996 / 2007) for the European and American ones, so the
 * same machine prints the same times everywhere.
 */

export interface Zone {
  name: string;
  /** Standard time: its abbreviation and offset east of UTC in seconds. */
  abbr: string;
  offset: number;
  /** Daylight saving time and its rule (EU: last Sunday of March to last Sunday of October at 01:00 UTC; US: second Sunday of March 02:00 to first Sunday of November 02:00 local). */
  dst?: { abbr: string; offset: number; rule: 'eu' | 'us' };
}

const H = 3600;
export const ZONES: readonly Zone[] = [
  { name: 'UTC', abbr: 'UTC', offset: 0 },
  { name: 'Etc/UTC', abbr: 'UTC', offset: 0 },
  { name: 'Asia/Taipei', abbr: 'CST', offset: 8 * H },
  { name: 'Asia/Shanghai', abbr: 'CST', offset: 8 * H },
  { name: 'Asia/Hong_Kong', abbr: 'HKT', offset: 8 * H },
  { name: 'Asia/Singapore', abbr: '+08', offset: 8 * H },
  { name: 'Asia/Tokyo', abbr: 'JST', offset: 9 * H },
  { name: 'Asia/Seoul', abbr: 'KST', offset: 9 * H },
  { name: 'Asia/Kolkata', abbr: 'IST', offset: 5.5 * H },
  { name: 'Europe/London', abbr: 'GMT', offset: 0, dst: { abbr: 'BST', offset: H, rule: 'eu' } },
  { name: 'Europe/Berlin', abbr: 'CET', offset: H, dst: { abbr: 'CEST', offset: 2 * H, rule: 'eu' } },
  { name: 'Europe/Paris', abbr: 'CET', offset: H, dst: { abbr: 'CEST', offset: 2 * H, rule: 'eu' } },
  { name: 'America/New_York', abbr: 'EST', offset: -5 * H, dst: { abbr: 'EDT', offset: -4 * H, rule: 'us' } },
  { name: 'America/Chicago', abbr: 'CST', offset: -6 * H, dst: { abbr: 'CDT', offset: -5 * H, rule: 'us' } },
  { name: 'America/Denver', abbr: 'MST', offset: -7 * H, dst: { abbr: 'MDT', offset: -6 * H, rule: 'us' } },
  { name: 'America/Los_Angeles', abbr: 'PST', offset: -8 * H, dst: { abbr: 'PDT', offset: -7 * H, rule: 'us' } },
];
export const UTC_ZONE = ZONES[0];
export const zoneNamed = (name: string | undefined): Zone | undefined => name === undefined ? undefined : ZONES.find(z => z.name === name);
/** E9: a machine's time zone (UTC unless a scheduling machine names another). */
export const zoneOf = (state: Pick<FsState, 'schedule'>): Zone => zoneNamed(state.schedule?.timezone) ?? UTC_ZONE;

const two = (n: number) => String(n).padStart(2, '0');
/** The calendar fields of a time (a local time is just seconds shifted by the offset). */
export function partsOf(t: Seconds) {
  const d = new Date(Math.floor(t) * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), weekday: d.getUTCDay() };
}
const dayStart = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day) / 1000;
/** The day of the month of a month's nth Sunday (n < 0: the last one). */
function sunday(year: number, month: number, n: number): number {
  if (n > 0) { const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + (n - 1) * 7; }
  const last = new Date(Date.UTC(year, month, 0)), d = last.getUTCDate();
  return d - last.getUTCDay();
}
/** The UTC instants daylight saving time starts and ends in a year. */
function dstSpan(zone: Zone, year: number): [Seconds, Seconds] | undefined {
  const dst = zone.dst;
  if (!dst) return undefined;
  if (dst.rule === 'eu') return [dayStart(year, 3, sunday(year, 3, -1)) + H, dayStart(year, 10, sunday(year, 10, -1)) + H];
  return [dayStart(year, 3, sunday(year, 3, 2)) + 2 * H - zone.offset, dayStart(year, 11, sunday(year, 11, 1)) + 2 * H - dst.offset];
}
/** The offset (seconds east of UTC) and abbreviation in effect at a UTC instant. */
export function offsetAt(zone: Zone, t: Seconds): { offset: number; abbr: string } {
  const span = dstSpan(zone, partsOf(t).year);
  return span && t >= span[0] && t < span[1] ? { offset: zone.dst!.offset, abbr: zone.dst!.abbr } : { offset: zone.offset, abbr: zone.abbr };
}
export const toLocal = (zone: Zone, t: Seconds) => t + offsetAt(zone, t).offset;
/**
 * The UTC instants a wall-clock time names in a zone: none in the hour that daylight saving time skips, two in the hour it
 * repeats (earliest first), one otherwise.
 */
export function fromLocal(zone: Zone, local: Seconds): Seconds[] {
  const offsets = zone.dst ? [zone.dst.offset, zone.offset] : [zone.offset];
  return [...new Set(offsets.map(o => local - o).filter(t => offsetAt(zone, t).offset === local - t))].sort((a, b) => a - b);
}
/** +0800 */
export const offsetText = (offset: number) => `${offset < 0 ? '-' : '+'}${two(Math.floor(Math.abs(offset) / H))}${two(Math.floor((Math.abs(offset) % H) / 60))}`;
/** systemd's timestamp in a zone: Sun 2026-11-22 18:00:00 CST. */
export function zoneStamp(zone: Zone, t: Seconds): string {
  const { offset, abbr } = offsetAt(zone, t), p = partsOf(t + offset);
  return `${WEEKDAYS[p.weekday]} ${p.year}-${two(p.month)}-${two(p.day)} ${two(p.hour)}:${two(p.minute)}:${two(p.second)} ${abbr}`;
}
/** date's default format in a zone: Sun Nov 22 18:00:00 CST 2026. */
export function zoneDate(zone: Zone, t: Seconds): string {
  const { offset, abbr } = offsetAt(zone, t), p = partsOf(t + offset);
  return `${WEEKDAYS[p.weekday]} ${MONTHS[p.month - 1]} ${String(p.day).padStart(2)} ${two(p.hour)}:${two(p.minute)}:${two(p.second)} ${abbr} ${p.year}`;
}
/** journalctl's short stamp in a zone: Nov 22 18:00:00. */
export function zoneJournal(zone: Zone, t: Seconds): string {
  const p = partsOf(toLocal(zone, t));
  return `${MONTHS[p.month - 1]} ${two(p.day)} ${two(p.hour)}:${two(p.minute)}:${two(p.second)}`;
}

/**
 * date +FORMAT (the subset scripts use): %Y %m %d %H %M %S %F %T %D %R %y %j %a %A %b %B %e %u %w %s %Z %z %n %t %%.
 * Unknown directives are printed as written, like GNU date.
 */
export function formatDate(format: string, zone: Zone, t: Seconds): string {
  const { offset, abbr } = offsetAt(zone, t), p = partsOf(t + offset);
  const yday = Math.floor((dayStart(p.year, p.month, p.day) - dayStart(p.year, 1, 1)) / DAY) + 1;
  const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const map: Record<string, () => string> = {
    Y: () => String(p.year), m: () => two(p.month), d: () => two(p.day), H: () => two(p.hour), M: () => two(p.minute), S: () => two(p.second),
    F: () => `${p.year}-${two(p.month)}-${two(p.day)}`, T: () => `${two(p.hour)}:${two(p.minute)}:${two(p.second)}`, R: () => `${two(p.hour)}:${two(p.minute)}`,
    D: () => `${two(p.month)}/${two(p.day)}/${two(p.year % 100)}`, y: () => two(p.year % 100), j: () => String(yday).padStart(3, '0'),
    a: () => WEEKDAYS[p.weekday], A: () => LONG_DAYS[p.weekday], b: () => MONTHS[p.month - 1], h: () => MONTHS[p.month - 1], B: () => LONG_MONTHS[p.month - 1],
    e: () => String(p.day).padStart(2), u: () => String(p.weekday || 7), w: () => String(p.weekday), s: () => String(Math.floor(t)), Z: () => abbr, z: () => offsetText(offset),
    n: () => '\n', t: () => '\t', '%': () => '%',
  };
  return format.replace(/%(.)/gsu, (all, c: string) => map[c]?.() ?? all);
}

// ---------------------------------------------------------------------------------------------------------- cron

/** A parsed cron schedule (Vixie cron, as Debian and Ubuntu run it). */
export interface CronSpec {
  minutes: readonly number[]; hours: readonly number[]; days: readonly number[]; months: readonly number[];
  /** 0 = Sunday … 6 = Saturday (7 is read as 0). */
  weekdays: readonly number[];
  /** Vixie's DOM_STAR / DOW_STAR: the field started with *, so the day matches by the other field alone. */
  dayStar: boolean; weekdayStar: boolean;
  /** @reboot: only at boot. */
  reboot?: true;
}
const CRON_FIELDS = [['minute', 0, 59], ['hour', 0, 23], ['day-of-month', 1, 31], ['month', 1, 12], ['day-of-week', 0, 7]] as const;
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const CRON_SPECIALS: Readonly<Record<string, string>> = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};

/** One field: *, lists, ranges a-b, steps (star or a-b, then /s; a/s is a to the maximum), month and day names. Null when invalid. */
function cronField(text: string, index: number): number[] | null {
  const [, min, max] = CRON_FIELDS[index];
  const names = index === 3 ? MONTH_NAMES : index === 4 ? DAY_NAMES : null;
  const value = (t: string): number | null => {
    if (/^\d+$/.test(t)) { const n = Number(t); return n >= min && n <= max ? n : null; }
    const at = names ? names.indexOf(t.toLowerCase()) : -1;
    return at < 0 ? null : index === 3 ? at + 1 : at;
  };
  const out = new Set<number>();
  for (const item of text.split(',')) {
    const m = /^([^/]+)(?:\/(\d+))?$/.exec(item);
    if (!m) return null;
    const step = m[2] === undefined ? 1 : Number(m[2]);
    if (step < 1) return null;
    let lo: number | null, hi: number | null;
    if (m[1] === '*') { lo = min; hi = max; }
    else if (m[1].includes('-')) { const [a, b, more] = m[1].split('-'); if (more !== undefined) return null; lo = value(a); hi = value(b); }
    else { lo = value(m[1]); hi = m[2] === undefined ? lo : max; }
    if (lo === null || hi === null || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(index === 4 && v === 7 ? 0 : v);
  }
  return [...out].sort((a, b) => a - b);
}

/** The five time fields of a crontab line (or one @word); the error is Debian cron's ("bad minute"…). */
export function parseCron(fields: readonly string[]): CronSpec | { error: string } {
  if (fields.length === 1 && fields[0].startsWith('@')) {
    if (fields[0] === '@reboot') return { minutes: [], hours: [], days: [], months: [], weekdays: [], dayStar: true, weekdayStar: true, reboot: true };
    const expanded = CRON_SPECIALS[fields[0]];
    return expanded ? parseCron(expanded.split(' ')) : { error: 'bad time specifier' };
  }
  if (fields.length < 5) return { error: `bad ${CRON_FIELDS[fields.length][0]}` };
  const sets: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const s = cronField(fields[i], i);
    if (!s) return { error: `bad ${CRON_FIELDS[i][0]}` };
    sets.push(s);
  }
  return { minutes: sets[0], hours: sets[1], days: sets[2], months: sets[3], weekdays: sets[4], dayStar: fields[2].startsWith('*'), weekdayStar: fields[4].startsWith('*') };
}

/** Whether two schedules name the same times (0 2 * * * equals 00 02 * * * and @daily equals 0 0 * * *). */
export function sameCron(a: CronSpec, b: CronSpec): boolean {
  const eq = (x: readonly number[], y: readonly number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (!!a.reboot !== !!b.reboot) return false;
  return eq(a.minutes, b.minutes) && eq(a.hours, b.hours) && eq(a.months, b.months) && eq(a.days, b.days) && eq(a.weekdays, b.weekdays)
    && (a.dayStar || a.weekdayStar) === (b.dayStar || b.weekdayStar);
}

const HORIZON_DAYS = 3660;
/** Whether a day (local calendar) is one of the schedule's days: with both day fields restricted, either may match. */
function cronDay(spec: CronSpec, year: number, month: number, day: number): boolean {
  if (!spec.months.includes(month)) return false;
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const dom = spec.days.includes(day), dow = spec.weekdays.includes(wd);
  return spec.dayStar || spec.weekdayStar ? dom && dow : dom || dow;
}
/**
 * The next `count` times after `after` (UTC) a cron schedule runs, in the zone's wall-clock time. A time skipped by daylight
 * saving does not run; a repeated one runs once (the simulation's simplification, see §17).
 */
export function nextCron(spec: CronSpec, zone: Zone, after: Seconds, count: number): Seconds[] {
  const out: Seconds[] = [];
  if (spec.reboot) return out;
  const start = partsOf(toLocal(zone, after));
  for (let i = 0; i < HORIZON_DAYS && out.length < count; i++) {
    const p = partsOf(dayStart(start.year, start.month, start.day) + i * DAY);
    if (!cronDay(spec, p.year, p.month, p.day)) continue;
    const base = dayStart(p.year, p.month, p.day);
    for (const h of spec.hours) for (const m of spec.minutes) {
      const t = fromLocal(zone, base + h * H + m * 60)[0];
      if (t !== undefined && t > after && out.length < count) out.push(t);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------- systemd OnCalendar=

/** One component of a calendar expression: null is *, else values, ranges a..b and repetitions /s. */
type Chain = { start: number; stop?: number; repeat?: number }[] | null;
export interface CalendarSpec {
  /** Days of the week, 0 = Monday … 6 = Sunday; null for any. */
  weekdays: number[] | null;
  year: Chain; month: Chain; day: Chain; hour: Chain; minute: Chain; second: Chain;
  /** A time zone written after the time (UTC or a zone of the table). */
  zone?: string;
}
const SHORTHANDS: Readonly<Record<string, string>> = {
  minutely: '*-*-* *:*:00', hourly: '*-*-* *:00:00', daily: '*-*-* 00:00:00', monthly: '*-*-01 00:00:00', weekly: 'Mon *-*-* 00:00:00',
  yearly: '*-01-01 00:00:00', annually: '*-01-01 00:00:00', quarterly: '*-01,04,07,10-01 00:00:00', semiannually: '*-01,07-01 00:00:00',
};
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DOW_LONG = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DOW_SHOWN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function chain(text: string, min: number, max: number, year = false): Chain | undefined {
  if (text === '*') return null;
  const items: NonNullable<Chain> = [];
  const num = (t: string) => {
    if (!/^\d+$/.test(t)) return undefined;
    let n = Number(t);
    if (year && t.length <= 2) n += n < 70 ? 2000 : 1900;
    return n >= min && n <= max ? n : undefined;
  };
  for (const item of text.split(',')) {
    const m = /^(\*|\d+)(?:\.\.(\d+))?(?:\/(\d+))?$/.exec(item);
    if (!m) return undefined;
    const start = m[1] === '*' ? min : num(m[1]);
    if (start === undefined || (m[1] === '*' && m[3] === undefined)) return undefined;
    const stop = m[2] === undefined ? undefined : num(m[2]), repeat = m[3] === undefined ? undefined : Number(m[3]);
    if ((m[2] !== undefined && (stop === undefined || stop < start)) || repeat === 0) return undefined;
    items.push({ start, ...stop !== undefined ? { stop } : {}, ...repeat !== undefined ? { repeat } : {} });
  }
  const key = (c: NonNullable<Chain>[number]) => `${c.start}..${c.stop ?? ''}/${c.repeat ?? ''}`;
  return items.filter((c, i) => items.findIndex(d => key(d) === key(c)) === i).sort((a, b) => a.start - b.start || (a.stop ?? a.start) - (b.stop ?? b.start));
}

/** Parses an OnCalendar= expression (systemd.time(7)); undefined when systemd would refuse it. */
export function parseCalendar(input: string): CalendarSpec | undefined {
  let words = input.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return undefined;
  let zone: string | undefined;
  const last = words.at(-1)!;
  if (words.length > 1 && (last === 'UTC' || zoneNamed(last))) { zone = last; words = words.slice(0, -1); }
  if (words.length === 1 && SHORTHANDS[words[0].toLowerCase()]) words = SHORTHANDS[words[0].toLowerCase()].split(' ');
  let weekdays: number[] | null = null;
  if (/^[A-Za-z]/.test(words[0])) {
    const set = new Set<number>();
    for (const item of words[0].replace(/,$/, '').split(',')) {
      const day = (t: string) => { const l = t.toLowerCase(), a = DOW.indexOf(l), b = DOW_LONG.indexOf(l); return a >= 0 ? a : b >= 0 ? b : undefined; };
      const [a, b, more] = item.split('..');
      const x = day(a), y = b === undefined ? x : day(b);
      if (x === undefined || y === undefined || more !== undefined) return undefined;
      // A range may wrap (Sat..Mon is Saturday, Sunday and Monday).
      for (let d = x; ; d = (d + 1) % 7) { set.add(d); if (d === y) break; }
    }
    weekdays = [...set].sort((a, b) => a - b);
    words = words.slice(1);
  }
  // At most a date (with -) and then a time (with :).
  let date = '*-*-*', time = '00:00:00';
  if (words.length > 2) return undefined;
  if (words.length === 2) {
    if (words[0].includes(':') || !words[0].includes('-') || !words[1].includes(':')) return undefined;
    [date, time] = words;
  } else if (words.length === 1) {
    if (words[0].includes(':')) time = words[0];
    else if (words[0].includes('-')) date = words[0];
    else return undefined;
  }
  const d = date.split('-'), t = time.split(':');
  if (d.length < 2 || d.length > 3 || t.length < 2 || t.length > 3) return undefined;
  const [ys, ms, ds] = d.length === 3 ? d : ['*', ...d];
  const [hs, mins, ss = '00'] = t;
  const year = chain(ys, 1970, 2199, true), month = chain(ms, 1, 12), day = chain(ds, 1, 31), hour = chain(hs, 0, 23), minute = chain(mins, 0, 59), second = chain(ss, 0, 59);
  if ([year, month, day, hour, minute, second].some(c => c === undefined)) return undefined;
  return { weekdays, year: year!, month: month!, day: day!, hour: hour!, minute: minute!, second: second!, ...zone ? { zone } : {} };
}

function chainText(c: Chain, width: number): string {
  if (c === null) return '*';
  return c.map(x => `${String(x.start).padStart(width, '0')}${x.stop !== undefined ? `..${String(x.stop).padStart(width, '0')}` : ''}${x.repeat !== undefined ? `/${x.repeat}` : ''}`).join(',');
}
/** systemd's normalized form: Mon..Fri *-*-* 09:00:00 (runs of three or more weekdays become a range). */
export function normalizeCalendar(spec: CalendarSpec): string {
  let days = '';
  if (spec.weekdays) {
    const parts: string[] = [];
    for (let i = 0; i < spec.weekdays.length;) {
      let j = i;
      while (j + 1 < spec.weekdays.length && spec.weekdays[j + 1] === spec.weekdays[j] + 1) j++;
      if (j - i >= 2) parts.push(`${DOW_SHOWN[spec.weekdays[i]]}..${DOW_SHOWN[spec.weekdays[j]]}`);
      else for (let k = i; k <= j; k++) parts.push(DOW_SHOWN[spec.weekdays[k]]);
      i = j + 1;
    }
    days = `${parts.join(',')} `;
  }
  return `${days}${chainText(spec.year, 4)}-${chainText(spec.month, 2)}-${chainText(spec.day, 2)} ${chainText(spec.hour, 2)}:${chainText(spec.minute, 2)}:${chainText(spec.second, 2)}${spec.zone ? ` ${spec.zone}` : ''}`;
}

const inChain = (c: Chain, v: number) => c === null || c.some(x => x.stop !== undefined
  ? v >= x.start && v <= x.stop && (x.repeat === undefined || (v - x.start) % x.repeat === 0)
  : x.repeat !== undefined ? v >= x.start && (v - x.start) % x.repeat === 0 : v === x.start);
const values = (c: Chain, min: number, max: number) => { const out: number[] = []; for (let v = min; v <= max; v++) if (inChain(c, v)) out.push(v); return out; };

/** The next `count` elapses after `after` (UTC), in the expression's zone or else `zone`. */
export function nextCalendar(spec: CalendarSpec, zone: Zone, after: Seconds, count: number): Seconds[] {
  const z = spec.zone ? zoneNamed(spec.zone) ?? UTC_ZONE : zone, out: Seconds[] = [];
  const start = partsOf(toLocal(z, after));
  const hours = values(spec.hour, 0, 23), minutes = values(spec.minute, 0, 59), seconds = values(spec.second, 0, 59);
  for (let i = 0; i < HORIZON_DAYS * 3 && out.length < count; i++) {
    const base = dayStart(start.year, start.month, start.day) + i * DAY, p = partsOf(base);
    if (!inChain(spec.year, p.year) || !inChain(spec.month, p.month) || !inChain(spec.day, p.day)) continue;
    if (spec.weekdays && !spec.weekdays.includes((p.weekday + 6) % 7)) continue;
    for (const h of hours) for (const m of minutes) for (const s of seconds) {
      if (out.length >= count) break;
      const t = fromLocal(z, base + h * H + m * 60 + s)[0];
      if (t !== undefined && t > after) out.push(t);
    }
  }
  return out;
}

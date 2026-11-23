/*
 * CICD-0 devops-explorer stage D3 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10): incidents on a dashboard and their
 * timeline (for CICD14). An incident is the window [start, end) in which users were affected; the lesson may add the
 * events the team recorded (detected, acknowledged, mitigated, resolved, and free notes), the share of users affected,
 * and a severity matrix. Everything is computed in whole minutes:
 * - time to detect      = detected − start
 * - time to acknowledge = acknowledged − detected
 * - time to mitigate    = mitigated − start
 * - time to recover     = end − start (the impact window: service is back at `end`)
 * - severity: the matrix's row is the first whose minUsersPercent ≤ usersPercent (rows listed from the most users
 *   down to 0), its column the first whose minMinutes ≤ time to recover (columns from the longest down to 0).
 * Paging, status pages and real incident tools are prose only.
 */

export const EVENT_KINDS = ['detected', 'acknowledged', 'mitigated', 'resolved', 'note'] as const;
export type EventKind = typeof EVENT_KINDS[number];
export const EVENT_LABEL: Record<EventKind, string> = { detected: '偵測到', acknowledged: '確認接手', mitigated: '止血（緩解）', resolved: '結案', note: '紀錄' };
/** The events an incident has at most once, in the order they must happen. */
export const MILESTONES = ['detected', 'acknowledged', 'mitigated', 'resolved'] as const satisfies readonly EventKind[];

export interface IncidentEvent { at: number; kind: EventKind; text: string }
export interface Incident {
  id: string;
  label: string;
  /** The minutes users were affected: [start, end). */
  start: number;
  end: number;
  /** The share of users affected (whole percent), for the severity matrix. */
  usersPercent?: number;
  events?: IncidentEvent[];
}
export interface SeverityMatrix {
  /** From the most users affected down to minUsersPercent 0. */
  rows: { label: string; minUsersPercent: number }[];
  /** From the longest impact down to minMinutes 0. */
  columns: { label: string; minMinutes: number }[];
  /** levels[row][column], e.g. 'SEV1'. */
  levels: string[][];
}

export const INCIDENT_METRICS = ['time-to-detect', 'time-to-acknowledge', 'time-to-mitigate', 'time-to-recover', 'severity'] as const;
export type IncidentMetric = typeof INCIDENT_METRICS[number];

const eventAt = (i: Incident, kind: EventKind) => i.events?.find(e => e.kind === kind)?.at;

export interface IncidentTimes { detect?: number; acknowledge?: number; mitigate?: number; recover: number }
export function incidentTimes(i: Incident): IncidentTimes {
  const detected = eventAt(i, 'detected'), acknowledged = eventAt(i, 'acknowledged'), mitigated = eventAt(i, 'mitigated');
  return {
    ...detected !== undefined ? { detect: detected - i.start } : {},
    ...detected !== undefined && acknowledged !== undefined ? { acknowledge: acknowledged - detected } : {},
    ...mitigated !== undefined ? { mitigate: mitigated - i.start } : {},
    recover: i.end - i.start,
  };
}

/** The incident's severity from the matrix, with the row and column it falls in (undefined without usersPercent). */
export function severityOf(i: Incident, m: SeverityMatrix): { level: string; row: number; column: number } | undefined {
  if (i.usersPercent === undefined) return undefined;
  const row = m.rows.findIndex(r => r.minUsersPercent <= i.usersPercent!), column = m.columns.findIndex(c => c.minMinutes <= i.end - i.start);
  return { level: m.levels[row][column], row, column };
}

const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const descendingToZero = (xs: number[]) => xs.length > 0 && xs[xs.length - 1] === 0 && xs.every((x, k) => whole(x, 0, 100_000) && (k === 0 || x < xs[k - 1]));

/** Everything that makes the incidents unusable: windows outside the dashboard or overlapping, events out of order. */
export function incidentProblems(incidents: readonly Incident[], minutes: number): string[] {
  const problems: string[] = [];
  let previousEnd = 0;
  for (const i of incidents) {
    const at = `incident ${i.id}`;
    if (!i.id?.trim() || !i.label?.trim()) problems.push('an incident needs an id and a label');
    if (!whole(i.start, 0, minutes - 1) || !whole(i.end, i.start + 1, minutes)) { problems.push(`${at}: 0 ≤ start < end ≤ ${minutes}`); continue; }
    if (i.start < previousEnd) problems.push(`${at}: incidents are listed in order and do not overlap`);
    previousEnd = i.end;
    if (i.usersPercent !== undefined && !whole(i.usersPercent, 0, 100)) problems.push(`${at}: usersPercent is 0…100`);
    let last = i.start;
    for (const e of i.events ?? []) {
      if (!(EVENT_KINDS as readonly string[]).includes(e.kind) || !e.text?.trim()) problems.push(`${at}: an event needs a known kind and a text`);
      if (!whole(e.at, last, 100_000)) problems.push(`${at}: events are listed in time order, at or after the start`);
      else last = e.at;
    }
    for (const k of MILESTONES) if ((i.events ?? []).filter(e => e.kind === k).length > 1) problems.push(`${at}: at most one ${k} event`);
    const order = MILESTONES.map(k => eventAt(i, k)).filter((x): x is number => x !== undefined);
    if (order.some((x, k) => k > 0 && x < order[k - 1])) problems.push(`${at}: detected, acknowledged, mitigated and resolved happen in that order`);
  }
  return problems;
}
export function severityProblems(m: SeverityMatrix): string[] {
  const problems: string[] = [];
  if (!descendingToZero(m.rows.map(r => r.minUsersPercent))) problems.push('the severity rows go from the most users down to minUsersPercent 0');
  if (!descendingToZero(m.columns.map(c => c.minMinutes))) problems.push('the severity columns go from the longest impact down to minMinutes 0');
  if ([...m.rows, ...m.columns].some(x => !x.label?.trim())) problems.push('every severity row and column needs a label');
  if (m.levels.length !== m.rows.length || m.levels.some(r => r.length !== m.columns.length || r.some(l => !l?.trim())))
    problems.push('the severity levels are one row per row and one level per column');
  return problems;
}

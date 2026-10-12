/**
 * Decides which reports are due. Every tick (pg-boss cron, every few minutes) walks all users and, for
 * each kind, looks at the most recent schedule slot. If that slot fell inside the look-back window and
 * the report for the period that ended before it does not exist yet, the report is created (queued)
 * and a generate job is enqueued with delivery. `ensureReport` is unique on (user, kind, period_start),
 * so a tick that runs twice does nothing the second time.
 */
import { lastMonthlyRun, lastWeeklyRun, periodContaining, previousPeriod, toLocalDate, type Period } from '@hesabu/analytics';
import type { Db, ReportGenerateJob, ScheduleUser } from '@hesabu/db';



export interface DueReport {
  user_id: string;
  kind: 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  slot: string;
}

const LOOKBACK_MS = 36 * 60 * 60 * 1000;
/** A slot this close to the end of its own period reports that period (Sunday 19:30 reports the week ending that night). */
const ENDING_WINDOW_MS = 12 * 60 * 60 * 1000;

/** The period a schedule slot reports on: the one ending within 12 hours of the slot, else the previous one. */
export function periodForSlot(kind: 'week' | 'month', slot: Date, weekStart: 'monday' | 'sunday', now: Date): Period {
  const containing = periodContaining(kind, toLocalDate(slot), { weekStart, now });
  const endMs = new Date(containing.end).getTime();
  if (endMs - slot.getTime() <= ENDING_WINDOW_MS) return containing;
  return previousPeriod(containing, { weekStart, now });
}

/** Pure: which (user, kind) pairs have a slot inside the look-back window, and the period each covers. */
export function dueReports(users: readonly ScheduleUser[], now: Date, lookbackMs = LOOKBACK_MS): DueReport[] {
  const out: DueReport[] = [];
  for (const u of users) {
    const weekly = lastWeeklyRun(u.weekly_at, now);
    if (weekly && now.getTime() - weekly.getTime() <= lookbackMs) {
      const p = periodForSlot('week', weekly, u.week_start, now);
      out.push({ user_id: u.user_id, kind: 'weekly', period_start: p.start, period_end: p.end, slot: weekly.toISOString() });
    }
    const monthly = lastMonthlyRun(u.monthly_at, now);
    if (monthly && now.getTime() - monthly.getTime() <= lookbackMs) {
      const p = periodForSlot('month', monthly, u.week_start, now);
      out.push({ user_id: u.user_id, kind: 'monthly', period_start: p.start, period_end: p.end, slot: monthly.toISOString() });
    }
  }
  return out;
}

export interface SchedulerDeps {
  db: Db;
  enqueue: (job: ReportGenerateJob) => Promise<void>;
  now?: () => Date;
  log?: (line: string) => void;
}

/** One scheduler tick: creates missing report rows for due periods and enqueues their generation with delivery. */
export async function schedulerTick(deps: SchedulerDeps): Promise<{ enqueued: number; due: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const users = await deps.db.system.listUsersForScheduling();
  const due = dueReports(users, now);
  let enqueued = 0;
  for (const d of due) {
    const tenant = deps.db.forUser(d.user_id);
    const existing = await tenant.findReport(d.kind, d.period_start);
    if (existing && existing.status !== 'queued') continue;
    const report = existing ?? (await tenant.ensureReport(d.kind, d.period_start, d.period_end));
    await deps.enqueue({ user_id: d.user_id, report_id: report.id, deliver: true });
    await tenant.audit('worker', 'report.scheduled', { kind: d.kind, period_start: d.period_start, slot: d.slot });
    enqueued += 1;
    deps.log?.(`scheduler: queued ${d.kind} ${d.period_start} for ${d.user_id}`);
  }
  return { enqueued, due: due.length };
}

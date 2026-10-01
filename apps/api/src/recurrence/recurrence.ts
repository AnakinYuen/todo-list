import type {
  MonthlyAnchor,
  RecurrenceRule,
  ScheduleRule,
  Weekday,
} from '@todo-list/shared';

const ISO_DAY: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

interface Parts {
  year: number;
  month: number; // 1-12
  day: number;
}

function parse(date: string): Parts {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return { year, month, day };
}

function fmt({ year, month, day }: Parts): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
function isoWeekday({ year, month, day }: Parts): number {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function addDays(parts: Parts, days: number): Parts {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/** Adds whole months, landing on day 1; the monthly scan then picks the day. */
function addMonths(parts: Parts, months: number): Parts {
  const zero = parts.year * 12 + (parts.month - 1) + months;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1, day: 1 };
}

/** Adds whole months keeping the day, clamped to the target month's length. */
function addMonthsKeepingDay(parts: Parts, months: number): Parts {
  const { year, month } = addMonths(parts, months);
  return { year, month, day: Math.min(parts.day, daysInMonth(year, month)) };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The Monday of the ISO week containing `parts`. */
function mondayOf(parts: Parts): Parts {
  return addDays(parts, -(isoWeekday(parts) - 1));
}

function matchesMonthly(parts: Parts, anchor: MonthlyAnchor): boolean {
  const last = daysInMonth(parts.year, parts.month);
  switch (anchor.kind) {
    case 'DAY_OF_MONTH':
      return parts.day === anchor.day;
    case 'LAST_DAY':
      return parts.day === last;
    case 'LAST_WEEKDAY':
      return (
        isoWeekday(parts) === ISO_DAY[anchor.weekday] && parts.day + 7 > last
      );
    case 'NTH_WEEKDAY':
      return (
        isoWeekday(parts) === ISO_DAY[anchor.weekday] &&
        Math.floor((parts.day - 1) / 7) + 1 === anchor.nth
      );
  }
}

/** `AFTER_COMPLETION`: completion + interval units (ADR 0007). */
function nextAfterCompletion(
  rule: Extract<RecurrenceRule, { mode: 'AFTER_COMPLETION' }>,
  completionDate: string,
): string {
  const completion = parse(completionDate);
  switch (rule.unit) {
    case 'DAYS':
      return fmt(addDays(completion, rule.interval));
    case 'WEEKS':
      return fmt(addDays(completion, rule.interval * 7));
    case 'MONTHS':
      return fmt(addMonthsKeepingDay(completion, rule.interval));
  }
}

/**
 * `FIXED_SCHEDULE`: the first date the schedule generates that is on or after the
 * completion and strictly after the occurrence's own due date (ADR 0001). The
 * date is never duplicated and never moves backwards.
 */
function nextScheduled(
  schedule: ScheduleRule,
  dueDate: string,
  completionDate: string,
): string {
  // A malformed completion date falls back to the due date so callers that
  // cannot supply one still get a valid, anchored next date.
  const completed = /^\d{4}-\d{2}-\d{2}$/.test(completionDate)
    ? completionDate
    : dueDate;
  const due = parse(dueDate);
  let candidate: Parts = addDays(due, 1);

  switch (schedule.frequency) {
    case 'DAILY': {
      // Skipping whole intervals preserves the original anchor.
      const completion = parse(completed);
      const elapsed = Math.floor(
        (Date.UTC(completion.year, completion.month - 1, completion.day) -
          Date.UTC(due.year, due.month - 1, due.day)) /
          86_400_000,
      );
      const steps = Math.max(1, Math.ceil(elapsed / schedule.interval));
      candidate = addDays(due, steps * schedule.interval);
      break;
    }
    case 'WEEKLY': {
      // Scan day by day. Weeks are counted from the occurrence's own week, and
      // only weeks a whole `interval` apart are active.
      const allowed = new Set(schedule.byWeekday.map((day) => ISO_DAY[day]));
      const weekStart = mondayOf(due);
      let cursor = addDays(due, 1);
      candidate = cursor;
      for (let guard = 0; guard < 366 * (schedule.interval + 1); guard += 1) {
        const weeksApart = Math.floor(
          (Date.UTC(cursor.year, cursor.month - 1, cursor.day) -
            Date.UTC(weekStart.year, weekStart.month - 1, weekStart.day)) /
            (86_400_000 * 7),
        );
        const inActiveWeek = weeksApart % schedule.interval === 0;
        if (
          inActiveWeek &&
          allowed.has(isoWeekday(cursor)) &&
          compare(fmt(cursor), completed) >= 0
        ) {
          candidate = cursor;
          break;
        }
        cursor = addDays(cursor, 1);
      }
      break;
    }
    case 'MONTHLY': {
      // Step whole months from the due month; the anchor picks the date.
      let found: Parts | undefined;
      for (let step = 1; step <= 1200 && !found; step += 1) {
        const month = addMonths(due, step * schedule.interval);
        const last = daysInMonth(month.year, month.month);
        for (let day = 1; day <= last; day += 1) {
          const test = { year: month.year, month: month.month, day };
          if (
            matchesMonthly(test, schedule.monthlyAnchor) &&
            compare(fmt(test), completed) >= 0
          ) {
            found = test;
            break;
          }
        }
      }
      if (found) {
        candidate = found;
      }
      break;
    }
  }

  return fmt(candidate);
}

/**
 * The next occurrence's due date (ADR 0007). `AFTER_COMPLETION` ignores the
 * occurrence's due date and counts from the completion; `FIXED_SCHEDULE` falls
 * back to the completion if the occurrence has no due date.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  completionDate: string,
  dueDate: string | null,
): string {
  if (rule.mode === 'AFTER_COMPLETION') {
    return nextAfterCompletion(rule, completionDate);
  }
  return nextScheduled(
    rule.schedule,
    dueDate ?? completionDate,
    completionDate,
  );
}

/**
 * Advances an `AFTER_COMPLETION` candidate by whole intervals until it is not
 * already in the series. Completing an occurrence on the same day as its
 * predecessor re-derives a date the series already holds, so the projection is
 * pushed forward until it is free (ADR 0007). `FIXED_SCHEDULE` dates strictly
 * increase, so they are left alone. `taken` is the series' live due dates.
 *
 * The walk has no iteration cap: `taken` is finite and every step strictly
 * advances the date, so it must leave the set. A cap could silently return a
 * date the series still holds, which the spawn's unique index would reject.
 */
export function nextFreeDueDate(
  rule: RecurrenceRule,
  candidate: string,
  taken: ReadonlySet<string>,
): string {
  if (rule.mode !== 'AFTER_COMPLETION') {
    return candidate;
  }
  let next = candidate;
  while (taken.has(next)) {
    next = nextOccurrence(rule, next, null);
  }
  return next;
}

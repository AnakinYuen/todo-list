import { z } from 'zod';

export const Weekday = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
export type Weekday = z.infer<typeof Weekday>;

export const weekdays: Record<Weekday, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

export const Frequency = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
export type Frequency = z.infer<typeof Frequency>;

export const MonthlyAnchor = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('DAY_OF_MONTH'),
    day: z.number().int().min(1).max(31),
  }),
  z.object({ kind: z.literal('LAST_DAY') }),
  z.object({
    kind: z.literal('NTH_WEEKDAY'),
    weekday: Weekday,
    nth: z.number().int().min(1).max(4),
  }),
  z.object({ kind: z.literal('LAST_WEEKDAY'), weekday: Weekday }),
]);
export type MonthlyAnchor = z.infer<typeof MonthlyAnchor>;

/** The largest "every N" interval a rule may carry, shared with the editor. */
export const MAX_RECURRENCE_INTERVAL = 365;
const Interval = z.number().int().min(1).max(MAX_RECURRENCE_INTERVAL);

/**
 * The calendar half of a recurrence: the RFC 5545 subset Google Calendar exposes
 * — a frequency, an interval, a weekday set for weekly, and an anchor for
 * monthly (ADR 0001). Used for `FIXED_SCHEDULE` rules.
 */
export const ScheduleRule = z.discriminatedUnion('frequency', [
  z.object({ frequency: z.literal('DAILY'), interval: Interval }),
  z.object({
    frequency: z.literal('WEEKLY'),
    interval: Interval,
    byWeekday: z.array(Weekday).min(1),
  }),
  z.object({
    frequency: z.literal('MONTHLY'),
    interval: Interval,
    monthlyAnchor: MonthlyAnchor,
  }),
]);
export type ScheduleRule = z.infer<typeof ScheduleRule>;

/** The unit an `AFTER_COMPLETION` rule counts in. */
export const RecurrenceUnit = z.enum(['DAYS', 'WEEKS', 'MONTHS']);
export type RecurrenceUnit = z.infer<typeof RecurrenceUnit>;

export const RecurrenceMode = z.enum(['AFTER_COMPLETION', 'FIXED_SCHEDULE']);
export type RecurrenceMode = z.infer<typeof RecurrenceMode>;

/**
 * A rule repeats in one of two modes (ADR 0007):
 * - `AFTER_COMPLETION` — a habit: the next date is `interval units` after the
 *   completion.
 * - `FIXED_SCHEDULE` — an obligation: the calendar sets the date, and the
 *   completion only sets a floor.
 */
export const RecurrenceRule = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('AFTER_COMPLETION'),
    interval: Interval,
    unit: RecurrenceUnit,
  }),
  z.object({
    mode: z.literal('FIXED_SCHEDULE'),
    schedule: ScheduleRule,
  }),
]);
export type RecurrenceRule = z.infer<typeof RecurrenceRule>;

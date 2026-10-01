import { describe, expect, it } from 'vitest';
import type {
  RecurrenceRule,
  RecurrenceUnit,
  ScheduleRule,
} from '@todo-list/shared';
import { nextFreeDueDate, nextOccurrence } from './recurrence';

const after = (interval: number, unit: RecurrenceUnit): RecurrenceRule => ({
  mode: 'AFTER_COMPLETION',
  interval,
  unit,
});
const daily = (interval = 1): RecurrenceRule => ({
  mode: 'FIXED_SCHEDULE',
  schedule: { frequency: 'DAILY', interval },
});
const weekly = (
  byWeekday: Extract<ScheduleRule, { frequency: 'WEEKLY' }>['byWeekday'],
  interval = 1,
): RecurrenceRule => ({
  mode: 'FIXED_SCHEDULE',
  schedule: { frequency: 'WEEKLY', interval, byWeekday },
});
const monthly = (
  monthlyAnchor: Extract<
    ScheduleRule,
    { frequency: 'MONTHLY' }
  >['monthlyAnchor'],
  interval = 1,
): RecurrenceRule => ({
  mode: 'FIXED_SCHEDULE',
  schedule: { frequency: 'MONTHLY', interval, monthlyAnchor },
});

describe('nextOccurrence: AFTER_COMPLETION', () => {
  it.each<[RecurrenceRule, string, string]>([
    [after(1, 'DAYS'), '2027-01-10', '2027-01-11'],
    [after(3, 'DAYS'), '2027-01-10', '2027-01-13'],
    [after(1, 'WEEKS'), '2027-01-04', '2027-01-11'],
    [after(2, 'WEEKS'), '2027-01-04', '2027-01-18'],
    [after(1, 'MONTHS'), '2027-01-15', '2027-02-15'],
    [after(3, 'MONTHS'), '2027-01-15', '2027-04-15'],
  ])('counts from the completion: %#', (rule, completion, expected) => {
    expect(nextOccurrence(rule, completion, null)).toBe(expected);
  });

  it('clamps a month onto a shorter month', () => {
    expect(nextOccurrence(after(1, 'MONTHS'), '2027-01-31', null)).toBe(
      '2027-02-28',
    );
    expect(nextOccurrence(after(1, 'MONTHS'), '2028-01-31', null)).toBe(
      '2028-02-29',
    );
  });

  it('ignores the occurrence due date entirely', () => {
    // Completed 2026-10-01 even though the occurrence was due much later.
    expect(nextOccurrence(after(1, 'DAYS'), '2026-10-01', '2027-01-04')).toBe(
      '2026-10-02',
    );
    // And there is no way to collide with the due date.
    expect(nextOccurrence(after(1, 'DAYS'), '2026-10-01', '2026-10-05')).toBe(
      '2026-10-02',
    );
  });
});

describe('nextOccurrence: FIXED_SCHEDULE (daily)', () => {
  it('advances one day when completed on time', () => {
    expect(nextOccurrence(daily(), '2027-01-01', '2027-01-01')).toBe(
      '2027-01-02',
    );
  });

  it('advances to the first day on or after a late completion', () => {
    expect(nextOccurrence(daily(), '2027-01-05', '2027-01-01')).toBe(
      '2027-01-05',
    );
    expect(nextOccurrence(daily(), '2027-01-06', '2027-01-01')).toBe(
      '2027-01-06',
    );
  });

  it('honours the interval and keeps the phase', () => {
    expect(nextOccurrence(daily(3), '2027-01-04', '2027-01-01')).toBe(
      '2027-01-04',
    );
    expect(nextOccurrence(daily(3), '2027-01-01', '2027-01-01')).toBe(
      '2027-01-04',
    );
    // Completed on Jan 5 skips Jan 4 and lands on Jan 7.
    expect(nextOccurrence(daily(3), '2027-01-05', '2027-01-01')).toBe(
      '2027-01-07',
    );
  });
});

describe('nextOccurrence: FIXED_SCHEDULE (weekly)', () => {
  it('returns the next same weekday when completed on time', () => {
    // 2027-01-04 is a Monday.
    expect(nextOccurrence(weekly(['MO']), '2027-01-04', '2027-01-04')).toBe(
      '2027-01-11',
    );
  });

  it('keeps the weekday when completed late within the week', () => {
    expect(nextOccurrence(weekly(['MO']), '2027-01-09', '2027-01-04')).toBe(
      '2027-01-11',
    );
  });

  it('does not duplicate the due date when completed early', () => {
    // Due Monday 2026-10-05, completed the preceding Thursday 2026-10-01.
    expect(nextOccurrence(weekly(['MO']), '2026-10-01', '2026-10-05')).toBe(
      '2026-10-12',
    );
  });

  it('honours a multi-week interval from the due week', () => {
    expect(nextOccurrence(weekly(['MO'], 2), '2027-01-04', '2027-01-04')).toBe(
      '2027-01-18',
    );
  });

  it('advances within the week for multiple weekdays', () => {
    expect(
      nextOccurrence(weekly(['MO', 'WE', 'FR']), '2027-01-04', '2027-01-04'),
    ).toBe('2027-01-06');
    expect(
      nextOccurrence(weekly(['MO', 'WE', 'FR']), '2027-01-06', '2027-01-06'),
    ).toBe('2027-01-08');
  });

  it('wraps around the week boundary', () => {
    expect(
      nextOccurrence(weekly(['MO', 'WE', 'FR']), '2027-01-08', '2027-01-08'),
    ).toBe('2027-01-11');
  });

  it('keeps the phase for a multi-week interval on any weekday', () => {
    expect(nextOccurrence(weekly(['FR'], 2), '2027-01-07', '2027-01-07')).toBe(
      '2027-01-08',
    );
    expect(nextOccurrence(weekly(['FR'], 2), '2027-01-08', '2027-01-08')).toBe(
      '2027-01-22',
    );
  });
});

describe('nextOccurrence: FIXED_SCHEDULE (monthly)', () => {
  it('keeps the same day of month', () => {
    expect(
      nextOccurrence(
        monthly({ kind: 'DAY_OF_MONTH', day: 15 }),
        '2027-01-20',
        '2027-01-15',
      ),
    ).toBe('2027-02-15');
  });

  it('skips months without that day rather than clamping', () => {
    expect(
      nextOccurrence(
        monthly({ kind: 'DAY_OF_MONTH', day: 31 }),
        '2027-01-31',
        '2027-01-31',
      ),
    ).toBe('2027-03-31');
    expect(
      nextOccurrence(
        monthly({ kind: 'DAY_OF_MONTH', day: 31 }),
        '2027-03-31',
        '2027-03-31',
      ),
    ).toBe('2027-05-31');
  });

  it('advances to the next valid month when completed late', () => {
    expect(
      nextOccurrence(
        monthly({ kind: 'DAY_OF_MONTH', day: 30 }),
        '2027-02-15',
        '2027-01-30',
      ),
    ).toBe('2027-03-30');
  });

  it('handles a leap-year February', () => {
    expect(
      nextOccurrence(
        monthly({ kind: 'DAY_OF_MONTH', day: 29 }),
        '2028-01-29',
        '2028-01-29',
      ),
    ).toBe('2028-02-29');
    expect(
      nextOccurrence(
        monthly({ kind: 'DAY_OF_MONTH', day: 29 }),
        '2027-01-29',
        '2027-01-29',
      ),
    ).toBe('2027-03-29');
  });

  it('crosses the year boundary', () => {
    expect(
      nextOccurrence(
        monthly({ kind: 'DAY_OF_MONTH', day: 15 }),
        '2027-12-20',
        '2027-12-15',
      ),
    ).toBe('2028-01-15');
  });

  it('uses the last day of the month', () => {
    expect(
      nextOccurrence(monthly({ kind: 'LAST_DAY' }), '2027-01-31', '2027-01-31'),
    ).toBe('2027-02-28');
    expect(
      nextOccurrence(monthly({ kind: 'LAST_DAY' }), '2027-02-28', '2027-02-28'),
    ).toBe('2027-03-31');
    expect(
      nextOccurrence(monthly({ kind: 'LAST_DAY' }), '2027-12-31', '2027-12-31'),
    ).toBe('2028-01-31');
    expect(
      nextOccurrence(monthly({ kind: 'LAST_DAY' }), '2028-01-31', '2028-01-31'),
    ).toBe('2028-02-29');
  });

  it.each([
    [1, '2027-01-04', '2027-02-01'],
    [2, '2027-01-11', '2027-02-08'],
    [3, '2027-01-18', '2027-02-15'],
    [4, '2027-01-25', '2027-02-22'],
  ])('uses the %ith Monday of the month', (nth, due, expected) => {
    expect(
      nextOccurrence(
        monthly({ kind: 'NTH_WEEKDAY', weekday: 'MO', nth }),
        due,
        due,
      ),
    ).toBe(expected);
  });

  it('uses the last weekday across the year boundary', () => {
    expect(
      nextOccurrence(
        monthly({ kind: 'LAST_WEEKDAY', weekday: 'FR' }),
        '2027-12-31',
        '2027-12-31',
      ),
    ).toBe('2028-01-28');
  });

  it('honours an every-N-months interval', () => {
    expect(
      nextOccurrence(
        monthly({ kind: 'DAY_OF_MONTH', day: 15 }, 3),
        '2027-01-15',
        '2027-01-15',
      ),
    ).toBe('2027-04-15');
    expect(
      nextOccurrence(
        monthly({ kind: 'LAST_DAY' }, 2),
        '2027-01-31',
        '2027-01-31',
      ),
    ).toBe('2027-03-31');
  });
});

describe('nextOccurrence: invariants', () => {
  it('never returns a date on or before the completion (FIXED_SCHEDULE)', () => {
    const rules: RecurrenceRule[] = [
      daily(3),
      weekly(['MO', 'WE', 'FR']),
      monthly({ kind: 'DAY_OF_MONTH', day: 31 }),
      monthly({ kind: 'LAST_WEEKDAY', weekday: 'FR' }),
    ];
    const cases: Array<[string, string]> = [
      ['2027-01-01', '2027-01-01'],
      ['2027-01-05', '2027-01-01'],
      ['2027-01-01', '2027-01-05'],
    ];
    for (const rule of rules) {
      for (const [completion, due] of cases) {
        expect(nextOccurrence(rule, completion, due) > due).toBe(true);
      }
    }
  });

  it('never returns a date on or before the completion (AFTER_COMPLETION)', () => {
    for (const unit of ['DAYS', 'WEEKS', 'MONTHS'] as const) {
      expect(
        nextOccurrence(after(1, unit), '2027-06-15', null) > '2027-06-15',
      ).toBe(true);
    }
  });
});

describe('nextFreeDueDate', () => {
  it('keeps a candidate the series does not already hold', () => {
    expect(
      nextFreeDueDate(after(1, 'DAYS'), '2027-01-11', new Set(['2027-01-10'])),
    ).toBe('2027-01-11');
  });

  it('advances by whole intervals while the date is taken', () => {
    const taken = new Set(['2027-01-11', '2027-01-12']);

    expect(nextFreeDueDate(after(1, 'DAYS'), '2027-01-11', taken)).toBe(
      '2027-01-13',
    );
  });

  it('advances whole weeks and months the same way', () => {
    expect(
      nextFreeDueDate(after(1, 'WEEKS'), '2027-01-11', new Set(['2027-01-11'])),
    ).toBe('2027-01-18');
    expect(
      nextFreeDueDate(
        after(1, 'MONTHS'),
        '2027-02-15',
        new Set(['2027-02-15']),
      ),
    ).toBe('2027-03-15');
  });

  it('advances past a long run of taken dates without an iteration cap', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 1001; i += 1) {
      taken.add(new Date(Date.UTC(2027, 0, 11 + i)).toISOString().slice(0, 10));
    }

    const result = nextFreeDueDate(after(1, 'DAYS'), '2027-01-11', taken);

    expect(taken.has(result)).toBe(false);
    expect(result).toBe(
      new Date(Date.UTC(2027, 0, 11 + 1001)).toISOString().slice(0, 10),
    );
  });

  it('leaves a FIXED_SCHEDULE candidate alone even when the date is taken', () => {
    expect(
      nextFreeDueDate(daily(), '2027-01-11', new Set(['2027-01-11'])),
    ).toBe('2027-01-11');
  });
});

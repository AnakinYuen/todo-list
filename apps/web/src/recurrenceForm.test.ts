import { describe, expect, it } from 'vitest';
import type { RecurrenceRule } from '@todo-list/shared';
import { formOf, isOnlyWeekday, ruleOf, toggleWeekday } from './recurrenceForm';

describe('toggleWeekday', () => {
  it('adds a weekday', () => {
    expect(toggleWeekday(['MO'], 'WE')).toEqual(['MO', 'WE']);
  });

  it('removes a weekday when more than one remains', () => {
    expect(toggleWeekday(['MO', 'WE'], 'WE')).toEqual(['MO']);
  });

  it('never removes the last weekday', () => {
    expect(toggleWeekday(['MO'], 'MO')).toEqual(['MO']);
  });
});

describe('isOnlyWeekday', () => {
  it('is true only for the one selected day', () => {
    expect(isOnlyWeekday(['MO'], 'MO')).toBe(true);
    expect(isOnlyWeekday(['MO'], 'WE')).toBe(false);
    expect(isOnlyWeekday(['MO', 'WE'], 'MO')).toBe(false);
  });
});

describe('recurrence form round-trip', () => {
  // The web form echoes ruleOf(formOf(rule)) on save; the API accepts it only
  // if it deep-equals the stored rule, so every shape must round-trip.
  const rules: RecurrenceRule[] = [
    { mode: 'AFTER_COMPLETION', interval: 3, unit: 'DAYS' },
    { mode: 'FIXED_SCHEDULE', schedule: { frequency: 'DAILY', interval: 2 } },
    {
      mode: 'FIXED_SCHEDULE',
      schedule: { frequency: 'WEEKLY', interval: 1, byWeekday: ['MO', 'WE'] },
    },
    {
      mode: 'FIXED_SCHEDULE',
      schedule: {
        frequency: 'MONTHLY',
        interval: 1,
        monthlyAnchor: { kind: 'DAY_OF_MONTH', day: 15 },
      },
    },
    {
      mode: 'FIXED_SCHEDULE',
      schedule: {
        frequency: 'MONTHLY',
        interval: 1,
        monthlyAnchor: { kind: 'LAST_DAY' },
      },
    },
    {
      mode: 'FIXED_SCHEDULE',
      schedule: {
        frequency: 'MONTHLY',
        interval: 1,
        monthlyAnchor: { kind: 'NTH_WEEKDAY', weekday: 'SU', nth: 4 },
      },
    },
    {
      mode: 'FIXED_SCHEDULE',
      schedule: {
        frequency: 'MONTHLY',
        interval: 1,
        monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 'SU' },
      },
    },
  ];

  it.each(rules)('formOf/ruleOf preserves %#', (rule) => {
    expect(ruleOf(formOf(rule))).toEqual(rule);
  });
});

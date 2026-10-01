import type {
  Frequency,
  MonthlyAnchor,
  RecurrenceMode,
  RecurrenceRule,
  RecurrenceUnit,
  Weekday,
} from '@todo-list/shared';

/**
 * The pure half of the Recurrence editor: the flat `RuleForm` the UI edits, and
 * the conversions to and from the API's `RecurrenceRule`. No React, no DOM, so
 * the round-trip the save path depends on is testable on its own.
 */

export const NO_RECURRENCE = 'NONE';
export type ModeChoice = RecurrenceMode | typeof NO_RECURRENCE;

export interface RuleForm {
  mode: ModeChoice;
  interval: number;
  unit: RecurrenceUnit;
  frequency: Frequency;
  byWeekday: Weekday[];
  anchorKind: MonthlyAnchor['kind'];
  anchorDay: number;
  anchorNth: number;
  anchorWeekday: Weekday;
}

export const defaultRuleForm: RuleForm = {
  mode: NO_RECURRENCE,
  interval: 1,
  unit: 'DAYS',
  frequency: 'WEEKLY',
  byWeekday: ['MO'],
  anchorKind: 'DAY_OF_MONTH',
  anchorDay: 1,
  anchorNth: 1,
  anchorWeekday: 'MO',
};

export function formOf(rule: RecurrenceRule | null): RuleForm {
  if (!rule) {
    return defaultRuleForm;
  }
  if (rule.mode === 'AFTER_COMPLETION') {
    return {
      ...defaultRuleForm,
      mode: 'AFTER_COMPLETION',
      interval: rule.interval,
      unit: rule.unit,
    };
  }
  const schedule = rule.schedule;
  const form: RuleForm = {
    ...defaultRuleForm,
    mode: 'FIXED_SCHEDULE',
    interval: schedule.interval,
    frequency: schedule.frequency,
  };
  if (schedule.frequency === 'WEEKLY') {
    form.byWeekday = schedule.byWeekday;
  }
  if (schedule.frequency === 'MONTHLY') {
    form.anchorKind = schedule.monthlyAnchor.kind;
    if (schedule.monthlyAnchor.kind === 'DAY_OF_MONTH') {
      form.anchorDay = schedule.monthlyAnchor.day;
    }
    if (schedule.monthlyAnchor.kind === 'NTH_WEEKDAY') {
      form.anchorNth = schedule.monthlyAnchor.nth;
      form.anchorWeekday = schedule.monthlyAnchor.weekday;
    }
    if (schedule.monthlyAnchor.kind === 'LAST_WEEKDAY') {
      form.anchorWeekday = schedule.monthlyAnchor.weekday;
    }
  }
  return form;
}

export function ruleOf(form: RuleForm): RecurrenceRule | null {
  if (form.mode === NO_RECURRENCE) {
    return null;
  }
  if (form.mode === 'AFTER_COMPLETION') {
    return {
      mode: 'AFTER_COMPLETION',
      interval: form.interval,
      unit: form.unit,
    };
  }
  if (form.frequency === 'DAILY') {
    return {
      mode: 'FIXED_SCHEDULE',
      schedule: { frequency: 'DAILY', interval: form.interval },
    };
  }
  if (form.frequency === 'WEEKLY') {
    return {
      mode: 'FIXED_SCHEDULE',
      schedule: {
        frequency: 'WEEKLY',
        interval: form.interval,
        byWeekday: form.byWeekday,
      },
    };
  }
  const anchor: MonthlyAnchor =
    form.anchorKind === 'DAY_OF_MONTH'
      ? { kind: 'DAY_OF_MONTH', day: form.anchorDay }
      : form.anchorKind === 'LAST_DAY'
        ? { kind: 'LAST_DAY' }
        : form.anchorKind === 'NTH_WEEKDAY'
          ? {
              kind: 'NTH_WEEKDAY',
              nth: form.anchorNth,
              weekday: form.anchorWeekday,
            }
          : { kind: 'LAST_WEEKDAY', weekday: form.anchorWeekday };
  return {
    mode: 'FIXED_SCHEDULE',
    schedule: {
      frequency: 'MONTHLY',
      interval: form.interval,
      monthlyAnchor: anchor,
    },
  };
}

/** True when `day` is the only weekday selected. */
export function isOnlyWeekday(days: Weekday[], day: Weekday): boolean {
  return days.length === 1 && days[0] === day;
}

/**
 * Toggles a weekday in a rule's set. A weekly rule needs at least one day, so
 * removing the last one is a no-op: the set can never be emptied, and `ruleOf`
 * never has to silently rewrite it (which would leave the form dirty).
 */
export function toggleWeekday(days: Weekday[], day: Weekday): Weekday[] {
  if (!days.includes(day)) {
    return [...days, day];
  }
  if (isOnlyWeekday(days, day)) {
    return days;
  }
  return days.filter((value) => value !== day);
}

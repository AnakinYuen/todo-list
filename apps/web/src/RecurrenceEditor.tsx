import {
  Frequency,
  MAX_RECURRENCE_INTERVAL,
  RecurrenceMode,
  RecurrenceUnit,
  Weekday,
  weekdays,
  type Frequency as FrequencyType,
  type MonthlyAnchor,
  type RecurrenceUnit as RecurrenceUnitType,
  type Weekday as WeekdayType,
} from '@todo-list/shared';
import {
  NO_RECURRENCE,
  isOnlyWeekday,
  toggleWeekday,
  type ModeChoice,
  type RuleForm,
} from './recurrenceForm';

const modeLabels: Record<ModeChoice, string> = {
  NONE: 'Does not repeat',
  AFTER_COMPLETION: 'After completion',
  FIXED_SCHEDULE: 'On a schedule',
};

const unitLabels: Record<RecurrenceUnitType, string> = {
  DAYS: 'day(s)',
  WEEKS: 'week(s)',
  MONTHS: 'month(s)',
};

export interface RecurrenceEditorProps {
  form: RuleForm;
  onChange: (form: RuleForm) => void;
  disabled?: boolean;
}

const anchorKinds: Array<{ value: MonthlyAnchor['kind']; label: string }> = [
  { value: 'DAY_OF_MONTH', label: 'On day of month' },
  { value: 'LAST_DAY', label: 'On the last day' },
  { value: 'NTH_WEEKDAY', label: 'On the nth weekday' },
  { value: 'LAST_WEEKDAY', label: 'On the last weekday' },
];

export function RecurrenceEditor({
  form,
  onChange,
  disabled = false,
}: RecurrenceEditorProps) {
  function update(patch: Partial<RuleForm>): void {
    onChange({ ...form, ...patch });
  }

  return (
    <fieldset className="recurrence" disabled={disabled}>
      <legend>Recurrence</legend>
      <label>
        Repeats
        <select
          value={form.mode}
          disabled={disabled}
          onChange={(event) =>
            update({ mode: event.target.value as ModeChoice })
          }
        >
          {([NO_RECURRENCE, ...RecurrenceMode.options] as ModeChoice[]).map(
            (mode) => (
              <option key={mode} value={mode}>
                {modeLabels[mode]}
              </option>
            ),
          )}
        </select>
      </label>

      {form.mode === 'AFTER_COMPLETION' ? (
        <label>
          Every
          <input
            type="number"
            min={1}
            max={MAX_RECURRENCE_INTERVAL}
            value={form.interval}
            disabled={disabled}
            onChange={(event) =>
              update({ interval: Number(event.target.value) || 1 })
            }
          />
          <select
            aria-label="Unit"
            value={form.unit}
            disabled={disabled}
            onChange={(event) =>
              update({ unit: event.target.value as RecurrenceUnitType })
            }
          >
            {RecurrenceUnit.options.map((unit) => (
              <option key={unit} value={unit}>
                {unitLabels[unit]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {form.mode === 'FIXED_SCHEDULE' ? (
        <>
          <label>
            On a schedule, every
            <input
              type="number"
              min={1}
              max={MAX_RECURRENCE_INTERVAL}
              value={form.interval}
              disabled={disabled}
              onChange={(event) =>
                update({ interval: Number(event.target.value) || 1 })
              }
            />
            <select
              aria-label="Frequency"
              value={form.frequency}
              disabled={disabled}
              onChange={(event) =>
                update({ frequency: event.target.value as FrequencyType })
              }
            >
              {Frequency.options.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0) + option.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>

          {form.frequency === 'WEEKLY' ? (
            <div className="weekdays">
              {Weekday.options.map((day) => (
                <label key={day} className="weekday">
                  <input
                    type="checkbox"
                    checked={form.byWeekday.includes(day)}
                    disabled={disabled || isOnlyWeekday(form.byWeekday, day)}
                    onChange={() =>
                      update({ byWeekday: toggleWeekday(form.byWeekday, day) })
                    }
                  />
                  {weekdays[day].slice(0, 3)}
                </label>
              ))}
            </div>
          ) : null}

          {form.frequency === 'MONTHLY' ? (
            <>
              <label>
                Anchor
                <select
                  value={form.anchorKind}
                  disabled={disabled}
                  onChange={(event) =>
                    update({
                      anchorKind: event.target.value as MonthlyAnchor['kind'],
                    })
                  }
                >
                  {anchorKinds.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {form.anchorKind === 'DAY_OF_MONTH' ? (
                <label>
                  Day
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.anchorDay}
                    disabled={disabled}
                    onChange={(event) =>
                      update({ anchorDay: Number(event.target.value) || 1 })
                    }
                  />
                </label>
              ) : null}
              {form.anchorKind === 'NTH_WEEKDAY' ? (
                <label>
                  Which
                  <select
                    value={form.anchorNth}
                    disabled={disabled}
                    onChange={(event) =>
                      update({ anchorNth: Number(event.target.value) })
                    }
                  >
                    {[1, 2, 3, 4].map((nth) => (
                      <option key={nth} value={nth}>
                        {nth}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {form.anchorKind === 'NTH_WEEKDAY' ||
              form.anchorKind === 'LAST_WEEKDAY' ? (
                <label>
                  Weekday
                  <select
                    value={form.anchorWeekday}
                    disabled={disabled}
                    onChange={(event) =>
                      update({
                        anchorWeekday: event.target.value as WeekdayType,
                      })
                    }
                  >
                    {Weekday.options.map((day) => (
                      <option key={day} value={day}>
                        {weekdays[day]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}

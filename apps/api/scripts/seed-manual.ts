import type {
  RecurrenceRule,
  TodoPriority,
  TodoStatus,
} from '@todo-list/shared';
import { todoDependencies, todos } from '../src/db/schema';
import { createDatabase, createPool } from '../src/db/pool';

/**
 * A larger, deliberately varied dataset for MANUAL testing (~70 TODOs): a spread
 * of Status/Priority/due dates for filtering, sorting and 3-page pagination;
 * several Dependency shapes (chain, diamond, fan-in hub, blocked, all-satisfied);
 * recurring Occurrences in both modes plus an already-spawned series; and the
 * archived dispositions.
 *
 * It truncates first, so it REPLACES whatever is in the database. Run it against
 * the same database your API points at:
 *
 *   # on the host, using the compose stack from the README
 *   docker compose --profile tools run --rm --build seed \
 *     pnpm --filter @todo-list/api seed:manual
 *
 *   # inside the devcontainer (DATABASE_URL is already set)
 *   pnpm --filter @todo-list/api seed:manual
 *
 * The small demo set is still `pnpm --filter @todo-list/api seed` (or
 * `docker compose --profile tools run --rm --build seed`).
 */

const DAY = 86_400_000;
const iso = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

interface SeedRow {
  name: string;
  description?: string;
  dueDate?: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  /** Sets `completedAt`, so the row reads as a genuine completion. */
  completed?: boolean;
  /** Sets `spawnedAt`, for a recurring occurrence that already spawned. */
  spawned?: boolean;
  recurrence?: RecurrenceRule;
  seriesId?: string;
}

const HABIT: RecurrenceRule = {
  mode: 'AFTER_COMPLETION',
  interval: 3,
  unit: 'DAYS',
};
const DAILY: RecurrenceRule = {
  mode: 'AFTER_COMPLETION',
  interval: 1,
  unit: 'DAYS',
};
const WEEKLY_MONDAY: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: { frequency: 'WEEKLY', interval: 1, byWeekday: ['MO'] },
};
const MONTHLY_LAST_DAY: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: {
    frequency: 'MONTHLY',
    interval: 1,
    monthlyAnchor: { kind: 'LAST_DAY' },
  },
};

async function main(): Promise<void> {
  const pool = createPool();
  try {
    const db = createDatabase(pool);

    await db.transaction(async (tx) => {
      await tx.execute('truncate table todos restart identity cascade');

      const habitSeries = crypto.randomUUID();
      const weeklySeries = crypto.randomUUID();
      const monthlySeries = crypto.randomUUID();
      const historySeries = crypto.randomUUID();

      const rows: SeedRow[] = [
        // Dependency chain: review -> write -> draft.
        {
          name: 'Chain: draft the schema',
          priority: 'MEDIUM',
          status: 'NOT_STARTED',
          dueDate: iso(6),
        },
        {
          name: 'Chain: write the migration',
          priority: 'MEDIUM',
          status: 'NOT_STARTED',
          dueDate: iso(7),
        },
        {
          name: 'Chain: review the migration',
          priority: 'HIGH',
          status: 'NOT_STARTED',
          dueDate: iso(8),
        },

        // Diamond: join depends on left+right, both on base.
        {
          name: 'Diamond: base',
          priority: 'LOW',
          status: 'NOT_STARTED',
          dueDate: iso(4),
        },
        {
          name: 'Diamond: left branch',
          priority: 'MEDIUM',
          status: 'NOT_STARTED',
          dueDate: iso(5),
        },
        {
          name: 'Diamond: right branch',
          priority: 'MEDIUM',
          status: 'NOT_STARTED',
          dueDate: iso(5),
        },
        {
          name: 'Diamond: join',
          priority: 'HIGH',
          status: 'NOT_STARTED',
          dueDate: iso(9),
        },

        // Fan-in hub: one TODO with five dependents.
        {
          name: 'Hub: release checklist',
          priority: 'HIGH',
          status: 'NOT_STARTED',
          dueDate: iso(14),
        },
        ...['1', '2', '3', '4', '5'].map((n) => ({
          name: `Hub dependent ${n}`,
          priority: 'MEDIUM' as const,
          status: 'NOT_STARTED' as const,
          dueDate: iso(15),
        })),

        // Blocked and overdue.
        {
          name: 'Overdue: renew TLS certificate',
          description: 'A late prerequisite.',
          priority: 'HIGH',
          status: 'NOT_STARTED',
          dueDate: iso(-7),
        },
        {
          name: 'Waiting on overdue prerequisite',
          priority: 'HIGH',
          status: 'NOT_STARTED',
          dueDate: iso(2),
        },
        {
          name: 'Blocked by two things',
          priority: 'MEDIUM',
          status: 'NOT_STARTED',
          dueDate: iso(3),
        },

        // Satisfied prerequisites, so some dependents are actionable.
        {
          name: 'Done prerequisite A',
          priority: 'LOW',
          status: 'COMPLETED',
          completed: true,
          dueDate: iso(-4),
        },
        {
          name: 'Done prerequisite B',
          priority: 'LOW',
          status: 'COMPLETED',
          completed: true,
          dueDate: iso(-3),
        },
        {
          name: 'Done prerequisite C',
          priority: 'LOW',
          status: 'COMPLETED',
          completed: true,
          dueDate: iso(-2),
        },
        {
          name: 'All prerequisites met (In Progress)',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          dueDate: iso(1),
        },
        {
          name: 'Ready to start (deps met)',
          priority: 'MEDIUM',
          status: 'NOT_STARTED',
          dueDate: iso(5),
        },
        {
          name: 'Has five dependencies',
          priority: 'LOW',
          status: 'NOT_STARTED',
          dueDate: iso(20),
        },

        // Recurrence: both modes, plus a series that already spawned.
        {
          name: 'Habit: water the plants',
          description: 'Repeats 3 days after each completion.',
          priority: 'LOW',
          status: 'NOT_STARTED',
          dueDate: iso(0),
          recurrence: HABIT,
          seriesId: habitSeries,
        },
        {
          name: 'Weekly team sync',
          description: 'Every Monday.',
          priority: 'MEDIUM',
          status: 'NOT_STARTED',
          dueDate: iso(3),
          recurrence: WEEKLY_MONDAY,
          seriesId: weeklySeries,
        },
        {
          name: 'Rent: last day of month',
          priority: 'HIGH',
          status: 'NOT_STARTED',
          dueDate: iso(10),
          recurrence: MONTHLY_LAST_DAY,
          seriesId: monthlySeries,
        },
        {
          name: 'Daily standup (completed)',
          priority: 'LOW',
          status: 'COMPLETED',
          completed: true,
          spawned: true,
          dueDate: iso(-1),
          recurrence: DAILY,
          seriesId: historySeries,
        },
        {
          name: 'Daily standup (next occurrence)',
          priority: 'LOW',
          status: 'NOT_STARTED',
          dueDate: iso(1),
          recurrence: DAILY,
          seriesId: historySeries,
        },

        // Dispositions and odds.
        {
          name: 'Archived spike (never completed)',
          priority: 'LOW',
          status: 'ARCHIVED',
        },
        {
          name: 'Archived: shipped v0',
          description:
            'Completed, then archived; still satisfies Dependencies.',
          priority: 'LOW',
          status: 'ARCHIVED',
          completed: true,
          dueDate: iso(-10),
        },
        {
          name: 'Someday/maybe: read the RFC end to end',
          priority: 'LOW',
          status: 'NOT_STARTED',
          dueDate: null,
        },
        {
          name: 'Completed one-off: spike on rrule',
          priority: 'MEDIUM',
          status: 'COMPLETED',
          completed: true,
          dueDate: iso(-5),
        },
      ];

      // Generated volume: 3 pages at the default limit of 20.
      const statuses: TodoStatus[] = [
        'NOT_STARTED',
        'IN_PROGRESS',
        'COMPLETED',
        'ARCHIVED',
      ];
      const priorities: TodoPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
      for (let i = 1; i <= 40; i += 1) {
        const status = statuses[i % statuses.length]!;
        rows.push({
          name: `Manual ${String(i).padStart(2, '0')}`,
          description: `Generated row ${i} for filter/sort/pagination testing.`,
          priority: priorities[i % priorities.length]!,
          status,
          completed: status === 'COMPLETED',
          dueDate: i % 6 === 0 ? null : iso(-12 + i * 2),
        });
      }

      const inserted = await tx
        .insert(todos)
        .values(
          rows.map((row) => ({
            name: row.name,
            description: row.description ?? null,
            dueDate: row.dueDate ?? null,
            priority: row.priority,
            status: row.status,
            completedAt: row.completed ? new Date() : null,
            spawnedAt: row.spawned ? new Date() : null,
            recurrence: row.recurrence ?? null,
            seriesId: row.seriesId ?? null,
          })),
        )
        .returning({ id: todos.id, name: todos.name });

      const byName = new Map(inserted.map((row) => [row.name, row.id]));
      const idOf = (name: string): string => {
        const id = byName.get(name);
        if (!id) {
          throw new Error(`seed-manual: no TODO named "${name}"`);
        }
        return id;
      };

      const edges: Array<{ dependentId: string; dependencyId: string }> = [];
      const depend = (dependent: string, dependency: string): void => {
        edges.push({
          dependentId: idOf(dependent),
          dependencyId: idOf(dependency),
        });
      };

      depend('Chain: write the migration', 'Chain: draft the schema');
      depend('Chain: review the migration', 'Chain: write the migration');

      depend('Diamond: left branch', 'Diamond: base');
      depend('Diamond: right branch', 'Diamond: base');
      depend('Diamond: join', 'Diamond: left branch');
      depend('Diamond: join', 'Diamond: right branch');

      for (const n of ['1', '2', '3', '4', '5']) {
        depend(`Hub dependent ${n}`, 'Hub: release checklist');
      }

      depend(
        'Waiting on overdue prerequisite',
        'Overdue: renew TLS certificate',
      );
      depend('Blocked by two things', 'Overdue: renew TLS certificate');
      depend('Blocked by two things', 'Hub: release checklist');

      depend('All prerequisites met (In Progress)', 'Done prerequisite A');
      depend('All prerequisites met (In Progress)', 'Done prerequisite B');
      depend('All prerequisites met (In Progress)', 'Done prerequisite C');
      depend('Ready to start (deps met)', 'Done prerequisite A');

      for (const n of ['1', '2', '3', '4', '5']) {
        depend('Has five dependencies', `Hub dependent ${n}`);
      }

      await tx.insert(todoDependencies).values(edges).onConflictDoNothing();

      console.log(
        `Seeded ${inserted.length} manual-test TODOs and ${edges.length} Dependencies`,
      );
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

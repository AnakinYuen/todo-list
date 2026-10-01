import { todoDependencies, todos } from '../src/db/schema';
import { createDatabase, createPool } from '../src/db/pool';

/**
 * Seeds a small, coherent demo list for local development and the live demo:
 * a recurring routine, a blocker chain, and a couple of one-offs. Idempotent —
 * it starts from an empty list.
 */
async function main(): Promise<void> {
  const pool = createPool();
  try {
    const db = createDatabase(pool);

    await db.transaction(async (tx) => {
      await tx.execute('truncate table todos restart identity cascade');

      const seriesId = crypto.randomUUID();
      const inserted = await tx
        .insert(todos)
        .values([
          {
            name: 'Weekly team sync',
            description: 'Agree the week ahead and unblock each other.',
            dueDate: '2027-01-04',
            priority: 'MEDIUM',
            status: 'NOT_STARTED',
            recurrence: {
              mode: 'FIXED_SCHEDULE',
              schedule: {
                frequency: 'WEEKLY',
                interval: 1,
                byWeekday: ['MO'],
              },
            },
            seriesId,
          },
          {
            name: 'Write the decision log',
            description: 'Interpretations, trade-offs and what was not built.',
            dueDate: '2027-01-15',
            priority: 'HIGH',
            status: 'IN_PROGRESS',
          },
          {
            name: 'Get design approval',
            dueDate: '2027-01-10',
            priority: 'HIGH',
            status: 'NOT_STARTED',
          },
          {
            name: 'Ship the demo',
            dueDate: '2027-02-01',
            priority: 'MEDIUM',
            status: 'NOT_STARTED',
          },
          {
            name: 'Old spikes',
            description: 'Archived: no longer part of the plan.',
            priority: 'LOW',
            status: 'ARCHIVED',
          },
        ])
        .returning({ id: todos.id, name: todos.name });

      const byName = new Map(inserted.map((row) => [row.name, row.id]));
      const dependsOn = (name: string) => byName.get(name)!;

      await tx.insert(todoDependencies).values([
        {
          dependentId: dependsOn('Ship the demo'),
          dependencyId: dependsOn('Get design approval'),
        },
      ]);

      console.log(`Seeded ${inserted.length} demo TODOs`);
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

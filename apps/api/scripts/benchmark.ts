import { performance } from 'node:perf_hooks';
import type { ListTodosParams } from '@todo-list/shared';
import { DbService } from '../src/db/db.service';
import { TodosService } from '../src/todos/todos.service';
import { seedScaleData } from '../test/support/scale-fixture';

/**
 * A non-gating wall-clock benchmark over the seeded ~10k list. Timing assertions
 * flake on shared runners, so this never runs as a test and never fails a build:
 * it prints p50/p95 per scenario for a human to compare. The deterministic
 * properties (index scans, query counts) gate in `test/scale`.
 *
 *   pnpm --filter @todo-list/api benchmark
 *
 * Runs against the derived test database and leaves it truncated.
 */

const SCENARIOS: Array<{ label: string; params: ListTodosParams }> = [
  {
    label: 'default (dueDate asc, 20)',
    params: {
      includeDeleted: false,
      overdue: false,
      sort: 'dueDate',
      order: 'asc',
      limit: 20,
    },
  },
  {
    label: 'status ARCHIVED (20)',
    params: {
      includeDeleted: false,
      overdue: false,
      status: 'ARCHIVED',
      sort: 'dueDate',
      order: 'asc',
      limit: 20,
    },
  },
  {
    label: 'blocked=true (20)',
    params: {
      includeDeleted: false,
      overdue: false,
      blocked: true,
      sort: 'dueDate',
      order: 'asc',
      limit: 20,
    },
  },
  {
    label: 'priority HIGH (100)',
    params: {
      includeDeleted: false,
      overdue: false,
      priority: 'HIGH',
      sort: 'priority',
      order: 'asc',
      limit: 100,
    },
  },
];

const WARMUP = 5;
const ITERATIONS = 50;

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.floor(fraction * sorted.length),
  );
  return sorted[index] ?? 0;
}

function benchmarkDatabaseUrl(): string {
  const base = process.env.BENCHMARK_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) {
    return 'postgres://postgres:postgres@localhost:5432/todo-list_test';
  }
  const url = new URL(base);
  url.pathname = '/todo-list_test';
  return url.toString();
}

async function main(): Promise<void> {
  process.env.DATABASE_URL = benchmarkDatabaseUrl();

  const dbService = new DbService();
  const service = new TodosService(dbService);

  try {
    await seedScaleData(dbService.pool);

    console.log(
      `\nTODOs: ~10,000 | iterations: ${ITERATIONS} (+${WARMUP} warmup)\n`,
    );
    console.log(
      'scenario'.padEnd(28),
      'p50'.padStart(10),
      'p95'.padStart(10),
      'max'.padStart(10),
    );

    for (const scenario of SCENARIOS) {
      for (let i = 0; i < WARMUP; i += 1) {
        await service.list(scenario.params);
      }

      const durations: number[] = [];
      for (let i = 0; i < ITERATIONS; i += 1) {
        const start = performance.now();
        await service.list(scenario.params);
        durations.push(performance.now() - start);
      }

      durations.sort((a, b) => a - b);
      const ms = (value: number) => `${value.toFixed(2)}ms`;
      console.log(
        scenario.label.padEnd(28),
        ms(percentile(durations, 0.5)).padStart(10),
        ms(percentile(durations, 0.95)).padStart(10),
        ms(durations.at(-1) ?? 0).padStart(10),
      );
    }

    console.log(
      '\nNumbers depend on hardware and are for comparison, not gating.\n',
    );
  } finally {
    await dbService.pool.query('truncate table todos restart identity cascade');
    await dbService.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

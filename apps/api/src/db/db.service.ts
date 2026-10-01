import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import { createDatabase, createPool, type Database } from './pool';

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool = createPool();
  readonly db: Database = createDatabase(this.pool);

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }
}

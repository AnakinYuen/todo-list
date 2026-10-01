import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { TodosModule } from './todos/todos.module';

@Module({
  imports: [DbModule, HealthModule, TodosModule],
})
export class AppModule {}

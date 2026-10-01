export const DEFAULT_DATABASE_URL =
  'postgres://postgres:postgres@localhost:5432/todo-list_db';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  corsOrigins: true | string[];
}

export function loadConfig(): AppConfig {
  const cors = process.env.CORS_ORIGINS ?? '*';
  return {
    port: Number(process.env.PORT ?? 8000),
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    corsOrigins:
      cors === '*' ? true : cors.split(',').map((origin) => origin.trim()),
  };
}

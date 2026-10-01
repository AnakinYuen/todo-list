import { DEFAULT_DATABASE_URL } from './src/config';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  },
} as const;

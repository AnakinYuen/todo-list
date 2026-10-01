import 'reflect-metadata';
import { createApp } from './app.factory';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const { port } = loadConfig();
  await app.listen({ port, host: '0.0.0.0' });
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

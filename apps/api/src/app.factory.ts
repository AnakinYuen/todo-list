import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { UniqueViolationFilter } from './common/unique-violation.filter';
import { loadConfig } from './config';

export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new UniqueViolationFilter(app.getHttpAdapter()));

  const config = loadConfig();
  app.enableCors({ origin: config.corsOrigins });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('TODO list API')
      .setDescription('A single, shared TODO list.')
      .setVersion('1.0')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);

  return app;
}

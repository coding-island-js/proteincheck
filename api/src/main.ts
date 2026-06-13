import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // NestJS running on the Fastify platform adapter (not Express).
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 12 * 1024 * 1024 }), // allow base64 image payloads
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGIN || '*').split(','),
    methods: ['GET', 'POST'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Protein Check API')
    .setDescription('Estimate the protein in a meal from a single photo.')
    .setVersion('1.0.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Protein Check API on :${port}  (OpenAPI docs at /docs)`);
}
void bootstrap();

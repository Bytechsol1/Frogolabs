import './config/load-env';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { createCorsOptions } from './config/cors';

async function bootstrap() {
  // rawBody: true is required so the Terra webhook handler can verify Terra's
  // HMAC signature over the exact raw request bytes (see terra.controller.ts).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');
  // The local ngrok agent forwards the original HTTPS protocol from loopback.
  app.set('trust proxy', 'loopback');
  app.enableCors(createCorsOptions());
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  await app.listen(port);
  console.log(`Frigo Flow API listening at http://localhost:${port}/api/v1`);
}
bootstrap();

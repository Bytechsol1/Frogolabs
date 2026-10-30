import './config/load-env';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { createCorsOptions } from './config/cors';

async function bootstrap() {
  // rawBody: true is required so the Terra webhook handler can verify Terra's
  // HMAC signature over the exact raw request bytes (see terra.controller.ts).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'uploads/lab-results/:filename', method: RequestMethod.GET }] });
  // The local ngrok agent forwards the original HTTPS protocol from loopback.
  app.set('trust proxy', 'loopback');
  app.enableCors(createCorsOptions());
  app.use((request, response, next) => {
    if (request.headers.authorization) response.setHeader('Cache-Control', 'private, no-store');
    next();
  });
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  await app.listen(port);
  console.log(`Frigo Flow API listening at http://localhost:${port}/api/v1`);
}
bootstrap();

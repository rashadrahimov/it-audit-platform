import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { env } from './env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // корректно гасит BullMQ-worker при перезапуске

  // OpenAPI — Mandatory-требование RFP (INT-01, API-first): спека растёт вместе с API.
  // T-OPS04: в production /docs и /docs-json закрыты (карта всей поверхности API),
  // включаются явным SWAGGER_ENABLED=true.
  if (env.swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('IT Audit Platform API')
      .setVersion('0.0.1')
      .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'api-key')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  } else {
    console.log('OpenAPI выключен (SWAGGER_ENABLED=true — чтобы включить)');
  }

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ErrorResponseDto } from './common/dto/error-response.dto.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import type { Env } from './config/env.validation.js';

const API_PREFIX = 'api/v1';
const DOCS_PATH = 'docs';
const API_TITLE = 'Food Ordering API';
const API_VERSION = '1.0';
const REQUEST_BODY_LIMIT = '100kb';

function setupSwagger(app: INestApplication): void {
  const options = new DocumentBuilder()
    .setTitle(API_TITLE)
    .setVersion(API_VERSION)
    .addBearerAuth()
    .addGlobalResponse({
      status: 'default',
      description: 'Every error has this shape',
      type: ErrorResponseDto,
    })
    .build();
  SwaggerModule.setup(
    DOCS_PATH,
    app,
    SwaggerModule.createDocument(app, options),
  );
}

export function setupApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });
  app.useBodyParser('json', { limit: REQUEST_BODY_LIMIT });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  setupSwagger(app);
}

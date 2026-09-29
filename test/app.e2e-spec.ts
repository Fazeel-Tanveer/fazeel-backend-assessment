import { Body, Controller, Get, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Throttle } from '@nestjs/throttler';
import { IsString } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { CurrentUser } from '../src/common/decorators/current-user.decorator.js';
import { Public } from '../src/common/decorators/public.decorator.js';
import { Roles } from '../src/common/decorators/roles.decorator.js';
import type { AuthUser } from '../src/common/types/auth-user.js';
import { Role } from '../src/generated/prisma/enums.js';

const USER_ID = '01920000-0000-7000-8000-000000000200';
const OVERSIZED_BODY_BYTES = 200 * 1024;

class ProbeDto {
  @IsString()
  name: string;
}

@Controller('probe')
class ProbeController {
  @Public()
  @Post()
  echo(@Body() dto: ProbeDto) {
    return dto;
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 2, ttl: 5_000 } })
  @Get('limited')
  limited() {
    return { ok: true };
  }
}

describe('App (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let jwt: JwtService;

  const tokenFor = (role: Role) => jwt.signAsync({ sub: USER_ID, role });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    server = app.getHttpServer();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the database and redis as healthy', async () => {
    const response = await request(server).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('serves the swagger ui', async () => {
    await request(server)
      .get('/docs')
      .expect(200)
      .expect('content-type', /html/);
  });

  it('documents the error body for every route', async () => {
    const response = await request(server).get('/docs-json').expect(200);

    expect(response.body).toHaveProperty([
      'components',
      'schemas',
      'ErrorResponseDto',
    ]);
    expect(response.body).toHaveProperty([
      'paths',
      '/api/v1/orders',
      'post',
      'responses',
      'default',
    ]);
  });

  it('sets security headers and a request id', async () => {
    const response = await request(server).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('rejects unknown body fields', async () => {
    const response = await request(server)
      .post('/api/v1/probe')
      .send({ name: 'wings', role: 'ADMIN' })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      message: ['property role should not exist'],
      error: 'Bad Request',
    });
  });

  it('rejects a body over the size limit', async () => {
    const response = await request(server)
      .post('/api/v1/probe')
      .send({ name: 'x'.repeat(OVERSIZED_BODY_BYTES) });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ error: 'Payload Too Large' });
  });

  it('returns the standard error shape for unknown routes', async () => {
    const response = await request(server).get('/api/v1/missing').expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      message: 'Cannot GET /api/v1/missing',
      error: 'Not Found',
    });
  });

  it('rejects protected routes without a token', async () => {
    await request(server).get('/api/v1/probe/me').expect(401);
  });

  it('returns the current user for a valid token', async () => {
    const token = await tokenFor(Role.USER);

    const response = await request(server)
      .get('/api/v1/probe/me')
      .auth(token, { type: 'bearer' })
      .expect(200);

    expect(response.body).toEqual({ id: USER_ID, role: Role.USER });
  });

  it('forbids admin routes for regular users', async () => {
    const token = await tokenFor(Role.USER);

    const response = await request(server)
      .get('/api/v1/probe/admin')
      .auth(token, { type: 'bearer' });

    expect(response.status).toBe(403);
  });

  it('allows admin routes for admins', async () => {
    const token = await tokenFor(Role.ADMIN);

    const response = await request(server)
      .get('/api/v1/probe/admin')
      .auth(token, { type: 'bearer' });

    expect(response.body).toEqual({ ok: true });
  });

  it('rate limits a client that goes over the limit', async () => {
    await request(server).get('/api/v1/probe/limited').expect(200);
    await request(server).get('/api/v1/probe/limited').expect(200);

    const response = await request(server)
      .get('/api/v1/probe/limited')
      .expect(429);

    expect(response.body).toMatchObject({ statusCode: 429 });
  });
});

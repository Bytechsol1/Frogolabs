import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createCorsOptions } from './cors';

@Controller('probe')
class ProbeController {
  @Get()
  get() { return { ok: true }; }
}

describe('Backend browser CORS', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = module.createNestApplication();
    app.enableCors(createCorsOptions({ NODE_ENV: 'development', CORS_ORIGINS: 'https://frontend.example/' }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it.each(['https://frontend.example', 'http://localhost:3000', 'http://127.0.0.1:3000'])(
    'allows the configured origin %s without cookie credentials', async origin => {
      const response = await request(app.getHttpServer()).get('/probe').set('Origin', origin).expect(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    },
  );
  it('allows bearer-token preflights', async () => {
    const response = await request(app.getHttpServer()).options('/probe')
      .set('Origin', 'https://frontend.example').set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,ngrok-skip-browser-warning').expect(204);
    expect(response.headers['access-control-allow-headers'].toLowerCase()).toContain('authorization');
  });
  it('does not grant an unknown origin access', async () => {
    const response = await request(app.getHttpServer()).get('/probe').set('Origin', 'https://frontend.example.attacker.test').expect(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('accepts requests without Origin from server proxies and webhook clients', async () => {
    await request(app.getHttpServer()).get('/probe').expect(200, { ok: true });
  });
  it.each(['*', 'https://*.example', 'https://frontend.example/path', 'https://user:password@frontend.example'])(
    'rejects an unsafe configured origin %s', origin => {
      expect(() => createCorsOptions({ CORS_ORIGINS: origin })).toThrow();
    },
  );
  it('does not automatically allow localhost in production', () => {
    const options = createCorsOptions({ NODE_ENV: 'production', CORS_ORIGINS: 'https://frontend.example' });
    const callback = jest.fn();
    if (typeof options.origin !== 'function') throw new Error('Expected origin callback');
    options.origin('http://localhost:3000', callback);
    expect(callback).toHaveBeenCalledWith(null, false);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Logs API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/logs/sessions (GET) - should return sessions', () => {
    return request(app.getHttpServer())
      .get('/api/logs/sessions')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('sessions');
        expect(res.body).toHaveProperty('total');
        expect(Array.isArray(res.body.sessions)).toBe(true);
      });
  });

  it('/api/logs/sessions/:logId (GET) - should return session details', async () => {
    // First get sessions to find a valid logId
    const sessionsRes = await request(app.getHttpServer()).get(
      '/api/logs/sessions',
    );

    if (sessionsRes.body.sessions.length === 0) {
      console.log('No sessions in log file, skipping test');
      return;
    }

    const logId = sessionsRes.body.sessions[0].logId;

    return request(app.getHttpServer())
      .get(`/api/logs/sessions/${logId}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('logId', logId);
        expect(res.body).toHaveProperty('entries');
        expect(Array.isArray(res.body.entries)).toBe(true);
      });
  });

  it('/api/logs/sessions/:logId (GET) - should return 404 for invalid logId', () => {
    return request(app.getHttpServer())
      .get('/api/logs/sessions/invalid-log-id-that-does-not-exist')
      .expect(404);
  });
});

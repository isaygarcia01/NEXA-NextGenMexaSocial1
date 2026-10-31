import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import S3rver from 's3rver';
import type { INestApplication } from '@nestjs/common';

describe('NEXA API (e2e)', () => {
  let app: INestApplication;
  let database: PGlite;
  let databaseServer: PGLiteSocketServer;
  let objectServer: InstanceType<typeof S3rver>;
  let objectDirectory: string;
  let verificationToken = '';
  let resetToken = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55439/nexa_test';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-that-is-long-enough';
    process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
    process.env.REFRESH_TOKEN_TTL_DAYS = '30';
    process.env.S3_BUCKET = 'nexa-test';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ACCESS_KEY = 'S3RVER';
    process.env.S3_SECRET_KEY = 'S3RVER_SECRET';
    process.env.MAX_UPLOAD_BYTES = '10000000';
    process.env.TRUST_PROXY = 'false';

    database = new PGlite();
    databaseServer = new PGLiteSocketServer({ db: database, port: 55439, host: '127.0.0.1' });
    await databaseServer.start();
    objectDirectory = await mkdtemp(join(tmpdir(), 'nexa-s3-test-'));
    objectServer = new S3rver({
      address: '127.0.0.1',
      port: 4568,
      silent: true,
      directory: objectDirectory,
    });
    await objectServer.run();
    process.env.S3_ENDPOINT = 'http://127.0.0.1:4568';
    process.env.S3_PUBLIC_ENDPOINT = 'http://127.0.0.1:4568';
    process.env.S3_PUBLIC_URL = 'http://127.0.0.1:4568/nexa-test';

    const cacheValues = new Map<string, string>();
    const rateCounts = new Map<string, number>();
    const cache = {
      client: {
        get: async (key: string) => cacheValues.get(key) ?? null,
        set: async (key: string, value: string) => { cacheValues.set(key, value); return 'OK'; },
        del: async (...keys: string[]) => keys.reduce((count, key) => count + Number(cacheValues.delete(key)), 0),
        ping: async () => 'PONG',
      },
      incrementWindow: async (key: string) => {
        const count = (rateCounts.get(key) ?? 0) + 1;
        rateCounts.set(key, count);
        return count;
      },
    };
    const mailer = {
      sendVerification: async (_email: string, token: string) => { verificationToken = token; },
      sendPasswordReset: async (_email: string, token: string) => { resetToken = token; },
    };
    const [{ AppModule }, { CacheService }, { MailerService }, { HttpExceptionFilter }] = await Promise.all([
      import('../src/app.module.js'),
      import('../src/cache/cache.service.js'),
      import('../src/auth/mailer.service.js'),
      import('../src/common/http-exception.filter.js'),
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CacheService).useValue(cache)
      .overrideProvider(MailerService).useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await objectServer?.close();
    await databaseServer?.stop();
    await database?.close();
    if (objectDirectory) await rm(objectDirectory, { recursive: true, force: true });
  }, 120_000);

  it('supports registration, verification, session rotation, social persistence, media and password revocation', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/v1/health').expect(200);
    const registered = await request(server).post('/api/v1/auth/register')
      .send({
        email: 'nexa-user@example.test',
        username: 'nexauser',
        displayName: 'Nexa User',
        password: 'NexaTestPassword#123',
      })
      .expect(201);
    expect(registered.body.emailVerified).toBe(false);
    expect(verificationToken).toBeTruthy();

    await request(server).post('/api/v1/auth/login')
      .send({ email: 'nexa-user@example.test', password: 'NexaTestPassword#123' })
      .expect(401);
    await request(server).post('/api/v1/auth/verify-email')
      .send({ token: 'invalid-verification-token-value-0000000000000000' })
      .expect(401);
    await request(server).post('/api/v1/auth/resend-verification')
      .send({ email: 'missing@example.test' }).expect(200);
    await request(server).post('/api/v1/auth/forgot-password')
      .send({ email: 'missing@example.test' }).expect(200);
    await request(server).post('/api/v1/auth/verify-email')
      .send({ token: verificationToken })
      .expect(200, { verified: true });

    const login = await request(server).post('/api/v1/auth/login')
      .send({ email: 'nexa-user@example.test', password: 'NexaTestPassword#123' })
      .expect(200);
    const originalRefresh = decodeURIComponent(
      (login.headers['set-cookie'] as string[])[0]!.match(/nexa_refresh=([^;]+)/)![1]!,
    );
    const rotated = await request(server).post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefresh })
      .expect(200);
    expect(rotated.body.accessToken).toBeTruthy();
    await request(server).post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefresh })
      .expect(401);

    const accessToken = rotated.body.accessToken as string;
    const auth = { Authorization: `Bearer ${accessToken}` };
    await request(server).post('/api/v1/auth/register')
      .send({
        email: 'private-user@example.test',
        username: 'privateuser',
        displayName: 'Private User',
        password: 'NexaPrivatePassword#123',
      })
      .expect(201);
    const privateVerificationToken = verificationToken;
    await request(server).post('/api/v1/auth/verify-email')
      .send({ token: privateVerificationToken }).expect(200);
    const privateLogin = await request(server).post('/api/v1/auth/login')
      .send({ email: 'private-user@example.test', password: 'NexaPrivatePassword#123' }).expect(200);
    const privateAuth = { Authorization: `Bearer ${privateLogin.body.accessToken as string}` };
    await request(server).patch('/api/v1/profiles/me').set(privateAuth)
      .send({ isPrivate: true }).expect(200);
    await request(server).post('/api/v1/users/privateuser/follow').set(auth)
      .expect(201, { following: false, requestPending: true });
    await request(server).get('/api/v1/users/privateuser')
      .expect(200).expect(({ body }) => expect(body.private).toBe(true));
    const followersPost = await request(server).post('/api/v1/posts').set(privateAuth)
      .send({ body: 'Solo para mi círculo.', visibility: 'public' }).expect(201);
    const ownerOnlyPost = await request(server).post('/api/v1/posts').set(privateAuth)
      .send({ body: 'Solo para mí.', visibility: 'private' }).expect(201);
    const beforeApproval = await request(server).get('/api/v1/users/privateuser/posts')
      .set(auth).expect(200);
    expect(beforeApproval.body).toHaveLength(0);
    await request(server).post(`/api/v1/users/privateuser/follow-requests/${registered.body.user.id}/accept`)
      .set(privateAuth).expect(201, { accepted: true });
    const afterApproval = await request(server).get('/api/v1/users/privateuser/posts')
      .set(auth).expect(200);
    expect(afterApproval.body.map((post: { id: string }) => post.id)).toContain(followersPost.body.id);
    expect(afterApproval.body.map((post: { id: string }) => post.id)).not.toContain(ownerOnlyPost.body.id);
    await request(server).post('/api/v1/users/nexauser/follow').set(auth).expect(403);

    const createdPost = await request(server).post('/api/v1/posts')
      .set(auth).send({ body: 'Una publicación persistente de integración.' }).expect(201);
    const postId = createdPost.body.id as string;
    expect(postId).toBeTruthy();
    await request(server).patch(`/api/v1/posts/${postId}`).set(auth)
      .send({ body: 'Publicación editada y persistida.' }).expect(200);

    await request(server).post(`/api/v1/posts/${postId}/like`).set(auth)
      .expect(201, { liked: true, count: 1 });
    await request(server).post(`/api/v1/posts/${postId}/comments`).set(auth)
      .send({ body: 'Comentario persistente.' }).expect(201);
    await request(server).get(`/api/v1/posts/${postId}/comments`).set(auth)
      .expect(200).expect(({ body }) => expect(body).toHaveLength(1));
    await request(server).post(`/api/v1/posts/${postId}/bookmark`).set(auth)
      .expect(201, { bookmarked: true });
    const timeline = await request(server).get('/api/v1/posts?limit=10').set(auth).expect(200);
    expect(timeline.body.items.some((post: { id: string; body: string }) =>
      post.id === postId && post.body === 'Publicación editada y persistida.',
    )).toBe(true);
    await request(server).post('/api/v1/users/sofia.rios/follow').set(auth)
      .expect(201, { following: true, requestPending: false });
    const followingFeed = await request(server).get('/api/v1/posts?feed=following').set(auth).expect(200);
    expect(followingFeed.body.items.some((post: { username: string }) => post.username === 'sofia.rios')).toBe(true);
    await request(server).delete('/api/v1/users/sofia.rios/follow').set(auth).expect(204);
    await request(server).delete(`/api/v1/posts/${postId}`).set(auth).expect(204);
    const afterDelete = await request(server).get('/api/v1/posts?limit=10').set(auth).expect(200);
    expect(afterDelete.body.items.some((post: { id: string }) => post.id === postId)).toBe(false);

    const { default: sharp } = await import('sharp');
    const image = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 90, g: 70, b: 150 } },
    }).png().toBuffer();
    const upload = await request(server).get(`/api/v1/media/upload-url?mimeType=image/png&size=${image.length}`)
      .set(auth).expect(200);
    const objectUpload = await fetch(upload.body.uploadUrl as string, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: image,
    });
    expect(objectUpload.ok).toBe(true);
    const completed = await request(server).post(`/api/v1/media/${upload.body.mediaId}/complete`)
      .set(auth).expect(201);
    expect(completed.body.mimeType).toBe('image/webp');

    const uploaded = await request(server).post('/api/v1/media/images').set(auth)
      .attach('file', image, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201);
    expect(uploaded.body.mimeType).toBe('image/webp');
    const mediaUrl = await request(server).get(`/api/v1/media/${uploaded.body.id}/url`)
      .set(auth).expect(200);
    expect(mediaUrl.body.url).toContain('X-Amz-Signature=');
    await request(server).patch('/api/v1/profiles/me').set(auth)
      .send({ bio: 'Mi espacio NEXA', avatarMediaId: uploaded.body.id }).expect(200);
    await request(server).get('/api/v1/users/nexauser')
      .expect(200).expect(({ body }) => expect(body.bio).toBe('Mi espacio NEXA'));
    await request(server).patch('/api/v1/profiles/me').set(auth)
      .send({ isPrivate: true }).expect(200);
    await request(server).get('/api/v1/users/nexauser')
      .expect(200).expect(({ body }) => expect(body.bio).toBeNull());
    await request(server).patch('/api/v1/profiles/me').set(auth)
      .send({ isPrivate: false }).expect(200);

    await request(server).get('/api/v1/auth/sessions').set(auth)
      .expect(200).expect(({ body }) => expect(body).toHaveLength(1));

    await request(server).post('/api/v1/auth/forgot-password')
      .send({ email: 'nexa-user@example.test' }).expect(200);
    expect(resetToken).toBeTruthy();
    await request(server).post('/api/v1/auth/reset-password')
      .send({ token: resetToken, password: 'NexaNewPassword#456' }).expect(200);
    await request(server).get('/api/v1/profiles/me').set(auth).expect(401);
    const resetLogin = await request(server).post('/api/v1/auth/login')
      .send({ email: 'nexa-user@example.test', password: 'NexaNewPassword#456' }).expect(200);
    const anotherLogin = await request(server).post('/api/v1/auth/login')
      .send({ email: 'nexa-user@example.test', password: 'NexaNewPassword#456' }).expect(200);
    const resetAuth = { Authorization: `Bearer ${resetLogin.body.accessToken as string}` };
    const anotherAuth = { Authorization: `Bearer ${anotherLogin.body.accessToken as string}` };
    const activeSessions = await request(server).get('/api/v1/auth/sessions').set(anotherAuth).expect(200);
    expect(activeSessions.body).toHaveLength(2);
    await request(server).delete(`/api/v1/auth/sessions/${resetLogin.body.sessionId as string}`)
      .set(anotherAuth).expect(204);
    await request(server).get('/api/v1/profiles/me').set(resetAuth).expect(401);
    await request(server).post('/api/v1/auth/change-password').set(anotherAuth)
      .send({ currentPassword: 'NexaNewPassword#456', newPassword: 'NexaChangedPassword#789' })
      .expect(204);
    await request(server).get('/api/v1/profiles/me').set(anotherAuth).expect(401);
    const logoutLogin = await request(server).post('/api/v1/auth/login')
      .send({ email: 'nexa-user@example.test', password: 'NexaChangedPassword#789' }).expect(200);
    const logoutAuth = { Authorization: `Bearer ${logoutLogin.body.accessToken as string}` };
    await request(server).post('/api/v1/auth/logout').set(logoutAuth).expect(200, { loggedOut: true });
    await request(server).get('/api/v1/profiles/me').set(logoutAuth).expect(401);
  }, 120_000);
});

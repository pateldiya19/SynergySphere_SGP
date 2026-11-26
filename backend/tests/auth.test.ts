import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { EmailVerificationCode, User } from '../src/app/models';
import { EmailService } from '../src/app/services/EmailService';
import { config } from '../src/config';
import { CreateUserDTO } from '../src/app/dto';

describe('Email OTP authentication', () => {
  let app: Express;
  let sentCode = '';

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    sentCode = '';
    jest.spyOn(EmailService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(EmailService, 'sendVerificationCode').mockImplementation(async ({ code }) => {
      sentCode = code;
      return { sent: true };
    });
  });

  const register = (data: CreateUserDTO) => request(app).post('/api/auth/register').send(data);

  const verify = (email: string, code = sentCode) =>
    request(app).post('/api/auth/verify-email').send({ email, code });

  const registerAndVerify = async (email = 'test@example.com') => {
    await register({ name: 'Test User', email, password: 'password123' }).expect(201);
    await verify(email).expect(200);
  };

  it('creates an unverified account and stores only an expiring HMAC digest', async () => {
    const response = await register({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    }).expect(201);

    expect(response.body.data).toMatchObject({
      email: 'john@example.com',
      requiresVerification: true,
    });
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(sentCode).toMatch(/^\d{6}$/);

    const user = await User.findOne({ email: 'john@example.com' });
    const challenge = await EmailVerificationCode.findOne({ email: 'john@example.com' }).select(
      '+codeHash'
    );
    expect(user?.isEmailVerified).toBe(false);
    expect(challenge?.codeHash).toMatch(/^[a-f\d]{64}$/);
    expect(challenge?.codeHash).not.toBe(sentCode);
    expect(challenge?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(challenge?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
  });

  it('does not create an account when SMTP is missing or delivery fails', async () => {
    jest.spyOn(EmailService, 'isConfigured').mockReturnValue(false);
    await register({
      name: 'No SMTP',
      email: 'no-smtp@example.com',
      password: 'password123',
    }).expect(503);
    expect(await User.exists({ email: 'no-smtp@example.com' })).toBeNull();

    jest.spyOn(EmailService, 'isConfigured').mockReturnValue(true);
    const smtpError = 'Invalid login: 535-5.7.8 Username and Password not accepted.';
    jest.spyOn(EmailService, 'sendVerificationCode').mockResolvedValue({
      sent: false,
      error: smtpError,
    });
    const response = await register({
      name: 'Failed Mail',
      email: 'failed@example.com',
      password: 'password123',
    }).expect(503);
    expect(response.body.error).toContain(smtpError);
    expect(await User.exists({ email: 'failed@example.com' })).toBeNull();
    expect(await EmailVerificationCode.exists({ email: 'failed@example.com' })).toBeNull();
  });

  it('rejects duplicate email and malformed registration requests', async () => {
    await User.create({
      name: 'Existing User',
      email: 'existing@example.com',
      password: 'password123',
    });
    await register({
      name: 'Duplicate User',
      email: 'existing@example.com',
      password: 'password123',
    }).expect(409);

    await register({
      name: 'Invalid User',
      email: 'invalid-email',
      password: 'password123',
    }).expect(422);
    await register({ name: 'Invalid User', email: 'valid@example.com', password: '123' }).expect(
      422
    );
  });

  it('requires email verification for login, then issues the existing JWT pair', async () => {
    const email = 'login@example.com';
    await register({ name: 'Login User', email, password: 'password123' }).expect(201);
    await request(app).post('/api/auth/login').send({ email, password: 'password123' }).expect(403);

    await verify(email).expect(200);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    expect(login.body.data.accessToken).toBeDefined();
    expect(login.body.data.refreshToken).toBeDefined();
    expect(login.body.data.user.isEmailVerified).toBe(true);

    const refresh = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(200);
    expect(refresh.body.data.accessToken).toBeDefined();

    const profile = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    expect(profile.body.data.email).toBe(email);
  });

  it('counts invalid OTP attempts, expires codes, and consumes a correct code once', async () => {
    const email = 'attempts@example.com';
    await register({ name: 'Attempt User', email, password: 'password123' }).expect(201);
    await verify(email, '000000').expect(400);
    const challenge = await EmailVerificationCode.findOne({ email });
    expect(challenge?.attempts).toBe(1);

    await verify(email).expect(200);
    await verify(email).expect(400);

    const expiredEmail = 'expired@example.com';
    await register({ name: 'Expired User', email: expiredEmail, password: 'password123' }).expect(
      201
    );
    await EmailVerificationCode.updateOne(
      { email: expiredEmail },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );
    const expired = await verify(expiredEmail).expect(400);
    expect(expired.body.error).toContain('expired');
  });

  it('locks a challenge after five incorrect attempts', async () => {
    const email = 'locked@example.com';
    await register({ name: 'Locked User', email, password: 'password123' }).expect(201);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await verify(email, '000000').expect(400);
    }
    await verify(email, '000000').expect(429);
    expect(await EmailVerificationCode.exists({ email })).toBeNull();
    await request(app).post('/api/auth/login').send({ email, password: 'password123' }).expect(403);
  });

  it('enforces resend cooldown and reports delivery failures without fake success', async () => {
    const email = 'resend@example.com';
    await register({ name: 'Resend User', email, password: 'password123' }).expect(201);
    await request(app).post('/api/auth/resend-verification').send({ email }).expect(429);

    await EmailVerificationCode.updateOne(
      { email },
      { $set: { resendAvailableAt: new Date(Date.now() - 1000) } }
    );
    const smtpError = 'Invalid login: 535-5.7.8 Username and Password not accepted.';
    jest.spyOn(EmailService, 'sendVerificationCode').mockResolvedValue({
      sent: false,
      error: smtpError,
    });
    const response = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email })
      .expect(503);
    expect(response.body.error).toContain(smtpError);
    expect(await EmailVerificationCode.exists({ email })).toBeNull();
  });

  it('rate limits repeated authentication requests from the same IP', async () => {
    const previousEnvironment = config.NODE_ENV;
    config.NODE_ENV = 'development';
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(app)
          .post('/api/auth/resend-verification')
          .send({ email: 'invalid-email' })
          .expect(422);
      }
      const limited = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'invalid-email' })
        .expect(429);
      expect(limited.body.error).toContain('Too many authentication attempts');
    } finally {
      config.NODE_ENV = previousEnvironment;
    }
  });

  it('retains the existing protected-route behavior for verified users', async () => {
    const email = 'profile@example.com';
    await registerAndVerify(email);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    await request(app)
      .post('/api/users/logout')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    await request(app).get('/api/auth/profile').expect(401);
  });
});

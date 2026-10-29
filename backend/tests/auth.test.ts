import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { User } from '../src/app/models';
import { CreateUserDTO } from '../src/app/dto';

describe('Auth Controller', () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData: CreateUserDTO = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'user',
      };

      const response = await request(app).post('/api/auth/register').send(userData).expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.name).toBe(userData.name);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should return error for duplicate email', async () => {
      const userData: CreateUserDTO = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      };

      // Create user first time
      await User.create(userData);

      // Try to create again
      const response = await request(app).post('/api/auth/register').send(userData).expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should validate email format', async () => {
      const userData = {
        name: 'John Doe',
        email: 'invalid-email',
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/register').send(userData).expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should validate password length', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: '123',
      };

      const response = await request(app).post('/api/auth/register').send(userData).expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const userData: CreateUserDTO = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      };

      await request(app).post('/api/auth/register').send(userData);
    });

    it('should login successfully with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/login').send(loginData).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(loginData.email);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should return error for invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const response = await request(app).post('/api/auth/login').send(loginData).expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should return error for non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/login').send(loginData).expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid credentials');
    });
  });

  describe('GET /api/auth/profile', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and login to get access token
      const userData: CreateUserDTO = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      };

      const registerResponse = await request(app).post('/api/auth/register').send(userData);

      accessToken = registerResponse.body.data.accessToken;
    });

    it('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('test@example.com');
      expect(response.body.data.name).toBe('Test User');
    });

    it('should return error without token', async () => {
      const response = await request(app).get('/api/auth/profile').expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('token');
    });

    it('should return error with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('token');
    });
  });
});

import request from 'supertest';
import app from '../../src/app';
import { User } from '../../src/app/models';
import { UserService } from '../../src/app/services/UserService';

describe('User Service', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  describe('User Creation', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'user' as const,
      };

      const user = await userService.create(userData);

      expect(user).toBeDefined();
      expect(user.name).toBe(userData.name);
      expect(user.email).toBe(userData.email);
      expect(user.password).not.toBe(userData.password); // Should be hashed
    });

    it('should throw error if user already exists', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'user' as const,
      };

      // Create user first time
      await userService.create(userData);

      // Try to create same user again
      await expect(userService.create(userData)).rejects.toThrow(
        'User already exists with this email'
      );
    });

    it('should validate email format', async () => {
      const userData = {
        name: 'John Doe',
        email: 'invalid-email',
        password: 'password123',
        role: 'user' as const,
      };

      await expect(userService.create(userData)).rejects.toThrow('Invalid email format');
    });

    it('should validate password length', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: '123', // Too short
        role: 'user' as const,
      };

      await expect(userService.create(userData)).rejects.toThrow(
        'Password must be at least 6 characters long'
      );
    });
  });

  describe('User Authentication', () => {
    beforeEach(async () => {
      // Create a test user
      await userService.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'user',
      });
    });

    it('should authenticate user with correct credentials', async () => {
      const user = await userService.authenticate('test@example.com', 'password123');

      expect(user).toBeDefined();
      expect(user?.email).toBe('test@example.com');
    });

    it('should return null for incorrect password', async () => {
      const user = await userService.authenticate('test@example.com', 'wrongpassword');

      expect(user).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const user = await userService.authenticate('nonexistent@example.com', 'password123');

      expect(user).toBeNull();
    });
  });

  describe('User Search', () => {
    beforeEach(async () => {
      // Create test users
      await userService.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'user',
      });

      await userService.create({
        name: 'Jane Smith',
        email: 'jane@example.com',
        password: 'password123',
        role: 'user',
      });
    });

    it('should search users by name', async () => {
      const users = await userService.searchUsers('John');

      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('John Doe');
    });

    it('should search users by email', async () => {
      const users = await userService.searchUsers('jane@');

      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('jane@example.com');
    });

    it('should return empty array for no matches', async () => {
      const users = await userService.searchUsers('nonexistent');

      expect(users).toHaveLength(0);
    });
  });

  describe('Data Transformation', () => {
    it('should transform user document to DTO', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'user' as const,
      };

      const user = await userService.create(userData);
      const dto = userService.transformToDTO(user);

      expect(dto).toHaveProperty('id');
      expect(dto).toHaveProperty('name', userData.name);
      expect(dto).toHaveProperty('email', userData.email);
      expect(dto).toHaveProperty('role', userData.role);
      expect(dto).toHaveProperty('isActive', true);
      expect(dto).toHaveProperty('createdAt');
      expect(dto).toHaveProperty('updatedAt');
      expect(dto).not.toHaveProperty('password'); // Should not include password
    });
  });
});

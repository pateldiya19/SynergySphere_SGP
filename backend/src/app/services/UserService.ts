import { BaseService } from '@/core/base';
import { UserDocument } from '@/app/models';
import { CreateUserDTO, UpdateUserDTO, UserResponseDTO } from '@/app/dto';
import { UserRepository } from '@/app/repositories';
import bcrypt from 'bcryptjs';

/**
 * User Service - Contains business logic for user operations
 * Implements validation, business rules, and data transformation
 */
export class UserService extends BaseService<UserDocument, CreateUserDTO, UpdateUserDTO> {
  private userRepository: UserRepository;

  constructor() {
    const userRepository = new UserRepository();
    super(userRepository);
    this.userRepository = userRepository;
  }

  /**
   * Create a new user with password hashing
   * @param data - User creation data
   * @returns Promise<UserDocument>
   */
  async create(data: CreateUserDTO): Promise<UserDocument> {
    await this.validate(data);

    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error('User already exists with this email');
    }

    return this.userRepository.create(data);
  }

  /**
   * Authenticate user with email and password
   * @param email - User email
   * @param password - User password
   * @returns Promise<UserDocument | null>
   */
  async authenticate(email: string, password: string): Promise<UserDocument | null> {
    const user = await this.userRepository.findByEmailWithPassword(email);
    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    // Update last seen
    await this.userRepository.updateLastSeen((user._id as any).toString());

    return user;
  }

  /**
   * Search users by query
   * @param query - Search query
   * @returns Promise<UserDocument[]>
   */
  async searchUsers(query: string): Promise<UserDocument[]> {
    return this.userRepository.searchUsers(query);
  }

  /**
   * Get active users
   * @returns Promise<UserDocument[]>
   */
  async getActiveUsers(): Promise<UserDocument[]> {
    return this.userRepository.findActiveUsers();
  }

  /**
   * Transform user document to response DTO
   * @param user - User document
   * @returns UserResponseDTO
   */
  transformToDTO(user: UserDocument): UserResponseDTO {
    return {
      id: (user._id as any).toString(),
      name: user.name,
      email: user.email,
      role: (user as any).role || 'user',
      avatar: (user as any).avatar,
      bio: (user as any).bio,
      skills: (user as any).skills || [],
      isActive: user.isActive,
      lastSeen: user.lastSeen,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Validate user data according to business rules
   * @param data - User data to validate
   */
  async validate(data: CreateUserDTO | UpdateUserDTO): Promise<void> {
    if ('email' in data && data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        throw new Error('Invalid email format');
      }
    }

    if ('password' in data && data.password) {
      if (data.password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }
    }

    if ('name' in data && data.name) {
      if (data.name.trim().length < 2) {
        throw new Error('Name must be at least 2 characters long');
      }
    }
  }

  /**
   * Build search filter for user queries
   * @param search - Search term
   * @returns Array of search conditions
   */
  buildSearchFilter(search: string): any[] {
    return [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { bio: { $regex: search, $options: 'i' } },
    ];
  }

  /**
   * Get populate fields for user queries
   * @returns Array of fields to populate
   */
  getPopulateFields(): string[] {
    return []; // Users don't typically need population
  }
}

import { BaseRepository } from '@/core/base';
import { User, UserDocument } from '@/app/models';

export class UserRepository extends BaseRepository<UserDocument> {
  constructor() {
    super(User);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.model.findOne({ email }).exec();
  }

  /**
   * Find user by email with password
   */
  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.model.findOne({ email }).select('+password').exec();
  }

  /**
   * Find active users
   */
  async findActiveUsers(): Promise<UserDocument[]> {
    return this.model.find({ isActive: true }).exec();
  }

  /**
   * Update last seen
   */
  async updateLastSeen(id: string): Promise<UserDocument | null> {
    return this.model.findByIdAndUpdate(id, { lastSeen: new Date() }, { new: true }).exec();
  }

  /**
   * Search users by name or email
   */
  async searchUsers(query: string): Promise<UserDocument[]> {
    return this.model
      .find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
        ],
        isActive: true,
      })
      .exec();
  }
}

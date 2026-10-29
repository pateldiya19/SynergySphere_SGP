import { BaseRepository } from '@/core/base';
import { Project, ProjectDocument } from '@/app/models';

export class ProjectRepository extends BaseRepository<ProjectDocument> {
  constructor() {
    super(Project);
  }

  /**
   * Find projects by owner ID
   */
  async findByOwner(ownerId: string): Promise<ProjectDocument[]> {
    return this.model.find({ ownerId }).populate('members.userId ownerId').exec();
  }

  /**
   * Find projects where user is a member
   */
  async findByMember(userId: string): Promise<ProjectDocument[]> {
    return this.model
      .find({
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
      })
      .populate('members.userId ownerId')
      .exec();
  }

  /**
   * Find projects by status
   */
  async findByStatus(status: string): Promise<ProjectDocument[]> {
    return this.model.find({ status }).populate('members.userId ownerId').exec();
  }

  /**
   * Search projects by title or description
   */
  async searchProjects(query: string): Promise<ProjectDocument[]> {
    return this.model
      .find({
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
        ],
      })
      .populate('members.userId ownerId')
      .exec();
  }

  /**
   * Add member to project
   */
  async addMember(
    projectId: string,
    userId: string,
    role: string = 'member'
  ): Promise<ProjectDocument | null> {
    return this.model
      .findByIdAndUpdate(
        projectId,
        {
          $addToSet: {
            members: { userId, role, joinedAt: new Date() },
          },
        },
        { new: true }
      )
      .populate('members.userId ownerId')
      .exec();
  }

  /**
   * Remove member from project
   */
  async removeMember(projectId: string, userId: string): Promise<ProjectDocument | null> {
    return this.model
      .findByIdAndUpdate(
        projectId,
        {
          $pull: {
            members: { userId },
          },
        },
        { new: true }
      )
      .populate('members.userId ownerId')
      .exec();
  }

  /**
   * Update project progress
   */
  async updateProgress(projectId: string, progress: number): Promise<ProjectDocument | null> {
    return this.model.findByIdAndUpdate(projectId, { progress }, { new: true }).exec();
  }
}

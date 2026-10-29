import { BaseRepository } from '@/core/base';
import { Task, TaskDocument } from '@/app/models';

export class TaskRepository extends BaseRepository<TaskDocument> {
  constructor() {
    super(Task);
  }

  /**
   * Find tasks by project ID
   */
  async findByProject(projectId: string): Promise<TaskDocument[]> {
    return this.model.find({ projectId }).populate('projectId assignedTo createdBy').exec();
  }

  /**
   * Find tasks assigned to user
   */
  async findByAssignee(assigneeId: string): Promise<TaskDocument[]> {
    return this.model
      .find({ assignedTo: assigneeId })
      .populate('projectId assignedTo createdBy')
      .exec();
  }

  /**
   * Find tasks by status
   */
  async findByStatus(status: string): Promise<TaskDocument[]> {
    return this.model.find({ status }).populate('projectId assignedTo createdBy').exec();
  }

  /**
   * Find overdue tasks
   */
  async findOverdue(): Promise<TaskDocument[]> {
    return this.model
      .find({
        dueDate: { $lt: new Date() },
        status: { $nin: ['completed', 'cancelled'] },
      })
      .populate('projectId assignedTo createdBy')
      .exec();
  }

  /**
   * Search tasks by title or description
   */
  async searchTasks(query: string): Promise<TaskDocument[]> {
    return this.model
      .find({
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
        ],
      })
      .populate('projectId assignedTo createdBy')
      .exec();
  }

  /**
   * Update task status
   */
  async updateStatus(taskId: string, status: string): Promise<TaskDocument | null> {
    return this.model
      .findByIdAndUpdate(taskId, { status, updatedAt: new Date() }, { new: true })
      .populate('projectId assignedTo createdBy')
      .exec();
  }

  /**
   * Get task statistics for project
   */
  async getProjectStats(projectId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  }> {
    const [stats] = await this.model.aggregate([
      { $match: { projectId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
        },
      },
    ]);

    return (
      stats || {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
      }
    );
  }
}

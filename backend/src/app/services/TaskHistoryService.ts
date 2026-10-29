import { TaskHistory, TaskHistoryDocument } from '@/models';
import { TaskHistoryType } from '@/types';
import { emitToProject, emitToTask } from '@/infrastructure/socket';

type HistoryInput = {
  taskId?: string;
  projectId: string;
  type: TaskHistoryType;
  source: 'user' | 'github' | 'system';
  description: string;
  actorId?: string;
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  metadata?: Record<string, unknown>;
};

export class TaskHistoryService {
  static async record(input: HistoryInput): Promise<TaskHistoryDocument> {
    const history = await TaskHistory.create(input);
    const payload = { taskId: input.taskId, projectId: input.projectId, activity: history };
    emitToProject(input.projectId, 'task:activity', payload);
    if (input.taskId) emitToTask(input.taskId, 'task:activity', payload);
    return history;
  }

  static listForTask(taskId: string): Promise<TaskHistoryDocument[]> {
    return TaskHistory.find({ taskId })
      .sort({ createdAt: 1 })
      .populate('actorId', 'name email')
      .lean() as unknown as Promise<TaskHistoryDocument[]>;
  }
}
